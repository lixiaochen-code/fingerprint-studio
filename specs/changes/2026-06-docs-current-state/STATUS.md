# STATUS

- slug: 2026-06-docs-current-state
- module: _cross
- type: chore
- status: draft
- branch: change/_cross/2026-06-docs-current-state
- created-at: 2026-06-02
- last-updated: 2026-06-02

## Log

- 2026-06-02 | created (status=draft) | 整理 docs 当前入口、历史 handoff 索引，并校准误导性待办。
- 2026-06-02 | docs整理完成 | 已新增 docs/README、handoff 索引，并校准 PROJECT_GUIDE 与 scripts baseline；进入验证。
- 2026-06-02 | verification pass | `pnpm run validate:specs` 通过，文档关键词抽查通过。
- 2026-06-02 | scope expanded by user | 用户要求从 AGENTS 开始，按规范将规范之外文档归档整理为 baseline/archive/changes；将 docs/handoffs 迁入 specs/archive/_cross/2026-05-legacy-handoffs/。
- 2026-06-02 | verification pass after archive | `pnpm run validate:specs` 通过；docs/handoffs 已不存在；legacy handoffs archive 已创建。

## State Machine

draft → approved → designed → in-progress → testing → ready-to-ship → shipped → archived

## Continue From

等待用户确认是否继续推进本 change 状态流转与后续 release/archive。
