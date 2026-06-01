# Tasks: 2026-06-fix-x64-build

> Continue From: release + archive
> Last updated: 2026-06-01 by initial-author

## Conventions

Small-change path. 清缓存 / 重 build / TT 验证 / 发版。

## T-01 清理损坏的 electron x64 cache

- status: done
- commit: (no git change; cache file outside repo)
- files: ~/Library/Caches/electron/electron-v39.8.9-darwin-x64.zip
- verify: 文件已删；arm64 / linux / win zip 保留

## T-02 修复 x64 cache + 重新构建

- status: done
- commit: (no git change; release/ gitignored)
- files: release/Fingerprint Studio-0.1.4-*
- verify: dist:mac exit 0，4 个产物全部生成
- note: 根因比 proposal 初判更具体——electron-builder 自动重下的 x64 zip 也损坏（SHA 不匹配，网络不稳定导致）。最终用 `curl` 直接从 GitHub releases 下载并校验 SHA256 = 5a42fa76... 通过后，dist:mac 一次成功

## TT-01 验证产物完整

- status: pass
- method: 手工
- linked-requirement: proposal §5
- verify: 4 个产物均存在；arm64 dmg + x64 dmg 都 hdiutil VALID
- executed-at: 2026-06-01 15:32
- result: pass — arm64.dmg (147MB) / arm64-mac.zip (141MB) / x64.dmg (153MB) / x64 mac.zip (148MB)；两个 dmg hdiutil VALID
- evidence: ls + hdiutil verify 输出

## TT-02 验证 arm64 zip 缓存仍 OK

- status: pass
- method: 手工
- linked-requirement: proposal §7 风险缓解
- verify: unzip -t arm64 cache zip → No errors
- executed-at: 2026-06-01 14:20
- result: pass — "No errors detected in compressed data"
- evidence: unzip -t 输出
