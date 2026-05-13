import fs from 'node:fs'
import path from 'node:path'

/**
 * 原子写 JSON 文件：先写同目录的 .tmp，再 rename 到目标。
 * rename 在同文件系统内是 POSIX 原子操作；Windows 下 fs.renameSync 会覆盖已有文件，
 * 符合我们的语义（保证目标始终是可解析的 JSON）。
 */
export function writeJsonAtomic(filePath: string, payload: unknown): void {
  const dir = path.dirname(filePath)
  fs.mkdirSync(dir, { recursive: true })
  const tmpPath = `${filePath}.${process.pid}.${Date.now().toString(36)}.tmp`
  const contents = JSON.stringify(payload, null, 2)
  fs.writeFileSync(tmpPath, contents)
  try {
    fs.renameSync(tmpPath, filePath)
  } catch (error) {
    try { fs.rmSync(tmpPath, { force: true }) } catch {}
    throw error
  }
}

/**
 * 解析失败的 JSON 文件重命名为 `<path>.corrupt-<timestamp>`，保留现场方便排障。
 * 调用方需要自己处理"文件不在了，继续用空数据"的语义。
 */
export function quarantineCorruptFile(filePath: string): void {
  if (!fs.existsSync(filePath)) return
  const target = `${filePath}.corrupt-${Date.now().toString(36)}`
  try {
    fs.renameSync(filePath, target)
  } catch (error) {
    console.error('[persistence] failed to quarantine corrupt file', filePath, error)
  }
}
