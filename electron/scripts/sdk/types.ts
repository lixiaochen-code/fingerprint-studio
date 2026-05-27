import type { Browser, Page } from 'rebrowser-puppeteer-core'
import type { BrowserProfile, ProfileDraft, ScriptRun, ScriptScope } from '../../types'
// 仅 import type:bridge-client.ts 含有 process.on('message') 等运行时副作用,
// 类型层引用走 `import type` 在编译期就被擦除,确保 types.ts 仍是纯类型文件,
// 不会把 fork 侧运行时代码拖到任何 import 它的模块里(渲染层、主进程都会读这份类型)。
import type { BridgeClient } from './bridge-client'

/**
 * 用户脚本 `import { ... } from 'auto-registry'` 看到的所有导出类型。
 * 这份类型同时也是 Monaco 编辑器里自动补全的类型源——构建流程会把它输出为
 * `auto-registry.d.ts` 交给 Monaco。
 *
 * 设计:两种 scope (`profile` / `global`) **共享同一份接口表面**,运行时根据
 * scope 走不同分支 —— 在错误的 scope 调某 API 会 throw 一个明确的语义错误,
 * 而不是悄悄返回 undefined。这样 Monaco 不需要按当前编辑哪个脚本切换补全。
 */

/**
 * runScript 调用一次后返回的子 run 终态。
 * `succeeded` / `failed` / `stopped` 三种之一;详细日志通过 onEvent 流式订阅(暂未提供)
 * 或读取 logPath 文件回放。
 */
export interface RunScriptResult {
  run: ScriptRun
}

/**
 * 全局脚本 main 接收的参数结构。也作为 profile-scope 脚本 main 的参数,
 * 只是 profile 字段不为 null。
 *
 * P 是 params 形状的泛型;调用方(全局脚本 / 队列 / 手动)传什么,这里就是什么。
 * 默认 Record<string, unknown> 表示"任意 JSON 对象",用户想要严格类型时:
 *   `export default async function main(args: ScriptMainArgs<{ keyword: string }>) { ... }`
 */
export interface ScriptMainArgs<P = Record<string, unknown>> {
  /** 调度方传入的参数;手动 run 时为 {} */
  params: P
  /** profile-scope 脚本是当前环境的只读快照;global-scope 脚本为 null */
  profile: Readonly<BrowserProfile> | null
  /** 当前 ScriptRun 元数据 */
  run: { id: string; startedAt: string }
  /** 触发源,脚本可据此分支 */
  triggeredBy: 'manual' | 'global-script' | 'on-create' | 'on-launch'
  /** 父 run id;由全局脚本 runScript 触发时存在 */
  parentRunId?: string
}

/**
 * profile.* 命名空间(全局脚本主要用到的 API)。
 * 在 profile-scope 脚本里调任何 profile.* 方法会 throw GlobalNotAvailableError。
 */
export interface ProfilesApi {
  list(): Promise<Readonly<BrowserProfile>[]>
  get(id: string): Promise<Readonly<BrowserProfile> | null>
  /**
   * 仅启动 profile 浏览器,不跑任何脚本。等 CDP 就绪后 resolve。
   * 已启动则 no-op 复用同一进程。
   * profile-scope 脚本调用会 reject GLOBAL_NOT_AVAILABLE。
   */
  launch(id: string): Promise<void>
  /**
   * 显式关闭 profile 浏览器,等浏览器进程真退出后 resolve。
   * profile 上有活跃 ScriptRun 时 reject PROFILE_BUSY(带 occupiedBy)。
   * 浏览器本来就没在跑则 no-op resolve。
   * profile-scope 脚本调用会 reject GLOBAL_NOT_AVAILABLE。
   */
  close(id: string): Promise<void>
  /** 创建 profile;draft.id 冲突时 throw ProfileIdTakenError */
  create(draft: ProfileDraft): Promise<BrowserProfile>
  delete(id: string): Promise<void>
  /**
   * 改 profile 的某条队列。kind='on-create' / 'on-launch'。
   * scriptIds 必须全部是 scope='profile' 脚本;否则 throw InvalidQueueError。
   */
  setQueue(profileId: string, kind: 'on-create' | 'on-launch', scriptIds: string[]): Promise<void>
}

export interface ScriptApi {
  /**
   * 当前脚本运行绑定的环境配置(只读)。
   * - profile-scope 脚本:返回 profile 快照
   * - global-scope 脚本:**为 null**,全局脚本不绑环境
   */
  readonly profile: Readonly<BrowserProfile> | null

  /**
   * 获取 puppeteer-core 的 Browser 实例(与该环境的浏览器相连)。
   * - profile-scope:正常返回 Browser
   * - global-scope:throw BrowserNotAvailableError
   *
   * 多次调用返回同一个实例——浏览器连接在脚本生命周期内保持。
   * 第一次调用时会等待浏览器就绪(CDP endpoint 可用)。
   */
  browser(): Promise<Browser>

  /**
   * 拿到第一个 tab,如果浏览器里没 tab 则新建一个。
   * 是 `browser().pages()[0] ?? browser().newPage()` 的便捷封装。
   * global-scope 脚本调用同样会 throw BrowserNotAvailableError。
   */
  page(): Promise<Page>

  /**
   * 日志输出。会同时落到控制台和应用的日志面板。
   * 传入对象会自动 JSON.stringify(格式化过)。
   */
  log: (...args: unknown[]) => void
  warn: (...args: unknown[]) => void
  error: (...args: unknown[]) => void

  /** 休眠 ms 毫秒;脚本被停止时会提前 reject */
  sleep(ms: number): Promise<void>

  /**
   * 基于文件的 KV 存储,持久化到 `<script-dir>/state.json`。
   * 跨 run 保留;同一脚本的多个 run 并发写有覆盖风险(脚本作者自理)。
   * external 脚本的 state.json 落在脚本文件同目录下。
   */
  kv: {
    get<T = unknown>(key: string): Promise<T | null>
    set(key: string, value: unknown): Promise<void>
    delete(key: string): Promise<void>
  }

  /**
   * 用户点"停止"时 abort 的信号。
   * 脚本作者可以把它传给 puppeteer 的某些 API(目前多数 puppeteer-core 方法
   * 不直接接受 signal),或者自己在长循环里 `if (stopSignal.aborted) return`。
   */
  readonly stopSignal: AbortSignal

  /**
   * profile.* 命名空间(全局脚本调度 API)。
   * 在 profile-scope 脚本里调任何方法会 throw GlobalNotAvailableError。
   */
  profiles: ProfilesApi

  /**
   * 触发某个 profile-scope 脚本运行,await 至结束。
   * - profile-scope 脚本调用:throw GlobalNotAvailableError
   * - global-scope 脚本:正常 await 子 run 结束并返回终态
   *
   * 子 run 自动带 parentRunId=当前全局 run id;triggeredBy='global-script'。
   * 用户停全局 run → 当前等待中的子 run 同时被停。
   */
  runScript(scriptId: string, profileId: string, params?: Record<string, unknown>): Promise<RunScriptResult>
}

/**
 * bootstrap 调用 SDK 工厂时注入的依赖集合。
 * 把"当前 profile / CDP endpoint / 日志通道 / 信号"统一封装,方便:
 * 1. 同一份 SDK 实现供 fork 子进程使用(Phase 2)
 * 2. 后续也可以供 Dev Server HTTP 通道复用(Phase 4)
 */
export interface ScriptContext {
  /** 脚本作用域 */
  scope: ScriptScope
  /** profile-scope 必传;global-scope 为 null */
  profile: BrowserProfile | null
  /** profile-scope 必传(puppeteer.connect 的 browserWSEndpoint);global-scope 为 null */
  webSocketDebuggerUrl: string | null
  /** 脚本工作目录:kv.state.json 会落在这里 */
  workingDir: string
  /** 父进程订阅的日志通道 */
  logSink: (level: 'info' | 'warn' | 'error', args: unknown[]) => void
  /** 父进程下发停止信号时触发 */
  stopSignal: AbortSignal
  /**
   * fork ↔ main 双向 IPC 通道客户端。global-scope 必须由 bootstrap 注入一个真实
   * 实例(BridgeClient),否则 SDK 全局分支(profiles.list/get、runScript)会拿
   * 不到通道直接报"wiring bug"。profile-scope 不需要这条通道(profiles.* 与
   * runScript 都直接 reject `GLOBAL_NOT_AVAILABLE`,见 SDK 实现),传 null 即可。
   *
   * 设计为可选 + null 默认,避免破坏既有 profile-scope 调用方:
   *   - phase 1/2 的测试桩 / 渲染层调用方构造 ScriptContext 时不传 bridge → 走
   *     undefined → SDK 内部统一按 null 处理,profile-scope 路径继续工作;
   *   - 全局脚本则严格要求 bridge 非 null(见 createScriptApi 的 wiring 检查)。
   */
  bridge?: BridgeClient | null
}
