# 06 归档规范

## 1. 环节定位

把已 shipped 的 change 整体冷冻，保留可检索的历史。归档目录与代码模块树形对应，便于按模块回查变更史。

## 2. 进入条件

- STATUS.status = `shipped`
- git tag 已存在
- GitHub Release 已发布
- baseline 已合并 delta（05-release Step 3 完成）

## 3. 必备产物

| 文件 | 路径 | 模板 |
|---|---|---|
| 复盘 | `specs/changes/<slug>/retrospective.md` | [templates/retrospective.md](templates/retrospective.md) |
| 归档目录 | `specs/archive/<module>/<slug>/` | 无（整目录 mv 而来） |

## 4. 操作流程（AI agent 视角）

1. **写 retrospective.md**
   - 按 templates/retrospective.md 起草
   - 至少答 §1 What Went Well、§2 What Went Wrong、§3 What to Improve
   - 失败过的 change（release-notes §6 Failed Attempts 不为空）必须在 §2 分析根因
2. **用户认可 retrospective**
   - 用户简单 "ok" 即可，不需要长论证
3. **整体迁移（用自动化脚本，推荐）**

   ```bash
   pnpm run archive <slug>
   ```

   该命令（`scripts/archive-change.mjs`，由 change `2026-06-archive-helper` 引入）自动：
   - 校验 STATUS.status == `shipped`（否则报错退出）
   - 把 `- status:` 字段改为 `archived`（**杜绝手动漏改 status 字段的笔误**）
   - 追加 Log 行 `YYYY-MM-DD | archived | moved to <path>. **READ-ONLY hereafter.**`
   - 按 STATUS.module 解析归档目标（`_cross` / `desktop/<module>`）
   - `git mv specs/changes/<slug> specs/archive/<target>/<slug>`（含父目录 .gitkeep 清理）
   - 跑 `validate-specs.mjs` 自检

   **应急手动流程**（脚本不可用时）：

   ```bash
   # 手动改 STATUS.status = archived（务必改 - status: 字段本身，不只是 Log）
   git mv specs/changes/<slug>/ specs/archive/<module>/<slug>/
   ```

   - `<module>` 与 STATUS.module 字段一致
   - 跨模块改动归 `_cross/`
4. **提交**
   - `archive(<slug>): move to archive/<module>`
   - commit 后再跑一次 `pnpm run validate:specs` 确认 0 error
5. **Push 到 main**
   - 归档动作在 main 上做（已 merge 完）

## 5. 操作流程（人类视角）

- review retrospective（很短）
- 说"归档" agent 即执行
- 之后想再改这个 change？**不行**，archive 只读。开新 change 引用旧 archive 路径。

## 6. 验收标准

- [ ] retrospective.md §1-§3 已填
- [ ] failed change 的 §2 含失败根因分析
- [ ] `specs/changes/<slug>/` 已不存在（已 mv）
- [ ] `specs/archive/<module>/<slug>/` 含完整原始文件（proposal / design / tasks / test-plan / release-notes / retrospective / STATUS / delta）
- [ ] STATUS.status = `archived`
- [ ] 在 main 上有 archive commit

## 7. 退出动作

- STATUS.status: `shipped` → `archived`
- archive commit 已 push 到 main
- change 分支可保留（作为历史 ref）也可删除（看项目偏好；本仓库默认保留 30 天再删）
- 不打额外 tag

## 8. 反例与禁忌

1. **写"一切顺利"敷衍**：retrospective 即使顺利也要写**做对了什么**，不能空文。
2. **归档后回去改**：archive 只读。要改开新 change。
3. **`archive/` 目录里出现 `in-progress` 状态**：违规，归档前必须改成 `archived`。
4. **归档前没合 delta 进 baseline**：05-release Step 3 漏做的话，archive 之后 baseline 与代码现状不一致。归档前 agent 必须验证 baseline 已更新。
5. **跨模块 change 归到某一具体模块**：必须归 `_cross/`，不要"凑就近"。

## 8.1 元数据笔误的修正（例外条款）

"archive 只读"约束**内容**（proposal / design / 决策），但**归档元数据的笔误**（`- status:` 字段值、拼写、路径错字）允许由后续 change 修正，前提是：

- 只改元数据，不改决策内容
- commit message 注明修正原因（例：`fix(<slug>): correct STATUS.status to archived (caught by validate:specs)`）

背景：`process-validators` 与 `build-resilience` 归档时都出现过 `- status:` 字段停在 `ready-to-ship` 的笔误。这正是 `pnpm run archive` 自动化要根除的；历史遗留的此类笔误按本条修正。

## 9. 与其他环节的接口

**上一环节（05-release）给我什么**

- STATUS.status = `shipped`
- git tag、GitHub Release、baseline 合并完成

**我给谁？**

- 后续任何 change：`archive/<module>/` 是查询历史的入口
- 后续 retrospective：本次的 retrospective.md 可被引用为对照

## 10. 归档树形结构

```
specs/archive/
├── desktop/
│   ├── profiles/
│   │   └── 2026-05-multi-launch/
│   │       └── ...（整个 change 的所有产物）
│   ├── proxies/
│   ├── scripts/
│   ├── stealth/
│   └── kernel/
├── backend/                   # 暂空，未来引入后端时启用
├── shared/                    # 暂空，跨端契约 change 归这
└── _cross/                    # 跨模块 change 归这
    └── 2026-05-bootstrap-process/   # 本次流程建立 change 自身将归此
```

模块名与代码目录 1:1 对应：

| baseline / archive 模块 | 代码目录 |
|---|---|
| `desktop/profiles` | `electron/store.ts` 中 profile 部分 |
| `desktop/proxies` | `electron/proxies/` |
| `desktop/scripts` | `electron/scripts/` |
| `desktop/stealth` | `electron/stealth/` + `electron/fingerprint.ts` |
| `desktop/kernel` | `electron/kernel.ts` + `electron/downloader.ts` |
| `desktop/_ui`（如有需要可加） | `src/` |

## 11. 无观察期声明

**当前阶段（项目早期、无用户、迭代快）：归档无观察期，shipped 后立即归档。**

未来引入用户后，本规范需修订增加：

- 观察期（建议 7 天）
- 期间 STATUS.status 暂留 `shipped`
- 期间发现关键 bug 走 hotfix；轻微 bug 不阻塞归档
- 7 天后再归档

修订届时通过新 change（slug 例如 `process-add-observation-window`）走流程引入，归档到 `_cross/`。
