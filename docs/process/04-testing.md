# 04 测试规范

## 1. 环节定位

在合并前验证实现满足 proposal 的 Requirements / Scenarios，留下可追溯的测试记录。两层测试模型确保单点 verify 与端到端验证互不耦合。

## 2. 进入条件

- 所有开发 task `status: done`
- `pnpm run build` 通过
- STATUS.status = `testing`

## 3. 必备产物

| 文件 | 路径 | 模板 |
|---|---|---|
| 测试计划 | `specs/changes/<slug>/test-plan.md` | [templates/test-plan.md](templates/test-plan.md) |
| 单测代码（可选） | `electron/__tests__/`、`src/__tests__/` 或同级 `*.test.ts` | 无 |

## 4. 操作流程（AI agent 视角）

### 4.1 两层测试模型

| 层级 | 谁负责 | 留痕位置 | 颗粒度 |
|---|---|---|---|
| 第一层：task 单点 verify | 03-development | tasks.md 每条 task 的 `verify` 字段 | 验证"这个 task 改的代码本身能跑" |
| 第二层：spec 端到端 | 04-testing（本环节） | test-plan.md 的 TT-NN | 验证 proposal Requirements 全部 Scenarios 可达 |

第一层 fail 不影响第二层（task fail 时 task 不能 done，根本走不到本环节）。
第二层 fail 不修改原 task，而是**开新 fix task** 走完整流程修复，原 task 保留历史。

### 4.2 起草 test-plan

1. 读 proposal.md §5 Requirements / Scenarios
2. 每个 Scenario 至少对应一个 TT
3. TT 编号 `TT-NN`（与开发 T-NN 区分）
4. 每个 TT 必填字段：
   - `method`: `手工` / `单测` / `集成`
   - `linked-requirement`: 指回 proposal 的具体 Requirement
   - `status`: `todo` / `pass` / `fail`
   - `executed-at`、`result`、`evidence`（截图路径或日志摘录）
5. test-plan §4 Out-of-band Verification 列不属于 TT 但仍要做的事（性能监测、turnstile 自检等）
6. 用户 review 测试计划

### 4.3 单测策略（方案 C：手工 + 单测并行）

- 单测**可选**，但每个 spec 必须至少 1 条 TT
- 关键模块（指纹、IPC、数据持久化、内核启动）建议加单测
- 单测放在被测代码的同级或 `__tests__/` 子目录
- 单测对应 TT 用 `method: 单测`，evidence 填 `pnpm test` 输出

### 4.4 执行测试

1. 一次执行一个 TT（"做一个勾一个"）
2. 通过：
   - status → `pass`
   - 填 `executed-at`、`result: pass`、`evidence`
   - test-plan §5 Execution Log 追加：`YYYY-MM-DD HH:MM | TT-NN pass`
3. 失败：
   - status → `fail`
   - 填 `executed-at`、`result: <现象>`、`evidence`
   - Execution Log 追加：`YYYY-MM-DD HH:MM | TT-NN fail (<现象>) → 开 fix task T-NN`
   - **回开发环节**：在 tasks.md 新增 `T-NN` 类型 `fix`，按 03-development §4.3 流程修复
   - 修复完回到本环节重测，TT 状态从 `fail` → `pass`，Execution Log 再追加一行 retest pass

### 4.5 反指纹相关 spec 的特殊验证

涉及 `stealth/` 模块的 change 必须在 §4 Out-of-band Verification 加：

- `https://browser-compat.turnstile.workers.dev/` 全绿（含 challenge 通过）
- 同一 profile 多次启动指纹一致；不同 profile 之间 fingerprintjs visitor ID 不同
- 截图作为 evidence

### 4.6 整个测试环节完成

- 所有 TT `status: pass`
- §6 Sign-off 全部 checkbox 勾上
- 改 STATUS.status = `ready-to-ship`
- 提交：`docs(<slug>): all tests pass, ready to ship`

## 5. 操作流程（人类视角）

- 看 test-plan，认可后说"开始测"
- 手工 TT 由 agent 引导你执行（启动应用、操作步骤、收集 evidence）
- 测试期间 agent 不动业务代码（除非进入 fix task 流程）
- 全部 pass 后 agent 请求你 approve 进入上线

## 6. 验收标准

进入下一环节前必须满足：

- [ ] test-plan.md 全部 TT `status: pass`，checkbox 勾上
- [ ] §5 Execution Log 含每个 TT 至少一条 pass 记录
- [ ] §6 Sign-off 全部勾上
- [ ] §4 Out-of-band Verification 全部完成（如有）
- [ ] 所有 fix task（如有）已合并并经过 retest
- [ ] STATUS.status = `ready-to-ship`

## 7. 退出动作

- STATUS.status: `testing` → `ready-to-ship`
- STATUS.Log 追加：`YYYY-MM-DD | testing complete (status=ready-to-ship) | <TT-count> TT, <fix-count> fix tasks`
- git commit message: `docs(<slug>): all tests pass, ready to ship`
- 不打 tag

## 8. 反例与禁忌

1. **测试用例直接抄 Requirement**：TT 必须是可执行的步骤，不是 Requirement 的复述。
2. **fail 改 TT 不改代码**：失败必须开 fix task 修代码，不能改测试用例迁就 bug。
3. **没有 evidence**：手工 TT 必须截图或日志摘录；agent 不能口头声称"我看了，pass"。
4. **跳过 retest**：fix task 修复后**必须**重测原 TT，不能"反正已经修了"。
5. **Out-of-band 漏测**：反指纹相关 change 不做 turnstile 验证 = 测试不合格。

## 9. 与其他环节的接口

**上一环节（03-development）给我什么**

- 全部 task 已 done 的 tasks.md（含每条 task 的单点 verify 结果）
- 通过 build 的代码
- STATUS.status = `testing`

**我给下一环节（05-release）什么**

- 全部 TT pass 的 test-plan.md
- §5 Execution Log 完整
- 已 push 到 change 分支的所有 fix（如有）
- STATUS.status = `ready-to-ship`

05-release 在 PR 描述里引用 test-plan.md 的 §5 Execution Log 作为发版依据。
