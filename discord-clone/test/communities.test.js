const test = require('node:test');
const assert = require('node:assert/strict');
const { communityStore } = require('../communities');
let sequence = 0;
const newId = () => String(++sequence);
const defaults = () => ({ accounts: {}, sessions: {}, roles: [{ id: 'everyone', perms: ['SEND_MESSAGES'] }], channels: [{ id: 'geral', name: 'geral', type: 'text', allowedRoles: [] }], messages: { geral: [] } });

test('legacy server migration preserves its name, channel history, roles, bans and account sessions', () => {
  const legacy = { ...defaults(), ownerId: 'a', serverName: 'Santuário Letárgico', serverIcon: 'icon.png',
    accounts: { a: { id: 'a', name: 'Ana', roles: ['mod'], serverMuted: true, timeoutUntil: 123 }, b: { id: 'b', roles: [], banned: true } },
    sessions: { token: 'a' }, messages: { geral: [{ id: 'old', text: 'histórico' }] }, categories: [{ id: 'group', name: 'Grupo', collapsed: false }] };
  const original = structuredClone(legacy);
  const store = communityStore(legacy, newId, defaults);
  assert.equal(store.current().serverName, 'Santuário Letárgico');
  assert.equal(store.current().serverIcon, 'icon.png');
  assert.deepEqual(store.root.messages, original.messages);
  assert.deepEqual(store.root.sessions, original.sessions);
  assert.equal(store.current().channels[0].id, 'geral');
  assert.deepEqual(store.db.accounts.a.roles, ['mod']);
  assert.equal(store.db.accounts.a.serverMuted, true);
  assert.equal(store.db.accounts.a.timeoutUntil, 123);
  assert.equal(store.joined('a'), true);
  assert.equal(store.choose('a'), store.currentId());
  assert.equal(store.joined('b'), false);
  assert.equal(store.membership('b').banned, true);
  assert.equal(store.root.accounts.a.roles, undefined);
  const persisted = JSON.parse(JSON.stringify(store.root));
  const reload = communityStore(persisted, newId, defaults);
  assert.equal(reload.currentId(), store.currentId());
  assert.equal(reload.current().inviteCode, store.current().inviteCode);
  assert.deepEqual(reload.root, persisted);
});

test('concurrent server contexts isolate roles and moderation while sharing profiles', async () => {
  const store = communityStore({ ...defaults(), accounts: { a: { id: 'a', name: 'Ana' }, b: { id: 'b', name: 'Beto' } } }, newId, defaults);
  const first = store.currentId();
  const second = store.create('a', 'Segundo');
  assert.notEqual(second.channels[0].id, 'geral');
  await Promise.all([
    store.run(first, async () => { await new Promise((r) => setTimeout(r, 20)); store.db.accounts.a.roles = ['moderador']; store.db.accounts.a.serverMuted = true; }),
    store.run(second.id, async () => { await new Promise((r) => setTimeout(r, 5)); store.db.accounts.a.roles = ['outro']; store.db.accounts.a.name = 'Ana global'; assert.equal(store.joined('b'), false); }),
  ]);
  assert.deepEqual(store.membership('a', first).roles, ['moderador']);
  assert.deepEqual(store.membership('a', second.id).roles, ['outro']);
  assert.equal(store.membership('a', second.id).serverMuted, undefined);
  assert.equal(store.root.accounts.a.name, 'Ana global');
  assert.equal(store.list('a').length, 2);
  store.run(null, () => { assert.deepEqual(store.db.channels, []); assert.equal(store.joined('a'), false); });
});

test('opaque invites join only their server, are idempotent, and cannot bypass bans', () => {
  const store = communityStore({ ...defaults(), accounts: { a: { id: 'a' }, b: { id: 'b' } } }, newId, defaults);
  const server = store.create('a', 'Amigos');
  assert.equal(store.byInvite(server.inviteCode), server);
  assert.equal(store.byInvite('garbage'), null);
  store.join('b', server);
  server.members.b.roles = ['custom'];
  store.join('b', server);
  assert.deepEqual(server.members.b.roles, ['custom']);
  server.members.b.banned = true;
  assert.throws(() => store.join('b', server), /banido/);
  const old = server.inviteCode;
  server.inviteCode = store.inviteCode();
  assert.equal(store.byInvite(old), undefined);
  assert.equal(store.choose('b', server.id), store.root.defaultServerId);
});

test('nicknames persist on each membership without changing the global account name', () => {
  const store = communityStore({ ...defaults(), accounts: { a: { id: 'a', name: 'Ana' } } }, newId, defaults);
  const first = store.currentId(), second = store.create('a', 'Segundo');
  store.run(first, () => { store.db.accounts.a.nickname = 'Ana da primeira turma'; });
  store.run(second.id, () => { store.db.accounts.a.nickname = 'Ana da segunda turma'; });
  const reload = communityStore(JSON.parse(JSON.stringify(store.root)), newId, defaults);
  reload.run(first, () => assert.equal(reload.db.accounts.a.nickname, 'Ana da primeira turma'));
  reload.run(second.id, () => assert.equal(reload.db.accounts.a.nickname, 'Ana da segunda turma'));
  reload.run(null, () => assert.equal(reload.db.accounts.a.nickname, false));
  assert.equal(reload.root.accounts.a.name, 'Ana');
});
