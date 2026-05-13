import { BrowserHandle } from './browser'
import { KvStore } from './kv'
import type { ScriptApi, ScriptContext } from './types'

/**
 * SDK 工厂：根据 ScriptContext 产出用户脚本 `import 'auto-registry'` 拿到的 API 对象。
 * 这里是 Node 侧的实现；Monaco 看到的类型定义由 ./types.ts 直接提供。
 */
export function createScriptApi(context: ScriptContext): ScriptApi & { __dispose(): Promise<void> } {
  const browserHandle = new BrowserHandle(context.webSocketDebuggerUrl)
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
    profile: Object.freeze({ ...context.profile }),
    browser: () => browserHandle.browser(),
    page: () => browserHandle.page(),
    log: (...args) => context.logSink('info', args),
    warn: (...args) => context.logSink('warn', args),
    error: (...args) => context.logSink('error', args),
    sleep,
    kv: kvStore,
    stopSignal: context.stopSignal
  }

  return Object.assign(api, {
    async __dispose() {
      await browserHandle.dispose()
    }
  })
}

export type { ScriptApi, ScriptContext } from './types'
