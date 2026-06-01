#!/usr/bin/env node
// verify-electron-cache.mjs — electron 下载缓存 SHA256 校验与修复（零第三方依赖）
//
// 弱网下 electron-builder 自动下载的 electron zip 常损坏（SHA 不匹配），
// 导致 dist 在 unpack-electron 阶段报 `flate: corrupt input`。本脚本前置校验，
// 删除损坏文件（默认）或 curl 重下（--redownload）。
//
// 用法：
//   pnpm run dist:check                          # 默认：校验 + 删坏文件
//   node scripts/verify-electron-cache.mjs --strict      # 坏就报错不删（CI 用）
//   node scripts/verify-electron-cache.mjs --redownload  # 删 + curl 重下 + 复校
//
// 规范来源：docs/process/；由 change 2026-06-build-resilience 引入。

import { readdirSync, readFileSync, existsSync, createReadStream, unlinkSync, statSync } from 'node:fs'
import { join } from 'node:path'
import os from 'node:os'
import { createHash } from 'node:crypto'
import { execSync } from 'node:child_process'

const MODE_DELETE = 'delete'
const MODE_STRICT = 'strict'
const MODE_REDOWNLOAD = 'redownload'

const args = process.argv.slice(2)
const mode = args.includes('--strict')
  ? MODE_STRICT
  : args.includes('--redownload')
    ? MODE_REDOWNLOAD
    : MODE_DELETE

// 只校验 build 实际解包用的主 electron zip（跳过 chromedriver/ffmpeg/dsym/symbols）
const ELECTRON_ZIP_RE = /^electron-v[\d.]+-(darwin|linux|win32|mas)-(arm64|x64|ia32|armv7l)\.zip$/

function resolveCacheDir() {
  if (process.env.ELECTRON_CACHE) return process.env.ELECTRON_CACHE
  const home = os.homedir()
  switch (process.platform) {
    case 'darwin':
      return join(home, 'Library', 'Caches', 'electron')
    case 'win32':
      return join(process.env.LOCALAPPDATA || join(home, 'AppData', 'Local'), 'electron', 'Cache')
    default:
      return join(home, '.cache', 'electron')
  }
}

function parseShasums(text) {
  const map = new Map()
  for (const line of text.split('\n')) {
    const m = line.match(/^([0-9a-f]{64})\s+\*?(.+)$/)
    if (m) map.set(m[2].trim(), m[1])
  }
  return map
}

function sha256(file) {
  return new Promise((resolve, reject) => {
    const h = createHash('sha256')
    const s = createReadStream(file)
    s.on('data', (d) => h.update(d))
    s.on('end', () => resolve(h.digest('hex')))
    s.on('error', reject)
  })
}

function downloadUrl(filename) {
  const verMatch = filename.match(/v([\d.]+)/)
  if (!verMatch) return null
  return `https://github.com/electron/electron/releases/download/v${verMatch[1]}/${filename}`
}

function curlDownload(url, dest) {
  execSync(`curl -L --fail -o "${dest}" "${url}"`, { stdio: 'inherit' })
}

function hasCurl() {
  try {
    execSync('command -v curl', { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

async function main() {
  const cacheDir = resolveCacheDir()
  console.log(`🔍 verify-electron-cache (mode=${mode})`)
  console.log(`cache: ${cacheDir}\n`)

  if (!existsSync(cacheDir)) {
    console.log('no electron cache yet, skipping (electron-builder will download on first build)')
    process.exit(0)
  }

  const shasumsPath = join(cacheDir, 'SHASUMS256.txt')
  if (!existsSync(shasumsPath)) {
    console.log('⚠ SHASUMS256.txt not found in cache; cannot verify. Skipping (non-blocking).')
    process.exit(0)
  }

  const expected = parseShasums(readFileSync(shasumsPath, 'utf8'))
  const zips = readdirSync(cacheDir).filter((f) => ELECTRON_ZIP_RE.test(f))

  if (zips.length === 0) {
    console.log('no electron zips in cache, skipping')
    process.exit(0)
  }

  let corrupt = 0
  let repaired = 0
  let failed = 0

  for (const zip of zips) {
    const full = join(cacheDir, zip)
    const want = expected.get(zip)
    if (!want) {
      console.log(`  ⚠ ${zip}: no expected SHA in SHASUMS256.txt, skip`)
      continue
    }
    const got = await sha256(full)
    if (got === want) {
      const mb = (statSync(full).size / 1048576).toFixed(0)
      console.log(`  ✓ ${zip} (${mb} MB)`)
      continue
    }

    corrupt++
    console.log(`  ✗ ${zip}: SHA mismatch`)
    console.log(`      expected ${want}`)
    console.log(`      actual   ${got}`)

    if (mode === MODE_STRICT) {
      continue // 不删，留给报错退出
    }

    // 删除损坏文件
    unlinkSync(full)
    console.log(`      → deleted corrupt file`)

    if (mode === MODE_REDOWNLOAD) {
      const url = downloadUrl(zip)
      if (!url) {
        console.log(`      → cannot derive download URL, skip redownload`)
        failed++
        continue
      }
      if (!hasCurl()) {
        console.log(`      → curl not available, cannot redownload`)
        failed++
        continue
      }
      console.log(`      → redownloading from ${url}`)
      try {
        curlDownload(url, full)
        const reGot = await sha256(full)
        if (reGot === want) {
          console.log(`      ✓ redownload verified OK`)
          repaired++
        } else {
          console.log(`      ✗ redownload still mismatches (network issue?)`)
          unlinkSync(full)
          failed++
        }
      } catch (e) {
        console.log(`      ✗ redownload failed: ${e.message}`)
        failed++
      }
    }
  }

  console.log('')
  if (corrupt === 0) {
    console.log('✓ all electron cache files verified')
    process.exit(0)
  }

  if (mode === MODE_STRICT) {
    console.log(`✗ ${corrupt} corrupt file(s) found (strict mode, not deleted)`)
    process.exit(1)
  }

  if (mode === MODE_REDOWNLOAD) {
    console.log(`Result: ${corrupt} corrupt, ${repaired} repaired, ${failed} failed`)
    process.exit(failed ? 1 : 0)
  }

  // default delete mode
  console.log(`Result: ${corrupt} corrupt file(s) deleted; electron-builder will re-download on build.`)
  console.log(`Tip: on flaky network, run "node scripts/verify-electron-cache.mjs --redownload" to fetch + verify directly.`)
  process.exit(0)
}

main().catch((e) => {
  console.error('verify-electron-cache crashed:', e)
  process.exit(0) // 校验脚本自身崩溃不应阻塞 build
})
