import { useEffect, useMemo, useState } from 'react'
import { Toaster, toast } from 'sonner'
import {
  Alert,
  AlertDescription,
  AlertTitle
} from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { DropdownMenu } from "@/components/ui/dropdown-menu"
import { Tooltip } from "@/components/ui/tooltip"
import {
  Plus,
  Play,
  Square,
  MoreVertical,
  RotateCcw,
  Search,
  Settings2,
  Languages,
  Trash2,
  Copy,
  Eye,
  X,
  ShieldCheck,
  AlertTriangle,
  Info,
  Sun,
  Moon,
  Monitor,
  FileCode2,
  Layers,
  Globe2
} from 'lucide-react'
import type { BrowserPlugin, BrowserProfile, KernelType, ProfileDraft, Proxy, ProxyDraft, RuntimeInfo, Script, ScriptDraft, ScriptRun, TargetOs } from '../electron/types'
import { KernelSetup } from './components/KernelSetup'
import { ProfileFormDialog } from './components/ProfileFormDialog'
import { ProfileDetailsDialog } from './components/ProfileDetailsDialog'
import { ConfirmDeleteDialog } from './components/ConfirmDeleteDialog'
import { SettingsView } from './components/SettingsView'
import { ScriptsView } from './components/ScriptsView'
import { ProxiesView } from './components/ProxiesView'
import { KeepAlive } from './components/KeepAlive'
import { ActiveRunsButton } from './components/ActiveRunsButton'
import { interpolate } from './lib/i18n'
import { FINGERPRINT_MODE_LABELS, type FingerprintModeKey } from './lib/fingerprintModeLabels'
import './styles.css'

type Locale = 'en' | 'zh'
type ThemePref = 'light' | 'dark' | 'system'

type Translations = {
  appName: string
  addNew: string
  cancel: string
  actionFailed: string
  importSuccess: string
  importCanceled: string
  duplicateSuccess: string
  deleteSuccess: string
  duplicate: string
  delete: string
  details: string
  edit: string
  selected: string
  clear: string
  envAbbr: string
  pluginAbbr: string
  runningAbbr: string
  loading: string
  languageSwitch: string
  languageLabel: string
  riskTitle: string
  secureTitle: string
  riskDescription: string
  secureDescription: string
  searchPlaceholder: string
  refresh: string
  environment: string
  proxy: string
  proxyNone: string
  fingerprint: string
  createdAt: string
  status: string
  actions: string
  online: string
  offline: string
  stop: string
  run: string
  empty: string
  osWindows: string
  osMac: string
  osLinux: string
  osRandom: string
  settings: string
  theme: string
  themeLight: string
  themeDark: string
  themeSystem: string
  fingerprintModeHint: string
  browserCrashedTitle: string
  browserCrashedDetails: string
}

const translations: Record<Locale, Translations> = {
  en: {
    appName: 'AUTO REGISTRY',
    addNew: 'ADD NEW',
    cancel: 'CANCEL',
    actionFailed: '{{action}} failed: {{message}}',
    importSuccess: 'Plugin imported: {{name}}',
    importCanceled: 'Import canceled.',
    duplicateSuccess: 'Duplicated to "{{name}}".',
    deleteSuccess: 'Removed {{count}} environment(s).',
    duplicate: 'Duplicate',
    delete: 'Delete',
    details: 'Details',
    edit: 'Edit',
    selected: '{{count}} selected',
    clear: 'Clear',
    envAbbr: 'ENV',
    pluginAbbr: 'PLG',
    runningAbbr: 'RUN',
    loading: 'LOADING...',
    languageSwitch: '中文',
    languageLabel: 'Switch language',
    riskTitle: 'Fingerprint Mode: {{mode}}',
    secureTitle: 'Fingerprint Mode: Off',
    riskDescription: 'Active kernel: {{kernel}}. Host {{host}}.',
    secureDescription: 'Fingerprint spoofing is disabled.',
    searchPlaceholder: 'SEARCH BY NAME / PROXY...',
    refresh: 'REFRESH',
    environment: 'Environment',
    proxy: 'Proxy',
    proxyNone: 'No proxy',
    fingerprint: 'Fingerprint',
    createdAt: 'Created',
    status: 'Status',
    actions: 'Actions',
    online: 'ONLINE',
    offline: 'OFFLINE',
    stop: 'STOP',
    run: 'RUN',
    empty: 'NO ENVIRONMENTS FOUND.',
    osWindows: 'WINDOWS',
    osMac: 'MAC',
    osLinux: 'LINUX',
    osRandom: 'RANDOM',
    settings: 'Settings',
    theme: 'Theme',
    themeLight: 'Light',
    themeDark: 'Dark',
    themeSystem: 'System',
    fingerprintModeHint: 'How browser fingerprint is being spoofed for every profile.',
    browserCrashedTitle: 'Browser exited unexpectedly: {{name}}',
    browserCrashedDetails: 'Exit code {{code}}{{signal}}. Check the log for details.'
  },
  zh: {
    appName: '环境管理器',
    addNew: '新建环境',
    cancel: '取消',
    actionFailed: '{{action}}失败：{{message}}',
    importSuccess: '插件已导入：{{name}}',
    importCanceled: '已取消导入。',
    duplicateSuccess: '已复制为「{{name}}」。',
    deleteSuccess: '已删除 {{count}} 个环境。',
    duplicate: '复制',
    delete: '删除',
    details: '详情',
    edit: '编辑',
    selected: '已选 {{count}}',
    clear: '清除',
    envAbbr: '环境',
    pluginAbbr: '插件',
    runningAbbr: '运行',
    loading: '加载中...',
    languageSwitch: 'EN',
    languageLabel: '切换语言',
    riskTitle: '指纹模式：{{mode}}',
    secureTitle: '指纹模式：关闭',
    riskDescription: '当前内核：{{kernel}}，宿主：{{host}}。',
    secureDescription: '指纹改写已关闭。',
    searchPlaceholder: '按名称 / 代理搜索...',
    refresh: '刷新',
    environment: '环境',
    proxy: '代理',
    proxyNone: '无代理',
    fingerprint: '指纹',
    createdAt: '创建时间',
    status: '状态',
    actions: '操作',
    online: '在线',
    offline: '离线',
    stop: '停止',
    run: '启动',
    empty: '暂无环境。',
    osWindows: 'WINDOWS',
    osMac: 'MAC',
    osLinux: 'LINUX',
    osRandom: '随机',
    settings: '设置',
    theme: '主题',
    themeLight: '浅色',
    themeDark: '深色',
    themeSystem: '跟随系统',
    fingerprintModeHint: '当前为每个环境改写浏览器指纹的方式。',
    browserCrashedTitle: '浏览器异常退出：{{name}}',
    browserCrashedDetails: '退出码 {{code}}{{signal}}。可在日志中查看详情。'
  }
}

function initialLocale(): Locale {
  const stored = window.localStorage.getItem('auto-registry-locale')
  if (stored === 'en' || stored === 'zh') return stored
  return navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en'
}

function initialTheme(): ThemePref {
  const stored = window.localStorage.getItem('auto-registry-theme')
  if (stored === 'light' || stored === 'dark' || stored === 'system') return stored
  return 'system'
}

function resolveTheme(pref: ThemePref): 'light' | 'dark' {
  if (pref !== 'system') return pref
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function targetOsLabel(target: TargetOs, locale: Locale) {
  const t = translations[locale]
  if (target === 'windows') return t.osWindows
  if (target === 'mac') return t.osMac
  if (target === 'linux') return t.osLinux
  return t.osRandom
}

function activeKernelLabel(runtime: RuntimeInfo | undefined) {
  if (!runtime) return '—'
  if (runtime.hostOs === 'win32' && runtime.kernels.itbrowser.installed) return 'ITBROWSER'
  if (runtime.cloakSupported && runtime.kernels.cloak.installed) return 'CLOAK'
  if (runtime.kernels.chromium.installed) return 'CHROMIUM'
  return 'NONE'
}

function hostLabel(runtime: RuntimeInfo | undefined) {
  if (!runtime) return '—'
  if (runtime.hostOs === 'win32') return 'WINDOWS'
  if (runtime.hostOs === 'darwin') return 'MAC'
  return 'LINUX'
}

function formatDate(value?: string) {
  if (!value) return { date: '—', time: '' }
  try {
    const d = new Date(value)
    const pad = (n: number) => String(n).padStart(2, '0')
    return {
      date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
      time: `${pad(d.getHours())}:${pad(d.getMinutes())}`
    }
  } catch {
    return { date: value, time: '' }
  }
}

type View = 'profiles' | 'settings' | 'scripts' | 'proxies'

type FormDialogState =
  | { open: false }
  | { open: true; mode: 'create'; profile?: undefined }
  | { open: true; mode: 'edit'; profile: BrowserProfile }

export function App() {
  const [profiles, setProfiles] = useState<BrowserProfile[]>([])
  const [plugins, setPlugins] = useState<BrowserPlugin[]>([])
  const [proxies, setProxies] = useState<Proxy[]>([])
  const [runningIds, setRunningIds] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState('')
  const [busyId, setBusyId] = useState<string>()
  const [runtimeInfo, setRuntimeInfo] = useState<RuntimeInfo>()
  const [locale, setLocale] = useState<Locale>(initialLocale)
  const [view, setView] = useState<View>('profiles')
  const [formDialog, setFormDialog] = useState<FormDialogState>({ open: false })
  const [detailsIds, setDetailsIds] = useState<string[]>([])
  const [deleteIds, setDeleteIds] = useState<string[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [setupKernel, setSetupKernel] = useState<KernelType>()
  const [themePref, setThemePref] = useState<ThemePref>(initialTheme)
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>(() => resolveTheme(initialTheme()))
  const [scripts, setScripts] = useState<Script[]>([])
  const [selectedScriptId, setSelectedScriptId] = useState<string>()
  // 全局活跃 run 集合（来自主进程 'active-changed' 广播 + 启动时的 listActive 兜底）。
  // Header 抽屉 / Environments 列表 SCRIPTING 徽章 / Scripts 面板 chip 灰显都从这里派生。
  // 注意：这里**不**保存日志，日志由 ScriptRunPanel 自己分脚本维护。
  const [activeRuns, setActiveRuns] = useState<ScriptRun[]>([])
  const t = translations[locale]

  useEffect(() => {
    const apply = () => setResolvedTheme(resolveTheme(themePref))
    apply()
    window.localStorage.setItem('auto-registry-theme', themePref)
    if (themePref === 'system') {
      const mql = window.matchMedia('(prefers-color-scheme: dark)')
      mql.addEventListener('change', apply)
      return () => mql.removeEventListener('change', apply)
    }
  }, [themePref])

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme
  }, [resolvedTheme])

  async function load() {
    const [nextProfiles, nextPlugins, statuses, nextRuntimeInfo, nextScripts, nextProxies] = await Promise.all([
      window.registry.profiles.list(),
      window.registry.plugins.list(),
      window.registry.profiles.status(),
      window.registry.runtime.info(),
      window.registry.scripts.list(),
      window.registry.proxies.list()
    ])
    setProfiles(nextProfiles)
    setPlugins(nextPlugins)
    setProxies(nextProxies)
    setRunningIds(new Set(statuses.filter((status: any) => status.running).map((status: any) => status.profileId)))
    setRuntimeInfo(nextRuntimeInfo)
    setScripts(nextScripts)
    setSelectedIds((prev) => {
      const next = new Set<string>()
      for (const id of prev) {
        if (nextProfiles.some((profile) => profile.id === id)) next.add(id)
      }
      return next
    })
  }

  useEffect(() => {
    void load()
    const timer = window.setInterval(() => void load(), 3000)
    return () => window.clearInterval(timer)
  }, [])

  // Subscribe once: main process emits profiles:crashed when a spawned browser dies
  // outside of a user-initiated stop. We surface it so users stop staring at a silent UI.
  useEffect(() => {
    const unsubscribe = window.registry.profiles.onCrashed((event) => {
      const profile = profiles.find((item) => item.id === event.profileId)
      const name = profile?.name || event.profileId
      const code = event.exitCode ?? 'n/a'
      const signal = event.signal ? ` · ${event.signal}` : ''
      toast.error(interpolate(t.browserCrashedTitle, { name }), {
        description: (
          <div className="space-y-1">
            <p className="text-[11px]">{interpolate(t.browserCrashedDetails, { code: String(code), signal })}</p>
            {event.stderrTail && (
              <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all rounded bg-muted/50 p-2 text-[10px] font-mono text-muted-foreground">
                {event.stderrTail.slice(-2000)}
              </pre>
            )}
          </div>
        )
      })
      void load()
    })
    return () => unsubscribe()
  }, [profiles, t])

  // 订阅活跃 run 集合：主进程在 start / handleExit 时广播 'active-changed'。
  // 启动时主动拉一次兜底（错过初始事件不会有空状态错觉）。
  useEffect(() => {
    let cancelled = false
    void window.registry.scripts.activeRuns().then((initial) => {
      if (!cancelled) setActiveRuns(initial)
    })
    const unsubscribe = window.registry.scripts.onEvent((event) => {
      if (event.type === 'active-changed') {
        setActiveRuns(event.active)
      }
    })
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en'
    window.localStorage.setItem('auto-registry-locale', locale)
  }, [locale])

  useEffect(() => {
    if (!runtimeInfo) return
    if (!runtimeInfo.kernels.chromium.installed && setupKernel === undefined) {
      setSetupKernel('chromium')
    }
  }, [runtimeInfo, setupKernel])

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return profiles
    // 代理搜索从 ProxyStore 真源派生:支持搜代理"名字" + "host:port",
    // 命中即视为该 profile 的代理匹配。inline profile.proxy 字段在 Phase 1c 之前是兼容
    // 镜像,proxyId=null 时为空,搜也搜不到,所以这里直接用 proxies 表查。
    const proxyById = new Map(proxies.map((proxy) => [proxy.id, proxy] as const))
    return profiles.filter((profile) => {
      const proxy = profile.proxyId ? proxyById.get(profile.proxyId) : undefined
      const proxySearchable = proxy
        ? `${proxy.name} ${proxy.host}:${proxy.port}`
        : ''
      return [profile.name, profile.notes, proxySearchable, profile.startUrl ?? '']
        .join(' ')
        .toLowerCase()
        .includes(needle)
    })
  }, [profiles, proxies, query])

  const selectedProfiles = useMemo(
    () => profiles.filter((profile) => selectedIds.has(profile.id)),
    [profiles, selectedIds]
  )

  const allFilteredSelected = filtered.length > 0 && filtered.every((profile) => selectedIds.has(profile.id))
  const someFilteredSelected = !allFilteredSelected && filtered.some((profile) => selectedIds.has(profile.id))

  function toggleSelect(id: string, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  function toggleAll(checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      for (const profile of filtered) {
        if (checked) next.add(profile.id)
        else next.delete(profile.id)
      }
      return next
    })
  }

  async function launch(profile: BrowserProfile) {
    setBusyId(profile.id)
    try {
      const result = await window.registry.profiles.launch(profile.id)
      if (!result.ok) {
        if (result.error?.code === 'KERNEL_MISSING' && result.error.kernel) {
          setSetupKernel(result.error.kernel)
        } else {
          toast.error(interpolate(t.actionFailed, { action: t.run, message: result.error?.message || 'unknown' }))
        }
      }
      await load()
    } catch (error) {
      console.error(error)
    } finally {
      setBusyId(undefined)
    }
  }

  async function stop(profile: BrowserProfile) {
    setBusyId(profile.id)
    try {
      await window.registry.profiles.stop(profile.id)
      await load()
    } catch (error) {
      console.error(error)
    } finally {
      setBusyId(undefined)
    }
  }

  async function submitProfile(draft: ProfileDraft) {
    await window.registry.profiles.save(draft)
    setFormDialog({ open: false })
    await load()
  }

  async function importPluginFromForm() {
    try {
      const plugin = await window.registry.plugins.importZip()
      if (plugin) {
        toast.success(interpolate(t.importSuccess, { name: plugin.name }))
      } else {
        toast(t.importCanceled)
      }
      await load()
      return plugin
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      toast.error(interpolate(t.actionFailed, { action: 'IMPORT', message }))
      throw error
    }
  }

  async function duplicateProfile(profile: BrowserProfile) {
    try {
      const copy = await window.registry.profiles.duplicate(profile.id)
      toast.success(interpolate(t.duplicateSuccess, { name: copy.name }))
      await load()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      toast.error(interpolate(t.actionFailed, { action: t.duplicate, message }))
    }
  }

  async function confirmDelete(ids: string[]) {
    await Promise.all(ids.map((id) => window.registry.profiles.remove(id)))
    setDeleteIds([])
    setSelectedIds((prev) => {
      const next = new Set(prev)
      for (const id of ids) next.delete(id)
      return next
    })
    toast.success(interpolate(t.deleteSuccess, { count: String(ids.length) }))
    await load()
  }

  async function setActiveVersion(pluginId: string, versionId: string) {
    await window.registry.plugins.setActiveVersion(pluginId, versionId)
    await load()
  }

  async function deletePlugin(pluginId: string) {
    await window.registry.plugins.remove(pluginId)
    await load()
  }

  async function createScript(draft: ScriptDraft) {
    try {
      const created = await window.registry.scripts.save(draft)
      toast.success(interpolate(locale === 'zh' ? '脚本已保存：{{name}}' : 'Script saved: {{name}}', { name: created.name }))
      await load()
      return created
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      toast.error(interpolate(t.actionFailed, { action: 'SCRIPT', message }))
      throw error
    }
  }

  async function removeScript(scriptId: string) {
    try {
      await window.registry.scripts.remove(scriptId)
      toast.success(locale === 'zh' ? '脚本已删除' : 'Script removed')
      await load()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      toast.error(interpolate(t.actionFailed, { action: 'SCRIPT', message }))
    }
  }

  return (
    <div className="flex h-screen flex-col bg-background text-foreground font-sans selection:bg-primary selection:text-primary-foreground">
      <Header
        t={t}
        locale={locale}
        profilesCount={profiles.length}
        pluginsCount={plugins.length}
        runningCount={runningIds.size}
        runtime={runtimeInfo}
        themePref={themePref}
        onThemeChange={setThemePref}
        onNavigate={setView}
        onLocaleToggle={() => setLocale((current) => (current === 'en' ? 'zh' : 'en'))}
        currentView={view}
        activeRuns={activeRuns}
        scripts={scripts}
        profiles={profiles}
        onOpenScript={(scriptId) => {
          setSelectedScriptId(scriptId)
          setView('scripts')
        }}
      />

      {/*
        三视图保活路由：每个 view 渲染一次后就保留在 React 树里，切走只是 display:none，
        所有内部状态 / Monaco 实例 / 滚动位置 / 订阅都保留。
        Environments 默认就 mount（用户进来第一眼就需要）；Scripts/Settings 走 lazy，
        第一次切到才挂载，避免 Monaco chunk 在用户没看脚本前就被请求。
      */}
      <KeepAlive visible={view === 'profiles'} lazy={false}>
        <ProfilesPanel
          t={t}
          locale={locale}
          runtimeInfo={runtimeInfo}
          query={query}
          onQueryChange={setQuery}
          onReload={() => void load()}
          filtered={filtered}
          proxies={proxies}
          runningIds={runningIds}
          busyId={busyId}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
          onToggleAll={toggleAll}
          allFilteredSelected={allFilteredSelected}
          someFilteredSelected={someFilteredSelected}
          onClearSelection={() => setSelectedIds(new Set())}
          onShowDetails={(ids) => setDetailsIds(ids)}
          onAskDelete={(ids) => setDeleteIds(ids)}
          onAdd={() => setFormDialog({ open: true, mode: 'create' })}
          onEdit={(profile) => setFormDialog({ open: true, mode: 'edit', profile })}
          onDuplicate={duplicateProfile}
          onLaunch={launch}
          onStop={stop}
          activeRuns={activeRuns}
          scripts={scripts}
          onOpenScript={(scriptId) => {
            setSelectedScriptId(scriptId)
            setView('scripts')
          }}
        />
      </KeepAlive>

      <KeepAlive visible={view === 'scripts'}>
        <ScriptsView
          locale={locale}
          theme={resolvedTheme}
          scripts={scripts}
          profiles={profiles}
          proxies={proxies}
          runningProfileIds={runningIds}
          activeRuns={activeRuns}
          selectedScriptId={selectedScriptId}
          onSelect={setSelectedScriptId}
          onCreate={createScript}
          onRemove={removeScript}
          onGoToEnvironments={() => setView('profiles')}
        />
      </KeepAlive>

      <KeepAlive visible={view === 'proxies'}>
        <ProxiesView
          proxies={proxies}
          onReload={load}
          locale={locale}
          onToast={(message, kind) => kind === 'error' ? toast.error(message) : toast.success(message)}
        />
      </KeepAlive>

      <KeepAlive visible={view === 'settings'}>
        <div className="flex-1 overflow-auto">
          <SettingsView
            runtimeInfo={runtimeInfo}
            plugins={plugins}
            locale={locale}
            onInstallKernel={(kernel) => setSetupKernel(kernel)}
            onImportPlugin={() => importPluginFromForm().then(() => undefined).catch(() => undefined)}
            onSetActiveVersion={setActiveVersion}
            onDeletePlugin={deletePlugin}
          />
        </div>
      </KeepAlive>

      <ProfileFormDialog
        open={formDialog.open}
        mode={formDialog.open ? formDialog.mode : 'create'}
        initial={formDialog.open && formDialog.mode === 'edit' ? formDialog.profile : undefined}
        plugins={plugins}
        proxies={proxies}
        locale={locale}
        hostOs={runtimeInfo?.hostOs}
        onCancel={() => setFormDialog({ open: false })}
        onSubmit={submitProfile}
        onImportPlugin={importPluginFromForm}
        onCreateProxy={async (draft: ProxyDraft) => {
          // 嵌套"+ 新增代理"流:由 ProfileFormDialog 通过 ProxyFormDialog 触发。
          // 我们持久化后立刻 reload 全局 proxies,然后把刚建的 Proxy 返回给对话框自动选中。
          const created = await window.registry.proxies.save(draft)
          await load()
          return created
        }}
      />

      <ProfileDetailsDialog
        open={detailsIds.length > 0}
        profiles={profiles.filter((profile) => detailsIds.includes(profile.id))}
        plugins={plugins}
        proxies={proxies}
        locale={locale}
        onClose={() => setDetailsIds([])}
      />

      <ConfirmDeleteDialog
        open={deleteIds.length > 0}
        names={profiles.filter((profile) => deleteIds.includes(profile.id)).map((profile) => profile.name)}
        locale={locale}
        onCancel={() => setDeleteIds([])}
        onConfirm={() => confirmDelete(deleteIds)}
      />

      <KernelSetup
        open={setupKernel !== undefined}
        kernel={setupKernel || 'chromium'}
        status={setupKernel && runtimeInfo ? runtimeInfo.kernels[setupKernel] : undefined}
        locale={locale}
        hostSupportsItbrowser={runtimeInfo?.itbrowserSupported || false}
        hostSupportsCloak={runtimeInfo?.cloakSupported || false}
        onClose={() => setSetupKernel(undefined)}
        onInstalled={() => void load()}
      />

      <Toaster
        theme={resolvedTheme}
        position="top-right"
        richColors
        closeButton
        toastOptions={{
          style: { fontFamily: 'var(--font-display)' }
        }}
      />
    </div>
  )
}

function FingerprintBadge({ runtime, t, locale }: { runtime?: RuntimeInfo; t: Translations; locale: Locale }) {
  const enabled = runtime?.fingerprintSpoofingEnabled
  const Icon = enabled ? AlertTriangle : ShieldCheck
  const tone = enabled ? 'border-amber-400/40 bg-amber-400/10 text-amber-300' : 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300'
  const title = enabled
    ? interpolate(t.riskTitle, { mode: runtime?.fingerprintMode?.toUpperCase() || '—' })
    : t.secureTitle
  const modeKey = (runtime?.fingerprintMode || 'off') as FingerprintModeKey
  const detail = FINGERPRINT_MODE_LABELS[locale][modeKey]
  return (
    <Tooltip
      side="bottom"
      align="start"
      content={
        <div className="space-y-1">
          <div className="font-display text-[11px] font-bold uppercase tracking-wider text-primary">{detail.title}</div>
          <p className="text-[11px] leading-relaxed text-muted-foreground">{detail.description}</p>
        </div>
      }
    >
      <button type="button" className={`inline-flex cursor-help items-center gap-2 border px-3 py-2 ${tone}`}>
        <Icon className="h-3.5 w-3.5" />
        <span className="font-display text-[11px] font-bold uppercase tracking-wider whitespace-nowrap">{title}</span>
        <Info className="h-3 w-3 opacity-60" />
      </button>
    </Tooltip>
  )
}

/**
 * Environments 视图主体。从 App 抽出来是为了：
 * 1. 给 KeepAlive 提供一个干净的子树，切走时整体 display:none，搜索词/选区/滚动都保留
 * 2. App 顶部 return 不至于太长
 *
 * 业务状态（profiles/runningIds/selectedIds 等）依然由 App 持有 —— 这一层只接受 props
 * 并往下渲染。多人协作时改 App 那一层数据流，这里不用动。
 */
function ProfilesPanel({
  t,
  locale,
  runtimeInfo,
  query,
  onQueryChange,
  onReload,
  filtered,
  proxies,
  runningIds,
  busyId,
  selectedIds,
  onToggleSelect,
  onToggleAll,
  allFilteredSelected,
  someFilteredSelected,
  onClearSelection,
  onShowDetails,
  onAskDelete,
  onAdd,
  onEdit,
  onDuplicate,
  onLaunch,
  onStop,
  activeRuns,
  scripts,
  onOpenScript
}: {
  t: Translations
  locale: Locale
  runtimeInfo?: RuntimeInfo
  query: string
  onQueryChange: (value: string) => void
  onReload: () => void
  filtered: BrowserProfile[]
  /**
   * ProxyStore 真源。表格"代理"列 + 行 tooltip 都按 profile.proxyId 查这里。
   * inline profile.proxy 字段已是 deprecated 兼容镜像,proxyId=null 时为空,不能再用。
   */
  proxies: Proxy[]
  runningIds: Set<string>
  busyId: string | undefined
  selectedIds: Set<string>
  onToggleSelect: (id: string, checked: boolean) => void
  onToggleAll: (checked: boolean) => void
  allFilteredSelected: boolean
  someFilteredSelected: boolean
  onClearSelection: () => void
  onShowDetails: (ids: string[]) => void
  onAskDelete: (ids: string[]) => void
  onAdd: () => void
  onEdit: (profile: BrowserProfile) => void
  onDuplicate: (profile: BrowserProfile) => void
  onLaunch: (profile: BrowserProfile) => void
  onStop: (profile: BrowserProfile) => void
  activeRuns: ScriptRun[]
  scripts: Script[]
  onOpenScript: (scriptId: string) => void
}) {
  // 把活跃 run 按 profileId 索引，用于在 Status 列显示 SCRIPTING 徽章。
  // 闭环规则：profile 同一时刻最多 1 个活跃 run，因此 Map 直接 set 不需要合并。
  const scriptingByProfileId = useMemo(() => {
    const map = new Map<string, ScriptRun>()
    for (const run of activeRuns) map.set(run.profileId, run)
    return map
  }, [activeRuns])

  const scriptNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const s of scripts) map.set(s.id, s.name)
    return map
  }, [scripts])
  return (
    <main className="flex flex-1 flex-col overflow-hidden">
      <div className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col overflow-hidden p-6 gap-4">
        <div className="flex items-center gap-3">
          <FingerprintBadge runtime={runtimeInfo} t={t} locale={locale} />
          <div className="relative max-w-md flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder={t.searchPlaceholder}
              className="pl-10 h-10 border-none bg-muted/50 focus-visible:ring-1"
            />
          </div>
          <Button variant="ghost" size="sm" onClick={onReload}>
            <RotateCcw className="h-4 w-4 mr-2" />
            {t.refresh}
          </Button>
        </div>

        {/*
          选区 + 操作工具条。无选中时左侧灰色 "0 selected"，右侧只显示 "+ 新建环境"；
          有选中时左侧高亮、操作按钮（详情/删除/清除）激活。整条始终在位，避免抖动。
        */}
        <div className={`flex items-center justify-between border px-4 py-2 transition-colors ${selectedIds.size > 0 ? 'border-primary/40 bg-primary/10' : 'border-border bg-muted/30'}`}>
          <div className="flex items-center gap-3 text-xs">
            <Checkbox
              checked={selectedIds.size > 0}
              onChange={onClearSelection}
              disabled={selectedIds.size === 0}
            />
            <span className={`font-display font-bold uppercase tracking-wider ${selectedIds.size > 0 ? 'text-foreground' : 'text-muted-foreground'}`}>
              {interpolate(t.selected, { count: String(selectedIds.size) })}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              disabled={selectedIds.size === 0}
              onClick={() => onShowDetails(Array.from(selectedIds))}
            >
              <Eye className="h-3 w-3" />
              {t.details}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              className="gap-2"
              disabled={selectedIds.size === 0}
              onClick={() => onAskDelete(Array.from(selectedIds))}
            >
              <Trash2 className="h-3 w-3" />
              {t.delete}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={selectedIds.size === 0}
              onClick={onClearSelection}
            >
              <X className="h-3 w-3 mr-1" />
              {t.clear}
            </Button>
            {/* "+ 新建环境" 是 Environments 页的功能按钮（不是全局导航），放在工具条右侧 */}
            <Button size="sm" className="gap-2 ml-2" onClick={onAdd}>
              <Plus className="h-4 w-4" />
              {t.addNew}
            </Button>
          </div>
        </div>

        <Card className="flex min-h-0 flex-1 flex-col overflow-hidden border border-border bg-secondary">
          <div className="flex-1 overflow-auto">
            <table className="w-full caption-bottom text-sm">
              <thead className="sticky top-0 z-10 border-b border-border bg-secondary">
                <tr className="border-b border-border">
                  <th className="h-10 px-4 text-left align-middle font-mono text-[11px] uppercase tracking-wider text-muted-foreground w-[40px]">
                    <Checkbox
                      checked={allFilteredSelected ? true : someFilteredSelected ? 'indeterminate' : false}
                      onChange={(checked) => onToggleAll(checked)}
                    />
                  </th>
                  <th className="h-10 px-4 text-left align-middle font-mono text-[11px] uppercase tracking-wider text-muted-foreground">{t.environment}</th>
                  <th className="h-10 px-4 text-left align-middle font-mono text-[11px] uppercase tracking-wider text-muted-foreground w-[180px]">{t.proxy}</th>
                  <th className="h-10 px-4 text-left align-middle font-mono text-[11px] uppercase tracking-wider text-muted-foreground w-[260px]">{t.fingerprint}</th>
                  <th className="h-10 px-4 text-left align-middle font-mono text-[11px] uppercase tracking-wider text-muted-foreground w-[140px]">{t.createdAt}</th>
                  <th className="h-10 px-4 text-left align-middle font-mono text-[11px] uppercase tracking-wider text-muted-foreground w-[100px]">{t.status}</th>
                  <th className="h-10 px-4 text-right align-middle font-mono text-[11px] uppercase tracking-wider text-muted-foreground w-[160px]">{t.actions}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((profile) => {
                  const isRunning = runningIds.has(profile.id)
                  const isBusy = busyId === profile.id
                  const target = profile.fingerprint.targetOs as TargetOs
                  const checked = selectedIds.has(profile.id)
                  const occupyingRun = scriptingByProfileId.get(profile.id)
                  const occupyingScriptName = occupyingRun ? scriptNameById.get(occupyingRun.scriptId) : undefined
                  // 代理显示从 ProxyStore 真源派生:proxyId=null → 显示"无代理";有 id 但
                  // ProxyStore 找不到(代理被删了 profile 没更)→ 也显示"无代理",避免误导。
                  const proxy = profile.proxyId
                    ? proxies.find((entry) => entry.id === profile.proxyId)
                    : undefined
                  return (
                    <tr key={profile.id} className="group border-b border-border transition-colors hover:bg-muted/30">
                      <td className="p-4 align-middle">
                        <Checkbox checked={checked} onChange={(value) => onToggleSelect(profile.id, value)} />
                      </td>
                      <td className="p-4 align-middle">
                        <div className="flex flex-col">
                          <span className="font-bold text-sm tracking-tight">{profile.name}</span>
                          <span className="text-[11px] text-muted-foreground font-mono truncate max-w-[200px]">
                            {profile.notes || profile.startUrl || '—'}
                          </span>
                        </div>
                      </td>
                      <td className="p-4 align-middle">
                        <code className="text-[11px] text-accent font-mono">
                          {proxy ? `${proxy.host}:${proxy.port}` : t.proxyNone}
                        </code>
                      </td>
                      <td className="p-4 align-middle">
                        <div className="flex flex-col text-[11px] font-mono text-muted-foreground gap-1">
                          <div className="flex items-center gap-2">
                            <span className="inline-flex items-center px-1.5 py-0.5 bg-primary/15 text-primary text-[10px] font-bold tracking-wider">
                              {targetOsLabel(target, locale)}
                            </span>
                            <span>{profile.fingerprint.language?.toUpperCase()} / {profile.fingerprint.timezone?.split('/').pop()}</span>
                          </div>
                          <span className="text-[9px] opacity-50 truncate max-w-[240px]">{profile.fingerprint.userAgent}</span>
                        </div>
                      </td>
                      <td className="p-4 align-middle">
                        <div className="flex flex-col text-[11px] font-mono text-muted-foreground">
                          <span>{formatDate(profile.createdAt).date}</span>
                          <span className="text-[10px] opacity-60">{formatDate(profile.createdAt).time}</span>
                        </div>
                      </td>
                      <td className="p-4 align-middle">
                        {/* 状态优先级：被脚本占用 > 浏览器在跑 > 离线。
                            被占用时点击徽章会跳到对应脚本面板；其它时候保持原显示 */}
                        {occupyingRun ? (
                          <button
                            type="button"
                            onClick={() => onOpenScript(occupyingRun.scriptId)}
                            className="inline-flex items-center gap-2 border border-amber-400/40 bg-amber-400/10 px-1.5 py-0.5 text-[10px] font-bold font-mono tracking-widest text-amber-400 hover:bg-amber-400/20"
                            title={occupyingScriptName ? `Running script: ${occupyingScriptName}` : 'Running script'}
                          >
                            <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
                            <span>SCRIPTING</span>
                          </button>
                        ) : (
                          <div className="flex items-center gap-2">
                            <div className={`h-1.5 w-1.5 rounded-full ${isRunning ? 'bg-primary animate-pulse shadow-[0_0_8px_var(--color-primary)]' : 'bg-muted'}`} />
                            <span className={`text-[10px] font-bold font-mono tracking-widest ${isRunning ? 'text-primary' : 'text-muted-foreground'}`}>
                              {isRunning ? t.online : t.offline}
                            </span>
                          </div>
                        )}
                      </td>
                      <td className="p-4 align-middle text-right">
                        <div className="flex items-center justify-end gap-2">
                          {isRunning ? (
                            <Button variant="destructive" size="sm" className="h-8 px-3" disabled={isBusy} onClick={() => onStop(profile)}>
                              <Square className="h-3 w-3 mr-2 fill-current" />
                              {t.stop}
                            </Button>
                          ) : (
                            <Button variant="default" size="sm" className="h-8 px-3" disabled={isBusy} onClick={() => onLaunch(profile)}>
                              <Play className="h-3 w-3 mr-2 fill-current" />
                              {t.run}
                            </Button>
                          )}
                          <DropdownMenu
                            trigger={
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            }
                            items={[
                              { label: t.details, icon: <Eye className="h-3 w-3" />, onClick: () => onShowDetails([profile.id]) },
                              { label: t.edit, icon: <Settings2 className="h-3 w-3" />, onClick: () => onEdit(profile) },
                              { label: t.duplicate, icon: <Copy className="h-3 w-3" />, onClick: () => onDuplicate(profile) },
                              { label: t.delete, icon: <Trash2 className="h-3 w-3" />, variant: 'destructive', onClick: () => onAskDelete([profile.id]) }
                            ]}
                          />
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={7} className="h-32 text-center text-muted-foreground font-mono">
                      {t.empty}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </main>
  )
}

function Header({
  t,
  locale,
  profilesCount,
  pluginsCount,
  runningCount,
  runtime,
  themePref,
  onThemeChange,
  onNavigate,
  onLocaleToggle,
  currentView,
  activeRuns,
  scripts,
  profiles,
  onOpenScript
}: {
  t: Translations
  locale: Locale
  profilesCount: number
  pluginsCount: number
  runningCount: number
  runtime?: RuntimeInfo
  themePref: ThemePref
  onThemeChange: (pref: ThemePref) => void
  onNavigate: (view: View) => void
  onLocaleToggle: () => void
  currentView: View
  activeRuns: ScriptRun[]
  scripts: Script[]
  profiles: BrowserProfile[]
  onOpenScript: (scriptId: string) => void
}) {
  const ThemeIcon = themePref === 'light' ? Sun : themePref === 'dark' ? Moon : Monitor

  // 三个 tab 按钮共用同一种渲染逻辑：当前页 = default 高亮，其它 = secondary。
  // 全部仅图标 + Tooltip 提示页名。
  const navItems: Array<{ view: View; label: string; Icon: typeof Layers }> = [
    { view: 'profiles', label: locale === 'zh' ? '环境' : 'Environments', Icon: Layers },
    { view: 'scripts', label: locale === 'zh' ? '脚本' : 'Scripts', Icon: FileCode2 },
    { view: 'proxies', label: locale === 'zh' ? '代理' : 'Proxies', Icon: Globe2 },
    { view: 'settings', label: t.settings, Icon: Settings2 }
  ]

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-xl">
      <div className="flex h-16 items-center justify-between px-6">
        <div className="flex items-center gap-4">
          <div className="brand-mark">AR</div>
          <div>
            <h1 className="font-display text-xl font-bold tracking-tight">{t.appName}</h1>
            <div className="flex flex-wrap items-center gap-2 font-mono text-[10px] text-muted-foreground uppercase">
              <span>{t.envAbbr}:{profilesCount}</span>
              <span className="opacity-20">|</span>
              <span>{t.pluginAbbr}:{pluginsCount}</span>
              <span className="opacity-20">|</span>
              <span>{t.runningAbbr}:{runningCount}</span>
              <span className="opacity-20">|</span>
              <Tooltip
                side="bottom"
                align="start"
                content={
                  <div className="space-y-1">
                    <div className="font-display text-[11px] font-bold uppercase tracking-wider text-primary">
                      {FINGERPRINT_MODE_LABELS[locale][(runtime?.fingerprintMode || 'off') as FingerprintModeKey].title}
                    </div>
                    <p className="text-[11px] leading-relaxed text-muted-foreground">
                      {FINGERPRINT_MODE_LABELS[locale][(runtime?.fingerprintMode || 'off') as FingerprintModeKey].description}
                    </p>
                  </div>
                }
              >
                <span className={`inline-flex cursor-help items-center gap-1 ${runtime?.fingerprintSpoofingEnabled ? 'text-amber-500' : 'text-emerald-500'}`}>
                  MODE:{runtime?.fingerprintMode?.toUpperCase() || '—'}
                  <Info className="h-3 w-3 opacity-60" />
                </span>
              </Tooltip>
              <span className="opacity-20">|</span>
              <span className="text-primary">KERNEL:{activeKernelLabel(runtime)}</span>
              <span className="opacity-20">|</span>
              <span>HOST:{hostLabel(runtime)}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="gap-2"
            aria-label={t.languageLabel}
            onClick={onLocaleToggle}
          >
            <Languages className="h-4 w-4" />
            {t.languageSwitch}
          </Button>
          <DropdownMenu
            trigger={
              <Button variant="ghost" size="sm" className="h-9 w-9 p-0" title={t.theme}>
                <ThemeIcon className="h-4 w-4" />
              </Button>
            }
            items={[
              { label: t.themeLight, icon: <Sun className="h-3 w-3" />, onClick: () => onThemeChange('light') },
              { label: t.themeDark, icon: <Moon className="h-3 w-3" />, onClick: () => onThemeChange('dark') },
              { label: t.themeSystem, icon: <Monitor className="h-3 w-3" />, onClick: () => onThemeChange('system') }
            ]}
          />
          {/* 全局活跃 run：图标 + 数字徽章；点开浮层看所有跨脚本运行中的 run */}
          <ActiveRunsButton
            locale={locale}
            activeRuns={activeRuns}
            scripts={scripts}
            profiles={profiles}
            onOpenScript={onOpenScript}
          />
          {/* 导航 tab 组：纯图标 + Tooltip 提示页名。当前页高亮 */}
          <div className="ml-2 flex items-center gap-1 border-l border-border pl-3">
            {navItems.map(({ view, label, Icon }) => {
              const active = currentView === view
              return (
                <Tooltip key={view} side="bottom" content={label}>
                  <Button
                    variant={active ? 'default' : 'secondary'}
                    size="sm"
                    className="h-9 w-9 p-0"
                    aria-label={label}
                    aria-current={active ? 'page' : undefined}
                    onClick={() => onNavigate(view)}
                  >
                    <Icon className="h-4 w-4" />
                  </Button>
                </Tooltip>
              )
            })}
          </div>
        </div>
      </div>
    </header>
  )
}
