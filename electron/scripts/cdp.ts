import fs from 'node:fs'
import path from 'node:path'

/**
 * Chromium 在 `--remote-debugging-port=0` 模式下，会在 user-data-dir 根目录写一个
 * DevToolsActivePort 文件，首行是真正的 TCP 端口，第二行是 browser-level 的 WS path。
 * 该文件在浏览器完全就绪前不存在；浏览器退出后 Chromium 会主动清掉，所以我们也把
 * "文件不存在"理解为"不可用"。
 */

export interface CdpEndpoint {
  port: number
  /** 形如 /devtools/browser/<uuid>，用于 puppeteer.connect 的 browserWSEndpoint */
  browserWsPath: string
  /** ws://127.0.0.1:<port><browserWsPath>，方便直接传给 puppeteer.connect */
  webSocketDebuggerUrl: string
}

const DEVTOOLS_PORT_FILE = 'DevToolsActivePort'

/**
 * 解析 Chromium 写入的 DevToolsActivePort 文件内容。
 * 文件可能在 Chromium 写入过程中被读到半行，这里对格式做严格校验。
 */
function parseDevToolsActivePort(raw: string): CdpEndpoint | null {
  const lines = raw.split('\n').map((line) => line.trim()).filter(Boolean)
  if (lines.length < 2) return null

  const port = Number(lines[0])
  const browserWsPath = lines[1]
  if (!Number.isInteger(port) || port <= 0 || port > 65535) return null
  if (!browserWsPath.startsWith('/devtools/')) return null

  return {
    port,
    browserWsPath,
    webSocketDebuggerUrl: `ws://127.0.0.1:${port}${browserWsPath}`
  }
}

export function readDevToolsEndpoint(profilePath: string): CdpEndpoint | null {
  const filePath = path.join(profilePath, DEVTOOLS_PORT_FILE)
  if (!fs.existsSync(filePath)) return null
  try {
    const raw = fs.readFileSync(filePath, 'utf8')
    return parseDevToolsActivePort(raw)
  } catch {
    return null
  }
}

export interface WaitForDevToolsOptions {
  /** 最多等待多久；默认 15s，足够覆盖冷启动 + 扩展加载 */
  timeoutMs?: number
  /** 轮询间隔；默认 100ms */
  intervalMs?: number
  /** 主动取消等待 */
  signal?: AbortSignal
}

/**
 * 轮询读取 DevToolsActivePort，直到拿到可用 endpoint 或超时。
 * 我们不监听文件系统事件（fs.watch 在不同平台行为差异太大，尤其是 Windows），
 * 小间隔轮询在这个场景下更可靠，代价可忽略。
 */
export async function waitForDevToolsEndpoint(
  profilePath: string,
  options: WaitForDevToolsOptions = {}
): Promise<CdpEndpoint> {
  const timeoutMs = options.timeoutMs ?? 15_000
  const intervalMs = options.intervalMs ?? 100
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    if (options.signal?.aborted) {
      throw new Error('waitForDevToolsEndpoint aborted')
    }
    const endpoint = readDevToolsEndpoint(profilePath)
    if (endpoint) return endpoint
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }

  throw new Error(
    `Timed out after ${timeoutMs}ms waiting for DevToolsActivePort in ${profilePath}`
  )
}
