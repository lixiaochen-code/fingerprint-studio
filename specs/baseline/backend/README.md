# Baseline: backend (placeholder)

后端尚未引入。未来后端进来时，本目录下按 backend 模块（例如 auth / api / worker / etc.）组织 baseline spec。

未来引入后端时应做的事：

1. 在本目录下按模块新建子目录与 spec.md
2. 同步更新 `docs/process/00-overview.md` §7 的"多端协作"段
3. 跨端 change（同时改 desktop 与 backend）必须使用 `_cross` 模块
4. 跨端契约（API、protocol、共享类型）放 `specs/baseline/shared/`

引入后端的 change 走标准流程，slug 例如 `2026-MM-bootstrap-backend`。
