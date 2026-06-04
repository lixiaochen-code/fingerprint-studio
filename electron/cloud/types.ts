import type {
  CloudPermission,
  CloudRole,
  CloudUser,
  CloudWorkspaceSnapshot
} from '../types'

export type CloudStoredUser = CloudUser & {
  passwordHash: string
  passwordSalt: string
}

export type CloudStoredSession = {
  token: string
  userId: string
  deviceId: string
  createdAt: string
  expiresAt: string
}

export type CloudAuditLog = {
  id: string
  actorUserId: string
  action: string
  target?: string
  createdAt: string
}

export type CloudState = {
  schemaVersion: 1
  users: CloudStoredUser[]
  roles: CloudRole[]
  permissions: CloudPermission[]
  sessions: CloudStoredSession[]
  workspaces: Record<string, CloudWorkspaceSnapshot>
  auditLogs: CloudAuditLog[]
}
