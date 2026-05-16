import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

export type SplitPaneDirection = 'vertical' | 'horizontal'

export interface SplitPaneProps {
  /** 'vertical' = 上下分屏（拖动竖直方向），'horizontal' = 左右分屏 */
  direction: SplitPaneDirection
  /** 第一格初始占比，0~1。会被 localStorage 中的用户偏好覆盖（如果有 storageKey） */
  defaultRatio?: number
  /** 第一格最小占比 */
  minRatio?: number
  /** 第一格最大占比 */
  maxRatio?: number
  /** 持久化 key；不提供则不持久化 */
  storageKey?: string
  /** 上 / 左侧内容 */
  first: ReactNode
  /** 下 / 右侧内容 */
  second: ReactNode
  className?: string
}

const HANDLE_THICKNESS_PX = 6

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function readStoredRatio(key: string | undefined, fallback: number): number {
  if (!key) return fallback
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return fallback
    const parsed = Number(raw)
    return Number.isFinite(parsed) ? parsed : fallback
  } catch {
    return fallback
  }
}

/**
 * 通用上下 / 左右可拖动分屏组件。
 *
 * 设计要点：
 * - 拖动手柄是一道 6px 的"安全区"；视觉上只在 hover 时变色，不抢眼
 * - 拖动时给 document.body 加 cursor + user-select:none，避免选中文本
 * - 比例用 localStorage 持久化（如果传了 storageKey），跨会话保留
 * - 第一格用 flex-basis（百分比）拿位置，第二格 flex:1 吃剩余空间，避免出现整数像素的 1px 抖动
 */
export function SplitPane({
  direction,
  defaultRatio = 0.5,
  minRatio = 0.15,
  maxRatio = 0.85,
  storageKey,
  first,
  second,
  className
}: SplitPaneProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [ratio, setRatio] = useState<number>(() =>
    clamp(readStoredRatio(storageKey, defaultRatio), minRatio, maxRatio)
  )
  // 用 ref 跟踪当前 ratio 给监听器读取，避免 mousemove handler 闭包陈旧
  const ratioRef = useRef(ratio)
  ratioRef.current = ratio

  const persist = useCallback((next: number) => {
    if (!storageKey) return
    try {
      window.localStorage.setItem(storageKey, String(next))
    } catch {
      // localStorage 写失败不影响功能，忽略即可
    }
  }, [storageKey])

  const onMouseDown = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault()
    const container = containerRef.current
    if (!container) return

    const rect = container.getBoundingClientRect()
    const isVertical = direction === 'vertical'
    const totalSize = isVertical ? rect.height : rect.width
    if (totalSize <= 0) return

    const startCursor = isVertical ? 'row-resize' : 'col-resize'
    document.body.style.cursor = startCursor
    document.body.style.userSelect = 'none'

    const handleMove = (moveEvent: MouseEvent) => {
      const offset = isVertical ? moveEvent.clientY - rect.top : moveEvent.clientX - rect.left
      const next = clamp(offset / totalSize, minRatio, maxRatio)
      setRatio(next)
    }
    const handleUp = () => {
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
      persist(ratioRef.current)
    }

    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
  }, [direction, minRatio, maxRatio, persist])

  const isVertical = direction === 'vertical'
  const firstStyle = isVertical
    ? { flexBasis: `${ratio * 100}%` }
    : { flexBasis: `${ratio * 100}%` }

  return (
    <div
      ref={containerRef}
      className={cn(
        'flex min-h-0 min-w-0',
        isVertical ? 'flex-col' : 'flex-row',
        className
      )}
    >
      <div className="min-h-0 min-w-0 overflow-hidden" style={firstStyle}>
        {first}
      </div>
      <div
        role="separator"
        aria-orientation={isVertical ? 'horizontal' : 'vertical'}
        onMouseDown={onMouseDown}
        className={cn(
          'flex-none bg-border transition-colors hover:bg-primary/40 active:bg-primary/60',
          isVertical
            ? 'cursor-row-resize w-full'
            : 'cursor-col-resize h-full'
        )}
        style={isVertical
          ? { height: `${HANDLE_THICKNESS_PX}px` }
          : { width: `${HANDLE_THICKNESS_PX}px` }
        }
      />
      <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
        {second}
      </div>
    </div>
  )
}
