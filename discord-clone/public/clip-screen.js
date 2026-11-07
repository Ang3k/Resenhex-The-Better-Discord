// CLIPAR com a tela: guarda os últimos 30 s da tela que eu estou assistindo (ou da minha, se sou eu que
// transmito) já comprimidos em H.264 pela placa, num rolo com quadro-chave a cada 1 s. Nada sai do aparelho
// até alguém clipar. O leitor (ClipScreen.reader) decodifica o rolo para frente e entrega o quadro de cada instante.
(() => {
  const W = 1280, H = 720, FPS = 30;
  const CODEC = 'avc1.4d0028';
  const RING_BITRATE = 3_000_000;
  const WINDOW_MS = 30_000;
  const KEY_EVERY_MS = 1000;
  const T0 = 1e9; // µs somados aos instantes do leitor: o rolo pode começar antes do áudio (t negativo)

  // Mantém o rolo a partir do último quadro-chave que ainda cobre a janela inteira.
  // chunks: [{ ms, key }] em ordem; devolve o índice do primeiro que fica.
  function pruneChunks(chunks, nowMs, windowMs = WINDOW_MS) {
    const limit = nowMs - windowMs;
    let keep = -1;
    for (let i = 0; i < chunks.length; i++) {
      if (chunks[i].ms > limit) break;
      if (chunks[i].key) keep = i;
    }
    if (keep >= 0) return keep;
    const firstKey = chunks.findIndex((c) => c.key);
    return firstKey < 0 ? chunks.length : firstKey;
  }

  // Índice do quadro-chave de onde decodificar para chegar ao instante t (segundos).
  function seekIndex(chunks, t) {
    let found = -1;
    for (let i = 0; i < chunks.length; i++) {
      if (chunks[i].t > t + 1e-6) break;
      if (chunks[i].key) found = i;
    }
    if (found >= 0) return found;
    const firstKey = chunks.findIndex((c) => c.key);
    return firstKey < 0 ? 0 : firstKey;
  }

  // Encaixa a imagem inteira no quadro, com faixas pretas onde sobrar.
  function fitRect(srcW, srcH, dstW = W, dstH = H) {
    if (!(srcW > 0 && srcH > 0)) return { x: 0, y: 0, w: dstW, h: dstH };
    const scale = Math.min(dstW / srcW, dstH / srcH);
    const w = Math.round(srcW * scale), h = Math.round(srcH * scale);
    return { x: Math.round((dstW - w) / 2), y: Math.round((dstH - h) / 2), w, h };
  }

  const helpers = { pruneChunks, seekIndex, fitRect, W, H, FPS, CODEC };
  if (typeof module !== 'undefined') module.exports = helpers;
  if (typeof window === 'undefined') return;

  const canRecord = () => typeof MediaStreamTrackProcessor !== 'undefined' && typeof VideoEncoder !== 'undefined'
    && typeof VideoDecoder !== 'undefined' && typeof OffscreenCanvas !== 'undefined';

  let support = null;
  function supported() {
    if (!canRecord()) return Promise.resolve(false);
    support ||= Promise.all([
      VideoEncoder.isConfigSupported({ codec: CODEC, width: W, height: H, bitrate: RING_BITRATE, framerate: FPS, latencyMode: 'realtime', avc: { format: 'annexb' } }),
      VideoDecoder.isConfigSupported({ codec: CODEC, codedWidth: W, codedHeight: H }),
    ]).then(([enc, dec]) => !!(enc.supported && dec.supported), () => false);
    return support;
  }

  window.ClipScreen = ({ now = () => performance.now() } = {}) => {
    let chunks = []; // { ms, key, data: ArrayBuffer }
    let owner = null; // { accountId, name } de quem é a tela no rolo
    let session = null; // gravação em andamento: { trackId, stopped, reader, clone, encoder }

    function endSession() {
      if (!session) return;
      const s = session;
      session = null;
      s.stopped = true;
      s.reader?.cancel().catch(() => {});
      s.clone?.stop();
      try { if (s.encoder?.state !== 'closed') s.encoder.close(); } catch {}
    }

    function clear() {
      endSession();
      chunks = [];
      owner = null;
    }

    function prune() {
      const first = pruneChunks(chunks, now());
      if (first > 0) chunks = chunks.slice(first);
    }

    async function record(s, track) {
      if (!await supported() || s.stopped) return;
      const canvas = new OffscreenCanvas(W, H);
      const ctx = canvas.getContext('2d', { alpha: false });
      s.encoder = new VideoEncoder({
        output: (chunk) => {
          if (s.stopped) return;
          const data = new ArrayBuffer(chunk.byteLength);
          chunk.copyTo(data);
          chunks.push({ ms: chunk.timestamp / 1000, key: chunk.type === 'key', data });
          prune();
        },
        error: () => { if (session === s) endSession(); },
      });
      s.encoder.configure({ codec: CODEC, width: W, height: H, bitrate: RING_BITRATE, framerate: FPS, latencyMode: 'realtime', avc: { format: 'annexb' } });
      s.clone = track.clone();
      s.reader = new MediaStreamTrackProcessor({ track: s.clone }).readable.getReader();
      let lastFrame = -Infinity, lastKey = -Infinity;
      while (!s.stopped) {
        let result;
        try { result = await s.reader.read(); } catch { break; }
        const frame = result.value;
        if (result.done || !frame) break;
        const t = now();
        // 30 por segundo bastam; com a placa atrasada, pula o quadro em vez de acumular.
        if (s.stopped || t - lastFrame < 1000 / FPS - 4 || s.encoder.encodeQueueSize > 4) { frame.close(); continue; }
        lastFrame = t;
        const r = fitRect(frame.displayWidth, frame.displayHeight);
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, W, H);
        ctx.drawImage(frame, r.x, r.y, r.w, r.h);
        frame.close();
        const out = new VideoFrame(canvas, { timestamp: Math.round(t * 1000), duration: Math.round(1e6 / FPS) });
        const key = t - lastKey >= KEY_EVERY_MS;
        if (key) lastKey = t;
        try { s.encoder.encode(out, { keyFrame: key }); } catch { out.close(); break; }
        out.close();
      }
      // A transmissão acabou: o rolo fica (os últimos segundos dela ainda podem ser clipados).
      if (session === s) endSession();
    }

    // Segue a tela escolhida. Outra pessoa: o rolo recomeça. A mesma pessoa com outra trilha (trocou de
    // tela, reconectou): continua o mesmo rolo. Nenhuma tela: para de gravar e o que tem vai vencendo.
    function follow(target) {
      if (!target?.track || target.track.readyState === 'ended') { endSession(); return; }
      if (owner && owner.accountId !== target.accountId) clear();
      owner = { accountId: target.accountId, name: target.name || '' };
      if (session?.trackId === target.track.id) return;
      endSession();
      const s = { trackId: target.track.id, stopped: false };
      session = s;
      record(s, target.track).catch(() => { if (session === s) endSession(); });
    }

    // Quem desliga "Pode clipar" some do rolo na hora.
    function forget(accountId) {
      if (owner?.accountId === accountId) clear();
    }

    // Instantes em segundos desde o começo da foto do áudio (takenAt − seconds).
    function snapshot(takenAt, seconds) {
      prune();
      if (!owner || !chunks.length) return null;
      const start = takenAt - seconds * 1000;
      const list = chunks.filter((c) => c.ms <= takenAt).map((c) => ({ t: (c.ms - start) / 1000, key: c.key, data: c.data }));
      if (!list.some((c) => c.key && c.t <= seconds)) return null;
      return { accountId: owner.accountId, name: owner.name, chunks: list, codec: CODEC, width: W, height: H };
    }

    return { follow, forget, snapshot, stop: clear, recording: () => !!session, supported };
  };

  // Leitor do rolo. at(t) devolve o último quadro com instante ≤ t (ou null antes do primeiro); o quadro é
  // do leitor e vale até a próxima chamada. Andar para trás ou pular longe recomeça do quadro-chave certo.
  window.ClipScreen.reader = (screen) => {
    const list = screen?.chunks || [];
    let decoder = null, fed = 0, queue = [], current = null, flushed = false, broken = false, outputs = 0, wake = null;

    const us = (t) => Math.round(T0 + t * 1e6);
    function reset(index) {
      try { if (decoder && decoder.state !== 'closed') decoder.close(); } catch {}
      for (const f of queue) f.close();
      queue = [];
      current?.close();
      current = null;
      fed = index;
      outputs = index;
      flushed = false;
      decoder = new VideoDecoder({
        output: (frame) => { outputs++; queue.push(frame); wake?.(); },
        error: () => { broken = true; wake?.(); },
      });
      decoder.configure({ codec: screen.codec, codedWidth: screen.width, codedHeight: screen.height, optimizeForLatency: true });
    }
    function feed() {
      const c = list[fed++];
      decoder.decode(new EncodedVideoChunk({ type: c.key ? 'key' : 'delta', timestamp: us(c.t), data: c.data }));
    }
    const settle = (ms) => new Promise((resolve) => {
      const timer = setTimeout(() => { wake = null; resolve(false); }, ms);
      wake = () => { clearTimeout(timer); wake = null; resolve(true); };
    });

    async function at(t) {
      if (!list.length || broken) return null;
      const target = us(t);
      const seek = seekIndex(list, t);
      // Para trás, ou o quadro-chave do destino está à frente do que já foi mandado: recomeça de lá.
      if (!decoder || (current && current.timestamp > target) || seek > fed) reset(seek);
      for (;;) {
        while (queue.length && queue[0].timestamp <= target) { current?.close(); current = queue.shift(); }
        if (broken) return null;
        if (queue.length || flushed) return current;
        // Tudo o que foi mandado já saiu e o próximo pedaço é depois de t: o quadro atual é o certo.
        if (outputs >= fed && (fed >= list.length || list[fed].t > t + 1e-6) && current) return current;
        if (fed < list.length && list[fed].t <= t + 1e-6) { feed(); continue; }
        if (await settle(40)) continue;
        // O decodificador segura quadros: manda mais um, ou esvazia no fim.
        if (fed < list.length) feed();
        else {
          try { await decoder.flush(); } catch { broken = true; }
          flushed = true;
        }
      }
    }

    function close() {
      try { if (decoder && decoder.state !== 'closed') decoder.close(); } catch {}
      for (const f of queue) f.close();
      queue = [];
      current?.close();
      current = null;
      broken = true;
    }

    return { at, close };
  };
  Object.assign(window.ClipScreen, helpers);
})();
