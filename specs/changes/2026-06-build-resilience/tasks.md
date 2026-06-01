# Tasks: 2026-06-build-resilience

> Continue From: T-03 not started (T-01, T-02 done)
> Last updated: 2026-06-01 by initial-author

## Conventions

一个 task 一个 commit，commit message 含 [task: T-NN]。

## T-01 编写 scripts/verify-electron-cache.mjs

- status: done
- commit: (this commit)
- files: scripts/verify-electron-cache.mjs
- verify: 零依赖；跨平台 cache 路径；SHASUMS 解析；SHA256 流式校验；delete/strict/redownload 三模式；无 cache 优雅 skip。首跑当前仓库 4 个 electron zip 全部校验通过

## T-02 挂 dist:check + 前置到 dist:*

- status: done
- commit: (this commit)
- files: package.json
- verify: dist:check script 存在；dist/dist:mac/win/linux/all 全部前置 `dist:check &&`；pnpm run dist:check 输出全 OK

## T-03 文档沉淀

- status: todo
- commit: 
- files: docs/PROJECT_GUIDE.md
- verify: 记录 electron cache 校验机制 + 弱网 fallback

## TT-01 完好 cache 校验通过

- status: todo
- method: 自动
- linked-requirement: proposal §5 完好 cache
- verify: pnpm run dist:check → 全 OK exit 0
- executed-at: 
- result: 
- evidence: 

## TT-02 损坏检测三模式

- status: todo
- method: 手工
- linked-requirement: proposal §5 损坏场景
- verify: 备份并 truncate 一个 electron zip → 默认模式删除 exit 0 / --strict exit 1 / --redownload 重下修复 exit 0；测试后恢复
- executed-at: 
- result: 
- evidence: 

## TT-03 dist:mac 端到端仍出 4 产物

- status: todo
- method: 自动
- linked-requirement: proposal §5 dist 脚本前置校验
- verify: pnpm dist:mac → dist:check 通过 + 4 产物生成 VALID
- executed-at: 
- result: 
- evidence: 

## TT-04 validate:specs + build green

- status: todo
- method: 自动
- verify: pnpm run validate:specs 0 error；pnpm run build exit 0
- executed-at: 
- result: 
- evidence: 
