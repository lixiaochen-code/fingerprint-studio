# STATUS

- slug: 2026-05-bootstrap-process
- module: _cross
- type: process
- status: in-progress
- branch: change/_cross/2026-05-bootstrap-process
- created-at: 2026-05-29
- last-updated: 2026-05-29

## Log

- 2026-05-29 | created (status=draft) | bootstrap change initialized as the project's first formal change, will define the AI development process itself
- 2026-05-29 | proposal v2 (status=approved) | user delegated decisions on Q1-Q7 to agent's recommendations; proposal locked, entering design phase
- 2026-05-29 | design v1 (status=designed) | directory layout, 7 spec docs structure, state machine, 5-PR breakdown, AGENT.md split mapping, migration detail finalized
- 2026-05-29 | tasks.md ready (status=in-progress) | 21 tasks across 5 phases, starting T-01

- 2026-05-29 | scope reduced (proposal v3 / design rev 4) | 用户指令"先定义规范文档，迁移后面做"。T-14 ~ T-21、TT-03 ~ TT-05 移到新 change `2026-05-migrate-legacy-docs`。本 change 进入 Phase 6 测试与发版。

## State Machine

draft → approved → designed → in-progress → testing → ready-to-ship → shipped → archived

## Continue From

起草 test-plan.md，进入 testing 阶段。
