import type { ScriptRun } from '../../../../../electron/types'

/**
 * 单条日志记录。level 跨"业务等级"(info/warn/error)与"原始流"(stdout/stderr)。
 */
export type LogEntry = {
  level: 'info' | 'warn' | 'error' | 'stdout' | 'stderr'
  line: string
  at: string
}

/**
 * 单个 run 在面板里的本地状态。
 * - run:从 runtime 拿到的元数据(startedAt 等);status 跟着 onEvent 更新
 * - logs:滚动累加;上限 LOG_LINE_LIMIT 防内存爆
 * - profileLabel:缓存 profile 名字,避免列表里 profile 被删后掉信息
 */
export type LiveRun = {
  run: ScriptRun
  logs: LogEntry[]
  profileLabel: string
}

export const LOG_LINE_LIMIT = 1000
