# Proposal: 建立 AI 驱动的开发流程与归档体系

> 这是本仓库**第一份正式 change**。它的目标是建立"AI 开发流程"本身——之后所有需求都按这套流程走，包括对这套流程本身的修订。
>
> 元注释：因为流程还没建立，这份 proposal 自己也只能"半合规"——它先草拟了未来的规范，再用未来的规范回头审视自己。这是引导阶段必然的小自反，后续流程稳定后不会再有。

## 1. Intent（为什么要做）

当前仓库已经在用 AI agent 协作开发，但缺一条**贯穿"需求 → 设计 → 开发 → 测试 → 上线 → 归档"的固定流水线**和**留痕规范**。具体痛点：

1. **两套 spec 体系并存**：`docs/specs/`（人类可读设计文档）和 `.kiro/specs/`（Kiro 结构化 spec），职责模糊，agent 不知道该写哪边。
2. **生命周期不清**：一个 feature 从"想法"到"上线"中间发生了什么、何时归档、何时关闭，没有明确状态机。
3. **缺测试文档、上线/发布记录、变更日志**：测试只靠 handoff 文档零散记录，发版没有标准化材料。
4. **handoff 文档承担了太多职责**：实际是"阶段总结 + 知识传递 + bug 登记"混在一起，命名靠日期串，不易检索。
5. **工具绑定**：现有结构隐含依赖 Kiro，未来想换 Cursor / Codex / Gemini 协作时，agent 不知道流程在哪。
6. **缺多端预留**：未来要加后端，目前目录布局没考虑这一层。

## 2. Scope（这次做什么）

**做**：

- 在 `docs/process/` 下建立 7 份规范文档：1 份总规范 + 6 份环节规范 + 模板集
- 在 `specs/`（仓库根，工具中立）下建立 baseline / changes / archive 三层目录骨架（不含历史内容迁移）
- 建立 `AGENTS.md` 作为业界惯例的 agent 入口；`CLAUDE.md`、`GEMINI.md` 等用 symlink 指向它
- 建立 `docs/PROJECT_GUIDE.md`（迁原 AGENT.md 项目知识部分；不含 AGENT.md 本身的删除）
- 建立 `.kiro/steering/process.md` 让 Kiro 自动加载流程文档
- 在 `specs/baseline/{backend,shared}/` 预留后端目录（仅 README 占位）
- 单 PR 合并到 main（design revision 1 决定）

**不做**（已从 scope 移出，由后续 change `2026-05-migrate-legacy-docs` 处理）：

- 不迁移 `docs/specs/anti-detection.md` / `scripting.md` / `global-scripts-and-queues.md` 到 `specs/baseline/desktop/<module>/`
- 不迁移 `.kiro/specs/global-scripts-*` 到 `specs/archive/desktop/scripts/`
- 不迁移 `docs/specs/handoff-*.md` 到 `docs/handoffs/`
- 不删除 `docs/specs/` 与 `AGENT.md`（保留共存到下一 change）
- 不动 `electron/`、`src/`、`apps/` 物理结构
- 不引入新工具链（OpenSpec CLI、CI、测试框架）；这些可作为后续 change

## 3. Approach（大方向，不写实现细节）

借鉴 [OpenSpec](https://github.com/Fission-AI/OpenSpec) 的"specs / changes 二分 + delta 格式 + GIVEN/WHEN/THEN scenario"，但**不安装其 CLI**，避免与 Kiro 工具绑定。

核心目录哲学：

```
specs/
├── baseline/       # 真理之源："系统当前是什么样"，按 端/模块 组织
├── changes/        # 进行中：每个需求一个文件夹，含全套生命周期产物
└── archive/        # 已上线归档：按 端/模块 形成树形结构，一一对应代码模块
```

每个 change 的生命周期固定 8 状态（state machine）：

```
draft → approved → designed → in-progress → testing → ready-to-ship → shipped → archived
```

每次状态切换都要：

1. 改对应 markdown 文件里的字段
2. 在 `STATUS.md` 的 Log 里追加时间戳条目
3. 必要时打 git commit / tag

工具适配通过 `AGENTS.md` symlink 实现（`CLAUDE.md`、`GEMINI.md`、`.cursorrules` 等都软链到同一份）。

## 4. Affected Scopes（影响面）

| 范围 | 影响 |
|---|---|
| 端 | desktop（当前唯一的端） |
| 模块 | _cross（流程是跨模块的） |
| 代码 | 不动业务代码 |
| 现有文档 | 全部迁移，旧路径失效 |
| 现有 `.kiro/specs/` | 三个 spec 迁出到 `specs/archive/`；目录可能变空但保留 |
| 工具 | Kiro 仍可用（在 `.kiro/steering/` 里加引用），但流程数据不再放 `.kiro/` |

## 5. Requirements（需求 scenarios）

按 OpenSpec 风格用 GIVEN / WHEN / THEN 写，方便 agent 验收。

### Requirement: 流程文档单一入口

任何 AI agent 第一次进入这个仓库，必须能在 30 秒内找到流程文档入口。

#### Scenario: agent 通过约定文件名找到入口
- GIVEN 一个新 agent session
- WHEN agent 读取仓库根目录
- THEN agent 看到 `AGENTS.md`
- AND `AGENTS.md` 第一段就指向 `docs/process/00-overview.md`

#### Scenario: 各 agent 工具不需要重复维护
- GIVEN AGENTS.md 内容更新
- WHEN agent 读取 `CLAUDE.md` / `GEMINI.md` / `.cursorrules` 任一文件
- THEN 它们的内容与 AGENTS.md 一致（通过 symlink 实现）

### Requirement: 每个环节有独立规范

开发流程的 6 个环节（需求/设计/开发/测试/上线/归档）各有一份独立可读的规范文档。

#### Scenario: 单独读某环节规范也能干活
- GIVEN agent 只读 `docs/process/03-development.md`
- WHEN agent 收到一个开发任务
- THEN agent 能从该文档单独获得：进入条件、必备产物、操作步骤、验收标准、退出动作、反例
- AND 不需要回去读其他环节的文档

#### Scenario: 总规范整合环节
- GIVEN agent 读 `docs/process/00-overview.md`
- WHEN agent 想了解全流程
- THEN 总规范包含完整状态机图、状态切换条件汇总表、各环节文档的入口链接、小需求简化路径

### Requirement: change 完整生命周期可追溯

任何一次需求从提出到归档，全程留痕，且任何节点可以恢复到本机或换机继续。

#### Scenario: 跨电脑续作
- GIVEN agent 在电脑 A 上完成 task T-03 并 push 到 change 分支
- WHEN 用户切到电脑 B 拉代码
- THEN agent 在电脑 B 上读 `tasks.md` 顶部 "Continue From" 字段就知道下一步做 T-04
- AND 不需要重新阅读全部历史

#### Scenario: 从 git log 反查需求
- GIVEN 一个已归档的 commit
- WHEN 查看 commit message
- THEN message 包含 `<type>(<change-slug>): <subject>  [task: T-NN]` 格式
- AND 通过 slug 能定位到 `specs/archive/<module>/<slug>/`

### Requirement: 归档形成模块化树形结构

所有 shipped 的 change 按代码模块归档，目录结构与代码结构一一对应。

#### Scenario: 按模块查历史
- GIVEN 用户想查 proxies 模块的所有历史变更
- WHEN 用户进入 `specs/archive/desktop/proxies/`
- THEN 看到所有与 proxies 相关的 change，按时间排序

#### Scenario: 跨模块 change 的归档
- GIVEN 一个 change 同时改动 desktop 和 backend
- WHEN 该 change 归档
- THEN 整个 change 文件夹归到 `specs/archive/_cross/<slug>/`
- AND 不在任一具体模块下重复

### Requirement: 工具中立

流程的核心数据不绑定任何特定 AI 工具，可在 Kiro / Cursor / Codex / Gemini / Claude Code 等工具间无缝切换。

#### Scenario: 不用 Kiro 也能跑
- GIVEN 仓库 clone 到一台没有 Kiro 的机器
- WHEN 用 Cursor / Claude Code 打开
- THEN agent 能完整理解流程并继续工作
- AND 不需要 `.kiro/` 目录

#### Scenario: 用 Kiro 时享受工具增强
- GIVEN 用 Kiro 打开仓库
- WHEN agent 启动
- THEN `.kiro/steering/process.md` 自动加载流程总规范
- AND Kiro 的 spec 机制可作为 `specs/changes/<slug>/` 的 UI 增强（不替代）

### Requirement: 后端预留

为未来引入后端做最小预留，不引入空目录污染。

#### Scenario: 现在的状态
- GIVEN 后端尚未引入
- WHEN 查看 `specs/baseline/backend/`
- THEN 只有一份 `README.md` 写"暂无后端，未来在此组织 backend spec"
- AND 不存在空模块目录

#### Scenario: 未来扩展
- GIVEN 未来某天后端进来
- WHEN 该次 change 在 `specs/baseline/backend/<module>/` 下新建 spec
- THEN 不需要修改流程规范，只需在 `00-overview.md` 的"多端协作"小节下补充实例

## 6. Constraints（约束）

- 全程不动业务代码（`electron/`、`src/`）
- 全程不引入新依赖
- 5 个 PR 各自独立可合并；任一 PR 失败不阻塞其他 PR 的逻辑（但实际推进按顺序）
- 历史 handoff 文档不删除、不重写，原样迁移到 `docs/handoffs/`
- 流程文档全部用中文撰写（与 AGENT.md 一致）；产物模板的字段名可英文以保持兼容业界工具

## 7. Risks（风险）

| 风险 | 影响 | 缓解 |
|---|---|---|
| 流程过于繁重，AI 实际工作时绕过 | 流程沦为摆设 | 在 03-development 加"小需求简化路径"硬阈值；AI 不能自行判定"小"，必须征求用户 |
| 7 份规范文档冗长，agent 一次读不完 | 上下文爆炸 | 总规范保持精简（< 300 行），各环节按需加载；AGENTS.md 仅作入口 |
| symlink 在 Windows 上不稳定 | 跨平台协作出错 | 在 README 里说明 Windows 用户克隆需 `core.symlinks=true`；提供 fallback 脚本 |
| 把现有 `docs/specs/*.md` 重写为新格式可能失真 | 信息丢失 | 不重写，只做"摘要 + 全文附录" |
| 已归档的 3 个 .kiro spec 资料不全（缺测试记录、失败记录） | 归档不规范 | 接受这个事实，只做"标注为 legacy archive"，不补造历史 |
| 流程文档自身的迭代如何走流程 | 鸡生蛋问题 | 流程文档变更也走 change 流程，归档到 `specs/archive/_cross/` |

## 8. Out of Scope（明确不做）

- CI / CD 接入
- pre-commit hook 强制校验 commit 格式
- vitest 等测试框架引入
- `.claude/` 历史 git 痕迹清理
- 仓库重命名 / 公开化
- monorepo 物理重构（apps/ services/ packages/）
- 流程相关的自动化工具（如自动生成 release-notes 脚本）

以上每项都可作为后续独立 change。

## 9. Open Questions（待用户确认的问题）

> 这些是 proposal 阶段还需要你拍板的细节。回答后我会更新本文档，再进入设计环节。

### Q1: bootstrap change 的归类

`change/_cross/2026-05-bootstrap-process` 这个 slug 我用了 `_cross` 因为它跨所有模块。但严格说它**只动文档不动代码**，是不是该用一个新 module 比如 `_meta` 或 `_process`？

我的倾向：**保留 `_cross`**，不必新增 _meta，因为流程未来还会再迭代，每次都用 _cross 一致；归档树里 `_cross/` 自然成了"流程相关变更"的家。

### Q2: 流程文档语言

中文为主，但模板字段（`Intent / Scope / Approach / Requirements`）这种**结构化标题**用英文还是中文？

我的倾向：**结构化标题用英文，正文中文**。理由：
- 英文标题更短、不歧义、便于 agent 用正则匹配
- 与 OpenSpec 工具未来可能的兼容性留个口子
- 你的 `AGENT.md` 现在就是这种混排风格

### Q3: 模板字段强度

每份产物（proposal/design/tasks/...）的模板，**所有字段必填还是部分可选**？

我的倾向：**字段全部必填，但允许填 "N/A" + 一句话说明**。理由：
- 防止 agent 偷懒漏字段
- "N/A" 比"不写"更显眼，review 时能发现

### Q4: 状态机的"approved"由谁负责

需求文档（proposal.md）的 `status: draft → approved` 这一步：

A. 只能由用户手动改  
B. 用户口头说"approved" 后 agent 自动改  
C. agent 自检无 Open Questions 后自动改  

我的倾向：**B**，用户明确说"approved" 后 agent 把 STATUS.md 改成 approved 并 commit。这是工具中立的折中：不需要平台级权限管控，靠 commit log 留痕。

### Q5: 当前 change（bootstrap）自身的归档去向

这个 change 完成后归档到：

A. `specs/archive/_cross/2026-05-bootstrap-process/`  
B. `specs/archive/_meta/2026-05-bootstrap-process/`（新建 _meta 模块）  
C. 不归档，保留在 `specs/changes/` 作为活文档  

我的倾向：**A**。

### Q6: 归档时是否保留 STATUS.md

归档后 STATUS 已固定为 archived，STATUS.md 还有意义吗？

我的倾向：**保留**。理由：里面的 Log 段是完整的状态切换历史，有审计价值。

### Q7: 5 个 PR 的合并方式

A. **squash merge**：每个 PR 在 main 上压缩成一个 commit，main 历史清爽  
B. **merge commit**：保留 PR 内全部 commit，main 历史更细  
C. **rebase merge**：commit 串联到 main，无 merge commit  

我的倾向：**B（merge commit）**。理由：每个 task 都是有意义的小 commit（按我们的开发规范），squash 会丢这些细节；rebase 会让 main 历史看起来扁平但难看出"这一坨是同一个 change"。

---

## Conversation Log

> 这里记录 proposal 多轮 Q&A 的关键决策点（OpenSpec 风格的对话纪要）。

- 2026-05-29 | initial draft | 基于此前长达多轮的对齐讨论一次性产出 proposal v1。具体讨论摘要：
  - 决定借鉴 OpenSpec 哲学但不装 CLI，避免工具绑定
  - 决定流程数据放 `specs/`（项目根）而非 `.kiro/`，工具中立
  - 决定 7 份规范文档（1 总 + 6 环节 + 模板集）
  - 决定 5 PR 分批迁移，第一份 change 自指（流程建立流程本身）
  - 决定预留后端但不做物理重构
  - 决定 AGENTS.md 主文件 + 其他 agent 入口符号链接
  - 决定无观察期归档（项目早期、无用户、迭代快）
  - 决定 commit 格式 `<type>(<slug>): <subject>  [task: T-NN]`
  - 决定测试两层模型 + TT 编号
  - 决定失败留痕在 release-notes.md 追加 Failed Attempt 段

- 2026-05-29 | proposal v2 (approved) | 用户授权 agent 按其倾向决定 Q1-Q7：
  - Q1: 沿用 `_cross` 模块，不另建 `_meta`
  - Q2: 模板结构化标题用英文，正文中文
  - Q3: 模板字段全部必填，允许"N/A + 一句话说明"
  - Q4: approved 状态由 agent 在用户明确说"approved"后切换并 commit；本次 change 适用此规则
  - Q5: bootstrap change 归档到 `specs/archive/_cross/2026-05-bootstrap-process/`
  - Q6: 归档时保留 STATUS.md（含 Log 历史）
  - Q7: 5 个 PR 用 merge commit 方式合并到 main

- 2026-05-29 | proposal v3 (scope reduced) | 用户指令"先定义规范文档，迁移后面做"。把历史文档迁移（PR-3/4/5 内容）从 scope 移出，本 change 仅覆盖"建立规范文档 + 目录骨架 + agent 入口"。已用 git revert 回滚 T-14/T-15/T-16/TT-03 的 commit。迁移工作单独开 change `2026-05-migrate-legacy-docs` 走完整流程处理。
