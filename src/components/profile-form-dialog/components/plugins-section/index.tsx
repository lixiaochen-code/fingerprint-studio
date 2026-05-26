import { Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import type { BrowserPlugin } from '../../../../../electron/types'

export interface PluginsSectionLabels {
  plugins: string
  pluginsHint: string
  importZip: string
  importing: string
  noPlugins: string
}

export interface PluginsSectionProps {
  plugins: BrowserPlugin[]
  /** 当前被勾选的 plugin id 列表;由父组件保管 */
  enabledPluginIds: string[]
  /** 勾选/取消勾选时回调,父组件更新 form 状态 */
  onTogglePlugin: (pluginId: string, checked: boolean) => void
  importing: boolean
  onImportPlugin: () => Promise<void>
  t: PluginsSectionLabels
}

/**
 * "插件"块 —— 展示已注册的 BrowserPlugin 列表,支持勾选启用 + 导入新 ZIP。
 *
 * 单独抽出来是因为它是 ProfileFormDialog 里独立度最高的一段:整套交互(导入 / 勾选 /
 * 列表渲染)与"基础信息表单"那一半几乎不交叉。父组件只需把 enabledPluginIds 当受控值
 * 透传 + 接 onTogglePlugin 回调即可。
 */
export function PluginsSection({
  plugins,
  enabledPluginIds,
  onTogglePlugin,
  importing,
  onImportPlugin,
  t
}: PluginsSectionProps) {
  return (
    <div className="mt-6 border-t border-border pt-5">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="font-display text-xs font-bold uppercase tracking-wider">{t.plugins}</h3>
          <p className="text-[11px] text-muted-foreground">{t.pluginsHint}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          disabled={importing}
          onClick={() => void onImportPlugin()}
        >
          <Upload className="h-3 w-3" />
          {importing ? t.importing : t.importZip}
        </Button>
      </div>
      {plugins.length === 0 ? (
        <p className="border border-dashed border-border bg-background/50 p-4 text-center text-[11px] text-muted-foreground">
          {t.noPlugins}
        </p>
      ) : (
        <ul className="divide-y divide-border border border-border">
          {plugins.map((plugin) => {
            const active = plugin.versions.find((version) => version.id === plugin.activeVersionId)
            const checked = enabledPluginIds.includes(plugin.id)
            return (
              <li
                key={plugin.id}
                className="flex items-center justify-between gap-3 bg-background px-3 py-2"
              >
                <label className="flex cursor-pointer items-center gap-3">
                  <Checkbox
                    checked={checked}
                    onChange={(value) => onTogglePlugin(plugin.id, value)}
                    ariaLabel={plugin.name}
                  />
                  <div className="flex flex-col">
                    <span className="text-xs font-bold tracking-tight">{plugin.name}</span>
                    <span className="text-[10px] font-mono text-muted-foreground">
                      v{active?.version || '—'} · {plugin.versions.length} version(s)
                    </span>
                  </div>
                </label>
                {plugin.description && (
                  <span className="line-clamp-1 max-w-[300px] text-[10px] text-muted-foreground">
                    {plugin.description}
                  </span>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

export default PluginsSection
