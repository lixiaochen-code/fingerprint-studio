# Tasks: 2026-05-bootstrap-process

> Continue From: T-08 not started (T-01..T-07 done)
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

- [ ] **T-08** 创建 `docs/process/06-archive.md`
  - status: todo
  - commit: 
  - files: docs/process/06-archive.md
  - verify: 9 节骨架完整；含模块归档树规则、_cross 分类、归档只读约定、无观察期声明

- [ ] **T-09** 创建 `AGENTS.md` 主文件 + symlinks
  - status: todo
  - commit: 
  - files: AGENTS.md, CLAUDE.md, GEMINI.md, .cursorrules, .github/copilot-instructions.md
  - verify: AGENTS.md ~100 行；其余 4 文件 `git ls-files -s` mode = 120000（symlink）

- [ ] **T-10** 创建 `docs/PROJECT_GUIDE.md`（迁原 AGENT.md 项目知识部分）
  - status: todo
  - commit: 
  - files: docs/PROJECT_GUIDE.md
  - verify: 含 12 节中应迁入的 10 节（见 design §10 映射表）；路径已更新指向 specs/baseline/

- [ ] **T-11** 创建 `.kiro/steering/process.md`（Kiro 自动加载入口）
  - status: todo
  - commit: 
  - files: .kiro/steering/process.md
  - verify: front-matter `inclusion: always`；正文引用 docs/process/ 全部 7 份文档

- [ ] **TT-01** PR-1 合规检查（手工）
  - status: todo
  - method: 手工
  - verify: ls 验证所有文件存在 → 模拟新 agent 读 AGENTS.md → docs/process/00-overview.md 流转通顺；symlink 在 macOS 上正常 cat
  - executed-at: 
  - result: 
  - evidence: 

> **PR-1 完成后**：在 main 上 merge，开 PR-2 分支（同一 change 分支即可，本 change 全程一个分支跑完）。

## Phase 2: specs/ 目录骨架（PR-2）

- [ ] **T-12** 创建 `specs/baseline/` 目录骨架与占位 README
  - status: todo
  - commit: 
  - files: specs/baseline/desktop/{profiles,proxies,scripts,stealth,kernel}/.gitkeep, specs/baseline/{backend,shared}/README.md
  - verify: 树形结构与 design §2 一致；backend/shared 有 README 说明"暂空，未来扩展"

- [ ] **T-13** 创建 `specs/archive/` 目录骨架
  - status: todo
  - commit: 
  - files: specs/archive/desktop/{profiles,proxies,scripts,stealth,kernel}/.gitkeep, specs/archive/{backend,shared,_cross}/.gitkeep
  - verify: 树形结构与 design §2 一致

- [ ] **TT-02** PR-2 合规检查
  - status: todo
  - method: 手工
  - verify: tree -L 4 specs/ 输出与 design §2 完全一致
  - executed-at: 
  - result: 
  - evidence: 

## Phase 3: baseline 内容迁移（PR-3）

- [ ] **T-14** 迁移 anti-detection.md → specs/baseline/desktop/stealth/spec.md
  - status: todo
  - commit: 
  - files: specs/baseline/desktop/stealth/spec.md, docs/specs/anti-detection.md (删除留待 PR-5)
  - verify: spec.md 顶部有 OpenSpec 风格 Current Capabilities 段（至少 3 条 Requirement + 各自 Scenario）；末尾 Legacy Design Document 段含 anti-detection.md 全文

- [ ] **T-15** 迁移 scripting.md + global-scripts-and-queues.md → specs/baseline/desktop/scripts/spec.md
  - status: todo
  - commit: 
  - files: specs/baseline/desktop/scripts/spec.md, docs/specs/{scripting.md,global-scripts-and-queues.md} (删除留待 PR-5)
  - verify: 两文档内容合并去重后作为 Legacy 附录；Current Capabilities 段抽出至少 3 条 Requirement

- [ ] **TT-03** PR-3 合规检查
  - status: todo
  - method: 手工
  - verify: 抽查 stealth/spec.md 的 Current Capabilities 是否准确反映现状；抽查 scripts/spec.md 没有遗漏 global-scripts-and-queues 的关键内容
  - executed-at: 
  - result: 
  - evidence: 

## Phase 4: archive 历史迁移（PR-4）

- [ ] **T-16** 迁移 .kiro/specs/global-scripts-and-queues → specs/archive/desktop/scripts/2026-05-global-scripts-and-queues
  - status: todo
  - commit: 
  - files: 整目录 git mv；新增 STATUS.md (status=archived, legacy=true)
  - verify: 目录到位；STATUS.md 标 legacy

- [ ] **T-17** 迁移 .kiro/specs/global-scripts-phase-6-runtime → specs/archive/desktop/scripts/2026-05-phase-6-runtime
  - status: todo
  - commit: 
  - files: 同上；不带 .config.kiro
  - verify: 目录到位；不含 .config.kiro

- [ ] **T-18** 迁移 .kiro/specs/global-scripts-profile-launch-close → specs/archive/desktop/scripts/2026-05-profile-launch-close
  - status: todo
  - commit: 
  - files: 同上
  - verify: 目录到位

- [ ] **TT-04** PR-4 合规检查
  - status: todo
  - method: 手工
  - verify: ls -la .kiro/specs/ 不再含 global-scripts-*；archive 三目录 STATUS.md 都标 legacy
  - executed-at: 
  - result: 
  - evidence: 

## Phase 5: handoff 迁移与旧目录清理（PR-5）

- [ ] **T-19** 迁移 docs/specs/handoff-*.md + test-checklist-*.md → docs/handoffs/
  - status: todo
  - commit: 
  - files: git mv 11 个文件
  - verify: docs/handoffs/ 含全部历史文档；docs/specs/ 仅剩 anti-detection / scripting / global-scripts-and-queues 三个待删

- [ ] **T-20** 删除空 docs/specs/ + AGENT.md
  - status: todo
  - commit: 
  - files: 删 docs/specs/ 三文件 + AGENT.md
  - verify: ls docs/ 不见 specs/；ls 项目根不见 AGENT.md

- [ ] **T-21** 清理 .kiro/specs/ 空目录
  - status: todo
  - commit: 
  - files: rmdir .kiro/specs/{global-scripts-and-queues,global-scripts-phase-6-runtime,global-scripts-profile-launch-close}/.config.kiro 等遗留 + 整 .kiro/specs/ 目录
  - verify: ls .kiro/ 仅剩 steering/

- [ ] **TT-05** PR-5 全量合规检查
  - status: todo
  - method: 手工
  - verify: 模拟新 agent 流程 → AGENTS.md → 00-overview → 选一个旧 module 的 baseline 看能否理解；docs/handoffs/ 列表完整
  - executed-at: 
  - result: 
  - evidence: 

## Phase 6: 测试与发版（在所有 task 完成后）

详见 test-plan.md 的 spec-level TT 与 release-notes.md。
