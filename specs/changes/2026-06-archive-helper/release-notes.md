# Release Notes: 2026-06-archive-helper

## 1. Version

- version: v0.1.7
- type: patch
- date: 2026-06-01
- platforms: N/A — 流程工具，应用二进制无变化（不重新分发）

## 2. What Changed (User-Facing)

应用功能无变化。流程工具增强：

- 新增 `pnpm run archive <slug>`：自动化归档命令，把"改 status 字段 + 追加 Log + git mv"打包成一条命令，**根除手动归档时 `- status:` 字段漏改的笔误**（该笔误在 3 个 change 复现过）
- 06-archive.md 流程更新为使用该命令；新增 §8.1"元数据笔误可修正"例外条款

## 3. How to Use

change 发版后（status=shipped）归档：

```bash
pnpm run archive <slug>
# 脚本校验 shipped → 改 status=archived → git mv → 自检 validate-specs
# 然后按提示 commit
```

## 4. Rollback Plan

```bash
git tag -d v0.1.7
git push --delete origin v0.1.7
# git revert merge commit 可移除 archive script + 06-archive 改动
```

## 5. Known Issues

无。

## 6. Failed Attempts

无构建/上线失败。开发中一次工具调用顺序错误导致 STATUS 内容误写入 tasks.md，用 amend + 重写修正，未影响最终产物。
