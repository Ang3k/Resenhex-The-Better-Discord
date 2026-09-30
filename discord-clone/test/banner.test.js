const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { io } = require('socket.io-client');
const { PNG } = require('pngjs');

const wait = (ms = 100) => new Promise((r) => setTimeout(r, ms));
const TINY_GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
const bannerPng = () => PNG.sync.write({ width: 600, height: 240, data: Buffer.alloc(600 * 240 * 4, 90) });

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
    socket.on('state', (s) => (socket.last = s));
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

const bannerOf = (viewer, id) => viewer.last.members.find((m) => m.id === id).bannerUrl;
const send = (base, method, token, body) => fetch(base + '/profile/banner', { method, headers: token ? { 'x-token': token } : {}, body });

test('banner: upload a PNG or GIF, everyone sees it, replacing and removing cleans up the file', async (t) => {
  const { base, connect, dir } = await startServer(t);
  const ana = await connect('Ana');
  const beto = await connect('Beto');
  assert.equal(bannerOf(beto, ana.accountId), null);

  // Sem login não dá para trocar o banner de ninguém.
  assert.equal((await send(base, 'POST', '', bannerPng())).status, 401);
  assert.equal((await send(base, 'DELETE', 'token-falso')).status, 401);

  const png = await (await send(base, 'POST', ana.token, bannerPng())).json();
  assert.match(png.bannerUrl, /^\/avatars\/[a-f0-9]{64}\.png$/);
  await wait();
  assert.equal(bannerOf(beto, ana.accountId), png.bannerUrl);
  const served = await fetch(base + png.bannerUrl);
  assert.equal(served.status, 200);
  assert.equal(served.headers.get('content-type'), 'image/png');
  assert.equal(served.headers.get('x-content-type-options'), 'nosniff');

  // Trocar por um GIF: guarda os bytes originais e apaga o PNG antigo.
  const gif = await (await send(base, 'POST', ana.token, TINY_GIF)).json();
  assert.match(gif.bannerUrl, /^\/avatars\/[a-f0-9]{64}\.gif$/);
  const gifResponse = await fetch(base + gif.bannerUrl);
  assert.equal(gifResponse.headers.get('content-type'), 'image/gif');
  assert.ok(Buffer.from(await gifResponse.arrayBuffer()).equals(TINY_GIF));
  assert.equal((await fetch(base + png.bannerUrl)).status, 404);
  const avatarDir = path.join(dir, 'uploads', 'avatars');
  assert.deepEqual(fs.readdirSync(avatarDir), [path.basename(gif.bannerUrl)]);

  assert.equal((await send(base, 'DELETE', ana.token)).status, 200);
  await wait();
  assert.equal(bannerOf(beto, ana.accountId), null);
  assert.equal((await fetch(base + gif.bannerUrl)).status, 404);
  assert.deepEqual(fs.readdirSync(avatarDir), []);
});

test('banner: invalid files and oversized uploads are refused without changing the profile', async (t) => {
  const { base, connect } = await startServer(t);
  const ana = await connect('Ana');

  const html = await send(base, 'POST', ana.token, '<html><script>alert(1)</script></html>');
  assert.equal(html.status, 400);
  assert.match((await html.json()).error, /Banner inválido/);
  const big = await send(base, 'POST', ana.token, Buffer.alloc(6 * 1024 * 1024, 1));
  assert.equal(big.status, 413);
  assert.match((await big.json()).error, /até 5 MB/);
  await wait();
  assert.equal(bannerOf(ana, ana.accountId), null);
});

test('banner: two people with the same image share one file, which stays until both remove it', async (t) => {
  const { base, connect } = await startServer(t);
  const ana = await connect('Ana');
  const beto = await connect('Beto');
  const a = await (await send(base, 'POST', ana.token, TINY_GIF)).json();
  const b = await (await send(base, 'POST', beto.token, TINY_GIF)).json();
  assert.equal(a.bannerUrl, b.bannerUrl);
  await send(base, 'DELETE', ana.token);
  assert.equal((await fetch(base + a.bannerUrl)).status, 200);
  await send(base, 'DELETE', beto.token);
  assert.equal((await fetch(base + a.bannerUrl)).status, 404);
});
