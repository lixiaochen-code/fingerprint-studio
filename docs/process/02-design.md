# 02 设计规范

## 1. 环节定位

把 proposal 的需求映射成具体技术方案，识别风险，对齐方向。产物 `design.md` 是开发拆解的依据。

## 2. 进入条件

- proposal.md 状态 = `approved`
- STATUS.status = `approved`
- 走完整流程的 change（小需求按 00-overview §5 简化路径，可省略 design.md）

## 3. 必备产物

| 文件 | 路径 | 模板 |
|---|---|---|
| 设计 | `specs/changes/<slug>/design.md` | [templates/design.md](templates/design.md) |
| ADR (条件性) | `docs/adr/NNNN-<topic>.md` | 无模板，按 §5 触发条件按需新建 |

ADR 编号四位数字递增（`0001-`、`0002-`...）。

## 4. 操作流程（AI agent 视角）

1. **读取上下文**
   - proposal.md 全文（特别是 §3 Approach 与 §5 Requirements）
   - 相关 baseline `specs/baseline/<端>/<module>/spec.md` 全文
   - PROJECT_GUIDE.md 中相关章节
   - 现有相关代码文件
2. **草拟方案**
   - 起草 design.md §1 Overview、§2 Final Directory Layout、§5 Detailed Design
   - 关键：§6 Alternatives Considered 必须有至少 2 个备选
3. **暴露风险**
   - 填 §9 Risks & Mitigations 表格
   - 跨端时填 §8 Cross-stack Considerations
4. **判断是否需要 ADR**（见 §5 ADR 触发条件）
5. **delta 起草**
   - 在 `specs/changes/<slug>/delta/<端>/<module>/spec.md` 起草本次对 baseline 的差异
   - ADDED / MODIFIED / REMOVED 三类，OpenSpec 风格
6. **review 与认可**
   - 用户口头认可方向后，改 STATUS.status = `designed`
   - 提交：`docs(<slug>): design approved`
7. **设计偏离的处理**
   - 开发期间发现实现与 design 不一致，**先回 design.md 修订并 commit**，再写代码
   - 修订时在 design.md 末尾加 `## Revision Log` 段记录变更原因

## 5. ADR 触发条件

满足以下任一条件，必须新建 ADR：

- 影响多个未来 change 的全局约定（如：引入新框架、改变文件命名规范）
- 推翻先前 ADR
- 涉及"为什么不选 X 方案"需要长期保留的论证
- 跨端契约（API、protocol、共享类型）的定义

ADR 文档不强制使用 design.md 模板，但必须含：

- Context（背景）
- Decision（决策）
- Consequences（后果，含正反面）
- Alternatives Considered（备选）
- Status（proposed / accepted / superseded by ADR-NNNN）

## 6. 验收标准

进入下一环节前必须满足：

- [ ] design.md 全部字段非空（无内容字段填 `N/A` + 一句话说明）
- [ ] §6 至少 2 个备选方案，含选定理由
- [ ] §9 Risks 表格至少 1 条；每条有缓解措施
- [ ] §12 Acceptance Criteria 是 checkbox 列表
- [ ] 触发 ADR 条件的，对应 ADR 已新建并状态为 `accepted`
- [ ] 涉及 baseline 改动的，`delta/` 下已起草 delta spec
- [ ] 跨端 change 的 §8 Cross-stack Considerations 不为空

## 7. 退出动作

- STATUS.status: `approved` → `designed`
- STATUS.Log 追加：`YYYY-MM-DD | design vN (status=designed) | <one-line>`
- git commit message: `docs(<slug>): design approved`
- 不打 tag
- 用户认可的设计修订也走 commit `docs(<slug>): design revision N` 并在 design.md `Revision Log` 追加

## 8. 反例与禁忌

1. **跳过备选方案直接拍板**：§6 不能只有一个方案。哪怕"显然"也要写出"考虑过 X 但因 Y 不选"。
2. **影响面写"几个文件"**：§4 必须点名到具体文件或模块。
3. **行级伪代码塞进 design**：实现细节交给开发环节，design 控制在"接口 + 数据流"层面。
4. **跨端 change 漏 §8**：哪怕只动 desktop，也要在 §8 显式写"本次仅 desktop, backend / shared 未涉及"。
5. **设计偏离先写代码再补 design**：必须 design 先行；这条违反则该 commit 必须 revert。

## 9. 与其他环节的接口

**上一环节（01-requirements）给我什么**

- 锁定的 proposal.md
- STATUS.status = `approved`

**我给下一环节（03-development）什么**

- 锁定的 design.md
- 必要的 ADR 已 `accepted`
- delta/ 已起草
- STATUS.status = `designed`

03-development 读 design.md §5 Detailed Design 拆 task；读 §12 Acceptance Criteria 作为完成判定；读 delta/ 决定哪些 baseline 文件需要在 release 阶段合并。

## 10. 跨端设计指引（后端预留）

后端尚未引入。未来跨端 change 的 design 必备：

- §2 Final Directory Layout 同时含 desktop / backend / shared 三段
- §3 Data / API Changes 必须列出契约（OpenAPI / proto / TS types）
- `delta/` 同时含 `desktop/` 与 `backend/` 子目录（必要时含 `shared/`）
- §8 Cross-stack Considerations 含端间错误传播、版本兼容、契约演进策略

当前 desktop-only change 的 §8 填 `N/A: backend not introduced yet`。
