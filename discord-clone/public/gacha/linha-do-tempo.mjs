// Linha do tempo da cápsula do Salão do Mudae. É uma função pura do tempo desde o roll: quem entra
// no meio de um roll, ou volta de outra aba, cai no ponto certo sem depender de timers.
// As durações batem com REVEAL_MS do mudae.js (o servidor abre o casamento no fim do OPEN).
export const CRANK = 500;  // o botão da máquina dá uma volta
export const DROP = 600;   // a cápsula sai, quica e rola até o círculo de luz
export const WOBBLE = 450; // cada balançada
export const LOCK = 1000;  // só o lendário: trava, treme e doura
export const OPEN = 400;   // as metades estouram; termina no revealAt
export const AFTER = 3000; // depois da revelação: feixe e luz dourada se apagando até a pose de descanso

const RARITIES = ['common', 'rare', 'epic', 'legendary'];
const LADDER = ['common', 'rare', 'epic']; // um degrau de cor por balançada
const TILT = 0.5;   // radianos no pico da balançada
const SPLASH = 300; // ms de cada respingo
// Quiques da queda, em fração da fase drop: [início, fim, altura do pico].
const HOPS = [[0.35, 0.72, 0.35], [0.72, 0.9, 0.1]];
// Momentos em que a cápsula bate no chão: [fração do drop, força do respingo].
const IMPACTS = [[0.35, 1], [0.72, 0.35], [0.9, 0.1]];

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const easeOut = (x) => 1 - (1 - x) ** 3;
const easeInOut = (x) => (x < 0.5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2);

export const norm = (rarity) => (RARITIES.includes(rarity) ? rarity : 'common');
export const wobbles = (rarity) => ({ common: 1, rare: 2, epic: 3, legendary: 3 })[norm(rarity)];
export const duration = (rarity) => CRANK + DROP + wobbles(rarity) * WOBBLE + (norm(rarity) === 'legendary' ? LOCK : 0) + OPEN;
export const REVEAL_MS = Object.fromEntries(RARITIES.map((r) => [r, duration(r)]));

// Altura da cápsula (1 = um quique alto). Sai da portinhola a 0,4, sobe um pouco, cai e quica duas vezes.
function hopAt(p) {
  if (p < 0.35) { const u = p / 0.35; return 0.4 * (1 - u) + 3.2 * u * (1 - u); }
  for (const [a, b, peak] of HOPS) if (p < b) { const u = (p - a) / (b - a); return peak * 4 * u * (1 - u); }
  return 0;
}

function base() {
  return {
    phase: 'crank', crank: 0, shake: 0, travel: 0, hop: 0.4, visible: false, tilt: 0,
    colorFrom: 'common', colorTo: 'common', colorMix: 1, glow: 0, dots: 0, showDots: 0,
    open: 0, beam: 0, splash: null, camera: 0, gold: 0,
  };
}

// Estado da cena `time` ms depois do roll (Infinity = pose de descanso, cápsula aberta e apagada).
export function state(rarity, time, { reduced = false } = {}) {
  const r = norm(rarity);
  const n = wobbles(r);
  const total = duration(r);
  const t = Math.max(0, time);
  const wobbleStart = CRANK + DROP;
  const lockStart = wobbleStart + n * WOBBLE;
  const openStart = total - OPEN;
  const s = base();

  if (reduced) {
    // Sem movimento: a cápsula já está no círculo de luz, com a cor final, e só abre.
    Object.assign(s, { visible: true, crank: 1, travel: 1, hop: 0, colorFrom: r, colorTo: r, glow: 0.6 });
    s.phase = t < openStart ? 'wobble' : t < total ? 'open' : 'done';
    s.open = clamp((t - openStart) / OPEN);
    s.beam = t < total ? s.open : clamp(1 - (t - total) / 2000);
    return s;
  }

  s.camera = easeInOut(clamp(t / CRANK)) * (1 - easeInOut(clamp((t - total - AFTER + 1000) / 1000)));
  if (t < CRANK) {
    s.crank = easeInOut(t / CRANK);
    s.shake = Math.sin((Math.PI * t) / CRANK);
    return s;
  }
  s.crank = 1;
  s.visible = true;

  if (t < wobbleStart) {
    const p = (t - CRANK) / DROP;
    s.phase = 'drop';
    s.travel = easeOut(p);
    s.hop = hopAt(p);
    s.shake = clamp(1 - p * 4);
    const hit = IMPACTS.filter(([at]) => p >= at).at(-1);
    const since = hit ? (p - hit[0]) * DROP : Infinity;
    if (since < SPLASH) s.splash = { at: since / SPLASH, size: hit[1] };
    return s;
  }
  s.travel = 1;
  s.hop = 0;

  // Cor: cada pico de balançada sobe um degrau (branco → azul → roxo); o dourado só vem na trava.
  const peaks = Math.min(n, Math.max(0, Math.floor((t - wobbleStart - WOBBLE / 2) / WOBBLE) + 1));
  if (peaks > 0) {
    const lastPeak = wobbleStart + (peaks - 0.5) * WOBBLE;
    s.colorFrom = LADDER[Math.max(0, peaks - 2)];
    s.colorTo = LADDER[peaks - 1];
    s.colorMix = clamp((t - lastPeak) / 150);
    s.glow = 0.35 + 0.2 * (peaks - 1);
  }
  s.dots = peaks;

  if (t < lockStart) {
    const k = Math.floor((t - wobbleStart) / WOBBLE);
    const u = (t - wobbleStart) / WOBBLE - k;
    s.phase = 'wobble';
    s.tilt = (k % 2 ? -1 : 1) * TILT * Math.sin(Math.PI * u);
    s.showDots = 1;
    return s;
  }

  if (r === 'legendary' && t < openStart) {
    const p = (t - lockStart) / LOCK;
    s.phase = 'lock';
    s.showDots = 1;
    s.tilt = 0.07 * p * Math.sin(p * Math.PI * 2 * 14);
    const mix = clamp((p - 0.55) / 0.2);
    if (mix > 0) Object.assign(s, { colorFrom: 'epic', colorTo: 'legendary', colorMix: mix });
    s.glow = 0.75 + 0.25 * p;
    s.gold = clamp((p - 0.55) / 0.3);
    return s;
  }
  if (r === 'legendary') Object.assign(s, { colorFrom: 'legendary', colorTo: 'legendary', colorMix: 1, gold: 1 });

  if (t < total) {
    const p = (t - openStart) / OPEN;
    s.phase = 'open';
    s.open = easeOut(p);
    s.beam = p;
    s.glow = 1;
    s.showDots = 1 - p;
    return s;
  }

  const since = t - total;
  s.phase = 'done';
  s.open = 1;
  s.beam = clamp(1 - since / 2000);
  s.glow = 0.3 + 0.7 * clamp(1 - since / AFTER);
  if (r === 'legendary') s.gold = 1 - clamp((since - 1500) / (AFTER - 1500));
  return s;
}

// Momentos de som (ms desde o roll): o Salão toca cada um quando a linha do tempo passa por ele.
export function cues(rarity) {
  const r = norm(rarity);
  const n = wobbles(r);
  const wobbleStart = CRANK + DROP;
  const list = [{ at: 0, name: 'crank' }, ...IMPACTS.map(([p]) => ({ at: CRANK + p * DROP, name: 'bounce' }))];
  for (let i = 0; i < n; i++) list.push({ at: wobbleStart + i * WOBBLE, name: 'wobble' });
  if (r === 'legendary') list.push({ at: wobbleStart + n * WOBBLE, name: 'lock' });
  list.push({ at: duration(r) - OPEN, name: 'pop' });
  return list;
}
