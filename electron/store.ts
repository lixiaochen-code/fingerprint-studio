import fs from 'node:fs'
import path from 'node:path'
import type { BrowserPlugin, BrowserProfile, PluginVersion, ProfileDraft } from './types'
import { makeFingerprint } from './fingerprint'
import { dataRoot, profilesRoot } from './paths'
import { quarantineCorruptFile, writeJsonAtomic } from './persistence'
import { ProxyStore } from './proxies/store'
import { migrateProfilesToProxyStore, type MigratableProfile } from './proxies/migration'

function systemLocale() {
  return `${process.env.LANG || process.env.LC_ALL || process.env.LC_MESSAGES || ''}`.toLowerCase().startsWith('zh') ? 'zh' : 'en'
}

function message(en: string, zh: string) {
  return systemLocale() === 'zh' ? zh : en
}

function id() {
  return `env_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function pluginId(name: string) {
  return `plugin_${name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || Date.now().toString(36)}`
}

function versionId() {
  return `ver_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

/**
 * 把用户输入的 URL 规范化。空值返回 undefined（startUrl 已是可选字段，
 * 不再回退到 google.com 这种"默认 startUrl"——profile 的语义就是没设置就不打开）。
 */
function normalizeUrl(url?: string): string | undefined {
  const value = url?.trim()
  if (!value) return undefined
  if (/^https?:\/\//i.test(value)) return value
  return `https://${value}`
}

export { makeFingerprint }

export class ProfileStore {
  private readonly root: string
  private readonly profilesFile: string
  private readonly pluginsFile: string
  private profiles: BrowserProfile[] = []
  private plugins: BrowserPlugin[] = []
  /**
   * 迁移过程要把旧 inline proxy 落到 ProxyStore 才能写 proxyId,所以 ProfileStore 持有
   * 一个 ProxyStore 引用。构造顺序由 main.ts 控制:先 new ProxyStore(),再 new ProfileStore(proxyStore)。
   */
  private readonly proxyStore: ProxyStore

  constructor(proxyStore: ProxyStore) {
    this.proxyStore = proxyStore
    this.root = dataRoot()
    this.profilesFile = path.join(this.root, 'profiles.json')
    this.pluginsFile = path.join(this.root, 'plugins.json')
    fs.mkdirSync(this.root, { recursive: true })
    fs.mkdirSync(profilesRoot(), { recursive: true })
    this.load()
  }

  list() {
    return this.profiles
  }

  listPlugins() {
    return this.plugins
  }

  upsert(draft: ProfileDraft) {
    const now = new Date().toISOString()
    const existing = draft.id ? this.profiles.find((profile) => profile.id === draft.id) : undefined
    const profileId = existing?.id ?? id()

    // 代理决议:proxyId 是真源。
    //   - draft 显式带 proxyId(包括 null = 无代理) → 直接采用
    //   - draft 没带 proxyId 这个 key → 保留 existing.proxyId
    //   - existing 也没有 → null(无代理 = 走系统代理)
    //
    // inline proxy 字段已在 Phase 1c 删除;旧 UI 的 inline proxy 输入路径不再支持
    // (ProfileFormDialog 自 Phase 1b 起只递 proxyId)。
    let resolvedProxyId: string | null
    if (Object.prototype.hasOwnProperty.call(draft, 'proxyId')) {
      resolvedProxyId = draft.proxyId ?? null
    } else if (existing?.proxyId !== undefined) {
      resolvedProxyId = existing.proxyId
    } else {
      resolvedProxyId = null
    }

    // startUrl 是可选字段。语义：
    //   - draft 带 startUrl key（即使是空字符串）→ 用 draft 的值（normalize 后可能 undefined）
    //   - draft 完全没带这个 key → 保留 existing 的值
    // 这样既允许新建/编辑时清空，也允许 partial update 不动它。
    const startUrl = Object.prototype.hasOwnProperty.call(draft, 'startUrl')
      ? normalizeUrl(draft.startUrl)
      : existing?.startUrl

    const profile: BrowserProfile = {
      id: profileId,
      name: draft.name.trim() || existing?.name || message(`Environment ${this.profiles.length + 1}`, `环境 ${this.profiles.length + 1}`),
      notes: draft.notes?.trim() || existing?.notes || '',
      startUrl,
      enabledPluginIds: draft.enabledPluginIds ?? existing?.enabledPluginIds ?? [],
      proxyId: resolvedProxyId,
      fingerprint: makeFingerprint({ ...existing?.fingerprint, ...draft.fingerprint }, draft.targetOs),
      profilePath: existing?.profilePath || path.join(profilesRoot(), profileId),
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      lastOpenedAt: existing?.lastOpenedAt
    }

    fs.mkdirSync(profile.profilePath, { recursive: true })

    if (existing) {
      this.profiles = this.profiles.map((item) => (item.id === existing.id ? profile : item))
    } else {
      this.profiles = [profile, ...this.profiles]
    }
    this.save()
    return profile
  }

  remove(profileId: string) {
    this.profiles = this.profiles.filter((profile) => profile.id !== profileId)
    this.save()
  }

  duplicate(profileId: string) {
    const source = this.profiles.find((profile) => profile.id === profileId)
    if (!source) throw new Error(message('Profile not found', '环境不存在'))
    return this.upsert({
      name: `${source.name} (copy)`,
      notes: source.notes,
      startUrl: source.startUrl,
      enabledPluginIds: [...source.enabledPluginIds],
      proxyId: source.proxyId,
      fingerprint: { ...source.fingerprint },
      targetOs: source.fingerprint.targetOs
    })
  }

  markOpened(profileId: string) {
    const now = new Date().toISOString()
    this.profiles = this.profiles.map((profile) => profile.id === profileId ? { ...profile, lastOpenedAt: now, updatedAt: now } : profile)
    this.save()
  }

  get(profileId: string) {
    return this.profiles.find((profile) => profile.id === profileId)
  }

  activePluginVersions(pluginIds: string[]) {
    return pluginIds
      .map((pluginIdValue) => this.plugins.find((plugin) => plugin.id === pluginIdValue))
      .filter((plugin): plugin is BrowserPlugin => Boolean(plugin))
      .map((plugin) => plugin.versions.find((version) => version.id === plugin.activeVersionId))
      .filter((version): version is PluginVersion => Boolean(version))
  }

  addPluginVersion(input: {
    name: string
    version: string
    description?: string
    manifestVersion?: number
    optionsPage?: string
    popupPage?: string
    sourceZip?: string
    path: string
  }) {
    const now = new Date().toISOString()
    const existing = this.plugins.find((plugin) => plugin.name.toLowerCase() === input.name.toLowerCase())
    const version: PluginVersion = {
      id: versionId(),
      version: input.version,
      manifestVersion: input.manifestVersion,
      optionsPage: input.optionsPage,
      popupPage: input.popupPage,
      importedAt: now,
      sourceZip: input.sourceZip,
      path: input.path
    }

    if (existing) {
      const next: BrowserPlugin = {
        ...existing,
        description: input.description || existing.description,
        activeVersionId: version.id,
        versions: [version, ...existing.versions],
        updatedAt: now
      }
      this.plugins = this.plugins.map((plugin) => plugin.id === existing.id ? next : plugin)
      this.save()
      return next
    }

    const plugin: BrowserPlugin = {
      id: pluginId(input.name),
      name: input.name,
      description: input.description,
      activeVersionId: version.id,
      versions: [version],
      createdAt: now,
      updatedAt: now
    }
    this.plugins = [plugin, ...this.plugins]
    this.save()
    return plugin
  }

  setActivePluginVersion(pluginIdValue: string, versionIdValue: string) {
    const plugin = this.plugins.find((item) => item.id === pluginIdValue)
    if (!plugin || !plugin.versions.some((version) => version.id === versionIdValue)) {
      throw new Error(message('Plugin or version does not exist', '插件或版本不存在'))
    }
    this.plugins = this.plugins.map((item) => item.id === pluginIdValue
      ? { ...item, activeVersionId: versionIdValue, updatedAt: new Date().toISOString() }
      : item)
    this.save()
  }

  removePlugin(pluginIdValue: string) {
    this.plugins = this.plugins.filter((plugin) => plugin.id !== pluginIdValue)
    this.profiles = this.profiles.map((profile) => ({
      ...profile,
      enabledPluginIds: profile.enabledPluginIds.filter((idValue) => idValue !== pluginIdValue)
    }))
    this.save()
  }

  private load() {
    try {
      const rawProfiles = fs.existsSync(this.profilesFile)
        ? JSON.parse(fs.readFileSync(this.profilesFile, 'utf8')) as Array<BrowserProfile & { platform?: string; proxy?: unknown }>
        : []
      // 迁移历史字段:
      //   - 早期 profile 上有业务 `platform` 标签(amazon/shopify 等),现在已经没有这个概念
      //   - inline `proxy` 字段在 Phase 1c 删除,真源迁移到 ProxyStore + proxyId
      // 都通过解构丢弃,下次 save() 写回去时不再出现这两个字段。
      // startUrl 在历史数据里可能是 'https://www.google.com' 这种"默认值"——不动它
      // (用户主动改才生效),但下次他清空就真的能清空。
      const normalizedProfiles = rawProfiles.map((raw) => {
        const { platform: _legacyPlatform, proxy: _legacyProxy, ...rest } = raw
        return {
          ...rest,
          enabledPluginIds: rest.enabledPluginIds ?? [],
          fingerprint: makeFingerprint(rest.fingerprint)
        }
      })

      // ProxyStore 迁移:把没有 proxyId 的 profile,根据 inline `proxy` 字段找/建 ProxyStore 条目。
      // migration 模块是纯函数,需要把 ProxyStore 当前列表传进去 dedup,迁移完再 setAll 回去。
      const migrationInput: MigratableProfile[] = normalizedProfiles as unknown as MigratableProfile[]
      const { profiles: migratedRaw, proxies: nextProxies, migrated } = migrateProfilesToProxyStore(
        migrationInput,
        this.proxyStore.list()
      )
      if (migrated) {
        this.proxyStore.setAll(nextProxies)
      }
      const finalProfiles = migratedRaw as unknown as BrowserProfile[]

      this.profiles = finalProfiles
      // 写回 profiles.json:任何"规范化"/迁移产生的变更都立刻持久化。
      // (注:proxies.json 由 ProxyStore.setAll 自己持久化。)
      if (migrated || JSON.stringify(rawProfiles) !== JSON.stringify(finalProfiles)) {
        writeJsonAtomic(this.profilesFile, finalProfiles)
      }
    } catch (error) {
      console.error('[ProfileStore] failed to load profiles.json', error)
      quarantineCorruptFile(this.profilesFile)
      this.profiles = []
    }
    try {
      this.plugins = fs.existsSync(this.pluginsFile)
        ? JSON.parse(fs.readFileSync(this.pluginsFile, 'utf8')) as BrowserPlugin[]
        : []
    } catch (error) {
      console.error('[ProfileStore] failed to load plugins.json', error)
      quarantineCorruptFile(this.pluginsFile)
      this.plugins = []
    }
  }

  private save() {
    writeJsonAtomic(this.profilesFile, this.profiles)
    writeJsonAtomic(this.pluginsFile, this.plugins)
  }
}
