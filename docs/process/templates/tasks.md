# Tasks: <change-slug>

> Continue From: T-NN <description>
> Last updated: YYYY-MM-DD by <machine-or-author>

## Conventions

- Status: `todo` | `in-progress` | `done` | `blocked`
- 一个 task 一个 commit (commit message 含 `[task: T-NN]`)
- 任务超阈值（>1 天 / >5 文件 / >300 行）必须拆
- TT-NN 是测试任务编号，定义在 test-plan.md

## Phase 1: <phase-name>

- [ ] **T-01** <task-title>
  - status: todo
  - commit: 
  - files: <comma-separated-paths>
  - verify: <how-to-verify-this-single-task>
  - note: <optional-notes-or-blockers>

## Phase 2: <phase-name>

- [ ] **T-NN** <task-title>
  - status: todo
  - commit: 
  - files: 
  - verify: 

## Test Tasks (TT)

> 测试任务的进度同步在 test-plan.md。这里只列编号方便 grep。
- TT-01: ...
- TT-02: ...
