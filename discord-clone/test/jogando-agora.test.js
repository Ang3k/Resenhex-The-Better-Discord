// "Jogando agora": o app do Windows avisa o jogo; o servidor mostra para todo mundo enquanto a conexão existir.
const test = require('node:test');
const assert = require('node:assert/strict');
const { applyPatch } = require('../public/state-patch');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { io } = require('socket.io-client');

const wait = (ms = 100) => new Promise((r) => setTimeout(r, ms));

async function startServer(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'resenhex-'));
  const port = 40000 + Math.floor(Math.random() * 20000);
  const proc = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', DATA_FILE: path.join(dir, 'data.json'), UPLOAD_DIR: path.join(dir, 'uploads'), ACCESS_PASSWORD: '' },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  await new Promise((resolve, reject) => {
    proc.stdout.on('data', (d) => String(d).includes('rodando') && resolve());
    proc.on('exit', reject);
  });
  const clients = [];
  t.after(async () => {
    clients.forEach((c) => c.disconnect());
    const exited = new Promise((resolve) => proc.once('exit', resolve));
    proc.kill();
    await exited;
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${port}`;
  const connect = async (name) => {
    const socket = io(base, { forceNew: true, transports: ['websocket'] });
    clients.push(socket);
    socket.on('state', (s) => (socket.last = s)); socket.on('state:patch', (p) => applyPatch(socket.last, p));
    const res = await new Promise((resolve) => socket.emit('auth', { mode: 'register', name, password: '1234', confirmPassword: '1234' }, resolve));
    assert.ok(!res.error, res.error);
    socket.token = res.token;
    socket.accountId = res.accountId;
    await wait();
    if (!socket.last.serverId) {
      const invite = await new Promise((resolve) => clients[0].emit('server:invite', {}, resolve));
      const joined = await new Promise((resolve) => socket.emit('server:join', { code: invite.code }, resolve));
      assert.ok(!joined.error, joined.error);
    }
    return socket;
  };
  return { base, connect, dir };
}

const emit = (socket, event, payload) => new Promise((resolve) => socket.emit(event, payload, resolve));
const playing = (viewer, id) => viewer.last.members.find((m) => m.id === id).activity;

test('jogando agora: aparece para os outros, some invisível e quando a conexão cai', async (t) => {
  const { base, connect } = await startServer(t);
  const ana = await connect('Ana');
  const beto = await connect('Beto');
  assert.equal(playing(beto, ana.accountId), null);

  const since = Date.now() - 60_000;
  assert.ok((await emit(ana, 'activity', { name: '  VALORANT  ', since })).ok);
  await wait();
  assert.deepEqual(playing(beto, ana.accountId), { name: 'VALORANT', since });

  // Começo no futuro (relógio errado) vira agora; nome gigante é cortado.
  await emit(ana, 'activity', { name: 'x'.repeat(100), since: Date.now() + 3_600_000 });
  await wait();
  const long = playing(beto, ana.accountId);
  assert.equal(long.name.length, 64);
  assert.ok(long.since <= Date.now());

  await emit(ana, 'activity', { name: 'Forza Horizon 5', since });
  await emit(ana, 'presence', { presence: 'invisible' });
  await wait();
  assert.equal(playing(beto, ana.accountId), null);
  await emit(ana, 'presence', { presence: 'online' });
  await wait();
  assert.equal(playing(beto, ana.accountId).name, 'Forza Horizon 5');

  // Outra aba da mesma conta (o site no navegador) não apaga o jogo que o app mandou.
  const browser = io(base, { forceNew: true, transports: ['websocket'] });
  t.after(() => browser.disconnect());
  assert.ok(!(await emit(browser, 'auth', { token: ana.token })).error);
  await emit(browser, 'activity', null);
  await wait();
  assert.equal(playing(beto, ana.accountId).name, 'Forza Horizon 5');

  // O app fechou (ou a internet caiu): o jogo some, mesmo com a outra aba online.
  ana.disconnect();
  await wait(300);
  assert.equal(playing(beto, ana.accountId), null);
});
