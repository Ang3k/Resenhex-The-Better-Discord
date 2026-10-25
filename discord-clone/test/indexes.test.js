const test = require('node:test');
const assert = require('node:assert/strict');
const { Online } = require('../server/online');
const { socialStore } = require('../server/social');
const { communityStore } = require('../server/communities');

const ids = (set) => [...set].sort();

test('the online index follows each session as it switches servers, joins calls and disconnects', () => {
  const online = new Online();
  online.set('s1', { accountId: 'a', serverId: 'x', voice: null, voiceServerId: null });
  online.set('s2', { accountId: 'a', serverId: 'y', voice: null, voiceServerId: null });
  online.set('s3', { accountId: 'b', serverId: 'x', voice: null, voiceServerId: null });
  assert.deepEqual(ids(online.sidsOf('a')), ['s1', 's2']);
  assert.deepEqual(ids(online.viewers('x')), ['s1', 's3']);
  assert.equal(online.accounts.size, 2);

  // Entra na chamada de outro servidor, na ordem em que o server.js escreve os campos.
  const s1 = online.get('s1');
  s1.voice = 'sala';
  s1.voiceServerId = 'y';
  assert.deepEqual(ids(online.inRoom('sala')), ['s1']);
  assert.deepEqual(ids(online.inCalls('y')), ['s1']);
  assert.deepEqual(ids(online.inCalls('x')), []);
  assert.deepEqual(ids(online.viewers('x')), ['s1', 's3']);

  // Troca o servidor da tela sem sair da chamada; Object.assign passa pelos mesmos setters.
  Object.assign(s1, { serverId: 'z' });
  assert.deepEqual(ids(online.viewers('x')), ['s3']);
  assert.deepEqual(ids(online.viewers('z')), ['s1']);
  assert.deepEqual(ids(online.inCalls('y')), ['s1']);

  // Chamada privada: sala sem servidor.
  const s3 = online.get('s3');
  s3.voice = 'dm-a-b';
  assert.deepEqual(ids(online.inRoom('dm-a-b')), ['s3']);
  assert.equal(online.calling.has(null), false);

  s1.voice = null;
  s1.voiceServerId = null;
  assert.equal(online.rooms.has('sala'), false);
  assert.equal(online.calling.has('y'), false);

  online.delete('s1');
  online.delete('s2');
  assert.deepEqual(ids(online.sidsOf('a')), []);
  assert.equal(online.accounts.has('a'), false);
  assert.equal(online.viewing.has('z'), false);
  assert.equal(online.accounts.size, 1);
});

test('the social index matches the stored friendships, conversations and blocks', () => {
  const db = {
    friendships: { 'a-b': { status: 'friends', from: 'a', ts: 1 }, 'a-c': { status: 'pending', from: 'c', ts: 1 } },
    dms: { 'dm-a-b': { id: 'dm-a-b', users: ['a', 'b'], closed: {} } },
    blocks: { d: ['a'] },
  };
  const social = socialStore(db);
  assert.deepEqual(ids(social.relatedTo('a')), ['b', 'c']);
  assert.deepEqual(ids(social.dmIdsOf('b')), ['dm-a-b']);
  assert.deepEqual(ids(social.blockersOf('a')), ['d']);

  social.removeFriendship('a', 'c');
  social.setFriendship('a', 'e', { status: 'pending', from: 'a', ts: 2 });
  social.addDm({ id: 'dm-a-e', users: ['a', 'e'], closed: {} });
  social.block('b', 'a');
  social.unblock('d', 'a');
  assert.deepEqual(ids(social.relatedTo('a')), ['b', 'e']);
  assert.deepEqual(ids(social.relatedTo('c')), []);
  assert.equal(db.friendships['a-c'], undefined);
  assert.deepEqual(ids(social.dmIdsOf('a')), ['dm-a-b', 'dm-a-e']);
  assert.deepEqual(ids(social.blockersOf('a')), ['b']);
  assert.equal(db.blocks.d, undefined);
  assert.deepEqual(db.blocks.b, ['a']);
});

test('member servers come in creation order and leave the list when the server is deleted', () => {
  let n = 0;
  const newId = () => 'id' + n++;
  const template = () => ({ roles: [{ id: 'everyone', name: '@everyone', perms: [] }], channels: [{ name: 'geral', type: 'text' }] });
  const first = 'inicial';
  const root = {
    accounts: { a: { id: 'a', name: 'a' }, b: { id: 'b', name: 'b' } },
    servers: { [first]: { id: first, ownerId: 'a', serverName: 'inicial', roles: template().roles, channels: [], categories: [], members: { a: { active: true, roles: [] } } } },
    defaultServerId: first,
  };
  const c = communityStore(root, newId, template);
  const second = c.create('a', 'segundo');
  const third = c.create('b', 'terceiro');
  c.join('a', third);
  assert.deepEqual(c.memberServers('a'), [first, second.id, third.id]);
  assert.deepEqual(c.list('a').map((s) => s.id), [first, second.id, third.id]);
  c.drop(second.id);
  assert.equal(root.servers[second.id], undefined);
  assert.deepEqual(c.memberServers('a'), [first, third.id]);
});
