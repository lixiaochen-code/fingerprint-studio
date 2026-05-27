import { useCallback } from 'react'
import { toast } from 'sonner'

export interface ScriptIdCellProps {
  id: string
  /** 复制成功时的 toast 文案 */
  copiedToast: string
  /** 复制失败时的 toast 文案 */
  copyFailedToast: string
}

/**
 * 脚本详情顶部的 ID 单元。
 *
 * 与 ProfileIdCell 视觉、交互保持一致:
 * - mono 灰字 + 浅色虚线下划线,提示可点击复制
 * - hover 时字色加深、虚线变实色感
 * - 点击复制完整 id,反馈走全局 sonner toast(避免在标题区做局部状态闪烁)
 *
 * 单独抽组件而不是直接复用 ProfileIdCell:语义不同(脚本 vs 环境)、未来如果需要
 * 加上"在脚本管理中跳转"之类的增强,留独立扩展点;同时把样式集中在两个 cell 文件里,
 * 视觉一致性靠 className 字面量保持(都是同一组类)。
 */
export function ScriptIdCell({ id, copiedToast, copyFailedToast }: ScriptIdCellProps) {
  const onCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(id)
      toast.success(copiedToast)
    } catch {
      // Electron renderer 在受限场景(无聚焦 / 权限被拒)可能 throw;不让 UI 崩
      toast.error(copyFailedToast)
    }
  }, [id, copiedToast, copyFailedToast])

  return (
    <button
      type="button"
      onClick={onCopy}
      className="cursor-pointer font-mono text-[11px] text-muted-foreground underline decoration-dashed decoration-muted-foreground/40 underline-offset-4 hover:text-foreground hover:decoration-foreground focus-visible:outline-none focus-visible:decoration-foreground"
    >
      {id}
    </button>
  )
}

export default ScriptIdCell
