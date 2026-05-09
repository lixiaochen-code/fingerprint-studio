import { contextBridge, ipcRenderer } from 'electron'
import type { BrowserPlugin, BrowserProfile, KernelInstallProgress, KernelStatusMap, KernelType, ProfileDraft, RuntimeInfo, TargetOsChoice } from './types'

type LaunchResult = { ok: true } | { ok: false; error: { code?: string; kernel?: KernelType; message: string } }

const api = {
  profiles: {
    list: () => ipcRenderer.invoke('profiles:list') as Promise<BrowserProfile[]>,
    save: (draft: ProfileDraft) => ipcRenderer.invoke('profiles:save', draft) as Promise<BrowserProfile>,
    remove: (id: string) => ipcRenderer.invoke('profiles:remove', id) as Promise<void>,
    launch: (id: string) => ipcRenderer.invoke('profiles:launch', id) as Promise<LaunchResult>,
    stop: (id: string) => ipcRenderer.invoke('profiles:stop', id) as Promise<void>,
    status: () => ipcRenderer.invoke('profiles:status'),
    randomFingerprint: (targetOs?: TargetOsChoice) => ipcRenderer.invoke('profiles:randomFingerprint', targetOs)
  },
  plugins: {
    list: () => ipcRenderer.invoke('plugins:list') as Promise<BrowserPlugin[]>,
    importZip: () => ipcRenderer.invoke('plugins:importZip') as Promise<BrowserPlugin | undefined>,
    setActiveVersion: (pluginId: string, versionId: string) => ipcRenderer.invoke('plugins:setActiveVersion', pluginId, versionId) as Promise<void>,
    remove: (pluginId: string) => ipcRenderer.invoke('plugins:remove', pluginId) as Promise<void>
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
  }
}

contextBridge.exposeInMainWorld('registry', api)
