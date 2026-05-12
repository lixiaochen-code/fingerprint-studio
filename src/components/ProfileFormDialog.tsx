import { useEffect, useMemo, useState } from 'react'
import { Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import type { BrowserPlugin, BrowserProfile, HostOs, ProfileDraft, TargetOs, TargetOsChoice } from '../../electron/types'

type Locale = 'en' | 'zh'

const targetOsOptions: TargetOsChoice[] = ['random', 'windows', 'mac', 'linux']
const platformOptions = ['amazon', 'shopify', 'ebay', 'tiktok', 'walmart', 'other']

// Map Electron's hostOs enum to the TargetOs the user can pick. We use this so "Add new"
// defaults the fingerprint OS to the user's machine — requested product behavior.
function hostToTargetOs(host: HostOs | undefined): TargetOs {
  if (host === 'win32') return 'windows'
  if (host === 'darwin') return 'mac'
  return 'linux'
}

const labels = {
  en: {
    create: 'New environment',
    edit: 'Edit environment',
    name: 'Name',
    namePlaceholder: 'Storefront US 01',
    platform: 'Platform',
    targetOs: 'Target OS',
    startUrl: 'Start URL',
    startUrlPlaceholder: 'https://www.amazon.com',
    proxyHost: 'Proxy Host',
    proxyPort: 'Proxy Port',
    proxyUsername: 'Proxy Username',
    proxyPassword: 'Proxy Password',
    proxyAuthHint: 'Optional. Leave blank for anonymous proxies. Credentials are saved locally and injected at launch via a helper extension.',
    notes: 'Notes',
    notesPlaceholder: 'Optional operating notes',
    plugins: 'Plugins',
    pluginsHint: 'Toggle the extensions that should load with this environment.',
    importZip: 'Import ZIP',
    importing: 'Importing...',
    noPlugins: 'No plugins imported yet.',
    cancel: 'Cancel',
    submit: 'Save',
    submitting: 'Saving...',
    osWindows: 'Windows',
    osMac: 'Mac',
    osLinux: 'Linux',
    osRandom: 'Random',
    platformNames: { amazon: 'AMAZON', shopify: 'SHOPIFY', ebay: 'EBAY', tiktok: 'TIKTOK', walmart: 'WALMART', other: 'OTHER' }
  },
  zh: {
    create: '新建环境',
    edit: '编辑环境',
    name: '名称',
    namePlaceholder: '美区店铺 01',
    platform: '平台',
    targetOs: '目标系统',
    startUrl: '启动网址',
    startUrlPlaceholder: 'https://www.amazon.com',
    proxyHost: '代理主机',
    proxyPort: '代理端口',
    proxyUsername: '代理账号',
    proxyPassword: '代理密码',
    proxyAuthHint: '可选。匿名代理请留空。账号密码仅保存在本地，启动时通过辅助扩展自动注入。',
    notes: '备注',
    notesPlaceholder: '可选运营备注',
    plugins: '插件',
    pluginsHint: '勾选启动该环境时一并加载的扩展。',
    importZip: '导入 ZIP',
    importing: '导入中…',
    noPlugins: '还未导入任何插件。',
    cancel: '取消',
    submit: '保存',
    submitting: '保存中…',
    osWindows: 'Windows',
    osMac: 'Mac',
    osLinux: 'Linux',
    osRandom: '随机',
    platformNames: { amazon: '亚马逊', shopify: 'Shopify', ebay: 'eBay', tiktok: 'TikTok', walmart: '沃尔玛', other: '其他' }
  }
} as const

export type ProfileFormDialogProps = {
  open: boolean
  mode: 'create' | 'edit'
  initial?: BrowserProfile
  plugins: BrowserPlugin[]
  locale: Locale
  hostOs: HostOs | undefined
  onCancel: () => void
  onSubmit: (draft: ProfileDraft) => Promise<void>
  onImportPlugin: () => Promise<BrowserPlugin | undefined>
}

type FormState = {
  name: string
  platform: string
  startUrl: string
  proxyHost: string
  proxyPort: string
  proxyUsername: string
  proxyPassword: string
  notes: string
  targetOs: TargetOsChoice
  enabledPluginIds: string[]
}

function blankForm(hostOs: TargetOsChoice): FormState {
  return {
    name: '',
    platform: 'other',
    startUrl: 'https://www.google.com',
    proxyHost: '127.0.0.1',
    proxyPort: '7890',
    proxyUsername: '',
    proxyPassword: '',
    notes: '',
    targetOs: hostOs,
    enabledPluginIds: []
  }
}

function formFromProfile(profile: BrowserProfile): FormState {
  return {
    name: profile.name,
    platform: profile.platform,
    startUrl: profile.startUrl,
    proxyHost: profile.proxy.host,
    proxyPort: String(profile.proxy.port),
    proxyUsername: profile.proxy.username ?? '',
    proxyPassword: profile.proxy.password ?? '',
    notes: profile.notes,
    targetOs: profile.fingerprint.targetOs,
    enabledPluginIds: [...profile.enabledPluginIds]
  }
}

export function ProfileFormDialog({ open, mode, initial, plugins, locale, hostOs, onCancel, onSubmit, onImportPlugin }: ProfileFormDialogProps) {
  const t = labels[locale]
  const defaultTarget = hostToTargetOs(hostOs)
  const [form, setForm] = useState<FormState>(() => blankForm(defaultTarget))
  const [submitting, setSubmitting] = useState(false)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | undefined>()

  useEffect(() => {
    if (!open) return
    setForm(initial ? formFromProfile(initial) : blankForm(defaultTarget))
    setError(undefined)
    setSubmitting(false)
  }, [open, initial, defaultTarget])

  const targetLabel = useMemo(() => ({
    random: t.osRandom,
    windows: t.osWindows,
    mac: t.osMac,
    linux: t.osLinux
  }), [t])

  const platformLabels = t.platformNames as Record<string, string>

  async function submit() {
    setSubmitting(true)
    setError(undefined)
    try {
      const draft: ProfileDraft = {
        id: initial?.id,
        name: form.name.trim() || (mode === 'create' ? `${t.create} ${plugins.length + 1}` : initial?.name || ''),
        platform: form.platform,
        startUrl: form.startUrl,
        notes: form.notes,
        targetOs: form.targetOs,
        enabledPluginIds: form.enabledPluginIds,
        proxy: {
          host: form.proxyHost,
          port: Number(form.proxyPort) || 7890,
          username: form.proxyUsername.trim() || undefined,
          // Passwords stay exactly as typed — trimming would silently break credentials with a leading/trailing space.
          password: form.proxyPassword ? form.proxyPassword : undefined
        }
      }
      await onSubmit(draft)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setSubmitting(false)
    }
  }

  async function importPlugin() {
    setImporting(true)
    try {
      const plugin = await onImportPlugin()
      if (plugin) {
        setForm((prev) => ({ ...prev, enabledPluginIds: [...new Set([...prev.enabledPluginIds, plugin.id])] }))
      }
    } finally {
      setImporting(false)
    }
  }

  function togglePlugin(id: string, checked: boolean) {
    setForm((prev) => ({
      ...prev,
      enabledPluginIds: checked
        ? [...new Set([...prev.enabledPluginIds, id])]
        : prev.enabledPluginIds.filter((value) => value !== id)
    }))
  }

  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title={mode === 'create' ? t.create : t.edit}
      size="lg"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={submitting}>{t.cancel}</Button>
          <Button size="sm" onClick={() => void submit()} disabled={submitting}>
            {submitting ? t.submitting : t.submit}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 md:grid-cols-2">
        <Field label={t.name}>
          <Input value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} placeholder={t.namePlaceholder} />
        </Field>
        <Field label={t.platform}>
          <Select value={form.platform} onChange={(value) => setForm((prev) => ({ ...prev, platform: value }))}
            options={platformOptions.map((option) => ({ value: option, label: platformLabels[option] || option.toUpperCase() }))}
          />
        </Field>
        <Field label={t.targetOs}>
          <Select value={form.targetOs} onChange={(value) => setForm((prev) => ({ ...prev, targetOs: value as TargetOsChoice }))}
            options={targetOsOptions.map((option) => ({ value: option, label: targetLabel[option] }))}
          />
        </Field>
        <Field label={t.startUrl}>
          <Input value={form.startUrl} onChange={(e) => setForm((prev) => ({ ...prev, startUrl: e.target.value }))} placeholder={t.startUrlPlaceholder} />
        </Field>
        <Field label={t.proxyHost}>
          <Input value={form.proxyHost} onChange={(e) => setForm((prev) => ({ ...prev, proxyHost: e.target.value }))} placeholder="127.0.0.1" />
        </Field>
        <Field label={t.proxyPort}>
          <Input value={form.proxyPort} inputMode="numeric" onChange={(e) => setForm((prev) => ({ ...prev, proxyPort: e.target.value }))} placeholder="7890" />
        </Field>
        <Field label={t.proxyUsername}>
          <Input
            value={form.proxyUsername}
            autoComplete="off"
            onChange={(e) => setForm((prev) => ({ ...prev, proxyUsername: e.target.value }))}
            placeholder="(optional)"
          />
        </Field>
        <Field label={t.proxyPassword}>
          <Input
            value={form.proxyPassword}
            type="password"
            autoComplete="new-password"
            onChange={(e) => setForm((prev) => ({ ...prev, proxyPassword: e.target.value }))}
            placeholder="(optional)"
          />
        </Field>
        <div className="md:col-span-2 -mt-2 text-[11px] text-muted-foreground">{t.proxyAuthHint}</div>
        <Field label={t.notes} className="md:col-span-2">
          <Input value={form.notes} onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))} placeholder={t.notesPlaceholder} />
        </Field>
      </div>

      <div className="mt-6 border-t border-border pt-5">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h3 className="font-display text-xs font-bold uppercase tracking-wider">{t.plugins}</h3>
            <p className="text-[11px] text-muted-foreground">{t.pluginsHint}</p>
          </div>
          <Button variant="outline" size="sm" className="gap-2" disabled={importing} onClick={() => void importPlugin()}>
            <Upload className="h-3 w-3" />
            {importing ? t.importing : t.importZip}
          </Button>
        </div>
        {plugins.length === 0 ? (
          <p className="border border-dashed border-border bg-background/50 p-4 text-center text-[11px] text-muted-foreground">{t.noPlugins}</p>
        ) : (
          <ul className="divide-y divide-border border border-border">
            {plugins.map((plugin) => {
              const active = plugin.versions.find((version) => version.id === plugin.activeVersionId)
              const checked = form.enabledPluginIds.includes(plugin.id)
              return (
                <li key={plugin.id} className="flex items-center justify-between gap-3 bg-background px-3 py-2">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <Checkbox checked={checked} onChange={(value) => togglePlugin(plugin.id, value)} ariaLabel={plugin.name} />
                    <div className="flex flex-col">
                      <span className="text-xs font-bold tracking-tight">{plugin.name}</span>
                      <span className="text-[10px] font-mono text-muted-foreground">
                        v{active?.version || '—'} · {plugin.versions.length} version(s)
                      </span>
                    </div>
                  </label>
                  {plugin.description && <span className="text-[10px] text-muted-foreground line-clamp-1 max-w-[300px]">{plugin.description}</span>}
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {error && <p className="mt-4 text-xs text-destructive">{error}</p>}
    </Dialog>
  )
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`space-y-2 ${className || ''}`}>
      <span className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}

function Select({ value, onChange, options }: { value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }> }) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="flex h-9 w-full border border-border bg-input px-3 py-1 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>{option.label}</option>
      ))}
    </select>
  )
}
