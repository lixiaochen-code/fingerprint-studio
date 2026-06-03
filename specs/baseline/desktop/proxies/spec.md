# Baseline: desktop/proxies

> 真理之源：proxies 子系统当前的能力。新 change 通过 delta 修改本文档。

## Current Capabilities

### Requirement: Proxy Store

代理条目由 ProxyStore 统一持久化，并可被多个 profile 通过 `proxyId` 复用。

#### Scenario: Manage reusable proxy entries
- GIVEN 用户在代理页新增、编辑、删除或批量导入代理
- WHEN 主进程收到 `proxies:*` IPC 请求
- THEN 代理配置写入 `<userData>/registry-data/proxies.json`
- THEN profile 只保存 `proxyId` 引用，不复制 inline proxy 配置

### Requirement: Proxy Connectivity Test

代理列表测试必须按协议验证代理是否能用于浏览器访问，并记录最近一次测试快照。

#### Scenario: Test HTTP or HTTPS proxy
- GIVEN 一个 HTTP/HTTPS 代理条目
- WHEN 用户点击代理测试
- THEN 主进程通过 HTTP CONNECT 验证到 `www.gstatic.com:443` 的通道
- THEN 测通后尝试通过同一代理通道访问 `ipinfo.io` 获取地理信息

#### Scenario: Test SOCKS proxy
- GIVEN 一个 SOCKS4/SOCKS5 代理条目
- WHEN 用户点击代理测试
- THEN 主进程执行真实 SOCKS 握手与 CONNECT，而不是只测试 TCP 端口
- THEN SOCKS5 用户名密码错误、协议不匹配、上游返回 HTTP 响应等情况会返回失败快照

### Requirement: Authenticated SOCKS Browser Launch

带用户名密码的 SOCKS 代理必须能被 Chromium profile 使用。

#### Scenario: Launch profile with authenticated SOCKS proxy
- GIVEN profile 选择了带用户名密码的 SOCKS4/SOCKS5 代理
- WHEN 用户启动该 profile
- THEN 主进程创建本机无认证 SOCKS5 隧道
- THEN Chromium 的 `--proxy-server` 指向本机隧道，由主进程完成上游 SOCKS 认证
- THEN profile 停止、退出或切换代理时，本机隧道会关闭

## Legacy Design Document

> N/A: 本模块没有独立的历史设计文档。
