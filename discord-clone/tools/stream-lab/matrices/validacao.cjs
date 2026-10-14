// O código do app de verdade (MediaSession, MediaPolicy, preferCodec e MediaSfu), da versão 1.4.6
// (commit 15429b2) contra a árvore de trabalho: mesmos clipes, espectadores e limites de rede.
const BASE = process.env.STREAM_LAB_BASELINE || '15429b2';
const three = { viewers: 3, compareHeights: [1080, 720, 540] }, one = { viewers: 1, compareHeights: [1080] };
const text = { clip: 'desktop30', fps: 30, preset: 'auto' };
const game30 = { clip: 'game60', fps: 30, preset: 'auto' };
const game60 = { clip: 'game60', fps: 60, preset: 'p1080_60', sampleMod: 30, sampleRem: 7 };
const sfu = { mode: 'sfu', viewerDims: [1080, 720, 540].map((h) => ({ width: Math.round(h * 16 / 9), height: h })), viewerFps: 60, viewerRoomOptions: { adaptiveStream: false, dynacast: true } };
const scenarios = [
  { id: 'texto-3esp', ...text, ...three, warmup: 10, duration: 24 },
  { id: 'jogo30-1esp', ...game30, ...one, warmup: 10, duration: 24 },
  { id: 'jogo30-3esp', ...game30, ...three, warmup: 12, duration: 30 },
  { id: 'jogo60-1esp', ...game60, ...one, warmup: 10, duration: 30 },
  { id: 'jogo60-3esp', ...game60, ...three, warmup: 12, duration: 30 },
  { id: 'texto-3esp-envio2500', ...text, ...three, warmup: 12, duration: 30, net: { up: 2500, queueMs: 120 } },
  { id: 'jogo60-1esp-envio3000', ...game60, ...one, warmup: 12, duration: 36, net: { up: 3000, queueMs: 120 } },
  { id: 'sfu-texto-3esp', ...text, ...three, ...sfu, warmup: 10, duration: 24 },
  { id: 'sfu-jogo60-3esp', ...game60, ...three, ...sfu, warmup: 10, duration: 24 },
];
module.exports = scenarios.flatMap((s) => [BASE, 'working'].map((app) => ({ ...s, name: `${s.id}-${app === 'working' ? 'novo' : 'antes'}`, app })));
