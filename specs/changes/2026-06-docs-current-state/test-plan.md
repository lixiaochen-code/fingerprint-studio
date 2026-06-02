# Test Plan: 2026-06-docs-current-state

## 1. Scope

验证 `docs/` 入口整理、历史 handoff 归档、archive 索引与 scripts baseline 状态校准。

## 2. Strategy

本次仅改文档，采用手工检查 + `pnpm run validate:specs`。不跑 `pnpm run build`，因为不改业务代码和类型文件。

## 3. Test Tasks

- [ ] **TT-01** specs 流程校验
  - method: 集成
  - linked-requirement: docs 当前入口可读 / 非规范历史文档进入 archive / scripts baseline 与当前实现一致
  - status: pass
  - executed-at: 2026-06-02
  - result: pass
  - evidence: `pnpm run validate:specs` → All checks passed

- [ ] **TT-02** 文档链接与关键词抽查
  - method: 手工
  - linked-requirement: 历史 handoff 不误导当前开发
  - status: pass
  - executed-at: 2026-06-02
  - result: pass
  - evidence: `rg` 抽查 docs 入口、archive handoff 索引、setQueue 状态描述；`test ! -d docs/handoffs` 通过

## 4. Out-of-band Verification

N/A：不涉及运行时行为。

## 5. Execution Log

- 2026-06-02 | test plan created
- 2026-06-02 | TT-01 pass (`pnpm run validate:specs`)
- 2026-06-02 | TT-02 pass (docs/handoffs/scripts baseline 关键词抽查)
- 2026-06-02 | scope expanded: TT-01/TT-02 reset for archive migration verification
- 2026-06-02 | TT-01 pass (`pnpm run validate:specs`, Archived: 11)
- 2026-06-02 | TT-02 pass (`docs/handoffs` absent; archive handoff bundle present)

## 6. Sign-off

- [x] 所有 TT 状态 = pass
- [x] 关联的开发 task 全部 done
- [ ] 进入 release 环节
