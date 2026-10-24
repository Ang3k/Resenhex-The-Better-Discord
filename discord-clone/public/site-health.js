// Painel do dono do Resenhex: saúde do servidor ao vivo (server/health.js, uma amostra a cada 10 s).
// Só pergunta ao servidor enquanto a seção está à vista (Configurações abertas e a aba do navegador visível).
window.SiteHealth = function ({ request, el }) {
  const root = document.querySelector('#site-health');
  const page = document.querySelector('#page-health');
  const settings = document.querySelector('#settings');
  const EVERY_MS = 5000;
  const SVG = 'http://www.w3.org/2000/svg';
  const number = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
  const integer = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
  let timer = null;
  let lastKey = '';

  const visible = () => !settings.classList.contains('hidden') && !page.classList.contains('hidden') && !document.hidden;
  const fmt = (value, digits = 1) => value == null ? '—' : (digits ? number : integer).format(value);
  const memory = (mb) => mb >= 1024 ? `${fmt(mb / 1024)} GB` : `${integer.format(mb)} MB`;
  const ago = (at) => {
    const s = Math.round((Date.now() - at) / 1000);
    return s < 60 ? `há ${s} s` : `há ${Math.round(s / 60)} min`;
  };

  // Cada medida: o valor da última amostra, a linha de baixo e, quando há meta, o estado em relação a ela.
  // Atenção a partir de 70% da meta; acima dela, alerta. Estado sempre vem com ícone e texto.
  const metrics = (targets, range) => [
    { key: 'loopP99', label: 'Atraso do servidor', value: (p) => `${fmt(p.loopP99)} ms`, unit: 'ms',
      note: (p, h) => `p99 · máx ${fmt(Math.max(...h.map((x) => x.loopMax)))} ms em 10 min`, target: targets.loopP99,
      level: (p) => Math.max(p.loopP99 / targets.loopP99, p.loopMax / targets.loopMax), goal: `meta: p99 abaixo de ${targets.loopP99} ms` },
    { key: 'cpu', label: 'Processador', value: (p) => `${fmt(p.cpu)}%`, unit: '%', note: () => 'de um núcleo', target: targets.cpu,
      level: (p) => p.cpu / targets.cpu, goal: `meta: abaixo de ${targets.cpu}% de um núcleo` },
    { key: 'rssMb', label: 'Memória', value: (p) => memory(p.rssMb), unit: 'MB', note: (p) => `${memory(p.heapMb)} em uso pelo JavaScript`, target: targets.rssMb,
      level: (p) => p.rssMb / targets.rssMb, goal: `meta: abaixo de ${memory(targets.rssMb)}` },
    { key: 'connections', label: 'Conexões', value: (p) => integer.format(p.connections), unit: '',
      note: (p) => `${integer.format(p.online)} ${p.online === 1 ? 'pessoa online' : 'pessoas online'}` },
    { key: 'changes', label: 'Mudanças', value: (p) => `${fmt(p.changes)}/s`, unit: '/s', note: (p) => `${fmt(p.states)} estados enviados por segundo` },
    { key: 'sentKBps', label: 'Envio do site', value: (p) => `${fmt(p.sentKBps)} KB/s`, unit: 'KB/s', note: () => 'sem contar as chamadas' },
    { key: 'saveMaxMs', label: 'Gravação do banco', value: (p) => p.saveMaxMs == null ? 'Sem gravação' : p.saveMaxMs < 0.1 ? 'Menos de 0,1 ms' : `${fmt(p.saveMaxMs)} ms`, unit: 'ms',
      note: (p) => p.saves ? `parado preparando o arquivo · ${p.saves} ${p.saves === 1 ? 'gravação' : 'gravações'}` : 'nenhuma nos últimos 10 s' },
    { key: 'turnPorts', label: 'Portas do retransmissor', value: (p) => p.turnPorts == null ? '—' : integer.format(p.turnPorts), unit: '',
      note: (p) => p.turnPorts == null ? 'só medido no servidor Linux' : `de ${integer.format(range.max - range.min + 1)} disponíveis`, target: targets.turnPorts,
      level: (p) => p.turnPorts == null ? null : p.turnPorts / targets.turnPorts, goal: 'meta: abaixo de 80% das portas' },
  ];
  // Sem medição (level null), sem estado.
  const stateOf = (level) => level == null ? null : level > 1 ? 'bad' : level >= 0.7 ? 'warn' : 'ok';
  const STATES = { ok: ['check', 'Dentro da meta'], warn: ['alert', 'Perto da meta'], bad: ['alert', 'Acima da meta'] };

  // Linha dos últimos 10 minutos, no tom apagado; o ponto de agora no tom da marca.
  function sparkline(points, key, readout, restore, unit) {
    const values = points.map((p) => p[key] ?? 0);
    const max = Math.max(...values, 0) || 1;
    const W = 120, H = 32, pad = 3;
    const x = (i) => values.length < 2 ? W : (i / (values.length - 1)) * W;
    const y = (v) => H - pad - (v / max) * (H - pad * 2);
    const node = (tag, attrs) => { const n = document.createElementNS(SVG, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); return n; };
    const svg = node('svg', { class: 'site-health-spark', viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none', 'aria-hidden': 'true' });
    const path = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
    svg.append(node('path', { class: 'line', d: path }));
    const hair = node('line', { class: 'hair', y1: 0, y2: H });
    // O ponto é um traço de comprimento zero com ponta redonda: continua redondo com o SVG esticado.
    const dot = `M${x(values.length - 1).toFixed(1)} ${y(values.at(-1)).toFixed(1)}h0`;
    svg.append(hair, node('path', { class: 'now-ring', d: dot }), node('path', { class: 'now', d: dot }));
    svg.addEventListener('pointermove', (event) => {
      const box = svg.getBoundingClientRect();
      const i = Math.round(Math.min(1, Math.max(0, (event.clientX - box.left) / box.width)) * (values.length - 1));
      hair.setAttribute('x1', x(i)); hair.setAttribute('x2', x(i));
      svg.classList.add('hovering');
      readout(`${ago(points[i].at)} · ${fmt(points[i][key])}${unit && !unit.startsWith('/') ? ' ' : ''}${unit}`);
    });
    svg.addEventListener('pointerleave', () => { svg.classList.remove('hovering'); restore(); });
    return svg;
  }

  function tile(metric, history) {
    const last = history.at(-1);
    const state = metric.target ? stateOf(metric.level(last)) : null; // null: sem meta ou sem medição
    const note = el('p', { class: 'site-health-note', textContent: metric.note(last, history) });
    const restore = () => { note.textContent = metric.note(last, history); };
    return el('article', { class: 'site-health-tile' + (state ? ' ' + state : ''), ariaLabel: metric.label },
      el('div', { class: 'site-health-head' },
        el('h3', { textContent: metric.label }),
        state ? el('span', { class: 'site-health-state', tip: metric.goal }, Icon(STATES[state][0], 14), el('span', { textContent: STATES[state][1] })) : null),
      el('p', { class: 'site-health-value', textContent: metric.value(last) }),
      note,
      history.length > 1 ? sparkline(history, metric.key, (text) => { note.textContent = text; }, restore, metric.unit) : null);
  }

  function draw({ history, targets, turnRange, every }) {
    if (!history.length) {
      root.replaceChildren(el('p', { class: 'hint', textContent: `Juntando a primeira amostra (leva ${every / 1000} s)…` }));
      return;
    }
    const list = metrics(targets, turnRange);
    const last = history.at(-1);
    const over = list.filter((m) => m.target && stateOf(m.level(last)) === 'bad').length;
    const near = list.filter((m) => m.target && stateOf(m.level(last)) === 'warn').length;
    const overall = over ? 'bad' : near ? 'warn' : 'ok';
    const headline = over ? `${over} ${over === 1 ? 'medida acima da meta' : 'medidas acima da meta'}`
      : near ? `${near} ${near === 1 ? 'medida perto da meta' : 'medidas perto da meta'}` : 'Tudo dentro das metas';
    root.replaceChildren(
      el('div', { class: 'site-health-summary ' + overall },
        Icon(STATES[overall][0], 16),
        el('strong', { textContent: headline }),
        el('span', { textContent: `Amostra a cada ${every / 1000} s · última ${ago(last.at)} · linhas: últimos 10 min` })),
      el('div', { class: 'site-health-grid' }, list.map((m) => tile(m, history))));
  }

  function render(res) {
    if (res.error) {
      lastKey = '';
      root.replaceChildren(el('p', { class: 'hint', textContent: res.error }));
      return;
    }
    const key = String(res.history.at(-1)?.at ?? 0);
    if (key !== lastKey) { lastKey = key; draw(res); }
  }

  async function tick() {
    clearTimeout(timer);
    timer = null;
    if (!visible()) return;
    if (!lastKey) root.replaceChildren(el('p', { class: 'hint', textContent: 'Carregando a saúde do servidor…' }));
    const res = await request('site:health');
    if (!visible()) return;
    render(res);
    clearTimeout(timer);
    timer = setTimeout(tick, EVERY_MS);
  }

  settings.addEventListener('settings-section', (event) => { if (event.detail === 'health') { lastKey = ''; tick(); } });
  document.addEventListener('visibilitychange', () => { if (!timer) tick(); });
};
