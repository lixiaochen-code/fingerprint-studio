import path from 'node:path'
import fs from 'node:fs'
import { app } from 'electron'

export function dataRoot() {
  return path.join(app.getPath('userData'), 'registry-data')
}

export function profilesRoot() {
  return path.join(dataRoot(), 'profiles')
}

export function pluginsRoot() {
  return path.join(dataRoot(), 'plugins')
}

export function browsersRoot() {
  return path.join(dataRoot(), 'browsers')
}

export function chromiumCacheDir() {
  return path.join(browsersRoot(), 'chromium')
}

export function cloakRoot() {
  return path.join(browsersRoot(), 'cloak')
}

export function itbrowserRoot() {
  return path.join(browsersRoot(), 'itbrowser')
}

export function scriptsRoot() {
  return path.join(dataRoot(), 'scripts')
}

export function scriptRunLogsRoot() {
  return path.join(dataRoot(), 'script-runs')
}

export function scriptsTypingsDir() {
  return path.join(scriptsRoot(), '.typings')
}

/**
 * 代理子系统的持久化路径。
 *
 * - `proxiesFile()`:全部代理条目,带 schemaVersion(见 [electron/proxies/store.ts](./proxies/store.ts))
 * - `proxyWhitelistsDir()`:每代理一个白名单 JSON 的目录
 * - `proxyWhitelistFile(id)`:单个代理的白名单文件路径
 *
 * 白名单文件命名直接用 proxyId(没有 sanitize 的必要,id 本身就是 `proxy_xxxx`),方便外部
 * 编辑器找到。
 */
export function proxiesFile() {
  return path.join(dataRoot(), 'proxies.json')
}

export function proxyWhitelistsDir() {
  return path.join(dataRoot(), 'proxy-whitelists')
}

export function proxyWhitelistFile(proxyId: string) {
  return path.join(proxyWhitelistsDir(), `${proxyId}.json`)
}

export function ensureDirs() {
  for (const dir of [
    dataRoot(),
    profilesRoot(),
    pluginsRoot(),
    browsersRoot(),
    chromiumCacheDir(),
    cloakRoot(),
    itbrowserRoot(),
    scriptsRoot(),
    scriptRunLogsRoot(),
    proxyWhitelistsDir()
  ]) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

export function legacyBrowsersDir() {
  return path.join(process.cwd(), '.browsers')
}

export function configuredBrowserPath() {
  return process.env.AUTO_REGISTRY_BROWSER_PATH || process.env.AUTO_REGISTRY_CHROMIUM || process.env.AUTO_REGISTRY_CHROME
}
