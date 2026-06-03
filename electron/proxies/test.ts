/**
 * 代理探活 + 地理信息检测。
 *
 * 这是从老 [electron/proxyTest.ts](../proxyTest.ts) 迁移来的,核心 CONNECT 探活流程不变;
 * 增量:
 *   1. 接口对齐 Proxy 类型(scheme 字段也得带,虽然 CONNECT 只对 http/https 代理直接有效;
 *      socks5/socks4 代理走真实 SOCKS 握手,避免认证失败被误判为可用)
 *   2. 测通后用同一代理通道访问 https://ipinfo.io/json 拿地理信息
 *
 * 设计选择:
 * - 不引入 socks-proxy-agent。SOCKS 握手由 socksTunnel.ts 手写,HTTP/HTTPS 仍走原有裸
 *   socket + CONNECT 流程。
 */
import net from 'node:net'
import tls from 'node:tls'
import type { Proxy, ProxyTestSnapshot, ProxyScheme } from './schema'
import { openSocksConnection, type SocksProxyConfig } from './socksTunnel'

const DEFAULT_TARGET_HOST = 'www.gstatic.com'
const DEFAULT_TARGET_PORT = 443
const CONNECT_TIMEOUT_MS = 5000
const GEO_TIMEOUT_MS = 7000

function probeViaConnect(scheme: ProxyScheme, host: string, port: number, username?: string, password?: string): Promise<{ ok: true; latencyMs: number } | { ok: false; code: ProxyTestSnapshot['code']; message: string }> {
  if (scheme === 'socks5' || scheme === 'socks4') {
    return probeViaSocks(scheme, host, port, username, password)
  }
  return new Promise((resolve) => {
    let settled = false
    const startedAt = Date.now()
    const finish = (result: { ok: true; latencyMs: number } | { ok: false; code: ProxyTestSnapshot['code']; message: string }) => {
      if (settled) return
      settled = true
      try { socket.destroy() } catch { /* noop */ }
      resolve(result)
    }
    const socket = net.connect({ host, port })
    socket.setTimeout(CONNECT_TIMEOUT_MS)
    socket.on('timeout', () => finish({ ok: false, code: 'TIMEOUT', message: `No response from proxy within ${CONNECT_TIMEOUT_MS}ms.` }))
    socket.on('error', (err: NodeJS.ErrnoException) => {
      const code: ProxyTestSnapshot['code'] = err.code === 'ECONNREFUSED' ? 'REFUSED'
        : err.code === 'ENOTFOUND' ? 'BAD_HOST'
        : 'UNKNOWN'
      finish({ ok: false, code, message: `${err.code ?? 'ERROR'}: ${err.message}` })
    })

    socket.once('connect', () => {
      const lines: string[] = [
        `CONNECT ${DEFAULT_TARGET_HOST}:${DEFAULT_TARGET_PORT} HTTP/1.1`,
        `Host: ${DEFAULT_TARGET_HOST}:${DEFAULT_TARGET_PORT}`,
        'User-Agent: auto-registry/proxy-test',
        'Proxy-Connection: close'
      ]
      if (username && password) {
        const token = Buffer.from(`${username}:${password}`).toString('base64')
        lines.push(`Proxy-Authorization: Basic ${token}`)
      }
      socket.write(lines.join('\r\n') + '\r\n\r\n')
    })

    let buffer = ''
    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8')
      const headerEnd = buffer.indexOf('\r\n\r\n')
      if (headerEnd === -1) return
      const header = buffer.slice(0, headerEnd)
      const firstLine = header.split('\r\n', 1)[0] ?? ''
      const statusMatch = /^HTTP\/[0-9.]+\s+(\d{3})\s+(.*)$/.exec(firstLine)
      if (!statusMatch) {
        finish({ ok: false, code: 'BAD_RESPONSE', message: `Unexpected response: ${firstLine.slice(0, 120)}` })
        return
      }
      const status = Number(statusMatch[1])
      if (status === 200) {
        finish({ ok: true, latencyMs: Date.now() - startedAt })
        return
      }
      if (status === 407) {
        finish({ ok: false, code: 'AUTH', message: 'Proxy authentication failed (HTTP 407).' })
        return
      }
      finish({ ok: false, code: 'BAD_RESPONSE', message: `Proxy returned HTTP ${status}: ${statusMatch[2]?.trim() || 'unknown'}` })
    })
    socket.on('end', () => {
      if (!settled) finish({ ok: false, code: 'BAD_RESPONSE', message: 'Proxy closed the connection before responding.' })
    })
  })
}

async function probeViaSocks(scheme: Extract<ProxyScheme, 'socks5' | 'socks4'>, host: string, port: number, username?: string, password?: string): Promise<{ ok: true; latencyMs: number } | { ok: false; code: ProxyTestSnapshot['code']; message: string }> {
  const startedAt = Date.now()
  try {
    const socket = await openSocksConnection({ scheme, host, port, username, password }, {
      host: DEFAULT_TARGET_HOST,
      port: DEFAULT_TARGET_PORT
    })
    socket.destroy()
    return { ok: true, latencyMs: Date.now() - startedAt }
  } catch (error) {
    return normalizeSocksError(error)
  }
}

function normalizeSocksError(error: unknown): { ok: false; code: ProxyTestSnapshot['code']; message: string } {
  const message = error instanceof Error ? error.message : String(error)
  const code = /auth/i.test(message) ? 'AUTH'
    : /within \d+ms|timeout/i.test(message) ? 'TIMEOUT'
    : /ECONNREFUSED|connection refused/i.test(message) ? 'REFUSED'
    : /ENOTFOUND|EAI_AGAIN|getaddrinfo|Invalid IPv6/i.test(message) ? 'BAD_HOST'
    : /SOCKS[45]/i.test(message) ? 'BAD_RESPONSE'
    : 'UNKNOWN'
  return { ok: false, code, message }
}

/**
 * 通过代理通道访问 ipinfo.io 拿地理信息。
 *
 * 实现策略:走标准 HTTP CONNECT + 手写 GET 请求,避免引入 https-proxy-agent 这个新依赖。
 * 流程:
 *   1. TCP 连到代理
 *   2. CONNECT ipinfo.io:443
 *   3. TLS 升级
 *   4. HTTP/1.1 GET /json
 *   5. 解析 JSON body
 *
 * 失败/超时返回 undefined(不算致命),latencyMs 仍保留。
 */
async function probeGeo(scheme: ProxyScheme, host: string, port: number, username?: string, password?: string): Promise<ProxyTestSnapshot['geo'] | undefined> {
  const connect = scheme === 'socks5' || scheme === 'socks4'
    ? () => openSocksConnection(
      { scheme, host, port, username, password } satisfies SocksProxyConfig,
      { host: 'ipinfo.io', port: 443 }
    )
    : () => openHttpConnectTunnel(host, port, username, password, { host: 'ipinfo.io', port: 443 })
  return probeGeoViaSocket(connect)
}

function openHttpConnectTunnel(host: string, port: number, username: string | undefined, password: string | undefined, target: { host: string; port: number }): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    let settled = false
    const socket = net.connect({ host, port })
    const finish = (result: { ok: true } | { ok: false; error: Error }) => {
      if (settled) return
      settled = true
      socket.setTimeout(0)
      socket.off('data', onData)
      if (result.ok) resolve(socket)
      else {
        socket.destroy()
        reject(result.error)
      }
    }
    const fail = (error: Error) => finish({ ok: false, error })
    socket.setTimeout(GEO_TIMEOUT_MS)
    socket.on('timeout', () => fail(new Error(`No response from proxy within ${GEO_TIMEOUT_MS}ms.`)))
    socket.on('error', fail)
    socket.once('connect', () => {
      const lines: string[] = [
        `CONNECT ${target.host}:${target.port} HTTP/1.1`,
        `Host: ${target.host}:${target.port}`,
        'User-Agent: auto-registry/proxy-test',
        'Proxy-Connection: keep-alive'
      ]
      if (username && password) {
        const token = Buffer.from(`${username}:${password}`).toString('base64')
        lines.push(`Proxy-Authorization: Basic ${token}`)
      }
      socket.write(lines.join('\r\n') + '\r\n\r\n')
    })

    let buffer = ''
    const onData = (chunk: Buffer) => {
      buffer += chunk.toString('utf8')
      const headerEnd = buffer.indexOf('\r\n\r\n')
      if (headerEnd === -1) return
      const firstLine = buffer.slice(0, headerEnd).split('\r\n', 1)[0] ?? ''
      const statusMatch = /^HTTP\/[0-9.]+\s+(\d{3})/.exec(firstLine)
      if (statusMatch?.[1] === '200') {
        finish({ ok: true })
        return
      }
      fail(new Error(`Proxy CONNECT failed: ${firstLine || 'empty response'}`))
    }
    socket.on('data', onData)
  })
}

function probeGeoViaSocket(connect: () => Promise<net.Socket>): Promise<ProxyTestSnapshot['geo'] | undefined> {
  let socket: net.Socket | undefined
  return new Promise((resolve) => {
    let settled = false
    const finish = (geo: ProxyTestSnapshot['geo'] | undefined) => {
      if (settled) return
      settled = true
      try { socket?.destroy() } catch {}
      resolve(geo)
    }
    connect().then((connectedSocket) => {
      socket = connectedSocket
      const tlsSocket = tls.connect({
        socket,
        servername: 'ipinfo.io'
      })
      tlsSocket.setTimeout(GEO_TIMEOUT_MS)
      let httpBuf = ''
      const finishTls = (geo: ProxyTestSnapshot['geo'] | undefined) => {
        try { tlsSocket.destroy() } catch {}
        finish(geo)
      }
      tlsSocket.on('timeout', () => finishTls(undefined))
      tlsSocket.on('error', () => finishTls(undefined))
      tlsSocket.once('secureConnect', () => {
        const req = [
          'GET /json HTTP/1.1',
          'Host: ipinfo.io',
          'User-Agent: auto-registry/proxy-test',
          'Accept: application/json',
          'Connection: close',
          '', ''
        ].join('\r\n')
        tlsSocket.write(req)
      })
      tlsSocket.on('data', (data) => {
        httpBuf += data.toString('utf8')
      })
      tlsSocket.on('end', () => {
        const headerEnd = httpBuf.indexOf('\r\n\r\n')
        if (headerEnd === -1) return finishTls(undefined)
        const body = httpBuf.slice(headerEnd + 4)
        const cleaned = body.replace(/^[0-9a-f]+\r\n/i, '').replace(/\r\n0\r\n\r\n$/i, '')
        try {
          const parsed = JSON.parse(cleaned)
          finishTls({
            ip: String(parsed.ip || ''),
            country: parsed.country ? String(parsed.country) : undefined,
            region: parsed.region ? String(parsed.region) : undefined,
            city: parsed.city ? String(parsed.city) : undefined,
            org: parsed.org ? String(parsed.org) : undefined,
            asn: parsed.asn?.asn || parsed.org?.match?.(/^(AS\d+)/i)?.[1] || undefined
          })
        } catch {
          finishTls(undefined)
        }
      })
    }).catch(() => finish(undefined))
  })
}

export interface TestProxyOptions {
  /** 是否同时拉 geo;默认 true */
  includeGeo?: boolean
}

/**
 * 完整探活流程:CONNECT 通 → 取 geo → 组装 snapshot。
 * Always returns a snapshot 即使失败也带时间戳,UI 可以用"上次测试 X 秒前"展示。
 */
export async function testProxy(proxy: Pick<Proxy, 'scheme' | 'host' | 'port' | 'username' | 'password'>, options: TestProxyOptions = {}): Promise<ProxyTestSnapshot> {
  const at = Date.now()
  if (!proxy.host?.trim()) {
    return { at, ok: false, code: 'BAD_HOST', message: 'Proxy host is empty.' }
  }
  if (!Number.isInteger(proxy.port) || proxy.port <= 0 || proxy.port > 65535) {
    return { at, ok: false, code: 'BAD_HOST', message: `Invalid proxy port: ${proxy.port}.` }
  }

  const probe = await probeViaConnect(proxy.scheme, proxy.host.trim(), proxy.port, proxy.username, proxy.password)
  if (!probe.ok) {
    return { at, ok: false, code: probe.code, message: probe.message }
  }

  let geo: ProxyTestSnapshot['geo'] | undefined
  if (options.includeGeo !== false) {
    try {
      geo = await probeGeo(proxy.scheme, proxy.host.trim(), proxy.port, proxy.username, proxy.password)
    } catch {
      geo = undefined
    }
  }
  return { at, ok: true, latencyMs: probe.latencyMs, geo }
}
