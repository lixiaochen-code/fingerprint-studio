/**
 * 批量代理字符串解析器。
 *
 * 用户从 cliproxy / Bright Data / 自建出口拿到的代理列表,常见格式五花八门 ——
 * 这个解析器把每行尝试映射到 ProxyDraft,识别失败的行不丢,而是带原因抛回 UI 让用户修正。
 *
 * 支持的模板(按优先级匹配,先匹配上的优先):
 *   1. `<scheme>://<user>:<pass>@<host>:<port>`   socks5://alice:s3cret@1.2.3.4:1080
 *   2. `<scheme>://<host>:<port>`                 http://1.2.3.4:7890
 *   3. `<user>:<pass>@<host>:<port>`              alice:s3cret@1.2.3.4:1080
 *   4. `<host>:<port>:<user>:<pass>`              1.2.3.4:1080:alice:s3cret
 *   5. `<host>:<port>`                            1.2.3.4:7890
 *
 * 不识别的 scheme(如 https-proxy / shadowsocks)报错,不静默回退到 http,避免用户被坑。
 */
import type { ParseProxyLineResult, ProxyDraft, ProxyScheme } from './schema'

const VALID_SCHEMES: readonly ProxyScheme[] = ['http', 'https', 'socks5', 'socks4']

function isValidPort(port: number): boolean {
  return Number.isInteger(port) && port > 0 && port <= 65535
}

function isValidHost(host: string): boolean {
  // 简单校验,放过 ip/域名,挡掉空白和明显非法字符
  // chrome.proxy.settings 不挑剔具体 host 格式,DNS 会去解;这里只挡空和明显坏字符
  return host.length > 0 && !/\s/.test(host) && !/[/?#@]/.test(host)
}

function parseScheme(raw: string): ProxyScheme | { error: string } {
  const lower = raw.toLowerCase()
  if ((VALID_SCHEMES as readonly string[]).includes(lower)) return lower as ProxyScheme
  return { error: `Unsupported scheme "${raw}". Use http / https / socks5 / socks4.` }
}

function buildDraft(
  scheme: ProxyScheme,
  host: string,
  portStr: string,
  username?: string,
  password?: string
): ProxyDraft | { error: string } {
  if (!isValidHost(host)) return { error: `Invalid host "${host}".` }
  const port = Number(portStr)
  if (!isValidPort(port)) return { error: `Invalid port "${portStr}".` }
  return {
    scheme,
    host,
    port,
    username: username || undefined,
    password: password || undefined
  }
}

/**
 * 解析单行。空行/纯注释行(以 # 开头)返回 ok=true 但 draft 为 null —— 调用方应跳过这种空载结果。
 * 这里把 null draft 用一个特殊 reason 标记,调用方 filter 掉。
 */
export function parseProxyLine(rawLine: string): ParseProxyLineResult | null {
  const line = rawLine.trim()
  if (!line || line.startsWith('#')) return null

  // 模板 1: <scheme>://<user>:<pass>@<host>:<port>
  // 模板 2: <scheme>://<host>:<port>
  const schemeMatch = line.match(/^([a-z][a-z0-9+.-]*):\/\/(.+)$/i)
  if (schemeMatch) {
    const schemeOrErr = parseScheme(schemeMatch[1])
    if (typeof schemeOrErr === 'object') return { ok: false, line, reason: schemeOrErr.error }
    const rest = schemeMatch[2]
    const atIdx = rest.lastIndexOf('@')
    if (atIdx !== -1) {
      // user:pass@host:port
      const auth = rest.slice(0, atIdx)
      const hostPort = rest.slice(atIdx + 1)
      const colon = auth.indexOf(':')
      if (colon === -1) return { ok: false, line, reason: 'Auth segment must be "user:pass".' }
      const username = auth.slice(0, colon)
      const password = auth.slice(colon + 1)
      const parts = hostPort.split(':')
      if (parts.length !== 2) return { ok: false, line, reason: 'host:port malformed in scheme URL.' }
      const draft = buildDraft(schemeOrErr, parts[0], parts[1], username, password)
      if ('error' in draft) return { ok: false, line, reason: draft.error }
      return { ok: true, line, draft }
    }
    // 无 auth: scheme://host:port
    const parts = rest.split(':')
    if (parts.length !== 2) return { ok: false, line, reason: 'Expected host:port after scheme.' }
    const draft = buildDraft(schemeOrErr, parts[0], parts[1])
    if ('error' in draft) return { ok: false, line, reason: draft.error }
    return { ok: true, line, draft }
  }

  // 模板 3: user:pass@host:port
  const atIdx = line.lastIndexOf('@')
  if (atIdx !== -1) {
    const auth = line.slice(0, atIdx)
    const hostPort = line.slice(atIdx + 1)
    const colon = auth.indexOf(':')
    if (colon === -1) return { ok: false, line, reason: 'Auth segment must be "user:pass".' }
    const username = auth.slice(0, colon)
    const password = auth.slice(colon + 1)
    const parts = hostPort.split(':')
    if (parts.length !== 2) return { ok: false, line, reason: 'host:port malformed.' }
    const draft = buildDraft('http', parts[0], parts[1], username, password)
    if ('error' in draft) return { ok: false, line, reason: draft.error }
    return { ok: true, line, draft }
  }

  // 模板 4: host:port:user:pass
  // 模板 5: host:port
  const parts = line.split(':')
  if (parts.length === 2) {
    const draft = buildDraft('http', parts[0], parts[1])
    if ('error' in draft) return { ok: false, line, reason: draft.error }
    return { ok: true, line, draft }
  }
  if (parts.length === 4) {
    const draft = buildDraft('http', parts[0], parts[1], parts[2], parts[3])
    if ('error' in draft) return { ok: false, line, reason: draft.error }
    return { ok: true, line, draft }
  }
  return { ok: false, line, reason: 'Unrecognized format. Expected host:port, host:port:user:pass, user:pass@host:port, or scheme://...' }
}

/**
 * 批量解析多行文本。返回成功条目 + 失败条目,失败不阻塞 —— 让用户在 UI 里看到逐行情况后再决定。
 */
export function parseProxyBatch(text: string): {
  ok: Array<{ line: string; draft: ProxyDraft }>
  failed: Array<{ line: string; reason: string }>
} {
  const ok: Array<{ line: string; draft: ProxyDraft }> = []
  const failed: Array<{ line: string; reason: string }> = []
  for (const rawLine of text.split(/\r?\n/)) {
    const result = parseProxyLine(rawLine)
    if (!result) continue // 空行 / 注释
    if (result.ok) ok.push({ line: result.line, draft: result.draft })
    else failed.push({ line: result.line, reason: result.reason })
  }
  return { ok, failed }
}
