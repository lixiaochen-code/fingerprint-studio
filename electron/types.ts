export type ProxyConfig = {
  host: string
  port: number
  username?: string
  password?: string
}

export type TargetOs = 'windows' | 'mac' | 'linux'
export type TargetOsChoice = TargetOs | 'random'
export type HostOs = 'win32' | 'darwin' | 'linux'

export type FingerprintConfig = {
  targetOs: TargetOs
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

export type FingerprintMode = 'off' | 'extension' | 'itbrowser'

export type KernelType = 'chromium' | 'itbrowser'

export type KernelStatus = {
  type: KernelType
  installed: boolean
  path?: string
  version?: string
  sizeMB?: number
}

export type KernelStatusMap = {
  chromium: KernelStatus
  itbrowser: KernelStatus
}

export type KernelInstallPhase = 'pending' | 'download' | 'extract' | 'verify' | 'done' | 'error' | 'canceled'

export type KernelInstallProgress = {
  kernel: KernelType
  phase: KernelInstallPhase
  bytesDone?: number
  bytesTotal?: number
  message?: string
}

export type KernelMissingError = {
  code: 'KERNEL_MISSING'
  kernel: KernelType
  message: string
}

export type RuntimeInfo = {
  hostOs: HostOs
  fingerprintMode: FingerprintMode
  fingerprintSpoofingEnabled: boolean
  kernels: KernelStatusMap
  itbrowserSupported: boolean
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
  targetOs?: TargetOsChoice
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
