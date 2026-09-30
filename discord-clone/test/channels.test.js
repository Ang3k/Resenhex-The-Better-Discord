const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { once } = require('node:events');
const { io } = require('socket.io-client');
const { migrateChannels, channelActions } = require('../channels');

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check) {
  for (let i = 0; i < 100; i++) { if (await check()) return; await delay(30); }
  assert.fail('O estado esperado não chegou.');
}

async function startServer(t, seed) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'resenhex-channels-'));
  const dataFile = path.join(dir, 'data.json');
  if (seed) fs.writeFileSync(dataFile, JSON.stringify(seed));
  const sockets = [];
  let proc;
  let base;
  async function stop() {
    sockets.splice(0).forEach((socket) => socket.disconnect());
    if (proc && proc.exitCode === null && proc.signalCode === null) {
      const stopped = once(proc, 'exit');
      proc.kill();
      await stopped;
    }
  }
  t.after(async () => {
    await stop();
    const target = path.resolve(dir);
    assert.equal(path.dirname(target), path.resolve(os.tmpdir()));
    assert.ok(path.basename(target).startsWith('resenhex-channels-'));
    fs.rmSync(target, { recursive: true, force: true });
  });
  async function start() {
    const reservation = net.createServer();
    reservation.listen(0, '127.0.0.1');
    await once(reservation, 'listening');
    const port = reservation.address().port;
    await new Promise((resolve) => reservation.close(resolve));
    base = 'http://127.0.0.1:' + port;
    proc = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
      env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), DATA_FILE: dataFile,
        UPLOAD_DIR: path.join(dir, 'uploads'), ACCESS_PASSWORD: '', ACCESS_PASSWORD_B64: '' },
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('Servidor não iniciou.')), 10000);
      proc.once('error', reject);
      proc.once('exit', (code) => { clearTimeout(timer); reject(Error('Servidor encerrou: ' + code)); });
      proc.stdout.on('data', (data) => { if (String(data).includes('rodando')) { clearTimeout(timer); resolve(); } });
    });
  }
  await start();
  return {
    get base() { return base; },
    dataFile,
    async restart() { await stop(); await start(); },
    async connect(name, token) {
      const socket = io(base, { autoConnect: false, forceNew: true, transports: ['websocket'], reconnection: false });
      sockets.push(socket);
      socket.on('state', (state) => { socket.snapshot = state; });
      socket.call = (event, payload = {}) => socket.timeout(3000).emitWithAck(event, payload);
      const connected = once(socket, 'connect');
      socket.connect();
      await connected;
      socket.authResult = await socket.call('auth', token ? { token } : { mode: 'register', name, password: 'test-only-2026', confirmPassword: 'test-only-2026' });
      assert.ok(socket.authResult.accountId, socket.authResult.error);
      await until(() => socket.snapshot);
      if (!token && !socket.snapshot.serverId) {
        const invite = await sockets[0].call('server:invite');
        assert.ok(!(await socket.call('server:join', { code: invite.code })).error);
      }
      return socket;
    },
  };
}

function fixture() {
  return {
    roles: [{ id: 'everyone' }, { id: 'team' }],
    channels: [
      { id: 'chat', type: 'text', name: 'Chat', allowedRoles: [] },
      { id: 'room', type: 'voice', name: 'Sala', allowedRoles: ['team'] },
      { id: 'chat2', type: 'text', name: 'Outro', allowedRoles: [] },
    ],
    messages: { chat: [{ id: 'msg', text: 'Histórico', attachments: [{ id: 'file' }] }] },
    uploads: { file: { messageId: 'msg' } }, accounts: { user: { lastRead: { chat: 123 } } },
  };
}

test('legacy migration preserves IDs, order, history, files, reading and private access; it is idempotent', () => {
  const db = fixture();
  const original = structuredClone(db);
  migrateChannels(db);
  assert.deepEqual(db.channels.map((c) => c.id), original.channels.map((c) => c.id));
  assert.deepEqual(db.channels.map((c) => c.categoryId), ['text', 'voice', 'text']);
  assert.deepEqual(db.channels.map((c) => c.private), [false, true, false]);
  assert.deepEqual(db.messages, original.messages);
  assert.deepEqual(db.uploads, original.uploads);
  assert.deepEqual(db.accounts, original.accounts);
  const migrated = structuredClone(db);
  migrateChannels(db);
  assert.deepEqual(db, migrated);
});

test('invalid destinations and roles never partially rename or move a channel', () => {
  const db = fixture();
  migrateChannels(db);
  const actions = channelActions(db, () => 'new');
  const original = structuredClone(db);
  assert.throws(() => actions.channel({ action: 'update', id: 'chat', name: 'renamed', categoryId: 'missing' }));
  assert.throws(() => actions.channel({ action: 'update', id: 'chat', name: 'renamed', private: true, allowedRoles: ['missing'] }));
  assert.throws(() => actions.channel({ action: 'move', id: 'chat', categoryId: 'voice', beforeId: 'chat2' }));
  assert.throws(() => actions.channel({ action: 'move', id: 'chat', categoryId: 'voice', beforeId: 'chat' }));
  assert.deepEqual(db, original);
});

test('mixed channel ordering keeps IDs and settings; duplication starts with empty history', () => {
  const db = fixture();
  migrateChannels(db);
  let next = 0;
  const actions = channelActions(db, () => 'copy' + ++next);
  actions.channel({ action: 'move', id: 'room', categoryId: 'text', beforeId: 'chat2' });
  assert.deepEqual(db.channels.filter((c) => c.categoryId === 'text').map((c) => c.id), ['chat', 'room', 'chat2']);
  actions.channel({ action: 'update', id: 'chat', topic: 'Assunto', private: true, allowedRoles: [] });
  const copy = actions.channel({ action: 'duplicate', id: 'chat', name: 'Chat cópia' });
  assert.deepEqual(db.channels.find((c) => c.id === copy.id), { id: copy.id, type: 'text', name: 'chat-cópia', categoryId: 'text', topic: 'Assunto', private: true, allowedRoles: [] });
  assert.deepEqual(db.messages[copy.id], []);
  actions.category({ action: 'delete', id: 'text' });
  assert.ok(db.channels.every((c) => c.categoryId === null));
  assert.equal(db.channels.find((c) => c.id === 'room').private, true);
  assert.equal(db.messages.chat[0].id, 'msg');
  assert.equal(db.uploads.file.messageId, 'msg');
  assert.equal(db.accounts.user.lastRead.chat, 123);
});

test('groups, moving, duplication and deletion preserve live calls and attachments and survive restart', { timeout: 25000 }, async (t) => {
  const app = await startServer(t);
  const owner = await app.connect('Owner');
  const member = await app.connect('Member');
  const group = (await owner.call('category', { action: 'create', name: 'Jogos' })).id;
  const other = (await owner.call('category', { action: 'create', name: 'Comunidade' })).id;
  assert.ok(group && other);
  await owner.call('category', { action: 'move', id: group, beforeId: 'text' });
  assert.equal(owner.snapshot.categories[0].id, group);
  await owner.call('category', { action: 'update', id: group, name: 'Turma' });
  const chat = (await owner.call('channel', { action: 'create', type: 'text', name: 'clips', categoryId: group, topic: 'Clips da turma' })).id;
  const room = (await owner.call('channel', { action: 'create', type: 'voice', name: 'Squad', categoryId: group })).id;
  const final = (await owner.call('channel', { action: 'create', type: 'text', name: 'agenda', categoryId: group })).id;
  assert.ok(chat && room && final);
  await until(() => member.snapshot.channels.some((c) => c.id === room));
  await member.call('chat:read', { channel: chat });
  const upload = await fetch(app.base + '/upload', { method: 'POST', headers: {
    'x-token': owner.authResult.token, 'x-filename': 'clip.txt', 'content-type': 'application/octet-stream',
  }, body: 'arquivo de teste' });
  assert.equal(upload.status, 200);
  const file = await upload.json();
  assert.ok(!(await owner.call('chat:send', { channel: chat, text: 'Clip guardado', attachments: [file.id] })).error);
  const history = (await owner.call('chat:history', { channel: chat })).messages;
  assert.equal(history.length, 1);
  let forceLeaves = 0;
  member.on('voice:force-leave', () => forceLeaves++);
  assert.ok(!(await owner.call('voice:join', { channel: room })).error);
  assert.ok(!(await member.call('voice:join', { channel: room })).error);
  await owner.call('channel', { action: 'move', id: room, categoryId: group, beforeId: chat });
  assert.deepEqual(owner.snapshot.channels.filter((c) => c.categoryId === group).map((c) => c.id), [room, chat, final]);
  await owner.call('channel', { action: 'move', id: chat, categoryId: other });
  const copy = (await owner.call('channel', { action: 'duplicate', id: chat, name: 'clips-cópia', categoryId: group })).id;
  assert.ok(copy);
  assert.deepEqual((await owner.call('chat:history', { channel: copy })).messages, []);
  assert.equal(owner.snapshot.channels.find((c) => c.id === copy).topic, 'Clips da turma');
  const roomCopy = (await owner.call('channel', { action: 'duplicate', id: room, name: 'Squad 2' })).id;
  assert.ok(!owner.snapshot.voice.some((v) => v.channel === roomCopy));
  assert.ok(!(await owner.call('category', { action: 'delete', id: group })).error);
  assert.equal(owner.snapshot.channels.find((c) => c.id === room).categoryId, null);
  await until(() => member.snapshot.voice.filter((v) => v.channel === room).length === 2);
  assert.equal(forceLeaves, 0);
  assert.deepEqual((await member.call('chat:history', { channel: chat })).messages, history);
  assert.equal((await fetch(app.base + file.url)).status, 200);
  await delay(500);
  const saved = JSON.parse(fs.readFileSync(app.dataFile, 'utf8'));
  assert.ok(saved.accounts[member.authResult.accountId].lastRead[chat]);
  const token = owner.authResult.token;
  await app.restart();
  const restored = await app.connect(null, token);
  assert.equal(restored.snapshot.categories[0].id, 'text');
  assert.equal(restored.snapshot.categories.find((g) => g.id === other).name, 'Comunidade');
  assert.equal(restored.snapshot.channels.find((c) => c.id === room).categoryId, null);
  assert.deepEqual((await restored.call('chat:history', { channel: chat })).messages, history);
  assert.equal((await fetch(app.base + file.url)).status, 200);
});

test('private channels without roles stay private after moves, duplicates and role deletion; hidden groups do not leak to members', { timeout: 25000 }, async (t) => {
  const app = await startServer(t);
  const owner = await app.connect('Owner');
  const member = await app.connect('Member');
  const manager = await app.connect('Manager');
  const managementRole = (await owner.call('role', { action: 'create', name: 'Organizador', perms: ['MANAGE_CHANNELS'] })).id;
  assert.ok(!(await owner.call('mod', { action: 'setRoles', target: manager.authResult.accountId, value: [managementRole] })).error);
  await until(() => manager.snapshot.myPerms.includes('MANAGE_CHANNELS'));
  const group = (await owner.call('category', { action: 'create', name: 'Equipe reservada' })).id;
  const secret = (await owner.call('channel', { action: 'create', type: 'text', name: 'segredo', categoryId: group, private: true, allowedRoles: [] })).id;
  await until(() => owner.snapshot.channels.some((c) => c.id === secret));
  await delay(60);
  assert.ok(!member.snapshot.channels.some((c) => c.id === secret));
  assert.ok(!member.snapshot.categories.some((g) => g.id === group));
  assert.match((await member.call('chat:history', { channel: secret })).error, /não encontrado/);
  assert.match((await member.call('chat:send', { channel: secret, text: 'Tentativa' })).error, /não encontrado/);
  assert.match((await member.call('category', { action: 'create', name: 'Sem permissão' })).error, /permissão/);
  assert.match((await manager.call('channel', { action: 'duplicate', id: secret, name: 'cópia' })).error, /não encontrado/);
  assert.match((await manager.call('channel', { action: 'move', id: 'geral', categoryId: group, beforeId: secret })).error, /não encontrado/);
  assert.ok(!(await manager.call('category', { action: 'create', name: 'Grupo público' })).error);
  const role = (await owner.call('role', { action: 'create', name: 'Convidado', perms: [] })).id;
  await owner.call('mod', { action: 'setRoles', target: member.authResult.accountId, value: [role] });
  await owner.call('channel', { action: 'update', id: secret, private: true, allowedRoles: [role] });
  await until(() => member.snapshot.channels.some((c) => c.id === secret));
  await owner.call('channel', { action: 'update', id: secret, allowedRoles: [] });
  await until(() => !member.snapshot.channels.some((c) => c.id === secret));
  assert.equal(owner.snapshot.channels.find((c) => c.id === secret).private, true);
  const copy = (await owner.call('channel', { action: 'duplicate', id: secret, name: 'segredo-cópia', categoryId: 'text' })).id;
  await owner.call('channel', { action: 'move', id: secret, categoryId: 'text' });
  await owner.call('channel', { action: 'update', id: secret, allowedRoles: [role] });
  const privateRoom = (await owner.call('channel', { action: 'create', type: 'voice', name: 'Sala reservada', categoryId: group, private: true, allowedRoles: [role] })).id;
  assert.match((await manager.call('voice:join', { channel: privateRoom })).error, /não encontrado/);
  assert.ok(!(await member.call('voice:join', { channel: privateRoom })).error);
  let removedFromVoice = false;
  member.once('voice:force-leave', () => { removedFromVoice = true; });
  await owner.call('role', { action: 'delete', id: role });
  await until(() => !member.snapshot.channels.some((c) => c.id === secret));
  await until(() => removedFromVoice);
  assert.ok(!member.snapshot.voice.some((v) => v.accountId === member.authResult.accountId));
  assert.equal(owner.snapshot.channels.find((c) => c.id === secret).private, true);
  assert.deepEqual(owner.snapshot.channels.find((c) => c.id === secret).allowedRoles, []);
  assert.ok(!member.snapshot.channels.some((c) => c.id === copy));
  assert.ok(!(await owner.call('channel', { action: 'update', id: secret, private: false })).error);
  await until(() => member.snapshot.channels.some((c) => c.id === secret));
});
