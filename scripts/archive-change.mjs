#!/usr/bin/env node
// archive-change.mjs — 自动化归档命令（零第三方依赖）
//
// 把"改 status 字段 + 追加 Log + git mv 到 archive/"打包成一条命令，
// 杜绝手动改 STATUS 时漏改 status 字段的笔误（已在 3 个 change 复现）。
//
// 用法：
//   pnpm run archive <slug>
//   node scripts/archive-change.mjs <slug>
//
// 前置：specs/changes/<slug>/STATUS.md 的 status 必须是 'shipped'
//      （即 merge 到 main、tag、build 都已完成）。
//
// 规范来源：docs/process/06-archive.md；由 change 2026-06-archive-helper 引入。

import { existsSync, readFileSync, writeFileSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { execSync } from 'node:child_process'

const ROOT = process.cwd()

const slug = process.argv[2]
if (!slug) {
  console.error('Usage: node scripts/archive-change.mjs <slug>')
  console.error('Example: node scripts/archive-change.mjs 2026-06-archive-helper')
  process.exit(1)
}

const changeDir = join(ROOT, 'specs', 'changes', slug)
const statusPath = join(changeDir, 'STATUS.md')

if (!existsSync(changeDir)) {
  console.error(`✗ no such change: specs/changes/${slug}/`)
  process.exit(1)
}
if (!existsSync(statusPath)) {
  console.error(`✗ missing STATUS.md in specs/changes/${slug}/`)
  process.exit(1)
}

const text = readFileSync(statusPath, 'utf8')

function getField(key) {
  const m = text.match(new RegExp(`^- ${key}:\\s*(.+)$`, 'm'))
  return m ? m[1].trim() : null
}

const status = getField('status')
const module_ = getField('module')

if (!status) {
  console.error(`✗ STATUS.md missing 'status' field`)
  process.exit(1)
}
if (status !== 'shipped') {
  console.error(`✗ current status is '${status}'. Must be 'shipped' before archiving.`)
  console.error(`  (run release flow first: merge to main, tag, build, then come back here)`)
  process.exit(1)
}
if (!module_) {
  console.error(`✗ STATUS.md missing 'module' field`)
  process.exit(1)
}

// module → archive path
const DESKTOP_MODULES = ['kernel', 'profiles', 'proxies', 'scripts', 'stealth']
function resolveArchivePath(mod, slug) {
  if (mod === '_cross') return join('specs', 'archive', '_cross', slug)
  if (DESKTOP_MODULES.includes(mod)) return join('specs', 'archive', 'desktop', mod, slug)
  if (mod.includes('/')) return join('specs', 'archive', mod, slug)
  // fallback
  return join('specs', 'archive', 'desktop', mod, slug)
}

const archivePath = resolveArchivePath(module_, slug)
const archiveFull = join(ROOT, archivePath)

if (existsSync(archiveFull)) {
  console.error(`✗ target already exists: ${archivePath}`)
  console.error(`  (already archived?)`)
  process.exit(1)
}

console.log('📦 archive-change\n')
console.log(`slug:    ${slug}`)
console.log(`module:  ${module_}`)
console.log(`target:  ${archivePath}\n`)

// ——— modify STATUS.md ———

const today = new Date().toISOString().slice(0, 10)
const logLine = `- ${today} | archived | moved to ${archivePath}/. **READ-ONLY hereafter.**`

let newText = text.replace(
  /^- status:\s+shipped\s*$/m,
  '- status: archived',
)
if (newText === text) {
  console.error(`✗ failed to update status field (regex did not match)`)
  process.exit(1)
}

// 在 "## State Machine" 段之前插入 log line（即 Log 段末尾）
const stateMachineIdx = newText.indexOf('## State Machine')
if (stateMachineIdx === -1) {
  console.error(`✗ failed to locate '## State Machine' section`)
  process.exit(1)
}
// 找 Log 段最后一行非空内容
const beforeStateMachine = newText.slice(0, stateMachineIdx)
const trimmed = beforeStateMachine.replace(/\s+$/, '')
newText = `${trimmed}\n${logLine}\n\n${newText.slice(stateMachineIdx)}`

writeFileSync(statusPath, newText, 'utf8')
console.log(`✓ STATUS.status: shipped → archived`)
console.log(`✓ STATUS.Log: appended archived entry`)

// ——— git mv ———

// 父目录 .gitkeep 处理：如果目标父目录有 .gitkeep（且即将不再为空），先 git rm 它
const archiveParent = dirname(archivePath)
const gitkeepInParent = join(ROOT, archiveParent, '.gitkeep')
let removedGitkeep = false
if (existsSync(gitkeepInParent)) {
  // 父目录此前可能只有 .gitkeep（比如首次往该模块归档）
  try {
    execSync(`git rm "${join(archiveParent, '.gitkeep')}"`, { cwd: ROOT, stdio: 'pipe' })
    removedGitkeep = true
    console.log(`✓ removed ${archiveParent}/.gitkeep (no longer needed)`)
  } catch {
    // .gitkeep 没被 git 跟踪？忽略
  }
}

try {
  execSync(`git mv "specs/changes/${slug}" "${archivePath}"`, { cwd: ROOT, stdio: 'pipe' })
  console.log(`✓ git mv → ${archivePath}`)
} catch (e) {
  console.error(`✗ git mv failed:`, e.message)
  // 回滚 STATUS 写入
  writeFileSync(statusPath, text, 'utf8')
  if (removedGitkeep) {
    try { execSync(`git checkout HEAD -- "${join(archiveParent, '.gitkeep')}"`, { cwd: ROOT }) } catch {}
  }
  console.error(`  (STATUS.md restored; .gitkeep restored if applicable)`)
  process.exit(1)
}

// ——— self-validate ———

console.log('\nrunning validate-specs.mjs to verify...\n')
try {
  execSync('node scripts/validate-specs.mjs', { cwd: ROOT, stdio: 'inherit' })
} catch {
  console.error('\n✗ validate-specs reported errors.')
  console.error(`  Review with 'git status' and either fix or 'git reset --hard HEAD' to undo.`)
  process.exit(1)
}

// ——— success ———

console.log(`\nDone. Review with 'git status' and commit:`)
console.log(`  git commit -m "archive(${slug}): move to ${archivePath.replace(/^specs\//, '')}"`)
