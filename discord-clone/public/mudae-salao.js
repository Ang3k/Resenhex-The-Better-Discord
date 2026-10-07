/* Salão do Mudae: a tela própria de um canal de texto com mudae: true. No centro fica a Mesa
   (palco com a roleta, botões de roll e a faixa com os rolls de todo mundo ao vivo), o álbum do
   harem e o ranking. À direita, o chat do canal e quem está no Salão. O servidor sorteia e decide
   quem casa; aqui o navegador só faz o giro (até o revealAt que veio do servidor) e desenha. */
window.MudaeSalon = function ({ state, el, Icon, call, onSocket, member, avatar, nameColor, toast, confirmDialog, openProfile, openImage, openChannel, closeProfile, setSimple, ui, Sounds }) {
  const $ = (sel) => document.querySelector(sel);
  const root = $('#salon-view');
  const LIVE = 12;
  const PAGE = 60;
  const REACTIONS = ['😱', '🔥', '💖', '😂', '💀'];
  const RARITY = ui.RARITY;
  const RARITY_ORDER = ['legendary', 'epic', 'rare', 'common'];
  const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const { num, minutes, kakera } = ui;
  const me = () => state.me.accountId;
  const now = () => ui.serverNow();
  const whoName = (id) => member(id)?.name || 'alguém que saiu';
  const plain = (text) => String(text || '').replace(/\*\*/g, '');
  // A fonte escolhida para os rolls fica guardada neste navegador.
  const savedSource = () => { try { return localStorage.getItem('mudaeSource') || ''; } catch { return ''; } };
  const saveSource = (value) => { try { localStorage.setItem('mudaeSource', value); } catch { /* sem armazenamento: só nesta sessão */ } };

  const S = {
    channel: null, tab: 'mesa', sideOpen: false, side: 'chat',
    people: [], status: null, statusAt: 0,
    stage: null, spinning: null, queue: [], arriving: new Set(), legendaryUntil: 0, legendaryBy: null,
    album: null, albumOwner: null, query: '', filter: 'all', albumSource: 'all', sort: 'value', shown: PAGE,
    sources: null, source: savedSource(),
    ranking: null, favorite: null,
  };
  const nodes = {};
  let ticker = null;
  let activeSpin = null;
  let stageArt = null;

  const msgs = () => state.messages[S.channel] || [];
  const rolls = () => msgs().filter((m) => m.bot === 'mudae' && m.mudae?.kind === 'roll' && m.mudae.card);
  const byId = (id) => msgs().find((m) => m.id === id);

  // Em que pé está um roll: girando, só quem rodou pode casar, aberto, com dono ou esgotado.
  function phase(m) {
    const d = m.mudae;
    if (d.ownerId) return 'owned';
    const t = now();
    const reveal = d.revealAt ?? m.ts;
    if (t < reveal) return 'spinning';
    if (t > (d.expires ?? reveal + 45_000)) return 'expired';
    if (d.priorityUntil && t < d.priorityUntil && m.by !== me()) return 'priority';
    return 'open';
  }
  const claimable = (m) => ['spinning', 'priority', 'open'].includes(phase(m));
  const secondsLeft = (m) => Math.max(0, Math.ceil(((m.mudae.expires ?? m.ts + 45_000) - now()) / 1000));

  // ---------- cards ----------
  // Inclinação 3D e brilho que seguem o mouse (o holográfico usa --mx/--my).
  function tilt(node) {
    node.addEventListener('pointermove', (e) => {
      if (reducedMotion()) return;
      const r = node.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
      node.style.setProperty('--rx', ((0.5 - y) * 10).toFixed(2) + 'deg');
      node.style.setProperty('--ry', ((x - 0.5) * 12).toFixed(2) + 'deg');
      node.style.setProperty('--mx', (x * 100).toFixed(1) + '%');
      node.style.setProperty('--my', (y * 100).toFixed(1) + '%');
    });
    node.addEventListener('pointerleave', () => { for (const v of ['--rx', '--ry', '--mx', '--my']) node.style.removeProperty(v); });
    return node;
  }

  // Só mostramos pixels que o navegador já carregou e decodificou.
  function picture(src, { loading = 'eager', priority = 'auto' } = {}) {
    const img = new Image();
    img.loading = loading;
    img.decoding = 'async';
    img.fetchPriority = priority;
    img.draggable = false;
    const record = { src, image: img, ready: false };
    if (!src) { record.promise = Promise.resolve(record); return record; }
    record.promise = new Promise((resolve) => {
      img.onload = async () => {
        try {
          if (img.decode) await img.decode();
          record.ready = img.naturalWidth > 0;
        } catch { /* Uma imagem inválida mantém o verso da carta. */ }
        resolve(record);
      };
      img.onerror = () => resolve(record);
    });
    img.src = src;
    return record;
  }

  function cardBack() {
    return el('div', { class: 'salon-card-back', ariaHidden: 'true' }, Icon('dice', 40));
  }

  function art(card, eager = false, onReady = null) {
    const record = eager && stageArt?.src === card.image && !stageArt.image.isConnected
      ? stageArt : picture(card.image, { loading: eager ? 'eager' : 'lazy', priority: eager ? 'high' : 'auto' });
    if (eager) stageArt = record;
    const img = record.image;
    img.alt = card.name;
    img.className = 'salon-art-image' + (record.ready ? ' ready' : '');
    const back = cardBack();
    const frame = el('div', { class: 'salon-art' }, back, img);
    if (record.ready) back.remove();
    else {
      // O verso continua atrás da foto durante o fade, sem um quadro preto entre os dois.
      img.addEventListener('transitionend', () => back.remove(), { once: true });
      record.promise.then(() => {
        if (record.ready) img.classList.add('ready');
        else { img.remove(); back.title = 'Imagem indisponível'; }
      });
    }
    if (onReady) record.promise.then(() => { if (record.ready) onReady(img); });
    return frame;
  }

  function cardNode(card, { size = 'small', onclick = null, extra = null, overlay = null, onArtReady = null } = {}) {
    const rarity = card.rarity || 'common';
    const node = el('div', { class: `salon-card framed ${size} r-${rarity}` },
      el('div', { class: 'salon-card-visual' },
        el('div', { class: 'salon-card-art', onclick: onclick || (() => openImage(card.image)) }, art(card, size === 'big', onArtReady)), overlay),
      el('div', { class: 'salon-card-info' },
        el('div', { class: 'salon-card-heading' },
          el('div', { class: 'salon-card-name', textContent: card.name, title: card.name }),
          size !== 'mini' ? el('span', { class: 'salon-rank', title: 'Posição no ranking de popularidade', textContent: '#' + num(card.rank) }) : null),
        size !== 'mini' ? el('div', { class: 'salon-card-series', textContent: ui.seriesLine(card), title: card.series }) : null,
        el('div', { class: 'salon-card-value' }, kakera(), el('strong', { textContent: num(card.value) }))),
      extra);
    return size === 'mini' ? node : tilt(node);
  }

  // ---------- estrutura ----------
  function mount(channel) {
    S.channel = channel.id;
    Object.assign(S, { tab: 'mesa', stage: null, spinning: null, queue: [], arriving: new Set(), legendaryUntil: 0, album: null, ranking: null, sideOpen: false, side: 'chat', people: [] });
    nodes.tabs = el('div', { class: 'salon-tabs', role: 'tablist' });
    nodes.status = el('div', { class: 'salon-status' });
    nodes.body = el('div', { class: 'salon-body' });
    nodes.sideToggle = el('button', { type: 'button', class: 'salon-side-toggle', onclick: () => toggleSide() }, Icon('message', 18), el('span', { textContent: 'Chat · No salão' }));
    // Modo simplificado: o canal vira chat comum com os cards completos (o Mudae original), só para esta pessoa.
    const simple = el('button', { type: 'button', class: 'salon-simple', title: 'Ver este canal como chat, com os cards no chat (o Mudae original). Dá para voltar pelo botão "Abrir o Salão".',
      onclick: () => setSimple(true) }, Icon('message', 16), el('span', { textContent: 'Modo simplificado' }));
    root.replaceChildren(el('div', { class: 'salon-top' }, nodes.tabs, el('div', { class: 'salon-top-right' }, nodes.status, simple)), nodes.body, nodes.sideToggle);
    mountSide();
    renderTabs();
    renderBody();
    updateStatus();
    pickInitialStage();
    call('mudae:presence', { channel: channel.id }).then((res) => { if (res && S.channel === channel.id) setStatus(res); });
    call('mudae:profile', { accountId: me() }).then((res) => { if (S.channel === channel.id) { S.favorite = res?.summary?.favorite || null; if (!S.stage) renderStage(); } });
    clearInterval(ticker);
    ticker = setInterval(tick, 250);
  }

  function unmount() {
    if (!S.channel) return;
    stopSpin();
    call('mudae:presence', { channel: null });
    S.channel = null;
    clearInterval(ticker);
    ticker = null;
    root.replaceChildren();
    nodes.sideTabs?.remove();
    nodes.people?.remove();
    $('#chat-view').classList.remove('salon-people-open');
    $('#main').classList.remove('salon-side-open');
  }

  // Chamado a cada render do app: monta, desmonta ou só atualiza o que depende dos membros.
  function sync(channel) {
    if (!channel) return unmount();
    if (S.channel !== channel.id) { unmount(); mount(channel); return; }
    renderPeople();
  }

  function toggleSide(force = !S.sideOpen) {
    S.sideOpen = force;
    $('#main').classList.toggle('salon-side-open', S.sideOpen);
  }

  // Abas da coluna direita (Chat / No salão) ficam dentro do #chat-view, que vira a coluna.
  function mountSide() {
    nodes.sideTabs = el('div', { id: 'salon-side-tabs', role: 'tablist' });
    nodes.people = el('div', { id: 'salon-people', class: 'hidden' });
    const view = $('#chat-view');
    view.prepend(nodes.sideTabs);
    view.append(nodes.people);
    renderSideTabs();
  }

  function renderSideTabs() {
    const tab = (id, label) => el('button', { type: 'button', role: 'tab', class: 'salon-side-tab' + (S.side === id ? ' active' : ''), ariaSelected: String(S.side === id),
      onclick: () => { S.side = id; renderSideTabs(); } }, label);
    nodes.sideTabs.replaceChildren(
      tab('chat', 'Chat'),
      tab('people', ['No salão', el('span', { class: 'salon-count', textContent: String(S.people.length) })]),
      el('button', { type: 'button', class: 'salon-side-close', ariaLabel: 'Fechar', onclick: () => toggleSide(false) }, Icon('x', 18)));
    nodes.people.classList.toggle('hidden', S.side !== 'people');
    $('#chat-view').classList.toggle('salon-people-open', S.side === 'people');
    renderPeople();
  }

  function renderPeople() {
    if (!nodes.people) return;
    const list = S.people.slice().sort((a, b) => (a.id === me()) - (b.id === me()) || whoName(a.id).localeCompare(whoName(b.id)));
    nodes.people.replaceChildren(
      el('div', { class: 'salon-section-title', textContent: `NO SALÃO — ${list.length}` }),
      ...list.map((p) => {
        const m = member(p.id);
        return el('button', { type: 'button', class: 'salon-person', title: 'Ver o harem de ' + whoName(p.id), onclick: () => openHarem(p.id) },
          m ? avatar(m) : el('div', { class: 'avatar' }),
          el('div', { class: 'salon-person-info' },
            el('div', { class: 'salon-person-name', style: { color: nameColor(m) || '' } }, el('span', { textContent: whoName(p.id) }),
              p.claimReady ? el('span', { class: 'salon-ring-ready', title: 'Pode casar agora' }, '💍') : null),
            el('div', { class: 'salon-dots', title: `${p.rollsLeft} de ${p.rollsMax} rolls` },
              Array.from({ length: p.rollsMax }, (_, i) => el('span', { class: i < p.rollsLeft ? 'on' : '' })))));
      }));
    if (!list.length) nodes.people.append(el('div', { class: 'salon-empty-note', textContent: 'Ninguém por aqui ainda.' }));
    const count = nodes.sideTabs?.querySelector('.salon-count');
    if (count) count.textContent = String(list.length);
  }

  function renderTabs() {
    const tab = (id, label) => el('button', { type: 'button', role: 'tab', class: 'salon-tab' + (S.tab === id ? ' active' : ''), ariaSelected: String(S.tab === id), onclick: () => setTab(id) }, label);
    nodes.tabs.replaceChildren(tab('mesa', 'Mesa'), tab('harem', 'Meu harem'), tab('ranking', 'Ranking'));
  }

  function setTab(id, opts = {}) {
    S.tab = id;
    renderTabs();
    if (id === 'harem') return loadAlbum(opts.ownerId || me());
    if (id === 'ranking') loadRanking();
    renderBody();
  }

  function renderBody() {
    if (S.tab === 'mesa') return renderMesa();
    if (S.tab === 'harem') return renderAlbum();
    return renderRanking();
  }

  // ---------- status (rolls e casamento) ----------
  function setStatus(s) {
    if (s?.sources) S.sources = s.sources;
    if (!s || s.rollsLeft === undefined) return;
    S.status = s;
    S.statusAt = Date.now();
    updateStatus();
    renderRollBar();
  }
  function updateStatus() {
    const s = S.status;
    if (!nodes.status) return;
    if (!s) { nodes.status.replaceChildren(); return; }
    const passed = Date.now() - S.statusAt;
    const rolls = s.rollsLeft ? `${s.rollsLeft}/${s.rollsMax} rolls` : `rolls voltam em ${minutes(s.rollResetIn - passed)}`;
    const claim = s.claimReady ? 'casamento disponível 💍' : `casa de novo em ${minutes(s.claimResetIn - passed)}`;
    const text = `${rolls} · ${claim}`;
    if (nodes.status.textContent !== text) nodes.status.replaceChildren(el('span', { class: 'salon-status-pill' + (s.rollsLeft ? '' : ' empty'), textContent: text }));
  }

  // ---------- Mesa ----------
  function renderMesa() {
    nodes.stage = el('div', { class: 'salon-stage' });
    nodes.rollBar = el('div', { class: 'salon-rollbar' });
    nodes.live = el('div', { class: 'salon-live-strip' });
    nodes.body.replaceChildren(el('div', { class: 'salon-mesa' },
      el('div', { class: 'salon-stage-box' }, nodes.stage), nodes.rollBar,
      el('section', { class: 'salon-live' }, el('h3', { textContent: 'Mesa ao vivo' }), nodes.live)));
    renderStage();
    renderRollBar();
    renderLive();
  }

  function renderRollBar() {
    if (!nodes.rollBar?.isConnected) return;
    const s = S.status;
    const empty = s && !s.rollsLeft;
    const mySpin = S.spinning && byId(S.spinning)?.by === me();
    const btn = (cmd, label, primary) => el('button', { type: 'button', class: 'salon-roll' + (primary ? ' primary' : ''), disabled: empty || mySpin,
      title: empty ? `Seus rolls voltam em ${minutes(s.rollResetIn - (Date.now() - S.statusAt))}` : 'Rodar ' + cmd,
      onclick: () => roll(cmd) }, Icon('dice', 18), el('span', { class: 'salon-roll-cmd', textContent: cmd }), el('span', { textContent: label }));
    // De onde vêm os personagens: só aparecem as fontes que existem no catálogo.
    const sources = Object.keys(S.sources || {}).filter((k) => ui.SOURCES[k]);
    if (S.source && S.sources && !sources.includes(S.source)) S.source = '';
    const choice = (key, label) => el('button', { type: 'button', class: 'salon-source' + (S.source === key ? ' active' : ''), ariaPressed: String(S.source === key),
      onclick: () => { S.source = key; saveSource(key); renderRollBar(); } }, label);
    const filters = sources.length > 1 ? el('div', { class: 'salon-sources', role: 'group', ariaLabel: 'De onde vêm os personagens' },
      choice('', '✨ Tudo'), ...sources.map((k) => choice(k, ui.SOURCES[k].icon + ' ' + ui.SOURCES[k].label))) : null;
    const cmd = (kind) => '$' + kind + S.source;
    nodes.rollBar.replaceChildren(...[filters,
      el('div', { class: 'salon-roll-buttons' }, btn(cmd('w'), 'Waifu', true), btn(cmd('h'), 'Husbando'), btn(cmd('m'), 'Qualquer um'))].filter(Boolean));
  }

  async function roll(cmd) {
    S.lastKind = cmd[1];
    resetBackdrop();
    const res = await call('chat:send', { channel: S.channel, text: cmd });
    if (res?.ephemeral?.text) toast(plain(res.ephemeral.text), 'info');
    if (!res || res.ephemeral) renderStage();
  }

  function pickInitialStage() {
    const open = rolls().filter((m) => claimable(m)).at(-1);
    S.stage = open?.id || null;
    if (S.tab === 'mesa') renderStage();
  }

  // O palco: banner, card (ou roleta girando), botão de casar e reações.
  function renderStage() {
    if (!nodes.stage?.isConnected) return;
    // Durante o giro, atualiza os botões; um palco novo mantém a espera pela revelação.
    if (S.spinning && nodes.cardSlot?.isConnected) { resetBackdrop(); return renderActions(); }
    const m = S.stage && byId(S.stage);
    nodes.cardSlot = el('div', { class: 'salon-card-slot' });
    nodes.actions = el('div', { class: 'salon-actions' });
    nodes.banner = el('div', { class: 'salon-banner' });
    nodes.floats = el('div', { class: 'salon-floats', ariaHidden: 'true' });
    nodes.backdrop = el('div', { class: 'salon-showcase', ariaHidden: 'true' });
    nodes.stage.dataset.showcase = 'neutral';
    nodes.stage.replaceChildren(nodes.backdrop, nodes.banner, nodes.cardSlot, nodes.actions, reactionBar(), nodes.floats);
    const spinning = S.spinning && byId(S.spinning);
    if (spinning) {
      spinningLayout(spinning);
      return renderBanner();
    }
    if (m) {
      const owner = m.mudae.ownerId;
      nodes.cardSlot.append(stageCard(m.mudae.card),
        el('div', { class: 'salon-stage-caption' }, member(m.by) ? avatar(member(m.by), 'salon-chip-avatar') : null,
          el('span', { textContent: (m.by === me() ? 'Você rodou' : whoName(m.by) + ' rodou') + ' · ' + RARITY[m.mudae.card.rarity || 'common']
            + ' · ' + ui.SOURCES[m.mudae.card.source || 'a'].label })));
      nodes.stage.dataset.rarity = m.mudae.card.rarity || 'common';
      nodes.stage.classList.toggle('owned', !!owner);
    } else {
      idleStage();
    }
    renderBanner();
    renderActions();
  }

  // Usa a foto já decodificada da carta. A camada decorativa não decide quando um roll acaba.
  function stageCard(card) {
    const backdrop = nodes.backdrop;
    return cardNode(card, { size: 'big', onArtReady: (image) => {
      if (nodes.backdrop === backdrop && nodes.cardSlot?.contains(image)) updateBackdrop();
    } });
  }

  function resetBackdrop() {
    nodes.backdrop?.replaceChildren();
    nodes.backdrop?.classList.remove('has-art');
    if (nodes.stage) nodes.stage.dataset.showcase = 'waiting';
  }

  function updateBackdrop() {
    const backdrop = nodes.backdrop;
    if (!backdrop?.isConnected || backdrop.childElementCount || S.spinning || nodes.stage.dataset.showcase === 'waiting') return;
    const m = S.stage && byId(S.stage);
    // Mesmo no histórico, ou com movimento reduzido, não expõe a foto antes de revealAt.
    if (m && now() < (m.mudae.revealAt ?? m.ts)) return;
    const image = nodes.cardSlot?.querySelector('.salon-card.big img.ready');
    if (!image) return;
    const portrait = image.cloneNode(false);
    portrait.className = 'salon-showcase-portrait';
    portrait.alt = '';
    portrait.loading = 'eager';
    const show = () => {
      if (nodes.backdrop !== backdrop || !portrait.isConnected || S.spinning || nodes.stage.dataset.showcase === 'waiting') return;
      if (portrait.naturalWidth) { backdrop.classList.add('has-art'); nodes.stage.dataset.showcase = 'revealed'; }
    };
    portrait.onload = show;
    portrait.onerror = () => { portrait.remove(); backdrop.classList.remove('has-art'); };
    backdrop.append(portrait);
    if (portrait.complete) show();
  }

  // Ninguém rodando: o último lendário do Salão, o seu favorito ou o convite para começar.
  function idleStage() {
    const legend = rolls().filter((m) => m.mudae.card.rarity === 'legendary').at(-1);
    delete nodes.stage.dataset.rarity;
    if (legend) {
      nodes.cardSlot.append(stageCard(legend.mudae.card),
        el('div', { class: 'salon-stage-caption' }, '🔥 ', el('span', { textContent: `Último lendário: ${whoName(legend.by)}, ${ago(legend.ts)}` })));
    } else if (S.favorite) {
      nodes.cardSlot.append(stageCard(S.favorite), el('div', { class: 'salon-stage-caption' }, '⭐ ', el('span', { textContent: 'Seu favorito' })));
    } else {
      nodes.cardSlot.append(el('div', { class: 'salon-card big placeholder' }, el('div', { class: 'salon-card-back' }, Icon('dice', 56))),
        el('div', { class: 'salon-stage-caption', textContent: 'Rode para começar!' }));
    }
  }

  function ago(ts) {
    const m = Math.round((Date.now() - ts) / 60_000);
    if (m < 1) return 'agora há pouco';
    if (m < 60) return `há ${m} min`;
    const h = Math.round(m / 60);
    return h < 24 ? `há ${h} h` : `há ${Math.round(h / 24)} dia(s)`;
  }

  function renderBanner() {
    if (!nodes.banner) return;
    const show = S.legendaryUntil > Date.now();
    nodes.banner.classList.toggle('show', show);
    nodes.banner.textContent = show ? `🔥 ${S.legendaryBy === me() ? 'VOCÊ TIROU' : whoName(S.legendaryBy).toUpperCase() + ' TIROU'} UM LENDÁRIO!` : '';
  }

  // Botão de casar com o anel de contagem; o anel esvazia por CSS, o número o ticker atualiza.
  function renderActions() {
    if (!nodes.actions) return;
    const m = S.stage && byId(S.stage);
    nodes.actions.dataset.phase = m ? phase(m) : 'idle';
    if (!m) return nodes.actions.replaceChildren();
    const p = phase(m);
    if (p === 'spinning') return nodes.actions.replaceChildren(el('div', { class: 'salon-wait', textContent: 'Girando…' }));
    if (p === 'owned') {
      const owner = member(m.mudae.ownerId);
      return nodes.actions.replaceChildren(el('div', { class: 'salon-owned' }, owner ? avatar(owner, 'salon-chip-avatar') : null,
        el('span', {}, 'Casado com ', el('strong', { textContent: whoName(m.mudae.ownerId), style: { color: nameColor(owner) || '' } }))));
    }
    if (p === 'expired') return nodes.actions.replaceChildren(el('button', { type: 'button', class: 'salon-claim', disabled: true }, Icon('heart', 20), 'Tempo esgotado'));
    const s = S.status;
    const blocked = s && !s.claimReady;
    const total = (m.mudae.expires ?? m.ts + 45_000) - (m.mudae.revealAt ?? m.ts);
    const elapsed = total - Math.max(0, (m.mudae.expires ?? m.ts + 45_000) - now());
    const ring = el('span', { class: 'salon-ring' });
    ring.innerHTML = '<svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="17"></circle><circle class="left" cx="20" cy="20" r="17"></circle></svg>';
    ring.append(el('span', { class: 'salon-ring-text', textContent: secondsLeft(m) + 's' }));
    const left = ring.querySelector('circle.left');
    left.style.animationDuration = total + 'ms';
    left.style.animationDelay = -elapsed + 'ms';
    const btn = el('button', { type: 'button', class: 'salon-claim primary', disabled: p === 'priority' || blocked, onclick: () => claim(m, btn) },
      el('span', { class: 'salon-heart' }, Icon('heart', 20)), 'Casar');
    const caption = el('div', { class: 'salon-claim-caption' });
    nodes.actions.replaceChildren(el('div', { class: 'salon-claim-row' }, btn, ring), caption);
    captionFor(m, caption);
  }

  function captionFor(m, caption) {
    const p = phase(m);
    const s = S.status;
    const pr = Math.ceil(((m.mudae.priorityUntil || 0) - now()) / 1000);
    let text = '';
    if (s && !s.claimReady) text = `Você casa de novo em ${minutes(s.claimResetIn - (Date.now() - S.statusAt))}`;
    else if (p === 'priority') text = `prioridade de ${whoName(m.by)} · ${pr}s`;
    else if (pr > 0 && m.by === me()) text = `só você pode casar · ${pr}s`;
    else if (m.by !== me()) text = 'Casar com o roll de outra pessoa é roubo 😈';
    if (caption.textContent !== text) caption.textContent = text;
  }

  async function claim(m, btn) {
    btn.disabled = true;
    btn.classList.add('pending');
    const res = await call('mudae:claim', { channel: S.channel, id: m.id });
    if (res) Sounds.play('mudaeClaim');
    else if (btn.isConnected) { btn.disabled = false; btn.classList.remove('pending'); }
  }

  function reactionBar() {
    return el('div', { class: 'salon-reactions' }, REACTIONS.map((emoji) => el('button', { type: 'button', class: 'salon-react', ariaLabel: 'Reagir com ' + emoji,
      onclick: () => S.stage && call('mudae:react', { channel: S.channel, id: S.stage, emoji }) }, emoji)));
  }

  function floatReaction({ emoji, by }) {
    if (!nodes.floats?.isConnected) return;
    const who = member(by);
    const node = el('span', { class: 'salon-float' }, emoji, who ? el('small', { textContent: who.name }) : null);
    node.style.setProperty('--x', (Math.random() * 120 - 60).toFixed(0) + 'px');
    node.style.setProperty('--r', (Math.random() * 30 - 15).toFixed(0) + 'deg');
    node.addEventListener('animationend', () => node.remove(), { once: true });
    nodes.floats.append(node);
  }

  // Ao voltar para a Mesa durante um giro, guarda o espaço até o horário da revelação.
  function spinningLayout(m) {
    nodes.cardSlot.replaceChildren(el('div', { class: 'salon-card big placeholder' }, cardBack()),
      el('div', { class: 'salon-stage-caption', textContent: (m.by === me() ? 'Você está' : whoName(m.by) + ' está') + ' rodando…' }));
    nodes.stage.dataset.rarity = 'spinning';
    renderActions();
  }

  // A carta vira de frente ao revelar o resultado.
  function emerge(card) {
    card.classList.add('revealing');
  }

  // ---------- a roleta ----------
  function takeStage(m) {
    stopSpin();
    S.stage = m.id;
    S.arriving.delete(m.id);
    const d = m.mudae;
    const left = (d.revealAt ?? m.ts) - now();
    if (S.tab !== 'mesa' || !nodes.stage?.isConnected) return;
    if (!d.decoys?.length || left < 300 || reducedMotion()) {
      renderStage();
      return reveal(m, left > 0);
    }
    spin(m, left);
  }

  function stopSpin() {
    if (activeSpin) {
      activeSpin.timers.forEach(clearTimeout);
      activeSpin.animation?.cancel();
      activeSpin.release?.();
      activeSpin = null;
    }
    S.spinning = null;
  }

  async function spin(m, duration) {
    const d = m.mudae;
    const rarity = d.card.rarity || 'common';
    const run = activeSpin = { channel: S.channel, timers: [], animation: null };
    const current = () => activeSpin === run && S.channel === run.channel && S.spinning === m.id;
    const later = (fn, ms) => run.timers.push(setTimeout(() => { if (current()) fn(); }, ms));
    S.spinning = m.id;
    renderStage();
    renderRollBar();
    // O resultado tem prioridade; iscas lentas ou inválidas não entram no giro.
    const winner = stageArt = picture(d.card.image, { priority: 'high' });
    const decoys = [...d.decoys, ...d.decoys.slice(0, 3)].map((src) => picture(src, { priority: 'low' }));
    const cover = el('div', { class: 'salon-reel-cover' }, cardBack());
    const reel = el('div', { class: `salon-reel is-preparing r-${rarity}` }, cover, el('div', { class: 'salon-reel-shade' }));
    nodes.cardSlot.replaceChildren(reel, el('div', { class: 'salon-stage-caption', textContent: (m.by === me() ? 'Você está' : whoName(m.by) + ' está') + ' rodando…' }));
    nodes.stage.dataset.rarity = 'spinning';
    renderActions();
    const done = () => {
      if (!current()) return;
      stopSpin();
      renderStage();
      renderRollBar();
      reveal(m, !document.hidden);
    };
    // A rede nunca prolonga o giro nem consome a janela de prioridade do servidor.
    later(done, duration);
    await Promise.race([
      Promise.all([winner.promise, ...decoys.map((record) => record.promise)]),
      new Promise((resolve) => { run.release = resolve; later(resolve, Math.min(300, duration * .15)); }),
    ]);
    if (!current() || !reel.isConnected) return;
    const remaining = (d.revealAt ?? m.ts) - now();
    if (remaining <= 0) return done();
    const images = decoys.filter((record) => record.ready).map((record) => record.image);
    // Sem fotos prontas, um baralho de versos mantém a animação inteira.
    while (images.length < 3) images.push(cardBack());
    images.push(winner.ready ? winner.image : cardBack());
    for (const img of images) if (img.tagName === 'IMG') { img.alt = ''; img.className = ''; }
    const strip = el('div', { class: 'salon-reel-strip' }, images.map((image) => el('div', { class: 'salon-reel-cell' }, image)));
    reel.prepend(strip);
    reel.classList.remove('is-preparing');
    reel.classList.add('is-ready');
    const n = images.length;
    const slow = rarity === 'legendary' || rarity === 'epic';
    const anim = run.animation = strip.animate([{ transform: 'translateY(0)' }, { transform: `translateY(-${((n - 1) / n) * 100}%)` }],
      { duration: remaining, easing: slow ? 'cubic-bezier(.08,.8,.08,1)' : 'cubic-bezier(.2,.75,.25,1)', fill: 'forwards' });
    // Tique a cada foto que passa, cada vez mais espaçado.
    for (let k = 1; k < n; k++) later(() => Sounds.play('mudaeTick'), remaining * (1 - Math.sqrt(1 - k / n)) ** 1.6);
    if (slow) later(() => reel.classList.add('tease'), Math.max(0, remaining - 700));
    anim.onfinish = done;
  }

  function reveal(m, animate) {
    const rarity = m.mudae.card.rarity || 'common';
    const card = nodes.cardSlot?.querySelector('.salon-card');
    if (animate && card) emerge(card, m.id);
    Sounds.play({ legendary: 'mudaeLegendary', epic: 'mudaeEpic', rare: 'mudaeRare', common: 'mudaeCommon' }[rarity]);
    if (rarity === 'legendary') {
      S.legendaryUntil = Date.now() + 5000;
      S.legendaryBy = m.by;
      renderBanner();
      root.classList.remove('flash');
      void root.offsetWidth;
      root.classList.add('flash');
    }
    renderLive();
    const next = S.queue.shift();
    if (next && byId(next)) setTimeout(() => takeStage(byId(next)), 900);
  }

  // ---------- mesa ao vivo ----------
  function renderLive() {
    if (!nodes.live?.isConnected) return;
    const list = rolls().slice(-LIVE).reverse();
    if (!list.length) return nodes.live.replaceChildren(el('div', { class: 'salon-empty-note', textContent: 'Os rolls de todo mundo aparecem aqui.' }));
    nodes.live.replaceChildren(...list.map(liveCard));
  }

  function liveCard(m) {
    const p = phase(m);
    const d = m.mudae;
    const who = member(m.by);
    const chip = el('div', { class: 'salon-chip' }, who ? avatar(who, 'salon-chip-avatar') : null, el('span', { textContent: whoName(m.by) }));
    const open = () => { S.stage = m.id; renderStage(); };
    let node;
    if (p === 'spinning') {
      node = el('div', { class: 'salon-card small back', onclick: open }, el('div', { class: 'salon-card-back' }, Icon('dice', 32)), chip);
    } else {
      const overlay = p === 'owned'
        ? el('div', { class: 'salon-ribbon' }, member(d.ownerId) ? avatar(member(d.ownerId), 'salon-chip-avatar') : null, el('span', { textContent: 'Casado com ' + whoName(d.ownerId) }))
        : p === 'expired' ? el('div', { class: 'salon-expired', textContent: 'Tempo esgotado' })
          : el('div', { class: 'salon-timer', data: { id: m.id } }, secondsLeft(m) + 's');
      node = cardNode(d.card, { size: 'small', onclick: open, overlay: [chip, overlay] });
    }
    node.classList.add('live', 'p-' + p);
    node.dataset.id = m.id;
    node.dataset.phase = p;
    if (S.stage === m.id) node.classList.add('on-stage');
    if (S.arriving.has(m.id)) {
      S.arriving.delete(m.id);
      node.classList.add('arriving');
    }
    return node;
  }

  // ---------- relógio da tela ----------
  function tick() {
    if (!S.channel) return;
    updateStatus();
    if (S.legendaryUntil && S.legendaryUntil < Date.now()) { S.legendaryUntil = 0; renderBanner(); }
    if (S.tab !== 'mesa') return;
    updateBackdrop();
    const m = S.stage && byId(S.stage);
    if (m && !S.spinning && nodes.actions) {
      if (nodes.actions.dataset.phase !== phase(m)) renderActions();
      else {
        const text = nodes.actions.querySelector('.salon-ring-text');
        if (text) text.textContent = secondsLeft(m) + 's';
        const caption = nodes.actions.querySelector('.salon-claim-caption');
        if (caption) captionFor(m, caption);
      }
    }
    if (nodes.live?.isConnected) {
      let changed = false;
      for (const node of nodes.live.querySelectorAll('.salon-card.live')) {
        const lm = byId(node.dataset.id);
        if (!lm) continue;
        if (phase(lm) !== node.dataset.phase) { changed = true; break; }
        const timer = node.querySelector('.salon-timer');
        if (timer) timer.textContent = secondsLeft(lm) + 's';
      }
      if (changed) renderLive();
    }
  }

  // ---------- álbum ----------
  async function loadAlbum(ownerId) {
    const channel = S.channel;
    S.albumOwner = ownerId;
    if (S.album?.ownerId !== ownerId) { S.album = null; S.shown = PAGE; }
    renderBody();
    const res = await call('mudae:harem', { ownerId });
    if (!res || S.channel !== channel || S.albumOwner !== ownerId) return;
    S.album = res;
    if (ownerId === me()) S.favorite = res.favorite;
    if (S.tab === 'harem') renderAlbum();
  }

  function openHarem(ownerId) {
    toggleSide(false);
    S.tab = 'harem';
    renderTabs();
    loadAlbum(ownerId);
  }

  function filtered() {
    const q = S.query.trim().toLowerCase();
    const list = S.album.chars.filter((c) => (S.filter === 'all' || c.rarity === S.filter) && (S.albumSource === 'all' || (c.source || 'a') === S.albumSource)
      && (!q || c.name.toLowerCase().includes(q) || c.series.toLowerCase().includes(q)));
    const sorters = {
      value: (a, b) => a.rank - b.rank,
      recent: (a, b) => b.claimedAt - a.claimedAt,
      series: (a, b) => a.series.localeCompare(b.series) || a.rank - b.rank,
      name: (a, b) => a.name.localeCompare(b.name),
    };
    return list.sort(sorters[S.sort]);
  }

  function renderAlbum() {
    if (S.tab !== 'harem') return;
    const a = S.album;
    if (!a) return nodes.body.replaceChildren(el('div', { class: 'salon-loading', textContent: 'Abrindo o álbum…' }));
    const mine = a.ownerId === me();
    const owner = member(a.ownerId);
    const fav = a.favorite;
    const head = el('div', { class: 'salon-album-head' },
      el('div', { class: 'salon-album-who' }, owner ? avatar(owner, 'salon-album-avatar') : null,
        el('div', {}, el('h2', { textContent: mine ? 'Seu harem' : 'Harem de ' + whoName(a.ownerId) }),
          el('div', { class: 'salon-album-stats' }, `${num(a.total)} ${a.total === 1 ? 'personagem' : 'personagens'} · `, el('strong', { textContent: num(a.value) }), kakera()),
          mine ? null : el('button', { type: 'button', class: 'salon-link', onclick: () => loadAlbum(me()) }, '← Ver o meu harem'))),
      fav ? el('div', { class: 'salon-album-fav r-' + fav.rarity, onclick: () => openImage(fav.image) },
        el('img', { src: fav.image, alt: fav.name, decoding: 'async', draggable: false }),
        el('div', {}, el('div', { class: 'salon-fav-tag' }, '⭐ ', fav.chosen ? 'Favorito' : 'Mais valioso'),
          el('div', { class: 'salon-card-name', textContent: fav.name }), el('div', { class: 'salon-card-series', textContent: fav.series }),
          el('div', { class: 'salon-card-value' }, kakera(), el('strong', { textContent: num(fav.value) })))) : null);
    if (!a.total) {
      return nodes.body.replaceChildren(el('div', { class: 'salon-album' }, head, el('div', { class: 'salon-empty' },
        el('div', { class: 'salon-empty-icon' }, Icon('dice', 40)),
        el('p', { textContent: mine ? 'Você ainda não casou com ninguém. Rode na Mesa e seja rápido no Casar!' : whoName(a.ownerId) + ' ainda não casou com ninguém.' }),
        el('button', { type: 'button', class: 'salon-roll primary', onclick: () => setTab('mesa') }, 'Ir para a Mesa'))));
    }
    const search = el('input', { type: 'search', class: 'salon-search', placeholder: 'Buscar personagem ou obra…', value: S.query, ariaLabel: 'Buscar no harem' });
    search.oninput = () => { S.query = search.value; S.shown = PAGE; renderGrid(); };
    const chip = (id, label) => el('button', { type: 'button', class: 'salon-filter ' + (id === 'all' ? '' : 'f-' + id) + (S.filter === id ? ' active' : ''),
      onclick: () => { S.filter = id; S.shown = PAGE; renderAlbum(); } }, label);
    const sort = el('select', { class: 'salon-sort', ariaLabel: 'Ordenar' },
      [['value', 'Ordenar: valor'], ['recent', 'Mais recentes'], ['series', 'Por obra'], ['name', 'Por nome']].map(([v, t]) => el('option', { value: v, textContent: t, selected: S.sort === v })));
    sort.onchange = () => { S.sort = sort.value; S.shown = PAGE; renderGrid(); };
    const present = [...new Set(a.chars.map((c) => c.source || 'a'))].filter((k) => ui.SOURCES[k]);
    const sourceSelect = present.length > 1 ? el('select', { class: 'salon-sort', ariaLabel: 'Fonte' },
      [['all', 'Todas as fontes'], ...present.map((k) => [k, ui.SOURCES[k].icon + ' ' + ui.SOURCES[k].label])].map(([v, t]) => el('option', { value: v, textContent: t, selected: S.albumSource === v }))) : null;
    if (sourceSelect) sourceSelect.onchange = () => { S.albumSource = sourceSelect.value; S.shown = PAGE; renderGrid(); };
    nodes.grid = el('div', { class: 'salon-grid' });
    nodes.body.replaceChildren(el('div', { class: 'salon-album' }, head,
      el('div', { class: 'salon-toolbar' }, search, el('div', { class: 'salon-filters' }, chip('all', 'Todos'), ...RARITY_ORDER.map((r) => chip(r, RARITY[r] + 's'))), sourceSelect, sort),
      nodes.grid));
    renderGrid();
  }

  function renderGrid() {
    if (!nodes.grid?.isConnected) return;
    const a = S.album;
    const mine = a.ownerId === me();
    const list = filtered();
    const cards = list.slice(0, S.shown).map((c) => {
      const isFav = a.favorite?.chosen && a.favorite.id === c.id;
      const actions = mine ? el('div', { class: 'salon-card-actions' },
        el('button', { type: 'button', class: isFav ? 'active' : '', onclick: (e) => { e.stopPropagation(); favorite(isFav ? null : c.id); } }, '⭐ ', isFav ? 'Favorito' : 'Favoritar'),
        el('button', { type: 'button', class: 'danger', title: 'Divorciar de ' + c.name, ariaLabel: 'Divorciar de ' + c.name, onclick: (e) => { e.stopPropagation(); divorce(c); } }, Icon('trash', 16))) : null;
      const node = cardNode(c, { size: 'album' });
      if (isFav) node.classList.add('fav');
      return el('div', { class: 'salon-album-item' }, node, actions);
    });
    nodes.grid.replaceChildren(...cards);
    if (!list.length) nodes.grid.append(el('div', { class: 'salon-empty-note', textContent: 'Nada encontrado.' }));
    if (list.length > S.shown) {
      const showMore = () => { S.shown += PAGE; renderGrid(); };
      if (typeof IntersectionObserver === 'undefined') {
        nodes.grid.append(el('button', { type: 'button', class: 'salon-more', onclick: showMore }, 'Mostrar mais'));
        return;
      }
      const more = el('div', { class: 'salon-more', textContent: 'Carregando mais…' });
      nodes.grid.append(more);
      const io = new IntersectionObserver((entries) => {
        if (!entries[0].isIntersecting) return;
        io.disconnect();
        showMore();
      }, { rootMargin: '300px' });
      io.observe(more);
    }
  }

  async function favorite(charId) {
    if (await call('mudae:favorite', { charId })) loadAlbum(me());
  }

  async function divorce(c) {
    if (!await confirmDialog({ title: 'Divorciar?', text: `${c.name} sai do seu harem e qualquer pessoa vai poder casar com esse personagem de novo.`, confirm: 'Divorciar' })) return;
    if (await call('mudae:divorce', { channel: S.channel, charId: c.id })) loadAlbum(me());
  }

  // ---------- ranking ----------
  async function loadRanking() {
    const channel = S.channel;
    const res = await call('mudae:ranking');
    if (!res || S.channel !== channel) return;
    S.ranking = res;
    if (S.tab === 'ranking') renderRanking();
  }

  function renderRanking() {
    const r = S.ranking;
    if (!r) return nodes.body.replaceChildren(el('div', { class: 'salon-loading', textContent: 'Calculando o ranking…' }));
    const medals = ['🥇', '🥈', '🥉'];
    const myIndex = r.rows.findIndex((row) => row.ownerId === me());
    const row = (x, i) => {
      const m = member(x.ownerId);
      return el('button', { type: 'button', class: 'salon-rank-row' + (x.ownerId === me() ? ' me' : ''), onclick: () => openHarem(x.ownerId) },
        el('span', { class: 'salon-rank-pos', textContent: medals[i] || String(i + 1) }),
        m ? avatar(m) : el('div', { class: 'avatar' }),
        el('div', { class: 'salon-rank-who' }, el('strong', { textContent: x.ownerId === me() ? 'Você' : whoName(x.ownerId), style: { color: nameColor(m) || '' } }),
          el('span', { textContent: `${num(x.total)} ${x.total === 1 ? 'personagem' : 'personagens'}` })),
        x.favorite ? el('img', { class: 'salon-rank-fav r-' + x.favorite.rarity, src: x.favorite.image, alt: x.favorite.name, title: x.favorite.name, loading: 'lazy' }) : null,
        el('span', { class: 'salon-rank-value' }, el('strong', { textContent: num(x.value) }), kakera()));
    };
    const top = r.rows.slice(0, 10).map(row);
    if (myIndex >= 10) top.push(el('div', { class: 'salon-rank-gap', textContent: '⋯' }), row(r.rows[myIndex], myIndex));
    nodes.body.replaceChildren(el('div', { class: 'salon-ranking' },
      el('h2', { textContent: 'Ranking do servidor' }),
      el('p', { class: 'salon-muted', textContent: 'Pelo valor total do harem.' }),
      r.rows.length ? el('div', { class: 'salon-rank-list' }, top) : el('div', { class: 'salon-empty-note', textContent: 'Ninguém casou ainda. O primeiro lugar está livre!' }),
      myIndex < 0 && r.rows.length ? el('div', { class: 'salon-empty-note', textContent: 'Você ainda não está no ranking: case com alguém na Mesa!' }) : null,
      el('h3', { textContent: `Lendários do servidor — ${r.legendaries.length}` }),
      r.legendaries.length
        ? el('div', { class: 'salon-legends' }, r.legendaries.map((c) => cardNode(c, { size: 'mini', extra: el('div', { class: 'salon-chip' },
          member(c.ownerId) ? avatar(member(c.ownerId), 'salon-chip-avatar') : null, el('span', { textContent: whoName(c.ownerId) })) })))
        : el('div', { class: 'salon-empty-note', textContent: 'Nenhum lendário com dono ainda.' }),
      // Créditos das fontes (o TMDB pede este aviso em quem usa a API dele).
      el('p', { class: 'salon-credits', textContent: 'Personagens e imagens: AniList, IGDB, Comic Vine, TMDB e wikis do Fandom. Este produto usa a API do TMDB, mas não é endossado nem certificado pelo TMDB.' })));
  }

  // ---------- eventos ----------
  function onMessage(channel, m) {
    if (channel !== S.channel || m.bot !== 'mudae') return;
    const d = m.mudae || {};
    if (d.kind === 'roll' && d.card) {
      const mine = m.by === me();
      const stageMsg = S.stage && byId(S.stage);
      const busy = S.spinning || (stageMsg && stageMsg.id !== m.id && claimable(stageMsg));
      if (mine) takeStage(m);
      else if (d.card.rarity === 'legendary') {
        if (S.spinning && byId(S.spinning)?.by === me()) S.queue.push(m.id);
        else takeStage(m);
      } else if (!busy) takeStage(m);
      else {
        S.arriving.add(m.id);
        if (d.card.rarity === 'epic') Sounds.play('mudaeRare');
      }
      renderLive();
    } else if (d.kind === 'married' || d.kind === 'divorce') {
      if (S.tab === 'harem' && S.albumOwner && (d.ownerId === S.albumOwner)) loadAlbum(S.albumOwner);
      if (S.tab === 'ranking') loadRanking();
      if (d.ownerId === me() && d.kind === 'married') call('mudae:profile', { accountId: me() }).then((res) => { S.favorite = res?.summary?.favorite || S.favorite; });
    }
  }

  function onUpdate(channel, m) {
    if (channel !== S.channel || m.bot !== 'mudae') return;
    if (m.id === S.stage && !S.spinning) renderStage();
    renderLive();
  }

  function onHistory(channel) {
    if (channel !== S.channel) return;
    pickInitialStage();
    renderLive();
  }

  onSocket('mudae:presence', ({ channel, people }) => {
    if (channel !== S.channel) return;
    S.people = people;
    const mine = people.find((p) => p.id === me());
    if (mine) setStatus(mine);
    renderPeople();
  });
  onSocket('mudae:reaction', (r) => { if (r.channel === S.channel) floatReaction(r); });
  // Depois de reconectar, o servidor não sabe mais que estamos no Salão.
  onSocket('connect', () => { if (S.channel) call('mudae:presence', { channel: S.channel }).then((res) => res && setStatus(res)); });

  // ---------- perfil ----------
  // Resumo do harem no cartão de perfil, buscado sob demanda e guardado por um minuto.
  const profiles = new Map();
  function profileSection(accountId, rerender) {
    const key = state.server.serverId + ':' + accountId;
    const hit = profiles.get(key);
    if (!hit || Date.now() - hit.at > 60_000) {
      if (!hit?.pending) {
        profiles.set(key, { ...hit, pending: true, at: hit?.at || 0 });
        call('mudae:profile', { accountId }).then((res) => {
          profiles.set(key, { summary: res?.summary || null, at: Date.now() });
          rerender();
        });
      }
      if (!hit?.summary) return null;
    }
    const s = profiles.get(key).summary;
    if (!s?.favorite) return null;
    const salon = state.server.channels.find((c) => c.mudae);
    const f = s.favorite;
    return el('div', { class: 'pc-section' },
      el('div', { class: 'pc-label', textContent: 'MUDAE' }),
      el('button', { type: 'button', class: 'pc-mudae r-' + f.rarity, disabled: !salon, title: salon ? 'Ver o harem' : '',
        onclick: () => { closeProfile(); openChannel(salon.id); setTimeout(() => openHarem(accountId)); } },
        el('img', { src: f.image, alt: f.name, loading: 'lazy', decoding: 'async' }),
        el('div', {}, el('div', { class: 'pc-mudae-tag', textContent: f.chosen ? '⭐ Favorito' : '⭐ Mais valioso' }),
          el('strong', { textContent: f.name }),
          el('div', { class: 'pc-mudae-stats' }, `${num(s.total)} ${s.total === 1 ? 'personagem' : 'personagens'} · ${num(s.value)} `, kakera()))));
  }

  return { sync, onMessage, onUpdate, onHistory, show: (id) => { if (S.tab !== 'mesa') setTab('mesa'); S.stage = id; renderStage(); renderLive(); toggleSide(false); },
    openHarem, profileSection, get channel() { return S.channel; } };
};
