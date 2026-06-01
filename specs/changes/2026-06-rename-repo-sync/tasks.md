# Tasks: 2026-06-rename-repo-sync

> Continue From: T-01 not started
> Last updated: 2026-06-01 by initial-author

## Conventions

Small-change 简化路径。一个 commit 跑完核心改动 + 一个 commit 处理 git remote。

## T-01 grep 定位 + 评估 user-facing 引用

- status: todo
- commit: 
- files: (read-only)
- verify: 列出所有 grep 匹配 + 标注"改/不改"

## T-02 更新 user-facing 文档

- status: todo
- commit: 
- files: README.md, AGENTS.md, docs/PROJECT_GUIDE.md, package.json (productName)
- verify: grep 之后无 user-facing 旧名残留

## T-03 更新 git remote

- status: todo
- commit: (no git change; only local config)
- files: .git/config (本地)
- verify: `git push origin main` 无 redirect 提示

## TT-01 spec-level 验证

- status: todo
- method: 手工
- linked-requirement: proposal §5 全部 Requirement
- verify: README/AGENTS/PROJECT_GUIDE 标题 + 一句话已更新；package.json productName 改了但 name/appId/version 没变；git remote 指向 fingerprint-studio
- executed-at: 
- result: 
- evidence: 

## TT-02 build pass

- status: todo
- method: 自动
- verify: pnpm run build exit 0
- executed-at: 
- result: 
- evidence: 
