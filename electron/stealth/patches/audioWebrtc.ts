/**
 * Audio + WebRTC patch。
 *
 * - Audio:AudioContext.createAnalyser → getFloatFrequencyData 加微噪,防 AudioFingerprint 稳定 hash。
 * - WebRTC:不彻底过滤 mDNS 候选(过度过滤反而暴露),仅在 payload.webRtcPolicy ===
 *   'disable-non-proxied-udp' 时强制 iceTransportPolicy='relay';保留 RTCPeerConnection
 *   原 prototype 链,toString 走 helper 伪装。
 *
 * 注:WebRTC 真正的"防 IP 泄露"靠 chromium 启动参数 --force-webrtc-ip-handling-policy,
 * 这里只是补 prototype 一致性。
 */
export const AUDIO_WEBRTC_PATCH = `
;(() => {
  const noise = payload.noise || {};

  // ---- Audio ----
  const AudioCtor = window.AudioContext || window.webkitAudioContext;
  const audioNoise = Number(noise.audio || 0);
  if (AudioCtor && AudioCtor.prototype && AudioCtor.prototype.createAnalyser && audioNoise > 0) {
    const originalCreateAnalyser = AudioCtor.prototype.createAnalyser;
    helper.replaceMethod(AudioCtor.prototype, 'createAnalyser', function createAnalyser() {
      const analyser = originalCreateAnalyser.apply(this, arguments);
      const originalGetFloatFrequencyData = analyser.getFloatFrequencyData.bind(analyser);
      const originalGetFloatTimeDomainData = analyser.getFloatTimeDomainData
        ? analyser.getFloatTimeDomainData.bind(analyser)
        : null;
      helper.replaceMethod(analyser, 'getFloatFrequencyData', function getFloatFrequencyData(array) {
        originalGetFloatFrequencyData(array);
        for (let i = 0; i < array.length; i += 16) array[i] += audioNoise;
      });
      if (originalGetFloatTimeDomainData) {
        helper.replaceMethod(analyser, 'getFloatTimeDomainData', function getFloatTimeDomainData(array) {
          originalGetFloatTimeDomainData(array);
          for (let i = 0; i < array.length; i += 32) array[i] += audioNoise;
        });
      }
      return analyser;
    });
  }

  // ---- WebRTC ----
  // disable-non-proxied-udp:强制所有 PeerConnection 走 relay,代理隧道里的 STUN 才能用
  // default:不改 — 让浏览器自己决定,符合真实 Chrome 行为(避免改动留痕)
  if (payload.webRtcPolicy === 'disable-non-proxied-udp' && window.RTCPeerConnection) {
    const OriginalRTCPC = window.RTCPeerConnection;
    function StealthRTCPeerConnection(configuration, constraints) {
      const finalConfig = Object.assign({}, configuration || {}, { iceTransportPolicy: 'relay' });
      if (constraints) return new OriginalRTCPC(finalConfig, constraints);
      return new OriginalRTCPC(finalConfig);
    }
    StealthRTCPeerConnection.prototype = OriginalRTCPC.prototype;
    // class 伪装:Object.getPrototypeOf 检查 / constructor 比对
    Object.setPrototypeOf(StealthRTCPeerConnection, OriginalRTCPC);
    helper.markMethod(StealthRTCPeerConnection, 'RTCPeerConnection');
    try {
      Object.defineProperty(window, 'RTCPeerConnection', {
        value: StealthRTCPeerConnection,
        writable: true,
        configurable: true
      });
      // webkit 别名也同步,部分老站点用 webkitRTCPeerConnection
      if (window.webkitRTCPeerConnection) {
        Object.defineProperty(window, 'webkitRTCPeerConnection', {
          value: StealthRTCPeerConnection,
          writable: true,
          configurable: true
        });
      }
    } catch (e) {}
  }
})();
`
