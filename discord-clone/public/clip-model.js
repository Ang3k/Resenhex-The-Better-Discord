// CLIPAR: regras do clipe sem DOM: quem entra, quem fala em cada quadro, grade dos perfis,
// a onda da telinha de corte e os limites do corte (1 a 30 s).
(() => {
  const WINDOW = 512;          // mesma janela do analisador da chamada (fftSize 512)
  const THRESHOLD = 4 / 128;   // rms > 4 nos 8 bits do getByteTimeDomainData
  const HOLD = 0.3;            // segura aceso 300 ms

  // Esteve na chamada em algum ponto do trecho: entrou antes do fim e não tinha saído antes do começo.
  const hasAudioIn = (p, sampleRate, { start, end }) => p.offset / sampleRate < end && (p.leftAt == null || p.leftAt > start);

  function included(snapshot, { allowNow, localMuted, silencedNow, selfId, selfAllow }, range) {
    return snapshot.people.filter((p) => {
      if (p.accountId === selfId) return selfAllow && hasAudioIn(p, snapshot.sampleRate, range);
      return allowNow(p.accountId) !== false && !localMuted.has(p.accountId) && !silencedNow(p.accountId)
        && hasAudioIn(p, snapshot.sampleRate, range);
    });
  }

  // Estado da chamada (mudo/silenciado) no instante t (segundos desde o começo da foto).
  function stateAt(snapshot, accountId, t) {
    const startMs = snapshot.takenAt - snapshot.seconds * 1000;
    let found = null;
    for (const st of snapshot.states) {
      if ((st.t - startMs) / 1000 > t) break;
      found = st.byAccount.get(accountId) || found;
    }
    return found;
  }

  function loudAt(pcm, from, offset) {
    const a = Math.max(from, offset), b = Math.min(pcm.length, from + WINDOW);
    if (b <= a) return false;
    let sum = 0;
    for (let i = a; i < b; i++) sum += pcm[i] * pcm[i];
    return Math.sqrt(sum / WINDOW) > THRESHOLD;
  }

  // Um byte por quadro (1 aceso). A janela começa no instante do quadro: o anel acende quando o som aparece.
  function speakingFrames(person, snapshot, { start, end, fps = 30 }) {
    const count = Math.ceil((end - start) * fps - 1e-9), sr = snapshot.sampleRate;
    const frames = new Uint8Array(count);
    let lastLoud = -Infinity;
    // Começa um pouco antes do corte para a segura valer desde o primeiro quadro.
    const firstFrame = Math.floor(Math.max(0, start - HOLD) * fps);
    for (let f = firstFrame; f < Math.ceil(end * fps - 1e-9); f++) {
      const t = f / fps;
      const st = stateAt(snapshot, person.accountId, t);
      const muted = !!(st?.muted || st?.silenced);
      if (!muted && loudAt(person.pcm, Math.round(t * sr), person.offset)) lastLoud = t;
      const index = Math.round((t - start) * fps);
      if (index >= 0 && index < count) frames[index] = !muted && t - lastLoud < HOLD - 1e-9 ? 1 : 0;
    }
    return frames;
  }

  // Grade centralizada; nomes embaixo de cada avatar; nada na faixa de 64 px de baixo.
  function layout(count, width = 1280, height = 720) {
    const top = 20, bottom = height - 64, label = 34;
    const cols = count <= 4 ? count : count <= 8 ? Math.ceil(count / 2) : Math.ceil(count / 3);
    const rows = Math.ceil(count / cols);
    const cellW = width / cols, maxCellH = (bottom - top) / rows;
    const r = Math.floor(Math.min(110, cellW * 0.34, ((maxCellH - label) / 2) * 0.92));
    const cellH = Math.min(maxCellH, 2 * r + label + 40);
    const blockTop = top + ((bottom - top) - rows * cellH) / 2;
    const cells = [];
    for (let i = 0; i < count; i++) {
      const row = Math.floor(i / cols), inRow = row === rows - 1 ? count - row * cols : cols;
      const col = i - row * cols, rowLeft = (width - inRow * cellW) / 2;
      cells.push({ x: rowLeft + cellW * (col + 0.5), y: blockTop + row * cellH + (cellH - (2 * r + label)) / 2 + r, r });
    }
    return cells;
  }

  function peaks(pcmList, buckets) {
    const length = Math.max(0, ...pcmList.map((p) => p.length));
    const out = new Array(buckets).fill(0), size = length / buckets;
    for (let b = 0; b < buckets; b++) {
      for (let i = Math.floor(b * size); i < Math.floor((b + 1) * size); i++) {
        let mix = 0;
        for (const pcm of pcmList) mix += pcm[i] || 0;
        out[b] = Math.max(out[b], Math.abs(mix));
      }
    }
    const top = Math.max(...out);
    return top > 0 ? out.map((v) => Math.round((v / top) * 1000) / 1000) : out;
  }

  // Mexe no lado que a pessoa não está arrastando para manter 1 ≤ duração ≤ 30 dentro do gravado.
  function clampSelection({ start, end }, { min = 1, max = 30, total, moving = 'end' }) {
    if (total <= min) return { start: 0, end: total };
    const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
    start = clamp(start, 0, total);
    end = clamp(end, 0, total);
    if (moving === 'start') {
      start = clamp(start, Math.max(0, end - max), end - min);
      if (start < 0) { start = 0; end = Math.min(total, min); }
    } else {
      end = clamp(end, Math.min(total, start + min), Math.min(total, start + max));
      if (end - start < min) start = Math.max(0, end - min);
    }
    const round = (v) => Math.round(v * 1000) / 1000;
    return { start: round(start), end: round(end) };
  }

  const api = { included, speakingFrames, layout, peaks, clampSelection };
  if (typeof window !== 'undefined') window.ClipModel = api;
  if (typeof module !== 'undefined') module.exports = api;
})();
