const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');

const publicDir = path.join(__dirname, '..', 'public');
const read = (file) => fs.readFileSync(path.join(publicDir, file), 'utf8');

// ---------- o cristal no Salão, com relógio e quadros controlados (como em mudae-salao-animation) ----------
function salon(t, { reduced = false, take = null } = {}) {
  const dom = new JSDOM('<div id="main"><div id="salon-view"></div><div id="chat-view"></div></div>', { runScripts: 'outside-only' });
  const w = dom.window, d = w.document;
  t.after(() => w.close());
  let time = 100_000, nextTimer = 0;
  const timers = new Map(), frames = [], calls = [], sounds = [], handlers = new Map(), lines = [], animations = [];
  w.Date.now = () => time;
  w.setTimeout = (fn, delay = 0) => { const id = ++nextTimer; timers.set(id, { fn, at: time + Math.max(0, delay) }); return id; };
  w.clearTimeout = (id) => timers.delete(id);
  w.setInterval = () => 1;
  w.clearInterval = () => {};
  w.requestAnimationFrame = (fn) => { frames.push(fn); return frames.length; };
  w.cancelAnimationFrame = () => {};
  w.matchMedia = () => ({ matches: false });
  w.Element.prototype.animate = function (keyframes) { animations.push({ node: this, keyframes }); return { cancel() {}, finish() {} }; };
  // As fotos nunca chegam: a roleta gira com os versos e abre a carta na hora marcada.
  w.Image = function () { const img = d.createElement('img'); img.decode = () => new Promise(() => {}); return img; };
  // O jsdom não desenha: cada teste diz onde fica o que interessa ({ seletor: [x, y, largura, altura] }).
  let boxes = {};
  w.Element.prototype.getBoundingClientRect = function () {
    const [left, top, width, height] = Object.entries(boxes).find(([selector]) => this.matches(selector))?.[1] || [0, 0, 0, 0];
    return { left, top, width, height, x: left, y: top, right: left + width, bottom: top + height };
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
    time = end; await flush();
  }
  // Um quadro de animação: o voo se desenha pela hora do servidor.
  const paint = () => frames.splice(0).forEach((fn) => fn(time));
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
  const call = async (name, payload) => {
    calls.push({ name, payload: JSON.parse(JSON.stringify(payload ?? null)) });
    if (name === 'mudae:presence') return { ok: true, rollsLeft: 9, rollsMax: 10, rollResetIn: 1, claimReady: true, claimResetIn: 1, kakera: 1200 };
    if (name === 'mudae:crystal:take') return take ? take(payload) : null;
    return null;
  };
  const onSocket = (event, fn) => handlers.set(event, fn);
  const ui = { num: String, minutes: String, kakera: () => el('span'), seriesLine: (card) => card.series,
    serverNow: () => time, RARITY: { common: 'Comum' }, SOURCES: { a: { label: 'Anime' } } };
  w.eval(read('mudae-cristal.js'));
  w.eval(read('mudae-salao.js'));
  const crystals = w.MudaeCrystals({ el, call, onSocket, Sounds: { play: (name) => sounds.push(name) }, ui, member: () => null,
    reducedMotion: () => reduced, addLiveLine: (channel, mudae) => lines.push({ channel, mudae }) });
  const state = { me: { accountId: 'me' }, messages: { room: [] } };
  const api = w.MudaeSalon({ state, el, Icon: () => el('svg'), call, onSocket, member: () => null,
    ui, Sounds: { play() {} }, crystals });
  api.sync({ id: 'room' });
  const crystal = (over = {}) => ({ id: 'c1', serverId: 's1', kind: 'drifter', color: '#3b82f6', colorKey: 'azul', value: 100, appearAt: time,
    life: 10_000, seed: 12345, gems: 1, step: 1, from: null, by: null, ...over });
  function roll(id) {
    const msg = { id, bot: 'mudae', by: 'me', ts: time, mudae: { kind: 'roll', revealAt: time + 2000, expires: time + 47_000, priorityUntil: time + 5000,
      decoys: ['a', 'b', 'c'], card: { name: id, image: 'foto', rarity: 'common', series: 'Teste', rank: 1, value: 100, source: 'a' } } };
    state.messages.room.push(msg); api.onMessage('room', msg); return msg;
  }
  return {
    d, api, advance, flush, paint, crystal, sounds, lines, animations, roll,
    layout: (map) => { boxes = map; },
    get time() { return time; },
    deliver: (event, payload) => handlers.get(event)(payload),
    gems: () => [...d.querySelectorAll('.mudae-crystal')],
    takes: () => calls.filter((c) => c.name === 'mudae:crystal:take').map((c) => c.payload),
    press: (node) => node.dispatchEvent(new w.MouseEvent('pointerdown', { bubbles: true, button: 0 })),
  };
}

test('o cristal aparece no appearAt e some depois da vida', async (t) => {
  const app = salon(t);
  await app.flush();
  app.deliver('mudae:crystal', app.crystal({ appearAt: app.time + 1000 }));
  await app.advance(999);
  assert.equal(app.gems().length, 0, 'o navegador não mostra o cristal antes da hora');
  assert.deepEqual(app.sounds, []);
  await app.advance(1);
  const [gem] = app.gems();
  assert.ok(gem, 'aparece no appearAt');
  assert.ok(gem.closest('#salon-view .mudae-crystal-layer'), 'voa por cima da tela do Salão');
  assert.deepEqual(app.sounds, ['mudaeCrystal'], 'toca o som quando aparece');

  app.paint();
  const first = { opacity: Number(gem.style.opacity), transform: gem.style.transform };
  await app.advance(5000); app.paint();
  const middle = { opacity: Number(gem.style.opacity), transform: gem.style.transform };
  await app.advance(4500); app.paint();
  const late = Number(gem.style.opacity);
  assert.ok(first.opacity < 0.1, 'surge aos poucos');
  assert.equal(middle.opacity, 1);
  assert.ok(late < 0.5, 'esmaece no fim da vida');
  assert.notEqual(first.transform, middle.transform, 'atravessa a tela');

  app.deliver('mudae:crystal', app.crystal({ id: 'c2', appearAt: app.time }));
  await app.advance(0);
  assert.equal(app.gems().length, 2, 'dois cristais ao mesmo tempo');
  await app.advance(500);
  assert.deepEqual(app.gems().map((g) => g.dataset.id), ['c2'], 'o primeiro some no fim da vida dele');
  app.api.sync(null);
  assert.equal(app.d.querySelector('.mudae-crystal-layer'), null, 'sair do Salão tira a camada do cristal');
});

test('clicar chama mudae:crystal:take com id e gem', async (t) => {
  const app = salon(t, { take: ({ id, gem }) => (id === 'falha' ? null : { ok: true, amount: gem ? 25 : 130, kakera: 1330, full: true }) });
  await app.flush();
  app.deliver('mudae:crystal', app.crystal());
  await app.advance(2000); app.paint();
  const [gem] = app.gems();
  app.press(gem);
  app.press(gem);
  assert.deepEqual(app.takes(), [{ id: 'c1', gem: 0 }], 'um clique só vai ao servidor uma vez');
  await app.flush();
  assert.equal(app.gems().length, 0, 'para quem pegou, o cristal quebra');
  assert.ok(app.d.querySelectorAll('.mudae-crystal-shard').length > 0, 'estilhaços');
  assert.equal(app.d.querySelector('.mudae-crystal-pop strong').textContent, '+130');
  assert.match(app.d.querySelector('.salon-status-kakera').textContent, /1330/, 'o saldo do Salão muda');
  assert.ok(app.d.querySelector('.salon-status-pill.bump'), 'e o saldo pula');
  await app.advance(700);
  assert.equal(app.d.querySelector('.salon-status-pill.bump'), null, 'o pulo acaba sozinho');

  // A chuva: cada gota vai com o número dela.
  app.deliver('mudae:crystal', app.crystal({ id: 'chuva', kind: 'storm', gems: 16, life: 7000 }));
  await app.advance(1500);
  const drop = app.d.querySelector('.mudae-crystal[data-id="chuva"][data-gem="3"]');
  assert.ok(drop, 'as gotas caem aos poucos');
  assert.ok(drop.classList.contains('drop'));
  app.press(drop);
  assert.deepEqual(app.takes().at(-1), { id: 'chuva', gem: 3 });
  await app.flush();
  assert.equal(app.d.querySelector('.mudae-crystal[data-id="chuva"][data-gem="3"]'), null);
  assert.ok(app.d.querySelector('.mudae-crystal[data-id="chuva"]'), 'as outras gotas continuam caindo');

  // O servidor recusou: o cristal continua lá para tentar de novo.
  app.deliver('mudae:crystal', app.crystal({ id: 'falha' }));
  await app.advance(0);
  const kept = app.d.querySelector('.mudae-crystal[data-id="falha"]');
  app.press(kept);
  await app.flush();
  assert.ok(kept.isConnected);
  assert.equal(kept.disabled, false);

  // Pelo teclado (Enter ou espaço no botão) também pega.
  const before = app.takes().length;
  kept.click();
  assert.deepEqual(app.takes().slice(before), [{ id: 'falha', gem: 0 }]);
});

test('perto da beira, o valor e a frase de baixo ficam dentro da área', async (t) => {
  const app = salon(t, { take: () => ({ ok: true, amount: 10, kakera: 1210, full: false }) });
  await app.flush();
  // Largura de celular: o cristal acabou de entrar pela beira e já dá para pegar.
  app.layout({ '.salon-body, .mudae-crystal-layer': [0, 0, 375, 600] });
  app.deliver('mudae:crystal', app.crystal());
  await app.advance(300); app.paint();
  app.press(app.gems()[0]);
  await app.flush();
  const pop = app.d.querySelector('.mudae-crystal-pop');
  assert.equal(pop.querySelector('small').textContent, 'limite do dia');
  const middle = parseFloat(pop.style.left);
  assert.ok(middle >= 72 && middle <= 375 - 72, `o meio do texto fica a 72 px ou mais das beiras (ficou em ${middle})`);
});

test('com Reduzir animações, o cristal fica parado e dá para clicar', async (t) => {
  const app = salon(t, { reduced: true, take: () => ({ ok: true, amount: 130, kakera: 1330, full: true }) });
  await app.flush();
  app.deliver('mudae:crystal', app.crystal());
  await app.advance(500); app.paint();
  const [gem] = app.gems();
  const early = { opacity: Number(gem.style.opacity), transform: gem.style.transform };
  await app.advance(4500); app.paint();
  assert.equal(gem.style.transform, early.transform, 'fica parado');
  assert.ok(early.opacity > 0 && early.opacity < 1, 'só com fade');
  assert.equal(Number(gem.style.opacity), 1);
  assert.equal(app.d.querySelector('.mudae-crystal-spark'), null, 'sem rastro de brilho');
  app.press(gem);
  assert.deepEqual(app.takes(), [{ id: 'c1', gem: 0 }]);
  await app.flush();
  assert.equal(app.d.querySelector('.mudae-crystal-pop strong').textContent, '+130');
  assert.equal(app.d.querySelector('.mudae-crystal-shard'), null, 'sem estilhaços voando');
  assert.equal(app.animations.some((a) => a.keyframes.some((frame) => frame.transform)), false, 'nada se mexe: o valor só esmaece');
});

test('o cristal que nasce de um roll sai de dentro da carta no palco', async (t) => {
  const app = salon(t);
  await app.flush();
  // A área do Salão tem 800 × 600; a roleta fica num canto e a carta aberta, no meio do palco.
  app.layout({ '.salon-body, .mudae-crystal-layer': [0, 0, 800, 600], '.salon-reel': [40, 40, 100, 150], '.salon-card.big': [300, 100, 200, 300] });
  const middle = (gem) => gem.style.transform.match(/-?[\d.]+(?=px)/g).slice(0, 2).map((n) => Number(n) + 30);
  const roll = app.roll('r1');
  // O relógio do cristal pode disparar um instante antes do da roleta: a carta abre na hora, e é dela que ele sai.
  app.deliver('mudae:crystal', app.crystal({ color: '#facc15', appearAt: roll.mudae.revealAt - 1, from: { channel: 'room', msgId: 'r1' } }));
  await app.advance(1998);
  assert.ok(app.d.querySelector('.salon-reel'), 'a roleta ainda gira');
  assert.equal(app.gems().length, 0, 'e o cristal espera a roleta parar');
  await app.advance(1);
  const [gem] = app.gems();
  const card = app.d.querySelector('.salon-stage .salon-card.big');
  assert.equal(app.d.querySelector('.salon-reel'), null, 'a carta abre quando o cristal nasce');
  assert.equal(card.querySelector('.salon-card-name').textContent, 'r1');
  assert.deepEqual(middle(gem), [400, 250], 'o cristal nasce no meio da carta');
  assert.match(gem.style.transform, /scale\(0\.3/, 'pequeno, para sair crescendo');
  assert.ok(app.animations.some((a) => a.node === card && a.keyframes.some((frame) => frame.boxShadow?.includes('#facc15'))), 'a carta acende na cor do cristal');
  await app.advance(5000); app.paint();
  const [x, y] = middle(gem);
  assert.ok(Math.hypot(x - 400, y - 250) > 100, 'e vai embora dela');

  // Fora da Mesa não há carta na tela: o cristal entra pela beira, como o do relógio.
  app.d.querySelectorAll('.salon-tab')[1].click();
  await app.flush();
  app.deliver('mudae:crystal', app.crystal({ id: 'c2', appearAt: app.time, from: { channel: 'room', msgId: 'r1' } }));
  await app.advance(0);
  const edge = middle(app.gems().find((g) => g.dataset.id === 'c2'))[0];
  assert.ok(edge < 60 || edge > 740, 'entra pela beira da área');
});

// ---------- o app inteiro (chat, presença e modo simplificado), com um socket de mentira ----------
const settle = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0)); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const meId = 'a'.repeat(16);
const me = { id: meId, name: 'Ana', color: '#5865f2', roles: [], online: true, timeoutUntil: 0 };
const channel = (id, name, extra = {}) => ({ id, name, type: 'text', topic: '', categoryId: 'text', private: false, allowedRoles: [], ...extra });
const SNAPSHOT = { serverId: 'server-1', serverName: 'Turma', ownerId: meId, serverIcon: null, servers: [{ id: 'server-1', name: 'Turma', icon: null, owner: true }],
  roles: [{ id: 'everyone', name: '@everyone', perms: [] }], channels: [channel('server-1-chat', 'geral'), channel('server-1-salon', 'salão-mudae', { mudae: true })],
  categories: [{ id: 'text', name: 'Texto' }], members: [me], people: [me], voice: [], bans: [], myPerms: ['ADMIN', 'SEND_MESSAGES', 'MUDAE'] };
// Os mesmos arquivos do server-ui.test.js, na ordem do index.html.
const SCRIPTS = ['compat.js', 'motion.js', 'icons.js', 'format.js', 'sounds.js', 'media-policy.js', 'keybinds.js', 'settings.js', 'site-calls.js', 'site-health.js',
  'photo-editor.js', 'media-session.js', 'media-sfu.js', 'stream-preview.js', 'mobile-stream.js', 'android-screen.js', 'stream-zoom.js', 'changelog.js', 'confetti.js',
  'channel-navigation.js', 'music.js', 'mudae.js', 'mudae-troca.js', 'mudae-cristal.js', 'mudae-salao.js', 'dm-call.js', 'state-patch.js', 'voice-message.js', 'poll.js',
  'gif-picker.js', 'emoji-picker.js', 'lightbox.js', 'voice-fx.js', 'feedback.js', 'clip-model.js', 'clip-buffer.js', 'clip-screen.js', 'clip-render.js', 'clip-ui.js',
  'sound-trimmer.js', 'app.js', 'landing.js'];

async function chatApp(t, { simple = false, take = () => ({ error: 'Esse cristal já sumiu.' }) } = {}) {
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (error) => errors.push(error.message));
  const dom = new JSDOM(read('index.html'), { url: 'https://resenhex.test/', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole });
  const w = dom.window, d = w.document;
  w.localStorage.setItem('token', 'sessao-de-teste');
  w.localStorage.setItem('mudaeSimples', simple ? '1' : '0');
  for (const script of d.querySelectorAll('script:not([src]):not([type="importmap"])')) w.eval(script.textContent);
  const events = [], handlers = new Map();
  const replies = {
    'chat:unread': () => ({ unread: {} }),
    'chat:history': () => ({ messages: [] }),
    'mudae:presence': () => ({ ok: true, rollsLeft: 9, rollsMax: 10, rollResetIn: 600_000, claimReady: true, claimResetIn: 0, kakera: 1200 }),
    'mudae:profile': () => ({ summary: null }),
    'mudae:crystal:take': take,
  };
  const socket = {
    connected: false, active: false,
    on(event, handler) { const before = handlers.get(event); handlers.set(event, before ? (payload) => { before(payload); handler(payload); } : handler); },
    connect() { this.connected = true; }, disconnect() { this.connected = false; }, timeout() { return this; },
    emit(event, payload, callback) {
      events.push({ event, payload: JSON.parse(JSON.stringify(payload ?? null)) });
      queueMicrotask(() => {
        if (event === 'auth') {
          callback?.({ token: 'sessao-de-teste', accountId: meId, sid: 'sid', iceServers: [], permNames: {}, maxUploadMb: 25 });
          handlers.get('social')?.({ friends: [], incoming: [], outgoing: [], blocked: [], dms: [] });
          handlers.get('state')?.(structuredClone(SNAPSHOT));
          return;
        }
        callback?.(null, replies[event]?.(payload) ?? { ok: true });
      });
    },
  };
  w.io = () => socket;
  w.structuredClone = structuredClone;
  w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  w.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  w.Element.prototype.scrollTo = function () {};
  w.Element.prototype.scrollIntoView = function () {};
  w.HTMLMediaElement.prototype.pause = function () {};
  w.HTMLMediaElement.prototype.load = function () {};
  w.fetch = async () => ({ json: async () => ({ hasOwner: true, passwordRequired: false, maxUploadMb: 25, mailEnabled: false }) });
  for (const file of SCRIPTS) w.eval(read(file));
  w.localStorage.setItem('seenVersion', w.APP_VERSION);
  t.after(() => { w.close(); assert.deepEqual(errors, []); });
  await settle();
  const open = async (name) => { [...d.querySelectorAll('.channel-entry')].find((b) => b.textContent.includes(name)).click(); await settle(); };
  const crystal = (over = {}) => ({ id: 'k1', serverId: 'server-1', kind: 'drifter', color: '#3b82f6', colorKey: 'azul', value: 100, appearAt: Date.now(),
    life: 10_000, seed: 7, gems: 1, step: 1, from: null, by: null, ...over });
  const last = (event) => events.filter((e) => e.event === event).at(-1)?.payload;
  return { w, d, events, open, crystal, last, deliver: (event, payload) => handlers.get(event)?.(payload) };
}

test('fim do cristal vira linha ao vivo, que não fica no histórico', async (t) => {
  const app = await chatApp(t);
  await app.open('salão-mudae');
  assert.deepEqual(app.last('mudae:presence'), { channel: 'server-1-salon' });
  app.deliver('mudae:crystal', app.crystal());
  await settle();
  assert.ok(app.d.querySelector('#salon-view .mudae-crystal'), 'o cristal voa no Salão');
  assert.equal(app.d.querySelector('#messages [data-id="live-k1"]'), null, 'no Salão completo o cristal não vira linha ao aparecer');

  app.deliver('mudae:crystal:end', { id: 'k1', kind: 'drifter', colorKey: 'azul', color: '#3b82f6', takers: [{ id: meId, amount: 100 }] });
  await settle();
  const row = app.d.querySelector('#messages [data-id="live-k1"]');
  assert.ok(row, 'a linha entra no chat do Salão');
  assert.match(row.textContent, /Ana\s*pegou o cristal azul/);
  assert.equal(row.querySelector('.msg-actions'), null, 'sem responder, reagir ou apagar: a linha não existe no servidor');
  assert.equal(app.d.querySelector('#salon-view .mudae-crystal'), null, 'o fim tira o cristal da tela');
  assert.equal(app.events.some((e) => e.event === 'chat:send'), false, 'nada vai para o servidor');

  // A conexão cai e volta: o histórico chega de novo, sem a linha ao vivo.
  const histories = app.events.filter((e) => e.event === 'chat:history').length;
  app.deliver('disconnect', 'transport close');
  app.deliver('connect');
  await settle(); await settle();
  assert.equal(app.events.filter((e) => e.event === 'chat:history').length, histories + 1);
  assert.equal(app.d.querySelector('#messages [data-id="live-k1"]'), null, 'o histórico novo não traz a linha');

  // Quem entrou no Salão com o cristal já voando não viu ele, mas fica sabendo quem pegou.
  app.deliver('mudae:crystal:end', { id: 'k9', kind: 'drifter', colorKey: 'roxo', color: '#a35bff', takers: [] });
  await settle();
  assert.match(app.d.querySelector('#messages [data-id="live-k9"]').textContent, /O cristal roxo sumiu/);
});

test('modo simplificado recebe a linha com o botão Pegar', async (t) => {
  const app = await chatApp(t, { simple: true, take: () => ({ ok: true, amount: 130, kakera: 1330, full: true }) });
  await app.open('salão-mudae');
  assert.equal(app.d.querySelector('#salon-view').classList.contains('hidden'), true, 'sem a tela do Salão');
  assert.deepEqual(app.last('mudae:presence'), { channel: 'server-1-salon', simple: true }, 'conta como estar no Salão');

  // O cristal que nasce da carta só aparece quando a roleta para (sem entregar o resultado antes).
  app.deliver('mudae:crystal', app.crystal({ appearAt: Date.now() + 150, from: { channel: 'server-1-salon', msgId: 'r1' } }));
  await settle();
  assert.equal(app.d.querySelector('[data-id="live-k1"]'), null);
  await wait(200); await settle();
  const button = () => app.d.querySelector('[data-id="live-k1"] .mudae-crystal-take');
  assert.match(button().textContent, /💎 Pegar/);
  assert.equal(button().disabled, false);
  button().click(); await settle();
  assert.deepEqual(app.last('mudae:crystal:take'), { id: 'k1', gem: 0 });
  assert.match(button().textContent, /\+130/);
  app.deliver('mudae:crystal:end', { id: 'k1', kind: 'drifter', colorKey: 'azul', color: '#3b82f6', takers: [{ id: meId, amount: 130 }] });
  await settle();
  assert.equal(app.d.querySelectorAll('[data-id="live-k1"]').length, 1, 'o fim troca a linha, sem repetir');
  assert.match(app.d.querySelector('[data-id="live-k1"]').textContent, /Ana\s*pegou o cristal azul/);

  // Ninguém pegou a tempo: o botão expira no fim da vida.
  app.deliver('mudae:crystal', app.crystal({ id: 'k2', life: 300 }));
  await settle();
  const late = () => app.d.querySelector('[data-id="live-k2"] .mudae-crystal-take');
  assert.equal(late().disabled, false);
  await wait(650);
  assert.equal(late().disabled, true);
  assert.match(late().textContent, /Sumiu/);

  await app.open('geral');
  assert.deepEqual(app.last('mudae:presence'), { channel: null }, 'sair do canal sai do Salão');
});
