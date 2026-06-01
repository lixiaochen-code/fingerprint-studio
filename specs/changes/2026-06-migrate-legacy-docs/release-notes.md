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

- **x64 mac build 失败**：`pnpm dist:mac` 在 packaging x64 阶段报 `app-builder_arm64 process failed ERR_ELECTRON_BUILDER_CANNOT_EXECUTE` (exit 1)。arm64 产物（dmg + zip）正常生成且 hdiutil VALID。本次发版仅含 arm64。x64 修复留待后续 hotfix change（涉及 app-builder cross-arch 配置）。

## 6. Failed Attempts (失败留痕)

> 上线过程中任何失败必须在此追加。每次失败一段。归档前不允许删除此段。

### Failed Attempt 1 (2026-06-01 10:55, x64 build cross-arch failure)

- 现象: `pnpm dist:mac` x64 packaging 阶段报 `app-builder_arm64 process failed ERR_ELECTRON_BUILDER_CANNOT_EXECUTE` exit 1
- 根因: 待查；初判是 electron-builder 在 Apple Silicon 主机上对 x64 target 执行 cross-arch packaging 时的工具链兼容性问题
- 处置: 重试一次仍失败；arm64 产物完整可用（dmg + zip + blockmap，hdiutil VALID）；本次发版接受仅 arm64 产物；x64 后续 hotfix change 处理
- 关联 commit: 无（构建产物，不入 git）
- 备注: bootstrap-process v0.1.1 发版时 x64 也出现过类似 warning（flate corrupt）但仍 exit 0；本次升级为 exit 1 说明问题加重，需要专项排查
