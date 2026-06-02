# Baseline: desktop/scripts

> 真理之源：脚本子系统（含脚本运行、全局脚本、main(args) 协议）。新 change 通过 delta 修改本文档。
> 历史完整设计见末尾 Legacy Design Document 附录。

## Current Capabilities

> 以下 Requirement 是从历史设计文档抽出的高层能力描述。后续 change 通过 delta 增删改本节内容。

### Requirement: 脚本生命周期与子进程隔离

每个 ScriptRun 对应一个 fork 出来的 Node 子进程。脚本崩溃不影响主应用。

#### Scenario: 脚本 throw → 进程 exit
- GIVEN 用户脚本 main 抛出错误
- WHEN 主进程接收子进程 exit 事件
- THEN ScriptRun 状态变为 `failed`
- AND error 字段记录错误摘要
- AND 主进程不退出

#### Scenario: 用户主动停止
- GIVEN 一个 running 的 ScriptRun
- WHEN 用户点击 Stop
- THEN 主进程发 SIGTERM 给子进程，3 秒后无响应发 SIGKILL
- AND ScriptRun 状态变为 `stopped`
- AND 浏览器进程不被关闭（用户可继续观察）

### Requirement: 脚本 SDK 唯一入口

脚本里合法 import 仅限 `auto-registry`（含子模块 `puppeteer-core`、`cheerio`、`axios`、`dayjs`、`zod`）。SDK 通过 bootstrap 子进程 require 拦截路由到实现。

#### Scenario: 脚本调用 page() 和 log()
- GIVEN 用户脚本 import { page, log } from 'auto-registry'
- WHEN 调用 `await page()`
- THEN 返回的 Page 对象绑定到当前 profile 的 CDP endpoint
- AND log() 输出捕获到 ScriptRun.logPath

### Requirement: Script.scope 区分 profile 与 global

每个 Script 有 scope 字段（`profile` | `global`）。global 脚本不绑定 profile，专做调度。

#### Scenario: profile 脚本运行
- GIVEN scope=`profile` 的脚本
- WHEN 用户选定一个 profile 并 Run
- THEN 启动浏览器（如未启），子进程通过 CDP 连接
- AND SDK 暴露 `browser` / `page` / `profile`

#### Scenario: global 脚本运行
- GIVEN scope=`global` 的脚本
- WHEN 用户 Run（不选 profile）
- THEN 不启动浏览器
- AND SDK 暴露 `profiles` / `runScript`，**不**暴露 `browser` / `page`

#### Scenario: profile 脚本误用全局 API
- GIVEN scope=`profile` 的脚本调用 `profiles.list()`
- WHEN 子进程执行到该调用
- THEN 抛错码 `GLOBAL_NOT_AVAILABLE`

### Requirement: profile.id 公开且全局唯一

profile.id 在 UI 可见且可复制；创建时可由调用方（全局脚本或后续 IPC）显式指定，全局唯一不可改。

#### Scenario: 用户复制 ID
- GIVEN 环境表渲染完成
- WHEN 用户点击 ID chip
- THEN 剪贴板含完整 id
- AND tooltip / toast 反馈"已复制"

#### Scenario: 创建时指定 id 冲突
- GIVEN profiles 列表已存在 `env_foo_01`
- WHEN 调 `profiles.create({ id: 'env_foo_01', ... })`
- THEN 抛错码 `PROFILE_ID_TAKEN`

### Requirement: main(args) 协议

脚本入口默认 export `async function main(args: ScriptMainArgs<P>)`。args 包含 params / profile / run / triggeredBy / parentRunId。

#### Scenario: 调度方传参
- GIVEN 全局脚本调 `runScript(sid, pid, { keyword: 'foo' })`
- WHEN 子脚本 main 被调用
- THEN args.params.keyword === 'foo'
- AND args.triggeredBy === 'global-script'
- AND args.parentRunId === 父全局 run id

#### Scenario: 老脚本不读参兼容
- GIVEN 老脚本 `export default async function main() { ... }`
- WHEN 主进程 fork 调用
- THEN 不报错，参数被忽略

### Requirement: 全局脚本 runScript 与 stopSignal 联动

全局脚本可通过 `runScript(sid, pid, params?)` 同步 await 子 run 完成。子 run 自动设置 parentRunId。父 run 被 stop 时同步 stop 当前 await 的子 run。

#### Scenario: 父 stop 联动
- GIVEN 全局 run 正在 await `runScript(...)`
- WHEN 用户在 ActiveRunsButton 抽屉 stop 父 run
- THEN 全局脚本在 `runScript` 处 throw（AbortError 或类似）
- AND 主进程同步 stop 当前等待的子 run
- AND 子 run 状态 = `stopped`

### Requirement: PROFILE_BUSY 互斥不变

同一 profile 任何时刻最多 1 个活跃 ScriptRun。手动触发与全局调度都走同一互斥规则。

#### Scenario: 启动后立即手动触发
- GIVEN profile 上已有一个活跃 ScriptRun
- WHEN 用户点击手动 Run 同一 profile 的另一脚本
- THEN 抛错码 `PROFILE_BUSY`
- AND 文案告知当前 profile 正被哪个脚本占用

### Requirement: CDP 端口仅本机

所有 profile 启动时传 `--remote-debugging-port=0 --remote-debugging-address=127.0.0.1`，端口随机化、仅绑 localhost。

#### Scenario: 外网扫描
- GIVEN profile 启动
- WHEN 任何外网 IP 尝试访问 CDP 端口
- THEN 连接被拒（仅 127.0.0.1 可连）

### Requirement: 持久化兼容

老数据加载时自动补默认值，无破坏性升级。

#### Scenario: 老 script 无 scope 字段
- GIVEN scripts.json 某条 Script 无 `scope`
- WHEN store.load 读取
- THEN 补 `'profile'`

#### Scenario: 老 ScriptRun 无 triggeredBy 字段
- GIVEN script-runs.json 某条 ScriptRun 无 `triggeredBy`
- WHEN store.load 读取
- THEN 补 `'manual'`

## Architecture Map

```
electron/scripts/
├── store.ts          Script / ScriptRun 持久化
├── runtime.ts        ScriptRuntimeManager（fork + 生命周期）
├── cdp.ts            DevToolsActivePort 读取
├── bootstrap.ts      子进程引导（esbuild 转译 + require 拦截）
└── sdk/
    ├── index.ts      子进程侧 SDK 实现
    ├── browser.ts    rebrowser-puppeteer-core 连接（profile scope）
    ├── kv.ts         state.json 读写
    ├── bridge-client.ts  global scope 通过 bridge 调 main
    └── types.ts      类型导出（ScriptMainArgs 等）

src/views/scripts/    脚本 UI（编辑器 / 列表 / 运行面板）
src/lib/script-typings.ts  Monaco ambient d.ts
```

## Error Codes

| 错误码 | 含义 |
|---|---|
| `PROFILE_BUSY` | 同 profile 已有活跃 run |
| `PROFILE_ID_TAKEN` | 创建 profile 时 id 冲突 |
| `GLOBAL_NOT_IMPL_YET` | 当前未实现的全局脚本 API（例如 `profiles.setQueue`） |
| `GLOBAL_NOT_AVAILABLE` | profile-scope 脚本调用了 global-only API |
| `KERNEL_MISSING` | 浏览器内核未下载（与 stealth 共用） |

## Roadmap

- **Phase 1-2**（完成）：脚本地基 + 执行引擎
- **Phase 3**（完成）：脚本管理 UI
- **全局脚本核心能力**（完成）：`profiles.list/get/create/delete`、`profiles.launch/close`、`runScript`、main(args)、父子 run 联动。详见归档 `specs/archive/desktop/scripts/2026-05-*`
- **profile 队列 / `profiles.setQueue`**（待办）：历史设计有 onCreate / onLaunch 两条队列，但当前实现仍占位返回 `GLOBAL_NOT_IMPL_YET`
- **Phase 4**（待办）：Dev Server
- **Phase 5**（待办）：体验优化（模板市场 / 历史回放 / 导入导出 / 白名单依赖）

---

## Legacy Design Document

> 以下两份是原 `docs/specs/scripting.md` + `docs/specs/global-scripts-and-queues.md` 的摘要 + 引用。完整内容通过两条途径可达：
> 1. git 历史：`git show <pre-migration-commit>:docs/specs/scripting.md` 与 `git show <pre-migration-commit>:docs/specs/global-scripts-and-queues.md`
> 2. archive：`specs/archive/desktop/scripts/2026-05-{global-scripts-and-queues,phase-6-runtime,profile-launch-close}/` 三个 legacy spec 的 requirements/design/tasks
>
> 后续 change 不要修改本附录；所有更新通过 delta 反映到 Current Capabilities 段。

### Part 1 摘要：scripting.md（脚本系统设计）

> Status: Draft · Owner: 李晨 · 最后更新: 2026-05-13

**目标**：给 auto-registry 增加自动化脚本能力——用 JS/TS 编写脚本，在指定浏览器环境里执行 puppeteer 级别的自动化操作（打开页面、填表单、点击、截图、数据采集等）。

**非目标**：可视化 RPA / 脚本跨机器分发 / 脚本商店。

**核心概念**：

- Script — `.ts` 源码 + meta
- ScriptRun — `scriptId × profileId × 开始时间`，独立日志流和状态
- Script Sandbox — 每个 ScriptRun 一个 fork 子进程
- SDK — 仅 import `auto-registry`
- Dev / Prod 两种来源（外部目录 / userData 内）

**关键技术决策**：

| 决策 | 选择 |
|---|---|
| 进程隔离 | child_process.fork |
| TS 转译 | esbuild.transformSync 在 bootstrap |
| SDK 风格 | ES Module，Monaco 类型提示自然 |
| CDP 开关 | --remote-debugging-port=0 --remote-debugging-address=127.0.0.1 |
| 依赖策略 | MVP 固定内置 puppeteer-core / cheerio / axios / dayjs / zod |
| 停止语义 | SIGTERM → 3s → SIGKILL；不关浏览器 |

**SDK 表面**：profile / browser / page / log / warn / error / sleep / kv / stopSignal。

**分阶段实现**：Phase 1 地基 → Phase 2 执行引擎 → Phase 3 UI → Phase 4 Dev Server → Phase 5 优化。

完整设计含数据模型（Script / ScriptRun / 目录结构）、SDK 类型生成、Dev Server 架构、安全限制、不做事项。详见 git 历史。

### Part 2 摘要：global-scripts-and-queues.md（全局脚本 + 环境队列）

> Status: Draft · Owner: 李晨 · 最后更新: 2026-05-27

**目标**：把脚本子系统从"用户手动选 profile + 点 Run"扩展为：

1. profile 拥有公开 id（UI 可见 + 可复制 + 创建时可指定）
2. 每个 profile 可绑定两条脚本队列（onCreate / onLaunch）
3. 新增"全局脚本"作为 Script.scope 的另一个值（不绑 profile，能调度别的脚本）
4. main(args) 协议（参数透传 / triggeredBy / parentRunId）

**不做**：队列条件分支 / 队列并发 / 跨 profile 队列编排 / profile.id 改名 / 全局脚本 attach 浏览器。

**数据模型变更**：

- BrowserProfile.{onCreateQueue, onLaunchQueue} 加两个 string[]
- ProfileDraft.id?: string（外部可指定）
- Script.scope: 'profile' | 'global'
- ScriptRun.{triggeredBy, parentRunId, params}

**全局脚本 SDK**：

- `profiles.{list, get, create, delete, setQueue}`
- `runScript(scriptId, profileId, params?): Promise<ScriptRun>` — 同步 await 子 run

**队列触发机制**：

- onCreate：`store.upsert` 创建分支后立即同步执行（"保存并初始化"），结束后浏览器保持
- onLaunch：`launchProfile` 末尾 fire-and-forget 触发；用户手动 run 撞上则 PROFILE_BUSY
- 失败语义：任一条 failed → 队列停；用户主动 stop 也算"非完成"，停止后续

**UI 变更**：环境表新增 ID 列、队列列、操作列 dropdown；编辑对话框新增"自动化"区段（两组 sortable 队列）；Scripts 列表 + 创建对话框加 scope 单选；ActiveRunsButton 抽屉显示父子 run。

**阶段实施**：6 个阶段，各阶段独立 commit + build 全绿。

**新增错误码**：`PROFILE_ID_TAKEN` / `INVALID_QUEUE` / `GLOBAL_NOT_AVAILABLE`。

**完整内容**：

- 数据模型详细字段、迁移逻辑：见归档 `specs/archive/desktop/scripts/2026-05-global-scripts-and-queues/tasks.md` 与配套的 phase-6-runtime / profile-launch-close 归档
- main(args) 完整协议：见 `specs/archive/desktop/scripts/2026-05-phase-6-runtime/design.md`
- 启动流程整合细节：见 `specs/archive/desktop/scripts/2026-05-profile-launch-close/design.md`
- 验收清单：上述三个归档的 tasks.md
