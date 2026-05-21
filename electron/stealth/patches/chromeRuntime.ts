/**
 * window.chrome 对象完整性 patch。
 *
 * 痛点:Headless Chromium 默认没有 window.chrome,Headful Chrome 有,
 * 但 Cloudflare/Akamai 会进一步检测 window.chrome.runtime / app / csi / loadTimes
 * 字段是否完整且形态正确。我们 stealth profile 跑的是 Headful Chromium,window.chrome
 * 通常已存在,但缺少 runtime 子对象(无扩展 ID 暴露)— 反而像 "stripped" 自动化浏览器。
 *
 * 做法:确保 window.chrome 存在 + 补齐 runtime/app/csi/loadTimes,字段形态参考真实 Chrome。
 */
export const CHROME_RUNTIME_PATCH = `
;(() => {
  if (!window.chrome) {
    Object.defineProperty(window, 'chrome', { value: {}, writable: true, configurable: true });
  }
  const chrome = window.chrome;

  // chrome.app — 真实 Chrome 有,即使不是 ChromeOS
  if (!chrome.app) {
    Object.defineProperty(chrome, 'app', {
      value: {
        isInstalled: false,
        InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' },
        RunningState: { CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' },
        getDetails: helper.markMethod(function getDetails() { return null; }, 'getDetails'),
        getIsInstalled: helper.markMethod(function getIsInstalled() { return false; }, 'getIsInstalled'),
        runningState: helper.markMethod(function runningState() { return 'cannot_run'; }, 'runningState')
      },
      writable: true,
      configurable: true,
      enumerable: true
    });
  }

  // chrome.runtime — 真实 Headful Chrome 有 runtime 对象,但部分字段需扩展才完整
  // 我们至少要保证 runtime 存在 + onConnect/onMessage 等基本 EventTarget 形态
  if (!chrome.runtime) {
    const noopEvent = {
      addListener: helper.markMethod(function addListener() {}, 'addListener'),
      removeListener: helper.markMethod(function removeListener() {}, 'removeListener'),
      hasListener: helper.markMethod(function hasListener() { return false; }, 'hasListener')
    };
    Object.defineProperty(chrome, 'runtime', {
      value: {
        OnInstalledReason: { CHROME_UPDATE: 'chrome_update', INSTALL: 'install', SHARED_MODULE_UPDATE: 'shared_module_update', UPDATE: 'update' },
        OnRestartRequiredReason: { APP_UPDATE: 'app_update', OS_UPDATE: 'os_update', PERIODIC: 'periodic' },
        PlatformArch: { ARM: 'arm', ARM64: 'arm64', MIPS: 'mips', MIPS64: 'mips64', X86_32: 'x86-32', X86_64: 'x86-64' },
        PlatformNaclArch: { ARM: 'arm', MIPS: 'mips', MIPS64: 'mips64', X86_32: 'x86-32', X86_64: 'x86-64' },
        PlatformOs: { ANDROID: 'android', CROS: 'cros', LINUX: 'linux', MAC: 'mac', OPENBSD: 'openbsd', WIN: 'win' },
        RequestUpdateCheckStatus: { NO_UPDATE: 'no_update', THROTTLED: 'throttled', UPDATE_AVAILABLE: 'update_available' },
        connect: helper.markMethod(function connect() { throw new TypeError('Cannot read properties of undefined'); }, 'connect'),
        sendMessage: helper.markMethod(function sendMessage() { throw new TypeError('Cannot read properties of undefined'); }, 'sendMessage'),
        onConnect: noopEvent,
        onMessage: noopEvent,
        id: undefined
      },
      writable: true,
      configurable: true,
      enumerable: true
    });
  }

  // chrome.csi() — 老式性能 API,真实 Chrome 仍存在
  if (typeof chrome.csi !== 'function') {
    const startE = Date.now();
    Object.defineProperty(chrome, 'csi', {
      value: helper.markMethod(function csi() {
        return {
          startE,
          onloadT: startE + 281,
          pageT: 3947.235,
          tran: 15
        };
      }, 'csi'),
      writable: true, configurable: true, enumerable: true
    });
  }

  // chrome.loadTimes() — 旧 API,真实 Chrome 仍存在(deprecated 但不删)
  if (typeof chrome.loadTimes !== 'function') {
    const navStart = (performance.timing && performance.timing.navigationStart) || (Date.now() - 1000);
    Object.defineProperty(chrome, 'loadTimes', {
      value: helper.markMethod(function loadTimes() {
        const now = Date.now() / 1000;
        return {
          requestTime: navStart / 1000,
          startLoadTime: navStart / 1000,
          commitLoadTime: navStart / 1000 + 0.1,
          finishDocumentLoadTime: navStart / 1000 + 0.3,
          finishLoadTime: navStart / 1000 + 0.5,
          firstPaintTime: navStart / 1000 + 0.4,
          firstPaintAfterLoadTime: 0,
          navigationType: 'Other',
          wasFetchedViaSpdy: true,
          wasNpnNegotiated: true,
          npnNegotiatedProtocol: 'h2',
          wasAlternateProtocolAvailable: false,
          connectionInfo: 'h2'
        };
      }, 'loadTimes'),
      writable: true, configurable: true, enumerable: true
    });
  }
})();
`
