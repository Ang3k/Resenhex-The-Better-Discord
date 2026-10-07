import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { SceneAntialiasPass, GachaEffectComposer, GachaSMAAPass, renderSettings } from '../public/gacha/renderizacao.mjs';

test('a resolução respeita o orçamento de pixels e as capacidades da GPU', () => {
  const desktop = renderSettings(3, { width: 880, height: 480, nativeRatio: 1, maxSamples: 2, maxTextureSize: 2048, maxAnisotropy: 4 });
  assert.equal(desktop.ratio, 2);
  assert.equal(desktop.samples, 2);
  assert.equal(desktop.streetShadow, 2048);
  assert.equal(desktop.anisotropy, 4);
  const large = renderSettings(3, { width: 3840, height: 2160, nativeRatio: 3 });
  assert.ok(3840 * 2160 * large.ratio ** 2 <= 1800001);
  assert.equal(renderSettings(0, { nativeRatio: 3 }).ratio, 1);
  assert.equal(renderSettings(0).samples, 0);
  assert.equal(renderSettings(3, { forcedRatio: 1 }).ratio, 1);
  const wide = renderSettings(3, { width: 3840, height: 100, maxTextureSize: 2048 });
  assert.ok(wide.ratio * 3840 <= 2048);
});

test('o MSAA resolve a cena para o readBuffer correto mesmo quando o compositor troca os alvos', () => {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
  const pass = new SceneAntialiasPass(scene, camera, 4);
  const a = new THREE.WebGLRenderTarget(), b = new THREE.WebGLRenderTarget();
  const draws = [];
  let target;
  const renderer = { autoClear: true, autoClearColor: true, autoClearDepth: true, autoClearStencil: false,
    setRenderTarget(next) { target = next; }, clear() {},
    render(object) { draws.push({ target, object, input: object.material?.uniforms?.tDiffuse?.value }); },
  };
  try {
    pass.setSize(942, 549);
    assert.equal(pass.target.width, 942);
    assert.equal(pass.target.height, 549);
    assert.equal(pass.target.resolveDepthBuffer, false);
    assert.equal(pass.needsSwap, false);
    pass.render(renderer, a, b);
    pass.render(renderer, b, a);
    assert.equal(draws[0].object, scene);
    assert.equal(draws[0].target, pass.target);
    assert.equal(draws[1].target, b);
    assert.equal(draws[1].input, pass.target.texture);
    assert.equal(draws[3].target, a);
    assert.equal(draws[3].input, pass.target.texture);
    assert.equal(renderer.autoClear, true);
  } finally { pass.dispose(); a.dispose(); b.dispose(); }
});

test('a queda de qualidade libera o alvo MSAA e uma falha restaura o estado do passe', () => {
  const pass = new SceneAntialiasPass(new THREE.Scene(), new THREE.PerspectiveCamera(), 4);
  let released = 0;
  pass.target.addEventListener('dispose', () => released++);
  pass.setSamples(0);
  pass.setSamples(0);
  assert.equal(released, 1);
  assert.equal(pass.target.samples, 0);
  const renderer = { autoClear: true, setRenderTarget() {}, clear() {}, render() { throw new Error('GPU perdida'); } };
  pass.renderToScreen = true;
  assert.throws(() => pass.render(renderer, {}, {}), /GPU perdida/);
  assert.equal(pass.renderToScreen, true);
  assert.equal(renderer.autoClear, true);
  pass.dispose();
  assert.equal(released, 2);
});

test('SMAA mantém a resolução física e desliga a busca extra na qualidade leve', () => {
  const original = globalThis.Image;
  globalThis.Image = class { set src(value) { this.url = value; } };
  let pass;
  try {
    pass = new GachaSMAAPass();
    pass.setSize(942, 549);
    assert.equal(pass._edgesRT.width, 942);
    assert.equal(pass._weightsRT.height, 549);
    assert.equal(pass._materialBlend.uniforms.resolution.value.x, 1 / 942);
    pass.setQuality(3);
    assert.equal(pass.enabled, true);
    assert.equal(pass._materialWeights.defines.SMAA_MAX_SEARCH_STEPS, '16');
    pass.setQuality(1);
    assert.equal(pass._materialWeights.defines.SMAA_MAX_SEARCH_STEPS, '8');
    pass.setQuality(0);
    assert.equal(pass.enabled, false);
  } finally {
    pass?.dispose();
    if (original === undefined) delete globalThis.Image;
    else globalThis.Image = original;
  }
});

test('o compositor lê MSAA diretamente e nunca escreve efeitos no alvo de geometria', () => {
  const pass = new SceneAntialiasPass(new THREE.Scene(), new THREE.PerspectiveCamera(), 4);
  const renderer = { autoClear: true, autoClearColor: true, autoClearDepth: true, autoClearStencil: false,
    getPixelRatio() { return 1; }, getRenderTarget() { return null; },
    setRenderTarget() {}, clear() {}, render() {},
  };
  const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false });
  const composer = new GachaEffectComposer(renderer, target, pass);
  const frames = [];
  let frame;
  const sceneRender = renderer.render;
  renderer.render = function(object) { frame.push(object); sceneRender.call(this, object); };
  function effect(name, needsSwap = true) {
    return { enabled: true, needsSwap, setSize() {}, render(_renderer, write, read) {
      assert.notEqual(write, pass.target);
      assert.notEqual(write, read);
      frame.push({ name, write, read, screen: this.renderToScreen });
    } };
  }
  composer.addPass(pass);
  const contact = effect('contact');
  composer.addPass(contact);
  composer.addPass(effect('atmosphere'));
  composer.addPass(effect('bloom', false));
  composer.addPass(effect('grade'));
  const smaa = effect('smaa');
  composer.addPass(smaa);
  composer.addPass(effect('output'));
  try {
    for (let i = 0; i < 2; i++) {
      frame = [];
      composer.render(0);
      frames.push(frame);
      assert.equal(frame.length, 7); // Uma cena, seis efeitos, nenhuma cópia.
      assert.equal(frame[0], pass.scene);
      assert.equal(pass.copy, null);
      assert.equal(frame[1].read, pass.target);
      assert.equal(frame[1].write, composer.renderTarget1);
      assert.equal(frame[2].read, composer.renderTarget1);
      assert.equal(frame[2].write, composer.renderTarget2);
      assert.equal(frame[3].read, composer.renderTarget2);
      assert.equal(frame[4].read, composer.renderTarget2);
      assert.equal(frame[5].read, composer.renderTarget1);
      assert.equal(frame[6].read, composer.renderTarget2);
      assert.equal(frame[6].screen, true);
    }
    contact.enabled = false;
    smaa.enabled = false;
    composer.renderToScreen = false;
    frame = [];
    composer.render(0);
    assert.equal(frame[1].read, pass.target);
    assert.equal(frame.at(-1).screen, false);
    // Um primeiro efeito in-place requer o fallback: não pode escrever no MSAA.
    composer.passes[2].enabled = false;
    frame = [];
    composer.render(0);
    assert.equal(frame.length, 5);
    assert.notEqual(frame[2].read, pass.target);
    assert.ok(pass.copy);
    composer.passes[2].enabled = true;
    let sceneReleased = 0;
    pass.target.addEventListener('dispose', () => sceneReleased++);
    composer.reset(new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, depthBuffer: false }));
    composer.setPixelRatio(2);
    composer.setSize(20, 10);
    frame = [];
    composer.render(0);
    assert.equal(frame[1].read, pass.target);
    assert.equal(frame[1].write, composer.renderTarget1);
    assert.equal(pass.target.width, 40);
    const beforeDispose = sceneReleased;
    composer.dispose();
    assert.equal(sceneReleased, beforeDispose); // O passe é o único dono do MSAA.
  } finally { pass.dispose(); }
});

test('SMAA mantém o clear de bordas e dispensa os clears dos passes que cobrem todos os pixels', () => {
  const original = globalThis.Image;
  globalThis.Image = class { set src(value) {} };
  const pass = new GachaSMAAPass();
  const a = new THREE.WebGLRenderTarget(), b = new THREE.WebGLRenderTarget();
  const events = [];
  let target;
  const renderer = { autoClear: true, autoClearColor: true, autoClearDepth: true, autoClearStencil: false,
    setRenderTarget(next) { target = next; },
    clear() { events.push(['clear', target]); },
    render(object) {
      assert.equal(this.autoClear, false);
      events.push(['draw', target, object.material]);
    },
  };
  try {
    pass.render(renderer, a, b);
    assert.equal(events.length, 4);
    assert.equal(events[0][1], pass._edgesRT);
    assert.equal(events[2][1], pass._weightsRT);
    assert.equal(events[3][1], a);
    assert.equal(pass._uniformsBlend.tColor.value, b.texture);
    assert.equal(renderer.autoClear, true);
    renderer.render = () => { throw new Error('GPU perdida'); };
    assert.throws(() => pass.render(renderer, a, b), /GPU perdida/);
    assert.equal(renderer.autoClear, true);
  } finally {
    pass.dispose(); a.dispose(); b.dispose();
    if (original === undefined) delete globalThis.Image;
    else globalThis.Image = original;
  }
});
