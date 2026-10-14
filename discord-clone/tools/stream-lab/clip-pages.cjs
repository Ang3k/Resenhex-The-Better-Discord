// Páginas dos clipes sintéticos. Cada quadro i é uma função pura de i (window.setFrame(i)) e leva no
// canto superior esquerdo um código de barras de 16 bits (índice + verificação) para alinhar quadro a quadro.
// - desktop: editor de código com o app.js do Resenhex; parado, rolagem suave, digitação, troca de aba e terminal.
// - game: cena 3D com terreno de textura fractal, árvores, pedras, partículas, câmera em movimento e HUD.
// - game-hard: o mesmo jogo com textura de ruído branco, quase incompressível (pior caso).
function desktopPage(source, other) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0;padding:0}
body{width:1920px;height:1080px;overflow:hidden;background:#1e1e1e;font:13px Inter,sans-serif;color:#ccc}
#act{position:absolute;left:0;top:0;width:48px;height:1080px;background:#333}
#act i{display:block;width:24px;height:24px;margin:62px 12px 0;border:2px solid #858585;border-radius:4px}
#side{position:absolute;left:48px;top:0;width:280px;height:1058px;background:#252526;padding:10px 0;font-size:13px}
#side div{padding:3px 20px;white-space:nowrap;color:#cccccc}
#side div.sel{background:#37373d}
#tabs{position:absolute;left:328px;top:0;right:0;height:35px;background:#252526;display:flex}
#tabs span{padding:9px 18px;background:#2d2d2d;color:#969696;border-right:1px solid #252526}
#tabs span.on{background:#1e1e1e;color:#fff}
#editor{position:absolute;left:328px;top:35px;width:1450px;height:735px;overflow:hidden;font:14px/19px "DejaVu Sans Mono",monospace}
#code{position:absolute;left:0;top:0;width:100%}
.ln{display:flex;height:19px;white-space:pre}
.ln b{width:64px;text-align:right;padding-right:22px;color:#858585;font-weight:normal;flex:none}
.k{color:#569cd6}.s{color:#ce9178}.c{color:#6a9955}.n{color:#b5cea8}.f{color:#dcdcaa}
#mini{position:absolute;left:1778px;top:35px;width:142px;height:735px;background:#1e1e1e;overflow:hidden}
#mini div{height:3px;margin:1px 6px;background:#3c3c3c}
#cursor{position:absolute;width:2px;height:19px;background:#aeafad}
#term{position:absolute;left:328px;top:770px;right:0;height:288px;background:#1e1e1e;border-top:1px solid #444;padding:8px 20px;font:13px/18px "DejaVu Sans Mono",monospace;color:#cccccc;overflow:hidden}
#status{position:absolute;left:0;bottom:0;width:1920px;height:22px;background:#007acc;color:#fff;padding:3px 10px;font-size:12px}
#bar{position:absolute;left:0;top:0;width:160px;height:40px;display:grid;grid-template-columns:repeat(8,20px);z-index:9}
#bar i{width:20px;height:20px}
</style></head><body>
<div id="act"><i></i><i></i><i></i><i></i><i></i></div>
<div id="side"></div><div id="tabs"></div>
<div id="editor"><div id="code"></div><div id="cursor"></div></div>
<div id="mini"></div><div id="term"></div>
<div id="status">main ✓ · Ln 1, Col 1 · Spaces: 2 · UTF-8 · LF · JavaScript · Resenhex</div>
<div id="bar"></div>
<script>
const FILES = { 'app.js': ${JSON.stringify(source)}, 'server.js': ${JSON.stringify(other)} };
const KW = /\\b(const|let|var|function|return|if|else|for|while|of|in|new|async|await|try|catch|finally|throw|class|typeof|true|false|null|undefined)\\b/g;
const esc = (s) => s.replace(/&/g,'&amp;').replace(/</g,'&lt;');
function hl(line) {
  let s = esc(line);
  if (/^\\s*\\/\\//.test(line)) return '<span class="c">' + s + '</span>';
  s = s.replace(/('[^']*'|"[^"]*"|\`[^\`]*\`)/g, '<span class="s">$1</span>');
  s = s.replace(KW, '<span class="k">$1</span>');
  s = s.replace(/\\b(\\d+)\\b/g, '<span class="n">$1</span>');
  s = s.replace(/\\b([a-zA-Z_]\\w*)(?=\\()/g, '<span class="f">$1</span>');
  return s;
}
const side = document.getElementById('side');
['RESENHEX','  discord-clone','    deploy','    public','      app.js','      call-stage.css','      index.html','      media-policy.js','      media-session.js','      media-sfu.js','    server','      media-sfu.js','    test','    server.js','    package.json','  docs','    GUIA-AGENTES.md','    ROADMAP.md'].forEach((n,i)=>{const d=document.createElement('div');d.textContent=n;if(i===4)d.className='sel';side.append(d);});
const mini = document.getElementById('mini');
for (let i = 0; i < 180; i++) { const d = document.createElement('div'); d.style.width = (20 + (i * 37 % 100)) + 'px'; mini.append(d); }
let current = null;
function renderFile(name, extra = '') {
  const lines = FILES[name].slice();
  if (extra) lines.splice(42, 0, extra);
  document.getElementById('code').innerHTML = lines.map((l, i) => '<div class="ln"><b>' + (i + 1) + '</b>' + hl(l) + '</div>').join('');
  document.getElementById('tabs').innerHTML = Object.keys(FILES).map((f) => '<span class="' + (f === name ? 'on' : '') + '">' + f + '</span>').join('') + '<span>media-session.js</span>';
}
const TYPED = '  const quality = MediaPolicy.screenTarget(preset, demand, level); // typed';
const bar = document.getElementById('bar');
for (let b = 0; b < 16; b++) bar.append(document.createElement('i'));
window.setFrame = (i) => {
  // timeline at 30 fps: 0-59 static, 60-149 smooth scroll, 150-179 static, 180-239 typing,
  // 240 tab switch + fast scroll 240-254, 255-299 static with terminal output.
  const file = i >= 240 ? 'server.js' : 'app.js';
  const typed = i >= 180 && i < 240 ? TYPED.slice(0, Math.min(TYPED.length, (i - 180) * 2)) : i >= 240 ? '' : '';
  const key = file + '|' + typed + '|' + (i >= 240 ? 0 : i >= 180 ? 1 : 2);
  if (key !== current) { renderFile(file, file === 'app.js' && i >= 180 ? typed || ' ' : ''); current = key; }
  let scroll = 0;
  if (file === 'app.js') scroll = Math.min(90, Math.max(0, i - 60)) * 30;
  else scroll = Math.min(15, Math.max(0, i - 240)) * 60;
  document.getElementById('code').style.transform = 'translateY(' + (-scroll) + 'px)';
  const cursorLine = file === 'app.js' && i >= 180 ? 42 : 10;
  const c = document.getElementById('cursor');
  c.style.top = (cursorLine * 19 - scroll) + 'px';
  c.style.left = (64 + 8.43 * (file === 'app.js' && i >= 180 ? typed.length : 0)) + 'px';
  c.style.visibility = Math.floor(i / 15) % 2 ? 'hidden' : 'visible';
  const term = document.getElementById('term');
  const lines = ['$ npm test', '> resenhex@1.4.6 test', '> node --test', ''];
  const extraLines = i >= 255 ? Math.floor((i - 255) / 5) : 0;
  for (let k = 0; k < 6 + extraLines; k++) lines.push('ok ' + (k + 1) + ' - stream quality case ' + (k * 7919 % 1000) + ' (' + (k * 37 % 90 + 3) + ' ms)');
  term.textContent = lines.slice(-15).join('\\n');
  term.style.whiteSpace = 'pre';
  const code = (i & 2047) | (((i * 13 + 7) & 31) << 11);
  [...bar.children].forEach((el, b) => { el.style.background = (code >> b) & 1 ? '#fff' : '#000'; });
};
</script></body></html>`;
}

const GAME = `<!doctype html><html><head><meta charset="utf-8"><style>
*{margin:0;padding:0}body{width:1920px;height:1080px;overflow:hidden;background:#000;font-family:Inter,sans-serif}
canvas{display:block}
#hud{position:absolute;inset:0;pointer-events:none;color:#fff;text-shadow:0 0 3px #000}
#hp{position:absolute;left:40px;bottom:40px;font:700 34px Inter}
#hpbar{position:absolute;left:40px;bottom:90px;width:360px;height:18px;background:#300;border:2px solid #fff}
#hpbar i{display:block;height:100%;background:#e33}
#ammo{position:absolute;right:50px;bottom:40px;font:700 52px Inter}
#feed{position:absolute;right:40px;top:60px;font:600 20px Inter;text-align:right;line-height:30px}
#map{position:absolute;left:40px;top:70px;width:220px;height:220px;border:2px solid #fff;border-radius:50%;overflow:hidden}
#cross{position:absolute;left:950px;top:530px;width:20px;height:20px;border:2px solid #0f0;border-radius:50%}
#bar{position:absolute;left:0;top:0;width:160px;height:40px;display:grid;grid-template-columns:repeat(8,20px);z-index:9}
#bar i{width:20px;height:20px}
</style>
<script type="importmap">{"imports":{"three":"/three.module.js"}}</script></head><body>
<div id="hud"><div id="hpbar"><i></i></div><div id="hp"></div><div id="ammo"></div><div id="feed"></div><canvas id="map" width="220" height="220"></canvas><div id="cross"></div></div>
<div id="bar"></div>
<script type="module">
import * as THREE from 'three';
let seed = 1234567;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
renderer.setPixelRatio(1); renderer.setSize(1920, 1080);
document.body.prepend(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87a8d8);
scene.fog = new THREE.Fog(0x9fb6d8, 60, 420);
const camera = new THREE.PerspectiveCamera(70, 1920 / 1080, 0.5, 600);
scene.add(new THREE.HemisphereLight(0xdde8ff, 0x3a3020, 1.2));
const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(80, 120, 40); scene.add(sun);
// High-frequency ground texture (grass/dirt noise), like real game textures.
function noiseTexture(size, palette, scale) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'), img = g.createImageData(size, size);
  // Fractal value noise (4 octaves), like real terrain/bark textures: structured detail, not white noise.
  const lattice = (n) => { const a = new Float32Array(n * n); for (let i = 0; i < n * n; i++) a[i] = rnd(); return a; };
  const octaves = [8, 16, 32, 64].map((n) => [n, lattice(n)]);
  const sample = (n, a, x, y) => { const fx = x * n, fy = y * n, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
    const at = (i, j) => a[((j % n + n) % n) * n + ((i % n + n) % n)];
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    return (at(x0, y0) * (1 - sx) + at(x0 + 1, y0) * sx) * (1 - sy) + (at(x0, y0 + 1) * (1 - sx) + at(x0 + 1, y0 + 1) * sx) * sy; };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let v = 0, amp = 0.5, tot = 0;
    for (const [n, a] of octaves) { v += sample(n, a, x / size, y / size) * amp; tot += amp; amp *= 0.55; }
    v = v / tot + (rnd() - 0.5) * 0.06 * scale;
    const p = palette[Math.min(palette.length - 1, Math.max(0, Math.floor(v * palette.length)))];
    const o = (y * size + x) * 4; img.data[o] = p[0]; img.data[o + 1] = p[1]; img.data[o + 2] = p[2]; img.data[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const grass = noiseTexture(512, [[38,74,22],[52,96,30],[70,112,40],[96,128,52],[120,104,70],[88,76,50]], 1);
grass.repeat.set(30, 30);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000, 120, 120), new THREE.MeshLambertMaterial({ map: grass }));
ground.rotation.x = -Math.PI / 2;
const pos = ground.geometry.attributes.position;
for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin(pos.getX(i) * 0.02) * 1.2 + Math.cos(pos.getY(i) * 0.03) * 0.8);
ground.geometry.computeVertexNormals();
scene.add(ground);
const bark = noiseTexture(128, [[70,50,30],[90,64,40],[60,42,24],[110,80,50]], 3);
const leaves = noiseTexture(128, [[20,70,20],[30,90,30],[40,110,40],[16,56,16]], 4);
const rock = noiseTexture(128, [[110,110,110],[90,90,95],[130,128,120],[70,70,72]], 2);
const trunkGeo = new THREE.CylinderGeometry(0.5, 0.8, 8, 7), crownGeo = new THREE.ConeGeometry(4, 12, 8), rockGeo = new THREE.DodecahedronGeometry(2.2);
const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshLambertMaterial({ map: bark }), 700);
const crowns = new THREE.InstancedMesh(crownGeo, new THREE.MeshLambertMaterial({ map: leaves }), 700);
const rocks = new THREE.InstancedMesh(rockGeo, new THREE.MeshLambertMaterial({ map: rock }), 500);
const m = new THREE.Matrix4();
for (let i = 0; i < 700; i++) {
  const x = (rnd() - 0.5) * 900, z = (rnd() - 0.5) * 900 - 200, s = 0.7 + rnd() * 0.9;
  if (Math.abs(x) < 10) continue;
  m.compose(new THREE.Vector3(x, 4 * s, z), new THREE.Quaternion(), new THREE.Vector3(s, s, s)); trunks.setMatrixAt(i, m);
  m.compose(new THREE.Vector3(x, 13 * s, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rnd() * 6, 0)), new THREE.Vector3(s, s, s)); crowns.setMatrixAt(i, m);
}
for (let i = 0; i < 500; i++) {
  const x = (rnd() - 0.5) * 900, z = (rnd() - 0.5) * 900 - 200, s = 0.4 + rnd() * 1.4;
  m.compose(new THREE.Vector3(x, s, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rnd() * 3, rnd() * 3, rnd() * 3)), new THREE.Vector3(s, s * 0.7, s)); rocks.setMatrixAt(i, m);
}
scene.add(trunks, crowns, rocks);
// Particles (sparks / dust) moving fast across the view.
const pCount = 900, pGeo = new THREE.BufferGeometry(), pArr = new Float32Array(pCount * 3), pVel = [];
for (let i = 0; i < pCount; i++) { pVel.push([rnd() * 40 - 20, rnd() * 10, rnd() * 40 - 20, rnd() * 300 - 150, rnd() * 20 + 1, rnd() * 300 - 260]); }
pGeo.setAttribute('position', new THREE.BufferAttribute(pArr, 3));
const particles = new THREE.Points(pGeo, new THREE.PointsMaterial({ color: 0xffd27a, size: 0.22 }));
scene.add(particles);
// Enemies: colored boxes strafing.
const enemies = [];
for (let i = 0; i < 12; i++) { const e = new THREE.Mesh(new THREE.BoxGeometry(2, 4, 2), new THREE.MeshLambertMaterial({ color: new THREE.Color().setHSL(rnd(), 0.7, 0.5) })); scene.add(e); enemies.push([e, rnd() * 100 - 50, -40 - rnd() * 200, rnd() * 6]); }
const map = document.getElementById('map').getContext('2d');
const bar = document.getElementById('bar');
for (let b = 0; b < 16; b++) bar.append(document.createElement('i'));
const names = ['Thalison', 'Angel', 'Bruno', 'Lari', 'Gabi', 'Dudu', 'Nanda', 'Leo'];
window.setFrame = (i) => {
  const t = i / 60;
  // Camera: forward run with strafing and yaw sweeps (mouse look), occasional fast flick.
  const z = -t * 22, x = Math.sin(t * 0.9) * 12;
  const flick = t > 3 && t < 3.4 ? (t - 3) * 2.5 * Math.PI : t >= 3.4 ? Math.PI : 0;
  const yaw = Math.sin(t * 0.7) * 0.6 + flick;
  camera.position.set(x, 7 + Math.sin(t * 9) * 0.15, z);
  camera.rotation.set(-0.12 + Math.sin(t * 1.3) * 0.05, yaw, 0, 'YXZ');
  for (let k = 0; k < pCount; k++) { const v = pVel[k]; pArr[k * 3] = x + v[0] + Math.sin(t * 3 + k) * 6; pArr[k * 3 + 1] = (v[1] + t * v[4]) % 14; pArr[k * 3 + 2] = z + v[2] + ((v[3] * t) % 60) - 30; }
  pGeo.attributes.position.needsUpdate = true;
  enemies.forEach(([e, ex, ez, ph]) => e.position.set(x + ex + Math.sin(t * 2 + ph) * 15, 2, z + ez));
  renderer.render(scene, camera);
  const hp = 100 - Math.floor(t * 7) % 60;
  document.getElementById('hp').textContent = hp + ' HP';
  document.querySelector('#hpbar i').style.width = hp + '%';
  document.getElementById('ammo').textContent = (30 - Math.floor(t * 9) % 31) + ' / 120';
  const k = Math.floor(t * 1.5);
  document.getElementById('feed').innerHTML = [0, 1, 2, 3].map((j) => names[(k + j) % 8] + ' ⟶ ' + names[(k + j * 3 + 1) % 8]).join('<br>');
  map.fillStyle = '#1b2a14'; map.fillRect(0, 0, 220, 220);
  map.save(); map.translate(110, 110); map.rotate(-yaw);
  map.fillStyle = '#4a7a2a'; for (let q = 0; q < 60; q++) map.fillRect(((q * 53) % 220) - 110 - x % 20, ((q * 97) % 220) - 110 + (z % 40), 6, 6);
  map.restore(); map.fillStyle = '#fff'; map.beginPath(); map.moveTo(110, 98); map.lineTo(104, 116); map.lineTo(116, 116); map.fill();
  const code = (i & 2047) | (((i * 13 + 7) & 31) << 11);
  [...bar.children].forEach((el, b) => { el.style.background = (code >> b) & 1 ? '#fff' : '#000'; });
};
window.ready = true;
</script></body></html>`;

const GAME_HARD = `<!doctype html><html><head><meta charset="utf-8"><style>
*{margin:0;padding:0}body{width:1920px;height:1080px;overflow:hidden;background:#000;font-family:Inter,sans-serif}
canvas{display:block}
#hud{position:absolute;inset:0;pointer-events:none;color:#fff;text-shadow:0 0 3px #000}
#hp{position:absolute;left:40px;bottom:40px;font:700 34px Inter}
#hpbar{position:absolute;left:40px;bottom:90px;width:360px;height:18px;background:#300;border:2px solid #fff}
#hpbar i{display:block;height:100%;background:#e33}
#ammo{position:absolute;right:50px;bottom:40px;font:700 52px Inter}
#feed{position:absolute;right:40px;top:60px;font:600 20px Inter;text-align:right;line-height:30px}
#map{position:absolute;left:40px;top:70px;width:220px;height:220px;border:2px solid #fff;border-radius:50%;overflow:hidden}
#cross{position:absolute;left:950px;top:530px;width:20px;height:20px;border:2px solid #0f0;border-radius:50%}
#bar{position:absolute;left:0;top:0;width:160px;height:40px;display:grid;grid-template-columns:repeat(8,20px);z-index:9}
#bar i{width:20px;height:20px}
</style>
<script type="importmap">{"imports":{"three":"/three.module.js"}}</script></head><body>
<div id="hud"><div id="hpbar"><i></i></div><div id="hp"></div><div id="ammo"></div><div id="feed"></div><canvas id="map" width="220" height="220"></canvas><div id="cross"></div></div>
<div id="bar"></div>
<script type="module">
import * as THREE from 'three';
let seed = 1234567;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
renderer.setPixelRatio(1); renderer.setSize(1920, 1080);
document.body.prepend(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87a8d8);
scene.fog = new THREE.Fog(0x9fb6d8, 60, 420);
const camera = new THREE.PerspectiveCamera(70, 1920 / 1080, 0.5, 600);
scene.add(new THREE.HemisphereLight(0xdde8ff, 0x3a3020, 1.2));
const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(80, 120, 40); scene.add(sun);
// High-frequency ground texture (grass/dirt noise), like real game textures.
function noiseTexture(size, palette, scale) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'), img = g.createImageData(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const v = (Math.sin(x * 0.31 * scale) * Math.cos(y * 0.27 * scale) + rnd() * 1.6 + Math.sin((x + y) * 0.05)) / 3.2 + 0.5;
    const p = palette[Math.min(palette.length - 1, Math.max(0, Math.floor(v * palette.length)))];
    const o = (y * size + x) * 4; img.data[o] = p[0]; img.data[o + 1] = p[1]; img.data[o + 2] = p[2]; img.data[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const grass = noiseTexture(512, [[38,74,22],[52,96,30],[70,112,40],[96,128,52],[120,104,70],[88,76,50]], 1);
grass.repeat.set(80, 80);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000, 120, 120), new THREE.MeshLambertMaterial({ map: grass }));
ground.rotation.x = -Math.PI / 2;
const pos = ground.geometry.attributes.position;
for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin(pos.getX(i) * 0.02) * 1.2 + Math.cos(pos.getY(i) * 0.03) * 0.8);
ground.geometry.computeVertexNormals();
scene.add(ground);
const bark = noiseTexture(128, [[70,50,30],[90,64,40],[60,42,24],[110,80,50]], 3);
const leaves = noiseTexture(128, [[20,70,20],[30,90,30],[40,110,40],[16,56,16]], 4);
const rock = noiseTexture(128, [[110,110,110],[90,90,95],[130,128,120],[70,70,72]], 2);
const trunkGeo = new THREE.CylinderGeometry(0.5, 0.8, 8, 7), crownGeo = new THREE.ConeGeometry(4, 12, 8), rockGeo = new THREE.DodecahedronGeometry(2.2);
const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshLambertMaterial({ map: bark }), 700);
const crowns = new THREE.InstancedMesh(crownGeo, new THREE.MeshLambertMaterial({ map: leaves }), 700);
const rocks = new THREE.InstancedMesh(rockGeo, new THREE.MeshLambertMaterial({ map: rock }), 500);
const m = new THREE.Matrix4();
for (let i = 0; i < 700; i++) {
  const x = (rnd() - 0.5) * 900, z = (rnd() - 0.5) * 900 - 200, s = 0.7 + rnd() * 0.9;
  if (Math.abs(x) < 10) continue;
  m.compose(new THREE.Vector3(x, 4 * s, z), new THREE.Quaternion(), new THREE.Vector3(s, s, s)); trunks.setMatrixAt(i, m);
  m.compose(new THREE.Vector3(x, 13 * s, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rnd() * 6, 0)), new THREE.Vector3(s, s, s)); crowns.setMatrixAt(i, m);
}
for (let i = 0; i < 500; i++) {
  const x = (rnd() - 0.5) * 900, z = (rnd() - 0.5) * 900 - 200, s = 0.4 + rnd() * 1.4;
  m.compose(new THREE.Vector3(x, s, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rnd() * 3, rnd() * 3, rnd() * 3)), new THREE.Vector3(s, s * 0.7, s)); rocks.setMatrixAt(i, m);
}
scene.add(trunks, crowns, rocks);
// Particles (sparks / dust) moving fast across the view.
const pCount = 900, pGeo = new THREE.BufferGeometry(), pArr = new Float32Array(pCount * 3), pVel = [];
for (let i = 0; i < pCount; i++) { pVel.push([rnd() * 40 - 20, rnd() * 10, rnd() * 40 - 20, rnd() * 300 - 150, rnd() * 20 + 1, rnd() * 300 - 260]); }
pGeo.setAttribute('position', new THREE.BufferAttribute(pArr, 3));
const particles = new THREE.Points(pGeo, new THREE.PointsMaterial({ color: 0xffd27a, size: 0.22 }));
scene.add(particles);
// Enemies: colored boxes strafing.
const enemies = [];
for (let i = 0; i < 12; i++) { const e = new THREE.Mesh(new THREE.BoxGeometry(2, 4, 2), new THREE.MeshLambertMaterial({ color: new THREE.Color().setHSL(rnd(), 0.7, 0.5) })); scene.add(e); enemies.push([e, rnd() * 100 - 50, -40 - rnd() * 200, rnd() * 6]); }
const map = document.getElementById('map').getContext('2d');
const bar = document.getElementById('bar');
for (let b = 0; b < 16; b++) bar.append(document.createElement('i'));
const names = ['Thalison', 'Angel', 'Bruno', 'Lari', 'Gabi', 'Dudu', 'Nanda', 'Leo'];
window.setFrame = (i) => {
  const t = i / 60;
  // Camera: forward run with strafing and yaw sweeps (mouse look), occasional fast flick.
  const z = -t * 22, x = Math.sin(t * 0.9) * 12;
  const flick = t > 3 && t < 3.4 ? (t - 3) * 2.5 * Math.PI : t >= 3.4 ? Math.PI : 0;
  const yaw = Math.sin(t * 0.7) * 0.6 + flick;
  camera.position.set(x, 7 + Math.sin(t * 9) * 0.15, z);
  camera.rotation.set(-0.12 + Math.sin(t * 1.3) * 0.05, yaw, 0, 'YXZ');
  for (let k = 0; k < pCount; k++) { const v = pVel[k]; pArr[k * 3] = x + v[0] + Math.sin(t * 3 + k) * 6; pArr[k * 3 + 1] = (v[1] + t * v[4]) % 14; pArr[k * 3 + 2] = z + v[2] + ((v[3] * t) % 60) - 30; }
  pGeo.attributes.position.needsUpdate = true;
  enemies.forEach(([e, ex, ez, ph]) => e.position.set(x + ex + Math.sin(t * 2 + ph) * 15, 2, z + ez));
  renderer.render(scene, camera);
  const hp = 100 - Math.floor(t * 7) % 60;
  document.getElementById('hp').textContent = hp + ' HP';
  document.querySelector('#hpbar i').style.width = hp + '%';
  document.getElementById('ammo').textContent = (30 - Math.floor(t * 9) % 31) + ' / 120';
  const k = Math.floor(t * 1.5);
  document.getElementById('feed').innerHTML = [0, 1, 2, 3].map((j) => names[(k + j) % 8] + ' ⟶ ' + names[(k + j * 3 + 1) % 8]).join('<br>');
  map.fillStyle = '#1b2a14'; map.fillRect(0, 0, 220, 220);
  map.save(); map.translate(110, 110); map.rotate(-yaw);
  map.fillStyle = '#4a7a2a'; for (let q = 0; q < 60; q++) map.fillRect(((q * 53) % 220) - 110 - x % 20, ((q * 97) % 220) - 110 + (z % 40), 6, 6);
  map.restore(); map.fillStyle = '#fff'; map.beginPath(); map.moveTo(110, 98); map.lineTo(104, 116); map.lineTo(116, 116); map.fill();
  const code = (i & 2047) | (((i * 13 + 7) & 31) << 11);
  [...bar.children].forEach((el, b) => { el.style.background = (code >> b) & 1 ? '#fff' : '#000'; });
};
window.ready = true;
</script></body></html>`;

module.exports = { desktopPage, GAME, GAME_HARD };
