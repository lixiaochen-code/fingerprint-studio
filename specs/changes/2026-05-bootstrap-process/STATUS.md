# STATUS

- slug: 2026-05-bootstrap-process
- module: _cross
- type: process
- status: testing
- branch: change/_cross/2026-05-bootstrap-process
- created-at: 2026-05-29
- last-updated: 2026-06-01

## Log

- 2026-05-29 | created (status=draft) | bootstrap change initialized as the project's first formal change, will define the AI development process itself
- 2026-05-29 | proposal v2 (status=approved) | user delegated decisions on Q1-Q7 to agent's recommendations; proposal locked, entering design phase
- 2026-05-29 | design v1 (status=designed) | directory layout, 7 spec docs structure, state machine, 5-PR breakdown, AGENT.md split mapping, migration detail finalized
- 2026-05-29 | tasks.md ready (status=in-progress) | 21 tasks across 5 phases, starting T-01
- 2026-05-29 | scope reduced (proposal v3 / design rev 4) | 用户指令"先定义规范文档，迁移后面做"。T-14 ~ T-21、TT-03 ~ TT-05 移到新 change `2026-05-migrate-legacy-docs`。本 change 进入 Phase 6 测试与发版。
- 2026-06-01 | all dev tasks done (status=testing) | T-01..T-13、TT-01、TT-02 全部 pass；规范文档 + 目录骨架 + agent 入口建立完毕；起草 test-plan.md 进入 testing

## State Machine

draft → approved → designed → in-progress → testing → ready-to-ship → shipped → archived

## Continue From

执行 test-plan.md 中的 spec-level TT，验证流程文档被新 agent 正确加载、状态机自洽、目录骨架一致。
