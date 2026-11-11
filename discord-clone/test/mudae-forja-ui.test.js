// A aba Forja do Salão (public/mudae-forja.js): parede de medalhas, detalhe, forja animada, escolha do acabamento,
// poderes e a faixa do nível IV. Relógio controlado, como em mudae-salao-animation e mudae-cristal-ui.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const read = (file) => fs.readFileSync(path.join(__dirname, '..', 'public', file), 'utf8');
const KEYS = ['bronze', 'prata', 'ouro', 'safira', 'rubi', 'esmeralda', 'diamante'];
const BASE = { bronze: 500, prata: 750, ouro: 1000, safira: 1500, rubi: 2000, esmeralda: 2500, diamante: 3000 };
const HOUR = 3600_000;

// O que o servidor devolve em mudae:forja:get. levels: { medalha: [nível, acabamento, oferta] }.
function forjaView(kakera, levels = {}) {
  const medals = Object.fromEntries(KEYS.map((m) => { const [level = 0, finish = null, offer = null] = levels[m] || []; return [m, { level, finish, offer }]; }));
  const prices = Object.fromEntries(KEYS.map((m) => [m, medals[m].level >= 4 ? null : BASE[m] * (medals[m].level + 1)]));
  return { medals, kakera, prices, perks: {} };
}
function powersView(over = {}) {
  const need = { videncia: 1, cadeado: 20, amuleto: 1, chuva: 40, desejo: 3, eco: 60, dupla: 500, laco: 7 };
  const have = { videncia: 1, cadeado: 14, amuleto: 1, chuva: 3, desejo: 2, eco: 14, dupla: 120, laco: 0 };
  return { unlocked: ['videncia', 'amuleto'], slots: ['videncia', null, null], readyIn: { videncia: 0 },
    progress: Object.fromEntries(Object.keys(need).map((k) => [k, { have: have[k], need: need[k] }])), rechargeMs: 20 * HOUR, ...over };
}

function forja(t, { reduced = false, view = forjaView(1200), powers = powersView(), replies = {} } = {}) {
  const dom = new JSDOM('<div id="main"><div id="salon-view"></div><div id="chat-view"></div></div>', { runScripts: 'outside-only' });
  const w = dom.window, d = w.document;
  t.after(() => w.close());
  let time = 100_000, nextTimer = 0;
  const timers = new Map(), calls = [], sounds = [], handlers = new Map(), animations = [], seen = new Set();
  w.Date.now = () => time;
  w.setTimeout = (fn, delay = 0) => { const id = ++nextTimer; timers.set(id, { fn, at: time + Math.max(0, delay) }); return id; };
  w.clearTimeout = (id) => timers.delete(id);
  w.setInterval = () => 1;
  w.clearInterval = () => {};
  w.matchMedia = () => ({ matches: false });
  w.Element.prototype.animate = function (keyframes) { animations.push({ node: this, keyframes: [].concat(keyframes) }); return { cancel() {}, finish() {} }; };
  w.Image = function () { const img = d.createElement('img'); img.decode = () => new Promise(() => {}); return img; };
  // Tudo o que passou pela tela em algum momento (as peças da animação somem no fim).
  new w.MutationObserver((list) => {
    for (const m of list) for (const node of m.addedNodes) {
      if (node.nodeType !== 1) continue;
      for (const n of [node, ...node.querySelectorAll('*')]) for (const c of n.classList) seen.add(c);
    }
  }).observe(d.body, { childList: true, subtree: true });
  const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
  async function advance(ms) {
    await flush();
    const end = time + ms;
    while (true) {
      const entry = [...timers].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!entry) break;
      timers.delete(entry[0]); time = entry[1].at; entry[1].fn(); await flush();
    }
    time = end; await flush();
  }
  // O mesmo el do app.js.
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
  const answers = { 'mudae:forja:get': () => view, 'mudae:powers:get': () => powers,
    'mudae:presence': () => ({ ok: true, rollsLeft: 9, rollsMax: 10, rollResetIn: 1, claimReady: true, claimResetIn: 1, kakera: view?.kakera }), ...replies };
  const call = async (name, payload) => {
    calls.push({ name, payload: JSON.parse(JSON.stringify(payload ?? null)) });
    return answers[name] ? answers[name](payload) : null;
  };
  const onSocket = (event, fn) => { const before = handlers.get(event); handlers.set(event, before ? (p) => { before(p); fn(p); } : fn); };
  const people = { ana: 'Ana', me: 'Eu' };
  const member = (id) => (people[id] ? { id, name: people[id] } : null);
  const Sounds = { play: (name) => sounds.push(name) };
  const state = { me: { accountId: 'me' }, messages: { room: [] }, textChannel: 'room' };
  for (const file of ['mudae.js', 'mudae-forja.js', 'mudae-salao.js']) w.eval(read(file));
  let forge = null;
  const ui = w.MudaeUI({ state, el, Icon: () => el('i'), call, member, avatar: () => el('span'), nameColor: () => '', Format: { render: (text) => text }, fmtCtx: {},
    openProfile() {}, openImage() {}, openChannel() {}, renderMessages() {}, keepBottom() {}, medalSvg: (...args) => forge.medalSvg(...args) });
  forge = w.MudaeForge({ el, call, onSocket, ui, Sounds, reducedMotion: () => reduced, toast() {}, member });
  const salon = w.MudaeSalon({ state, el, Icon: () => el('i'), call, onSocket, member, ui, Sounds, forge });
  salon.sync({ id: 'room' });
  const $ = (sel) => d.querySelector(sel);
  const $$ = (sel) => [...d.querySelectorAll(sel)];
  const text = (node) => node.textContent.replace(/\s+/g, ' ').trim();
  const tab = (label) => $$('.salon-tab').find((b) => b.textContent === label);
  const sent = (name) => calls.filter((c) => c.name === name).map((c) => c.payload);
  return { w, d, $, $$, text, tab, sent, ui, forge, salon, state, sounds, animations, seen, advance, flush,
    deliver: (event, payload) => handlers.get(event)(payload),
    open: async () => { tab('Forja').click(); await flush(); },
    pick: async (medal) => { $(`.forja-slot[data-medal="${medal}"]`).click(); await flush(); },
    setView: (next) => { view = next; },
    setPowers: (next) => { powers = next; } };
}

test('a parede mostra as 7 medalhas com nível e preço', async (t) => {
  const app = forja(t, { view: forjaView(1200, { bronze: [2, 'esmalte'], ouro: [1, 'metal'], esmeralda: [4, 'galaxia'] }) });
  assert.deepEqual(app.$$('.salon-tab').map((b) => b.textContent), ['Mesa', 'Meu harem', 'Forja', 'Personagens', 'Ranking'], 'a aba fica entre Meu harem e Personagens');
  await app.open();
  assert.ok(app.$('.salon-body .forja'), 'a Forja abre dentro do Salão');
  assert.deepEqual(app.sent('mudae:forja:get').length, 1);
  assert.match(app.text(app.$('.forja-kakera')), /1\.200/);
  const slots = app.$$('.forja-wall .forja-slot');
  assert.deepEqual(slots.map((s) => s.getAttribute('data-medal')), KEYS);
  const slot = (medal) => app.$(`.forja-slot[data-medal="${medal}"]`);
  const medal = (medal) => slot(medal).querySelector('svg.forja-medal');

  // Bronze II em esmalte: dois níveis acesos e o preço do III, que ainda não dá para pagar.
  assert.match(app.text(slot('bronze')), /Bronze/);
  assert.equal(slot('bronze').querySelectorAll('.forja-pips i.on').length, 2);
  assert.equal(slot('bronze').querySelectorAll('.forja-pips i').length, 4);
  assert.equal(medal('bronze').getAttribute('data-level'), '2');
  assert.equal(medal('bronze').getAttribute('data-finish'), 'esmalte');
  assert.match(app.text(slot('bronze').querySelector('.forja-slot-price')), /^faltam 300$/);
  // Ouro I: o II custa 2.000 e faltam 800.
  assert.match(app.text(slot('ouro').querySelector('.forja-slot-price')), /^faltam 800$/);
  // Apagadas: silhueta escura, com o preço ou com quanto falta.
  assert.equal(medal('prata').getAttribute('data-level'), '0');
  assert.ok(slot('prata').classList.contains('unforged'));
  assert.match(app.text(slot('prata').querySelector('.forja-slot-price')), /^750$/);
  assert.match(app.text(slot('safira').querySelector('.forja-slot-price')), /^faltam 300$/);
  assert.match(app.text(slot('diamante').querySelector('.forja-slot-price')), /^faltam 1\.800$/);
  // No nível IV não há mais o que pagar.
  assert.equal(slot('esmeralda').querySelectorAll('.forja-pips i.on').length, 4);
  assert.match(app.text(slot('esmeralda').querySelector('.forja-slot-price')), /^completa$/);

  // O detalhe: o que a medalha dá em cada nível, com a linha do nível atual destacada e o preço do próximo.
  await app.pick('bronze');
  assert.equal(slot('bronze').getAttribute('aria-pressed'), 'true');
  assert.match(app.text(app.$('.forja-detail-title')), /^Bronze II$/);
  assert.match(app.text(app.$('.forja-detail .forja-finish-tag')), /Esmalte/);
  const perks = app.$$('.forja-detail .forja-perk');
  assert.equal(perks.length, 4);
  assert.deepEqual(perks.map((p) => p.classList.contains('now')), [false, true, false, false]);
  assert.match(app.text(perks[1]), /II.*\+2 vagas de desejo/);
  assert.match(app.text(perks[3]), /IV.*\+4 vagas de desejo.*2\.000/);
  await app.pick('ouro');
  assert.match(app.text(app.$$('.forja-detail .forja-perk')[3]), /\$dk em dobro/);
  // A Prata ainda apagada, mas que já dá para pagar: Forjar com o preço.
  await app.pick('prata');
  assert.match(app.text(app.$('.forja-forge')), /^Forjar I · 750$/);
  assert.equal(app.$('.forja-forge').disabled, false);
  await app.pick('esmeralda');
  assert.equal(app.$('.forja-forge'), null, 'no nível IV não há mais Forjar');
  assert.match(app.text(app.$('.forja-reforge')), /^Reforjar acabamento · 500$/);
});

test('o cartão de perfil desenha a fileira de medalhas', async (t) => {
  let summary = { total: 0, value: 0, favorite: null,
    medals: [{ medal: 'ouro', level: 4, finish: 'galaxia' }, { medal: 'rubi', level: 3, finish: 'holo' }, { medal: 'bronze', level: 1, finish: 'metal' }] };
  const app = forja(t, { replies: { 'mudae:profile': () => ({ summary }) } });
  app.state.server = { serverId: 's', channels: [] };
  let rerenders = 0;
  assert.equal(app.salon.profileSection('ana', () => rerenders++), null, 'primeiro busca no servidor');
  await app.flush();
  assert.equal(rerenders, 1);
  // Sem favorito, a seção aparece só com as medalhas, na ordem do servidor e a 28 px.
  const node = app.salon.profileSection('ana', () => {});
  const medals = [...node.querySelectorAll('.pc-medals svg.forja-medal')];
  assert.deepEqual(medals.map((m) => [m.getAttribute('data-medal'), m.getAttribute('data-level'), m.getAttribute('data-finish')]),
    [['ouro', '4', 'galaxia'], ['rubi', '3', 'holo'], ['bronze', '1', 'metal']]);
  assert.ok(medals.every((m) => m.getAttribute('width') === '28'));
  assert.equal(node.querySelector('.pc-mudae'), null);
  // Pequena, o nível III ganha um raminho simples no lugar dos louros, e o IV mantém a coroa.
  assert.ok(medals[1].querySelector('.fm-laurel.tiny'));
  assert.ok(medals[0].querySelector('.fm-crown'));
  assert.ok(!app.forge.medalSvg('rubi', 3, 'holo', 96).querySelector('.fm-laurel.tiny'));

  // Com favorito: as medalhas ficam acima dele.
  summary = { ...summary, total: 1, value: 900, favorite: { name: 'Gojou', image: 'g.png', rarity: 'rare', chosen: true } };
  app.state.server.serverId = 's2';
  app.salon.profileSection('ana', () => {});
  await app.flush();
  const both = app.salon.profileSection('ana', () => {});
  assert.deepEqual([...both.children].map((c) => c.className.split(' ')[0]), ['pc-label', 'pc-medals', 'pc-mudae']);
});

test('mostrar no perfil manda a lista inteira', async (t) => {
  const app = forja(t, { view: { ...forjaView(1200, { bronze: [2, 'esmalte'], ouro: [1, 'metal'] }), shown: ['ouro'] },
    replies: { 'mudae:forja:show': () => ({ ok: true }) } });
  await app.open();
  await app.pick('prata');
  assert.equal(app.$('.forja-show'), null, 'medalha apagada não vai para o perfil');
  await app.pick('bronze');
  const box = app.$('.forja-show input');
  assert.equal(box.checked, false);
  box.click();
  await app.flush();
  assert.deepEqual(app.sent('mudae:forja:show'), [{ medals: ['ouro', 'bronze'] }]);
  await app.pick('ouro');
  assert.equal(app.$('.forja-show input').checked, true);
  app.$('.forja-show input').click();
  await app.flush();
  assert.deepEqual(app.sent('mudae:forja:show').at(-1), { medals: ['bronze'] });
});

test('Forjar chama mudae:forja:forge e, com oferta, mostra a escolha', async (t) => {
  const app = forja(t, { view: forjaView(5000, { ouro: [1, 'metal'] }),
    replies: { 'mudae:forja:forge': () => ({ medal: 'ouro', level: 2, price: 2000, finish: 'metal', offer: 'holo', kakera: 3000 }) } });
  await app.open();
  await app.pick('ouro');
  app.setView(forjaView(3000, { ouro: [2, 'metal', 'holo'] }));
  const button = app.$('.forja-forge');
  assert.equal(button.disabled, false);
  button.click();
  button.click();
  assert.deepEqual(app.sent('mudae:forja:forge'), [{ medal: 'ouro' }], 'dois cliques, um pedido só');
  await app.flush();
  assert.ok(app.$('.forja-scene.forging'), 'a forja começa quando o servidor responde');
  assert.equal(app.$('.forja-choice'), null, 'a escolha só aparece depois da forja');
  await app.advance(1300);
  assert.ok(app.$('.forja-hammer'), 'o martelo está batendo');
  await app.advance(4000);
  assert.ok(app.seen.has('forja-fly'), 'os cristais voaram para a forma');
  assert.ok(app.seen.has('forja-spark'), 'e saíram faíscas');
  assert.equal(app.sounds.filter((s) => s === 'mudaeHammer').length, 3, 'o martelo bate 3 vezes');
  assert.ok(app.sounds.includes('mudaeForge'), 'a forja esquenta');
  assert.equal(app.$('.forja-fly'), null);
  assert.equal(app.$('.forja-hammer'), null);
  assert.equal(app.$('.forja-scene.forging'), null);

  // As duas medalhas lado a lado, no nível novo, cada uma com o seu acabamento.
  const choice = app.$('.forja-choice');
  assert.ok(choice);
  assert.deepEqual([...choice.querySelectorAll('svg.forja-medal')].map((m) => [m.getAttribute('data-level'), m.getAttribute('data-finish')]), [['2', 'metal'], ['2', 'holo']]);
  assert.deepEqual([...choice.querySelectorAll('button')].map((b) => b.textContent), ['Ficar com Metal', 'Ficar com Holográfico']);
  assert.match(app.text(app.$('.forja-kakera')), /3\.000/, 'o saldo cai');
  assert.match(app.text(app.$('.salon-status-kakera')), /3\.000/, 'também na faixa de cima do Salão');
  assert.match(app.text(app.$('.forja-detail-title')), /^Ouro II$/);
  assert.equal(app.$('.forja-forge').disabled, true, 'sem forjar de novo antes de escolher');
});

test('escolher chama mudae:forja:finish com old ou new', async (t) => {
  const app = forja(t, { view: forjaView(900, { ouro: [2, 'metal', 'holo'], bronze: [3, 'esmalte', 'galaxia'] }),
    replies: { 'mudae:forja:finish': ({ medal, pick }) => ({ finish: { ouro: { old: 'metal', new: 'holo' }, bronze: { old: 'esmalte', new: 'galaxia' } }[medal][pick] }) } });
  await app.open();
  // Voltar à Forja com uma escolha pendente já mostra as duas medalhas.
  assert.match(app.text(app.$('.forja-slot[data-medal="ouro"] .forja-slot-price')), /^escolha o acabamento$/);
  await app.pick('ouro');
  const buttons = () => [...app.$$('.forja-choice button')];
  assert.deepEqual(buttons().map((b) => b.textContent), ['Ficar com Metal', 'Ficar com Holográfico']);
  buttons()[1].click();
  buttons()[0]?.click();
  await app.flush();
  assert.deepEqual(app.sent('mudae:forja:finish'), [{ medal: 'ouro', pick: 'new' }]);
  assert.equal(app.$('.forja-choice'), null);
  assert.equal(app.$('.forja-scene svg.forja-medal').getAttribute('data-finish'), 'holo');
  assert.equal(app.$('.forja-slot[data-medal="ouro"] svg.forja-medal').getAttribute('data-finish'), 'holo');
  assert.match(app.text(app.$('.forja-detail .forja-finish-tag')), /Holográfico/);

  await app.pick('bronze');
  buttons()[0].click();
  await app.flush();
  assert.deepEqual(app.sent('mudae:forja:finish').at(-1), { medal: 'bronze', pick: 'old' });
  assert.equal(app.$('.forja-scene svg.forja-medal').getAttribute('data-finish'), 'esmalte');
});

test('sem kakera, o botão fica desligado com quanto falta', async (t) => {
  const app = forja(t, { view: forjaView(200, { prata: [1, 'metal'] }) });
  await app.open();
  await app.pick('bronze');
  const button = app.$('.forja-forge');
  assert.equal(button.disabled, true);
  assert.match(app.text(button), /^Faltam 300$/);
  button.click();
  await app.pick('prata');
  assert.equal(app.$('.forja-forge').disabled, true);
  assert.match(app.text(app.$('.forja-forge')), /^Faltam 1\.300$/);
  // Reforjar custa 500: também não dá.
  assert.equal(app.$('.forja-reforge').disabled, true);
  app.$('.forja-reforge').click();
  await app.flush();
  assert.deepEqual(app.sent('mudae:forja:forge'), []);
  assert.deepEqual(app.sent('mudae:forja:reforge'), []);
  // Medalha ainda não forjada não tem o que reforjar.
  await app.pick('rubi');
  assert.equal(app.$('.forja-reforge'), null);
});

test('reforjar o acabamento custa 500 e abre a mesma escolha', async (t) => {
  const app = forja(t, { view: forjaView(800, { rubi: [1, 'metal'] }),
    replies: { 'mudae:forja:reforge': () => ({ price: 500, finish: 'metal', offer: 'galaxia', kakera: 300 }) } });
  await app.open();
  await app.pick('rubi');
  app.setView(forjaView(300, { rubi: [1, 'metal', 'galaxia'] }));
  app.$('.forja-reforge').click();
  assert.deepEqual(app.sent('mudae:forja:reforge'), [{ medal: 'rubi' }]);
  await app.advance(5000);
  assert.deepEqual([...app.$$('.forja-choice button')].map((b) => b.textContent), ['Ficar com Metal', 'Ficar com Galáxia']);
  assert.deepEqual([...app.$$('.forja-choice svg.forja-medal')].map((m) => m.getAttribute('data-level')), ['1', '1']);
  assert.match(app.text(app.$('.forja-kakera')), /300/);
});

test('poderes fechados mostram o progresso; abertos podem ir para o palco', async (t) => {
  const app = forja(t, { replies: { 'mudae:powers:equip': ({ slot, power }) => powersView({ slots: [null, 'videncia', null].map((p, i) => (i === slot ? power : i === 0 ? 'videncia' : null)),
    readyIn: { videncia: 0, [power]: 20 * HOUR } }) } });
  await app.open();
  assert.equal(app.sent('mudae:powers:get').length, 1);
  const power = (key) => app.$(`.forja-power[data-power="${key}"]`);
  assert.deepEqual(app.$$('.forja-power').map((p) => p.getAttribute('data-power')), ['videncia', 'cadeado', 'amuleto', 'chuva', 'desejo', 'eco', 'dupla', 'laco']);

  // Fechados: o que falta e uma barra.
  assert.ok(power('cadeado').classList.contains('locked'));
  assert.match(app.text(power('cadeado')), /Cadeado: 14\/20 casamentos/);
  const bar = power('cadeado').querySelector('[role="progressbar"]');
  assert.equal(bar.getAttribute('aria-valuenow'), '70');
  assert.match(app.text(power('laco')), /Laço: 0\/7 medalhas no nível II/);
  assert.equal(power('cadeado').querySelector('button'), null, 'poder fechado não vai para o palco');

  // Abertos: no palco, ou com o botão para ir.
  assert.match(app.text(power('videncia')), /No palco · espaço 1 · pronto/);
  const go = power('amuleto').querySelector('.forja-power-equip');
  assert.equal(go.textContent, 'Pôr no palco');
  assert.equal(app.$('.forja-slot-pick'), null);
  go.click();
  await app.flush();
  const picks = [...power('amuleto').querySelectorAll('.forja-slot-pick')];
  assert.equal(picks.length, 3);
  assert.match(app.text(picks[0]), /1.*Vidência/);
  assert.match(app.text(picks[1]), /2.*livre/);
  assert.match(app.text(power('amuleto')), /chega vazio e enche em 20h00/);
  picks[1].click();
  await app.flush();
  assert.deepEqual(app.sent('mudae:powers:equip'), [{ slot: 1, power: 'amuleto' }]);
  assert.match(app.text(power('amuleto')), /No palco · espaço 2 · volta em 20h00/);
  assert.equal(app.$('.forja-slot-pick'), null, 'a escolha fecha');
  // Os 3 espaços do palco, em cima da lista.
  assert.deepEqual(app.$$('.forja-stage-slot').map((s) => app.text(s)), ['1 🔮 Vidência pronto', '2 🍀 Amuleto volta em 20h00', '3 espaço livre']);
});

test('com Reduzir animações, forjar não anima voo nem martelo', async (t) => {
  const app = forja(t, { reduced: true, view: forjaView(5000, { ouro: [1, 'metal'] }),
    replies: { 'mudae:forja:forge': () => ({ medal: 'ouro', level: 2, price: 2000, finish: 'metal', offer: 'esmalte', kakera: 3000 }) } });
  await app.open();
  await app.pick('ouro');
  app.setView(forjaView(3000, { ouro: [2, 'metal', 'esmalte'] }));
  app.animations.length = 0;
  app.$('.forja-forge').click();
  await app.advance(0);
  assert.ok(app.$('.forja-choice'), 'a escolha aparece na hora');
  assert.deepEqual([...app.$$('.forja-choice button')].map((b) => b.textContent), ['Ficar com Metal', 'Ficar com Esmalte']);
  await app.advance(5000);
  for (const piece of ['forja-fly', 'forja-hammer', 'forja-spark']) assert.equal(app.seen.has(piece), false, piece + ' não aparece');
  assert.equal(app.sounds.includes('mudaeHammer'), false, 'sem martelo, sem batida');
  assert.ok(app.animations.length > 0, 'só um fade');
  assert.equal(app.animations.some((a) => a.keyframes.some((frame) => 'transform' in frame)), false, 'nada voa nem se mexe');
  assert.ok(app.animations.every((a) => a.keyframes.every((frame) => Object.keys(frame).every((k) => k === 'opacity' || k === 'offset'))));

  // A faixa do nível IV de outra pessoa também só esmaece.
  app.animations.length = 0;
  app.deliver('mudae:forge', { by: 'ana', medal: 'rubi', level: 4 });
  assert.match(app.text(app.$('.forja-flare')), /ANA FORJOU A RUBI IV!/);
  assert.equal(app.$('.forja-ember'), null);
  assert.equal(app.animations.some((a) => a.keyframes.some((frame) => 'transform' in frame)), false);
});

test('o nível IV de alguém acende a forja para todo mundo no Salão, em qualquer aba', async (t) => {
  const app = forja(t, { view: forjaView(9000, { bronze: [3, 'metal'] }),
    replies: { 'mudae:forja:forge': () => ({ medal: 'bronze', level: 4, price: 2000, finish: 'metal', offer: 'galaxia', kakera: 7000 }) } });
  await app.flush();
  // Na Mesa, sem a Forja aberta. O aviso do servidor chega sem acabamento.
  app.deliver('mudae:forge', { by: 'ana', medal: 'diamante', level: 4 });
  const flare = app.$('#salon-view > .forja-flare');
  assert.ok(flare, 'a faixa aparece por cima do Salão');
  assert.equal(app.text(flare.querySelector('.forja-flare-text')), 'ANA FORJOU A DIAMANTE IV!');
  const medal = flare.querySelector('svg.forja-medal');
  assert.equal(medal.getAttribute('data-medal'), 'diamante');
  assert.equal(medal.getAttribute('data-level'), '4');
  assert.ok(app.sounds.includes('mudaeForge'));
  await app.advance(6000);
  assert.equal(app.$('.forja-flare'), null, 'e some sozinha');

  // Quem forjou vê a própria faixa só quando a medalha sai da forja, sem cobrir a animação.
  await app.open();
  await app.pick('bronze');
  app.setView(forjaView(7000, { bronze: [4, 'metal', 'galaxia'] }));
  app.$('.forja-forge').click();
  app.deliver('mudae:forge', { by: 'me', medal: 'bronze', level: 4 });
  await app.advance(1500);
  assert.equal(app.$('.forja-flare'), null, 'durante a forja, a faixa espera');
  await app.advance(3000);
  assert.equal(app.text(app.$('.forja-flare-text')), 'EU FORJOU A BRONZE IV!');
  assert.ok(app.$('.forja-choice'));

  // Fora do Salão ninguém desenha nada.
  await app.advance(6000);
  app.salon.sync(null);
  app.deliver('mudae:forge', { by: 'ana', medal: 'ouro', level: 4 });
  assert.equal(app.$('.forja-flare'), null);
});

test('medalSvg: desenho próprio por medalha, enfeites por nível e ids que não se repetem', async (t) => {
  const app = forja(t);
  const { medalSvg } = app.forge;
  const all = [];
  for (const medal of KEYS) for (const [level, finish] of [[0, null], [1, 'metal'], [2, 'esmalte'], [3, 'holo'], [4, 'galaxia'], [4, null]]) all.push(medalSvg(medal, level, finish, 120));
  const ids = all.flatMap((svg) => [...svg.querySelectorAll('[id]')].map((n) => n.id));
  assert.ok(ids.length > 100);
  assert.equal(new Set(ids).size, ids.length, 'nenhum id repetido entre medalhas na mesma página');
  for (const svg of all) {
    const own = new Set([...svg.querySelectorAll('[id]')].map((n) => n.id));
    const used = [...svg.outerHTML.matchAll(/url\(#([^)]+)\)/g)].map((m) => m[1]);
    assert.ok(used.length > 0);
    assert.ok(used.every((id) => own.has(id)), 'cada medalha só usa as próprias definições');
  }
  const one = (medal, level, finish, size = 120) => medalSvg(medal, level, finish, size);
  const svg = one('rubi', 4, 'galaxia', 96);
  assert.equal(svg.namespaceURI, 'http://www.w3.org/2000/svg');
  assert.equal(svg.getAttribute('width'), '96');
  assert.ok(svg.classList.contains('forja-medal'));
  assert.ok(svg.classList.contains('fin-galaxia'));
  const has = (node, cls) => !!node.querySelector('.' + cls);
  const adorn = (level) => { const m = one('ouro', level, level ? 'metal' : null); return [has(m, 'fm-ribbon'), has(m, 'fm-laurel'), has(m, 'fm-crown')]; };
  assert.deepEqual(adorn(0), [false, false, false]);
  assert.deepEqual(adorn(1), [false, false, false]);
  assert.deepEqual(adorn(2), [true, false, false], 'II ganha fita');
  assert.deepEqual(adorn(3), [true, true, false], 'III ganha louros');
  assert.deepEqual(adorn(4), [true, true, true], 'IV ganha coroa');
  assert.ok(has(one('ouro', 4, 'metal'), 'fm-shine'), 'e brilho');
  // Cada medalha tem a sua silhueta, e cada acabamento o seu desenho.
  const outline = (m) => m.querySelector('.fm-plate').getAttribute('d');
  assert.equal(new Set(KEYS.map((medal) => outline(one(medal, 1, 'metal')))).size, 7);
  assert.ok(has(one('prata', 1, 'galaxia'), 'fm-star'));
  assert.ok(has(one('prata', 1, 'holo'), 'fm-holo'));
  assert.equal(has(one('prata', 1, 'metal'), 'fm-holo'), false);
  // Tamanho pequeno (cartão de perfil): o mesmo desenho, sem os detalhes miúdos.
  const small = one('diamante', 4, 'holo', 28);
  assert.equal(small.getAttribute('width'), '28');
  assert.ok(small.querySelectorAll('*').length < one('diamante', 4, 'holo', 120).querySelectorAll('*').length);
  assert.ok(has(small, 'fm-crown'));
});

test('o $forja do chat desenha as medalhas com o mesmo desenho', async (t) => {
  const app = forja(t);
  const view = forjaView(1234, { bronze: [2, 'esmalte'] });
  const node = app.d.createElement('div');
  node.append(...app.ui.body({ id: 'm', by: 'me', ephemeral: true, mudae: { kind: 'forja', ...view } }));
  const rows = [...node.querySelectorAll('.mudae-medal')];
  assert.equal(rows.length, 7);
  assert.deepEqual(rows.map((r) => r.querySelector('svg.forja-medal')?.getAttribute('data-medal')), KEYS);
  assert.equal(rows[0].querySelector('svg.forja-medal').getAttribute('data-finish'), 'esmalte');
  assert.match(rows[0].textContent, /Bronze II/);
});
