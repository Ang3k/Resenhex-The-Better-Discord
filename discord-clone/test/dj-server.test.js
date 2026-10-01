const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { io } = require('socket.io-client');
const wait = (ms = 70) => new Promise((r) => setTimeout(r, ms));
async function eventually(check, timeout = 2000) {
  const end = Date.now() + timeout;
  for (;;) {
    try { return check(); } catch (error) { if (Date.now() > end) throw error; }
    await wait(20);
  }
}

// YouTube de mentira: responde a busca no formato da API interna do site.
function fakeYoutube(t) {
  const queries = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      const { query } = JSON.parse(body || '{}');
      queries.push(query);
      const video = (videoId, title, length) => ({ videoRenderer: { videoId, title: { runs: [{ text: title }] }, ownerText: { runs: [{ text: 'Canal' }] }, lengthText: { simpleText: length } } });
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ contents: [video('ePjtnSPFWK8', 'Evidências', '4:41'), video('B9icum-8rRg', 'Evidências (Ao Vivo)', '5:47')] }));
    });
  });
  t.after(() => server.close());
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ origin: 'http://127.0.0.1:' + server.address().port, queries })));
}

async function fixture(t) {
  const yt = await fakeYoutube(t);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'resenhex-dj-'));
  const port = 40000 + Math.floor(Math.random() * 20000);
  const base = 'http://127.0.0.1:' + port;
  const proc = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), DATA_FILE: path.join(dir, 'data.json'), UPLOAD_DIR: path.join(dir, 'uploads'), YOUTUBE_ORIGIN: yt.origin },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Server startup timeout')), 5000);
    proc.stdout.on('data', (data) => { if (String(data).includes('rodando')) { clearTimeout(timer); resolve(); } });
    proc.once('exit', (code) => { clearTimeout(timer); reject(new Error('Server exited: ' + code)); });
  });
  const clients = [];
  t.after(async () => {
    clients.forEach((s) => s.disconnect());
    const exit = new Promise((r) => proc.once('exit', r)); proc.kill(); await exit;
    fs.rmSync(dir, { recursive: true, force: true });
  });
  async function connect(name) {
    const socket = io(base, { forceNew: true, transports: ['websocket'] }); clients.push(socket);
    socket.on('state', (s) => { socket.last = s; });
    socket.call = (event, value = {}) => new Promise((r) => socket.timeout(3000).emit(event, value, (error, reply) => r(error ? { error: error.message } : reply)));
    socket.auth = await socket.call('auth', { mode: 'register', name, password: '1234', confirmPassword: '1234' });
    assert.ok(!socket.auth.error, socket.auth.error);
    await wait();
    if (!socket.last.serverId) {
      const invite = await clients[0].call('server:invite');
      assert.ok(!(await socket.call('server:join', { code: invite.code })).error);
    }
    socket.search = async (q) => {
      const res = await fetch(base + '/music/search?q=' + encodeURIComponent(q), { headers: { 'x-token': socket.auth.token } });
      return { status: res.status, ...(await res.json()) };
    };
    return socket;
  }
  return { connect, base, yt };
}

test('DJ: buscar, tocar para a sala toda, controlar e respeitar a permissão', async (t) => {
  const { connect, base, yt } = await fixture(t);
  const ana = await connect('Ana');
  const beto = await connect('Beto');
  const sala = ana.last.channels.find((c) => c.type === 'voice');
  const outra = ana.last.channels.filter((c) => c.type === 'voice')[1];

  assert.equal((await fetch(base + '/music/search?q=x')).status, 401);
  const found = await ana.search('  Evidências ');
  assert.equal(found.status, 200);
  assert.deepEqual(found.items.map((i) => i.videoId), ['ePjtnSPFWK8', 'B9icum-8rRg']);
  assert.equal(found.items[0].duration, 281);
  assert.deepEqual(yt.queries, ['evidências']);

  assert.match((await ana.call('music:add', { videoId: 'ePjtnSPFWK8' })).error, /Entre numa sala de voz/);
  assert.ok(!(await ana.call('voice:join', { channel: sala.id })).error);
  assert.ok(!(await beto.call('voice:join', { channel: sala.id })).error);
  assert.match((await ana.call('music:add', { videoId: 'zzzzzzzzzzz' })).error, /Busque a música de novo/);

  assert.deepEqual(await ana.call('music:add', { videoId: 'ePjtnSPFWK8', query: 'evidências' }), { place: 0, title: 'Evidências' });
  const music = await eventually(() => { assert.ok(beto.last.call.music); return beto.last.call.music; });
  assert.equal(music.current.videoId, 'ePjtnSPFWK8');
  assert.equal(music.current.byName, 'Ana');
  assert.equal(music.pausedAt, null);
  assert.ok(Math.abs(music.now - music.startedAt) < 2000);
  assert.deepEqual(beto.last.music, { [sala.id]: { title: 'Evidências', paused: false } }, 'a lista de canais mostra o que toca');
  assert.equal(beto.last.music[outra.id], undefined);

  assert.deepEqual(await beto.call('music:add', { videoId: 'B9icum-8rRg' }), { place: 1, title: 'Evidências (Ao Vivo)' });
  assert.ok(!(await beto.call('music:control', { action: 'pause' })).error);
  await eventually(() => assert.ok(ana.last.call.music.pausedAt >= 0 && ana.last.call.music.pausedAt !== null));
  assert.match(ana.last.call.music.last.text, /Beto pausou/);
  assert.ok(!(await ana.call('music:control', { action: 'resume' })).error);

  // Um clipe bloqueado fora do YouTube troca pela outra versão da mesma busca, quando a sala toda avisa.
  const blocked = ana.last.call.music.current.id;
  await ana.call('music:report', { trackId: blocked, error: 150 });
  await wait(100);
  assert.equal(beto.last.call.music.current.id, blocked, 'só uma das duas pessoas não basta');
  await beto.call('music:report', { trackId: blocked, error: 150 });
  await eventually(() => assert.equal(beto.last.call.music.current.videoId, 'B9icum-8rRg'));
  assert.equal(beto.last.call.music.current.alt, true);
  assert.equal(beto.last.call.music.queue.length, 1);

  // Sem a permissão, não controla nada; o dono continua podendo.
  const everyone = ana.last.roles.find((r) => r.id === 'everyone');
  assert.ok(everyone.perms.includes('MUSIC'));
  assert.ok(!(await ana.call('role', { action: 'update', id: 'everyone', name: everyone.name, color: everyone.color, hoist: false, perms: everyone.perms.filter((p) => p !== 'MUSIC') })).error);
  assert.match((await beto.call('music:control', { action: 'skip' })).error, /permissão para usar o DJ/);
  const alt = beto.last.call.music.current.id;
  assert.ok(!(await ana.call('music:control', { action: 'skip' })).error);
  await eventually(() => assert.notEqual(beto.last.call.music.current.id, alt));
  assert.equal(beto.last.call.music.current.videoId, 'B9icum-8rRg');
  assert.equal(beto.last.call.music.current.byName, 'Beto');
  assert.equal(beto.last.call.music.queue.length, 0);
  assert.match((await ana.call('music:control', { action: 'explodir' })).error, /desconhecido/);

  // Sala vazia: a música fica parada no ponto, esperando a turma voltar.
  await ana.call('voice:leave');
  await beto.call('voice:leave');
  await eventually(() => assert.equal(ana.last.music[sala.id].paused, true));
  assert.ok(!(await beto.call('voice:join', { channel: sala.id })).error);
  await eventually(() => assert.equal(beto.last.call.music.pausedAt, null));
  assert.match((await ana.call('music:control', { action: 'stop' })).error, /Entre numa sala de voz/, 'só controla quem está na sala');
});
