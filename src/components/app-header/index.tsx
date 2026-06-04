import {
  FileCode2,
  Globe2,
  Info,
  Languages,
  Layers,
  Monitor,
  Moon,
  Shield,
  Settings2,
  Sun
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DropdownMenu } from '@/components/ui/dropdown-menu'
import { Tooltip } from '@/components/ui/tooltip'
import { ActiveRunsButton } from '@/components/active-runs-button'
import { activeKernelLabel, hostLabel } from '@/lib/format'
import {
  FINGERPRINT_MODE_LABELS,
  type FingerprintModeKey
} from '@/lib/fingerprint-mode-labels'
import type { Locale, ThemePref } from '@/lib/locale'
import type { Translations } from '@/lib/translations'
import type {
  BrowserProfile,
  RuntimeInfo,
  Script,
  ScriptRun
} from '../../../electron/types'

export type AppView = 'profiles' | 'scripts' | 'proxies' | 'settings' | 'cloud-admin'

export interface AppHeaderProps {
  t: Translations
  locale: Locale
  profilesCount: number
  pluginsCount: number
  runningCount: number
  runtime?: RuntimeInfo
  themePref: ThemePref
  onThemeChange: (pref: ThemePref) => void
  onNavigate: (view: AppView) => void
  onLocaleToggle: () => void
  currentView: AppView
  activeRuns: ScriptRun[]
  scripts: Script[]
  profiles: BrowserProfile[]
  onOpenScript: (scriptId: string) => void
}

/**
 * 顶部应用 header:品牌区 + 全局指标 + 语言/主题/导航。
 *
 * 设计:
 * - 路由导航走 props.onNavigate(由 App.tsx 调用 react-router 的 navigate 实现)
 * - 当前页 currentView 也是从 location.pathname 派生,本组件单纯做高亮渲染
 * - 国际化文案:框架级 t,各 view 自己的文案不在这里
 */
export function AppHeader({
  t,
  locale,
  profilesCount,
  pluginsCount,
  runningCount,
  runtime,
  themePref,
  onThemeChange,
  onNavigate,
  onLocaleToggle,
  currentView,
  activeRuns,
  scripts,
  profiles,
  onOpenScript
}: AppHeaderProps) {
  const ThemeIcon = themePref === 'light' ? Sun : themePref === 'dark' ? Moon : Monitor

  // 四个 tab 按钮共用同一种渲染逻辑:当前页 = default 高亮,其它 = secondary。
  // 全部仅图标 + Tooltip 提示页名。
  const navItems: Array<{ view: AppView; label: string; Icon: typeof Layers }> = [
    { view: 'profiles', label: locale === 'zh' ? '环境' : 'Environments', Icon: Layers },
    { view: 'scripts', label: locale === 'zh' ? '脚本' : 'Scripts', Icon: FileCode2 },
    { view: 'proxies', label: locale === 'zh' ? '代理' : 'Proxies', Icon: Globe2 },
    { view: 'cloud-admin', label: locale === 'zh' ? '后台' : 'Admin', Icon: Shield },
    { view: 'settings', label: t.settings, Icon: Settings2 }
  ]

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-xl">
      <div className="flex h-16 items-center justify-between px-6">
        <div className="flex items-center gap-4">
          <div className="brand-mark">AR</div>
          <div>
            <h1 className="font-display text-xl font-bold tracking-tight">{t.appName}</h1>
            <div className="flex flex-wrap items-center gap-2 font-mono text-[10px] text-muted-foreground uppercase">
              <span>
                {t.envAbbr}:{profilesCount}
              </span>
              <span className="opacity-20">|</span>
              <span>
                {t.pluginAbbr}:{pluginsCount}
              </span>
              <span className="opacity-20">|</span>
              <span>
                {t.runningAbbr}:{runningCount}
              </span>
              <span className="opacity-20">|</span>
              <Tooltip
                side="bottom"
                align="start"
                content={
                  <div className="space-y-1">
                    <div className="font-display text-[11px] font-bold uppercase tracking-wider text-primary">
                      {
                        FINGERPRINT_MODE_LABELS[locale][
                          (runtime?.fingerprintMode || 'off') as FingerprintModeKey
                        ].title
                      }
                    </div>
                    <p className="text-[11px] leading-relaxed text-muted-foreground">
                      {
                        FINGERPRINT_MODE_LABELS[locale][
                          (runtime?.fingerprintMode || 'off') as FingerprintModeKey
                        ].description
                      }
                    </p>
                  </div>
                }
              >
                <span
                  className={`inline-flex cursor-help items-center gap-1 ${runtime?.fingerprintSpoofingEnabled ? 'text-amber-500' : 'text-emerald-500'}`}
                >
                  MODE:{runtime?.fingerprintMode?.toUpperCase() || '—'}
                  <Info className="h-3 w-3 opacity-60" />
                </span>
              </Tooltip>
              <span className="opacity-20">|</span>
              <span className="text-primary">KERNEL:{activeKernelLabel(runtime)}</span>
              <span className="opacity-20">|</span>
              <span>HOST:{hostLabel(runtime)}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="gap-2"
            aria-label={t.languageLabel}
            onClick={onLocaleToggle}
          >
            <Languages className="h-4 w-4" />
            {t.languageSwitch}
          </Button>
          <DropdownMenu
            trigger={
              <Button variant="ghost" size="sm" className="h-9 w-9 p-0" title={t.theme}>
                <ThemeIcon className="h-4 w-4" />
              </Button>
            }
            items={[
              {
                label: t.themeLight,
                icon: <Sun className="h-3 w-3" />,
                onClick: () => onThemeChange('light')
              },
              {
                label: t.themeDark,
                icon: <Moon className="h-3 w-3" />,
                onClick: () => onThemeChange('dark')
              },
              {
                label: t.themeSystem,
                icon: <Monitor className="h-3 w-3" />,
                onClick: () => onThemeChange('system')
              }
            ]}
          />
          {/* 全局活跃 run:图标 + 数字徽章;点开浮层看所有跨脚本运行中的 run */}
          <ActiveRunsButton
            locale={locale}
            activeRuns={activeRuns}
            scripts={scripts}
            profiles={profiles}
            onOpenScript={onOpenScript}
          />
          {/* 导航 tab 组:纯图标 + Tooltip 提示页名。当前页高亮 */}
          <div className="ml-2 flex items-center gap-1 border-l border-border pl-3">
            {navItems.map(({ view, label, Icon }) => {
              const active = currentView === view
              return (
                <Tooltip key={view} side="bottom" content={label}>
                  <Button
                    variant={active ? 'default' : 'secondary'}
                    size="sm"
                    className="h-9 w-9 p-0"
                    aria-label={label}
                    aria-current={active ? 'page' : undefined}
                    onClick={() => onNavigate(view)}
                  >
                    <Icon className="h-4 w-4" />
                  </Button>
                </Tooltip>
              )
            })}
          </div>
        </div>
      </div>
    </header>
  )
}

export default AppHeader
