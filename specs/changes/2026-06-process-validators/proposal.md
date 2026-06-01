# Proposal: 流程自动校验器

## 1. Intent

前 4 个 change 的 retrospective 累计 3 次提到同类工艺问题，靠人工纪律没根治：

1. **commit 时序**：先 commit 后改 tasks 状态，多次靠 amend 补救
2. **Continue From 与 git log 漂移**：tasks.md 顶部 `Continue From` 偶尔和实际 git 历史不同步
3. **specs/changes/ stray 文件**：归档后残留中间状态副本（fix-x64-build 就清过一个）
4. **commit 格式**：`<type>(<slug>): <subject>  [task: T-NN]` 靠手写，没校验

本 change 引入一个**零依赖 Node 校验脚本** `pnpm run validate:specs`，把这些检查自动化，让流程合规可机器验证。

## 2. Scope

**做**：
- 新增 `scripts/validate-specs.mjs`（零依赖，只用 node 内置 + git CLI）
- 校验项（见 §5 Requirements）：
  - 进行中 change 的 STATUS.md 字段完整性
  - tasks.md `Continue From` 存在性
  - specs/changes/ 下不应有"看起来已归档"的 stray（status=archived 却还在 changes/）
  - 已归档 change 的 STATUS.status 必须是 archived
  - archive 目录里不应出现非 archived 状态
  - commit message 格式校验（可选，校验最近 N 条）
- 在 package.json 加 `validate:specs` script
- 在 docs/process/00-overview.md FAQ 加一条"如何跑校验"
- 在 docs/process/03-development.md 退出动作里建议跑一次 validate

**不做**：
- 不引入第三方依赖（不装 ajv / commander 等）
- 不做 git pre-commit hook 强制（仅提供手动 / 可选 CI 入口）
- 不改业务代码
- 不自动修复（只报告，不动文件）
- 不校验 baseline / archive 内容正确性（只校验结构 / 状态一致性）

## 3. Approach

纯 Node ESM 脚本（`.mjs`，因为项目 type 非 module，用 .mjs 显式 ESM）：
- 用 `node:fs` 遍历 `specs/changes/*` 和 `specs/archive/**`
- 用 `child_process.execSync('git log ...')` 读最近 commit
- 解析 STATUS.md 的 `- status: xxx` 行（简单正则，不引 yaml 库）
- 报告 errors（exit 1）与 warnings（exit 0），格式清晰
- 退出码：有 error → 1，仅 warning / 全过 → 0

## 4. Affected Scopes

| 范围 | 影响 |
|---|---|
| 端 | desktop（脚本在仓库根，工具中立）|
| 模块 | _cross（流程基础设施）|
| 代码 | 新增 scripts/validate-specs.mjs（非业务代码，构建工具级）|
| package.json | 加一个 script |
| docs/process | 加引用说明（00-overview + 03-development）|

## 5. Requirements

### Requirement: 校验进行中 change 的 STATUS 完整性

#### Scenario: STATUS 缺字段
- GIVEN specs/changes/<slug>/STATUS.md 缺 `status` / `slug` / `branch` 字段
- WHEN 跑 validate:specs
- THEN 报 error 指明缺哪个字段
- AND exit 1

#### Scenario: status 值非法
- GIVEN STATUS.status 不在 8 个合法状态内
- WHEN 跑 validate
- THEN 报 error
- AND exit 1

### Requirement: 校验 tasks.md Continue From

#### Scenario: 缺 Continue From
- GIVEN 进行中 change 的 tasks.md 没有 `Continue From` 行
- WHEN 跑 validate
- THEN 报 warning（不阻塞，因为有的 change 还没到 tasks 阶段）

### Requirement: 校验 changes/ 无已归档 stray

#### Scenario: changes/ 里有 archived 状态
- GIVEN specs/changes/<slug>/STATUS.md status=archived
- WHEN 跑 validate
- THEN 报 error（archived 的应该 mv 到 archive/，不该留 changes/）
- AND exit 1

### Requirement: 校验 archive/ 状态一致

#### Scenario: archive 里非 archived
- GIVEN specs/archive/**/<slug>/STATUS.md status != archived 且 legacy != true
- WHEN 跑 validate
- THEN 报 error
- AND exit 1

#### Scenario: legacy archive 豁免
- GIVEN archive 里 STATUS.md 标 legacy: true
- WHEN 跑 validate
- THEN 不要求 status=archived（legacy 数据豁免）

### Requirement: 校验 commit 格式（最近 N 条）

#### Scenario: 近期 commit 不符格式
- GIVEN git log 最近 20 条里有不符 `<type>(<scope>): <subject>` 也不是 merge commit 的
- WHEN 跑 validate
- THEN 报 warning 列出不合规的 commit（不阻塞，因为历史 commit 不可改）

### Requirement: 全过时清晰反馈

#### Scenario: 全部通过
- GIVEN 所有检查通过
- WHEN 跑 validate
- THEN 打印 summary（检查了几个 change / archive）
- AND exit 0

## 6. Constraints

- 零第三方依赖
- 纯只读（不修改任何文件）
- 跨平台（macOS / Linux；Windows 尽量但不强求）
- 脚本自身可被 `pnpm run validate:specs` 调用

## 7. Risks

| 风险 | 影响 | 缓解 |
|---|---|---|
| 校验过严导致正常流程被误报 error | 烦人、降低信任 | error 只给"硬约束"；模糊的归 warning |
| STATUS.md 解析用正则不够鲁棒 | 误判 | 解析失败归 warning 而非 error；字段用宽松正则 |
| git log 在无 git 环境失败 | 脚本崩 | try/catch，git 不可用时 skip commit 检查并 warn |

## 8. Out of Scope

- pre-commit hook 强制
- CI 集成（可后续）
- 自动修复
- baseline / archive 内容质量校验
- 校验 symlink 完整性（可后续加）

## 9. Open Questions

无。检查项清单已在 §5 定义。

## Conversation Log

- 2026-06-01 | initial draft + approved | 用户"继续"授权；本 change 由前 4 个 retrospective §6 反复提出。检查项基于实际踩过的坑设计
