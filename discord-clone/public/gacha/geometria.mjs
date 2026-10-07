// Junta peças imóveis dentro do mesmo pai, preservando materiais, UVs e sombras.
// Os grupos continuam separados: manivela, corpo e monte de cápsulas ainda podem animar.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Só congela matrizes locais: filhos continuam acompanhando qualquer pai animado.
// A raiz fica livre para o posicionamento feito pela cena depois da construção.
export function freezeStaticTransforms(group, animated = []) {
  const moving = new Set([group, ...animated]);
  group.traverse((object) => {
    if (moving.has(object)) return;
    if (object.matrixAutoUpdate) object.updateMatrix();
    object.matrixAutoUpdate = false;
  });
  return group;
}

export function mergeStaticMeshes(group) {
  const batches = new Map();
  for (const child of [...group.children]) {
    if (child.isGroup) mergeStaticMeshes(child);
    if (!child.isMesh || child.isInstancedMesh || child.isReflector || !child.visible || child.children.length) continue;
    const material = child.material;
    if (Array.isArray(material) || material.transparent || material.transmission > 0 || child.userData.gachaDepth) continue;
    const geometry = child.geometry;
    if (Object.keys(geometry.morphAttributes).length || geometry.drawRange.count !== Infinity) continue;
    if (child.matrixAutoUpdate) child.updateMatrix();
    if (child.matrix.determinant() <= 0) continue;
    const attributes = Object.entries(geometry.attributes).map(([name, a]) => `${name}:${a.itemSize}:${a.normalized}:${a.array.constructor.name}`).sort().join('|');
    const key = [material.id, child.castShadow, child.receiveShadow, child.renderOrder, child.layers.mask, !!geometry.index, attributes].join(':');
    if (!batches.has(key)) batches.set(key, []);
    batches.get(key).push(child);
  }
  for (const meshes of batches.values()) {
    if (meshes.length < 2) continue;
    const geometries = meshes.map((mesh) => mesh.geometry.clone().applyMatrix4(mesh.matrix));
    const geometry = mergeGeometries(geometries);
    for (const source of geometries) source.dispose();
    if (!geometry) continue;
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    const first = meshes[0];
    const combined = new THREE.Mesh(geometry, first.material);
    combined.castShadow = first.castShadow;
    combined.receiveShadow = first.receiveShadow;
    combined.renderOrder = first.renderOrder;
    combined.layers.mask = first.layers.mask;
    combined.matrixAutoUpdate = false;
    group.remove(...meshes);
    group.add(combined);
  }
  return group;
}

// Usado só nas máquinas decorativas: seus grupos nunca giram nem tremem.
// A máquina interativa mantém a hierarquia animada e seus materiais próprios.
export function flattenStaticGroup(group) {
  group.updateMatrixWorld(true);
  const inverse = group.matrixWorld.clone().invert();
  const meshes = [];
  group.traverse((mesh) => {
    if (mesh.isMesh) meshes.push({ mesh, matrix: new THREE.Matrix4().multiplyMatrices(inverse, mesh.matrixWorld) });
  });
  group.clear();
  for (const { mesh, matrix } of meshes) {
    mesh.matrix.copy(matrix);
    mesh.matrixAutoUpdate = false;
    group.add(mesh);
  }
  return mergeStaticMeshes(group);
}
