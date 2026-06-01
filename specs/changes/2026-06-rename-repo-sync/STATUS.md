# STATUS

- slug: 2026-06-rename-repo-sync
- module: _cross
- type: chore
- status: archived
- branch: change/_cross/2026-06-rename-repo-sync (merged via local merge commit)
- created-at: 2026-06-01
- last-updated: 2026-06-01

## Log

- 2026-06-01 | created (status=draft) | spin-off from 2026-05-bootstrap-process retrospective §6
- 2026-06-01 | approved | user batch authorization
- 2026-06-01 | designed (small-change path) | 4-file user-facing rename + git remote update
- 2026-06-01 | in-progress | T-01 grep + T-02 update + T-03 git remote
- 2026-06-01 | testing → ready-to-ship | TT-01, TT-02 全 pass
- 2026-06-01 | shipped v0.1.3 | local merge to main; tag v0.1.3 pushed (no more "repository moved" hint, confirming git remote sync); arm64 mac dmg/zip built (productName confirmed in mounted dmg as "Fingerprint Studio.app", VALID); x64 still failing (Failed Attempt 1 carry-over); CHANGELOG updated
- 2026-06-01 | archived | retrospective written; moved to specs/archive/_cross/. **READ-ONLY hereafter.**

## State Machine

draft → approved → designed → in-progress → testing → ready-to-ship → shipped → archived

## Continue From

终态。本 change 已归档，**只读**。
