const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

// Relógio e rede controlados; executa o Salão real, inclusive load/decode separados.
function salon(t, { reduced = false, presence = null } = {}) {
  const dom = new JSDOM('<div id="main"><div id="salon-view"></div><div id="chat-view"></div></div>', { runScripts: 'outside-only' });
  const w = dom.window, d = w.document;
  t.after(() => w.close());
  let time = 100_000, nextTimer = 0;
  const timers = new Map(), requests = [], animations = [];
  let tick = null;
  w.Date.now = () => time;
  w.setTimeout = (fn, delay = 0) => { const id = ++nextTimer; timers.set(id, { fn, at: time + delay }); return id; };
  w.clearTimeout = (id) => timers.delete(id);
  w.setInterval = (fn) => { tick = fn; return 1; };
  w.clearInterval = () => { tick = null; };
  w.matchMedia = () => ({ matches: reduced });
  w.Element.prototype.animate = function (frames, options) {
    const animation = { frames, options, cancel() { this.cancelled = true; } };
    animations.push(animation);
    return animation;
  };
  w.Image = function () {
    const img = d.createElement('img');
    const request = { img, decode: null };
    Object.defineProperty(img, 'naturalWidth', { value: 0, writable: true });
    const cloneNode = img.cloneNode;
    img.cloneNode = function (deep) {
      const clone = cloneNode.call(this, deep);
      Object.defineProperty(clone, 'naturalWidth', { get: () => img.naturalWidth });
      Object.defineProperty(clone, 'complete', { get: () => img.naturalWidth > 0 });
      return clone;
    };
    img.decode = () => new Promise((resolve) => { request.decode = resolve; });
    requests.push(request);
    return img;
  };
  const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
  async function advance(ms) {
    await flush();
    const end = time + ms;
    while (true) {
      const entry = [...timers].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!entry) break;
      timers.delete(entry[0]); time = entry[1].at; entry[1].fn(); await flush();
    }
    time = end; tick?.(); await flush();
  }
  function load(src, decode = true) {
    for (const request of requests.filter((r) => r.img.getAttribute('src') === src)) {
      request.img.naturalWidth = 200;
      request.img.onload();
      if (decode) request.decode();
    }
  }
  function el(tag, props = {}, ...children) {
    const node = d.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
      if (key === 'class') node.className = value;
      else if (key === 'style') Object.assign(node.style, value);
      else if (key === 'data') Object.assign(node.dataset, value);
      else if (key in node) node[key] = value;
      else node.setAttribute(key, value);
    }
    node.append(...children.flat(Infinity).filter((child) => child != null));
    return node;
  }
  const state = { me: { accountId: 'me' }, messages: { room: [] } };
  w.eval(fs.readFileSync(path.join(__dirname, '../public/mudae-salao.js'), 'utf8'));
  const api = w.MudaeSalon({ state, el, Icon: () => el('svg'), call: async (name) => (name === 'mudae:presence' ? presence : null), onSocket() {}, member: () => null,
    ui: { num: String, minutes: String, kakera: () => el('span'), seriesLine: (card) => card.series,
      serverNow: () => time, RARITY: { common: 'Comum' }, SOURCES: { a: { label: 'Anime' } } }, Sounds: { play() {} } });
  api.sync({ id: 'room' });
  function roll(id = 'roll', image = 'winner', decoys = ['fast', 'slow', 'broken', 'decode-late'], source = 'a') {
    const msg = { id, bot: 'mudae', by: 'me', ts: time, mudae: { kind: 'roll', revealAt: time + 2000,
      expires: time + 47_000, priorityUntil: time + 5000, decoys,
      card: { name: id, image, rarity: 'common', series: 'Teste', rank: 1, value: 100, source } } };
    state.messages.room.push(msg); api.onMessage('room', msg); return msg;
  }
  return { d, api, roll, load, requests, animations, advance, flush };
}

test('roleta só anima imagens decodificadas e revela no prazo do servidor', async (t) => {
  const app = salon(t);
  app.roll();
  assert.ok(app.d.querySelector('.salon-reel.is-preparing .salon-card-back'));
  assert.equal(app.d.querySelectorAll('.salon-reel img').length, 0);
  app.load('fast'); app.load('winner'); app.load('decode-late', false);
  app.requests.filter((r) => r.img.getAttribute('src') === 'broken').forEach((r) => r.img.onerror());
  await app.advance(300);
  const images = [...app.d.querySelectorAll('.salon-reel img')];
  assert.equal(app.d.querySelector('.salon-showcase img'), null, 'fundo neutro mesmo com a vencedora já decodificada');
  assert.ok(images.length > 0);
  assert.ok(images.every((img) => ['fast', 'winner'].includes(img.getAttribute('src'))));
  assert.equal(app.animations[0].options.duration, 1700);
  app.requests.filter((r) => r.img.getAttribute('src') === 'decode-late').forEach((r) => r.decode());
  await app.flush();
  assert.equal(app.d.querySelectorAll('.salon-reel img').length, images.length, 'fotos tardias não mudam a faixa em movimento');
  await app.advance(1700);
  assert.equal(app.d.querySelector('.salon-reel'), null);
  assert.equal(app.d.querySelector('.salon-card.big .salon-card-name').textContent, 'roll');
  assert.equal(app.d.querySelector('.salon-card.big img'), images.at(-1), 'reutiliza os pixels prontos do resultado');
  assert.ok(app.d.querySelector('.salon-card.big img.ready'));
  assert.equal(app.d.querySelector('.salon-actions').dataset.phase, 'open');
  assert.equal(app.d.querySelector('.salon-showcase img').getAttribute('src'), 'winner');
  assert.ok(app.d.querySelector('.salon-showcase.has-art'));
});

test('rede lenta mantém versos visíveis no giro e na revelação até a foto decodificar', async (t) => {
  const app = salon(t);
  app.roll();
  await app.advance(300);
  assert.equal(app.d.querySelectorAll('.salon-reel img').length, 0);
  assert.equal(app.d.querySelectorAll('.salon-reel-cell .salon-card-back').length, 4);
  await app.advance(1700);
  const art = app.d.querySelector('.salon-card.big .salon-art');
  assert.equal(app.d.querySelector('.salon-showcase img'), null);
  assert.ok(art.querySelector('.salon-card-back'));
  assert.equal(art.querySelector('img').classList.contains('ready'), false);
  app.load('winner', false); await app.flush();
  assert.ok(art.querySelector('.salon-card-back'), 'load sem decode ainda mantém o verso');
  assert.equal(app.d.querySelector('.salon-showcase img'), null);
  app.requests.find((r) => r.img.getAttribute('src') === 'winner').decode(); await app.flush();
  assert.ok(art.querySelector('.salon-card-back'), 'o verso cobre o fundo durante o fade');
  art.querySelector('img').dispatchEvent(new app.d.defaultView.Event('transitionend'));
  assert.equal(art.querySelector('.salon-card-back'), null);
  assert.ok(art.querySelector('img.ready'));
  assert.ok(app.d.querySelector('.salon-showcase.has-art'));
});

test('fotos do roll atrasadas: a roleta gira com o estoque pré-carregado, da mesma fonte primeiro', async (t) => {
  const app = salon(t, { presence: { ok: true, rollsLeft: 9, rollsMax: 10, warm: { g: ['g1', 'g2', 'g3'], a: ['a1', 'a2'] } } });
  await app.flush();
  ['g1', 'g2', 'g3', 'a1', 'a2'].forEach((src) => app.load(src));
  await app.flush();
  app.roll('jogo', 'winner-g', ['lenta1', 'lenta2'], 'g');
  await app.advance(300);
  const srcs = [...app.d.querySelectorAll('.salon-reel-cell img')].map((img) => img.getAttribute('src'));
  assert.equal(app.d.querySelectorAll('.salon-reel-cell .salon-card-back').length, 1, 'só o resultado (ainda baixando) fica de verso');
  assert.ok(srcs.length >= 5);
  assert.deepEqual([...new Set(srcs)].sort(), ['a1', 'a2', 'g1', 'g2', 'g3']);
});

test('falha na imagem do resultado mantém uma carta visível e o casamento disponível', async (t) => {
  const app = salon(t);
  app.roll();
  app.requests.find((r) => r.img.getAttribute('src') === 'winner').img.onerror();
  app.load('fast');
  await app.advance(2000);
  const art = app.d.querySelector('.salon-card.big .salon-art');
  assert.ok(art.querySelector('.salon-card-back'));
  assert.equal(art.querySelector('img'), null, 'não exibe o ícone de imagem quebrada');
  assert.equal(app.d.querySelector('.salon-claim').disabled, false);
  assert.equal(app.d.querySelector('.salon-showcase img'), null);
});

test('sair do Salão cancela um giro pendente e impede uma revelação antiga', async (t) => {
  const app = salon(t);
  app.roll('antigo');
  app.api.sync(null);
  app.api.sync({ id: 'room' });
  app.roll('atual', 'new-winner');
  app.load('winner'); app.load('new-winner'); app.load('fast');
  await app.advance(300);
  assert.equal(app.animations.length, 1);
  await app.advance(1700);
  assert.equal(app.d.querySelector('.salon-card.big .salon-card-name').textContent, 'atual');
  assert.equal(app.d.querySelector('.salon-showcase img').getAttribute('src'), 'new-winner');
});

test('showcase respeita revealAt no histórico e limpa a foto ao iniciar outro giro', async (t) => {
  const app = salon(t);
  app.roll('historico', 'winner', []);
  app.load('winner'); await app.flush();
  assert.equal(app.d.querySelector('.salon-showcase img'), null, 'histórico futuro não entrega o resultado no fundo');
  await app.advance(2000);
  assert.ok(app.d.querySelector('.salon-showcase.has-art'));
  const image = app.d.querySelector('.salon-card.big img');
  app.api.show('historico'); await app.flush();
  assert.ok(app.d.querySelector('.salon-showcase.has-art'));
  assert.equal(app.d.querySelector('.salon-card.big img'), image, 'reexibir a mesma carta reutiliza a imagem carregada');
  app.roll('novo', 'next-winner');
  assert.equal(app.d.querySelector('.salon-showcase img'), null, 'o giro seguinte começa neutro');
});

test('showcase sem URL de imagem mantém o fundo neutro', async (t) => {
  const app = salon(t);
  app.roll('sem imagem', '', []);
  await app.advance(2000);
  assert.ok(app.d.querySelector('.salon-card.big .salon-card-back'));
  assert.equal(app.d.querySelector('.salon-showcase img'), null);
  assert.ok(app.requests.every((request) => !request.img.getAttribute('src')));
});

test('showcase com movimento reduzido aguarda a revelação sem antecipar a foto', async (t) => {
  const app = salon(t, { reduced: true });
  app.roll(); app.load('winner'); await app.flush();
  assert.equal(app.animations.length, 0);
  assert.equal(app.d.querySelector('.salon-showcase img'), null);
  await app.advance(2000);
  assert.ok(app.d.querySelector('.salon-showcase.has-art'));
});
