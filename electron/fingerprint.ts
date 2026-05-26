import fs from 'node:fs'
import path from 'node:path'
import type { BrowserProfile, FingerprintConfig, HostOs, TargetOs, TargetOsChoice } from './types'
import { buildStealthInjectScript, togglesFromEnv } from './stealth'

const languages = ['zh-CN', 'en-US', 'en-GB', 'ja-JP', 'de-DE', 'fr-FR']
const timezones = ['Asia/Shanghai', 'America/Los_Angeles', 'America/New_York', 'Europe/London', 'Europe/Berlin', 'Asia/Tokyo']
const viewports = [
  { width: 1440, height: 900 },
  { width: 1536, height: 864 },
  { width: 1600, height: 900 },
  { width: 1920, height: 1080 },
  { width: 1366, height: 768 }
]

const macFonts = ['PingFang SC', 'Hiragino Sans', 'Helvetica Neue', 'Arial', 'Songti SC']
const macFontsAlt = ['Helvetica Neue', 'Arial', 'Times New Roman', 'Courier New', 'Verdana']
const windowsFonts = ['Segoe UI', 'Calibri', 'Cambria', 'Arial', 'Verdana']
const linuxFonts = ['Ubuntu', 'DejaVu Sans', 'Liberation Sans', 'Arial', 'Noto Sans']

// macOS 真实 Chrome 的 WebGL renderer 永远是 ANGLE 包装格式 —— Chromium 在 Mac 用 Metal
// 后端,所有 WebGL 调用穿过 ANGLE 翻译层,UNMASKED 返回值必带 "ANGLE (Apple, ANGLE Metal
// Renderer: ...)" 前缀。裸 "Apple Inc." / "Apple M2" 是 chrome://gpu 内部显示格式,
// **不是** JS 端 `gl.getParameter(UNMASKED_RENDERER_WEBGL)` 真实能拿到的字符串。
// Cloudflare/Turnstile 一句 `renderer.includes('ANGLE')` 就识破。所有条目必须是 ANGLE 格式。
const macRenderers: Array<[string, string]> = [
  ['Google Inc. (Apple)', 'ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified Version)'],
  ['Google Inc. (Apple)', 'ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Unspecified Version)'],
  ['Google Inc. (Apple)', 'ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)'],
  ['Google Inc. (Apple)', 'ANGLE (Apple, ANGLE Metal Renderer: Apple M2 Pro, Unspecified Version)'],
  ['Google Inc. (Apple)', 'ANGLE (Apple, ANGLE Metal Renderer: Apple M3, Unspecified Version)'],
  ['Google Inc. (Apple)', 'ANGLE (Apple, ANGLE Metal Renderer: Apple M3 Pro, Unspecified Version)'],
  ['Google Inc. (Apple)', 'ANGLE (Apple, ANGLE Metal Renderer: Apple M4, Unspecified Version)']
]
const windowsRenderers: Array<[string, string]> = [
  ['Google Inc. (Intel)', 'ANGLE (Intel, Intel(R) Iris(TM) Plus Graphics, OpenGL 4.1)'],
  ['Google Inc. (NVIDIA)', 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1660, OpenGL 4.1)'],
  ['Google Inc. (AMD)', 'ANGLE (AMD, AMD Radeon RX 580, Direct3D11 vs_5_0 ps_5_0)']
]
const linuxRenderers: Array<[string, string]> = [
  ['Google Inc. (Intel)', 'ANGLE (Intel, Mesa Intel(R) UHD Graphics, OpenGL 4.6)'],
  ['Google Inc. (AMD)', 'ANGLE (AMD, AMD Radeon Graphics, OpenGL 4.6)']
]

function pick<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)]
}

function chromeVersion() {
  // 范围必须 ≥ Cloudflare Turnstile 的最低门槛(2026Q2 起为 v146+)。低于这个范围
  // 直接被官方 "Unsupported Browser" 拦截。同时启动期还会被 alignUserAgentWithKernel
  // 强制改成真实 kernel 版本,这里只是 profile 持久化时的兜底 —— 即便 kernel 没装好
  // 也别让 UA 跌破门槛。需要时同步抬高下限。
  const major = 146 + Math.floor(Math.random() * 4)
  return `${major}.0.${Math.floor(1000 + Math.random() * 7999)}.${Math.floor(10 + Math.random() * 89)}`
}

function profileForTarget(target: TargetOs) {
  if (target === 'windows') {
    return {
      platform: 'Win32',
      osToken: 'Windows NT 10.0; Win64; x64',
      fonts: windowsFonts,
      renderers: windowsRenderers
    }
  }
  if (target === 'linux') {
    return {
      platform: 'Linux x86_64',
      osToken: 'X11; Linux x86_64',
      fonts: linuxFonts,
      renderers: linuxRenderers
    }
  }
  return {
    platform: 'MacIntel',
    osToken: 'Macintosh; Intel Mac OS X 10_15_7',
    fonts: pick([macFonts, macFontsAlt]),
    renderers: macRenderers
  }
}

function userAgentFor(osToken: string) {
  return `Mozilla/5.0 (${osToken}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion()} Safari/537.36`
}

/**
 * Phase 1d 起 `targetOs` 行为锁死到宿主 OS:UI 上"目标系统"下拉框保留是兼容历史
 * 字段,但**实际启动时**永远回到宿主 OS。
 *
 * 为什么:跨 OS 伪装这条路对 Cloudflare/Turnstile 已经死了 ——
 *   - `--user-agent` flag 即便值与真实内核完全对齐,Turnstile 仍能从 client hints
 *     (`navigator.userAgentData.getHighEntropyValues`)读出真实平台/版本号矛盾
 *   - sec-ch-ua-platform / sec-ch-ua-platform-version HTTP header 是 Chromium
 *     从内核硬编码读的,任何 CLI flag 都改不了
 *   - WebGL / 字体 / 时区与 OS 也强相关,inject 层盖不全
 *
 * 因此整个反检测策略转向"OS 维度真实,容器维度差异化":每个 profile 之间靠 viewport /
 * Canvas/Audio noise / hardwareConcurrency / deviceMemory / DPR / WebGL renderer
 * (同 GPU 家族不同 ANGLE 包装) / 字体 / 时区 / 语言 这些字段做差异化,而不是装成另一种 OS。
 *
 * 用户在 UI 选"Windows"在 Mac 上跑 → 我们尊重历史输入但实际按 Mac 跑,且 UI 应该展示提示。
 * 用户选"random" → 也只在宿主 OS 内做差异(实质上等价于"宿主 OS")。
 */
export function resolveTargetOs(_choice: TargetOsChoice | undefined, _fallback: TargetOs): TargetOs {
  return defaultTargetOs()
}

export function hostOs(): HostOs {
  if (process.platform === 'win32') return 'win32'
  if (process.platform === 'darwin') return 'darwin'
  return 'linux'
}

export function fingerprintSeed(profileId: string): number {
  let hash = 2166136261
  for (let i = 0; i < profileId.length; i++) {
    hash ^= profileId.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return Math.abs(hash >>> 0)
}

export function defaultTargetOs(): TargetOs {
  const host = hostOs()
  if (host === 'win32') return 'windows'
  if (host === 'darwin') return 'mac'
  return 'linux'
}

export function makeFingerprint(partial?: Partial<FingerprintConfig>, choice?: TargetOsChoice): FingerprintConfig {
  const target = resolveTargetOs(choice, partial?.targetOs ?? defaultTargetOs())
  const profile = profileForTarget(target)
  const viewport = partial?.viewport ?? pick(viewports)
  const sameTarget = partial?.targetOs === target
  const [webglVendor, webglRenderer] = sameTarget && partial?.webglVendor && partial?.webglRenderer
    ? [partial.webglVendor, partial.webglRenderer]
    : pick(profile.renderers)

  const userAgent = sameTarget && partial?.userAgent && partial.userAgent.includes(profile.osToken)
    ? partial.userAgent
    : userAgentFor(profile.osToken)

  return {
    targetOs: target,
    userAgent,
    language: partial?.language ?? pick(languages),
    timezone: partial?.timezone ?? pick(timezones),
    viewport,
    screen: partial?.screen ?? {
      availWidth: viewport.width,
      availHeight: viewport.height - pick([24, 40, 72]),
      colorDepth: pick([24, 30]),
      pixelDepth: pick([24, 30])
    },
    platform: profile.platform,
    hardwareConcurrency: partial?.hardwareConcurrency ?? pick([4, 6, 8, 10, 12]),
    deviceMemory: partial?.deviceMemory ?? pick([4, 8, 16]),
    deviceScaleFactor: partial?.deviceScaleFactor ?? pick([1, 1.25, 1.5, 2]),
    maxTouchPoints: partial?.maxTouchPoints ?? pick([0, 0, 0, 1, 5]),
    doNotTrack: partial?.doNotTrack ?? pick(['1', '0', 'unspecified']),
    webRtcPolicy: partial?.webRtcPolicy ?? 'disable-non-proxied-udp',
    canvasNoise: partial?.canvasNoise ?? Number((Math.random() * 0.00001).toFixed(8)),
    audioNoise: partial?.audioNoise ?? Number((Math.random() * 0.00001).toFixed(8)),
    webglVendor,
    webglRenderer,
    fonts: sameTarget && partial?.fonts?.length ? partial.fonts : profile.fonts
  }
}

export function fingerprintPayload(fingerprint: FingerprintConfig) {
  const languages = [fingerprint.language, String(fingerprint.language || '').split('-')[0]].filter(Boolean)
  // 跨 OS 时 WebGL 伪造一定漏 —— getSupportedExtensions / getShaderPrecisionFormat / 渲染基准
  // 都强相关于真实 GPU 家族,inject 层盖不住。Turnstile 已经能识破"WebGL renderer is spoofed",
  // 索性在 payload 边界把 webgl 字段清空,graphics patch 看到空就完全跳过 WebGL hook,让真实
  // GPU 透出。牺牲 OS 伪装强度换不被识破 —— 想要跨 OS 全套伪造请走 cloak/itbrowser。
  const host = hostOs()
  const hostMatchesTarget =
    (host === 'darwin' && fingerprint.targetOs === 'mac') ||
    (host === 'win32' && fingerprint.targetOs === 'windows') ||
    (host === 'linux' && fingerprint.targetOs === 'linux')
  let webglVendor = hostMatchesTarget ? fingerprint.webglVendor : ''
  let webglRenderer = hostMatchesTarget ? fingerprint.webglRenderer : ''
  // 兜底:旧 profile 可能存了裸格式 renderer(早期 macRenderers 数组里有 'Apple Inc.'/'Apple M2'
  // 这种不带 ANGLE 包装的条目)。真实 Chrome 不论平台 UNMASKED_RENDERER 都是 ANGLE 包装,
  // 不含 ANGLE 的字符串一定假。任一字段不达标就整体清空 —— 让真实 GPU 信息透出比硬撑被识破强。
  // 用户想要好的伪造,UI 上重新摇一次 fingerprint 即可拿到 ANGLE 格式条目。
  if (webglRenderer && !webglRenderer.includes('ANGLE')) {
    webglVendor = ''
    webglRenderer = ''
  }
  if (webglVendor && !webglVendor.startsWith('Google Inc.') && !webglVendor.startsWith('Google ')) {
    webglVendor = ''
    webglRenderer = ''
  }
  return {
    schemaVersion: 1,
    targetOs: fingerprint.targetOs,
    userAgent: fingerprint.userAgent,
    language: fingerprint.language,
    languages,
    platform: fingerprint.platform,
    hardwareConcurrency: fingerprint.hardwareConcurrency || 8,
    deviceMemory: fingerprint.deviceMemory || 8,
    timezone: fingerprint.timezone,
    webglVendor,
    webglRenderer,
    canvasNoise: fingerprint.canvasNoise,
    audioNoise: fingerprint.audioNoise,
    viewport: fingerprint.viewport,
    screen: fingerprint.screen,
    deviceScaleFactor: fingerprint.deviceScaleFactor,
    fonts: fingerprint.fonts,
    webRtcPolicy: fingerprint.webRtcPolicy,
    navigator: {
      userAgent: fingerprint.userAgent,
      language: fingerprint.language,
      languages,
      platform: fingerprint.platform,
      hardwareConcurrency: fingerprint.hardwareConcurrency || 8,
      deviceMemory: fingerprint.deviceMemory || 8,
      maxTouchPoints: fingerprint.maxTouchPoints || 0,
      doNotTrack: fingerprint.doNotTrack
    },
    locale: {
      language: fingerprint.language,
      languages,
      timezone: fingerprint.timezone
    },
    webgl: {
      vendor: webglVendor,
      renderer: webglRenderer
    },
    noise: {
      canvas: fingerprint.canvasNoise,
      audio: fingerprint.audioNoise
    }
  }
}

export function writeFingerprintPayload(profile: BrowserProfile) {
  const configPath = path.join(profile.profilePath, 'fingerprint.json')
  fs.writeFileSync(configPath, JSON.stringify(fingerprintPayload(profile.fingerprint), null, 2))
  return configPath
}

export type FingerprintInjectMode = 'stealth' | 'extension'

/**
 * Legacy inject — 由 `mode='extension'` 触发,作为 stealth 路径的快速回滚通道。
 * 已知漏洞:Object.defineProperty 的 getter 用箭头函数,`.get.toString()` 暴露源码,
 * 一行 JS 就识破。仅保留作为应急对照,不要在 stealth 模式下使用。
 */
const LEGACY_INJECT = `
(() => {
  const configNode = document.getElementById('auto-registry-fingerprint-config');
  if (!configNode) return;
  const payload = JSON.parse(configNode.textContent || '{}');
  const nav = payload.navigator || {};
  const locale = payload.locale || {};
  const screen = payload.screen || {};
  const webgl = payload.webgl || {};
  const noise = payload.noise || {};
  configNode.remove();
  const define = (target, key, value) => {
    if (typeof value === 'undefined') return;
    try { Object.defineProperty(target, key, { get: () => value, configurable: true }); } catch {}
  };
  define(Navigator.prototype, 'userAgent', nav.userAgent);
  define(Navigator.prototype, 'appVersion', String(nav.userAgent || '').replace(/^Mozilla\\//, ''));
  define(Navigator.prototype, 'language', nav.language);
  define(Navigator.prototype, 'languages', nav.languages);
  define(Navigator.prototype, 'platform', nav.platform);
  define(Navigator.prototype, 'hardwareConcurrency', nav.hardwareConcurrency);
  define(Navigator.prototype, 'deviceMemory', nav.deviceMemory);
  define(Navigator.prototype, 'maxTouchPoints', nav.maxTouchPoints);
  define(Navigator.prototype, 'doNotTrack', nav.doNotTrack);
  define(Screen.prototype, 'colorDepth', screen.colorDepth);
  define(Screen.prototype, 'pixelDepth', screen.pixelDepth);

  const originalResolvedOptions = Intl.DateTimeFormat.prototype.resolvedOptions;
  Intl.DateTimeFormat.prototype.resolvedOptions = function() {
    return { ...originalResolvedOptions.call(this), locale: locale.language, timeZone: locale.timezone };
  };

  const patchWebGL = (Ctor) => {
    if (!Ctor?.prototype?.getParameter) return;
    const original = Ctor.prototype.getParameter;
    Ctor.prototype.getParameter = function(parameter) {
      if (parameter === 37445) return webgl.vendor;
      if (parameter === 37446) return webgl.renderer;
      return original.call(this, parameter);
    };
  };
  patchWebGL(window.WebGLRenderingContext);
  patchWebGL(window.WebGL2RenderingContext);

  const canvasNoise = Number(noise.canvas || 0);
  const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
  HTMLCanvasElement.prototype.toDataURL = function(...args) {
    try {
      const context = this.getContext('2d');
      if (context && canvasNoise) {
        context.globalAlpha = Math.max(0.9999, 1 - canvasNoise);
        context.fillStyle = 'rgba(1,1,1,0.001)';
        context.fillRect(0, 0, 1, 1);
      }
    } catch {}
    return originalToDataURL.apply(this, args);
  };
  const originalGetImageData = CanvasRenderingContext2D.prototype.getImageData;
  CanvasRenderingContext2D.prototype.getImageData = function(...args) {
    const data = originalGetImageData.apply(this, args);
    if (canvasNoise && data.data.length >= 4) {
      data.data[0] = (data.data[0] + 1) % 255;
    }
    return data;
  };

  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  const originalCreateAnalyser = AudioContextCtor?.prototype?.createAnalyser;
  if (originalCreateAnalyser) {
    AudioContextCtor.prototype.createAnalyser = function(...args) {
      const analyser = originalCreateAnalyser.apply(this, args);
      const originalGetFloatFrequencyData = analyser.getFloatFrequencyData.bind(analyser);
      analyser.getFloatFrequencyData = (array) => {
        originalGetFloatFrequencyData(array);
        const audioNoise = Number(noise.audio || 0);
        for (let i = 0; i < array.length; i += 16) array[i] += audioNoise;
      };
      return analyser;
    };
  }

  const originalRTCPeerConnection = window.RTCPeerConnection;
  if (originalRTCPeerConnection && payload.webRtcPolicy === 'disable-non-proxied-udp') {
    window.RTCPeerConnection = function(configuration = {}, ...rest) {
      return new originalRTCPeerConnection({ ...configuration, iceTransportPolicy: 'relay' }, ...rest);
    };
    window.RTCPeerConnection.prototype = originalRTCPeerConnection.prototype;
  }

  const fontSet = new Set(payload.fonts || []);
  if (document.fonts?.check) {
    const originalCheck = document.fonts.check.bind(document.fonts);
    document.fonts.check = (font, text) => {
      const quoted = String(font).match(/["']([^"']+)["']/)?.[1];
      const family = quoted || String(font).split(',').pop()?.trim().split(' ').pop();
      return family && fontSet.has(family) ? true : originalCheck(font, text);
    };
  }
})();
`

/**
 * @deprecated Phase 1d 起 chromium 路径不再传 `--user-agent`,所以也不再需要在启动时
 * 把 profile.fingerprint.userAgent 对齐到真实内核版本。保留实现仅供后续可能的 itbrowser /
 * cloak 内核侧 fingerprint payload 写盘时复用,目前不在调用链中。
 */
function alignUserAgentWithKernel(userAgent: string, kernelVersion: string | undefined): string {
  if (!kernelVersion) return userAgent
  // 真实版本至少要形如 a.b.c.d(Chrome for Testing 用满四段)。Chromium 老快照号
  // (纯数字 build id)和 cloak 自定义版本号不在此覆盖,免得改坏。
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(kernelVersion)) return userAgent
  return userAgent.replace(/Chrome\/[\d.]+/, `Chrome/${kernelVersion}`)
}

export function ensureFingerprintExtension(profile: BrowserProfile, mode: FingerprintInjectMode = 'stealth') {
  const extensionPath = path.join(profile.profilePath, 'auto-registry-fingerprint-extension')
  fs.mkdirSync(extensionPath, { recursive: true })

  // MV3 content_scripts.world="MAIN" (Chrome 111+) 让脚本直接在页面主世界跑,
  // 不再需要"isolated content.js → <script src=inject.js> → 主世界"的异步中转。
  // 关键收益:patch 与页面其它 inline <script> 在同一个事件循环 tick 内被 Chromium
  // 排队,Cloudflare/Turnstile 的 challenge.js 来不及拍 navigator/window.chrome 的
  // 原始快照——之前的实现里 inject.js 是 async resource,challenge 脚本经常先跑完。
  const manifest = {
    manifest_version: 3,
    name: 'Auto Registry Fingerprint',
    version: '1.0.0',
    description: 'Applies per-profile browser fingerprint settings.',
    content_scripts: [
      {
        matches: ['<all_urls>'],
        js: ['content.js'],
        run_at: 'document_start',
        all_frames: true,
        world: 'MAIN'
      }
    ]
  }

  // mode='stealth' 走完整 patch 套件(含 nativeToString 伪装、webdriver/chrome/iframe/permissions 等)
  // mode='extension' 走老的 LEGACY_INJECT,留作快速回滚通道
  const inject = mode === 'stealth' ? buildStealthInjectScript(togglesFromEnv()) : LEGACY_INJECT

  // 注入脚本期望 `payload` 在词法作用域里(原来从 DOM 节点 JSON.parse 而来)。
  // world=MAIN 后已经在主世界,直接把 payload 内联成字面量 + 复用同一段 IIFE 即可。
  // 注:buildStealthInjectScript 和 LEGACY_INJECT 都自己读 'auto-registry-fingerprint-config'
  // 节点,我们这里在它们之前先把 payload 挂上,并放一个 stub 节点喂给它们,这样两套 inject
  // 都不用动。
  const payloadLiteral = JSON.stringify(fingerprintPayload(profile.fingerprint))
  const content = `(() => {
  try {
    const payload = ${payloadLiteral};
    // 兼容 buildStealthInjectScript / LEGACY_INJECT 里"读 DOM 配置节点"的协议:
    // 创建一个临时节点供 inject 读取,inject 内部会自己 remove。
    const root = document.documentElement || document.head || document.body;
    if (root) {
      const configTag = document.createElement('script');
      configTag.id = 'auto-registry-fingerprint-config';
      configTag.type = 'application/json';
      configTag.textContent = JSON.stringify(payload);
      root.appendChild(configTag);
    }
  } catch (e) {}
})();
${inject}`

  fs.writeFileSync(path.join(extensionPath, 'manifest.json'), JSON.stringify(manifest, null, 2))
  fs.writeFileSync(path.join(extensionPath, 'content.js'), content)
  // 旧的 inject.js 资源不再需要;若上次安装留下来了清理掉,免得旧文件让人误以为还走老路径。
  const legacyInjectPath = path.join(extensionPath, 'inject.js')
  try { fs.rmSync(legacyInjectPath, { force: true }) } catch {}
  return extensionPath
}
