// Propor Melhorias como mensagem para o dev (o dono do site), com o servidor de verdade.
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { io } = require('socket.io-client');

const wait = (ms = 120) => new Promise((r) => setTimeout(r, ms));

async function startServer(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'resenhex-'));
  const port = 40000 + Math.floor(Math.random() * 20000);
  const proc = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', DATA_FILE: path.join(dir, 'data.json'), UPLOAD_DIR: path.join(dir, 'uploads'), ACCESS_PASSWORD: '', MAIL_DEV: 'console' },
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
  const base = 'http://127.0.0.1:' + port;
  const connect = async (name) => {
    const socket = io(base, { forceNew: true, transports: ['websocket'] });
    clients.push(socket);
    socket.on('social', (s) => (socket.social = s));
    socket.messages = [];
    socket.on('chat:message', (m) => socket.messages.push(m));
    socket.devStatus = [];
    socket.on('dev:status', (d) => socket.devStatus.push(d.online));
    socket.call = (event, payload) => new Promise((resolve) => socket.emit(event, payload, resolve));
    const res = await socket.call('auth', { mode: 'register', name, password: '1234', confirmPassword: '1234' });
    assert.ok(!res.error, res.error);
    socket.id_ = res.accountId;
    socket.token = res.token;
    socket.dev = res.dev;
    await wait();
    return socket;
  };
  const http = async (method, url, token, body) => {
    const response = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', 'x-token': token }, body: body && JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  };
  return { connect, http };
}

test('mensagem pro dev: bolinha, conversa escondida até o dev responder, e os dois conversam sem amizade', async (t) => {
  const { connect, http } = await startServer(t);
  const dev = await connect('Dev'); // a primeira conta é a dona do site
  const bia = await connect('Bia');

  // O dev não vê a opção para si mesmo; os outros veem a bolinha verde com ele online (já na entrada).
  assert.deepEqual(dev.dev, { available: false, online: false });
  assert.deepEqual(bia.dev, { available: true, online: true });
  assert.deepEqual((await http('GET', '/feedback/dev', dev.token)).body, { available: false, online: false });
  assert.deepEqual((await http('GET', '/feedback/dev', bia.token)).body, { available: true, online: true });
  assert.equal((await http('GET', '/feedback/dev', '')).status, 401);
  // Ausente, não perturbe e invisível ficam cinza.
  for (const presence of ['idle', 'dnd', 'invisible']) {
    assert.ok(!(await dev.call('presence', { presence }))?.error);
    assert.equal((await http('GET', '/feedback/dev', bia.token)).body.online, false, presence);
  }
  await dev.call('presence', { presence: 'online' });
  assert.equal((await http('GET', '/feedback/dev', bia.token)).body.online, true);
  // O aviso só sai quando muda de verde para cinza ou o contrário (idle → dnd → invisible não repete).
  await wait();
  assert.deepEqual(bia.devStatus, [false, true]);

  assert.equal((await http('POST', '/feedback', dev.token, { message: 'oi', channel: 'dev' })).status, 400);
  assert.deepEqual(await http('POST', '/feedback', bia.token, { message: '  Botão de modo escuro mais forte  ', channel: 'dev' }), { status: 200, body: { ok: true } });
  await wait();

  // O dev recebe como conversa normal; para a Bia, nada aparece ainda.
  const dmId = dev.social.dms[0]?.id;
  assert.ok(dmId, 'a conversa aparece para o dev');
  assert.equal(dev.social.dms[0].userId, bia.id_);
  assert.equal(dev.messages.at(-1).msg.text, 'Botão de modo escuro mais forte');
  assert.equal(dev.messages.at(-1).msg.suggestion, true);
  assert.deepEqual(bia.social.dms, []);
  assert.equal(bia.messages.length, 0);

  // O dev responde sem serem amigos; aí a conversa aparece para a Bia, que responde também.
  assert.ok(!(await dev.call('chat:send', { channel: dmId, text: 'Valeu! Vou ver isso.' }))?.error);
  await wait();
  assert.equal(bia.social.dms[0]?.id, dmId);
  assert.equal(bia.social.dms[0].suggestion, true);
  assert.equal(bia.messages.at(-1).msg.text, 'Valeu! Vou ver isso.');
  assert.ok(!(await bia.call('chat:send', { channel: dmId, text: 'Boa!' }))?.error);
  await wait();
  assert.equal(dev.messages.at(-1).msg.text, 'Boa!');

  // Bloqueio vale como em qualquer conversa.
  assert.ok(!(await bia.call('friend:block', { id: dev.id_ }))?.error);
  await wait();
  assert.equal((await http('POST', '/feedback', bia.token, { message: 'outra', channel: 'dev' })).status, 502);
});
