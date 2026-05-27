import type { ChildProcess } from 'node:child_process'
import type { BrowserProfile, ScriptRun, ScriptRunStatus } from '../types'
import type { ProfileStore } from '../store'
import type { ScriptStore } from './store'
import type { ScriptRuntimeEvent, ScriptRuntimeManager } from './runtime'
import { ProfileBusyError } from './runtime'
import type {
  BridgeError,
  BridgeErrorCode,
  BridgeMethod,
  BridgeRequest,
  BridgeResponse
} from './bridge-types'

/**
 * fork ↔ main 双向 IPC 协议的主进程侧路由器(ScriptBridge)。
 *
 * ## 为什么独立成模块,而不是塞进 ScriptRuntimeManager
 *
 * ScriptRuntimeManager 现有职责很纯:启动 / 停止 / 状态广播,围绕单条 ScriptRun
 * 的生命周期。一旦把"fork 间协作 + 父子 run 联动 + IPC 路由"这套也丢进去:
 *   1. Runtime 类会同时持有 forks 表(parentRunId 维度) + active 表(runId 维度),
 *      两张表的不变量需要互相照应,非常容易写出"删了 active 但忘了清 forks
 *      pendingChildren"这类 bug;
 *   2. 单元测试边界混乱 —— 测 runtime 必须连带 mock IPC channel + ProfileStore;
 *   3. 后续把 bridge 抽出来支持别的传输层(比如 phase 7 的 onCreate/onLaunch
 *      触发链)会卡在 runtime 紧耦合上。
 *
 * 把 bridge 单独成模块:Runtime 不感知 fork 间关系,Bridge 不感知日志 / 状态广播,
 * 各自演化路径独立,职责正交。设计依据见 design.md §5.1 "为何独立成模块"。
 *
 * ## 与 ScriptRuntimeManager 的回填依赖
 *
 * Bridge 构造时持 runtime 引用(用于读 active / 触发 stop / 启动子 run),
 * Runtime 在 fork 创建后立即 `bridge.attach(child, run.id)`(任务 6 加 setBridge
 * + attach 调用)。两者形成单向回填的环:
 *
 *   main.ts: new Runtime → new Bridge(runtime, ...) → runtime.setBridge(bridge)
 *
 * 不用构造函数互相注入,避免双向依赖循环。
 */

/**
 * 单条 fork 的内部簿记。
 *
 * - `child`:fork 的 ChildProcess 引用,用来 `child.send` 写 RESPONSE,以及挂
 *   message/exit 监听(由 attach 完成,不在此处赋值之后再变)。
 * - `pendingChildren`:**当前正在 await 的子 run 集合**(由 runScript 启动)。
 *   用 Set 而不是 Map 是因为同一 fork 可能并发发起多次 runScript,各自有不同
 *   reqId + 不同 childRunId,且我们清理时是"按集合遍历",从来不"按 key 取
 *   单条";Set 语义更贴合。
 *
 *   由 task 4 的 executeRunScript 真正写入这张集合;本任务(task 3)只放骨架
 *   定义,attach / shutdown / handleForkExit 会读取它做兜底清理。
 */
interface ForkEntry {
  child: ChildProcess
  pendingChildren: Set<{ reqId: number; childRunId: string }>
}

/**
 * 主进程侧 bridge,实例由 main.ts 在应用启动后构造,wiring 进 ScriptRuntimeManager。
 */
export class ScriptBridge {
  /**
   * 当前所有已 attach 的 fork。key 是触发该 fork 的 ScriptRun id(global-script
   * 的 parentRunId,亦即 ownerRunId),value 是 fork 簿记条目。
   *
   * fork 退出 / shutdown 时会被清表;attach 不允许同 ownerRunId 重复登记
   * (由 ScriptRuntimeManager 保证 run id 全局唯一,这里仅做防御性 throw)。
   */
  private readonly forks = new Map<string, ForkEntry>()

  /**
   * "父 run 消失"订阅表(供 waitForChildTerminal 内部使用)。
   *
   * key 是 parentRunId;value 是对该 parent 的所有 stopped 回调集合。
   *
   * 触发器(task 5):构造函数尾部订阅 runtime 'event',监听 'active-changed';
   * 比较新旧活跃 runId 集合,对消失的 runId 调一次 onParentRunFinished,
   * 后者负责把对应 callbacks 一次性触发并把整张 key 清掉。
   *
   * 这条路径主要服务于"父 run 已从 runtime 活跃集合消失,但父 fork 还没 'exit'"
   * 的窗口期(graceful shutdown 阶段,Requirement 6.4)。
   */
  private readonly parentStoppedListeners = new Map<string, Set<() => void>>()

  /**
   * 上一次 'active-changed' 事件后的活跃 runId 快照。
   *
   * 用法:每次 'active-changed' 到来,把新事件 active 集合转成 Set,与这张快照
   * 做差集(prev - new)算出"消失"的 runId 集合,然后对其中每条调
   * onParentRunFinished;最后把快照替换为新集合。
   *
   * 为什么用 Set<string> 而不是 Set<ScriptRun>:对比只关心 runId,且 ScriptRun
   * 对象是 store 那边重新构造的快照(每次事件都是新对象),用对象引用做 Set
   * 元素会让差集永远 = 全集,逻辑直接错。
   *
   * 为什么是字段而非闭包局部变量:'active-changed' 是连续事件流,需要跨事件保留
   * 上一次状态;闭包内部 let 在每次 listener 重入时会丢上一次值。
   */
  private previousActiveRunIds: Set<string> = new Set()

  /**
   * 订阅 runtime 'event' 时拿到的解绑句柄。
   *
   * 为什么需要这个字段:EventEmitter.on 不会自动清理 listener,主进程
   * 'before-quit' 之后还有一段 cleanup 时间,期间事件仍可能 emit;若不解绑,
   * bridge 实例无法被 GC,且回调可能在 forks/parentStoppedListeners 已清表后
   * 被触发,产生 no-op 但仍消耗资源。shutdown 里调用一次即可。
   */
  private runtimeUnsubscribe: (() => void) | null = null

  constructor(
    private readonly runtime: ScriptRuntimeManager,
    private readonly scriptStore: ScriptStore,
    private readonly profileStore: ProfileStore,
    /**
     * 与 main.ts 里既有的 ensureProfileRunningForScript 复用同一实现,
     * 避免脚本子系统出现两条不同的"启动浏览器 + 等 CDP"路径。
     * task 4 的 executeRunScript 内部会调用它。
     */
    private readonly ensureProfileRunningForScript: (profile: BrowserProfile) => Promise<string>,
    /**
     * launch-close 子 spec 注入的两条主进程胶水回调(沿用 phase 6 既有范式 ——
     * bridge 不感知 main.ts 模块级闭包,主进程胶水以函数引用注入)。
     *
     * 为什么不让 launch 复用 ensureProfileRunningForScript 然后丢弃 wsUrl 返回值:
     * 后者契约是"启动 + 返回 webSocketDebuggerUrl",其中"返回 wsUrl"是
     * runScript 的硬需求(用来 puppeteer.connect)。profiles.launch 的契约只是
     * "启动浏览器",不背"等 DevTools endpoint 就绪"的语义。独立 callback 让
     * main.ts 那侧将来能换实现(比如换成"只 spawn 不等 endpoint")而不影响
     * bridge 的协议契约。详见 launch-close design.md §5.2。
     *
     * launchProfileForScript:仅启动浏览器(实装上仍复用
     * ensureProfileRunningForScript 然后丢弃 wsUrl,但类型契约 Promise<void>)。
     */
    private readonly launchProfileForScript: (profile: BrowserProfile) => Promise<void>,
    /**
     * closeProfileBrowser:关闭单个 profile 的浏览器子进程。内部对"未在跑"是
     * no-op(只清表),与 profiles.close requirements §2.5 的 no-op resolve 语义对齐。
     */
    private readonly closeProfileBrowser: (profileId: string) => Promise<void>
  ) {
    // 构造尾部订阅 runtime 事件总线,接通"父 run 消失"触发器(task 5)。
    //
    // 为什么放在构造函数尾部、所有字段初始化之后:listener 内部会读 forks /
    // parentStoppedListeners,这些必须先就位;且即便 attach 后才会有 fork,
    // 也允许更早的 'active-changed' 事件(理论上没有 active 就不会变化,但保
    // 持订阅常驻便于推理)。
    //
    // 为什么用具名 listener 而非内联:EventEmitter.off 必须传同一引用才能解绑;
    // 把 handler 拎出来挂到 runtimeUnsubscribe 句柄里,shutdown 时一次性 off。
    const onRuntimeEvent = (event: ScriptRuntimeEvent): void => {
      if (event.type !== 'active-changed') return
      this.handleActiveChanged(event.active)
    }
    this.runtime.on('event', onRuntimeEvent)
    this.runtimeUnsubscribe = () => {
      this.runtime.off('event', onRuntimeEvent)
    }
  }

  /**
   * 把一条新 fork 注册到 bridge:登记 forks 表 + 挂 message/exit 监听。
   *
   * 调用时机:`ScriptRuntimeManager.start()` fork 出 ChildProcess **之后立即**调
   * (由 task 6 完成 wiring)。早于任何 child 的 'message' 事件可能到达的时机,
   * 否则首条 BridgeRequest 会因为没 listener 而被 Node 默默丢掉。
   *
   * 即便 child 在 attach 调用过程中或之后立刻 'exit'(用户脚本第一行就 throw 之类
   * 的极端场景),也按"先登记 → exit 处理器自然清理"路径走 —— 这里**不**检测
   * `child.exitCode` 之类的当前状态,因为 fork 状态机是异步的,检测和操作之间永
   * 远有竞态窗口;对应 Requirement 3.4。
   */
  attach(child: ChildProcess, ownerRunId: string): void {
    // 防御性:同一 ownerRunId 不允许 attach 两次。run id 由 ScriptStore.createRun
    // 生成,理论上全局唯一;若真出现说明上游 wiring 有 bug,直接 throw 让调用方
    // 立刻看到,而不是默默覆盖之前的 fork(那会让旧 fork 永远收不到 RESPONSE)。
    if (this.forks.has(ownerRunId)) {
      throw new Error(`ScriptBridge.attach: ownerRunId already attached: ${ownerRunId}`)
    }

    const entry: ForkEntry = {
      child,
      pendingChildren: new Set()
    }
    this.forks.set(ownerRunId, entry)

    // 挂 message 监听:bridge 协议层校验放在 handleRequest 内部,这里只做最薄的
    // 桥接(把 ownerRunId 闭包带进去,不污染 ChildProcess 自身的 listener 签名)。
    child.on('message', (message: unknown) => {
      this.handleRequest(child, ownerRunId, message)
    })

    // 挂 exit 监听:无论用户 stop / 用户脚本完成 / 异常崩溃,这条都会触发 ——
    // 是 fork 生命周期的最后一站,也是 forks 表条目的唯一清理入口(handleForkExit
    // 内部完成清表 + 兜底 stop pending children)。
    child.on('exit', () => {
      this.handleForkExit(ownerRunId)
    })
  }

  /**
   * 应用退出时调用(main.ts 的 `app.on('before-quit', ...)` 钩子,task 9 完成
   * wiring)。
   *
   * 设计要点:
   *   - 遍历 forks,对每个 fork 的所有 pendingChildren 写 SCRIPT_STOPPED RESPONSE
   *     —— 让父 fork 内 `await runScript(...)` 调用以 SCRIPT_STOPPED reject,
   *     而不是 hang 到被 SIGKILL。
   *   - "尽力而为":channel 已断时 process.send 同步返回 false,这里静默忽略
   *     (fork 反正马上就要退,送不到也无所谓;用户代码的 try/catch 已不在执行
   *     窗口内)。
   *   - **不**调 runtime.stop —— shutdown 之后 runtime 自己也会 shutdown,统一收
   *     尾;这里只管 bridge 自身的状态机。
   *   - 清空 forks 表 —— 让随后任何意外延迟到达的 message/exit 事件走 orphan 分支,
   *     不再产生副作用。
   */
  shutdown(): void {
    // 先解绑 runtime 事件订阅,避免 shutdown 期间(以及之后)还接到 'active-changed'
    // 触发 onParentRunFinished —— 那会去 forks 表里找已被清空的 fork,虽然是 no-op
    // 但增加了脑内推理负担。先 off 再清表,顺序更直观。
    this.runtimeUnsubscribe?.()
    this.runtimeUnsubscribe = null

    for (const [, entry] of this.forks) {
      for (const pending of entry.pendingChildren) {
        this.sendResponse(entry.child, {
          kind: 'response',
          id: pending.reqId,
          ok: false,
          error: {
            code: 'SCRIPT_STOPPED',
            message: 'application is shutting down'
          }
        })
      }
      // 这里不主动 unset child.on('message'/'exit')监听:fork 进程接下来由 runtime
      // 收尾,exit 事件还会触发 handleForkExit 走二次清理(此时 forks 表已空,
      // handleForkExit 内部的 `forks.get` 返回 undefined,自然 no-op)。
    }
    this.forks.clear()
    // 父消失订阅表也清掉:理论上每条 listener 都已在 waitForChildTerminal 的"终态
    // 命中"或 onParentRunFinished 的"父消失命中"路径里 unsubscribe;但 shutdown
    // 是兜底,做一次硬清理避免任何残留 callback 在事件解绑后还被持有引用。
    this.parentStoppedListeners.clear()
    this.previousActiveRunIds = new Set()
  }

  // —— internal —————————————————————————————————————————————————

  /**
   * 单条 BridgeRequest 的入口处理器(协议层校验 + 路由 + 错误兜底)。
   *
   * 步骤:
   *   1) 协议层校验。kind/id/method 任一不合法 → 静默丢弃 + warn,**不**发
   *      RESPONSE(因为 id 都不可信,发了反而会让对端误以为是合法响应)。
   *      对应 Requirement 10.1。
   *   2) switch by method,分发到具体处理。每个 method 内部自己负责发 RESPONSE
   *      (一发即返,不要重复发)。
   *   3) 任意同步 / 异步异常被捕获 → 翻译为 BridgeError(优先 ProfileBusyError →
   *      PROFILE_BUSY 带 occupiedBy,其余兜底 INTERNAL_ERROR),恰好发一条
   *      RESPONSE。**绝不**让异常逃逸到 Node 事件循环 —— 否则一条坏请求就把整
   *      个主进程拖崩。对应 Requirement 10.2。
   */
  private handleRequest(child: ChildProcess, ownerRunId: string, message: unknown): void {
    // —— 1) 协议层校验 ——
    if (
      typeof message !== 'object' ||
      message === null ||
      (message as { kind?: unknown }).kind !== 'request' ||
      typeof (message as { id?: unknown }).id !== 'number' ||
      !isBridgeMethod((message as { method?: unknown }).method)
    ) {
      // 防御场景:fork 内存错乱 / 第三方代码乱调 process.send / 用户脚本误把
      // 主进程消息当响应回灌。任一都不应该让 bridge 状态机受影响,默默吞掉就行。
      console.warn('[ScriptBridge] dropping malformed IPC message from fork', ownerRunId, message)
      return
    }

    const request = message as BridgeRequest

    // —— 2) 路由 + 错误兜底 ——
    // 用 async IIFE 包一层,统一捕获同步抛 + Promise reject,最后翻译成 BridgeError
    // 写一条 RESPONSE。注意:runScript 分支(task 4 真正实装)会在内部自己写
    // RESPONSE,这里要避免"内部已写 + 兜底又写"重复发包 —— 通过约定
    // executeRunScript 永远自己 resolve 信封 + 不抛(由 task 4 保证),来规避这条。
    void (async () => {
      try {
        switch (request.method) {
          case 'profiles.list': {
            const value = this.profileStore.list()
            this.sendResponse(child, {
              kind: 'response',
              id: request.id,
              ok: true,
              value
            })
            return
          }
          case 'profiles.get': {
            // payload 形状:{ id: string }。校验通过后再去 store.get;不通过直接
            // 走 INTERNAL_ERROR 兜底(由外层 catch 翻译)。
            const payload = request.payload as { id?: unknown } | null | undefined
            const id = payload?.id
            if (typeof id !== 'string') {
              throw new Error('profiles.get: payload.id must be a string')
            }
            const value = this.profileStore.get(id) ?? null
            this.sendResponse(child, {
              kind: 'response',
              id: request.id,
              ok: true,
              value
            })
            return
          }
          case 'profiles.launch': {
            // payload 形状:{ id: string }。校验失败走 INTERNAL_ERROR(由外层 catch 翻译)。
            const payload = request.payload as { id?: unknown } | null | undefined
            const id = payload?.id
            if (typeof id !== 'string') {
              throw new Error('profiles.launch: payload.id must be a string')
            }
            const profile = this.profileStore.get(id)
            if (!profile) {
              this.sendResponse(child, {
                kind: 'response',
                id: request.id,
                ok: false,
                error: { code: 'PROFILE_NOT_FOUND', message: `profile not found: ${id}` }
              })
              return
            }
            // 复用 launchProfile 的"已启动则 no-op"分支;不在 bridge 这层判
            // profileProcesses 状态(那是 main.ts 内部簿记)。
            // launch 失败抛出来 → 外层 catch 翻译成 INTERNAL_ERROR + 原 message。
            await this.launchProfileForScript(profile)
            this.sendResponse(child, {
              kind: 'response',
              id: request.id,
              ok: true,
              value: null
            })
            return
          }
          case 'profiles.close': {
            const payload = request.payload as { id?: unknown } | null | undefined
            const id = payload?.id
            if (typeof id !== 'string') {
              throw new Error('profiles.close: payload.id must be a string')
            }
            const profile = this.profileStore.get(id)
            if (!profile) {
              this.sendResponse(child, {
                kind: 'response',
                id: request.id,
                ok: false,
                error: { code: 'PROFILE_NOT_FOUND', message: `profile not found: ${id}` }
              })
              return
            }
            // 占用检测先于 close —— 反过来会出现"已发完 SIGTERM 才发现 profile 上有
            // active run"的不可恢复路径(浏览器已被杀,active run 因此立刻崩 +
            // close 报 PROFILE_BUSY,用户两端都看到错)。详见 launch-close design §5.4。
            const occupiedBy = this.runtime.getActiveByProfile(id)
            if (occupiedBy) {
              // 手动构造 PROFILE_BUSY BridgeError 而非 throw ProfileBusyError 让外层
              // 翻译 —— 因为这里要透传 runtime.getActiveByProfile() 的返回值字段
              // (是 ScriptRun 子集,而非 ProfileBusyError 实例),手动构造更直白。
              this.sendResponse(child, {
                kind: 'response',
                id: request.id,
                ok: false,
                error: {
                  code: 'PROFILE_BUSY',
                  message: `profile ${id} is occupied by run ${occupiedBy.id} (script ${occupiedBy.scriptId})`,
                  occupiedBy: { runId: occupiedBy.id, scriptId: occupiedBy.scriptId }
                }
              })
              return
            }
            // closeProfileBrowser 内部对"未在跑"是 no-op resolve;bridge 这层不重复判。
            await this.closeProfileBrowser(id)
            this.sendResponse(child, {
              kind: 'response',
              id: request.id,
              ok: true,
              value: null
            })
            return
          }
          case 'runScript': {
            // 委托给 executeRunScript:它内部会自己发 RESPONSE(成功 / 失败 /
            // SCRIPT_STOPPED 三路汇合)。本任务(task 3)的 executeRunScript 是
            // stub,只回 INTERNAL_ERROR;task 4 会替换实装。
            await this.executeRunScript(ownerRunId, request.id, request.payload)
            return
          }
        }
      } catch (e) {
        // —— 3) 兜底翻译 ——
        const error = this.toBridgeError(e)
        this.sendResponse(child, {
          kind: 'response',
          id: request.id,
          ok: false,
          error
        })
      }
    })()
  }

  /**
   * fork 'exit' 处理器:清 forks 表 + 兜底 stop pending children。
   *
   * 路径(对应 Requirement 3.3 / 3.4):
   *   1) 删 `forks[ownerRunId]` 条目 —— 此后任何到达的 message 都会找不到
   *      ForkEntry,handleRequest 那侧的 child.send 仍可能尝试写,但 channel 已断
   *      时 sendResponse 会同步返回 false 并被静默忽略。
   *   2) 对 pendingChildren 中每条 `{reqId, childRunId}`,先尝试发一条 SCRIPT_STOPPED
   *      RESPONSE(尽力而为;channel 已断也无所谓 —— 父 fork 都退出了,反正用户
   *      代码也接收不到 reject)。再 `void runtime.stop(childRunId)` 触发对子 run
   *      的 SIGTERM(fire-and-forget,子 run 的终态由 runtime 自己持久化)。
   *
   * 不 await runtime.stop:这条路径是 fork 'exit' 的 listener,保持同步语义更稳;
   * runtime.stop 内部本身也只是 SIGTERM + 计划 SIGKILL,不需要等它返回。
   */
  private handleForkExit(ownerRunId: string): void {
    const entry = this.forks.get(ownerRunId)
    if (!entry) return // shutdown 已清表的二次回调,no-op
    this.forks.delete(ownerRunId)

    for (const pending of entry.pendingChildren) {
      this.sendResponse(entry.child, {
        kind: 'response',
        id: pending.reqId,
        ok: false,
        error: {
          code: 'SCRIPT_STOPPED',
          message: 'parent fork exited'
        }
      })
      // fire-and-forget:即使 child 已经在终态,runtime.stop 内部对未知 runId 是
      // no-op(runtime.active 表里查不到);幂等。
      void this.runtime.stop(pending.childRunId)
    }
  }

  /**
   * 处理 runtime 'active-changed' 事件:对比新旧活跃 runId 集合,把"消失"的
   * runId 视作"该 run 已在 runtime 视角终结",触发 onParentRunFinished 把
   * 等待该父的所有 listeners 一次性触发。
   *
   * ## 为什么不直接用 fork 'exit' 处理(与 handleForkExit 合并)
   *
   * 父 fork 被 stop 时是两阶段:
   *   1) runtime.stop 同步删 active 表 → emit 'active-changed' (父 runId 消失)
   *   2) child.kill('SIGTERM') → 父 fork 走 graceful 窗口期(GRACEFUL_SHUTDOWN_MS=3s)
   *      → 期间用户脚本的 stopSignal 被 abort,可能还在 try/finally 收尾
   *   3) 最终 fork 'exit' 触发 → handleForkExit 兜底清表
   *
   * 在 (1) 与 (3) 之间的 ≤3s 窗口期里,父 fork 还活,若只走 fork 'exit' 路径,
   * 子 fork(因 await runScript)会被 hang,父 fork 内的 try/catch 拿不到
   * SCRIPT_STOPPED reject —— 等到 (3) 后才送 RESPONSE,用户脚本的 graceful
   * cleanup 时机可能已经错过。因此本任务多开一条"active-changed → 立即触发
   * SCRIPT_STOPPED 路径",让 reject 在 (1) 同 tick 就送达。
   *
   * 与 handleForkExit 的关系:两条路径互不冲突。先到的那条会通过
   * waitForChildTerminal 的 cleanup 把另一条的 listener 解绑;后到的那条找不到
   * 还在等的 pending,自然 no-op(forks 表项 / parentStoppedListeners 都已清空)。
   *
   * ## 为什么算"差集"而非"对每个新 active 检查 prev 是否含"
   *
   * 我们关心的是"上轮活,本轮不活"的 runId 集合(消失);对每个 prev 元素检查
   * 是否还在 new 集合更直观,但用 Set 的迭代差集表达"消失 = prev - new"读
   * 起来更接近设计语言。性能上两者都是 O(prev.size)。
   */
  private handleActiveChanged(active: ScriptRun[]): void {
    const newIds = new Set<string>()
    for (const run of active) newIds.add(run.id)

    // 差集:prev - new = 消失的 runId
    for (const runId of this.previousActiveRunIds) {
      if (!newIds.has(runId)) {
        this.onParentRunFinished(runId)
      }
    }

    // 替换快照,准备下一轮对比。注意:即便差集为空(active 集合扩展或不变),
    // 也要替换快照 —— 否则新加入的 runId 永远不会进入下一轮的 prev,后续它消失
    // 时差集就检测不到了。
    this.previousActiveRunIds = newIds
  }

  /**
   * 父 run 已从 runtime 活跃集合消失:把 parentStoppedListeners[parentRunId] 的
   * 所有 callback 一次性触发,然后把整张 key 清掉(只触发一次)。
   *
   * ## 为什么先快照成数组再遍历
   *
   * 每个 callback 是 waitForChildTerminal 注册的 onParentStopped,它内部会调
   * 自己的 unsubscribe(由 subscribeParentStopped 返回的解绑句柄)→ unsubscribe
   * 内部 set.delete(callback)。如果这里遍历 Set 同时又被 callback 修改,会触发
   * "在 forEach 期间修改集合"的不确定行为(实际 V8 上 Set 的迭代器对 .delete
   * 容忍,但仍然不应依赖此实现细节)。先 [...set] 快照后遍历,语义最稳。
   *
   * ## 为什么遍历完后还要 delete 整张 key
   *
   * 单条父 run 终结只发生一次;parentStoppedListeners[parentRunId] 表项的生命
   * 周期就是"对应父 run 的活跃期"。遍历完所有 callback 后,对应 listener 集合
   * 通常已经被各自的 unsubscribe 清空(走 size===0 分支自动 delete);但保险
   * 起见硬 delete 一次,避免任何 callback 漏调 unsubscribe 导致表项残留。
   *
   * ## 为什么不在这里 stop 子 run
   *
   * onParentStopped callback 内部就有 `void runtime.stop(childRunId)`(由
   * waitForChildTerminal 注入);本方法只负责"分发触发",不直接动 runtime ——
   * 职责单一,便于推理。
   */
  private onParentRunFinished(parentRunId: string): void {
    const set = this.parentStoppedListeners.get(parentRunId)
    if (!set || set.size === 0) {
      // 没有 listener 等这个父(常见:父 run 没启动子 run 就退出),直接清表项即可
      this.parentStoppedListeners.delete(parentRunId)
      return
    }
    // 复制成数组快照,避免遍历期间 callback → unsubscribe 修改 set
    const callbacks = Array.from(set)
    for (const callback of callbacks) {
      try {
        callback()
      } catch (e) {
        // listener 内部不应该 throw(我们自己写的);若真有 throw 也不能让一条坏
        // listener 把整批 cancel 卡住。warn + 继续。
        console.warn('[ScriptBridge] parentStopped listener threw:', e)
      }
    }
    this.parentStoppedListeners.delete(parentRunId)
  }

  /**
   * runScript 分支的实装(对应 design.md §7.3)。
   *
   * 算法骨架(成功 / 失败 / SCRIPT_STOPPED 三路汇合,只发一条 RESPONSE):
   *   1) scriptStore.get(scriptId) 缺失 → SCRIPT_NOT_FOUND
   *   2) script.scope === 'global' → INVALID_SCOPE(全局脚本只能从 UI 触发,
   *      不能被 runScript 嵌套调度;互斥规则需要绑 profile,全局脚本不绑)
   *   3) profileStore.get(profileId) 缺失 → PROFILE_NOT_FOUND
   *   4) ensureProfileRunningForScript(profile) 拿 wsUrl;
   *      throw → INTERNAL_ERROR(浏览器没起来 / CDP 连不上 等运行时故障)
   *   5) runtime.start(...) 启动子 run;
   *      throw ProfileBusyError → PROFILE_BUSY 带 occupiedBy
   *      其它 throw → INTERNAL_ERROR
   *   6) 把 {reqId, childRunId} 加入 forks[parentRunId].pendingChildren
   *      —— 用于"父 run 退出 / 消失"时联动 stop 子 run + 写 SCRIPT_STOPPED;
   *      详见 handleForkExit 与 task 5 的 onParentRunFinished
   *   7) await waitForChildTerminal(childRunId, parentRunId)
   *      —— 永不 reject 的 Promise(见该方法注释);返回 'terminal' 或
   *      'parent-stopped'
   *   8) 删 pendingChildren 本次条目(成功 / 失败 / SCRIPT_STOPPED 三路都走这步)
   *   9) 按 kind 写 RESPONSE
   *
   * ## 错误兜底契约
   *
   * 本方法**永不**让异常逃逸到调用方(handleRequest 的 try/catch);所有 throw
   * 都在本方法内部翻译成 BridgeError 信封并写一条 RESPONSE。这样 handleRequest
   * 的 catch 不会再"二次发包",避免"内部已写 + 兜底又写"重复发包破坏对端
   * pending 表。
   *
   * 唯一可能让 handleRequest 兜底接管的场景是:本方法内部 sendResponse 自己抛
   * (理论上不会,sendResponse 已 try/catch),或 forks 表条目被并发删除(本进
   * 程单线程,不会发生)。这两条都属于"应该崩"的不可恢复错误。
   */
  private async executeRunScript(parentRunId: string, reqId: number, payload: unknown): Promise<void> {
    const entry = this.forks.get(parentRunId)
    if (!entry) {
      // 父 fork 已退,RESPONSE 送不到也无所谓,直接 no-op。理论上 handleRequest
      // 收到 message 之前 'exit' 已触发就会走这条;handleRequest 的 listener 在
      // exit 之后理应不再被调用,但 Node EventEmitter 在 'exit' 同 tick 内排队的
      // message 仍可能进来,这里做防御性兜底。
      return
    }

    // —— payload 形状校验 ——
    // 故意不引 zod;protocol 层就 typeof / in 操作,出错走 INTERNAL_ERROR。
    const p = payload as
      | {
          scriptId?: unknown
          profileId?: unknown
          params?: unknown
        }
      | null
      | undefined
    const scriptId = p?.scriptId
    const profileId = p?.profileId
    const params = p?.params
    if (typeof scriptId !== 'string' || typeof profileId !== 'string') {
      this.sendResponse(entry.child, {
        kind: 'response',
        id: reqId,
        ok: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'runScript: payload requires { scriptId: string, profileId: string }'
        }
      })
      return
    }
    // params 可缺省;缺省视为 {};任何非对象值兜底成 {} 而非 throw —— 为让
    // 用户脚本写 runScript(sid, pid) 时也能跑(spec §5 声称 params 可选)。
    const paramsRecord: Record<string, unknown> =
      params && typeof params === 'object' && !Array.isArray(params)
        ? (params as Record<string, unknown>)
        : {}

    // —— 1) script 校验 ——
    const script = this.scriptStore.get(scriptId)
    if (!script) {
      this.sendResponse(entry.child, {
        kind: 'response',
        id: reqId,
        ok: false,
        error: { code: 'SCRIPT_NOT_FOUND', message: `script not found: ${scriptId}` }
      })
      return
    }

    // —— 2) scope 校验 ——
    if (script.scope === 'global') {
      this.sendResponse(entry.child, {
        kind: 'response',
        id: reqId,
        ok: false,
        error: {
          code: 'INVALID_SCOPE',
          message: `script ${scriptId} is global-scope; runScript can only target profile-scope scripts`
        }
      })
      return
    }

    // —— 3) profile 校验 ——
    const profile = this.profileStore.get(profileId)
    if (!profile) {
      this.sendResponse(entry.child, {
        kind: 'response',
        id: reqId,
        ok: false,
        error: { code: 'PROFILE_NOT_FOUND', message: `profile not found: ${profileId}` }
      })
      return
    }

    // —— 4) 拿浏览器 wsUrl;5) 启动子 run ——
    let childRun: ScriptRun
    try {
      const wsUrl = await this.ensureProfileRunningForScript(profile)
      childRun = await this.runtime.start({
        script,
        profile,
        webSocketDebuggerUrl: wsUrl,
        triggeredBy: 'global-script',
        parentRunId,
        params: paramsRecord
      })
    } catch (e) {
      // 这里 toBridgeError 已经把 ProfileBusyError → PROFILE_BUSY,其余 → INTERNAL_ERROR。
      // ensureProfileRunningForScript 失败(浏览器没起来 / CDP 不通 / etc.)落到
      // INTERNAL_ERROR,与渲染层 scripts:run IPC 既有路径口径一致。
      this.sendResponse(entry.child, {
        kind: 'response',
        id: reqId,
        ok: false,
        error: this.toBridgeError(e)
      })
      return
    }

    // —— 6) 登记 pendingChildren ——
    // 用对象引用做 Set 元素,而不是合成 key 字符串:删除时直接 entry.delete(pending)
    // 拿引用,避免重新构造 key。
    const pending = { reqId, childRunId: childRun.id }
    // 重新取一次 entry:start() 是 await,期间父 fork 理论上不会 exit
    // (那是父进程的 listener 同步触发的),但保守起见再确认一次,免得登记到
    // 已被清空的 entry 上(虽然清空后 forks.get 会返回 undefined,这里二次取
    // 一致性更强)。
    const liveEntry = this.forks.get(parentRunId)
    if (!liveEntry) {
      // 极其罕见:子 run 已 start,父 fork 同步 exit 把 forks 表清了。
      // 走 fail-safe 路径:直接 stop 子 run + 不再尝试发 RESPONSE
      // (channel 已断,handleForkExit 已经为这条 reqId 写过 SCRIPT_STOPPED)。
      void this.runtime.stop(childRun.id)
      return
    }
    liveEntry.pendingChildren.add(pending)

    // —— 7) 等终态 / 父消失 ——
    const outcome = await this.waitForChildTerminal(childRun.id, parentRunId, {
      scriptId,
      profileId,
      params: paramsRecord,
      parentRunId
    })

    // —— 8) 移除 pending ——
    // 取最新 entry:waitForChildTerminal 返回前父 fork 可能已 exit 并清表。
    this.forks.get(parentRunId)?.pendingChildren.delete(pending)

    // —— 9) 写 RESPONSE ——
    if (outcome.kind === 'terminal') {
      this.sendResponse(entry.child, {
        kind: 'response',
        id: reqId,
        ok: true,
        value: { run: outcome.run }
      })
    } else {
      // 'parent-stopped':父 run 在子 run 终态前消失。注意:即便父 fork 此刻已
      // 进入 SIGTERM graceful 窗口期,sendResponse 也是"尽力而为";channel 已断
      // 时静默忽略。对应 design §错误场景 3 + Requirement 6.4。
      this.sendResponse(entry.child, {
        kind: 'response',
        id: reqId,
        ok: false,
        error: { code: 'SCRIPT_STOPPED', message: 'parent run was stopped' }
      })
    }
  }

  /**
   * 等子 run 进入终态 OR 父 run 消失,二选一汇合。
   *
   * ## 为什么这条 promise 永不 reject
   *
   * 让上层 algorithm(executeRunScript)走单一汇合路径 —— 只用一个 await 就拿到
   * 区分 kind 的对象,然后一次性分发到 RESPONSE 写入。
   *
   * 反例:如果这里能 reject,executeRunScript 就要 try/catch + finally(删 pending
   * + 兜底写 RESPONSE),逻辑会被切成至少 3 条出口路径(success / fail / cancel),
   * 各自的 RESPONSE 写入和 pendingChildren.delete 都要重复一份。永不 reject 让
   * 收尾代码线性化,关键不变量(每个 reqId 恰好一条 RESPONSE)的反向校对成本
   * 急剧降低。
   *
   * ## 监听器清理
   *
   * 终态命中或父消失命中后,**两条**监听器都要立即解绑 —— 否则会累积到
   * `runtime` 的 EventEmitter 与 `parentStoppedListeners` 表里,造成内存泄漏 +
   * 重复触发。listener 自身的逻辑里要先 cleanup 再 resolve,免得别处的代码
   * 依赖 microtask 顺序。
   *
   * ## 'parent-stopped' 路径的 stop 是 fire-and-forget
   *
   * runtime.stop 内部是 SIGTERM + 计划 SIGKILL,我们这条路径不需要等子 run 的
   * 终态(已经决定告诉调用方"父被停了"),让 runtime 自己异步收尾即可;
   * await 反而会在父 fork 的 graceful 窗口期内引入额外延迟,违背快速 reject
   * 的设计目标(Requirement 6.2 / 6.3)。
   */
  private waitForChildTerminal(
    childRunId: string,
    parentRunId: string,
    fallback: {
      scriptId: string
      profileId: string
      params: Record<string, unknown>
      parentRunId: string
    }
  ): Promise<{ kind: 'terminal'; run: ScriptRun } | { kind: 'parent-stopped' }> {
    return new Promise((resolve) => {
      // 先声明双方,再相互引用做 cleanup —— closure 内 forward declaration
      // 是 TS 这边唯一干净的写法。
      let offParentStopped: (() => void) | null = null

      const onChildEvent = (event: ScriptRuntimeEvent): void => {
        if (event.type !== 'status') return
        if (event.runId !== childRunId) return
        if (!isTerminalStatus(event.status)) return

        // 命中终态:先 cleanup,再 resolve
        this.runtime.off('event', onChildEvent)
        offParentStopped?.()

        // 优先用持久化对象(完整字段);找不到走合成 fallback(对应 design
        // §错误场景 2)。findRunById 是 task 4 顺手在 ScriptStore 加的简单线性
        // 查找;不开 Map 索引,理由见该方法注释。
        const persisted = this.scriptStore.findRunById(childRunId)
        const run: ScriptRun = persisted ?? buildSyntheticRun(childRunId, event, fallback)
        resolve({ kind: 'terminal', run })
      }

      const onParentStopped = (): void => {
        // 命中父消失:先 cleanup,再 fire-and-forget stop 子 run,最后 resolve
        this.runtime.off('event', onChildEvent)
        offParentStopped?.()
        void this.runtime.stop(childRunId)
        resolve({ kind: 'parent-stopped' })
      }

      this.runtime.on('event', onChildEvent)
      offParentStopped = this.subscribeParentStopped(parentRunId, onParentStopped)
    })
  }

  /**
   * 订阅"父 run 消失"事件(供 waitForChildTerminal 用)。
   *
   * 返回 unsubscribe 函数;调用方在汇合后必须调用一次,避免回调表泄漏。
   *
   * 当前(task 4)只搭好订阅表;真正的触发器(比较 active-changed 新旧集合)
   * 由 task 5 实现的 onParentRunFinished 接通。在 task 5 之前,父 run 消失只能
   * 走 fork 'exit' 路径(handleForkExit)间接触发 SCRIPT_STOPPED 写包,
   * 不经过 parentStoppedListeners 表 —— 这种情况下表里登记的 callback 会随
   * waitForChildTerminal 的"终态分支"自然 cleanup(因为 runtime 给子 run
   * 的 stop 仍会 emit terminal 事件,onChildEvent 命中后会 unsubscribe parent
   * 这边)。
   */
  private subscribeParentStopped(parentRunId: string, callback: () => void): () => void {
    let set = this.parentStoppedListeners.get(parentRunId)
    if (!set) {
      set = new Set()
      this.parentStoppedListeners.set(parentRunId, set)
    }
    set.add(callback)
    return () => {
      const current = this.parentStoppedListeners.get(parentRunId)
      if (!current) return
      current.delete(callback)
      if (current.size === 0) {
        this.parentStoppedListeners.delete(parentRunId)
      }
    }
  }

  /**
   * 把任意 throw 出来的东西翻译成 BridgeError 信封。
   *
   * 优先级:
   *   - ProfileBusyError → PROFILE_BUSY,带 occupiedBy(透传 runtime 那侧的语义);
   *   - 其它 → INTERNAL_ERROR + 原 message(若没有则 String(e))。
   *
   * 不直接 JSON.stringify Error 实例 —— Node IPC 的结构化克隆会丢掉自定义字段
   * (例如 occupiedBy),必须显式提取。
   */
  private toBridgeError(e: unknown): BridgeError {
    if (e instanceof ProfileBusyError) {
      return {
        code: 'PROFILE_BUSY',
        message: e.message,
        occupiedBy: e.occupiedBy
      }
    }
    const message = e instanceof Error ? e.message : String(e)
    const code: BridgeErrorCode = 'INTERNAL_ERROR'
    return { code, message }
  }

  /**
   * 写 RESPONSE 到指定 child 的 IPC channel。
   *
   * channel 已断时 process.send 同步返回 false / 抛 ERR_IPC_CHANNEL_CLOSED;
   * 都视为"尽力而为失败",静默吞掉,**不**让它把 bridge 主流程打断。设计依据见
   * design.md §错误场景 3。
   */
  private sendResponse(child: ChildProcess, response: BridgeResponse): void {
    try {
      // child.send 在 fork 没有 stdio:'ipc' 时为 undefined;ScriptRuntimeManager
      // 那侧固定 'ipc',这里仍做防御性判,免得未来 stdio 配置变更触发 NPE。
      child.send?.(response)
    } catch (e) {
      console.warn('[ScriptBridge] failed to send RESPONSE (channel likely closed):', e)
    }
  }
}

/**
 * 协议层 method 白名单校验。BridgeMethod 是字符串联合类型,运行时需要 Set 做
 * 包含检查。Set 用 const 而不是 module-level let,确保白名单不会被运行时改写。
 *
 * 与 bridge-types.ts 的 BridgeMethod 严格对齐;新增 method 必须两边同步。
 */
const BRIDGE_METHODS: ReadonlySet<BridgeMethod> = new Set<BridgeMethod>([
  'profiles.list',
  'profiles.get',
  'profiles.launch',
  'profiles.close',
  'runScript'
])

function isBridgeMethod(value: unknown): value is BridgeMethod {
  return typeof value === 'string' && BRIDGE_METHODS.has(value as BridgeMethod)
}

/**
 * 终态判定。与 ScriptRunStatus 联合类型保持一致(succeeded / failed / stopped
 * 三选一,排除 pending / running)。
 *
 * 单独写成函数而不是 inline,是为了让 waitForChildTerminal 的命中分支表达更
 * 直白("if status is terminal" 比 "if status in {...}" 在 review 时更清晰),
 * 同时未来若状态机扩展(例如加 'cancelled')只需改这一处。
 */
function isTerminalStatus(status: ScriptRunStatus): status is 'succeeded' | 'failed' | 'stopped' {
  return status === 'succeeded' || status === 'failed' || status === 'stopped'
}

/**
 * 子 run 终态事件触发但 ScriptStore.findRunById 未命中的兜底合成器
 * (对应 design.md §错误场景 2)。
 *
 * 触发条件极小概率:runtime emit 'status' terminal 事件 与 store.finalizeRun
 * 的内存表写入之间存在一个 microtask 缝隙,理论上不会进入,但作为"协议永远
 * 给上层一个 ScriptRun"的契约保险,这里给出最小字段集。
 *
 * 字段口径:
 *   - id / scriptId / profileId / triggeredBy / parentRunId / params:从调用方
 *     传入的 fallback(executeRunScript 已经握有这些值,直接透传)
 *   - status:事件携带的终态(必经 isTerminalStatus 校验)
 *   - startedAt:用空串占位 —— 不掩饰"我们没拿到准确开始时间"这个事实;
 *     用户脚本若依赖 startedAt 计算时长,空串会立刻在 new Date('') 处报错
 *     而不是给一个伪造的"now",更利于排障
 *   - endedAt:事件附带优先;否则 new Date().toISOString() 兜底("现在"是
 *     合成时刻的合理近似,误差最多一个事件循环)
 *   - exitCode:事件附带优先;否则 null
 *   - error:事件附带(failed / stopped 时 runtime 会写)
 *   - logPath:空串 —— ActiveRunsButton 抽屉默认走 logPath 读流,空串会让
 *     UI 落到"无日志"分支,与"未持久化"语义一致
 */
function buildSyntheticRun(
  childRunId: string,
  event: { type: 'status'; runId: string; status: ScriptRunStatus; exitCode?: number | null; error?: string; endedAt?: string },
  fallback: {
    scriptId: string
    profileId: string
    params: Record<string, unknown>
    parentRunId: string
  }
): ScriptRun {
  return {
    id: childRunId,
    scriptId: fallback.scriptId,
    profileId: fallback.profileId,
    status: event.status,
    startedAt: '',
    endedAt: event.endedAt ?? new Date().toISOString(),
    exitCode: event.exitCode ?? null,
    error: event.error,
    logPath: '',
    triggeredBy: 'global-script',
    parentRunId: fallback.parentRunId,
    params: fallback.params
  }
}
