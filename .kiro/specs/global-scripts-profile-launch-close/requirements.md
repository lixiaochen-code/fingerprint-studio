# Requirements Document

> 真源 spec: [`docs/specs/global-scripts-and-queues.md`](../../../docs/specs/global-scripts-and-queues.md) §5(全局脚本 SDK 表面)
> 上一阶段: [`global-scripts-phase-6-runtime`](../global-scripts-phase-6-runtime/)(已交付 profiles.list / profiles.get / runScript)
> 本阶段 design: [`./design.md`](./design.md)

## Introduction

phase 6 已经把全局脚本里的 `profiles.list / profiles.get / runScript` 接通到主进程,
但**没有**给全局脚本留"只拉起浏览器、不跑脚本"和"显式关闭浏览器"的能力。
当前唯一启动浏览器的路径是 `runScript`,它内部会调 `ensureProfileRunningForScript`
顺手 launch,用户脚本想"暖一下 cookie / 手动登录"只能伪造一个空的 profile 脚本去
跑一遍 —— 体验差,语义也错。

本阶段把 SDK_Global_Surface 扩成两条新方法:

- `profiles.launch(profileId): Promise<void>` —— 仅启动浏览器,等 CDP 就绪后 resolve
- `profiles.close(profileId): Promise<void>` —— 关闭浏览器,等进程真退出后 resolve

整条链路涉及 BridgeMethod 白名单、ScriptBridge 路由、SDK 表面、Monaco d.ts。
不动 phase 6 既有的 list/get/runScript,不动 profiles.create/delete/setQueue 占位
(那些仍 throw `GLOBAL_NOT_IMPL_YET`),不改渲染层 IPC 签名。

本文档列出新增 API 的不变量与可观察行为,作为 design 的验收口径;`tasks.md`
会把这些拆成可编码任务。

## Glossary

> 仅列出**本阶段新增或语义被本阶段细化**的术语,phase 6 已定义的术语
> (Bridge_Client / Bridge_Method / Script_Bridge / Profile_Store / 等)沿用不重复。

- **Profile_Process_Map**: 主进程 `electron/main.ts` 模块级闭包内的
  `profileProcesses: Map<profileId, ChildProcess>`,记录当前由本应用启动且尚未
  退出的 Chromium 子进程。是"profile 浏览器是否在跑"的唯一来源。
- **Profile_Launch_Path**: 既有的 `ensureProfileRunningForScript(profile)`,
  内部封装"未跑则 launchProfile + 等 DevToolsActivePort + 返回
  webSocketDebuggerUrl"的串行流程;本阶段 `profiles.launch` 直接复用此函数。
- **Profile_Terminate_Single**: 本阶段**新增**的主进程函数
  `terminateProfileBrowser(profileId): Promise<void>`,把
  `terminateAllProfileBrowsers` 内部"SIGTERM → 等 exit → 超时 SIGKILL → 清表"的
  单条实现抽成针对单一 profileId 的 graceful 关闭;不引入新依赖。
- **Profile_Graceful_Ms**: SIGTERM 后给 Chromium 走 cookie/state 落盘的最长等待
  时间,沿用 `terminateAllProfileBrowsers` 既有常数 `2500ms`。超时后发 SIGKILL,
  再给 200ms 兜底。
- **Profile_Active_Run**: `ScriptRuntimeManager.getActiveByProfile(profileId)` 的返
  回值,代表"当前占用该 profile 的 profile-scope ScriptRun";不为 undefined
  即"profile 上有活跃 ScriptRun"。
- **Browser_Launch_Method / Browser_Close_Method**: 本阶段新增的两条
  Bridge_Method 字符串字面量:`'profiles.launch'` / `'profiles.close'`。
- **Launch_Result_Value / Close_Result_Value**: Bridge_Response.value 形状,
  本阶段两条方法成功路径的 value 都是 `null`(SDK 那侧 resolve 为
  `Promise<void>`)。

## Requirements

### Requirement 1: 全局脚本可以仅启动浏览器(profiles.launch)

**User Story:** 作为全局脚本作者,我希望能在脚本里"只拉起 profile 浏览器、不跑
任何脚本",以便完成手动登录、暖 cookie、或在多个 profile 间做交互式准备工作。

#### Acceptance Criteria

1. WHEN 全局脚本调用 `profiles.launch(profileId)`, THE SDK_Global_Surface SHALL
   通过 Bridge_Client 发送 `method='profiles.launch', payload={id: profileId}` 的
   Bridge_Request。
2. WHEN Script_Bridge 收到 `profiles.launch` Bridge_Request, THE Script_Bridge
   SHALL 校验 payload.id 类型为字符串;若不是字符串,以 `INTERNAL_ERROR` 写一条
   Bridge_Response。
3. WHEN Script_Bridge 处理 `profiles.launch` 且 Profile_Store 内不存在指定 id,
   THE Script_Bridge SHALL 以 `PROFILE_NOT_FOUND` 写一条 Bridge_Response。
4. WHEN Script_Bridge 处理 `profiles.launch` 且 Profile_Store 命中,
   THE Script_Bridge SHALL 调用 Profile_Launch_Path,等待其返回
   `webSocketDebuggerUrl`,然后以 `ok=true, value=null` 写一条 Bridge_Response。
5. WHILE 目标 profile 已存在于 Profile_Process_Map(已启动且未 killed),
   THE Script_Bridge SHALL 让 `profiles.launch` 走 Profile_Launch_Path 的"复用
   现有进程"分支,等同一份 DevTools endpoint 就绪后以 `ok=true, value=null`
   resolve(no-op 复用语义,不抛错)。
6. IF Profile_Launch_Path 抛出错误(包括但不限于 Chromium 启动失败、CDP 连接超时、
   内核未安装), THEN THE Script_Bridge SHALL 以 `INTERNAL_ERROR` + 原 message 写
   一条 Bridge_Response,**不**改写为其它 Bridge_Error_Code。
7. THE SDK_Global_Surface SHALL 让成功路径的 `profiles.launch(profileId)` 以
   `Promise<void>`(resolve 为 `undefined`)而非真值结算。
8. THE SDK_Global_Surface SHALL 把 Bridge_Error 形状的 reject 经 wrapBridgeRejection
   wrap 成 ScopeMismatchError 实例后透传给用户脚本(沿用 phase 6 既有 wrap 路径,
   不新增类型)。

### Requirement 2: 全局脚本可以显式关闭浏览器(profiles.close)

**User Story:** 作为全局脚本作者,我希望能在脚本结束前显式关闭某个 profile 的浏
览器,以便释放进程资源、确保 cookie/state 落盘、并让外部工具(包括我自己脚本下
一轮 launch)从干净状态开始。

#### Acceptance Criteria

1. WHEN 全局脚本调用 `profiles.close(profileId)`, THE SDK_Global_Surface SHALL
   通过 Bridge_Client 发送 `method='profiles.close', payload={id: profileId}` 的
   Bridge_Request。
2. WHEN Script_Bridge 收到 `profiles.close` Bridge_Request, THE Script_Bridge
   SHALL 校验 payload.id 类型为字符串;若不是字符串,以 `INTERNAL_ERROR` 写一条
   Bridge_Response。
3. WHEN Script_Bridge 处理 `profiles.close` 且 Profile_Store 内不存在指定 id,
   THE Script_Bridge SHALL 以 `PROFILE_NOT_FOUND` 写一条 Bridge_Response。
4. WHEN Script_Bridge 处理 `profiles.close` 且 Profile_Active_Run 命中(profile
   上有活跃 profile-scope ScriptRun), THE Script_Bridge SHALL 以
   `PROFILE_BUSY` + `occupiedBy={runId, scriptId}` 写一条 Bridge_Response,
   且**不**触碰 Profile_Process_Map 中的对应进程(对齐 phase 6 PROFILE_BUSY 的
   占用语义)。
5. WHEN Script_Bridge 处理 `profiles.close` 且 Profile_Process_Map 不命中或对应
   ChildProcess 已 killed, THE Script_Bridge SHALL 以 `ok=true, value=null` 写一条
   Bridge_Response(no-op 语义,不抛错)。
6. WHEN Script_Bridge 处理 `profiles.close` 且 Profile_Process_Map 命中且
   Profile_Active_Run 未命中, THE Script_Bridge SHALL 调用 Profile_Terminate_Single
   并 await 其完成,然后以 `ok=true, value=null` 写一条 Bridge_Response。
7. THE Profile_Terminate_Single SHALL 对目标 ChildProcess 先发 `SIGTERM`,在
   Profile_Graceful_Ms(2500ms)内等 `'exit'` 事件触发;若超时则发 `SIGKILL`,再
   给 200ms 兜底,最终把 Profile_Process_Map 中对应条目删除并 resolve。
8. IF Profile_Terminate_Single 在调用 `child.kill('SIGTERM')` 时同步 throw
   (例如 channel 已断), THEN THE Profile_Terminate_Single SHALL 视为已退出处理:
   静默吞掉异常 + 删除 Profile_Process_Map 对应条目 + resolve(不向调用方
   propagate;主进程 spawn 的 'exit' listener 此时若已触发也已自行 delete,
   再次 delete 是幂等)。
9. THE SDK_Global_Surface SHALL 让成功路径的 `profiles.close(profileId)` 以
   `Promise<void>`(resolve 为 `undefined`)结算。
10. THE SDK_Global_Surface SHALL 把 Bridge_Error 形状的 reject 经
    wrapBridgeRejection wrap 成 ScopeMismatchError 实例后透传给用户脚本。

### Requirement 3: 协议层与 SDK 表面的契约

**User Story:** 作为系统设计者,我希望两条新方法在协议层、SDK 层、Monaco 类型层
保持一致,避免任何一侧"看得见但跑不通"。

#### Acceptance Criteria

1. THE Bridge_Method 联合类型 SHALL 同时包含 `'profiles.launch'` 与
   `'profiles.close'`,且 BRIDGE_METHODS Set(`electron/scripts/bridge.ts` 内的
   运行时白名单)同步包含这两条字符串。
2. THE SDK_Global_Surface(`makeGlobalScopeProfilesApi` 的返回值)SHALL 暴露
   `launch(id: string): Promise<void>` 与 `close(id: string): Promise<void>` 两个
   方法。
3. THE profile-scope SDK 表面(`makeProfileScopeProfilesApi` 的返回值)SHALL 让
   `launch` 与 `close` 两个方法立即 reject `GLOBAL_NOT_AVAILABLE` ScopeMismatchError
   (沿用 phase 6 既有"profile-scope 调全局 API 立即 reject"模式)。
4. THE ProfilesApi 接口(`electron/scripts/sdk/types.ts`)SHALL 同时声明
   `launch(id: string): Promise<void>` 与 `close(id: string): Promise<void>`
   方法签名。
5. THE Monaco d.ts(`src/lib/script-typings.ts` 内的 AUTO_REGISTRY_BLOCK)SHALL
   在 `ProfilesApi` 接口内同时声明这两个方法签名,字段顺序与 SDK types.ts 对齐
   以便 review 时双向 grep。
6. THE Bridge_Error_Code 联合 SHALL **不**新增任何错误码;两条新方法的所有失败
   路径只复用现有 `PROFILE_NOT_FOUND` / `PROFILE_BUSY` / `INTERNAL_ERROR` 三个码。

### Requirement 4: 不影响既有功能

**User Story:** 作为既有系统的维护者,我希望本阶段的新增不破坏 phase 6 已交付的
任何路径,也不影响渲染层既有 IPC。

#### Acceptance Criteria

1. THE Script_Bridge SHALL 保持 `profiles.list` / `profiles.get` / `runScript` 三
   条既有 method 的字段形状、错误码语义、以及成功 / 失败 RESPONSE 写入路径**完全
   不变**。
2. THE SDK_Global_Surface SHALL 保持 `profiles.create` / `profiles.delete` /
   `profiles.setQueue` 三条占位方法**仍**抛 `GLOBAL_NOT_IMPL_YET` ScopeMismatchError,
   不发起任何 Bridge_Request。
3. THE 渲染层 IPC(`profiles:launch` / `profiles:stop` / `scripts:run` 等)SHALL
   保持签名与行为完全不变;本阶段不新增、不修改任何 `ipcMain.handle`。
4. THE `terminateAllProfileBrowsers` 函数 SHALL 保持对外行为不变;若内部经重构改
   为复用 Profile_Terminate_Single,语义(SIGTERM → 等 exit → 超时 SIGKILL →
   清表 → 幂等)与既有实现等价。
5. THE `ensureProfileRunningForScript` 函数 SHALL 保持签名与行为完全不变;本阶段
   只在 Script_Bridge 内增加一条新调用点,不改其内部实现。

### Requirement 5: 构建与质量门槛

**User Story:** 作为合并把关人,我希望本阶段的实装能干净通过 TypeScript 编译。

#### Acceptance Criteria

1. WHEN 在仓库根目录执行 `pnpm run build`, THE 构建流程 SHALL 全程 0 错误退出。
2. THE 新增代码 SHALL 不引入任何新的运行时依赖(`package.json` 的 `dependencies` /
   `devDependencies` 不变化)。
3. THE 注释 SHALL 用中文解释"为什么"(对齐仓库既有风格),不要求注释"做什么"。
4. THE 三份 spec 文档(requirements / design / tasks)SHALL 用中文撰写。
