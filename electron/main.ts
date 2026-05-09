import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { promisify } from 'node:util'
import { app, BrowserWindow, dialog, ipcMain, shell, type OpenDialogOptions } from 'electron'
import { makeFingerprint, ProfileStore } from './store'
import type { BrowserProfile, BrowserRuntimeStatus, FingerprintMode, KernelType, ProfileDraft, RuntimeInfo, KernelInstallProgress } from './types'
import { hostOs } from './fingerprint'
import {
  KernelMissingError,
  assertLaunchableBrowser,
  browserCacheDirForRuntimeInfo,
  buildLaunchArgs,
  itbrowserSupported,
  kernelStatusMap,
  selectKernel
} from './kernel'
import { cancelInstall, installKernel, isInstalling } from './downloader'
import { ensureDirs, pluginsRoot } from './paths'

const isDev = !app.isPackaged
const execFileAsync = promisify(execFile)
let mainWindow: BrowserWindow | undefined
let store: ProfileStore
const profileProcesses = new Map<string, ChildProcess>()

function appLocale() {
  return app.getLocale().toLowerCase().startsWith('zh') ? 'zh' : 'en'
}

function message(en: string, zh: string) {
  return appLocale() === 'zh' ? zh : en
}

function fingerprintMode(): FingerprintMode {
  const mode = (process.env.AUTO_REGISTRY_FINGERPRINT_MODE || '').toLowerCase()
  if (mode === 'off' || mode === 'extension' || mode === 'itbrowser') return mode as FingerprintMode
  if (process.env.AUTO_REGISTRY_ENABLE_FINGERPRINT === '0') return 'off'
  if (process.env.AUTO_REGISTRY_ENABLE_FINGERPRINT === '1') return 'itbrowser'
  return 'extension'
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

function proxyUrl(profile: BrowserProfile) {
  return `http://${profile.proxy.host}:${profile.proxy.port}`
}

async function runtimeInfo(): Promise<RuntimeInfo> {
  return {
    hostOs: hostOs(),
    fingerprintMode: fingerprintMode(),
    fingerprintSpoofingEnabled: fingerprintSpoofingEnabled(),
    kernels: await kernelStatusMap(),
    itbrowserSupported: itbrowserSupported(),
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
  await execFileAsync('unzip', ['-q', '-o', zipPath, '-d', tempDir])

  const manifestDir = findManifestDir(tempDir)
  if (!manifestDir) {
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
      devTools: true
    }
  })

  if (isDev) {
    await mainWindow.loadURL('http://127.0.0.1:5173')
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    await mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

async function launchProfile(profile: BrowserProfile) {
  const existing = profileProcesses.get(profile.id)
  if (existing && !existing.killed) {
    await shell.showItemInFolder(profile.profilePath)
    return
  }

  const selection = await selectKernel(profile)
  assertLaunchableBrowser(selection.executable)

  const activePlugins = store.activePluginVersions(profile.enabledPluginIds)
  const args = buildLaunchArgs(profile, selection, activePlugins.map((plugin) => plugin.path), proxyUrl(profile))

  enableExtensionDeveloperMode(profile.profilePath)

  const child = spawn(selection.executable, args, {
    detached: true,
    stdio: 'ignore'
  })
  child.unref()
  profileProcesses.set(profile.id, child)
  child.on('exit', () => profileProcesses.delete(profile.id))
  store.markOpened(profile.id)
}

function stopProfile(profileId: string) {
  const child = profileProcesses.get(profileId)
  if (!child) return
  child.kill()
  profileProcesses.delete(profileId)
}

function emitKernelProgress(progress: KernelInstallProgress) {
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.webContents.send('kernel:progress', progress)
}

function serializeError(error: unknown) {
  if (error instanceof KernelMissingError) {
    return error.toJSON()
  }
  if (error instanceof Error) {
    return { message: error.message }
  }
  return { message: String(error) }
}

app.whenReady().then(async () => {
  ensureDirs()
  store = new ProfileStore()

  ipcMain.handle('profiles:list', () => store.list())
  ipcMain.handle('profiles:save', (_event, draft: ProfileDraft) => store.upsert(draft))
  ipcMain.handle('profiles:remove', (_event, id: string) => store.remove(id))
  ipcMain.handle('profiles:duplicate', (_event, id: string) => store.duplicate(id))
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
  ipcMain.handle('plugins:list', () => store.listPlugins())
  ipcMain.handle('plugins:importZip', () => importPluginZip())
  ipcMain.handle('plugins:setActiveVersion', (_event, pluginId: string, versionId: string) => store.setActivePluginVersion(pluginId, versionId))
  ipcMain.handle('plugins:remove', (_event, pluginId: string) => store.removePlugin(pluginId))
  ipcMain.handle('runtime:info', () => runtimeInfo())

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

app.on('activate', () => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    void createMainWindow()
  }
})
