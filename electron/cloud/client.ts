import type {
  CloudAdminAssets,
  CloudLoginResult,
  CloudPermission,
  CloudRole,
  CloudRoleDraft,
  CloudSession,
  CloudSyncDirection,
  CloudSyncResult,
  CloudUser,
  CloudUserDraft,
  CloudWorkspaceSnapshot
} from '../types'

export type CloudWorkspaceAdapter = {
  readLocalWorkspace: (ownerUserId: string) => CloudWorkspaceSnapshot
  applyRemoteWorkspace: (snapshot: CloudWorkspaceSnapshot) => void
}

export type CloudBackend = {
  login: (input: { username: string; password: string; deviceId?: string }) => Promise<CloudLoginResult> | CloudLoginResult
  logout: (token: string) => Promise<void> | void
  getSession: (token?: string) => Promise<CloudSession | undefined> | CloudSession | undefined
  syncNow: (token: string | undefined, direction: CloudSyncDirection) => Promise<CloudSyncResult> | CloudSyncResult
  listUsers: (token: string | undefined) => Promise<CloudUser[]> | CloudUser[]
  saveUser: (token: string | undefined, draft: CloudUserDraft) => Promise<CloudUser> | CloudUser
  listRoles: (token: string | undefined) => Promise<CloudRole[]> | CloudRole[]
  saveRole: (token: string | undefined, draft: CloudRoleDraft) => Promise<CloudRole> | CloudRole
  listPermissions: (token: string | undefined) => Promise<CloudPermission[]> | CloudPermission[]
  getUserAssets: (token: string | undefined, userId: string) => Promise<CloudAdminAssets> | CloudAdminAssets
}

type ApiEnvelope<T> = { ok: true } & T

async function readJson<T>(response: Response): Promise<T> {
  const payload = await response.json() as unknown
  if (!response.ok) {
    const message = payload && typeof payload === 'object' && 'error' in payload
      ? String((payload as { error?: { message?: unknown } }).error?.message ?? response.statusText)
      : response.statusText
    throw new Error(message)
  }
  return payload as T
}

export class CloudRemoteClient implements CloudBackend {
  private readonly baseUrl: string
  private readonly adapter: CloudWorkspaceAdapter

  constructor(baseUrl: string, adapter: CloudWorkspaceAdapter) {
    this.baseUrl = baseUrl.replace(/\/+$/, '')
    this.adapter = adapter
  }

  login(input: { username: string; password: string; deviceId?: string }): Promise<CloudLoginResult> {
    return this.request<CloudLoginResult>('POST', '/auth/login', input)
  }

  async logout(token: string): Promise<void> {
    await this.request<{ ok: true }>('POST', '/auth/logout', {}, token)
  }

  async getSession(token?: string): Promise<CloudSession | undefined> {
    const payload = await this.request<ApiEnvelope<{ session?: CloudSession }>>('GET', '/auth/session', undefined, token)
    return payload.session
  }

  async syncNow(token: string | undefined, direction: CloudSyncDirection): Promise<CloudSyncResult> {
    if (direction === 'upload') return this.upload(token)
    if (direction === 'download') return this.download(token)
    const downloaded = await this.download(token)
    if (!downloaded.ok && downloaded.error.code !== 'NO_REMOTE_WORKSPACE') return downloaded
    return this.upload(token)
  }

  async listUsers(token: string | undefined): Promise<CloudUser[]> {
    const payload = await this.request<ApiEnvelope<{ users: CloudUser[] }>>('GET', '/admin/users', undefined, token)
    return payload.users
  }

  async saveUser(token: string | undefined, draft: CloudUserDraft): Promise<CloudUser> {
    const payload = await this.request<ApiEnvelope<{ user: CloudUser }>>('POST', '/admin/users', draft, token)
    return payload.user
  }

  async listRoles(token: string | undefined): Promise<CloudRole[]> {
    const payload = await this.request<ApiEnvelope<{ roles: CloudRole[] }>>('GET', '/admin/roles', undefined, token)
    return payload.roles
  }

  async saveRole(token: string | undefined, draft: CloudRoleDraft): Promise<CloudRole> {
    const payload = await this.request<ApiEnvelope<{ role: CloudRole }>>('POST', '/admin/roles', draft, token)
    return payload.role
  }

  async listPermissions(token: string | undefined): Promise<CloudPermission[]> {
    const payload = await this.request<ApiEnvelope<{ permissions: CloudPermission[] }>>('GET', '/admin/permissions', undefined, token)
    return payload.permissions
  }

  async getUserAssets(token: string | undefined, userId: string): Promise<CloudAdminAssets> {
    const payload = await this.request<ApiEnvelope<{ assets: CloudAdminAssets }>>('GET', `/admin/assets/${encodeURIComponent(userId)}`, undefined, token)
    return payload.assets
  }

  private async upload(token: string | undefined): Promise<CloudSyncResult> {
    const session = await this.getSession(token)
    if (!session) return { ok: false, error: { code: 'UNAUTHENTICATED', message: 'Login required' } }
    const snapshot = this.adapter.readLocalWorkspace(session.user.id)
    return this.request<CloudSyncResult>('POST', '/sync/upload', snapshot, token)
  }

  private async download(token: string | undefined): Promise<CloudSyncResult> {
    const payload = await this.request<
      | ({ ok: true; snapshot: CloudWorkspaceSnapshot; result: CloudSyncResult })
      | CloudSyncResult
    >('GET', '/sync/download', undefined, token)
    if (!payload.ok) return payload
    if (!('snapshot' in payload)) return payload
    this.adapter.applyRemoteWorkspace(payload.snapshot)
    return payload.result
  }

  private async request<T>(method: 'GET' | 'POST', pathname: string, body?: unknown, token?: string): Promise<T> {
    const response = await fetch(`${this.baseUrl}${pathname}`, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {})
      },
      body: method === 'POST' ? JSON.stringify(body ?? {}) : undefined
    })
    return readJson<T>(response)
  }
}
