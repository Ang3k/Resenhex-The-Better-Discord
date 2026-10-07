// A cápsula do gacha: metade de cima transparente, metade de baixo colorida. Rola da máquina até o
// círculo de luz, balança mudando de cor e abre. Só aplica o estado da linha do tempo; não decide nada.
import * as THREE from 'three';
import { freezeStaticTransforms } from './geometria.mjs';

export const RADIUS = 0.13;
const DARK = new THREE.Color('#2a2a38');
const DOT_LUMA = 1.6;  // luminância dos pontinhos acesos: passa do limiar do bloom em qualquer cor
const BEAM_LUMA = 1.15;
const luma = (c) => Math.max(0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b, 0.15); // linear, sem divisão por ~0

// A luz na névoa perde intensidade nas bordas e no alto. Assim a revelação ilumina a loja sem cobri-la.
function beamMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color() }, opacity: { value: 0 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `
      varying vec2 vUv; varying vec3 vNormal; varying vec3 vView;
      void main() {
        vUv = uv; vNormal = normalize(normalMatrix * normal);
        vec4 positionInView = modelViewMatrix * vec4(position, 1.0);
        vView = -positionInView.xyz;
        gl_Position = projectionMatrix * positionInView;
      }
    `,
    fragmentShader: `
      uniform vec3 color; uniform float opacity;
      varying vec2 vUv; varying vec3 vNormal; varying vec3 vView;
      void main() {
        float edge = pow(max(dot(normalize(vNormal), normalize(vView)), 0.0), 1.5);
        float fade = smoothstep(0.0, 0.06, vUv.y) * (1.0 - smoothstep(0.15, 1.0, vUv.y));
        float rays = 0.8 + 0.14 * sin(vUv.x * 75.0) + 0.06 * sin(vUv.x * 133.0);
        gl_FragColor = vec4(color, opacity * edge * fade * rays);
      }
    `,
  });
}

// from: centro da cápsula na portinhola (mundo); to: ponto no chão onde ela para.
// `group` é a raiz estática da cena (sempre visível, na origem): leva o corpo que se move, o respingo
// parado no chão e a luz. A luz nunca sai da árvore nem é escondida, senão o número de luzes muda e os
// materiais recompilam; sem cápsula, só a intensidade vai a zero. A raiz precisa ficar na origem do mundo,
// sem escala: corpo, respingo e luz usam coordenadas do mundo.
export function createCapsule({ from, to }) {
  const R = RADIUS;
  // O hop inicial é 0.4: converter a altura real da portinhola mantém a saída alinhada, inclusive sobre a calçada.
  const hopHeight = Math.max(0, from.y - to.y - R) / 0.4;
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
  const clear = new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.03, clearcoat: 1, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide });
  const bottom = new THREE.Mesh(new THREE.SphereGeometry(R, 64, 32, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), shell);
  const top = new THREE.Mesh(new THREE.SphereGeometry(R, 64, 32, 0, Math.PI * 2, 0, Math.PI / 2), clear);
  const seam = new THREE.Mesh(new THREE.TorusGeometry(R * 1.01, R * 0.07, 12, 64), shell);
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
  const dotGeometry = new THREE.SphereGeometry(0.02, 16, 10);
  const dotMaterials = [0, 1, 2].map((i) => {
    const material = new THREE.MeshBasicMaterial({ color: DARK.clone(), transparent: true });
    const dot = new THREE.Mesh(dotGeometry, material);
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
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.09, 3, 48, 1, true), beamMaterial());
  beam.position.y = R + 1.5;
  body.add(beam);

  const start = new THREE.Vector3(from.x, 0, from.z);
  const end = new THREE.Vector3(to.x, 0, to.z);
  // O caminho vai da portinhola até o círculo de luz, ao longo de +z, por isso a cápsula rola em volta do
  // eixo x. Voltas inteiras até parar: a emenda termina na horizontal.
  const spins = Math.max(1, Math.round(start.distanceTo(end) / R / (Math.PI * 2))) * Math.PI * 2;
  const color = new THREE.Color();
  freezeStaticTransforms(group, [body, tilt, ball, top, bottom, light, splash, beam]);

  let shown = false;
  const previousBody = new THREE.Vector3();
  const previousTop = new THREE.Vector3();
  const previousBottom = new THREE.Vector3();

  // s: estado da linha do tempo (ou null); palette: { common, rare, epic, legendary } em THREE.Color.
  function update(s, palette) {
    shown = !!s?.visible;
    const visibilityChanged = body.visible !== shown;
    body.visible = shown;
    splash.visible = false;
    if (!shown) { light.intensity = 0; return visibilityChanged; }
    previousBody.copy(body.position);
    previousTop.copy(top.position);
    previousBottom.copy(bottom.position);
    const ballAngle = ball.rotation.x;
    const tiltAngle = tilt.rotation.z;
    const topAngle = top.rotation.z;
    const bottomAngle = bottom.rotation.z;
    body.position.lerpVectors(start, end, s.travel);
    // Balançar em volta do ponto de contato afundaria a esfera R * (1 - cos): sobe isso de volta.
    body.position.y = to.y + s.hop * hopHeight + R * (1 - Math.cos(s.tilt));
    ball.rotation.x = s.travel * spins;
    tilt.rotation.z = s.tilt;

    // Abrindo: a metade de cima voa para a esquerda e cai virada de cabeça para baixo, pousando no chão
    // (o ponto mais baixo dela termina em y = 0); a de baixo escorrega um pouco.
    const o = s.open;
    top.position.set(-o * R * 1.7, Math.sin(o * Math.PI) * R * 1.4, 0);
    top.rotation.z = o * 2.8;
    bottom.position.set(o * R * 0.4, 0, 0);
    bottom.rotation.z = -o * 0.3;
    const geometryChanged = visibilityChanged || !previousBody.equals(body.position) ||
      !previousTop.equals(top.position) || !previousBottom.equals(bottom.position) ||
      ballAngle !== ball.rotation.x || tiltAngle !== tilt.rotation.z ||
      topAngle !== top.rotation.z || bottomAngle !== bottom.rotation.z;

    color.copy(palette[s.colorFrom]).lerp(palette[s.colorTo], s.colorMix);
    const L = luma(color);
    shell.color.copy(color);
    shell.emissive.copy(color).multiplyScalar(0.2 + 0.4 * s.glow);
    light.color.copy(color);
    light.position.set(body.position.x, body.position.y + R * 2 + 0.55, body.position.z);
    light.intensity = s.glow * 2 + s.beam * 2;

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
    beam.material.uniforms.color.value.copy(color).multiplyScalar(BEAM_LUMA / L);
    beam.material.uniforms.opacity.value = s.beam * 0.32;
    beam.scale.set(0.6 + 0.4 * s.beam, 1, 0.6 + 0.4 * s.beam);
    return geometryChanged;
  }

  // Centro da esfera em coordenadas do mundo (de onde a carta nasce).
  const center = (target) => ball.getWorldPosition(target);
  return { group, update, center, shown: () => shown };
}
