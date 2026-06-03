# Proposal: Fix authenticated SOCKS5 proxy launch

## 1. Intent
用户配置 `socks5://us2.cliproxy.io:3010` 并填入用户名密码后，系统工具验证代理可用，但 Chromium 页面显示无网络。需要判断是代理故障还是代码故障，并修复应用中的真实启动路径。

## 2. Scope
做什么：修复带用户名密码的 SOCKS5 代理在 Chromium 启动后的网络不可用问题，并让代理列表的测试能真实校验 SOCKS5 协议、认证与出口地理信息。

不做什么：不引入新第三方依赖，不改代理存储 schema，不改变 HTTP/HTTPS 代理启动行为，不处理代理服务商白名单或套餐策略。

## 3. Approach
在主进程为带认证的 SOCKS4/SOCKS5 代理创建本机无认证 SOCKS5 转发端口，让 Chromium 连接本机代理，由主进程完成上游 SOCKS 握手与认证。代理测试复用同一套 SOCKS 握手能力，避免 TCP 端口可连造成假阳性。

## 4. Affected Scopes
| 范围 | 影响 |
|---|---|
| 端 | desktop |
| 模块 | proxies, kernel |
| 代码 | 修改主进程代理测试、浏览器启动代理决议，新增主进程本地 SOCKS 转发模块 |

## 5. Requirements

### Requirement: Authenticated SOCKS proxies work in launched browsers
当 profile 选择带用户名密码的 SOCKS5 代理时，启动的 Chromium 页面必须能通过该代理访问 HTTPS 页面。

#### Scenario: Chromium uses authenticated SOCKS5 via local tunnel
- GIVEN 一个已验证可用的 SOCKS5 代理，包含 host、port、username、password
- WHEN 用户启动关联该代理的 profile
- THEN Chromium 访问 `https://ipinfo.io/json` 不应出现 `ERR_SOCKS_CONNECTION_FAILED`
- THEN 出口国家应与代理出口一致

### Requirement: Proxy tests validate SOCKS protocol and auth
代理列表测试必须真实执行 SOCKS 握手，而不是只测试 TCP 端口连通。

#### Scenario: SOCKS5 credentials are checked
- GIVEN 一个 SOCKS5 代理条目
- WHEN 用户点击代理列表测试按钮
- THEN 测试流程执行 SOCKS5 CONNECT 与用户名密码认证
- THEN 认证失败返回 `AUTH`，认证成功记录 latency 与 geo

## 6. Constraints
- 遵守 `docs/CODING_STANDARDS.md`
- 不新增第三方依赖
- 不打印代理密码或完整凭据
- 主进程新增网络转发必须随 profile 停止或浏览器退出清理

## 7. Risks
| 风险 | 影响 | 缓解 |
|---|---|---|
| 本地转发进程泄漏 | 占用端口或保留连接 | 跟随 profile lifecycle stop/exit cleanup |
| SOCKS 协议实现不完整 | 某些边缘代理不兼容 | 实现浏览器场景必需的 CONNECT + IPv4/IPv6/domain |
| 测试依赖公网 | CI/本地网络偶发失败 | 单测覆盖握手，真实代理作为手工验证 |

## 8. Out of Scope
- SOCKS UDP ASSOCIATE / BIND
- 代理自动重试与轮换
- 代理白名单管理
- 新增依赖版 socks-proxy-agent

## 9. Open Questions
N/A。用户已要求先诊断再按规范修复；本次按最小可用修复推进。

## Conversation Log
- 2026-06-03 | initial diagnosis | curl 使用同凭据验证代理可用，出口为 US/New Jersey；最小 Chromium 探针复现 `net::ERR_SOCKS_CONNECTION_FAILED`。
