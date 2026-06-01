# Tasks: 2026-05-bootstrap-process

> Continue From: 迁移阶段（T-14 起）已应用户要求暂停。规范文档（T-01..T-13、TT-01、TT-02）建立完毕。等用户指令再启动 T-14。
> Last updated: 2026-05-29 by initial-author

## Conventions

- Status: `todo` | `in-progress` | `done` | `blocked`
- 一个 task 一个 commit (commit message 含 `[task: T-NN]`)
- 任务超阈值（>1 天 / >5 文件 / >300 行）必须拆
- TT-NN 是测试任务编号，定义在 test-plan.md

## Phase 1: 流程文档与入口（PR-1）

- [x] **T-01** 创建 `docs/process/templates/` 8 份模板
  - status: done
  - commit: (this commit)
  - files: docs/process/templates/{proposal,design,tasks,test-plan,release-notes,retrospective,STATUS,delta-spec}.md
  - verify: ls 看到 8 个文件，每份内含完整字段骨架（含 `N/A` 提示）
  - note: 模板字段全部必填，允许 N/A

- [x] **T-02** 创建 `docs/process/00-overview.md`（流程总规范）
  - status: done
  - commit: (this commit)
  - files: docs/process/00-overview.md
  - verify: 含 8 节（哲学/状态机图/切换条件/环节入口/小需求路径/工具中立/后端预告/FAQ），≤300 行 (146)

- [x] **T-03** 创建 `docs/process/01-requirements.md`
  - status: done
  - commit: (this commit)
  - files: docs/process/01-requirements.md
  - verify: 9 节骨架完整；含 OpenSpec 多轮 Q&A 模式说明；含 GIVEN/WHEN/THEN scenario 写法

- [x] **T-04** 创建 `docs/process/02-design.md`
  - status: done
  - commit: (this commit)
  - files: docs/process/02-design.md
  - verify: 9 节骨架完整；含 ADR 触发条件；含跨端设计指引（后端预留）

- [x] **T-05** 创建 `docs/process/03-development.md`
  - status: done
  - commit: (this commit)
  - files: docs/process/03-development.md
  - verify: 9 节骨架完整；含 commit 格式规则、task 阈值、跨电脑续作约定、small-change 简化路径

- [x] **T-06** 创建 `docs/process/04-testing.md`
  - status: done
  - commit: (this commit)
  - files: docs/process/04-testing.md
  - verify: 9 节骨架完整；含两层测试模型、TT 编号规则、Execution Log 格式

- [x] **T-07** 创建 `docs/process/05-release.md`
  - status: done
  - commit: (this commit)
  - files: docs/process/05-release.md
  - verify: 9 节骨架完整；含 10 步上线流水线、PR 描述模板、失败分级处理（含 Failed Attempt 留痕格式）

- [x] **T-08** 创建 `docs/process/06-archive.md`
  - status: done
  - commit: (this commit)
  - files: docs/process/06-archive.md
  - verify: 9 节骨架完整；含模块归档树规则、_cross 分类、归档只读约定、无观察期声明

- [x] **T-09** 创建 `AGENTS.md` 主文件 + symlinks
  - status: done
  - commit: (this commit)
  - files: AGENTS.md, CLAUDE.md, GEMINI.md, .cursorrules, .github/copilot-instructions.md
  - verify: AGENTS.md ~80 行；其余 4 文件 git ls-files -s mode = 120000（symlink，已验证）

- [x] **T-10** 创建 `docs/PROJECT_GUIDE.md`（迁原 AGENT.md 项目知识部分）
  - status: done
  - commit: (this commit)
  - files: docs/PROJECT_GUIDE.md
  - verify: 含 12 节中应迁入的 10 节（见 design §10 映射表）；路径已更新指向 specs/baseline/

- [x] **T-11** 创建 `.kiro/steering/process.md`（Kiro 自动加载入口）
  - status: done
  - commit: (this commit)
  - files: .kiro/steering/process.md
  - verify: front-matter `inclusion: always`；正文引用 docs/process/ 全部 7 份文档（已被 Kiro 自动加载，验证通过）

- [x] **TT-01** PR-1 合规检查（手工）
  - status: done (pass)
  - method: 手工
  - verify: ls 验证所有文件存在 → 模拟新 agent 读 AGENTS.md → docs/process/00-overview.md 流转通顺；symlink 在 macOS 上正常 cat
  - executed-at: 2026-05-29 19:02
  - result: pass — 7 份规范 + 8 模板 + AGENTS.md + 4 symlinks（全部解析正确）+ .kiro/steering/process.md 已被 Kiro 自动加载（证据：用户消息中收到 inline 规则注入）
  - evidence: ls 输出与 git log 已记录

> **PR-1 完成后**：在 main 上 merge，开 PR-2 分支（同一 change 分支即可，本 change 全程一个分支跑完）。

## Phase 2: specs/ 目录骨架（PR-2）

- [x] **T-12** 创建 `specs/baseline/` 目录骨架与占位 README
  - status: done
  - commit: (this commit)
  - files: specs/baseline/desktop/{profiles,proxies,kernel}/spec.md (TBD-stub), specs/baseline/{backend,shared}/README.md
  - verify: 树形结构与 design §2 一致；backend/shared 有 README 说明"暂空，未来扩展"；profiles/proxies/kernel 三模块有 TBD spec.md（stealth/scripts 留空待 PR-3 迁入）

- [x] **T-13** 创建 `specs/archive/` 目录骨架
  - status: done
  - commit: (this commit)
  - files: specs/archive/desktop/{profiles,proxies,scripts,stealth,kernel}/.gitkeep, specs/archive/{backend,shared,_cross}/.gitkeep
  - verify: 树形结构与 design §2 一致（已 find specs 验证）

- [x] **TT-02** PR-2 合规检查
  - status: done (pass)
  - method: 手工
  - verify: find specs -type d 输出与 design §2 完全一致
  - executed-at: 2026-05-29 19:08
  - result: pass — 22 个目录全部就位（baseline 7 + archive 8 + changes 2 + 根 + bootstrap-process 4）
  - evidence: find 输出已记录


## Phase 3-5: 历史文档迁移（已移出本 change scope）

> 2026-05-29 proposal v3 / design revision 4：用户指令"先定义规范文档，迁移后面做"。
> 原 T-14 ~ T-21、TT-03 ~ TT-05 全部移到新 change：`2026-05-migrate-legacy-docs`，走完整流程处理。
> 本 change 自此只剩 Phase 1（规范文档）+ Phase 2（目录骨架）+ Phase 6（spec 测试 / 发版 / 归档）。

## Phase 6: 测试与发版

> Phase 1 + 2 全部 task done 后，本 change 进入 testing 阶段。
> 详见 `test-plan.md`（spec-level TT）与 `release-notes.md`（发版）。
