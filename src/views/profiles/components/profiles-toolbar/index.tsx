import { RotateCcw, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { Locale } from '@/lib/locale'
import type { Translations } from '@/lib/translations'
import type { RuntimeInfo } from '../../../../../electron/types'
import { FingerprintBadge } from '../fingerprint-badge'

export interface ProfilesToolbarProps {
  t: Translations
  locale: Locale
  runtimeInfo?: RuntimeInfo
  query: string
  onQueryChange: (value: string) => void
  onReload: () => void
}

/**
 * Profiles 视图顶部工具条:指纹模式徽章 + 搜索框 + 刷新。
 *
 * 抽离的目的是把"展示 + 派发 query/reload 事件"和列表/选区分开,
 * ProfilesView 只关心数据流转,具体输入/标签的样式归这里。
 */
export function ProfilesToolbar({
  t,
  locale,
  runtimeInfo,
  query,
  onQueryChange,
  onReload
}: ProfilesToolbarProps) {
  return (
    <div className="flex items-center gap-3">
      <FingerprintBadge runtime={runtimeInfo} t={t} locale={locale} />
      <div className="relative max-w-md flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder={t.searchPlaceholder}
          className="pl-10 h-10 border-none bg-muted/50 focus-visible:ring-1"
        />
      </div>
      <Button variant="ghost" size="sm" onClick={onReload}>
        <RotateCcw className="h-4 w-4 mr-2" />
        {t.refresh}
      </Button>
    </div>
  )
}

export default ProfilesToolbar
