// Forja do Mudae: medalhas, níveis, preços, acabamento sorteado e os eventos de socket.
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { io } = require('socket.io-client');
const { applyPatch } = require('../public/state-patch');
const { createForja, perksOf } = require('../server/mudae-forja');
const { createMudae } = require('../server/mudae');
const { readRoot, writeRoot } = require('../server/store');

function setup(random = () => 0) {
  const forja = createForja({ now: () => 0, random: () => random() });
  const store = { claims: {}, usage: {}, kakera: { a: 5000 } };
  return { forja, store, setRandom: (v) => { random = () => v; } };
}

test('forjar segue os níveis e cobra base × nível', () => {
  const { forja, store } = setup();
  const spent = [];
  for (let i = 1; i <= 4; i++) {
    const r = forja.forge(store, 'a', 'bronze');
    spent.push(r.price);
    assert.equal(r.level, i);
    if (r.offer) forja.chooseFinish(store, 'a', 'bronze', 'old');
  }
  assert.deepEqual(spent, [500, 1000, 1500, 2000]);
  assert.equal(store.kakera.a, undefined, 'saldo zerado some do mapa');
  assert.throws(() => forja.forge(store, 'a', 'bronze'), /nível IV/);
});

test('sem kakera, diz quanto falta', () => {
  const { forja, store } = setup();
  store.kakera.a = 400;
  const before = JSON.stringify(store);
  assert.throws(() => forja.forge(store, 'a', 'bronze'), /Faltam 100/);
  assert.equal(JSON.stringify(store), before);
});

test('nível I já sai com acabamento; do II em diante a pessoa escolhe', () => {
  const { forja, store, setRandom } = setup();
  setRandom(0.95);
  const first = forja.forge(store, 'a', 'bronze');
  assert.equal(first.finish, 'holo');
  assert.equal(first.offer, null);
  setRandom(0.99);
  const second = forja.forge(store, 'a', 'bronze');
  assert.equal(second.offer, 'galaxia');
  assert.equal(second.finish, 'holo');
  assert.deepEqual(forja.chooseFinish(store, 'a', 'bronze', 'old'), { finish: 'holo' });
  assert.equal(forja.medalsOf(store, 'a').bronze.offer, null);
  forja.forge(store, 'a', 'bronze');
  assert.deepEqual(forja.chooseFinish(store, 'a', 'bronze', 'new'), { finish: 'galaxia' });
  assert.deepEqual(forja.medalsOf(store, 'a').bronze, { level: 3, finish: 'galaxia', offer: null });
  assert.equal(forja.medalsOf(store, 'a').prata.level, 0);
  assert.equal(Object.keys(forja.medalsOf(store, 'a')).length, 7);
});

test('com acabamento pendente, não forja nem reforja', () => {
  const { forja, store } = setup();
  forja.forge(store, 'a', 'bronze');
  forja.forge(store, 'a', 'bronze');
  const kakera = store.kakera.a;
  assert.throws(() => forja.forge(store, 'a', 'bronze'), /Escolha o acabamento antes/);
  assert.throws(() => forja.reforge(store, 'a', 'bronze'), /Escolha o acabamento antes/);
  assert.equal(store.kakera.a, kakera);
});

test('reforjar custa 500 e oferece um acabamento novo', () => {
  const { forja, store, setRandom } = setup();
  assert.throws(() => forja.reforge(store, 'a', 'bronze'), /Forje a Bronze antes/);
  forja.forge(store, 'a', 'bronze');
  const before = store.kakera.a;
  setRandom(0.7);
  const r = forja.reforge(store, 'a', 'bronze');
  assert.equal(r.price, 500);
  assert.equal(r.offer, 'esmalte');
  assert.equal(r.finish, 'metal');
  assert.equal(r.kakera, before - 500);
  assert.equal(store.kakera.a, before - 500);
});

test('sorteio segue 60/28/10/2', () => {
  const { forja, store, setRandom } = setup();
  const picks = [[0, 'metal'], [0.599, 'metal'], [0.6, 'esmalte'], [0.879, 'esmalte'], [0.88, 'holo'], [0.979, 'holo'], [0.98, 'galaxia'], [0.999, 'galaxia']];
  for (const [r, finish] of picks) {
    setRandom(r);
    const s = { kakera: { a: 5000 } };
    assert.equal(forja.forge(s, 'a', 'bronze').finish, finish, `random ${r}`);
  }
  void store;
});

test('perksOf soma as medalhas', () => {
  const none = perksOf({}, 'a');
  assert.deepEqual(none, { wishSlots: 0, carry: 0, crystalBonus: 0, dkDouble: false, extraRolls: 0, wishChance: 0, reserveEveryMs: 0, rechargeMs: 24 * 3600_000 });
  const store = { medals: { a: { bronze: { level: 2 }, ouro: { level: 4 }, diamante: { level: 1 } } } };
  assert.deepEqual(perksOf(store, 'a'), { wishSlots: 2, carry: 0, crystalBonus: 0.3, dkDouble: true, extraRolls: 0, wishChance: 0, reserveEveryMs: 0, rechargeMs: 20 * 3600_000 });
});

test('forjar com kakera oferecido numa troca cancela a troca na confirmação', () => {
  const catalog = [[1, 'Satoru Gojou', 'Jujutsu Kaisen', 'b1-a.png', 'M', 900]];
  const mudae = createMudae({ catalog, now: () => 1000, random: () => 0, refSize: 1 });
  const forja = createForja({ random: () => 0 });
  const store = { claims: { 1: { ownerId: 'b' } }, usage: {}, kakera: { a: 600 } };
  const t = mudae.tradeOpen(store, { serverId: 's', a: 'a', b: 'b' });
  mudae.tradeOffer(store, t.id, 'a', { kakera: 600 });
  mudae.tradeConfirm(store, t.id, 'a', { rev: t.rev });
  forja.forge(store, 'a', 'bronze'); // gasta 500, sobram 100
  assert.equal(store.kakera.a, 100);
  mudae.tradeConfirm(store, t.id, 'b', { rev: t.rev });
  assert.equal(t.state, 'canceled');
  assert.match(t.reason, /Faltou kakera/);
  assert.equal(store.claims[1].ownerId, 'b');
  assert.equal(store.kakera.a, 100);
  assert.equal(store.kakera.b, undefined);
});

// ---------------- pelo socket ----------------
const wait = (ms = 70) => new Promise((r) => setTimeout(r, ms));
async function eventually(check, timeout = 2000) {
  const end = Date.now() + timeout;
  for (;;) {
    try { return check(); } catch (error) { if (Date.now() > end) throw error; }
    await wait(20);
  }
}

async function startServer(dir, clients) {
  const port = 40000 + Math.floor(Math.random() * 20000);
  const proc = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), DATA_FILE: path.join(dir, 'data.json'), UPLOAD_DIR: path.join(dir, 'uploads'), MUDAE_CATALOG: path.join(dir, 'catalogo.json') },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Server startup timeout')), 8000);
    proc.stdout.on('data', (data) => { if (String(data).includes('rodando')) { clearTimeout(timer); resolve(); } });
    proc.once('exit', (code) => { clearTimeout(timer); reject(new Error('Server exited: ' + code)); });
  });
  const stop = async () => {
    clients.splice(0).forEach((s) => s.disconnect());
    if (proc.exitCode !== null || proc.signalCode) return;
    const exit = new Promise((r) => proc.once('exit', r)); proc.kill(); await exit;
  };
  async function connect(name, mode = 'register') {
    const socket = io('http://127.0.0.1:' + port, { forceNew: true, transports: ['websocket'] }); clients.push(socket);
    socket.on('state', (s) => { socket.last = s; }); socket.on('state:patch', (p) => applyPatch(socket.last, p));
    socket.messages = [];
    socket.forges = [];
    socket.on('chat:message', (m) => socket.messages.push(m.msg));
    socket.on('mudae:forge', (f) => socket.forges.push(f));
    socket.call = (event, value = {}) => new Promise((r) => socket.timeout(3000).emit(event, value, (error, reply) => r(error ? { error: error.message } : reply)));
    socket.auth = await socket.call('auth', { mode, name, password: '1234', confirmPassword: '1234' });
    assert.ok(!socket.auth.error, socket.auth.error);
    await wait();
    return socket;
  }
  return { connect, stop };
}

test('Forja pelo socket: forjar, nível IV vira linha e aviso para todos', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'resenhex-forja-'));
  fs.writeFileSync(path.join(dir, 'catalogo.json'), JSON.stringify([[40882, 'Eren Yeager', 'Attack on Titan', 'b40882-x.jpg', 'M', 31784]]));
  const clients = [];
  let server = await startServer(dir, clients);
  t.after(async () => { await server.stop(); fs.rmSync(dir, { recursive: true, force: true }); });

  // Primeira rodada: só cria a conta da Ana. Quando ela já está gravada, o servidor para e o banco ganha 5000 de kakera para ela.
  const first = await server.connect('Ana');
  const anaId = first.auth.accountId;
  const dbFile = path.join(dir, 'data.db');
  const saved = () => { try { const r = readRoot(dbFile); return r.accounts[anaId] && Object.values(r.servers).some((x) => x.ownerId === anaId) ? r : null; } catch { return null; } };
  await eventually(() => assert.ok(saved()), 5000);
  await server.stop();
  const root = saved();
  const community = Object.values(root.servers).find((x) => x.ownerId === anaId);
  (community.mudae ||= { claims: {}, usage: {} }).kakera = { [anaId]: 5000 };
  writeRoot(dbFile, root);

  server = await startServer(dir, clients);
  const ana = await server.connect('Ana', 'login');
  const invite = await ana.call('server:invite');
  const beto = await server.connect('Beto');
  assert.ok(!(await beto.call('server:join', { code: invite.code })).error);
  const created = await ana.call('channel', { action: 'create', type: 'mudae', name: 'Salão Mudae' });
  assert.ok(!created.error, created.error);
  await eventually(() => assert.ok(beto.last.channels.find((c) => c.id === created.id)));
  assert.ok((await ana.call('mudae:presence', { channel: created.id })).ok);
  assert.ok((await beto.call('mudae:presence', { channel: created.id })).ok);

  const got = await ana.call('mudae:forja:get');
  assert.equal(got.kakera, 5000);
  assert.equal(got.prices.bronze, 500);
  assert.equal(got.medals.bronze.level, 0);
  assert.equal(got.perks.wishSlots, 0);

  assert.match((await ana.call('mudae:forja:forge', { medal: 'nada' })).error, /Medalha inválida/);
  for (let level = 1; level <= 4; level++) {
    const r = await ana.call('mudae:forja:forge', { medal: 'bronze' });
    assert.ok(!r.error, r.error);
    assert.equal(r.level, level);
    if (r.offer) assert.ok(!(await ana.call('mudae:forja:finish', { medal: 'bronze', pick: 'new' })).error);
  }
  assert.match((await ana.call('mudae:forja:forge', { medal: 'bronze' })).error, /nível IV/);

  const aviso = await eventually(() => { assert.equal(beto.forges.length, 1); return beto.forges[0]; });
  assert.equal(aviso.medal, 'bronze');
  assert.equal(aviso.level, 4);
  assert.equal(aviso.by, anaId);
  const line = await eventually(() => { const m = beto.messages.find((x) => x.mudae?.kind === 'medal'); assert.ok(m); return m; });
  assert.equal(line.mudae.medal, 'bronze');
  assert.equal(line.mudae.level, 4);
  assert.equal(line.mudae.ownerId, anaId);

  const after = await ana.call('mudae:forja:get');
  assert.equal(after.kakera, 0);
  assert.equal(after.prices.bronze, null);
  assert.equal(after.medals.bronze.level, 4);
});
