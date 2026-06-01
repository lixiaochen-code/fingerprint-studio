# Changelog

## v0.1.1 — 2026-06-01

### Process

- 引入 AI 驱动开发流程框架：`AGENTS.md` 入口、`docs/process/` 含 7 份规范 + 8 份模板、`specs/` 三层目录骨架（baseline / changes / archive）、`docs/PROJECT_GUIDE.md` 项目知识库、`.kiro/steering/` Kiro 适配
- agent 工具中立：`CLAUDE.md` / `GEMINI.md` / `.cursorrules` / `.github/copilot-instructions.md` 通过 symlink 共享单份内容
- 应用功能无变化

详见 [bootstrap change](specs/changes/2026-05-bootstrap-process/release-notes.md)（即将归档到 `specs/archive/_cross/2026-05-bootstrap-process/`）。

## v0.1.0 — 2026 年 5 月（前流程时代）

- 桌面 MVP：跨境电商浏览器环境管理、三轨反检测、脚本子系统、全局脚本与队列
- 历史 handoff 文档保留在 `docs/specs/handoff-*.md`（待 `2026-05-migrate-legacy-docs` 迁到 `docs/handoffs/`）
