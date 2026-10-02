import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { withSolidSurfaces, createEffects } from '../public/gacha/efeitos.mjs';

test('o pré-passe ignora vidro e reflexos, mantém o asfalto e restaura a cena após falha', () => {
  const scene = new THREE.Scene();
  const glass = new THREE.Mesh(undefined, new THREE.MeshPhysicalMaterial({ transmission: 1 }));
  const rain = new THREE.LineSegments();
  const mirror = new THREE.Mesh(); mirror.isReflector = true;
  const floor = new THREE.Mesh(undefined, new THREE.MeshStandardMaterial({ transparent: true })); floor.userData.gachaDepth = true;
  const hidden = new THREE.Mesh(); hidden.visible = false;
  const solid = new THREE.Mesh();
  scene.add(glass, rain, mirror, floor, hidden, solid);
  const renderer = { shadowMap: { autoUpdate: true } };
  const original = new THREE.MeshNormalMaterial();
  scene.overrideMaterial = original;
  assert.throws(() => withSolidSurfaces(scene, renderer, () => {
    assert.equal(glass.visible, false);
    assert.equal(rain.visible, false);
    assert.equal(mirror.visible, false);
    assert.equal(hidden.visible, false);
    assert.equal(floor.visible, true);
    assert.equal(solid.visible, true);
    assert.equal(renderer.shadowMap.autoUpdate, false);
    scene.overrideMaterial = null;
    throw new Error('contexto perdido');
  }), /contexto perdido/);
  assert.equal(scene.overrideMaterial, original);
  assert.equal(renderer.shadowMap.autoUpdate, true);
  assert.equal(glass.visible, true);
  assert.equal(rain.visible, true);
  assert.equal(mirror.visible, true);
  assert.equal(hidden.visible, false);
});

test('qualidade baixa desliga os passes de profundidade e não lê seu buffer antigo', () => {
  const effects = createEffects(new THREE.Scene(), new THREE.PerspectiveCamera(), new THREE.SpotLight());
  try {
    effects.setQuality(3);
    assert.equal(effects.contact.enabled, true);
    assert.equal(effects.atmosphere.enabled, true);
    assert.equal(effects.grade.uniforms.depthEnabled.value, true);
    assert.equal(effects.atmosphere.material.defines.LAMP_SHADOW, 1);
    effects.contact.setSize(850, 552);
    assert.equal(effects.contact.normalRenderTarget.width, 425);
    assert.equal(effects.contact.normalRenderTarget.height, 276);
    effects.atmosphere.setSize(850, 552);
    assert.equal(effects.atmosphere.target.width, 425);
    assert.equal(effects.atmosphere.target.height, 276);
    effects.setQuality(2);
    assert.equal(effects.contact.enabled, true);
    assert.equal(effects.atmosphere.material.defines.LAMP_SHADOW, 0);
    effects.setQuality(1);
    assert.equal(effects.contact.enabled, false);
    assert.equal(effects.atmosphere.enabled, false);
    assert.equal(effects.grade.enabled, true);
    assert.equal(effects.grade.uniforms.depthEnabled.value, false);
    effects.setQuality(3, false);
    assert.equal(effects.grade.enabled, false);
  } finally { effects.dispose(); }
});
