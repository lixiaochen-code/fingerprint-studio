/**
 * ProxyStore —— 代理条目的 CRUD + 持久化。
 *
 * 设计:
 * - 单例,由 main.ts 在 ProfileStore 之前构造(ProfileStore 迁移阶段会读它的 list)
 * - 持久化:`<userData>/registry-data/proxies.json`,带 `schemaVersion: 1`
 * - 测试快照(lastTest)由 IPC `proxies:test` 写入,UI 表格读
 * - 不在这里做白名单文件管理 —— whitelistStore.ts 单独负责;ProxyStore.remove 时会 best-effort
 *   清理对应白名单文件,但不强耦合
 *
 * 与 ProfileStore 的关系:
 * - ProfileStore 在 load 时调 migration 把旧 inline proxy 落到 ProxyStore,这一步通过传入
 *   ProxyStore 句柄完成。upsert profile 时 store 也会调 findOrCreateByDraft 把新输入的
 *   inline proxy 同步成 ProxyStore 条目(Phase 1a 阶段为了兼容旧 UI 还保留)。
 */
import fs from 'node:fs'
import path from 'node:path'
import { dataRoot } from '../paths'
import { quarantineCorruptFile, writeJsonAtomic } from '../persistence'
import type { Proxy, ProxiesFile, ProxyDraft, ProxyTestSnapshot } from './schema'
import { proxyDedupKey } from './schema'

const CURRENT_SCHEMA_VERSION = 1

function newProxyId(): string {
  return `proxy_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function nowIso(): string {
  return new Date().toISOString()
}

function defaultName(draft: ProxyDraft): string {
  if (draft.name && draft.name.trim()) return draft.name.trim()
  return `${draft.host}:${draft.port}`
}

/**
 * 加载 proxies.json 时的兼容处理:
 *  - 文件不存在 → 空 list
 *  - 是裸数组(老版本兼容) → 包成 schemaVersion:1
 *  - 是带 schemaVersion 的对象 → 直接读 proxies
 *  - 解析失败 → quarantine + 空 list
 */
function parseProxiesFile(raw: string): Proxy[] {
  const parsed: unknown = JSON.parse(raw)
  if (Array.isArray(parsed)) return parsed as Proxy[]
  if (parsed && typeof parsed === 'object' && 'proxies' in parsed) {
    const proxies = (parsed as { proxies?: unknown }).proxies
    if (Array.isArray(proxies)) return proxies as Proxy[]
  }
  return []
}

export class ProxyStore {
  private readonly file: string
  private proxies: Proxy[] = []

  constructor() {
    this.file = path.join(dataRoot(), 'proxies.json')
    fs.mkdirSync(dataRoot(), { recursive: true })
    this.load()
  }

  list(): Proxy[] {
    return this.proxies
  }

  get(id: string): Proxy | undefined {
    return this.proxies.find((p) => p.id === id)
  }

  /**
   * 主进程内部用 —— 迁移阶段批量替换。调用方对结果负责(已 dedup)。不写文件,自己 save()。
   */
  setAll(next: Proxy[]): void {
    this.proxies = next
    this.save()
  }

  /**
   * 新增或更新一条。draft.id 缺省 = 新建;有 id = 更新。
   */
  upsert(draft: ProxyDraft): Proxy {
    const now = nowIso()
    if (draft.id) {
      const existing = this.proxies.find((p) => p.id === draft.id)
      if (!existing) throw new Error(`Proxy ${draft.id} not found`)
      const next: Proxy = {
        ...existing,
        name: draft.name?.trim() || existing.name,
        scheme: draft.scheme,
        host: draft.host.trim(),
        port: Number(draft.port),
        username: draft.username?.trim() || undefined,
        password: draft.password || undefined, // 密码不 trim
        updatedAt: now
      }
      this.proxies = this.proxies.map((p) => p.id === existing.id ? next : p)
      this.save()
      return next
    }
    const created: Proxy = {
      id: newProxyId(),
      name: defaultName(draft),
      scheme: draft.scheme,
      host: draft.host.trim(),
      port: Number(draft.port),
      username: draft.username?.trim() || undefined,
      password: draft.password || undefined,
      createdAt: now,
      updatedAt: now
    }
    this.proxies = [created, ...this.proxies]
    this.save()
    return created
  }

  /**
   * 批量创建(批量导入用)。失败的条目 caller 自己处理(parser 已经过滤过)。dedup 同 host:port:user:pass。
   */
  bulkUpsert(drafts: ProxyDraft[]): { created: Proxy[]; reused: Proxy[] } {
    const created: Proxy[] = []
    const reused: Proxy[] = []
    const now = nowIso()
    const dedupMap = new Map(this.proxies.map((p) => [proxyDedupKey(p), p] as const))
    const additions: Proxy[] = []
    for (const draft of drafts) {
      const key = proxyDedupKey(draft)
      const exists = dedupMap.get(key)
      if (exists) {
        reused.push(exists)
        continue
      }
      const proxy: Proxy = {
        id: newProxyId(),
        name: defaultName(draft),
        scheme: draft.scheme,
        host: draft.host.trim(),
        port: Number(draft.port),
        username: draft.username?.trim() || undefined,
        password: draft.password || undefined,
        createdAt: now,
        updatedAt: now
      }
      additions.push(proxy)
      created.push(proxy)
      dedupMap.set(key, proxy)
    }
    if (additions.length) {
      this.proxies = [...additions, ...this.proxies]
      this.save()
    }
    return { created, reused }
  }

  remove(id: string): void {
    this.proxies = this.proxies.filter((p) => p.id !== id)
    this.save()
  }

  /**
   * IPC `proxies:test` 后由 main.ts 调,把探测结果写到对应 proxy 的 lastTest 字段。
   */
  recordTest(id: string, snapshot: ProxyTestSnapshot): Proxy | undefined {
    const existing = this.proxies.find((p) => p.id === id)
    if (!existing) return undefined
    const next: Proxy = { ...existing, lastTest: snapshot }
    this.proxies = this.proxies.map((p) => p.id === id ? next : p)
    this.save()
    return next
  }

  /**
   * 主要给 ProfileStore.upsert 用 —— 老 ProfileFormDialog 还在递 inline proxy 时,我们把它
   * 转成 ProxyStore 条目;dedup 已存在的不重复创建。返回最终 proxyId(null 当 host 为空)。
   *
   * Phase 1c 切到 dropdown UI 后,这条 helper 应该弃用,改成 UI 显式调 upsert。
   */
  findOrCreateFromLegacyInline(args: {
    host?: string
    port?: number | string
    username?: string
    password?: string
    scheme?: string
    name?: string
  }): string | null {
    const host = args.host?.trim()
    const portNum = Number(args.port)
    if (!host || !Number.isInteger(portNum) || portNum <= 0 || portNum > 65535) return null
    const scheme = (args.scheme === 'https' || args.scheme === 'socks5' || args.scheme === 'socks4')
      ? args.scheme as 'https' | 'socks5' | 'socks4'
      : 'http'
    const key = proxyDedupKey({
      scheme,
      host,
      port: portNum,
      username: args.username,
      password: args.password
    })
    const existing = this.proxies.find((p) => proxyDedupKey(p) === key)
    if (existing) return existing.id
    const created = this.upsert({
      name: args.name?.trim() || `Imported - ${host}:${portNum}`,
      scheme,
      host,
      port: portNum,
      username: args.username,
      password: args.password
    })
    return created.id
  }

  private load(): void {
    if (!fs.existsSync(this.file)) {
      this.proxies = []
      return
    }
    try {
      const raw = fs.readFileSync(this.file, 'utf8')
      this.proxies = parseProxiesFile(raw)
    } catch (error) {
      console.error('[ProxyStore] failed to load proxies.json', error)
      quarantineCorruptFile(this.file)
      this.proxies = []
    }
  }

  private save(): void {
    const payload: ProxiesFile = {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      proxies: this.proxies
    }
    writeJsonAtomic(this.file, payload)
  }
}
