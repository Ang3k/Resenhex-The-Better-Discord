// Streaming kernels for the approved recipes. Buffers are allocated at construction.
export class Sos {
  constructor(rows) {
    this.rows = rows;
    this.state = new Float64Array(rows.length * 2);
  }
  reset() {
    this.state.fill(0);
  }
  tick(x) {
    for (let i = 0; i < this.rows.length; i++) {
      const c = this.rows[i],
        n = i * 2,
        y = c[0] * x + this.state[n];
      this.state[n] = c[1] * x - c[4] * y + this.state[n + 1];
      this.state[n + 1] = c[2] * x - c[5] * y;
      x = y;
    }
    return x;
  }
}
export class Random {
  constructor(seed = 20261012) {
    this.initial = seed >>> 0 || 1;
    this.reset();
  }
  reset() {
    this.state = this.initial;
  }
  next() {
    let x = this.state;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.state = x >>> 0;
    return this.state / 4294967296;
  }
}
export class Fft {
  constructor(size) {
    this.size = size;
    this.reverse = new Uint32Array(size);
    this.cos = new Float64Array(size / 2);
    this.sin = new Float64Array(size / 2);
    const bits = Math.log2(size);
    for (let i = 0; i < size; i++) {
      let r = 0,
        x = i;
      for (let k = 0; k < bits; k++) {
        r = (r << 1) | (x & 1);
        x >>>= 1;
      }
      this.reverse[i] = r;
    }
    for (let i = 0; i < size / 2; i++) {
      this.cos[i] = Math.cos((2 * Math.PI * i) / size);
      this.sin[i] = Math.sin((2 * Math.PI * i) / size);
    }
  }
  run(re, im, inverse = false) {
    const n = this.size;
    for (let i = 0; i < n; i++) {
      const j = this.reverse[i];
      if (j > i) {
        let v = re[i];
        re[i] = re[j];
        re[j] = v;
        v = im[i];
        im[i] = im[j];
        im[j] = v;
      }
    }
    for (let width = 2; width <= n; width *= 2) {
      const half = width / 2,
        step = n / width;
      for (let base = 0; base < n; base += width)
        for (let k = 0; k < half; k++) {
          const a = base + k,
            b = a + half,
            c = this.cos[k * step],
            s = this.sin[k * step] * (inverse ? 1 : -1),
            tr = re[b] * c - im[b] * s,
            ti = re[b] * s + im[b] * c;
          re[b] = re[a] - tr;
          im[b] = im[a] - ti;
          re[a] += tr;
          im[a] += ti;
        }
    }
    if (inverse)
      for (let i = 0; i < n; i++) {
        re[i] /= n;
        im[i] /= n;
      }
  }
}
export class Robot {
  constructor(coefficients, rate = 48000) {
    this.rate = rate;
    this.bands = coefficients.robotBands.map((c) => ({
      voice: new Sos(c),
      carrier: new Sos(c),
      envelope: new Sos(coefficients.robotEnvelope),
    }));
    this.highpass = new Sos(coefficients.robotHighpass);
    this.reset();
  }
  reset() {
    this.frame = 0;
    this.highpass.reset();
    for (const b of this.bands) {
      b.voice.reset();
      b.carrier.reset();
      b.envelope.reset();
    }
  }
  tick(x) {
    const t = this.frame++ / this.rate,
      carrier = 2 * ((92 * t) % 1) - 1;
    let y = 0;
    for (const b of this.bands)
      y += b.carrier.tick(carrier) * b.envelope.tick(Math.abs(b.voice.tick(x)));
    y *= 0.75 + 0.25 * Math.sin(2 * Math.PI * 40 * t);
    y *= 10 ** (30.426751762430925 / 20);
    y = this.highpass.tick(y) * 10 ** (5 / 20);
    return (Math.tanh(1.1 * y) / Math.tanh(1.1)) * 0.89 * 10 ** (2.5 / 20);
  }
}
export class Whisper {
  constructor(rate = 48000, seed = 20261012) {
    this.rate = rate;
    this.n = 512;
    this.hop = 64;
    this.fft = new Fft(this.n);
    this.re = new Float64Array(this.n);
    this.im = new Float64Array(this.n);
    this.input = new Float64Array(2048);
    this.output = new Float64Array(2048);
    this.window = Float64Array.from(
      { length: this.n },
      (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / this.n),
    );
    this.random = new Random(seed);
    this.latency = 512;
    this.reset();
  }
  reset() {
    this.frame = 0;
    this.input.fill(0);
    this.output.fill(0);
    this.random.reset();
  }
  tick(x) {
    const frame = this.frame++;
    this.input[frame & 2047] = x;
    const value = this.output[frame & 2047];
    this.output[frame & 2047] = 0;
    if ((frame + 1) % this.hop === 0) {
      const start = frame + 1 - this.n;
      for (let i = 0; i < this.n; i++) {
        this.re[i] =
          start + i < 0 ? 0 : this.input[(start + i) & 2047] * this.window[i];
        this.im[i] = 0;
      }
      this.fft.run(this.re, this.im);
      for (let i = 0; i < this.n; i++) {
        const magnitude = Math.hypot(this.re[i], this.im[i]),
          phase = this.random.next() * 2 * Math.PI;
        this.re[i] = magnitude * Math.cos(phase);
        this.im[i] = magnitude * Math.sin(phase);
      }
      this.fft.run(this.re, this.im, true);
      for (let i = 0; i < this.n; i++)
        this.output[(start + i + this.latency) & 2047] +=
          this.re[i] * this.window[i];
    }
    return value;
  }
}

// Causal WSOLA. The source cursor is bounded against the capture clock; queued
// speech is recovered during pauses. A fixed analysis lookahead is included in
// the 700 ms limit. Correlation is FFT-based rather than a quadratic inner loop.
export class Drunk {
  constructor(coefficients, rate = 48000, seed = 20261012) {
    this.rate = rate;
    this.n = 1536;
    this.hop = 384;
    this.tolerance = 384;
    this.lookahead = 2304;
    this.latency = this.lookahead;
    this.maxDelay = Math.floor(0.7 * rate);
    this.random = new Random(seed);
    this.mask = 65535;
    this.source = new Float64Array(this.mask + 1);
    this.ola = new Float64Array(16384);
    this.weights = new Float64Array(16384);
    this.oldestSources = new Float64Array(16384);
    this.newestSources = new Float64Array(16384);
    this.window = Float64Array.from(
      { length: this.n },
      (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / this.n),
    );
    this.fft = new Fft(4096);
    this.ar = new Float64Array(4096);
    this.ai = new Float64Array(4096);
    this.br = new Float64Array(4096);
    this.bi = new Float64Array(4096);
    this.lowpass = new Sos(coefficients.drunkLowpass);
    this.reset();
  }
  reset() {
    this.source.fill(0);
    this.ola.fill(0);
    this.weights.fill(0);
    this.oldestSources.fill(Infinity);
    this.newestSources.fill(-Infinity);
    this.lowpass.reset();
    this.random.reset();
    this.written = 0;
    this.outputFrame = 0;
    this.synthFrame = 0;
    this.phase = 0;
    this.nominal = 0;
    this.previous = -1;
    this.segmentLeft = 0;
    this.target = 1;
    this.speed = 1;
    this.energy = 0;
    this.floor = 1e-9;
    this.speechPeak = 1e-7;
    this.delay = 0;
    this.maximumDelay = 0;
    this.maximumActualDelay = 0;
    this.minimumActualDelay = Infinity;
    this.minimumCursor = Infinity;
    this.phases = [
      this.random.next() * 6.3,
      this.random.next() * 6.3,
      this.random.next() * 6.3,
    ];
  }
  sample(index) {
    if (index < 0 || index >= this.written) return 0;
    return this.source[Math.floor(index) & this.mask];
  }
  correlation(position) {
    this.ar.fill(0);
    this.ai.fill(0);
    this.br.fill(0);
    this.bi.fill(0);
    for (let i = 0; i < this.n + 2 * this.tolerance; i++)
      this.ar[i] = this.sample(position - this.tolerance + i);
    for (let i = 0; i < this.n; i++)
      this.br[this.n - 1 - i] = this.sample(this.previous + this.hop + i);
    this.fft.run(this.ar, this.ai);
    this.fft.run(this.br, this.bi);
    for (let i = 0; i < 4096; i++) {
      const re = this.ar[i] * this.br[i] - this.ai[i] * this.bi[i],
        im = this.ar[i] * this.bi[i] + this.ai[i] * this.br[i];
      this.ar[i] = re;
      this.ai[i] = im;
    }
    this.fft.run(this.ar, this.ai, true);
    let best = -Infinity,
      offset = 0;
    for (let i = 0; i <= 2 * this.tolerance; i++)
      if (this.ar[this.n - 1 + i] > best) {
        best = this.ar[this.n - 1 + i];
        offset = i;
      }
    return position - this.tolerance + offset;
  }
  grain() {
    const consumed = this.nominal,
      delay = Math.max(0, this.outputFrame - consumed),
      dynamicLimit = this.maxDelay;
    const talking =
      this.energy > Math.max(3.16e-5, this.speechPeak * 10 ** (-42 / 10));
    if (this.segmentLeft <= 0) {
      const mode =
          delay > dynamicLimit * 0.6 ? 3 : Math.floor(this.random.next() * 4),
        ranges =
          mode < 2 ? [0.5, 0.68] : mode === 2 ? [0.9, 1.05] : [1.3, 1.55];
      this.target = ranges[0] + this.random.next() * (ranges[1] - ranges[0]);
      this.segmentLeft = Math.floor(
        (0.45 + this.random.next() * 0.75) * this.rate,
      );
    }
    let target = this.target;
    if (delay > dynamicLimit * 0.6) target = 1.55;
    if (!talking) target = delay > 0 ? 1.9 : 1;
    if (delay <= 0 && target > 1) target = 1;
    this.speed +=
      (target - this.speed) * (1 - Math.exp(-this.hop / (0.09 * this.rate)));
    const maxAdvance = this.hop + delay;
    this.speed = Math.max(0.5, Math.min(this.speed, maxAdvance / this.hop));
    const t = this.outputFrame / this.rate,
      drift =
        (Math.sin(2 * Math.PI * 0.23 * t + this.phases[0]) +
          0.6 * Math.sin(2 * Math.PI * 0.61 * t + this.phases[1]) +
          0.35 * Math.sin(2 * Math.PI * 1.37 * t + this.phases[2])) /
        1.95;
    this.cents = 45 * drift + (this.speed - 1) * 60;
    this.pitch = 2 ** (this.cents / 1200);
    const position = Math.round(this.nominal);
    let actual = this.previous < 0 ? position : this.correlation(position);
    // Restrict the correlation result as well as the nominal tempo plan. Never
    // read captured speech ahead of the output clock or beyond the budget.
    actual = Math.max(0, Math.min(actual, this.outputFrame));
    actual = Math.max(actual, this.written - this.maxDelay + this.hop);
    actual = Math.min(actual, this.written - this.n);
    for (let i = 0; i < this.n; i++) {
      const index = (this.synthFrame + i) & 16383;
      this.ola[index] += this.sample(actual + i) * this.window[i];
      this.weights[index] += this.window[i];
      if (this.window[i] > 1e-9) {
        this.oldestSources[index] = Math.min(
          this.oldestSources[index],
          actual + i,
        );
        this.newestSources[index] = Math.max(
          this.newestSources[index],
          actual + i,
        );
      }
    }
    this.previous = actual;
    this.nominal += (this.hop * this.speed) / this.pitch;
    this.nominal = Math.min(this.nominal, this.outputFrame + this.hop);
    this.synthFrame += this.hop;
    this.segmentLeft -= this.hop;
    this.delay = Math.max(0, this.outputFrame - this.nominal);
    this.maximumDelay = Math.max(
      this.maximumDelay,
      this.delay / this.rate + this.lookahead / this.rate,
    );
  }
  tick(x) {
    this.source[this.written++ & this.mask] = x;
    this.energy +=
      (x * x - this.energy) * (1 - Math.exp(-1 / (0.01 * this.rate)));
    this.speechPeak = Math.max(this.energy, this.speechPeak * 0.999995);
    if (this.written <= this.lookahead) return 0;
    if (this.synthFrame <= this.phase + this.hop) this.grain();
    const p = Math.floor(this.phase),
      fraction = this.phase - p,
      i = p & 16383,
      j = (p + 1) & 16383;
    const a = this.ola[i] / Math.max(this.weights[i], 1e-3),
      b = this.ola[j] / Math.max(this.weights[j], 1e-3);
    const oldest = Math.min(
        this.oldestSources[i],
        fraction > 0 ? this.oldestSources[j] : Infinity,
      ),
      newest = Math.max(
        this.newestSources[i],
        fraction > 0 ? this.newestSources[j] : -Infinity,
      );
    if (Number.isFinite(oldest))
      this.maximumActualDelay = Math.max(
        this.maximumActualDelay,
        (this.written - oldest) / this.rate,
      );
    if (Number.isFinite(newest))
      this.minimumActualDelay = Math.min(
        this.minimumActualDelay,
        (this.written - newest) / this.rate,
      );
    let y = a + (b - a) * fraction;
    const slow = Math.min(1, Math.max(0, (1 - this.speed) / 0.4)),
      soft = this.lowpass.tick(y);
    y = y * (1 - 0.55 * slow) + soft * 0.55 * slow;
    y *= 10 ** (((this.cents / 45) * 1.5) / 20);
    const next = this.phase + (this.pitch || 1);
    for (let clear = p; clear < Math.floor(next); clear++) {
      this.ola[clear & 16383] = 0;
      this.weights[clear & 16383] = 0;
      this.oldestSources[clear & 16383] = Infinity;
      this.newestSources[clear & 16383] = -Infinity;
    }
    this.phase = next;
    this.outputFrame++;
    return Number.isFinite(y) ? y : 0;
  }
}

export function peaking(hz, db, q, rate = 48000) {
  const a = 10 ** (db / 40),
    w = (2 * Math.PI * hz) / rate,
    alpha = Math.sin(w) / (2 * q),
    c = Math.cos(w),
    a0 = 1 + alpha / a;
  return [
    [
      (1 + alpha * a) / a0,
      (-2 * c) / a0,
      (1 - alpha * a) / a0,
      1,
      (-2 * c) / a0,
      (1 - alpha / a) / a0,
    ],
  ];
}
