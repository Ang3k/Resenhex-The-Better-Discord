// Cena 3D do Salão do Mudae: a lojinha de gashapon, feita só com código (Three.js, sem imagens).
// O Salão (mudae-salao.js) continua dono da carta, dos botões, dos sons e da fila: daqui saem só o
// desenho, os avisos de som (onCue) e onde a carta deve nascer (cardAnchor).
import * as THREE from 'three';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { createEffects, createEnvironment } from './efeitos.mjs';
import { state as timeline, duration, cues, AFTER } from './linha-do-tempo.mjs';
import { createShop } from './loja.mjs';
import { createMachine } from './maquina.mjs';
import { createCapsule, RADIUS } from './capsula.mjs';
import { createFesta } from './festa.mjs';
import { flattenStaticGroup } from './geometria.mjs';
import { GachaEffectComposer, SceneAntialiasPass, GachaSMAAPass, renderSettings } from './renderizacao.mjs';

// Cores das cápsulas por raridade (o Salão manda as do tema; a comum é sempre branca).
const COLORS = { common: '#f4f1ea', rare: '#3ba7ff', epic: '#b46cff', legendary: '#ffc53d' };
// Onde a cápsula para: o centro do círculo de luz da lâmpada, na frente da máquina do meio.
const SPOT = new THREE.Vector3(0, 0, 1.45);
// As máquinas pastel dos lados; a do meio é a lavanda com frisos dourados.
const SIDES = [[-1.95, '#80b4a1'], [-1.12, '#d093a6'], [1.12, '#8facbf'], [1.95, '#d4bd80']];
// Enquadramento: [largura, altura] de cena que precisa caber em tela larga e em tela em pé.
const FRAME = { fov: 36, wide: [6.1, 4.6], tall: [2.65, 4.6], eye: 2.15, look: new THREE.Vector3(0, 1.58, 0.65) };
const SKY = new THREE.Color('#7086a9');
const GOLD = new THREE.Color('#ffc53d');
const QUALITY_KEY = 'gachaQuality';
const QUALITY_TTL = 7 * 24 * 3600 * 1000; // depois de uma semana volta a tentar o máximo (a máquina pode ter melhorado)
const IDLE_FPS = 30;
const DISPLAY_TICKS = 20; // quadros só para medir o intervalo da tela, sem desenhar
const PROBE_FRAMES = 120; // quadros desenhados, sem limite de fps, para medir a máquina
const PROBE_WARMUP = 20; // os primeiros quadros depois de iniciar/trocar de qualidade não contam
const COMPILE_TIMEOUT = 3000;

// Qualidade: 3 tudo, resolução interna 2x com limite de pixels, MSAA + SMAA alto;
// 2 sem reflexo e sombra da lâmpada; 1 sem AO, névoa, bloom e sombras;
// 0 isso e resolução 1x. O tratamento de cor é leve e permanece nos níveis baixos.
// Guardada como { q, at }; o valor expira para a máquina poder se recuperar.
function readQuality() {
  try {
    const saved = JSON.parse(localStorage.getItem(QUALITY_KEY));
    const age = saved && typeof saved.at === 'number' ? Date.now() - saved.at : -1;
    return age >= 0 && age <= QUALITY_TTL && Number.isInteger(saved.q) && saved.q >= 0 && saved.q <= 3 ? saved.q : 3;
  } catch { return 3; }
}
function saveQuality(q) {
  try { localStorage.setItem(QUALITY_KEY, JSON.stringify({ q, at: Date.now() })); } catch { /* sem armazenamento: vale só nesta visita */ }
}

function median(list) {
  const sorted = [...list].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

// host: elemento que recebe o canvas (ocupa o palco todo). Rejeita se não houver WebGL2 (ou se a montagem falhar).
export async function create(host, { now = () => Date.now(), reducedMotion = false, cinematic = true, colors = {}, onCue = () => {}, onLost = () => {}, onMachine = null, profile = null } = {}) {
  const canvas = document.createElement('canvas');
  // 'default': a cena fica a maior parte do tempo parada, não vale acordar a placa de vídeo dedicada.
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, stencil: false, powerPreference: 'default' });
  profile?.init(renderer); // instrumentação opcional da bancada local, ausente no Salão
  let teardown = null; // vira dispose() assim que ele existe; antes disso só dá para soltar o renderer
  try {
    // O alvo do compositor é HalfFloat: sem uma dessas extensões a cena sairia preta.
    if (!(renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float'))) {
      throw new Error('WebGL sem render em ponto flutuante');
    }
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.96;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.shadowMap.autoUpdate = false; // cenário parado reaproveita as sombras
    const palette = {};
    for (const [key, value] of Object.entries(COLORS)) palette[key] = new THREE.Color(key !== 'common' && colors[key] ? colors[key] : value);

    // Luz de ambiente para as partes de metal (metalness 0.85) não ficarem pretas só com luzes diretas.
    const environment = createEnvironment(renderer);

    const scene = new THREE.Scene();
    scene.environment = environment.texture;
    scene.environmentIntensity = 0.48;
    scene.background = new THREE.Color('#080e1b');
    scene.fog = new THREE.Fog('#080e1b', 8, 19);
    const camera = new THREE.PerspectiveCamera(FRAME.fov, 1, 0.1, 40);

    const shop = createShop({ environment: environment.texture });
    scene.add(shop.group);
    const machineAssets = new Map();
    const decorativeMachines = new THREE.Group();
    for (const [x, color] of SIDES) {
      const side = createMachine({ color, seed: Math.round(x * 10) + 50, assets: machineAssets });
      side.group.position.set(x, 0.08, 0);
      side.group.rotation.y = x < 0 ? 0.025 : -0.025;
      decorativeMachines.add(side.group);
    }
    scene.add(flattenStaticGroup(decorativeMachines));
    const hero = createMachine({ color: '#b7a6ca', trim: '#c5ab70', scale: 1.12, seed: 7, hero: true, assets: machineAssets });
    hero.group.position.y = 0.08;
    scene.add(hero.group);
    hero.group.updateMatrixWorld(true);
    const capsule = createCapsule({ from: hero.group.localToWorld(hero.exit.clone()), to: SPOT });
    scene.add(capsule.group);
    // Faíscas, confete, onda no chão, corações e ondinhas da chuva.
    const festa = createFesta({ spot: SPOT, radius: RADIUS });
    scene.add(festa.group);

    const hemi = new THREE.HemisphereLight(SKY.clone(), '#111622', 0.26);
    // A direção lateral revela os gomos do toldo e os caixilhos;
    // vitrines e neon preenchem a sombra com luz quente/rosa, em vez de elevar todo o ambiente.
    const streetLight = new THREE.DirectionalLight('#a6c0eb', 0.78);
    streetLight.position.set(-3.6, 6.4, 5);
    streetLight.target.position.set(0, 1.2, -0.25);
    streetLight.shadow.mapSize.set(1024, 1024);
    Object.assign(streetLight.shadow.camera, { left: -4.8, right: 4.8, top: 4.3, bottom: -3.1, near: 0.5, far: 18 });
    streetLight.shadow.camera.updateProjectionMatrix();
    streetLight.shadow.bias = -0.00015;
    streetLight.shadow.normalBias = 0.012;
    streetLight.shadow.radius = 2.8;
    streetLight.shadow.intensity = 0.85;
    const lamp = new THREE.SpotLight('#ffc98a', 14, 0, 0.68, 0.85, 2);
    lamp.position.set(0, 2.12, 0.3);
    lamp.target.position.copy(SPOT);
    lamp.shadow.mapSize.set(512, 512);
    lamp.shadow.camera.near = 0.1;
    lamp.shadow.camera.far = 7;
    lamp.shadow.bias = -0.0001;
    lamp.shadow.normalBias = 0.008;
    lamp.shadow.radius = 2.5;
    lamp.shadow.intensity = 0.8;
    const pink = new THREE.PointLight('#ff4fd8', 2.6, 5, 2);
    pink.position.set(-0.55, 3.15, 0.05);
    const cyan = new THREE.PointLight('#3ee8ff', 2.2, 5, 2);
    cyan.position.set(0.65, 3.1, 0.05);
    scene.add(hemi, streetLight, streetLight.target, lamp, lamp.target, pink, cyan);

    // Só a geometria precisa de profundidade e MSAA. Os efeitos usam alvos simples.
    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false });
    const renderPass = new SceneAntialiasPass(scene, camera, Math.min(4, renderer.capabilities.maxSamples));
    const composer = new GachaEffectComposer(renderer, target, renderPass);
    const effects = createEffects(scene, camera, lamp);
    const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.46, 0.5, 1.05);
    // Os onze alvos de bloom contêm só cor; nenhum desses passes lê profundidade.
    for (const buffer of [bloom.renderTargetBright, ...bloom.renderTargetsHorizontal, ...bloom.renderTargetsVertical]) {
      buffer.depthBuffer = false;
    }
    for (const material of [bloom.materialHighPassFilter, ...bloom.separableBlurMaterials, bloom.compositeMaterial]) {
      material.depthTest = material.depthWrite = false;
    }
    const outputPass = new OutputPass();
    const antialias = new GachaSMAAPass();
    composer.addPass(renderPass);
    composer.addPass(effects.contact);
    composer.addPass(effects.atmosphere);
    composer.addPass(bloom);
    composer.addPass(effects.grade);
    // O SMAA desta versão opera em linear-sRGB, antes da conversão final do OutputPass.
    composer.addPass(antialias);
    composer.addPass(outputPass);

    const surfaceTextures = new Set();
    scene.traverse((object) => {
      for (const material of [].concat(object.material || [])) {
        for (const value of Object.values(material)) if (value?.isCanvasTexture) surfaceTextures.add(value);
      }
    });
    const hardware = { maxSamples: renderer.capabilities.maxSamples, maxTextureSize: renderer.capabilities.maxTextureSize,
      maxAnisotropy: renderer.capabilities.getMaxAnisotropy() };
    function shadowSize(light, size) {
      if (light.shadow.mapSize.x === size) return;
      light.shadow.dispose();
      light.shadow.map = light.shadow.mapPass = null;
      light.shadow.mapSize.set(size, size);
      renderer.shadowMap.needsUpdate = true;
    }

    let quality = Number.isInteger(profile?.quality) && profile.quality >= 0 && profile.quality <= 3 ? profile.quality : readQuality();
    let pendingQuality = null; // nível novo pedido pela medição; só entra com a cena parada, no começo de um quadro
    let width = 1;
    let height = 1;
    let sized = false; // false enquanto o host não tem tamanho (display:none, fora da página): nada é desenhado
    let current = null; // roll em cena: { id, rarity, ts, scale, lastT, resting }
    let raf = 0;
    let lastFrame = 0;
    let lastDolly = 0;
    let frameAspect = NaN, frameDolly = NaN, frameJitterX = NaN, frameJitterY = NaN;
    let depthRevision = 0;
    let dirty = true;
    let visible = true;
    let started = false; // só vira true depois de compilar os shaders; antes disso o laço não roda
    let dead = false;
    let disposed = false;
    let display = profile ? 1000 / 60 : 0; // na bancada o nível fica fixo para comparar a mesma resolução
    let displayGaps = [];
    let probeDone = !!profile;
    let warm = PROBE_WARMUP;
    let samples = [];
    const anchor = new THREE.Vector3();
    let festaBusy = false; // confete ou corações ainda no ar: o laço segue a 60 fps
    let rollable = false;  // dá para clicar na máquina do meio e girar
    let hovering = false;
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    // Devolve true se as sombras ligaram/desligaram (os shaders precisam ser recompilados).
    function applyQuality() {
      canvas.dataset.quality = String(quality);
      shop.setReflection(quality >= 3);
      bloom.enabled = cinematic && quality >= 2;
      effects.setQuality(quality, cinematic);
      const settings = renderSettings(quality, hardware);
      renderPass.setSamples(settings.samples);
      antialias.setQuality(quality);
      shadowSize(streetLight, settings.streetShadow);
      shadowSize(lamp, settings.lampShadow);
      for (const texture of surfaceTextures) {
        if (texture.anisotropy === settings.anisotropy) continue;
        texture.anisotropy = settings.anisotropy;
        texture.needsUpdate = true;
      }
      const shadows = quality >= 2;
      const changed = renderer.shadowMap.enabled !== shadows || lamp.castShadow !== (quality >= 3);
      if (changed) {
        renderer.shadowMap.enabled = shadows;
        streetLight.castShadow = shadows;
        lamp.castShadow = quality >= 3;
        renderer.shadowMap.needsUpdate = true;
        scene.traverse((o) => { for (const m of [].concat(o.material || [])) m.needsUpdate = true; });
      }
      resize();
      return changed;
    }
    if (profile?.manual) profile.setQuality = (next) => {
      if (!Number.isInteger(next) || next < 0 || next > 3 || dead) return;
      quality = next;
      if (applyQuality()) recompile();
    };

    function resize() {
      const box = host.getBoundingClientRect();
      const w = Math.round(box.width);
      const h = Math.round(box.height);
      if (w < 1 || h < 1) { sized = false; return; }
      sized = true;
      width = w;
      height = h;
      const { ratio } = renderSettings(quality, { ...hardware, width, height,
        nativeRatio: window.devicePixelRatio, forcedRatio: profile?.pixelRatio });
      renderer.setPixelRatio(ratio);
      renderer.setSize(width, height, false);
      composer.setPixelRatio(ratio);
      composer.setSize(width, height);
      shop.setSize(width * ratio, height * ratio);
      festa.setScale(height * ratio / (2 * Math.tan(THREE.MathUtils.degToRad(FRAME.fov / 2))));
      dirty = true;
      wake();
    }

    // dolly: 0 = câmera parada; 1 = aproximada no roll (o lendário empurra mais).
    // jitterX/jitterY: tremida da câmera (o lendário travando e explodindo).
    function frame(dolly, jitterX = 0, jitterY = 0) {
      lastDolly = dolly;
      const aspect = width / height;
      if (aspect === frameAspect && dolly === frameDolly && jitterX === frameJitterX && jitterY === frameJitterY) return;
      const half = Math.tan(THREE.MathUtils.degToRad(FRAME.fov / 2));
      const [needW, needH] = aspect < 1 ? FRAME.tall : FRAME.wide;
      const dist = Math.max(needH / 2 / half, needW / 2 / (half * aspect)) * (1 - 0.16 * dolly);
      if (aspect !== frameAspect) {
        camera.aspect = aspect;
        camera.updateProjectionMatrix();
      }
      camera.position.set((aspect < 1 ? 0.22 : 0.55) + jitterX, FRAME.eye - 0.15 * dolly + jitterY, FRAME.look.z + dist);
      camera.lookAt(FRAME.look.x, FRAME.look.y - 0.5 * dolly, FRAME.look.z + 0.3 * dolly);
      frameAspect = aspect; frameDolly = dolly; frameJitterX = jitterX; frameJitterY = jitterY;
    }

    const elapsed = () => (current.resting ? Infinity : (now() - current.ts) * current.scale);
    const busy = () => !!current && !current.resting && elapsed() < duration(current.rarity) + AFTER;

    // Nunca há mais de um quadro agendado: todo agendamento passa por aqui.
    function schedule() {
      if (profile?.manual) return;
      if (!raf) raf = requestAnimationFrame(loop);
    }

    function wake() {
      if (started && visible && !dead && !document.hidden) schedule();
    }

    function recompile() {
      try { Promise.resolve(renderer.compileAsync(scene, camera)).catch(() => {}); } catch { /* compila no próximo desenho */ }
    }

    function loop(time) {
      raf = 0;
      if (!visible || dead || document.hidden || !sized) return;
      const animating = busy() || festaBusy;
      const gap = time - lastFrame;

      // A troca de qualidade só entra com a cena parada, nunca no meio de um roll.
      if (!animating && pendingQuality !== null) {
        quality = pendingQuality;
        pendingQuality = null;
        saveQuality(quality);
        warm = PROBE_WARMUP;
        samples = [];
        if (applyQuality()) recompile();
        if (!sized) return;
      }

      // Primeiro mede a tela: alguns quadros sem desenhar, para saber se ela roda a 60, 48, 30 Hz...
      if (!animating && !display && !dirty) {
        lastFrame = time;
        if (gap > 0 && gap <= 250) displayGaps.push(gap);
        if (displayGaps.length >= DISPLAY_TICKS) display = median(displayGaps);
        schedule();
        return;
      }

      // Com "reduzir movimento" e nada acontecendo, a cena fica parada até o próximo play/rest/resize.
      if (!animating && reducedMotion && !dirty && probeDone) return;
      if (!animating && probeDone && gap < 1000 / IDLE_FPS - 2) { schedule(); return; }
      lastFrame = time;
      if (!animating && !probeDone && display && pendingQuality === null) measure(gap);
      try {
        draw(time / 1000);
      } catch (error) {
        console.error('Gacha: falha ao desenhar a cena', error);
        dead = true;
        if (started) onLost();
        return;
      }
      schedule();
    }

    // Mede só com a cena parada (rolls nunca entram na conta): se a mediana ficar muito acima do
    // intervalo da própria tela, pede um nível a menos e mede de novo; senão, a medição acaba.
    function measure(gap) {
      if (warm > 0) { warm--; return; }
      if (gap <= 0 || gap > 250) return;
      samples.push(gap);
      if (samples.length < PROBE_FRAMES) return;
      const slow = median(samples) > Math.max(20, 1.5 * display);
      samples = [];
      if (slow && quality > 0) pendingQuality = quality - 1;
      else probeDone = true;
    }

    function draw(sec) {
      profile?.begin(renderer);
      const geometryDirty = dirty;
      dirty = false;
      const s = current ? timeline(current.rarity, elapsed(), { reduced: reducedMotion }) : null;
      const crankChanged = hero.setCrank(s ? s.crank : 0);
      const shakeChanged = hero.setShake(s ? s.shake : 0, sec);
      const capsuleChanged = capsule.update(s, palette);
      const geometryChanged = geometryDirty || crankChanged || shakeChanged || capsuleChanged;
      // Luzes e cores continuam animando; as duas luzes com sombra são fixas.
      // Seus mapas só dependem da pose dos objetos que realmente projetam sombra.
      if (geometryChanged) renderer.shadowMap.needsUpdate = true;
      if (current && !current.resting) fireCues();
      const gold = s ? s.gold : 0;
      hemi.color.copy(SKY).lerp(GOLD, gold);
      hemi.intensity = 0.26 + 1.3 * gold;
      const fx = festa.update({ rarity: current?.rarity, t: current && !current.resting ? elapsed() : Infinity, sec, palette, reduced: reducedMotion, rain: quality >= 1 });
      // O confete é sólido. A última atualização também invalida sua remoção;
      // chuva, névoa, neon e cores continuam evoluindo sobre o contato em cache.
      if (geometryChanged || fx.solidChanged) depthRevision++;
      festaBusy = fx.busy;
      shop.update(sec, { reduced: reducedMotion, tint: fx.tint, tintAmount: fx.tintAmount });
      const jitter = reducedMotion ? 0 : fx.shake * 0.035;
      frame(reducedMotion || !s ? 0 : s.camera + 0.35 * gold, jitter * Math.sin(sec * 71), jitter * Math.sin(sec * 53 + 1.3));
      effects.update(reducedMotion ? 0 : sec, gold, { depthRevision });
      composer.render();
      profile?.end(renderer, { quality, width, height });
    }
    if (profile?.manual) profile.render = (sec = performance.now() / 1000) => { if (!dead && sized) draw(sec); };

    // Toca cada som uma vez, só se a linha do tempo acabou de passar por ele (quem entra no meio não ouve tudo de uma vez).
    function fireCues() {
      const t = elapsed();
      for (const c of current.cueList) {
        if (c.at > current.lastT && c.at <= t && t - c.at < 250 && (!reducedMotion || c.name === 'pop')) {
          try { onCue(c.name); } catch (error) { console.warn(error); } // um erro de som não derruba a cena
        }
      }
      current.lastT = t;
    }

    function play({ id, rarity, ts, revealAt }) {
      if (current && !current.resting && current.id === id) return; // o mesmo roll já está tocando (ressincronização)
      const span = (revealAt ?? ts) - ts;
      // Abre exatamente no revealAt do servidor, mesmo se a duração dele for um pouco diferente da nossa.
      const scale = span > 500 ? duration(rarity) / span : 1;
      current = { id, rarity, ts, scale, lastT: -Infinity, resting: false, cueList: cues(rarity) };
      dirty = true;
      wake();
    }

    // Pose de descanso: cápsula aberta e apagada no círculo de luz (ou nenhuma, com null).
    function rest(next) {
      if (next && next.id != null && current?.id === next.id) return; // o roll que está tocando chega sozinho nessa pose
      current = next ? { id: next.id, rarity: next.rarity, resting: true } : null;
      dirty = true;
      wake();
    }

    // Onde a carta nasce, em px dentro do host.
    function cardAnchor() {
      // A câmera pode ainda não ter sido posta (antes do primeiro quadro) ou estar velha (depois de um resize).
      frame(lastDolly);
      camera.updateMatrixWorld();
      if (capsule.shown()) capsule.center(anchor);
      else anchor.set(SPOT.x, 0.15, SPOT.z);
      anchor.project(camera);
      return { x: ((anchor.x + 1) / 2) * width, y: ((1 - anchor.y) / 2) * height };
    }

    // Casou com o roll em cena: corações e o neon piscando ('claim'), ou roubo ('steal').
    function celebrate(kind) {
      festa.celebrate(kind, performance.now() / 1000);
      festaBusy = true;
      dirty = true;
      wake();
    }

    // A máquina do meio vira um botão (o Salão liga quando a pessoa tem rolls e não está girando).
    function hit(event) {
      const box = canvas.getBoundingClientRect();
      pointer.set(((event.clientX - box.left) / box.width) * 2 - 1, -((event.clientY - box.top) / box.height) * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      return raycaster.intersectObject(hero.group, true).length > 0;
    }
    function hover(on) {
      if (on === hovering) return;
      hovering = on;
      canvas.style.cursor = on ? 'pointer' : '';
      canvas.title = on ? 'Girar a máquina' : '';
      hero.setHover(on);
      dirty = true;
      wake();
    }
    function setRollable(on) {
      rollable = !!on && !!onMachine;
      canvas.style.pointerEvents = rollable ? 'auto' : '';
      if (!rollable) hover(false);
    }
    canvas.addEventListener('pointermove', (event) => hover(rollable && hit(event)));
    canvas.addEventListener('pointerleave', () => hover(false));
    canvas.addEventListener('click', (event) => { if (rollable && hit(event)) onMachine(); });

    function setVisible(on) {
      visible = on;
      if (on) { dirty = true; wake(); }
    }

    const onVisibility = () => { if (!document.hidden) { dirty = true; wake(); } };
    const observer = new ResizeObserver(() => resize());

    function dispose() {
      if (disposed) return;
      disposed = dead = true;
      cancelAnimationFrame(raf);
      raf = 0;
      observer.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      const released = new Set();
      const release = (resource) => {
        if (!resource || released.has(resource)) return;
        released.add(resource);
        resource.dispose();
      };
      scene.traverse((o) => {
        release(o.geometry);
        if (o.isInstancedMesh) o.dispose(); // solta os buffers das instâncias
        for (const m of [].concat(o.material || [])) {
          for (const value of Object.values(m)) if (value?.isTexture && value !== environment.texture) release(value);
          release(m);
        }
      });
      shop.dispose();
      festa.dispose();
      environment.dispose();
      renderPass.dispose();
      bloom.dispose();
      effects.dispose();
      outputPass.dispose();
      antialias.dispose();
      composer.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    }
    teardown = dispose;

    document.addEventListener('visibilitychange', onVisibility);
    canvas.addEventListener('webglcontextlost', (event) => {
      event.preventDefault();
      if (dead) return;
      dead = true;
      cancelAnimationFrame(raf);
      raf = 0;
      // Antes de começar, quem avisa é o create() (ele rejeita); depois, é o onLost.
      if (started) onLost();
    });

    host.append(canvas);
    applyQuality();
    observer.observe(host);
    frame(0);
    // Compila os shaders antes do primeiro roll, para a primeira cápsula não engasgar.
    // O compileAsync pode nunca terminar se o contexto for perdido, então há um limite de tempo.
    let timer = 0;
    try {
      await Promise.race([renderer.compileAsync(scene, camera), new Promise((resolve) => { timer = setTimeout(resolve, COMPILE_TIMEOUT); })]);
    } catch { /* compila no primeiro desenho */ }
    clearTimeout(timer);
    if (dead) throw new Error('Contexto WebGL perdido');
    // Aquece também os passes de pós-produção antes de liberar o primeiro roll.
    if (sized) draw(performance.now() / 1000);
    started = true;
    wake();
    return { play, rest, cardAnchor, setVisible, celebrate, setRollable, dispose };
  } catch (error) {
    if (teardown) teardown();
    else { renderer.dispose(); renderer.forceContextLoss(); }
    throw error;
  }
}
