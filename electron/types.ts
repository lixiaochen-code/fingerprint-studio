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
  notes: string
  /**
   * 可选：profile 第一次启动时打开的 URL。后续启动（无论 GUI 还是脚本触发）都不再
   * 重复打开这个 URL —— 浏览器自身会恢复上次会话或停在新建标签页。判断"首次"的
   * 信号是 profile user-data 目录里有没有 Chromium 写过的 Default 文件夹。
   */
  startUrl?: string
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

export type BrowserCrashEvent = {
  profileId: string
  exitCode: number | null
  signal: NodeJS.Signals | null
  stderrTail?: string
}

export type FingerprintMode = 'off' | 'extension' | 'stealth' | 'cloak' | 'itbrowser'

export type KernelType = 'chromium' | 'cloak' | 'itbrowser'

export type KernelStatus = {
  type: KernelType
  installed: boolean
  path?: string
  version?: string
  sizeMB?: number
}

export type KernelStatusMap = {
  chromium: KernelStatus
  cloak: KernelStatus
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
  hostArch: 'x64' | 'arm64' | 'unknown'
  fingerprintMode: FingerprintMode
  fingerprintSpoofingEnabled: boolean
  kernels: KernelStatusMap
  itbrowserSupported: boolean
  cloakSupported: boolean
  managedBrowserCacheDir: string
}

export type ProfileDraft = {
  id?: string
  name: string
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

// —— Scripting system ————————————————————————————————————————

/**
 * 脚本来源：
 * - local：源码保存在 <userData>/registry-data/scripts/<id>/index.ts，由应用内编辑器管理
 * - external：源码在用户自己的目录里（Dev 模式），仅保存绝对路径引用
 *
 * 两种来源共享 Script 的其它字段，只在运行时根据 source 选择加载路径。
 */
export type ScriptSource = 'local' | 'external'

export type Script = {
  id: string
  name: string
  description?: string
  source: ScriptSource
  /** 绝对路径；local 脚本指向应用数据目录内，external 脚本指向外部任意目录 */
  entryPath: string
  createdAt: string
  updatedAt: string
}

export type ScriptRunStatus =
  | 'pending'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'stopped'

export type ScriptRun = {
  id: string
  scriptId: string
  profileId: string
  status: ScriptRunStatus
  startedAt: string
  endedAt?: string
  exitCode?: number | null
  /** 最终错误信息；仅 failed / stopped 状态有值 */
  error?: string
  /** 绝对路径，runtime 会把 stdout/stderr 追加到这里 */
  logPath: string
}

export type ScriptDraft = {
  id?: string
  name: string
  description?: string
  source: ScriptSource
  /** 仅 external 必填；local 会由 store 自动生成 */
  entryPath?: string
  /** 仅 local 新建时有意义：初始源码，会写入 index.ts */
  initialSource?: string
}
