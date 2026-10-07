const test = require('node:test');
const assert = require('node:assert/strict');
const { cleanGif } = require('../gifs');

const base = 'https://static.klipy.com/ii/935d7ab9d8c6202580a668421940ec81/14/af/';
const good = { slug: 'gato-dancando-123', title: 'Gato dançando', url: base + 'um0L4dFH.gif', webp: base + 'eUbp2uNc.webp', width: 320, height: 240 };

test('cleanGif: guarda só os campos conhecidos de um GIF do KLIPY', () => {
  assert.deepEqual(cleanGif({ ...good, extra: 'x' }), good);
  // webp é opcional; título vira texto curto.
  const { webp, ...semWebp } = good;
  assert.deepEqual(cleanGif({ ...semWebp, title: 'a'.repeat(500) }), { ...semWebp, title: 'a'.repeat(120) });
  assert.equal(cleanGif({ ...good, url: 'https://static2.klipy.com/x.gif', webp: undefined }).url, 'https://static2.klipy.com/x.gif');
});

test('cleanGif: recusa links de fora do KLIPY e tamanhos estranhos', () => {
  for (const url of ['http://static.klipy.com/a.gif', 'https://evil.com/a.gif', 'https://static.klipy.com.evil.com/a.gif',
    'https://evil.com/?https://static.klipy.com/a.gif', 'javascript:alert(1)', 'https://klipy.com/a.gif', 42, undefined]) {
    assert.throws(() => cleanGif({ ...good, url }), /GIF inválido/, String(url));
  }
  assert.throws(() => cleanGif({ ...good, webp: 'https://evil.com/a.webp' }), /GIF inválido/);
  for (const width of [0, -1, 1.5, 5000, '320']) assert.throws(() => cleanGif({ ...good, width }), /GIF inválido/);
  assert.throws(() => cleanGif({ ...good, slug: '../x' }), /GIF inválido/);
  assert.throws(() => cleanGif({ ...good, url: base + 'a'.repeat(600) + '.gif' }), /GIF inválido/);
  assert.throws(() => cleanGif(null), /GIF inválido/);
});
