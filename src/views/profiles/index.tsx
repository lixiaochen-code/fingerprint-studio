import { useMemo } from 'react'
import {
  Copy,
  Eye,
  MoreVertical,
  Play,
  Plus,
  RotateCcw,
  Search,
  Settings2,
  Square,
  Trash2,
  X
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { DropdownMenu } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { interpolate } from '@/lib/i18n'
import { formatDate, targetOsLabel } from '@/lib/format'
import type { Locale } from '@/lib/locale'
import type { Translations } from '@/lib/translations'
import type {
  BrowserProfile,
  Proxy,
  RuntimeInfo,
  Script,
  ScriptRun,
  TargetOs
} from '../../../electron/types'
import { FingerprintBadge } from './components/fingerprint-badge'

/**
 * Environments 路由组件。
 *
 * 这里**不持有**任何业务状态(profiles / runningIds / selectedIds 等),全部从 props 接受。
 * 真源在 App.tsx,App 用 KeepAlive 包这个组件让切走/切回保留滚动 + 选区。
 *
 * 业务行为(新建 / 删除 / 启动浏览器)通过回调上抛给 App 处理,这样跨 view 的副作用
 * (比如启动后顶部 RUN 计数变化)不需要本地维护。
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
  // 把活跃 run 按 profileId 索引,用于在 Status 列显示 SCRIPTING 徽章。
  // 闭环规则:profile 同一时刻最多 1 个活跃 run,因此 Map 直接 set 不需要合并。
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
          选区 + 操作工具条。无选中时左侧灰色 "0 selected",右侧只显示 "+ 新建环境";
          有选中时左侧高亮、操作按钮(详情/删除/清除)激活。整条始终在位,避免抖动。
        */}
        <div
          className={`flex items-center justify-between border px-4 py-2 transition-colors ${selectedIds.size > 0 ? 'border-primary/40 bg-primary/10' : 'border-border bg-muted/30'}`}
        >
          <div className="flex items-center gap-3 text-xs">
            <Checkbox
              checked={selectedIds.size > 0}
              onChange={onClearSelection}
              disabled={selectedIds.size === 0}
            />
            <span
              className={`font-display font-bold uppercase tracking-wider ${selectedIds.size > 0 ? 'text-foreground' : 'text-muted-foreground'}`}
            >
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
            {/* "+ 新建环境" 是 Environments 页的功能按钮(不是全局导航),放在工具条右侧 */}
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
                  <th className="h-10 px-4 text-left align-middle font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                    {t.environment}
                  </th>
                  <th className="h-10 px-4 text-left align-middle font-mono text-[11px] uppercase tracking-wider text-muted-foreground w-[180px]">
                    {t.proxy}
                  </th>
                  <th className="h-10 px-4 text-left align-middle font-mono text-[11px] uppercase tracking-wider text-muted-foreground w-[260px]">
                    {t.fingerprint}
                  </th>
                  <th className="h-10 px-4 text-left align-middle font-mono text-[11px] uppercase tracking-wider text-muted-foreground w-[140px]">
                    {t.createdAt}
                  </th>
                  <th className="h-10 px-4 text-left align-middle font-mono text-[11px] uppercase tracking-wider text-muted-foreground w-[100px]">
                    {t.status}
                  </th>
                  <th className="h-10 px-4 text-right align-middle font-mono text-[11px] uppercase tracking-wider text-muted-foreground w-[160px]">
                    {t.actions}
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((profile) => {
                  const isRunning = runningIds.has(profile.id)
                  const isBusy = busyId === profile.id
                  const target = profile.fingerprint.targetOs as TargetOs
                  const checked = selectedIds.has(profile.id)
                  const occupyingRun = scriptingByProfileId.get(profile.id)
                  const occupyingScriptName = occupyingRun
                    ? scriptNameById.get(occupyingRun.scriptId)
                    : undefined
                  // 代理显示从 ProxyStore 真源派生:proxyId=null → 显示"无代理";有 id 但
                  // ProxyStore 找不到(代理被删了 profile 没更)→ 也显示"无代理",避免误导。
                  const proxy = profile.proxyId
                    ? proxies.find((entry) => entry.id === profile.proxyId)
                    : undefined
                  return (
                    <tr
                      key={profile.id}
                      className="group border-b border-border transition-colors hover:bg-muted/30"
                    >
                      <td className="p-4 align-middle">
                        <Checkbox
                          checked={checked}
                          onChange={(value) => onToggleSelect(profile.id, value)}
                        />
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
                            <span>
                              {profile.fingerprint.language?.toUpperCase()} /{' '}
                              {profile.fingerprint.timezone?.split('/').pop()}
                            </span>
                          </div>
                          <span className="text-[9px] opacity-50 truncate max-w-[240px]">
                            {profile.fingerprint.userAgent}
                          </span>
                        </div>
                      </td>
                      <td className="p-4 align-middle">
                        <div className="flex flex-col text-[11px] font-mono text-muted-foreground">
                          <span>{formatDate(profile.createdAt).date}</span>
                          <span className="text-[10px] opacity-60">
                            {formatDate(profile.createdAt).time}
                          </span>
                        </div>
                      </td>
                      <td className="p-4 align-middle">
                        {/* 状态优先级:被脚本占用 > 浏览器在跑 > 离线。
                            被占用时点击徽章会跳到对应脚本面板;其它时候保持原显示 */}
                        {occupyingRun ? (
                          <button
                            type="button"
                            onClick={() => onOpenScript(occupyingRun.scriptId)}
                            className="inline-flex items-center gap-2 border border-amber-400/40 bg-amber-400/10 px-1.5 py-0.5 text-[10px] font-bold font-mono tracking-widest text-amber-400 hover:bg-amber-400/20"
                            title={
                              occupyingScriptName
                                ? `Running script: ${occupyingScriptName}`
                                : 'Running script'
                            }
                          >
                            <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
                            <span>SCRIPTING</span>
                          </button>
                        ) : (
                          <div className="flex items-center gap-2">
                            <div
                              className={`h-1.5 w-1.5 rounded-full ${isRunning ? 'bg-primary animate-pulse shadow-[0_0_8px_var(--color-primary)]' : 'bg-muted'}`}
                            />
                            <span
                              className={`text-[10px] font-bold font-mono tracking-widest ${isRunning ? 'text-primary' : 'text-muted-foreground'}`}
                            >
                              {isRunning ? t.online : t.offline}
                            </span>
                          </div>
                        )}
                      </td>
                      <td className="p-4 align-middle text-right">
                        <div className="flex items-center justify-end gap-2">
                          {isRunning ? (
                            <Button
                              variant="destructive"
                              size="sm"
                              className="h-8 px-3"
                              disabled={isBusy}
                              onClick={() => onStop(profile)}
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
                              onClick={() => onLaunch(profile)}
                            >
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
                              {
                                label: t.details,
                                icon: <Eye className="h-3 w-3" />,
                                onClick: () => onShowDetails([profile.id])
                              },
                              {
                                label: t.edit,
                                icon: <Settings2 className="h-3 w-3" />,
                                onClick: () => onEdit(profile)
                              },
                              {
                                label: t.duplicate,
                                icon: <Copy className="h-3 w-3" />,
                                onClick: () => onDuplicate(profile)
                              },
                              {
                                label: t.delete,
                                icon: <Trash2 className="h-3 w-3" />,
                                variant: 'destructive',
                                onClick: () => onAskDelete([profile.id])
                              }
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

export default ProfilesView
