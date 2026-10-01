import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { state, duration, cues, REVEAL_MS, CRANK, DROP, WOBBLE, LOCK, OPEN, AFTER } from '../public/gacha/linha-do-tempo.mjs';

const require = createRequire(import.meta.url);
const mudae = require('../mudae.js');
const ORDER = ['common', 'rare', 'epic', 'legendary'];
const WOBBLES = { common: 1, rare: 2, epic: 3, legendary: 3 };
const sample = (rarity, options) => {
  const out = [];
  for (let t = 0; t <= duration(rarity) + AFTER; t += 10) out.push([t, state(rarity, t, options)]);
  return out;
};

test('durações por raridade batem com o servidor', () => {
  assert.deepEqual(REVEAL_MS, { common: 1950, rare: 2400, epic: 2850, legendary: 3850 });
  assert.deepEqual(REVEAL_MS, mudae.REVEAL_MS);
  assert.equal(duration('???'), REVEAL_MS.common);
});

test('fases em ordem e a cápsula só aparece depois do botão girar', () => {
  for (const r of ORDER) {
    const phases = [...new Set(sample(r).map(([, s]) => s.phase))];
    assert.deepEqual(phases, r === 'legendary' ? ['crank', 'drop', 'wobble', 'lock', 'open', 'done'] : ['crank', 'drop', 'wobble', 'open', 'done'], r);
    assert.equal(state(r, CRANK - 1).visible, false);
    assert.equal(state(r, CRANK + 1).visible, true);
  }
});

test('a cor sobe um degrau por balançada e só chega na final na última', () => {
  for (const r of ORDER) {
    const lastPeak = CRANK + DROP + (WOBBLES[r] - 0.5) * WOBBLE;
    if (r !== 'common') for (const [t, s] of sample(r)) if (t < lastPeak) assert.notEqual(s.colorTo, r, `${r} entregou a cor em ${t} ms`);
    assert.equal(state(r, duration(r)).colorTo, r);
  }
  const ws = CRANK + DROP;
  assert.equal(state('epic', ws + WOBBLE * 0.6).colorTo, 'common');
  assert.equal(state('epic', ws + WOBBLE * 1.6).colorTo, 'rare');
  assert.equal(state('epic', ws + WOBBLE * 2.6).colorTo, 'epic');
});

test('lendário é idêntico ao épico até a trava', () => {
  const lock = CRANK + DROP + 3 * WOBBLE;
  for (let t = 0; t < lock; t += 25) assert.deepEqual(state('legendary', t), state('epic', t), `diferente em ${t} ms`);
});

test('pontinhos acendem um por balançada', () => {
  const ws = CRANK + DROP;
  assert.equal(state('epic', ws + WOBBLE * 0.4).dots, 0);
  assert.equal(state('epic', ws + WOBBLE * 0.6).dots, 1);
  assert.equal(state('epic', ws + WOBBLE * 2.6).dots, 3);
  assert.equal(state('common', ws + WOBBLE * 0.6).dots, 1);
});

test('a cápsula sai da portinhola, quica e respinga', () => {
  const start = state('common', CRANK + 1);
  assert.ok(start.hop > 0.35 && start.hop < 0.45, 'começa na altura da portinhola');
  assert.ok(sample('common').some(([, s]) => s.phase === 'drop' && s.hop > 0.95), 'sobe um pouco ao sair');
  const impacts = cues('common').filter((c) => c.name === 'bounce').map((c) => c.at);
  assert.equal(impacts.length, 3);
  for (const at of impacts) {
    const s = state('common', at + 1);
    assert.ok(s.hop < 0.02, `no chão em ${at} ms`);
    assert.ok(s.splash && s.splash.at < 0.05, `respingo em ${at} ms`);
  }
});

test('entrar no meio cai no ponto certo e depois da revelação fica a cápsula aberta', () => {
  const half = state('rare', duration('rare') - OPEN / 2);
  assert.equal(half.phase, 'open');
  assert.ok(half.open > 0 && half.open < 1);
  const later = state('rare', duration('rare') + 60_000);
  assert.deepEqual([later.phase, later.open, later.beam, later.gold, later.camera], ['done', 1, 0, 0, 0]);
  assert.deepEqual(state('rare', Infinity), later, 'Infinity é a pose de descanso');
  assert.equal(state('rare', -500).phase, 'crank', 'relógio adiantado não quebra');
});

test('lendário doura a cena na trava e apaga depois', () => {
  const lock = CRANK + DROP + 3 * WOBBLE;
  assert.equal(state('legendary', lock + 100).gold, 0);
  assert.equal(state('legendary', lock + LOCK - 50).gold, 1);
  assert.equal(state('legendary', duration('legendary') + 1000).gold, 1);
  assert.equal(state('legendary', duration('legendary') + AFTER).gold, 0);
  assert.equal(state('epic', duration('epic') + 1000).gold, 0);
});

test('marcas de som na linha do tempo', () => {
  assert.deepEqual(cues('rare').map((c) => c.name), ['crank', 'bounce', 'bounce', 'bounce', 'wobble', 'wobble', 'pop']);
  assert.deepEqual(cues('legendary').map((c) => c.name), ['crank', 'bounce', 'bounce', 'bounce', 'wobble', 'wobble', 'wobble', 'lock', 'pop']);
  assert.equal(cues('epic').at(-1).at, duration('epic') - OPEN);
});

test('reduzir movimento: sem quique, balançada nem câmera, com a cor final desde o começo', () => {
  for (const [, s] of sample('epic', { reduced: true })) {
    assert.deepEqual([s.tilt, s.hop, s.camera, s.gold, s.colorTo], [0, 0, 0, 0, 'epic']);
  }
  assert.equal(state('epic', 100, { reduced: true }).open, 0);
  assert.equal(state('epic', duration('epic'), { reduced: true }).open, 1);
});

test('tempo inválido (NaN, undefined, -Infinity) cai no começo e nunca gera NaN', () => {
  assert.equal(state('rare', NaN).phase, 'crank');
  assert.equal(state('rare', undefined).phase, 'crank');
  assert.equal(state('rare', -Infinity).phase, 'crank');
  const s = state('rare', undefined, { reduced: true });
  for (const [k, v] of Object.entries(s)) if (typeof v === 'number') assert.ok(Number.isFinite(v), `${k} = ${v}`);
});

test('todo campo numérico do estado é finito, em qualquer raridade e com ou sem reduzir movimento', () => {
  const check = (s, label) => {
    for (const [k, v] of Object.entries(s)) {
      if (k === 'splash') continue;
      if (typeof v === 'number') assert.ok(Number.isFinite(v), `${label}: ${k} = ${v}`);
    }
    assert.ok(s.splash === null || (Number.isFinite(s.splash.at) && Number.isFinite(s.splash.size)), `${label}: splash`);
  };
  for (const r of ORDER) {
    for (const reduced of [false, true]) {
      for (const [t, s] of sample(r, { reduced })) check(s, `${r}${reduced ? ' reduzido' : ''} em ${t} ms`);
      check(state(r, Infinity, { reduced }), `${r} Infinity`);
      check(state(r, NaN, { reduced }), `${r} NaN`);
    }
  }
});

test('o último respingo ainda aparece no começo da balançada', () => {
  const s = state('common', CRANK + DROP + 100);
  assert.equal(s.phase, 'wobble');
  assert.ok(s.splash && s.splash.at > 0 && s.splash.at < 1);
  assert.equal(state('common', CRANK + DROP + 400).splash, null);
});
