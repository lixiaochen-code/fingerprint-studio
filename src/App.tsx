import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Toaster, toast } from 'sonner'
import { AppHeader, type AppView } from '@/components/app-header'
import { ConfirmDeleteDialog } from '@/components/confirm-delete-dialog'
import { KeepAlive } from '@/components/keep-alive'
import { KernelSetup } from '@/components/kernel-setup'
import { ProfileDetailsDialog } from '@/components/profile-details-dialog'
import { ProfileFormDialog } from '@/components/profile-form-dialog'
import { useAppData } from '@/hooks/useAppData'
import { useLocale } from '@/hooks/useLocale'
import { useTheme } from '@/hooks/useTheme'
import { interpolate } from '@/lib/i18n'
import { translations } from '@/lib/translations'
import { ProfilesView } from '@/views/profiles'
import { ProxiesView } from '@/views/proxies'
import { ScriptsView } from '@/views/scripts'
import { SettingsView } from '@/views/settings'
import type {
  BrowserProfile,
  KernelType,
  ProfileDraft,
  ProxyDraft,
  ScriptDraft
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

type FormDialogState =
  | { open: false }
  | { open: true; mode: 'create'; profile?: undefined }
  | { open: true; mode: 'edit'; profile: BrowserProfile }

/**
 * 应用根组件 —— 顶层数据编排 + 路由分发。
 *
 * 设计:
 * - 数据加载 / 订阅 / 轮询 抽到 `useAppData`(保持本文件不被副作用噪音淹没)
 * - 主题 / 语言 抽到 `useTheme` / `useLocale`
 * - 业务函数(launch / stop / submitProfile / ...)留在本文件,因为它们都需要在
 *   IPC 完成后调用 `reload()` 同步状态;放进 hook 反而要绕一层
 * - 路由真源:react-router 的 location;view 是派生 memo,setView 走 navigate
 */
export function App() {
  const { themePref, resolvedTheme, setThemePref } = useTheme()
  const { locale, setLocale, toggleLocale } = useLocale()
  const t = translations[locale]

  const {
    profiles,
    plugins,
    proxies,
    scripts,
    runningIds,
    runtimeInfo,
    activeRuns,
    reload
  } = useAppData({
    onBrowserCrashed: (event) => {
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
    }
  })

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

  const [query, setQuery] = useState('')
  const [busyId, setBusyId] = useState<string>()
  const [formDialog, setFormDialog] = useState<FormDialogState>({ open: false })
  const [detailsIds, setDetailsIds] = useState<string[]>([])
  const [deleteIds, setDeleteIds] = useState<string[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [setupKernel, setSetupKernel] = useState<KernelType>()
  const [selectedScriptId, setSelectedScriptId] = useState<string>()

  // 应用启动时如果 hash 路径不是合法的 view(常见于"#/"或空 hash),把它规整到默认页。
  // 之后用户的导航全部通过 navigate(),URL 与 view 保持双向同步。
  useEffect(() => {
    if (location.pathname === '' || location.pathname === '/') {
      navigate(`/${DEFAULT_VIEW}`, { replace: true })
    }
    // 仅启动时跑一次:依赖故意只放空数组,后续 location 变化由 view 派生 memo 处理。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // selectedIds 在 profiles 列表收缩时清掉已不存在的项,避免幽灵选区
  useEffect(() => {
    setSelectedIds((prev) => {
      let changed = false
      const next = new Set<string>()
      for (const id of prev) {
        if (profiles.some((profile) => profile.id === id)) next.add(id)
        else changed = true
      }
      return changed ? next : prev
    })
  }, [profiles])

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
    // 命中即视为该 profile 的代理匹配。proxyId=null 或命不中条目 → 视为无代理,
    // 搜不到。
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
      await reload()
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
      await reload()
    } catch (error) {
      console.error(error)
    } finally {
      setBusyId(undefined)
    }
  }

  async function submitProfile(draft: ProfileDraft) {
    const result = await window.registry.profiles.save(draft)
    if (!result.ok) {
      // ProfileFormDialog 接到 throw 时会 setError 展示在表单底部 —— 把结构化错误
      // 转成本地化文案再 throw,onSubmit 调用方就能拿到友好提示。
      const code = result.error.code
      let message = result.error.message
      if (code === 'PROFILE_ID_TAKEN') {
        message = interpolate(t.profileIdTakenError, {
          id: result.error.existingId ?? draft.id ?? ''
        })
      } else if (code === 'INVALID_PROFILE_ID') {
        message = interpolate(t.profileIdInvalidError, {
          id: result.error.badId ?? draft.id ?? ''
        })
      }
      throw new Error(message)
    }
    setFormDialog({ open: false })
    await reload()
  }

  async function importPluginFromForm() {
    try {
      const plugin = await window.registry.plugins.importZip()
      if (plugin) {
        toast.success(interpolate(t.importSuccess, { name: plugin.name }))
      } else {
        toast(t.importCanceled)
      }
      await reload()
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
      await reload()
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
    await reload()
  }

  async function setActiveVersion(pluginId: string, versionId: string) {
    await window.registry.plugins.setActiveVersion(pluginId, versionId)
    await reload()
  }

  async function deletePlugin(pluginId: string) {
    await window.registry.plugins.remove(pluginId)
    await reload()
  }

  async function createScript(draft: ScriptDraft) {
    try {
      const created = await window.registry.scripts.save(draft)
      toast.success(interpolate(t.scriptSavedToast, { name: created.name }))
      await reload()
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
      toast.success(t.scriptRemovedToast)
      await reload()
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
        onLocaleToggle={toggleLocale}
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
          onReload={() => void reload()}
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
          onReload={reload}
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
          await reload()
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
        onInstalled={() => void reload()}
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
