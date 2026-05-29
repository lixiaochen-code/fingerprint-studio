# Handoff: 2026-05-bootstrap-process

> **续作入口**。任何人/agent 接手本 change 时，先读这一份就够了。详细规范见 `docs/process/`。
>
> Last updated: 2026-05-29 19:20

---

## 1. 当前状态一眼看

| 项 | 值 |
|---|---|
| change | `2026-05-bootstrap-process` |
| branch | `change/_cross/2026-05-bootstrap-process` |
| STATUS.status | `in-progress` |
| 已完成 | T-01 ~ T-13、TT-01、TT-02、design revision 1 |
| 已撤销 | T-14、T-15、T-16、TT-03（git revert，文件全部回原位） |
| 待做 | T-14 ~ T-21、TT-03 ~ TT-05（全部为"迁移类"任务） |
| 暂停原因 | 用户希望先稳定规范文档，迁移延后做 |
| 推荐下一步 | 把 bootstrap change 的 scope 缩到"只建立规范"，迁移开新 change（见 §6） |

---

## 2. 目录现状（核对用）

```
auto-registry/
├── AGENTS.md                            ✅ 主入口
├── CLAUDE.md → AGENTS.md                ✅ symlink
├── GEMINI.md → AGENTS.md                ✅ symlink
├── .cursorrules → AGENTS.md             ✅ symlink
├── .github/copilot-instructions.md → ../AGENTS.md  ✅ symlink
├── AGENT.md                             ⚠️ 旧文件，待迁移阶段删除
├── docs/
│   ├── PROJECT_GUIDE.md                 ✅ 项目知识（迁自 AGENT.md）
│   ├── CODING_STANDARDS.md              （不动）
│   ├── process/
│   │   ├── 00-overview.md               ✅
│   │   ├── 01-requirements.md           ✅
│   │   ├── 02-design.md                 ✅
│   │   ├── 03-development.md            ✅
│   │   ├── 04-testing.md                ✅
│   │   ├── 05-release.md                ✅
│   │   ├── 06-archive.md                ✅
│   │   └── templates/                   ✅ 8 份模板齐
│   └── specs/                           ⚠️ 旧目录待迁移
│       ├── anti-detection.md            ⏳ T-14 待做
│       ├── scripting.md                 ⏳ T-15 待做
│       ├── global-scripts-and-queues.md ⏳ T-15 待做
│       ├── handoff-*.md (8 份)          ⏳ T-19 待做
│       ├── scripting-handoff.md         ⏳ T-19 待做
│       └── test-checklist-2026-05-29.md ⏳ T-19 待做
├── .kiro/
│   ├── steering/process.md              ✅ Kiro 自动加载
│   └── specs/                           ⚠️ 旧目录待迁移
│       ├── global-scripts-and-queues/   ⏳ T-16 待做
│       ├── global-scripts-phase-6-runtime/ ⏳ T-17 待做
│       └── global-scripts-profile-launch-close/ ⏳ T-18 待做
├── specs/
│   ├── baseline/
│   │   ├── desktop/
│   │   │   ├── profiles/spec.md          ✅ TBD 占位
│   │   │   ├── proxies/spec.md           ✅ TBD 占位
│   │   │   ├── kernel/spec.md            ✅ TBD 占位
│   │   │   ├── stealth/                  ⏳ 空目录（T-14 会创建 spec.md）
│   │   │   └── scripts/                  ⏳ 空目录（T-15 会创建 spec.md）
│   │   ├── backend/README.md             ✅ 占位
│   │   └── shared/README.md              ✅ 占位
│   ├── changes/2026-05-bootstrap-process/
│   │   ├── STATUS.md                     ✅ status=in-progress
│   │   ├── proposal.md                   ✅ approved (Q1-Q7 已答)
│   │   ├── design.md                     ✅ designed + revision 1
│   │   ├── tasks.md                      ✅ 21 tasks，已完成 13 个
│   │   └── HANDOFF.md                    ✅ 本文件
│   └── archive/                          ✅ 骨架就绪，所有目录有 .gitkeep
└── electron/, src/, ...                  （业务代码不动）
```

---

## 3. git log 速读

```
5e6bf13  docs: pause migration phase                              ← HEAD
3605cca  revert: roll back T-14/T-15/T-16/TT-03 (migration deferred)
f0622d4  archive: T-16 migrate global-scripts-and-queues          ← 已被 revert
073ca01  test: TT-03 PR-3 pass                                    ← 已被 revert
efe6e00  spec: T-15 migrate scripting docs                        ← 已被 revert
ae12839  spec: T-14 migrate anti-detection                        ← 已被 revert
7a359ee  test: TT-02 PR-2 pass
4c61543  spec: T-13 archive skeleton
cb13145  spec: T-12 baseline skeleton
9f1766e  docs: design revision 1 (single PR for bootstrap)
22125a0  test: TT-01 PR-1 pass
827f74d  docs: T-11 .kiro/steering/process.md
1ed4939  docs: T-10 PROJECT_GUIDE.md
b3cee88  docs: T-09 AGENTS.md + symlinks
62c135a  docs: T-08 06-archive.md
deb1c10  docs: T-07 05-release.md
29b5c65  docs: T-06 04-testing.md
3da353b  docs: T-05 03-development.md
5efa6d3  docs: T-04 02-design.md
68f3136  docs: T-03 01-requirements.md
6698eb5  docs: T-02 00-overview.md
eb92b7f  docs: T-01 templates
afbe464  docs: proposal approved (Q1-Q7)
d9bc094  docs: initial proposal draft
```

---

## 4. 待做任务清单（按 PR 分组）

### PR-3：baseline 内容迁移

- **T-14** 把 `docs/specs/anti-detection.md` 内容抽成 `specs/baseline/desktop/stealth/spec.md`
  - 顶部写 `## Current Capabilities`（OpenSpec Requirement + Scenario）
  - 末尾保留 `## Legacy Design Document` 含 anti-detection 全文
  - 删除原 `docs/specs/anti-detection.md`

- **T-15** 把 `docs/specs/scripting.md` + `docs/specs/global-scripts-and-queues.md` 合并成 `specs/baseline/desktop/scripts/spec.md`
  - 同样格式：Current Capabilities + Legacy Design Document
  - 由于两份合起来很长，Legacy 附录可只摘要 + 指向 git 历史（这是上次 revert 的 design revision 3 的做法，可以参考也可以重新议）
  - 删除原两份文件

- **TT-03** PR-3 合规检查：
  - 抽查两份 baseline 是否反映现状
  - 确认原 `docs/specs/*.md` 已删除（剩 handoff-* 待 PR-5 处理）

### PR-4：archive 历史迁移

- **T-16** `git mv .kiro/specs/global-scripts-and-queues specs/archive/desktop/scripts/2026-05-global-scripts-and-queues`
  - 加 `STATUS.md`（status=archived, legacy=true，参考下面 §5 模板）
  - 删除 `specs/archive/desktop/scripts/.gitkeep`（目录已有内容）

- **T-17** `git mv .kiro/specs/global-scripts-phase-6-runtime specs/archive/desktop/scripts/2026-05-phase-6-runtime`
  - 删除其中的 `.config.kiro`（Kiro 工具特定，不进 tool-neutral 归档）
  - 加 `STATUS.md`

- **T-18** `git mv .kiro/specs/global-scripts-profile-launch-close specs/archive/desktop/scripts/2026-05-profile-launch-close`
  - 删除 `.config.kiro`
  - 加 `STATUS.md`

- **TT-04** PR-4 合规检查：
  - `.kiro/specs/` 下不再有 `global-scripts-*`
  - 三份 archive 都有 STATUS.md（legacy=true）
  - 三份归档不含 `.config.kiro`

### PR-5：handoff 迁移与旧目录清理

- **T-19** `git mv docs/specs/handoff-*.md docs/specs/scripting-handoff.md docs/specs/test-checklist-*.md docs/handoffs/`
  - 共 11 个文件
  - 不重命名、不改内容

- **T-20** 删除空 `docs/specs/` + 删除根 `AGENT.md`
  - `git rm AGENT.md`（内容已迁到 AGENTS.md + PROJECT_GUIDE.md，可放心删）
  - `rmdir docs/specs/`（如果空）

- **T-21** 清理 `.kiro/specs/` 空目录
  - `rmdir .kiro/specs/`（空目录） 或 `git ls-files` 确认无残留

- **TT-05** PR-5 全量合规检查：
  - 模拟新 agent 流程：AGENTS.md → 00-overview → 选一个旧 module 看 baseline 能否理解
  - `docs/handoffs/` 列表完整
  - `docs/specs/` 不存在
  - `AGENT.md` 不存在

### Phase 6：测试 + 上线 + 归档

测试方案：spec-level test-plan.md（详见 04-testing.md）

- 至少这些 TT：
  - 模拟新 agent 工作流（AGENTS.md → 00-overview → 选一个 phase 文档 → 起步）
  - symlink 在 macOS 下功能正常
  - `pnpm run build` 通过（虽然这次没动业务代码，仍跑一遍确认）

上线（详见 05-release.md）：
- 版本号：建议 **0.2.0**（minor，因为引入了新流程基础设施，对开发流程是较大的功能性变化；patch 也不无道理，看你定）
- release-notes 写"建立 AI 驱动的开发流程"
- merge commit 到 main，打 tag `v0.2.0`，构建 mac 包，上传 GitHub Release

归档（详见 06-archive.md）：
- 写 retrospective.md（至少 3 段：做对的、做错的、下次改进的；3 行也行）
- `git mv specs/changes/2026-05-bootstrap-process specs/archive/_cross/2026-05-bootstrap-process`
- STATUS.status = `archived`

---

## 5. STATUS.md 模板（archive 用，legacy=true 版本）

T-16/T-17/T-18 给每个归档目录加这个：

```markdown
# STATUS

- slug: 2026-05-<name>
- module: desktop/scripts
- type: feat
- status: archived
- legacy: true
- migrated-from: .kiro/specs/<original>/
- migrated-at: 2026-05-29
- created-at: 2026-05-XX (estimated)

## Log

- 2026-05-XX (approx) | created in .kiro/specs (legacy structure) | <one-line>
- 2026-05-29 | archived (status=archived, legacy=true) | migrated to specs/archive/ as part of bootstrap-process change

## Legacy Notice

This change predates the formal AI development process (established by 2026-05-bootstrap-process). It does **not** include test-plan.md, release-notes.md, or retrospective.md. The historical record is the original three-file format (requirements.md / design.md / tasks.md) plus the corresponding handoff documents in `docs/handoffs/`.

The capabilities defined in this spec are reflected in `specs/baseline/desktop/scripts/spec.md` Current Capabilities section.
```

---

## 6. 推荐：拆分本 change 的范围

bootstrap change 当前包含两个独立目标：

1. **建立流程**（T-01 ~ T-13、TT-01、TT-02）✅ 已完成
2. **迁移历史**（T-14 ~ T-21、TT-03 ~ TT-05）⏳ 未做

我建议把它们拆成两个 change（这本身就是流程的好示范"小聚焦 change"）：

### 方案 A：拆分（推荐）

**bootstrap change** 缩到只覆盖目标 1：
- 改 `proposal.md §2 Scope`：删掉迁移相关内容；加一行"迁移留待后续 change"
- 改 `proposal.md §8 Out of Scope`：把"迁移历史 docs/specs/ 与 .kiro/specs/"显式列出
- 改 `tasks.md`：删掉 T-14 ~ T-21（或在文件顶部标"以下任务移到下个 change"）
- 改 `design.md`：在 §14 验收标准中删除迁移相关项

然后 bootstrap 就可以走测试 → 上线 → 归档的剩余流程，**完整跑一次完整流程**。

新开 change `2026-05-migrate-legacy-docs`（slug 例：`2026-05-migrate-legacy`），覆盖目标 2。直接复用本文件的 §4 作为新 change 的 tasks.md 起点。

### 方案 B：保留（不推荐）

让 bootstrap change 同时背两个目标，保留现状直到迁移做完。坏处：
- bootstrap change 的 STATUS 长期 in-progress
- 你随时回来都要看完整的 21 个 task
- 不示范"小聚焦"原则

---

## 7. 任何 agent 续作时的第一件事

1. 读 `AGENTS.md` → `docs/process/00-overview.md`（流程总览）
2. 读本文件（HANDOFF.md）
3. 读 `STATUS.md` 确认 last-updated 后是否有新 commit（`git log --oneline -10`）
4. 决定走方案 A 还是 B
5. 按方案对应步骤推进

如果是同一台机器、隔了几天回来，**只读本文件**就够，第 3 步用 `git status` + `git log -5` 即可。

---

## 8. Open Questions（留给你回来再决定）

- **方案 A 还是 B？** 我推荐 A
- **bootstrap 的版本号定 0.1.4 (patch) 还是 0.2.0 (minor)？** 我倾向 0.2.0
- **handoff-*.md 旧 spec 子系统状态文档（`scripting-handoff.md`）也归到 `docs/handoffs/` 吗？** 我倾向是
- **AGENT.md 删了之后，要不要保留一份指向 AGENTS.md 的占位文件？** 我倾向不保留（克隆者直接看 AGENTS.md 即可）
- **stealth/scripts 在 baseline 下当前是空目录，git 不会跟踪。要不要加 `.gitkeep` 现在占位？** 我倾向 T-14/T-15 做的时候直接建 `spec.md`，不需要 .gitkeep

---

## 9. 当前 commit 数据点

- 总 commit: 25
- T-task: 13 done / 21 total
- TT: 2 done / 5 total
- 累计行数：~3500 行新增（规范文档 + 模板 + 入口文件）
- 业务代码改动：0
- pnpm run build：未跑（本 change 没动业务代码，但归档前应跑一次）
