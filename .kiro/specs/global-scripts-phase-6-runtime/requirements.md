# Requirements Document

> 真源 spec: [`docs/specs/global-scripts-and-queues.md`](../../../docs/specs/global-scripts-and-queues.md) §5 + §8 phase 6
> 本阶段 design: [`./design.md`](./design.md)
>
> 这是 global-scripts-and-queues 的 **phase 6 子 spec** —— 全局脚本 SDK 实装(profiles 只读 + runScript)。

## Introduction

phase 6 的目标是把全局脚本里的 `import { profiles, runScript } from 'auto-registry'`
从 phase 2 的"throw `GLOBAL_NOT_IMPL_YET` 占位"升级为真实可用,具体只覆盖**只读**的
`profiles.list / profiles.get` 与可执行的 `runScript(scriptId, profileId, params?)`。
写接口(create / delete / setQueue)留到下一阶段。

为此需要打通三件事:fork↔main 的双向 IPC 通道、SDK 全局分支接入该通道、父子 run 的
状态联动(包括 stop 传播)。所有要求必须在不引入新依赖、不改渲染层 IPC 签名的前提下满足。

本文档列出各类不变量与可观察行为,作为 design 的验收口径。`tasks.md` 会把这些拆成
可编码任务。

## Glossary

- **Bridge_Client**: fork 子进程内的请求/响应客户端,定义在
  `electron/scripts/sdk/bridge-client.ts`,通过 `process.send` / `process.on('message')`
  与主进程通信,见 design §5.2。
- **Bridge_Method**: fork↔main 协议白名单里的字符串集合;phase 6 包含
  `'profiles.list' | 'profiles.get' | 'runScript'`,见 design §5.1。
- **Bridge_Request**: fork 发往主进程的请求信封,字段为 `{ kind:'request', id, method, payload }`,
  见 design §6.1。
- **Bridge_Response**: 主进程发往 fork 的响应信封,字段为
  `{ kind:'response', id, ok, value? | error? }`,见 design §6.1。
- **Bridge_Error_Code**: 已知错误码集合 `PROFILE_NOT_FOUND | SCRIPT_NOT_FOUND | INVALID_SCOPE | PROFILE_BUSY | SCRIPT_STOPPED | GLOBAL_NOT_IMPL_YET | INTERNAL_ERROR`,见 design §6.1。
- **Child_Run**: 由全局脚本通过 `runScript` 触发的 profile-scope `ScriptRun`;
  其 `triggeredBy = 'global-script'`,`parentRunId = 触发它的全局 run id`。
- **Parent_Run**: 调用 `runScript` 的全局脚本对应的 `ScriptRun`(scope='global')。
- **Profile_Store**: 渲染层及主进程共享的 profile 持久化层,定义在 `electron/store.ts`。
- **Script_Bridge**: 主进程内的 IPC 路由组件,定义在 `electron/scripts/bridge.ts`,
  负责把 Bridge_Request 路由到 Profile_Store / Script_Store / Script_Runtime,
  并把结果包成 Bridge_Response 写回 fork;见 design §5.1。
- **Script_Runtime**: `ScriptRuntimeManager`,既有 fork / 终止 / 状态广播组件,
  定义在 `electron/scripts/runtime.ts`。
- **Script_Store**: `ScriptStore`,既有脚本与 ScriptRun 持久化层,
  定义在 `electron/scripts/store.ts`。
- **Scope_Mismatch_Error**: SDK 抛出的语义错误类,带 `code` 字段,见
  `electron/scripts/sdk/index.ts`;phase 6 用于把 Bridge_Error 透传给用户脚本。
- **SDK_Global_Surface**: 全局脚本看到的 `profiles` 对象与 `runScript` 函数,
  入口为 `createScriptApi(context)` 在 `context.scope === 'global'` 时的分支。
- **Run_Script_Result**: `runScript` 解析出的形状 `{ run: ScriptRun }`,
  其中 `run.status ∈ {'succeeded','failed','stopped'}`(终态)。
- **Pending_Children**: Script_Bridge 内部维护的 `Map<parentRunId, Set<{reqId, childRunId}>>`,
  跟踪某个 Parent_Run 当前 await 中的 Child_Run 集合。

## Requirements

### Requirement 1: 全局脚本可读取 Profile 列表

**User Story:** 作为全局脚本作者,我希望能在脚本里读到当前所有 profile 的只读快照,
以便决定要在哪些环境上调度子脚本。

#### Acceptance Criteria

1. WHEN 全局脚本调用 `profiles.list()`, THE SDK_Global_Surface SHALL 通过 Bridge_Client
   发送 `method='profiles.list'` 的 Bridge_Request,并以 Profile_Store 在请求时刻
   `list()` 的返回数组(顺序、字段一致)resolve。
2. WHEN 全局脚本调用 `profiles.get(id)`, THE SDK_Global_Surface SHALL 通过 Bridge_Client
   发送 `method='profiles.get', payload={id}` 的 Bridge_Request,并以 Profile_Store
   `get(id) ?? null` 的返回值 resolve。
3. THE SDK_Global_Surface SHALL 在 `profiles.list()` resolve 出来的数组里返回完整
   `BrowserProfile` 对象(不裁剪 `enabledPluginIds` / `proxyId` / `fingerprint` / `onCreateQueue` /
   `onLaunchQueue` 等任何字段)。
4. IF Profile_Store 内不存在指定 id, THEN THE SDK_Global_Surface SHALL 让 `profiles.get(id)`
   resolve 为 `null`(而非 reject)。

### Requirement 2: fork↔main 双向 IPC 通道

**User Story:** 作为系统设计者,我需要 fork 子进程能"调用主进程能力并 await 结果",
以便 SDK 全局分支不再走单向 `process.send`。

#### Acceptance Criteria

1. THE Bridge_Client SHALL 通过 `process.send` 发送 Bridge_Request,并通过
   `process.on('message')` 接收 Bridge_Response。
2. THE Bridge_Client SHALL 为每次 `call()` 生成单调递增的 `id`(进程内独占,从 1 起),
   并把 `{resolve, reject}` 登记到 pending 表。
3. WHEN Bridge_Client 收到 Bridge_Response, THE Bridge_Client SHALL 取出 `pending[response.id]`
   并按 `response.ok` 调用 `resolve(response.value)` 或 `reject(response.error)`,
   且无论成功失败都 `pending.delete(response.id)`。
4. WHERE `process.send` 同步返回 `false`(IPC channel 已死), THE Bridge_Client
   SHALL 立即把对应 `pending[id]` reject 并抛出"parent IPC channel is closed"语义错误。
5. WHEN Bridge_Client 收到 `kind` 不为 `'response'` 或 `id` 不在 pending 表的消息,
   THE Bridge_Client SHALL 静默丢弃并写一条 warn 级别日志,且不影响其他 pending。
6. WHEN Bridge_Client 检测到 `process.on('disconnect')`, THE Bridge_Client SHALL 调用
   `dispose('parent disconnected')`,把 pending 表里所有未完成调用以"parent disconnected"
   reject 一次。

### Requirement 3: fork 注册与解注册

**User Story:** 作为主进程,我需要在 fork 创建/退出时正确登记 / 释放 IPC 路由状态,
避免泄漏或路由到已死进程。

#### Acceptance Criteria

1. WHEN Script_Runtime `start()` 成功 fork 出新 ChildProcess, THE Script_Runtime
   SHALL 立即调用 Script_Bridge `attach(child, ownerRunId)`(早于任何 child 'message'
   的可能到来)。
2. WHEN Script_Bridge `attach(child, ownerRunId)` 被调用, THE Script_Bridge SHALL 在
   内部 `forks` 表新增 `ownerRunId → { child, pendingChildren: new Set() }`,并对
   `child` 注册 `'message'` 与 `'exit'` 处理器。
3. WHEN ChildProcess 触发 `'exit'`, THE Script_Bridge SHALL 删除 `forks[ownerRunId]`
   条目,对其 Pending_Children 中每个 `childRunId` 调用 `Script_Runtime.stop(childRunId)`,
   并不再向已退出的 child 发送任何 Bridge_Response。
4. WHERE ChildProcess 在 `attach` 调用过程中或调用后立刻 `'exit'`, THE Script_Bridge
   SHALL 仍按 Acceptance Criteria 3.2 完成 `forks[ownerRunId]` 登记,然后由 `'exit'`
   处理器按 3.3 路径正常清理(避免登记时检测进程状态带来的竞态)。
5. THE Script_Bridge SHALL 不允许同一个 `ownerRunId` 被 `attach` 两次(由 Script_Runtime
   调用方保证 run id 全局唯一)。

### Requirement 4: runScript 调度子 ScriptRun

**User Story:** 作为全局脚本作者,我希望调一次 `runScript(scriptId, profileId, params)`
就能驱动一个 profile-scope 子脚本跑完并拿到终态。

#### Acceptance Criteria

1. WHEN 全局脚本调用 `runScript(scriptId, profileId, params)`, THE SDK_Global_Surface
   SHALL 通过 Bridge_Client 发送 `method='runScript', payload={scriptId, profileId, params}`
   的 Bridge_Request。
2. WHEN Script_Bridge 处理 `runScript` 请求且校验通过, THE Script_Bridge SHALL 调用
   `Script_Runtime.start({ script, profile, webSocketDebuggerUrl, triggeredBy:'global-script', parentRunId, params })`
   启动 Child_Run,并把 `{reqId, childRunId}` 加入 `forks[parentRunId].pendingChildren`。
3. THE Script_Bridge SHALL 在调用 `Script_Runtime.start` 之前调用既有
   `ensureProfileRunningForScript(profile)` 取到 `webSocketDebuggerUrl`,与渲染层
   `scripts:run` IPC 走同一条路径。
4. WHEN Child_Run 进入终态(`succeeded` / `failed` / `stopped`), THE Script_Bridge
   SHALL 移除 Pending_Children 中本次条目,并以
   `{ ok: true, value: { run: <Child_Run 终态对象> } }` 的 Bridge_Response 回写父 fork。
5. THE Run_Script_Result `run.status` SHALL 总是 `'succeeded' | 'failed' | 'stopped'`
   三者之一,不会出现 `pending` / `running`。
6. WHEN Child_Run 创建成功, THE Child_Run SHALL 持久化 `triggeredBy === 'global-script'`、
   `parentRunId === Parent_Run.id`、`params === payload.params`(经 JSON 序列化往返
   后等价)。
7. IF Script_Bridge 在调用 `Script_Runtime.start` 时未能正确设置上述任一字段
   (例如未来字段重命名 / 漏传),THEN THE Script_Bridge SHALL 仍允许 Child_Run
   照常运行至终态(不因元数据写入失败而中止 fork),并在主进程日志写一条 warn
   级别记录,便于回溯。

### Requirement 5: runScript 的错误路径

**User Story:** 作为全局脚本作者,我希望 `runScript` 的失败路径有稳定的错误码,
以便在 try/catch 里精确分支。

#### Acceptance Criteria

1. IF `payload.scriptId` 在 Script_Store 中不存在, THEN THE Script_Bridge SHALL 以
   `error.code === 'SCRIPT_NOT_FOUND'` 回 Bridge_Response,并不启动任何 fork。
2. IF 命中的 Script `scope === 'global'`, THEN THE Script_Bridge SHALL 以
   `error.code === 'INVALID_SCOPE'` 回 Bridge_Response,并不启动任何 fork。
3. IF `payload.profileId` 在 Profile_Store 中不存在, THEN THE Script_Bridge SHALL 以
   `error.code === 'PROFILE_NOT_FOUND'` 回 Bridge_Response,并不启动任何 fork。
4. IF `Script_Runtime.start` 抛出 `ProfileBusyError`, THEN THE Script_Bridge SHALL 以
   `error.code === 'PROFILE_BUSY'` 回 Bridge_Response,并把 `error.occupiedBy` 设为
   原异常的 `occupiedBy` 值。
5. IF Script_Bridge 在处理 `runScript` 时遇到非以上分类的异常, THEN THE Script_Bridge
   SHALL 以 `error.code === 'INTERNAL_ERROR'` 回 Bridge_Response,且不让异常上抛到
   Node 事件循环。
6. WHEN SDK_Global_Surface 收到 `ok===false` 的 Bridge_Response, THE SDK_Global_Surface
   SHALL 以 Scope_Mismatch_Error(`code = response.error.code`,`message = response.error.message`)
   reject 用户的 Promise,以便用户脚本通过 `e.code` 分支。

### Requirement 6: 停止传播 父→子

**User Story:** 作为应用用户,当我手动停掉一个全局 run 时,它正在 await 的子 run 也应
立刻停下,且全局脚本里的 `runScript` 调用要明确以 `SCRIPT_STOPPED` reject,而不是
hang 到被 SIGKILL。

#### Acceptance Criteria

1. WHEN Parent_Run 从 Script_Runtime 活跃集合中消失(用户 stop / 异常退出 / 自然结束),
   THE Script_Bridge SHALL 对其 Pending_Children 中每个 `childRunId` 调用
   `Script_Runtime.stop(childRunId)`。
2. WHEN Parent_Run 被 stop 且 Pending_Children 非空, THE Script_Bridge SHALL 对每条
   挂起的 reqId 写一条 `error.code === 'SCRIPT_STOPPED'` 的 Bridge_Response 到父 fork
   的 IPC channel。
3. WHEN SDK_Global_Surface 收到 `code === 'SCRIPT_STOPPED'` 的错误响应,
   THE SDK_Global_Surface SHALL 以带该 code 的 Scope_Mismatch_Error reject
   用户调用的 Promise(覆盖 Requirement 5.6 的通用路径)。
4. WHILE 父 fork 处于 SIGTERM 后的 graceful 窗口期(`GRACEFUL_SHUTDOWN_MS = 3000ms`,
   与 Script_Runtime 既有常量一致),THE Script_Bridge SHALL 仍尝试发送
   SCRIPT_STOPPED Bridge_Response;若 IPC channel 已断,则静默忽略写失败,
   不影响其他 fork 的状态机。
5. WHEN Parent_Run 的 fork 仍存在但 `runScript` 启动新 Child_Run 之前父 run 已不在
   活跃集合, THE Script_Bridge SHALL 立即 stop 刚启动的 Child_Run 并以
   `SCRIPT_STOPPED` 回 Bridge_Response,确保调用方不会无限 hang。

### Requirement 7: 既有不变量保留

**User Story:** 作为既有 phase 1/2/3 的维护者,我需要 phase 6 的改动不回归任何旧行为。

#### Acceptance Criteria

1. THE phase 6 改动 SHALL 不改 `scripts:run` IPC handler 的签名(渲染层 → 主进程仍是
   `(scriptId, profileId)`,返回 `{ ok, run? } | { ok:false, error }`)。
2. WHERE 用户脚本 scope 为 `'profile'`, THE SDK_Global_Surface SHALL 仍让
   `profiles.list / profiles.get / profiles.create / profiles.delete / profiles.setQueue`
   与 `runScript` 抛出 `code === 'GLOBAL_NOT_AVAILABLE'` 的 Scope_Mismatch_Error
   (phase 2 已生效的不变量)。
3. THE Script_Runtime PROFILE_BUSY 互斥规则 SHALL 不被本阶段改动:对同一 profile,
   同一时刻仍最多 1 个活跃 ScriptRun;Child_Run 走相同互斥分支(若 profile 已被其他
   run 占用,Script_Runtime.start 抛 ProfileBusyError → Requirement 5.4 路径)。
4. THE phase 6 改动 SHALL 不引入任何新 npm 依赖。
5. THE phase 6 改动 SHALL 让 `pnpm run build` 退出码为 0,且
   `npx tsc -p tsconfig.json --noEmit` 与 `npx tsc -p tsconfig.electron.json --noEmit`
   各自零错误。

### Requirement 8: 写接口仍占位 已知 gap

**User Story:** 作为本阶段的接收方,我需要明确知道哪些 SDK 表面在 phase 6 之后仍未实装。

#### Acceptance Criteria

1. WHEN 全局脚本调用 `profiles.create(draft)` / `profiles.delete(id)` / `profiles.setQueue(...)`,
   THE SDK_Global_Surface SHALL 抛出 `code === 'GLOBAL_NOT_IMPL_YET'` 的 Scope_Mismatch_Error
   (沿用 phase 2 占位行为)。
2. THE 抛出的 Scope_Mismatch_Error message SHALL 包含字符串 `phase 6.x` 或类似指引,
   以便用户脚本日志直接指向后续阶段计划。
3. WHEN 全局脚本调用上述三个写接口, THE SDK_Global_Surface SHALL 不发起任何
   Bridge_Request,且不修改 Profile_Store 或磁盘内容。

### Requirement 9: Correlation id 不串扰

**User Story:** 作为全局脚本作者,我希望即使在循环里 `Promise.all([profiles.list(), profiles.list()])`
也能拿到正确结果,而不是把 A 的结果当成 B 的。

#### Acceptance Criteria

1. THE Bridge_Client SHALL 为每次 `call()` 分配此前从未使用过的 id,且
   id 严格单调递增。
2. WHEN 多个 Bridge_Request 在 fork 内并发发起, THE Bridge_Client SHALL 把每个
   Bridge_Response 仅 resolve / reject 给与其 `response.id` 严格相等的那条 pending
   条目;不会把 A 的 value 给到 B 的 Promise。
3. THE Script_Bridge SHALL 在生成 Bridge_Response 时把 `response.id` 设置为对应
   Bridge_Request 的 `id`,绝不反转或重复。

### Requirement 10: 协议层防御性校验

**User Story:** 作为系统稳定性维护者,我希望 IPC 层对乱序 / 形状非法的消息有兜底,
不让一个坏消息把整个主进程拖崩。

#### Acceptance Criteria

1. WHEN Script_Bridge 收到的 message 缺失 `kind === 'request'` 或
   `typeof id === 'number'` 或 `method ∈ Bridge_Method`, THE Script_Bridge SHALL
   静默丢弃该消息并写一条 warn 级别日志,不发送任何 Bridge_Response。
2. WHEN Script_Bridge 处理 Bridge_Request 时,任意同步或异步异常被捕获,
   THE Script_Bridge SHALL 把异常翻译为 Bridge_Error_Code 已知集合中的某个 code
   (优先匹配 ProfileBusyError → PROFILE_BUSY,其余兜底 INTERNAL_ERROR),
   并恰好发送一条 Bridge_Response;不让异常逃逸到 Node 事件循环。
3. WHEN Bridge_Client 收到形状不合法或 id 未匹配的消息, THE Bridge_Client SHALL
   静默丢弃并写 warn 级别日志,不影响其他 pending。
