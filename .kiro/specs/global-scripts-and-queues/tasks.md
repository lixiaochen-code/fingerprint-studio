# Tasks · global-scripts-and-queues / Phase 3 — main(args) 协议接通

> 真源 spec: [`docs/specs/global-scripts-and-queues.md`](../../../docs/specs/global-scripts-and-queues.md) §4 + §8 phase 3
> 上一轮 handoff: [`docs/specs/handoff-2026-05-27-global-scripts.md`](../../../docs/specs/handoff-2026-05-27-global-scripts.md)
>
> 目标:让用户脚本的 `export default async function main(args)` 在运行时拿到
> `{ params, profile, run, triggeredBy, parentRunId? }`。phase 1+2 已经把字段位置和
> SDK 类型骨架就位 (ScriptRun.triggeredBy/parentRunId/params 字段、ScriptMainArgs 类型);
> 本阶段把"投递 → bootstrap 解析 → 调用 main(args) → Monaco 类型补全"这条链路打通。

## 范围 / 边界

- 仅 phase 3。**不**碰 phase 4 队列编辑 UI、phase 5 队列触发、phase 6 全局脚本 SDK 实装。
- IPC `scripts:run` 签名**不**变(沿用 `(scriptId, profileId)`),手动 run 的 params 默认 `{}`、
  triggeredBy 默认 `'manual'`、parentRunId 默认 undefined。phase 5/6 才会有非默认值的调用方。
- 老脚本 `export default async function main()` 不读参数仍兼容(JS 多余参数无副作用)。

## 完成口径(每条任务都满足)

- `pnpm run build` 全绿
- 改动注释中文写明"为什么"
- 不引入任何新依赖
- 不动 phase 4/5/6 的代码(队列字段、UI、全局脚本 IPC 实装均按兵不动)
- handoff 文档**不**在本阶段更新

## 任务

- [x] 1. 主进程:在 fork 子进程时投递 `AUTO_REGISTRY_SCRIPT_ARGS`

  改 `electron/scripts/runtime.ts::ScriptRuntimeManager.start`:把 `triggeredBy`、
  `parentRunId`、`params` 装进新的 args 包,通过 env `AUTO_REGISTRY_SCRIPT_ARGS`(JSON
  字符串)与现有 `AUTO_REGISTRY_SCRIPT_CONTEXT` 并列传给 `fork`。args 形状严格对齐 spec §4.1:
  `{ params, profile, run: {id, startedAt}, triggeredBy, parentRunId? }`。
  - profile-scope:`profile` 字段是 `BrowserProfile` 完整对象;global-scope:`profile=null`
  - `run.id` / `run.startedAt`:从 `this.store.createRun` 返回的 ScriptRun 取
  - `parentRunId`:仅当调用方传入时写入(避免显式 undefined 干扰序列化)
  - 默认值:`triggeredBy='manual'`、`params={}`,与 phase 2 既有签名兼容
  - 注释中文说明"为什么不复用 SCRIPT_CONTEXT 而新增一个 env":SCRIPT_CONTEXT 走 bootstrap 启动
    检查(profile/wsUrl 校验),args 是脚本入参语义,生命周期与解析器都不同,合并会破坏 phase 1/2
    已有的错误信息

- [x] 2. bootstrap:解析 args env 并传给用户的 main 函数

  改 `electron/scripts/bootstrap.ts`。新增 `readBootstrapArgs(): ScriptMainArgs`(模仿
  `readBootstrapEnv`):读 `AUTO_REGISTRY_SCRIPT_ARGS` + `JSON.parse`;缺失时降级成
  `{ params: {}, profile: env.profile, run: { id: '<unknown>', startedAt: <now> }, triggeredBy: 'manual' }`
  作为防御性兜底(phase 3 部署后 runtime 总会发,这里只是不让旧 fork 崩)。`main()` 里调用
  `defaultExport()` 改成 `defaultExport(args)`。`args.profile` 必须 `Object.freeze` 或与 SDK
  一样的只读语义,避免脚本作者误改快照影响后续逻辑。老 `function main()` 不读参兼容(JS 函数对额
  外实参直接忽略)。

- [x] 3. SDK 类型导出 `ScriptMainArgs`

  确保 `ScriptMainArgs` 被 `electron/scripts/sdk/index.ts` 的 `export type { ... }` 列表 re-export,
  且 `electron/scripts/sdk/types.ts` 已 `export interface ScriptMainArgs`(phase 2 已加,本子任务
  再确认一次)。不改运行时行为,只是公开类型,让用户 `import type { ScriptMainArgs } from 'auto-registry'`
  能用。

- [x] 4. Monaco 类型补全:在 d.ts 里声明 `ScriptMainArgs`

  改 `src/lib/script-typings.ts` 的 `AUTO_REGISTRY_BLOCK`:加 `ScriptMainArgs<P>` interface,
  字段精确对齐 spec §4.1。同时加 `ScriptTriggeredBy` 联合类型(`'manual' | 'global-script' |
  'on-create' | 'on-launch'`),避免在 interface 里直接写裸字符串字面量。`ScriptMainArgs.profile`
  用 `Readonly<Profile> | null`(`Profile` 接口已经在,不改它的字段)。验收:Monaco 输入 `args.`
  后能补全 `params / profile / run / triggeredBy / parentRunId`。

- [x] 5. 默认脚本模板:`function main(args)` 形参在 profile 模板里就位

  检查 `src/views/scripts/components/create-script-dialog/index.tsx`(或该目录下被引用的模板源)
  里的 profile-scope 默认模板。phase 2 handoff 写"默认模板加 args 形参",验证已经是 `main(args)`
  形态;若还没有则补上,并加一行 `// args.params / args.profile / args.triggeredBy 详见 ScriptMainArgs`
  中文注释引导用户去看类型补全。global-scope 模板已经写了 `main(args)`,不动。

- [x] 6. 构建 + 类型检查

  跑 `pnpm run build`,必须全绿(包括 tsc 渲染 + tsc 主进程 + vite build)。再单独跑
  `npx tsc -p tsconfig.electron.json --noEmit` 与 `npx tsc -p tsconfig.json --noEmit`
  确认两侧类型零错误。这一阶段没有自动测试覆盖(项目没有测试框架);构建绿即视为静态层验收通过。

- [x] 7. 输出手动验证清单(不动代码)

  汇报时把 phase 3 验收清单(spec §10 phase 3)整理回主控,要求用户用 `pnpm run dev` 跑应用并:
  - 写 profile-scope 脚本 `function main(args) { log(args.profile?.name, args.params, args.triggeredBy) }`,
    手动 Run → 日志含 profile 名 / `{}` / `'manual'`
  - 写老式 `function main() { log('hi') }` 不读参 → 仍 `succeeded`
  - Monaco 输入 `args.` → 补全列表含 `params / profile / run / triggeredBy / parentRunId`

  本任务**不**写测试代码、**不**改任何文件,只产出回报文本。
