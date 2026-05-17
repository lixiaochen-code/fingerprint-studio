import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { Activity, ExternalLink, Square, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip } from '@/components/ui/tooltip'
import { interpolate } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import type { BrowserProfile, Script, ScriptRun } from '../../electron/types'

type Locale = 'en' | 'zh'

type Translations = {
  buttonLabel: string
  popupTitle: string
  empty: string
  goToScript: string
  stop: string
  durationSec: string
  unknownScript: string
  unknownProfile: string
}

const labels: Record<Locale, Translations> = {
  en: {
    buttonLabel: 'Active script runs',
    popupTitle: 'Active runs',
    empty: 'No scripts running.',
    goToScript: 'Open script',
    stop: 'Stop',
    durationSec: '{{seconds}}s',
    unknownScript: '(deleted script)',
    unknownProfile: '(unknown environment)'
  },
  zh: {
    buttonLabel: '活跃脚本运行',
    popupTitle: '运行中的脚本',
    empty: '当前没有脚本在跑。',
    goToScript: '打开脚本',
    stop: '停止',
    durationSec: '{{seconds}} 秒',
    unknownScript: '（已删除）',
    unknownProfile: '（未知环境）'
  }
}

export type ActiveRunsButtonProps = {
  locale: Locale
  activeRuns: ScriptRun[]
  scripts: Script[]
  profiles: BrowserProfile[]
  /** 跳到目标脚本：切到 Scripts 视图 + 选中该 script */
  onOpenScript: (scriptId: string) => void
}

/**
 * Header 上的全局"活跃脚本"按钮 + 浮层。
 * 设计要点：
 * - 按钮：Activity 图标，活跃数 > 0 时右上角红色圆点 + 数字
 * - 浮层：用 Radix Dialog 渲染（自动 focus trap + Esc 关 + 点外部关），
 *   定位用 fixed top-right 而不是默认居中，看起来像下拉浮窗
 * - 每条 run 行：脚本名 / 环境名 / 已运行时长 / Stop / Open script
 * - "Open script" 关闭浮层并把视图切到那个脚本面板
 */
export function ActiveRunsButton({ locale, activeRuns, scripts, profiles, onOpenScript }: ActiveRunsButtonProps) {
  const t = labels[locale]
  const [open, setOpen] = useState(false)

  const scriptById = useMemo(() => {
    const map = new Map<string, Script>()
    for (const s of scripts) map.set(s.id, s)
    return map
  }, [scripts])

  const profileById = useMemo(() => {
    const map = new Map<string, BrowserProfile>()
    for (const p of profiles) map.set(p.id, p)
    return map
  }, [profiles])

  const count = activeRuns.length
  const hasActive = count > 0

  const stopRun = useCallback((runId: string) => {
    void window.registry.scripts.stop(runId)
  }, [])

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <Tooltip side="bottom" content={t.buttonLabel}>
        <DialogPrimitive.Trigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="relative h-9 w-9 p-0"
            aria-label={t.buttonLabel}
          >
            <Activity className={cn('h-4 w-4', hasActive ? 'text-primary' : 'text-muted-foreground')} />
            {hasActive && (
              <span
                aria-hidden
                className="absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground tabular-nums"
              >
                {count > 99 ? '99+' : count}
              </span>
            )}
          </Button>
        </DialogPrimitive.Trigger>
      </Tooltip>

      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn(
            'fixed inset-0 z-90 bg-background/40 backdrop-blur-[1px]',
            'data-[state=open]:animate-in data-[state=open]:fade-in-0',
            'data-[state=closed]:animate-out data-[state=closed]:fade-out-0'
          )}
        />
        <DialogPrimitive.Content
          // 用 fixed 定位贴在视口右上，看起来像 Header 按钮的下拉浮窗。
          // 不用 Radix Popover 是为了避免再装一个依赖；Dialog 在这里
          // 提供的 focus trap / Esc 关 行为同样合用。
          className={cn(
            'fixed right-4 top-16 z-100 w-[420px] max-w-[calc(100vw-2rem)]',
            'border border-border bg-secondary shadow-xl outline-none',
            'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-top-2',
            'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2'
          )}
        >
          <header className="flex items-center justify-between border-b border-border px-4 py-2">
            <DialogPrimitive.Title className="font-display text-xs font-bold uppercase tracking-wider">
              {t.popupTitle}{hasActive ? ` · ${count}` : ''}
            </DialogPrimitive.Title>
            <DialogPrimitive.Close
              className="text-muted-foreground transition-colors hover:text-foreground"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </DialogPrimitive.Close>
          </header>

          {!hasActive ? (
            <div className="p-6 text-center text-[11px] text-muted-foreground">{t.empty}</div>
          ) : (
            <ul className="max-h-[60vh] divide-y divide-border overflow-y-auto">
              {activeRuns.map((run) => (
                <ActiveRunRow
                  key={run.id}
                  run={run}
                  script={scriptById.get(run.scriptId)}
                  profile={profileById.get(run.profileId)}
                  t={t}
                  onStop={() => stopRun(run.id)}
                  onOpenScript={() => {
                    onOpenScript(run.scriptId)
                    setOpen(false)
                  }}
                />
              ))}
            </ul>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

function ActiveRunRow({
  run,
  script,
  profile,
  t,
  onStop,
  onOpenScript
}: {
  run: ScriptRun
  script: Script | undefined
  profile: BrowserProfile | undefined
  t: Translations
  onStop: () => void
  onOpenScript: () => void
}) {
  // 1s 心跳让"已运行 N 秒"实时更新；浮层关闭整个组件卸载，setInterval 自动清掉
  const [tick, setTick] = useState(0)
  useTick(() => setTick((value) => value + 1))

  const seconds = useMemo(() => {
    const start = new Date(run.startedAt).getTime()
    return Math.max(0, Math.round((Date.now() - start) / 1000))
    // tick 是为了每秒触发重算，必须列入依赖
  }, [run.startedAt, tick])

  return (
    <li className="flex items-start justify-between gap-3 px-4 py-3">
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex items-center gap-2">
          <span className="inline-flex border border-amber-400/40 bg-amber-400/10 px-1.5 py-0.5 font-mono text-[9px] font-bold tracking-wider text-amber-400">
            RUNNING
          </span>
          <span className="truncate text-xs font-bold tracking-tight">
            {script?.name ?? t.unknownScript}
          </span>
        </div>
        <div className="truncate font-mono text-[10px] text-muted-foreground">
          {profile?.name ?? t.unknownProfile} · {interpolate(t.durationSec, { seconds: String(seconds) })}
        </div>
      </div>
      <div className="flex items-center gap-1">
        <Tooltip side="top" content={t.goToScript}>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            aria-label={t.goToScript}
            onClick={onOpenScript}
            disabled={!script}
          >
            <ExternalLink className="h-3 w-3" />
          </Button>
        </Tooltip>
        <Button
          variant="destructive"
          size="sm"
          className="h-7 px-2 text-[10px]"
          onClick={onStop}
        >
          <Square className="mr-1 h-3 w-3 fill-current" />
          {t.stop}
        </Button>
      </div>
    </li>
  )
}

/**
 * 1 秒心跳的小钩子。装一个 setInterval，组件卸载时清掉。提取出来一是复用、二是
 * 让 ActiveRunRow 主体更聚焦——它只关心"每秒重算下时长"。
 */
function useTick(callback: () => void) {
  // 用 ref 避开"useEffect 依赖回调可能造成的反复 setInterval"陷阱
  const callbackRef = useRef(callback)
  callbackRef.current = callback
  useEffect(() => {
    const id = window.setInterval(() => callbackRef.current(), 1000)
    return () => window.clearInterval(id)
  }, [])
}
