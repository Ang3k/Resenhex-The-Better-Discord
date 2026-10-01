/* DJ: músicas do YouTube tocando junto na chamada. O servidor guarda a fila e quando a música
   começou; cada pessoa toca o vídeo no player oficial do YouTube e este módulo mantém o player no
   mesmo ponto que o resto da sala. O player é um só (trocar um iframe de lugar no DOM recarrega o
   vídeo): ele fica num elemento fixo que acompanha o lugar visível do momento, o bloco do DJ no
   palco ou a capinha no painel da chamada. */
window.MusicDJ = function ({ state, el, Icon, toast, call, callInfo, callPerm, callMe, timedOut, callChannelName }) {
  const $ = (sel) => document.querySelector(sel);
  const clamp01 = (v) => Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0.4));
  state.djVolume = clamp01(Number(localStorage.getItem('djVolume') ?? 0.4));
  state.djMuted = localStorage.getItem('djMuted') === 'true';

  const music = () => callInfo()?.music || null;
  const canUse = () => callPerm('MUSIC') && !timedOut(callMe());
  const thumb = (videoId) => `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
  const deafened = () => state.deafened || !!callMe()?.serverDeafened;
  function clock(seconds) {
    const s = Math.max(0, Math.floor(seconds));
    const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, r = String(s % 60).padStart(2, '0');
    return h ? `${h}:${String(m).padStart(2, '0')}:${r}` : `${m}:${r}`;
  }

  // ---------- relógio do servidor ----------
  // Cada estado traz a hora do servidor. A diferença medida com menos atraso de rede é a melhor
  // estimativa do relógio de lá (o atraso só faz o servidor parecer "mais velho").
  const offsets = [];
  let lastView = null;
  const serverNow = () => Date.now() + (offsets.length ? Math.max(...offsets) : 0);
  const positionOf = (m) => Math.max(0, (m.pausedAt ?? serverNow() - m.startedAt) / 1000);

  // ---------- player do YouTube ----------
  let api = null;
  function loadApi() {
    if (window.YT?.Player) return Promise.resolve();
    api ||= new Promise((resolve, reject) => {
      const previous = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => { previous?.(); resolve(); };
      const script = el('script', { src: 'https://www.youtube.com/iframe_api', async: true });
      script.onerror = () => { api = null; script.remove(); reject(new Error('Não deu para carregar o player do YouTube. Verifique a internet.')); };
      document.head.append(script);
    });
    return api;
  }

  const mount = el('div', { id: 'dj-yt' });
  const listen = el('button', { type: 'button', class: 'dj-listen hidden', onclick: (e) => { e.stopPropagation(); player?.playVideo(); } }, Icon('play', 18), 'Clique para ouvir');
  const hostLabel = el('div', { class: 'dj-host-label' });
  const hostPaused = el('div', { class: 'dj-host-paused hidden' }, Icon('pauseBars', 28), el('span', { textContent: 'Pausada' }));
  const host = el('div', { id: 'dj-player', class: 'off', ariaHidden: 'true' }, el('div', { class: 'dj-frame' }, mount), hostPaused, hostLabel, listen);
  document.body.append(host);

  let player = null;
  let ready = false;
  let creating = false;
  let loaded = null; // id da faixa (da fila) carregada no player
  let lastSeek = 0;
  let wantPlayAt = 0; // desde quando o player deveria estar tocando e não está
  let errorShown = null;

  async function ensurePlayer() {
    if (player || creating) return;
    creating = true;
    try { await loadApi(); } catch (error) { creating = false; toast(error.message); return; }
    player = new YT.Player(mount, {
      width: '100%', height: '100%',
      playerVars: { autoplay: 1, controls: 0, disablekb: 1, fs: 0, iv_load_policy: 3, playsinline: 1, rel: 0, origin: location.origin },
      events: {
        onReady: () => { ready = true; drive(); },
        onStateChange: (e) => {
          const m = music();
          if (!m || m.current.id !== loaded) return;
          if (e.data === YT.PlayerState.ENDED) call('music:report', { trackId: loaded, ended: true });
          if (e.data === YT.PlayerState.PLAYING) {
            listen.classList.add('hidden');
            wantPlayAt = 0;
            const duration = player.getDuration();
            if (!m.current.duration && !m.current.live && duration > 0) call('music:report', { trackId: loaded, duration });
          }
        },
        onError: (e) => {
          const m = music();
          if (!m || m.current.id !== loaded) return;
          // 100/101/150: o vídeo saiu do ar ou não pode tocar fora do YouTube. Às vezes é só neste aparelho
          // (país, idade): o servidor só troca a música quando a maior parte da sala avisa.
          if ([100, 101, 150].includes(e.data)) call('music:report', { trackId: loaded, error: e.data });
          if (errorShown !== loaded) {
            errorShown = loaded;
            toast([100, 101, 150].includes(e.data) ? 'O YouTube não deixa essa música tocar aqui. Se for assim para a sala toda, o DJ troca de versão.'
              : 'O player do YouTube não conseguiu tocar essa música aqui.', 'info');
          }
        },
      },
    });
  }

  // Leva o player para o mesmo ponto da sala: troca de música, pausa, volume e correção de atraso.
  function drive() {
    const m = music();
    if (!m) {
      if (ready && loaded) player.stopVideo();
      loaded = null;
      return;
    }
    if (m !== lastView) {
      lastView = m;
      offsets.push(m.now - Date.now());
      if (offsets.length > 20) offsets.shift();
    }
    if (!player) return void ensurePlayer();
    if (!ready) return;
    const t = m.current;
    const target = positionOf(m);
    const paused = m.pausedAt !== null;
    if (loaded !== t.id) {
      loaded = t.id;
      lastSeek = Date.now();
      wantPlayAt = Date.now();
      const options = { videoId: t.videoId, ...(t.live ? {} : { startSeconds: target }) };
      if (paused) player.cueVideoById(options); else player.loadVideoById(options);
    }
    if (deafened() || state.djMuted) player.mute(); else player.unMute();
    player.setVolume(Math.round(state.djVolume * 100));
    const now = player.getPlayerState();
    const S = YT.PlayerState;
    if (paused) {
      wantPlayAt = 0;
      listen.classList.add('hidden');
      if (now === S.PLAYING || now === S.BUFFERING) player.pauseVideo();
      if (!t.live && Math.abs(player.getCurrentTime() - target) > 1 && Date.now() - lastSeek > 1500) { lastSeek = Date.now(); player.seekTo(target, true); }
      return;
    }
    if (t.duration && target > t.duration) return; // acabou aqui; o servidor já vai trocar
    if (now !== S.PLAYING && now !== S.BUFFERING) {
      wantPlayAt ||= Date.now();
      player.playVideo();
      // O navegador pode bloquear som sem um clique na página (ex.: abriu pelo link e já caiu na sala).
      if (Date.now() - wantPlayAt > 2500) listen.classList.remove('hidden');
    } else if (!t.live && now === S.PLAYING && Date.now() - lastSeek > 3000 && Math.abs(player.getCurrentTime() - target) > 1.5) {
      lastSeek = Date.now();
      player.seekTo(target, true);
    }
  }

  // ---------- onde o player aparece ----------
  let frame = 0;
  let placed = '';
  function slot() {
    const tile = $('#voice-view:not(.hidden) .tile.dj');
    if (tile) return { node: tile, where: 'stage' };
    const mini = $('#dj-mini:not(.hidden) .dj-mini-art');
    if (mini && mini.offsetParent) return { node: mini, where: 'mini' };
    return null;
  }
  function place() {
    frame = music() ? requestAnimationFrame(place) : 0;
    const target = frame ? slot() : null;
    let sig = 'off';
    if (target) {
      const r = target.node.getBoundingClientRect();
      // No celular o painel da chamada fica numa gaveta por cima de tudo.
      const z = target.where === 'mini' && getComputedStyle($('#dock')).position === 'fixed' ? 16 : 4;
      sig = [target.where, r.left, r.top, r.width, r.height, z].map((v) => (typeof v === 'number' ? Math.round(v) : v)).join();
      if (sig !== placed) Object.assign(host.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px', zIndex: z });
      host.dataset.where = target.where;
    }
    if (sig === placed) return;
    placed = sig;
    host.classList.toggle('off', !target);
  }
  const keepPlacing = () => { if (!frame && music()) frame = requestAnimationFrame(place); };

  // ---------- busca e comandos ----------
  async function search(query) {
    try {
      const res = await fetch('/music/search?q=' + encodeURIComponent(query), { headers: { 'x-token': localStorage.getItem('token') || '' } });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'A busca no YouTube falhou. Tente de novo.');
      return body.items;
    } catch (error) {
      toast(error.message === 'Failed to fetch' ? 'Sem conexão com o servidor para buscar.' : error.message);
      return null;
    }
  }

  function inCallWithDj() {
    if (!state.voiceChannel || !callInfo()) { toast('Entre numa sala de voz para usar o DJ.', 'info'); return false; }
    if (!canUse()) { toast(timedOut(callMe()) ? 'Você está de castigo.' : 'Você não tem permissão para usar o DJ.'); return false; }
    return true;
  }

  async function add(item, query) {
    const res = await call('music:add', { videoId: item.videoId, query });
    if (res) toast(res.place ? `Na fila (${res.place}ª): ${res.title}` : `Tocando agora: ${res.title}`, 'info');
    return res;
  }

  async function play(query) {
    if (!inCallWithDj()) return;
    const items = await search(query);
    if (!items) return;
    if (!items.length) return toast(`Nada encontrado no YouTube para “${query}”.`, 'info');
    await add(items[0], query);
  }

  const control = (action, extra = {}) => inCallWithDj() && call('music:control', { action, ...extra });

  const COMMANDS = [
    { name: 'play', aliases: ['tocar', 'p'], args: true, hint: 'nome da música ou link', note: 'toca do YouTube na sua sala de voz' },
    { name: 'pular', aliases: ['skip', 's'], note: 'pula a música atual' },
    { name: 'pausar', aliases: ['pause'], note: 'pausa para todo mundo' },
    { name: 'continuar', aliases: ['resume'], note: 'continua de onde parou' },
    { name: 'parar', aliases: ['stop'], note: 'para o DJ e limpa a fila' },
    { name: 'fila', aliases: ['queue', 'dj'], note: 'mostra a fila e a busca' },
  ];

  // Comando no chat: devolve true quando o texto era para o DJ (e não vira mensagem).
  function command(text) {
    const m = /^\/(\S+)(?:\s+([\s\S]*))?$/.exec(text.trim());
    if (!m) return false;
    const cmd = COMMANDS.find((c) => c.name === m[1].toLowerCase() || c.aliases.includes(m[1].toLowerCase()));
    if (!cmd) return false;
    const arg = (m[2] || '').trim();
    if (cmd.name === 'play') {
      if (!arg) openPanel();
      else play(arg);
    } else if (cmd.name === 'fila') openPanel();
    else control({ pular: 'skip', pausar: 'pause', continuar: 'resume', parar: 'stop' }[cmd.name]);
    return true;
  }

  // Sugestões ao digitar "/" no chat.
  function suggestions(typed) {
    const q = typed.toLowerCase();
    return COMMANDS.filter((c) => c.name.startsWith(q) || c.aliases.some((a) => a.startsWith(q)))
      .map((c) => ({ command: true, insert: '/' + c.name, label: '/' + c.name + (c.args ? ' ' : ''), hint: c.args ? c.hint : '', note: c.note }));
  }

  // ---------- painel (busca, tocando agora, fila) ----------
  const panel = { node: null, anchor: null, results: null, query: '', status: '', added: new Set(), sig: '' };

  function openPanel(anchor = $('#sc-music:not(:disabled)') || $('#dj-mini-queue')) {
    if (!state.voiceChannel || !callInfo()) return toast('Entre numa sala de voz para usar o DJ.', 'info');
    if (panel.node) { closePanel(); if (panel.anchor === anchor) return; }
    panel.anchor = anchor;
    const input = el('input', { type: 'search', class: 'dj-input', maxLength: 300, autocomplete: 'off', spellcheck: false,
      placeholder: canUse() ? 'Buscar no YouTube ou colar um link' : 'Sem permissão para usar o DJ', disabled: !canUse(), value: panel.query });
    const form = el('form', { class: 'dj-search', onsubmit: async (e) => {
      e.preventDefault();
      const q = input.value.trim();
      if (!q) return;
      panel.query = q;
      panel.status = 'Buscando…';
      panel.results = null;
      renderPanel(true);
      const items = await search(q);
      if (!panel.node || panel.query !== q) return;
      panel.results = items;
      panel.status = !items ? '' : items.length ? '' : 'Nada encontrado. Tente outro nome.';
      panel.added.clear();
      renderPanel(true);
    } }, Icon('search', 18), input);
    panel.node = el('div', { id: 'dj-panel', role: 'dialog', ariaLabel: 'DJ da sala' },
      el('header', { class: 'dj-panel-head' }, el('span', { class: 'dj-badge' }, Icon('disc', 18)),
        el('div', {}, el('strong', { textContent: 'DJ da sala' }), el('small', { class: 'dj-room' })),
        el('button', { type: 'button', class: 'icon-btn', ariaLabel: 'Fechar', tip: 'Fechar', onclick: closePanel }, Icon('x', 18))),
      form, el('div', { class: 'dj-results' }), el('div', { class: 'dj-body' }));
    document.body.append(panel.node);
    panel.sig = '';
    renderPanel(true);
    positionPanel();
    if (canUse()) setTimeout(() => input.focus(), 0);
    setTimeout(() => document.addEventListener('mousedown', outside, true), 0);
    document.addEventListener('keydown', escape, true);
  }

  function closePanel() {
    panel.node?.remove();
    panel.node = null;
    document.removeEventListener('mousedown', outside, true);
    document.removeEventListener('keydown', escape, true);
  }
  const outside = (e) => { if (panel.node && !panel.node.contains(e.target) && !panel.anchor?.contains(e.target)) closePanel(); };
  const escape = (e) => { if (e.key === 'Escape' && panel.node) { e.stopPropagation(); closePanel(); } };

  function positionPanel() {
    const node = panel.node;
    if (!node) return;
    const a = panel.anchor?.isConnected && panel.anchor.offsetParent ? panel.anchor.getBoundingClientRect() : null;
    const w = node.offsetWidth, h = node.offsetHeight;
    const pad = 8;
    let left = a ? a.left + a.width / 2 - w / 2 : (innerWidth - w) / 2;
    let top = a ? a.top - h - 10 : (innerHeight - h) / 2;
    if (a && top < pad) top = a.bottom + 10;
    left = Math.min(innerWidth - w - pad, Math.max(pad, left));
    top = Math.min(innerHeight - h - pad, Math.max(pad, top));
    node.style.left = left + 'px';
    node.style.top = top + 'px';
  }

  function trackRow(t, { index, removable } = {}) {
    return el('li', { class: 'dj-track' },
      index ? el('span', { class: 'dj-index', textContent: index }) : null,
      el('img', { class: 'dj-thumb', src: thumb(t.videoId), alt: '', loading: 'lazy', referrerPolicy: 'no-referrer' }),
      el('div', { class: 'dj-track-text' }, el('strong', { textContent: t.title }),
        el('small', { textContent: [t.author, t.byName ? 'pedido por ' + t.byName : ''].filter(Boolean).join(' · ') })),
      el('span', { class: 'dj-time', textContent: t.live ? 'AO VIVO' : t.duration ? clock(t.duration) : '' }),
      removable ? el('button', { type: 'button', class: 'icon-btn dj-remove', ariaLabel: 'Tirar ' + t.title + ' da fila', tip: 'Tirar da fila',
        onclick: () => control('remove', { trackId: t.id }) }, Icon('x', 16)) : null);
  }

  function nowPlaying(m) {
    const t = m.current;
    const paused = m.pausedAt !== null;
    const allowed = canUse();
    const button = (icon, label, action, cls = '') => el('button', { type: 'button', class: 'dj-ctl ' + cls, ariaLabel: label, tip: label, disabled: !allowed,
      onclick: () => control(action) }, Icon(icon, 18));
    const vol = el('input', { type: 'range', min: 0, max: 100, value: Math.round(state.djVolume * 100), ariaLabel: 'Volume da música para você' });
    vol.style.setProperty('--fill', vol.value + '%');
    vol.oninput = () => {
      state.djVolume = vol.value / 100;
      vol.style.setProperty('--fill', vol.value + '%');
      localStorage.setItem('djVolume', state.djVolume);
      if (state.djMuted) setMuted(false);
      drive();
    };
    return el('section', { class: 'dj-now' + (paused ? ' paused' : '') },
      el('div', { class: 'dj-section-title', textContent: paused ? 'PAUSADA' : 'TOCANDO AGORA' }),
      el('div', { class: 'dj-now-row' }, el('img', { class: 'dj-now-art', src: thumb(t.videoId), alt: '', referrerPolicy: 'no-referrer' }),
        el('div', { class: 'dj-track-text' }, el('strong', { textContent: t.title }),
          el('small', { textContent: [t.author, 'pedido por ' + t.byName, t.alt ? 'outra versão' : ''].filter(Boolean).join(' · ') }))),
      el('div', { class: 'dj-progress' + (t.live ? ' is-live' : '') }, el('span', { class: 'dj-elapsed' }), el('div', { class: 'dj-bar' }, el('i')), el('span', { class: 'dj-total', textContent: t.live ? 'AO VIVO' : t.duration ? clock(t.duration) : '' })),
      el('div', { class: 'dj-controls' },
        paused ? button('play', 'Continuar para todos', 'resume', 'primary') : button('pauseBars', 'Pausar para todos', 'pause', 'primary'),
        button('skip', 'Pular', 'skip'), button('stop', 'Parar e limpar a fila', 'stop'),
        el('div', { class: 'dj-volume' }, el('button', { type: 'button', class: 'icon-btn', ariaLabel: state.djMuted ? 'Ativar a música para você' : 'Silenciar a música só para você',
          tip: state.djMuted ? 'Ativar a música para você' : 'Silenciar só para você', onclick: () => setMuted(!state.djMuted) }, Icon(state.djMuted ? 'volumeX' : 'volume', 18)), vol)));
  }

  // results: true redesenha a busca. A parte da sala só é refeita quando algo dela muda; o estado
  // chega a cada mute de alguém, e refazer tudo soltaria o controle de volume no meio do arraste.
  function renderPanel(results = false) {
    const node = panel.node;
    if (!node) return;
    const m = music();
    if (!callInfo()) return closePanel();
    node.querySelector('.dj-room').textContent = callChannelName() + ' · só toca para quem está na sala';
    const sig = JSON.stringify([m && [m.current.id, m.current.duration, m.pausedAt !== null, m.queue.map((t) => t.id), m.last?.at], canUse(), state.djMuted]);
    if (results || sig !== panel.sig) renderResults(node, m);
    if (sig !== panel.sig) renderRoom(node, m);
    panel.sig = sig;
    tickTimes();
    positionPanel();
  }

  function renderResults(node, m) {
    const results = node.querySelector('.dj-results');
    results.replaceChildren();
    if (panel.status) results.append(el('p', { class: 'dj-status', textContent: panel.status }));
    if (panel.results?.length) {
      results.append(el('div', { class: 'dj-section-title' }, 'RESULTADOS',
        el('button', { type: 'button', class: 'dj-clear', textContent: 'Limpar', onclick: () => { panel.results = null; panel.status = ''; renderPanel(); } })),
      el('ul', { class: 'dj-list' }, panel.results.map((item) => {
        const row = trackRow(item);
        const done = panel.added.has(item.videoId);
        const addBtn = el('button', { type: 'button', class: 'dj-add' + (done ? ' done' : ''), disabled: !canUse() || done, ariaLabel: (m ? 'Pôr na fila: ' : 'Tocar: ') + item.title, tip: m ? 'Pôr na fila' : 'Tocar agora' },
          Icon(done ? 'check' : m ? 'plus' : 'play', 16));
        // Marca antes de pedir: o estado novo chega antes da confirmação e redesenha esta lista.
        addBtn.onclick = async () => {
          panel.added.add(item.videoId);
          renderPanel(true);
          if (!(await add(item, panel.query))) panel.added.delete(item.videoId);
          renderPanel(true);
        };
        row.append(addBtn);
        return row;
      })));
    }
  }

  function renderRoom(node, m) {
    const body = node.querySelector('.dj-body');
    if (!m) {
      body.replaceChildren(el('div', { class: 'dj-empty' }, Icon('disc', 32), el('strong', { textContent: 'Nada tocando' }),
        el('span', { textContent: 'Busque uma música aqui ou digite /play no chat. Todo mundo na sala ouve junto, cada um no próprio volume.' })));
    } else {
      body.replaceChildren(nowPlaying(m),
        el('section', { class: 'dj-queue' }, el('div', { class: 'dj-section-title', textContent: m.queue.length ? `A SEGUIR · ${m.queue.length}` : 'A SEGUIR' }),
          m.queue.length ? el('ul', { class: 'dj-list' }, m.queue.map((t, i) => trackRow(t, { index: i + 1, removable: canUse() })))
            : el('p', { class: 'dj-status', textContent: 'A fila está vazia. A próxima música que alguém pedir entra aqui.' })),
        m.last ? el('p', { class: 'dj-last' }, Icon('info', 14), m.last.text) : null);
    }
  }

  function setMuted(v) {
    state.djMuted = v;
    localStorage.setItem('djMuted', v);
    drive();
    render();
  }

  // ---------- bloco do palco, capinha no painel da chamada e linha na lista de canais ----------
  // Chamado pelo renderStage: devolve a chave do bloco para ele não ser removido.
  function stageTile(stage) {
    const m = music();
    let tile = stage.querySelector('[data-key="dj"]');
    if (!m) { tile?.remove(); return null; }
    if (!tile) {
      tile = el('div', { class: 'tile dj', data: { key: 'dj' }, tabIndex: 0, role: 'button', ariaLabel: 'DJ da sala: abrir a fila',
        onclick: () => openPanel(tile), onkeydown: (e) => { if (e.key === 'Enter') openPanel(tile); } },
      el('img', { class: 'dj-tile-art', alt: '', referrerPolicy: 'no-referrer' }));
      stage.append(tile);
    }
    const art = tile.querySelector('.dj-tile-art');
    if (art.dataset.video !== m.current.videoId) { art.dataset.video = m.current.videoId; art.src = thumb(m.current.videoId); }
    keepPlacing();
    return 'dj';
  }

  function voiceRow(channelId) {
    const summary = state.server?.music?.[channelId];
    if (!summary) return null;
    return el('li', { class: 'voice-user dj-user', tip: summary.paused ? 'DJ: pausado' : 'DJ: tocando agora',
      onclick: (e) => { e.stopPropagation(); if (state.voiceChannel === channelId) openPanel(e.currentTarget); } },
    el('span', { class: 'dj-avatar' + (summary.paused ? '' : ' spinning') }, Icon('disc', 14)),
    el('span', { class: 'name' }, el('b', { textContent: 'DJ' }), el('span', { class: 'dj-user-title', textContent: summary.title })),
    summary.paused ? el('span', { class: 'flags' }, Icon('pauseBars', 14)) : null);
  }

  function renderMini() {
    const box = $('#dj-mini');
    const m = music();
    box.classList.toggle('hidden', !m);
    if (!m) return box.replaceChildren();
    const t = m.current;
    const paused = m.pausedAt !== null;
    const key = [t.id, paused, canUse(), state.djMuted].join();
    if (box.dataset.key === key) return;
    box.dataset.key = key;
    const allowed = canUse();
    box.replaceChildren(
      el('button', { type: 'button', class: 'dj-mini-art', ariaLabel: 'Abrir o DJ', onclick: (e) => openPanel(e.currentTarget) },
        el('img', { src: thumb(t.videoId), alt: '', referrerPolicy: 'no-referrer' })),
      el('div', { class: 'dj-mini-text' }, el('strong', { textContent: t.title }),
        el('small', {}, el('span', { class: 'dj-elapsed' }), t.live || !t.duration ? '' : ' / ' + clock(t.duration))),
      el('button', { type: 'button', class: 'icon-btn', disabled: !allowed, ariaLabel: paused ? 'Continuar' : 'Pausar', tip: paused ? 'Continuar para todos' : 'Pausar para todos',
        onclick: () => control(paused ? 'resume' : 'pause') }, Icon(paused ? 'play' : 'pauseBars', 16)),
      el('button', { type: 'button', class: 'icon-btn', disabled: !allowed, ariaLabel: 'Pular', tip: 'Pular', onclick: () => control('skip') }, Icon('skip', 16)),
      el('button', { type: 'button', id: 'dj-mini-queue', class: 'icon-btn', ariaLabel: 'Fila e busca', tip: 'Fila e busca', onclick: (e) => openPanel(e.currentTarget) }, Icon('listMusic', 16)));
    tickTimes();
  }

  function renderHost() {
    const m = music();
    hostPaused.classList.toggle('hidden', !m || m.pausedAt === null);
    if (!m) return;
    const t = m.current;
    hostLabel.replaceChildren(Icon('disc', 16), el('span', { textContent: t.title }), state.djMuted || deafened() ? Icon('volumeX', 16) : '');
  }

  function tickTimes() {
    const m = music();
    if (!m) return;
    const pos = positionOf(m);
    const t = m.current;
    const shown = t.duration ? Math.min(pos, t.duration) : pos;
    for (const node of document.querySelectorAll('.dj-elapsed')) node.textContent = t.live ? 'ao vivo' : clock(shown);
    const bar = panel.node?.querySelector('.dj-bar i');
    if (bar) bar.style.width = t.duration ? (shown / t.duration) * 100 + '%' : t.live ? '100%' : '0%';
  }

  // Botão no palco e estado geral, a cada estado novo do servidor.
  function render() {
    const button = $('#sc-music');
    if (button) {
      const m = music();
      button.classList.toggle('active', !!m && m.pausedAt === null);
      button.dataset.tip = m ? 'DJ: ' + m.current.title : 'DJ: tocar música do YouTube';
    }
    renderMini();
    renderHost();
    renderPanel();
    drive();
    keepPlacing();
    if (!music()) place();
  }

  let ticks = 0;
  setInterval(() => {
    if (!music()) return;
    tickTimes();
    if (++ticks % 2 === 0) drive();
  }, 500);
  addEventListener('resize', positionPanel);

  return { render, stageTile, voiceRow, command, suggestions, openPanel, closePanel };
};
