/* Shared, deterministic media decisions. No capture, network or DOM side effects. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MediaPolicy = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  const presets = {
    auto: { label: 'Automática', desc: 'Equilibra nitidez e fluidez para cada espectador', width: 1920, height: 1080, fps: 30, hint: 'detail', degradation: 'balanced', bitrate: 4_000_000, codecs: ['video/VP8', 'video/H264'] },
    p720: { label: 'Economia · 720p / 30', desc: 'Menor uso de internet e processamento', width: 1280, height: 720, fps: 30, hint: 'detail', degradation: 'balanced', bitrate: 2_500_000, codecs: ['video/VP8', 'video/H264'] },
    p1080: { label: 'Nitidez · 1080p / 30', desc: 'Textos, trabalho e apresentações', width: 1920, height: 1080, fps: 30, hint: 'detail', degradation: 'maintain-resolution', bitrate: 4_000_000, codecs: ['video/VP9', 'video/VP8'] },
    p1080_60: { label: 'Movimento · 1080p / 60', desc: 'Jogos e vídeos; exige mais do computador', width: 1920, height: 1080, fps: 60, hint: 'motion', degradation: 'maintain-framerate', bitrate: 6_000_000, codecs: ['video/H264', 'video/VP8'] },
  };

  function budget(uploadMbps, viewers, peers, screen, camera, preset = presets.auto) {
    const upload = Math.min(100, Math.max(1, Number(uploadMbps) || 10)) * 1e6;
    // Reserve voice/transport first; never impose a floor that exceeds the budget.
    const available = Math.max(0, upload * .85 - peers * 80_000);
    const screenPool = screen && viewers ? available * (camera ? .8 : 1) : 0;
    const cameraPool = camera ? available - screenPool : 0;
    return {
      screen: viewers ? Math.floor(Math.min(preset.bitrate, screenPool / viewers)) : 0,
      camera: peers ? Math.floor(Math.min(1_200_000, cameraPool / peers)) : 0,
    };
  }

  function adapt(previous = {}, sample, now) {
    const next = { level: 0, badSince: null, goodSince: null, changedAt: -Infinity, ...previous };
    if (!sample.active) return { ...next, badSince: null, goodSince: null };
    const bad = ['cpu', 'bandwidth'].includes(sample.reason) || sample.loss > .06 || sample.rtt > .45;
    if (bad) {
      next.goodSince = null;
      next.badSince ??= now;
      if (now - next.badSince >= 5_000 && now - next.changedAt >= 10_000 && next.level < 2) {
        next.level++;
        next.changedAt = now;
        next.badSince = now;
      }
    } else {
      next.badSince = null;
      next.goodSince ??= now;
      if (now - next.goodSince >= 25_000 && now - next.changedAt >= 25_000 && next.level > 0) {
        next.level--;
        next.changedAt = now;
        next.goodSince = now;
      }
    }
    return next;
  }

  function encoding(preset, bitrate, level = 0) {
    return { maxBitrate: Math.max(10_000, Math.round(bitrate)), maxFramerate: Math.min(preset.fps, [preset.fps, 24, 15][level]), scaleResolutionDownBy: [1, 1.5, 2][level], active: bitrate > 0 };
  }

  // All mutations of one peer's senders share a queue (watch, stop, switch, tuning).
  function enqueue(peer, task) {
    const result = (peer.mediaQueue || Promise.resolve()).then(task);
    peer.mediaQueue = result.catch(() => {}); // caller handles the error; queue remains usable
    return result;
  }
  function formatVideoStats(measurements, total = false) {
    if (!measurements.length) return 'Medindo qualidade…';
    const range = (key) => {
      const values = measurements.map((item) => item[key]).filter(Number.isFinite).map(Math.round);
      if (!values.length) return '?';
      const min = Math.min(...values), max = Math.max(...values);
      return min === max ? String(min) : `${min}–${max}`;
    };
    const size = measurements.length === 1 ? `${range('width')}×${range('height')}` : `${range('height')}p`;
    const bitrates = measurements.map((item) => item.bitrate).filter(Number.isFinite);
    const rate = bitrates.length === measurements.length ? `${(bitrates.reduce((sum, value) => sum + value, 0) / 1e6).toFixed(1).replace('.', ',')} Mbps${total ? ' total' : ''}` : 'Medindo Mbps…';
    const codecs = [...new Set(measurements.map((item) => item.codec).filter(Boolean))].join('/');
    return [size, `${range('fps')} fps`, rate, codecs].filter(Boolean).join(' · ');
  }
  return { presets, budget, adapt, encoding, enqueue, formatVideoStats };
});
