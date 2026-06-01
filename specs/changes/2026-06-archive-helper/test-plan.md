# Test Plan: 2026-06-archive-helper

## 1. Scope

验证 archive-change.mjs 错误守卫 + 自归档（吃狗粮）+ 不破坏 validate/build。

## 2. Strategy

手工（错误场景 + 自归档）+ 自动（validate/build）。

## 3. Test Tasks

### TT-01 错误场景验证
- status: pass
- result: pass — 缺 slug / 不存在 slug / status!=shipped / 目标已存在，4 场景全部 exit 1，无副作用
- executed-at: 2026-06-01

### TT-02 自归档（吃狗粮）
- status: pending（需本 change 进入 shipped 后执行）
- 计划: 本 change ship（merge+tag）后 status=shipped，跑 `pnpm run archive 2026-06-archive-helper` 完成自归档
- result: （见 §5 Execution Log）

### TT-03 validate + build green
- status: pass
- result: pass — validate 0 error；build 20.97s green
- executed-at: 2026-06-01

## 4. Out-of-band Verification

- 自归档是本工具最强验证：脚本归档自己，证明端到端可用

## 5. Execution Log

- 2026-06-01 | TT-01 pass（4 错误场景）
- 2026-06-01 | TT-03 pass（validate + build）
- TT-02 在 shipped 后补记

## 6. Sign-off

- [x] TT-01 pass
- [x] TT-03 pass
- [ ] TT-02 自归档（ship 后执行，本 plan 末尾补记）
- [x] 进入 release
