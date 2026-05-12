# 代码规范

本文件是 `auto-registry` 的唯一编码规范来源。目标只有一个：**代码的可维护性与可读性**。所有后续开发必须遵守本文件；与本文件冲突的历史写法遇到即修正。

修改本规范需要在 PR / 提交信息里明确说明原因，并且本次变更仅影响新代码；存量按机会主义迁移。

---

## 0. 阅读顺序

1. 先读 `AGENT.md` 了解项目结构
2. 再读本文件
3. 动手前按规范第 10 节的"改动前检查清单"走一遍

---

## 1. 顶层目录约束

```
electron/   主进程与 preload，仅这里可以 import node:* 与 electron
src/        渲染进程；组件、页面、客户端工具
docs/       文档；唯一允许的规范来源
```

新增文件前先判断"它属于谁的进程"，不要跨目录引用对方的实现细节。主进程与渲染进程**只通过 IPC 和 preload 通信**。

## 2. `electron/` 内部结构

每个文件承担单一职责。现有契约：

| 文件 | 职责 | 可以依赖 |
| --- | --- | --- |
| `main.ts` | 应用生命周期、窗口、IPC 路由 | 同目录所有模块 |
| `preload.ts` | `contextBridge` 暴露 API | 仅 `types.ts` |
| `types.ts` | 主进程 & 渲染进程共享的领域类型 | 无 |
| `paths.ts` | userData 下所有路径的唯一真源 | `electron`, `node:*` |
| `store.ts` | profiles / plugins 的持久化 | `types.ts`, `paths.ts`, `fingerprint.ts` |
| `fingerprint.ts` | 指纹生成 + JS 注入扩展 | `types.ts` |
| `proxyAuth.ts` | 代理认证扩展 | `types.ts` |
| `kernel.ts` | 内核发现、选择、启动参数拼装 | 以上全部 |
| `downloader.ts` | 内核下载与解压 | `types.ts`, `paths.ts`, `fingerprint.ts` |

**规则**：

- 新增主进程模块时，先问"它放进现有某个文件合不合适"；实在是新职责再建新文件
- 不允许"工具函数大杂烩"文件。工具归属于它服务的模块
- 文件命名：`camelCase.ts`
- 主进程任何磁盘路径都必须来自 `paths.ts`，**不允许**在其它地方写 `path.join(app.getPath('userData'), ...)`

## 3. `src/` 内部结构

```
src/
├── App.tsx                 # 应用根组件；业务编排
├── main.tsx                # React 入口
├── styles.css              # 全局样式 / Tailwind 层 / CSS 变量
├── vite-env.d.ts           # window.registry 类型声明
├── components/
│   ├── ui/                 # shadcn/ui 原子组件（Button、Dialog、Input...）
│   ├── ProfileFormDialog.tsx
│   ├── ProfileDetailsDialog.tsx
│   ├── ConfirmDeleteDialog.tsx
│   ├── KernelSetup.tsx
│   └── SettingsView.tsx
└── lib/
    ├── i18n.ts             # 插值与多语言辅助
    └── utils.ts            # cn() 等极少数 UI 工具
```

**规则**：

- `components/ui/` 只放"完全无业务意味"的 shadcn 原子组件，文件名 `kebab-case.tsx`
- `components/` 下放"带业务意味的复合组件"，文件名 `PascalCase.tsx` 且与默认 export 同名
- 不允许在 `src/` 其他位置新建文件夹，除非先讨论目录规范更新
- `lib/` 里只放**无副作用**的纯函数
- React 组件默认 function component + hooks；**禁止** class component

## 4. TypeScript

### 4.1 严格性

- `strict: true`，已开启，不允许在 tsconfig 关掉任何 strict 选项
- **禁止** `any`。需要逃逸类型系统时用 `unknown` 并在入口加类型守卫
- **禁止** 非空断言 `!`，除非紧邻 `if (x) return` / `assert(x)`，且一行内完成
- **禁止** `// @ts-ignore`；特殊情况用 `// @ts-expect-error <原因>`

### 4.2 类型组织

- 领域类型（跨进程共享）放 `electron/types.ts`
- 组件内部 `Props`、`State` 就近定义在组件文件里
- 导出的类型用 `type`，除非确实需要类的结构（几乎不会）

### 4.3 命名

| 对象 | 命名 |
| --- | --- |
| 类型 / 接口 | `PascalCase` |
| 变量 / 函数 | `camelCase` |
| 常量 | `SCREAMING_SNAKE_CASE` 仅限模块级且真·不变的；局部常量用 `camelCase` |
| React 组件 | `PascalCase` |
| 布尔变量 | `is*`、`has*`、`can*`、`should*` 前缀 |
| 异步函数 | 与同步同名即可，不加 `Async` 后缀 |

### 4.4 import 顺序

从上到下，空行分组：

1. Node 内置 (`node:*`)
2. 外部包 (`react`、`electron`、`@radix-ui/*`)
3. 项目别名 (`@/...`)
4. 相对路径 (`./`, `../`)
5. 类型-only 导入可合并在同组内，用 `import type`

不使用 default export，**除了 React 组件的自身默认导出以及 Vite 约定的入口文件**。业务模块统一命名导出。

## 5. React & UI

### 5.1 组件

- 组件函数必须有显式 `Props` 类型；不用 `React.FC`
- 行数超过 ~200 行的组件视为"该拆了"信号；按职责拆子组件或提取 hook
- 所有用户可见文案通过 `i18n` 的 `labels[locale]` 表管理，**不要**把中文或英文字符串直接硬编码到 JSX
- 不在组件顶层做副作用；副作用必须放进 `useEffect`
- 不要用 `useEffect` 做"派生状态"；用 `useMemo` 或直接计算

### 5.2 UI 原语

- 所有基础 UI **必须**走 `src/components/ui/` 下的 shadcn 组件
- **禁止**引入 antd、MUI、Chakra、Mantine 等完整组件库
- 需要新原子组件时，手工在 `src/components/ui/` 下新增一个文件，风格对齐现有 `button.tsx`、`dialog.tsx`（Radix primitive + cva + `cn()`）

### 5.3 样式

- Tailwind utility class 为主；复杂 / 重复样式提炼成 cva variant 或组件
- **禁止**写 inline `style={{...}}`，除非依赖运行时动态值（进度条宽度等）
- 颜色只用 CSS 变量（`bg-background`、`text-muted-foreground`…），不硬编码 `#hex` / `rgb()`
- `src/styles.css` 之外不新增 CSS 文件

### 5.4 状态与数据流

- 本地状态优先 `useState`；复杂状态用 `useReducer`
- 跨组件状态用 context，**不要**默认引 Zustand / Redux
- 渲染层获取数据唯一通道：`window.registry.xxx`。**禁止** `fetch`、`XMLHttpRequest` 直连外部

## 6. 错误处理

- 主进程里"用户可感知失败"的路径（启动浏览器、导入插件、下载内核），必须把错误结构化返回给渲染进程（`{ ok: false, error: { code?, message } }`），而不是 `throw`
- 其它"应该不会失败"的路径允许 `throw`；IPC handler 自己 catch 并序列化
- **禁止**空 `catch {}`。至少 `console.error('[module] what failed', error)`，并注释为什么可以吞错
- 用户可见的错误信息必须接入 i18n
- toast 用 `sonner`，**不**滚自家的 toast 实现

## 7. 注释

- 注释回答"为什么"，代码本身回答"是什么"
- 每个非显而易见的分支 / 反直觉的代码块，用一行注释说明动机
- 注释允许中英混写；"为什么"的注释优先中文
- **禁止**：
  - 注释掉的代码块（直接删，Git 负责存档）
  - 复述代码的 noise 注释
  - `TODO` 不带负责人 / 追踪 issue 的裸置（用 `TODO(@username, #issue): ...`）

## 8. 日志与副作用

- 主进程日志用 `console.log` / `console.error`，带模块前缀：`[kernel] ...`、`[store] ...`
- **禁止**在主进程用 `alert`、`dialog.showMessageBox` 做"调试输出"
- IO 操作（读写文件、spawn）必须考虑错误路径并写日志
- 写 JSON 文件必须原子写（先 `.tmp` 再 `rename`），参考 `store.ts` 里的 `writeJsonAtomic`

## 9. 安全底线

- Electron 窗口必须保持 `contextIsolation: true` + `nodeIntegration: false`
- 渲染进程**禁止**开 `devTools` 到生产构建（`devTools: isDev`）
- spawn Chromium 时，若使用 `--remote-debugging-port`，必须同时 `--remote-debugging-address=127.0.0.1`
- 密码 / 密钥 / 代理凭证：
  - 禁止打印到日志
  - 禁止通过 `console.log` 吐出
  - 磁盘存储限定在 profile 目录内；未来如需跨 profile 汇总，走 OS keychain
- 任何外部输入（用户粘贴的 URL、ZIP 文件路径）必须做基础校验再用

## 10. 改动前检查清单

开始改代码前过一遍：

- [ ] 已读 `AGENT.md`
- [ ] 已读本文件
- [ ] 已经读完所有将要修改的文件，不是"估计差不多"
- [ ] 新增依赖？已获得用户同意
- [ ] 改动跨进程？IPC 三件套（main handler + preload + renderer 类型）都列入了改动计划
- [ ] 改动涉及持久化？清楚"旧数据能否被新代码读出来"

## 11. 改动后检查清单

提交前过一遍：

- [ ] `pnpm run build` 全绿
- [ ] 无 `console.log` 留在生产路径里（debug 过程用的要删）
- [ ] 无注释掉的代码、无临时变量名（`foo`、`temp`、`newData2`）
- [ ] 所有新增用户可见文案都走了 i18n
- [ ] 新增 / 修改的复杂逻辑至少有一行中文注释解释"为什么"
- [ ] 若改动触及启动 / 删除 / 持久化流程，已手动跑过一遍
- [ ] PR / 提交信息说明了：做了什么、为什么做、怎么验证过

## 12. 快速反例

这些是**反例**，不要这样写：

```ts
// ❌ 跨进程抽象泄漏
// src/components/Foo.tsx
import { app } from 'electron'

// ✅
// 通过 preload 暴露需要的数据即可
```

```ts
// ❌ any
function handle(event: any) { ... }

// ✅
function handle(event: unknown) {
  if (!isBrowserCrashEvent(event)) return
  ...
}
```

```tsx
// ❌ 硬编码文案
<Button>保存</Button>

// ✅
<Button>{t.submit}</Button>
```

```ts
// ❌ 非原子写
fs.writeFileSync(file, JSON.stringify(data))

// ✅
writeJsonAtomic(file, data)
```

```tsx
// ❌ 自己实现下拉
<div className="absolute ...">...</div>

// ✅ 用 shadcn 的 DropdownMenu
<DropdownMenu trigger={...} items={[...]} />
```

---

规范以可读、可维护为终点。遇到规范没写到但明显违背这个目标的做法，按这个目标判断即可，并在后续提议里补进规范。
