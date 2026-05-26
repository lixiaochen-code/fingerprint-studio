import { useCallback, useEffect, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { Tooltip } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

export interface ProfileIdCellProps {
  id: string
  /** 已复制后多久回到默认状态(ms),默认 1500 */
  resetMs?: number
  /** 截断显示的最大字符数,超出尾部省略 */
  maxChars?: number
  /** i18n 文案 */
  copyTooltip: string
  copiedTooltip: string
  copyFailedTooltip: string
}

/**
 * 环境列表的 ID 单元。
 *
 * 设计:
 * - 小巧的 `mono text-[10px]` 徽章,配合 hover 浮起 + 复制图标
 * - 点击复制完整 id 到剪贴板;反馈靠 1.5s 内的 tooltip 切换 ("已复制" → 还原)
 * - `navigator.clipboard.writeText` 兜底:Electron renderer 长期支持,失败时 tooltip 显示
 *   错误文案,不掉应用
 * - id 文本本身做 truncate(默认 14 字符前缀 + ellipsis),避免长 id 把表格撑大;
 *   完整 id 通过 tooltip 始终可见
 *
 * 不抽到 ui/ 下因为它强耦合"id 复制"语义,没有跨业务复用的迹象;真要复用再升级。
 */
export function ProfileIdCell({
  id,
  resetMs = 1500,
  maxChars = 14,
  copyTooltip,
  copiedTooltip,
  copyFailedTooltip
}: ProfileIdCellProps) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')

  // 复制完后 1.5s 自动回到 idle —— 用 effect 而不是 setTimeout 直接埋,
  // 这样组件 unmount 时 timer 自动清,不会泄漏。
  useEffect(() => {
    if (state === 'idle') return
    const timer = window.setTimeout(() => setState('idle'), resetMs)
    return () => window.clearTimeout(timer)
  }, [state, resetMs])

  const onCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(id)
      setState('copied')
    } catch {
      // Electron renderer 在受限场景(无聚焦 / 权限被拒)可能 throw;不让 UI 崩,改成 fail tooltip
      setState('failed')
    }
  }, [id])

  const display = id.length > maxChars ? `${id.slice(0, maxChars)}…` : id
  const tooltipContent =
    state === 'copied'
      ? copiedTooltip
      : state === 'failed'
        ? copyFailedTooltip
        : `${id} · ${copyTooltip}`

  return (
    <Tooltip side="top" content={tooltipContent}>
      <button
        type="button"
        onClick={onCopy}
        // 不传 title 避免与 Tooltip 内容打架;视觉风格对齐表内其它 mono 徽章
        className={cn(
          'inline-flex items-center gap-1 border border-border/60 bg-muted/30 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          state === 'copied' && 'border-primary/40 bg-primary/10 text-primary',
          state === 'failed' && 'border-destructive/40 bg-destructive/10 text-destructive'
        )}
      >
        <span className="select-all truncate">{display}</span>
        {state === 'copied' ? (
          <Check className="h-3 w-3 flex-none" />
        ) : (
          <Copy className="h-3 w-3 flex-none opacity-60" />
        )}
      </button>
    </Tooltip>
  )
}

export default ProfileIdCell
