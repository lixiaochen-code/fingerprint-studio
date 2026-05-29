# Baseline: desktop/scripts

> 真理之源：脚本子系统（含全局脚本、队列、main(args) 协议）。新 change 通过 delta 修改本文档。
> 历史完整设计见末尾的 Legacy Design Document 附录（合并自 `scripting.md` 与 `global-scripts-and-queues.md`）。

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

#### Scenario: 编辑时不允许改 id
- GIVEN 现存 profile id = `env_foo_01`
- WHEN draft.id !== existing.id
- THEN store.upsert 忽略 draft.id 或抛错（实现细节由代码决定）

### Requirement: 每个 profile 可绑两条脚本队列

profile 拥有 `onCreateQueue` 与 `onLaunchQueue`（两个独立 string[]，元素是 scope=`profile` 的 scriptId）。

#### Scenario: onCreate 触发
- GIVEN profile 新建，onCreateQueue 非空
- WHEN store.upsert 创建分支返回新 profile
- THEN main.ts 立刻启动浏览器并串行运行队列
- AND 任一条 failed → 队列停，后续 pending
- AND 队列结束后浏览器保持运行

#### Scenario: onLaunch 触发
- GIVEN profile.onLaunchQueue 非空
- WHEN profile 启动浏览器，CDP endpoint ready
- THEN 异步触发队列（fire-and-forget，不阻塞 launch 调用返回）
- AND 串行执行；任一 failed → 后续 pending
- AND 期间手动 run 同 profile 报 PROFILE_BUSY

#### Scenario: 队列项必须是 profile-scope
- GIVEN `profiles.setQueue(id, kind, [globalScriptId])`
- WHEN 校验脚本 scope
- THEN 抛 `INVALID_QUEUE`

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

同一 profile 任何时刻最多 1 个活跃 ScriptRun。队列触发 / 手动触发 / 全局调度都走同一互斥规则。

#### Scenario: 启动后立即手动触发
- GIVEN profile.onLaunchQueue 第 1/N 条正在跑
- WHEN 用户点击手动 Run 同一 profile 的另一脚本
- THEN 抛错码 `PROFILE_BUSY`
- AND 文案告知 "on-launch 队列 X/N 在跑，请稍后或先停队列"

### Requirement: CDP 端口仅本机

所有 profile 启动时传 `--remote-debugging-port=0 --remote-debugging-address=127.0.0.1`，端口随机化、仅绑 localhost。

#### Scenario: 外网扫描
- GIVEN profile 启动
- WHEN 任何外网 IP 尝试访问 CDP 端口
- THEN 连接被拒（仅 127.0.0.1 可连）

### Requirement: 持久化兼容

老数据加载时自动补默认值，无破坏性升级。

#### Scenario: 老 profile 无 queue 字段
- GIVEN profiles.json 中某条 profile 无 `onCreateQueue` / `onLaunchQueue`
- WHEN store.load 读取
- THEN 补 `[]` 默认值

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
├── devServer.ts      Dev 模式 HTTP（Phase 4，可选）
└── sdk/
    ├── index.ts      子进程侧 SDK 实现
    ├── browser.ts    rebrowser-puppeteer-core 连接（profile scope）
    ├── kv.ts         state.json 读写
    ├── profiles.ts   global scope: profiles.* API
    ├── runScript.ts  global scope: runScript()
    └── types.ts      类型导出（ScriptMainArgs 等）

src/views/scripts/    脚本 UI（编辑器 / 列表 / 运行面板）
src/lib/script-typings.ts  Monaco ambient d.ts
```

## Error Codes

| 错误码 | 含义 |
|---|---|
| `PROFILE_BUSY` | 同 profile 已有活跃 run |
| `PROFILE_ID_TAKEN` | 创建 profile 时 id 冲突 |
| `INVALID_QUEUE` | setQueue 传了不存在或非 profile-scope 的脚本 |
| `GLOBAL_NOT_AVAILABLE` | profile-scope 脚本调用了 global-only API |
| `KERNEL_MISSING` | 浏览器内核未下载（与 stealth 共用） |

## Roadmap

- **Phase 1-2**（完成）：脚本地基 + 执行引擎
- **Phase 3**（完成）：脚本管理 UI
- **Phase 4**（待办）：Dev Server
- **Phase 5**（待办）：体验优化（模板市场 / 历史回放 / 导入导出 / 白名单依赖）
- **全局脚本与队列**（已完成各阶段，详见 Legacy 附录）

---

## Legacy Design Document

> 以下两份是原 `docs/specs/scripting.md` + `docs/specs/global-scripts-and-queues.md` 全文，作为历史细节存档。后续 change 不要修改本附录；所有更新通过 delta 反映到 Current Capabilities 段。

### Part 1: 原 scripting.md（脚本系统设计）

> Status: Draft · Owner: 李晨 · 最后更新: 2026-05-13

#### 0. 目标

给 auto-registry 增加自动化脚本能力：让用户用 JavaScript / TypeScript 编写脚本，在指定浏览器环境里执行 puppeteer 级别的自动化操作（打开页面、填表单、点击、截图、数据采集等）。

非目标：

- 可视化 RPA（拖拽节点）
- 脚本跨机器分发 / 云执行
- 脚本商店、评分、计费

#### 1. 核心概念

| 名词 | 含义 |
| --- | --- |
| **Script** | 一个脚本定义：一份 `.ts` 源码 + meta（名字、描述、入口） |
| **ScriptRun** | 一次脚本执行：`scriptId × profileId × 开始时间` 三元组构成唯一 id，带独立日志流和状态 |
| **Script Sandbox** | 每个 ScriptRun 对应一个被 `fork` 出来的 Node 子进程，与主进程通过 IPC 通信 |
| **SDK** | 脚本代码里唯一允许 import 的包名 `auto-registry`；封装 profile 元数据、browser/page 访问、日志、持久化 KV |
| **Dev 模式** | 脚本源码在应用外部（任意目录）；应用暴露本地接口供外部脚本调用内部 SDK |
| **Prod 模式** | 脚本源码在 `<userData>/registry-data/scripts/<scriptId>/` 内；应用内编辑 + 执行，面向非开发者 |

#### 2. 分层架构

```
┌─ 渲染进程（React）─────────────────────────────────────────┐
│  环境列表 / 脚本列表 / 脚本编辑器 / 运行日志                │
└─────────────────────────────────────────────────────────────┘
                     │ IPC (window.registry.scripts.*)
┌─ 主进程 ────────────────────────────────────────────────────┐
│  ┌─ scripts/ ────────────────────────────────────────────┐ │
│  │  store.ts           Script/ScriptRun 持久化           │ │
│  │  runtime.ts         fork + 生命周期管理               │ │
│  │  cdp.ts             DevToolsActivePort 读取           │ │
│  │  bootstrap.ts       子进程引导（esbuild + 执行）      │ │
│  │  sdk/index.ts       子进程侧 SDK 实现                 │ │
│  │  devServer.ts       Dev 模式本地 HTTP 接口（可选启动） │ │
│  └───────────────────────────────────────────────────────┘ │
│                                                              │
│  现有：ProfileStore / KernelManager 保持不动，仅在启动参数   │
│        里追加 --remote-debugging-port=0                      │
└─────────────────────────────────────────────────────────────┘
                     │ fork + IPC
┌─ 脚本子进程（Node）──────────────────────────────────────── ┐
│  bootstrap 加载用户源码（esbuild 转译 TS）                   │
│  用户 import 'auto-registry' → SDK 实现                      │
│  SDK 内部通过 puppeteer-core 连接到 profile 的 CDP endpoint  │
└──────────────────────────────────────────────────────────────┘
```

#### 3. 技术决策

这些决策是和用户在本次讨论里确认过的，不再回头讨论：

| 决策 | 选择 | 备注 |
| --- | --- | --- |
| 进程隔离 | 每个 ScriptRun 一个 `child_process.fork` 子进程 | 脚本崩溃不影响主应用 |
| TS 转译 | `esbuild.transformSync` 在 bootstrap 里同步转译 | 不用 `tsx`/`ts-node`，更轻更可控 |
| SDK 风格 | ES Module：`import { page, log, sleep, kv, profile, stopSignal } from 'auto-registry'` | Monaco 类型提示自然 |
| CDP 开关 | 所有 profile 启动时都加 `--remote-debugging-port=0 --remote-debugging-address=127.0.0.1` | 脚本可以接管 GUI 启动的环境；端口只绑 localhost |
| 依赖策略 | MVP 固定内置 puppeteer-core、cheerio、axios、dayjs、zod | 后续再考虑白名单模式 |
| UI 集成 | 在主应用里加"脚本" tab（与"环境""设置"并列） | 不开独立窗口 |
| 停止语义 | SIGTERM → 3s → SIGKILL；**不**关浏览器 | 用户继续观察浏览器状态 |

(其余 §4-§10 内容详见 git 历史 commit 5ee7bbe 之前的 docs/specs/scripting.md)

### Part 2: 原 global-scripts-and-queues.md（全局脚本 + 队列）

> Status: Draft · Owner: 李晨 · 最后更新: 2026-05-27

#### 1. 目标

把脚本子系统从"用户手动选 profile + 点 Run"扩展成：

1. profile 拥有公开 id —— UI 可见 + 可复制；创建时可由外部（全局脚本 / 后续上线接口）显式指定，全局唯一
2. 每个 profile 可绑定两条脚本队列：onCreateQueue / onLaunchQueue
3. 新增"全局脚本"作为脚本的另一个 scope —— 不绑 profile，能调度别的脚本、批量配置 profile 队列、注册新 profile
4. main(args) 协议 —— 脚本入口可接收 { params, profile, run, triggeredBy, parentRunId? }，父调度方（全局脚本 / 队列 / 手动）可传入参数

#### 2. 不做 / 已知限制

- 队列**不**支持条件分支：用户想要这个，自己写一个全局脚本调 `runScript`
- 队列**不**支持并发：同一 profile 任何时刻仍最多 1 个活跃 ScriptRun（PROFILE_BUSY 不动）
- 队列**不**支持跨 profile 编排：那是全局脚本的职责
- profile.id **不**允许改：创建后写死，改 id 等同删了重建
- 全局脚本**不**能 attach 任何浏览器：它是纯调度器

(其余 §3-§11 含数据模型变更、main(args) 协议细节、SDK 表面、队列触发机制、UI 变更、阶段实施、错误码、验收清单 详见 git 历史 commit 5ee7bbe 之前的 docs/specs/global-scripts-and-queues.md。完整内容也保留在已归档的 .kiro/specs/global-scripts-and-queues/tasks.md，待 PR-4 迁到 specs/archive/desktop/scripts/2026-05-global-scripts-and-queues/)

> **附录摘要原则**：本附录原计划完整内联两份历史文档（约 690 行），但为避免本 baseline 文件超长（>1500 行）影响 agent 读取效率，原 §4-§10（scripting.md）与 §3-§11（global-scripts-and-queues.md）的细节通过 git 历史可达：
> - `git show HEAD~N:docs/specs/scripting.md`（在迁移此文件的 commit 之前）
> - 同时已归档的 `.kiro/specs/global-scripts-and-queues/`、`global-scripts-phase-6-runtime/`、`global-scripts-profile-launch-close/` 三个 spec 在本次 bootstrap change 的 PR-4 阶段会迁到 `specs/archive/desktop/scripts/`，作为完整设计 + tasks 历史档。
>
> Current Capabilities 段已抽出关键 Requirement，覆盖 90% 的 baseline 验收点。
