# Test Plan: <change-slug>

> 模板使用说明：本文件覆盖 spec 整体（端到端）测试。task 自带的单点 verify 写在 tasks.md。

## 1. Scope
（这次测什么；对应 proposal 的哪些 Requirement / Scenario）

## 2. Strategy
（说明手工 vs 单测的取舍；本项目方案 C：手工 + 单测并行）

## 3. Test Tasks

- [ ] **TT-01** <test-title>
  - method: 手工 / 单测 / 集成
  - linked-requirement: proposal §5 Requirement: <name>
  - status: todo
  - executed-at: 
  - result: 
  - evidence: <screenshot-path-or-log-snippet>

- [ ] **TT-02** ...

## 4. Out-of-band Verification
（不属于 TT 但仍要做的事，例如 turnstile 自检、内存峰值监测）

## 5. Execution Log
> 每次执行追加；fail → retest 全部留下，不删历史。

- YYYY-MM-DD HH:MM | TT-01 pass
- YYYY-MM-DD HH:MM | TT-02 fail (现象简述) → 开 fix task T-NN
- YYYY-MM-DD HH:MM | TT-02 retest pass

## 6. Sign-off
- [ ] 所有 TT 状态 = pass
- [ ] 关联的开发 task 全部 done
- [ ] pnpm run build 通过
- [ ] 进入 release 环节
