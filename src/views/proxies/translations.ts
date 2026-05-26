export type Locale = 'en' | 'zh'

export type Translations = {
  title: string
  emptyTitle: string
  emptyHint: string
  searchPlaceholder: string
  addProxy: string
  batchImport: string
  refreshAll: string
  noMatch: string
  columns: {
    name: string
    scheme: string
    address: string
    status: string
    location: string
    lastTested: string
    actions: string
  }
  edit: string
  test: string
  remove: string
  removeConfirmTitle: string
  removeConfirmBody: string
  removeConfirm: string
  removeCancel: string
  testInProgress: string
  notTested: string
  saved: string
  removed: string
  imported: string
}

export const labels: Record<Locale, Translations> = {
  en: {
    title: 'Proxies',
    emptyTitle: 'No proxies saved.',
    emptyHint:
      'Add a proxy entry to reuse it across profiles. Profiles without a proxy fall back to the system network settings.',
    searchPlaceholder: 'Search by name, host or org…',
    addProxy: 'Add proxy',
    batchImport: 'Batch import',
    refreshAll: 'Refresh all',
    noMatch: 'No proxies match your search.',
    columns: {
      name: 'Name',
      scheme: 'Scheme',
      address: 'Host:Port',
      status: 'Status',
      location: 'Location',
      lastTested: 'Last tested',
      actions: 'Actions'
    },
    edit: 'Edit',
    test: 'Refresh',
    remove: 'Delete',
    removeConfirmTitle: 'Delete proxy',
    removeConfirmBody:
      'Delete "{name}"? Profiles still referencing this proxy will fall back to the system network setting on next launch.',
    removeConfirm: 'Delete',
    removeCancel: 'Cancel',
    testInProgress: 'Testing…',
    notTested: '—',
    saved: 'Proxy saved.',
    removed: 'Proxy removed.',
    imported: 'Imported.'
  },
  zh: {
    title: '代理',
    emptyTitle: '还没有保存的代理。',
    emptyHint: '添加代理条目以便在多个环境间复用。未关联代理的环境会使用系统网络设置。',
    searchPlaceholder: '按名称 / 主机 / ISP 搜索…',
    addProxy: '新增代理',
    batchImport: '批量导入',
    refreshAll: '全部刷新',
    noMatch: '没有匹配的代理。',
    columns: {
      name: '名称',
      scheme: '协议',
      address: '主机:端口',
      status: '状态',
      location: '位置',
      lastTested: '最近探测',
      actions: '操作'
    },
    edit: '编辑',
    test: '刷新',
    remove: '删除',
    removeConfirmTitle: '删除代理',
    removeConfirmBody: '确定删除 "{name}"?引用此代理的环境下次启动将回退到系统网络设置。',
    removeConfirm: '删除',
    removeCancel: '取消',
    testInProgress: '探测中…',
    notTested: '—',
    saved: '已保存代理。',
    removed: '代理已删除。',
    imported: '已导入。'
  }
}
