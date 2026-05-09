import { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  AlertDescription,
  AlertTitle
} from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  Plus,
  Play,
  Square,
  MoreVertical,
  RotateCcw,
  Upload,
  Search,
  AlertTriangle,
  ShieldCheck,
  Settings2,
  Languages,
  X,
  Download
} from 'lucide-react'
import type { BrowserPlugin, BrowserProfile, KernelType, ProfileDraft, RuntimeInfo, TargetOs, TargetOsChoice } from '../electron/types'
import { KernelSetup } from './components/KernelSetup'
import './styles.css'

type Locale = 'en' | 'zh'

const translations = {
  en: {
    appName: 'AUTO REGISTRY',
    addNew: 'ADD NEW',
    import: 'IMPORT',
    cancel: 'CANCEL',
    create: 'CREATE',
    creating: 'CREATING...',
    importing: 'IMPORTING...',
    importCanceled: 'Import canceled.',
    importSuccess: 'Plugin imported: {{name}}',
    actionFailed: '{{action}} failed: {{message}}',
    newEnvironment: 'New Environment',
    name: 'Name',
    namePlaceholder: 'Storefront US 01',
    startUrl: 'Start URL',
    startUrlPlaceholder: 'https://www.amazon.com',
    notes: 'Notes',
    notesPlaceholder: 'Optional operating notes',
    proxyHost: 'Proxy Host',
    proxyPort: 'Proxy Port',
    targetOs: 'Target OS',
    envAbbr: 'ENV',
    pluginAbbr: 'PLG',
    runningAbbr: 'RUN',
    loading: 'LOADING...',
    languageSwitch: '中文',
    languageLabel: 'Switch language',
    riskTitle: 'Fingerprint Mode: {{mode}}',
    secureTitle: 'Fingerprint Mode: Off',
    riskDescription: 'Active kernel: {{kernel}}. Host {{host}}. itbrowser native fingerprint requires Windows host with itbrowser kernel installed.',
    secureDescription: 'Fingerprint spoofing is disabled.',
    searchPlaceholder: 'SEARCH BY NAME / PLATFORM / PROXY...',
    refresh: 'REFRESH',
    environment: 'Environment',
    platform: 'Platform',
    proxy: 'Proxy',
    fingerprint: 'Fingerprint',
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
    kernels: 'Kernels',
    installChromium: 'Install Chromium',
    installItbrowser: 'Install itbrowser',
    installed: 'Installed',
    notInstalled: 'Not installed',
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
    import: '导入插件',
    cancel: '取消',
    create: '创建',
    creating: '创建中...',
    importing: '导入中...',
    importCanceled: '已取消导入。',
    importSuccess: '插件已导入：{{name}}',
    actionFailed: '{{action}}失败：{{message}}',
    newEnvironment: '新建环境',
    name: '名称',
    namePlaceholder: '美区店铺 01',
    startUrl: '启动网址',
    startUrlPlaceholder: 'https://www.amazon.com',
    notes: '备注',
    notesPlaceholder: '可选运营备注',
    proxyHost: '代理主机',
    proxyPort: '代理端口',
    targetOs: '目标系统',
    envAbbr: '环境',
    pluginAbbr: '插件',
    runningAbbr: '运行',
    loading: '加载中...',
    languageSwitch: 'EN',
    languageLabel: '切换语言',
    riskTitle: '指纹模式：{{mode}}',
    secureTitle: '指纹模式：关闭',
    riskDescription: '当前内核：{{kernel}}，宿主：{{host}}。itbrowser 原生指纹需要 Windows 宿主机并安装 itbrowser 内核。',
    secureDescription: '指纹改写已关闭。',
    searchPlaceholder: '按名称 / 平台 / 代理搜索...',
    refresh: '刷新',
    environment: '环境',
    platform: '平台',
    proxy: '代理',
    fingerprint: '指纹',
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
    kernels: '内核',
    installChromium: '安装 Chromium',
    installItbrowser: '安装 itbrowser',
    installed: '已安装',
    notInstalled: '未安装',
    platformNames: {
      amazon: '亚马逊',
      shopify: 'Shopify',
      ebay: 'eBay',
      tiktok: 'TikTok',
      walmart: '沃尔玛',
      other: '其他'
    }
  }
} as const

const platformOptions = ['amazon', 'shopify', 'ebay', 'tiktok', 'walmart', 'other']
const targetOsOptions: TargetOsChoice[] = ['random', 'windows', 'mac', 'linux']

type CreateForm = {
  name: string
  platform: string
  startUrl: string
  proxyHost: string
  proxyPort: string
  notes: string
  targetOs: TargetOsChoice
}

const defaultCreateForm: CreateForm = {
  name: '',
  platform: 'other',
  startUrl: 'https://www.google.com',
  proxyHost: '127.0.0.1',
  proxyPort: '7890',
  notes: '',
  targetOs: 'random'
}

function initialLocale(): Locale {
  const stored = window.localStorage.getItem('auto-registry-locale')
  if (stored === 'en' || stored === 'zh') return stored
  return navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en'
}

function interpolate(template: string, values: Record<string, string>) {
  return Object.entries(values).reduce((result, [key, value]) => result.split(`{{${key}}`).join(value), template)
}

function platformLabel(platform: string, locale: Locale) {
  const names = translations[locale].platformNames as Record<string, string>
  return names[platform] || platform.toUpperCase()
}

function targetOsLabel(target: TargetOsChoice, locale: Locale) {
  const t = translations[locale]
  if (target === 'windows') return t.osWindows
  if (target === 'mac') return t.osMac
  if (target === 'linux') return t.osLinux
  return t.osRandom
}

function activeKernelLabel(runtime: RuntimeInfo | undefined) {
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

export function App() {
  const [profiles, setProfiles] = useState<BrowserProfile[]>([])
  const [plugins, setPlugins] = useState<BrowserPlugin[]>([])
  const [runningIds, setRunningIds] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState('')
  const [busyId, setBusyId] = useState<string>()
  const [runtimeInfo, setRuntimeInfo] = useState<RuntimeInfo>()
  const [locale, setLocale] = useState<Locale>(initialLocale)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [createForm, setCreateForm] = useState<CreateForm>(defaultCreateForm)
  const [isCreating, setIsCreating] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [notice, setNotice] = useState<string>()
  const [setupKernel, setSetupKernel] = useState<KernelType>()
  const [showSettings, setShowSettings] = useState(false)
  const t = translations[locale]

  async function load() {
    const [nextProfiles, nextPlugins, statuses, nextRuntimeInfo] = await Promise.all([
      window.registry.profiles.list(),
      window.registry.plugins.list(),
      window.registry.profiles.status(),
      window.registry.runtime.info()
    ])
    setProfiles(nextProfiles)
    setPlugins(nextPlugins)
    setRunningIds(new Set(statuses.filter((status: any) => status.running).map((status: any) => status.profileId)))
    setRuntimeInfo(nextRuntimeInfo)
  }

  useEffect(() => {
    void load()
    const timer = window.setInterval(() => void load(), 3000)
    return () => window.clearInterval(timer)
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
    return profiles.filter((profile) =>
      [profile.name, profile.platform, profile.notes, profile.proxy.host].join(' ').toLowerCase().includes(needle)
    )
  }, [profiles, query])

  async function launch(profile: BrowserProfile) {
    setBusyId(profile.id)
    try {
      const result = await window.registry.profiles.launch(profile.id)
      if (!result.ok) {
        if (result.error?.code === 'KERNEL_MISSING' && result.error.kernel) {
          setSetupKernel(result.error.kernel)
        } else {
          setNotice(interpolate(t.actionFailed, { action: t.run, message: result.error?.message || 'unknown' }))
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

  async function createProfile() {
    setIsCreating(true)
    setNotice(undefined)
    try {
      const draft: ProfileDraft = {
        name: createForm.name.trim() || `${t.newEnvironment} ${profiles.length + 1}`,
        platform: createForm.platform,
        startUrl: createForm.startUrl,
        notes: createForm.notes,
        targetOs: createForm.targetOs,
        proxy: {
          host: createForm.proxyHost,
          port: Number(createForm.proxyPort) || 7890
        }
      }
      await window.registry.profiles.save(draft)
      setCreateForm(defaultCreateForm)
      setShowCreateForm(false)
      await load()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setNotice(interpolate(t.actionFailed, { action: t.create, message }))
      console.error(error)
    } finally {
      setIsCreating(false)
    }
  }

  async function importPlugin() {
    setIsImporting(true)
    setNotice(undefined)
    try {
      const plugin = await window.registry.plugins.importZip()
      setNotice(plugin ? interpolate(t.importSuccess, { name: plugin.name }) : t.importCanceled)
      await load()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setNotice(interpolate(t.actionFailed, { action: t.import, message }))
      console.error(error)
    } finally {
      setIsImporting(false)
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground font-sans selection:bg-primary selection:text-primary-foreground">
      <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="flex h-16 items-center justify-between px-6">
          <div className="flex items-center gap-4">
            <div className="brand-mark">AR</div>
            <div>
              <h1 className="font-display text-xl font-bold tracking-tight">{t.appName}</h1>
              <div className="flex items-center gap-2 font-mono text-[10px] text-muted-foreground uppercase">
                <span>{t.envAbbr}:{profiles.length}</span>
                <span className="opacity-20">|</span>
                <span>{t.pluginAbbr}:{plugins.length}</span>
                <span className="opacity-20">|</span>
                <span>{t.runningAbbr}:{runningIds.size}</span>
                <span className="opacity-20">|</span>
                <span className="text-primary">{activeKernelLabel(runtimeInfo)}</span>
                <span className="opacity-20">|</span>
                <span>HOST:{hostLabel(runtimeInfo)}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="gap-2"
              aria-label={t.languageLabel}
              onClick={() => setLocale((current) => current === 'en' ? 'zh' : 'en')}
            >
              <Languages className="h-4 w-4" />
              {t.languageSwitch}
            </Button>
            <Button size="sm" className="gap-2" onClick={() => setShowCreateForm(true)}>
              <Plus className="h-4 w-4" />
              {t.addNew}
            </Button>
            <Button variant="outline" size="sm" className="gap-2" disabled={isImporting} onClick={() => void importPlugin()}>
              <Upload className="h-4 w-4" />
              {isImporting ? t.importing : t.import}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setShowSettings((s) => !s)}>
              <Settings2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="p-6 space-y-6 max-w-[1600px] mx-auto">
        <Alert variant={runtimeInfo?.fingerprintSpoofingEnabled ? "warning" : "success"} className="border-none bg-muted/50">
          {runtimeInfo?.fingerprintSpoofingEnabled ? <AlertTriangle className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
          <AlertTitle className="text-[11px] tracking-[0.1em] uppercase">
            {runtimeInfo?.fingerprintSpoofingEnabled
              ? interpolate(t.riskTitle, { mode: runtimeInfo.fingerprintMode.toUpperCase() })
              : t.secureTitle}
          </AlertTitle>
          <AlertDescription>
            {runtimeInfo?.fingerprintSpoofingEnabled
              ? interpolate(t.riskDescription, { kernel: activeKernelLabel(runtimeInfo), host: hostLabel(runtimeInfo) })
              : t.secureDescription}
          </AlertDescription>
        </Alert>

        {showSettings && runtimeInfo && (
          <Card className="border border-border bg-secondary p-5">
            <div className="mb-4 flex items-center justify-between gap-4">
              <h2 className="font-display text-sm font-bold uppercase tracking-wider">{t.kernels}</h2>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setShowSettings(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {(['chromium', 'itbrowser'] as KernelType[]).map((kernel) => {
                const status = runtimeInfo.kernels[kernel]
                const unsupported = kernel === 'itbrowser' && !runtimeInfo.itbrowserSupported
                return (
                  <div key={kernel} className="border border-border bg-background p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-display text-xs uppercase tracking-wider">{kernel}</div>
                        <div className={`text-[11px] font-mono ${status.installed ? 'text-primary' : 'text-muted-foreground'}`}>
                          {status.installed ? t.installed : t.notInstalled}
                          {status.version ? ` · ${status.version}` : ''}
                          {status.sizeMB ? ` · ${status.sizeMB} MB` : ''}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-2"
                        disabled={unsupported}
                        onClick={() => setSetupKernel(kernel)}
                      >
                        <Download className="h-3 w-3" />
                        {kernel === 'itbrowser' ? t.installItbrowser : t.installChromium}
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          </Card>
        )}

        {notice && (
          <Alert className="border-none bg-muted/50">
            <AlertTitle className="text-[11px] tracking-[0.1em] uppercase">{t.status}</AlertTitle>
            <AlertDescription>{notice}</AlertDescription>
          </Alert>
        )}

        {showCreateForm && (
          <Card className="border border-border bg-secondary p-5">
            <div className="mb-4 flex items-center justify-between gap-4">
              <div>
                <h2 className="font-display text-sm font-bold uppercase tracking-wider">{t.newEnvironment}</h2>
                <p className="text-xs text-muted-foreground">{t.secureTitle}</p>
              </div>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setShowCreateForm(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <label className="space-y-2">
                <span className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{t.name}</span>
                <Input
                  value={createForm.name}
                  onChange={(event) => setCreateForm((form) => ({ ...form, name: event.target.value }))}
                  placeholder={t.namePlaceholder}
                />
              </label>
              <label className="space-y-2">
                <span className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{t.platform}</span>
                <select
                  value={createForm.platform}
                  onChange={(event) => setCreateForm((form) => ({ ...form, platform: event.target.value }))}
                  className="flex h-9 w-full border border-border bg-input px-3 py-1 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
                >
                  {platformOptions.map((platform) => (
                    <option key={platform} value={platform}>{platformLabel(platform, locale)}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-2">
                <span className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{t.targetOs}</span>
                <select
                  value={createForm.targetOs}
                  onChange={(event) => setCreateForm((form) => ({ ...form, targetOs: event.target.value as TargetOsChoice }))}
                  className="flex h-9 w-full border border-border bg-input px-3 py-1 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
                >
                  {targetOsOptions.map((option) => (
                    <option key={option} value={option}>{targetOsLabel(option, locale)}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-2">
                <span className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{t.startUrl}</span>
                <Input
                  value={createForm.startUrl}
                  onChange={(event) => setCreateForm((form) => ({ ...form, startUrl: event.target.value }))}
                  placeholder={t.startUrlPlaceholder}
                />
              </label>
              <label className="space-y-2">
                <span className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{t.proxyHost}</span>
                <Input
                  value={createForm.proxyHost}
                  onChange={(event) => setCreateForm((form) => ({ ...form, proxyHost: event.target.value }))}
                  placeholder="127.0.0.1"
                />
              </label>
              <label className="space-y-2">
                <span className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{t.proxyPort}</span>
                <Input
                  value={createForm.proxyPort}
                  inputMode="numeric"
                  onChange={(event) => setCreateForm((form) => ({ ...form, proxyPort: event.target.value }))}
                  placeholder="7890"
                />
              </label>
              <label className="space-y-2 md:col-span-2">
                <span className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{t.notes}</span>
                <Input
                  value={createForm.notes}
                  onChange={(event) => setCreateForm((form) => ({ ...form, notes: event.target.value }))}
                  placeholder={t.notesPlaceholder}
                />
              </label>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <Button variant="ghost" size="sm" disabled={isCreating} onClick={() => setShowCreateForm(false)}>
                {t.cancel}
              </Button>
              <Button size="sm" disabled={isCreating} onClick={() => void createProfile()}>
                {isCreating ? t.creating : t.create}
              </Button>
            </div>
          </Card>
        )}

        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t.searchPlaceholder}
              className="pl-10 h-10 border-none bg-muted/50 focus-visible:ring-1"
            />
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => void load()}>
              <RotateCcw className="h-4 w-4 mr-2" />
              {t.refresh}
            </Button>
          </div>
        </div>

        <Card className="border-none bg-transparent">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t.environment}</TableHead>
                <TableHead className="w-[120px]">{t.platform}</TableHead>
                <TableHead className="w-[180px]">{t.proxy}</TableHead>
                <TableHead className="w-[260px]">{t.fingerprint}</TableHead>
                <TableHead className="w-[100px]">{t.status}</TableHead>
                <TableHead className="text-right">{t.actions}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((profile) => {
                const isRunning = runningIds.has(profile.id)
                const isBusy = busyId === profile.id
                const target = profile.fingerprint.targetOs as TargetOs

                return (
                  <TableRow key={profile.id} className="group">
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-bold text-sm tracking-tight">{profile.name}</span>
                        <span className="text-[11px] text-muted-foreground font-mono truncate max-w-[200px]">
                          {profile.notes || profile.startUrl}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center px-2 py-0.5 bg-muted text-[10px] font-bold font-mono tracking-wider">
                        {platformLabel(profile.platform, locale)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <code className="text-[11px] text-accent font-mono">
                        {profile.proxy.host}:{profile.proxy.port}
                      </code>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col text-[11px] font-mono text-muted-foreground gap-1">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center px-1.5 py-0.5 bg-primary/15 text-primary text-[10px] font-bold tracking-wider">
                            {targetOsLabel(target, locale)}
                          </span>
                          <span>{profile.fingerprint.language?.toUpperCase()} / {profile.fingerprint.timezone?.split('/').pop()}</span>
                        </div>
                        <span className="text-[9px] opacity-50 truncate max-w-[240px]">{profile.fingerprint.userAgent}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className={`h-1.5 w-1.5 rounded-full ${isRunning ? 'bg-primary animate-pulse shadow-[0_0_8px_var(--color-primary)]' : 'bg-muted'}`} />
                        <span className={`text-[10px] font-bold font-mono tracking-widest ${isRunning ? 'text-primary' : 'text-muted-foreground'}`}>
                          {isRunning ? t.online : t.offline}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        {isRunning ? (
                          <Button
                            variant="destructive"
                            size="sm"
                            className="h-8 px-3"
                            disabled={isBusy}
                            onClick={() => stop(profile)}
                          >
                            <Square className="h-3 w-3 mr-2 fill-current" />
                            {t.stop}
                          </Button>
                        ) : (
                          <Button
                            variant="default"
                            size="sm"
                            className="h-8 px-3"
                            disabled={isBusy}
                            onClick={() => launch(profile)}
                          >
                            <Play className="h-3 w-3 mr-2 fill-current" />
                            {t.run}
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center text-muted-foreground font-mono">
                    {t.empty}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Card>
      </main>

      <KernelSetup
        open={setupKernel !== undefined}
        kernel={setupKernel || 'chromium'}
        status={setupKernel && runtimeInfo ? runtimeInfo.kernels[setupKernel] : undefined}
        locale={locale}
        hostSupportsItbrowser={runtimeInfo?.itbrowserSupported || false}
        onClose={() => setSetupKernel(undefined)}
        onInstalled={() => void load()}
      />
    </div>
  )
}
