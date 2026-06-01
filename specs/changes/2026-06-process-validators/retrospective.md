# Retrospective: 2026-06-process-validators

## 1. What Went Well

- **校验器首跑即抓真 bug**：第一次运行就发现 `2026-06-fix-x64-build` 归档时 STATUS.status 笔误停在 `ready-to-ship`（归档动作只改了 Log 没改字段）。证明这个工具的价值——它发现的正是它被设计来防的那类问题
- **零依赖落地干净**：纯 node .mjs + git CLI，无新增 package。正则解析 STATUS 够用
- **error/warning 分级合理**：硬约束（archived stray、非法状态）报 error 阻塞；模糊项（缺 branch、commit 格式、legacy 数据）报 warning 不阻塞。legacy 豁免避免了对历史数据的误报
- **自校验闭环**：本 change 在自己的 ready-to-ship 退出动作里跑了一次 validate（按它自己新增的规范），形成自洽

## 2. What Went Wrong

- **暴露了之前归档流程的缺陷**：fix-x64-build 的 status 字段笔误本应在那个 change 归档时就被发现，但当时没有工具。说明"归档前手动核对 STATUS 字段"这条人工纪律不可靠——这正是本 change 要解决的
- **改了已归档文件**：为修正 fix-x64-build 的 status 笔误，动了 archive 里的文件（理论上 archive 只读）。判断：修正归档时的元数据笔误 ≠ 变更已归档的决策内容，属于合理修复。但严格说破了"archive 只读"，已在 commit message 明确说明

## 3. What to Improve Next Time

- **校验器纳入日常**：每个 change 的 testing 阶段都该跑（已写进 03-development 退出动作）
- **未来可加的检查**：symlink 完整性（AGENTS.md 的 4 个 link）、release-notes 的 Failed Attempts 段存在性、tasks.md 的 commit hash 与 git log 交叉验证
- **考虑 CI 集成**：目前是手动跑；未来有 CI 时把 validate:specs 设为 PR gate（但当前无 CI，不强求）

## 4. Process Feedback

- ✅ 这是流程"自我改进"的第一个实例：retrospective 反复提出的问题 → 开 change → 工具化解决。流程演进机制（00-overview §9）跑通了
- ✅ chore/process 类 change 不重新构建安装包的判断合理（应用二进制无变化），release-notes 明确说明即可
- ⚠️ "archive 只读" vs "修正归档笔误" 的边界，06-archive 规范没说清。建议下次 process change 补一条："archive 内容只读，但元数据笔误（status 字段、拼写）可由后续 change 修正并在 commit 注明"

## 5. Stats

- 计划 task 数：6 (3T + 3TT)
- 实际 task 数：6 完成
- 实际用时：约 40 分钟
- TT 通过率：100% (3/3)
- Failed Attempts：0（构建/上线层面）
- 真 bug 发现数：1（fix-x64-build status 笔误）
- 新增代码：scripts/validate-specs.mjs（~190 行，零依赖）
- Commits：4 个（含 release）

## 6. Tracking for Next Change

- 可选 `2026-MM-build-resilience`：electron 下载健壮性（仍未做）
- 可选 `2026-MM-validate-extend`：校验器加 symlink / release-notes / commit-hash 交叉验证
- 可选 CI 接入：把 validate:specs + build 设为 PR gate
- 06-archive 规范补"元数据笔误可修正"细则（小 process change）
