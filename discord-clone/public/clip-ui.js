// CLIPAR: janela com duas abas, "Novo clipe" (prévia, onda e duas alças) e "Clipes da chamada", e o aviso de clipe novo.
// Quem entra no vídeo é decidido de novo na hora de soltar: quem desligou "Pode clipar meu áudio" durante o corte fica fora.
window.ClipUI = ({ el, Icon, toast, call, token, buffer, model, render, getContext, nameOf, loadImage, audioCtx, fetch: send = (...args) => fetch(...args) }) => {
  const W = 1280, H = 720, FPS = 30, BARS = 120;
  const NOTICE_MS = 10_000;
  const SUB = { new: 'Escolha o trecho. Só quem está na chamada recebe.', list: 'Ficam aqui por 24 horas, só para quem estava na chamada.' };
  let supported = null, clips = [], modal = null;

  const decimal = (v) => v.toFixed(1).replace('.', ',');
  const two = (n) => String(n).padStart(2, '0');
  const stamp = (ms) => { const d = new Date(ms); return `${two(d.getDate())}/${two(d.getMonth() + 1)} ${two(d.getHours())}:${two(d.getMinutes())}`; };
  const hour = (ms) => { const d = new Date(ms); return `${two(d.getHours())}:${two(d.getMinutes())}`; };
  const length = (s) => { const r = Math.round(s); return `${Math.floor(r / 60)}:${two(r % 60)}`; };

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

  // ---------- Abrir ----------
  // Botão ou atalho: com o corte possível, abre em "Novo clipe"; sem ele, mostra os clipes que já existem
  // (o motivo fica na aba desligada) ou só avisa o que impede. Uma falha na foto também vira aviso.
  async function start(takeSnapshot) {
    if (document.querySelector('.clip-overlay')) return false;
    const verdict = canClip();
    if (!verdict.ok) {
      if (!clips.length) { toast(verdict.reason, 'info'); return false; }
      open(null, { reason: verdict.reason });
      return true;
    }
    let snapshot;
    try { snapshot = await takeSnapshot(); } catch { toast('Não foi possível abrir o corte. Tente de novo.'); return false; }
    if (document.querySelector('.clip-overlay')) return false;
    open(snapshot);
    return true;
  }

  // Saiu da chamada: a janela aberta é descartada (o áudio e os clipes são daquela chamada).
  function discard() {
    document.querySelector('.clip-overlay')?.dispatchEvent(new CustomEvent('clip-discard'));
  }

  function open(snapshot, { tab = snapshot ? 'new' : 'list', reason = '' } = {}) {
    document.querySelector('.clip-overlay')?.remove();
    const lastFocus = document.activeElement;
    const cutter = snapshot ? Cutter(snapshot, () => close()) : null;
    let current = null;

    const sub = el('p', { class: 'clip-sub' });
    const count = el('span', { class: 'clip-tab-count' });
    const tabNew = el('button', { type: 'button', class: 'clip-tab', role: 'tab', ariaControls: 'clip-panel-new', onclick: () => show('new') },
      Icon('clapperboard', 15), el('span', { textContent: 'Novo clipe' }));
    const tabList = el('button', { type: 'button', class: 'clip-tab', role: 'tab', ariaControls: 'clip-panel-list', onclick: () => show('list') },
      Icon('layers', 15), el('span', {}, 'Clipes', el('span', { class: 'clip-tab-extra', textContent: ' da chamada' })), count);
    if (!cutter) { tabNew.disabled = true; tabNew.title = reason; }
    const library = el('div', { class: 'clip-panel clip-library', id: 'clip-panel-list', role: 'tabpanel' });

    const card = el('div', { class: 'confirm-card clip-card', role: 'dialog', ariaModal: 'true', ariaLabelledby: 'clip-title' },
      el('div', { class: 'clip-head' },
        el('span', { class: 'clip-badge', ariaHidden: 'true' }, Icon('clapperboard', 20)),
        el('div', { class: 'clip-head-text' }, el('h2', { id: 'clip-title', textContent: 'Clipar' }), sub),
        el('button', { type: 'button', class: 'clip-close', ariaLabel: 'Fechar', onclick: () => !cutter?.busy() && close() }, Icon('x', 18))),
      el('div', { class: 'clip-tabs', role: 'tablist', ariaLabel: 'Clipar' }, tabNew, tabList),
      cutter?.panel, library, cutter?.footer);
    const overlay = el('div', { class: 'confirm-overlay clip-overlay', onmousedown: (e) => e.target === overlay && !cutter?.busy() && close() }, card);
    overlay.addEventListener('keydown', onKey);
    overlay.addEventListener('clip-discard', () => close());
    document.body.append(overlay);

    function show(name) {
      if (name === 'new' && !cutter) return;
      // A janela não muda de altura ao trocar de aba: a lista ocupa pelo menos o lugar do corte.
      if (name === 'list' && cutter && !cutter.panel.hidden) library.style.minHeight = cutter.panel.offsetHeight + cutter.footer.offsetHeight + 'px';
      current = name;
      cutter?.stop();
      for (const [btn, key] of [[tabNew, 'new'], [tabList, 'list']]) {
        btn.classList.toggle('active', key === name);
        btn.setAttribute('aria-selected', String(key === name));
        btn.tabIndex = key === name ? 0 : -1;
      }
      if (cutter) cutter.panel.hidden = cutter.footer.hidden = name !== 'new';
      library.hidden = name !== 'list';
      sub.textContent = SUB[name];
      card.dataset.tab = name;
    }

    function refresh() {
      count.textContent = String(clips.length);
      count.hidden = !clips.length;
      library.replaceChildren(clips.length
        ? el('div', { class: 'clip-grid' }, clips.map(clipCard))
        : el('div', { class: 'clip-empty' },
          el('span', { class: 'clip-empty-icon', ariaHidden: 'true' }, Icon('clapperboard', 26)),
          el('strong', { textContent: 'Nenhum clipe nesta chamada ainda' }),
          el('small', { textContent: 'Os clipes que alguém soltar aparecem aqui para baixar.' })));
    }

    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (!cutter?.busy()) close(); return; }
      // Setas nas abas trocam de aba; no resto da aba "Novo clipe", quem cuida é o corte.
      if (e.target.classList?.contains('clip-tab') && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        e.preventDefault();
        show(current === 'new' || !cutter ? 'list' : 'new');
        (current === 'new' ? tabNew : tabList).focus();
        return;
      }
      if (current === 'new') cutter.onKey(e);
    }

    function close() {
      cutter?.stop();
      overlay.remove();
      if (modal?.overlay === overlay) modal = null;
      if (lastFocus?.isConnected) lastFocus.focus?.();
    }

    modal = { overlay, refresh, close, cutter: !!cutter };
    refresh();
    show(tab);
    // Foco na alça do fim: Espaço toca o trecho (no botão "Soltar" ele mandaria o clipe para a chamada).
    if (current === 'new') cutter.focus();
    else (library.querySelector('button') || tabList).focus();
  }

  function clipCard(clip) {
    return el('div', { class: 'clip-item' },
      el('div', { class: 'clip-item-media' },
        el('img', { class: 'clip-item-thumb', src: clip.thumb, alt: '' }),
        el('span', { class: 'clip-item-length', textContent: length(clip.duration) })),
      el('div', { class: 'clip-item-body' },
        el('div', { class: 'clip-notice-text' },
          el('strong', { textContent: nameOf(clip.creatorId) }),
          el('small', { textContent: `${Math.round(clip.duration)} s · ${hour(clip.createdAt)}` })),
        downloadButton(clip.id, false)));
  }

  // ---------- Aba "Novo clipe" ----------
  function Cutter(snapshot, close) {
    const total = snapshot.seconds;
    const channelId = getContext().channelId; // o clipe só vai para a chamada onde a foto foi tirada
    let sel = model.clampSelection({ start: 0, end: total }, { total });
    let playing = null, busy = false;
    const takenAt = Date.now(); // a foto usa o relógio da página (performance.now); a marca do vídeo, a hora de verdade
    const images = new Map();
    // Fala de cada pessoa na foto inteira, quadro a quadro, para a prévia acender os anéis.
    const speech = new Map(snapshot.people.map((p) => [p.accountId, model.speakingFrames(p, snapshot, { start: 0, end: total, fps: FPS })]));
    const peaks = model.peaks(snapshot.people.map((p) => p.pcm), BARS);
    const label = () => `${getContext().channelName} · ${stamp(takenAt)}`;
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
    // Régua embaixo da onda: quanto tempo atrás, de terço em terço, até "agora".
    const ruler = el('div', { class: 'clip-ruler', ariaHidden: 'true' },
      [0, 1, 2, 3].map((i) => el('span', { style: { left: (i / 3) * 100 + '%' }, textContent: i === 3 ? 'agora' : `−${Math.round(total - (total * i) / 3)} s` })));
    const span = el('strong', { class: 'clip-span' });
    const selection = el('p', { class: 'clip-selection', ariaLive: 'polite' });
    const who = el('p', { class: 'clip-who' });
    const listen = el('button', { type: 'button', class: 'btn-ghost clip-listen', onclick: () => togglePlay() }, Icon('play', 16), el('span', { textContent: 'Ouvir trecho' }));
    const discard = el('button', { type: 'button', class: 'btn-ghost', textContent: 'Descartar', onclick: () => !busy && close() });
    const release = el('button', { type: 'button', class: 'btn-primary clip-release', textContent: 'Soltar para a chamada', onclick: () => submit() });

    const panel = el('div', { class: 'clip-panel clip-cutter', id: 'clip-panel-new', role: 'tabpanel' },
      el('div', { class: 'clip-stage' }, preview),
      el('div', { class: 'clip-timeline' },
        el('div', { class: 'clip-wave' }, wave, shadeLeft, shadeRight, window_, playhead, startHandle, endHandle),
        ruler),
      el('div', { class: 'clip-info' },
        span,
        el('div', { class: 'clip-info-text' }, selection, el('div', { class: 'clip-who-row' }, Icon('users', 14), who))));
    const footer = el('div', { class: 'confirm-actions clip-actions' }, listen, el('span', { class: 'clip-spacer' }), discard, release);

    function drawWave() {
      const ctx = wave.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, wave.width, wave.height);
      const bar = wave.width / BARS, mid = wave.height / 2;
      peaks.forEach((v, i) => {
        const t = ((i + 0.5) / BARS) * total, inside = t >= sel.start && t <= sel.end;
        ctx.fillStyle = inside ? '#b77cf0' : '#4a4458';
        const h = Math.max(3, v * (wave.height - 12));
        const x = i * bar + 1.5, w = bar - 3;
        if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x, mid - h / 2, w, h, w / 2); ctx.fill(); }
        else ctx.fillRect(x, mid - h / 2, w, h);
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
      const ago = (v) => (total - v < 0.05 ? 'agora' : `−${decimal(total - v)} s`);
      span.textContent = `${decimal(sel.end - sel.start)} s`;
      selection.textContent = `início ${ago(sel.start)} · fim ${ago(sel.end)} · ${decimal(sel.end - sel.start)} s`;
      const list = people();
      who.textContent = list.length ? 'No clipe: ' + list.map((p) => p.profile.name).join(', ') : 'Ninguém neste trecho pode entrar no clipe.';
      who.title = who.textContent;
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
      if (!ctx || !panel.isConnected || panel.hidden) return;
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
      listen.classList.add('playing');
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
      listen.classList.remove('playing');
      playhead.classList.add('hidden');
      drawPreview(sel.start);
    }

    async function submit() {
      if (busy) return;
      stop();
      if (getContext().channelId !== channelId) { close(); toast('Você mudou de chamada: o clipe foi descartado.'); return; }
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
            'x-clip': encodeURIComponent(JSON.stringify({ duration: Math.round(clip.duration * 1000) / 1000, participants: list.map((p) => p.accountId), voice: channelId })),
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
    return { panel, footer, onKey, stop, busy: () => busy, focus: () => endHandle.focus() };
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

  // ---------- Lista da chamada ----------
  // O número de clipes aparece na claquete; a lista em si mora na aba "Clipes da chamada".
  function setList(next) {
    clips = [...next].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    const button = document.getElementById('sc-clip');
    if (button) {
      if (clips.length) button.dataset.count = clips.length > 99 ? '99+' : String(clips.length);
      else delete button.dataset.count;
    }
    if (!modal) return;
    if (!clips.length && !modal.cutter) modal.close();
    else modal.refresh();
  }

  return { prepare, canClip, start, open, discard, showNotice, setList, clips: () => clips };
};
