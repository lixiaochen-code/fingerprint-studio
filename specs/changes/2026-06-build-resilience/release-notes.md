# Release Notes: 2026-06-build-resilience

## 1. Version

- version: v0.1.6
- type: patch
- date: 2026-06-01
- platforms: mac (arm64 + x64) — 构建工具增强，应用二进制无功能变化

## 2. What Changed (User-Facing)

应用功能无变化。本次为构建健壮性增强：

- 新增 `pnpm run dist:check`：构建前自动校验 electron 下载缓存的 SHA256，删除损坏文件（弱网常见问题）
- 所有 `dist:*` 脚本前置 `dist:check`，根治 `flate: corrupt input` 类构建失败
- 新增 `scripts/verify-electron-cache.mjs`，支持 `--strict`（CI）/`--redownload`（弱网主动 curl 重下 + 校验）三模式

## 3. How to Use

开发者构建：`pnpm dist:mac` 会自动先校验缓存。弱网下若自动重下仍坏：

```bash
node scripts/verify-electron-cache.mjs --redownload
```

## 4. Rollback Plan

```bash
git tag -d v0.1.6
git push --delete origin v0.1.6
# 回滚 package.json dist 脚本到不含 dist:check 的版本（git revert merge commit）
```

## 5. Known Issues

- `--redownload` 依赖 curl + 稳定网络；持续弱网下仍可能失败（如本次测试环境），但默认 delete 模式 + electron-builder 自动重下已覆盖多数情况

## 6. Failed Attempts

无构建/上线失败。测试中 `--redownload` 因测试环境弱网（curl 18 partial file）未完成单次下载，但脚本失败处理逻辑正确（如实报告 + 清理），不算 change 缺陷。
