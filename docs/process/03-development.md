# 03 开发规范

## 1. 环节定位

把 design 落成代码，全程留下可追溯的 commit 链。每个 task 独立可中断、可在不同电脑续作。

## 2. 进入条件

- design.md 状态 = `designed`（小需求路径下，proposal 内"实现方式"段视为 design）
- 必要 ADR 已 `accepted`
- delta/ 已起草

## 3. 必备产物

| 文件 | 路径 | 模板 |
|---|---|---|
| 任务 | `specs/changes/<slug>/tasks.md` | [templates/tasks.md](templates/tasks.md) |
| 代码 | `electron/`, `src/`, 其他业务目录 | 无 |

## 4. 操作流程（AI agent 视角）

### 4.1 拆任务

1. 读 design.md §5 与 §12，把验收标准转成 task 列表
2. 给每个 task 编号 `T-NN`（两位数，>99 用三位），独立可验证
3. 每个 task 必填字段：
   - `status`: `todo` / `in-progress` / `done` / `blocked`
   - `commit`: 完成后填 commit hash 短码
   - `files`: 涉及文件路径（用逗号分隔）
   - `verify`: 这一个 task 的单点验证方法
   - `note`: 可选，blocker / 决策记录
4. tasks.md 顶部必须有：
   - `Continue From`: 一行字描述下一步
   - `Last updated`: 日期 + 机器/作者
5. 用户审 task 列表后再开始执行

### 4.2 任务阈值

单个 task 必须满足：

- ≤ 1 天工作量
- ≤ 5 个文件改动
- ≤ 300 行 diff（生成代码、迁移类除外，需在 commit message 注明 `[generated]` 或 `[migration]`）

超阈值的征兆：写到一半发现"先改 A 再改 B 再改 C"——立刻停下，回 tasks.md 拆。拆完再继续。

### 4.3 执行单个 task

1. 把对应 task 状态改 `in-progress`，更新 `Continue From`
2. 提交一个**只改 tasks.md 的**小 commit（可选；如果你的工作流支持 amend 就跳过）
   - 或者**先实现 + 改 tasks 再一次性 commit**，避免 amend
3. 实现：读相关代码（不要凭记忆）、改、本地跑 verify
4. tasks.md 对应 task：
   - 把 checkbox 勾上：`[x]`
   - status → `done`
   - commit → 当前 commit hash 短码
5. 更新顶部 `Continue From` 指向下一 task
6. `git add -A && git commit -m "<type>(<slug>): <subject>  [task: T-NN]"`

### 4.4 commit 格式

```
<type>(<slug>): <subject>  [task: T-NN]
```

`type`：`feat` / `fix` / `refactor` / `docs` / `chore` / `test` / `spec` / `archive` / `release`

`slug`：当前 change 的 slug，例如 `2026-05-bootstrap-process`

`subject`：祈使句、≤72 字、不含句号

例：
```
feat(2026-05-batch-launch): add batch launch IPC handler  [task: T-03]
fix(2026-05-batch-launch): handle proxy timeout  [task: T-07]
docs(2026-05-bootstrap-process): create 03-development.md  [task: T-05]
```

无 task 关联的杂活（拼写、注释）允许 `chore: <subject>` 不带 `[task:]`，但要少。

### 4.5 跨电脑续作

1. 切电脑前：`git push origin <branch>`
2. 新电脑：`git pull`
3. 第一件事读 `tasks.md` 顶部 `Continue From`
4. 验证当前状态：`git log --oneline -10`，比对最新 commit 与 tasks.md 中 task 的 commit hash
5. 若不一致，以 git log 为准并修复 tasks.md（agent 应主动报告这种漂移）

### 4.6 设计偏离

实现中发现 design 不对：

1. **停止编码**
2. 回 02-design 修订流程：改 design.md，加 Revision Log
3. 提交：`docs(<slug>): design revision <reason>`
4. 用户认可后再继续编码

未走这个流程的偏离 commit 必须 revert。

### 4.7 整个开发环节完成

- 所有 task `status: done`
- `pnpm run build` 通过
- 改 STATUS.status = `testing`
- 提交：`docs(<slug>): all tasks done, entering testing`

## 5. 操作流程（人类视角）

- 看 tasks.md 列表，认可拆解后说"开干"
- 中途有疑问随时打断，agent 暂停当前 task，标 `blocked` + `note`
- agent 完成一个 task 时报告进度（不要求逐 task 报告，可批量）
- 完成全部 task 后会请求你 approve 进入测试

## 6. 验收标准

进入下一环节前必须满足：

- [ ] tasks.md 全部 task `status: done` 且 checkbox 勾上
- [ ] 每个 task 填了 commit hash
- [ ] `pnpm run build` 在本地通过（无类型错误、无构建告警）
- [ ] 所有改动已 push 到 change 分支
- [ ] design 修订（如有）已 commit 并写入 Revision Log
- [ ] STATUS.status 改为 `testing`

## 7. 退出动作

- STATUS.status: `in-progress` → `testing`
- STATUS.Log 追加：`YYYY-MM-DD | all tasks done (status=testing) | <task-count> tasks, <commit-count> commits`
- git commit message: `docs(<slug>): all tasks done, entering testing`
- 跑一次 `pnpm run validate:specs`，确认 0 error（校验 STATUS / 状态一致性 / Continue From / commit 格式）
- 不打 tag

## 8. 反例与禁忌

1. **巨型 commit**：单 commit > 300 行非生成/非迁移内容。立即拆。
2. **task 状态不更新就推进**：每完成一个 task 必须立刻改 tasks.md。否则跨电脑续作会乱。
3. **commit message 不带 `[task:]`**：除了 chore 杂活，必须带。
4. **绕过 design 直接改代码**：见 §4.6 处理。
5. **凭记忆写路径**：必须 grep / 读文件确认。AGENTS.md 第 4 节 #2 已是硬规则。
6. **隐式拆 task**：实现到一半发现要拆。**停下回 tasks.md 显式拆**，不要"先改完再补"。

## 9. 与其他环节的接口

**上一环节（02-design）给我什么**

- design.md（含 §12 Acceptance Criteria）
- 必要 ADR
- delta/ spec
- STATUS.status = `designed`

**我给下一环节（04-testing）什么**

- 全部 task 已 done 的 tasks.md
- 已 push 到 change 分支的代码
- `pnpm run build` 通过的证据（最近一次 build 输出）
- STATUS.status = `testing`

04-testing 读 proposal.md §5 Requirements + tasks.md verify 字段生成测试用例。
