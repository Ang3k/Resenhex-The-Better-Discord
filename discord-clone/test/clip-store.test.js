const test = require('node:test');
const assert = require('node:assert/strict');
const { createClipStore, CLIP_TTL_MS, TOKEN_TTL_MS } = require('../server/clip-store');

function setup({ servers = new Set(['s1']) } = {}) {
  let clock = 1_000_000, seq = 0;
  const root = {};
  const store = createClipStore({ root, now: () => clock, randomId: () => 'id' + (++seq), serverExists: (id) => servers.has(id) });
  const clip = store.add({ file: 'clips/a.mp4', voice: 'v1', serverId: 's1', creatorId: 'a', duration: 15.2, channelName: 'Sala 1', recipients: ['a', 'b'], thumb: 'data:image/jpeg;base64,AA' });
  return { root, store, clip, advance: (ms) => { clock += ms; }, servers };
}

test('só destinatários veem e recebem token', () => {
  const { store, clip } = setup();
  assert.deepEqual(store.listFor('b', 'v1').map((c) => c.id), [clip.id]);
  assert.deepEqual(store.listFor('z', 'v1'), []);
  assert.deepEqual(store.listFor('b', 'outra-sala'), []);
  assert.equal(store.issueToken(clip.id, 'z'), null);
  assert.equal(store.issueToken('nao-existe', 'b'), null);
  assert.equal(typeof store.issueToken(clip.id, 'b'), 'string');
});

test('token vale até 3 vezes e por 2 minutos', () => {
  const { store, clip, advance } = setup();
  const t = store.issueToken(clip.id, 'b');
  // O app de Android lê o link no WebView antes de passar o download ao navegador: o mesmo link é aberto duas vezes.
  for (let i = 0; i < 3; i++) assert.equal(store.consumeToken(clip.id, t)?.id, clip.id, `uso ${i + 1}`);
  assert.equal(store.consumeToken(clip.id, t), null);
  const late = store.issueToken(clip.id, 'b');
  advance(TOKEN_TTL_MS + 1);
  assert.equal(store.consumeToken(clip.id, late), null);
  const other = store.issueToken(clip.id, 'b');
  assert.equal(store.consumeToken('id-errado', other), null, 'token de um clipe não abre outro');
});

test('clipes somem após 24 h e quando o servidor some', () => {
  const a = setup();
  a.advance(CLIP_TTL_MS - 1);
  assert.deepEqual(a.store.prune(), []);
  a.advance(2);
  assert.deepEqual(a.store.prune(), ['clips/a.mp4']);
  assert.deepEqual(a.root.clips, {});
  const b = setup();
  b.servers.delete('s1');
  assert.deepEqual(b.store.prune(), ['clips/a.mp4']);
  assert.deepEqual(b.root.clips, {});
});

test('a visão pública não expõe o arquivo', () => {
  const { store, clip } = setup();
  const view = store.publicView(clip);
  assert.equal('file' in view, false);
  assert.equal('recipients' in view, false);
  assert.deepEqual(Object.keys(view).sort(), ['channelName', 'createdAt', 'creatorId', 'duration', 'id', 'thumb']);
});
