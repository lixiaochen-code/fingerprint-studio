/// <reference types="vite/client" />

import type { BrowserCrashEvent, BrowserPlugin, BrowserProfile, FingerprintConfig, KernelInstallProgress, KernelStatusMap, KernelType, ProfileDraft, RuntimeInfo, TargetOsChoice } from '../electron/types'

type LaunchResult = { ok: true } | { ok: false; error: { code?: string; kernel?: KernelType; message: string } }

declare global {
  interface Window {
    registry: {
      profiles: {
        list: () => Promise<BrowserProfile[]>
        save: (draft: ProfileDraft) => Promise<BrowserProfile>
        remove: (id: string) => Promise<void>
        duplicate: (id: string) => Promise<BrowserProfile>
        launch: (id: string) => Promise<LaunchResult>
        stop: (id: string) => Promise<void>
        status: () => Promise<Array<{ profileId: string; running: boolean }>>
        randomFingerprint: (targetOs?: TargetOsChoice) => Promise<FingerprintConfig>
        onCrashed: (listener: (event: BrowserCrashEvent) => void) => () => void
      }
      plugins: {
        list: () => Promise<BrowserPlugin[]>
        importZip: () => Promise<BrowserPlugin | undefined>
        setActiveVersion: (pluginId: string, versionId: string) => Promise<void>
        remove: (pluginId: string) => Promise<void>
      }
      runtime: {
        info: () => Promise<RuntimeInfo>
      }
      kernel: {
        status: () => Promise<KernelStatusMap>
        install: (kernel: KernelType) => Promise<{ ok: boolean; error?: { message: string }; alreadyRunning?: boolean }>
        cancel: (kernel: KernelType) => Promise<{ ok: boolean }>
        onProgress: (listener: (progress: KernelInstallProgress) => void) => () => void
      }
    }
  }
}
