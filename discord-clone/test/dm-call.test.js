const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { io } = require('socket.io-client');

const wait = (ms = 80) => new Promise((r) => setTimeout(r, ms));
const RING_MS = 400;

// Servidor de verdade numa porta livre, com o toque da chamada curto para o teste.
async function startServer(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'resenhex-'));
  const port = 40000 + Math.floor(Math.random() * 20000);
  const proc = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', DATA_FILE: path.join(dir, 'data.json'), UPLOAD_DIR: path.join(dir, 'uploads'), ACCESS_PASSWORD: '', DM_RING_MS: String(RING_MS), KLIPY_KEY: 'chave-de-teste' },
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
  // token: abre outra aba com uma conta que já entrou.
  return async (name, token) => {
    const socket = io('http://127.0.0.1:' + port, { forceNew: true, transports: ['websocket'] });
    clients.push(socket);
    socket.on('state', (s) => (socket.last = s));
    socket.messages = [];
    socket.updates = [];
    socket.rings = [];
    socket.ringStops = [];
    socket.signals = [];
    socket.sounds = [];
    socket.on('chat:message', (m) => socket.messages.push(m));
    socket.on('chat:update', (m) => socket.updates.push(m));
    socket.on('dm:ring', (r) => socket.rings.push(r));
    socket.on('dm:ring:stop', (r) => socket.ringStops.push(r));
    socket.on('signal', (s) => socket.signals.push(s));
    socket.on('sound', (s) => socket.sounds.push(s));
    socket.on('notice', (n) => (socket.notice = n));
    socket.on('voice:force-leave', (r) => (socket.forced = r));
    socket.call = (event, payload) => new Promise((resolve) => socket.emit(event, payload, resolve));
    const res = await socket.call('auth', token ? { token } : { mode: 'register', name, password: '1234', confirmPassword: '1234' });
    assert.ok(!res.error, res.error);
    socket.id_ = res.accountId;
    socket.sid_ = res.sid;
    socket.token_ = res.token;
    socket.gifKey_ = res.gifKey;
    await wait(100);
    if (!socket.last.serverId) {
      const invite = await clients[0].call('server:invite');
      assert.ok(!(await socket.call('server:join', { code: invite.code })).error);
    }
    return socket;
  };
}

async function friends(t) {
  const connect = await startServer(t);
  const ana = await connect('Ana');
  const beto = await connect('Beto');
  assert.ok(!(await ana.call('friend:request', { name: 'Beto' })).error);
  assert.ok(!(await beto.call('friend:accept', { id: ana.id_ })).error);
  const { id } = await ana.call('dm:open', { userId: beto.id_ });
  await wait();
  return { connect, ana, beto, dm: id };
}

const callMessage = (socket, dm) => socket.messages.filter((m) => m.channel === dm && m.msg.call).at(-1)?.msg;
const lastUpdate = (socket, dm) => socket.updates.filter((m) => m.channel === dm && m.msg.call).at(-1)?.msg;

test('chamada privada: só entre amigos, toca para o outro e fica fora do estado do servidor', async (t) => {
  const { connect, ana, beto, dm } = await friends(t);
  const carla = await connect('Carla');
  assert.match((await carla.call('voice:join', { dm })).error, /Conversa não encontrada/);

  const joined = await ana.call('voice:join', { dm });
  assert.ok(!joined.error, joined.error);
  assert.deepEqual(joined.peers, []);
  await wait();

  assert.equal(ana.last.call.dm, true);
  assert.equal(ana.last.call.channel.id, dm);
  assert.equal(ana.last.call.channel.name, 'Beto');
  assert.equal(ana.last.call.ringing, true);
  assert.deepEqual(ana.last.call.members.map((m) => m.id).sort(), [ana.id_, beto.id_].sort());
  assert.deepEqual(ana.last.call.voice.map((v) => v.accountId), [ana.id_]);
  assert.equal(ana.last.call.music, null);
  assert.ok(ana.last.call.myPerms.includes('STREAM'));

  assert.deepEqual(beto.rings.map((r) => [r.dm, r.from]), [[dm, ana.id_]]);
  assert.equal(carla.rings.length, 0);
  // Ninguém do servidor vê a chamada privada na lista de voz.
  assert.ok(!beto.last.voice.some((v) => v.channel === dm));
  assert.ok(!carla.last.voice.some((v) => v.channel === dm));

  const msg = callMessage(beto, dm);
  assert.equal(msg.authorId, ana.id_);
  assert.equal(msg.call.endedAt, null);
  assert.deepEqual(msg.call.joined, [ana.id_]);
  assert.equal(carla.messages.length, 0);
  assert.match((await ana.call('chat:edit', { channel: dm, id: msg.id, text: 'mudei' })).error, /chamada/);

  // O DJ não funciona aqui; os efeitos nativos, sim.
  assert.match((await ana.call('music:control', { action: 'stop' })).error, /privad/);
  assert.ok(!(await ana.call('sound:play', { sound: 'grilo' })).error);
});

test('chamada privada: atender para o toque, liga os dois e a mensagem ganha a duração', async (t) => {
  const { ana, beto, dm } = await friends(t);
  await ana.call('voice:join', { dm });
  await wait();
  const accepted = await beto.call('voice:join', { dm });
  assert.ok(!accepted.error, accepted.error);
  assert.deepEqual(accepted.peers, [ana.sid_]);
  await wait();
  assert.deepEqual(beto.ringStops.map((r) => r.dm), [dm]);
  assert.equal(ana.last.call.ringing, false);
  assert.equal(ana.last.call.voice.length, 2);

  beto.emit('signal', { to: ana.sid_, data: { sdp: 'oferta' } });
  await wait();
  assert.deepEqual(ana.signals.map((s) => [s.from, s.data.sdp]), [[beto.sid_, 'oferta']]);

  await ana.call('voice:leave');
  await wait();
  assert.equal(lastUpdate(beto, dm).call.endedAt, null, 'a chamada continua enquanto o Beto está nela');
  assert.deepEqual(lastUpdate(beto, dm).call.joined.sort(), [ana.id_, beto.id_].sort());
  await beto.call('voice:leave');
  await wait();
  const ended = lastUpdate(ana, dm);
  assert.ok(ended.call.endedAt >= ended.call.startedAt);
  assert.deepEqual(ended.call.joined.sort(), [ana.id_, beto.id_].sort());
});

test('chamada privada: recusar ou não atender para o toque e deixa a chamada perdida', async (t) => {
  const { ana, beto, dm } = await friends(t);
  await ana.call('voice:join', { dm });
  await wait();
  assert.ok(!(await beto.call('dm:ring:decline', { dm })).error);
  await wait();
  assert.deepEqual(beto.ringStops.map((r) => r.dm), [dm]);
  assert.match(ana.notice, /Beto recusou/);
  assert.equal(ana.last.call.ringing, false);

  // Ligar de novo volta a tocar; sem resposta, o toque para sozinho.
  assert.ok(!(await ana.call('dm:ring', { dm })).error);
  await wait();
  assert.equal(beto.rings.length, 2);
  await wait(RING_MS + 150);
  assert.equal(beto.ringStops.length, 2);
  assert.equal(ana.last.call.ringing, false);

  await ana.call('voice:leave');
  await wait();
  const missed = lastUpdate(beto, dm);
  assert.ok(missed.call.endedAt);
  assert.deepEqual(missed.call.joined, [ana.id_]);
  assert.match((await beto.call('dm:ring', { dm })).error, /Entre na chamada/);
});

test('chamada privada: quem liga e desiste para o toque, e desfazer a amizade derruba a chamada', async (t) => {
  const { ana, beto, dm } = await friends(t);
  await ana.call('voice:join', { dm });
  await wait();
  await ana.call('voice:leave');
  await wait();
  assert.deepEqual(beto.ringStops.map((r) => r.dm), [dm]);

  await ana.call('voice:join', { dm });
  await beto.call('voice:join', { dm });
  await wait();
  assert.ok(!(await ana.call('friend:remove', { id: beto.id_ })).error);
  await wait(150);
  assert.match(ana.forced.reason, /chamada/);
  assert.match(beto.forced.reason, /chamada/);
  assert.equal(ana.last.call, null);
  assert.match((await ana.call('voice:join', { dm })).error, /amigos/);
});

test('chamada privada: quem reconecta durante o toque recebe o toque de novo', async (t) => {
  const { connect, ana, beto, dm } = await friends(t);
  await ana.call('voice:join', { dm });
  await wait();
  beto.disconnect();
  const again = await connect('Beto2');
  // Outra conta não recebe o toque; a mesma conta, entrando de novo, recebe.
  assert.equal(again.rings.length, 0);
  const socket = io(beto.io.uri, { forceNew: true, transports: ['websocket'] });
  t.after(() => socket.disconnect());
  const rings = [];
  socket.on('dm:ring', (r) => rings.push(r));
  const login = await new Promise((resolve) => socket.emit('auth', { mode: 'login', name: 'Beto', password: '1234' }, resolve));
  assert.ok(!login.error, login.error);
  await wait(150);
  assert.deepEqual(rings.map((r) => r.dm), [dm]);
});

test('uma conta fica numa chamada só: entrar em outra aba tira a aba anterior', async (t) => {
  const { connect, ana, beto, dm } = await friends(t);
  const room = ana.last.channels.find((c) => c.type === 'voice').id;
  const outraAba = await connect('Ana', ana.token_);
  assert.equal(outraAba.id_, ana.id_);

  // Canal de voz do servidor: a mesma sala ou outra, a aba antiga sai.
  assert.ok(!(await beto.call('voice:join', { channel: room })).error);
  assert.ok(!(await ana.call('voice:join', { channel: room })).error);
  await wait();
  const joined = await outraAba.call('voice:join', { channel: room });
  assert.ok(!joined.error, joined.error);
  assert.deepEqual(joined.peers, [beto.sid_]);
  await wait();
  assert.match(ana.forced?.reason, /outra aba/);
  assert.deepEqual(beto.last.voice.filter((v) => v.accountId === ana.id_).map((v) => v.sid), [outraAba.sid_]);

  // Chamada privada tocando: a outra aba assume sem encerrar nem tocar de novo.
  ana.forced = null;
  assert.ok(!(await ana.call('voice:join', { dm })).error);
  await wait();
  assert.match(outraAba.forced?.reason, /outra aba/);
  const rings = beto.rings.length;
  const taken = await outraAba.call('voice:join', { dm });
  assert.deepEqual(taken.peers, []);
  await wait();
  assert.match(ana.forced?.reason, /outra aba/);
  assert.equal(beto.rings.length, rings);
  assert.equal(lastUpdate(beto, dm)?.call.endedAt ?? null, null);
  assert.equal(outraAba.last.call.ringing, true);
  assert.deepEqual(outraAba.last.call.voice.map((v) => v.sid), [outraAba.sid_]);
});

test('GIF: vai para canal e conversa privada só com links do KLIPY, e a chave chega a quem entrou', async (t) => {
  const { ana, beto, dm } = await friends(t);
  assert.equal(ana.gifKey_, 'chave-de-teste');
  const channel = ana.last.channels.find((c) => c.type === 'text').id;
  const gif = { slug: 'gato-1', title: 'Gato', url: 'https://static.klipy.com/ii/a/b.gif', webp: 'https://static.klipy.com/ii/a/b.webp', width: 300, height: 200 };

  for (const target of [channel, dm]) {
    const sent = await ana.call('chat:send', { channel: target, gif });
    assert.ok(!sent.error, sent.error);
    await wait();
    const got = beto.messages.filter((m) => m.channel === target).at(-1).msg;
    assert.deepEqual(got.gif, gif);
    assert.equal(got.text, '');
    // Mensagem só com GIF continua editável para ganhar texto, sem perder o GIF.
    assert.ok(!(await ana.call('chat:edit', { channel: target, id: got.id, text: 'olha' })).error);
  }
  assert.match((await ana.call('chat:send', { channel, gif: { ...gif, url: 'https://evil.com/x.gif' } })).error, /GIF inválido/);
  // GIF não dispara comando do Mudae, mesmo com texto de comando junto.
  const withText = await ana.call('chat:send', { channel, text: '$w', gif });
  assert.ok(!withText.error && !withText.ephemeral, JSON.stringify(withText));
});
