import { useCallback, useMemo, useState } from 'react'
import { Card } from '@/components/ui/card'
import { ProxyFormDialog } from '@/components/proxy-form-dialog'
import { ProxyBatchImportDialog } from '@/components/proxy-batch-import-dialog'
import type { Proxy } from '../../../electron/types'
import { DeleteProxyDialog } from './components/delete-proxy-dialog'
import { ProxiesTable } from './components/proxies-table'
import { ProxiesToolbar } from './components/proxies-toolbar'
import { labels, type Locale } from './translations'

/**
 * 代理管理主视图,与 ProfilesView/ScriptsView 同级。
 *
 * 数据模型:
 * - 父组件(App)拥有 proxies 状态;ProfileFormDialog 的嵌套新建流也写到同一份,
 *   这样 ProxiesView 不会显示陈旧数据
 * - 这里直接调 window.registry.proxies.* 做 IPC mutations,但每次改完都通过
 *   onReload() 让 App 重新加载并 push 新 proxies prop 进来
 *
 * 子区域:
 * - ProxiesToolbar:标题 + 计数 + 搜索 + 三个动作按钮
 * - ProxiesTable:主表格(空集合时由本组件渲染替代 Card)
 * - ProxyFormDialog / ProxyBatchImportDialog:复用的全局组件
 * - DeleteProxyDialog:本视图专用确认框
 */
export interface ProxiesViewProps {
  proxies: Proxy[]
  onReload: () => Promise<void>
  locale: Locale
  onToast?: (message: string, kind?: 'success' | 'error') => void
}

export function ProxiesView({ proxies, onReload, locale, onToast }: ProxiesViewProps) {
  const t = labels[locale]
  const [query, setQuery] = useState('')
  const [testingIds, setTestingIds] = useState<Set<string>>(new Set())
  const [formDialog, setFormDialog] = useState<
    { open: false } | { open: true; mode: 'create' } | { open: true; mode: 'edit'; proxy: Proxy }
  >({ open: false })
  const [batchOpen, setBatchOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Proxy | null>(null)

  const reload = useCallback(() => onReload(), [onReload])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return proxies
    return proxies.filter((p) => {
      const haystack = [
        p.name,
        p.host,
        `${p.port}`,
        p.lastTest?.geo?.org,
        p.lastTest?.geo?.country,
        p.lastTest?.geo?.city
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return haystack.includes(q)
    })
  }, [proxies, query])

  async function handleSubmit(draft: Parameters<typeof window.registry.proxies.save>[0]) {
    await window.registry.proxies.save(draft)
    setFormDialog({ open: false })
    await reload()
    onToast?.(t.saved, 'success')
  }

  async function handleRemove(id: string) {
    await window.registry.proxies.remove(id)
    setDeleteTarget(null)
    await reload()
    onToast?.(t.removed, 'success')
  }

  async function handleTest(id: string) {
    setTestingIds((prev) => {
      const next = new Set(prev)
      next.add(id)
      return next
    })
    try {
      await window.registry.proxies.test(id)
      await reload()
    } finally {
      setTestingIds((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }
  }

  async function handleTestAll() {
    // 顺序探测:同时全开会让代理服务器和 ipinfo.io 一起被打,且本地 UI 也会变成一锅
    // loader。串行简单可靠,数量大时用户也可以中途切走视图。
    const ids = filtered.map((p) => p.id)
    for (const id of ids) {
      await handleTest(id)
    }
  }

  async function handleBulkImport(text: string) {
    const result = await window.registry.proxies.bulkImport(text)
    await reload()
    if (result.created.length || result.reused.length) {
      onToast?.(t.imported, 'success')
    }
    return result
  }

  return (
    <div className="flex-1 overflow-auto p-6 space-y-4">
      <ProxiesToolbar
        total={proxies.length}
        query={query}
        onQueryChange={setQuery}
        onAdd={() => setFormDialog({ open: true, mode: 'create' })}
        onBatchImport={() => setBatchOpen(true)}
        onRefreshAll={() => void handleTestAll()}
        refreshDisabled={!filtered.length}
        t={t}
      />

      {proxies.length === 0 ? (
        <Card className="p-8 text-center space-y-2">
          <p className="font-display text-sm">{t.emptyTitle}</p>
          <p className="text-xs text-muted-foreground max-w-md mx-auto">{t.emptyHint}</p>
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-xs text-muted-foreground">{t.noMatch}</p>
        </Card>
      ) : (
        <ProxiesTable
          proxies={filtered}
          testingIds={testingIds}
          onTest={(id) => void handleTest(id)}
          onEdit={(proxy) => setFormDialog({ open: true, mode: 'edit', proxy })}
          onDelete={(proxy) => setDeleteTarget(proxy)}
          t={t}
          locale={locale}
        />
      )}

      <ProxyFormDialog
        open={formDialog.open}
        mode={formDialog.open ? formDialog.mode : 'create'}
        initial={formDialog.open && formDialog.mode === 'edit' ? formDialog.proxy : undefined}
        locale={locale}
        onCancel={() => setFormDialog({ open: false })}
        onSubmit={handleSubmit}
      />

      <ProxyBatchImportDialog
        open={batchOpen}
        locale={locale}
        onClose={() => setBatchOpen(false)}
        onImport={handleBulkImport}
      />

      <DeleteProxyDialog
        target={deleteTarget}
        t={t}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && void handleRemove(deleteTarget.id)}
      />
    </div>
  )
}

export default ProxiesView
