import fs from 'node:fs'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { profilesRoot } from '../paths'

const execFileAsync = promisify(execFile)

/**
 * 启动自检：清理上次会话留下的孤儿脚本子进程 + Chromium Singleton 锁。
 *
 * 触发场景：应用被 SIGKILL / Cmd+C / 断电 / dev 热重启时，bootstrap 子进程的
 * `process.on('disconnect')` 来不及响应，浏览器的 SingletonLock 也没被 Chromium
 * 自然清理，下次启动若不收拾就会出现"打开浏览器卡住 / 不能开新 tab / CPU 飙高"
 * 这类难排查的现象。
 *
 * 设计原则：
 * - 仅清理"我们这个应用"留下的痕迹，绝不动其它进程或其它 user-data-dir
 * - 失败不抛出，只 console.error；启动自检不应阻塞 app 启动
 * - 暴露成可手动调用的函数，应用内"清理"按钮以及测试脚本可复用
 */

export interface JanitorReport {
  killedOrphanScripts: number
  removedSingletonFiles: number
  errors: string[]
}

const SCRIPT_PROCESS_MARKER = 'AUTO_REGISTRY_SCRIPT_CONTEXT'

/**
 * 找出所有带 AUTO_REGISTRY_SCRIPT_CONTEXT 环境变量的进程并 SIGKILL 它们。
 * 用 ps -eo pid,command 的 command 列里**没有** env，所以我们走 `ps -E` (mac/Linux)
 * 把环境变量带出来匹配；Windows 走 wmic 兜底。
 *
 * 这是"暴力但准确"的方式：进程必须是我们的 bootstrap fork 出来的才会带这个 env，
 * 不会误伤其它东西。
 */
async function killOrphanScripts(currentPid: number): Promise<{ killed: number; errors: string[] }> {
  const errors: string[] = []
  let killed = 0

  if (process.platform === 'darwin' || process.platform === 'linux') {
    try {
      // 关键：ps 用 -E 把 env 拼到 command 列里，再 grep 我们的 marker
      // -ww 防止 mac 默认列宽截断长命令行
      const { stdout } = await execFileAsync('ps', ['-Ewwo', 'pid=,command='], { maxBuffer: 4 * 1024 * 1024 })
      const lines = stdout.split('\n')
      for (const line of lines) {
        if (!line.includes(SCRIPT_PROCESS_MARKER)) continue
        const match = line.match(/^\s*(\d+)\s/)
        if (!match) continue
        const pid = Number(match[1])
        if (!Number.isInteger(pid) || pid === currentPid || pid === process.ppid) continue
        try {
          process.kill(pid, 'SIGKILL')
          killed++
        } catch (error) {
          // ESRCH = 进程已经不在了，是 OK 的；其它错记下
          const code = (error as NodeJS.ErrnoException).code
          if (code !== 'ESRCH') errors.push(`kill ${pid}: ${(error as Error).message}`)
        }
      }
    } catch (error) {
      errors.push(`ps -E failed: ${(error as Error).message}`)
    }
  } else if (process.platform === 'win32') {
    try {
      // wmic 已被 Microsoft 标 deprecated 但 Win10/11 默认还在；命令行里能看到 env 变量名
      // 我们启动子进程时把 contextEnv 直接放在 env 里，CommandLine 看不到它的值，
      // 所以 Windows 这条只能用一个更弱的启发：找 node.exe 启动的 bootstrap.js
      const { stdout } = await execFileAsync('wmic', [
        'process', 'where', "name='node.exe' and CommandLine like '%bootstrap.js%'",
        'get', 'ProcessId,CommandLine', '/format:csv'
      ], { maxBuffer: 4 * 1024 * 1024 })
      for (const line of stdout.split('\n')) {
        const match = line.match(/(\d+)\s*$/)
        if (!match) continue
        const pid = Number(match[1])
        if (!Number.isInteger(pid) || pid === currentPid) continue
        try {
          process.kill(pid)
          killed++
        } catch (error) {
          const code = (error as NodeJS.ErrnoException).code
          if (code !== 'ESRCH') errors.push(`kill ${pid}: ${(error as Error).message}`)
        }
      }
    } catch (error) {
      errors.push(`wmic failed: ${(error as Error).message}`)
    }
  }

  return { killed, errors }
}

/**
 * 清理所有 profile 目录里的 Singleton* 锁文件（SingletonCookie / SingletonLock /
 * SingletonSocket）。Chromium 正常退出时会自己删，被 SIGKILL 时不会，下次启动会
 * 卡在"等待已有实例"的退化路径。
 *
 * 这一步只删我们 user-data-dir 下的，不会影响系统其它 Chrome。
 */
function cleanSingletonLocks(): { removed: number; errors: string[] } {
  const errors: string[] = []
  let removed = 0
  const root = profilesRoot()
  if (!fs.existsSync(root)) return { removed, errors }

  let entries: string[]
  try {
    entries = fs.readdirSync(root)
  } catch (error) {
    errors.push(`readdir ${root}: ${(error as Error).message}`)
    return { removed, errors }
  }

  const lockNames = ['SingletonLock', 'SingletonCookie', 'SingletonSocket']
  for (const profileId of entries) {
    const profileDir = path.join(root, profileId)
    let stat: fs.Stats
    try {
      stat = fs.statSync(profileDir)
    } catch {
      continue
    }
    if (!stat.isDirectory()) continue

    for (const name of lockNames) {
      const lock = path.join(profileDir, name)
      // 这些文件可能是 symlink（SingletonLock 通常是），lstatSync + rmSync 处理两种
      try {
        const lockStat = fs.lstatSync(lock)
        // 只删存在的，记数自增；不存在就 lstat 抛 ENOENT，被 catch 吞掉
        void lockStat
        fs.rmSync(lock, { force: true })
        removed++
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code
        if (code !== 'ENOENT') errors.push(`rm ${lock}: ${(error as Error).message}`)
      }
    }
  }
  return { removed, errors }
}

/**
 * 应用启动自检入口：先杀脚本孤儿，再清浏览器锁。
 * 顺序很重要：先杀进程，否则 Chromium 仍在跑时删 SingletonLock 反而会触发问题。
 */
export async function runStartupJanitor(currentPid: number = process.pid): Promise<JanitorReport> {
  const { killed, errors: killErrors } = await killOrphanScripts(currentPid)
  const { removed, errors: lockErrors } = cleanSingletonLocks()
  const report: JanitorReport = {
    killedOrphanScripts: killed,
    removedSingletonFiles: removed,
    errors: [...killErrors, ...lockErrors]
  }
  if (killed > 0 || removed > 0 || report.errors.length > 0) {
    console.log('[janitor]', JSON.stringify(report))
  }
  return report
}
