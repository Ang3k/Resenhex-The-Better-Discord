// "Sobre mim" no perfil: salvo na conta, limpo pelo servidor e visto por todo mundo.
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
const bioOf = (viewer, id) => viewer.last.members.find((m) => m.id === id).bio;

test('sobre mim: salva limpo, aparece para os outros e pode ser apagado', async (t) => {
  const { connect } = await startServer(t);
  const ana = await connect('Ana');
  const beto = await connect('Beto');
  assert.equal(bioOf(beto, ana.accountId), null);

  const saved = await emit(ana, 'profile', { bio: '  Jogo **Valorant**\r\n\n\n\nde SP  \u0007 ' });
  assert.ok(saved.ok, saved.error);
  assert.equal(saved.bio, 'Jogo **Valorant**\n\nde SP');
  await wait();
  assert.equal(bioOf(beto, ana.accountId), 'Jogo **Valorant**\n\nde SP');

  // Trocar só a cor não mexe no Sobre mim.
  await emit(ana, 'profile', { color: '#23a55a' });
  await wait();
  assert.equal(bioOf(beto, ana.accountId), 'Jogo **Valorant**\n\nde SP');

  const long = await emit(ana, 'profile', { bio: 'x'.repeat(191) });
  assert.match(long.error, /190/);
  const emoji = await emit(ana, 'profile', { bio: '🎮'.repeat(190) });
  assert.ok(emoji.ok, 'emoji conta como um caractere');
  const wrong = await emit(ana, 'profile', { bio: 42 });
  assert.match(wrong.error, /inválido/);

  await emit(ana, 'profile', { bio: '' });
  await wait();
  assert.equal(bioOf(beto, ana.accountId), null);
});
