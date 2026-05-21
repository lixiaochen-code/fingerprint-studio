/**
 * 图形相关 patch:WebGL / Canvas / Screen / Fonts。
 *
 * - WebGL:UNMASKED_VENDOR_WEBGL (37445) / UNMASKED_RENDERER_WEBGL (37446) 替换为
 *   payload 中的伪造值。同时 hook getParameter 的 toString,避免痕迹。
 * - Canvas:toDataURL / getImageData / toBlob 加微噪(基于 profileSeed 稳定),防止
 *   被指纹脚本拿到稳定 hash。
 * - Screen:availWidth/availHeight/colorDepth/pixelDepth 与 payload 对齐。
 * - Fonts:document.fonts.check(font) 对 payload 声明的字体返回 true,其他走原生。
 */
export const GRAPHICS_PATCH = `
;(() => {
  const webgl = payload.webgl || {};
  const noise = payload.noise || {};
  const screenData = payload.screen || {};

  // ---- WebGL ----
  function patchWebGLContext(Ctor) {
    if (!Ctor || !Ctor.prototype || !Ctor.prototype.getParameter) return;
    const originalGetParameter = Ctor.prototype.getParameter;
    helper.replaceMethod(Ctor.prototype, 'getParameter', function getParameter(parameter) {
      if (parameter === 37445 && webgl.vendor) return webgl.vendor;       // UNMASKED_VENDOR_WEBGL
      if (parameter === 37446 && webgl.renderer) return webgl.renderer;   // UNMASKED_RENDERER_WEBGL
      // VENDOR (7936) 与 RENDERER (7937) 一些站点也查 — 用同样 vendor/renderer 兜底
      if (parameter === 7936 && webgl.vendor) return webgl.vendor;
      if (parameter === 7937 && webgl.renderer) return webgl.renderer;
      return originalGetParameter.call(this, parameter);
    });
  }
  patchWebGLContext(window.WebGLRenderingContext);
  patchWebGLContext(window.WebGL2RenderingContext);

  // ---- Canvas ----
  const canvasNoise = Number(noise.canvas || 0);
  if (canvasNoise > 0) {
    const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
    helper.replaceMethod(HTMLCanvasElement.prototype, 'toDataURL', function toDataURL() {
      try {
        const ctx = this.getContext('2d');
        if (ctx) {
          ctx.save();
          ctx.globalAlpha = Math.max(0.9999, 1 - canvasNoise);
          ctx.fillStyle = 'rgba(1,1,1,0.001)';
          ctx.fillRect(0, 0, 1, 1);
          ctx.restore();
        }
      } catch (e) {}
      return originalToDataURL.apply(this, arguments);
    });

    const originalGetImageData = CanvasRenderingContext2D.prototype.getImageData;
    helper.replaceMethod(CanvasRenderingContext2D.prototype, 'getImageData', function getImageData() {
      const data = originalGetImageData.apply(this, arguments);
      if (data && data.data && data.data.length >= 4) {
        // 用最高位扰动 1,稳定 noise(基于 width 取模避免漂移)
        const delta = (data.width % 3) + 1;
        data.data[0] = (data.data[0] + delta) % 255;
      }
      return data;
    });

    if (typeof HTMLCanvasElement.prototype.toBlob === 'function') {
      const originalToBlob = HTMLCanvasElement.prototype.toBlob;
      helper.replaceMethod(HTMLCanvasElement.prototype, 'toBlob', function toBlob(callback) {
        try {
          const ctx = this.getContext('2d');
          if (ctx) {
            ctx.save();
            ctx.globalAlpha = Math.max(0.9999, 1 - canvasNoise);
            ctx.fillStyle = 'rgba(1,1,1,0.001)';
            ctx.fillRect(0, 0, 1, 1);
            ctx.restore();
          }
        } catch (e) {}
        return originalToBlob.apply(this, arguments);
      });
    }
  }

  // ---- Screen ----
  if (typeof screenData.colorDepth === 'number') {
    helper.defineGetter(Screen.prototype, 'colorDepth', () => screenData.colorDepth);
  }
  if (typeof screenData.pixelDepth === 'number') {
    helper.defineGetter(Screen.prototype, 'pixelDepth', () => screenData.pixelDepth);
  }
  if (typeof screenData.availWidth === 'number') {
    helper.defineGetter(Screen.prototype, 'availWidth', () => screenData.availWidth);
  }
  if (typeof screenData.availHeight === 'number') {
    helper.defineGetter(Screen.prototype, 'availHeight', () => screenData.availHeight);
  }

  // ---- Fonts ----
  const fontSet = new Set(payload.fonts || []);
  if (fontSet.size > 0 && document.fonts && typeof document.fonts.check === 'function') {
    const originalCheck = document.fonts.check.bind(document.fonts);
    helper.replaceMethod(document.fonts, 'check', function check(font, text) {
      const quoted = String(font).match(/[\"']([^\"']+)[\"']/);
      const family = (quoted && quoted[1]) || String(font).split(',').pop().trim().split(' ').pop();
      if (family && fontSet.has(family)) return true;
      return originalCheck(font, text);
    });
  }
})();
`
