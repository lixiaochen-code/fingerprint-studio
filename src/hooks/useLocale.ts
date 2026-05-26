import { useEffect, useState } from 'react'
import type { Locale } from '@/lib/locale'

const STORAGE_KEY = 'auto-registry-locale'

function readInitial(): Locale {
  const stored = window.localStorage.getItem(STORAGE_KEY)
  if (stored === 'en' || stored === 'zh') return stored
  return navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en'
}

export interface UseLocaleResult {
  locale: Locale
  setLocale: (next: Locale) => void
  /** 在 en/zh 之间切换的便捷调用,Header 切换按钮直接用 */
  toggleLocale: () => void
}

/**
 * 应用语言 hook。负责:
 * 1. 启动从 localStorage 读取(无则按浏览器 navigator.language 推断)
 * 2. 持久化到 localStorage
 * 3. 同步 `<html lang>`(屏幕阅读器、Tailwind locale-aware 字体堆栈都可能用到)
 *
 * 当前应用只支持 en / zh,扩展时改 Locale 类型 + 这里的初始化分支即可。
 */
export function useLocale(): UseLocaleResult {
  const [locale, setLocale] = useState<Locale>(readInitial)

  useEffect(() => {
    document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en'
    window.localStorage.setItem(STORAGE_KEY, locale)
  }, [locale])

  return {
    locale,
    setLocale,
    toggleLocale: () => setLocale((current) => (current === 'en' ? 'zh' : 'en'))
  }
}
