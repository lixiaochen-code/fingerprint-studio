import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { promisify } from 'node:util'
import { app, BrowserWindow, dialog, ipcMain, shell, type OpenDialogOptions } from 'electron'
import { Browser, getInstalledBrowsers, getVersionComparator } from '@puppeteer/browsers'
import { makeFingerprint, ProfileStore } from './store'
import type { BrowserProfile, BrowserRuntimeStatus, FingerprintMode, FingerprintConfig, ProfileDraft, RuntimeInfo } from './types'

const isDev = !app.isPackaged
const execFileAsync = promisify(execFile)
let mainWindow: BrowserWindow | undefined
let store: ProfileStore
const profileProcesses = new Map<string, ChildProcess>()

function appLocale() {
  return app.getLocale().toLowerCase().startsWith('zh') ? 'zh' : 'en'
}

function message(en: string, zh: string) {
  return appLocale() === 'zh' ? zh : en
}

function fingerprintMode(): FingerprintMode {
  const mode = (process.env.AUTO_REGISTRY_FINGERPRINT_MODE || '').toLowerCase()
  if (mode === 'off' || mode === 'extension' || mode === 'itbrowser') return mode
  if (process.env.AUTO_REGISTRY_ENABLE_FINGERPRINT === '0') return 'off'
  if (process.env.AUTO_REGISTRY_ENABLE_FINGERPRINT === '1') return 'itbrowser'
  return 'extension'
}

function fingerprintSpoofingEnabled() {
  return fingerprintMode() !== 'off'
}

function runtimeStatus(): BrowserRuntimeStatus[] {
  return store.list().map((profile) => ({
    profileId: profile.id,
    running: Boolean(profileProcesses.get(profile.id) && !profileProcesses.get(profile.id)?.killed)
  }))
}

function proxyUrl(profile: BrowserProfile) {
  return `http://${profile.proxy.host}:${profile.proxy.port}`
}

function managedBrowserCacheDir() {
  return path.join(process.cwd(), '.browsers')
}

function configuredBrowserPath() {
  return process.env.AUTO_REGISTRY_BROWSER_PATH || process.env.AUTO_REGISTRY_CHROMIUM || process.env.AUTO_REGISTRY_CHROME
}

async function managedChromeExecutablePath() {
  const overridePath = configuredBrowserPath()
  if (overridePath && fs.existsSync(overridePath)) return overridePath

  const installedBrowsers = await getInstalledBrowsers({ cacheDir: managedBrowserCacheDir() })
  const installedChromium = installedBrowsers
    .filter((browser) => browser.browser === Browser.CHROMIUM)
    .filter((browser) => fs.existsSync(browser.executablePath))
    .sort((a, b) => getVersionComparator(Browser.CHROMIUM)(b.buildId, a.buildId))
  const installedChrome = installedBrowsers
    .filter((browser) => browser.browser === Browser.CHROME)
    .filter((browser) => fs.existsSync(browser.executablePath))
    .sort((a, b) => getVersionComparator(Browser.CHROME)(b.buildId, a.buildId))

  const found = installedChromium[0]?.executablePath || installedChrome[0]?.executablePath
  if (!found) {
    throw new Error(message(
      'No managed Chromium/Chrome was found. Run pnpm run browser:install:chromium first.',
      '没有找到应用管理的 Chromium/Chrome，请先运行 pnpm run browser:install:chromium'
    ))
  }
  return found
}

async function runtimeInfo(): Promise<RuntimeInfo> {
  const browserPath = await managedChromeExecutablePath()
  const browserKind = configuredBrowserPath()
    ? 'custom'
    : browserPath.includes('/chromium/')
      ? 'chromium'
      : 'chrome-for-testing'

  return {
    browserPath,
    browserKind,
    fingerprintMode: fingerprintMode(),
    fingerprintSpoofingEnabled: fingerprintSpoofingEnabled(),
    managedBrowserCacheDir: managedBrowserCacheDir()
  }
}

function mergeRecord(target: Record<string, unknown>, patch: Record<string, unknown>) {
  for (const [key, value] of Object.entries(patch)) {
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      target[key] &&
      typeof target[key] === 'object' &&
      !Array.isArray(target[key])
    ) {
      mergeRecord(target[key] as Record<string, unknown>, value as Record<string, unknown>)
    } else {
      target[key] = value
    }
  }
}

function enableExtensionDeveloperMode(profilePath: string) {
  const defaultProfilePath = path.join(profilePath, 'Default')
  const preferencesPath = path.join(defaultProfilePath, 'Preferences')
  const initialPreferencesPath = path.join(profilePath, 'initial_preferences')
  const masterPreferencesPath = path.join(profilePath, 'master_preferences')
  fs.mkdirSync(defaultProfilePath, { recursive: true })

  let preferences: Record<string, unknown> = {}
  if (fs.existsSync(preferencesPath)) {
    try {
      preferences = JSON.parse(fs.readFileSync(preferencesPath, 'utf8')) as Record<string, unknown>
    } catch {
      preferences = {}
    }
  }

  mergeRecord(preferences, {
    extensions: {
      ui: {
        developer_mode: true
      }
    },
    'extensions.ui.developer_mode': true
  })

  fs.writeFileSync(preferencesPath, JSON.stringify(preferences, null, 2))
  fs.writeFileSync(initialPreferencesPath, JSON.stringify(preferences, null, 2))
  fs.writeFileSync(masterPreferencesPath, JSON.stringify(preferences, null, 2))
}

function fingerprintPayload(fingerprint: FingerprintConfig) {
  const languages = [fingerprint.language, String(fingerprint.language || '').split('-')[0]].filter(Boolean)
  return {
    schemaVersion: 1,
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

function writeFingerprintPayload(profile: BrowserProfile) {
  const configPath = path.join(profile.profilePath, 'fingerprint.json')
  fs.writeFileSync(configPath, JSON.stringify(fingerprintPayload(profile.fingerprint), null, 2))
  return configPath
}

function ensureFingerprintExtension(profile: BrowserProfile) {
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
  const viewport = payload.viewport || {};
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

function assertLaunchableBrowser(browserPath: string) {
  if (process.platform !== 'win32' && browserPath.toLowerCase().endsWith('.exe')) {
    throw new Error(message(
      `The configured browser is a Windows executable and cannot run on ${process.platform}: ${browserPath}`,
      `当前配置的浏览器是 Windows 可执行文件，无法在 ${process.platform} 上运行：${browserPath}`
    ))
  }
}

function findManifestDir(root: string): string | undefined {
  const entries = fs.readdirSync(root, { withFileTypes: true })
  if (entries.some((entry) => entry.isFile() && entry.name === 'manifest.json')) {
    return root
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const found = findManifestDir(path.join(root, entry.name))
    if (found) return found
  }
  return undefined
}

async function importPluginZip() {
  const dialogOptions: OpenDialogOptions = {
    title: message('Select extension ZIP', '选择插件 ZIP'),
    properties: ['openFile'],
    filters: [{ name: 'Chrome Extension ZIP', extensions: ['zip'] }]
  }
  const result = mainWindow
    ? await dialog.showOpenDialog(mainWindow, dialogOptions)
    : await dialog.showOpenDialog(dialogOptions)
  if (result.canceled || !result.filePaths[0]) return undefined

  const zipPath = result.filePaths[0]
  const pluginRoot = path.join(app.getPath('userData'), 'registry-data', 'plugins')
  const tempDir = path.join(os.tmpdir(), `auto-registry-plugin-${Date.now()}`)
  fs.mkdirSync(tempDir, { recursive: true })
  fs.mkdirSync(pluginRoot, { recursive: true })
  await execFileAsync('unzip', ['-q', '-o', zipPath, '-d', tempDir])

  const manifestDir = findManifestDir(tempDir)
  if (!manifestDir) {
    throw new Error(message(
      'manifest.json was not found in the ZIP. Please confirm this is a Chrome extension package.',
      'ZIP 中没有找到 manifest.json，请确认这是 Chrome 扩展插件包'
    ))
  }

  const manifest = JSON.parse(fs.readFileSync(path.join(manifestDir, 'manifest.json'), 'utf8')) as {
    name?: string
    version?: string
    description?: string
    manifest_version?: number
  }
  const name = manifest.name?.trim() || path.basename(zipPath, '.zip')
  const version = manifest.version?.trim() || '0.0.0'
  const targetDir = path.join(pluginRoot, `${name.replace(/[^a-z0-9._-]+/gi, '_')}-${version}-${Date.now().toString(36)}`)
  fs.cpSync(manifestDir, targetDir, { recursive: true })

  return store.addPluginVersion({
    name,
    version,
    description: manifest.description,
    manifestVersion: manifest.manifest_version,
    optionsPage: (manifest as { options_ui?: { page?: string }; options_page?: string }).options_ui?.page || (manifest as { options_page?: string }).options_page,
    popupPage: (manifest as { action?: { default_popup?: string }; browser_action?: { default_popup?: string } }).action?.default_popup || (manifest as { browser_action?: { default_popup?: string } }).browser_action?.default_popup,
    sourceZip: zipPath,
    path: targetDir
  })
}

async function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1080,
    minHeight: 700,
    backgroundColor: '#f3f0ea',
    title: 'Auto Registry',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      devTools: true
    }
  })

  if (isDev) {
    await mainWindow.loadURL('http://127.0.0.1:5173')
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    await mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

async function launchProfile(profile: BrowserProfile) {
  const existing = profileProcesses.get(profile.id)
  if (existing && !existing.killed) {
    await shell.showItemInFolder(profile.profilePath)
    return
  }

  const mode = fingerprintMode()
  const fingerprintEnabled = mode !== 'off'
  const activePlugins = store.activePluginVersions(profile.enabledPluginIds)
  const extensionPaths = [
    ...(fingerprintEnabled ? [ensureFingerprintExtension(profile)] : []),
    ...activePlugins.map((plugin) => plugin.path)
  ].join(',')
  enableExtensionDeveloperMode(profile.profilePath)
  
  const args = [
    `--user-data-dir=${profile.profilePath}`,
    `--proxy-server=${proxyUrl(profile)}`,
    `--window-size=${profile.fingerprint.viewport.width},${profile.fingerprint.viewport.height}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-mode',
    '--enable-extensions'
  ]

  if (fingerprintEnabled) {
    const fingerprintConfigPath = writeFingerprintPayload(profile)
    if (mode === 'itbrowser') {
    args.push(`--itbrowser=${fingerprintConfigPath}`)
    }

    args.push(`--user-agent=${profile.fingerprint.userAgent}`)
    args.push(`--lang=${profile.fingerprint.language}`)
    args.push(`--force-webrtc-ip-handling-policy=${profile.fingerprint.webRtcPolicy === 'disable-non-proxied-udp' ? 'disable_non_proxied_udp' : 'default'}`)
  }

  if (extensionPaths) {
    args.push(`--disable-extensions-except=${extensionPaths}`)
    args.push(`--load-extension=${extensionPaths}`)
  }
  args.push(profile.startUrl)

  const browserPath = await managedChromeExecutablePath()
  assertLaunchableBrowser(browserPath)
  const child = spawn(browserPath, args, {
    detached: true,
    stdio: 'ignore'
  })
  child.unref()
  profileProcesses.set(profile.id, child)
  child.on('exit', () => profileProcesses.delete(profile.id))
  store.markOpened(profile.id)
}

function stopProfile(profileId: string) {
  const child = profileProcesses.get(profileId)
  if (!child) return
  child.kill()
  profileProcesses.delete(profileId)
}

app.whenReady().then(async () => {
  store = new ProfileStore()
  ipcMain.handle('profiles:list', () => store.list())
  ipcMain.handle('profiles:save', (_event, draft: ProfileDraft) => store.upsert(draft))
  ipcMain.handle('profiles:remove', (_event, id: string) => store.remove(id))
  ipcMain.handle('profiles:randomFingerprint', () => makeFingerprint())
  ipcMain.handle('profiles:status', () => runtimeStatus())
  ipcMain.handle('profiles:launch', async (_event, id: string) => {
    const profile = store.get(id)
    if (!profile) throw new Error('Profile not found')
    await launchProfile(profile)
  })
  ipcMain.handle('profiles:stop', (_event, id: string) => stopProfile(id))
  ipcMain.handle('plugins:list', () => store.listPlugins())
  ipcMain.handle('plugins:importZip', () => importPluginZip())
  ipcMain.handle('plugins:setActiveVersion', (_event, pluginId: string, versionId: string) => store.setActivePluginVersion(pluginId, versionId))
  ipcMain.handle('plugins:remove', (_event, pluginId: string) => store.removePlugin(pluginId))
  ipcMain.handle('runtime:info', () => runtimeInfo())

  await createMainWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    void createMainWindow()
  }
})
