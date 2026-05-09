import { useMemo, useState } from 'react'
import { Download, Trash2, Upload, ArrowLeft, Folder } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { interpolate } from '@/lib/i18n'
import type { BrowserPlugin, KernelType, RuntimeInfo } from '../../electron/types'

type Locale = 'en' | 'zh'

const labels = {
  en: {
    title: 'Settings',
    back: 'Back to environments',
    sectionKernel: 'Browser kernels',
    sectionPlugin: 'Plugins',
    sectionPaths: 'Storage',
    installed: 'Installed',
    notInstalled: 'Not installed',
    install: 'Install',
    reinstall: 'Reinstall',
    cacheDir: 'Cache directory',
    importZip: 'Import ZIP',
    importing: 'Importing...',
    activeVersion: 'Active version',
    pluginEmpty: 'No plugins imported. Use Import ZIP to add a Chrome extension package.',
    versions: '{{count}} version(s)',
    delete: 'Delete',
    select: 'Select',
    fingerprintHost: 'Host: {{host}} · Active kernel: {{kernel}}',
    itbrowserUnsupported: 'itbrowser is Windows-only.'
  },
  zh: {
    title: '设置',
    back: '返回环境列表',
    sectionKernel: '浏览器内核',
    sectionPlugin: '插件',
    sectionPaths: '存储',
    installed: '已安装',
    notInstalled: '未安装',
    install: '安装',
    reinstall: '重装',
    cacheDir: '缓存目录',
    importZip: '导入 ZIP',
    importing: '导入中…',
    activeVersion: '当前版本',
    pluginEmpty: '暂无插件。点击「导入 ZIP」添加 Chrome 扩展包。',
    versions: '{{count}} 个版本',
    delete: '删除',
    select: '选择',
    fingerprintHost: '宿主：{{host}} · 当前内核：{{kernel}}',
    itbrowserUnsupported: 'itbrowser 仅 Windows 可用。'
  }
} as const

function activeKernel(runtime: RuntimeInfo | undefined) {
  if (!runtime) return '—'
  if (runtime.hostOs === 'win32' && runtime.kernels.itbrowser.installed) return 'ITBROWSER'
  if (runtime.kernels.chromium.installed) return 'CHROMIUM'
  return 'NONE'
}

function hostLabel(runtime: RuntimeInfo | undefined) {
  if (!runtime) return '—'
  if (runtime.hostOs === 'win32') return 'WINDOWS'
  if (runtime.hostOs === 'darwin') return 'MAC'
  return 'LINUX'
}

export type SettingsViewProps = {
  runtimeInfo?: RuntimeInfo
  plugins: BrowserPlugin[]
  locale: Locale
  onBack: () => void
  onInstallKernel: (kernel: KernelType) => void
  onImportPlugin: () => Promise<void>
  onSetActiveVersion: (pluginId: string, versionId: string) => Promise<void>
  onDeletePlugin: (pluginId: string) => Promise<void>
}

export function SettingsView({ runtimeInfo, plugins, locale, onBack, onInstallKernel, onImportPlugin, onSetActiveVersion, onDeletePlugin }: SettingsViewProps) {
  const t = labels[locale]
  const [importing, setImporting] = useState(false)

  async function handleImport() {
    setImporting(true)
    try {
      await onImportPlugin()
    } finally {
      setImporting(false)
    }
  }

  const kernels: KernelType[] = ['chromium', 'itbrowser']

  return (
    <main className="p-6 space-y-6 max-w-[1200px] mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-xl font-bold tracking-tight">{t.title}</h1>
          <p className="text-xs text-muted-foreground">
            {interpolate(t.fingerprintHost, { host: hostLabel(runtimeInfo), kernel: activeKernel(runtimeInfo) })}
          </p>
        </div>
        <Button variant="ghost" size="sm" className="gap-2" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
          {t.back}
        </Button>
      </div>

      <Section title={t.sectionKernel}>
        <div className="grid gap-3 md:grid-cols-2">
          {kernels.map((kernel) => {
            const status = runtimeInfo?.kernels[kernel]
            const unsupported = kernel === 'itbrowser' && !runtimeInfo?.itbrowserSupported
            return (
              <Card key={kernel} className="border border-border bg-secondary p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-display text-sm font-bold uppercase tracking-wider">{kernel}</div>
                    <div className={`mt-1 text-[11px] font-mono ${status?.installed ? 'text-primary' : 'text-muted-foreground'}`}>
                      {status?.installed ? t.installed : t.notInstalled}
                      {status?.version ? ` · ${status.version}` : ''}
                      {status?.sizeMB ? ` · ${status.sizeMB} MB` : ''}
                    </div>
                    {unsupported && <p className="mt-1 text-[11px] text-amber-500">{t.itbrowserUnsupported}</p>}
                    {status?.path && (
                      <p className="mt-2 break-all font-mono text-[10px] text-muted-foreground">{status.path}</p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-2"
                    disabled={unsupported}
                    onClick={() => onInstallKernel(kernel)}
                  >
                    <Download className="h-3 w-3" />
                    {status?.installed ? t.reinstall : t.install}
                  </Button>
                </div>
              </Card>
            )
          })}
        </div>
      </Section>

      <Section
        title={t.sectionPlugin}
        action={
          <Button variant="outline" size="sm" className="gap-2" disabled={importing} onClick={() => void handleImport()}>
            <Upload className="h-3 w-3" />
            {importing ? t.importing : t.importZip}
          </Button>
        }
      >
        {plugins.length === 0 ? (
          <p className="border border-dashed border-border bg-background/50 p-6 text-center text-xs text-muted-foreground">
            {t.pluginEmpty}
          </p>
        ) : (
          <div className="space-y-2">
            {plugins.map((plugin) => (
              <PluginCard
                key={plugin.id}
                plugin={plugin}
                locale={locale}
                onSetActiveVersion={onSetActiveVersion}
                onDelete={onDeletePlugin}
              />
            ))}
          </div>
        )}
      </Section>

      {runtimeInfo && (
        <Section title={t.sectionPaths}>
          <Card className="border border-border bg-secondary p-4 text-[11px] font-mono">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Folder className="h-3 w-3" />
              <span className="break-all">{runtimeInfo.managedBrowserCacheDir}</span>
            </div>
          </Card>
        </Section>
      )}
    </main>
  )
}

function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-xs font-bold uppercase tracking-[0.15em] text-muted-foreground">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

type Translations = typeof labels['en']

function PluginCard({ plugin, locale, onSetActiveVersion, onDelete }: { plugin: BrowserPlugin; locale: Locale; onSetActiveVersion: (pluginId: string, versionId: string) => Promise<void>; onDelete: (pluginId: string) => Promise<void> }) {
  const t = labels[locale] as Translations
  const active = plugin.versions.find((version) => version.id === plugin.activeVersionId)
  const [busy, setBusy] = useState(false)
  const versionLabel = useMemo(() => interpolate(t.versions, { count: String(plugin.versions.length) }), [t.versions, plugin.versions.length])

  async function setActive(versionId: string) {
    if (versionId === plugin.activeVersionId) return
    setBusy(true)
    try {
      await onSetActiveVersion(plugin.id, versionId)
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    setBusy(true)
    try {
      await onDelete(plugin.id)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="border border-border bg-secondary p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-display text-sm font-bold uppercase tracking-wider">{plugin.name}</h3>
          {plugin.description && <p className="mt-1 text-[11px] text-muted-foreground">{plugin.description}</p>}
          <p className="mt-1 text-[11px] font-mono text-muted-foreground">
            {t.activeVersion}: <span className="text-primary">v{active?.version || '—'}</span> · {versionLabel}
          </p>
        </div>
        <Button variant="destructive" size="sm" className="gap-2" disabled={busy} onClick={() => void remove()}>
          <Trash2 className="h-3 w-3" />
          {t.delete}
        </Button>
      </div>
      {plugin.versions.length > 1 && (
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {plugin.versions.map((version) => {
            const isActive = version.id === plugin.activeVersionId
            return (
              <div key={version.id} className={`flex items-center justify-between border px-3 py-2 ${isActive ? 'border-primary bg-primary/10' : 'border-border bg-background'}`}>
                <div className="flex flex-col text-[11px] font-mono">
                  <span className={isActive ? 'text-primary font-bold' : ''}>v{version.version}</span>
                  <span className="text-muted-foreground">{new Date(version.importedAt).toLocaleString()}</span>
                </div>
                {!isActive && (
                  <Button variant="ghost" size="sm" disabled={busy} onClick={() => void setActive(version.id)}>{t.select}</Button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}
