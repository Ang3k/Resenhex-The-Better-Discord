// Fachadas da rua: volumes em planos diferentes, janelas recuadas e detalhes de escala.
// As peças repetidas usam instâncias e compartilham o mapa de sombras da loja.
import * as THREE from 'three';
import { freezeStaticTransforms } from './geometria.mjs';

export function createStreet({ plaster }) {
  const group = new THREE.Group();
  const batches = new Map();
  let district = 'near';
  const materials = {
    plaster: new THREE.MeshStandardMaterial({ map: plaster, bumpMap: plaster, bumpScale: 0.016, roughness: 0.94 }),
    stone: new THREE.MeshStandardMaterial({ color: '#6c747b', roughness: 0.86 }),
    trim: new THREE.MeshStandardMaterial({ color: '#606c78', metalness: 0.3, roughness: 0.6 }),
    iron: new THREE.MeshStandardMaterial({ color: '#26323e', metalness: 0.5, roughness: 0.64 }),
    recess: new THREE.MeshStandardMaterial({ color: '#0c1621', roughness: 0.9 }),
    glass: new THREE.MeshBasicMaterial({ color: '#ffffff' }),
    roof: new THREE.MeshStandardMaterial({ color: '#324451', metalness: 0.35, roughness: 0.75 }),
    shutter: new THREE.MeshStandardMaterial({ color: '#43515f', metalness: 0.35, roughness: 0.78 }),
  };
  const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
  const cylinderGeometry = new THREE.CylinderGeometry(1, 1, 1, 8);
  const part = new THREE.Object3D();
  function piece(material, dimensions, position, { color = '#ffffff', rotation = 0, cylinder = false } = {}) {
    const key = district + ':' + material + (cylinder ? ':pipe' : ':box');
    if (!batches.has(key)) batches.set(key, { material: materials[material], cylinder, district, pieces: [] });
    part.position.set(...position); part.scale.set(...dimensions); part.rotation.set(0, 0, rotation); part.updateMatrix();
    batches.get(key).pieces.push({ matrix: part.matrix.clone(), color: new THREE.Color(color) });
  }
  const box = (material, w, h, d, x, y, z, options) => piece(material, [w, h, d], [x, y, z], options);
  const pipe = (r, length, x, y, z) => piece('iron', [r, length, r], [x, y, z], { cylinder: true });

  function window(x, y, z, w, h, index, balcony = false) {
    // O vão escuro é maior que o vidro: a moldura deixa uma sombra nas laterais.
    box('recess', w + 0.09, h + 0.1, 0.075, x, y, z + 0.015);
    const lit = index % 5 !== 2 && index % 5 !== 4;
    const tint = !lit ? '#152335' : index % 3 === 0 ? '#987045' : index % 3 === 1 ? '#465c71' : '#536b71';
    box('glass', w - 0.07, h - 0.06, 0.008, x, y, z + 0.055, { color: tint });
    for (const sx of [-1, 1]) {
      box('trim', 0.035, h + 0.07, 0.09, x + sx * w / 2, y, z + 0.065);
      // Cortinas têm larguras diferentes; a janela não vira um quadrado luminoso inteiro.
      box('glass', w * (index % 2 ? 0.12 : 0.2), h - 0.08, 0.009,
        x + sx * w * 0.32, y, z + 0.061, { color: lit ? '#4b5357' : '#142230' });
    }
    box('trim', w + 0.07, 0.035, 0.09, x, y + h / 2, z + 0.065);
    box('stone', w + 0.16, 0.06, 0.18, x, y - h / 2 - 0.015, z + 0.1);
    box('trim', 0.025, h, 0.075, x, y, z + 0.075);
    box('trim', w, 0.025, 0.075, x, y + h * 0.08, z + 0.075);
    if (!balcony) return;
    box('stone', w + 0.28, 0.085, 0.42, x, y - h / 2 - 0.06, z + 0.23);
    box('iron', w + 0.28, 0.025, 0.025, x, y - h / 2 + 0.31, z + 0.43);
    box('iron', w + 0.28, 0.025, 0.025, x, y - h / 2 + 0.02, z + 0.43);
    for (let n = 0; n <= 6; n++) box('iron', 0.015, 0.31, 0.018, x - (w + 0.24) / 2 + n * (w + 0.24) / 6, y - h / 2 + 0.165, z + 0.43);
    for (const sx of [-1, 1]) box('iron', 0.02, 0.025, 0.37, x + sx * (w + 0.26) / 2, y - h / 2 + 0.31, z + 0.25);
  }

  function airConditioner(x, y, z) {
    box('stone', 0.42, 0.25, 0.21, x, y, z + 0.13);
    box('recess', 0.24, 0.17, 0.015, x - 0.05, y, z + 0.244);
    for (let row = 0; row < 6; row++) box('trim', 0.25, 0.009, 0.018, x - 0.05, y - 0.065 + row * 0.026, z + 0.254);
    for (const sx of [-1, 1]) box('iron', 0.022, 0.065, 0.19, x + sx * 0.15, y - 0.16, z + 0.12);
    pipe(0.009, 0.46, x + 0.27, y - 0.11, z + 0.05);
  }

  const buildings = [
    { x: -3.92, z: -1.6, w: 2.12, h: 3.85, d: 1.4, color: '#70716d', rows: 3, seed: 1 },
    { x: 4.0, z: -2.1, w: 2.12, h: 4.6, d: 1.65, color: '#607080', rows: 4, seed: 7 },
    { x: -5.4, z: -4.9, w: 2.8, h: 5.9, d: 2.0, color: '#555b68', rows: 5, seed: 13 },
    { x: 5.55, z: -5.4, w: 2.65, h: 6.5, d: 2.0, color: '#53616a', rows: 6, seed: 19 },
  ];
  // A rua continua além do palco, inclusive no enquadramento panorâmico.
  // As fachadas distantes entram nos mesmos lotes, sem uma chamada por janela.
  for (const side of [-1, 1]) {
    for (let n = 0; n < 6; n++) {
      buildings.push({ x: side * (7.15 + n * 3.5), z: -2.8 - (n % 3) * 0.65,
        w: 3.6, h: 5.1 + ((n + (side > 0 ? 1 : 0)) % 3) * 0.65, d: 2.2,
        color: side < 0 ? '#616467' : '#596775', rows: 4, seed: 25 + n * 7 + (side > 0 ? 3 : 0), district: `${side}:${Math.floor(n / 2)}` });
    }
  }
  for (const b of buildings) {
    district = b.district || 'near';
    const front = b.z + b.d / 2;
    box('plaster', b.w, b.h, b.d, b.x, b.h / 2, b.z, { color: b.color });
    box('stone', b.w + 0.12, 0.16, b.d + 0.12, b.x, 0.17, b.z);
    box('stone', b.w + 0.16, 0.1, b.d + 0.12, b.x, b.h - 0.12, b.z);
    // Platibanda e telhado inclinado recortam a silhueta em vez de terminar numa caixa lisa.
    box('roof', b.w + 0.24, 0.09, b.d + 0.25, b.x, b.h + 0.035, b.z);
    box('stone', b.w + 0.14, 0.16, 0.12, b.x, b.h + 0.12, front + 0.03);
    for (const sx of [-1, 1]) box('stone', 0.12, 0.16, b.d, b.x + sx * (b.w / 2 + 0.01), b.h + 0.12, b.z);
    box('roof', b.w * 0.55, 0.06, b.d * 0.72, b.x - b.w * 0.14, b.h + 0.26, b.z - 0.13, { rotation: -0.09 });
    box('shutter', b.w * 0.36, 0.88, 0.05, b.x - b.w * 0.21, 0.62, front + 0.03);
    for (let slat = 0; slat < 13; slat++) box('iron', b.w * 0.36, 0.012, 0.06, b.x - b.w * 0.21, 0.2 + slat * 0.063, front + 0.055);
    box('recess', b.w * 0.24, 0.93, 0.06, b.x + b.w * 0.27, 0.62, front + 0.04);
    box('trim', b.w * 0.24 + 0.06, 0.045, 0.1, b.x + b.w * 0.27, 1.1, front + 0.065);
    const step = (b.h - 1.1) / b.rows;
    for (let row = 0; row < b.rows; row++) {
      const y = 1.45 + row * step;
      box('stone', b.w + 0.07, 0.055, 0.1, b.x, y - 0.43, front + 0.055);
      for (let col = 0; col < 2; col++) {
        const x = b.x + (col ? 1 : -1) * b.w * 0.24;
        window(x, y, front, b.w * 0.29, Math.min(0.58, step * 0.72), b.seed + row * 2 + col, (row + col + b.seed) % 3 === 0);
      }
    }
    pipe(0.027, b.h - 0.25, b.x - b.w / 2 + 0.075, b.h / 2, front + 0.095);
    for (let band = 0; band < b.h - 0.5; band += 0.65) box('trim', 0.075, 0.025, 0.045, b.x - b.w / 2 + 0.075, band + 0.4, front + 0.115);
    airConditioner(b.x + b.w * 0.18, 1.9, front + 0.01);
    if (b.seed < 10) airConditioner(b.x - b.w * 0.22, b.h - 0.65, front + 0.01);
  }

  // Calçada, meio-fio e sarjeta ligam as construções ao chão, sem terminar nas máquinas.
  district = 'pavement';
  for (const side of [-1, 1]) {
    box('stone', 26, 0.1, 1.65, side * 16.05, 0.025, -1.0, { color: '#91909f' });
    box('stone', 26, 0.13, 0.12, side * 16.05, 0.015, -0.12, { color: '#858694' });
    for (let n = 0; n < 38; n++) {
      box('recess', 0.012, 0.005, 1.65, side * (3.45 + n * 0.68), 0.078, -1.0);
    }
    for (let n = 0; n < 3; n++) {
      const x = side * (4.15 + n * 3.4);
      box('iron', 0.48, 0.018, 0.16, x, 0.012, 0.03);
      for (let slat = 0; slat < 7; slat++) box('recess', 0.027, 0.004, 0.13, x - 0.18 + slat * 0.06, 0.023, 0.03);
    }
  }

  // Cabos altos e suportes ligam as fachadas; não cruzam o letreiro da loja.
  district = 'near';
  const wireMaterial = materials.iron;
  for (const side of [-1, 1]) {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(side * 2.92, 3.55, -0.65),
      new THREE.Vector3(side * 3.65, 3.42, -0.9),
      new THREE.Vector3(side * 5.7, 3.85, -2.1),
    ]);
    group.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.009, 4, false), wireMaterial));
    pipe(0.024, 3.7, side * 3.13, 1.85, -1.05);
    box('trim', 0.13, 0.07, 0.16, side * 3.13, 3.55, -0.98);
  }
  for (const batch of batches.values()) {
    const mesh = new THREE.InstancedMesh(batch.cylinder ? cylinderGeometry : boxGeometry, batch.material, batch.pieces.length);
    batch.pieces.forEach((p, i) => { mesh.setMatrixAt(i, p.matrix); mesh.setColorAt(i, p.color); });
    // Os trechos externos não atingem os mapas de sombra da loja. Seus limites
    // separados permitem descartar fachadas inteiras fora da câmera e do reflexo.
    mesh.castShadow = batch.district === 'near' && batch.material !== materials.glass;
    mesh.receiveShadow = true;
    mesh.userData.district = batch.district;
    mesh.computeBoundingSphere();
    mesh.matrixAutoUpdate = false;
    group.add(mesh);
  }
  return freezeStaticTransforms(group);
}
