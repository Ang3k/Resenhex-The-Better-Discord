/* Mudae: os cards de personagem que o bot posta no chat ($w/$h/$m), o harem ($mm), o $im, o $tu,
   o botão de casar, o cristal de kakera, os rankings ($top, $obra, $topserv), os desejos e as trocas. O servidor decide tudo (sorteio, limites, quem casou primeiro); aqui só desenhamos
   as respostas. As fotos vêm direto do CDN do AniList. */
window.MudaeUI = function ({ state, el, Icon, call, member, avatar, nameColor, Format, fmtCtx, openProfile, openImage, openChannel, renderMessages, keepBottom, openTrade = () => {}, openForja = () => {}, medalSvg = null }) {
  const COMMANDS = [
    { name: 'w', note: 'roda uma waifu' },
    { name: 'h', note: 'roda um husbando' },
    { name: 'm', note: 'roda um personagem qualquer' },
    { name: 'mm', args: true, hint: '@pessoa', note: 'mostra o harem (o seu ou de alguém)' },
    { name: 'mma', args: true, hint: '@pessoa', note: 'harem de A a Z' },
    { name: 'mms', args: true, hint: '@pessoa', note: 'harem separado por obra' },
    { name: 'mmr', args: true, hint: '@pessoa', note: 'harem pelos casamentos mais recentes' },
    { name: 'im', args: true, hint: 'nome', note: 'mostra um personagem, o dono e quem deseja' },
    { name: 'top', args: true, hint: 'waifus · jogos · nome da obra', note: 'ranking dos personagens mais valiosos' },
    { name: 'obra', args: true, hint: 'nome da obra', note: 'todos de uma obra e quantos você tem' },
    { name: 'topserv', note: 'ranking dos haréns do servidor' },
    { name: 'trade', args: true, hint: '@pessoa', note: 'propõe uma troca de cartas' },
    { name: 'give', args: true, hint: '@pessoa nome', note: 'dá um personagem de presente' },
    { name: 'givek', args: true, hint: '@pessoa quantidade', note: 'dá kakera para alguém' },
    { name: 'wish', args: true, hint: 'nome', note: 'põe na lista de desejos (avisa quando sair)' },
    { name: 'wl', args: true, hint: '@pessoa', note: 'mostra a lista de desejos' },
    { name: 'wr', args: true, hint: 'nome', note: 'tira da lista de desejos' },
    { name: 'k', note: 'seu saldo de kakera' },
    { name: 'dk', note: 'pega o kakera do dia' },
    { name: 'daily', note: 'os rolls voltam na hora (1 vez a cada 20 h)' },
    { name: 'rolls', note: 'compra os rolls de volta com kakera' },
    { name: 'fm', args: true, hint: 'nome', note: 'escolhe o favorito do harem' },
    { name: 'divorce', args: true, hint: 'nome', note: 'solta um personagem e devolve o valor em kakera' },
    { name: 'tu', note: 'rolls, casamento, kakera, reserva e poderes prontos' },
    { name: 'forja', note: 'suas medalhas da Forja (também $badges)' },
    { name: 'forjar', args: true, hint: 'medalha', note: 'forja o próximo nível de uma medalha' },
    { name: 'poderes', note: 'seus poderes, as cargas e o que falta para abrir cada um' },
    { name: 'poder', args: true, hint: 'cadeado · laço · eco…', note: 'usa um poder' },
  ];
  // Fontes de personagens: a letra filtra o roll ($wg = waifu de jogo), como no Mudae do Discord.
  const SOURCES = {
    a: { label: 'Anime', icon: 'torii', of: 'de anime' },
    g: { label: 'Jogos', icon: 'gamepad', of: 'de jogo' },
    c: { label: 'Quadrinhos', icon: 'comic', of: 'de quadrinhos' },
    d: { label: 'Desenhos', icon: 'tv', of: 'de desenho' },
    s: { label: 'Séries', icon: 'clapperboard', of: 'de série' },
  };
  for (const [letter, src] of Object.entries(SOURCES)) {
    COMMANDS.push({ name: 'w' + letter, note: 'waifu ' + src.of }, { name: 'h' + letter, note: 'husbando ' + src.of }, { name: 'm' + letter, note: 'qualquer personagem ' + src.of });
  }
  const sourceOf = (card) => SOURCES[card.source || 'a'];
  // Ícones próprios (mudae-icones.js). Sem o arquivo (testes que só carregam este), um espaço vazio no lugar.
  const MI = window.MudaeIcon || Object.assign(() => document.createElement('span'), { inline: () => document.createElement('span') });
  // Um símbolo no meio do texto; label é o que o leitor de tela fala no lugar dele.
  const ico = (name, label = '') => MI.inline(name, label);
  const sourceIcon = (card) => ico(sourceOf(card).icon, sourceOf(card).label);
  const seriesLine = (card) => card.series;
  const PAGE = 15;
  const num = (n) => Number(n || 0).toLocaleString('pt-BR');
  const whoName = (id) => member(id)?.name || 'alguém que saiu';
  const kakera = () => el('span', { class: 'mudae-kakera', role: 'img', ariaLabel: 'kakera' }, MI('kakera', 15));
  const RARITY = { legendary: 'Lendário', epic: 'Épico', rare: 'Raro', common: 'Comum' };
  const strongName = (id) => el('strong', { textContent: whoName(id), style: { color: nameColor(member(id)) || '' } });
  const names = (ids) => ids.map(whoName).join(', ');
  const plural = (n, one, many) => `${num(n)} ${n === 1 ? one : many}`;
  // Dono de uma carta numa lista: a foto e o nome, ou "livre".
  const ownerTag = (id) => (id
    ? el('span', { class: 'mudae-owner' }, member(id) ? avatar(member(id), 'mudae-owner-avatar') : null, el('span', { textContent: whoName(id), style: { color: nameColor(member(id)) || '' } }))
    : el('span', { class: 'mudae-owner free', textContent: 'livre' }));
  function since(ts) {
    const d = Math.floor((Date.now() - ts) / 86_400_000);
    if (d >= 1) return d === 1 ? 'há 1 dia' : `há ${d} dias`;
    const h = Math.floor((Date.now() - ts) / 3_600_000);
    return h >= 1 ? (h === 1 ? 'há 1 hora' : `há ${h} horas`) : 'há pouco';
  }
  const VIA = { claim: 'casou', trade: 'ganhou numa troca', give: 'ganhou de presente' };
  function minutes(ms) {
    const m = Math.max(1, Math.ceil(ms / 60_000));
    return m >= 60 ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}` : `${m} min`;
  }

  // ---------- relógio do servidor ----------
  // A diferença medida com menos atraso de rede é a melhor estimativa (o atraso só faz o
  // servidor parecer "mais velho"), igual ao relógio do DJ.
  const offsets = [];
  function sync(serverTime) {
    if (!Number.isFinite(serverTime)) return;
    offsets.push(serverTime - Date.now());
    if (offsets.length > 10) offsets.shift();
  }
  const serverNow = () => Date.now() + (offsets.length ? Math.max(...offsets) : 0);

  // ---------- contagem dos rolls abertos ----------
  // Um único intervalo para todos os cards abertos; ele para sozinho quando não sobra nenhum.
  const live = new Set();
  let ticker = null;
  function tick() {
    for (const item of live) {
      if (!item.node.isConnected && item.seen) { live.delete(item); continue; }
      item.seen ||= item.node.isConnected;
      const left = item.expires - serverNow();
      if (left <= 0) { item.expire(); live.delete(item); } else item.update(left);
    }
    if (!live.size) { clearInterval(ticker); ticker = null; }
  }
  function watch(item) {
    live.add(item);
    ticker ||= setInterval(tick, 250);
  }

  // ---------- pedaços dos cards ----------
  function ownerFooter(ownerId, prefix) {
    const owner = member(ownerId);
    return el('div', { class: 'mudae-footer' },
      owner ? avatar(owner, 'mudae-footer-avatar') : null,
      el('span', {}, prefix + ' ', el('strong', { textContent: whoName(ownerId), style: { color: nameColor(owner) || '' } })));
  }

  function portrait(card) {
    const img = el('img', { class: 'mudae-img', src: card.image, alt: card.name, loading: 'lazy', decoding: 'async', draggable: false,
      onload: keepBottom, onclick: () => openImage(card.image) });
    img.onerror = () => img.replaceWith(el('div', { class: 'mudae-img missing', textContent: card.name.slice(0, 1) }));
    return img;
  }

  function claimButton(msg, d) {
    const label = el('span', { textContent: 'Casar' });
    const timer = el('span', { class: 'mudae-timer' });
    const bar = el('span', { class: 'mudae-drain' });
    const btn = el('button', { type: 'button', class: 'mudae-claim', ariaLabel: 'Casar com ' + d.card.name },
      el('span', { class: 'mudae-heart' }, Icon('heart', 18)), label, timer, bar);
    // Rolls do Salão giram até o revealAt do servidor (uns 2 a 4 s, conforme a raridade) e quem rodou tem 3 s só dele: o card do chat espera junto.
    const reveal = d.revealAt ?? msg.ts;
    const mine = msg.by === state.me.accountId;
    const update = (left) => {
      const t = serverNow();
      timer.textContent = Math.ceil(left / 1000) + 's';
      const wait = t < reveal ? 'Girando…'
        : !mine && d.priorityUntil && t < d.priorityUntil ? `Vez de ${whoName(msg.by)} · ${Math.ceil((d.priorityUntil - t) / 1000)}s` : '';
      if (!btn.classList.contains('pending')) btn.disabled = !!wait;
      btn.classList.toggle('waiting', !!wait);
      label.textContent = wait || 'Casar';
    };
    const expire = () => {
      btn.disabled = true;
      btn.classList.add('expired');
      label.textContent = 'Tempo esgotado';
      timer.remove();
      bar.remove();
    };
    const left = d.expires - serverNow();
    if (left <= 0) { expire(); return btn; }
    update(left);
    // A barra esvazia por CSS (sem JS a cada quadro), do card aparecer até o fim do prazo.
    bar.style.animationDuration = (d.expires - reveal) + 'ms';
    bar.style.animationDelay = (reveal - serverNow()) + 'ms';
    watch({ node: btn, expires: d.expires, update, expire });
    btn.onclick = async () => {
      if (btn.disabled) return;
      btn.classList.add('pending');
      btn.disabled = true;
      const res = await call('mudae:claim', { channel: state.textChannel, id: msg.id });
      if (!res && btn.isConnected) { btn.classList.remove('pending'); btn.disabled = false; }
    };
    return btn;
  }

  // Card de personagem (roll e $im): nome, obra, valor, foto e, embaixo, de quem ele é.
  function characterCard(msg, d) {
    const { card } = d;
    const roll = d.kind === 'roll';
    const wishers = (d.wishedBy || []).filter(Boolean);
    const node = el('div', { class: 'mudae-card' + (d.ownerId ? ' owned' : '') },
      el('div', { class: 'mudae-name', textContent: card.name }),
      el('div', { class: 'mudae-series' }, sourceIcon(card), seriesLine(card)),
      el('div', { class: 'mudae-value' }, el('strong', { textContent: num(card.value) }), kakera(),
        card.rarity ? el('span', { class: 'mudae-rarity-tag ' + card.rarity, textContent: RARITY[card.rarity] }) : null),
      !d.ownerId && roll ? el('div', { class: 'mudae-hint', textContent: 'Clique em Casar antes dos outros!' }) : null,
      d.kind === 'info' ? el('div', { class: 'mudae-hint', textContent: `#${num(card.rank)} entre os personagens ${sourceOf(card).of}` }) : null,
      portrait(card),
      d.ownerId ? ownerFooter(d.ownerId, 'Pertence a')
        : d.kind === 'info' ? el('div', { class: 'mudae-footer' }, el('span', { textContent: 'Ninguém casou com esse personagem ainda.' })) : null,
      d.kind === 'info' && d.ownerId && d.since
        ? el('div', { class: 'mudae-footer', textContent: `${VIA[d.via] ? (VIA[d.via][0].toUpperCase() + VIA[d.via].slice(1)) : 'Casou'} ${since(d.since)} · ${d.owners > 1 ? `já teve ${d.owners} donos` : 'primeiro dono'}` }) : null,
      wishers.length ? el('div', { class: 'mudae-footer wish' }, Icon('star', 14), el('span', { textContent: (roll ? 'Desejado por ' : 'Na lista de desejos de ') + names(wishers) })) : null,
      roll && msg.by === state.me.accountId && d.rollsLeft <= 2
        ? el('div', { class: 'mudae-footer warn' }, Icon('alert', 14), el('span', { textContent: d.rollsLeft ? `${d.rollsLeft} ${d.rollsLeft === 1 ? 'roll restante' : 'rolls restantes'}` : 'Esse foi seu último roll desta hora' }))
        : null);
    if (!roll || d.ownerId) return node;
    return [node, el('div', { class: 'mudae-actions' }, claimButton(msg, d))];
  }

  // Harem: lista paginada; passar o mouse num nome mostra a foto dele ao lado.
  const pages = new Map();
  function haremCard(msg, d) {
    const owner = member(d.ownerId);
    const node = el('div', { class: 'mudae-card harem' });
    const draw = () => {
      const total = Math.ceil(d.chars.length / PAGE);
      const page = Math.min(pages.get(msg.id) || 0, Math.max(0, total - 1));
      const slice = d.chars.slice(page * PAGE, page * PAGE + PAGE);
      const thumb = slice[0] ? portrait(slice[0]) : null;
      thumb?.classList.add('mudae-thumb');
      const show = (c) => { if (thumb) { thumb.src = c.image; thumb.alt = c.name; } };
      const go = (delta) => { pages.set(msg.id, (page + delta + total) % total); draw(); };
      node.replaceChildren(...[
        el('div', { class: 'mudae-harem-head' },
          owner ? avatar(owner, 'mudae-head-avatar') : null,
          el('span', { class: 'mudae-name', textContent: 'Harem de ' + whoName(d.ownerId) })),
        el('div', { class: 'mudae-value' },
          el('span', { textContent: `${num(d.total)} ${d.total === 1 ? 'personagem' : 'personagens'} · ` }), el('strong', { textContent: num(d.value) }), kakera()),
        d.chars.length
          ? el('div', { class: 'mudae-harem-body' },
            el('ol', { class: 'mudae-harem-list' }, slice.map((c, i) => el('li', { onmouseenter: () => show(c), onfocus: () => show(c), tabIndex: 0 },
              el('span', { class: 'mudae-li-rank', textContent: page * PAGE + i + 1 }), el('strong', { textContent: c.name }), el('span', { class: 'mudae-muted', textContent: ' · ' + c.series }), el('span', { class: 'mudae-li-value', textContent: num(c.value) })))),
            thumb)
          : el('div', { class: 'mudae-hint', textContent: 'Ninguém aqui ainda. Use $w, $h ou $m para rodar personagens e casar!' }),
        total > 1 ? el('div', { class: 'mudae-pager' },
          el('button', { type: 'button', ariaLabel: 'Página anterior', onclick: () => go(-1) }, Icon('chevronLeft', 18)),
          el('span', { textContent: `${page + 1} / ${total}` + (d.total > d.chars.length ? ` · mostrando os ${num(d.chars.length)} mais valiosos` : '') }),
          el('button', { type: 'button', ariaLabel: 'Próxima página', onclick: () => go(1) }, Icon('chevronRight', 18))) : null,
      ].filter(Boolean));
    };
    draw();
    return node;
  }

  function line(cls, ...parts) {
    return el('div', { class: 'mudae-line ' + cls }, ...parts);
  }

  // Lista de personagens com o dono de cada um. rows: os personagens da página; head: o que vai em cima.
  function charList(node, rows, { head, pager, empty, firstPos = 1 }) {
    const thumb = rows[0] ? portrait(rows[0]) : null;
    thumb?.classList.add('mudae-thumb');
    const show = (c) => { if (thumb) { thumb.src = c.image; thumb.alt = c.name; } };
    node.replaceChildren(...[...head,
      rows.length
        ? el('div', { class: 'mudae-harem-body' },
          el('ol', { class: 'mudae-harem-list mudae-char-list' }, rows.map((c, i) => el('li', { onmouseenter: () => show(c), onfocus: () => show(c), tabIndex: 0 },
            el('span', { class: 'mudae-li-rank', textContent: c.pos ?? firstPos + i }),
            el('span', { class: 'mudae-li-name' }, el('strong', { textContent: c.name }), el('span', { class: 'mudae-muted', textContent: ' · ' + c.series })),
            el('span', { class: 'mudae-li-value' }, num(c.value), kakera()),
            ownerTag(c.ownerId)))),
          thumb)
        : el('div', { class: 'mudae-hint', textContent: empty }),
      pager].filter(Boolean));
  }
  function pagerOf(page, pages, go, extra = '') {
    if (pages <= 1) return extra ? el('div', { class: 'mudae-pager' }, el('span', { textContent: extra })) : null;
    return el('div', { class: 'mudae-pager' },
      el('button', { type: 'button', ariaLabel: 'Página anterior', onclick: () => go((page - 1 + pages) % pages) }, Icon('chevronLeft', 18)),
      el('span', { textContent: `${page + 1} / ${pages}` + (extra ? ' · ' + extra : '') }),
      el('button', { type: 'button', ariaLabel: 'Próxima página', onclick: () => go((page + 1) % pages) }, Icon('chevronRight', 18)));
  }

  // $top e $obra: a mensagem guarda só o filtro; cada página vem do servidor com os donos de agora.
  const lists = new Map();
  function topCard(msg, d) {
    const node = el('div', { class: 'mudae-card harem list' });
    const st = lists.get(msg.id) || { page: 0, data: null, loading: false };
    lists.set(msg.id, st);
    const obra = d.kind === 'obra';
    const draw = () => {
      if (!node.isConnected && st.drawn) return;
      st.drawn = true;
      const data = st.data;
      const head = [el('div', { class: 'mudae-name' }, ico(obra ? 'obra' : 'trophy'), obra ? d.label : 'Top · ' + d.label)];
      if (data?.series) {
        const pct = data.total ? Math.round((data.mine / data.total) * 100) : 0;
        head.push(el('div', { class: 'mudae-value' }, `Você tem `, el('strong', { textContent: num(data.mine) }), ` de ${plural(data.total, 'personagem', 'personagens')} · ${num(data.claimed)} com dono`),
          el('div', { class: 'mudae-progress', role: 'progressbar', ariaValuenow: String(pct), ariaValuemin: '0', ariaValuemax: '100' }, el('span', { style: { width: pct + '%' } })));
      } else if (data) head.push(el('div', { class: 'mudae-hint', textContent: `Os ${num(data.total)} mais valiosos, com o dono de cada um.` }));
      if (!data) return node.replaceChildren(...head, el('div', { class: 'mudae-hint', textContent: st.loading ? 'Carregando…' : 'Não deu para carregar a lista.' }));
      charList(node, data.chars, { head, empty: 'Ninguém nesta lista.', pager: pagerOf(data.page, data.pages, load) });
    };
    async function load(page) {
      st.loading = true;
      st.redraw?.();
      const res = await call('mudae:list', { key: d.key, page });
      st.loading = false;
      if (res) { st.data = res; st.page = res.page; }
      st.redraw?.();
      keepBottom();
    }
    st.redraw = draw;
    if (!st.data && !st.loading) load(st.page);
    draw();
    return node;
  }

  // $wl: a lista de desejos, com quem já casou com cada um.
  function wishCard(msg, d) {
    const node = el('div', { class: 'mudae-card harem list' });
    const owner = member(d.ownerId);
    charList(node, d.chars, {
      head: [el('div', { class: 'mudae-harem-head' }, owner ? avatar(owner, 'mudae-head-avatar') : null,
        el('span', { class: 'mudae-name' }, ico('wish'), 'Desejos de ' + whoName(d.ownerId))),
      el('div', { class: 'mudae-hint', textContent: `${d.total} de ${d.max}. Quando alguém rodar um deles, ${d.ownerId === state.me.accountId ? 'você recebe' : 'a pessoa recebe'} um aviso.` })],
      empty: 'A lista está vazia. Use $wish nome para desejar alguém.',
    });
    return node;
  }

  // Os 3 primeiros de um ranking: a medalha de ouro, prata e bronze da Forja (sem ela, a medalha simples na cor do lugar).
  function rankMedal(i, size = 22) {
    const label = `${i + 1}º lugar`;
    if (!medalSvg) return el('span', { class: 'mudae-rank-medal p' + (i + 1) }, ico('medal', label));
    const svg = medalSvg(['ouro', 'prata', 'bronze'][i], 1, 'metal', size);
    svg.setAttribute('aria-label', label);
    return svg;
  }

  // $topserv: os 10 haréns mais valiosos do servidor.
  function topservCard(d) {
    return el('div', { class: 'mudae-card harem' },
      el('div', { class: 'mudae-name' }, ico('trophy'), 'Ranking dos haréns'),
      d.rows.length
        ? el('ol', { class: 'mudae-harem-list mudae-serv-list' }, d.rows.map((r, i) => el('li', {},
          i < 3 ? el('span', { class: 'mudae-li-rank medal' }, rankMedal(i)) : el('span', { class: 'mudae-li-rank', textContent: String(i + 1) }),
          el('span', { class: 'mudae-li-name' }, strongName(r.ownerId), el('span', { class: 'mudae-muted', textContent: ' · ' + plural(r.total, 'personagem', 'personagens') })),
          el('span', { class: 'mudae-li-value' }, num(r.value), kakera()))))
        : el('div', { class: 'mudae-hint', textContent: 'Ninguém casou ainda. O primeiro lugar está livre!' }));
  }

  // Troca: aberta (com o botão para os dois), feita (o que cada um deu) ou cancelada.
  function tradeCard(msg, d) {
    const meIn = d.a === state.me.accountId || d.b === state.me.accountId;
    if (d.state === 'open') {
      return el('div', { class: 'mudae-card trade' },
        el('div', { class: 'mudae-line' }, ico('trade'), strongName(d.a), ' propôs uma troca para ', strongName(d.b), '.'),
        meIn ? el('div', { class: 'mudae-actions' }, el('button', { type: 'button', class: 'mudae-go', onclick: () => openTrade(d.tradeId) }, 'Abrir a troca')) : null);
    }
    if (d.state === 'canceled') {
      return line('trade canceled', ico('trade'), 'A troca entre ', strongName(d.a), ' e ', strongName(d.b), ' foi cancelada', d.reason ? ': ' + d.reason.replace(/\.$/, '') : '', '.');
    }
    const gave = (who) => {
      const side = d.sides?.[who] || { chars: [], kakera: 0 };
      const items = [...side.chars.map((c) => c.name), ...(side.kakera ? [num(side.kakera) + ' kakera'] : [])];
      return el('div', { class: 'mudae-trade-side' }, strongName(who), el('span', { class: 'mudae-muted', textContent: ' deu ' }), el('span', { textContent: items.join(', ') || 'nada' }));
    };
    return el('div', { class: 'mudae-card trade done' },
      el('div', { class: 'mudae-line' }, ico('trade'), strongName(d.a), ' e ', strongName(d.b), ' fizeram uma troca!'),
      gave(d.a), gave(d.b));
  }

  // ---------- Forja, poderes e cristais ----------
  const MEDALS = { bronze: 'Bronze', prata: 'Prata', ouro: 'Ouro', safira: 'Safira', rubi: 'Rubi', esmeralda: 'Esmeralda', diamante: 'Diamante' };
  const FINISHES = { metal: 'Metal', esmalte: 'Esmalte', holo: 'Holográfico', galaxia: 'Galáxia' };
  const ROMAN = ['', 'I', 'II', 'III', 'IV'];
  const finishName = (key) => FINISHES[key] || key;
  // Os poderes (nome, frase da linha pública, o que falta para abrir e o que cada um faz). Tem que bater com POWERS em server/mudae-regras.js.
  // O ícone de cada um é o MudaeIcon com a mesma chave (mudae-icones.js).
  const POWER = {
    videncia: { name: 'Vidência', goal: 'Medalhas forjadas', does: 'Mostra a raridade dos seus 3 próximos rolls. Só você vê.' },
    cadeado: { name: 'Cadeado', goal: 'Casamentos', said: ' trancou o roll.', does: 'Tranca o seu roll: ninguém mais casa com ele.' },
    amuleto: { name: 'Amuleto', goal: 'Lendários no harém', said: ' usou o Amuleto: o próximo roll tem mais chance de ser épico ou lendário.', does: 'O próximo roll tem mais chance de sair épico ou lendário.' },
    chuva: { name: 'Chuva de cristais', goal: 'Cristais pegos', said: ' chamou uma chuva de cristais!', does: 'Chama uma chuva de cristais para todo mundo no Salão.' },
    desejo: { name: 'Chamar desejo', goal: 'Nível da Bronze', said: ' chamou um desejo para o próximo roll.', does: 'O próximo roll tem chance alta de ser um desejo seu.' },
    eco: { name: 'Eco', goal: 'Casamentos', does: 'Traz de volta um personagem que passou sem dono há pouco.' },
    dupla: { name: 'Escolha dupla', goal: 'Rolls', said: ' vai abrir duas cartas no próximo roll.', does: 'O próximo roll abre duas cartas, e você casa com uma.' },
    laco: { name: 'Laço', goal: 'Medalhas no nível II', does: 'Casa na hora com o roll de outra pessoa. Perde para o Cadeado.' },
  };
  const powerOf = (key) => POWER[key] || { name: key, goal: '' };
  const powerIcon = (key) => ico(POWER[key] ? key : 'spark');
  // "ícone Cadeado, ícone Eco": vários poderes numa frase.
  const powerNames = (keys) => keys.flatMap((key, i) => [i ? ', ' : null, powerIcon(key), powerOf(key).name]).filter(Boolean);
  const medalIcon = (d) => (medalSvg && d.medal ? medalSvg(d.medal, d.level || 0, d.finish || null, 20) : ico('medal'));

  function powerLine(d) {
    const p = powerOf(d.power);
    if (d.power === 'laco' && d.bounced) return line('power', powerIcon('laco'), strongName(d.ownerId), ' tentou laçar ', el('strong', { textContent: d.card?.name || 'o personagem' }), ', mas bateu no cadeado!');
    return line('power', powerIcon(d.power), strongName(d.ownerId), p.said || ` usou ${p.name}.`);
  }

  // Medalha: a linha salva do nível IV, o resultado de um $forjar e a escolha do acabamento (quando o nível II ou mais sorteia outro).
  function medalCard(d) {
    const title = `${MEDALS[d.medal] || d.medal} ${ROMAN[d.level] || ''}`.trim();
    if (d.price === undefined) {
      return line('medal', medalIcon(d), strongName(d.ownerId), ' forjou a ', el('strong', { textContent: title }), ` (${finishName(d.finish).toLowerCase()})!`);
    }
    const cost = `por ${num(d.price)} kakera. Agora você tem ${num(d.kakera)}.`;
    if (!d.offer) return line('medal', medalIcon(d), 'Você forjou a ', el('strong', { textContent: title }), ` (${finishName(d.finish).toLowerCase()}) ${cost}`);
    const node = el('div', { class: 'mudae-card medal' });
    const pick = async (choice) => {
      node.classList.add('pending');
      const res = await call('mudae:forja:finish', { medal: d.medal, pick: choice });
      if (!res) { node.classList.remove('pending'); return; }
      const finish = res.finish ?? (choice === 'new' ? d.offer : d.finish);
      node.replaceChildren(line('medal', medalIcon({ ...d, finish }), 'A ', el('strong', { textContent: title }), ` ficou com o acabamento ${finishName(finish).toLowerCase()}.`));
    };
    node.append(line('medal', medalIcon(d), 'Você forjou a ', el('strong', { textContent: title }), ` ${cost}`),
      el('div', { class: 'mudae-hint', textContent: `Saiu o acabamento ${finishName(d.offer)} e a medalha está com ${finishName(d.finish)}. Qual fica?` }),
      el('div', { class: 'mudae-actions' },
        el('button', { type: 'button', class: 'mudae-go', textContent: 'Ficar com ' + finishName(d.finish), onclick: () => pick('old') }),
        el('button', { type: 'button', class: 'mudae-go', textContent: 'Ficar com ' + finishName(d.offer), onclick: () => pick('new') })));
    return node;
  }

  const chargeText = (ms) => (ms > 0 ? `volta em ${minutes(ms)}` : 'pronto');
  // Os poderes no palco, um por espaço.
  function stageList(d) {
    return el('ul', { class: 'mudae-powers' }, d.slots.map((key) => el('li', { class: key ? 'slot' : 'slot empty' },
      key ? [powerIcon(key), el('strong', { textContent: powerOf(key).name }), el('span', { class: 'mudae-muted', textContent: ' · ' + chargeText(d.readyIn?.[key] || 0) })]
        : el('span', { class: 'mudae-muted', textContent: 'espaço vazio' }))));
  }

  function forjaCard(d) {
    return el('div', { class: 'mudae-card forja' },
      el('div', { class: 'mudae-name' }, ico('medal'), 'Sua Forja'),
      el('div', { class: 'mudae-value' }, 'Você tem ', el('strong', { textContent: num(d.kakera) }), kakera()),
      el('ul', { class: 'mudae-medals' }, Object.keys(MEDALS).map((key) => {
        const m = d.medals?.[key] || { level: 0 };
        const price = d.prices?.[key];
        return el('li', { class: 'mudae-medal l' + m.level, title: price ? `Próximo nível: ${num(price)} kakera` : 'No nível máximo' },
          medalSvg ? medalSvg(key, m.level, m.finish, 28) : ico('medal'), el('strong', { textContent: MEDALS[key] }),
          m.level ? el('span', { class: 'mudae-medal-level', textContent: ' ' + ROMAN[m.level] }) : null,
          // À direita, sem quebrar: o acabamento da forjada ou o preço da que falta.
          el('span', { class: 'mudae-muted mudae-medal-info' }, m.level ? finishName(m.finish) : price ? [num(price), kakera()] : ''));
      })),
      d.powers ? stageList(d.powers) : null,
      el('div', { class: 'mudae-actions' }, el('button', { type: 'button', class: 'mudae-go', onclick: () => openForja() }, 'Abrir a Forja')));
  }

  function powersCard(d) {
    const locked = Object.keys(POWER).filter((key) => !d.unlocked.includes(key));
    const benched = d.unlocked.filter((key) => !d.slots.includes(key));
    return el('div', { class: 'mudae-card forja' },
      el('div', { class: 'mudae-name' }, ico('bolt'), 'Seus poderes'),
      stageList(d),
      d.rechargeMs ? el('div', { class: 'mudae-hint', textContent: `Cada poder recarrega em ${minutes(d.rechargeMs)}. Use com $poder nome.` }) : null,
      benched.length ? el('div', { class: 'mudae-hint' }, 'Fora do palco: ', ...powerNames(benched), '.') : null,
      locked.length ? el('ul', { class: 'mudae-powers locked' }, locked.map((key) => {
        const have = d.progress?.[key];
        return el('li', {}, powerIcon(key), el('strong', { textContent: powerOf(key).name }),
          el('span', { class: 'mudae-muted', textContent: have ? ` · ${powerOf(key).goal}: ${num(have.have)} de ${num(have.need)}` : '' }));
      })) : null);
  }

  // $poder eco: um botão por personagem que passou sem dono.
  function ecoCard(d) {
    const node = el('div', { class: 'mudae-card forja' }, el('div', { class: 'mudae-name' }, powerIcon('eco'), 'Qual personagem volta?'));
    node.append(el('div', { class: 'mudae-actions' }, (d.cards || []).slice(0, 5).map((card) => el('button', { type: 'button', class: 'mudae-go', textContent: card.name, onclick: async () => {
      node.classList.add('pending');
      const res = await call('mudae:power:use', { channel: state.textChannel, power: 'eco', charId: card.id });
      node.classList.remove('pending');
      if (res) node.replaceChildren(line('power', powerIcon('eco'), el('strong', { textContent: card.name }), ' voltou para a mesa.'));
    } }))));
    return node;
  }

  // O kakera na cor do cristal (a cor vem do servidor).
  function crystalIcon(v) {
    const node = ico('kakera', 'cristal ' + (v.colorKey || ''));
    if (v.color) node.style.color = v.color;
    return node;
  }

  // Cristal que apareceu (só ao vivo): o botão pega o primeiro cristal, até acabar a vida dele.
  function crystalLine(d) {
    const v = d.crystal || d;
    const label = el('span', { textContent: 'Pegar' });
    const btn = el('button', { type: 'button', class: 'mudae-go mudae-crystal-take' }, kakera(), label);
    const until = v.appearAt + v.life;
    const update = () => { if (!btn.classList.contains('done')) btn.disabled = serverNow() < v.appearAt; };
    // Na chuva, cada clique pega a próxima gota (como clicar nas gotas no Salão), até acabarem ou a chuva passar.
    let gem = 0, total = 0;
    const gems = v.kind === 'storm' ? v.gems || 1 : 1;
    const expire = () => { btn.disabled = true; if (!btn.classList.contains('done') && !total) label.textContent = 'Sumiu'; };
    if (serverNow() >= until) expire(); else { update(); watch({ node: btn, expires: until, update, expire }); }
    btn.onclick = async () => {
      if (btn.disabled) return;
      btn.disabled = true;
      const res = await call('mudae:crystal:take', { id: v.id, gem });
      // "já pegou": essa gota foi pega em outro aparelho, então passa para a próxima.
      if (res?.ok || /já pegou/.test(res?.error || '')) {
        gem++; total += res?.amount || 0;
        if (total) label.textContent = `+${num(total)}`;
        if (gem >= gems) { btn.classList.add('done'); return; }
      }
      if (btn.isConnected && serverNow() < until) btn.disabled = false;
    };
    return [line('crystal', crystalIcon(v), v.kind === 'storm' ? `Uma chuva de cristais ${v.colorKey} começou!` : `Um cristal ${v.colorKey} apareceu!`), el('div', { class: 'mudae-actions' }, btn)];
  }

  // Cristal que acabou (só ao vivo): quem pegou, com no máximo dois nomes e "mais N" no resto.
  function crystalEndLine(d) {
    const v = d.crystal || d;
    const ids = (v.takers || []).map((t) => t.id);
    if (!ids.length) return line('crystal', `O cristal ${v.colorKey} sumiu. Ninguém pegou.`);
    const [a, b, c] = ids.map(strongName);
    const who = ids.length === 1 ? [a] : ids.length === 2 ? [a, ' e ', b] : ids.length === 3 ? [a, ', ', b, ' e ', c] : [a, ', ', b, ` e mais ${ids.length - 2}`];
    return line('crystal', crystalIcon(v), ...who, ` ${ids.length === 1 ? 'pegou' : 'pegaram'} o cristal ${v.colorKey}`);
  }

  function statusLines(d) {
    return el('div', { class: 'mudae-status' },
      el('div', {}, d.rollsLeft
        ? ['Você tem ', el('strong', { textContent: String(d.rollsLeft) }), ` de ${d.rollsMax} rolls nesta janela de 30 minutos. Eles voltam em `, el('strong', { textContent: minutes(d.rollResetIn) }), '.']
        : ['Seus rolls acabaram. Eles voltam em ', el('strong', { textContent: minutes(d.rollResetIn) }), '.']),
      el('div', {}, d.claimReady
        ? ['Você ', el('strong', { class: 'mudae-ok', textContent: 'pode casar' }), ' agora!']
        : ['Você já casou. Dá para casar de novo em ', el('strong', { textContent: minutes(d.claimResetIn) }), '.']),
      d.reserveReady ? el('div', {}, 'Você tem ', el('strong', { class: 'mudae-ok', textContent: 'um casamento de reserva' }), ' guardado.')
        : d.reserveIn ? el('div', {}, 'Seu casamento de reserva volta em ', el('strong', { textContent: minutes(d.reserveIn) }), '.') : null,
      d.powersReady?.length ? el('div', {}, 'Poderes prontos: ', el('strong', { class: 'mudae-ok' }, ...powerNames(d.powersReady)), '.') : null,
      d.kakera !== undefined ? el('div', {}, 'Você tem ', el('strong', { textContent: num(d.kakera) }), ' kakera.') : null,
      d.dailyIn !== undefined ? el('div', {}, d.dailyIn ? ['O $daily volta em ', el('strong', { textContent: minutes(d.dailyIn) }), '.'] : ['O ', el('strong', { class: 'mudae-ok', textContent: '$daily' }), ' está pronto: os rolls voltam na hora.']) : null,
      d.dkIn !== undefined ? el('div', {}, d.dkIn ? ['O $dk volta em ', el('strong', { textContent: minutes(d.dkIn) }), '.'] : ['O ', el('strong', { class: 'mudae-ok', textContent: '$dk' }), ` está pronto: +${num(d.dkAmount)} kakera.`]) : null,
      d.buysLeft !== undefined ? el('div', {}, d.buysLeft
        ? `O $rolls custa ${num(d.rollsPrice)} kakera (${d.buysLeft} de ${d.buysMax} nas próximas 24 h).`
        : ['O $rolls libera de novo em ', el('strong', { textContent: minutes(d.buysIn) }), '.']) : null);
  }

  // Roll dentro do Salão: o card grande está no palco, então o chat mostra só uma linha.
  function rollLine(msg, d, salon) {
    const rarity = d.card.rarity || 'common';
    const image = el('img', { alt: '', loading: 'lazy', decoding: 'async', draggable: false });
    const thumb = el('span', { class: 'mudae-roll-thumb', ariaHidden: 'true' }, Icon('dice', 16), image);
    image.onload = async () => {
      try {
        if (image.decode) await image.decode();
        if (image.naturalWidth) image.classList.add('ready');
        else image.remove();
      } catch { image.remove(); }
    };
    image.onerror = () => image.remove();
    image.src = d.card.image;
    const node = el('button', { type: 'button', class: 'mudae-roll-line', onclick: () => salon.show(msg.id) },
      thumb,
      el('span', { class: 'mudae-roll-text' }, el('strong', { textContent: d.card.name }),
        el('span', { class: 'mudae-muted' }, ' · ', sourceIcon(d.card), seriesLine(d.card))),
      el('span', { class: 'mudae-rarity-tag ' + rarity, textContent: RARITY[rarity] }),
      el('span', { class: 'mudae-roll-spin' }, ico('dice'), 'rodando…'));
    // Sem spoiler: enquanto a roleta gira no palco, a linha esconde quem saiu (só CSS, sem timer).
    const hold = (d.revealAt ?? 0) - serverNow();
    if (hold > 0) {
      node.classList.add('hold');
      node.style.setProperty('--hold', Math.round(hold) + 'ms');
    }
    return node;
  }

  function redirect(d) {
    if (!d.channel) {
      return el('div', { class: 'msg-text' }, ico('dice'), 'Este servidor ainda não tem um Salão do Mudae. Quem pode gerenciar canais cria um em ',
        el('strong', { textContent: 'Criar canal → Salão do Mudae' }), '.');
    }
    return el('div', { class: 'mudae-redirect' },
      el('div', { class: 'msg-text' }, ico('dice'), 'O Mudae agora mora no ', el('strong', { textContent: '#' + d.name }), '. Lá você vê o que a turma está rodando ao vivo.'),
      el('button', { type: 'button', class: 'mudae-go', onclick: () => openChannel(d.channel) }, 'Ir para o Salão'));
  }

  // "com o Laço" no fim da linha do casamento.
  const lassoTag = (d) => (d.lasso ? [' ', powerIcon('laco'), 'com o Laço'] : []);

  // Conteúdo da mensagem do bot (vai dentro do .msg-body). salon: a tela do Salão, quando o canal é um.
  function body(msg, salon = null) {
    const d = msg.mudae || {};
    let content;
    if (d.kind === 'roll' && salon) content = rollLine(msg, d, salon);
    else if (d.kind === 'roll' || d.kind === 'info') content = characterCard(msg, d);
    else if (d.kind === 'harem') content = haremCard(msg, d);
    else if (d.kind === 'top' || d.kind === 'obra') content = topCard(msg, d);
    else if (d.kind === 'topserv') content = topservCard(d);
    else if (d.kind === 'wishlist') content = wishCard(msg, d);
    else if (d.kind === 'trade') content = tradeCard(msg, d);
    else if (d.kind === 'give') content = line('married', ico('gift'), strongName(d.ownerId), ' deu ', el('strong', { textContent: d.card.name }), ' de presente para ', strongName(d.to), '!');
    else if (d.kind === 'givek') content = line('kakera', kakera(), strongName(d.ownerId), ` deu ${num(d.amount)} kakera para `, strongName(d.to), '.');
    else if (d.kind === 'dk') content = line('kakera', kakera(), strongName(d.ownerId), ` pegou o kakera do dia: +${num(d.amount)} (agora tem ${num(d.kakera)}).`);
    else if (d.kind === 'daily') content = line('daily', ico('dice'), strongName(d.ownerId), ' usou o $daily: os rolls voltaram!');
    else if (d.kind === 'rolls') content = line('daily', ico('dice'), strongName(d.ownerId), ` comprou os rolls de volta por ${num(d.price)} kakera.`);
    else if (d.kind === 'kakera') content = el('div', { class: 'msg-text' }, kakera(), 'Você tem ', el('strong', { textContent: num(d.kakera) }), ' kakera.');
    else if (d.kind === 'wish') {
      content = el('div', { class: 'msg-text' }, ico('wish'), el('strong', { textContent: d.card.name }), ` entrou na sua lista de desejos (${d.total}/${d.max}). `,
        d.ownerId ? ['Já é de ', strongName(d.ownerId), '. Que tal propor uma troca?'] : 'Você recebe um aviso quando alguém rodar.');
    } else if (d.kind === 'unwish') content = el('div', { class: 'msg-text' }, ico('wish'), el('strong', { textContent: d.card.name }), ` saiu da sua lista de desejos (${d.total}/${d.max}).`);
    else if (d.kind === 'fm') content = el('div', { class: 'msg-text' }, ico('wish'), el('strong', { textContent: d.card.name }), ' agora é o seu favorito.');
    else if (d.kind === 'married' && d.from) {
      content = line('married stolen', ico('thief', 'roubo'), strongName(d.ownerId), ' roubou ', el('strong', { textContent: d.card.name }), ' do roll de ', strongName(d.from), '!', ...lassoTag(d));
    } else if (d.kind === 'married') {
      content = line('married', ico('heart'), strongName(d.ownerId), ' e ', el('strong', { textContent: d.card.name }), ' agora são casados!', ...lassoTag(d));
    } else if (d.kind === 'forja') content = forjaCard(d);
    else if (d.kind === 'medal') content = medalCard(d);
    else if (d.kind === 'powers') content = powersCard(d);
    else if (d.kind === 'power') content = powerLine(d);
    else if (d.kind === 'eco') content = ecoCard(d);
    else if (d.kind === 'foresee') {
      content = line('power', powerIcon('videncia'), 'Vidência: os próximos rolls serão ', d.future?.map((r) => RARITY[r] || r).join(', ') || 'um mistério', '.', d.wish ? ' O próximo traz um desejo.' : '');
    } else if (d.kind === 'unlock') content = line('unlock', ico('sparkles'), strongName(d.ownerId), ' ganhou um poder: ', powerIcon(d.power), powerOf(d.power).name + '!');
    else if (d.kind === 'crystal') content = crystalLine(d);
    else if (d.kind === 'crystalEnd') content = crystalEndLine(d);
    else if (d.kind === 'redirect') content = redirect(d);
    else if (d.kind === 'divorce') {
      content = line('divorce', ico('heartBreak', 'divórcio'), el('strong', { textContent: whoName(d.ownerId) }), ' e ', el('strong', { textContent: d.card.name }), ' se divorciaram.',
        d.refund ? ` (+${num(d.refund)} kakera)` : '',
        d.capped ? ` O divórcio já devolveu 500 de kakera hoje; o próximo devolve em ${minutes(d.refundIn)}.` : '');
    } else if (d.kind === 'status') content = statusLines(d);
    else if (d.kind === 'error') content = el('div', { class: 'msg-text' }, Format.render(d.text || '', fmtCtx));
    else content = el('div', { class: 'mudae-hint', textContent: 'Resposta do Mudae.' });
    const parts = [].concat(content);
    if (msg.ephemeral) {
      parts.push(el('div', { class: 'mudae-ephemeral' }, Icon('eye', 16), el('span', { textContent: 'Só você pode ver esta mensagem • ' }),
        el('button', { type: 'button', class: 'link-button', textContent: 'Ignorar', onclick: () => dismiss(msg) })));
    }
    return parts;
  }

  // Linha "Fulano usou $w" acima da resposta, como os comandos de barra do Discord.
  function invocation(msg) {
    if (!msg.by || !msg.command) return null;
    const who = member(msg.by);
    const open = (e) => who && (e.stopPropagation(), openProfile(who.id, e.currentTarget));
    return el('div', { class: 'reply-ref mudae-invocation' },
      el('span', { class: 'reply-curve' }),
      who ? avatar(who, 'mudae-mini-avatar') : null,
      el('span', { class: 'reply-author', style: { color: nameColor(who) || '' }, textContent: who?.name || 'alguém', onclick: open }),
      el('span', { class: 'mudae-muted', textContent: 'usou' }),
      el('span', { class: 'mudae-cmd', textContent: msg.command }));
  }

  const botAvatar = () => el('div', { class: 'avatar mudae-avatar', ariaHidden: 'true' }, Icon('heart', 22));

  // ---------- mensagens só para quem pediu ----------
  let ephemeralSeq = 0;
  function ephemeral(channel, data) {
    const { command, ...rest } = data;
    const list = (state.messages[channel] ||= []);
    list.push({ id: 'eph-' + (++ephemeralSeq), authorId: null, bot: 'mudae', by: state.me.accountId, command, ts: Date.now(), ephemeral: true, mudae: rest });
    if (channel === state.textChannel) renderMessages(true);
  }
  function dismiss(msg) {
    for (const [channel, list] of Object.entries(state.messages)) {
      const i = list?.indexOf(msg) ?? -1;
      if (i >= 0) { list.splice(i, 1); if (channel === state.textChannel) renderMessages(); }
    }
  }

  // ---------- comandos ----------
  const ALIASES = 'w|waifu|h|husbando|m|marry|mm|mma|mms|mmr|harem|im|info|divorce|divorciar|tu|top|topserv|obra|give|dar|givek|givekakera|wish|desejar'
    + '|wl|wishlist|wr|wishremove|k|kakera|dk|dailykakera|daily|rolls|fm|favorito|trade|trocar|troca|forja|badges|forjar|poderes|poder|[whm][agcds]';
  const COMMAND_RE = new RegExp(`^\\$(${ALIASES})(\\s|$)`, 'i');
  const isCommand = (text) => COMMAND_RE.test(text.trim());
  const divorceTarget = (text) => /^\$(?:divorce|divorciar)\s+([\s\S]+)$/i.exec(text.trim())?.[1].trim() || null;
  // Comandos que não dá para desfazer pedem confirmação antes de sair (o texto ainda com o @ digitado).
  function confirmFor(text) {
    const t = text.trim();
    const divorce = divorceTarget(t);
    if (divorce) return { title: 'Divorciar?', text: `"${divorce}" sai do seu harem e qualquer pessoa vai poder casar com esse personagem de novo. Você recebe o valor dele em kakera.`, confirm: 'Divorciar' };
    const give = /^\$(give|dar|givek|givekakera)\s+([\s\S]+)$/i.exec(t);
    if (!give) return null;
    return !/^givek/i.test(give[1])
      ? { title: 'Dar de presente?', text: `${give[2].trim()}: o personagem sai do seu harem e vai para o da pessoa. Não dá para desfazer.`, confirm: 'Dar', danger: false }
      : { title: 'Dar kakera?', text: `${give[2].trim()}: o kakera sai do seu saldo e vai para a pessoa. Não dá para desfazer.`, confirm: 'Dar', danger: false };
  }

  function suggestions(typed) {
    const q = typed.toLowerCase();
    // Sem nada digitado, só os comandos principais; com "$w", aparecem também $wa, $wg…
    return COMMANDS.filter((c) => c.name.startsWith(q) && (q || !/^[whm][agcds]$/.test(c.name)))
      .map((c) => ({ command: true, icon: 'heart', insert: '$' + c.name, label: '$' + c.name + (c.args ? ' ' : ''), hint: c.args ? c.hint : '', note: c.note, args: !!c.args }));
  }

  return { body, invocation, botAvatar, ephemeral, sync, serverNow, suggestions, isCommand, divorceTarget, confirmFor, kakera, num, minutes, RARITY, SOURCES, seriesLine, sourceIcon, ownerTag,
    MEDALS, FINISHES, ROMAN, POWER, ico, rankMedal };
};
