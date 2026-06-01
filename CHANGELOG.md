# Changelog

## v0.1.2 — 2026-06-01

### Process

- 完成 bootstrap-process 留下的迁移工作：旧 `docs/specs/*` 设计文档迁到 `specs/baseline/desktop/<module>/spec.md`；旧 `.kiro/specs/global-scripts-*` 迁到 `specs/archive/desktop/scripts/2026-05-*`；handoff 文档迁到 `docs/handoffs/`
- 删除 `AGENT.md`（被 AGENTS.md + PROJECT_GUIDE.md 取代）、空 `docs/specs/`、空 `.kiro/specs/`
- 应用功能无变化

### Known Issues

- 本次发版仅 arm64 mac 产物可用；x64 cross-arch packaging 失败（详见 [release notes](specs/archive/_cross/2026-06-migrate-legacy-docs/release-notes.md)，待后续 hotfix）

详见 [migrate-legacy-docs change](specs/archive/_cross/2026-06-migrate-legacy-docs/release-notes.md)（即将归档）。

## v0.1.1 — 2026-06-01

### Process

- 引入 AI 驱动开发流程框架：`AGENTS.md` 入口、`docs/process/` 含 7 份规范 + 8 份模板、`specs/` 三层目录骨架（baseline / changes / archive）、`docs/PROJECT_GUIDE.md` 项目知识库、`.kiro/steering/` Kiro 适配
- agent 工具中立：`CLAUDE.md` / `GEMINI.md` / `.cursorrules` / `.github/copilot-instructions.md` 通过 symlink 共享单份内容
- 应用功能无变化

详见 [bootstrap change](specs/changes/2026-05-bootstrap-process/release-notes.md)（即将归档到 `specs/archive/_cross/2026-05-bootstrap-process/`）。

## v0.1.0 — 2026 年 5 月（前流程时代）

- 桌面 MVP：跨境电商浏览器环境管理、三轨反检测、脚本子系统、全局脚本与队列
- 历史 handoff 文档保留在 `docs/specs/handoff-*.md`（待 `2026-05-migrate-legacy-docs` 迁到 `docs/handoffs/`）
