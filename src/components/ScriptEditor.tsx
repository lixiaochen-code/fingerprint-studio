import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Editor, { loader, type OnMount } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'
import { Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SCRIPT_EDITOR_TYPINGS } from '@/lib/scriptTypings'
// monaco worker 的 setup 必须在 Editor 实例化前完成；放在这个模块顶层，
// 这样懒加载 ScriptEditor 时一并把 worker 注册好，不会被首屏 bundle 拖累。
import '@/lib/monacoSetup'
import type { Script } from '../../electron/types'

/**
 * 关键：`@monaco-editor/react` 默认通过 CDN（jsdelivr）加载它自己的 monaco 实例，
 * 与我们 `import * as monaco from 'monaco-editor'` 是两套，setCompilerOptions
 * 配在本地这套上对 <Editor> 内部那套无效——这就是为什么之前一直报
 * "Cannot find module 'auto-registry'"：本地 monaco 配过 Classic + extraLib，但
 * <Editor> 用的是默认配置的 CDN 实例。
 *
 * `loader.config({ monaco })` 让 react wrapper 跳过 CDN，直接用我们打进 bundle 的
 * 本地 monaco —— 配置才能真正生效。这步必须在任何 <Editor> mount 之前完成。
 */
loader.config({ monaco })

/**
 * Monaco TS 服务的全局配置必须在任何 model 创建前完成。
 * 写在模块顶层 = 懒加载 ScriptEditor 时**先**配置、**再**让 <Editor> mount。
 * Monaco 是单例：这段无论 ScriptEditor mount 几次都只跑一次（模块缓存）。
 */
monaco.typescript.typescriptDefaults.setCompilerOptions({
  target: monaco.typescript.ScriptTarget.ES2020,
  module: monaco.typescript.ModuleKind.ESNext,
  // Classic 跳过 node_modules 探测，只看 ambient `declare module`。我们的
  // `auto-registry` 是 SCRIPT_EDITOR_TYPINGS 里的虚拟模块，不存在 node_modules 实体。
  moduleResolution: monaco.typescript.ModuleResolutionKind.Classic,
  allowNonTsExtensions: true,
  esModuleInterop: true,
  strict: false,
  noEmit: true,
  skipLibCheck: true
})
monaco.typescript.typescriptDefaults.setDiagnosticsOptions({
  noSemanticValidation: false,
  noSyntaxValidation: false
})
for (const lib of SCRIPT_EDITOR_TYPINGS) {
  monaco.typescript.typescriptDefaults.addExtraLib(lib.contents, lib.path)
}

/**
 * Monaco 的 TS 服务**不会**从 ambient `declare module` 自动推断"可 import 的包名候选"
 * （Classic moduleResolution 下尤其如此），用户敲 `from '` 不会弹列表。
 *
 * 自定义一个 completion provider，专门覆盖光标位于 import 字符串字面量内的场景，
 * 把内置包名 + 简短描述喂给补全菜单。
 *
 * 范围：触发字符是 ' 和 "；我们只在以下 pattern 命中时返回候选：
 *   - `from '`        （ES module import）
 *   - `from "`
 *   - `import('`      （动态 import）
 *   - `import("`
 *   - `require('`     （兼容用户写 CJS 风格）
 *   - `require("`
 */
type BuiltinPackage = { name: string; description: string }

const BUILTIN_PACKAGES: BuiltinPackage[] = [
  { name: 'auto-registry', description: 'SDK：profile / browser / page / log / sleep / kv / stopSignal' },
  { name: 'puppeteer-core', description: 'Chromium 自动化（DevTools 协议客户端）' },
  { name: 'axios', description: 'HTTP 客户端' },
  { name: 'cheerio', description: 'HTML/XML 解析与查询（jQuery 风格）' },
  { name: 'dayjs', description: '轻量日期时间库' },
  { name: 'zod', description: 'TypeScript-first 模式校验' }
]

const IMPORT_SPECIFIER_REGEX = /(?:from|import|require)\s*\(?\s*['"][^'"]*$/

monaco.languages.registerCompletionItemProvider(['typescript', 'javascript'], {
  triggerCharacters: ['"', "'", '/'],
  provideCompletionItems(model, position) {
    // 取光标所在行从行首到光标处的文本，匹配到才提供包名补全；否则交还给 TS 服务
    const linePrefix = model.getValueInRange({
      startLineNumber: position.lineNumber,
      startColumn: 1,
      endLineNumber: position.lineNumber,
      endColumn: position.column
    })
    if (!IMPORT_SPECIFIER_REGEX.test(linePrefix)) return { suggestions: [] }

    const word = model.getWordUntilPosition(position)
    const range: monaco.IRange = {
      startLineNumber: position.lineNumber,
      startColumn: word.startColumn,
      endLineNumber: position.lineNumber,
      endColumn: word.endColumn
    }

    return {
      suggestions: BUILTIN_PACKAGES.map((pkg) => ({
        label: pkg.name,
        kind: monaco.languages.CompletionItemKind.Module,
        insertText: pkg.name,
        detail: pkg.description,
        documentation: { value: pkg.description },
        range,
        // 让我们的内置包排在 TS 默认补全的前面（同字母时）
        sortText: '0_' + pkg.name
      }))
    }
  }
})

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

  /**
   * 立即落盘：取消挂起的 debounce，立刻 writeSource。Cmd/Ctrl+S 用。
   * external 脚本只读，调用这个函数应该是 no-op。
   */
  const flushSave = useCallback(() => {
    if (isReadOnly) return
    if (debounceTimerRef.current !== undefined) {
      window.clearTimeout(debounceTimerRef.current)
      debounceTimerRef.current = undefined
    }
    if (source === undefined) return
    void persist(script.id, source)
  }, [isReadOnly, persist, script.id, source])

  // flushSave 的最新版本放进 ref，让 Monaco 注册的命令始终调到最新闭包
  // （editor.addAction 注册一次后无法替换，闭包必须自己手动追新）
  const flushSaveRef = useRef(flushSave)
  flushSaveRef.current = flushSave

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
    // Cmd/Ctrl+S 立即保存，不等 500ms debounce。Monaco 通过 ref 拿最新 flushSave，
    // 避免每次 source 变化都重新注册 action。
    editor.addAction({
      id: 'auto-registry.save-script',
      label: 'Save script',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS],
      run: () => flushSaveRef.current()
    })
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

  // Monaco 模型路径用 script id —— 同一编辑器实例切换脚本时模型会重置，避免历史污染。
  // 用 `.ts` 而不是 `.tsx`：脚本目前不写 JSX，避免 TS 服务把尖括号当 JSX 起头解析。
  const editorPath = useMemo(() => `file:///scripts/${script.id}/index.ts`, [script.id])

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
              fontFamily: '"JetBrains Mono", ui-monospace, monospace',
              // 父容器有 overflow:hidden（DetailPane / ScriptsView 都设了），
              // 默认渲染的 hover/补全/参数提示 widget 会被裁切看不到内容。
              // 这两个 flag 让 widget 渲染到 fixed-position 层逃出 overflow。
              fixedOverflowWidgets: true,
              hover: { above: false, sticky: true }
            }}
          />
        )}
      </div>
    </div>
  )
}
