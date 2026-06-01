# Proposal: 修复 x64 mac build 失败

## 1. Intent

v0.1.2 和 v0.1.3 发版均仅产出 arm64 mac 安装包；x64 build 持续失败。本 change 定位根因并修复，让 v0.1.4 同时产出 arm64 + x64 mac 安装包。

## 2. Scope

**做**：
- 调查 root cause（已完成：electron x64 缓存 zip 损坏）
- 修复（清理损坏缓存，触发重新下载）
- 验证 build 在 arm64 + x64 都成功
- 发版 v0.1.4

**不做**：
- 不升级 electron-builder / electron 主版本
- 不改 build 配置
- 不改业务代码
- 不补 v0.1.2 / v0.1.3 的 x64 产物（那两个 tag 已发，按 release-notes 标 known issue 即可）

## 3. Approach

定位过程：
1. `pnpm dist:mac` 报错 `app-builder_arm64 process failed ERR_ELECTRON_BUILDER_CANNOT_EXECUTE`
2. 用 `DEBUG=electron-builder` 重跑，定位到 `cannot close error=flate: corrupt input before offset 63225541` 发生在 `unpack-electron --configuration [{"platform":"darwin","arch":"x64",...}]` 步骤
3. 检查 `~/Library/Caches/electron/electron-v39.8.9-darwin-x64.zip`（117MB）
4. `unzip -t` 验证 → "At least one error was detected"，**zip 损坏**

修复：
1. 删除损坏的 x64 zip（保留 arm64 zip 和其他平台）
2. 重跑 `pnpm dist:mac`，electron-builder 自动重新下载
3. 验证两个架构产物都生成且 hdiutil VALID

## 4. Affected Scopes

| 范围 | 影响 |
|---|---|
| 端 | desktop |
| 模块 | kernel（最接近 build infra；本仓没有专门的 build 模块）|
| 代码 | 不动业务代码 |
| 缓存 | `~/Library/Caches/electron/` 删一个文件并重下 |

## 5. Requirements

### Requirement: x64 mac build 成功

#### Scenario: 完整 dist:mac
- GIVEN 损坏的 x64 zip 已被清理
- WHEN `pnpm dist:mac`
- THEN exit 0
- AND 产出 4 个文件：`Fingerprint Studio-0.1.4-arm64.dmg`、`-arm64-mac.zip`、`-0.1.4.dmg`(x64)、`-mac.zip`(x64)
- AND 两个 dmg `hdiutil verify` 都 VALID

### Requirement: 不影响 arm64

#### Scenario: arm64 仍然成功
- GIVEN 修复后的 cache
- WHEN dist:mac
- THEN arm64 dmg 与 zip 仍然生成且 VALID
- AND 大小与之前 v0.1.3 同量级（~141 MB zip / ~147 MB dmg）

## 6. Constraints

- 修复方式不引入持久化代码改动（清缓存 + 重 build 是一次性动作）
- 不升级依赖
- 走简化路径（小 change）

## 7. Risks

| 风险 | 影响 | 缓解 |
|---|---|---|
| 重新下载的 x64 zip 仍损坏（CDN / 网络问题） | build 仍失败 | 多试一次；切换 ELECTRON_MIRROR 环境变量 |
| arm64 cache 也悄悄损坏 | arm64 build 也开始失败 | 顺手 unzip -t 验证 arm64 zip |
| `cache` 是用户级 `~/Library/Caches`，删除后影响系统其他 electron 工具 | 不大；只删指定版本 | 仅删 `electron-v39.8.9-darwin-x64.zip`，其他 zip 不动 |

## 8. Out of Scope

- 不修复 v0.1.2 / v0.1.3 的 x64 产物（已是历史 tag）
- 不引入 build cache validation 自动化
- 不改 dist:* scripts
- 不改 electron-builder 配置

## 9. Open Questions

无。根因清晰、修复一行命令、风险低。

## Conversation Log

- 2026-06-01 | initial draft + approved | 用户授权"修复，修复后继续任务"。先做调研定位 root cause，再写 proposal，一气呵成
