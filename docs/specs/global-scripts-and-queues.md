# 全局脚本 + 环境队列 · Spec

> Status: Draft · Owner: 李晨 · 最后更新: 2026-05-27
>
> 本文是"全局脚本 + 环境绑定脚本队列 + main(args) 协议 + profile.id 显示"四块改动的工程真源。
> 改代码前先读;改完更新 §10 验收清单。

## 1. 目标

把脚本子系统从"用户手动选 profile + 点 Run"扩展成:

1. **profile 拥有公开 id**——UI 可见 + 可复制;创建时可由外部(全局脚本 / 后续上线接口)显式指定,全局唯一
2. **每个 profile 可绑定两条脚本队列**:
   - `onCreateQueue` —— profile 创建后立刻串行运行一次(典型:首次登录、上传 cookie)
   - `onLaunchQueue` —— 每次启动浏览器后串行运行(典型:刷新 token、关弹窗)
3. **新增"全局脚本"作为脚本的另一个 scope**——不绑 profile,能调度别的脚本、批量配置 profile 队列、注册新 profile
4. **`main(args)` 协议**——脚本入口可接收 `{ params, profile, run, triggeredBy, parentRunId? }`,父调度方(全局脚本 / 队列 / 手动)可传入参数

## 2. 不做 / 已知限制

- 队列**不**支持条件分支(`if a then b else c`):用户想要这个,自己写一个全局脚本调 `runScript`
- 队列**不**支持并发:同一 profile 任何时刻仍最多 1 个活跃 ScriptRun(PROFILE_BUSY 不动)
- 队列**不**支持跨 profile 编排:那是全局脚本的职责
- profile.id **不**允许改:创建后写死,改 id 等同删了重建
- 全局脚本**不**能 attach 任何浏览器:它是纯调度器,需要驱动浏览器请用 `runScript` 调子脚本

## 3. 数据模型变更

### 3.1 `BrowserProfile`(`electron/types.ts`)

```ts
export type BrowserProfile = {
  // ...既有字段不动
  /** 创建后串行运行一次的脚本 id 序列。空数组 = 不跑队列。 */
  onCreateQueue: string[]
  /** 每次启动浏览器后串行运行的脚本 id 序列。空数组 = 不跑队列。 */
  onLaunchQueue: string[]
}
```

### 3.2 `ProfileDraft`(`electron/types.ts`)

```ts
export type ProfileDraft = {
  /** 外部指定的 id;不传 = 主进程生成 env_<ts>_<rand>。 */
  id?: string
  // ...既有字段
  onCreateQueue?: string[]
  onLaunchQueue?: string[]
}
```

`store.ts::upsert` 行为:

- 新建时:`draft.id` 存在 → 校验全局唯一(查 `this.profiles.find(p => p.id === draft.id)`)→ 命中抛 `PROFILE_ID_TAKEN`,否则采用;不存在 → 走现有生成逻辑
- 编辑时:`draft.id` 必须等于 `existing.id`(忽略否则不一致),不允许改

### 3.3 `Script`(`electron/types.ts`)

```ts
export type ScriptScope = 'profile' | 'global'

export type Script = {
  // ...既有字段
  scope: ScriptScope  // 默认 'profile'(老脚本加载时若缺字段补 'profile')
}
```

### 3.4 `ScriptRun`(`electron/types.ts`)

```ts
export type ScriptTriggeredBy = 'manual' | 'global-script' | 'on-create' | 'on-launch'

export type ScriptRun = {
  // ...既有字段
  triggeredBy: ScriptTriggeredBy
  /** 父 run id —— 由全局脚本通过 runScript 触发时,指向触发它的全局 run。 */
  parentRunId?: string
  /** 调度方传入的参数(profile-scope 脚本 main args.params)。仅作历史回放用,不影响重跑。 */
  params?: Record<string, unknown>
  /**
   * 全局脚本 run 的 profileId 留空字符串;TS 仍标 string 是因为 store / runtime 内部
   * 大量代码假设非空。读取时:scope=='global' → 不要展示 profile 信息。
   */
}
```

迁移:`store.ts::load` 给老 `ScriptRun` 补 `triggeredBy: 'manual'`(legacy 数据视为手动触发)。

### 3.5 持久化兼容

- `profiles.json` 老数据没有 `onCreateQueue` / `onLaunchQueue` → load 时补 `[]`(同 `enabledPluginIds` 处理)
- `scripts.json` / `script-meta.json` 老数据没有 `scope` → load 时补 `'profile'`
- `script-runs.json` 老 run 没有 `triggeredBy` → load 时补 `'manual'`

无破坏性。

## 4. main(args) 协议

### 4.1 入参形状

```ts
// SDK 暴露的类型,用户可 `import type { ScriptMainArgs } from 'auto-registry'`
export interface ScriptMainArgs<P = Record<string, unknown>> {
  /** 调度方传入的参数;手动 run 时为空对象 */
  params: P
  /** 当前 profile 只读快照(scope='global' 时该字段为 null) */
  profile: Readonly<BrowserProfile> | null
  /** 当前 ScriptRun 元数据 */
  run: { id: string; startedAt: string }
  /** 触发源,脚本可据此分支 */
  triggeredBy: ScriptTriggeredBy
  /** 父 run id;由全局脚本 runScript 触发时存在 */
  parentRunId?: string
}
```

### 4.2 用法

```ts
// profile-scope 脚本
import { page, log, type ScriptMainArgs } from 'auto-registry'

interface MyParams { keyword: string }

export default async function main(args: ScriptMainArgs<MyParams>) {
  const p = await page()
  log(`profile=${args.profile?.name} keyword=${args.params.keyword} via=${args.triggeredBy}`)
  await p.goto(`https://example.com/?q=${args.params.keyword}`)
}
```

```ts
// 老脚本不读 args 完全兼容
export default async function main() {
  // ...
}
```

### 4.3 bootstrap 投递实现

- 主进程在 fork 子进程时,把整个 args 序列化进 `process.env.AUTO_REGISTRY_SCRIPT_ARGS`(JSON)
- bootstrap.ts 读 env → JSON.parse → 拿到默认 export → `await fn(args)`
- 用 env 而不是 argv,因为 argv 已经被 fork 占用了 entry path 等位;env 也不会被父进程的 argv quote 规则破坏

## 5. 全局脚本 SDK

### 5.1 表面

```ts
// scope='global' 脚本能 import 的:
import {
  log, warn, error,    // 同 profile-scope
  sleep,
  stopSignal,
  kv,                   // 全局 kv 落 <scriptsRoot>/<scriptId>/state.json
  profiles,             // 新增,见下
  runScript,            // 新增,见下
  type ScriptMainArgs
} from 'auto-registry'

// **没有** browser / page —— 全局脚本不绑 profile
```

### 5.2 `profiles` API

```ts
profiles.list(): Promise<Readonly<BrowserProfile>[]>
profiles.get(id: string): Promise<Readonly<BrowserProfile> | null>

/**
 * 创建 profile。draft.id 可指定;冲突抛 ProfileIdTakenError。
 * 不传 id 则主进程生成。
 */
profiles.create(draft: ProfileDraft): Promise<BrowserProfile>

profiles.delete(id: string): Promise<void>

/**
 * 改 profile 的某条队列。kind='on-create' / 'on-launch'。
 * scriptIds 全部需要是 scope='profile' 的脚本;否则抛 InvalidQueueError。
 */
profiles.setQueue(
  profileId: string,
  kind: 'on-create' | 'on-launch',
  scriptIds: string[]
): Promise<void>
```

### 5.3 `runScript` API

```ts
/**
 * 触发某个 profile-scope 脚本运行,await 至结束。
 * - 同步走 PROFILE_BUSY 互斥(profile 已被占用 → throw ProfileBusyError)
 * - 子 run 的 parentRunId 自动设成当前全局 run id
 * - 返回完整 ScriptRun 终态(succeeded/failed/stopped + exitCode + error)
 */
runScript(
  scriptId: string,
  profileId: string,
  params?: Record<string, unknown>
): Promise<ScriptRun>
```

行为:

- 全局脚本调 `runScript` 等价于"在 ActiveRunsButton 抽屉里出现一行 run,然后等它结束"
- 触发的子 run 的 `triggeredBy='global-script'`,`parentRunId=父 globalRun.id`
- 子 run 失败/停止时,`runScript` resolve 那个 ScriptRun 对象(不 throw),全局脚本自己决定继续还是 throw
- **stopSignal 联动**:用户停全局 run → bootstrap abort → 全局脚本 await `runScript` 处 throw,且**主进程同时 stop 子 run**

### 5.4 SDK 类型补全

`src/lib/script-typings.ts` 加 declare:

- 给 `'auto-registry'` 模块加 `profiles` / `runScript` / `ScriptMainArgs` 导出
- 区分 scope 的类型:Monaco 不能根据当前编辑哪个脚本切换补全,所以**两个 scope 的 SDK 表面合并 declare**——profile-scope 用户看到 `profiles` / `runScript` 也补全得出来,但运行时调会抛 "not available in profile scope"。这是可接受的折衷,zero config 的代价。

## 6. 队列触发机制

### 6.1 onCreate 触发

`store.upsert(draft)` 创建分支返回新 profile 后,**main.ts** 立刻:

1. 启动浏览器(走 `launchProfile` + 等 CDP 就绪)
2. 串行跑 `profile.onCreateQueue` 里的每个 scriptId(等价于 `runScript(sid, profile.id, {})`)
3. 任一条 `failed` 状态 → 队列停,后续不跑;profile 标记 `setupFailedAt`(新字段,可选)
4. 队列结束(成功 / 失败 / 用户停)→ 浏览器**保持运行**(用户大概率要进去看看)
5. 把整个 setup 过程包成一个返回 promise → renderer 端"保存"按钮显示进度,完成后弹完成/失败 toast

ProfileFormDialog 在 onCreateQueue 非空时,Submit 按钮文案变"保存并初始化",表明会有阻塞过程。

### 6.2 onLaunch 触发

`launchProfile()` 末尾,`waitForDevToolsEndpoint` resolve 后,**异步**触发:

```ts
void runOnLaunchQueue(profile)  // fire and forget
```

不阻塞 launch 调用本身返回。每条脚本走 PROFILE_BUSY 互斥(同 manual run);任一 `failed` 后续不跑(同 onCreate)。

**手动 run 与 onLaunch 队列的协调**:启动后用户立刻点 Run 手动脚本,会撞上 onLaunch 队列里的第一条 → PROFILE_BUSY 错误,文案告诉用户"on-launch 队列 X/N 在跑,请稍后或先停队列"。这是**符合预期**的行为,不消除冲突。

### 6.3 失败语义

- 队列里某条以 `failed` 结束(throw 出 main 边界)→ 队列停,后续 pending
- 用户在脚本里 try/catch → 该条以 `succeeded` 结束 → 队列继续
- 用户主动 stop 某条 → 该条 `stopped` → 队列**停**(stopped 也算"非完成",后续不跑)
- 全局脚本 / "按队列运行"按钮 触发的队列 run,失败时主进程发 toast:
  > 环境 `<name>` 的 `onCreate / onLaunch` 队列在 `<scriptName>` 处中止。[查看错误]

### 6.4 PROFILE_BUSY 兼容

队列触发的 run 复用现有 `scriptRuntime.start({ script, profile, webSocketDebuggerUrl })`,完全走 `getActiveByProfile` 互斥。不需要新概念。

## 7. UI 变更

### 7.1 环境表新增 ID 列(第一列)

位置:checkbox 之后,环境名之前。

```
[checkbox] [ID chip] [环境名+notes] [代理] [指纹] [创建] [状态] [操作]
```

ID chip:`font-mono text-[10px]`,长度按 css `truncate`,hover 显示完整 id;点击复制到剪贴板,500ms 内显示"已复制" tooltip。

### 7.2 环境编辑对话框新增"自动化"区段

布局:折叠 section,默认展开。两组独立 sortable 列表:

```
自动化 ▼
├ 创建后运行(on-create)               [+ 添加脚本]
│   1. ⠿ <脚本名>                                [×]
│   2. ⠿ <脚本名>                                [×]
│
└ 每次启动后运行(on-launch)            [+ 添加脚本]
    1. ⠿ <脚本名>                                [×]
```

- `+ 添加脚本`:弹出 listbox,只列 `scope='profile'` 脚本(全局脚本不出现)
- `⠿` 拖拽 handle:用 native HTML5 DnD;同一组内可排序
- `×`:从队列移除

### 7.3 环境表新增"队列"列

显示该 profile 当前队列的实时状态。空队列 + 没在跑 → 不显示该列内容(占位但留白)。有内容时:

```
on-launch: 1/3 ✓  →  2/3 ⟳  →  3/3 ⏸
                       ^ tooltip: 当前跑到这里,N 秒,点查看脚本
```

数据来源:把 `activeRuns`(已有的 store)按 profileId 索引 + 把 profile 的 queue 字段拼起来。

### 7.4 环境表"操作"列追加

启动按钮加 dropdown:

```
[启动]  [...]
        ├─ 启动并跑 onLaunch 队列(默认)
        ├─ 仅启动浏览器(跳过队列)
        └─ 仅跑 onLaunch 队列(浏览器已开)
```

`仅启动` 用于调试 — 用户不希望队列干扰手动验证。

### 7.5 Scripts 列表 + 创建对话框

- 列表项末尾加 `[GLOBAL]` 徽章(scope='global' 时)
- 创建对话框加 scope 单选:Profile / Global,默认 Profile
- scope='global' 的脚本运行面板**不显示** profile 选择,只一个 Run 按钮

### 7.6 全局脚本 run 在 ActiveRunsButton 抽屉里的展示

```
[GLOBAL]  脚本名 · X 秒                 [Open script] [Stop]
```

不显示 profile 名(全局脚本没 profile)。

## 8. 阶段实施

每阶段独立 commit,跑 `pnpm run build` 必绿。

### 阶段 1 — profile.id 公开 + 创建可指定

- [ ] `BrowserProfile` 类型不动(id 已有)
- [ ] `ProfileDraft.id?: string` 加上
- [ ] `store.upsert` 校验冲突 → 抛 `ProfileIdTakenError`(`code='PROFILE_ID_TAKEN'`)
- [ ] main.ts `profiles:save` IPC 透传 `{ ok:false, code:'PROFILE_ID_TAKEN' }`
- [ ] 渲染端 `ProfileFormDialog` 友好错误提示
- [ ] 环境表加 ID 列 + 复制交互
- [ ] i18n 文案

### 阶段 2 — Script.scope + 全局脚本骨架

- [ ] `Script.scope` 类型加 + 持久化兼容
- [ ] `ScriptDraft.scope` 加
- [ ] 创建脚本对话框加 scope 单选
- [ ] 列表 GLOBAL 徽章
- [ ] bootstrap.ts 区分 scope:`'profile'` 走原有 SDK;`'global'` 注入新 SDK 工厂(只导出 log/sleep/stopSignal/kv,占位 profiles/runScript = throw "not implemented yet")
- [ ] 全局脚本运行面板:无 profile 选择,只 Run 按钮 + Stop

### 阶段 3 — main(args) 协议

- [ ] 主进程 `runtime.start` 接受 `params: Record<string, unknown>`,投递 `AUTO_REGISTRY_SCRIPT_ARGS` env
- [ ] bootstrap 读 env,await 默认 export 时 `await fn(args)`;args 形状见 §4.1
- [ ] SDK 导出 `ScriptMainArgs` 类型,`script-typings.ts` 加 declare
- [ ] 老 `function main()` 不读参兼容性测试

### 阶段 4 — onCreateQueue / onLaunchQueue 数据 + UI 编辑

- [ ] `BrowserProfile` 加两个字段 + `ProfileDraft` 加 + load 兼容
- [ ] ProfileFormDialog 加"自动化"区段(只编辑,不实际触发)
- [ ] 环境表加"队列"列(渲染队列结构,但还没真的触发运行)

### 阶段 5 — 队列触发(onCreate / onLaunch 真的跑)

- [ ] main.ts 新增 `runQueue(profile, kind)` 编排函数
- [ ] `store.upsert` 创建分支 → 返回 profile + 异步触发 onCreate(返回前等队列完成)
- [ ] `launchProfile` 末尾触发 onLaunch(异步)
- [ ] 失败 toast
- [ ] 启动按钮 dropdown(仅启动 / 启动并跑队列 / 仅跑队列)

### 阶段 6 — 全局脚本 SDK 实装

- [ ] sdk/profiles.ts 实现 list/get/create/delete/setQueue
- [ ] sdk/runScript.ts 实现:`runScript(scriptId, profileId, params)` 走 IPC 让主进程 fork 子进程,await 它结束
- [ ] stopSignal 联动:全局 run 被 stop → 同时 stop 当前等待的子 run
- [ ] 全局脚本面板可显示子 run 的活跃状态(子 run 也走 ActiveRunsButton 抽屉)

## 9. 错误码统一

新增:

- `PROFILE_ID_TAKEN` —— 创建 profile 时 id 冲突
- `INVALID_QUEUE` —— `setQueue` 传了不存在 / 非 profile-scope 的脚本
- `GLOBAL_NOT_AVAILABLE` —— profile-scope 脚本里调 `profiles.*` / `runScript`(运行时 throw)

既有不变:

- `PROFILE_BUSY` —— 占用规则
- `KERNEL_MISSING` —— 内核未装

## 10. 验收清单

阶段 1 完成时跑前 4 项;每阶段在累积清单上加。

### 阶段 1
- [ ] 环境表第一列(checkbox 之后)显示 ID chip,`font-mono text-[10px]`
- [ ] 点击 ID chip → 剪贴板含完整 id,toast / inline tooltip 反馈"已复制"
- [ ] 全局脚本 / 外部 IPC 调 `profiles.save({ id: 'env_custom_01', ... })` → 创建成功,id 写盘
- [ ] 同样 id 再次 create → 报 `PROFILE_ID_TAKEN`,renderer toast 友好提示

### 阶段 2
- [ ] 创建脚本对话框 scope 默认 Profile;切到 Global 后保存,列表显示 [GLOBAL]
- [ ] 全局脚本面板无 profile 选择,只 Run / Stop
- [ ] 全局脚本 run 出现在 Header ActiveRunsButton 抽屉
- [ ] profile-scope 脚本里调 `profiles.list()` → 抛 `GLOBAL_NOT_AVAILABLE`

### 阶段 3
- [ ] profile 脚本写 `export default async function main(args) { log(args.profile?.name, args.params, args.triggeredBy) }`,手动 run → 日志含 profile 名 / `{}` / `'manual'`
- [ ] 老脚本 `function main()` 不读参 → 仍 succeeded
- [ ] Monaco 输入 `args.` → 补全 `params / profile / run / triggeredBy / parentRunId`

### 阶段 4
- [ ] 环境编辑对话框"自动化"区段,可加/移/拖拽 onCreate / onLaunch 队列项
- [ ] 队列列表只列 scope='profile' 脚本
- [ ] 保存后重启应用,队列还在
- [ ] 环境表"队列"列在有队列时显示 `1/N`,无队列时空白

### 阶段 5
- [ ] 新建带 onCreate 队列 1 条的 profile → "保存"按钮变"保存并初始化",阻塞至队列结束;成功 toast
- [ ] onCreate 队列里第 2 条故意 throw,第 3 条不跑;失败 toast 含脚本名
- [ ] onLaunch 队列:profile 启动后 1-2s 出现队列 run,Header 抽屉可见
- [ ] 启动按钮 dropdown:仅启动 → 队列不跑

### 阶段 6
- [ ] 写一个全局脚本:`for (const p of await profiles.list()) await runScript(sid, p.id, { keyword: 'foo' })` → 子 run 依次跑,Header 抽屉同时显示父 + 子
- [ ] 子脚本 args.params.keyword === 'foo';args.parentRunId === 父 run id;args.triggeredBy === 'global-script'
- [ ] 全局 run 被 stop → 当前等待的子 run 同时被 stop
- [ ] `profiles.setQueue('env_xxx', 'on-launch', ['no_such_id'])` → 抛 `INVALID_QUEUE`

## 11. 不变的约束

- PROFILE_BUSY 互斥规则不动
- janitor 启动自检不动
- 反检测三轨不动
- 老脚本不读 args 完全兼容
- 现有 ScriptRun 持久化文件可正常 load(新增字段补默认)

---

**变更控制**:任何与本 spec 冲突的实现要先在这里 PR / 修订;不要"先写代码再回头改 spec"。
