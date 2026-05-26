# Scripting Subsystem · Handoff

> 目的：换机继续对话时，新的 AI agent 读完本文件即可无缝接手，不用回溯聊天记录。
> 人类协作者也可以把这份当作脚本子系统的工作进度单。

## 0. 当前快照

- **分支**：`main`
- **远端最新提交**：反检测双轨集成(A + B)Phase 1 + Phase 2 代码已落地;Phase 3(Settings UI + C 路线 UI)待办。Phase 3 之前的脚本子系统改动:Phase 3 Step 4 + 占用规则三步走 + 代理连通性测试。
- **完成进度**：脚本子系统 Phase 3 全部 4 步代码已落地;脚本占用规则三步走代码已落地;反检测双轨 A+B 已落地。
- **未做的事**:
  - 手工 UI 验证脚本子系统 Step 3、Step 4 + 占用规则(详见 §10c / §11 / §11b)
  - 手工验证反检测 A 路线效果(creepjs / ChatGPT 实测,详见 [`anti-detection.md`](anti-detection.md) §3)
  - 反检测 Phase 3(Settings UI + 持久化 + C 路线 UI 切换)

## 0a. 反检测体系(新)

详细 spec:[`anti-detection.md`](anti-detection.md)。一句话:

- **A 路线 Stealth Inject**(默认启用):重写 fingerprint inject,加 native-toString proxy + webdriver/chrome/iframe/permissions 等 patch。解决 ChatGPT 验证循环。模块在 `electron/stealth/`
- **B 路线 Rebrowser puppeteer**(默认启用):`puppeteer-core` → `rebrowser-puppeteer-core` in-place 替换。bootstrap 劫持 `require('puppeteer-core')`。用户脚本零改动
- **C 路线 Cloak/itbrowser**(可选):已部分集成,Phase 3 加 UI 让用户按系统切换

## 0a. 占用规则（最新一轮）

闭环原则（用户拍板）：

1. **一个 profile 同一时刻最多 1 个活跃 ScriptRun**。GUI 启动的浏览器**不算占用**——脚本可以接管 GUI 启动的浏览器，但脚本运行期间该 profile 不能被另一个脚本"再占一次"。
2. UI 表达：
   - **Header** 加一个 Activity 图标按钮（`ActiveRunsButton`），右上角徽章显示活跃 run 总数；点开浮层列出所有跨脚本运行中的 run，每条带"打开脚本"和"停止"按钮。
   - **Environments 列表** Status 列：被脚本占用时显示一个**点击可跳转**的 amber `SCRIPTING` 徽章（替代 ONLINE/OFFLINE）。
   - **Scripts 面板 ProfileSelector**：被另一脚本占用的 chip 灰显 + amber 边框 + Tooltip 提示占用脚本名；勾选/Run 都不可点。
3. 状态来源：主进程 `ScriptRuntimeManager` 是唯一真源，每次活跃集变化广播 `'active-changed'` 事件携带最新 `ScriptRun[]`。`App` 顶层订阅一次，向下分发。

实现摘要：

- `electron/scripts/runtime.ts`
  - 加 `ProfileBusyError`（`code='PROFILE_BUSY'`，带 `occupiedBy: { runId, scriptId }`）
  - `start()` 入口先 `getActiveByProfile()` 检查互斥
  - 新增 `listActive()` / `getActiveByProfile(profileId)`
  - 启动 + `handleExit()` 时 `emitActiveChanged()` 广播
- `electron/scripts/janitor.ts`（新文件）
  - 启动自检：通过 `ps -E` 匹配 `AUTO_REGISTRY_SCRIPT_CONTEXT` env 杀掉孤儿脚本子进程
  - 清掉所有 profile 目录里的 `Singleton*` 文件（`SingletonLock`/`SingletonCookie`/`SingletonSocket`），避免上次会话残留卡住下次启动
- `electron/main.ts`
  - `whenReady` 里第一件事 `await runStartupJanitor()`
  - 新增 IPC `scripts:activeRuns` 和 `scripts:activeByProfile`
  - `scripts:run` 处理器：catch 到 `ProfileBusyError` 时回 `{ ok:false, error: { code:'PROFILE_BUSY', message, occupiedBy } }`
- `electron/preload.ts` + `src/vite-env.d.ts`：扩 `scripts.run` 错误类型；新增 `scripts.activeRuns()` / `scripts.activeByProfile()`
- `src/components/active-runs-button/index.tsx`（新）：Header 抽屉 + 1s 心跳实时秒数 + Stop / Open script
- `src/App.tsx`：`activeRuns` state + 启动拉一次 + 订阅 `'active-changed'`；Header 注入 `ActiveRunsButton`；`ProfilesPanel` 注入 `scriptingByProfileId` 和 SCRIPTING 徽章
- `src/views/scripts/index.tsx`：`activeRuns` 透传
- `src/views/scripts/components/script-run-panel/index.tsx`：
  - liveRuns 跨脚本切换保留（按 `scriptId` 过滤显示）
  - PROFILE_BUSY 失败时本地化文案带占用脚本名
  - `ProfileSelector` chip 灰显 + tooltip 显示占用脚本名
  - 内嵌的 RunRow 用 `<div role="button">` 替代 `<button>`，避免 React 警告"`<button>` 不能嵌套 `<button>`"

换机操作：

```bash
git clone / git pull
pnpm install
pnpm run build              # sanity check — 必绿（首次 build Monaco 大 chunk 需要 30-40s）
pnpm run dev                # 启动应用，按 §10c §10d 走 UI
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

## 4. 代码地图

```
electron/
├── main.ts                         app 入口 + 所有 IPC 注册；isFirstLaunch + launchProfile{openStartUrl}
├── preload.ts                      window.registry.* 桥
├── paths.ts                        userData 路径唯一真源（scriptsRoot / scriptRunLogsRoot 等）
├── persistence.ts                  writeJsonAtomic / quarantineCorruptFile 共享基础设施
├── store.ts                        ProfileStore (profiles + plugins)；load() 自动迁移旧 platform 字段
├── kernel.ts                       buildLaunchArgs(initialUrl)，机械追加，不再读 profile.startUrl
├── scripts/
│   ├── store.ts                    ScriptStore: Script + ScriptRun 持久化
│   ├── cdp.ts                      readDevToolsEndpoint + waitForDevToolsEndpoint 轮询
│   ├── runtime.ts                  ScriptRuntimeManager: fork / SIGTERM→SIGKILL / 日志流
│   ├── bootstrap.ts                子进程入口（被 runtime fork）
│   └── sdk/
│       ├── types.ts                ScriptApi + ScriptContext
│       ├── index.ts                createScriptApi(context) 工厂
│       ├── browser.ts              BrowserHandle 懒连接 + dispose
│       └── kv.ts                   state.json 原子 KV
└── types.ts                        Script / ScriptRun / ScriptDraft / BrowserProfile（无 platform、startUrl 可选）

src/
├── App.tsx                         路由编排 + 业务函数;view 派生自 react-router pathname
├── main.tsx                        React 入口,顶层包 HashRouter
├── vite-env.d.ts                   window.registry.scripts.* 类型
├── hooks/
│   ├── useAppData.ts               profiles/plugins/proxies/scripts/activeRuns 加载 + 订阅
│   ├── useTheme.ts                 主题偏好 + system 监听
│   └── useLocale.ts                语言偏好 + document.lang 同步
├── lib/
│   ├── i18n.ts                     interpolate
│   ├── utils.ts                    cn()
│   ├── monaco-setup.ts             MonacoEnvironment.getWorker 钩子
│   └── script-typings.ts           合并版 ambient d.ts(auto-registry + puppeteer-core 真包 + axios/dayjs/zod/cheerio stub)
├── components/
│   ├── ui/                         shadcn 原子组件(button / dialog / split-pane / ...)
│   ├── app-header/index.tsx        Header(品牌标 + 导航 tab + 主题 / 语言切换)
│   ├── active-runs-button/index.tsx 全局活跃 run 抽屉
│   ├── keep-alive/index.tsx        路由 KeepAlive(display:none 切换)
│   ├── profile-form-dialog/        新建/编辑环境(只递 proxyId,无 inline 字段)
│   ├── profile-details-dialog/index.tsx
│   ├── confirm-delete-dialog/index.tsx
│   ├── kernel-setup/index.tsx
│   ├── proxy-form-dialog/index.tsx
│   ├── proxy-batch-import-dialog/index.tsx
│   └── proxy-select-field/index.tsx
└── views/
    ├── profiles/                   环境列表(toolbar / selection-bar / table 三块)
    ├── scripts/                    脚本子系统(列表 + 详情 + 编辑器 + 运行面板)
    ├── proxies/                    代理管理
    └── settings/                   设置 / 内核
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
| **CDP 反检测** | `puppeteer-core` 实际被 [bootstrap 劫持](../../electron/scripts/bootstrap.ts) 到 `rebrowser-puppeteer-core` — 用户脚本零感,SDK 内部直接 import rebrowser。规避 `Runtime.enable` 探测 | `bootstrap.ts` + `sdk/browser.ts` + [`anti-detection.md`](anti-detection.md) §4 |
| UI 集成 | 主窗口加第三个 tab "Scripts"，与 Environments/Settings 并列 | `App.tsx` + `views/scripts/index.tsx` |
| **Monaco 单实例** | `loader.config({ monaco })` 让 `@monaco-editor/react` 用我们 import 的本地 monaco 而不是 CDN，否则 setCompilerOptions 配的是另一份实例 | `views/scripts/components/script-editor/index.tsx` |
| Monaco 类型源 | **合并版** ambient d.ts：把 auto-registry / puppeteer-core 真包 / axios / dayjs / zod / cheerio 全塞进**一份** extraLib 文件。跨文件 ambient import 不可靠 | `lib/script-typings.ts` |
| Monaco import 候选补全 | 自定义 completionItemProvider 在 `from '` / `import('` / `require('` 后弹 6 个内置包名 | `views/scripts/components/script-editor/index.tsx` |
| Monaco bundle 处理 | `vite.config.ts` manualChunks 拆 'monaco' chunk + Suspense 懒加载；worker 用 `?worker` 本地打 bundle；`fixedOverflowWidgets:true` 让 hover 不被父 overflow 裁切 | `vite.config.ts` + `lib/monaco-setup.ts` + `views/scripts/components/script-editor/index.tsx` |
| **业务"平台"字段已删** | `BrowserProfile` 不再有 `platform: string`。原来的 amazon/shopify 等业务标签整个砍掉。`fingerprint.platform`（navigator.platform 值）保留 | 模型层 + UI |
| **startUrl 仅首次启动** | profile 第一次启动时如果配了 startUrl 才打开；之后浏览器恢复上次会话。"首次"判定 = `<profilePath>/Default` 是否存在 | `main.ts isFirstLaunch` |
| 脚本路径强制不开 startUrl | `ensureProfileRunningForScript` 传 `openStartUrl: false`，避免 startUrl 异步加载抢脚本 page.goto 的 tab | `main.ts` |

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
| Monaco bundle 进主 chunk → 主 bundle 4MB | manualChunks 没拆 / 没用 lazy import | `vite.config.ts` `manualChunks(id)` 拆 'monaco' chunk + `ScriptsView` 内 `lazy(() => import('./ScriptEditor'))` |
| Vite build OOM（v8 abort trap）| Monaco 大 bundle 触发默认 heap 不足 | `cross-env NODE_OPTIONS=--max-old-space-size=8192 vite build` 写进 npm script |
| Monaco worker 走 CDN 在 Electron 离线场景失败 | 默认 `MonacoEnvironment.getWorker` 取远程 worker | `monacoSetup.ts` 用 vite `?worker` import 把 ts/json/css/html/editor.worker 就地打 bundle |
| `Cannot find module 'auto-registry'` 一直在 | `@monaco-editor/react` 默认 CDN 实例 ≠ 本地 import 的实例，setCompilerOptions 设错了对象 | `loader.config({ monaco })` 让 wrapper 用本地实例 |
| Monaco hover/补全 widget 内容看不到 | 父容器 `overflow:hidden` 把 widget 裁切了 | `fixedOverflowWidgets: true` 让 widget 渲染到 fixed 层 |
| `from '` 后没有候选包名 | Monaco TS 服务不从 ambient declare module 推断 import 候选 | 自定义 `registerCompletionItemProvider`，匹配 from/import/require 字符串字面量 |
| 跨 extraLib 文件的 ambient `import type ... from 'puppeteer-core'` 解析失败 | Monaco 0.55 多 extraLib ambient 互相 import 不稳定 | 把所有 declare module 合并到**一份** extraLib，内部跨 ambient 块 type-only import 是稳的 |
| 脚本 run 后页面突然跳到 startUrl | 启动浏览器永远附加 startUrl，Chromium 异步加载抢 page.goto 的 tab | startUrl 改"仅首次"；脚本路径强制 `openStartUrl: false` |

---

## 7. 现在提供的脚本 SDK 表面

用户脚本里唯一合法 import：

```ts
import {
  profile,          // Readonly<Profile>（无 platform 字段，startUrl 可选）
  browser,          // () => Promise<puppeteer.Browser>
  page,             // () => Promise<puppeteer.Page>  (复用第一个 tab 或新建)
  log, warn, error, // 结构化 IPC 日志
  sleep,            // (ms) => Promise<void>  被 stopSignal abort 会 reject
  kv,               // { get<T>(k), set(k,v), delete(k) }  持久到 state.json
  stopSignal        // AbortSignal  用户点停止时 abort
} from 'auto-registry'

// 内置第三方（不经 SDK，正常 import）
import puppeteer, { Browser, Page } from 'puppeteer-core'
import * as cheerio from 'cheerio'
import axios from 'axios'
import dayjs from 'dayjs'
import { z } from 'zod'
```

`page()` / `browser()` 直接返回 `Page` / `Browser`，**不需要任何强转**——类型来自打包进 d.ts 的 puppeteer-core 真包定义。

---

## 8. 手工验证过的用例

### Phase 2（全套 ✅，devtools console 验过）
- local 脚本 CRUD + 默认模板、`run` → succeeded、stopSignal abort 干净退出、kv 持久化、external 注册/运行/热更新 + writeSource 拒、external state 隔离、stale DevToolsActivePort 自愈

### Phase 3 Step 1（✅ 应用内 UI 走过 §10 清单）

### Phase 3 Step 2（✅ 应用内 UI 验证：Monaco 显示、auto-registry / puppeteer-core 类型补全 / hover、import 候选）

### Phase 3 Step 3（⚠️ 代码已落、未手测）
**接手第一件事**：跑 §10c 那份清单。

### startUrl + 平台重构（⚠️ 代码已落、未手测）
- 数据迁移：旧 `profiles.json` 里 `platform: 'other'` 应该在应用首次启动后被剥掉
- 首次启动：新建带 startUrl 的 profile → 第一次 GUI Run 弹 startUrl
- 二次启动：关浏览器再 GUI Run → **不**弹 startUrl，恢复上次会话
- 脚本启动：完全关浏览器 → 脚本面板 Run → **不**弹 startUrl
- 脚本里 `page.goto(...)` 不再被抢

---

## 9. Phase 3 路线图

5 阶段 spec 见 `docs/specs/scripting.md`。Phase 3 自己内部拆 4 步：

| Step | 内容 | 状态 |
| --- | --- | --- |
| 1 | Tab + 侧栏列表 + 新建 local/external + 删除 | ✅ 已 push（`1f2f100`） |
| 2 | Monaco Editor + 类型补全 + hover + 包名补全 | ✅ 已 push（`af18c56` 修复合并） |
| 3 | 运行面板：多选 profile、并发 run、实时日志流、stop/stopAll | ✅ 代码已 push（`b2b46d6`），**未手测** |
| 平台/startUrl 重构 | 删 `BrowserProfile.platform`，startUrl 改"仅首次启动" | ✅ 代码已 push（`b2b46d6`），**未手测** |
| 4 | 可拖动分隔条、运行中时长每秒刷新、Cmd+S/Cmd+Enter 快捷键、空态去新建环境引导 | ✅ 代码已落，**未手测** |
| 占用规则三步走 | profile 互斥 + Header 抽屉 + Environments 徽章 + Scripts chip 灰显 + 启动自检 | ✅ 代码已落（待 commit），**未手测** |

Phase 4 Dev Server / Phase 5 模板市场 暂不在视野。

---

## 10. Phase 3 Step 1 UI 验证清单（已通过）

保留供回归参考；新机器跳过这一节。

1. 右上角 `<>` 按钮（FileCode2）进 Scripts 视图
2. 侧栏顶部两个 `+` 按钮（新建本地 / 注册外部）
3. 新建本地 → 侧栏立即出现并自动选中
4. 注册外部 → Browse 弹系统对话框，过滤 .ts/.tsx/.js/...
5. 详情显示名 + 徽章 + entryPath + Reveal in Finder / Delete
6. Reveal → 访达跳到对应位置
7. Delete → 弹确认（local 和 external 文案不同）
8. 切 tab 来回，列表保留
9. 切 EN/中文，文案切换

---

## 10b. Phase 3 Step 2 UI 验证清单（已通过）

保留供回归参考。

1. Monaco 深色主题 vs-dark + JetBrains Mono
2. `import { page, log } from 'auto-registry'` 无红线
3. hover `page` 显示 `function page(): Promise<Page>` + docstring
4. 输入 `import { ` 弹补全：`browser` `kv` `log` 等
5. 修改 → `Unsaved changes` (amber) → 500ms → `Saving` → `Saved` (primary)
6. 重启应用改动持久
7. 切脚本编辑器跟着切
8. external 脚本只读 + Reload 按钮
9. `from '` 后弹 6 个内置包名候选

---

## 10c. **接手第一件事：Step 3 + 重构验证清单**（未跑）

跑 `pnpm run dev`，进 Scripts tab。

### 运行面板基础

1. 选有源码的脚本（之前的 `smoke`），右下半屏看到运行面板顶栏（"Run" 标题 + 计数）
2. 顶栏列出所有 profile，每个旁边带在线状态点
3. 勾一个 profile → 点 Run → 出现一行 RUNNING（amber）行，日志流 `[info] ...`，结束变 SUCCEEDED（primary）
4. 多选 2-3 个 profile 同时勾 → Run → 三个 run 并发，日志独立不混
5. loop 脚本 → 点单个 Stop → STOPPED（灰）；不报错栈
6. 多个 loop → Stop all → 全部停（仅本面板内的）
7. Clear finished → 已结束的清掉，活跃的不动
8. 折叠/展开：点 run header
9. 切到另一脚本 → 当前面板 run 列表清空（按设计）
10. 切回原脚本 → 列表也是空的（运行历史已落 ScriptStore，但面板只展示当前 session）
11. 长日志自动跟到底；用户手动往上滚后保持，新日志不强拉

### 平台/启动网址重构

12. **列表没有 Platform 列**（只剩 Environment / Proxy / Fingerprint / Created / Status / Actions）
13. **新建对话框没有 Platform 字段**；Start URL 标"可选"，下面有提示行"仅首次启动时打开"
14. **可以保存空 startUrl 的环境**
15. **首次启动**：新建一个带 startUrl 的环境，第一次 GUI Run → 浏览器开 startUrl
16. **二次启动**：关掉浏览器 + GUI Run → **不**弹 startUrl，浏览器恢复上次会话
17. **脚本启动不开 startUrl**：完全关浏览器 + Scripts 面板 Run → 浏览器启动**不**先开 startUrl，脚本里 `page.goto(...)` 不被抢
18. **历史数据迁移**：检查 `~/Library/Application Support/auto-registry/registry-data/profiles.json`，应该已经没有 `platform` 字段（应用首次启动会自动剥掉）
19. **详情对话框**没有 Platform 行；空 startUrl 显示 `—`
20. **搜索框** placeholder 是 "BY NAME / PROXY..."（不再有 PLATFORM）
21. **切 EN/中文** 文案都同步

如果某项不对，**先修再进 Step 4**。

---

## 11. **Phase 3 Step 4 验证清单**（未跑）

`pnpm run dev` 进 Scripts tab，选个有源码的脚本（前面建过的 `smoke`/`loop`）。

### 可拖动分隔条
1. 编辑器和运行面板之间有一道细灰色分隔条，hover 变色
2. 鼠标拖动分隔条 → 上下比例改变，光标变 `row-resize`
3. 松开后比例保持
4. 关掉应用 + `pnpm run dev` 重启 → 比例还在（localStorage 持久化）
5. 拖太极端时停在 25% / 85%（minRatio / maxRatio）

### 快捷键
6. 编辑器里改一个字符 → 立刻 `Cmd+S`（Mac） / `Ctrl+S`（Win/Linux）→ 状态徽章直接 `Saved`，不等 500ms
7. 选一个 profile → 按 `Cmd+Enter` / `Ctrl+Enter`（光标在编辑器或面板都行）→ 触发 Run
8. 在普通文本输入框（比如新建对话框的 Name 输入）按 `Cmd+Enter` 不应触发 Run（避免抢键）
9. Run 按钮 hover 显示 tooltip "Cmd/Ctrl + Enter"

### 运行中时长实时刷新
10. 跑 loop 脚本 → RUNNING 行右侧的"X 秒"应该每秒 +1（不再是 0s 卡住）
11. Stop 后秒数停止增长，停在结束时刻

### 空态引导
12. 删光所有环境（先把 profile 全删）→ Scripts tab 选脚本 → 运行面板 ProfileSelector 区域显示 "还没有环境。" + 蓝色链接 "去环境列表新建一个。"
13. 点链接 → 自动切到 Environments tab

### 回归
14. §10c 那 21 项整套，在新版本下应该完全不退化

---

## 11b. **占用规则验证清单**（未跑）

`pnpm run dev`，准备至少 2 个 profile 和 2 个脚本（一个 loop / 一个 smoke）。

### Header 全局 Activity 按钮 + 抽屉
1. 应用启动时 Header 右侧 Activity 图标按钮**无徽章**（活跃 run = 0）
2. 在脚本面板跑一个 loop → 几秒内 Header 按钮右上角出现红色 `1` 数字徽章
3. 点 Activity 按钮 → 弹出右上抽屉，标题 `Active runs · 1`，列出一行：
   - 左：amber `RUNNING` 徽章 + 脚本名 + `<profile name> · X 秒`
   - 右：`Open script`（外链图标）+ `Stop`（红色）
4. 抽屉里"已运行 X 秒"应该每秒 +1
5. 同时再跑一个第二个 profile 的 smoke → 抽屉数字变 `2`
6. 点其中一行的 `Open script` → 抽屉关闭，自动切到 Scripts 视图并选中那个脚本
7. 点 `Stop` → 那一行 1-2 秒内消失，徽章数字 -1
8. 全部停掉后 → 徽章消失；抽屉打开显示"当前没有脚本在跑。"
9. 抽屉外点击 / 按 Esc → 抽屉关闭

### Environments 列表 SCRIPTING 徽章
10. 在 Scripts 面板跑一个 profile 的脚本 → 切回 Environments tab，对应行 Status 列从 `ONLINE`/`OFFLINE` 变成 amber `SCRIPTING` 徽章（带跳动小点）
11. 点 SCRIPTING 徽章 → 自动切到 Scripts 视图并选中跑这个 profile 的脚本
12. 停掉脚本 → Status 列回到 `ONLINE`（如浏览器还在跑）/ `OFFLINE`（如浏览器已退）

### Scripts 面板 ProfileSelector chip 占用提示
13. 脚本 A 在 profile X 上跑 → 切到脚本 B 的面板，profile X 的 chip 灰显（amber 边框 + 半透明），不可勾选
14. hover 灰显 chip → Tooltip 显示"该环境正在运行脚本「A」..."
15. 同一脚本 A 的面板下，profile X 的 chip 不灰但带跳动小 amber 点（"自己在跑"）
16. 试图绕过 UI 直接对已占用 profile 调 `scripts.run` → 主进程返回 `PROFILE_BUSY`，渲染端弹出 amber 错误行展示占用脚本名

### 启动自检（janitor）
17. 跑一个 loop → kill 主进程（`pkill -9 Electron`，模拟崩溃）→ 用 `ps aux | grep AUTO_REGISTRY_SCRIPT_CONTEXT` 确认有孤儿子进程留着
18. `pnpm run dev` 重启 → 启动日志（main 进程 console）应该有 `[janitor] killed orphan scripts ...` 之类输出
19. 重启后 `ps aux | grep AUTO_REGISTRY_SCRIPT_CONTEXT` 应该没有遗留
20. 同样场景：上一轮 SIGKILL 后某个 profile 的 user-data 目录里残留 `Singleton*` 文件 → 重启后这些文件应该被清掉，下次 GUI Run 不再卡住

### 兜底拉取
21. App 启动后立刻看 Header → 即便错过了第一轮 `'active-changed'` 事件，初始拉取 `scripts:activeRuns` 也应该让徽章显示正确（启动时无活跃 run 应显示 0；如果是 dev hot-reload 时已有 run 在跑应显示对应数字）

如果哪一项不对，**先修再下一步**。

---

## 12. Phase 3 收尾后的下一步

`§11` + `§11b` 全绿后 Phase 3 Done。后续候选（按优先级，等用户拍板）：

- **反检测 Phase 3**:Settings UI + SettingsStore 持久化 + C 路线(Cloak/itbrowser)显式 UI 切换。详见 [`anti-detection.md`](anti-detection.md) §6
- **Phase 4 Dev Server**：本地 HTTP/WebSocket 让外部 VSCode 项目通过 `auto-registry-sdk-client` 包反向调用应用 SDK
- **Phase 5 模板市场**：预设 3-5 个常用脚本（Amazon 登录、采集、批量操作）
- ✅ ~~代理连通性测试按钮~~ —— 已实装（见 §11c）
- ✅ ~~反检测 A+B 路线集成~~ —— 已实装(见 [`anti-detection.md`](anti-detection.md))
- **集中日志到 `<userData>/logs/`**（pending 已久）

---

## 11c. 代理连通性测试（已实装）

新建/编辑环境对话框右下加了"测试连通性"按钮。

实现：
- `electron/proxyTest.ts`：用裸 `net.Socket` 走 HTTP CONNECT 到 `www.gstatic.com:443`，5s 超时；不依赖 puppeteer / 不开浏览器；返回 `{ ok, latencyMs?, code, message? }`
- `proxy:test` IPC + `window.registry.proxy.test()` preload 桥
- `ProfileFormDialog`：状态局部 `proxyTest`；用户改任何代理字段都会重置回 null（避免旧结果误导）；按钮带 spinner；成功显示 primary 绿色"可达 · X 毫秒"；失败按 code 分文案（TIMEOUT/REFUSED/AUTH/BAD_HOST/BAD_RESPONSE/UNKNOWN）

**验证清单**（5 项）：

1. 新建环境，host=`127.0.0.1` port=`7890`（你本机的代理） → 点测试 → 显示绿色"可达 · X 毫秒"
2. 改成不存在的端口（比如 6666）→ 重新点 → 显示红色 `TIMEOUT` 或 `REFUSED`
3. 改成不存在的 host（`no-such-host.invalid`）→ 显示红色 `BAD_HOST`
4. 故意填错代理账号密码（如果代理需要认证）→ 显示红色 `AUTH`
5. 任意修改 host/port/account/password → 旧的绿/红徽章应**立即消失**（不能挂在 UI 上误导）

---

## 13. 环境 & 依赖状态

- Node：~~20.x~~（Electron 39 内置的 Node）；本地 build 用 `cross-env NODE_OPTIONS=--max-old-space-size=8192`，Monaco 大 bundle 默认堆装不下
- pnpm：9.15+ / 11+ 都行，lockfile 兼容
- 已装新增依赖（见 `package.json`）：
  - 运行：`esbuild` `puppeteer-core` `cheerio` `axios` `dayjs` `zod` `@monaco-editor/react` `monaco-editor`
  - 开发：`cross-env`
- Phase 3 Step 4 不增依赖

若新机 `pnpm install` 后 build 红，最常见原因是 node-7z 的原生依赖平台差异；`rm -rf node_modules pnpm-lock.yaml && pnpm install` 一刀切。

---

## 14. 对 AI agent 的接手指令

你读到这里时的首要任务：

1. **不要**回顾聊天历史，以本文件 + `docs/specs/scripting.md` + 规范文档为准
2. **不要**主动重构现有代码，除非用户明确要求
3. **默认行为**：等用户说"换方向" / 进具体下一步之前，别自己发起改动
4. **用户一来就说"继续"的话**，先指引他跑 §10c §11 验证清单（Step 3+4 还没人手测过），全通过后才 Phase 3 Done
5. 开工前确认 `pnpm run build` 本机能跑通，**这是接手线的第一个 sanity check**
6. 任何改动后 `pnpm run build` 必绿（规范第 11 节）
7. 遇到 §6 那些 bug 类似的症状时，直接翻表对应处理，不要再调试一遍

---

## 15. 用户视角的"我现在该做什么"

按时间顺序：

1. **换机后**：拉代码 → `pnpm install` → `pnpm run build` 确认绿 → `pnpm run dev` 启动
2. **跑 §10c 验证清单**（21 项，Step 3 + 重构）
3. **跑 §11 验证清单**（14 项，Step 4 润色）
4. **跑 §11b 验证清单**（21 项，占用规则三步走）
5. **跑 §11c 验证清单**（5 项，代理连通性测试）
6. 哪一项不对：贴给 agent，先修再下一步
7. 全绿：Phase 3 Done，告诉 agent 进 §12 的下一步候选

---

**本文件的维护**：每完成一个 Phase/Step 就更新第 0、6、8、9 节，保持它始终反映当前现实。
