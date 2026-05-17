/**
 * 代理连通性检测。
 *
 * 不打开浏览器、不依赖任何外部库，直接走 HTTP 协议的 CONNECT 方法验证：
 *   1. TCP 连到代理服务器
 *   2. 发 `CONNECT www.gstatic.com:443 HTTP/1.1`，按需带 Proxy-Authorization
 *   3. 期望收到 `HTTP/1.1 200 Connection established`
 *
 * 选 `www.gstatic.com:443` 是因为：
 * - 全球可达；
 * - 不被 GFW 直接 RST，但**不**走代理时一般也无法直连（适合测代理是否真的在转发）；
 * - HTTPS 端口 443 是任何能用于浏览器的代理都必须放行的端口。
 *
 * 我们只做到 CONNECT 200 就返回成功，不再升级 TLS——加 TLS 握手反而会引入证书 / SNI
 * 问题，并不能更准确地判断"代理本身可用"。
 *
 * 所有错误都被本模块吞掉并归一化成 `{ ok:false, message }`，不抛——renderer 端拿到
 * 的永远是结构化的结果。
 */
import net from 'node:net'

import type { ProxyConfig } from './types'

export interface ProxyTestResult {
  ok: boolean
  /** 代理 CONNECT 200 到达的耗时（含 TCP 建连），ok=true 时存在 */
  latencyMs?: number
  /** 失败原因，ok=false 时存在；已本地化为人类可读的英文短句 */
  message?: string
  /** 失败时的细分类，便于 UI 展示不同 hint */
  code?: 'TIMEOUT' | 'REFUSED' | 'AUTH' | 'BAD_HOST' | 'BAD_RESPONSE' | 'UNKNOWN'
}

const DEFAULT_TARGET_HOST = 'www.gstatic.com'
const DEFAULT_TARGET_PORT = 443
/** 5 秒上限——代理慢于 5s 在浏览器场景里也基本不可用 */
const TIMEOUT_MS = 5000

export async function testProxy(proxy: ProxyConfig): Promise<ProxyTestResult> {
  if (!proxy.host?.trim()) {
    return { ok: false, code: 'BAD_HOST', message: 'Proxy host is empty.' }
  }
  if (!Number.isFinite(proxy.port) || proxy.port <= 0 || proxy.port > 65535) {
    return { ok: false, code: 'BAD_HOST', message: `Invalid proxy port: ${proxy.port}.` }
  }

  const startedAt = Date.now()
  return new Promise<ProxyTestResult>((resolve) => {
    let settled = false
    const finish = (result: ProxyTestResult) => {
      if (settled) return
      settled = true
      try { socket.destroy() } catch { /* noop */ }
      resolve(result)
    }

    const socket = net.connect({ host: proxy.host.trim(), port: proxy.port })
    socket.setTimeout(TIMEOUT_MS)

    const onTimeout = () => {
      finish({
        ok: false,
        code: 'TIMEOUT',
        message: `No response from proxy within ${TIMEOUT_MS}ms.`
      })
    }
    const onError = (err: NodeJS.ErrnoException) => {
      // ECONNREFUSED / EHOSTUNREACH / ENOTFOUND / EAI_AGAIN ...
      const code = err.code === 'ECONNREFUSED' ? 'REFUSED'
        : err.code === 'ENOTFOUND' ? 'BAD_HOST'
        : 'UNKNOWN'
      finish({ ok: false, code, message: `${err.code ?? 'ERROR'}: ${err.message}` })
    }

    socket.on('timeout', onTimeout)
    socket.on('error', onError)

    socket.once('connect', () => {
      const lines: string[] = [
        `CONNECT ${DEFAULT_TARGET_HOST}:${DEFAULT_TARGET_PORT} HTTP/1.1`,
        `Host: ${DEFAULT_TARGET_HOST}:${DEFAULT_TARGET_PORT}`,
        'User-Agent: auto-registry/proxy-test',
        'Proxy-Connection: close'
      ]
      if (proxy.username && proxy.password) {
        const token = Buffer.from(`${proxy.username}:${proxy.password}`).toString('base64')
        lines.push(`Proxy-Authorization: Basic ${token}`)
      }
      socket.write(lines.join('\r\n') + '\r\n\r\n')
    })

    let buffer = ''
    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8')
      // 头部完毕：碰到空行
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
      // 407 = Proxy Authentication Required
      if (status === 407) {
        finish({ ok: false, code: 'AUTH', message: `Proxy authentication failed (HTTP 407).` })
        return
      }
      finish({
        ok: false,
        code: 'BAD_RESPONSE',
        message: `Proxy returned HTTP ${status}: ${statusMatch[2]?.trim() || 'unknown'}`
      })
    })

    socket.on('end', () => {
      if (!settled) {
        finish({
          ok: false,
          code: 'BAD_RESPONSE',
          message: 'Proxy closed the connection before responding.'
        })
      }
    })
  })
}
