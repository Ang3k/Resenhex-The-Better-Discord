import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createCapsule, RADIUS } from '../public/gacha/capsula.mjs';
import { state, CRANK } from '../public/gacha/linha-do-tempo.mjs';

const palette = Object.fromEntries(['common', 'rare', 'epic', 'legendary'].map((rarity) => [rarity, new THREE.Color('#ffffff')]));
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);

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
