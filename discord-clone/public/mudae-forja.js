/* Mudae: a aba Forja do Salão. A parede com as 7 medalhas, o detalhe de cada uma (o que dá em cada nível e o
   preço do próximo), a forja animada, a escolha do acabamento e, embaixo, os 8 poderes. O servidor decide preço,
   nível, acabamento e o que falta; aqui só desenhamos o que ele diz. medalSvg também serve ao $forja do chat e
   ao cartão de perfil. */
window.MudaeForge = function ({ el, call, onSocket, ui, Sounds, reducedMotion = () => false, toast = () => {}, member }) {
  // Ícones próprios dos poderes (mudae-icones.js); sem eles (testes), um espaço vazio.
  const MI = window.MudaeIcon || Object.assign(() => document.createElement('span'), { inline: () => document.createElement('span') });
  const powerIco = (key, size) => MI(POWER[key] ? key : 'spark', size);
  const { num, minutes, kakera } = ui;
  const MEDALS = ui.MEDALS;
  const KEYS = Object.keys(MEDALS);
  const FINISHES = ui.FINISHES;
  const ROMAN = ui.ROMAN;
  const POWER = ui.POWER;
  const REFORGE_PRICE = 500;
  // A curva de quem chega freando é a do app (--ease-enter, no motion.css); sem ela (teste), a do navegador.
  const token = (name, fallback) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
  const EASE = () => token('--ease-enter', 'ease-out');

  // O desenho das medalhas (mudae-medalhas.js): a Forja usa os mesmos contornos, cores e ferramentas de SVG.
  const { medalSvg, FINISH_RARITY, glowOf, SHAPE, VB, CX, s, f, poly, rounded, grad, scaled } = window.MudaeMedals(ui);
  let seq = 0;

  // O martelo: aço da cabeça (fundo, claro, médio, brilho da face), madeira do cabo (escura, média, clara) e a tira de couro.
  const HAMMER = { head: ['#2a2e35', '#9aa3ae', '#5d6570', '#e6ecf2'], grip: ['#4a2a14', '#7a4a26', '#b07a48'], wrap: ['#24140b', '#5e3a22', '#8a5a36'] };
  // A bigorna (do mais escuro ao brilho da face) e o fogo (do branco da brasa ao fundo da fornalha).
  const ANVIL = ['#101216', '#22262c', '#383e47', '#59616c', '#9aa3ae', '#e2e8ef'];
  const FIRE = ['#fff6d6', '#ffd36b', '#ff9a2e', '#e2531a', '#8a1f0a', '#2a0904'];
  const COAL = ['#0d0806', '#1e110b'];


  // O holográfico segue o ponteiro, como nas cartas do Salão; no celular ele anda sozinho (CSS).
  function follow(node) {
    node.addEventListener('pointermove', (e) => {
      if (reducedMotion() || e.pointerType === 'touch') return;
      const r = node.getBoundingClientRect();
      if (!r.width) return;
      node.style.setProperty('--mx', (((e.clientX - r.left) / r.width) * 100).toFixed(1) + '%');
      node.style.setProperty('--my', (((e.clientY - r.top) / r.height) * 100).toFixed(1) + '%');
    });
    node.addEventListener('pointerleave', () => { node.style.removeProperty('--mx'); node.style.removeProperty('--my'); });
    return node;
  }

  // ---------- o que cada medalha dá (a tabela da spec) ----------
  const PERKS = {
    bronze: { what: 'Mais vagas de desejo (hoje são 10).', at: (n) => `+${n} ${n === 1 ? 'vaga' : 'vagas'} de desejo` },
    prata: { what: 'Os rolls que sobraram passam para a próxima meia hora.', at: (n) => `guarda até ${n} ${n === 1 ? 'roll' : 'rolls'}` },
    ouro: { what: 'O cristal rende mais para você.', at: (n) => (n === 4 ? '+30% no cristal e o $dk em dobro' : `+${n * 10}% no cristal`) },
    safira: { what: 'Rolls a mais a cada 30 min (hoje são 10).', at: (n) => `+${n} ${n === 1 ? 'roll' : 'rolls'} a cada 30 min` },
    rubi: { what: 'Chance de o roll trazer um desejo seu.', at: (n) => `${String(n * 0.5).replace('.', ',')}% de chance de desejo` },
    esmeralda: { what: 'Um casamento de reserva, para quando o seu já foi gasto (guarda 1).', at: (n) => `1 casamento de reserva a cada ${[24, 18, 12, 6][n - 1]} h` },
    diamante: { what: 'Os poderes recarregam mais rápido (hoje em 24 h).', at: (n) => `poderes recarregam em ${[20, 17, 14, 12][n - 1]} h` },
  };
  // O que falta para abrir cada poder, na unidade de cada meta.
  const POWER_GOAL = { videncia: 'medalhas forjadas', cadeado: 'casamentos', amuleto: 'casamentos com lendário', chuva: 'cristais pegos',
    desejo: 'níveis da Bronze', eco: 'casamentos', dupla: 'rolls', laco: 'medalhas no nível II' };

  // ---------- estado ----------
  let host = null;
  let onKakera = () => {};
  let view = null;
  let powers = null;
  let selected = null;
  let busy = false; // forjando, reforjando ou escolhendo: um pedido por vez
  let animating = false;
  let picking = null; // poder que está escolhendo o espaço
  const waiting = []; // faixas do nível IV que esperam a forja acabar
  const later = (ms, fn) => setTimeout(fn, ms);

  const medalOf = (key) => view?.medals?.[key] || { level: 0, finish: null, offer: null };
  const priceOf = (key) => view?.prices?.[key] ?? null;
  // A base sai do preço que o servidor mandou (preço do nível n = base × n).
  const baseOf = (key) => { const p = priceOf(key); return p ? p / (medalOf(key).level + 1) : null; };
  const nameOf = (key) => MEDALS[key] || key;
  const titleOf = (key) => { const m = medalOf(key); return m.level ? `${nameOf(key)} ${ROMAN[m.level]}` : nameOf(key); };
  const finishTag = (finish, extra = '') => el('span', { class: 'forja-finish-tag r-' + (FINISH_RARITY[finish] || 'common') + extra, textContent: FINISHES[finish] || finish });

  function setKakera(value) {
    if (!view || value === undefined) return;
    view.kakera = value;
    const node = host?.querySelector('.forja-kakera-value');
    if (node) node.textContent = num(value);
    onKakera(value);
  }

  // ---------- desenho da aba ----------
  function render(container, opts = {}) {
    if (opts.onKakera) onKakera = opts.onKakera;
    host = el('div', { class: 'forja' });
    container.replaceChildren(host);
    draw();
    load();
    return host;
  }

  async function load() {
    const [v, p] = await Promise.all([call('mudae:forja:get'), call('mudae:powers:get')]);
    if (v) {
      view = v;
      if (!selected) selected = KEYS.find((k) => v.medals?.[k]?.offer) || KEYS[0];
    }
    if (p) powers = p;
    if (!animating) draw();
  }

  function draw() {
    if (!host) return;
    if (!view) {
      host.replaceChildren(el('div', { class: 'forja-loading', textContent: 'Acendendo a forja…' }));
      return;
    }
    host.replaceChildren(
      el('div', { class: 'forja-head' },
        el('div', {}, el('h2', { class: 'forja-title', textContent: 'Forja' }),
          el('p', { class: 'forja-sub', textContent: 'Forje medalhas com kakera. Cada nível dá uma vantagem e sorteia um acabamento.' })),
        el('div', { class: 'forja-kakera', title: 'Seu kakera' }, kakera(), el('strong', { class: 'forja-kakera-value', textContent: num(view.kakera) }))),
      // Os poderes ficam embaixo da parede, na mesma coluna: assim não sobra vão ao lado do painel (que cresce na escolha do acabamento).
      el('div', { class: 'forja-main' }, wall(), panel(), powersSection()));
  }

  function wall() {
    return el('div', { class: 'forja-wall', role: 'group', ariaLabel: 'Suas medalhas' }, KEYS.map((key) => {
      const m = medalOf(key);
      const price = priceOf(key);
      const short = price != null ? price - (view.kakera || 0) : 0;
      const label = m.offer ? 'escolha o acabamento' : m.level >= 4 ? 'completa' : short > 0 ? `faltam ${num(short)}` : num(price);
      return follow(el('button', { type: 'button', class: 'forja-slot' + (m.level ? '' : ' unforged') + (m.offer ? ' offer' : '') + (short > 0 && !m.offer ? ' short' : ''),
        data: { medal: key }, ariaPressed: String(selected === key), onclick: () => { selected = key; draw(); } },
      el('span', { class: 'forja-hook', ariaHidden: 'true' }),
      medalSvg(key, m.level, m.finish, 104),
      el('span', { class: 'forja-slot-name', textContent: nameOf(key) }),
      el('span', { class: 'forja-pips', ariaLabel: `nível ${m.level} de 4` }, [1, 2, 3, 4].map((n) => el('i', { class: n <= m.level ? 'on' : '' }))),
      el('span', { class: 'forja-slot-price' + (m.level >= 4 ? ' done' : '') }, label, price != null && !m.offer && short <= 0 ? kakera() : null)));
    }));
  }

  function panel() {
    const key = selected || KEYS[0];
    const m = medalOf(key);
    const price = priceOf(key);
    const base = baseOf(key);
    const have = view.kakera || 0;
    const perks = PERKS[key];
    const scene = forgeSet(key, m);
    const actions = el('div', { class: 'forja-actions' });
    if (m.level < 4) {
      const short = price - have;
      const forge = el('button', { type: 'button', class: 'forja-forge', disabled: busy || !!m.offer || short > 0, onclick: () => forgeNow(key) },
        short > 0 ? `Faltam ${num(short)}` : `Forjar ${ROMAN[m.level + 1]} · ${num(price)}`, kakera());
      if (m.offer) forge.title = 'Escolha o acabamento antes de forjar de novo.';
      actions.append(forge);
    }
    if (m.level >= 1) {
      actions.append(el('button', { type: 'button', class: 'forja-reforge', disabled: busy || !!m.offer || have < REFORGE_PRICE,
        title: have < REFORGE_PRICE ? `Faltam ${num(REFORGE_PRICE - have)}` : 'Sorteia outro acabamento; você escolhe qual fica.', onclick: () => reforgeNow(key) },
      `Reforjar acabamento · ${num(REFORGE_PRICE)}`, kakera()));
    }
    return el('div', { class: 'forja-panel' }, scene,
      el('div', { class: 'forja-detail' },
        el('div', { class: 'forja-detail-head' },
          el('h3', { class: 'forja-detail-title', textContent: titleOf(key) }),
          // Durante a forja o acabamento ainda é surpresa: ele aparece quando a medalha esfria.
          animating ? el('span', { class: 'forja-muted', textContent: 'na forja…' }) : m.level ? finishTag(m.finish) : el('span', { class: 'forja-muted', textContent: 'ainda não forjada' })),
        el('p', { class: 'forja-what', textContent: perks.what }),
        el('ol', { class: 'forja-perks' }, [1, 2, 3, 4].map((n) => el('li', { class: 'forja-perk' + (n === m.level ? ' now' : n < m.level ? ' got' : '') },
          el('span', { class: 'forja-perk-level', textContent: ROMAN[n] }),
          el('span', { class: 'forja-perk-text', textContent: perks.at(n) }),
          n <= m.level ? el('span', { class: 'forja-perk-price got', ariaLabel: 'já tem' }, MI('check', 14))
            : el('span', { class: 'forja-perk-price' }, base ? num(base * n) : '', base ? kakera() : null)))),
        m.offer && !animating ? choice(key, m) : null,
        m.level >= 1 ? el('label', { class: 'forja-show' },
          el('input', { type: 'checkbox', checked: shown().includes(key), disabled: busy, onchange: (e) => showNow(key, e.target.checked) }), 'Mostrar no perfil') : null,
        actions));
  }

  // Medalhas no cartão de perfil: o servidor manda a lista atual (ou a padrão); aqui troca uma e manda a lista inteira.
  const shown = () => view?.shown || [];
  async function showNow(key, on) {
    const before = shown();
    const next = on ? [...before.filter((k) => k !== key), key] : before.filter((k) => k !== key);
    view.shown = next;
    const res = await call('mudae:forja:show', { medals: next });
    if (!res) { view.shown = before; draw(); }
  }

  // As duas medalhas lado a lado: a de agora e a com o acabamento novo.
  function choice(key, m) {
    const side = (finish, pick, tag) => el('div', { class: 'forja-choice-side' },
      follow(el('div', { class: 'forja-choice-medal' }, medalSvg(key, m.level, finish, 112))),
      el('span', { class: 'forja-choice-tag', textContent: tag }), finishTag(finish),
      el('button', { type: 'button', class: 'forja-choose' + (pick === 'new' ? ' new' : ''), textContent: 'Ficar com ' + (FINISHES[finish] || finish), onclick: () => choose(key, pick) }));
    return el('div', { class: 'forja-choice', role: 'group', ariaLabel: 'Qual acabamento fica?' },
      el('p', { class: 'forja-choice-q', textContent: 'Saiu um acabamento novo. Qual fica?' }),
      el('div', { class: 'forja-choice-row' }, side(m.finish, 'old', 'Atual'), side(m.offer, 'new', 'Novo')));
  }

  async function forgeNow(key) {
    if (busy || !view) return;
    busy = true;
    const before = medalOf(key);
    const res = await call('mudae:forja:forge', { medal: key });
    if (!res) { busy = false; draw(); return; }
    setKakera(res.kakera);
    const oldPrice = priceOf(key);
    view.medals[key] = { level: res.level, finish: res.finish, offer: res.offer || null };
    if (oldPrice) view.prices[key] = res.level >= 4 ? null : (oldPrice / (before.level + 1)) * (res.level + 1);
    refresh();
    await forgeScene(key, res.level, res.offer || res.finish, 3);
  }

  async function reforgeNow(key) {
    if (busy || !view || (view.kakera || 0) < REFORGE_PRICE || medalOf(key).offer) return;
    busy = true;
    const res = await call('mudae:forja:reforge', { medal: key });
    if (!res) { busy = false; draw(); return; }
    setKakera(res.kakera);
    view.medals[key] = { ...medalOf(key), finish: res.finish, offer: res.offer };
    refresh();
    await forgeScene(key, medalOf(key).level, res.offer, 1);
  }

  // Busca de novo o que o servidor tem (preços e níveis certos); o desenho espera a forja acabar.
  // Forjar também pode abrir poderes (Vidência, Chamar desejo, Laço), então os poderes vêm junto.
  async function refresh() {
    const [v, p] = await Promise.all([call('mudae:forja:get'), call('mudae:powers:get')]);
    if (v) view = v;
    if (p) powers = p;
    if ((v || p) && !animating) draw();
  }

  async function choose(key, pick) {
    if (busy) return;
    busy = true;
    for (const b of host?.querySelectorAll('.forja-choose') || []) b.disabled = true;
    const res = await call('mudae:forja:finish', { medal: key, pick });
    busy = false;
    if (res) {
      const m = medalOf(key);
      view.medals[key] = { ...m, finish: res.finish ?? (pick === 'new' ? m.offer : m.finish), offer: null };
    }
    draw();
  }

  // ---------- a cena: fornalha, bigorna e a medalha por cima ----------
  // Peças de cenário em SVG leve (só degradês, sem filtros). Pedra e chão usam o tema (CSS); aqui só metal e fogo.
  const rad = (deg) => deg * Math.PI / 180;

  // A boca da fornalha: um arco de pedras baixo, com o fundo em brasa e carvões no chão.
  function furnaceSvg() {
    const id = 'ff' + (++seq) + '-';
    const defs = s('defs');
    const cx = 180, cy = 150, outer = [150, 124], inner = [116, 90];
    const at = ([rx, ry], deg) => [cx + rx * Math.cos(rad(deg)), cy - ry * Math.sin(rad(deg))];
    const arc = ([rx, ry], sweep) => `A${rx} ${ry} 0 0 ${sweep} `;
    const mouth = `M${cx - inner[0]} ${cy}${arc(inner, 1)}${cx + inner[0]} ${cy}Z`;
    const band = `M${cx - outer[0]} ${cy}${arc(outer, 1)}${cx + outer[0]} ${cy}L${cx + inner[0]} ${cy}${arc(inner, 0)}${cx - inner[0]} ${cy}Z`;
    defs.append(s('clipPath', { id: id + 'm' }, s('path', { d: mouth })));
    const deep = grad(defs, id + 'd', [[0, FIRE[1]], [0.28, FIRE[2]], [0.55, FIRE[3]], [0.8, FIRE[4]], [1, FIRE[5]]], { cx: 0.5, cy: 1, r: 1 }, 'radialGradient');
    const heat = grad(defs, id + 'h', [[0, FIRE[0], 0.95], [0.4, FIRE[1], 0.55], [1, FIRE[2], 0]], {}, 'radialGradient');
    const ember = grad(defs, id + 'e', [[0, FIRE[1]], [0.3, FIRE[3]], [0.75, FIRE[4]], [1, COAL[1]]], { x1: 0, y1: 0, x2: 0, y2: 1 });
    const shade = grad(defs, id + 's', [[0.72, '#000', 0], [1, '#000', 0.55]], { cx: 0.5, cy: 1, r: 0.5 }, 'radialGradient');
    const warm = grad(defs, id + 'w', [[0.7, FIRE[2], 0.6], [0.86, FIRE[3], 0]], { cx: 0.5, cy: 1, r: 0.5 }, 'radialGradient');
    // Carvões: duas fileiras de pedaços irregulares (sempre os mesmos).
    let coals = '';
    for (let i = 0; i < 17; i++) {
      const back = i % 2 === 0;
      const x = 66 + i * 14 + (back ? 0 : 3), y = back ? 141 : 150, r = (back ? 8 : 11) + ((i * 7) % 4);
      coals += rounded(Array.from({ length: 7 }, (_, k) => { const a = (k / 7) * Math.PI * 2 + i, rr = r * (0.78 + ((i * 3 + k * 5) % 5) * 0.07); return [x + rr * Math.cos(a), y + rr * 0.7 * Math.sin(a)]; }), 3);
    }
    const stones = s('g', { class: 'ff-stones' });
    const n = 11;
    for (let i = 0; i < n; i++) {
      const a0 = i * 180 / n + 0.8, a1 = (i + 1) * 180 / n - 0.8, keystone = i === (n - 1) / 2;
      const o = keystone ? [outer[0] + 5, outer[1] + 9] : outer;
      stones.append(s('path', { class: 'ff-stone' + (i % 3 === 1 ? ' alt' : ''), d: poly([at(inner, a0), at(o, a0), at(o, (a0 + a1) / 2), at(o, a1), at(inner, a1)]) }));
    }
    return s('svg', { class: 'forja-furnace', viewBox: '0 0 360 150', 'aria-hidden': 'true' }, defs,
      s('path', { d: mouth, fill: COAL[0] }),
      s('path', { class: 'ff-fire', d: mouth, fill: deep }),
      s('g', { 'clip-path': `url(#${id}m)` },
        s('ellipse', { class: 'ff-heat', cx, cy: cy - 4, rx: 104, ry: 46, fill: heat }),
        s('path', { d: coals, fill: COAL[1] }),
        s('path', { class: 'ff-fire', d: coals, fill: ember, stroke: FIRE[4], 'stroke-width': 0.6 })),
      stones,
      s('path', { d: band, fill: shade }),
      s('path', { class: 'ff-warm', d: band, fill: warm }));
  }

  // A bigorna: chifre à esquerda, face polida com borda clara, cintura e pés; a luz do fogo bate na borda de trás.
  function anvilSvg() {
    const id = 'fa' + (++seq) + '-';
    const defs = s('defs');
    // Face de 72 a 192, o degrau (mesa de corte) e o chifre afinando até a ponta, à esquerda.
    const body = 'M72 12L187 12Q192 12 192 17L192 27Q192 31 187 31L164 31Q136 34 131 52Q129 64 150 72L158 78Q161 85 154 85L46 85Q39 85 42 78L50 72Q71 64 69 52Q67 42 60 38Q34 33 7 23Q3 21 6 19Q30 15.5 58 15L70 15L72 12Z';
    const top = 'M6 19Q30 13 58 12.4L72 12.4L72 12L74 9L187 9Q191 9 192 12L72 12L72 15L58 15Q30 15.5 6 19Z';
    const steel = grad(defs, id + 'b', [[0, ANVIL[3]], [0.18, ANVIL[2]], [0.55, ANVIL[1]], [1, ANVIL[0]]], { x1: 0, y1: 0, x2: 0, y2: 1 });
    const side = grad(defs, id + 's', [[0, '#fff', 0.1], [0.45, '#fff', 0], [1, '#000', 0.4]], { x1: 0, y1: 0, x2: 1, y2: 0 });
    const face = grad(defs, id + 'f', [[0, ANVIL[3]], [1, ANVIL[4]]], { x1: 0, y1: 0, x2: 0, y2: 1 });
    const warm = grad(defs, id + 'w', [[0, FIRE[2], 0.7], [0.3, FIRE[3], 0.22], [1, FIRE[3], 0]], { x1: 0, y1: 0, x2: 0, y2: 1 });
    const contact = grad(defs, id + 'c', [[0, '#000', 0.65], [0.55, '#000', 0.3], [1, '#000', 0]], {}, 'radialGradient');
    return s('svg', { class: 'forja-anvil', viewBox: '0 0 200 92', 'aria-hidden': 'true' }, defs,
      s('ellipse', { cx: 100, cy: 86, rx: 80, ry: 6, fill: contact }),
      s('path', { d: body, fill: steel, stroke: ANVIL[0], 'stroke-width': 1, 'stroke-linejoin': 'round' }),
      s('path', { d: body, fill: side }),
      s('path', { class: 'fa-warm', d: body, fill: warm }),
      // A ponte entre os pés e a divisa da face com a cintura.
      s('path', { d: 'M82 85Q100 75 118 85Z', fill: ANVIL[0] }),
      s('path', { d: 'M62 38.5Q100 30 164 31', fill: 'none', stroke: ANVIL[0], 'stroke-opacity': 0.7, 'stroke-width': 1.2 }),
      s('path', { d: 'M61 39Q67 42 69.5 52Q71 64 51 72', fill: 'none', stroke: '#fff', 'stroke-opacity': 0.12, 'stroke-width': 1 }),
      // A face e o chifre vistos um pouco de cima, com a borda da frente clara.
      s('path', { d: top, fill: face }),
      s('path', { d: 'M6 19Q30 15.5 58 15L70 15L72 12L192 12', fill: 'none', stroke: ANVIL[5], 'stroke-opacity': 0.85, 'stroke-width': 0.9, 'stroke-linejoin': 'round' }),
      s('path', { d: 'M72 12.6L192 12.6L192 15.4L72 15.4Z', fill: '#fff', 'fill-opacity': 0.06 }),
      s('path', { class: 'fa-rim', d: 'M6 19Q30 13 58 12.4L72 12.4L74 9L187 9Q191 9 192 12', fill: 'none', stroke: FIRE[1], 'stroke-width': 1.3, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
  }

  // O halo de raios atrás da medalha (e a explosão da revelação), na cor do material.
  function haloSvg(color, rays = 18, cls = 'forja-halo') {
    const id = 'fh' + (++seq) + '-';
    const defs = s('defs');
    const fade = grad(defs, id + 'r', [[0, color, 0.8], [0.38, color, 0.32], [1, color, 0]], { cx: 0, cy: 0, r: 100, gradientUnits: 'userSpaceOnUse' }, 'radialGradient');
    const disc = grad(defs, id + 'd', [[0, color, 0.5], [0.45, color, 0.16], [1, color, 0]], {}, 'radialGradient');
    const g = s('g', { class: 'fh-rays', fill: fade });
    const p = (deg) => [100 * Math.cos(rad(deg)), 100 * Math.sin(rad(deg))];
    for (let i = 0; i < rays; i++) {
      const a = i * 360 / rays, w = i % 2 ? 2 : 4.4;
      g.append(s('path', { d: poly([[0, 0], p(a - w), p(a + w)]), 'fill-opacity': i % 2 ? 0.5 : 1 }));
    }
    return s('svg', { class: cls, viewBox: '-100 -100 200 200', 'aria-hidden': 'true' }, defs, s('circle', { r: 100, fill: disc }), g);
  }

  // O metal derretido por cima da forma, no mesmo viewBox da medalha. Enchendo (sobe de baixo para cima)
  // ou em brasa (cobre a medalha nova: branco, depois vermelho, e some).
  function moltenSvg(key, cooling) {
    const id = 'fz' + (++seq) + '-';
    const defs = s('defs');
    const shape = SHAPE[key] || SHAPE.bronze;
    defs.append(s('clipPath', { id: id + 'c' }, s('path', { d: shape.d, transform: cooling ? null : scaled(0.93) })));
    const clip = s('g', { 'clip-path': `url(#${id}c)` });
    if (!cooling) {
      const melt = grad(defs, id + 'm', [[0, FIRE[0]], [0.22, FIRE[1]], [0.6, FIRE[2]], [1, FIRE[3]]], { x1: 0, y1: 0, x2: 0, y2: 1 });
      clip.append(s('g', { class: 'fz-rise', transform: 'translate(0 120)' },
        s('rect', { x: -10, y: 0, width: 140, height: 150, fill: melt }),
        s('ellipse', { cx: CX, cy: 0.5, rx: 70, ry: 3, fill: '#fff', 'fill-opacity': 0.9 })));
    } else {
      const red = grad(defs, id + 'r', [[0, FIRE[1]], [0.4, FIRE[2]], [0.8, FIRE[3]], [1, FIRE[4]]], { cx: '40%', cy: '35%', r: '75%' }, 'radialGradient');
      const white = grad(defs, id + 'w', [[0, '#fff'], [0.5, FIRE[0]], [1, FIRE[1]]], { cx: '40%', cy: '35%', r: '75%' }, 'radialGradient');
      clip.append(s('rect', { class: 'fz-red', x: 0, y: -4, width: 120, height: 138, fill: red }),
        s('rect', { class: 'fz-white', x: 0, y: -4, width: 120, height: 138, fill: white }));
    }
    return s('svg', { class: 'forja-molten', viewBox: `${VB.x} ${VB.y} ${VB.w} ${VB.h}`, 'aria-hidden': 'true', opacity: cooling ? null : 0 }, defs, cooling ? clip : s('g', { opacity: 0.92 }, clip));
  }

  // O brilho que passa pela medalha na revelação.
  function shineSvg(key) {
    const id = 'fs' + (++seq) + '-';
    const defs = s('defs');
    defs.append(s('clipPath', { id: id + 'c' }, s('path', { d: (SHAPE[key] || SHAPE.bronze).d })));
    const band = grad(defs, id + 'b', [[0, '#fff', 0], [0.5, '#fff', 0.85], [1, '#fff', 0]], { x1: 0, y1: 0, x2: 1, y2: 0 });
    return s('svg', { class: 'forja-shine', viewBox: `${VB.x} ${VB.y} ${VB.w} ${VB.h}`, 'aria-hidden': 'true' }, defs,
      s('g', { 'clip-path': `url(#${id}c)` },
        s('g', { class: 'fs-sweep', transform: 'translate(-80 0)' }, s('rect', { x: 0, y: -40, width: 30, height: 220, fill: band, transform: 'rotate(20 15 70)' }))));
  }

  // A cena do painel. Fria (não forjada: forma escura parada na bigorna), forjada (fogo calmo, a medalha flutua)
  // e, durante a forja, quente (.forging/.hot, ligadas por forgeScene).
  function forgeSet(key, m) {
    const lit = m.level > 0;
    const cinders = Array.from({ length: 7 }, (_, i) => el('span', { class: 'forja-cinder',
      style: { left: (24 + ((i * 41) % 54)) + '%', animationDelay: (-(i * 0.83)).toFixed(2) + 's', animationDuration: (3.8 + (i % 3) * 0.8).toFixed(1) + 's' } }));
    const set = el('div', { class: 'forja-set', ariaHidden: 'true' },
      el('div', { class: 'forja-fire' }), furnaceSvg(), el('div', { class: 'forja-floor' }), cinders,
      el('div', { class: 'forja-beam' }), anvilSvg(), el('div', { class: 'forja-medal-shadow' }));
    const float = el('div', { class: 'forja-float' },
      el('div', { class: 'forja-heat', ariaHidden: 'true' }),
      lit && !animating ? haloSvg(glowOf(key)) : null,
      el('div', { class: 'forja-stage-medal' }, medalSvg(key, m.level, m.finish, 168)));
    const scene = el('div', { class: 'forja-scene' + (lit ? '' : ' cold') + (m.level >= 4 ? ' top' : '') }, set, float);
    scene.style.setProperty('--glow', glowOf(key));
    return follow(scene);
  }

  // ---------- a forja animada ----------
  function finish() {
    animating = false;
    busy = false;
    draw();
    const fresh = host?.querySelector('.forja-stage-medal');
    if (fresh && reducedMotion()) fresh.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 320, easing: 'linear' });
    while (waiting.length) show(waiting.shift());
  }

  // O arco: cristais entram → o metal derretido enche a forma → o martelo bate (hits vezes) → a medalha esfria
  // soltando vapor → um brilho passa e ela sobe da bigorna. Cerca de 3,5 s com 3 batidas.
  function forgeScene(key, level, reveal, hits) {
    animating = true;
    const scene = host?.querySelector('.forja-scene');
    // Sem a tela (a aba fechou) ou com "Reduzir animações": só um fade da medalha nova.
    if (!scene || reducedMotion()) { finish(); return Promise.resolve(); }
    draw(); // tira a escolha antiga e liga o estado de forja
    const stage = host.querySelector('.forja-scene');
    const set = stage.querySelector('.forja-set');
    const float = stage.querySelector('.forja-float');
    const slot = stage.querySelector('.forja-stage-medal');
    stage.classList.remove('cold');
    stage.classList.add('forging');
    for (const b of host.querySelectorAll('.forja-forge, .forja-reforge')) b.disabled = true;
    const ease = EASE(), exit = token('--ease-exit', 'ease-in');
    const lift = parseFloat(getComputedStyle(stage).getPropertyValue('--lift')) || 14;

    // 1. A forma vazia, deitada na bigorna, e os cristais entrando em arco pelos lados.
    const mold = medalSvg(key, 0, null, 168);
    mold.classList.add('forja-mold');
    const melt = moltenSvg(key, false);
    slot.replaceChildren(mold, melt);
    Sounds.play('mudaeForge');
    const box = stage.getBoundingClientRect(), mb = slot.getBoundingClientRect();
    const w = box.width || 400, h = box.height || 280;
    const tx = mb.width ? mb.left - box.left + mb.width / 2 : w / 2;
    const ty = mb.height ? mb.top - box.top + mb.height * 0.54 : h / 2;
    for (let i = 0; i < 10; i++) {
      const gem = el('span', { class: 'forja-fly', ariaHidden: 'true' }, kakera());
      stage.append(gem);
      const side = i % 2 ? 1 : -1;
      const sx = side < 0 ? 18 + (i % 3) * 16 : w - 18 - (i % 3) * 16, sy = h * 0.66 - (i % 4) * 22;
      const ax = (sx + tx) / 2 - side * 12, ay = Math.min(sy, ty) - 76 - (i % 3) * 12;
      const at = (t) => [(1 - t) ** 2 * sx + 2 * (1 - t) * t * ax + t * t * tx, (1 - t) ** 2 * sy + 2 * (1 - t) * t * ay + t * t * ty];
      gem.animate([0, 0.25, 0.5, 0.75, 1].map((t) => {
        const [x, y] = at(t);
        const k = t < 0.75 ? 0.55 + t * 0.8 : 1.15 - (t - 0.75) * 3.6;
        return { transform: `translate(${f(x)}px, ${f(y)}px) rotate(${f(side * 320 * t)}deg) scale(${f(k)})`, opacity: t > 0 && t < 1 ? 1 : 0, offset: t };
      }), { duration: 600, delay: 40 + i * 42, easing: 'cubic-bezier(.4, 0, .7, 1)', fill: 'both' });
      later(700 + i * 42, () => gem.remove());
    }

    // 2. A forja esquenta e o metal derretido enche a forma de baixo para cima.
    later(260, () => stage.classList.add('hot'));
    later(420, () => {
      melt.animate([{ opacity: 0 }, { opacity: 1, offset: 0.12 }, { opacity: 1 }], { duration: 700, easing: 'linear', fill: 'forwards' });
      melt.querySelector('.fz-rise').animate([{ transform: 'translateY(120px)' }, { transform: 'translateY(18px)' }], { duration: 700, easing: 'cubic-bezier(.45, 0, .25, 1)', fill: 'forwards' });
    });

    // 3. O martelo: recua, desce rápido e bate (clarão, anel, faíscas e um tremor), e volta.
    const hammer = el('span', { class: 'forja-hammer', ariaHidden: 'true' }, hammerSvg());
    const first = hits === 1 ? 900 : 1000, gap = 380, swing = 360, impact = 0.58;
    later(first - 220, () => {
      float.append(hammer);
      hammer.animate([{ transform: 'rotate(76deg)', opacity: 0 }, { transform: 'rotate(28deg)', opacity: 1 }], { duration: 220, easing: ease, fill: 'both' });
    });
    for (let n = 0; n < hits; n++) {
      later(first + n * gap, () => {
        hammer.animate([
          { transform: 'rotate(28deg)', easing: 'cubic-bezier(.3, 0, .3, 1)' },
          { transform: 'rotate(42deg)', offset: 0.36, easing: 'cubic-bezier(.6, 0, 1, .7)' },
          { transform: 'rotate(-2deg)', offset: impact, easing: 'cubic-bezier(.1, .6, .3, 1)' },
          { transform: 'rotate(6deg)', offset: 0.7, easing: 'cubic-bezier(.3, 0, .2, 1)' },
          { transform: 'rotate(28deg)' }], { duration: swing, fill: 'both' });
        later(Math.round(swing * impact), () => { Sounds.play('mudaeHammer'); strike(set, float, slot, lift, n === hits - 1); });
      });
    }
    const out = first + (hits - 1) * gap + swing;
    later(out, () => {
      hammer.animate([{ transform: 'rotate(28deg)', opacity: 1 }, { transform: 'rotate(76deg)', opacity: 0 }], { duration: 200, easing: exit, fill: 'forwards' });
      later(210, () => hammer.remove());
    });

    // 4. A medalha nova sai em brasa e esfria soltando vapor; o acabamento só aparece no fim.
    const cool = out + 40, coolFor = 800;
    later(cool, () => {
      stage.classList.remove('hot');
      const medal = medalSvg(key, level, reveal, 168);
      const glow = moltenSvg(key, true);
      slot.replaceChildren(medal, glow);
      // Fita, louros e coroa (fora da placa) também saem em brasa.
      medal.animate([{ filter: 'brightness(1.7) sepia(.9) saturate(4) hue-rotate(-22deg)' }, { filter: 'brightness(1.25) sepia(.5) saturate(2) hue-rotate(-12deg)', offset: 0.55 },
        { filter: 'brightness(1) sepia(0) saturate(1) hue-rotate(0deg)' }], { duration: coolFor, easing: 'linear' });
      glow.querySelector('.fz-white').animate([{ opacity: 1 }, { opacity: 0, offset: 0.4 }, { opacity: 0 }], { duration: coolFor, easing: 'linear', fill: 'forwards' });
      glow.querySelector('.fz-red').animate([{ opacity: 1 }, { opacity: 0.85, offset: 0.45 }, { opacity: 0 }], { duration: coolFor, easing: 'cubic-bezier(.5, 0, .8, .6)', fill: 'forwards' });
      for (let i = 0; i < 7; i++) {
        const puff = el('span', { class: 'forja-steam', ariaHidden: 'true', style: { left: (26 + ((i * 29) % 50)) + '%' } });
        float.append(puff);
        puff.animate([{ transform: 'translate(0, 0) scale(.5)', opacity: 0 }, { opacity: 0.6, offset: 0.25 },
          { transform: `translate(${((i % 3) - 1) * 14}px, -${70 + (i % 3) * 16}px) scale(1.7)`, opacity: 0 }], { duration: 900 + (i % 3) * 120, delay: i * 70, easing: ease, fill: 'both' });
        later(1300 + i * 70, () => puff.remove());
      }
    });

    // 5. A revelação: o brilho passa, os raios estouram (mais no nível IV) e a medalha sobe da bigorna.
    const shown = cool + coolFor - 60, top = level >= 4, tail = top ? 780 : 580;
    later(shown, () => {
      const sweep = shineSvg(key);
      slot.append(sweep);
      sweep.querySelector('.fs-sweep').animate([{ transform: 'translateX(-70px)' }, { transform: 'translateX(150px)' }], { duration: 520, easing: ease, fill: 'both' });
      const burst = haloSvg(glowOf(key), top ? 28 : 18, 'forja-burst');
      float.prepend(burst);
      burst.animate([{ transform: 'scale(.3) rotate(-10deg)', opacity: 0 }, { opacity: 1, offset: 0.2 }, { transform: `scale(${top ? 1.9 : 1.35}) rotate(16deg)`, opacity: 0 }],
        { duration: tail, easing: ease, fill: 'both' });
      const halo = haloSvg(glowOf(key));
      float.insertBefore(halo, slot);
      halo.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 480, easing: ease, fill: 'both' });
      float.animate([{ transform: `translateY(${lift}px)` }, { transform: 'translateY(0)' }], { duration: 520, easing: token('--spring-soft', ease), fill: 'forwards' });
      if (top) {
        const ring = el('span', { class: 'forja-ring gold', ariaHidden: 'true' });
        float.append(ring);
        ring.animate([{ transform: 'scale(.3)', opacity: 1 }, { transform: 'scale(3)', opacity: 0 }], { duration: 700, easing: ease, fill: 'both' });
        sparks(float, 22, 0, 360, 'forja-spark gold', 90);
      }
    });
    return new Promise((done) => later(shown + tail, () => { stage.classList.remove('forging'); finish(); done(); }));
  }

  // Faíscas saindo do ponto da batida: sobem em leque e caem.
  function sparks(into, count, from, spread, cls, reach = 60) {
    for (let i = 0; i < count; i++) {
      const spark = el('span', { class: cls + (i % 3 ? '' : ' long'), ariaHidden: 'true' });
      into.append(spark);
      const deg = from + (spread >= 360 ? (i * 360) / count : -spread / 2 + (i * spread) / (count - 1)) + (i % 2 ? 4 : -4);
      const dist = reach * 0.75 + ((i * 37) % Math.round(reach * 0.9)), dx = Math.cos(rad(deg)) * dist, dy = Math.sin(rad(deg)) * dist;
      const fall = 24 + (i % 4) * 10, turn = dx < 0 ? -1 : 1;
      spark.animate([{ transform: `translate(0, 0) rotate(${f(deg)}deg) scaleX(1.4)`, opacity: 1 },
        { transform: `translate(${f(dx * 0.7)}px, ${f(dy * 0.7)}px) rotate(${f(deg + turn * 12)}deg) scaleX(1)`, opacity: 1, offset: 0.45 },
        { transform: `translate(${f(dx)}px, ${f(dy + fall)}px) rotate(${f(deg + turn * 50)}deg) scaleX(.5)`, opacity: 0 }],
      { duration: 420 + (i % 4) * 80, easing: 'cubic-bezier(.2, .7, .4, 1)', fill: 'forwards' });
      later(760, () => spark.remove());
    }
  }

  // Uma batida: a forma achata, tudo treme um pouco, clarão, anel de impacto e faíscas.
  function strike(set, float, slot, lift, last) {
    const ease = EASE();
    const k = last ? 1.4 : 1;
    slot.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.04, .94)', offset: 0.22 }, { transform: 'scale(.99, 1.01)', offset: 0.6 }, { transform: 'scale(1)' }], { duration: 260, easing: 'linear' });
    const shake = (y0) => [{ transform: `translate(0, ${y0}px)` }, { transform: `translate(${f(1.6 * k)}px, ${f(y0 + 2.6 * k)}px)`, offset: 0.18 },
      { transform: `translate(${f(-1 * k)}px, ${f(y0 - k)}px)`, offset: 0.5 }, { transform: `translate(0, ${y0}px)` }];
    set.animate(shake(0), { duration: 240, easing: 'linear' });
    float.animate(shake(lift), { duration: 240, easing: 'linear' });
    const flash = el('span', { class: 'forja-flash', ariaHidden: 'true' });
    const ring = el('span', { class: 'forja-ring', ariaHidden: 'true' });
    float.append(flash, ring);
    flash.animate([{ transform: 'scale(.4)', opacity: 0 }, { transform: 'scale(1)', opacity: 1, offset: 0.15 }, { transform: 'scale(1.3)', opacity: 0 }], { duration: 300, easing: 'linear', fill: 'both' });
    ring.animate([{ transform: 'scale(.2)', opacity: 0.95 }, { transform: `scale(${last ? 2.1 : 1.6})`, opacity: 0 }], { duration: 440, easing: ease, fill: 'both' });
    later(460, () => { flash.remove(); ring.remove(); });
    sparks(float, 14, -90, 150, 'forja-spark');
  }

  // Martelo de ferreiro deitado: cabeça forjada com chanfros e a face de bater embaixo; cabo de madeira com
  // tira de couro enrolada. Gira pela ponta do cabo (à direita).
  function hammerSvg() {
    const id = 'fh' + (++seq) + '-';
    const defs = s('defs');
    const [dark, light, mid, shine] = HAMMER.head;
    const steel = grad(defs, id + 'h', [[0, light], [0.35, mid], [0.8, dark], [1, dark]], { x1: 0, y1: 0, x2: 1, y2: 0 });
    const faceFill = grad(defs, id + 'f', [[0, shine], [1, light]], { x1: 0, y1: 0, x2: 0, y2: 1 });
    const wood = grad(defs, id + 'w', [[0, HAMMER.grip[2]], [0.45, HAMMER.grip[1]], [1, HAMMER.grip[0]]], { x1: 0, y1: 0, x2: 0, y2: 1 });
    const leather = grad(defs, id + 'l', [[0, HAMMER.wrap[2]], [0.5, HAMMER.wrap[1]], [1, HAMMER.wrap[0]]], { x1: 0, y1: 0, x2: 0, y2: 1 });
    const handle = 'M34 28.6L138 25.6Q148 25.4 148 32Q148 38.6 138 38.4L34 35.4Z';
    defs.append(s('clipPath', { id: id + 'c' }, s('path', { d: handle })));
    const wrap = s('g', { 'clip-path': `url(#${id}c)` });
    for (let i = 0; i < 8; i++) {
      const x = 90 + i * 7.2;
      wrap.append(s('path', { d: poly([[x, 24], [x + 5.6, 24], [x + 9.6, 40], [x + 4, 40]]), fill: leather, stroke: HAMMER.wrap[0], 'stroke-width': 0.6 }));
    }
    return s('svg', { viewBox: '0 0 150 66', width: 150, height: 66 }, defs,
      s('path', { d: handle, fill: wood, stroke: HAMMER.grip[0], 'stroke-width': 0.8 }),
      s('path', { d: 'M40 31.2L132 28.8M46 33.6L122 32.4', stroke: HAMMER.grip[0], 'stroke-opacity': 0.45, 'stroke-width': 0.6 }),
      wrap,
      s('circle', { cx: 143.5, cy: 32, r: 1.5, fill: HAMMER.wrap[0] }),
      s('path', { d: 'M12 4L32 4L36 8L36 52L8 52L8 8Z', fill: steel, stroke: dark, 'stroke-width': 1, 'stroke-linejoin': 'round' }),
      s('path', { d: 'M8 8L12 4L32 4', fill: 'none', stroke: shine, 'stroke-opacity': 0.7, 'stroke-width': 1 }),
      s('path', { d: 'M12 4L14 8L14 50L8 50L8 8Z', fill: '#fff', 'fill-opacity': 0.16 }),
      s('rect', { x: 16, y: 8, width: 3.2, height: 41, rx: 1.6, fill: '#fff', 'fill-opacity': 0.26 }),
      s('path', { d: 'M8 52L36 52L38 54.5L38 60L35 63L9 63L6 60L6 54.5Z', fill: faceFill, stroke: dark, 'stroke-width': 1, 'stroke-linejoin': 'round' }),
      s('path', { d: 'M6 54.5H38', stroke: '#fff', 'stroke-opacity': 0.4, 'stroke-width': 0.7 }),
      s('path', { d: 'M9 62.6H35', stroke: shine, 'stroke-width': 0.8 }),
      s('rect', { x: 32.5, y: 26, width: 7, height: 12, rx: 1.5, fill: mid, stroke: dark, 'stroke-width': 0.8 }),
      s('path', { d: 'M34.5 27.5V36.5', stroke: shine, 'stroke-opacity': 0.5, 'stroke-width': 0.7 }));
  }

  // ---------- a faixa do nível IV (para todo mundo no Salão) ----------
  function flare(data) {
    if (!data || !MEDALS[data.medal]) return;
    if (animating || busy) { waiting.push(data); return; }
    show(data);
  }

  function show({ by, medal, level = 4, finish = null }) {
    const root = document.querySelector('#salon-view');
    if (!root || !root.firstChild) return;
    root.querySelector(':scope > .forja-flare')?.remove();
    const who = (member?.(by)?.name || 'Alguém').toUpperCase();
    const svg = medalSvg(medal, level, finish, 150);
    const node = el('div', { class: 'forja-flare', role: 'status' },
      el('div', { class: 'forja-flare-glow', ariaHidden: 'true' }),
      el('div', { class: 'forja-flare-medal' }, svg),
      el('div', { class: 'forja-flare-text', textContent: `${who} FORJOU A ${nameOf(medal).toUpperCase()} ${ROMAN[level] || 'IV'}!` }));
    root.append(node);
    Sounds.play('mudaeForge');
    if (reducedMotion()) {
      node.animate([{ opacity: 0 }, { opacity: 1, offset: 0.12 }, { opacity: 1, offset: 0.85 }, { opacity: 0 }], { duration: 4000, easing: 'linear', fill: 'forwards' });
    } else {
      const ease = EASE();
      node.animate([{ opacity: 0 }, { opacity: 1, offset: 0.08 }, { opacity: 1, offset: 0.86 }, { opacity: 0 }], { duration: 4000, easing: 'linear', fill: 'forwards' });
      node.querySelector('.forja-flare-medal').animate([{ transform: 'scale(.4) rotate(-12deg)', opacity: 0 }, { transform: 'scale(1.12) rotate(3deg)', opacity: 1, offset: 0.6 }, { transform: 'scale(1) rotate(0)' }], { duration: 620, easing: ease, fill: 'both' });
      node.querySelector('.forja-flare-text').animate([{ transform: 'scaleX(.2)', opacity: 0 }, { transform: 'scaleX(1)', opacity: 1 }], { duration: 420, delay: 180, easing: ease, fill: 'both' });
      for (let i = 0; i < 18; i++) {
        const ember = el('span', { class: 'forja-ember', ariaHidden: 'true', style: { left: (8 + ((i * 53) % 84)) + '%' } });
        node.append(ember);
        ember.animate([{ transform: 'translateY(0) scale(1)', opacity: 0 }, { opacity: 1, offset: 0.2 }, { transform: `translate(${((i % 5) - 2) * 14}px, -${180 + (i % 4) * 50}px) scale(.4)`, opacity: 0 }],
          { duration: 1800 + (i % 3) * 400, delay: (i % 6) * 160, easing: 'linear', fill: 'both' });
      }
    }
    later(4100, () => node.remove());
  }

  // ---------- poderes ----------
  function stageSlots() {
    return el('div', { class: 'forja-stage-slots' }, (powers.slots || []).map((key, i) => el('div', { class: 'forja-stage-slot' + (key ? '' : ' empty') },
      el('span', { class: 'forja-stage-n', textContent: String(i + 1) }), ' ',
      key ? [el('span', { class: 'forja-power-icon', ariaHidden: 'true' }, powerIco(key, 20)), ' ', el('strong', { textContent: POWER[key]?.name || key }), ' ',
        el('span', { class: 'forja-muted', textContent: charge(powers.readyIn?.[key] || 0) })]
        : el('span', { class: 'forja-muted', textContent: 'espaço livre' }))));
  }
  const charge = (ms) => (ms > 0 ? `volta em ${minutes(ms)}` : 'pronto');

  function powerCard(key) {
    const p = POWER[key] || { name: key };
    const open = powers.unlocked?.includes(key);
    const slot = powers.slots?.indexOf(key) ?? -1;
    const node = el('li', { class: 'forja-power' + (open ? ' open' : ' locked') + (slot >= 0 ? ' staged' : ''), data: { power: key } },
      el('span', { class: 'forja-power-badge', ariaHidden: 'true' }, powerIco(key, 26)),
      el('div', { class: 'forja-power-body' },
        el('strong', { class: 'forja-power-name', textContent: p.name }),
        el('span', { class: 'forja-power-does', textContent: p.does || '' })));
    const body = node.lastChild;
    if (!open) {
      const goal = powers.progress?.[key] || { have: 0, need: 1 };
      const pct = Math.round(Math.min(1, goal.have / (goal.need || 1)) * 100);
      body.append(el('span', { class: 'forja-power-goal', textContent: `${p.name}: ${num(goal.have)}/${num(goal.need)} ${POWER_GOAL[key] || ''}`.trim() }),
        el('span', { class: 'forja-bar', role: 'progressbar', ariaValuemin: '0', ariaValuemax: '100', ariaValuenow: String(pct), ariaLabel: 'Progresso de ' + p.name },
          el('i', { style: { width: pct + '%' } })));
      return node;
    }
    if (slot >= 0) {
      body.append(el('span', { class: 'forja-power-state', textContent: `No palco · espaço ${slot + 1} · ${charge(powers.readyIn?.[key] || 0)}` }));
      return node;
    }
    if (picking !== key) {
      body.append(el('button', { type: 'button', class: 'forja-power-equip', textContent: 'Pôr no palco', onclick: () => { picking = key; draw(); } }));
      return node;
    }
    body.append(el('div', { class: 'forja-slot-picks', role: 'group', ariaLabel: 'Em qual espaço?' },
      (powers.slots || []).map((other, i) => el('button', { type: 'button', class: 'forja-slot-pick', onclick: () => equip(i, key) },
        el('span', { class: 'forja-stage-n', textContent: String(i + 1) }), ' · ',
        other ? [powerIco(other, 16), ' ', POWER[other]?.name || other] : 'livre')),
      el('button', { type: 'button', class: 'forja-slot-cancel', textContent: 'Cancelar', onclick: () => { picking = null; draw(); } })),
    el('span', { class: 'forja-power-note', textContent: `chega vazio e enche em ${minutes(powers.rechargeMs || 0)}` }));
    return node;
  }

  async function equip(slot, power) {
    if (busy) return;
    busy = true;
    const res = await call('mudae:powers:equip', { slot, power });
    busy = false;
    if (res) { powers = res; picking = null; }
    draw();
  }

  function powersSection() {
    if (!powers) return el('section', { class: 'forja-powers' }, el('h3', { class: 'forja-section-title', textContent: 'Poderes' }), el('p', { class: 'forja-muted', textContent: 'Carregando…' }));
    return el('section', { class: 'forja-powers' },
      el('div', { class: 'forja-powers-head' },
        el('h3', { class: 'forja-section-title', textContent: 'Poderes' }),
        el('span', { class: 'forja-muted', textContent: `Cada um recarrega em ${minutes(powers.rechargeMs || 0)}. Até 3 no palco.` })),
      stageSlots(),
      el('ul', { class: 'forja-power-list' }, Object.keys(POWER).map(powerCard)));
  }

  return { render, medalSvg, flare };
};
