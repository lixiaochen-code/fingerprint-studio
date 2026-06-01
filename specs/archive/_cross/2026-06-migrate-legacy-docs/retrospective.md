# Retrospective: 2026-06-migrate-legacy-docs

## 1. What Went Well

- **流程在产品 change 上跑得比 bootstrap 顺**：因为 bootstrap-process 已经把规范定下来，本 change 只需照搬走，每阶段产物明确、状态切换无歧义
- **批量授权模式有效**：用户"继续都做完"一句话授权两个连续 change（本 change + 改名 sync），proposal Open Questions 全省，效率高
- **baseline 抽 Current Capabilities + Legacy 摘要的策略可行**：scripts baseline 文件控制在 ~290 行，既保留 OpenSpec 风格又不臃肿；stealth baseline 因为原文档不长，全文内联也只 ~480 行
- **git mv 自动 prune 嵌套目录**：T-05 一开始嵌套两层后用 git mv 扁平化，git 自动清理空中间目录

## 2. What Went Wrong

- **T-05 git mv 目标已存在，产生嵌套**：不应该用 `git mv .kiro/specs/foo specs/archive/desktop/scripts/2026-05-foo` 当目标目录已存在（因为前面 STATUS.md 已写入）。下次应该先 mv 再写 STATUS.md，或先 mv 子目录里的文件再 cleanup
- **mac x64 build 失败**：`app-builder_arm64 process failed ERR_ELECTRON_BUILDER_CANNOT_EXECUTE`。bootstrap-process v0.1.1 已经有 warning（flate corrupt）但 exit 0；本次升级为 exit 1。说明 x64 cross-arch packaging 在 Apple Silicon 主机上有持续问题，需专项排查
- **commit 时机仍偶尔颠倒**：T-04 / T-06 等多个 commit 中，tasks.md 的 status 更新到达 commit 之后，导致那几个 commit 内 task 状态未更新。这次没用 amend 修，而是让"task 状态在下个 commit 中合并"——需要在 03-development 加注释明确这是 OK 的次优方案
- **release-notes Failed Attempts 段事先写"无失败"**：release-notes v1 写"无失败记录"过于乐观，实际 build 阶段就失败了，不得不修订 release-notes 加 Failed Attempt。下次应该在 build 完成后再写 release-notes（流程顺序优化）

## 3. What to Improve Next Time

- **release-notes 拆 v1 / v2**：v1 起草时只填 §1-§4；§5 Known Issues + §6 Failed Attempts 等到 build / merge 实际完成后再补
- **T-05 教训**：写 archive STATUS.md 之前先把源目录整体 mv 到目标位置（git mv），再在那里写 STATUS.md
- **流程文档加一段"build 失败后是否阻塞发版"**：当前 05-release §5 没明确"部分 arch 失败"的细则；本次接受 arm64-only 发版，留待 hotfix。下次类似情况应有规范化决策
- **批量授权模式形式化**：在 01-requirements §4 加一种"用户授权 batch approval"模式，跳过 Open Questions

## 4. Process Feedback

- ✅ 4 phase 拆分对小型迁移正合适，不太多不太少
- ✅ baseline 抽 Current Capabilities + Legacy 附录的两种策略（全文 vs 摘要）都验证可行
- ✅ legacy archive 加 STATUS.md (legacy=true) 让"早期 spec"和"流程内 spec"明显区分
- ⚠️ docs/process/05-release.md §5 失败分级表不够细：单 arch 失败 vs 全 arch 失败处理不同，未明确
- ⚠️ docs/process/03-development §4.4 commit 格式只列 `feat/fix/refactor/docs/chore/test/spec/archive/release`，但本次 T-05 fixup commit 用了 spec 类型；应明确 fixup 应归 spec 还是 chore

## 5. Stats

- 计划 task 数：10（8T + 2TT）
- 实际 task 数：10 完成（含 T-05 fixup commit）
- 计划用时：未估
- 实际用时：约 1.5 小时（持续 session）
- TT 通过率：100% (2/2)
- Failed Attempts 次数：1（x64 build 失败，已留痕）
- Design Revisions：0（一次性 design 走完）
- Commits 数：12 个（含 1 个 fixup、1 个 release、1 个 changelog 在 main 上）
- 行数变化：+1053 / -911（净增 +142；主要是 baseline 文件的 Current Capabilities 抽取 - 原文档删除）

## 6. Tracking for Next Change

- **`2026-06-fix-x64-build`**（hotfix 候选）：调查 `app-builder_arm64 ERR_ELECTRON_BUILDER_CANNOT_EXECUTE`；可能需要升级 electron-builder 或调整 cross-arch 配置
- **`2026-06-rename-repo-sync`**（已规划）：跟进仓库改名（package.json appId、git remote、AGENTS.md 中可能的旧名引用）

## 7. 跨 change 学习的要点

- bootstrap → migrate 链上，**design revision 4** 把迁移移出 bootstrap scope 是关键决策，让本 change 范围聚焦；下次类似引导阶段，建议 proposal 时就分多个 change，避免 in-flight scope 收窄
- **commit 颠倒问题**反复出现（bootstrap 就有），下一 change 在 03-development 加显式步骤："先全部编辑 → 再读 git status 确认 → 再 commit"（不再依赖 agent 记忆）
