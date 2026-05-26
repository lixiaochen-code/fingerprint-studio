/**
 * 代理子系统的类型定义,所有其它文件都从这里 import。
 *
 * 设计要点:
 * - `Proxy` 是用户可见的代理条目(有名字、可被多个 profile 复用)。`ProxyConfig` 仅保留
 *   作为旧 inline 数据的过渡类型,Phase 1c 后退役。
 * - `ProxyScheme` 支持 http/https/socks5/socks4 —— 这四种是 chrome.proxy.settings 的
 *   `singleProxy.scheme` 合法值,与 Chromium `--proxy-server=<scheme>://...` 也一致。
 * - `lastTest` 是 UI 渲染的快照,不是配置;每次刷新延迟/地理时被覆盖。
 * - `ProxiesFile.schemaVersion` 留 1,后续 schema 演化时递增。
 */
export type ProxyScheme = 'http' | 'https' | 'socks5' | 'socks4'

export interface ProxyGeo {
  ip: string
  country?: string
  region?: string
  city?: string
  org?: string
  asn?: string
}

export interface ProxyTestSnapshot {
  /** 探测完成的毫秒时间戳 */
  at: number
  ok: boolean
  latencyMs?: number
  /** proxyTest 风格的错误码 */
  code?: 'TIMEOUT' | 'REFUSED' | 'AUTH' | 'BAD_HOST' | 'BAD_RESPONSE' | 'UNKNOWN' | 'GEO_FAILED'
  /** 人类可读消息,失败时 UI 直接展示 */
  message?: string
  /** 通过 ipinfo.io 拿到的地理信息;只在 ok=true 时尝试 */
  geo?: ProxyGeo
}

export interface Proxy {
  id: string
  /** 用户起的友好名;批量导入时默认 `host:port` */
  name: string
  scheme: ProxyScheme
  host: string
  port: number
  username?: string
  password?: string
  /** 代理实例创建时间 ISO */
  createdAt: string
  /** 修改时间 ISO,UI 排序用 */
  updatedAt: string
  /** 最近一次探测结果,UI 表格"延迟/位置"列读这里 */
  lastTest?: ProxyTestSnapshot
}

export interface ProxiesFile {
  schemaVersion: 1
  proxies: Proxy[]
}

/**
 * 新建/编辑 dialog 提交到主进程的 draft。
 * - id 缺省 = 新建
 * - 探测快照不从 UI 来,只能由 IPC `proxies:test` 写入
 */
export interface ProxyDraft {
  id?: string
  name?: string
  scheme: ProxyScheme
  host: string
  port: number
  username?: string
  password?: string
}

/**
 * 批量导入解析的输出。`ok=true` 的条目随后被 ProxyStore.upsert,失败行返回给 UI 让用户看为何拒收。
 */
export type ParseProxyLineResult =
  | { ok: true; line: string; draft: ProxyDraft }
  | { ok: false; line: string; reason: string }

/**
 * 在 Phase 1a 期间,旧 inline 数据(BrowserProfile.proxy: ProxyConfig)迁移到 ProxyStore 时
 * 用 `host:port:user:pass` 作为 dedup key,完全相同的代理只在 ProxyStore 里建一条。
 */
export function proxyDedupKey(args: {
  scheme?: ProxyScheme | string
  host: string
  port: number
  username?: string
  password?: string
}): string {
  const scheme = args.scheme || 'http'
  return `${scheme}://${args.host}:${args.port}:${args.username || ''}:${args.password || ''}`
}
