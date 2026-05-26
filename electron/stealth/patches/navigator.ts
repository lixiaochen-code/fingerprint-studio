/**
 * navigator.* 与相关属性的反检测 patch。
 *
 * 关键覆盖点:
 * - navigator.webdriver — 必须为 false(headful Chrome 默认 undefined,但我们 stub 成 false
 *   是更稳的选择;一些站点会同时检测 'undefined' 和 'true'/'false',false 最常见且安全)
 * - language / languages / hardwareConcurrency / deviceMemory / maxTouchPoints / DNT —
 *   这些是"可以安全伪造"的字段:它们不与 Chromium 内部 client hints / sec-ch-ua-* 交叉校验,
 *   每个 profile 不同也无法被识破。维持一份 payload-driven 差异化指纹的核心承重者。
 * - plugins / mimeTypes — 真实 Chrome 至少有 5 个 plugin(PDF Viewer 系列),空数组立刻识破
 *
 * **故意不 hook 的字段**:
 * - userAgent / appVersion / platform — Phase 1d 起 chromium 路径放弃 OS 维度伪装,
 *   navigator.userAgent 让 Chromium 走默认值,与 sec-ch-ua-platform / userAgentData
 *   天然一致。hook 这些字段反而会和 client hints 矛盾,触发 Turnstile 600010。
 *   跨 OS 伪装走 cloak / itbrowser 内核(它们在 Chromium 编译期改了 client hints 来源)。
 *
 * 注:
 * - 改 prototype 而不是 instance,确保 iframe 内 (通过 iframe patch 同步) 也生效
 * - plugins 用 Plugin/PluginArray/MimeTypeArray 原型构造,instanceof 检测能过
 */
export const NAVIGATOR_PATCH = `
;(() => {
  const navProto = Navigator.prototype;
  const nav = payload.navigator || {};

  helper.defineGetter(navProto, 'webdriver', () => false);
  // userAgent / appVersion / platform 不再 hook ——
  //   - 与 navigator.userAgentData / sec-ch-ua-* HTTP header 来自的真实内核值天然一致
  //   - 任何 hook 都会与 client hints 矛盾,被 Cloudflare/Turnstile 直接识破
  if (nav.language) helper.defineGetter(navProto, 'language', () => nav.language);
  if (nav.languages) {
    const frozen = Object.freeze([...nav.languages]);
    helper.defineGetter(navProto, 'languages', () => frozen);
  }
  // platform 不再 hook —— 同 userAgent/appVersion 一样,任何替换都会与
  // sec-ch-ua-platform HTTP header 矛盾。让 navigator.platform 走 Chromium 默认值。
  if (typeof nav.hardwareConcurrency === 'number') {
    helper.defineGetter(navProto, 'hardwareConcurrency', () => nav.hardwareConcurrency);
  }
  if (typeof nav.deviceMemory === 'number') {
    helper.defineGetter(navProto, 'deviceMemory', () => nav.deviceMemory);
  }
  if (typeof nav.maxTouchPoints === 'number') {
    helper.defineGetter(navProto, 'maxTouchPoints', () => nav.maxTouchPoints);
  }
  if (nav.doNotTrack !== undefined) {
    helper.defineGetter(navProto, 'doNotTrack', () => nav.doNotTrack);
  }

  // plugins — 真实 Chrome 至少 5 个 (PDF Viewer 系列),空数组立刻识破
  try {
    const fakePluginsData = [
      { name: 'PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
      { name: 'Chrome PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
      { name: 'Chromium PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
      { name: 'Microsoft Edge PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
      { name: 'WebKit built-in PDF', filename: 'internal-pdf-viewer', description: 'Portable Document Format' }
    ];
    const mimeData = { type: 'application/pdf', suffixes: 'pdf', description: 'Portable Document Format' };

    const pluginArray = Object.create(PluginArray.prototype);
    Object.defineProperty(pluginArray, 'length', { value: fakePluginsData.length, enumerable: true });

    fakePluginsData.forEach((p, i) => {
      const mime = Object.create(MimeType.prototype);
      Object.defineProperties(mime, {
        type: { value: mimeData.type, enumerable: true },
        suffixes: { value: mimeData.suffixes, enumerable: true },
        description: { value: mimeData.description, enumerable: true }
      });
      const plugin = Object.create(Plugin.prototype);
      Object.defineProperties(plugin, {
        name: { value: p.name, enumerable: true },
        filename: { value: p.filename, enumerable: true },
        description: { value: p.description, enumerable: true },
        length: { value: 1, enumerable: true }
      });
      Object.defineProperty(mime, 'enabledPlugin', { value: plugin, enumerable: true });
      plugin[0] = mime;
      plugin['application/pdf'] = mime;
      pluginArray[i] = plugin;
      pluginArray[p.name] = plugin;
    });

    helper.replaceMethod(pluginArray, 'item', function item(index) { return this[index] || null; });
    helper.replaceMethod(pluginArray, 'namedItem', function namedItem(name) { return this[name] || null; });
    helper.replaceMethod(pluginArray, 'refresh', function refresh() {});

    helper.defineGetter(navProto, 'plugins', () => pluginArray);

    // mimeTypes — Chrome 默认 application/pdf 系列
    const mimeArray = Object.create(MimeTypeArray.prototype);
    const mimeTypes = ['application/pdf', 'text/pdf'];
    Object.defineProperty(mimeArray, 'length', { value: mimeTypes.length, enumerable: true });
    mimeTypes.forEach((type, i) => {
      const mime = Object.create(MimeType.prototype);
      Object.defineProperties(mime, {
        type: { value: type, enumerable: true },
        suffixes: { value: 'pdf', enumerable: true },
        description: { value: '', enumerable: true },
        enabledPlugin: { value: pluginArray[0], enumerable: true }
      });
      mimeArray[i] = mime;
      mimeArray[type] = mime;
    });
    helper.replaceMethod(mimeArray, 'item', function item(index) { return this[index] || null; });
    helper.replaceMethod(mimeArray, 'namedItem', function namedItem(name) { return this[name] || null; });
    helper.defineGetter(navProto, 'mimeTypes', () => mimeArray);
  } catch (e) {
    // 某些环境 PluginArray/Plugin 构造受限,降级保留原数组
  }

  // 时区一致:Intl.DateTimeFormat().resolvedOptions().timeZone 与 payload 对齐
  // 注:Date.prototype.getTimezoneOffset 不在这里改 — Chromium 用 --timezone 启动参数已覆盖
  if (payload.locale && payload.locale.timezone) {
    const originalResolvedOptions = Intl.DateTimeFormat.prototype.resolvedOptions;
    helper.replaceMethod(Intl.DateTimeFormat.prototype, 'resolvedOptions', function resolvedOptions() {
      const opts = originalResolvedOptions.call(this);
      if (payload.locale.timezone) opts.timeZone = payload.locale.timezone;
      if (payload.locale.language) opts.locale = payload.locale.language;
      return opts;
    });
  }
})();
`
