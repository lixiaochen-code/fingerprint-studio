/**
 * 把旧版 inline `BrowserProfile.proxy` 数据迁移到独立 ProxyStore。
 *
 * 设计要点:
 * - **纯函数**:接受 raw profiles + raw proxies,返回新 profiles + 新 proxies,不碰文件系统。
 *   这样 ProxyStore.load() 和 ProfileStore.load() 各自负责自己的文件 IO,但共享迁移逻辑。
 * - **幂等**:已经有 proxyId 的 profile 不再处理;ProxyStore 已有相同 dedupKey 的不复制。
 * - **dedup**:相同的 `scheme://host:port:user:pass` 在 ProxyStore 里只建一条;多个 profile
 *   引用同一 proxyId。
 *
 * 迁移触发时机:`profiles.json` 缺 `schemaVersion` 字段(legacy 数据)或某些 profile 还带
 * inline `proxy` 但缺 `proxyId`。
 */
import type { Proxy, ProxyScheme } from './schema'
import { proxyDedupKey } from './schema'

/**
 * 旧 inline proxy 形状。store.ts 写过的真实数据可能多带字段,这里只读我们关心的。
 */
interface LegacyProxyShape {
  host?: string
  port?: number
  username?: string
  password?: string
  scheme?: string
}

/**
 * 迁移阶段我们对 profile 形状要求很少 —— 有 proxy 或 proxyId 都行。返回时新 profile 上一定
 * 有 proxyId(可能 null),inline proxy 字段也保留(Phase 1c 清掉),以维持 ProfileFormDialog
 * 的旧 UI 在 Phase 1a/b 仍可工作。
 */
export interface MigratableProfile {
  id: string
  proxy?: LegacyProxyShape
  proxyId?: string | null
  [k: string]: unknown
}

export interface MigrateResult<P extends MigratableProfile> {
  profiles: P[]
  proxies: Proxy[]
  migrated: boolean
}

function newProxyId(seed: number): string {
  return `proxy_${Date.now().toString(36)}_${seed.toString(36).padStart(4, '0')}_${Math.random().toString(36).slice(2, 6)}`
}

function normalizeScheme(raw: string | undefined): ProxyScheme {
  const lower = (raw || '').toLowerCase()
  if (lower === 'https' || lower === 'socks5' || lower === 'socks4') return lower
  return 'http'
}

function nowIso(): string {
  return new Date().toISOString()
}

/**
 * 主入口。
 *
 * @param rawProfiles 当前 profiles.json 解析出的数组(可能没 proxyId 字段)
 * @param rawProxies 当前 proxies.json 解析出的数组(可能空数组,首次启动)
 * @returns { profiles, proxies, migrated } —— migrated=true 时调用方需要把两个数组都 writeJsonAtomic 回去
 */
export function migrateProfilesToProxyStore<P extends MigratableProfile>(
  rawProfiles: P[],
  rawProxies: Proxy[]
): MigrateResult<P> {
  // dedupMap: key = `${scheme}://host:port:user:pass`,value = proxyId(来自现存 ProxyStore 或新建)
  const dedupMap = new Map<string, string>()
  for (const p of rawProxies) {
    dedupMap.set(proxyDedupKey(p), p.id)
  }

  const nextProxies: Proxy[] = [...rawProxies]
  let migrated = false
  const nextProfiles = rawProfiles.map((profile, idx) => {
    // 已经迁移过:有非空 proxyId 时跳过。proxyId 为 null 也视为"已表态",不再处理。
    if (profile.proxyId !== undefined) return profile

    const inline = profile.proxy
    if (!inline || !inline.host || !inline.port) {
      // 没有 inline proxy,新规则默认 null = 系统代理
      migrated = true
      return { ...profile, proxyId: null }
    }

    const scheme = normalizeScheme(inline.scheme)
    const dedupArgs = {
      scheme,
      host: inline.host,
      port: inline.port,
      username: inline.username,
      password: inline.password
    }
    const key = proxyDedupKey(dedupArgs)
    let proxyId = dedupMap.get(key)
    if (!proxyId) {
      proxyId = newProxyId(nextProxies.length + idx)
      const now = nowIso()
      const created: Proxy = {
        id: proxyId,
        name: `Imported - ${inline.host}:${inline.port}`,
        scheme,
        host: inline.host,
        port: inline.port,
        username: inline.username || undefined,
        password: inline.password || undefined,
        createdAt: now,
        updatedAt: now
      }
      nextProxies.push(created)
      dedupMap.set(key, proxyId)
    }
    migrated = true
    return { ...profile, proxyId }
  })

  return { profiles: nextProfiles, proxies: nextProxies, migrated }
}
