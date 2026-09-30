/* Shared, deterministic media decisions. No capture, network or DOM side effects. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MediaPolicy = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  const presets = {
    auto: { label: 'Automática', desc: 'Adapta a cada espectador e preserva a leitura de textos', width: 1920, height: 1080, fps: 30, hint: 'detail', degradation: 'maintain-resolution', bitrate: 4_000_000, codecs: ['video/VP8', 'video/H264'] },
    p720: { label: 'Economia · 720p / 30', desc: 'Menor uso de internet e processamento', width: 1280, height: 720, fps: 30, hint: 'detail', degradation: 'balanced', bitrate: 2_500_000, codecs: ['video/VP8', 'video/H264'] },
    p1080: { label: 'Nitidez · 1080p / 30', desc: 'Textos, trabalho e apresentações', width: 1920, height: 1080, fps: 30, hint: 'detail', degradation: 'maintain-resolution', bitrate: 4_000_000, codecs: ['video/VP9', 'video/VP8'] },
    p1080_60: { label: 'Movimento · 1080p / 60', desc: 'Jogos e vídeos; exige mais do computador', width: 1920, height: 1080, fps: 60, hint: 'motion', degradation: 'maintain-framerate', bitrate: 6_000_000, codecs: ['video/H264', 'video/VP8'] },
  };

  const watchModes = {
    auto: { label: 'Automática', desc: 'Acompanha o tamanho do vídeo e sua conexão' },
    economy: { label: 'Economia', desc: 'Até 720p e 15 fps, para gastar menos internet' },
    source: { label: 'Mais nitidez', desc: 'Solicita a resolução da fonte, dentro da banda disponível' },
  };

  function viewerDemand({ mode = 'auto', width = 0, height = 0, pixelRatio = 1, aspect = 16 / 9, background = false } = {}) {
    if (!watchModes[mode]) mode = 'auto';
    const pixels = Math.min(height, width / aspect) * Math.min(2, Math.max(1, pixelRatio));
    const maxHeight = mode === 'source' || !pixels ? 1080 : [180, 360, 540, 720, 1080].find((h) => h >= pixels) || 1080;
    return { mode, maxHeight: mode === 'economy' ? Math.min(720, maxHeight) : maxHeight, background: !!background };
  }

  // Requests are ceilings. Capture capabilities, CPU and upload can lower them further.
  function screenTarget(preset, demand = {}, level = 0) {
    let height = Math.min(preset.height, demand.mode === 'source' ? preset.height : demand.maxHeight || preset.height);
    let fps = preset.fps;
    if (demand.mode === 'economy') { height = Math.min(720, height); fps = Math.min(15, fps); }
    if (demand.background) { height = Math.min(360, height); fps = Math.min(5, fps); }
    if (level) fps = Math.min(fps, preset.hint === 'motion' ? [preset.fps, 45, 30][level] : [preset.fps, 24, 15][level]);
    const bitrate = Math.max(80_000, Math.round(preset.bitrate * (height / preset.height) ** 1.5 * (fps / preset.fps) ** .7));
    return { height, fps, bitrate };
  }

  // Max-min allocation: satisfy small/capped consumers, then redistribute the remainder.
  function distribute(pool, caps) {
    const rates = caps.map(() => 0);
    let remaining = caps.map((cap, i) => i).filter((i) => caps[i] > 0);
    while (pool > 0 && remaining.length) {
      const share = pool / remaining.length;
      const satisfied = remaining.filter((i) => caps[i] <= share);
      if (!satisfied.length) { for (const i of remaining) rates[i] = Math.floor(share); break; }
      for (const i of satisfied) { rates[i] = Math.floor(caps[i]); pool -= rates[i]; }
      remaining = remaining.filter((i) => !satisfied.includes(i));
    }
    return rates;
  }

  function allocate(uploadMbps, peers, { screen = false, screenAudio = false, camera = false, preset = presets.auto } = {}) {
    const upload = Math.min(100, Math.max(1, Number(uploadMbps) || 10)) * 1e6;
    const reserves = peers.map((p) => 80_000 + (screenAudio && screen && p.watching ? 96_000 : 0));
    const pool = Math.max(0, upload * .85 - reserves.reduce((a, b) => a + b, 0));
    // A tiny video allowance keeps native congestion probing alive after a collapse.
    // The browser still controls the actual rate; the shared upload ceiling remains strict.
    const limits = peers.map((p, i) => Number.isFinite(p.capacity) ? Math.max(screen && p.watching || camera ? 80_000 : 0, p.capacity * 1.15 - reserves[i]) : Infinity);
    const targets = peers.map((p) => screen && p.watching ? screenTarget(preset, p.demand, p.level || 0) : null);
    const screenCaps = targets.map((target, i) => target ? Math.min(target.bitrate, limits[i] * (camera ? .8 : 1)) : 0);
    const screens = distribute(pool * (camera && screenCaps.some((cap) => cap > 0) ? .8 : 1), screenCaps);
    const cameras = camera ? distribute(pool - screens.reduce((a, b) => a + b, 0), peers.map((p, i) => Math.min(1_200_000, Math.max(0, limits[i] - screens[i])))) : peers.map(() => 0);
    return new Map(peers.map((p, i) => [p.sid, { screen: screens[i], camera: cameras[i], target: targets[i] }]));
  }

  function screenEncoding(preset, bitrate, demand, settings = {}, level = 0) {
    const target = screenTarget(preset, demand, level);
    // Keep text readable by reducing cadence first; motion profiles favor cadence.
    const ratio = Math.min(1, bitrate / target.bitrate);
    const detail = preset.hint !== 'motion';
    const fps = bitrate <= 80_000 ? Math.min(5, target.fps) : detail ? Math.max(5, Math.round(target.fps * Math.max(.3, ratio))) : target.fps;
    const shrink = Math.min(1, Math.sqrt(Math.max(.05, ratio / (detail ? .3 : .8))));
    const height = Math.min(settings.height || preset.height, Math.max(Math.min(target.height, detail ? 360 : 180), target.height * shrink));
    const scale = Math.max(1, (settings.height || preset.height) / height, (settings.width || preset.width) / preset.width);
    return { maxBitrate: Math.max(10_000, Math.round(bitrate)), maxFramerate: fps, scaleResolutionDownBy: Math.ceil(scale * 100) / 100, active: bitrate > 0 };
  }

  function captureTarget(preset, demands) {
    const targets = demands.map((d) => screenTarget(preset, d.demand, d.level || 0));
    return { height: targets.length ? Math.max(...targets.map((t) => t.height)) : Math.min(720, preset.height), fps: targets.length ? Math.max(...targets.map((t) => t.fps)) : 5 };
  }

  // Estimates can fluctuate. Lower promptly, increase gradually and leave probing headroom.
  function capacity(previous, value, now) {
    if (!Number.isFinite(value) || value < 0) return previous && now - previous.at < 8000 ? previous : null;
    const bitrate = !previous || now - previous.at >= 8000 || value < previous.bitrate ? value : Math.min(value, previous.bitrate + Math.max(100_000, previous.bitrate * .15));
    return { bitrate, at: now };
  }

  function feedback(previous, remote) {
    if (!remote) return { previous, loss: undefined, rtt: undefined };
    const next = { id: remote.id, timestamp: remote.timestamp, received: remote.packetsReceived, lost: remote.packetsLost, measurements: remote.roundTripTimeMeasurements };
    const same = previous?.id === remote.id;
    let loss;
    if (same && Number.isFinite(next.received) && Number.isFinite(previous.received)) {
      const received = next.received - previous.received;
      const lost = Math.max(0, (next.lost || 0) - (previous.lost || 0));
      if (received >= 0 && received + lost > 0) loss = lost / (received + lost);
    } else if (!same || (Number.isFinite(next.measurements) ? next.measurements !== previous.measurements : next.timestamp !== previous.timestamp)) loss = remote.fractionLost;
    const freshRtt = !same || (Number.isFinite(next.measurements) ? next.measurements !== previous.measurements : next.timestamp !== previous.timestamp);
    return { previous: next, loss, rtt: freshRtt ? remote.roundTripTime : undefined };
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
  return { presets, watchModes, viewerDemand, screenTarget, allocate, screenEncoding, captureTarget, capacity, feedback, adapt, encoding, enqueue, formatVideoStats };
});
