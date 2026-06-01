# Release Notes: 2026-06-migrate-legacy-docs

## 1. Version

- version: v0.1.2
- type: patch
- date: 2026-06-01
- platforms: mac (arm64+x64)

## 2. What Changed (User-Facing)

应用本身**无功能变化**。本次发版完成 bootstrap-process 留下的迁移工作：

- `docs/specs/anti-detection.md` → `specs/baseline/desktop/stealth/spec.md`（含 7 条 OpenSpec Requirement + Legacy 全文附录）
- `docs/specs/scripting.md` + `global-scripts-and-queues.md` → `specs/baseline/desktop/scripts/spec.md`（含 10 条 Requirement + Legacy 摘要附录）
- `.kiro/specs/global-scripts-{and-queues,phase-6-runtime,profile-launch-close}` → `specs/archive/desktop/scripts/2026-05-*`（各加 STATUS.md legacy=true，删除 .config.kiro）
- `docs/specs/handoff-*.md` + `scripting-handoff.md` + `test-checklist-*.md`（共 10 个）→ `docs/handoffs/`（去前缀重命名）
- 删除：`docs/specs/`（空目录）、`AGENT.md`（被 AGENTS.md + PROJECT_GUIDE.md 取代）、`.kiro/specs/`（空目录）

## 3. How to Use

无用户操作。开发者 / agent 后续读历史设计文档时改读 `specs/baseline/desktop/<module>/spec.md`，旧路径 `docs/specs/*` 与 `AGENT.md` 已不存在。

## 4. Rollback Plan

```bash
git tag -d v0.1.2
git push --delete origin v0.1.2
gh release delete v0.1.2 --yes
rm -f release/Auto\ Registry-0.1.2*

# 如需完全恢复迁移前状态（从 git 历史）
# git revert -m 1 <merge-commit-sha>
```

## 5. Known Issues

无。所有 Requirement 验证 pass，build 全绿。

## 6. Failed Attempts (失败留痕)

> 上线过程中任何失败必须在此追加。每次失败一段。归档前不允许删除此段。

无失败。开发过程中遇到一个 git mv 嵌套目录问题（T-05 把 `global-scripts-profile-launch-close/` 整目录 mv 到目标后产生了双层路径），用 fixup commit 扁平化解决，未影响发版。
