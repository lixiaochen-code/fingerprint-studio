/**
 * 跨视图复用的小工具:格式化日期、把领域枚举翻成本地化字符串。
 *
 * 这里的函数都是无副作用纯函数,可以直接被任意视图组件 import,不引入 React 依赖。
 */
import type { RuntimeInfo, TargetOs } from '../../electron/types'
import type { Locale } from './locale'
import { translations } from './translations'

export function targetOsLabel(target: TargetOs, locale: Locale): string {
  const t = translations[locale]
  if (target === 'windows') return t.osWindows
  if (target === 'mac') return t.osMac
  if (target === 'linux') return t.osLinux
  return t.osRandom
}

export function activeKernelLabel(runtime: RuntimeInfo | undefined): string {
  if (!runtime) return '—'
  if (runtime.hostOs === 'win32' && runtime.kernels.itbrowser.installed) return 'ITBROWSER'
  if (runtime.cloakSupported && runtime.kernels.cloak.installed) return 'CLOAK'
  if (runtime.kernels.chromium.installed) return 'CHROMIUM'
  return 'NONE'
}

export function hostLabel(runtime: RuntimeInfo | undefined): string {
  if (!runtime) return '—'
  if (runtime.hostOs === 'win32') return 'WINDOWS'
  if (runtime.hostOs === 'darwin') return 'MAC'
  return 'LINUX'
}

/**
 * 把 ISO 字符串拆成两段方便表格双行展示。容错:解析失败时把原值放 date 段、time 留空。
 */
export function formatDate(value?: string): { date: string; time: string } {
  if (!value) return { date: '—', time: '' }
  try {
    const d = new Date(value)
    const pad = (n: number) => String(n).padStart(2, '0')
    return {
      date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
      time: `${pad(d.getHours())}:${pad(d.getMinutes())}`
    }
  } catch {
    return { date: value, time: '' }
  }
}
