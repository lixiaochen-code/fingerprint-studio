# Tasks: 2026-06-migrate-legacy-docs

> Continue From: T-07 not started (T-01..T-06 done; Phase 3 complete)
> Last updated: 2026-06-01 by initial-author

## Conventions

- Status: `todo` | `in-progress` | `done` | `blocked`
- 一个 task 一个 commit (commit message 含 `[task: T-NN]`)
- 迁移类 task 行数可超 300 行，commit message 加 `[migration]` 标记

## Phase 1: baseline 内容迁移

- [x] **T-01** 创建 specs/baseline/desktop/stealth/spec.md（迁 anti-detection.md）
  - status: done
  - commit: (this commit)
  - files: specs/baseline/desktop/stealth/spec.md (new); 删除 docs/specs/anti-detection.md
  - verify: 含 Current Capabilities 段≥5 条 Requirement；Legacy Design Document 附录全文内联

- [x] **T-02** 创建 specs/baseline/desktop/scripts/spec.md（合并 scripting.md + global-scripts-and-queues.md）
  - status: done
  - commit: (this commit)
  - files: specs/baseline/desktop/scripts/spec.md (new); 删除 docs/specs/scripting.md + global-scripts-and-queues.md
  - verify: 含 Current Capabilities 段≥7 条 Requirement（实际 10 条）；Legacy 附录采用摘要+引用 git 历史/archive 形式（避免文件超 1500 行）

## Phase 2: archive 历史迁移

- [x] **T-03** 迁移 .kiro/specs/global-scripts-and-queues → archive
  - status: done
  - commit: (this commit)
  - files: git mv 整目录 → specs/archive/desktop/scripts/2026-05-global-scripts-and-queues/；新增 STATUS.md (legacy=true)；删除 archive/desktop/scripts/.gitkeep
  - verify: 目录到位；STATUS.md 标 legacy

- [x] **T-04** 迁移 .kiro/specs/global-scripts-phase-6-runtime → archive
  - status: done
  - commit: (this commit)
  - files: git mv → specs/archive/desktop/scripts/2026-05-phase-6-runtime/；删 .config.kiro；新增 STATUS.md
  - verify: 目录到位；不含 .config.kiro

- [x] **T-05** 迁移 .kiro/specs/global-scripts-profile-launch-close → archive
  - status: done
  - commit: (this commit)
  - files: git mv → specs/archive/desktop/scripts/2026-05-profile-launch-close/；删 .config.kiro；新增 STATUS.md
  - verify: 目录到位；不含 .config.kiro

## Phase 3: handoff 迁移

- [x] **T-06** 迁移 docs/specs/handoff-*.md + scripting-handoff.md + test-checklist → docs/handoffs/
  - status: done
  - commit: (this commit)
  - files: 10 个 git mv（其中 8 个 handoff- 前缀去掉、scripting-handoff.md 改名 scripting.md、test-checklist 保持原名）
  - verify: docs/handoffs/ 含 10 个文件；docs/specs/ 已空

## Phase 4: 旧目录与 AGENT.md 清理

- [ ] **T-07** 删除空 docs/specs/ 目录
  - status: todo
  - commit: 
  - files: rmdir docs/specs/（迁完应已空）
  - verify: ls docs/ 不见 specs/

- [ ] **T-08** 删除根 AGENT.md
  - status: todo
  - commit: 
  - files: rm AGENT.md
  - verify: ls 项目根不见 AGENT.md

## Phase 5: 测试与发版

- [ ] **TT-01** spec-level 端到端验证
  - status: todo
  - method: 手工
  - linked-requirement: proposal §5 全部 Requirement
  - verify: ls 检查 baseline / archive / handoffs 全部就位；ls 验证旧位置不存在；模拟 agent 流程读 AGENTS.md → docs/process/ → specs/baseline/desktop/{stealth,scripts}/ 通顺
  - executed-at: 
  - result: 
  - evidence: 

- [ ] **TT-02** pnpm run build 通过
  - status: todo
  - method: 自动
  - verify: exit 0
  - executed-at: 
  - result: 
  - evidence: 
