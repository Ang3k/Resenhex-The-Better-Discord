/* Decisões de mídia puras e determinísticas: sem captura, rede ou DOM. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MediaPolicy = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  // "adaptive": quando a transmissão engasga, a resolução desce um degrau e o FPS fica.
  // Nitidez mantém a resolução escolhida; Movimento deixa o navegador reduzir a resolução
  // para manter os 60 fps (maintain-framerate), como na primeira versão da transmissão.
  const presets = {
    auto: { label: 'Automática', desc: 'Fluida para cada espectador: reduz a resolução antes do FPS', width: 1920, height: 1080, fps: 30, hint: 'detail', degradation: 'maintain-resolution', adaptive: true, bitrate: 4_000_000, codecs: ['video/VP8', 'video/H264'] },
    p720: { label: 'Economia · 720p / 30', desc: 'Menor uso de internet e processamento', width: 1280, height: 720, fps: 30, hint: 'detail', degradation: 'maintain-resolution', adaptive: true, bitrate: 2_500_000, codecs: ['video/VP8', 'video/H264'] },
    p1080: { label: 'Nitidez · 1080p / 30', desc: 'Textos, trabalho e apresentações', width: 1920, height: 1080, fps: 30, hint: 'detail', degradation: 'maintain-resolution', adaptive: false, bitrate: 4_000_000, codecs: ['video/VP9', 'video/VP8'] },
    p1080_60: { label: 'Movimento · 1080p / 60', desc: 'Jogos e vídeos; exige mais do computador', width: 1920, height: 1080, fps: 60, hint: 'motion', degradation: 'maintain-framerate', adaptive: false, bitrate: 6_000_000, codecs: ['video/H264', 'video/VP8'] },
  };

  const watchModes = {
    auto: { label: 'Automática', desc: 'Acompanha o tamanho do vídeo e sua conexão' },
    economy: { label: 'Economia', desc: 'Até 720p e 15 fps, para gastar menos internet' },
    source: { label: 'Mais nitidez', desc: 'Solicita a resolução da fonte, dentro da banda disponível' },
  };

  // Degraus fixos de resolução. Valores estáveis evitam reconfigurar o codificador a cada amostra.
  const STEPS = [1080, 720, 540, 360];
  const MAX_LEVEL = STEPS.length - 1;

  function viewerDemand({ mode = 'auto', width = 0, height = 0, pixelRatio = 1, aspect = 16 / 9, background = false } = {}) {
    if (!watchModes[mode]) mode = 'auto';
    const pixels = Math.min(height, width / aspect) * Math.min(2, Math.max(1, pixelRatio));
    const maxHeight = mode === 'source' || !pixels ? 1080 : [180, 360, 540, 720, 1080].find((h) => h >= pixels) || 1080;
    return { mode, maxHeight: mode === 'economy' ? Math.min(720, maxHeight) : maxHeight, background: !!background };
  }

  // Desce "level" degraus a partir do primeiro degrau que cabe na altura pedida.
  function stepHeight(height, level) {
    const start = STEPS.findIndex((h) => h <= height);
    return Math.min(height, STEPS[Math.min(MAX_LEVEL, (start < 0 ? MAX_LEVEL : start) + level)]);
  }

  // Meta de um espectador. O pedido dele é um teto; a adaptação (level) só reduz resolução.
  function screenTarget(preset, demand = {}, level = 0) {
    let height = Math.min(preset.height, demand.mode === 'source' ? preset.height : demand.maxHeight || preset.height);
    let fps = preset.fps;
    if (demand.mode === 'economy') { height = Math.min(720, height); fps = Math.min(15, fps); }
    if (demand.background) { height = Math.min(360, height); fps = Math.min(5, fps); }
    if (level && preset.adaptive) height = stepHeight(height, level);
    const bitrate = Math.max(150_000, Math.round(preset.bitrate * (height / preset.height) ** 1.5 * (fps / preset.fps) ** .7));
    return { height, fps, bitrate };
  }

  // Divisão max-min: atende primeiro quem precisa de pouco e redistribui o que sobra.
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

  // Tetos de bitrate a partir do upload informado. A estimativa de banda do navegador NÃO entra
  // aqui: limitar o codificador a ela impede a própria estimativa de subir (o erro da 0.9).
  // O controle de congestionamento do WebRTC já mantém o envio abaixo do que a rede aguenta.
  function allocate(uploadMbps, peers, { screen = false, screenAudio = false, camera = false, preset = presets.auto } = {}) {
    const upload = Math.min(100, Math.max(1, Number(uploadMbps) || 10)) * 1e6;
    const reserves = peers.map((p) => 80_000 + (screenAudio && screen && p.watching ? 96_000 : 0));
    const pool = Math.max(0, upload * .85 - reserves.reduce((a, b) => a + b, 0));
    const targets = peers.map((p) => screen && p.watching ? screenTarget(preset, p.demand, p.level || 0) : null);
    const screenCaps = targets.map((target) => target ? target.bitrate : 0);
    const screens = distribute(pool * (camera && screenCaps.some((cap) => cap > 0) ? .8 : 1), screenCaps);
    const cameras = camera ? distribute(pool - screens.reduce((a, b) => a + b, 0), peers.map(() => 1_200_000)) : peers.map(() => 0);
    return new Map(peers.map((p, i) => [p.sid, { screen: screens[i], camera: cameras[i], target: targets[i] }]));
  }

  // O FPS pedido nunca é cortado pela banda: essa era a causa da transmissão "travada" da 0.9.
  // A resolução vem de degraus fixos e nunca aumenta a imagem capturada.
  function screenEncoding(preset, bitrate, demand, settings = {}, level = 0) {
    const target = screenTarget(preset, demand, level);
    const source = settings.height || preset.height;
    const scale = Math.max(1, source / Math.min(source, target.height));
    return { maxBitrate: Math.max(10_000, Math.round(bitrate)), maxFramerate: target.fps, scaleResolutionDownBy: Math.ceil(scale * 100) / 100, active: bitrate > 0 };
  }

  // A transmissão está engasgando? O próprio codificador diz (banda ou processador), ou os quadros
  // enviados ficam bem abaixo dos capturados. Tela parada captura poucos quadros e não conta.
  function strained({ reason, sentFps, sourceFps, targetFps } = {}) {
    if (reason === 'bandwidth' || reason === 'cpu') return true;
    const expected = Math.min(Number(sourceFps) || 0, Number(targetFps) || Infinity);
    return expected >= 8 && Number.isFinite(sentFps) && sentFps < expected * .65;
  }

  // Desce um degrau após 4 s de engasgo (no máximo a cada 6 s) e sobe um degrau após 12 s bons,
  // se a conexão comporta o degrau acima (headroom false bloqueia; sem estimativa, só o tempo decide).
  function adapt(previous = {}, sample, now) {
    const next = { level: 0, badSince: null, goodSince: null, changedAt: -Infinity, ...previous };
    if (!sample.active) return { ...next, badSince: null, goodSince: null };
    if (sample.strained) {
      next.goodSince = null;
      next.badSince ??= now;
      if (now - next.badSince >= 4_000 && now - next.changedAt >= 6_000 && next.level < MAX_LEVEL) {
        next.level++;
        next.changedAt = now;
        next.badSince = now;
      }
    } else {
      next.badSince = null;
      next.goodSince ??= now;
      if (next.level > 0 && sample.headroom !== false && now - next.goodSince >= 12_000 && now - next.changedAt >= 12_000) {
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

  // Todas as mudanças nos senders de uma conexão passam por uma fila (assistir, parar, trocar, ajustar).
  function enqueue(peer, task) {
    const result = (peer.mediaQueue || Promise.resolve()).then(task);
    peer.mediaQueue = result.catch(() => {}); // quem chamou trata o erro; a fila continua usável
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
  return { presets, watchModes, viewerDemand, screenTarget, allocate, screenEncoding, strained, adapt, encoding, enqueue, formatVideoStats };
});
