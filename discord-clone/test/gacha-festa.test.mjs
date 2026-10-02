import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { activeBursts, createFesta } from '../public/gacha/festa.mjs';
import { duration, CRANK, DROP, WOBBLE, LOCK, OPEN, AFTER } from '../public/gacha/linha-do-tempo.mjs';

// As faíscas da última balançada ainda caem quando a cápsula abre; aqui interessa o resto.
const kinds = (rarity, t) => activeBursts(rarity, t).map((fx) => fx.kind).filter((k) => k !== 'sparks').sort();
const openAt = (rarity) => duration(rarity) - OPEN;

test('faíscas em cada balançada, na cor do degrau', () => {
  const ws = CRANK + DROP;
  assert.deepEqual(activeBursts('epic', ws + WOBBLE * 0.4), [], 'antes do primeiro pico não há nada');
  assert.deepEqual(activeBursts('epic', ws + WOBBLE * 0.6).map((fx) => fx.color), ['common']);
  // As faíscas duram mais que uma balançada: a mais nova é a do degrau atual.
  assert.equal(activeBursts('epic', ws + WOBBLE * 2.6).at(-1).color, 'epic');
  assert.ok(activeBursts('legendary', ws + WOBBLE * 2.6).every((fx) => fx.color !== 'legendary'), 'o lendário não se entrega antes da trava');
});

test('cada raridade explode do seu jeito na abertura', () => {
  for (const rarity of ['common', 'rare']) assert.deepEqual(kinds(rarity, openAt(rarity) + 100), ['burst', 'wave']);
  assert.deepEqual(kinds('epic', openAt('epic') + 100), ['burst', 'spiral', 'wave']);
  assert.deepEqual(kinds('legendary', openAt('legendary') + 100), ['burst', 'confetti', 'spiral', 'wave']);
  assert.deepEqual(kinds('legendary', openAt('legendary') + 3000), ['confetti'], 'o confete continua caindo depois do resto');
  assert.ok(kinds('legendary', CRANK + DROP + 3 * WOBBLE + LOCK / 2).includes('swirl'), 'faíscas girando na trava');
  assert.ok(!kinds('epic', CRANK + DROP + 3 * WOBBLE + 100).includes('swirl'));
});

test('nada acontece fora de um roll', () => {
  for (const t of [Infinity, NaN, -1, undefined]) assert.deepEqual(activeBursts('legendary', t), []);
  assert.deepEqual(kinds('legendary', openAt('legendary') + 7000), []);
});

// Canvas mínimo: o coração é desenhado num <canvas> na hora.
function withDocument(fn) {
  const context = new Proxy({}, { get: () => () => {}, set: () => true });
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => context }) };
  try { return fn(); } finally { delete globalThis.document; }
}

test('a festa inteira de um lendário, mais um casamento, sem números quebrados', () => withDocument(() => {
  const palette = Object.fromEntries(['common', 'rare', 'epic', 'legendary'].map((r, i) => [r, new THREE.Color().setHSL(i / 4, 0.8, 0.6)]));
  const festa = createFesta({ spot: new THREE.Vector3(0, 0, 1.45), radius: 0.13 });
  const end = duration('legendary') + AFTER + 4000;
  let busyFrames = 0;
  let lockTint = null;
  for (let t = 0; t <= end; t += 16) {
    const fx = festa.update({ rarity: 'legendary', t, sec: t / 1000, palette });
    if (fx.busy) busyFrames++;
    if (t > CRANK + DROP + 3 * WOBBLE + LOCK * 0.8 && t < openAt('legendary')) lockTint ||= fx.tint;
    for (const mesh of festa.group.children) {
      const position = mesh.geometry.attributes.position;
      const count = mesh.isPoints ? mesh.geometry.drawRange.count : 0;
      for (let i = 0; i < count * 3; i++) assert.ok(Number.isFinite(position.array[i]), `posição quebrada em ${t} ms`);
    }
  }
  assert.ok(busyFrames > 100);
  assert.equal(lockTint, palette.legendary, 'o neon fica dourado na trava');
  assert.equal(festa.update({ rarity: 'legendary', t: Infinity, sec: 100, palette }).busy, false, 'em repouso a cena volta a 30 fps');
  festa.celebrate('steal', 200);
  const steal = festa.update({ rarity: 'legendary', t: Infinity, sec: 200.4, palette });
  assert.equal(steal.busy, true);
  assert.ok(steal.tintAmount > 0);
  assert.ok(festa.group.children.find((m) => m.isPoints && m.geometry.drawRange.count > 0 && m.material.uniforms.map), 'corações no ar');
  assert.equal(festa.update({ rarity: 'legendary', t: Infinity, sec: 203, palette }).busy, false, 'a comemoração acaba sozinha');
  assert.equal(festa.update({ rarity: 'legendary', t: openAt('legendary') + 100, sec: 1, palette, reduced: true }).busy, false, 'reduzir movimento: sem partículas');
  festa.dispose();
}));
