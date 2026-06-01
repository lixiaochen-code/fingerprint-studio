# 05 上线规范

## 1. 环节定位

把通过测试的代码合并到 main、打包发版、上传分发，留下可回滚的版本节点。失败有分级处理与留痕。

## 2. 进入条件

- 所有 TT `status: pass`
- test-plan.md §6 Sign-off 全部勾上
- STATUS.status = `ready-to-ship`
- 用户授权发版

## 3. 必备产物

| 文件 | 路径 | 模板 |
|---|---|---|
| 发版说明 | `specs/changes/<slug>/release-notes.md` | [templates/release-notes.md](templates/release-notes.md) |
| 主仓 changelog | `CHANGELOG.md`（根目录，追加） | 无 |
| 发版 tag | `vX.Y.Z`（git tag） | 无 |
| 安装包 | `release/Auto Registry-<version>-*.dmg` 等 | 无（electron-builder 自动） |
| GitHub Release | `https://github.com/<owner>/<repo>/releases/tag/vX.Y.Z` | 无 |

## 4. 操作流程（AI agent 视角）

10 步上线流水线：

### Step 1 决定版本号（SemVer）

| 改动类型 | 版本号变化 |
|---|---|
| 不兼容的 API / 数据格式变更 | major +1（0.x.y → 1.0.0） |
| 新增向后兼容功能 | minor +1（0.1.x → 0.2.0） |
| 修 bug、文档、流程变更 | patch +1（0.1.0 → 0.1.1） |

agent 自行判断后报告版本号；用户可推翻。

### Step 2 写 release-notes.md

按 templates/release-notes.md 起草。必含 5 段：

1. Version（版本号 + 日期）
2. What Changed（用户视角）
3. How to Use（如有新功能）
4. Rollback Plan（具体命令）
5. Known Issues
6. Failed Attempts（失败记录段，初版为空，后续追加）

提交：`docs(<slug>): add release notes for vX.Y.Z`

### Step 3 合并 delta 到 baseline

- 把 `specs/changes/<slug>/delta/<端>/<module>/spec.md` 的 ADDED / MODIFIED / REMOVED 应用到 `specs/baseline/<端>/<module>/spec.md` 的 Current Capabilities 段
- ADDED → 追加；MODIFIED → 替换；REMOVED → 删除并保留一行注释指向 archive
- 提交：`spec(<slug>): merge delta into baseline`

### Step 4 升 package.json 版本

```bash
# 例：0.1.3 → 0.1.4
# 直接编辑 package.json 的 "version" 字段
```

提交：`chore(<slug>): bump version to vX.Y.Z`

### Step 5 创建 PR：change 分支 → main

PR 描述用本规范 §6 模板。PR 标题：`<type>(<slug>): <subject>`

CI（如有）跑通后等待用户 review。

### Step 6 用户 approve & merge

合并方式：**merge commit**（保留 task 级 commit 历史）。

### Step 7 切到 main 打 tag

```bash
git checkout main
git pull
git tag -a vX.Y.Z -m "release: <slug>"
git push origin vX.Y.Z
```

### Step 8 构建安装包

当前阶段仅构建 mac：

```bash
pnpm dist:mac
```

未来支持全平台时改 `pnpm dist:all`。

产物在 `release/` 下。

### Step 9 上传 GitHub Release

```bash
gh release create vX.Y.Z \
  --title "vX.Y.Z: <short-summary>" \
  --notes-file specs/changes/<slug>/release-notes.md \
  release/*.dmg release/*.zip
```

如未安装 `gh`，手工在 GitHub UI 上传。

### Step 10 更新根目录 CHANGELOG.md

把 release-notes 的精简版（Version + What Changed 两段）追加到 CHANGELOG.md 顶部。提交：`docs: update CHANGELOG for vX.Y.Z`

完成后改 STATUS.status = `shipped`，进入归档。

## 5. 失败处理

### 5.1 失败分级

| 失败类型 | 表现 | 处置 |
|---|---|---|
| **构建失败** | `pnpm dist:mac` 报错 | 留在 change 分支修，main 没变化，无需回滚 |
| **打包成功但本机装不上 / 装上打不开** | DMG 无法挂载、应用启动崩溃 | 在 change 分支修；前一个 tag **直接删除**（无用户阶段） |
| **能装能开但功能炸（关键路径不通）** | 主要场景 broken | 视严重度选 revert main 或开 hotfix |
| **小 bug（非关键路径）** | 边缘场景出错 | 不撤版本，开新 change `change/<module>/fix-<bug>` 走完整流程 |

### 5.2 删 tag 命令（无用户阶段）

```bash
git tag -d vX.Y.Z
git push --delete origin vX.Y.Z
gh release delete vX.Y.Z --yes
# 同时删除 release/ 下的安装包，避免本地误用
rm release/Auto\ Registry-X.Y.Z*
```

### 5.3 留痕规则（任何失败都要写）

在当前 change 的 `release-notes.md` §6 Failed Attempts 追加：

```markdown
### Failed Attempt N (YYYY-MM-DD HH:MM)
- 现象: <one-line>
- 根因: <one-line>
- 处置: revert / hotfix / 撤 tag / 其他
- 关联 commit: <hash1>, <hash2>
```

**失败的 spec 不准直接归档**，必须等真正成功上线那次才归档；归档时 retrospective.md 必须分析失败原因。

## 6. PR 描述模板

```markdown
## Summary
<一句话>

## Spec
- proposal: specs/changes/<slug>/proposal.md
- design: specs/changes/<slug>/design.md
- tasks: specs/changes/<slug>/tasks.md
- test-plan: specs/changes/<slug>/test-plan.md

## Tasks
- N/N done

## Tests
- N/N TT pass
- pnpm run build: pass

## Release
- version: vX.Y.Z
- type: major / minor / patch
- platforms: mac (arm64+x64)

## Risk & Rollback
<风险点>
<回滚方案：见 release-notes.md §4>
```

## 7. 退出动作

- STATUS.status: `ready-to-ship` → `shipped`
- STATUS.Log 追加：`YYYY-MM-DD | shipped vX.Y.Z | tag <vX.Y.Z>, GH release <url>`
- git tag `vX.Y.Z` 已 push
- `release/` 下安装包已上传 GitHub Release
- CHANGELOG.md 已更新

## 8. 反例与禁忌

1. **跳过 release-notes**：哪怕小需求也要写。
2. **版本号不连续**：从 0.1.4 直接跳到 0.2.0 而不是 0.1.5（除非确实是 minor 改动）。
3. **release-notes 只写"修复 bug"**：用户不知道修了什么。必须点名。
4. **直接 push 到 main**：必须走 PR + merge commit。
5. **失败不留痕就重发**：所有失败必须写进 §6 Failed Attempts，归档前不可删。

## 9. 与其他环节的接口

**上一环节（04-testing）给我什么**

- 全部 TT pass 的 test-plan.md
- STATUS.status = `ready-to-ship`

**我给下一环节（06-archive）什么**

- 已 merge 到 main 的代码
- 已 push 的 git tag
- 已上传的 GitHub Release
- 完整的 release-notes.md（含 Failed Attempts 如有）
- baseline 已合并 delta
- STATUS.status = `shipped`

06-archive 直接把整个 change 文件夹 mv 到 `specs/archive/<module>/<slug>/`。
