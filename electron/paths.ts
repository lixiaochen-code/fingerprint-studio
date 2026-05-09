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

export function itbrowserRoot() {
  return path.join(browsersRoot(), 'itbrowser')
}

export function ensureDirs() {
  for (const dir of [dataRoot(), profilesRoot(), pluginsRoot(), browsersRoot(), chromiumCacheDir(), itbrowserRoot()]) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

export function legacyBrowsersDir() {
  return path.join(process.cwd(), '.browsers')
}

export function configuredBrowserPath() {
  return process.env.AUTO_REGISTRY_BROWSER_PATH || process.env.AUTO_REGISTRY_CHROMIUM || process.env.AUTO_REGISTRY_CHROME
}
