# Tasks: 2026-06-process-validators

> Continue From: release (bump v0.1.5, no installer rebuild) + archive
> Last updated: 2026-06-01 by initial-author

## Conventions

一个 task 一个 commit，commit message 含 [task: T-NN]。

## T-01 编写 scripts/validate-specs.mjs

- status: done
- commit: (this commit)
- files: scripts/validate-specs.mjs; (顺带修正) specs/archive/desktop/kernel/2026-06-fix-x64-build/STATUS.md status 字段笔误
- verify: 零第三方 import；含 STATUS 解析 + 6 类检查 + error/warning 报告 + exit code；首跑即抓到 fix-x64-build 归档时 status 字段没改成 archived 的真 bug（已修正）

## T-02 挂 package.json validate:specs script

- status: done
- commit: (this commit)
- files: package.json
- verify: `pnpm run validate:specs` 可调用，输出 All checks passed

## T-03 流程文档加引用

- status: done
- commit: (this commit)
- files: docs/process/00-overview.md (FAQ), docs/process/03-development.md (退出动作)
- verify: 两处都提到 validate:specs

## TT-01 当前仓库零 error

- status: todo
- method: 自动
- linked-requirement: proposal §5 "全过时清晰反馈"
- verify: pnpm run validate:specs → 0 error, exit 0（7 archive 合规 + legacy 豁免）
- executed-at: 
- result: 
- evidence: 

## TT-02 坏数据正确报错

- status: todo
- method: 手工
- linked-requirement: proposal §5 各 error 场景
- verify: 临时造 changes/_tmp-bad/STATUS.md (status=archived) → validate 报 error exit 1；删除后恢复 0 error
- executed-at: 
- result: 
- evidence: 

## TT-03 build 仍通过

- status: todo
- method: 自动
- verify: pnpm run build exit 0
- executed-at: 
- result: 
- evidence: 
