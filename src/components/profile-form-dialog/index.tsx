import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import type {
  BrowserPlugin,
  BrowserProfile,
  HostOs,
  ProfileDraft,
  Proxy,
  ProxyDraft,
  TargetOs,
  TargetOsChoice
} from '../../../electron/types'
import { ProxySelectField } from '../proxy-select-field'
import { ProxyFormDialog } from '../proxy-form-dialog'
import { PluginsSection } from './components/plugins-section'

type Locale = 'en' | 'zh'

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
    targetOs: 'Target OS',
    startUrl: 'Start URL (optional)',
    startUrlPlaceholder: 'https://www.amazon.com',
    startUrlHint: 'Opened only on the very first launch of this environment. Later launches restore the existing tabs.',
    proxy: 'Proxy',
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
    targetOsLockedHint: 'Locked to host OS. Cross-OS spoofing is disabled because Cloudflare client hints expose the real platform; per-profile differentiation is done via WebGL/Canvas/Audio/fonts instead.'
  },
  zh: {
    create: '新建环境',
    edit: '编辑环境',
    name: '名称',
    namePlaceholder: '美区店铺 01',
    targetOs: '目标系统',
    startUrl: '启动网址（可选）',
    startUrlPlaceholder: 'https://www.amazon.com',
    startUrlHint: '仅在该环境首次启动时打开。之后启动会恢复上次的标签页，不会再跳转。',
    proxy: '代理',
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
    targetOsLockedHint: '已锁定为宿主系统。跨 OS 伪装会暴露真实 client hints 被 Cloudflare 直接识破,因此停用;每个环境的差异化由 WebGL/Canvas/Audio/字体 等维度实现。'
  }
} as const

export type ProfileFormDialogProps = {
  open: boolean
  mode: 'create' | 'edit'
  initial?: BrowserProfile
  plugins: BrowserPlugin[]
  /**
   * 已保存的代理条目列表,由 App.tsx 加载并向下传。父组件应该在 ProxiesView 或本对话框
   * 内部新建代理后,reload 然后再次传入。
   */
  proxies: Proxy[]
  locale: Locale
  hostOs: HostOs | undefined
  onCancel: () => void
  onSubmit: (draft: ProfileDraft) => Promise<void>
  onImportPlugin: () => Promise<BrowserPlugin | undefined>
  /**
   * 嵌套的"+ 新增代理"流程:本组件打开 ProxyFormDialog,用户提交后我们调这个回调,
   * 父组件负责持久化(window.registry.proxies.save)并 reload proxies。我们用返回的
   * Proxy.id 自动选中刚建好的代理。
   */
  onCreateProxy: (draft: ProxyDraft) => Promise<Proxy>
}

type FormState = {
  name: string
  startUrl: string
  proxyId: string | null
  notes: string
  targetOs: TargetOsChoice
  enabledPluginIds: string[]
}

function blankForm(hostOs: TargetOsChoice): FormState {
  return {
    name: '',
    startUrl: '',
    // 默认无代理 —— 用户的产品诉求 "默认无代理,使用系统代理"。
    proxyId: null,
    notes: '',
    targetOs: hostOs,
    enabledPluginIds: []
  }
}

function formFromProfile(profile: BrowserProfile): FormState {
  return {
    name: profile.name,
    startUrl: profile.startUrl ?? '',
    proxyId: profile.proxyId,
    notes: profile.notes,
    targetOs: profile.fingerprint.targetOs,
    enabledPluginIds: [...profile.enabledPluginIds]
  }
}

export function ProfileFormDialog({ open, mode, initial, plugins, proxies, locale, hostOs, onCancel, onSubmit, onImportPlugin, onCreateProxy }: ProfileFormDialogProps) {
  const t = labels[locale]
  const defaultTarget = hostToTargetOs(hostOs)
  const [form, setForm] = useState<FormState>(() => blankForm(defaultTarget))
  const [submitting, setSubmitting] = useState(false)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | undefined>()
  // 嵌套"新建代理"对话框,选了 + 新增 时打开。提交后自动选中返回的 proxy.id。
  const [createProxyOpen, setCreateProxyOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    setForm(initial ? formFromProfile(initial) : blankForm(defaultTarget))
    setError(undefined)
    setSubmitting(false)
    setCreateProxyOpen(false)
  }, [open, initial, defaultTarget])

  const targetLabel = useMemo(() => ({
    random: t.osRandom,
    windows: t.osWindows,
    mac: t.osMac,
    linux: t.osLinux
  }), [t])

  async function submit() {
    setSubmitting(true)
    setError(undefined)
    try {
      const draft: ProfileDraft = {
        id: initial?.id,
        name: form.name.trim() || (mode === 'create' ? `${t.create} ${plugins.length + 1}` : initial?.name || ''),
        // 显式带上 startUrl（即使是空字符串）—— store.upsert 用 hasOwnProperty 判断
        // 是否要从 existing 继承，传 '' 表示用户清空，传 undefined 表示不动。
        startUrl: form.startUrl,
        notes: form.notes,
        targetOs: form.targetOs,
        enabledPluginIds: form.enabledPluginIds,
        // 代理只通过 proxyId 引用 ProxyStore 条目;null = 无代理(走系统代理)。
        proxyId: form.proxyId
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

  async function handleCreateProxy(draft: ProxyDraft): Promise<Proxy> {
    const created = await onCreateProxy(draft)
    // 自动选中刚建好的;父组件 reload 后下次渲染 proxies 数组里就有它
    setForm((prev) => ({ ...prev, proxyId: created.id }))
    setCreateProxyOpen(false)
    return created
  }

  return (
    <>
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
        <Field label={t.targetOs}>
          {/*
            目标系统改成只读展示:`fingerprint.ts::resolveTargetOs` 把 targetOs 钳到宿主,
            UI 上保留"Target OS"标签,但下拉选项失去实际效果(选了也会被忽略)。直接显示
            当前值 + 解释,比让用户做无效操作更诚实。
          */}
          <div className="flex h-10 items-center border border-input bg-muted/30 px-3 text-xs font-mono text-muted-foreground">
            {targetLabel[form.targetOs]}
          </div>
          <p className="text-[11px] text-muted-foreground">{t.targetOsLockedHint}</p>
        </Field>
        <Field label={t.startUrl} className="md:col-span-2">
          <Input value={form.startUrl} onChange={(e) => setForm((prev) => ({ ...prev, startUrl: e.target.value }))} placeholder={t.startUrlPlaceholder} />
          <p className="text-[11px] text-muted-foreground">{t.startUrlHint}</p>
        </Field>
        <Field label={t.proxy} className="md:col-span-2">
          <ProxySelectField
            value={form.proxyId}
            proxies={proxies}
            locale={locale}
            onCreateNew={() => setCreateProxyOpen(true)}
            onChange={(proxyId) => setForm((prev) => ({ ...prev, proxyId }))}
          />
        </Field>
        <Field label={t.notes} className="md:col-span-2">
          <Input value={form.notes} onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))} placeholder={t.notesPlaceholder} />
        </Field>
      </div>

      <PluginsSection
        plugins={plugins}
        enabledPluginIds={form.enabledPluginIds}
        onTogglePlugin={togglePlugin}
        importing={importing}
        onImportPlugin={importPlugin}
        t={t}
      />

      {error && <p className="mt-4 text-xs text-destructive">{error}</p>}
    </Dialog>

    {/* 嵌套 dialog:打开时 Radix 自己处理 z-index 堆叠,ProxyFormDialog 用同样 Dialog 组件,
        会被 Radix Portal 放到 body 末尾,显示在 ProfileFormDialog 之上 */}
    <ProxyFormDialog
      open={createProxyOpen}
      mode="create"
      locale={locale}
      onCancel={() => setCreateProxyOpen(false)}
      onSubmit={handleCreateProxy}
    />
    </>
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
