const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { io } = require('socket.io-client');

// Sobe um servidor de verdade numa porta livre com dados temporários.
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
    await exited; // só apaga a pasta depois que o servidor terminou de gravar
    fs.rmSync(dir, { recursive: true, force: true });
  });
  return async (name) => {
    const socket = io('http://127.0.0.1:' + port, { forceNew: true, transports: ['websocket'] });
    clients.push(socket);
    socket.on('state', (s) => (socket.last = s));
    socket.call = (event, payload) => new Promise((resolve) => socket.emit(event, payload, resolve));
    const res = await socket.call('auth', { mode: 'register', name, password: '1234', confirmPassword: '1234' });
    assert.ok(!res.error, res.error);
    await new Promise((r) => setTimeout(r, 100));
    if (!socket.last.serverId) {
      const invite = await clients[0].call('server:invite');
      assert.ok(!(await socket.call('server:join', { code: invite.code })).error);
    }
    return socket;
  };
}

test('only administrators can rename the server, and everyone sees the new name', async (t) => {
  const connect = await startServer(t);
  const owner = await connect('Dono');
  const member = await connect('Ana');
  assert.equal(owner.last.serverName, 'Resenha');

  assert.match((await member.call('server:update', { name: 'Invadido' })).error, /administradores/);
  assert.match((await owner.call('server:update', { name: ' x ' })).error, /pelo menos 2/);

  assert.ok(!(await owner.call('server:update', { name: '  Resenha   dos Crias  ' })).error);
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(member.last.serverName, 'Resenha dos Crias');
});

test('server icon: only administrators, validated PNG, served while in use and removed after', async (t) => {
  const { PNG } = require('pngjs');
  const connect = await startServer(t);
  const owner = await connect('Dono');
  const member = await connect('Ana');
  const png = 'data:image/png;base64,' + PNG.sync.write({ width: 16, height: 16, data: Buffer.alloc(16 * 16 * 4, 200) }).toString('base64');

  assert.match((await member.call('server:update', { icon: png })).error, /administradores/);
  assert.match((await owner.call('server:update', { icon: 'data:image/svg+xml;base64,PHN2Zz4=' })).error, /inválida/);

  assert.ok(!(await owner.call('server:update', { icon: png })).error);
  await new Promise((r) => setTimeout(r, 100));
  const url = member.last.serverIcon;
  assert.match(url, /^\/avatars\/[a-f0-9]{64}\.png$/);
  assert.equal(member.last.serverName, 'Resenha', 'trocar só o ícone mantém o nome');
  const base = member.io.uri;
  assert.equal((await fetch(base + url)).status, 200);

  assert.ok(!(await owner.call('server:update', { icon: null })).error);
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(member.last.serverIcon, null);
  assert.equal((await fetch(base + url)).status, 404);
});
