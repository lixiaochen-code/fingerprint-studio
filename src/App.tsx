import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Toaster, toast } from 'sonner'
import { AppHeader, type AppView } from '@/components/app-header'
import { ConfirmDeleteDialog } from '@/components/confirm-delete-dialog'
import { KeepAlive } from '@/components/keep-alive'
import { KernelSetup } from '@/components/kernel-setup'
import { ProfileDetailsDialog } from '@/components/profile-details-dialog'
import { ProfileFormDialog } from '@/components/profile-form-dialog'
import { interpolate } from '@/lib/i18n'
import type { Locale, ThemePref } from '@/lib/locale'
import { translations } from '@/lib/translations'
import { ProfilesView } from '@/views/profiles'
import { ProxiesView } from '@/views/proxies'
import { ScriptsView } from '@/views/scripts'
import { SettingsView } from '@/views/settings'
import type {
  BrowserPlugin,
  BrowserProfile,
  KernelType,
  ProfileDraft,
  Proxy,
  ProxyDraft,
  RuntimeInfo,
  Script,
  ScriptDraft,
  ScriptRun
} from '../electron/types'
import './styles.css'

/** 路由路径白名单。任何不在这里的 hash 都会被规整到 DEFAULT_VIEW。 */
const ALL_VIEWS: readonly AppView[] = ['profiles', 'scripts', 'proxies', 'settings'] as const
const DEFAULT_VIEW: AppView = 'profiles'

/**
 * 把 react-router 的 pathname 解码成 AppView。未识别路径回退默认页 ——
 * 用户在地址栏手输错路径或 hash 损坏时不至于白屏。
 */
function viewFromPath(pathname: string): AppView {
  const segment = pathname.replace(/^\/+/, '').split('/')[0]
  return (ALL_VIEWS as readonly string[]).includes(segment) ? (segment as AppView) : DEFAULT_VIEW
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

type FormDialogState =
  | { open: false }
  | { open: true; mode: 'create'; profile?: undefined }
  | { open: true; mode: 'edit'; profile: BrowserProfile }

/**
 * 应用根组件 —— 顶层数据编排 + 路由分发。
 *
 * 设计:
 * - 业务状态(profiles/plugins/proxies/scripts/activeRuns)集中在这里 useState 持有;
 *   不抽 hook 是为了让每个 setState 与 IPC 通讯都在同一文件可见,排错只需读 App.tsx
 * - 子视图(ProfilesView/ScriptsView/...)纯展示 + 回调,不直接调 IPC
 * - 路由真源:react-router 的 location;view 是派生 memo,setView 走 navigate
 */
export function App() {
  const [profiles, setProfiles] = useState<BrowserProfile[]>([])
  const [plugins, setPlugins] = useState<BrowserPlugin[]>([])
  const [proxies, setProxies] = useState<Proxy[]>([])
  const [runningIds, setRunningIds] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState('')
  const [busyId, setBusyId] = useState<string>()
  const [runtimeInfo, setRuntimeInfo] = useState<RuntimeInfo>()
  const [locale, setLocale] = useState<Locale>(initialLocale)

  const location = useLocation()
  const navigate = useNavigate()
  const view = useMemo(() => viewFromPath(location.pathname), [location.pathname])
  const setView = useMemo(
    () => (next: AppView) => {
      if (next === view) return
      navigate(`/${next}`)
    },
    [navigate, view]
  )

  const [formDialog, setFormDialog] = useState<FormDialogState>({ open: false })
  const [detailsIds, setDetailsIds] = useState<string[]>([])
  const [deleteIds, setDeleteIds] = useState<string[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [setupKernel, setSetupKernel] = useState<KernelType>()
  const [themePref, setThemePref] = useState<ThemePref>(initialTheme)
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>(() =>
    resolveTheme(initialTheme())
  )
  const [scripts, setScripts] = useState<Script[]>([])
  const [selectedScriptId, setSelectedScriptId] = useState<string>()
  // 全局活跃 run 集合(主进程在 start / handleExit 时广播 'active-changed';启动时主动拉一次兜底)。
  // Header 抽屉 / Environments 列表 SCRIPTING 徽章 / Scripts 面板 chip 灰显都从这里派生。
  // 这里**不**保存日志 —— 日志由 ScriptRunPanel 自己分脚本维护。
  const [activeRuns, setActiveRuns] = useState<ScriptRun[]>([])
  const t = translations[locale]

  // 应用启动时如果 hash 路径不是合法的 view(常见于"#/"或空 hash),把它规整到默认页。
  // 之后用户的导航全部通过 navigate(),URL 与 view 保持双向同步。
  useEffect(() => {
    if (location.pathname === '' || location.pathname === '/') {
      navigate(`/${DEFAULT_VIEW}`, { replace: true })
    }
    // 仅启动时跑一次:依赖故意只放空数组,后续 location 变化由 view 派生 memo 处理。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
    const [nextProfiles, nextPlugins, statuses, nextRuntimeInfo, nextScripts, nextProxies] =
      await Promise.all([
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
    setRunningIds(
      new Set(
        statuses
          .filter((status) => status.running)
          .map((status) => status.profileId)
      )
    )
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

  // 主进程在浏览器异常退出时广播 'profiles:crashed';前台 toast 给用户看,
  // 不至于盯着没动静的 UI 一脸懵。
  useEffect(() => {
    const unsubscribe = window.registry.profiles.onCrashed((event) => {
      const profile = profiles.find((item) => item.id === event.profileId)
      const name = profile?.name || event.profileId
      const code = event.exitCode ?? 'n/a'
      const signal = event.signal ? ` · ${event.signal}` : ''
      toast.error(interpolate(t.browserCrashedTitle, { name }), {
        description: (
          <div className="space-y-1">
            <p className="text-[11px]">
              {interpolate(t.browserCrashedDetails, { code: String(code), signal })}
            </p>
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

  // 订阅活跃 run 集合;启动时拉一次兜底(错过初始事件不会有空状态错觉)。
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

  // 内核未装时第一次拿到 runtimeInfo 自动弹 KernelSetup;之后用户主动关掉也不再骚扰。
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
      const proxySearchable = proxy ? `${proxy.name} ${proxy.host}:${proxy.port}` : ''
      return [profile.name, profile.notes, proxySearchable, profile.startUrl ?? '']
        .join(' ')
        .toLowerCase()
        .includes(needle)
    })
  }, [profiles, proxies, query])

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((profile) => selectedIds.has(profile.id))
  const someFilteredSelected =
    !allFilteredSelected && filtered.some((profile) => selectedIds.has(profile.id))

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
          toast.error(
            interpolate(t.actionFailed, {
              action: t.run,
              message: result.error?.message || 'unknown'
            })
          )
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
      toast.success(
        interpolate(locale === 'zh' ? '脚本已保存:{{name}}' : 'Script saved: {{name}}', {
          name: created.name
        })
      )
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
      <AppHeader
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
        四视图保活路由:每个 view 渲染一次后就保留在 React 树里,切走只是 display:none,
        所有内部状态 / Monaco 实例 / 滚动位置 / 订阅都保留。
        Environments 默认就 mount(用户进来第一眼就需要);Scripts/Settings 走 lazy,
        第一次切到才挂载,避免 Monaco chunk 在用户没看脚本前就被请求。
      */}
      <KeepAlive visible={view === 'profiles'} lazy={false}>
        <ProfilesView
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
          onToast={(message, kind) =>
            kind === 'error' ? toast.error(message) : toast.success(message)
          }
        />
      </KeepAlive>

      <KeepAlive visible={view === 'settings'}>
        <div className="flex-1 overflow-auto">
          <SettingsView
            runtimeInfo={runtimeInfo}
            plugins={plugins}
            locale={locale}
            onInstallKernel={(kernel) => setSetupKernel(kernel)}
            onImportPlugin={() =>
              importPluginFromForm()
                .then(() => undefined)
                .catch(() => undefined)
            }
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
        names={profiles
          .filter((profile) => deleteIds.includes(profile.id))
          .map((profile) => profile.name)}
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

export default App
