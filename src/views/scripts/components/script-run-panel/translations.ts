/**
 * ScriptRunPanel + 子组件共享的 i18n 字典与本地类型。
 *
 * 之所以单独成文件:子组件(ProfileSelector / RunRow)需要 Translations 类型,
 * 而 panel 主入口又是默认导出的 ScriptRunPanel,把字典塞进 index.tsx 会造成"子组件
 * 反过来 import 父组件文件"的环依赖。
 */
export type Locale = 'en' | 'zh'

export type Translations = {
  panelTitle: string
  selectProfilesHint: string
  noProfiles: string
  noProfilesAction: string
  run: string
  runHint: string
  stopAll: string
  stop: string
  emptyRuns: string
  noProfilesSelected: string
  status_pending: string
  status_running: string
  status_succeeded: string
  status_failed: string
  status_stopped: string
  startFailed: string
  /** profile 已被另一个 run 占用时的提示;用 {{script}} 替换占用脚本的 id(如有) */
  profileBusy: string
  profileBusyUnknown: string
  durationSec: string
  clear: string
  filterAll: string
  proxyNone: string
  selectionSummary: string
  selectionEmpty: string
}

export const labels: Record<Locale, Translations> = {
  en: {
    panelTitle: 'Run',
    selectProfilesHint: 'Pick environments to run this script on:',
    noProfiles: 'No environments yet.',
    noProfilesAction: 'Go create one in the Environments tab.',
    run: 'Run',
    runHint: 'Cmd/Ctrl + Enter',
    stopAll: 'Stop all',
    stop: 'Stop',
    emptyRuns: 'No runs yet. Select environments above and press Run.',
    noProfilesSelected: 'Select at least one environment to run.',
    status_pending: 'PENDING',
    status_running: 'RUNNING',
    status_succeeded: 'SUCCEEDED',
    status_failed: 'FAILED',
    status_stopped: 'STOPPED',
    startFailed: 'Failed to start: {{message}}',
    profileBusy:
      'This environment is already running script "{{script}}". Stop it first or pick another environment.',
    profileBusyUnknown:
      'This environment is already running another script. Stop it first or pick another environment.',
    durationSec: '{{seconds}}s',
    clear: 'Clear finished',
    filterAll: 'All',
    proxyNone: 'No proxy',
    selectionSummary: '{{count}} selected',
    selectionEmpty: 'None selected'
  },
  zh: {
    panelTitle: '运行',
    selectProfilesHint: '选择要运行此脚本的环境:',
    noProfiles: '还没有环境。',
    noProfilesAction: '去环境列表新建一个。',
    run: '运行',
    runHint: 'Cmd/Ctrl + Enter',
    stopAll: '全部停止',
    stop: '停止',
    emptyRuns: '还没有运行记录。在上方选择环境,点"运行"。',
    noProfilesSelected: '至少选一个环境再运行。',
    status_pending: '待运行',
    status_running: '运行中',
    status_succeeded: '已成功',
    status_failed: '失败',
    status_stopped: '已停止',
    startFailed: '启动失败:{{message}}',
    profileBusy: '该环境正在运行脚本「{{script}}」,请先停止它或换一个环境。',
    profileBusyUnknown: '该环境正在运行另一个脚本,请先停止它或换一个环境。',
    durationSec: '{{seconds}} 秒',
    clear: '清理已结束',
    filterAll: '全部',
    proxyNone: '无代理',
    selectionSummary: '已选 {{count}} 个',
    selectionEmpty: '未选择'
  }
}
