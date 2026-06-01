# Proposal: archive-change 自动化脚本

## 1. Intent

最近 3 个 change（fix-x64-build / process-validators / build-resilience）归档时**反复出现同一类笔误**：手动改 STATUS Log 时把 ready-to-ship→shipped→archived 写进了文字描述，但漏改了 `- status:` 字段本身。process-validators 引入的校验器能事后抓到，但**问题应该在源头消除**。

本 change 引入 `scripts/archive-change.mjs`：把"改 status 字段 + 追加 Log + git mv 到 archive/" 这三步打包成一条命令，杜绝手动 status 笔误的可能。

## 2. Scope

**做**：
- 新增 `scripts/archive-change.mjs`（零依赖）：
  - 输入：change slug
  - 校验：当前 STATUS.status == `shipped`（必须先发版才能归档）
  - 自动改 `- status:` 字段为 `archived`
  - 追加一行 Log：`<date> | archived | moved to specs/archive/<module>/<slug>/`
  - 解析 STATUS 的 `module` 字段决定归档目标（`_cross` / `desktop/<x>`）
  - 执行 `git mv specs/changes/<slug> specs/archive/<target>/<slug>`
  - 跑 `node scripts/validate-specs.mjs` 自我验证
- 新增 `pnpm run archive` script
- 06-archive.md §4 操作流程更新：手动 mv 改为 `pnpm run archive <slug>`
- 06-archive.md 加一条"元数据笔误可修正"细则（process-validators retrospective §6 提的 follow-up，本 change 一并完成）

**不做**：
- 不自动写 retrospective.md（那需要人工内容）
- 不自动 commit（脚本只改文件 + git mv 到 staging，由用户 commit）
- 不引入第三方依赖
- 不改业务代码、应用二进制无变化

## 3. Approach

零依赖 Node ESM。复用 validate-specs.mjs 已验证的 STATUS 解析正则。git mv 用 `child_process.execSync`。

错误处理：
- slug 不存在 → 报错 exit 1
- STATUS.status != shipped → 报错指明当前状态
- module 字段缺失 → 报错
- 目标已存在（重复归档） → 报错

## 4. Affected Scopes

| 范围 | 影响 |
|---|---|
| 端 | desktop |
| 模块 | _cross（流程基础设施）|
| 代码 | 新增 scripts/archive-change.mjs；package.json 加 script |
| 文档 | 06-archive.md 更新归档流程 + 新增元数据笔误细则 |

## 5. Requirements

### Requirement: 自动化归档命令

#### Scenario: 正常归档
- GIVEN specs/changes/<slug>/STATUS.md status=shipped, module=_cross
- WHEN `pnpm run archive <slug>`
- THEN STATUS.status 字段改为 `archived`
- AND STATUS.Log 追加 archived 行
- AND change 目录 git mv 到 specs/archive/_cross/<slug>/
- AND 跑 validate-specs.mjs 0 error
- AND 提示用户 commit

#### Scenario: 模块化归档
- GIVEN STATUS.module=`kernel`
- WHEN archive
- THEN 目标 = specs/archive/desktop/kernel/<slug>/

#### Scenario: 状态不对
- GIVEN STATUS.status=`testing`（未 shipped）
- WHEN archive
- THEN 报错 "current status is 'testing', must be 'shipped' before archiving"
- AND exit 1
- AND 不改任何文件

#### Scenario: 重复归档
- GIVEN 目标 archive 路径已存在
- WHEN archive
- THEN 报错 exit 1，不覆盖

### Requirement: 06-archive 文档更新

#### Scenario: 流程文档反映新工具
- GIVEN 06-archive.md §4 操作流程
- WHEN 读取
- THEN 含 `pnpm run archive <slug>` 命令
- AND 不再需要手动两步（改 status + git mv）

### Requirement: 元数据笔误修正条款

#### Scenario: 06-archive 含修正细则
- GIVEN 06-archive.md
- WHEN 读取"反例与禁忌"或附近章节
- THEN 含一条："archive 内容只读，但归档元数据笔误（status 字段、拼写错误）允许由后续 change 修正，commit message 注明即可"
- AND 这条覆盖了之前 process-validators 和 build-resilience 修正 status 笔误的实际操作

## 6. Constraints

- 零第三方依赖
- 脚本只动 STATUS.md + git mv（不动其他文件）
- 失败时**不留半成品状态**（要么完成，要么不动）
- 跨平台兼容（macOS/Linux 优先）

## 7. Risks

| 风险 | 影响 | 缓解 |
|---|---|---|
| 脚本中途失败留半成品（status 改了但 mv 失败）| 文件不一致 | 先校验所有前置条件再动手；任一步失败立即 abort |
| 用户绕过脚本手动归档 | 老问题复现 | 文档明确指引用 archive 命令；旧手工流程可保留为应急 |
| Log 格式与历史归档不完全一致 | 风格漂移 | 沿用现有归档 Log 行格式（已在历史归档中观察到）|

## 8. Out of Scope

- 不集成 CI
- 不自动 commit（保留人工 review 环节）
- 不做 ship-helper（"shipped" 状态切换仍手动；那涉及 tag/build/CHANGELOG，太复杂）
- 不做 reverse archive（归档不可逆，符合 06-archive 只读约定）

## 9. Open Questions

无。

## Conversation Log

- 2026-06-01 | initial draft + approved | 用户"可以，记得合并到 main"。直接进入 design + 实现
