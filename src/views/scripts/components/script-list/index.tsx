import { FileCode2, FolderOpen, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip } from '@/components/ui/tooltip'
import type { Script, ScriptSource } from '../../../../../electron/types'
import type { Translations } from '../../translations'
import { ScriptIdCell } from '../script-id-cell'
import { SourceBadge } from '../source-badge'

export interface ScriptListProps {
  scripts: Script[]
  selectedScriptId?: string
  onSelect: (scriptId: string) => void
  onRequestCreate: (source: ScriptSource) => void
  t: Translations
}

/**
 * Scripts 视图左侧栏:title + 新建按钮 + 脚本列表。
 *
 * 列表项展示:名字、描述(若有)、entryPath。点击项触发 onSelect;
 * onRequestCreate 弹出新建对话框(由父组件处理)。
 */
export function ScriptList({
  scripts,
  selectedScriptId,
  onSelect,
  onRequestCreate,
  t
}: ScriptListProps) {
  return (
    <aside className="flex w-[280px] flex-none flex-col border-r border-border bg-secondary">
      <header className="flex items-center justify-between border-b border-border p-3">
        <h2 className="font-display text-xs font-bold uppercase tracking-[0.15em] text-muted-foreground">
          {t.title} · {scripts.length}
        </h2>
        <div className="flex items-center gap-1">
          <Tooltip content={t.newLocal} side="bottom">
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2"
              onClick={() => onRequestCreate('local')}
            >
              <Plus className="h-3.5 w-3.5" />
              <FileCode2 className="ml-1 h-3.5 w-3.5" />
            </Button>
          </Tooltip>
          <Tooltip content={t.newExternal} side="bottom">
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2"
              onClick={() => onRequestCreate('external')}
            >
              <Plus className="h-3.5 w-3.5" />
              <FolderOpen className="ml-1 h-3.5 w-3.5" />
            </Button>
          </Tooltip>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-2">
        {scripts.length === 0 ? (
          <div className="px-2 py-6 text-center">
            <p className="font-mono text-[11px] text-muted-foreground">{t.emptyList}</p>
            <p className="mt-1 text-[10px] text-muted-foreground opacity-70">{t.emptyHint}</p>
          </div>
        ) : (
          <ul className="space-y-1">
            {scripts.map((script) => {
              const isActive = script.id === selectedScriptId
              return (
                <li key={script.id}>
                  {/*
                    用 div + role=button 而不是 <button>,因为行内嵌了 ScriptIdCell(它本身是 <button>),
                    button 嵌 button 是非法 HTML;改成 div 后键盘可达性靠 tabIndex + onKeyDown 维持。
                  */}
                  <div
                    role="button"
                    tabIndex={0}
                    className={`flex w-full cursor-pointer flex-col gap-0.5 border px-3 py-2 text-left transition-colors ${
                      isActive
                        ? 'border-primary bg-primary/10'
                        : 'border-transparent hover:border-border hover:bg-muted/30'
                    }`}
                    onClick={() => onSelect(script.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        onSelect(script.id)
                      }
                    }}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <div className="flex min-w-0 items-center gap-1.5">
                        {script.scope === 'global' && (
                          <span className="inline-flex flex-none items-center border border-amber-400/40 bg-amber-400/10 px-1 py-px font-mono text-[8px] font-bold tracking-wider text-amber-400">
                            {t.globalBadge}
                          </span>
                        )}
                        <span
                          className={`truncate text-xs font-bold tracking-tight ${isActive ? 'text-primary' : ''}`}
                        >
                          {script.name}
                        </span>
                      </div>
                      <SourceBadge source={script.source} t={t} />
                    </div>
                    {script.description && (
                      <span className="truncate font-mono text-[10px] text-muted-foreground">
                        {script.description}
                      </span>
                    )}
                    {/*
                      ID 列:与环境列表的 ProfileIdCell 完全一致的 mono + 虚线下划线 + 点击复制。
                      onClick 与 onKeyDown stopPropagation,避免触发外层"选中脚本"的点击。
                    */}
                    <div
                      className="truncate"
                      onClick={(event) => event.stopPropagation()}
                      onKeyDown={(event) => event.stopPropagation()}
                    >
                      <ScriptIdCell
                        id={script.id}
                        copiedToast={t.scriptIdCopiedToast}
                        copyFailedToast={t.scriptIdCopyFailedToast}
                      />
                    </div>
                    <span className="truncate font-mono text-[10px] text-muted-foreground opacity-60">
                      {script.entryPath}
                    </span>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </aside>
  )
}

export default ScriptList
