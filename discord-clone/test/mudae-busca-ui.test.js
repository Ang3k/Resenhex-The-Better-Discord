// A busca com lista suspensa do Salão (public/mudae-salao.js): na aba Personagens (sugestões do servidor) e no Harem
// (sugestões locais). Relógio controlado, como em mudae-poderes-ui e mudae-forja-ui.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const read = (file) => fs.readFileSync(path.join(__dirname, '..', 'public', file), 'utf8');

const card = (id, name, series, extra = {}) => ({ id, name, series, image: 'foto-' + id, rarity: 'rare', rank: 50 + Number(String(id).replace(/\D/g, '') || 0), value: 120, source: 'a', ...extra });
const listReply = (chars, extra = {}) => ({ key: '||', label: 'Personagens', series: null, total: chars.length, page: 0, pages: 1, chars: chars.map((c, i) => ({ ...c, pos: i + 1, ownerId: null })), ...extra });

function stage(t, replies = {}) {
  const dom = new JSDOM('<div id="main"><div id="salon-view"></div><div id="chat-view"></div></div>', { runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window, d = w.document;
  t.after(() => w.close());
  let time = 100_000, nextTimer = 0;
  const timers = new Map(), calls = [], toasts = [];
  w.Date.now = () => time;
  w.setTimeout = (fn, delay = 0) => { const id = ++nextTimer; timers.set(id, { fn, at: time + Math.max(0, delay) }); return id; };
  w.clearTimeout = (id) => timers.delete(id);
  w.setInterval = () => 0;
  w.clearInterval = () => {};
  w.requestAnimationFrame = (fn) => w.setTimeout(fn, 16);
  w.cancelAnimationFrame = (id) => w.clearTimeout(id);
  w.matchMedia = () => ({ matches: false });
  w.Element.prototype.scrollIntoView = function () { (w.scrolled ||= []).push(this); };
  const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
  async function advance(ms) {
    await flush();
    const end = time + ms;
    while (true) {
      const entry = [...timers].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!entry) break;
      timers.delete(entry[0]); time = entry[1].at; entry[1].fn(); await flush();
    }
    time = end;
    await flush();
  }
  function el(tag, props = {}, ...children) {
    const node = d.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === 'class') node.className = v;
      else if (k === 'style') Object.assign(node.style, v);
      else if (k === 'data') Object.assign(node.dataset, v);
      else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
      else if (k.startsWith('aria')) node.setAttribute(k.replace(/^aria([A-Z])/, (_, c) => 'aria-' + c.toLowerCase()), v);
      else node[k] = v;
    }
    node.append(...children.flat().filter((c) => c != null && c !== false));
    return node;
  }
  const answers = { 'mudae:presence': () => ({ ok: true, rollsLeft: 9, rollsMax: 10, rollResetIn: 1, claimReady: true, claimResetIn: 1, kakera: 1200 }),
    'mudae:wishlist': () => ({ chars: [], max: 10 }), 'mudae:powers:get': () => null, ...replies };
  const call = async (name, payload) => {
    calls.push({ name, payload: JSON.parse(JSON.stringify(payload ?? null)) });
    return typeof answers[name] === 'function' ? answers[name](payload) : answers[name] ?? null;
  };
  const people = { me: 'Eu', ana: 'Ana' };
  const member = (id) => (people[id] ? { id, name: people[id] } : null);
  const state = { me: { accountId: 'me' }, messages: { room: [] }, textChannel: 'room' };
  for (const file of ['mudae.js', 'mudae-icones.js', 'mudae-poderes.js', 'mudae-salao.js']) w.eval(read(file));
  const ui = w.MudaeUI({ state, el, Icon: () => el('i'), call, member, avatar: () => el('span'), nameColor: () => '', Format: { render: (text) => text }, fmtCtx: {},
    openProfile() {}, openImage() {}, openChannel() {}, renderMessages() {}, keepBottom() {} });
  const salon = w.MudaeSalon({ state, el, Icon: () => el('i'), call, onSocket: () => {}, member, avatar: () => el('span'), nameColor: () => '', ui,
    Sounds: { play() {} }, toast: (text) => toasts.push(text) });
  salon.sync({ id: 'room' });
  const $ = (sel) => d.querySelector(sel);
  const $$ = (sel) => [...d.querySelectorAll(sel)];
  const text = (node) => node.textContent.replace(/\s+/g, ' ').trim();
  const sent = (name) => calls.filter((c) => c.name === name).map((c) => c.payload);
  const input = () => $('.salon-combo input');
  const panel = () => $('.salon-sug-panel');
  const rows = () => $$('.salon-sug-panel .salon-sug');
  async function type(value) {
    const box = input();
    box.focus();
    box.value = value;
    box.dispatchEvent(new w.Event('input', { bubbles: true }));
    await advance(200);
  }
  const key = (name) => input().dispatchEvent(new w.KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true }));
  return { w, d, $, $$, text, sent, input, panel, rows, type, key, advance, flush, salon, toasts };
}

const SUGGEST = {
  filter: null,
  series: [{ name: 'Zelda', count: 2, source: 'g' }],
  chars: [{ id: 'g2', name: 'Zelda', series: 'Zelda', image: 'z.png', rarity: 'epic', source: 'g', rank: 3, ownerId: 'ana' },
    { id: 'g3', name: 'Impa Zeldaneira', series: 'Zelda', image: 'i.png', rarity: 'common', source: 'g', rank: 900, ownerId: null }],
};

test('Personagens: digitar abre o dropdown com obras e personagens, e o primeiro já vem marcado', async (t) => {
  const app = stage(t, { 'mudae:list': () => listReply([card(1, 'Naruto Uzumaki', 'Naruto')]), 'mudae:suggest': () => SUGGEST });
  app.salon.openChars();
  await app.flush();
  assert.equal(app.panel().hidden, true, 'fechado enquanto não digita');
  assert.equal(app.input().getAttribute('role'), 'combobox');

  await app.type('zel');
  assert.equal(app.sent('mudae:suggest').length, 1, 'uma busca só, depois da pausa');
  assert.deepEqual(app.sent('mudae:suggest')[0], { text: 'zel', gender: '', source: '' });
  assert.equal(app.panel().hidden, false);
  assert.equal(app.input().getAttribute('aria-expanded'), 'true');
  assert.deepEqual([...app.$$('.salon-sug-head')].map((h) => h.textContent), ['Obras', 'Personagens']);
  assert.equal(app.rows().length, 3);
  assert.equal(app.rows()[0].classList.contains('active'), true);
  assert.equal(app.rows()[0].getAttribute('aria-selected'), 'true');
  assert.equal(app.input().getAttribute('aria-activedescendant'), app.rows()[0].id);
  assert.match(app.text(app.rows()[0]), /Zelda\s*2 personagens · Jogos/);
  assert.equal(app.rows()[0].querySelector('mark').textContent, 'Zel', 'o pedaço digitado fica destacado');
  assert.match(app.text(app.rows()[1]), /Zelda\s*Zelda\s*Ana/, 'personagem com o nome da obra e o dono');
  assert.match(app.text(app.rows()[2]), /Livre/);
  assert.ok(app.rows()[1].classList.contains('r-epic'), 'a raridade colore a moldura da miniatura');
  assert.equal(app.rows()[1].querySelector('img').referrerPolicy, 'no-referrer');
});

test('Personagens: o teclado anda pela lista, Esc fecha e uma letra só não busca', async (t) => {
  const app = stage(t, { 'mudae:list': () => listReply([]), 'mudae:suggest': () => SUGGEST });
  app.salon.openChars();
  await app.flush();
  await app.type('z');
  assert.equal(app.sent('mudae:suggest').length, 0, 'uma letra não vai ao servidor');
  assert.equal(app.panel().hidden, true);

  await app.type('zel');
  app.key('ArrowDown');
  assert.equal(app.rows()[1].classList.contains('active'), true);
  app.key('ArrowUp'); app.key('ArrowUp');
  assert.equal(app.rows()[2].classList.contains('active'), true, 'volta pelo fim da lista');
  app.key('Escape');
  assert.equal(app.panel().hidden, true);
  assert.equal(app.input().getAttribute('aria-expanded'), 'false');
  app.key('ArrowDown');
  assert.equal(app.panel().hidden, false, 'a seta reabre a lista sem buscar de novo');
  assert.equal(app.sent('mudae:suggest').length, 1);
});

test('Personagens: escolher uma obra abre a lista dela; Enter escolhe o item marcado', async (t) => {
  const app = stage(t, { 'mudae:list': (p) => listReply([card(9, 'Link', 'Zelda')], { series: p.key.split('|')[2] || null, key: p.key }), 'mudae:suggest': () => SUGGEST });
  app.salon.openChars();
  await app.flush();
  await app.type('zel');
  app.key('Enter');
  await app.flush();
  const lists = app.sent('mudae:list');
  assert.deepEqual(lists.at(-1), { key: '||Zelda', page: 0 }, 'a obra entra como filtro, sem pergunta ao servidor sobre o texto');
  assert.equal(app.input().value, 'Zelda');
  assert.equal(app.panel().hidden, true);
  assert.equal(app.sent('mudae:filter').length, 0);
  assert.ok(app.text(app.$('.salon-chars h2')).includes('Zelda'));
});

test('Personagens: escolher um personagem abre a obra dele na página certa e destaca a carta', async (t) => {
  const app = stage(t, {
    'mudae:list': (p) => (p.focus ? listReply([card('g1', 'Link', 'Zelda'), card('g2', 'Zelda', 'Zelda')], { key: p.key, series: 'Zelda', page: 1, pages: 3, focus: p.focus, mine: 0, claimed: 1 }) : listReply([card(1, 'Naruto', 'Naruto')])),
    'mudae:suggest': () => SUGGEST });
  app.salon.openChars();
  await app.flush();
  await app.type('zel');
  app.key('ArrowDown');
  app.key('Enter');
  await app.flush();
  assert.deepEqual(app.sent('mudae:list').at(-1), { key: '||Zelda', page: 0, focus: 'g2' });
  assert.equal(app.input().value, 'Zelda');
  const found = app.$$('.salon-album-item.found');
  assert.equal(found.length, 1);
  assert.equal(found[0].dataset.id, 'g2');
  assert.ok(app.w.scrolled?.includes(found[0]), 'a tela rola até a carta');
  assert.match(app.text(app.$('.salon-char-pager')), /Página 2 de 3/);
});

test('Personagens: os chips de gênero e fonte vão junto na busca, e um filtro digitado vira chip', async (t) => {
  const filter = { key: 'F|g|', label: 'Waifus de jogos', gender: 'F', source: 'g' };
  const app = stage(t, { 'mudae:list': (p) => listReply([], { key: p.key }), 'mudae:suggest': (p) => (p.text === 'waifus jogos' ? { filter, series: [], chars: [] } : SUGGEST) });
  app.salon.openChars();
  await app.flush();
  [...app.$$('.salon-filter')].find((b) => app.text(b) === 'Waifus').click();
  await app.flush();
  await app.type('zel');
  assert.deepEqual(app.sent('mudae:suggest').at(-1), { text: 'zel', gender: 'F', source: '' });

  await app.type('waifus jogos');
  assert.equal(app.rows().length, 1);
  assert.match(app.text(app.rows()[0]), /Waifus de jogos\s*Filtrar o ranking/);
  assert.equal(app.$('.salon-sug-head').textContent, 'Filtro');
  app.key('Enter');
  await app.flush();
  assert.deepEqual(app.sent('mudae:list').at(-1), { key: 'F|g|', page: 0 });
  assert.equal(app.input().value, '', 'o texto some: o filtro agora está nos chips');
  assert.ok([...app.$$('.salon-filter.active')].some((b) => app.text(b) === 'Waifus'));
});

test('Personagens: sem resultado avisa, e a resposta atrasada de uma busca antiga não aparece', async (t) => {
  const pending = [];
  const app = stage(t, { 'mudae:list': () => listReply([]), 'mudae:suggest': (p) => new Promise((resolve) => pending.push([p.text, resolve])) });
  app.salon.openChars();
  await app.flush();
  await app.type('zel');
  await app.type('zelda');
  assert.equal(pending.length, 2);
  pending[1][1]({ series: [], chars: [] });
  await app.flush();
  assert.match(app.text(app.panel()), /Nada encontrado para “zelda”/);
  pending[0][1](SUGGEST);
  await app.flush();
  assert.equal(app.rows().length, 0, 'a resposta de "zel" chegou tarde e foi ignorada');
  app.key('Enter');
  await app.flush();
  assert.equal(app.sent('mudae:list').length, 1, 'Enter sem resultado não muda a lista');
});

test('Harem: a busca sugere obras e personagens do álbum, sem ir ao servidor', async (t) => {
  const chars = [card(1, 'Mikasa Ackerman', 'Attack on Titan', { rarity: 'legendary', rank: 5 }), card(2, 'Eren Yeager', 'Attack on Titan', { rank: 30 }),
    card(3, 'Zero Two', 'DARLING in the FRANXX', { rank: 40 }), card(4, 'Titania', 'Fairy Tail', { rank: 800, rarity: 'common' })]
    .map((c) => ({ ...c, claimedAt: 1, wishedBy: [] }));
  const app = stage(t, { 'mudae:harem': () => ({ ownerId: 'me', total: 4, value: 400, favorite: null, chars }) });
  app.salon.openHarem('me');
  await app.flush();
  assert.equal(app.$$('.salon-grid .salon-album-item').length, 4);

  await app.type('tit');
  assert.equal(app.sent('mudae:suggest').length, 0);
  assert.deepEqual(app.$$('.salon-sug-head').map((h) => h.textContent), ['Obras', 'Personagens']);
  const names = app.rows().map((r) => r.querySelector('.salon-sug-name').textContent);
  assert.deepEqual(names, ['Attack on Titan', 'Titania'], 'a obra primeiro; só a Titania tem "tit" no nome');
  assert.equal(app.$$('.salon-grid .salon-album-item').length, 3, 'a grade já filtra enquanto digita (nome ou obra): 2 de Attack on Titan e a Titania');

  const series = app.rows().find((r) => r.classList.contains('series') && r.querySelector('.salon-sug-name').textContent === 'Attack on Titan');
  assert.match(app.text(series), /2 personagens/);
  series.click();
  await app.flush();
  assert.equal(app.input().value, 'Attack on Titan');
  assert.equal(app.$$('.salon-grid .salon-album-item').length, 2);
  assert.equal(app.panel().hidden, true);

  await app.type('ackerman');
  const only = app.rows();
  assert.equal(only.length, 1);
  assert.match(app.text(only[0]), /Mikasa Ackerman\s*Attack on Titan\s*Lendário/);
  only[0].click();
  await app.flush();
  assert.deepEqual(app.$$('.salon-grid .salon-card-name').map((n) => n.textContent), ['Mikasa Ackerman']);
});

test('Harem: o dropdown respeita os filtros de raridade e a busca ignora acento', async (t) => {
  const chars = [card(1, 'Rem', 'Re:Zero', { rarity: 'legendary', rank: 2 }), card(2, 'Émilia', 'Re:Zero', { rarity: 'common', rank: 900 })].map((c) => ({ ...c, claimedAt: 1, wishedBy: [] }));
  const app = stage(t, { 'mudae:harem': () => ({ ownerId: 'me', total: 2, value: 100, favorite: null, chars }) });
  app.salon.openHarem('me');
  await app.flush();
  await app.type('emilia');
  assert.equal(app.rows().filter((r) => r.classList.contains('char')).length, 1, 'acha "Émilia" sem acento');
  [...app.$$('.salon-filter')].find((b) => b.classList.contains('f-legendary')).click();
  await app.flush();
  await app.type('re:');
  assert.equal(app.rows().filter((r) => r.classList.contains('char')).length, 0, 'filtro de raridade tira a comum');
});
