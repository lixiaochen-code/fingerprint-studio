# Proposal: 整理 docs 当前状态入口

## 1. Intent

`docs/` 里同时存在当前规范、项目指南和多份历史 handoff。历史文档保留了关键决策，但其中一些“待办 / 未手测 / 路径”已经被当前代码或 `specs/archive` 覆盖，容易让接手 agent 把旧状态当成当前状态。

本 change 目标是把 `docs/` 整理为“只保留当前规范入口，历史材料进入 `specs/archive` 且可查但不误导”的状态。

## 2. Scope

做：
- 新增 `docs/README.md`，说明当前文档真源与推荐阅读顺序。
- 将 `docs/handoffs/` 归档到 `specs/archive/_cross/2026-05-legacy-handoffs/`。
- 在归档目录保留 handoff 索引，给历史交接包分类并标明其历史性质。
- 修正 `docs/PROJECT_GUIDE.md` 中已过期的 baseline / proxies 提示。
- 校准 `specs/baseline/desktop/scripts/spec.md` 中与当前实现不一致的队列能力描述。

不做：
- 不改业务代码。
- 不重写历史 handoff 正文，只迁移位置并增加归档说明。
- 不补全所有 TBD baseline；只处理这次整理中确认会误导接手者的 scripts 队列描述。

## 3. Approach

用最小文档增量建立导航层：当前真源放在 `docs/README.md`；历史 handoff 进入 `specs/archive/_cross/2026-05-legacy-handoffs/`，通过索引解释“可查背景，不作当前状态真源”；baseline 只做必要校准。

## 4. Affected Scopes

| 范围 | 影响 |
|---|---|
| 端 | shared |
| 模块 | _cross / scripts |
| 代码 | 不动业务代码 |

## 5. Requirements

### Requirement: docs 当前入口可读

接手者进入 `docs/` 后，应能快速判断哪些文件是当前真源，哪些文件是历史背景。

#### Scenario: 新 agent 阅读 docs
- GIVEN agent 打开 `docs/README.md`
- WHEN 查找项目规范、流程、历史 handoff 的用途
- THEN 能看到明确的阅读顺序和真源说明

### Requirement: 历史 handoff 不误导当前开发

handoff 归档必须说明旧交接包的历史性质，并指出当前状态以 `specs/baseline`、`specs/archive` 和代码为准。

#### Scenario: 阅读旧 handoff
- GIVEN handoff 中出现“未完成 / 未手测 / 分支未合并”
- WHEN 接手者查看 `specs/archive/_cross/2026-05-legacy-handoffs/handoffs/README.md`
- THEN 知道需要用当前代码和 `specs/` 复核，而不是直接按旧状态行动

### Requirement: 非规范历史文档进入 archive

`docs/` 不应继续承载历史交接包；这些文件应归档到 `specs/archive/`，并用 legacy STATUS 标明来源。

#### Scenario: 查看 docs 顶层
- GIVEN 文档整理完成
- WHEN 列出 `docs/`
- THEN 只看到当前规范、项目指南、编码规范和流程文档
- AND 不再有 `docs/handoffs/`

#### Scenario: 查看 archive
- GIVEN 历史 handoff 已迁移
- WHEN 打开 `specs/archive/_cross/2026-05-legacy-handoffs/STATUS.md`
- THEN 能看到 `legacy: true`、`migrated-from: docs/handoffs/` 和归档说明

### Requirement: scripts baseline 与当前实现一致

scripts baseline 不应把未实现的 profile 队列能力写成 Current Capabilities。

#### Scenario: 查找 profiles.setQueue 状态
- GIVEN 当前 SDK 中 `profiles.setQueue` 仍返回 `GLOBAL_NOT_IMPL_YET`
- WHEN 接手者阅读 scripts baseline
- THEN 能看到队列能力是 Roadmap / 待办，而不是已实现能力

## 6. Constraints

- 遵守 `docs/CODING_STANDARDS.md` 与 `docs/process/`。
- 历史 handoff 正文只读，不做大规模改写。
- 不引入新依赖。

## 7. Risks

| 风险 | 影响 | 缓解 |
|---|---|---|
| 误删历史上下文 | 后续难以追溯决策 | 用 `git mv` 迁移到 archive，不删除 handoff 正文 |
| baseline 校准过度 | 把未来设计误删 | 保留队列能力到 Roadmap，并说明 `setQueue` 当前占位 |

## 8. Out of Scope

- 完整补齐 profiles / proxies / kernel 的 TBD baseline。
- 反检测 Phase 3 实现。
- 脚本 Dev Server / 模板市场实现。
- 清理所有历史文档中的旧路径引用。

## 9. Open Questions

无。本次为文档整理，范围仅限当前状态校准。

## Conversation Log

- 2026-06-02 | initial draft | 用户要求“按照现有规范，将文档整理一下”。本 change 作为跨模块文档整理启动。
