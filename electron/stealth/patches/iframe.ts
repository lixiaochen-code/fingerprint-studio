/**
 * iframe contentWindow 与 srcdoc/about:blank iframe 反检测 patch。
 *
 * 痛点:站点会创建 iframe 然后探测 iframe.contentWindow.navigator.webdriver / window.chrome,
 * 因为 Chrome 扩展 content_scripts 对 same-origin srcdoc / about:blank iframe 注入时机
 * 不稳定 — 我们父页面 navigator 已 patch,但 iframe 的 navigator 可能还是原版,识破。
 *
 * 做法:hook HTMLIFrameElement.prototype.contentWindow getter — 拿到 iframe contentWindow
 * 后立刻把父页面的 navigator getter 应用到子 window 上。
 *
 * 注:cross-origin iframe 我们读不到 contentWindow 内容,但那也是站点读不到的,无所谓。
 * content_scripts all_frames: true 已经覆盖大部分,这里是双保险。
 */
export const IFRAME_PATCH = `
;(() => {
  const originalDesc = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'contentWindow');
  if (!originalDesc || !originalDesc.get) return;
  const originalGetter = originalDesc.get;

  // 把父页面 Navigator.prototype 上的伪造 getter 应用到子 window 的 Navigator.prototype
  // 注:同源 iframe 的 Navigator 与父页面是不同 realm,prototype 不共享
  function patchChildNavigator(childWindow) {
    try {
      if (!childWindow || !childWindow.Navigator) return;
      const childNavProto = childWindow.Navigator.prototype;
      const parentNavProto = Navigator.prototype;
      // 把父页面所有自定义 getter 同步过去
      const keys = ['webdriver', 'userAgent', 'appVersion', 'language', 'languages', 'platform',
        'hardwareConcurrency', 'deviceMemory', 'maxTouchPoints', 'doNotTrack', 'plugins', 'mimeTypes'];
      for (const key of keys) {
        const desc = Object.getOwnPropertyDescriptor(parentNavProto, key);
        if (desc && desc.get) {
          try {
            Object.defineProperty(childNavProto, key, {
              get: desc.get,
              set: undefined,
              configurable: true,
              enumerable: true
            });
          } catch (e) {}
        }
      }
      // chrome 对象同步
      if (window.chrome && !childWindow.chrome) {
        try {
          Object.defineProperty(childWindow, 'chrome', { value: window.chrome, writable: true, configurable: true });
        } catch (e) {}
      }
    } catch (e) {}
  }

  const proxiedGetter = function() {
    const win = originalGetter.call(this);
    patchChildNavigator(win);
    return win;
  };
  helper.markGetter(proxiedGetter, 'contentWindow');

  try {
    Object.defineProperty(HTMLIFrameElement.prototype, 'contentWindow', {
      get: proxiedGetter,
      set: undefined,
      configurable: true,
      enumerable: true
    });
  } catch (e) {}

  // 同样 hook contentDocument — 部分检测走 doc.defaultView 拿子 window
  const originalDocDesc = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'contentDocument');
  if (originalDocDesc && originalDocDesc.get) {
    const originalDocGetter = originalDocDesc.get;
    const proxiedDocGetter = function() {
      const doc = originalDocGetter.call(this);
      if (doc && doc.defaultView) patchChildNavigator(doc.defaultView);
      return doc;
    };
    helper.markGetter(proxiedDocGetter, 'contentDocument');
    try {
      Object.defineProperty(HTMLIFrameElement.prototype, 'contentDocument', {
        get: proxiedDocGetter,
        set: undefined,
        configurable: true,
        enumerable: true
      });
    } catch (e) {}
  }
})();
`
