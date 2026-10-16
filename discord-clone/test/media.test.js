const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { spawn } = require('node:child_process');
const { io } = require('socket.io-client');
const policy = require('../public/media-policy');
const { PNG } = require('pngjs');

test('stream overlay includes resolution, FPS, Mbps and codec for every viewer count', () => {
  const first = { width: 1920, height: 1080, fps: 30, bitrate: 2_000_000, codec: 'VP8' };
  assert.equal(policy.formatVideoStats([first]), '1920×1080 · 30 fps · 2,0 Mbps · VP8');
  assert.equal(policy.formatVideoStats([first, { width: 1280, height: 720, fps: 24, bitrate: 1_000_000, codec: 'VP8' }], true), '720–1080p · 24–30 fps · 3,0 Mbps total · VP8');
  assert.match(policy.formatVideoStats([{ ...first, bitrate: null }]), /Medindo Mbps/);
});

test('upload budget counts actual viewers, reserves voice, and stays within the cap', () => {
  const peers = Array.from({ length: 5 }, (_, i) => ({ sid: i, watching: i < 2 }));
  const rates = policy.allocate(10, peers, { screen: true, camera: true });
  assert.ok([...rates.values()].reduce((sum, rate) => sum + rate.screen + rate.camera, 0) + 5 * 80_000 <= 8_500_000);
  assert.equal(rates.get(4).screen, 0);
  const many = policy.allocate(10, peers.map((p) => ({ ...p, watching: true })), { screen: true, camera: true });
  assert.ok(rates.get(0).screen > many.get(0).screen);
  const low = policy.allocate(1, Array.from({ length: 20 }, (_, sid) => ({ sid, watching: true })), { screen: true, camera: true });
  assert.ok([...low.values()].every((rate) => rate.screen === 0 && rate.camera === 0));
});

test('automatic quality stops at the last step that still lowers the resolution, so it comes back sooner', () => {
  // Economia (720p): 720 → 540 → 360. Um quarto degrau seria 360 de novo e só atrasaria a volta.
  const heights = policy.stepHeights(policy.presets.p720, {});
  assert.deepEqual(heights, [720, 540, 360, 360]);
  let state = {};
  for (let at = 0; at <= 30_000; at += 1500) state = policy.adapt(state, { active: true, strained: true, heights }, at);
  assert.equal(state.level, 2, 'stays on 360p instead of counting phantom steps');
  let back = null;
  for (let at = 31_500; at <= 120_000 && back == null; at += 1500) {
    state = policy.adapt(state, { active: true, strained: false, heights }, at);
    if (state.level === 0) back = at;
  }
  assert.ok(back - 31_500 <= 24_000, `720p again ${back - 31_500} ms after the strain ended (two real steps)`);
  // Uma miniatura de 360p não tem para onde descer.
  const thumb = policy.stepHeights(policy.presets.auto, { maxHeight: 360 });
  state = {};
  for (let at = 0; at <= 30_000; at += 1500) state = policy.adapt(state, { active: true, strained: true, heights: thumb }, at);
  assert.equal(state.level || 0, 0);
  // Sem degraus informados, segue como antes.
  state = {};
  for (let at = 0; at <= 30_000; at += 1500) state = policy.adapt(state, { active: true, strained: true }, at);
  assert.equal(state.level, 3);
});

test('automatic quality steps resolution down after persistent strain and back up only with headroom', () => {
  let state = policy.adapt({}, { active: true, strained: true }, 0);
  state = policy.adapt(state, { active: true, strained: true }, 3999);
  assert.equal(state.level, 0);
  state = policy.adapt(state, { active: true, strained: true }, 4000);
  assert.equal(state.level, 1);
  state = policy.adapt(state, { active: true, strained: true }, 9999);
  assert.equal(state.level, 1, 'a new step waits for another 4 s of strain and 6 s since the last change');
  state = policy.adapt(state, { active: true, strained: true }, 10000);
  assert.equal(state.level, 2);
  state = policy.adapt(state, { active: true, strained: false }, 11000);
  state = policy.adapt(state, { active: true, strained: false, headroom: false }, 30000);
  assert.equal(state.level, 2, 'no step up while the estimate cannot carry the higher step');
  state = policy.adapt(state, { active: true, strained: false }, 30000);
  assert.equal(state.level, 1);
  state = policy.adapt(state, { active: false, strained: true }, 31000);
  assert.equal(state.badSince, null);
  assert.equal(state.level, 1);
  assert.equal(policy.strained({ reason: 'bandwidth' }), true);
  assert.equal(policy.strained({ reason: 'cpu' }), true);
  assert.equal(policy.strained({ reason: 'none', sentFps: 12, sourceFps: 30, targetFps: 30 }), true);
  assert.equal(policy.strained({ reason: 'none', sentFps: 25, sourceFps: 30, targetFps: 30 }), false);
  assert.equal(policy.strained({ reason: 'none', sentFps: 1, sourceFps: 2, targetFps: 30 }), false, 'a static screen is not strain');
  assert.equal(policy.strained({ reason: 'none', sentFps: 3, sourceFps: 60, targetFps: 5 }), false, 'background viewers only expect 5 fps');
  assert.equal(policy.encoding(policy.presets.auto, 2e6, 1).scaleResolutionDownBy, 1.5);
});

// Escada do Movimento numa simulação: o FPS enviado e o tempo de codificação acompanham os pixels do
// degrau atual, como num codificador no limite. capacity = FPS que ele faz em 1080p.
const STEPS_60 = [1080, 900, 720];
function simulateLadder(state, { capacity, encode1080 = 1000 / capacity, available, canProbe = true, sourceFps = 60 }, from, to, trace = []) {
  for (let at = from; at <= to; at += 1500) {
    const pixels = (1080 / STEPS_60[state.level || 0]) ** 2;
    const level = state.level || 0;
    state = policy.ladder(state, { active: true, sentFps: Math.min(sourceFps, capacity * pixels), sourceFps, targetFps: 60, heights: STEPS_60,
      encodeMs: encode1080 / pixels, available, upBitrate: level ? policy.screenTarget(policy.presets.p1080_60, { maxHeight: 1080 }, level - 1).bitrate : 0, canProbe }, at);
    trace.push(STEPS_60[state.level]);
  }
  return state;
}

test('Movimento keeps 1080p down to 25 fps and steps down one step at a time: 900p, then 720p', () => {
  assert.deepEqual(policy.presets.p1080_60.steps, STEPS_60);
  // 59, 50, 30 e 26 fps em 1080p ficam em 1080p: o Full HD vale mais.
  for (const capacity of [59, 50, 30, 26]) assert.equal(simulateLadder({}, { capacity }, 0, 60_000).level, 0, `${capacity} fps`);
  // 22 fps em 1080p: desce para 900p (≈32 fps) quando a média de ~6 s fica abaixo de 25, e fica, porque
  // o 1080p previsto não chega a 35 fps.
  const trace = [];
  let state = simulateLadder({}, { capacity: 22 }, 0, 120_000, trace);
  assert.deepEqual(trace.slice(0, 4), [1080, 1080, 1080, 900], 'four samples (~6 s) averaging below 25 fps');
  assert.equal(state.level, 1);
  assert.ok(!trace.slice(3).includes(1080), 'no futile climbs');
  // 15 fps em 1080p: primeiro 900p (22 fps, ainda pouco), confere, e então 720p.
  const steps = [];
  state = simulateLadder({}, { capacity: 15 }, 0, 12_000, steps);
  assert.equal(STEPS_60[state.level], 720);
  assert.ok(steps.indexOf(900) < steps.indexOf(720), `one step at a time (${steps.join(' ')})`);
  assert.equal(simulateLadder({}, { capacity: 5 }, 0, 60_000).level, 2, '720p is the last step');
  // As duas sequências do teste combinado: a internet oscila e volta (fica), ou cai de vez (troca no
  // quarto valor ruim, ~6 s depois de começar a cair).
  const run = (values) => { let st = {}; return values.map((fps, i) => (st = policy.ladder(st, { active: true, sentFps: fps, sourceFps: 60, targetFps: 60, heights: STEPS_60 }, i * 1500)).level || 0); };
  assert.ok(run([50, 53, 54, 55, 45, 31, 33, 32, 31, 22, 15, 27, 45, 50]).every((level) => level === 0), 'a dip that comes back keeps 1080p');
  assert.deepEqual(run([50, 53, 54, 55, 45, 31, 33, 32, 31, 22, 15, 27, 22]).slice(-2), [0, 1], 'a real drop goes to 900p');
  // Um tranco de uma ou duas amostras não derruba, uma engasgada isolada a 1 fps também não (a mediana a
  // ignora; a média trocaria), e quando o FPS já está voltando não troca.
  assert.ok(run([60, 60, 60, 5, 5, 60, 60, 60]).every((level) => level === 0));
  assert.ok(run([60, 60, 60, 30, 28, 26, 1, 30, 31]).every((level) => level === 0), 'one reading at 1 fps');
  assert.ok(run([60, 60, 60, 30, 20, 18, 26, 40, 50]).every((level) => level === 0), 'already recovering');
  // Engasgos repetidos descem.
  assert.equal(run([60, 60, 60, 30, 1, 28, 1]).at(-1), 1, 'repeated freezes');
  // Quem chama pode segurar a descida (outro espectador acabou de descer); a medição continua.
  const waiting = policy.ladder({ level: 0, fps: [20, 20, 20], changedAt: -Infinity }, { active: true, sentFps: 20, sourceFps: 60, targetFps: 60, heights: STEPS_60, canStepDown: false }, 0);
  assert.deepEqual([waiting.level, waiting.fps], [0, [20, 20, 20, 20]]);
  // Jogo rodando a 22 fps e tela parada não são culpa da resolução.
  assert.equal(simulateLadder({}, { capacity: 22, sourceFps: 22 }, 0, 60_000).level, 0);
  assert.equal(simulateLadder({}, { capacity: 3, sourceFps: 3 }, 0, 60_000).level, 0);
  // Bloco de 540p: não há degrau abaixo dele.
  assert.equal(policy.ladder({ level: 2 }, { active: true, sentFps: 60, sourceFps: 60, targetFps: 60, heights: [540, 540, 540] }, 0).level, 0);
});

test('Movimento climbs back when the upper step fits, and backs off from a failed climb', () => {
  // O jogo ficou leve (codificador de placa de vídeo: 3 ms em 720p) e há banda: 720p → 900p → 1080p em ~15 s.
  const trace = [];
  let state = simulateLadder({ level: 2 }, { capacity: 600, encode1080: 6.75, available: 20e6 }, 0, 40_000, trace);
  assert.equal(state.level, 0);
  assert.ok(trace.indexOf(1080) <= 10, `1080p again within ~15 s (${trace.join(' ')})`);
  // Sem banda para o degrau de cima (7 Mbps em 1080p60), não tenta.
  assert.equal(simulateLadder({ level: 1 }, { capacity: 600, encode1080: 6.75, available: 3e6 }, 0, 60_000).level, 1);
  // Outro espectador já está tentando subir: espera a vez.
  assert.equal(simulateLadder({ level: 1 }, { capacity: 600, encode1080: 6.75, canProbe: false }, 0, 60_000).level, 1);
  // A previsão diz que cabe, mas 1080p só faz 20 fps (por exemplo, a banda real é menor): volta para 900p
  // e espera 15 s para tentar de novo; na segunda falha, 30 s.
  const climbs = [];
  state = { level: 1 };
  for (let at = 0; at <= 120_000; at += 1500) {
    const before = state.level;
    state = policy.ladder(state, { active: true, sentFps: state.level === 0 ? 20 : 60, sourceFps: 60, targetFps: 60, heights: STEPS_60, encodeMs: 6 }, at);
    if (before === 1 && state.level === 0) climbs.push(at);
  }
  assert.equal(state.level, 1);
  assert.ok(climbs.length >= 3, `retries (${climbs.join(', ')})`);
  assert.ok(climbs[1] - climbs[0] < climbs[2] - climbs[1], 'the wait grows after each failure');
  assert.equal(state.failures[0].count, climbs.length);
  // A folga melhorou (codificação 25% mais rápida): tenta de novo sem esperar.
  const waiting = { ...state, fps: [60, 60, 60, 60], changedAt: 112_500, probe: null };
  const retried = policy.ladder(waiting, { active: true, sentFps: 60, sourceFps: 60, targetFps: 60, heights: STEPS_60, encodeMs: 4 }, 121_500);
  assert.equal(retried.level, 0);
  // Firme no degrau de cima por 15 s: a falha é esquecida.
  let kept = retried;
  for (let at = 123_000; at <= 136_500; at += 1500) kept = policy.ladder(kept, { active: true, sentFps: 60, sourceFps: 60, targetFps: 60, heights: STEPS_60, encodeMs: 4 }, at);
  assert.equal(kept.level, 0);
  assert.equal(kept.failures[0], undefined);
  // Parar de enviar limpa a medição, sem mudar o degrau.
  const paused = policy.ladder({ ...kept, level: 2 }, { active: false, heights: STEPS_60 }, 1e6);
  assert.deepEqual([paused.level, paused.fps], [2, []]);
});

test('mobile viewers get a hardware-decodable screen codec unless the preset already offers one', () => {
  const text = ['video/AV1', 'video/VP9', 'video/VP8', 'video/H264'];
  assert.deepEqual(policy.screenCodecs(policy.presets.p1080, []), text, 'text presets prefer AV1, then VP9');
  assert.deepEqual(policy.screenCodecs(policy.presets.p1080, ['video/H264']), ['video/H264', 'video/AV1', 'video/VP9', 'video/VP8']);
  assert.deepEqual(policy.screenCodecs(policy.presets.p1080, ['video/H264', 'video/VP9']), ['video/VP9', 'video/AV1', 'video/VP8', 'video/H264']);
  assert.deepEqual(policy.screenCodecs(policy.presets.auto, ['video/H264']), ['video/H264', 'video/AV1', 'video/VP9', 'video/VP8']);
  assert.deepEqual(policy.screenCodecs(policy.presets.auto, ['video/evil']), policy.presets.auto.codecs);
  assert.deepEqual(policy.screenCodecs(policy.presets.p1080_60, []), ['video/H264', 'video/VP8']);
  // Depois que o processador não deu conta do AV1, o VP8 vem primeiro, inclusive para quem entra depois.
  assert.deepEqual(policy.screenCodecs(policy.presets.auto, [], 'video/VP8'), ['video/VP8', 'video/AV1', 'video/VP9', 'video/H264']);
  assert.deepEqual(policy.screenCodecs(policy.presets.auto, ['video/H264'], 'video/VP8'), ['video/H264', 'video/VP8', 'video/AV1', 'video/VP9']);
  assert.deepEqual(policy.viewerDemand({ width: 844, height: 390, pixelRatio: 3, codecs: ['video/H264'] }), { mode: 'auto', maxHeight: 1080, background: false, codecs: ['video/H264'] });
});

test('viewer demand follows the displayed image, pixel density and selected mode', () => {
  assert.deepEqual(policy.viewerDemand({ width: 640, height: 500 }), { mode: 'auto', maxHeight: 360, background: false });
  assert.equal(policy.viewerDemand({ width: 640, height: 500, pixelRatio: 2 }).maxHeight, 720);
  assert.equal(policy.viewerDemand({ mode: 'source', width: 160, height: 90 }).maxHeight, 1080);
  assert.equal(policy.viewerDemand({ mode: 'economy', width: 1920, height: 1080 }).maxHeight, 720);
  assert.equal(policy.screenTarget(policy.presets.p1080_60, { background: true }).fps, 5);
});

test('allocation gives unused thumbnail bandwidth to larger viewers, reserves screen audio and ignores browser estimates', () => {
  const peers = [{ sid: 'small', watching: true, demand: { maxHeight: 360 } }, { sid: 'large', watching: true, demand: { maxHeight: 1080 } }];
  const rates = policy.allocate(5, peers, { screen: true, screenAudio: true });
  assert.equal(rates.get('small').screen, policy.screenTarget(policy.presets.auto, peers[0].demand).bitrate);
  assert.ok(rates.get('large').screen > 3_000_000);
  assert.ok(rates.get('small').screen + rates.get('large').screen + 2 * 176_000 <= 4_250_000);
  // A estimativa do navegador não limita o codificador: limitar impediria a própria estimativa de subir.
  const estimated = policy.allocate(5, peers.map((p) => ({ ...p, capacity: 300_000 })), { screen: true, screenAudio: true });
  assert.deepEqual(estimated.get('small'), rates.get('small'));
  assert.deepEqual(estimated.get('large'), rates.get('large'));
  const stepped = policy.allocate(5, [{ ...peers[1], level: 1 }], { screen: true });
  assert.equal(stepped.get('large').target.height, 720);
  assert.ok(stepped.get('large').screen < rates.get('large').screen);
  assert.equal(policy.allocate(10, [{ sid: 'idle', watching: false }], { screen: true }).get('idle').screen, 0);
  assert.ok(policy.screenTarget(policy.presets.auto, { maxHeight: 180, background: true }).bitrate >= 150_000);
});

test('screen, camera and transport allocations stay within the shared ceiling and each viewer target', () => {
  for (const upload of [1, 3, 10, 100]) for (const count of [1, 3, 20]) {
    const peers = Array.from({ length: count }, (_, i) => ({ sid: String(i), watching: i % 2 === 0, level: i % 4, demand: { maxHeight: i % 2 ? 360 : 1080 } }));
    const rates = policy.allocate(upload, peers, { screen: true, screenAudio: true, camera: true });
    const reserved = peers.reduce((sum, p) => sum + 80_000 + (p.watching ? 96_000 : 0), 0);
    const total = [...rates.values()].reduce((sum, rate) => sum + rate.screen + rate.camera, 0);
    assert.ok(total <= Math.max(0, upload * 850_000 - reserved));
    for (const p of peers) {
      const rate = rates.get(p.sid);
      assert.ok(rate.screen <= (p.watching ? policy.screenTarget(policy.presets.auto, p.demand, p.level).bitrate : 0));
      assert.ok(rate.camera <= 1_200_000);
    }
  }
});

test('encoding keeps the requested FPS under low bandwidth, scales in fixed steps and never upscales', () => {
  const text = policy.screenEncoding(policy.presets.auto, 400_000, { maxHeight: 1080 }, { height: 1080 });
  const motion = policy.screenEncoding(policy.presets.p1080_60, 400_000, { maxHeight: 1080 }, { height: 1080 });
  assert.equal(text.maxFramerate, 30);
  assert.equal(motion.maxFramerate, 60);
  assert.equal(text.scaleResolutionDownBy, 1);
  assert.equal(text.maxBitrate, 400_000);
  assert.equal(policy.screenEncoding(policy.presets.auto, 2e6, { maxHeight: 1080 }, { height: 1080 }, 1).scaleResolutionDownBy, 1.5);
  assert.equal(policy.screenEncoding(policy.presets.auto, 2e6, { maxHeight: 1080 }, { height: 1080 }, 3).scaleResolutionDownBy, 3);
  assert.equal(policy.screenEncoding(policy.presets.p1080, 2e6, { maxHeight: 1080 }, { height: 1080 }, 2).scaleResolutionDownBy, 1, 'Nitidez keeps its resolution');
  assert.equal(policy.screenEncoding(policy.presets.auto, 4e6, { mode: 'source' }, { height: 720 }).scaleResolutionDownBy, 1);
  assert.deepEqual(policy.screenEncoding(policy.presets.auto, 1e6, { maxHeight: 1080, background: true }, { height: 1080 }), { maxBitrate: 1e6, maxFramerate: 5, scaleResolutionDownBy: 3, active: true });
  assert.equal(policy.screenEncoding(policy.presets.auto, 0, {}, { height: 1080 }).active, false);
});

test('adaptive steps descend from the viewer request through 720/540/360 and only for adaptive presets', () => {
  const heights = (preset, demand) => [0, 1, 2, 3, 4].map((level) => policy.screenTarget(preset, demand, level).height);
  assert.deepEqual(heights(policy.presets.auto, { maxHeight: 1080 }), [1080, 720, 540, 360, 360]);
  // Texto: blocos médios recebem a imagem inteira (reduzir no envio borra as letras); só miniaturas recebem menos.
  assert.deepEqual(heights(policy.presets.auto, { maxHeight: 540 }), [1080, 720, 540, 360, 360]);
  assert.deepEqual(heights(policy.presets.auto, { maxHeight: 720 }), [1080, 720, 540, 360, 360]);
  assert.deepEqual(heights(policy.presets.auto, { maxHeight: 360 }), [360, 360, 360, 360, 360]);
  assert.deepEqual(heights(policy.presets.auto, { maxHeight: 180 }), [180, 180, 180, 180, 180]);
  assert.deepEqual(heights(policy.presets.auto, { maxHeight: 1080, background: true }), [360, 360, 360, 360, 360]);
  assert.deepEqual(heights(policy.presets.auto, { mode: 'economy', maxHeight: 720 }), [720, 540, 360, 360, 360]);
  assert.deepEqual(heights(policy.presets.p720, { maxHeight: 1080 }), [720, 540, 360, 360, 360]);
  assert.deepEqual(heights(policy.presets.p1080, { maxHeight: 1080 }), [1080, 1080, 1080, 1080, 1080]);
  // Movimento: 1080p é o alvo; quando os quadros caem, 900p e depois 720p, o último degrau. Cada bloco segue seu tamanho.
  assert.deepEqual(heights(policy.presets.p1080_60, { maxHeight: 1080 }), [1080, 900, 720, 720, 720]);
  assert.deepEqual(heights(policy.presets.p1080_60, { maxHeight: 720 }), [720, 720, 720, 720, 720]);
  assert.deepEqual(heights(policy.presets.p1080_60, { maxHeight: 540 }), [540, 540, 540, 540, 540]);
  assert.equal(policy.presets.p1080_60.degradation, 'maintain-framerate-and-resolution');
  for (const level of [0, 1, 2, 3]) assert.equal(policy.screenTarget(policy.presets.auto, { maxHeight: 1080 }, level).fps, 30);
  for (const level of [0, 1, 2, 3]) assert.equal(policy.screenTarget(policy.presets.p1080_60, { maxHeight: 1080 }, level).fps, 60);
});

test('a CPU-bound AV1/VP9 encoder falls back to VP8 only after 5 s of sustained limitation', () => {
  assert.equal(policy.cpuFallback('video/AV1'), 'video/VP8');
  assert.equal(policy.cpuFallback('video/VP9'), 'video/VP8');
  assert.equal(policy.cpuFallback('video/VP8'), null);
  assert.equal(policy.cpuFallback('video/H264'), null);
  let cpu = policy.cpuStrain({}, { limited: true, codec: 'video/AV1' }, 1000);
  assert.deepEqual(cpu, { since: 1000, fallback: false });
  cpu = policy.cpuStrain(cpu, { limited: true, codec: 'video/AV1' }, 5999);
  assert.equal(cpu.fallback, false);
  cpu = policy.cpuStrain(cpu, { limited: true, codec: 'video/AV1' }, 6000);
  assert.equal(cpu.fallback, true);
  assert.deepEqual(policy.cpuStrain(cpu, { limited: false, codec: 'video/AV1' }, 6500), { since: null, fallback: false }, 'a short spike resets the timer');
  assert.deepEqual(policy.cpuStrain({}, { limited: true, codec: 'video/VP8' }, 0), { since: null, fallback: false }, 'nothing lighter than VP8');
});

test('encoder load separates light text from games and videos with the measured numbers', () => {
  // Medições do laboratório (Electron 44, 1080p30): texto em AV1 usa ~22% da taxa e ~10 ms por quadro;
  // jogo em AV1 levava 30–40 ms por quadro; jogo em VP8 usava toda a taxa com ~16 ms por quadro.
  assert.deepEqual(policy.encoderLoad({ reason: 'none', encodeMs: 10, fps: 30, bitrate: 870_000, target: 4_000_000 }), { cpu: false, heavy: false });
  assert.deepEqual(policy.encoderLoad({ reason: 'none', encodeMs: 38, fps: 30, bitrate: 3_300_000, target: 4_000_000 }), { cpu: true, heavy: true });
  assert.deepEqual(policy.encoderLoad({ reason: 'none', encodeMs: 16, fps: 30, bitrate: 3_950_000, target: 4_000_000 }), { cpu: false, heavy: true });
  assert.deepEqual(policy.encoderLoad({ reason: 'cpu', encodeMs: 12, fps: 30 }), { cpu: true, heavy: true });
  assert.equal(policy.encoderLoad({ reason: 'none', encodeMs: 30, fps: 5 }).cpu, false, 'background viewers only need 5 fps');
  assert.equal(policy.encoderLoad({ reason: 'none', bitrate: null, target: 4e6 }).heavy, false, 'no sample yet');
  // Conteúdo pesado num perfil de texto: cada bloco volta a receber o seu tamanho.
  const motion = { ...policy.presets.auto, motion: true };
  assert.deepEqual([0, 1, 2].map((level) => policy.screenTarget(motion, { maxHeight: 540 }, level).height), [540, 360, 360]);
  assert.equal(policy.screenTarget(motion, { maxHeight: 1080 }).height, 1080);
  assert.deepEqual(policy.sustained({}, true, 0), { since: 0, reached: false });
  assert.deepEqual(policy.sustained({ since: 0 }, true, 5000), { since: 0, reached: true });
});

// Trecho de SDP como o Chrome gera: áudio, câmera (mid 1) e tela (mid 2), com H.264 42001f/42e01f, VP8 e RTX.
const answerSdp = ['v=0', 'o=- 1 2 IN IP4 127.0.0.1', 's=-', 't=0 0',
  'm=audio 9 UDP/TLS/RTP/SAVPF 111', 'a=mid:0', 'a=rtpmap:111 opus/48000/2', 'a=fmtp:111 minptime=10;useinbandfec=1',
  ...['1', '2'].flatMap((mid) => [`m=video 9 UDP/TLS/RTP/SAVPF 108 109 102 103 96 97`, `a=mid:${mid}`,
    'a=rtpmap:108 H264/90000', 'a=fmtp:108 level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42e01f', 'a=rtpmap:109 rtx/90000', 'a=fmtp:109 apt=108',
    'a=rtpmap:102 H264/90000', 'a=fmtp:102 level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42001f', 'a=rtpmap:103 rtx/90000', 'a=fmtp:103 apt=102',
    'a=rtpmap:96 VP8/90000', 'a=rtpmap:97 rtx/90000', 'a=fmtp:97 apt=96']), ''].join('\r\n');

test('the start bitrate goes only on the H.264 payloads of the chosen video sections, once', () => {
  const sdp = policy.startBitrate(answerSdp, { 2: 5400 });
  const sections = sdp.split('\r\nm=');
  assert.equal(sections[0] + sections[1] + sections[2], answerSdp.split('\r\nm=').slice(0, 3).join(''), 'session, audio and camera untouched');
  assert.match(sections[3], /a=fmtp:108 [^\r]*profile-level-id=42e01f;x-google-start-bitrate=5400\r\n/);
  assert.match(sections[3], /a=fmtp:102 [^\r]*profile-level-id=42001f;x-google-start-bitrate=5400\r\n/);
  assert.equal((sections[3].match(/x-google-start-bitrate/g) || []).length, 2, 'not on RTX, not on VP8');
  assert.equal(policy.startBitrate(sdp, { 2: 5400 }), sdp, 'idempotent');
  assert.equal(policy.startBitrate(answerSdp, {}), answerSdp);
  assert.equal(policy.startBitrate(answerSdp.replace(/\r\n/g, '\n'), { 2: 5400 }), sdp.replace(/\r\n/g, '\n'));
});

// Oferta de quem transmite como o Chrome gera: voz (mid 0), tela (mid 1) e som da tela (mid 2), com RED.
const shareOffer = ['v=0', 'o=- 1 2 IN IP4 127.0.0.1', 's=-', 't=0 0',
  'm=audio 9 UDP/TLS/RTP/SAVPF 63 111', 'a=mid:0', 'a=msid:mic-stream mic-track', 'a=rtpmap:63 red/48000/2', 'a=fmtp:63 111/111', 'a=rtpmap:111 opus/48000/2', 'a=fmtp:111 minptime=10;useinbandfec=1',
  'm=video 9 UDP/TLS/RTP/SAVPF 96', 'a=mid:1', 'a=msid:screen-stream video-track', 'a=rtpmap:96 VP8/90000',
  'm=audio 9 UDP/TLS/RTP/SAVPF 63 111', 'a=mid:2', 'a=msid:screen-stream audio-track', 'a=rtpmap:63 red/48000/2', 'a=fmtp:63 111/111', 'a=rtpmap:111 opus/48000/2', 'a=fmtp:111 minptime=10;useinbandfec=1', ''].join('\r\n');

test('screen audio asks for Opus stereo only in its own section, never on the voice', () => {
  // Medido no Electron 44: sem stereo=1 na descrição local de quem recebe, o som da tela chegava mono.
  const mids = policy.audioMids(shareOffer, 'screen-stream');
  assert.deepEqual([...mids], ['2'], 'the video section and the voice are not screen audio');
  assert.deepEqual([...policy.audioMids(shareOffer, 'other')], []);
  assert.deepEqual([...policy.audioMids(shareOffer, null)], []);
  // A resposta de quem assiste usa os mesmos mids.
  const answer = shareOffer.replace(/a=msid:[^\r]*\r\n/g, '');
  const stereo = policy.opusStereo(answer, mids);
  const sections = stereo.split('\r\nm=');
  assert.match(sections[3], /a=fmtp:111 minptime=10;useinbandfec=1;stereo=1\r\n/);
  assert.match(sections[3], /a=fmtp:63 111\/111\r\n/, 'RED untouched');
  assert.equal(sections[0] + sections[1] + sections[2], answer.split('\r\nm=').slice(0, 3).join(''), 'voice and video untouched');
  assert.equal(policy.opusStereo(stereo, mids), stereo, 'idempotent');
  assert.equal(policy.opusStereo(answer, new Set()), answer);
  assert.equal(policy.opusStereo(answer.replace(/\r\n/g, '\n'), mids), stereo.replace(/\r\n/g, '\n'));
});

test('sender mutation queue preserves order after a rejected operation', async () => {
  const peer = {}, order = [];
  const first = policy.enqueue(peer, async () => { await new Promise((r) => setTimeout(r, 10)); order.push('first'); throw Error('unsupported'); });
  const second = policy.enqueue(peer, async () => { order.push('second'); });
  await assert.rejects(first);
  await second;
  assert.deepEqual(order, ['first', 'second']);
});

function mediaHarness() {
  let serial = 0;
  let clock = 0;
  const events = new Map(), calls = [], nodes = new Map();
  const track = (kind) => ({ id: `t${serial++}`, kind, readyState: 'live', constraints: [], settings: { height: 1080, width: 1920, frameRate: 30 },
    stop() { this.readyState = 'ended'; }, getSettings() { return this.settings; }, async applyConstraints(value) { this.constraints.push(value); this.settings = { height: value.height?.max || 1080, width: value.width?.max || 1920, frameRate: value.frameRate?.max || 30 }; } });
  const makeSender = (t) => ({ track: t, params: { encodings: [{}] }, changes: [], async replaceTrack(next) { this.track = next; },
    getParameters() { return structuredClone(this.params); }, async setParameters(params) { this.params = structuredClone(params); this.changes.push(structuredClone(params)); } });
  const stream = (tracks) => ({ id: `s${serial++}`, getTracks: () => [...tracks], getVideoTracks: () => tracks.filter((t) => t.kind === 'video'), getAudioTracks: () => tracks.filter((t) => t.kind === 'audio'), addTrack: (t) => tracks.push(t), removeTrack: (t) => tracks.splice(tracks.indexOf(t), 1) });
  const microphone = track('audio');
  const screen = stream([track('video'), track('audio')]);
  // Um espectador com conexão própria (fake RTCPeerConnection), como o app cria para cada pessoa.
  const makePeer = (sid) => {
    const senders = [makeSender(microphone)];
    const transceivers = [];
    return { sid, adaptation: {}, stats: {}, remote: {}, senders: { screen: [], camera: [] }, pc: {
      signalingState: 'stable', connectionState: 'connected',
      report: new Map(), async getStats() { return this.report; }, getReceivers: () => [],
      getSenders: () => senders, getTransceivers: () => transceivers,
      addTrack(t) { const sender = makeSender(t); sender.getStats = async () => this.report; senders.push(sender); transceivers.push({ sender, receiver: { track: { kind: t.kind } } }); return sender; },
      removeTrack(sender) { sender.track = null; },
    } };
  };
  const peer = makePeer('viewer');
  const self = { viewers: [], sid: 'self' };
  const state = { me: { sid: 'self' }, local: { screen, camera: null }, sharePreset: 'auto', shareAudio: true, uploadMbps: 10, peers: new Map([['viewer', peer]]), voiceChannel: 'room', view: 'voice' };
  const notices = [];
  const domNode = { textContent: '', classList: { contains: () => true }, replaceChildren() {}, append() {} };
  const listeners = {};
  const context = { window: { addEventListener: (type, fn) => { listeners[type] = fn; } }, MediaPolicy: policy, document: { querySelector: (selector) => selector.startsWith('[data-key') ? nodes.get(selector) || null : domNode }, performance: { now: () => clock }, localStorage: { setItem() {} }, setInterval() {}, setTimeout(fn, delay) { const timer = setTimeout(fn, delay); timer.unref(); return timer; }, clearTimeout, console,
    navigator: { mediaDevices: { getDisplayMedia: async () => stream([track('video'), track('audio')]) } }, Sounds: { play() {} } };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/media-session.js'), 'utf8'), context);
  const ownAudio = { cleaned: [], synced: [], works: true, async clean(s) { this.cleaned.push(s); return this.works; }, sync(s) { this.synced.push(s); } };
  const media = context.window.MediaSession({ state, socket: { on: (event, handler) => events.set(event, handler) }, call: async (event, payload) => { calls.push({ event, payload }); return {}; }, el: () => domNode, toast: (msg) => notices.push(msg), voiceEntry: (sid) => sid === 'self' ? self : { channel: 'room' }, member: () => ({}), render() {}, renderStage() {}, sendVoiceState() {}, preferCodec() {}, ownAudio });
  return { media, state, self, peer, screen, microphone, notices, context, events, calls, nodes, ownAudio, track, stream, listeners, makePeer, clock: (value) => { clock = value; } };
}

async function settle(h) { for (let i = 0; i < 4; i++) { await h.peer.mediaQueue; await Promise.resolve(); } }

test('capture stays at the chosen preset while viewers resize; each viewer is scaled by its encoder', async () => {
  const h = mediaHarness();
  const track = h.screen.getVideoTracks()[0];
  await h.media.applySharePreset();
  assert.deepEqual(track.settings, { height: 1080, width: 1920, frameRate: 30 });
  h.self.viewers = ['viewer']; h.media.syncScreenSubscriptions(); await settle(h);
  const constraints = track.constraints.length;
  h.events.get('screen:quality')({ viewer: 'viewer', demand: { mode: 'auto', maxHeight: 360, background: true } });
  await settle(h);
  assert.equal(track.constraints.length, constraints, 'a viewer resize does not recapture the screen');
  const video = h.peer.senders.screen.find((s) => s.track.kind === 'video').params.encodings[0];
  assert.equal(video.scaleResolutionDownBy, 3);
  assert.equal(video.maxFramerate, 5);
  await h.media.setSharePreset('p720');
  await h.media.applySharePreset();
  assert.deepEqual(track.settings, { height: 720, width: 1280, frameRate: 30 });
  await h.media.setSharePreset('p1080_60');
  await h.media.applySharePreset();
  assert.deepEqual(track.settings, { height: 1080, width: 1920, frameRate: 60 });
  assert.equal(track.contentHint, 'motion');
  assert.equal(track.readyState, 'live');
});

test('quality arriving during sender tuning is applied and screen audio remains bounded', async () => {
  const h = mediaHarness();
  h.self.viewers = ['viewer']; h.media.syncScreenSubscriptions(); await settle(h);
  const mic = h.peer.pc.getSenders()[0];
  mic.params.encodings = [{}];
  let release, entered;
  const blocked = new Promise((r) => { entered = r; });
  const original = mic.setParameters;
  mic.setParameters = async function (params) { entered(); await new Promise((r) => { release = r; }); mic.setParameters = original; await original.call(this, params); };
  h.media.tuneSenders(); await blocked;
  h.events.get('screen:quality')({ viewer: 'viewer', demand: { mode: 'economy', maxHeight: 360, background: false } });
  release(); await settle(h);
  const video = h.peer.senders.screen.find((s) => s.track.kind === 'video').params.encodings[0];
  assert.equal(video.maxFramerate, 15);
  assert.equal(video.scaleResolutionDownBy, 3);
  assert.equal(h.peer.senders.screen.find((s) => s.track.kind === 'audio').params.encodings[0].maxBitrate, 96000);
  assert.equal(mic.params.encodings[0].maxBitrate, 64000);
});

test('ultrawide and portrait sources retain their aspect and fit the selected capture ceiling', async () => {
  for (const size of [{ width: 3440, height: 1440 }, { width: 900, height: 1600 }]) {
    const h = mediaHarness(), track = h.screen.getVideoTracks()[0];
    track.settings = { ...size, frameRate: 30 };
    h.self.viewers = ['viewer'];
    await h.media.applySharePreset();
    assert.ok(track.settings.width <= 1920 && track.settings.height <= 1080);
    assert.ok(Math.abs(track.settings.width / track.settings.height - size.width / size.height) < .01);
  }
});

test('unsupported per-viewer scaling retains bitrate/FPS without shrinking the shared capture', async () => {
  const h = mediaHarness();
  h.self.viewers = ['viewer']; h.media.syncScreenSubscriptions(); await settle(h);
  const video = h.peer.senders.screen.find((s) => s.track.kind === 'video');
  const original = video.setParameters;
  video.setParameters = async function (params) {
    if (params.encodings[0].scaleResolutionDownBy > 1) throw Object.assign(Error('unsupported'), { name: 'NotSupportedError' });
    return original.call(this, params);
  };
  h.events.get('screen:quality')({ viewer: 'viewer', demand: { mode: 'auto', maxHeight: 360, background: false } });
  await settle(h);
  assert.equal(video.scalingUnsupported, true);
  assert.ok(video.params.encodings[0].maxBitrate < 1e6);
  assert.equal(h.screen.getVideoTracks()[0].settings.height, 1080);
  assert.match(h.peer.mediaError, /resolução por espectador/);
});

test('stats use the selected ICE path and do not downgrade a static screen from stale trouble', async () => {
  const h = mediaHarness();
  h.self.viewers = ['viewer']; h.media.syncScreenSubscriptions(); await settle(h);
  const screenTrack = h.screen.getVideoTracks()[0];
  const report = [
    { id: 'transport', type: 'transport', selectedCandidatePairId: 'selected' },
    { id: 'selected', type: 'candidate-pair', state: 'succeeded', nominated: true, availableOutgoingBitrate: 2e6, currentRoundTripTime: .05 },
    { id: 'old', type: 'candidate-pair', state: 'succeeded', nominated: true, availableOutgoingBitrate: 100_000, currentRoundTripTime: 1 },
    { id: 'source', type: 'media-source', trackIdentifier: screenTrack.id },
    { id: 'screen', type: 'outbound-rtp', kind: 'video', mediaSourceId: 'source', bytesSent: 1000, framesSent: 10, timestamp: 100, qualityLimitationReason: 'bandwidth' },
  ];
  h.peer.pc.report = new Map(report.map((r) => [r.id, r]));
  await h.media.updateStreamStats();
  assert.equal(h.peer.estimate.bitrate, 2e6);
  assert.equal(h.peer.stats.rtt, .05);
  h.clock(6000); report[4].timestamp = 6100;
  await h.media.updateStreamStats();
  assert.equal(h.peer.adaptation.level, 0);
  assert.equal(h.peer.adaptation.badSince, null);
  // Uma tela que continua enviando, mas engasgada, desce um degrau de resolução e mantém o FPS.
  for (const at of [7000, 9000, 11000]) {
    h.clock(at); report[4] = { ...report[4], timestamp: at + 100, bytesSent: at * 100, framesSent: at };
    h.peer.pc.report = new Map(report.map((r) => [r.id, r]));
    await h.media.updateStreamStats();
  }
  assert.equal(h.peer.adaptation.level, 1);
  h.media.tuneSenders(); await settle(h);
  const video = h.peer.senders.screen.find((s) => s.track.kind === 'video').params.encodings[0];
  assert.equal(video.scaleResolutionDownBy, 1.5);
  assert.equal(video.maxFramerate, 30);
});

test('Movimento in the stats loop: 1080p holds at 30 fps, and at 20 fps goes to 900p at 60', async () => {
  const h = mediaHarness();
  h.state.sharePreset = 'p1080_60';
  h.self.viewers = ['viewer']; h.media.syncScreenSubscriptions(); await settle(h);
  const screenTrack = h.screen.getVideoTracks()[0];
  const report = (at, fps) => new Map([
    ['source', { id: 'source', type: 'media-source', trackIdentifier: screenTrack.id, framesPerSecond: 60 }],
    ['codec', { id: 'codec', type: 'codec', mimeType: 'video/H264' }],
    ['screen', { id: 'screen', type: 'outbound-rtp', kind: 'video', mediaSourceId: 'source', codecId: 'codec', bytesSent: at * 500, framesSent: at * fps / 1000,
      framesPerSecond: fps, timestamp: at, qualityLimitationReason: 'bandwidth' }],
  ]);
  const tick = async (from, to, fps) => { for (let at = from; at <= to; at += 1500) { h.clock(at); h.peer.pc.report = report(at, fps); await h.media.updateStreamStats(); } };
  await tick(1000, 40_000, 59);
  assert.equal(h.peer.adaptation.level, 0, '59 fps with the browser reporting a bandwidth limit keeps 1080p');
  await tick(41_500, 70_000, 30);
  assert.equal(h.peer.adaptation.level, 0, '30 fps keeps 1080p');
  await tick(71_500, 76_000, 20);
  assert.equal(h.peer.adaptation.level, 1, '~6 s at 20 fps steps down one step');
  h.media.tuneSenders(); await settle(h);
  const video = h.peer.senders.screen.find((s) => s.track.kind === 'video').params.encodings[0];
  assert.equal(video.scaleResolutionDownBy, 1.2, '1080p → 900p');
  assert.equal(video.maxFramerate, 60, '900p keeps trying 60 fps');
});

test('a CPU-bound AV1 screen switches viewers to VP8 without renegotiating, before reducing resolution', async () => {
  const h = mediaHarness();
  h.self.viewers = ['viewer']; h.media.syncScreenSubscriptions(); await settle(h);
  const video = h.peer.senders.screen.find((s) => s.track.kind === 'video');
  video.params.codecs = [{ mimeType: 'video/AV1', clockRate: 90000 }, { mimeType: 'video/VP8', clockRate: 90000 }];
  const screenTrack = h.screen.getVideoTracks()[0];
  const report = (at) => new Map([
    ['transport', { id: 'transport', type: 'transport', selectedCandidatePairId: 'pair' }],
    ['pair', { id: 'pair', type: 'candidate-pair', state: 'succeeded', nominated: true, availableOutgoingBitrate: 3e6, currentRoundTripTime: .02 }],
    ['source', { id: 'source', type: 'media-source', trackIdentifier: screenTrack.id, framesPerSecond: 30 }],
    ['codec', { id: 'codec', type: 'codec', mimeType: 'video/AV1' }],
    ['screen', { id: 'screen', type: 'outbound-rtp', kind: 'video', mediaSourceId: 'source', codecId: 'codec', bytesSent: at * 100, framesSent: at, framesPerSecond: 12, timestamp: at, qualityLimitationReason: 'cpu', encoderImplementation: 'libaom' }],
  ]);
  for (const at of [1000, 3000, 5500]) { h.clock(at); h.peer.pc.report = report(at); await h.media.updateStreamStats(); }
  assert.ok(!h.state.screenCodecFallback, 'a short CPU spike does not change the codec');
  assert.equal(h.peer.adaptation.level || 0, 0, 'no resolution step while the codec switch is pending');
  assert.match(h.state.videoEncoder, /libaom · AV1 · limitado pelo processador/);
  h.clock(6500); h.peer.pc.report = report(6500); await h.media.updateStreamStats(); await settle(h);
  assert.equal(h.state.screenCodecFallback, 'video/VP8');
  assert.equal(video.params.encodings[0].codec.mimeType, 'video/VP8', 'switched live through encodings[0].codec');
  assert.match(h.state.mediaHealth, /mais leve/);
  h.media.setSharePreset('p1080');
  assert.equal(h.state.screenCodecFallback, null, 'a new preset tries the sharper codec again');
});

test('a viewer who comes back starts the 5 s CPU and heavy-content counts over', async () => {
  const h = mediaHarness();
  h.self.viewers = ['viewer']; h.media.syncScreenSubscriptions(); await settle(h);
  const video = h.peer.senders.screen.find((s) => s.track.kind === 'video');
  video.params.codecs = [{ mimeType: 'video/AV1', clockRate: 90000 }, { mimeType: 'video/VP8', clockRate: 90000 }];
  const screenTrack = h.screen.getVideoTracks()[0];
  const report = (at) => new Map([
    ['source', { id: 'source', type: 'media-source', trackIdentifier: screenTrack.id, framesPerSecond: 30 }],
    ['codec', { id: 'codec', type: 'codec', mimeType: 'video/AV1' }],
    ['screen', { id: 'screen', type: 'outbound-rtp', kind: 'video', mediaSourceId: 'source', codecId: 'codec', bytesSent: at * 100, framesSent: at, framesPerSecond: 30, timestamp: at, qualityLimitationReason: 'cpu' }],
  ]);
  const sample = async (at) => { h.clock(at); h.peer.pc.report = report(at); await h.media.updateStreamStats(); await settle(h); };
  await sample(1000); // engasgou por um instante e o espectador fechou a transmissão
  h.self.viewers = []; h.media.syncScreenSubscriptions(); await settle(h);
  h.self.viewers = ['viewer']; h.media.syncScreenSubscriptions(); await settle(h);
  await sample(600_000); // dez minutos depois, volta a assistir: o primeiro quadro-chave pesa
  assert.ok(!h.state.screenCodecFallback, 'one CPU-limited sample after coming back is not 5 s of strain');
  assert.ok(!h.state.screenMotion, 'nor 5 s of heavy content');
  for (const at of [601_500, 603_000, 604_500]) await sample(at);
  assert.ok(!h.state.screenCodecFallback);
  await sample(605_000);
  assert.equal(h.state.screenCodecFallback, 'video/VP8', 'a real 5 s strain still switches the codec');
});

test('a text preset sends full resolution to small tiles until the content turns out to be heavy', async () => {
  const h = mediaHarness();
  h.self.viewers = ['viewer']; h.media.syncScreenSubscriptions(); await settle(h);
  h.events.get('screen:quality')({ viewer: 'viewer', demand: { mode: 'auto', maxHeight: 540, background: false } });
  await settle(h);
  const video = h.peer.senders.screen.find((s) => s.track.kind === 'video');
  assert.equal(video.params.encodings[0].scaleResolutionDownBy, 1, 'text: the viewer scales 1080p down better than the encoder');
  const screenTrack = h.screen.getVideoTracks()[0];
  const report = (at) => new Map([
    ['source', { id: 'source', type: 'media-source', trackIdentifier: screenTrack.id, framesPerSecond: 30 }],
    ['codec', { id: 'codec', type: 'codec', mimeType: 'video/VP8' }],
    ['screen', { id: 'screen', type: 'outbound-rtp', kind: 'video', mediaSourceId: 'source', codecId: 'codec', bytesSent: at * 490, framesSent: at * .03, framesEncoded: at * .03, totalEncodeTime: at * .03 * .012,
      framesPerSecond: 30, timestamp: at, qualityLimitationReason: 'none', targetBitrate: 4_000_000 }],
  ]);
  for (const at of [1000, 2500, 4000, 5500]) { h.clock(at); h.peer.pc.report = report(at); await h.media.updateStreamStats(); }
  assert.ok(!h.state.screenMotion, 'needs 5 s of a saturated encoder');
  for (const at of [7000, 8500]) { h.clock(at); h.peer.pc.report = report(at); await h.media.updateStreamStats(); }
  await settle(h);
  assert.equal(h.state.screenMotion, true);
  assert.equal(video.params.encodings[0].scaleResolutionDownBy, 2, 'heavy content: the small tile gets its own size again');
  assert.ok(!h.state.screenCodecFallback, '12 ms per frame is not a CPU limit');
  h.media.stopVideo('screen');
  assert.equal(h.state.screenMotion, null);
});

test('the 60 fps preset keeps resolution and frame rate, falling back to maintain-framerate where unsupported', async () => {
  const h = mediaHarness();
  h.state.sharePreset = 'p1080_60';
  h.self.viewers = ['viewer']; h.media.syncScreenSubscriptions(); await settle(h);
  assert.equal(h.peer.senders.screen.find((s) => s.track.kind === 'video').params.degradationPreference, 'maintain-framerate-and-resolution');
  const old = mediaHarness();
  old.state.sharePreset = 'p1080_60';
  const addTrack = old.peer.pc.addTrack.bind(old.peer.pc);
  old.peer.pc.addTrack = (track) => {
    const sender = addTrack(track), set = sender.setParameters;
    sender.setParameters = async function (params) { if (params.degradationPreference === 'maintain-framerate-and-resolution') throw new TypeError('unknown enum value'); return set.call(this, params); };
    return sender;
  };
  old.self.viewers = ['viewer']; old.media.syncScreenSubscriptions(); await settle(old);
  const video = old.peer.senders.screen.find((s) => s.track.kind === 'video');
  assert.equal(video.params.degradationPreference, 'maintain-framerate');
  assert.equal(video.params.encodings[0].maxFramerate, 60);
  old.media.tuneSenders(); await settle(old);
  assert.equal(video.params.degradationPreference, 'maintain-framerate', 'later tuning does not retry the unsupported value');
});

test('a screen joining a call that only carried audio tells the encoder where to start, with a fixed value', async () => {
  const h = mediaHarness();
  h.state.sharePreset = 'p1080_60';
  h.self.viewers = ['viewer']; h.media.syncScreenSubscriptions(); await settle(h);
  const video = h.peer.senders.screen.find((s) => s.track.kind === 'video');
  h.peer.pc.getTransceivers().find((t) => t.sender === video).mid = '2';
  const offer = { type: 'offer', sdp: answerSdp };
  assert.equal(h.media.remoteDescription(h.peer, offer), offer, 'offers are not touched');
  const kbps = Math.round(h.media.videoBitrates().get('viewer').screen * .9 / 1000);
  assert.ok(kbps >= 3000, `90% of the viewer's screen budget (${kbps} kbps)`);
  const answer = h.media.remoteDescription(h.peer, { type: 'answer', sdp: answerSdp });
  assert.equal(answer.type, 'answer');
  assert.equal(answer.sdp, policy.startBitrate(answerSdp, { 2: kbps }));
  h.state.uploadMbps = 3;
  assert.equal(h.media.remoteDescription(h.peer, { type: 'answer', sdp: answerSdp }).sdp, answer.sdp, 'renegotiations keep the first value');
  const warm = mediaHarness();
  warm.state.local.camera = warm.stream([warm.track('video')]);
  warm.self.viewers = ['viewer']; warm.media.syncScreenSubscriptions(); await settle(warm);
  const screenSender = warm.peer.senders.screen.find((s) => s.track.kind === 'video');
  warm.peer.pc.getTransceivers().find((t) => t.sender === screenSender).mid = '2';
  const plainAnswer = { type: 'answer', sdp: answerSdp };
  assert.equal(warm.media.remoteDescription(warm.peer, plainAnswer), plainAnswer, 'a camera already warmed the estimate');
});

test('Movimento with several viewers: a tile without steps goes to 30 fps first, so 1080p keeps its resolution', async () => {
  const h = mediaHarness();
  h.state.sharePreset = 'p1080_60';
  const small = h.makePeer('small');
  h.state.peers.set('small', small);
  h.self.viewers = ['viewer', 'small'];
  h.events.get('screen:quality')({ viewer: 'viewer', demand: { mode: 'auto', maxHeight: 1080, background: false } });
  h.events.get('screen:quality')({ viewer: 'small', demand: { mode: 'auto', maxHeight: 540, background: false } });
  h.media.syncScreenSubscriptions(); await settle(h); await small.mediaQueue;
  const screenTrack = h.screen.getVideoTracks()[0];
  const report = (at) => new Map([
    ['source', { id: 'source', type: 'media-source', trackIdentifier: screenTrack.id, framesPerSecond: 60 }],
    ['codec', { id: 'codec', type: 'codec', mimeType: 'video/H264' }],
    ['screen', { id: 'screen', type: 'outbound-rtp', kind: 'video', mediaSourceId: 'source', codecId: 'codec', bytesSent: at * 500, framesSent: at * 20 / 1000, framesPerSecond: 20, timestamp: at }],
  ]);
  // Os dois engasgam juntos (20 fps de 60): o processador é um só.
  const levels = [];
  for (let at = 1000; at <= 13_000; at += 1500) {
    h.clock(at); h.peer.pc.report = report(at); small.pc.report = report(at);
    await h.media.updateStreamStats();
    levels.push([h.peer.adaptation.level || 0, !!small.adaptation.half]);
  }
  assert.deepEqual(levels[3], [0, true], 'the 540p tile (no steps below it) goes to 30 fps; 1080p stays');
  await settle(h); await small.mediaQueue;
  assert.equal(small.senders.screen.find((s) => s.track?.kind === 'video').params.encodings[0].maxFramerate, 30);
  assert.deepEqual(levels.at(-1), [1, true], `still strained: only then 1080p goes to 900p (${JSON.stringify(levels)})`);
});

test('a connection that dropped and came back by itself still recovers the next time it fails', async () => {
  const h = mediaHarness();
  const pc = h.peer.pc;
  pc.restarts = 0;
  pc.restartIce = () => { pc.restarts++; };
  // Queda curta: "disconnected" agenda uma tentativa; a conexão volta sozinha antes dela.
  pc.connectionState = 'disconnected'; h.media.connectionChanged(h.peer);
  assert.ok(h.peer.recoveryTimer, 'a recovery is scheduled');
  pc.connectionState = 'connected'; h.media.connectionChanged(h.peer);
  assert.equal(h.peer.recoveryTimer, null, 'the cancelled timer does not stay behind');
  // Queda longa depois: antes da correção, o timer cancelado bloqueava esta tentativa para sempre.
  pc.connectionState = 'failed'; h.media.connectionChanged(h.peer);
  assert.ok(h.peer.recoveryTimer);
  await new Promise((r) => setTimeout(r, 2200));
  assert.equal(pc.restarts, 1, 'ICE restarted 2 s after failing');
  assert.equal(h.peer.recoveryAttempts, 1);
  assert.ok(h.peer.recoveryTimer, 'keeps trying while the person is in the call');
  // A internet voltou: tenta na hora.
  h.listeners.online();
  assert.equal(pc.restarts, 2);
  pc.connectionState = 'connected'; h.media.connectionChanged(h.peer);
  assert.deepEqual([h.peer.recoveryTimer, h.peer.recoveryAttempts], [null, 0]);
  h.listeners.online();
  assert.equal(pc.restarts, 2, 'connected peers are left alone');
});

test('viewer resize and background requests are coalesced without stopping the subscribed audio', async () => {
  const h = mediaHarness();
  let width = 320;
  h.nodes.set('[data-key="screen-viewer"] video', { getBoundingClientRect: () => ({ width, height: width * 9 / 16 }), videoWidth: 1920, videoHeight: 1080, isConnected: true });
  // The receiver is subscribed to the other participant's stream.
  h.self.viewers = [];
  const entry = { channel: 'room', viewers: ['self'] };
  const socket = { connected: true, timeout: (ms) => {
    assert.equal(ms, 5000);
    return { emit: (event, payload, ack) => { h.calls.push({ event, payload }); ack(null, { ok: true }); } };
  } };
  // Harness voiceEntry is fixed; wire a second MediaSession with a receiver entry.
  const media = h.context.window.MediaSession({ state: h.state, socket, call: () => { throw Error('automatic requests must be quiet'); }, el: () => ({}), toast() {},
    voiceEntry: (sid) => sid === 'viewer' ? entry : h.self, member: () => ({}), render() {}, renderStage() {}, sendVoiceState() {}, preferCodec() {} });
  media.syncViewerQuality(); width = 640; media.syncViewerQuality();
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].payload.quality.maxHeight, 360);
  h.context.document.hidden = true;
  media.syncViewerQuality(); await new Promise((r) => setTimeout(r, 300));
  assert.equal(h.calls[1].payload.quality.background, true);
  socket.connected = false; width = 960;
  media.syncViewerQuality(); await new Promise((r) => setTimeout(r, 300));
  assert.equal(h.calls.length, 2);
  socket.connected = true;
  media.syncViewerQuality(); await new Promise((r) => setTimeout(r, 300));
  assert.equal(h.calls[2].payload.quality.maxHeight, 540);
  assert.ok(h.calls.every((c) => c.event === 'screen:quality'));
});

test('watch/unwatch suspends both screen tracks while preserving the microphone', async () => {
  const h = mediaHarness();
  h.media.syncScreenSubscriptions(); await h.peer.mediaQueue;
  assert.equal(h.peer.senders.screen.length, 0);
  h.self.viewers = ['viewer']; h.media.syncScreenSubscriptions(); await h.peer.mediaQueue;
  assert.equal(h.peer.senders.screen.filter((s) => s.track).length, 2);
  h.self.viewers = []; h.media.syncScreenSubscriptions(); await h.peer.mediaQueue;
  assert.ok(h.peer.senders.screen.every((s) => s.track === null));
  assert.equal(h.microphone.readyState, 'live');
  h.self.viewers = ['viewer']; h.media.syncScreenSubscriptions(); await h.peer.mediaQueue;
  assert.equal(h.peer.senders.screen.filter((s) => s.track).length, 2);
});

test('a viewer who comes back after a switch to a source with sound also gets the sound', async () => {
  const h = mediaHarness();
  h.state.local.screen = h.stream([h.track('video')]); // uma janela, sem áudio
  h.self.viewers = ['viewer']; h.media.syncScreenSubscriptions(); await settle(h);
  h.self.viewers = []; h.media.syncScreenSubscriptions(); await settle(h);
  h.context.navigator.mediaDevices.getDisplayMedia = async () => h.stream([h.track('video'), h.track('audio')]);
  await h.media.switchScreen(); // a tela inteira, com o som do computador
  h.self.viewers = ['viewer']; h.media.syncScreenSubscriptions(); await settle(h);
  const sent = h.peer.senders.screen.map((s) => s.track);
  assert.deepEqual([...sent.map((t) => t?.kind)].sort(), ['audio', 'video']);
  assert.ok(sent.every((t) => h.state.local.screen.getTracks().includes(t) && t.readyState === 'live'));
});

test('someone who starts watching during a source switch gets the new source, not the stopped one', async () => {
  const h = mediaHarness();
  const other = h.makePeer('viewer2');
  h.state.peers.set('viewer2', other);
  h.self.viewers = ['viewer2']; h.media.syncScreenSubscriptions(); await settle(h); await other.mediaQueue;
  let release;
  policy.enqueue(other, () => new Promise((resolve) => { release = resolve; })); // viewer2 ainda ajustando o envio
  const switching = h.media.switchScreen();
  await new Promise((resolve) => setTimeout(resolve, 10));
  h.self.viewers = ['viewer', 'viewer2']; h.media.syncScreenSubscriptions(); await settle(h); // a troca já passou por "viewer"
  release(); await switching; await settle(h); await other.mediaQueue;
  for (const peer of [h.peer, other]) {
    const sent = peer.senders.screen.map((s) => s.track);
    assert.deepEqual([...sent.map((t) => `${t?.kind}:${t?.readyState}`)].sort(), ['audio:live', 'video:live'], peer.sid);
    assert.ok(sent.every((t) => h.state.local.screen.getTracks().includes(t)), peer.sid);
  }
});

test('source-switch failure keeps previous tracks alive and reports failure', async () => {
  const h = mediaHarness();
  h.self.viewers = ['viewer']; h.media.syncScreenSubscriptions(); await h.peer.mediaQueue;
  const sender = h.peer.senders.screen[0];
  const old = sender.track;
  sender.replaceTrack = async () => { throw Error('unsupported track'); };
  await h.media.switchScreen();
  assert.equal(h.state.local.screen, h.screen);
  assert.equal(old.readyState, 'live');
  assert.ok(h.notices.some((msg) => msg.includes('anterior foi mantida')));
});

test('closing the desktop picker is quiet on start and source switch; real denial is reported', async () => {
  const h = mediaHarness();
  const cancelled = Object.assign(new Error('closed'), { name: 'ShareCancelledError' });
  h.context.navigator.mediaDevices.getDisplayMedia = async () => { throw cancelled; };
  await h.media.switchScreen();
  assert.equal(h.state.local.screen, h.screen);
  assert.equal(h.screen.getVideoTracks()[0].readyState, 'live');
  assert.equal(h.state.captureBusy, false);
  h.media.stopVideo('screen');
  await h.media.startVideo('screen');
  assert.equal(h.state.local.screen, null);
  assert.equal(h.state.captureBusy, false);
  assert.deepEqual(h.notices, []);
  h.context.navigator.mediaDevices.getDisplayMedia = async () => { throw Object.assign(new Error('denied'), { name: 'NotAllowedError' }); };
  await h.media.startVideo('screen');
  assert.ok(h.notices.some((message) => message.includes('não autorizado')));
});

test('desktop app mixes are not filtered as call audio and dispose on stop and stale capture', async () => {
  const h = mediaHarness();
  h.media.stopVideo('screen');
  let cleaned = 0;
  const makeCapture = () => {
    const s = h.stream([h.track('video'), h.track('audio')]);
    s.desktopAudioMode = 'app';
    s.desktopAudioCleanup = () => { cleaned++; };
    return s;
  };
  h.context.navigator.mediaDevices.getDisplayMedia = async () => makeCapture();
  await h.media.startVideo('screen');
  assert.equal(h.state.shareAudioMode, 'app');
  assert.equal(h.ownAudio.cleaned.length, 0, 'chosen app audio bypasses call echo filtering');
  h.media.stopVideo('screen');
  assert.equal(cleaned, 1);
  let finish;
  h.context.navigator.mediaDevices.getDisplayMedia = () => new Promise(resolve => { finish = resolve; });
  const pending = h.media.startVideo('screen');
  h.state.voiceChannel = null;
  finish(makeCapture());
  await pending;
  assert.equal(cleaned, 2, 'a capture that finishes after leaving releases its mixer');
});

test('capture completing after leaving a room releases its tracks', async () => {
  const h = mediaHarness();
  h.media.stopVideo('screen');
  let resolve;
  h.context.navigator.mediaDevices.getDisplayMedia = () => new Promise((r) => { resolve = r; });
  const pending = h.media.startVideo('screen');
  h.media.stopVideo('screen'); h.state.voiceChannel = null;
  let stopped = 0;
  resolve({ getTracks: () => [{ stop() { stopped++; } }] });
  await pending;
  assert.equal(stopped, 1);
  assert.equal(h.state.local.screen, null);
});

test('server validates viewers and cleans subscriptions on stop, leave and disconnect', { timeout: 25000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'resenhex-media-test-'));
  const port = 38000 + Math.floor(Math.random() * 10000), base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['server.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), DATA_FILE: path.join(dir, 'data.json'), UPLOAD_DIR: path.join(dir, 'uploads'), ACCESS_PASSWORD: '', ACCESS_PASSWORD_B64: '' }, stdio: 'ignore' });
  const clients = [];
  const emit = (socket, event, payload = {}) => socket.timeout(3000).emitWithAck(event, payload);
  const until = async (check) => { for (let i = 0; i < 80; i++) { if (await check()) return; await new Promise((r) => setTimeout(r, 40)); } throw Error('condition timed out'); };
  try {
    await until(async () => { try { return (await fetch(base + '/config')).ok; } catch { return false; } });
    async function connect(name) {
      const socket = io(base, { autoConnect: false, reconnection: false });
      clients.push(socket);
      socket.on('state', (s) => { socket.snapshot = s; });
      await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); socket.connect(); });
      const auth = await emit(socket, 'auth', { mode: 'register', name, password: 'test-only-2026', confirmPassword: 'test-only-2026' });
      assert.ok(auth.accountId);
      if (!auth.serverId) {
        const invite = await emit(clients[0], 'server:invite', {});
        assert.ok(!(await emit(socket, 'server:join', { code: invite.code })).error);
      }
      return socket;
    }
    const host = await connect('Host'), viewer = await connect('Viewer'), outsider = await connect('Elsewhere');
    const qualityEvents = [], outsiderQuality = [];
    host.on('screen:quality', (event) => qualityEvents.push(event));
    outsider.on('screen:quality', (event) => outsiderQuality.push(event));
    const avatar = 'data:image/png;base64,' + PNG.sync.write({ width: 32, height: 32, data: Buffer.alloc(4096, 200) }).toString('base64');
    assert.ok((await emit(host, 'profile', { avatar: 'data:image/svg+xml;base64,PHN2Zz4=' })).error);
    const profile = await emit(host, 'profile', { color: '#123456', avatar });
    assert.match(profile.avatarUrl, /^\/avatars\/[a-f0-9]{64}\.png$/);
    await until(() => viewer.snapshot.members.some((m) => m.name === 'Host' && m.avatarUrl === profile.avatarUrl));
    const response = await fetch(base + profile.avatarUrl);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /^image\/png/);
    assert.equal(PNG.sync.read(Buffer.from(await response.arrayBuffer())).width, 32);
    // Another account can use the same image; removing one must not break the other.
    assert.equal((await emit(viewer, 'profile', { avatar })).avatarUrl, profile.avatarUrl);
    const edited = await emit(host, 'profile', { color: '#654321' });
    assert.equal(edited.avatarUrl, profile.avatarUrl);
    await until(() => {
      try { return Object.values(JSON.parse(fs.readFileSync(path.join(dir, 'data.json'), 'utf8')).accounts).some((account) => account.name === 'Host' && '/avatars/' + account.avatar === profile.avatarUrl); } catch { return false; }
    });
    assert.equal((await emit(host, 'profile', { avatar: null })).avatarUrl, null);
    assert.equal((await fetch(base + profile.avatarUrl)).status, 200);
    assert.equal((await emit(viewer, 'profile', { avatar: null })).avatarUrl, null);
    assert.equal((await fetch(base + profile.avatarUrl)).status, 404);
    const rooms = host.snapshot.channels.filter((c) => c.type === 'voice');
    const room = rooms[0].id;
    await emit(host, 'voice:join', { channel: room });
    await emit(viewer, 'voice:join', { channel: room });
    await emit(outsider, 'voice:join', { channel: rooms[1].id });
    assert.ok((await emit(viewer, 'screen:watch', { target: host.id, watching: true })).error);
    await emit(host, 'voice:state', { sharing: true });
    assert.ok((await emit(outsider, 'screen:watch', { target: host.id, watching: true })).error);
    assert.ok((await emit(host, 'screen:watch', { target: host.id, watching: true })).error);
    assert.ok((await emit(viewer, 'screen:watch', { target: host.id, watching: 'yes' })).error);
    assert.ok((await emit(viewer, 'screen:watch', { target: host.id, watching: true, quality: { mode: 'auto', maxHeight: 9000, background: false } })).error);
    assert.ok((await emit(viewer, 'screen:quality', { target: host.id, quality: { mode: 'auto', maxHeight: 360, background: false } })).error);
    assert.ok((await emit(viewer, 'screen:watch', { target: host.id, watching: true })).ok);
    await until(() => host.snapshot.voice.find((v) => v.sid === host.id)?.viewers.length === 1);
    await until(() => qualityEvents.length === 1);
    assert.deepEqual(qualityEvents[0], { viewer: viewer.id, demand: { mode: 'auto', maxHeight: 1080, background: false } });
    const quality = { mode: 'economy', maxHeight: 360, background: true };
    assert.ok((await emit(outsider, 'screen:quality', { target: host.id, quality })).error);
    assert.ok((await emit(viewer, 'screen:quality', { target: host.id, quality: { ...quality, background: 'yes' } })).error);
    assert.ok((await emit(viewer, 'screen:quality', { target: host.id, quality })).ok);
    await until(() => qualityEvents.length === 2);
    assert.deepEqual(qualityEvents[1], { viewer: viewer.id, demand: quality });
    await emit(viewer, 'screen:quality', { target: host.id, quality });
    assert.equal(qualityEvents.length, 2);
    // Celulares informam os codecs que decodificam por hardware; só nomes conhecidos passam.
    assert.ok((await emit(viewer, 'screen:quality', { target: host.id, quality: { ...quality, codecs: ['video/evil'] } })).error);
    assert.ok((await emit(viewer, 'screen:quality', { target: host.id, quality: { ...quality, codecs: 'video/H264' } })).error);
    assert.ok((await emit(viewer, 'screen:quality', { target: host.id, quality: { ...quality, codecs: ['video/H264', 'video/H264'] } })).ok);
    await until(() => qualityEvents.length === 3);
    assert.deepEqual(qualityEvents[2].demand, { ...quality, codecs: ['video/H264'] });
    assert.ok((await emit(viewer, 'screen:quality', { target: host.id, quality })).ok);
    await until(() => qualityEvents.length === 4);
    assert.equal(outsiderQuality.length, 0);
    await emit(viewer, 'screen:watch', { target: host.id, watching: true });
    assert.equal(host.snapshot.voice.find((v) => v.sid === host.id).viewers.length, 1);
    await emit(viewer, 'screen:watch', { target: host.id, watching: false });
    await until(() => host.snapshot.voice.find((v) => v.sid === host.id)?.viewers.length === 0);
    await until(() => qualityEvents.at(-1)?.demand === null);
    assert.ok((await emit(viewer, 'screen:quality', { target: host.id, quality })).error);
    await emit(viewer, 'screen:watch', { target: host.id, watching: true });
    await emit(host, 'voice:state', { sharing: false });
    assert.equal(host.snapshot.voice.find((v) => v.sid === host.id).viewers.length, 0);
    await emit(host, 'voice:state', { sharing: true });
    await emit(viewer, 'screen:watch', { target: host.id, watching: true });
    await emit(viewer, 'voice:leave');
    await until(() => host.snapshot.voice.find((v) => v.sid === host.id)?.viewers.length === 0);
    await until(() => qualityEvents.at(-1)?.demand === null);
    await emit(viewer, 'voice:join', { channel: room });
    await emit(viewer, 'screen:watch', { target: host.id, watching: true });
    viewer.close();
    await until(() => host.snapshot.voice.find((v) => v.sid === host.id)?.viewers.length === 0);
  } finally {
    clients.forEach((client) => client.close());
    const exited = new Promise((resolve) => child.once('exit', resolve));
    child.kill(); await exited;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('screen audio that carries the call is cleaned; excluded system audio and tab audio are not', async () => {
  const h = mediaHarness();
  h.media.stopVideo('screen');
  const capture = (videoSettings, audioSettings) => {
    const video = h.track('video'), audio = h.track('audio');
    video.settings = { ...video.settings, ...videoSettings };
    audio.settings = audioSettings;
    const stream = h.stream([video, audio]);
    h.context.navigator.mediaDevices.getDisplayMedia = async () => stream;
    return stream;
  };
  const cases = [
    [{ displaySurface: 'monitor' }, { deviceId: 'loopback', restrictOwnAudio: false }, true, 'filter'],
    [{ displaySurface: 'monitor' }, { deviceId: 'loopback', restrictOwnAudio: true }, false, 'native'],
    [{ displaySurface: 'monitor' }, { deviceId: 'loopbackWithoutChrome' }, false, 'native'],
    [{ displaySurface: 'browser' }, { deviceId: 'tab' }, false, 'tab'],
    [{ displaySurface: 'window' }, { deviceId: 'applicationLoopback:4321' }, false, 'app'],
  ];
  for (const [video, audio, cleaned, mode] of cases) {
    const stream = capture(video, audio);
    h.ownAudio.cleaned.length = 0;
    await h.media.startVideo('screen');
    assert.equal(h.ownAudio.cleaned.includes(stream), cleaned, JSON.stringify({ video, audio }));
    assert.equal(h.state.shareAudioMode, mode);
    assert.equal(h.ownAudio.synced.at(-1), stream, 'the filter follows the live capture');
    h.media.stopVideo('screen');
    assert.equal(h.ownAudio.synced.at(-1), null, 'stopping the share releases the filter');
    assert.equal(h.state.shareAudioMode, null);
  }
  assert.equal(h.notices.filter((text) => text.includes('pode sobrar um pouco')).length, 1, 'the filter notice is shown once');

  // Sem como filtrar, quem transmite fica sabendo que as vozes vão junto, a cada transmissão.
  h.ownAudio.works = false;
  for (let i = 0; i < 2; i++) {
    capture({ displaySurface: 'monitor' }, { deviceId: 'loopback' });
    h.notices.length = 0;
    await h.media.startVideo('screen');
    assert.equal(h.state.shareAudioMode, 'mixed');
    assert.match(h.state.mediaHealth, /vão junto/, 'mixed audio is announced');
    if (i === 0) assert.ok(h.notices.some((text) => text.includes('vão junto')), 'and shown');
    h.media.stopVideo('screen');
  }
});
