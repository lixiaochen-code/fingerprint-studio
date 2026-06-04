import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { quarantineCorruptFile, writeJsonAtomic } from '../persistence'
import type {
  BrowserPlugin,
  BrowserProfile,
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
  CloudWorkspaceSnapshot,
  Proxy,
  Script
} from '../types'
import type { CloudAuditLog, CloudState, CloudStoredSession, CloudStoredUser } from './types'

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14
const DEFAULT_DEVICE_ID = 'local-device'

export type CloudWorkspaceAdapter = {
  readLocalWorkspace: (ownerUserId: string) => CloudWorkspaceSnapshot
  applyRemoteWorkspace: (snapshot: CloudWorkspaceSnapshot) => void
}

function nowIso(): string {
  return new Date().toISOString()
}

function makeId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`
}

function hashPassword(password: string, salt = crypto.randomBytes(16).toString('hex')) {
  const passwordHash = crypto.scryptSync(password, salt, 64).toString('hex')
  return { passwordHash, passwordSalt: salt }
}

function timingSafeEqualHex(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, 'hex')
  const rightBuffer = Buffer.from(right, 'hex')
  if (leftBuffer.length !== rightBuffer.length) return false
  return crypto.timingSafeEqual(leftBuffer, rightBuffer)
}

const DEFAULT_PERMISSIONS: CloudPermission[] = [
  { id: 'page:admin', type: 'page', name: '后台首页' },
  { id: 'page:users', type: 'page', name: '用户管理' },
  { id: 'page:roles', type: 'page', name: '角色权限' },
  { id: 'page:assets', type: 'page', name: '资产查看' },
  { id: 'button:user:disable', type: 'button', name: '禁用用户', apiPermissionIds: ['admin:user:disable'] },
  { id: 'button:role:save', type: 'button', name: '保存角色', apiPermissionIds: ['admin:role:write'] },
  { id: 'api:sync:write', type: 'api', name: '同步写入' },
  { id: 'api:sync:read', type: 'api', name: '同步读取' },
  { id: 'admin:user:read', type: 'api', name: '读取用户' },
  { id: 'admin:user:write', type: 'api', name: '写入用户' },
  { id: 'admin:user:disable', type: 'api', name: '禁用用户' },
  { id: 'admin:role:read', type: 'api', name: '读取角色' },
  { id: 'admin:role:write', type: 'api', name: '写入角色' },
  { id: 'admin:asset:read', type: 'api', name: '读取用户资产' },
  { id: 'admin:proxy:sensitive:read', type: 'api', name: '读取代理敏感字段' }
]

function publicUser(user: CloudStoredUser): CloudUser {
  const { passwordHash: _passwordHash, passwordSalt: _passwordSalt, ...safe } = user
  return safe
}

function createInitialState(): CloudState {
  const now = nowIso()
  const password = hashPassword('admin123456')
  const adminRole: CloudRole = {
    id: 'role_super_admin',
    name: '超级管理员',
    description: '内置最高权限角色',
    permissionIds: DEFAULT_PERMISSIONS.map((permission) => permission.id),
    createdAt: now,
    updatedAt: now
  }
  const admin: CloudStoredUser = {
    id: 'user_super_admin',
    username: 'admin',
    displayName: '超级管理员',
    status: 'active',
    roleIds: [adminRole.id],
    isSuperAdmin: true,
    createdAt: now,
    updatedAt: now,
    passwordHash: password.passwordHash,
    passwordSalt: password.passwordSalt
  }
  return {
    schemaVersion: 1,
    users: [admin],
    roles: [adminRole],
    permissions: DEFAULT_PERMISSIONS,
    sessions: [],
    workspaces: {},
    auditLogs: []
  }
}

export class CloudService {
  private readonly file: string
  private readonly adapter: CloudWorkspaceAdapter
  private state: CloudState

  constructor(options: { rootDir: string; adapter: CloudWorkspaceAdapter }) {
    this.file = path.join(options.rootDir, 'cloud.json')
    this.adapter = options.adapter
    this.state = this.load()
  }

  login(input: { username: string; password: string; deviceId?: string }): CloudLoginResult {
    const user = this.state.users.find((item) => item.username === input.username.trim())
    if (!user) {
      return { ok: false, error: { code: 'INVALID_CREDENTIALS', message: 'Invalid username or password' } }
    }
    if (user.status === 'disabled') {
      return { ok: false, error: { code: 'USER_DISABLED', message: 'User is disabled' } }
    }
    const candidate = hashPassword(input.password, user.passwordSalt)
    if (!timingSafeEqualHex(candidate.passwordHash, user.passwordHash)) {
      return { ok: false, error: { code: 'INVALID_CREDENTIALS', message: 'Invalid username or password' } }
    }
    const now = nowIso()
    const session: CloudStoredSession = {
      token: crypto.randomBytes(32).toString('hex'),
      userId: user.id,
      deviceId: input.deviceId?.trim() || DEFAULT_DEVICE_ID,
      createdAt: now,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString()
    }
    this.state.sessions = [session, ...this.state.sessions.filter((item) => item.userId !== user.id || item.deviceId !== session.deviceId)]
    this.state.users = this.state.users.map((item) => item.id === user.id ? { ...item, lastLoginAt: now, updatedAt: now } : item)
    this.audit(user.id, 'auth.login', session.deviceId)
    this.save()
    return { ok: true, session: this.buildSession(session) }
  }

  logout(token: string): void {
    const session = this.state.sessions.find((item) => item.token === token)
    this.state.sessions = this.state.sessions.filter((item) => item.token !== token)
    if (session) this.audit(session.userId, 'auth.logout', session.deviceId)
    this.save()
  }

  getSession(token?: string): CloudSession | undefined {
    const session = this.requireStoredSession(token, false)
    return session ? this.buildSession(session) : undefined
  }

  syncNow(token: string | undefined, direction: CloudSyncDirection): CloudSyncResult {
    const session = this.requireStoredSession(token, true)
    if (!session) return { ok: false, error: { code: 'UNAUTHENTICATED', message: 'Login required' } }
    if ((direction === 'upload' || direction === 'bidirectional') && !this.hasApiPermission(session.userId, 'api:sync:write')) {
      return { ok: false, error: { code: 'FORBIDDEN', message: 'Missing api:sync:write' } }
    }
    if ((direction === 'download' || direction === 'bidirectional') && !this.hasApiPermission(session.userId, 'api:sync:read')) {
      return { ok: false, error: { code: 'FORBIDDEN', message: 'Missing api:sync:read' } }
    }

    const remote = this.state.workspaces[session.userId]
    const local = this.adapter.readLocalWorkspace(session.userId)
    let uploaded = 0
    let downloaded = 0
    let nextRevision = remote?.revision ?? 0

    if (direction === 'download') {
      if (!remote) return { ok: false, error: { code: 'NO_REMOTE_WORKSPACE', message: 'No remote workspace' } }
      this.adapter.applyRemoteWorkspace(remote)
      downloaded = this.countWorkspaceItems(remote)
      nextRevision = remote.revision
    } else if (direction === 'upload') {
      const next = { ...local, revision: nextRevision + 1, updatedAt: nowIso() }
      this.state.workspaces[session.userId] = next
      uploaded = this.countWorkspaceItems(next)
      nextRevision = next.revision
      this.audit(session.userId, 'sync.upload', `rev:${next.revision}`)
      this.save()
    } else {
      if (remote) {
        this.adapter.applyRemoteWorkspace(remote)
        downloaded = this.countWorkspaceItems(remote)
      }
      const afterDownload = this.adapter.readLocalWorkspace(session.userId)
      const next = { ...afterDownload, revision: (remote?.revision ?? 0) + 1, updatedAt: nowIso() }
      this.state.workspaces[session.userId] = next
      uploaded = this.countWorkspaceItems(next)
      nextRevision = next.revision
      this.audit(session.userId, 'sync.bidirectional', `rev:${next.revision}`)
      this.save()
    }

    return {
      ok: true,
      direction,
      revision: nextRevision,
      uploaded,
      downloaded,
      conflicts: [],
      syncedAt: nowIso()
    }
  }

  uploadWorkspace(token: string | undefined, snapshot: CloudWorkspaceSnapshot): CloudSyncResult {
    const session = this.requireStoredSession(token, true)
    if (!session) return { ok: false, error: { code: 'UNAUTHENTICATED', message: 'Login required' } }
    if (!this.hasApiPermission(session.userId, 'api:sync:write')) {
      return { ok: false, error: { code: 'FORBIDDEN', message: 'Missing api:sync:write' } }
    }
    const remote = this.state.workspaces[session.userId]
    const next: CloudWorkspaceSnapshot = {
      ...snapshot,
      ownerUserId: session.userId,
      revision: (remote?.revision ?? 0) + 1,
      updatedAt: nowIso()
    }
    this.state.workspaces[session.userId] = next
    this.audit(session.userId, 'sync.remote-upload', `rev:${next.revision}`)
    this.save()
    return {
      ok: true,
      direction: 'upload',
      revision: next.revision,
      uploaded: this.countWorkspaceItems(next),
      downloaded: 0,
      conflicts: [],
      syncedAt: nowIso()
    }
  }

  downloadWorkspace(token: string | undefined): { ok: true; snapshot: CloudWorkspaceSnapshot; result: CloudSyncResult } | CloudSyncResult {
    const session = this.requireStoredSession(token, true)
    if (!session) return { ok: false, error: { code: 'UNAUTHENTICATED', message: 'Login required' } }
    if (!this.hasApiPermission(session.userId, 'api:sync:read')) {
      return { ok: false, error: { code: 'FORBIDDEN', message: 'Missing api:sync:read' } }
    }
    const remote = this.state.workspaces[session.userId]
    if (!remote) return { ok: false, error: { code: 'NO_REMOTE_WORKSPACE', message: 'No remote workspace' } }
    return {
      ok: true,
      snapshot: remote,
      result: {
        ok: true,
        direction: 'download',
        revision: remote.revision,
        uploaded: 0,
        downloaded: this.countWorkspaceItems(remote),
        conflicts: [],
        syncedAt: nowIso()
      }
    }
  }

  listUsers(token: string | undefined): CloudUser[] {
    this.requireApiPermission(token, 'admin:user:read')
    return this.state.users.map(publicUser)
  }

  saveUser(token: string | undefined, draft: CloudUserDraft): CloudUser {
    const actor = this.requireApiPermission(token, 'admin:user:write')
    const now = nowIso()
    const existing = draft.id ? this.state.users.find((user) => user.id === draft.id) : undefined
    const duplicate = this.state.users.find((user) => user.username === draft.username.trim() && user.id !== existing?.id)
    if (duplicate) throw new Error(`Username already exists: ${draft.username}`)
    if (existing?.isSuperAdmin && draft.status === 'disabled') throw new Error('Super admin cannot be disabled')
    const password = draft.password
      ? hashPassword(draft.password)
      : existing
        ? { passwordHash: existing.passwordHash, passwordSalt: existing.passwordSalt }
        : hashPassword('ChangeMe123!')
    const user: CloudStoredUser = {
      id: existing?.id ?? makeId('user'),
      username: draft.username.trim(),
      displayName: draft.displayName.trim() || draft.username.trim(),
      status: draft.status,
      roleIds: draft.roleIds,
      isSuperAdmin: existing?.isSuperAdmin ?? false,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      lastLoginAt: existing?.lastLoginAt,
      passwordHash: password.passwordHash,
      passwordSalt: password.passwordSalt
    }
    this.state.users = existing
      ? this.state.users.map((item) => item.id === existing.id ? user : item)
      : [user, ...this.state.users]
    this.audit(actor.userId, 'admin.user.save', user.id)
    this.save()
    return publicUser(user)
  }

  listRoles(token: string | undefined): CloudRole[] {
    this.requireApiPermission(token, 'admin:role:read')
    return this.state.roles
  }

  saveRole(token: string | undefined, draft: CloudRoleDraft): CloudRole {
    const actor = this.requireApiPermission(token, 'admin:role:write')
    const now = nowIso()
    const existing = draft.id ? this.state.roles.find((role) => role.id === draft.id) : undefined
    const role: CloudRole = {
      id: existing?.id ?? makeId('role'),
      name: draft.name.trim(),
      description: draft.description?.trim() || undefined,
      permissionIds: Array.from(new Set(draft.permissionIds)),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    }
    this.state.roles = existing
      ? this.state.roles.map((item) => item.id === existing.id ? role : item)
      : [role, ...this.state.roles]
    this.audit(actor.userId, 'admin.role.save', role.id)
    this.save()
    return role
  }

  listPermissions(token: string | undefined): CloudPermission[] {
    this.requireStoredSession(token, true)
    return this.state.permissions
  }

  getUserAssets(token: string | undefined, userId: string): CloudAdminAssets {
    const actor = this.requireApiPermission(token, 'admin:asset:read')
    const user = this.state.users.find((item) => item.id === userId)
    if (!user) throw new Error(`User not found: ${userId}`)
    const workspace = this.state.workspaces[userId]
    const canReadSensitive = this.hasApiPermission(actor.userId, 'admin:proxy:sensitive:read')
    return {
      user: publicUser(user),
      workspace: workspace
        ? {
            revision: workspace.revision,
            updatedAt: workspace.updatedAt,
            profiles: workspace.profiles.map(({ id, name, updatedAt, proxyId }) => ({ id, name, updatedAt, proxyId })),
            proxies: workspace.proxies.map((proxy) => this.safeProxy(proxy, canReadSensitive)),
            scripts: workspace.scripts.map(({ id, name, scope, source, updatedAt }) => ({ id, name, scope, source, updatedAt })),
            plugins: workspace.plugins.map(({ id, name, activeVersionId, updatedAt }) => ({ id, name, activeVersionId, updatedAt }))
          }
        : undefined
    }
  }

  private safeProxy(proxy: Proxy, canReadSensitive: boolean): CloudAdminAssets['workspace'] extends infer Workspace
    ? Workspace extends { proxies: Array<infer Item> } ? Item : never
    : never {
    if (canReadSensitive) return proxy
    const { password: _password, ...rest } = proxy
    return proxy.password ? { ...rest, password: '***' } : rest
  }

  private buildSession(session: CloudStoredSession): CloudSession {
    const user = this.state.users.find((item) => item.id === session.userId)
    if (!user) throw new Error('Session user is missing')
    const roles = this.state.roles.filter((role) => user.roleIds.includes(role.id))
    const permissionIds = new Set(roles.flatMap((role) => role.permissionIds))
    const permissions = user.isSuperAdmin
      ? this.state.permissions
      : this.state.permissions.filter((permission) => permissionIds.has(permission.id))
    return {
      token: session.token,
      user: publicUser(user),
      roles,
      permissions,
      deviceId: session.deviceId
    }
  }

  private hasApiPermission(userId: string, permissionId: string): boolean {
    const user = this.state.users.find((item) => item.id === userId)
    if (!user || user.status === 'disabled') return false
    if (user.isSuperAdmin) return true
    const rolePermissionIds = new Set(
      this.state.roles
        .filter((role) => user.roleIds.includes(role.id))
        .flatMap((role) => role.permissionIds)
    )
    return rolePermissionIds.has(permissionId)
  }

  private requireApiPermission(token: string | undefined, permissionId: string): CloudStoredSession {
    const session = this.requireStoredSession(token, true)
    if (!session) throw new Error('Login required')
    if (!this.hasApiPermission(session.userId, permissionId)) {
      throw new Error(`Missing API permission: ${permissionId}`)
    }
    return session
  }

  private requireStoredSession(token: string | undefined, throwOnMissing: boolean): CloudStoredSession | undefined {
    if (!token) {
      if (throwOnMissing) throw new Error('Login required')
      return undefined
    }
    const session = this.state.sessions.find((item) => item.token === token)
    if (!session) {
      if (throwOnMissing) throw new Error('Login required')
      return undefined
    }
    if (Date.parse(session.expiresAt) <= Date.now()) {
      this.state.sessions = this.state.sessions.filter((item) => item.token !== token)
      this.save()
      if (throwOnMissing) throw new Error('Session expired')
      return undefined
    }
    const user = this.state.users.find((item) => item.id === session.userId)
    if (!user || user.status === 'disabled') {
      if (throwOnMissing) throw new Error('User disabled')
      return undefined
    }
    return session
  }

  private countWorkspaceItems(snapshot: CloudWorkspaceSnapshot): number {
    return snapshot.profiles.length + snapshot.proxies.length + snapshot.scripts.length + snapshot.plugins.length
  }

  private audit(actorUserId: string, action: string, target?: string): void {
    const entry: CloudAuditLog = {
      id: makeId('audit'),
      actorUserId,
      action,
      target,
      createdAt: nowIso()
    }
    this.state.auditLogs = [entry, ...this.state.auditLogs].slice(0, 500)
  }

  private load(): CloudState {
    if (!fs.existsSync(this.file)) {
      const state = createInitialState()
      writeJsonAtomic(this.file, state)
      return state
    }
    try {
      const parsed = JSON.parse(fs.readFileSync(this.file, 'utf8')) as CloudState
      return {
        ...createInitialState(),
        ...parsed,
        permissions: parsed.permissions?.length ? parsed.permissions : DEFAULT_PERMISSIONS
      }
    } catch (error) {
      console.error('[cloud] failed to load cloud.json', error)
      quarantineCorruptFile(this.file)
      const state = createInitialState()
      writeJsonAtomic(this.file, state)
      return state
    }
  }

  private save(): void {
    writeJsonAtomic(this.file, this.state)
  }
}

export function createWorkspaceSnapshot(input: {
  ownerUserId: string
  profiles: BrowserProfile[]
  proxies: Proxy[]
  scripts: Script[]
  scriptSources: Array<{ scriptId: string; source: string }>
  plugins: BrowserPlugin[]
  revision?: number
}): CloudWorkspaceSnapshot {
  return {
    schemaVersion: 1,
    revision: input.revision ?? 0,
    ownerUserId: input.ownerUserId,
    updatedAt: nowIso(),
    profiles: input.profiles,
    proxies: input.proxies,
    scripts: input.scripts,
    scriptSources: input.scriptSources,
    plugins: input.plugins,
    settings: {}
  }
}
