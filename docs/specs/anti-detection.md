# 反检测体系 · Spec

> auto-registry 的反检测能力按"三轨独立、各管一层"组织。本文档是这套架构的工程真源,改动代码前请先读。

## 1. 设计目标

让每个 profile 在以下两个场景中都"看起来像真人开的 Chrome":

- **手工浏览场景** — 用户直接在 profile 浏览器里登录 Cloudflare/Akamai/Arkose 防护的站点(典型:ChatGPT)。不应陷入验证循环
- **脚本驱动场景** — 用户脚本通过 puppeteer 自动化操作。不应触发 `Runtime.enable` 等 CDP-level 检测

## 2. 三轨架构

| 轨道 | 解决场景 | 实现层级 | 跨平台 | 当前默认 |
|------|---------|---------|--------|---------|
| **A — Stealth Inject** | 手工浏览 | 浏览器内 JS(MV3 扩展 inject) | macOS / Windows / Linux | ✅ 默认 |
| **B — Rebrowser puppeteer** | 脚本驱动 | Node 侧 CDP 客户端 | 全平台 | ✅ 默认 |
| **C — Cloak / itbrowser** | 平台支持时的最强 | Chromium C++ 源码 patch | Windows / Linux | 可选,Phase 3 暴露 UI |

### 协同与互斥

- **A 与 B 完全正交**,可同时启用 — 同一 profile 既享受浏览器内反检测(A),又享受脚本 CDP 层反检测(B)
- **A 与 C 互斥** — 选 cloak/itbrowser 时不挂 stealth 扩展(内核 patch 已涵盖等价能力,叠加会冲突)
- **B 与 C 兼容** — rebrowser 仅作用于 puppeteer-core,不依赖某个具体 Chromium 构建

### 决策顺序

```
启动 profile
  ├─ main.ts → fingerprintMode()  ← env > SettingsStore(Phase 3) > 'stealth' 默认
  ├─ kernel.ts → selectKernel(profile, mode)
  │   ├ mode='itbrowser' + Windows + 装好     → itbrowser
  │   ├ mode='cloak'    + Win/Linux + 装好    → cloak (源码 patch,不挂扩展)
  │   ├ mode='stealth'  (新默认)               → chromium + Stealth 扩展
  │   ├ mode='extension' (legacy)              → chromium + 旧 inject(回滚通道)
  │   └ mode='off'                             → chromium 裸跑(无注入)
  └─ kernel.ts → buildLaunchArgs() → 挂对应扩展 + CDP flag

脚本 run
  ├─ ensureProfileRunningForScript → 复用上面的流程启浏览器
  ├─ bootstrap.ts 劫持 require('puppeteer-core') → rebrowser-puppeteer-core
  └─ SDK BrowserHandle.connect() ← rebrowser 实现规避 Runtime.enable 探测
```

## 3. A 路线 — Stealth Inject

### 痛点

老 inject(`extension` 模式)用 `Object.defineProperty(Navigator.prototype, 'userAgent', { get: () => value })` 替换 getter。**致命漏洞**:

```js
Object.getOwnPropertyDescriptor(Navigator.prototype, 'userAgent').get.toString()
// 真浏览器返回: "function get userAgent() { [native code] }"
// 老 inject 返回: "() => value"   ← 一行 JS 识破
```

`toDataURL`、`getParameter`、`createAnalyser` 等 hook 同样问题。Cloudflare/Arkose 抓到这个痕迹会反复发验证挑战,这就是 ChatGPT 验证循环的根因。

### 实现

模块组织:[electron/stealth/](../../electron/stealth/),按 patch 拆分。每个 patch 文件 export 一段浏览器侧 JS 字符串,由 [electron/stealth/index.ts](../../electron/stealth/index.ts) 的 `buildStealthInjectScript(toggles)` 按 toggle 拼成最终 inject.js。

| Patch 文件 | 覆盖检测点 |
|-----------|----------|
| `nativeToString.ts` | **基础** — Proxy 包装 `Function.prototype.toString`,维护被 hook 的 fn → 伪造 native string 的 WeakMap;toString 自己的 toString 也返回 native(反元检测)。**必须最先注入**,其他 patch 都依赖它提供的 helper |
| `navigator.ts` | webdriver=false / userAgent / language / languages / platform / hardwareConcurrency / deviceMemory / maxTouchPoints / doNotTrack / plugins(5 个标准 PDF Viewer)/ mimeTypes / Intl 时区 |
| `chromeRuntime.ts` | window.chrome.app / chrome.runtime / chrome.csi / chrome.loadTimes 完整 |
| `permissions.ts` | navigator.permissions.query 与 Notification.permission 联动(Chrome 经典漏洞) |
| `iframe.ts` | iframe contentWindow / contentDocument hook,同步父页 Navigator getter 到子 window |
| `graphics.ts` | WebGL UNMASKED_VENDOR/RENDERER + Canvas toDataURL/getImageData/toBlob 加噪 + Screen + Fonts |
| `audioWebrtc.ts` | AudioContext.createAnalyser 加噪 + RTCPeerConnection class 伪装 |
| `battery.ts` | navigator.getBattery 返回稳定 fake BatteryManager |

### Toggle 与回滚

每个 patch 独立 toggle,默认全开。出问题灰度关掉(例如怀疑 iframe patch 触发更严检测):

```bash
AUTO_REGISTRY_STEALTH_DISABLE=iframe,battery pnpm dev
```

完全回滚到老 inject(快速验证某 stealth patch 是否引起 regression):

```bash
AUTO_REGISTRY_FINGERPRINT_MODE=extension pnpm dev
```

### 验证

| 项 | 方法 | 期望 |
|---|------|------|
| toString 痕迹 | DevTools: `Object.getOwnPropertyDescriptor(Navigator.prototype, 'userAgent').get.toString()` | `"function get userAgent() { [native code] }"` |
| webdriver | `navigator.webdriver` | `false` |
| chrome 完整 | `window.chrome.runtime.OnInstalledReason` | 对象存在,非 undefined |
| plugins | `navigator.plugins.length` | `5` |
| permissions 联动 | `navigator.permissions.query({name:'notifications'}).then(r => r.state)` vs `Notification.permission` | 一致(prompt/granted/denied) |
| iframe 一致 | 创建 iframe,读 `f.contentWindow.navigator.webdriver` | `false` |
| **CreepJS** | https://abrahamjuliot.github.io/creepjs/ | trust score 较 `extension` 模式显著提升,Lies 大幅下降 |
| **ChatGPT 实测** | stealth profile 登录 + 发消息,5 分钟观察 | 不陷入 Cloudflare 验证循环 |
| 真实站点回归 | youtube / amazon / x.com | 正常加载,无 captcha 风暴 |

## 4. B 路线 — Rebrowser puppeteer

### 痛点

`puppeteer-core` 在 `puppeteer.connect()` 之后调用 `Runtime.enable` 命令以获取页面执行上下文。这个命令会在目标页面留下可被 JS 探测的痕迹(典型方法:`console.debug({ get id() { throw 1 } })` 触发 inspector 求值)。

### 实现

`rebrowser-puppeteer-core` 是 puppeteer-core 的 in-place fork,改造 isolated world / Runtime.enable 的调用时机,规避上述探测。API 100% 兼容。

替换点:

| 文件 | 改动 |
|------|------|
| `package.json` | `+ rebrowser-puppeteer-core ^24.x`(与 puppeteer-core 24.x 主版本对齐);**保留** puppeteer-core 作 Monaco 类型源 + 快速回滚通道 |
| [electron/scripts/sdk/browser.ts](../../electron/scripts/sdk/browser.ts) | `import puppeteer from 'rebrowser-puppeteer-core'` |
| [electron/scripts/sdk/types.ts](../../electron/scripts/sdk/types.ts) | `import type { Browser, Page } from 'rebrowser-puppeteer-core'` |
| [electron/scripts/bootstrap.ts](../../electron/scripts/bootstrap.ts) | `installAutoRegistryModule` → `installModuleInterceptions`,合并劫持 `puppeteer-core` / `puppeteer` specifier → rebrowser 路径 |
| [src/lib/script-typings.ts](../../src/lib/script-typings.ts) | 加 `declare module 'rebrowser-puppeteer-core' { export * from 'puppeteer-core' }`,Monaco 对两个 specifier 都有补全 |

### 用户脚本侧无感

用户脚本继续写 `import puppeteer from 'puppeteer-core'`,bootstrap 在子进程 `Module._resolveFilename` 拦截把它路由到 rebrowser 实际路径。Monaco 类型源仍指 puppeteer-core(rebrowser 类型表面一致)。

### 拦截设计要点

- **严格相等**(`===`)匹配 specifier,**不能 startsWith** — 否则会拦截 rebrowser 内部的 `puppeteer-core/lib/cjs/...` 子模块导致递归
- `rebrowserPath` 在 fork 子进程一启动就 `require.resolve('rebrowser-puppeteer-core')` 缓存
- 两类劫持(auto-registry + puppeteer)合并进同一个 `_resolveFilename` 拦截,避免链式 wrap

### 验证

| 项 | 方法 | 期望 |
|---|------|------|
| import 劫持 | 用户脚本 `console.log(require.resolve('puppeteer-core'))` | 路径含 `rebrowser-puppeteer-core` |
| **bot.sannysoft.com** | 脚本 `await page.goto('https://bot.sannysoft.com')` + screenshot | WebDriver(New) / Chrome(New) / Permissions 关键项绿 |
| API 100% 兼容 | 现有脚本无改动直接跑 | 无报错 |
| Monaco 补全 | 编辑器输入 `puppeteer.connect().then(b => b.` | newPage/pages/close 等补全可见 |
| PROFILE_BUSY 不变 | 启脚本 → 同 profile 再启 | 报 PROFILE_BUSY(行为保持) |

## 5. C 路线 — Cloak / itbrowser

**已部分集成**:

- [electron/kernel.ts](../../electron/kernel.ts) `selectKernel` 根据 mode 选择内核
- CloakBrowser:`--fingerprint=<seed>` + `--fingerprint-webrtc-ip=auto` 已在 `buildLaunchArgs` 里
- itbrowser:`--itbrowser=<fingerprint.json>` 已在 `buildLaunchArgs` 里

**未做**:UI 让用户显式切换。Phase 3 落地。

**适用场景**:

- macOS 用户:无可用 C 路线,默认走 A
- Windows 用户:itbrowser > cloak(都装的话默认前者)
- Linux 用户:cloak 是唯一 C 选项

## 6. Settings 持久化(Phase 3,未做)

| 项 | 当前 | Phase 3 |
|----|------|--------|
| `fingerprintMode()` 数据源 | env → 默认 `'stealth'` | env → SettingsStore.read().antiDetectMode → 默认 `'stealth'` |
| Settings UI | 无 | SettingsView 新增 "Anti-detection mode" Section,按 host 灰显 cloak/itbrowser |
| `<userData>/settings.json` | 不存在 | 新建,`writeJsonAtomic + quarantineCorruptFile` |

## 7. 代码地图

```
electron/
├── stealth/                       # A 路线
│   ├── index.ts                   # buildStealthInjectScript + togglesFromEnv
│   └── patches/
│       ├── nativeToString.ts      # toString proxy + helper(基础,必先注入)
│       ├── navigator.ts           # navigator.* / plugins / Intl
│       ├── chromeRuntime.ts       # window.chrome.* 完整
│       ├── permissions.ts         # permissions/Notification 一致
│       ├── iframe.ts              # iframe contentWindow hook
│       ├── graphics.ts            # WebGL + Canvas + Screen + Fonts
│       ├── audioWebrtc.ts         # Audio + WebRTC
│       └── battery.ts             # fake BatteryManager
├── fingerprint.ts                 # ensureFingerprintExtension(profile, mode)
│                                  # mode='stealth' → 拼 stealth patches
│                                  # mode='extension' → LEGACY_INJECT(回滚通道)
├── kernel.ts                      # selectKernel(profile, mode):三轨择路
├── main.ts                        # fingerprintMode() + 透传到 selectKernel
├── scripts/
│   ├── sdk/
│   │   ├── browser.ts             # B 路线:import rebrowser-puppeteer-core
│   │   └── types.ts               # 同上
│   └── bootstrap.ts               # installModuleInterceptions(auto-registry + puppeteer-core)
└── types.ts                       # FingerprintMode 加 'stealth'

src/
├── lib/
│   ├── fingerprint-mode-labels.ts # 5 个 mode × en/zh 的单一 i18n 源
│   └── script-typings.ts          # Monaco 类型:declare module 'rebrowser-puppeteer-core'
├── components/
│   └── app-header/index.tsx       # Header tooltip 引用 fingerprint-mode-labels
└── views/
    └── profiles/components/fingerprint-badge/index.tsx  # 同上
```

## 8. 已知风险与未来改进

### A 路线

- **toString-proxy 元检测**:站点反查 `toString.toString()` — 已防(toString 自己也在 nativeMap)。但更深层的反射元检测(如 `Reflect.getPrototypeOf(toString)`)未防,需要时再加
- **过度伪装反触发更严**:某些反检测产品(如 Imperva)看到 100% 完美的 fingerprint 反而拉黑。预留 `AUTO_REGISTRY_STEALTH_DISABLE` 让 QA 二分定位
- **Cross-origin iframe**:`content_scripts all_frames: true` 已覆盖 iframe 内注入;父页 hook 只是双保险
- **CDP 端口扫描**:页面 JS 可 `fetch('http://127.0.0.1:[port]/json')` 探测。当前已绑 127.0.0.1,端口随机化(`--remote-debugging-port=0`)。未来若进一步收紧可改 unix domain socket(macOS/Linux only)

### B 路线

- **版本滞后**:`rebrowser-puppeteer-core` 偶尔滞后于 `puppeteer-core`。当前装的是 24.8.1,puppeteer-core 24.43.1,主版本对齐,API 兼容
- **REBROWSER_PATCHES_RUNTIME_FIX_MODE**:默认 `addBinding`,若某些用户脚本在 Page 上下文获取失败,可在 bootstrap.ts 设这个 env 调成其他模式

### C 路线

- macOS 无可用 C 内核,长期受限于 CloakBrowser 上游

## 9. 历史决策记录

- **抽出 `electron/stealth/` 目录**:fingerprint.ts 内联 inject 字符串膨胀到 800+ 行不可读;每个 patch 独立 toggle 也方便灰度
- **保留 `'extension'` mode**:legacy inject 留作快速回滚通道,而非删除
- **保留 `puppeteer-core` 不删**:Monaco 类型源 + B 路线的快速回滚
- **bootstrap 拦截 specifier 严格 `===`**:防止递归拦截 rebrowser 内部子模块
- **`--remote-debugging-port=0` 不动**:脚本子系统命脉,127.0.0.1 隔离已足够

## 10. 实现里程碑

- **Phase 1**(完成):Stealth Inject(A 路线)+ legacy 回滚通道
- **Phase 2**(完成):Rebrowser puppeteer(B 路线)
- **Phase 3**(待办):Settings UI + SettingsStore 持久化 + C 路线显式 UI 切换
