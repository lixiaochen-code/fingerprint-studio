/**
 * fork ↔ main 双向 IPC 协议类型定义(纯类型文件,零运行时代码)
 *
 * ## 为什么独立成类型文件
 *
 * fork 侧的 `electron/scripts/sdk/bridge-client.ts` 与主进程侧的
 * `electron/scripts/bridge.ts` 都需要 import 这套信封类型(BridgeRequest /
 * BridgeResponse / BridgeError / BridgeMethod / BridgeErrorCode)。
 *
 * 如果把这些类型放在任一侧的实现文件里,另一侧 import 时就会顺带把对方的运行时
 * 代码(`process.send` 监听 / `Script_Runtime` 引用 / `Profile_Store` 引用 等)
 * 也拖进自己的依赖图,从而:
 *
 *   1. fork 子进程的 bootstrap 体积里出现根本不该被加载的主进程代码;
 *   2. 主进程 import bridge-client.ts 时会触发 fork 端的 `process.on('message')`
 *      副作用注册;
 *   3. 形成 bridge.ts ↔ bridge-client.ts 的循环依赖,TypeScript 编译能过但
 *      运行时模块初始化顺序会出 NPE。
 *
 * 把"形状"(纯 type)与"行为"(运行时类)严格分离,放到第三方文件,两侧各自
 * `import type { ... } from './bridge-types'` 即可,既无运行时副作用也无循环。
 *
 * ## 字段形状口径
 *
 * 严格对齐:
 *   - design.md §5.1(BridgeMethod / BridgeRequest / BridgeResponse / 接口骨架)
 *   - design.md §6.1(BridgeError / BridgeErrorCode / 信封字段细则)
 *
 * 任何字段改动都要先回到 design.md 同步,再回头改这里 —— 这里是协议契约,
 * 不是实现细节。
 */

/**
 * fork ↔ main 协议白名单方法。
 *
 * - `profiles.list` / `profiles.get`:全局脚本读 ProfileStore 真源
 * - `profiles.launch` / `profiles.close`:全局脚本控制浏览器生命周期(只启动 / 显式
 *   关闭),不跑任何脚本。launch 已启动则 no-op 复用,close 没在跑则 no-op resolve;
 *   close 在 PROFILE_BUSY 时早返回不动浏览器。详见 launch-close 子 spec。
 * - `profiles.create`:全局脚本批量注册新 profile。draft.id 可省(让 store 自动生成)
 *   或显式指定;冲突时回 PROFILE_ID_TAKEN,非法字符回 INVALID_PROFILE_ID。
 *   注:phase 6-runtime spec §Requirement 8 原本把 create / delete / setQueue 都列为
 *   "GLOBAL_NOT_IMPL_YET 占位",这里把 create / delete 提前实装(用户的批量注册诉求最高),
 *   setQueue 仍占位。
 * - `profiles.delete`:全局脚本删除 profile。互斥规则:profile 上有活跃 ScriptRun 时
 *   reject PROFILE_BUSY(带 occupiedBy);否则先关浏览器(若在跑),再删 store + user-data。
 * - `runScript`:全局脚本调度子 ScriptRun
 *
 * `setQueue` 在 SDK 层就 throw `GLOBAL_NOT_IMPL_YET`,不会发起 BridgeRequest,
 * 因此不在本联合中。
 */
export type BridgeMethod =
  | 'profiles.list'
  | 'profiles.get'
  | 'profiles.launch'
  | 'profiles.close'
  | 'profiles.create'
  | 'profiles.delete'
  | 'runScript'

/**
 * fork → main 请求信封。
 *
 * - `id`:fork 进程内单调递增的 correlation id(从 1 起,由 BridgeClient 维护)。
 *   每个 fork 独占自己的 counter;不需要 UUID,因为 id 永远只在该 fork 与主进程
 *   之间一对一使用。
 * - `payload`:故意写成 `unknown`,各 method 在 ScriptBridge 内 switch 时各自做
 *   形状校验(简单 typeof / in 操作);避免在协议层引入 zod 等依赖。
 */
export interface BridgeRequest {
  kind: 'request'
  id: number
  method: BridgeMethod
  payload: unknown
}

/**
 * main → fork 响应信封。
 *
 * 显式分成"成功 / 失败"两个变体,而不是 `{ ok: boolean, value?, error? }` 一个
 * 形状,目的是让 TypeScript 在 `if (response.ok)` 之后能精确收窄出 `value` 字段;
 * 失败分支同理收窄出 `error`。
 *
 * `id` 必须严格等于对应 BridgeRequest 的 `id` —— 这是 Correlation id 不串扰的
 * 协议级保证,详见 requirements §9。
 */
export type BridgeResponse =
  | { kind: 'response'; id: number; ok: true; value: unknown }
  | { kind: 'response'; id: number; ok: false; error: BridgeError }

/**
 * 失败响应里的错误对象。
 *
 * 用"带 code 的 plain object"而不是 throw 一个 Error 实例,理由:
 *   1. Node IPC 序列化 Error 实例会丢 stack 之外的自定义字段
 *      (例如 `ProfileBusyError.occupiedBy`);
 *   2. SDK 这层会把它再 wrap 成 `ScopeMismatchError(code, message)` 给用户脚本,
 *      用户拿到的就是 Error 实例,堆栈干净,这里不用先实例化一次。
 *
 * `[k: string]: unknown` 索引签名是给各 code 携带额外上下文用的:
 *   - `PROFILE_BUSY` 会带 `occupiedBy`(透传 ProfileBusyError.occupiedBy);
 *   - 其他 code 视未来需要扩展。
 */
export interface BridgeError {
  code: BridgeErrorCode
  message: string
  [k: string]: unknown
}

/**
 * 已知错误码闭合集合。
 *
 * 不允许字符串自由扩展 —— SDK 用户脚本会针对 `e.code` 做 switch / if 分支,
 * 字符串闭合保证 TS 那边能写穷举 switch + `default: never`;主进程这侧则在
 * ScriptBridge 兜底分支统一映射到 `INTERNAL_ERROR`。
 *
 * 各 code 的语义(详见 requirements §5):
 *   - `PROFILE_NOT_FOUND`:runScript / launch / close 时 profileId 不在 ProfileStore;
 *   - `SCRIPT_NOT_FOUND`:runScript 时 scriptId 不在 ScriptStore;
 *   - `INVALID_SCOPE`:试图 runScript 一个 scope='global' 的脚本;
 *   - `PROFILE_BUSY`:profile 已被另一个 ScriptRun 占用(透传 ProfileBusyError);
 *   - `PROFILE_ID_TAKEN`:profiles.create 时 draft.id 已被现存 profile 占用;
 *   - `INVALID_PROFILE_ID`:profiles.create 时 draft.id 含非法字符
 *     (合法字符:A-Z a-z 0-9 . _ -,长度 1..64);
 *   - `SCRIPT_STOPPED`:父全局 run 被 stop,联动到子 run 的 await reject;
 *   - `GLOBAL_NOT_IMPL_YET`:delete/setQueue 写接口占位
 *     (SDK 层就 throw,不会真的进入 ScriptBridge);
 *   - `INTERNAL_ERROR`:协议层 / 主进程兜底,任何未分类异常的 fallback。
 */
export type BridgeErrorCode =
  | 'PROFILE_NOT_FOUND'
  | 'SCRIPT_NOT_FOUND'
  | 'INVALID_SCOPE'
  | 'PROFILE_BUSY'
  | 'PROFILE_ID_TAKEN'
  | 'INVALID_PROFILE_ID'
  | 'SCRIPT_STOPPED'
  | 'GLOBAL_NOT_IMPL_YET'
  | 'INTERNAL_ERROR'
