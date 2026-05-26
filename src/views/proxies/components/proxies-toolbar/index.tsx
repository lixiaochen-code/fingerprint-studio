import { FileText, Plus, RefreshCw, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { Translations } from '../../translations'

export interface ProxiesToolbarProps {
  total: number
  query: string
  onQueryChange: (value: string) => void
  onAdd: () => void
  onBatchImport: () => void
  onRefreshAll: () => void
  refreshDisabled: boolean
  t: Translations
}

/**
 * Proxies 视图顶部工具条:标题 + 计数 + 搜索 + 三个动作按钮。
 *
 * 单独抽出来是因为主体表格 + 弹窗已经够长,把这一段挪走能让 ProxiesView 主入口
 * 集中在"数据 + 路由对话框"上。
 */
export function ProxiesToolbar({
  total,
  query,
  onQueryChange,
  onAdd,
  onBatchImport,
  onRefreshAll,
  refreshDisabled,
  t
}: ProxiesToolbarProps) {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <h2 className="font-display text-xl font-bold tracking-tight">{t.title}</h2>
      <span className="font-mono text-[11px] text-muted-foreground">{total}</span>
      <div className="flex-1" />
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder={t.searchPlaceholder}
          className="pl-8 w-64"
        />
      </div>
      <Button variant="secondary" onClick={onBatchImport}>
        <FileText className="mr-2 h-3.5 w-3.5" />
        {t.batchImport}
      </Button>
      <Button variant="secondary" onClick={onRefreshAll} disabled={refreshDisabled}>
        <RefreshCw className="mr-2 h-3.5 w-3.5" />
        {t.refreshAll}
      </Button>
      <Button onClick={onAdd}>
        <Plus className="mr-2 h-3.5 w-3.5" />
        {t.addProxy}
      </Button>
    </div>
  )
}

export default ProxiesToolbar
