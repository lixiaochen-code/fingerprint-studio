import { BrowserHandle } from './browser'
import { KvStore } from './kv'
import type { BridgeClient } from './bridge-client'
import type { BridgeError } from '../bridge-types'
import type { BrowserProfile, ProfileDraft } from '../../types'
import type { ProfilesApi, RunScriptResult, ScriptApi, ScriptContext } from './types'

/**
 * 在错误的 scope 里调某 API 时抛出。Bootstrap 把它的 message 透回主进程日志。
 *
 * 我们故意不让全局脚本里调 page/browser 直接静默成 noop —— 静默会让用户以为
 * 拿到了 Browser 实例,后面 .newPage() 报神秘错误更难排查。明确 throw + 提示
 * "这是全局脚本,没有浏览器" 比假装能用更友好。
 *
 * ## 为什么允许动态扩展字段([k: string]: unknown)
 *
 * Bridge 协议层的 BridgeError 可以携带额外上下文(例如 PROFILE_BUSY 的
 * `occupiedBy`)。SDK 这层 wrap BridgeError → ScopeMismatchError 时会把这些
 * 字段 `Object.assign` 到 error 实例上,让用户脚本写
 *   try { ... } catch (e) { if (e.code === 'PROFILE_BUSY') log(e.occupiedBy.runId) }
 * 时仍能拿到原始字段。如果只允许严格的 code/message 两个字段,信息丢失会让
 * 用户必须再去主进程日志里翻 —— 用户体验差。
 */
class ScopeMismatchError extends Error {
  readonly code: string
  /**
   * 协议扩展字段索引签名:把 BridgeError 上的 `[k: string]: unknown` 一起带过来,
   * 例如 `e.occupiedBy`。只在 wrapBridgeRejection 路径里通过 Object.assign 写入,
   * 普通构造路径(scope 检查 / not-implemented 占位)不会触发。
   */
  [k: string]: unknown
  constructor(code: string, message: string) {
    super(message)
    this.code = code
    this.name = 'ScopeMismatchError'
  }
}

const browserNotAvailable = () =>
  new ScopeMismatchError(
    'BROWSER_NOT_AVAILABLE',
    'browser/page is not available in a global script. Use runScript(scriptId, profileId, params) to drive a profile script.'
  )

const globalNotAvailable = () =>
  new ScopeMismatchError(
    'GLOBAL_NOT_AVAILABLE',
    'profiles.* / runScript is only available in global scripts. Move this code to a script with scope=global.'
  )

/**
 * 写接口(profiles.create / delete / setQueue)在 phase 6 仍是占位:不发起任何
 * BridgeRequest,直接 throw `GLOBAL_NOT_IMPL_YET`。
 *
 * ## 为什么 message 必须包含 `phase 6.x` 字样(对应 Requirement 8.2)
 *
 * 用户脚本里 catch 到这条错误时,日志只有 message 一条线索。把后续阶段的版本号
 * 写进 message,用户读到能直接知道"这是已知 gap、跟踪在 phase 6.x",不必去翻
 * spec 文档或主进程源码就能判定排障方向。也方便我们将来 grep 全仓库找出所有
 * 占位点统一升级。
 */
function notImplementedYet(method: string): never {
  throw new ScopeMismatchError(
    'GLOBAL_NOT_IMPL_YET',
    `profiles.${method} is not implemented yet (tracked in phase 6.x).`
  )
}

/**
 * 把 BridgeClient.call 的 reject 路径上的 plain BridgeError 对象 wrap 成
 * ScopeMismatchError 实例。
 *
 * ## 为什么必须 wrap 一次成 Error 实例(而不是直接透传 plain object)
 *
 * 1. **堆栈友好**:Error 实例由 V8 自动捕获 stack,用户脚本 catch 后 log 出
 *    `e.stack` 能看到 SDK → 用户代码这条调用链;plain object 没 stack 字段,
 *    用户只能拿到 code/message 字符串,排障路径短一截。
 * 2. **catch 形态统一**:同一个 SDK 里既有 wrapBridgeRejection 这条远程错误链,
 *    也有 globalNotAvailable / browserNotAvailable / notImplementedYet 三条同步
 *    错误链 —— 后者本身就是 ScopeMismatchError。用户写
 *      catch (e) { if (e instanceof Error && e.code === 'X') ... }
 *    时希望两类错误形态一致;wrap 让用户少一条特判分支。
 * 3. **保留扩展字段**:Object.assign 把 plain BridgeError 上 `[k: string]: unknown`
 *    索引签名里的字段(例如 PROFILE_BUSY 的 `occupiedBy`)拷到 error 实例上,
 *    用户拿到 `e.occupiedBy` 仍可读,不丢信息。注意 Object.assign 不会覆盖
 *    构造函数已写入的 `code` / `message` / `name`(这些是 ScopeMismatchError
 *    的 own property,key 同名时仍会被覆盖 —— 我们 *希望* 用 BridgeError 的
 *    code/message 覆盖,因为构造时已经传同值进来,assign 是 no-op 等价行为)。
 *
 * ## 为什么不在 BridgeClient 一侧就 wrap
 *
 * BridgeClient 的职责是"传输 + 协议层错误";语义化(挂 ScopeMismatchError 这
 * 类 SDK 概念)是 SDK 层的事。两层职责正交,便于将来 BridgeClient 复用到非
 * SDK 场景(例如未来主进程 → fork 的反向请求)而不被 SDK 错误类绑定。
 */
function wrapBridgeRejection<T>(promise: Promise<T>): Promise<T> {
  return promise.catch((reason: unknown) => {
    // 形状校验:BridgeClient.call reject 出来的成功路径是 plain BridgeError
    // (`{ code, message, [k]: unknown }`)。其它 reject 类型(例如 dispose 后
    // call 抛的 Error 实例 / send=false 抛的 Error 实例)就直接抛回 —— 这些是
    // 客户端自身的运行期错误,不属于协议层 BridgeError,wrap 反而会改变形状。
    if (
      reason !== null &&
      typeof reason === 'object' &&
      typeof (reason as BridgeError).code === 'string' &&
      typeof (reason as BridgeError).message === 'string'
    ) {
      const bridgeError = reason as BridgeError
      const wrapped = new ScopeMismatchError(bridgeError.code, bridgeError.message)
      // 把扩展字段(occupiedBy 等)拷到 error 实例上。先 assign 再 throw 顺序
      // 不能反 —— assign 之后 wrapped.code/message 会被同名 key 覆盖一次,但
      // 值与构造函数传入的相同,行为等价。name 字段则是 ScopeMismatchError
      // 自己的 own property,assign 时 BridgeError 没有 name 字段,不会被覆盖。
      Object.assign(wrapped, bridgeError)
      // 显式重置 name —— 即便未来 BridgeError 不小心带了 name 字段,这里也
      // 强制保持 ScopeMismatchError 的语义标签,避免 instanceof / e.name
      // 用户判断逻辑被破坏。
      wrapped.name = 'ScopeMismatchError'
      throw wrapped
    }
    // 不认识的 reject 形态:原样抛回。比如 BridgeClient.dispose 之后再 call
    // 拿到的 Error 实例,语义上属于"通道已关",用户 catch 到 Error 也合理。
    throw reason
  })
}

function makeProfileScopeProfilesApi(): ProfilesApi {
  return {
    list: () => Promise.reject(globalNotAvailable()),
    get: () => Promise.reject(globalNotAvailable()),
    launch: () => Promise.reject(globalNotAvailable()),
    close: () => Promise.reject(globalNotAvailable()),
    create: () => Promise.reject(globalNotAvailable()),
    delete: () => Promise.reject(globalNotAvailable()),
    setQueue: () => Promise.reject(globalNotAvailable())
  }
}

/**
 * 全局脚本的 profiles.* 实装。
 *
 * - `list / get`:走 BridgeClient → 主进程 ProfileStore 真实读;reject 路径 wrap
 *   一层 ScopeMismatchError 见 wrapBridgeRejection。
 * - `launch / close`:走 BridgeClient → 主进程浏览器生命周期。launch 已启动则
 *   no-op 复用;close 没在跑则 no-op resolve;close 在 PROFILE_BUSY 时早返回不动
 *   浏览器(由 ScriptBridge 那侧保证)。详见 launch-close 子 spec。
 * - `create / delete / setQueue`:phase 6 仍占位 —— 在 SDK 层就 throw,**不**发
 *   BridgeRequest(对应 Requirement 8.3:不修改 ProfileStore / 磁盘内容)。
 *
 * 注意:list/get 的 BridgeClient 泛型参数(BrowserProfile / BrowserProfile|null)
 * 与 design.md §6.2 表中 success value 形状严格一致;泛型只在 SDK 这层声明,
 * BridgeClient 本身不感知具体类型。
 *
 * launch/close 的 BridgeClient 泛型用 `null` —— 主进程那侧成功时写
 * `value: null`,SDK 这层用 `.then(() => undefined)` 把 null 抹掉以严格匹配
 * 类型签名 `Promise<void>`。
 */
function makeGlobalScopeProfilesApi(bridge: BridgeClient): ProfilesApi {
  return {
    list: () => wrapBridgeRejection(bridge.call<BrowserProfile[]>('profiles.list', {})),
    get: (id: string) =>
      wrapBridgeRejection(bridge.call<BrowserProfile | null>('profiles.get', { id })),
    launch: (id: string) =>
      wrapBridgeRejection(bridge.call<null>('profiles.launch', { id })).then(() => undefined),
    close: (id: string) =>
      wrapBridgeRejection(bridge.call<null>('profiles.close', { id })).then(() => undefined),
    // create 走 bridge → 主进程 ProfileStore.create。
    // 失败码:
    //   - PROFILE_ID_TAKEN:draft.id 已存在;`e.existingId` 透传
    //   - INVALID_PROFILE_ID:draft.id 含非法字符;`e.badId` 透传
    //   - INTERNAL_ERROR:其它(payload 形状错 / store 写盘失败)
    // 这里**不**做幂等(若 id 冲突 → throw,而不是返回已有 profile);用户想"存在就跳过"
    // 应该自己写 catch e.code === 'PROFILE_ID_TAKEN' 然后改 fallthrough 到 profiles.get。
    create: (draft: ProfileDraft) =>
      wrapBridgeRejection(bridge.call<BrowserProfile>('profiles.create', draft)),
    delete: () => notImplementedYet('delete'),
    setQueue: () => notImplementedYet('setQueue')
  }
}

/**
 * 全局脚本的 runScript 实装。
 *
 * 走 BridgeClient → 主进程 ScriptBridge.executeRunScript 链路。成功 reject 路径
 * (SCRIPT_NOT_FOUND / INVALID_SCOPE / PROFILE_NOT_FOUND / PROFILE_BUSY /
 * SCRIPT_STOPPED / INTERNAL_ERROR)统一经 wrapBridgeRejection wrap 成
 * ScopeMismatchError 实例。
 *
 * params 缺省时填 `{}` —— 与 design.md §8.1 用户视角一致(`runScript(sid, pid)`
 * 应能无 params 跑通)。
 */
function makeGlobalRunScript(bridge: BridgeClient): ScriptApi['runScript'] {
  return (scriptId: string, profileId: string, params?: Record<string, unknown>) =>
    wrapBridgeRejection(
      bridge.call<RunScriptResult>('runScript', {
        scriptId,
        profileId,
        params: params ?? {}
      })
    )
}

/**
 * SDK 工厂:根据 ScriptContext.scope 产出用户脚本 `import 'auto-registry'` 拿到的 API 对象。
 * 这里是 Node 侧的实现;Monaco 看到的类型定义由 ./types.ts 直接提供。
 *
 * 设计:两种 scope 共用同一份接口,运行时按 scope 决定每个方法的行为。
 * 错误 scope 调用立刻 throw 带 code 的语义错误,而不是返回 undefined / 静默 fail。
 */
export function createScriptApi(context: ScriptContext): ScriptApi & { __dispose(): Promise<void> } {
  const isGlobal = context.scope === 'global'

  // profile-scope 才连浏览器;global-scope 没有 webSocketDebuggerUrl,BrowserHandle 也没意义
  const browserHandle = !isGlobal && context.webSocketDebuggerUrl
    ? new BrowserHandle(context.webSocketDebuggerUrl)
    : null

  const kvStore = new KvStore(context.workingDir)

  // —— bridge wiring 检查(对应任务 7 第 5 条)——
  // 全局脚本必须有真实 BridgeClient 引用;profile-scope 不需要,bridge 字段
  // 允许为 null/undefined。
  //
  // 为什么这里 throw 而不是 silent fallback:
  //   - profile-scope 没 bridge 是合法配置(profiles.* / runScript 直接
  //     reject GLOBAL_NOT_AVAILABLE,根本不会读 bridge);
  //   - 全局 scope 没 bridge 是 wiring bug —— bootstrap.ts 必须在 createScriptApi
  //     之前 createBridgeClient 并写到 context.bridge。漏 wire 直接 throw 让
  //     主进程 fork 启动失败 + 日志立刻指向问题现场,远好过等用户脚本第一次
  //     调 profiles.list() 时拿到 NPE 那种 cryptic 错误。
  const bridge: BridgeClient | null = context.bridge ?? null
  if (isGlobal && bridge === null) {
    throw new Error(
      'createScriptApi: global-scope ScriptContext must include a non-null `bridge` BridgeClient. ' +
        'Did bootstrap.ts forget to call createBridgeClient() before createScriptApi()?'
    )
  }

  function sleep(ms: number): Promise<void> {
    if (ms < 0) throw new RangeError('sleep(ms): ms must be >= 0')
    return new Promise((resolve, reject) => {
      if (context.stopSignal.aborted) {
        reject(new Error('Script was stopped'))
        return
      }
      const timer = setTimeout(() => {
        context.stopSignal.removeEventListener('abort', onAbort)
        resolve()
      }, ms)
      const onAbort = () => {
        clearTimeout(timer)
        reject(new Error('Script was stopped'))
      }
      context.stopSignal.addEventListener('abort', onAbort, { once: true })
    })
  }

  const api: ScriptApi = {
    profile: context.profile ? Object.freeze({ ...context.profile }) : null,
    browser: () => {
      if (!browserHandle) return Promise.reject(browserNotAvailable())
      return browserHandle.browser()
    },
    page: () => {
      if (!browserHandle) return Promise.reject(browserNotAvailable())
      return browserHandle.page()
    },
    log: (...args) => context.logSink('info', args),
    warn: (...args) => context.logSink('warn', args),
    error: (...args) => context.logSink('error', args),
    sleep,
    kv: kvStore,
    stopSignal: context.stopSignal,
    // 全局 scope:bridge 已被上面 wiring 检查保证非 null,这里用非空断言安全
    profiles: isGlobal
      ? makeGlobalScopeProfilesApi(bridge as BridgeClient)
      : makeProfileScopeProfilesApi(),
    runScript: isGlobal
      ? makeGlobalRunScript(bridge as BridgeClient)
      : (() => Promise.reject(globalNotAvailable())) as ScriptApi['runScript']
  }

  return Object.assign(api, {
    async __dispose() {
      if (browserHandle) await browserHandle.dispose()
    }
  })
}

export type { ScriptApi, ScriptContext, ScriptMainArgs, ProfilesApi, RunScriptResult } from './types'
