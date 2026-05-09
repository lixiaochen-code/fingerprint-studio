import fs from 'node:fs'
import path from 'node:path'
import type { BrowserProfile, FingerprintConfig, HostOs, TargetOs, TargetOsChoice } from './types'

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

const macRenderers: Array<[string, string]> = [
  ['Apple Inc.', 'Apple M1'],
  ['Apple Inc.', 'Apple M2'],
  ['Apple Inc.', 'Apple M3'],
  ['Google Inc. (Apple)', 'ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)']
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
  const major = 120 + Math.floor(Math.random() * 12)
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

const TARGET_OPTIONS: TargetOs[] = ['windows', 'mac', 'linux']

export function resolveTargetOs(choice: TargetOsChoice | undefined, fallback: TargetOs): TargetOs {
  if (choice === 'windows' || choice === 'mac' || choice === 'linux') return choice
  if (choice === 'random') return pick(TARGET_OPTIONS)
  return fallback
}

export function hostOs(): HostOs {
  if (process.platform === 'win32') return 'win32'
  if (process.platform === 'darwin') return 'darwin'
  return 'linux'
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
    webglVendor: fingerprint.webglVendor,
    webglRenderer: fingerprint.webglRenderer,
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
      vendor: fingerprint.webglVendor,
      renderer: fingerprint.webglRenderer
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

export function ensureFingerprintExtension(profile: BrowserProfile) {
  const extensionPath = path.join(profile.profilePath, 'auto-registry-fingerprint-extension')
  fs.mkdirSync(extensionPath, { recursive: true })

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
        all_frames: true
      }
    ],
    web_accessible_resources: [
      {
        resources: ['inject.js'],
        matches: ['<all_urls>']
      }
    ]
  }

  const config = JSON.stringify(fingerprintPayload(profile.fingerprint))
  const content = `
const configTag = document.createElement('script');
configTag.id = 'auto-registry-fingerprint-config';
configTag.type = 'application/json';
configTag.textContent = ${JSON.stringify(config)};
(document.documentElement || document.head).appendChild(configTag);
const script = document.createElement('script');
script.src = chrome.runtime.getURL('inject.js');
script.onload = () => script.remove();
(document.documentElement || document.head).appendChild(script);
`

  const inject = `
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

  fs.writeFileSync(path.join(extensionPath, 'manifest.json'), JSON.stringify(manifest, null, 2))
  fs.writeFileSync(path.join(extensionPath, 'content.js'), content)
  fs.writeFileSync(path.join(extensionPath, 'inject.js'), inject)
  return extensionPath
}
