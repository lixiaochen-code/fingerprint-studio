# 换机归档 · 2026-05-26 (路由重构 + 目录规范化)

> 这份是给下一轮对话用的接手包(用户跨机器继续)。新对话第一件事:读完本文 +
> `AGENT.md` + `docs/CODING_STANDARDS.md`,然后等用户发指令。**不要主动改代码。**

## 1. 当下状态一览

- **分支**: `main`
- **HEAD**: 即将提交的 commit(本轮所有改动一次性进 commit,具体 hash 提交时填)
- **远端 = 本地**: 等本轮提交后会 push,用户在另一台机器 pull 即可
- **构建**: `pnpm run build` 全绿(已多次验证)
- **本轮焦点**: 把 src/ 全面目录化(kebab-case)+ 路由换 react-router + App.tsx 拆分 +
  应用关闭联动浏览器关闭 + 反检测策略落定

## 2. 这一轮做完了什么

### 2.1 反检测策略最终落定

历史 handoff(handoff-2026-05-25.md)记录了 Turnstile 600010 的几轮排查。**根因**:
`--user-agent` CLI flag,即便值与真实内核版本号完全对齐,Cloudflare 仍能从 client hints
(`navigator.userAgentData.getHighEntropyValues`)读出真实平台/版本号矛盾。

**最终方案** (代码中已实现):

- chromium 路径**不再传** `--user-agent` / `--lang` / `--force-webrtc-ip-handling-policy`
- chromium 路径**必传** `--disable-blink-features=AutomationControlled` —— 让 navigator.webdriver
  从内核层就是 false,不需要 JS hook
- stealth payload 里**不再 hook** navigator.userAgent / appVersion / platform —— 跟 client hints
  天然一致即可
- `fingerprint.ts::resolveTargetOs` 永远返回宿主 OS,UI 上"目标系统"下拉框改成只读标签 + 提示
- 跨 OS 伪装走 cloak / itbrowser 内核(它们在编译期改了 client hints 来源)
- **测试结果**:Turnstile compat + challenge 全绿,fingerprintjs 不同 profile visitor ID 不同

详见 `AGENT.md` 第 4 节"反检测策略约束"。

### 2.2 应用关闭联动浏览器关闭

之前 `spawn(..., { detached: true })` + 注释里写"浏览器持续存活"。用户改了产品语义:
**关闭应用 = 关闭它启动的所有浏览器**。

实现在 `electron/main.ts`:
- 新增 `terminateAllProfileBrowsers()`,SIGTERM 给所有还活着的子进程,2.5s 超时 SIGKILL
- `app.on('before-quit')` 里 `event.preventDefault()`,等清理完再 `app.exit(0)`
- `scriptRuntime.shutdown()` 与浏览器清理并行 await

### 2.3 路由换成 react-router

依赖: `react-router-dom@7` (新增)。

- `src/main.tsx` 顶层包 `<HashRouter>` (Electron 离线场景必须用 hash 而不是 history)
- `src/App.tsx` 中 view state 从 `useState` 改成派生自 `useLocation().pathname`
- view 切换走 `useNavigate()`,不直接改 hash
- **保留** `KeepAlive` 包路由组件 —— 切走只是 display:none,Monaco / 订阅 / 滚动都保留
- 不引第三方 keepalive 包(社区 keepalive-for-react 评估过,自家 39 行的 KeepAlive 够用)

### 2.4 目录全面规范化(kebab-case)

详见 `AGENT.md` 第 5 节 / 第 10 节。规则速记:

| 类型 | 规则 |
| --- | --- |
| 路由 / 业务组件目录 | `kebab-case/` 内放 `index.tsx` |
| `src/views/<view>/` | 每个路由一个目录;子组件放 `<view>/components/<name>/` |
| 通用组件 `src/components/<name>/` | 跨 view 复用 |
| shadcn 原子组件 `src/components/ui/*.tsx` | **唯一例外**:单文件 kebab-case |
| Hooks `src/hooks/use<Topic>.ts` | (本轮还没用到,目录已规划) |
| 工具函数 `src/lib/<name>.ts` | kebab-case |
| 导出方式 | 页面组件用 `export default`,其它一律命名导出(常带 `export default` 兼容) |

最终目录结构(本轮成果):

```
src/
├── App.tsx                                           # 566 → 维持(Phase B 再瘦身)
├── main.tsx                                          # HashRouter
├── styles.css
├── vite-env.d.ts
├── components/
│   ├── ui/                                           # split-pane / dialog / button / ...
│   ├── active-runs-button/index.tsx
│   ├── app-header/index.tsx                          # 从 App.tsx 抽出
│   ├── confirm-delete-dialog/index.tsx
│   ├── keep-alive/index.tsx
│   ├── kernel-setup/index.tsx
│   ├── profile-details-dialog/index.tsx
│   ├── profile-form-dialog/
│   │   ├── index.tsx                                 # 326 → 299
│   │   └── components/
│   │       └── plugins-section/index.tsx             # 新抽
│   ├── proxy-batch-import-dialog/index.tsx
│   ├── proxy-form-dialog/index.tsx
│   └── proxy-select-field/index.tsx
├── views/
│   ├── profiles/
│   │   ├── index.tsx                                 # 395 行,Phase B 再拆
│   │   └── components/
│   │       └── fingerprint-badge/index.tsx
│   ├── scripts/
│   │   ├── index.tsx                                 # 507 → 130
│   │   ├── translations.ts                           # 抽出
│   │   └── components/
│   │       ├── create-script-dialog/index.tsx
│   │       ├── delete-script-dialog/index.tsx
│   │       ├── script-detail-pane/index.tsx
│   │       ├── script-editor/index.tsx
│   │       ├── script-list/index.tsx
│   │       ├── script-run-panel/
│   │       │   ├── index.tsx                         # 647 → 357
│   │       │   ├── translations.ts
│   │       │   ├── helpers.ts
│   │       │   ├── types.ts
│   │       │   └── components/
│   │       │       ├── profile-selector/index.tsx
│   │       │       └── run-row/index.tsx
│   │       └── source-badge/index.tsx
│   ├── proxies/
│   │   ├── index.tsx                                 # 372 → 174
│   │   ├── translations.ts
│   │   ├── helpers.ts
│   │   └── components/
│   │       ├── delete-proxy-dialog/index.tsx
│   │       ├── proxies-table/index.tsx
│   │       └── proxies-toolbar/index.tsx
│   └── settings/index.tsx
└── lib/
    ├── fingerprint-mode-labels.ts                    # 重命名 kebab-case
    ├── format.ts                                     # 新:targetOsLabel/activeKernelLabel/...
    ├── i18n.ts
    ├── locale.ts                                     # 新:Locale / ThemePref 类型
    ├── monaco-setup.ts                               # 重命名
    ├── script-typings.ts                             # 重命名
    ├── translations.ts                               # 新:全局 i18n 字典
    └── utils.ts
```

### 2.5 ScriptRunPanel UI 优化

之前 Run 按钮埋在 chip 流末尾,profile 多了会被挤到第二行。本轮:

- Run 按钮移到 panel header 右上,**固定位置**不会被推走
- header 加"已选 N 个 / 未选择"摘要
- chip 上**直接显示代理 host:port**,不用 hover

### 2.6 AGENT.md 重写

升级反映新结构 + 反检测策略约束 + 应用关闭新行为 + 命名规范条目。

## 3. 这一轮**没做**的事(下一轮候选)

按优先级:

### Phase B Step 1 — 继续拆 ProfilesView (395 行)

`src/views/profiles/index.tsx` 一个文件包含工具栏 + 选区栏 + 表格 + 7 列模板。可拆:

- `views/profiles/components/profiles-toolbar/`
- `views/profiles/components/profiles-table/`
- `views/profiles/components/selection-bar/`

完成后 `index.tsx` 应该 ~150 行。

### Phase B Step 2 — 抽 hooks

`src/App.tsx` 仍 566 行。建议抽:

- `src/hooks/use-app-data.ts` —— profiles/plugins/proxies/scripts/activeRuns 加载 + 3秒
  轮询 + crash 订阅 + activeRuns 订阅。这一坨现在散在 App.tsx 5 个 useEffect 里
- `src/hooks/use-theme.ts`
- `src/hooks/use-locale.ts`

完成后 App.tsx 应该 ~250 行。

### Phase B Step 3 — 清理 deprecated

- `BrowserProfile.proxy` (deprecated, Phase 1c 之后真源是 proxyId)
- `ProfileDraft.proxy` (deprecated)
- `electron/fingerprint.ts::alignUserAgentWithKernel` (已标 deprecated 但实现还在)
- `electron/types.ts` 注释里更新"proxy 是镜像而不是真源"的语义

注意:**删 inline proxy 字段会触动持久化层**,需要小心 schema 兼容。新机器接手时如果
旧 profiles.json 有 inline proxy 数据,migration 已经会写 proxyId,所以可以放心删,
但要逐一检查所有 reader。

### Phase B Step 4 — docs/specs 旧路径引用

`docs/specs/handoff-2026-05-18.md` / `scripting-handoff.md` / `anti-detection.md` 里
还有 `ScriptEditor.tsx` / `monacoSetup.ts` / `scriptTypings.ts` 这种 PascalCase 路径
引用。本轮没改(改文档不影响代码,但读起来误导)。

### 不打算做(已讨论)

- ScriptsView 内部 ProfileSelector / RunRow 已抽完 ✅
- 第三方 keepalive 包(自家 39 行 KeepAlive 够用) ❌
- antd / MUI 等组件库 ❌

## 4. 关键事实(用户拍板过的)

1. **目录命名 = kebab-case**(用户强调)
2. **业务组件全部目录化**(`<name>/index.tsx`),shadcn ui 是唯一例外
3. **export default + export const 都接受**;路由组件常用 default,其它命名导出
4. **保留自家 KeepAlive**,不引第三方
5. **历史 profile 数据可丢**(用户说"都是测试数据")
6. **应用关闭 = 浏览器关闭**(产品决策,不再让浏览器存活)

## 5. 用户在另一台机器上手做的事

```bash
git pull origin main
pnpm install                      # 装 react-router-dom@7
pnpm run build                    # 验证全绿
pnpm run dev                      # 跑起来
```

打开后**新建一个 profile** (旧 profile 数据可以保留,但建议清掉 .browsers 缓存
避免内核版本号陈旧),验证:

- [ ] 路由切换正常(URL hash 变化,KeepAlive 保持状态)
- [ ] 关闭应用时所有浏览器进程一并关闭(`ps aux | grep chrome` 验证)
- [ ] Profiles 视图工具条/表格/dialog 都正常
- [ ] Scripts 视图编辑器加载 + 运行面板正常
- [ ] Proxies 视图列表/新增/测试都正常
- [ ] Turnstile 测试页 (https://browser-compat.turnstile.workers.dev/) 仍 success

## 6. 工作约定(沿用)

- 中文回复
- 代码注释中英可混,"为什么"优先用中文
- 每次代码改动后 `pnpm run build`(或至少 `tsc -p tsconfig.electron.json --noEmit`)必须绿
- 同思路连失败两次 → 停下来根因分析
- 反检测体系真源:`docs/specs/anti-detection.md` 与 AGENT.md 第 4 节,改任何反检测代码
  前必须先读
- **所有 src/ 新增组件必须按 kebab-case 目录化**;违反规范的代码遇到即修

## 7. 关键文件速查

| 关注点 | 文件 |
| --- | --- |
| 路由编排 | `src/main.tsx` (HashRouter) + `src/App.tsx` |
| 顶部 header | `src/components/app-header/index.tsx` |
| 反检测三轨 | `docs/specs/anti-detection.md` + `electron/stealth/index.ts` |
| 浏览器启动参数 | `electron/kernel.ts` `buildLaunchArgs` |
| 应用退出清理 | `electron/main.ts` `terminateAllProfileBrowsers` |
| ProxyStore 真源 | `electron/proxies/store.ts` + `electron/proxies/migration.ts` |
| 上一份 handoff | `docs/specs/handoff-2026-05-25.md` |

## 8. 一次性命令

```bash
# 类型检查
npx tsc -p tsconfig.electron.json --noEmit
npx tsc -p tsconfig.json --noEmit

# 跑应用
pnpm dev

# 全量构建
pnpm run build

# 看哪些文件偏长(目录化后大部分应该 < 250 行)
find src -name 'index.tsx' -o -name 'index.ts' | xargs wc -l 2>/dev/null | sort -rn | head -20
```
