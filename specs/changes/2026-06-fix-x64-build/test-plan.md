# Test Plan: 2026-06-fix-x64-build

## 1. Scope

验证 x64 mac build 修复成功且不破坏 arm64。详见 tasks.md TT-01 / TT-02。

## 2. Strategy

手工验证产物 + SHA / hdiutil 完整性校验。

## 3. Test Tasks

详见 tasks.md TT-01, TT-02。

## 4. Out-of-band Verification

- electron x64 zip SHA256 校验：实际 = 期望 = `5a42fa7665fa67570990b5b2608d2414692a8176033401ffc07b3f26fca3901d`

## 5. Execution Log

- 2026-06-01 14:20 | TT-02 pass (arm64 zip OK)
- 2026-06-01 14:22 | Failed Attempt 1: 仅删 cache + 重 build，electron-builder 自动重下的 zip 仍损坏 (SHA 不匹配)
- 2026-06-01 15:28 | curl 手动下载 x64 zip，SHA256 校验通过
- 2026-06-01 15:31 | dist:mac 成功，4 产物全出
- 2026-06-01 15:32 | TT-01 pass (4 产物 + 双 dmg VALID)

## 6. Sign-off

- [x] TT-01, TT-02 pass
- [x] x64 + arm64 build 均成功
- [x] 进入 release
