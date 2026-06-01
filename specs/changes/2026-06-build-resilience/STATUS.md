# STATUS

- slug: 2026-06-build-resilience
- module: kernel
- type: fix
- status: in-progress
- branch: change/kernel/2026-06-build-resilience
- created-at: 2026-06-01
- last-updated: 2026-06-01

## Log

- 2026-06-01 | created (status=draft) | spin-off from fix-x64-build retrospective; automate electron cache SHA verify + repair
- 2026-06-01 | approved | user accepted recommendation; no open questions
- 2026-06-01 | designed | zero-dep node script, dist:check prefixed to dist:*, default delete-corrupt mode
- 2026-06-01 | in-progress | starting T-01

## State Machine

draft → approved → designed → in-progress → testing → ready-to-ship → shipped → archived

## Continue From

写 scripts/verify-electron-cache.mjs (T-01)。
