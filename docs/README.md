# Docs Guide

> `docs/` 是当前规范与项目指南入口；流程数据、业务规格与历史归档的真源在 `specs/`。
> 如果文档之间出现冲突，优先级为：`AGENTS.md` → `docs/process/` → `specs/baseline/` → `specs/archive/` → 当前代码。

## 当前必读

| 文件 | 用途 |
|---|---|
| [`../AGENTS.md`](../AGENTS.md) | 所有 agent 的入口规则、项目一句话、工作流程要求 |
| [`process/00-overview.md`](process/00-overview.md) | change 生命周期总规范 |
| [`PROJECT_GUIDE.md`](PROJECT_GUIDE.md) | 项目架构、Electron IPC、反检测策略、常用命令 |
| [`CODING_STANDARDS.md`](CODING_STANDARDS.md) | 代码规范与改动前后检查清单 |

## 规格真源

当前规格不放在 `docs/`，而是在 `specs/`：

| 目录 | 含义 |
|---|---|
| [`../specs/baseline/`](../specs/baseline) | 当前能力真源。新 change 通过 delta 修改这里 |
| [`../specs/changes/`](../specs/changes) | 正在进行的 change |
| [`../specs/archive/`](../specs/archive) | 已完成 change 的历史记录 |

注意：

- `specs/baseline/desktop/scripts/spec.md` 与 `specs/baseline/desktop/stealth/spec.md` 已从历史设计迁移而来。
- `profiles` / `proxies` / `kernel` baseline 仍有 TBD 段；下一次触及对应模块时应补齐 Current Capabilities。
- 历史 handoff 已归档到 `specs/archive/_cross/2026-05-legacy-handoffs/`，不再放在 `docs/`。

## 历史 Handoff

[`../specs/archive/_cross/2026-05-legacy-handoffs/`](../specs/archive/_cross/2026-05-legacy-handoffs) 保存 2026-05 项目改造期间的交接包。它们很有价值，但阅读时要先看 [`handoffs/README.md`](../specs/archive/_cross/2026-05-legacy-handoffs/handoffs/README.md)：

- 旧 handoff 中的“未完成 / 未手测 / 分支未合并”可能已被后续 change 解决。
- 旧路径如 `docs/specs/*`、`AGENT.md` 可能已经迁移到 `specs/baseline/*`、`AGENTS.md`。
- 不要直接按 handoff 改代码；先用当前代码和 `specs/` 复核。

## 开发前速查

1. 读 `AGENTS.md`、`docs/process/00-overview.md`、`docs/PROJECT_GUIDE.md`。
2. 查 `specs/changes/` 是否已有正在进行的 change。
3. 查对应模块的 `specs/baseline/<端>/<module>/spec.md`。
4. 若要改代码，再读 `docs/CODING_STANDARDS.md` 和将要修改的文件。
5. 改动后至少跑 `pnpm run validate:specs`；代码改动还要跑 `pnpm run build`。
