# 01 需求规范

## 1. 环节定位

把模糊想法固化为可执行的规格。产物 `proposal.md` 是后续设计、开发、测试的根。

## 2. 进入条件

- 用户提出新需求或 agent 主动提议（提议必须先得到用户认可）
- 仓库已存在流程文档（首次自指除外）
- 已确认改动**不属于**简化路径中"零产物"级别（即使最小修改也至少要 proposal）

## 3. 必备产物

| 文件 | 路径 | 模板 |
|---|---|---|
| 提案 | `specs/changes/<slug>/proposal.md` | [templates/proposal.md](templates/proposal.md) |
| 状态 | `specs/changes/<slug>/STATUS.md` | [templates/STATUS.md](templates/STATUS.md) |

slug 命名：`<YYYY-MM>-<short-title>`，例如 `2026-06-batch-launch`。仅小写字母数字与连字符。

## 4. 操作流程（AI agent 视角）

借鉴 OpenSpec 的多轮 Q&A 模式，最多 4 轮。

1. **创建 change 骨架**
   - `mkdir -p specs/changes/<slug>`
   - 复制 `templates/STATUS.md` 与 `templates/proposal.md`
   - 创建 git 分支：`git checkout -b change/<module>/<slug>`
   - STATUS.status = `draft`，初始 Log 行
2. **第 1 轮 Q&A：澄清"想解决什么问题"**
   - 阅读 AGENTS.md、PROJECT_GUIDE.md、相关现有代码、相关 baseline
   - 起草 proposal.md 的 §1 Intent、§2 Scope（粗）、§4 Affected Scopes
   - 在 §9 Open Questions 列 3-5 个聚焦问题
   - 提交：`docs(<slug>): proposal v1 draft`
3. **第 2 轮：澄清用户场景**
   - 用户回答后 agent 修订 §2 Scope，开始填 §5 Requirements（GIVEN/WHEN/THEN）
4. **第 3 轮：澄清边界与异常**
   - 补 §6 Constraints、§7 Risks、§8 Out of Scope
5. **第 4 轮：澄清验收标准**
   - 把 §5 Requirements 的 Scenario 补全到可测的程度
   - 在 Conversation Log 追加每轮决策摘要
6. **如果 4 轮还没收敛**：标 `status: needs-rework` 并在 Log 写明根因，回 §1 重来
7. **接收 approved 信号**
   - 用户明确说 "approved"
   - 改 STATUS.status = `approved`，追加 Log 行
   - 提交：`docs(<slug>): proposal approved`
   - 进入设计环节（02-design.md）

## 5. 操作流程（人类视角）

- 第 1 轮：你描述问题；不必精确
- 第 2-4 轮：你回答 agent 的 Open Questions
- 任何时候你可以说"重新来过"，agent 会保留旧 proposal 作为 v1 备份并起草 v2
- 你认可后明确说 "approved"；这是状态切换的唯一触发

## 6. 验收标准

进入下一环节前必须满足：

- [ ] proposal.md 全部字段非空（无内容字段填 `N/A` + 一句话说明）
- [ ] §5 至少一条 Requirement，每条至少一个 Scenario，Scenario 用 GIVEN/WHEN/THEN 写
- [ ] §9 Open Questions 全部已回答，决策记入 Conversation Log
- [ ] §4 Affected Scopes 表格内容明确（不能写"几个文件"）
- [ ] §2 Scope 含明确的"做什么"与"不做什么"两段
- [ ] §8 Out of Scope 不为空（至少声明"无后续 spin-off"）

## 7. 退出动作

- STATUS.status: `draft` → `approved`
- STATUS.Log 追加：`YYYY-MM-DD | proposal vN (status=approved) | <one-line>`
- git commit message: `docs(<slug>): proposal approved`
- 不打 tag

## 8. 反例与禁忌

1. **需求里夹设计细节**：proposal 里不写"用 React Context 实现"。这种归 design.md。
2. **Scenario 写得不可测**："THEN 用户体验更好"。改成具体的可观察行为。
3. **Open Questions 用诱导问句**："Q: 我准备用 X 方案，你同意吗？"。要给至少 2 个备选。
4. **跳过 §4 Affected Scopes**：影响面一定要点名到模块或文件级，不能"全局"。
5. **agent 自审 approved**：除非用户明确说 "approved"，否则状态不动。

## 9. 与其他环节的接口

**上一环节给我什么**

无（本环节是流程起点）。

**我给下一环节（02-design）什么**

- 锁定的 proposal.md（含全部 Requirements）
- STATUS.status = `approved`
- git commit `proposal approved` 已 push

design 环节读 proposal 的 §3 Approach 作为方向，§5 Requirements 作为验收依据。
