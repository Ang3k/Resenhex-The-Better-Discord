/* Mudae: os cards de personagem que o bot posta no chat ($w/$h/$m), o harem ($mm), o $im, o $tu e
   o botão de casar. O servidor decide tudo (sorteio, limites, quem casou primeiro); aqui só desenhamos
   as respostas. As fotos vêm direto do CDN do AniList. */
window.MudaeUI = function ({ state, el, Icon, call, member, avatar, nameColor, Format, fmtCtx, openProfile, openImage, openChannel, renderMessages, keepBottom }) {
  const COMMANDS = [
    { name: 'w', note: 'roda uma waifu' },
    { name: 'h', note: 'roda um husbando' },
    { name: 'm', note: 'roda um personagem qualquer' },
    { name: 'mm', args: true, hint: '@pessoa', note: 'mostra o harem (o seu ou de alguém)' },
    { name: 'im', args: true, hint: 'nome', note: 'mostra um personagem e quem casou com ele' },
    { name: 'divorce', args: true, hint: 'nome', note: 'solta um personagem do seu harem' },
    { name: 'tu', note: 'rolls restantes e próximo casamento' },
  ];
  // Fontes de personagens: a letra filtra o roll ($wg = waifu de jogo), como no Mudae do Discord.
  const SOURCES = {
    a: { label: 'Anime', icon: '🎌', of: 'de anime' },
    g: { label: 'Jogos', icon: '🎮', of: 'de jogo' },
    c: { label: 'Quadrinhos', icon: '🦸', of: 'de quadrinhos' },
    d: { label: 'Desenhos', icon: '📺', of: 'de desenho' },
    s: { label: 'Séries', icon: '🎬', of: 'de série' },
  };
  for (const [letter, src] of Object.entries(SOURCES)) {
    COMMANDS.push({ name: 'w' + letter, note: 'waifu ' + src.of }, { name: 'h' + letter, note: 'husbando ' + src.of }, { name: 'm' + letter, note: 'qualquer personagem ' + src.of });
  }
  const sourceOf = (card) => SOURCES[card.source || 'a'];
  const seriesLine = (card) => sourceOf(card).icon + ' ' + card.series;
  const PAGE = 15;
  const num = (n) => Number(n || 0).toLocaleString('pt-BR');
  const whoName = (id) => member(id)?.name || 'alguém que saiu';
  const kakera = () => el('span', { class: 'mudae-kakera', ariaLabel: 'kakera' }, Icon('gem', 15));
  const RARITY = { legendary: 'Lendário', epic: 'Épico', rare: 'Raro', common: 'Comum' };
  const strongName = (id) => el('strong', { textContent: whoName(id), style: { color: nameColor(member(id)) || '' } });
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
    // Rolls do Salão giram por ~1,6 s e quem rodou tem 3 s só dele: o card do chat espera junto.
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
    const node = el('div', { class: 'mudae-card' + (d.ownerId ? ' owned' : '') },
      el('div', { class: 'mudae-name', textContent: card.name }),
      el('div', { class: 'mudae-series', textContent: seriesLine(card) }),
      el('div', { class: 'mudae-value' }, el('strong', { textContent: num(card.value) }), kakera(),
        card.rarity ? el('span', { class: 'mudae-rarity-tag ' + card.rarity, textContent: RARITY[card.rarity] }) : null),
      !d.ownerId && roll ? el('div', { class: 'mudae-hint', textContent: 'Clique em Casar antes dos outros!' }) : null,
      d.kind === 'info' ? el('div', { class: 'mudae-hint', textContent: `#${num(card.rank)} entre os personagens ${sourceOf(card).of}` }) : null,
      portrait(card),
      d.ownerId ? ownerFooter(d.ownerId, 'Pertence a')
        : d.kind === 'info' ? el('div', { class: 'mudae-footer' }, el('span', { textContent: 'Ninguém casou com esse personagem ainda.' })) : null,
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

  function statusLines(d) {
    return el('div', { class: 'mudae-status' },
      el('div', {}, d.rollsLeft
        ? ['Você tem ', el('strong', { textContent: String(d.rollsLeft) }), ` de ${d.rollsMax} rolls nesta hora. Eles voltam em `, el('strong', { textContent: minutes(d.rollResetIn) }), '.']
        : ['Seus rolls acabaram. Eles voltam em ', el('strong', { textContent: minutes(d.rollResetIn) }), '.']),
      el('div', {}, d.claimReady
        ? ['Você ', el('strong', { class: 'mudae-ok', textContent: 'pode casar' }), ' agora!']
        : ['Você já casou. Dá para casar de novo em ', el('strong', { textContent: minutes(d.claimResetIn) }), '.']));
  }

  // Roll dentro do Salão: o card grande está no palco, então o chat mostra só uma linha.
  function rollLine(msg, d, salon) {
    const rarity = d.card.rarity || 'common';
    const node = el('button', { type: 'button', class: 'mudae-roll-line', onclick: () => salon.show(msg.id) },
      el('img', { class: 'mudae-roll-thumb', src: d.card.image, alt: '', loading: 'lazy', decoding: 'async', draggable: false }),
      el('span', { class: 'mudae-roll-text' }, '🎲 ', el('strong', { textContent: d.card.name }),
        el('span', { class: 'mudae-muted', textContent: ' · ' + seriesLine(d.card) })),
      el('span', { class: 'mudae-rarity-tag ' + rarity, textContent: RARITY[rarity] }),
      el('span', { class: 'mudae-roll-spin', textContent: '🎲 rodando…' }));
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
      return el('div', { class: 'msg-text' }, '🎰 Este servidor ainda não tem um Salão do Mudae. Quem pode gerenciar canais cria um em ',
        el('strong', { textContent: 'Criar canal → Salão do Mudae' }), '.');
    }
    return el('div', { class: 'mudae-redirect' },
      el('div', { class: 'msg-text' }, '🎰 O Mudae agora mora no ', el('strong', { textContent: '#' + d.name }), '. Lá você vê o que a turma está rodando ao vivo.'),
      el('button', { type: 'button', class: 'mudae-go', onclick: () => openChannel(d.channel) }, 'Ir para o Salão'));
  }

  // Conteúdo da mensagem do bot (vai dentro do .msg-body). salon: a tela do Salão, quando o canal é um.
  function body(msg, salon = null) {
    const d = msg.mudae || {};
    let content;
    if (d.kind === 'roll' && salon) content = rollLine(msg, d, salon);
    else if (d.kind === 'roll' || d.kind === 'info') content = characterCard(msg, d);
    else if (d.kind === 'harem') content = haremCard(msg, d);
    else if (d.kind === 'married' && d.from) {
      content = line('married stolen', '😈 ', strongName(d.ownerId), ' roubou ', el('strong', { textContent: d.card.name }), ' do roll de ', strongName(d.from), '!');
    } else if (d.kind === 'married') {
      content = line('married', '💖 ', strongName(d.ownerId), ' e ', el('strong', { textContent: d.card.name }), ' agora são casados! 💖');
    } else if (d.kind === 'redirect') content = redirect(d);
    else if (d.kind === 'divorce') {
      content = line('divorce', '💔 ', el('strong', { textContent: whoName(d.ownerId) }), ' e ', el('strong', { textContent: d.card.name }), ' se divorciaram.');
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
  const isCommand = (text) => /^\$(w|waifu|h|husbando|m|marry|mm|harem|im|info|divorce|divorciar|tu|[whm][agcds])(\s|$)/i.test(text.trim());
  const divorceTarget = (text) => /^\$(?:divorce|divorciar)\s+([\s\S]+)$/i.exec(text.trim())?.[1].trim() || null;

  function suggestions(typed) {
    const q = typed.toLowerCase();
    // Sem nada digitado, só os comandos principais; com "$w", aparecem também $wa, $wg…
    return COMMANDS.filter((c) => c.name.startsWith(q) && (q || !/^[whm][agcds]$/.test(c.name)))
      .map((c) => ({ command: true, icon: 'heart', insert: '$' + c.name, label: '$' + c.name + (c.args ? ' ' : ''), hint: c.args ? c.hint : '', note: c.note }));
  }

  return { body, invocation, botAvatar, ephemeral, sync, serverNow, suggestions, isCommand, divorceTarget, kakera, num, minutes, RARITY, SOURCES, seriesLine };
};
