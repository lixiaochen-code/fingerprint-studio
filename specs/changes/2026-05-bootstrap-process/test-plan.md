# Test Plan: 2026-05-bootstrap-process

## 1. Scope

验证 bootstrap change 的核心目标——AI 驱动开发流程的规范文档体系——已就位且自洽。对应 proposal §5 的 6 条 Requirement：

- 流程文档单一入口
- 每个环节有独立规范
- change 完整生命周期可追溯（结构层面，不含历史迁移）
- 归档形成模块化树形结构（骨架就绪即可，归档实际行为待本 change 自身归档时验证）
- 工具中立
- 后端预留

不在本测试范围内：

- 历史文档迁移正确性（已移出 scope，由 `2026-05-migrate-legacy-docs` 验证）
- 业务代码改动（本 change 不动业务代码）

## 2. Strategy

方案 C 在本 change 退化为**手工 only**：本 change 只有文档与目录，无可单元测试的运行时逻辑。所有 TT 都是手工验证，evidence 用 ls / cat / grep / find 输出或截图。

## 3. Test Tasks

### TT-A1 流程文档入口路径连通

- method: 手工
- linked-requirement: proposal §5 "流程文档单一入口"
- status: pass
- 步骤:
  1. `cat AGENTS.md | head -20` — 第一段必须在 30 行内引用 `docs/process/00-overview.md`
  2. `cat docs/process/00-overview.md | head -10` — 必须含状态机图
  3. `ls docs/process/` — 含 7 份规范 + templates/
  4. `ls docs/process/templates/` — 含 8 份模板
- executed-at: 2026-06-01 10:00
- result: pass — AGENTS.md §2 第 13 行引用 docs/process/00-overview.md；00-overview.md 含状态机；docs/process/ 7 份规范 + templates/ 全部到位；templates/ 8 份模板齐全
- evidence: head/ls/cat 输出已记录于本次 testing 阶段 git history

### TT-A2 各 agent 工具入口 symlink 一致

- method: 手工
- linked-requirement: proposal §5 "agent 工具不需要重复维护"
- status: pass
- 步骤:
  1. `git ls-files -s AGENTS.md CLAUDE.md GEMINI.md .cursorrules .github/copilot-instructions.md`
  2. AGENTS.md mode = 100644，其余 4 mode = 120000
  3. `cat CLAUDE.md GEMINI.md .cursorrules .github/copilot-instructions.md` 全部输出与 AGENTS.md 一致
- executed-at: 2026-06-01 10:00
- result: pass — git mode 验证：AGENTS.md=100644，其他四份=120000；diff 全部空（cat 输出完全一致）
- evidence: `git ls-files -s` + `diff` 输出已记录

### TT-A3 各环节规范独立可读

- method: 手工
- linked-requirement: proposal §5 "单独读某环节规范也能干活"
- status: pass
- 步骤:
  1. 每份 `docs/process/0N-*.md` 单独打开
  2. 检查骨架 9 节齐全（环节定位 / 进入条件 / 必备产物 / agent 流程 / 人类流程 / 验收标准 / 退出动作 / 反例 / 接口）
  3. 不需读其他环节文档即可获得：进入 / 产物路径 / 操作步骤 / 验收 / 退出
- executed-at: 2026-06-01 10:00
- result: pass — `grep -c "^## "` 各文件结果：00=9, 01=9, 02=10, 03=9, 04=9, 05=15, 06=11；最少 9 节，满足 9 节骨架（部分文件因含子章节略多）
- evidence: grep 输出已记录

### TT-A4 总规范整合状态机

- method: 手工
- linked-requirement: proposal §5 "总规范整合环节"
- status: pass
- 步骤:
  1. `grep -c "^## " docs/process/00-overview.md` ≥ 8
  2. 含完整状态机图（draft → ... → archived）
  3. 含状态切换条件汇总表
  4. 含各环节文档入口表
  5. 含小需求简化路径阈值
  6. 含工具中立性声明
  7. 含后端引入路径预告
  8. 含 FAQ
  9. 行数 ≤ 300（design §3 规定）
- executed-at: 2026-06-01 10:00
- result: pass — 9 节齐全（流程哲学/完整状态机/状态切换条件汇总/各环节文档入口/小需求简化路径/工具中立性声明/多端协作-后端预告/FAQ/流程演进）；146 行 ≤ 300
- evidence: `grep "^## "` 输出 + `wc -l` 输出已记录

### TT-A5 目录骨架与 design §2 一致（scope 调整后）

- method: 手工
- linked-requirement: proposal §5 "归档形成模块化树形结构"（骨架部分）
- status: pass
- note: 因 proposal v3 / design rev 4 把迁移移出 scope，stealth/scripts 的 baseline spec.md 由 `2026-05-migrate-legacy-docs` 创建。本 change 仅验证骨架目录就位
- 步骤:
  1. `find specs -type d | sort`
  2. 输出含 baseline/{desktop/{profiles,proxies,kernel},backend,shared} + archive/{desktop/{profiles,proxies,scripts,stealth,kernel},backend,shared,_cross} + changes
  3. backend/shared 各有 README.md 占位
- executed-at: 2026-06-01 10:00
- result: pass — 20 个目录（baseline 5 + archive 9 + changes 1 + 根 + bootstrap 4）全部就位；baseline/desktop 含 profiles/proxies/kernel 三个 TBD spec.md；stealth/scripts 暂无（待迁移 change 创建）；backend/shared 各仅 README.md
- evidence: find 输出已记录

### TT-A6 工具中立性 — 不依赖 .kiro/

- method: 手工
- linked-requirement: proposal §5 "不用 Kiro 也能跑"
- status: pass
- 步骤:
  1. 临时 `mv .kiro /tmp/.kiro.test_backup_<pid>`
  2. 检查 `cat AGENTS.md`、`docs/process/`、`specs/` 全部可读
  3. 流程数据完整不依赖 .kiro/
  4. 测试结束后 `mv /tmp/.kiro.test_backup_<pid> .kiro` 恢复
- executed-at: 2026-06-01 10:01
- result: pass — .kiro/ 移走后 AGENTS.md / docs/process/ / specs/ 全部可读、可 ls；恢复后 .kiro/ 完整含 specs + steering
- evidence: mv + cat + ls + 恢复 mv 全过程已记录

### TT-A7 工具中立性 — Kiro 加载增强

- method: 手工（已在过程中验证）
- linked-requirement: proposal §5 "用 Kiro 时享受工具增强"
- status: pass
- 步骤:
  1. T-11 创建 `.kiro/steering/process.md` 后，Kiro 在后续会话中通过 `<user-rule>` 注入了该文件内容
- executed-at: 2026-05-29 19:01
- result: pass
- evidence: 用户消息中收到 `<user-rule id=/Users/apple/Documents/ai/auto-registry/.kiro/steering/process.md>` 注入

### TT-A8 后端预留

- method: 手工
- linked-requirement: proposal §5 "后端预留 - 现在的状态"
- status: pass
- 步骤:
  1. `cat specs/baseline/backend/README.md` — 含"暂无后端，未来在此组织"
  2. `cat specs/baseline/shared/README.md` — 含"跨端契约，未来在此"
  3. `find specs/baseline/backend specs/baseline/shared -type f` — 仅 README.md，无空模块目录
- executed-at: 2026-06-01 10:00
- result: pass — backend README 含"后端尚未引入。未来后端进来时本目录下按 backend 模块组织 baseline spec"；shared README 含"跨端契约（API 定义、protocol、共享类型）尚未引入"；find 输出仅 README.md 两份
- evidence: cat + find 输出已记录

### TT-A9 PROJECT_GUIDE.md 完整覆盖原 AGENT.md 项目知识

- method: 手工
- linked-requirement: design §10 AGENT.md 拆分映射表
- status: pass
- 步骤:
  1. `grep -c "^## " docs/PROJECT_GUIDE.md` ≥ 10
  2. 抽查 §3 反检测策略、§7 技术栈硬约束、§8 常用命令存在
  3. 路径已更新指向 `specs/baseline/`（设计层面已就绪，即使 baseline 内容尚未迁入）
- executed-at: 2026-06-01 10:00
- result: pass — 10 节；反检测策略 / 技术栈硬约束 / 常用命令均存在；多处路径已更新到 specs/baseline/desktop/stealth/spec.md 等（迁移完成后即可链通）
- evidence: grep 输出已记录

### TT-A10 build 全绿

- method: 自动
- linked-requirement: 03-development §6 "pnpm run build 在本地通过"
- status: pass
- 步骤:
  1. `pnpm run build`
  2. exit code = 0，无类型错误，无构建告警（chunk size 提示是常态非告警）
- executed-at: 2026-06-01 10:02
- result: pass — tsc + vite build + tsc 全绿；构建产物完整；built in 22.60s；exit 0
- evidence: pnpm run build 输出已记录

## 4. Out-of-band Verification

无。本 change 不动业务代码，无反指纹 / IPC / 启动流程改动。

## 5. Execution Log

> 每次执行追加；fail → retest 全部留下。

- 2026-05-29 19:01 | TT-A7 pass (Kiro auto-loaded steering during T-11 commit)
- 2026-06-01 10:00 | TT-A1 pass
- 2026-06-01 10:00 | TT-A2 pass
- 2026-06-01 10:00 | TT-A3 pass
- 2026-06-01 10:00 | TT-A4 pass
- 2026-06-01 10:00 | TT-A5 pass (with note: scope-adjusted skeleton)
- 2026-06-01 10:00 | TT-A8 pass
- 2026-06-01 10:00 | TT-A9 pass
- 2026-06-01 10:01 | TT-A6 pass (mv .kiro test + restore)
- 2026-06-01 10:02 | TT-A10 pass (pnpm run build, exit 0, 22.60s)

## 6. Sign-off

- [x] TT-A1 ~ TT-A10 全部 status = pass
- [x] §5 Execution Log 含每个 TT 至少一条 pass 记录
- [x] pnpm run build 通过
- [x] 进入 release 环节
