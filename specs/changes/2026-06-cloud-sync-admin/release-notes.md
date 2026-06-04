# Release Notes: 2026-06-cloud-sync-admin

## 1. Version
- version: v0.2.0
- type: minor
- date: 2026-06-04
- platforms: mac / win / linux

## 2. What Changed (User-Facing)

- 新增云同步 / 后台管理入口，可登录内置超级管理员。
- 新增本地 workspace 上传、云端下载、双向同步。
- 新增用户、角色、页面/按钮/API 权限管理。
- 后台可查看用户环境、脚本、代理、插件摘要；代理敏感字段按权限控制。

## 3. How to Use

打开顶部“后台”入口，默认超级管理员为 `admin / admin123456`。登录后可执行同步，或管理用户与角色权限。

## 4. Rollback Plan

```bash
git revert <merge-commit>
pnpm run build
```

## 5. Known Issues

- 当前 backend 是主进程内 MVP，支持可选本地 HTTP API；真正线上部署、数据库、TLS、团队组织模型需要后续 change。
- 插件同步当前恢复元数据和启用关系，插件包二进制跨设备搬运留后续生产化实现。

## 6. Failed Attempts (失败留痕)

### Failed Attempt 1 (2026-06-04)
- 现象: `node scripts/cloud-smoke.mjs` 在普通沙箱下报 `listen EPERM 127.0.0.1`
- 根因: 当前执行沙箱禁止本地 HTTP 监听
- 处置: 按权限规则提升后重跑，接口 smoke 通过
- 关联 commit: pending final commit
