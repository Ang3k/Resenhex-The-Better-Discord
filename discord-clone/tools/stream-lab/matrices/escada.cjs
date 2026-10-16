// Escada do Movimento (1080p/60): a versão 1.6.0 (commit 83b3a38, escada da 1.5.1) × agora.
// Três espectadores deixam o processador no limite; em "volta", dois vão para segundo plano aos 20 s
// da medição e o bloco grande deveria voltar para 1080p.
const BASE = process.env.STREAM_LAB_BASELINE || '83b3a38';
const game60 = { clip: 'game60', fps: 60, preset: 'p1080_60', sampleMod: 30, sampleRem: 7, warmup: 15 };
const three = { viewers: 3, compareHeights: [1080, 720, 540] };
const scenarios = [
  { id: 'escada-jogo60-1esp', ...game60, viewers: 1, compareHeights: [1080], duration: 30 },
  { id: 'escada-jogo60-3esp', ...game60, ...three, duration: 30 },
  { id: 'escada-volta-3esp', ...game60, ...three, duration: 60, events: [{ at: 35, type: 'demand', viewers: [1, 2], demand: { background: true } }] },
];
module.exports = scenarios.flatMap((s) => [BASE, 'working'].map((app) => ({ ...s, name: `${s.id}-${app === 'working' ? 'novo' : 'antes'}`, app })));
