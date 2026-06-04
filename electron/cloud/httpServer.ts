import http from 'node:http'
import type { AddressInfo } from 'node:net'
import type { CloudService } from './service'
import type { CloudRoleDraft, CloudSyncDirection, CloudUserDraft } from '../types'

type JsonResponse = {
  status: number
  body: unknown
}

async function readBody(request: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  const raw = Buffer.concat(chunks).toString('utf8')
  if (!raw) return {}
  return JSON.parse(raw) as unknown
}

function tokenFrom(request: http.IncomingMessage): string | undefined {
  const header = request.headers.authorization
  if (!header?.startsWith('Bearer ')) return undefined
  return header.slice('Bearer '.length)
}

function stringField(body: unknown, key: string): string {
  if (!body || typeof body !== 'object') return ''
  const value = (body as Record<string, unknown>)[key]
  return typeof value === 'string' ? value : ''
}

function directionField(body: unknown): CloudSyncDirection {
  const value = stringField(body, 'direction')
  if (value === 'upload' || value === 'download' || value === 'bidirectional') return value
  return 'bidirectional'
}

function userDraft(body: unknown): CloudUserDraft {
  const record = body && typeof body === 'object' ? body as Record<string, unknown> : {}
  return {
    id: typeof record.id === 'string' ? record.id : undefined,
    username: typeof record.username === 'string' ? record.username : '',
    displayName: typeof record.displayName === 'string' ? record.displayName : '',
    password: typeof record.password === 'string' ? record.password : undefined,
    status: record.status === 'disabled' ? 'disabled' : 'active',
    roleIds: Array.isArray(record.roleIds) ? record.roleIds.filter((item): item is string => typeof item === 'string') : []
  }
}

function roleDraft(body: unknown): CloudRoleDraft {
  const record = body && typeof body === 'object' ? body as Record<string, unknown> : {}
  return {
    id: typeof record.id === 'string' ? record.id : undefined,
    name: typeof record.name === 'string' ? record.name : '',
    description: typeof record.description === 'string' ? record.description : undefined,
    permissionIds: Array.isArray(record.permissionIds)
      ? record.permissionIds.filter((item): item is string => typeof item === 'string')
      : []
  }
}

export class CloudHttpServer {
  private readonly service: CloudService
  private server?: http.Server

  constructor(service: CloudService) {
    this.service = service
  }

  async listen(port: number, host = '127.0.0.1'): Promise<number> {
    if (this.server) {
      const address = this.server.address() as AddressInfo
      return address.port
    }
    this.server = http.createServer((request, response) => {
      void this.handle(request, response)
    })
    await new Promise<void>((resolve) => {
      this.server?.listen(port, host, () => resolve())
    })
    const address = this.server.address() as AddressInfo
    return address.port
  }

  async close(): Promise<void> {
    if (!this.server) return
    await new Promise<void>((resolve) => this.server?.close(() => resolve()))
    this.server = undefined
  }

  private async handle(request: http.IncomingMessage, response: http.ServerResponse): Promise<void> {
    try {
      const result = await this.route(request)
      response.writeHead(result.status, { 'content-type': 'application/json; charset=utf-8' })
      response.end(JSON.stringify(result.body))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const status = /permission|login|required|expired|disabled/i.test(message) ? 403 : 500
      response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
      response.end(JSON.stringify({ ok: false, error: { message } }))
    }
  }

  private async route(request: http.IncomingMessage): Promise<JsonResponse> {
    const url = new URL(request.url || '/', 'http://127.0.0.1')
    const method = request.method || 'GET'
    const token = tokenFrom(request)
    const body = method === 'POST' || method === 'PUT' ? await readBody(request) : {}

    if (method === 'POST' && url.pathname === '/auth/login') {
      return {
        status: 200,
        body: this.service.login({
          username: stringField(body, 'username'),
          password: stringField(body, 'password'),
          deviceId: stringField(body, 'deviceId')
        })
      }
    }
    if (method === 'POST' && url.pathname === '/auth/logout') {
      this.service.logout(token || '')
      return { status: 200, body: { ok: true } }
    }
    if (method === 'GET' && url.pathname === '/auth/session') {
      return { status: 200, body: { ok: true, session: this.service.getSession(token) } }
    }
    if (method === 'POST' && url.pathname === '/sync') {
      return { status: 200, body: this.service.syncNow(token, directionField(body)) }
    }
    if (method === 'GET' && url.pathname === '/admin/users') {
      return { status: 200, body: { ok: true, users: this.service.listUsers(token) } }
    }
    if (method === 'POST' && url.pathname === '/admin/users') {
      return { status: 200, body: { ok: true, user: this.service.saveUser(token, userDraft(body)) } }
    }
    if (method === 'GET' && url.pathname === '/admin/roles') {
      return { status: 200, body: { ok: true, roles: this.service.listRoles(token) } }
    }
    if (method === 'POST' && url.pathname === '/admin/roles') {
      return { status: 200, body: { ok: true, role: this.service.saveRole(token, roleDraft(body)) } }
    }
    if (method === 'GET' && url.pathname === '/admin/permissions') {
      return { status: 200, body: { ok: true, permissions: this.service.listPermissions(token) } }
    }
    if (method === 'GET' && url.pathname.startsWith('/admin/assets/')) {
      const userId = decodeURIComponent(url.pathname.slice('/admin/assets/'.length))
      return { status: 200, body: { ok: true, assets: this.service.getUserAssets(token, userId) } }
    }
    return { status: 404, body: { ok: false, error: { message: 'Not found' } } }
  }
}
