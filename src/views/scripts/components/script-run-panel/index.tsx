import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Play, Square, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip } from '@/components/ui/tooltip'
import { interpolate } from '@/lib/i18n'
import type {
  BrowserProfile,
  Proxy,
  Script,
  ScriptRun
} from '../../../../../electron/types'
import type { ScriptRuntimeEvent } from '../../../../../electron/scripts/runtime'
import { ProfileSelector } from './components/profile-selector'
import { RunRow } from './components/run-row'
import { isFinished } from './helpers'
import { LOG_LINE_LIMIT, type LiveRun, type LogEntry } from './types'
import { labels, type Locale } from './translations'

export interface ScriptRunPanelProps {
  script: Script
  /** 全部脚本,用来在 PROFILE_BUSY 错误里把占用的 scriptId 换成可读名字 */
  scripts: Script[]
  profiles: BrowserProfile[]
  /**
   * ProxyStore 真源。tooltip 里显示代理 host:port 时按 profile.proxyId 查这里;
   * 不传或 proxyId 命不中 → 显示"无代理"。inline profile.proxy 字段已是 deprecated
   * 兼容镜像,在"无代理"语义下为空,不能再当显示来源用。
   */
  proxies: Proxy[]
  runningProfileIds: Set<string>
  /**
   * 全局活跃 run 列表。用来:
   * - 不属于当前脚本的占用 → 该 profile chip 灰显 + tooltip 提示占用脚本
   * - 属于当前脚本的占用 → chip 高亮("已经在跑你这个脚本")
   * 不传也工作(就是没有占用提示),保持向后兼容
   */
  activeRuns?: ScriptRun[]
  locale: Locale
  /** 空态时点击"去新建环境"的回调;未提供则按钮不显示 */
  onGoToEnvironments?: () => void
}

/**
 * 脚本运行面板。挂在 DetailPane 编辑器下方。
 *
 * 设计要点:
 * - 订阅 window.registry.scripts.onEvent 一次(脚本切换时不取消,因为同一个 panel 实例
 *   始终对应当前选中的 script,只过滤 scriptId 即可)
 * - 切到别的 script,立即清空本地 selectedProfileIds 选区;liveRuns 跨脚本保留,
 *   切回原脚本仍能看见自己 run 的状态/日志
 * - profile 多选:复用现有 BrowserProfile 列表;勾上的并发 run
 * - "Stop all" 仅停本面板范围内的 run(不调 stopAll IPC,那是全局清理)
 */
export function ScriptRunPanel({
  script,
  scripts,
  profiles,
  proxies,
  runningProfileIds,
  activeRuns,
  locale,
  onGoToEnvironments
}: ScriptRunPanelProps) {
  const t = labels[locale]
  // selectedProfileIds 是"为当前脚本准备的下次 Run 选区",每个脚本独立 —— 切脚本时复位。
  const [selectedProfileIds, setSelectedProfileIds] = useState<Set<string>>(new Set())
  // liveRuns 跨脚本保留:用户切回原脚本仍能看见自己 run 的状态/日志。
  // 显示时按 script.id 过滤;count、stopAll、clearFinished 也都基于当前脚本可见的子集。
  const [liveRuns, setLiveRuns] = useState<LiveRun[]>([])
  const [busy, setBusy] = useState(false)

  // 切脚本只复位 profile 选区;liveRuns 保留
  useEffect(() => {
    setSelectedProfileIds(new Set())
  }, [script.id])

  // 当前脚本可见的 run 子集(衍生值,作用于本面板的 UI 与操作范围)
  const visibleRuns = useMemo(
    () => liveRuns.filter((entry) => entry.run.scriptId === script.id),
    [liveRuns, script.id]
  )

  // 订阅 runtime 事件并按 scriptId / runId 路由
  useEffect(() => {
    const unsubscribe = window.registry.scripts.onEvent((event: ScriptRuntimeEvent) => {
      // 'active-changed' 是占用变化广播,没有 runId,本面板不消费它(由 App 顶层订阅一次)
      if (event.type === 'active-changed') return
      setLiveRuns((prev) => {
        const idx = prev.findIndex((entry) => entry.run.id === event.runId)
        if (idx === -1) return prev // 我们没追踪过这个 run(可能是另一个脚本的)
        const entry = prev[idx]
        if (event.type === 'log') {
          const next: LogEntry[] = [
            ...entry.logs,
            {
              level: event.level,
              line: event.line,
              at: event.at
            }
          ]
          if (next.length > LOG_LINE_LIMIT) next.splice(0, next.length - LOG_LINE_LIMIT)
          const updated: LiveRun = { ...entry, logs: next }
          return [...prev.slice(0, idx), updated, ...prev.slice(idx + 1)]
        }
        if (event.type === 'status') {
          const updated: LiveRun = {
            ...entry,
            run: {
              ...entry.run,
              status: event.status,
              endedAt: event.endedAt,
              exitCode: event.exitCode,
              error: event.error
            }
          }
          return [...prev.slice(0, idx), updated, ...prev.slice(idx + 1)]
        }
        return prev
      })
    })
    return () => unsubscribe()
  }, [])

  const profileById = useMemo(() => {
    const map = new Map<string, BrowserProfile>()
    for (const p of profiles) map.set(p.id, p)
    return map
  }, [profiles])

  // 查名字用:PROFILE_BUSY 错误里只带 scriptId,转成"脚本名"显示更友好
  const scriptNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const s of scripts) map.set(s.id, s.name)
    return map
  }, [scripts])

  // 哪些 profile 已被某个 run 占用:Map<profileId, ScriptRun>
  // ProfileSelector 用来 chip 灰显 + tooltip 提示。
  const occupyByProfileId = useMemo(() => {
    const map = new Map<string, ScriptRun>()
    if (activeRuns) for (const run of activeRuns) map.set(run.profileId, run)
    return map
  }, [activeRuns])

  const toggleProfile = useCallback((id: string, checked: boolean) => {
    setSelectedProfileIds((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }, [])

  const runSelected = useCallback(async () => {
    if (selectedProfileIds.size === 0) return
    setBusy(true)
    try {
      const profileIds = Array.from(selectedProfileIds)
      // 并发触发;每个 run 独立成败,不互相阻塞
      const results = await Promise.all(
        profileIds.map((profileId) =>
          window.registry.scripts.run(script.id, profileId).then((result) => ({ profileId, result }))
        )
      )
      setLiveRuns((prev) => {
        const next = [...prev]
        for (const { profileId, result } of results) {
          if (result.ok) {
            const profile = profileById.get(profileId)
            next.push({
              run: result.run,
              logs: [],
              profileLabel: profile?.name ?? profileId
            })
          } else {
            // 启动失败也产出一条占位 run,让用户看到失败原因。
            // PROFILE_BUSY 单独走更友好的本地化文案(带占用脚本名)。
            const profile = profileById.get(profileId)
            const fakeId = `failed_${Date.now().toString(36)}_${profileId}`
            const isBusyError = result.error.code === 'PROFILE_BUSY'
            const busyScriptName =
              isBusyError && result.error.occupiedBy
                ? scriptNameById.get(result.error.occupiedBy.scriptId)
                : undefined
            const friendlyMessage = isBusyError
              ? busyScriptName
                ? interpolate(t.profileBusy, { script: busyScriptName })
                : t.profileBusyUnknown
              : interpolate(t.startFailed, { message: result.error.message })

            next.push({
              run: {
                id: fakeId,
                scriptId: script.id,
                profileId,
                status: 'failed',
                startedAt: new Date().toISOString(),
                endedAt: new Date().toISOString(),
                error: friendlyMessage,
                logPath: ''
              },
              logs: [
                {
                  level: 'error',
                  line: friendlyMessage,
                  at: new Date().toISOString()
                }
              ],
              profileLabel: profile?.name ?? profileId
            })
          }
        }
        return next
      })
    } finally {
      setBusy(false)
    }
  }, [script.id, selectedProfileIds, profileById, scriptNameById, t])

  // ref 跟踪 runSelected 最新版,让全局 keydown 监听器读到最新闭包
  const runSelectedRef = useRef(runSelected)
  runSelectedRef.current = runSelected

  // Cmd/Ctrl + Enter 触发 Run(仅在面板挂载期间生效;切走脚本会卸载并清理监听)
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const isAccel = event.metaKey || event.ctrlKey
      if (!isAccel || event.key !== 'Enter') return
      // 编辑器里按 Cmd+Enter 也算(Monaco 不消费这个组合);若用户正在 input 输入则放过
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return
      event.preventDefault()
      void runSelectedRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const stopRun = useCallback(async (runId: string) => {
    await window.registry.scripts.stop(runId)
  }, [])

  const stopAllInPanel = useCallback(async () => {
    // 只停"当前脚本"的活跃 run。其它脚本的 run 由全局抽屉负责(Step 3 实装),
    // 这里不动它们 —— 用户切到另一脚本面板还能看到自己的 run。
    const active = visibleRuns.filter((entry) => !isFinished(entry.run.status))
    await Promise.all(active.map((entry) => window.registry.scripts.stop(entry.run.id)))
  }, [visibleRuns])

  const clearFinished = useCallback(() => {
    // 只清当前脚本已结束的 run;其它脚本的列表不动
    setLiveRuns((prev) =>
      prev.filter((entry) => entry.run.scriptId !== script.id || !isFinished(entry.run.status))
    )
  }, [script.id])

  const hasActive = visibleRuns.some((entry) => !isFinished(entry.run.status))
  const hasFinished = visibleRuns.some((entry) => isFinished(entry.run.status))

  return (
    <div className="flex h-full w-full flex-col border-t border-border bg-background">
      <header className="flex items-center justify-between gap-3 border-b border-border bg-secondary/30 px-4 py-2">
        <div className="flex min-w-0 items-center gap-3">
          <h3 className="font-display text-[11px] font-bold uppercase tracking-wider">
            {t.panelTitle}
          </h3>
          <span className="font-mono text-[10px] text-muted-foreground">
            {visibleRuns.length > 0
              ? `${visibleRuns.filter((r) => !isFinished(r.run.status)).length} / ${visibleRuns.length}`
              : ''}
          </span>
          {/* 选区摘要:profile chip 多到挤的时候,header 这里仍能一眼看到"选了几个" */}
          {profiles.length > 0 && (
            <span className="font-mono text-[10px] text-muted-foreground">
              {selectedProfileIds.size > 0
                ? interpolate(t.selectionSummary, { count: String(selectedProfileIds.size) })
                : t.selectionEmpty}
            </span>
          )}
        </div>
        <div className="flex flex-none items-center gap-2">
          {hasFinished && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-[10px]"
              onClick={clearFinished}
            >
              <X className="mr-1 h-3 w-3" />
              {t.clear}
            </Button>
          )}
          {hasActive && (
            <Button
              size="sm"
              variant="destructive"
              className="h-7 px-2 text-[10px]"
              onClick={() => void stopAllInPanel()}
            >
              <Square className="mr-1 h-3 w-3 fill-current" />
              {t.stopAll}
            </Button>
          )}
          {/*
            Run 按钮提到 header 右上,固定位置不会被 chip 流推走,也避免在 ProfileSelector
            内挤到第二行被忽略。Cmd/Ctrl+Enter 仍可用。
          */}
          <Tooltip side="bottom" content={t.runHint}>
            <Button
              size="sm"
              className="h-7 px-3 text-[10px]"
              disabled={busy || selectedProfileIds.size === 0 || profiles.length === 0}
              onClick={() => void runSelected()}
            >
              <Play className="mr-1 h-3 w-3 fill-current" />
              {t.run}
            </Button>
          </Tooltip>
        </div>
      </header>

      <ProfileSelector
        profiles={profiles}
        proxies={proxies}
        runningProfileIds={runningProfileIds}
        selected={selectedProfileIds}
        onToggle={toggleProfile}
        t={t}
        onGoToEnvironments={onGoToEnvironments}
        currentScriptId={script.id}
        occupyByProfileId={occupyByProfileId}
        scriptNameById={scriptNameById}
      />

      <div className="flex-1 overflow-hidden">
        {visibleRuns.length === 0 ? (
          <div className="flex h-full items-center justify-center px-4 text-center">
            <p className="text-[11px] text-muted-foreground">{t.emptyRuns}</p>
          </div>
        ) : (
          <ul className="flex h-full flex-col divide-y divide-border overflow-y-auto">
            {visibleRuns.map((entry) => (
              <RunRow
                key={entry.run.id}
                entry={entry}
                t={t}
                onStop={() => void stopRun(entry.run.id)}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

export default ScriptRunPanel
