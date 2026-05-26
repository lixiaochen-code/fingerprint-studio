import { Checkbox } from '@/components/ui/checkbox'
import { Tooltip } from '@/components/ui/tooltip'
import { interpolate } from '@/lib/i18n'
import type { BrowserProfile, Proxy, ScriptRun } from '../../../../../../../electron/types'
import type { Translations } from '../../translations'

export interface ProfileSelectorProps {
  profiles: BrowserProfile[]
  /**
   * ProxyStore 真源。chip 上直接显示 host:port,而不是只放 tooltip,
   * 让用户一眼看到"哪个 profile 用了哪个代理"。proxyId=null / 找不到都显示 t.proxyNone。
   */
  proxies: Proxy[]
  runningProfileIds: Set<string>
  selected: Set<string>
  onToggle: (id: string, checked: boolean) => void
  t: Translations
  onGoToEnvironments?: () => void
  /** 当前 panel 对应的 script id;用来判定占用是"自己"还是"别人" */
  currentScriptId: string
  /** profile -> 占用它的活跃 run。值由父组件根据 activeRuns 派生 */
  occupyByProfileId: Map<string, ScriptRun>
  /** scriptId -> 脚本名;占用提示里显示给用户看哪个脚本占的 */
  scriptNameById: Map<string, string>
}

/**
 * profile 多选 chip 列表。
 *
 * 占用判定:
 * - 另一个脚本(不是当前脚本)的 run 占了这个 profile,禁止勾选
 * - 当前脚本自己的 run 在跑也算占用 —— 再勾它点 Run 主进程也会拒,UI 提前拦更友好
 */
export function ProfileSelector({
  profiles,
  proxies,
  runningProfileIds,
  selected,
  onToggle,
  t,
  onGoToEnvironments,
  currentScriptId,
  occupyByProfileId,
  scriptNameById
}: ProfileSelectorProps) {
  if (profiles.length === 0) {
    return (
      <div className="border-b border-border bg-secondary/10 px-4 py-3">
        <p className="text-[11px] text-muted-foreground">{t.noProfiles}</p>
        {onGoToEnvironments && (
          <button
            type="button"
            className="mt-1 text-[11px] text-primary underline-offset-2 hover:underline"
            onClick={onGoToEnvironments}
          >
            {t.noProfilesAction}
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="border-b border-border bg-secondary/10 px-4 py-3 space-y-2">
      <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
        {t.selectProfilesHint}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {profiles.map((profile) => {
          const isChecked = selected.has(profile.id)
          const isRunning = runningProfileIds.has(profile.id)
          const occupy = occupyByProfileId.get(profile.id)
          const occupiedByOther = occupy && occupy.scriptId !== currentScriptId
          const occupiedBySelf = occupy && occupy.scriptId === currentScriptId
          const isDisabled = Boolean(occupy)
          const occupyingScriptName = occupy ? scriptNameById.get(occupy.scriptId) : undefined
          const proxy = profile.proxyId
            ? proxies.find((entry) => entry.id === profile.proxyId)
            : undefined
          const proxyLabel = proxy ? `${proxy.host}:${proxy.port}` : t.proxyNone
          const tooltipContent = (
            <div className="space-y-0.5">
              <div className="font-bold">{profile.name}</div>
              <div className="font-mono text-[10px] text-muted-foreground">{proxyLabel}</div>
              {occupiedByOther && (
                <div className="font-mono text-[10px] text-amber-400">
                  {interpolate(t.profileBusy, { script: occupyingScriptName ?? '?' })}
                </div>
              )}
              {occupiedBySelf && (
                <div className="font-mono text-[10px] text-amber-400">{t.status_running}</div>
              )}
            </div>
          )
          return (
            <Tooltip key={profile.id} side="top" content={tooltipContent}>
              <label
                className={[
                  'flex items-center gap-2 border px-2 py-1 transition-colors',
                  isDisabled
                    ? 'cursor-not-allowed border-amber-400/30 bg-amber-400/5 text-amber-400 opacity-70'
                    : isChecked
                      ? 'cursor-pointer border-primary bg-primary/10 text-primary'
                      : 'cursor-pointer border-border bg-background hover:bg-muted/30'
                ].join(' ')}
              >
                <Checkbox
                  checked={isChecked}
                  onChange={(value) => onToggle(profile.id, value)}
                  ariaLabel={profile.name}
                  disabled={isDisabled}
                />
                <span className="text-[11px] font-bold">{profile.name}</span>
                {/* 代理直接显示在 chip 上,用户不用 hover 就能看到 */}
                <span className="font-mono text-[9px] opacity-60">{proxyLabel}</span>
                {isRunning && !occupy && (
                  <span
                    className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse"
                    aria-label="online"
                  />
                )}
                {occupy && (
                  <span
                    className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse"
                    aria-label="scripting"
                  />
                )}
              </label>
            </Tooltip>
          )
        })}
      </div>
    </div>
  )
}

export default ProfileSelector
