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
  // A madeira do toco e do cabo da marreta (da casca escura ao topo cortado).
  const WOOD = ['#1f1109', '#3a2112', '#5a3519', '#7a4b26', '#9a6538'];


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

  // ---------- a cena: parede, fornalha, bigorna e a medalha por cima ----------
  // Peças de cenário em SVG leve (só degradês, sem filtros). Tijolo, pedra e chão usam o tema (CSS); aqui só metal, madeira e fogo.
  const rad = (deg) => deg * Math.PI / 180;

  // Um pedaço irregular (carvão), sempre o mesmo para o mesmo i.
  const lump = (x, y, r, i) => rounded(Array.from({ length: 7 }, (_, k) => {
    const a = (k / 7) * Math.PI * 2 + i, rr = r * (0.74 + ((i * 3 + k * 5) % 5) * 0.08);
    return [x + rr * Math.cos(a), y + rr * 0.66 * Math.sin(a)];
  }), Math.max(1.2, r * 0.35));

  // A parede do fundo: tijolos do tema, escurecendo para os cantos de cima; o fogo acende a parte de baixo.
  function wallSvg() {
    const id = 'fw' + (++seq) + '-';
    const defs = s('defs');
    const bricks = s('pattern', { id: id + 'p', width: 72, height: 24, patternUnits: 'userSpaceOnUse' }, s('rect', { class: 'fw-mortar', width: 72, height: 24 }));
    // Quatro fileiras de 6 de altura, as ímpares deslocadas meio tijolo; três tons espalhados.
    for (let row = 0; row < 4; row++) {
      for (let col = -1; col < 3; col++) {
        const x = col * 24 + (row % 2 ? 12 : 0), tone = (row * 5 + col * 7 + 9) % 3;
        bricks.append(s('rect', { class: 'fw-brick t' + tone, x: x + 0.6, y: row * 6 + 0.6, width: 22.8, height: 4.8, rx: 0.8 }));
      }
    }
    defs.append(bricks);
    const glow = grad(defs, id + 'g', [[0, FIRE[2], 0.55], [0.45, FIRE[3], 0.18], [1, FIRE[3], 0]], { cx: 0.5, cy: 1, r: 0.75 }, 'radialGradient');
    const dark = grad(defs, id + 'd', [[0.3, '#000', 0], [1, '#000', 0.72]], { cx: 0.5, cy: 0.8, r: 0.85 }, 'radialGradient');
    return s('svg', { class: 'forja-backwall', viewBox: '0 0 400 300', preserveAspectRatio: 'xMidYMax slice', 'aria-hidden': 'true' }, defs,
      s('rect', { width: 400, height: 300, fill: `url(#${id}p)` }),
      s('rect', { class: 'fw-glow', width: 400, height: 300, fill: glow }),
      s('rect', { width: 400, height: 300, fill: dark }));
  }

  // As ferramentas penduradas na parede: a tenaz à esquerda e a marreta à direita. O fogo fica do lado de dentro,
  // então a borda acesa (ft-rim) é a que olha para o meio.
  function toolSvg(kind) {
    const inward = kind === 'tongs' ? 0.9 : -0.9;
    const rim = (d, w) => s('path', { class: 'ft-rim', d, fill: 'none', stroke: FIRE[2], 'stroke-width': w, 'stroke-linecap': 'round', transform: `translate(${inward} 0)` });
    const iron = (d, w) => s('path', { d, fill: 'none', stroke: ANVIL[1], 'stroke-width': w, 'stroke-linecap': 'round' });
    const peg = [s('circle', { cx: 15, cy: 4, r: 3, fill: ANVIL[0] }), s('circle', { cx: 14.3, cy: 3.3, r: 1, fill: ANVIL[3] })];
    if (kind === 'tongs') {
      const a = 'M12.6 13Q9.6 48 13.6 82Q18.6 92 17.4 105', b = 'M17.4 13Q20.4 48 16.4 82Q11.4 92 12.6 105';
      return s('svg', { class: 'forja-tool tongs', viewBox: '0 0 30 112', 'aria-hidden': 'true' },
        rim('M15 4A5 5 0 1 1 14.9 4', 1.4), rim(a, 2.4), rim(b, 2.4),
        s('circle', { cx: 15, cy: 9, r: 5, fill: 'none', stroke: ANVIL[2], 'stroke-width': 1.5 }),
        iron(a, 2.4), iron(b, 2.4),
        s('path', { d: 'M12.6 13Q9.6 48 13.6 82', fill: 'none', stroke: ANVIL[3], 'stroke-width': 0.6, 'stroke-opacity': 0.7 }),
        s('circle', { cx: 15, cy: 82.4, r: 2.4, fill: ANVIL[2], stroke: ANVIL[0], 'stroke-width': 0.6 }), peg);
    }
    const id = 'ft' + (++seq) + '-';
    const defs = s('defs');
    const wood = grad(defs, id + 'w', [[0, WOOD[1]], [0.45, WOOD[3]], [1, WOOD[0]]], { x1: 0, y1: 0, x2: 1, y2: 0 });
    const head = grad(defs, id + 'h', [[0, ANVIL[4]], [0.35, ANVIL[2]], [1, ANVIL[0]]], { x1: 0, y1: 0, x2: 0, y2: 1 });
    return s('svg', { class: 'forja-tool hammer', viewBox: '0 0 30 112', 'aria-hidden': 'true' }, defs,
      rim('M13 18L13 104', 4), rim('M3.5 7L3.5 17', 1.6),
      s('rect', { x: 12.6, y: 16, width: 4.8, height: 89, rx: 2.2, fill: wood }),
      s('rect', { x: 12.2, y: 90, width: 5.6, height: 14, rx: 2, fill: WOOD[0] }),
      s('path', { d: 'M12.4 93H17.6M12.4 96.5H17.6M12.4 100H17.6', stroke: WOOD[2], 'stroke-width': 0.6 }),
      s('rect', { x: 3, y: 5, width: 24, height: 12, rx: 1.6, fill: head, stroke: ANVIL[0], 'stroke-width': 0.6 }),
      s('rect', { x: 3, y: 5, width: 3, height: 12, rx: 1.2, fill: ANVIL[4], 'fill-opacity': 0.55 }),
      s('rect', { x: 24, y: 5, width: 3, height: 12, rx: 1.2, fill: ANVIL[3], 'fill-opacity': 0.55 }),
      s('circle', { cx: 6, cy: 19.5, r: 2.2, fill: ANVIL[0] }), s('circle', { cx: 24, cy: 19.5, r: 2.2, fill: ANVIL[0] }));
  }

  // A fornalha de tijolos: base, boca em arco com aduelas, soleira e um tampo de pedra. Dentro, o fundo em brasa,
  // as chamas (mexem só pelo CSS) e um monte de carvão com as beiradas acesas.
  function hearthSvg() {
    const id = 'fh' + (++seq) + '-';
    const defs = s('defs');
    const W = 320, H = 170, cx = 160, spring = 92, sill = 136;
    const inner = [110, 52], outer = [128, 68];
    const at = ([rx, ry], deg) => [cx + rx * Math.cos(rad(deg)), spring - ry * Math.sin(rad(deg))];
    const mouth = `M${cx - inner[0]} ${sill}L${cx - inner[0]} ${spring}A${inner[0]} ${inner[1]} 0 0 1 ${cx + inner[0]} ${spring}L${cx + inner[0]} ${sill}Z`;
    const bricks = s('pattern', { id: id + 'p', width: 90, height: 40, patternUnits: 'userSpaceOnUse' }, s('rect', { class: 'fh-mortar', width: 90, height: 40 }));
    for (let row = 0; row < 4; row++) {
      for (let col = -1; col < 4; col++) {
        const x = col * 30 + (row % 2 ? 15 : 0), tone = (row * 2 + col * 5 + 7) % 3;
        bricks.append(s('rect', { class: 'fh-brick t' + tone, x: x + 0.9, y: row * 10 + 0.9, width: 28.2, height: 8.2, rx: 1.2 }));
      }
    }
    defs.append(bricks, s('clipPath', { id: id + 'm' }, s('path', { d: mouth })));
    const deep = grad(defs, id + 'd', [[0, FIRE[1]], [0.25, FIRE[2]], [0.55, FIRE[3]], [0.85, FIRE[4]], [1, FIRE[5]]], { cx: 0.5, cy: 1, r: 0.95 }, 'radialGradient');
    const heat = grad(defs, id + 'h', [[0, FIRE[0], 0.9], [0.4, FIRE[1], 0.5], [1, FIRE[2], 0]], {}, 'radialGradient');
    const flame = grad(defs, id + 'f', [[0, FIRE[1]], [0.3, FIRE[2], 0.95], [0.7, FIRE[3], 0.6], [1, FIRE[3], 0]], { x1: 0, y1: 1, x2: 0, y2: 0 });
    const core = grad(defs, id + 'k', [[0, '#fff', 0.95], [0.35, FIRE[0], 0.9], [1, FIRE[1], 0]], { x1: 0, y1: 1, x2: 0, y2: 0 });
    const coal = grad(defs, id + 'c', [[0, COAL[1]], [1, COAL[0]]], { x1: 0, y1: 0, x2: 0, y2: 1 });
    const ember = grad(defs, id + 'e', [[0, FIRE[1]], [0.35, FIRE[2]], [0.8, FIRE[3]], [1, FIRE[4]]], { cx: 0.45, cy: 0.35, r: 0.7 }, 'radialGradient');
    const warm = grad(defs, id + 'w', [[0.25, FIRE[2], 0.5], [0.6, FIRE[3], 0.16], [1, FIRE[3], 0]], { cx: 0.5, cy: 0.78, r: 0.6 }, 'radialGradient');
    const sides = grad(defs, id + 's', [[0, '#000', 0.6], [0.16, '#000', 0], [0.84, '#000', 0], [1, '#000', 0.6]], { x1: 0, y1: 0, x2: 1, y2: 0 });
    const foot = grad(defs, id + 'b', [[0.7, '#000', 0], [1, '#000', 0.45]], { x1: 0, y1: 0, x2: 0, y2: 1 });

    // As chamas: duas camadas (as de fora, laranja; os miolos, quase brancos), cada uma no seu ritmo.
    const tongue = (x, w, h, lean) => `M${f(x - w / 2)} ${sill}C${f(x - w / 2)} ${f(sill - h * 0.45)} ${f(x - w * 0.15 + lean)} ${f(sill - h * 0.62)} ${f(x + lean)} ${f(sill - h)}C${f(x + w * 0.22 + lean)} ${f(sill - h * 0.6)} ${f(x + w / 2)} ${f(sill - h * 0.4)} ${f(x + w / 2)} ${sill}Z`;
    const flames = s('g', { class: 'ff-flames' });
    const outerFlames = [[-96, 22, 40, -3], [-70, 28, 58, 2], [-42, 26, 50, -2], [-14, 30, 64, 3], [14, 28, 56, -3], [42, 30, 66, 2], [70, 26, 52, -2], [96, 22, 42, 3]];
    outerFlames.forEach(([dx, w, h, lean], i) => flames.append(s('path', { class: 'ff-flame', d: tongue(cx + dx, w, h, lean), fill: flame,
      style: `animation-duration:${(0.9 + (i % 3) * 0.22).toFixed(2)}s;animation-delay:-${(i * 0.37).toFixed(2)}s` })));
    outerFlames.forEach(([dx, w, h, lean], i) => flames.append(s('path', { class: 'ff-flame', d: tongue(cx + dx + lean, w * 0.45, h * 0.55, -lean), fill: core,
      style: `animation-duration:${(0.7 + (i % 2) * 0.25).toFixed(2)}s;animation-delay:-${(i * 0.29).toFixed(2)}s` })));

    // O monte de carvão: fileiras de trás (mais altas e estreitas) primeiro; em cima, metade em brasa; embaixo, um em três.
    let dark = '', glowing = '';
    let n = 0;
    for (let row = 3; row >= 0; row--) {
      const count = 16 - row * 3, half = 106 - row * 22, y = sill - 2 - row * 6.5, r = 7.5 - row * 0.8;
      for (let i = 0; i < count; i++) {
        const x = cx - half + (2 * half * (i + 0.5)) / count + ((n * 7) % 5) - 2;
        const d = lump(x, y + ((n * 3) % 3), r + ((n * 5) % 3) * 0.6, n);
        if (row >= 2 ? n % 2 === 0 : n % 3 === 1) glowing += d; else dark += d;
        n++;
      }
    }

    const stones = s('g');
    const count = 11;
    for (let i = 0; i < count; i++) {
      const a0 = i * 180 / count + 0.7, a1 = (i + 1) * 180 / count - 0.7, keystone = i === (count - 1) / 2;
      const o = keystone ? [outer[0] + 4, outer[1] + 8] : outer;
      stones.append(s('path', { class: 'ff-stone' + (i % 3 === 1 ? ' alt' : ''), d: poly([at(inner, a0), at(o, a0), at(o, (a0 + a1) / 2), at(o, a1), at(inner, a1)]) }));
    }
    // As ombreiras: dois blocos de cada lado da boca, da nascença do arco até a soleira.
    for (const side of [-1, 1]) {
      const x0 = side < 0 ? cx - outer[0] : cx + inner[0] + 0.7, x1 = side < 0 ? cx - inner[0] - 0.7 : cx + outer[0];
      stones.append(s('path', { class: 'ff-stone alt', d: poly([[x0, spring + 0.7], [x1, spring + 0.7], [x1, 113.3], [x0, 113.3]]) }),
        s('path', { class: 'ff-stone', d: poly([[x0, 114.7], [x1, 114.7], [x1, sill], [x0, sill]]) }));
    }

    return s('svg', { class: 'forja-hearth', viewBox: `0 0 ${W} ${H}`, 'aria-hidden': 'true' }, defs,
      // O corpo de tijolos, com as laterais e o pé mais escuros.
      s('rect', { x: 8, y: 22, width: 304, height: H - 22, fill: `url(#${id}p)` }),
      s('rect', { x: 8, y: 22, width: 304, height: H - 22, fill: sides }),
      s('rect', { x: 8, y: 22, width: 304, height: H - 22, fill: foot }),
      // Dentro da boca.
      s('path', { d: mouth, fill: COAL[0] }),
      s('g', { 'clip-path': `url(#${id}m)` },
        s('ellipse', { class: 'ff-fire', cx, cy: sill, rx: 130, ry: 96, fill: deep }),
        s('ellipse', { class: 'ff-heat', cx, cy: sill - 8, rx: 100, ry: 40, fill: heat }),
        flames,
        s('path', { d: dark, fill: coal }),
        s('path', { class: 'ff-fire', d: dark, fill: 'none', stroke: FIRE[3], 'stroke-width': 0.9 }),
        s('path', { class: 'ff-fire', d: glowing, fill: ember, stroke: FIRE[1], 'stroke-width': 0.5 }),
        s('path', { d: mouth, fill: 'none', stroke: '#000', 'stroke-opacity': 0.55, 'stroke-width': 9 })),
      stones,
      // A soleira, um pouco para fora, e o tampo de pedra visto um pouco de cima.
      s('path', { class: 'fh-sill', d: poly([[cx - inner[0] - 10, sill], [cx + inner[0] + 10, sill], [cx + inner[0] + 13, sill + 7], [cx - inner[0] - 13, sill + 7]]) }),
      s('path', { class: 'fh-sill-top', d: `M${cx - inner[0] - 10} ${sill + 0.4}L${cx + inner[0] + 10} ${sill + 0.4}` }),
      s('path', { class: 'fh-cap', d: poly([[2, 14], [318, 14], [318, 24], [2, 24]]) }),
      s('path', { class: 'fh-cap-top', d: poly([[7, 8.5], [313, 8.5], [318, 14], [2, 14]]) }),
      s('path', { class: 'ff-warm', d: `M8 24H312V${H}H8Z`, fill: warm }));
  }

  // O chão de lajes em perspectiva: as juntas apontam para o meio do fundo.
  function floorSvg() {
    const id = 'fl' + (++seq) + '-';
    const defs = s('defs');
    const mid = 11.5;
    const xAt = (x, y) => 300 + (x - 300) * (0.6 + 0.4 * y / 30);
    let seams = `M0 ${mid}L600 ${mid}`;
    for (let x = -360; x <= 960; x += 60) {
      seams += `M${f(xAt(x, 0))} 0L${f(xAt(x, mid))} ${mid}`;
      seams += `M${f(xAt(x + 30, mid))} ${mid}L${x + 30} 30`;
    }
    const glow = grad(defs, id + 'g', [[0, FIRE[2], 0.42], [1, FIRE[3], 0]], { cx: 0.5, cy: 0, r: 0.42 }, 'radialGradient');
    const shade = grad(defs, id + 's', [[0, '#000', 0.35], [0.5, '#000', 0], [1, '#000', 0.3]], { x1: 0, y1: 0, x2: 0, y2: 1 });
    return s('svg', { class: 'forja-floor', viewBox: '0 0 600 30', preserveAspectRatio: 'xMidYMin slice', 'aria-hidden': 'true' }, defs,
      s('rect', { class: 'fl-stone', width: 600, height: 30 }),
      s('path', { class: 'fl-seam', d: seams }),
      s('rect', { class: 'fl-glow', width: 600, height: 30, fill: glow }),
      s('rect', { width: 600, height: 30, fill: shade }),
      s('path', { class: 'fl-edge', d: 'M0 0.5H600' }));
  }

  // A bigorna em cima do toco: chifre à esquerda, mesa de corte, a face de aço vista um pouco de cima (com o
  // furo quadrado e o redondo), cintura e pés. O fogo atrás acende as bordas (fa-rim); a face fica a 0,41 da
  // largura acima do pé do toco e o meio dela em x = 132 (o CSS conta com isso).
  function anvilSvg() {
    const id = 'fa' + (++seq) + '-';
    const defs = s('defs');
    const body = 'M16 16.5Q40 13.6 64 13L78 13L78 10L193 10Q196 10 196 13L196 21Q196 23 193 23.5Q176 25 166 32Q156 38 154 46Q154 55 166 60L176 62.5Q180 63.5 179 66L178 67L86 67L85 66Q84 63.5 88 62.5L98 60Q110 55 110 46Q108 36 94 32Q76 28 60 27Q34 24 18 19.4Q12 18 16 16.5Z';
    defs.append(s('clipPath', { id: id + 'c' }, s('path', { d: body })));
    const steel = grad(defs, id + 'b', [[0, ANVIL[3]], [0.2, ANVIL[2]], [0.6, ANVIL[1]], [1, ANVIL[0]]], { x1: 0, y1: 0, x2: 0, y2: 1 });
    const waist = grad(defs, id + 'r', [[0, '#000', 0.5], [0.32, '#fff', 0.07], [0.5, '#fff', 0.13], [1, '#000', 0.55]], { x1: 86, y1: 0, x2: 180, y2: 0, gradientUnits: 'userSpaceOnUse' });
    const under = grad(defs, id + 'u', [[0, '#000', 0.6], [1, '#000', 0]], { x1: 0, y1: 0, x2: 0, y2: 1 });
    const plate = grad(defs, id + 'p', [[0, ANVIL[4]], [0.25, ANVIL[3]], [1, ANVIL[1]]], { x1: 0, y1: 0, x2: 0, y2: 1 });
    const horn = grad(defs, id + 'h', [[0, ANVIL[4]], [0.3, ANVIL[3]], [0.7, ANVIL[1]], [1, ANVIL[0]]], { x1: 0, y1: 0, x2: 0, y2: 1 });
    const top = grad(defs, id + 't', [[0, ANVIL[3]], [0.6, ANVIL[4]], [1, ANVIL[5]]], { x1: 0, y1: 0, x2: 0, y2: 1 });
    const polish = grad(defs, id + 'o', [[0, '#fff', 0], [0.5, '#fff', 0.35], [1, '#fff', 0]], { x1: 0, y1: 0, x2: 1, y2: 0 });
    const warm = grad(defs, id + 'w', [[0, FIRE[2], 0.6], [0.3, FIRE[3], 0.2], [1, FIRE[3], 0]], { x1: 0, y1: 0, x2: 0, y2: 1 });
    const trunk = grad(defs, id + 'k', [[0, WOOD[0]], [0.22, WOOD[2]], [0.42, WOOD[3]], [0.72, WOOD[2]], [1, WOOD[0]]], { x1: 80, y1: 0, x2: 184, y2: 0, gradientUnits: 'userSpaceOnUse' });
    const trunkShade = grad(defs, id + 'q', [[0, '#000', 0.1], [1, '#000', 0.5]], { x1: 0, y1: 0, x2: 0, y2: 1 });
    const band = grad(defs, id + 'a', [[0, ANVIL[4]], [0.4, ANVIL[2]], [1, ANVIL[0]]], { x1: 0, y1: 0, x2: 0, y2: 1 });
    const ground = grad(defs, id + 'g', [[0, '#000', 0.7], [0.6, '#000', 0.3], [1, '#000', 0]], {}, 'radialGradient');
    const rimLine = (d, w, color = FIRE[1], extra = {}) => s('path', { class: 'fa-rim', d, fill: 'none', stroke: color, 'stroke-width': w, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', ...extra });
    const stump = 'M84 66.5L180 66.5Q181.5 79 184 92L80 92Q82.5 79 84 66.5Z';

    return s('svg', { class: 'forja-anvil', viewBox: '0 0 200 92', 'aria-hidden': 'true' }, defs,
      s('ellipse', { cx: 132, cy: 91.5, rx: 62, ry: 3.5, fill: ground }),
      // O toco: madeira com veios, um aro de ferro com rebites e o topo cortado.
      s('path', { d: stump, fill: trunk }),
      s('path', { d: stump, fill: trunkShade }),
      s('path', { d: 'M95 68Q93.5 80 91.5 91M108 68Q108.6 80 107 91M121 68Q120 79 121.5 91M141 68Q142 80 140.5 91M156 68Q157.6 79 157 91M170 68Q171.5 80 173 91', fill: 'none', stroke: WOOD[0], 'stroke-opacity': 0.55, 'stroke-width': 0.7 }),
      s('path', { d: 'M82.7 76.4L181.3 76.4L181.8 80.9L82.2 80.9Z', fill: band, stroke: ANVIL[0], 'stroke-width': 0.4 }),
      [92, 112, 132, 152, 172].map((x) => s('circle', { cx: x, cy: 78.65, r: 0.9, fill: ANVIL[4] })),
      s('ellipse', { cx: 132, cy: 66.6, rx: 48, ry: 2.3, fill: WOOD[4] }),
      s('ellipse', { cx: 132, cy: 66.6, rx: 40, ry: 1.6, fill: 'none', stroke: WOOD[2], 'stroke-width': 0.4 }),
      rimLine('M84 66.5Q82.5 79 80 92', 0.9, FIRE[2]), rimLine('M180 66.5Q181.5 79 184 92', 0.9, FIRE[2]),
      s('ellipse', { cx: 132, cy: 67, rx: 47, ry: 1.7, fill: '#000', 'fill-opacity': 0.6 }),
      // O corpo de aço, com a cintura arredondada e a sombra embaixo da face.
      s('path', { d: body, fill: steel, stroke: ANVIL[0], 'stroke-width': 0.8, 'stroke-linejoin': 'round' }),
      s('g', { 'clip-path': `url(#${id}c)` },
        s('rect', { x: 84, y: 19, width: 98, height: 50, fill: waist }),
        s('rect', { x: 60, y: 23.5, width: 140, height: 9, fill: under }),
        s('rect', { class: 'fa-warm', x: 0, y: 0, width: 200, height: 70, fill: warm })),
      s('path', { d: 'M118 67Q132 58.5 146 67Z', fill: ANVIL[0] }),
      s('path', { d: 'M88.5 62.6L175.5 62.6', stroke: ANVIL[3], 'stroke-opacity': 0.5, 'stroke-width': 0.6 }),
      // O chifre (um cone, com o brilho em cima), a mesa e a placa da face, de frente.
      s('path', { d: 'M16 16.5Q40 13.6 64 13L64 27Q34 24 18 19.4Q12 18 16 16.5Z', fill: horn }),
      s('path', { d: 'M22 16.4Q42 14.9 62 14.5', fill: 'none', stroke: ANVIL[5], 'stroke-opacity': 0.55, 'stroke-width': 0.8, 'stroke-linecap': 'round' }),
      s('path', { d: 'M64 13L78 13L78 23.5L64 24.5Z', fill: plate }),
      s('path', { d: 'M78 10L193 10Q196 10 196 13L196 21Q196 23 193 23.5L78 23.5Z', fill: plate }),
      s('path', { d: 'M78 23.5L193 23.5M64 24.5L78 23.5', fill: 'none', stroke: ANVIL[0], 'stroke-width': 0.8 }),
      // Os tampos vistos de cima: chifre, mesa e a face polida, com os dois furos perto do calcanhar.
      s('path', { d: 'M16 16.5Q40 11.8 66.5 8.5L64 13Q40 13.6 16 16.5Z', fill: top }),
      s('path', { d: 'M64 13L66.5 8.5L80.5 8.5L78 13Z', fill: top }),
      s('path', { d: 'M78 10L80.5 5.5L189 5.5Q194 5.5 196 10Z', fill: top }),
      s('path', { d: 'M96 9.6L98 6L168 6L168 9.6Z', fill: polish }),
      s('path', { d: 'M172 6.4L178.6 6.4L179.3 8.9L172.5 8.9Z', fill: ANVIL[0] }),
      s('ellipse', { cx: 162.5, cy: 7.7, rx: 1.5, ry: 0.8, fill: ANVIL[0] }),
      s('path', { d: 'M78 10L196 10', stroke: ANVIL[5], 'stroke-width': 0.8 }),
      s('path', { d: 'M16 16.5Q40 13.6 64 13L78 13', fill: 'none', stroke: ANVIL[5], 'stroke-opacity': 0.5, 'stroke-width': 0.6 }),
      // A luz do fogo, de trás: a borda de trás dos tampos e o contorno da cintura.
      rimLine('M16 16.5Q40 11.8 66.5 8.5L80.5 8.5L80.5 5.5L189 5.5Q194 5.5 196 10', 1.1),
      rimLine('M193 23.5Q176 25 166 32Q156 38 154 46Q154 55 166 60', 0.9, FIRE[2], { 'stroke-opacity': 0.7 }),
      rimLine('M18 19.4Q34 24 60 27Q76 28 94 32Q108 36 110 46Q110 55 98 60', 0.9, FIRE[2], { 'stroke-opacity': 0.7 }));
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
      wallSvg(), toolSvg('tongs'), toolSvg('hammer'), el('div', { class: 'forja-fire' }), hearthSvg(), floorSvg(), cinders,
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
