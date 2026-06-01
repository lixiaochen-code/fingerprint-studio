# STATUS

- slug: 2026-06-build-resilience
- module: kernel
- type: fix
- status: archived
- branch: change/kernel/2026-06-build-resilience
- created-at: 2026-06-01
- last-updated: 2026-06-01

## Log

- 2026-06-01 | created (status=draft) | spin-off from fix-x64-build retrospective; automate electron cache SHA verify + repair
- 2026-06-01 | approved | user accepted recommendation; no open questions
- 2026-06-01 | designed | zero-dep node script, dist:check prefixed to dist:*, default delete-corrupt mode
- 2026-06-01 | in-progress | starting T-01
- 2026-06-01 | all dev done (status=testing) | T-01..T-03 done
- 2026-06-01 | all tests pass (status=ready-to-ship) | TT-01..TT-04 pass; 三模式行为符合设计；dist:mac 端到端 4 产物 VALID
- 2026-06-01 | shipped v0.1.6 (status=shipped) | merge to main; tag v0.1.6 (tag push 因弱网重试一次); 4 mac 产物已构建 VALID; CHANGELOG updated
- 2026-06-01 | archived | retrospective written; moved to specs/archive/desktop/kernel/. **READ-ONLY hereafter.**

## State Machine

draft → approved → designed → in-progress → testing → ready-to-ship → shipped → archived

## Continue From

终态。已归档，**只读**。
