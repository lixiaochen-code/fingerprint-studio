import { contextBridge, ipcRenderer } from 'electron'
import type { BrowserPlugin, BrowserProfile, ProfileDraft } from './types'

const api = {
  profiles: {
    list: () => ipcRenderer.invoke('profiles:list') as Promise<BrowserProfile[]>,
    save: (draft: ProfileDraft) => ipcRenderer.invoke('profiles:save', draft) as Promise<BrowserProfile>,
    remove: (id: string) => ipcRenderer.invoke('profiles:remove', id) as Promise<void>,
    launch: (id: string) => ipcRenderer.invoke('profiles:launch', id) as Promise<void>,
    stop: (id: string) => ipcRenderer.invoke('profiles:stop', id) as Promise<void>,
    status: () => ipcRenderer.invoke('profiles:status'),
    randomFingerprint: () => ipcRenderer.invoke('profiles:randomFingerprint')
  },
  plugins: {
    list: () => ipcRenderer.invoke('plugins:list') as Promise<BrowserPlugin[]>,
    importZip: () => ipcRenderer.invoke('plugins:importZip') as Promise<BrowserPlugin | undefined>,
    setActiveVersion: (pluginId: string, versionId: string) => ipcRenderer.invoke('plugins:setActiveVersion', pluginId, versionId) as Promise<void>,
    remove: (pluginId: string) => ipcRenderer.invoke('plugins:remove', pluginId) as Promise<void>
  },
  runtime: {
    info: () => ipcRenderer.invoke('runtime:info')
  }
}

contextBridge.exposeInMainWorld('registry', api)
