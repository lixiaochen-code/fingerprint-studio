import type { ScriptRunStatus } from '../../../../../electron/types'
import type { LogEntry } from './types'

const FINISHED_STATUSES: ScriptRunStatus[] = ['succeeded', 'failed', 'stopped']

export function isFinished(status: ScriptRunStatus): boolean {
  return FINISHED_STATUSES.includes(status)
}

/**
 * RunRow 状态徽章的配色。颜色语义与 sonner toast 一致(amber=进行,绿=成功,红=失败)。
 */
export function statusTone(status: ScriptRunStatus): string {
  switch (status) {
    case 'running':
      return 'border-amber-400/40 bg-amber-400/10 text-amber-400'
    case 'succeeded':
      return 'border-primary/40 bg-primary/10 text-primary'
    case 'failed':
      return 'border-destructive/40 bg-destructive/10 text-destructive'
    case 'stopped':
      return 'border-muted-foreground/30 bg-muted/30 text-muted-foreground'
    default:
      return 'border-muted-foreground/20 bg-muted/20 text-muted-foreground'
  }
}

export function logTone(level: LogEntry['level']): string {
  switch (level) {
    case 'warn':
      return 'text-amber-400'
    case 'error':
    case 'stderr':
      return 'text-destructive'
    case 'stdout':
      return 'text-muted-foreground'
    default:
      return 'text-foreground'
  }
}
