import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { interpolate } from '@/lib/i18n'
import type { BrowserPlugin, BrowserProfile, Proxy } from '../../../electron/types'

type Locale = 'en' | 'zh'

const labels = {
  en: {
    title: 'Environment details',
    countTitle: '{{count}} environments',
    close: 'Close',
    sectionBasic: 'Basic',
    sectionProxy: 'Proxy',
    sectionFingerprint: 'Fingerprint',
    sectionPlugins: 'Plugins',
    sectionMeta: 'Storage',
    name: 'Name',
    notes: 'Notes',
    startUrl: 'Start URL',
    proxyUrl: 'Endpoint',
    proxyAuth: 'Auth',
    proxyName: 'Name',
    proxyNone: 'No proxy (system network)',
    targetOs: 'Target OS',
    userAgent: 'User Agent',
    language: 'Language',
    timezone: 'Timezone',
    viewport: 'Viewport',
    screen: 'Screen',
    platformId: 'Platform ID',
    hardwareConcurrency: 'CPU Cores',
    deviceMemory: 'Device Memory (GB)',
    deviceScaleFactor: 'DPR',
    maxTouchPoints: 'Touch Points',
    doNotTrack: 'DNT',
    webRtcPolicy: 'WebRTC Policy',
    canvasNoise: 'Canvas Noise',
    audioNoise: 'Audio Noise',
    webglVendor: 'WebGL Vendor',
    webglRenderer: 'WebGL Renderer',
    fonts: 'Fonts',
    profilePath: 'Profile Path',
    createdAt: 'Created',
    updatedAt: 'Updated',
    lastOpenedAt: 'Last opened',
    none: '—',
    pluginsEmpty: 'No plugins enabled.'
  },
  zh: {
    title: '环境详情',
    countTitle: '共 {{count}} 个环境',
    close: '关闭',
    sectionBasic: '基础信息',
    sectionProxy: '代理',
    sectionFingerprint: '指纹',
    sectionPlugins: '插件',
    sectionMeta: '存储',
    name: '名称',
    notes: '备注',
    startUrl: '启动网址',
    proxyUrl: '地址',
    proxyAuth: '认证',
    proxyName: '名称',
    proxyNone: '无代理（系统网络）',
    targetOs: '目标系统',
    userAgent: 'User Agent',
    language: '语言',
    timezone: '时区',
    viewport: '视口',
    screen: '屏幕',
    platformId: '平台标识',
    hardwareConcurrency: 'CPU 核心',
    deviceMemory: '设备内存（GB）',
    deviceScaleFactor: '像素比',
    maxTouchPoints: '触控点',
    doNotTrack: 'DNT',
    webRtcPolicy: 'WebRTC 策略',
    canvasNoise: 'Canvas 噪声',
    audioNoise: '音频噪声',
    webglVendor: 'WebGL 厂商',
    webglRenderer: 'WebGL 渲染器',
    fonts: '字体',
    profilePath: '环境路径',
    createdAt: '创建时间',
    updatedAt: '更新时间',
    lastOpenedAt: '最近启动',
    none: '—',
    pluginsEmpty: '未启用插件。'
  }
}

type Translations = typeof labels.en

export type ProfileDetailsDialogProps = {
  open: boolean
  profiles: BrowserProfile[]
  plugins: BrowserPlugin[]
  proxies: Proxy[]
  locale: Locale
  onClose: () => void
}

export function ProfileDetailsDialog({ open, profiles, plugins, proxies, locale, onClose }: ProfileDetailsDialogProps) {
  const t = labels[locale]
  const single = profiles.length === 1
  const title = single
    ? `${t.title} · ${profiles[0]?.name}`
    : interpolate(t.countTitle, { count: String(profiles.length) })

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      size="xl"
      footer={<Button size="sm" variant="ghost" onClick={onClose}>{t.close}</Button>}
    >
      <div className="space-y-6">
        {profiles.map((profile) => (
          <ProfileBlock
            key={profile.id}
            profile={profile}
            plugins={plugins}
            proxies={proxies}
            t={t}
            showName={!single}
          />
        ))}
      </div>
    </Dialog>
  )
}

function ProfileBlock({
  profile,
  plugins,
  proxies,
  t,
  showName
}: {
  profile: BrowserProfile
  plugins: BrowserPlugin[]
  proxies: Proxy[]
  t: Translations
  showName: boolean
}) {
  const enabledPlugins = profile.enabledPluginIds
    .map((id) => plugins.find((plugin) => plugin.id === id))
    .filter((plugin): plugin is BrowserPlugin => Boolean(plugin))

  return (
    <section className="border border-border bg-background">
      {showName && (
        <header className="border-b border-border bg-secondary px-4 py-2">
          <h3 className="font-display text-xs font-bold uppercase tracking-wider">{profile.name}</h3>
        </header>
      )}
      <div className="grid gap-x-6 gap-y-4 p-4 md:grid-cols-2">
        <Group title={t.sectionBasic}>
          <Row label={t.name} value={profile.name} />
          <Row label={t.startUrl} value={profile.startUrl || t.none} />
          <Row label={t.notes} value={profile.notes || t.none} />
        </Group>
        <Group title={t.sectionProxy}>
          {(() => {
            // proxyId 是真源:null = 用户主动选无代理;字符串 = 引用 ProxyStore 条目。
            // 字符串但 proxies 找不到 = 引用悬空(代理被删了 profile 没更新),按"无代理"显示
            // 是更安全的 fallback —— 不展示残留的 inline 字段,避免误导。
            const proxy = profile.proxyId
              ? proxies.find((p) => p.id === profile.proxyId)
              : undefined
            if (!proxy) {
              return <Row label={t.proxyUrl} value={t.proxyNone} />
            }
            return (
              <>
                <Row label={t.proxyName} value={proxy.name} />
                <Row label={t.proxyUrl} value={`${proxy.scheme}://${proxy.host}:${proxy.port}`} />
                <Row label={t.proxyAuth} value={proxy.username ? `${proxy.username} : ••••` : t.none} />
              </>
            )
          })()}
        </Group>
        <Group title={t.sectionFingerprint} className="md:col-span-2">
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 lg:grid-cols-3">
            <Row label={t.targetOs} value={profile.fingerprint.targetOs.toUpperCase()} />
            <Row label={t.platformId} value={profile.fingerprint.platform} />
            <Row label={t.language} value={profile.fingerprint.language} />
            <Row label={t.timezone} value={profile.fingerprint.timezone} />
            <Row label={t.viewport} value={`${profile.fingerprint.viewport.width} × ${profile.fingerprint.viewport.height}`} />
            <Row label={t.screen} value={`${profile.fingerprint.screen.availWidth} × ${profile.fingerprint.screen.availHeight} @ ${profile.fingerprint.screen.colorDepth}bit`} />
            <Row label={t.hardwareConcurrency} value={String(profile.fingerprint.hardwareConcurrency)} />
            <Row label={t.deviceMemory} value={String(profile.fingerprint.deviceMemory)} />
            <Row label={t.deviceScaleFactor} value={String(profile.fingerprint.deviceScaleFactor)} />
            <Row label={t.maxTouchPoints} value={String(profile.fingerprint.maxTouchPoints)} />
            <Row label={t.doNotTrack} value={profile.fingerprint.doNotTrack} />
            <Row label={t.webRtcPolicy} value={profile.fingerprint.webRtcPolicy} />
            <Row label={t.canvasNoise} value={String(profile.fingerprint.canvasNoise)} />
            <Row label={t.audioNoise} value={String(profile.fingerprint.audioNoise)} />
          </div>
          <div className="mt-3 grid gap-2">
            <Row label={t.userAgent} value={profile.fingerprint.userAgent} mono />
            <Row label={t.webglVendor} value={profile.fingerprint.webglVendor} mono />
            <Row label={t.webglRenderer} value={profile.fingerprint.webglRenderer} mono />
            <Row label={t.fonts} value={profile.fingerprint.fonts.join(', ')} mono />
          </div>
        </Group>
        <Group title={t.sectionPlugins} className="md:col-span-2">
          {enabledPlugins.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t.pluginsEmpty}</p>
          ) : (
            <ul className="space-y-1">
              {enabledPlugins.map((plugin) => {
                const active = plugin.versions.find((version) => version.id === plugin.activeVersionId)
                return (
                  <li key={plugin.id} className="flex items-center justify-between text-xs">
                    <span className="font-bold">{plugin.name}</span>
                    <span className="font-mono text-muted-foreground">v{active?.version || '—'}</span>
                  </li>
                )
              })}
            </ul>
          )}
        </Group>
        <Group title={t.sectionMeta} className="md:col-span-2">
          <Row label={t.profilePath} value={profile.profilePath} mono />
          <div className="grid grid-cols-3 gap-x-6 gap-y-2 mt-2">
            <Row label={t.createdAt} value={formatDate(profile.createdAt)} />
            <Row label={t.updatedAt} value={formatDate(profile.updatedAt)} />
            <Row label={t.lastOpenedAt} value={profile.lastOpenedAt ? formatDate(profile.lastOpenedAt) : t.none} />
          </div>
        </Group>
      </div>
    </section>
  )
}

function Group({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <h4 className="mb-2 font-display text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">{title}</h4>
      <div className="space-y-1">{children}</div>
    </div>
  )
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-3 text-xs">
      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className={`break-all ${mono ? 'font-mono text-[11px]' : ''}`}>{value}</span>
    </div>
  )
}

function formatDate(value: string) {
  try {
    const date = new Date(value)
    return date.toLocaleString()
  } catch {
    return value
  }
}
