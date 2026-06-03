# Release Notes: 2026-06-socks5-auth-proxy

## 1. Version
- version: v0.1.8
- type: patch
- date: 2026-06-03
- platforms: mac / win / linux

## 2. What Changed (User-Facing)
带用户名密码的 SOCKS5 代理现在可用于启动浏览器环境；代理列表测试也会真实校验 SOCKS 协议和认证。

## 3. How to Use
在代理页新增或编辑 SOCKS5 代理，填入 host、port、用户名、密码，保存后点测试；再给环境选择该代理并启动。

## 4. Rollback Plan

```bash
git revert 4405371 06cd3f4 0e04b6b
```

## 5. Known Issues
不支持 SOCKS UDP/BIND，仅支持浏览器网页访问需要的 TCP CONNECT。用户提供的 `us2.cliproxy.io:3010` 当前返回 HTTP 403 而非 SOCKS5 greeting，需要更换有效 SOCKS5 会话/入口或按服务商要求改用 HTTP 代理配置。

## 6. Failed Attempts (失败留痕)
N/A。
