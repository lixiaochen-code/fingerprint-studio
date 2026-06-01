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
- status: todo
- 步骤:
  1. `cat AGENTS.md | head -20` — 第一段必须在 30 行内引用 `docs/process/00-overview.md`
  2. `cat docs/process/00-overview.md | head -10` — 必须含状态机图
  3. `ls docs/process/` — 含 7 份规范 + templates/
  4. `ls docs/process/templates/` — 含 8 份模板
- executed-at: 
- result: 
- evidence: 

### TT-A2 各 agent 工具入口 symlink 一致

- method: 手工
- linked-requirement: proposal §5 "agent 工具不需要重复维护"
- status: todo
- 步骤:
  1. `git ls-files -s AGENTS.md CLAUDE.md GEMINI.md .cursorrules .github/copilot-instructions.md`
  2. AGENTS.md mode = 100644，其余 4 mode = 120000
  3. `cat CLAUDE.md GEMINI.md .cursorrules .github/copilot-instructions.md` 全部输出与 AGENTS.md 一致
- executed-at: 
- result: 
- evidence: 

### TT-A3 各环节规范独立可读

- method: 手工
- linked-requirement: proposal §5 "单独读某环节规范也能干活"
- status: todo
- 步骤:
  1. 每份 `docs/process/0N-*.md` 单独打开
  2. 检查骨架 9 节齐全（环节定位 / 进入条件 / 必备产物 / agent 流程 / 人类流程 / 验收标准 / 退出动作 / 反例 / 接口）
  3. 不需读其他环节文档即可获得：进入 / 产物路径 / 操作步骤 / 验收 / 退出
- executed-at: 
- result: 
- evidence: 

### TT-A4 总规范整合状态机

- method: 手工
- linked-requirement: proposal §5 "总规范整合环节"
- status: todo
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
- executed-at: 
- result: 
- evidence: 

### TT-A5 目录骨架与 design §2 一致

- method: 手工
- linked-requirement: proposal §5 "归档形成模块化树形结构"（骨架部分）
- status: todo
- 步骤:
  1. `find specs -type d | sort`
  2. 输出含 baseline/{desktop/{profiles,proxies,scripts,stealth,kernel},backend,shared} + archive/{desktop/{...},backend,shared,_cross} + changes
  3. backend/shared 各有 README.md 占位
- executed-at: 
- result: 
- evidence: 

### TT-A6 工具中立性 — 不依赖 .kiro/

- method: 手工
- linked-requirement: proposal §5 "不用 Kiro 也能跑"
- status: todo
- 步骤:
  1. 临时 `mv .kiro /tmp/.kiro.backup`
  2. 检查 `cat AGENTS.md`、`docs/process/`、`specs/` 全部可读
  3. 流程数据完整不依赖 .kiro/
  4. 测试结束后 `mv /tmp/.kiro.backup .kiro` 恢复
- executed-at: 
- result: 
- evidence: 

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
- status: todo
- 步骤:
  1. `cat specs/baseline/backend/README.md` — 含"暂无后端，未来在此组织"
  2. `cat specs/baseline/shared/README.md` — 含"跨端契约，未来在此"
  3. `find specs/baseline/backend specs/baseline/shared -type f` — 仅 README.md，无空模块目录
- executed-at: 
- result: 
- evidence: 

### TT-A9 PROJECT_GUIDE.md 完整覆盖原 AGENT.md 项目知识

- method: 手工
- linked-requirement: design §10 AGENT.md 拆分映射表
- status: todo
- 步骤:
  1. `grep -c "^## " docs/PROJECT_GUIDE.md` ≥ 10
  2. 抽查 §3 反检测策略、§7 技术栈硬约束、§8 常用命令存在
  3. 路径已更新指向 `specs/baseline/`（设计层面已就绪，即使 baseline 内容尚未迁入）
- executed-at: 
- result: 
- evidence: 

### TT-A10 build 全绿

- method: 自动
- linked-requirement: 03-development §6 "pnpm run build 在本地通过"
- status: todo
- 步骤:
  1. `pnpm run build`
  2. exit code = 0，无类型错误，无构建告警
- executed-at: 
- result: 
- evidence: 

## 4. Out-of-band Verification

无。本 change 不动业务代码，无反指纹 / IPC / 启动流程改动。

## 5. Execution Log

> 每次执行追加；fail → retest 全部留下。

- 2026-05-29 19:01 | TT-A7 pass (Kiro auto-loaded steering during T-11 commit)

## 6. Sign-off

- [ ] TT-A1 ~ TT-A10 全部 status = pass
- [ ] §5 Execution Log 含每个 TT 至少一条 pass 记录
- [ ] pnpm run build 通过
- [ ] 进入 release 环节
