# Scripting Subsystem · Handoff

> 目的：换机继续对话时，新的 AI agent 读完本文件即可无缝接手，不用回溯聊天记录。
> 人类协作者也可以把这份当作脚本子系统的工作进度单。

## 0. 当前快照

- **分支**：`main`
- **最后一次已推送提交**：`7413193`（xxxxx）
- **未推送的本地提交**：`58dcdad feat(scripts): phase 1+2 — scripting subsystem foundation`
- **工作区状态（提交后）**：Phase 3 Step 1 已编写并通过 `pnpm run build`，**尚未提交**。下一台机器 pull 之后，需要手动 commit Step 1 的改动，再往下推进。
- **Phase 3 Step 1 涉及文件**（未 commit）：
  - `electron/main.ts` · `electron/preload.ts` · `src/App.tsx` · `src/vite-env.d.ts` · `src/components/ScriptsView.tsx`（新文件）

换机操作：

```bash
git pull                    # 把 58dcdad 拉下来
# 修改应该会以 unstaged 形式出现（因为只在原机提交过 Phase 2）
# 新机器重新安装依赖
pnpm install
pnpm run build              # 确认 build 绿
```

如果 git 状态干净且 HEAD 已是 Phase 3 Step 1 的提交，跳过。否则按"Phase 3 Step 1 继续事项"完成提交。

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
├── vite-env.d.ts                   window.registry.scripts.* 类型
└── components/
    ├── ScriptsView.tsx             (Phase 3 Step 1 — 列表 + 新建/删除)
    ├── ... 现有的 Profile*/SettingsView/KernelSetup
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
| Monaco 类型源 | 直接复用 `sdk/types.ts`（以 `?raw` 载入），避免手写 d.ts 漂移 | 计划落在 Phase 3 Step 2 |

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
| 1 | Tab + 侧栏列表 + 新建 local/external + 删除 | ✅ 已完成（未 commit） |
| 2 | Monaco Editor 集成，local 可写 external 只读，类型 d.ts 注入 | ⏳ 下一步 |
| 3 | 运行面板：多选 profile、并发 run、实时日志流、stop/stopAll | ⏳ |
| 4 | 细节润色：日志颜色、滚动贴底、快捷键、空态 | ⏳ |

Phase 4 Dev Server / Phase 5 模板市场 暂不在视野。

---

## 10. Phase 3 Step 1 继续事项（到新机器做这步）

```bash
# 换机后：
cd /path/to/auto--registry
git pull
pnpm install

# 工作区里 App.tsx / preload.ts / main.ts / vite-env.d.ts 会有未 staged 改动
# 外加一个新文件 src/components/ScriptsView.tsx
# 确认文件齐全：
git status

pnpm run build   # 应该绿
```

如果 build 绿，**立刻提交**：

```bash
git add electron/main.ts electron/preload.ts src/App.tsx src/vite-env.d.ts src/components/ScriptsView.tsx
git commit -m "feat(scripts/ui): phase 3 step 1 — scripts tab list + CRUD

- New 'Scripts' tab in the header (FileCode2 icon), toggles with home
- ScriptsView: 280px sidebar with LOCAL/EXTERNAL badges, create-local
  and register-external buttons, empty state, delete with source-aware
  confirm copy
- Detail pane shows name, badge, description, entryPath, Reveal in
  Finder + Delete buttons; editor/run panel land in the next step
- main.ts: scripts:pickExternalFile + scripts:revealInFinder IPC using
  Electron dialog and shell.showItemInFolder
- preload + vite-env.d.ts: typed surface for the two new IPC methods
- App.tsx: View enum now includes 'scripts'; load() also fetches
  scripts; Header uses currentView instead of isSettings

Verified by build; manual UI walkthrough is the next task."
```

手工 UI 验证步骤（按顺序）：

1. `pnpm run dev` 启动
2. 右上角应该有新的 `<>` 按钮（FileCode2），点进去是 Scripts 视图
3. 侧栏顶部两个 `+` 按钮：一个加 FileCode 图标（新建本地），一个加 FolderOpen 图标（注册外部）
4. 试"新建本地"：名字 `ui-smoke`，创建后侧栏应立刻出现并自动选中
5. 试"注册外部"：Browse 应该弹系统 Open 对话框（过滤 .ts/.tsx/.js/...），选一个文件
6. 右侧详情显示脚本名 + 徽章 + entryPath + Reveal in Finder / Delete
7. 点 Reveal → 访达/资源管理器跳到对应位置（local 在 userData 下，external 在你的项目里）
8. 点 Delete → 弹确认。local 文案提到"脚本目录会被删除"；external 文案提到"只取消登记"
9. 切换 tab 回 Environments 再切回 Scripts，列表还在
10. 切换 EN/中文，文案切换正常

如果某步不对，贴给 agent，先修再进 Step 2。

---

## 11. Phase 3 Step 2 预告

下一步 Monaco 集成前置：

- 新增依赖：`@monaco-editor/react` + `monaco-editor`
- 在 `vite.config.ts` 里确认 monaco 能被代码分割（它体积大）
- 读取 `electron/scripts/sdk/types.ts` 源码字符串（用 `?raw` import）喂给 `monaco.languages.typescript.typescriptDefaults.addExtraLib`，虚拟路径 `file:///node_modules/auto-registry/index.d.ts`
- 同时把 puppeteer-core 的 .d.ts 也注入（从 `node_modules/puppeteer-core/lib/types.d.ts` 读）
- `ScriptsView` 的 `DetailPane` 里把 "Editor & run panel land in the next step." placeholder 替换成 `<ScriptEditor script={script} />`
- `ScriptEditor`：local 可写 → 延迟 500ms debounce 调 `writeSource`；external 只读 + 顶栏提示"在外部编辑器打开"

Dev 模式下热更新：external 脚本磁盘被改，Monaco 不会自动刷新（因为它读的是当下那份）。Phase 3 Step 2 可选加一个"从磁盘重新加载"按钮。

---

## 12. 环境 & 依赖状态

- Node：~~20.x~~（Electron 39 内置的 Node）
- pnpm：9.15（原机）；新机升到 11+ 也可以，lockfile 兼容
- 已装新增依赖（见 `package.json`）：`esbuild` `puppeteer-core` `cheerio` `axios` `dayjs` `zod`
- Phase 3 Step 2 会加：`@monaco-editor/react` `monaco-editor`

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
