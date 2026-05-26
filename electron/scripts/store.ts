import fs from 'node:fs'
import path from 'node:path'
import type { Script, ScriptDraft, ScriptRun, ScriptRunStatus, ScriptScope, ScriptSource, ScriptTriggeredBy } from '../types'
import { scriptRunLogsRoot, scriptsRoot } from '../paths'
import { quarantineCorruptFile, writeJsonAtomic } from '../persistence'

const SCRIPT_META_FILENAME = 'script-meta.json'
const RUN_HISTORY_FILENAME = 'script-runs.json'
/** ScriptRun 历史落盘条数上限；超出从旧到新裁剪 */
const RUN_HISTORY_LIMIT = 200

const DEFAULT_SCRIPT_SOURCE = `import { page, log, sleep } from 'auto-registry'

// 脚本的主函数通过 default export 注册,bootstrap 会 await 它结束。
// args 默认是 {}; profile 字段是当前环境的只读快照,可读但不可改。
export default async function main(args) {
  const p = await page()
  await p.goto('https://example.com')
  log('title =', await p.title())
  await sleep(1000)
}
`

/**
 * 全局脚本默认模板。**没有** browser/page,**有** profiles / runScript。
 *
 * 这里写得很短,留给用户填业务。重点演示 runScript 的形状,让用户照葫芦画瓢。
 */
const DEFAULT_GLOBAL_SCRIPT_SOURCE = `import { profiles, runScript, log, sleep } from 'auto-registry'

// 全局脚本是调度器:它不绑 profile、不开浏览器,只能编排其它 profile-scope 脚本。
// 通过 runScript(scriptId, profileId, params?) 触发子脚本并 await 至结束。
export default async function main(args) {
  const all = await profiles.list()
  log('found', all.length, 'profiles')
  for (const p of all) {
    // 在每个环境上跑一遍 someScriptId,把 args.params.keyword 透传给子脚本
    // const result = await runScript('someScriptId', p.id, { keyword: 'demo' })
    // log(p.name, '→', result.status)
  }
  await sleep(100)
}
`

function generateScriptId(): string {
  return `script_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function generateRunId(): string {
  return `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

/**
 * Script 与 ScriptRun 的持久化。
 *
 * 设计要点：
 * - Script 数组持久化到 <userData>/registry-data/scripts/script-meta.json；原子写
 * - 每个 local 脚本有独立子目录 <scripts_root>/<scriptId>/，存放 index.ts / state.json / logs/
 * - external 脚本不创建目录，只在 meta 里记录 entryPath
 * - ScriptRun 的完整历史落 script-runs.json（最近 RUN_HISTORY_LIMIT 条）；正在跑的 run 不在这里，由 runtime 在内存里维护
 */
export class ScriptStore {
  private readonly metaFile: string
  private readonly runHistoryFile: string
  private scripts: Script[] = []
  private runs: ScriptRun[] = []

  constructor() {
    this.metaFile = path.join(scriptsRoot(), SCRIPT_META_FILENAME)
    this.runHistoryFile = path.join(scriptRunLogsRoot(), RUN_HISTORY_FILENAME)
    fs.mkdirSync(scriptsRoot(), { recursive: true })
    fs.mkdirSync(scriptRunLogsRoot(), { recursive: true })
    this.load()
  }

  list(): Script[] {
    return this.scripts
  }

  get(scriptId: string): Script | undefined {
    return this.scripts.find((script) => script.id === scriptId)
  }

  /**
   * 新建或更新脚本。
   * - local 新建：自动生成脚本目录与 index.ts（写入 initialSource 或默认模板）
   * - local 编辑 meta：只改名字 / 描述，源码由调用方另行写文件
   * - external：只在 meta 里注册；entryPath 必须是已有的绝对路径
   */
  upsert(draft: ScriptDraft): Script {
    const now = new Date().toISOString()
    const existing = draft.id ? this.get(draft.id) : undefined
    const scriptId = existing?.id ?? generateScriptId()

    if (!existing) {
      if (draft.source === 'external') {
        if (!draft.entryPath || !path.isAbsolute(draft.entryPath)) {
          throw new Error('external script requires an absolute entryPath')
        }
        if (!fs.existsSync(draft.entryPath)) {
          throw new Error(`external script entryPath does not exist: ${draft.entryPath}`)
        }
      }
    }

    const entryPath = existing?.entryPath ?? (draft.source === 'external'
      ? (draft.entryPath as string)
      : path.join(scriptsRoot(), scriptId, 'index.ts'))

    // scope 一旦确定就不允许改 —— 改 scope 等价于换一种 SDK 表面,会让源码瞬间不可执行。
    // 用户想换 scope 应该重新建一个脚本。
    const scope: ScriptScope = existing?.scope ?? draft.scope ?? 'profile'

    const script: Script = {
      id: scriptId,
      name: draft.name.trim() || existing?.name || 'Untitled script',
      description: draft.description?.trim() || existing?.description,
      source: existing?.source ?? draft.source,
      scope,
      entryPath,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    }

    // local 新建脚本:落模板文件。global 用全局模板,profile 用 profile 模板。
    if (!existing && script.source === 'local') {
      fs.mkdirSync(path.dirname(script.entryPath), { recursive: true })
      if (!fs.existsSync(script.entryPath)) {
        const template = draft.initialSource
          ?? (scope === 'global' ? DEFAULT_GLOBAL_SCRIPT_SOURCE : DEFAULT_SCRIPT_SOURCE)
        fs.writeFileSync(script.entryPath, template)
      }
    }

    if (existing) {
      this.scripts = this.scripts.map((item) => (item.id === existing.id ? script : item))
    } else {
      this.scripts = [script, ...this.scripts]
    }
    this.saveMeta()
    return script
  }

  /**
   * 删除脚本。
   * - local：元数据 + 脚本目录（含日志）一起清掉
   * - external：只删元数据，用户自己的目录不碰
   */
  remove(scriptId: string): void {
    const target = this.get(scriptId)
    if (!target) return
    this.scripts = this.scripts.filter((script) => script.id !== scriptId)
    this.saveMeta()

    if (target.source === 'local') {
      const dir = path.join(scriptsRoot(), scriptId)
      try {
        fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 })
      } catch (error) {
        console.error('[ScriptStore] failed to delete script dir', dir, error)
      }
    }

    // 同一 scriptId 的历史 run 也清掉，避免悬空引用
    this.runs = this.runs.filter((run) => run.scriptId !== scriptId)
    this.saveRuns()
  }

  /**
   * 读取 local 脚本的源码。external 脚本由调用方自己决定要不要读（避免意外读外部磁盘）。
   */
  readSource(scriptId: string): string {
    const script = this.get(scriptId)
    if (!script) throw new Error(`script not found: ${scriptId}`)
    return fs.readFileSync(script.entryPath, 'utf8')
  }

  /** 覆盖 local 脚本的源码；external 脚本拒绝写入 */
  writeSource(scriptId: string, source: string): void {
    const script = this.get(scriptId)
    if (!script) throw new Error(`script not found: ${scriptId}`)
    if (script.source !== 'local') {
      throw new Error('cannot write source to external script; edit the file in your own editor')
    }
    fs.mkdirSync(path.dirname(script.entryPath), { recursive: true })
    fs.writeFileSync(script.entryPath, source)
    const now = new Date().toISOString()
    this.scripts = this.scripts.map((item) => item.id === scriptId ? { ...item, updatedAt: now } : item)
    this.saveMeta()
  }

  // —— ScriptRun history ————————————————————————————————————————

  listRuns(): ScriptRun[] {
    return this.runs
  }

  /**
   * 创建一个 run 占位记录。运行结束后由 finalizeRun 落盘。
   *
   * profileId 留空字符串表示全局脚本(不绑 profile);profile-scope 必须传非空。
   * triggeredBy / parentRunId / params 用于跟踪调度链,见 ScriptRun 字段注释。
   */
  createRun(
    scriptId: string,
    profileId: string,
    options: {
      triggeredBy?: ScriptTriggeredBy
      parentRunId?: string
      params?: Record<string, unknown>
    } = {}
  ): ScriptRun {
    const id = generateRunId()
    const logPath = path.join(scriptRunLogsRoot(), `${id}.log`)
    const run: ScriptRun = {
      id,
      scriptId,
      profileId,
      status: 'pending',
      startedAt: new Date().toISOString(),
      logPath,
      triggeredBy: options.triggeredBy ?? 'manual',
      parentRunId: options.parentRunId,
      params: options.params
    }
    // 先不持久化,等 finalize 才落盘;减少写放大
    return run
  }

  /** 运行结束时把 run 追加到历史表并滚动裁剪 */
  finalizeRun(run: ScriptRun, status: ScriptRunStatus, patch: { exitCode?: number | null; error?: string } = {}): ScriptRun {
    const finalized: ScriptRun = {
      ...run,
      status,
      endedAt: new Date().toISOString(),
      exitCode: patch.exitCode ?? run.exitCode,
      error: patch.error ?? run.error
    }
    this.runs = [finalized, ...this.runs].slice(0, RUN_HISTORY_LIMIT)
    this.saveRuns()
    return finalized
  }

  // —— internal ————————————————————————————————————————————————

  private load(): void {
    try {
      if (fs.existsSync(this.metaFile)) {
        const raw = JSON.parse(fs.readFileSync(this.metaFile, 'utf8')) as Array<Partial<Script>>
        // 老数据兼容:scope 字段是 spec phase 2 引入的,缺省补 'profile'(老脚本都是绑 profile)
        this.scripts = Array.isArray(raw)
          ? raw
              .filter((script): script is Script => Boolean(script && script.id))
              .map((script) => ({
                ...script,
                scope: script.scope ?? 'profile'
              }))
          : []
      }
    } catch (error) {
      console.error('[ScriptStore] failed to load script-meta.json', error)
      quarantineCorruptFile(this.metaFile)
      this.scripts = []
    }

    try {
      if (fs.existsSync(this.runHistoryFile)) {
        const raw = JSON.parse(fs.readFileSync(this.runHistoryFile, 'utf8')) as Array<Partial<ScriptRun>>
        // 老 run 没 triggeredBy 字段,视为手动触发(spec §3.4)
        this.runs = Array.isArray(raw)
          ? raw
              .filter((run): run is ScriptRun => Boolean(run && run.id))
              .map((run) => ({
                ...run,
                triggeredBy: run.triggeredBy ?? 'manual'
              }))
          : []
      }
    } catch (error) {
      console.error('[ScriptStore] failed to load script-runs.json', error)
      quarantineCorruptFile(this.runHistoryFile)
      this.runs = []
    }
  }

  private saveMeta(): void {
    writeJsonAtomic(this.metaFile, this.scripts)
  }

  private saveRuns(): void {
    writeJsonAtomic(this.runHistoryFile, this.runs)
  }
}

// 使 source 从外部模块也能拿到默认模板（便于"新建脚本"按钮提供相同示例）
export { DEFAULT_SCRIPT_SOURCE }
/** 仅保留给 SDK d.ts 生成工具消费，避免 import 孤立 */
export type { ScriptSource }
