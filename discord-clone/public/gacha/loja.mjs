// O cenário do gacha: a frente de uma lojinha japonesa de rua, à noite, depois da chuva.
// Tudo é geometria simples e texturas desenhadas em <canvas> na hora (nenhuma imagem pronta).
// As máquinas e a cápsula ficam em maquina.mjs e capsula.mjs; as luzes principais em cena.mjs.
import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { createStreet } from './rua.mjs';
import { mergeStaticMeshes, freezeStaticTransforms } from './geometria.mjs';

const FONT = '"Yu Gothic UI", "Yu Gothic", "Hiragino Sans", "Noto Sans JP", "Meiryo", sans-serif';
const NEON = 2.6; // emissão HDR, antes do bloom e do tratamento de cor
const RAIN = 320;
const PETALS = 36;

// As poças refletem luz difusa, com pequenas ondulações, em vez de duplicar a cena como um espelho.
// Comprimir o HDR antes do bloom evita que o metal e a lâmpada virem manchas brancas no asfalto.
const WET_REFLECTION = {
  uniforms: {
    ...Reflector.ReflectorShader.uniforms,
    texel: { value: new THREE.Vector2(1 / 512, 1 / 512) },
    time: { value: 0 },
  },
  vertexShader: `
    uniform mat4 textureMatrix;
    varying vec4 vUv;
    varying vec3 worldPosition;
    #include <common>
    #include <logdepthbuf_pars_vertex>
    void main() {
      vUv = textureMatrix * vec4(position, 1.0);
      worldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      #include <logdepthbuf_vertex>
    }
  `,
  fragmentShader: `
    uniform vec3 color;
    uniform sampler2D tDiffuse;
    uniform vec2 texel;
    uniform float time;
    varying vec4 vUv;
    varying vec3 worldPosition;
    #include <logdepthbuf_pars_fragment>
    void main() {
      #include <logdepthbuf_fragment>
      vec2 uv = vUv.xy / vUv.w;
      vec2 ground = worldPosition.xz;
      // Ondulações no mundo, não na tela: a câmera pode se aproximar sem arrastar a água.
      vec2 wave = vec2(sin(ground.y * 62.0 + ground.x * 17.0 + time * 1.2), cos(ground.x * 48.0 - ground.y * 23.0 + time * 0.8));
      uv += wave * vec2(0.0010, 0.0005);
      float rough = 0.7 + 0.3 * sin(ground.x * 3.7 + sin(ground.y * 2.1));
      vec2 blur = texel * vec2(1.4, 3.2) * rough;
      vec3 reflected = texture2D(tDiffuse, uv).rgb * 0.4;
      reflected += texture2D(tDiffuse, uv + vec2(blur.x, 0.0)).rgb * 0.15;
      reflected += texture2D(tDiffuse, uv - vec2(blur.x, 0.0)).rgb * 0.15;
      reflected += texture2D(tDiffuse, uv + vec2(0.0, blur.y)).rgb * 0.15;
      reflected += texture2D(tDiffuse, uv - vec2(0.0, blur.y)).rgb * 0.15;
      reflected *= color;
      reflected /= 1.0 + reflected * 0.28;
      gl_FragColor = vec4(reflected, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }
  `,
};

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
  return canvasTexture(1024, 896, (g) => {
    g.scale(2, 2);
    const w = 512, h = 448;
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
      g.fillStyle = 'rgba(255,232,176,.55)'; g.fillRect(0, y - 8, w, 2);
      for (let x = 34; x < w - 20; x += 64) {
        g.fillStyle = 'rgba(98,48,20,.2)';
        g.beginPath(); g.ellipse(x + 3, y - 6, 24, 4, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = tints[n++ % tints.length];
        g.beginPath(); g.arc(x, y - 34, 20, 0, Math.PI * 2); g.fill();
        g.beginPath(); g.moveTo(x - 18, y - 46); g.lineTo(x - 12, y - 64); g.lineTo(x - 4, y - 50); g.fill();
        g.beginPath(); g.moveTo(x + 18, y - 46); g.lineTo(x + 12, y - 64); g.lineTo(x + 4, y - 50); g.fill();
        g.fillRect(x - 16, y - 20, 32, 14);
        // Rosto, coleira e moeda dourada: detalhes legíveis nas pequenas figuras da vitrine.
        g.strokeStyle = '#79554a'; g.lineWidth = 1.5;
        for (const dx of [-7, 7]) {
          g.beginPath(); g.arc(x + dx, y - 36, 3.5, Math.PI * 1.08, Math.PI * 1.92); g.stroke();
        }
        g.fillStyle = '#b96961'; g.beginPath(); g.arc(x, y - 30, 2, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#bc665d'; g.fillRect(x - 13, y - 20, 26, 3);
        g.fillStyle = '#e8ba53'; g.beginPath(); g.ellipse(x + 4, y - 11, 6, 8, -0.15, 0, Math.PI * 2); g.fill();
        g.strokeStyle = '#a37532'; g.lineWidth = 1; g.stroke();
        g.fillStyle = '#fff0cf'; g.fillRect(x + 3, y - 16, 1.5, 10);
        g.fillStyle = 'rgba(239,139,127,.38)';
        g.beginPath(); g.ellipse(x - 12, y - 30, 3, 2, 0, 0, Math.PI * 2); g.fill();
        g.beginPath(); g.ellipse(x + 12, y - 30, 3, 2, 0, 0, Math.PI * 2); g.fill();
      }
    }
    g.fillStyle = 'rgba(255,255,255,.12)'; // reflexo no vidro
    g.beginPath(); g.moveTo(w * 0.1, 0); g.lineTo(w * 0.35, 0); g.lineTo(w * 0.1, h); g.lineTo(-w * 0.15, h); g.fill();
  });
}

function stripes() {
  return canvasTexture(512, 128, (g, w, h) => {
    const n = 20; // uma listra por gomo do toldo
    for (let i = 0; i < n; i++) {
      g.fillStyle = i % 2 ? '#dfcfaf' : '#a94250';
      g.fillRect((i * w) / n, 0, w / n + 1, h);
      g.fillStyle = 'rgba(44,23,29,.15)';
      g.fillRect(i * w / n, 0, 1, h);
      g.fillStyle = 'rgba(255,244,218,.18)';
      g.fillRect(i * w / n + 2, 0, 1, h);
    }
    const shade = g.createLinearGradient(0, 0, 0, h);
    shade.addColorStop(0, 'rgba(24,18,25,.22)');
    shade.addColorStop(0.4, 'rgba(24,18,25,0)');
    shade.addColorStop(1, 'rgba(241,231,209,.08)');
    g.fillStyle = shade; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(30,10,10,.08)'; // marcas finas de chuva, sem escurecer cada faixa inteira
    for (let i = 0; i < 45; i++) g.fillRect((i * 97) % w, 0, 1, 12 + ((i * 53) % 45));
    g.strokeStyle = 'rgba(247,227,193,.4)'; g.lineWidth = 0.6; g.setLineDash([2, 2]);
    g.beginPath(); g.moveTo(0, h - 10); g.lineTo(w, h - 10); g.stroke();
  });
}

function plaster() {
  return canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#a8adb0'; g.fillRect(0, 0, w, h);
    let seed = 37;
    const rand = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    for (let i = 0; i < 5000; i++) {
      const v = 110 + rand() * 85;
      g.fillStyle = `rgba(${v},${v},${v},.22)`;
      g.fillRect(rand() * w, rand() * h, 1, 1);
    }
    const stain = g.createLinearGradient(0, 0, 0, h);
    stain.addColorStop(0, 'rgba(20,32,42,.18)'); stain.addColorStop(0.2, 'rgba(20,32,42,0)');
    stain.addColorStop(0.75, 'rgba(20,32,42,.05)'); stain.addColorStop(1, 'rgba(20,32,42,.25)');
    g.fillStyle = stain; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 8; i++) {
      g.fillStyle = 'rgba(32,42,51,.05)';
      g.fillRect(i * 31 + 9, 0, 3, 70 + i * 13);
    }
  });
}

// Sem fonte japonesa no sistema, "ガ" sai igual a um caractere que não existe: aí o neon vira "GACHA".
let japanese; // resultado em cache: a checagem só roda uma vez
function hasJapanese() {
  if (japanese !== undefined) return japanese;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 32;
  const g = canvas.getContext('2d', { willReadFrequently: true });
  const paint = (ch) => {
    g.clearRect(0, 0, 32, 32);
    g.font = '28px ' + FONT;
    g.fillText(ch, 2, 26);
    return g.getImageData(0, 0, 32, 32).data.join(',');
  };
  const ga = paint('ガ');
  japanese = ga !== paint('￿') && ga !== paint(String.fromCodePoint(0x10FFFF));
  return japanese;
}

function neonTexture() {
  const text = hasJapanese() ? 'ガチャ' : 'GACHA';
  return canvasTexture(1024, 288, (g, w, h) => {
    g.lineJoin = 'round';
    g.lineCap = 'round';
    g.strokeStyle = '#3ee8ff'; // moldura ciano
    g.shadowColor = '#3ee8ff';
    g.shadowBlur = 14;
    g.lineWidth = 10;
    g.beginPath(); g.roundRect(24, 24, w - 48, h - 48, 34); g.stroke();
    g.font = `bold 170px ${FONT}`; // letreiro rosa
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.shadowColor = '#ff3fd0';
    g.shadowBlur = 18;
    g.strokeStyle = '#ff4fd8';
    g.lineWidth = 16;
    g.strokeText(text, w * 0.45, h * 0.53);
    g.shadowBlur = 0;
    g.strokeStyle = '#ffe1f8';
    g.lineWidth = 3;
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

// Produtos e seletores dão escala à máquina de bebidas mesmo quando ela fica na borda do palco.
function vendingDisplay() {
  return canvasTexture(256, 448, (g, w, h) => {
    const back = g.createLinearGradient(0, 0, 0, h);
    back.addColorStop(0, '#c0e9ed'); back.addColorStop(1, '#526d88');
    g.fillStyle = back; g.fillRect(0, 0, w, h);
    g.fillStyle = '#17334d'; g.fillRect(0, 0, w, 48);
    g.fillStyle = '#e9faff'; g.font = 'bold 23px sans-serif'; g.textAlign = 'center';
    g.fillText('DRINKS', w / 2, 33);
    const colors = ['#e87883', '#8acaac', '#e7c76e', '#91bee1', '#ad9acb'];
    for (let row = 0; row < 3; row++) {
      const y = 72 + row * 110;
      for (let col = 0; col < 5; col++) {
        const x = 14 + col * 47;
        g.fillStyle = 'rgba(16,30,48,.2)'; g.fillRect(x + 3, y + 3, 30, 62);
        g.fillStyle = colors[(col + row * 2) % colors.length];
        g.beginPath(); g.roundRect(x, y, 28, 58, 5); g.fill();
        g.fillStyle = '#edf4f3'; g.fillRect(x + 3, y + 22, 22, 15);
        g.fillStyle = '#b9c4cc'; g.fillRect(x + 3, y, 22, 4);
        g.fillStyle = 'rgba(255,255,255,.3)'; g.fillRect(x + 4, y + 5, 3, 45);
        g.fillStyle = '#244862'; g.beginPath(); g.roundRect(x + 2, y + 69, 24, 10, 5); g.fill();
        g.fillStyle = '#a5ebc5'; g.fillRect(x + 9, y + 72, 10, 3);
      }
      g.fillStyle = '#34495c'; g.fillRect(0, y + 60, w, 5);
    }
  });
}

function asphalt() {
  return canvasTexture(512, 512, (g, w, h) => {
    g.fillStyle = '#19202a';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 16000; i++) {
      const v = 14 + Math.random() * 45;
      g.fillStyle = `rgba(${v},${v},${v + 8},.5)`;
      g.fillRect(Math.random() * w, Math.random() * h, 1, 1);
    }
    g.strokeStyle = 'rgba(5,9,15,.22)'; g.lineWidth = 1;
    for (let i = 0; i < 6; i++) {
      g.beginPath(); g.moveTo(i * 91, 0);
      for (let y = 24; y < h; y += 24) g.lineTo(i * 91 + Math.sin(y * 0.07 + i) * 14, y);
      g.stroke();
    }
  });
}

function fabricWeave() {
  return canvasTexture(128, 128, (g, w, h) => {
    g.fillStyle = '#888'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < w; i += 4) {
      g.fillStyle = '#aaa'; g.fillRect(i, 0, 1, h); g.fillRect(0, i, w, 1);
      g.fillStyle = '#666'; g.fillRect(i + 2, 0, 1, h); g.fillRect(0, i + 2, w, 1);
    }
  }, { color: false });
}

function shopBanner() {
  const letters = hasJapanese() ? [...'カプセル'] : [...'GACHA'];
  return canvasTexture(128, 640, (g, w, h) => {
    g.fillStyle = '#dbcab0'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#a64842'; g.lineWidth = 4; g.strokeRect(10, 12, w - 20, h - 24);
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = 'bold 78px ' + FONT;
    g.fillStyle = '#8d3435';
    letters.forEach((letter, i) => g.fillText(letter, w / 2, 90 + i * (h - 170) / letters.length));
    g.fillStyle = '#b69877'; g.fillRect(24, h - 72, w - 48, 2);
  });
}

function contactShadow() {
  return canvasTexture(128, 128, (g, w, h) => {
    const gradient = g.createRadialGradient(w / 2, h / 2, w * 0.15, w / 2, h / 2, w * 0.5);
    gradient.addColorStop(0, 'rgba(0,0,0,.8)'); gradient.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gradient; g.fillRect(0, 0, w, h);
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
    for (const [x, y, r] of [[0.22, 0.42, 0.09], [0.78, 0.46, 0.11], [0.35, 0.62, 0.07], [0.68, 0.6, 0.08], [0.12, 0.55, 0.06], [0.88, 0.58, 0.07]]) {
      blob(w * x, h * y, w * r, h * r * 0.35, 0.85);
      blob(w * (x + 0.025), h * (y + 0.015), w * r * 0.7, h * r * 0.25, 0.8);
    }
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

export function createShop({ environment = null } = {}) {
  const group = new THREE.Group();
  const add = (mesh, { cast = false, receive = true } = {}) => { mesh.castShadow = cast; mesh.receiveShadow = receive; group.add(mesh); return mesh; };
  const std = (options) => new THREE.MeshStandardMaterial(options);
  const matrix = new THREE.Matrix4();

  // Parede, porta e verga.
  const wall = planks('#3b2519', '#1e120c', 10);
  wall.wrapS = wall.wrapT = THREE.RepeatWrapping;
  wall.repeat.set(3, 1.5);
  add(new THREE.Mesh(new THREE.BoxGeometry(5.6, 3.8, 0.3), std({ map: wall, bumpMap: wall, bumpScale: 0.012, roughness: 0.85 }))).position.set(0, 1.9, -0.65);
  const doorWood = planks('#4a2d1d', '#24150d', 6);
  add(new THREE.Mesh(new THREE.BoxGeometry(1.3, 2.25, 0.08), std({ map: doorWood, bumpMap: doorWood, bumpScale: 0.009, roughness: 0.7 }))).position.set(0, 1.125, -0.47);
  add(new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.08, 0.1), std({ color: '#2a170e', roughness: 0.8 }))).position.set(0, 2.28, -0.46);
  const beamWood = std({ map: wall, bumpMap: wall, bumpScale: 0.008, color: '#9e8275', roughness: 0.8 });
  for (const x of [-2.74, -0.72, 0.72, 2.74]) add(new THREE.Mesh(new THREE.BoxGeometry(0.11, 2.78, 0.18), beamWood), { cast: true }).position.set(x, 1.39, -0.41);
  add(new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.08, 0.12), beamWood), { cast: true }).position.set(0, 0.13, -0.43);
  add(new THREE.Mesh(new THREE.BoxGeometry(5.68, 0.13, 0.19), beamWood), { cast: true }).position.set(0, 3.7, -0.4);
  add(new THREE.Mesh(new THREE.BoxGeometry(5.8, 0.035, 0.34), std({ color: '#46525d', metalness: 0.5, roughness: 0.55 })), { cast: true }).position.set(0, 3.79, -0.42);
  // Porta com vidro, molduras de madeira e puxador em latão.
  const doorGlass = std({ color: '#18212a', metalness: 0.25, roughness: 0.18 });
  add(new THREE.Mesh(new THREE.PlaneGeometry(0.78, 0.83), doorGlass)).position.set(0, 1.52, -0.424);
  for (const [w, h, x, y] of [[0.85, 0.04, 0, 1.08], [0.85, 0.04, 0, 1.96], [0.04, 0.88, -0.42, 1.52], [0.04, 0.88, 0.42, 1.52]]) {
    add(new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.025), beamWood), { cast: true }).position.set(x, y, -0.412);
  }
  const brass = std({ color: '#b89a66', metalness: 0.8, roughness: 0.35 });
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.23, 12), brass), { cast: true }).position.set(0.49, 1.05, -0.365);
  // Calçada e juntas: as máquinas ficam apoiadas numa base, separada do asfalto molhado.
  const stone = plaster();
  stone.wrapS = stone.wrapT = THREE.RepeatWrapping; stone.repeat.set(6, 1);
  const pavement = std({ color: '#646574', bumpMap: stone, bumpScale: 0.006, roughness: 0.78 });
  add(new THREE.Mesh(new RoundedBoxGeometry(6.1, 0.1, 1.05, 2, 0.018), pavement), { cast: true }).position.set(0, 0.03, -0.24);
  const joints = new THREE.InstancedMesh(new THREE.BoxGeometry(0.009, 0.102, 1.052), std({ color: '#343642', roughness: 0.95 }), 10);
  for (let i = 0; i < 10; i++) { matrix.makeTranslation(-2.7 + i * 0.6, 0.03, -0.24); joints.setMatrixAt(i, matrix); }
  group.add(joints);
  const contacts = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.88, 0.76),
    new THREE.MeshBasicMaterial({ map: contactShadow(), transparent: true, depthWrite: false, opacity: 0.75 }), 5);
  const contact = new THREE.Object3D(); contact.rotation.x = -Math.PI / 2;
  for (const [i, x] of [-1.95, -1.12, 0, 1.12, 1.95].entries()) {
    contact.position.set(x, 0.081, 0); contact.scale.setScalar(x === 0 ? 1.12 : 1); contact.updateMatrix();
    contacts.setMatrixAt(i, contact.matrix);
  }
  group.add(contacts);
  const bannerGeometry = new THREE.PlaneGeometry(0.24, 1.4, 4, 20);
  const bannerPos = bannerGeometry.attributes.position;
  for (let i = 0; i < bannerPos.count; i++) bannerPos.setZ(i, Math.sin(bannerPos.getY(i) * 9) * 0.012);
  bannerGeometry.computeVertexNormals();
  add(new THREE.Mesh(bannerGeometry, std({ map: shopBanner(), roughness: 0.95, side: THREE.DoubleSide })), { cast: true }).position.set(-2.48, 1.45, -0.24);
  const bannerRod = add(new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.3, 8), beamWood));
  bannerRod.rotation.z = Math.PI / 2; bannerRod.position.set(-2.48, 2.15, -0.24);
  // Tubulação e fio do neon discretos na parede, para a loja parecer parte da rua.
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 2.75, 10), std({ color: '#586475', metalness: 0.55, roughness: 0.65 })), { cast: true }).position.set(2.67, 1.4, -0.3);
  const cable = new THREE.CatmullRomCurve3([new THREE.Vector3(1, 3.05, -0.4), new THREE.Vector3(1.13, 2.92, -0.4), new THREE.Vector3(1.16, 2.77, -0.4)]);
  add(new THREE.Mesh(new THREE.TubeGeometry(cable, 10, 0.006, 5, false), std({ color: '#111922', roughness: 0.95 })));

  // Vitrines iluminadas por dentro, com caixilhos e uma luz quente cada.
  const glow = shopWindow();
  const frame = std({ color: '#24140c', roughness: 0.7 });
  for (const x of [-1.55, 1.55]) {
    add(new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.05), std({ map: glow, color: '#241c13', emissiveMap: glow, emissive: '#ffe1b0', emissiveIntensity: 1.45, roughness: 0.95 })), { receive: false }).position.set(x, 1.85, -0.49);
    for (const [w, h, px, py] of [[1.3, 0.06, 0, 0.55], [1.3, 0.06, 0, -0.55], [0.06, 1.16, -0.62, 0], [0.06, 1.16, 0.62, 0], [0.04, 1.1, 0, 0], [1.24, 0.04, 0, 0.05]]) {
      add(new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.06), frame)).position.set(x + px, 1.85 + py, -0.46);
    }
    const light = new THREE.PointLight('#ffbc7c', 2.8, 4, 2);
    light.position.set(x, 1.8, -0.15);
    group.add(light);
  }

  // Toldo listrado, inclinado da parede (atrás, alto) para a frente (baixo), com a borda em gomos.
  const awning = new THREE.PlaneGeometry(4.8, 1, 100, 20);
  const pos = awning.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const t = pos.getY(i) + 0.5; // 0 = borda da frente, 1 = encostado na parede
    const x = pos.getX(i);
    const fold = Math.sin((x + 2.4) / 0.24 * Math.PI) ** 2;
    const sag = Math.sin(Math.PI * t) * (0.065 + fold * 0.025);
    pos.setXYZ(i, x, 2.4 + t * 0.44 - sag, 0.53 - t * 1.03);
  }
  awning.computeVertexNormals();
  const weave = fabricWeave(); weave.wrapS = weave.wrapT = THREE.RepeatWrapping; weave.repeat.set(24, 5);
  add(new THREE.Mesh(awning, std({ map: stripes(), bumpMap: weave, bumpScale: 0.003, roughness: 0.83, side: THREE.DoubleSide })), { cast: true });
  const awningFrame = std({ color: '#323944', metalness: 0.65, roughness: 0.5 });
  const rail = add(new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 4.8, 10), awningFrame), { cast: true });
  rail.rotation.z = Math.PI / 2; rail.position.set(0, 2.395, 0.52);
  const scallopShape = new THREE.Shape();
  scallopShape.moveTo(-0.12, 0); scallopShape.lineTo(0.12, 0); scallopShape.lineTo(0.12, -0.11);
  scallopShape.quadraticCurveTo(0.12, -0.205, 0, -0.205);
  scallopShape.quadraticCurveTo(-0.12, -0.205, -0.12, -0.11); scallopShape.closePath();
  const scallop = new THREE.ExtrudeGeometry(scallopShape, { depth: 0.006, bevelEnabled: false, curveSegments: 8 });
  const redCloth = std({ color: '#a94250', bumpMap: weave, bumpScale: 0.002, roughness: 0.88 });
  const creamCloth = std({ color: '#dfcfaf', bumpMap: weave, bumpScale: 0.002, roughness: 0.88 });
  const red = new THREE.InstancedMesh(scallop, redCloth, 10);
  const cream = new THREE.InstancedMesh(scallop, creamCloth, 10);
  for (let i = 0; i < 20; i++) {
    matrix.makeTranslation(-2.28 + i * 0.24, 2.4, 0.535 + Math.sin(i * 1.9) * 0.008);
    (i % 2 ? cream : red).setMatrixAt(i >> 1, matrix);
  }
  red.castShadow = cream.castShadow = true;
  red.receiveShadow = cream.receiveShadow = true;
  group.add(red, cream);
  // Laterais e braços articulados mostram que o toldo tem profundidade e sustentação.
  for (const x of [-2.395, 2.395]) {
    const side = new THREE.BufferGeometry();
    side.setAttribute('position', new THREE.Float32BufferAttribute([x, 2.84, -0.5, x, 2.4, 0.53, x, 2.3, 0.53], 3));
    side.computeVertexNormals();
    add(new THREE.Mesh(side, std({ color: '#9f424d', roughness: 0.9, side: THREE.DoubleSide })), { cast: true });
  }
  for (const x of [-2.15, 2.15]) {
    const from = new THREE.Vector3(x, 2.19, -0.4), to = new THREE.Vector3(x, 2.38, 0.5);
    const support = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, from.distanceTo(to), 8), awningFrame);
    support.position.copy(from).add(to).multiplyScalar(0.5);
    support.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.sub(from).normalize());
    add(support, { cast: true });
    add(new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.16, 0.05), awningFrame), { cast: true }).position.set(x, 2.2, -0.39);
  }
  add(new THREE.Mesh(new THREE.BoxGeometry(4.92, 0.07, 0.1), awningFrame), { cast: true }).position.set(0, 2.84, -0.48);

  // Letreiro de neon acima do toldo.
  add(new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.58, 0.06), std({ color: '#150e1a', roughness: 0.6 }))).position.set(0, 3.1, -0.47);
  const neonMaterial = new THREE.MeshBasicMaterial({ map: neonTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: new THREE.Color().setScalar(NEON) });
  const neon = new THREE.Mesh(new THREE.PlaneGeometry(1.92, 0.54), neonMaterial);
  neon.position.set(0, 3.1, -0.43);
  group.add(neon);

  // Lâmpada pendurada embaixo do toldo (a luz de verdade é o SpotLight da cena).
  add(new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.14, 28, 1, true), std({ color: '#2f4a3a', roughness: 0.5, metalness: 0.4, side: THREE.DoubleSide }))).position.set(0, 2.2, 0.3);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.045, 20, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 2.2, 1.2) }));
  bulb.position.set(0, 2.14, 0.3);
  group.add(bulb);
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.2), std({ color: '#111111' }))).position.set(0, 2.32, 0.3);

  // Rua ao fundo: prédios escuros, lanternas vermelhas e uma máquina de bebidas.
  group.add(createStreet({ plaster: plaster() }));
  const lantern = std({ color: '#df5d43', emissive: '#fa4d24', emissiveIntensity: 0.65, roughness: 0.8 });
  const lanterns = [[3.3, 2.5, -0.6], [3.85, 2.35, -0.65], [3.55, 2.45, -1.6], [-3.4, 2.6, -1.4]];
  const ribs = new THREE.InstancedMesh(new THREE.TorusGeometry(1, 0.022, 4, 24), std({ color: '#6c2b23', roughness: 0.9 }), lanterns.length * 9);
  const rib = new THREE.Object3D();
  rib.rotation.x = Math.PI / 2;
  let ribIndex = 0;
  const lanternGeometry = new THREE.SphereGeometry(0.13, 16, 12);
  for (const [x, y, z] of lanterns) {
    const mesh = new THREE.Mesh(lanternGeometry, lantern);
    mesh.scale.y = 1.3;
    mesh.position.set(x, y, z);
    group.add(mesh);
    for (let ring = -4; ring <= 4; ring++) {
      const offset = ring * 0.035;
      const radius = 0.132 * Math.sqrt(1 - (offset / 0.174) ** 2);
      rib.position.set(x, y + offset, z); rib.scale.setScalar(radius); rib.updateMatrix();
      ribs.setMatrixAt(ribIndex++, rib.matrix);
    }
  }
  group.add(ribs);
  for (const [x, y, z] of [lanterns[0], lanterns[3]]) {
    const bounce = new THREE.PointLight('#ff9d6b', 0.45, 2.4, 2);
    bounce.position.set(x, y, z + 0.08); group.add(bounce);
  }
  add(new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.6, 0.6), std({ color: '#d9dde8', roughness: 0.4 })), { cast: true }).position.set(3.3, 0.8, -1.0);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 1.0), new THREE.MeshBasicMaterial({ map: vendingDisplay(), color: '#c2e3f5' }));
  screen.position.set(3.3, 0.95, -0.69);
  group.add(screen);
  add(new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.13, 0.025), std({ color: '#14212c', roughness: 0.5 }))).position.set(3.3, 0.27, -0.687);

  // Vaso de hortênsias do lado esquerdo.
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.17, 0.4, 24), std({ color: '#7a4a32', roughness: 0.8 })), { cast: true }).position.set(-2.7, 0.28, 0.15);
  const flowers = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.07, 1), std({ roughness: 0.7 }), 46);
  const tints = ['#8f7be8', '#6f8ff0', '#b48ff0', '#7aa0f5'].map((c) => new THREE.Color(c));
  for (let i = 0; i < 46; i++) {
    const a = i * 2.39996;
    const r = 0.24 * Math.sqrt((i + 0.5) / 46);
    matrix.makeTranslation(-2.7 + Math.cos(a) * r, 0.56 + (0.24 - r) * 0.8 + (i % 3) * 0.03, 0.15 + Math.sin(a) * r);
    flowers.setMatrixAt(i, matrix);
    flowers.setColorAt(i, tints[i % 4]);
  }
  flowers.castShadow = true;
  group.add(flowers);

  // Chão molhado: asfalto com poças e, logo abaixo, um espelho que aparece nas poças.
  const ground = asphalt();
  ground.wrapS = ground.wrapT = THREE.RepeatWrapping;
  ground.repeat.set(7, 5);
  const floorMaterial = new THREE.MeshPhysicalMaterial({ map: ground, bumpMap: ground, bumpScale: 0.014, alphaMap: puddles(), roughness: 0.38, metalness: 0.08, envMap: environment, envMapIntensity: 0.08, clearcoat: 0.55, clearcoatRoughness: 0.22, transparent: true });
  const floor = add(new THREE.Mesh(new THREE.PlaneGeometry(14, 10), floorMaterial));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, 1.5);
  floor.userData.gachaDepth = true; // as poças também são uma superfície no pré-passe de profundidade
  floor.renderOrder = -1; // transparente ordena pela origem (o centro do chão está perto da câmera): sem isso pintaria por cima da chuva, das pétalas, da cápsula e do feixe
  const mirror = new Reflector(new THREE.PlaneGeometry(14, 10), { shader: WET_REFLECTION, textureWidth: 512, textureHeight: 512, color: 0x93a5bd, clipBias: 0.003, multisample: 0 });
  mirror.rotation.x = -Math.PI / 2;
  mirror.position.set(0, -0.002, 1.5);
  group.add(mirror);

  // As poças centrais mantêm seu mapa e reflexo; o asfalto continua fora delas.
  // UVs com a mesma escala evitam esticar a textura ou criar outra cópia na GPU.
  const outerGeometry = new THREE.PlaneGeometry(60, 40);
  const outerUv = outerGeometry.attributes.uv;
  for (let i = 0; i < outerUv.count; i++) {
    outerUv.setXY(i, (outerUv.getX(i) - 0.5) * 60 / 14 + 0.5, (outerUv.getY(i) - 0.5) * 40 / 10 + 0.5);
  }
  const outerFloor = add(new THREE.Mesh(outerGeometry, new THREE.MeshPhysicalMaterial({ map: ground, bumpMap: ground,
    bumpScale: 0.014, roughness: 0.38, metalness: 0.08, envMap: environment, envMapIntensity: 0.08, clearcoat: 0.55, clearcoatRoughness: 0.22 })));
  outerFloor.rotation.x = -Math.PI / 2;
  outerFloor.position.set(0, -0.004, 1.5);

  // Chuva fina (segmentos) e pétalas caindo (pontos).
  const rainPos = new Float32Array(RAIN * 6);
  const drops = Array.from({ length: RAIN }, () => ({ x: (Math.random() - 0.5) * 7, y: Math.random() * 4, z: -0.3 + Math.random() * 4.3, v: 6 + Math.random() * 3 }));
  const rainGeometry = new THREE.BufferGeometry();
  rainGeometry.setAttribute('position', new THREE.BufferAttribute(rainPos, 3).setUsage(THREE.DynamicDrawUsage));
  const rain = new THREE.LineSegments(rainGeometry, new THREE.LineBasicMaterial({ color: '#aab8ff', transparent: true, opacity: 0.18, depthWrite: false }));
  rain.frustumCulled = false;
  group.add(rain);
  const petalPos = new Float32Array(PETALS * 3);
  const petals = Array.from({ length: PETALS }, (_, i) => ({ x: (Math.random() - 0.5) * 6, y: Math.random() * 3.2, z: Math.random() * 3, phase: i }));
  const petalGeometry = new THREE.BufferGeometry();
  petalGeometry.setAttribute('position', new THREE.BufferAttribute(petalPos, 3).setUsage(THREE.DynamicDrawUsage));
  const petalPoints = new THREE.Points(petalGeometry, new THREE.PointsMaterial({ color: '#ffb3d1', size: 0.045, map: softDot(), transparent: true, depthWrite: false }));
  petalPoints.frustumCulled = false;
  group.add(petalPoints);

  let last = 0;
  let flickerAt = 4 + Math.random() * 5;
  const neonTint = new THREE.Color();
  // sec: relógio da cena em segundos. Com reduced, sem chuva, pétalas nem neon piscando.
  // tint/tintAmount: o neon toma a cor da raridade (ou do casamento) por um instante.
  function update(sec, { reduced = false, tint = null, tintAmount = 0 } = {}) {
    const dt = Math.min(0.05, Math.max(0, sec - last));
    last = sec;
    mirror.material.uniforms.time.value = reduced ? 0 : sec;
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
    neonMaterial.color.setScalar(NEON * (tintAmount > 0.05 ? 1 : flicker));
    if (tint && tintAmount > 0) neonMaterial.color.lerp(neonTint.copy(tint).multiplyScalar(NEON * 1.5), Math.min(1, tintAmount));
  }

  // Qualidade: sem reflexo o chão fica opaco e um pouco mais liso.
  function setReflection(on) {
    if (mirror.visible === on) return;
    mirror.visible = on;
    floorMaterial.transparent = on;
    floorMaterial.roughness = on ? 0.38 : 0.3;
    floorMaterial.clearcoat = on ? 0.55 : 0;
    floorMaterial.needsUpdate = true;
  }
  // Tamanho em pixels de verdade do canvas: o espelho usa metade.
  function setSize(width, height) {
    const w = Math.max(1, Math.round(width / 2));
    const h = Math.max(1, Math.round(height / 2));
    mirror.getRenderTarget().setSize(w, h);
    mirror.material.uniforms.texel.value.set(1 / w, 1 / h);
  }

  update(0);
  mergeStaticMeshes(group);
  freezeStaticTransforms(group);
  return { group, update, setReflection, setSize, dispose: () => { mirror.dispose(); red.dispose(); cream.dispose(); flowers.dispose(); } };
}
