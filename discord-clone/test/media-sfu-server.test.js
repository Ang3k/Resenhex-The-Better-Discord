const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { io } = require('socket.io-client');
const { TokenVerifier } = require('livekit-server-sdk');

test('authenticated voice membership controls SFU access and old clients fail explicitly', { timeout: 15000 }, async () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'resenhex-sfu-test-'));
  const api = http.createServer((req, res) => { req.resume(); res.setHeader('Content-Type', 'application/json'); res.end('{}'); });
  api.listen(0, '127.0.0.1'); await once(api, 'listening');
  const port = 42000 + Math.floor(Math.random() * 10000), url = `http://127.0.0.1:${port}`;
  const key = 'integration-key', secret = 'integration-secret-123456789012345678901234';
  const child = spawn(process.execPath, ['server.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', DATA_FILE: path.join(temporary, 'data.json'), UPLOAD_DIR: path.join(temporary, 'uploads'), ACCESS_PASSWORD: '', ACCESS_PASSWORD_B64: '', LIVEKIT_URL: 'wss://media.example.test', LIVEKIT_INTERNAL_URL: `http://127.0.0.1:${api.address().port}`, LIVEKIT_API_KEY: key, LIVEKIT_API_SECRET: secret }, stdio: 'ignore' });
  const socket = io(url, { autoConnect: false, reconnection: false });
  const emit = (event, payload = {}) => socket.timeout(3000).emitWithAck(event, payload);
  try {
    for (let i = 0; i < 100; i++) { try { if ((await fetch(url + '/config')).ok) break; } catch {} await new Promise((r) => setTimeout(r, 30)); }
    socket.on('state', (state) => { socket.snapshot = state; });
    socket.connect(); await once(socket, 'connect');
    assert.match((await emit('voice:media')).error, /Não autenticado/);
    const auth = await emit('auth', { mode: 'register', name: 'SFU Test', password: 'test-only-2026', confirmPassword: 'test-only-2026' });
    assert.ok(auth.accountId);
    assert.match((await emit('voice:media')).error, /Entre em uma chamada/);
    const rooms = socket.snapshot.channels.filter((c) => c.type === 'voice');
    assert.match((await emit('voice:join', { channel: rooms[0].id })).error, /Recarregue/);
    assert.ok(!(await emit('voice:join', { channel: rooms[0].id, mediaVersion: 1 })).error);
    const first = await emit('voice:media', { room: 'guessed-room', identity: 'someone-else' });
    const verifier = new TokenVerifier(key, secret), claims = await verifier.verify(first.token);
    assert.equal(first.transport, 'sfu'); assert.equal(claims.sub, socket.id);
    assert.notEqual(claims.video.room, 'guessed-room');
    assert.ok(!(await emit('voice:join', { channel: rooms[1].id, mediaVersion: 1 })).error);
    const second = await emit('voice:media');
    assert.notEqual(first.room, second.room);
    assert.equal((await fetch(url + '/vendor/livekit-client.js')).status, 200);
    assert.equal((await fetch(url + '/api/media/webhook', { method: 'POST', headers: { 'Content-Type': 'application/webhook+json' }, body: '{}' })).status, 401);
    await emit('voice:leave');
    assert.match((await emit('voice:media')).error, /Entre em uma chamada/);
  } finally {
    socket.close(); child.kill(); await once(child, 'exit'); api.close();
    assert.equal(path.dirname(path.resolve(temporary)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(temporary).startsWith('resenhex-sfu-test-'));
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});
