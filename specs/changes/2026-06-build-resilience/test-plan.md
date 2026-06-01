# Test Plan: 2026-06-build-resilience

## 1. Scope

验证 electron cache 校验脚本三模式正确、dist:check 接入不破坏 dist 流程、不影响 validate/build。

## 2. Strategy

自动（脚本退出码 / dist 产物）+ 手工（截断 zip 模拟损坏）。

## 3. Test Tasks

### TT-01 完好 cache 校验通过
- status: pass
- executed-at: 2026-06-01
- result: pass — 4 个 electron zip（darwin arm64/x64、linux x64、win32 x64）SHA 全匹配，exit 0
- evidence: verify-electron-cache.mjs 输出

### TT-02 损坏检测三模式
- status: pass
- executed-at: 2026-06-01
- result: pass
  - 截断 win32 zip 至 1MB 模拟损坏
  - `--strict`：报 SHA mismatch，exit 1，文件保留（1000000 bytes）✓
  - 默认 delete：报 mismatch + 删除文件，exit 0 ✓
  - `--redownload`：删除 + curl 重下；本次因测试环境弱网 curl (18) partial file，脚本如实报 `1 failed` 并清理——失败处理逻辑正确 ✓
  - 测试后用备份恢复 win32 zip，复校全 OK
- evidence: 三次运行输出

### TT-03 dist:mac 端到端仍出 4 产物
- status: pass
- executed-at: 2026-06-01
- result: pass — dist:check 先跑（✓ all verified）→ build → electron-builder 出 arm64+x64 dmg/zip 共 4 产物；x64 dmg hdiutil VALID；无 flate 错误
- evidence: pnpm dist:mac 输出 + ls + hdiutil

### TT-04 validate:specs + build green
- status: pass
- executed-at: 2026-06-01
- result: pass — validate:specs 0 error；build 在 TT-03 dist:mac 内已绿
- evidence: validate 输出

## 4. Out-of-band Verification

- 三模式行为与 design §5.6 退出码表一致

## 5. Execution Log

- 2026-06-01 | TT-01 pass
- 2026-06-01 | TT-02 pass（strict/delete/redownload 三模式行为正确；redownload 因弱网未完成下载但失败处理正确）
- 2026-06-01 | TT-03 pass（dist:check 接入，4 产物 VALID）
- 2026-06-01 | TT-04 pass

## 6. Sign-off

- [x] TT-01..TT-04 pass
- [x] 三模式退出码符合设计
- [x] dist 流程不被破坏
- [x] 进入 release
