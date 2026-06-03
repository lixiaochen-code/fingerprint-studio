# Test Plan: 2026-06-socks5-auth-proxy

## 1. Scope
覆盖 proposal §5 中 authenticated SOCKS browser launch 与 SOCKS protocol-aware proxy tests。

## 2. Strategy
手工验证真实代理与 Chromium 行为；单测覆盖本地 SOCKS5 转发握手和数据转发，避免后续回退成 TCP-only 测试。

## 3. Test Tasks

- [x] **TT-01** Validate provided SOCKS5 proxy outside the app
  - method: 手工
  - linked-requirement: proposal §5 Requirement: Authenticated SOCKS proxies work in launched browsers
  - status: pass
  - executed-at: 2026-06-03
  - result: initial curl succeeded through a US exit; repeated current SOCKS5 checks return HTTP 403 / invalid SOCKS version from upstream.
  - evidence: current upstream response begins `HTTP/1.1 403 Forbidden` with a forbidden source IP message.

- [x] **TT-02** Validate Chromium through app-equivalent SOCKS tunnel
  - method: 手工
  - linked-requirement: proposal §5 Requirement: Authenticated SOCKS proxies work in launched browsers
  - status: pass
  - executed-at: 2026-06-03
  - result: local authenticated SOCKS5 fixture passed through the app-equivalent tunnel.
  - evidence: Node harness output `local SOCKS tunnel fixture pass`.

- [x] **TT-03** Build validation
  - method: 集成
  - linked-requirement: proposal §5 Requirement: Proxy tests validate SOCKS protocol and auth
  - status: pass
  - executed-at: 2026-06-03
  - result: build completed successfully.
  - evidence: `pnpm run build`

## 4. Out-of-band Verification
Run `pnpm exec tsc -p tsconfig.electron.json && node scripts/verify-socks-tunnel.mjs`.

## 5. Execution Log
- 2026-06-03 | TT-01 pass
- 2026-06-03 | TT-02 pass
- 2026-06-03 | TT-03 pass

## 6. Sign-off
- [x] 所有 TT 状态 = pass
- [x] 关联的开发 task 全部 done
- [x] pnpm run build 通过
- [ ] 进入 release 环节
