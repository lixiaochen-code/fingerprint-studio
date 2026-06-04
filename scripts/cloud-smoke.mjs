import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { CloudService, createWorkspaceSnapshot } from '../dist-electron/cloud/service.js'
import { CloudHttpServer } from '../dist-electron/cloud/httpServer.js'
import { CloudRemoteClient } from '../dist-electron/cloud/client.js'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function request(baseUrl, method, pathname, body, token) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  })
  const payload = await response.json()
  return { status: response.status, payload }
}

const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auto-registry-cloud-smoke-'))
let localRevision = 0
let localWorkspace

const adapter = {
  readLocalWorkspace(ownerUserId) {
    localWorkspace = createWorkspaceSnapshot({
      ownerUserId,
      revision: localRevision,
      profiles: [
        {
          id: 'env_smoke',
          name: 'Smoke Env',
          notes: '',
          enabledPluginIds: [],
          proxyId: 'proxy_smoke',
          fingerprint: {
            targetOs: 'mac',
            userAgent: 'smoke',
            language: 'zh-CN',
            timezone: 'Asia/Shanghai',
            viewport: { width: 1280, height: 720 },
            screen: { availWidth: 1280, availHeight: 720, colorDepth: 24, pixelDepth: 24 },
            platform: 'MacIntel',
            hardwareConcurrency: 8,
            deviceMemory: 8,
            deviceScaleFactor: 1,
            maxTouchPoints: 0,
            doNotTrack: '1',
            webRtcPolicy: 'default',
            canvasNoise: 0,
            audioNoise: 0,
            webglVendor: 'Apple',
            webglRenderer: 'Apple GPU',
            fonts: []
          },
          profilePath: path.join(rootDir, 'profiles', 'env_smoke'),
          createdAt: '2026-06-04T00:00:00.000Z',
          updatedAt: '2026-06-04T00:00:00.000Z'
        }
      ],
      proxies: [
        {
          id: 'proxy_smoke',
          name: 'Smoke Proxy',
          scheme: 'http',
          host: '127.0.0.1',
          port: 8080,
          username: 'user',
          password: 'secret',
          createdAt: '2026-06-04T00:00:00.000Z',
          updatedAt: '2026-06-04T00:00:00.000Z'
        }
      ],
      scripts: [
        {
          id: 'script_smoke',
          name: 'Smoke Script',
          source: 'local',
          scope: 'profile',
          entryPath: path.join(rootDir, 'scripts', 'script_smoke', 'index.ts'),
          createdAt: '2026-06-04T00:00:00.000Z',
          updatedAt: '2026-06-04T00:00:00.000Z'
        }
      ],
      scriptSources: [{ scriptId: 'script_smoke', source: 'export default async function main() {}' }],
      plugins: []
    })
    return localWorkspace
  },
  applyRemoteWorkspace(snapshot) {
    localRevision = snapshot.revision
    localWorkspace = snapshot
  }
}

let deviceBWorkspace
const deviceBAdapter = {
  readLocalWorkspace(ownerUserId) {
    return createWorkspaceSnapshot({
      ownerUserId,
      profiles: [],
      proxies: [],
      scripts: [],
      scriptSources: [],
      plugins: []
    })
  },
  applyRemoteWorkspace(snapshot) {
    deviceBWorkspace = snapshot
  }
}

const service = new CloudService({ rootDir, adapter })
const server = new CloudHttpServer(service)
const port = await server.listen(0)
const baseUrl = `http://127.0.0.1:${port}`

try {
  const badLogin = await request(baseUrl, 'POST', '/auth/login', {
    username: 'admin',
    password: 'wrong',
    deviceId: 'smoke'
  })
  assert(badLogin.payload.ok === false, 'bad login should fail')

  const login = await request(baseUrl, 'POST', '/auth/login', {
    username: 'admin',
    password: 'admin123456',
    deviceId: 'smoke'
  })
  assert(login.payload.ok === true, 'admin login should pass')
  const adminToken = login.payload.session.token
  const adminUserId = login.payload.session.user.id

  const upload = await request(baseUrl, 'POST', '/sync', { direction: 'upload' }, adminToken)
  assert(upload.payload.ok === true, 'upload sync should pass')
  assert(upload.payload.uploaded >= 3, 'upload should include workspace assets')

  const assets = await request(baseUrl, 'GET', `/admin/assets/${adminUserId}`, undefined, adminToken)
  assert(assets.payload.ok === true, 'admin assets should load')
  assert(assets.payload.assets.workspace.proxies[0].password === 'secret', 'super admin can read sensitive proxy field')

  const role = await request(baseUrl, 'POST', '/admin/roles', {
    name: 'Sync Only',
    description: 'No admin APIs',
    permissionIds: ['api:sync:read', 'api:sync:write']
  }, adminToken)
  assert(role.payload.ok === true, 'role creation should pass')

  const user = await request(baseUrl, 'POST', '/admin/users', {
    username: 'worker',
    displayName: 'Worker',
    password: 'worker123456',
    status: 'active',
    roleIds: [role.payload.role.id]
  }, adminToken)
  assert(user.payload.ok === true, 'user creation should pass')

  const workerLogin = await request(baseUrl, 'POST', '/auth/login', {
    username: 'worker',
    password: 'worker123456',
    deviceId: 'worker-device'
  })
  assert(workerLogin.payload.ok === true, 'worker login should pass')
  const workerToken = workerLogin.payload.session.token

  const forbiddenUsers = await request(baseUrl, 'GET', '/admin/users', undefined, workerToken)
  assert(forbiddenUsers.status === 403, 'worker must not list admin users')

  const workerSync = await request(baseUrl, 'POST', '/sync', { direction: 'upload' }, workerToken)
  assert(workerSync.payload.ok === true, 'worker can use assigned sync API')

  const deviceA = new CloudRemoteClient(baseUrl, adapter)
  const deviceALogin = await deviceA.login({
    username: 'admin',
    password: 'admin123456',
    deviceId: 'device-a'
  })
  assert(deviceALogin.ok === true, 'device A login should pass')
  const deviceAUpload = await deviceA.syncNow(deviceALogin.session.token, 'upload')
  assert(deviceAUpload.ok === true, 'device A upload should pass')

  const deviceB = new CloudRemoteClient(baseUrl, deviceBAdapter)
  const deviceBLogin = await deviceB.login({
    username: 'admin',
    password: 'admin123456',
    deviceId: 'device-b'
  })
  assert(deviceBLogin.ok === true, 'device B login should pass')
  const deviceBDownload = await deviceB.syncNow(deviceBLogin.session.token, 'download')
  assert(deviceBDownload.ok === true, 'device B download should pass')
  assert(deviceBWorkspace?.profiles?.[0]?.id === 'env_smoke', 'device B should receive uploaded profile')
  assert(deviceBWorkspace?.scriptSources?.[0]?.source.includes('main'), 'device B should receive script source')

  console.log('cloud smoke ok')
} finally {
  await server.close()
  fs.rmSync(rootDir, { recursive: true, force: true })
}
