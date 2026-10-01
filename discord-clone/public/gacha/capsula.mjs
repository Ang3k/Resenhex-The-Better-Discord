// A cápsula do gacha: metade de cima transparente, metade de baixo colorida. Rola da máquina até o
// círculo de luz, balança mudando de cor e abre. Só aplica o estado da linha do tempo; não decide nada.
import * as THREE from 'three';

export const RADIUS = 0.13;
// Altura em metros que vale "1" no hop da linha do tempo. A cápsula sai da portinhola com hop 0.4 (da
// linha do tempo), então o centro dela começa a 0.4 * HOP + RADIUS do chão: HOP, o 0.4 da linha do tempo,
// RADIUS e a altura da portinhola (`exit.y` da máquina) precisam continuar combinando.
const HOP = 0.26;
const DARK = new THREE.Color('#2a2a38');
const DOT_LUMA = 1.6;  // luminância dos pontinhos acesos: passa do limiar do bloom em qualquer cor
const BEAM_LUMA = 1.3; // idem para o feixe
const luma = (c) => Math.max(0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b, 0.15); // linear, sem divisão por ~0

// Feixe de luz: some no topo e também na base (sem anel brilhante no chão). O alphaMap usa o canal verde;
// a linha 0 do canvas é o topo do cilindro.
function beamTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 128;
  const g = canvas.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0, '#000');
  grad.addColorStop(0.85, '#fff');
  grad.addColorStop(1, '#000');
  g.fillStyle = grad;
  g.fillRect(0, 0, 1, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.generateMipmaps = false;
  texture.minFilter = texture.magFilter = THREE.LinearFilter;
  return texture;
}

// from: centro da cápsula na portinhola (mundo); to: ponto no chão onde ela para.
// `group` é a raiz estática da cena (sempre visível, na origem): leva o corpo que se move, o respingo
// parado no chão e a luz. A luz nunca sai da árvore nem é escondida, senão o número de luzes muda e os
// materiais recompilam; sem cápsula, só a intensidade vai a zero. A raiz precisa ficar na origem do mundo,
// sem escala: corpo, respingo e luz usam coordenadas do mundo.
export function createCapsule({ from, to }) {
  const R = RADIUS;
  const group = new THREE.Group();
  const body = new THREE.Group();  // ponto de contato com o chão; anda, quica e leva tudo que acompanha a cápsula
  body.visible = false;            // escondido até o primeiro update, para não aparecer na origem
  const tilt = new THREE.Group();  // balançada em volta do ponto de contato
  const ball = new THREE.Group();  // centro da esfera; gira ao rolar
  ball.position.y = R;
  group.add(body);
  body.add(tilt);
  tilt.add(ball);

  const shell = new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.08, side: THREE.DoubleSide });
  const clear = new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.03, clearcoat: 1, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide });
  const bottom = new THREE.Mesh(new THREE.SphereGeometry(R, 40, 20, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), shell);
  const top = new THREE.Mesh(new THREE.SphereGeometry(R, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2), clear);
  const seam = new THREE.Mesh(new THREE.TorusGeometry(R * 1.01, R * 0.07, 10, 48), shell);
  seam.rotation.x = Math.PI / 2;
  bottom.add(seam);
  bottom.castShadow = seam.castShadow = true;
  ball.add(bottom, top);

  // A cápsula ilumina a cena na cor dela. A luz fica por fora e acima (dentro da casca ela desbotaria as
  // cores) e acompanha o corpo em x/z; o brilho da própria cápsula vem do emissive.
  const light = new THREE.PointLight('#ffffff', 0, 3, 2);
  group.add(light);

  // Três pontinhos acima da cápsula: um acende a cada balançada.
  const dots = new THREE.Group();
  dots.position.y = R * 2 + 0.16;
  const dotMaterials = [0, 1, 2].map((i) => {
    const material = new THREE.MeshBasicMaterial({ color: DARK.clone(), transparent: true });
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.02, 16, 10), material);
    dot.position.x = (i - 1) * 0.07;
    dots.add(dot);
    return material;
  });
  body.add(dots);

  // Respingo no chão molhado a cada quique: fica parado no ponto onde a cápsula bateu, não acompanha o corpo.
  const splash = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 40), new THREE.MeshBasicMaterial({ color: '#cfe0ff', transparent: true, depthWrite: false }));
  splash.rotation.x = -Math.PI / 2;
  splash.visible = false;
  group.add(splash);

  // Feixe de luz que sobe quando a cápsula abre.
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.3, 3.2, 32, 1, true),
    new THREE.MeshBasicMaterial({ alphaMap: beamTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  beam.position.y = R + 1.6;
  body.add(beam);

  const start = new THREE.Vector3(from.x, 0, from.z);
  const end = new THREE.Vector3(to.x, 0, to.z);
  // O caminho vai da portinhola até o círculo de luz, ao longo de +z, por isso a cápsula rola em volta do
  // eixo x. Voltas inteiras até parar: a emenda termina na horizontal.
  const spins = Math.max(1, Math.round(start.distanceTo(end) / R / (Math.PI * 2))) * Math.PI * 2;
  const color = new THREE.Color();

  let shown = false;

  // s: estado da linha do tempo (ou null); palette: { common, rare, epic, legendary } em THREE.Color.
  function update(s, palette) {
    shown = !!s?.visible;
    body.visible = shown;
    splash.visible = false;
    if (!shown) { light.intensity = 0; return; }
    body.position.lerpVectors(start, end, s.travel);
    // Balançar em volta do ponto de contato afundaria a esfera R * (1 - cos): sobe isso de volta.
    body.position.y = s.hop * HOP + R * (1 - Math.cos(s.tilt));
    ball.rotation.x = s.travel * spins;
    tilt.rotation.z = s.tilt;

    // Abrindo: a metade de cima voa para a esquerda e cai virada de cabeça para baixo, pousando no chão
    // (o ponto mais baixo dela termina em y = 0); a de baixo escorrega um pouco.
    const o = s.open;
    top.position.set(-o * R * 1.7, Math.sin(o * Math.PI) * R * 1.4, 0);
    top.rotation.z = o * 2.8;
    bottom.position.set(o * R * 0.4, 0, 0);
    bottom.rotation.z = -o * 0.3;

    color.copy(palette[s.colorFrom]).lerp(palette[s.colorTo], s.colorMix);
    const L = luma(color);
    shell.color.copy(color);
    shell.emissive.copy(color).multiplyScalar(0.25 + 0.5 * s.glow);
    light.color.copy(color);
    light.position.set(body.position.x, body.position.y + R * 2 + 0.2, body.position.z);
    light.intensity = s.glow * 1.5 + s.beam * 2;

    // Pontinhos e feixe são normalizados pela luminância para passarem do limiar do bloom em qualquer cor.
    dots.visible = s.showDots > 0.01;
    dotMaterials.forEach((material, i) => {
      if (i < s.dots) material.color.copy(color).multiplyScalar(DOT_LUMA / L);
      else material.color.copy(DARK);
      material.opacity = s.showDots;
    });

    if (s.splash) {
      splash.visible = true;
      splash.position.lerpVectors(start, end, s.splash.travel);
      splash.position.y = 0.004;
      splash.scale.setScalar(0.12 + s.splash.at * 0.4 * (0.4 + s.splash.size));
      splash.material.opacity = (1 - s.splash.at) * 0.7 * s.splash.size;
    }

    beam.visible = s.beam > 0.01;
    beam.material.color.copy(color).multiplyScalar(BEAM_LUMA / L);
    beam.material.opacity = s.beam * 0.75;
    beam.scale.set(0.6 + 0.4 * s.beam, 1, 0.6 + 0.4 * s.beam);
  }

  // Centro da esfera em coordenadas do mundo (de onde a carta nasce).
  const center = (target) => ball.getWorldPosition(target);
  return { group, update, center, shown: () => shown };
}
