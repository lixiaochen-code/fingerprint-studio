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
  FileCode2
} from 'lucide-react'
import type { BrowserPlugin, BrowserProfile, KernelType, ProfileDraft, RuntimeInfo, Script, ScriptDraft, TargetOs } from '../electron/types'
import { KernelSetup } from './components/KernelSetup'
import { ProfileFormDialog } from './components/ProfileFormDialog'
import { ProfileDetailsDialog } from './components/ProfileDetailsDialog'
import { ConfirmDeleteDialog } from './components/ConfirmDeleteDialog'
import { SettingsView } from './components/SettingsView'
import { ScriptsView } from './components/ScriptsView'
import { interpolate } from './lib/i18n'
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
  platform: string
  proxy: string
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
  fingerprintModes: {
    extension: { title: string; description: string }
    cloak: { title: string; description: string }
    itbrowser: { title: string; description: string }
    off: { title: string; description: string }
  }
  platformNames: Record<string, string>
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
    searchPlaceholder: 'SEARCH BY NAME / PLATFORM / PROXY...',
    refresh: 'REFRESH',
    environment: 'Environment',
    platform: 'Platform',
    proxy: 'Proxy',
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
    browserCrashedDetails: 'Exit code {{code}}{{signal}}. Check the log for details.',
    fingerprintModes: {
      extension: {
        title: 'Extension mode',
        description: 'A local Chrome extension rewrites navigator, WebGL, Canvas, AudioContext, fonts, etc. at the JavaScript layer. Works on every host platform with vanilla Chromium. Medium strength — deep stack details may still leak. Used as fallback when no source-level kernel is available.'
      },
      cloak: {
        title: 'Cloak mode',
        description: 'Uses CloakBrowser — a custom-built Chromium with 49+ source-level C++ patches covering canvas, WebGL, audio, fonts, GPU, screen, WebRTC, and automation signals. Strongest cross-platform fingerprint coverage. Linux/Windows only (no macOS upstream binary).'
      },
      itbrowser: {
        title: 'itbrowser mode',
        description: 'Uses the patched itbrowser Chromium kernel via --itbrowser=fingerprint.json so the spoofing happens inside the browser engine itself. Strong fingerprint coverage but Windows-only.'
      },
      off: {
        title: 'Spoofing disabled',
        description: 'No fingerprint rewriting. Each environment still has an isolated user-data dir and proxy, but all fingerprint surfaces report the real machine.'
      }
    },
    platformNames: {
      amazon: 'AMAZON',
      shopify: 'SHOPIFY',
      ebay: 'EBAY',
      tiktok: 'TIKTOK',
      walmart: 'WALMART',
      other: 'OTHER'
    }
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
    searchPlaceholder: '按名称 / 平台 / 代理搜索...',
    refresh: '刷新',
    environment: '环境',
    platform: '平台',
    proxy: '代理',
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
    browserCrashedDetails: '退出码 {{code}}{{signal}}。可在日志中查看详情。',
    fingerprintModes: {
      extension: {
        title: '扩展模式',
        description: '通过加载本地 Chrome 扩展，在 JavaScript 层面改写 navigator、WebGL、Canvas、AudioContext、字体等指纹面。三平台通用，强度中等——深层栈信息仍可能泄露。仅在内核级方案不可用时作为兜底。'
      },
      cloak: {
        title: 'Cloak 模式',
        description: '使用 CloakBrowser —— 自定义编译的 Chromium，包含 49+ 项 C++ 源码级补丁，覆盖 canvas、WebGL、audio、字体、GPU、screen、WebRTC、自动化信号等。跨平台强度最高。仅 Linux/Windows 提供二进制（macOS 上游未发布）。'
      },
      itbrowser: {
        title: 'itbrowser 模式',
        description: '使用打过补丁的 itbrowser Chromium 内核，通过 --itbrowser=fingerprint.json 在内核层面改写指纹。强度高但仅 Windows 可用。'
      },
      off: {
        title: '未启用',
        description: '不改写指纹。每个环境仍使用独立的 user-data 目录和代理，但所有指纹面都暴露真实机器信息。'
      }
    },
    platformNames: {
      amazon: '亚马逊',
      shopify: 'Shopify',
      ebay: 'eBay',
      tiktok: 'TikTok',
      walmart: '沃尔玛',
      other: '其他'
    }
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

function platformLabel(platform: string, locale: Locale) {
  const names = translations[locale].platformNames as Record<string, string>
  return names[platform] || platform.toUpperCase()
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

type View = 'profiles' | 'settings' | 'scripts'

type FormDialogState =
  | { open: false }
  | { open: true; mode: 'create'; profile?: undefined }
  | { open: true; mode: 'edit'; profile: BrowserProfile }

export function App() {
  const [profiles, setProfiles] = useState<BrowserProfile[]>([])
  const [plugins, setPlugins] = useState<BrowserPlugin[]>([])
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
    const [nextProfiles, nextPlugins, statuses, nextRuntimeInfo, nextScripts] = await Promise.all([
      window.registry.profiles.list(),
      window.registry.plugins.list(),
      window.registry.profiles.status(),
      window.registry.runtime.info(),
      window.registry.scripts.list()
    ])
    setProfiles(nextProfiles)
    setPlugins(nextPlugins)
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
    return profiles.filter((profile) =>
      [profile.name, profile.platform, profile.notes, profile.proxy.host].join(' ').toLowerCase().includes(needle)
    )
  }, [profiles, query])

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

  if (view === 'scripts') {
    return (
      <div className="flex h-screen flex-col bg-background text-foreground font-sans">
        <Header
          t={t}
          locale={locale}
          profilesCount={profiles.length}
          pluginsCount={plugins.length}
          runningCount={runningIds.size}
          runtime={runtimeInfo}
          themePref={themePref}
          onThemeChange={setThemePref}
          onAdd={() => setFormDialog({ open: true, mode: 'create' })}
          onSettings={() => setView('settings')}
          onScripts={() => setView('scripts')}
          onHome={() => setView('profiles')}
          onLocaleToggle={() => setLocale((current) => (current === 'en' ? 'zh' : 'en'))}
          currentView="scripts"
        />
        <div className="flex-1 overflow-hidden">
          <ScriptsView
            locale={locale}
            scripts={scripts}
            selectedScriptId={selectedScriptId}
            onSelect={setSelectedScriptId}
            onCreate={createScript}
            onRemove={removeScript}
          />
        </div>
        <Toaster theme={resolvedTheme} position="top-right" richColors closeButton />
      </div>
    )
  }

  if (view === 'settings') {
    return (
      <div className="flex h-screen flex-col bg-background text-foreground font-sans">
        <Header
          t={t}
          locale={locale}
          profilesCount={profiles.length}
          pluginsCount={plugins.length}
          runningCount={runningIds.size}
          runtime={runtimeInfo}
          themePref={themePref}
          onThemeChange={setThemePref}
          onAdd={() => setFormDialog({ open: true, mode: 'create' })}
          onSettings={() => setView('settings')}
          onScripts={() => setView('scripts')}
          onHome={() => setView('profiles')}
          onLocaleToggle={() => setLocale((current) => (current === 'en' ? 'zh' : 'en'))}
          currentView="settings"
        />
        <div className="flex-1 overflow-auto">
          <SettingsView
            runtimeInfo={runtimeInfo}
            plugins={plugins}
            locale={locale}
            onBack={() => setView('profiles')}
            onInstallKernel={(kernel) => setSetupKernel(kernel)}
            onImportPlugin={() => importPluginFromForm().then(() => undefined).catch(() => undefined)}
            onSetActiveVersion={setActiveVersion}
            onDeletePlugin={deletePlugin}
          />
        </div>
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
        <Toaster theme={resolvedTheme} position="top-right" richColors closeButton />
      </div>
    )
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
        onAdd={() => setFormDialog({ open: true, mode: 'create' })}
        onSettings={() => setView('settings')}
        onScripts={() => setView('scripts')}
        onHome={() => setView('profiles')}
        onLocaleToggle={() => setLocale((current) => (current === 'en' ? 'zh' : 'en'))}
        currentView="profiles"
      />

      <main className="flex flex-1 flex-col overflow-hidden">
        <div className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col overflow-hidden p-6 gap-4">
          <div className="flex items-center gap-3">
            <FingerprintBadge runtime={runtimeInfo} t={t} />
            <div className="relative max-w-md flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t.searchPlaceholder}
                className="pl-10 h-10 border-none bg-muted/50 focus-visible:ring-1"
              />
            </div>
            <Button variant="ghost" size="sm" onClick={() => void load()}>
              <RotateCcw className="h-4 w-4 mr-2" />
              {t.refresh}
            </Button>
          </div>

          <div className={`flex items-center justify-between border px-4 py-2 transition-colors ${selectedIds.size > 0 ? 'border-primary/40 bg-primary/10' : 'border-border bg-muted/30'}`}>
            <div className="flex items-center gap-3 text-xs">
              <Checkbox
                checked={selectedIds.size > 0}
                onChange={() => setSelectedIds(new Set())}
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
                onClick={() => setDetailsIds(Array.from(selectedIds))}
              >
                <Eye className="h-3 w-3" />
                {t.details}
              </Button>
              <Button
                variant="destructive"
                size="sm"
                className="gap-2"
                disabled={selectedIds.size === 0}
                onClick={() => setDeleteIds(Array.from(selectedIds))}
              >
                <Trash2 className="h-3 w-3" />
                {t.delete}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={selectedIds.size === 0}
                onClick={() => setSelectedIds(new Set())}
              >
                <X className="h-3 w-3 mr-1" />
                {t.clear}
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
                        onChange={(checked) => toggleAll(checked)}
                      />
                    </th>
                    <th className="h-10 px-4 text-left align-middle font-mono text-[11px] uppercase tracking-wider text-muted-foreground">{t.environment}</th>
                    <th className="h-10 px-4 text-left align-middle font-mono text-[11px] uppercase tracking-wider text-muted-foreground w-[120px]">{t.platform}</th>
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

                    return (
                      <tr key={profile.id} className="group border-b border-border transition-colors hover:bg-muted/30">
                        <td className="p-4 align-middle">
                          <Checkbox checked={checked} onChange={(value) => toggleSelect(profile.id, value)} />
                        </td>
                        <td className="p-4 align-middle">
                          <div className="flex flex-col">
                            <span className="font-bold text-sm tracking-tight">{profile.name}</span>
                            <span className="text-[11px] text-muted-foreground font-mono truncate max-w-[200px]">
                              {profile.notes || profile.startUrl}
                            </span>
                          </div>
                        </td>
                        <td className="p-4 align-middle">
                          <span className="inline-flex items-center px-2 py-0.5 bg-muted text-[10px] font-bold font-mono tracking-wider">
                            {platformLabel(profile.platform, locale)}
                          </span>
                        </td>
                        <td className="p-4 align-middle">
                          <code className="text-[11px] text-accent font-mono">
                            {profile.proxy.host}:{profile.proxy.port}
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
                          <div className="flex items-center gap-2">
                            <div className={`h-1.5 w-1.5 rounded-full ${isRunning ? 'bg-primary animate-pulse shadow-[0_0_8px_var(--color-primary)]' : 'bg-muted'}`} />
                            <span className={`text-[10px] font-bold font-mono tracking-widest ${isRunning ? 'text-primary' : 'text-muted-foreground'}`}>
                              {isRunning ? t.online : t.offline}
                            </span>
                          </div>
                        </td>
                        <td className="p-4 align-middle text-right">
                          <div className="flex items-center justify-end gap-2">
                            {isRunning ? (
                              <Button variant="destructive" size="sm" className="h-8 px-3" disabled={isBusy} onClick={() => stop(profile)}>
                                <Square className="h-3 w-3 mr-2 fill-current" />
                                {t.stop}
                              </Button>
                            ) : (
                              <Button variant="default" size="sm" className="h-8 px-3" disabled={isBusy} onClick={() => launch(profile)}>
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
                                { label: t.details, icon: <Eye className="h-3 w-3" />, onClick: () => setDetailsIds([profile.id]) },
                                { label: t.edit, icon: <Settings2 className="h-3 w-3" />, onClick: () => setFormDialog({ open: true, mode: 'edit', profile }) },
                                { label: t.duplicate, icon: <Copy className="h-3 w-3" />, onClick: () => void duplicateProfile(profile) },
                                { label: t.delete, icon: <Trash2 className="h-3 w-3" />, variant: 'destructive', onClick: () => setDeleteIds([profile.id]) }
                              ]}
                            />
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={8} className="h-32 text-center text-muted-foreground font-mono">
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

      <ProfileFormDialog
        open={formDialog.open}
        mode={formDialog.open ? formDialog.mode : 'create'}
        initial={formDialog.open && formDialog.mode === 'edit' ? formDialog.profile : undefined}
        plugins={plugins}
        locale={locale}
        hostOs={runtimeInfo?.hostOs}
        onCancel={() => setFormDialog({ open: false })}
        onSubmit={submitProfile}
        onImportPlugin={importPluginFromForm}
      />

      <ProfileDetailsDialog
        open={detailsIds.length > 0}
        profiles={profiles.filter((profile) => detailsIds.includes(profile.id))}
        plugins={plugins}
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

function FingerprintBadge({ runtime, t }: { runtime?: RuntimeInfo; t: Translations }) {
  const enabled = runtime?.fingerprintSpoofingEnabled
  const Icon = enabled ? AlertTriangle : ShieldCheck
  const tone = enabled ? 'border-amber-400/40 bg-amber-400/10 text-amber-300' : 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300'
  const title = enabled
    ? interpolate(t.riskTitle, { mode: runtime?.fingerprintMode?.toUpperCase() || '—' })
    : t.secureTitle
  const modeKey = (runtime?.fingerprintMode || 'off') as 'extension' | 'cloak' | 'itbrowser' | 'off'
  const detail = t.fingerprintModes[modeKey]
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

function Header({
  t,
  locale,
  profilesCount,
  pluginsCount,
  runningCount,
  runtime,
  themePref,
  onThemeChange,
  onAdd,
  onSettings,
  onScripts,
  onHome,
  onLocaleToggle,
  currentView
}: {
  t: Translations
  locale: Locale
  profilesCount: number
  pluginsCount: number
  runningCount: number
  runtime?: RuntimeInfo
  themePref: ThemePref
  onThemeChange: (pref: ThemePref) => void
  onAdd: () => void
  onSettings: () => void
  onScripts: () => void
  onHome: () => void
  onLocaleToggle: () => void
  currentView: View
}) {
  const ThemeIcon = themePref === 'light' ? Sun : themePref === 'dark' ? Moon : Monitor
  const isSettings = currentView === 'settings'
  const isScripts = currentView === 'scripts'
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
                      {t.fingerprintModes[(runtime?.fingerprintMode || 'off') as 'extension' | 'cloak' | 'itbrowser' | 'off'].title}
                    </div>
                    <p className="text-[11px] leading-relaxed text-muted-foreground">
                      {t.fingerprintModes[(runtime?.fingerprintMode || 'off') as 'extension' | 'cloak' | 'itbrowser' | 'off'].description}
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
          {!isSettings && !isScripts && (
            <Button size="sm" className="gap-2" onClick={onAdd}>
              <Plus className="h-4 w-4" />
              {t.addNew}
            </Button>
          )}
          <Button
            variant={isScripts ? 'default' : 'secondary'}
            size="sm"
            onClick={isScripts ? onHome : onScripts}
            title={locale === 'zh' ? '脚本' : 'Scripts'}
          >
            <FileCode2 className="h-4 w-4" />
          </Button>
          <Button
            variant={isSettings ? 'default' : 'secondary'}
            size="sm"
            onClick={isSettings ? onHome : onSettings}
            title={t.settings}
          >
            <Settings2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </header>
  )
}
