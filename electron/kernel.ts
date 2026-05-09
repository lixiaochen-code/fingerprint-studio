import fs from 'node:fs'
import path from 'node:path'
import { Browser, getInstalledBrowsers, getVersionComparator } from '@puppeteer/browsers'
import type { BrowserProfile, HostOs, KernelStatus, KernelStatusMap, KernelType, TargetOs } from './types'
import { ensureFingerprintExtension, hostOs, writeFingerprintPayload } from './fingerprint'
import { browsersRoot, chromiumCacheDir, configuredBrowserPath, itbrowserRoot, legacyBrowsersDir } from './paths'

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
      const browsers = installed
        .filter((browser) => browser.browser === Browser.CHROMIUM || browser.browser === Browser.CHROME)
        .filter((browser) => fs.existsSync(browser.executablePath))
        .sort((a, b) => getVersionComparator(b.browser)(b.buildId, a.buildId))
      const found = browsers[0]
      if (found) {
        return {
          type: 'chromium',
          installed: true,
          path: found.executablePath,
          version: found.buildId,
          sizeMB: dirSizeMB(path.dirname(found.executablePath))
        }
      }
    } catch {}
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

export async function kernelStatusMap(): Promise<KernelStatusMap> {
  return {
    chromium: await chromiumStatus(),
    itbrowser: itbrowserStatus()
  }
}

export function itbrowserSupported(host: HostOs = hostOs()) {
  return host === 'win32'
}

export type KernelSelection = {
  type: KernelType
  executable: string
  mode: 'native' | 'extension'
}

export async function selectKernel(profile: BrowserProfile): Promise<KernelSelection> {
  const host = hostOs()
  const status = await kernelStatusMap()
  const target: TargetOs = profile.fingerprint.targetOs

  if (host === 'win32' && target === 'windows' && status.itbrowser.installed && status.itbrowser.path) {
    return { type: 'itbrowser', executable: status.itbrowser.path, mode: 'native' }
  }

  if (status.chromium.installed && status.chromium.path) {
    return { type: 'chromium', executable: status.chromium.path, mode: 'extension' }
  }

  throw new KernelMissingError('chromium', 'Chromium kernel is not installed')
}

export function buildLaunchArgs(profile: BrowserProfile, selection: KernelSelection, extensionPaths: string[], proxyUrl: string) {
  const args = [
    `--user-data-dir=${profile.profilePath}`,
    `--proxy-server=${proxyUrl}`,
    `--window-size=${profile.fingerprint.viewport.width},${profile.fingerprint.viewport.height}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-mode',
    '--enable-extensions'
  ]

  if (selection.mode === 'native' && selection.type === 'itbrowser') {
    const fingerprintConfigPath = writeFingerprintPayload(profile)
    args.push(`--itbrowser=${fingerprintConfigPath}`)
  }

  args.push(`--user-agent=${profile.fingerprint.userAgent}`)
  args.push(`--lang=${profile.fingerprint.language}`)
  args.push(`--force-webrtc-ip-handling-policy=${profile.fingerprint.webRtcPolicy === 'disable-non-proxied-udp' ? 'disable_non_proxied_udp' : 'default'}`)

  const allExtensions: string[] = []
  if (selection.mode === 'extension') {
    allExtensions.push(ensureFingerprintExtension(profile))
  }
  allExtensions.push(...extensionPaths)
  if (allExtensions.length) {
    const joined = allExtensions.join(',')
    args.push(`--disable-extensions-except=${joined}`)
    args.push(`--load-extension=${joined}`)
  }

  args.push(profile.startUrl)
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
