# Test Plan: 2026-06-cloud-sync-admin

## 1. Scope

验证登录、RBAC、同步上传/下载、后台管理接口与构建。

## 2. Strategy

手工 + 自动 smoke。由于当前为 Electron 主进程内 backend MVP，接口层用 Node smoke 脚本覆盖关键 HTTP 路径，类型与前端由 `pnpm run build` 覆盖。

## 3. Test Tasks

- [x] **TT-01** Cloud API smoke test
  - method: 集成
  - linked-requirement: Login / Sync / RBAC
  - status: pass
  - executed-at: 2026-06-04
  - result: pass
  - evidence: `node scripts/cloud-smoke.mjs` → `cloud smoke ok`

- [x] **TT-02** Build verification
  - method: 构建
  - linked-requirement: Admin Console
  - status: pass
  - executed-at: 2026-06-04
  - result: pass
  - evidence: `pnpm run build`

## 4. Out-of-band Verification

`pnpm run validate:specs` → pass

## 5. Execution Log

- 2026-06-04 | TT-02 pass | `pnpm run build` completed successfully.
- 2026-06-04 | TT-01 initial fail | sandbox blocked local HTTP listen with `listen EPERM 127.0.0.1`; reran with approved escalation.
- 2026-06-04 | TT-01 retest pass | `node scripts/cloud-smoke.mjs` returned `cloud smoke ok`.
- 2026-06-04 | out-of-band pass | `pnpm run validate:specs` completed successfully.

## 6. Sign-off

- [x] 所有 TT 状态 = pass
- [x] 关联的开发 task 全部 done
- [x] pnpm run build 通过
- [ ] 进入 release 环节
