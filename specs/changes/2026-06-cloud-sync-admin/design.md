# Design: Cloud Sync and Admin Console

## 1. Overview

本次实现 cloud backend MVP：主进程内默认内置 cloud 服务，同时提供可独立运行的 HTTP 后端；桌面端可通过 `AUTO_REGISTRY_CLOUD_BASE_URL` 指向线上后端。能力覆盖账号登录、会话、同步快照、后台用户/角色/权限管理与 API 权限校验；渲染层新增登录与后台管理页面；shared 契约先落在 `electron/types.ts`，后续可迁移到真正 shared package。

## 2. Final Directory Layout

```text
electron/cloud/
├── service.ts       # auth / sync / admin / RBAC 领域服务
├── httpServer.ts    # 可选本地 HTTP 接口，便于接口自测与未来拆后端
├── client.ts        # 桌面端访问远端 cloud backend 的 HTTP client
└── types.ts         # cloud 内部持久化类型
src/views/cloud-admin/index.tsx
scripts/cloud-smoke.mjs
scripts/cloud-server.mjs
```

## 3. Data / API Changes

- 新增 `electron/types.ts` 中 Cloud/Auth/Admin/RBAC 类型。
- 新增 IPC：
  - `cloud:session`
  - `cloud:login`
  - `cloud:logout`
  - `cloud:syncNow`
  - `cloud:users:list`
  - `cloud:users:save`
  - `cloud:roles:list`
  - `cloud:roles:save`
  - `cloud:permissions:list`
  - `cloud:assets:get`
- 新增可选内置 HTTP backend：`AUTO_REGISTRY_CLOUD_HTTP=1` 时启动，默认 localhost，端口 `AUTO_REGISTRY_CLOUD_PORT` 或 0。
- 新增独立后端命令：`pnpm run cloud:server`。
- 新增远端配置：桌面端设置 `AUTO_REGISTRY_CLOUD_BASE_URL=<cloud-server-url>` 后，登录、同步、后台接口走远端后端。

## 4. Module Interactions

```text
Renderer CloudAdminView
  -> preload window.registry.cloud.*
  -> ipcMain cloud:* handlers
  -> CloudBackend (CloudService | CloudRemoteClient)
  -> ProfileStore / ProxyStore / ScriptStore
  -> registry-data/cloud.json
```

## 5. Detailed Design

### 5.1 Auth

内置超级管理员 `admin/admin123456`。密码用 Node crypto `scryptSync` 加盐哈希。登录成功生成 session token，token 保存在 cloud store 内，桌面端通过 IPC 持有。

### 5.2 Sync

`syncNow(direction)` 支持：

- `upload`: 读取本地 profiles/proxies/scripts/plugins 快照，写入当前用户云端 workspace。
- `download`: 将当前用户云端 workspace 应用回本地。
- `bidirectional`: 若云端为空则上传，否则先下载再上传当前快照。

MVP 以资源级 revision 做覆盖，冲突记录保留在返回结构；完整字段级冲突后续扩展。

### 5.3 RBAC

Permission 分 `page` / `button` / `api`。页面/按钮用于 UI 展示，API permission 在 CloudService 每个 admin 方法入口强制校验。超级管理员绕过权限集。

### 5.4 Admin

后台页面提供登录卡片、同步面板、用户列表、角色列表、权限矩阵、用户资产查看。敏感代理密码在 UI 和 admin API 中脱敏。

## 6. Alternatives Considered

- 直接引入 Express/Nest：暂不选，新增依赖需要额外确认，且当前 MVP 可以用 Node 内置 http。
- 单独 services/backend 包：暂不选，当前仓库尚未 monorepo 物理重构；先把领域服务写成可迁移模块。

## 7. ADR Triggers

N/A：本次仍是 MVP 实现；真正选择生产后端框架、数据库和部署模型时需要 ADR。

## 8. Cross-stack Considerations

desktop 通过 IPC 调 cloud 服务；backend 能力先以主进程内服务和可选 HTTP server 表达；shared 契约暂放 `electron/types.ts`，后续迁移到 `specs/baseline/shared` 对应 package。

## 9. Risks & Mitigations

| 风险 | 影响 | 缓解 |
|---|---|---|
| MVP 后端非真正线上服务 | 多设备跨网络同步仍需部署化 | 服务模块隔离，后续可搬到独立 backend |
| 同步覆盖过粗 | 并发修改同一资源可能体验不足 | 返回 conflicts，后续细化字段级冲突 |
| 内置默认密码 | 生产不安全 | UI 明示默认账号，后续强制改密 |

## 10. Out of Scope (Design Layer)

- 域名、TLS、数据库集群与运维监控。
- 插件 zip 二进制跨设备搬运。
- cookie/session/user-data 同步。

## 11. Validation Strategy

- `pnpm run validate:specs`
- `pnpm run build`
- `node scripts/cloud-smoke.mjs` 验证 HTTP 登录、权限拒绝、管理员接口、同步接口，以及两台设备经同一后端上传/下载。

## 12. Acceptance Criteria

- [ ] 桌面端能登录超级管理员。
- [ ] 能上传/下载本地 workspace 快照。
- [ ] 后台能管理用户、角色、权限。
- [ ] 无 API 权限时后端拒绝接口。
- [ ] 管理员查看代理密码时默认脱敏。
