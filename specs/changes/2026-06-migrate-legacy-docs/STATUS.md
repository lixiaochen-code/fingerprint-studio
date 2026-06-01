# STATUS

- slug: 2026-06-migrate-legacy-docs
- module: _cross
- type: process
- status: ready-to-ship
- branch: change/_cross/2026-06-migrate-legacy-docs
- created-at: 2026-06-01
- last-updated: 2026-06-01

## Log

- 2026-06-01 | created (status=draft) | spin-off from 2026-05-bootstrap-process retrospective §6
- 2026-06-01 | approved | inherited from bootstrap; user batch authorization
- 2026-06-01 | designed | 4-phase plan
- 2026-06-01 | in-progress | T-01 start
- 2026-06-01 | all dev done (status=testing) | T-01..T-08 done; entering testing
- 2026-06-01 | all tests pass (status=ready-to-ship) | TT-01, TT-02 全 pass

## State Machine

draft → approved → designed → in-progress → testing → ready-to-ship → shipped → archived

## Continue From

起草 release-notes，bump version 0.1.1 → 0.1.2，本地 merge to main（用户授权简化为本地 merge），打 tag v0.1.2，构建 mac，归档。
