# 换机归档 · 2026-05-29(下午)— G/F 通过、E 待重测、stop-on-delete 已落

> 接手包,**覆盖** [`handoff-2026-05-29-write-apis-and-fire-and-forget.md`](./handoff-2026-05-29-write-apis-and-fire-and-forget.md)。
>
> 这一份反映 [`test-checklist-2026-05-29.md`](./test-checklist-2026-05-29.md)
> 配合实测的进度:G 组(本轮重点)+ F 组全部通过,E 组测了 4/5 但 E5 因为
> `script_long` 状态没准确控制导致 false negative,新机重测;**G7 实测后追加了
> 一项新决策(profile 删除时顺手 stop 跑在它上面的 ScriptRun)**,代码已落地。
>
> 新对话第一件事:读完本文 + Kiro spec + AGENT.md + CODING_STANDARDS.md,然后等
> 用户发指令。**不要主动改代码**。剩余测试节奏见下面 §6。

## 1. 当下状态一览

- **当前分支**:`feat/global-scripts-phase-6`(领先 main 若干 commit)
- **HEAD**:`c2d6e5c feat(scripts/runtime): stop active ScriptRun on profile delete`
- **最近 commit(从新到老)**:
  ```
  c2d6e5c feat(scripts/runtime): stop active ScriptRun on profile delete   ← 本轮新增
  a5784e3 docs(handoff): 2026-05-29 — write APIs (create/delete) + fire-and-forget guard
  bdd3fd9 feat(scripts/runtime): wait for fire-and-forget bridge calls before exit
  f035ec6 feat(scripts/global): wire profiles.delete through bridge
  7cdb84c feat(scripts/global): wire profiles.create through bridge
  d2a297a fix(scripts/bootstrap): redirect esbuild binary to .asar.unpacked path
  fecab29 fix(build): hoist @esbuild/* + asarUnpack so packaged app can spawn esbuild
  f8176fc fix(profile-form): collapse target OS hint into a hover tooltip
  ```
- **构建**:最近一次 `pnpm run build` 全绿(`c2d6e5c` 提交前)
- **远端 = 本地?**:本地领先 1 个 commit (`c2d6e5c`),需要 push
- **测试清单进度**:G ✅ / F ✅ / E 4-of-5(E5 待重测)/ D / H / C / A / B / I / J / P 全部待测

## 2. 真源文件

继续沿用 Kiro spec 工作流。三套 spec 与上一份归档相同:

| Kiro spec | 状态 |
|---|---|
| `.kiro/specs/global-scripts-and-queues/` | ✅ phase 3 全部勾完 |
| `.kiro/specs/global-scripts-phase-6-runtime/` | ✅ task 1-10, 20;Requirement 8 偏离已用户授权(create + delete 提前实装,只剩 setQueue 占位) |
| `.kiro/specs/global-scripts-profile-launch-close/` | ✅ launch/close 已完成 (`eecc7d6`) |

测试清单和归档:`docs/specs/test-checklist-2026-05-29.md` + 本文件。

## 3. 这一轮发生了什么

### A. G 组 7 条全部通过(profiles.delete)

按测试清单跑了 G1-G7,对应失败语义、磁盘清理、浏览器进程清理都核查到位:

- **G1**:`create + delete` 闭环 ✅(临时 profile 名字闪现后消失)
- **G2**:已删 id 重复 delete → `PROFILE_NOT_FOUND` ✅(故意不幂等,符合归档 §4 决策)
- **G3**:不存在 id → `PROFILE_NOT_FOUND` ✅
- **G4**:profile 上有活跃 ScriptRun 时 delete → `PROFILE_BUSY` + `occupiedBy.{runId, scriptId}` ✅;profile 仍在、磁盘仍在、long 脚本不被打断 ✅
- **G5**:已 launch 但无 ScriptRun 的 profile delete → 浏览器先关 → store 删 → user-data 目录从盘消失 ✅(三连验:磁盘 ls 报 No such file、profiles 目录 grep 无残留、`pgrep` 无 Chromium 进程残留)
- **G6**:2 次循环 (`create + launch + runScript + close + delete`) 端到端 ✅(总耗时 125 秒符合两轮 60s long 脚本 + 启停开销)
- **G7**:UI 路径删除"正在跑脚本的 profile" ✅(详见下条决策 + 代码改动)

### B. **新决策(2026-05-29 下午)** + **代码改动 `c2d6e5c`**

**触发场景**:G7 首测时发现"UI 删 profile 后,跑在它上面的 ScriptRun 没被停,
继续跑到 60s 自然结束"。这与归档 §4 之前定的"UI 路径不查 PROFILE_BUSY"是分开
的两件事 —— 之前那条决策只说"删的时候不 reject",没说"删完之后 ScriptRun
怎么办"。

**用户拍板(解读 1)**:UI 删 profile 时,**顺手 stop 跑在该 profile 上的 ScriptRun**;
**不**级联停 parent run(若该 run 是 global-script `runScript` 的子调度,parent 的
`await` 会拿到一个被 stop 的子 run reject,parent 自己 catch 决定要不要继续)。

理由(给下一轮 agent 看的关键决策上下文):

1. 语义对称性:bridge 路径已经定了"PROFILE_BUSY → reject";UI 路径之前定了"忽略 BUSY 直接删"。两条路径都成立。如果 UI 路径**也**改禁止删,等于反转之前那个决策,且体验差(用户得切到 ActiveRuns 抽屉先 stop 再回 Profiles 删)
2. "顺手 stop"是删除动作的自然延伸:逻辑上**杀浏览器之前**就该先 stop 脚本,因为脚本可能正在 attach CDP,先杀浏览器会让 fork 在最后一刻看到一堆 "Target closed" 错误,日志难看
3. 父等子的语义(归档 §3.E `bdd3fd9`)+ 纯 JS 失败语义(归档 §4),恰好让"子被 stop → parent 拿到 reject → parent catch 决定继续"成为干净的扩展,不用加新概念

**实装** (`c2d6e5c`):

- `electron/scripts/runtime.ts`:
  - `stop(runId, reason?)` 加可选 `reason`。带 reason 时往 ScriptRun 自己日志里追一行 `[runtime] <reason>`,排障可溯源("不是用户 stop、不是脚本 bug、是 profile 被删了")
  - 新增 `waitForExit(runId, timeoutMs?)`:50ms 步进轮询直到 active map 里那条消失。`timeoutMs` 默认 `GRACEFUL_SHUTDOWN_MS + 1000` = 4s 兜底覆盖 SIGTERM→SIGKILL 全程。超时不抛错,resolve;极端 hung-fork 留给 before-quit 钩子。**故意走轮询而不是订阅 'active-changed' 事件** —— 调用方少不进热路径,轮询语义更清,边界(run 已退)免特判
- `electron/main.ts` `deleteProfile` 状态机从 3 步扩到 5 步,顶部加:
  ```ts
  const activeRun = scriptRuntime.getActiveByProfile(id)
  if (activeRun) {
    await scriptRuntime.stop(activeRun.id, `profile ${id} deleted, run terminated`)
    await scriptRuntime.waitForExit(activeRun.id)
  }
  ```
  **bridge 路径不受影响**:bridge 已 reject PROFILE_BUSY,这一步必然 no-op
- 利用现有"一个 profile 同一时刻最多 1 条 active run"硬约束(由 `runtime.start` 互斥保证),`getActiveByProfile` 0/1 条无需循环

**实测验证**(已在工作机):
- 浏览器进程 `pgrep` 无残留
- profile 目录 `ls` 报 No such file
- ScriptRun 日志命中 `[runtime] profile <id> deleted, run terminated`
- bootstrap 报告 `Script received SIGTERM; abort stopSignal`(走和"用户手动 stop"一致的路径)
- ScriptRun 状态从 running 直接进 `'stopped'`(不是 `'failed'`)

### C. F 组 5 条全部通过(profiles.create)

合并到一个脚本里跑(归档说 F6 已通过、回归只跑 F1,本轮把 F2-F5 也顺手补了):

- F1 ✅ 自动生成 id(`env_*`),name 透传
- F2 ✅ 同名 OK,id 不冲突(name 不要求唯一)
- F3 ✅ 显式 id 命中
- F4 ✅ 重复 id → `PROFILE_ID_TAKEN`
- F5 ✅ 非法 id(空格 + `!`)→ `INVALID_PROFILE_ID`

### D. E 组 4-of-5(E5 待重测)

- E1 ✅ 关闭状态下 launch
- E2 ✅ 已 launch 再调 launch → no-op
- E3 ✅ close
- E4 ✅ 已关再 close → no-op
- E5 ⚠️ false negative,**待重测**

E5 的现象:期望 `PROFILE_BUSY` reject,实际 `err` 是 `undefined`(`code/msg/occupiedBy` 全空)。

**根因(已确认,非 bug)**:E5 跑之前需要先在 P 上手动 Run 一个长脚本占用,但当时
长脚本的 60s 时限可能已经自然超时,close 走了"已关 no-op"路径。`pgrep Chromium`
看不到任何进程印证了这一点。

**E5 的正确测法**(留给下一轮):
1. 起点干净:ActiveRuns 抽屉里没有 running run
2. 在 P 上**手动 Run** `script_long`(60 秒 sleep)
3. **立刻**(60s 内)切到 `g_test`,跑 E5 那段:
   ```ts
   const err = await profiles.close('<P_id>').catch(e => e)
   log('E5 code:', err?.code, 'occupiedBy:', JSON.stringify(err?.occupiedBy))
   ```
4. 期望:`PROFILE_BUSY` + occupiedBy 命中那条 long run

### E. 测试清单术语修正

`ScriptRunStatus` 真源是 `'succeeded'` / `'failed'` / `'stopped'`(见
`runtime.ts:363` 与 `bridge.ts:1002` 的 `isTerminalStatus`)。归档 / 测试清单
里 D1 / G6 / H1 / H5 等处写的 `'completed'` 是术语漂移,本轮已就清单内修正。

## 4. 用户拍板的关键决策(增量,接续上一份归档 §4)

| 项 | 决策 | 触发 |
|---|---|---|
| **UI 删 profile 时顺手 stop 跑在它上面的 ScriptRun(解读 1)** | 删除时走和"用户手动 stop"一样的路径(SIGTERM → 3s SIGKILL),status 标 `'stopped'`;**不**级联 parent run | G7 实测发现 `script_long` 没被停,触发该决策 |
| 顺手 stop 时 ScriptRun 日志最后一行写 `[runtime] profile <id> deleted, run terminated` | 排障可溯源,与"用户手动 stop"和"脚本 bug 自然失败"区分 | 同上 |

> 上一份归档 §4 的所有决策仍然有效,本份不重复(create / delete 提前实装、delete
> UI 路径不查 BUSY、delete 不幂等、fire-and-forget 父等子解读 c 待用户拍板、失败
> 语义 = 纯 JS)。

## 5. 现状文件位置(增量)

| 关注点 | 文件 | 备注 |
|---|---|---|
| ScriptRun stop with reason | `electron/scripts/runtime.ts::stop` | reason 可选,带就 appendLog |
| 等 ScriptRun 真退出 | `electron/scripts/runtime.ts::waitForExit` | 50ms 步进轮询、4s 默认 timeout |
| Profile 删除 5 步状态机 | `electron/main.ts::deleteProfile` | 顶部加 stop ScriptRun 那一步 |

(其余文件位置同上一份归档 §5。)

## 6. 用户在另一台机器上手做的事(测试节奏)

```bash
git fetch origin
git checkout feat/global-scripts-phase-6
git pull
pnpm install
pnpm run build       # 必绿
pnpm run dev
```

测试清单 [`test-checklist-2026-05-29.md`](./test-checklist-2026-05-29.md)
在新机继续。剩余条目 + 优先级:

```
E5(重测,严格按 §3.D 步骤造 long run 占用) →
D 组(子调度回归) →
H 组(fire-and-forget 守护;⚠️ H1 的"父等子"解读 c 用户尚未明确确认,新对话首轮可二次确认) →
C 组(全局 SDK 基础读) →
A 组(回归基线) →
B 组(profile 表单视觉) →
I 组(错误码) →
J 组(资源清理) →
P 组(dist 模式 packaging,需要 pnpm dist:mac)
```

**已通过的 G / F 不需要回归**,除非新机有不同 OS / 不同 user-data 路径分支才回头补。

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

1. **不要回顾聊天历史**,以本文件 + Kiro spec + AGENT.md 为准
2. **不要主动重构已落地代码**(尤其 `c2d6e5c` 的 stop-on-delete 逻辑,有大量决策注释支撑)
3. **当前分支不是 main**:在 `feat/global-scripts-phase-6` 分支推进
4. **默认行为**:
   - 用户说"继续"且测试清单未走完 → 按 §6 优先级走
   - 用户说"验证 X" → 引导跑清单第 X 条
   - 用户报 bug → 优先看 §3 各 commit 注释里"为什么这样"
5. 开工前 `pnpm run build` 本机能跑通
6. 任何改动后 `pnpm run build` 必绿
7. **不要悄悄改 Kiro spec**:发现 spec 与现实脱节先回报用户,得到确认再改
8. fire-and-forget 行为(上一份归档 §3.E)用户尚未明确确认 (c) 解读;若用户提到该行为有疑问,优先二次确认
9. **stop-on-delete 行为是新决策**(本文件 §4),用户已明确拍板"解读 1",不需要再确认
10. 反检测体系不动(`docs/specs/anti-detection.md`)

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

# 验 G5 / G7 类用例的磁盘清理
ls "$HOME/Library/Application Support/auto-registry/registry-data/profiles/" | grep <id_prefix>

# 验浏览器进程残留
pgrep -fl Chromium
```
