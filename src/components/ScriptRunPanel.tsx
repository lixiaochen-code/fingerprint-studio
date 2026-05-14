import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Play, Square, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Tooltip } from '@/components/ui/tooltip'
import { interpolate } from '@/lib/i18n'
import type { BrowserProfile, Script, ScriptRun, ScriptRunStatus } from '../../electron/types'
import type { ScriptRuntimeEvent } from '../../electron/scripts/runtime'

type Locale = 'en' | 'zh'

type Translations = {
  panelTitle: string
  selectProfilesHint: string
  noProfiles: string
  run: string
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
  durationSec: string
  clear: string
  filterAll: string
}

const labels: Record<Locale, Translations> = {
  en: {
    panelTitle: 'Run',
    selectProfilesHint: 'Pick environments to run this script on:',
    noProfiles: 'No environments yet. Create one in the Environments tab first.',
    run: 'Run',
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
    durationSec: '{{seconds}}s',
    clear: 'Clear finished',
    filterAll: 'All'
  },
  zh: {
    panelTitle: '运行',
    selectProfilesHint: '选择要运行此脚本的环境：',
    noProfiles: '还没有环境，先去环境列表新建一个。',
    run: '运行',
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
    durationSec: '{{seconds}} 秒',
    clear: '清理已结束',
    filterAll: '全部'
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
  profiles: BrowserProfile[]
  runningProfileIds: Set<string>
  locale: Locale
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
export function ScriptRunPanel({ script, profiles, runningProfileIds, locale }: ScriptRunPanelProps) {
  const t = labels[locale]
  const [selectedProfileIds, setSelectedProfileIds] = useState<Set<string>>(new Set())
  const [liveRuns, setLiveRuns] = useState<LiveRun[]>([])
  const [busy, setBusy] = useState(false)

  // 切换脚本时复位
  useEffect(() => {
    setLiveRuns([])
    setSelectedProfileIds(new Set())
  }, [script.id])

  // 订阅 runtime 事件并按 scriptId / runId 路由
  useEffect(() => {
    const unsubscribe = window.registry.scripts.onEvent((event: ScriptRuntimeEvent) => {
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
            // 启动失败也产出一条占位 run，让用户看到失败原因
            const profile = profileById.get(profileId)
            const fakeId = `failed_${Date.now().toString(36)}_${profileId}`
            next.push({
              run: {
                id: fakeId,
                scriptId: script.id,
                profileId,
                status: 'failed',
                startedAt: new Date().toISOString(),
                endedAt: new Date().toISOString(),
                error: result.error.message,
                logPath: ''
              },
              logs: [{
                level: 'error',
                line: interpolate(t.startFailed, { message: result.error.message }),
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
  }, [script.id, selectedProfileIds, profileById, t])

  const stopRun = useCallback(async (runId: string) => {
    await window.registry.scripts.stop(runId)
  }, [])

  const stopAllInPanel = useCallback(async () => {
    const active = liveRuns.filter((entry) => !isFinished(entry.run.status))
    await Promise.all(active.map((entry) => window.registry.scripts.stop(entry.run.id)))
  }, [liveRuns])

  const clearFinished = useCallback(() => {
    setLiveRuns((prev) => prev.filter((entry) => !isFinished(entry.run.status)))
  }, [])

  const hasActive = liveRuns.some((entry) => !isFinished(entry.run.status))
  const hasFinished = liveRuns.some((entry) => isFinished(entry.run.status))

  return (
    <div className="flex h-full flex-col border-t border-border bg-background">
      <header className="flex items-center justify-between border-b border-border bg-secondary/30 px-4 py-2">
        <div className="flex items-center gap-3">
          <h3 className="font-display text-[11px] font-bold uppercase tracking-wider">{t.panelTitle}</h3>
          <span className="font-mono text-[10px] text-muted-foreground">
            {liveRuns.length > 0 ? `${liveRuns.filter((r) => !isFinished(r.run.status)).length} / ${liveRuns.length}` : ''}
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
        runningProfileIds={runningProfileIds}
        selected={selectedProfileIds}
        onToggle={toggleProfile}
        onRun={() => void runSelected()}
        busy={busy}
        t={t}
      />

      <div className="flex-1 overflow-hidden">
        {liveRuns.length === 0 ? (
          <div className="flex h-full items-center justify-center px-4 text-center">
            <p className="text-[11px] text-muted-foreground">{t.emptyRuns}</p>
          </div>
        ) : (
          <ul className="flex h-full flex-col divide-y divide-border overflow-y-auto">
            {liveRuns.map((entry) => (
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
  runningProfileIds,
  selected,
  onToggle,
  onRun,
  busy,
  t
}: {
  profiles: BrowserProfile[]
  runningProfileIds: Set<string>
  selected: Set<string>
  onToggle: (id: string, checked: boolean) => void
  onRun: () => void
  busy: boolean
  t: Translations
}) {
  if (profiles.length === 0) {
    return (
      <div className="border-b border-border bg-secondary/10 px-4 py-3">
        <p className="text-[11px] text-muted-foreground">{t.noProfiles}</p>
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
          return (
            <Tooltip
              key={profile.id}
              side="top"
              content={
                <div className="space-y-0.5">
                  <div className="font-bold">{profile.name}</div>
                  <div className="font-mono text-[10px] text-muted-foreground">{profile.proxy.host}:{profile.proxy.port}</div>
                </div>
              }
            >
              <label
                className={`flex cursor-pointer items-center gap-2 border px-2 py-1 transition-colors ${isChecked ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-background hover:bg-muted/30'}`}
              >
                <Checkbox
                  checked={isChecked}
                  onChange={(value) => onToggle(profile.id, value)}
                  ariaLabel={profile.name}
                />
                <span className="text-[11px]">{profile.name}</span>
                {isRunning && (
                  <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" aria-label="online" />
                )}
              </label>
            </Tooltip>
          )
        })}
        <div className="ml-auto">
          <Button size="sm" disabled={busy || selected.size === 0} onClick={onRun}>
            <Play className="mr-1 h-3 w-3 fill-current" />
            {t.run}
          </Button>
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

  const status = entry.run.status
  const finished = isFinished(status)
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
  }, [entry.run.startedAt, entry.run.endedAt, t, status])

  return (
    <li className="flex flex-col">
      <button
        type="button"
        className="flex items-center justify-between gap-3 bg-secondary/20 px-4 py-2 text-left hover:bg-secondary/40"
        onClick={() => setExpanded((value) => !value)}
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
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          {!finished && (
            <Button size="sm" variant="destructive" className="h-6 px-2 text-[10px]" onClick={onStop}>
              <Square className="mr-1 h-3 w-3 fill-current" />
              {t.stop}
            </Button>
          )}
        </div>
      </button>
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
