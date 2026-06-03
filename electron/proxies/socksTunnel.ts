import net from 'node:net'

import type { ProxyScheme } from './schema'

export type SocksProxyConfig = {
  scheme: Extract<ProxyScheme, 'socks5' | 'socks4'>
  host: string
  port: number
  username?: string
  password?: string
}

export type SocksTarget = {
  host: string
  port: number
}

const HANDSHAKE_TIMEOUT_MS = 8000

function writeSocket(socket: net.Socket, data: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.write(data, (error) => {
      if (error) reject(error)
      else resolve()
    })
  })
}

function readExact(socket: net.Socket, size: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let total = 0

    const cleanup = () => {
      socket.off('readable', onReadable)
      socket.off('error', onError)
      socket.off('end', onEnd)
      socket.off('close', onClose)
    }
    const drain = () => {
      while (total < size) {
        const chunk = socket.read(size - total) as Buffer | null
        if (!chunk) return false
        chunks.push(chunk)
        total += chunk.length
      }
      return true
    }
    const finishIfReady = () => {
      if (!drain()) return
      cleanup()
      resolve(Buffer.concat(chunks, total))
    }
    const onReadable = () => finishIfReady()
    const onError = (error: Error) => {
      cleanup()
      reject(error)
    }
    const onEnd = () => {
      cleanup()
      reject(new Error('SOCKS proxy closed the connection during handshake.'))
    }
    const onClose = () => {
      if (total >= size) return
      cleanup()
      reject(new Error('SOCKS proxy connection closed during handshake.'))
    }

    socket.on('readable', onReadable)
    socket.on('error', onError)
    socket.on('end', onEnd)
    socket.on('close', onClose)
    finishIfReady()
  })
}

function encodeSocks5Host(host: string): Buffer {
  const ipv4 = net.isIP(host) === 4
  if (ipv4) {
    return Buffer.concat([Buffer.from([0x01]), Buffer.from(host.split('.').map((part) => Number(part)))])
  }

  const ipv6 = net.isIP(host) === 6
  if (ipv6) {
    const address = normalizeIpv6(host)
    return Buffer.concat([Buffer.from([0x04]), address])
  }

  const hostBytes = Buffer.from(host, 'utf8')
  if (hostBytes.length > 255) {
    throw new Error('SOCKS5 target host is too long.')
  }
  return Buffer.concat([Buffer.from([0x03, hostBytes.length]), hostBytes])
}

function normalizeIpv6(host: string): Buffer {
  const pieces = host.split('::')
  if (pieces.length > 2) throw new Error(`Invalid IPv6 address: ${host}`)
  const head = pieces[0] ? pieces[0].split(':') : []
  const tail = pieces[1] ? pieces[1].split(':') : []
  const fill = new Array(8 - head.length - tail.length).fill('0')
  const parts = [...head, ...fill, ...tail]
  if (parts.length !== 8) throw new Error(`Invalid IPv6 address: ${host}`)
  const bytes = Buffer.alloc(16)
  parts.forEach((part, index) => {
    bytes.writeUInt16BE(parseInt(part || '0', 16), index * 2)
  })
  return bytes
}

function encodePort(port: number): Buffer {
  const out = Buffer.alloc(2)
  out.writeUInt16BE(port, 0)
  return out
}

function socks5ReplyMessage(code: number): string {
  switch (code) {
    case 0x01: return 'general SOCKS server failure'
    case 0x02: return 'connection not allowed by ruleset'
    case 0x03: return 'network unreachable'
    case 0x04: return 'host unreachable'
    case 0x05: return 'connection refused'
    case 0x06: return 'TTL expired'
    case 0x07: return 'command not supported'
    case 0x08: return 'address type not supported'
    default: return `unknown SOCKS5 reply ${code}`
  }
}

async function authenticateSocks5(socket: net.Socket, proxy: SocksProxyConfig): Promise<void> {
  const methods = proxy.username && proxy.password
    ? Buffer.from([0x00, 0x02])
    : Buffer.from([0x00])
  await writeSocket(socket, Buffer.concat([Buffer.from([0x05, methods.length]), methods]))
  const selection = await readExact(socket, 2)
  if (selection[0] !== 0x05) {
    if (selection[0] === 0x48 && selection[1] === 0x54) {
      throw new Error('SOCKS5 proxy returned an HTTP response instead of a SOCKS greeting. Check the proxy scheme, credentials, whitelist, or session expiry.')
    }
    throw new Error('SOCKS5 proxy returned an invalid greeting.')
  }
  if (selection[1] === 0xff) {
    throw new Error('SOCKS5 proxy did not accept any supported authentication method.')
  }
  if (selection[1] === 0x02) {
    if (!proxy.username || !proxy.password) {
      throw new Error('SOCKS5 proxy requires username/password authentication.')
    }
    const username = Buffer.from(proxy.username, 'utf8')
    const password = Buffer.from(proxy.password, 'utf8')
    if (username.length > 255 || password.length > 255) {
      throw new Error('SOCKS5 username/password is too long.')
    }
    await writeSocket(socket, Buffer.concat([
      Buffer.from([0x01, username.length]),
      username,
      Buffer.from([password.length]),
      password
    ]))
    const auth = await readExact(socket, 2)
    if (auth[0] !== 0x01 || auth[1] !== 0x00) {
      throw new Error('SOCKS5 proxy authentication failed.')
    }
    return
  }
  if (selection[1] !== 0x00) {
    throw new Error(`SOCKS5 proxy selected unsupported auth method ${selection[1]}.`)
  }
}

async function connectSocks5(socket: net.Socket, proxy: SocksProxyConfig, target: SocksTarget): Promise<void> {
  await authenticateSocks5(socket, proxy)
  await writeSocket(socket, Buffer.concat([
    Buffer.from([0x05, 0x01, 0x00]),
    encodeSocks5Host(target.host),
    encodePort(target.port)
  ]))

  const head = await readExact(socket, 4)
  if (head[0] !== 0x05) {
    throw new Error('SOCKS5 proxy returned an invalid connect response.')
  }
  if (head[1] !== 0x00) {
    throw new Error(`SOCKS5 connect failed: ${socks5ReplyMessage(head[1])}.`)
  }

  const addressLength = head[3] === 0x01 ? 4
    : head[3] === 0x04 ? 16
    : head[3] === 0x03 ? (await readExact(socket, 1))[0]
    : undefined
  if (addressLength === undefined) {
    throw new Error(`SOCKS5 proxy returned unsupported address type ${head[3]}.`)
  }
  await readExact(socket, addressLength + 2)
}

function encodeSocks4Host(host: string): Buffer {
  if (net.isIP(host) === 4) {
    return Buffer.from(host.split('.').map((part) => Number(part)))
  }
  return Buffer.from([0x00, 0x00, 0x00, 0x01])
}

async function connectSocks4(socket: net.Socket, proxy: SocksProxyConfig, target: SocksTarget): Promise<void> {
  const user = proxy.username ? Buffer.from(proxy.username, 'utf8') : Buffer.alloc(0)
  const isDomain = net.isIP(target.host) !== 4
  const domain = isDomain ? Buffer.from(target.host, 'utf8') : Buffer.alloc(0)
  await writeSocket(socket, Buffer.concat([
    Buffer.from([0x04, 0x01]),
    encodePort(target.port),
    encodeSocks4Host(target.host),
    user,
    Buffer.from([0x00]),
    domain,
    isDomain ? Buffer.from([0x00]) : Buffer.alloc(0)
  ]))

  const response = await readExact(socket, 8)
  if (response[1] !== 0x5a) {
    throw new Error(`SOCKS4 connect failed with status 0x${response[1].toString(16)}.`)
  }
}

export function openSocksConnection(proxy: SocksProxyConfig, target: SocksTarget): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host: proxy.host.trim(), port: proxy.port })
    const timeout = setTimeout(() => {
      socket.destroy()
      reject(new Error(`No response from SOCKS proxy within ${HANDSHAKE_TIMEOUT_MS}ms.`))
    }, HANDSHAKE_TIMEOUT_MS)

    const fail = (error: Error) => {
      clearTimeout(timeout)
      socket.destroy()
      reject(error)
    }

    socket.once('error', fail)
    socket.once('connect', () => {
      socket.off('error', fail)
      const connect = proxy.scheme === 'socks5'
        ? connectSocks5(socket, proxy, target)
        : connectSocks4(socket, proxy, target)
      connect.then(() => {
        clearTimeout(timeout)
        socket.setTimeout(0)
        resolve(socket)
      }).catch(fail)
    })
  })
}

type TunnelRecord = {
  server: net.Server
  sockets: Set<net.Socket>
  proxy: SocksProxyConfig
  localPort: number
}

export class SocksTunnelManager {
  private readonly records = new Map<string, TunnelRecord>()

  async ensure(profileId: string, proxy: SocksProxyConfig): Promise<string> {
    const existing = this.records.get(profileId)
    if (existing && sameProxy(existing.proxy, proxy)) {
      return `socks5://127.0.0.1:${existing.localPort}`
    }
    await this.close(profileId)

    const sockets = new Set<net.Socket>()
    const server = net.createServer((client) => {
      sockets.add(client)
      client.once('close', () => sockets.delete(client))
      void this.handleClient(client, proxy)
    })
    const record: TunnelRecord = { server, sockets, proxy, localPort: 0 }
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', () => {
        server.off('error', reject)
        const address = server.address()
        if (!address || typeof address === 'string') {
          reject(new Error('Failed to allocate local SOCKS tunnel port.'))
          return
        }
        record.localPort = address.port
        this.records.set(profileId, record)
        resolve()
      })
    })
    return `socks5://127.0.0.1:${record.localPort}`
  }

  async close(profileId: string): Promise<void> {
    const record = this.records.get(profileId)
    if (!record) return
    this.records.delete(profileId)
    for (const socket of record.sockets) {
      socket.destroy()
    }
    await new Promise<void>((resolve) => record.server.close(() => resolve()))
  }

  async closeAll(): Promise<void> {
    await Promise.all([...this.records.keys()].map((profileId) => this.close(profileId)))
  }

  private async handleClient(client: net.Socket, proxy: SocksProxyConfig): Promise<void> {
    let upstream: net.Socket | undefined
    try {
      const target = await acceptLocalSocks5(client)
      upstream = await openSocksConnection(proxy, target)
      await writeSocket(client, Buffer.from([0x05, 0x00, 0x00, 0x01, 127, 0, 0, 1, 0, 0]))
      client.pipe(upstream)
      upstream.pipe(client)
    } catch {
      try { await writeSocket(client, Buffer.from([0x05, 0x01, 0x00, 0x01, 0, 0, 0, 0, 0, 0])) } catch {}
      client.destroy()
      upstream?.destroy()
    }
  }
}

async function acceptLocalSocks5(client: net.Socket): Promise<SocksTarget> {
  const greeting = await readExact(client, 2)
  if (greeting[0] !== 0x05) throw new Error('Local client did not use SOCKS5.')
  const methods = await readExact(client, greeting[1])
  if (!methods.includes(0x00)) throw new Error('Local client does not support no-auth SOCKS5.')
  await writeSocket(client, Buffer.from([0x05, 0x00]))

  const head = await readExact(client, 4)
  if (head[0] !== 0x05 || head[1] !== 0x01) {
    await writeSocket(client, Buffer.from([0x05, 0x07, 0x00, 0x01, 0, 0, 0, 0, 0, 0]))
    throw new Error('Local SOCKS request was not CONNECT.')
  }
  const host = await readLocalSocksHost(client, head[3])
  const port = (await readExact(client, 2)).readUInt16BE(0)
  return { host, port }
}

async function readLocalSocksHost(client: net.Socket, addressType: number): Promise<string> {
  if (addressType === 0x01) {
    return [...await readExact(client, 4)].join('.')
  }
  if (addressType === 0x03) {
    const length = (await readExact(client, 1))[0]
    return (await readExact(client, length)).toString('utf8')
  }
  if (addressType === 0x04) {
    const bytes = await readExact(client, 16)
    const parts: string[] = []
    for (let index = 0; index < 16; index += 2) {
      parts.push(bytes.readUInt16BE(index).toString(16))
    }
    return parts.join(':')
  }
  throw new Error(`Unsupported local SOCKS address type ${addressType}.`)
}

function sameProxy(left: SocksProxyConfig, right: SocksProxyConfig): boolean {
  return left.scheme === right.scheme &&
    left.host === right.host &&
    left.port === right.port &&
    left.username === right.username &&
    left.password === right.password
}
