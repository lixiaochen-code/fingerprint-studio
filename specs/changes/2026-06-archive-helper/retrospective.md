# Retrospective: 2026-06-archive-helper

## 1. What Went Well

- **治本而非治标**：process-validators 是"事后抓"status 笔误，本 change 是"源头消除"——`pnpm run archive` 自动改 status 字段，手动笔误不再可能发生
- **吃自己的狗粮**：本 change 用自己写的 `archive` 脚本归档自己（TT-02），是最强的端到端验证
- **错误守卫完备**：4 类错误场景（缺参/不存在/状态不对/重复）全部 exit 1 且无副作用，失败时回滚 STATUS 写入
- **顺带清理技术债**：把 process-validators retrospective §6 提的"06-archive 补元数据笔误细则"一并完成（§8.1）
- **自检闭环**：脚本归档后自动跑 validate-specs，归档即验证

## 2. What Went Wrong

- **工具调用顺序错误**：写 spec 文档时一次 fs_write 参数嵌套错误，把 STATUS 内容写进了 tasks.md。用 amend + 重写修正。根因：同一轮发多个 fs_write 时参数串了
- **这是本 session 反复的模式**：fs_write/commit 的时序问题在多个 change 里出现过。archive 脚本解决了 status 笔误，但"文档写错位置"是另一类问题，validate-specs 的 slug!=dirname 检查能部分覆盖

## 3. What to Improve Next Time

- **写多个 spec 文件时逐个确认**：不要在一轮里并行发易混淆的 fs_write
- **未来可加 ship-helper**：本 change 只自动化了 archive；shipped 状态切换（bump version + merge + tag + CHANGELOG）仍手动且步骤多。但那比 archive 复杂得多（涉及 git/build），ROI 待评估
- **validate-specs 可加"STATUS.status 与 Log 末行一致性"检查**：进一步防 Log 写了 archived 但字段没改（虽然 archive 脚本已让这种情况不该发生）

## 4. Process Feedback

- ✅ 流程自我改进闭环再次运转：retrospective 发现问题（status 笔误 3 次）→ 开 change → 工具根治
- ✅ "吃狗粮"式验证（脚本归档自己）对工具类 change 特别有说服力
- ✅ §8.1 例外条款补上了"archive 只读"与"修正笔误"之间的规范空白
- ⚠️ 至此积累了 3 个流程工具脚本（validate-specs / verify-electron-cache / archive-change），未来可考虑一个 `scripts/README.md` 索引

## 5. Stats

- 计划 task 数：6 (3T + 3TT)
- 实际 task 数：6（TT-02 自归档在 ship 后执行）
- 实际用时：约 45 分钟（含一次 fs_write 顺序错误的修正）
- TT 通过率：TT-01/TT-03 pass；TT-02 自归档执行中
- Failed Attempts：0（构建/上线层面）
- 新增代码：scripts/archive-change.mjs（~150 行零依赖）
- Commits：4 + release + 自归档 commit

## 6. Tracking for Next Change

- 可选 `scripts/README.md`：索引 3 个流程脚本
- 可选 ship-helper（评估 ROI）
- 可选 validate-specs 加 status/Log 一致性检查
- GitHub Releases 上传安装包（仍需手动）
- baseline profiles/proxies/kernel 仍 TBD
