/**
 * Monaco 在 web 上的标准用法是通过 CDN 加载 worker，但 Electron 渲染层在
 * `contextIsolation: true` + 离线环境下访问外网 CDN 会失败 / 被 CSP 拦。
 *
 * 这里通过 vite 的 `?worker` 后缀把 Monaco 自带的 worker 模块就地打成 bundle，
 * 然后通过全局 `MonacoEnvironment.getWorker` 钩子把"按 label 取 worker"指向本地。
 *
 * 调用时机：模块顶层 import 一次即可（`@monaco-editor/react` 在 mount 时读这个全局）。
 */

// 这些 worker 路径来自 Monaco 官方 ESM 入口；改 monaco-editor 大版本时检查
// node_modules/monaco-editor/esm/vs/... 是否仍存在对应文件
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import TsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'
import JsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import CssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker'
import HtmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker'

declare global {
  interface Window {
    MonacoEnvironment?: {
      getWorker?: (workerId: string, label: string) => Worker
    }
  }
}

self.MonacoEnvironment = {
  getWorker(_workerId, label) {
    if (label === 'typescript' || label === 'javascript') return new TsWorker()
    if (label === 'json') return new JsonWorker()
    if (label === 'css' || label === 'scss' || label === 'less') return new CssWorker()
    if (label === 'html' || label === 'handlebars' || label === 'razor') return new HtmlWorker()
    return new EditorWorker()
  }
}
