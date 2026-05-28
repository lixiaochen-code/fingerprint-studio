import fs from 'node:fs'
import Module from 'node:module'
import path from 'node:path'
import { ensureEsbuildBinaryPath } from './esbuild-binary'
import { transformSync } from 'esbuild'
import { createScriptApi } from './sdk'
import { createBridgeClient } from './sdk/bridge-client'
import type { ScriptContext, ScriptMainArgs } from './sdk/types'
import type { BrowserProfile } from '../types'

// 必须早于 esbuild 被**调用**,不需要早于 import:`import { transformSync }` 只是
// 把绑定挂出来,esbuild 自己的 lib 不会在 import 时 spawn 二进制,只在第一次
// `transformSync(...)` 调用时才会去 spawn。我们这里在模块顶级 side effect 位置
// 把 ESBUILD_BINARY_PATH 设好,esbuild 在调用时读 env,跳过它自己的 require.resolve
// 直接 spawn 我们指定的(已 unpack 出 asar 的)路径。dev 模式 path 不含 .asar 段,
// ensureEsbuildBinaryPath 内部 replace 是 noop,行为不变。
ensureEsbuildBinaryPath()

/**
 * 脚本子进程的真正入口：父进程 fork 这个文件的编译产物。
 *
 * 约定：
 * - 启动参数来自 env（fork 时传入），避免进程列表里暴露 CDP endpoint
 * - 转译走 esbuild.transformSync（ts/tsx/js 都支持）
 * - `import 'auto-registry'` 会被劫持到这里 createScriptApi 的产物
 * - SIGTERM → abort stopSignal → 给用户代码 3 秒 graceful 退出的机会（由父进程保证）
 * - 任何用户代码未捕获异常都会记日志并以非 0 退出
 */

interface BootstrapEnv {
  scope: 'profile' | 'global'
  profile: BrowserProfile | null
  webSocketDebuggerUrl: string | null
  workingDir: string
  entryPath: string
}

function readBootstrapEnv(): BootstrapEnv {
  const raw = process.env.AUTO_REGISTRY_SCRIPT_CONTEXT
  if (!raw) {
    throw new Error('AUTO_REGISTRY_SCRIPT_CONTEXT is not set; bootstrap was invoked directly')
  }
  const parsed = JSON.parse(raw) as BootstrapEnv
  // 默认 scope='profile' 兼容老 fork(主进程更新前发的 context 没 scope 字段)
  const scope: 'profile' | 'global' = parsed.scope ?? 'profile'
  if (!parsed.entryPath || !parsed.workingDir) {
    throw new Error('AUTO_REGISTRY_SCRIPT_CONTEXT is missing required fields')
  }
  if (scope === 'profile' && (!parsed.profile || !parsed.webSocketDebuggerUrl)) {
    throw new Error('profile-scope script requires profile + webSocketDebuggerUrl in context')
  }
  return {
    scope,
    profile: parsed.profile ?? null,
    webSocketDebuggerUrl: parsed.webSocketDebuggerUrl ?? null,
    workingDir: parsed.workingDir,
    entryPath: parsed.entryPath
  }
}

/**
 * 解析父进程通过 env 投递的 main(args) 入参(spec §4.1 / §4.3)。
 *
 * 为什么独立一个 env(`AUTO_REGISTRY_SCRIPT_ARGS`)而不复用 SCRIPT_CONTEXT:
 * - SCRIPT_CONTEXT 走 readBootstrapEnv 的启动检查(profile / wsUrl 必填校验),
 *   args 是用户脚本的入参,生命周期与语义都不同;合并会污染 phase 1/2 已经生效
 *   的错误信息分支。
 *
 * 为什么 env 缺失要兜底而不是 throw:
 * - phase 3 部署后主进程一定会发这个 env。这里的兜底只是为了不让"老 fork 链路"
 *   或本地直接手工跑 bootstrap 的排障场景崩在第一步,语义上等价于一次手动 run。
 *   缺失时:params={},profile 走 SCRIPT_CONTEXT 里的 profile 快照保持一致,
 *   triggeredBy='manual',run 字段填占位值。
 */
function readBootstrapArgs(env: BootstrapEnv): ScriptMainArgs {
  const raw = process.env.AUTO_REGISTRY_SCRIPT_ARGS
  // 缺省的兜底 args:与手动 run 语义一致
  const fallback: ScriptMainArgs = {
    params: {},
    profile: env.profile,
    run: { id: '<unknown>', startedAt: new Date().toISOString() },
    triggeredBy: 'manual'
  }

  if (!raw) return freezeArgs(fallback)

  try {
    const parsed = JSON.parse(raw) as Partial<ScriptMainArgs>
    // 字段缺失时按兜底值补齐;不严格校验形状,避免主进程一旦小改字段就让脚本
    // 直接挂掉(这里是宽容解析,严格契约由主进程保证)。
    const merged: ScriptMainArgs = {
      params: (parsed.params ?? {}) as Record<string, unknown>,
      profile: parsed.profile ?? env.profile,
      run: parsed.run ?? fallback.run,
      triggeredBy: parsed.triggeredBy ?? 'manual',
      ...(parsed.parentRunId ? { parentRunId: parsed.parentRunId } : {})
    }
    return freezeArgs(merged)
  } catch (error) {
    // env 异常时不直接崩,降级为兜底——脚本至少能跑起来,排障再看主进程日志
    postLog('warn', ['Failed to parse AUTO_REGISTRY_SCRIPT_ARGS, falling back to manual defaults:', (error as Error).message])
    return freezeArgs(fallback)
  }
}

/**
 * 把 args 与 args.profile 冻结成只读语义,与 SDK 里 `api.profile` 走的 Object.freeze
 * 快照保持一致,防止脚本作者误改 args.profile 字段后影响后续逻辑(例如再次读取或
 * 传给其他 SDK 调用)。注意只做单层 freeze:profile 字段本身在主进程序列化时
 * 已脱离主进程对象图,这里的冻结纯粹是给用户的"别改我"提醒。
 */
function freezeArgs(args: ScriptMainArgs): ScriptMainArgs {
  if (args.profile) Object.freeze(args.profile)
  return Object.freeze(args)
}

/**
 * 把脚本日志透回父进程。
 * 注意：这里只通过 process.send 发结构化事件，不再 console.log 到 stdout，
 * 否则 runtime 侧 stdout 捕获和 IPC 捕获会把同一条 SDK log 重复派发给渲染层。
 * 用户代码里直接 console.log('foo') 会自然落到 stdout，runtime 会以 'stdout'
 * level 分发，不经过这里——两条链路互不打架。
 */
function postLog(level: 'info' | 'warn' | 'error', args: unknown[]): void {
  const stringified = args.map((value) =>
    typeof value === 'string' ? value : safeStringify(value)
  )
  const line = stringified.join(' ')

  if (process.send) {
    process.send({ type: 'log', level, line, at: new Date().toISOString() })
  } else {
    // 兜底：bootstrap 被脱离 fork 直接运行（仅限手动排障），至少不丢日志
    if (level === 'error') console.error(line)
    else if (level === 'warn') console.warn(line)
    else console.log(line)
  }
}

function safeStringify(value: unknown): string {
  if (value instanceof Error) return value.stack ?? value.message
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

/**
 * 一次性安装两类 require 劫持:
 * 1. `require('auto-registry')` → 虚拟模块,导出 createScriptApi 产物
 * 2. `require('puppeteer-core')` / `require('puppeteer')` → 实际路径指向 rebrowser-puppeteer-core
 *
 * Node 的 Module._resolveFilename 是公开且稳定的 internal,在我们 100% 控制
 * 这个进程的前提下这么做是可以接受的。
 *
 * 关键设计:
 * - **严格相等**匹配 specifier(`===`),不能 startsWith — 否则会拦截 rebrowser
 *   内部的 `puppeteer-core/lib/cjs/...` 子模块导致递归
 * - rebrowserPath 在 fork 子进程一启动时就 resolve 并缓存,运行时不再重算
 * - 两类劫持合并进同一个 _resolveFilename 拦截,避免链式 wrap
 */
function installModuleInterceptions(api: object, cleanup: { dispose: () => Promise<void> }, rebrowserPath: string): void {
  const moduleInternals = Module as unknown as {
    _resolveFilename: (request: string, parent: NodeModule, ...rest: unknown[]) => string
    _cache: Record<string, NodeModule>
  }
  const originalResolveFilename = moduleInternals._resolveFilename
  const syntheticPath = '\0auto-registry-virtual'
  moduleInternals._cache[syntheticPath] = {
    id: syntheticPath,
    filename: syntheticPath,
    path: syntheticPath,
    loaded: true,
    exports: api,
    paths: [],
    children: [],
    require: (() => { throw new Error('virtual module') }) as unknown as NodeModule['require'],
    parent: null
  } as unknown as NodeModule

  moduleInternals._resolveFilename = function patchedResolve(request, parent, ...rest) {
    if (request === 'auto-registry') return syntheticPath
    // 用户脚本 `from 'puppeteer-core'` 或 `from 'puppeteer'` 透明走 rebrowser,
    // SDK 内部已直接 import 'rebrowser-puppeteer-core',这里只为用户脚本服务。
    if (request === 'puppeteer-core' || request === 'puppeteer') return rebrowserPath
    return originalResolveFilename.call(this, request, parent, ...rest)
  }

  // 确保进程退出时释放浏览器连接;用户没主动 disconnect 也没关系
  process.on('exit', () => {
    void cleanup.dispose()
  })
}

/**
 * 用 esbuild 把用户 entry（ts/tsx/mts/cts/jsx）编译成 CommonJS，写入临时文件，
 * 再让 Node 走正常 require 流程。直接 eval 转译结果虽然更快，但无法让用户文件里
 * `import './utils'` 这种相对路径解析生效——交给 Node 原生 require 更省事。
 *
 * 我们不直接 require 用户的 entry，因为 Node 在 26+ 之前并不原生支持 .ts。
 * 临时文件放在 os.tmpdir 下的脚本专属目录，父进程在 run 结束后统一清理。
 */
function compileEntry(entryPath: string, workingDir: string): string {
  const source = fs.readFileSync(entryPath, 'utf8')
  const loader = inferLoader(entryPath)

  const result = transformSync(source, {
    loader,
    format: 'cjs',
    target: 'node20',
    sourcemap: 'inline',
    sourcefile: entryPath
  })

  const tmpDir = path.join(workingDir, '.compiled')
  fs.mkdirSync(tmpDir, { recursive: true })
  const compiledPath = path.join(tmpDir, `${path.basename(entryPath)}.${process.pid}.cjs`)
  fs.writeFileSync(compiledPath, result.code)
  return compiledPath
}

function inferLoader(entryPath: string): 'ts' | 'tsx' | 'js' | 'jsx' {
  const ext = path.extname(entryPath).toLowerCase()
  if (ext === '.tsx') return 'tsx'
  if (ext === '.ts' || ext === '.mts' || ext === '.cts') return 'ts'
  if (ext === '.jsx') return 'jsx'
  return 'js'
}

async function main(): Promise<void> {
  const env = readBootstrapEnv()
  // main(args) 协议:env 解析必须在用户代码加载之前,确保 args 与 SDK 一起就绪
  const args = readBootstrapArgs(env)

  // 为什么 bridge 要在 createScriptApi 之前就构造好:
  // SDK factory(createScriptApi)在闭包里立刻就持 bridge 引用 ——
  // makeGlobalScopeProfilesApi(bridge) / makeGlobalRunScript(bridge) 都是在工厂
  // 调用时同步绑定的;迟一步 SDK 那侧拿到的就是 null,用户脚本第一行 `await
  // profiles.list()` 直接崩在"call of undefined"。
  // 而且把 bridge 提前到 disconnect handler 注册之前构造,handler 闭包就能引用
  // 到它(见下方 process.on('disconnect') 里的 bridge.dispose 调用)。
  const bridge = createBridgeClient()

  // 用户代码里的 stopSignal 由我们掌控;父进程 SIGTERM 时我们 abort 它
  const abortController = new AbortController()
  process.on('SIGTERM', () => {
    postLog('warn', ['Script received SIGTERM; abort stopSignal'])
    abortController.abort()
  })
  process.on('SIGINT', () => abortController.abort())

  // 父进程崩溃 / 被 Ctrl+C 会让 IPC 通道 disconnect;此时我们自杀,
  // 避免脚本子进程变成无人管的孤儿继续占用浏览器连接。
  process.on('disconnect', () => {
    console.error('[bootstrap] parent disconnected, exiting')
    // 为什么 disconnect 时要 dispose bridge:
    // pending 表里可能挂着 await 中的 profiles.list / runScript;父 channel 已
    // 断,主进程那侧的 RESPONSE 永远到不了,这些 Promise 会一直 hang 直到 fork
    // 被 SIGKILL,中间用户代码的 try/catch / finally 都跑不到。dispose 一次性
    // 把 pending 全 reject('parent disconnected'),让用户的 catch 至少能跑一遍
    // 收尾。**注意:必须放在 process.exit(1) 之前** —— exit 会立刻终结事件循环,
    // 排在它之后的语句永远不会执行。
    bridge.dispose('parent disconnected')
    process.exit(1)
  })

  const context: ScriptContext = {
    scope: env.scope,
    profile: env.profile,
    webSocketDebuggerUrl: env.webSocketDebuggerUrl,
    workingDir: env.workingDir,
    logSink: postLog,
    stopSignal: abortController.signal,
    // 注入 bridge 到 SDK 上下文 —— 全局 scope 的 profiles.* / runScript 走这条
    // 通道与主进程通信;profile-scope SDK 内部不会读这个字段(直接 reject
    // GLOBAL_NOT_AVAILABLE),传过去也无副作用。
    bridge
  }

  const api = createScriptApi(context)
  // require('puppeteer-core') 在用户脚本运行前就要被劫持到 rebrowser 路径,因此提前 resolve。
  // require.resolve 在父进程 node_modules 拓扑下永远 work,即便打进 asar 也是普通文件解析。
  const rebrowserPath = require.resolve('rebrowser-puppeteer-core')
  installModuleInterceptions(api, { dispose: () => api.__dispose() }, rebrowserPath)

  process.on('unhandledRejection', (reason) => {
    postLog('error', ['Unhandled rejection:', reason])
    process.exitCode = 1
  })

  let compiledPath: string
  try {
    compiledPath = compileEntry(env.entryPath, env.workingDir)
  } catch (error) {
    postLog('error', ['Failed to compile entry', (error as Error).message])
    process.exit(2)
  }

  try {
    // 使用 require 而不是 import() 是因为 esbuild 已输出 cjs，且我们需要
    // 同步注入 auto-registry 虚拟模块（import() 的时序会让第一个 import 失败）
    const moduleExports = require(compiledPath)

    // 支持两种写法：
    //   1. 脚本末尾 `main()` 直接自启动（典型）
    //   2. 脚本 `export default async () => {...}` 由我们调起（可选，给希望被框架调度的用户）
    const defaultExport = (moduleExports && (moduleExports.default ?? moduleExports))
    if (typeof defaultExport === 'function') {
      // 把解析到的 args 传给用户的 default export(spec §4.3)。
      // 老 `function main() { ... }` 没声明形参也兼容——JS 函数对额外实参直接忽略。
      const maybePromise = defaultExport(args)
      if (maybePromise && typeof (maybePromise as Promise<unknown>).then === 'function') {
        await maybePromise
      }
    }

    // 用户 main() 自然返回时,可能还有 fire-and-forget 起的子任务挂在 bridge
    // pending(典型场景:`runScript(...)` 没 await,把它当成"开了一条独立流水
    // 线"用)。这里 await whenIdle 让父 fork 的 main() 等到所有 pending 清空再
    // 继续走"completed"上报和退出。
    //
    // 与"用户主动停止"路径并不冲突:SIGTERM → abortController.abort() 会让
    // 用户代码里的 await 抛错,catch 路径走的是下面的 catch 分支,根本不会到
    // 这里的 whenIdle;dispose() 触发的 reject 也会让 pending 表迅速清空,
    // 无 leak 风险。
    //
    // 与"app exit"路径也不冲突:主进程那侧 SIGTERM 级联仍会强行结束子进程,
    // whenIdle 顶多多等几个 microtask。
    await bridge.whenIdle()

    process.send?.({ type: 'completed', at: new Date().toISOString() })
    process.exitCode = 0
  } catch (error) {
    // stopSignal abort 会让任何 await sleep / await page.xxx 抛出同一类错误——
    // 这是用户主动停止的正常路径，而不是脚本 bug，不应作为错误落日志。
    if (abortController.signal.aborted) {
      process.send?.({ type: 'stopped', at: new Date().toISOString() })
      process.exitCode = 0
    } else {
      postLog('error', [(error as Error).stack ?? (error as Error).message ?? String(error)])
      process.send?.({ type: 'failed', error: (error as Error).message, at: new Date().toISOString() })
      process.exitCode = 1
    }
  } finally {
    await api.__dispose()
  }

  // 显式退出避免 puppeteer-core 的 http agent / websocket 资源 hang 住事件循环——
  // 我们的 profile 浏览器进程是独立 detached 的，SDK disconnect 后主进程没理由继续留着。
  process.exit(process.exitCode ?? 0)
}

// 与父进程握手一次，让父进程知道子进程已就位
if (process.send) process.send({ type: 'ready' })

main()

// 文件名 export 以满足 isolatedModules
export {}
