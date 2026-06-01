# STATUS

- slug: 2026-06-fix-x64-build
- module: kernel
- type: fix
- status: ready-to-ship
- branch: change/kernel/2026-06-fix-x64-build
- created-at: 2026-06-01
- last-updated: 2026-06-01

## Log

- 2026-06-01 | created (status=draft) | hotfix for x64 mac build failure; identified root cause via DEBUG=electron-builder
- 2026-06-01 | approved | small-change path
- 2026-06-01 | in-progress | T-01 清 cache + T-02 重 build
- 2026-06-01 | Failed Attempt 1 | 自动重下仍损坏（网络问题），curl 手动下载 + SHA 校验后修复
- 2026-06-01 | testing → ready-to-ship | TT-01, TT-02 pass; x64 + arm64 双架构 build 成功

## State Machine

draft → approved → designed → in-progress → testing → ready-to-ship → shipped → archived

## Continue From

merge to main，tag v0.1.4，CHANGELOG，归档。安装包已构建好（4 个产物 VALID）。
