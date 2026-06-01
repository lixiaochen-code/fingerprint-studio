# Proposal: 迁移历史文档到 baseline/archive

## 1. Intent

`2026-05-bootstrap-process` 建立流程框架时，scope 收窄到只做"流程文档 + 目录骨架 + agent 入口"，把历史文档迁移移出。本 change 接着做迁移，让仓库的"流程数据形态"完整就位：

- `docs/specs/*.md` 中的设计类文档抽到 `specs/baseline/desktop/<module>/spec.md`
- `docs/specs/handoff-*.md` 与 `test-checklist-*.md` 归到 `docs/handoffs/`
- `.kiro/specs/global-scripts-*` 三个旧结构 spec 迁到 `specs/archive/desktop/scripts/`
- 删除 `docs/specs/` 与 `AGENT.md`，让"真源"只在 `AGENTS.md` + `specs/`

## 2. Scope

**做**：

- 迁移 `docs/specs/anti-detection.md` → `specs/baseline/desktop/stealth/spec.md`（OpenSpec Current Capabilities + Legacy 附录）
- 迁移 `docs/specs/scripting.md` + `global-scripts-and-queues.md` → `specs/baseline/desktop/scripts/spec.md`（合并 + Current Capabilities + Legacy 附录）
- 迁移 `docs/specs/handoff-*.md`（8 个） + `test-checklist-2026-05-29.md` + `scripting-handoff.md` → `docs/handoffs/`
- 迁移 `.kiro/specs/global-scripts-and-queues/`、`global-scripts-phase-6-runtime/`、`global-scripts-profile-launch-close/` → `specs/archive/desktop/scripts/2026-05-<slug>/`，加 STATUS.md (legacy=true)
- 删除原 `docs/specs/` 目录、`.kiro/specs/global-scripts-*` 目录、根目录 `AGENT.md`

**不做**：

- 不为 legacy archive 补造 test-plan / release-notes / retrospective（接受历史数据缺失）
- 不重写 baseline 为严格 OpenSpec delta 格式（仅抽 Current Capabilities，全文作为 Legacy 附录）
- 不动业务代码、不动 docs/CODING_STANDARDS.md、不动 docs/PROJECT_GUIDE.md（PROJECT_GUIDE 中指向 specs/baseline/* 的路径在迁移完成后即可链通，无需修改）
- 不引入新工具、不改流程规范（流程已在 bootstrap 里定义）

## 3. Approach

参照已归档的 `specs/archive/_cross/2026-05-bootstrap-process/design.md` §9 中的迁移策略（Legacy 附录 + Current Capabilities 抽取），但**简化**：

- baseline 文件不重写为完整 OpenSpec 风格，先抽 3-5 条核心 Requirement，剩下作为附录；后续 change 触及对应模块时按需补完
- archive 三个 .kiro spec 的 STATUS.md 用统一模板，标 `legacy: true`，不补造 test/release/retro
- handoff 文件保持原样 git mv，不改名不改内容

## 4. Affected Scopes

| 范围 | 影响 |
|---|---|
| 端 | desktop |
| 模块 | _cross（跨多个模块的迁移行为，本身不属任何业务模块） |
| 代码 | 不动业务代码 |
| 现有文档 | docs/specs/ 全部迁出，目录删除；.kiro/specs/global-scripts-* 全部迁出，目录删除；AGENT.md 删除 |

## 5. Requirements

### Requirement: baseline spec.md 就位

迁移完成后，`specs/baseline/desktop/stealth/spec.md` 与 `specs/baseline/desktop/scripts/spec.md` 必须存在，且各含 OpenSpec Current Capabilities 段（至少 3 条 Requirement）+ Legacy Design Document 附录。

#### Scenario: stealth baseline 含三轨架构能力
- GIVEN 迁移完成
- WHEN 任意 agent 读 `specs/baseline/desktop/stealth/spec.md`
- THEN 看到 Current Capabilities 段含至少 5 条 Requirement（三轨架构 / nativeToString / patch toggle / rebrowser / targetOs）
- AND 末尾 Legacy Design Document 附录含原 anti-detection.md 全文

#### Scenario: scripts baseline 合并两份历史文档
- GIVEN 迁移完成
- WHEN 任意 agent 读 `specs/baseline/desktop/scripts/spec.md`
- THEN 看到 Current Capabilities 段含脚本生命周期、SDK、scope、profile.id、queue、main(args)、runScript、PROFILE_BUSY 等 Requirement
- AND Legacy 附录引用原 scripting.md + global-scripts-and-queues.md（可全文内联或指向 git 历史）

### Requirement: archive 三个 legacy spec 就位

`.kiro/specs/global-scripts-*` 三个 spec 整体 mv 到 `specs/archive/desktop/scripts/2026-05-<slug>/`，每个目录含原文件 + 新增 STATUS.md (legacy=true)。

#### Scenario: 不携带 .config.kiro
- GIVEN 迁移完成
- WHEN ls 任一 archive 目录
- THEN 不含 .config.kiro（Kiro 工具特定文件）

#### Scenario: STATUS 标 legacy
- GIVEN 任一 archive 目录
- WHEN cat STATUS.md
- THEN 含 `legacy: true` + `migrated-from:` + `migrated-at:` 字段

### Requirement: handoff 全部归位

10 个 handoff / test-checklist 文件 mv 到 `docs/handoffs/`，原内容不改。

#### Scenario: 文件清单完整
- GIVEN 迁移完成
- WHEN ls docs/handoffs/
- THEN 含原 docs/specs/handoff-*.md（8 个）+ scripting-handoff.md + test-checklist-2026-05-29.md

### Requirement: 旧目录与文件清理

迁移完成后，原位置的目录与文件不再存在。

#### Scenario: docs/specs 已删
- GIVEN 迁移完成
- WHEN ls docs/
- THEN 不含 specs/ 目录

#### Scenario: AGENT.md 已删
- GIVEN 迁移完成
- WHEN ls 项目根
- THEN 不含 AGENT.md（流程入口完全交给 AGENTS.md）

#### Scenario: .kiro/specs/global-scripts-* 已删
- GIVEN 迁移完成
- WHEN ls .kiro/
- THEN 仅剩 steering/（Kiro 工具特定）+ specs/（如还有其他 Kiro 自创内容则保留）

## 6. Constraints

- 全程不动业务代码（`electron/`、`src/`）
- 全程不引入新依赖
- 单 PR 合并到 main（沿用 bootstrap-process 的实践）
- baseline / archive 内容**只追加，不重写**业务能力描述（避免引入新决策）
- 历史 handoff 不重命名、不改内容

## 7. Risks

| 风险 | 影响 | 缓解 |
|---|---|---|
| baseline Current Capabilities 抽得不准，遗漏关键能力 | 后续 agent 误读现状 | 接受 v1 不完美；新 change 触及该模块时通过 delta 补完 |
| `git mv` 在某些情况下不被识别为 rename（变成 add/delete） | git 历史断裂 | 单 commit + 不动文件内容；mv 后立刻 status 检查 |
| AGENT.md 删除后某些工具的旧 cache 仍指向它 | 短期混淆 | AGENTS.md 已早建立，工具应已重新加载；删除后不可逆，但风险低 |
| handoff 中含敏感信息（agent 历史决策细节） | 公开仓库时暴露 | 本 change 不公开仓库；如未来公开走单独 change |

## 8. Out of Scope

- 不公开仓库
- 不清理 git 历史中的敏感数据
- 不重写历史文档为新格式（保留为附录）
- 不为 legacy archive 补造 test/release/retro
- 不修改 docs/CODING_STANDARDS.md
- 不动业务代码
- 不修改 docs/process/ 流程规范

## 9. Open Questions

无。proposal scope 直接继承 bootstrap-process 的"迁移路线图"，所有决策已在那里讨论清楚。

## Conversation Log

- 2026-06-01 | initial draft + approved | 用户授权"继续都做完"，含本 change + 改名 sync change 两个连续动作。继承 bootstrap-process retrospective §6 的子 change 路线图，无需重新 Q&A
