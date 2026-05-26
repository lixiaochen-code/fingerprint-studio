import { useCallback, useMemo, useState } from 'react'
import { Plus, RefreshCw, Trash2, Pencil, FileText, Loader2, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Tooltip } from '@/components/ui/tooltip'
import { Dialog } from '@/components/ui/dialog'
import { ProxyFormDialog, ProxyTestBadge } from './ProxyFormDialog'
import { ProxyBatchImportDialog } from './ProxyBatchImportDialog'
import type { Proxy, ProxyTestSnapshot } from '../../electron/types'

/**
 * 代理管理主视图,与 ProfilesPanel/ScriptsView 同级。
 *
 * - 数据加载:mount + onReload 时 IPC list,主进程 ProxyStore 是真源
 * - 测试:点单条"刷新"或全部刷新,IPC `proxies:test` 异步执行,期间 testingIds 显示 loader
 * - 编辑/删除:打开对应 dialog,提交后 reload 整个列表(简单粗暴,代理数量不多)
 * - 搜索:本地纯前端过滤,匹配 name / host / org
 */

type Locale = 'en' | 'zh'

type Translations = {
  title: string
  emptyTitle: string
  emptyHint: string
  searchPlaceholder: string
  addProxy: string
  batchImport: string
  refreshAll: string
  noMatch: string
  columns: {
    name: string
    scheme: string
    address: string
    status: string
    location: string
    lastTested: string
    actions: string
  }
  edit: string
  test: string
  remove: string
  removeConfirmTitle: string
  removeConfirmBody: string
  removeConfirm: string
  removeCancel: string
  testInProgress: string
  notTested: string
  saved: string
  removed: string
  imported: string
}

const labels: Record<Locale, Translations> = {
  en: {
    title: 'Proxies',
    emptyTitle: 'No proxies saved.',
    emptyHint: 'Add a proxy entry to reuse it across profiles. Profiles without a proxy fall back to the system network settings.',
    searchPlaceholder: 'Search by name, host or org…',
    addProxy: 'Add proxy',
    batchImport: 'Batch import',
    refreshAll: 'Refresh all',
    noMatch: 'No proxies match your search.',
    columns: {
      name: 'Name',
      scheme: 'Scheme',
      address: 'Host:Port',
      status: 'Status',
      location: 'Location',
      lastTested: 'Last tested',
      actions: 'Actions'
    },
    edit: 'Edit',
    test: 'Refresh',
    remove: 'Delete',
    removeConfirmTitle: 'Delete proxy',
    removeConfirmBody: 'Delete "{name}"? Profiles still referencing this proxy will fall back to the system network setting on next launch.',
    removeConfirm: 'Delete',
    removeCancel: 'Cancel',
    testInProgress: 'Testing…',
    notTested: '—',
    saved: 'Proxy saved.',
    removed: 'Proxy removed.',
    imported: 'Imported.'
  },
  zh: {
    title: '代理',
    emptyTitle: '还没有保存的代理。',
    emptyHint: '添加代理条目以便在多个环境间复用。未关联代理的环境会使用系统网络设置。',
    searchPlaceholder: '按名称 / 主机 / ISP 搜索…',
    addProxy: '新增代理',
    batchImport: '批量导入',
    refreshAll: '全部刷新',
    noMatch: '没有匹配的代理。',
    columns: {
      name: '名称',
      scheme: '协议',
      address: '主机:端口',
      status: '状态',
      location: '位置',
      lastTested: '最近探测',
      actions: '操作'
    },
    edit: '编辑',
    test: '刷新',
    remove: '删除',
    removeConfirmTitle: '删除代理',
    removeConfirmBody: '确定删除 "{name}"?引用此代理的环境下次启动将回退到系统网络设置。',
    removeConfirm: '删除',
    removeCancel: '取消',
    testInProgress: '探测中…',
    notTested: '—',
    saved: '已保存代理。',
    removed: '代理已删除。',
    imported: '已导入。'
  }
}

function formatLastTested(at: number | undefined, locale: Locale): string {
  if (!at) return '—'
  const ms = Date.now() - at
  const sec = Math.floor(ms / 1000)
  if (sec < 60) return locale === 'zh' ? `${sec} 秒前` : `${sec}s ago`
  const min = Math.floor(sec / 60)
  if (min < 60) return locale === 'zh' ? `${min} 分钟前` : `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return locale === 'zh' ? `${hr} 小时前` : `${hr}h ago`
  const day = Math.floor(hr / 24)
  return locale === 'zh' ? `${day} 天前` : `${day}d ago`
}

function formatLocation(snapshot: ProxyTestSnapshot | undefined): string {
  if (!snapshot?.geo) return '—'
  const { country, city, org } = snapshot.geo
  const place = [city, country].filter(Boolean).join(', ')
  if (place && org) return `${place} · ${org}`
  return place || org || '—'
}

export interface ProxiesViewProps {
  /**
   * 父组件(App)拥有 proxies 状态 —— ProfileFormDialog 的嵌套新建流也会写到同一份,
   * 这样 ProxiesView 不会显示陈旧数据。我们仍直接调 window.registry.proxies.* 做 IPC
   * mutations,但每次改完都通过 onReload() 让 App 重新加载并 push 新 proxies prop 进来。
   */
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
    | { open: false }
    | { open: true; mode: 'create' }
    | { open: true; mode: 'edit'; proxy: Proxy }
  >({ open: false })
  const [batchOpen, setBatchOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Proxy | null>(null)

  const reload = useCallback(() => onReload(), [onReload])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return proxies
    return proxies.filter((p) => {
      const haystack = [p.name, p.host, `${p.port}`, p.lastTest?.geo?.org, p.lastTest?.geo?.country, p.lastTest?.geo?.city]
        .filter(Boolean).join(' ').toLowerCase()
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
      <div className="flex items-center gap-3 flex-wrap">
        <h2 className="font-display text-xl font-bold tracking-tight">{t.title}</h2>
        <span className="font-mono text-[11px] text-muted-foreground">
          {proxies.length}
        </span>
        <div className="flex-1" />
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t.searchPlaceholder}
            className="pl-8 w-64"
          />
        </div>
        <Button variant="secondary" onClick={() => setBatchOpen(true)}>
          <FileText className="mr-2 h-3.5 w-3.5" />
          {t.batchImport}
        </Button>
        <Button variant="secondary" onClick={handleTestAll} disabled={!filtered.length}>
          <RefreshCw className="mr-2 h-3.5 w-3.5" />
          {t.refreshAll}
        </Button>
        <Button onClick={() => setFormDialog({ open: true, mode: 'create' })}>
          <Plus className="mr-2 h-3.5 w-3.5" />
          {t.addProxy}
        </Button>
      </div>

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
              {filtered.map((proxy) => {
                const isTesting = testingIds.has(proxy.id)
                return (
                  <tr key={proxy.id} className="border-t border-border hover:bg-background/30">
                    <td className="px-4 py-2.5 font-display">{proxy.name}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{proxy.scheme}</td>
                    <td className="px-4 py-2.5 font-mono text-xs">{proxy.host}:{proxy.port}</td>
                    <td className="px-4 py-2.5">
                      <ProxyTestBadge snapshot={isTesting ? 'pending' : proxy.lastTest} locale={locale} />
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
                            onClick={() => void handleTest(proxy.id)}
                          >
                            {isTesting
                              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              : <RefreshCw className="h-3.5 w-3.5" />}
                          </Button>
                        </Tooltip>
                        <Tooltip content={t.edit}>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setFormDialog({ open: true, mode: 'edit', proxy })}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        </Tooltip>
                        <Tooltip content={t.remove}>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setDeleteTarget(proxy)}
                          >
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

      <Dialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title={t.removeConfirmTitle}
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteTarget(null)}>{t.removeCancel}</Button>
            <Button variant="destructive" onClick={() => deleteTarget && void handleRemove(deleteTarget.id)}>{t.removeConfirm}</Button>
          </>
        }
      >
        <p className="text-sm">
          {deleteTarget ? t.removeConfirmBody.replace('{name}', deleteTarget.name) : ''}
        </p>
      </Dialog>
    </div>
  )
}
