import puppeteer, { type Browser, type Page } from 'puppeteer-core'

/**
 * 把脚本对浏览器的访问收拢到一个类里：
 * - 懒连接（第一次调用 browser()/page() 才真正 puppeteer.connect）
 * - 连接在脚本生命周期内保持；脚本结束由 bootstrap 统一 disconnect
 * - 断连后的 API 行为：让 puppeteer 自己抛错，不在这里吞
 *
 * 注意：我们不 close 浏览器，只 disconnect —— 符合 spec 里"停止脚本 ≠ 停止浏览器"
 * 的语义，用户可以继续观察浏览器当前状态。
 */
export class BrowserHandle {
  private connectPromise: Promise<Browser> | undefined

  constructor(private readonly webSocketDebuggerUrl: string) {}

  browser(): Promise<Browser> {
    if (!this.connectPromise) {
      this.connectPromise = puppeteer.connect({
        browserWSEndpoint: this.webSocketDebuggerUrl,
        defaultViewport: null // 尊重用户在 profile 里配的窗口尺寸
      })
    }
    return this.connectPromise
  }

  async page(): Promise<Page> {
    const browser = await this.browser()
    const pages = await browser.pages()
    return pages[0] ?? browser.newPage()
  }

  async dispose(): Promise<void> {
    if (!this.connectPromise) return
    try {
      const browser = await this.connectPromise
      browser.disconnect()
    } catch {
      // 已断开或进程退出，忽略
    }
  }
}
