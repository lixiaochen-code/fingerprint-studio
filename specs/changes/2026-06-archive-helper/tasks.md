# Tasks: 2026-06-archive-helper

> Continue From: T-01 not started
> Last updated: 2026-06-01 by initial-author

## Conventions

一个 task 一个 commit，commit message 含 [task: T-NN]。

## T-01 编写 scripts/archive-change.mjs

- status: todo
- commit: 
- files: scripts/archive-change.mjs
- verify: 零依赖；STATUS 解析 + 前置校验 + 状态/Log 改写 + git mv + .gitkeep 清理 + validate 自检；6 类错误场景退出码符合 design §5.6

## T-02 挂 package.json archive script

- status: todo
- commit: 
- files: package.json
- verify: pnpm run archive 可调用；usage 提示存在

## T-03 06-archive 文档更新

- status: todo
- commit: 
- files: docs/process/06-archive.md
- verify: §4 含 `pnpm run archive <slug>` 用法（替代手动 mv 步骤）；新增"元数据笔误可修正"细则；当前手动流程仍保留为应急

## TT-01 错误场景验证

- status: todo
- method: 手工
- linked-requirement: design §5.6 错误退出码表
- verify: 缺 slug / 不存在 / status 不对 / 目标已存在 4 类场景报错且 exit 1，未改任何文件
- executed-at: 
- result: 
- evidence: 

## TT-02 自归档（吃狗粮）

- status: todo
- method: 自动
- linked-requirement: proposal §5 正常归档
- verify: 本 change 自己 ship 后用 pnpm run archive 2026-06-archive-helper 归档；STATUS.status 自动改 archived；目录 git mv 到 specs/archive/_cross/2026-06-archive-helper/；validate 0 error
- executed-at: 
- result: 
- evidence: 

## TT-03 validate + build green

- status: todo
- method: 自动
- verify: pnpm run validate:specs 0 error；pnpm run build exit 0
- executed-at: 
- result: 
- evidence: 
