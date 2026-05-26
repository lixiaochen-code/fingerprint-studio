import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Play, Square, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Tooltip } from '@/components/ui/tooltip'
import { interpolate } from '@/lib/i18n'
import type { BrowserProfile, Proxy, Script, ScriptRun, ScriptRunStatus } from '../../electron/types'
import type { ScriptRuntimeEvent } from '../../electron/scripts/runtime'

type Locale = 'en' | 'zh'

type Translations = {
  panelTitle: string
  selectProfilesHint: string
  noProfiles: string
  noProfilesAction: string
  run: string
  runHint: string
  stopAll: string
  stop: string
  emptyRuns: string
  noProfilesSelected: string
  status_pending: string
  status_running: string
  status_succeeded: string
  status_failed: string
  status_stopped: string
  startFailed: string
  /** profile 已被另一个 run 占用时的提示；用 {{script}} 替换占用脚本的 id（如有） */
  profileBusy: string
  profileBusyUnknown: string
  durationSec: string
  clear: string
  filterAll: string
  proxyNone: string
}

const labels: Record<Locale, Translations> = {
  en: {
    panelTitle: 'Run',
    selectProfilesHint: 'Pick environments to run this script on:',
    noProfiles: 'No environments yet.',
    noProfilesAction: 'Go create one in the Environments tab.',
    run: 'Run',
    runHint: 'Cmd/Ctrl + Enter',
    stopAll: 'Stop all',
    stop: 'Stop',
    emptyRuns: 'No runs yet. Select environments above and press Run.',
    noProfilesSelected: 'Select at least one environment to run.',
    status_pending: 'PENDING',
    status_running: 'RUNNING',
    status_succeeded: 'SUCCEEDED',
    status_failed: 'FAILED',
    status_stopped: 'STOPPED',
    startFailed: 'Failed to start: {{message}}',
    profileBusy: 'This environment is already running script "{{script}}". Stop it first or pick another environment.',
    profileBusyUnknown: 'This environment is already running another script. Stop it first or pick another environment.',
    durationSec: '{{seconds}}s',
    clear: 'Clear finished',
    filterAll: 'All',
    proxyNone: 'No proxy'
  },
  zh: {
    panelTitle: '运行',
    selectProfilesHint: '选择要运行此脚本的环境：',
    noProfiles: '还没有环境。',
    noProfilesAction: '去环境列表新建一个。',
    run: '运行',
    runHint: 'Cmd/Ctrl + Enter',
    stopAll: '全部停止',
    stop: '停止',
    emptyRuns: '还没有运行记录。在上方选择环境，点"运行"。',
    noProfilesSelected: '至少选一个环境再运行。',
    status_pending: '待运行',
    status_running: '运行中',
    status_succeeded: '已成功',
    status_failed: '失败',
    status_stopped: '已停止',
    startFailed: '启动失败：{{message}}',
    profileBusy: '该环境正在运行脚本「{{script}}」，请先停止它或换一个环境。',
    profileBusyUnknown: '该环境正在运行另一个脚本，请先停止它或换一个环境。',
    durationSec: '{{seconds}} 秒',
    clear: '清理已结束',
    filterAll: '全部',
    proxyNone: '无代理'
  }
}

type LogEntry = {
  level: 'info' | 'warn' | 'error' | 'stdout' | 'stderr'
  line: string
  at: string
}

/**
 * 单个 run 在面板里的本地状态。
 * - run：从 runtime 拿到的元数据（startedAt 等）；status 跟着 onEvent 更新
 * - logs：滚动累加；上限 LOG_LINE_LIMIT 防内存爆
 * - profileLabel：缓存 profile 名字，避免列表里 profile 被删后掉信息
 */
type LiveRun = {
  run: ScriptRun
  logs: LogEntry[]
  profileLabel: string
}

const LOG_LINE_LIMIT = 1000
const FINISHED_STATUSES: ScriptRunStatus[] = ['succeeded', 'failed', 'stopped']

function isFinished(status: ScriptRunStatus): boolean {
  return FINISHED_STATUSES.includes(status)
}

function statusTone(status: ScriptRunStatus): string {
  switch (status) {
    case 'running': return 'border-amber-400/40 bg-amber-400/10 text-amber-400'
    case 'succeeded': return 'border-primary/40 bg-primary/10 text-primary'
    case 'failed': return 'border-destructive/40 bg-destructive/10 text-destructive'
    case 'stopped': return 'border-muted-foreground/30 bg-muted/30 text-muted-foreground'
    default: return 'border-muted-foreground/20 bg-muted/20 text-muted-foreground'
  }
}

function logTone(level: LogEntry['level']): string {
  switch (level) {
    case 'warn': return 'text-amber-400'
    case 'error':
    case 'stderr': return 'text-destructive'
    case 'stdout': return 'text-muted-foreground'
    default: return 'text-foreground'
  }
}

export type ScriptRunPanelProps = {
  script: Script
  /** 全部脚本，用来在 PROFILE_BUSY 错误里把占用的 scriptId 换成可读名字 */
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
   * 全局活跃 run 列表。用来：
   * - 不属于当前脚本的占用 → 该 profile chip 灰显 + tooltip 提示占用脚本
   * - 属于当前脚本的占用 → chip 高亮（"已经在跑你这个脚本"）
   * 不传也工作（就是没有占用提示），保持向后兼容
   */
  activeRuns?: ScriptRun[]
  locale: Locale
  /** 空态时点击"去新建环境"的回调；未提供则按钮不显示 */
  onGoToEnvironments?: () => void
}

/**
 * 脚本运行面板。挂在 DetailPane 编辑器下方。
 *
 * 设计要点：
 * - 订阅 window.registry.scripts.onEvent 一次（脚本切换时不取消，因为同一个 panel 实例
 *   始终对应当前选中的 script，只过滤 scriptId 即可）
 * - 切到别的 script，立即清空本地 runs 列表（这一脚本的历史 run 不在本面板展示）
 * - profile 多选：复用现有 BrowserProfile 列表；勾上的并发 run
 * - "Stop all" 仅停本面板范围内的 run（不调 stopAll IPC，那是全局清理）
 */
export function ScriptRunPanel({ script, scripts, profiles, proxies, runningProfileIds, activeRuns, locale, onGoToEnvironments }: ScriptRunPanelProps) {
  const t = labels[locale]
  // selectedProfileIds 是"为当前脚本准备的下次 Run 选区"，每个脚本独立 —— 切脚本时复位。
  const [selectedProfileIds, setSelectedProfileIds] = useState<Set<string>>(new Set())
  // liveRuns 跨脚本保留：用户切回原脚本仍能看见自己 run 的状态/日志。
  // 显示时按 script.id 过滤；count、stopAll、clearFinished 也都基于当前脚本可见的子集。
  const [liveRuns, setLiveRuns] = useState<LiveRun[]>([])
  const [busy, setBusy] = useState(false)

  // 切脚本只复位 profile 选区；liveRuns 保留
  useEffect(() => {
    setSelectedProfileIds(new Set())
  }, [script.id])

  // 当前脚本可见的 run 子集（衍生值，作用于本面板的 UI 与操作范围）
  const visibleRuns = useMemo(
    () => liveRuns.filter((entry) => entry.run.scriptId === script.id),
    [liveRuns, script.id]
  )

  // 订阅 runtime 事件并按 scriptId / runId 路由
  useEffect(() => {
    const unsubscribe = window.registry.scripts.onEvent((event: ScriptRuntimeEvent) => {
      // 'active-changed' 是占用变化广播，没有 runId，本面板不消费它（由 App 顶层订阅一次）
      if (event.type === 'active-changed') return
      setLiveRuns((prev) => {
        const idx = prev.findIndex((entry) => entry.run.id === event.runId)
        if (idx === -1) return prev // 我们没追踪过这个 run（可能是另一个脚本的）
        const entry = prev[idx]
        if (event.type === 'log') {
          const next: LogEntry[] = [...entry.logs, {
            level: event.level,
            line: event.line,
            at: event.at
          }]
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

  // 查名字用：PROFILE_BUSY 错误里只带 scriptId，转成"脚本名"显示更友好
  const scriptNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const s of scripts) map.set(s.id, s.name)
    return map
  }, [scripts])

  // 哪些 profile 已被某个 run 占用：Map<profileId, ScriptRun>
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
      // 并发触发；每个 run 独立成败，不互相阻塞
      const results = await Promise.all(profileIds.map((profileId) =>
        window.registry.scripts.run(script.id, profileId).then((result) => ({ profileId, result }))
      ))
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
            // 启动失败也产出一条占位 run，让用户看到失败原因。
            // PROFILE_BUSY 单独走更友好的本地化文案（带占用脚本名）。
            const profile = profileById.get(profileId)
            const fakeId = `failed_${Date.now().toString(36)}_${profileId}`
            const isBusy = result.error.code === 'PROFILE_BUSY'
            const busyScriptName = isBusy && result.error.occupiedBy
              ? scriptNameById.get(result.error.occupiedBy.scriptId)
              : undefined
            const friendlyMessage = isBusy
              ? (busyScriptName
                  ? interpolate(t.profileBusy, { script: busyScriptName })
                  : t.profileBusyUnknown)
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
              logs: [{
                level: 'error',
                line: friendlyMessage,
                at: new Date().toISOString()
              }],
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

  // ref 跟踪 runSelected 最新版，让全局 keydown 监听器读到最新闭包
  const runSelectedRef = useRef(runSelected)
  runSelectedRef.current = runSelected

  // Cmd/Ctrl + Enter 触发 Run（仅在面板挂载期间生效；切走脚本会卸载并清理监听）
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const isAccel = event.metaKey || event.ctrlKey
      if (!isAccel || event.key !== 'Enter') return
      // 编辑器里按 Cmd+Enter 也算（Monaco 不消费这个组合）；若用户正在 input 输入则放过
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
    // 只停"当前脚本"的活跃 run。其它脚本的 run 由全局抽屉负责（Step 3 实装），
    // 这里不动它们 —— 用户切到另一脚本面板还能看到自己的 run。
    const active = visibleRuns.filter((entry) => !isFinished(entry.run.status))
    await Promise.all(active.map((entry) => window.registry.scripts.stop(entry.run.id)))
  }, [visibleRuns])

  const clearFinished = useCallback(() => {
    // 只清当前脚本已结束的 run；其它脚本的列表不动
    setLiveRuns((prev) => prev.filter((entry) =>
      entry.run.scriptId !== script.id || !isFinished(entry.run.status)
    ))
  }, [script.id])

  const hasActive = visibleRuns.some((entry) => !isFinished(entry.run.status))
  const hasFinished = visibleRuns.some((entry) => isFinished(entry.run.status))

  return (
    <div className="flex h-full flex-col border-t border-border bg-background">
      <header className="flex items-center justify-between border-b border-border bg-secondary/30 px-4 py-2">
        <div className="flex items-center gap-3">
          <h3 className="font-display text-[11px] font-bold uppercase tracking-wider">{t.panelTitle}</h3>
          <span className="font-mono text-[10px] text-muted-foreground">
            {visibleRuns.length > 0 ? `${visibleRuns.filter((r) => !isFinished(r.run.status)).length} / ${visibleRuns.length}` : ''}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {hasFinished && (
            <Button size="sm" variant="ghost" className="h-7 px-2 text-[10px]" onClick={clearFinished}>
              <X className="mr-1 h-3 w-3" />
              {t.clear}
            </Button>
          )}
          {hasActive && (
            <Button size="sm" variant="destructive" className="h-7 px-2 text-[10px]" onClick={() => void stopAllInPanel()}>
              <Square className="mr-1 h-3 w-3 fill-current" />
              {t.stopAll}
            </Button>
          )}
        </div>
      </header>

      <ProfileSelector
        profiles={profiles}
        proxies={proxies}
        runningProfileIds={runningProfileIds}
        selected={selectedProfileIds}
        onToggle={toggleProfile}
        onRun={() => void runSelected()}
        busy={busy}
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
              <RunRow key={entry.run.id} entry={entry} t={t} onStop={() => void stopRun(entry.run.id)} />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function ProfileSelector({
  profiles,
  proxies,
  runningProfileIds,
  selected,
  onToggle,
  onRun,
  busy,
  t,
  onGoToEnvironments,
  currentScriptId,
  occupyByProfileId,
  scriptNameById
}: {
  profiles: BrowserProfile[]
  proxies: Proxy[]
  runningProfileIds: Set<string>
  selected: Set<string>
  onToggle: (id: string, checked: boolean) => void
  onRun: () => void
  busy: boolean
  t: Translations
  onGoToEnvironments?: () => void
  currentScriptId: string
  occupyByProfileId: Map<string, ScriptRun>
  scriptNameById: Map<string, string>
}) {
  if (profiles.length === 0) {
    return (
      <div className="border-b border-border bg-secondary/10 px-4 py-3">
        <p className="text-[11px] text-muted-foreground">{t.noProfiles}</p>
        {onGoToEnvironments && (
          <button
            type="button"
            className="mt-1 text-[11px] text-primary underline-offset-2 hover:underline"
            onClick={onGoToEnvironments}
          >
            {t.noProfilesAction}
          </button>
        )}
      </div>
    )
  }
  return (
    <div className="border-b border-border bg-secondary/10 px-4 py-3 space-y-2">
      <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">{t.selectProfilesHint}</p>
      <div className="flex flex-wrap items-center gap-2">
        {profiles.map((profile) => {
          const isChecked = selected.has(profile.id)
          const isRunning = runningProfileIds.has(profile.id)
          // 占用判定：另一个脚本（不是当前脚本）的 run 占了这个 profile，禁止勾选。
          // 当前脚本自己的 run 在跑也算占用——再勾它点 Run 主进程也会拒，但 UI 提前拦更友好。
          const occupy = occupyByProfileId.get(profile.id)
          const occupiedByOther = occupy && occupy.scriptId !== currentScriptId
          const occupiedBySelf = occupy && occupy.scriptId === currentScriptId
          const isDisabled = Boolean(occupy)
          const occupyingScriptName = occupy ? scriptNameById.get(occupy.scriptId) : undefined
          // 代理显示从 ProxyStore 真源派生:proxyId=null / 找不到都退回"无代理"。
          const proxy = profile.proxyId
            ? proxies.find((entry) => entry.id === profile.proxyId)
            : undefined
          const proxyLabel = proxy ? `${proxy.host}:${proxy.port}` : t.proxyNone
          const tooltipContent = (
            <div className="space-y-0.5">
              <div className="font-bold">{profile.name}</div>
              <div className="font-mono text-[10px] text-muted-foreground">{proxyLabel}</div>
              {occupiedByOther && (
                <div className="font-mono text-[10px] text-amber-400">
                  {interpolate(t.profileBusy, { script: occupyingScriptName ?? '?' })}
                </div>
              )}
              {occupiedBySelf && (
                <div className="font-mono text-[10px] text-amber-400">{t.status_running}</div>
              )}
            </div>
          )
          return (
            <Tooltip key={profile.id} side="top" content={tooltipContent}>
              <label
                className={[
                  'flex items-center gap-2 border px-2 py-1 transition-colors',
                  isDisabled
                    ? 'cursor-not-allowed border-amber-400/30 bg-amber-400/5 text-amber-400 opacity-70'
                    : isChecked
                      ? 'cursor-pointer border-primary bg-primary/10 text-primary'
                      : 'cursor-pointer border-border bg-background hover:bg-muted/30'
                ].join(' ')}
              >
                <Checkbox
                  checked={isChecked}
                  onChange={(value) => onToggle(profile.id, value)}
                  ariaLabel={profile.name}
                  disabled={isDisabled}
                />
                <span className="text-[11px]">{profile.name}</span>
                {isRunning && !occupy && (
                  <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" aria-label="online" />
                )}
                {occupy && (
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" aria-label="scripting" />
                )}
              </label>
            </Tooltip>
          )
        })}
        <div className="ml-auto">
          <Tooltip side="top" content={t.runHint}>
            <Button size="sm" disabled={busy || selected.size === 0} onClick={onRun}>
              <Play className="mr-1 h-3 w-3 fill-current" />
              {t.run}
            </Button>
          </Tooltip>
        </div>
      </div>
    </div>
  )
}

function RunRow({ entry, t, onStop }: { entry: LiveRun; t: Translations; onStop: () => void }) {
  const [expanded, setExpanded] = useState(true)
  const logRef = useRef<HTMLDivElement | null>(null)
  // 用户是否手动滚动过——之后的新日志只在用户在底部时自动跟。
  const stuckToBottomRef = useRef(true)

  const status = entry.run.status
  const finished = isFinished(status)

  // RUNNING 状态下每秒触发一次重渲染，让"已运行 Ns"的秒数实时跳动。
  // 结束之后停掉定时器，节省渲染。
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (finished) return
    const id = window.setInterval(() => setTick((value) => value + 1), 1000)
    return () => window.clearInterval(id)
  }, [finished])

  // 自动滚到底
  useEffect(() => {
    const el = logRef.current
    if (!el || !stuckToBottomRef.current) return
    el.scrollTop = el.scrollHeight
  }, [entry.logs.length])

  const onScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    const el = event.currentTarget
    const distanceFromBottom = el.scrollHeight - el.clientHeight - el.scrollTop
    stuckToBottomRef.current = distanceFromBottom < 12
  }, [])

  const statusLabel = (() => {
    switch (status) {
      case 'pending': return t.status_pending
      case 'running': return t.status_running
      case 'succeeded': return t.status_succeeded
      case 'failed': return t.status_failed
      case 'stopped': return t.status_stopped
    }
  })()

  const duration = useMemo(() => {
    const start = new Date(entry.run.startedAt).getTime()
    const end = entry.run.endedAt ? new Date(entry.run.endedAt).getTime() : Date.now()
    const seconds = Math.max(0, Math.round((end - start) / 1000))
    return interpolate(t.durationSec, { seconds: String(seconds) })
    // tick 是为了运行中的行每秒重算，依赖 lint 不会高兴，所以显式列入
  }, [entry.run.startedAt, entry.run.endedAt, t, tick])

  return (
    <li className="flex flex-col">
      {/*
        这里**不**用 <button>：里面要嵌一个 Stop <button>，HTML 不允许 button 嵌套
        （会触发 hydration error 警告）。改用 div + role/tabIndex 维持键盘可达性。
      */}
      <div
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        className="flex cursor-pointer items-center justify-between gap-3 bg-secondary/20 px-4 py-2 text-left hover:bg-secondary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        onClick={() => setExpanded((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            setExpanded((value) => !value)
          }
        }}
      >
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={`inline-flex border px-1.5 py-0.5 font-mono text-[9px] font-bold tracking-wider ${statusTone(status)}`}
          >
            {statusLabel}
          </span>
          <span className="truncate text-xs font-bold tracking-tight">{entry.profileLabel}</span>
          <span className="font-mono text-[10px] text-muted-foreground">{duration}</span>
        </div>
        <div className="flex items-center gap-2">
          {!finished && (
            <Button
              size="sm"
              variant="destructive"
              className="h-6 px-2 text-[10px]"
              onClick={(event) => {
                // 阻止冒泡到外层 div 否则点 Stop 会顺带把这一行折叠
                event.stopPropagation()
                onStop()
              }}
            >
              <Square className="mr-1 h-3 w-3 fill-current" />
              {t.stop}
            </Button>
          )}
        </div>
      </div>
      {expanded && (
        <div
          ref={logRef}
          onScroll={onScroll}
          className="max-h-64 overflow-y-auto bg-background px-4 py-2 font-mono text-[11px] leading-relaxed"
        >
          {entry.logs.length === 0 ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            entry.logs.map((line, idx) => (
              <div key={idx} className={`whitespace-pre-wrap break-all ${logTone(line.level)}`}>
                <span className="select-none opacity-50">[{line.level}] </span>
                {line.line}
              </div>
            ))
          )}
        </div>
      )}
    </li>
  )
}
