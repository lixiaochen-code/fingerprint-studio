import { useEffect, useState } from 'react'
import type { ThemePref } from '@/lib/locale'

const STORAGE_KEY = 'auto-registry-theme'

function readInitial(): ThemePref {
  const stored = window.localStorage.getItem(STORAGE_KEY)
  if (stored === 'light' || stored === 'dark' || stored === 'system') return stored
  return 'system'
}

function resolve(pref: ThemePref): 'light' | 'dark' {
  if (pref !== 'system') return pref
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export interface UseThemeResult {
  /** 用户选择的偏好(light / dark / system),持久化到 localStorage */
  themePref: ThemePref
  /** 解析到具体应用的色值('system' 会被解析为当前系统色调) */
  resolvedTheme: 'light' | 'dark'
  /** 切换偏好;副作用(localStorage 写入 / `data-theme` 切换)由本 hook 内部处理 */
  setThemePref: (pref: ThemePref) => void
}

/**
 * 主题偏好 hook。负责:
 * 1. 启动从 localStorage 读取偏好
 * 2. 偏好变化时写回 localStorage
 * 3. 'system' 偏好下监听 `prefers-color-scheme` 变化并实时切换
 * 4. 同步 `<html data-theme>`,Tailwind / CSS 变量自动跟着切
 *
 * 不抽到 context 是因为整个应用只在 App 顶层用一次,没必要再绕一层 Provider。
 */
export function useTheme(): UseThemeResult {
  const [themePref, setThemePref] = useState<ThemePref>(readInitial)
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>(() =>
    resolve(readInitial())
  )

  useEffect(() => {
    const apply = () => setResolvedTheme(resolve(themePref))
    apply()
    window.localStorage.setItem(STORAGE_KEY, themePref)
    if (themePref === 'system') {
      const mql = window.matchMedia('(prefers-color-scheme: dark)')
      mql.addEventListener('change', apply)
      return () => mql.removeEventListener('change', apply)
    }
  }, [themePref])

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme
  }, [resolvedTheme])

  return { themePref, resolvedTheme, setThemePref }
}
