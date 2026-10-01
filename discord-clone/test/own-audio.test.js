const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createEstimator, estimateDelay } = require('../public/own-audio-estimator');

const RATE = 48000;

// Gerador determinístico (mulberry32), para os testes não variarem. Sequências de sementes
// diferentes não têm relação entre si: o "jogo" nunca é uma cópia da "voz".
function random(seed) {
  return () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (((t ^ (t >>> 14)) >>> 0) / 4294967296) * 2 - 1;
  };
}

// "Fala": ruído em sílabas (rajadas de ~0,2 s com pausas), com mais graves que agudos, perto de -22 dB.
function speech(length, seed = 7) {
  const rnd = random(seed), out = new Float32Array(length);
  let low = 0, env = 0;
  for (let i = 0; i < length; i++) {
    low = low * 0.9 + rnd() * 0.1;
    const syllable = Math.floor(i / (0.2 * RATE));
    const on = (syllable * 2654435761 >>> 0) % 5 !== 0; // uma pausa a cada ~5 sílabas
    env = env * 0.999 + (on ? 0.001 : 0);
    out[i] = low * 0.45 * env;
  }
  return out;
}

// Caminho parecido com o medido num Windows real: atraso fracionário, reflexões curtas e uma
// cauda longa de graves (equalização do sistema).
const WINDOWS_PATH = (() => {
  const h = new Float32Array(2400);
  h[0] = 0.7; h[1] = 0.68; h[3] = 0.27; h[5] = -0.2; h[6] = -0.2; h[7] = -0.12;
  for (let n = 8; n < h.length; n++) h[n] += 0.012 * Math.pow(0.996, n);
  return h;
})();
// O outro ouvido com som espacial ligado: outras reflexões, outro tempo.
const OTHER_EAR = (() => {
  const h = new Float32Array(2400);
  h[0] = 0.3; h[2] = 0.5; h[9] = 0.35; h[14] = -0.25; h[31] = 0.15; h[60] = -0.1;
  for (let n = 8; n < h.length; n++) h[n] += 0.01 * Math.pow(0.995, n) * Math.cos(n / 7);
  return h;
})();
function systemPath(ref, delay, h = WINDOWS_PATH) {
  const out = new Float32Array(ref.length);
  for (let i = delay; i < ref.length; i++) {
    let s = 0;
    for (let k = 0; k < h.length && i - delay - k >= 0; k++) s += h[k] * ref[i - delay - k];
    out[i] = s;
  }
  return out;
}

function loadWorklet() {
  let Processor;
  const context = { registerProcessor: (_name, cls) => { Processor = cls; }, AudioWorkletProcessor: class { constructor() { this.port = { postMessage() {}, onmessage: null }; } }, Math, Float32Array, Float64Array, Uint16Array, Number };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/own-audio-worklet.js'), 'utf8'), context);
  return Processor;
}

// Liga worklet e estimador como no navegador (mensagens síncronas) e processa a captura inteira.
// capture: mono ou [esquerdo, direito]. Devolve o lado esquerdo em `out` e os dois em `sides`.
function run(capture, reference) {
  const [capL, capR] = Array.isArray(capture) ? capture : [capture, capture];
  const Processor = loadWorklet(), node = new Processor(), events = [];
  const toWorklet = { onmessage: null, postMessage() {} };
  const estimator = createEstimator(RATE, (message) => toWorklet.onmessage({ data: message }));
  toWorklet.postMessage = (message) => {
    if (message.lost) { events.push('lost'); estimator.lost(); } else if (message.ref) estimator.push(message.ref, message.cap);
  };
  node.port.onmessage({ data: { estimator: toWorklet } });
  const n = capL.length, out = [new Float32Array(n), new Float32Array(n)];
  for (let i = 0; i + 128 <= n; i += 128) {
    const o = [new Float32Array(128), new Float32Array(128)], r = reference.subarray(i, i + 128);
    node.process([[capL.subarray(i, i + 128), capR.subarray(i, i + 128)], [r, r]], [o]);
    out[0].set(o[0], i); out[1].set(o[1], i);
  }
  // A saída sai 128 amostras atrasada (processamento em blocos sobrepostos): alinha com a captura.
  const sides = out.map((x) => { const a = new Float32Array(n); a.set(x.subarray(128)); return a; });
  return { out: sides[0], sides, stats: estimator.stats, events };
}

const power = (x, from, to) => { let s = 0; for (let i = from; i < to; i++) s += x[i] * x[i]; return s / (to - from); };
const db = (x) => 10 * Math.log10(x + 1e-15);
// Amplitude de um tom, por correlação com seno e cosseno.
const toneAmplitude = (x, hz, from, to) => {
  let s = 0, c = 0;
  for (let i = from; i < to; i++) { s += x[i] * Math.sin(2 * Math.PI * hz * i / RATE); c += x[i] * Math.cos(2 * Math.PI * hz * i / RATE); }
  return 2 * Math.hypot(s, c) / (to - from);
};

test('delay estimate finds the copy of the reference and ignores unrelated audio', () => {
  const rnd = random(3), n = 12000, ref = new Float32Array(n), other = new Float32Array(n);
  for (let i = 0; i < n; i++) { ref[i] = rnd(); other[i] = rnd(); }
  const cap = new Float32Array(n);
  for (let i = 700; i < n; i++) cap[i] = 0.6 * ref[i - 700] + 0.3 * other[i];
  assert.equal(estimateDelay(ref, cap, 3000, 3000, 60)?.delay, 700);
  assert.equal(estimateDelay(ref, other, 3000, 3000, 60), null, 'no copy, no delay');
  assert.equal(estimateDelay(new Float32Array(n), cap, 3000, 3000, 60), null, 'silent reference');
});

const seconds = 10, n = seconds * RATE, delay = 4811, from = 3 * RATE;
const ref = speech(n), echo = systemPath(ref, delay);

test('removes the call audio from the system audio', () => {
  const { out, stats, events } = run(echo, ref);
  assert.equal(stats.delay, delay - (delay % 8), 'delay measured to within the decimation step');
  assert.deepEqual(events, [], 'the filter never had to give up');
  const reduction = db(power(echo, from, n)) - db(power(out, from, n));
  assert.ok(reduction > 35, `echo reduced by ${reduction.toFixed(1)} dB`);
});

test('keeps the game (other system audio) untouched while removing the call', () => {
  const capture = new Float32Array(n);
  for (let i = 0; i < n; i++) capture[i] = echo[i] + 0.05 * Math.sin(2 * Math.PI * 1000 * i / RATE);
  const { out } = run(capture, ref);
  const kept = 20 * Math.log10(toneAmplitude(out, 1000, from, n) / 0.05);
  assert.ok(Math.abs(kept) < 0.5, `game level changed by ${kept.toFixed(2)} dB`);
});

test('removes the call audio when each ear gets it differently (spatial sound)', () => {
  const left = echo, right = systemPath(ref, delay, OTHER_EAR);
  const { sides } = run([left, right], ref);
  for (const [name, side, original] of [['left', sides[0], left], ['right', sides[1], right]]) {
    const reduction = db(power(original, from, n)) - db(power(side, from, n));
    assert.ok(reduction > 35, `${name}: echo reduced by ${reduction.toFixed(1)} dB`);
  }
});

test('follows the output volume changing all the time (loudness equalization)', () => {
  const varying = echo.map((x, i) => x * (1 + 0.5 * Math.sin(2 * Math.PI * 0.7 * i / RATE)));
  const { out } = run(varying, ref);
  const reduction = db(power(varying, from, n)) - db(power(out, from, n));
  assert.ok(reduction > 25, `echo reduced by ${reduction.toFixed(1)} dB`);
});

test('accepts the single path learned by the previous version', () => {
  const sent = [];
  createEstimator(RATE, (message) => sent.push(message), { delay: 4800, h: new Float32Array([0.5, 0.25]) });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].h.length, 2, 'one path per side');
  assert.deepEqual([...sent[0].h[1]], [0.5, 0.25]);
});

test('without a measured path the capture passes through untouched', () => {
  const n = RATE, rnd = random(11), capture = new Float32Array(n);
  for (let i = 0; i < n; i++) capture[i] = rnd() * 0.1;
  const { out } = run(capture, new Float32Array(n));
  let diff = 0;
  for (let i = 1024; i < n - 1024; i++) diff = Math.max(diff, Math.abs(out[i] - capture[i]));
  assert.ok(diff < 1e-6, `max difference ${diff}`);
});
