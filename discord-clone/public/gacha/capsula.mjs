// A cápsula do gacha: metade de cima transparente, metade de baixo colorida. Rola da máquina até o
// círculo de luz, balança mudando de cor e abre. Só aplica o estado da linha do tempo; não decide nada.
import * as THREE from 'three';

export const RADIUS = 0.13;
const HOP = 0.26; // altura em metros que vale "1" no hop da linha do tempo
const DARK = new THREE.Color('#2a2a38');

// Feixe de luz: opaco embaixo, sumindo para cima (alphaMap usa o canal verde).
function beamTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = 128;
  const g = canvas.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0, '#000');
  grad.addColorStop(0.6, '#555');
  grad.addColorStop(1, '#fff');
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 128);
  return new THREE.CanvasTexture(canvas);
}

// from: centro da cápsula na portinhola (mundo); to: ponto no chão onde ela para.
export function createCapsule({ from, to }) {
  const R = RADIUS;
  const group = new THREE.Group(); // no chão, no ponto onde a cápsula encosta
  const tilt = new THREE.Group();  // balançada em volta do ponto de contato
  const ball = new THREE.Group();  // centro da esfera; gira ao rolar
  ball.position.y = R;
  group.add(tilt);
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

  // A cápsula ilumina a cena na cor dela.
  const light = new THREE.PointLight('#ffffff', 0, 3, 2);
  light.position.y = R * 1.4;
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
  group.add(dots);

  // Respingo no chão molhado a cada quique.
  const splash = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 40), new THREE.MeshBasicMaterial({ color: '#cfe0ff', transparent: true, depthWrite: false }));
  splash.rotation.x = -Math.PI / 2;
  splash.position.y = 0.004;
  group.add(splash);

  // Feixe de luz que sobe quando a cápsula abre.
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.3, 3.2, 32, 1, true),
    new THREE.MeshBasicMaterial({ alphaMap: beamTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  beam.position.y = R + 1.6;
  group.add(beam);

  const start = new THREE.Vector3(from.x, 0, from.z);
  const end = new THREE.Vector3(to.x, 0, to.z);
  // Voltas inteiras até parar: a emenda termina na horizontal.
  const spins = Math.max(1, Math.round(start.distanceTo(end) / R / (Math.PI * 2))) * Math.PI * 2;
  const color = new THREE.Color();

  // s: estado da linha do tempo (ou null); palette: { common, rare, epic, legendary } em THREE.Color.
  function update(s, palette) {
    group.visible = !!s?.visible;
    if (!group.visible) { light.intensity = 0; return; }
    group.position.lerpVectors(start, end, s.travel);
    group.position.y = s.hop * HOP;
    ball.rotation.x = s.travel * spins;
    tilt.rotation.z = s.tilt;

    // Abrindo: a metade de cima voa para a esquerda e cai virada; a de baixo escorrega um pouco.
    const o = s.open;
    top.position.set(-o * R * 1.7, Math.sin(o * Math.PI) * R * 1.4 - o * R * 0.6, 0);
    top.rotation.z = o * 2.4;
    bottom.position.set(o * R * 0.4, 0, 0);
    bottom.rotation.z = -o * 0.3;

    color.copy(palette[s.colorFrom]).lerp(palette[s.colorTo], s.colorMix);
    shell.color.copy(color);
    shell.emissive.copy(color).multiplyScalar(0.3 * s.glow);
    light.color.copy(color);
    light.intensity = s.glow * 3 + s.beam * 5;

    dots.visible = s.showDots > 0.01;
    dotMaterials.forEach((material, i) => {
      material.color.copy(i < s.dots ? color : DARK);
      if (i < s.dots) material.color.multiplyScalar(2.2);
      material.opacity = s.showDots;
    });

    splash.visible = !!s.splash;
    if (s.splash) {
      splash.scale.setScalar(0.12 + s.splash.at * 0.4 * (0.4 + s.splash.size));
      splash.material.opacity = (1 - s.splash.at) * 0.7 * s.splash.size;
    }

    beam.visible = s.beam > 0.01;
    beam.material.color.copy(color).multiplyScalar(2);
    beam.material.opacity = s.beam * 0.75;
    beam.scale.set(0.6 + 0.4 * s.beam, 1, 0.6 + 0.4 * s.beam);
  }

  // Centro da esfera em coordenadas do mundo (de onde a carta nasce).
  const center = (target) => ball.getWorldPosition(target);
  return { group, update, center };
}
