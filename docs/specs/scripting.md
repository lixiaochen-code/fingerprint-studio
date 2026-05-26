# 脚本系统设计（Scripting System）

> Status: Draft · Owner: 李晨 · 最后更新: 2026-05-13

## 0. 目标

给 auto-registry 增加自动化脚本能力：让用户用 JavaScript / TypeScript 编写脚本，在指定浏览器环境里执行 puppeteer 级别的自动化操作（打开页面、填表单、点击、截图、数据采集等）。

非目标：

- 可视化 RPA（拖拽节点）
- 脚本跨机器分发 / 云执行
- 脚本商店、评分、计费

## 1. 核心概念

| 名词 | 含义 |
| --- | --- |
| **Script** | 一个脚本定义：一份 `.ts` 源码 + meta（名字、描述、入口） |
| **ScriptRun** | 一次脚本执行：`scriptId × profileId × 开始时间` 三元组构成唯一 id，带独立日志流和状态 |
| **Script Sandbox** | 每个 ScriptRun 对应一个被 `fork` 出来的 Node 子进程，与主进程通过 IPC 通信 |
| **SDK** | 脚本代码里唯一允许 import 的包名 `auto-registry`；封装 profile 元数据、browser/page 访问、日志、持久化 KV |
| **Dev 模式** | 脚本源码在应用外部（任意目录）；应用暴露本地接口供外部脚本调用内部 SDK |
| **Prod 模式** | 脚本源码在 `<userData>/registry-data/scripts/<scriptId>/` 内；应用内编辑 + 执行，面向非开发者 |

## 2. 分层架构

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

## 3. 技术决策

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

## 4. 数据模型

### 4.1 `Script`

```ts
interface Script {
  id: string                   // script_<timestamp>_<rand>
  name: string
  description?: string
  source: 'local' | 'external' // local = Prod 模式（存在 <userData>）；external = Dev 模式（外部绝对路径）
  entryPath: string            // 绝对路径到 index.ts
  createdAt: string
  updatedAt: string
}
```

存储：`<userData>/registry-data/scripts.json`（与 `profiles.json` 同规格，原子写）。

### 4.2 `ScriptRun`

```ts
interface ScriptRun {
  id: string                   // run_<timestamp>_<rand>
  scriptId: string
  profileId: string
  status: 'pending' | 'running' | 'succeeded' | 'failed' | 'stopped'
  startedAt: string
  endedAt?: string
  exitCode?: number | null
  error?: string               // 最终错误信息
  logPath: string              // 日志落盘路径
}
```

运行中 `ScriptRun` 保留在内存（`Map<runId, ChildProcess>` + 元数据），完成后追加到 `<userData>/registry-data/script-runs.json`（只保留最近 N 条，滚动清理）。

### 4.3 脚本目录结构（local/Prod）

```
<userData>/registry-data/scripts/
├── script-meta.json
├── <scriptId>/
│   ├── index.ts                # 入口
│   ├── state.json              # kv 持久化
│   └── logs/<runId>.log        # 每次运行的日志
└── .shared/
    └── (暂时为空；后续白名单依赖装这里)
```

## 5. SDK 表面

脚本里合法的全部 API：

```ts
// 'auto-registry' 的全部导出
import {
  profile,          // 只读 Profile 对象（id/name/platform/proxy/fingerprint）
  browser,          // () => Promise<Browser>  puppeteer-core Browser
  page,             // () => Promise<Page>     第一个 tab 或新建
  log,              // (...args) => void
  warn,
  error,
  sleep,            // (ms) => Promise<void>
  kv,               // { get<T>(k): Promise<T|null>, set(k, v): Promise<void>, delete(k): Promise<void> }
  stopSignal        // AbortSignal  — 用户点停止时触发
} from 'auto-registry'

// 内置可 import 的第三方库（MVP）
import * as puppeteer from 'puppeteer-core'
import * as cheerio from 'cheerio'
import axios from 'axios'
import dayjs from 'dayjs'
import { z } from 'zod'
```

类型定义通过 `tsc --declaration` 从 SDK 实现自动生成，打包时落在 `<userData>/registry-data/scripts/.typings/auto-registry.d.ts`，Monaco 加载这份而不是手写字符串。

## 6. Dev 模式

**诉求**：开发者想用自己的 VS Code / Cursor / WebStorm 在任意目录写脚本，但仍然能调用应用内部的 SDK 和已登录的环境。

**方案**：

- 主进程里多加一个可选启动的本地 HTTP 服务 `scriptDevServer`（端口 `127.0.0.1:17317`，默认不启）
- 应用设置里有开关 "Enable Script Dev Server"（只对开发者有意义），勾选后服务启动
- 开发者在外部项目里安装 `auto-registry-sdk-client`（我们后续发布的小包），它会：
  1. 连接 `http://127.0.0.1:17317`
  2. 让开发者在代码里直接 `import { ... } from 'auto-registry-sdk-client'`
  3. 背后走 HTTP/WebSocket 把调用代理给主进程的同一套 SDK 实现
- 这样 dev 模式下代码**几乎和 prod 模式一样**：唯一差异是包名不同。发布 prod 时改 import 即可，或者通过 TS path 映射统一

**Dev 模式不纳入 MVP**，但架构要给它留口子：SDK 实现不能和子进程耦合死，应该是可被 `devServer.ts` 复用的纯函数 + 显式依赖注入。

## 7. 分阶段实现

按"最小可逆单元"推进，每个 Phase 结束都要 `pnpm run build` 全绿，用户验证后再进下一阶段。

### Phase 1 — 地基（本轮）

- [ ] 启动时给所有 profile 加 `--remote-debugging-port=0 --remote-debugging-address=127.0.0.1`
- [ ] 主进程 `electron/scripts/cdp.ts`：读 `DevToolsActivePort` 的工具函数
- [ ] 主进程 `electron/scripts/store.ts`：`Script`/`ScriptRun` 数据模型 + 原子存储（还不接 UI）
- [ ] 新增类型到 `electron/types.ts`
- [ ] 暴露查询 API：`scripts.list / scripts.getRunByProfile`（内部用，UI 下一阶段接）

### Phase 2 — 脚本执行引擎

- [ ] `electron/scripts/bootstrap.ts`：子进程引导，esbuild 转译 + 加载用户 entry
- [ ] `electron/scripts/sdk/`：SDK 实现（profile / browser / page / log / sleep / kv / stopSignal）
- [ ] `electron/scripts/runtime.ts`：fork、IPC、stdout/stderr 捕获、SIGTERM→SIGKILL
- [ ] `scripts:run` / `scripts:stop` IPC + preload
- [ ] 最小一个 runSmoke 测试脚本跑通

### Phase 3 — 脚本管理 UI

- [ ] 新增 "Scripts" tab
- [ ] 脚本列表 + 新建 / 删除 / 编辑 meta
- [ ] Monaco Editor 集成 + SDK d.ts 注入
- [ ] 运行面板：选择一个或多个环境 → 运行 → 实时日志 → 停止

### Phase 4 — Dev Server（可选）

- [ ] 设置里加"Enable Script Dev Server"开关
- [ ] `electron/scripts/devServer.ts`：HTTP + WebSocket over localhost
- [ ] 单独 npm 包 `auto-registry-sdk-client` 仓库规划（不在本仓库）

### Phase 5 — 体验优化

- [ ] 模板市场（预设 3-5 个常用脚本）
- [ ] ScriptRun 历史查询 / 日志回放
- [ ] 脚本导入 / 导出（zip）
- [ ] 白名单依赖管理

## 8. 目录与文件新增清单

本次 spec 定的最终布局（逐 Phase 逐个生效）：

```
electron/
├── scripts/
│   ├── cdp.ts                    # DevToolsActivePort 读取 + 等待就绪
│   ├── store.ts                  # ScriptStore（Script / ScriptRun）
│   ├── runtime.ts                # ScriptRuntimeManager
│   ├── bootstrap.ts              # 子进程入口（fork 执行它）
│   ├── devServer.ts              # Dev 模式 HTTP 服务（Phase 4）
│   └── sdk/
│       ├── index.ts              # SDK 实现（子进程侧消费）
│       ├── browser.ts            # puppeteer-core 连接
│       ├── kv.ts                 # state.json 读写
│       └── types.ts              # SDK 对外导出的类型定义源
docs/specs/
└── scripting.md                  # 本文件
src/
├── views/
│   └── scripts/                  # 路由组件目录(Phase 3)
│       ├── index.tsx             # 入口:侧栏 + 详情面板编排
│       └── components/
│           ├── script-list/      # 左侧脚本列表
│           ├── script-detail-pane/    # 右侧编辑器 + 运行面板容器
│           ├── script-editor/    # Monaco 封装
│           ├── script-run-panel/ # 运行 / 日志(含 profile-selector / run-row 子组件)
│           ├── create-script-dialog/  # 新建脚本对话框
│           └── delete-script-dialog/  # 删除确认
└── lib/
    ├── monaco-setup.ts           # MonacoEnvironment.getWorker 钩子
    └── script-typings.ts         # 合并版 ambient d.ts
```

## 9. 安全与限制

- 脚本有对 `<userData>` 全部读写权限，能访问所有 profile 的 cookie 文件；这是设计假设，不再额外沙箱
- CDP 端口只绑 `127.0.0.1`，不对外暴露
- 脚本子进程的 `env` 只透传最小白名单（`PATH` / `HOME` / `TMPDIR` / `LANG` 等系统必需项 + 我们注入的 `AUTO_REGISTRY_*`）
- 外部来源脚本（Dev 模式 + 导入他人脚本）首次运行时**必须**弹出显式确认对话框
- 脚本密码 / 代理凭证等敏感值在日志里不记录
- 脚本超时：默认 30 分钟无输出自动杀掉，可在 meta 里调整（MVP 先固定）

## 10. 不做的事 / 已知限制

- 断点调试：当前不支持 attach 到子进程（Node inspector 有成熟方案，后续再加）
- 脚本间通信：不提供，用 KV 或外部文件系统
- 定时调度：不内置 cron，后续可选做
- 多进程共享 Browser：一个 profile 同时被多个 ScriptRun 连接是允许的（CDP 原生支持），但并发冲突由脚本作者自理

---

有需要调整的随时提。
