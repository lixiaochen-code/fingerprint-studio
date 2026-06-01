# Tasks: 2026-06-fix-x64-build

> Continue From: T-01 not started
> Last updated: 2026-06-01 by initial-author

## Conventions

Small-change path. 4 task：清缓存 / 重 build / TT 验证 / 发版。

## T-01 清理损坏的 electron x64 cache

- status: todo
- commit: (no git change; cache file outside repo)
- files: ~/Library/Caches/electron/electron-v39.8.9-darwin-x64.zip (delete)
- verify: ls 确认文件已删；同目录其他 zip 文件保留

## T-02 重新构建 dist:mac（让 electron-builder 自动下载新 cache）

- status: todo
- commit: (no git change; build artifacts are in release/ which is gitignored)
- files: release/Fingerprint\ Studio-0.1.4-*
- verify: pnpm dist:mac exit 0；release/ 下产出 4 个 v0.1.4 文件

## TT-01 验证产物完整

- status: todo
- method: 手工
- linked-requirement: proposal §5
- verify: 4 个产物均存在；arm64 dmg + x64 dmg 都 hdiutil VALID
- executed-at: 
- result: 
- evidence: 

## TT-02 验证 arm64 zip 缓存仍 OK

- status: todo
- method: 手工
- linked-requirement: proposal §7 风险缓解
- verify: unzip -t arm64 cache zip → No errors
- executed-at: 
- result: 
- evidence: 

> 注：本 change 没有 build code 改动，所以 03-development §6 的 "pnpm run build pass" 由 dist:mac 隐式覆盖（dist:mac 内含 build），不单独建 TT。
