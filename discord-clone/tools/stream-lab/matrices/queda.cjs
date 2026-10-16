// Quedas de rede de quem transmite (cfg.netEvents com loss: 100 = nenhum pacote passa, via nftables).
// "7s-e-45s": uma queda curta que volta sozinha e, depois, uma de 45 s. "40s": uma queda só.
// Antes (commit 19dd1e7) × agora: a transmissão volta quando a rede volta?
const BASE = process.env.STREAM_LAB_BASELINE || '19dd1e7';
const base = { clip: 'desktop30', fps: 30, preset: 'p1080', viewers: 1, compareHeights: [1080], warmup: 5 };
const scenarios = [
  { id: 'queda-7s-e-45s', ...base, duration: 100, netEvents: [{ at: 10, loss: 100 }, { at: 17, loss: 0 }, { at: 30, loss: 100 }, { at: 75, loss: 0 }] },
  { id: 'queda-40s', ...base, duration: 70, netEvents: [{ at: 10, loss: 100 }, { at: 50, loss: 0 }] },
];
module.exports = scenarios.flatMap((s) => [BASE, 'working'].map((app) => ({ ...s, name: `${s.id}-${app === 'working' ? 'novo' : 'antes'}`, app })));
