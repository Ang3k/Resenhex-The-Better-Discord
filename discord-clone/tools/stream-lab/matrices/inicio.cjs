// Os primeiros 15 s de uma transmissão que começa no meio da chamada: a conexão já levava só o
// microfone havia 12 s, como em qualquer call. Antes (commit 15429b2, versão 1.4.6) × agora.
const BASE = process.env.STREAM_LAB_BASELINE || '15429b2';
const start = { audioFirst: 12_000, warmup: 0.5, duration: 15 };
const one = { viewers: 1, compareHeights: [1080] }, three = { viewers: 3, compareHeights: [1080, 720, 540] };
const text = { clip: 'desktop30', fps: 30, preset: 'auto' };
const game60 = { clip: 'game60', fps: 60, preset: 'p1080_60', sampleMod: 30, sampleRem: 7 };
const sfu = { mode: 'sfu', viewerDims: [1080, 720, 540].map((h) => ({ width: Math.round(h * 16 / 9), height: h })), viewerFps: 60, viewerRoomOptions: { adaptiveStream: false, dynacast: true } };
const scenarios = [
  { id: 'inicio-jogo60-1esp', ...game60, ...one, ...start },
  { id: 'inicio-texto-1esp', ...text, ...one, ...start },
  { id: 'inicio-sfu-jogo60-3esp', ...game60, ...three, ...sfu, ...start },
  { id: 'inicio-sfu-texto-3esp', ...text, ...three, ...sfu, ...start },
];
module.exports = scenarios.flatMap((s) => [BASE, 'working'].map((app) => ({ ...s, name: `${s.id}-${app === 'working' ? 'novo' : 'antes'}`, app })));
