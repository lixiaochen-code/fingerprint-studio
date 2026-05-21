/**
 * 反检测模式的 i18n 字典 — 单一来源。
 *
 * App.tsx 顶部 Header 的 FingerprintBadge / 当前模式说明,以及 Phase 3 SettingsView 的
 * "Anti-detection mode" 卡片都从这里读,避免文案双份维护。
 */

export type FingerprintModeKey = 'stealth' | 'extension' | 'cloak' | 'itbrowser' | 'off'
export type Locale = 'en' | 'zh'

export type FingerprintModeLabel = {
  title: string
  description: string
}

export const FINGERPRINT_MODE_LABELS: Record<Locale, Record<FingerprintModeKey, FingerprintModeLabel>> = {
  en: {
    stealth: {
      title: 'Stealth mode (default)',
      description: 'Cross-platform strongest. A Chrome extension injects a full anti-detection patch suite at document_start: native-toString proxy, webdriver/chrome.runtime/plugins/permissions/iframe coherence, WebGL/Canvas/Audio noise. Designed to pass Cloudflare/Arkose/CreepJS without source-level kernel patches.'
    },
    extension: {
      title: 'Extension mode (legacy)',
      description: 'The pre-stealth implementation. Rewrites navigator/WebGL/Canvas/Audio via Object.defineProperty. Known issue: getter.toString() exposes the source — detectable in one line. Kept as a fallback if a stealth patch misbehaves.'
    },
    cloak: {
      title: 'Cloak mode',
      description: 'Uses CloakBrowser — a custom-built Chromium with 49+ source-level C++ patches covering canvas, WebGL, audio, fonts, GPU, screen, WebRTC, and automation signals. Strongest fingerprint coverage. Linux/Windows only (no macOS upstream binary).'
    },
    itbrowser: {
      title: 'itbrowser mode',
      description: 'Uses the patched itbrowser Chromium kernel via --itbrowser=fingerprint.json so the spoofing happens inside the browser engine. Strong fingerprint coverage but Windows-only.'
    },
    off: {
      title: 'Spoofing disabled',
      description: 'No fingerprint rewriting. Each environment still has an isolated user-data dir and proxy, but all fingerprint surfaces report the real machine.'
    }
  },
  zh: {
    stealth: {
      title: 'Stealth 模式 (默认)',
      description: '跨平台最强反检测。Chrome 扩展在 document_start 时刻注入完整 patch 套件:native-toString 代理、webdriver/chrome.runtime/plugins/permissions/iframe 一致性、WebGL/Canvas/Audio 加噪。目标:在不打内核补丁的前提下通过 Cloudflare/Arkose/CreepJS 检测。'
    },
    extension: {
      title: '扩展模式 (legacy)',
      description: 'stealth 之前的旧实现。通过 Object.defineProperty 改写 navigator/WebGL/Canvas/Audio。已知问题:getter.toString() 暴露源码,一行 JS 可识破。保留作为 stealth patch 异常时的回滚通道。'
    },
    cloak: {
      title: 'Cloak 模式',
      description: '使用 CloakBrowser — 自定义编译的 Chromium,包含 49+ 项 C++ 源码级补丁,覆盖 canvas、WebGL、audio、字体、GPU、screen、WebRTC、自动化信号等。指纹强度最高。仅 Linux/Windows 提供二进制 (macOS 上游未发布)。'
    },
    itbrowser: {
      title: 'itbrowser 模式',
      description: '使用打过补丁的 itbrowser Chromium 内核,通过 --itbrowser=fingerprint.json 在内核层面改写指纹。强度高但仅 Windows 可用。'
    },
    off: {
      title: '未启用',
      description: '不改写指纹。每个环境仍使用独立的 user-data 目录和代理,但所有指纹面都暴露真实机器信息。'
    }
  }
}
