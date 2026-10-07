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

function recordingRenderer() {
  const renderer = {
    shadowMap: { autoUpdate: true }, autoClear: true,
    color: new THREE.Color(), alpha: 1, target: null, draws: [],
    getClearColor(out) { return out.copy(this.color); },
    getClearAlpha() { return this.alpha; },
    setClearColor(color) { this.color.set(color); },
    setClearAlpha(alpha) { this.alpha = alpha; },
    setRenderTarget(target) { this.target = target; },
    clear() {},
    render(object) { this.draws.push({ target: this.target, material: object.material }); },
  };
  return renderer;
}

test('contato reutiliza apenas depth/AO estáticos e continua compondo a imagem nova', () => {
  const camera = new THREE.PerspectiveCamera();
  camera.updateMatrixWorld();
  const effects = createEffects(new THREE.Scene(), camera);
  const pass = effects.contact;
  const renderer = recordingRenderer();
  const write = { texture: {} }, read = { texture: {} };
  function render(revision) {
    effects.update(10, 0, { depthRevision: revision });
    renderer.draws.length = 0;
    pass.render(renderer, write, read);
    return renderer.draws.map((draw) => draw.target);
  }
  try {
    const full = [pass.normalRenderTarget, pass.gtaoRenderTarget, pass.pdRenderTarget, write, write];
    assert.deepEqual(render(1), full);
    read.texture = { nextFrame: true };
    assert.deepEqual(render(1), [write, write]);
    assert.equal(pass.copyMaterial.uniforms.tDiffuse.value, read.texture);
    assert.deepEqual(render(2), full);
    camera.position.x = 1;
    camera.updateMatrixWorld();
    assert.deepEqual(render(2), full);
    assert.deepEqual(render(2), [write, write]);
    camera.fov = 60;
    camera.updateProjectionMatrix();
    assert.deepEqual(render(2), full);
    camera.layers.enable(1);
    assert.deepEqual(render(2), full);
    pass.setSize(850, 552);
    assert.deepEqual(render(2), full);
    assert.deepEqual(render(2), [write, write]);
    pass.setSize(850, 552);
    assert.deepEqual(render(2), [write, write]);
    pass.updateGtaoMaterial({ radius: 0.22 });
    assert.deepEqual(render(2), full);
    pass.updatePdMaterial({ samples: 8 });
    assert.deepEqual(render(2), full);
    assert.deepEqual(render(undefined), full);
    assert.deepEqual(render(undefined), full);
  } finally { effects.dispose(); }
});

test('um único pré-passe restaura linhas/pontos em falhas e invalida o contato incompleto', () => {
  const scene = new THREE.Scene();
  const line = new THREE.LineSegments(); line.userData.gachaDepth = true;
  const points = new THREE.Points();
  const hidden = new THREE.Mesh(); hidden.visible = false;
  scene.add(line, points, hidden);
  const effects = createEffects(scene, new THREE.PerspectiveCamera());
  const renderer = recordingRenderer();
  const record = renderer.render.bind(renderer);
  let fail = true, traversals = 0;
  const traverse = scene.traverse.bind(scene);
  scene.traverse = (visit) => { traversals++; traverse(visit); };
  renderer.render = (object) => {
    if (object === scene) {
      assert.equal(line.visible, false);
      assert.equal(points.visible, false);
      assert.equal(hidden.visible, false);
      if (fail) throw new Error('contexto perdido');
    }
    record(object);
  };
  try {
    effects.update(0, 0, { depthRevision: 1 });
    assert.throws(() => effects.contact.render(renderer, {}, { texture: {} }), /contexto perdido/);
    assert.equal(line.visible, true);
    assert.equal(points.visible, true);
    assert.equal(hidden.visible, false);
    assert.equal(renderer.shadowMap.autoUpdate, true);
    assert.equal(scene.overrideMaterial, null);
    fail = false;
    effects.contact.render(renderer, {}, { texture: {} });
    assert.equal(traversals, 2); // uma travessia por pré-passe, inclusive a tentativa que falhou
    effects.contact.render(renderer, {}, { texture: {} });
    assert.equal(traversals, 2);
  } finally { effects.dispose(); }
});

test('alvos fullscreen dispensam depth sem mudar o G-buffer, HDR ou amostragem', () => {
  const effects = createEffects(new THREE.Scene(), new THREE.PerspectiveCamera());
  try {
    const pass = effects.contact;
    for (const target of [pass.gtaoRenderTarget, pass.pdRenderTarget, effects.atmosphere.target]) {
      assert.equal(target.depthBuffer, false);
      assert.equal(target.texture.type, THREE.HalfFloatType);
    }
    assert.equal(pass.normalRenderTarget.depthBuffer, true);
    assert.equal(pass.normalRenderTarget.depthTexture.type, THREE.UnsignedInt248Type);
    assert.equal(pass.gtaoMaterial.defines.SAMPLES, 16);
    assert.equal(pass.pdMaterial.defines.SAMPLES, 8);
    for (const material of [effects.atmosphere.material, effects.atmosphere.composite.material, effects.grade.material]) {
      assert.equal(material.depthTest, false);
      assert.equal(material.depthWrite, false);
    }
  } finally { effects.dispose(); }
});
