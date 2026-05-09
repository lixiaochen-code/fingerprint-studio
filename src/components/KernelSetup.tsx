import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { interpolate } from '@/lib/i18n'
import type { KernelInstallProgress, KernelStatus, KernelType } from '../../electron/types'

type Locale = 'en' | 'zh'

const labels = {
  en: {
    titleChromium: 'Install Chromium kernel',
    titleItbrowser: 'Install itbrowser kernel',
    descChromium: 'Used by every profile that does not run on the Windows itbrowser fork. Roughly 150 MB.',
    descItbrowser: 'Optional Windows-only fingerprint browser. About 250 MB compressed, ~600 MB after extraction.',
    install: 'Install',
    cancel: 'Cancel',
    close: 'Close',
    retry: 'Retry',
    installing: 'Installing...',
    success: 'Installed.',
    canceled: 'Canceled.',
    failed: 'Install failed: {{message}}',
    phaseDownload: 'Downloading',
    phaseExtract: 'Extracting',
    phaseVerify: 'Verifying',
    phaseDone: 'Done',
    phaseError: 'Error',
    phasePending: 'Preparing',
    phaseCanceled: 'Canceled',
    skipUnsupported: 'itbrowser is only available on Windows hosts.',
    statusInstalled: 'Installed',
    statusMissing: 'Missing'
  },
  zh: {
    titleChromium: '安装 Chromium 内核',
    titleItbrowser: '安装 itbrowser 内核',
    descChromium: '所有非 Windows itbrowser 模式都会使用它，约 150 MB。',
    descItbrowser: '仅 Windows 可用的指纹浏览器，压缩约 250 MB，解压后约 600 MB。',
    install: '安装',
    cancel: '取消',
    close: '关闭',
    retry: '重试',
    installing: '安装中…',
    success: '已安装。',
    canceled: '已取消。',
    failed: '安装失败：{{message}}',
    phaseDownload: '下载中',
    phaseExtract: '解压中',
    phaseVerify: '校验中',
    phaseDone: '完成',
    phaseError: '错误',
    phasePending: '准备中',
    phaseCanceled: '已取消',
    skipUnsupported: 'itbrowser 仅支持 Windows 宿主机。',
    statusInstalled: '已安装',
    statusMissing: '未安装'
  }
} as const

function formatMB(bytes?: number) {
  if (!bytes || bytes <= 0) return '—'
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export type KernelSetupProps = {
  open: boolean
  kernel: KernelType
  status?: KernelStatus
  locale: Locale
  hostSupportsItbrowser: boolean
  onClose: () => void
  onInstalled?: () => void
}

export function KernelSetup({ open, kernel, status, locale, hostSupportsItbrowser, onClose, onInstalled }: KernelSetupProps) {
  const t = labels[locale]
  const [progress, setProgress] = useState<KernelInstallProgress | undefined>()
  const [installing, setInstalling] = useState(false)
  const [error, setError] = useState<string | undefined>()
  const [done, setDone] = useState(false)
  const unsubscribeRef = useRef<(() => void) | undefined>(undefined)

  useEffect(() => {
    if (!open) {
      setProgress(undefined)
      setInstalling(false)
      setError(undefined)
      setDone(false)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const off = window.registry.kernel.onProgress((next) => {
      if (next.kernel !== kernel) return
      setProgress(next)
      if (next.phase === 'done') {
        setDone(true)
        setInstalling(false)
        onInstalled?.()
      }
      if (next.phase === 'error') {
        setError(next.message || 'unknown error')
        setInstalling(false)
      }
      if (next.phase === 'canceled') {
        setInstalling(false)
      }
    })
    unsubscribeRef.current = off
    return () => off()
  }, [open, kernel, onInstalled])

  const title = kernel === 'itbrowser' ? t.titleItbrowser : t.titleChromium
  const description = kernel === 'itbrowser' ? t.descItbrowser : t.descChromium
  const unsupported = kernel === 'itbrowser' && !hostSupportsItbrowser

  const phaseLabel = useMemo(() => {
    switch (progress?.phase) {
      case 'download': return t.phaseDownload
      case 'extract': return t.phaseExtract
      case 'verify': return t.phaseVerify
      case 'done': return t.phaseDone
      case 'error': return t.phaseError
      case 'canceled': return t.phaseCanceled
      case 'pending': return t.phasePending
      default: return undefined
    }
  }, [progress?.phase, t])

  const percent = useMemo(() => {
    if (!progress?.bytesTotal || !progress.bytesDone) return undefined
    return Math.min(100, Math.round((progress.bytesDone / progress.bytesTotal) * 100))
  }, [progress])

  async function startInstall() {
    setInstalling(true)
    setError(undefined)
    setDone(false)
    setProgress({ kernel, phase: 'pending' })
    const result = await window.registry.kernel.install(kernel)
    if (!result.ok) {
      setError(result.error?.message || 'unknown error')
      setInstalling(false)
    }
  }

  async function cancel() {
    await window.registry.kernel.cancel(kernel)
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="w-full max-w-lg border border-border bg-secondary p-6 shadow-xl">
        <div className="mb-4">
          <h2 className="font-display text-base font-bold uppercase tracking-wider">{title}</h2>
          <p className="mt-2 text-xs text-muted-foreground">{description}</p>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-4 border border-border bg-background p-3 text-[11px] font-mono">
          <div>
            <div className="text-muted-foreground uppercase tracking-wider">Status</div>
            <div className={status?.installed ? 'text-primary' : 'text-muted-foreground'}>
              {status?.installed ? t.statusInstalled : t.statusMissing}
            </div>
          </div>
          <div>
            <div className="text-muted-foreground uppercase tracking-wider">Size</div>
            <div>{status?.sizeMB ? `${status.sizeMB} MB` : '—'}</div>
          </div>
        </div>

        {unsupported && (
          <p className="mb-4 text-xs text-amber-500">{t.skipUnsupported}</p>
        )}

        {(installing || progress) && (
          <div className="mb-4 space-y-2">
            <div className="flex items-center justify-between text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
              <span>{phaseLabel}</span>
              <span>{percent !== undefined ? `${percent}%` : formatMB(progress?.bytesDone)}</span>
            </div>
            <div className="h-1.5 w-full bg-muted">
              <div
                className="h-full bg-primary transition-all duration-150"
                style={{ width: `${percent ?? (installing ? 5 : 0)}%` }}
              />
            </div>
            {progress?.message && (
              <p className="truncate text-[10px] font-mono text-muted-foreground">{progress.message}</p>
            )}
          </div>
        )}

        {error && (
          <p className="mb-4 text-xs text-destructive">{interpolate(t.failed, { message: error })}</p>
        )}

        {done && !error && (
          <p className="mb-4 text-xs text-primary">{t.success}</p>
        )}

        <div className="flex justify-end gap-2">
          {installing ? (
            <Button variant="ghost" size="sm" onClick={() => void cancel()}>{t.cancel}</Button>
          ) : (
            <Button variant="ghost" size="sm" onClick={onClose}>{done ? t.close : t.cancel}</Button>
          )}
          {!done && !unsupported && (
            <Button size="sm" disabled={installing} onClick={() => void startInstall()}>
              {installing ? t.installing : (error ? t.retry : t.install)}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
