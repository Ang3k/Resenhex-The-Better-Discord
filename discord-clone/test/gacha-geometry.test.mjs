import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { mergeStaticMeshes, flattenStaticGroup, freezeStaticTransforms } from '../public/gacha/geometria.mjs';
import { createStreet } from '../public/gacha/rua.mjs';
import { createMachine } from '../public/gacha/maquina.mjs';

test('machine setters report exact pose changes and ignore inactive shake time', (t) => {
  const context = { fillRect() {}, scale() {}, fillText() {}, putImageData() {},
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }) };
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  t.after(() => {
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument);
    else delete globalThis.document;
  });
  globalThis.document = { createElement: () => ({ getContext: () => context }) };
  const machine = createMachine();
  assert.equal(machine.setCrank(0), false);
  assert.equal(machine.setShake(0, 1), false);
  assert.equal(machine.setShake(0, 20), false);
  assert.equal(machine.setCrank(0.3), true);
  assert.equal(machine.setCrank(0.3), false);
  assert.equal(machine.setShake(0.7, 1), true);
  assert.equal(machine.setShake(0.7, 1), false);
  assert.equal(machine.setShake(0, 2), true);
  assert.equal(machine.setShake(0, 3), false);
});

test('static local matrices preserve transforms under an animated parent', () => {
  const root = new THREE.Group();
  const moving = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
  mesh.position.set(1, 2, 3);
  mesh.rotation.set(0.3, 0.4, 0.5);
  mesh.scale.set(1.2, 0.9, 1.4);
  root.add(moving);
  moving.add(mesh);
  root.updateMatrixWorld(true);
  const local = mesh.matrix.clone();
  freezeStaticTransforms(root, [moving]);
  assert.equal(root.matrixAutoUpdate, true);
  assert.equal(moving.matrixAutoUpdate, true);
  assert.equal(mesh.matrixAutoUpdate, false);
  moving.rotation.y = 0.8;
  root.position.set(5, -2, 7);
  root.updateMatrixWorld(true);
  assert.ok(mesh.matrix.equals(local));
  assert.ok(mesh.matrixWorld.equals(new THREE.Matrix4().multiplyMatrices(moving.matrixWorld, local)));
});

test('agrupar peças preserva vértices, normais, UVs, triângulos e material sob um pai animado', () => {
  const parent = new THREE.Group();
  parent.position.set(2, 3, -4);
  const material = new THREE.MeshStandardMaterial();
  const sources = [new THREE.Mesh(new THREE.BoxGeometry(1, 2, 3), material), new THREE.Mesh(new THREE.BoxGeometry(2, 1, 1), material)];
  sources[0].position.set(-2, 1, 0);
  sources[1].position.set(2, 0, 1);
  sources[1].rotation.set(0.1, 0.4, 0.2);
  sources[1].scale.set(1.1, 0.8, 1.2);
  const expected = sources.map((mesh) => {
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
    mesh.updateMatrix();
    return mesh.geometry.clone().applyMatrix4(mesh.matrix);
  });
  mergeStaticMeshes(parent);
  assert.equal(parent.children.length, 1);
  const combined = parent.children[0];
  assert.equal(combined.material, material);
  assert.equal(combined.castShadow, true);
  assert.equal(combined.receiveShadow, true);
  for (const attribute of ['position', 'normal', 'uv']) {
    const flattened = expected.flatMap((geometry) => [...geometry.attributes[attribute].array]);
    assert.deepEqual([...combined.geometry.attributes[attribute].array], flattened);
  }
  assert.equal(combined.geometry.index.count, expected.reduce((n, geometry) => n + geometry.index.count, 0));
  parent.rotation.z = 0.7;
  parent.updateMatrixWorld(true);
  assert.ok(combined.matrixWorld.equals(parent.matrixWorld), 'a transformação do pai continua animando todas as peças');
  for (const geometry of expected) geometry.dispose();
});

test('vidros, instâncias, superfícies de profundidade e pais diferentes continuam separados', () => {
  const root = new THREE.Group();
  const material = new THREE.MeshStandardMaterial();
  const transparent = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshPhysicalMaterial({ transmission: 0.9 }));
  const instances = new THREE.InstancedMesh(new THREE.BoxGeometry(), material, 2);
  const depth = new THREE.Mesh(new THREE.PlaneGeometry(), material);
  depth.userData.gachaDepth = true;
  const otherShadow = new THREE.Mesh(new THREE.BoxGeometry(), material);
  otherShadow.castShadow = true;
  root.add(transparent, instances, depth, otherShadow);
  const movable = new THREE.Group();
  movable.add(new THREE.Mesh(new THREE.BoxGeometry(), material), new THREE.Mesh(new THREE.BoxGeometry(), material));
  root.add(movable);
  mergeStaticMeshes(root);
  assert.deepEqual(root.children, [transparent, instances, depth, otherShadow, movable]);
  assert.equal(movable.children.length, 1);
  assert.equal(movable.parent, root);
});

test('máquinas decorativas mantêm posição, escala e vidro ao simplificar a hierarquia', () => {
  const root = new THREE.Group();
  const machine = new THREE.Group();
  machine.position.set(-1.95, 0.08, 0);
  machine.rotation.y = 0.025;
  machine.scale.setScalar(1.12);
  const solid = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
  solid.position.set(0, 0.5, 0.2);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshPhysicalMaterial({ transparent: true, opacity: 0.13 }));
  glass.position.set(0, 1, 0);
  machine.add(solid, glass);
  root.add(machine);
  root.updateMatrixWorld(true);
  const expectedSolid = solid.matrixWorld.clone();
  const expectedGlass = glass.matrixWorld.clone();
  flattenStaticGroup(root);
  root.updateMatrixWorld(true);
  assert.equal(solid.parent, root);
  assert.equal(glass.parent, root);
  assert.ok(solid.matrixWorld.equals(expectedSolid));
  assert.ok(glass.matrixWorld.equals(expectedGlass));
});

test('a rua cobre os dois lados do panorama com calçada e fachadas em lotes', () => {
  const street = createStreet({ plaster: new THREE.Texture() });
  const batches = street.children.filter((mesh) => mesh.isInstancedMesh);
  assert.equal(batches.filter((mesh) => mesh.userData.district === 'near').length, 9, 'a rua próxima mantém seus lotes');
  const walls = batches.filter((mesh) => mesh.material.map);
  const point = new THREE.Vector3();
  const matrix = new THREE.Matrix4();
  let left = Infinity, right = -Infinity;
  for (const wall of walls) {
    for (let i = 0; i < wall.count; i++) {
      wall.getMatrixAt(i, matrix);
      point.setFromMatrixPosition(matrix);
      left = Math.min(left, point.x);
      right = Math.max(right, point.x);
    }
    if (wall.userData.district !== 'near') {
      assert.equal(wall.castShadow, false);
      assert.ok(wall.boundingSphere.radius < 8, 'cada trecho tem um limite próprio para descarte');
    }
  }
  assert.ok(left < -20 && right > 20, 'nenhuma lateral termina junto da loja');
  const bounds = new THREE.Box3().setFromObject(street);
  assert.ok(bounds.min.x < -29 && bounds.max.x > 29);
});
