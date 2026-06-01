# Design: archive-change 自动化脚本

## 1. Overview

零依赖 Node ESM 脚本 `scripts/archive-change.mjs`：解析 specs/changes/<slug>/STATUS.md，校验前置条件，原子化执行"改 status 字段 + 追加 Log + git mv"，并跑 validate-specs.mjs 自检。挂 `pnpm run archive`。配套更新 06-archive.md。

## 2. Final Directory Layout

```
scripts/
├── archive-change.mjs           ← 新增
├── validate-specs.mjs           (已有)
└── verify-electron-cache.mjs    (已有)
package.json                      ← 加 archive script
docs/process/06-archive.md        ← 更新流程 + 元数据笔误细则
```

## 3. Data / API Changes

N/A。脚本只操作 STATUS.md 文本 + git CLI。

## 4. Module Interactions

```
pnpm run archive <slug>
  └─ node scripts/archive-change.mjs <slug>
       ├─ 1. 校验 specs/changes/<slug>/ 存在
       ├─ 2. 读 STATUS.md，parseStatus()
       ├─ 3. 校验 status == 'shipped'
       ├─ 4. 解析 module → 计算 target archive 路径
       ├─ 5. 校验目标不存在
       ├─ 6. 改 STATUS 文件（status 字段 + Log 追加）
       ├─ 7. git mv 整目录
       ├─ 8. 跑 validate-specs.mjs 自检
       └─ 9. 打印 next-step 提示（让用户 commit）
```

## 5. Detailed Design

### 5.1 模块到 archive 路径的映射

| STATUS.module | archive 路径 |
|---|---|
| `_cross` | `specs/archive/_cross/<slug>/` |
| `kernel` / `profiles` / `proxies` / `scripts` / `stealth` | `specs/archive/desktop/<module>/<slug>/` |
| `backend/<x>` | `specs/archive/backend/<x>/<slug>/`（未来）|

实现：

```js
function resolveArchivePath(module, slug) {
  if (module === '_cross') return `specs/archive/_cross/${slug}`
  // desktop 模块（短名）
  if (['kernel','profiles','proxies','scripts','stealth'].includes(module)) {
    return `specs/archive/desktop/${module}/${slug}`
  }
  // 已含路径前缀（backend/x）
  if (module.includes('/')) return `specs/archive/${module}/${slug}`
  // fallback：按 desktop 处理
  return `specs/archive/desktop/${module}/${slug}`
}
```

### 5.2 STATUS 文件原地修改

两处改动：
1. 顶部字段 `- status: shipped` → `- status: archived`
2. Log 段末尾追加：`- <YYYY-MM-DD> | archived | moved to <archive-path>. **READ-ONLY hereafter.**`

实现用单次 readFile + replace + writeFile。正则：

```js
const newText = text
  .replace(/^- status:\s+shipped\s*$/m, '- status: archived')
const logInsert = `- ${todayIso()} | archived | moved to ${archivePath}. **READ-ONLY hereafter.**\n`
// 找 "## State Machine" 之前最后一个空行处插入（Log 段末尾）
```

### 5.3 git mv

```js
execSync(`git mv "specs/changes/${slug}" "${archivePath}"`, { stdio: 'inherit' })
```

`.gitkeep` 处理：如果目标父目录是空且有 .gitkeep（如 `specs/archive/desktop/kernel/.gitkeep`），mv 后该目录仍可能保留 .gitkeep——`fix-x64-build` 归档时手动 `rm .gitkeep`。脚本检测父目录，若有 .gitkeep 一并 git rm。

### 5.4 自检

```js
console.log('\nrunning validate-specs.mjs to verify...')
execSync('node scripts/validate-specs.mjs', { stdio: 'inherit' })
```

failed → exit 1，但此时改动已 stage（用户可看 git status，决定 commit 或 reset）。

### 5.5 输出

```
$ pnpm run archive 2026-06-archive-helper
📦 archive-change

slug:    2026-06-archive-helper
module:  _cross
target:  specs/archive/_cross/2026-06-archive-helper

✓ STATUS.status: shipped → archived
✓ STATUS.Log: appended archived entry
✓ git mv → specs/archive/_cross/2026-06-archive-helper

running validate-specs.mjs to verify...
🔍 validate-specs
...
✓ All checks passed

Done. Review with `git status` and commit:
  git commit -m "archive(<slug>): move to <target>"
```

### 5.6 错误场景

| 条件 | 输出 | exit |
|---|---|---|
| 缺 slug 参数 | usage hint | 1 |
| specs/changes/<slug>/ 不存在 | "no such change" | 1 |
| STATUS.md 缺失 | "missing STATUS.md" | 1 |
| status != shipped | "must be shipped (current: X)" | 1 |
| target 已存在 | "target already exists" | 1 |
| validate 失败 | error 转发 + 提示用户 reset 或修复 | 1 |

## 6. Alternatives Considered

**A. 让 validate-specs.mjs 加更严的检查 + 在 STATUS 顶部加注释提醒**
- 仍是事后抓
- 不解决"手改易错"根因
- 不选

**B. 把 archive 写成 shell 脚本**
- 跨平台差，正则处理 STATUS 文件不优雅
- 不选

**C. (选定) Node mjs 自动化命令**
- 与 validate / verify-cache 风格一致
- 选定

## 7. ADR Triggers

无。流程工具增强。

## 8. Cross-stack Considerations

N/A。

## 9. Risks & Mitigations

见 proposal §7。补充：脚本失败 abort 时尽量"未改任何文件 / git working tree 仍干净"，便于用户重试。

## 10. Out of Scope (Design Layer)

- 不做 dry-run（可 git diff 看效果，不需要单独模式）
- 不做 batch archive
- 不做 reverse

## 11. Validation Strategy

- 正常归档本 change 本身（吃自己的狗粮）
- 测各错误场景：缺 slug / 状态不对 / 目标已存在
- validate-specs 仍 0 error

## 12. Acceptance Criteria

- [ ] scripts/archive-change.mjs 零依赖
- [ ] pnpm run archive script 存在
- [ ] 用本 change 自身归档实际验证脚本
- [ ] 错误场景行为符合 §5.6
- [ ] 06-archive.md §4 含 `pnpm run archive` 用法
- [ ] 06-archive.md 含"元数据笔误可修正"细则
- [ ] validate-specs 0 error；build green
