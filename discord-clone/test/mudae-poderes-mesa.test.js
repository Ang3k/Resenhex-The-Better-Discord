// Poderes da mesa do Mudae: Cadeado, Laço, Eco e Chuva de cristais.
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { io } = require('socket.io-client');
const { applyPatch } = require('../public/state-patch');
const { readRoot, writeRoot } = require('../server/store');

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
    env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), DATA_FILE: path.join(dir, 'data.json'), UPLOAD_DIR: path.join(dir, 'uploads'), MUDAE_CATALOG: path.join(dir, 'catalogo.json'), MUDAE_CRYSTAL_MS: '3600000,7200000' },
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
    socket.powers = [];
    socket.crystals = [];
    socket.on('chat:message', (m) => socket.messages.push(m.msg));
    socket.on('mudae:power', (p) => socket.powers.push(p));
    socket.on('mudae:crystal', (p) => socket.crystals.push(p));
    socket.call = (event, value = {}) => new Promise((r) => socket.timeout(3000).emit(event, value, (error, reply) => r(error ? { error: error.message } : reply)));
    socket.auth = await socket.call('auth', { mode, name, password: '1234', confirmPassword: '1234' });
    assert.ok(!socket.auth.error, socket.auth.error);
    await wait();
    return socket;
  }
  return { connect, stop };
}

// Catálogo de 400 comuns (todos "M", só o $m e o $h sorteiam). Ana e Beto começam com os poderes que o teste pede nos
// espaços; "spent" lista quem já casou na janela de agora (o casamento está gasto).
async function scene(t, { anaPowers, betoPowers, spent = [] }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'resenhex-mesa-'));
  const catalog = Array.from({ length: 400 }, (_, i) => [1000 + i, 'Personagem ' + i, 'Série', `b${1000 + i}-x.jpg`, 'M', 30000 + i]);
  fs.writeFileSync(path.join(dir, 'catalogo.json'), JSON.stringify(catalog));
  const clients = [];
  let server = await startServer(dir, clients);
  t.after(async () => { await server.stop(); fs.rmSync(dir, { recursive: true, force: true }); });

  const first = await server.connect('Ana');
  const beto0 = await server.connect('Beto');
  const anaId = first.auth.accountId;
  const betoId = beto0.auth.accountId;
  const dbFile = path.join(dir, 'data.db');
  const saved = () => { try { const r = readRoot(dbFile); return r.accounts[anaId] && r.accounts[betoId] && Object.values(r.servers).some((x) => x.ownerId === anaId) ? r : null; } catch { return null; } };
  await eventually(() => assert.ok(saved()), 5000);
  await server.stop();
  const root = saved();
  const community = Object.values(root.servers).find((x) => x.ownerId === anaId);
  const seed = (community.mudae ||= { claims: {}, usage: {} });
  const grant = (list) => ({ unlocked: [...list], slots: [...list, null, null, null].slice(0, 3), readyAt: {} });
  seed.powers = { [anaId]: grant(anaPowers), [betoId]: grant(betoPowers) };
  seed.usage = { ...seed.usage };
  for (const who of spent) seed.usage[who === 'ana' ? anaId : betoId] = { lastClaim: Date.now() };
  writeRoot(dbFile, root);

  server = await startServer(dir, clients);
  const ana = await server.connect('Ana', 'login');
  const invite = await ana.call('server:invite');
  const beto = await server.connect('Beto', 'login');
  assert.ok(!(await beto.call('server:join', { code: invite.code })).error);
  const created = await ana.call('channel', { action: 'create', type: 'mudae', name: 'Salão Mudae' });
  assert.ok(!created.error, created.error);
  await eventually(() => assert.ok(beto.last.channels.find((c) => c.id === created.id)));
  for (const s of [ana, beto]) assert.ok((await s.call('mudae:presence', { channel: created.id })).ok);

  const channel = created.id;
  const rolls = (s) => s.messages.filter((m) => m.mudae?.kind === 'roll');
  const lines = (s) => s.messages.filter((m) => m.mudae?.kind === 'power');
  // Ana roda um $m; devolve a mensagem do roll (que cai num personagem sem dono, o catálogo ainda não tem casados).
  const rollAna = async () => {
    const before = rolls(beto).length;
    assert.ok(!(await ana.call('chat:send', { channel, text: '$m' })).error);
    return eventually(() => { assert.equal(rolls(beto).length, before + 1); return rolls(beto).at(-1); });
  };
  const readyIn = async (s, power) => (await s.call('mudae:powers:get')).readyIn[power];
  const until = (ms) => wait(Math.max(0, ms - Date.now()) + 80);
  return { ana, beto, anaId, betoId, channel, rolls, lines, rollAna, readyIn, until };
}

test('Cadeado durante o giro: ninguém casa, o Laço bate e é gasto', async (t) => {
  const s = await scene(t, { anaPowers: ['cadeado'], betoPowers: ['laco'] });
  const roll = await s.rollAna();
  const d = roll.mudae;
  assert.ok(Date.now() < d.revealAt, 'a cápsula ainda gira');
  const locked = await s.ana.call('mudae:power:use', { channel: s.channel, power: 'cadeado', id: roll.id });
  assert.ok(!locked.error, locked.error);
  const aviso = await eventually(() => { assert.equal(s.beto.powers.length, 1); return s.beto.powers[0]; });
  assert.deepEqual(aviso, { channel: s.channel, by: s.anaId, power: 'cadeado', id: roll.id });
  const line = await eventually(() => { assert.equal(s.lines(s.beto).length, 1); return s.lines(s.beto)[0]; });
  assert.equal(line.mudae.power, 'cadeado');
  assert.equal(line.mudae.ownerId, s.anaId);

  await s.until(d.revealAt);
  const bounced = await s.beto.call('mudae:power:use', { channel: s.channel, power: 'laco', id: roll.id });
  assert.deepEqual(bounced, { bounced: true });
  assert.equal(await s.readyIn(s.beto, 'laco') > 0, true, 'o Laço foi gasto');
  const bump = await eventually(() => { assert.equal(s.beto.powers.length, 2); return s.beto.powers[1]; });
  assert.deepEqual(bump, { channel: s.channel, by: s.betoId, power: 'laco', bounced: true, id: roll.id });
  const bumpLine = await eventually(() => { const l = s.lines(s.ana).find((x) => x.mudae.power === 'laco'); assert.ok(l); return l; });
  assert.equal(bumpLine.mudae.bounced, true);
  assert.equal(bumpLine.mudae.card.id, d.card.id);
  assert.equal(bumpLine.mudae.ownerId, s.betoId);
  assert.equal((await s.beto.call('mudae:status')).claimReady, true, 'o casamento do Beto não foi gasto');

  await s.until(d.priorityUntil);
  assert.match((await s.beto.call('mudae:claim', { channel: s.channel, id: roll.id })).error, /trancada/);
  assert.ok(!(await s.ana.call('mudae:claim', { channel: s.channel, id: roll.id })).error);
});

test('Laço sem cadeado casa na hora, dentro dos 3 s de quem rodou', async (t) => {
  const s = await scene(t, { anaPowers: [], betoPowers: ['laco'] });
  const roll = await s.rollAna();
  await s.until(roll.mudae.revealAt);
  assert.match((await s.beto.call('mudae:claim', { channel: s.channel, id: roll.id })).error, /prioridade/);
  const r = await s.beto.call('mudae:power:use', { channel: s.channel, power: 'laco', id: roll.id });
  assert.deepEqual(r, { lasso: true });
  const married = await eventually(() => { const m = s.ana.messages.find((x) => x.mudae?.kind === 'married'); assert.ok(m); return m; });
  assert.equal(married.mudae.ownerId, s.betoId);
  assert.equal(married.mudae.from, s.anaId);
  assert.equal(married.mudae.lasso, true);
  assert.equal(married.mudae.card.id, roll.mudae.card.id);
  assert.match((await s.ana.call('mudae:claim', { channel: s.channel, id: roll.id })).error, /já tem dono/);
  assert.equal((await s.beto.call('mudae:status')).claimReady, false, 'o Laço gastou o casamento do Beto');
});

test('Laço sem casamento disponível é recusado e não gasta', async (t) => {
  const s = await scene(t, { anaPowers: [], betoPowers: ['laco'], spent: ['beto'] });
  const roll = await s.rollAna();
  await s.until(roll.mudae.revealAt);
  assert.match((await s.beto.call('mudae:power:use', { channel: s.channel, power: 'laco', id: roll.id })).error, /casar de novo em/);
  assert.equal(await s.readyIn(s.beto, 'laco'), 0);
  assert.equal(s.lines(s.beto).length, 0);
});

test('poder fora de hora não gasta a carga', async (t) => {
  const s = await scene(t, { anaPowers: ['cadeado'], betoPowers: ['laco'] });
  const roll = await s.rollAna();
  // Laço durante o giro (ainda não abriu) e no roll de si mesma não valem.
  assert.match((await s.beto.call('mudae:power:use', { channel: s.channel, power: 'laco', id: roll.id })).error, /nos 3 s de quem rodou/);
  await s.until(roll.mudae.revealAt);
  assert.match((await s.ana.call('mudae:power:use', { channel: s.channel, power: 'cadeado', id: roll.id })).error, /enquanto a cápsula gira/);
  assert.match((await s.beto.call('mudae:power:use', { channel: s.channel, power: 'cadeado', id: roll.id })).error, /não está no seu palco/);
  await s.until(roll.mudae.priorityUntil);
  assert.match((await s.beto.call('mudae:power:use', { channel: s.channel, power: 'laco', id: roll.id })).error, /nos 3 s de quem rodou/);
  assert.equal(await s.readyIn(s.ana, 'cadeado'), 0);
  assert.equal(await s.readyIn(s.beto, 'laco'), 0);
  assert.equal(s.lines(s.ana).length, 0);
});

test('Chuva: todos no Salão recebem a chuva', async (t) => {
  const s = await scene(t, { anaPowers: ['chuva'], betoPowers: [] });
  const r = await s.ana.call('mudae:power:use', { channel: s.channel, power: 'chuva' });
  assert.deepEqual(r, { armed: 'chuva' });
  for (const who of [s.ana, s.beto]) {
    const crystal = await eventually(() => { assert.equal(who.crystals.length, 1); return who.crystals[0]; });
    assert.equal(crystal.kind, 'storm');
  }
  const line = await eventually(() => { assert.equal(s.lines(s.beto).length, 1); return s.lines(s.beto)[0]; });
  assert.equal(line.mudae.power, 'chuva');
  assert.equal(line.mudae.ownerId, s.anaId);
  assert.equal(s.beto.powers.length, 1);
  assert.equal(await s.readyIn(s.ana, 'chuva') > 0, true);
});

// As duas cenas abaixo esperam os 45 s do roll acabarem, então rodam juntas.
test('cenas longas: Cadeado com o casamento gasto e Eco', { concurrency: true }, async (t) => {
  await Promise.all([
    t.test('Cadeado com o casamento gasto só impede os outros nos 45 s', async (st) => {
      const s = await scene(st, { anaPowers: ['cadeado'], betoPowers: ['eco'], spent: ['ana'] });
      const roll = await s.rollAna();
      assert.ok(!(await s.ana.call('mudae:power:use', { channel: s.channel, power: 'cadeado', id: roll.id })).error);
      await s.until(roll.mudae.priorityUntil);
      assert.match((await s.beto.call('mudae:claim', { channel: s.channel, id: roll.id })).error, /trancada/);
      assert.match((await s.ana.call('mudae:claim', { channel: s.channel, id: roll.id })).error, /casar de novo em/);
      assert.deepEqual((await s.beto.call('mudae:eco:list', { channel: s.channel })).cards, [], 'ainda dentro dos 45 s');
      await s.until(roll.mudae.expires + 100);
      assert.match((await s.beto.call('mudae:claim', { channel: s.channel, id: roll.id })).error, /trancada|tempo/);
      const eco = await s.beto.call('mudae:eco:list', { channel: s.channel });
      assert.deepEqual(eco.cards.map((c) => c.id), [roll.mudae.card.id]);
    }),
    t.test('Eco traz de volta um personagem que passou sem dono', async (st) => {
      const s = await scene(st, { anaPowers: [], betoPowers: ['eco'] });
      const roll = await s.rollAna();
      assert.match((await s.beto.call('mudae:power:use', { channel: s.channel, power: 'eco', charId: roll.mudae.card.id })).error, /não passou por aqui/);
      await s.until(roll.mudae.expires + 100);
      const eco = await s.beto.call('mudae:eco:list', { channel: s.channel });
      assert.deepEqual(eco.cards.map((c) => c.id), [roll.mudae.card.id]);
      assert.match((await s.beto.call('mudae:power:use', { channel: s.channel, power: 'eco', charId: 'nada' })).error, /não passou por aqui/);
      assert.equal(await s.readyIn(s.beto, 'eco'), 0);

      const used = await s.beto.call('mudae:power:use', { channel: s.channel, power: 'eco', charId: roll.mudae.card.id });
      assert.deepEqual(used, { armed: 'eco' });
      const again = await eventually(() => { const r = s.rolls(s.ana).filter((x) => x.mudae.eco); assert.equal(r.length, 1); return r[0]; });
      assert.equal(again.by, s.betoId);
      assert.equal(again.mudae.card.id, roll.mudae.card.id);
      assert.equal(again.mudae.rollsLeft, (await s.beto.call('mudae:status')).rollsLeft, 'não gasta roll do Beto');
      assert.ok(again.mudae.revealAt > Date.now() - 100 && again.mudae.priorityUntil - again.mudae.revealAt === 3000);
      assert.equal((await s.beto.call('mudae:status')).rollsLeft, (await s.ana.call('mudae:status')).rollsLeft + 1, 'a Ana gastou o dela, o Beto não');
    }),
  ]);
});
