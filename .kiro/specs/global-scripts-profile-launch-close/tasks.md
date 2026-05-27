# Implementation Plan: global-scripts-profile-launch-close

> 关联文件: [`./requirements.md`](./requirements.md) · [`./design.md`](./design.md)
>
> 总思路: 沿 `bridge-types → bridge → main 注入 → SDK types → SDK 实装 → Monaco
> d.ts` 的链路一层一层加,每加一层都先把"形状/类型"定下来,再写"行为",最后用
> 属性测试与单元测试钉死决策表。每条任务都建立在前一条的产物上,最后一步把
> 全链路在主进程 wiring 处串起来。

## Overview

**实现语言**: TypeScript(与项目主语言、phase 6 既有代码、design 中的代码示例一致)。

**变更范围**:
- 修改 `electron/scripts/bridge-types.ts`:扩 `BridgeMethod` 联合
- 修改 `electron/scripts/bridge.ts`:扩白名单 Set + 加 2 条 case 分支 + 扩构造参数
- 修改 `electron/main.ts`:抽出 `terminateProfileBrowser` + 适配
  `terminateAllProfileBrowsers` + 给 `new ScriptBridge` 传新参数
- 修改 `electron/scripts/sdk/types.ts`:`ProfilesApi` 接口加 2 个签名
- 修改 `electron/scripts/sdk/index.ts`:全局 + profile-scope 各加 2 条实装
- 修改 `src/lib/script-typings.ts`:Monaco d.ts 的 `ProfilesApi` 加 2 个签名

**不在范围**: 渲染层 IPC、phase 6 既有 method、占位写接口、新依赖。

## Task Dependency Graph

```json
{
  "waves": [
    {
      "wave": 1,
      "description": "协议层 + main.ts 抽函数(可并行)",
      "tasks": ["1", "2"]
    },
    {
      "wave": 2,
      "description": "ScriptBridge 路由 + SDK 表面 + Monaco d.ts(均依赖 wave 1 的协议层与抽函数,但彼此独立可并行)",
      "tasks": ["3", "5", "6"]
    },
    {
      "wave": 3,
      "description": "main.ts wiring 串起新参数",
      "tasks": ["4"]
    },
    {
      "wave": 4,
      "description": "全链路构建与质量门槛",
      "tasks": ["7"]
    }
  ]
}
```

**关键依赖**:
- Task 1(协议层)与 Task 2(main 抽函数)互不阻塞,wave 1 并行;
- Task 3(bridge 路由)依赖 Task 1 的 BridgeMethod 联合(否则 switch 分支报类型
  错);
- Task 4(wiring)依赖 Task 2 的 terminateProfileBrowser 与 Task 3 的扩展构造参数;
- Task 5(SDK)依赖 Task 1 的 BridgeMethod(`bridge.call('profiles.launch', ...)`
  调用要传白名单方法名);
- Task 6(d.ts)只看 SDK 表面契约,不依赖任何运行时实装,可独立完成,与 task 5
  并行;
- Task 7(最终构建)依赖 4、5、6 全部完成。

## Tasks

- [ ] 1. 协议层:扩 BridgeMethod 联合与运行时白名单
  - [ ] 1.1 在 `electron/scripts/bridge-types.ts` 的 `BridgeMethod` 联合中追加
        `'profiles.launch'` 与 `'profiles.close'` 两个字符串字面量
    - 字段顺序与 design §5.3 对齐:`'profiles.list' | 'profiles.get' |
      'profiles.launch' | 'profiles.close' | 'runScript'`
    - 注释里复述"新增 method 必须两边同步"(此句 phase 6 已存在,可直接挪用)
    - _Requirements: 3.1_
  - [ ] 1.2 在 `electron/scripts/bridge.ts` 的 `BRIDGE_METHODS` Set 同步追加这两条
        字符串字面量
    - 顺序与 BridgeMethod 联合一致
    - _Requirements: 3.1, 3.6_
  - [ ]* 1.3 单元测试:`isBridgeMethod('profiles.launch')` /
        `isBridgeMethod('profiles.close')` 都返回 true,且 `BridgeErrorCode` 联合
        与现有一致(无新增)
    - _Requirements: 3.1, 3.6_

- [ ] 2. 主进程:抽出 `terminateProfileBrowser` 单条关闭函数
  - [ ] 2.1 在 `electron/main.ts` 新增 `terminateProfileBrowser(profileId: string):
        Promise<void>` 函数
    - 实装见 design §4.2(完整代码片段)
    - 中文注释"为什么":SIGTERM/SIGKILL 时序对齐 `terminateAllProfileBrowsers`
      既有常数;同步 throw 视为已退出处理(requirements §2.8);幂等
      `profileProcesses.delete`
    - _Requirements: 2.7, 2.8_
  - [ ] 2.2 把 `terminateAllProfileBrowsers` 改写为遍历 `profileProcesses.keys()`
        快照后并行调用 `terminateProfileBrowser`
    - 实装见 design §4.1
    - 注释里说明"为什么先快照再遍历":避免循环中底层 delete 修改 Map 引发迭代
      器异常
    - _Requirements: 4.4_
  - [ ]* 2.3 写属性测试 - terminateProfileBrowser 状态机收敛
    - **Property 4: terminateProfileBrowser 状态机收敛**
    - **Validates: Requirements 2.7, 2.8**
    - 用 fake ChildProcess(EventEmitter 子类 + 桩 `kill` 记录信号 + 可控时机 emit
      'exit')+ `vi.useFakeTimers()` 控制 2500ms/200ms 窗口;生成"立即 exit /
      graceful 期内 / 超时后 / 永不 exit / kill 同步 throw"五种时序,验证每种都
      在 ≤ 2700ms 内 resolve、profileProcesses 表项被 delete、且 resolve 不 reject
    - _Requirements: 2.7, 2.8_
  - [ ]* 2.4 写属性测试 - terminateAllProfileBrowsers 重构等价
    - **Property 5: terminateAllProfileBrowsers 重构等价性**
    - **Validates: Requirements 4.4**
    - 生成 0..10 条 fake ChildProcess(混合 killed / 未 killed 状态)塞进
      profileProcesses,调用 terminateAllProfileBrowsers,验证 resolve 后表为空、
      每个非 killed child 都至少收过一次 SIGTERM、resolve 不 reject
    - _Requirements: 4.4_

- [ ] 3. 主进程:扩 ScriptBridge 构造参数 + 加路由分支
  - [ ] 3.1 修改 `electron/scripts/bridge.ts` 的 `ScriptBridge` 构造函数,新增两个
        必填参数 `launchProfileForScript: (profile: BrowserProfile) => Promise<void>`
        与 `closeProfileBrowser: (profileId: string) => Promise<void>`
    - 参数声明顺序紧跟既有 `ensureProfileRunningForScript` 之后
    - 中文注释"为什么不复用 ensureProfileRunningForScript":见 design §5.2 ——
      契约不同(launch 不需要 wsUrl);独立 callback 让 main.ts 那侧能演进
    - _Requirements: 1.1, 2.1_
  - [ ] 3.2 在 `handleRequest` 的 switch 中新增 `case 'profiles.launch'` 分支
    - 实装见 design §5.4 launch 分支:payload.id 字符串校验 → ProfileStore 命中检
      查 → await launchProfileForScript → 写 `ok=true, value=null` RESPONSE
    - payload 校验失败抛字符串错误,由外层 try/catch 翻译成 INTERNAL_ERROR(沿用
      phase 6 既有兜底机制)
    - 注释里点出"复用 launchProfile 的已启动 no-op 分支,不在 bridge 层判
      profileProcesses"
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_
  - [ ] 3.3 在 `handleRequest` 的 switch 中新增 `case 'profiles.close'` 分支
    - 实装见 design §5.4 close 分支:payload.id 字符串校验 → ProfileStore 命中
      检查 → `runtime.getActiveByProfile(id)` 命中则手动构造 PROFILE_BUSY
      RESPONSE(带 occupiedBy={runId, scriptId})→ 否则 await closeProfileBrowser
      → 写 `ok=true, value=null` RESPONSE
    - 中文注释"两步顺序固定":先 active 后 close,反过来会出现"已发完 SIGTERM
      才发现有 active run"的不可恢复路径(design §5.4)
    - 中文注释"PROFILE_BUSY 手动构造而非 throw ProfileBusyError":要透传
      `runtime.getActiveByProfile()` 返回的 ScriptRun 子集,而非 ProfileBusyError
      实例(design §5.5)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_
  - [ ]* 3.4 写属性测试 - launch 决策表与幂等性
    - **Property 1: launch 决策表与幂等性**
    - **Validates: Requirements 1.4, 1.5**
    - 用 fake BridgeClient(发 IPC 消息到 ScriptBridge handleRequest)+ fake
      ProfileStore + jest.fn() 桩 launchProfileForScript;生成"profile 不存在 /
      存在 + 调用次数 N(1..10)";验证 PROFILE_NOT_FOUND 路径每次都 reject、
      存在路径所有 N 次都 ok=true value=null,且 launchProfileForScript 在每次
      profile 存在的调用时都被调用(由其内部 profileProcesses 命中检查兜底实现
      no-op 复用,这条用桩 + 单独的 ensureProfileRunningForScript spy 在 task 4
      集成测试再校验"实际只 spawn 一次")
    - _Requirements: 1.4, 1.5_
  - [ ]* 3.5 写属性测试 - launch 错误透传
    - **Property 2: launch 错误透传到 INTERNAL_ERROR**
    - **Validates: Requirements 1.6**
    - 桩 launchProfileForScript 抛各种 Error 实例(含 `new Error('foo')` /
      `new RangeError('bar')` / 自定义 class / 字符串 throw),验证 BridgeResponse
      的 error.code 永远是 'INTERNAL_ERROR' 且 error.message 与原 throw 的
      message(或 String(e))一致
    - _Requirements: 1.6_
  - [ ]* 3.6 写属性测试 - close 决策表
    - **Property 3: close 决策表**
    - **Validates: Requirements 2.4, 2.5, 2.6, 2.7**
    - 生成"ProfileStore 命中状态 × runtime.active 状态 × profileProcesses 状
      态"组合,共 ~12 个等价类;验证每种组合下 BridgeResponse 与
      profileProcesses 变化都对齐 design §13 P3 决策表;额外断言 PROFILE_BUSY
      路径下 closeProfileBrowser 桩**未被调用**(profileProcesses 不变的强保证)
    - _Requirements: 2.4, 2.5, 2.6, 2.7_

- [ ] 4. 主进程:在 `app.whenReady` wiring 处把新构造参数传给 ScriptBridge
  - [ ] 4.1 修改 `electron/main.ts` 的 `new ScriptBridge(...)` 调用,加上两个新构造
        参数
    - `launchProfileForScript`: `(profile) => ensureProfileRunningForScript(profile).then(() => undefined)`
      —— 复用既有函数,丢弃 wsUrl 返回值;`.then(() => undefined)` 让类型契约
      严格匹配 `Promise<void>`(design §5.2 末尾)
    - `closeProfileBrowser`: 直接 `terminateProfileBrowser`(task 2 抽出的函数)
    - 旁注:这两个 callback 不能写成箭头函数闭包内联到 ScriptBridge 构造内 ——
      闭包捕获的 `this` 在 main.ts 模块顶层无意义,且影响测试 mock 替换的能力
    - _Requirements: 1.1, 1.4, 2.1, 2.6_
  - [ ] 4.2 Checkpoint - 主进程链路集成校验
    - 在 IDE 内确认编译无 TS 错误(`pnpm run build` 全绿是后面 task 7 的事,这里
      只看 main.ts / bridge.ts 文件级 diagnostics)
    - 确认 `terminateAllProfileBrowsers` 内的 `Array.from(profileProcesses.keys())`
      快照与原循环行为一致(脑内推演:5 个 profile 同时关,每个并行 SIGTERM,
      不互相阻塞)
    - 确保所有测试通过, ask the user if questions arise.
    - _Requirements: 4.1, 4.4, 4.5_

- [ ] 5. SDK 表面:扩 ProfilesApi 接口与两端实装
  - [ ] 5.1 在 `electron/scripts/sdk/types.ts` 的 `ProfilesApi` 接口加方法签名
    - 字段顺序:`list / get / launch / close / create / delete / setQueue`(design §6.1)
    - 中文 JSDoc:launch 写"仅启动浏览器,等 CDP 就绪后 resolve;已启动则 no-op
      复用";close 写"显式关闭,等进程真退出后 resolve;有活跃 ScriptRun 时
      reject PROFILE_BUSY;没在跑则 no-op resolve"
    - _Requirements: 3.4_
  - [ ] 5.2 在 `electron/scripts/sdk/index.ts` 的 `makeGlobalScopeProfilesApi` 加
        launch / close 实装
    - 实装见 design §6.2:
      `launch: (id) => wrapBridgeRejection(bridge.call<null>('profiles.launch', { id })).then(() => undefined)`
      `close: (id) => wrapBridgeRejection(bridge.call<null>('profiles.close', { id })).then(() => undefined)`
    - 中文注释"为什么 .then(() => undefined)":严格匹配 Promise<void> 类型签名,
      避免用户拿到 null
    - _Requirements: 1.1, 1.7, 1.8, 2.1, 2.9, 2.10, 3.2_
  - [ ] 5.3 在 `electron/scripts/sdk/index.ts` 的 `makeProfileScopeProfilesApi` 加
        launch / close 占位
    - 实装见 design §6.3:
      `launch: () => Promise.reject(globalNotAvailable())`
      `close: () => Promise.reject(globalNotAvailable())`
    - _Requirements: 3.3_
  - [ ]* 5.4 单元测试 - profile-scope 立即 reject GLOBAL_NOT_AVAILABLE
    - 例子测试:在 ScriptContext.scope='profile' 下调用 api.profiles.launch /
      api.profiles.close,断言 reject 的 error.code === 'GLOBAL_NOT_AVAILABLE'
    - _Requirements: 3.3_
  - [ ]* 5.5 单元测试 - 全局 SDK 方法形态契约
    - 例子测试:fake BridgeClient,调用 api.profiles.launch('p1');断言
      BridgeClient.call 收到的 method === 'profiles.launch' 且 payload === {id: 'p1'};
      close 同理;且都返回 Promise<void>(resolve 值是 undefined,不是 null)
    - _Requirements: 1.1, 1.7, 2.1, 2.9_

- [ ] 6. Monaco d.ts:补 ProfilesApi 类型签名
  - [ ] 6.1 在 `src/lib/script-typings.ts` 的 AUTO_REGISTRY_BLOCK 内,`ProfilesApi`
        接口加 `launch(id: string): Promise<void>` 与 `close(id: string): Promise<void>`
    - 字段顺序与 SDK types.ts 严格一致(design §7)
    - 中文 JSDoc 与 SDK types.ts 那版**字面对齐**(双向 grep 时眼扫即可)
    - _Requirements: 3.5_
  - [ ]* 6.2 单元测试 - Monaco extraLib 包含新签名
    - 例子测试:`SCRIPT_EDITOR_TYPINGS[0].contents` 字符串 include
      `'launch(id: string): Promise<void>'` 与 `'close(id: string): Promise<void>'`
    - _Requirements: 3.5_

- [ ] 7. 最终 Checkpoint - 全链路构建与质量门槛
  - [ ] 7.1 运行 `pnpm run build` 验证 TypeScript 编译全绿
    - 不要在这里跑 dev server / watch;只跑一次性 build
    - 任何编译错误必须修复
    - _Requirements: 5.1_
  - [ ] 7.2 校验未引入新依赖
    - 检查 `package.json` 的 `dependencies` / `devDependencies` 与上一阶段一致
    - 检查 pnpm-lock.yaml diff 不包含新增 package 条目
    - _Requirements: 5.2_
  - [ ] 7.3 Checkpoint - 端到端语义复盘
    - 脑内推演 design §9 的三条时序图:launch 成功 / close PROFILE_BUSY 早返回 /
      close 真关闭;每条时序图对应代码路径都已实装
    - 确保所有测试通过, ask the user if questions arise.
    - _Requirements: 1.1, 1.4, 1.5, 2.4, 2.6_

## Notes

- 以 `*` 标记的子任务(测试任务)是可选的,可为快速 MVP 跳过;但 task 7.1 的 build
  验证不可跳过。
- 每条任务都引用了具体的 requirements 子条目(X.Y),便于实施时反查交付边界。
- Property 1 / 2 / 3 / 4 / 5 五个属性测试分别钉死 launch 决策表 / launch 错误透传
  / close 决策表 / terminateProfileBrowser 状态机 / terminateAllProfileBrowsers
  重构等价五条核心不变量。
- 主进程胶水函数(launchProfileForScript / closeProfileBrowser)继续作为
  ScriptBridge 的构造参数注入,沿用 phase 6 已确立的"bridge 不感知 main.ts 模块
  级闭包"范式。
- 所有新增/修改代码注释必须用中文写"为什么",对齐仓库既有风格。
