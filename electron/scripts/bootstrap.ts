import fs from 'node:fs'
import Module from 'node:module'
import path from 'node:path'
import { transformSync } from 'esbuild'
import { createScriptApi } from './sdk'
import type { ScriptContext } from './sdk/types'
import type { BrowserProfile } from '../types'

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
  profile: BrowserProfile
  webSocketDebuggerUrl: string
  workingDir: string
  entryPath: string
}

function readBootstrapEnv(): BootstrapEnv {
  const raw = process.env.AUTO_REGISTRY_SCRIPT_CONTEXT
  if (!raw) {
    throw new Error('AUTO_REGISTRY_SCRIPT_CONTEXT is not set; bootstrap was invoked directly')
  }
  const parsed = JSON.parse(raw) as BootstrapEnv
  if (!parsed.profile || !parsed.webSocketDebuggerUrl || !parsed.entryPath || !parsed.workingDir) {
    throw new Error('AUTO_REGISTRY_SCRIPT_CONTEXT is missing required fields')
  }
  return parsed
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

  // 用户代码里的 stopSignal 由我们掌控；父进程 SIGTERM 时我们 abort 它
  const abortController = new AbortController()
  process.on('SIGTERM', () => {
    postLog('warn', ['Script received SIGTERM; abort stopSignal'])
    abortController.abort()
  })
  process.on('SIGINT', () => abortController.abort())

  // 父进程崩溃 / 被 Ctrl+C 会让 IPC 通道 disconnect；此时我们自杀，
  // 避免脚本子进程变成无人管的孤儿继续占用浏览器连接。
  process.on('disconnect', () => {
    console.error('[bootstrap] parent disconnected, exiting')
    process.exit(1)
  })

  const context: ScriptContext = {
    profile: env.profile,
    webSocketDebuggerUrl: env.webSocketDebuggerUrl,
    workingDir: env.workingDir,
    logSink: postLog,
    stopSignal: abortController.signal
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
      const maybePromise = defaultExport()
      if (maybePromise && typeof (maybePromise as Promise<unknown>).then === 'function') {
        await maybePromise
      }
    }

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
