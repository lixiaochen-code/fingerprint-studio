import { useCallback } from 'react'
import { toast } from 'sonner'

export interface ProfileIdCellProps {
  id: string
  /** 复制成功时的 toast 文案 */
  copiedToast: string
  /** 复制失败时的 toast 文案 */
  copyFailedToast: string
}

/**
 * 环境列表的 ID 单元。
 *
 * 极简风格:
 * - 默认普通灰色 mono 文本
 * - hover 出下划线 + cursor pointer,暗示可点
 * - 点击复制完整 id;反馈通过全局 sonner toast,不在单元里做状态切换
 *
 * 反馈不在元素上闪而是用 toast,因为表内行多时局部反馈不容易被看到,toast 在右上角更显眼。
 */
export function ProfileIdCell({ id, copiedToast, copyFailedToast }: ProfileIdCellProps) {
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
      className="cursor-pointer font-mono text-[11px] text-muted-foreground hover:text-foreground hover:underline focus-visible:outline-none focus-visible:underline"
    >
      {id}
    </button>
  )
}

export default ProfileIdCell
