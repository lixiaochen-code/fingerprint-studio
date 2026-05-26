import type { Locale } from '@/lib/locale'
import type { Translations } from '@/lib/translations'
import type {
  BrowserProfile,
  Proxy,
  RuntimeInfo,
  Script,
  ScriptRun
} from '../../../electron/types'
import { ProfilesTable } from './components/profiles-table'
import { ProfilesToolbar } from './components/profiles-toolbar'
import { SelectionBar } from './components/selection-bar'

/**
 * Environments 路由组件。
 *
 * 这里**不持有**任何业务状态(profiles / runningIds / selectedIds 等),全部从 props 接受。
 * 真源在 App.tsx,App 用 KeepAlive 包这个组件让切走/切回保留滚动 + 选区。
 *
 * 业务行为(新建 / 删除 / 启动浏览器)通过回调上抛给 App 处理,这样跨 view 的副作用
 * (比如启动后顶部 RUN 计数变化)不需要本地维护。
 *
 * 视图本身只做"工具栏 + 选区栏 + 表格"三段式编排,具体渲染交给三个子组件。
 */
export interface ProfilesViewProps {
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
}

export function ProfilesView({
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
}: ProfilesViewProps) {
  return (
    <main className="flex flex-1 flex-col overflow-hidden">
      <div className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col overflow-hidden p-6 gap-4">
        <ProfilesToolbar
          t={t}
          locale={locale}
          runtimeInfo={runtimeInfo}
          query={query}
          onQueryChange={onQueryChange}
          onReload={onReload}
        />
        <SelectionBar
          t={t}
          selectedIds={selectedIds}
          onShowDetails={onShowDetails}
          onAskDelete={onAskDelete}
          onClearSelection={onClearSelection}
          onAdd={onAdd}
        />
        <ProfilesTable
          t={t}
          locale={locale}
          filtered={filtered}
          proxies={proxies}
          runningIds={runningIds}
          busyId={busyId}
          selectedIds={selectedIds}
          onToggleSelect={onToggleSelect}
          onToggleAll={onToggleAll}
          allFilteredSelected={allFilteredSelected}
          someFilteredSelected={someFilteredSelected}
          onShowDetails={onShowDetails}
          onAskDelete={onAskDelete}
          onEdit={onEdit}
          onDuplicate={onDuplicate}
          onLaunch={onLaunch}
          onStop={onStop}
          activeRuns={activeRuns}
          scripts={scripts}
          onOpenScript={onOpenScript}
        />
      </div>
    </main>
  )
}

export default ProfilesView
