// Worker do own-audio: mede o atraso entre o que o Resenhex tocou (referência) e a captura do som
// do computador, e estima o caminho entre as duas (volume e equalização do sistema). O worklet só
// faz a subtração; as contas pesadas ficam aqui, fora da thread de áudio e da interface.
//
// Atraso: correlação cruzada com ponderação de fase (GCC-PHAT) em amostras reduzidas.
// Caminho: média do espectro cruzado sobre o espectro da referência (estimador de Wiener). O jogo ou
// a música que também estão na captura não têm relação com a referência e somem na média.
const DECIMATE = 8;
const WINDOW_S = 0.5;        // trecho da captura comparado a cada medição de atraso
const MAX_DELAY_S = 0.5;     // maior atraso procurado (o comum fica em torno de 0,1 s)
const MIN_DELAY_S = 0.01;    // saída + captura nunca levam menos que isso
const MIN_PEAK = 8;          // pico da correlação, em relação à média, para confiar na medição
const MIN_REF_POWER = 1e-7;  // abaixo disso a referência está em silêncio
const TAPS = 3072;           // comprimento do caminho estimado (~64 ms a 48 kHz)
const PRE = 128;             // o caminho começa um pouco antes do atraso medido
const FRAME = 16384;         // quadro da estimativa do caminho
const HOP = FRAME / 2;
const KEEP = 0.97;           // quanto da média fica a cada quadro novo
const MIN_FRAMES = 3;        // quadros com referência tocando antes da primeira estimativa

function fft(re, im, inverse = false) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const angle = (inverse ? 2 : -2) * Math.PI / len, wr = Math.cos(angle), wi = Math.sin(angle);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti;
        re[a] += tr; im[a] += ti;
        const next = cr * wr - ci * wi;
        ci = cr * wi + ci * wr; cr = next;
      }
    }
  }
  if (inverse) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
}

// Atraso (em amostras reduzidas) em que a captura repete a referência, ou null.
// ref e cap cobrem o mesmo intervalo de tempo; só o final de cap é comparado.
function estimateDelay(ref, cap, windowLength, maxDelay, minDelay = 0) {
  const refSeg = ref.subarray(ref.length - windowLength - maxDelay);
  const capSeg = cap.subarray(cap.length - windowLength);
  let power = 0;
  for (const x of refSeg) power += x * x;
  if (power / refSeg.length < MIN_REF_POWER * DECIMATE * DECIMATE) return null;
  let n = 1;
  while (n < refSeg.length + capSeg.length) n <<= 1;
  const ar = new Float64Array(n), ai = new Float64Array(n), br = new Float64Array(n), bi = new Float64Array(n);
  ar.set(refSeg); br.set(capSeg);
  fft(ar, ai); fft(br, bi);
  // corr[m] = soma de cap[j] * ref[j + m]; com PHAT só a fase conta e o pico fica estreito.
  for (let k = 0; k < n; k++) {
    const re = ar[k] * br[k] + ai[k] * bi[k], im = ai[k] * br[k] - ar[k] * bi[k];
    const mag = Math.hypot(re, im) || 1;
    ar[k] = re / mag; ai[k] = im / mag;
  }
  fft(ar, ai, true);
  let best = -Infinity, bestM = 0, sum = 0;
  for (let m = 0; m <= maxDelay; m++) {
    sum += Math.abs(ar[m]);
    if (ar[m] > best) { best = ar[m]; bestM = m; }
  }
  const mean = sum / (maxDelay + 1), delay = maxDelay - bestM;
  // Pico na borda da busca ou cedo demais é ruído, não a cópia do que foi tocado.
  if (!(best > mean * MIN_PEAK) || bestM === 0 || delay < minDelay) return null;
  return { delay, peak: best / mean };
}

// Os dois lados do som (esquerdo e direito) têm caminhos próprios: com som espacial ou surround
// virtual ligados no Windows, cada ouvido recebe a voz com outra equalização e outro atraso.
const CHANNELS = 2;
// Caminho por canal, aceitando também o formato antigo (um só caminho para os dois lados).
const pathsOf = (h) => (h instanceof Float32Array || typeof h?.[0] === 'number' ? [h, h] : h).map((p) => Float32Array.from(p));

// hint: atraso e caminho da transmissão anterior no mesmo contexto, para começar a subtrair na hora.
function createEstimator(sampleRate, send, hint = null) {
  const rate = sampleRate / DECIMATE;
  const windowLength = Math.round(WINDOW_S * rate), maxDelay = Math.round(MAX_DELAY_S * rate), minDelay = Math.round(MIN_DELAY_S * rate);
  const keepDec = windowLength + maxDelay;
  // Histórico em taxa cheia: quadros já guardados, mais o atraso máximo, mais o começo do caminho.
  const BACK = 3; // quadros aproveitados do que já foi gravado quando o atraso é confirmado
  const history = FRAME + (BACK - 1) * HOP + Math.ceil(MAX_DELAY_S * sampleRate) + PRE;
  const ref = Array.from({ length: CHANNELS }, () => new Float32Array(history));
  const cap = Array.from({ length: CHANNELS }, () => new Float32Array(history));
  let filled = 0;
  let decRef = new Float32Array(0), decCap = new Float32Array(0), accRef = 0, accCap = 0, accN = 0;
  const pendingRef = [], pendingCap = [];
  let sinceDelay = 0, sinceHop = 0;
  let delay = hint?.delay ?? null, candidate = null;
  const sxr = [], sxi = [], sxx = [], sdd = [];
  for (let c = 0; c < CHANNELS; c++) for (const s of [sxr, sxi, sxx, sdd]) s.push(new Float64Array(FRAME));
  const fr = new Float64Array(FRAME), fi = new Float64Array(FRAME), gr = new Float64Array(FRAME), gi = new Float64Array(FRAME);
  const hann = Float64Array.from({ length: FRAME }, (_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / FRAME));
  let frames = 0;
  const stats = { delay, peak: 0, measurements: 0, updates: 0 };
  if (hint?.h) send({ delay, pre: PRE, taps: TAPS, h: pathsOf(hint.h) });

  const append = (a, b, keep) => { const c = new Float32Array(Math.min(keep, a.length + b.length)); const tail = a.subarray(Math.max(0, a.length - (c.length - b.length))); c.set(tail); c.set(b, tail.length); return c; };

  function resetPath() { for (const s of [sxr, sxi, sxx, sdd]) for (const x of s) x.fill(0); frames = 0; }

  function measureDelay() {
    if (decRef.length < keepDec) return;
    const found = estimateDelay(decRef, decCap, windowLength, maxDelay, minDelay);
    if (!found) return;
    stats.measurements++;
    const next = found.delay * DECIMATE;
    // Um atraso só vale depois de aparecer duas vezes seguidas; diferença pequena o caminho cobre.
    if (delay !== null && Math.abs(next - delay) <= 4 * DECIMATE) { candidate = null; return; }
    if (candidate === null || Math.abs(next - candidate) > DECIMATE) { candidate = next; return; }
    delay = next; candidate = null;
    stats.delay = delay; stats.peak = found.peak;
    resetPath();
    send({ delay, pre: PRE, taps: TAPS });
    // Aproveita o que já foi gravado: o caminho sai agora, sem esperar quadros novos.
    for (let back = BACK - 1; back >= 0; back--) learn(back * HOP);
  }

  // Um quadro para a média, terminando `back` amostras antes do fim do histórico.
  function learn(back = 0) {
    const end = history - back, offset = delay - PRE;
    if (delay === null || end - FRAME - offset < history - filled) return;
    let power = 0;
    for (let c = 0; c < CHANNELS; c++) {
      for (let i = end - FRAME - offset; i < end - offset; i++) power += ref[c][i] * ref[c][i];
    }
    if (power / (FRAME * CHANNELS) < MIN_REF_POWER) return;
    for (let c = 0; c < CHANNELS; c++) {
      for (let i = 0; i < FRAME; i++) {
        fr[i] = ref[c][end - FRAME - offset + i] * hann[i]; fi[i] = 0;
        gr[i] = cap[c][end - FRAME + i] * hann[i]; gi[i] = 0;
      }
      fft(fr, fi); fft(gr, gi);
      const xr = sxr[c], xi = sxi[c], xx = sxx[c], dd = sdd[c];
      for (let k = 0; k < FRAME; k++) {
        xr[k] = xr[k] * KEEP + fr[k] * gr[k] + fi[k] * gi[k]; // conj(X) * D
        xi[k] = xi[k] * KEEP + fr[k] * gi[k] - fi[k] * gr[k];
        xx[k] = xx[k] * KEEP + fr[k] * fr[k] + fi[k] * fi[k];
        dd[k] = dd[k] * KEEP + gr[k] * gr[k] + gi[k] * gi[k];
      }
    }
    if (++frames < MIN_FRAMES) return;
    const h = [];
    for (let c = 0; c < CHANNELS; c++) h.push(pathOf(c));
    stats.updates++;
    stats.h = h;
    send({ delay, pre: PRE, taps: TAPS, h: h.map((p) => p.slice()) });
  }

  // Caminho de um canal: média do espectro cruzado sobre o da referência, de volta ao tempo.
  // Onde a voz quase não tem energia e o jogo domina, a média ainda é só ruído: cada frequência
  // entra na proporção da confiança que merece (estimador de Wiener com o ruído da própria medida).
  function pathOf(c) {
    const xr = sxr[c], xi = sxi[c], xx = sxx[c], dd = sdd[c];
    let mean = 0;
    for (let k = 0; k < FRAME; k++) mean += xx[k];
    const floor = mean / FRAME * 1e-6 + 1e-15;
    const independent = Math.min(frames, (1 + KEEP) / (1 - KEEP)); // quadros independentes na média
    for (let k = 0; k < FRAME; k++) {
      const x = xx[k] + floor, hr = xr[k] / x, hi = xi[k] / x, h2 = hr * hr + hi * hi;
      const other = Math.max(0, dd[k] - h2 * x); // o que a captura tem além do eco
      const spread = other / (independent * x);     // variância da estimativa nesta frequência
      const trust = h2 / (h2 + spread + 1e-30);
      fr[k] = hr * trust; fi[k] = hi * trust;
    }
    fft(fr, fi, true);
    const h = new Float32Array(TAPS);
    for (let t = 0; t < TAPS; t++) h[t] = fr[t] * (t >= TAPS - 256 ? (TAPS - t) / 256 : 1); // cauda suavizada
    return h;
  }

  return {
    stats,
    // Um bloco novo de referência e captura (taxa cheia, [esquerdo, direito] ou mono), alinhados
    // no tempo do worklet.
    push(r, c) {
      const rs = r instanceof Float32Array ? [r, r] : r, cs = c instanceof Float32Array ? [c, c] : c;
      const n = rs[0].length;
      for (let ch = 0; ch < CHANNELS; ch++) {
        ref[ch].copyWithin(0, n); ref[ch].set(rs[ch], history - n);
        cap[ch].copyWithin(0, n); cap[ch].set(cs[ch], history - n);
      }
      filled = Math.min(history, filled + n);
      pendingRef.length = pendingCap.length = 0;
      for (let i = 0; i < n; i++) {
        accRef += (rs[0][i] + rs[1][i]) * 0.5; accCap += (cs[0][i] + cs[1][i]) * 0.5;
        if (++accN === DECIMATE) { pendingRef.push(accRef); pendingCap.push(accCap); accRef = accCap = accN = 0; }
      }
      decRef = append(decRef, Float32Array.from(pendingRef), keepDec);
      decCap = append(decCap, Float32Array.from(pendingCap), keepDec);
      // Mede o atraso a cada ~0,125 s até achar, depois a cada ~0,5 s para acompanhar mudanças.
      if ((sinceDelay += n) >= (delay === null ? 0.125 : 0.5) * sampleRate) { sinceDelay = 0; measureDelay(); }
      if ((sinceHop += n) >= HOP) { sinceHop = 0; learn(); }
    },
    // O worklet desistiu da subtração (piorava o som): recomeça do zero.
    lost() { delay = candidate = null; stats.delay = null; stats.h = null; resetPath(); },
  };
}

if (typeof self !== 'undefined' && typeof self.postMessage === 'function' && typeof module === 'undefined') {
  let estimator = null, worklet = null;
  self.onmessage = ({ data }) => {
    if (data.start) {
      worklet = data.port;
      estimator = createEstimator(data.sampleRate, (message) => worklet.postMessage(message), data.hint);
      worklet.onmessage = ({ data: block }) => {
        if (block.lost) estimator.lost();
        else if (block.ref) estimator.push(block.ref, block.cap);
      };
      // Estado para quem abriu o worker; o caminho vai junto para a próxima transmissão começar com ele.
      setInterval(() => self.postMessage({ stats: estimator.stats }), 1000);
    }
  };
}

if (typeof module !== 'undefined') module.exports = { createEstimator, estimateDelay };
