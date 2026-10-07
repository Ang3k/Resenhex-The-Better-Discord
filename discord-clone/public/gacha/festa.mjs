// Festa da cena: faíscas a cada balançada, explosão na abertura (cada raridade com a sua), onda de luz
// no chão, confete dourado no lendário, corações quando alguém casa e ondinhas da chuva nas poças.
// As explosões do roll são função do tempo desde o roll (quem entra no meio vê o mesmo ponto); a
// comemoração de casamento usa o relógio da cena, porque não está na linha do tempo.
import * as THREE from 'three';
import { CRANK, DROP, WOBBLE, LOCK, OPEN, duration, wobbles, norm } from './linha-do-tempo.mjs';

const LADDER = ['common', 'rare', 'epic'];
const SPARKS = 900;     // pontos de luz disponíveis num quadro (faíscas, explosão, espiral, corações não entram)
const CONFETTI = 190;
const HEARTS = 34;
const RIPPLES = 16;
const GRAVITY = 3.2;
// Cada raridade explode de um jeito: quantas faíscas, com que força e em que formato.
const BURSTS = {
  common: { count: 46, speed: 1.5, flat: 1, life: 1.1, glow: 2.6 },
  rare: { count: 90, speed: 2.3, flat: 0.28, life: 1.3, glow: 3 },
  epic: { count: 130, speed: 2.6, flat: 0.7, life: 1.6, glow: 3.4, spiral: 70 },
  legendary: { count: 200, speed: 3.3, flat: 0.85, life: 2, glow: 4.2, spiral: 90, confetti: true },
};
const WAVE = { common: 1.4, rare: 2, epic: 2.4, legendary: 3.2 }; // raio final da onda no chão (m)
const CONFETTI_COLORS = ['#ffc53d', '#ffe9a6', '#ff7aa8', '#7fe0ff', '#ffffff', '#b46cff'];
const CELEBRATIONS = { claim: { color: '#ff5fa2', neon: '#ff4fd8' }, steal: { color: '#b46cff', neon: '#9b5cff' } };
const CELEBRATION = 2.6; // s

// Números com semente: a mesma explosão em todo navegador.
function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function directions(count, seed) {
  const random = rng(seed);
  return Array.from({ length: count }, () => {
    const u = random() * 2 - 1;
    const a = random() * Math.PI * 2;
    const r = Math.sqrt(1 - u * u);
    return { x: r * Math.cos(a), y: Math.abs(u) * 0.8 + 0.2, z: r * Math.sin(a), speed: 0.55 + random() * 0.45, white: random(), size: 0.6 + random() * 0.6, delay: random() };
  });
}

// O que está acontecendo `t` ms depois do roll: idade (s) de cada efeito ativo. Puro, para testar.
export function activeBursts(rarity, t) {
  const r = norm(rarity);
  const out = [];
  if (!(t >= 0) || t === Infinity) return out;
  const wobbleStart = CRANK + DROP;
  for (let i = 0; i < wobbles(r); i++) {
    const age = (t - (wobbleStart + (i + 0.5) * WOBBLE)) / 1000;
    if (age >= 0 && age < 0.6) out.push({ kind: 'sparks', step: i, color: LADDER[i], age });
  }
  const lockStart = wobbleStart + wobbles(r) * WOBBLE;
  if (r === 'legendary' && t >= lockStart && t < lockStart + LOCK) out.push({ kind: 'swirl', age: (t - lockStart) / 1000, progress: (t - lockStart) / LOCK });
  const open = (t - (duration(r) - OPEN)) / 1000;
  const burst = BURSTS[r];
  if (open >= 0 && open < burst.life) out.push({ kind: 'burst', age: open });
  if (open >= 0 && open < 0.9) out.push({ kind: 'wave', age: open, radius: WAVE[r] });
  if (burst.spiral && open >= 0 && open < 2.4) out.push({ kind: 'spiral', age: open });
  if (burst.confetti && open >= 0 && open < 6.5) out.push({ kind: 'confetti', age: open });
  return out;
}

function sparkMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { scale: { value: 500 } },
    vertexShader: `
      attribute float size; attribute vec4 tint; uniform float scale; varying vec4 vTint;
      void main() {
        vTint = tint;
        vec4 view = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * scale / max(-view.z, 0.1);
        gl_Position = projectionMatrix * view;
      }`,
    fragmentShader: `
      varying vec4 vTint;
      void main() {
        vec2 p = gl_PointCoord * 2.0 - 1.0;
        float d = dot(p, p);
        if (d > 1.0) discard;
        // Núcleo quente com um brilho em cruz: lê como estrelinha, não como bolinha.
        float glow = exp(-d * 5.0) + max(0.0, 1.0 - abs(p.x * p.y) * 22.0) * (1.0 - d) * 0.55;
        gl_FragColor = vec4(vTint.rgb * glow, vTint.a * glow);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
}

// Onda de luz no chão: um anel fino e macio (some para dentro e para fora), com um leve brilho no miolo.
function waveMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color() } },
    vertexShader: `varying vec2 vPos; void main() { vPos = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      uniform vec3 color; varying vec2 vPos;
      void main() {
        float r = length(vPos);
        float ring = exp(-pow((r - 0.9) / 0.045, 2.0)) + 0.12 * exp(-pow((r - 0.75) / 0.12, 2.0));
        gl_FragColor = vec4(color * ring, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
}

function heartTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const g = canvas.getContext('2d');
  g.fillStyle = '#fff';
  g.beginPath();
  g.moveTo(32, 56);
  g.bezierCurveTo(4, 36, 6, 10, 22, 10);
  g.bezierCurveTo(28, 10, 32, 15, 32, 20);
  g.bezierCurveTo(32, 15, 36, 10, 42, 10);
  g.bezierCurveTo(58, 10, 60, 36, 32, 56);
  g.fill();
  return new THREE.CanvasTexture(canvas);
}

function heartMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { scale: { value: 500 }, map: { value: heartTexture() } },
    vertexShader: `
      attribute float size; attribute vec4 tint; uniform float scale; varying vec4 vTint;
      void main() {
        vTint = tint;
        vec4 view = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * scale / max(-view.z, 0.1);
        gl_Position = projectionMatrix * view;
      }`,
    fragmentShader: `
      uniform sampler2D map; varying vec4 vTint;
      void main() {
        float a = texture2D(map, vec2(gl_PointCoord.x, 1.0 - gl_PointCoord.y)).a;
        if (a < 0.05) discard;
        gl_FragColor = vec4(vTint.rgb, vTint.a * a);
      }`,
    transparent: true, depthWrite: false,
  });
}

function points(count, material) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('size', new THREE.BufferAttribute(new Float32Array(count), 1).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('tint', new THREE.BufferAttribute(new Float32Array(count * 4), 4).setUsage(THREE.DynamicDrawUsage));
  geometry.setDrawRange(0, 0);
  const mesh = new THREE.Points(geometry, material);
  mesh.frustumCulled = false;
  return mesh;
}

// Só os vértices desenhados precisam subir à GPU. As reservas continuam com o
// mesmo tamanho; desativar um efeito não envia novamente seu buffer inteiro.
function uploadPoints(mesh, count) {
  mesh.geometry.setDrawRange(0, count);
  if (!count) return;
  for (const attribute of Object.values(mesh.geometry.attributes)) {
    attribute.clearUpdateRanges();
    attribute.addUpdateRange(0, count * attribute.itemSize);
    attribute.needsUpdate = true;
  }
}

// spot: onde a cápsula para (chão); radius: raio da cápsula. A raiz fica na origem, sem escala.
export function createFesta({ spot, radius }) {
  const group = new THREE.Group();
  const origin = new THREE.Vector3(spot.x, spot.y + radius, spot.z);
  const color = new THREE.Color();
  const white = new THREE.Color('#ffffff');

  const sparks = points(SPARKS, sparkMaterial());
  const hearts = points(HEARTS, heartMaterial());
  group.add(sparks, hearts);

  const wave = new THREE.Mesh(new THREE.CircleGeometry(1, 72), waveMaterial());
  wave.rotation.x = -Math.PI / 2;
  wave.position.set(spot.x, spot.y + 0.006, spot.z);
  wave.visible = false;
  group.add(wave);

  const confetti = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.07, 0.042), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), CONFETTI);
  confetti.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  confetti.count = 0;
  confetti.frustumCulled = false;
  group.add(confetti);

  const ripples = new THREE.InstancedMesh(new THREE.RingGeometry(0.8, 1, 24), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), RIPPLES);
  ripples.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  ripples.frustumCulled = false;
  group.add(ripples);

  const burstDirs = directions(220, 11);
  const sparkDirs = directions(20, 23);
  const random = rng(37);
  const pieces = Array.from({ length: CONFETTI }, () => ({
    x: (random() - 0.5) * 5.4, z: 0.1 + random() * 2.8, delay: random() * 1.4, fall: 0.5 + random() * 0.35,
    sway: 0.08 + random() * 0.12, phase: random() * Math.PI * 2, spin: 3 + random() * 6, color: new THREE.Color(CONFETTI_COLORS[Math.floor(random() * CONFETTI_COLORS.length)]),
  }));
  // Os corações sobem pelos dois lados (a carta do Salão fica bem no meio, na frente da cápsula).
  const heartSeeds = Array.from({ length: HEARTS }, (_, i) => ({ side: i % 2 ? 1 : -1, x: 0.45 + random() * 0.9, z: (random() - 0.5) * 0.8, rise: 0.45 + random() * 0.45, delay: random() * 0.5, size: 0.2 + random() * 0.12, phase: random() * 6 }));
  const drops = Array.from({ length: RIPPLES }, () => ({ x: 0, z: 0, born: -1, life: 0.7 }));
  const matrix = new THREE.Matrix4();
  const rotation = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const scaleVec = new THREE.Vector3();
  const position = new THREE.Vector3();
  const flat = new THREE.Vector3();
  const neon = new THREE.Color();
  // As cores por instância precisam existir antes do primeiro desenho (senão o shader não as usa).
  for (let i = 0; i < CONFETTI; i++) confetti.setColorAt(i, white);
  for (let i = 0; i < RIPPLES; i++) ripples.setColorAt(i, white);
  // Só a onda muda sua escala; os demais efeitos animam buffers de vértices/instâncias.
  for (const mesh of [sparks, hearts, confetti, ripples]) {
    mesh.updateMatrix();
    mesh.matrixAutoUpdate = false;
  }
  confetti.instanceColor.setUsage(THREE.DynamicDrawUsage);
  ripples.instanceColor.setUsage(THREE.DynamicDrawUsage);
  const rippleRotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));

  let celebration = null; // { kind, at }
  let used = 0;
  const sparkPos = sparks.geometry.attributes.position.array;
  const sparkSize = sparks.geometry.attributes.size.array;
  const sparkTint = sparks.geometry.attributes.tint.array;

  function emit(x, y, z, size, c, alpha) {
    if (used >= SPARKS) return;
    sparkPos[used * 3] = x; sparkPos[used * 3 + 1] = y; sparkPos[used * 3 + 2] = z;
    sparkSize[used] = size;
    sparkTint[used * 4] = c.r; sparkTint[used * 4 + 1] = c.g; sparkTint[used * 4 + 2] = c.b; sparkTint[used * 4 + 3] = alpha;
    used++;
  }

  // Faísca balística com arrasto: sai rápida e desacelera, a gravidade puxa para baixo.
  function ballistic(dir, speed, age, out) {
    const drag = 2.4;
    const travel = speed * (1 - Math.exp(-drag * age)) / drag;
    out.set(origin.x + dir.x * travel, origin.y + dir.y * travel - 0.5 * GRAVITY * 0.35 * age * age, origin.z + dir.z * travel);
    if (out.y < spot.y + 0.01) out.y = spot.y + 0.01;
    return out;
  }

  // Volta: { busy, tint, tintAmount, shake } para a cena (neon, câmera e ritmo de quadros).
  function update({ rarity, t, sec, palette, reduced = false, rain = true }) {
    const hadConfetti = confetti.count > 0;
    used = 0;
    let busy = false;
    let tint = null;
    let tintAmount = 0;
    let shake = 0;
    confetti.count = 0;
    wave.visible = false;
    hearts.geometry.setDrawRange(0, 0);
    const r = norm(rarity);
    const final = palette[r];

    if (!reduced && rarity) {
      for (const fx of activeBursts(r, t)) {
        busy = true;
        if (fx.kind === 'sparks') {
          const c = color.copy(palette[fx.color]).multiplyScalar(2.6);
          const fade = 1 - fx.age / 0.6;
          for (const dir of sparkDirs) {
            ballistic(dir, 1.6 * dir.speed, fx.age, position);
            emit(position.x, position.y, position.z, 0.035 * dir.size * fade, c, fade);
          }
        } else if (fx.kind === 'swirl') {
          // Lendário travando: faíscas douradas giram em volta da cápsula e apertam o círculo.
          const c = color.copy(palette.legendary).multiplyScalar(3);
          for (let i = 0; i < 36; i++) {
            const a = i / 36 * Math.PI * 2 + fx.age * (5 + fx.progress * 9);
            const rad = 0.42 - fx.progress * 0.26;
            const h = ((i * 0.37 + fx.age * 0.6) % 1) * 0.5;
            emit(origin.x + Math.cos(a) * rad, spot.y + 0.04 + h, origin.z + Math.sin(a) * rad, 0.03 + 0.02 * fx.progress, c, 0.5 + 0.5 * fx.progress);
          }
          shake = Math.max(shake, 0.4 * fx.progress);
          tint = palette.legendary; tintAmount = Math.max(tintAmount, fx.progress);
        } else if (fx.kind === 'burst') {
          const b = BURSTS[r];
          const fade = Math.pow(1 - fx.age / b.life, 1.4);
          for (let i = 0; i < b.count; i++) {
            const dir = burstDirs[i];
            const age = Math.max(0, fx.age - dir.delay * 0.12);
            flat.set(dir.x, dir.y * b.flat + (1 - b.flat) * 0.12, dir.z);
            const c = color.copy(final).lerp(white, dir.white * 0.5).multiplyScalar(b.glow);
            ballistic(flat, b.speed * dir.speed, age, position);
            emit(position.x, position.y, position.z, 0.05 * dir.size * (0.4 + fade), c, fade);
          }
          if (r === 'legendary' && fx.age < 0.35) shake = Math.max(shake, 1 - fx.age / 0.35);
          tint = final; tintAmount = Math.max(tintAmount, fade);
        } else if (fx.kind === 'spiral') {
          // Épico e lendário: uma espiral sobe em volta do feixe.
          const count = BURSTS[r].spiral;
          const c = color.copy(final).multiplyScalar(3.2);
          for (let i = 0; i < count; i++) {
            const k = i / count;
            const age = fx.age - k * 0.6;
            if (age < 0) continue;
            const h = age * 1.4;
            if (h > 2.6) continue;
            const a = k * Math.PI * 8 + age * 3.2;
            const rad = 0.28 + h * 0.08;
            emit(origin.x + Math.cos(a) * rad, origin.y + h, origin.z + Math.sin(a) * rad, 0.04 * (1 - h / 2.6), c, 1 - h / 2.6);
          }
        } else if (fx.kind === 'wave') {
          const p = fx.age / 0.9;
          wave.visible = true;
          wave.scale.setScalar(0.15 + fx.radius * (1 - Math.pow(1 - p, 3)));
          wave.material.uniforms.color.value.copy(final).multiplyScalar(2.2 * Math.pow(1 - p, 1.5));
        } else if (fx.kind === 'confetti') {
          let n = 0;
          for (const piece of pieces) {
            const age = fx.age - piece.delay;
            if (age < 0) continue;
            const y = 3.05 - age * piece.fall;
            if (y < spot.y + 0.01) continue;
            position.set(piece.x + Math.sin(age * 2.2 + piece.phase) * piece.sway, y, piece.z + Math.cos(age * 1.7 + piece.phase) * piece.sway * 0.5);
            euler.set(age * piece.spin, age * piece.spin * 0.7 + piece.phase, age * 1.3);
            rotation.setFromEuler(euler);
            matrix.compose(position, rotation, scaleVec.setScalar(1));
            confetti.setMatrixAt(n, matrix);
            confetti.setColorAt(n, piece.color);
            n++;
          }
          confetti.count = n;
          if (n) {
            for (const attribute of [confetti.instanceMatrix, confetti.instanceColor]) {
              attribute.clearUpdateRanges();
              attribute.addUpdateRange(0, n * attribute.itemSize);
              attribute.needsUpdate = true;
            }
          }
        }
      }
    }

    // Casou (ou roubou): corações sobem do círculo de luz, uma onda no chão e o neon pisca na cor.
    if (celebration && !reduced) {
      const age = sec - celebration.at;
      if (age > CELEBRATION || age < 0) celebration = null;
      else {
        busy = true;
        const style = CELEBRATIONS[celebration.kind];
        const c = color.set(style.color);
        const pos = hearts.geometry.attributes.position.array;
        const size = hearts.geometry.attributes.size.array;
        const tintArray = hearts.geometry.attributes.tint.array;
        let n = 0;
        for (const h of heartSeeds) {
          const a = age - h.delay;
          if (a < 0) continue;
          const fade = Math.min(1, a * 4) * (1 - a / (CELEBRATION - h.delay));
          pos[n * 3] = origin.x + h.side * h.x * Math.min(1, 0.35 + a * 1.5) + Math.sin(a * 3 + h.phase) * 0.06;
          pos[n * 3 + 1] = origin.y + a * h.rise;
          pos[n * 3 + 2] = origin.z + h.z;
          size[n] = h.size * Math.min(1, a * 5);
          tintArray[n * 4] = c.r; tintArray[n * 4 + 1] = c.g; tintArray[n * 4 + 2] = c.b; tintArray[n * 4 + 3] = Math.max(0, fade);
          n++;
        }
        uploadPoints(hearts, n);
        if (age < 0.9) {
          const p = age / 0.9;
          wave.visible = true;
          wave.scale.setScalar(0.15 + 2.2 * (1 - Math.pow(1 - p, 3)));
          wave.material.uniforms.color.value.copy(c).multiplyScalar(2 * Math.pow(1 - p, 1.5));
        }
        const flash = Math.max(0, 1 - age / 1.6) * (Math.sin(age * 22) > -0.3 ? 1 : 0.4);
        if (flash > tintAmount) { tint = neon.set(style.neon); tintAmount = flash; }
      }
    }

    uploadPoints(sparks, used);

    // Ondinhas da chuva nas poças: cada gota abre um anel que some.
    ripples.visible = rain && !reduced;
    if (ripples.visible) {
      for (let i = 0; i < RIPPLES; i++) {
        const drop = drops[i];
        let age = sec - drop.born;
        if (drop.born < 0 || age > drop.life || age < 0) {
          drop.born = sec + Math.random() * 0.6;
          drop.x = (Math.random() - 0.5) * 4.6;
          drop.z = 0.5 + Math.random() * 2.4;
          drop.life = 0.55 + Math.random() * 0.4;
          age = -1;
        }
        const p = age < 0 ? 0 : age / drop.life;
        position.set(drop.x, spot.y + 0.004, drop.z);
        matrix.compose(position, rippleRotation, scaleVec.setScalar(age < 0 ? 0.0001 : 0.015 + p * 0.09));
        ripples.setMatrixAt(i, matrix);
        ripples.setColorAt(i, color.setRGB(0.32, 0.4, 0.55).multiplyScalar(age < 0 ? 0 : Math.pow(1 - p, 2)));
      }
      ripples.instanceMatrix.needsUpdate = true;
      if (ripples.instanceColor) ripples.instanceColor.needsUpdate = true;
    }

    return { busy, tint, tintAmount, shake, solidChanged: hadConfetti || confetti.count > 0 };
  }

  // sec: relógio da cena (s). kind: 'claim' (casou com o próprio roll) ou 'steal' (roubou o de outra pessoa).
  function celebrate(kind, sec) {
    celebration = { kind: CELEBRATIONS[kind] ? kind : 'claim', at: sec };
  }

  // Tamanho dos pontos em pixels: altura do canvas em pixels / (2 · tan(fov/2)).
  function setScale(pixels) {
    sparks.material.uniforms.scale.value = pixels;
    hearts.material.uniforms.scale.value = pixels;
  }

  function dispose() {
    hearts.material.uniforms.map.value.dispose();
    confetti.dispose();
    ripples.dispose();
  }

  return { group, update, celebrate, setScale, dispose };
}
