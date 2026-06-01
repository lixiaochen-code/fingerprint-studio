# Test Plan: 2026-06-migrate-legacy-docs

## 1. Scope

验证 proposal §5 全部 Requirement：baseline 抽取就位、archive 归档就位、handoff 全部到位、旧位置已清理。

## 2. Strategy

手工 only：本 change 仅文档迁移，无运行时逻辑可单元测试。所有 TT 用 ls / grep / find 验证。

## 3. Test Tasks

### TT-01 spec-level 端到端验证

- method: 手工
- linked-requirement: proposal §5 全部 5 条 Requirement
- status: pass
- 步骤:
  1. `grep -c "^### Requirement:" specs/baseline/desktop/stealth/spec.md` ≥ 5
  2. `grep -c "^### Requirement:" specs/baseline/desktop/scripts/spec.md` ≥ 7
  3. `ls specs/archive/desktop/scripts/` 含 3 个 2026-05-* 子目录，每个含 STATUS.md (legacy=true)
  4. `find specs/archive/desktop/scripts -name ".config.kiro"` 为空
  5. `ls docs/handoffs/ | wc -l` = 10
  6. `ls docs/` 不含 specs/
  7. `[ -f AGENT.md ]` 失败（AGENT.md 已不存在）
  8. `ls .kiro/` 仅含 steering/
- executed-at: 2026-06-01 10:50
- result: pass
  - stealth baseline: 7 Requirements
  - scripts baseline: 10 Requirements
  - 3 legacy archives 含 STATUS.md (legacy=true)，无 .config.kiro
  - docs/handoffs/ 10 文件
  - docs/specs/ 已删
  - AGENT.md 已删
  - .kiro/specs/ 已删（仅剩 steering/）
- evidence: ls / grep 输出已记录于本 change git history

### TT-02 build pass

- method: 自动
- linked-requirement: 03-development §6
- status: pass
- 步骤: `pnpm run build`
- executed-at: 2026-06-01 10:51
- result: pass — built in 22.67s, exit 0
- evidence: pnpm 输出已记录

## 4. Out-of-band Verification

无。

## 5. Execution Log

- 2026-06-01 10:50 | TT-01 pass
- 2026-06-01 10:51 | TT-02 pass

## 6. Sign-off

- [x] TT-01, TT-02 全部 pass
- [x] pnpm run build 通过
- [x] 进入 release 环节
