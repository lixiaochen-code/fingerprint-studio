# 换机归档 · 2026-05-29 — 全局写接口完成 + fire-and-forget 守护落地

> 接手包,**覆盖** `handoff-2026-05-27-phase-6-done.md`(那份停在 phase 6 + launch/close
> 未做)。本份反映:phase 6 + launch/close + profiles.create/delete + bridge fire-and-forget
> 守护全部完成的最新视图。
>
> 新对话第一件事:读完本文 + Kiro spec + AGENT.md + CODING_STANDARDS.md,
> 然后等用户发指令。**不要主动改代码**。用户已表示下一轮进入"配合验证测试"阶段,
> 测试清单是 [`test-checklist-2026-05-29.md`](./test-checklist-2026-05-29.md)。

## 1. 当下状态一览

- **当前分支**: `feat/global-scripts-phase-6`(领先 main **若干** commit,**未合并**)
- **HEAD**: `bdd3fd9 feat(scripts/runtime): wait for fire-and-forget bridge calls before exit`
- **最近 6 个 commit(从新到老)**:
  ```
  bdd3fd9 feat(scripts/runtime): wait for fire-and-forget bridge calls before exit
  f035ec6 feat(scripts/global): wire profiles.delete through bridge
  7cdb84c feat(scripts/global): wire profiles.create through bridge
  d2a297a fix(scripts/bootstrap): redirect esbuild binary to .asar.unpacked path
  fecab29 fix(build): hoist @esbuild/* + asarUnpack so packaged app can spawn esbuild
  f8176fc fix(profile-form): collapse target OS hint into a hover tooltip
  ```
- **构建**: 最近一次 `pnpm run build` 全绿
- **远端 = 本地?**: **本地领先 2 个 commit**(`f035ec6`, `bdd3fd9`),需要 push
- **本轮焦点**: profiles.delete + 父 fork 等待子 fire-and-forget 完成 + 落归档

## 2. 真源文件:Kiro spec 三件套 + 本归档

继续沿用 Kiro spec 工作流,`.kiro/specs/` 下三件套结构,这是真源。

| Kiro spec | 状态 | 含义 |
|---|---|---|
| `.kiro/specs/global-scripts-and-queues/` | ✅ phase 3 全部勾完 | main(args) 协议接通 |
| `.kiro/specs/global-scripts-phase-6-runtime/` | ✅ task 1-10, 20 完成;11-19 是 `*` 可选 property 测试,**未跑**;Requirement 8 已**用户授权偏离**(create + delete 提前实装,只剩 setQueue 占位) |
| `.kiro/specs/global-scripts-profile-launch-close/` | ✅ launch/close 已完成(commit `eecc7d6`) |

**这两个偏离 spec 的实装(create + delete)已经获得用户明确同意**,不需要回头去
改 spec。继续编码时 setQueue 仍占位,要等下一份子 spec 才会动。

## 3. 这一轮做完了什么

### A. profile-form UI 抛光 (commit `f8176fc`)

把"目标系统锁定"那段长 hint 改成 amber AlertTriangle + Tooltip(与 Header 的
"MODE" info 图标同款),从三行碾压式提示降为悬浮可见,不再让其他字段相形见绌。

### B. 打包路径修复 (commits `fecab29`, `d2a297a`)

打包后 `pnpm dist:mac` 起的 app 跑全局脚本时崩在 esbuild,原因是 `@esbuild/*`
平台二进制被 pnpm 隔离不了 + 进了 `.asar` 不可执行。两步修法:

- `fecab29`:**新增项目级 `.npmrc`** —— `public-hoist-pattern[]=@esbuild/*` 让平台
  二进制提到顶层 node_modules;`package.json` 的 `build.asarUnpack` 加
  `@esbuild/**/*`,让二进制随 app 进 `.asar.unpacked`。
- `d2a297a`:**`electron/scripts/esbuild-binary.ts`(新文件)** —— 在 bootstrap
  顶层 side-effect 位置设 `process.env.ESBUILD_BINARY_PATH`,把路径里的
  `app.asar` 段替换成 `app.asar.unpacked`。dev 模式 path 不含 `.asar`,replace
  是 noop,不影响。

### C. profiles.create 走 bridge (commit `7cdb84c`)

phase 6 §Requirement 8 原本要求 create 占位 `GLOBAL_NOT_IMPL_YET`,**用户授权
提前实装**,理由是批量注册环境的诉求最高。

- `bridge-types.ts`:`'profiles.create'` 加进联合 + Set
- `bridge.ts`:switch 加 case;校验 ProfileDraft → `profileStore.create(draft)` →
  RESPONSE 回 BrowserProfile
- `sdk/index.ts`:`makeGlobalScopeProfilesApi.create` 走 `bridge.call`,reject
  时 `wrapBridgeRejection` 翻成 ScopeMismatchError
- `script-typings.ts` 与 `sdk/types.ts`:JSDoc 写清失败码(INVALID_PROFILE_ID /
  PROFILE_ID_TAKEN / INTERNAL_ERROR)

用户已端到端验证:用 `for` 循环跑 5 次 `profiles.create({name: 'env'+i})` →
runScript → 日志命中 0..4。

### D. profiles.delete 走 bridge (commit `f035ec6` — 本轮)

对称延伸,同样**用户授权提前实装**,只剩 setQueue 占位。

**main 进程层** (`electron/main.ts`):
- 抽出 `deleteProfile(id)` helper —— 三步状态机:
  1. `terminateProfileBrowser(id)`:浏览器在跑就 SIGTERM → 等 exit / 2.5s →
     SIGKILL → 200ms;不在跑就 no-op
  2. `store.remove(id)`:删元数据
  3. `fs.rmSync(profilePath, { recursive, force, maxRetries: 3, retryDelay: 200 })`
  顺序写死,违反就要么留浏览器进程要么留盘上残留
- 重构 `profiles:remove` IPC 复用这个 helper —— **UI 路径保持"无 PROFILE_BUSY 检查"**
  的历史语义(用户对自己从 UI 删的环境负责);bridge 路径走互斥
- ScriptBridge 构造函数加第 7 个回调参数 `deleteProfileFromBridge`

**Bridge 层** (`bridge.ts` + `bridge-types.ts`):
- `'profiles.delete'` 进 BridgeMethod 联合 + 运行时 Set
- switch case:校验 `payload.id` → `profileStore.get` 不命中 reject
  PROFILE_NOT_FOUND → `runtime.getActiveByProfile(id)` 命中 reject PROFILE_BUSY
  (带 `occupiedBy.{runId, scriptId}`)→ 调 `deleteProfileFromBridge` → RESPONSE
  `value: null`

**SDK 层** (`sdk/index.ts` + `sdk/types.ts` + `src/lib/script-typings.ts`):
- `makeGlobalScopeProfilesApi.delete` 走 bridge.call → `.then(() => undefined)`
- JSDoc 把三种失败码写清:PROFILE_NOT_FOUND / PROFILE_BUSY(带 occupiedBy)/
  INTERNAL_ERROR
- **不幂等**:重复删已删 id 拿 PROFILE_NOT_FOUND;用户要"存在就删"自己 try/catch

### E. fire-and-forget 守护 (commit `bdd3fd9` — 本轮)

**用户原话**:"我希望在微任务在运行的时候,进程能不结束"。

**场景**:全局脚本 `main()` 起了若干 `runScript(...)` 但没 await,然后 main()
返回。每个 runScript 都是 BridgeClient pending Map 里的一条 Promise;父 fork
一旦 main() 返回就退出,这些子 ScriptRun 会被 SIGTERM 级联杀死,违反用户"开几条
独立流水线让它们自然跑完"的意图。

**本轮选定的解读 (interpretation c)**:让父 fork 等到所有 fire-and-forget 完成
再退出。**该解读用户尚未明确确认,仅根据"微任务"措辞推测**;新对话开始时若用户
对这个行为有质疑,记得拿到他明确意见再调整。

**实装** (`bridge-client.ts` + `bootstrap.ts`):
- `BridgeClient` interface 加 `whenIdle(): Promise<void>`
- 内部新 `idleWaiters: Array<() => void>`(数组而非单 Promise,允许多处并发)
- 新 `notifyIdleWaiters()`:pending 清空 + 有 waiter 时一次性触发,先快照后清空
- 三处 `pending.delete` 后都补调 `notifyIdleWaiters()`:
  1. `handleMessage` resolve/reject 之后(让用户 .then 链先跑可能发新 call)
  2. `call()` send-undefined 分支(channel 没开)
  3. `call()` send-returns-false 分支(channel 刚断)
- `dispose()` 内 `pending.clear()` 之后也调 `notifyIdleWaiters()`,让"用户主动 stop"
  与"父 disconnect"两条路径同样能解开 awaiting 的 whenIdle
- 顺手清掉 `BridgeError` 这个未使用 import 警告
- `bootstrap.ts` `main()`:`await defaultExport(args)` 之后、`process.send completed`
  之前,加 `await bridge.whenIdle()`。注释明确三条退路:
  - 自然返回 → whenIdle 解开后 completed
  - 用户 SIGTERM → abortController.abort() → 用户 await 抛错 → catch 路径(根本不到 whenIdle)
  - app exit → 主进程 SIGTERM 级联仍强行结束

## 4. 用户拍板的关键决策(本轮新增)

| 项 | 决策 |
|---|---|
| profiles.create 提前实装 | 用户已批,phase 6 §Req 8 偏离 |
| profiles.delete 提前实装 | 用户已批,同上;只剩 setQueue 仍占位 throw `GLOBAL_NOT_IMPL_YET` |
| delete UI 路径**不**做 PROFILE_BUSY 检查 | 与历史语义一致(用户对自己 UI 删的环境负责);bridge 路径**做**检查 |
| delete 不幂等 | 重复删拿 PROFILE_NOT_FOUND;由用户 try/catch 表达"存在就删" |
| fire-and-forget 行为 = 父等子 | 解读 (c);**用户未明确确认仅推测**,新对话首轮可二次确认 |
| 失败语义 = 纯 JS | 子 run failed/stopped 默认让队列停止;用户用 try/catch 表达"这一个可能失败" |

## 5. 现状文件位置

| 关注点 | 文件 | 备注 |
|---|---|---|
| Bridge 协议类型 | `electron/scripts/bridge-types.ts` | `'profiles.create'`, `'profiles.delete'` 都在联合里 |
| Bridge 主进程实装 | `electron/scripts/bridge.ts` | 7 个回调入参 + create/delete 两个 case |
| Bridge fork 客户端 | `electron/scripts/sdk/bridge-client.ts` | whenIdle / notifyIdleWaiters |
| SDK 工厂 | `electron/scripts/sdk/index.ts` | create/delete 走 bridge,setQueue 仍 notImplementedYet |
| SDK 类型 | `electron/scripts/sdk/types.ts` | ProfilesApi.delete JSDoc |
| Monaco d.ts | `src/lib/script-typings.ts` | 与 sdk/types.ts 同步 |
| bootstrap | `electron/scripts/bootstrap.ts` | esbuild env redirect + bridge.whenIdle |
| esbuild 路径修复 | `electron/scripts/esbuild-binary.ts`(新) | dev/prod 双栈 |
| Profile 删除 helper | `electron/main.ts` `deleteProfile` | UI 与 bridge 共用 |
| ScriptRuntimeManager | `electron/scripts/runtime.ts` | bridge attach,no change this round |
| Profile form 提示样式 | `src/views/profiles/components/profile-form/index.tsx` | f8176fc |
| 项目级 .npmrc | `.npmrc` | hoist `@esbuild/*` |
| 打包配置 | `package.json` `build.asarUnpack` | `@esbuild/**/*` |

## 6. 用户在另一台机器上手做的事

```bash
git clone <repo>     # 或 git pull
git checkout feat/global-scripts-phase-6
pnpm install
pnpm run build       # 必绿
pnpm run dev         # 跑应用
# 或 pnpm dist:mac     # 打包测试
```

测试清单见 [`test-checklist-2026-05-29.md`](./test-checklist-2026-05-29.md) ——
新对话开始后用户会跟你一起走清单逐项验证。

## 7. 工作约定(沿用)

- 中文回复
- 代码注释中英可混,"为什么"优先中文
- 每次代码改动后 `pnpm run build` 必绿
- 同思路连失败两次 → 停下来根因分析
- **Kiro spec 是真源**;改动前先看对应 design.md 的不变量
- spec 与实现冲突 → 先在 spec 里改,再写代码;**禁止悄悄改 spec**
- src/ 新增组件按 kebab-case 目录化(`<name>/index.tsx`),shadcn ui 例外
- 推送代理:`all_proxy=http://127.0.0.1:7890 git push origin <branch>`
- shadcn/ui 唯一 UI 库;pnpm 唯一包管理器;lucide-react 唯一图标库
- 不擅自加新依赖

## 8. 给下一轮 AI agent 的硬规则

读到这里时的首要任务:

1. **不要回顾聊天历史**。以本文件 + Kiro spec + AGENT.md 为准
2. **不要主动重构已落地代码**(ScriptBridge / BridgeClient / deleteProfile / fire-and-forget 守护是本轮核心,有大量决策注释支撑)
3. **当前分支不是 main**:在 `feat/global-scripts-phase-6` 分支推进
4. **默认行为**:
   - 用户说"继续"且测试清单未走 → 走清单
   - 用户说"验证 X"→ 引导跑清单第 X 条
   - 用户报 bug → 优先看 §3 各 commit 注释里"为什么这样"
5. 开工前 `pnpm run build` 本机能跑通
6. 任何改动后 `pnpm run build` 必绿
7. **不要悄悄改 Kiro spec**:发现 spec 与现实脱节先回报用户,得到确认再改
8. fire-and-forget 行为(§3.E)用户尚未明确确认 (c) 解读;若用户提到该行为有疑问,优先二次确认
9. 反检测体系不动(`docs/specs/anti-detection.md`)

## 9. 一次性命令

```bash
# 类型检查
npx tsc -p tsconfig.json --noEmit
npx tsc -p tsconfig.electron.json --noEmit

# 全量构建
pnpm run build

# 跑应用
pnpm run dev

# 打包(本机 mac arm64)
pnpm dist:mac

# 推送(用户的代理)
all_proxy=http://127.0.0.1:7890 git push origin feat/global-scripts-phase-6

# 哪些文件偏长
find src electron -name '*.ts' -o -name '*.tsx' | xargs wc -l 2>/dev/null | sort -rn | head -20
```
