/* Transmissão de tela no celular: tela cheia imersiva, pinça para aproximar, toque duplo, controles por
   toque, tela sempre acesa, codec decodificado por hardware e um pequeno buffer para reprodução fluida. */
window.MobileStream = function ({ state, el, Icon, toast, member, voiceEntry, syncViewerQuality, openWatchQualityMenu, toggleStreamMute, togglePip }) {
  const touch = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0 && matchMedia('(hover: none)').matches;
  const MAX_ZOOM = 5, ZOOM_STEP = 2.5;
  // Buffer mínimo de reprodução para a tela recebida: absorve a variação do Wi-Fi/4G (menos engasgos)
  // ao custo de ~0,1 s de atraso, imperceptível para quem só assiste.
  const JITTER_MS = 120;
  const view = { tile: null, video: null, z: 1, x: 0, y: 0, pointers: new Map(), pinch: null, pan: null, tap: null, lastTap: null,
    tapTimer: 0, hideTimer: 0, qualityTimer: 0, frame: 0, fling: 0, tween: 0, fullscreen: false, pushed: false };

  // ---------- Codecs que o aparelho decodifica por hardware ----------
  state.decodeCodecs = [];
  const CANDIDATES = [
    ['video/H264', 'video/H264;level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42e01f'],
    ['video/VP9', 'video/VP9'], ['video/VP8', 'video/VP8'], ['video/AV1', 'video/AV1'],
  ];
  if (touch && navigator.mediaCapabilities?.decodingInfo) {
    Promise.all(CANDIDATES.map(async ([mime, contentType]) => {
      try {
        const info = await navigator.mediaCapabilities.decodingInfo({ type: 'webrtc', video: { contentType, width: 1920, height: 1080, bitrate: 4_000_000, framerate: 30 } });
        return info.supported && info.powerEfficient && info.smooth ? mime : null;
      } catch { return null; }
    })).then((found) => { state.decodeCodecs = found.filter(Boolean); });
  }

  function tuneReceiver(receiver) {
    if (!touch || receiver?.track?.kind !== 'video') return;
    try {
      if ('jitterBufferTarget' in receiver) receiver.jitterBufferTarget = JITTER_MS;
      else if ('playoutDelayHint' in receiver) receiver.playoutDelayHint = JITTER_MS / 1000;
    } catch {}
  }

  // ---------- Tela sempre acesa (assistindo em tela cheia ou transmitindo) ----------
  const awake = { reasons: new Set(), lock: null, pending: false };
  async function refreshWakeLock() {
    const want = awake.reasons.size > 0 && document.visibilityState === 'visible';
    if (!want) { const lock = awake.lock; awake.lock = null; lock?.release().catch(() => {}); return; }
    if (awake.lock || awake.pending || !navigator.wakeLock?.request) return;
    awake.pending = true;
    try {
      awake.lock = await navigator.wakeLock.request('screen');
      awake.lock.addEventListener('release', () => { awake.lock = null; });
      if (!awake.reasons.size) refreshWakeLock();
    } catch {} finally { awake.pending = false; }
  }
  function keepAwake(reason, on) {
    if (on === awake.reasons.has(reason)) return;
    on ? awake.reasons.add(reason) : awake.reasons.delete(reason);
    refreshWakeLock();
  }
  document.addEventListener('visibilitychange', refreshWakeLock);

  // ---------- Zoom e deslocamento ----------
  // Limites calculados sobre a imagem real (object-fit: contain), não sobre as faixas pretas.
  function geometry() {
    const W = view.tile.clientWidth, H = view.tile.clientHeight;
    const vw = view.video.videoWidth || 16, vh = view.video.videoHeight || 9;
    const s = Math.min(W / vw, H / vh);
    const cw = vw * s, ch = vh * s;
    return { W, H, cw, ch, ox: (W - cw) / 2, oy: (H - ch) / 2 };
  }
  function clampAxis(pos, z, size, content, offset) {
    if (z * content <= size) return (size - z * content) / 2 - z * offset;
    return Math.min(-z * offset, Math.max(size - z * (offset + content), pos));
  }
  function clamp() {
    const g = geometry();
    view.x = clampAxis(view.x, view.z, g.W, g.cw, g.ox);
    view.y = clampAxis(view.y, view.z, g.H, g.ch, g.oy);
  }
  function apply() {
    if (view.frame) return;
    view.frame = requestAnimationFrame(() => {
      view.frame = 0;
      if (!view.video) return;
      view.video.style.transform = view.z === 1 && !view.x && !view.y ? '' : `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.z})`;
      view.tile.classList.toggle('zoomed', view.z > 1.01);
      const pill = view.tile.querySelector('.imm-zoom');
      if (pill) { pill.textContent = view.z.toFixed(1).replace('.', ',') + '×'; pill.classList.toggle('hidden', view.z <= 1.01); }
    });
  }
  function zoomAt(z, px, py) {
    z = Math.min(MAX_ZOOM, Math.max(1, z));
    view.x = px - (px - view.x) * z / view.z;
    view.y = py - (py - view.y) * z / view.z;
    view.z = z;
    clamp(); apply();
  }
  // Aproximar pede mais resolução a quem transmite (o tamanho exibido já inclui o zoom).
  function qualityChanged() {
    clearTimeout(view.qualityTimer);
    view.qualityTimer = setTimeout(syncViewerQuality, 350);
  }
  function stopMotion() { cancelAnimationFrame(view.fling); cancelAnimationFrame(view.tween); view.fling = view.tween = 0; }
  function animateZoom(target, px, py) {
    stopMotion();
    const from = { z: view.z, x: view.x, y: view.y };
    view.z = target; view.x = px - (px - from.x) * target / from.z; view.y = py - (py - from.y) * target / from.z; clamp();
    const to = { z: view.z, x: view.x, y: view.y };
    Object.assign(view, from);
    const start = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - start) / 200), e = 1 - (1 - t) ** 3;
      view.z = from.z + (to.z - from.z) * e; view.x = from.x + (to.x - from.x) * e; view.y = from.y + (to.y - from.y) * e;
      apply();
      view.tween = t < 1 ? requestAnimationFrame(step) : 0;
      if (t === 1) qualityChanged();
    };
    view.tween = requestAnimationFrame(step);
  }
  function fling(vx, vy) {
    let last = performance.now();
    const step = (now) => {
      const dt = Math.min(32, now - last); last = now;
      const decay = Math.pow(.94, dt / 16);
      vx *= decay; vy *= decay;
      const bx = view.x, by = view.y;
      view.x += vx * dt; view.y += vy * dt; clamp(); apply();
      if (view.x === bx) vx = 0;
      if (view.y === by) vy = 0;
      view.fling = Math.hypot(vx, vy) > .02 ? requestAnimationFrame(step) : 0;
    };
    view.fling = requestAnimationFrame(step);
  }
  function resetZoom() { stopMotion(); view.z = 1; view.x = view.y = 0; clamp(); apply(); qualityChanged(); }

  const local = (e) => { const r = view.tile.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const onBar = (e) => !!e.target.closest?.('.imm-bar, .imm-hint, #context-menu');

  function pointerDown(e) {
    if (!view.tile || onBar(e)) return;
    stopMotion();
    view.tile.setPointerCapture?.(e.pointerId);
    const p = local(e);
    view.pointers.set(e.pointerId, p);
    if (view.pointers.size === 2) {
      const [a, b] = [...view.pointers.values()];
      view.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, z: view.z, x: view.x, y: view.y, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
      view.pan = view.tap = null;
    } else if (view.pointers.size === 1) {
      view.pan = { x: p.x, y: p.y, t: performance.now(), vx: 0, vy: 0 };
      view.tap = { x: p.x, y: p.y, t: performance.now() };
    }
  }
  function pointerMove(e) {
    if (!view.pointers.has(e.pointerId)) return;
    const p = local(e);
    view.pointers.set(e.pointerId, p);
    if (view.pinch && view.pointers.size >= 2) {
      const [a, b] = [...view.pointers.values()];
      const pinch = view.pinch, mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const z = Math.min(MAX_ZOOM * 1.15, Math.max(.85, pinch.z * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d));
      // O ponto da imagem que estava entre os dedos acompanha os dedos.
      view.x = mx - (pinch.mx - pinch.x) * z / pinch.z;
      view.y = my - (pinch.my - pinch.y) * z / pinch.z;
      view.z = z;
      apply();
      return;
    }
    if (view.tap && Math.hypot(p.x - view.tap.x, p.y - view.tap.y) > 10) view.tap = null;
    if (view.pan && view.z > 1.01) {
      const now = performance.now(), dt = Math.max(1, now - view.pan.t);
      const dx = p.x - view.pan.x, dy = p.y - view.pan.y;
      view.pan.vx = .8 * (dx / dt) + .2 * view.pan.vx; view.pan.vy = .8 * (dy / dt) + .2 * view.pan.vy;
      view.pan.x = p.x; view.pan.y = p.y; view.pan.t = now;
      view.x += dx; view.y += dy; clamp(); apply();
    }
  }
  function pointerUp(e) {
    if (!view.pointers.has(e.pointerId)) return;
    const p = local(e);
    view.pointers.delete(e.pointerId);
    if (view.pinch) {
      if (view.pointers.size < 2) {
        const z = view.z;
        view.pinch = null;
        if (z < 1 || z > MAX_ZOOM) { const r = [...view.pointers.values()][0] || p; animateZoom(Math.min(MAX_ZOOM, Math.max(1, z)), r.x, r.y); }
        else { clamp(); apply(); qualityChanged(); }
        const rest = [...view.pointers.values()][0];
        if (rest) view.pan = { x: rest.x, y: rest.y, t: performance.now(), vx: 0, vy: 0 };
      }
      return;
    }
    if (view.pan && view.z > 1.01 && performance.now() - view.pan.t < 80 && Math.hypot(view.pan.vx, view.pan.vy) > .3) fling(view.pan.vx, view.pan.vy);
    view.pan = null;
    const tap = view.tap;
    view.tap = null;
    if (!tap || performance.now() - tap.t > 300) return;
    const last = view.lastTap;
    if (last && performance.now() - last.t < 300 && Math.hypot(p.x - last.x, p.y - last.y) < 40) {
      clearTimeout(view.tapTimer); view.lastTap = null;
      animateZoom(view.z > 1.01 ? 1 : ZOOM_STEP, p.x, p.y);
      return;
    }
    view.lastTap = { x: p.x, y: p.y, t: performance.now() };
    clearTimeout(view.tapTimer);
    view.tapTimer = setTimeout(() => { view.lastTap = null; toggleChrome(); }, 280);
  }
  function pointerCancel(e) { view.pointers.delete(e.pointerId); if (view.pointers.size < 2) view.pinch = null; view.pan = view.tap = null; clamp(); apply(); }
  const wheel = (e) => { if (!view.tile || onBar(e)) return; e.preventDefault(); const p = local(e); zoomAt(view.z * Math.exp(-e.deltaY / 300), p.x, p.y); qualityChanged(); };

  // ---------- Controles (aparecem com um toque e somem sozinhos) ----------
  function showChrome(autoHide = true) {
    if (!view.tile) return;
    view.tile.classList.add('chrome');
    clearTimeout(view.hideTimer);
    if (autoHide) view.hideTimer = setTimeout(() => view.tile?.classList.remove('chrome'), 3500);
  }
  function toggleChrome() {
    if (!view.tile) return;
    if (view.tile.classList.contains('chrome')) { clearTimeout(view.hideTimer); view.tile.classList.remove('chrome'); } else showChrome();
  }
  function renderBar() {
    const tile = view.tile;
    if (!tile) return;
    const sid = tile.dataset.sid, entry = voiceEntry(sid), m = entry && member(entry.accountId);
    const muted = !!m && state.streamMuted.has(m.id);
    const sig = JSON.stringify([sid, m?.name, muted, document.pictureInPictureEnabled]);
    let bar = tile.querySelector('.imm-bar');
    if (bar?.dataset.sig === sig) return;
    const button = (label, icon, onclick, cls = '') => el('button', { class: 'imm-btn ' + cls, ariaLabel: label, title: label,
      onclick: (e) => { e.stopPropagation(); showChrome(); onclick(e); } }, Icon(icon, 22));
    const next = el('div', { class: 'imm-bar', data: { sig } },
      button('Sair da tela cheia', 'chevronDown', () => close(), 'imm-close'),
      el('div', { class: 'imm-title', textContent: m ? 'Tela de ' + m.name : 'Transmissão' }),
      el('button', { class: 'imm-zoom hidden', ariaLabel: 'Voltar ao tamanho original', onclick: (e) => { e.stopPropagation(); resetZoom(); } }),
      m ? button(muted ? 'Ativar som da transmissão' : 'Silenciar transmissão', muted ? 'volumeX' : 'volume', () => toggleStreamMute(m.id), muted ? 'off' : '') : '',
      button('Qualidade para assistir', 'settings', (e) => openWatchQualityMenu(sid, e.currentTarget)),
      document.pictureInPictureEnabled ? button('Janela flutuante', 'pip', () => { const video = view.video; close(); togglePip(video); }) : '');
    bar ? bar.replaceWith(next) : tile.append(next);
    apply();
  }

  // ---------- Abrir e fechar ----------
  const listeners = [['pointerdown', pointerDown], ['pointermove', pointerMove], ['pointerup', pointerUp], ['pointercancel', pointerCancel], ['wheel', wheel, { passive: false }]];
  function onResize() { if (view.tile) { clamp(); apply(); } }

  async function open(tile) {
    const video = tile?.querySelector('video');
    if (!video?.srcObject || view.tile === tile) return;
    if (view.tile) close();
    Object.assign(view, { tile, video, z: 1, x: 0, y: 0 });
    tile.classList.add('immersive');
    document.body.classList.add('stream-immersive');
    for (const [name, fn, opts] of listeners) tile.addEventListener(name, fn, opts);
    addEventListener('resize', onResize);
    renderBar();
    showChrome();
    keepAwake('watching', true);
    if (!view.pushed) { history.pushState({ ...(history.state || {}), resenhexStream: true }, ''); view.pushed = true; }
    const hints = Number(localStorage.getItem('streamHints') || 0);
    if (hints < 3) {
      localStorage.setItem('streamHints', String(hints + 1));
      const hint = el('div', { class: 'imm-hint' }, 'Pince para aproximar · toque duas vezes para ampliar');
      tile.append(hint);
      setTimeout(() => hint.remove(), 3200);
    }
    try {
      const request = tile.requestFullscreen || tile.webkitRequestFullscreen;
      if (request) { await request.call(tile, { navigationUI: 'hide' }); view.fullscreen = view.tile === tile; }
    } catch {}
    // Gira para acompanhar a imagem: telas de computador ficam deitadas, telas de celular em pé.
    if (view.tile === tile && view.fullscreen) {
      const landscape = (video.videoWidth || 16) >= (video.videoHeight || 9);
      screen.orientation?.lock?.(landscape ? 'landscape' : 'portrait').catch(() => {});
    }
    clamp(); apply(); qualityChanged();
  }

  function close({ fromHistory = false } = {}) {
    const { tile, video } = view;
    if (!tile) return;
    stopMotion();
    clearTimeout(view.hideTimer); clearTimeout(view.tapTimer);
    for (const [name, fn, opts] of listeners) tile.removeEventListener(name, fn, opts);
    removeEventListener('resize', onResize);
    tile.classList.remove('immersive', 'chrome', 'zoomed');
    tile.querySelectorAll('.imm-bar, .imm-hint').forEach((node) => node.remove());
    video.style.transform = '';
    document.body.classList.remove('stream-immersive');
    Object.assign(view, { tile: null, video: null, z: 1, x: 0, y: 0, pinch: null, pan: null, tap: null, lastTap: null });
    view.pointers.clear();
    keepAwake('watching', false);
    try { screen.orientation?.unlock?.(); } catch {}
    if (view.fullscreen) { view.fullscreen = false; if (document.fullscreenElement || document.webkitFullscreenElement) (document.exitFullscreen || document.webkitExitFullscreen)?.call(document).catch?.(() => {}); }
    if (view.pushed) { view.pushed = false; if (!fromHistory && history.state?.resenhexStream) history.back(); }
    qualityChanged();
  }

  // O botão Voltar do celular fecha a tela cheia em vez de sair da página.
  addEventListener('popstate', () => { if (view.pushed) { view.pushed = false; close({ fromHistory: true }); } });
  const fullscreenExit = () => { if (view.fullscreen && !(document.fullscreenElement || document.webkitFullscreenElement)) { view.fullscreen = false; close(); } };
  document.addEventListener('fullscreenchange', fullscreenExit);
  document.addEventListener('webkitfullscreenchange', fullscreenExit);

  // Chamado a cada renderização do palco: fecha se a transmissão acabou e atualiza os controles.
  function sync() {
    keepAwake('sharing', touch && !!state.local.screen);
    if (!view.tile) return;
    if (!view.tile.isConnected || !view.video.srcObject || state.view !== 'voice') { close(); return; }
    renderBar();
  }

  // Toque num bloco de tela: no celular abre a tela cheia imersiva.
  function handleTap(tile) {
    if (tile.classList.contains('immersive')) return true;
    if (!touch || !tile.classList.contains('screen') || !tile.querySelector('video')?.srcObject) return false;
    open(tile);
    return true;
  }

  return { touch, open, close, sync, handleTap, tuneReceiver, isOpen: () => !!view.tile };
};
