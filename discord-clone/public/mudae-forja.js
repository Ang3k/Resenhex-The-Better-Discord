/* Mudae: a aba Forja do Salão. A parede com as 7 medalhas, o detalhe de cada uma (o que dá em cada nível e o
   preço do próximo), a forja animada, a escolha do acabamento e, embaixo, os 8 poderes. O servidor decide preço,
   nível, acabamento e o que falta; aqui só desenhamos o que ele diz. medalSvg também serve ao $forja do chat e
   ao cartão de perfil. */
window.MudaeForge = function ({ el, call, onSocket, ui, Sounds, reducedMotion = () => false, toast = () => {}, member }) {
  const NS = 'http://www.w3.org/2000/svg';
  const { num, minutes, kakera } = ui;
  const MEDALS = ui.MEDALS;
  const KEYS = Object.keys(MEDALS);
  const FINISHES = ui.FINISHES;
  const ROMAN = ui.ROMAN;
  const POWER = ui.POWER;
  const REFORGE_PRICE = 500;
  const FINISH_RARITY = { metal: 'common', esmalte: 'rare', holo: 'epic', galaxia: 'legendary' };
  // A curva de quem chega freando é a do app (--ease-enter, no motion.css); sem ela (teste), a do navegador.
  const token = (name, fallback) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
  const EASE = () => token('--ease-enter', 'ease-out');

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
  const HAMMER = { head: ['#2a2e35', '#9aa3ae', '#5d6570'], grip: ['#5a3418', '#a0673a'] };

  // ---------- desenho das medalhas ----------
  const VB = { x: 0, y: -4, w: 120, h: 138 };
  const CX = 60, CY = 70, R = 40;
  let seq = 0;
  function s(tag, attrs = {}, ...children) {
    const node = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) if (v != null && v !== false) node.setAttribute(k, String(v));
    for (const c of children.flat()) if (c) node.append(c);
    return node;
  }
  const f = (n) => Math.round(n * 100) / 100;
  const polar = (r, deg, cx = CX, cy = CY) => [cx + r * Math.cos(deg * Math.PI / 180), cy + r * Math.sin(deg * Math.PI / 180)];
  const poly = (pts) => 'M' + pts.map(([x, y]) => f(x) + ' ' + f(y)).join('L') + 'Z';
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
  const ring = (n, r, start = -90, rx = r, ry = r) => Array.from({ length: n }, (_, i) => { const a = (start + i * 360 / n) * Math.PI / 180; return [CX + rx * Math.cos(a), CY + ry * Math.sin(a)]; });

  // A silhueta de cada medalha (o "top" diz onde a coroa assenta).
  const SHAPES = {
    // Moeda de borda recortada.
    bronze: () => {
      const n = 18; let d = '';
      for (let i = 0; i < n; i++) {
        const a0 = -90 + i * 360 / n, a1 = a0 + 360 / n;
        const p0 = polar(R - 1.5, a0), c = polar(R + 4.5, (a0 + a1) / 2), p1 = polar(R - 1.5, a1);
        d += (i ? '' : 'M' + f(p0[0]) + ' ' + f(p0[1])) + 'Q' + f(c[0]) + ' ' + f(c[1]) + ' ' + f(p1[0]) + ' ' + f(p1[1]);
      }
      return { d: d + 'Z', top: CY - R - 2 };
    },
    // Escudo.
    prata: () => ({ d: `M${CX - R * 0.9} ${CY - R * 0.86}Q${CX} ${CY - R * 1.18} ${CX + R * 0.9} ${CY - R * 0.86}L${CX + R * 0.9} ${CY - R * 0.05}`
      + `Q${CX + R * 0.86} ${CY + R * 0.72} ${CX} ${CY + R * 1.1}Q${CX - R * 0.86} ${CY + R * 0.72} ${CX - R * 0.9} ${CY - R * 0.05}Z`, top: CY - R * 1.02 }),
    // Sol: borda de raios.
    ouro: () => ({ d: rounded(Array.from({ length: 40 }, (_, i) => polar(i % 2 ? R * 0.9 : R * 1.04, -90 + i * 9)), 0.8), top: CY - R * 1.02 }),
    // Hexágono.
    safira: () => ({ d: rounded(ring(6, R * 1.06), 6), top: CY - R * 1.0 }),
    // Cruz de braços abertos com um disco no meio (as duas formas giram no mesmo sentido, então se somam).
    rubi: () => {
      const pts = [];
      for (let k = 0; k < 4; k++) {
        const a = -90 + k * 90;
        pts.push(polar(R * 0.34, a - 45), polar(R * 1.04, a - 23), polar(R * 0.9, a), polar(R * 1.04, a + 23));
      }
      const r = R * 0.64;
      const disc = `M${CX} ${f(CY - r)}A${f(r)} ${f(r)} 0 1 1 ${CX} ${f(CY + r)}A${f(r)} ${f(r)} 0 1 1 ${CX} ${f(CY - r)}Z`;
      return { d: rounded(pts, 3) + disc, top: CY - R * 0.98 };
    },
    // Octógono alto, como o corte esmeralda.
    esmeralda: () => {
      const w = R * 0.86, h = R * 1.06, c = R * 0.34;
      return { d: rounded([[CX - w + c, CY - h], [CX + w - c, CY - h], [CX + w, CY - h + c], [CX + w, CY + h - c], [CX + w - c, CY + h], [CX - w + c, CY + h], [CX - w, CY + h - c], [CX - w, CY - h + c]], 4), top: CY - h };
    },
    // Estrela de ordem, de 8 pontas.
    diamante: () => ({ d: rounded(Array.from({ length: 16 }, (_, i) => polar(i % 2 ? R * 0.76 : R * 1.1, -90 + i * 22.5)), 1.6), top: CY - R * 1.1 }),
  };
  const SHAPE = Object.fromEntries(KEYS.map((k) => [k, SHAPES[k]()]));
  const scaled = (k) => `translate(${CX} ${CY}) scale(${k}) translate(${-CX} ${-CY})`;

  // Emblemas gravados das medalhas de metal (unidade: -1 a 1).
  const EMBLEMS = {
    bronze: () => poly(Array.from({ length: 10 }, (_, i) => { const a = (-90 + i * 36) * Math.PI / 180, r = i % 2 ? 0.42 : 1; return [r * Math.cos(a), r * Math.sin(a)]; })), // estrela: desejo
    prata: () => 'M-.62 -.92H.62V-.74Q.56 -.28 .14 0Q.56 .28 .62 .74V.92H-.62V.74Q-.56 .28 -.14 0Q-.56 -.28 -.62 -.74Z', // ampulheta: rolls guardados
    ouro: () => 'M0 -1L.7 -.42L.7 .42L0 1L-.7 .42L-.7 -.42Z', // cristal de kakera
  };

  function grad(defs, id, stops, attrs = {}, kind = 'linearGradient') {
    defs.append(s(kind, { id, ...attrs }, stops.map(([o, c, a]) => s('stop', { offset: o, 'stop-color': c, 'stop-opacity': a ?? 1 }))));
    return `url(#${id})`;
  }
  const metalStops = (m) => [[0, m[0]], [0.2, m[1]], [0.42, m[2]], [0.52, m[3]], [0.74, m[4]], [1, m[5]]];

  // Pedra lapidada: o contorno, as facetas (claras viradas para a luz do alto à esquerda), a mesa e o brilho.
  function gemNode(defs, id, medal, rich) {
    const g = MATERIALS[medal].gem;
    const cuts = {
      safira: { outer: ring(12, 0, -90, R * 0.4, R * 0.5), table: ring(12, 0, -90, R * 0.22, R * 0.28) },
      rubi: { outer: ring(10, R * 0.44), table: ring(10, R * 0.24, -72) },
      diamante: { outer: ring(16, R * 0.47), table: ring(8, R * 0.25, -90 + 22.5) },
    };
    const node = s('g', { class: 'fm-gem' });
    const body = grad(defs, id + 'gb', [[0, g[1]], [0.45, g[2]], [1, g[3]]], { cx: '35%', cy: '30%', r: '80%' }, 'radialGradient');
    const tableFill = grad(defs, id + 'gt', [[0, g[0], 0.95], [0.55, g[1], 0.85], [1, g[2], 0.9]], { x1: 0, y1: 0, x2: 1, y2: 1 });
    const facet = (pts, mid) => {
      // Luz vindo do alto à esquerda (225°): quanto a faceta olha para ela.
      const b = Math.cos((mid - 225) * Math.PI / 180);
      return s('path', { d: poly(pts), fill: b > 0 ? '#fff' : '#000', 'fill-opacity': f(b > 0 ? 0.08 + b * 0.38 : -b * 0.32), stroke: g[3], 'stroke-opacity': 0.35, 'stroke-width': 0.4 });
    };
    const angle = ([x, y]) => Math.atan2(y - CY, x - CX) * 180 / Math.PI;
    let outer;
    if (medal === 'esmeralda') {
      // Corte em degraus: octógonos um dentro do outro.
      const oct = (k) => [[-1, -1.4], [1, -1.4], [1.4, -1], [1.4, 1], [1, 1.4], [-1, 1.4], [-1.4, 1], [-1.4, -1]].map(([x, y]) => [CX + x * R * 0.27 * k, CY + y * R * 0.36 * k]);
      outer = oct(1);
      node.append(s('path', { d: poly(outer), fill: body }));
      const steps = rich ? [1, 0.78, 0.56] : [1, 0.6];
      for (let st = 0; st < steps.length - 1; st++) {
        const a = oct(steps[st]), b = oct(steps[st + 1]);
        for (let i = 0; i < 8; i++) node.append(facet([a[i], a[(i + 1) % 8], b[(i + 1) % 8], b[i]], angle([(a[i][0] + a[(i + 1) % 8][0]) / 2, (a[i][1] + a[(i + 1) % 8][1]) / 2])));
      }
      node.append(s('path', { d: poly(oct(steps.at(-1))), fill: tableFill }));
    } else {
      const cut = cuts[medal];
      outer = cut.outer;
      const table = cut.table;
      node.append(s('path', { d: poly(outer), fill: body }));
      const n = outer.length, m = table.length;
      if (rich || n === m) {
        for (let i = 0; i < n; i++) {
          const o0 = outer[i], o1 = outer[(i + 1) % n];
          const t0 = table[Math.floor(i * m / n) % m], t1 = table[Math.floor((i + 1) * m / n) % m];
          const pts = t0 === t1 ? [o0, o1, t0] : [o0, o1, t1, t0];
          node.append(facet(pts, angle([(o0[0] + o1[0]) / 2, (o0[1] + o1[1]) / 2])));
        }
      }
      node.append(s('path', { d: poly(table), fill: tableFill }));
      if (medal === 'diamante' && rich) {
        // O "fogo" do diamante: lascas de cor nas facetas.
        const fire = ['#ff9ad5', '#9af0ff', '#fff59a', '#b9a4ff'];
        for (let i = 0; i < 4; i++) {
          const o0 = outer[i * 4 + 1], o1 = outer[i * 4 + 2], t = table[(i * 2 + 1) % 8];
          node.append(s('path', { d: poly([o0, o1, t]), fill: fire[i], 'fill-opacity': 0.32 }));
        }
        // Estrela no meio da mesa.
        node.append(s('path', { d: poly(table.map((p, i) => (i % 2 ? [(p[0] + CX) / 2, (p[1] + CY) / 2] : p))), fill: '#fff', 'fill-opacity': 0.25 }));
      }
    }
    // Aro que segura a pedra.
    node.append(s('path', { d: poly(outer), fill: 'none', stroke: g[3], 'stroke-width': 0.9, 'stroke-opacity': 0.9 }));
    // Brilho: um reflexo largo e uma estrelinha.
    node.append(s('ellipse', { cx: CX - R * 0.14, cy: CY - R * 0.2, rx: R * 0.15, ry: R * 0.07, transform: `rotate(-35 ${CX - R * 0.14} ${CY - R * 0.2})`, fill: '#fff', 'fill-opacity': 0.55 }));
    if (rich) node.append(sparkle(CX - R * 0.2, CY - R * 0.26, 5.5, 'fm-glint'));
    return node;
  }

  function sparkle(x, y, r, cls) {
    const k = r * 0.22;
    return s('path', { class: cls, d: `M${f(x)} ${f(y - r)}Q${f(x + k)} ${f(y - k)} ${f(x + r)} ${f(y)}Q${f(x + k)} ${f(y + k)} ${f(x)} ${f(y + r)}Q${f(x - k)} ${f(y + k)} ${f(x - r)} ${f(y)}Q${f(x - k)} ${f(y - k)} ${f(x)} ${f(y - r)}Z`, fill: '#fff' });
  }

  // Fita do nível II: duas pontas de tecido saindo de trás da medalha, com a ponta em V.
  function ribbon(defs, id, mat) {
    const [cloth, stripe] = mat.ribbon;
    const fill = grad(defs, id + 'rb', [[0, cloth], [0.55, cloth], [1, '#000', 1]], { x1: 0, y1: 0, x2: 0, y2: 1 });
    const g = s('g', { class: 'fm-ribbon' });
    for (const side of [-1, 1]) {
      const sx = CX + side * 7, sy = CY + 6, ex = CX + side * 27, ey = CY + R + 22;
      const dx = ex - sx, dy = ey - sy, len = Math.hypot(dx, dy), nx = -dy / len, ny = dx / len, w = 9;
      const notch = [ex - dx / len * 7, ey - dy / len * 7];
      g.append(s('path', { d: poly([[sx + nx * w, sy + ny * w], [ex + nx * w, ey + ny * w], notch, [ex - nx * w, ey - ny * w], [sx - nx * w, sy - ny * w]]), fill, stroke: '#000', 'stroke-opacity': 0.35, 'stroke-width': 0.6 }));
      const k = 2.6;
      g.append(s('path', { d: poly([[sx + nx * k, sy + ny * k], [ex + nx * k - dx / len * 3.5, ey + ny * k - dy / len * 3.5], [ex - nx * k - dx / len * 3.5, ey - ny * k - dy / len * 3.5], [sx - nx * k, sy - ny * k]]), fill: stripe, 'fill-opacity': 0.9 }));
    }
    return g;
  }

  // Louros do nível III: dois ramos subindo pelos lados, no metal da medalha.
  function laurel(fill, dark, rich) {
    const g = s('g', { class: 'fm-laurel' });
    const leaves = rich ? 7 : 4, rl = R + 7;
    // Folha pontuda, deitada no eixo x a partir do cabo (0, 0).
    const leafPath = (L, W) => `M0 0Q${f(L * 0.4)} ${f(-W)} ${f(L)} 0Q${f(L * 0.4)} ${f(W)} 0 0Z`;
    for (const side of [-1, 1]) {
      const from = 116, to = 238;
      const at = (t) => (side < 0 ? from + (to - from) * t : 180 - (from + (to - from) * t));
      const arc = Array.from({ length: 9 }, (_, i) => polar(rl, at(i / 8)));
      g.append(s('path', { d: 'M' + arc.map(([x, y]) => f(x) + ' ' + f(y)).join('L'), fill: 'none', stroke: dark, 'stroke-width': 1.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
      for (let i = 0; i <= leaves; i++) {
        const t = i / leaves, a = at(t);
        const dir = a - 90 * side; // para onde o ramo cresce
        const size = 1.05 - t * 0.3;
        const [x, y] = polar(rl, a);
        const pairs = i === leaves ? [0] : rich ? [1, -1] : [1];
        for (const out of pairs) {
          const rot = dir + out * 38 * side;
          g.append(s('path', { d: leafPath(11 * size, 3.8 * size), transform: `translate(${f(x)} ${f(y)}) rotate(${f(rot)})`, fill, stroke: dark, 'stroke-width': 0.5, 'stroke-linejoin': 'round' }));
          if (rich) g.append(s('path', { d: `M0.8 0L${f(8.8 * size)} 0`, transform: `translate(${f(x)} ${f(y)}) rotate(${f(rot)})`, stroke: dark, 'stroke-opacity': 0.55, 'stroke-width': 0.4 }));
        }
      }
    }
    return g;
  }

  // Coroa do nível IV, sempre em ouro, com as pedras da cor da medalha.
  function crown(defs, id, top, gemColor) {
    const fill = grad(defs, id + 'cr', metalStops(GOLD), { x1: 0, y1: 0, x2: 1, y2: 1 });
    const b = top + 3;
    const g = s('g', { class: 'fm-crown' });
    g.append(s('path', { d: `M${CX - 17} ${b}L${CX - 20} ${b - 16}L${CX - 9.5} ${b - 8}L${CX} ${b - 21}L${CX + 9.5} ${b - 8}L${CX + 20} ${b - 16}L${CX + 17} ${b}Z`, fill, stroke: GOLD[0], 'stroke-width': 0.8, 'stroke-linejoin': 'round' }));
    g.append(s('rect', { x: CX - 18, y: b - 3, width: 36, height: 6.5, rx: 2, fill, stroke: GOLD[0], 'stroke-width': 0.8 }));
    for (const [x, y] of [[CX - 20, b - 17], [CX, b - 22.5], [CX + 20, b - 17]]) g.append(s('circle', { cx: x, cy: y, r: 2.3, fill: '#fff8e1', stroke: GOLD[1], 'stroke-width': 0.6 }));
    for (const x of [CX - 10, CX, CX + 10]) g.append(s('circle', { cx: x, cy: b + 0.2, r: x === CX ? 2.2 : 1.6, fill: gemColor, stroke: '#000', 'stroke-opacity': 0.4, 'stroke-width': 0.4 }));
    g.append(s('path', { d: `M${CX - 15} ${b - 1.8}H${CX + 15}`, stroke: '#fff', 'stroke-opacity': 0.55, 'stroke-width': 0.7 }));
    return g;
  }

  // O campo da medalha, conforme o acabamento.
  function field(defs, id, medal, finish, d, clip, rich) {
    const mat = MATERIALS[medal] || {};
    const g = s('g', { class: 'fm-field', 'clip-path': clip });
    const cover = (fill, attrs = {}) => s('rect', { x: 0, y: 0, width: 120, height: 134, fill, ...attrs });
    if (finish === 'esmalte') {
      const [light, mid, dark] = mat.enamel;
      g.append(cover(grad(defs, id + 'en', [[0, light], [0.45, mid], [1, dark]], { cx: '42%', cy: '36%', r: '68%' }, 'radialGradient')));
      // Vidro: uma lua de luz em cima e um reflexo duro.
      g.append(s('ellipse', { cx: CX - 6, cy: CY - R * 0.5, rx: R * 0.62, ry: R * 0.3, fill: grad(defs, id + 'gl', [[0, '#fff', 0.7], [1, '#fff', 0]], { x1: 0, y1: 0, x2: 0, y2: 1 }) }));
      g.append(s('ellipse', { cx: CX - R * 0.36, cy: CY - R * 0.4, rx: 3.4, ry: 1.6, transform: `rotate(-30 ${CX - R * 0.36} ${CY - R * 0.4})`, fill: '#fff', 'fill-opacity': 0.9 }));
    } else if (finish === 'holo') {
      g.append(cover(grad(defs, id + 'hb', [[0, '#f4f6fa'], [0.5, '#b9c1cd'], [1, '#7c8593']], { x1: 0, y1: 0, x2: 1, y2: 1 })));
      // O arco-íris: uma faixa larga que anda com o ponteiro (--mx/--my no CSS).
      // Faixas repetidas e estreitas: o campo sempre mostra o arco-íris inteiro, e ele corre quando a faixa anda.
      const rainbow = grad(defs, id + 'hr', HOLO.map((c, i) => [f(i / (HOLO.length - 1)), c]), { x1: 0, y1: 0, x2: 52, y2: 26, gradientUnits: 'userSpaceOnUse', spreadMethod: 'repeat' });
      g.append(s('rect', { class: 'fm-holo', x: -60, y: -60, width: 240, height: 260, fill: rainbow }));
      if (rich) {
        const lines = s('g', { class: 'fm-holo fm-holo-lines', 'stroke-opacity': 0.35 });
        for (let i = -12; i < 22; i++) lines.append(s('path', { d: `M${i * 9} -60l60 200`, stroke: '#fff', 'stroke-width': 0.7 }));
        g.append(lines);
      }
    } else if (finish === 'galaxia') {
      g.append(cover(grad(defs, id + 'gx', [[0, NEBULA[2]], [0.55, NEBULA[1]], [1, NEBULA[0]]], { cx: '58%', cy: '62%', r: '70%' }, 'radialGradient')));
      const clouds = rich ? [['#d946ef', CX - 12, CY + 8, 24, 13, -25], ['#22d3ee', CX + 14, CY - 10, 20, 10, 30], ['#8b5cf6', CX + 4, CY + 18, 26, 9, 10]] : [['#d946ef', CX - 8, CY + 6, 22, 12, -25], ['#22d3ee', CX + 10, CY - 8, 18, 9, 30]];
      clouds.forEach(([c, x, y, rx, ry, rot], i) => g.append(s('ellipse', { cx: x, cy: y, rx, ry, transform: `rotate(${rot} ${x} ${y})`,
        fill: grad(defs, id + 'nb' + i, [[0, c, 0.75], [0.5, c, 0.25], [1, c, 0]], {}, 'radialGradient') })));
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
      // Metal escovado.
      const m = medal && finish ? mat.metal : SHADOW; // finish null aqui = ainda não forjada
      g.append(cover(grad(defs, id + 'fm', [[0, m[3]], [0.35, m[2]], [0.75, m[1]], [1, m[0]]], { cx: '36%', cy: '30%', r: '85%' }, 'radialGradient')));
      if (rich && finish) {
        defs.append(s('filter', { id: id + 'br', x: 0, y: 0, width: 1, height: 1 },
          s('feTurbulence', { type: 'fractalNoise', baseFrequency: '0.012 0.85', numOctaves: 2, seed: (seq % 9) + 1 }),
          s('feColorMatrix', { type: 'saturate', values: 0 }),
          s('feComponentTransfer', {}, s('feFuncA', { type: 'linear', slope: 0, intercept: 0.42 }))));
        g.append(cover('#fff', { filter: `url(#${id}br)`, class: 'fm-brush' }));
      }
    }
    // Sulco gravado na borda do campo.
    const groove = s('g', {}, s('path', { d, transform: scaled(0.76), fill: 'none', stroke: '#000', 'stroke-opacity': 0.45, 'stroke-width': 1.4 }));
    return [g, groove];
  }

  function medalSvg(medal, level = 0, finish = null, size = 96) {
    medal = MATERIALS[medal] ? medal : 'bronze';
    level = Math.max(0, Math.min(4, level | 0));
    const lit = level > 0;
    const look = lit ? (FINISH_RARITY[finish] ? finish : 'metal') : null;
    const rich = size >= 56;
    const id = 'fm' + (++seq) + '-';
    const mat = MATERIALS[medal];
    const shape = SHAPE[medal];
    const svg = s('svg', { xmlns: NS, viewBox: `${VB.x} ${VB.y} ${VB.w} ${VB.h}`, width: size, height: Math.round(size * VB.h / VB.w),
      class: `forja-medal m-${medal} l${level} ` + (lit ? (finish ? 'fin-' + finish : 'fin-none') : 'unforged'),
      'data-medal': medal, 'data-level': level, 'data-finish': lit && finish ? finish : '', role: 'img', 'aria-label': `${MEDALS[medal]}${lit ? ' ' + ROMAN[level] + (finish ? ' · ' + (FINISHES[finish] || finish) : '') : ' (não forjada)'}` });
    const defs = s('defs');
    svg.append(defs);
    const rimMetal = lit ? mat.metal : SHADOW;
    const rim = grad(defs, id + 'rim', metalStops(rimMetal), { x1: 0, y1: 0, x2: 1, y2: 1 });
    const bevel = grad(defs, id + 'bv', metalStops(rimMetal), { x1: 1, y1: 1, x2: 0, y2: 0 });
    const leaf = grad(defs, id + 'lf', [[0, rimMetal[3]], [0.5, rimMetal[2]], [1, rimMetal[1]]], { x1: 0, y1: 0, x2: 0, y2: 1 });
    defs.append(s('clipPath', { id: id + 'cp' }, s('path', { d: shape.d, transform: scaled(0.76) })));
    defs.append(s('clipPath', { id: id + 'pl' }, s('path', { d: shape.d })));
    const clip = `url(#${id}cp)`;

    // Nível IV: o brilho por trás de tudo.
    if (level >= 4) {
      const shine = s('g', { class: 'fm-shine' });
      shine.append(s('circle', { cx: CX, cy: CY, r: 62, fill: grad(defs, id + 'sh', [[0, '#fff6d0', 0.85], [0.35, GOLD[2], 0.35], [1, GOLD[2], 0]], {}, 'radialGradient') }));
      if (rich) {
        // Raios que somem para fora (o degradê é pelo centro da medalha).
        const fade = grad(defs, id + 'ry', [[0, '#fffbe6', 0.7], [0.55, GOLD[3], 0.3], [1, GOLD[2], 0]], { cx: CX, cy: CY, r: 62, gradientUnits: 'userSpaceOnUse' }, 'radialGradient');
        const rays = s('g', { class: 'fm-rays', fill: fade });
        for (let i = 0; i < 16; i++) {
          const a = i * 22.5, w = i % 2 ? 1.6 : 3, [x1, y1] = polar(62, a - w), [x2, y2] = polar(62, a + w);
          rays.append(s('path', { d: poly([[CX, CY], [x1, y1], [x2, y2]]), 'fill-opacity': i % 2 ? 0.6 : 1 }));
        }
        shine.append(rays);
      }
      svg.append(shine);
    }
    if (level >= 2) svg.append(ribbon(defs, id, mat));
    if (level >= 3) svg.append(laurel(leaf, rimMetal[0], rich));

    // Sombra de contato, aro, chanfro e campo.
    if (rich) svg.append(s('path', { d: shape.d, transform: 'translate(0 2.4)', fill: '#000', 'fill-opacity': 0.35 }));
    svg.append(s('path', { class: 'fm-plate', d: shape.d, fill: rim, stroke: rimMetal[0], 'stroke-width': 1 }));
    svg.append(s('path', { class: 'fm-bevel', d: shape.d, transform: scaled(0.88), fill: bevel }));
    const [area, groove] = field(defs, id, lit ? medal : null, look, shape.d, clip, rich);
    svg.append(area, groove);
    // Galáxia: a borda dourada em volta da nebulosa (o metal da medalha continua o dela).
    if (look === 'galaxia') {
      const gold = grad(defs, id + 'gd', metalStops(GOLD), { x1: 0, y1: 0, x2: 1, y2: 1 });
      svg.append(s('path', { class: 'fm-gold-rim', d: shape.d, transform: scaled(0.77), fill: 'none', stroke: gold, 'stroke-width': 3.2 }),
        s('path', { d: shape.d, transform: scaled(0.77), fill: 'none', stroke: GOLD[3], 'stroke-opacity': 0.7, 'stroke-width': 0.6 }));
    }

    // O centro: emblema em relevo (metais) ou pedra lapidada (pedras).
    if (mat.gem) {
      if (lit) {
        // Engaste: um aro de metal em volta da pedra.
        const setting = gemNode(defs, id, medal, rich);
        svg.append(s('g', { class: 'fm-setting' }, s('circle', { cx: CX, cy: CY, r: medal === 'esmeralda' ? R * 0.58 : R * 0.56, fill: 'none', stroke: rim, 'stroke-width': 3 }),
          s('circle', { cx: CX, cy: CY, r: medal === 'esmeralda' ? R * 0.58 : R * 0.56, fill: 'none', stroke: '#000', 'stroke-opacity': 0.35, 'stroke-width': 0.6 })), setting);
      } else {
        svg.append(s('circle', { cx: CX, cy: CY, r: R * 0.46, fill: '#000', 'fill-opacity': 0.4 }));
      }
    } else {
      const d = EMBLEMS[medal]();
      const k = R * 0.42;
      const at = (dx, dy) => `translate(${CX + dx} ${CY + dy}) scale(${k})`;
      if (lit) {
        const relief = grad(defs, id + 'em', [[0, rimMetal[3]], [0.5, rimMetal[2]], [1, rimMetal[1]]], { x1: 0, y1: 0, x2: 0.4, y2: 1 });
        svg.append(s('g', { class: 'fm-emblem' },
          s('path', { d, transform: at(0.9, 1.3), fill: mat.ink, 'fill-opacity': 0.6 }),
          s('path', { d, transform: at(0, 0), fill: relief, stroke: rimMetal[0], 'stroke-width': 0.9 / k, 'stroke-opacity': 0.8 }),
          rich ? s('path', { d, transform: at(-0.5, -0.6) + ' scale(.82)', fill: 'none', stroke: '#fff', 'stroke-opacity': 0.45, 'stroke-width': 0.6 / k }) : null));
      } else {
        svg.append(s('path', { d, transform: at(0, 0), fill: '#000', 'fill-opacity': 0.45 }));
      }
    }

    // Luz de cima no aro e o reflexo largo.
    if (lit) {
      const spec = grad(defs, id + 'sp', [[0, '#fff', 0.55], [0.45, '#fff', 0.08], [1, '#fff', 0]], { x1: 0, y1: 0, x2: 0.6, y2: 1 });
      svg.append(s('g', { class: 'fm-spec', 'clip-path': `url(#${id}pl)` },
        s('ellipse', { cx: CX - 12, cy: CY - R * 0.62, rx: R * 0.9, ry: R * 0.5, transform: `rotate(-18 ${CX - 12} ${CY - R * 0.62})`, fill: spec })));
      if (rich) svg.append(sparkle(CX - R * 0.62, CY - R * 0.58, level >= 4 ? 6 : 4, 'fm-glint'));
    }
    if (level >= 4) svg.append(crown(defs, id, shape.top, mat.gem ? mat.gem[2] : mat.enamel[1]));
    return svg;
  }

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
      el('div', { class: 'forja-main' }, wall(), panel()),
      powersSection());
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
    const scene = el('div', { class: 'forja-scene' + (m.level ? '' : ' cold') },
      el('div', { class: 'forja-fire', ariaHidden: 'true' }),
      el('div', { class: 'forja-anvil', ariaHidden: 'true' }),
      el('div', { class: 'forja-stage-medal' }, medalSvg(key, m.level, m.finish, 168)));
    follow(scene);
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
          n <= m.level ? el('span', { class: 'forja-perk-price got', textContent: '✓' })
            : el('span', { class: 'forja-perk-price' }, base ? num(base * n) : '', base ? kakera() : null)))),
        m.offer && !animating ? choice(key, m) : null,
        actions));
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

  // ---------- a forja animada ----------
  function finish() {
    animating = false;
    busy = false;
    draw();
    const fresh = host?.querySelector('.forja-stage-medal');
    if (fresh && reducedMotion()) fresh.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 320, easing: 'linear' });
    while (waiting.length) show(waiting.shift());
  }

  function forgeScene(key, level, reveal, hits) {
    animating = true;
    const scene = host?.querySelector('.forja-scene');
    // Sem a tela (a aba fechou) ou com "Reduzir animações": só um fade da medalha nova.
    if (!scene || reducedMotion()) { finish(); return Promise.resolve(); }
    draw(); // tira a escolha antiga e liga o estado de forja
    const stage = host.querySelector('.forja-scene');
    const slot = stage.querySelector('.forja-stage-medal');
    stage.classList.add('forging');
    for (const b of host.querySelectorAll('.forja-forge, .forja-reforge')) b.disabled = true;
    // A forma vazia: a silhueta da medalha, ainda escura.
    slot.replaceChildren(medalSvg(key, 0, null, 168));
    slot.firstChild.classList.add('forja-mold');
    Sounds.play('mudaeForge');
    const ease = EASE();
    // Os cristais entram pelo alto da forja, em arco, e somem dentro da forma.
    const box = stage.getBoundingClientRect();
    const w = box.width || 400, h = box.height || 260;
    for (let i = 0; i < 10; i++) {
      const gem = el('span', { class: 'forja-fly', ariaHidden: 'true' }, kakera());
      stage.append(gem);
      const side = i % 2 ? 1 : -1;
      const dx = side * (w / 2 - 24 - (i % 3) * 14), dy = -h / 2 + 8 + (i % 4) * 10;
      gem.animate([{ transform: `translate(${dx}px, ${dy}px) scale(.6)`, opacity: 0 }, { offset: 0.12, opacity: 1 },
        { transform: `translate(${dx * 0.45}px, ${dy - 26}px) scale(1.15)`, offset: 0.5 }, { transform: 'translate(0, -17px) scale(.25)', opacity: 0 }],
      { duration: 640, delay: i * 40, easing: ease, fill: 'both' });
      later(640 + i * 40 + 40, () => gem.remove());
    }
    // A forja esquenta.
    later(380, () => stage.classList.add('hot'));
    // O martelo bate.
    const hammer = el('span', { class: 'forja-hammer', ariaHidden: 'true' }, hammerSvg());
    const first = hits === 1 ? 900 : 1000, gap = 350;
    // O martelo fica preso à medalha (gira pelo cabo, à direita) e desce até a face dela.
    later(first - 160, () => {
      slot.append(hammer);
      hammer.animate([{ transform: 'rotate(70deg)', opacity: 0 }, { transform: 'rotate(40deg)', opacity: 1 }], { duration: 160, easing: ease, fill: 'both' });
    });
    for (let h = 0; h < hits; h++) {
      later(first + h * gap, () => {
        hammer.animate([{ transform: 'rotate(40deg)' }, { transform: 'rotate(-6deg)', offset: 0.32 }, { transform: 'rotate(-2deg)', offset: 0.45 }, { transform: 'rotate(40deg)' }],
          { duration: 330, easing: 'linear', fill: 'both' });
        later(105, () => { Sounds.play('mudaeHammer'); strike(stage, slot, h); });
      });
    }
    const out = first + (hits - 1) * gap + 420;
    later(out, () => hammer.remove());
    // A medalha sai em brasa e esfria até mostrar o acabamento.
    later(out + 40, () => {
      stage.classList.remove('hot');
      slot.replaceChildren(medalSvg(key, level, reveal, 168));
      const svg = slot.firstChild;
      // Esfriar é devagar e por igual: em brasa, vermelho, e só no fim o acabamento aparece.
      svg.animate([{ filter: 'brightness(2.2) sepia(1) saturate(6) hue-rotate(-28deg) drop-shadow(0 0 20px #ff7a1a)', transform: 'scale(1.07)' },
        { filter: 'brightness(1.8) sepia(1) saturate(5) hue-rotate(-24deg) drop-shadow(0 0 16px #ff7a1a)', transform: 'scale(1)', offset: 0.3 },
        { filter: 'brightness(1.3) sepia(.6) saturate(2.6) hue-rotate(-14deg) drop-shadow(0 0 8px #ff7a1a)', offset: 0.65 },
        { filter: 'brightness(1) sepia(0) saturate(1) hue-rotate(0deg) drop-shadow(0 0 0 transparent)', transform: 'scale(1)' }], { duration: 1000, easing: 'linear' });
    });
    return new Promise((done) => later(out + 1080, () => { stage.classList.remove('forging'); finish(); done(); }));
  }

  // Uma batida: a forma pula e saem faíscas.
  function strike(stage, slot, h) {
    slot.animate([{ transform: 'scale(1)' }, { transform: 'scale(.95, 1.04)', offset: 0.3 }, { transform: 'scale(1)' }], { duration: 220, easing: 'linear' });
    stage.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(2px)', offset: 0.3 }, { transform: 'translateY(0)' }], { duration: 160, easing: 'linear' });
    const ease = EASE();
    for (let i = 0; i < 14; i++) {
      const spark = el('span', { class: 'forja-spark' + (i % 3 ? '' : ' long'), ariaHidden: 'true' });
      slot.append(spark);
      const deg = -170 + (i * 160) / 13 + h * 9, dist = 50 + ((i * 37 + h * 13) % 60);
      spark.animate([{ transform: `rotate(${deg}deg) translateX(0) scaleX(1)`, opacity: 1 }, { transform: `rotate(${deg + 18}deg) translateX(${dist}px) scaleX(.4)`, opacity: 0 }],
        { duration: 380 + (i % 4) * 70, easing: ease, fill: 'forwards' });
      later(700, () => spark.remove());
    }
  }

  function hammerSvg() {
    const id = 'fh' + (++seq) + '-';
    const defs = s('defs');
    const head = grad(defs, id + 'h', [[0, HAMMER.head[1]], [0.5, HAMMER.head[2]], [1, HAMMER.head[0]]], { x1: 0, y1: 0, x2: 0, y2: 1 });
    const grip = grad(defs, id + 'g', [[0, HAMMER.grip[1]], [1, HAMMER.grip[0]]], { x1: 0, y1: 0, x2: 1, y2: 0 });
    // Deitado: a cabeça à esquerda e o cabo indo até o ponto de giro, à direita.
    return s('svg', { viewBox: '0 0 130 64', width: 130, height: 64 }, defs,
      s('rect', { x: 30, y: 27, width: 98, height: 10, rx: 5, fill: grip, stroke: HAMMER.grip[0], 'stroke-width': 0.8 }),
      s('rect', { x: 36, y: 24, width: 10, height: 16, rx: 2, fill: head }),
      s('rect', { x: 6, y: 4, width: 32, height: 56, rx: 4, fill: head, stroke: HAMMER.head[0], 'stroke-width': 1.2 }),
      s('rect', { x: 2, y: 9, width: 8, height: 46, rx: 3, fill: head, stroke: HAMMER.head[0], 'stroke-width': 1 }),
      s('rect', { x: 11, y: 8, width: 4, height: 48, rx: 2, fill: '#fff', 'fill-opacity': 0.35 }));
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
      key ? [el('span', { class: 'forja-power-icon', textContent: POWER[key]?.icon || '✦' }), ' ', el('strong', { textContent: POWER[key]?.name || key }), ' ',
        el('span', { class: 'forja-muted', textContent: charge(powers.readyIn?.[key] || 0) })]
        : el('span', { class: 'forja-muted', textContent: 'espaço livre' }))));
  }
  const charge = (ms) => (ms > 0 ? `volta em ${minutes(ms)}` : 'pronto');

  function powerCard(key) {
    const p = POWER[key] || { name: key, icon: '✦' };
    const open = powers.unlocked?.includes(key);
    const slot = powers.slots?.indexOf(key) ?? -1;
    const node = el('li', { class: 'forja-power' + (open ? ' open' : ' locked') + (slot >= 0 ? ' staged' : ''), data: { power: key } },
      el('span', { class: 'forja-power-badge', ariaHidden: 'true' }, p.icon),
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
        other ? `${POWER[other]?.icon || ''} ${POWER[other]?.name || other}` : 'livre')),
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
