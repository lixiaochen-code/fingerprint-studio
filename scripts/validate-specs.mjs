#!/usr/bin/env node
// validate-specs.mjs — 流程合规校验器（零第三方依赖）
//
// 校验 specs/changes/ 与 specs/archive/ 的结构与状态一致性，
// 以及最近 commit 的格式。error → exit 1；仅 warning / 全过 → exit 0。
//
// 用法：pnpm run validate:specs
// 规范来源：docs/process/（本脚本由 change 2026-06-process-validators 引入）

import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { execSync } from 'node:child_process'

const ROOT = process.cwd()
const CHANGES_DIR = join(ROOT, 'specs', 'changes')
const ARCHIVE_DIR = join(ROOT, 'specs', 'archive')

const VALID_STATUSES = [
  'draft', 'approved', 'designed', 'in-progress',
  'testing', 'ready-to-ship', 'shipped', 'archived',
]
const STATUS_ORDER = Object.fromEntries(VALID_STATUSES.map((s, i) => [s, i]))

const COMMIT_RE =
  /^(feat|fix|refactor|docs|chore|test|spec|archive|release|revert|build|perf|style|ci)(\([^)]+\))?: .+/
const COMMIT_SCAN_COUNT = 20

const errors = []
const warnings = []
const err = (msg) => errors.push(msg)
const warn = (msg) => warnings.push(msg)

/** 解析 STATUS.md 的 `- key: value` 字段（宽松正则，不引 yaml 库）。 */
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

/** 列出某目录下的直接子目录名。 */
function listDirs(dir) {
  if (!existsSync(dir)) return []
  return readdirSync(dir).filter((name) => {
    const p = join(dir, name)
    return statSync(p).isDirectory() && !name.startsWith('.')
  })
}

/** 递归找出所有含 STATUS.md 的 change 目录（用于 archive 树）。 */
function findChangeDirs(dir) {
  const result = []
  if (!existsSync(dir)) return result
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      if (name.startsWith('.')) continue
      const p = join(d, name)
      if (!statSync(p).isDirectory()) continue
      if (existsSync(join(p, 'STATUS.md'))) result.push(p)
      else walk(p)
    }
  }
  walk(dir)
  return result
}

function relativ(p) {
  return p.replace(ROOT + '/', '')
}

/** 校验单个 change 目录的 STATUS。kind = 'changes' | 'archive'。 */
function checkStatusDir(dir, kind) {
  const statusPath = join(dir, 'STATUS.md')
  if (!existsSync(statusPath)) {
    err(`${relativ(dir)}: missing STATUS.md`)
    return
  }
  const text = readFileSync(statusPath, 'utf8')
  const s = parseStatus(text)

  if (!s.slug) err(`${relativ(statusPath)}: missing 'slug' field`)
  if (!s.status) err(`${relativ(statusPath)}: missing 'status' field`)
  // legacy archive 迁移自旧结构，没有标准 branch 字段，豁免
  if (!s.branch && !s.legacy) warn(`${relativ(statusPath)}: missing 'branch' field`)

  if (s.status && !VALID_STATUSES.includes(s.status)) {
    err(`${relativ(statusPath)}: status '${s.status}' is not a valid state`)
  }

  // slug 应与目录名一致
  const dirName = dir.split('/').pop()
  if (s.slug && s.slug !== dirName) {
    warn(`${relativ(statusPath)}: slug '${s.slug}' != directory name '${dirName}'`)
  }

  if (kind === 'changes') {
    if (s.status === 'archived') {
      err(`${relativ(dir)}: status=archived but still under specs/changes/ (should be moved to specs/archive/)`)
    }
    // 进行中的 change：到了 in-progress 及之后应有 Continue From + tasks.md
    if (s.status && STATUS_ORDER[s.status] >= STATUS_ORDER['in-progress']) {
      const tasksPath = join(dir, 'tasks.md')
      if (!existsSync(tasksPath)) {
        warn(`${relativ(dir)}: status=${s.status} but no tasks.md`)
      } else {
        const tasks = readFileSync(tasksPath, 'utf8')
        if (!/Continue From:/m.test(tasks)) {
          warn(`${relativ(tasksPath)}: missing 'Continue From' line`)
        }
      }
    }
  }

  if (kind === 'archive') {
    if (!s.legacy && s.status !== 'archived') {
      err(`${relativ(dir)}: in archive but status='${s.status}' (expected 'archived'; legacy entries are exempt)`)
    }
  }
}

/** 校验最近 N 条 commit 的格式（warning 级，历史不可改）。 */
function checkCommits() {
  let log
  try {
    log = execSync(`git log --format=%s -n ${COMMIT_SCAN_COUNT}`, {
      cwd: ROOT,
      encoding: 'utf8',
    })
  } catch {
    warn('git not available; skipped commit format check')
    return
  }
  const lines = log.split('\n').filter(Boolean)
  for (const msg of lines) {
    if (msg.startsWith('Merge ')) continue
    if (!COMMIT_RE.test(msg)) {
      warn(`recent commit does not match conventional format: "${msg}"`)
    }
  }
}

// ——— main ———

const changeDirs = listDirs(CHANGES_DIR)
const archiveDirs = findChangeDirs(ARCHIVE_DIR)

for (const name of changeDirs) {
  checkStatusDir(join(CHANGES_DIR, name), 'changes')
}
for (const dir of archiveDirs) {
  checkStatusDir(dir, 'archive')
}
checkCommits()

// ——— report ———

console.log('🔍 validate-specs\n')
console.log(`Changes (in progress): ${changeDirs.length}`)
console.log(`Archived: ${archiveDirs.length}\n`)

if (errors.length) {
  console.log('ERRORS (must fix):')
  for (const e of errors) console.log(`  ✗ ${e}`)
  console.log('')
}
if (warnings.length) {
  console.log('WARNINGS:')
  for (const w of warnings) console.log(`  ⚠ ${w}`)
  console.log('')
}

if (!errors.length && !warnings.length) {
  console.log('✓ All checks passed')
} else {
  console.log(`Result: ${errors.length} error(s), ${warnings.length} warning(s)`)
}

process.exit(errors.length ? 1 : 0)
