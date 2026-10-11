const test = require('node:test');
const assert = require('node:assert/strict');
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
  const auth = async (payload) => {
    const socket = io(`http://127.0.0.1:${port}`, { forceNew: true, transports: ['websocket'] });
    clients.push(socket);
    const res = await new Promise((resolve) => socket.emit('auth', payload, resolve));
    socket.res = res;
    return socket;
  };
  return { auth };
}

const emit = (socket, event, payload) => new Promise((resolve) => socket.emit(event, payload, resolve));

test('conta: troca a senha, mantém o nome e encerra as outras sessões', async (t) => {
  const { auth } = await startServer(t);
  const ana = await auth({ mode: 'register', name: 'Ana', password: '1234', confirmPassword: '1234' });
  assert.ok(!ana.res.error, ana.res.error);
  assert.equal(ana.res.name, 'Ana');
  assert.ok(ana.res.since > 0);
  const celular = await auth({ mode: 'login', name: 'Ana', password: '1234' });
  assert.ok(!celular.res.error, celular.res.error);
  let ended = null;
  celular.on('session:ended', (reason) => { ended = reason; });

  assert.match((await emit(ana, 'account:password', { current: '1234', next: 'ab', confirm: 'ab' })).error, /4 caracteres/);
  assert.match((await emit(ana, 'account:password', { current: '1234', next: 'nova1', confirm: 'nova2' })).error, /não coincidem/);
  assert.match((await emit(ana, 'account:password', { current: 'errada', next: 'nova1', confirm: 'nova1' })).error, /atual está incorreta/);
  assert.deepEqual(await emit(ana, 'account:password', { current: '1234', next: 'nova1', confirm: 'nova1' }), { ok: true });
  await wait(200);

  // O outro aparelho foi desconectado e o token dele não vale mais.
  assert.match(ended, /senha foi trocada/);
  assert.equal(celular.connected, false);
  assert.match((await auth({ token: celular.res.token })).res.error, /Sessão expirada/);
  // Esta sessão continua valendo.
  assert.ok(!(await auth({ token: ana.res.token })).res.error);

  // Senha antiga não entra mais; a nova entra com o mesmo nome.
  assert.match((await auth({ mode: 'login', name: 'Ana', password: '1234' })).res.error, /incorretos/);
  const nova = await auth({ mode: 'login', name: 'Ana', password: 'nova1' });
  assert.ok(!nova.res.error, nova.res.error);
  assert.equal(nova.res.accountId, ana.res.accountId);
});
