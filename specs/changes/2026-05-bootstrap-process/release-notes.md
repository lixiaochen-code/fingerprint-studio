# Release Notes: 2026-05-bootstrap-process

## 1. Version

- version: v0.1.1
- type: patch
- date: 2026-06-01
- platforms: mac (arm64+x64) — 当前阶段仅 mac 分发；其他平台未来支持

## 2. What Changed (User-Facing)

应用本身**无功能变化**。本次发版仅引入开发流程基础设施：

- 新增 `AGENTS.md` 作为通用 AI agent 入口；通过 symlink 同时支持 Claude Code / Cursor / Codex / Gemini CLI / Copilot
- 新增 `docs/process/` 含 7 份流程规范（总规范 + 6 个环节规范）+ 8 份产物模板
- 新增 `docs/PROJECT_GUIDE.md` 作为项目特定知识库
- 新增 `specs/` 目录骨架：baseline / changes / archive 三层结构
- 新增 `.kiro/steering/process.md` 让 Kiro 自动加载流程规范

> 用户通常不需要关心本次发版。仅本仓库的 AI 协作开发体验有改进：所有后续 change 都将走标准化的"需求 → 设计 → 开发 → 测试 → 上线 → 归档"流水线。

## 3. How to Use

普通用户：N/A，无需操作。

开发者 / AI agent：

1. 任何 agent 进入仓库先读 `AGENTS.md`，按指引继续读 `docs/process/00-overview.md` 与 `docs/PROJECT_GUIDE.md`
2. 新需求开 change：`mkdir -p specs/changes/<slug>/`，复制 `docs/process/templates/` 下的模板
3. 走完整状态机：draft → approved → designed → in-progress → testing → ready-to-ship → shipped → archived
4. 详细规则见各环节规范

## 4. Rollback Plan

```bash
# 撤销本次发版（无用户阶段直接删 tag）
git tag -d v0.1.1
git push --delete origin v0.1.1
gh release delete v0.1.1 --yes
rm -f release/Auto\ Registry-0.1.1*

# 回滚 main 上的 merge commit（可选；通常本次没必要因为没影响应用功能）
# git revert -m 1 <merge-commit-sha>
```

如要"完全恢复到本 change 前"：

- 删除 `AGENTS.md` `CLAUDE.md` `GEMINI.md` `.cursorrules` `.github/copilot-instructions.md` `docs/process/` `docs/PROJECT_GUIDE.md` `specs/` `.kiro/steering/process.md`
- 恢复历史 `AGENT.md`（已保留共存，无需操作）

## 5. Known Issues

- `specs/baseline/desktop/{stealth,scripts}/spec.md` 尚未存在；它们的内容由后续 change `2026-05-migrate-legacy-docs` 创建。在该 change 完成前，PROJECT_GUIDE.md 中指向 `specs/baseline/desktop/stealth/spec.md` 的链接会指向不存在文件——这是已知预期，不算 bug
- `docs/specs/` 与 `AGENT.md` 保留共存（旧文档仍可读），由后续 change 删除
- `.kiro/specs/global-scripts-*` 三个旧 spec 仍在原位，由后续 change 迁到 archive

## 6. Failed Attempts (失败留痕)

> 上线过程中任何失败必须在此追加。每次失败一段。归档前不允许删除此段。

无失败记录。本 change 完整执行：21 → 13 task 完成（迁移 8 task 移出 scope）；10 个 spec-level TT 全部 pass；build 全绿。
