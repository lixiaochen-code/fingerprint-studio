import fs from 'node:fs'
import path from 'node:path'
import { writeJsonAtomic } from '../../persistence'

const FILENAME = 'state.json'

/**
 * 文件级 KV：简单实用，脚本里最常见的需求是"记录上次跑到第几页 / 上次登录时间"。
 * 每次写都会把整张 map 原子写回磁盘，不做缓存——脚本运行结束进程就没了，
 * 不担心内存版本和磁盘版本漂移。
 *
 * 设计折中：多个 ScriptRun 并发写同一 state.json 存在覆盖风险，这是 spec 里
 * 接受的语义（"脚本作者自理"）。后续如有强一致诉求再换 better-sqlite3。
 */
export class KvStore {
  private readonly filePath: string

  constructor(workingDir: string) {
    fs.mkdirSync(workingDir, { recursive: true })
    this.filePath = path.join(workingDir, FILENAME)
  }

  async get<T = unknown>(key: string): Promise<T | null> {
    const all = this.readAll()
    return (all[key] as T | undefined) ?? null
  }

  async set(key: string, value: unknown): Promise<void> {
    const all = this.readAll()
    all[key] = value
    writeJsonAtomic(this.filePath, all)
  }

  async delete(key: string): Promise<void> {
    const all = this.readAll()
    if (!(key in all)) return
    delete all[key]
    writeJsonAtomic(this.filePath, all)
  }

  private readAll(): Record<string, unknown> {
    if (!fs.existsSync(this.filePath)) return {}
    try {
      const raw = JSON.parse(fs.readFileSync(this.filePath, 'utf8'))
      return raw && typeof raw === 'object' ? raw as Record<string, unknown> : {}
    } catch (error) {
      console.error('[kv] failed to read state.json; resetting in-memory view', error)
      return {}
    }
  }
}
