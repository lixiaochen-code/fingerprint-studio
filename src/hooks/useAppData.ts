import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  BrowserCrashEvent,
  BrowserPlugin,
  BrowserProfile,
  Proxy,
  RuntimeInfo,
  Script,
  ScriptRun
} from '../../electron/types'

export interface AppData {
  profiles: BrowserProfile[]
  plugins: BrowserPlugin[]
  proxies: Proxy[]
  scripts: Script[]
  runningIds: Set<string>
  runtimeInfo: RuntimeInfo | undefined
  activeRuns: ScriptRun[]
  /** 强制重新拉取一次全套数据。业务函数(launch/stop/save/...)成功后调用。 */
  reload: () => Promise<void>
}

export interface UseAppDataOptions {
  /** 浏览器异常退出时的回调(toast / 日志展示由调用方决定);hook 自己只负责重新 reload。 */
  onBrowserCrashed?: (event: BrowserCrashEvent) => void
  /** 轮询间隔 ms,默认 3000。测试或低频场景可以改 */
  pollIntervalMs?: number
}

/**
 * 应用核心数据 hook。把 App.tsx 里"5 个 useEffect 维护 7 个 setState"那一坨拉进来:
 *
 * 1. 启动一次 + 每 `pollIntervalMs` 一次 `reload()` —— 用一份 Promise.all 拉全部主进程数据
 * 2. 订阅 `profiles:crashed`,触发 onBrowserCrashed 后 reload
 * 3. 订阅 `scripts:'active-changed'`,直接刷新 activeRuns;启动时也主动拉一次兜底
 *
 * 设计:
 * - reload 暴露出去,业务函数(launch / stop / save / ...)在 IPC 完成后调用一次同步真源
 * - **不**做"乐观更新":主进程的 ProfileStore / ScriptRuntime 是状态真源,渲染层只镜像
 * - 不接入 toast / i18n —— 这些是 view 层关注点,hook 只管数据
 */
export function useAppData(options: UseAppDataOptions = {}): AppData {
  const { onBrowserCrashed, pollIntervalMs = 3000 } = options

  const [profiles, setProfiles] = useState<BrowserProfile[]>([])
  const [plugins, setPlugins] = useState<BrowserPlugin[]>([])
  const [proxies, setProxies] = useState<Proxy[]>([])
  const [scripts, setScripts] = useState<Script[]>([])
  const [runningIds, setRunningIds] = useState<Set<string>>(new Set())
  const [runtimeInfo, setRuntimeInfo] = useState<RuntimeInfo>()
  const [activeRuns, setActiveRuns] = useState<ScriptRun[]>([])

  const reload = useCallback(async () => {
    const [nextProfiles, nextPlugins, statuses, nextRuntimeInfo, nextScripts, nextProxies] =
      await Promise.all([
        window.registry.profiles.list(),
        window.registry.plugins.list(),
        window.registry.profiles.status(),
        window.registry.runtime.info(),
        window.registry.scripts.list(),
        window.registry.proxies.list()
      ])
    setProfiles(nextProfiles)
    setPlugins(nextPlugins)
    setProxies(nextProxies)
    setScripts(nextScripts)
    setRuntimeInfo(nextRuntimeInfo)
    setRunningIds(
      new Set(statuses.filter((status) => status.running).map((status) => status.profileId))
    )
  }, [])

  // 用 ref 跟踪最新 onBrowserCrashed,避免回调引用变了就要重订阅整个 IPC 通道
  const onCrashRef = useRef(onBrowserCrashed)
  onCrashRef.current = onBrowserCrashed

  // 周期性拉取 + 启动一次性首拉
  useEffect(() => {
    void reload()
    const timer = window.setInterval(() => void reload(), pollIntervalMs)
    return () => window.clearInterval(timer)
  }, [reload, pollIntervalMs])

  // 浏览器崩溃订阅(主进程触发):reload + 透出回调
  useEffect(() => {
    const unsubscribe = window.registry.profiles.onCrashed((event) => {
      onCrashRef.current?.(event)
      void reload()
    })
    return () => unsubscribe()
  }, [reload])

  // 活跃 run 订阅:启动拉一次 + 订阅 'active-changed'。
  // cancelled 守卫防止 unmount 后异步 setState。
  useEffect(() => {
    let cancelled = false
    void window.registry.scripts.activeRuns().then((initial) => {
      if (!cancelled) setActiveRuns(initial)
    })
    const unsubscribe = window.registry.scripts.onEvent((event) => {
      if (event.type === 'active-changed') setActiveRuns(event.active)
    })
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  return {
    profiles,
    plugins,
    proxies,
    scripts,
    runningIds,
    runtimeInfo,
    activeRuns,
    reload
  }
}
