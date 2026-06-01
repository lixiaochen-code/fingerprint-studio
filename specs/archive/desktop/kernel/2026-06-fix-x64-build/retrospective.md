# Retrospective: 2026-06-fix-x64-build

## 1. What Went Well

- **DEBUG=electron-builder 快速定位**：一上来用 DEBUG 跑，直接看到 `unpack-electron` x64 步骤的 `flate: corrupt input`，省了瞎猜
- **SHA256 校验确诊**：用官方 SHASUMS256.txt 对比实际下载文件的 sha，铁证 zip 损坏，而不是 binary 架构兼容性问题
- **curl + 校验的修复彻底**：手动下载到正确 SHA 后一次 build 成功，4 产物全 VALID
- **hotfix 走完整流程**：虽是 fix，但 proposal/design(并入)/tasks/test-plan/release-notes/retrospective 全产物到位，归档到正确模块 desktop/kernel

## 2. What Went Wrong

- **proposal 初判 root cause 不够准**：proposal §3 写"删缓存重下即可"，但实际 electron-builder 自动重下的 zip 仍损坏（弱网），不得不升级到"curl 手动下载 + SHA 校验"。这是 Failed Attempt 1，已留痕
- **stray 文件混入**：本 change 第一个 release commit 意外带进一个 `specs/changes/2026-05-bootstrap-process/tasks.md`（早期中间状态遗留副本）。用单独 chore commit 清掉。根因：早先 session 在 mv 到 archive 前有副本残留在 changes/，一直没被发现
- **网络不稳定贯穿**：多次 git push HTTP2 framing error、electron 下载损坏，都是同一弱网根因。拖慢了整体节奏

## 3. What to Improve Next Time

- **build 文档加 electron cache fallback**：记录"弱网下 electron-builder 自动下载可能损坏，fallback 用 curl + shasum 校验手动填 cache"
- **归档后扫一遍 specs/changes/**：确认没有 stray 残留（可做成 process validator 的一条检查）
- **考虑配置 ELECTRON_MIRROR 或 electron 下载重试**：减少弱网下的下载损坏概率

## 4. Process Feedback

- ✅ fix 类型 change 归到具体业务模块（desktop/kernel）而非 _cross，合理——因为它是 build infra 相关，最接近 kernel（内核下载/打包）
- ✅ Failed Attempts 留痕机制再次发挥价值：完整记录了"删缓存→自动重下仍坏→curl 手动修"的全过程
- ⚠️ 05-release §5 仍没有"部分 arch build 失败"的细则；本次是全修好了所以没触发，但规范缺口仍在（migrate-legacy-docs retrospective 已提过）
- ⚠️ specs/changes/ stray 文件问题暴露了"归档动作的完整性"没有自动校验

## 5. Stats

- 计划 task 数：4 (2T + 2TT)
- 实际 task 数：4 + 1 chore（清 stray）
- 实际用时：约 1 小时（含 2 次失败 build + 1 次 2 分钟 curl 下载 + 跨 session）
- TT 通过率：100% (2/2)
- Failed Attempts：1（自动重下仍损坏）
- Commits：3 个（release + chore + 本归档相关）
- 产物：4 个 mac 安装包（arm64 + x64 各 dmg/zip），全 VALID

## 6. Tracking for Next Change

- 可选 `2026-MM-build-resilience`：electron cache 下载健壮性（ELECTRON_MIRROR / 重试 / 自动 SHA 校验）
- 可选 `2026-MM-process-validators`：累积的流程校验需求（Continue From 与 git log 一致性、specs/changes/ stray 检测、commit 格式校验）——已经是第三次 retrospective 提到，建议尽快做
