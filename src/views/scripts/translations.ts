/**
 * ScriptsView 与其子组件共享的 i18n 字典与本地类型。
 *
 * 单独成文件:子组件(ScriptList / DetailPane / dialogs)需要 Translations 类型,
 * 把字典塞进 index.tsx 会让子组件反向 import 主入口。
 */
export type Locale = 'en' | 'zh'
export type Theme = 'light' | 'dark'

export type Translations = {
  title: string
  emptyList: string
  emptyHint: string
  newLocal: string
  newExternal: string
  selectAFile: string
  delete: string
  revealInFinder: string
  local: string
  external: string
  emptyDetail: string
  createTitle: string
  createSubmit: string
  cancel: string
  name: string
  namePlaceholder: string
  description: string
  descriptionPlaceholder: string
  entryPath: string
  entryPathPlaceholder: string
  browse: string
  deleteConfirmTitle: string
  deleteConfirmSingle: string
  deleteDetailLocal: string
  deleteDetailExternal: string
  deleteConfirm: string
  errorRequired: string
  errorExternalPath: string
  saved: string
  deleted: string
  /** scope 区域标题 */
  scopeLabel: string
  /** scope=profile 显示名 */
  scopeProfile: string
  /** scope=global 显示名 */
  scopeGlobal: string
  /** scope=profile 的解释行 */
  scopeProfileHint: string
  /** scope=global 的解释行 */
  scopeGlobalHint: string
  /** 列表里的 GLOBAL 徽章文字 */
  globalBadge: string
  /** 全局脚本运行面板:无 profile 选择,顶部提示文案 */
  globalRunHint: string
  /** 脚本详情头部 ID 列文案(label) */
  scriptId: string
  /** 复制脚本 ID 成功 toast */
  scriptIdCopiedToast: string
  /** 复制脚本 ID 失败 toast */
  scriptIdCopyFailedToast: string
}

export const labels: Record<Locale, Translations> = {
  en: {
    title: 'Scripts',
    emptyList: 'No scripts yet.',
    emptyHint:
      'Create a local script inside the app, or register an external file you already maintain.',
    newLocal: 'New local script',
    newExternal: 'Register external script',
    selectAFile: 'Select a file...',
    delete: 'Delete',
    revealInFinder: 'Reveal in Finder',
    local: 'LOCAL',
    external: 'EXTERNAL',
    emptyDetail: 'Select a script on the left or create a new one.',
    createTitle: 'New script',
    createSubmit: 'Create',
    cancel: 'Cancel',
    name: 'Name',
    namePlaceholder: 'My script',
    description: 'Description',
    descriptionPlaceholder: '(optional)',
    entryPath: 'Entry path',
    entryPathPlaceholder: '/absolute/path/to/script.ts',
    browse: 'Browse',
    deleteConfirmTitle: 'Delete script',
    deleteConfirmSingle: 'Delete "{{name}}"? {{detail}}',
    deleteDetailLocal: 'The script directory (including logs and state) will be removed.',
    deleteDetailExternal: 'Only the registration is removed; your local file is untouched.',
    deleteConfirm: 'Delete',
    errorRequired: 'Name is required',
    errorExternalPath: 'External entry path is required',
    saved: 'Script saved: {{name}}',
    deleted: 'Script removed',
    scopeLabel: 'Scope',
    scopeProfile: 'Profile',
    scopeGlobal: 'Global',
    scopeProfileHint: 'Runs against one environment; SDK exposes browser/page/profile/...',
    scopeGlobalHint: 'Scheduler that drives other scripts; SDK exposes profiles/runScript (no browser).',
    globalBadge: 'GLOBAL',
    globalRunHint: 'Global scripts run without an environment. Click Run to execute.',
    scriptId: 'ID',
    scriptIdCopiedToast: 'Script ID copied to clipboard.',
    scriptIdCopyFailedToast: 'Failed to copy script ID.'
  },
  zh: {
    title: '脚本',
    emptyList: '还没有脚本。',
    emptyHint: '在应用内新建一个本地脚本,或注册一个你自己维护的外部文件。',
    newLocal: '新建本地脚本',
    newExternal: '注册外部脚本',
    selectAFile: '选择文件...',
    delete: '删除',
    revealInFinder: '在访达中显示',
    local: '本地',
    external: '外部',
    emptyDetail: '在左侧选择一个脚本,或者新建一个。',
    createTitle: '新建脚本',
    createSubmit: '创建',
    cancel: '取消',
    name: '名称',
    namePlaceholder: '我的脚本',
    description: '描述',
    descriptionPlaceholder: '(可选)',
    entryPath: '入口文件',
    entryPathPlaceholder: '/绝对/路径/到/脚本.ts',
    browse: '浏览…',
    deleteConfirmTitle: '删除脚本',
    deleteConfirmSingle: '确定删除「{{name}}」?{{detail}}',
    deleteDetailLocal: '脚本目录(含日志与 state)会被一并删除。',
    deleteDetailExternal: '仅移除登记;你本地的源文件不会被动。',
    deleteConfirm: '删除',
    errorRequired: '名称必填',
    errorExternalPath: '外部脚本入口路径必填',
    saved: '脚本已保存:{{name}}',
    deleted: '脚本已删除',
    scopeLabel: '作用域',
    scopeProfile: '环境绑定',
    scopeGlobal: '全局',
    scopeProfileHint: '绑定到某个环境运行;SDK 含 browser/page/profile/... ',
    scopeGlobalHint: '不绑环境的调度器;SDK 含 profiles/runScript,**没有** browser。',
    globalBadge: '全局',
    globalRunHint: '全局脚本不绑环境,点击"运行"直接执行。',
    scriptId: 'ID',
    scriptIdCopiedToast: '脚本 ID 已复制到剪贴板。',
    scriptIdCopyFailedToast: '复制脚本 ID 失败。'
  }
}
