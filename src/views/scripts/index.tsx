import { useMemo, useState } from 'react'
import type {
  BrowserProfile,
  Proxy,
  Script,
  ScriptDraft,
  ScriptRun,
  ScriptSource
} from '../../../electron/types'
import { CreateScriptDialog } from './components/create-script-dialog'
import { DeleteScriptDialog } from './components/delete-script-dialog'
import { ScriptDetailPane } from './components/script-detail-pane'
import { ScriptList } from './components/script-list'
import { labels, type Locale, type Theme } from './translations'

export interface ScriptsViewProps {
  locale: Locale
  theme: Theme
  scripts: Script[]
  profiles: BrowserProfile[]
  /** 透传给 ScriptRunPanel,用于 profile chip tooltip 里展示真实代理 host:port */
  proxies: Proxy[]
  runningProfileIds: Set<string>
  /** 全局活跃 run 列表,用于 chip 灰显被其它脚本占用的 profile */
  activeRuns?: ScriptRun[]
  selectedScriptId?: string
  onSelect: (scriptId: string | undefined) => void
  onCreate: (draft: ScriptDraft) => Promise<Script>
  onRemove: (scriptId: string) => Promise<void>
  /** 空态下点击"去新建环境"的回调;交给 App 切到 environments tab */
  onGoToEnvironments?: () => void
}

/**
 * Scripts 路由组件:左侧脚本列表 + 右侧详情(编辑器 + 运行面板)。
 *
 * 这里只编排布局,具体子区域(列表 / 详情 / 弹窗)各自负责自己的视图与交互。
 * 业务行为(创建/删除脚本)通过 props 上抛给 App,本组件不直接调 IPC。
 */
export function ScriptsView(props: ScriptsViewProps) {
  const {
    locale,
    theme,
    scripts,
    profiles,
    proxies,
    runningProfileIds,
    activeRuns,
    selectedScriptId,
    onSelect,
    onCreate,
    onRemove,
    onGoToEnvironments
  } = props
  const t = labels[locale]

  const [createOpen, setCreateOpen] = useState<ScriptSource | undefined>()
  const [pendingDelete, setPendingDelete] = useState<Script | undefined>()

  const selected = useMemo(
    () => scripts.find((script) => script.id === selectedScriptId),
    [scripts, selectedScriptId]
  )

  return (
    <div className="flex h-full">
      <ScriptList
        scripts={scripts}
        selectedScriptId={selectedScriptId}
        onSelect={onSelect}
        onRequestCreate={(source) => setCreateOpen(source)}
        t={t}
      />

      <section className="flex-1 overflow-hidden">
        {selected ? (
          <ScriptDetailPane
            script={selected}
            scripts={scripts}
            t={t}
            locale={locale}
            theme={theme}
            profiles={profiles}
            proxies={proxies}
            runningProfileIds={runningProfileIds}
            activeRuns={activeRuns}
            onDelete={() => setPendingDelete(selected)}
            onGoToEnvironments={onGoToEnvironments}
          />
        ) : (
          <EmptyState message={t.emptyDetail} />
        )}
      </section>

      <CreateScriptDialog
        open={createOpen !== undefined}
        source={createOpen ?? 'local'}
        t={t}
        onCancel={() => setCreateOpen(undefined)}
        onSubmit={async (draft) => {
          const created = await onCreate(draft)
          setCreateOpen(undefined)
          onSelect(created.id)
        }}
      />

      <DeleteScriptDialog
        target={pendingDelete}
        t={t}
        onCancel={() => setPendingDelete(undefined)}
        onConfirm={async () => {
          if (!pendingDelete) return
          await onRemove(pendingDelete.id)
          setPendingDelete(undefined)
          if (selectedScriptId === pendingDelete.id) onSelect(undefined)
        }}
      />
    </div>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-full items-center justify-center">
      <p className="max-w-sm text-center text-xs text-muted-foreground">{message}</p>
    </div>
  )
}

export default ScriptsView
