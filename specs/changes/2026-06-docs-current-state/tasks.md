# Tasks: 2026-06-docs-current-state

> Continue From: TT-01/TT-02 重跑验证。
> Last updated: 2026-06-02 by Codex

## Conventions

- Status: `todo` | `in-progress` | `done` | `blocked`
- 一个 task 一个 commit (commit message 含 `[task: T-NN]`)
- TT-NN 是测试任务编号，定义在 test-plan.md

## Phase 1: 文档入口整理

- [x] **T-01** 新增 docs/README.md
  - status: done
  - commit:
  - files: docs/README.md
  - verify: 入口能说明当前真源、历史文档定位与推荐阅读顺序。

- [x] **T-02** 新增 handoff 索引
  - status: done
  - commit:
  - files: specs/archive/_cross/2026-05-legacy-handoffs/handoffs/README.md
  - verify: 每份 handoff 有简要用途，索引明确“历史背景，不作当前真源”。

## Phase 2: 状态校准

- [x] **T-03** 校准 PROJECT_GUIDE 过期提示
  - status: done
  - commit:
  - files: docs/PROJECT_GUIDE.md
  - verify: 不再声称 proxies baseline 尚未抽出；baseline 路径提示符合当前文件存在状态。

- [x] **T-04** 校准 scripts baseline 的队列能力
  - status: done
  - commit:
  - files: specs/baseline/desktop/scripts/spec.md
  - verify: `profiles.setQueue` / onCreateQueue / onLaunchQueue 被标为 Roadmap 待办，而非 Current Capabilities。

## Phase 3: 历史文档归档

- [x] **T-05** 归档 docs/handoffs
  - status: done
  - commit:
  - files: specs/archive/_cross/2026-05-legacy-handoffs/
  - verify: `docs/handoffs/` 不存在；归档目录含 STATUS.md、README.md 与 handoffs/ 原文。

- [x] **T-06** 更新 docs 入口引用
  - status: done
  - commit:
  - files: docs/README.md, docs/PROJECT_GUIDE.md
  - verify: 不再引用 `docs/handoffs/`，改指向 archive 路径。

## Test Tasks (TT)

- TT-01: validate:specs
- TT-02: 文档链接与关键词抽查
