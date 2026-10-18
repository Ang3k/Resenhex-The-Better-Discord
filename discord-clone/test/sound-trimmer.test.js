const test = require('node:test');
const assert = require('node:assert/strict');
const Trim = require('../public/sound-trimmer.js');

const SR = 48000;
function source(seconds, fill = () => 0.5) {
  const pcm = new Float32Array(Math.round(seconds * SR));
  for (let i = 0; i < pcm.length; i++) pcm[i] = fill(i / SR);
  return { pcm, peak: 0.5, sampleRate: SR, duration: seconds };
}

test('a dragged edge pushes the other one instead of passing 8 s or the minimum', () => {
  assert.deepEqual(Trim.clampRange({ start: 1, end: 12 }, { total: 30, moving: 'end' }), { start: 4, end: 12 });
  assert.deepEqual(Trim.clampRange({ start: 0, end: 10 }, { total: 30, moving: 'start' }), { start: 0, end: 8 });
  assert.deepEqual(Trim.clampRange({ start: 5, end: 5.1 }, { total: 30, moving: 'start' }), { start: 5, end: 5.3 });
  assert.deepEqual(Trim.clampRange({ start: 5, end: 5.1 }, { total: 30, moving: 'end' }), { start: 4.8, end: 5.1 });
  assert.deepEqual(Trim.clampRange({ start: -2, end: 3 }, { total: 30, moving: 'start' }), { start: 0, end: 3 });
  assert.deepEqual(Trim.clampRange({ start: 27, end: 33 }, { total: 30, moving: 'end' }), { start: 27, end: 30 });
});

test('moving the whole selection keeps its length inside the file', () => {
  assert.deepEqual(Trim.clampRange({ start: 26, end: 32 }, { total: 30, moving: 'both' }), { start: 24, end: 30 });
  assert.deepEqual(Trim.clampRange({ start: -1, end: 5 }, { total: 30, moving: 'both' }), { start: 0, end: 6 });
  assert.deepEqual(Trim.clampRange({ start: 0, end: 2 }, { total: 0.2, moving: 'both' }), { start: 0, end: 0.2 });
});

test('short files start fully selected; long ones skip the silent start', () => {
  assert.deepEqual(Trim.initialRange(source(6.1)), { start: 0, end: 6.1 });
  const late = source(40, (t) => (t >= 12 ? 0.5 : 0.001));
  assert.deepEqual(Trim.initialRange(late), { start: 11.95, end: 19.95 });
  assert.deepEqual(Trim.initialRange(source(40, (t) => (t >= 39 ? 0.5 : 0))), { start: 32, end: 40 });
});

test('long files show a 20 s window that follows the selection', () => {
  assert.equal(Trim.centered({ start: 30, end: 38 }, 120), 24);
  assert.equal(Trim.centered({ start: 1, end: 9 }, 120), 0);
  assert.equal(Trim.centered({ start: 0, end: 6 }, 6), 0);
  assert.equal(Trim.follow(24, { start: 26, end: 34 }, 120), 24);
  assert.equal(Trim.follow(24, { start: 40, end: 48 }, 120), 28);
  assert.equal(Trim.follow(24, { start: 20, end: 28 }, 120), 20);
});

test('waveform bars keep the loudest sample of each slice', () => {
  const pcm = Float32Array.from([0, 0.2, -0.9, 0.1, 0.4, -0.3, 0, 0]);
  assert.deepEqual([...Trim.peaks(pcm, 0, 8, 4)].map((v) => Math.round(v * 10) / 10), [0.2, 0.9, 0.4, 0]);
  assert.deepEqual([...Trim.peaks(pcm, 2, 6, 2)].map((v) => Math.round(v * 10) / 10), [0.9, 0.4]);
});

test('times read as minutes, seconds and tenths', () => {
  assert.equal(Trim.clock(7.44), '0:07,4');
  assert.equal(Trim.clock(59.96), '1:00,0');
  assert.equal(Trim.clock(125.3), '2:05,3');
});
