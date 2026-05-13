/// <reference types="vite/client" />

import type { BrowserCrashEvent, BrowserPlugin, BrowserProfile, FingerprintConfig, KernelInstallProgress, KernelStatusMap, KernelType, ProfileDraft, RuntimeInfo, Script, ScriptDraft, ScriptRun, TargetOsChoice } from '../electron/types'
import type { ScriptRuntimeEvent } from '../electron/scripts/runtime'

type LaunchResult = { ok: true } | { ok: false; error: { code?: string; kernel?: KernelType; message: string } }
type ScriptRunResult = { ok: true; run: ScriptRun } | { ok: false; error: { message: string } }

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
      scripts: {
        list: () => Promise<Script[]>
        listRuns: () => Promise<ScriptRun[]>
        activeRuns: () => Promise<ScriptRun[]>
        save: (draft: ScriptDraft) => Promise<Script>
        remove: (id: string) => Promise<void>
        readSource: (id: string) => Promise<string>
        writeSource: (id: string, source: string) => Promise<void>
        run: (scriptId: string, profileId: string) => Promise<ScriptRunResult>
        stop: (runId: string) => Promise<void>
        stopAll: () => Promise<void>
        onEvent: (listener: (event: ScriptRuntimeEvent) => void) => () => void
      }
    }
  }
}
