// A máquina gashapon, feita de caixas arredondadas: base, corpo pintado, placa do mecanismo com o
// botão giratório, portinhola de saída e a cúpula de acrílico cheia de cápsulas. Medidas em metros,
// com a base no chão (y = 0) e a frente virada para +z.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const CAPSULE_COLORS = ['#f4f1ea', '#3ba7ff', '#b46cff', '#ff7aa8', '#7fe0b0', '#ffc53d'];
const BALLS = 48;

// Números pseudoaleatórios com semente: as cápsulas de dentro ficam iguais em todo navegador.
function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function starShape(outer, inner) {
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? inner : outer;
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    if (i) shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    else shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  shape.closePath();
  return shape;
}

export function createMachine({ color, trim = '#c9ccd6', scale = 1, seed = 1, hero = false }) {
  const group = new THREE.Group();
  const body = new THREE.Group(); // o que treme quando o botão gira
  group.add(body);
  group.scale.setScalar(scale);

  const paint = new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.08 });
  const metal = new THREE.MeshStandardMaterial({ color: '#c3c7d2', roughness: 0.3, metalness: 0.85 });
  const accent = new THREE.MeshStandardMaterial({ color: trim, roughness: 0.3, metalness: 0.85 });
  const dark = new THREE.MeshStandardMaterial({ color: '#0d0a12', roughness: 0.9 });
  const glass = new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.04, transparent: true, opacity: 0.16, clearcoat: 1, clearcoatRoughness: 0.05, depthWrite: false });
  const part = (geometry, material, x, y, z, parent = body) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };

  part(new RoundedBoxGeometry(0.66, 0.06, 0.54, 2, 0.02), accent, 0, 0.03, 0);         // base
  part(new RoundedBoxGeometry(0.62, 0.7, 0.5, 4, 0.05), paint, 0, 0.41, 0);            // corpo
  part(new RoundedBoxGeometry(0.32, 0.28, 0.03, 2, 0.012), metal, 0, 0.56, 0.255);     // placa do mecanismo
  part(new RoundedBoxGeometry(0.28, 0.22, 0.03, 2, 0.03), dark, 0, 0.21, 0.252);       // portinhola
  part(new THREE.BoxGeometry(0.3, 0.02, 0.05), metal, 0, 0.33, 0.27);                  // aba da portinhola
  part(new RoundedBoxGeometry(0.64, 0.05, 0.52, 2, 0.02), accent, 0, 0.785, 0);        // friso
  if (hero) part(new THREE.ExtrudeGeometry(starShape(0.035, 0.016), { depth: 0.008, bevelEnabled: false }), accent, 0, 0.37, 0.25);

  // Botão giratório: gira em volta do eixo z (de frente para a câmera).
  const knob = new THREE.Group();
  knob.position.set(0, 0.56, 0.272);
  body.add(knob);
  const disc = part(new THREE.CylinderGeometry(0.095, 0.095, 0.03, 40), metal, 0, 0, 0, knob);
  disc.rotation.x = Math.PI / 2;
  part(new RoundedBoxGeometry(0.17, 0.04, 0.045, 2, 0.015), accent, 0, 0, 0.03, knob);
  part(new THREE.SphereGeometry(0.018, 16, 12), metal, 0, 0, 0.055, knob);

  // Cúpula de acrílico e tampa.
  const dome = new THREE.Group();
  dome.position.y = 0.81;
  body.add(dome);
  const shell = part(new RoundedBoxGeometry(0.58, 0.5, 0.46, 4, 0.06), glass, 0, 0.25, 0, dome);
  shell.castShadow = false;
  shell.renderOrder = 2;
  part(new RoundedBoxGeometry(0.62, 0.07, 0.5, 3, 0.03), paint, 0, 0.535, 0, dome);

  // Cápsulas de dentro, em camadas, com cores sorteadas pela semente.
  const balls = new THREE.InstancedMesh(new THREE.SphereGeometry(0.052, 16, 12), new THREE.MeshStandardMaterial({ roughness: 0.32, metalness: 0.05 }), BALLS);
  const random = rng(seed);
  const matrix = new THREE.Matrix4();
  const tint = new THREE.Color();
  let count = 0;
  for (let layer = 0; layer < 3; layer++) {
    for (let gx = 0; gx < 5; gx++) {
      for (let gz = 0; gz < 4; gz++) {
        if (count >= BALLS || (layer === 2 && random() < 0.55)) continue;
        matrix.makeTranslation(-0.2 + gx * 0.1 + (layer % 2) * 0.02 + (random() - 0.5) * 0.02, 0.06 + layer * 0.088 + random() * 0.01, -0.155 + gz * 0.103 + (random() - 0.5) * 0.02);
        balls.setMatrixAt(count, matrix);
        balls.setColorAt(count, tint.set(CAPSULE_COLORS[Math.floor(random() * CAPSULE_COLORS.length)]));
        count++;
      }
    }
  }
  balls.count = count;
  const pile = new THREE.Group();
  pile.add(balls);
  dome.add(pile);

  return {
    group,
    // De onde a cápsula sai (centro dela, em coordenadas da máquina).
    exit: new THREE.Vector3(0, 0.21, 0.3),
    // turn: 0..1 de uma volta inteira.
    setCrank(turn) { knob.rotation.z = -turn * Math.PI * 2; },
    // amount: 0..1; sec: relógio da cena, para a tremida.
    setShake(amount, sec) {
      body.rotation.z = Math.sin(sec * 45) * 0.012 * amount;
      pile.position.y = Math.abs(Math.sin(sec * 38)) * 0.012 * amount;
      pile.rotation.y = Math.sin(sec * 30) * 0.05 * amount;
    },
  };
}
