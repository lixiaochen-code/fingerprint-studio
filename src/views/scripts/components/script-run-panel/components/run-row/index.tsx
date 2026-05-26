import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Square } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { interpolate } from '@/lib/i18n'
import { isFinished, logTone, statusTone } from '../../helpers'
import type { LiveRun } from '../../types'
import type { Translations } from '../../translations'

export interface RunRowProps {
  entry: LiveRun
  t: Translations
  onStop: () => void
}

/**
 * 单条 run 在面板列表中的行展示:状态徽章 + profile 名 + 时长 + 折叠日志区。
 *
 * 行为:
 * - 默认展开;点 header 折叠
 * - RUNNING 状态每秒重渲染一次让"已运行 Ns"跳动,结束之后停掉定时器
 * - 日志区"粘底自动跟":用户主动滚开后停止跟,滚回底部又恢复
 */
export function RunRow({ entry, t, onStop }: RunRowProps) {
  const [expanded, setExpanded] = useState(true)
  const logRef = useRef<HTMLDivElement | null>(null)
  // 用户是否手动滚动过 —— 之后的新日志只在用户在底部时自动跟。
  const stuckToBottomRef = useRef(true)

  const status = entry.run.status
  const finished = isFinished(status)

  // RUNNING 状态下每秒触发一次重渲染,让"已运行 Ns"的秒数实时跳动。
  // 结束之后停掉定时器,节省渲染。
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
      case 'pending':
        return t.status_pending
      case 'running':
        return t.status_running
      case 'succeeded':
        return t.status_succeeded
      case 'failed':
        return t.status_failed
      case 'stopped':
        return t.status_stopped
    }
  })()

  const duration = useMemo(() => {
    const start = new Date(entry.run.startedAt).getTime()
    const end = entry.run.endedAt ? new Date(entry.run.endedAt).getTime() : Date.now()
    const seconds = Math.max(0, Math.round((end - start) / 1000))
    return interpolate(t.durationSec, { seconds: String(seconds) })
    // tick 是为了运行中的行每秒重算,依赖 lint 不会高兴,所以显式列入
  }, [entry.run.startedAt, entry.run.endedAt, t, tick])

  return (
    <li className="flex flex-col">
      {/*
        这里**不**用 <button>:里面要嵌一个 Stop <button>,HTML 不允许 button 嵌套
        (会触发 hydration error 警告)。改用 div + role/tabIndex 维持键盘可达性。
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
              <div
                key={idx}
                className={`whitespace-pre-wrap break-all ${logTone(line.level)}`}
              >
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

export default RunRow
