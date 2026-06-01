# STATUS

- slug: 2026-06-build-resilience
- module: kernel
- type: fix
- status: ready-to-ship
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

## State Machine

draft → approved → designed → in-progress → testing → ready-to-ship → shipped → archived

## Continue From

bump v0.1.6，merge to main，tag，CHANGELOG，归档（desktop/kernel）。dist:mac 已实测产出 0.1.5 产物，发版时按 0.1.6 重出即可（或直接 tag，应用代码无变化）。
