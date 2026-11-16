// Miniatura das fotos do chat: feita no aparelho de quem envia, conferida pelo cabeçalho, mostrada no chat e
// apagada junto com a original.
const test = require('node:test');
const assert = require('node:assert/strict');
const { applyPatch } = require('../public/state-patch');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { io } = require('socket.io-client');
const { imageSize } = require('../server/image-size');

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
const upload = async (base, socket, name, body) => (await fetch(base + '/upload', { method: 'POST', headers: { 'x-token': socket.token, 'x-filename': name, 'content-type': 'application/octet-stream' }, body })).json();
const postMini = (base, socket, id, size, body) => fetch(`${base}/upload/${id}/mini`, { method: 'POST', headers: { 'x-token': socket.token, 'x-image-size': size, 'content-type': 'application/octet-stream' }, body });

// Cabeçalhos mínimos (o servidor não decodifica a imagem, só lê o tamanho).
function webp(w, h) {
  const b = Buffer.alloc(40);
  b.write('RIFF', 0); b.writeUInt32LE(32, 4); b.write('WEBP', 8); b.write('VP8L', 12); b.writeUInt32LE(20, 16);
  b[20] = 0x2f; b.writeUInt32LE((((w - 1) & 0x3fff) | (((h - 1) & 0x3fff) << 14)) >>> 0, 21);
  return b;
}
function jpeg(w, h) {
  return Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc0, 0, 11, 8, h >> 8, h & 255, w >> 8, w & 255, 3, 0, 0, 0xff, 0xd9]);
}

test('imageSize lê WebP e JPEG pelo cabeçalho e recusa WebP animado', () => {
  assert.deepEqual(imageSize(webp(1600, 900)), { type: 'webp', w: 1600, h: 900 });
  assert.deepEqual(imageSize(jpeg(900, 1600)), { type: 'jpeg', w: 900, h: 1600 });
  const animated = Buffer.alloc(40); animated.write('RIFF', 0); animated.write('WEBP', 8); animated.write('VP8X', 12); animated[20] = 0x02;
  assert.equal(imageSize(animated), null);
  assert.equal(imageSize(Buffer.from('GIF89a......')), null);
});

test('foto com miniatura: o chat recebe a miniatura, a original continua, e as duas somem juntas', async (t) => {
  const { base, connect, dir } = await startServer(t);
  const ana = await connect('Ana');
  const bia = await connect('Bia');
  const channel = ana.last.channels.find((c) => c.type === 'text').id;

  const photo = await upload(base, ana, 'praia.jpg', Buffer.alloc(4096, 7));
  assert.equal(photo.type, 'image/jpeg');
  // Recusas: de outra pessoa, formato diferente, maior que a original, lado menor grande demais, não é imagem.
  assert.equal((await postMini(base, bia, photo.id, '4000x2250', webp(1600, 900))).status, 404);
  assert.equal((await postMini(base, ana, photo.id, '4000x3000', webp(1600, 900))).status, 400);
  assert.equal((await postMini(base, ana, photo.id, '1000x562', webp(1600, 900))).status, 400);
  assert.equal((await postMini(base, ana, photo.id, '8000x4500', webp(2400, 1350))).status, 400);
  assert.equal((await postMini(base, ana, photo.id, '4000x2250', Buffer.from('nada'))).status, 400);
  const ok = await postMini(base, ana, photo.id, '4000x2250', webp(1600, 900));
  assert.equal(ok.status, 200);
  const { mini } = await ok.json();
  assert.equal(mini, `/uploads/${photo.id}-mini.webp`);
  assert.equal((await postMini(base, ana, photo.id, '4000x2250', webp(1600, 900))).status, 404, 'só uma miniatura por foto');

  const got = await fetch(base + mini);
  assert.equal(got.status, 200);
  assert.equal(got.headers.get('content-type'), 'image/webp');
  assert.equal((await fetch(base + `/uploads/${photo.id}-mini.jpg`)).status, 404);
  assert.equal((await fetch(base + photo.url)).status, 200, 'a original continua servida');

  const sent = await emit(ana, 'chat:send', { channel, text: '', attachments: [photo.id] });
  assert.ok(!sent?.error, sent?.error);
  const { messages } = await emit(bia, 'chat:history', { channel });
  const att = messages.at(-1).attachments[0];
  assert.equal(att.url, photo.url);
  assert.deepEqual({ w: att.w, h: att.h, mini: att.mini }, { w: 4000, h: 2250, mini: { url: mini, w: 1600, h: 900 } });
  assert.equal((await postMini(base, ana, photo.id, '4000x2250', webp(1600, 900))).status, 404, 'depois de enviada, não muda');

  // Sem miniatura (foto pequena, GIF, foto de antes): o anexo fica como sempre foi.
  const small = await upload(base, ana, 'icone.png', Buffer.alloc(512, 1));
  await emit(ana, 'chat:send', { channel, text: '', attachments: [small.id] });
  const plain = (await emit(ana, 'chat:history', { channel })).messages.at(-1).attachments[0];
  assert.deepEqual(Object.keys(plain).sort(), ['id', 'name', 'size', 'type', 'url']);

  const deleted = await emit(ana, 'chat:delete', { channel, id: messages.at(-1).id });
  assert.ok(!deleted?.error, deleted?.error);
  await wait(200);
  const files = fs.readdirSync(path.join(dir, 'uploads'));
  assert.ok(!files.some((f) => f.startsWith(photo.id)), 'a original e a miniatura foram apagadas');
  assert.equal((await fetch(base + mini)).status, 404);
});
