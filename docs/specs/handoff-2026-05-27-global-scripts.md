# 换机归档 · 2026-05-27 (全局脚本 + 队列工程,phase 1+2 完成)

> 这份是给下一轮对话用的接手包。新对话第一件事:读完本文 +
> [`global-scripts-and-queues.md`](./global-scripts-and-queues.md)(spec)+
> `AGENT.md` + `docs/CODING_STANDARDS.md`,然后等用户发指令。**不要主动改代码。**

## 1. 当下状态一览

- **分支**: `main`
- **HEAD**: `19ac07b feat(scripts): add Script.scope (profile/global) skeleton (spec phase 2)`
- **远端 = 本地**: 已 push,工作区干净
- **构建**: `pnpm run build` 全绿(28-30s,Monaco 大 chunk 正常)
- **本轮焦点**: 在已规划的"全局脚本 + 环境队列"6 阶段路线里,完成了 phase 1 + phase 2

## 2. 真源文件:spec

[`docs/specs/global-scripts-and-queues.md`](./global-scripts-and-queues.md) 是这一轮所有改动的**工程真源**(439 行),记录:

- 全部用户拍板的决策(profile.id 全局唯一可外部指定 + 不允许改;Script.scope 二选一;profile 上挂两条队列 onCreate/onLaunch;main(args) 协议;失败行为=任一 failed/stopped 停队列,用户用 try/catch 表达"可以挂";setQueue(profileId, kind, scriptIds) 单签名)
- 6 阶段拆分 + 每阶段验收清单
- IPC / 持久化 / UI 变更的具体形状

**改任何相关代码前必读**。

## 3. 这一轮做完了什么

### Phase 1 — profile.id 公开 + 创建可指定(commits `5d155b2` + `4c3b088`)

- `BrowserProfile.id` 已经存在,这一阶段只是**暴露**:环境表加 ID 列(checkbox 之后、环境名之前)
- ID 单元: hover 出下划线,点击 sonner toast "ID 已复制到剪贴板" / "复制 ID 失败"。极简,不带 chip / 不带图标
- `electron/store.ts`:
  - 新增 `ProfileIdTakenError` (code='PROFILE_ID_TAKEN')
  - 新增 `InvalidProfileIdError` (code='INVALID_PROFILE_ID')
  - `isValidProfileId`:`/^[A-Za-z0-9._-]{1,64}$/`,够语义化又不会让磁盘路径炸
  - `upsert` 看到 `draft.id` 但没命中 existing 时 → **采用** draft.id 新建(老逻辑 bug:静默忽略)
  - 新增 `create(draft)` 方法:显式新建,id 冲突时抛 `ProfileIdTakenError`(不静默切到编辑分支);phase 6 全局脚本 `profiles.create` 会用它
- IPC `profiles:save` 形状改成 `{ ok:true, profile } | { ok:false, error: { code, ... } }`
- 渲染层 `App.submitProfile` 处理新形状,把结构化错误转本地化文案再 throw,ProfileFormDialog 接到后展示在表单底部

### Phase 2 — Script.scope 骨架(commit `19ac07b`)

- `Script.scope: 'profile' | 'global'`(老 script-meta.json 缺字段时 load 补 'profile')
- `ScriptDraft.scope?` 可选,默认 'profile'
- `ScriptRun` 加 `triggeredBy` (默认 'manual')、`parentRunId?`、`params?` —— phase 3/6 才真正流通,phase 2 先把字段位置固化
- 创建脚本对话框顶部加 scope 二选一(Profile / Global,卡片样式)
- 列表项前加 amber `GLOBAL` 徽章
- ScriptRunPanel 按 scope 分支:
  - profile-scope:不变,复用现有 ProfileSelector 多选并发
  - global-scope:**不展示** ProfileSelector,只有一行说明 + 一个 Run 按钮;Run 调 `scripts.run(scriptId, '')`,主进程按 scope 跳过 `ensureProfileRunningForScript`
- bootstrap.ts 区分 scope:profile-scope 必校验 profile + webSocketDebuggerUrl,global 跳过
- SDK (`electron/scripts/sdk/`) 重写:
  - 类型层 ScriptApi **统一暴露** profiles + runScript(让 Monaco 不需要按当前编辑哪个脚本切换补全)
  - 运行时按 scope 分支:错误 scope 调用立刻抛 `BROWSER_NOT_AVAILABLE` / `GLOBAL_NOT_AVAILABLE` 而不是 undefined / 静默 fail
  - 全局脚本里 `profiles.list / get / create / delete / setQueue` 和 `runScript` 都还是 **占位** —— 抛 `GLOBAL_NOT_IMPL_YET`,phase 6 才接 IPC
- profile-scope 默认模板加 `args` 形参:
  ```ts
  export default async function main(args) { ... }
  ```
- 新增 global-scope 默认模板:
  ```ts
  import { profiles, runScript, log, sleep } from 'auto-registry'
  export default async function main(args) {
    const all = await profiles.list()
    log('found', all.length, 'profiles')
    // ...
  }
  ```

## 4. 接下来要做的(spec phase 3..6)

按顺序,每阶段独立 commit + push,跑 `pnpm run build` 必绿:

### Phase 3 — main(args) 协议接通

让 `main(args)` 真的拿到 `{ params, profile, run, triggeredBy, parentRunId? }`:

- runtime.start 接受 `params: Record<string, unknown>`,投递 `AUTO_REGISTRY_SCRIPT_ARGS` env(JSON)
- bootstrap.ts 读 env、组装 args、`await fn(args)` 时传进去
- SDK 导出 `ScriptMainArgs<P>` 类型(已在 `sdk/types.ts` 定义,只需在 `index.ts` re-export)
- `src/lib/script-typings.ts` 加 declare,Monaco 看到 `args.` 后能补全 `params / profile / run / triggeredBy / parentRunId`
- 老 `function main()` 不读参数仍兼容(JS 多余参数无副作用)

验收:profile-scope 脚本写 `function main(args) { log(args.profile?.name, args.triggeredBy) }` 手动 run → 日志看到 profile 名 + `'manual'`。

### Phase 4 — onCreateQueue / onLaunchQueue 数据 + 编辑 UI

- `BrowserProfile` 加 `onCreateQueue: string[]` + `onLaunchQueue: string[]`
- `ProfileDraft` 同步加;ProfileStore.load 兼容(空数组)
- ProfileFormDialog 加"自动化"区段:两组独立 sortable 列表(可拖、可移除),可选脚本只列 `scope='profile'` 的
- 环境表加"队列"列(显示 `1/3 ✓ → 2/3 ⟳ → 3/3 ⏸` 状态)
- 启动按钮 dropdown:启动并跑 onLaunch 队列 / 仅启动浏览器 / 仅跑 onLaunch 队列

### Phase 5 — 队列实际跑起来

- main.ts 新增 `runQueue(profile, kind)`
- profile 创建后阻塞至 onCreate 队列结束才返回(ProfileFormDialog 显示进度)
- launchProfile 末尾异步触发 onLaunch
- 失败 toast,对应 ScriptRun 可点查看
- **关键失败规则**:任一条 `failed` / `stopped` → 队列停;用户写 `try/catch` 才能让一条挂了不阻塞队列(spec §6.3)

### Phase 6 — 全局脚本 SDK 真正实装

- sdk 内新增 `profiles.ts` + `runScript.ts`
- 通过 IPC 让全局脚本调主进程的 ProfileStore + ScriptRuntimeManager
- runScript 行为:
  - 子 run `triggeredBy='global-script'`、`parentRunId=父 globalRun.id`
  - 等子 run 终态再 resolve(失败/停止不 throw,返回终态对象)
  - 父全局 run 被 stop → 当前等待中的子 run 同时被停
- profiles.list/get 直接读 ProfileStore;create 走 store.create(冲突抛 `PROFILE_ID_TAKEN`);delete 走现有 remove;setQueue 改 ProfileStore 的 onCreateQueue/onLaunchQueue 字段

## 5. 关键事实(用户拍板过的,不再讨论)

### 决策表

| 项 | 决策 |
|---|---|
| profile.id | 全局唯一,创建时可外部指定;**不允许改** |
| ID 显示 | 表格第一列(checkbox 之后),hover 下划线,点击 toast |
| Script.scope | `'profile'` (默认 / 老脚本) / `'global'` (新);scope 不允许改 |
| 全局脚本 SDK | profiles.list/get/create/delete + setQueue + runScript + log/sleep/kv/stopSignal;**没有** browser/page |
| 错误 scope 调 SDK | 立刻 throw `BROWSER_NOT_AVAILABLE` / `GLOBAL_NOT_AVAILABLE`,不静默 |
| profile 上挂两条队列 | `onCreateQueue: string[]` + `onLaunchQueue: string[]` |
| onCreate 触发 | profile 创建后阻塞跑;失败=队列停,profile 标 setupFailed |
| onLaunch 触发 | launchProfile() 末尾异步跑,不阻塞 launch 返回 |
| 队列里能选 | 仅 `scope='profile'` 脚本(全局脚本不能进队列) |
| 队列失败行为 | **任一条 failed/stopped → 后续不跑**;用户写 try/catch 表达"可以挂",纯 JS 语义零额外配置 |
| main(args) 形状 | `{ params, profile, run: {id,startedAt}, triggeredBy, parentRunId? }` |
| triggeredBy 取值 | `'manual' \| 'global-script' \| 'on-create' \| 'on-launch'` |
| setQueue API 形状 | `setQueue(profileId, kind, scriptIds)`(单签名带 kind 参数,演化成本最小) |
| PROFILE_BUSY 互斥 | 不动,队列 run 也参与互斥 |
| args 投递 | env `AUTO_REGISTRY_SCRIPT_ARGS`(JSON),bootstrap 读 + 传给 main |

### 不做的事

- 队列**不**支持条件分支:用户想要 → 自己写全局脚本调 runScript
- 队列**不**支持并发:同 profile 仍最多 1 活跃 run
- profile.id **不**允许改;改 id = 删了重建
- 全局脚本**不**能 attach 浏览器:它是纯调度器
- 不引第三方 keepalive / antd / MUI(规范已固化)

## 6. 现状文件位置(关键)

| 关注点 | 文件 |
|---|---|
| 本轮 spec | [`docs/specs/global-scripts-and-queues.md`](./global-scripts-and-queues.md) |
| profile 错误码 | `electron/store.ts` 文件顶部(ProfileIdTakenError / InvalidProfileIdError) |
| ID 表格列 | `src/views/profiles/components/profile-id-cell/index.tsx` |
| Script 数据模型 | `electron/types.ts`(Script / ScriptDraft / ScriptRun / ScriptScope / ScriptTriggeredBy) |
| ScriptStore.load 兼容 | `electron/scripts/store.ts` 末段 |
| SDK 类型 | `electron/scripts/sdk/types.ts`(ScriptApi / ScriptMainArgs / ProfilesApi / RunScriptResult) |
| SDK 工厂分支 | `electron/scripts/sdk/index.ts`(scope 决定每个 method 的运行时行为) |
| bootstrap scope 分支 | `electron/scripts/bootstrap.ts`(readBootstrapEnv / 构造 ScriptContext) |
| runtime.start | `electron/scripts/runtime.ts`(profile/wsUrl 可空 + 透传 triggeredBy/parentRunId/params) |
| scripts:run IPC 分支 | `electron/main.ts`(global-scope 跳过 ensureProfileRunningForScript) |
| 创建脚本 scope 单选 | `src/views/scripts/components/create-script-dialog/index.tsx` |
| 列表 GLOBAL 徽章 | `src/views/scripts/components/script-list/index.tsx` |
| 运行面板 scope 分支 | `src/views/scripts/components/script-run-panel/index.tsx`(runGlobal vs runSelected) |
| 上一份 handoff | `docs/specs/handoff-2026-05-26-router-refactor.md` |

## 7. 用户在另一台机器上手做的事

```bash
git pull origin main
pnpm install              # 没新增依赖,这步只是兜底
pnpm run build            # 必绿
pnpm run dev              # 跑起来
```

打开后 phase 1+2 验证清单(对应 spec §10):

### Phase 1 验证

- [ ] 环境表第一列(checkbox 之后)显示 ID,纯 mono 灰文本
- [ ] hover 出下划线;点击 → toast "ID 已复制到剪贴板"
- [ ] 粘贴板里是完整 id
- [ ] 现存环境编辑保存 → 仍正常
- [ ] (可选)在 devtools `await window.registry.profiles.save({ id: 'env_custom_01', name: 'test', ... })` → 用指定 id 创建成功;再调一次 → 返回 `{ ok:false, error:{ code:'PROFILE_ID_TAKEN' } }`

### Phase 2 验证

- [ ] Scripts 视图新建 → 对话框顶部出现"作用域 / Profile / Global"二选一卡片,默认 Profile
- [ ] 选 Global 创建一个 → 列表项前出现 amber `GLOBAL` 徽章
- [ ] 选中全局脚本 → 编辑器看到全局模板(用 `profiles, runScript, log, sleep`)
- [ ] 全局脚本运行面板:**没有** profile 选择,只有"全局脚本不绑环境..."提示行 + 一个 Run 按钮
- [ ] 点 Run → 全局脚本启动,日志会输出"Failed to start" 或 "GLOBAL_NOT_IMPL_YET" 因为 phase 2 里 `profiles.list()` 还是占位 throw —— **这是预期**,phase 6 才接通
- [ ] 选个 profile-scope 脚本 → 现有运行流程没回归

哪一项不对,贴回来,先修再下一步。

## 8. 工作约定(沿用)

- 中文回复
- 代码注释中英可混,"为什么"优先中文
- 每次代码改动后 `pnpm run build` 必绿
- 同思路连失败两次 → 停下来根因分析
- spec 是真源,任何与 spec 冲突的实现先在 spec 里 PR / 修订
- **所有 src/ 新增组件按 kebab-case 目录化**(`<name>/index.tsx`),shadcn ui 是唯一例外
- 新文件创建前先确认它的归属(view 子组件 / 通用组件 / hook / lib)
- 推送代理:`all_proxy=http://127.0.0.1:7890 git push origin main`

## 9. 给下一轮 AI agent 的硬规则

读到这里时的首要任务:

1. **不要**回顾聊天历史。以本文件 + spec + AGENT.md 为准
2. **不要**主动重构现有代码,除非用户明确要求
3. **默认行为**:用户说"继续"时 → 进 spec phase 3(main(args) 协议接通);说"验证"时 → 引导跑 §7 清单
4. 开工前确认 `pnpm run build` 本机能跑通
5. 任何改动后 `pnpm run build` 必绿(规范第 11 节)
6. **不要悄悄改 spec**:发现 spec 与现实脱节先回报用户,得到确认再改 spec
7. 反检测体系不动(看 `docs/specs/anti-detection.md`)

## 10. 一次性命令

```bash
# 类型检查
npx tsc -p tsconfig.electron.json --noEmit
npx tsc -p tsconfig.json --noEmit

# 全量构建
pnpm run build

# 跑应用
pnpm run dev

# 看哪些文件偏长(目录化后大部分应该 < 250 行)
find src -name 'index.tsx' -o -name 'index.ts' | xargs wc -l 2>/dev/null | sort -rn | head -20
```
