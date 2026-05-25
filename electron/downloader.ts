import fs from 'node:fs'
import path from 'node:path'
import https from 'node:https'
import os from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { URL } from 'node:url'
import { install, Browser, BrowserTag, detectBrowserPlatform, resolveBuildId } from '@puppeteer/browsers'
import { extractFull } from 'node-7z'
import sevenBin from '7zip-bin'
import type { KernelInstallProgress, KernelType } from './types'
import { chromiumCacheDir, cloakRoot, itbrowserRoot } from './paths'
import { hostOs } from './fingerprint'

const execFileAsync = promisify(execFile)

const ITBROWSER_RELEASE = 'https://github.com/itbrowser-net/undetectable-fingerprint-browser/releases/download/v1.0.1/finngerprints-browser-v1.0.1.7z'
// 走 Chrome for Testing(Browser.CHROME)而不是 Chromium 快照(Browser.CHROMIUM)。
// 后者在 puppeteer cache 里是 commit 号(如 '1627652'),实际对应 Chromium 主线某次 CI 构建,
// 报给页面的 Chrome 版本号是构建时所在的 milestone branch —— 历史上钉死的 '1627652' 是 M123,
// Turnstile 2026Q2 起拒绝 < v146 的内核,直接报 "Unsupported Browser"。
// Chrome for Testing 用语义版本号(如 '149.0.7827.22'),且 BrowserTag.STABLE 永远解析到最新
// 稳定版,以后 Cloudflare 再加门槛我们也跟得上,不用每次手动改版本号。
const CLOAK_RELEASE_TAG = 'chromium-v146.0.7680.177.4'

export type ProgressListener = (progress: KernelInstallProgress) => void

class CancellationToken {
  private canceled = false
  cancel() {
    this.canceled = true
  }
  throwIfCanceled() {
    if (this.canceled) throw new Error('Installation canceled')
  }
  get isCanceled() {
    return this.canceled
  }
}

const installations = new Map<KernelType, { token: CancellationToken; promise: Promise<void> }>()

function emit(listener: ProgressListener, progress: KernelInstallProgress) {
  try { listener(progress) } catch {}
}

function rmrf(target: string) {
  try { fs.rmSync(target, { recursive: true, force: true }) } catch {}
}

function downloadFile(url: string, destination: string, token: CancellationToken, listener: ProgressListener, kernel: KernelType) {
  return new Promise<void>((resolve, reject) => {
    const finalize = (err?: Error) => {
      file.close()
      if (err) {
        rmrf(destination)
        reject(err)
      } else {
        resolve()
      }
    }
    const file = fs.createWriteStream(destination)
    let received = 0
    const performRequest = (target: string, redirects = 0) => {
      if (redirects > 5) return finalize(new Error('Too many redirects'))
      const parsed = new URL(target)
      const request = https.get(
        {
          hostname: parsed.hostname,
          path: `${parsed.pathname}${parsed.search}`,
          headers: { 'User-Agent': 'auto-registry/1.0' }
        },
        (response) => {
          if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
            response.resume()
            performRequest(new URL(response.headers.location, target).toString(), redirects + 1)
            return
          }
          if (response.statusCode !== 200) {
            return finalize(new Error(`HTTP ${response.statusCode} when downloading ${target}`))
          }
          const total = Number(response.headers['content-length'] || 0)
          response.on('data', (chunk) => {
            if (token.isCanceled) {
              request.destroy()
              return finalize(new Error('Installation canceled'))
            }
            received += chunk.length
            emit(listener, { kernel, phase: 'download', bytesDone: received, bytesTotal: total })
          })
          response.on('error', finalize)
          response.pipe(file)
          file.on('finish', () => finalize())
        }
      )
      request.on('error', finalize)
    }
    performRequest(url)
  })
}

async function installChromium(token: CancellationToken, listener: ProgressListener) {
  emit(listener, { kernel: 'chromium', phase: 'pending', message: 'Resolving latest stable Chrome' })
  const cacheDir = chromiumCacheDir()
  fs.mkdirSync(cacheDir, { recursive: true })

  const platform = detectBrowserPlatform()
  if (!platform) {
    throw new Error('Cannot detect browser platform for this OS/arch')
  }
  // 动态解析 stable —— 每次安装都拿最新稳定版,避免再钉死成历史版本被 Turnstile 拒收。
  const buildId = await resolveBuildId(Browser.CHROME, platform, BrowserTag.STABLE)
  token.throwIfCanceled()
  emit(listener, { kernel: 'chromium', phase: 'pending', message: `Preparing Chrome ${buildId} download` })

  await install({
    browser: Browser.CHROME,
    buildId,
    cacheDir,
    downloadProgressCallback: (downloadedBytes: number, totalBytes: number) => {
      if (token.isCanceled) throw new Error('Installation canceled')
      emit(listener, {
        kernel: 'chromium',
        phase: 'download',
        bytesDone: downloadedBytes,
        bytesTotal: totalBytes
      })
    }
  })

  token.throwIfCanceled()
  emit(listener, { kernel: 'chromium', phase: 'done', message: `Chrome ${buildId} installed` })
}

async function installItbrowser(token: CancellationToken, listener: ProgressListener) {
  const root = itbrowserRoot()
  fs.mkdirSync(root, { recursive: true })
  const archivePath = path.join(root, 'finngerprints-browser-v1.0.1.7z')
  const extractDir = path.join(root, 'extracted')

  emit(listener, { kernel: 'itbrowser', phase: 'pending', message: 'Preparing itbrowser download' })

  if (!fs.existsSync(archivePath) || fs.statSync(archivePath).size < 100 * 1024 * 1024) {
    rmrf(archivePath)
    await downloadFile(ITBROWSER_RELEASE, archivePath, token, listener, 'itbrowser')
  } else {
    emit(listener, { kernel: 'itbrowser', phase: 'download', bytesDone: fs.statSync(archivePath).size, bytesTotal: fs.statSync(archivePath).size, message: 'Reusing cached archive' })
  }

  token.throwIfCanceled()
  emit(listener, { kernel: 'itbrowser', phase: 'extract', message: 'Extracting itbrowser archive' })

  rmrf(extractDir)
  fs.mkdirSync(extractDir, { recursive: true })

  await new Promise<void>((resolve, reject) => {
    const stream = extractFull(archivePath, extractDir, {
      $bin: sevenBin.path7za,
      $progress: true
    })
    stream.on('progress', (progress: { percent?: number; fileCount?: number; file?: string }) => {
      if (token.isCanceled) {
        try { stream.destroy() } catch {}
        return reject(new Error('Installation canceled'))
      }
      emit(listener, {
        kernel: 'itbrowser',
        phase: 'extract',
        bytesDone: progress.percent,
        bytesTotal: 100,
        message: progress.file
      })
    })
    stream.on('end', () => resolve())
    stream.on('error', (error: Error) => reject(error))
  })

  token.throwIfCanceled()
  emit(listener, { kernel: 'itbrowser', phase: 'verify', message: 'Verifying itbrowser layout' })
  const expectedExe = path.join(extractDir, 'Chrome-bin', 'chrome.exe')
  if (!fs.existsSync(expectedExe)) {
    throw new Error(`itbrowser executable not found at ${expectedExe} after extraction`)
  }

  emit(listener, { kernel: 'itbrowser', phase: 'done', message: 'itbrowser installed' })
}

function cloakAssetName(host: string, arch: string): string {
  if (host === 'linux' && arch === 'arm64') return 'cloakbrowser-linux-arm64.tar.gz'
  if (host === 'linux') return 'cloakbrowser-linux-x64.tar.gz'
  if (host === 'win32') return 'cloakbrowser-windows-x64.zip'
  throw new Error(`CloakBrowser does not provide a binary for ${host}-${arch}`)
}

async function extract7z(archivePath: string, destDir: string, kernel: KernelType, token: CancellationToken, listener: ProgressListener) {
  await new Promise<void>((resolve, reject) => {
    const stream = extractFull(archivePath, destDir, {
      $bin: sevenBin.path7za,
      $progress: true
    })
    stream.on('progress', (progress: { percent?: number; file?: string }) => {
      if (token.isCanceled) {
        try { stream.destroy() } catch {}
        return reject(new Error('Installation canceled'))
      }
      emit(listener, {
        kernel,
        phase: 'extract',
        bytesDone: progress.percent,
        bytesTotal: 100,
        message: progress.file
      })
    })
    stream.on('end', () => resolve())
    stream.on('error', (error: Error) => reject(error))
  })
}

async function installCloak(token: CancellationToken, listener: ProgressListener) {
  const host = hostOs()
  if (host === 'darwin') {
    throw new Error('CloakBrowser does not provide a macOS binary; falling back to extension mode is required.')
  }
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64'
  const root = cloakRoot()
  fs.mkdirSync(root, { recursive: true })

  const assetName = cloakAssetName(host, arch)
  const url = `https://github.com/CloakHQ/CloakBrowser/releases/download/${CLOAK_RELEASE_TAG}/${assetName}`
  const archivePath = path.join(root, assetName)

  emit(listener, { kernel: 'cloak', phase: 'pending', message: `Preparing CloakBrowser ${arch} download` })

  if (!fs.existsSync(archivePath) || fs.statSync(archivePath).size < 50 * 1024 * 1024) {
    rmrf(archivePath)
    await downloadFile(url, archivePath, token, listener, 'cloak')
  } else {
    emit(listener, { kernel: 'cloak', phase: 'download', bytesDone: fs.statSync(archivePath).size, bytesTotal: fs.statSync(archivePath).size, message: 'Reusing cached archive' })
  }

  token.throwIfCanceled()
  emit(listener, { kernel: 'cloak', phase: 'extract', message: 'Extracting CloakBrowser archive' })

  // clean previous install dir but keep archive cache
  for (const entry of fs.readdirSync(root)) {
    if (entry === assetName) continue
    rmrf(path.join(root, entry))
  }

  if (assetName.endsWith('.zip')) {
    await extract7z(archivePath, root, 'cloak', token, listener)
  } else if (assetName.endsWith('.tar.gz')) {
    if (host === 'linux') {
      // Linux: system tar reliably handles tar.gz one-shot
      await execFileAsync('tar', ['-xzf', archivePath, '-C', root])
    } else {
      // 7za two-pass: tar.gz -> tar -> dir
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cloak-'))
      try {
        await extract7z(archivePath, tmpDir, 'cloak', token, listener)
        const tarFile = fs.readdirSync(tmpDir).find((name) => name.endsWith('.tar'))
        if (!tarFile) throw new Error('Inner .tar not found after first extract pass')
        await extract7z(path.join(tmpDir, tarFile), root, 'cloak', token, listener)
      } finally {
        rmrf(tmpDir)
      }
    }
  }

  token.throwIfCanceled()
  emit(listener, { kernel: 'cloak', phase: 'verify', message: 'Verifying CloakBrowser layout' })

  const exeName = host === 'win32' ? 'chrome.exe' : 'chrome'
  const candidates = [
    path.join(root, 'cloakbrowser', exeName),
    path.join(root, 'cloakbrowser', 'chrome'),
    path.join(root, exeName)
  ]
  const exe = candidates.find((candidate) => fs.existsSync(candidate))
  if (!exe) {
    throw new Error(`CloakBrowser executable not found after extraction. Looked in: ${candidates.join(', ')}`)
  }
  if (host !== 'win32') {
    try { fs.chmodSync(exe, 0o755) } catch {}
  }
  fs.writeFileSync(path.join(root, 'VERSION'), CLOAK_RELEASE_TAG.replace(/^chromium-/, ''))

  emit(listener, { kernel: 'cloak', phase: 'done', message: 'CloakBrowser installed' })
}

export function installKernel(kernel: KernelType, listener: ProgressListener) {
  const existing = installations.get(kernel)
  if (existing) return existing.promise

  const token = new CancellationToken()
  const promise = (async () => {
    try {
      if (kernel === 'chromium') await installChromium(token, listener)
      else if (kernel === 'cloak') await installCloak(token, listener)
      else await installItbrowser(token, listener)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      emit(listener, { kernel, phase: token.isCanceled ? 'canceled' : 'error', message })
      throw error
    } finally {
      installations.delete(kernel)
    }
  })()

  installations.set(kernel, { token, promise })
  return promise
}

export function cancelInstall(kernel: KernelType) {
  installations.get(kernel)?.token.cancel()
}

export function isInstalling(kernel: KernelType) {
  return installations.has(kernel)
}
