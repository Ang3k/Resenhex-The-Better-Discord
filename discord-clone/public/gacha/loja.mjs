// O cenário do gacha: a frente de uma lojinha japonesa de rua, à noite, depois da chuva.
// Tudo é geometria simples e texturas desenhadas em <canvas> na hora (nenhuma imagem pronta).
// As máquinas e a cápsula ficam em maquina.mjs e capsula.mjs; as luzes principais em cena.mjs.
import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';

const FONT = '"Yu Gothic UI", "Yu Gothic", "Hiragino Sans", "Noto Sans JP", "Meiryo", sans-serif';
const NEON = 2.6; // brilho do neon (acima de 1 passa do limiar do bloom)
const RAIN = 500;
const PETALS = 36;

function canvasTexture(width, height, draw, { color = true } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext('2d'), width, height);
  const texture = new THREE.CanvasTexture(canvas);
  if (color) texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

// Madeira: tábuas verticais com veios.
function planks(base, line, boards) {
  return canvasTexture(512, 512, (g, w, h) => {
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    const bw = w / boards;
    for (let i = 0; i < boards; i++) {
      g.fillStyle = `rgba(0,0,0,${0.08 + (i % 3) * 0.05})`;
      g.fillRect(i * bw, 0, bw, h);
      g.fillStyle = line;
      g.fillRect(i * bw, 0, 3, h);
      g.strokeStyle = 'rgba(0,0,0,.18)';
      for (let k = 0; k < 6; k++) {
        const x = i * bw + 8 + ((k * 37 + i * 13) % (bw - 16));
        g.beginPath();
        g.moveTo(x, 0);
        g.bezierCurveTo(x + 6, h * 0.3, x - 6, h * 0.7, x + 3, h);
        g.stroke();
      }
    }
  });
}

// Vitrine iluminada por dentro: prateleiras com gatinhos da sorte em silhueta.
function shopWindow() {
  return canvasTexture(512, 448, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#ffd99a');
    grad.addColorStop(1, '#e88a3c');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    const tints = ['#fff4e0', '#f6c2c9', '#c9e3f6', '#ffe08a', '#d8c6f2'];
    let n = 0;
    for (const y of [h * 0.33, h * 0.66, h * 0.97]) {
      g.fillStyle = '#6b3a1e';
      g.fillRect(0, y - 8, w, 10);
      for (let x = 34; x < w - 20; x += 64) {
        g.fillStyle = tints[n++ % tints.length];
        g.beginPath(); g.arc(x, y - 34, 20, 0, Math.PI * 2); g.fill();
        g.beginPath(); g.moveTo(x - 18, y - 46); g.lineTo(x - 12, y - 64); g.lineTo(x - 4, y - 50); g.fill();
        g.beginPath(); g.moveTo(x + 18, y - 46); g.lineTo(x + 12, y - 64); g.lineTo(x + 4, y - 50); g.fill();
        g.fillRect(x - 16, y - 20, 32, 14);
      }
    }
    g.fillStyle = 'rgba(255,255,255,.12)'; // reflexo no vidro
    g.beginPath(); g.moveTo(w * 0.1, 0); g.lineTo(w * 0.35, 0); g.lineTo(w * 0.1, h); g.lineTo(-w * 0.15, h); g.fill();
  });
}

function stripes() {
  return canvasTexture(512, 128, (g, w, h) => {
    const n = 14;
    for (let i = 0; i < n; i++) {
      g.fillStyle = i % 2 ? '#efe2c8' : '#c3303d';
      g.fillRect((i * w) / n, 0, w / n + 1, h);
    }
    g.fillStyle = 'rgba(30,10,10,.25)'; // sujeira de chuva escorrendo
    for (let i = 0; i < 60; i++) g.fillRect((i * 97) % w, 0, 2, 20 + ((i * 53) % 90));
  });
}

// Sem fonte japonesa no sistema, "ガ" sai igual a um caractere que não existe: aí o neon vira "GACHA".
function hasJapanese() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 32;
  const g = canvas.getContext('2d', { willReadFrequently: true });
  const paint = (ch) => {
    g.clearRect(0, 0, 32, 32);
    g.font = '28px ' + FONT;
    g.fillText(ch, 2, 26);
    return g.getImageData(0, 0, 32, 32).data.join(',');
  };
  return paint('ガ') !== paint('￿');
}

function neonTexture() {
  const text = hasJapanese() ? 'ガチャ' : 'GACHA';
  return canvasTexture(1024, 288, (g, w, h) => {
    g.lineJoin = 'round';
    g.lineCap = 'round';
    g.strokeStyle = '#3ee8ff'; // moldura ciano
    g.shadowColor = '#3ee8ff';
    g.shadowBlur = 22;
    g.lineWidth = 10;
    g.beginPath(); g.roundRect(24, 24, w - 48, h - 48, 34); g.stroke();
    g.font = `bold 170px ${FONT}`; // letreiro rosa
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.shadowColor = '#ff3fd0';
    g.shadowBlur = 30;
    g.strokeStyle = '#ff4fd8';
    g.lineWidth = 16;
    g.strokeText(text, w * 0.45, h * 0.53);
    g.shadowBlur = 0;
    g.strokeStyle = '#ffe1f8';
    g.lineWidth = 5;
    g.strokeText(text, w * 0.45, h * 0.53);
    g.save(); // estrela
    g.translate(w * 0.86, h * 0.5);
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 24 : 58;
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    g.closePath();
    g.shadowColor = '#ff3fd0'; g.shadowBlur = 24; g.strokeStyle = '#ff4fd8'; g.lineWidth = 12; g.stroke();
    g.shadowBlur = 0; g.strokeStyle = '#ffe1f8'; g.lineWidth = 4; g.stroke();
    g.restore();
  });
}

function asphalt() {
  return canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#23202c';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2500; i++) {
      const v = 20 + Math.random() * 40;
      g.fillStyle = `rgba(${v},${v},${v + 8},.5)`;
      g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
  });
}

// Poças: onde o alphaMap é escuro o asfalto fica transparente e aparece o espelho de baixo.
// O centro da textura fica embaixo do círculo de luz (onde a cápsula para).
function puddles() {
  return canvasTexture(512, 512, (g, w, h) => {
    g.fillStyle = '#fff';
    g.fillRect(0, 0, w, h);
    const blob = (x, y, rx, ry, a) => {
      const grad = g.createRadialGradient(x, y, 0, x, y, rx);
      grad.addColorStop(0, `rgba(40,40,40,${a})`);
      grad.addColorStop(0.75, `rgba(40,40,40,${a * 0.85})`);
      grad.addColorStop(1, 'rgba(40,40,40,0)');
      g.save();
      g.translate(x, y); g.scale(1, ry / rx); g.translate(-x, -y);
      g.fillStyle = grad;
      g.beginPath(); g.arc(x, y, rx, 0, Math.PI * 2); g.fill();
      g.restore();
    };
    blob(w * 0.5, h * 0.5, w * 0.2, h * 0.07, 1);
    for (const [x, y, r] of [[0.22, 0.42, 0.09], [0.78, 0.46, 0.11], [0.35, 0.62, 0.07], [0.68, 0.6, 0.08], [0.12, 0.55, 0.06], [0.88, 0.58, 0.07]]) blob(w * x, h * y, w * r, h * r * 0.35, 0.9);
  }, { color: false });
}

function softDot() {
  return canvasTexture(32, 32, (g) => {
    const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 32, 32);
  });
}

export function createShop() {
  const group = new THREE.Group();
  const add = (mesh, { cast = false, receive = true } = {}) => { mesh.castShadow = cast; mesh.receiveShadow = receive; group.add(mesh); return mesh; };
  const std = (options) => new THREE.MeshStandardMaterial(options);
  const matrix = new THREE.Matrix4();

  // Parede, porta e verga.
  const wall = planks('#3b2519', '#1e120c', 10);
  wall.wrapS = wall.wrapT = THREE.RepeatWrapping;
  wall.repeat.set(3, 1.5);
  add(new THREE.Mesh(new THREE.BoxGeometry(7.5, 3.8, 0.3), std({ map: wall, roughness: 0.85 }))).position.set(0, 1.9, -0.65);
  add(new THREE.Mesh(new THREE.BoxGeometry(1.3, 2.25, 0.08), std({ map: planks('#4a2d1d', '#24150d', 6), roughness: 0.8 }))).position.set(0, 1.125, -0.47);
  add(new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.08, 0.1), std({ color: '#2a170e', roughness: 0.8 }))).position.set(0, 2.28, -0.46);

  // Vitrines iluminadas por dentro, com caixilhos e uma luz quente cada.
  const glow = shopWindow();
  const frame = std({ color: '#24140c', roughness: 0.7 });
  for (const x of [-1.55, 1.55]) {
    add(new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.05), new THREE.MeshBasicMaterial({ map: glow, color: new THREE.Color(1.35, 1.3, 1.2) })), { receive: false }).position.set(x, 1.85, -0.49);
    for (const [w, h, px, py] of [[1.3, 0.06, 0, 0.55], [1.3, 0.06, 0, -0.55], [0.06, 1.16, -0.62, 0], [0.06, 1.16, 0.62, 0], [0.04, 1.1, 0, 0], [1.24, 0.04, 0, 0.05]]) {
      add(new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.06), frame)).position.set(x + px, 1.85 + py, -0.46);
    }
    const light = new THREE.PointLight('#ffb066', 2.2, 4, 2);
    light.position.set(x, 1.8, -0.15);
    group.add(light);
  }

  // Toldo listrado, inclinado da parede (atrás, alto) para a frente (baixo), com a borda em gomos.
  const awning = new THREE.PlaneGeometry(4.8, 1, 32, 8);
  const pos = awning.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const t = pos.getY(i) + 0.5; // 0 = borda da frente, 1 = encostado na parede
    pos.setXYZ(i, pos.getX(i), 2.38 + t * 0.42 - Math.sin(Math.PI * t) * 0.05, 0.38 - t * 0.88);
  }
  awning.computeVertexNormals();
  add(new THREE.Mesh(awning, std({ map: stripes(), roughness: 0.75, side: THREE.DoubleSide })), { cast: true });
  const scallop = new THREE.CircleGeometry(0.12, 16, Math.PI, Math.PI);
  const red = new THREE.InstancedMesh(scallop, std({ color: '#c3303d', roughness: 0.75, side: THREE.DoubleSide }), 10);
  const cream = new THREE.InstancedMesh(scallop, std({ color: '#efe2c8', roughness: 0.75, side: THREE.DoubleSide }), 10);
  for (let i = 0; i < 20; i++) {
    matrix.makeTranslation(-2.28 + i * 0.24, 2.38, 0.38);
    (i % 2 ? cream : red).setMatrixAt(i >> 1, matrix);
  }
  group.add(red, cream);

  // Letreiro de neon acima do toldo.
  add(new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.58, 0.06), std({ color: '#150e1a', roughness: 0.6 }))).position.set(0, 3.1, -0.47);
  const neonMaterial = new THREE.MeshBasicMaterial({ map: neonTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: new THREE.Color().setScalar(NEON) });
  const neon = new THREE.Mesh(new THREE.PlaneGeometry(1.92, 0.54), neonMaterial);
  neon.position.set(0, 3.1, -0.43);
  group.add(neon);

  // Lâmpada pendurada embaixo do toldo (a luz de verdade é o SpotLight da cena).
  add(new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.14, 28, 1, true), std({ color: '#2f4a3a', roughness: 0.5, metalness: 0.4, side: THREE.DoubleSide }))).position.set(0, 2.2, 0.3);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.055, 20, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 3.8, 2.4) }));
  bulb.position.set(0, 2.14, 0.3);
  group.add(bulb);
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.2), std({ color: '#111111' }))).position.set(0, 2.32, 0.3);

  // Rua ao fundo: prédios escuros, lanternas vermelhas e uma máquina de bebidas.
  const dim = std({ color: '#120f1c', roughness: 0.9 });
  for (const [x, z, w, h] of [[-4.6, -1.2, 2, 5], [4.7, -1.6, 2, 4.5], [4.2, -4.5, 3, 6], [-4.4, -4.8, 3, 6.5]]) add(new THREE.Mesh(new THREE.BoxGeometry(w, h, 1.5), dim)).position.set(x, h / 2, z);
  const lantern = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 0.55, 0.4) });
  for (const [x, y, z] of [[3.3, 2.5, -1.0], [3.6, 2.35, -2.1], [3.9, 2.45, -3.2], [-3.4, 2.6, -2.4]]) {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), lantern);
    mesh.scale.y = 1.3;
    mesh.position.set(x, y, z);
    group.add(mesh);
  }
  add(new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.6, 0.6), std({ color: '#d9dde8', roughness: 0.4 })), { cast: true }).position.set(3.4, 0.8, -1.6);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 1.0), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.6, 1.3, 2.6) }));
  screen.position.set(3.4, 0.95, -1.29);
  group.add(screen);

  // Vaso de hortênsias do lado esquerdo.
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.17, 0.4, 24), std({ color: '#7a4a32', roughness: 0.8 })), { cast: true }).position.set(-2.7, 0.2, 0.15);
  const flowers = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.07, 1), std({ roughness: 0.7 }), 46);
  const tints = ['#8f7be8', '#6f8ff0', '#b48ff0', '#7aa0f5'].map((c) => new THREE.Color(c));
  for (let i = 0; i < 46; i++) {
    const a = i * 2.39996;
    const r = 0.24 * Math.sqrt((i + 0.5) / 46);
    matrix.makeTranslation(-2.7 + Math.cos(a) * r, 0.48 + (0.24 - r) * 0.8 + (i % 3) * 0.03, 0.15 + Math.sin(a) * r);
    flowers.setMatrixAt(i, matrix);
    flowers.setColorAt(i, tints[i % 4]);
  }
  flowers.castShadow = true;
  group.add(flowers);

  // Chão molhado: asfalto com poças e, logo abaixo, um espelho que aparece nas poças.
  const ground = asphalt();
  ground.wrapS = ground.wrapT = THREE.RepeatWrapping;
  ground.repeat.set(7, 5);
  const floorMaterial = std({ map: ground, alphaMap: puddles(), roughness: 0.42, metalness: 0.15, transparent: true });
  const floor = add(new THREE.Mesh(new THREE.PlaneGeometry(14, 10), floorMaterial));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, 1.5);
  const mirror = new Reflector(new THREE.PlaneGeometry(14, 10), { textureWidth: 512, textureHeight: 512, color: 0x8a8aa0, clipBias: 0.003 });
  mirror.rotation.x = -Math.PI / 2;
  mirror.position.set(0, -0.002, 1.5);
  group.add(mirror);

  // Chuva fina (segmentos) e pétalas caindo (pontos).
  const rainPos = new Float32Array(RAIN * 6);
  const drops = Array.from({ length: RAIN }, () => ({ x: (Math.random() - 0.5) * 7, y: Math.random() * 4, z: -0.3 + Math.random() * 4.3, v: 6 + Math.random() * 3 }));
  const rainGeometry = new THREE.BufferGeometry();
  rainGeometry.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
  const rain = new THREE.LineSegments(rainGeometry, new THREE.LineBasicMaterial({ color: '#aab8ff', transparent: true, opacity: 0.3, depthWrite: false }));
  rain.frustumCulled = false;
  group.add(rain);
  const petalPos = new Float32Array(PETALS * 3);
  const petals = Array.from({ length: PETALS }, (_, i) => ({ x: (Math.random() - 0.5) * 6, y: Math.random() * 3.2, z: Math.random() * 3, phase: i }));
  const petalGeometry = new THREE.BufferGeometry();
  petalGeometry.setAttribute('position', new THREE.BufferAttribute(petalPos, 3));
  const petalPoints = new THREE.Points(petalGeometry, new THREE.PointsMaterial({ color: '#ffb3d1', size: 0.045, map: softDot(), transparent: true, depthWrite: false }));
  petalPoints.frustumCulled = false;
  group.add(petalPoints);

  let last = 0;
  let flickerAt = 4 + Math.random() * 5;
  // sec: relógio da cena em segundos. Com reduced, sem chuva, pétalas nem neon piscando.
  function update(sec, { reduced = false } = {}) {
    const dt = Math.min(0.05, Math.max(0, sec - last));
    last = sec;
    rain.visible = petalPoints.visible = !reduced;
    if (!reduced) {
      for (let i = 0; i < RAIN; i++) {
        const d = drops[i];
        d.y -= d.v * dt;
        d.x -= 0.5 * dt;
        if (d.y < 0) { d.y = 3.6 + Math.random() * 0.6; d.x = (Math.random() - 0.5) * 7; }
        const o = i * 6;
        rainPos[o] = d.x; rainPos[o + 1] = d.y; rainPos[o + 2] = d.z;
        rainPos[o + 3] = d.x + 0.03; rainPos[o + 4] = d.y + 0.15; rainPos[o + 5] = d.z;
      }
      rainGeometry.attributes.position.needsUpdate = true;
      for (let i = 0; i < PETALS; i++) {
        const p = petals[i];
        p.y -= 0.18 * dt;
        p.x += Math.sin(sec * 0.9 + p.phase) * 0.12 * dt;
        if (p.y < 0.01) { p.y = 3.2; p.x = (Math.random() - 0.5) * 6; }
        petalPos[i * 3] = p.x; petalPos[i * 3 + 1] = p.y; petalPos[i * 3 + 2] = p.z;
      }
      petalGeometry.attributes.position.needsUpdate = true;
    }
    let flicker = 1;
    if (!reduced && sec > flickerAt) {
      const k = sec - flickerAt;
      if (k > 0.45) flickerAt = sec + 5 + Math.random() * 7;
      else flicker = Math.sin(k * 90) > 0.2 ? 1 : 0.25;
    }
    neonMaterial.color.setScalar(NEON * flicker);
  }

  // Qualidade: sem reflexo o chão fica opaco e um pouco mais liso.
  function setReflection(on) {
    mirror.visible = on;
    floorMaterial.transparent = on;
    floorMaterial.roughness = on ? 0.42 : 0.28;
    floorMaterial.needsUpdate = true;
  }
  // Tamanho em pixels de verdade do canvas: o espelho usa metade.
  function setSize(width, height) {
    mirror.getRenderTarget().setSize(Math.max(1, Math.round(width / 2)), Math.max(1, Math.round(height / 2)));
  }

  update(0);
  return { group, update, setReflection, setSize, dispose: () => mirror.dispose() };
}
