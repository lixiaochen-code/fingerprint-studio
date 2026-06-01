# Proposal: 同步仓库改名（auto-registry → fingerprint-studio）

## 1. Intent

GitHub 仓库已从 `lixiaochen-code/auto--registry` 改名为 `lixiaochen-code/fingerprint-studio`（git push 时多次提示 `repository moved`）。仓库内部多处仍使用旧名 `auto-registry`，需要 sync。本 change 范围限定为 **user-facing 同步**，不动内部代码标识符（避免破坏性影响）。

## 2. Scope

**做**：

- 更新 git remote URL 到新地址
- 更新 README.md / AGENTS.md / docs/PROJECT_GUIDE.md 中"项目一句话"开头的旧名引用
- 更新 package.json 的 `productName`（user-facing 应用名）
- 更新 CHANGELOG.md / 各 release-notes.md（如必要）的项目名

**不做**：

- 不改 package.json 的 `name` 字段（npm 包级标识）
- 不改 `appId` (`com.autoregistry.app`)（macOS bundle id 改了会让现有用户安装的应用变成新应用、丢数据）
- 不改 IPC 命名空间 `window.registry`、SDK 包名 `auto-registry`、env 前缀 `AUTO_REGISTRY_*`、userData 子目录 `registry-data/`、bootstrap 拦截 specifier `auto-registry`（这些是运行时核心，破坏性大）
- 不改 git 历史中的旧仓库 URL 引用（保留可追溯）
- 不改 baseline / archive 中已归档文档的项目名（archive 只读）

## 3. Approach

**简化路径**（按 00-overview §5：≤1 模块、≤1 天、≤3 文件、≤100 行）：

- design.md 省略，本节作为实现说明
- 实现：用 `grep -rn "auto-registry"` 定位 user-facing 引用，逐个评估改 / 不改
- 用 `git remote set-url` 更新 git remote
- 改 package.json `productName`
- README + AGENTS 项目一句话改名

## 4. Affected Scopes

| 范围 | 影响 |
|---|---|
| 端 | desktop |
| 模块 | _cross（多文件文档级） |
| 代码 | 不动业务代码 |
| user-facing 文件 | README.md、AGENTS.md、docs/PROJECT_GUIDE.md、package.json (productName 字段) |

## 5. Requirements

### Requirement: git remote 指向新仓库

#### Scenario: push / pull 不再触发 redirect 提示
- GIVEN 本地 clone 完成 sync
- WHEN `git push origin main`
- THEN 不再出现 `remote: This repository moved.` 提示
- AND push 直接到 `fingerprint-studio.git`

### Requirement: user-facing 文档使用新项目名

#### Scenario: README 标题
- GIVEN 用户打开 README.md
- WHEN 读第一行
- THEN 看到新名（Fingerprint Studio 或 fingerprint-studio）

#### Scenario: AGENTS.md / PROJECT_GUIDE.md 项目一句话
- GIVEN agent 读 AGENTS.md §1
- WHEN 解析项目描述
- THEN 看到新名

#### Scenario: 应用窗口标题（productName）
- GIVEN 应用启动（构建后）
- WHEN macOS dock 看应用名
- THEN 显示新名（Fingerprint Studio）

### Requirement: 内部代码标识符保持稳定

#### Scenario: 用户脚本不破坏
- GIVEN 用户脚本 `import { page } from 'auto-registry'`
- WHEN 升级到本 change 后的版本
- THEN 脚本继续可用（SDK 包名未改）

#### Scenario: 现有 macOS 应用数据保留
- GIVEN 用户已装 v0.1.2 应用
- WHEN 升级到 v0.1.3
- THEN 应用 bundle id 不变（com.autoregistry.app），userData 路径不变，profile 数据保留

## 6. Constraints

- 本 change 是 small change（≤3 文件 user-facing 改动 + git remote 更新）
- 不改任何破坏性内部标识符
- 不改 git 历史中的旧仓库 URL（保留可追溯）

## 7. Risks

| 风险 | 影响 | 缓解 |
|---|---|---|
| 漏改某个 user-facing 引用 | 文档不一致 | grep 全仓 + 人工 review；未改的明确列在 §2 不做 |
| 改 productName 后用户应用名变了但 bundle id 不变 | 用户启动后看到新名但仍是同一应用 | 这是预期行为；release-notes 提示 |
| GitHub 自动 redirect 旧 URL | 用 redirect 短期可用 | 已经在用 redirect；本 change 主动 set-url 避免依赖 |

## 8. Out of Scope

- 不改 npm package name / appId / SDK 包名 / env 前缀（这些破坏性，未来如真要改名应开 major version change）
- 不公开仓库
- 不清理 git 历史

## 9. Open Questions

无（small change，决策已含在 §2/§3 中）。

## Conversation Log

- 2026-06-01 | initial draft + approved | 用户授权"继续都做完"，本 change 是连续动作的第二步。按 small-change 路径走简化流程
