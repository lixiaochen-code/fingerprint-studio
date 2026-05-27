import type {
  BridgeError,
  BridgeMethod,
  BridgeRequest,
  BridgeResponse
} from '../bridge-types'

/**
 * fork 子进程内的请求/响应客户端 —— SDK 全局分支(profiles.list / profiles.get /
 * runScript)调用的统一出口。
 *
 * 与主进程侧 `electron/scripts/bridge.ts`(ScriptBridge)成对出现:fork 这一头
 * 通过 `process.send` 发 BridgeRequest,通过 `process.on('message')` 收
 * BridgeResponse;主进程那头按 correlation id 把 RESPONSE 路由回对应 fork。
 *
 * design.md §5.2 + §7.5 + requirements §2 是本文件的契约。
 */

/**
 * BridgeClient 公共接口形状(对齐 design §5.2)。
 *
 * - `call<T>` 永远返回 Promise:
 *   - 成功 → resolve `response.value`(由调用方在泛型 T 处自行声明形状);
 *   - 失败 → reject **plain BridgeError 对象**(不 wrap 成 Error 实例,见下方
 *     "为什么 reject 不 wrap")。
 * - `dispose(reason)` 把当前 pending 表里所有未完成调用一次性 reject,且让此后
 *   再调 `call()` 立即 reject;幂等(重复调 dispose 无副作用)。
 */
export interface BridgeClient {
  call<T>(method: BridgeMethod, payload: unknown): Promise<T>
  dispose(reason: string): void
}

/**
 * pending 表条目:把 Promise 的 (resolve, reject) 暂存起来,等到对应 id 的
 * RESPONSE 回来时拿出来调用。
 *
 * 故意不存 method/timestamp 等元数据 —— 本 client 不实现超时/重试,任何超时
 * 由父进程通过 SIGTERM + dispose() 这条通道兜底,这里越简单越不出错。
 */
interface PendingEntry {
  resolve: (value: unknown) => void
  reject: (reason: unknown) => void
}

/**
 * 工厂:绑定到当前 process 的 IPC channel(`process.send` + `process.on('message')`)。
 *
 * 必须在用户代码 require 之前(亦即 `createScriptApi(context)` 之前)被调,理由:
 * SDK 工厂内部的 `makeGlobalScopeProfilesApi(bridge)` 与全局 runScript 闭包
 * 立刻就要持 BridgeClient 引用,迟一步全局 SDK 拿到的是 null,用户脚本第一行
 * 就崩。
 *
 * ## 为什么 id 不用 UUID
 *
 * 这条通道是"该 fork ↔ 主进程"一对一的;id 仅用于在该 fork 内匹配 pending,
 * 主进程那头按 fork 维度独立路由,不存在 id 跨 fork 复用的可能。所以一个进程
 * 内独占的单调 counter 就足够 —— 比 UUID 更短(JSON 序列化后差别可观)、可读
 * (调试日志直接 grep `id=42`)、生成更快。
 *
 * 溢出风险:典型 fork 寿命 < 1h,即便每秒发 ~300 次 call(对应 ~10^6/h)也远
 * 小于 `Number.MAX_SAFE_INTEGER`(2^53-1);超出则需要对脚本作者的并发模式重
 * 新评估,本 client 不必做溢出保护。
 *
 * ## 为什么 reject 不 wrap 成 Error 实例
 *
 * 协议层失败(`response.ok === false`)直接 reject 出 plain `BridgeError` 对象,
 * 让上层 SDK(`electron/scripts/sdk/index.ts`)再 wrap 一层 `ScopeMismatchError`
 * 给用户脚本。理由:
 *   1. 这里 wrap 的话,SDK 再 wrap 一次会出现 cause 嵌套或字段重复;
 *   2. plain object 透传保留了 `[k: string]: unknown` 索引签名上的额外字段
 *      (例如 `PROFILE_BUSY` 的 `occupiedBy`),Error 实例直接 throw 会被 V8
 *      压缩成只剩 stack/name/message 三件套;
 *   3. Bridge 层职责是"传输",语义化是 SDK 层的事 —— 关注点分离。
 */
export function createBridgeClient(): BridgeClient {
  // 单调递增的 correlation id;首次 call 取到 1。详见上方"为什么 id 不用 UUID"。
  let counter = 0

  // 已发出但尚未收到 RESPONSE 的请求集合。key 是 request.id,value 是该 Promise
  // 的 (resolve, reject) 句柄。RESPONSE 到来 / dispose / send 失败 三条路径都
  // 会从这张表删条目。
  const pending = new Map<number, PendingEntry>()

  // 一旦 `dispose()` 被调,该标志置 true。此后 `call()` 立即 reject 不再发包,
  // 也不再处理传入消息(虽然此时 process.on('message') listener 仍挂着,
  // 主进程一般也已经断 channel,正常情况下不再有消息;防御性兜底而已)。
  let disposed = false
  let disposeReason = ''

  /**
   * `process.on('message')` 处理器。
   *
   * 设计要点(对齐 requirements 2.5 + 10.3):
   *   - 只接受 `kind === 'response' && typeof id === 'number'` 的消息;
   *     其他形状静默丢弃 + warn,**不**断 channel(避免一条乱消息把整个 client
   *     拖死;主进程那侧只要 fork 还活就有可能继续发合法 RESPONSE)。
   *   - 收到的 id 不在 pending 表的(orphan):一样静默丢弃 + warn。可能场景包
   *     括 `dispose()` 已清表后才到的迟到 RESPONSE,或主进程 bug。
   */
  function handleMessage(message: unknown): void {
    // 协议层防御:形状校验。BridgeResponse 是 discriminated union,这里做最小
    // 必要字段检查就够,各 method 的 value 形状由调用方泛型 T 自己负责。
    if (
      typeof message !== 'object' ||
      message === null ||
      (message as { kind?: unknown }).kind !== 'response' ||
      typeof (message as { id?: unknown }).id !== 'number'
    ) {
      // 静默丢弃 + warn:非 BridgeResponse 形状,可能是 fork 内存错乱或第三方
      // 代码乱发 process.send 触发的(理论上 fork 内只有 bootstrap 在 send,但
      // 用户脚本里若误用 process.on('message') 接收主进程消息也会走这里 —— 防
      // 御性放行,不影响合法 pending)。
      console.warn('[bridge-client] dropping malformed IPC message:', message)
      return
    }

    const response = message as BridgeResponse
    const entry = pending.get(response.id)
    if (entry === undefined) {
      // orphan id:很可能是 dispose() 清表后才到达的迟到 RESPONSE。同样静默 +
      // warn,不向上层抛错。
      console.warn('[bridge-client] orphan response id (no pending entry):', response.id)
      return
    }

    // 命中 pending:无论成功失败,都要在调 resolve/reject 之前先删表 ——
    // 防止用户在 .then/.catch 里再次 throw 时,这条 pending 还残留导致内存泄漏。
    pending.delete(response.id)

    if (response.ok) {
      entry.resolve(response.value)
    } else {
      // 直接透传 plain BridgeError(见上方"为什么 reject 不 wrap")。
      entry.reject(response.error)
    }
  }

  // 注册 message 处理器。fork 进程内 `process` 上的 listener 在进程退出时由
  // Node 自行清理,这里不需要手动 off —— dispose() 也不动它(避免 dispose 后
  // 仍可能到达的迟到消息触发 unhandled message 警告)。
  process.on('message', handleMessage)

  function call<T>(method: BridgeMethod, payload: unknown): Promise<T> {
    // dispose 之后再调:立刻 reject。错误信息带 reason 让上层(SDK / 用户)
    // 在调试时能看出是"通道被主动关了"还是其他原因。
    if (disposed) {
      return Promise.reject(new Error(`bridge client disposed: ${disposeReason}`))
    }

    // counter++ 取 id —— 先自增再用,确保 id 从 1 起,与 design §5.2 / §7.5 对齐。
    counter += 1
    const id = counter
    const request: BridgeRequest = { kind: 'request', id, method, payload }

    return new Promise<T>((resolve, reject) => {
      // 先登记到 pending,再发包。顺序很重要:如果先 send 再登记,主进程极快
      // 回包(同进程的 IPC 实际上是同步派发到下一个 microtask)就可能在我们
      // 还没登记好就到达 handleMessage,变成 orphan。
      pending.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject
      })

      // process.send 在 fork 没有 stdio:'ipc' 配置时为 undefined。bootstrap.ts
      // 里只有 fork 启动了这个文件,正常路径必有;防御性判一下,fallback 走
      // "channel 已死"路径。
      const send = process.send?.bind(process)
      if (send === undefined) {
        pending.delete(id)
        reject(new Error('parent IPC channel is closed (process.send unavailable)'))
        return
      }

      // process.send 同步返回 false 时表示 channel 已断(parent IPC closed),
      // 此次 REQUEST 不会被对端收到 → 立即 reject 该 pending 并删表,避免永远
      // 挂着。这条路径与 dispose() 不同:dispose 是主动关闭 + reject 全表,
      // send=false 是单次发送失败 + reject 单条;两者互不冲突,可在同一生命周
      // 期内先后发生(例如父进程刚断,接着 bootstrap 收到 disconnect 调
      // dispose 清剩下的)。
      const ok = send(request)
      if (ok === false) {
        pending.delete(id)
        reject(new Error('parent IPC channel is closed'))
      }
    })
  }

  function dispose(reason: string): void {
    // 幂等:重复调直接返回。一次性 reject 全表 + 置标志位足够,不要再做"reset
    // counter / re-attach handler"之类的副作用,会让 client 的状态机更复杂。
    if (disposed) return
    disposed = true
    disposeReason = reason

    // 一次性 reject 所有未完成 pending,统一错误信息便于上层日志聚合。新建一个
    // Error 实例(而不是 plain object)是因为:dispose 的 reject 对应 SDK 这一
    // 侧"客户端已死"的运行期错误,不是协议层 BridgeError —— 上层 catch 时会
    // 看到一个 Error 实例,而不是无 stack 的 plain object,排障更友好。
    const error = new Error(`bridge client disposed: ${reason}`)
    for (const entry of pending.values()) {
      entry.reject(error)
    }
    pending.clear()
  }

  return { call, dispose }
}
