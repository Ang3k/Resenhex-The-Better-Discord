const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { AccessToken, TokenVerifier, TrackSource } = require('livekit-server-sdk');
const { mediaSfu, roomName } = require('../media-sfu');
const env = { LIVEKIT_URL: 'ws://127.0.0.1:7880', LIVEKIT_API_KEY: 'unit-key', LIVEKIT_API_SECRET: 'unit-secret-123456789012345678901234' };

test('SFU tokens isolate servers, carry authenticated identity, expire, and restrict sources', async () => {
  const members = new Map([['socket', { server: 'a', channel: 'voice', speak: true, stream: false }]]);
  const media = mediaSfu({ env, membership: (sid) => members.get(sid), service: { async createRoom() {} } });
  await assert.rejects(media.credentials('outsider'), /Entre em uma chamada/);
  const credential = await media.credentials('socket');
  const claims = await new TokenVerifier(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET).verify(credential.token);
  assert.equal(claims.sub, 'socket');
  assert.equal(claims.video.room, roomName('a', 'voice'));
  assert.deepEqual(claims.video.canPublishSources, ['microphone']);
  assert.equal(claims.video.canPublishData, false);
  assert.ok(claims.exp - claims.nbf <= 60);
  assert.notEqual(roomName('a', 'voice'), roomName('b', 'voice'));
  assert.notEqual(roomName(null, 'voice'), roomName('a', 'voice'));
  members.get('socket').speak = false;
  const listener = await new TokenVerifier(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET).verify((await media.credentials('socket')).token);
  assert.equal(listener.video.canPublish, false);
});

test('moderation updates permissions, mutes existing forbidden tracks, and removes leavers in order', async () => {
  let member = { server: 'a', channel: 'voice', speak: false, stream: false, deafened: true };
  const actions = [];
  const service = { async createRoom() {}, async updateParticipant(room, sid, options) { actions.push(['permissions', options.permission]); return { tracks: [{ sid: 'mic', source: TrackSource.MICROPHONE }, { sid: 'screen', source: TrackSource.SCREEN_SHARE }] }; }, async mutePublishedTrack(...args) { actions.push(['mute', ...args]); }, async removeParticipant(...args) { actions.push(['remove', ...args]); } };
  const media = mediaSfu({ env, membership: () => member, service });
  await media.credentials('socket');
  await media.sync('socket');
  assert.equal(actions[0][1].canPublish, false);
  assert.equal(actions[0][1].canSubscribe, false);
  assert.deepEqual(actions.filter((a) => a[0] === 'mute').map((a) => a[3]), ['mic', 'screen']);
  await media.sync('socket');
  assert.equal(actions.length, 3, 'unchanged state does not issue redundant API calls');
  member = { ...member, speak: true, stream: true, deafened: false };
  await media.sync('socket');
  assert.ok(actions.at(-1)[1].canPublishSources.includes(TrackSource.MICROPHONE));
  assert.ok(!actions.some((a) => a[0] === 'mute' && a[4] === false), 'LiveKit refuses remote unmute; the client restores its own tracks');
  await media.leave('socket', 'a', 'voice');
  assert.deepEqual(actions.at(-1), ['remove', roomName('a', 'voice'), 'socket']);
});

test('signed webhooks reject stale room membership and reject unsigned or modified events', async () => {
  const removed = [];
  const media = mediaSfu({ env, membership: () => null, service: { async removeParticipant(...args) { removed.push(args); } } });
  const body = JSON.stringify({ event: 'participant_joined', room: { name: 'old-room' }, participant: { identity: 'old-socket' } });
  const token = new AccessToken(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET);
  token.sha256 = createHash('sha256').update(body).digest('base64');
  const jwt = await token.toJwt();
  await assert.rejects(media.webhook(body, undefined));
  await assert.rejects(media.webhook(body + ' ', jwt));
  await media.webhook(body, jwt);
  assert.deepEqual(removed, [['old-room', 'old-socket']]);
});

test('missing SFU configuration preserves explicit P2P rollback; incomplete credentials fail closed', async () => {
  const media = mediaSfu({ env: {}, membership: () => null });
  assert.equal(media.enabled, false);
  assert.deepEqual(await media.credentials('any'), { transport: 'p2p' });
  assert.throws(() => mediaSfu({ env: { LIVEKIT_URL: 'wss://sfu.test' }, membership: () => null }), /API key and secret/);
});

test('rejoining the same room waits for removal of the previous media connection', async () => {
  let completeRemoval, issued = false;
  const service = { removeParticipant: () => new Promise((resolve) => { completeRemoval = resolve; }), async createRoom() {} };
  const media = mediaSfu({ env, service, membership: () => ({ server: 'a', channel: 'voice', speak: true, stream: true }) });
  await media.credentials('earlier');
  const removal = media.leave('socket', 'a', 'voice');
  const credential = media.credentials('socket').then((result) => { issued = true; return result; });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(issued, false);
  completeRemoval(); await removal;
  assert.equal((await credential).transport, 'sfu');
});

test('LiveKit outage moves occupied rooms to P2P and new calls return to the SFU only after the room empties', async () => {
  let up = true;
  const switched = [], member = { server: 'a', channel: 'voice', speak: true, stream: true };
  const service = { async createRoom() { if (!up) throw new Error('down'); }, async listRooms() { if (!up) throw new Error('down'); return []; }, async updateParticipant() { return { tracks: [] }; }, async removeParticipant() {} };
  const media = mediaSfu({ env: { ...env, LIVEKIT_HEALTH_MS: '0' }, service, membership: () => member, onSwitch: (...args) => switched.push(args), log: () => {} });
  assert.equal((await media.credentials('one')).transport, 'sfu');
  assert.equal(media.allowsP2p('a', 'voice'), false);
  up = false; await media.check();
  assert.deepEqual(switched, [['a', 'voice', 'p2p']]);
  assert.equal(media.allowsP2p('a', 'voice'), true);
  assert.equal((await media.credentials('two')).transport, 'p2p', 'the room keeps one transport');
  up = true; await media.check();
  assert.equal((await media.credentials('three')).transport, 'p2p', 'no mid-call switch back');
  media.vacate('a', 'voice');
  assert.equal((await media.credentials('four')).transport, 'sfu');
});

test('a failed room creation falls back to P2P immediately instead of blocking the call', async () => {
  const switched = [];
  const media = mediaSfu({ env: { ...env, LIVEKIT_HEALTH_MS: '0' }, service: { async createRoom() { throw new Error('timeout'); } }, membership: () => ({ server: 'b', channel: 'voice', speak: true, stream: true }), onSwitch: (...args) => switched.push(args), log: () => {} });
  assert.equal((await media.credentials('one')).transport, 'p2p');
  assert.deepEqual(switched, [['b', 'voice', 'p2p']]);
  assert.equal(media.allowsP2p('b', 'voice'), true);
});

test('a client that cannot reach the SFU moves only its own room to P2P', async () => {
  const switched = [];
  const members = { one: { server: 'a', channel: 'voice', speak: true, stream: true }, other: { server: 'a', channel: 'other', speak: true, stream: true } };
  const media = mediaSfu({ env: { ...env, LIVEKIT_HEALTH_MS: '0' }, service: { async createRoom() {} }, membership: (sid) => members[sid], onSwitch: (...args) => switched.push(args), log: () => {} });
  assert.equal((await media.credentials('one')).transport, 'sfu');
  assert.equal((await media.credentials('one', { fallback: true })).transport, 'p2p');
  assert.deepEqual(switched, [['a', 'voice', 'p2p']]);
  assert.equal((await media.credentials('other')).transport, 'sfu');
});
