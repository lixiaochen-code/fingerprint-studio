# Retrospective: 2026-06-socks5-auth-proxy

## 1. What Went Well
先用 curl 和最小 Chromium 探针把外部代理、Chromium 行为、项目代码路径分开验证，避免直接误判为前端问题。修复没有新增依赖，并补了可重复执行的本地 SOCKS 隧道验证脚本。

## 2. What Went Wrong
最初 curl 曾短暂返回成功，后续重复验证显示上游返回 HTTP 403 而非 SOCKS greeting；这说明用户提供的短会话代理本身状态会变化。当前代码修复了真实认证 SOCKS 的浏览器路径，但这条具体代理仍需要服务商侧有效 SOCKS5 会话或正确协议入口。

## 3. What to Improve Next Time
类似代理问题应第一时间记录原始协议首包和 curl verbose 输出，并把“协议不匹配/白名单拒绝/会话过期”作为代理测试的一等错误提示。

## 4. Process Feedback (可选)
本次是诊断型 hotfix，严格 release 流程中的 GitHub Release/安装包上传依赖本机工具和账号状态；后续可以给内部 hotfix 增加“代码归档但二进制发布待人工上传”的明确分支。

## 5. Stats (可选)
- 计划 task 数 / 实际 task 数：3 / 3
- 计划用时 / 实际用时：N/A / 同日完成
- TT 通过率：3 / 3
- failed attempts 次数：0
