/**
 * 浏览器侧 JS 字符串 — 必须放在所有 patch **最前**注入。
 *
 * 痛点:站点反爬脚本会用 `Function.prototype.toString.call(navigator.userAgent.constructor)`
 * 或 `Object.getOwnPropertyDescriptor(Navigator.prototype, 'userAgent').get.toString()`
 * 比对返回值是否含 "[native code]"。我们之前的 inject 直接 defineProperty 一个箭头函数
 * 上去,toString() 暴露源码,一行 JS 就识破。
 *
 * 做法:Proxy 包装 `Function.prototype.toString`,维护被 hook 的 fn → 伪造 native string
 * 的 WeakMap;同时 toString 自己的 toString 必须返回原 native 字符串(否则元检测识破)。
 *
 * 提供给后续 patches 使用的 helper(挂在 outer IIFE 的词法作用域上):
 *   helper.defineGetter(target, key, getterFn)   — 替换 getter,自动 markNative
 *   helper.replaceMethod(target, key, replacement) — 替换方法,自动 markNative
 *   helper.markMethod(fn, name) / helper.markGetter(fn, name) — 手动 mark
 */
export const NATIVE_TOSTRING_PATCH = `
const nativeMap = new WeakMap();
const originalToString = Function.prototype.toString;

function makeNativeMethodString(name) {
  return 'function ' + name + '() { [native code] }';
}
function makeNativeGetterString(name) {
  return 'function get ' + name + '() { [native code] }';
}

const toStringProxy = new Proxy(originalToString, {
  apply(target, thisArg, args) {
    if (thisArg !== null && thisArg !== undefined && nativeMap.has(thisArg)) {
      return nativeMap.get(thisArg);
    }
    return Reflect.apply(target, thisArg, args);
  }
});
// toString.toString() 也要返回 native — 反制 (toString).toString() 元检测
nativeMap.set(toStringProxy, makeNativeMethodString('toString'));
Function.prototype.toString = toStringProxy;

const helper = {
  markMethod(fn, name) {
    nativeMap.set(fn, makeNativeMethodString(name));
    try { Object.defineProperty(fn, 'name', { value: name, configurable: true }); } catch (e) {}
    return fn;
  },
  markGetter(fn, name) {
    nativeMap.set(fn, makeNativeGetterString(name));
    try { Object.defineProperty(fn, 'name', { value: 'get ' + name, configurable: true }); } catch (e) {}
    return fn;
  },
  defineGetter(target, key, getterFn) {
    const getter = function() { return getterFn.call(this); };
    helper.markGetter(getter, key);
    try {
      Object.defineProperty(target, key, {
        get: getter,
        set: undefined,
        configurable: true,
        enumerable: true
      });
    } catch (e) {}
  },
  replaceMethod(target, key, replacement) {
    helper.markMethod(replacement, key);
    try {
      Object.defineProperty(target, key, {
        value: replacement,
        writable: true,
        configurable: true,
        enumerable: false
      });
    } catch (e) {
      try { target[key] = replacement; } catch (e2) {}
    }
  }
};
`
