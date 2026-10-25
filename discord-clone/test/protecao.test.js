// Fase 7 do docs/plano-5000-online.md: limites contra abuso e sessões antigas, com o servidor de verdade.
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { io } = require('socket.io-client');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function startServer(t, { env = {}, seed = null } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'resenhex-protecao-'));
  if (seed) fs.writeFileSync(path.join(dir, 'data.json'), JSON.stringify(seed));
  const port = 40000 + Math.floor(Math.random() * 20000);
  const proc = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', DATA_FILE: path.join(dir, 'data.json'), UPLOAD_DIR: path.join(dir, 'uploads'), ACCESS_PASSWORD: '', ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  proc.stdout.on('data', (d) => { output += d; });
  proc.stderr.on('data', (d) => { output += d; });
  await new Promise((resolve, reject) => {
    proc.stdout.on('data', (d) => String(d).includes('rodando') && resolve());
    proc.on('exit', reject);
  });
  const sockets = [];
  t.after(async () => {
    sockets.forEach((s) => s.disconnect());
    const exited = new Promise((resolve) => proc.once('exit', resolve));
    proc.kill();
    await exited;
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const base = 'http://127.0.0.1:' + port;
  const open = (options = {}) => {
    const socket = io(base, { forceNew: true, transports: ['websocket'], reconnection: false, ...options });
    sockets.push(socket);
    socket.call = (event, payload = {}) => new Promise((resolve) => socket.timeout(3000).emit(event, payload, (error, res) => resolve(error ? { error: error.message } : res)));
    return socket;
  };
  const connected = (socket) => new Promise((resolve) => { socket.once('connect', () => resolve(true)); socket.once('connect_error', (error) => resolve(error)); });
  return { base, open, connected, output: () => output };
}

test('one address keeps at most 50 connections open; the computer itself has no limit', async (t) => {
  const app = await startServer(t, { env: { TRUST_PROXY: '1' } });
  const from = (ip) => app.open({ extraHeaders: { 'x-forwarded-for': ip } });
  const first = [];
  for (let i = 0; i < 50; i++) first.push(from('203.0.113.7'));
  assert.ok((await Promise.all(first.map(app.connected))).every((r) => r === true));
  const extra = from('203.0.113.7');
  const refused = await app.connected(extra);
  assert.match(refused.message, /Muitas conexões deste endereço/);
  assert.equal(await app.connected(from('198.51.100.4')), true, 'outro endereço entra');
  // Uma fecha, outra entra.
  first[0].disconnect();
  await wait(200);
  assert.equal(await app.connected(from('203.0.113.7')), true);
  // Sem proxy na frente, o endereço é o próprio computador: sem limite (simulador, testes).
  const local = [];
  for (let i = 0; i < 55; i++) local.push(app.open());
  assert.ok((await Promise.all(local.map(app.connected))).every((r) => r === true));
});

test('a connection that floods the server loses the extra packets and then the connection', async (t) => {
  const app = await startServer(t);
  const socket = app.open();
  assert.equal(await app.connected(socket), true);
  assert.ok(!(await socket.call('auth', { mode: 'register', name: 'Ana', password: '1234', confirmPassword: '1234' })).error);
  let answered = 0;
  const gone = new Promise((resolve) => socket.on('disconnect', resolve));
  for (let i = 0; i < 450; i++) socket.emit('server:invite', {}, () => { answered++; });
  assert.equal(await gone, 'io server disconnect');
  // Até 300 respondidos (o balde); as respostas ainda na fila somem junto com a conexão derrubada.
  assert.ok(answered > 100 && answered <= 320, `respondidos: ${answered}`);
  assert.match(app.output(), /\[limites\] pacotes demais de 127\.0\.0\.1: conexão derrubada/);
  // Quem usa normalmente não chega perto.
  const calm = app.open();
  await app.connected(calm);
  assert.ok(!(await calm.call('auth', { mode: 'register', name: 'Beto', password: '1234', confirmPassword: '1234' })).error);
  for (let i = 0; i < 40; i++) assert.doesNotMatch((await calm.call('server:invite')).error || '', /timed out/, 'todo pedido tem resposta');
  assert.equal(calm.connected, true);
});

test('uploads stop at the daily quota of each account, even sent at the same time, and the server checks the session before receiving the file', async (t) => {
  const app = await startServer(t, { env: { UPLOAD_DAY_MB: '1' } });
  const socket = app.open();
  await app.connected(socket);
  const auth = await socket.call('auth', { mode: 'register', name: 'Ana', password: '1234', confirmPassword: '1234' });
  const send = (token, bytes, channel = '') => fetch(app.base + '/upload', { method: 'POST', headers: { 'x-token': token, 'x-filename': 'a.bin', 'x-channel-id': channel, 'content-type': 'application/octet-stream' }, body: Buffer.alloc(bytes, 1) });
  assert.equal((await send('sem-sessao', 600_000)).status, 401);
  // Recusado depois de entrar (canal que não existe): a reserva volta para a cota.
  assert.equal((await send(auth.token, 600_000, 'nao-existe')).status, 403);
  // Dois ao mesmo tempo: o primeiro reserva a cota na entrada, e o outro já não cabe.
  const both = await Promise.all([send(auth.token, 600_000), send(auth.token, 600_000)]);
  assert.deepEqual(both.map((r) => r.status).sort(), [200, 429]);
  assert.match((await both.find((r) => r.status === 429).json()).error, /muitos arquivos hoje/);
  assert.equal((await send(auth.token, 300_000)).status, 200, 'o que cabe no resto da cota ainda entra');
});

test('sessions unused for 90 days are deleted; the others keep working', async (t) => {
  const id = 'c'.repeat(16);
  const today = Math.floor(Date.now() / 86_400_000);
  const seed = { serverName: 'Turma', ownerId: id, accounts: { [id]: { id, name: 'Dono', roles: [] } },
    sessions: { velha: id, recente: id, semData: id }, sessionUse: { velha: today - 91, recente: today - 89 },
    channels: [{ id: 'geral', type: 'text', name: 'geral', allowedRoles: [] }], roles: [{ id: 'everyone', name: '@everyone', perms: [] }], messages: { geral: [] } };
  const app = await startServer(t, { seed });
  await wait(6000); // a primeira limpeza roda 5 s depois de subir
  const login = async (token) => { const s = app.open(); await app.connected(s); return s.call('auth', { token }); };
  assert.match((await login('velha')).error, /Sessão expirada/);
  assert.ok(!(await login('recente')).error);
  assert.ok(!(await login('semData')).error, 'sessão de antes da limpeza conta a partir de hoje');
  assert.match(app.output(), /\[sessões\] 1 sem uso há 90 dias apagadas/);
});
