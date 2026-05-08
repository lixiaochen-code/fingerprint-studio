export type ProxyConfig = {
  host: string
  port: number
  username?: string
  password?: string
}

export type FingerprintConfig = {
  userAgent: string
  language: string
  timezone: string
  viewport: {
    width: number
    height: number
  }
  screen: {
    availWidth: number
    availHeight: number
    colorDepth: number
    pixelDepth: number
  }
  platform: string
  hardwareConcurrency: number
  deviceMemory: number
  deviceScaleFactor: number
  maxTouchPoints: number
  doNotTrack: string
  webRtcPolicy: 'default' | 'disable-non-proxied-udp'
  canvasNoise: number
  audioNoise: number
  webglVendor: string
  webglRenderer: string
  fonts: string[]
}

export type BrowserProfile = {
  id: string
  name: string
  platform: string
  notes: string
  startUrl: string
  enabledPluginIds: string[]
  proxy: ProxyConfig
  fingerprint: FingerprintConfig
  profilePath: string
  createdAt: string
  updatedAt: string
  lastOpenedAt?: string
}

export type BrowserRuntimeStatus = {
  profileId: string
  running: boolean
}

export type RuntimeInfo = {
  browserPath: string
  browserKind: 'chromium' | 'chrome-for-testing' | 'custom'
  fingerprintSpoofingEnabled: boolean
  managedBrowserCacheDir: string
}

export type ProfileDraft = {
  id?: string
  name: string
  platform?: string
  notes?: string
  startUrl?: string
  enabledPluginIds?: string[]
  proxy?: Partial<ProxyConfig>
  fingerprint?: Partial<FingerprintConfig>
}

export type PluginVersion = {
  id: string
  version: string
  manifestVersion?: number
  extensionId?: string
  optionsPage?: string
  popupPage?: string
  importedAt: string
  sourceZip?: string
  path: string
}

export type BrowserPlugin = {
  id: string
  name: string
  description?: string
  activeVersionId: string
  versions: PluginVersion[]
  createdAt: string
  updatedAt: string
}
