#!/usr/bin/env node
import net from 'node:net'

import { SocksTunnelManager } from '../dist-electron/proxies/socksTunnel.js'

function readExact(socket, size) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let total = 0

    const cleanup = () => {
      socket.off('readable', onReadable)
      socket.off('error', onError)
      socket.off('close', onClose)
    }
    const drain = () => {
      while (total < size) {
        const chunk = socket.read(size - total)
        if (!chunk) return false
        chunks.push(chunk)
        total += chunk.length
      }
      return true
    }
    const onReadable = () => {
      if (!drain()) return
      cleanup()
      resolve(Buffer.concat(chunks, total))
    }
    const onError = (error) => {
      cleanup()
      reject(error)
    }
    const onClose = () => {
      if (total >= size) return
      cleanup()
      reject(new Error('socket closed before enough bytes were read'))
    }

    socket.on('readable', onReadable)
    socket.on('error', onError)
    socket.on('close', onClose)
    onReadable()
  })
}

function writeSocket(socket, buffer) {
  return new Promise((resolve, reject) => {
    socket.write(buffer, (error) => {
      if (error) reject(error)
      else resolve()
    })
  })
}

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') throw new Error('server did not bind to TCP')
      resolve(address.port)
    })
  })
}

async function createEchoTarget() {
  const server = net.createServer((socket) => {
    socket.once('data', (chunk) => {
      socket.end(Buffer.from(`echo:${chunk.toString('utf8')}`))
    })
  })
  const port = await listen(server)
  return { server, port }
}

async function handleSocks5FixtureClient(socket, expected) {
  try {
    const greeting = await readExact(socket, 2)
    const methods = await readExact(socket, greeting[1])
    if (!methods.includes(2)) throw new Error('client did not offer username/password auth')
    await writeSocket(socket, Buffer.from([5, 2]))

    const authHead = await readExact(socket, 2)
    const username = (await readExact(socket, authHead[1])).toString('utf8')
    const passwordLength = (await readExact(socket, 1))[0]
    const password = (await readExact(socket, passwordLength)).toString('utf8')
    if (username !== expected.username || password !== expected.password) {
      await writeSocket(socket, Buffer.from([1, 1]))
      socket.destroy()
      return
    }
    await writeSocket(socket, Buffer.from([1, 0]))

    const request = await readExact(socket, 4)
    if (request[0] !== 5 || request[1] !== 1) throw new Error('client did not request SOCKS5 CONNECT')
    const host = await readSocks5Host(socket, request[3])
    const port = (await readExact(socket, 2)).readUInt16BE(0)
    const remote = net.connect({ host, port })
    remote.once('connect', async () => {
      await writeSocket(socket, Buffer.from([5, 0, 0, 1, 127, 0, 0, 1, 0, 0]))
      socket.pipe(remote)
      remote.pipe(socket)
    })
    remote.once('error', () => socket.destroy())
  } catch {
    socket.destroy()
  }
}

async function readSocks5Host(socket, addressType) {
  if (addressType === 1) {
    return [...await readExact(socket, 4)].join('.')
  }
  if (addressType === 3) {
    const length = (await readExact(socket, 1))[0]
    return (await readExact(socket, length)).toString('utf8')
  }
  throw new Error(`unsupported fixture address type ${addressType}`)
}

async function createAuthenticatedSocks5Fixture(credentials) {
  const server = net.createServer((socket) => {
    void handleSocks5FixtureClient(socket, credentials)
  })
  const port = await listen(server)
  return { server, port }
}

async function connectThroughLocalTunnel(localPort, targetPort) {
  const client = net.connect({ host: '127.0.0.1', port: localPort })
  await new Promise((resolve, reject) => {
    client.once('connect', resolve)
    client.once('error', reject)
  })

  await writeSocket(client, Buffer.from([5, 1, 0]))
  const selected = await readExact(client, 2)
  if (selected[0] !== 5 || selected[1] !== 0) {
    throw new Error('local tunnel rejected no-auth SOCKS5')
  }

  const host = Buffer.from('127.0.0.1')
  const port = Buffer.alloc(2)
  port.writeUInt16BE(targetPort, 0)
  await writeSocket(client, Buffer.concat([Buffer.from([5, 1, 0, 3, host.length]), host, port]))
  const reply = await readExact(client, 10)
  if (reply[0] !== 5 || reply[1] !== 0) {
    throw new Error(`local tunnel CONNECT failed with code ${reply[1]}`)
  }

  await writeSocket(client, Buffer.from('hello'))
  const data = await new Promise((resolve, reject) => {
    client.once('data', resolve)
    client.once('error', reject)
  })
  client.destroy()
  return data.toString('utf8')
}

async function main() {
  const credentials = { username: 'alice', password: 'secret' }
  const target = await createEchoTarget()
  const upstream = await createAuthenticatedSocks5Fixture(credentials)
  const manager = new SocksTunnelManager()

  try {
    const proxyUrl = await manager.ensure('fixture', {
      scheme: 'socks5',
      host: '127.0.0.1',
      port: upstream.port,
      username: credentials.username,
      password: credentials.password
    })
    const localPort = Number(proxyUrl.split(':').pop())
    const response = await connectThroughLocalTunnel(localPort, target.port)
    if (response !== 'echo:hello') throw new Error(`unexpected tunnel response: ${response}`)
    console.log('local SOCKS tunnel fixture pass')
  } finally {
    await manager.closeAll()
    await new Promise((resolve) => upstream.server.close(resolve))
    await new Promise((resolve) => target.server.close(resolve))
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
