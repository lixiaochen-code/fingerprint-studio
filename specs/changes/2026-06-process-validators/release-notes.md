# Release Notes: 2026-06-process-validators

## 1. Version

- version: v0.1.5
- type: patch
- date: 2026-06-01
- platforms: N/A — **本次不重新构建安装包**

## 2. What Changed (User-Facing)

应用功能与二进制**完全无变化**。本次仅引入开发流程工具：

- 新增 `pnpm run validate:specs`：零依赖 Node 脚本，自动校验 specs/changes 与 specs/archive 的 STATUS 完整性、状态一致性、Continue From、commit 格式
- 流程文档（00-overview FAQ + 03-development 退出动作）加入校验器引用

> 普通用户无需关心。v0.1.4 的安装包仍代表当前应用二进制（本次没有应用代码改动，不重新分发）。

## 3. How to Use

开发者 / agent：每个 change 进入 testing 前跑 `pnpm run validate:specs`，确认 0 error。

## 4. Rollback Plan

```bash
git tag -d v0.1.5
git push --delete origin v0.1.5
# 应用无新安装包，无需删 release 文件
```

## 5. Known Issues

无。

## 6. Failed Attempts

无构建/上线失败。开发中校验器首跑发现了一个真实的归档 bug（2026-06-fix-x64-build 的 STATUS.status 笔误停在 ready-to-ship），已就地修正——这正是本工具的价值证明，不算失败。
