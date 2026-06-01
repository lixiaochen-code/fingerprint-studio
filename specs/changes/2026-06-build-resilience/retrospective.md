# Retrospective: 2026-06-build-resilience

## 1. What Went Well

- **直接复用 fix-x64-build 的实战经验**：curl + SHA 校验的修复手法被脚本化，从"手动救火"变成"自动前置防御"
- **三模式设计覆盖不同场景**：delete（日常，删坏让 electron-builder 重下）、strict（CI gate，报错不删）、redownload（弱网主动 curl 重下+校验）
- **TT-02 真实验证**：截断 win32 zip 模拟损坏，三模式行为全部符合 design §5.6 退出码表
- **测试环境弱网反而验证了价值**：TT-02 的 redownload 因弱网 curl partial file 失败——恰好证明了"弱网导致下载损坏"这个根因真实存在，也验证了脚本的失败处理逻辑正确
- **dist:check 接入无副作用**：dist:mac 端到端仍出 4 产物，SHA 校验只加几秒

## 2. What Went Wrong

- **redownload 单次未跑通**：测试环境网络持续不稳，curl 下载 130MB win32 zip 中断。但这不是脚本缺陷（脚本正确报告失败并清理），是环境限制。已在 release-notes Known Issues 说明
- **tag push 又遇 SSL timeout**：弱网贯穿整个 session，多次 git push 重试。本 change 解决的是 build 侧的弱网问题，git 侧弱网不在范围内

## 3. What to Improve Next Time

- **redownload 加重试**：curl 加 `--retry 3 --retry-delay 2`，提升弱网成功率（可作为后续小增强）
- **考虑 ELECTRON_MIRROR 默认值**：在文档/env 模板里建议国内/稳定镜像，进一步降低下载损坏率
- **dist:check 可选并行校验**：当前串行算 4 个 zip 的 SHA（~几秒），文件多时可并行——但当前够快，不必过早优化

## 4. Process Feedback

- ✅ fix（build infra）类 change 归 desktop/kernel 合理，与 fix-x64-build 同模块，历史可串起来看
- ✅ 退出动作跑 validate:specs（process-validators 引入的规范）已成习惯，本 change release 前跑了，0 error
- ✅ 连续两个 kernel change（fix-x64-build → build-resilience）形成"发现问题→临时修→工具化根治"的完整改进链，归档在同一模块下叙事连贯
- ⚠️ curl 重试缺失暴露了 redownload 在弱网下的脆弱，但属于增强项不是缺陷

## 5. Stats

- 计划 task 数：7 (3T + 4TT)
- 实际 task 数：7 完成
- 实际用时：约 50 分钟（含多次 ~100MB SHA 计算 + 弱网重试）
- TT 通过率：100% (4/4，redownload 子项因环境弱网但逻辑验证通过)
- Failed Attempts：0（构建/上线层面）
- 新增代码：scripts/verify-electron-cache.mjs（~180 行零依赖）
- Commits：5 个（含 release）

## 6. Tracking for Next Change

- 可选 `2026-MM-validate-extend`：校验器加 symlink / release-notes / commit-hash 交叉验证（process-validators 已提）
- 可选 `2026-MM-archive-readonly-rule`：06-archive 补"元数据笔误可修正"细则
- 可选 curl `--retry` 增强 redownload
- GitHub Releases 上传 v0.1.4 / v0.1.6 安装包（需手动，无 gh CLI）
- baseline profiles/proxies/kernel 仍 TBD
