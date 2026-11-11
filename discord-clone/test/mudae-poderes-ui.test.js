// Os superpoderes no palco do Salão (public/mudae-poderes.js): o trilho com os 3 espaços, quando cada poder liga,
// a Vidência, a Escolha dupla, o Eco, os efeitos que todos veem e o poder ganho. Relógio controlado, como em
// mudae-salao-animation, mudae-cristal-ui e mudae-forja-ui.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const read = (file) => fs.readFileSync(path.join(__dirname, '..', 'public', file), 'utf8');
const HOUR = 3600_000;

// O que o servidor devolve em mudae:powers:get.
function powersView(slots = ['cadeado', 'videncia', null], over = {}) {
  const keys = ['videncia', 'cadeado', 'amuleto', 'chuva', 'desejo', 'eco', 'dupla', 'laco'];
  return { unlocked: slots.filter(Boolean), slots, readyIn: Object.fromEntries(slots.filter(Boolean).map((k) => [k, 0])),
    progress: Object.fromEntries(keys.map((k) => [k, { have: 0, need: 1 }])), rechargeMs: 24 * HOUR, armed: [], wishes: 1, ...over };
}

function stage(t, { reduced = false, powers = powersView(), replies = {} } = {}) {
  const dom = new JSDOM('<div id="main"><div id="salon-view"></div><div id="chat-view"></div></div>', { runScripts: 'outside-only' });
  const w = dom.window, d = w.document;
  t.after(() => w.close());
  let time = 100_000, nextTimer = 0;
  const timers = new Map(), ticks = [], calls = [], sounds = [], handlers = new Map(), animations = [], seen = new Set(), toasts = [];
  w.Date.now = () => time;
  w.setTimeout = (fn, delay = 0) => { const id = ++nextTimer; timers.set(id, { fn, at: time + Math.max(0, delay) }); return id; };
  w.clearTimeout = (id) => timers.delete(id);
  w.setInterval = (fn) => { ticks.push(fn); return ticks.length; };
  w.clearInterval = (id) => { ticks[id - 1] = null; };
  w.requestAnimationFrame = (fn) => w.setTimeout(fn, 16);
  w.cancelAnimationFrame = (id) => w.clearTimeout(id);
  w.matchMedia = () => ({ matches: reduced });
  w.Element.prototype.animate = function (keyframes) { animations.push({ node: this, keyframes: [].concat(keyframes) }); return { cancel() {}, finish() {} }; };
  // As fotos nunca chegam: a roleta gira com os versos e abre a carta na hora marcada.
  w.Image = function () { const img = d.createElement('img'); img.decode = () => new Promise(() => {}); return img; };
  // Tudo o que passou pela tela em algum momento (as peças dos efeitos somem no fim).
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
    time = end;
    for (const tick of ticks) tick?.();
    await flush();
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
  const answers = { 'mudae:powers:get': () => powers,
    'mudae:presence': () => ({ ok: true, rollsLeft: 9, rollsMax: 10, rollResetIn: 1, claimReady: true, claimResetIn: 1, kakera: 1200 }), ...replies };
  const call = async (name, payload) => {
    calls.push({ name, payload: JSON.parse(JSON.stringify(payload ?? null)) });
    return answers[name] ? answers[name](payload) : null;
  };
  const onSocket = (event, fn) => { const before = handlers.get(event); handlers.set(event, before ? (p) => { before(p); fn(p); } : fn); };
  const people = { ana: 'Ana', me: 'Eu' };
  const member = (id) => (people[id] ? { id, name: people[id] } : null);
  const Sounds = { play: (name) => sounds.push(name) };
  const state = { me: { accountId: 'me' }, messages: { room: [] }, textChannel: 'room' };
  for (const file of ['mudae.js', 'mudae-icones.js', 'mudae-poderes.js', 'mudae-salao.js']) w.eval(read(file));
  const ui = w.MudaeUI({ state, el, Icon: () => el('i'), call, member, avatar: () => el('span'), nameColor: () => '', Format: { render: (text) => text }, fmtCtx: {},
    openProfile() {}, openImage() {}, openChannel() {}, renderMessages() {}, keepBottom() {} });
  const salon = w.MudaeSalon({ state, el, Icon: () => el('i'), call, onSocket, member, avatar: () => el('span'), nameColor: () => '', ui, Sounds,
    toast: (text) => toasts.push(text) });
  salon.sync({ id: 'room' });
  const $ = (sel) => d.querySelector(sel);
  const $$ = (sel) => [...d.querySelectorAll(sel)];
  const text = (node) => node.textContent.replace(/\s+/g, ' ').trim();
  const sent = (name) => calls.filter((c) => c.name === name).map((c) => c.payload);
  let n = 0;
  // Um roll chegando pelo chat, como o servidor manda.
  function roll(id, { by = 'me', name = id, rarity = 'common', ...extra } = {}) {
    const msg = { id, bot: 'mudae', by, ts: time, mudae: { kind: 'roll', revealAt: time + 2000, expires: time + 47_000, priorityUntil: time + 5000,
      decoys: ['a', 'b', 'c'], card: { id: ++n, name, image: 'foto-' + id, rarity, series: 'Teste', rank: 1, value: 100, source: 'a' }, ...extra } };
    state.messages.room.push(msg); salon.onMessage('room', msg); return msg;
  }
  const slot = (power) => $(`.poder-rail .poder-slot[data-power="${power}"]`);
  const orb = (power) => slot(power).querySelector('.poder-orb');
  return { w, d, $, $$, text, sent, ui, salon, state, sounds, animations, seen, toasts, advance, flush, roll, slot, orb,
    get time() { return time; },
    deliver: (event, payload) => handlers.get(event)(payload),
    update: (msg, change) => { Object.assign(msg.mudae, change); salon.onUpdate('room', msg); },
    use: async (power) => { orb(power).click(); await flush(); },
    setPowers: (next) => { powers = next; } };
}

test('o trilho mostra os 3 espaços com carga e nome', async (t) => {
  const app = stage(t, { powers: powersView(['cadeado', 'videncia', null], { readyIn: { cadeado: 6 * HOUR, videncia: 0 } }) });
  await app.flush();
  assert.equal(app.sent('mudae:powers:get').length, 1, 'busca os poderes ao abrir a Mesa');
  const rail = app.$('.salon-stage .poder-rail');
  assert.ok(rail, 'o trilho fica dentro do palco');
  const slots = [...rail.querySelectorAll('.poder-slot')];
  assert.equal(slots.length, 3);
  assert.deepEqual(slots.map((s) => app.text(s.querySelector('.poder-name'))), ['Cadeado', 'Vidência', 'espaço livre']);
  assert.deepEqual(slots.map((s) => s.dataset.power || ''), ['cadeado', 'videncia', '']);

  // Cadeado: gastou há 18 h de 24 h. O anel está em 3/4 e o texto diz quanto falta.
  const cadeado = app.slot('cadeado');
  assert.ok(cadeado.classList.contains('charging'));
  assert.equal(Number(app.orb('cadeado').style.getPropertyValue('--p')), 0.75);
  assert.match(app.text(cadeado.querySelector('.poder-state')), /^volta em 6h00$/);
  assert.equal(app.orb('cadeado').disabled, true, 'recarregando não dá para usar');
  // Vidência: cheia e pronta.
  assert.ok(app.slot('videncia').classList.contains('ready'));
  assert.equal(Number(app.orb('videncia').style.getPropertyValue('--p')), 1);
  assert.match(app.text(app.slot('videncia').querySelector('.poder-state')), /^pronto$/);
  assert.equal(app.orb('videncia').disabled, false);
  assert.ok(app.orb('videncia').querySelector('svg.mi-videncia'), 'o ícone desenhado da Vidência');
  assert.equal(app.orb('videncia').textContent, '', 'nenhum emoji no botão');
  // O espaço vazio não é botão.
  assert.ok(slots[2].classList.contains('empty'));
  assert.equal(slots[2].querySelector('button'), null);

  // O relógio anda: a carga enche sozinha, sem perguntar de novo ao servidor.
  await app.advance(3 * HOUR);
  assert.equal(Number(app.orb('cadeado').style.getPropertyValue('--p')), 0.875);
  assert.match(app.text(cadeado.querySelector('.poder-state')), /^volta em 3h00$/);
  assert.equal(app.sent('mudae:powers:get').length, 1);

  // Trocou um poder na Forja: ao voltar para a Mesa, o trilho mostra os espaços novos.
  app.setPowers(powersView(['cadeado', 'videncia', 'eco'], { readyIn: { cadeado: 0, videncia: 0, eco: 24 * HOUR } }));
  app.$$('.salon-tab').find((b) => b.textContent === 'Ranking').click();
  await app.flush();
  app.$$('.salon-tab').find((b) => b.textContent === 'Mesa').click();
  await app.flush();
  assert.equal(app.sent('mudae:powers:get').length, 2);
  assert.deepEqual(app.$$('.salon-stage .poder-rail .poder-name').map((x) => app.text(x)), ['Cadeado', 'Vidência', 'Eco']);
  assert.equal(Number(app.orb('eco').style.getPropertyValue('--p')), 0, 'o poder que entrou chega vazio');

  // Sair do Salão tira o trilho.
  app.salon.sync(null);
  assert.equal(app.$('.poder-rail'), null);
});

test('Cadeado só liga no seu roll girando; Laço só nos 3 s de outra pessoa', async (t) => {
  const app = stage(t, { powers: powersView(['cadeado', 'laco', 'videncia']), replies: { 'mudae:power:use': ({ power }) => (power === 'laco' ? { lasso: true } : { armed: power }) } });
  await app.flush();
  const off = (power) => app.orb(power).disabled;
  assert.deepEqual([off('cadeado'), off('laco')], [true, true], 'sem roll no palco, nenhum dos dois liga');
  assert.match(app.text(app.slot('cadeado').querySelector('.poder-state')), /no seu roll/);
  assert.match(app.text(app.slot('laco').querySelector('.poder-state')), /outra pessoa/);

  // O meu roll: enquanto a cápsula gira, o Cadeado liga. O Laço não (o roll é meu).
  const mine = app.roll('meu');
  await app.flush();
  assert.deepEqual([off('cadeado'), off('laco')], [false, true]);
  assert.ok(app.slot('cadeado').classList.contains('ready'));
  app.setPowers(powersView(['cadeado', 'laco', 'videncia'], { readyIn: { cadeado: 24 * HOUR, laco: 0, videncia: 0 } }));
  await app.use('cadeado');
  assert.deepEqual(app.sent('mudae:power:use'), [{ channel: 'room', power: 'cadeado', id: 'meu' }]);
  assert.ok(app.slot('cadeado').classList.contains('charging'), 'gastou: começa a recarregar');
  assert.equal(app.sent('mudae:powers:get').length, 2, 'o servidor não devolve a recarga: busca de novo');
  // O servidor avisa que a carta trancou: o cadeado aparece na carta, ainda girando.
  app.update(mine, { lockedBy: 'me' });
  assert.ok(app.$('.salon-card-slot.locked .poder-lock'), 'o cadeado fica na carta');
  // A carta abriu e continua trancada.
  await app.advance(2000);
  app.salon.onHistory('room');
  assert.ok(app.$('.salon-card-slot.locked .salon-card.big'), 'a carta aberta continua trancada');
  assert.match(app.text(app.$('.salon-stage-caption')), /^Você rodou/);
  assert.ok(app.$('.salon-stage-caption svg.mi-cadeado'));
  assert.match(app.text(app.$('.salon-claim-caption')), /Trancado: só você pode casar/);

  // Outro app, outra mesa: o roll da Ana.
  const other = stage(t, { powers: powersView(['cadeado', 'laco', 'videncia']), replies: { 'mudae:power:use': () => ({ lasso: true }) } });
  await other.flush();
  const off2 = (power) => other.orb(power).disabled;
  other.roll('dela', { by: 'ana' });
  await other.flush();
  assert.deepEqual([off2('cadeado'), off2('laco')], [true, true], 'girando o roll de outra pessoa: nem Cadeado (não é meu), nem Laço (ainda não abriu)');
  await other.advance(2000);
  assert.deepEqual([off2('cadeado'), off2('laco')], [true, false], 'nos 3 s dela, o Laço liga');
  await other.use('laco');
  assert.deepEqual(other.sent('mudae:power:use'), [{ channel: 'room', power: 'laco', id: 'dela' }]);

  // Passaram os 3 s: o Laço não liga mais.
  const late = stage(t, { powers: powersView(['cadeado', 'laco', 'videncia']) });
  await late.flush();
  late.roll('dela', { by: 'ana' });
  await late.advance(2000);
  assert.equal(late.orb('laco').disabled, false);
  await late.advance(3000);
  assert.equal(late.orb('laco').disabled, true);
  late.orb('laco').click();
  await late.flush();
  assert.deepEqual(late.sent('mudae:power:use'), [], 'desligado não manda nada');
});

test('Vidência mostra 3 raridades só para quem usou', async (t) => {
  const app = stage(t, { powers: powersView(['videncia', 'amuleto', null]),
    replies: { 'mudae:power:use': ({ power }) => (power === 'videncia' ? { future: ['rare', 'common', 'legendary'], wish: false } : { armed: power, future: ['epic', 'common', 'legendary'], wish: false }) } });
  await app.flush();
  assert.equal(app.$('.poder-future'), null);
  await app.use('videncia');
  assert.deepEqual(app.sent('mudae:power:use'), [{ channel: 'room', power: 'videncia' }]);
  const future = app.$('.salon-stage .poder-future');
  assert.ok(future, 'as cápsulas ficam no palco, à esquerda');
  assert.match(app.text(future), /só você vê/);
  const caps = () => app.$$('.poder-future .poder-capsule');
  assert.deepEqual(caps().map((c) => app.text(c)), ['1º · Raro', '2º · Comum', '3º · Lendário']);
  assert.deepEqual(caps().map((c) => c.dataset.rarity), ['rare', 'common', 'legendary']);
  assert.ok(app.sounds.includes('mudaePower'));

  // O Amuleto usado depois muda a previsão, e a Vidência mostra isso. O servidor passa a dizer que ele está ativo.
  app.setPowers(powersView(['videncia', 'amuleto', null], { readyIn: { videncia: 24 * HOUR, amuleto: 24 * HOUR }, armed: ['amuleto'] }));
  await app.use('amuleto');
  assert.deepEqual(caps().map((c) => app.text(c)), ['1º · Épico', '2º · Comum', '3º · Lendário']);
  assert.ok(app.slot('amuleto').classList.contains('armed'));
  assert.match(app.text(app.slot('amuleto').querySelector('.poder-state')), /^ativo no próximo roll$/);

  // Cada roll meu gasta uma previsão (e o Amuleto); o roll dos outros não.
  app.roll('dela', { by: 'ana' });
  await app.flush();
  assert.equal(caps().length, 3);
  app.setPowers(powersView(['videncia', 'amuleto', null], { readyIn: { videncia: 24 * HOUR, amuleto: 24 * HOUR } }));
  app.roll('meu');
  await app.flush();
  assert.deepEqual(caps().map((c) => app.text(c)), ['1º · Comum', '2º · Lendário']);
  assert.equal(app.slot('amuleto').classList.contains('armed'), false, 'o Amuleto valeu para esse roll');
  assert.ok(app.$('.salon-stage .poder-future'), 'a previsão continua no palco depois que o palco é redesenhado');

  // Quem está vendo não vê nada: a Vidência de outra pessoa nem chega, e um aviso perdido não desenha.
  const other = stage(t, { powers: powersView(['videncia', null, null]) });
  await other.flush();
  other.deliver('mudae:power', { channel: 'room', by: 'ana', power: 'videncia' });
  await other.flush();
  assert.equal(other.$('.poder-future'), null);
  assert.equal(other.$('.poder-banner'), null);
});

test('Escolha dupla desenha duas cartas e a faixa na que ficou livre', async (t) => {
  const app = stage(t, { powers: powersView(['dupla', null, null]) });
  await app.flush();
  const a = app.roll('levi', { name: 'Levi', pair: 'par1' });
  const b = app.roll('mikasa', { name: 'Mikasa', pair: 'par1' });
  await app.advance(2000);
  const cards = () => app.$$('.salon-stage .salon-pair .salon-card.big');
  assert.deepEqual(cards().map((c) => c.querySelector('.salon-card-name').textContent), ['Levi', 'Mikasa'], 'as duas cartas lado a lado, na ordem em que saíram');
  assert.match(app.text(app.$('.salon-stage-caption')), /Escolha uma/);
  assert.equal(app.$('.poder-ribbon'), null);
  // Tocar numa carta escolhe com qual casar.
  cards()[0].querySelector('.salon-card-art').click();
  assert.ok(cards()[0].classList.contains('chosen'));
  assert.equal(cards()[1].classList.contains('chosen'), false);
  app.$('.salon-claim').click();
  await app.flush();
  assert.deepEqual(app.sent('mudae:claim'), [{ channel: 'room', id: 'levi' }]);

  // O servidor: casei com o Levi, e a Mikasa ficou livre para os outros.
  app.update(a, { ownerId: 'me' });
  app.update(b, { pairFree: true, priorityUntil: app.time });
  const [levi, mikasa] = cards();
  assert.ok(levi.classList.contains('picked'));
  assert.equal(levi.querySelector('.poder-ribbon'), null);
  assert.match(app.text(mikasa.querySelector('.poder-ribbon')), /^Livre para casar$/);
  assert.equal(app.$('.salon-claim.primary'), null, 'quem rodou já ficou com uma: não casa com a outra');
  assert.match(app.text(app.$('.salon-stage-caption')), /Você ficou com Levi\. A outra está livre para os outros\./);
  // Alguém casou com a que sobrou: a faixa e a legenda dizem quem foi.
  app.update(b, { ownerId: 'ana' });
  assert.match(app.text(cards()[1].querySelector('.poder-ribbon')), /^Ana casou$/);
  assert.ok(cards()[1].querySelector('.poder-ribbon svg.mi-ring'));
  assert.match(app.text(app.$('.salon-stage-caption')), /Você ficou com Levi\. Ana casou com a outra\./);

  // Para quem está vendo: a carta livre é a escolhida, com o botão de casar.
  const other = stage(t, { powers: powersView([null, null, null]) });
  await other.flush();
  const c = other.roll('levi', { by: 'ana', name: 'Levi', pair: 'par1' });
  const e = other.roll('mikasa', { by: 'ana', name: 'Mikasa', pair: 'par1' });
  await other.advance(2000);
  assert.equal(other.$$('.salon-pair .salon-card.big').length, 2, 'as duas cartas da dupla aparecem para todos');
  other.update(c, { ownerId: 'ana' });
  other.update(e, { pairFree: true, priorityUntil: other.time });
  const free = other.$$('.salon-pair .salon-card.big')[1];
  assert.match(other.text(free.querySelector('.poder-ribbon')), /^Livre para casar$/);
  assert.ok(free.classList.contains('chosen'));
  assert.equal(other.$('.salon-claim.primary').disabled, false);
  other.$('.salon-claim.primary').click();
  await other.flush();
  assert.deepEqual(other.sent('mudae:claim'), [{ channel: 'room', id: 'mikasa' }]);

  // A Ana laçou uma das minhas duas antes de eu escolher: a outra continua minha, e o palco já aponta para ela.
  const lassoed = stage(t, { powers: powersView([null, null, null]) });
  await lassoed.flush();
  const f = lassoed.roll('levi', { name: 'Levi', pair: 'par2' });
  lassoed.roll('mikasa', { name: 'Mikasa', pair: 'par2' });
  await lassoed.advance(2000);
  lassoed.$$('.salon-pair .salon-card.big')[0].querySelector('.salon-card-art').click();
  lassoed.update(f, { ownerId: 'ana', lasso: true });
  assert.match(lassoed.text(lassoed.$('.salon-stage-caption')), /^Ana levou Levi\. Mikasa ainda é sua\.$/);
  const [levi2, mikasa2] = lassoed.$$('.salon-pair .salon-card.big');
  assert.ok(mikasa2.classList.contains('chosen'), 'a que sobrou fica escolhida');
  assert.equal(levi2.classList.contains('chosen'), false);
  assert.equal(lassoed.$('.salon-claim.primary').disabled, false);
});

test('Eco abre a escolha e manda o charId', async (t) => {
  const cards = [{ id: 27, name: 'Killua', image: 'k.jpg', rarity: 'epic', series: 'Hunter x Hunter', value: 530, source: 'a' },
    { id: 40, name: 'Luffy', image: 'l.jpg', rarity: 'legendary', series: 'ONE PIECE', value: 910, source: 'a' }];
  let list = { cards };
  const app = stage(t, { powers: powersView(['eco', null, null]), replies: { 'mudae:eco:list': () => list, 'mudae:power:use': () => ({ armed: 'eco' }) } });
  await app.flush();
  await app.use('eco');
  assert.deepEqual(app.sent('mudae:eco:list'), [{ channel: 'room' }]);
  assert.deepEqual(app.sent('mudae:power:use'), [], 'abrir a escolha não gasta o poder');
  const picker = app.$('.salon-stage .poder-eco');
  assert.ok(picker);
  assert.match(app.text(picker), /Qual personagem volta\?/);
  const options = app.$$('.poder-eco-card');
  assert.deepEqual(options.map((o) => o.querySelector('.poder-eco-name').textContent), ['Killua', 'Luffy']);
  assert.ok(app.slot('eco').classList.contains('ready'), 'ainda não gastou');
  // Cancelar fecha sem gastar.
  app.$('.poder-eco-cancel').click();
  assert.equal(app.$('.poder-eco'), null);
  assert.deepEqual(app.sent('mudae:power:use'), []);

  await app.use('eco');
  app.setPowers(powersView(['eco', null, null], { readyIn: { eco: 24 * HOUR } }));
  app.$$('.poder-eco-card')[1].click();
  await app.flush();
  assert.deepEqual(app.sent('mudae:power:use'), [{ channel: 'room', power: 'eco', charId: 40 }]);
  assert.equal(app.$('.poder-eco'), null, 'a escolha fecha');
  assert.ok(app.slot('eco').classList.contains('charging'));

  // O roll que volta vem marcado com eco: o palco diz que voltou, e não que rodou.
  app.roll('luffy', { name: 'Luffy', eco: true });
  await app.advance(2000);
  assert.match(app.text(app.$('.salon-stage-caption')), /trouxe de volta/);

  // Ninguém passou sem dono: só um aviso.
  list = { cards: [] };
  const empty = stage(t, { powers: powersView(['eco', null, null]), replies: { 'mudae:eco:list': () => list } });
  await empty.flush();
  await empty.use('eco');
  assert.equal(empty.$('.poder-eco'), null);
  assert.equal(empty.toasts.length, 1);
  assert.match(empty.toasts[0], /sem dono/);
});

test('no celular, o trilho vira fileira embaixo da carta', async (t) => {
  const app = stage(t, { powers: powersView(['cadeado', 'videncia', 'chuva']) });
  await app.flush();
  app.roll('meu');
  await app.advance(2000);
  // A ordem na página é a do celular: a carta, o trilho logo embaixo e só depois o botão de casar.
  const order = [...app.$('.salon-stage').children].map((n) => n.className.split(' ')[0]);
  assert.equal(order.indexOf('poder-rail'), order.indexOf('salon-card-slot') + 1);
  assert.ok(order.indexOf('salon-actions') > order.indexOf('poder-rail'));
  // No CSS: até 640 px o trilho sai do canto, vira fileira e mantém o alvo de toque de 44 px.
  const css = read('mudae-poderes.css');
  const mobile = /@media \(max-width: 640px\) \{([\s\S]*?)\n\}/.exec(css)?.[1] || '';
  const rule = (selector) => new RegExp(selector.replace(/[.]/g, '\\.') + ' \\{([^}]*)\\}').exec(mobile)?.[1] || '';
  assert.match(rule('.poder-rail'), /position: static/);
  assert.match(rule('.poder-rail'), /flex-direction: row/);
  const size = Number(/width: (\d+)px/.exec(rule('.poder-orb'))?.[1]);
  assert.ok(size >= 44, 'o botão do poder tem pelo menos 44 px no celular');
  // A folha de estilo e o script entram na página, na ordem combinada.
  const html = read('index.html');
  assert.ok(html.indexOf('mudae-poderes.css') > html.indexOf('mudae-salao.css'));
  assert.ok(html.indexOf('"mudae-poderes.js"') > html.indexOf('"mudae.js"') && html.indexOf('"mudae-poderes.js"') < html.indexOf('"mudae-salao.js"'));
});

test('poder ganho anima para quem ganhou e vira linha para os outros', async (t) => {
  const app = stage(t, { powers: powersView(['videncia', null, null]) });
  await app.flush();
  // Ganhei o Cadeado: ele entra no primeiro espaço livre.
  app.setPowers(powersView(['videncia', 'cadeado', null]));
  app.deliver('mudae:unlock', { by: 'me', power: 'cadeado' });
  await app.flush();
  const banner = app.$('.salon-stage .poder-banner');
  assert.ok(banner);
  assert.match(app.text(banner), /^VOCÊ GANHOU O CADEADO!$/);
  assert.ok(app.sounds.includes('mudaeUnlock'));
  const fly = app.$('.poder-fly');
  assert.ok(fly, 'a bolinha voa');
  assert.ok(app.animations.some((a) => a.node === fly), 'com movimento');
  assert.ok(app.slot('cadeado').classList.contains('incoming'), 'o espaço espera a bolinha chegar');
  await app.advance(3000);
  assert.equal(app.$('.poder-fly'), null);
  assert.equal(app.$('.poder-banner'), null);
  assert.equal(app.slot('cadeado').classList.contains('incoming'), false);
  assert.equal(Number(app.orb('cadeado').style.getPropertyValue('--p')), 1, 'o poder ganho chega cheio');

  // O mesmo aviso repetido não repete a faixa.
  app.deliver('mudae:unlock', { by: 'me', power: 'cadeado' });
  await app.flush();
  assert.equal(app.$('.poder-banner'), null);

  // Vários de uma vez (o crédito do dia do lançamento): uma faixa por vez, em fila.
  app.setPowers(powersView(['videncia', 'cadeado', 'eco'], { unlocked: ['videncia', 'cadeado', 'eco', 'amuleto'] }));
  app.deliver('mudae:unlock', { by: 'me', power: 'eco' });
  app.deliver('mudae:unlock', { by: 'me', power: 'amuleto' });
  await app.flush();
  assert.deepEqual(app.$$('.poder-banner').map((b) => app.text(b.querySelector('strong'))), ['VOCÊ GANHOU O ECO!']);
  await app.advance(3000);
  // O Amuleto não coube nos 3 espaços: a faixa aparece, mas nada voa para um espaço que não existe.
  const full = app.$$('.poder-banner');
  assert.equal(full.length, 1);
  assert.match(app.text(full[0].querySelector('strong')), /^VOCÊ GANHOU O AMULETO!$/);
  assert.match(app.text(full[0]), /Forja/);
  assert.equal(app.$('.poder-fly'), null);
  await app.advance(3000);
  assert.equal(app.$('.poder-banner'), null);

  // Para os outros: nada de faixa nem de voo. O que eles veem é a linha no chat.
  app.deliver('mudae:unlock', { by: 'ana', power: 'laco' });
  await app.flush();
  assert.equal(app.$('.poder-banner'), null);
  assert.equal(app.$('.poder-fly'), null);
  const [line] = app.ui.body({ id: 'm1', bot: 'mudae', by: 'ana', ts: app.time, mudae: { kind: 'unlock', ownerId: 'ana', power: 'laco' } });
  assert.match(app.text(line), /Ana ganhou um poder: Laço!/);

  // Ganhou fora da Mesa (forjando, por exemplo): a faixa espera a pessoa voltar para o palco.
  const away = stage(t, { powers: powersView(['videncia', null, null]) });
  await away.flush();
  away.$$('.salon-tab').find((b) => b.textContent === 'Ranking').click();
  away.setPowers(powersView(['videncia', 'chuva', null]));
  away.deliver('mudae:unlock', { by: 'me', power: 'chuva' });
  await away.flush();
  assert.equal(away.$('.poder-banner'), null);
  away.$$('.salon-tab').find((b) => b.textContent === 'Mesa').click();
  await away.flush();
  assert.match(away.text(away.$('.salon-stage .poder-banner')), /^VOCÊ GANHOU A CHUVA DE CRISTAIS!$/);
});

test('efeitos que todos veem: o cadeado cai na carta e o Laço bate nele', async (t) => {
  const app = stage(t, { powers: powersView([null, null, null]) });
  await app.flush();
  const dela = app.roll('dela', { by: 'ana', name: 'Levi' });
  await app.flush();
  // A Ana trancou o roll dela enquanto girava.
  app.deliver('mudae:power', { channel: 'room', by: 'ana', power: 'cadeado', id: 'dela' });
  app.update(dela, { lockedBy: 'ana' });
  await app.flush();
  assert.ok(app.seen.has('poder-fx-lock'), 'o cadeado cai na carta');
  assert.ok(app.$('.salon-card-slot.locked .poder-lock'));
  await app.advance(2000);
  // A carta abriu trancada: quem não trancou não casa.
  assert.equal(app.$('.salon-claim').disabled, true);
  assert.match(app.text(app.$('.salon-claim-caption')), /Trancado por Ana/);
  // Alguém tentou o Laço e bateu no cadeado.
  app.deliver('mudae:power', { channel: 'room', by: 'me', power: 'laco', id: 'dela', bounced: true });
  await app.advance(800);
  assert.ok(app.seen.has('poder-rope'), 'a corda aparece');
  assert.match(app.text(app.$('.poder-banner')), /BATEU NO CADEADO/);

  // O Laço que pega: a faixa diz quem laçou quem.
  const win = stage(t, { powers: powersView([null, null, null]) });
  await win.flush();
  const meu = win.roll('meu', { name: 'Levi' });
  await win.advance(2000);
  win.deliver('mudae:power', { channel: 'room', by: 'ana', power: 'laco', id: 'meu' });
  // O casamento chega logo atrás do aviso e redesenha o palco, com a corda ainda no ar.
  win.update(meu, { ownerId: 'ana', lasso: true });
  await win.advance(800);
  assert.ok(win.seen.has('poder-rope'));
  assert.match(win.text(win.$('.poder-banner')), /^ANA LAÇOU LEVI!$/);
  assert.ok(win.$('.poder-banner svg.mi-laco'));
  const pulled = win.animations.filter((a) => a.node === win.$('.salon-card-slot .salon-card.big') && a.keyframes.some((k) => /translateX\(/.test(k.transform || '')));
  assert.equal(pulled.length, 1, 'a carta que está no palco agora é puxada para o lado de quem laçou');
  // Os outros poderes públicos também desenham no palco de quem está vendo.
  for (const [power, piece] of [['amuleto', 'poder-fx-clover'], ['desejo', 'poder-fx-star'], ['eco', 'poder-fx-wave'], ['dupla', 'poder-fx-twin']]) {
    win.deliver('mudae:power', { channel: 'room', by: 'ana', power });
    await win.flush();
    assert.ok(win.seen.has(piece), `${power} desenha ${piece}`);
  }
  // Aviso de outro Salão não desenha aqui.
  const before = win.animations.length;
  win.deliver('mudae:power', { channel: 'outro', by: 'ana', power: 'amuleto' });
  assert.equal(win.animations.length, before);
});

test('o $poder do chat também acende o espaço com "ativo no próximo roll"', async (t) => {
  const app = stage(t, { powers: powersView(['amuleto', 'desejo', null]) });
  await app.flush();
  // Usei o Amuleto pelo chat: o servidor avisa o Salão, e o meu trilho acende como se fosse o botão.
  app.setPowers(powersView(['amuleto', 'desejo', null], { readyIn: { amuleto: 24 * HOUR, desejo: 0 }, armed: ['amuleto'] }));
  app.deliver('mudae:power', { channel: 'room', by: 'me', power: 'amuleto' });
  await app.flush();
  assert.ok(app.slot('amuleto').classList.contains('armed'));
  assert.match(app.text(app.slot('amuleto').querySelector('.poder-state')), /^ativo no próximo roll$/);
  // O de outra pessoa não acende o meu.
  app.deliver('mudae:power', { channel: 'room', by: 'ana', power: 'desejo' });
  await app.flush();
  assert.equal(app.slot('desejo').classList.contains('armed'), false);
  // O meu roll gasta.
  app.roll('meu');
  await app.flush();
  assert.equal(app.slot('amuleto').classList.contains('armed'), false);
});

test('o trilho só acende o que o servidor deixa: ativo depois de recarregar, Laço sem casamento, desejo sem lista', async (t) => {
  // Recarregou a página com o Amuleto já ativo: o servidor diz, e o espaço acende.
  const reload = stage(t, { powers: powersView(['amuleto', 'dupla', null], { readyIn: { amuleto: 23 * HOUR, dupla: 0 }, armed: ['amuleto'] }) });
  await reload.flush();
  assert.ok(reload.slot('amuleto').classList.contains('armed'));
  assert.match(reload.text(reload.slot('amuleto').querySelector('.poder-state')), /^ativo no próximo roll$/);
  assert.ok(reload.slot('dupla').classList.contains('ready'));

  // Casei há pouco: o Laço não liga nos 3 s da Ana e diz quando volta, como o botão de casar.
  const app = stage(t, { powers: powersView(['laco', 'desejo', null], { wishes: 0 }),
    replies: { 'mudae:presence': () => ({ ok: true, rollsLeft: 9, rollsMax: 10, rollResetIn: 1, claimReady: false, claimResetIn: 2 * HOUR, kakera: 1200 }) } });
  await app.flush();
  app.roll('dela', { by: 'ana' });
  await app.advance(2000);
  assert.ok(app.slot('laco').classList.contains('waiting'));
  assert.equal(app.slot('laco').classList.contains('ready'), false);
  assert.match(app.text(app.slot('laco').querySelector('.poder-state')), /^casa de novo em 2h00$/);
  app.orb('laco').click();
  await app.flush();
  assert.deepEqual(app.sent('mudae:power:use'), [], 'não manda o que o servidor recusaria');
  // Lista de desejos vazia: o Chamar desejo fica apagado e diz por quê.
  assert.ok(app.slot('desejo').classList.contains('waiting'));
  assert.match(app.text(app.slot('desejo').querySelector('.poder-state')), /^lista de desejos vazia$/);
  assert.equal(app.orb('desejo').disabled, true);
});

test('a reserva da Esmeralda conta: o Laço liga e o botão Casar vale, menos na outra carta da própria dupla', async (t) => {
  // Já casei nesta janela, mas a reserva da Esmeralda está pronta: o servidor aceita o casamento.
  const reserve = () => ({ ok: true, rollsLeft: 9, rollsMax: 10, rollResetIn: 1, claimReady: false, claimResetIn: 2 * HOUR, reserveReady: true, kakera: 1200 });
  const app = stage(t, { powers: powersView(['laco', null, null]), replies: { 'mudae:presence': reserve, 'mudae:power:use': () => ({ lasso: true }) } });
  await app.flush();
  const dela = app.roll('dela', { by: 'ana', name: 'Levi' });
  await app.advance(2000);
  assert.ok(app.slot('laco').classList.contains('ready'), 'o Laço liga nos 3 s da Ana');
  await app.use('laco');
  assert.deepEqual(app.sent('mudae:power:use'), [{ channel: 'room', power: 'laco', id: 'dela' }]);
  // Passou a prioridade: o botão Casar vale e avisa que vai usar a reserva.
  await app.advance(3500);
  assert.equal(app.$('.salon-claim.primary').disabled, false);
  assert.match(app.text(app.$('.salon-claim-caption')), /reserva da Esmeralda/);
  app.$('.salon-claim.primary').click();
  await app.flush();
  assert.deepEqual(app.sent('mudae:claim'), [{ channel: 'room', id: 'dela' }]);
  assert.ok(dela);

  // Sem casamento e sem reserva: o botão continua travado, como antes.
  const none = stage(t, { powers: powersView([null, null, null]),
    replies: { 'mudae:presence': () => ({ ...reserve(), reserveReady: false }) } });
  await none.flush();
  none.roll('dela', { by: 'ana' });
  await none.advance(5500);
  assert.equal(none.$('.salon-claim.primary').disabled, true);
  assert.match(none.text(none.$('.salon-claim-caption')), /^Você casa de novo em 2h00$/);

  // Escolha dupla: quem rodou fica com uma; a outra é dos outros, mesmo com a reserva pronta.
  const pair = stage(t, { powers: powersView([null, null, null]), replies: { 'mudae:presence': reserve } });
  await pair.flush();
  const a = pair.roll('levi', { name: 'Levi', pair: 'par3' });
  const b = pair.roll('mikasa', { name: 'Mikasa', pair: 'par3' });
  await pair.advance(2000);
  pair.update(a, { ownerId: 'me' });
  pair.update(b, { pairFree: true, priorityUntil: pair.time });
  pair.$$('.salon-pair .salon-card.big')[1].querySelector('.salon-card-art').click();
  assert.equal(pair.$('.salon-claim.primary'), null, 'a outra carta do par não é oferecida');
  assert.match(pair.text(pair.$('.salon-actions')), /livre para os outros/);
});

test('redesenhar o palco não tira a escolha do Eco nem a faixa do lugar', async (t) => {
  const cards = [{ id: 27, name: 'Killua', image: 'k.jpg', rarity: 'epic', series: 'Hunter x Hunter', value: 530, source: 'a' }];
  const app = stage(t, { powers: powersView(['eco', null, null]), replies: { 'mudae:eco:list': () => ({ cards }) } });
  await app.flush();
  await app.use('eco');
  const picker = app.$('.poder-eco');
  const focused = app.d.activeElement;
  assert.ok(focused.classList.contains('poder-eco-card'), 'o foco vai para a primeira carta');
  app.deliver('mudae:power', { channel: 'room', by: 'ana', power: 'laco', id: 'nada' });
  const banner = app.$('.poder-banner');
  assert.ok(banner);
  // A mesa está movimentada: chega um roll da Ana e o palco é redesenhado.
  let moved = 0;
  new app.w.MutationObserver((list) => { for (const m of list) for (const n of m.removedNodes) if (n === picker || n === banner) moved++; })
    .observe(app.$('.salon-stage'), { childList: true });
  app.roll('dela', { by: 'ana' });
  await app.advance(2000);
  app.salon.onHistory('room');
  await app.flush();
  assert.equal(moved, 0, 'nem a escolha do Eco nem a faixa saíram do palco');
  assert.equal(app.$('.poder-eco'), picker);
  assert.equal(app.d.activeElement, focused, 'o foco continua na carta');
  assert.ok(app.$('.salon-stage .salon-card-slot'), 'o resto do palco foi redesenhado');
  // A ordem do celular continua: a carta, o trilho e o botão de casar.
  const order = [...app.$('.salon-stage').children].map((n) => n.className.split(' ')[0]);
  assert.equal(order.indexOf('poder-rail'), order.indexOf('salon-card-slot') + 1);
  assert.equal(order.indexOf('salon-actions'), order.indexOf('poder-rail') + 1);
});

test('com "Reduzir animações": sem voo, só troca de estado', async (t) => {
  const app = stage(t, { reduced: true, powers: powersView(['videncia', null, null]),
    replies: { 'mudae:power:use': () => ({ future: ['rare', 'common', 'epic'], wish: false }) } });
  await app.flush();
  const before = app.animations.length;
  app.setPowers(powersView(['videncia', 'cadeado', null]));
  app.deliver('mudae:unlock', { by: 'me', power: 'cadeado' });
  await app.flush();
  assert.match(app.text(app.$('.poder-banner')), /^VOCÊ GANHOU O CADEADO!$/, 'a faixa aparece');
  assert.equal(app.$('.poder-fly'), null, 'nada voa');
  assert.ok(app.slot('cadeado'), 'o poder já está no espaço dele');
  assert.equal(app.slot('cadeado').classList.contains('incoming'), false);
  app.roll('meu', { name: 'Levi' });
  await app.flush();
  for (const power of ['amuleto', 'desejo', 'eco', 'dupla']) app.deliver('mudae:power', { channel: 'room', by: 'ana', power });
  app.deliver('mudae:power', { channel: 'room', by: 'ana', power: 'laco', id: 'meu' });
  await app.use('videncia');
  assert.equal(app.$$('.poder-capsule').length, 3, 'a Vidência mostra as cápsulas, paradas');
  assert.equal(app.animations.length, before, 'nenhuma animação feita em JavaScript');
  assert.equal(app.$('.poder-fx > *'), null, 'nenhuma peça de efeito no palco');
  await app.advance(3000);
  assert.equal(app.$('.poder-banner'), null, 'a faixa sai sozinha');
});
