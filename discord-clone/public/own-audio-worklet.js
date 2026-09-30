// Tira do som do computador capturado aquilo que o próprio Resenhex tocou (vozes da chamada, efeitos).
// Entrada 0: a captura. Entrada 1: a referência, tudo que o Resenhex mandou para a saída de som.
// O own-audio-estimator.js (um worker) mede o atraso e estima o caminho entre as duas; aqui, na
// thread de áudio, só o que é leve e tem tempo certo:
//   1. subtrair o eco estimado (convolução em partes, por sobreposição e descarte);
//   2. abafar o pouco que sobra onde não há outro som por cima (supressão de resíduo);
//   3. mandar referência e captura para o worker.
const N = 128;               // bloco (um quantum do Web Audio)
const F = 2 * N;             // tamanho da FFT dos blocos
const RING = 1 << 17;        // histórico da referência (~2,7 s a 48 kHz)
const SEND = 2048;           // amostras por mensagem para o worker
const RESIDUAL = 0.003;      // resíduo esperado depois da subtração (-25 dB do eco estimado)
const FLOOR = 0.1;           // o máximo que a supressão abafa (-20 dB)

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
    this.wr = null; this.wi = null;   // espectros das partes do caminho
    this.xr = null; this.xi = null;   // espectros dos últimos blocos da referência, por canal
    this.re = new Float64Array(F);
    this.im = new Float64Array(F);
    // Supressão de resíduo: blocos anteriores, espectros e ganho por frequência.
    this.lastE = [new Float64Array(N), new Float64Array(N)];
    this.lastY = new Float64Array(N);
    this.overlap = [new Float64Array(N), new Float64Array(N)];
    this.er = [new Float64Array(F), new Float64Array(F)];
    this.ei = [new Float64Array(F), new Float64Array(F)];
    this.yr = new Float64Array(F);
    this.yi = new Float64Array(F);
    this.gain = new Float64Array(F).fill(1);
    this.e = [new Float64Array(N), new Float64Array(N)];
    this.y = [new Float64Array(N), new Float64Array(N)];
    this.powIn = 0;
    this.powOut = 0;
    this.worse = 0;
    this.sendRef = new Float32Array(SEND);
    this.sendCap = new Float32Array(SEND);
    this.sendN = 0;
    this.estimator = null;
    this.port.onmessage = ({ data }) => {
      if (!data?.estimator) return;
      this.estimator = data.estimator;
      this.estimator.onmessage = ({ data: path }) => this.setPath(path);
    };
  }

  // Atraso e caminho vindos do worker. Atraso novo sem caminho ainda: subtração parada.
  setPath({ delay, pre, taps, h }) {
    if (!Number.isInteger(delay) || delay < pre + N) return;
    const parts = Math.ceil(taps / N);
    if (delay !== this.delay || parts * F !== this.xr?.[0].length) {
      this.xr = [new Float64Array(parts * F), new Float64Array(parts * F)];
      this.xi = [new Float64Array(parts * F), new Float64Array(parts * F)];
      this.wr = new Float64Array(parts * F);
      this.wi = new Float64Array(parts * F);
      this.parts = 0;
      this.worse = 0;
      this.powIn = this.powOut = 0;
    }
    this.delay = delay;
    this.pre = pre;
    if (!h) return;
    const { re, im } = this;
    for (let p = 0; p < parts; p++) {
      for (let i = 0; i < F; i++) { re[i] = i < N ? h[p * N + i] || 0 : 0; im[i] = 0; }
      fft(re, im, false);
      this.wr.set(re, p * F);
      this.wi.set(im, p * F);
    }
    this.parts = parts;
  }

  // Eco estimado do bloco atual em this.y[c] (convolução em partes).
  predict() {
    const { re, im, wr, wi, parts } = this, mask = RING - 1;
    const start = this.pos - (this.delay - this.pre) - F; // bloco anterior + atual da referência alinhada
    for (let c = 0; c < 2; c++) {
      const xr = this.xr[c], xi = this.xi[c], ring = this.ref[c];
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

  // Abafa as frequências em que o que sobrou é só resíduo do eco; onde há jogo ou música por cima,
  // o ganho fica perto de 1. Sempre ligada (com ganho 1 sem estimativa), para o atraso não mudar.
  suppress(outL, outR, active) {
    const { er, ei, yr, yi, gain } = this;
    for (let c = 0; c < 2; c++) {
      const e = this.e[c], last = this.lastE[c], r = er[c], m = ei[c];
      for (let i = 0; i < N; i++) { r[i] = last[i] * SQRT_HANN[i]; r[N + i] = e[i] * SQRT_HANN[N + i]; m[i] = m[N + i] = 0; }
      last.set(e);
      fft(r, m, false);
    }
    if (active) {
      for (let i = 0; i < N; i++) {
        const y = (this.y[0][i] + this.y[1][i]) * 0.5;
        yr[i] = this.lastY[i] * SQRT_HANN[i]; yr[N + i] = y * SQRT_HANN[N + i]; yi[i] = yi[N + i] = 0;
        this.lastY[i] = y;
      }
      fft(yr, yi, false);
      for (let k = 0; k < F; k++) {
        const pe = (er[0][k] ** 2 + ei[0][k] ** 2 + er[1][k] ** 2 + ei[1][k] ** 2) * 0.5;
        const py = yr[k] ** 2 + yi[k] ** 2;
        const target = Math.max(FLOOR, 1 - RESIDUAL * py / (pe + 1e-12));
        // Abafa rápido e solta devagar, para não "piscar".
        gain[k] = target < gain[k] ? target : gain[k] * 0.7 + target * 0.3;
      }
    } else {
      gain.fill(1);
      this.lastY.fill(0);
    }
    const outs = [outL, outR];
    for (let c = 0; c < 2; c++) {
      const r = er[c], m = ei[c], ov = this.overlap[c], out = outs[c];
      for (let k = 0; k < F; k++) { r[k] *= gain[k]; m[k] *= gain[k]; }
      fft(r, m, true);
      for (let i = 0; i < N; i++) {
        out[i] = ov[i] + r[i] * SQRT_HANN[i];
        ov[i] = r[N + i] * SQRT_HANN[N + i];
      }
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
    this.suppress(outL, outR, active);

    for (let i = 0; i < n; i++) {
      this.sendRef[this.sendN] = (refL[i] + refR[i]) * 0.5;
      this.sendCap[this.sendN] = (capL[i] + capR[i]) * 0.5;
      if (++this.sendN === SEND) {
        this.estimator?.postMessage({ ref: this.sendRef, cap: this.sendCap }, [this.sendRef.buffer, this.sendCap.buffer]);
        this.sendRef = new Float32Array(SEND);
        this.sendCap = new Float32Array(SEND);
        this.sendN = 0;
      }
    }
    return true;
  }
}

registerProcessor('own-audio-remover', OwnAudioRemover);
