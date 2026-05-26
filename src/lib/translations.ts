/**
 * 应用主框架的 i18n 字典(header / 路由 ProfilesPanel / 全局 toast 等共用)。
 *
 * 各视图自有的文案不放这里(那些放各 view 内部 translations.ts 或 labels 常量),
 * 此处只收"App 框架级"通用文案,避免单文件膨胀。
 */
import type { Locale } from './locale'

export type Translations = {
  appName: string
  addNew: string
  cancel: string
  actionFailed: string
  importSuccess: string
  importCanceled: string
  duplicateSuccess: string
  deleteSuccess: string
  duplicate: string
  delete: string
  details: string
  edit: string
  selected: string
  clear: string
  envAbbr: string
  pluginAbbr: string
  runningAbbr: string
  loading: string
  languageSwitch: string
  languageLabel: string
  riskTitle: string
  secureTitle: string
  riskDescription: string
  secureDescription: string
  searchPlaceholder: string
  refresh: string
  environment: string
  proxy: string
  proxyNone: string
  fingerprint: string
  createdAt: string
  status: string
  actions: string
  online: string
  offline: string
  stop: string
  run: string
  empty: string
  /** ID 列表头 */
  profileId: string
  /** ID chip 默认 hover 提示尾巴(完整 id 之后)*/
  profileIdCopy: string
  /** 复制成功 tooltip */
  profileIdCopied: string
  /** 复制失败 tooltip */
  profileIdCopyFailed: string
  /** 创建 profile 时 id 冲突 */
  profileIdTakenError: string
  /** 创建 profile 时 id 含非法字符 */
  profileIdInvalidError: string
  osWindows: string
  osMac: string
  osLinux: string
  osRandom: string
  settings: string
  theme: string
  themeLight: string
  themeDark: string
  themeSystem: string
  fingerprintModeHint: string
  browserCrashedTitle: string
  browserCrashedDetails: string
  scriptSavedToast: string
  scriptRemovedToast: string
}

export const translations: Record<Locale, Translations> = {
  en: {
    appName: 'AUTO REGISTRY',
    addNew: 'ADD NEW',
    cancel: 'CANCEL',
    actionFailed: '{{action}} failed: {{message}}',
    importSuccess: 'Plugin imported: {{name}}',
    importCanceled: 'Import canceled.',
    duplicateSuccess: 'Duplicated to "{{name}}".',
    deleteSuccess: 'Removed {{count}} environment(s).',
    duplicate: 'Duplicate',
    delete: 'Delete',
    details: 'Details',
    edit: 'Edit',
    selected: '{{count}} selected',
    clear: 'Clear',
    envAbbr: 'ENV',
    pluginAbbr: 'PLG',
    runningAbbr: 'RUN',
    loading: 'LOADING...',
    languageSwitch: '中文',
    languageLabel: 'Switch language',
    riskTitle: 'Fingerprint Mode: {{mode}}',
    secureTitle: 'Fingerprint Mode: Off',
    riskDescription: 'Active kernel: {{kernel}}. Host {{host}}.',
    secureDescription: 'Fingerprint spoofing is disabled.',
    searchPlaceholder: 'SEARCH BY NAME / PROXY...',
    refresh: 'REFRESH',
    environment: 'Environment',
    proxy: 'Proxy',
    proxyNone: 'No proxy',
    fingerprint: 'Fingerprint',
    createdAt: 'Created',
    status: 'Status',
    actions: 'Actions',
    online: 'ONLINE',
    offline: 'OFFLINE',
    stop: 'STOP',
    run: 'RUN',
    empty: 'NO ENVIRONMENTS FOUND.',
    profileId: 'ID',
    profileIdCopy: 'click to copy',
    profileIdCopied: 'Copied!',
    profileIdCopyFailed: 'Copy failed',
    profileIdTakenError: 'The id "{{id}}" is already taken by another environment.',
    profileIdInvalidError: 'The id "{{id}}" contains illegal characters. Allowed: A-Z a-z 0-9 . _ - · 1..64 chars.',
    osWindows: 'WINDOWS',
    osMac: 'MAC',
    osLinux: 'LINUX',
    osRandom: 'RANDOM',
    settings: 'Settings',
    theme: 'Theme',
    themeLight: 'Light',
    themeDark: 'Dark',
    themeSystem: 'System',
    fingerprintModeHint: 'How browser fingerprint is being spoofed for every profile.',
    browserCrashedTitle: 'Browser exited unexpectedly: {{name}}',
    browserCrashedDetails: 'Exit code {{code}}{{signal}}. Check the log for details.',
    scriptSavedToast: 'Script saved: {{name}}',
    scriptRemovedToast: 'Script removed.'
  },
  zh: {
    appName: '环境管理器',
    addNew: '新建环境',
    cancel: '取消',
    actionFailed: '{{action}}失败：{{message}}',
    importSuccess: '插件已导入：{{name}}',
    importCanceled: '已取消导入。',
    duplicateSuccess: '已复制为「{{name}}」。',
    deleteSuccess: '已删除 {{count}} 个环境。',
    duplicate: '复制',
    delete: '删除',
    details: '详情',
    edit: '编辑',
    selected: '已选 {{count}}',
    clear: '清除',
    envAbbr: '环境',
    pluginAbbr: '插件',
    runningAbbr: '运行',
    loading: '加载中...',
    languageSwitch: 'EN',
    languageLabel: '切换语言',
    riskTitle: '指纹模式：{{mode}}',
    secureTitle: '指纹模式：关闭',
    riskDescription: '当前内核：{{kernel}}，宿主：{{host}}。',
    secureDescription: '指纹改写已关闭。',
    searchPlaceholder: '按名称 / 代理搜索...',
    refresh: '刷新',
    environment: '环境',
    proxy: '代理',
    proxyNone: '无代理',
    fingerprint: '指纹',
    createdAt: '创建时间',
    status: '状态',
    actions: '操作',
    online: '在线',
    offline: '离线',
    stop: '停止',
    run: '启动',
    empty: '暂无环境。',
    profileId: 'ID',
    profileIdCopy: '点击复制',
    profileIdCopied: '已复制',
    profileIdCopyFailed: '复制失败',
    profileIdTakenError: 'ID「{{id}}」已被占用,请换一个。',
    profileIdInvalidError: 'ID「{{id}}」含非法字符。允许:A-Z a-z 0-9 . _ - · 1..64 字符。',
    osWindows: 'WINDOWS',
    osMac: 'MAC',
    osLinux: 'LINUX',
    osRandom: '随机',
    settings: '设置',
    theme: '主题',
    themeLight: '浅色',
    themeDark: '深色',
    themeSystem: '跟随系统',
    fingerprintModeHint: '当前为每个环境改写浏览器指纹的方式。',
    browserCrashedTitle: '浏览器异常退出：{{name}}',
    browserCrashedDetails: '退出码 {{code}}{{signal}}。可在日志中查看详情。',
    scriptSavedToast: '脚本已保存：{{name}}',
    scriptRemovedToast: '脚本已删除。'
  }
}
