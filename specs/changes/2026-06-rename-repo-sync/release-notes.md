# Release Notes: 2026-06-rename-repo-sync

## 1. Version

- version: v0.1.3
- type: patch
- date: 2026-06-01
- platforms: mac (arm64) — x64 build issue 待 hotfix

## 2. What Changed (User-Facing)

- 应用展示名从 `Auto Registry` 改为 `Fingerprint Studio`
- 仓库名从 `auto--registry` 改为 `fingerprint-studio`（GitHub 已自动 redirect 一段时间，本次 sync 本地 git remote）

应用功能、数据兼容、SDK 用法**完全不变**：

- bundle id 不变（`com.autoregistry.app`）→ 现有用户应用 / 数据 / profile 全部保留
- SDK 包名不变（`import 'auto-registry'`）→ 用户脚本无需修改
- env 前缀不变（`AUTO_REGISTRY_*`）
- userData 路径不变（`registry-data/`）

## 3. How to Use

无操作。下次启动应用，dock / 窗口标题显示 `Fingerprint Studio`。

## 4. Rollback Plan

```bash
git tag -d v0.1.3
git push --delete origin v0.1.3
gh release delete v0.1.3 --yes
rm -f release/Fingerprint\ Studio-0.1.3*
# 完全恢复改名前
# git revert -m 1 <merge-commit-sha>
```

## 5. Known Issues

- x64 mac build 仍失败（同 v0.1.2 的 Failed Attempt 1）；本次发版仍只含 arm64 产物。x64 build hotfix change 单独跟进

## 6. Failed Attempts

无失败（不含已知的 x64 build 持续问题，那个属于发版基础设施 issue 而非本 change 问题）
