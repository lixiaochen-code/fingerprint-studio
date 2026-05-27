# Design Document

> 关联文件: [`./requirements.md`](./requirements.md) · [`./tasks.md`](./tasks.md)
>
> 上一阶段: [`global-scripts-phase-6-runtime`](../global-scripts-phase-6-runtime/)。
> phase 6 已交付 fork↔main 的 ScriptBridge / BridgeClient 通道,本阶段只在通道**两端**
> (BridgeMethod 白名单、Script_Bridge 路由、SDK 表面、Monaco d.ts)各加一对镜像方法。

## Overview

本阶段把全局脚本 SDK 表面新增两条方法:

```ts
profiles.launch(profileId): Promise<void>   // 仅启动浏览器,等 CDP 就绪后 resolve
profiles.close(profileId): Promise<void>    // 关闭浏览器,等进程真退出后 resolve
```

主进程侧不引入新模块,只:
1. 在 `electron/scripts/bridge-types.ts` 的 `BridgeMethod` 联合追加两个字符串字面量;
2. 在 `electron/scripts/bridge.ts` 的 `BRIDGE_METHODS` 运行时 Set 同步追加,并在
   `handleRequest` 的 switch 增加两条 case 分支;
3. 在 `electron/main.ts` 抽出 `terminateProfileBrowser(profileId)` 单条关闭函数,
   `terminateAllProfileBrowsers` 内部循环调用之以保持语义等价;`ScriptBridge` 构造
   函数新增两个回调参数:`launchProfileForScript` / `closeProfileBrowser`,继续把
   "依赖 main.ts 模块级闭包"的副作用挡在 bridge 之外(沿用 phase 6 既有架构 ——
   `ensureProfileRunningForScript` 也是这条路径);
4. 在 `electron/scripts/sdk/types.ts` 的 `ProfilesApi` 接口加方法签名;
5. 在 `electron/scripts/sdk/index.ts` 的 `makeGlobalScopeProfilesApi` /
   `makeProfileScopeProfilesApi` 各加一对实装(全局走 BridgeClient,profile-scope
   立即 reject `GLOBAL_NOT_AVAILABLE`);
6. 在 `src/lib/script-typings.ts` 的 AUTO_REGISTRY_BLOCK 内 `ProfilesApi` 接口
   补上方法签名,Monaco 补全口径与 SDK types.ts 对齐。

不动 phase 6 既有的 `profiles.list / profiles.get / runScript`,不动占位 method
(create/delete/setQueue),不改渲染层 IPC,不引入新依赖。

## Architecture

### 为什么不复用 `runScript` 路径来"只启动浏览器"

phase 6 之前的"workaround"是写一个空脚本然后用 `runScript(emptyScriptId, profileId)`
顺手把浏览器拉起来。问题:

- **语义错位**:用户的意图是"准备环境",`runScript` 的语义是"调度子 ScriptRun",
  会污染 ScriptStore 的 ScriptRun 持久化记录,在 ActiveRunsButton 抽屉里出现一条
  "succeeded" 的伪 run。
- **互斥规则误伤**:`runScript` 内部走 `ScriptRuntimeManager.start()`,触发
  `ProfileBusyError` 互斥检查 —— 但用户想要的"启动浏览器"本身并不应该和已有
  ScriptRun 互斥(已经在跑就 no-op 复用就行)。
- **不可对称**:没有"反向"的 close —— `runScript` 结束不会关闭浏览器(与
  `ensureProfileRunningForScript` 既有语义一致,故意保持);用户想关浏览器只能
  寄希望于应用退出,缺乏控制力。

新增独立的 `launch / close` 是把"仅浏览器生命周期"作为一等公民暴露给全局脚本。

### 为什么不直接给 SDK 暴露 `terminateAllProfileBrowsers`

候选方案是给 SDK 暴露 `profiles.closeAll()` 直接调 `terminateAllProfileBrowsers`。
本阶段**不**这样做,理由:

- **粒度错配**:全局脚本作者通常需要的是"我刚 launch 出来的这个 profile,任务做完
  了把它关掉",而不是"把所有 profile 的浏览器都关掉"。后者是应用退出语义,主进程
  `before-quit` 已经在做。
- **副作用扩散**:`closeAll` 会影响其它正在跑的 ScriptRun(包括其它全局脚本顺便
  launch 的 profile),需要更复杂的占用检测;单点 `close(profileId)` 把检测降到 1
  个 profile 维度,逻辑闭环。
- **可组合**:用户脚本若想批量关,可以自己写
  `await Promise.all(ids.map(id => profiles.close(id).catch(() => null)))`,SDK
  不必再提供。

## Components and Interfaces

### 主进程侧:Profile_Terminate_Single

#### 抽出动机

`electron/main.ts` 现有 `terminateAllProfileBrowsers()` 把 SIGTERM/SIGKILL 状态机和
"遍历 profileProcesses"耦合在一起;本阶段需要"对单一 profileId 跑同一套状态机"。

直接照抄一份代码会让两条路径的 timer 常数 / SIGKILL 兜底窗口 / `profileProcesses`
delete 时机各自演化,半年后必定漂移。把单条状态机抽成 `terminateProfileBrowser`
后,两侧共用同一份实现,terminateAllProfileBrowsers 退化为一个并行
循环器:

```ts
async function terminateAllProfileBrowsers(): Promise<void> {
  // 关键:Array.from(...keys()) 拍快照,避免循环中 terminateProfileBrowser
  // 自身会 profileProcesses.delete(...) 修改 Map 引发"集合在迭代时被修改"
  const ids = Array.from(profileProcesses.keys())
  await Promise.all(ids.map((id) => terminateProfileBrowser(id)))
  // profileProcesses 由 terminateProfileBrowser 的每条路径自行 delete;这里清表
  // 是兜底(若并发期间有别的代码 set 进新条目,我们不在此处擦除,避免误删)
}
```

#### 单条函数的职责

```ts
async function terminateProfileBrowser(profileId: string): Promise<void> {
  const child = profileProcesses.get(profileId)
  // 不在跑或已 killed:幂等 no-op。这条与 close 语义对齐(Requirement 2.5)。
  // 注意:'killed' 是 child.killed 字段,而非 child.signalCode。Node 文档对前者
  // 的语义是"我们曾经成功 .kill() 过它";后者是"它最终因什么信号退出"。我们
  // 关心的是"是否还需要再发一次 SIGTERM",前者更贴切。
  if (!child || child.killed) {
    profileProcesses.delete(profileId)
    return
  }
  if (child.exitCode !== null || child.signalCode !== null) {
    // 进程已退,只是 spawn 的 'exit' listener 还没把表清掉;等同 no-op。
    profileProcesses.delete(profileId)
    return
  }

  await new Promise<void>((resolve) => {
    let settled = false
    const done = () => {
      if (settled) return
      settled = true
      // 幂等 delete:spawn 的 'exit' listener 也会 delete 一次,后到的 no-op
      profileProcesses.delete(profileId)
      resolve()
    }
    child.once('exit', done)

    // SIGTERM 同步抛(channel 已断 / 进程已无效)→ 视为已退出处理。设计依据:
    // requirements §2.8 —— 不向调用方 propagate,close 调用方拿到 ok=true
    try {
      child.kill('SIGTERM')
    } catch {
      done()
      return
    }

    // graceful 窗口期:沿用 terminateAllProfileBrowsers 的 2500ms,与 cookie/state
    // 落盘时长校准过的常数,不在本阶段改动
    setTimeout(() => {
      if (settled) return
      try { child.kill('SIGKILL') } catch {}
      // SIGKILL 通常很快触发 'exit';再给 200ms 兜底防止万一信号被吃掉
      setTimeout(done, 200)
    }, 2500)
  })
}
```

#### 不放进 `electron/scripts/` 的理由

`terminateProfileBrowser` 必须读写 `profileProcesses` Map,这张 Map 是 main.ts 模
块级闭包,被 `launchProfile` / `stopProfile` / `terminateAllProfileBrowsers` 多处
共用。把它挪到 `electron/scripts/` 会要么把整张 Map 一起搬出去(殃及 IPC 处理器
等大量代码),要么暴露 getter/setter(破坏封装)。

phase 6 已确立的范式是 —— 主进程胶水 (`ensureProfileRunningForScript`)以**函数引用**
的方式注入 `ScriptBridge` 构造函数,bridge 当黑盒调用即可。本阶段沿用同一范式:
`terminateProfileBrowser` 留在 main.ts,作为新的构造参数注入。

### 主进程侧:Script_Bridge 路由

#### ScriptBridge 构造函数签名扩展

```ts
constructor(
  private readonly runtime: ScriptRuntimeManager,
  private readonly scriptStore: ScriptStore,
  private readonly profileStore: ProfileStore,
  // phase 6 既有
  private readonly ensureProfileRunningForScript: (profile: BrowserProfile) => Promise<string>,
  // 本阶段新增 —— 两个具名 callback,而不是把 ensureProfileRunningForScript 改名复用
  private readonly launchProfileForScript: (profile: BrowserProfile) => Promise<void>,
  private readonly closeProfileBrowser: (profileId: string) => Promise<void>
)
```

#### 为什么 launch 不直接复用 `ensureProfileRunningForScript`

候选方案是 bridge 内部 `await ensureProfileRunningForScript(profile)` 然后丢弃返回
的 wsUrl;表面看节省一个 callback 字段。但:

- `ensureProfileRunningForScript` 的契约是"启动 + 返回 webSocketDebuggerUrl",其中
  "返回 wsUrl"是 `runScript` 路径强需求(用来 puppeteer.connect)。`profiles.launch`
  仅需"启动",没有"等 DevTools endpoint 就绪"的硬约束 —— 严格来说我们仍然需要
  等就绪以避免用户脚本立即 `runScript(...)` 时看到一个还没初始化的 profile,但
  这是"为后续 runScript 的便利",而不是 launch 自身契约的一部分。
- 直接复用会让 launch 失败原因里出现"DevTools endpoint timeout"这类用户难以理解
  的语言;独立 callback 让 main.ts 那侧将来能根据需要换实现(例如换成"只 spawn
  不等 endpoint")而不影响 bridge。

实装上 `launchProfileForScript` 的最简实现就是 `(p) => ensureProfileRunningForScript(p).then(() => undefined)`,
但**类型契约**和**调用语义**与 `ensureProfileRunningForScript` 解耦更利于演进。

#### BridgeMethod 白名单

`bridge-types.ts`:
```ts
export type BridgeMethod =
  | 'profiles.list'
  | 'profiles.get'
  | 'profiles.launch'   // 新增
  | 'profiles.close'    // 新增
  | 'runScript'
```

`bridge.ts` 的 `BRIDGE_METHODS` Set 同步追加。这两处必须**严格同步** —— 编译时类型
联合 + 运行时 Set 是协议层校验的双保险,phase 6 既有注释已明示"新增 method 必须两
边同步"。

#### 路由分支

`handleRequest` switch 内新增:

```ts
case 'profiles.launch': {
  const payload = request.payload as { id?: unknown } | null | undefined
  const id = payload?.id
  if (typeof id !== 'string') throw new Error('profiles.launch: payload.id must be a string')

  const profile = this.profileStore.get(id)
  if (!profile) {
    this.sendResponse(child, {
      kind: 'response', id: request.id, ok: false,
      error: { code: 'PROFILE_NOT_FOUND', message: `profile not found: ${id}` }
    })
    return
  }

  // 复用 launchProfile 的"已启动则 no-op"分支;不需要在 bridge 这层再判
  // profileProcesses 状态(那是 main.ts 的内部簿记)
  await this.launchProfileForScript(profile)
  this.sendResponse(child, { kind: 'response', id: request.id, ok: true, value: null })
  return
}

case 'profiles.close': {
  const payload = request.payload as { id?: unknown } | null | undefined
  const id = payload?.id
  if (typeof id !== 'string') throw new Error('profiles.close: payload.id must be a string')

  const profile = this.profileStore.get(id)
  if (!profile) {
    this.sendResponse(child, {
      kind: 'response', id: request.id, ok: false,
      error: { code: 'PROFILE_NOT_FOUND', message: `profile not found: ${id}` }
    })
    return
  }

  // 占用检测:先 active-run 检查,后 close。两步顺序固定
  // —— 顺序反过来会出现"close 已发完 SIGTERM 才发现 profile 上有 active run"的
  // 不可恢复路径(浏览器已经被杀,active run 因此立刻崩 + close 报 PROFILE_BUSY,
  // 用户两端都看到错)。
  const occupiedBy = this.runtime.getActiveByProfile(id)
  if (occupiedBy) {
    this.sendResponse(child, {
      kind: 'response', id: request.id, ok: false,
      error: {
        code: 'PROFILE_BUSY',
        message: `profile ${id} is occupied by run ${occupiedBy.id} (script ${occupiedBy.scriptId})`,
        occupiedBy: { runId: occupiedBy.id, scriptId: occupiedBy.scriptId }
      }
    })
    return
  }

  // closeProfileBrowser 内部对"未在跑"是 no-op;bridge 这层不重复判
  await this.closeProfileBrowser(id)
  this.sendResponse(child, { kind: 'response', id: request.id, ok: true, value: null })
  return
}
```

#### 错误兜底

handleRequest 既有的"async IIFE + try/catch → 翻译成 BridgeError 写一条 RESPONSE"
路径不变;两条新分支抛任何 throw 都会被外层捕获翻译为 `INTERNAL_ERROR`(payload
校验失败的字符串 throw 也是这条路径)。

`ProfileBusyError` 不会从 launch/close 路径抛出 —— `profiles.close` 的 PROFILE_BUSY
是我们手动构造的 BridgeError,不走 `toBridgeError` 翻译。这是有意而为:`close` 的
PROFILE_BUSY 要透传 `runtime.getActiveByProfile()` 的返回值字段(那不是
`ProfileBusyError` 实例,而是 `ScriptRun` 对象的子集),手动构造比"先 throw
ProfileBusyError 再 catch 翻译"更直白。

### SDK 侧:全局表面与 profile-scope 表面

#### `electron/scripts/sdk/types.ts` 接口扩展

```ts
export interface ProfilesApi {
  list(): Promise<Readonly<BrowserProfile>[]>
  get(id: string): Promise<Readonly<BrowserProfile> | null>
  // 本阶段新增 —— 紧跟 list/get 放,占位 create/delete/setQueue 留在末尾
  launch(id: string): Promise<void>
  close(id: string): Promise<void>
  create(draft: ProfileDraft): Promise<BrowserProfile>
  delete(id: string): Promise<void>
  setQueue(profileId: string, kind: 'on-create' | 'on-launch', scriptIds: string[]): Promise<void>
}
```

字段顺序:`list / get / launch / close / create / delete / setQueue` —— **只读 →
浏览器生命周期 → 写**,review 时眼扫即可看出层次。

#### `makeGlobalScopeProfilesApi` 实装

```ts
function makeGlobalScopeProfilesApi(bridge: BridgeClient): ProfilesApi {
  return {
    list: () => wrapBridgeRejection(bridge.call<BrowserProfile[]>('profiles.list', {})),
    get: (id) => wrapBridgeRejection(bridge.call<BrowserProfile | null>('profiles.get', { id })),
    // 本阶段新增 —— BridgeClient.call 泛型显式 void(成功 value 是 null,SDK 忽略
    // 该值,直接 resolve undefined)。.then(() => undefined) 把 null 抹掉,以
    // 严格匹配类型签名 Promise<void>;不写 then 的话用户拿到 null 也无害,但
    // 类型签名声明 void 就要尊重它。
    launch: (id) =>
      wrapBridgeRejection(bridge.call<null>('profiles.launch', { id })).then(() => undefined),
    close: (id) =>
      wrapBridgeRejection(bridge.call<null>('profiles.close', { id })).then(() => undefined),
    create: () => notImplementedYet('create'),
    delete: () => notImplementedYet('delete'),
    setQueue: () => notImplementedYet('setQueue')
  }
}
```

#### `makeProfileScopeProfilesApi` 实装

```ts
function makeProfileScopeProfilesApi(): ProfilesApi {
  return {
    list: () => Promise.reject(globalNotAvailable()),
    get: () => Promise.reject(globalNotAvailable()),
    launch: () => Promise.reject(globalNotAvailable()),  // 新增
    close: () => Promise.reject(globalNotAvailable()),   // 新增
    create: () => Promise.reject(globalNotAvailable()),
    delete: () => Promise.reject(globalNotAvailable()),
    setQueue: () => Promise.reject(globalNotAvailable())
  }
}
```

profile-scope 调全局 API 立即 reject 是 phase 6 既有约定 —— 不让用户在 profile-scope
脚本里以为能用全局 API。

### Monaco d.ts(`src/lib/script-typings.ts`)

AUTO_REGISTRY_BLOCK 内的 `ProfilesApi` 接口同步加签名:

```ts
export interface ProfilesApi {
  list(): Promise<Readonly<Profile>[]>
  get(id: string): Promise<Readonly<Profile> | null>
  /**
   * 仅启动 profile 浏览器,不跑任何脚本。等 CDP 就绪后 resolve。
   * 已启动则 no-op 复用同一进程。
   * profile-scope 脚本调用会 reject GLOBAL_NOT_AVAILABLE。
   */
  launch(id: string): Promise<void>
  /**
   * 显式关闭 profile 浏览器,等浏览器进程真退出后 resolve。
   * profile 上有活跃 ScriptRun 时 reject PROFILE_BUSY(带 occupiedBy)。
   * 浏览器本来就没在跑则 no-op resolve。
   * profile-scope 脚本调用会 reject GLOBAL_NOT_AVAILABLE。
   */
  close(id: string): Promise<void>
  create(draft: ProfileDraft): Promise<Profile>
  delete(id: string): Promise<void>
  setQueue(profileId: string, kind: 'on-create' | 'on-launch', scriptIds: string[]): Promise<void>
}
```

字段顺序与 `electron/scripts/sdk/types.ts` 严格对齐,review 时双向 grep 无歧义。

## Data Models

### 错误码不扩展

`BridgeErrorCode` 联合保持原集合。具体决策表:

| 触发场景 | 选用 code | 理由 |
|---|---|---|
| launch/close payload.id 非字符串 | `INTERNAL_ERROR` | 协议层校验失败,与 phase 6 `profiles.get` 同口径 |
| profile 不存在 | `PROFILE_NOT_FOUND` | 复用 phase 6 既有码 |
| close 时 profile 上有活跃 run | `PROFILE_BUSY` | 复用 phase 6 既有码;额外字段 `occupiedBy` 通过 `[k:string]:unknown` 索引签名透传 |
| close 时 profile 没在跑 | (无 —— ok=true 走 no-op) | 不需要错误码,与 launch 的 no-op 复用语义对称 |
| Profile_Launch_Path 抛错(浏览器启动失败 / CDP 超时 / etc.) | `INTERNAL_ERROR` | 同 runScript 失败的口径 |
| Profile_Terminate_Single 抛错(实际上不抛 —— SIGTERM 同步 throw 已被吞掉) | `INTERNAL_ERROR` | 兜底 |

不新增 `BROWSER_NOT_RUNNING` —— close 在 profile 没在跑时直接 no-op resolve 比抛
错更"调用方友好"(用户写 `await profiles.close(id)` 不需要 try/catch
"那种已经没在跑的情况"),且与 launch 的 no-op 复用语义对称。

### 数据流时序图

#### launch 成功路径

```
user.script   bridge-client   ScriptBridge   launchProfileForScript   profileProcesses
    |              |                |                  |                      |
    |--launch(p)-->|                |                  |                      |
    |              |--REQUEST(...)->|                  |                      |
    |              |                |--launch(prof)--->|                      |
    |              |                |                  |--miss → spawn child->|
    |              |                |                  |--wait DevToolsPort-->|
    |              |                |                  |<--wsUrl(discarded)---|
    |              |                |<-----return------|                      |
    |              |<--RESPONSE(ok)-|                  |                      |
    |<--resolve()--|                |                  |                      |
```

#### close + PROFILE_BUSY 路径(早返回,不动浏览器)

```
user.script   bridge-client   ScriptBridge   runtime.getActiveByProfile
    |              |                |                  |
    |--close(p)--->|                |                  |
    |              |--REQUEST(...)->|                  |
    |              |                |--get(p)--------->|
    |              |                |<--ScriptRun------|  (occupiedBy 命中)
    |              |<-RESPONSE(BUSY)|                  |
    |<--reject-----|                |                  |
        e.code='PROFILE_BUSY'
        e.occupiedBy={runId, scriptId}
```

#### close 真关闭路径

```
user.script   bridge-client   ScriptBridge   closeProfileBrowser   profileProcesses   ChildProcess
    |              |                |                  |                  |               |
    |--close(p)--->|                |                  |                  |               |
    |              |--REQUEST(...)->|                  |                  |               |
    |              |                |--close(p)------->|                  |               |
    |              |                |                  |--get(p)--------->|               |
    |              |                |                  |<--ChildProcess---|               |
    |              |                |                  |--SIGTERM-------------------------->|
    |              |                |                  |--<wait 'exit' or 2.5s>---------->|
    |              |                |                  |                       (exit)     |
    |              |                |                  |<--'exit' event-------------------|
    |              |                |                  |--delete(p)------>|               |
    |              |                |<-----return------|                  |               |
    |              |<--RESPONSE(ok)-|                  |                  |               |
    |<--resolve()--|                |                  |                  |               |
```

## Error Handling

### 错误场景

1. **launch 时 Chromium 启动失败**:`launchProfileForScript` 抛错(例如内核未安装、
   spawn EACCES、proxy auth 失败 etc.)→ Script_Bridge 兜底 catch → `INTERNAL_ERROR`
   + 原 message。SDK 这层 wrap 成 ScopeMismatchError 透传给用户脚本。
2. **launch 时 CDP 端口等待超时**:同上,`waitForDevToolsEndpoint` 抛 `Timed out
   waiting for DevToolsActivePort` → INTERNAL_ERROR + 原 message。用户能从 message
   直接判断是浏览器初始化慢的问题。
3. **close 时 SIGTERM 失败**:`child.kill('SIGTERM')` 同步抛(channel 已断 / 进程已
   不存在),`terminateProfileBrowser` 内部吞掉 + 走 `done()` 路径。从调用方视角
   等同 ok=true 完成 —— 进程反正已经不在了,用户的目的已经达成。
4. **close 时 SIGKILL 也没让进程退出**:200ms 兜底后 `done()` 强制 resolve;
   `profileProcesses` 表也被清掉。下一次 `launch` 时,`launchProfile` 走
   `existing && !existing.killed` 检查会发现表项已不存在,直接重新 spawn(若那
   个孤儿进程还存活,新 spawn 会因为 SingletonLock 失败 —— 这是已知遗留问题,与
   本阶段无关,由 `runStartupJanitor` / Chromium 自身 lock 机制兜底)。
5. **launch 与 close 在同一 profile 上并发**:bridge 路由是单线程串行(JS 事件循
   环),两条 BridgeRequest 进入 handleRequest 是串行调度,但**异步处理**之间会
   交错。
   - 若 launch 先入,await 期间 close 后入:close 看到 profileProcesses 命中,真
     去关。然后 launch 的 await 在已被关的 child 上 resolve(`waitForDevToolsEndpoint`
     可能在等待时超时 → INTERNAL_ERROR)。这是用户脚本逻辑错乱,不在本阶段保证。
   - 若 close 先入,await 期间 launch 后入:launch 走 `ensureProfileRunningForScript`,
     看到 profileProcesses 表项已被 delete,触发新一轮 spawn。语义上"先关后开",
     合理。
   两种交错都不会让 bridge / profileProcesses 表本身陷入不一致状态(关键不变量:
   profileProcesses 的 set/delete 都在 main.ts 的同步代码块内完成,不存在
   "set 一半 / delete 一半"的中间态)。

## Testing Strategy

**双轨并用**:
- **属性测试**:见 §13 Correctness Properties,5 条属性覆盖核心决策表与状态机收敛。
- **单元测试 + 集成测试**:覆盖具体例子与边界(payload 校验、错误码映射、SDK 错误
  wrap)以及与 phase 6 既有路径的回归。

**测试基础设施**:
- ScriptBridge 测试沿用 phase 6 既有的"fake ChildProcess + fake ScriptStore +
  fake ProfileStore + fake ScriptRuntimeManager"模式;新增构造参数
  `launchProfileForScript` / `closeProfileBrowser` 注入 jest.fn-style 桩。
- `terminateProfileBrowser` 测试:fake ChildProcess 类(EventEmitter 子类 + 桩
  `kill` 方法记录信号 + 可控时机 emit `'exit'`),配合 `vi.useFakeTimers()` 控制
  2500ms / 200ms 超时窗口。

**性能与外部依赖**:
- 不需要真启动 Chromium —— 主进程胶水函数(`launchProfileForScript` /
  `closeProfileBrowser`)在测试里全是桩,不进 spawn。
- 100+ 迭代的属性测试因此能在毫秒级跑完。

### Acceptance Criteria 测试 Prework

> 完整分析见 prework 工具调用记录(已落入 spec 上下文)。

5 条最终属性的简要追溯:
- P1: 来自 1.4 + 1.5(launch 决策表 / 幂等)
- P2: 来自 1.6(launch 错误透传)
- P3: 来自 2.4 + 2.5 + 2.6(close 决策表)
- P4: 来自 2.7(terminateProfileBrowser 状态机)
- P5: 来自 4.4(terminateAllProfileBrowsers 重构等价)

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid
executions of a system - essentially, a formal statement about what the system
should do. Properties serve as the bridge between human-readable specifications
and machine-verifiable correctness guarantees.*

### Property 1: launch 决策表与幂等性

*For any* profileId 和任意正整数 N(连续调用次数),`profiles.launch(profileId)`
经过 ScriptBridge 路由后:
- 若 ProfileStore 内不存在该 id → 每次调用都以 `PROFILE_NOT_FOUND` reject;
- 若 ProfileStore 命中 → 第 1 次调用触发底层 `launchProfileForScript`
  恰好 1 次,后续 N-1 次调用走 no-op 复用分支(底层 `launchProfileForScript`
  额外被调用次数 ≥ 0 但每次都通过 profileProcesses 命中走"已启动则不再
  spawn"分支),所有 N 次调用都以 `ok=true, value=null` resolve。

**Validates: Requirements 1.4, 1.5**

### Property 2: launch 错误透传到 INTERNAL_ERROR

*For any* `launchProfileForScript` 抛出的 Error 实例 e 与任意合法 profileId,
`profiles.launch(profileId)` 在 ScriptBridge 路由后产生的 BridgeResponse 满足
`response.ok === false` 且 `response.error.code === 'INTERNAL_ERROR'` 且
`response.error.message === e.message`(若 e 不是 Error 实例则 message 等于
`String(e)`)。

**Validates: Requirements 1.6**

### Property 3: close 决策表

*For any* profileId 与任意"profileProcesses 表状态 ⊕ runtime.active 表状态"组
合,`profiles.close(profileId)` 经过 ScriptBridge 路由后产生的 BridgeResponse 满足
以下决策表(从上至下短路命中):

| 前置条件 | response.ok | response.error.code | profileProcesses 变化 |
|---|---|---|---|
| ProfileStore 不命中 | false | PROFILE_NOT_FOUND | 不变 |
| runtime.getActiveByProfile 命中 | false | PROFILE_BUSY | 不变 |
| profileProcesses 不命中 或 child.killed | true | (n/a) | 不变 |
| 其它(profileProcesses 命中且 child 活) | true | (n/a) | 该条目被 delete |

且当且仅当落到第 4 行时,目标 ChildProcess 至少收到一次 `SIGTERM`,且若 graceful
窗口期内未 `'exit'` 则随后收到 `SIGKILL`。

**Validates: Requirements 2.4, 2.5, 2.6, 2.7**

### Property 4: terminateProfileBrowser 状态机收敛

*For any* fake ChildProcess(具备 `kill(signal)` / `'exit'` 事件)以及任意"exit 触
发时机"(立即 / graceful 窗口期内某时刻 / graceful 窗口期外某时刻 / 永不触发),
`terminateProfileBrowser(profileId)` 在所有时序下:
- 都会在有限时间内 resolve(最坏情况下 ≤ 2500 + 200 ms);
- resolve 后 profileProcesses 中对应条目已被 delete;
- resolve 永远不 reject(不向调用方 propagate child.kill 同步异常)。

**Validates: Requirements 2.7, 2.8**

### Property 5: terminateAllProfileBrowsers 重构等价性

*For any* profileProcesses 起始状态(0..N 条非 killed 子进程),重构后的
`terminateAllProfileBrowsers` 在 resolve 后:
- profileProcesses 表为空;
- 起始状态中每个非 killed child 都至少收到一次 `SIGTERM`(若其在 graceful 窗口期
  内 `'exit'` 则不再收 SIGKILL,否则随后收 SIGKILL);
- resolve 永远不 reject。

**Validates: Requirements 4.4**
