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
    socket.auth = res;
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

test('nicknames belong to a membership, remain independent between servers and preserve login and DMs', async (t) => {
  const connect = await startServer(t);
  const owner = await connect('Dono'), member = await connect('Ana');
  const first = member.last.serverId, id = member.auth.accountId;
  const own = () => member.last.members.find((m) => m.id === id);
  assert.equal(own().name, 'Ana');
  assert.equal(own().nickname, null);
  assert.ok((await member.call('member:nickname', { nickname: 'x'.repeat(33) })).error);
  assert.ok((await member.call('member:nickname', { nickname: { name: 'invalid' } })).error);
  assert.ok((await member.call('member:nickname', { nickname: 'bad\u0000name' })).error);
  assert.ok(!(await member.call('member:nickname', { serverId: first, nickname: '  Ana   da turma  ', target: owner.auth.accountId })).error);
  assert.equal(own().name, 'Ana da turma');
  assert.equal(own().username, 'Ana');
  assert.equal(owner.last.members.find((m) => m.id === id).name, 'Ana da turma');
  assert.equal(owner.last.members.find((m) => m.id === owner.auth.accountId).name, 'Dono');
  assert.equal(member.last.people.find((m) => m.id === id).name, 'Ana');
  const second = await member.call('server:create', { name: 'Outra turma' });
  assert.equal(own().name, 'Ana');
  assert.ok((await member.call('member:nickname', { serverId: first, nickname: 'Servidor errado' })).error);
  assert.ok(!(await member.call('member:nickname', { serverId: second.id, nickname: 'Ana de outro servidor' })).error);
  await member.call('server:select', { id: first });
  assert.equal(own().name, 'Ana da turma');
  await member.call('friend:request', { id: owner.auth.accountId });
  await owner.call('friend:accept', { id });
  const dm = await member.call('dm:open', { userId: owner.auth.accountId });
  assert.ok(!dm.error, dm.error);
  await member.call('chat:send', { channel: dm.id, text: 'Oi' });
  const history = await owner.call('chat:history', { channel: dm.id });
  assert.equal(history.authors.find((a) => a.id === id).name, 'Ana');
  const login = io(member.io.uri, { forceNew: true, transports: ['websocket'] });
  t.after(() => login.disconnect());
  const auth = await new Promise((r) => login.emit('auth', { mode: 'login', name: 'Ana', password: '1234' }, r));
  assert.equal(auth.accountId, id);
  await member.call('member:nickname', { nickname: '' });
  assert.equal(own().name, 'Ana');
  await member.call('server:select', { id: second.id });
  assert.equal(own().name, 'Ana de outro servidor');
});
