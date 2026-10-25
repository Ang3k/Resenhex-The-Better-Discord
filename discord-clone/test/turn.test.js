const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { io } = require('socket.io-client');
const { applyPatch } = require('../public/state-patch');
const { createTurn, VALID_S, STEP_S } = require('../server/turn');

const SECRET = 'ab'.repeat(32);
const URLS = 'turn:t.example:3478?transport=udp,turn:t.example:3478?transport=tcp';
const hmac = (user) => crypto.createHmac('sha1', SECRET).update(user).digest('base64');

test('each account gets its own relay password, valid for 24 to 30 hours (coturn use-auth-secret)', () => {
  const now = Date.UTC(2026, 9, 24, 13, 7);
  const [stun, relay] = createTurn({ urls: URLS, secret: SECRET, now: () => now }).iceServers('conta1');
  assert.equal(stun.urls, 'stun:stun.l.google.com:19302');
  assert.deepEqual(relay.urls, ['turn:t.example:3478?transport=udp', 'turn:t.example:3478?transport=tcp']);
  const [expires, account] = relay.username.split(':');
  assert.equal(account, 'conta1');
  const left = Number(expires) - now / 1000;
  assert.ok(left >= VALID_S && left < VALID_S + STEP_S, `vence em ${left / 3600} h`);
  assert.equal(Number(expires) % STEP_S, 0, 'arredondado: a mesma senha por 6 h');
  assert.equal(relay.credential, hmac(relay.username));
  // Outra conta, outra senha; o segredo nunca vai junto.
  const other = createTurn({ urls: URLS, secret: SECRET, now: () => now }).iceServers('conta2')[1];
  assert.notEqual(other.credential, relay.credential);
  assert.ok(!JSON.stringify([relay, other]).includes(SECRET));
});

test('without a relay address, or above the network pace of the month, only STUN', () => {
  assert.equal(createTurn({ secret: SECRET }).iceServers('conta1').length, 1);
  let allowed = false;
  const turn = createTurn({ urls: URLS, secret: SECRET, allowed: () => allowed });
  assert.equal(turn.iceServers('conta1').length, 1);
  allowed = true;
  assert.equal(turn.iceServers('conta1').length, 2);
  // Instalação antiga, com senha fixa e sem segredo: continua funcionando até o instalador novo rodar.
  assert.deepEqual(createTurn({ urls: URLS, username: 'resenhex', credential: 'fixa' }).iceServers('conta1')[1].username, 'resenhex');
});

test('the server hands relay passwords at login, on each call and when the app asks before they expire', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'resenhex-turn-'));
  const port = 40000 + Math.floor(Math.random() * 20000);
  const proc = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', DATA_FILE: path.join(dir, 'data.json'), UPLOAD_DIR: path.join(dir, 'uploads'), ACCESS_PASSWORD: '', TURN_URL: URLS, TURN_SECRET: SECRET, TURN_USERNAME: '', TURN_CREDENTIAL: '' },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  await new Promise((resolve, reject) => {
    proc.stdout.on('data', (d) => String(d).includes('rodando') && resolve());
    proc.on('exit', reject);
  });
  const socket = io('http://127.0.0.1:' + port, { forceNew: true, transports: ['websocket'] });
  t.after(async () => {
    socket.disconnect();
    const exited = new Promise((resolve) => proc.once('exit', resolve));
    proc.kill();
    await exited;
    fs.rmSync(dir, { recursive: true, force: true });
  });
  socket.on('state', (s) => (socket.last = s));
  socket.on('state:patch', (p) => applyPatch(socket.last, p));
  const call = (event, payload) => new Promise((resolve) => socket.emit(event, payload, resolve));
  const relayOf = (servers, account) => {
    const relay = servers.find((server) => server.username);
    assert.match(relay.username, new RegExp(`^\\d+:${account}$`));
    assert.equal(relay.credential, hmac(relay.username));
    return relay;
  };

  const auth = await call('auth', { mode: 'register', name: 'Ana', password: '1234', confirmPassword: '1234' });
  assert.ok(!auth.error, auth.error);
  relayOf(auth.iceServers, auth.accountId);
  for (let i = 0; i < 50 && !socket.last?.channels; i++) await new Promise((r) => setTimeout(r, 20));
  const room = socket.last.channels.find((c) => c.type === 'voice').id;
  const joined = await call('voice:join', { channel: room });
  assert.ok(!joined.error, joined.error);
  relayOf(joined.iceServers, auth.accountId);
  relayOf((await call('ice:servers', {})).iceServers, auth.accountId);
  // Pedidos repetidos: no máximo 10 por hora.
  const answers = [];
  for (let i = 0; i < 10; i++) answers.push(await call('ice:servers', {}));
  assert.match(answers.at(-1).error, /Aguarde/);
});
