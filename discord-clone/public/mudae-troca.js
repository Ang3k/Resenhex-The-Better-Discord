/* Troca de cartas do Mudae: o painel que as duas pessoas veem ao mesmo tempo. Cada uma escolhe o que
   oferece (personagens do harem e kakera). Qualquer mudança desfaz as duas confirmações; com as duas
   confirmadas, o servidor confere tudo de novo e troca de uma vez. Aqui só desenhamos o que ele manda.
   Também mora aqui o aviso flutuante com botão (convite de troca e personagem desejado que saiu). */
window.MudaeTrade = function ({ state, el, Icon, call, onSocket, member, avatar, nameColor, toast, ui, Sounds = { play() {} } }) {
  const { num, kakera } = ui;
  const me = () => state.me.accountId;
  const whoName = (id) => member(id)?.name || 'alguém que saiu';
  const T = { view: null, open: false, album: null, kakera: 0, query: '', picking: false, known: new Set(), sending: false };
  const nodes = {};
  let ticker = null;

  // ---------- aviso flutuante ----------
  // Cartão no canto com um botão; some sozinho depois de alguns segundos. Até 3 de uma vez.
  function notice({ icon = 'info', image = null, text, action = null, onAction = null, ms = 12_000 }) {
    let stack = document.getElementById('mudae-notices');
    if (!stack) {
      stack = el('div', { id: 'mudae-notices', role: 'status', ariaLive: 'polite' });
      document.body.append(stack);
    }
    const close = () => { clearTimeout(timer); node.remove(); };
    const node = el('div', { class: 'mudae-notice' },
      image ? el('img', { class: 'mudae-notice-img', src: image, alt: '', loading: 'eager', decoding: 'async' }) : el('span', { class: 'mudae-notice-icon' }, Icon(icon, 20)),
      el('div', { class: 'mudae-notice-text', textContent: text }),
      action ? el('button', { type: 'button', class: 'mudae-go', onclick: () => { close(); onAction?.(); } }, action) : null,
      el('button', { type: 'button', class: 'mudae-notice-close', ariaLabel: 'Fechar aviso', onclick: close }, Icon('x', 16)));
    const timer = setTimeout(close, ms);
    stack.append(node);
    while (stack.children.length > 3) stack.firstChild.remove();
    return close;
  }

  // ---------- abrir, começar e acompanhar ----------
  async function loadMine() {
    const [album, status] = await Promise.all([call('mudae:harem', {}), call('mudae:status')]);
    T.album = album;
    T.kakera = status?.kakera || 0;
    render();
  }
  function show(view) {
    T.view = view;
    T.known.add(view.id);
    if (!T.open) {
      T.open = true;
      T.picking = !view.sides[me()].chars.length;
      T.query = '';
      loadMine();
    }
    render();
  }
  // Abre o painel da troca aberta (pelo botão da mensagem ou do aviso).
  async function open() {
    const res = await call('mudae:trade:get');
    if (!res) return;
    if (!res.trade) return toast('Essa troca já acabou.', 'info');
    show(res.trade);
  }
  // Propõe uma troca para alguém (pelo álbum, pelo ranking ou pela carta desejada).
  async function start(otherId, channel) {
    if (!otherId || otherId === me()) return;
    const view = await call('mudae:trade:open', { channel, with: otherId });
    if (view) show(view);
  }
  function close() {
    T.open = false;
    T.picking = false;
    render();
  }

  onSocket('mudae:trade', (view) => {
    if (view.state !== 'open') {
      if (!T.known.has(view.id)) return;
      if (T.view?.id === view.id) { T.view = null; close(); }
      if (view.state === 'done') {
        Sounds.play('mudaeClaim');
        toast('Troca feita! As cartas já estão no harem de cada um.', 'info');
      } else toast('Troca cancelada' + (view.reason ? ': ' + view.reason : '.'), 'info');
      return;
    }
    const fresh = !T.known.has(view.id);
    T.known.add(view.id);
    if (T.open && T.view?.id === view.id) { T.view = view; render(); return; }
    if (!fresh) { T.view = view; return; }
    // Quem pediu a troca ($trade @pessoa) já vê o painel; quem recebeu ganha um convite.
    if (view.a === me()) show(view);
    else {
      T.view = view;
      Sounds.play('mudaeRare');
      notice({ icon: 'refresh', text: `${whoName(view.a)} quer trocar cartas com você.`, action: 'Abrir a troca', onAction: open, ms: 30_000 });
    }
  });
  // Ao reconectar, o painel aberto busca a troca de novo (ela pode ter acabado nesse meio-tempo).
  onSocket('connect', () => {
    if (!T.open) return;
    call('mudae:trade:get').then((res) => {
      if (!res?.trade) { T.view = null; close(); } else { T.view = res.trade; render(); }
    });
  });

  // ---------- mudanças ----------
  async function offer(change) {
    const v = T.view;
    if (!v || T.sending) return;
    const mine = v.sides[me()];
    const payload = { id: v.id, chars: mine.chars.map((c) => c.id), kakera: mine.kakera, ...change };
    T.sending = true;
    const res = await call('mudae:trade:offer', payload);
    T.sending = false;
    if (res) { T.view = res; render(); }
  }
  const toggleChar = (c) => {
    const ids = T.view.sides[me()].chars.map((x) => String(x.id));
    const id = String(c.id);
    offer({ chars: ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id] });
  };
  async function confirm() {
    const v = T.view;
    const res = await call('mudae:trade:confirm', { id: v.id, rev: v.rev, ok: !v.sides[me()].ok });
    if (res && res.state === 'open') { T.view = res; render(); }
  }
  async function cancel() {
    const res = await call('mudae:trade:cancel', { id: T.view.id });
    if (res) { T.view = null; close(); }
  }

  // ---------- desenho ----------
  function timeLeft() {
    const ms = Math.max(0, (T.view?.expires || 0) - ui.serverNow());
    const s = Math.ceil(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  function miniCard(c, { remove = null, selected = false, onclick = null } = {}) {
    const img = el('img', { src: c.image, alt: '', loading: 'lazy', decoding: 'async', draggable: false });
    img.onerror = () => img.replaceWith(el('span', { class: 'mudae-trade-img-missing', textContent: c.name.slice(0, 1) }));
    const body = [img,
      el('span', { class: 'mudae-trade-card-name', textContent: c.name, title: c.name }),
      el('span', { class: 'mudae-trade-card-value' }, num(c.value), kakera())];
    if (onclick) {
      return el('button', { type: 'button', class: 'mudae-trade-card r-' + (c.rarity || 'common') + (selected ? ' selected' : ''), ariaPressed: String(selected),
        title: (selected ? 'Tirar ' : 'Oferecer ') + c.name, onclick }, ...body, selected ? el('span', { class: 'mudae-trade-check' }, Icon('check', 14)) : null);
    }
    return el('div', { class: 'mudae-trade-card r-' + (c.rarity || 'common') }, ...body,
      remove ? el('button', { type: 'button', class: 'mudae-trade-remove', ariaLabel: 'Tirar ' + c.name + ' da troca', onclick: remove }, Icon('x', 14)) : null);
  }

  function side(who, mineSide) {
    const s = T.view.sides[who];
    const head = el('div', { class: 'mudae-trade-side-head' },
      member(who) ? avatar(member(who), 'mudae-trade-avatar') : null,
      el('h3', { textContent: mineSide ? 'Você oferece' : whoName(who) + ' oferece', style: { color: mineSide ? '' : nameColor(member(who)) || '' } }),
      s.ok ? el('span', { class: 'mudae-trade-ok' }, Icon('check', 14), 'Confirmou') : el('span', { class: 'mudae-trade-wait', textContent: 'Não confirmou' }));
    const cards = s.chars.length
      ? el('div', { class: 'mudae-trade-cards' }, s.chars.map((c) => miniCard(c, { remove: mineSide ? () => toggleChar(c) : null })))
      : el('div', { class: 'mudae-trade-empty', textContent: mineSide ? 'Escolha personagens do seu harem abaixo.' : 'Nenhum personagem ainda.' });
    let money;
    if (mineSide) {
      const input = el('input', { type: 'number', class: 'mudae-trade-kakera-input', min: '0', max: String(T.kakera), step: '1', value: String(s.kakera || 0),
        ariaLabel: 'Kakera que você oferece' });
      const send = () => {
        const n = Math.max(0, Math.min(T.kakera, Math.floor(Number(input.value)) || 0));
        input.value = String(n);
        if (n !== s.kakera) offer({ kakera: n });
      };
      input.onchange = send;
      input.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); send(); } };
      money = el('label', { class: 'mudae-trade-kakera' }, kakera(), input, el('span', { class: 'mudae-muted', textContent: `de ${num(T.kakera)}` }));
    } else money = s.kakera ? el('div', { class: 'mudae-trade-kakera' }, kakera(), el('strong', { textContent: '+ ' + num(s.kakera) }), ' kakera') : null;
    return el('section', { class: 'mudae-trade-side' + (s.ok ? ' ok' : '') }, head, cards, money);
  }

  // Escolher do próprio harem: busca e grade; clicar põe ou tira da oferta.
  function picker() {
    if (!T.picking) return null;
    if (!T.album) return el('div', { class: 'mudae-trade-picker' }, el('div', { class: 'mudae-trade-empty', textContent: 'Abrindo o seu harem…' }));
    const chosen = new Set(T.view.sides[me()].chars.map((c) => String(c.id)));
    const search = nodes.search || el('input', { type: 'search', class: 'salon-search', placeholder: 'Buscar no seu harem…', ariaLabel: 'Buscar no seu harem' });
    nodes.search = search;
    search.value = T.query;
    const grid = el('div', { class: 'mudae-trade-pick-grid' });
    const fill = () => {
      const q = T.query.trim().toLowerCase();
      const list = T.album.chars.filter((c) => !q || c.name.toLowerCase().includes(q) || c.series.toLowerCase().includes(q)).slice(0, 120);
      grid.replaceChildren(...list.map((c) => miniCard(c, { selected: chosen.has(String(c.id)), onclick: () => toggleChar(c) })));
      if (!list.length) grid.append(el('div', { class: 'mudae-trade-empty', textContent: T.album.chars.length ? 'Nada encontrado.' : 'Seu harem está vazio.' }));
    };
    search.oninput = () => { T.query = search.value; fill(); };
    fill();
    return el('div', { class: 'mudae-trade-picker' }, search, grid);
  }

  function render() {
    if (!T.open || !T.view) {
      nodes.overlay?.remove();
      nodes.overlay = null;
      nodes.search = null;
      document.removeEventListener('keydown', onKey, true);
      clearInterval(ticker);
      ticker = null;
      return;
    }
    const v = T.view;
    const other = v.a === me() ? v.b : v.a;
    const mine = v.sides[me()];
    const theirs = v.sides[other];
    const empty = !mine.chars.length && !theirs.chars.length && !mine.kakera && !theirs.kakera;
    const focused = document.activeElement === nodes.search;
    nodes.timer = el('span', { class: 'mudae-trade-timer', title: 'A troca é cancelada se ninguém mexer nela até o fim do tempo', textContent: timeLeft() });
    const card = el('div', { class: 'mudae-trade', role: 'dialog', ariaModal: 'true', ariaLabel: 'Troca com ' + whoName(other) },
      el('div', { class: 'mudae-trade-head' },
        el('span', { class: 'mudae-trade-icon' }, Icon('refresh', 20)),
        el('h2', { textContent: 'Troca com ' + whoName(other) }),
        Icon('clock', 16), nodes.timer,
        el('button', { type: 'button', class: 'mudae-notice-close', ariaLabel: 'Fechar o painel (a troca continua aberta)', title: 'Fechar o painel (a troca continua aberta)', onclick: close }, Icon('x', 18))),
      el('div', { class: 'mudae-trade-sides' }, side(me(), true), el('div', { class: 'mudae-trade-arrow', ariaHidden: 'true' }, window.MudaeIcon ? window.MudaeIcon('trade', 22) : Icon('refresh', 22)), side(other, false)),
      el('div', { class: 'mudae-trade-pick-bar' },
        el('button', { type: 'button', class: 'salon-filter' + (T.picking ? ' active' : ''), onclick: () => { T.picking = !T.picking; render(); } },
          T.picking ? 'Esconder o meu harem' : 'Escolher do meu harem')),
      picker(),
      el('p', { class: 'mudae-trade-note', textContent: mine.ok && !theirs.ok
        ? `Você confirmou. Falta ${whoName(other)} confirmar.`
        : theirs.ok && !mine.ok ? `${whoName(other)} confirmou. Confira e confirme também.`
          : 'Quando os dois confirmarem, as cartas trocam de dono na hora. Se alguém mudar a oferta, as confirmações são desfeitas.' }),
      el('div', { class: 'mudae-trade-actions' },
        el('button', { type: 'button', class: 'btn-ghost', onclick: cancel }, 'Cancelar a troca'),
        el('button', { type: 'button', class: mine.ok ? 'btn-ghost mudae-trade-undo' : 'btn-primary', disabled: empty && !mine.ok, onclick: confirm },
          mine.ok ? 'Desfazer a confirmação' : 'Confirmar a troca')));
    const overlay = el('div', { class: 'mudae-trade-overlay', onmousedown: (e) => e.target === overlay && close() }, card);
    if (nodes.overlay) nodes.overlay.replaceWith(overlay);
    else {
      document.body.append(overlay);
      document.addEventListener('keydown', onKey, true);
    }
    nodes.overlay = overlay;
    if (focused) nodes.search?.focus();
    ticker ||= setInterval(() => { if (nodes.timer) nodes.timer.textContent = timeLeft(); }, 1000);
  }
  function onKey(e) {
    if (e.key === 'Escape' && T.open) { e.preventDefault(); e.stopPropagation(); close(); }
  }

  return { open, start, notice, get active() { return T.view?.state === 'open' ? T.view : null; } };
};
