import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import type { BrowserPlugin, BrowserProfile, FingerprintConfig, PluginVersion, ProfileDraft, ProxyConfig } from './types'

const DEFAULT_PROXY: ProxyConfig = {
  host: '127.0.0.1',
  port: 7890
}

const languages = ['zh-CN', 'en-US', 'en-GB', 'ja-JP', 'de-DE', 'fr-FR']
const timezones = ['Asia/Shanghai', 'America/Los_Angeles', 'America/New_York', 'Europe/London', 'Europe/Berlin', 'Asia/Tokyo']
const viewports = [
  { width: 1440, height: 900 },
  { width: 1536, height: 864 },
  { width: 1600, height: 900 },
  { width: 1920, height: 1080 },
  { width: 1366, height: 768 }
]
const fontSets = [
  ['Arial', 'Helvetica', 'Times New Roman', 'Courier New', 'Verdana'],
  ['PingFang SC', 'Microsoft YaHei', 'Arial', 'Helvetica', 'Songti SC'],
  ['Segoe UI', 'Calibri', 'Cambria', 'Arial', 'Verdana'],
  ['Helvetica Neue', 'Avenir Next', 'Menlo', 'Georgia', 'Arial']
]
const renderers = [
  ['Google Inc. (Intel)', 'ANGLE (Intel, Intel(R) Iris(TM) Plus Graphics, OpenGL 4.1)'],
  ['Google Inc. (NVIDIA)', 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1660, OpenGL 4.1)'],
  ['Google Inc. (AMD)', 'ANGLE (AMD, AMD Radeon Pro 560X, OpenGL 4.1)'],
  ['Apple Inc.', 'Apple M2']
]

function pick<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)]
}

function id() {
  return `env_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function pluginId(name: string) {
  return `plugin_${name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || Date.now().toString(36)}`
}

function versionId() {
  return `ver_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function chromeVersion() {
  const major = 120 + Math.floor(Math.random() * 12)
  return `${major}.0.${Math.floor(1000 + Math.random() * 7999)}.${Math.floor(10 + Math.random() * 89)}`
}

function normalizeUrl(url?: string) {
  const value = url?.trim()
  if (!value) return 'https://www.google.com'
  if (/^https?:\/\//i.test(value)) return value
  return `https://${value}`
}

export function makeFingerprint(partial?: Partial<FingerprintConfig>): FingerprintConfig {
  const viewport = partial?.viewport ?? pick(viewports)
  const [webglVendor, webglRenderer] = partial?.webglVendor && partial?.webglRenderer
    ? [partial.webglVendor, partial.webglRenderer]
    : pick(renderers)
  const platform = partial?.platform ?? pick(['MacIntel', 'Win32', 'Linux x86_64'])
  const osToken = platform === 'Win32'
    ? 'Windows NT 10.0; Win64; x64'
    : platform === 'MacIntel'
      ? 'Macintosh; Intel Mac OS X 10_15_7'
      : 'X11; Linux x86_64'

  return {
    userAgent: partial?.userAgent ?? `Mozilla/5.0 (${osToken}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion()} Safari/537.36`,
    language: partial?.language ?? pick(languages),
    timezone: partial?.timezone ?? pick(timezones),
    viewport,
    screen: partial?.screen ?? {
      availWidth: viewport.width,
      availHeight: viewport.height - pick([24, 40, 72]),
      colorDepth: pick([24, 30]),
      pixelDepth: pick([24, 30])
    },
    platform,
    hardwareConcurrency: partial?.hardwareConcurrency ?? pick([4, 6, 8, 10, 12]),
    deviceMemory: partial?.deviceMemory ?? pick([4, 8, 16]),
    deviceScaleFactor: partial?.deviceScaleFactor ?? pick([1, 1.25, 1.5, 2]),
    maxTouchPoints: partial?.maxTouchPoints ?? pick([0, 0, 0, 1, 5]),
    doNotTrack: partial?.doNotTrack ?? pick(['1', '0', 'unspecified']),
    webRtcPolicy: partial?.webRtcPolicy ?? 'disable-non-proxied-udp',
    canvasNoise: partial?.canvasNoise ?? Number((Math.random() * 0.00001).toFixed(8)),
    audioNoise: partial?.audioNoise ?? Number((Math.random() * 0.00001).toFixed(8)),
    webglVendor,
    webglRenderer,
    fonts: partial?.fonts?.length ? partial.fonts : pick(fontSets)
  }
}

export class ProfileStore {
  private readonly root: string
  private readonly profilesFile: string
  private readonly pluginsFile: string
  private profiles: BrowserProfile[] = []
  private plugins: BrowserPlugin[] = []

  constructor() {
    this.root = path.join(app.getPath('userData'), 'registry-data')
    this.profilesFile = path.join(this.root, 'profiles.json')
    this.pluginsFile = path.join(this.root, 'plugins.json')
    fs.mkdirSync(this.root, { recursive: true })
    this.load()
  }

  list() {
    return this.profiles
  }

  listPlugins() {
    return this.plugins
  }

  upsert(draft: ProfileDraft) {
    const now = new Date().toISOString()
    const existing = draft.id ? this.profiles.find((profile) => profile.id === draft.id) : undefined
    const profileId = existing?.id ?? id()
    const proxy: ProxyConfig = {
      host: draft.proxy?.host?.trim() || existing?.proxy.host || DEFAULT_PROXY.host,
      port: Number(draft.proxy?.port || existing?.proxy.port || DEFAULT_PROXY.port),
      username: draft.proxy?.username?.trim() || existing?.proxy.username,
      password: draft.proxy?.password?.trim() || existing?.proxy.password
    }

    const profile: BrowserProfile = {
      id: profileId,
      name: draft.name.trim() || existing?.name || `环境 ${this.profiles.length + 1}`,
      platform: draft.platform?.trim() || existing?.platform || 'other',
      notes: draft.notes?.trim() || existing?.notes || '',
      startUrl: normalizeUrl(draft.startUrl || existing?.startUrl),
      enabledPluginIds: draft.enabledPluginIds ?? existing?.enabledPluginIds ?? [],
      proxy,
      fingerprint: makeFingerprint({ ...existing?.fingerprint, ...draft.fingerprint }),
      profilePath: existing?.profilePath || path.join(this.root, 'profiles', profileId),
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      lastOpenedAt: existing?.lastOpenedAt
    }

    fs.mkdirSync(profile.profilePath, { recursive: true })

    if (existing) {
      this.profiles = this.profiles.map((item) => (item.id === existing.id ? profile : item))
    } else {
      this.profiles = [profile, ...this.profiles]
    }
    this.save()
    return profile
  }

  remove(profileId: string) {
    this.profiles = this.profiles.filter((profile) => profile.id !== profileId)
    this.save()
  }

  markOpened(profileId: string) {
    const now = new Date().toISOString()
    this.profiles = this.profiles.map((profile) => profile.id === profileId ? { ...profile, lastOpenedAt: now, updatedAt: now } : profile)
    this.save()
  }

  get(profileId: string) {
    return this.profiles.find((profile) => profile.id === profileId)
  }

  activePluginVersions(pluginIds: string[]) {
    return pluginIds
      .map((pluginIdValue) => this.plugins.find((plugin) => plugin.id === pluginIdValue))
      .filter((plugin): plugin is BrowserPlugin => Boolean(plugin))
      .map((plugin) => plugin.versions.find((version) => version.id === plugin.activeVersionId))
      .filter((version): version is PluginVersion => Boolean(version))
  }

  addPluginVersion(input: {
    name: string
    version: string
    description?: string
    manifestVersion?: number
    optionsPage?: string
    popupPage?: string
    sourceZip?: string
    path: string
  }) {
    const now = new Date().toISOString()
    const existing = this.plugins.find((plugin) => plugin.name.toLowerCase() === input.name.toLowerCase())
    const version: PluginVersion = {
      id: versionId(),
      version: input.version,
      manifestVersion: input.manifestVersion,
      optionsPage: input.optionsPage,
      popupPage: input.popupPage,
      importedAt: now,
      sourceZip: input.sourceZip,
      path: input.path
    }

    if (existing) {
      const next: BrowserPlugin = {
        ...existing,
        description: input.description || existing.description,
        activeVersionId: version.id,
        versions: [version, ...existing.versions],
        updatedAt: now
      }
      this.plugins = this.plugins.map((plugin) => plugin.id === existing.id ? next : plugin)
      this.save()
      return next
    }

    const plugin: BrowserPlugin = {
      id: pluginId(input.name),
      name: input.name,
      description: input.description,
      activeVersionId: version.id,
      versions: [version],
      createdAt: now,
      updatedAt: now
    }
    this.plugins = [plugin, ...this.plugins]
    this.save()
    return plugin
  }

  setActivePluginVersion(pluginIdValue: string, versionIdValue: string) {
    const plugin = this.plugins.find((item) => item.id === pluginIdValue)
    if (!plugin || !plugin.versions.some((version) => version.id === versionIdValue)) {
      throw new Error('插件或版本不存在')
    }
    this.plugins = this.plugins.map((item) => item.id === pluginIdValue
      ? { ...item, activeVersionId: versionIdValue, updatedAt: new Date().toISOString() }
      : item)
    this.save()
  }

  removePlugin(pluginIdValue: string) {
    this.plugins = this.plugins.filter((plugin) => plugin.id !== pluginIdValue)
    this.profiles = this.profiles.map((profile) => ({
      ...profile,
      enabledPluginIds: profile.enabledPluginIds.filter((idValue) => idValue !== pluginIdValue)
    }))
    this.save()
  }

  private load() {
    try {
      this.profiles = fs.existsSync(this.profilesFile)
        ? (JSON.parse(fs.readFileSync(this.profilesFile, 'utf8')) as BrowserProfile[]).map((profile) => ({
          ...profile,
          enabledPluginIds: profile.enabledPluginIds ?? [],
          fingerprint: makeFingerprint(profile.fingerprint)
        }))
        : []
    } catch {
      this.profiles = []
    }
    try {
      this.plugins = fs.existsSync(this.pluginsFile)
        ? JSON.parse(fs.readFileSync(this.pluginsFile, 'utf8')) as BrowserPlugin[]
        : []
    } catch {
      this.plugins = []
    }
  }

  private save() {
    fs.writeFileSync(this.profilesFile, JSON.stringify(this.profiles, null, 2))
    fs.writeFileSync(this.pluginsFile, JSON.stringify(this.plugins, null, 2))
  }
}
