# Release Notes: <change-slug>

## 1. Version
- version: vX.Y.Z
- type: major / minor / patch
- date: YYYY-MM-DD
- platforms: mac (arm64+x64) / win / linux

## 2. What Changed (User-Facing)
（用户能感知到的改变，不是技术细节。每条一行）

## 3. How to Use
（新功能的使用方式；含截图或步骤。无新功能填 N/A）

## 4. Rollback Plan
（具体到命令的回滚方案）

```bash
# Example
git tag -d vX.Y.Z
git push --delete origin vX.Y.Z
gh release delete vX.Y.Z
```

## 5. Known Issues
（这次没修但已知的小坑）

## 6. Failed Attempts (失败留痕)
> 上线过程中任何失败必须在此追加。每次失败一段。归档前不允许删除此段。

### Failed Attempt 1 (YYYY-MM-DD HH:MM)
- 现象: 
- 根因: 
- 处置: revert / hotfix / 撤 tag / 其他
- 关联 commit: 
