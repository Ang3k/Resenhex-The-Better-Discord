const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { io } = require('socket.io-client');
const { PNG } = require('pngjs');
const { decodeProfileBackground } = require('../avatar');

const wait = (ms = 100) => new Promise((r) => setTimeout(r, ms));
const TINY_GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
const firstFrame = Buffer.from(TINY_GIF.subarray(19, -1)); firstFrame.writeUInt16LE(50, 4);
const secondFrame = Buffer.from(firstFrame); secondFrame[secondFrame.length - 2] = 0x4c;
const ANIMATED_GIF = Buffer.concat([TINY_GIF.subarray(0, 19), Buffer.from('21ff0b4e45545343415045322e300301000000', 'hex'), firstFrame, secondFrame, Buffer.from([0x3b])]);
const backgroundPng = (w = 480, h = 600) => PNG.sync.write({ width: w, height: h, data: Buffer.alloc(w * h * 4, 70) });

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

const profileOf = (viewer, id) => viewer.last.members.find((m) => m.id === id);
const send = (base, method, token, body, crop) => fetch(base + '/profile/background', {
  method, body, headers: { ...(token ? { 'x-token': token } : {}), ...(crop ? { 'x-background-crop': JSON.stringify(crop) } : {}) },
});

test('background decoder: cropped 4:5 PNG is re-encoded, GIF is kept byte for byte, anything else is refused', () => {
  const png = decodeProfileBackground(backgroundPng());
  assert.equal(png.ext, 'png');
  assert.equal(PNG.sync.read(png.data).width, 480);
  const gif = decodeProfileBackground(ANIMATED_GIF);
  assert.equal(gif.ext, 'gif');
  assert.ok(gif.data.equals(ANIMATED_GIF));
  assert.throws(() => decodeProfileBackground(Buffer.from('<html><script>alert(1)</script></html>')), /Fundo inválido/);
  assert.throws(() => decodeProfileBackground(backgroundPng(960, 1200)), /Fundo inválido/);
  assert.throws(() => decodeProfileBackground(Buffer.concat([TINY_GIF, Buffer.from('<script>')])), /Fundo inválido/);
});

test('background: upload a PNG or GIF, everyone sees it, replacing and removing cleans up the file', async (t) => {
  const { base, connect, dir } = await startServer(t);
  const ana = await connect('Ana');
  const beto = await connect('Beto');
  assert.equal(profileOf(beto, ana.accountId).backgroundUrl, null);

  assert.equal((await send(base, 'POST', '', backgroundPng())).status, 401);
  assert.equal((await send(base, 'DELETE', 'token-falso')).status, 401);

  const png = await (await send(base, 'POST', ana.token, backgroundPng(), { x: 0.1, y: 0.1, zoom: 2 })).json();
  assert.match(png.backgroundUrl, /^\/avatars\/[a-f0-9]{64}\.png$/);
  assert.equal(png.backgroundCrop, null); // PNG chega recortado: não guarda enquadramento
  await wait();
  assert.equal(profileOf(beto, ana.accountId).backgroundUrl, png.backgroundUrl);
  assert.equal((await fetch(base + png.backgroundUrl)).headers.get('content-type'), 'image/png');

  const gif = await (await send(base, 'POST', ana.token, ANIMATED_GIF, { x: 0.2, y: 0.8, zoom: 1.5 })).json();
  assert.match(gif.backgroundUrl, /^\/avatars\/[a-f0-9]{64}\.gif$/);
  const servedGif = await fetch(base + gif.backgroundUrl);
  assert.equal(servedGif.headers.get('content-type'), 'image/gif');
  assert.ok(Buffer.from(await servedGif.arrayBuffer()).equals(ANIMATED_GIF));
  await wait();
  assert.deepEqual(profileOf(beto, ana.accountId).backgroundCrop, { x: 0.2, y: 0.8, zoom: 1.5 });
  assert.equal((await fetch(base + png.backgroundUrl)).status, 404);
  const avatarDir = path.join(dir, 'uploads', 'avatars');
  assert.deepEqual(fs.readdirSync(avatarDir), [path.basename(gif.backgroundUrl)]);

  assert.equal((await send(base, 'DELETE', ana.token)).status, 200);
  await wait();
  assert.equal(profileOf(beto, ana.accountId).backgroundUrl, null);
  assert.equal(profileOf(beto, ana.accountId).backgroundCrop, null);
  assert.deepEqual(fs.readdirSync(avatarDir), []);
});

test('background: bad framing, invalid files and oversized uploads change nothing', async (t) => {
  const { base, connect } = await startServer(t);
  const ana = await connect('Ana');
  assert.equal((await send(base, 'POST', ana.token, TINY_GIF, { x: 2, y: 0.5, zoom: 1 })).status, 400);
  const html = await send(base, 'POST', ana.token, '<html></html>');
  assert.equal(html.status, 400);
  assert.match((await html.json()).error, /Fundo inválido/);
  const big = await send(base, 'POST', ana.token, Buffer.alloc(6 * 1024 * 1024, 1));
  assert.equal(big.status, 413);
  await wait();
  assert.equal(profileOf(ana, ana.accountId).backgroundUrl, null);
});

test('background: the same GIF as banner and background is one file, kept until neither uses it', async (t) => {
  const { base, connect } = await startServer(t);
  const ana = await connect('Ana');
  const bg = await (await send(base, 'POST', ana.token, TINY_GIF)).json();
  const banner = await (await fetch(base + '/profile/banner', { method: 'POST', headers: { 'x-token': ana.token }, body: TINY_GIF })).json();
  assert.equal(bg.backgroundUrl, banner.bannerUrl);
  await send(base, 'DELETE', ana.token);
  assert.equal((await fetch(base + banner.bannerUrl)).status, 200);
  await fetch(base + '/profile/banner', { method: 'DELETE', headers: { 'x-token': ana.token } });
  assert.equal((await fetch(base + banner.bannerUrl)).status, 404);
});
