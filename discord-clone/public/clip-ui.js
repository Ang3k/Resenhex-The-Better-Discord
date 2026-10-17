// CLIPAR: tela de corte (prévia, onda e duas alças), aviso de clipe novo e lista "Clipes (n)" da chamada.
// Quem entra no vídeo é decidido de novo na hora de soltar: quem desligou "Pode clipar meu áudio" durante o corte fica fora.
window.ClipUI = ({ el, Icon, toast, call, token, buffer, model, render, getContext, nameOf, loadImage, audioCtx, fetch: send = (...args) => fetch(...args) }) => {
  const W = 1280, H = 720, FPS = 30, BARS = 120;
  const NOTICE_MS = 10_000;
  let supported = null, clips = [], listMenu = null;

  const decimal = (v) => v.toFixed(1).replace('.', ',');
  const two = (n) => String(n).padStart(2, '0');
  const stamp = (ms) => { const d = new Date(ms); return `${two(d.getDate())}/${two(d.getMonth() + 1)} ${two(d.getHours())}:${two(d.getMinutes())}`; };
  const hour = (ms) => { const d = new Date(ms); return `${two(d.getHours())}:${two(d.getMinutes())}`; };

  // O teste de suporte do navegador é assíncrono; ao entrar na chamada ele já fica pronto para o botão responder na hora.
  function prepare() {
    if (supported !== null) return;
    render.supported().then((ok) => { supported = !!ok; }, () => { supported = false; });
  }

  function canClip() {
    if (getContext().deafened) return { ok: false, reason: 'Ligue o fone para clipar.' };
    if (buffer.recorded() < 1 || supported === null) return { ok: false, reason: 'Espere um instante: ainda não há áudio para clipar.' };
    if (!supported) return { ok: false, reason: 'Seu navegador ainda não gera o vídeo do clipe.' };
    return { ok: true };
  }

  async function download(id) {
    const res = await call('clip:link', { id });
    if (!res?.url) return;
    const link = el('a', { href: res.url, download: '' });
    link.style.display = 'none';
    document.body.append(link);
    link.click();
    link.remove();
  }

  const downloadButton = (id, primary = true) => el('button', {
    type: 'button', class: 'clip-download' + (primary ? ' primary' : ''), ariaLabel: 'Baixar o clipe',
    onclick: (e) => { e.stopPropagation(); download(id); },
  }, Icon('download', 16), el('span', { textContent: 'Baixar' }));

  // ---------- Tela de corte ----------
  function open(snapshot) {
    document.querySelector('.clip-overlay')?.remove();
    const total = snapshot.seconds;
    let sel = model.clampSelection({ start: 0, end: total }, { total });
    let playing = null, busy = false, lastFocus = document.activeElement;
    const images = new Map();
    // Fala de cada pessoa na foto inteira, quadro a quadro, para a prévia acender os anéis.
    const speech = new Map(snapshot.people.map((p) => [p.accountId, model.speakingFrames(p, snapshot, { start: 0, end: total, fps: FPS })]));
    const peaks = model.peaks(snapshot.people.map((p) => p.pcm), BARS);
    const label = () => `${getContext().channelName} · ${stamp(snapshot.takenAt)}`;
    const people = () => model.included(snapshot, getContext(), sel);

    const preview = el('canvas', { class: 'clip-preview', width: W, height: H, ariaHidden: 'true' });
    const wave = el('canvas', { class: 'clip-wave-bars', width: BARS * 6, height: 64, ariaHidden: 'true' });
    const shadeLeft = el('div', { class: 'clip-shade left' }), shadeRight = el('div', { class: 'clip-shade right' });
    const window_ = el('div', { class: 'clip-window' });
    const playhead = el('div', { class: 'clip-playhead hidden' });
    const handle = (which, text) => el('input', {
      type: 'range', class: 'clip-handle ' + which, min: '0', max: String(total), step: 'any', value: String(which === 'start' ? sel.start : sel.end),
      ariaLabel: text, oninput: () => move(which), onkeydown: (e) => nudge(e, which),
    });
    const startHandle = handle('start', 'Início do clipe'), endHandle = handle('end', 'Fim do clipe');
    const selection = el('p', { class: 'clip-selection', ariaLive: 'polite' });
    const who = el('p', { class: 'clip-who' });
    const listen = el('button', { type: 'button', class: 'btn-ghost clip-listen', onclick: () => togglePlay() }, Icon('play', 16), el('span', { textContent: 'Ouvir trecho' }));
    const discard = el('button', { type: 'button', class: 'btn-ghost', textContent: 'Descartar', onclick: () => close() });
    const release = el('button', { type: 'button', class: 'btn-primary clip-release', textContent: 'Soltar para a chamada', onclick: () => submit() });

    const card = el('div', { class: 'confirm-card clip-card', role: 'dialog', ariaModal: 'true', ariaLabelledby: 'clip-title' },
      el('div', { class: 'clip-head' },
        el('div', {}, el('h2', { id: 'clip-title', textContent: 'Clipar' }), el('p', { class: 'clip-sub', textContent: 'Escolha o trecho. Só quem está na chamada recebe.' })),
        el('button', { type: 'button', class: 'clip-close', ariaLabel: 'Descartar o clipe', onclick: () => close() }, Icon('x', 18))),
      el('div', { class: 'clip-stage' }, preview),
      el('div', { class: 'clip-wave' }, wave, shadeLeft, shadeRight, window_, playhead, startHandle, endHandle),
      el('div', { class: 'clip-info' }, selection, who),
      el('div', { class: 'confirm-actions clip-actions' }, listen, el('span', { class: 'clip-spacer' }), discard, release));
    const overlay = el('div', { class: 'confirm-overlay clip-overlay', onmousedown: (e) => e.target === overlay && !busy && close() }, card);
    overlay.addEventListener('keydown', onKey);
    document.body.append(overlay);

    function drawWave() {
      const ctx = wave.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, wave.width, wave.height);
      const bar = wave.width / BARS, mid = wave.height / 2;
      peaks.forEach((v, i) => {
        const t = ((i + 0.5) / BARS) * total, inside = t >= sel.start && t <= sel.end;
        ctx.fillStyle = inside ? '#b77cf0' : '#4a4458';
        const h = Math.max(2, v * (wave.height - 8));
        ctx.fillRect(i * bar + 1, mid - h / 2, bar - 2, h);
      });
    }

    function drawPreview(t) {
      const ctx = preview.getContext('2d');
      if (!ctx) return;
      const list = people(), circles = model.layout(list.length, W, H), frame = Math.min(Math.round(t * FPS), total * FPS - 1);
      render.drawFrame(ctx, {
        width: W, height: H, label: label(), progress: Math.min(1, Math.max(0, (t - sel.start) / (sel.end - sel.start))),
        people: list.map((p, i) => ({ profile: p.profile, image: images.get(p.accountId) || null, circle: circles[i], speaking: !!speech.get(p.accountId)?.[frame] })),
      });
    }

    function update() {
      const pct = (v) => (v / total) * 100 + '%';
      shadeLeft.style.width = pct(sel.start);
      shadeRight.style.left = pct(sel.end);
      window_.style.left = pct(sel.start);
      window_.style.width = pct(sel.end - sel.start);
      startHandle.value = String(sel.start);
      endHandle.value = String(sel.end);
      startHandle.setAttribute('aria-valuetext', `${decimal(total - sel.start)} segundos atrás`);
      endHandle.setAttribute('aria-valuetext', total - sel.end < 0.05 ? 'agora' : `${decimal(total - sel.end)} segundos atrás`);
      selection.textContent = `início −${decimal(total - sel.start)} s · fim −${decimal(total - sel.end)} s · ${decimal(sel.end - sel.start)} s`;
      const list = people();
      who.textContent = list.length ? 'No clipe: ' + list.map((p) => p.profile.name).join(', ') : 'Ninguém neste trecho pode entrar no clipe.';
      release.disabled = busy || !list.length;
      drawWave();
      if (!playing) drawPreview(sel.start);
    }

    function move(which) {
      stop();
      sel = model.clampSelection({ start: Number(startHandle.value), end: Number(endHandle.value) }, { total, moving: which });
      update();
    }

    function nudge(e, which) {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      e.stopPropagation();
      const step = (e.shiftKey ? 1 : 0.1) * (e.key === 'ArrowLeft' ? -1 : 1);
      const target = which === 'start' ? startHandle : endHandle;
      target.value = String(Math.round((Number(target.value) + step) * 10) / 10);
      move(which);
    }

    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (!busy) close(); return; }
      if (e.key === ' ' && !(e.target instanceof HTMLButtonElement)) { e.preventDefault(); togglePlay(); return; }
      // Setas fora das alças mexem no fim, que é o que mais se ajusta.
      if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !e.target.classList?.contains('clip-handle')) nudge(e, 'end');
    }

    async function togglePlay() {
      if (playing) { stop(); return; }
      const list = people();
      if (!list.length) return;
      const range = { ...sel };
      const audio = await render.mix(list, snapshot, range);
      const ctx = audioCtx?.();
      if (!ctx || !overlay.isConnected) return;
      await ctx.resume?.();
      const source = ctx.createBufferSource();
      source.buffer = audio;
      source.connect(ctx.destination);
      const began = ctx.currentTime;
      playing = { source, frame: 0 };
      source.onended = () => { if (playing?.source === source) stop(); };
      source.start();
      listen.lastChild.textContent = 'Parar';
      listen.firstChild.replaceWith(Icon('pause', 16));
      playhead.classList.remove('hidden');
      const tick = () => {
        if (!playing || playing.source !== source) return;
        const t = Math.min(range.end, range.start + (ctx.currentTime - began));
        playhead.style.left = (t / total) * 100 + '%';
        drawPreview(t);
        playing.frame = requestAnimationFrame(tick);
      };
      tick();
    }

    function stop() {
      if (!playing) return;
      const { source, frame } = playing;
      playing = null;
      cancelAnimationFrame(frame);
      source.onended = null;
      try { source.stop(); } catch {}
      source.disconnect?.();
      listen.lastChild.textContent = 'Ouvir trecho';
      listen.firstChild.replaceWith(Icon('play', 16));
      playhead.classList.add('hidden');
      drawPreview(sel.start);
    }

    function close() {
      stop();
      overlay.remove();
      if (lastFocus?.isConnected) lastFocus.focus?.();
    }

    async function submit() {
      if (busy) return;
      stop();
      const list = people();
      if (!list.length) { toast('Ninguém neste trecho pode entrar no clipe.'); return; }
      busy = true;
      release.disabled = true;
      release.textContent = 'Gerando o clipe…';
      try {
        const clip = await render.render({ snapshot, people: list, start: sel.start, end: sel.end, label: label(), loadImage });
        const head = new Uint8Array(4);
        new DataView(head.buffer).setUint32(0, clip.thumb.size);
        const res = await send('/clips', {
          method: 'POST',
          headers: {
            'content-type': 'application/octet-stream', 'x-token': token(),
            'x-clip': encodeURIComponent(JSON.stringify({ duration: Math.round(clip.duration * 1000) / 1000, participants: list.map((p) => p.accountId) })),
          },
          body: new Blob([head, clip.thumb, clip.mp4]),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error || 'Não foi possível enviar o clipe. Tente de novo.');
        }
        busy = false;
        close();
      } catch (error) {
        busy = false;
        release.textContent = 'Soltar para a chamada';
        update();
        toast(error?.message || 'Não foi possível gerar o clipe.');
      }
    }

    for (const p of snapshot.people) {
      if (!p.profile.avatarUrl) continue;
      loadImage(p.profile.avatarUrl).then((image) => {
        if (!image) return;
        images.set(p.accountId, image);
        if (!playing) drawPreview(sel.start);
      }, () => {});
    }
    update();
    release.focus();
  }

  // ---------- Aviso de clipe novo ----------
  function notices() {
    let box = document.getElementById('clip-notices');
    if (!box) { box = el('div', { id: 'clip-notices', ariaLive: 'polite' }); document.body.append(box); }
    return box;
  }

  function showNotice(clip) {
    const notice = el('div', { class: 'clip-notice', role: 'status' },
      el('img', { class: 'clip-thumb', src: clip.thumb, alt: '' }),
      el('div', { class: 'clip-notice-text' },
        el('strong', { textContent: `${nameOf(clip.creatorId)} clipou ${Math.round(clip.duration)} s` }),
        el('small', { textContent: `${clip.channelName} · só para quem está na chamada` })),
      downloadButton(clip.id),
      el('button', { type: 'button', class: 'clip-notice-close', ariaLabel: 'Fechar aviso', onclick: () => hide() }, Icon('x', 14)));
    let timer = setTimeout(() => hide(), NOTICE_MS);
    // Com o mouse em cima, o aviso espera.
    notice.addEventListener('mouseenter', () => clearTimeout(timer));
    notice.addEventListener('mouseleave', () => { timer = setTimeout(() => hide(), NOTICE_MS / 2); });
    function hide() {
      clearTimeout(timer);
      notice.classList.add('leaving');
      setTimeout(() => notice.remove(), 200);
    }
    notices().append(notice);
    return notice;
  }

  // ---------- Lista "Clipes (n)" ----------
  function closeList() {
    listMenu?.remove();
    listMenu = null;
    document.removeEventListener('mousedown', outside, true);
    document.removeEventListener('keydown', escape, true);
  }
  const outside = (e) => { if (!listMenu?.contains(e.target) && e.target.closest?.('#clip-list-btn') == null) closeList(); };
  const escape = (e) => { if (e.key === 'Escape') { e.stopPropagation(); closeList(); document.getElementById('clip-list-btn')?.focus(); } };

  function openList(button) {
    if (listMenu) { closeList(); return; }
    listMenu = el('div', { class: 'clip-list', role: 'dialog', ariaLabel: 'Clipes desta chamada' },
      el('p', { class: 'clip-list-title', textContent: 'Clipes desta chamada' }),
      el('p', { class: 'clip-list-hint', textContent: 'Ficam aqui por 24 horas, só para quem estava na chamada.' }),
      clips.map((clip) => el('div', { class: 'clip-list-item' },
        el('img', { class: 'clip-thumb', src: clip.thumb, alt: '' }),
        el('div', { class: 'clip-notice-text' },
          el('strong', { textContent: nameOf(clip.creatorId) }),
          el('small', { textContent: `${Math.round(clip.duration)} s · ${hour(clip.createdAt)}` })),
        downloadButton(clip.id, false))));
    button.after(listMenu);
    document.addEventListener('mousedown', outside, true);
    document.addEventListener('keydown', escape, true);
    listMenu.querySelector('button')?.focus();
  }

  function setList(next) {
    clips = [...next].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    const button = document.getElementById('clip-list-btn');
    if (!button) return;
    if (!button.dataset.ready) {
      button.dataset.ready = '1';
      button.addEventListener('click', () => openList(button));
    }
    button.replaceChildren(Icon('clapperboard', 14), el('span', { textContent: `Clipes (${clips.length})` }));
    button.classList.toggle('hidden', !clips.length);
    if (!clips.length) closeList();
    else if (listMenu) { closeList(); openList(button); }
  }

  return { prepare, canClip, open, showNotice, setList, clips: () => clips };
};
