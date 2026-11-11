/* Mudae: os superpoderes no palco do Salão. O trilho com os 3 espaços (à direita da carta; no celular, uma
   fileira embaixo dela), a Vidência (só de quem usou), a escolha do Eco, os efeitos que todo mundo vê e a faixa
   de poder ganho. O servidor decide tudo (carga, quem pode, o que saiu); aqui só desenhamos e mandamos o clique.
   As cores de cada poder ficam no mudae-poderes.css (pelo data-power). */
window.MudaePowers = function ({ el, call, onSocket, ui, Sounds, reducedMotion = () => false, toast = () => {}, member, me }) {
  const NS = 'http://www.w3.org/2000/svg';
  const POWER = ui.POWER;
  const { minutes, num } = ui;
  // Poderes que ficam acesos até o próximo roll de quem usou.
  const ARMED = ['amuleto', 'desejo', 'dupla'];
  // Poderes que só ligam numa hora certa da mesa, e o que o espaço diz enquanto ela não chega.
  const WHEN = { cadeado: 'no seu roll, girando', laco: 'nos 3 s de outra pessoa' };
  // "VOCÊ GANHOU O CADEADO", mas "A VIDÊNCIA".
  const FEMININE = ['videncia', 'chuva', 'dupla'];
  const SOUND = { cadeado: 'mudaeLock', laco: 'mudaeLasso', chuva: null };
  const BANNER_MS = 2600;
  // As curvas são as do app (motion.css); sem elas (teste), as do navegador.
  const token = (name, fallback) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
  const EASE = () => token('--ease-enter', 'ease-out');
  const SPRING = () => token('--spring-pop', 'ease-out');

  let host = null; // o palco de agora: { stage, ctx: { channel, msg, phase, mine } }
  let view = null; // o que o servidor disse em mudae:powers:get
  let viewAt = 0; // quando chegou, para a carga andar sozinha
  let loading = null;
  let asked = 0;
  let busy = false; // um pedido por vez
  let clock = 0;
  let drawn = ''; // os espaços que estão desenhados
  let future = null; // a Vidência: { list, wish }
  let lastRoll = null;
  let picker = null; // a escolha do Eco
  let incoming = null; // poder ganho que ainda está voando para o espaço
  let showing = false;
  const armed = new Set();
  const gained = []; // faixas de poder ganho esperando a vez
  const known = new Set(); // poderes cuja faixa já apareceu nesta sessão
  const timers = new Set();
  const nodes = {
    rail: el('div', { class: 'poder-rail', role: 'group', ariaLabel: 'Seus poderes' }),
    fx: el('div', { class: 'poder-fx', ariaHidden: 'true' }),
    future: null, banner: null,
  };

  function later(fn, ms) {
    const id = setTimeout(() => { timers.delete(id); fn(); }, ms);
    timers.add(id);
    return id;
  }
  const onStage = () => !!host?.stage.isConnected;
  const nameOf = (id) => (id === me() ? 'Você' : member?.(id)?.name || 'Alguém');

  // ---------- o que o servidor sabe ----------
  // Sempre pergunta de novo (usar um poder não devolve a recarga); vale a resposta mais nova.
  function refresh() {
    const n = ++asked;
    const request = loading = Promise.resolve(call('mudae:powers:get')).then((res) => {
      if (res && n === asked) {
        view = res;
        viewAt = Date.now();
        update();
      }
      if (loading === request) loading = null;
      pump();
    });
    return request;
  }
  const leftOf = (key) => Math.max(0, (view?.readyIn?.[key] || 0) - (Date.now() - viewAt));
  // Gastou agora: a recarga começa do zero (o servidor confirma no refresh).
  function spend(key) {
    if (!view) return;
    view.readyIn = { ...view.readyIn, [key]: (view.rechargeMs || 0) + (Date.now() - viewAt) };
  }

  // Em que pé está cada espaço: off = não dá para clicar agora, p = quanto do anel está cheio.
  function stateOf(key) {
    if (armed.has(key)) return { cls: 'armed', text: 'ativo no próximo roll', off: true, p: 1 };
    const left = leftOf(key);
    if (left > 0) return { cls: 'charging', text: 'volta em ' + minutes(left), off: true, p: view.rechargeMs ? Math.max(0, 1 - left / view.rechargeMs) : 0 };
    const { msg, phase, mine } = host?.ctx || {};
    const d = msg?.mudae;
    // O Cadeado só no meu roll enquanto a cápsula gira (carta com dono ou já trancada não serve).
    if (key === 'cadeado' && !(d && mine && phase === 'spinning' && !d.ownerId && !d.pairFree && !d.lockedBy)) return { cls: 'waiting', text: WHEN.cadeado, off: true, p: 1 };
    // O Laço só no roll de outra pessoa, nos 3 s dela.
    if (key === 'laco' && !(d && !mine && phase === 'priority')) return { cls: 'waiting', text: WHEN.laco, off: true, p: 1 };
    return { cls: 'ready', text: 'pronto', off: false, p: 1 };
  }

  // ---------- o trilho ----------
  function slotNode(key, i) {
    if (!key) {
      return el('div', { class: 'poder-slot empty', title: 'Os poderes abrem com conquistas. Veja quanto falta na Forja.' },
        el('span', { class: 'poder-orb', ariaHidden: 'true' }), el('span', { class: 'poder-name', textContent: 'espaço livre' }), el('span', { class: 'poder-state' }));
    }
    const p = POWER[key] || { name: key, icon: '✦', does: '' };
    return el('div', { class: 'poder-slot', data: { power: key, slot: String(i) } },
      el('button', { type: 'button', class: 'poder-orb', ariaLabel: p.name, title: `${p.name}: ${p.does || ''}`, onclick: () => use(key) },
        el('span', { class: 'poder-ico', ariaHidden: 'true', textContent: p.icon })),
      el('span', { class: 'poder-name', textContent: p.name }),
      el('span', { class: 'poder-state' }));
  }

  function update() {
    if (!view) return;
    const slots = view.slots || [];
    const key = slots.join('|');
    if (key !== drawn || nodes.rail.childElementCount !== slots.length) {
      drawn = key;
      nodes.rail.replaceChildren(...slots.map(slotNode));
    }
    slots.forEach((power, i) => {
      if (!power) return;
      const node = nodes.rail.children[i];
      const orb = node.firstChild;
      const s = stateOf(power);
      const was = node.dataset.state;
      // Acabou de ficar pronto: um pulso para chamar o olho (o Cadeado e o Laço têm poucos segundos).
      if (was && was !== 'ready' && s.cls === 'ready') { node.classList.remove('pulse'); void node.offsetWidth; node.classList.add('pulse'); }
      if (s.cls !== 'ready') node.classList.remove('pulse');
      node.dataset.state = s.cls;
      for (const cls of ['ready', 'charging', 'armed', 'waiting']) node.classList.toggle(cls, cls === s.cls);
      node.classList.toggle('timed', !!WHEN[power]);
      // O poder recém-ganho só aparece no espaço quando a bolinha dele chega (ou a faixa dele entra).
      node.classList.toggle('incoming', incoming === power || gained.includes(power));
      orb.disabled = s.off || busy;
      orb.style.setProperty('--p', String(Math.round(s.p * 1000) / 1000));
      // No palco baixo o nome e o estado ficam escondidos: a dica do botão diz tudo.
      const tip = `${POWER[power]?.name || power} (${s.text}): ${POWER[power]?.does || ''}`;
      if (orb.title !== tip) orb.title = tip;
      // Quem usa leitor de tela ouve o nome e o estado (o texto de baixo some no palco estreito).
      const label = `${POWER[power]?.name || power}: ${s.text}`;
      if (orb.getAttribute('aria-label') !== label) orb.setAttribute('aria-label', label);
      const text = node.lastChild;
      if (text.textContent !== s.text) text.textContent = s.text;
    });
  }

  // Põe as peças no palco na ordem do celular: a Vidência em cima da carta, o trilho logo embaixo dela.
  // O Salão refaz o palco a cada mudança; as nossas peças são as mesmas e só voltam para o lugar.
  function place() {
    const { stage } = host;
    const slot = [...stage.children].find((n) => n.classList.contains('salon-card-slot'));
    if (nodes.rail.parentNode !== stage || (slot && nodes.rail.previousElementSibling !== slot)) {
      if (slot) slot.after(nodes.rail); else stage.append(nodes.rail);
    }
    if (nodes.future && nodes.future.parentNode !== stage) { if (slot) slot.before(nodes.future); else stage.prepend(nodes.future); }
    for (const node of [nodes.fx, nodes.banner, picker]) if (node && node.parentNode !== stage) stage.append(node);
    stage.classList.add('has-poderes');
    stage.classList.toggle('has-future', !!nodes.future);
  }

  // O Salão chama a cada mudança do palco. ctx: { channel, msg, phase, mine }. Sem palco (saiu do Salão), solta tudo.
  function rail(stageEl, ctx) {
    if (!stageEl) return detach();
    if (host && host.stage !== stageEl) { closePicker(); nodes.fx.replaceChildren(); }
    host = { stage: stageEl, ctx: ctx || {} };
    place();
    update();
    if (!view && !loading) refresh();
    if (!clock) clock = setInterval(update, 1000);
    pump();
  }

  function detach() {
    for (const id of timers) clearTimeout(id);
    timers.clear();
    clearInterval(clock);
    clock = 0;
    closePicker();
    nodes.banner?.remove();
    nodes.banner = null;
    nodes.fx.replaceChildren();
    nodes.rail.remove();
    nodes.future?.remove();
    // A faixa que estava na tela ao sair não volta; as que nem apareceram esperam a próxima vez.
    showing = false;
    incoming = null;
    host = null;
  }

  // ---------- usar ----------
  async function use(key) {
    if (busy || !host || !view || stateOf(key).off) return;
    if (key === 'eco') return openEco();
    const { channel, msg } = host.ctx;
    const payload = { channel, power: key };
    if (WHEN[key]) payload.id = msg.id;
    busy = true;
    fire(key);
    const res = await call('mudae:power:use', payload);
    busy = false;
    if (!res) return update();
    spend(key);
    if (key === 'videncia') {
      Sounds.play('mudaePower');
      showFuture(res);
    } else if (ARMED.includes(key)) {
      armed.add(key);
      // O Amuleto e o Chamar desejo mudam a previsão que a Vidência já mostrou.
      if (future && res.future?.length) { future = { list: res.future.slice(0, 3), wish: !!res.wish }; drawFuture(false); }
    }
    update();
    refresh();
  }

  function fire(key) {
    const node = [...nodes.rail.children].find((n) => n.dataset.power === key);
    if (!node) return;
    node.classList.remove('fire');
    void node.offsetWidth;
    node.classList.add('fire');
    later(() => node.classList.remove('fire'), 600);
  }

  // Um roll meu chegou: gasta a primeira previsão e o que estava ativo para o próximo roll. O Eco não conta
  // como roll, e as duas cartas da Escolha dupla são um roll só.
  function rolled(msg) {
    const d = msg?.mudae;
    if (!d || d.eco) return;
    const key = d.pair || msg.id;
    if (key === lastRoll) return;
    lastRoll = key;
    armed.clear();
    if (future) {
      future.list.shift();
      future.wish = false;
      if (!future.list.length) future = null;
      drawFuture(false);
    }
    update();
  }

  // ---------- Vidência: as 3 cápsulas à esquerda, só para quem usou ----------
  function showFuture(res) {
    if (!res.future?.length) return;
    future = { list: res.future.slice(0, 3), wish: !!res.wish };
    drawFuture(true);
  }
  function drawFuture(fresh) {
    nodes.future?.remove();
    nodes.future = null;
    if (future) {
      nodes.future = el('div', { class: 'poder-future', data: { power: 'videncia' }, role: 'status' },
        el('span', { class: 'poder-future-label' }, '🔮 ', el('span', { class: 'poder-future-what', textContent: 'seus próximos rolls' }), el('small', { textContent: '(só você vê)' })),
        el('div', { class: 'poder-future-list' }, future.list.map((rarity, i) => el('div', { class: 'poder-capsule r-' + rarity, data: { rarity },
          title: i === 0 && future.wish ? 'O próximo roll traz um desejo seu.' : '' },
        el('i', { ariaHidden: 'true' }, i === 0 && future.wish ? '⭐' : null), el('span', {}, el('b', { class: 'poder-capsule-n', textContent: `${i + 1}º · ` }), ui.RARITY[rarity] || rarity)))));
    }
    if (!onStage()) return;
    place();
    if (!fresh || !nodes.future || reducedMotion()) return;
    // A névoa sai do poder e as cápsulas viram uma a uma.
    const from = orbPoint('videncia');
    if (from) grow(piece('poder-fx-mist', from.x, from.y, 'videncia'), 0.5, 9, 1100, 0.9);
    const ease = EASE();
    [...nodes.future.querySelectorAll('.poder-capsule')].forEach((cap, i) => cap.animate(
      [{ transform: 'translateX(-14px) rotateY(90deg)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 440, delay: 250 + i * 260, easing: ease, fill: 'both' }));
  }

  // ---------- Eco: a escolha de até 5 cartas ----------
  async function openEco() {
    const { channel } = host.ctx;
    busy = true;
    update();
    const res = await call('mudae:eco:list', { channel });
    busy = false;
    update();
    if (!res || !onStage()) return;
    const cards = (res.cards || []).slice(0, 5);
    if (!cards.length) return toast('Nenhum personagem passou sem dono por aqui nos últimos minutos.', 'info');
    closePicker();
    picker = el('div', { class: 'poder-eco', data: { power: 'eco' }, role: 'dialog', ariaLabel: 'Qual personagem volta?',
      onclick: (e) => { if (e.target === picker) closePicker(); }, onkeydown: (e) => { if (e.key === 'Escape') closePicker(); } },
    el('div', { class: 'poder-eco-box' },
      el('strong', { class: 'poder-eco-title', textContent: '🔁 Qual personagem volta?' }),
      el('span', { class: 'poder-eco-sub', textContent: 'Passaram sem dono há pouco. Quem voltar é como um roll seu.' }),
      el('div', { class: 'poder-eco-list' }, cards.map((card) => el('button', { type: 'button', class: 'poder-eco-card r-' + (card.rarity || 'common'), title: card.series || '', onclick: () => pickEco(card) },
        el('img', { src: card.image, alt: '', loading: 'lazy', decoding: 'async', draggable: false }),
        el('span', { class: 'poder-eco-info' }, el('span', { class: 'poder-eco-name', textContent: card.name }),
          el('span', { class: 'poder-eco-value' }, ui.kakera(), el('b', { textContent: num(card.value) })))))),
      el('button', { type: 'button', class: 'poder-eco-cancel', textContent: 'Cancelar', onclick: closePicker })));
    host.stage.append(picker);
    picker.querySelector('.poder-eco-card')?.focus?.({ preventScroll: true });
  }
  function closePicker() {
    picker?.remove();
    picker = null;
  }
  async function pickEco(card) {
    if (busy || !host) return;
    busy = true;
    picker?.classList.add('pending');
    const res = await call('mudae:power:use', { channel: host.ctx.channel, power: 'eco', charId: card.id });
    busy = false;
    closePicker();
    if (res) { spend('eco'); refresh(); }
    update();
  }

  // ---------- efeitos ----------
  // Tudo em pixels do palco. O jsdom não desenha (tudo zero), então há um tamanho mínimo para as contas.
  function boxOf(node) {
    const r = node.getBoundingClientRect(), s = host.stage.getBoundingClientRect();
    return { x: r.left - s.left + r.width / 2, y: r.top - s.top + r.height / 2, w: r.width, h: r.height };
  }
  const stageSize = () => { const s = host.stage.getBoundingClientRect(); return { w: s.width || 600, h: s.height || 360 }; };
  // A carta (ou a roleta) de um roll no palco; o Salão marca cada uma com data-roll.
  const rollNode = (id) => (id ? [...host.stage.querySelectorAll('[data-roll]')].find((n) => n.dataset.roll === id) || null : null);
  // O meio da carta que está no palco (ou do palco, se não há carta).
  function cardPoint(id) {
    const node = rollNode(id) || host.stage.querySelector('.salon-card-slot > .salon-pair, .salon-card-slot > .salon-card, .salon-card-slot > .salon-reel');
    const b = node ? boxOf(node) : null;
    if (b?.w) return b;
    const s = stageSize();
    return { x: s.w / 2, y: s.h * 0.42, w: 180, h: 270 };
  }
  // De onde sai o efeito: do meu poder no trilho ou, para quem está vendo, de fora do palco, pela direita.
  function orbPoint(power) {
    const orb = [...nodes.rail.children].find((n) => n.dataset.power === power)?.firstChild;
    const b = orb?.isConnected ? boxOf(orb) : null;
    return b?.w ? b : null;
  }
  function origin(e) {
    const mine = e.by === me() ? orbPoint(e.power) : null;
    if (mine) return mine;
    const s = stageSize();
    return { x: s.w + 24, y: s.h * 0.3 };
  }

  function piece(cls, x, y, power, ...children) {
    const node = el('div', { class: cls, data: { power } }, ...children);
    node.style.left = x.toFixed(1) + 'px';
    node.style.top = y.toFixed(1) + 'px';
    nodes.fx.append(node);
    return node;
  }
  // Anima e tira da tela no fim (quem tira é o relógio, não o fim da animação). Quem tem atraso espera
  // invisível (o CSS da peça), em vez de ficar parado no primeiro quadro.
  function play(node, frames, ms, opts = {}) {
    node.animate(frames, { duration: ms, easing: EASE(), fill: 'forwards', ...opts });
    later(() => node.remove(), ms + (opts.delay || 0) + 40);
    return node;
  }
  const grow = (node, from, to, ms, opacity = 1, delay = 0) => play(node,
    [{ transform: `translate(-50%, -50%) scale(${from})`, opacity }, { transform: `translate(-50%, -50%) scale(${to})`, opacity: 0 }], ms, { delay });
  const ring = (x, y, power, to = 8, delay = 0, cls = 'poder-fx-ring') => grow(piece(cls, x, y, power), 0.3, to, 750, 1, delay);

  const FX = {
    // O cadeado cai em cima da carta e trava.
    cadeado(e) {
      const target = rollNode(e.id);
      if (!target) return;
      const b = boxOf(target), top = b.y - b.h / 2;
      // O cadeado fixo (desenhado pelo Salão) espera o que está caindo chegar.
      host.stage.classList.add('poder-locking');
      later(() => host?.stage.classList.remove('poder-locking'), 520);
      play(piece('poder-fx-lock', b.x, top, 'cadeado', '🔒'), [{ transform: 'translate(-50%, calc(-50% - 70px)) scale(1.7)', opacity: 0 },
        { transform: 'translate(-50%, calc(-50% + 5px)) scale(.94)', opacity: 1, offset: 0.7 }, { transform: 'translate(-50%, -50%) scale(1)', opacity: 1 }], 520);
      ring(b.x, top, 'cadeado', 9, 380);
    },
    // A corda sai de quem laçou e fecha em volta da carta. Se a carta está trancada, bate no cadeado.
    laco(e) {
      const target = rollNode(e.id);
      const text = lassoText(e);
      if (!target) return banner(text, 'laco');
      const a = origin(e), b = boxOf(target), top = b.y - b.h / 2 + 14, s = stageSize();
      const svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('class', 'poder-fx-svg');
      svg.setAttribute('viewBox', `0 0 ${s.w} ${s.h}`);
      const path = document.createElementNS(NS, 'path');
      path.setAttribute('class', 'poder-rope');
      path.setAttribute('d', `M${a.x.toFixed(1)} ${a.y.toFixed(1)} Q${((a.x + b.x) / 2).toFixed(1)} ${(Math.min(a.y, top) - 90).toFixed(1)} ${(b.x + b.w / 2 + 6).toFixed(1)} ${top.toFixed(1)}`);
      const loop = document.createElementNS(NS, 'ellipse');
      loop.setAttribute('class', 'poder-rope');
      for (const [k, v] of Object.entries({ cx: b.x, cy: top, rx: b.w / 2 + 8, ry: 14 })) loop.setAttribute(k, v.toFixed(1));
      svg.append(path, loop);
      nodes.fx.append(svg);
      // A corda se desenha da mão até a carta, e depois o laço fecha.
      const len = path.getTotalLength?.() || 400, around = loop.getTotalLength?.() || 300;
      path.style.strokeDasharray = len;
      loop.style.strokeDasharray = around;
      path.animate([{ strokeDashoffset: len }, { strokeDashoffset: 0 }], { duration: 420, easing: EASE(), fill: 'both' });
      loop.animate([{ strokeDashoffset: around }, { strokeDashoffset: 0 }], { duration: 300, delay: 380, easing: EASE(), fill: 'both' });
      later(() => {
        if (!onStage()) return;
        banner(text, 'laco');
        if (e.bounced) {
          // Bateu: o cadeado balança e a corda solta.
          ring(b.x, b.y - b.h / 2, 'laco', 5);
          host.stage.querySelector('.poder-lock')?.animate([{ transform: 'translate(-50%, -50%) rotate(0)' }, { transform: 'translate(-50%, -50%) rotate(-18deg)' },
            { transform: 'translate(-50%, -50%) rotate(14deg)' }, { transform: 'translate(-50%, -50%) rotate(-6deg)' }, { transform: 'translate(-50%, -50%) rotate(0)' }], { duration: 460, easing: 'linear' });
        } else {
          // Pegou: a carta é puxada para o lado de quem laçou (o casamento já redesenhou o palco: é a carta de agora).
          const pull = a.x >= b.x ? 1 : -1;
          rollNode(e.id)?.animate([{ transform: 'none' }, { transform: `translateX(${30 * pull}px) rotate(${5 * pull}deg)` }, { transform: `translateX(${-6 * pull}px) rotate(${-pull}deg)` }, { transform: 'none' }],
            { duration: 560, easing: EASE() });
        }
      }, 720);
      later(() => svg.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 420, easing: 'linear', fill: 'forwards' }), e.bounced ? 1100 : 1600);
      later(() => svg.remove(), e.bounced ? 1560 : 2060);
    },
    // Os trevos giram em volta da carta e entram nela, com um clarão dourado no palco.
    amuleto(e) {
      const c = cardPoint(e.id), r = Math.max(90, c.w * 0.9);
      play(piece('poder-fx-glow', 0, 0, 'amuleto'), [{ opacity: 0 }, { opacity: 1, offset: 0.15 }, { opacity: 0 }], 1500, { easing: 'linear' });
      for (let i = 0; i < 12; i++) {
        const a0 = (i / 12) * 360;
        play(piece('poder-fx-clover', c.x, c.y, 'amuleto', i % 3 ? '✦' : '🍀'), [
          { transform: `translate(-50%, -50%) rotate(${a0}deg) translateX(${r}px) rotate(${-a0}deg) scale(.4)`, opacity: 0 }, { opacity: 1, offset: 0.2 },
          { transform: `translate(-50%, -50%) rotate(${a0 + 300}deg) translateX(${r * 0.15}px) rotate(${-a0 - 300}deg) scale(1)`, opacity: 0 }], 1400, { easing: 'cubic-bezier(.5, 0, .3, 1)' });
      }
    },
    // A estrela sai de quem chamou, faz um arco e cai na carta, deixando um rastro.
    desejo(e) {
      const a = origin(e), b = cardPoint(e.id), steps = 10, ms = 650;
      const at = (k) => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k - Math.sin(k * Math.PI) * 80 });
      const frames = [];
      for (let i = 0; i <= steps; i++) {
        const k = i / steps, eased = 1 - (1 - k) ** 3, p = at(eased);
        frames.push({ transform: `translate(calc(-50% + ${(p.x - a.x).toFixed(1)}px), calc(-50% + ${(p.y - a.y).toFixed(1)}px)) rotate(${Math.round(k * 220)}deg)`, offset: k });
        if (i && i < steps) {
          const dx = (Math.random() - 0.5) * 22, dy = 8 + Math.random() * 16;
          play(piece('poder-fx-dot', p.x, p.y, 'desejo'), [{ transform: 'translate(-50%, -50%) scale(1)', opacity: 0.95 },
            { transform: `translate(calc(-50% + ${dx.toFixed(1)}px), calc(-50% + ${dy.toFixed(1)}px)) scale(.2)`, opacity: 0 }], 700, { delay: k * ms });
        }
      }
      play(piece('poder-fx-star', a.x, a.y, 'desejo', '✦'), frames, ms, { easing: 'linear' });
      ring(b.x, b.y, 'desejo', 11, ms - 40);
    },
    // Duas cartas se abrem em leque: o próximo roll vem em dobro.
    dupla(e) {
      const c = cardPoint(e.id);
      for (const side of [-1, 1]) {
        play(piece('poder-fx-twin', c.x, c.y, 'dupla'), [{ transform: 'translate(-50%, -50%) scale(.7)', opacity: 0 },
          { transform: `translate(calc(-50% + ${side * 46}px), -50%) rotate(${side * 9}deg) scale(1)`, opacity: 0.95, offset: 0.4 },
          { transform: `translate(calc(-50% + ${side * 62}px), -54%) rotate(${side * 12}deg) scale(1.04)`, opacity: 0 }], 950);
      }
    },
    // As ondas verdes saem de quem usou e chegam à carta que volta.
    eco(e) {
      const a = origin(e);
      for (let i = 0; i < 3; i++) ring(a.x, a.y, 'eco', 9, i * 160, 'poder-fx-wave');
      // A carta que volta entra no palco logo depois do aviso: as ondas de chegada procuram onde ela está.
      later(() => {
        if (!onStage()) return;
        const b = cardPoint(e.id);
        for (let i = 0; i < 3; i++) ring(b.x, b.y, 'eco', 12, i * 150, 'poder-fx-wave');
      }, 480);
    },
  };

  // Um mudae:power (para quem está vendo o Salão) ou um mudae:unlock (kind: 'unlock'). A Chuva quem desenha é o
  // cristal (mudae-cristal.js). Com "Reduzir animações" nada voa: fica só a faixa e a troca de estado na carta.
  function effect(e) {
    if (!e) return;
    if (e.kind === 'unlock') return gain(e);
    if (!onStage() || e.channel !== host.ctx.channel || !POWER[e.power] || e.power === 'videncia') return;
    const sound = e.power in SOUND ? SOUND[e.power] : 'mudaePower';
    if (sound) Sounds.play(sound);
    // O $poder do chat também gasta a carga e acende o que vale para o próximo roll.
    if (e.by === me()) { if (ARMED.includes(e.power)) armed.add(e.power); refresh(); }
    if (!reducedMotion()) return FX[e.power]?.(e);
    if (e.power === 'laco') banner(lassoText(e), 'laco');
  }
  // A faixa do Laço: quem laçou quem, ou a batida no cadeado.
  function lassoText(e) {
    if (e.bounced) return '🪢 BATEU NO CADEADO!';
    const name = rollNode(e.id)?.querySelector('.salon-card-name')?.textContent || 'a carta';
    return `🪢 ${nameOf(e.by).toUpperCase()} LAÇOU ${name.toUpperCase()}!`;
  }

  // ---------- faixas ----------
  function banner(text, power, sub = null) {
    nodes.banner?.remove();
    const node = nodes.banner = el('div', { class: 'poder-banner', data: { power }, role: 'status' }, el('strong', { textContent: text }), sub ? el('small', { textContent: sub }) : null);
    host.stage.append(node);
    later(() => { node.remove(); if (nodes.banner === node) nodes.banner = null; }, BANNER_MS);
  }

  // Poder ganho: só para quem ganhou (os outros veem a linha no chat). Vários de uma vez entram na fila.
  function gain({ by, power }) {
    if (by !== me() || !POWER[power] || known.has(power)) return;
    known.add(power);
    gained.push(power);
    refresh(); // em qual espaço ele entrou
  }
  async function pump() {
    if (showing || !gained.length || !onStage()) return;
    showing = true;
    if (loading) await loading;
    if (!onStage() || !gained.length) { showing = false; return; }
    present(gained.shift());
    later(() => { showing = false; pump(); }, BANNER_MS + 300);
  }
  function present(power) {
    const p = POWER[power];
    const i = view?.slots?.indexOf(power) ?? -1;
    Sounds.play('mudaeUnlock');
    banner(`VOCÊ GANHOU ${FEMININE.includes(power) ? 'A' : 'O'} ${p.name.toUpperCase()}!`, power, i < 0 ? 'Seus 3 espaços estão cheios. Troque na Forja.' : null);
    // Sem espaço para ele (ou sem animações), não há voo: fica só a faixa.
    const slot = i >= 0 ? nodes.rail.children[i] : null;
    if (!slot || reducedMotion()) return update();
    const to = boxOf(slot.firstChild), s = stageSize();
    const from = { x: s.w / 2, y: Math.min(s.h * 0.42, 150) };
    incoming = power;
    update();
    const dx = (to.x - from.x).toFixed(1), dy = (to.y - from.y).toFixed(1);
    const fly = piece('poder-fly', from.x, from.y, power, el('span', { class: 'poder-ico', textContent: p.icon }));
    // Nasce no meio do palco, cresce, espera um instante e voa para o espaço dele.
    play(fly, [{ transform: 'translate(-50%, -50%) scale(.2)', opacity: 0 }, { transform: 'translate(-50%, -50%) scale(1.7)', opacity: 1, offset: 0.22 },
      { transform: 'translate(-50%, -50%) scale(1.5)', opacity: 1, offset: 0.55 }, { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(1)`, opacity: 1 }], 1500);
    grow(piece('poder-fx-ring', from.x, from.y, power), 0.3, 7, 800, 1, 120);
    later(() => {
      incoming = null;
      update();
      if (!onStage()) return;
      const landed = nodes.rail.children[i];
      if (landed?.dataset.power === power) landed.animate([{ transform: 'scale(1.25)' }, { transform: 'scale(1)' }], { duration: 420, easing: SPRING() });
      ring(to.x, to.y, power, 5);
    }, 1500);
  }

  // Depois de reconectar, a carga pode ter mudado.
  onSocket('connect', () => { if (host) refresh(); });

  return { rail, effect, refresh, rolled };
};
