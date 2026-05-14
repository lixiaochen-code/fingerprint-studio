import { useCallback, useEffect, useMemo, useState, lazy, Suspense } from 'react'
import { FileCode2, FolderOpen, Loader2, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Tooltip } from '@/components/ui/tooltip'
import { interpolate } from '@/lib/i18n'
import { ScriptRunPanel } from './ScriptRunPanel'
import type { BrowserProfile, Script, ScriptDraft, ScriptSource } from '../../electron/types'

// 懒加载：Monaco 是 4MB 级 bundle，只有进入 Scripts 视图后才需要。
// 配合 vite.config.ts 里的 manualChunks 把它拆成独立 'monaco' chunk。
const ScriptEditor = lazy(() => import('./ScriptEditor').then((m) => ({ default: m.ScriptEditor })))

type Locale = 'en' | 'zh'
type Theme = 'light' | 'dark'

type Translations = {
  title: string
  emptyList: string
  emptyHint: string
  newLocal: string
  newExternal: string
  selectAFile: string
  delete: string
  revealInFinder: string
  local: string
  external: string
  emptyDetail: string
  createTitle: string
  createSubmit: string
  cancel: string
  name: string
  namePlaceholder: string
  description: string
  descriptionPlaceholder: string
  entryPath: string
  entryPathPlaceholder: string
  browse: string
  deleteConfirmTitle: string
  deleteConfirmSingle: string
  deleteDetailLocal: string
  deleteDetailExternal: string
  deleteConfirm: string
  errorRequired: string
  errorExternalPath: string
  saved: string
  deleted: string
}

const labels: Record<Locale, Translations> = {
  en: {
    title: 'Scripts',
    emptyList: 'No scripts yet.',
    emptyHint: 'Create a local script inside the app, or register an external file you already maintain.',
    newLocal: 'New local script',
    newExternal: 'Register external script',
    selectAFile: 'Select a file...',
    delete: 'Delete',
    revealInFinder: 'Reveal in Finder',
    local: 'LOCAL',
    external: 'EXTERNAL',
    emptyDetail: 'Select a script on the left or create a new one.',
    createTitle: 'New script',
    createSubmit: 'Create',
    cancel: 'Cancel',
    name: 'Name',
    namePlaceholder: 'My script',
    description: 'Description',
    descriptionPlaceholder: '(optional)',
    entryPath: 'Entry path',
    entryPathPlaceholder: '/absolute/path/to/script.ts',
    browse: 'Browse',
    deleteConfirmTitle: 'Delete script',
    deleteConfirmSingle: 'Delete "{{name}}"? {{detail}}',
    deleteDetailLocal: 'The script directory (including logs and state) will be removed.',
    deleteDetailExternal: 'Only the registration is removed; your local file is untouched.',
    deleteConfirm: 'Delete',
    errorRequired: 'Name is required',
    errorExternalPath: 'External entry path is required',
    saved: 'Script saved: {{name}}',
    deleted: 'Script removed'
  },
  zh: {
    title: '脚本',
    emptyList: '还没有脚本。',
    emptyHint: '在应用内新建一个本地脚本，或注册一个你自己维护的外部文件。',
    newLocal: '新建本地脚本',
    newExternal: '注册外部脚本',
    selectAFile: '选择文件...',
    delete: '删除',
    revealInFinder: '在访达中显示',
    local: '本地',
    external: '外部',
    emptyDetail: '在左侧选择一个脚本，或者新建一个。',
    createTitle: '新建脚本',
    createSubmit: '创建',
    cancel: '取消',
    name: '名称',
    namePlaceholder: '我的脚本',
    description: '描述',
    descriptionPlaceholder: '（可选）',
    entryPath: '入口文件',
    entryPathPlaceholder: '/绝对/路径/到/脚本.ts',
    browse: '浏览…',
    deleteConfirmTitle: '删除脚本',
    deleteConfirmSingle: '确定删除「{{name}}」？{{detail}}',
    deleteDetailLocal: '脚本目录（含日志与 state）会被一并删除。',
    deleteDetailExternal: '仅移除登记；你本地的源文件不会被动。',
    deleteConfirm: '删除',
    errorRequired: '名称必填',
    errorExternalPath: '外部脚本入口路径必填',
    saved: '脚本已保存：{{name}}',
    deleted: '脚本已删除'
  }
}

export type ScriptsViewProps = {
  locale: Locale
  theme: Theme
  scripts: Script[]
  profiles: BrowserProfile[]
  runningProfileIds: Set<string>
  selectedScriptId?: string
  onSelect: (scriptId: string | undefined) => void
  onCreate: (draft: ScriptDraft) => Promise<Script>
  onRemove: (scriptId: string) => Promise<void>
}

export function ScriptsView(props: ScriptsViewProps) {
  const { locale, theme, scripts, profiles, runningProfileIds, selectedScriptId, onSelect, onCreate, onRemove } = props
  const t = labels[locale]

  const [createOpen, setCreateOpen] = useState<ScriptSource | undefined>()
  const [pendingDelete, setPendingDelete] = useState<Script | undefined>()

  const selected = useMemo(() => scripts.find((script) => script.id === selectedScriptId), [scripts, selectedScriptId])

  return (
    <div className="flex h-full">
      <aside className="flex w-[280px] flex-none flex-col border-r border-border bg-secondary">
        <header className="flex items-center justify-between border-b border-border p-3">
          <h2 className="font-display text-xs font-bold uppercase tracking-[0.15em] text-muted-foreground">
            {t.title} · {scripts.length}
          </h2>
          <div className="flex items-center gap-1">
            <Tooltip content={t.newLocal} side="bottom">
              <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setCreateOpen('local')}>
                <Plus className="h-3.5 w-3.5" />
                <FileCode2 className="ml-1 h-3.5 w-3.5" />
              </Button>
            </Tooltip>
            <Tooltip content={t.newExternal} side="bottom">
              <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setCreateOpen('external')}>
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
                    <button
                      type="button"
                      className={`flex w-full flex-col gap-0.5 border px-3 py-2 text-left transition-colors ${isActive ? 'border-primary bg-primary/10' : 'border-transparent hover:border-border hover:bg-muted/30'}`}
                      onClick={() => onSelect(script.id)}
                    >
                      <div className="flex items-center justify-between">
                        <span className={`truncate text-xs font-bold tracking-tight ${isActive ? 'text-primary' : ''}`}>
                          {script.name}
                        </span>
                        <SourceBadge source={script.source} t={t} />
                      </div>
                      {script.description && (
                        <span className="truncate font-mono text-[10px] text-muted-foreground">
                          {script.description}
                        </span>
                      )}
                      <span className="truncate font-mono text-[10px] text-muted-foreground opacity-60">
                        {script.entryPath}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </aside>

      <section className="flex-1 overflow-hidden">
        {selected ? (
          <DetailPane
            script={selected}
            t={t}
            locale={locale}
            theme={theme}
            profiles={profiles}
            runningProfileIds={runningProfileIds}
            onDelete={() => setPendingDelete(selected)}
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

function SourceBadge({ source, t }: { source: ScriptSource; t: Translations }) {
  const label = source === 'local' ? t.local : t.external
  const tone = source === 'local'
    ? 'border-primary/40 bg-primary/10 text-primary'
    : 'border-amber-400/40 bg-amber-400/10 text-amber-400'
  return (
    <span className={`ml-2 inline-flex flex-none items-center border px-1.5 py-0.5 font-mono text-[9px] font-bold tracking-wider ${tone}`}>
      {label}
    </span>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-full items-center justify-center">
      <p className="max-w-sm text-center text-xs text-muted-foreground">{message}</p>
    </div>
  )
}

/**
 * 详情面板：顶部元信息条 + Monaco 编辑器（local 可写，external 只读）+ 下方运行面板。
 * 编辑器和运行面板之间用一个简单 60/40 上下分屏；Step 4 之后再考虑加可拖动分隔条。
 */
function DetailPane({
  script,
  t,
  locale,
  theme,
  profiles,
  runningProfileIds,
  onDelete
}: {
  script: Script
  t: Translations
  locale: Locale
  theme: Theme
  profiles: BrowserProfile[]
  runningProfileIds: Set<string>
  onDelete: () => void
}) {
  const revealInFinder = useCallback(() => {
    void window.registry.scripts.revealInFinder(script.entryPath)
  }, [script.entryPath])

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-start justify-between border-b border-border bg-secondary/40 px-5 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-display text-sm font-bold uppercase tracking-wider">{script.name}</h3>
            <SourceBadge source={script.source} t={t} />
          </div>
          {script.description && <p className="mt-0.5 text-[11px] text-muted-foreground">{script.description}</p>}
          <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground opacity-70">{script.entryPath}</p>
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
      {/* 上 60% 编辑器 / 下 40% 运行面板。flex-basis + min-h-0 防止 Monaco 内部撑爆父容器 */}
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 basis-[60%] overflow-hidden">
          <Suspense fallback={
            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
              <Loader2 className="mr-2 h-3 w-3 animate-spin" />
              Loading editor...
            </div>
          }>
            <ScriptEditor script={script} locale={locale} theme={theme} />
          </Suspense>
        </div>
        <div className="min-h-0 basis-[40%]">
          <ScriptRunPanel
            script={script}
            profiles={profiles}
            runningProfileIds={runningProfileIds}
            locale={locale}
          />
        </div>
      </div>
    </div>
  )
}

type CreateScriptDialogProps = {
  open: boolean
  source: ScriptSource
  t: Translations
  onCancel: () => void
  onSubmit: (draft: ScriptDraft) => Promise<void>
}

function CreateScriptDialog({ open, source, t, onCancel, onSubmit }: CreateScriptDialogProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [entryPath, setEntryPath] = useState('')
  const [error, setError] = useState<string | undefined>()
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    setName('')
    setDescription('')
    setEntryPath('')
    setError(undefined)
    setSubmitting(false)
  }, [open, source])

  const pickFile = useCallback(async () => {
    const picked = await window.registry.scripts.pickExternalFile()
    if (picked) setEntryPath(picked)
  }, [])

  const submit = useCallback(async () => {
    if (!name.trim()) return setError(t.errorRequired)
    if (source === 'external' && !entryPath.trim()) return setError(t.errorExternalPath)
    setSubmitting(true)
    setError(undefined)
    try {
      await onSubmit({
        name: name.trim(),
        description: description.trim() || undefined,
        source,
        entryPath: source === 'external' ? entryPath.trim() : undefined
      })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setSubmitting(false)
    }
  }, [name, description, entryPath, source, onSubmit, t])

  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title={`${t.createTitle} · ${source === 'local' ? t.local : t.external}`}
      size="md"
      footer={
        <>
          <Button size="sm" variant="ghost" onClick={onCancel} disabled={submitting}>{t.cancel}</Button>
          <Button size="sm" onClick={() => void submit()} disabled={submitting}>
            {t.createSubmit}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label={t.name}>
          <Input value={name} onChange={(event) => setName(event.target.value)} placeholder={t.namePlaceholder} />
        </Field>
        <Field label={t.description}>
          <Input value={description} onChange={(event) => setDescription(event.target.value)} placeholder={t.descriptionPlaceholder} />
        </Field>
        {source === 'external' && (
          <Field label={t.entryPath}>
            <div className="flex gap-2">
              <Input
                value={entryPath}
                onChange={(event) => setEntryPath(event.target.value)}
                placeholder={t.entryPathPlaceholder}
                className="font-mono text-[11px]"
              />
              <Button size="sm" variant="outline" className="shrink-0" onClick={() => void pickFile()}>
                {t.browse}
              </Button>
            </div>
          </Field>
        )}
        {error && <p className="text-[11px] text-destructive">{error}</p>}
      </div>
    </Dialog>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="space-y-2 block">
      <span className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}

type DeleteScriptDialogProps = {
  target: Script | undefined
  t: Translations
  onCancel: () => void
  onConfirm: () => Promise<void>
}

function DeleteScriptDialog({ target, t, onCancel, onConfirm }: DeleteScriptDialogProps) {
  const [working, setWorking] = useState(false)

  const detail = target?.source === 'local' ? t.deleteDetailLocal : t.deleteDetailExternal
  const message = target
    ? interpolate(t.deleteConfirmSingle, { name: target.name, detail })
    : ''

  return (
    <Dialog
      open={target !== undefined}
      onClose={onCancel}
      title={t.deleteConfirmTitle}
      size="sm"
      footer={
        <>
          <Button size="sm" variant="ghost" onClick={onCancel} disabled={working}>{t.cancel}</Button>
          <Button
            size="sm"
            variant="destructive"
            disabled={working}
            onClick={async () => {
              setWorking(true)
              try { await onConfirm() } finally { setWorking(false) }
            }}
          >
            {t.deleteConfirm}
          </Button>
        </>
      }
    >
      <p className="text-sm text-foreground">{message}</p>
    </Dialog>
  )
}
