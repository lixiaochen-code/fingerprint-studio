import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Editor, { type OnMount } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'
import { Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SCRIPT_EDITOR_TYPINGS } from '@/lib/scriptTypings'
// monaco worker 的 setup 必须在 Editor 实例化前完成；放在这个模块顶层，
// 这样懒加载 ScriptEditor 时一并把 worker 注册好，不会被首屏 bundle 拖累。
import '@/lib/monacoSetup'
import type { Script } from '../../electron/types'

type Locale = 'en' | 'zh'
type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error'
type Theme = 'light' | 'dark'

type Translations = {
  loading: string
  saved: string
  saving: string
  dirty: string
  saveError: string
  reloadFromDisk: string
  externalReadOnly: string
}

const labels: Record<Locale, Translations> = {
  en: {
    loading: 'Loading editor...',
    saved: 'Saved',
    saving: 'Saving...',
    dirty: 'Unsaved changes',
    saveError: 'Save failed',
    reloadFromDisk: 'Reload from disk',
    externalReadOnly: 'External script — edit in your own editor and reload here.'
  },
  zh: {
    loading: '编辑器加载中…',
    saved: '已保存',
    saving: '保存中…',
    dirty: '有未保存改动',
    saveError: '保存失败',
    reloadFromDisk: '从磁盘重载',
    externalReadOnly: '外部脚本 — 请在自己的编辑器里改，再点重载。'
  }
}

const SAVE_DEBOUNCE_MS = 500

export type ScriptEditorProps = {
  script: Script
  locale: Locale
  theme: Theme
}

/**
 * 单脚本的 Monaco 编辑器封装。
 *
 * - local 脚本：可写。每次 onChange debounce 500ms 调 scripts.writeSource。
 * - external 脚本：readOnly=true，提供"从磁盘重载"按钮，方便用户在 VSCode 里改完同步过来。
 *
 * Monaco 的 TS 类型补全通过 SCRIPT_EDITOR_TYPINGS 注入；首次 mount 时一次性配置好，
 * 之后切换不同脚本只是换 path/value，不会重复注册 extraLib。
 */
export function ScriptEditor({ script, locale, theme }: ScriptEditorProps) {
  const t = labels[locale]
  const [source, setSource] = useState<string | undefined>(undefined)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [errorMessage, setErrorMessage] = useState<string | undefined>()
  const debounceTimerRef = useRef<number | undefined>(undefined)
  // 跟踪当前 script.id，避免脚本切换时旧文件的 debounce 把新脚本覆盖
  const activeScriptIdRef = useRef(script.id)

  const isReadOnly = script.source === 'external'

  const loadSource = useCallback(async (scriptId: string) => {
    setSaveState('idle')
    setErrorMessage(undefined)
    try {
      const text = await window.registry.scripts.readSource(scriptId)
      // 只有当用户没有切到别的脚本上时才更新内容，防止竞态
      if (activeScriptIdRef.current === scriptId) {
        setSource(text)
      }
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught)
      if (activeScriptIdRef.current === scriptId) {
        setErrorMessage(message)
        setSource('')
      }
    }
  }, [])

  // 切换脚本时：取消挂起的保存、清空 source、重新加载
  useEffect(() => {
    activeScriptIdRef.current = script.id
    if (debounceTimerRef.current !== undefined) {
      window.clearTimeout(debounceTimerRef.current)
      debounceTimerRef.current = undefined
    }
    setSource(undefined)
    void loadSource(script.id)
  }, [script.id, loadSource])

  // 卸载时确保 timer 不残留
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current !== undefined) {
        window.clearTimeout(debounceTimerRef.current)
      }
    }
  }, [])

  const persist = useCallback(async (scriptId: string, value: string) => {
    setSaveState('saving')
    try {
      await window.registry.scripts.writeSource(scriptId, value)
      // 切换脚本期间老 timer 触发，结果不应覆盖新脚本的状态
      if (activeScriptIdRef.current === scriptId) {
        setSaveState('saved')
        setErrorMessage(undefined)
      }
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught)
      if (activeScriptIdRef.current === scriptId) {
        setSaveState('error')
        setErrorMessage(message)
      }
    }
  }, [])

  const onChange = useCallback((value: string | undefined) => {
    if (value === undefined) return
    setSource(value)
    if (isReadOnly) return
    setSaveState('dirty')
    if (debounceTimerRef.current !== undefined) {
      window.clearTimeout(debounceTimerRef.current)
    }
    const scriptId = script.id
    debounceTimerRef.current = window.setTimeout(() => {
      debounceTimerRef.current = undefined
      void persist(scriptId, value)
    }, SAVE_DEBOUNCE_MS)
  }, [isReadOnly, persist, script.id])

  const handleMount: OnMount = useCallback((editor) => {
    // 一次性配置 TS 编译器选项 + extraLib —— Monaco 是单例，重复 setCompilerOptions
    // 会覆盖前一次，但 addExtraLib 重复 path 也只是替换内容，不会双倍内存。
    //
    // 注：monaco-editor 0.55 把 typescript 子命名空间提到顶层（旧的
    // `monaco.languages.typescript` 仍然可工作但被标 deprecated 导致 TS 报错），
    // 这里走新的 `monaco.typescript`。
    monaco.typescript.typescriptDefaults.setCompilerOptions({
      target: monaco.typescript.ScriptTarget.ES2020,
      module: monaco.typescript.ModuleKind.ESNext,
      moduleResolution: monaco.typescript.ModuleResolutionKind.NodeJs,
      allowNonTsExtensions: true,
      esModuleInterop: true,
      strict: false,
      skipLibCheck: true
    })
    monaco.typescript.typescriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: false,
      noSyntaxValidation: false
    })
    for (const lib of SCRIPT_EDITOR_TYPINGS) {
      monaco.typescript.typescriptDefaults.addExtraLib(lib.contents, lib.path)
    }
    editor.focus()
  }, [])

  const reloadFromDisk = useCallback(() => {
    void loadSource(script.id)
  }, [loadSource, script.id])

  const statusBadge = useMemo(() => {
    switch (saveState) {
      case 'saving': return { text: t.saving, className: 'text-muted-foreground' }
      case 'dirty': return { text: t.dirty, className: 'text-amber-500' }
      case 'saved': return { text: t.saved, className: 'text-primary' }
      case 'error': return { text: errorMessage || t.saveError, className: 'text-destructive' }
      default: return undefined
    }
  }, [saveState, errorMessage, t])

  // Monaco 路径用 script id —— 同一编辑器实例切换脚本时模型会重置，避免历史污染
  const editorPath = useMemo(() => `file:///scripts/${script.id}/index.tsx`, [script.id])

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border bg-secondary/30 px-4 py-2 text-[11px] font-mono">
        <div className="flex items-center gap-3">
          {isReadOnly && (
            <span className="text-amber-500">{t.externalReadOnly}</span>
          )}
          {statusBadge && (
            <span className={statusBadge.className}>{statusBadge.text}</span>
          )}
        </div>
        {isReadOnly && (
          <Button size="sm" variant="ghost" className="h-6 gap-1.5 px-2 text-[10px]" onClick={reloadFromDisk}>
            <RefreshCw className="h-3 w-3" />
            {t.reloadFromDisk}
          </Button>
        )}
      </div>
      <div className="flex-1 overflow-hidden">
        {source === undefined ? (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            <Loader2 className="mr-2 h-3 w-3 animate-spin" />
            {t.loading}
          </div>
        ) : (
          <Editor
            path={editorPath}
            value={source}
            language="typescript"
            theme={theme === 'dark' ? 'vs-dark' : 'light'}
            onChange={onChange}
            onMount={handleMount}
            options={{
              readOnly: isReadOnly,
              fontSize: 13,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              automaticLayout: true,
              tabSize: 2,
              wordWrap: 'on',
              padding: { top: 12, bottom: 12 },
              fontLigatures: true,
              fontFamily: '"JetBrains Mono", ui-monospace, monospace'
            }}
          />
        )}
      </div>
    </div>
  )
}
