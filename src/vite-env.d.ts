/// <reference types="vite/client" />

import type { BrowserPlugin, BrowserProfile, FingerprintConfig, ProfileDraft } from '../electron/types'

declare global {
  interface Window {
    registry: {
      profiles: {
        list: () => Promise<BrowserProfile[]>
        save: (draft: ProfileDraft) => Promise<BrowserProfile>
        remove: (id: string) => Promise<void>
        launch: (id: string) => Promise<void>
        stop: (id: string) => Promise<void>
        status: () => Promise<Array<{ profileId: string; running: boolean }>>
        randomFingerprint: () => Promise<FingerprintConfig>
      }
      plugins: {
        list: () => Promise<BrowserPlugin[]>
        importZip: () => Promise<BrowserPlugin | undefined>
        setActiveVersion: (pluginId: string, versionId: string) => Promise<void>
        remove: (pluginId: string) => Promise<void>
      }
      runtime: {
        info: () => Promise<{
          browserPath: string
          browserKind: 'chromium' | 'chrome-for-testing' | 'custom'
          fingerprintMode: 'off' | 'extension' | 'itbrowser'
          fingerprintSpoofingEnabled: boolean
          managedBrowserCacheDir: string
        }>
      }
    }
    envBrowser?: {
      goBack: () => void
      goForward: () => void
      reload: () => void
      navigate: (url: string) => void
      openPluginPage: (url: string) => void
    }
  }
}
