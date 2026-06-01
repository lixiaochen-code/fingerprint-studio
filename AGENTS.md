# AGENTS.md

> Universal entry point for any AI coding agent working in this repository.
> 这是给所有 AI agent（Claude Code、Cursor、Codex、Gemini CLI、Copilot 等）的统一入口。
> 其他工具特定文件（`CLAUDE.md` / `GEMINI.md` / `.cursorrules` / `.github/copilot-instructions.md`）均为本文件的符号链接，**只维护这一份**。

---

## 1. 项目一句话

`fingerprint-studio` 是一个基于 Electron + React + TypeScript 的桌面应用，用来管理多个相互隔离的跨境电商浏览器环境。每个环境拥有独立的 user-data 目录、代理、指纹配置，可按需启停对应的 Chromium / CloakBrowser / itbrowser 内核。

> 注：仓库历史名为 `auto-registry`，2026-06 改名为 `fingerprint-studio`。内部代码标识符（SDK 包名、env 前缀、bundle id 等）仍保留旧名以确保兼容。

## 2. 必读三件套

任何不是"改一个拼写"级别的改动，按顺序读完才能动手：

1. **本文件**（AGENTS.md）— 你现在读的
2. **`docs/process/00-overview.md`** — 开发流程总规范，状态机、各环节入口
3. **`docs/PROJECT_GUIDE.md`** — 项目特定知识：架构、技术约束、反检测策略、IPC 模型

任何 change 还需要读 `docs/CODING_STANDARDS.md`。

## 3. 流程速记

- 所有需求走 `specs/changes/<slug>/` 完整生命周期，状态机：

  ```
  draft → approved → designed → in-progress → testing → ready-to-ship → shipped → archived
  ```

- 真理之源：`specs/baseline/<端>/<module>/spec.md`
- 已归档：`specs/archive/<端>/<module>/<slug>/`，跨模块归 `_cross/`
- 模板：`docs/process/templates/`
- 详细规范：`docs/process/01-requirements.md` ~ `06-archive.md`，每份独立可读

详细规则一律以 `docs/process/` 为准，本文件只做入口提示，不做权威定义。

## 4. AI Agent 行为准则

1. **不自行引入新组件库或大体积依赖**。本项目已刻意精简依赖；新增依赖 = 新增维护成本，需要用户同意
2. **不凭记忆写路径**。文件路径、符号名、导入路径都应来自实际读取
3. **不做"重构式"大改动**。除非用户明确要求，改动范围控制在本次任务所需之内
4. **不留注释版"以后用"代码**。删除即可，Git 负责存档
5. **不自动写新测试**，除非用户要求或测试规范要求
6. **不悄悄修改规范**。若认为规范需要调整，先在回复中提出并等用户确认，再改 `docs/process/*` 或 `docs/CODING_STANDARDS.md`
7. **默认中文回复**；代码注释可用中英混合，但面向主逻辑的"为什么这样做"优先中文

## 5. 工具适配

| 工具 | 加载入口 |
|---|---|
| Claude Code | `CLAUDE.md`（symlink → AGENTS.md） |
| Cursor (旧版) | `.cursorrules`（symlink → AGENTS.md） |
| Cursor (新版) | `AGENTS.md` |
| Gemini CLI | `GEMINI.md`（symlink → AGENTS.md） |
| Copilot | `.github/copilot-instructions.md`（symlink → ../AGENTS.md） |
| Codex | `AGENTS.md` |
| Kiro | 本文件 + `.kiro/steering/process.md`（自动加载流程总规范） |

切换工具不影响流程，因为流程数据全部在 `specs/` 与 `docs/process/`，与工具解耦。

> Windows users: 如果 clone 时 symlink 没启用，请运行 `git config core.symlinks true && git checkout .`，或手工把 AGENTS.md 内容复制到其他入口文件中。

## 6. 第一次进入项目的步骤

1. 读完本文件（你正在读）
2. 读 `docs/process/00-overview.md`（< 200 行）
3. 读 `docs/PROJECT_GUIDE.md` 找到与你任务相关的章节
4. 看仓库根目录 `specs/changes/` 是否有 `in-progress` 的 change，决定是接手还是新开
5. 按 `docs/process/01-requirements.md` 起步
