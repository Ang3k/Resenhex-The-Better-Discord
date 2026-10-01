const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { io } = require('socket.io-client');
const wait = (ms = 70) => new Promise((r) => setTimeout(r, ms));
// O estado de OUTRA conexão pode chegar depois da confirmação de quem agiu: espera ele chegar.
async function eventually(check, timeout = 2000) {
  const end = Date.now() + timeout;
  for (;;) {
    try { return check(); } catch (error) { if (Date.now() > end) throw error; }
    await wait(20);
  }
}

async function fixture(t, password = '', seed = null, corrupt = false) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'resenhex-servers-'));
  if (seed) fs.writeFileSync(path.join(dir, 'data.json'), JSON.stringify(seed));
  if (corrupt) { fs.copyFileSync(path.join(dir, 'data.json'), path.join(dir, 'data.json.bak')); fs.writeFileSync(path.join(dir, 'data.json'), '{broken'); }
  const port = 40000 + Math.floor(Math.random() * 20000);
  const base = 'http://127.0.0.1:' + port;
  let proc;
  async function start() {
  proc = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), DATA_FILE: path.join(dir, 'data.json'), UPLOAD_DIR: path.join(dir, 'uploads'), ACCESS_PASSWORD: password, ACCESS_PASSWORD_B64: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Server startup timeout')), 5000);
    proc.stdout.on('data', (data) => { if (String(data).includes('rodando')) { clearTimeout(timer); resolve(); } });
    proc.once('exit', (code) => { clearTimeout(timer); reject(new Error('Server exited: ' + code)); });
  });
  }
  await start();
  const clients = [];
  async function stop() {
    clients.splice(0).forEach((s) => s.disconnect());
    if (proc.exitCode === null && proc.signalCode === null) {
      const exit = new Promise((r) => proc.once('exit', r)); proc.kill(); await exit;
    }
  }
  t.after(async () => { await stop(); assert.equal(path.dirname(path.resolve(dir)), path.resolve(os.tmpdir())); fs.rmSync(dir, { recursive: true, force: true }); });
  async function connect(payload) {
    const socket = io(base, { forceNew: true, transports: ['websocket'] }); clients.push(socket);
    socket.on('state', (s) => { socket.last = s; });
    socket.call = (event, value = {}) => new Promise((r) => socket.timeout(3000).emit(event, value, (error, reply) => r(error ? { error: error.message } : reply)));
    const auth = await socket.call('auth', typeof payload === 'string' ? { mode: 'register', name: payload, password: '1234', confirmPassword: '1234' } : payload);
    assert.ok(!auth.error, auth.error); socket.auth = auth;
    await wait();
    if (typeof payload === 'string' && !socket.last.serverId) {
      const invite = await clients[0].call('server:invite');
      assert.ok(!(await socket.call('server:join', { code: invite.code })).error);
    }
    return socket;
  }
  return { connect, base, dir, restart: async () => { await wait(400); await stop(); await start(); } };
}

test('username and password confirmation create an independent account; existing password login still works', async (t) => {
  const { connect } = await fixture(t, 'legacy-password-is-no-longer-needed');
  await connect('Dono');
  const newcomer = await connect({ mode: 'register', name: 'Nome de usuário', password: 'minha-senha', confirmPassword: 'minha-senha' });
  assert.equal(newcomer.last.serverId, null);
  assert.deepEqual(newcomer.last.channels, []); assert.deepEqual(newcomer.last.members, []); assert.deepEqual(newcomer.last.servers, []);
  assert.equal(newcomer.last.people.length, 1);
  assert.equal(newcomer.last.people[0].name, 'Nome de usuário');
  assert.equal(newcomer.last.people[0].hash, undefined);
  const loggedIn = await connect({ name: 'nome DE usuário', password: 'minha-senha' });
  assert.equal(loggedIn.auth.accountId, newcomer.auth.accountId);
  assert.equal(loggedIn.last.serverId, null);
  const created = await newcomer.call('server:create', { name: 'Meu espaço' });
  assert.ok(created.id, created.error); assert.equal(newcomer.last.ownerId, newcomer.auth.accountId);
});

test('password confirmation is enforced by the server and duplicate usernames are rejected', async (t) => {
  const { base, connect } = await fixture(t);
  await connect('Dono');
  const socket = io(base, { forceNew: true, transports: ['websocket'] }); t.after(() => socket.close());
  const auth = (payload) => new Promise((r) => socket.timeout(3000).emit('auth', payload, (error, reply) => r(error ? { error: error.message } : reply)));
  const registration = { mode: 'register', name: 'Novo', password: '1234' };
  assert.match((await auth(registration)).error, /senhas não coincidem/);
  assert.match((await auth({ ...registration, confirmPassword: 'outra' })).error, /senhas não coincidem/);
  assert.match((await auth({ ...registration, name: 'dOnO', confirmPassword: '1234' })).error, /já está em uso/);
  assert.ok((await auth({ ...registration, confirmPassword: '1234' })).accountId);
});

test('server creation and socket selection isolate channels, members, chat and voice', async (t) => {
  const { connect } = await fixture(t);
  const owner = await connect('Dono'); const guest = await connect('Visitante');
  const original = owner.last.serverId;
  const originalVoice = owner.last.channels.find((c) => c.type === 'voice').id;
  const created = await owner.call('server:create', { name: 'Segundo servidor' });
  assert.ok(created.id, created.error);
  assert.equal(owner.last.serverId, created.id);
  assert.equal(owner.last.servers.length, 2);
  assert.deepEqual(owner.last.members.map((m) => m.id), [owner.auth.accountId]);
  const channel = owner.last.channels.find((c) => c.type === 'text').id;
  assert.notEqual(channel, 'geral');
  assert.ok((await guest.call('server:select', { id: created.id })).error);
  assert.match((await owner.call('mod', { action: 'serverMute', target: guest.auth.accountId, value: true })).error, /Membro não encontrado/);
  assert.ok((await guest.call('chat:history', { channel })).error);
  let leaked = false; guest.on('chat:message', () => { leaked = true; });
  assert.ok(!(await owner.call('chat:send', { channel, text: 'somente aqui' })).error);
  await wait(); assert.equal(leaked, false);
  await guest.call('voice:join', { channel: originalVoice });
  assert.equal(owner.last.voice.length, 0);
  const secondSocket = await connect({ token: owner.auth.token, serverId: original });
  assert.equal(secondSocket.last.serverId, original);
  assert.ok(!(await secondSocket.call('server:update', { name: 'Servidor original' })).error);
  assert.equal(owner.last.serverName, 'Segundo servidor');
  assert.ok((await secondSocket.call('chat:history', { channel })).error);
  assert.ok(!(await owner.call('server:update', { name: 'Servidor segundo' })).error);
  assert.equal(secondSocket.last.serverName, 'Servidor original');
  let leakedTyping = false;
  secondSocket.on('typing', () => { leakedTyping = true; });
  await owner.call('typing', { channel }); await wait();
  assert.equal(leakedTyping, false, 'a second socket belonging to the same account must not receive typing from another selected server');
});

test('invite previews, registration, revocation and joining are scoped to the invited server', async (t) => {
  const { connect, base } = await fixture(t, 'senha-do-site');
  const owner = await connect('Dono');
  const created = await owner.call('server:create', { name: 'Clube' }); assert.ok(created.id, created.error);
  const invite = await owner.call('server:invite'); assert.match(invite.code, /^[\w-]{24}$/);
  const preview = await (await fetch(base + '/invites/' + invite.code)).json();
  assert.equal(preview.name, 'Clube'); assert.equal(preview.channels, undefined); assert.equal(preview.members, 1);
  const friend = await connect({ mode: 'register', name: 'Amigo convidado', password: '1234', confirmPassword: '1234', invite: invite.code });
  assert.equal(friend.last.serverId, null); assert.equal(friend.last.servers.length, 0);
  assert.ok(!(await friend.call('server:join', { code: invite.code })).error);
  assert.equal(friend.last.serverId, created.id); assert.equal(friend.last.servers.length, 1);
  assert.ok(!(await friend.call('server:join', { code: invite.code })).error);
  assert.ok((await friend.call('server:invite', { rotate: true })).error);
  const rotated = await owner.call('server:invite', { rotate: true }); assert.notEqual(rotated.code, invite.code);
  assert.equal((await fetch(base + '/invites/' + invite.code)).status, 404);
  assert.ok((await friend.call('server:join', { code: invite.code })).error);
  assert.equal((await fetch(base + '/invites/invalid')).status, 404);
});

test('moderation affects only that membership and preserves global sessions and DMs', async (t) => {
  const { connect } = await fixture(t);
  const owner = await connect('Dono'); const friend = await connect('Amigo');
  const original = owner.last.serverId;
  const created = await owner.call('server:create', { name: 'Outro' }); assert.ok(created.id, created.error);
  const invite = await owner.call('server:invite');
  await friend.call('server:join', { code: invite.code });
  const friendOriginal = await connect({ token: friend.auth.token, serverId: original });
  assert.ok(!(await owner.call('mod', { action: 'serverMute', target: friend.auth.accountId, value: true })).error);
  await eventually(() => assert.equal(friend.last.members.find((m) => m.id === friend.auth.accountId).serverMuted, true));
  assert.equal(friendOriginal.last.members.find((m) => m.id === friend.auth.accountId).serverMuted, false);
  assert.ok(!(await owner.call('mod', { action: 'ban', target: friend.auth.accountId })).error);
  assert.equal(friend.connected, true); assert.equal(friendOriginal.connected, true);
  await eventually(() => assert.equal(friend.last.serverId, original));
  assert.ok((await friend.call('server:join', { code: invite.code })).error);
  const reconnected = await connect({ token: friend.auth.token }); assert.equal(reconnected.last.serverId, original);
  assert.ok(!(await owner.call('mod', { action: 'unban', target: friend.auth.accountId })).error);
  assert.ok(!(await friend.call('server:join', { code: invite.code })).error);
  const voice = friend.last.channels.find((c) => c.type === 'voice').id;
  await friend.call('voice:join', { channel: voice });
  // Trocar de servidor não derruba a chamada; um banimento derruba.
  await friend.call('server:select', { id: original });
  await eventually(() => assert.equal(owner.last.voice.some((v) => v.accountId === friend.auth.accountId), true));
  let kicked = null; friend.on('voice:force-leave', (e) => { kicked = e; });
  assert.ok(!(await owner.call('mod', { action: 'ban', target: friend.auth.accountId })).error);
  await eventually(() => assert.equal(owner.last.voice.some((v) => v.accountId === friend.auth.accountId), false));
  await eventually(() => assert.match(kicked?.reason || '', /banido/));
  assert.equal(friend.last.call, null);
});

test('switching servers keeps the call; call data, moderation and sounds stay tied to the call server', async (t) => {
  const { connect } = await fixture(t);
  const owner = await connect('Dono'); const friend = await connect('Amigo');
  const original = owner.last.serverId;
  const room = owner.last.channels.find((c) => c.type === 'voice');
  assert.ok(!(await owner.call('voice:join', { channel: room.id })).error);
  assert.ok(!(await friend.call('voice:join', { channel: room.id })).error);
  const other = (await owner.call('server:create', { name: 'Outro lugar' })).id;
  // O dono agora olha o servidor novo, mas continua na chamada do original.
  assert.equal(owner.last.serverId, other);
  assert.equal(owner.last.voice.length, 0);
  assert.equal(owner.last.call.serverId, original);
  assert.equal(owner.last.call.channel.id, room.id);
  assert.deepEqual(owner.last.call.voice.map((v) => v.accountId).sort(), [owner.auth.accountId, friend.auth.accountId].sort());
  assert.ok(owner.last.call.members.some((m) => m.id === friend.auth.accountId));
  assert.ok(owner.last.call.myPerms.includes('SPEAK'));
  await eventually(() => assert.equal(friend.last.voice.filter((v) => v.channel === room.id).length, 2));
  // Mudo/transmissão e efeitos sonoros continuam valendo na sala do servidor original.
  assert.ok(!(await owner.call('voice:state', { muted: true })).error);
  await eventually(() => assert.equal(friend.last.voice.find((v) => v.accountId === owner.auth.accountId).muted, true));
  const heard = new Promise((r) => friend.once('sound', r));
  assert.ok(!(await owner.call('sound:play', { sound: 'buzina' })).error);
  assert.equal((await heard).from, owner.auth.accountId);
  // Sinalização WebRTC segue entre os dois, mesmo vendo servidores diferentes.
  const signal = new Promise((r) => friend.once('signal', r));
  owner.emit('signal', { to: friend.auth.sid, data: { ping: 1 } });
  assert.equal((await signal).from, owner.auth.sid);
  // Um moderador do servidor da chamada ainda consegue mover e desconectar quem olha outro servidor.
  const moderator = await connect({ token: owner.auth.token, serverId: original });
  const second = await moderator.call('channel', { action: 'create', type: 'voice', name: 'sala-2' });
  assert.ok(second.id, second.error);
  const moved = new Promise((r) => friend.once('voice:force-move', r));
  assert.ok(!(await moderator.call('mod', { action: 'move', target: friend.auth.accountId, value: second.id })).error);
  assert.equal((await moved).serverId, original);
  assert.ok(!(await friend.call('server:select', { id: original })).error);
  const rejoined = await owner.call('voice:join', { channel: second.id, serverId: original });
  assert.ok(!rejoined.error, rejoined.error);
  assert.equal(owner.last.call.channel.id, second.id);
  assert.equal(owner.last.serverId, other);
  // Entrar numa sala de um servidor do qual não participa é recusado.
  assert.ok((await friend.call('voice:join', { channel: room.id, serverId: other })).error);
  const left = new Promise((r) => owner.once('voice:force-leave', r));
  assert.ok(!(await moderator.call('mod', { action: 'disconnect', target: owner.auth.accountId })).error);
  await left;
  await eventually(() => assert.equal(owner.last.call, null));
});

test('new servers support groups, private channels and role management without changing the original server', async (t) => {
  const { connect } = await fixture(t);
  const owner = await connect('Dono'); const friend = await connect('Amigo');
  const original = owner.last.serverId;
  const originalRoles = structuredClone(owner.last.roles);
  const next = (await owner.call('server:create', { name: 'Nova turma' })).id;
  const group = await owner.call('category', { action: 'create', name: 'Projetos' });
  const role = await owner.call('role', { action: 'create', name: 'Equipe', perms: ['SEND_MESSAGES'] });
  assert.ok(group.id, group.error); assert.ok(role.id, role.error);
  const privateChannel = await owner.call('channel', { action: 'create', type: 'text', name: 'projeto', categoryId: group.id, private: true, allowedRoles: [role.id], topic: 'Planejamento' });
  assert.ok(privateChannel.id, privateChannel.error);
  const invite = await owner.call('server:invite');
  await friend.call('server:join', { code: invite.code });
  assert.equal(friend.last.channels.some((c) => c.id === privateChannel.id), false);
  assert.ok((await friend.call('chat:history', { channel: privateChannel.id })).error);
  assert.ok(!(await owner.call('mod', { action: 'setRoles', target: friend.auth.accountId, value: [role.id] })).error);
  await eventually(() => assert.equal(friend.last.channels.find((c) => c.id === privateChannel.id).topic, 'Planejamento'));
  assert.ok(!(await friend.call('chat:send', { channel: privateChannel.id, text: 'projeto privado' })).error);
  const copy = await owner.call('channel', { action: 'duplicate', id: privateChannel.id, name: 'projeto-copia' });
  assert.ok(copy.id, copy.error);
  assert.deepEqual((await owner.call('chat:history', { channel: copy.id })).messages, []);
  await friend.call('server:select', { id: original });
  assert.deepEqual(friend.last.roles, originalRoles);
  assert.deepEqual(friend.last.members.find((m) => m.id === friend.auth.accountId).roles, []);
  assert.ok((await friend.call('chat:history', { channel: privateChannel.id })).error);
  assert.equal(owner.last.serverId, next);
});

test('leaving and kicking only remove that server; a fresh invite restores membership without old roles', async (t) => {
  const { connect } = await fixture(t);
  const owner = await connect('Dono'); const friend = await connect('Amigo');
  const original = owner.last.serverId;
  const next = (await owner.call('server:create', { name: 'Outro espaço' })).id;
  const invite = await owner.call('server:invite');
  await friend.call('server:join', { code: invite.code });
  const chat = friend.last.channels.find((c) => c.type === 'text').id;
  assert.ok(!(await friend.call('chat:send', { channel: chat, text: 'mensagem que permanece' })).error);
  assert.ok((await owner.call('server:leave')).error, 'owner must not orphan their server');
  assert.ok(!(await friend.call('server:leave')).error);
  assert.equal(friend.last.serverId, original); assert.equal(friend.last.servers.some((s) => s.id === next), false);
  const history = await owner.call('chat:history', { channel: chat });
  assert.equal(history.authors[0].name, 'Amigo'); assert.equal(history.authors[0].hash, undefined); assert.deepEqual(history.authors[0].roles, []);
  assert.ok(!(await friend.call('server:join', { code: invite.code })).error);
  assert.ok(!(await owner.call('mod', { action: 'kick', target: friend.auth.accountId })).error);
  assert.equal(friend.connected, true); await eventually(() => assert.equal(friend.last.serverId, original));
  assert.ok(!(await friend.call('server:join', { code: invite.code })).error);
  assert.deepEqual(friend.last.members.find((m) => m.id === friend.auth.accountId).roles, []);
});

test('HTTP uploads are bound to their server and channel even with concurrent requests and two selected servers', async (t) => {
  const { connect, base } = await fixture(t);
  const owner = await connect('Dono'); const outsider = await connect('Fora');
  const first = owner.last.serverId;
  const firstText = owner.last.channels.find((c) => c.type === 'text').id;
  const second = (await owner.call('server:create', { name: 'Segundo' })).id;
  const secondText = owner.last.channels.find((c) => c.type === 'text').id;
  const upload = (token, serverId, channelId) => fetch(base + '/upload', { method: 'POST', headers: { 'x-token': token, 'x-server-id': serverId, 'x-channel-id': channelId, 'x-filename': 'teste.txt', 'content-type': 'application/octet-stream' }, body: 'conteúdo de teste' });
  assert.equal((await upload(outsider.auth.token, second, secondText)).status, 403);
  const [responseA, responseB] = await Promise.all([upload(owner.auth.token, first, firstText), upload(owner.auth.token, second, secondText)]);
  assert.equal(responseA.status, 200); assert.equal(responseB.status, 200);
  const a = await responseA.json(), b = await responseB.json();
  assert.match((await owner.call('chat:send', { channel: secondText, attachments: [a.id] })).error, /Anexo inválido/);
  assert.ok(!(await owner.call('chat:send', { channel: secondText, attachments: [b.id] })).error);
  await owner.call('server:select', { id: first });
  assert.ok(!(await owner.call('chat:send', { channel: firstText, attachments: [a.id] })).error);
});

test('migration and restart preserve Santuário Letárgico, the original data, new servers and their invites', async (t) => {
  const accountId = 'a'.repeat(16);
  const salt = 'test-legacy-salt';
  const hash = crypto.scryptSync('senha-antiga', salt, 64).toString('hex');
  const seed = { serverName: 'Santuário Letárgico', ownerId: accountId,
    roles: [{ id: 'everyone', name: '@everyone', perms: ['SEND_MESSAGES', 'CONNECT', 'SPEAK', 'STREAM'] }],
    channels: [{ id: 'geral', name: 'geral', type: 'text', allowedRoles: [] }],
    accounts: { [accountId]: { id: accountId, name: 'Dono original', roles: [], color: '#5865f2', createdAt: 123, salt, hash } },
    sessions: { 'test-migration-token': accountId }, messages: { geral: [{ id: 'histórico', authorId: accountId, text: 'mensagem antiga', ts: 123 }] }, uploads: {} };
  const app = await fixture(t, '', seed);
  const owner = await app.connect({ token: 'test-migration-token' });
  const original = owner.last.serverId;
  assert.equal(owner.last.serverName, seed.serverName);
  assert.equal((await owner.call('chat:history', { channel: 'geral' })).messages[0].text, 'mensagem antiga');
  const backupFile = path.join(app.dir, 'data.json.pre-0.9.1.bak');
  assert.deepEqual(JSON.parse(fs.readFileSync(backupFile, 'utf8')), seed);
  const next = (await owner.call('server:create', { name: 'Nova turma' })).id;
  const invite = await owner.call('server:invite');
  const newChannel = owner.last.channels.find((c) => c.type === 'text').id;
  await owner.call('chat:send', { channel: newChannel, text: 'histórico novo' });
  await app.restart();
  const restored = await app.connect({ token: 'test-migration-token' });
  assert.equal(restored.last.serverId, next); assert.equal(restored.last.servers.length, 2);
  assert.equal((await restored.call('server:invite')).code, invite.code);
  assert.equal((await restored.call('chat:history', { channel: newChannel })).messages[0].text, 'histórico novo');
  await restored.call('server:select', { id: original });
  assert.equal(restored.last.serverName, seed.serverName);
  assert.equal((await restored.call('chat:history', { channel: 'geral' })).messages[0].text, 'mensagem antiga');
  assert.deepEqual(JSON.parse(fs.readFileSync(backupFile, 'utf8')), seed);
  const oldLogin = await app.connect({ name: 'Dono original', password: 'senha-antiga' });
  assert.equal(oldLogin.auth.accountId, accountId);
});

test('server deletion requires its owner and name, removes only that server, and supports deleting the last server', async (t) => {
  const app = await fixture(t);
  const owner = await app.connect('Dono'); const friend = await app.connect('Amigo');
  const original = owner.last.serverId;
  const otherSocket = await app.connect({ token: owner.auth.token, serverId: original });
  const otherVoice = otherSocket.last.channels.find((c) => c.type === 'voice').id;
  await otherSocket.call('voice:join', { channel: otherVoice });
  await owner.call('friend:request', { id: friend.auth.accountId });
  await friend.call('friend:accept', { id: owner.auth.accountId });
  const dm = (await owner.call('dm:open', { userId: friend.auth.accountId })).id;
  await owner.call('chat:send', { channel: dm, text: 'conversa preservada' });
  const id = (await owner.call('server:create', { name: 'Apagar esta turma' })).id;
  const invite = await owner.call('server:invite');
  await friend.call('server:join', { code: invite.code });
  const admin = owner.last.roles.find((r) => r.perms.includes('ADMIN'));
  await owner.call('mod', { action: 'setRoles', target: friend.auth.accountId, value: [admin.id] });
  assert.match((await friend.call('server:delete', { id, name: 'Apagar esta turma' })).error, /Só o dono/);
  assert.match((await owner.call('server:delete', { id, name: 'nome errado' })).error, /nome atual/);
  assert.ok((await owner.call('server:delete', { id: original, name: 'Apagar esta turma' })).error);
  const chat = owner.last.channels.find((c) => c.type === 'text').id;
  const voice = owner.last.channels.find((c) => c.type === 'voice').id;
  const upload = await (await fetch(app.base + '/upload', { method: 'POST', headers: {
    'x-token': owner.auth.token, 'x-server-id': id, 'x-channel-id': chat, 'x-filename': 'apagar.txt',
  }, body: 'arquivo do servidor' })).json();
  assert.ok(upload.id, upload.error);
  await owner.call('chat:send', { channel: chat, text: 'apagar', attachments: [upload.id] });
  await friend.call('chat:read', { channel: chat });
  await friend.call('voice:join', { channel: voice });
  assert.ok(!(await owner.call('server:delete', { id, name: 'Apagar esta turma' })).error);
  await wait();
  assert.equal(owner.last.serverId, original); assert.equal(friend.last.serverId, original);
  assert.equal(owner.last.servers.some((s) => s.id === id), false);
  assert.ok(owner.last.voice.some((v) => v.sid === otherSocket.auth.sid), 'other server voice stays connected');
  assert.equal(owner.last.voice.some((v) => v.accountId === friend.auth.accountId), false);
  assert.equal(friend.connected, true);
  assert.equal((await fetch(app.base + '/invites/' + invite.code)).status, 404);
  assert.equal((await fetch(app.base + upload.url)).status, 404);
  assert.ok((await friend.call('server:join', { code: invite.code })).error);
  assert.ok((await owner.call('chat:history', { channel: chat })).error);
  assert.equal((await owner.call('chat:history', { channel: dm })).messages[0].text, 'conversa preservada');
  await app.restart();
  const persisted = JSON.parse(fs.readFileSync(path.join(app.dir, 'data.json'), 'utf8'));
  assert.equal(persisted.servers[id], undefined); assert.equal(persisted.messages[chat], undefined);
  assert.equal(persisted.uploads[upload.id], undefined);
  assert.equal(persisted.accounts[friend.auth.accountId].lastRead[chat], undefined);
  const loggedIn = await app.connect({ token: owner.auth.token });
  assert.equal(loggedIn.last.serverId, original);
  assert.ok(!(await loggedIn.call('server:delete', { id: original, name: loggedIn.last.serverName })).error);
  assert.equal(loggedIn.last.serverId, null); assert.deepEqual(loggedIn.last.servers, []);
  assert.equal((await (await fetch(app.base + '/config')).json()).hasOwner, true);
  const newcomer = await app.connect({ mode: 'register', name: 'Nova conta', password: '1234', confirmPassword: '1234' });
  assert.equal(newcomer.last.serverId, null);
  assert.ok((await newcomer.call('server:create', { name: 'Nova turma' })).id);
});

test('recovering a corrupt legacy database also keeps a permanent copy of the recovered data', async (t) => {
  const id = 'b'.repeat(16);
  const seed = { serverName: 'Servidor recuperado', ownerId: id, accounts: { [id]: { id, name: 'Dono', roles: [] } }, sessions: { recovery: id },
    channels: [{ id: 'geral', type: 'text', name: 'geral', allowedRoles: [] }], roles: [{ id: 'everyone', name: '@everyone', perms: [] }], messages: { geral: [] } };
  const app = await fixture(t, '', seed, true);
  const owner = await app.connect({ token: 'recovery' });
  assert.equal(owner.last.serverName, seed.serverName);
  const file = path.join(app.dir, 'data.json.pre-0.9.1.bak');
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), seed);
  await app.restart();
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), seed);
});
