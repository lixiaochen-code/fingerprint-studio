import type { ScriptSource } from '../../../../../electron/types'
import type { Translations } from '../../translations'

/**
 * 脚本来源徽章:LOCAL(蓝)/ EXTERNAL(琥珀)。在列表项 + 详情头部都用。
 */
export function SourceBadge({ source, t }: { source: ScriptSource; t: Translations }) {
  const label = source === 'local' ? t.local : t.external
  const tone =
    source === 'local'
      ? 'border-primary/40 bg-primary/10 text-primary'
      : 'border-amber-400/40 bg-amber-400/10 text-amber-400'
  return (
    <span
      className={`ml-2 inline-flex flex-none items-center border px-1.5 py-0.5 font-mono text-[9px] font-bold tracking-wider ${tone}`}
    >
      {label}
    </span>
  )
}

export default SourceBadge
