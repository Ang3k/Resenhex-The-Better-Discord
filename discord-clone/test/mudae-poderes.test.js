// Poderes do Mudae: abrem com conquistas, 3 espaços e recarga.
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { io } = require('socket.io-client');
const { applyPatch } = require('../public/state-patch');
const { createPoderes } = require('../server/mudae-poderes');
const { POWERS, POWER_RECHARGE_MS } = require('../server/mudae-regras');
const { readRoot, writeRoot } = require('../server/store');

const ZERO = { claims: 0, rolls: 0, crystals: 0, legendary: 0, forged: 0, bronzeLevel: 0, medalsAt2: 0 };
const H = 3600_000;
const perks = { rechargeMs: POWER_RECHARGE_MS };
function setup() {
  const clock = { t: 1000 };
  return { clock, poderes: createPoderes({ now: () => clock.t }), store: {} };
}
// A primeira avaliação é o crédito quieto do lançamento; os testes começam depois dela.
const settle = (poderes, store) => poderes.refresh(store, 'a', ZERO);

test('cada poder abre na sua conquista', () => {
  for (const p of POWERS) {
    const { poderes, store } = setup();
    settle(poderes, store);
    const below = poderes.refresh(store, 'a', { ...ZERO, [p.count]: p.need - 1 });
    assert.ok(!below.unlocked.includes(p.key), p.key + ' abriu cedo');
    const at = poderes.refresh(store, 'a', { ...ZERO, [p.count]: p.need });
    assert.deepEqual(at.unlocked, [p.key]);
    assert.deepEqual(at.fresh, [p.key]);
  }
});

test('poder aberto não fecha mais', () => {
  const { poderes, store } = setup();
  settle(poderes, store);
  poderes.refresh(store, 'a', { ...ZERO, claims: 20 });
  const r = poderes.refresh(store, 'a', ZERO);
  assert.deepEqual(r.unlocked, []);
  assert.deepEqual(poderes.powersOf(store, 'a', ZERO, perks).unlocked, ['cadeado']);
});

test('primeira avaliação é quieta: abre os poderes mas não dá aviso público', () => {
  const { poderes, store } = setup();
  const r = poderes.refresh(store, 'a', { ...ZERO, claims: 60 });
  assert.deepEqual(r.unlocked, ['cadeado', 'eco']);
  assert.deepEqual(r.fresh, []);
  assert.equal(r.first, true);
  assert.equal(poderes.refresh(store, 'a', { ...ZERO, claims: 60, forged: 1 }).first, false);
});

test('poderes novos ocupam os espaços vazios, já cheios', () => {
  const { poderes, store } = setup();
  settle(poderes, store);
  poderes.refresh(store, 'a', { ...ZERO, forged: 1, claims: 20, legendary: 1, crystals: 40 });
  const v = poderes.powersOf(store, 'a', ZERO, perks);
  assert.deepEqual(v.slots, ['videncia', 'cadeado', 'amuleto']);
  assert.deepEqual(v.unlocked, ['videncia', 'cadeado', 'amuleto', 'chuva']);
  assert.deepEqual(v.readyIn, { videncia: 0, cadeado: 0, amuleto: 0 });
  assert.deepEqual(v.progress.cadeado, { have: 0, need: 20 });
});

test('trocar: quem entra chega vazio; mover entre espaços mantém a carga', () => {
  for (const rechargeMs of [POWER_RECHARGE_MS, 12 * H]) {
    const { poderes, store, clock } = setup();
    const pk = { rechargeMs };
    settle(poderes, store);
    poderes.refresh(store, 'a', { ...ZERO, forged: 1, claims: 20, legendary: 1, crystals: 40 });
    poderes.use(store, 'a', 'cadeado', pk, () => 1);
    // A chuva está fora do palco: entra no espaço 0, vazia; a vidência sai.
    poderes.equip(store, 'a', 0, 'chuva', pk);
    let v = poderes.powersOf(store, 'a', ZERO, pk);
    assert.deepEqual(v.slots, ['chuva', 'cadeado', 'amuleto']);
    assert.equal(v.readyIn.chuva, rechargeMs);
    // Mover o cadeado (gasto) para o espaço 2 troca com o amuleto, e os dois mantêm a carga.
    clock.t += H;
    poderes.equip(store, 'a', 2, 'cadeado', pk);
    v = poderes.powersOf(store, 'a', ZERO, pk);
    assert.deepEqual(v.slots, ['chuva', 'amuleto', 'cadeado']);
    assert.equal(v.readyIn.cadeado, rechargeMs - H);
    assert.equal(v.readyIn.amuleto, 0);
    poderes.equip(store, 'a', 1, null, pk);
    assert.deepEqual(poderes.powersOf(store, 'a', ZERO, pk).slots, ['chuva', null, 'cadeado']);
    assert.throws(() => poderes.equip(store, 'a', 3, 'chuva', pk), /Espaço inválido/);
    assert.throws(() => poderes.equip(store, 'a', 1, 'eco', pk), /ainda não tem esse poder/);
  }
});

test('usar gasta a carga; recarrega em 24 h, ou 12 h com Diamante IV', () => {
  for (const rechargeMs of [24 * H, 12 * H]) {
    const { poderes, store, clock } = setup();
    const pk = { rechargeMs };
    settle(poderes, store);
    poderes.refresh(store, 'a', { ...ZERO, forged: 1 });
    assert.equal(poderes.use(store, 'a', 'videncia', pk, () => 'ok'), 'ok');
    assert.equal(poderes.powersOf(store, 'a', ZERO, pk).readyIn.videncia, rechargeMs);
    clock.t += rechargeMs - 1;
    assert.throws(() => poderes.use(store, 'a', 'videncia', pk, () => 1), /Vidência recarrega em 1 min/);
    clock.t += 1;
    assert.equal(poderes.use(store, 'a', 'videncia', pk, () => 2), 2);
  }
});

test('poder que falha não gasta a carga', () => {
  const { poderes, store } = setup();
  settle(poderes, store);
  poderes.refresh(store, 'a', { ...ZERO, forged: 1 });
  assert.throws(() => poderes.use(store, 'a', 'videncia', perks, () => { throw new Error('x'); }), /^Error: x$/);
  assert.equal(poderes.powersOf(store, 'a', ZERO, perks).readyIn.videncia, 0);
});

test('não dá para usar poder fora do palco nem sem carga', () => {
  const { poderes, store } = setup();
  settle(poderes, store);
  poderes.refresh(store, 'a', { ...ZERO, forged: 1, claims: 20, legendary: 1, crystals: 40 });
  assert.throws(() => poderes.use(store, 'a', 'chuva', perks, () => 1), /Esse poder não está no seu palco/);
  assert.throws(() => poderes.use(store, 'a', 'eco', perks, () => 1), /Esse poder não está no seu palco/);
  assert.throws(() => poderes.use(store, 'zz', 'videncia', perks, () => 1), /Esse poder não está no seu palco/);
  poderes.use(store, 'a', 'amuleto', perks, () => 1);
  assert.throws(() => poderes.use(store, 'a', 'amuleto', perks, () => 1), /Amuleto recarrega em 24h00/);
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
    socket.unlocks = [];
    socket.on('chat:message', (m) => socket.messages.push(m.msg));
    socket.on('mudae:unlock', (u) => socket.unlocks.push(u));
    socket.call = (event, value = {}) => new Promise((r) => socket.timeout(3000).emit(event, value, (error, reply) => r(error ? { error: error.message } : reply)));
    socket.auth = await socket.call('auth', { mode, name, password: '1234', confirmPassword: '1234' });
    assert.ok(!socket.auth.error, socket.auth.error);
    await wait();
    return socket;
  }
  return { connect, stop };
}

test('poder ganho vira linha no chat e aviso para todos', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'resenhex-poderes-'));
  // Catálogo de 400 personagens: a Ana começa com 19 e casa o 20º (um roll que cair num com dono não serve).
  const catalog = Array.from({ length: 400 }, (_, i) => [1000 + i, 'Personagem ' + i, 'Série', `b${1000 + i}-x.jpg`, 'M', 30000 + i]);
  fs.writeFileSync(path.join(dir, 'catalogo.json'), JSON.stringify(catalog));
  const clients = [];
  let server = await startServer(dir, clients);
  t.after(async () => { await server.stop(); fs.rmSync(dir, { recursive: true, force: true }); });

  const first = await server.connect('Ana');
  const anaId = first.auth.accountId;
  const dbFile = path.join(dir, 'data.db');
  const saved = () => { try { const r = readRoot(dbFile); return r.accounts[anaId] && Object.values(r.servers).some((x) => x.ownerId === anaId) ? r : null; } catch { return null; } };
  await eventually(() => assert.ok(saved()), 5000);
  await server.stop();
  const root = saved();
  const community = Object.values(root.servers).find((x) => x.ownerId === anaId);
  const mudae = (community.mudae ||= { claims: {}, usage: {} });
  for (let i = 0; i < 19; i++) mudae.claims[1000 + i] = { ownerId: anaId, at: 1 };
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

  // Abrir o painel faz o crédito de hoje: 19 casamentos ainda não abrem nada.
  const before = await ana.call('mudae:powers:get');
  assert.ok(!before.error, before.error);
  assert.deepEqual(before.unlocked, []);
  assert.deepEqual(before.progress.cadeado, { have: 19, need: 20 });

  let rollMsg = null;
  for (let tries = 0; tries < 5 && !rollMsg; tries++) {
    const roll = await ana.call('chat:send', { channel: created.id, text: '$w' });
    assert.ok(!roll.error, roll.error);
    await eventually(() => assert.equal(ana.messages.filter((x) => x.mudae?.kind === 'roll').length, tries + 1));
    rollMsg = ana.messages.filter((x) => x.mudae?.kind === 'roll').at(-1);
    if (rollMsg.mudae.ownerId) rollMsg = null; // caiu num personagem que já tem dono
  }
  assert.ok(rollMsg, 'nenhum roll livre');
  await wait(Math.max(0, rollMsg.mudae.revealAt - Date.now()) + 100);
  const claimed = await ana.call('mudae:claim', { channel: created.id, id: rollMsg.id });
  assert.ok(!claimed.error, claimed.error);

  const gift = await eventually(() => { assert.equal(beto.unlocks.length, 1); return beto.unlocks[0]; });
  assert.deepEqual(gift, { by: anaId, power: 'cadeado' });
  assert.equal(ana.unlocks.length, 1);
  const line = await eventually(() => { const m = beto.messages.find((x) => x.mudae?.kind === 'unlock'); assert.ok(m); return m; });
  assert.equal(line.mudae.power, 'cadeado');
  assert.equal(line.mudae.ownerId, anaId);

  const after = await ana.call('mudae:powers:get');
  assert.deepEqual(after.unlocked, ['cadeado']);
  assert.deepEqual(after.slots, ['cadeado', null, null]);
  assert.ok(!(await ana.call('mudae:powers:equip', { slot: 1, power: 'cadeado' })).error);
  assert.deepEqual((await ana.call('mudae:powers:get')).slots, [null, 'cadeado', null]);
  assert.match((await ana.call('mudae:powers:equip', { slot: 0, power: 'eco' })).error, /ainda não tem esse poder/);
});
