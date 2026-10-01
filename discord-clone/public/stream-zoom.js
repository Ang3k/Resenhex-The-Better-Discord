/* Zoom na transmissão de tela, no computador (no celular, o modo imersivo do mobile-stream.js tem a
   pinça). Vale para a tela em destaque ou em tela cheia:
   - roda do mouse ou pinça do trackpad aproxima no ponto do cursor, com movimento suave;
   - arrastar move a imagem, com inércia; as setas também movem;
   - clique duplo amplia onde clicou e, ampliado, volta ao tamanho original;
   - Shift + arrastar (ou o botão de área) amplia exatamente o retângulo marcado;
   - + / − / 0 no teclado; um minimapa mostra e move a parte visível da tela inteira.
   Os limites são os da imagem real (object-fit: contain), não os das faixas pretas. Como o tamanho
   exibido inclui o zoom, aproximar também pede mais resolução a quem transmite. */
window.StreamZoom = function ({ el, Icon, syncViewerQuality }) {
  const MAX_ZOOM = 8, DOUBLE = 2.5, MINI_W = 176;
  const views = new Map(); // bloco -> estado do zoom
  let qualityTimer = 0;
  let hovered = null; // bloco sob o mouse, para o teclado

  const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.reduceMotion === 'true';
  const typing = () => document.activeElement?.closest?.('input, textarea, select, [contenteditable="true"]');

  // ---------- geometria ----------
  function geometry(v) {
    const W = v.tile.clientWidth, H = v.tile.clientHeight;
    const vw = v.video.videoWidth || 16, vh = v.video.videoHeight || 9;
    const s = Math.min(W / vw, H / vh);
    const cw = vw * s, ch = vh * s;
    return { W, H, cw, ch, ox: (W - cw) / 2, oy: (H - ch) / 2 };
  }
  function clampAxis(pos, z, size, content, offset) {
    if (z * content <= size) return (size - z * content) / 2 - z * offset;
    return Math.min(-z * offset, Math.max(size - z * (offset + content), pos));
  }
  function clamped(v, z, x, y) {
    const g = geometry(v);
    return { z, x: clampAxis(x, z, g.W, g.cw, g.ox), y: clampAxis(y, z, g.H, g.ch, g.oy) };
  }
  function clamp(v) { Object.assign(v, clamped(v, v.z, v.x, v.y)); }
  // Mantém parado o ponto (px, py) do bloco enquanto o zoom muda.
  function around(v, z, px, py) {
    return { z, x: px - (px - v.x) * z / v.z, y: py - (py - v.y) * z / v.z };
  }

  // ---------- desenho ----------
  function apply(v) {
    if (v.frame) return;
    v.frame = requestAnimationFrame(() => {
      v.frame = 0;
      const zoomed = v.z > 1.005;
      v.video.style.transform = zoomed ? `translate3d(${v.x}px, ${v.y}px, 0) scale(${v.z})` : '';
      v.tile.classList.toggle('sz-zoomed', zoomed);
      v.level.textContent = Math.round(v.z * 100) + '%';
      v.out.disabled = !zoomed;
      v.in.disabled = v.z >= MAX_ZOOM - .01;
      v.fit.disabled = !zoomed;
      drawViewport(v);
      if (zoomed) startMinimap(v); else stopMinimap(v);
    });
  }
  function changed(v) {
    apply(v);
    wake(v);
    clearTimeout(qualityTimer);
    qualityTimer = setTimeout(syncViewerQuality, 350);
  }

  // ---------- movimento ----------
  function stop(v) {
    cancelAnimationFrame(v.glide); cancelAnimationFrame(v.tween); cancelAnimationFrame(v.fling);
    v.glide = v.tween = v.fling = 0;
  }
  // Roda do mouse: o alvo acumula e o zoom desliza até ele, sempre preso ao ponto do cursor.
  function glideTo(v, z, px, py) {
    cancelAnimationFrame(v.tween); cancelAnimationFrame(v.fling); v.tween = v.fling = 0;
    v.target = Math.min(MAX_ZOOM, Math.max(1, z));
    v.anchor = { x: px, y: py };
    if (reduceMotion()) { Object.assign(v, around(v, v.target, px, py)); clamp(v); changed(v); return; }
    if (v.glide) return;
    const step = () => {
      const next = Math.abs(v.target - v.z) < .002 ? v.target : v.z + (v.target - v.z) * .28;
      Object.assign(v, around(v, next, v.anchor.x, v.anchor.y));
      clamp(v);
      changed(v);
      v.glide = next === v.target ? 0 : requestAnimationFrame(step);
    };
    v.glide = requestAnimationFrame(step);
  }
  // Clique duplo, botões, teclado e área marcada: transição curta até o enquadramento final.
  function animateTo(v, to) {
    stop(v);
    to = clamped(v, Math.min(MAX_ZOOM, Math.max(1, to.z)), to.x, to.y);
    v.target = to.z;
    if (reduceMotion()) { Object.assign(v, to); changed(v); return; }
    const from = { z: v.z, x: v.x, y: v.y }, start = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - start) / 260), e = 1 - (1 - t) ** 3;
      v.z = from.z + (to.z - from.z) * e; v.x = from.x + (to.x - from.x) * e; v.y = from.y + (to.y - from.y) * e;
      changed(v);
      v.tween = t < 1 ? requestAnimationFrame(step) : 0;
    };
    v.tween = requestAnimationFrame(step);
  }
  function zoomBy(v, factor, px, py) {
    const g = geometry(v);
    animateTo(v, around(v, Math.min(MAX_ZOOM, Math.max(1, v.z * factor)), px ?? g.W / 2, py ?? g.H / 2));
  }
  function reset(v) { animateTo(v, { z: 1, x: 0, y: 0 }); }
  function fling(v, vx, vy) {
    if (reduceMotion()) return;
    let last = performance.now();
    const step = (now) => {
      const dt = Math.min(32, now - last); last = now;
      const decay = Math.pow(.92, dt / 16);
      vx *= decay; vy *= decay;
      const bx = v.x, by = v.y;
      v.x += vx * dt; v.y += vy * dt; clamp(v); changed(v);
      if (v.x === bx) vx = 0;
      if (v.y === by) vy = 0;
      v.fling = Math.hypot(vx, vy) > .02 ? requestAnimationFrame(step) : 0;
    };
    v.fling = requestAnimationFrame(step);
  }
  // Amplia o retângulo marcado (coordenadas do bloco) para ocupar o bloco inteiro.
  function zoomToRect(v, r) {
    const g = geometry(v);
    const u = { x: (r.x - v.x) / v.z, y: (r.y - v.y) / v.z, w: r.w / v.z, h: r.h / v.z };
    const z = Math.min(MAX_ZOOM, Math.max(1, Math.min(g.W / u.w, g.H / u.h)));
    animateTo(v, { z, x: g.W / 2 - z * (u.x + u.w / 2), y: g.H / 2 - z * (u.y + u.h / 2) });
  }

  // ---------- controles na tela: barra de zoom, dica e minimapa ----------
  function wake(v) {
    v.tile.classList.add('sz-awake');
    clearTimeout(v.idle);
    v.idle = setTimeout(() => { if (!v.drag && !v.sel) v.tile.classList.remove('sz-awake'); }, 2200);
  }
  function build(v) {
    const button = (label, icon, onclick, cls = '') => el('button', { type: 'button', class: 'sz-btn ' + cls, tip: label, ariaLabel: label,
      onclick: (e) => { e.stopPropagation(); onclick(e); } }, Icon(icon, 18));
    v.out = button('Afastar (−)', 'zoomOut', () => zoomBy(v, 1 / 1.5));
    v.in = button('Aproximar (+)', 'zoomIn', () => zoomBy(v, 1.5));
    v.level = el('button', { type: 'button', class: 'sz-level', tip: 'Voltar ao tamanho original (0)', ariaLabel: 'Voltar ao tamanho original',
      onclick: (e) => { e.stopPropagation(); reset(v); } });
    v.area = button('Ampliar uma área (Shift + arrastar)', 'scan', () => { v.areaMode = !v.areaMode; v.tile.classList.toggle('sz-picking', v.areaMode); v.area.classList.toggle('active', v.areaMode); });
    v.fit = button('Ajustar à tela (0)', 'shrink', () => reset(v));
    v.hud = el('div', { class: 'sz-hud', role: 'toolbar', ariaLabel: 'Zoom da transmissão' }, v.out, v.level, v.in, el('span', { class: 'sz-sep' }), v.area, v.fit);
    v.canvas = el('canvas', { class: 'sz-mini-frame' });
    v.port = el('div', { class: 'sz-mini-port' });
    v.mini = el('div', { class: 'sz-mini', tip: 'Arraste para mover a parte visível' }, v.canvas, v.port);
    v.box = el('div', { class: 'sz-select hidden' });
    v.tile.append(v.hud, v.mini, v.box);
    v.mini.addEventListener('pointerdown', miniDown.bind(null, v));
  }

  function startMinimap(v) {
    if (v.drawer) return;
    const draw = () => {
      const { video, canvas } = v;
      if (!video.videoWidth || !v.enabled) return;
      const w = MINI_W, h = Math.round(MINI_W * video.videoHeight / video.videoWidth);
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; v.mini.style.height = h + 'px'; drawViewport(v); }
      try { (v.ctx ||= canvas.getContext('2d')).drawImage(video, 0, 0, w, h); } catch {}
    };
    draw();
    v.drawer = setInterval(draw, 150);
  }
  function stopMinimap(v) { clearInterval(v.drawer); v.drawer = 0; }
  function drawViewport(v) {
    const g = geometry(v);
    const mh = v.canvas.height || MINI_W * 9 / 16;
    // Parte da imagem visível, em fração da imagem inteira.
    const fx = Math.max(0, (-v.x / v.z - g.ox) / g.cw), fy = Math.max(0, (-v.y / v.z - g.oy) / g.ch);
    const fw = Math.min(1 - fx, g.W / v.z / g.cw), fh = Math.min(1 - fy, g.H / v.z / g.ch);
    Object.assign(v.port.style, { left: fx * MINI_W + 'px', top: fy * mh + 'px', width: fw * MINI_W + 'px', height: fh * mh + 'px' });
  }
  // Clicar no minimapa centraliza ali; arrastar acompanha.
  function miniDown(v, e) {
    e.stopPropagation();
    e.preventDefault();
    stop(v);
    try { v.mini.setPointerCapture(e.pointerId); } catch {}
    const move = (ev) => {
      const r = v.mini.getBoundingClientRect(), g = geometry(v);
      const fx = Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width)), fy = Math.min(1, Math.max(0, (ev.clientY - r.top) / r.height));
      Object.assign(v, clamped(v, v.z, g.W / 2 - v.z * (g.ox + fx * g.cw), g.H / 2 - v.z * (g.oy + fy * g.ch)));
      changed(v);
    };
    const up = () => { v.mini.removeEventListener('pointermove', move); v.mini.removeEventListener('pointerup', up); v.mini.removeEventListener('pointercancel', up); };
    v.mini.addEventListener('pointermove', move);
    v.mini.addEventListener('pointerup', up);
    v.mini.addEventListener('pointercancel', up);
    move(e);
  }

  // ---------- mouse ----------
  const local = (v, e) => { const r = v.tile.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const onUi = (e) => !!e.target.closest?.('.sz-hud, .sz-mini, .tile-controls, .watch-btn, .stats');

  function wheel(v, e) {
    if (!v.enabled || onUi(e)) return;
    // Afastando sem zoom: deixa o palco rolar normalmente.
    if (v.z <= 1.005 && (v.target ?? 1) <= 1.005 && e.deltaY > 0) return;
    e.preventDefault();
    const p = local(v, e);
    const lines = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
    // A pinça do trackpad chega como roda com Ctrl e passos pequenos: mais sensível.
    const k = e.ctrlKey ? 100 : 420;
    glideTo(v, (v.target ?? v.z) * Math.exp(-e.deltaY * lines / k), p.x, p.y);
  }
  function down(v, e) {
    if (!v.enabled || e.button !== 0 || onUi(e)) return;
    stop(v);
    const p = local(v, e);
    if (e.shiftKey || v.areaMode) {
      v.sel = { x: p.x, y: p.y };
      Object.assign(v.box.style, { left: p.x + 'px', top: p.y + 'px', width: 0, height: 0 });
      v.box.classList.remove('hidden');
    } else if (v.z > 1.005) {
      v.drag = { x: p.x, y: p.y, t: performance.now(), vx: 0, vy: 0, moved: 0 };
      v.tile.classList.add('sz-dragging');
    } else return;
    e.preventDefault();
    try { v.tile.setPointerCapture(e.pointerId); } catch {}
    v.moved = false;
  }
  function move(v, e) {
    if (v.enabled) wake(v);
    const p = local(v, e);
    if (v.sel) {
      const x = Math.min(p.x, v.sel.x), y = Math.min(p.y, v.sel.y);
      Object.assign(v.box.style, { left: x + 'px', top: y + 'px', width: Math.abs(p.x - v.sel.x) + 'px', height: Math.abs(p.y - v.sel.y) + 'px' });
      if (Math.hypot(p.x - v.sel.x, p.y - v.sel.y) > 4) v.moved = true;
      return;
    }
    if (!v.drag) return;
    const now = performance.now(), dt = Math.max(1, now - v.drag.t);
    const dx = p.x - v.drag.x, dy = p.y - v.drag.y;
    v.drag.moved += Math.abs(dx) + Math.abs(dy);
    if (v.drag.moved > 4) v.moved = true;
    v.drag.vx = .8 * (dx / dt) + .2 * v.drag.vx; v.drag.vy = .8 * (dy / dt) + .2 * v.drag.vy;
    v.drag.x = p.x; v.drag.y = p.y; v.drag.t = now;
    v.x += dx; v.y += dy; clamp(v); changed(v);
  }
  function up(v, e) {
    if (v.sel) {
      const p = local(v, e), sel = v.sel;
      v.sel = null;
      v.box.classList.add('hidden');
      v.areaMode = false; v.tile.classList.remove('sz-picking'); v.area.classList.remove('active');
      const r = { x: Math.min(p.x, sel.x), y: Math.min(p.y, sel.y), w: Math.abs(p.x - sel.x), h: Math.abs(p.y - sel.y) };
      if (r.w > 12 && r.h > 12) zoomToRect(v, r);
      return;
    }
    if (!v.drag) return;
    const drag = v.drag;
    v.drag = null;
    v.tile.classList.remove('sz-dragging');
    if (performance.now() - drag.t < 80 && Math.hypot(drag.vx, drag.vy) > .25) fling(v, drag.vx, drag.vy);
  }

  function keydown(e) {
    const v = [...views.values()].find((s) => s.enabled && (s.tile === hovered || document.fullscreenElement === s.tile));
    if (!v || typing() || e.ctrlKey || e.metaKey || e.altKey) return;
    const pan = 80;
    const actions = {
      '+': () => zoomBy(v, 1.5), '=': () => zoomBy(v, 1.5), '-': () => zoomBy(v, 1 / 1.5), '0': () => reset(v),
      ArrowLeft: () => v.z > 1.005 && animateTo(v, { z: v.z, x: v.x + pan, y: v.y }),
      ArrowRight: () => v.z > 1.005 && animateTo(v, { z: v.z, x: v.x - pan, y: v.y }),
      ArrowUp: () => v.z > 1.005 && animateTo(v, { z: v.z, x: v.x, y: v.y + pan }),
      ArrowDown: () => v.z > 1.005 && animateTo(v, { z: v.z, x: v.x, y: v.y - pan }),
    };
    const run = actions[e.key];
    if (!run || (e.key.startsWith('Arrow') && v.z <= 1.005)) return;
    e.preventDefault();
    run();
  }
  document.addEventListener('keydown', keydown);

  function setup(tile) {
    const v = { tile, video: tile.querySelector('video'), z: 1, x: 0, y: 0, target: 1, enabled: false, frame: 0, glide: 0, tween: 0, fling: 0, drawer: 0 };
    build(v);
    tile.addEventListener('wheel', (e) => wheel(v, e), { passive: false });
    tile.addEventListener('pointerdown', (e) => down(v, e));
    tile.addEventListener('pointermove', (e) => move(v, e));
    tile.addEventListener('pointerup', (e) => up(v, e));
    tile.addEventListener('pointercancel', (e) => up(v, e));
    tile.addEventListener('pointerenter', () => { hovered = tile; });
    tile.addEventListener('pointerleave', () => { if (hovered === tile) hovered = null; });
    // A resolução recebida muda com a qualidade: refaz os limites sobre a imagem nova.
    v.video.addEventListener('resize', () => { clamp(v); apply(v); });
    new ResizeObserver(() => { if (v.z > 1.005) { clamp(v); apply(v); } }).observe(tile);
    views.set(tile, v);
    return v;
  }

  function disable(v) {
    stop(v);
    stopMinimap(v);
    Object.assign(v, { z: 1, x: 0, y: 0, target: 1, drag: null, sel: null, areaMode: false });
    v.tile.classList.remove('sz-on', 'sz-zoomed', 'sz-dragging', 'sz-picking', 'sz-awake');
    v.box.classList.add('hidden');
    v.video.style.transform = '';
  }

  // Chamado a cada renderização do palco: liga o zoom só na tela em destaque ou em tela cheia.
  function sync(tile, enabled) {
    for (const [t, v] of views) if (!t.isConnected) { disable(v); views.delete(t); }
    const v = views.get(tile) || (enabled ? setup(tile) : null);
    if (!v) return;
    // Outra fonte (trocou de tela ou reconectou): começa enquadrado de novo.
    const source = v.video.srcObject;
    if (v.source !== source) { v.source = source; if (v.enabled) disable(v); v.enabled = false; }
    if (v.enabled === enabled) return;
    if (!enabled) { disable(v); v.enabled = false; return; }
    v.enabled = true;
    tile.classList.add('sz-on');
    apply(v);
    const hints = Number(localStorage.getItem('zoomHints') || 0);
    if (hints < 3) {
      localStorage.setItem('zoomHints', String(hints + 1));
      const hint = el('div', { class: 'sz-hint' }, Icon('zoomIn', 16), 'Role para aproximar · arraste para mover · Shift + arrastar amplia uma área');
      tile.append(hint);
      setTimeout(() => hint.remove(), 4200);
    }
  }

  // Clique depois de arrastar ou marcar uma área não fixa/solta o bloco.
  function consumeClick(tile) {
    const v = views.get(tile);
    if (!v?.moved) return false;
    v.moved = false;
    return true;
  }
  // Clique duplo na tela com zoom ativo: amplia ali, ou volta ao original se já estiver ampliado.
  function dblclick(tile, e) {
    const v = views.get(tile);
    if (!v?.enabled || onUi(e) || e.shiftKey) return false;
    if (v.z > 1.005) reset(v);
    else { const p = local(v, e); zoomBy(v, DOUBLE, p.x, p.y); }
    return true;
  }

  return { sync, consumeClick, dblclick, zoom: (tile) => views.get(tile)?.z || 1 };
};
