const test = require('node:test');
const assert = require('node:assert/strict');
const { applyPatch } = require('../public/state-patch');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { io } = require('socket.io-client');
const wait = (ms = 70) => new Promise((r) => setTimeout(r, ms));
async function eventually(check, timeout = 2000) {
  const end = Date.now() + timeout;
  for (;;) {
    try { return check(); } catch (error) { if (Date.now() > end) throw error; }
    await wait(20);
  }
}

// Catálogo de um personagem só: todo roll cai nele, então dá para testar o claim disputado.
async function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'resenhex-mudae-'));
  const catalog = path.join(dir, 'catalogo.json');
  fs.writeFileSync(catalog, JSON.stringify([[40882, 'Eren Yeager', 'Attack on Titan', 'b40882-x.jpg', 'M', 31784]]));
  const port = 40000 + Math.floor(Math.random() * 20000);
  const base = 'http://127.0.0.1:' + port;
  const proc = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), DATA_FILE: path.join(dir, 'data.json'), UPLOAD_DIR: path.join(dir, 'uploads'), MUDAE_CATALOG: catalog, MUDAE_CRYSTAL_MS: '200,300' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Server startup timeout')), 5000);
    proc.stdout.on('data', (data) => { if (String(data).includes('rodando')) { clearTimeout(timer); resolve(); } });
    proc.once('exit', (code) => { clearTimeout(timer); reject(new Error('Server exited: ' + code)); });
  });
  const clients = [];
  t.after(async () => {
    clients.forEach((s) => s.disconnect());
    const exit = new Promise((r) => proc.once('exit', r)); proc.kill(); await exit;
    fs.rmSync(dir, { recursive: true, force: true });
  });
  // Segundo aparelho da mesma conta.
  async function login(name) {
    const socket = io(base, { forceNew: true, transports: ['websocket'] }); clients.push(socket);
    socket.crystals = [];
    socket.on('mudae:crystal', (c) => socket.crystals.push(c));
    socket.call = (event, value = {}) => new Promise((r) => socket.timeout(3000).emit(event, value, (error, reply) => r(error ? { error: error.message } : reply)));
    const auth = await socket.call('auth', { mode: 'login', name, password: '1234' });
    assert.ok(!auth.error, auth.error);
    await wait();
    return socket;
  }
  async function connect(name) {
    const socket = io(base, { forceNew: true, transports: ['websocket'] }); clients.push(socket);
    socket.on('state', (s) => { socket.last = s; }); socket.on('state:patch', (p) => applyPatch(socket.last, p));
    socket.messages = [];
    socket.updates = [];
    socket.on('chat:message', (m) => socket.messages.push(m.msg));
    socket.on('chat:update', (m) => socket.updates.push(m.msg));
    socket.on('mudae:presence', (p) => { socket.presence = p; });
    socket.crystals = [];
    socket.ends = [];
    socket.on('mudae:crystal', (c) => socket.crystals.push(c));
    socket.on('mudae:crystal:end', (c) => socket.ends.push(c));
    socket.reactions = [];
    socket.on('mudae:reaction', (r) => socket.reactions.push(r));
    socket.call = (event, value = {}) => new Promise((r) => socket.timeout(3000).emit(event, value, (error, reply) => r(error ? { error: error.message } : reply)));
    socket.auth = await socket.call('auth', { mode: 'register', name, password: '1234', confirmPassword: '1234' });
    assert.ok(!socket.auth.error, socket.auth.error);
    await wait();
    if (!socket.last.serverId) {
      const invite = await clients[0].call('server:invite');
      assert.ok(!(await socket.call('server:join', { code: invite.code })).error);
    }
    return socket;
  }
  return { connect, login, base };
}


// Dois no mesmo Salão (Ana cria o Salão, Beto entra).
async function duo(t) {
  const f = await fixture(t);
  const ana = await f.connect('Ana');
  const beto = await f.connect('Beto');
  const created = await ana.call('channel', { action: 'create', type: 'mudae', name: 'Salão Mudae' });
  assert.ok(!created.error, created.error);
  await eventually(() => assert.ok(beto.last.channels.find((c) => c.id === created.id)));
  return { ...f, ana, beto, salon: created.id };
}
const firstCrystal = (s, after = 0) => eventually(() => { const c = s.crystals.find((x) => x.appearAt >= after); assert.ok(c, 'sem cristal'); return c; }, 4000);

test('o mesmo cristal chega para todos no Salão e cada um pega o seu', async (t) => {
  const { ana, beto, salon } = await duo(t);
  await ana.call('mudae:presence', { channel: salon });
  await beto.call('mudae:presence', { channel: salon });
  const c = await firstCrystal(ana);
  assert.equal((await firstCrystal(beto)).id, c.id);
  assert.equal(c.kind === 'chain' || c.kind === 'drifter' || c.kind === 'storm', true);
  const a = await ana.call('mudae:crystal:take', { id: c.id });
  const b = await beto.call('mudae:crystal:take', { id: c.id });
  assert.ok(!a.error, a.error);
  assert.ok(!b.error, b.error);
  assert.equal(a.ok, true);
  assert.ok(a.amount > 0 && a.kakera >= a.amount && a.full === true);
  assert.ok(b.amount > 0);
});

test('a mesma conta em dois aparelhos pega uma vez só e aparece uma vez em "No salão"', async (t) => {
  const { ana, beto, salon, login } = await duo(t);
  const ana2 = await login('Ana');
  await ana.call('mudae:presence', { channel: salon });
  await ana2.call('mudae:presence', { channel: salon });
  await beto.call('mudae:presence', { channel: salon });
  await eventually(() => assert.equal(beto.presence.people.length, 2));
  assert.deepEqual(beto.presence.people.map((p) => p.id).sort(), [ana.auth.accountId, beto.auth.accountId].sort());
  const c = await firstCrystal(ana2);
  assert.ok(!(await ana.call('mudae:crystal:take', { id: c.id })).error);
  assert.match((await ana2.call('mudae:crystal:take', { id: c.id })).error, /já pegou/);
});

test('quando o cristal acaba, todos recebem quem pegou', async (t) => {
  const { ana, beto, salon } = await duo(t);
  await ana.call('mudae:presence', { channel: salon });
  await beto.call('mudae:presence', { channel: salon });
  const c = await firstCrystal(ana);
  await firstCrystal(beto);
  const a = await ana.call('mudae:crystal:take', { id: c.id });
  const b = await beto.call('mudae:crystal:take', { id: c.id });
  const end = await eventually(() => { const e = beto.ends.find((x) => x.id === c.id); assert.ok(e, 'sem fim'); return e; }, 15_000);
  assert.deepEqual(end.takers.map((x) => x.id).sort(), [ana.auth.accountId, beto.auth.accountId].sort());
  assert.equal(end.takers.find((x) => x.id === ana.auth.accountId).amount, a.amount);
  assert.equal(end.takers.find((x) => x.id === beto.auth.accountId).amount, b.amount);
  assert.ok(ana.ends.find((x) => x.id === c.id));
  assert.equal(end.colorKey, c.colorKey);
});

test('cristal que sumiu ou de antes de reiniciar dá "já sumiu"', async (t) => {
  const { ana, salon } = await duo(t);
  await ana.call('mudae:presence', { channel: salon });
  assert.match((await ana.call('mudae:crystal:take', { id: 'inventado' })).error, /já sumiu/);
});

test('roll de personagem com dono faz o cristal nascer da carta', async (t) => {
  const { ana, beto, salon } = await duo(t);
  await ana.call('mudae:presence', { channel: salon });
  await beto.call('mudae:presence', { channel: salon });
  const lastRoll = (s) => s.messages.filter((m) => m.bot === 'mudae' && m.mudae?.kind === 'roll').at(-1);
  await ana.call('chat:send', { channel: salon, text: '$w' });
  const first = await eventually(() => { const m = lastRoll(ana); assert.ok(m); return m; });
  await wait(first.mudae.revealAt - Date.now() + 50);
  assert.ok(!(await ana.call('mudae:claim', { channel: salon, id: first.id })).error);
  await beto.call('chat:send', { channel: salon, text: '$w' });
  const second = await eventually(() => { const m = lastRoll(beto); assert.ok(m && m.id !== first.id); return m; });
  assert.equal(second.mudae.ownerId, ana.auth.accountId);
  const c = await eventually(() => { const x = ana.crystals.find((k) => k.from?.msgId === second.id); assert.ok(x, 'sem cristal da carta'); return x; });
  assert.equal(c.appearAt, second.mudae.revealAt);
  assert.equal(c.from.channel, salon);
  assert.equal(c.by, beto.auth.accountId);
  assert.ok(beto.crystals.find((k) => k.id === c.id));
});

test('modo simplificado conta como presente', async (t) => {
  const { ana, beto, salon } = await duo(t);
  assert.ok((await ana.call('mudae:presence', { channel: salon, simple: true })).ok);
  await eventually(() => assert.deepEqual(ana.presence.people.map((p) => p.id), [ana.auth.accountId]));
  const c = await firstCrystal(ana);
  assert.equal(beto.crystals.length, 0, 'quem não está no Salão não recebe');
  assert.ok(!(await ana.call('mudae:crystal:take', { id: c.id })).error);
  assert.match((await beto.call('mudae:crystal:take', { id: c.id })).error, /já sumiu/, 'fora do Salão não pega');
});
