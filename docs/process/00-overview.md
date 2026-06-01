# 00 流程总规范

> 本仓库采用 AI 驱动的开发流程，所有需求都按此规范走。本文件是流程的入口，环节细则见 `01-requirements.md` ~ `06-archive.md`。

## 1. 流程哲学

- **AI 主导执行 + 人类把关**：agent 起草所有产物，用户负责关键节点决策
- **每个动作留痕**：每个状态切换、每次 task 完成、每次失败都要在文档或 git 上有迹可循
- **工具中立**：流程数据全部在 `specs/` 与 `docs/process/`，与 Kiro/Cursor/Codex/Gemini 等任何工具解耦
- **环节独立**：6 份环节规范各自可读，互不依赖
- **借鉴 OpenSpec 但不绑定**：吸收 specs/changes 二分、delta 格式、Scenario 写法；不安装 OpenSpec CLI

## 2. 完整状态机

```text
draft ──► approved ──► designed ──► in-progress ──► testing ──► ready-to-ship ──► shipped ──► archived
```

每个状态对应的产物与详细规则见各环节文档（§4 入口表）。

## 3. 状态切换条件汇总

| 当前状态 | 进入条件 | 切换到 | 切换动作 | 谁触发 |
|---|---|---|---|---|
| `draft` | change 目录创建 | `approved` | 用户口头说 approved；agent 改 STATUS.status + commit | 用户 |
| `approved` | proposal 全部 Open Questions 已答 | `designed` | design.md 完成；agent 改 STATUS + commit | agent (用户认可方向后) |
| `designed` | design.md 含完整方案、风险、备选 | `in-progress` | tasks.md 完成且用户认可拆解；agent 改 STATUS | agent |
| `in-progress` | tasks.md 全部 task 状态明确 | `testing` | 所有 task 状态=done；pnpm run build 通过 | agent |
| `testing` | test-plan.md 已起草 | `ready-to-ship` | 所有 TT 状态=pass | agent |
| `ready-to-ship` | release-notes.md 起草完成 | `shipped` | merge 到 main + 打 tag + 上传 release | agent (用户 approve PR 后) |
| `shipped` | git tag 已打 + 安装包已上传 | `archived` | 立即归档（无观察期） | agent |
| `archived` | change 文件夹已 mv 到 archive/ | 终态 | 改 STATUS.status + 最后一条 Log | agent |

## 4. 各环节文档入口

| 环节 | 文档 | 必备产物 |
|---|---|---|
| 1. 需求 | [01-requirements.md](01-requirements.md) | proposal.md |
| 2. 设计 | [02-design.md](02-design.md) | design.md（必要时含 ADR） |
| 3. 开发 | [03-development.md](03-development.md) | tasks.md + 代码 commits |
| 4. 测试 | [04-testing.md](04-testing.md) | test-plan.md |
| 5. 上线 | [05-release.md](05-release.md) | release-notes.md + git tag + 安装包 |
| 6. 归档 | [06-archive.md](06-archive.md) | retrospective.md + archive 目录 |

模板：`templates/` 下与产物同名。

## 5. 小需求简化路径（small change）

满足全部条件可走简化流程：

- 涉及 ≤ 1 个模块
- 预计 ≤ 1 天工作量
- 预计 ≤ 3 个文件改动
- 预计 ≤ 100 行 diff
- 不涉及数据库 / IPC / 启动流程的 schema 变更

简化做法：

| 字段 | 大需求 | 小需求 |
|---|---|---|
| `proposal.md` | 全字段 | 只填 Intent + Scope + 1 条 Requirement，10 行内 |
| `design.md` | 全字段 | **可省略**，并入 proposal 的"实现方式"段 |
| `tasks.md` | 完整拆解 | 1～3 个 task |
| `test-plan.md` | 完整测试计划 | 1～2 条手工 checklist |
| `release-notes.md` | 完整 | 必填，可一段话 |
| `STATUS.md` | 必填 | 必填 |
| 版本号 | minor 或 major | **patch** |

**重要**：agent 不能自行判定"小"。要走简化路径必须先在 proposal Q1 列出"是否走简化"由用户确认。

## 6. 工具中立性声明

流程数据的真源：

```
specs/                       # 流程数据（baseline / changes / archive）
docs/process/                # 流程规范（00-overview + 6 环节 + templates）
docs/PROJECT_GUIDE.md        # 项目特定知识
AGENTS.md                    # agent 入口（业界惯例，唯一真源）
```

各 agent 工具适配（symlink 同一份 AGENTS.md）：

```
CLAUDE.md                              # symlink → AGENTS.md
GEMINI.md                              # symlink → AGENTS.md
.cursorrules                           # symlink → AGENTS.md
.github/copilot-instructions.md        # symlink → ../AGENTS.md
```

Kiro 用户额外享有：

- `.kiro/steering/process.md` 自动加载流程总规范
- Kiro spec 机制可作为 `specs/changes/<slug>/` 的 UI 增强（不替代）

切换工具不影响流程，因为：

- 所有产物是 markdown
- 所有约束由 git commit / branch / tag 承载
- 没有任何工具特定的 schema 文件强制约束（Kiro 的 `.config.kiro` 不进归档）

## 7. 多端协作（后端引入路径预告）

当前仅 desktop。未来引入 backend 时：

- `specs/baseline/backend/` 启用，按 backend 模块（auth / api / worker 等）组织
- `specs/baseline/shared/` 放跨端契约（OpenAPI / proto / TS types）
- 跨端 change 走 `_cross` 模块，归档到 `specs/archive/_cross/<slug>/`
- `02-design.md` 的"Cross-stack Considerations"段在跨端 change 中必填
- 包结构未来重构为 monorepo（`apps/desktop/` + `services/<name>/` + `packages/<shared>/`），届时再开 _cross change 处理

**当前不做物理重构**，仅在 baseline 留 `backend/README.md` 与 `shared/README.md` 占位。

## 8. FAQ

**Q: 流程文档自身的修订也走流程吗？**
A: 走。每次修改 `docs/process/*` 都要开 change，slug 通常是 `process-<topic>`，归档到 `_cross/`。

**Q: 一个 change 跨多个模块怎么命名？**
A: 用 `_cross` 模块。slug 仍以日期开头。

**Q: 紧急 hotfix 也要走完整流程吗？**
A: 走简化路径（§5），但 release-notes.md 不能省略。hotfix 的 commit 类型必须是 `fix`。

**Q: 已归档的 change 发现遗漏怎么办？**
A: archive 只读。开新 change 引用旧 archive 路径，做修复或补充。

**Q: 单 commit 最大行数限制是多少？**
A: 300 行 diff。超出说明 task 没拆够，回 tasks.md 拆分。生成代码、迁移类除外但要在 commit message 注明。

**Q: 单测一定要写吗？**
A: 不一定。本项目方案 C：手工 + 单测并行，单测可选。但每个 spec 必须有手工 checklist（最少 1 条）。

**Q: STATUS.md 和 git branch / tag 哪个是真源？**
A: 文档里的字段是 agent 视角的真源；git tag 是发版动作的真源。两者必须一致。不一致时以 git tag 为准（因为 tag 不可改且推到了远程）。

## 9. 流程演进

本流程是活文档。任何 agent 或用户发现以下情况都应触发流程修订：

- 频繁出现"规范没覆盖到"的情况（>3 次）
- 某个状态切换条件实际无法满足
- 某个产物字段从来没人填过
- 工具中立性被破坏（出现工具特定文件混入流程数据）

修订方式：开 change，slug 例如 `process-add-rollback-spec`，归档到 `_cross/`。
