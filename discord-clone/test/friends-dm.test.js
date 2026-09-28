const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { io } = require('socket.io-client');

const wait = (ms = 80) => new Promise((r) => setTimeout(r, ms));

// Sobe um servidor de verdade numa porta livre com dados temporários.
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
  return async (name) => {
    const socket = io('http://127.0.0.1:' + port, { forceNew: true, transports: ['websocket'] });
    clients.push(socket);
    socket.on('state', (s) => (socket.last = s));
    socket.on('social', (s) => (socket.social = s));
    socket.messages = [];
    socket.on('chat:message', (m) => socket.messages.push(m));
    socket.on('notice', (n) => (socket.notice = n));
    socket.call = (event, payload) => new Promise((resolve) => socket.emit(event, payload, resolve));
    const res = await socket.call('auth', { mode: 'register', name, password: '1234' });
    assert.ok(!res.error, res.error);
    socket.id_ = res.accountId;
    await wait(100);
    return socket;
  };
}

async function befriend(a, b) {
  assert.ok(!(await a.call('friend:request', { name: b.name_ })).error);
  assert.ok(!(await b.call('friend:accept', { id: a.id_ })).error);
  await wait();
}

async function pair(t) {
  const connect = await startServer(t);
  const ana = await connect('Ana');
  const beto = await connect('Beto');
  ana.name_ = 'Ana';
  beto.name_ = 'Beto';
  return { connect, ana, beto };
}

test('friend request by name, accept, and both sides see each other', async (t) => {
  const { ana, beto } = await pair(t);
  assert.deepEqual(ana.social.friends, []);

  const sent = await ana.call('friend:request', { name: 'beto' });
  assert.equal(sent.status, 'pending');
  await wait();
  assert.deepEqual(ana.social.outgoing, [beto.id_]);
  assert.deepEqual(beto.social.incoming, [ana.id_]);
  assert.match(beto.notice, /Ana quer ser seu amigo/);

  assert.match((await ana.call('friend:request', { name: 'Beto' })).error, /já enviou/);
  assert.match((await beto.call('friend:accept', { id: beto.id_ })).error, /não existe/);

  assert.ok(!(await beto.call('friend:accept', { id: ana.id_ })).error);
  await wait();
  assert.deepEqual(ana.social.friends, [beto.id_]);
  assert.deepEqual(beto.social.friends, [ana.id_]);
  assert.deepEqual(beto.social.incoming, []);
  assert.match((await ana.call('friend:request', { name: 'Beto' })).error, /já são amigos/);
});

test('friend request validation: unknown name, yourself, and crossed requests become a friendship', async (t) => {
  const { ana, beto } = await pair(t);
  assert.match((await ana.call('friend:request', { name: 'Ninguém' })).error, /Não encontramos/);
  assert.match((await ana.call('friend:request', { name: 'Ana' })).error, /a si mesmo/);
  assert.match((await ana.call('friend:request', { id: 'zzzz' })).error, /Não encontramos/);

  await ana.call('friend:request', { id: beto.id_ });
  const crossed = await beto.call('friend:request', { name: 'Ana' });
  assert.equal(crossed.status, 'friends');
  await wait();
  assert.deepEqual(ana.social.friends, [beto.id_]);
});

test('declining or cancelling a request, and removing a friend', async (t) => {
  const { ana, beto } = await pair(t);
  await ana.call('friend:request', { name: 'Beto' });
  await beto.call('friend:decline', { id: ana.id_ });
  await wait();
  assert.deepEqual(ana.social.outgoing, []);
  assert.deepEqual(beto.social.incoming, []);

  await ana.call('friend:request', { name: 'Beto' });
  await ana.call('friend:decline', { id: beto.id_ }); // cancelar o próprio pedido
  await wait();
  assert.deepEqual(beto.social.incoming, []);

  await befriend(ana, beto);
  await beto.call('friend:remove', { id: ana.id_ });
  await wait();
  assert.deepEqual(ana.social.friends, []);
  assert.deepEqual(beto.social.friends, []);
});

test('direct messages: only between friends, delivered to both, unread survives a reload', async (t) => {
  const { connect, ana, beto } = await pair(t);
  const carla = await connect('Carla');

  assert.match((await ana.call('dm:open', { userId: beto.id_ })).error, /apenas|Só dá para conversar em privado com amigos/);
  await befriend(ana, beto);

  const { id } = await ana.call('dm:open', { userId: beto.id_ });
  assert.match(id, /^dm-/);
  await wait();
  assert.equal(ana.social.dms[0].id, id);
  assert.deepEqual(beto.social.dms, []); // Beto só vê a conversa depois da primeira mensagem

  assert.ok(!(await ana.call('chat:send', { channel: id, text: 'oi, Beto! @everyone' })).error);
  await wait();
  assert.equal(beto.messages.at(-1).channel, id);
  assert.equal(beto.messages.at(-1).msg.text, 'oi, Beto! @everyone');
  assert.equal(beto.messages.at(-1).msg.mentions.everyone, false);
  assert.equal(ana.messages.at(-1).channel, id);
  assert.equal(beto.social.dms[0].userId, ana.id_);
  assert.equal(carla.messages.length, 0);

  // Beto ainda não leu: continua não lido mesmo depois de reconectar.
  const unread = await beto.call('chat:unread');
  assert.deepEqual(unread.unread[id], { unread: true, mentions: 1 });
  await beto.call('chat:read', { channel: id });
  assert.deepEqual((await beto.call('chat:unread')).unread, {});

  const history = await beto.call('chat:history', { channel: id });
  assert.equal(history.messages.length, 1);

  // Uma terceira pessoa não lê nem escreve na conversa.
  assert.match((await carla.call('chat:history', { channel: id })).error, /Conversa não encontrada/);
  assert.match((await carla.call('chat:send', { channel: id, text: 'intrusa' })).error, /Conversa não encontrada/);
  assert.match((await carla.call('chat:react', { channel: id, id: history.messages[0].id, emoji: '👍' })).error, /Conversa não encontrada/);
});

test('direct messages: edit, react, and only the author can delete (not even the owner)', async (t) => {
  const { connect, ana, beto } = await pair(t);
  // Ana é a dona do servidor (primeira conta): tem todas as permissões.
  await befriend(ana, beto);
  const { id } = await beto.call('dm:open', { userId: ana.id_ });
  await beto.call('chat:send', { channel: id, text: 'segredo' });
  await wait();
  const msgId = (await ana.call('chat:history', { channel: id })).messages[0].id;

  assert.match((await ana.call('chat:delete', { channel: id, id: msgId })).error, /Sem permissão/);
  assert.match((await ana.call('chat:edit', { channel: id, id: msgId, text: 'adulterado' })).error, /suas mensagens/);
  assert.ok(!(await ana.call('chat:react', { channel: id, id: msgId, emoji: '👍' })).error);
  assert.ok(!(await beto.call('chat:edit', { channel: id, id: msgId, text: 'corrigido' })).error);
  const after = (await ana.call('chat:history', { channel: id })).messages[0];
  assert.equal(after.text, 'corrigido');
  assert.deepEqual(after.reactions['👍'], [ana.id_]);

  assert.ok(!(await beto.call('chat:delete', { channel: id, id: msgId })).error);
  assert.equal((await ana.call('chat:history', { channel: id })).messages.length, 0);
  void connect;
});

test('unfriending keeps the history readable but stops new messages', async (t) => {
  const { ana, beto } = await pair(t);
  await befriend(ana, beto);
  const { id } = await ana.call('dm:open', { userId: beto.id_ });
  await ana.call('chat:send', { channel: id, text: 'antes' });
  await ana.call('friend:remove', { id: beto.id_ });
  await wait();

  assert.match((await ana.call('chat:send', { channel: id, text: 'depois' })).error, /não são mais amigos/);
  assert.match((await beto.call('chat:send', { channel: id, text: 'depois' })).error, /não são mais amigos/);
  assert.equal((await beto.call('chat:history', { channel: id })).messages.length, 1);
  // Reabrir uma conversa que já existe continua possível, sem criar outra.
  assert.equal((await beto.call('dm:open', { userId: ana.id_ })).id, id);
});

test('blocking removes the friendship and stops requests and messages both ways', async (t) => {
  const { ana, beto } = await pair(t);
  await befriend(ana, beto);
  const { id } = await ana.call('dm:open', { userId: beto.id_ });

  assert.ok(!(await ana.call('friend:block', { id: beto.id_ })).error);
  await wait();
  assert.deepEqual(ana.social.friends, []);
  assert.deepEqual(ana.social.blocked, [beto.id_]);
  assert.deepEqual(beto.social.friends, []);
  assert.deepEqual(beto.social.blocked, []); // quem foi bloqueado não descobre

  assert.match((await ana.call('friend:request', { name: 'Beto' })).error, /bloqueou/);
  assert.match((await beto.call('friend:request', { name: 'Ana' })).error, /Não foi possível/);
  assert.ok((await beto.call('chat:send', { channel: id, text: 'oi?' })).error);
  assert.ok((await ana.call('chat:send', { channel: id, text: 'oi?' })).error);

  assert.ok(!(await ana.call('friend:unblock', { id: beto.id_ })).error);
  await wait();
  assert.deepEqual(ana.social.blocked, []);
  // Desbloquear não devolve a amizade.
  assert.deepEqual(ana.social.friends, []);
  assert.ok(!(await ana.call('friend:request', { name: 'Beto' })).error);
});

test('closing a conversation hides it until a new message arrives', async (t) => {
  const { ana, beto } = await pair(t);
  await befriend(ana, beto);
  const { id } = await ana.call('dm:open', { userId: beto.id_ });
  await ana.call('chat:send', { channel: id, text: 'um' });
  await wait();
  assert.equal(beto.social.dms.length, 1);

  await beto.call('dm:close', { id });
  await wait();
  assert.deepEqual(beto.social.dms, []);
  assert.deepEqual((await beto.call('chat:unread')).unread, {});

  await ana.call('chat:send', { channel: id, text: 'dois' });
  await wait();
  assert.equal(beto.social.dms.length, 1);
  assert.equal((await beto.call('chat:unread')).unread[id].mentions, 1);
  assert.equal((await beto.call('chat:history', { channel: id })).messages.length, 2);
});

test('banned people disappear from friends and conversations', async (t) => {
  const { ana, beto } = await pair(t);
  await befriend(ana, beto);
  const { id } = await ana.call('dm:open', { userId: beto.id_ });
  await ana.call('chat:send', { channel: id, text: 'oi' });
  await wait();
  assert.equal(ana.social.dms.length, 1);

  assert.ok(!(await ana.call('mod', { action: 'ban', target: beto.id_ })).error);
  await wait(150);
  assert.deepEqual(ana.social.friends, []);
  assert.deepEqual(ana.social.dms, []);
  assert.match((await ana.call('chat:send', { channel: id, text: 'ainda aí?' })).error, /não está mais/);
});

test('friends and direct messages survive a server restart', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'resenhex-'));
  const port = 40000 + Math.floor(Math.random() * 20000);
  const run = async () => {
    const proc = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
      env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', DATA_FILE: path.join(dir, 'data.json'), UPLOAD_DIR: path.join(dir, 'uploads'), ACCESS_PASSWORD: '' },
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    await new Promise((resolve, reject) => {
      proc.stdout.on('data', (d) => String(d).includes('rodando') && resolve());
      proc.on('exit', reject);
    });
    return proc;
  };
  const stop = async (proc) => {
    const exited = new Promise((resolve) => proc.once('exit', resolve));
    proc.kill();
    await exited;
  };
  let live = null;
  t.after(async () => {
    if (live) await stop(live);
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const client = async (payload) => {
    const socket = io('http://127.0.0.1:' + port, { forceNew: true, transports: ['websocket'] });
    socket.on('social', (s) => (socket.social = s));
    socket.call = (event, data) => new Promise((resolve) => socket.emit(event, data, resolve));
    const res = await socket.call('auth', payload);
    assert.ok(!res.error, res.error);
    socket.id_ = res.accountId;
    await wait(100);
    return socket;
  };

  let proc = live = await run();
  let ana = await client({ mode: 'register', name: 'Ana', password: '1234' });
  let beto = await client({ mode: 'register', name: 'Beto', password: '1234' });
  await befriend(Object.assign(ana, { name_: 'Ana' }), Object.assign(beto, { name_: 'Beto' }));
  const { id } = await ana.call('dm:open', { userId: beto.id_ });
  await ana.call('chat:send', { channel: id, text: 'persistiu?' });
  ana.disconnect();
  beto.disconnect();
  await stop(proc); // SIGTERM grava os dados pendentes

  proc = live = await run();
  ana = await client({ mode: 'login', name: 'Ana', password: '1234' });
  beto = await client({ mode: 'login', name: 'Beto', password: '1234' });
  t.after(() => { ana.disconnect(); beto.disconnect(); });
  assert.deepEqual(ana.social.friends, [beto.id_]);
  assert.equal(beto.social.dms[0].id, id);
  assert.equal((await beto.call('chat:history', { channel: id })).messages[0].text, 'persistiu?');
});
