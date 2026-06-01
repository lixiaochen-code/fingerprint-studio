# 测试清单 · 2026-05-29 — feat/global-scripts-phase-6 验收

> 这份清单与 [`handoff-2026-05-29-write-apis-and-fire-and-forget.md`](./handoff-2026-05-29-write-apis-and-fire-and-forget.md) 配套使用。
> 用户在新机器拉好分支、`pnpm install` + `pnpm run build` 全绿后,跟 AI agent
> 一起逐条走;每条命中预期就勾,不命中贴回报。
>
> 模式:**先 dev 模式 (`pnpm run dev`) 全量走一遍,再 dist 模式 (`pnpm dist:mac`)
> 抽样跑关键项**。dist 模式专门验 esbuild asar 路径(P 组),其余项 dev 即可。
>
> **前置条件**:本机有 ≥ 2 个 profile;有一个 profile-scope 脚本(下面记作
> `script_child`,需要做的事仅是 `log('hi from child', args.profile?.name)`)。

## A 组 — 回归基线(以前的功能不能破)

| # | 步骤 | 期望 |
|---|---|---|
| A1 | 打开应用 → Profiles 列表第一列 ID | 纯 mono 文本,hover 出 dashed 下划线;点击 toast "ID 已复制" |
| A2 | Scripts 列表 → script id chip | 同 A1 交互(本轮新加,与 profile id chip 同款) |
| A3 | 在 profile-scope 脚本里写 `function main(args) { log(args.profile?.name, args.params, args.triggeredBy) }`,手动 Run | 日志命中 profile 名 / `{}` / `'manual'` |
| A4 | Monaco 编辑器输入 `args.` | 补全列表含 `params / profile / run / triggeredBy / parentRunId` |
| A5 | UI 删除任意一个 profile (在 Profiles 列表点删除) | 浏览器若在跑会被先关,user-data 目录被清,无报错;**不**走 PROFILE_BUSY 检查 |
| A6 | Header 上的 MODE info 图标 hover | 仍正确弹 tooltip(回归 f8176fc 改动后未破其它处) |

## B 组 — Profile 表单视觉(commit f8176fc)

| # | 步骤 | 期望 |
|---|---|---|
| B1 | 打开 Profile 表单 (新建或编辑) → Target OS 字段标签 | 标签右侧有小号 amber `AlertTriangle` (h-3 w-3),不是大段红字 |
| B2 | 鼠标悬停 AlertTriangle | Tooltip 出现:含 "locked to host OS / Cloudflare client hints / WebGL/Canvas differentiation" 内容 |
| B3 | Target OS 字段本身 | 仍只读,值显示 host OS(macOS / win32 / linux 之一) |

## C 组 — 全局脚本基础 SDK(回归 phase 6)

> 准备:新建一个 global-scope 脚本(scope 选 "global"),记作 `script_g_basic`。

| # | 步骤 (写在 script_g_basic main()) | 期望 |
|---|---|---|
| C1 | `const all = await profiles.list(); log(all.length, all.map(p => p.name).join(','))` | 命中实际 profile 数与名字串 |
| C2 | `const p = await profiles.get(<某个真实 id>); log(p.name)` | 命中名字 |
| C3 | `const x = await profiles.get('not_exist_id').catch(e => e); log(x.code)` | 命中 `'PROFILE_NOT_FOUND'` |
| C4 | profile-scope 脚本里写 `await profiles.list()` 强行调一次,Run | catch 应拿到 `e.code === 'GLOBAL_NOT_AVAILABLE'` |

## D 组 — runScript 子调度(回归 phase 6)

| # | 步骤 | 期望 |
|---|---|---|
| D1 | 全局脚本里 `for (const p of (await profiles.list()).slice(0,2)) { const r = await runScript('script_child', p.id); log(p.name, r.run.status) }` | 子 run 依次出现在 ActiveRunsButton 抽屉;每个 status 都是 `'succeeded'` |
| D2 | 子脚本里加 `log(args.parentRunId, args.triggeredBy)`,跑 D1 | 子 run 日志命中 `parentRunId` 是父 run id,`triggeredBy === 'global-script'` |
| D3 | `await runScript('nope_id', <some_pid>).catch(e => log(e.code))` | 命中 `'SCRIPT_NOT_FOUND'` |
| D4 | 让 profile P 上手动跑一个长脚本占用,从全局脚本 `runScript('script_child', P).catch(e => log(e.code, e.occupiedBy?.runId))` | 命中 `'PROFILE_BUSY'` 且 occupiedBy 命中正在跑的那个 run id |
| D5 | 全局脚本 `await runScript(...)` 中,从 ActiveRunsButton 抽屉手动停止父 run | 当前正跑的子 run 立刻 stopped;父 fork 日志含 `'SCRIPT_STOPPED'` |

## E 组 — profiles.launch / close(commit eecc7d6,回归)

| # | 步骤 | 期望 |
|---|---|---|
| E1 | 全局脚本里 `await profiles.launch(<id>); log('launched')` | 浏览器进程起来;日志命中 `'launched'` |
| E2 | 已 launch 的 profile 上,再次调 `profiles.launch(<id>)` | resolve(no-op),不重复开浏览器 |
| E3 | `await profiles.close(<id>); log('closed')` | 浏览器关掉,日志命中 |
| E4 | 浏览器没在跑时调 `profiles.close(<id>)` | resolve no-op,不报错 |
| E5 | profile 上有活跃 ScriptRun 时调 `profiles.close(<id>).catch(e => log(e.code))` | 命中 `'PROFILE_BUSY'`,**且浏览器没被关**(此条很关键,避免撕坏正跑脚本) |

## F 组 — profiles.create(commit 7cdb84c)

| # | 步骤 | 期望 |
|---|---|---|
| F1 | `const p = await profiles.create({ name: '测试' + Date.now() }); log(p.id, p.name)` | 命中新生成 id 与传入的 name;Profiles 列表立即出现这条 |
| F2 | 跟 F1 同名再调一次 | 不冲突(name 不要求唯一,只 id 要求唯一) |
| F3 | `profiles.create({ id: 'fixed_id_1', name: 'foo' })` 第一次 | 命中 `p.id === 'fixed_id_1'` |
| F4 | F3 之后再调相同 `id: 'fixed_id_1'` `.catch(e => log(e.code))` | 命中 `'PROFILE_ID_TAKEN'` |
| F5 | `profiles.create({ id: 'has spaces!', name: 'x' }).catch(e => log(e.code))` | 命中 `'INVALID_PROFILE_ID'` |
| F6 | 用户先前已端到端验证 5 次循环 → 已通过 | (回归只跑 F1) |

## G 组 — profiles.delete(commit f035ec6 — **本轮重点**)

| # | 步骤 | 期望 |
|---|---|---|
| G1 | `const p = await profiles.create({ name: 'tmp' }); await profiles.delete(p.id); log('ok')` | 命中 'ok';Profiles 列表里那条消失 |
| G2 | 已删除的 id 再次 `profiles.delete(...).catch(e => log(e.code))` | 命中 `'PROFILE_NOT_FOUND'`(**故意不幂等**) |
| G3 | `profiles.delete('totally_not_exist_id').catch(e => log(e.code))` | 命中 `'PROFILE_NOT_FOUND'` |
| G4 | 在某 profile 上手动跑一个长脚本占用,全局脚本里 `profiles.delete(<that_pid>).catch(e => log(e.code, e.occupiedBy?.runId))` | 命中 `'PROFILE_BUSY'`,带 occupiedBy;**且 profile 仍然存在**(浏览器与盘没动) |
| G5 | 已 launch (浏览器在跑)但**没**活跃 ScriptRun 的 profile,调 `profiles.delete(<id>)` | 浏览器先被关 → store 删 → user-data 目录消失;返回 resolve;**关键**:目录磁盘上要真的没了 |
| G6 | 用户的 2 次循环用例(create + runScript + close + delete)端到端跑通 | 命中 0,1 日志;两个 profile 用完即焚 |
| G7 | UI 路径删除一个**正在跑脚本**的 profile(回归 A5 的反面) | UI 直接删,不报 PROFILE_BUSY(用户说"自己负责");**新决策(2026-05-29 G7 实测后定)**:删除时**顺手**走 SIGTERM 把跑在该 profile 上的 ScriptRun stop(status 标 `'stopped'`),run 日志最后一行能看到 `[runtime] profile <id> deleted, run terminated`;父 run(若该 run 是 global-script 的子调度)**不**被级联;**这条注意会顺手 stop 正跑脚本,只在没有重要数据的 profile 上跑** |

## H 组 — fire-and-forget 守护(commit bdd3fd9 — **本轮新增**)

> **设计语义**:全局脚本 main() 自然返回时,父 fork 等所有 fire-and-forget 的
> bridge 调用(主要是 runScript)完成后再退出。

| # | 步骤 (写在全局脚本) | 期望 |
|---|---|---|
| H1 | ```js<br>export default async function main() {<br>  const ps = (await profiles.list()).slice(0, 2)<br>  for (const p of ps) runScript('script_child', p.id) // 注意没 await<br>  log('main returned')<br>}``` | 父 run 状态在 ActiveRunsButton 抽屉中先看到 2 个子 run + 1 个父 run;父 run **不**立刻变 `'succeeded'`,而是等 2 个子 run 都终态后,父 run 才变 `'succeeded'` |
| H2 | H1 的子 run 日志 | 都正常出现(子脚本 log 命中) |
| H3 | H1 中途手动 stop 父 run | 父 fork SIGTERM → user-await 被 abort,但本例 main 已返回;**预期**:子 run 仍跑完(因为父 fork 被杀时主进程级联了子 run 的 SIGTERM,但子 run 自己是独立 fork 不挂在父 fork 进程树上)。**这条行为可能与解读不一致,实测后回报**。 |
| H4 | H1 配合 `await sleep(500); throw new Error('boom')` 在第 2 个 runScript 之后,Run | 父 run 走 catch 路径(failed)而非等 whenIdle;子 run 仍可能跑完(取决于父 fork SIGTERM 传播),实测后记录 |
| H5 | 没有 fire-and-forget 的全局脚本(全部 await) | 行为不变,whenIdle 立即 resolve,父 run 正常 `'succeeded'` |

> ⚠️ H 组的 (c) 解读用户尚未明确确认。若 H1 的"父等子"语义不是用户想要的,请以
> 用户当下意见为准重新设计。

## I 组 — 错误码 + GLOBAL_NOT_IMPL_YET(回归)

| # | 步骤 | 期望 |
|---|---|---|
| I1 | 全局脚本 `await profiles.setQueue(...)` 强行调一次 `.catch(e => log(e.code, e.message))` | 命中 `'GLOBAL_NOT_IMPL_YET'` 且 message 含 `phase 6.x` |
| I2 | (反例)create / delete 不应再走 GLOBAL_NOT_IMPL_YET | F1 / G1 已覆盖;此处只确认 catch 不命中该码 |
| I3 | profile-scope 脚本中调 `profiles.create(...)`(应被禁) | catch 命中 `'GLOBAL_NOT_AVAILABLE'`(注意是另一个码) |

## J 组 — 父子 run 联动 + 资源清理(回归 phase 6)

| # | 步骤 | 期望 |
|---|---|---|
| J1 | 关闭整个 Auto Registry app(系统菜单 Quit) | 所有 profile 浏览器进程 + 所有 ScriptRun fork 干净退;`ps aux \| grep Chromium` 看不到残留 |
| J2 | 跑全局脚本后看 `Library/Application Support/auto-registry/registry-data/scripts/<sid>/.compiled` | 临时 cjs 文件被父进程清理(allow up to ~30s 延迟);不应越积越多 |

## P 组 — Packaging(`pnpm dist:mac` 后)

> 这组验 `fecab29` + `d2a297a`:打包后的 app 跑全局脚本(因为要触发 esbuild
> 转译用户 ts)。

| # | 步骤 | 期望 |
|---|---|---|
| P1 | `pnpm dist:mac`,从 `release/mac-arm64/Auto Registry.app` 启动 | 启动正常 |
| P2 | 在打包后的 app 里跑任意全局脚本(走 esbuild 编译) | **不**报 `The package "@esbuild/darwin-arm64" could not be found`;**不**报 `spawn ENOTDIR` |
| P3 | F1 / G1 / D1 各跑一次 | 与 dev 模式表现一致 |

## 附:回报模板

每条都按这个模板贴回:

```
A1 ✅ 命中
A5 ❌ 实际:user-data 目录还在;复现步骤:删了 profile P → 看 ~/Library/.../P/ 还在
H3 ⚠️ 实际:子 run 立刻被 SIGKILL,与"父等子"解读不一致(可能是预期,等用户拍板)
```

不命中的优先级排序:**G > F > E > D > H > C > A > B > I > J > P**(写接口 +
launch/close 是核心闭环,G/F/E 任何一条不过都要先停下来修)。
