/* Mudae: o desenho das 7 medalhas da Forja (silhueta, relevo do metal, pedra lapidada, acabamentos e os enfeites
   de cada nível: fita, louros, coroa). Só desenha; quem decide nível e acabamento é o servidor. A Forja (mudae-forja.js)
   entrega medalSvg para a parede, o perfil, o $forja do chat e o ranking, e usa os mesmos contornos na animação. */
window.MudaeMedals = function (ui) {
  const NS = 'http://www.w3.org/2000/svg';
  const MEDALS = ui.MEDALS;
  const KEYS = Object.keys(MEDALS);
  const FINISHES = ui.FINISHES;
  const ROMAN = ui.ROMAN;
  const FINISH_RARITY = { metal: 'common', esmalte: 'rare', holo: 'epic', galaxia: 'legendary' };

  // ---------- os materiais (o único lugar com cores próprias: metal e pedra não existem no tema) ----------
  // metal: do mais escuro ao brilho, para o aro, o chanfro e o campo. gem: brilho, claro, médio e fundo da pedra.
  // enamel: o esmalte (claro, médio, escuro). ribbon: a fita do nível II (tecido e listra).
  const MATERIALS = {
    bronze: { metal: ['#3d1c0b', '#7a3f1d', '#c27a45', '#f2b98a', '#9a5428', '#52280f'], ink: '#2a1206',
      enamel: ['#5eead4', '#0f9488', '#0b4a45'], ribbon: ['#9f1d2b', '#e9c46a'] },
    prata: { metal: ['#363c45', '#7d8693', '#d5dce5', '#ffffff', '#9aa4b1', '#4b525d'], ink: '#1e232a',
      enamel: ['#93b4ff', '#2f5bd8', '#162e78'], ribbon: ['#1e3a8a', '#e5e7eb'] },
    ouro: { metal: ['#4d3105', '#9a6a0c', '#e8b93a', '#fff3b8', '#c88e17', '#5f3f07'], ink: '#2e1d02',
      enamel: ['#ff8a8a', '#c81d3a', '#5c0a1b'], ribbon: ['#7c1d1d', '#f5d06b'] },
    safira: { metal: ['#28313d', '#6f8197', '#cfdbe8', '#ffffff', '#8ea2b8', '#3b4757'], ink: '#141b24',
      gem: ['#e0ecff', '#5b9dff', '#1844c4', '#07154f'], enamel: ['#fff1a8', '#f0b41a', '#7a4f00'], ribbon: ['#0b2a6b', '#cfdbe8'] },
    rubi: { metal: ['#43180f', '#975040', '#e6a48c', '#ffe3d6', '#b86c56', '#5a2418'], ink: '#250b06',
      gem: ['#ffe1e7', '#ff5c7d', '#c0103a', '#4a0216'], enamel: ['#ffffff', '#e9ecf2', '#8f99ab'], ribbon: ['#5a0a1e', '#f0b8a6'] },
    esmeralda: { metal: ['#4a3606', '#957016', '#e2bf52', '#fff2bf', '#bb9024', '#5e450a'], ink: '#2a1e03',
      gem: ['#d9ffef', '#3fe0a0', '#0a8a5c', '#023322'], enamel: ['#8fb6ff', '#1f4fd6', '#0b1f66'], ribbon: ['#064e3b', '#f2d27a'] },
    diamante: { metal: ['#2b3139', '#86919f', '#e6edf5', '#ffffff', '#aab6c4', '#454e5a'], ink: '#161a20',
      gem: ['#ffffff', '#dff4ff', '#9cc8ef', '#4a6f96'], enamel: ['#d9c2ff', '#7c3aed', '#2e1065'], ribbon: ['#1f2937', '#cbd5e1'] },
  };
  const GOLD = ['#4d3105', '#9a6a0c', '#e8b93a', '#fff3b8', '#c88e17', '#5f3f07']; // coroa e aro da galáxia
  const SHADOW = ['#101114', '#24262b', '#3a3d44', '#4a4e57', '#2c2f35', '#141518']; // medalha ainda não forjada
  const HOLO = ['#ff5ec8', '#ffd76a', '#6affb8', '#5ecbff', '#a77bff', '#ff5ec8', '#ffd76a', '#6affb8'];
  const NEBULA = ['#0a0620', '#1c1048', '#3b1a6e'];
  // A luz de cada medalha (halo, foco): a pedra nas medalhas de pedra, o metal claro nas outras.
  const glowOf = (key) => { const m = MATERIALS[key] || MATERIALS.bronze; return m.gem ? m.gem[1] : m.metal[2]; };

  // ---------- desenho das medalhas ----------
  // Tudo é degradê e forma (nada de filtro por medalha), e as facetas da mesma cor viram um caminho só,
  // porque a parede desenha 7 medalhas e o perfil várias. Abaixo de 56 px some o enfeite fino; abaixo de 40, mais ainda.
  const VB = { x: 0, y: -4, w: 120, h: 138 };
  const CX = 60, CY = 70, R = 40;
  const PI = Math.PI;
  let seq = 0;
  function s(tag, attrs = {}, ...children) {
    const node = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) if (v != null && v !== false) node.setAttribute(k, String(v));
    for (const c of children.flat()) if (c) node.append(c);
    return node;
  }
  const f = (n) => Math.round(n * 100) / 100;
  const polar = (r, deg, cx = CX, cy = CY) => [cx + r * Math.cos(deg * PI / 180), cy + r * Math.sin(deg * PI / 180)];
  const poly = (pts) => 'M' + pts.map(([x, y]) => f(x) + ' ' + f(y)).join('L') + 'Z';
  const circ = (r, cx = CX, cy = CY) => `M${f(cx)} ${f(cy - r)}A${f(r)} ${f(r)} 0 1 1 ${f(cx)} ${f(cy + r)}A${f(r)} ${f(r)} 0 1 1 ${f(cx)} ${f(cy - r)}Z`;
  const unit = (x, y) => { const l = Math.hypot(x, y) || 1; return [x / l, y / l]; };
  // Mistura duas cores (#rgb ou #rrggbb).
  const rgb = (c) => { const h = c.length === 4 ? c.slice(1).split('').map((x) => x + x).join('') : c.slice(1); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)); };
  const mix = (a, b, t) => { const A = rgb(a), B = rgb(b); return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join(''); };
  // Polígono com as quinas arredondadas (rad = quanto da quina vira curva).
  function rounded(pts, rad) {
    const n = pts.length;
    let d = '';
    for (let i = 0; i < n; i++) {
      const [px, py] = pts[(i - 1 + n) % n], [x, y] = pts[i], [nx, ny] = pts[(i + 1) % n];
      const cut = (ax, ay) => { const len = Math.hypot(ax - x, ay - y) || 1; const k = Math.min(rad, len / 2) / len; return [x + (ax - x) * k, y + (ay - y) * k]; };
      const a = cut(px, py), b = cut(nx, ny);
      d += (i ? 'L' : 'M') + f(a[0]) + ' ' + f(a[1]) + 'Q' + f(x) + ' ' + f(y) + ' ' + f(b[0]) + ' ' + f(b[1]);
    }
    return d + 'Z';
  }
  const ring = (n, r, start = -90, rx = r, ry = r) => Array.from({ length: n }, (_, i) => { const a = (start + i * 360 / n) * PI / 180; return [CX + rx * Math.cos(a), CY + ry * Math.sin(a)]; });
  // Pontos do contorno (para saber até onde a medalha vai em cada direção). Arcos entram só pelo ponto final.
  function flatten(d) {
    const tok = d.match(/[A-Za-z]|-?\d*\.?\d+/g) || [];
    const out = [];
    let i = 0, cmd = '', x = 0, y = 0;
    const num = () => +tok[i++];
    while (i < tok.length) {
      if (/[A-Za-z]/.test(tok[i])) cmd = tok[i++];
      if (cmd === 'Z') continue;
      if (cmd === 'M') { x = num(); y = num(); out.push([x, y]); } else if (cmd === 'L') {
        const ex = num(), ey = num();
        for (let k = 1; k <= 6; k++) out.push([x + (ex - x) * k / 6, y + (ey - y) * k / 6]);
        x = ex; y = ey;
      } else if (cmd === 'Q') {
        const qx = num(), qy = num(), ex = num(), ey = num();
        for (let k = 1; k <= 6; k++) { const t = k / 6, u = 1 - t; out.push([u * u * x + 2 * u * t * qx + t * t * ex, u * u * y + 2 * u * t * qy + t * t * ey]); }
        x = ex; y = ey;
      } else if (cmd === 'A') { i += 5; x = num(); y = num(); out.push([x, y]); } else i++;
    }
    return out;
  }

  // A silhueta de cada medalha ("top" diz onde a coroa assenta; "pts" são as quinas, para as facetas).
  const SHAPES = {
    // Roseta de borda ondulada (pts: vale e crista de cada onda, para sombrear onda por onda).
    bronze: () => {
      const n = 18; let d = '';
      const pts = [];
      for (let i = 0; i < n; i++) {
        const a0 = -90 + i * 360 / n, a1 = a0 + 360 / n;
        const p0 = polar(R - 1.5, a0), c = polar(R + 4.5, (a0 + a1) / 2), p1 = polar(R - 1.5, a1);
        d += (i ? '' : 'M' + f(p0[0]) + ' ' + f(p0[1])) + 'Q' + f(c[0]) + ' ' + f(c[1]) + ' ' + f(p1[0]) + ' ' + f(p1[1]);
        pts.push(p0, polar(R + 1.5, (a0 + a1) / 2));
      }
      return { d: d + 'Z', top: CY - R - 2, pts };
    },
    // Escudo.
    prata: () => ({ d: `M${CX - R * 0.9} ${CY - R * 0.86}Q${CX} ${CY - R * 1.18} ${CX + R * 0.9} ${CY - R * 0.86}L${CX + R * 0.9} ${CY - R * 0.05}`
      + `Q${CX + R * 0.86} ${CY + R * 0.72} ${CX} ${CY + R * 1.1}Q${CX - R * 0.86} ${CY + R * 0.72} ${CX - R * 0.9} ${CY - R * 0.05}Z`, top: CY - R * 1.02 }),
    // Sol: borda de raios.
    ouro: () => { const pts = Array.from({ length: 40 }, (_, i) => polar(i % 2 ? R * 0.9 : R * 1.04, -90 + i * 9)); return { d: rounded(pts, 0.8), top: CY - R * 1.02, pts }; },
    // Hexágono.
    safira: () => { const pts = ring(6, R * 1.06); return { d: rounded(pts, 6), top: CY - R * 1.0, pts }; },
    // Cruz de braços abertos com um disco no meio (as duas formas giram no mesmo sentido, então se somam).
    rubi: () => {
      const pts = [];
      for (let k = 0; k < 4; k++) {
        const a = -90 + k * 90;
        pts.push(polar(R * 0.34, a - 45), polar(R * 1.04, a - 23), polar(R * 0.9, a), polar(R * 1.04, a + 23));
      }
      const r = R * 0.64;
      const disc = `M${CX} ${f(CY - r)}A${f(r)} ${f(r)} 0 1 1 ${CX} ${f(CY + r)}A${f(r)} ${f(r)} 0 1 1 ${CX} ${f(CY - r)}Z`;
      return { d: rounded(pts, 3) + disc, top: CY - R * 0.98, pts };
    },
    // Octógono alto, como o corte esmeralda.
    esmeralda: () => {
      const w = R * 0.86, h = R * 1.06, c = R * 0.34;
      const pts = [[CX - w + c, CY - h], [CX + w - c, CY - h], [CX + w, CY - h + c], [CX + w, CY + h - c], [CX + w - c, CY + h], [CX - w + c, CY + h], [CX - w, CY + h - c], [CX - w, CY - h + c]];
      return { d: rounded(pts, 4), top: CY - h, pts };
    },
    // Estrela de ordem, de 8 pontas.
    diamante: () => { const pts = Array.from({ length: 16 }, (_, i) => polar(i % 2 ? R * 0.76 : R * 1.1, -90 + i * 22.5)); return { d: rounded(pts, 1.6), top: CY - R * 1.1, pts }; },
  };
  const SHAPE = Object.fromEntries(KEYS.map((k) => {
    const sh = SHAPES[k]();
    return [k, { ...sh, outline: flatten(sh.d).concat(k === 'rubi' ? ring(48, R * 0.64) : []) }];
  }));
  const scaled = (k) => `translate(${CX} ${CY}) scale(${k}) translate(${-CX} ${-CY})`;
  // Até onde a silhueta vai numa direção (graus; 0 = direita, 90 = baixo).
  function reach(medal, deg) {
    let best = 0;
    for (const [x, y] of SHAPE[medal].outline) {
      const a = Math.atan2(y - CY, x - CX) * 180 / PI;
      if (Math.abs(((a - deg) % 360 + 540) % 360 - 180) < 6) best = Math.max(best, Math.hypot(x - CX, y - CY));
    }
    return best;
  }

  // As camadas da borda de cada medalha, de fora para dentro: aro alto (a silhueta), descida (slope, no degradê
  // invertido), aro de dentro (inner), a fileira de contas ou de entalhes (deco) e o campo rebaixado (field).
  // { k } é a silhueta encolhida; { r } é um círculo. fan: cada ponta/onda ganha um lado claro e um escuro
  // ('rim' só na borda, 'all' por cima do campo também). chamfer: o chanfro facetado dos polígonos.
  const FRAME = {
    bronze: { fan: 'rim', slope: { r: R * 0.87 }, inner: { r: R * 0.81 }, deco: ['pearl', { r: R * 0.755 }, 30], field: { r: R * 0.69 } },
    prata: { slope: { k: 0.93 }, inner: { k: 0.87 }, deco: ['mill', { k: 0.825 }, 64], field: { k: 0.78 } },
    ouro: { fan: 'rim', slope: { r: R * 0.8 }, inner: { r: R * 0.745 }, deco: ['pearl', { r: R * 0.69 }, 28], field: { r: R * 0.635 } },
    safira: { chamfer: 0.88, inner: { k: 0.88 }, deco: ['pearl', { k: 0.83 }, 36], field: { k: 0.77 } },
    rubi: { fan: 'all', inner: { k: 0.89 }, field: { k: 0.8 }, pearls: R * 0.44 * 1.16 + 2.7 },
    esmeralda: { chamfer: 0.88, inner: { k: 0.88 }, deco: ['mill', { k: 0.83 }, 60], field: { k: 0.775 } },
    diamante: { fan: 'all', inner: { k: 0.89 }, field: { k: 0.8 }, pearls: R * 0.47 * 1.16 + 2.5 },
  };

  // Emblemas gravados das medalhas de metal (unidade: -1 a 1).
  const EMBLEMS = {
    bronze: () => poly(Array.from({ length: 10 }, (_, i) => { const a = (-90 + i * 36) * PI / 180, r = i % 2 ? 0.42 : 1; return [r * Math.cos(a), r * Math.sin(a)]; })), // estrela: desejo
    prata: () => 'M-.62 -.92H.62V-.74Q.56 -.28 .14 0Q.56 .28 .62 .74V.92H-.62V.74Q-.56 .28 -.14 0Q-.56 -.28 -.62 -.74Z', // ampulheta: rolls guardados
    ouro: () => 'M0 -1L.7 -.42L.7 .42L0 1L-.7 .42L-.7 -.42Z', // cristal de kakera
  };

  function grad(defs, id, stops, attrs = {}, kind = 'linearGradient') {
    defs.append(s(kind, { id, ...attrs }, stops.map(([o, c, a]) => s('stop', { offset: o, 'stop-color': c, 'stop-opacity': a ?? 1 }))));
    return `url(#${id})`;
  }
  const metalStops = (m) => [[0, m[0]], [0.2, m[1]], [0.42, m[2]], [0.52, m[3]], [0.74, m[4]], [1, m[5]]];

  // A luz vem do alto à esquerda. facing: quanto a borda a→b (vista do centro c) olha para ela (1 de frente, -1 de costas).
  const LX = -0.6, LY = -0.8;
  function facing(a, b, c = [CX, CY]) {
    let nx = b[1] - a[1], ny = a[0] - b[0];
    if (nx * ((a[0] + b[0]) / 2 - c[0]) + ny * ((a[1] + b[1]) / 2 - c[1]) < 0) { nx = -nx; ny = -ny; }
    return (nx * LX + ny * LY) / (Math.hypot(nx, ny) || 1);
  }
  // O metal do escuro ao brilho, e a cor de uma face conforme a luz.
  const rampAt = (m, b) => [m[0], m[5], m[1], m[4], m[2], m[3]][Math.max(0, Math.min(5, Math.round((b + 1) / 2 * 5)))];
  // Véu claro ou escuro (para sombrear por cima do acabamento sem esconder a cor dele).
  const veil = (b) => (b > 0 ? ['#ffffff', f(Math.round((0.03 + b * 0.26) * 25) / 25)] : ['#000000', f(Math.round(-b * 0.3 * 25) / 25)]);
  // Leque: um triângulo do centro a cada lado do contorno. Chanfro: a faixa entre o contorno e ele encolhido.
  const fan = (pts, c = [CX, CY]) => pts.map((p, i) => { const q = pts[(i + 1) % pts.length]; return { pts: [c, p, q], b: facing(p, q, c) }; });
  const toward = (pts, k, c = [CX, CY]) => pts.map(([x, y]) => [c[0] + (x - c[0]) * k, c[1] + (y - c[1]) * k]);
  const chamfer = (pts, k, c = [CX, CY]) => { const inn = toward(pts, k, c); return pts.map((p, i) => { const j = (i + 1) % pts.length; return { pts: [p, pts[j], inn[j], inn[i]], b: facing(p, pts[j], c) }; }); };
  // As facetas da mesma cor viram um caminho só.
  function facets(list, attrs = {}) {
    const by = new Map();
    for (const [pts, fill, op = 1] of list) { if (!+op) continue; const key = fill + '|' + op; by.set(key, (by.get(key) || '') + poly(pts)); }
    return [...by].map(([key, d]) => { const [fill, op] = key.split('|'); return s('path', { d, fill, 'fill-opacity': op === '1' ? null : op, ...attrs }); });
  }

  // Uma fileira de contas (ou de entalhes) sobre um contorno: o tracejado desenha todas com um nó só.
  // pearl: conta em relevo (sombra, corpo, brilho). mill: entalhe (fundo escuro com a beira clara). dot: pontinho puncionado.
  function beads(o, n, w, m, kind = 'pearl') {
    const pearl = kind === 'pearl';
    const base = { d: o.d, pathLength: 100, fill: 'none', 'stroke-linecap': kind === 'mill' ? 'butt' : 'round', 'stroke-dasharray': kind === 'mill' ? `${f(26 / n)} ${f(74 / n)}` : `0 ${f(100 / n)}` };
    const tr = (dx, dy) => `translate(${dx} ${dy})` + (o.t ? ' ' + o.t : '');
    if (!pearl) {
      return s('g', { class: 'fm-beads' },
        s('path', { ...base, transform: tr(0.4, 0.45), stroke: m[3], 'stroke-opacity': 0.7, 'stroke-width': w }),
        s('path', { ...base, transform: o.t || null, stroke: m[0], 'stroke-opacity': kind === 'dot' ? 0.6 : 0.85, 'stroke-width': w }));
    }
    return s('g', { class: 'fm-beads' },
      s('path', { ...base, transform: tr(0.35, 0.5), stroke: m[0], 'stroke-opacity': 0.8, 'stroke-width': w }),
      s('path', { ...base, transform: o.t || null, stroke: m[2], 'stroke-width': w }),
      s('path', { ...base, transform: tr(-0.32, -0.38), stroke: '#ffffff', 'stroke-opacity': 0.85, 'stroke-width': w * 0.4 }));
  }

  const sparkleD = (x, y, r, rot = 0) => {
    const P = (rr, a) => { const [px, py] = polar(rr, a + rot, x, y); return f(px) + ' ' + f(py); };
    const k = r * 0.2 * Math.SQRT2;
    return `M${P(r, -90)}Q${P(k, -45)} ${P(r, 0)}Q${P(k, 45)} ${P(r, 90)}Q${P(k, 135)} ${P(r, 180)}Q${P(k, 225)} ${P(r, -90)}Z`;
  };
  const sparkle = (x, y, r, cls) => s('path', { class: cls, d: sparkleD(x, y, r), fill: '#fff' });
  // Brilho estelar: quatro raios compridos e quatro curtos na diagonal.
  const starGlint = (x, y, r, cls) => s('path', { class: cls, d: sparkleD(x, y, r) + sparkleD(x, y, r * 0.45, 45), fill: '#fff' });

  // Pedra lapidada no engaste: aro de metal (o "copo"), a pedra com coroa (facetas de cima), mesa e, vistas pela
  // mesa, as facetas de baixo (pavilhão). A luz entra no alto à esquerda (reflexos brancos) e sai embaixo à direita
  // (a cor acende); os lados escurecem e a parte de baixo fica mais funda. Garras seguram a pedra.
  function gemNode(defs, id, medal, m, cup, rich) {
    const g = MATERIALS[medal].gem;
    const tone = [g[3], g[2], g[1], g[0], '#ffffff'];
    const node = s('g', { class: 'fm-gem' });
    const step = medal === 'esmeralda';
    const rx = { safira: R * 0.4, rubi: R * 0.44, diamante: R * 0.47, esmeralda: R * 0.378 }[medal];
    const ry = { safira: R * 0.5, rubi: R * 0.44, diamante: R * 0.47, esmeralda: R * 0.504 }[medal];
    const oct = (k) => [[-1, -1.4], [1, -1.4], [1.4, -1], [1.4, 1], [1, 1.4], [-1, 1.4], [-1.4, 1], [-1.4, -1]].map(([x, y]) => [CX + x * R * 0.27 * k, CY + y * R * 0.36 * k]);
    const ell = (k, n = 16, rot = 0) => Array.from({ length: n }, (_, i) => { const a = (-90 + rot + i * 360 / n) * PI / 180; return [CX + rx * k * Math.cos(a), CY + ry * k * Math.sin(a)]; });
    const girdle = step ? oct(1) : ell(1);
    const ang = ([x, y]) => Math.atan2(y - CY, x - CX) * 180 / PI;
    // Engaste.
    if (step) {
      node.append(s('path', { d: rounded(toward(girdle, 1.16), 2.5), fill: cup, stroke: m[0], 'stroke-width': 0.8 }),
        s('path', { d: poly(toward(girdle, 1.05)), fill: m[0], 'fill-opacity': 0.75 }));
    } else {
      node.append(s('ellipse', { cx: CX, cy: CY, rx: f(rx * 1.16), ry: f(ry * 1.16), fill: cup, stroke: m[0], 'stroke-width': 0.8 }),
        s('ellipse', { cx: CX, cy: CY, rx: f(rx * 1.05), ry: f(ry * 1.05), fill: m[0], 'fill-opacity': 0.75 }));
    }
    node.append(s('path', { d: poly(girdle), fill: grad(defs, id + 'gb', [[0, g[1]], [0.5, g[2]], [1, g[3]]], { cx: '40%', cy: '30%', r: '85%' }, 'radialGradient') }));
    const tableFill = grad(defs, id + 'gt', [[0, g[0]], [0.45, g[1]], [1, g[2]]], { x1: 0, y1: 0, x2: 0.8, y2: 1 });
    let table;
    if (rich) {
      const list = [];
      const lvl = (dir, bias, odd) => {
        const d = Math.cos((dir - 225) * PI / 180);
        let v = 1.3 + 1.5 * Math.abs(d) + bias + (odd ? 0.45 : -0.45);
        if (d > 0.55 && odd) v += 1; // reflexo branco do lado da luz
        return tone[Math.max(0, Math.min(4, Math.round(v)))];
      };
      if (step) {
        // Corte em degraus: três faixas de octógonos, alternando claro e escuro como espelhos.
        const steps = [1, 0.78, 0.6, 0.44];
        for (let st = 0; st < 3; st++) {
          const a = oct(steps[st]), b = oct(steps[st + 1]);
          for (let i = 0; i < 8; i++) {
            const j = (i + 1) % 8, d = facing(a[i], a[j]);
            let v = 1.6 + 1.4 * Math.abs(d) + (st % 2 ? -0.9 : 0.35) + (d > 0.5 && st === 0 ? 1 : 0);
            list.push([[a[i], a[j], b[j], b[i]], tone[Math.max(0, Math.min(4, Math.round(v)))]]);
          }
        }
        table = oct(0.44);
      } else {
        const G = ell(1), T = ell(0.56, 8), M = ell(0.8, 8, 22.5);
        for (let j = 0; j < 8; j++) {
          const j1 = (j + 1) % 8, jm = (j + 7) % 8;
          list.push([[T[j], T[j1], M[j]], lvl(ang(M[j]), 0.3, j % 2)]); // estrela
          list.push([[T[j], M[jm], G[2 * j], M[j]], lvl(ang(G[2 * j]), 0, (j + 1) % 2)]); // pipa
          list.push([[M[j], G[2 * j], G[2 * j + 1]], lvl(ang(G[2 * j + 1]) - 8, -0.3, 0)]); // cinta
          list.push([[M[j], G[2 * j + 1], G[(2 * j + 2) % 16]], lvl(ang(G[2 * j + 1]) + 8, -0.3, 1)]);
        }
        table = T;
      }
      node.append(...facets(list, { stroke: g[3], 'stroke-opacity': 0.35, 'stroke-width': 0.3, 'stroke-linejoin': 'round' }));
      if (medal === 'diamante') {
        // O "fogo" do diamante: lascas de cor nas facetas.
        const fire = ['#ff9ad5', '#9af0ff', '#fff59a', '#b9a4ff'];
        const G = ell(1), T = ell(0.56, 8);
        for (let i = 0; i < 4; i++) node.append(s('path', { d: poly([G[i * 4 + 2], G[i * 4 + 3], T[i * 2 + 1]]), fill: fire[i], 'fill-opacity': 0.34 }));
      }
      // A parte de baixo mais funda.
      node.append(s('path', { d: poly(girdle), fill: grad(defs, id + 'gk', [[0.4, g[3], 0], [1, g[3], 0.5]], { x1: 0, y1: 0, x2: 0, y2: 1 }) }));
    } else {
      table = step ? oct(0.5) : ell(0.56, 8);
    }
    node.append(s('path', { d: poly(table), fill: tableFill, stroke: g[3], 'stroke-opacity': 0.4, 'stroke-width': 0.35 }));
    if (rich) {
      if (step) {
        node.append(s('path', { d: poly(oct(0.3)) + poly(oct(0.17)), fill: 'none', stroke: g[0], 'stroke-opacity': 0.5, 'stroke-width': 0.5 }));
      } else {
        // O pavilhão visto pela mesa: uma estrela escura e os raios até a mesa.
        const T = table, P = ell(0.22, 8, 22.5);
        node.append(s('path', { d: poly(T.flatMap((p, j) => [[CX + (p[0] - CX) * 0.96, CY + (p[1] - CY) * 0.96], P[j]])), fill: g[3], 'fill-opacity': 0.32 }),
          s('path', { d: T.map(([x, y]) => `M${CX} ${CY}L${f(x)} ${f(y)}`).join(''), stroke: g[3], 'stroke-opacity': 0.3, 'stroke-width': 0.35 }));
      }
      // A luz que sai embaixo à direita.
      const gx = CX + rx * 0.2, gy = CY + ry * 0.26;
      node.append(s('ellipse', { cx: f(gx), cy: f(gy), rx: f(rx * 0.36), ry: f(ry * 0.26), fill: grad(defs, id + 'gg', [[0, g[0], 0.9], [1, g[0], 0]], {}, 'radialGradient') }));
    }
    node.append(s('path', { d: poly(girdle), fill: 'none', stroke: g[3], 'stroke-width': 0.8 }));
    // Reflexo duro no alto à esquerda.
    const hx = CX - rx * 0.3, hy = CY - ry * 0.36;
    node.append(s('ellipse', { cx: f(hx), cy: f(hy), rx: f(rx * 0.3), ry: f(ry * 0.1), transform: `rotate(-35 ${f(hx)} ${f(hy)})`, fill: '#fff', 'fill-opacity': 0.6 }));
    if (rich) {
      // Garras nas diagonais.
      const pg = grad(defs, id + 'pg', [[0, m[3]], [0.6, m[2]], [1, m[0]]], { cx: '35%', cy: '30%', r: '75%' }, 'radialGradient');
      let d = '';
      for (const a of [-135, -45, 45, 135]) {
        const rad = a * PI / 180;
        const [x, y] = step ? [CX + Math.sign(Math.cos(rad)) * R * 0.27 * 1.2, CY + Math.sign(Math.sin(rad)) * R * 0.36 * 1.2] : [CX + rx * Math.cos(rad), CY + ry * Math.sin(rad)];
        const [ux, uy] = unit(x - CX, y - CY);
        d += poly([[x + ux * 2.2, y + uy * 2.2], [x - uy * 1.7, y + ux * 1.7], [x - ux * 1.6, y - uy * 1.6], [x + uy * 1.7, y - ux * 1.7]]);
      }
      node.append(s('path', { d, fill: pg, stroke: m[0], 'stroke-width': 0.5, 'stroke-linejoin': 'round' }));
      node.append(s('g', { class: 'fm-glint' }, starGlint(CX - rx * 0.34, CY - ry * 0.4, 6.5)));
    }
    return node;
  }

  // O emblema em relevo das medalhas de metal: estrela facetada (Bronze), ampulheta com vidro e areia (Prata)
  // e cristal de kakera lapidado (Ouro).
  function emblem(defs, id, medal, m, ink, lit, rich) {
    const k = R * 0.42;
    const at = (dx = 0, dy = 0) => `translate(${CX + dx} ${CY + dy}) scale(${k})`;
    const g = s('g', { class: 'fm-emblem' });
    if (!lit) { g.append(s('path', { d: EMBLEMS[medal](), transform: at(), fill: '#000', 'fill-opacity': 0.45 })); return g; }
    const relief = grad(defs, id + 'em', [[0, m[3]], [0.5, m[2]], [1, m[1]]], { x1: 0, y1: 0, x2: 0.4, y2: 1 });
    if (medal === 'prata') {
      const u = (w) => w / k;
      const outline = 'M-.7 -.98H.7V-.8H.55Q.5 -.3 .13 0Q.5 .3 .55 .8H.7V.98H-.7V.8H-.55Q-.5 .3 -.13 0Q-.5 -.3 -.55 -.8H-.7Z';
      const glass = 'M-.5 -.8H.5Q.46 -.3 .1 0Q.46 .3 .5 .8H-.5Q-.46 .3 -.1 0Q-.46 -.3 -.5 -.8Z';
      g.append(s('path', { d: outline, transform: at(1, 1.4), fill: ink, 'fill-opacity': 0.55 }),
        s('path', { d: glass, transform: at(), fill: grad(defs, id + 'eg', [[0, m[0]], [0.6, m[5]], [1, m[1]]], { x1: 0, y1: 0, x2: 0.3, y2: 1 }), stroke: m[0], 'stroke-width': u(0.7) }));
      if (rich) g.append(s('path', { d: 'M-.4 -.74Q-.36 -.36 -.1 -.12', transform: at(), fill: 'none', stroke: '#fff', 'stroke-opacity': 0.45, 'stroke-width': u(0.7), 'stroke-linecap': 'round' }));
      // A areia: o resto em cima, o fio caindo e o monte embaixo.
      g.append(s('path', { d: 'M-.32 -.38H.32Q.2 -.16 .05 -.03H-.05Q-.2 -.16 -.32 -.38ZM-.46 .8Q-.34 .38 0 .34Q.34 .38 .46 .8Z', transform: at(), fill: relief }),
        s('path', { d: 'M0 -.02V.36', transform: at(), stroke: m[3], 'stroke-width': u(0.7) }),
        s('path', { d: 'M-.72 -.98H.72V-.8H-.72ZM-.72 .8H.72V.98H-.72ZM-.66 -.8H-.56V.8H-.66ZM.56 -.8H.66V.8H.56Z', transform: at(), fill: relief, stroke: m[0], 'stroke-width': u(0.7), 'stroke-linejoin': 'round' }));
      if (rich) g.append(s('path', { d: 'M-.68 -.93H.68M-.68 .85H.68', transform: at(), stroke: '#fff', 'stroke-opacity': 0.6, 'stroke-width': u(0.5) }));
      return g;
    }
    const P = ([x, y]) => [CX + x * k, CY + y * k];
    const outer = medal === 'bronze'
      ? Array.from({ length: 10 }, (_, i) => { const a = (-90 + i * 36) * PI / 180, r = i % 2 ? 0.42 : 1; return P([r * Math.cos(a), r * Math.sin(a)]); })
      : [[0, -1], [0.7, -0.42], [0.7, 0.42], [0, 1], [-0.7, 0.42], [-0.7, -0.42]].map(P);
    g.append(s('path', { d: poly(outer), transform: 'translate(1 1.4)', fill: ink, 'fill-opacity': 0.55 }));
    // Cada face na cor do metal que a luz dá a ela (um pouco puxada para o claro: é relevo).
    const list = medal === 'bronze' ? fan(outer) : chamfer(outer, 0.5);
    g.append(...facets(list.map(({ pts, b }) => [pts, rampAt(m, b * 0.9 + 0.15)])));
    if (medal === 'ouro') g.append(s('path', { d: poly(toward(outer, 0.5)), fill: relief }));
    g.append(s('path', { d: poly(outer), fill: 'none', stroke: m[0], 'stroke-width': 0.8, 'stroke-linejoin': 'round' }));
    return g;
  }

  // Fita do nível II: duas pontas de tecido saindo de trás da medalha, cada uma presa por uma presilha de metal,
  // com volume (brilho no meio do pano), listras, uma dobra (depois dela aparece o avesso, mais escuro) e a ponta em V.
  function ribbon(defs, id, medal, mat, m, rim, rich, tiny) {
    const [cloth, stripe] = mat.ribbon;
    const g = s('g', { class: 'fm-ribbon' + (tiny ? ' short' : '') });
    // Pequena: duas pontas curtas e largas, bem abertas, que mal passam da borda (nada de "duas pernas").
    const W = tiny ? 9.5 : 7.6, notch = tiny ? 4.5 : 6;
    const bases = [];
    let stripes = '', back = '', crease = '', creaseLine = '', clasp = '', claspLine = '';
    for (const side of [-1, 1]) {
      const S = tiny ? [CX + side * 8, CY + 18] : [CX + side * 5, CY + 10], C = tiny ? [CX + side * 18, CY + 38] : [CX + side * 10, CY + 44], E = tiny ? [CX + side * 30, CY + 48] : [CX + side * 31.5, CY + 56.5]; // a ponta fica dentro do desenho
      const at = (t) => { const u = 1 - t; return [u * u * S[0] + 2 * u * t * C[0] + t * t * E[0], u * u * S[1] + 2 * u * t * C[1] + t * t * E[1]]; };
      const tan = (t) => unit(2 * (1 - t) * (C[0] - S[0]) + 2 * t * (E[0] - C[0]), 2 * (1 - t) * (C[1] - S[1]) + 2 * t * (E[1] - C[1]));
      // O lado +1 é o virado para a luz.
      const [t7x, t7y] = tan(0.7), flip = (-t7y * LX + t7x * LY) < 0 ? -1 : 1;
      const nrm = (t) => { const [tx, ty] = tan(t); return [-ty * flip, tx * flip]; };
      // Onde a fita sai de trás da medalha: a presilha fica ali e a dobra, mais para baixo.
      let tc = 0.5;
      for (let t = 0.2; t < 0.9; t += 0.02) { const [x, y] = at(t); if (Math.hypot(x - CX, y - CY) > reach(medal, Math.atan2(y - CY, x - CX) * 180 / PI) + 0.8) { tc = t; break; } }
      const tf = tc + (1 - tc) * 0.46;
      const width = (t) => (rich ? W * (1 - 0.3 * Math.exp(-(((t - tf) / 0.05) ** 2))) : W);
      const edge = (o, t0, t1, n = 8) => Array.from({ length: n + 1 }, (_, i) => {
        const t = n ? t0 + (t1 - t0) * i / n : t0, [px, py] = at(t), [nx, ny] = nrm(t), w = width(t);
        let x = px + nx * w * o, y = py + ny * w * o;
        if (t1 === 1 && i === n) { const [tx, ty] = tan(1); x -= tx * notch * (1 - Math.abs(o)); y -= ty * notch * (1 - Math.abs(o)); }
        return [x, y];
      });
      const band = (t0, t1, o0, o1) => {
        const mid = t1 === 1 && o0 < 0 && o1 > 0 ? edge(0, t1, t1, 0) : [];
        return poly([...edge(o0, t0, t1), ...mid, ...edge(o1, t0, t1).reverse()]);
      };
      if (tiny) {
        bases.push(s('path', { d: band(0, 1, -1, 1), fill: cloth, stroke: '#000', 'stroke-opacity': 0.4, 'stroke-width': 0.8 }));
        stripes += band(0, 1, -0.3, 0.3);
        continue;
      }
      // O brilho do pano atravessa a largura da fita.
      const [mx, my] = at(0.75), [nx, ny] = nrm(0.75);
      const sheen = grad(defs, id + 'rs' + side, [[0, mix(cloth, '#000000', 0.5)], [0.22, cloth], [0.62, mix(cloth, '#ffffff', 0.3)], [0.84, cloth], [1, mix(cloth, '#000000', 0.25)]],
        { x1: f(mx - nx * W), y1: f(my - ny * W), x2: f(mx + nx * W), y2: f(my + ny * W), gradientUnits: 'userSpaceOnUse' });
      bases.push(s('path', { d: band(0, 1, -1, 1), fill: sheen, stroke: '#000', 'stroke-opacity': 0.45, 'stroke-width': 0.5, 'stroke-linejoin': 'round' }));
      stripes += band(0, 1, -0.26, 0.26) + band(0, 1, 0.64, 0.8) + band(0, 1, -0.8, -0.64);
      if (rich) {
        back += band(tf, 1, -1, 1);
        crease += band(tf - 0.012, tf + 0.04, -1, 1);
        const [a0, a1] = [edge(-1, tf - 0.012, tf - 0.012, 0)[0], edge(1, tf - 0.012, tf - 0.012, 0)[0]];
        creaseLine += `M${f(a0[0])} ${f(a0[1])}L${f(a1[0])} ${f(a1[1])}`;
        clasp += band(tc, tc + 0.075, -1.2, 1.2);
        const [c0, c1] = [edge(-1.15, tc + 0.012, tc + 0.012, 0)[0], edge(1.15, tc + 0.012, tc + 0.012, 0)[0]];
        claspLine += `M${f(c0[0])} ${f(c0[1])}L${f(c1[0])} ${f(c1[1])}`;
      }
    }
    g.append(...bases, s('path', { d: stripes, fill: stripe, 'fill-opacity': 0.92 }));
    if (back) {
      g.append(s('path', { class: 'fm-ribbon-back', d: back, fill: '#000', 'fill-opacity': 0.28 }), s('path', { d: crease, fill: '#000', 'fill-opacity': 0.3 }),
        s('path', { d: creaseLine, stroke: '#fff', 'stroke-opacity': 0.45, 'stroke-width': 0.6 }),
        s('path', { d: clasp, fill: rim, stroke: m[0], 'stroke-width': 0.7, 'stroke-linejoin': 'round' }),
        s('path', { d: claspLine, stroke: m[3], 'stroke-opacity': 0.9, 'stroke-width': 0.6 }));
    }
    return g;
  }

  // Louros do nível III: dois ramos cheios subindo pelos lados, no metal da medalha. Cada folha tem a metade
  // virada para a luz clara e a outra escura, com a nervura; bagas pelo caminho e um laço onde os ramos se encontram.
  function laurel(defs, id, m, mat, rich, tiny) {
    const g = s('g', { class: 'fm-laurel' + (tiny ? ' tiny' : '') });
    if (tiny) {
      // Bem pequena (perfil, 28 px): só um arco grosso de cada lado, afinando para cima, no metal da medalha.
      let d = '';
      for (const side of [-1, 1]) {
        const a0 = side < 0 ? 104 : 76, a1 = side < 0 ? 206 : -26, sweep = side < 0 ? 1 : 0, back = side < 0 ? 0 : 1;
        const [ox, oy] = polar(R + 10, a0), [ex, ey] = polar(R + 6.5, a1), [ix, iy] = polar(R + 3, a0);
        d += `M${f(ox)} ${f(oy)}A${R + 9} ${R + 9} 0 0 ${sweep} ${f(ex)} ${f(ey)}A${R + 4} ${R + 4} 0 0 ${back} ${f(ix)} ${f(iy)}Z`;
      }
      g.append(s('path', { d, fill: grad(defs, id + 'lt', [[0, m[3]], [0.5, m[2]], [1, m[4]]], { x1: 0, y1: 0, x2: 0, y2: 1 }), stroke: m[0], 'stroke-width': 1, 'stroke-linejoin': 'round' }));
      return g;
    }
    const span = { x1: 0, y1: 20, x2: 0, y2: 125, gradientUnits: 'userSpaceOnUse' };
    const lightFill = grad(defs, id + 'la', [[0, m[3]], [1, m[2]]], span);
    const darkFill = grad(defs, id + 'lb', [[0, m[4]], [1, m[5]]], span);
    let light = '', dark = '', veins = '', berries = '', shine = '', stems = '';
    const leaf = (bx, by, ux, uy, len, wid) => {
      const nx = -uy, ny = ux;
      const tx = bx + ux * len, ty = by + uy * len, mx = bx + ux * len * 0.45, my = by + uy * len * 0.45;
      const half = (k) => `M${f(bx)} ${f(by)}Q${f(mx + nx * wid * 2 * k)} ${f(my + ny * wid * 2 * k)} ${f(tx)} ${f(ty)}Z`;
      const up = nx * LX + ny * LY > 0;
      light += half(up ? 1 : -1); dark += half(up ? -1 : 1);
      if (rich) veins += `M${f(bx + ux * len * 0.1)} ${f(by + uy * len * 0.1)}L${f(bx + ux * len * 0.8)} ${f(by + uy * len * 0.8)}`;
    };
    { // Os dois ramos, de baixo para cima.
      const rl = R + 8, nodes = rich ? 9 : 5;
      for (const side of [-1, 1]) {
        const at = (t) => (side < 0 ? 100 + 134 * t : 80 - 134 * t);
        const [sx, sy] = polar(rl, at(0)), [ex, ey] = polar(rl, at(1));
        stems += `M${f(sx)} ${f(sy)}A${rl} ${rl} 0 0 ${side < 0 ? 1 : 0} ${f(ex)} ${f(ey)}`;
        for (let i = 0; i <= nodes; i++) {
          const t = i / nodes, a = at(t), [x, y] = polar(rl, a);
          const ox = Math.cos(a * PI / 180), oy = Math.sin(a * PI / 180); // para fora
          const dir = (a - 90 * side) * PI / 180, ux = Math.cos(dir), uy = Math.sin(dir); // para onde o ramo cresce
          const size = 1 - t * 0.38;
          if (i === nodes) { leaf(x, y, ux, uy, 12 * size, 3 * size); break; }
          leaf(x, y, ...unit(ux + ox * 0.62, uy + oy * 0.62), 13.5 * size, 3.4 * size);
          if (rich) leaf(x, y, ...unit(ux - ox * 0.62, uy - oy * 0.62), 11 * size, 2.9 * size);
          if (rich && i % 2 === 1) {
            const bx = x + ox * 3 - ux * 1.4, by = y + oy * 3 - uy * 1.4;
            berries += circ(1.5, bx, by); shine += circ(0.5, bx - 0.5, by - 0.5);
          }
        }
      }
      g.append(s('path', { d: stems, fill: 'none', stroke: m[0], 'stroke-width': 1.8, 'stroke-linecap': 'round' }));
      if (rich) g.append(s('path', { d: stems, fill: 'none', stroke: m[2], 'stroke-opacity': 0.75, 'stroke-width': 0.6, 'stroke-linecap': 'round' }));
    }
    const edge = { class: 'fm-leaves', stroke: m[0], 'stroke-width': 0.45, 'stroke-linejoin': 'round' };
    g.append(s('path', { d: dark, fill: darkFill, ...edge }), s('path', { d: light, fill: lightFill, ...edge }));
    if (veins) g.append(s('path', { class: 'fm-veins', d: veins, stroke: m[0], 'stroke-opacity': 0.5, 'stroke-width': 0.4 }));
    if (berries) g.append(s('path', { d: berries, fill: m[2], stroke: m[0], 'stroke-width': 0.5 }), s('path', { d: shine, fill: '#fff', 'fill-opacity': 0.8 }));
    { // O laço que amarra os dois ramos, no pano da fita.
      const [cloth, stripe] = mat.ribbon;
      const bx = CX, by = CY + R + 8.5;
      const bow = grad(defs, id + 'bw', [[0, mix(cloth, '#ffffff', 0.3)], [0.5, cloth], [1, mix(cloth, '#000000', 0.45)]], { x1: 0, y1: 0, x2: 0, y2: 1 });
      const P = (x, y) => `${f(bx + x)} ${f(by + y)}`;
      const loop = (k) => `M${P(0, 0)}C${P(-3 * k, -7.5)} ${P(-12.5 * k, -7)} ${P(-11.5 * k, -1)}C${P(-11 * k, 3)} ${P(-5 * k, 2.5)} ${P(0, 0)}Z`;
      const hole = (k) => `M${P(-2 * k, -0.6)}C${P(-4 * k, -4.4)} ${P(-9.4 * k, -4.6)} ${P(-9 * k, -1.4)}C${P(-8.6 * k, 0.4)} ${P(-5 * k, 0.6)} ${P(-2 * k, -0.6)}Z`;
      const tail = (k) => `M${P(-2.2 * k, 1.2)}L${P(-7.6 * k, 9.8)}L${P(-5.2 * k, 8.8)}L${P(-3.4 * k, 11.4)}L${P(0.8 * k, 2)}Z`;
      g.append(s('path', { d: tail(1) + tail(-1), fill: bow, stroke: '#000', 'stroke-opacity': 0.45, 'stroke-width': 0.5, 'stroke-linejoin': 'round' }),
        s('path', { d: loop(1) + loop(-1), fill: bow, stroke: '#000', 'stroke-opacity': 0.45, 'stroke-width': 0.5 }));
      if (rich) g.append(s('path', { d: hole(1) + hole(-1), fill: '#000', 'fill-opacity': 0.3 }));
      g.append(s('rect', { x: bx - 2.6, y: by - 2.8, width: 5.2, height: 5.6, rx: 1.6, fill: mix(cloth, '#000000', 0.15), stroke: '#000', 'stroke-opacity': 0.5, 'stroke-width': 0.5 }),
        s('rect', { x: bx - 0.8, y: by - 2.6, width: 1.6, height: 5.2, fill: stripe, 'fill-opacity': 0.9 }));
    }
    return g;
  }

  // Coroa do nível IV: cada medalha com a sua, no metal dela. kind: o nome (vai em data-crown). tips: [x, altura]
  // de cada ponta; valley: altura dos vales; curve: lados côncavos; tip: o enfeite das pontas; band: o que vai na tiara.
  const CROWNS = {
    bronze: { kind: 'pontas', tips: [[-16.5, 8], [-8.3, 11.5], [0, 14.5], [8.3, 11.5], [16.5, 8]], valley: 2.5, tip: 'knob', band: 'studs' }, // simples, de pontas
    prata: { kind: 'perolas', tips: [[-16, 7], [-8, 10], [0, 12.5], [8, 10], [16, 7]], valley: 4, curve: true, tip: 'pearl', band: 'pearls' }, // pérolas nas pontas e na tiara
    ouro: { kind: 'alta', rays: 13, band: 'gems' }, // alta e cheia: raios largos que se tocam, todos com bolinha
    safira: { kind: 'gema-azul', tips: [[-15.5, 6], [0, 17], [15.5, 6]], valley: 3, curve: true, tip: 'tiara', band: 'gems' }, // tiara com a safira no alto
    rubi: { kind: 'cruz', tips: [[-14.5, 6], [0, 7], [14.5, 6]], valley: 2.5, tip: 'pearl', arch: true, band: 'gems' }, // imperial: arcos, veludo, orbe e cruz
    esmeralda: { kind: 'pontas-verdes', tips: [[-16.5, 8], [-8.3, 11], [0, 14], [8.3, 11], [16.5, 8]], valley: 3.5, curve: true, tip: 'gem', band: 'gems' }, // pontas com esmeraldas
    diamante: { kind: 'cristal', tips: [[-16.5, 8], [-11, 11], [-5.5, 14.5], [0, 19], [5.5, 14.5], [11, 11], [16.5, 8]], valley: 2.5, tip: 'spark', crystal: true, band: 'gems' }, // pontas de cristal
  };
  // Pérolas (sombra, corpo e brilho) num punhado de pontos.
  function pearls(pts, r) {
    return s('g', { class: 'fm-pearls' },
      s('path', { d: pts.map(([x, y]) => circ(r, x + r * 0.18, y + r * 0.25)).join(''), fill: '#000', 'fill-opacity': 0.35 }),
      s('path', { d: pts.map(([x, y]) => circ(r, x, y)).join(''), fill: '#ece6da', stroke: '#8a8172', 'stroke-width': 0.4 }),
      s('path', { d: pts.map(([x, y]) => circ(r * 0.62, x + r * 0.12, y + r * 0.15)).join(''), fill: '#d9d0c0' }),
      s('path', { d: pts.map(([x, y]) => circ(r * 0.34, x - r * 0.32, y - r * 0.36)).join(''), fill: '#fff' }));
  }
  // Pedra pequena lapidada (oito facetas em volta da mesa), para a coroa.
  function smallGem(defs, id, x, y, rx, ry, c, line) {
    const ring8 = (k, rot = 0) => Array.from({ length: 8 }, (_, i) => { const a = (-90 + rot + i * 45) * PI / 180; return [x + rx * k * Math.cos(a), y + ry * k * Math.sin(a)]; });
    const G = ring8(1, 22.5), T = ring8(0.5, 22.5);
    const tones = [c[1], c[2], c[3], c[2], c[1], c[0], '#ffffff', c[0]];
    const list = G.map((p, i) => [[p, G[(i + 1) % 8], T[(i + 1) % 8], T[i]], tones[(i + 4) % 8]]);
    return s('g', {},
      s('path', { d: poly(G), fill: c[2], ...line }),
      ...facets(list, { stroke: c[3], 'stroke-opacity': 0.4, 'stroke-width': 0.2 }),
      s('path', { d: poly(T), fill: grad(defs, id, [[0, c[0]], [0.5, c[1]], [1, c[2]]], { x1: 0, y1: 0, x2: 0.7, y2: 1 }) }),
      s('ellipse', { cx: f(x - rx * 0.3), cy: f(y - ry * 0.32), rx: f(rx * 0.22), ry: f(ry * 0.14), fill: '#fff', 'fill-opacity': 0.9 }));
  }
  function crown(defs, id, medal, top, m, tiny) {
    const st = CROWNS[medal], mat = MATERIALS[medal];
    const gemC = mat.gem || [mix(mat.enamel[0], '#ffffff', 0.4), mat.enamel[0], mat.enamel[1], mat.enamel[2]];
    const hw = 18, y0 = top + 4.5, bt = y0 - 6.5, base = bt + 1.2;
    const g = s('g', { class: 'fm-crown', 'data-crown': st.kind });
    // O metal como um cilindro: escuro nas pontas, brilho um pouco à esquerda do meio.
    const cyl = grad(defs, id + 'cy', [[0, m[0]], [0.14, m[1]], [0.34, m[3]], [0.5, m[2]], [0.78, m[4]], [1, m[5]]], { x1: CX - hw, y1: 0, x2: CX + hw, y2: 0, gradientUnits: 'userSpaceOnUse' });
    const line = { stroke: m[0], 'stroke-width': tiny ? 1 : 0.7, 'stroke-linejoin': 'round' };
    g.append(s('ellipse', { cx: CX, cy: y0 + 1.4, rx: hw * 0.95, ry: 2.6, fill: '#000', 'fill-opacity': 0.35 }));
    if (st.arch) {
      // Coroa imperial: o veludo, os arcos com pérolas e o orbe com a cruz.
      const cloth = mat.ribbon[0];
      g.append(s('path', { d: `M${CX - hw + 2} ${base}C${CX - hw + 1} ${bt - 12} ${CX - 8} ${bt - 16} ${CX} ${bt - 16}C${CX + 8} ${bt - 16} ${CX + hw - 1} ${bt - 12} ${CX + hw - 2} ${base}Z`,
        fill: grad(defs, id + 'vl', [[0, mix(cloth, '#ffffff', 0.25)], [0.6, cloth], [1, mix(cloth, '#000000', 0.5)]], { cx: '35%', cy: '25%', r: '80%' }, 'radialGradient') }));
      const arches = `M${CX - hw + 1.4} ${base}C${CX - hw} ${bt - 11} ${CX - 7} ${bt - 15.5} ${CX} ${bt - 15.5}C${CX + 7} ${bt - 15.5} ${CX + hw} ${bt - 11} ${CX + hw - 1.4} ${base}M${CX} ${base}V${bt - 15.5}`;
      g.append(s('path', { d: arches, fill: 'none', stroke: m[0], 'stroke-width': tiny ? 3.4 : 3, 'stroke-linecap': 'round' }),
        s('path', { d: arches, fill: 'none', stroke: cyl, 'stroke-width': tiny ? 2.2 : 1.9, 'stroke-linecap': 'round' }));
      if (!tiny) g.append(s('path', { d: arches, pathLength: 100, fill: 'none', stroke: '#fffaf0', 'stroke-width': 1, 'stroke-linecap': 'round', 'stroke-dasharray': '0 4.2' }));
      const cross = `M${CX} ${bt - 20.8}V${bt - 27.4}M${CX - 2.5} ${bt - 25}H${CX + 2.5}`;
      g.append(s('g', { class: 'fm-cross' },
        s('path', { d: cross, stroke: m[0], 'stroke-width': tiny ? 2.6 : 2.1, 'stroke-linecap': 'round' }),
        s('path', { d: cross, stroke: m[3], 'stroke-width': tiny ? 1.2 : 0.9, 'stroke-linecap': 'round' })),
        s('circle', { cx: CX, cy: bt - 18.3, r: 2.9, fill: grad(defs, id + 'ob', [[0, m[3]], [0.5, m[2]], [1, m[0]]], { cx: '35%', cy: '30%', r: '75%' }, 'radialGradient'), ...line }));
    }
    let tips = [];
    if (st.rays) {
      // Coroa radiante, alta e cheia: raios largos em leque, cada um com um lado claro e outro escuro e uma bolinha.
      let d = '', lit = '', shade = '', balls = '';
      for (let i = 0; i < st.rays; i++) {
        const x = -15.5 + 31 * i / (st.rays - 1), h = 12 + 9.5 * Math.cos(PI * x / 34);
        const L = [CX + x - 2.3, base], Rr = [CX + x + 2.3, base], T = [CX + x * 1.24, bt - h], M = [CX + x * 1.06, base];
        d += poly([L, T, Rr]); lit += poly([L, T, M]); shade += poly([M, T, Rr]);
        balls += circ(i % 2 ? 1 : 1.35, T[0], T[1] - 0.4);
      }
      g.append(s('path', { d, fill: cyl, ...line }));
      if (!tiny) g.append(s('path', { d: lit, fill: '#fff', 'fill-opacity': 0.2 }), s('path', { d: shade, fill: '#000', 'fill-opacity': 0.22 }), s('path', { d: balls, fill: m[3], stroke: m[0], 'stroke-width': 0.45 }));
    } else {
      // A crista: sobe a cada ponta e desce aos vales (lados côncavos nas coroas de curva).
      tips = st.tips.map(([x, h]) => [CX + x, bt - h]);
      const V = tips.slice(1).map((t, i) => [(tips[i][0] + t[0]) / 2, bt - st.valley]);
      const S0 = [CX - hw, base], E0 = [CX + hw, base];
      const go = (a, b) => (st.curve ? `Q${f(a[1] < b[1] ? a[0] : b[0])} ${f(Math.max(a[1], b[1]))} ` : 'L') + f(b[0]) + ' ' + f(b[1]);
      let d = `M${S0[0]} ${S0[1]}L${f(tips[0][0])} ${f(tips[0][1])}`;
      tips.forEach((t, i) => { if (i) d += go(V[i - 1], t); if (i < V.length) d += go(t, V[i]); });
      d += `L${E0[0]} ${E0[1]}Q${CX} ${f(bt + 3.6)} ${S0[0]} ${S0[1]}Z`;
      // De cristal: as pontas são pedra clara e transparente, não metal.
      const crest = st.crystal
        ? { fill: grad(defs, id + 'ci', [[0, '#ffffff'], [0.4, gemC[1]], [0.75, gemC[2]], [1, gemC[3]]], { x1: 0, y1: 0, x2: 0.3, y2: 1 }), stroke: gemC[3], 'stroke-width': tiny ? 0.9 : 0.6, 'stroke-linejoin': 'round' }
        : { fill: cyl, ...line };
      g.append(s('path', { d, class: st.crystal ? 'fm-crystal' : null, ...crest }));
      if (!tiny) {
        defs.append(s('clipPath', { id: id + 'cc' }, s('path', { d })));
        let lit = '', shade = '';
        tips.forEach((t, i) => {
          const vl = i ? V[i - 1] : [CX - hw, bt], vr = i < V.length ? V[i] : [CX + hw, bt], b = [t[0], base];
          lit += poly([vl, t, b]); shade += poly([t, vr, b]);
        });
        const k = st.crystal ? [0.55, 0.3] : [0.18, 0.22];
        g.append(s('g', { 'clip-path': `url(#${id}cc)` }, s('path', { d: lit, fill: '#fff', 'fill-opacity': k[0] }), s('path', { d: shade, fill: st.crystal ? gemC[3] : '#000', 'fill-opacity': k[1] })));
        // O cristal ainda ganha a aresta clara do meio de cada ponta.
        if (st.crystal) g.append(s('path', { d: tips.map(([x, y]) => `M${f(x)} ${f(y + 0.8)}L${f(x)} ${f(base - 0.6)}`).join(''), stroke: '#fff', 'stroke-opacity': 0.75, 'stroke-width': 0.45 }));
      }
    }
    // Enfeites das pontas.
    if (!tiny && tips.length) {
      if (st.tip === 'knob') {
        const kb = grad(defs, id + 'kb', [[0, m[3]], [0.55, m[2]], [1, m[0]]], { cx: '35%', cy: '30%', r: '75%' }, 'radialGradient');
        g.append(s('path', { d: tips.map(([x, y]) => circ(1.5, x, y - 0.9)).join(''), fill: kb, stroke: m[0], 'stroke-width': 0.45 }));
      }
      if (st.tip === 'pearl') g.append(pearls(tips.map(([x, y]) => [x, y - 1.4]), 2.05));
      if (st.tip === 'pearl' && st.band === 'pearls') {
        // Na Prata, mais uma pérola miúda em cada vale.
        g.append(pearls(tips.slice(1).map((t, i) => [(tips[i][0] + t[0]) / 2, bt - st.valley - 0.6]), 1.15));
      }
      if (st.tip === 'tiara') {
        const [x, y] = [CX, bt - 9.6];
        g.append(s('path', { d: `M${CX - 4.6} ${bt - 3.2}c-2.4 -.4 -4.4 -2 -3.8 -4.2M${CX + 4.6} ${bt - 3.2}c2.4 -.4 4.4 -2 3.8 -4.2`, fill: 'none', stroke: m[0], 'stroke-width': 0.6, 'stroke-linecap': 'round' }),
          pearls([tips[0], tips[2]].map(([px, py]) => [px, py - 1.4]), 2),
          s('ellipse', { cx: x, cy: y, rx: 4.6, ry: 5.6, fill: cyl, ...line }),
          s('g', { class: 'fm-crown-gem' }, smallGem(defs, id + 'tg', x, y, 3.5, 4.5, gemC, { stroke: gemC[3], 'stroke-width': 0.4 })));
      }
      if (st.tip === 'gem') {
        g.append(s('path', { d: tips.map(([x, y]) => `M${f(x - 1.9)} ${f(y - 5)}h3.8v4.8h-3.8Z`).join(''), fill: gemC[2], stroke: m[0], 'stroke-width': 0.5 }),
          s('path', { d: tips.map(([x, y]) => `M${f(x - 1.9)} ${f(y - 5)}L${f(x - 1)} ${f(y - 4.1)}h2l.9 -.9ZM${f(x - 1.9)} ${f(y - 0.2)}L${f(x - 1)} ${f(y - 1.1)}h2l.9 .9Z`).join(''), fill: gemC[3], 'fill-opacity': 0.7 }),
          s('path', { d: tips.map(([x, y]) => `M${f(x - 1)} ${f(y - 4.1)}h2v3h-2Z`).join(''), fill: gemC[1] }),
          s('path', { d: tips.map(([x, y]) => `M${f(x - 0.8)} ${f(y - 3.9)}h.9v.8h-.9Z`).join(''), fill: '#fff', 'fill-opacity': 0.9 }));
      }
      if (st.tip === 'spark') {
        g.append(s('path', { d: tips.map(([x, y], i) => circ(i === 3 ? 1.9 : 1.3, x, y - 0.6)).join(''), fill: '#eef8ff', stroke: gemC[3], 'stroke-width': 0.4 }),
          s('g', { class: 'fm-glint' }, starGlint(tips[3][0], tips[3][1] - 0.6, 5)));
      }
    }
    // A tiara de baixo, curvada como quem olha um pouco de cima.
    const bandD = `M${CX - hw} ${bt}Q${CX} ${bt + 2.4} ${CX + hw} ${bt}L${CX + hw} ${y0}Q${CX} ${y0 + 2.6} ${CX - hw} ${y0}Z`;
    g.append(s('path', { d: bandD, fill: cyl, ...line }));
    const gy = (bt + y0) / 2 + 1.2;
    if (tiny) {
      if (st.band !== 'studs') g.append(s('circle', { cx: CX, cy: gy, r: 2.6, fill: gemC[2] }));
      return g;
    }
    g.append(s('path', { d: bandD, fill: grad(defs, id + 'bs', [[0, '#fff', 0.3], [0.45, '#fff', 0], [0.6, '#000', 0], [1, '#000', 0.35]], { x1: 0, y1: 0, x2: 0, y2: 1 }) }),
      s('path', { d: `M${CX - hw + 1} ${f(bt + 0.9)}Q${CX} ${f(bt + 3.3)} ${CX + hw - 1} ${f(bt + 0.9)}`, fill: 'none', stroke: m[3], 'stroke-opacity': 0.85, 'stroke-width': 0.6 }));
    // O meio da tiara: rebites (Bronze), fileira de pérolas (Prata) ou pedras (as outras).
    const along = (n) => Array.from({ length: n }, (_, i) => { const t = (i + 0.5) / n, x = CX - hw + 2 + (2 * hw - 4) * t; return [x, gy - 0.4 + 2.2 * (1 - (2 * t - 1) ** 2) - 1.2]; });
    if (st.band === 'studs') {
      const kb = grad(defs, id + 'sd', [[0, m[3]], [0.55, m[2]], [1, m[0]]], { cx: '35%', cy: '30%', r: '75%' }, 'radialGradient');
      g.append(s('path', { d: along(7).map(([x, y]) => circ(1, x, y)).join(''), fill: kb, stroke: m[0], 'stroke-width': 0.4 }));
      return g;
    }
    if (st.band === 'pearls') {
      g.append(pearls(along(11), 0.95));
      g.append(smallGem(defs, id + 'cg', CX, gy, 2.6, 2.6, gemC, { stroke: m[0], 'stroke-width': 0.5 }));
      return g;
    }
    g.append(s('path', { d: `M${CX - hw + 1.6} ${f(y0 - 1.2)}Q${CX} ${f(y0 + 1.3)} ${CX + hw - 1.6} ${f(y0 - 1.2)}`, fill: 'none', stroke: '#fffaf0', 'stroke-opacity': 0.9, 'stroke-width': 1.1, 'stroke-linecap': 'round', 'stroke-dasharray': '0 2.9' }));
    const cg = grad(defs, id + 'cg', [[0, gemC[0]], [0.35, gemC[1]], [0.75, gemC[2]], [1, gemC[3]]], { cx: '35%', cy: '30%', r: '75%' }, 'radialGradient');
    const stone = { fill: cg, stroke: m[0], 'stroke-width': 0.6 };
    if (medal === 'esmeralda') g.append(s('rect', { x: CX - 2.4, y: gy - 2.1, width: 4.8, height: 4.2, rx: 0.6, ...stone }));
    else g.append(smallGem(defs, id + 'cm', CX, gy, medal === 'safira' ? 2.5 : 2.9, medal === 'safira' ? 3 : 2.6, gemC, { stroke: m[0], 'stroke-width': 0.6 }));
    for (const x of [-10.5, 10.5]) g.append(s('circle', { cx: CX + x, cy: f(gy - 0.4), r: 1.7, ...stone }));
    g.append(s('path', { d: circ(0.45, CX - 11.1, gy - 1) + circ(0.45, CX + 9.9, gy - 1), fill: '#fff', 'fill-opacity': 0.9 }));
    return g;
  }

  // O campo da medalha, conforme o acabamento. fo: o contorno do campo; dots: o anel de pontinhos do metal.
  function field(defs, id, medal, finish, fo, dots, rich, tiny) {
    const mat = MATERIALS[medal] || {};
    const g = s('g', { class: 'fm-field', 'clip-path': `url(#${id}cp)` });
    const cover = (fill, attrs = {}) => s('rect', { x: 0, y: 0, width: 120, height: 134, fill, ...attrs });
    const around = { cx: CX - 10, cy: CY - 14, r: 50, gradientUnits: 'userSpaceOnUse' };
    // Raios finos do centro para fora (guilhochê).
    const rays = (n, color, op, w, phase = 0) => {
      let d = '';
      for (let i = 0; i < n; i++) { const a = phase + i * 360 / n, [x0, y0] = polar(3, a), [x1, y1] = polar(R * 1.1, a); d += `M${f(x0)} ${f(y0)}L${f(x1)} ${f(y1)}`; }
      return s('path', { d, stroke: color, 'stroke-opacity': op, 'stroke-width': w, fill: 'none' });
    };
    const m = medal && finish ? mat.metal : SHADOW; // finish null aqui = ainda não forjada
    if (finish === 'esmalte') {
      // Vidro colorido sobre metal gravado: o desenho aparece por baixo, a borda fica mais funda e o vidro brilha.
      const [light, mid, dark] = mat.enamel;
      g.append(cover(grad(defs, id + 'en', [[0, light], [0.45, mid], [1, dark]], around, 'radialGradient')));
      if (rich) {
        g.append(rays(56, light, 0.3, 0.55), s('path', { d: [9, 15, 21, 27, 33].map((r) => circ(r)).join(''), fill: 'none', stroke: dark, 'stroke-opacity': 0.25, 'stroke-width': 0.6 }),
          cover(grad(defs, id + 'ev', [[0.5, dark, 0], [1, dark, 0.6]], { cx: CX, cy: CY, r: 44, gradientUnits: 'userSpaceOnUse' }, 'radialGradient')));
      }
      g.append(s('ellipse', { cx: CX - 6, cy: CY - R * 0.5, rx: R * 0.62, ry: R * 0.3, fill: grad(defs, id + 'gl', [[0, '#fff', 0.7], [1, '#fff', 0]], { x1: 0, y1: 0, x2: 0, y2: 1 }) }));
      g.append(s('ellipse', { cx: CX - R * 0.36, cy: CY - R * 0.4, rx: 3.4, ry: 1.6, transform: `rotate(-30 ${CX - R * 0.36} ${CY - R * 0.4})`, fill: '#fff', 'fill-opacity': 0.9 }));
    } else if (finish === 'holo') {
      // Folha holográfica: prata, o arco-íris que anda com o ponteiro (--mx/--my no CSS), anéis de difração e purpurina.
      g.append(cover(grad(defs, id + 'hb', [[0, '#f4f6fa'], [0.5, '#b9c1cd'], [1, '#7c8593']], { x1: 0, y1: 0, x2: 1, y2: 1 })));
      // Faixas repetidas e estreitas: o campo sempre mostra o arco-íris inteiro, e ele corre quando a faixa anda.
      const rainbow = grad(defs, id + 'hr', HOLO.map((c, i) => [f(i / (HOLO.length - 1)), c]), { x1: 0, y1: 0, x2: 52, y2: 26, gradientUnits: 'userSpaceOnUse', spreadMethod: 'repeat' });
      g.append(s('rect', { class: 'fm-holo', x: -60, y: -60, width: 240, height: 260, fill: rainbow }));
      if (rich) {
        g.append(s('path', { class: 'fm-holo fm-holo-lines', d: Array.from({ length: 14 }, (_, i) => circ(3 + i * 3.2, CX - 6, CY - 8)).join(''), fill: 'none', stroke: '#fff', 'stroke-opacity': 0.55, 'stroke-width': 0.9 }));
        let glitter = '';
        for (let i = 0; i < 16; i++) { const [x, y] = polar(R * 0.92 * Math.sqrt((i + 0.5) / 16), i * 137.5 + 20); glitter += sparkleD(x, y, i % 3 ? 0.9 : 1.7); }
        g.append(s('path', { d: glitter, fill: '#fff', 'fill-opacity': 0.85 }));
      }
    } else if (finish === 'galaxia') {
      // Nebulosa funda, um braço de galáxia em espiral, o núcleo aceso e estrelas que piscam.
      g.append(cover(grad(defs, id + 'gx', [[0, NEBULA[2]], [0.55, NEBULA[1]], [1, NEBULA[0]]], { cx: '58%', cy: '62%', r: '70%' }, 'radialGradient')));
      const clouds = rich ? [['#d946ef', CX - 12, CY + 8, 24, 13, -25], ['#22d3ee', CX + 14, CY - 10, 20, 10, 30], ['#8b5cf6', CX + 4, CY + 18, 26, 9, 10]] : [['#d946ef', CX - 8, CY + 6, 22, 12, -25], ['#22d3ee', CX + 10, CY - 8, 18, 9, 30]];
      clouds.forEach(([c, x, y, rx, ry, rot], i) => g.append(s('ellipse', { cx: x, cy: y, rx, ry, transform: `rotate(${rot} ${x} ${y})`,
        fill: grad(defs, id + 'nb' + i, [[0, c, 0.75], [0.5, c, 0.25], [1, c, 0]], {}, 'radialGradient') })));
      if (rich) {
        let arm = '';
        for (const turn of [0, 180]) arm += 'M' + Array.from({ length: 25 }, (_, i) => polar(3 + (i / 24) * R * 0.88, turn + 20 + (i / 24) * 290)).map(([x, y]) => f(x) + ' ' + f(y)).join('L');
        g.append(s('path', { d: arm, fill: 'none', stroke: '#c4b5fd', 'stroke-opacity': 0.2, 'stroke-width': 6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }),
          s('path', { d: arm, fill: 'none', stroke: '#f5d0fe', 'stroke-opacity': 0.4, 'stroke-width': 1, 'stroke-linejoin': 'round' }),
          s('circle', { cx: CX, cy: CY, r: 12, fill: grad(defs, id + 'gc', [[0, '#fff', 0.8], [0.35, '#f0abfc', 0.35], [1, '#a78bfa', 0]], {}, 'radialGradient') }));
      }
      if (tiny) {
        // Bem pequena: só uns pontos claros parados (estrela piscando a 28 px vira poeira que pisca).
        g.append(s('path', { d: [[-9, -7, 1.6], [8, -3, 1.3], [-2, 9, 1.4], [11, 10, 1.1]].map(([x, y, r]) => circ(r, CX + x, CY + y)).join(''), fill: '#fff', 'fill-opacity': 0.9 }));
        return g;
      }
      // Estrelas: pontos que piscam (a fase de cada uma é fixa para o desenho não mudar a cada render).
      const stars = rich ? 22 : 7;
      for (let i = 0; i < stars; i++) {
        const a = i * 137.5, r = R * 0.72 * Math.sqrt((i + 0.5) / stars);
        const [x, y] = polar(r, a);
        const big = i % 7 === 3;
        g.append(big && rich ? sparkle(x, y, 2.6, 'fm-star') : s('circle', { class: 'fm-star', cx: f(x), cy: f(y), r: i % 3 ? 0.55 : 0.9, fill: i % 5 ? '#fff' : '#ffe9a8' }));
        g.lastChild.style.animationDelay = (-(i * 0.37) % 2.4).toFixed(2) + 's';
      }
    } else {
      // Metal com guilhochê: raios finos (claro e escuro alternados) e um anel de pontinhos.
      g.append(cover(grad(defs, id + 'fm', [[0, m[3]], [0.35, m[2]], [0.75, m[1]], [1, m[0]]], around, 'radialGradient')));
      if (rich && finish) g.append(rays(72, '#ffffff', 0.22, 0.45), rays(72, m[0], 0.2, 0.45, 2.5), beads(dots, 44, 1.1, m, 'dot'));
    }
    if (rich) {
      // Campo rebaixado: a borda faz sombra em cima à esquerda e pega luz embaixo à direita.
      const moved = (dx, dy) => `translate(${dx} ${dy})` + (fo.t ? ' ' + fo.t : '');
      g.append(s('path', { d: fo.d, transform: moved(1.1, 1.5), fill: 'none', stroke: '#000', 'stroke-opacity': 0.5, 'stroke-width': 3.4 }),
        s('path', { d: fo.d, transform: moved(-0.8, -1), fill: 'none', stroke: '#fff', 'stroke-opacity': finish === 'esmalte' ? 0.5 : 0.22, 'stroke-width': 1.4 }));
    }
    return g;
  }

  // Nível IV: brilho por trás, na luz da medalha, com raios longos e curtos que somem para fora.
  function shine(defs, id, medal, rich) {
    const glow = mix(glowOf(medal), '#ffffff', 0.45);
    const g = s('g', { class: 'fm-shine' });
    g.append(s('circle', { cx: CX, cy: CY, r: 60, fill: grad(defs, id + 'sh', [[0, '#fff', 0.6], [0.42, glow, 0.3], [1, glow, 0]], {}, 'radialGradient') }));
    if (rich) {
      const fade = grad(defs, id + 'ry', [[0.3, '#fff', 0], [0.55, '#fff', 0.7], [0.8, glow, 0.35], [1, glow, 0]], { cx: CX, cy: CY, r: 64, gradientUnits: 'userSpaceOnUse' }, 'radialGradient');
      let d = '';
      for (let i = 0; i < 24; i++) {
        const long = i % 2 === 0, a = i * 15 + 7.5, w = long ? 2.4 : 1.3, r = long ? 64 : 52;
        d += poly([[CX, CY], polar(r, a - w), polar(r, a + w)]);
      }
      g.append(s('path', { class: 'fm-rays', d, fill: fade }));
    }
    return g;
  }

  function medalSvg(medal, level = 0, finish = null, size = 96) {
    medal = MATERIALS[medal] ? medal : 'bronze';
    level = Math.max(0, Math.min(4, level | 0));
    const lit = level > 0;
    const look = lit ? (FINISH_RARITY[finish] ? finish : 'metal') : null;
    const rich = size >= 56;
    // Abaixo de 40 px folhas viram pontinhos e fita comprida parece duas pernas: um arco só, fita curta,
    // nada de estrela piscando nem raios.
    const tiny = size < 40;
    const id = 'fm' + (++seq) + '-';
    const mat = MATERIALS[medal];
    const shape = SHAPE[medal];
    const fr = FRAME[medal];
    const svg = s('svg', { xmlns: NS, viewBox: `${VB.x} ${VB.y} ${VB.w} ${VB.h}`, width: size, height: Math.round(size * VB.h / VB.w),
      class: `forja-medal m-${medal} l${level} ` + (lit ? (finish ? 'fin-' + finish : 'fin-none') : 'unforged'),
      'data-medal': medal, 'data-level': level, 'data-finish': lit && finish ? finish : '', role: 'img', 'aria-label': `${MEDALS[medal]}${lit ? ' ' + ROMAN[level] + (finish ? ' · ' + (FINISHES[finish] || finish) : '') : ' (não forjada)'}` });
    const defs = s('defs');
    svg.append(defs);
    const m = lit ? mat.metal : SHADOW;
    const rim = grad(defs, id + 'rim', metalStops(m), { x1: 0, y1: 0, x2: 1, y2: 1 });
    const rev = grad(defs, id + 'bv', metalStops(m), { x1: 1, y1: 1, x2: 0, y2: 0 });
    // Um contorno: { r } vira círculo; { k } é a silhueta encolhida.
    const out = (spec) => (spec.r ? { d: circ(spec.r), t: '' } : { d: shape.d, t: spec.k === 1 ? '' : scaled(spec.k) });
    const draw = (o, attrs) => s('path', { d: o.d, transform: o.t || null, ...attrs });
    const fo = out(fr.field);
    defs.append(s('clipPath', { id: id + 'cp' }, draw(fo)));
    defs.append(s('clipPath', { id: id + 'pl' }, s('path', { d: shape.d })));
    const clipPl = `url(#${id}pl)`;

    if (level >= 4) svg.append(shine(defs, id, medal, rich));
    if (level >= 2) svg.append(ribbon(defs, id, medal, mat, m, rim, rich, tiny));
    if (level >= 3) svg.append(laurel(defs, id, m, mat, rich, tiny));

    // Sombra de contato e, no nível IV, um aro a mais por fora (com contas).
    if (rich) svg.append(s('path', { d: shape.d, transform: 'translate(0 2.4)', fill: '#000', 'fill-opacity': 0.35 }));
    if (level >= 4 && !tiny) {
      svg.append(s('path', { class: 'fm-crest-rim', d: shape.d, transform: scaled(1.075), fill: rev, stroke: m[0], 'stroke-width': 0.7 }));
      if (rich) svg.append(beads({ d: shape.d, t: scaled(1.04) }, 60, 1.25, m, 'pearl'));
    }
    // O aro alto.
    svg.append(s('path', { class: 'fm-plate', d: shape.d, fill: rim, stroke: m[0], 'stroke-width': tiny ? 1.4 : 1 }));
    if (rich) {
      // A quina de cima pega luz e a de baixo escurece.
      svg.append(s('path', { d: shape.d, transform: scaled(0.985), fill: 'none', 'stroke-width': 1.3,
        stroke: grad(defs, id + 'ed', [[0, '#fff', 0.9], [0.42, '#fff', 0], [0.58, '#000', 0], [1, '#000', 0.55]], { x1: 0, y1: 0, x2: 1, y2: 1 }) }));
      if (fr.chamfer) svg.append(s('g', { class: 'fm-bevel', 'clip-path': clipPl }, facets(chamfer(shape.pts, fr.chamfer).map(({ pts, b }) => [pts, rampAt(m, b)]), { stroke: m[0], 'stroke-opacity': 0.3, 'stroke-width': 0.3 })));
      if (fr.fan === 'rim') svg.append(s('g', { class: 'fm-bevel', 'clip-path': clipPl }, facets(fan(shape.pts).map(({ pts, b }) => [pts, ...veil(b)]))));
      if (lit) {
        // Metal escovado: linhas finas que acompanham a borda, claras e escuras alternadas.
        const lines = [0.905, 0.92, 0.935, 0.95, 0.965, 0.98];
        svg.append(s('g', { class: 'fm-brush', 'clip-path': clipPl, fill: 'none', 'stroke-width': 0.3 },
          lines.map((k, i) => s('path', { d: shape.d, transform: scaled(k), stroke: i % 2 ? '#000' : '#fff', 'stroke-opacity': i % 2 ? 0.16 : 0.22 }))));
        // Um brilho curto que corre pela borda (parado com Reduzir animações). Cada medalha começa num ponto.
        const run = s('path', { class: 'fm-edge-run', d: shape.d, transform: scaled(0.985), pathLength: 100, fill: 'none', stroke: '#fff', 'stroke-opacity': 0.85,
          'stroke-width': 1.5, 'stroke-linecap': 'round', 'stroke-dasharray': '5 95' });
        run.style.animationDelay = (-KEYS.indexOf(medal) * 0.9).toFixed(1) + 's';
        svg.append(run);
      }
      if (fr.slope) svg.append(draw(out(fr.slope), { fill: rev }));
      svg.append(draw(out(fr.inner), { fill: rim, stroke: m[0], 'stroke-opacity': 0.7, 'stroke-width': 0.8 }));
      if (fr.deco && lit) svg.append(beads(out(fr.deco[1]), fr.deco[2], fr.deco[0] === 'pearl' ? 2.5 : 2.2, m, fr.deco[0]));
    } else {
      svg.append(s('path', { class: 'fm-bevel', d: shape.d, transform: scaled(0.88), fill: rev }));
    }
    // O campo, com o acabamento.
    const dots = fr.field.r ? { d: circ(fr.field.r * 0.88), t: '' } : { d: shape.d, t: scaled(fr.field.k * 0.88) };
    svg.append(field(defs, id, lit ? medal : null, look, fo, dots, rich, tiny));
    svg.append(draw(fo, { fill: 'none', stroke: m[0], 'stroke-opacity': 0.6, 'stroke-width': tiny ? 1.2 : 0.8 }));
    // Galáxia: a borda dourada em volta da nebulosa (o metal da medalha continua o dela).
    if (look === 'galaxia') {
      const gold = grad(defs, id + 'gd', metalStops(GOLD), { x1: 0, y1: 0, x2: 1, y2: 1 });
      const w = fo.t ? 3.2 : 2.6;
      svg.append(draw(fo, { class: 'fm-gold-rim', fill: 'none', stroke: gold, 'stroke-width': w }), draw(fo, { fill: 'none', stroke: GOLD[3], 'stroke-opacity': 0.7, 'stroke-width': 0.6 }));
    }
    // Estrela e cruz: cada ponta com um lado claro e outro escuro, por cima do acabamento.
    if (rich && fr.fan === 'all') svg.append(s('g', { class: 'fm-bevel', 'clip-path': clipPl }, facets(fan(shape.pts).map(({ pts, b }) => [pts, ...veil(b)]))));

    // O centro: emblema em relevo (metais) ou pedra lapidada (pedras).
    if (mat.gem) {
      if (lit) {
        if (rich && fr.pearls) svg.append(beads({ d: circ(fr.pearls), t: '' }, 22, 2.4, m, 'pearl'));
        svg.append(gemNode(defs, id, medal, m, rev, rich));
      } else {
        svg.append(s('circle', { cx: CX, cy: CY, r: R * 0.46, fill: '#000', 'fill-opacity': 0.4 }));
      }
    } else {
      svg.append(emblem(defs, id, medal, m, mat.ink, lit, rich));
    }

    // Reflexo: uma faixa forte na diagonal (e uma fina ao lado) por cima de tudo, só dentro da medalha.
    if (lit) {
      if (rich) {
        const sp = grad(defs, id + 'sp', [[0, '#fff', 0], [0.5, '#fff', 0.36], [1, '#fff', 0]], { x1: 0, y1: 0, x2: 1, y2: 0 });
        const turn = `rotate(35 ${CX} ${CY})`;
        svg.append(s('g', { class: 'fm-spec', 'clip-path': clipPl },
          s('rect', { x: CX - 27, y: -20, width: 16, height: 190, fill: sp, transform: turn }),
          s('rect', { x: CX - 6, y: -20, width: 5, height: 190, fill: sp, 'fill-opacity': 0.7, transform: turn })));
        svg.append(sparkle(CX - R * 0.62, CY - R * 0.58, level >= 4 ? 6 : 4, 'fm-glint'));
      } else {
        const spec = grad(defs, id + 'sp', [[0, '#fff', 0.55], [0.45, '#fff', 0.08], [1, '#fff', 0]], { x1: 0, y1: 0, x2: 0.6, y2: 1 });
        svg.append(s('g', { class: 'fm-spec', 'clip-path': clipPl },
          s('ellipse', { cx: CX - 12, cy: CY - R * 0.62, rx: R * 0.9, ry: R * 0.5, transform: `rotate(-18 ${CX - 12} ${CY - R * 0.62})`, fill: spec })));
      }
    }
    if (level >= 4) {
      svg.append(crown(defs, id, medal, shape.top, m, tiny));
      // Estrelinhas em volta, cada uma piscando na sua vez.
      if (rich) {
        svg.append(s('g', { class: 'fm-aura' }, [[15, 30, 4.6], [105, 28, 3.6], [108, 96, 4], [12, 102, 3.2], [96, 4, 2.6]].map(([x, y, r], i) => {
          const p = sparkle(x, y, r, 'fm-glint');
          p.style.animationDelay = (-i * 0.7).toFixed(1) + 's';
          return p;
        })));
      }
    }
    return svg;
  }

  return { medalSvg, FINISH_RARITY, MATERIALS, glowOf, SHAPE, VB, CX, CY, R, s, f, poly, circ, rounded, grad, mix, scaled };
};
