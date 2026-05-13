import fs from 'node:fs'
import path from 'node:path'
import { fork, type ChildProcess } from 'node:child_process'
import { EventEmitter } from 'node:events'
import type { BrowserProfile, Script, ScriptRun, ScriptRunStatus } from '../types'
import type { ScriptStore } from './store'
import { scriptsRoot } from '../paths'

/**
 * 每个 ScriptRun 的日志事件，主进程会转发到渲染层。
 * 我们保留 line-based 的日志，既方便 UI 滚动显示，也便于 grep 排障。
 */
export interface ScriptLogEvent {
  runId: string
  level: 'info' | 'warn' | 'error' | 'stdout' | 'stderr'
  line: string
  at: string
}

export interface ScriptStatusEvent {
  runId: string
  status: ScriptRunStatus
  exitCode?: number | null
  error?: string
  endedAt?: string
}

export type ScriptRuntimeEvent =
  | ({ type: 'log' } & ScriptLogEvent)
  | ({ type: 'status' } & ScriptStatusEvent)

type ActiveRun = {
  run: ScriptRun
  child: ChildProcess
  logStream: fs.WriteStream
  abort: AbortController
  /** 手动触发 stop 时置位；用于区分 SIGTERM 是用户意图还是异常 */
  userStopped: boolean
  /** SIGTERM 之后的强杀定时器，用来在 graceful window 过后 SIGKILL */
  killTimer?: NodeJS.Timeout
}

const GRACEFUL_SHUTDOWN_MS = 3000

/**
 * 父进程侧的脚本执行管理器。负责：
 *  - fork 子进程，传入 ScriptContext（通过 env 而非 argv，避免进程列表泄漏）
 *  - 捕获 stdout/stderr/IPC 消息，流到渲染层 + 落日志文件
 *  - 停止/超时 → SIGTERM（让子进程 abort stopSignal 体面退出）→ 3s 后 SIGKILL
 *  - 生命周期结束后调用 store.finalizeRun 落盘
 *
 * 浏览器连接是 SDK 在子进程里建立的；我们不在父进程这边持有 puppeteer 实例。
 * 这样即使父进程重启（极端情况），正在跑的脚本/浏览器状态也保持独立。
 */
export class ScriptRuntimeManager extends EventEmitter {
  private readonly active = new Map<string, ActiveRun>()

  constructor(private readonly store: ScriptStore) {
    super()
  }

  /**
   * 当前所有活跃 run 的快照；渲染层用于刷新运行中状态。
   */
  listActive(): ScriptRun[] {
    return Array.from(this.active.values()).map((entry) => entry.run)
  }

  isRunning(runId: string): boolean {
    return this.active.has(runId)
  }

  async start(options: {
    script: Script
    profile: BrowserProfile
    webSocketDebuggerUrl: string
  }): Promise<ScriptRun> {
    const { script, profile, webSocketDebuggerUrl } = options
    const run = this.store.createRun(script.id, profile.id)

    // 工作目录：local 脚本用自身目录；external 脚本用 <scriptsRoot>/external-states/<scriptId>
    // 避免往用户自己的项目目录里写 state.json / .compiled
    const workingDir = script.source === 'local'
      ? path.dirname(script.entryPath)
      : path.join(scriptsRoot(), 'external-states', script.id)
    fs.mkdirSync(workingDir, { recursive: true })

    // 日志文件
    fs.mkdirSync(path.dirname(run.logPath), { recursive: true })
    const logStream = fs.createWriteStream(run.logPath, { flags: 'a' })

    const bootstrapPath = resolveBootstrapPath()

    const contextEnv = JSON.stringify({
      profile,
      webSocketDebuggerUrl,
      workingDir,
      entryPath: script.entryPath
    })

    const child = fork(bootstrapPath, [], {
      cwd: workingDir,
      env: this.makeChildEnv(contextEnv),
      stdio: ['ignore', 'pipe', 'pipe', 'ipc']
    })

    const abort = new AbortController()
    const startedRun: ScriptRun = { ...run, status: 'running' }

    const entry: ActiveRun = {
      run: startedRun,
      child,
      logStream,
      abort,
      userStopped: false
    }
    this.active.set(run.id, entry)

    this.emitStatus(run.id, 'running')

    // stdout/stderr（用户自己 console.log 的内容也会走这里）
    child.stdout?.on('data', (chunk: Buffer) => this.handleStream(run.id, 'stdout', chunk))
    child.stderr?.on('data', (chunk: Buffer) => this.handleStream(run.id, 'stderr', chunk))

    // SDK 用 process.send 发的结构化日志 / 状态消息
    child.on('message', (message: unknown) => this.handleChildMessage(run.id, message))

    child.on('exit', (code) => this.handleExit(run.id, code))
    child.on('error', (error) => {
      this.appendLog(run.id, 'error', `[runtime] child process error: ${error.message}`)
    })

    return startedRun
  }

  async stop(runId: string): Promise<void> {
    const entry = this.active.get(runId)
    if (!entry) return
    entry.userStopped = true
    entry.abort.abort()
    try {
      entry.child.kill('SIGTERM')
    } catch (error) {
      console.error('[runtime] kill(SIGTERM) failed', error)
    }
    entry.killTimer = setTimeout(() => {
      try { entry.child.kill('SIGKILL') } catch {}
    }, GRACEFUL_SHUTDOWN_MS)
  }

  /** 停止所有活跃 run；UI 还没做之前这个接口方便手工清理孤儿 */
  async stopAll(): Promise<void> {
    await Promise.all(Array.from(this.active.keys()).map((id) => this.stop(id)))
  }

  /** 应用退出时尽量终止所有子进程，避免留下孤儿 */
  async shutdown(): Promise<void> {
    const pending: Promise<void>[] = []
    for (const runId of Array.from(this.active.keys())) {
      pending.push(this.stop(runId))
    }
    await Promise.all(pending)
  }

  // —— internal ————————————————————————————————————————————————

  private makeChildEnv(contextEnv: string): NodeJS.ProcessEnv {
    // 只透传最小必要环境变量 + 我们自己的注入；避免把整台机器的 env 复制给脚本
    const passthroughKeys = ['PATH', 'HOME', 'USER', 'LANG', 'LC_ALL', 'LC_MESSAGES', 'TMPDIR', 'TEMP', 'TMP', 'SystemRoot', 'APPDATA', 'LOCALAPPDATA']
    const env: NodeJS.ProcessEnv = {
      AUTO_REGISTRY_SCRIPT_CONTEXT: contextEnv,
      NODE_ENV: 'production'
    }
    for (const key of passthroughKeys) {
      if (process.env[key] !== undefined) env[key] = process.env[key]
    }
    return env
  }

  private handleStream(runId: string, level: 'stdout' | 'stderr', chunk: Buffer): void {
    const text = chunk.toString('utf8')
    const lines = text.split('\n')
    for (const line of lines) {
      if (!line) continue
      this.appendLog(runId, level, line)
    }
  }

  private handleChildMessage(runId: string, message: unknown): void {
    if (!message || typeof message !== 'object') return
    const payload = message as Record<string, unknown>
    if (payload.type === 'log') {
      this.appendLog(runId, (payload.level as ScriptLogEvent['level']) ?? 'info', String(payload.line ?? ''))
    }
    // 'ready' / 'completed' / 'failed' 目前不单独处理：真正的状态由 exit 事件决定
  }

  private appendLog(runId: string, level: ScriptLogEvent['level'], line: string): void {
    const entry = this.active.get(runId)
    const at = new Date().toISOString()
    const formatted = `[${at}] [${level}] ${line}\n`
    entry?.logStream.write(formatted)
    const event: ScriptLogEvent = { runId, level, line, at }
    this.emit('event', { type: 'log', ...event } satisfies ScriptRuntimeEvent)
  }

  private handleExit(runId: string, code: number | null): void {
    const entry = this.active.get(runId)
    if (!entry) return
    this.active.delete(runId)
    if (entry.killTimer) clearTimeout(entry.killTimer)
    entry.logStream.end()

    const status: ScriptRunStatus = entry.userStopped
      ? 'stopped'
      : code === 0 ? 'succeeded' : 'failed'
    // 用户主动停止时 bootstrap 会以非 0 退出（因为 stopSignal abort 抛了异常），
    // 这个退出码对用户没有意义，清掉避免 UI 显示成"失败"。
    const reportedExit = status === 'stopped' ? null : code
    const finalized = this.store.finalizeRun(entry.run, status, {
      exitCode: reportedExit,
      error: status === 'failed' ? `Script exited with code ${code}` : undefined
    })

    this.emitStatus(runId, status, {
      exitCode: reportedExit,
      error: finalized.error,
      endedAt: finalized.endedAt
    })
  }

  private emitStatus(runId: string, status: ScriptRunStatus, extras: Partial<ScriptStatusEvent> = {}): void {
    const event: ScriptStatusEvent = { runId, status, ...extras }
    this.emit('event', { type: 'status', ...event } satisfies ScriptRuntimeEvent)
  }
}

/**
 * 解析 bootstrap.js 的绝对路径。
 *
 * - Dev 模式：tsc 把 electron/ 编译到 dist-electron/，bootstrap 在 dist-electron/scripts/bootstrap.js
 * - 打包后：electron 主进程自己也在 dist-electron 里，__dirname 指向它；由于 asarUnpack 配置决定
 *   bootstrap 是否在 asar 包内。fork 对 asar 支持有限，保守起见让 bootstrap 随主进程代码一起被打进同位置，
 *   Node 读取 asar 是透明的（Electron 运行时处理）。
 */
function resolveBootstrapPath(): string {
  const candidate = path.join(__dirname, 'scripts', 'bootstrap.js')
  if (fs.existsSync(candidate)) return candidate
  // 兜底：开发时 runtime.ts 也编译到 dist-electron/scripts/ 下，__dirname 同级就是 bootstrap.js
  const sibling = path.join(__dirname, 'bootstrap.js')
  if (fs.existsSync(sibling)) return sibling
  throw new Error(`bootstrap.js not found near ${__dirname}; looked at ${candidate} and ${sibling}`)
}
