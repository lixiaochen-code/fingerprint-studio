import { NATIVE_TOSTRING_PATCH } from './patches/nativeToString'
import { NAVIGATOR_PATCH } from './patches/navigator'
import { CHROME_RUNTIME_PATCH } from './patches/chromeRuntime'
import { PERMISSIONS_PATCH } from './patches/permissions'
import { IFRAME_PATCH } from './patches/iframe'
import { GRAPHICS_PATCH } from './patches/graphics'
import { AUDIO_WEBRTC_PATCH } from './patches/audioWebrtc'
import { BATTERY_PATCH } from './patches/battery'

/**
 * Stealth patch 开关 — 单 patch 失败/触发更严检测时可关掉做二分。
 * 主进程从环境变量 AUTO_REGISTRY_STEALTH_DISABLE (逗号分隔) 解析出禁用列表,
 * 默认全开。
 */
export type StealthPatchToggles = {
  nativeToString: boolean // 不应关闭 — 关掉后所有其他 patch 都暴露;保留是为了诊断
  navigator: boolean
  chromeRuntime: boolean
  permissions: boolean
  iframe: boolean
  graphics: boolean
  audioWebrtc: boolean
  battery: boolean
}

export const DEFAULT_STEALTH_TOGGLES: StealthPatchToggles = {
  nativeToString: true,
  navigator: true,
  chromeRuntime: true,
  permissions: true,
  iframe: true,
  graphics: true,
  audioWebrtc: true,
  battery: true
}

/**
 * 把所有 patch 拼成一个 IIFE,在 document_start 时刻于目标页面执行。
 *
 * 协议(由 fingerprint.ts 配套的 content.js 提供):
 *   1. 页面已有 <script id="auto-registry-fingerprint-config" type="application/json">PAYLOAD</script>
 *   2. 我们读取并 JSON.parse,然后立刻 remove 配置节点(留着也是痕迹)
 *   3. 注入 helper(由 NATIVE_TOSTRING_PATCH 定义)
 *   4. 按 toggles 顺序拼接各 patch — 顺序很重要:
 *      nativeToString → navigator → chromeRuntime → permissions → iframe → graphics → audioWebrtc → battery
 */
export function buildStealthInjectScript(
  toggles: StealthPatchToggles = DEFAULT_STEALTH_TOGGLES
): string {
  const sections: string[] = []
  // nativeToString 必须最先注入;它定义了 helper 这个所有 patch 共用的工具对象
  if (toggles.nativeToString) sections.push(NATIVE_TOSTRING_PATCH)
  if (toggles.navigator) sections.push(NAVIGATOR_PATCH)
  if (toggles.chromeRuntime) sections.push(CHROME_RUNTIME_PATCH)
  if (toggles.permissions) sections.push(PERMISSIONS_PATCH)
  if (toggles.iframe) sections.push(IFRAME_PATCH)
  if (toggles.graphics) sections.push(GRAPHICS_PATCH)
  if (toggles.audioWebrtc) sections.push(AUDIO_WEBRTC_PATCH)
  if (toggles.battery) sections.push(BATTERY_PATCH)

  return `
(() => {
  const configNode = document.getElementById('auto-registry-fingerprint-config');
  if (!configNode) return;
  let payload;
  try { payload = JSON.parse(configNode.textContent || '{}'); } catch (e) { return; }
  configNode.remove();

  ${sections.join('\n  ')}
})();
`
}

/**
 * 解析环境变量 AUTO_REGISTRY_STEALTH_DISABLE,把禁用项从默认 toggles 翻转。
 * 例:AUTO_REGISTRY_STEALTH_DISABLE=iframe,battery → iframe/battery 关闭,其他保留默认。
 */
export function togglesFromEnv(env: NodeJS.ProcessEnv = process.env): StealthPatchToggles {
  const raw = env.AUTO_REGISTRY_STEALTH_DISABLE
  if (!raw) return { ...DEFAULT_STEALTH_TOGGLES }
  const disabled = new Set(
    raw
      .split(',')
      .map((token) => token.trim())
      .filter(Boolean)
  )
  const result = { ...DEFAULT_STEALTH_TOGGLES }
  for (const key of Object.keys(result) as Array<keyof StealthPatchToggles>) {
    if (disabled.has(key)) result[key] = false
  }
  return result
}
