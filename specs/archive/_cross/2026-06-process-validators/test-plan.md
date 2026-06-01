# Test Plan: 2026-06-process-validators

## 1. Scope

验证校验脚本正确工作：合规仓库 0 error、坏数据报 error、不影响 build。

## 2. Strategy

自动（脚本退出码）+ 手工（造坏数据）。

## 3. Test Tasks

### TT-01 当前仓库零 error
- status: pass
- executed-at: 2026-06-01
- result: pass — 7 archive + 1 in-progress（本 change 自身），All checks passed, exit 0。首跑时抓到 fix-x64-build 的 status 笔误（已修正）
- evidence: node scripts/validate-specs.mjs 输出

### TT-02 坏数据正确报错
- status: pass
- executed-at: 2026-06-01
- result: pass — 造 changes/_tmp-bad (status=archived) → error "status=archived but still under specs/changes/" + exit 1；删除后恢复 0 error exit 0
- evidence: 两次运行输出对比

### TT-03 build 仍通过
- status: pass
- executed-at: 2026-06-01
- result: pass — built in 21.44s, exit 0
- evidence: pnpm run build 输出

## 4. Out-of-band Verification

- 校验器对当前仓库的实际价值已验证：首跑即发现一个真实的归档元数据 bug（fix-x64-build status 字段未改）

## 5. Execution Log

- 2026-06-01 | TT-01 pass（含发现 + 修正 fix-x64-build status bug）
- 2026-06-01 | TT-02 pass（坏数据报错 + 恢复）
- 2026-06-01 | TT-03 pass（build green）

## 6. Sign-off

- [x] TT-01..TT-03 pass
- [x] 校验器零依赖、纯只读、跨平台
- [x] 进入 release
