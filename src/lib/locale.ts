/**
 * 全局 locale / 主题首选项类型。
 * 单独成文件让 views/components 都能 import,而不依赖 App.tsx 间接 export。
 */
export type Locale = 'en' | 'zh'
export type ThemePref = 'light' | 'dark' | 'system'
