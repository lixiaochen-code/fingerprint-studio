import { useEffect, useMemo, useState } from 'react'
import { Loader2, FileText, CheckCircle2, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import type { Proxy } from '../../../electron/types'

/**
 * 批量导入代理对话框。
 *
 * 工作流:
 *   1. 用户粘贴多行文本(每行一个代理,五种格式见 parser.ts 注释)
 *   2. 点"解析预览"调 IPC,主进程返回 { created, reused, failed }(实际还没创建,这一步只是 dry-run?)
 *      —— **简化**:这里直接走 IPC `proxies:bulkImport`,后端会实际创建 + 返回已 dedup 的结果。
 *      用户预览要么提前在前端解析(parser 没暴露给 renderer),要么就一次性提交看结果。
 *      为了避免在 renderer 复制 parser 逻辑,我们采用"提交即导入,失败行可以看清原因"。
 *   3. 结果区显示:✅ N 条新创建 / ♻ N 条已存在(dedup 重用) / ❌ N 条失败(展开看原因)
 *   4. 用户关闭对话框,返回 ProxiesView 看新条目。失败行可以从 textarea 复制出来手动修正再来一次
 */

type Locale = 'en' | 'zh'

type Translations = {
  title: string
  formatHint: string
  textareaPlaceholder: string
  importBtn: string
  closeBtn: string
  resultCreated: string
  resultReused: string
  resultFailed: string
  noResult: string
  emptyError: string
  formatExamples: string[]
}

const labels: Record<Locale, Translations> = {
  en: {
    title: 'Batch import proxies',
    formatHint: 'Paste one proxy per line. Supported formats:',
    textareaPlaceholder: '1.2.3.4:7890\nhttp://5.6.7.8:8080\nalice:s3cret@9.10.11.12:1080\nsocks5://user:pass@host:1080',
    importBtn: 'Import',
    closeBtn: 'Close',
    resultCreated: 'Created',
    resultReused: 'Reused (already saved)',
    resultFailed: 'Failed',
    noResult: 'No proxies imported yet.',
    emptyError: 'Paste at least one line.',
    formatExamples: [
      'host:port  (default http)',
      'host:port:user:pass',
      'user:pass@host:port',
      'scheme://host:port',
      'scheme://user:pass@host:port (scheme = http/https/socks5/socks4)'
    ]
  },
  zh: {
    title: '批量导入代理',
    formatHint: '每行一个代理,支持以下格式:',
    textareaPlaceholder: '1.2.3.4:7890\nhttp://5.6.7.8:8080\nalice:s3cret@9.10.11.12:1080\nsocks5://user:pass@host:1080',
    importBtn: '导入',
    closeBtn: '关闭',
    resultCreated: '新建',
    resultReused: '已存在(去重重用)',
    resultFailed: '失败',
    noResult: '尚未导入。',
    emptyError: '至少粘贴一行。',
    formatExamples: [
      'host:port  (默认 http)',
      'host:port:user:pass',
      'user:pass@host:port',
      'scheme://host:port',
      'scheme://user:pass@host:port (scheme = http/https/socks5/socks4)'
    ]
  }
}

interface ImportResult {
  created: Proxy[]
  reused: Proxy[]
  failed: Array<{ line: string; reason: string }>
}

export interface ProxyBatchImportDialogProps {
  open: boolean
  locale: Locale
  onClose: () => void
  /** 调用 window.registry.proxies.bulkImport,父组件控制 */
  onImport: (text: string) => Promise<ImportResult>
  /** 导入完成回调,父组件刷新列表 */
  onImported?: (result: ImportResult) => void
}

export function ProxyBatchImportDialog({ open, locale, onClose, onImport, onImported }: ProxyBatchImportDialogProps) {
  const t = labels[locale]
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setText('')
    setBusy(false)
    setResult(null)
    setError(null)
  }, [open])

  async function handleImport() {
    setError(null)
    if (!text.trim()) {
      setError(t.emptyError)
      return
    }
    setBusy(true)
    try {
      const r = await onImport(text)
      setResult(r)
      onImported?.(r)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t.title}
      size="lg"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>{t.closeBtn}</Button>
          <Button type="button" onClick={handleImport} disabled={busy}>
            {busy && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
            {t.importBtn}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">{t.formatHint}</p>
          <ul className="font-mono text-[11px] text-muted-foreground space-y-0.5 pl-4">
            {t.formatExamples.map((line) => <li key={line}>{line}</li>)}
          </ul>
        </div>
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={t.textareaPlaceholder}
          rows={8}
          className="flex w-full border border-border bg-input px-3 py-2 font-mono text-xs text-foreground outline-none focus:ring-2 focus:ring-ring"
        />
        {error && <p className="text-xs text-destructive">{error}</p>}
        {result && <ResultPanel result={result} t={t} />}
      </div>
    </Dialog>
  )
}

function ResultPanel({ result, t }: { result: ImportResult; t: Translations }) {
  const total = result.created.length + result.reused.length + result.failed.length
  if (total === 0) return <p className="text-xs text-muted-foreground">{t.noResult}</p>

  return (
    <div className="border border-border bg-background/40 p-3 space-y-3">
      <div className="flex flex-wrap gap-4 text-xs">
        <Stat icon={<CheckCircle2 className="h-3.5 w-3.5 text-primary" />} label={t.resultCreated} value={result.created.length} />
        <Stat icon={<FileText className="h-3.5 w-3.5 text-muted-foreground" />} label={t.resultReused} value={result.reused.length} />
        <Stat icon={<XCircle className="h-3.5 w-3.5 text-destructive" />} label={t.resultFailed} value={result.failed.length} />
      </div>
      {result.failed.length > 0 && (
        <details className="space-y-1">
          <summary className="cursor-pointer text-[11px] uppercase tracking-wider text-muted-foreground hover:text-foreground">
            {t.resultFailed} ({result.failed.length})
          </summary>
          <ul className="space-y-1 mt-2 font-mono text-[11px]">
            {result.failed.map((failed, idx) => (
              <li key={idx} className="border border-destructive/30 bg-destructive/5 px-2 py-1.5">
                <div className="text-destructive">{failed.line}</div>
                <div className="text-muted-foreground">{failed.reason}</div>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {icon}
      <span className="text-muted-foreground">{label}:</span>
      <span className="font-mono font-bold text-foreground">{value}</span>
    </span>
  )
}
