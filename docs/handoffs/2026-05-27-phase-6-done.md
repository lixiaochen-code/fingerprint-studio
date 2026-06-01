# 换机归档 · 2026-05-27 (晚) — spec phase 3+6 已完成,launch/close 待开始

> 这份是给下一轮对话用的接手包,**覆盖**前一份 `handoff-2026-05-27-global-scripts.md`
> (那份只反映到 phase 2,本份是 phase 3+6 完成、launch/close 未开始的最新视图)。
> 新对话第一件事:读完本文 + Kiro spec 三件套 + AGENT.md + CODING_STANDARDS.md,
> 然后等用户发指令。**不要主动改代码**。

## 1. 当下状态一览

- **当前分支**: `feat/global-scripts-phase-6`(领先 main 3 个 commit,**未合并**)
- **HEAD**: `dc1bc7c feat(scripts/ui): copyable script id column + persistent dashed underline`
- **main**: `8fc5ca8 docs(handoff): 2026-05-27 archive after spec phase 1+2`(只到 phase 2)
- **远端 = 本地**: 已 push(分支 `origin/feat/global-scripts-phase-6` 同步)
- **构建**: 最近一次完成时全绿
- **本轮焦点**: 完成 spec phase 3 + phase 6 的代码实装,落档 Kiro spec 三件套,
  规划好下一步 launch/close 子 spec(尚未开始编码)

## 2. 真源文件:Kiro spec 取代了之前的单体 markdown

之前在 `docs/specs/global-scripts-and-queues.md` 写的 6 阶段路线 **已经分裂**到
`.kiro/specs/` 下的 Kiro spec 工作流里,改用 requirements.md / design.md / tasks.md
三件套结构。**这是真源**。继续推进时改这里,不再去碰 `docs/specs/global-scripts-and-queues.md`(那份停留在历史快照视图)。

| Kiro spec | 状态 | 含义 |
|---|---|---|
| `.kiro/specs/global-scripts-and-queues/tasks.md` | ✅ phase 3 全 7 条勾完 | main(args) 协议接通,代码已落 |
| `.kiro/specs/global-scripts-phase-6-runtime/` | ✅ task 1-10, 20 勾完;11-19 是 `*` 可选 property 测试,**未跑** | 全局脚本 runtime 实装(profiles.list/get + runScript + 父子 run 联动) |
| `.kiro/specs/global-scripts-profile-launch-close/` | ⬜ **未开始** | 新需求:`profiles.launch(id)` / `profiles.close(id)` —— 仅启动/显式关闭浏览器,不跑脚本 |

这三份 spec **改任何相关代码前必读**;每一份内部都明确写了 In/Out 范围、不变量、
Property 验证剧本与文件改动清单,新 agent 照着干即可。

## 3. 这一轮做完了什么

### Phase 3 + Phase 6 一起完成(commit `3fb8c6c`)

题目大跳了一阶 —— 用户合并了 phase 3(main(args) 投递)与 phase 6(全局脚本 SDK
真实装)一起做,因为 phase 3 只动 bootstrap + Monaco,phase 6 才会真用到 args,
两者拆开提交会造成中间态空 commit。

具体改动(详见 commit + Kiro spec design.md):

**主进程**:
- `electron/scripts/bridge-types.ts`(新):`BridgeMethod` 联合 + `BridgeRequest` /
  `BridgeResponse` / `BridgeError` 信封 + `BridgeErrorCode` 联合(7 个码:
  `PROFILE_NOT_FOUND` / `SCRIPT_NOT_FOUND` / `INVALID_SCOPE` / `PROFILE_BUSY` /
  `SCRIPT_STOPPED` / `GLOBAL_NOT_IMPL_YET` / `INTERNAL_ERROR`)
- `electron/scripts/bridge.ts`(新,~850 行):`ScriptBridge` 类
  - `attach(child, ownerRunId)` / `forks: Map<runId, {child, pendingChildren}>`
  - `handleRequest`:协议层校验 + switch by method,把 sync/async 异常翻译成
    BridgeError 写一条 RESPONSE
  - `executeRunScript`:`scriptStore.get` → 校验 scope → `profileStore.get` →
    `ensureProfileRunningForScript` → `runtime.start(triggeredBy='global-script', parentRunId)`
    → `pendingChildren.add` → `await waitForChildTerminal` → 写 RESPONSE
  - `waitForChildTerminal`:**永不 reject**,返回 `{kind:'terminal', run}` 或
    `{kind:'parent-stopped'}`(让上层算法只走单一汇合路径)
  - 父 run 消失订阅:`runtime.on('event', 'active-changed')` → 比对新旧活跃集合
    → 对消失的 ownerRunId 触发 `parentStoppedListeners` 回调
  - `shutdown()`:app `before-quit` 时被 main.ts 调,reject 所有 pending
- `electron/scripts/runtime.ts`:加 `setBridge(bridge)` setter(避免循环依赖) +
  fork 后立即 `this.bridge?.attach(child, run.id)`
- `electron/main.ts`:wiring `new ScriptBridge(...)` + `runtime.setBridge(bridge)` +
  `app.on('before-quit')` 追加 `bridge.shutdown()`
- `electron/scripts/store.ts`:加 `findRunById(runId)`(`waitForChildTerminal` 用)
- `electron/scripts/bootstrap.ts`:
  - 读 `AUTO_REGISTRY_SCRIPT_ARGS` env(JSON),组装 `ScriptMainArgs`
  - 用户 default export 的 `main(args)` 调用时把 args 传进去
  - 创建 `BridgeClient` 注入 ScriptContext.bridge,让 SDK 全局分支能用
  - `process.on('disconnect')` 时 `bridge.dispose('parent disconnected')`

**SDK**:
- `electron/scripts/sdk/bridge-client.ts`(新,~200 行):`createBridgeClient()`
  - `call<T>(method, payload)`:单调 counter id + pending Map + `process.send`
    返回 false 时立即 reject
  - `process.on('message')`:只识别 `kind==='response' && typeof id==='number'`,
    其余静默 + warn
  - `dispose(reason)`:reject 全部 pending,置 disposed
- `electron/scripts/sdk/types.ts`:`ScriptContext` 加 `bridge: BridgeClient | null`
- `electron/scripts/sdk/index.ts`:
  - `makeGlobalScopeProfilesApi(bridge)`:`list/get` 走 `bridge.call`;
    `create/delete/setQueue` 仍 `notImplementedYet('phase 6.x')`
  - 全局 scope 的 `runScript`:走 `bridge.call('runScript', ...)`
  - SDK 把 BridgeError reject 包成 `ScopeMismatchError(code, message)` 透传给用户
- `src/lib/script-typings.ts`:Monaco d.ts 加 `ScriptMainArgs<P>` /
  `ScriptTriggeredBy` / `ProfilesApi` 类型,补全可见

**UI(本轮捎带的小改进,commit `dc1bc7c`)**:
- `src/views/scripts/components/script-id-cell/index.tsx`(新):脚本列表里也加了
  可复制的 script id(与 profile id cell 同款,但用 `border-dashed` 持续下划线
  暗示可点)
- `src/views/profiles/components/profile-id-cell/index.tsx`:对齐改 dashed 风格
- `src/views/scripts/components/script-list/index.tsx`:列表项加 ScriptIdCell

### Kiro spec 三件套(commit `c2eae83`)

把规划好的下一步以 Kiro spec 形式落档,不是 markdown 散文:

- `.kiro/specs/global-scripts-phase-6-runtime/`:本轮代码所对应的 spec(已完成
  task 1-10, 20)
- `.kiro/specs/global-scripts-profile-launch-close/`:**下一步要做的事** —— 给全局
  脚本加 `profiles.launch(id)` 与 `profiles.close(id)`,基于 phase 6 通道扩两条
  BridgeMethod 即可

## 4. 接下来要做什么(profile-launch-close 子 spec)

直接看 [`.kiro/specs/global-scripts-profile-launch-close/tasks.md`](../../.kiro/specs/global-scripts-profile-launch-close/tasks.md)。
4 个 wave,7 个 top task:

| Wave | Task | 说明 |
|---|---|---|
| W1 | 1. 协议层扩 `BridgeMethod` 联合 + `BRIDGE_METHODS` 白名单 Set | 加 `'profiles.launch'` / `'profiles.close'` |
| W1 | 2. main.ts 抽出 `terminateProfileBrowser(id)` | 把 `terminateAllProfileBrowsers` 内部状态机抽成单条函数,可复用 |
| W2 | 3. ScriptBridge 加 launch/close 路由分支 | 构造函数加两个回调参数;handleRequest switch 加两 case |
| W2 | 5. SDK ProfilesApi 加 launch/close 方法 | 全局 scope 走 bridge.call;profile-scope reject GLOBAL_NOT_AVAILABLE |
| W2 | 6. Monaco d.ts 加方法签名 | 补全可见 |
| W3 | 4. main.ts wiring 把新参数传给 ScriptBridge | 一行代码改动 |
| W4 | 7. `pnpm run build` 全绿 + 不引入新依赖 | 质量门槛 |

每条任务都有可选(`*`)的 property 测试或单元测试,可选不强制。

**核心决策**(已在 spec 里固化,不要改):

- **launch 不复用 runScript**:语义错位,会污染 ScriptRun 持久化
- **不暴露 `closeAll`**:粒度错配,用户要的是"关我刚 launch 出来的那一个"
- **PROFILE_BUSY 时 close 早返回**(不动浏览器):反过来会有"已 SIGTERM 才发现有 active run"的不可恢复路径
- **没在跑时 close 是 no-op**(resolve,而非报错):与 launch 的"已启动则 no-op"对称
- **错误码不扩展**:复用 phase 6 的 7 个码即可
- **`terminateProfileBrowser` 抽函数留在 main.ts**:沿用 phase 6 范式 — bridge 不感知 main.ts 模块级闭包,主进程胶水以函数引用注入

## 5. 关键事实(用户拍板过的,沿用)

| 项 | 决策 | 来源 |
|---|---|---|
| profile.id | 全局唯一,创建时可外部指定;不允许改 | phase 1 |
| Script.scope | 'profile' / 'global',不允许改 | phase 2 |
| 全局脚本 SDK | profiles.list/get + runScript 已实装;create/delete/setQueue 仍占位 throw `GLOBAL_NOT_IMPL_YET`(message 含 `phase 6.x`) | phase 6 |
| **launch/close 是新加的**(本份 handoff) | 仅启动/显式关闭浏览器,不跑脚本;close 时 PROFILE_BUSY 早返回不动浏览器 | profile-launch-close spec |
| main(args) 形状 | `{ params, profile, run, triggeredBy, parentRunId? }` | phase 3 |
| triggeredBy 取值 | `'manual' \| 'global-script' \| 'on-create' \| 'on-launch'` | phase 1 |
| PROFILE_BUSY 互斥 | 不动,所有 ScriptRun 触发(包括 runScript)都参与互斥 | phase 1 |
| BridgeError 错误码 | 7 个 + 不扩 | phase 6 |
| args 投递通道 | env `AUTO_REGISTRY_SCRIPT_ARGS`(JSON);与 SCRIPT_CONTEXT 并列两个 env | phase 3 |
| fork↔main IPC | `process.send` + `process.on('message')` plain JSON;单调 counter id;严格 `===` 校验 | phase 6 design §6 |

## 6. 现状文件位置

| 关注点 | 文件 |
|---|---|
| **本轮 Kiro spec** | `.kiro/specs/global-scripts-and-queues/tasks.md`(phase 3) / `.kiro/specs/global-scripts-phase-6-runtime/`(phase 6) / `.kiro/specs/global-scripts-profile-launch-close/`(下一步 launch/close) |
| 旧版散文 spec | `docs/specs/global-scripts-and-queues.md`(历史快照,**不再是真源**) |
| Bridge 协议类型 | `electron/scripts/bridge-types.ts` |
| Bridge 主进程实装 | `electron/scripts/bridge.ts` |
| Bridge fork 客户端 | `electron/scripts/sdk/bridge-client.ts` |
| SDK 工厂 | `electron/scripts/sdk/index.ts`(`makeGlobalScopeProfilesApi` / `makeProfileScopeProfilesApi` / `makeGlobalRunScript`) |
| SDK 类型 | `electron/scripts/sdk/types.ts`(`ScriptApi` / `ScriptMainArgs` / `ProfilesApi` / `RunScriptResult`) |
| bootstrap | `electron/scripts/bootstrap.ts`(scope 分支 + args env + bridge 注入) |
| ScriptRuntimeManager | `electron/scripts/runtime.ts`(setBridge + attach) |
| main.ts wiring | `electron/main.ts`(`new ScriptBridge` + `runtime.setBridge` + `before-quit shutdown`) |
| script id 列 | `src/views/scripts/components/script-id-cell/index.tsx` |
| profile id 列 | `src/views/profiles/components/profile-id-cell/index.tsx` |
| Monaco d.ts | `src/lib/script-typings.ts`(`ScriptMainArgs` / `ScriptTriggeredBy` / `ProfilesApi`) |
| 上一份 handoff | `docs/specs/handoff-2026-05-27-global-scripts.md`(只到 phase 2,**已被本份覆盖**) |

## 7. 用户在另一台机器上手做的事

```bash
git clone <repo>     # 或者 git pull 已有 clone
git checkout feat/global-scripts-phase-6
pnpm install         # 没新增依赖,这步是兜底
pnpm run build       # 必绿
pnpm run dev         # 跑起来
```

phase 3 + 6 验证清单(走 Kiro spec phase 6 design §11 的集成测试剧本):

1. **profile.id 显示**(回归):环境表第一列 ID 显示纯 mono 文本,hover 出 dashed 下划线,点击 toast "ID 已复制"
2. **script.id 显示**(本轮新加):脚本列表里每一项也有 script id chip,同款交互
3. **profile-scope 现有路径**(回归):创建一个 profile-scope 脚本写
   `function main(args) { log(args.profile?.name, args.params, args.triggeredBy) }`,
   手动 Run → 日志含 profile 名 / `{}` / `'manual'`
4. **Monaco 类型补全**:Monaco 输入 `args.` → 补全 `params / profile / run / triggeredBy / parentRunId`
5. **全局脚本 profiles.list / get**:写一个全局脚本 `const all = await profiles.list(); log(all.length, all.map(p => p.name))` → 日志命中实际 profile 数与名字
6. **runScript 子 run**:再写
   ```ts
   for (const p of await profiles.list()) {
     try {
       const result = await runScript('child_script_id', p.id, { keyword: 'demo' })
       log(p.name, '→', result.run.status)
     } catch (e) { log('skip', p.name, e.code) }
   }
   ```
   → 子 run 依次出现在 ActiveRunsButton 抽屉;子脚本里 `log(args.parentRunId, args.triggeredBy)` → 命中预期值
7. **SCRIPT_NOT_FOUND**:把 `runScript('nope', ...)` → 父 fork log 含 `SCRIPT_NOT_FOUND`
8. **停止传播**:全局脚本 await runScript 中,手动 stop 父 run → 当前正在跑的子 run 立刻 stopped + 父 fork log 含 `SCRIPT_STOPPED`(用户的 try/catch 拿到 e.code)
9. **PROFILE_BUSY**:让某个 profile 上手动跑一个长脚本占用,从全局脚本里 runScript 这个 profile → e.code === 'PROFILE_BUSY' 且 e.occupiedBy 命中
10. **占位写接口**:全局脚本调 `profiles.create(...)` 或 `profiles.delete(...)` 或 `profiles.setQueue(...)` → catch 拿到 `e.code === 'GLOBAL_NOT_IMPL_YET'` 且 message 含 `phase 6.x`

哪条不对,贴回来,先修再下一步。

## 8. 工作约定(沿用)

- 中文回复
- 代码注释中英可混,"为什么"优先中文
- 每次代码改动后 `pnpm run build` 必绿
- 同思路连失败两次 → 停下来根因分析
- **Kiro spec 是真源**,改动前先看对应 design.md 的"In/Out 范围"和不变量
- 任何与 spec 冲突的实现 → 先在 spec 里 PR/修订,再写代码;不要"先写代码再回头改 spec"
- 所有 src/ 新增组件按 kebab-case 目录化(`<name>/index.tsx`),shadcn ui 例外
- 推送代理:`all_proxy=http://127.0.0.1:7890 git push origin <branch>`

## 9. 给下一轮 AI agent 的硬规则

读到这里时的首要任务:

1. **不要回顾聊天历史**。以本文件 + Kiro spec 三件套 + AGENT.md 为准
2. **不要主动重构已落地代码**(尤其是 ScriptBridge / BridgeClient,它们是 phase 6 的核心,有大量决策注释支撑)
3. **当前分支不是 main**:在 `feat/global-scripts-phase-6` 分支推进。要不要合并 main 是产品决策,等用户拍板
4. **默认行为**:用户说"继续"时 → 进 `.kiro/specs/global-scripts-profile-launch-close/tasks.md` 的 task 1(协议层扩 BridgeMethod);用户说"验证"时 → 引导跑 §7 清单
5. 开工前确认 `pnpm run build` 本机能跑通
6. 任何改动后 `pnpm run build` 必绿
7. **不要悄悄改 Kiro spec**:发现 spec 与现实脱节先回报用户,得到确认再改 spec
8. **不要去 `docs/specs/global-scripts-and-queues.md` 改东西**(那是历史快照);改 Kiro spec
9. 反检测体系不动(`docs/specs/anti-detection.md`)

## 10. 一次性命令

```bash
# 类型检查
npx tsc -p tsconfig.json --noEmit
npx tsc -p tsconfig.electron.json --noEmit

# 全量构建
pnpm run build

# 跑应用
pnpm run dev

# 推送(用户的代理)
all_proxy=http://127.0.0.1:7890 git push origin feat/global-scripts-phase-6

# 看哪些文件偏长
find src electron -name '*.ts' -o -name '*.tsx' | xargs wc -l 2>/dev/null | sort -rn | head -20
```
