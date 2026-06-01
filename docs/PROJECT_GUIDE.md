# PROJECT_GUIDE.md

> 项目特定知识库：架构、技术约束、反检测策略、IPC 模型、命名规范。
> 流程相关内容不在本文件，见 `docs/process/`。
> 入口在 `AGENTS.md`，不要直接读这个文件作为入口。
>
> **改名说明**：项目仓库 2026-06 改名为 `fingerprint-studio`（旧名 `auto-registry`）。内部代码标识符全部保留旧名（SDK 包名 `auto-registry`、env 前缀 `AUTO_REGISTRY_*`、bundle id `com.autoregistry.app`、IPC 命名空间 `window.registry`、userData 子目录 `registry-data/`），用户脚本与现有应用数据兼容。

---

## 1. 目录总览

```
auto-registry/
├── AGENTS.md                    # AI agent 入口（symlinks: CLAUDE.md / GEMINI.md / .cursorrules / .github/copilot-instructions.md）
├── README.md                    # 面向最终用户的说明
├── docs/
│   ├── CODING_STANDARDS.md      # 代码规范（必读）
│   ├── PROJECT_GUIDE.md         # 本文件
│   ├── process/                 # 开发流程规范（00-overview + 01-06 + templates）
│   └── handoffs/                # 历史 handoff 文档归档
├── specs/                       # 流程数据（工具中立）
│   ├── baseline/<端>/<module>/spec.md   # 真理之源
│   ├── changes/<slug>/                  # 进行中
│   └── archive/<端>/<module>/<slug>/    # 已归档
├── electron/                    # 主进程：Node.js 侧
├── src/                         # 渲染进程：React + shadcn/ui
├── dist/                        # Vite 构建产物
├── dist-electron/               # 主进程构建产物
├── release/                     # electron-builder 输出
├── .browsers/                   # 本地浏览器缓存
├── index.html                   # Vite 入口 HTML
├── package.json
├── pnpm-lock.yaml
├── tsconfig.json
├── tsconfig.electron.json
└── vite.config.ts
```

修改前先定位到正确的"层"：

| 需求 | 去哪个目录 |
| --- | --- |
| 文件读写、子进程、启动浏览器、下载内核 | `electron/` |
| profiles / plugins 持久化 | `electron/store.ts` |
| 代理（条目 CRUD、批量导入、连通性测试、迁移） | `electron/proxies/` |
| 浏览器内核选择、启动参数 | `electron/kernel.ts` |
| 反指纹注入扩展（A 轨 stealth） | `electron/stealth/` + `electron/fingerprint.ts` |
| 代理认证扩展 | `electron/proxyAuth.ts` |
| 内核下载与解压 | `electron/downloader.ts` |
| 脚本子系统（用户脚本运行 + 调度 + CDP attach） | `electron/scripts/` |
| 主进程与渲染进程的桥 | `electron/preload.ts` + IPC handler 在 `electron/main.ts` |
| 路由 + 全局编排 | `src/App.tsx` |
| 单页 / 路由组件 | `src/routes/`（按 view 拆分） |
| 应用框架级组件（header、shell） | `src/components/` 顶层 |
| 业务功能组件（弹窗、表单、专项视图） | `src/components/*.tsx` |
| 通用 UI 原子（按钮、输入框、对话框外壳等） | `src/components/ui/*.tsx`（仅此目录可以新增基础组件） |
| 跨组件复用的 hooks | `src/hooks/` |
| 纯工具函数、i18n | `src/lib/*.ts` |

## 2. Electron 进程模型

- **Main**（`electron/main.ts`，以及同目录其他 `.ts`）：Node 环境，全能。IPC handler 全部注册在这里，不要在其他主进程模块里散着注册。
- **Preload**（`electron/preload.ts`）：上下文隔离的桥。用 `contextBridge.exposeInMainWorld('registry', api)` 暴露 API。渲染进程通过 `window.registry.xxx` 调用。
- **Renderer**（`src/`）：Chromium 沙箱里的 React。**没有** Node 权限，也不应引入任何 `node:*` 模块。

IPC 改动三件套，缺一不可：
1. `electron/main.ts` 里 `ipcMain.handle('domain:action', ...)`
2. `electron/preload.ts` 里增加对应方法，做好 TypeScript 类型
3. `src/vite-env.d.ts` 里同步 `window.registry` 的类型声明

## 3. 反检测策略约束（重要）

经历过多轮 Cloudflare Turnstile 排查后落定的策略，**改任何反指纹相关代码前必读**。完整说明见 `specs/baseline/desktop/stealth/spec.md`（迁移完成后）。本节是速记。

### 3.1 chromium 路径（默认）：OS 维度求"真"，容器维度差异化

**不传**以下 CLI flag（会与 Chromium 内部 client hints 矛盾，被 Turnstile 直接判 bot）：
- `--user-agent` —— 让 navigator.userAgent 走 Chromium 默认值，与 sec-ch-ua / userAgentData 自动一致
- `--lang` —— Accept-Language HTTP header 跟系统 locale 走
- `--force-webrtc-ip-handling-policy` —— WebRTC handling 用浏览器默认

**必传**以下 CLI flag：
- `--disable-blink-features=AutomationControlled` —— 让 navigator.webdriver 在内核层就是 false（不需要 JS hook）
- `--remote-debugging-port=0 --remote-debugging-address=127.0.0.1` —— 脚本子系统的 CDP 入口

**stealth payload 内**（`electron/stealth/patches/`）：
- **不 hook**：navigator.userAgent、appVersion、platform —— 与 client hints 矛盾，碰过翻车
- **可以 hook**：webdriver、language、languages、hardwareConcurrency、deviceMemory、maxTouchPoints、doNotTrack、plugins、mimeTypes —— 这些字段不与 client hints 交叉校验，是容器差异化的真正承重者
- WebGL：vendor / renderer 跨 OS 时一定漏，所以 targetOs 钳制到宿主之后才有意义

### 3.2 targetOs 钳制

`fingerprint.ts::resolveTargetOs` 永远返回宿主 OS。UI 上"目标系统"下拉框是历史字段，仅做展示。跨 OS 伪装走 cloak / itbrowser 内核（它们在 Chromium 编译期改了 client hints 来源）。

### 3.3 三轨架构速记

- **A 轨（stealth）**：chromium 默认 + 我们注入扩展。覆盖面最广，跨平台
- **B 轨（cloak）**：自家分发的修改版 Chromium，Linux / Win 用，原生支持代理 OS 伪装
- **C 轨（itbrowser）**：Win 限定的第三方内核

代码 fallback 顺序：用户偏好 → 宿主可装 → A 轨。完整设计见 `specs/baseline/desktop/stealth/spec.md`。

## 4. 渲染层结构约定

### 4.1 路由

应用使用 **HashRouter**（`react-router-dom@7`），URL 形如 `index.html#/scripts`。
- 路由的"真源"是 router；不要在 App 里自己持有 `view` state 与 router 双源
- view 切换走 `useNavigate()`；不要直接改 `window.location.hash`
- 各 view 的展示组件放 `src/routes/<name>.tsx`，由 `App.tsx` 用 `<KeepAlive>` 包一层（Monaco / 长连接需要保留实例时）

### 4.2 应用关闭

应用被用户退出（Cmd+Q / 关闭窗口）时，**所有由本应用启动的浏览器进程会被一同关闭**。这条由主进程 `before-quit` 钩子保证：先发 SIGTERM 给优雅退出 ~2.5s，超时 SIGKILL。如果某次需求要让浏览器存活过应用，要在这条规则上明确放宽并加注释。

### 4.3 组件拆分边界

- 单文件 > ~250 行视为该拆的信号，按职责拆子组件或抽 hook
- 同一 view 的多个子区域优先抽 `src/routes/<view>/<sub>.tsx`，不要全部塞进一个 `View.tsx`
- 跨 view 复用的逻辑抽 `src/hooks/<name>.ts`（命名 `use*`），同步副作用归这里
- 常量字典 / i18n 字典放 `src/lib/<topic>Labels.ts` 或 `src/lib/i18n.ts`

## 5. 做事前必读（项目相关，流程性必读见 AGENTS.md §2）

任何不是"改一个拼写"级别的改动，动手前请先按顺序读完：

1. AGENTS.md
2. docs/process/00-overview.md
3. docs/CODING_STANDARDS.md
4. 本文件相关章节
5. 与改动直接相关的文件 + 其直接依赖
6. 改动涉及数据持久化时，读 `electron/store.ts` + `electron/proxies/store.ts` 全文
7. 改动涉及启动流程时，读 `electron/main.ts` 中 `launchProfile` 及 `electron/kernel.ts`
8. 改动涉及反指纹时，读 `specs/baseline/desktop/stealth/spec.md` 与 `electron/stealth/index.ts`

不要"盲改"：在修改前至少用 `grep` / 读文件确认上下文。

## 6. 做事后必验

任何代码改动，提交前都要本地执行：

```bash
pnpm run build
```

该命令依次跑 `tsc`（渲染）、`vite build`、`tsc`（主进程）。**必须全绿**，不允许存在类型错误或构建告警。

如果改动触及启动流程、IPC、数据持久化，**还要** `pnpm run dev` 手工验证一次关键路径：新建环境 → 启动 → 停止 → 删除 → 重启应用后数据仍在。

如果改动触及反指纹相关代码，必须把验证扩展到：
- `https://browser-compat.turnstile.workers.dev/` 全绿（含 challenge 通过）
- 同一 profile 多次启动指纹一致；不同 profile 之间 fingerprintjs visitor ID 不同

## 7. 技术栈硬约束

这些约束不必每次重新讨论：

- **包管理器**：`pnpm`，不使用 npm/yarn
- **路由**：`react-router-dom@7`（HashRouter）
- **UI 组件库**：仅使用 `shadcn/ui` 模式（Radix + Tailwind + cva）。**禁止**引入 antd、Material UI、Mantine 等完整组件库
- **图标**：只用 `lucide-react`
- **样式**：Tailwind v4。不写独立 CSS 文件（除 `src/styles.css` 的全局变量）
- **状态管理**：优先 `useState` / `useReducer`；跨页面共享再考虑 context。**不要**随手引入 Redux / Zustand / Jotai
- **表单**：小表单手写；超过 10 个字段再考虑 `react-hook-form`（需先讨论）
- **网络请求**：渲染进程禁止直接发起外网请求，统一走主进程 IPC
- **语言**：全站 TypeScript，`strict: true`；禁止 `any`，用 `unknown` + 类型守卫
- **Node API**：渲染进程禁用 `node:*`；确实需要时，通过 preload 暴露
- **包依赖**：新增第三方依赖前必须先在 PR / issue 说明理由和替代方案评估

## 8. 常用命令

```bash
pnpm install             # 安装依赖
pnpm run dev             # 启动开发模式（同时启 Vite + Electron）
pnpm run build           # 全量构建 + 类型检查（CI/提交前必跑）
pnpm run dist:check      # 校验 electron 下载缓存 SHA256（dist:* 已自动前置）
pnpm run dist:mac        # 构建 macOS 安装包（先 dist:check 再 build）
pnpm run dist:win        # 构建 Windows 安装包
pnpm run dist:linux      # 构建 Linux AppImage
pnpm run validate:specs  # 校验流程合规（specs/ 结构与状态一致性）
```

本地 Node 版本建议 ≥ 20.x，与 Electron 39 匹配。

### 弱网下的 build（electron cache 损坏）

弱网下 electron-builder 自动下载的 electron zip 可能损坏（SHA 不匹配），表现为 dist 报 `flate: corrupt input`。所有 `dist:*` 已前置 `dist:check` 自动删除损坏缓存让其重下。若重下仍坏（网络持续不稳），手动主动重下 + 校验：

```bash
node scripts/verify-electron-cache.mjs --redownload   # 删坏文件 + curl 重下 + 复校 SHA
node scripts/verify-electron-cache.mjs --strict        # 仅校验，坏则报错退出（CI 用）
```

可选：设置 `ELECTRON_MIRROR` 走更稳定的镜像。背景见归档 `specs/archive/desktop/kernel/2026-06-fix-x64-build/` 与 `2026-06-build-resilience/`。

## 9. 文件命名规范（摘要）

完整规则见 `docs/CODING_STANDARDS.md`。速记：

- 主进程文件：`camelCase.ts`（`main.ts`、`proxyAuth.ts`、`downloader.ts`）
- 主进程子模块目录：`camelCase/` 内部 `camelCase.ts`（如 `proxies/store.ts`、`scripts/runtime.ts`）
- React 组件：`PascalCase.tsx`（`ProfileFormDialog.tsx`）
- 路由组件文件：`src/routes/<view>.tsx`，组件名 `PascalCase`
- shadcn 原子组件：`kebab-case.tsx`（`dropdown-menu.tsx`）
- Hooks：`src/hooks/use<Topic>.ts`，函数名 `useTopic`
- 工具函数：`camelCase.ts`（`i18n.ts`、`utils.ts`）
- 类型只文件：`types.ts`

## 10. 长期运行的子系统状态

- **脚本子系统**：完整规格见 `specs/baseline/desktop/scripts/spec.md`。历史 handoff 记录在 `docs/handoffs/`
- **代理子系统（ProxyStore + 白名单 + 测试）**：设计与迁移逻辑见 `electron/proxies/`；UI 入口 `src/components/ProxiesView.tsx` 和 `ProxyFormDialog.tsx`。当前未抽出 baseline，下一次相关 change 时新建 `specs/baseline/desktop/proxies/spec.md`
- **反检测三轨**：`specs/baseline/desktop/stealth/spec.md`；历史 handoff 在 `docs/handoffs/handoff-*.md`

> 注：迁移完成前路径中带 `specs/baseline/...` 的文件可能尚未存在；具体看本仓 PR-3 的进度。
