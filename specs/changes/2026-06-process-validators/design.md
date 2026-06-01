# Design: 流程自动校验器

## 1. Overview

一个零依赖 Node ESM 脚本 `scripts/validate-specs.mjs`，遍历 `specs/changes/` 与 `specs/archive/`，解析每个 `STATUS.md`，执行一组结构/状态一致性检查，分 error / warning 报告，error 时 exit 1。挂到 `pnpm run validate:specs`。

## 2. Final Directory Layout

```
scripts/
└── validate-specs.mjs        ← 新增
package.json                   ← 加 validate:specs script
docs/process/00-overview.md    ← FAQ 加一条
docs/process/03-development.md ← 退出动作建议跑 validate
```

## 3. Data / API Changes

N/A：无数据结构 / API 变更。脚本只读文件系统 + git log。

## 4. Module Interactions

```
pnpm run validate:specs
   └─ node scripts/validate-specs.mjs
        ├─ fs.readdirSync(specs/changes), fs.readdirSync(specs/archive recursive)
        ├─ 每个 STATUS.md → parseStatus() → { slug, status, legacy, ... }
        ├─ git log --oneline -20 → checkCommitFormat()
        └─ report(errors, warnings) → process.exit(errors.length ? 1 : 0)
```

## 5. Detailed Design

### 5.1 STATUS 解析

```js
function parseStatus(text) {
  const get = (key) => {
    const m = text.match(new RegExp(`^- ${key}:\\s*(.+)$`, 'm'))
    return m ? m[1].trim() : null
  }
  return {
    slug: get('slug'),
    status: get('status'),
    module: get('module'),
    branch: get('branch'),
    legacy: get('legacy') === 'true',
  }
}
```

### 5.2 合法状态集

```js
const VALID_STATUSES = ['draft','approved','designed','in-progress','testing','ready-to-ship','shipped','archived']
```

### 5.3 检查清单

| 检查 | 级别 | 条件 |
|---|---|---|
| STATUS.md 存在 | error | 每个 change/archive 目录都该有 |
| slug / status / branch 非空 | error | 缺则报 |
| status 在合法集内 | error | 否则报 |
| changes/ 里 status=archived | error | 应已 mv 到 archive |
| archive/ 里 status!=archived 且非 legacy | error | 归档应为终态 |
| tasks.md 有 Continue From | warning | 仅对 status >= in-progress 的 change |
| 近 20 commit 格式 | warning | 非 merge / 非 conventional 的列出 |
| slug 与目录名一致 | warning | STATUS.slug 应 == 目录名 |

### 5.4 commit 格式正则

```js
// 允许: type(scope): subject  或  type: subject；merge commit 豁免
const COMMIT_RE = /^(feat|fix|refactor|docs|chore|test|spec|archive|release|revert|build|perf|style|ci)(\([^)]+\))?: .+/
const isMerge = (msg) => msg.startsWith('Merge ')
```

### 5.5 输出格式

```
🔍 validate-specs

Changes (in progress): 0
Archived: 8

ERRORS (must fix):
  ✗ specs/changes/foo/STATUS.md: status 'done' is not a valid state

WARNINGS:
  ⚠ recent commit "wip stuff" does not match conventional format

Result: 1 error, 1 warning
```

无 error → `✓ All checks passed`，exit 0。

## 6. Alternatives Considered

**A. 用 TypeScript + tsx 跑**
- 优点：和项目语言统一
- 缺点：tsx 是额外依赖 / 或要先 tsc 编译；违反"零依赖"
- 不选

**B. shell 脚本**
- 优点：无运行时依赖
- 缺点：跨平台差、解析逻辑写 shell 痛苦、可维护性差
- 不选

**C. (选定) Node .mjs 零依赖**
- 优点：node 已是项目运行时；ESM 清晰；正则解析够用；跨平台
- 选定

## 7. ADR Triggers

无。引入一个 build 工具级脚本不构成需要长期保留的架构决策。属于 docs/process 流程基础设施的常规扩展。

## 8. Cross-stack Considerations

N/A：backend 未引入；脚本只处理 specs/ 目录，与端无关。

## 9. Risks & Mitigations

见 proposal §7。补充：

| 风险 | 缓解 |
|---|---|
| 脚本误判把正常状态报 error，阻塞开发 | 先在本仓现有 7 个 archive + 0 个 in-progress 上跑通验证零误报，再 commit |

## 10. Out of Scope (Design Layer)

- 不做 watch 模式
- 不做 JSON 输出格式（先人类可读）
- 不集成到 build / dist

## 11. Validation Strategy

- 脚本写完先在当前仓库状态跑：应该 0 error（7 个合规 archive + legacy 豁免）
- 造一个临时坏 STATUS（status=archived 放 changes/）验证能报 error，再删除
- pnpm run validate:specs 退出码符合预期

## 12. Acceptance Criteria

- [ ] scripts/validate-specs.mjs 存在，零第三方 import
- [ ] package.json 有 validate:specs script
- [ ] 在当前仓库跑 → 0 error（合规）
- [ ] 人为造坏数据 → 正确报 error 且 exit 1，恢复后 0 error
- [ ] 00-overview FAQ + 03-development 各加一处引用
- [ ] pnpm run build 仍通过（脚本不影响构建）
