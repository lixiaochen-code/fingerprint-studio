import { Loader2, Pencil, RefreshCw, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Tooltip } from '@/components/ui/tooltip'
import { ProxyTestBadge } from '@/components/proxy-form-dialog'
import type { Proxy } from '../../../../../electron/types'
import { formatLastTested, formatLocation } from '../../helpers'
import type { Locale, Translations } from '../../translations'

export interface ProxiesTableProps {
  proxies: Proxy[]
  /** 当前正在做连通性测试的代理 id 集合;表格里显示 spinner */
  testingIds: Set<string>
  onTest: (id: string) => void
  onEdit: (proxy: Proxy) => void
  onDelete: (proxy: Proxy) => void
  t: Translations
  locale: Locale
}

/**
 * Proxies 视图主表格。空集合 / 搜索无结果由父组件用文案 Card 替代,这里假定 proxies 非空。
 */
export function ProxiesTable({
  proxies,
  testingIds,
  onTest,
  onEdit,
  onDelete,
  t,
  locale
}: ProxiesTableProps) {
  return (
    <Card className="p-0 overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-background/40">
          <tr className="text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            <th className="px-4 py-2.5">{t.columns.name}</th>
            <th className="px-4 py-2.5">{t.columns.scheme}</th>
            <th className="px-4 py-2.5">{t.columns.address}</th>
            <th className="px-4 py-2.5">{t.columns.status}</th>
            <th className="px-4 py-2.5">{t.columns.location}</th>
            <th className="px-4 py-2.5">{t.columns.lastTested}</th>
            <th className="px-4 py-2.5 text-right">{t.columns.actions}</th>
          </tr>
        </thead>
        <tbody>
          {proxies.map((proxy) => {
            const isTesting = testingIds.has(proxy.id)
            return (
              <tr key={proxy.id} className="border-t border-border hover:bg-background/30">
                <td className="px-4 py-2.5 font-display">{proxy.name}</td>
                <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">
                  {proxy.scheme}
                </td>
                <td className="px-4 py-2.5 font-mono text-xs">
                  {proxy.host}:{proxy.port}
                </td>
                <td className="px-4 py-2.5">
                  <ProxyTestBadge
                    snapshot={isTesting ? 'pending' : proxy.lastTest}
                    locale={locale}
                  />
                </td>
                <td className="px-4 py-2.5 text-xs text-muted-foreground">
                  {formatLocation(proxy.lastTest)}
                </td>
                <td className="px-4 py-2.5 text-xs text-muted-foreground">
                  {formatLastTested(proxy.lastTest?.at, locale)}
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center justify-end gap-1">
                    <Tooltip content={t.test}>
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={isTesting}
                        onClick={() => onTest(proxy.id)}
                      >
                        {isTesting ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <RefreshCw className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </Tooltip>
                    <Tooltip content={t.edit}>
                      <Button variant="ghost" size="icon" onClick={() => onEdit(proxy)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </Tooltip>
                    <Tooltip content={t.remove}>
                      <Button variant="ghost" size="icon" onClick={() => onDelete(proxy)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </Tooltip>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </Card>
  )
}

export default ProxiesTable
