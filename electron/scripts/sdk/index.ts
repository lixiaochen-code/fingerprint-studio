import { BrowserHandle } from './browser'
import { KvStore } from './kv'
import type { ProfilesApi, RunScriptResult, ScriptApi, ScriptContext } from './types'

/**
 * 在错误的 scope 里调某 API 时抛出。Bootstrap 把它的 message 透回主进程日志。
 *
 * 我们故意不让全局脚本里调 page/browser 直接静默成 noop —— 静默会让用户以为
 * 拿到了 Browser 实例,后面 .newPage() 报神秘错误更难排查。明确 throw + 提示
 * "这是全局脚本,没有浏览器" 比假装能用更友好。
 */
class ScopeMismatchError extends Error {
  readonly code: string
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
 * 全局脚本 API 在 phase 2 仍然是占位:profiles.* 与 runScript 都 throw "not implemented yet"
 * (但带的是 GLOBAL_NOT_IMPL_YET 而非 GLOBAL_NOT_AVAILABLE,语义不同)。phase 6 会把
 * 实际 IPC 接进来。当前阶段允许全局脚本本身正常起来跑 log/sleep/kv,这就够验证骨架了。
 */
function notImplementedYet(method: string): never {
  throw new ScopeMismatchError(
    'GLOBAL_NOT_IMPL_YET',
    `profiles.${method} is not implemented yet (spec phase 6).`
  )
}

function makeProfileScopeProfilesApi(): ProfilesApi {
  return {
    list: () => Promise.reject(globalNotAvailable()),
    get: () => Promise.reject(globalNotAvailable()),
    create: () => Promise.reject(globalNotAvailable()),
    delete: () => Promise.reject(globalNotAvailable()),
    setQueue: () => Promise.reject(globalNotAvailable())
  }
}

function makeGlobalScopeProfilesApi(): ProfilesApi {
  return {
    list: () => notImplementedYet('list'),
    get: () => notImplementedYet('get'),
    create: () => notImplementedYet('create'),
    delete: () => notImplementedYet('delete'),
    setQueue: () => notImplementedYet('setQueue')
  }
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
    profiles: isGlobal ? makeGlobalScopeProfilesApi() : makeProfileScopeProfilesApi(),
    runScript: isGlobal
      ? (() => notImplementedYet('runScript')) as ScriptApi['runScript']
      : (() => Promise.reject(globalNotAvailable())) as ScriptApi['runScript']
  }

  return Object.assign(api, {
    async __dispose() {
      if (browserHandle) await browserHandle.dispose()
    }
  })
}

export type { ScriptApi, ScriptContext, ScriptMainArgs, ProfilesApi, RunScriptResult } from './types'
