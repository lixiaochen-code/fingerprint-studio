# Changelog

## v0.1.8 — 2026-06-03

### Fixed

- 修复带用户名密码的 SOCKS4/SOCKS5 代理在 Chromium 中无法认证导致页面 `ERR_SOCKS_CONNECTION_FAILED` 的问题：应用会为这类代理创建本机无认证 SOCKS5 隧道，由主进程完成上游认证
- 代理列表测试现在会真实执行 SOCKS 握手，不再把“端口能连上”误判为 SOCKS 代理可用
- 当上游返回 HTTP 403 或其它非 SOCKS greeting 时，测试结果会明确提示协议/凭据/白名单/会话问题

详见 [socks5-auth-proxy release notes](specs/archive/desktop/proxies/2026-06-socks5-auth-proxy/release-notes.md)。

## v0.1.7 — 2026-06-01

### Process / Tooling

- 新增 `pnpm run archive <slug>`：自动化 change 归档（改 status 字段 + 追加 Log + git mv + 自检），根除手动归档的 status 字段笔误
- 06-archive.md 流程更新；新增 §8.1"元数据笔误可修正"例外条款
- 应用二进制无变化

详见 [archive-helper release notes](specs/archive/_cross/2026-06-archive-helper/release-notes.md)。

## v0.1.6 — 2026-06-01

### Build / Tooling

- 新增 `pnpm run dist:check`：构建前校验 electron 下载缓存 SHA256，自动删除损坏文件，根治弱网导致的 `flate: corrupt input` 构建失败
- 所有 `dist:*` 前置 `dist:check`
- `scripts/verify-electron-cache.mjs` 支持 delete（默认）/ --strict（CI）/ --redownload（curl 重下+校验）三模式
- 应用二进制无功能变化

详见 [build-resilience release notes](specs/archive/desktop/kernel/2026-06-build-resilience/release-notes.md)（即将归档）。

## v0.1.5 — 2026-06-01

### Process / Tooling

- 新增 `pnpm run validate:specs`：零依赖流程合规校验器（STATUS 完整性 / 状态一致性 / Continue From / commit 格式）
- 校验器首次运行即发现并修正一个归档元数据 bug
- 流程文档加入校验器引用
- 应用二进制无变化（不重新分发安装包；v0.1.4 仍代表当前应用）

详见 [process-validators release notes](specs/archive/_cross/2026-06-process-validators/release-notes.md)（即将归档）。

## v0.1.4 — 2026-06-01

### Fixed

- 修复 mac x64 安装包构建失败（v0.1.2 / v0.1.3 仅有 arm64）。根因：electron x64 缓存 zip 网络下载损坏（SHA256 不匹配）。修复：手动 curl 下载 + SHA 校验
- **首次双架构发版**：同时提供 arm64（Apple Silicon）与 x64（Intel）mac 安装包

详见 [fix-x64-build release notes](specs/archive/desktop/kernel/2026-06-fix-x64-build/release-notes.md)（即将归档）。

## v0.1.3 — 2026-06-01

### Chore

- 应用展示名 `Auto Registry` → `Fingerprint Studio`
- 仓库名 `auto--registry` → `fingerprint-studio`（git remote 同步）
- 内部代码标识符（SDK 包名、env 前缀、bundle id、IPC 命名空间、userData 路径）保持不变 → 现有用户应用 / 数据 / 用户脚本完全兼容

### Known Issues

- 仍仅 arm64 mac 产物可用；x64 build issue 未解决（同 v0.1.2）

详见 [rename-repo-sync release notes](specs/archive/_cross/2026-06-rename-repo-sync/release-notes.md)（即将归档）。

## v0.1.2 — 2026-06-01

### Process

- 完成 bootstrap-process 留下的迁移工作：旧 `docs/specs/*` 设计文档迁到 `specs/baseline/desktop/<module>/spec.md`；旧 `.kiro/specs/global-scripts-*` 迁到 `specs/archive/desktop/scripts/2026-05-*`；handoff 文档迁到 `docs/handoffs/`
- 删除 `AGENT.md`（被 AGENTS.md + PROJECT_GUIDE.md 取代）、空 `docs/specs/`、空 `.kiro/specs/`
- 应用功能无变化

### Known Issues

- 本次发版仅 arm64 mac 产物可用；x64 cross-arch packaging 失败（详见 [release notes](specs/archive/_cross/2026-06-migrate-legacy-docs/release-notes.md)，待后续 hotfix）

详见 [migrate-legacy-docs change](specs/archive/_cross/2026-06-migrate-legacy-docs/release-notes.md)（即将归档）。

## v0.1.1 — 2026-06-01

### Process

- 引入 AI 驱动开发流程框架：`AGENTS.md` 入口、`docs/process/` 含 7 份规范 + 8 份模板、`specs/` 三层目录骨架（baseline / changes / archive）、`docs/PROJECT_GUIDE.md` 项目知识库、`.kiro/steering/` Kiro 适配
- agent 工具中立：`CLAUDE.md` / `GEMINI.md` / `.cursorrules` / `.github/copilot-instructions.md` 通过 symlink 共享单份内容
- 应用功能无变化

详见 [bootstrap change](specs/changes/2026-05-bootstrap-process/release-notes.md)（即将归档到 `specs/archive/_cross/2026-05-bootstrap-process/`）。

## v0.1.0 — 2026 年 5 月（前流程时代）

- 桌面 MVP：跨境电商浏览器环境管理、三轨反检测、脚本子系统、全局脚本与队列
- 历史 handoff 文档保留在 `docs/specs/handoff-*.md`（待 `2026-05-migrate-legacy-docs` 迁到 `docs/handoffs/`）
