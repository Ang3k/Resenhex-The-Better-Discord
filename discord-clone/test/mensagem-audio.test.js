// Mensagem de áudio: um anexo de áudio com a duração e a onda que o player desenha no chat.
const test = require('node:test');
const assert = require('node:assert/strict');
const { applyPatch } = require('../public/state-patch');
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
  const base = `http://127.0.0.1:${port}`;
  const connect = async (name) => {
    const socket = io(base, { forceNew: true, transports: ['websocket'] });
    clients.push(socket);
    socket.on('state', (s) => (socket.last = s)); socket.on('state:patch', (p) => applyPatch(socket.last, p));
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

const emit = (socket, event, payload) => new Promise((resolve) => socket.emit(event, payload, resolve));
async function upload(base, socket, name, body) {
  const res = await fetch(base + '/upload', { method: 'POST', headers: { 'x-token': socket.token, 'x-filename': name, 'content-type': 'application/octet-stream' }, body });
  assert.equal(res.status, 200);
  return res.json();
}

test('mensagem de áudio: vai com a onda, recusa o que não é áudio e não pode ser editada', async (t) => {
  const { base, connect } = await startServer(t);
  const ana = await connect('Ana');
  const channel = ana.last.channels.find((c) => c.type === 'text').id;
  const waveform = Array.from({ length: 48 }, (_, i) => (i * 7) % 101);

  const audio = await upload(base, ana, 'mensagem-de-voz.weba', Buffer.alloc(2048, 1));
  assert.equal(audio.type, 'audio/webm');
  const bad = async (voice, extra = {}) => (await emit(ana, 'chat:send', { channel, text: '', attachments: [audio.id], voice, ...extra })).error;
  assert.match(await bad({ duration: 0.2, waveform }), /áudio inválida/);
  assert.match(await bad({ duration: 400, waveform }), /áudio inválida/);
  assert.match(await bad({ duration: 3, waveform: [] }), /áudio inválida/);
  assert.match(await bad({ duration: 3, waveform: [50, 101] }), /áudio inválida/);
  assert.match(await bad({ duration: 3, waveform: Array(65).fill(1) }), /áudio inválida/);
  assert.match(await bad({ duration: 3, waveform }, { text: 'oi' }), /áudio inválida/);
  const text = await upload(base, ana, 'nota.txt', 'não é áudio');
  assert.match((await emit(ana, 'chat:send', { channel, text: '', attachments: [text.id], voice: { duration: 3, waveform } })).error, /áudio inválida/);

  const sent = await emit(ana, 'chat:send', { channel, text: '', attachments: [audio.id], voice: { duration: 12.345, waveform } });
  assert.ok(!sent?.error, sent?.error);
  const { messages } = await emit(ana, 'chat:history', { channel });
  const msg = messages.at(-1);
  assert.deepEqual(msg.voice, { duration: 12.3, waveform });
  assert.equal(msg.attachments.length, 1);
  assert.equal(msg.attachments[0].type, 'audio/webm');

  assert.match((await emit(ana, 'chat:edit', { channel, id: msg.id, text: 'virou texto' })).error, /mensagem de áudio/);
});
