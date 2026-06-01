# Release Notes: 2026-06-fix-x64-build

## 1. Version

- version: v0.1.4
- type: patch
- date: 2026-06-01
- platforms: mac (arm64 + x64) ← **x64 修复，首次双架构产物**

## 2. What Changed (User-Facing)

- 修复 mac x64 安装包构建失败（v0.1.2 / v0.1.3 仅有 arm64 产物）
- v0.1.4 首次同时提供 Apple Silicon (arm64) 与 Intel (x64) mac 安装包

应用功能无变化。

## 3. How to Use

- Apple Silicon Mac：下载 `Fingerprint Studio-0.1.4-arm64.dmg`
- Intel Mac：下载 `Fingerprint Studio-0.1.4.dmg`

## 4. Rollback Plan

```bash
git tag -d v0.1.4
git push --delete origin v0.1.4
gh release delete v0.1.4 --yes
rm -f release/Fingerprint\ Studio-0.1.4*
```

## 5. Known Issues

无。x64 + arm64 均成功，两个 dmg hdiutil VALID。

## 6. Failed Attempts (失败留痕)

### Failed Attempt 1 (2026-06-01 14:22, 清 cache 后仍失败)

- 现象: 删除损坏的 x64 electron zip 后重跑 dist:mac，electron-builder 自动重新下载的 zip 仍损坏（161MB，`unzip -t` 报错，SHA256 不匹配期望值）
- 根因: 网络不稳定（同 session 多次 git push 也遇 HTTP2 framing error）导致 electron-builder 的自动下载不完整/损坏
- 处置: 改用 `curl -L` 直接从 GitHub releases 下载 `electron-v39.8.9-darwin-x64.zip`（112MB），`shasum -a 256` 校验 = `5a42fa76...` 期望值通过；再跑 dist:mac 一次成功
- 关联 commit: 无（cache 文件在 repo 外）
- 教训: electron-builder 自动下载在弱网下不可靠；可考虑后续在 build 文档里记录"手动 curl + SHA 校验"的 fallback；或配置 ELECTRON_MIRROR
