import type { Browser, Page } from 'rebrowser-puppeteer-core'
import type { BrowserProfile } from '../../types'

/**
 * 用户脚本 `import { ... } from 'auto-registry'` 看到的所有导出类型。
 * 这份类型同时也是 Monaco 编辑器里自动补全的类型源——构建流程会把它输出为
 * `auto-registry.d.ts` 交给 Monaco。
 */
export interface ScriptApi {
  /**
   * 当前脚本运行绑定的环境配置（只读）。
   * 包含 profile id、名字、代理、指纹等。修改这个对象不会影响应用，
   * 如果要改 profile 请通过另外的管理 API（尚未暴露）。
   */
  readonly profile: Readonly<BrowserProfile>

  /**
   * 获取 puppeteer-core 的 Browser 实例（与该环境的浏览器相连）。
   * 多次调用返回同一个实例——浏览器连接在脚本生命周期内保持。
   * 第一次调用时会等待浏览器就绪（CDP endpoint 可用）。
   */
  browser(): Promise<Browser>

  /**
   * 拿到第一个 tab，如果浏览器里没 tab 则新建一个。
   * 是 `browser().pages()[0] ?? browser().newPage()` 的便捷封装。
   */
  page(): Promise<Page>

  /**
   * 日志输出。会同时落到控制台和应用的日志面板。
   * 传入对象会自动 JSON.stringify（格式化过）。
   */
  log: (...args: unknown[]) => void
  warn: (...args: unknown[]) => void
  error: (...args: unknown[]) => void

  /** 休眠 ms 毫秒；脚本被停止时会提前 reject */
  sleep(ms: number): Promise<void>

  /**
   * 基于文件的 KV 存储，持久化到 `<script-dir>/state.json`。
   * 跨 run 保留；同一脚本的多个 run 并发写有覆盖风险（脚本作者自理）。
   * external 脚本的 state.json 落在脚本文件同目录下。
   */
  kv: {
    get<T = unknown>(key: string): Promise<T | null>
    set(key: string, value: unknown): Promise<void>
    delete(key: string): Promise<void>
  }

  /**
   * 用户点"停止"时 abort 的信号。
   * 脚本作者可以把它传给 puppeteer 的某些 API（目前多数 puppeteer-core 方法
   * 不直接接受 signal），或者自己在长循环里 `if (stopSignal.aborted) return`。
   */
  readonly stopSignal: AbortSignal
}

/**
 * bootstrap 调用 SDK 工厂时注入的依赖集合。
 * 把"当前 profile / CDP endpoint / 日志通道 / 信号"统一封装，方便：
 * 1. 同一份 SDK 实现供 fork 子进程使用（Phase 2）
 * 2. 后续也可以供 Dev Server HTTP 通道复用（Phase 4）
 */
export interface ScriptContext {
  profile: BrowserProfile
  /** puppeteer.connect 用的 browserWSEndpoint */
  webSocketDebuggerUrl: string
  /** 脚本工作目录：kv.state.json 会落在这里 */
  workingDir: string
  /** 父进程订阅的日志通道 */
  logSink: (level: 'info' | 'warn' | 'error', args: unknown[]) => void
  /** 父进程下发停止信号时触发 */
  stopSignal: AbortSignal
}
