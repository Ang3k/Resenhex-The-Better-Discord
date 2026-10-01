// Tira do som do computador capturado aquilo que o próprio Resenhex tocou (vozes da chamada, efeitos).
// Entrada 0: a captura. Entrada 1: a referência, tudo que o Resenhex mandou para a saída de som.
// O own-audio-estimator.js (um worker) mede o atraso e estima o caminho entre as duas; aqui, na
// thread de áudio, só o que é leve e tem tempo certo:
//   1. subtrair o eco estimado (convolução em partes, por sobreposição e descarte);
//   2. acompanhar, por faixa de frequência, o quanto o volume do eco mudou desde que o caminho foi
//      medido (a equalização de volume e os limitadores do Windows mudam o ganho a todo instante);
//   3. abafar o pouco que sobra onde não há outro som por cima (supressão de resíduo);
//   4. mandar referência e captura para o worker.
const N = 128;               // bloco (um quantum do Web Audio)
const F = 2 * N;             // tamanho da FFT dos blocos
const RING = 1 << 17;        // histórico da referência (~2,7 s a 48 kHz)
const SEND = 2048;           // amostras por mensagem para o worker
const RESIDUAL = 0.001;      // resíduo esperado depois da subtração (-30 dB do eco estimado)
const FLOOR = 0.1;           // o máximo que a supressão abafa (-20 dB)
const GAIN_KEEP = 0.9;       // memória do ajuste de volume por faixa (~25 ms)
// Faixas de frequência (em pontos de 187,5 Hz a 48 kHz) do ajuste de volume.
const BANDS = [0, 2, 4, 6, 9, 13, 18, 25, 34, 46, 62, 84, F / 2 + 1];
const NB = BANDS.length - 1;
const BAND = new Uint8Array(F / 2 + 1);
for (let b = 0; b < NB; b++) for (let k = BANDS[b]; k < BANDS[b + 1]; k++) BAND[k] = b;

// FFT complexa radix-2 de tamanho F, com tabelas prontas.
const REV = new Uint16Array(F), COS = new Float64Array(F / 2), SIN = new Float64Array(F / 2);
for (let i = 0, bits = Math.log2(F); i < F; i++) {
  let r = 0;
  for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b);
  REV[i] = r;
}
for (let i = 0; i < F / 2; i++) { COS[i] = Math.cos(2 * Math.PI * i / F); SIN[i] = -Math.sin(2 * Math.PI * i / F); }
function fft(re, im, inverse) {
  for (let i = 0; i < F; i++) {
    const j = REV[i];
    if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
  }
  for (let len = 2; len <= F; len <<= 1) {
    const half = len >> 1, step = F / len;
    for (let i = 0; i < F; i += len) {
      for (let k = 0; k < half; k++) {
        const wr = COS[k * step], wi = inverse ? -SIN[k * step] : SIN[k * step];
        const a = i + k, b = a + half;
        const tr = re[b] * wr - im[b] * wi, ti = re[b] * wi + im[b] * wr;
        re[b] = re[a] - tr; im[b] = im[a] - ti;
        re[a] += tr; im[a] += ti;
      }
    }
  }
  if (inverse) for (let i = 0; i < F; i++) { re[i] /= F; im[i] /= F; }
}
// Janela de raiz de Hann: análise e síntese com 50% de sobreposição reconstroem o sinal exato.
const SQRT_HANN = Float64Array.from({ length: F }, (_, i) => Math.sin(Math.PI * i / F));

class OwnAudioRemover extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ref = [new Float32Array(RING), new Float32Array(RING)];
    this.pos = 0;
    this.delay = -1;   // atraso da captura em relação à referência; -1 enquanto não se sabe
    this.pre = 0;
    this.parts = 0;    // partes do filtro com o caminho estimado; 0 = ainda sem estimativa
    this.wr = null; this.wi = null;   // espectros das partes do caminho, por canal
    this.xr = null; this.xi = null;   // espectros dos últimos blocos da referência, por canal
    this.re = new Float64Array(F);
    this.im = new Float64Array(F);
    // Depois da subtração, por canal: blocos anteriores, espectros, ajuste de volume por faixa e
    // ganho da supressão por frequência.
    const pair = (make) => [make(), make()];
    this.lastE = pair(() => new Float64Array(N));
    this.lastY = pair(() => new Float64Array(N));
    this.overlap = pair(() => new Float64Array(N));
    this.er = pair(() => new Float64Array(F));
    this.ei = pair(() => new Float64Array(F));
    this.yr = pair(() => new Float64Array(F));
    this.yi = pair(() => new Float64Array(F));
    this.cross = pair(() => new Float64Array(NB));
    this.echo = pair(() => new Float64Array(NB));
    this.total = pair(() => new Float64Array(NB));
    this.adjust = pair(() => new Float64Array(NB));
    this.sums = [new Float64Array(NB), new Float64Array(NB), new Float64Array(NB)];
    this.gain = pair(() => new Float64Array(F / 2 + 1).fill(1));
    this.e = [new Float64Array(N), new Float64Array(N)];
    this.y = [new Float64Array(N), new Float64Array(N)];
    this.powIn = 0;
    this.powOut = 0;
    this.worse = 0;
    this.sendRef = [new Float32Array(SEND), new Float32Array(SEND)];
    this.sendCap = [new Float32Array(SEND), new Float32Array(SEND)];
    this.sendN = 0;
    this.estimator = null;
    this.port.onmessage = ({ data }) => {
      if (!data?.estimator) return;
      this.estimator = data.estimator;
      this.estimator.onmessage = ({ data: path }) => this.setPath(path);
    };
  }

  // Atraso e caminho (um por canal) vindos do worker. Atraso novo sem caminho ainda: subtração parada.
  setPath({ delay, pre, taps, h }) {
    if (!Number.isInteger(delay) || delay < pre + N) return;
    const parts = Math.ceil(taps / N);
    if (delay !== this.delay || parts * F !== this.xr?.[0].length) {
      this.xr = [new Float64Array(parts * F), new Float64Array(parts * F)];
      this.xi = [new Float64Array(parts * F), new Float64Array(parts * F)];
      this.wr = [new Float64Array(parts * F), new Float64Array(parts * F)];
      this.wi = [new Float64Array(parts * F), new Float64Array(parts * F)];
      this.parts = 0;
      this.worse = 0;
      this.powIn = this.powOut = 0;
    }
    this.delay = delay;
    this.pre = pre;
    if (!h) return;
    const { re, im } = this;
    const paths = typeof h[0] === 'number' ? [h, h] : h;
    for (let c = 0; c < 2; c++) {
      for (let p = 0; p < parts; p++) {
        for (let i = 0; i < F; i++) { re[i] = i < N ? paths[c][p * N + i] || 0 : 0; im[i] = 0; }
        fft(re, im, false);
        this.wr[c].set(re, p * F);
        this.wi[c].set(im, p * F);
      }
    }
    this.parts = parts;
  }

  // Eco estimado do bloco atual em this.y[c] (convolução em partes).
  predict() {
    const { re, im, parts } = this, mask = RING - 1;
    const start = this.pos - (this.delay - this.pre) - F; // bloco anterior + atual da referência alinhada
    for (let c = 0; c < 2; c++) {
      const xr = this.xr[c], xi = this.xi[c], ring = this.ref[c], wr = this.wr[c], wi = this.wi[c];
      xr.copyWithin(F, 0, (parts - 1) * F);
      xi.copyWithin(F, 0, (parts - 1) * F);
      for (let i = 0; i < F; i++) { re[i] = ring[(start + i) & mask]; im[i] = 0; }
      fft(re, im, false);
      xr.set(re); xi.set(im);
      re.fill(0); im.fill(0);
      for (let p = 0; p < parts; p++) {
        const o = p * F;
        for (let k = 0; k < F; k++) {
          re[k] += wr[o + k] * xr[o + k] - wi[o + k] * xi[o + k];
          im[k] += wr[o + k] * xi[o + k] + wi[o + k] * xr[o + k];
        }
      }
      fft(re, im, true);
      for (let i = 0; i < N; i++) this.y[c][i] = re[N + i];
    }
  }

  // Depois da subtração, no domínio da frequência (blocos de 256 com janela de raiz de Hann): acerta
  // o volume do eco por faixa e abafa o resíduo. Sempre ligado (sem mudar nada enquanto não há
  // caminho), para o atraso da saída não mudar.
  post(outL, outR, active) {
    const outs = [outL, outR];
    for (let c = 0; c < 2; c++) {
      const r = this.er[c], m = this.ei[c], e = this.e[c], last = this.lastE[c], gain = this.gain[c];
      for (let i = 0; i < N; i++) { r[i] = last[i] * SQRT_HANN[i]; r[N + i] = e[i] * SQRT_HANN[N + i]; m[i] = m[N + i] = 0; }
      last.set(e);
      fft(r, m, false);
      if (active) {
        const yr = this.yr[c], yi = this.yi[c], y = this.y[c], lastY = this.lastY[c];
        for (let i = 0; i < N; i++) { yr[i] = lastY[i] * SQRT_HANN[i]; yr[N + i] = y[i] * SQRT_HANN[N + i]; yi[i] = yi[N + i] = 0; }
        lastY.set(y);
        fft(yr, yi, false);
        this.follow(c, r, m, yr, yi);
        this.shape(c, r, m, yr, yi, gain);
      } else {
        gain.fill(1);
        this.lastY[c].fill(0);
        this.cross[c].fill(0); this.echo[c].fill(0); this.total[c].fill(0); this.adjust[c].fill(0);
      }
      for (let k = 0; k <= F / 2; k++) {
        r[k] *= gain[k]; m[k] *= gain[k];
        if (k && k < F / 2) { r[F - k] *= gain[k]; m[F - k] *= gain[k]; }
      }
      fft(r, m, true);
      const ov = this.overlap[c], out = outs[c];
      for (let i = 0; i < N; i++) {
        out[i] = ov[i] + r[i] * SQRT_HANN[i];
        ov[i] = r[N + i] * SQRT_HANN[N + i];
      }
    }
  }

  // Quanto do eco estimado (Y) ainda está no que sobrou (E), por faixa: a média de E·Y* sobre |Y|².
  // Com o jogo alto por cima a medida oscila; o ajuste só entra na proporção da confiança nela.
  follow(c, r, m, yr, yi) {
    const [sc, se, st] = this.sums, cross = this.cross[c], echo = this.echo[c], total = this.total[c], adjust = this.adjust[c];
    sc.fill(0); se.fill(0); st.fill(0);
    for (let k = 0; k <= F / 2; k++) {
      const b = BAND[k];
      sc[b] += r[k] * yr[k] + m[k] * yi[k];
      se[b] += yr[k] * yr[k] + yi[k] * yi[k];
      st[b] += r[k] * r[k] + m[k] * m[k];
    }
    for (let b = 0; b < NB; b++) {
      cross[b] = cross[b] * GAIN_KEEP + sc[b];
      echo[b] = echo[b] * GAIN_KEEP + se[b];
      total[b] = total[b] * GAIN_KEEP + st[b];
      const g = cross[b] / (echo[b] + 1e-20);
      const count = (BANDS[b + 1] - BANDS[b]) / (1 - GAIN_KEEP);
      const spread = Math.max(0, total[b] - g * g * echo[b]) / (count * echo[b] + 1e-20);
      adjust[b] = Math.max(-0.75, Math.min(3, g * (g * g / (g * g + spread + 1e-20))));
    }
    for (let k = 0; k <= F / 2; k++) {
      const a = adjust[BAND[k]];
      r[k] -= a * yr[k]; m[k] -= a * yi[k];
      if (k && k < F / 2) { r[F - k] -= a * yr[F - k]; m[F - k] -= a * yi[F - k]; }
    }
  }

  // Abafa as frequências em que o que sobrou é só resíduo do eco; onde há jogo ou música por cima,
  // o ganho fica perto de 1.
  shape(c, r, m, yr, yi, gain) {
    const adjust = this.adjust[c];
    for (let k = 0; k <= F / 2; k++) {
      const a = 1 + adjust[BAND[k]];
      const pe = r[k] * r[k] + m[k] * m[k];
      const py = (yr[k] * yr[k] + yi[k] * yi[k]) * a * a;
      const target = Math.max(FLOOR, 1 - RESIDUAL * py / (pe + 1e-12));
      // Abafa rápido e solta devagar, para não "piscar".
      gain[k] = target < gain[k] ? target : gain[k] * 0.7 + target * 0.3;
    }
  }

  process(inputs, outputs) {
    const cap = inputs[0] || [], ref = inputs[1] || [], out = outputs[0];
    const outL = out[0], outR = out[1] || out[0], n = outL.length;
    const zeros = this.zeros ||= new Float32Array(n);
    const capL = cap[0] || zeros, capR = cap[1] || capL;
    const refL = ref[0] || zeros, refR = ref[1] || refL;
    const mask = RING - 1;
    for (let i = 0; i < n; i++) {
      const p = (this.pos + i) & mask;
      this.ref[0][p] = refL[i];
      this.ref[1][p] = refR[i];
    }
    this.pos += n;
    if (n !== N) { // quantum fora do padrão: passa direto
      outL.set(capL); if (outR !== outL) outR.set(capR);
      return true;
    }

    const active = this.parts > 0;
    if (active) this.predict();
    let inPow = 0, outPow = 0;
    for (let c = 0; c < 2; c++) {
      const src = c ? capR : capL, e = this.e[c], y = this.y[c];
      for (let i = 0; i < N; i++) {
        e[i] = active ? src[i] - y[i] : src[i];
        inPow += src[i] * src[i];
        outPow += e[i] * e[i];
      }
    }
    if (active) {
      // Se a subtração passar a somar som em vez de tirar, desliga e pede outra medição.
      this.powIn = this.powIn * 0.97 + inPow * 0.03;
      this.powOut = this.powOut * 0.97 + outPow * 0.03;
      this.worse = this.powOut > this.powIn * 1.5 + 1e-9 ? this.worse + 1 : 0;
      if (this.worse > 110) { // ~0,3 s seguidos
        this.parts = 0;
        this.delay = -1;
        this.estimator?.postMessage({ lost: true });
      }
    }
    this.post(outL, outR, active);

    const sendRef = this.sendRef, sendCap = this.sendCap, at = this.sendN;
    sendRef[0].set(refL, at); sendRef[1].set(refR, at);
    sendCap[0].set(capL, at); sendCap[1].set(capR, at);
    if ((this.sendN += n) >= SEND) {
      this.estimator?.postMessage({ ref: sendRef, cap: sendCap }, [...sendRef, ...sendCap].map((x) => x.buffer));
      this.sendRef = [new Float32Array(SEND), new Float32Array(SEND)];
      this.sendCap = [new Float32Array(SEND), new Float32Array(SEND)];
      this.sendN = 0;
    }
    return true;
  }
}

registerProcessor('own-audio-remover', OwnAudioRemover);
