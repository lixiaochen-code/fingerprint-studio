# Proposal: Cloud Sync and Admin Console

> 模板使用说明：所有字段必填。无内容的字段填 `N/A` 并附一句话说明为什么不适用。

## 1. Intent

当前应用所有核心资产都在本机：浏览器环境、脚本、代理、设置、插件等只存在当前设备的 `userData/registry-data/` 与 profile 目录中。用户更换设备、重装系统或团队协作时，无法登录账号后恢复工作区，也无法由管理员集中查看与治理用户资产。

本 change 的目标是引入后端账号体系、云端同步能力和后台管理界面，让用户可以在多设备之间同步工作资产，并让具备权限的管理员管理用户、角色、页面/按钮/API 权限，以及查看用户的环境、脚本、代理等数据。

## 2. Scope

本次做：

- 新增 backend 与 shared 契约规划，支持用户登录、会话续期、设备注册、云同步、权限校验、后台管理 API。
- 新增 desktop 登录状态与同步编排规划：本地环境、脚本、代理、设置、插件元数据等可同步到云端；另一台设备登录后可拉取并恢复。
- 明确同步时机：登录后首次拉取、启动后增量拉取、本地变更后防抖上传、手动同步、退出/切换账号前 flush、冲突时用户可选择处理。
- 明确多设备策略：以云端 revision/vector + 设备 ID 做增量同步；不同设备并发修改同一资源时按资源级冲突处理，不静默覆盖。
- 新增后台管理界面规划：用户管理、角色管理、权限管理、用户资产查看；超级管理员拥有最高权限，可新增角色并分配页面、按钮、API 权限。
- 定义权限模型：页面/按钮权限用于 UI 可见性；API 权限用于后端接口访问；按钮/页面可绑定接口，但接口权限本身不依赖按钮/页面。

本次不做：

- 不在 proposal 阶段选定具体后端框架、数据库、队列或部署平台。
- 不直接实现代码、不调整当前 Electron 目录结构、不做 monorepo 物理迁移。
- 不同步 Chromium profile 的完整 user-data 目录、不同步运行中浏览器状态、不同步脚本运行日志。
- 不实现团队共享环境、脚本市场、在线执行脚本或云端浏览器运行。

## 3. Approach

建议按“账号身份 → 同步契约 → 桌面同步引擎 → 后台管理”分阶段落地。

同步对象分为三类：

- 可直接同步：profile 元数据、fingerprint 配置、proxyId 关联、插件启用关系、local 脚本元数据与源码、应用设置。
- 可同步但需保护：代理用户名/密码、插件 zip/文件包、用户自定义敏感设置；云端必须加密存储，日志与管理界面默认脱敏。
- 不同步：Chromium user-data 目录、cookies/localStorage/sessionStorage、外部脚本的本机绝对路径、ScriptRun 历史日志、内核下载缓存、运行态进程状态。

同步时机建议：

- 登录成功：先注册/刷新 deviceId，再从云端拉取用户 workspace 摘要；若本机已有未绑定账号的本地数据，进入“本地已有数据”处理流程。
- 首次绑定账号：默认提示“上传本机数据到云端”或“使用云端覆盖本机”；不自动合并敏感资产。
- 应用启动且已登录：后台增量拉取云端自上次 sync cursor 之后的变更。
- 本地变更后：对 profiles/proxies/scripts/settings/plugins 的写操作打 dirty 标记，短防抖后上传；失败进入待同步队列，恢复网络后重试。
- 手动同步：提供“立即同步”入口，展示上传/下载/冲突数量。
- 退出、切换账号、登出前：尝试 flush 待上传变更；超时则保留本地队列并在下次登录后继续。
- 远端变更通知：若后端支持 WebSocket/SSE，在线设备收到同账号远端变更后增量拉取；否则退化为定时轮询。

多设备策略建议：

- 每个用户资产有稳定 `resourceId`、`updatedAt`、`revision`、`deletedAt`、`deviceId`、`schemaVersion`。
- 不同资源并发修改可自动合并；同一资源同一字段并发修改产生冲突。
- 非敏感字段可采用 last-write-wins 作为默认展示结果，但必须保留冲突记录与“保留本机/保留云端/另存副本”的用户处理入口。
- 删除用 tombstone 同步，避免设备离线期间重新把已删资源上传回来。
- 同步只在账号维度隔离；不同账号登录同一设备时使用独立本地 workspace，避免串号。

后台权限建议：

- 超级管理员内置，不可被普通角色删除或降权。
- Role 拥有 Permission 集合；Permission 分三类：page、button、api。
- 页面/按钮权限控制后台 UI 展示；按钮可绑定一个或多个 API permission，方便配置“看得到且点得动”。
- API permission 是后端鉴权的唯一真源；即使用户绕过前端直接请求接口，只要没有 API permission 就拒绝。
- 后台查看用户资产默认只读；查看敏感字段需要单独 API 权限，并记录审计日志。

## 4. Affected Scopes

| 范围 | 影响 |
|---|---|
| 端 | desktop / backend / shared |
| 模块 | profiles / proxies / scripts / settings / plugins / auth / sync / admin / rbac / _cross |
| 代码 | 当前阶段仅新增 specs draft；后续设计会涉及 Electron IPC、主进程 store、后端服务、管理后台 UI、共享 API/types |

## 5. Requirements

### Requirement: User Login and Device Binding

桌面端必须支持用户登录，并把本设备注册到该用户账号下，后续同步请求都带有账号与设备上下文。

#### Scenario: Login on a fresh device
- GIVEN 用户在一台没有本地 workspace 的设备打开应用
- WHEN 用户登录成功
- THEN 桌面端注册当前 deviceId
- THEN 桌面端拉取云端 workspace 摘要
- THEN 本地恢复该用户有权限同步的环境、脚本、代理、设置、插件元数据

#### Scenario: Login with existing local data
- GIVEN 用户在已有本地环境、脚本、代理的设备上首次登录
- WHEN 登录成功且本地数据未绑定任何账号
- THEN 应用提示用户选择“上传本机数据到云端”“使用云端覆盖本机”或“先保持本机不合并”
- THEN 应用不得静默覆盖本地或云端数据

### Requirement: Cloud Sync for Local Workspace Assets

用户的环境、脚本、代理、设置、插件等可同步资产必须能上传到云端，并在另一台设备登录后同步下来。

#### Scenario: Upload local changes after editing a profile
- GIVEN 用户已登录且本地有一个 profile
- WHEN 用户编辑 profile 名称、指纹配置、代理引用或插件启用关系
- THEN 本地立即保存成功
- THEN 同步引擎标记该 profile dirty
- THEN 应用在防抖窗口后上传 profile 变更
- THEN 云端保存新的 revision 并返回同步结果

#### Scenario: Download remote changes after another device edits a script
- GIVEN 设备 A 与设备 B 登录同一账号
- AND 设备 A 修改了一个 local script 的源码并成功上传
- WHEN 设备 B 收到远端变更通知或执行增量拉取
- THEN 设备 B 拉取该 script 的最新 revision
- THEN 本地 script 源码更新
- THEN UI 展示该 script 已同步

### Requirement: Sync Conflict Handling

多设备同时修改同一资源时，系统必须检测冲突，并提供可理解的处理方式。

#### Scenario: Same proxy edited on two devices while offline
- GIVEN 设备 A 与设备 B 都有同一个 proxy revision
- AND 两台设备离线期间都修改了该 proxy 的 host 或 password
- WHEN 两台设备恢复网络并上传
- THEN 后上传的一方收到冲突结果
- THEN 本地保留未上传版本
- THEN 用户可选择保留本机、保留云端或另存为新代理

#### Scenario: Deleted profile does not reappear from an offline device
- GIVEN 设备 A 删除了一个 profile 并同步 tombstone
- AND 设备 B 离线期间仍保留旧 profile
- WHEN 设备 B 恢复网络并同步
- THEN 云端 tombstone 优先于旧 revision
- THEN 设备 B 不得重新创建该 profile

### Requirement: Secure Handling of Sensitive Assets

代理凭证、插件包、敏感设置等数据必须被保护，后台展示默认脱敏。

#### Scenario: Admin views user proxies
- GIVEN 管理员拥有查看用户代理列表的权限
- WHEN 管理员打开某用户的代理列表
- THEN 后台展示代理名称、协议、host、port、最近同步时间
- THEN username/password 默认脱敏
- THEN 若管理员没有敏感字段查看 API 权限，接口不得返回明文凭证

### Requirement: Admin Console User Management

后台管理界面必须支持有权限的管理员管理用户，并查看用户资产摘要。

#### Scenario: Super admin disables a user
- GIVEN 当前操作者是超级管理员
- WHEN 超级管理员禁用某个用户
- THEN 该用户后续登录失败或现有会话在刷新时失效
- THEN 后台记录审计日志

#### Scenario: Admin views user workspace assets
- GIVEN 管理员拥有用户资产查看权限
- WHEN 管理员打开用户详情
- THEN 后台展示该用户的环境、脚本、代理、设置、插件摘要
- THEN 不具备对应资源 API 权限的模块不显示数据

### Requirement: Role and Permission Management

超级管理员必须能新增角色并分配页面、按钮、API 权限；后端接口只按 API 权限鉴权。

#### Scenario: Create a role with page and button permissions
- GIVEN 当前操作者是超级管理员
- WHEN 超级管理员新增“客服管理员”角色
- AND 分配用户列表页面、用户详情页面、禁用用户按钮
- AND 给禁用用户按钮绑定 `admin:user:disable` API permission
- THEN 拥有该角色的用户能看到页面和按钮
- THEN 点击按钮时后端仍按 `admin:user:disable` API permission 鉴权

#### Scenario: API access is independent from button/page
- GIVEN 某管理员没有 `admin:proxy:read` API permission
- WHEN 该管理员绕过页面直接请求用户代理接口
- THEN 后端返回无权限
- THEN 该判断不依赖管理员是否拥有任何页面或按钮权限

## 6. Constraints

- 必须遵守现有流程：本 change 先停留在 draft，用户明确说 approved 后才能进入 design。
- 新增第三方依赖、后端框架、数据库、部署平台前必须在 design 阶段列出备选并取得用户认可。
- 渲染进程不得直接请求公网后端；desktop 网络请求仍需经主进程 IPC 或未来受控的 preload API。
- 不同步完整 Chromium user-data 目录，避免 cookie/session、浏览器缓存、指纹痕迹跨设备污染。
- 敏感字段不得写入日志，不得在后台默认明文展示。
- API 权限必须在后端强制校验，前端页面/按钮权限只用于体验和可见性。
- 同步协议必须包含 schemaVersion，以便后续桌面端和后端独立升级。

## 7. Risks

| 风险 | 影响 | 缓解 |
|---|---|---|
| 同步范围过大导致隐私或指纹污染 | 可能把 cookies/session/浏览器状态跨设备复制，引发账号风险 | 明确不同步 Chromium user-data，仅同步业务配置与用户脚本 |
| 多设备冲突处理复杂 | 用户可能丢数据或看到反复回滚 | revision + tombstone + 冲突队列；默认不静默覆盖 |
| 代理凭证与脚本源码敏感 | 云端与后台泄露风险高 | 加密存储、传输 HTTPS、后台脱敏、敏感查看单独授权与审计 |
| 后端权限只做前端控制 | 用户可绕过 UI 直接调用接口 | API permission 在后端作为唯一鉴权真源 |
| 一次性范围过大 | 设计与实现周期过长 | 后续 tasks 按 auth、sync core、desktop integration、admin/RBAC 分阶段拆 |

## 8. Out of Scope

- 团队/组织级共享 workspace。
- 云端运行浏览器、云端执行脚本、远程控制另一台设备。
- 同步浏览器 cookies、localStorage、sessionStorage、缓存、历史记录、登录态。
- 插件市场、脚本市场、模板市场。
- 第三方 OAuth/SSO；若需要，另开 change。
- 计费、套餐、用量限制。
- 后端部署、监控、备份、灾备的最终生产方案；本 change 可在 design 阶段提出最低要求。

## 9. Open Questions

### Q1: 首次登录且本机已有本地数据时，默认动作是什么？
- 选项 A: 默认引导上传本机数据到云端，但必须用户确认。
- 选项 B: 默认拉取云端覆盖本机，但必须用户确认。
- 选项 C: 默认不合并，只登录；用户之后手动选择同步方向。
- 倾向: A，理由: 当前产品以本机为真源，首次引入账号时用户最可能想把既有工作资产带到云端；但不能静默执行。

### Q2: 代理密码、敏感设置等是否允许云端保存明文？
- 选项 A: 不允许；服务端加密保存，后台默认永不返回明文。
- 选项 B: 允许超级管理员通过权限查看明文。
- 倾向: A，理由: 代理凭证是高敏数据，后台治理应以脱敏和重置/覆盖为主；如确实需要明文查看，应单独做高风险权限和审计。

### Q3: local script 源码是否默认同步？
- 选项 A: 默认同步 local script 源码；external script 只同步元数据，不同步外部文件内容。
- 选项 B: 脚本源码默认不同步，仅用户手动勾选。
- 倾向: A，理由: 用户明确提出脚本同步，local script 是应用内资产；external script 可能在任意本机路径，默认同步容易越界。

### Q4: 插件同步到什么粒度？
- 选项 A: 只同步插件元数据和启用关系，另一台设备提示重新上传/安装插件包。
- 选项 B: 同步插件包文件，另一台设备登录后自动恢复插件。
- 倾向: B，理由: 用户期待“插件等同步下来”；但插件包属于较大且有安全风险的资产，design 阶段需要补签名/大小限制/安全扫描。

### Q5: 后台管理是否与用户侧后端共用同一个 Web 服务？
- 选项 A: 共用同一后端服务，通过 admin 路由与 API permission 隔离。
- 选项 B: 拆成独立 admin 服务。
- 倾向: A，理由: MVP 运维简单、权限模型集中；如果后续有高安全隔离要求，再拆服务。

## Conversation Log

> proposal 多轮 Q&A 的关键决策点（OpenSpec 风格的对话纪要）。

- 2026-06-04 | initial draft | 用户提出新增登录后端、云同步、多设备同步、后台管理和角色/页面/按钮/API 权限体系；agent 按跨端 change 起草 draft，并给出同步时机与权限模型建议。
