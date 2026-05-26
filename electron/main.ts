import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { spawn, type ChildProcess } from 'node:child_process'
import { app, BrowserWindow, dialog, ipcMain, shell, type OpenDialogOptions } from 'electron'
import { extractFull } from 'node-7z'
import sevenBin from '7zip-bin'
import { makeFingerprint, ProfileStore } from './store'
import type { BrowserCrashEvent, BrowserProfile, BrowserRuntimeStatus, FingerprintMode, KernelType, ProfileDraft, Proxy, ProxyDraft, RuntimeInfo, KernelInstallProgress, Script, ScriptDraft } from './types'
import { hostOs } from './fingerprint'
import {
  KernelMissingError,
  assertLaunchableBrowser,
  browserCacheDirForRuntimeInfo,
  buildLaunchArgs,
  cloakSupported,
  itbrowserSupported,
  kernelStatusMap,
  selectKernel
} from './kernel'
import { cancelInstall, installKernel, isInstalling } from './downloader'
import { ensureDirs, pluginsRoot } from './paths'
import { ScriptStore } from './scripts/store'
import { ScriptRuntimeManager, ProfileBusyError, type ScriptRuntimeEvent } from './scripts/runtime'
import { runStartupJanitor } from './scripts/janitor'
import { testProxy } from './proxyTest'
import { testProxy as testProxyV2 } from './proxies/test'
import type { ProxyAuthCredentials } from './proxyAuth'
import { ProxyStore } from './proxies/store'
import { parseProxyBatch } from './proxies/parser'
import { ProfileIdTakenError, InvalidProfileIdError } from './store'
import { waitForDevToolsEndpoint } from './scripts/cdp'

const isDev = !app.isPackaged
let mainWindow: BrowserWindow | undefined
let store: ProfileStore
let proxyStore: ProxyStore
let scriptStore: ScriptStore
let scriptRuntime: ScriptRuntimeManager
const profileProcesses = new Map<string, ChildProcess>()
const STDERR_TAIL_LIMIT = 8 * 1024 // 8KB of recent stderr per profile, cheap and enough for stack traces

function appLocale() {
  return app.getLocale().toLowerCase().startsWith('zh') ? 'zh' : 'en'
}

function message(en: string, zh: string) {
  return appLocale() === 'zh' ? zh : en
}

function fingerprintMode(): FingerprintMode {
  const mode = (process.env.AUTO_REGISTRY_FINGERPRINT_MODE || '').toLowerCase()
  if (mode === 'off' || mode === 'extension' || mode === 'stealth' || mode === 'cloak' || mode === 'itbrowser') return mode as FingerprintMode
  if (process.env.AUTO_REGISTRY_ENABLE_FINGERPRINT === '0') return 'off'
  if (process.env.AUTO_REGISTRY_ENABLE_FINGERPRINT === '1') return 'itbrowser'
  // 默认 = stealth(全平台最强反检测,A 路线)。Phase 3 接 SettingsStore 后用户可在 UI 切到 cloak/itbrowser。
  return 'stealth'
}

function fingerprintSpoofingEnabled() {
  return fingerprintMode() !== 'off'
}

function runtimeStatus(): BrowserRuntimeStatus[] {
  return store.list().map((profile) => ({
    profileId: profile.id,
    running: Boolean(profileProcesses.get(profile.id) && !profileProcesses.get(profile.id)?.killed)
  }))
}

function resolveProxy(profile: BrowserProfile): Proxy | undefined {
  // proxyId === null 是用户显式选择"无代理 / 走系统网络"。
  // proxyId === string 但 ProxyStore 里查不到 → 数据漂移(代理被删了 profile 没更),
  // 退回无代理而不是用残留 inline 字段——后者会让"已删除的代理"重新生效。
  if (!profile.proxyId) return undefined
  return proxyStore.get(profile.proxyId)
}

function proxyUrlForLaunch(proxy: Proxy | undefined): string | undefined {
  if (!proxy) return undefined
  // Chromium --proxy-server 接受 http / https / socks4 / socks5 四种 scheme,
  // 与 ProxyStore 的 ProxyScheme 完全一致,直接拼即可。
  return `${proxy.scheme}://${proxy.host}:${proxy.port}`
}

function proxyAuthFor(proxy: Proxy | undefined): ProxyAuthCredentials | undefined {
  if (!proxy || !proxy.username || !proxy.password) return undefined
  return {
    host: proxy.host,
    port: proxy.port,
    username: proxy.username,
    password: proxy.password
  }
}

async function runtimeInfo(): Promise<RuntimeInfo> {
  return {
    hostOs: hostOs(),
    hostArch: process.arch === 'arm64' ? 'arm64' : process.arch === 'x64' ? 'x64' : 'unknown',
    fingerprintMode: fingerprintMode(),
    fingerprintSpoofingEnabled: fingerprintSpoofingEnabled(),
    kernels: await kernelStatusMap(),
    itbrowserSupported: itbrowserSupported(),
    cloakSupported: cloakSupported(),
    managedBrowserCacheDir: browserCacheDirForRuntimeInfo()
  }
}

function mergeRecord(target: Record<string, unknown>, patch: Record<string, unknown>) {
  for (const [key, value] of Object.entries(patch)) {
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      target[key] &&
      typeof target[key] === 'object' &&
      !Array.isArray(target[key])
    ) {
      mergeRecord(target[key] as Record<string, unknown>, value as Record<string, unknown>)
    } else {
      target[key] = value
    }
  }
}

function enableExtensionDeveloperMode(profilePath: string) {
  const defaultProfilePath = path.join(profilePath, 'Default')
  const preferencesPath = path.join(defaultProfilePath, 'Preferences')
  const initialPreferencesPath = path.join(profilePath, 'initial_preferences')
  const masterPreferencesPath = path.join(profilePath, 'master_preferences')
  fs.mkdirSync(defaultProfilePath, { recursive: true })

  let preferences: Record<string, unknown> = {}
  if (fs.existsSync(preferencesPath)) {
    try {
      preferences = JSON.parse(fs.readFileSync(preferencesPath, 'utf8')) as Record<string, unknown>
    } catch {
      preferences = {}
    }
  }

  mergeRecord(preferences, {
    extensions: {
      ui: {
        developer_mode: true
      }
    },
    'extensions.ui.developer_mode': true
  })

  fs.writeFileSync(preferencesPath, JSON.stringify(preferences, null, 2))
  fs.writeFileSync(initialPreferencesPath, JSON.stringify(preferences, null, 2))
  fs.writeFileSync(masterPreferencesPath, JSON.stringify(preferences, null, 2))
}

function findManifestDir(root: string): string | undefined {
  const entries = fs.readdirSync(root, { withFileTypes: true })
  if (entries.some((entry) => entry.isFile() && entry.name === 'manifest.json')) {
    return root
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const found = findManifestDir(path.join(root, entry.name))
    if (found) return found
  }
  return undefined
}

async function importPluginZip() {
  const dialogOptions: OpenDialogOptions = {
    title: message('Select extension ZIP', '选择插件 ZIP'),
    properties: ['openFile'],
    filters: [{ name: 'Chrome Extension ZIP', extensions: ['zip'] }]
  }
  const result = mainWindow
    ? await dialog.showOpenDialog(mainWindow, dialogOptions)
    : await dialog.showOpenDialog(dialogOptions)
  if (result.canceled || !result.filePaths[0]) return undefined

  const zipPath = result.filePaths[0]
  const pluginRoot = pluginsRoot()
  const tempDir = path.join(os.tmpdir(), `auto-registry-plugin-${Date.now()}`)
  fs.mkdirSync(tempDir, { recursive: true })
  fs.mkdirSync(pluginRoot, { recursive: true })

  try {
    await new Promise<void>((resolve, reject) => {
      const stream = extractFull(zipPath, tempDir, { $bin: sevenBin.path7za })
      stream.on('end', () => resolve())
      stream.on('error', (error: Error) => reject(error))
    })
  } catch (error) {
    try { fs.rmSync(tempDir, { recursive: true, force: true }) } catch {}
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(message(`Failed to extract ZIP: ${reason}`, `解压 ZIP 失败：${reason}`))
  }

  const manifestDir = findManifestDir(tempDir)
  if (!manifestDir) {
    try { fs.rmSync(tempDir, { recursive: true, force: true }) } catch {}
    throw new Error(message(
      'manifest.json was not found in the ZIP. Please confirm this is a Chrome extension package.',
      'ZIP 中没有找到 manifest.json，请确认这是 Chrome 扩展插件包'
    ))
  }

  const manifest = JSON.parse(fs.readFileSync(path.join(manifestDir, 'manifest.json'), 'utf8')) as {
    name?: string
    version?: string
    description?: string
    manifest_version?: number
  }
  const name = manifest.name?.trim() || path.basename(zipPath, '.zip')
  const version = manifest.version?.trim() || '0.0.0'
  const targetDir = path.join(pluginRoot, `${name.replace(/[^a-z0-9._-]+/gi, '_')}-${version}-${Date.now().toString(36)}`)
  fs.cpSync(manifestDir, targetDir, { recursive: true })
  try { fs.rmSync(tempDir, { recursive: true, force: true }) } catch {}

  return store.addPluginVersion({
    name,
    version,
    description: manifest.description,
    manifestVersion: manifest.manifest_version,
    optionsPage: (manifest as { options_ui?: { page?: string }; options_page?: string }).options_ui?.page || (manifest as { options_page?: string }).options_page,
    popupPage: (manifest as { action?: { default_popup?: string }; browser_action?: { default_popup?: string } }).action?.default_popup || (manifest as { browser_action?: { default_popup?: string } }).browser_action?.default_popup,
    sourceZip: zipPath,
    path: targetDir
  })
}

async function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1080,
    minHeight: 700,
    backgroundColor: '#f3f0ea',
    title: 'Auto Registry',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      devTools: isDev
    }
  })

  if (isDev) {
    await mainWindow.loadURL('http://127.0.0.1:5173')
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    await mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

function rememberStderr(buffers: string[], chunk: Buffer) {
  buffers.push(chunk.toString('utf8'))
  let total = buffers.reduce((acc, piece) => acc + piece.length, 0)
  while (total > STDERR_TAIL_LIMIT && buffers.length > 1) {
    const removed = buffers.shift()!
    total -= removed.length
  }
}

function emitCrash(event: BrowserCrashEvent) {
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.webContents.send('profiles:crashed', event)
}

/**
 * 判断 profile 是否从未被浏览器启动过。Chromium 第一次启动时会创建
 * `<user-data-dir>/Default` 子目录；下次启动该目录已存在。这是比 `lastOpenedAt` 更
 * 准确的"首次"信号——用户清空浏览器数据后能重新触发 startUrl。
 */
function isFirstLaunch(profile: BrowserProfile): boolean {
  const defaultDir = path.join(profile.profilePath, 'Default')
  return !fs.existsSync(defaultDir)
}

async function launchProfile(profile: BrowserProfile, options: { openStartUrl?: boolean } = {}) {
  const existing = profileProcesses.get(profile.id)
  if (existing && !existing.killed) {
    await shell.showItemInFolder(profile.profilePath)
    return
  }

  const selection = await selectKernel(profile, fingerprintMode())
  assertLaunchableBrowser(selection.executable)

  const activePlugins = store.activePluginVersions(profile.enabledPluginIds)

  // startUrl 仅在 profile 首次启动时打开（且调用方没显式禁用）。这是产品语义：
  // 启动网址只用来引导新环境的初始登录页，之后浏览器会恢复上次状态，不再被强制跳转。
  const wantsStartUrl = options.openStartUrl !== false
  const initialUrl = wantsStartUrl && profile.startUrl && isFirstLaunch(profile)
    ? profile.startUrl
    : undefined

  const proxy = resolveProxy(profile)
  const args = buildLaunchArgs(
    profile,
    selection,
    activePlugins.map((plugin) => plugin.path),
    proxyUrlForLaunch(proxy),
    { initialUrl, proxyAuth: proxyAuthFor(proxy) }
  )

  enableExtensionDeveloperMode(profile.profilePath)

  // 清掉上一次浏览器残留的 DevToolsActivePort：Chromium 被 SIGKILL 或应用异常退出时
  // 不会清它，而脚本子系统依赖这个文件找 CDP 端口——留着旧值会让 puppeteer 连到已死的端口。
  const stalePortFile = path.join(profile.profilePath, 'DevToolsActivePort')
  try { fs.rmSync(stalePortFile, { force: true }) } catch {}

  // detached keeps the browser alive if the app is killed, but we still want to read stderr while we're around.
  const child = spawn(selection.executable, args, {
    detached: true,
    stdio: ['ignore', 'ignore', 'pipe']
  })
  const stderrBuffers: string[] = []
  child.stderr?.on('data', (chunk: Buffer) => rememberStderr(stderrBuffers, chunk))
  child.stderr?.on('error', () => { /* ignore; process dying can surface EPIPE here */ })

  // prevent the pipe from keeping the event loop alive; still allowed to buffer data
  child.unref()

  profileProcesses.set(profile.id, child)
  const startedAt = Date.now()
  child.on('exit', (code, signal) => {
    profileProcesses.delete(profile.id)
    const uptimeMs = Date.now() - startedAt
    // SIGTERM from our own stopProfile or normal close — no need to shout
    const userStopped = signal === 'SIGTERM' || signal === 'SIGKILL'
    const crashed = !userStopped && (code !== 0 || uptimeMs < 3000)
    if (crashed) {
      emitCrash({
        profileId: profile.id,
        exitCode: code,
        signal,
        stderrTail: stderrBuffers.join('').slice(-STDERR_TAIL_LIMIT) || undefined
      })
    }
  })
  child.on('error', (error) => {
    profileProcesses.delete(profile.id)
    emitCrash({
      profileId: profile.id,
      exitCode: null,
      signal: null,
      stderrTail: error.message
    })
  })
  store.markOpened(profile.id)
}

function stopProfile(profileId: string) {
  const child = profileProcesses.get(profileId)
  if (!child) return
  child.kill()
  profileProcesses.delete(profileId)
}

/**
 * 给脚本子系统用：确保 profile 浏览器已运行，并返回一个可被 puppeteer.connect 的 endpoint。
 * 如果 profile 已在跑就直接复用；否则 launchProfile 之后再等 CDP 就绪。
 *
 * 故意不合并进 launchProfile：GUI 的启动动作不应等 CDP（否则"点启动"到弹窗之间会有额外停顿），
 * 而脚本子系统本来就需要串行等待。
 *
 * 健壮性：Chromium 异常退出时 DevToolsActivePort 不会被清，下次 run 可能读到旧端口。
 * launchProfile 会在 spawn 前删这个文件，此外若我们已知 profile 正在跑但依然要脚本启动，
 * 也会做一次校验式握手（这里通过"再 launch 一次"覆盖所有 stale 场景）。
 */
async function ensureProfileRunningForScript(profile: BrowserProfile): Promise<string> {
  const existing = profileProcesses.get(profile.id)
  if (!existing || existing.killed) {
    // 脚本启动浏览器**不**带 startUrl：脚本作者完全自己控制导航，初始 URL 会和
    // page.goto() 抢同一个 tab。即使是 profile 首次启动（按"仅首次"规则本来会带
    // startUrl），脚本路径也强制关掉。
    await launchProfile(profile, { openStartUrl: false })
  }
  const endpoint = await waitForDevToolsEndpoint(profile.profilePath, { timeoutMs: 20_000 })
  return endpoint.webSocketDebuggerUrl
}

function emitKernelProgress(progress: KernelInstallProgress) {
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.webContents.send('kernel:progress', progress)
}

function serializeError(error: unknown) {
  if (error instanceof KernelMissingError) {
    return error.toJSON()
  }
  if (error instanceof ProfileBusyError) {
    return error.toJSON()
  }
  if (error instanceof ProfileIdTakenError) {
    return error.toJSON()
  }
  if (error instanceof InvalidProfileIdError) {
    return error.toJSON()
  }
  if (error instanceof Error) {
    return { message: error.message }
  }
  return { message: String(error) }
}

app.whenReady().then(async () => {
  ensureDirs()
  // 启动自检：清掉上次会话的孤儿脚本子进程 + Chromium SingletonLock 残留。
  // 主进程被 SIGKILL / 断电 / dev 重启时这些痕迹清不掉，会导致下次启动浏览器卡住。
  await runStartupJanitor()
  proxyStore = new ProxyStore()
  store = new ProfileStore(proxyStore)
  scriptStore = new ScriptStore()
  scriptRuntime = new ScriptRuntimeManager(scriptStore)
  scriptRuntime.on('event', (event: ScriptRuntimeEvent) => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    mainWindow.webContents.send('scripts:event', event)
  })

  ipcMain.handle('profiles:list', () => store.list())
  // profiles:save 返回 { ok, profile?, error? }:
  // - ok=true → 成功路径,profile 字段是新建/编辑后的 BrowserProfile
  // - ok=false + code='PROFILE_ID_TAKEN' / 'INVALID_PROFILE_ID' → 渲染层友好提示
  // 改用结构化返回是因为新增的 id 校验会触发 error code,渲染层需要按 code 分支提示。
  ipcMain.handle('profiles:save', (_event, draft: ProfileDraft) => {
    try {
      const profile = store.upsert(draft)
      return { ok: true as const, profile }
    } catch (error) {
      return { ok: false as const, error: serializeError(error) }
    }
  })
  ipcMain.handle('profiles:remove', async (_event, id: string) => {
    const profile = store.get(id)
    const running = profileProcesses.get(id)
    if (running && !running.killed) {
      running.kill()
      profileProcesses.delete(id)
      // give Chromium a moment to release its file locks so the rm won't fight SingletonLock
      await new Promise((resolve) => setTimeout(resolve, 300))
    }
    store.remove(id)
    if (profile?.profilePath) {
      try {
        fs.rmSync(profile.profilePath, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 })
      } catch (error) {
        console.error('[profiles:remove] failed to delete profile dir', profile.profilePath, error)
      }
    }
  })
  ipcMain.handle('profiles:duplicate', (_event, id: string) => {
    const source = store.get(id)
    if (!source) throw new Error(message('Profile not found', '环境不存在'))
    const running = profileProcesses.get(id)
    if (running && !running.killed) {
      throw new Error(message(
        'Stop the source environment before duplicating it.',
        '请先停止源环境再复制，避免拷贝运行中被锁的文件。'
      ))
    }
    const next = store.duplicate(id)
    if (fs.existsSync(source.profilePath)) {
      fs.cpSync(source.profilePath, next.profilePath, {
        recursive: true,
        force: true,
        errorOnExist: false,
        dereference: false,
        filter: (src) => {
          const base = path.basename(src)
          // Skip Chromium runtime lock and singleton files; they are recreated on launch.
          if (base === 'SingletonLock' || base === 'SingletonCookie' || base === 'SingletonSocket') return false
          if (base === 'lockfile') return false
          return true
        }
      })
    }
    return next
  })
  ipcMain.handle('profiles:randomFingerprint', (_event, targetOs?: string) => makeFingerprint(undefined, targetOs as never))
  ipcMain.handle('profiles:status', () => runtimeStatus())
  ipcMain.handle('profiles:launch', async (_event, id: string) => {
    const profile = store.get(id)
    if (!profile) throw new Error('Profile not found')
    try {
      await launchProfile(profile)
      return { ok: true }
    } catch (error) {
      return { ok: false, error: serializeError(error) }
    }
  })
  ipcMain.handle('profiles:stop', (_event, id: string) => stopProfile(id))
  // 代理连通性检测：直接在主进程跑 CONNECT 测试，不开浏览器 / 不污染 profile。
  // 用户在 ProfileFormDialog 里点"测试"按钮时调用。
  ipcMain.handle('proxy:test', (_event, config: { host: string; port: number; username?: string; password?: string }) =>
    testProxy(config)
  )

  // —— proxies subsystem (ProxyStore) ——————————————————————————
  ipcMain.handle('proxies:list', () => proxyStore.list())
  ipcMain.handle('proxies:save', (_event, draft: ProxyDraft) => proxyStore.upsert(draft))
  ipcMain.handle('proxies:remove', (_event, id: string) => proxyStore.remove(id))
  ipcMain.handle('proxies:bulkImport', (_event, text: string) => {
    const parsed = parseProxyBatch(text)
    const { created, reused } = proxyStore.bulkUpsert(parsed.ok.map((entry) => entry.draft))
    return { created, reused, failed: parsed.failed }
  })
  // 测试 ProxyStore 条目 —— 与老 proxy:test 不同点:
  //   1. 走 proxies/test.ts (含 ipinfo geo + scheme 感知)
  //   2. 测试完成自动写回 lastTest 快照,UI 表格直接读
  ipcMain.handle('proxies:test', async (_event, id: string) => {
    const proxy = proxyStore.get(id)
    if (!proxy) return { ok: false as const, error: 'Proxy not found' }
    const snapshot = await testProxyV2({
      scheme: proxy.scheme,
      host: proxy.host,
      port: proxy.port,
      username: proxy.username,
      password: proxy.password
    })
    proxyStore.recordTest(id, snapshot)
    return { ok: true as const, snapshot }
  })
  ipcMain.handle('plugins:list', () => store.listPlugins())
  ipcMain.handle('plugins:importZip', () => importPluginZip())
  ipcMain.handle('plugins:setActiveVersion', (_event, pluginId: string, versionId: string) => store.setActivePluginVersion(pluginId, versionId))
  ipcMain.handle('plugins:remove', (_event, pluginId: string) => {
    const plugin = store.listPlugins().find((item) => item.id === pluginId)
    store.removePlugin(pluginId)
    if (!plugin) return
    for (const version of plugin.versions) {
      if (!version.path) continue
      try {
        fs.rmSync(version.path, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 })
      } catch (error) {
        console.error('[plugins:remove] failed to delete plugin dir', version.path, error)
      }
    }
  })
  ipcMain.handle('runtime:info', () => runtimeInfo())

  // —— scripts subsystem ————————————————————————————————————————
  ipcMain.handle('scripts:list', () => scriptStore.list())
  ipcMain.handle('scripts:listRuns', () => scriptStore.listRuns())
  ipcMain.handle('scripts:activeRuns', () => scriptRuntime.listActive())
  ipcMain.handle('scripts:activeByProfile', (_event, profileId: string) =>
    scriptRuntime.getActiveByProfile(profileId)
  )
  ipcMain.handle('scripts:save', (_event, draft: ScriptDraft): Script => scriptStore.upsert(draft))
  ipcMain.handle('scripts:remove', (_event, id: string) => {
    // 杀掉该脚本所有活跃 run，再删
    for (const run of scriptRuntime.listActive()) {
      if (run.scriptId === id) void scriptRuntime.stop(run.id)
    }
    scriptStore.remove(id)
  })
  ipcMain.handle('scripts:readSource', (_event, id: string) => scriptStore.readSource(id))
  ipcMain.handle('scripts:writeSource', (_event, id: string, source: string) => scriptStore.writeSource(id, source))
  ipcMain.handle('scripts:run', async (_event, scriptId: string, profileId: string) => {
    const script = scriptStore.get(scriptId)
    if (!script) throw new Error(`Script not found: ${scriptId}`)

    try {
      // global-scope 脚本不需要 profile,profileId 参数被忽略;profile-scope 走原路径。
      // 渲染层的 ScriptRunPanel 会根据 script.scope 决定是否传 profileId,但即便错传
      // 这里也安全 —— 后端不依赖那个值。
      if (script.scope === 'global') {
        const run = await scriptRuntime.start({
          script,
          profile: null,
          webSocketDebuggerUrl: null,
          triggeredBy: 'manual'
        })
        return { ok: true as const, run }
      }

      const profile = store.get(profileId)
      if (!profile) throw new Error(`Profile not found: ${profileId}`)
      const webSocketDebuggerUrl = await ensureProfileRunningForScript(profile)
      const run = await scriptRuntime.start({
        script,
        profile,
        webSocketDebuggerUrl,
        triggeredBy: 'manual'
      })
      return { ok: true as const, run }
    } catch (error) {
      return { ok: false as const, error: serializeError(error) }
    }
  })
  ipcMain.handle('scripts:stop', async (_event, runId: string) => {
    await scriptRuntime.stop(runId)
  })
  ipcMain.handle('scripts:stopAll', async () => {
    await scriptRuntime.stopAll()
  })
  ipcMain.handle('scripts:pickExternalFile', async () => {
    const dialogOptions: OpenDialogOptions = {
      title: message('Select script file', '选择脚本文件'),
      properties: ['openFile'],
      filters: [{ name: 'Script', extensions: ['ts', 'tsx', 'js', 'jsx', 'mts', 'cts'] }]
    }
    const result = mainWindow
      ? await dialog.showOpenDialog(mainWindow, dialogOptions)
      : await dialog.showOpenDialog(dialogOptions)
    if (result.canceled || !result.filePaths[0]) return undefined
    return result.filePaths[0]
  })
  ipcMain.handle('scripts:revealInFinder', (_event, filePath: string) => {
    shell.showItemInFolder(filePath)
  })

  ipcMain.handle('kernel:status', () => kernelStatusMap())
  ipcMain.handle('kernel:install', async (_event, kernel: KernelType) => {
    if (isInstalling(kernel)) return { ok: true, alreadyRunning: true }
    try {
      await installKernel(kernel, emitKernelProgress)
      return { ok: true }
    } catch (error) {
      return { ok: false, error: serializeError(error) }
    }
  })
  ipcMain.handle('kernel:cancel', (_event, kernel: KernelType) => {
    cancelInstall(kernel)
    return { ok: true }
  })

  await createMainWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

/**
 * 优雅关闭所有由本应用启动的 Chromium 子进程。
 *
 * 设计:
 * - 先 SIGTERM(Windows 上是 child.kill() 默认 SIGTERM 模拟),给 Chromium 一个机会
 *   走完落盘 cookie/state 的流程
 * - 平行等所有子进程 exit,最长 GRACEFUL_MS;超时后对仍存活的发 SIGKILL
 * - 最后清空 profileProcesses,让重复调用幂等
 *
 * 之所以不复用 spawn 的 'exit' 事件做计数:那个 listener 在主进程里被 detached + unref
 * 的子进程是否触发,跨平台行为不一致。这里直接用 Promise + setTimeout 自己控时序更稳。
 */
async function terminateAllProfileBrowsers(): Promise<void> {
  const GRACEFUL_MS = 2500
  const entries = Array.from(profileProcesses.values()).filter((child) => !child.killed)
  if (entries.length === 0) return

  const waiters = entries.map((child) => new Promise<void>((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolve()
      return
    }
    let settled = false
    const done = () => {
      if (settled) return
      settled = true
      resolve()
    }
    child.once('exit', done)
    try { child.kill('SIGTERM') } catch { done() }
    setTimeout(() => {
      if (settled) return
      try { child.kill('SIGKILL') } catch {}
      // SIGKILL 会很快触发 exit;万一没触发,再给一小段时间然后强制 resolve
      setTimeout(done, 200)
    }, GRACEFUL_MS)
  }))

  await Promise.all(waiters)
  profileProcesses.clear()
}

// 应用准备退出:先杀脚本子进程(自身已实现 graceful shutdown),再杀所有 profile 浏览器,
// 全部干净后才让 Electron 真正退出。preventDefault + app.exit() 是 Electron 推荐的
// "异步等待清理"模式。
let isQuitting = false
app.on('before-quit', (event) => {
  if (isQuitting) return
  event.preventDefault()
  isQuitting = true
  void (async () => {
    try {
      await Promise.all([
        scriptRuntime?.shutdown() ?? Promise.resolve(),
        terminateAllProfileBrowsers()
      ])
    } catch (error) {
      console.error('[main] cleanup before quit failed:', error)
    } finally {
      app.exit(0)
    }
  })()
})

app.on('activate', () => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    void createMainWindow()
  }
})
