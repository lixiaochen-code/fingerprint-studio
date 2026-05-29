# Design: 建立 AI 驱动的开发流程与归档体系

## 1. Overview

把 proposal 描述的"建立流程 + 迁移历史"落到具体的目录结构、文件清单、模板内容、迁移步骤上。设计采用**最小可用 + 强约束**思路：

- 文件数量控制在必要最少（7 份规范 + 8 份模板 + 1 份 AGENTS.md + 各 agent symlink）
- 每份产物的字段强约束（见 03-development.md 模板）
- 工具中立通过纯 markdown + git + symlink 实现，不引入任何 CLI

## 2. Final Directory Layout

```
auto-registry/
├── AGENTS.md                              # 业界惯例 agent 入口（主文件，唯一真源）
├── CLAUDE.md                              # symlink → AGENTS.md
├── GEMINI.md                              # symlink → AGENTS.md
├── .cursorrules                           # symlink → AGENTS.md
├── .github/
│   └── copilot-instructions.md            # symlink → ../AGENTS.md
├── docs/
│   ├── CODING_STANDARDS.md                # 保留不动
│   ├── PROJECT_GUIDE.md                   # 新增（迁原 AGENT.md 项目部分）
│   ├── process/                           # 新增：流程规范
│   │   ├── 00-overview.md
│   │   ├── 01-requirements.md
│   │   ├── 02-design.md
│   │   ├── 03-development.md
│   │   ├── 04-testing.md
│   │   ├── 05-release.md
│   │   ├── 06-archive.md
│   │   └── templates/
│   │       ├── proposal.md
│   │       ├── design.md
│   │       ├── tasks.md
│   │       ├── test-plan.md
│   │       ├── release-notes.md
│   │       ├── retrospective.md
│   │       ├── STATUS.md
│   │       └── delta-spec.md
│   └── handoffs/                          # 新增：旧 handoff 归档地
│       └── 2026-05-*.md
├── specs/                                 # 新增：流程数据（工具中立）
│   ├── baseline/
│   │   ├── desktop/
│   │   │   ├── profiles/spec.md
│   │   │   ├── proxies/spec.md
│   │   │   ├── scripts/spec.md
│   │   │   ├── stealth/spec.md
│   │   │   └── kernel/spec.md
│   │   ├── backend/README.md              # 占位
│   │   └── shared/README.md               # 占位
│   ├── changes/                           # 进行中
│   └── archive/
│       ├── desktop/
│       │   ├── profiles/
│       │   ├── proxies/
│       │   ├── scripts/                   # 三个旧 spec 迁入
│       │   ├── stealth/
│       │   └── kernel/
│       ├── backend/                       # 暂空（仅 .gitkeep）
│       ├── shared/                        # 暂空（仅 .gitkeep）
│       └── _cross/                        # 含本次 bootstrap change 自身归档
├── electron/                              # 不动
├── src/                                   # 不动
├── apps/                                  # 暂不创建（未来 monorepo 重构时再建）
├── services/                              # 暂不创建
├── packages/                              # 暂不创建
├── AGENT.md                               # 删除（内容拆分到 AGENTS.md + PROJECT_GUIDE.md）
└── docs/specs/                            # 删除（迁完后）
```

## 3. AGENTS.md 内容设计

`AGENTS.md` 必须满足：
- 第一段就指向流程总规范
- 给"读到这份文件的 agent"提供最少必要信息：项目是什么、流程入口、项目知识入口、行为准则
- 控制在 ~100 行内

结构：

```markdown
# AGENTS.md

This file is the universal entry point for any AI coding agent working in this repository.
其他工具特定文件（CLAUDE.md / GEMINI.md / .cursorrules 等）均为本文件的符号链接。

## 1. 项目一句话
auto-registry 是 ...（与原 AGENT.md 第 1 节一致）

## 2. 必读三件套
按顺序读完才能动手：
1. 本文件
2. docs/process/00-overview.md  ← 开发流程总规范
3. docs/PROJECT_GUIDE.md        ← 项目特定知识（架构、技术约束、反检测策略等）

任何 change 还需要读 docs/CODING_STANDARDS.md。

## 3. 流程速记
- 所有需求走 specs/changes/<slug>/ 完整生命周期
- 状态机：draft → approved → designed → in-progress → testing → ready-to-ship → shipped → archived
- 详细规范在 docs/process/

## 4. AI Agent 行为准则（与现有 AGENT.md §11 一致）
1. 不自行引入新组件库或大体积依赖
2. 不凭记忆写路径
3. 不做"重构式"大改动
4. 不留注释版"以后用"代码
5. 不自动写新测试（除非用户要求）
6. 不悄悄修改规范
7. 默认中文回复

## 5. 工具适配
- Kiro 用户：.kiro/steering/process.md 自动加载流程总规范
- Cursor / Codex / Copilot / Gemini：通过 symlink 读到本文件
- 任何 agent 第一次进项目都从这里开始
```

## 4. PROJECT_GUIDE.md 内容设计

把现有 `AGENT.md` 中**项目知识相关**的部分搬过来（不再讲流程）：

- §2 目录总览（保留并补充 specs/）
- §3 Electron 进程模型速览（不动）
- §4 反检测策略约束（不动）
- §5 渲染层结构约定（不动）
- §6 做事前必读（更新为指向 process/）
- §7 做事后必验（不动）
- §8 技术栈硬约束（不动）
- §9 常用命令（不动）
- §10 文件命名规范（不动）
- §12 长期运行的子系统状态（更新路径到 specs/baseline/）

不复制 §1（项目一句话）—— 那部分进 AGENTS.md。
不复制 §11（AI Agent 行为准则）—— 那部分进 AGENTS.md。

## 5. 7 份流程规范文档结构

每份环节规范固定 9 节骨架：

```markdown
# 0X-<环节名>

## 1. 环节定位
（一句话）

## 2. 进入条件
- 前置环节状态
- 必须存在的产物

## 3. 必备产物
- 路径（含 templates/ 链接）

## 4. 操作流程（AI agent 视角）
（步骤 1...N）

## 5. 操作流程（人类视角）
（你需要做什么决定）

## 6. 验收标准
（什么算"做完了"）

## 7. 退出动作
- STATUS 怎么改
- git 怎么打标 / commit 怎么写
- Log 怎么追加

## 8. 反例与禁忌
（最多 5 条）

## 9. 与其他环节的接口
- 上一环节给我什么
- 我给下一环节什么
```

总规范 `00-overview.md` 不用上面骨架，独有结构：

```markdown
# 00-overview

## 1. 流程哲学（精简）
## 2. 完整状态机图
## 3. 状态切换条件汇总表
## 4. 各环节文档入口
## 5. 小需求简化路径（含阈值）
## 6. 工具中立性声明
## 7. 后端引入路径预告
## 8. FAQ
```

## 6. 状态机详细定义

| 状态 | 含义 | 进入条件 | 退出条件（→ 下个状态） | 留痕动作 |
|---|---|---|---|---|
| `draft` | 需求草稿，正在 Q&A | change 目录创建 | 用户口头说 approved | STATUS.Log 追加 |
| `approved` | 需求锁定 | proposal 全部 Open Questions 已回答 | design.md 完成且用户认可方向 | commit message: `docs(<slug>): proposal approved` |
| `designed` | 设计锁定 | design.md 含完整方案、风险、备选 | tasks.md 完成且用户认可拆解 | commit message: `docs(<slug>): design approved` |
| `in-progress` | 开发中 | tasks.md 全部 task 状态明确 | 所有 task 状态=done 且 build 通过 | 每个 task 完成时改 tasks.md + commit |
| `testing` | 测试中 | test-plan.md 已起草 | 所有 TT 状态=pass | test-plan.md 内 Execution Log 追加 |
| `ready-to-ship` | 待发版 | release-notes.md 起草完成 | merge 到 main 完成 | PR 描述完整 |
| `shipped` | 已发版 | git tag 已打 + 安装包已上传 | 立即归档（无观察期） | tag 推送 + GitHub Release |
| `archived` | 已归档 | change 文件夹已 mv 到 archive/<module>/<slug>/ | 终态 | 改 STATUS.status 字段 + 最后一条 Log |

## 7. Symlink 实现方案

**Unix/macOS**（项目主开发环境）：

```bash
ln -s AGENTS.md CLAUDE.md
ln -s AGENTS.md GEMINI.md
ln -s AGENTS.md .cursorrules
mkdir -p .github
ln -s ../AGENTS.md .github/copilot-instructions.md
```

**Git 配置**：

```bash
git config core.symlinks true     # 默认开，但 Windows 用户可能需要显式
```

在 `AGENTS.md` 末尾加一段 Windows fallback 提示：

> Windows users: if you cloned with symlinks disabled, run `pwsh -File scripts/sync-agent-files.ps1` to copy AGENTS.md content into the other entry files. We do not currently provide this script; will be added in a future change if needed.

## 8. 5 个 PR 拆分（即 tasks）

按依赖关系 + 可独立 review 拆分：

```
PR-1: 流程文档 + AGENTS.md 入口（不动旧文件）
PR-2: specs/ 目录骨架 + baseline 占位 README
PR-3: 迁移 docs/specs/anti-detection.md + scripting.md → specs/baseline/desktop/{stealth,scripts}/
PR-4: 迁移 .kiro/specs/global-scripts-* → specs/archive/desktop/scripts/
PR-5: 迁移 docs/specs/handoff-*.md → docs/handoffs/，删除空 docs/specs/
```

每个 PR 独立可合并到 main。但**实际推进按顺序**（PR-2 依赖 PR-1 的目录哲学落地，PR-3/4/5 依赖 PR-2 的目录骨架）。

每个 PR 的合并都用 GitHub merge commit（保留 PR 内的 task 级 commit）。

## 9. Migration Detail

### 9.1 baseline 重写策略

旧文档全文保留，**不改写**为严格 OpenSpec 格式。新 baseline 文件结构：

```markdown
# Baseline: <module>

## Current Capabilities

（高层 requirement 列表，OpenSpec 风格）

### Requirement: ...
...

## Legacy Design Document

（原 docs/specs/<module>.md 全文，作为附录）
```

这样：
- 新 change 的 delta 严格按 OpenSpec 格式写
- 历史细节零损失保留
- 后续 change 归档时把 delta 合并进 Current Capabilities 段

### 9.2 已归档 .kiro spec 的迁移

三个 spec 现状：

```
.kiro/specs/global-scripts-and-queues/{tasks.md}
.kiro/specs/global-scripts-phase-6-runtime/{requirements.md, design.md, tasks.md, .config.kiro}
.kiro/specs/global-scripts-profile-launch-close/{requirements.md, design.md, tasks.md, .config.kiro}
```

迁到：

```
specs/archive/desktop/scripts/2026-05-global-scripts-and-queues/
specs/archive/desktop/scripts/2026-05-phase-6-runtime/
specs/archive/desktop/scripts/2026-05-profile-launch-close/
```

每个目录补：
- `STATUS.md`（status=archived，标 legacy 来源）
- 不补造 test-plan / release-notes / retrospective（接受历史数据缺失）
- `.config.kiro` 不带（Kiro 工具特定，不属于工具中立产物）

### 9.3 handoff 文档迁移

直接 `git mv docs/specs/handoff-*.md docs/handoffs/`，不重命名、不改内容。
`docs/specs/test-checklist-2026-05-29.md` 也归到 `docs/handoffs/`。

### 9.4 旧目录清理

迁完后：
- `docs/specs/` → 删除（git rm）
- `.kiro/specs/global-scripts-*` → 删除（git rm）
- `.kiro/` 仅保留 `steering/`（Kiro 特定）

## 10. AGENT.md 拆分映射

| 原 AGENT.md 章节 | 去向 |
|---|---|
| 第 1 节 项目一句话 | AGENTS.md §1 |
| 第 2 节 目录总览 | PROJECT_GUIDE.md（更新加 specs/） |
| 第 3 节 Electron 进程模型 | PROJECT_GUIDE.md |
| 第 4 节 反检测策略约束 | PROJECT_GUIDE.md |
| 第 5 节 渲染层结构约定 | PROJECT_GUIDE.md |
| 第 6 节 做事前必读 | 拆：流程入口进 AGENTS.md，项目相关进 PROJECT_GUIDE.md |
| 第 7 节 做事后必验 | PROJECT_GUIDE.md（且 03-development.md 引用） |
| 第 8 节 技术栈硬约束 | PROJECT_GUIDE.md |
| 第 9 节 常用命令 | PROJECT_GUIDE.md |
| 第 10 节 文件命名规范 | PROJECT_GUIDE.md（且 03-development.md 引用） |
| 第 11 节 AI Agent 行为准则 | AGENTS.md §4 |
| 第 12 节 长期运行的子系统状态 | PROJECT_GUIDE.md（路径更新） |

## 11. .kiro/steering 适配

为不破坏现有 Kiro 用户体验，新建 `.kiro/steering/process.md`（fileMatch: always）：

```markdown
---
inclusion: always
---

# Process Steering

This repository follows a tool-neutral AI development process. The full specification lives at:

- `AGENTS.md` (tool-neutral entry, also linked as CLAUDE.md / GEMINI.md / .cursorrules)
- `docs/process/00-overview.md` (process overview)
- `docs/process/01-requirements.md` ... `06-archive.md` (per-phase specs)
- `docs/PROJECT_GUIDE.md` (project-specific knowledge)

When working on this repo, always start by reading those files.
```

这样 Kiro 用户的 agent session 自动加载，但流程的真源仍然是 `docs/process/`，与工具解耦。

## 12. 风险与缓解

| 风险 | 缓解 |
|---|---|
| 7 份规范 + 8 份模板一次写出，质量不齐 | 接受 v1，作为活文档迭代；后续每发现问题开新 change 修订 |
| symlink 在 git 里偶尔表现怪 | 用相对路径 symlink；提交前 `git ls-files -s` 确认 mode 是 120000（symlink） |
| 流程文档自身的修订是否要走流程 | 是；每次修改 `docs/process/*` 都要走 change 流程 |
| 已归档的 3 个 spec 信息缺失 | 在每份 archive STATUS.md 里明确标 `legacy: true` 字段 |
| 5 PR 实际推进时发现 baseline 重写比预期难 | 第 9.1 节已选最低成本方案（保留旧文档为附录） |
| AGENT.md 删除可能让用过它的 agent 找不到 | 第 1 个 PR 不删 AGENT.md，最后一个 PR 才删 |

## 13. Out of Scope（设计层面，与 proposal 一致 + 补充）

设计层面**不引入**：
- 任何脚本工具（同步 symlink 脚本、release notes 生成器等）
- CI / CD 配置
- pre-commit hook
- 自动化校验流程合规的 linter

这些都可作为后续 change。

## 14. 验收标准（与 proposal Requirements 对齐）

设计完成后必须满足：
- [ ] 5 个 PR 全部 merge 到 main
- [ ] 任一新 agent session 读 AGENTS.md → docs/process/00-overview.md 即可理解全流程
- [ ] `docs/specs/` 目录已删除
- [ ] `.kiro/specs/global-scripts-*` 已删除（保留 .kiro/steering/）
- [ ] AGENT.md 已删除，内容拆到 AGENTS.md + PROJECT_GUIDE.md
- [ ] `specs/archive/desktop/scripts/` 下有三个 legacy 归档
- [ ] `specs/baseline/desktop/{stealth,scripts}/spec.md` 内含 OpenSpec 风格的 Current Capabilities + Legacy 附录
- [ ] symlink 在 macOS 下正常工作（Windows 用户 fallback 写在 AGENTS.md）


## Revision Log

- 2026-05-29 | revision 1 | 用户授权将 bootstrap change 自身简化为单 PR（原 §8 规划 5 个独立 PR）。理由：本次是项目第一份 change，没有 CI、用户、团队，5 PR 的治理价值在 bootstrap 阶段为零；commit 级粒度已保留（每 task 一 commit）；docs/process/ 不修改，5 PR 仍是后续大 change 的默认建议。本次 change 走单 PR + merge commit 合并到 main。
- 2026-05-29 | revision 2 | T-14/T-15/T-19 合并删除时机：原计划 PR-3 仅迁移、PR-5 才删除原文件。改为迁移即删除，避免迁移后双份并存导致"哪个是真"的歧义。tasks.md 内任务描述同步更新。
- 2026-05-29 | revision 3 | T-15 scripts baseline Legacy 附录策略调整：原计划全文内联两份历史文档（共 ~690 行），调整为附录摘要 + 指向 git 历史 + 指向 PR-4 的 .kiro/specs/ 归档。理由：完整内联会让 baseline spec.md 超过 1500 行，影响 agent 读取效率；Current Capabilities 段已抽出 9 条 Requirement 覆盖关键能力；完整历史通过 git 与 archive 仍可达。anti-detection 因为是单文件 233 行，影响小，仍按原计划全文内联。
