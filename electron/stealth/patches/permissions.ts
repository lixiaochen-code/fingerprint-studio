/**
 * navigator.permissions.query 与 Notification.permission 的一致性 patch。
 *
 * 痛点:Headless Chrome 经典指纹漏洞 —
 * Notification.permission === 'denied' 但 permissions.query({name:'notifications'})
 * 返回 'prompt'。真实浏览器永远一致。这是 puppeteer-extra-stealth 标志性补丁之一。
 *
 * 做法:hook permissions.query,对 notifications 返回与 Notification.permission 匹配的 state。
 */
export const PERMISSIONS_PATCH = `
;(() => {
  if (!navigator.permissions || !navigator.permissions.query) return;
  const originalQuery = navigator.permissions.query.bind(navigator.permissions);

  helper.replaceMethod(navigator.permissions, 'query', function query(parameters) {
    if (parameters && parameters.name === 'notifications') {
      // 返回与 Notification.permission 完全一致的 state
      // Notification.permission 取值:'default' / 'granted' / 'denied'
      // PermissionStatus.state 取值:    'prompt'  / 'granted' / 'denied'
      const notifPerm = (typeof Notification !== 'undefined' && Notification.permission) || 'default';
      const state = notifPerm === 'default' ? 'prompt' : notifPerm;
      return Promise.resolve({
        state,
        name: 'notifications',
        onchange: null,
        addEventListener: helper.markMethod(function addEventListener() {}, 'addEventListener'),
        removeEventListener: helper.markMethod(function removeEventListener() {}, 'removeEventListener'),
        dispatchEvent: helper.markMethod(function dispatchEvent() { return false; }, 'dispatchEvent')
      });
    }
    return originalQuery(parameters);
  });
})();
`
