# Tasks: 2026-06-rename-repo-sync

> Continue From: ready to release (T-01..T-03 + TT-01..TT-02 全部 done)
> Last updated: 2026-06-01 by initial-author

## Conventions

Small-change 简化路径。

## T-01 grep 定位 + 评估 user-facing 引用

- status: done
- commit: (T-02 commit; T-01 是只读调查)
- verify: grep 全仓发现 ~30 个 auto-registry 引用，绝大多数是内部代码（SDK 包名、env 前缀、ID/storage key、IPC 命名空间）。user-facing 仅 4 处需改：README 标题/描述、AGENTS.md 项目一句话、PROJECT_GUIDE.md 项目描述、package.json productName

## T-02 更新 user-facing 文档

- status: done
- commit: 0587bf2
- files: README.md, AGENTS.md, docs/PROJECT_GUIDE.md, package.json (productName)
- verify: TT-01 pass

## T-03 更新 git remote

- status: done
- commit: (no git change; only local config)
- files: .git/config (本地)
- verify: `git remote -v` 输出含 fingerprint-studio.git

## TT-01 spec-level 验证

- status: pass
- method: 手工
- linked-requirement: proposal §5 全部 Requirement
- verify: README/AGENTS/PROJECT_GUIDE 标题 + 一句话已更新；package.json productName 改了但 name/appId/version 没变；git remote 指向 fingerprint-studio
- executed-at: 2026-06-01 11:05
- result: pass
- evidence: grep 输出 + git remote -v 输出

## TT-02 build pass

- status: pass
- method: 自动
- verify: pnpm run build exit 0
- executed-at: 2026-06-01 11:06
- result: pass — built in 27.05s
- evidence: pnpm 输出
