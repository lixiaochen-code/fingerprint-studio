# Tasks: 2026-06-socks5-auth-proxy

> Continue From: Ready for user review; no remaining implementation task.
> Last updated: 2026-06-03 by Codex

## Conventions

- Status: `todo` | `in-progress` | `done` | `blocked`
- 一个 task 一个 commit (commit message 含 `[task: T-NN]`)
- 任务超阈值（>1 天 / >5 文件 / >300 行）必须拆
- TT-NN 是测试任务编号，定义在 test-plan.md

## Phase 1: Diagnosis And Fix

- [x] **T-01** Add authenticated SOCKS local tunnel
  - status: done
  - commit: 4405371
  - files: electron/proxies/socksTunnel.ts, electron/main.ts
  - verify: Local SOCKS fixture passes through the new tunnel; Electron main build passes.
  - note: Chromium does not authenticate SOCKS credentials through the current extension path, so authenticated SOCKS uses a local no-auth SOCKS5 tunnel.

- [x] **T-02** Make SOCKS proxy tests protocol-aware
  - status: done
  - commit: 06cd3f4
  - files: electron/proxies/test.ts
  - verify: `proxies:test` performs SOCKS handshake; provided proxy currently returns explicit BAD_RESPONSE for HTTP response instead of SOCKS greeting.

- [x] **T-03** Add focused regression coverage
  - status: done
  - commit: 0e04b6b
  - files: scripts/verify-socks-tunnel.mjs
  - verify: `pnpm exec tsc -p tsconfig.electron.json && node scripts/verify-socks-tunnel.mjs`; `pnpm run build` passed.

## Test Tasks (TT)

- TT-01: External proxy validation
- TT-02: Browser launch validation
- TT-03: Build validation
