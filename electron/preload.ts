import { contextBridge, ipcRenderer } from 'electron'
import type { BrowserCrashEvent, BrowserPlugin, BrowserProfile, KernelInstallProgress, KernelStatusMap, KernelType, ProfileDraft, Proxy, ProxyConfig, ProxyDraft, ProxyTestSnapshot, RuntimeInfo, Script, ScriptDraft, ScriptRun, TargetOsChoice } from './types'
import type { ScriptRuntimeEvent } from './scripts/runtime'
import type { ProxyTestResult } from './proxyTest'

type LaunchResult = { ok: true } | { ok: false; error: { code?: string; kernel?: KernelType; message: string } }
/**
 * scripts:run 的返回结构。错误情况下：
 * - code='PROFILE_BUSY' + occupiedBy 字段：目标 profile 已被另一个 run 占用。
 *   渲染层应该弹友好 toast，必要时跳到 occupiedBy.scriptId 那个脚本面板。
 * - code 缺省：其它启动失败（profile 不存在 / 内核未装 / etc.）
 */
type ScriptRunResult =
  | { ok: true; run: ScriptRun }
  | {
      ok: false
      error: {
        message: string
        code?: string
        occupiedBy?: { runId: string; scriptId: string }
      }
    }

/**
 * profiles:save 的返回结构。错误情况下 code 可能是 'PROFILE_ID_TAKEN' / 'INVALID_PROFILE_ID' /
 * 其它(老路径里 store 还可能 throw 通用 Error,统一兜底)。
 */
type ProfileSaveResult =
  | { ok: true; profile: BrowserProfile }
  | {
      ok: false
      error: {
        message: string
        code?: string
        existingId?: string
        badId?: string
      }
    }

const api = {
  profiles: {
    list: () => ipcRenderer.invoke('profiles:list') as Promise<BrowserProfile[]>,
    save: (draft: ProfileDraft) => ipcRenderer.invoke('profiles:save', draft) as Promise<ProfileSaveResult>,
    remove: (id: string) => ipcRenderer.invoke('profiles:remove', id) as Promise<void>,
    duplicate: (id: string) => ipcRenderer.invoke('profiles:duplicate', id) as Promise<BrowserProfile>,
    launch: (id: string) => ipcRenderer.invoke('profiles:launch', id) as Promise<LaunchResult>,
    stop: (id: string) => ipcRenderer.invoke('profiles:stop', id) as Promise<void>,
    status: () => ipcRenderer.invoke('profiles:status'),
    randomFingerprint: (targetOs?: TargetOsChoice) => ipcRenderer.invoke('profiles:randomFingerprint', targetOs),
    onCrashed: (listener: (event: BrowserCrashEvent) => void) => {
      const handler = (_event: unknown, payload: BrowserCrashEvent) => listener(payload)
      ipcRenderer.on('profiles:crashed', handler)
      return () => ipcRenderer.removeListener('profiles:crashed', handler)
    }
  },
  plugins: {
    list: () => ipcRenderer.invoke('plugins:list') as Promise<BrowserPlugin[]>,
    importZip: () => ipcRenderer.invoke('plugins:importZip') as Promise<BrowserPlugin | undefined>,
    setActiveVersion: (pluginId: string, versionId: string) => ipcRenderer.invoke('plugins:setActiveVersion', pluginId, versionId) as Promise<void>,
    remove: (pluginId: string) => ipcRenderer.invoke('plugins:remove', pluginId) as Promise<void>
  },
  proxy: {
    test: (config: ProxyConfig) => ipcRenderer.invoke('proxy:test', config) as Promise<ProxyTestResult>
  },
  /**
   * ProxyStore CRUD —— 由 ProxiesView 调用。`proxy.test` (上面那个) 是轻量的"按 host/port
   * 输入做一次 CONNECT 探测",不持久化结果;ProfileFormDialog 在用户输代理时也用这个做实时
   * 反馈。`proxies.test` 是带 id 的探测,会把结果记到 ProxyStore 条目的 lastTest 字段。
   */
  proxies: {
    list: () => ipcRenderer.invoke('proxies:list') as Promise<Proxy[]>,
    save: (draft: ProxyDraft) => ipcRenderer.invoke('proxies:save', draft) as Promise<Proxy>,
    remove: (id: string) => ipcRenderer.invoke('proxies:remove', id) as Promise<void>,
    bulkImport: (text: string) => ipcRenderer.invoke('proxies:bulkImport', text) as Promise<{
      created: Proxy[]
      reused: Proxy[]
      failed: Array<{ line: string; reason: string }>
    }>,
    test: (id: string) => ipcRenderer.invoke('proxies:test', id) as Promise<
      { ok: true; snapshot: ProxyTestSnapshot } | { ok: false; error: string }
    >
  },
  runtime: {
    info: () => ipcRenderer.invoke('runtime:info') as Promise<RuntimeInfo>
  },
  kernel: {
    status: () => ipcRenderer.invoke('kernel:status') as Promise<KernelStatusMap>,
    install: (kernel: KernelType) => ipcRenderer.invoke('kernel:install', kernel) as Promise<{ ok: boolean; error?: { message: string } }>,
    cancel: (kernel: KernelType) => ipcRenderer.invoke('kernel:cancel', kernel) as Promise<{ ok: boolean }>,
    onProgress: (listener: (progress: KernelInstallProgress) => void) => {
      const handler = (_event: unknown, progress: KernelInstallProgress) => listener(progress)
      ipcRenderer.on('kernel:progress', handler)
      return () => ipcRenderer.removeListener('kernel:progress', handler)
    }
  },
  scripts: {
    list: () => ipcRenderer.invoke('scripts:list') as Promise<Script[]>,
    listRuns: () => ipcRenderer.invoke('scripts:listRuns') as Promise<ScriptRun[]>,
    activeRuns: () => ipcRenderer.invoke('scripts:activeRuns') as Promise<ScriptRun[]>,
    activeByProfile: (profileId: string) =>
      ipcRenderer.invoke('scripts:activeByProfile', profileId) as Promise<ScriptRun | undefined>,
    save: (draft: ScriptDraft) => ipcRenderer.invoke('scripts:save', draft) as Promise<Script>,
    remove: (id: string) => ipcRenderer.invoke('scripts:remove', id) as Promise<void>,
    readSource: (id: string) => ipcRenderer.invoke('scripts:readSource', id) as Promise<string>,
    writeSource: (id: string, source: string) => ipcRenderer.invoke('scripts:writeSource', id, source) as Promise<void>,
    run: (scriptId: string, profileId: string) =>
      ipcRenderer.invoke('scripts:run', scriptId, profileId) as Promise<ScriptRunResult>,
    stop: (runId: string) => ipcRenderer.invoke('scripts:stop', runId) as Promise<void>,
    stopAll: () => ipcRenderer.invoke('scripts:stopAll') as Promise<void>,
    pickExternalFile: () => ipcRenderer.invoke('scripts:pickExternalFile') as Promise<string | undefined>,
    revealInFinder: (filePath: string) => ipcRenderer.invoke('scripts:revealInFinder', filePath) as Promise<void>,
    onEvent: (listener: (event: ScriptRuntimeEvent) => void) => {
      const handler = (_event: unknown, payload: ScriptRuntimeEvent) => listener(payload)
      ipcRenderer.on('scripts:event', handler)
      return () => ipcRenderer.removeListener('scripts:event', handler)
    }
  }
}

contextBridge.exposeInMainWorld('registry', api)
