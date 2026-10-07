// MSAA resolve a geometria uma única vez; SMAA termina as bordas dos efeitos em HDR.
import * as THREE from 'three';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { CopyShader } from 'three/addons/shaders/CopyShader.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';

export function renderSettings(quality, { width = 1, height = 1, nativeRatio = 1, forcedRatio,
  maxSamples = 4, maxTextureSize = 2048, maxAnisotropy = 1 } = {}) {
  const requested = quality === 3 ? Math.max(2, nativeRatio || 1) : nativeRatio || 1;
  const cap = quality >= 2 ? 2 : quality === 1 ? 1.5 : 1;
  const budget = quality === 3 ? 1800000 : quality === 2 ? 1200000 : 900000;
  // A bancada pode fixar os pixels para comparar duas versões sob a mesma carga.
  const requestedRatio = Number.isFinite(forcedRatio) && forcedRatio > 0 ? forcedRatio :
    Math.min(cap, Math.max(1, requested), Math.sqrt(budget / Math.max(1, width * height)));
  const ratio = Math.min(requestedRatio, maxTextureSize / Math.max(1, width, height));
  return {
    ratio,
    samples: Math.min(Math.max(0, maxSamples), quality >= 2 ? 4 : quality === 1 ? 2 : 0),
    anisotropy: Math.min(maxAnisotropy, quality === 3 ? 8 : quality === 2 ? 4 : quality === 1 ? 2 : 1),
    streetShadow: Math.min(maxTextureSize, quality === 3 ? 2048 : 1024),
    lampShadow: Math.min(maxTextureSize, quality === 3 ? 1024 : 512),
  };
}

// A cena resolve MSAA uma vez. Depois do primeiro efeito, os dois alvos simples
// alternam entre si: nenhum efeito volta a escrever no alvo de geometria.
export class GachaEffectComposer extends EffectComposer {
  constructor(renderer, target, scenePass) {
    super(renderer, target);
    this.scenePass = scenePass;
  }
  render(deltaTime) {
    let firstEffect;
    for (let index = 1; index < this.passes.length; index++) {
      if (this.passes[index].enabled) { firstEffect = this.passes[index]; break; }
    }
    const direct = this.passes[0] === this.scenePass && this.scenePass.enabled &&
      firstEffect?.needsSwap === true;
    this.readBuffer = direct ? this.scenePass.target : this.renderTarget2;
    this.writeBuffer = this.renderTarget1;
    super.render(deltaTime);
  }
  swapBuffers() {
    if (this.readBuffer === this.scenePass.target) {
      this.readBuffer = this.writeBuffer;
      this.writeBuffer = this.renderTarget2;
    } else {
      super.swapBuffers();
    }
  }
}

// EffectComposer convencional ainda pode usar este passe com a cópia de fallback.
export class SceneAntialiasPass extends RenderPass {
  constructor(scene, camera, samples = 4) {
    super(scene, camera);
    this.target = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType, samples, stencilBuffer: false, resolveDepthBuffer: false,
    });
    this.target.texture.name = 'Gacha.sceneMSAA';
    this.copy = null;
  }
  setSamples(samples) {
    if (this.target.samples === samples) return;
    this.target.dispose();
    this.target.samples = samples;
  }
  setSize(width, height) { this.target.setSize(width, height); }
  render(renderer, writeBuffer, readBuffer) {
    const screen = this.renderToScreen;
    const autoClear = renderer.autoClear;
    try {
      this.renderToScreen = false;
      super.render(renderer, writeBuffer, this.target);
      if (!screen && readBuffer === this.target) return;
      if (this.copy === null) {
        this.copy = new ShaderPass(CopyShader);
        this.copy.material.blending = THREE.NoBlending;
        this.copy.material.toneMapped = false;
      }
      // A cópia cobre todo o destino, sem blending nem descarte de fragmentos.
      renderer.autoClear = false;
      this.copy.renderToScreen = screen;
      this.copy.render(renderer, readBuffer, this.target);
    } finally {
      this.renderToScreen = screen;
      renderer.autoClear = autoClear;
    }
  }
  dispose() { this.target.dispose(); this.copy?.dispose(); }
}

export class GachaSMAAPass extends SMAAPass {
  render(renderer, writeBuffer, readBuffer, deltaTime, maskActive) {
    const autoClear = renderer.autoClear;
    try {
      // Edges usa discard: seu clear continua obrigatório. Weights e blend
      // escrevem todos os pixels, sem blending, e dispensam os clears automáticos.
      renderer.autoClear = false;
      this._uniformsEdges.tDiffuse.value = readBuffer.texture;
      this._fsQuad.material = this._materialEdges;
      renderer.setRenderTarget(this._edgesRT);
      if (this.clear) renderer.clear();
      else if (autoClear) renderer.clear(renderer.autoClearColor, renderer.autoClearDepth, renderer.autoClearStencil);
      this._fsQuad.render(renderer);

      this._fsQuad.material = this._materialWeights;
      renderer.setRenderTarget(this._weightsRT);
      if (this.clear) renderer.clear();
      this._fsQuad.render(renderer);

      this._uniformsBlend.tColor.value = readBuffer.texture;
      this._fsQuad.material = this._materialBlend;
      renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
      if (this.clear && !this.renderToScreen) renderer.clear();
      this._fsQuad.render(renderer);
    } finally {
      renderer.autoClear = autoClear;
    }
  }
  setQuality(quality) {
    this.enabled = quality >= 1;
    // Three 0.185.1 expõe os shaders de SMAA nestes campos internos. A versão é
    // fixada no package.json; o preset alto amplia a busca sem borrar toda a imagem.
    const threshold = quality === 3 ? '0.075' : '0.1';
    const steps = quality === 3 ? '16' : '8';
    if (this._materialEdges.defines.SMAA_THRESHOLD !== threshold) {
      this._materialEdges.defines.SMAA_THRESHOLD = threshold;
      this._materialEdges.needsUpdate = true;
    }
    if (this._materialWeights.defines.SMAA_MAX_SEARCH_STEPS !== steps) {
      this._materialWeights.defines.SMAA_MAX_SEARCH_STEPS = steps;
      this._materialWeights.needsUpdate = true;
    }
  }
}
