import { Eye, Plus, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { interpolate } from '@/lib/i18n'
import type { Translations } from '@/lib/translations'

export interface SelectionBarProps {
  t: Translations
  selectedIds: Set<string>
  onShowDetails: (ids: string[]) => void
  onAskDelete: (ids: string[]) => void
  onClearSelection: () => void
  onAdd: () => void
}

/**
 * 选区 + 操作工具条。永远在位、不抖动:
 * - 没勾任何 profile 时:左侧灰显 "0 selected",右侧只有"+ 新建环境"是亮的
 * - 勾了 profile 时:左侧高亮,详情/删除/清除按钮可点
 *
 * 注意:**新建环境**始终亮,因为它和选区无关 —— 跟其它"批量操作"放在一行只是为了
 * 节省工具栏垂直空间。
 */
export function SelectionBar({
  t,
  selectedIds,
  onShowDetails,
  onAskDelete,
  onClearSelection,
  onAdd
}: SelectionBarProps) {
  const hasSelection = selectedIds.size > 0
  return (
    <div
      className={`flex items-center justify-between border px-4 py-2 transition-colors ${
        hasSelection ? 'border-primary/40 bg-primary/10' : 'border-border bg-muted/30'
      }`}
    >
      <div className="flex items-center gap-3 text-xs">
        <Checkbox
          checked={hasSelection}
          onChange={onClearSelection}
          disabled={!hasSelection}
        />
        <span
          className={`font-display font-bold uppercase tracking-wider ${
            hasSelection ? 'text-foreground' : 'text-muted-foreground'
          }`}
        >
          {interpolate(t.selected, { count: String(selectedIds.size) })}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          disabled={!hasSelection}
          onClick={() => onShowDetails(Array.from(selectedIds))}
        >
          <Eye className="h-3 w-3" />
          {t.details}
        </Button>
        <Button
          variant="destructive"
          size="sm"
          className="gap-2"
          disabled={!hasSelection}
          onClick={() => onAskDelete(Array.from(selectedIds))}
        >
          <Trash2 className="h-3 w-3" />
          {t.delete}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={!hasSelection}
          onClick={onClearSelection}
        >
          <X className="h-3 w-3 mr-1" />
          {t.clear}
        </Button>
        {/* "+ 新建环境" 是 Environments 页的功能按钮(不是全局导航),放在工具条右侧 */}
        <Button size="sm" className="gap-2 ml-2" onClick={onAdd}>
          <Plus className="h-4 w-4" />
          {t.addNew}
        </Button>
      </div>
    </div>
  )
}

export default SelectionBar
