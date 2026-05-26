import { useEffect, useState } from 'react'
import { Loader2, Wifi, WifiOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import type { Proxy, ProxyDraft, ProxyScheme, ProxyTestSnapshot } from '../../electron/types'

/**
 * 单代理新建/编辑对话框。
 *
 * 设计原则:
 * - 字段一对一映射到 ProxyDraft;UI 不做转义、不做填补缺省值。所有规范化在主进程
 *   ProxyStore.upsert 里完成,这里只是表单装配
 * - "测试"按钮:先持久化再测的语义太重,这里改成"先存才能测" —— 提示用户必须先保存
 *   才能在 ProxiesView 列表上点测试。表单内即时探测不实现,理由:表单内联测试结果要存
 *   到 lastTest 才能在表格延迟列看到,等于另一条 IPC 路径。简化:存了再测
 * - 白名单 textarea:Phase 1e 才接通,现在 placeholder 显示但禁用
 */

type Locale = 'en' | 'zh'

type Translations = {
  createTitle: string
  editTitle: string
  name: string
  namePlaceholder: string
  scheme: string
  host: string
  port: string
  username: string
  password: string
  optional: string
  whitelist: string
  whitelistDisabledHint: string
  cancel: string
  save: string
  testNote: string
  errorHost: string
  errorPort: string
}

const labels: Record<Locale, Translations> = {
  en: {
    createTitle: 'New proxy',
    editTitle: 'Edit proxy',
    name: 'Name',
    namePlaceholder: 'Defaults to host:port',
    scheme: 'Scheme',
    host: 'Host',
    port: 'Port',
    username: 'Username',
    password: 'Password',
    optional: 'optional',
    whitelist: 'Bypass list (whitelist)',
    whitelistDisabledHint: 'Whitelist editing arrives in Phase 1e. For now leave empty.',
    cancel: 'Cancel',
    save: 'Save',
    testNote: 'Save first, then refresh from the proxies list to measure latency and location.',
    errorHost: 'Host is required.',
    errorPort: 'Port must be between 1 and 65535.'
  },
  zh: {
    createTitle: '新增代理',
    editTitle: '编辑代理',
    name: '名称',
    namePlaceholder: '留空则默认 host:port',
    scheme: '协议',
    host: '主机',
    port: '端口',
    username: '用户名',
    password: '密码',
    optional: '可选',
    whitelist: 'Bypass 白名单',
    whitelistDisabledHint: '白名单编辑在 Phase 1e 接入,目前留空即可。',
    cancel: '取消',
    save: '保存',
    testNote: '保存后,可在代理列表点"刷新"测量延迟和地理位置。',
    errorHost: '主机不能为空。',
    errorPort: '端口需在 1-65535 之间。'
  }
}

const SCHEMES: ProxyScheme[] = ['http', 'https', 'socks5', 'socks4']

export interface ProxyFormDialogProps {
  open: boolean
  mode: 'create' | 'edit'
  initial?: Proxy
  locale: Locale
  onCancel: () => void
  onSubmit: (draft: ProxyDraft) => Promise<Proxy | void> | void
}

export function ProxyFormDialog({ open, mode, initial, locale, onCancel, onSubmit }: ProxyFormDialogProps) {
  const t = labels[locale]
  const [name, setName] = useState('')
  const [scheme, setScheme] = useState<ProxyScheme>('http')
  const [host, setHost] = useState('')
  const [port, setPort] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // 每次开盘根据 initial 重设 form,关掉对话框时不 reset 让动画期间不闪
  useEffect(() => {
    if (!open) return
    setError(null)
    setSaving(false)
    if (initial) {
      setName(initial.name)
      setScheme(initial.scheme)
      setHost(initial.host)
      setPort(String(initial.port))
      setUsername(initial.username ?? '')
      setPassword(initial.password ?? '')
    } else {
      setName('')
      setScheme('http')
      setHost('')
      setPort('')
      setUsername('')
      setPassword('')
    }
  }, [open, initial])

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    const trimmedHost = host.trim()
    const portNum = Number(port)
    if (!trimmedHost) return setError(t.errorHost)
    if (!Number.isInteger(portNum) || portNum <= 0 || portNum > 65535) return setError(t.errorPort)
    setSaving(true)
    try {
      await onSubmit({
        id: initial?.id,
        name: name.trim() || undefined,
        scheme,
        host: trimmedHost,
        port: portNum,
        username: username.trim() || undefined,
        password: password || undefined
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title={mode === 'edit' ? t.editTitle : t.createTitle}
      size="md"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onCancel} disabled={saving}>{t.cancel}</Button>
          <Button type="submit" form="proxy-form" disabled={saving}>
            {saving && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
            {t.save}
          </Button>
        </>
      }
    >
      <form id="proxy-form" onSubmit={handleSubmit} className="space-y-4">
        <Field label={t.name}>
          <Input value={name} onChange={(event) => setName(event.target.value)} placeholder={t.namePlaceholder} />
        </Field>
        <div className="grid grid-cols-12 gap-3">
          <Field label={t.scheme} className="col-span-3">
            <select
              value={scheme}
              onChange={(event) => setScheme(event.target.value as ProxyScheme)}
              className="flex h-9 w-full border border-border bg-input px-3 py-1 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
            >
              {SCHEMES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          <Field label={t.host} className="col-span-6">
            <Input value={host} onChange={(event) => setHost(event.target.value)} placeholder="1.2.3.4" required />
          </Field>
          <Field label={t.port} className="col-span-3">
            <Input value={port} onChange={(event) => setPort(event.target.value)} placeholder="7890" inputMode="numeric" required />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={`${t.username} (${t.optional})`}>
            <Input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="off" />
          </Field>
          <Field label={`${t.password} (${t.optional})`}>
            <Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="off" />
          </Field>
        </div>
        <Field label={t.whitelist}>
          <textarea
            disabled
            rows={3}
            placeholder={t.whitelistDisabledHint}
            className="flex w-full border border-border bg-input/50 px-3 py-2 text-xs text-muted-foreground outline-none disabled:cursor-not-allowed"
          />
        </Field>
        {error && <p className="text-xs text-destructive">{error}</p>}
        <p className="text-[11px] text-muted-foreground">{t.testNote}</p>
      </form>
    </Dialog>
  )
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`space-y-2 ${className || ''}`}>
      <span className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}

/**
 * 代理探测结果徽章,ProxiesView 表格"状态"列直接用。
 *
 * 三种形态:
 * - null/undefined → 不渲染
 * - 'pending' → loader
 * - ProxyTestSnapshot → 成功 = primary;失败 = destructive
 */
export function ProxyTestBadge({ snapshot, locale }: { snapshot?: ProxyTestSnapshot | 'pending' | null; locale: Locale }) {
  if (!snapshot) return null
  if (snapshot === 'pending') {
    return <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
  }
  const ok = snapshot.ok
  const Icon = ok ? Wifi : WifiOff
  const tone = ok
    ? 'border-primary/40 bg-primary/10 text-primary'
    : 'border-destructive/40 bg-destructive/10 text-destructive'
  const text = ok
    ? `${snapshot.latencyMs ?? '?'}ms`
    : (snapshot.code || (locale === 'zh' ? '失败' : 'failed'))
  return (
    <span className={`inline-flex items-center gap-1 border px-2 py-1 font-mono text-[10px] ${tone}`} title={snapshot.message ?? ''}>
      <Icon className="h-3 w-3" />
      {text}
    </span>
  )
}
