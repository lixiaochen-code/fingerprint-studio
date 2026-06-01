# STATUS

- slug: 2026-05-bootstrap-process
- module: _cross
- type: process
- status: archived
- branch: change/_cross/2026-05-bootstrap-process (merged via PR #2)
- created-at: 2026-05-29
- last-updated: 2026-06-01

## Log

- 2026-05-29 | created (status=draft) | bootstrap change initialized as the project's first formal change, will define the AI development process itself
- 2026-05-29 | proposal v2 (status=approved) | user delegated decisions on Q1-Q7 to agent's recommendations; proposal locked, entering design phase
- 2026-05-29 | design v1 (status=designed) | directory layout, 7 spec docs structure, state machine, 5-PR breakdown, AGENT.md split mapping, migration detail finalized
- 2026-05-29 | tasks.md ready (status=in-progress) | 21 tasks across 5 phases, starting T-01
- 2026-05-29 | scope reduced (proposal v3 / design rev 4) | 用户指令"先定义规范文档，迁移后面做"。T-14 ~ T-21、TT-03 ~ TT-05 移到新 change `2026-05-migrate-legacy-docs`。本 change 进入 Phase 6 测试与发版。
- 2026-06-01 | all dev tasks done (status=testing) | T-01..T-13、TT-01、TT-02 全部 pass；规范文档 + 目录骨架 + agent 入口建立完毕；起草 test-plan.md 进入 testing
- 2026-06-01 | all tests pass (status=ready-to-ship) | TT-A1..TT-A10 全 pass（含 build），spec-level 验证完成
- 2026-06-01 | shipped v0.1.1 (status=shipped) | PR #2 merged to main (merge commit 006d844); tag v0.1.1 pushed; 4 mac installers built (arm64+x64 dmg/zip, hdiutil VALID); CHANGELOG updated
- 2026-06-01 | archived (status=archived) | retrospective written; moved to specs/archive/_cross/2026-05-bootstrap-process/. **READ-ONLY hereafter.**

## State Machine

draft → approved → designed → in-progress → testing → ready-to-ship → shipped → archived

## Continue From

终态。本 change 已归档，**只读**。任何后续修改请开新 change 引用此归档路径。
