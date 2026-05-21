/**
 * navigator.getBattery() patch。
 *
 * 痛点:Headful Chrome 有 getBattery,但部分自动化环境(尤其 Linux headless 模式)
 * 返回 undefined 或 promise reject。检测脚本据此识破。
 *
 * 做法:返回一个稳定 fake BatteryManager,各字段固定值(避免每次调用变化)。
 */
export const BATTERY_PATCH = `
;(() => {
  if (!navigator.getBattery) {
    // 老 Chromium 没有 getBattery — 不补,免得反而像伪装
    return;
  }
  const fakeBattery = {
    charging: true,
    chargingTime: 0,
    dischargingTime: Infinity,
    level: 1,
    addEventListener: helper.markMethod(function addEventListener() {}, 'addEventListener'),
    removeEventListener: helper.markMethod(function removeEventListener() {}, 'removeEventListener'),
    dispatchEvent: helper.markMethod(function dispatchEvent() { return false; }, 'dispatchEvent'),
    onchargingchange: null,
    onchargingtimechange: null,
    ondischargingtimechange: null,
    onlevelchange: null
  };

  helper.replaceMethod(navigator, 'getBattery', function getBattery() {
    return Promise.resolve(fakeBattery);
  });
})();
`
