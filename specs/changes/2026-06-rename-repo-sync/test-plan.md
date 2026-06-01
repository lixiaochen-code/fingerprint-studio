# Test Plan: 2026-06-rename-repo-sync

## 1. Scope

验证仓库改名 sync 完成且不破坏内部代码兼容性。详见 tasks.md TT-01 / TT-02。

## 2. Strategy

手工验证 user-facing 文档 + 自动 build pass。

## 3. Test Tasks

详见 tasks.md TT-01, TT-02 (small change 把 TT 描述放 tasks.md 即可)。

## 4. Out-of-band Verification

无。

## 5. Execution Log

- 2026-06-01 11:05 | TT-01 pass
- 2026-06-01 11:06 | TT-02 pass

## 6. Sign-off

- [x] TT-01, TT-02 pass
- [x] build pass
- [x] 进入 release
