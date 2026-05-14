/**
 * Monaco 编辑器里给用户脚本提供智能补全用的 d.ts 字符串。
 *
 * 设计原则：
 * 1. 不直接 ?raw 加载 electron/scripts/sdk/types.ts —— 那份带 puppeteer-core/相对路径
 *    import，Monaco 解析失败会满屏红线。
 * 2. 这份是给编辑体验看的"窗口"，与运行时 SDK 实际类型保持语义一致即可，无需逐字对齐。
 * 3. puppeteer-core 完整类型（~MB 级）暂不注入；用宽松 stub 换体积，用户写 `await page.goto()`
 *    依然能写出来，缺点是没有 puppeteer 自带的方法补全。Step 4 之后再考虑接入官方 d.ts。
 *
 * 如果 SDK 的导出表面（电子版 spec § 7）变了，记得同步更新 AUTO_REGISTRY_DTS。
 */

const PUPPETEER_DTS = `
declare module 'puppeteer-core' {
  // 极简 stub —— 只为让 import 不爆红。详细 API 参见 puppeteer-core 官方文档。
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export type Browser = any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export type Page = any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export type ElementHandle = any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const puppeteer: any
  export default puppeteer
}
`.trim()

const AUTO_REGISTRY_DTS = `
declare module 'auto-registry' {
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

export interface MonacoExtraLib {
  /** 虚拟文件路径，Monaco 用它做模块解析 */
  path: string
  /** 完整 d.ts 字符串 */
  contents: string
}

/**
 * 给 Monaco 注入的所有 extraLib。顺序无关。
 * 调用方：`monaco.languages.typescript.typescriptDefaults.addExtraLib(contents, path)`。
 */
export const SCRIPT_EDITOR_TYPINGS: MonacoExtraLib[] = [
  {
    path: 'file:///node_modules/puppeteer-core/index.d.ts',
    contents: PUPPETEER_DTS
  },
  {
    path: 'file:///node_modules/auto-registry/index.d.ts',
    contents: AUTO_REGISTRY_DTS
  }
]
