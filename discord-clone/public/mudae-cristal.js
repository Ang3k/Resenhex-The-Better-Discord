/* Cristal errante do Mudae (como o cookie dourado): aparece para todo mundo no Salão ao mesmo tempo, atravessa a
   tela e some. O servidor sorteia o cristal, diz quando ele aparece (appearAt, na hora do servidor), quanto tempo
   vive (life) e confere cada clique; aqui o navegador só desenha o voo, que sai do seed (todos veem o mesmo
   caminho), e manda o clique. No modo simplificado (attach sem container), o cristal vira uma linha do bot com o
   botão "Pegar" (com o kakera). O fim do cristal sempre vira a linha de quem pegou. Essas linhas são só ao vivo. */
window.MudaeCrystals = function ({ el, call, onSocket, Sounds, ui, member, reducedMotion, addLiveLine }) {
  const now = () => ui.serverNow();
  const FADE_IN = 0.12; // surge nos primeiros 12% da vida...
  const FADE_OUT = 0.2; // ...e esmaece nos últimos 20%
  const DROP_MS = 2600; // quanto cada gota da chuva leva para cair
  const SIZE = { gem: 60, drop: 44 }; // alvo do clique (o desenho é menor que isso)
  const PAD = 8;

  let host = null; // onde o cristal aparece agora: { container, channel, hooks, layer }
  const crystals = new Map(); // id -> { v, timers, sprites, mine }
  const sprites = new Set(); // tudo que se mexe a cada quadro
  let frame = 0;

  // ---------- sorteio do caminho: o mesmo seed dá o mesmo voo em todas as telas ----------
  function random(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const easeInOut = (k) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);
  // Sai da carta crescendo, com uma sobra de mola no fim.
  const popOut = (k) => { const c = 1.9; const x = k - 1; return 1 + (c + 1) * x ** 3 + c * x ** 2; };
  // Opacidade pela fração da vida: aparece aos poucos e esmaece no fim.
  const envelope = (fadeIn, fadeOut) => (k) => clamp(k < fadeIn ? k / fadeIn : k > 1 - fadeOut ? (1 - k) / fadeOut : 1) ** 1.6;
  const lifeFade = envelope(FADE_IN, FADE_OUT);

  // Pontos em frações da área (0 a 1); o quadro converte para pixels de cada tela.
  function drifterPath(r, from) {
    const dir = r() < 0.5 ? 1 : -1;
    const a = from || { x: dir > 0 ? -0.06 : 1.06, y: 0.15 + r() * 0.55 };
    const side = from ? (a.x < 0.5 ? 1 : -1) : dir;
    const b = from ? { x: clamp(a.x + side * (0.35 + r() * 0.3), 0.04, 0.96), y: 0.1 + r() * 0.7 }
      : { x: dir > 0 ? 0.8 + r() * 0.2 : 0.2 - r() * 0.2, y: 0.1 + r() * 0.7 };
    const amp = (from ? 0.035 : 0.05) + r() * 0.04, waves = 1 + r(), phase = r() * Math.PI * 2;
    return (k) => {
      const e = easeInOut(k);
      // A onda começa no zero: o cristal da carta sai do meio dela.
      const wave = (Math.sin(phase + k * Math.PI * 2 * waves) - Math.sin(phase)) * amp;
      return { x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e + wave, s: from && k < FADE_IN ? 0.3 + 0.7 * popOut(k / FADE_IN) : 1 };
    };
  }
  function chainPath(r) {
    const a = { x: 0.15 + r() * 0.7, y: 0.15 + r() * 0.6 };
    const b = { x: clamp(a.x + (r() - 0.5) * 0.25), y: clamp(a.y + (r() - 0.5) * 0.2) };
    const phase = r() * Math.PI * 2;
    return (k) => { const e = easeInOut(k); return { x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e + Math.sin(phase + k * Math.PI * 2) * 0.02 }; };
  }
  function dropPath(r) {
    const x = 0.04 + r() * 0.92, dx = (r() - 0.5) * 0.15, phase = r() * Math.PI * 2;
    // Cai acelerando, balançando um pouco (nasce na beira de cima da área, sem passar por cima das abas).
    return (k) => ({ x: x + dx * k + Math.sin(phase + k * 7) * 0.012, y: -0.02 + 1.07 * (0.4 * k + 0.6 * k * k) });
  }
  // Com "Reduzir animações": parado num ponto que também sai do seed.
  const still = (r) => ({ x: 0.12 + r() * 0.76, y: 0.12 + r() * 0.7 });

  // ---------- a camada por cima do Salão ----------
  function measure() {
    const lr = host.layer.getBoundingClientRect();
    const area = host.hooks.area?.();
    const ar = area?.isConnected ? area.getBoundingClientRect() : lr;
    // Sem tamanho (aba escondida, teste), usa uma área mínima para o caminho continuar fazendo sentido.
    return { x: ar.left - lr.left, y: ar.top - lr.top, w: Math.max(ar.width, 320), h: Math.max(ar.height, 320) };
  }
  // Ponto (em frações da área) do centro de um elemento da tela, para o cristal sair de dentro da carta.
  function pointOf(node, box, size) {
    if (!node?.isConnected) return null;
    const r = node.getBoundingClientRect(), lr = host.layer.getBoundingClientRect();
    if (!r.width) return null;
    const cx = r.left - lr.left + r.width / 2, cy = r.top - lr.top + r.height / 2;
    if (cx < box.x || cx > box.x + box.w || cy < box.y || cy > box.y + box.h) return null;
    return { x: (cx - size / 2 - box.x - PAD) / Math.max(1, box.w - size - 2 * PAD), y: (cy - size / 2 - box.y - PAD) / Math.max(1, box.h - size - 2 * PAD) };
  }
  function toPixels(p, box, size) {
    return { x: box.x + PAD + p.x * Math.max(0, box.w - size - 2 * PAD), y: box.y + PAD + p.y * Math.max(0, box.h - size - 2 * PAD) };
  }

  // Lasca de cristal pontuda em cima e embaixo (o mesmo desenho do ícone do kakera, mudae-icones.js): faces da esquerda
  // claras, da direita escuras, a face da frente no meio e uma aresta de luz.
  const GEM_SVG = '<svg class="mudae-crystal-gem" viewBox="0 0 64 64" aria-hidden="true">'
    + '<polygon class="g-body" points="32,2 49,19 49,45 32,62 15,45 15,19"/>'
    + '<polygon class="g-left" points="32,2 15,19 15,45 32,62 25,45 25,19"/><polygon class="g-right" points="32,2 49,19 49,45 32,62 39,45 39,19"/>'
    + '<polygon class="g-light" points="32,2 39,19 39,45 32,62 25,45 25,19"/><polygon class="g-top" points="32,2 25,19 39,19"/>'
    + '<polyline class="g-edge" points="32,5 25.5,19.5 25.5,44.5 31,58"/>'
    + '<path class="g-shine" d="M21 9l1.6 3.4L26 14l-3.4 1.6L21 19l-1.6-3.4L16 14l3.4-1.6z"/></svg>';
  const MI = window.MudaeIcon || Object.assign(() => document.createElement('span'), { inline: () => document.createElement('span') });

  // Um cristal na tela (ou uma gota da chuva): o botão, o caminho e a janela de tempo dele.
  function addSprite(c, { gem, start, dur, path, fixed, fade, drop = false }) {
    const v = c.v;
    const size = drop ? SIZE.drop : SIZE.gem;
    const node = el('button', { type: 'button', class: 'mudae-crystal' + (drop ? ' drop' : '') + (v.kind === 'chain' ? ' chain' : ''),
      ariaLabel: `Pegar o cristal ${v.colorKey}` });
    node.dataset.id = v.id;
    node.dataset.gem = String(gem);
    node.style.setProperty('--c', v.color);
    node.style.opacity = '0';
    node.append(el('span', { class: 'mudae-crystal-glow' }), el('span', { class: 'mudae-crystal-body' }));
    node.lastChild.innerHTML = GEM_SVG;
    if (v.kind === 'chain') node.append(el('span', { class: 'mudae-crystal-step' }, MI('link', 12), String(v.step)));
    const sp = { c, gem, node, size, start, dur, path, fixed, fade, drop, x: 0, y: 0, spark: 0, pending: false };
    // No toque e no mouse, o clique vale ao apertar (o cristal está se mexendo); no teclado, Enter ou espaço.
    node.addEventListener('pointerdown', (e) => { if (e.button > 0) return; e.preventDefault(); take(sp); });
    node.addEventListener('click', (e) => { if (e.detail === 0) take(sp); });
    c.sprites.add(sp);
    sprites.add(sp);
    host.layer.append(node);
    place(sp, now(), measure(), reducedMotion());
    kick();
    return sp;
  }
  function removeSprite(sp) {
    sp.node.remove();
    sp.c.sprites.delete(sp);
    sprites.delete(sp);
  }

  function place(sp, t, box, reduced) {
    const k = clamp((t - sp.start) / sp.dur);
    const p = reduced ? sp.fixed : sp.path(k);
    const { x, y } = toPixels(p, box, sp.size);
    const scale = reduced ? 1 : p.s ?? 1;
    sp.x = x;
    sp.y = y;
    sp.node.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)` + (scale !== 1 ? ` scale(${scale.toFixed(3)})` : '');
    const opacity = Math.round(sp.fade(k) * 1000) / 1000;
    sp.node.style.opacity = String(opacity);
    // Rastro de brilho caindo atrás do cristal.
    if (!reduced && opacity > 0.3 && t - sp.spark > (sp.drop ? 150 : 90)) {
      sp.spark = t;
      sparkle(x + sp.size / 2 + (Math.random() - 0.5) * sp.size * 0.3, y + sp.size * (sp.drop ? 0.6 : 0.72), sp.c.v.color);
    }
  }

  function kick() {
    if (!frame && sprites.size && host?.layer) frame = requestFrame(draw);
  }
  const requestFrame = (fn) => (window.requestAnimationFrame ? window.requestAnimationFrame(fn) : setTimeout(fn, 16));
  const cancelFrame = (id) => (window.cancelAnimationFrame ? window.cancelAnimationFrame(id) : clearTimeout(id));
  function draw() {
    frame = 0;
    if (!host?.layer || !sprites.size) return;
    const box = measure(); // uma leitura de layout por quadro, antes de mexer em qualquer coisa
    const t = now();
    const reduced = reducedMotion();
    for (const sp of sprites) place(sp, t, box, reduced);
    frame = requestFrame(draw);
  }

  // ---------- efeitos: brilho, estilhaços, "+valor" e faixas ----------
  // Some sozinho: a animação é só enfeite, quem tira da tela é o relógio.
  // anim: move (as posições, freando no fim) e fade (a opacidade, no ritmo do relógio, para não sumir antes da hora).
  // A curva de quem chega freando é a do app (--ease-enter, no motion.css); sem ela (teste), a do navegador.
  const EASE_OUT = getComputedStyle(document.documentElement).getPropertyValue('--ease-enter').trim() || 'ease-out';
  function effect(cls, x, y, color, anim, ms, ...children) {
    const node = el('div', { class: cls }, ...children);
    node.style.left = x + 'px';
    node.style.top = y + 'px';
    node.style.setProperty('--c', color);
    host.layer.append(node);
    if (anim && node.animate) {
      const frames = (list, key) => list.map((f) => (typeof f === 'object' ? f : { [key]: f }));
      if (anim.move) node.animate(frames(anim.move, 'transform'), { duration: ms, easing: anim.ease || EASE_OUT, fill: 'forwards' });
      if (anim.fade) node.animate(frames(anim.fade, 'opacity'), { duration: ms, easing: 'linear', fill: 'forwards' });
    }
    setTimeout(() => node.remove(), ms);
    return node;
  }
  function sparkle(x, y, color) {
    const dx = (Math.random() - 0.5) * 20, dy = 10 + Math.random() * 16;
    effect('mudae-crystal-spark', x, y, color, { move: ['translate(0, 0) scale(1)', `translate(${dx}px, ${dy}px) scale(.3)`], fade: [0.9, 0] }, 900);
  }
  function burst(sp, res) {
    if (!host?.layer?.isConnected) return;
    const v = sp.c.v;
    const x = sp.x + sp.size / 2, y = sp.y + sp.size / 2;
    const reduced = reducedMotion();
    if (!reduced) {
      effect('mudae-crystal-ring', x, y, v.color, { move: ['translate(-50%, -50%) scale(.4)', 'translate(-50%, -50%) scale(2.4)'], fade: [0.9, 0] }, 550);
      const n = sp.drop ? 7 : 11;
      for (let i = 0; i < n; i++) {
        const a = (Math.PI * 2 * i) / n + Math.random() * 0.5, d = (sp.drop ? 26 : 40) + Math.random() * 40;
        effect('mudae-crystal-shard', x, y, v.color, { move: ['translate(-50%, -50%) rotate(0deg)',
          `translate(calc(-50% + ${(Math.cos(a) * d).toFixed(1)}px), calc(-50% + ${(Math.sin(a) * d).toFixed(1)}px)) rotate(${Math.round(Math.random() * 360)}deg)`],
        fade: [1, { opacity: 1, offset: 0.35 }, 0] }, 650);
      }
    }
    // O que está escrito embaixo do valor: o teto do dia ou a corrente.
    const note = res.full === false ? 'limite do dia' : v.kind === 'chain' && v.step < 5 ? 'o próximo vale mais!' : '';
    const box = measure();
    // Perto da beira, o texto fica inteiro dentro da área (a frase de baixo é mais larga que o valor).
    const margin = note ? 72 : 48;
    const px = clamp(x, box.x + margin, box.x + box.w - margin);
    // O valor sobe devagar e fica legível quase o tempo todo; só esmaece no fim. Com "Reduzir animações", fica parado e só esmaece.
    effect('mudae-crystal-pop', px, y, v.color, {
      move: reduced ? null : ['translate(-50%, -50%) scale(.6)', { transform: 'translate(-50%, -85%) scale(1.1)', offset: 0.15 }, { transform: 'translate(-50%, -110%) scale(1)', offset: 0.3 },
        'translate(-50%, -175%) scale(1)'],
      ease: 'ease-out', fade: [0, { opacity: 1, offset: 0.1 }, { opacity: 1, offset: 0.7 }, 0] }, 1300,
    el('strong', { textContent: '+' + ui.num(res.amount) }), note ? el('small', { textContent: note }) : null);
    if (v.kind === 'chain' && v.step === 5) banner('Corrente completa!', v.color, 'link');
  }
  function banner(text, color, icon = 'kakera') {
    if (!host?.layer) return;
    const box = measure();
    effect('mudae-crystal-banner', box.x + box.w / 2, box.y + 12, color, null, 2600, el('span', {}, MI.inline(icon), text));
  }

  // ---------- clique ----------
  async function take(sp) {
    if (sp.pending || !sp.node.isConnected) return;
    const c = sp.c;
    sp.pending = true;
    sp.node.classList.add('pending');
    const res = await call('mudae:crystal:take', { id: c.v.id, gem: sp.gem });
    sp.pending = false;
    sp.node.classList.remove('pending');
    // Recusado (o aviso já apareceu): se ainda está na tela, dá para tentar de novo.
    if (!res?.ok) return;
    c.mine.add(sp.gem);
    burst(sp, res);
    removeSprite(sp);
    host?.hooks.onKakera?.(res.kakera, res.amount);
  }

  // ---------- cada cristal: quando aparece, quando some ----------
  function later(c, fn, ms) {
    c.timers.push(setTimeout(fn, Math.max(0, ms)));
  }

  function schedule(c) {
    const v = c.v;
    const t = now();
    if (t >= v.appearAt + v.life) return;
    if (!host.layer) {
      // Modo simplificado: a linha do bot com o botão. Só na hora em que aparece (o da carta espera a roleta parar).
      later(c, () => { Sounds.play('mudaeCrystal'); addLiveLine(host.channel, { kind: 'crystal', crystal: v }); }, v.appearAt - t);
      return;
    }
    later(c, () => appear(c), v.appearAt - t);
    later(c, () => { for (const sp of [...c.sprites]) removeSprite(sp); }, v.appearAt + v.life - t);
    if (v.kind !== 'storm') return;
    // A chuva: as gotas caem uma depois da outra durante a vida dela, cada uma com o seu número.
    const r = random(v.seed);
    const dur = Math.min(DROP_MS, v.life * 0.6);
    const every = v.gems > 1 ? (v.life - dur) / (v.gems - 1) : 0;
    for (let gem = 0; gem < v.gems; gem++) {
      const start = v.appearAt + gem * every;
      const drop = { gem, start, dur, path: dropPath(r), fixed: still(r), fade: envelope(0.08, 0.12), drop: true };
      if (start + dur <= t) continue;
      later(c, () => { if (!c.mine.has(gem)) drop.sprite = addSprite(c, drop); }, start - t);
      later(c, () => drop.sprite && removeSprite(drop.sprite), start + dur - t);
    }
  }

  function appear(c) {
    if (!host?.layer) return;
    const v = c.v;
    Sounds.play('mudaeCrystal');
    if (v.kind === 'storm') {
      const who = v.by && member(v.by)?.name;
      return banner(who ? `${who} chamou uma chuva de cristais!` : 'Chuva de cristais!', v.color, 'chuva');
    }
    if (v.kind === 'chain' && v.step === 1) banner('Corrente de cristais!', v.color, 'link');
    if (c.mine.has(0)) return;
    const r = random(v.seed);
    const box = measure();
    // O cristal que nasce de um roll sai de dentro da carta, se ela está na tela.
    const card = v.from ? host.hooks.origin?.(v.from.msgId) : null;
    const from = card ? pointOf(card, box, SIZE.gem) : null;
    if (from) flare(card, v.color);
    addSprite(c, { gem: 0, start: v.appearAt, dur: v.life, path: v.kind === 'chain' ? chainPath(r) : drifterPath(r, from), fixed: still(random(v.seed + 1)), fade: lifeFade });
  }

  // A carta acende na cor do cristal quando ele sai de dentro dela. O brilho é da própria carta (a sombra dela),
  // para andar junto enquanto ela ainda está virando; a sombra de antes volta sozinha no fim.
  function flare(card, color) {
    if (reducedMotion() || !card.animate) return;
    card.animate([{ offset: 0.25, boxShadow: `0 0 0 3px ${color}, 0 0 42px 8px color-mix(in srgb, ${color} 70%, transparent)` }],
      { duration: 900, easing: 'ease-out' });
  }

  function forget(c) {
    c.timers.forEach(clearTimeout);
    c.timers = [];
    for (const sp of [...c.sprites]) removeSprite(sp);
    crystals.delete(c.v.id);
  }

  onSocket('mudae:crystal', (v) => {
    if (!host || !v?.id || crystals.has(v.id)) return;
    const c = { v, timers: [], sprites: new Set(), mine: new Set() };
    crystals.set(v.id, c);
    schedule(c);
    // Se o fim nunca chegar (a conexão caiu), o registro sai sozinho depois.
    later(c, () => forget(c), v.appearAt + v.life + 20_000 - now());
  });
  onSocket('mudae:crystal:end', (e) => {
    if (!host || !e?.id) return;
    // Quem entrou no Salão com o cristal já voando não tem o registro dele, mas a linha de quem pegou vale igual.
    const c = crystals.get(e.id);
    if (c) forget(c);
    // Ninguém pegou: nada no chat (com um cristal a cada 5–15 min, o Salão aberto e vazio encheria o chat dessas linhas).
    if (!e.takers?.length) return;
    addLiveLine(host.channel, { kind: 'crystalEnd', crystal: e });
  });

  // container: a tela do Salão (o cristal voa por cima dela) ou null no modo simplificado (vira linha no chat).
  // hooks: area() (onde o cristal voa), origin(msgId) (a carta de um roll) e onKakera(saldo, ganho).
  function attach(container, channel, hooks = {}) {
    detach();
    const layer = container ? el('div', { class: 'mudae-crystal-layer' }) : null;
    host = { container, channel, hooks, layer };
    if (layer) container.append(layer);
  }
  function detach() {
    if (!host) return;
    for (const c of [...crystals.values()]) forget(c);
    if (frame) cancelFrame(frame);
    frame = 0;
    host.layer?.remove();
    host = null;
  }

  return { attach, detach };
};
