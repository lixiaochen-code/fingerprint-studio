import type { ProxyTestSnapshot } from '../../../electron/types'
import type { Locale } from './translations'

/**
 * 把 ms 时间戳转成"几秒前 / 几分钟前 / 几小时前"的相对时间。
 * undefined 直接返回 — 表示"从未测试过"。
 */
export function formatLastTested(at: number | undefined, locale: Locale): string {
  if (!at) return '—'
  const ms = Date.now() - at
  const sec = Math.floor(ms / 1000)
  if (sec < 60) return locale === 'zh' ? `${sec} 秒前` : `${sec}s ago`
  const min = Math.floor(sec / 60)
  if (min < 60) return locale === 'zh' ? `${min} 分钟前` : `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return locale === 'zh' ? `${hr} 小时前` : `${hr}h ago`
  const day = Math.floor(hr / 24)
  return locale === 'zh' ? `${day} 天前` : `${day}d ago`
}

/**
 * 拼接代理探测拿到的地理信息。城市国家用逗号分隔,机构(org)在后面用 · 分隔。
 * 没有任何字段时返回 — 占位。
 */
export function formatLocation(snapshot: ProxyTestSnapshot | undefined): string {
  if (!snapshot?.geo) return '—'
  const { country, city, org } = snapshot.geo
  const place = [city, country].filter(Boolean).join(', ')
  if (place && org) return `${place} · ${org}`
  return place || org || '—'
}
