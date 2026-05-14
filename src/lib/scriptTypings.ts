/**
 * Monaco 编辑器里给用户脚本提供智能补全用的 d.ts。
 *
 * 设计要点：
 * 1. 不直接 ?raw 加载 electron/scripts/sdk/types.ts —— 那份带相对/外部 import，
 *    Monaco TS 服务跨文件解析容易失败，体验上是满屏红线。
 * 2. **不**把 auto-registry 和 puppeteer-core 拆 ambient 块时跨文件 import：
 *    Monaco 0.55 的 extraLib 当 ambient 文件加载，跨文件 `import type ... from 'puppeteer-core'`
 *    在另一个 ambient 块里不稳定。两种做法选一种：
 *      a. 合并到同一个 ambient .d.ts（小型 stub）；
 *      b. 各自独立 ambient .d.ts，互不引用（大型完整 d.ts）。
 *    本文件混用：auto-registry 自包含一份；puppeteer-core 用 lib/types.d.ts 真包；
 *    axios/dayjs/zod/cheerio 用各自的最小 stub。
 * 3. **不**用 `node_modules/<pkg>/index.d.ts` 风格的虚拟路径 + NodeJs moduleResolution
 *    —— 我们走 Classic resolution，只看 ambient `declare module`。
 *
 * SDK 表面（电子版 spec § 7）变更时，**只**需要改 AUTO_REGISTRY_DTS。
 * 内置三方包升级时，重跑构建，?raw import 会自动拿到最新 d.ts。
 */

// puppeteer-core 官方打了一份 self-contained 的 lib/types.d.ts（~285KB），
// 直接 ?raw 引入。它内部少数 `import 'node:xxx'` / `import 'devtools-protocol'`
// 在 Monaco Classic 解析下被忽略，落到补全里就是 `any`，可接受。
import puppeteerTypesRaw from '../../node_modules/puppeteer-core/lib/types.d.ts?raw'

const AUTO_REGISTRY_BLOCK = `
declare module 'auto-registry' {
  // 同一份 extraLib 文件内的 ambient 块之间互相 import 是稳定的（跨文件不稳）。
  // 因此 SDK 真实返回的 Browser/Page 类型可以直接拿到，用户拿到 page() / browser()
  // 就能立刻看到 puppeteer-core 完整签名补全，不用再做任何强转。
  import type { Browser, Page } from 'puppeteer-core'

  /** 当前脚本绑定的浏览器环境（profile）。运行时只读快照。 */
  export interface Profile {
    id: string
    name: string
    platform: string
    notes: string
    startUrl: string
    proxy: { host: string; port: number; username?: string; password?: string }
    profilePath: string
    createdAt: string
    updatedAt: string
    lastOpenedAt?: string
    /** 完整 fingerprint 字段较多，按 puppeteer-core 用法读即可。 */
    fingerprint: Record<string, unknown>
  }

  /** 当前脚本绑定的环境，只读。 */
  export const profile: Readonly<Profile>

  /**
   * 获取 puppeteer-core 的 Browser 实例。
   * 多次调用复用同一连接；脚本退出时 SDK 自动 disconnect（不会关浏览器窗口）。
   */
  export function browser(): Promise<Browser>

  /**
   * 取浏览器中第一个 tab；若无则新建。
   * 等价于 \`(await browser()).pages()[0] ?? (await browser()).newPage()\`。
   */
  export function page(): Promise<Page>

  /** 输出到应用的日志面板，level=info。 */
  export function log(...args: unknown[]): void
  /** 输出到应用的日志面板，level=warn。 */
  export function warn(...args: unknown[]): void
  /** 输出到应用的日志面板，level=error。 */
  export function error(...args: unknown[]): void

  /** 休眠 ms 毫秒；脚本被用户停止时会提前 reject。 */
  export function sleep(ms: number): Promise<void>

  /**
   * 文件级 KV。持久化到脚本目录下的 state.json（local）
   * 或 <userData>/scripts/external-states/<id>/state.json（external）。
   */
  export const kv: {
    get<T = unknown>(key: string): Promise<T | null>
    set(key: string, value: unknown): Promise<void>
    delete(key: string): Promise<void>
  }

  /**
   * 用户点"停止"时 abort 的 AbortSignal。
   * 长循环里建议主动检查 \`if (stopSignal.aborted) return\` 优雅退出。
   */
  export const stopSignal: AbortSignal
}
`.trim()

/**
 * puppeteer-core 真实 d.ts 用顶层 `export declare class Browser`，要让
 * `import { Browser } from 'puppeteer-core'` 在 Monaco 里生效，需要把它们包进
 * `declare module 'puppeteer-core' {}`。
 *
 * 直接 wrap 会导致内部那些 `import {ChildProcess} from 'node:child_process'`
 * / `import 'devtools-protocol'` 报"Cannot find module"；最简单的办法是把它们
 * 替换成 `type ChildProcess = unknown` 之类。但 puppeteer-core 内部 import 很多，
 * 一一替换很脆弱。妥协方案：直接整个文件用 ambient module 包起来 + 顶部追加几个
 * `declare module 'xxx' { const x: any; export = x }` 的 catch-all 占位，让那些
 * 内部 import 不报错。
 */
const PUPPETEER_BLOCK = `
// catch-all: puppeteer-core 自身 import 的 Node 内置 / 外围包，编辑器里我们不关心
declare module 'node:child_process' { const x: unknown; export type ChildProcess = unknown; export = x }
declare module 'node:stream' { const x: unknown; export class PassThrough {}; export = x }
declare module 'devtools-protocol' { const x: unknown; export const Protocol: unknown; export = x }
declare module 'devtools-protocol/types/protocol-mapping.js' { const x: unknown; export type ProtocolMapping = unknown; export = x }
declare module 'typed-query-selector/parser.js' { export type ParseSelector<S, F = Element> = F }
declare module 'webdriver-bidi-protocol' { const x: unknown; export const Session: unknown; export = x }

declare module 'puppeteer-core' {
${puppeteerTypesRaw
  // puppeteer-core/lib/types.d.ts 里的 import 在 ambient 块里同样会触发解析，
  // 但因为我们上面已 declare 了所有外围 module，这些 import 都能找到对应占位类型，
  // 不需要再额外处理。
  .replace(/^export\s+/gm, '') // 去掉行首 `export `，让所有声明先在块内可见
  .replace(/^declare\s+/gm, '') // 去掉行首 `declare `，否则在 declare module 块内会报错
}
}
`.trim()

const AXIOS_BLOCK = `
declare module 'axios' {
  /** Axios HTTP 客户端最小 stub，覆盖最常见的 GET / POST / 请求/响应。 */
  export interface AxiosRequestConfig<D = unknown> {
    url?: string
    method?: 'get' | 'GET' | 'post' | 'POST' | 'put' | 'PUT' | 'delete' | 'DELETE' | 'patch' | 'PATCH' | 'head' | 'HEAD' | 'options' | 'OPTIONS'
    baseURL?: string
    headers?: Record<string, string | number | boolean>
    params?: Record<string, unknown>
    data?: D
    timeout?: number
    responseType?: 'arraybuffer' | 'document' | 'json' | 'text' | 'stream'
    signal?: AbortSignal
  }

  export interface AxiosResponse<T = unknown, D = unknown> {
    data: T
    status: number
    statusText: string
    headers: Record<string, string>
    config: AxiosRequestConfig<D>
  }

  export interface AxiosError<T = unknown, D = unknown> extends Error {
    config?: AxiosRequestConfig<D>
    code?: string
    response?: AxiosResponse<T, D>
    isAxiosError: boolean
  }

  export interface AxiosInstance {
    <T = unknown, R = AxiosResponse<T>, D = unknown>(config: AxiosRequestConfig<D>): Promise<R>
    get<T = unknown, R = AxiosResponse<T>>(url: string, config?: AxiosRequestConfig): Promise<R>
    delete<T = unknown, R = AxiosResponse<T>>(url: string, config?: AxiosRequestConfig): Promise<R>
    head<T = unknown, R = AxiosResponse<T>>(url: string, config?: AxiosRequestConfig): Promise<R>
    options<T = unknown, R = AxiosResponse<T>>(url: string, config?: AxiosRequestConfig): Promise<R>
    post<T = unknown, R = AxiosResponse<T>, D = unknown>(url: string, data?: D, config?: AxiosRequestConfig<D>): Promise<R>
    put<T = unknown, R = AxiosResponse<T>, D = unknown>(url: string, data?: D, config?: AxiosRequestConfig<D>): Promise<R>
    patch<T = unknown, R = AxiosResponse<T>, D = unknown>(url: string, data?: D, config?: AxiosRequestConfig<D>): Promise<R>
    create(config?: AxiosRequestConfig): AxiosInstance
    isAxiosError(payload: unknown): payload is AxiosError
  }

  const axios: AxiosInstance
  export default axios
}
`.trim()

const DAYJS_BLOCK = `
declare module 'dayjs' {
  /** dayjs 最小 stub —— 链式 API 全部按 Dayjs 接口走。 */
  export interface Dayjs {
    format(template?: string): string
    valueOf(): number
    unix(): number
    toDate(): Date
    toISOString(): string
    toString(): string
    add(value: number, unit?: string): Dayjs
    subtract(value: number, unit?: string): Dayjs
    diff(date: ConfigType, unit?: string, float?: boolean): number
    startOf(unit: string): Dayjs
    endOf(unit: string): Dayjs
    isBefore(date: ConfigType, unit?: string): boolean
    isAfter(date: ConfigType, unit?: string): boolean
    isSame(date: ConfigType, unit?: string): boolean
    year(): number
    month(): number
    date(): number
    hour(): number
    minute(): number
    second(): number
    millisecond(): number
  }

  export type ConfigType = string | number | Date | Dayjs | null | undefined

  interface DayjsFn {
    (date?: ConfigType): Dayjs
    (date: ConfigType, format: string): Dayjs
    unix(timestamp: number): Dayjs
    isDayjs(d: unknown): boolean
  }

  const dayjs: DayjsFn
  export default dayjs
}
`.trim()

const ZOD_BLOCK = `
declare module 'zod' {
  /** zod 最小 stub —— 覆盖最常用的 schema 构建与 parse。 */
  export interface ZodType<Output = unknown> {
    parse(data: unknown): Output
    safeParse(data: unknown): { success: true; data: Output } | { success: false; error: ZodError }
    optional(): ZodType<Output | undefined>
    nullable(): ZodType<Output | null>
    array(): ZodType<Output[]>
    describe(description: string): this
  }

  export class ZodError extends Error {
    issues: Array<{ path: (string | number)[]; message: string; code: string }>
  }

  export const z: {
    string(): ZodType<string>
    number(): ZodType<number>
    boolean(): ZodType<boolean>
    date(): ZodType<Date>
    bigint(): ZodType<bigint>
    null(): ZodType<null>
    undefined(): ZodType<undefined>
    any(): ZodType<unknown>
    unknown(): ZodType<unknown>
    void(): ZodType<void>
    array<T>(schema: ZodType<T>): ZodType<T[]>
    object<T extends Record<string, ZodType>>(shape: T): ZodType<{ [K in keyof T]: T[K] extends ZodType<infer U> ? U : never }>
    literal<T extends string | number | boolean>(value: T): ZodType<T>
    enum<T extends readonly [string, ...string[]]>(values: T): ZodType<T[number]>
    union<T extends ZodType[]>(schemas: T): ZodType<T[number] extends ZodType<infer U> ? U : never>
  }

  export default z
}
`.trim()

const CHEERIO_BLOCK = `
declare module 'cheerio' {
  /** cheerio 最小 stub —— 覆盖 load 与最常用查询。 */
  export interface Cheerio<T> {
    text(): string
    text(value: string): this
    html(): string | null
    attr(name: string): string | undefined
    attr(name: string, value: string): this
    find(selector: string): Cheerio<T>
    each(fn: (i: number, el: T) => void): this
    map<R>(fn: (i: number, el: T) => R): Cheerio<R>
    eq(i: number): Cheerio<T>
    first(): Cheerio<T>
    last(): Cheerio<T>
    parent(selector?: string): Cheerio<T>
    children(selector?: string): Cheerio<T>
    length: number
    toArray(): T[]
  }

  export interface CheerioAPI {
    (selector: string): Cheerio<unknown>
    html(): string
  }

  export function load(html: string | Buffer): CheerioAPI
}
`.trim()

export interface MonacoExtraLib {
  /** 虚拟文件路径，Monaco 用它做模块解析 */
  path: string
  /** 完整 d.ts 字符串 */
  contents: string
}

/**
 * 关键设计：所有 ambient `declare module` 合并进**同一份** extraLib 文件。
 *
 * 原因：Monaco 0.55 的 extraLib 跨文件 ambient 互相 import 在 Classic
 * moduleResolution 下不稳定（曾在 auto-registry 内 import puppeteer-core 类型时失败）。
 * 同一份文件里，TS 服务能可靠解析跨 ambient 块的 type-only import，于是 SDK 的
 * page() / browser() 就能直接返回 puppeteer-core 的 Page / Browser，不用强转。
 *
 * 顺序：先 puppeteer-core（让 auto-registry 块的 `import type ... from 'puppeteer-core'`
 * 在解析时已可见），再 auto-registry，最后 axios/dayjs/zod/cheerio（互不依赖）。
 */
const MERGED_DTS = [
  PUPPETEER_BLOCK,
  AUTO_REGISTRY_BLOCK,
  AXIOS_BLOCK,
  DAYJS_BLOCK,
  ZOD_BLOCK,
  CHEERIO_BLOCK
].join('\n\n')

export const SCRIPT_EDITOR_TYPINGS: MonacoExtraLib[] = [
  { path: 'file:///auto-registry-runtime.d.ts', contents: MERGED_DTS }
]
