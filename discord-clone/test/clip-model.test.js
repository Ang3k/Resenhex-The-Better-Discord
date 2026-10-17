const test = require('node:test');
const assert = require('node:assert/strict');
const ClipModel = require('../public/clip-model.js');

const SR = 48000;
function person(accountId, seconds = 3, fill = () => 0, offset = 0) {
  const pcm = new Float32Array(seconds * SR);
  for (let i = offset; i < pcm.length; i++) pcm[i] = fill(i / SR);
  return { accountId, profile: { name: accountId }, pcm, offset, allowClips: true, left: false };
}
const snap = (people, states = [], seconds = 3) => ({ sampleRate: SR, takenAt: 100_000, seconds, people, states });
const speech = (from, to, amp) => (t) => (t >= from && t < to ? amp * Math.sin(2 * Math.PI * 220 * t) : 0);
const opts = (over = {}) => ({ allowNow: () => true, localMuted: new Set(), silencedNow: () => false, selfId: 'me', selfAllow: true, ...over });
const ids = (list) => list.map((p) => p.accountId);

test('quem desligou, foi mutado localmente ou está silenciado fica fora', () => {
  const s = snap([person('me'), person('b'), person('c'), person('d')]);
  const range = { start: 0, end: 3 };
  assert.deepEqual(ids(ClipModel.included(s, opts({ allowNow: (id) => id !== 'b' }), range)), ['me', 'c', 'd']);
  assert.deepEqual(ids(ClipModel.included(s, opts({ localMuted: new Set(['c']) }), range)), ['me', 'b', 'd']);
  assert.deepEqual(ids(ClipModel.included(s, opts({ silencedNow: (id) => id === 'd' }), range)), ['me', 'b', 'c']);
  assert.deepEqual(ids(ClipModel.included(s, opts({ selfAllow: false }), range)), ['b', 'c', 'd']);
});

test('quem não tem áudio no trecho escolhido fica fora', () => {
  const late = person('late', 3, () => 0, 2 * SR); // entrou aos 2 s
  const s = snap([person('me'), late]);
  assert.deepEqual(ids(ClipModel.included(s, opts(), { start: 0, end: 1.5 })), ['me']);
  assert.deepEqual(ids(ClipModel.included(s, opts(), { start: 0, end: 2.5 })), ['me', 'late']);
});

test('chamada de uma pessoa só ainda gera clipe', () => {
  assert.equal(ClipModel.included(snap([person('me')]), opts(), { start: 0, end: 3 }).length, 1);
});

test('fala acende com a regra da chamada e segura 300 ms', () => {
  const p = person('b', 3, speech(1.0, 1.2, 0.05));
  const frames = ClipModel.speakingFrames(p, snap([p]), { start: 0, end: 3, fps: 30 });
  assert.equal(frames.length, 90);
  const at = (t) => frames[Math.round(t * 30)];
  assert.equal(at(0.9), 0);
  for (const t of [1.0, 1.1, 1.2, 1.3, 1.4]) assert.equal(at(t), 1, `aceso em ${t}`);
  assert.equal(at(1.6), 0);
  const quiet = person('q', 3, speech(1.0, 1.2, 0.02));
  assert.ok(ClipModel.speakingFrames(quiet, snap([quiet]), { start: 0, end: 3 }).every((f) => f === 0));
});

test('o trecho começa onde o corte começa', () => {
  const p = person('b', 3, speech(1.0, 1.2, 0.05));
  const frames = ClipModel.speakingFrames(p, snap([p]), { start: 0.5, end: 2, fps: 30 });
  assert.equal(frames.length, 45);
  assert.equal(frames[Math.round((1.1 - 0.5) * 30)], 1);
  assert.equal(frames[0], 0);
});

test('mudo no estado apaga mesmo com som', () => {
  const p = person('b', 3, speech(1.0, 1.2, 0.05));
  // takenAt 100_000 ms e 3 s de foto: o começo da foto é 97_000 ms.
  const states = [
    { t: 97_900, byAccount: new Map([['b', { muted: true }]]) },
    { t: 99_000, byAccount: new Map([['b', { muted: false }]]) },
  ];
  assert.ok(ClipModel.speakingFrames(p, snap([p], states), { start: 0, end: 3 }).every((f) => f === 0));
});

test('grade cabe e não invade a faixa de baixo', () => {
  for (let n = 1; n <= 12; n++) {
    const cells = ClipModel.layout(n);
    assert.equal(cells.length, n);
    for (const c of cells) {
      assert.ok(c.y - c.r >= 0 && c.y + c.r + 34 <= 720 - 64, `n=${n} cabe na altura`);
      assert.ok(c.x - c.r >= 0 && c.x + c.r <= 1280, `n=${n} cabe na largura`);
    }
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      assert.ok(Math.hypot(cells[i].x - cells[j].x, cells[i].y - cells[j].y) >= cells[i].r + cells[j].r, `n=${n} sem sobrepor`);
    }
  }
  assert.equal(ClipModel.layout(1)[0].r, 110);
  assert.ok(ClipModel.layout(12)[0].r >= 48);
});

test('onda é o pico da mistura por balde, de 0 a 1', () => {
  const a = new Float32Array([0, 0.2, 0, 0]), b = new Float32Array([0, 0.2, 0, -0.1]);
  assert.deepEqual(ClipModel.peaks([a, b], 2), [1, 0.25]);
  assert.deepEqual(ClipModel.peaks([new Float32Array(4)], 2), [0, 0]);
});

test('corte respeita 1 a 30 s', () => {
  assert.deepEqual(ClipModel.clampSelection({ start: 5, end: 5.2 }, { total: 30, moving: 'end' }), { start: 5, end: 6 });
  assert.deepEqual(ClipModel.clampSelection({ start: 0, end: 40 }, { total: 30 }), { start: 0, end: 30 });
  assert.deepEqual(ClipModel.clampSelection({ start: 29.8, end: 30 }, { total: 30, moving: 'start' }), { start: 29, end: 30 });
  assert.deepEqual(ClipModel.clampSelection({ start: -2, end: 10 }, { total: 30, moving: 'start' }), { start: 0, end: 10 });
  assert.deepEqual(ClipModel.clampSelection({ start: 0, end: 0.5 }, { total: 0.5 }), { start: 0, end: 0.5 }, 'menos de 1 s gravado: o que houver');
});
