import { AlertTriangle, Info, ShieldCheck } from 'lucide-react'
import { Tooltip } from '@/components/ui/tooltip'
import { interpolate } from '@/lib/i18n'
import type { Locale } from '@/lib/locale'
import type { Translations } from '@/lib/translations'
import { FINGERPRINT_MODE_LABELS, type FingerprintModeKey } from '@/lib/fingerprint-mode-labels'
import type { RuntimeInfo } from '../../../../../electron/types'

/**
 * Profiles 视图顶部的"指纹状态徽章":
 * - 关闭状态:绿色 ShieldCheck
 * - 任意 stealth/extension/cloak/itbrowser 之一:琥珀色 AlertTriangle,提示用户当前在改写指纹
 *
 * Tooltip 内文案来自 src/lib/fingerprint-mode-labels —— 5 种 mode × en/zh 的单一字典源。
 */
export function FingerprintBadge({
  runtime,
  t,
  locale
}: {
  runtime?: RuntimeInfo
  t: Translations
  locale: Locale
}) {
  const enabled = runtime?.fingerprintSpoofingEnabled
  const Icon = enabled ? AlertTriangle : ShieldCheck
  const tone = enabled
    ? 'border-amber-400/40 bg-amber-400/10 text-amber-300'
    : 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300'
  const title = enabled
    ? interpolate(t.riskTitle, { mode: runtime?.fingerprintMode?.toUpperCase() || '—' })
    : t.secureTitle
  const modeKey = (runtime?.fingerprintMode || 'off') as FingerprintModeKey
  const detail = FINGERPRINT_MODE_LABELS[locale][modeKey]
  return (
    <Tooltip
      side="bottom"
      align="start"
      content={
        <div className="space-y-1">
          <div className="font-display text-[11px] font-bold uppercase tracking-wider text-primary">
            {detail.title}
          </div>
          <p className="text-[11px] leading-relaxed text-muted-foreground">{detail.description}</p>
        </div>
      }
    >
      <button type="button" className={`inline-flex cursor-help items-center gap-2 border px-3 py-2 ${tone}`}>
        <Icon className="h-3.5 w-3.5" />
        <span className="font-display text-[11px] font-bold uppercase tracking-wider whitespace-nowrap">
          {title}
        </span>
        <Info className="h-3 w-3 opacity-60" />
      </button>
    </Tooltip>
  )
}

export default FingerprintBadge
