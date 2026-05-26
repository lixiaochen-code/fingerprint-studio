import { Suspense, lazy, useCallback } from 'react'
import { FolderOpen, Loader2, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SplitPane } from '@/components/ui/split-pane'
import type {
  BrowserProfile,
  Proxy,
  Script,
  ScriptRun
} from '../../../../../electron/types'
import { ScriptRunPanel } from '../script-run-panel'
import { SourceBadge } from '../source-badge'
import type { Locale, Theme, Translations } from '../../translations'

/**
 * Monaco 是 4MB 级 bundle,只有进入 Scripts 视图后才需要。
 * 配合 vite.config.ts 里的 manualChunks 把它拆成独立 'monaco' chunk。
 */
const ScriptEditor = lazy(() =>
  import('../script-editor').then((m) => ({ default: m.ScriptEditor }))
)

export interface ScriptDetailPaneProps {
  script: Script
  scripts: Script[]
  t: Translations
  locale: Locale
  theme: Theme
  profiles: BrowserProfile[]
  proxies: Proxy[]
  runningProfileIds: Set<string>
  activeRuns?: ScriptRun[]
  onDelete: () => void
  onGoToEnvironments?: () => void
}

/**
 * 详情面板:顶部元信息条 + Monaco 编辑器(local 可写,external 只读)+ 下方运行面板。
 * 编辑器和运行面板之间用 SplitPane 上下分屏,比例存 localStorage 跨会话保留。
 */
export function ScriptDetailPane({
  script,
  scripts,
  t,
  locale,
  theme,
  profiles,
  proxies,
  runningProfileIds,
  activeRuns,
  onDelete,
  onGoToEnvironments
}: ScriptDetailPaneProps) {
  const revealInFinder = useCallback(() => {
    void window.registry.scripts.revealInFinder(script.entryPath)
  }, [script.entryPath])

  return (
    <div className="flex h-full w-full flex-col">
      <header className="flex items-start justify-between border-b border-border bg-secondary/40 px-5 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-display text-sm font-bold uppercase tracking-wider">
              {script.name}
            </h3>
            <SourceBadge source={script.source} t={t} />
          </div>
          {script.description && (
            <p className="mt-0.5 text-[11px] text-muted-foreground">{script.description}</p>
          )}
          <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground opacity-70">
            {script.entryPath}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="gap-2" onClick={revealInFinder}>
            <FolderOpen className="h-3 w-3" />
            {t.revealInFinder}
          </Button>
          <Button size="sm" variant="destructive" className="gap-2" onClick={onDelete}>
            <Trash2 className="h-3 w-3" />
            {t.delete}
          </Button>
        </div>
      </header>
      <SplitPane
        direction="vertical"
        defaultRatio={0.6}
        minRatio={0.25}
        maxRatio={0.85}
        storageKey="auto-registry.scripts.editor-run-ratio"
        className="flex-1"
        first={
          <Suspense
            fallback={
              <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                Loading editor...
              </div>
            }
          >
            <ScriptEditor script={script} locale={locale} theme={theme} />
          </Suspense>
        }
        second={
          <ScriptRunPanel
            script={script}
            scripts={scripts}
            profiles={profiles}
            proxies={proxies}
            runningProfileIds={runningProfileIds}
            activeRuns={activeRuns}
            locale={locale}
            onGoToEnvironments={onGoToEnvironments}
          />
        }
      />
    </div>
  )
}

export default ScriptDetailPane
