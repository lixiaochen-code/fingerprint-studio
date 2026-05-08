import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('envBrowser', {
  goBack: () => ipcRenderer.send('env:back'),
  goForward: () => ipcRenderer.send('env:forward'),
  reload: () => ipcRenderer.send('env:reload'),
  navigate: (url: string) => ipcRenderer.send('env:navigate', url),
  openPluginPage: (url: string) => ipcRenderer.send('env:openPluginPage', url)
})
