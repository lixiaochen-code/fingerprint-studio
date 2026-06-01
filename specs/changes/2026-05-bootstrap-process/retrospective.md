# Retrospective: 2026-05-bootstrap-process

## 1. What Went Well

- **流程建立"自指"成功**：本 change 自身全程按草拟中的流程跑了一遍，每个阶段（proposal Q&A → design → tasks → in-progress → testing → release → archive）都产出了对应的产物，验证了流程在最小用例上的可行性
- **OpenSpec 哲学借鉴落地**：吸收了 specs/changes 二分、Scenario GIVEN/WHEN/THEN 写法、proposal 多轮 Q&A，但不绑定 OpenSpec CLI，保持工具中立
- **多 agent 入口 symlink 方案干净**：单份 AGENTS.md + 4 个 symlink，git mode 120000 验证通过，更新一份处处生效
- **Kiro 集成点找得对**：`.kiro/steering/process.md` 在 T-11 commit 后的下一次会话就被自动加载，证明 steering 是工具中立流程的"增强层"而非"替代层"
- **状态机有约束力**：每个状态切换都强制 commit 并写 STATUS Log，agent 不再"飘"

## 2. What Went Wrong

- **commit 节奏多次失误**：先 commit 后改 tasks.md 状态，多次靠 amend 修复（T-02 / T-03 / T-04 / T-05 都犯过）。根因：tool 调用并行性 + agent 没建立"先全部编辑 → 再 commit"的肌肉记忆。规范应再强调
- **scope 中途收窄需要 git revert**：proposal v1 把"建立流程"和"迁移历史"绑在一个 change 里，T-14/T-15/T-16/TT-03 已实施后用户提出"先定义规范，迁移后面做"。处理方式是 git revert 4 个 commit（合成一个 revert commit），符合规范但说明 proposal 阶段对 scope 边界的把握不够
- **跨 session 续作机制不一致**：早期某次 session 写了 ad-hoc HANDOFF.md（278 行），与流程规定的"Continue From + STATUS.Log"产生了重复。最终删除 HANDOFF.md。教训：规范没要求的产物不应自创
- **fs_append 工具 silent no-op**：在写 tasks.md 末尾时 fs_append 多次报告成功但实际未写入，最终改用 shell `printf >>` 才生效。需要在 03-development 加注释提醒"对长文件追加时优先用 shell"
- **build x64 阶段有 flate corrupt warning**：dist:mac 命令 exit 0 且 4 个产物都生成、DMG hdiutil 验证 VALID，但 packaging 阶段输出过 `cannot close error=flate: corrupt input`。已在 release-notes §6 留痕，下次需观察是否复现

## 3. What to Improve Next Time

- **commit 顺序固化为流程规则**：在 03-development.md §4.3 "执行单个 task" 步骤中再次强调"先全部编辑 → 再 status 更新 → 再 commit"，避免 amend
- **proposal 阶段加一题"是否单 change 还是拆多 change"**：本次教训表明，开始时合在一起、做到一半发现要拆，成本不低。可以加进 01-requirements 的 Q&A 模板
- **小工具问题的 fallback 文档化**：fs_append 失败的情形要在 docs/process/ 某处提到 fallback（用 shell printf）
- **流程演进通过新 change 而非 ad-hoc 修订**：本 change 内部多次修订 design（revision 1~4），下次类似 meta-process 可以接受 in-place 修订；但产品 change 应严格遵守"design 修订要走 commit"的硬规则
- **失败留痕机制的颗粒度**：build warning 是否算 Failed Attempt 是个边界——本次记了，下次应该明确 "影响产物的算 / 仅过程性 warning 算"

## 4. Process Feedback

> 流程本身在这次 change 中暴露的问题；如有，可能触发新的 _cross change

- ✅ 状态机的 8 状态划分够用（一次都没遇到"想跳过某状态"的诱惑）
- ✅ STATUS.Log 作为审计入口足够直观，归档时一行行读完就能复现整个生命周期
- ⚠️ tasks.md 的 "Continue From" 字段在多次 amend / revert 后偶尔与 git log 不同步——下次可加自动校验脚本（`git log --oneline | head` 与 Continue From 对一对），但这要做成新 change `2026-MM-process-validators`
- ⚠️ `Failed Attempts` 段在 release-notes 中位置 OK，但当 change 没失败时，写"无失败记录"会让段落看起来奇怪——下次模板可以让"无失败"成为一条结构化条目而非自由文本
- ⚠️ proposal Open Questions 默认让用户回答 Q1-Q7 是合理结构，但本次用户授权 agent 全用其倾向直接进。这种"批量授权"应该在模板里明确支持（"如倾向均合理可一次性 approve all"）

## 5. Stats

- 计划 task 数：21（含 5 个 TT）
- 实际 task 数：13 done（T-01..T-13、TT-01、TT-02）+ 8 移出 scope
- 计划用时：未估
- 实际用时：跨多次会话约 2 天日历时间，纯执行约 4-5 小时
- TT 通过率：100%（10/10 spec-level + 2/2 PR-level，TT-A1..TT-A10 全 pass）
- Failed Attempts 次数：1 个非阻塞 build warning（已留痕）
- Design Revisions：4 次（rev 1: 单 PR 决策 / rev 2-3: 已废弃因为迁移移出 scope / rev 4: scope 收窄）
- Commits 数：约 30 个（含 4 个 amend、1 个 revert）
- 行数变化：+2700 lines（新增文档），+0 业务代码

## 6. Tracking for Next Change

接续启动的子 change：

- `2026-05-migrate-legacy-docs` — 迁移 docs/specs/* 与 .kiro/specs/global-scripts-* 到 baseline / archive；删除 AGENT.md 与 docs/specs/。详见本 change 原 tasks.md Phase 3-5 段（已截除）

潜在 spin-off（待用户决定是否启动）：

- `2026-MM-process-validators` — 自动化流程合规校验（Continue From 与 git log 一致性、commit 格式、status 与文件一致性）
- 仓库改名（`auto-registry` → `fingerprint-studio` 或其他）—— 注意到 `git push` 时 GitHub 提示仓库已迁移到 `fingerprint-studio`，存在改名 in-flight；需要单独 change 同步 package.json appId 等
