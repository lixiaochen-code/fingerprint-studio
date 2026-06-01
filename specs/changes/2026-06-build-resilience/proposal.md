# Proposal: 构建健壮性 — electron 缓存自动校验与修复

## 1. Intent

`2026-06-fix-x64-build`（v0.1.4）暴露的根因：弱网下 electron-builder 自动下载的 electron zip 经常损坏（SHA256 不匹配），导致 `pnpm dist:mac` 在 unpack-electron 阶段报 `flate: corrupt input`。当时靠手动 `curl + shasum` 修复。本 change 把这个修复**自动化、前置化**，让弱网不再阻塞 build。

## 2. Scope

**做**：
- 新增 `scripts/verify-electron-cache.mjs`（零依赖）：
  - 解析 electron cache 目录的 `SHASUMS256.txt`
  - 对存在的 `electron-v<ver>-<platform>-<arch>.zip` 校验 SHA256
  - 损坏的删除（让 electron-builder 重新下载），并打印告警
  - 可选 `--redownload`：删除后用 curl 主动重下并复校验
- 新增 `dist:check` script 跑校验
- 修改 `dist:mac` / `dist:win` / `dist:linux` / `dist:all` 在 build 前先跑校验（`dist:check &&`）
- 文档：PROJECT_GUIDE.md 的"做事后必验"或常用命令处记一条 + fix-x64-build 经验沉淀

**不做**：
- 不引入第三方依赖
- 不改 electron / electron-builder 版本
- 不强制配置 ELECTRON_MIRROR（仅文档建议）
- 不改业务代码
- 不重新发版应用安装包（纯 build 工具增强）

## 3. Approach

cache 路径解析（跨平台）：
- `process.env.ELECTRON_CACHE` 优先
- 否则按平台默认：
  - darwin: `~/Library/Caches/electron`
  - linux: `~/.cache/electron`
  - win32: `%LOCALAPPDATA%/electron/Cache`

校验逻辑：
1. 读 `<cache>/SHASUMS256.txt`，建 `filename → expectedSha` map
2. 遍历 cache 下所有 `electron-v*-*.zip`
3. 对每个：算 `crypto.createHash('sha256')` 流式读取 → 比对
4. 不匹配 → 删文件（默认）或 `--redownload`（curl 重下 + 复校）
5. 报告 + exit code

`dist:check` 默认只校验 + 删坏文件（让 electron-builder 重下，但重下仍可能坏）。`--redownload` 模式更强（curl 重下到正确 SHA），适合已知弱网时手动用。

## 4. Affected Scopes

| 范围 | 影响 |
|---|---|
| 端 | desktop |
| 模块 | kernel（build / 内核下载相关）|
| 代码 | 新增 scripts/verify-electron-cache.mjs；改 package.json dist 脚本 |
| 应用二进制 | 无变化 |

## 5. Requirements

### Requirement: 校验 electron cache SHA

#### Scenario: 完好的 cache
- GIVEN cache 中所有 electron zip 的 SHA 与 SHASUMS256.txt 匹配
- WHEN 跑 `pnpm run dist:check`
- THEN 报告全部 OK，exit 0

#### Scenario: 损坏的 cache（默认删除）
- GIVEN cache 中某个 electron zip SHA 不匹配
- WHEN 跑 `pnpm run dist:check`
- THEN 删除该损坏文件，打印告警说明已删（electron-builder 后续会重下）
- AND exit 0（删除后视为已处置，不阻塞）

#### Scenario: --redownload 主动重下
- GIVEN cache 某 zip 损坏
- WHEN 跑 `node scripts/verify-electron-cache.mjs --redownload`
- THEN 删除损坏文件 → curl 从 GitHub releases 重下 → 复校 SHA
- AND 复校通过则 exit 0；仍失败 exit 1

### Requirement: dist 脚本前置校验

#### Scenario: dist:mac 自动校验
- GIVEN package.json 的 dist:mac 改为 `pnpm run dist:check && pnpm run build && electron-builder --mac`
- WHEN 跑 dist:mac
- THEN 先校验 cache（删坏文件）再 build
- AND 弱网导致的损坏 cache 被提前清理

### Requirement: 无 cache / 无 SHASUMS 时优雅降级

#### Scenario: cache 目录不存在
- GIVEN electron 从未下载过（首次 build）
- WHEN 跑 dist:check
- THEN 不报错，打印"no cache yet, skipping"，exit 0（electron-builder 会首次下载）

#### Scenario: 缺 SHASUMS256.txt
- GIVEN cache 有 zip 但无 SHASUMS256.txt
- WHEN 跑 dist:check
- THEN 打印 warning（无法校验），exit 0（不阻塞）

## 6. Constraints

- 零第三方依赖（node 内置 crypto/fs + curl CLI）
- 跨平台 cache 路径解析
- 默认模式只读 + 删坏文件，不主动联网（联网走 --redownload 显式触发）
- 不破坏现有 dist 流程

## 7. Risks

| 风险 | 影响 | 缓解 |
|---|---|---|
| 误删完好文件 | 触发不必要重下 | SHA 比对精确；只删确证不匹配的 |
| curl 不存在（--redownload） | 重下失败 | 检测 curl，无则提示手动处理 |
| SHASUMS 里的版本与 cache zip 版本不符 | 找不到期望 SHA | 按文件名精确匹配；找不到则 warn skip |
| dist:check 拖慢 build | SHA 计算 ~100MB 文件需几秒 | 可接受（几秒 vs build 几分钟）；只校验 electron zip 不校验全部 |

## 8. Out of Scope

- 不配置 ELECTRON_MIRROR（文档建议）
- 不做 CI 集成
- 不校验 chromedriver / ffmpeg 等其他 cache 文件（只校验 electron zip，那是 build 实际用的）
- 不改 electron 版本

## 9. Open Questions

无。方案直接来自 fix-x64-build 的实战修复经验。

## Conversation Log

- 2026-06-01 | initial draft + approved | 用户接受建议"继续做 build-resilience"。方案沉淀自 fix-x64-build retrospective
