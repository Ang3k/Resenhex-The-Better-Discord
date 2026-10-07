import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createCapsule, RADIUS } from '../public/gacha/capsula.mjs';
import { state, CRANK } from '../public/gacha/linha-do-tempo.mjs';

const palette = Object.fromEntries(['common', 'rare', 'epic', 'legendary'].map((rarity) => [rarity, new THREE.Color('#ffffff')]));
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);

test('capsule invalidates geometry only when its visible pose changes', () => {
  const capsule = createCapsule({ from: new THREE.Vector3(0.2, 0.3152, 0.336), to: new THREE.Vector3(0, 0, 1.45) });
  assert.equal(capsule.update(null, palette), false);
  const pose = state('legendary', CRANK + 200);
  assert.equal(capsule.update(pose, palette), true);
  assert.equal(capsule.update({ ...pose }, palette), false);
  for (const field of ['travel', 'hop', 'tilt', 'open']) {
    const moved = { ...pose, [field]: pose[field] + 0.01 };
    assert.equal(capsule.update(moved, palette), true, field);
    assert.equal(capsule.update(moved, palette), false, field);
    assert.equal(capsule.update(pose, palette), true, `restore ${field}`);
  }
  const decorated = { ...pose, colorFrom: 'rare', colorTo: 'epic', colorMix: 0.5,
    glow: 1, beam: 1, dots: 3, showDots: 1, splash: { travel: 0.6, at: 0.3, size: 1 } };
  assert.equal(capsule.update(decorated, palette), false);
  assert.equal(capsule.update({ ...pose, visible: false }, palette), true);
  assert.equal(capsule.update(null, palette), false);
  assert.equal(capsule.update(pose, palette), true, 'showing an unchanged pose invalidates geometry');
  assert.equal(capsule.update(pose, palette), false);
});

test('capsule animation preserves moving parts with shared static geometry', () => {
  const from = new THREE.Vector3(0.2, 0.3152, 0.336);
  const to = new THREE.Vector3(0, 0, 1.45);
  const capsule = createCapsule({ from, to });
  const body = capsule.group.children[0];
  const tilt = body.children[0];
  const ball = tilt.children[0];
  const [bottom, top] = ball.children;
  const dots = body.children[1];
  assert.equal(bottom.children[0].matrixAutoUpdate, false);
  assert.equal(dots.matrixAutoUpdate, false);
  assert.equal(new Set(dots.children.map((dot) => dot.geometry)).size, 1);
  for (const sec of [CRANK, CRANK + 0.3, CRANK + 1, CRANK + 2, CRANK + 3, CRANK + 5, Infinity]) {
    const s = state('legendary', sec);
    capsule.update(s, palette);
    capsule.group.updateMatrixWorld(true);
    close(ball.rotation.x, s.travel * Math.max(1, Math.round(Math.hypot(from.x - to.x, from.z - to.z) / RADIUS / (Math.PI * 2))) * Math.PI * 2);
    close(tilt.rotation.z, s.tilt);
    close(top.position.x, -s.open * RADIUS * 1.7);
    close(bottom.rotation.z, -s.open * 0.3);
    assert.ok(bottom.children[0].matrixWorld.equals(new THREE.Matrix4().multiplyMatrices(bottom.matrixWorld, bottom.children[0].matrix)));
  }
});

test('a cápsula sai na altura da portinhola, com ou sem a calçada', () => {
  for (const height of [0.2352, 0.3152, 0.42]) {
    const from = new THREE.Vector3(0.2, height, 0.336);
    const capsule = createCapsule({ from, to: new THREE.Vector3(0, 0, 1.45) });
    capsule.update(state('common', CRANK), palette);
    const center = capsule.center(new THREE.Vector3());
    close(center.x, from.x); close(center.y, from.y); close(center.z, from.z);
  }
});

test('depois da abertura a cápsula repousa no destino, inclusive sobre chão elevado', () => {
  for (const height of [0, 0.1]) {
    const to = new THREE.Vector3(0, height, 1.45);
    const capsule = createCapsule({ from: new THREE.Vector3(0, 0.3152, 0.336), to });
    capsule.update(state('legendary', Infinity), palette);
    const center = capsule.center(new THREE.Vector3());
    close(center.x, to.x); close(center.y, to.y + RADIUS); close(center.z, to.z);
  }
});
