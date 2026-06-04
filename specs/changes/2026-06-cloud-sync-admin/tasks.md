# Tasks: 2026-06-cloud-sync-admin

> Continue From: all implementation tasks done; ready for release notes / ship decision
> Last updated: 2026-06-04 by codex

## Conventions

- Status: `todo` | `in-progress` | `done` | `blocked`
- 一个 task 一个 commit (commit message 含 `[task: T-NN]`)

## Phase 1: Cloud Core

- [x] **T-01** Cloud service, persistence, auth, sync, RBAC
  - status: done
  - commit: aa692b8 + pending remote-backend follow-up
  - files: electron/cloud/*, electron/types.ts, electron/main.ts, electron/preload.ts, package.json, scripts/cloud-server.mjs
  - verify: `pnpm run build` pass

## Phase 2: Desktop UI

- [x] **T-02** Cloud/admin renderer page
  - status: done
  - commit: pending final commit
  - files: src/App.tsx, src/components/app-header/index.tsx, src/views/cloud-admin/index.tsx, src/vite-env.d.ts
  - verify: `pnpm run build` pass

## Phase 3: Verification

- [x] **T-03** HTTP smoke test and process docs
  - status: done
  - commit: aa692b8 + pending remote-backend follow-up
  - files: scripts/cloud-smoke.mjs, specs/changes/2026-06-cloud-sync-admin/*
  - verify: `node scripts/cloud-smoke.mjs` pass, including cross-device upload/download; `pnpm run validate:specs` pass

## Test Tasks (TT)

- TT-01: Cloud API smoke test
- TT-02: Type/build verification
