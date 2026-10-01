// Cena 3D do Salão do Mudae: a lojinha de gashapon, feita só com código (Three.js, sem imagens).
// O Salão (mudae-salao.js) continua dono da carta, dos botões, dos sons e da fila: daqui saem só o
// desenho, os avisos de som (onCue) e onde a carta deve nascer (cardAnchor).
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { state as timeline, duration, cues, AFTER } from './linha-do-tempo.mjs';
import { createShop } from './loja.mjs';
import { createMachine } from './maquina.mjs';
import { createCapsule } from './capsula.mjs';

// Cores das cápsulas por raridade (o Salão manda as do tema; a comum é sempre branca).
const COLORS = { common: '#f4f1ea', rare: '#3ba7ff', epic: '#b46cff', legendary: '#ffc53d' };
// Onde a cápsula para: o centro do círculo de luz da lâmpada, na frente da máquina do meio.
const SPOT = new THREE.Vector3(0, 0, 1.45);
// As máquinas pastel dos lados; a do meio é a lavanda com frisos dourados.
const SIDES = [[-1.95, '#9fd8c0'], [-1.12, '#f4a9b8'], [1.12, '#a9cff4'], [1.95, '#f4d98a']];
// Enquadramento: [largura, altura] de cena que precisa caber em tela larga e em tela em pé.
const FRAME = { fov: 36, wide: [4.9, 4.2], tall: [2.5, 4.2], eye: 2.1, look: new THREE.Vector3(0, 1.35, 0) };
const SKY = new THREE.Color('#5b4b9a');
const GOLD = new THREE.Color('#ffc53d');
const QUALITY_KEY = 'gachaQuality';
const IDLE_FPS = 30;

// Qualidade: 3 tudo; 2 sem reflexo; 1 sem reflexo, bloom e sombras; 0 isso e resolução 1x.
function readQuality() {
  try {
    const raw = localStorage.getItem(QUALITY_KEY);
    const q = Number(raw);
    return raw !== null && Number.isInteger(q) && q >= 0 && q <= 3 ? q : 3;
  } catch { return 3; }
}
function saveQuality(q) {
  try { localStorage.setItem(QUALITY_KEY, String(q)); } catch { /* sem armazenamento: vale só nesta visita */ }
}

// host: elemento que recebe o canvas (ocupa o palco todo). Rejeita se não houver WebGL2.
export async function create(host, { now = () => Date.now(), reducedMotion = false, colors = {}, onCue = () => {}, onLost = () => {} } = {}) {
  const canvas = document.createElement('canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, stencil: false, powerPreference: 'high-performance' });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const palette = {};
  for (const [key, value] of Object.entries(COLORS)) palette[key] = new THREE.Color(key !== 'common' && colors[key] ? colors[key] : value);

  // Luz de ambiente para as partes de metal (metalness 0.85) não ficarem pretas só com luzes diretas.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const environment = pmrem.fromScene(room, 0.04).texture;
  room.dispose();
  pmrem.dispose();

  const scene = new THREE.Scene();
  scene.environment = environment;
  scene.environmentIntensity = 0.35;
  scene.background = new THREE.Color('#070818');
  scene.fog = new THREE.Fog('#070818', 7, 16);
  const camera = new THREE.PerspectiveCamera(FRAME.fov, 1, 0.1, 40);

  const shop = createShop();
  scene.add(shop.group);
  for (const [x, color] of SIDES) {
    const side = createMachine({ color, seed: Math.round(x * 10) + 50 });
    side.group.position.x = x;
    scene.add(side.group);
  }
  const hero = createMachine({ color: '#c9b6f2', trim: '#e8c46a', scale: 1.12, seed: 7, hero: true });
  scene.add(hero.group);
  hero.group.updateMatrixWorld(true);
  const capsule = createCapsule({ from: hero.group.localToWorld(hero.exit.clone()), to: SPOT });
  scene.add(capsule.group);

  const hemi = new THREE.HemisphereLight(SKY.clone(), '#140c1c', 0.7);
  const lamp = new THREE.SpotLight('#ffc98a', 38, 0, 0.62, 0.7, 2);
  lamp.position.set(0, 2.12, 0.3);
  lamp.target.position.copy(SPOT);
  lamp.shadow.mapSize.set(1024, 1024);
  lamp.shadow.bias = -0.0004;
  const pink = new THREE.PointLight('#ff4fd8', 5, 6, 2);
  pink.position.set(-0.8, 2.95, 0.3);
  const cyan = new THREE.PointLight('#3ee8ff', 3.5, 6, 2);
  cyan.position.set(0.9, 2.95, 0.3);
  scene.add(hemi, lamp, lamp.target, pink, cyan);

  const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.8, 0.5, 0.85);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  let quality = readQuality();
  let width = 1;
  let height = 1;
  let current = null; // roll em cena: { id, rarity, ts, scale, lastT, resting }
  let raf = 0;
  let lastFrame = 0;
  let dirty = true;
  let visible = true;
  let dead = false;
  let disposed = false;
  let probe = 120; // primeiros quadros sem limite de fps, para medir a máquina
  let samples = [];
  const anchor = new THREE.Vector3();

  function applyQuality() {
    shop.setReflection(quality >= 3);
    bloom.enabled = quality >= 2;
    const shadows = quality >= 2;
    if (renderer.shadowMap.enabled !== shadows) {
      renderer.shadowMap.enabled = shadows;
      lamp.castShadow = shadows;
      scene.traverse((o) => { for (const m of [].concat(o.material || [])) m.needsUpdate = true; });
    }
    resize();
  }

  function resize() {
    const box = host.getBoundingClientRect();
    width = Math.max(1, Math.round(box.width));
    height = Math.max(1, Math.round(box.height));
    const ratio = Math.min(window.devicePixelRatio || 1, quality === 0 ? 1 : width < 700 ? 1.5 : 2);
    renderer.setPixelRatio(ratio);
    renderer.setSize(width, height, false);
    composer.setPixelRatio(ratio);
    composer.setSize(width, height);
    shop.setSize(width * ratio, height * ratio);
    dirty = true;
    wake();
  }

  // dolly: 0 = câmera parada; 1 = aproximada no roll (o lendário empurra mais).
  function frame(dolly) {
    const aspect = width / height;
    const half = Math.tan(THREE.MathUtils.degToRad(FRAME.fov / 2));
    const [needW, needH] = aspect < 1 ? FRAME.tall : FRAME.wide;
    const dist = Math.max(needH / 2 / half, needW / 2 / (half * aspect)) * (1 - 0.16 * dolly);
    camera.aspect = aspect;
    camera.position.set(0, FRAME.eye - 0.3 * dolly, FRAME.look.z + dist);
    camera.lookAt(FRAME.look.x, FRAME.look.y - 0.45 * dolly, FRAME.look.z);
    camera.updateProjectionMatrix();
  }

  const elapsed = () => (current.resting ? Infinity : (now() - current.ts) * current.scale);
  const busy = () => !!current && !current.resting && elapsed() < duration(current.rarity) + AFTER;

  function wake() {
    if (!raf && visible && !dead && !document.hidden) raf = requestAnimationFrame(loop);
  }

  function loop(time) {
    raf = 0;
    if (!visible || dead || document.hidden) return;
    const animating = busy();
    // Com "reduzir movimento" e nada acontecendo, a cena fica parada até o próximo play/rest/resize.
    if (!animating && reducedMotion && !dirty && probe <= 0) return;
    const gap = time - lastFrame;
    if (!animating && probe <= 0 && gap < 1000 / IDLE_FPS - 2) { raf = requestAnimationFrame(loop); return; }
    lastFrame = time;
    measure(gap, animating);
    draw(time / 1000);
    raf = requestAnimationFrame(loop);
  }

  // Se a média ficar abaixo de ~40 fps, baixa um nível de qualidade (e lembra neste navegador).
  function measure(gap, animating) {
    if (!(animating || probe > 0) || gap <= 0 || gap > 250) return;
    if (probe > 0) probe--;
    samples.push(gap);
    if (samples.length < 60) return;
    const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
    samples = [];
    if (avg > 25 && quality > 0) {
      quality--;
      saveQuality(quality);
      applyQuality();
    }
  }

  function draw(sec) {
    dirty = false;
    const s = current ? timeline(current.rarity, elapsed(), { reduced: reducedMotion }) : null;
    hero.setCrank(s ? s.crank : 0);
    hero.setShake(s ? s.shake : 0, sec);
    capsule.update(s, palette);
    if (current && !current.resting) fireCues();
    const gold = s ? s.gold : 0;
    hemi.color.copy(SKY).lerp(GOLD, gold);
    hemi.intensity = 0.7 + 1.6 * gold;
    shop.update(sec, { reduced: reducedMotion });
    frame(reducedMotion || !s ? 0 : s.camera + 0.35 * gold);
    composer.render();
  }

  // Toca cada som uma vez, só se a linha do tempo acabou de passar por ele (quem entra no meio não ouve tudo de uma vez).
  function fireCues() {
    const t = elapsed();
    for (const c of cues(current.rarity)) {
      if (c.at > current.lastT && c.at <= t && t - c.at < 250 && (!reducedMotion || c.name === 'pop')) onCue(c.name);
    }
    current.lastT = t;
  }

  function play({ id, rarity, ts, revealAt }) {
    const span = (revealAt ?? ts) - ts;
    // Abre exatamente no revealAt do servidor, mesmo se a duração dele for um pouco diferente da nossa.
    const scale = span > 500 ? duration(rarity) / span : 1;
    current = { id, rarity, ts, scale, lastT: -Infinity, resting: false };
    dirty = true;
    wake();
  }

  // Pose de descanso: cápsula aberta e apagada no círculo de luz (ou nenhuma, com null).
  function rest(next) {
    if (next && current?.id === next.id) return; // o roll que está tocando chega sozinho nessa pose
    current = next ? { id: next.id, rarity: next.rarity, resting: true } : null;
    dirty = true;
    wake();
  }

  // Onde a carta nasce, em px dentro do host.
  function cardAnchor() {
    if (capsule.shown()) capsule.center(anchor);
    else anchor.set(SPOT.x, 0.15, SPOT.z);
    anchor.project(camera);
    return { x: ((anchor.x + 1) / 2) * width, y: ((1 - anchor.y) / 2) * height };
  }

  function setVisible(on) {
    visible = on;
    if (on) { dirty = true; wake(); }
  }

  const onVisibility = () => { if (!document.hidden) { dirty = true; wake(); } };
  document.addEventListener('visibilitychange', onVisibility);
  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    if (dead) return;
    dead = true;
    cancelAnimationFrame(raf);
    raf = 0;
    onLost();
  });
  const observer = new ResizeObserver(() => resize());

  function dispose() {
    if (disposed) return;
    disposed = dead = true;
    cancelAnimationFrame(raf);
    raf = 0;
    observer.disconnect();
    document.removeEventListener('visibilitychange', onVisibility);
    scene.traverse((o) => {
      o.geometry?.dispose();
      if (o.isInstancedMesh) o.dispose(); // solta os buffers das instâncias
      for (const m of [].concat(o.material || [])) {
        for (const value of Object.values(m)) if (value?.isTexture) value.dispose();
        m.dispose();
      }
    });
    shop.dispose();
    environment.dispose();
    bloom.dispose();
    composer.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
    canvas.remove();
  }

  host.append(canvas);
  applyQuality();
  observer.observe(host);
  frame(0);
  // Compila os shaders antes do primeiro roll, para a primeira cápsula não engasgar.
  try { await renderer.compileAsync(scene, camera); } catch { /* compila no primeiro desenho */ }
  wake();
  return { play, rest, cardAnchor, setVisible, dispose };
}
