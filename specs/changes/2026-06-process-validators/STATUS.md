# STATUS

- slug: 2026-06-process-validators
- module: _cross
- type: process
- status: in-progress
- branch: change/_cross/2026-06-process-validators
- created-at: 2026-06-01
- last-updated: 2026-06-01

## Log

- 2026-06-01 | created (status=draft) | spin-off; automate process compliance checks raised in 4 prior retrospectives
- 2026-06-01 | approved | user "继续" batch authorization; no open questions
- 2026-06-01 | designed | zero-dep node .mjs validator; 6 check categories; error/warning split
- 2026-06-01 | in-progress | starting T-01

## State Machine

draft → approved → designed → in-progress → testing → ready-to-ship → shipped → archived

## Continue From

写 scripts/validate-specs.mjs (T-01)。
