import fs from 'node:fs'
import path from 'node:path'
import https from 'node:https'
import { URL } from 'node:url'
import { install, Browser } from '@puppeteer/browsers'
import { extractFull } from 'node-7z'
import sevenBin from '7zip-bin'
import type { KernelInstallProgress, KernelType } from './types'
import { chromiumCacheDir, itbrowserRoot } from './paths'

const ITBROWSER_RELEASE = 'https://github.com/itbrowser-net/undetectable-fingerprint-browser/releases/download/v1.0.1/finngerprints-browser-v1.0.1.7z'
const CHROMIUM_BUILD_ID = '1627652'

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
  emit(listener, { kernel: 'chromium', phase: 'pending', message: 'Preparing Chromium download' })
  const cacheDir = chromiumCacheDir()
  fs.mkdirSync(cacheDir, { recursive: true })

  await install({
    browser: Browser.CHROMIUM,
    buildId: CHROMIUM_BUILD_ID,
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
  emit(listener, { kernel: 'chromium', phase: 'done', message: 'Chromium installed' })
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

export function installKernel(kernel: KernelType, listener: ProgressListener) {
  const existing = installations.get(kernel)
  if (existing) return existing.promise

  const token = new CancellationToken()
  const promise = (async () => {
    try {
      if (kernel === 'chromium') await installChromium(token, listener)
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
