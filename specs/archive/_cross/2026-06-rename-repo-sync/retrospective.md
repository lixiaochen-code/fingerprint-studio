# Retrospective: 2026-06-rename-repo-sync

## 1. What Went Well

- **small-change 路径首次完整跑通**：proposal 简短、design 并入、test-plan 精简、产物总计 5 个文件。完整流程产物全部齐全但写作开销显著低于普通 change
- **改名策略保守且正确**：仅改 user-facing，保留所有内部标识符（SDK 包名 / env / bundle id / IPC / userData）。验证：dmg 内应用名为 Fingerprint Studio.app，但启动后 bundle id 不变，现有用户数据保留
- **TT-01 验证 git remote sync**：push main 时不再出现 `remote: This repository moved` 提示，端到端验证了 git remote 改名生效
- **批量授权 + 连续两个 change 流程顺畅**：bootstrap → migrate-legacy-docs → rename-repo-sync 三个 change 一气呵成，单 session 完成

## 2. What Went Wrong

- **x64 build 持续失败**：本 change v0.1.3 复现 v0.1.2 的 x64 cross-arch packaging 失败。证实是基础设施问题不是个别 change 问题。需要专项 hotfix
- **网络偶发**：tag push 第一次报 `Error in the HTTP2 framing layer`，重试成功。无影响
- **首次 commit 时 tasks.md 未在仓库中**：T-02 之前 tasks.md 还是 untracked，T-02 commit 把文档级文件一起带走了。这违反了"先全部编辑再 commit"的原则，但 small-change 影响小

## 3. What to Improve Next Time

- **x64 build hotfix 提到下一个 change**：单独 spin-off `2026-06-fix-x64-build` 或更宽的 `2026-06-build-infra` change
- **改名类 change 加 grep 工具集到流程**：本次 grep 全仓 + 人工评估"改/不改"是关键步骤；未来可考虑做一个 `scripts/check-rename.sh` 工具化

## 4. Process Feedback

- ✅ small-change 路径 + 完整流程产物的折中可行（test-plan 简短指向 tasks.md）
- ✅ 改名说明用"段内注释"在 README/AGENTS/PROJECT_GUIDE 而不是单独文档，对读者友好
- ⚠️ 03-development 没明确"小改可以一个 commit 跑多个相关 task"（T-01 read-only + T-02 + T-03 实际是 1 个改动 commit + git remote 不入 git）

## 5. Stats

- 计划 task 数：5 (3 T + 2 TT)
- 实际 task 数：5 完成
- 实际用时：约 25 分钟
- TT 通过率：100% (2/2)
- Failed Attempts: 1 (x64 build, carry-over from v0.1.2)
- Commits: 4 个（含 release commit 和 changelog commit on main，不含 merge commit）
- 行数变化：+10 / -3（user-facing 文档级改名）

## 6. Tracking for Next Change

- **`2026-06-fix-x64-build`** (hotfix 必做)：研究 `app-builder_arm64 ERR_ELECTRON_BUILDER_CANNOT_EXECUTE`，可能要升 electron-builder 或调 node 版本
- 后续如有"改名内部代码标识符"需求，**必须开 major change**（破坏性升级 SDK 包名、env、bundle id），且需要数据迁移方案
