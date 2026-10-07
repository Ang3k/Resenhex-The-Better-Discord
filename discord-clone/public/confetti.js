// Confete estourando (usado nas Novidades da versão 1.0). Peças de DOM animadas com a
// Web Animations API: cada uma sai de um "canhão" com velocidade, resistência do ar e gravidade.
window.Confetti = (() => {
  const COLORS = ['#6d5dfc', '#c64cf0', '#4fd192', '#a79ffd', '#f5a65b', '#ffd84d', '#ff6b9d', '#5ec8ff'];
  const GRAVITY = 900; // px/s²
  const DRAG = 0.9; // resistência do ar (1/s)
  const STEPS = 14;

  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (list) => list[Math.floor(Math.random() * list.length)];

  // Posição no tempo t com resistência do ar: a peça desacelera e cai em velocidade limite.
  const at = (v0, g, t) => {
    const k = DRAG, e = 1 - Math.exp(-k * t);
    return ((v0 + g / k) * e) / k - (g * t) / k;
  };

  function piece(layer, x, y, angle, speed) {
    const node = document.createElement('i');
    const shape = Math.random();
    const w = shape < 0.25 ? rand(5, 8) : rand(7, 11);
    const h = shape < 0.25 ? w : shape < 0.6 ? rand(10, 16) : w * rand(0.4, 0.7);
    Object.assign(node.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px', background: pick(COLORS), borderRadius: shape < 0.25 ? '50%' : '2px' });
    layer.append(node);
    const vx = Math.cos(angle) * speed, vy = Math.sin(angle) * speed;
    const duration = rand(2.2, 3.4);
    const spin = rand(-900, 900), flip = rand(360, 1080);
    const frames = [];
    for (let i = 0; i <= STEPS; i++) {
      const t = (duration * i) / STEPS;
      const dx = at(vx, 0, t), dy = -at(-vy, GRAVITY, t);
      frames.push({
        transform: `translate(${dx}px, ${dy}px) rotate(${spin * t}deg) rotateX(${flip * t}deg)`,
        opacity: i / STEPS > 0.75 ? 1 - (i / STEPS - 0.75) / 0.25 : 1,
      });
    }
    return node.animate(frames, { duration: duration * 1000, easing: 'linear', fill: 'forwards' }).finished;
  }

  // Dois canhões (cantos de `rect`) atirando para cima e para dentro, em duas rajadas.
  function burst(host, rect) {
    if (typeof Element.prototype.animate !== 'function') return;
    if (matchMedia?.('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.reduceMotion === 'true') return;
    const layer = document.createElement('div');
    layer.className = 'confetti-layer';
    layer.setAttribute('aria-hidden', 'true');
    host.append(layer);
    const cannons = [
      { x: rect.left + 8, y: rect.bottom, angle: -Math.PI * 0.32 }, // esquerda, mirando para cima e para a direita
      { x: rect.right - 8, y: rect.bottom, angle: -Math.PI * 0.68 }, // direita, espelhado
    ];
    const scale = Math.min(1.2, Math.max(0.7, rect.width / 640));
    const shots = [];
    const fire = (count, power) => {
      for (const c of cannons) {
        for (let i = 0; i < count; i++) shots.push(piece(layer, c.x, c.y, c.angle + rand(-0.32, 0.32), rand(700, 1350) * power * scale));
      }
    };
    fire(70, 1);
    setTimeout(() => { if (layer.isConnected) fire(35, 0.8); }, 320);
    setTimeout(() => Promise.allSettled(shots).then(() => layer.remove()), 400);
    return layer;
  }

  return { burst };
})();
