// Bancada local. Instrumenta alocações durante o aquecimento e remove os wrappers
// antes de medir os quadros, para não incluir seu custo no tempo de renderização.
import { create } from '/benchmark-assets/gacha/cena.mjs?profile=manual-v2';
import { duration, AFTER } from '/benchmark-assets/gacha/linha-do-tempo.mjs';

const $ = (selector) => document.querySelector(selector);
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const nextTask = () => new Promise((resolve) => {
  const channel = new MessageChannel();
  channel.port1.onmessage = () => { channel.port1.close(); channel.port2.close(); resolve(); };
  channel.port2.postMessage(0);
});
const percentile = (values, p) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))];
};
const round = (n) => n == null ? null : Math.round(n * 100) / 100;
const heap = () => performance.memory ? { used: performance.memory.usedJSHeapSize, total: performance.memory.totalJSHeapSize } : null;

function trackAllocations(gl) {
  const textures = new Map(), renderbuffers = new Map(), buffers = new Map();
  const originals = new Map(), boundTextures = new Map(), boundBuffers = new Map();
  let unit = gl.TEXTURE0, boundRenderbuffer = null;
  const textureFor = (target) => boundTextures.get(unit + ':' + (target >= gl.TEXTURE_CUBE_MAP_POSITIVE_X && target <= gl.TEXTURE_CUBE_MAP_NEGATIVE_Z ? gl.TEXTURE_CUBE_MAP : target));
  const bpp = (format, type) => {
    const known = new Map([[gl.RGBA8, 4], [gl.SRGB8_ALPHA8, 4], [gl.RGB8, 3], [gl.R8, 1], [gl.RG8, 2],
      [gl.RGBA16F, 8], [gl.RGB16F, 6], [gl.RG16F, 4], [gl.R16F, 2], [gl.RGBA32F, 16], [gl.RG32F, 8], [gl.R32F, 4],
      [gl.DEPTH_COMPONENT16, 2], [gl.DEPTH_COMPONENT24, 4], [gl.DEPTH_COMPONENT32F, 4], [gl.DEPTH24_STENCIL8, 4], [gl.DEPTH32F_STENCIL8, 8]]);
    if (known.has(format)) return known.get(format);
    const channels = format === gl.RGB ? 3 : format === gl.RED ? 1 : format === gl.RG ? 2 : 4;
    return channels * (type === gl.FLOAT ? 4 : type === gl.HALF_FLOAT ? 2 : 1);
  };
  const mipPixels = (width, height, levels) => {
    let total = 0;
    for (let i = 0; i < levels; i++) { total += Math.max(1, width >> i) * Math.max(1, height >> i); }
    return total;
  };
  const hook = (name, inspect) => {
    const original = gl[name]; originals.set(name, original);
    gl[name] = function (...args) { const result = original.apply(this, args); inspect(args, result); return result; };
  };
  hook('activeTexture', ([next]) => { unit = next; });
  hook('bindTexture', ([target, texture]) => boundTextures.set(unit + ':' + target, texture));
  hook('deleteTexture', ([texture]) => textures.delete(texture));
  hook('texStorage2D', ([target, levels, format, width, height]) => {
    const texture = textureFor(target);
    if (texture) textures.set(texture, mipPixels(width, height, levels) * bpp(format) * (target === gl.TEXTURE_CUBE_MAP ? 6 : 1));
  });
  hook('texImage2D', (args) => {
    const [target, level, format] = args;
    const width = typeof args[3] === 'number' && args.length >= 9 ? args[3] : args[5]?.width;
    const height = typeof args[3] === 'number' && args.length >= 9 ? args[4] : args[5]?.height;
    const texture = textureFor(target);
    if (texture && level === 0 && width && height) textures.set(texture, width * height * bpp(format, args.length >= 9 ? args[7] : args[4]));
  });
  hook('bindRenderbuffer', ([, renderbuffer]) => { boundRenderbuffer = renderbuffer; });
  hook('deleteRenderbuffer', ([renderbuffer]) => renderbuffers.delete(renderbuffer));
  hook('renderbufferStorage', ([, format, width, height]) => {
    if (boundRenderbuffer) renderbuffers.set(boundRenderbuffer, width * height * bpp(format));
  });
  hook('renderbufferStorageMultisample', ([, samples, format, width, height]) => {
    if (boundRenderbuffer) renderbuffers.set(boundRenderbuffer, width * height * bpp(format) * samples);
  });
  hook('bindBuffer', ([target, buffer]) => boundBuffers.set(target, buffer));
  hook('deleteBuffer', ([buffer]) => buffers.delete(buffer));
  hook('bufferData', ([target, data]) => {
    const buffer = boundBuffers.get(target);
    if (buffer) buffers.set(buffer, typeof data === 'number' ? data : data?.byteLength || 0);
  });
  function snapshot() {
    const sum = (map) => [...map.values()].reduce((a, b) => a + b, 0);
    const result = { textureBytes: sum(textures), renderbufferBytes: sum(renderbuffers), bufferBytes: sum(buffers), textureCount: textures.size, renderbufferCount: renderbuffers.size, bufferCount: buffers.size };
    result.totalBytes = result.textureBytes + result.renderbufferBytes + result.bufferBytes;
    return result;
  }
  return { snapshot, stop() { for (const [name, original] of originals) gl[name] = original; } };
}

function profiler(config) {
  let gl, timer, allocation, currentQuery, cpuStart, previous = 0, phase = null, data = [], pending = [], hardware;
  let memory = null, initialized = false, phaseStart = 0;
  const durations = {};
  const gpu = [];
  function poll() {
    if (!timer) return;
    if (gl.getParameter(timer.GPU_DISJOINT_EXT)) {
      for (const item of pending) gl.deleteQuery(item.query);
      pending = []; return;
    }
    pending = pending.filter((item) => {
      if (!gl.getQueryParameter(item.query, gl.QUERY_RESULT_AVAILABLE)) return true;
      gpu.push({ phase: item.phase, ms: gl.getQueryParameter(item.query, gl.QUERY_RESULT) / 1e6 });
      gl.deleteQuery(item.query); return false;
    });
  }
  return {
    quality: config.quality, pixelRatio: config.pixelRatio, manual: true,
    init(renderer) {
      gl = renderer.getContext(); timer = gl.getExtension('EXT_disjoint_timer_query_webgl2');
      const debug = gl.getExtension('WEBGL_debug_renderer_info');
      hardware = { renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), vendor: debug ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR), gpuTimer: !!timer, maxSamples: gl.getParameter(gl.MAX_SAMPLES), nativeDpr: window.devicePixelRatio, multisampledRTT:!!gl.getExtension('WEBGL_multisampled_render_to_texture') };
      allocation = trackAllocations(gl);
      renderer.info.autoReset = false;
    },
    begin(renderer) {
      poll(); renderer.info.reset();
      if (phase && timer && pending.length < 60) {
        currentQuery = gl.createQuery(); gl.beginQuery(timer.TIME_ELAPSED_EXT, currentQuery);
      }
      cpuStart = performance.now();
    },
    end(renderer, size) {
      const cpuMs = performance.now() - cpuStart;
      if (currentQuery) { gl.endQuery(timer.TIME_ELAPSED_EXT); pending.push({ query: currentQuery, phase }); currentQuery = null; }
      const now = performance.now();
      if (phase) data.push({ phase, cpuMs, gap: previous ? now - previous : null, calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, heap: heap()?.used ?? null });
      previous = now;
      this.size = { ...size, pixelRatio: renderer.getPixelRatio(), pixelWidth: renderer.domElement.width, pixelHeight: renderer.domElement.height };
      this.info = { ...renderer.info.memory, programs: renderer.info.programs.length };
      initialized = true;
    },
    async stopAllocation() {
      if (!initialized) throw new Error('A cena não desenhou');
      memory = allocation.snapshot(); allocation.stop();
    },
    start(name) { phase = name; previous = 0; phaseStart = performance.now(); },
    finish() { durations[phase] = performance.now() - phaseStart; phase = null; },
    flush() { gl.finish(); poll(); },
    result(name) {
      const samples = data.filter((item) => item.phase === name), gpuSamples = gpu.filter((item) => item.phase === name).map((item) => item.ms);
      const gaps = samples.map((item) => item.gap).filter((item) => item > 0);
      const stats = (values) => ({ p50: round(percentile(values, 0.5)), p95: round(percentile(values, 0.95)) });
      return { phase: name, frames: samples.length, elapsedMs:round(durations[name]), throughputFps:round(samples.length*1000/durations[name]), cpuMs: stats(samples.map((item)=>item.cpuMs)), gpuMs: stats(gpuSamples), gpuSamples: gpuSamples.length, frameMs: stats(gaps), calls: stats(samples.map((item)=>item.calls)), triangles: stats(samples.map((item)=>item.triangles)), jsHeapBytes: stats(samples.map((item)=>item.heap).filter((item)=>item != null)), memory, hardware, size: this.size, rendererInfo: this.info };
    },
    async settle() { await pause(300); poll(); },
    cleanup() { allocation.stop(); for (const item of pending) gl.deleteQuery(item.query); pending = []; },
  };
}

const selectedCase = new URLSearchParams(location.search).get('case');
const cases = [
  { name: 'Salão desktop', width: 628, height: 366, pixelRatio: 1.5, quality: 3, effects: true },
  { name: 'Salão sem pós-efeitos', width: 628, height: 366, pixelRatio: 1.5, quality: 3, effects: false },
  { name: 'Prévia completa', width: 880, height: 480, pixelRatio: 1, quality: 3, effects: true },
  { name: 'Prévia sem pós-efeitos', width: 880, height: 480, pixelRatio: 1, quality: 3, effects: false },
  { name: 'Desktop retina', width: 880, height: 480, pixelRatio: 2, quality: 3, effects: true },
  { name: 'Retina sem pós-efeitos', width: 880, height: 480, pixelRatio: 2, quality: 3, effects: false },
  { name: 'Celular — pixels simulados', width: 356, height: 488, pixelRatio: 1.5, quality: 3, effects: true },
  { name: 'Celular sem pós-efeitos', width: 356, height: 488, pixelRatio: 1.5, quality: 3, effects: false },
  { name: 'Celular — qualidade leve', width: 356, height: 488, pixelRatio: 1.5, quality: 1, effects: true },
  { name: 'Celular — queda de 3 para 1', width: 356, height: 488, pixelRatio: 1.5, quality: 3, effects: true, downgradeTo: 1 },
  { name: 'Prévia sem reflexo', width: 880, height: 480, pixelRatio: 1, quality: 2, effects: true },
].filter((config) => !selectedCase || config.name === selectedCase);
let running = false;
const report = { started: null, scenarios: [], resources: [], visibilityEvents: [], scope: 'Cena 3D isolada, sem fotos, áudios, chat ou catálogo do Salão. MB decimal. WebGL contabiliza alocações solicitadas, não a memória total do driver.', method:'Renderização manual em lotes de 16 quadros com sincronização da GPU entre lotes. CPU mede submissão e atualização da cena; GPU usa EXT_disjoint_timer_query_webgl2. Throughput é capacidade interna sem VSync, não FPS apresentados na tela.' };
document.addEventListener('visibilitychange',()=>report.visibilityEvents.push({at:new Date().toISOString(),state:document.visibilityState}));
const update = () => { $('#data').textContent = JSON.stringify(report, null, 2); };
const resources = () => performance.getEntriesByType('resource').filter((entry)=>/\/benchmark-assets\/(?:vendor\/three|gacha)\//.test(entry.name)).map((entry)=>({ url:new URL(entry.name).pathname, decodedBodySize:entry.decodedBodySize, encodedBodySize:entry.encodedBodySize, transferSize:entry.transferSize, durationMs:round(entry.duration) }));

async function run() {
  if (running) return;
  running = true; $('#run').disabled = true;
  report.started = new Date().toISOString(); report.scenarios = []; $('#results tbody').textContent = '';
  try {
    for (let i = 0; i < cases.length; i++) {
      const config = cases[i], host = $('#host');
      host.style.width = config.width + 'px'; host.style.height = config.height + 'px';
      const profile = profiler(config), baselineHeap = heap(), start = performance.now();
      let clock = 0;
      $('#status').textContent = (i + 1) + '/' + cases.length + ' · ' + config.name + ' · aquecendo';
      const scene = await create(host, { now:()=>clock, cinematic:config.effects, profile });
      const startupMs = performance.now() - start;
      try {
        const batch = async (count, dt, before = ()=>{}) => {
          for(let frame=0;frame<count;frame++) {
            before();profile.render(clock/1000);clock+=dt;
            if(frame%16===15){profile.flush();await nextTask();}
          }
          profile.flush();
        };
        await batch(32,1000/30);
        // Aquece também os materiais e alvos da cápsula aberta.
        scene.play({id:'warm',rarity:'legendary',ts:clock-duration('legendary')+100,revealAt:clock+100});
        await batch(32,1000/60);scene.rest(null);await batch(16,1000/30);
        if(config.downgradeTo!=null){profile.setQuality(config.downgradeTo);await batch(32,1000/30);}
        await profile.stopAllocation();
        const beforeRequests = performance.getEntriesByType('resource').length;
        $('#status').textContent = (i+1)+'/'+cases.length+' · '+config.name+' · loja parada';
        profile.start('idle'); await batch(160,1000/30); profile.finish();
        $('#status').textContent = (i+1)+'/'+cases.length+' · '+config.name+' · rolls lendários';
        let id=0;
        let rollAt=clock;
        const roll=()=>{rollAt=clock;scene.play({id:'roll-'+(++id),rarity:'legendary',ts:clock,revealAt:clock+duration('legendary')});};
        roll(); profile.start('roll');
        await batch(320,1000/60,()=>{if(clock-rollAt>duration('legendary')+AFTER)roll();});profile.finish();
        const result = { config, startupMs:round(startupMs), baselineHeap, phases:[profile.result('idle'),profile.result('roll')], newRequestsDuringSamples:performance.getEntriesByType('resource').length-beforeRequests };
        report.scenarios.push(result);
        report.resources = resources(); update();
        for(const phase of result.phases){const row=document.createElement('tr');row.innerHTML='<td>'+config.name+'</td><td>'+phase.phase+'</td><td>'+phase.throughputFps+'</td><td>'+phase.cpuMs.p50+' / '+phase.cpuMs.p95+' ms</td><td>'+phase.gpuMs.p50+' / '+phase.gpuMs.p95+' ms</td><td>'+round(phase.memory.totalBytes/1e6)+'</td>';$('#results tbody').append(row);}
      } finally { profile.cleanup(); scene.dispose(); }
    }
    report.finished = new Date().toISOString(); $('#status').textContent='Medição concluída'; update();
  } catch(error) { report.error=String(error.stack||error);$('#status').textContent='Falha na medição'; update(); }
  finally { running=false;$('#run').disabled=false; }
}
$('#run').onclick = run;
$('#run').disabled=false; $('#status').textContent='Pronto para medir';
$('#results th:nth-child(3)').textContent='Capacidade interna**';
const note=document.createElement('p');note.textContent='** Quadros processados por segundo sem VSync; não mede os FPS apresentados na tela. A bancada pode trabalhar em segundo plano sem depender do requestAnimationFrame.';$('#results').after(note);
report.resources = resources(); update();
