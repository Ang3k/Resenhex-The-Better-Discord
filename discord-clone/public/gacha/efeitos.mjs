// Acabamento da cena em HDR: sombras de contato, ar iluminado e tratamento de cor.
// O buffer de profundidade é compartilhado; vidro, chuva e reflexos não o preenchem.
import * as THREE from 'three';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { Pass } from 'three/addons/postprocessing/Pass.js';

// Executa o pré-passe só com superfícies sólidas. Mesmo uma falha de renderização
// precisa restaurar a visibilidade e o estado do renderer para a roleta de reserva.
export function withSolidSurfaces(scene, renderer, draw) {
  const hidden = [];
  const shadows = renderer.shadowMap.autoUpdate;
  const override = scene.overrideMaterial;
  scene.traverse((object) => {
    if (!object.visible || object.userData.gachaDepth) return;
    const materials = [].concat(object.material || []);
    if (object.isReflector || object.isPoints || object.isLine || materials.some((m) => m.transparent || m.transmission > 0)) {
      hidden.push(object);
      object.visible = false;
    }
  });
  renderer.shadowMap.autoUpdate = false;
  try { return draw(); }
  finally {
    for (const object of hidden) object.visible = true;
    renderer.shadowMap.autoUpdate = shadows;
    scene.overrideMaterial = override;
  }
}

class ContactPass extends GTAOPass {
  constructor(scene, camera) {
    super(scene, camera, 1, 1);
    this.blendIntensity = 0.72;
    this.updateGtaoMaterial({ radius: 0.22, thickness: 0.7, distanceFallOff: 0.8, scale: 1.2, samples: 16 });
    this.updatePdMaterial({ samples: 8, rings: 2, radius: 5, depthPhi: 1, normalPhi: 4 });
  }
  setSize(width, height) {
    // Metade da resolução limita o custo; a filtragem preserva as bordas das máquinas.
    super.setSize(Math.max(1, Math.round(width / 2)), Math.max(1, Math.round(height / 2)));
  }
  _renderOverride(renderer, material, target, color, alpha) {
    return withSolidSurfaces(this.scene, renderer, () => super._renderOverride(renderer, material, target, color, alpha));
  }
  dispose() {
    super.dispose();
    // Estes dois materiais não são liberados pelo GTAOPass do Three 0.185.1.
    this.gtaoMaterial.dispose();
    this.blendMaterial.dispose();
  }
}

const VERTEX = `varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const DEPTH = `
  uniform sampler2D tDepth;
  uniform mat4 projectionInverse;
  uniform mat4 cameraWorld;
  vec3 viewPosition(vec2 uv) {
    float depth = texture2D(tDepth, uv).x;
    vec4 p = projectionInverse * vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
    return p.xyz / p.w;
  }
`;

const ATMOSPHERE = {
  defines: { LAMP_SHADOW: 0 },
  uniforms: {
    tDiffuse: { value: null }, tDepth: { value: null },
    projectionInverse: { value: new THREE.Matrix4() }, cameraWorld: { value: new THREE.Matrix4() },
    time: { value: 0 }, gold: { value: 0 },
    lampShadow: { value: null }, lampMatrix: { value: new THREE.Matrix4() }, shadowEnabled: { value: false },
  },
  vertexShader: VERTEX,
  fragmentShader: `
    varying vec2 vUv;
    uniform sampler2D tDiffuse;
    uniform float time;
    uniform float gold;
    #if LAMP_SHADOW == 1
    uniform sampler2DShadow lampShadow;
    #endif
    uniform mat4 lampMatrix;
    uniform bool shadowEnabled;
    ${DEPTH}
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec3 origin = cameraWorld[3].xyz;
      vec3 surface = (cameraWorld * vec4(viewPosition(vUv), 1.0)).xyz;
      vec3 ray = surface - origin;
      float distance = min(length(ray), 16.0);
      vec3 direction = normalize(ray);
      float stepSize = distance / 24.0;
      float jitter = hash(gl_FragCoord.xy);
      float transmission = 1.0;
      vec3 scattered = vec3(0.0);
      for (int i = 0; i < 24; i++) {
        vec3 p = origin + direction * (float(i) + jitter) * stepSize;
        // Umidade perto do asfalto. A variação é lenta e não muda o contorno da cena.
        float mist = 0.82 + 0.18 * sin(p.x * 2.1 + p.z * 1.4 + time * 0.12);
        float density = (0.005 + 0.015 * exp(-max(p.y, 0.0) * 0.8)) * mist;
        vec3 incident = vec3(0.045, 0.085, 0.17);
        vec3 lampDelta = p - vec3(0.0, 2.12, 0.3);
        float lampDistance = dot(lampDelta, lampDelta);
        float cone = smoothstep(0.78, 0.94, dot(normalize(lampDelta), normalize(vec3(0.0, -2.12, 1.15))));
        float lit = 1.0;
        #if LAMP_SHADOW == 1
        if (shadowEnabled && cone > 0.0) {
          vec4 projected = lampMatrix * vec4(p, 1.0);
          vec3 uvz = projected.xyz / projected.w;
          if (uvz.x > 0.0 && uvz.x < 1.0 && uvz.y > 0.0 && uvz.y < 1.0 && uvz.z > 0.0 && uvz.z < 1.0) {
            lit = texture(lampShadow, vec3(uvz.xy, uvz.z - 0.0015));
          }
        }
        #endif
        density += cone * 0.022 * exp(-lampDistance * 0.25);
        incident += vec3(7.0, 3.7, 1.25) * cone * lit / (1.0 + lampDistance * 1.3);
        vec3 pink = p - vec3(-0.55, 3.15, 0.05);
        vec3 cyan = p - vec3(0.65, 3.1, 0.05);
        incident += vec3(1.6, 0.12, 0.85) / (1.0 + dot(pink, pink) * 3.0);
        incident += vec3(0.12, 0.85, 1.4) / (1.0 + dot(cyan, cyan) * 3.0);
        vec3 left = p - vec3(-1.55, 1.8, -0.15);
        vec3 right = p - vec3(1.55, 1.8, -0.15);
        incident += vec3(1.9, 0.85, 0.23) * (1.0 / (1.0 + dot(left, left) * 3.0) + 1.0 / (1.0 + dot(right, right) * 3.0));
        vec3 reveal = p - vec3(0.0, 0.35, 1.45);
        incident += gold * vec3(8.0, 3.8, 0.5) / (1.0 + dot(reveal, reveal) * 4.0);
        float opacity = 1.0 - exp(-density * stepSize);
        scattered += transmission * opacity * incident;
        transmission *= 1.0 - opacity;
      }
      gl_FragColor = vec4(scattered, transmission);
    }
  `,
};

const VOLUME_COMPOSITE = {
  uniforms: {
    tDiffuse: { value: null }, volume: { value: null }, tDepth: { value: null },
    texel: { value: new THREE.Vector2(1, 1) },
    projectionInverse: { value: new THREE.Matrix4() }, cameraWorld: { value: new THREE.Matrix4() },
  },
  vertexShader: VERTEX,
  fragmentShader: `
    varying vec2 vUv;
    uniform sampler2D tDiffuse;
    uniform sampler2D volume;
    uniform vec2 texel;
    ${DEPTH}
    void main() {
      float depth = viewPosition(vUv).z;
      vec4 fog = vec4(0.0);
      float total = 0.0;
      // Reconstrução bilateral: suaviza a névoa sem espalhá-la por cima dos contornos.
      for (int y = -1; y <= 1; y++) {
        for (int x = -1; x <= 1; x++) {
          vec2 uv = clamp(vUv + vec2(float(x), float(y)) * texel, texel * 0.5, 1.0 - texel * 0.5);
          float spatial = (x == 0 ? 2.0 : 1.0) * (y == 0 ? 2.0 : 1.0);
          float weight = spatial * exp(-abs(viewPosition(uv).z - depth) * 3.0);
          fog += texture2D(volume, uv) * weight;
          total += weight;
        }
      }
      fog /= max(total, 0.0001);
      gl_FragColor = vec4(texture2D(tDiffuse, vUv).rgb * fog.a + fog.rgb, 1.0);
    }
  `,
};

class AtmospherePass extends Pass {
  constructor(lamp) {
    super();
    this.rays = new ShaderPass(ATMOSPHERE);
    this.composite = new ShaderPass(VOLUME_COMPOSITE);
    this.target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false });
    this.composite.uniforms.volume.value = this.target.texture;
    this.uniforms = this.rays.uniforms;
    this.material = this.rays.material;
    this.lamp = lamp;
    if (lamp) this.uniforms.lampMatrix.value = lamp.shadow.matrix;
  }
  setSize(width, height) {
    const w = Math.max(1, Math.round(width / 2));
    const h = Math.max(1, Math.round(height / 2));
    this.target.setSize(w, h);
    this.composite.uniforms.texel.value.set(1 / w, 1 / h);
  }
  render(renderer, writeBuffer, readBuffer, ...args) {
    if (this.lamp) {
      // RenderPass já atualizou o mapa de sombra, inclusive no primeiro quadro.
      this.uniforms.lampShadow.value = this.lamp.shadow.map?.depthTexture || null;
      this.uniforms.shadowEnabled.value = this.lamp.castShadow && !!this.lamp.shadow.map;
    }
    this.rays.render(renderer, this.target, readBuffer, ...args);
    this.composite.renderToScreen = this.renderToScreen;
    this.composite.render(renderer, writeBuffer, readBuffer, ...args);
  }
  dispose() { this.rays.dispose(); this.composite.dispose(); this.target.dispose(); }
}

const GRADE = {
  uniforms: {
    tDiffuse: { value: null }, tDepth: { value: null }, projectionInverse: { value: new THREE.Matrix4() },
    cameraWorld: { value: new THREE.Matrix4() }, texel: { value: new THREE.Vector2(1, 1) },
    focusDistance: { value: 8 }, depthEnabled: { value: false },
  },
  vertexShader: VERTEX,
  fragmentShader: `
    varying vec2 vUv;
    uniform sampler2D tDiffuse;
    uniform vec2 texel;
    uniform float focusDistance;
    uniform bool depthEnabled;
    ${DEPTH}
    void main() {
      vec3 color = texture2D(tDiffuse, vUv).rgb;
      if (depthEnabled) {
        // Só a rua distante perde um pouco de foco; máquinas, neon e cápsula ficam nítidos.
        float farBlur = smoothstep(focusDistance + 0.9, focusDistance + 3.8, -viewPosition(vUv).z);
        vec2 offset = texel * farBlur * 1.15;
        vec3 blur = texture2D(tDiffuse, vUv + vec2(offset.x, 0.0)).rgb;
        blur += texture2D(tDiffuse, vUv - vec2(offset.x, 0.0)).rgb;
        blur += texture2D(tDiffuse, vUv + vec2(0.0, offset.y)).rgb;
        blur += texture2D(tDiffuse, vUv - vec2(0.0, offset.y)).rgb;
        color = mix(color, blur * 0.25, farBlur * 0.55);
      }
      float luminance = dot(color, vec3(0.2126, 0.7152, 0.0722));
      float shadow = 1.0 - smoothstep(0.04, 0.55, luminance);
      float highlight = smoothstep(0.5, 2.0, luminance);
      color *= mix(vec3(1.0), vec3(0.88, 0.97, 1.10), shadow * 0.55);
      color *= mix(vec3(1.0), vec3(1.07, 1.015, 0.95), highlight * 0.5);
      color = mix(vec3(luminance), color, 1.08);
      vec2 edge = (vUv - 0.5) * vec2(1.0, 0.8);
      color *= 1.0 - smoothstep(0.18, 0.58, length(edge)) * 0.13;
      // O OutputPass aplica ACES e sRGB uma única vez, depois deste tratamento em HDR.
      gl_FragColor = vec4(max(color, vec3(0.0)), 1.0);
    }
  `,
};

export function createEffects(scene, camera, lamp = null) {
  const focus = new THREE.Vector3(0, 1.5, 0);
  const contact = new ContactPass(scene, camera);
  const atmosphere = new AtmospherePass(lamp);
  const grade = new ShaderPass(GRADE);
  for (const pass of [atmosphere, atmosphere.composite, grade]) {
    pass.uniforms.tDepth.value = contact.normalRenderTarget.depthTexture;
    pass.uniforms.projectionInverse.value = camera.projectionMatrixInverse;
    pass.uniforms.cameraWorld.value = camera.matrixWorld;
  }
  grade.setSize = (width, height) => grade.uniforms.texel.value.set(1 / width, 1 / height);
  function setQuality(quality, enabled = true) {
    contact.enabled = atmosphere.enabled = enabled && quality >= 2;
    grade.enabled = enabled;
    grade.uniforms.depthEnabled.value = contact.enabled;
    const shadow = lamp && quality >= 3 ? 1 : 0;
    if (atmosphere.material.defines.LAMP_SHADOW !== shadow) {
      atmosphere.material.defines.LAMP_SHADOW = shadow;
      atmosphere.material.needsUpdate = true;
    }
  }
  function update(time, gold = 0) {
    atmosphere.uniforms.time.value = time;
    atmosphere.uniforms.gold.value = gold;
    grade.uniforms.focusDistance.value = camera.position.distanceTo(focus);
  }
  return { contact, atmosphere, grade, setQuality, update, dispose() { contact.dispose(); atmosphere.dispose(); grade.dispose(); } };
}

// Uma captura estática de luzes coloridas dá reflexos de neon ao metal e ao acrílico
// sem renderizar mapas de ambiente a cada quadro.
export function createEnvironment(renderer) {
  const studio = new THREE.Scene();
  studio.add(new THREE.Mesh(new THREE.SphereGeometry(15, 20, 12), new THREE.MeshBasicMaterial({ color: '#152039', side: THREE.BackSide })));
  for (const [position, size, color, intensity] of [
    [[0, 7, 1], [9, 6], '#8babdf', 0.8],
    [[-4, 2, -3], [3, 3], '#ffb05e', 3.5],
    [[4, 2, -3], [3, 3], '#ffd49a', 3.5],
    [[-2, 4, 1], [3, 1], '#ff55b8', 3],
    [[3, 4, 1], [3, 1], '#43d7ee', 2.4],
    [[0, 2, 6], [5, 3], '#acbdd8', 0.38],
  ]) {
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(...size), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide }));
    panel.position.set(...position);
    panel.lookAt(0, 1, 0);
    studio.add(panel);
  }
  const pmrem = new THREE.PMREMGenerator(renderer);
  try { return pmrem.fromScene(studio, 0.04); }
  finally {
    studio.traverse((object) => { object.geometry?.dispose(); object.material?.dispose(); });
    pmrem.dispose();
  }
}
