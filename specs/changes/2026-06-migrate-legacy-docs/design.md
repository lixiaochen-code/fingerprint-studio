# Design: 迁移历史文档到 baseline/archive

## 1. Overview

按"baseline 抽 Current Capabilities + Legacy 全文附录"模式迁移 `docs/specs/` 中的设计文档；按"git mv + 加 STATUS"模式迁移 `.kiro/specs/global-scripts-*` 与 `docs/specs/handoff-*`；最后清理空目录与 AGENT.md。整个 change 单分支单 PR，分 4 phase，约 7-9 个 task。

## 2. Final Directory Layout

迁移后 `specs/baseline/desktop/` 与 `specs/archive/desktop/scripts/`：

```
specs/
├── baseline/
│   └── desktop/
│       ├── kernel/spec.md          (TBD，已存在)
│       ├── profiles/spec.md        (TBD，已存在)
│       ├── proxies/spec.md         (TBD，已存在)
│       ├── scripts/spec.md         ← 新增（合并 scripting + global-scripts-and-queues）
│       └── stealth/spec.md         ← 新增（迁 anti-detection）
└── archive/
    └── desktop/
        └── scripts/
            ├── 2026-05-global-scripts-and-queues/   ← 新增
            │   ├── STATUS.md       (legacy=true)
            │   └── tasks.md        (原 .kiro/specs/global-scripts-and-queues/tasks.md)
            ├── 2026-05-phase-6-runtime/             ← 新增
            │   ├── STATUS.md
            │   ├── requirements.md
            │   ├── design.md
            │   └── tasks.md        (不带 .config.kiro)
            └── 2026-05-profile-launch-close/        ← 新增
                ├── STATUS.md
                ├── requirements.md
                ├── design.md
                └── tasks.md

docs/
├── handoffs/                       ← 新增
│   ├── 2026-05-18.md               (原 handoff-2026-05-18.md，去掉 handoff- 前缀)
│   ├── 2026-05-25.md
│   ├── 2026-05-26.md
│   ├── 2026-05-26-router-refactor.md
│   ├── 2026-05-27-global-scripts.md
│   ├── 2026-05-27-phase-6-done.md
│   ├── 2026-05-29-G-F-done-E-pending.md
│   ├── 2026-05-29-write-apis-and-fire-and-forget.md
│   ├── scripting.md                (原 scripting-handoff.md，去掉 -handoff)
│   └── test-checklist-2026-05-29.md
└── specs/                          ← 删除（空目录）

AGENT.md                            ← 删除（已被 AGENTS.md 取代）
.kiro/specs/global-scripts-*        ← 删除三个目录
```

## 3. Data / API Changes

N/A: 本 change 不动数据结构、不动 API。

## 4. Module Interactions

N/A: 不涉及模块间调用。仅文档移动。

## 5. Detailed Design

### 5.1 baseline 抽取策略

stealth baseline：

- 已有 anti-detection.md ~233 行，体量适中
- Current Capabilities 抽 5-7 条 Requirement：三轨架构、Stealth Inject toString 痕迹、patch toggle、rebrowser 替换、targetOs 钳制、stealth CLI flag 约束、CDP 端口本地化
- Legacy 附录全文内联（参考 bootstrap-process T-14 的尝试）

scripts baseline：

- scripting.md 254 行 + global-scripts-and-queues.md 439 行 = 693 行
- Current Capabilities 抽 7-10 条 Requirement：脚本生命周期、SDK、Script.scope、profile.id、双队列、main(args)、runScript、PROFILE_BUSY、CDP 端口、持久化兼容
- Legacy 附录采用**摘要 + 指向 git 历史**策略（避免文件超 1500 行）：开头放两份历史文档的 §1-§2 主旨段；详细内容指向 git 历史 + 即将归档的 .kiro/specs

### 5.2 archive STATUS 模板

每个 legacy archive 目录新增 STATUS.md，统一字段：

```yaml
- slug: 2026-05-<original-slug>
- module: desktop/scripts
- type: feat
- status: archived
- legacy: true
- migrated-from: .kiro/specs/<original-name>/
- migrated-at: 2026-06-01
- created-at: <approx-from-handoff-history>

## Log
- <created-at> | created in .kiro/specs (legacy structure) | <one-line-from-original>
- 2026-06-01 | archived (legacy=true) | migrated as part of 2026-06-migrate-legacy-docs

## Legacy Notice
<2-3 lines: missing test-plan/release-notes/retrospective; original spec is the historical record>
```

### 5.3 handoff 文件命名

把 `handoff-2026-05-18.md` 这种格式去掉前缀 `handoff-`，因为它们已经在 `docs/handoffs/` 目录里，前缀冗余：

- `handoff-2026-05-18.md` → `2026-05-18.md`
- `handoff-2026-05-26.md` → `2026-05-26.md`
- `handoff-2026-05-26-router-refactor.md` → `2026-05-26-router-refactor.md`
- ...
- `scripting-handoff.md` → `scripting.md`（特殊：不是日期型，是按主题）
- `test-checklist-2026-05-29.md` → `test-checklist-2026-05-29.md`（保持原名，不是 handoff 类型）

### 5.4 删除时机

按依赖顺序：

1. baseline 内容创建完毕（Phase 1）→ 可删 `docs/specs/anti-detection.md` / `scripting.md` / `global-scripts-and-queues.md`
2. archive 内容创建完毕（Phase 2）→ 可删 `.kiro/specs/global-scripts-*`
3. handoff 全部 mv 完（Phase 3）→ `docs/specs/` 已空，删空目录
4. AGENT.md 删除（Phase 4）—— 最后一步，确认 AGENTS.md 已在 main 上充分启用

## 6. Alternatives Considered

**A. 保留 docs/specs/ 与 baseline/ 双份，不删**
- 优点：纯添加，零风险
- 缺点：违反 bootstrap-process 的工具中立设计，"哪个是真"的歧义重新出现
- 不选

**B. 一次性大 commit，全部迁移在一个 commit 里完成**
- 优点：简单
- 缺点：rollback 难；review 难；违反 task 阈值（远超 300 行）
- 不选

**C. (选定) 4-phase 多 commit，按依赖顺序**
- 优点：每个 task 独立可验证、可回滚；commit 历史清晰
- 缺点：commit 数较多
- 选定

## 7. ADR Triggers

无。本 change 不引入新全局约定；所有决策都是在 bootstrap-process 已有约定下的具体执行。

## 8. Cross-stack Considerations

N/A: backend 未引入；本 change 仅 desktop 模块的文档迁移。

## 9. Risks & Mitigations

| 风险 | 影响 | 缓解 |
|---|---|---|
| baseline Current Capabilities 抽错关键 Requirement | 后续 agent 误读 | 接受 v1 不完美；后续 change 通过 delta 修订 |
| git mv 不被识别为 rename | 历史断裂、blame 失效 | 每次 mv 后立刻 git status 验证 R 状态 |
| handoff 改名后某些链接断 | docs/PROJECT_GUIDE.md 等内部引用失效 | 本 change 不修改 PROJECT_GUIDE.md；改名只去前缀，路径稳定（同目录）；如有断裂在 testing 阶段发现并修 |
| AGENT.md 在 git 历史中被引用 | 老 commit 看历史时找不到 | 接受；git history 看老版本仍可达 |
| .kiro/specs/global-scripts-* 删除后 Kiro UI 找不到 | Kiro 体验降级 | Kiro 的 "spec UI" 是 enhancement，不是真源；删除后 Kiro 仍能用 specs/changes/ 工作 |

## 10. Out of Scope (Design Layer)

- 不引入自动化迁移脚本（手工 git mv 即可）
- 不引入 commit 格式校验工具
- 不修改 docs/process/ 任何文件

## 11. Validation Strategy

- 单点 verify（每 task 内）：ls / cat / grep 验证文件就位、内容正确
- spec-level test-plan：模拟新 agent 读 AGENTS.md → docs/process/ → specs/baseline/desktop/{stealth,scripts}/spec.md 流转通顺；docs/handoffs/ 列表完整；旧位置不存在

## 12. Acceptance Criteria

- [ ] `specs/baseline/desktop/stealth/spec.md` 存在，含 Current Capabilities + Legacy 附录
- [ ] `specs/baseline/desktop/scripts/spec.md` 存在，含 Current Capabilities + Legacy 摘要
- [ ] `specs/archive/desktop/scripts/2026-05-{global-scripts-and-queues,phase-6-runtime,profile-launch-close}/` 三个目录存在，各含 STATUS.md (legacy=true)
- [ ] 三个 archive 目录均不含 .config.kiro
- [ ] `docs/handoffs/` 含 10 个文件
- [ ] `docs/specs/` 不存在
- [ ] `AGENT.md` 不存在
- [ ] `.kiro/specs/global-scripts-*` 不存在
- [ ] pnpm run build 通过
- [ ] 模拟新 agent 流转通畅
