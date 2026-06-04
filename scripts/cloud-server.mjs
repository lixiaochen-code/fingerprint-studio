import fs from 'node:fs'
import path from 'node:path'
import { CloudHttpServer } from '../dist-electron/cloud/httpServer.js'
import { CloudService, createWorkspaceSnapshot } from '../dist-electron/cloud/service.js'

const dataDir = process.env.AUTO_REGISTRY_CLOUD_DATA_DIR
  ? path.resolve(process.env.AUTO_REGISTRY_CLOUD_DATA_DIR)
  : path.resolve(process.cwd(), '.cloud-data')
const host = process.env.AUTO_REGISTRY_CLOUD_HOST || '127.0.0.1'
const port = Number(process.env.AUTO_REGISTRY_CLOUD_PORT || 3037)

fs.mkdirSync(dataDir, { recursive: true })

const emptyAdapter = {
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
  applyRemoteWorkspace() {
    // 独立后端只保存远端 workspace，不需要应用到本地 Electron store。
  }
}

const service = new CloudService({ rootDir: dataDir, adapter: emptyAdapter })
const server = new CloudHttpServer(service)

const actualPort = await server.listen(port, host)
console.log(`cloud server listening on http://${host}:${actualPort}`)
console.log(`data dir: ${dataDir}`)

async function shutdown() {
  await server.close()
  process.exit(0)
}

process.on('SIGINT', () => void shutdown())
process.on('SIGTERM', () => void shutdown())
