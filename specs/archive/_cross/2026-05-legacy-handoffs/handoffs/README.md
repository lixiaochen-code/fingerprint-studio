# Handoffs Guide

> 本目录保存历史交接包，主要用于追溯 2026-05 改造期间的决策背景。
> 当前开发真源仍是 `AGENTS.md`、`docs/process/`、`specs/baseline/`、`specs/archive/` 和当前代码。

## 阅读规则

- handoff 正文保持历史原样，不保证路径、分支名、待办状态仍然准确。
- 看到“未完成 / 未手测 / 分支未合并”时，先用当前代码和 `specs/archive/` 复核。
- 旧文档里的 `docs/specs/*` 已迁移到 `specs/baseline/*` 或 `specs/archive/*`。
- 旧文档里的 `AGENT.md` 现在对应根目录 `AGENTS.md`。

## 文件索引

| 文件 | 主题 | 当前阅读价值 |
|---|---|---|
| [`2026-05-18.md`](2026-05-18.md) | 脚本子系统早期规划 | 查 Phase 4 Dev Server、外部脚本等早期想法 |
| [`2026-05-25.md`](2026-05-25.md) | 反检测排查 | 查 Turnstile / client hints 问题背景 |
| [`2026-05-26.md`](2026-05-26.md) | 脚本 UI 与重构阶段记录 | 查 Monaco、运行面板、startUrl 等历史验证项 |
| [`2026-05-26-router-refactor.md`](2026-05-26-router-refactor.md) | 路由重构 + 目录规范化 | 查 HashRouter、KeepAlive、kebab-case 目录决策 |
| [`2026-05-27-global-scripts.md`](2026-05-27-global-scripts.md) | 全局脚本 + 队列六阶段规划 | 查 profile.id、Script.scope、main(args)、队列设计背景 |
| [`2026-05-27-phase-6-done.md`](2026-05-27-phase-6-done.md) | phase 6 runtime 阶段 | 查 runScript、bridge、错误码早期实现 |
| [`2026-05-29-write-apis-and-fire-and-forget.md`](2026-05-29-write-apis-and-fire-and-forget.md) | create/delete + fire-and-forget | 查 profiles.create/delete、whenIdle 的决策背景 |
| [`2026-05-29-G-F-done-E-pending.md`](2026-05-29-G-F-done-E-pending.md) | profiles.delete/create 实测记录 | 查 stop-on-delete 决策与 G/F/E 测试状态 |
| [`2026-05-29-test-checklist.md`](test-checklist-2026-05-29.md) | 全局脚本验收清单 | 查历史手工测试用例，不代表当前必跑清单 |
| [`scripting.md`](scripting.md) | 脚本子系统综合接手包 | 查脚本系统架构、SDK、已知 bug 修复、剩余路线图 |

## 已知历史状态校准

这些点在旧 handoff 中容易误导，当前阅读时按下面理解：

- `ProfilesView` 拆分：旧文档标为 Phase B 待办；当前已有 `src/views/profiles/components/*`，入口文件已明显瘦身。
- `useAppData` / `useTheme` / `useLocale`：旧文档标为建议抽 hook；当前已存在于 `src/hooks/`。
- `profiles.create` / `profiles.delete`：旧文档经历过“占位 → 提前实装”的状态；当前 create/delete 已通过 bridge 实装。
- `profiles.setQueue` 与 profile 队列：当前仍是待办，SDK 调用会返回 `GLOBAL_NOT_IMPL_YET`。
- 反检测 SettingsStore / C 路线 UI：当前仍是待办，`fingerprintMode()` 仍主要来自环境变量和默认值。

## 后续整理方向

- 下一次触及 `profiles` / `proxies` / `kernel` 模块时，补齐对应 baseline 的 Current Capabilities。
- 若某份 handoff 的内容已经完全被 `specs/archive/` 覆盖，可开独立 change 做归档说明或瘦身；不要在普通功能 change 里顺手删历史。
