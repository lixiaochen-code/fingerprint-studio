import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Cloud, Download, Eye, LogOut, RefreshCw, Save, Shield, Upload, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type {
  CloudAdminAssets,
  CloudPermission,
  CloudRole,
  CloudSession,
  CloudSyncDirection,
  CloudUser,
  CloudUserStatus
} from '../../../electron/types'

type Labels = {
  title: string
  subtitle: string
  username: string
  password: string
  login: string
  logout: string
  syncUpload: string
  syncDownload: string
  syncBoth: string
  users: string
  roles: string
  assets: string
  saveUser: string
  saveRole: string
  newUser: string
  active: string
  disabled: string
  permissions: string
  viewAssets: string
}

const labels: Record<'zh' | 'en', Labels> = {
  zh: {
    title: '云同步 / 后台管理',
    subtitle: '账号登录、工作区同步、用户与角色权限管理',
    username: '用户名',
    password: '密码',
    login: '登录',
    logout: '退出',
    syncUpload: '上传本机',
    syncDownload: '下载云端',
    syncBoth: '双向同步',
    users: '用户',
    roles: '角色',
    assets: '资产',
    saveUser: '保存用户',
    saveRole: '保存角色',
    newUser: '新建用户',
    active: '启用',
    disabled: '禁用',
    permissions: '权限',
    viewAssets: '查看资产'
  },
  en: {
    title: 'Cloud Sync / Admin',
    subtitle: 'Login, workspace sync, users, roles and permissions',
    username: 'Username',
    password: 'Password',
    login: 'Login',
    logout: 'Logout',
    syncUpload: 'Upload local',
    syncDownload: 'Download remote',
    syncBoth: 'Two-way sync',
    users: 'Users',
    roles: 'Roles',
    assets: 'Assets',
    saveUser: 'Save user',
    saveRole: 'Save role',
    newUser: 'New user',
    active: 'Active',
    disabled: 'Disabled',
    permissions: 'Permissions',
    viewAssets: 'View assets'
  }
}

type CloudAdminViewProps = {
  locale: 'zh' | 'en'
  onSynced: () => Promise<void>
}

type UserForm = {
  id?: string
  username: string
  displayName: string
  password: string
  status: CloudUserStatus
  roleIds: string[]
}

type RoleForm = {
  id?: string
  name: string
  description: string
  permissionIds: string[]
}

const emptyUser: UserForm = {
  username: '',
  displayName: '',
  password: '',
  status: 'active',
  roleIds: []
}

const emptyRole: RoleForm = {
  name: '',
  description: '',
  permissionIds: []
}

function hasPermission(session: CloudSession | undefined, id: string): boolean {
  if (!session) return false
  if (session.user.isSuperAdmin) return true
  return session.permissions.some((permission) => permission.id === id)
}

function toggleList(list: string[], value: string, checked: boolean): string[] {
  if (checked) return Array.from(new Set([...list, value]))
  return list.filter((item) => item !== value)
}

export function CloudAdminView({ locale, onSynced }: CloudAdminViewProps) {
  const t = labels[locale]
  const [session, setSession] = useState<CloudSession>()
  const [users, setUsers] = useState<CloudUser[]>([])
  const [roles, setRoles] = useState<CloudRole[]>([])
  const [permissions, setPermissions] = useState<CloudPermission[]>([])
  const [assets, setAssets] = useState<CloudAdminAssets>()
  const [userForm, setUserForm] = useState<UserForm>(emptyUser)
  const [roleForm, setRoleForm] = useState<RoleForm>(emptyRole)
  const [username, setUsername] = useState('admin')
  const [password, setPassword] = useState('admin123456')
  const [busy, setBusy] = useState(false)

  const apiPermissions = useMemo(
    () => permissions.filter((permission) => permission.type === 'api'),
    [permissions]
  )

  async function reloadCloud() {
    const current = await window.registry.cloud.session()
    setSession(current)
    if (!current) return
    const [nextUsers, nextRoles, nextPermissions] = await Promise.all([
      window.registry.cloud.users.list(),
      window.registry.cloud.roles.list(),
      window.registry.cloud.permissions.list()
    ])
    setUsers(nextUsers)
    setRoles(nextRoles)
    setPermissions(nextPermissions)
  }

  useEffect(() => {
    void reloadCloud()
  }, [])

  async function login() {
    setBusy(true)
    try {
      const result = await window.registry.cloud.login({ username, password, deviceId: 'desktop-ui' })
      if (!result.ok) {
        toast.error(result.error.message)
        return
      }
      toast.success(locale === 'zh' ? '登录成功' : 'Logged in')
      await reloadCloud()
    } finally {
      setBusy(false)
    }
  }

  async function logout() {
    await window.registry.cloud.logout()
    setSession(undefined)
    setUsers([])
    setRoles([])
    setPermissions([])
    setAssets(undefined)
  }

  async function sync(direction: CloudSyncDirection) {
    setBusy(true)
    try {
      const result = await window.registry.cloud.syncNow(direction)
      if (!result.ok) {
        toast.error(result.error.message)
        return
      }
      toast.success(`rev ${result.revision} · up ${result.uploaded} · down ${result.downloaded}`)
      await onSynced()
      await reloadCloud()
    } finally {
      setBusy(false)
    }
  }

  async function saveUser() {
    const saved = await window.registry.cloud.users.save({
      id: userForm.id,
      username: userForm.username,
      displayName: userForm.displayName,
      password: userForm.password || undefined,
      status: userForm.status,
      roleIds: userForm.roleIds
    })
    toast.success(saved.displayName)
    setUserForm(emptyUser)
    await reloadCloud()
  }

  async function saveRole() {
    const saved = await window.registry.cloud.roles.save({
      id: roleForm.id,
      name: roleForm.name,
      description: roleForm.description,
      permissionIds: roleForm.permissionIds
    })
    toast.success(saved.name)
    setRoleForm(emptyRole)
    await reloadCloud()
  }

  async function loadAssets(userId: string) {
    const next = await window.registry.cloud.assets.get(userId)
    setAssets(next)
  }

  if (!session) {
    return (
      <main className="flex-1 overflow-auto">
        <div className="mx-auto flex h-full max-w-md flex-col justify-center px-6">
          <div className="border border-border bg-card p-5 shadow-sm">
            <div className="mb-5 flex items-center gap-3">
              <Cloud className="h-5 w-5 text-primary" />
              <div>
                <h2 className="font-display text-lg font-bold">{t.title}</h2>
                <p className="text-xs text-muted-foreground">{t.subtitle}</p>
              </div>
            </div>
            <div className="space-y-3">
              <Input value={username} placeholder={t.username} onChange={(event) => setUsername(event.target.value)} />
              <Input value={password} type="password" placeholder={t.password} onChange={(event) => setPassword(event.target.value)} />
              <Button className="w-full gap-2" disabled={busy} onClick={() => void login()}>
                <Shield className="h-4 w-4" />
                {t.login}
              </Button>
              <p className="text-[11px] text-muted-foreground">
                {locale === 'zh' ? '默认超级管理员：admin / admin123456' : 'Default super admin: admin / admin123456'}
              </p>
            </div>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="flex-1 overflow-auto">
      <div className="space-y-4 p-6">
        <section className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
          <div>
            <h2 className="font-display text-xl font-bold">{t.title}</h2>
            <p className="text-xs text-muted-foreground">
              {session.user.displayName} · {session.deviceId}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" className="gap-2" disabled={busy} onClick={() => void sync('upload')}>
              <Upload className="h-4 w-4" />
              {t.syncUpload}
            </Button>
            <Button variant="secondary" className="gap-2" disabled={busy} onClick={() => void sync('download')}>
              <Download className="h-4 w-4" />
              {t.syncDownload}
            </Button>
            <Button className="gap-2" disabled={busy} onClick={() => void sync('bidirectional')}>
              <RefreshCw className="h-4 w-4" />
              {t.syncBoth}
            </Button>
            <Button variant="ghost" className="gap-2" onClick={() => void logout()}>
              <LogOut className="h-4 w-4" />
              {t.logout}
            </Button>
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(360px,0.75fr)]">
          <div className="space-y-4">
            <Panel title={t.users}>
              <UserEditor
                t={t}
                roles={roles}
                value={userForm}
                disabled={!hasPermission(session, 'admin:user:write')}
                onChange={setUserForm}
                onSave={() => void saveUser()}
              />
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t.username}</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell>
                        <button
                          className="text-left font-medium text-primary"
                          onClick={() => setUserForm({
                            id: user.id,
                            username: user.username,
                            displayName: user.displayName,
                            password: '',
                            status: user.status,
                            roleIds: user.roleIds
                          })}
                        >
                          {user.displayName}
                        </button>
                        <div className="font-mono text-[10px] text-muted-foreground">{user.username}</div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {user.isSuperAdmin ? 'SUPER' : user.roleIds.join(', ') || '-'}
                      </TableCell>
                      <TableCell>{user.status}</TableCell>
                      <TableCell>
                        <Button variant="secondary" size="sm" className="gap-2" onClick={() => void loadAssets(user.id)}>
                          <Eye className="h-3 w-3" />
                          {t.viewAssets}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Panel>

            <Panel title={t.roles}>
              <RoleEditor
                t={t}
                permissions={permissions}
                value={roleForm}
                disabled={!hasPermission(session, 'admin:role:write')}
                onChange={setRoleForm}
                onSave={() => void saveRole()}
              />
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t.roles}</TableHead>
                    <TableHead>{t.permissions}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {roles.map((role) => (
                    <TableRow key={role.id} onClick={() => setRoleForm({
                      id: role.id,
                      name: role.name,
                      description: role.description ?? '',
                      permissionIds: role.permissionIds
                    })}>
                      <TableCell>
                        <div className="font-medium">{role.name}</div>
                        <div className="text-xs text-muted-foreground">{role.description}</div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{role.permissionIds.length}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Panel>
          </div>

          <div className="space-y-4">
            <Panel title={t.permissions}>
              <div className="grid gap-2 sm:grid-cols-2">
                {apiPermissions.map((permission) => (
                  <div key={permission.id} className="border border-border bg-muted/20 p-3">
                    <div className="font-mono text-[11px] text-primary">{permission.id}</div>
                    <div className="text-xs text-muted-foreground">{permission.name}</div>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel title={t.assets}>
              {assets?.workspace ? (
                <div className="space-y-3 text-sm">
                  <AssetCount label="Profiles" value={assets.workspace.profiles.length} />
                  <AssetCount label="Proxies" value={assets.workspace.proxies.length} />
                  <AssetCount label="Scripts" value={assets.workspace.scripts.length} />
                  <AssetCount label="Plugins" value={assets.workspace.plugins.length} />
                  <div className="border-t border-border pt-3 text-xs text-muted-foreground">
                    rev {assets.workspace.revision} · {assets.workspace.updatedAt}
                  </div>
                  <div className="max-h-72 overflow-auto border border-border">
                    <pre className="whitespace-pre-wrap break-all p-3 text-[11px] text-muted-foreground">
                      {JSON.stringify(assets.workspace.proxies.slice(0, 5), null, 2)}
                    </pre>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {assets ? 'No synced workspace.' : 'Select a user to inspect assets.'}
                </p>
              )}
            </Panel>
          </div>
        </section>
      </div>
    </main>
  )
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3 border border-border bg-card p-4">
      <h3 className="font-display text-sm font-bold uppercase">{title}</h3>
      {children}
    </section>
  )
}

function AssetCount({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between border border-border px-3 py-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  )
}

function UserEditor({
  t,
  roles,
  value,
  disabled,
  onChange,
  onSave
}: {
  t: Labels
  roles: CloudRole[]
  value: UserForm
  disabled: boolean
  onChange: (value: UserForm) => void
  onSave: () => void
}) {
  return (
    <div className="grid gap-2 lg:grid-cols-[1fr_1fr_1fr_auto]">
      <Input value={value.username} disabled={disabled} placeholder={t.username} onChange={(event) => onChange({ ...value, username: event.target.value })} />
      <Input value={value.displayName} disabled={disabled} placeholder="Display name" onChange={(event) => onChange({ ...value, displayName: event.target.value })} />
      <Input value={value.password} disabled={disabled} type="password" placeholder={t.password} onChange={(event) => onChange({ ...value, password: event.target.value })} />
      <Button className="gap-2" disabled={disabled || !value.username} onClick={onSave}>
        <UserPlus className="h-4 w-4" />
        {t.saveUser}
      </Button>
      <div className="flex flex-wrap gap-3 lg:col-span-4">
        <StatusToggle t={t} value={value.status} disabled={disabled} onChange={(status) => onChange({ ...value, status })} />
        {roles.map((role) => (
          <label key={role.id} className="inline-flex items-center gap-2 text-xs">
            <Checkbox
              checked={value.roleIds.includes(role.id)}
              disabled={disabled}
              onChange={(checked) => onChange({ ...value, roleIds: toggleList(value.roleIds, role.id, checked) })}
            />
            {role.name}
          </label>
        ))}
      </div>
    </div>
  )
}

function RoleEditor({
  t,
  permissions,
  value,
  disabled,
  onChange,
  onSave
}: {
  t: Labels
  permissions: CloudPermission[]
  value: RoleForm
  disabled: boolean
  onChange: (value: RoleForm) => void
  onSave: () => void
}) {
  return (
    <div className="space-y-3">
      <div className="grid gap-2 lg:grid-cols-[1fr_1fr_auto]">
        <Input value={value.name} disabled={disabled} placeholder="Role name" onChange={(event) => onChange({ ...value, name: event.target.value })} />
        <Input value={value.description} disabled={disabled} placeholder="Description" onChange={(event) => onChange({ ...value, description: event.target.value })} />
        <Button className="gap-2" disabled={disabled || !value.name} onClick={onSave}>
          <Save className="h-4 w-4" />
          {t.saveRole}
        </Button>
      </div>
      <div className="grid max-h-56 gap-2 overflow-auto border border-border p-3 md:grid-cols-2">
        {permissions.map((permission) => (
          <label key={permission.id} className="inline-flex items-start gap-2 text-xs">
            <Checkbox
              checked={value.permissionIds.includes(permission.id)}
              disabled={disabled}
              onChange={(checked) => onChange({ ...value, permissionIds: toggleList(value.permissionIds, permission.id, checked) })}
            />
            <span>
              <span className="font-mono text-primary">{permission.id}</span>
              <span className="block text-muted-foreground">{permission.name}</span>
            </span>
          </label>
        ))}
      </div>
    </div>
  )
}

function StatusToggle({
  t,
  value,
  disabled,
  onChange
}: {
  t: Labels
  value: CloudUserStatus
  disabled: boolean
  onChange: (value: CloudUserStatus) => void
}) {
  return (
    <div className="inline-flex border border-border">
      <Button variant={value === 'active' ? 'default' : 'ghost'} size="sm" disabled={disabled} onClick={() => onChange('active')}>
        {t.active}
      </Button>
      <Button variant={value === 'disabled' ? 'default' : 'ghost'} size="sm" disabled={disabled} onClick={() => onChange('disabled')}>
        {t.disabled}
      </Button>
    </div>
  )
}

export default CloudAdminView
