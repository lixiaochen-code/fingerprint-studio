import fs from 'node:fs'
import path from 'node:path'
import { Browser, getInstalledBrowsers, getVersionComparator } from '@puppeteer/browsers'
import type { BrowserProfile, FingerprintMode, HostOs, KernelStatus, KernelStatusMap, KernelType, TargetOs } from './types'
import { ensureFingerprintExtension, fingerprintSeed, hostOs, writeFingerprintPayload, alignUserAgentWithKernel } from './fingerprint'
import { ensureProxyAuthExtension } from './proxyAuth'
import { browsersRoot, chromiumCacheDir, cloakRoot, configuredBrowserPath, itbrowserRoot, legacyBrowsersDir } from './paths'

export class KernelMissingError extends Error {
  readonly code = 'KERNEL_MISSING'
  constructor(readonly kernel: KernelType, message: string) {
    super(message)
    this.name = 'KernelMissingError'
  }

  toJSON() {
    return { code: this.code, kernel: this.kernel, message: this.message }
  }
}

function dirSizeMB(dir: string) {
  let total = 0
  const stack: string[] = [dir]
  while (stack.length) {
    const current = stack.pop()!
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(current, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      const next = path.join(current, entry.name)
      if (entry.isDirectory()) {
        stack.push(next)
      } else if (entry.isFile()) {
        try {
          total += fs.statSync(next).size
        } catch {}
      }
    }
  }
  return Math.round(total / (1024 * 1024))
}

async function chromiumStatus(): Promise<KernelStatus> {
  const overridePath = configuredBrowserPath()
  if (overridePath && fs.existsSync(overridePath)) {
    return { type: 'chromium', installed: true, path: overridePath }
  }
  for (const cacheDir of [chromiumCacheDir(), legacyBrowsersDir()]) {
    if (!fs.existsSync(cacheDir)) continue
    try {
      const installed = await getInstalledBrowsers({ cacheDir })
      const usable = installed.filter((browser) =>
        (browser.browser === Browser.CHROMIUM || browser.browser === Browser.CHROME)
        && fs.existsSync(browser.executablePath)
      )
      if (!usable.length) continue

      // Each browser family has its own version comparator; mixing them in one sort is unsafe.
      const byFamily = new Map<Browser, typeof usable>()
      for (const browser of usable) {
        const list = byFamily.get(browser.browser) ?? []
        list.push(browser)
        byFamily.set(browser.browser, list)
      }

      // Prefer Chrome (Chrome for Testing — new install path) over Chromium snapshots
      // (legacy install path with hard-coded build ID). Old Chromium 123 binaries
      // still on disk would otherwise win the version sort within their own family
      // and bypass the upgrade to a Turnstile-supported version (>= v146).
      const preferenceOrder: Browser[] = [Browser.CHROME, Browser.CHROMIUM]
      let found: typeof usable[number] | undefined
      for (const family of preferenceOrder) {
        const list = byFamily.get(family)
        if (!list?.length) continue
        const comparator = getVersionComparator(family)
        list.sort((a, b) => comparator(b.buildId, a.buildId))
        found = list[0]
        break
      }

      if (found) {
        return {
          type: 'chromium',
          installed: true,
          path: found.executablePath,
          version: found.buildId,
          sizeMB: dirSizeMB(path.dirname(found.executablePath))
        }
      }
    } catch (error) {
      console.error('[kernel] chromiumStatus scan failed for', cacheDir, error)
    }
  }
  return { type: 'chromium', installed: false }
}

function itbrowserExecutable() {
  const root = itbrowserRoot()
  const candidates = [
    path.join(root, 'extracted', 'Chrome-bin', 'chrome.exe'),
    path.join(root, 'Chrome-bin', 'chrome.exe'),
    path.join(legacyBrowsersDir(), 'itbrowser', 'extracted', 'Chrome-bin', 'chrome.exe')
  ]
  return candidates.find((candidate) => fs.existsSync(candidate))
}

function itbrowserStatus(): KernelStatus {
  const exe = itbrowserExecutable()
  if (!exe) return { type: 'itbrowser', installed: false }
  let version: string | undefined
  try {
    const dictDir = path.dirname(exe)
    const versionDir = fs.readdirSync(dictDir).find((name) => /^\d+\./.test(name))
    if (versionDir) version = versionDir
  } catch {}
  return {
    type: 'itbrowser',
    installed: true,
    path: exe,
    version,
    sizeMB: dirSizeMB(path.dirname(exe))
  }
}

export function cloakSupported(host: HostOs = hostOs()) {
  return host === 'linux' || host === 'win32'
}

function cloakExecutableCandidates(): string[] {
  const root = cloakRoot()
  const host = hostOs()
  const exeName = host === 'win32' ? 'chrome.exe' : 'chrome'
  return [
    path.join(root, 'cloakbrowser', exeName),
    path.join(root, 'cloakbrowser', 'chrome'),
    path.join(root, 'cloakbrowser', exeName.replace('chrome', 'cloak-chromium')),
    path.join(root, exeName),
    path.join(root, 'chrome')
  ]
}

function cloakExecutable() {
  return cloakExecutableCandidates().find((candidate) => fs.existsSync(candidate))
}

function cloakStatus(): KernelStatus {
  const exe = cloakExecutable()
  if (!exe) return { type: 'cloak', installed: false }
  let version: string | undefined
  try {
    const versionFile = path.join(cloakRoot(), 'VERSION')
    if (fs.existsSync(versionFile)) version = fs.readFileSync(versionFile, 'utf8').trim()
  } catch {}
  return {
    type: 'cloak',
    installed: true,
    path: exe,
    version,
    sizeMB: dirSizeMB(path.dirname(exe))
  }
}

export async function kernelStatusMap(): Promise<KernelStatusMap> {
  return {
    chromium: await chromiumStatus(),
    cloak: cloakStatus(),
    itbrowser: itbrowserStatus()
  }
}

export function itbrowserSupported(host: HostOs = hostOs()) {
  return host === 'win32'
}

export type KernelSelection = {
  type: KernelType
  executable: string
  mode: 'native' | 'cloak' | 'extension' | 'stealth' | 'off'
  /**
   * 真实安装的 kernel 版本(Chrome for Testing 是 "149.0.7827.22" 这种语义版本,
   * Chromium 老快照是纯数字 build id)。启动时用它把 profile.fingerprint.userAgent
   * 里的 Chrome 版本段对齐到真实版本 —— 否则 Turnstile 拿 UA vs 真实内核交叉校验
   * 直接判 bot;即便不查 client hints,光看 UA 数字也会被卡 < v146 门槛。
   */
  version?: string
}

/**
 * 三轨反检测的择路:
 * - mode='itbrowser' + 宿主支持 + 已装 → itbrowser
 * - mode='cloak' + 宿主支持 + 已装 → cloak
 * - mode='stealth' / 'extension' → chromium + 对应 inject(stealth 是完整 patch 套件,
 *   extension 是 legacy 快速回滚通道)
 * - mode='off' → 裸 chromium,不挂任何 inject 扩展
 *
 * 注:即使 mode 偏好 itbrowser/cloak,但宿主或内核不可用时会自动 fallback 到 chromium +
 * stealth,而不是直接 throw。脚本子系统已假设浏览器一定能启动。
 */
export async function selectKernel(profile: BrowserProfile, mode: FingerprintMode = 'stealth'): Promise<KernelSelection> {
  const host = hostOs()
  const status = await kernelStatusMap()
  const target: TargetOs = profile.fingerprint.targetOs

  if (mode === 'itbrowser' && host === 'win32' && target === 'windows' && status.itbrowser.installed && status.itbrowser.path) {
    return { type: 'itbrowser', executable: status.itbrowser.path, mode: 'native', version: status.itbrowser.version }
  }

  if (mode === 'cloak' && cloakSupported(host) && status.cloak.installed && status.cloak.path) {
    return { type: 'cloak', executable: status.cloak.path, mode: 'cloak', version: status.cloak.version }
  }

  if (status.chromium.installed && status.chromium.path) {
    // chromium 三种 inject 形态:stealth (默认) / extension (legacy) / off (无注入)
    // 把 mode 透传到 KernelSelection 让 buildLaunchArgs 决定挂什么扩展
    const injectMode: KernelSelection['mode'] =
      mode === 'off' ? 'off' :
      mode === 'extension' ? 'extension' :
      'stealth'
    return { type: 'chromium', executable: status.chromium.path, mode: injectMode, version: status.chromium.version }
  }

  throw new KernelMissingError(cloakSupported(host) ? 'cloak' : 'chromium', 'No usable browser kernel is installed')
}

export interface BuildLaunchArgsOptions {
  /**
   * 启动浏览器时打开的初始 URL。传 undefined / 不传则不附加任何 URL，Chromium 会落到
   * 新建标签页或恢复上次会话。
   *
   * 这里**不**自动读 profile.startUrl —— 是否打开 startUrl 是策略层（main.ts）的决定，
   * 比如"仅首次启动" / "脚本启动不打开"。kernel 这层只负责机械组装命令行。
   */
  initialUrl?: string
}

export function buildLaunchArgs(
  profile: BrowserProfile,
  selection: KernelSelection,
  extensionPaths: string[],
  proxyUrl: string,
  options: BuildLaunchArgsOptions = {}
) {
  // 把 UA 对齐到真实 kernel 版本,避免 Turnstile 看到"UA 说 Chrome 131 但内核是 149"
  // 这种矛盾,或者 UA 数字低于 v146 门槛被直接拦。
  // 这里只对内存中的 profile 做副本改造,不写回存储 —— 用户更新内核时下次启动会自动跟上。
  const alignedUa = alignUserAgentWithKernel(profile.fingerprint.userAgent, selection.version)
  const launchProfile: BrowserProfile = alignedUa === profile.fingerprint.userAgent
    ? profile
    : { ...profile, fingerprint: { ...profile.fingerprint, userAgent: alignedUa } }

  const args = [
    `--user-data-dir=${launchProfile.profilePath}`,
    `--proxy-server=${proxyUrl}`,
    `--window-size=${launchProfile.fingerprint.viewport.width},${launchProfile.fingerprint.viewport.height}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-mode',
    '--enable-extensions',
    // CDP 开关：端口 0 = 让 Chromium 挑一个空闲端口，真正的端口号会被写入
    // <user-data-dir>/DevToolsActivePort。绑定 127.0.0.1 保证仅本机可连，
    // 避免同网段用户接管已登录账号。脚本系统通过这个端口附着到浏览器。
    '--remote-debugging-port=0',
    '--remote-debugging-address=127.0.0.1'
  ]

  if (selection.mode === 'native' && selection.type === 'itbrowser') {
    const fingerprintConfigPath = writeFingerprintPayload(launchProfile)
    args.push(`--itbrowser=${fingerprintConfigPath}`)
  }

  if (selection.mode === 'cloak') {
    args.push(`--fingerprint=${fingerprintSeed(launchProfile.id)}`)
    args.push('--fingerprint-webrtc-ip=auto')
    args.push(`--timezone=${launchProfile.fingerprint.timezone}`)
    args.push(`--lang=${launchProfile.fingerprint.language}`)
  }

  args.push(`--user-agent=${launchProfile.fingerprint.userAgent}`)
  args.push(`--lang=${launchProfile.fingerprint.language}`)
  args.push(`--force-webrtc-ip-handling-policy=${launchProfile.fingerprint.webRtcPolicy === 'disable-non-proxied-udp' ? 'disable_non_proxied_udp' : 'default'}`)

  const allExtensions: string[] = []
  if (selection.mode === 'extension' || selection.mode === 'stealth') {
    // stealth → 完整 patch 套件(nativeToString + webdriver/chrome/iframe/permissions ...)
    // extension → legacy inject(快速回滚通道,已知有 toString 漏洞)
    allExtensions.push(ensureFingerprintExtension(launchProfile, selection.mode))
  }
  // Proxy auth extension is independent of fingerprint mode — even itbrowser/cloak need
  // credentials delivered this way because Chromium strips them from --proxy-server.
  const proxyAuthExt = ensureProxyAuthExtension(launchProfile)
  if (proxyAuthExt) allExtensions.push(proxyAuthExt)

  allExtensions.push(...extensionPaths)
  if (allExtensions.length) {
    const joined = allExtensions.join(',')
    args.push(`--disable-extensions-except=${joined}`)
    args.push(`--load-extension=${joined}`)
  }

  // 是否附加初始 URL 由调用方决定；这里只机械追加。不带 URL 时 Chromium 落到
  // 新建标签页或恢复上次会话，是用户已有数据的可预期行为。
  if (options.initialUrl) {
    args.push(options.initialUrl)
  }
  return args
}

export function assertLaunchableBrowser(browserPath: string, host: HostOs = hostOs()) {
  if (host !== 'win32' && browserPath.toLowerCase().endsWith('.exe')) {
    throw new Error(`The configured browser is a Windows executable and cannot run on ${host}: ${browserPath}`)
  }
}

export function browserCacheDirForRuntimeInfo() {
  return browsersRoot()
}
