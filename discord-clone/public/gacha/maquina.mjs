// A máquina gashapon, feita de caixas arredondadas: base, corpo pintado, placa do mecanismo com o
// botão giratório, portinhola de saída e a cúpula de acrílico cheia de cápsulas. Medidas em metros,
// com a base no chão (y = 0) e a frente virada para +z.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const CAPSULE_COLORS = ['#f4f1ea', '#3ba7ff', '#b46cff', '#ff7aa8', '#7fe0b0', '#ffc53d'];
const BALL_R = 0.052;
// Monte de cápsulas: passos da grade, dentro da cúpula (por dentro: 0,58 × 0,5 × 0,46).
const PITCH_X = 0.108;   // entre cápsulas da mesma fileira
const PITCH_Z = 0.095;   // entre fileiras
const PITCH_Y = 0.085;   // entre camadas
const WALL_GAP = 0.006;  // folga entre a cápsula e o acrílico
const LIMIT_X = 0.29 - BALL_R - WALL_GAP;
const LIMIT_Z = 0.23 - BALL_R - WALL_GAP;
const FLOOR_Y = BALL_R + WALL_GAP; // centro mais baixo possível
// Limite de cápsulas do monte (camadas de 18, 13, 18 e 13 posições): nunca corta nada à força.
const BALLS = 62;

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

export function createMachine({ color = '#c9b6f2', trim = '#c9ccd6', scale = 1, seed = 1, hero = false } = {}) {
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

  part(new RoundedBoxGeometry(0.66, 0.06, 0.54, 2, 0.02), accent, 0, 0.03, 0, group);  // base (firme: não treme com o corpo)
  part(new RoundedBoxGeometry(0.62, 0.73, 0.5, 4, 0.05), paint, 0, 0.395, 0);          // corpo (afundado na base: sem fresta ao tremer)
  part(new RoundedBoxGeometry(0.32, 0.28, 0.03, 2, 0.012), metal, 0, 0.56, 0.255);     // placa do mecanismo
  part(new RoundedBoxGeometry(0.28, 0.22, 0.03, 2, 0.03), dark, 0, 0.21, 0.252);       // portinhola
  part(new THREE.BoxGeometry(0.3, 0.02, 0.05), metal, 0, 0.33, 0.27);                  // aba da portinhola
  part(new RoundedBoxGeometry(0.64, 0.05, 0.52, 2, 0.02), accent, 0, 0.785, 0);        // friso
  if (hero) part(new THREE.ExtrudeGeometry(starShape(0.032, 0.015), { depth: 0.008, bevelEnabled: false }), accent, 0, 0.38, 0.2505);

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
  shell.receiveShadow = false;
  shell.renderOrder = 2;
  part(new RoundedBoxGeometry(0.62, 0.07, 0.5, 3, 0.03), paint, 0, 0.535, 0, dome);

  // Cápsulas de dentro, num monte: fileiras alternadas com 5 e 4 cápsulas (como um favo de mel) e
  // camadas alternadas encaixadas nos vãos, com cores sorteadas pela semente. O tremido sorteado
  // deixa o monte irregular; depois algumas passadas afastam as que ficaram entrando uma na outra.
  const balls = new THREE.InstancedMesh(new THREE.SphereGeometry(BALL_R, 16, 12), new THREE.MeshStandardMaterial({ roughness: 0.32, metalness: 0.05 }), BALLS);
  const random = rng(seed);
  const pts = [];
  for (let layer = 0; layer < 4; layer++) {
    const rows = layer % 2 ? 3 : 4; // camadas ímpares encaixam nos vãos da de baixo (meio passo em x, um terço em z)
    for (let gz = 0; gz < rows; gz++) {
      const cols = (gz + layer) % 2 === 0 ? 5 : 4; // fileira de 5 (senão, de 4 deslocada meio passo)
      for (let gx = 0; gx < cols; gx++) {
        const skip = layer === 3 ? 0.45 : layer === 2 ? 0.2 : 0;
        const jx = (random() * 2 - 1) * 0.015;
        const jz = (random() * 2 - 1) * 0.015;
        const jy = (random() * 2 - 1) * 0.008;
        const hue = Math.floor(random() * CAPSULE_COLORS.length);
        if (random() < skip) continue;
        pts.push({ x: (gx - (cols - 1) / 2) * PITCH_X + jx, y: FLOOR_Y + 0.009 + layer * PITCH_Y + jy, z: (gz - 1.5) * PITCH_Z + (layer % 2) * PITCH_Z / 3 + jz, hue });
      }
    }
  }
  const touch = BALL_R * 2 - 0.001; // tolerância de 1 mm: a passada para quando ninguém entra mais que isso
  for (let pass = 0; pass < 12; pass++) {
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const a = pts[i], b = pts[j];
        const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
        const d = Math.hypot(dx, dy, dz);
        if (d >= touch) continue;
        const push = (touch - d) / 2 / d;
        a.x -= dx * push; a.y -= dy * push; a.z -= dz * push;
        b.x += dx * push; b.y += dy * push; b.z += dz * push;
      }
    }
    for (const p of pts) { // sempre dentro da cúpula
      p.x = Math.max(-LIMIT_X, Math.min(LIMIT_X, p.x));
      p.z = Math.max(-LIMIT_Z, Math.min(LIMIT_Z, p.z));
      p.y = Math.max(FLOOR_Y, p.y);
    }
  }
  const matrix = new THREE.Matrix4();
  const tint = new THREE.Color();
  pts.forEach((p, i) => {
    matrix.makeTranslation(p.x, p.y, p.z);
    balls.setMatrixAt(i, matrix);
    balls.setColorAt(i, tint.set(CAPSULE_COLORS[p.hue]));
  });
  balls.count = pts.length;
  const pile = new THREE.Group();
  pile.add(balls);
  dome.add(pile);

  return {
    group,
    // De onde a cápsula sai (centro dela, em coordenadas da máquina sem escala; ignora a tremida: a cena converte com localToWorld).
    exit: new THREE.Vector3(0, 0.21, 0.3),
    // turn: 0..1 de uma volta inteira.
    setCrank(turn) { knob.rotation.z = -turn * Math.PI * 2; },
    // amount: 0..1; sec: relógio da cena, para a tremida.
    setShake(amount, sec) {
      body.rotation.z = Math.sin(sec * 45) * 0.012 * amount;
      pile.position.y = Math.abs(Math.sin(sec * 38)) * 0.012 * amount;
      pile.rotation.y = Math.sin(sec * 30) * 0.045 * amount;
    },
  };
}
