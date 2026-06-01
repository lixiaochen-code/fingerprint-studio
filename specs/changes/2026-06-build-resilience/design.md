# Design: 构建健壮性 — electron 缓存自动校验与修复

## 1. Overview

零依赖 Node 脚本 `scripts/verify-electron-cache.mjs`，校验 electron cache 里的 zip SHA256，删损坏文件（默认）或 curl 重下（`--redownload`）。挂 `dist:check` 并前置到所有 `dist:*` 脚本。

## 2. Final Directory Layout

```
scripts/
├── validate-specs.mjs          (已有)
└── verify-electron-cache.mjs   ← 新增
package.json                     ← 加 dist:check；dist:* 前置 dist:check
docs/PROJECT_GUIDE.md            ← 记一条
```

## 3. Data / API Changes

N/A。脚本只读 cache 目录 + 可选 curl 下载。

## 4. Module Interactions

```
pnpm run dist:mac
  └─ pnpm run dist:check
       └─ node scripts/verify-electron-cache.mjs
            ├─ resolveCacheDir() → ELECTRON_CACHE | 平台默认
            ├─ parseShasums(<cache>/SHASUMS256.txt)
            ├─ for each electron-v*-*.zip: sha256 流式 → 比对
            ├─ mismatch → unlink (默认) | curl 重下 (--redownload)
            └─ exit code
  └─ pnpm run build
  └─ electron-builder --mac
```

## 5. Detailed Design

### 5.1 cache 路径解析

```js
function resolveCacheDir() {
  if (process.env.ELECTRON_CACHE) return process.env.ELECTRON_CACHE
  const home = os.homedir()
  switch (process.platform) {
    case 'darwin': return join(home, 'Library', 'Caches', 'electron')
    case 'win32':  return join(process.env.LOCALAPPDATA || join(home,'AppData','Local'), 'electron', 'Cache')
    default:       return join(home, '.cache', 'electron')
  }
}
```

### 5.2 SHASUMS 解析

格式：`<sha256> *<filename>`（star 表示二进制模式）。

```js
function parseShasums(text) {
  const map = new Map()
  for (const line of text.split('\n')) {
    const m = line.match(/^([0-9a-f]{64})\s+\*?(.+)$/)
    if (m) map.set(m[2].trim(), m[1])
  }
  return map
}
```

### 5.3 SHA256 流式计算

```js
function sha256(file) {
  return new Promise((resolve, reject) => {
    const h = createHash('sha256')
    const s = createReadStream(file)
    s.on('data', (d) => h.update(d))
    s.on('end', () => resolve(h.digest('hex')))
    s.on('error', reject)
  })
}
```

### 5.4 只校验 electron 主 zip

只校验 `electron-v<ver>-<platform>-<arch>.zip`（build 实际解包的），跳过 chromedriver / ffmpeg / dsym / symbols（dist 不用）。正则：

```js
const ELECTRON_ZIP_RE = /^electron-v[\d.]+-(darwin|linux|win32|mas)-(arm64|x64|ia32|armv7l)\.zip$/
```

### 5.5 redownload

```js
// 从文件名推 URL：electron-v39.8.9-darwin-x64.zip
//  → https://github.com/electron/electron/releases/download/v39.8.9/electron-v39.8.9-darwin-x64.zip
function downloadUrl(filename) {
  const ver = filename.match(/v([\d.]+)/)[1]
  return `https://github.com/electron/electron/releases/download/v${ver}/${filename}`
}
// execSync(`curl -L -o "${dest}" "${url}"`)，下载后复校 SHA
```

### 5.6 退出码与模式

| 模式 | 行为 | exit |
|---|---|---|
| 默认 | 校验 + 删坏文件 | 0（删了视为已处置）|
| `--redownload` | 删 + curl 重下 + 复校 | 复校通过 0；仍坏 1 |
| `--strict` | 校验，坏就报错不删 | 坏 → 1 |
| 无 cache / 无 SHASUMS | 优雅 skip | 0 |

`dist:check` 用默认模式（删坏让 electron-builder 重下，最常见够用）。

## 6. Alternatives Considered

**A. 直接 electron-builder 配置重试**
- electron-builder 没有内建 cache SHA 校验 + 重试的可靠选项
- 不选

**B. 改用 ELECTRON_MIRROR 国内镜像**
- 治标，且引入对特定镜像的依赖；不同网络环境不通用
- 作为文档建议保留，不作为主方案

**C. (选定) 自己写 cache 校验脚本前置**
- 通用、零依赖、可控、可复用 fix-x64-build 已验证的 curl 重下逻辑
- 选定

## 7. ADR Triggers

无。build 工具脚本，不构成长期架构决策。

## 8. Cross-stack Considerations

N/A：仅 desktop build。未来 backend 若用别的打包，不受影响。

## 9. Risks & Mitigations

见 proposal §7。补充：dist:check 失败不应让默认 dist 卡死——默认模式删坏文件后 exit 0，build 继续，electron-builder 重下。只有 --redownload/--strict 才可能 exit 1。

## 10. Out of Scope (Design Layer)

- 不做并发下载
- 不做下载进度条（curl 自带）
- 不缓存校验结果

## 11. Validation Strategy

- 完好 cache 跑 dist:check → 全 OK exit 0
- 故意损坏一个 zip（truncate）→ dist:check 删它 exit 0；--strict 报错 exit 1；--redownload 重下修复 exit 0
- dist:check 接入后 dist:mac 全流程仍能出 4 产物
- validate:specs + build 仍 green

## 12. Acceptance Criteria

- [ ] scripts/verify-electron-cache.mjs 零依赖
- [ ] dist:check script 存在；dist:* 前置 dist:check
- [ ] 完好 cache → exit 0
- [ ] 损坏 zip → 默认删除 exit 0；--strict exit 1；--redownload 修复 exit 0
- [ ] 无 cache 优雅 skip
- [ ] dist:mac 端到端仍出 4 产物
- [ ] pnpm run validate:specs 0 error
- [ ] pnpm run build green
