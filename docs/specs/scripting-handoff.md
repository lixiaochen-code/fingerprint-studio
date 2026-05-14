# Scripting Subsystem · Handoff

> 目的：换机继续对话时，新的 AI agent 读完本文件即可无缝接手，不用回溯聊天记录。
> 人类协作者也可以把这份当作脚本子系统的工作进度单。

## 0. 当前快照

- **分支**：`main`
- **远端最新提交**：`2ef49a5 docs: correct handoff snapshot + AGENT.md backlog after push`
- **未推送的本地提交**：（待 commit）Phase 3 Step 2 — Monaco 编辑器 + 类型注入 + 懒加载
- **Phase 3 Step 1 状态**：✅ 已 commit & push（`1f2f100`）。手工 UI 走查在 §10。
- **Phase 3 Step 2 状态**：✅ 已实现、✅ `pnpm run build` 绿；尚未手工 UI 验证（§10b）。

换机操作：

```bash
git clone / git pull
pnpm install
pnpm run build              # sanity check — 必绿
pnpm run dev                # 启动应用，按 §10 / §10b 走 UI
```

---

## 1. 项目是什么

`auto-registry` 是 Electron + React 桌面应用，管理多个隔离的电商浏览器环境（profile）。每个 profile 独立 user-data、代理、指纹；内核在 Chromium / CloakBrowser / itbrowser 三选一。

我们正在给它加 **脚本子系统**：用户用 JS/TS 写自动化脚本，绑定到某个 profile 运行，puppeteer-core 级的能力。

---

## 2. 必读文件（按顺序）

1. `AGENT.md` — 项目工作手册
2. `docs/CODING_STANDARDS.md` — 代码规范（唯一真源）
3. `docs/specs/scripting.md` — 脚本子系统的完整 spec（目标 / 架构 / 数据模型 / 5 阶段路线）
4. **本文件** — 进度与下一步

决策冲突按"规范文档 > 本文件 > 对话"优先级。

---

## 3. 架构一句话

```
React UI → preload (contextBridge) → Main process (ScriptStore + ScriptRuntimeManager)
  → fork() 每个 ScriptRun 一个独立 Node 子进程
  → bootstrap.ts 里 esbuild 转译用户 TS，劫持 `require('auto-registry')` 到 SDK
  → SDK 用 puppeteer-core 连接 profile 浏览器的 CDP endpoint
```

浏览器怎么被 attach？`buildLaunchArgs` 给所有 profile 启动追加：
```
--remote-debugging-port=0 --remote-debugging-address=127.0.0.1
```
Chromium 写出 `<user-data-dir>/DevToolsActivePort`（首行端口 + 次行 `/devtools/browser/<uuid>`），`ensureProfileRunningForScript` 等这个文件就绪后把 `ws://127.0.0.1:<port><ws-path>` 喂给 puppeteer-core。

---

## 4. 代码地图（电子版 spec 的补充）

```
electron/
├── main.ts                         app 入口 + 所有 IPC 注册
├── preload.ts                      window.registry.* 桥
├── paths.ts                        userData 路径唯一真源（scriptsRoot / scriptRunLogsRoot 等）
├── persistence.ts                  writeJsonAtomic / quarantineCorruptFile 共享基础设施
├── store.ts                        ProfileStore (profiles + plugins)
├── kernel.ts                       buildLaunchArgs（已接入 CDP 参数）
├── scripts/
│   ├── store.ts                    ScriptStore: Script + ScriptRun 持久化
│   ├── cdp.ts                      readDevToolsEndpoint + waitForDevToolsEndpoint 轮询
│   ├── runtime.ts                  ScriptRuntimeManager: fork / SIGTERM→SIGKILL / 日志流
│   ├── bootstrap.ts                子进程入口（被 runtime fork）
│   └── sdk/
│       ├── types.ts                ScriptApi + ScriptContext（Monaco 类型源）
│       ├── index.ts                createScriptApi(context) 工厂
│       ├── browser.ts              BrowserHandle 懒连接 + dispose
│       └── kv.ts                   state.json 原子 KV
└── types.ts                        Script / ScriptRun / ScriptDraft 等域类型

src/
├── App.tsx                         View = 'profiles' | 'settings' | 'scripts'
├── main.tsx                        React 入口
├── vite-env.d.ts                   window.registry.scripts.* 类型
├── lib/
│   ├── i18n.ts                     interpolate
│   ├── utils.ts                    cn()
│   ├── monacoSetup.ts              MonacoEnvironment.getWorker 钩子（Step 2）
│   └── scriptTypings.ts            auto-registry / puppeteer-core d.ts 字符串（Step 2）
└── components/
    ├── ScriptsView.tsx             Step 1 列表 + Step 2 接入懒加载编辑器
    ├── ScriptEditor.tsx            Monaco 编辑器，local 可写 / external 只读（Step 2）
    └── ... 现有 Profile*/SettingsView/KernelSetup
```

---

## 5. 已确认的技术决策（别再反复讨论）

| 决策 | 值 | 落位 |
| --- | --- | --- |
| 进程隔离 | 每个 ScriptRun = 一个 `child_process.fork` 子进程 | `runtime.ts` |
| TS 转译 | `esbuild.transformSync` 在 bootstrap 同步转译为 CJS | `bootstrap.ts` |
| SDK 风格 | ES Module：`import { page, log, sleep, kv, profile, stopSignal, browser } from 'auto-registry'` | `sdk/types.ts` |
| `require('auto-registry')` 怎么工作 | bootstrap 劫持 `Module._resolveFilename` 到虚拟路径 `\0auto-registry-virtual`，内容是 `createScriptApi(ctx)` 返回值 | `bootstrap.ts` |
| CDP 开关 | 所有 profile 启动都加 `--remote-debugging-port=0 --remote-debugging-address=127.0.0.1` | `kernel.ts` |
| 停止语义 | SIGTERM abort stopSignal → 用户代码 catch → bootstrap 判 `abortController.signal.aborted` → 清空 exitCode → runtime finalize 为 `stopped` | `bootstrap.ts` + `runtime.ts` |
| **停止脚本 ≠ 停止浏览器** | SDK.dispose 只 `browser.disconnect()`，不 close | `sdk/browser.ts` |
| Dev/Prod 分离 | `Script.source: 'local' \| 'external'`；external 只记 entryPath，`writeSource` 拒写，state 落 `<scriptsRoot>/external-states/<id>/` 隔离 | `scripts/store.ts` + `runtime.ts` |
| 日志双通道 | SDK 只走 IPC（`[info/warn/error]`），用户 `console.log` 只走 stdout（`[stdout]`），两者不打架 | `bootstrap.ts` postLog |
| 依赖策略 MVP | 固定内置：`puppeteer-core` `cheerio` `axios` `dayjs` `zod`。不搞白名单自装 | 已 install |
| UI 集成 | 主窗口加第三个 tab "Scripts"，与 Environments/Settings 并列 | `App.tsx` + `ScriptsView.tsx` |
| Monaco 类型源 | **不**走 `?raw` 加载 SDK 源（带外部 import 会报红）；改成 `src/lib/scriptTypings.ts` 里手写 d.ts 字符串 + puppeteer-core 宽松 stub | `scriptTypings.ts` |
| Monaco bundle 处理 | manualChunks 拆 'monaco' + Suspense 懒加载；worker 用 `?worker` 本地打 bundle | `vite.config.ts` + `monacoSetup.ts` |

---

## 6. 已修的关键 bug（回滚时别再踩）

| Bug | 症状 | 修复位置 |
| --- | --- | --- |
| 默认模板 `main()` 裸调 | bootstrap await default export 找不到函数就直接 dispose，浏览器连接被关，脚本没跑 | `DEFAULT_SCRIPT_SOURCE` 改成 `export default async function main() {}` |
| 每条 SDK log 出现两次（`[info]` + `[stdout]`） | postLog 同时 console.log 又 process.send | `bootstrap.ts` postLog 只走 IPC，保留兜底仅限 `process.send` 不可用时 |
| SIGTERM 触发的 `Script was stopped` 异常被当错误栈打印 | bootstrap 不区分主动停止 vs 真异常 | catch 块判 `abortController.signal.aborted`，是则 `type: 'stopped'` 并 `exitCode=0` |
| 父进程崩溃留下孤儿子进程（疯狂 tick） | bootstrap 没监听 IPC disconnect | `process.on('disconnect', () => process.exit(1))` |
| Stop 后 `active = [...]` 挂 3 秒才被 SIGKILL | puppeteer-core 的 http agent 等异步资源 hang 住事件循环 | bootstrap 最末 `process.exit(exitCode)` 显式退出 |
| `[status] stopped 1` 让 UI 以为失败 | 用户主动停止但 exitCode=1 透出 | `runtime.handleExit` 当 `userStopped` 时 `exitCode=null` 派发 |
| `ECONNREFUSED` 连到已死端口 | 旧 DevToolsActivePort 未清，waitForDevToolsEndpoint 立刻返回 stale 值 | `launchProfile` spawn 前 `fs.rmSync(DevToolsActivePort)` |
| `Translations` 类型在 zh 字面量与 en 不匹配 | `as const` 收窄了字面量 | `const labels: Record<Locale, Translations> = {...}` + 手写 Translations 类型 |
| Monaco `monaco.languages.typescript` 在 0.55 被标 deprecated | TS 报 `Property 'typescriptDefaults' does not exist on type '{ deprecated: true; }'` | 用新顶层 API：`monaco.typescript.typescriptDefaults` / `monaco.typescript.ScriptTarget` 等 |
| Monaco bundle 进主 chunk → 主 bundle 4MB | manualChunks 没拆 / 没用 lazy import | `vite.config.ts` `manualChunks(id)` 把 `monaco-editor` 与 `@monaco-editor/react` 单独成 'monaco' chunk + `ScriptsView` 内 `lazy(() => import('./ScriptEditor'))` |
| Vite build OOM（v8 abort trap）| Monaco 大 bundle 触发默认 heap 不足 | `cross-env NODE_OPTIONS=--max-old-space-size=8192 vite build` 写进 npm script |
| Monaco worker 走 CDN 在 Electron 离线场景失败 | 默认 `MonacoEnvironment.getWorker` 取远程 worker | `src/lib/monacoSetup.ts` 用 vite `?worker` import 把 ts/json/css/html/editor.worker 就地打 bundle |

---

## 7. 现在提供的脚本 SDK 表面

用户脚本里唯一合法 import：

```ts
import {
  profile,          // Readonly<BrowserProfile>
  browser,          // () => Promise<puppeteer.Browser>
  page,             // () => Promise<puppeteer.Page>  (复用第一个 tab 或新建)
  log, warn, error, // 结构化 IPC 日志
  sleep,            // (ms) => Promise<void>  被 stopSignal abort 会 reject
  kv,               // { get<T>(k), set(k,v), delete(k) }  持久到 state.json
  stopSignal        // AbortSignal  用户点停止时 abort
} from 'auto-registry'

// 内置第三方（不经 SDK，正常 import）
import puppeteer from 'puppeteer-core'
import * as cheerio from 'cheerio'
import axios from 'axios'
import dayjs from 'dayjs'
import { z } from 'zod'
```

Monaco 类型注入要在 Phase 3 Step 2 做。现在编辑器还没接入。

---

## 8. 手工验证过的用例（Phase 2 完整通过）

devtools 里用 `window.registry.scripts.*` 跑的：

- ✅ local 脚本 CRUD + 默认模板
- ✅ `run` → `[status] running` → `[info] ...` → `[status] succeeded 0`
- ✅ stopSignal abort：3s 后 stop，干净退出，无错误栈，`active = []`
- ✅ kv 持久化：state.json 写 `{"runs": 1}`，第二次 run `prev = 1`
- ✅ external 脚本注册 + 运行 + 热更新（改磁盘文件，下一次 run 立刻生效）
- ✅ external `writeSource` 被拒
- ✅ external state.json 落到 `external-states/<id>/` 不污染用户项目
- ✅ stale DevToolsActivePort 自愈（手动塞假 `99999` 端口，重启后仍能连）

Phase 3 Step 1 已 build 绿但只做了 UI 列表 + 新建/删除，**Step 2 编辑器 / Step 3 运行面板还没做**。

---

## 9. Phase 3 路线图

5 阶段 spec 见 `docs/specs/scripting.md`。Phase 3 自己内部拆 4 步：

| Step | 内容 | 状态 |
| --- | --- | --- |
| 1 | Tab + 侧栏列表 + 新建 local/external + 删除 | ✅ 已完成（`1f2f100` 已推送） |
| 2 | Monaco Editor 集成，local 可写 external 只读，类型 d.ts 注入 | ✅ 已完成（待 commit） |
| 3 | 运行面板：多选 profile、并发 run、实时日志流、stop/stopAll | ⏳ 下一步 |
| 4 | 细节润色：日志颜色、滚动贴底、快捷键、空态 | ⏳ |

Phase 4 Dev Server / Phase 5 模板市场 暂不在视野。

---

## 10. Phase 3 Step 1 UI 手工验证清单

代码已提交；到新机器上只剩走一遍实际交互确认没有回归。

```bash
cd /path/to/auto--registry
git pull                     # 确保最新
pnpm install                 # 新机首次
pnpm run build               # sanity check
pnpm run dev
```

按顺序走：

1. 右上角应该有新的 `<>` 按钮（FileCode2），点进去是 Scripts 视图
2. 侧栏顶部两个 `+` 按钮：一个加 FileCode 图标（新建本地），一个加 FolderOpen 图标（注册外部）
3. 试"新建本地"：名字 `ui-smoke`，创建后侧栏应立刻出现并自动选中
4. 试"注册外部"：Browse 应该弹系统 Open 对话框（过滤 .ts/.tsx/.js/...），选一个文件
5. 右侧详情显示脚本名 + 徽章 + entryPath + Reveal in Finder / Delete
6. 点 Reveal → 访达/资源管理器跳到对应位置（local 在 userData 下，external 在你的项目里）
7. 点 Delete → 弹确认。local 文案提到"脚本目录会被删除"；external 文案提到"只取消登记"
8. 切换 tab 回 Environments 再切回 Scripts，列表还在
9. 切换 EN/中文，文案切换正常

如果某步不对，贴给 agent，**先修再进 Step 2**。全部通过就直接进 §11 Step 2。

---

## 10b. Phase 3 Step 2 UI 手工验证清单

进入 Scripts tab，选中已有 local 脚本：

1. 右侧应该看到 Monaco 编辑器，深色主题（vs-dark）下用 JetBrains Mono 字体
2. 顶部状态栏：默认 idle 不显示徽章
3. 编辑器里输入 `import { ` —— 弹出补全应该能看到 `page` `log` `sleep` `browser` `profile` `kv` `stopSignal`
4. 改一个字符 —— 顶栏 `Unsaved changes` (amber) → 500ms 后 `Saving...` → `Saved` (primary)
5. `pnpm run dev` 重启应用 —— 改动应该还在（writeSource 真落盘了）
6. 切换不同脚本 —— 编辑器内容跟着变；切回去改动也保留
7. 选中 external 脚本 —— 顶栏 `External script — edit in your own editor and reload here.` + Reload 按钮，编辑器只读
8. 在 VSCode 里改 external 文件保存 —— 应用里点 Reload，内容刷新
9. 关掉 Scripts tab，刷一下 DevTools Network —— 切回 Scripts 时第一次进入应该看到 `monaco-*.js` chunk 才被请求（懒加载证据）

## 11. Phase 3 Step 3 预告

下一步运行面板：

- `ScriptsView` 详情面板下方加可拖动分隔条（默认 60% 编辑器 / 40% 运行面板）
- 运行面板顶栏：profile 多选下拉（带在线/离线标记）+ Run 按钮 + Stop All 按钮
- 运行面板主体：多列 / Tab 切换显示每个 ScriptRun 的实时日志
- 订阅 `window.registry.scripts.onEvent`，按 `runId` 路由 log/status 到对应列
- 单个 run 状态徽章 (running / succeeded / failed / stopped)
- 单击 run header 折叠 / 展开日志
- 关闭 / 切走 Scripts tab 时清理 `onEvent` 订阅

---

## 12. 环境 & 依赖状态

- Node：~~20.x~~（Electron 39 内置的 Node）；本地 build 用 `cross-env NODE_OPTIONS=--max-old-space-size=8192`，Monaco 大 bundle 默认堆装不下
- pnpm：9.15+ / 11+ 都行，lockfile 兼容
- 已装新增依赖（见 `package.json`）：
  - 运行：`esbuild` `puppeteer-core` `cheerio` `axios` `dayjs` `zod` `@monaco-editor/react` `monaco-editor`
  - 开发：`cross-env`
- Phase 3 Step 3 不增依赖（用现有 IPC 即可）

若新机 `pnpm install` 后 build 红，最常见原因是 node-7z 的原生依赖平台差异；`rm -rf node_modules pnpm-lock.yaml && pnpm install` 一刀切。

---

## 13. 对 AI agent 的接手指令

你读到这里时的首要任务：

1. **不要**回顾聊天历史，以本文件 + `docs/specs/scripting.md` + 规范文档为准
2. **不要**主动重构现有代码，除非用户明确要求
3. **默认行为**：等用户说"继续 Phase 3 Step 2" / "换方向做 X"之前，别自己发起改动
4. **用户一来就说"继续"的话**，按 §10 完成 Step 1 commit，然后按 §11 启动 Step 2
5. 开工前确认 `pnpm run build` 本机能跑通，**这是接手线的第一个 sanity check**
6. 任何改动后 `pnpm run build` 必绿（规范第 11 节）
7. 遇到 §6 那些 bug 类似的症状时，直接翻表对应处理，不要再调试一遍

---

**本文件的维护**：每完成一个 Phase/Step 就更新第 0、6、8、9 节，保持它始终反映当前现实。
