const test = require('node:test');
const assert = require('node:assert/strict');
const { PNG } = require('pngjs');
const { decodeAvatar, decodeBanner } = require('../avatar');

const encoded = (image) => 'data:image/png;base64,' + image.toString('base64');
const image = () => PNG.sync.write({ width: 32, height: 32, data: Buffer.alloc(32 * 32 * 4, 255) });

test('profile picture is decoded and re-encoded as a bounded PNG', () => {
  const result = PNG.sync.read(decodeAvatar(encoded(image())));
  assert.equal(result.width, 32);
  assert.equal(result.height, 32);
  assert.equal(result.data.length, 4096);
});

test('rejects external URLs, HTML/SVG, oversized and damaged images', () => {
  for (const value of ['https://example.com/photo.png', 'data:image/svg+xml;base64,PHN2Zz4=', encoded(Buffer.from('<html>')), 'data:image/png;base64,' + 'A'.repeat(480000)]) {
    assert.throws(() => decodeAvatar(value), /Foto inválida/);
  }
  const corrupt = image();
  corrupt[35] ^= 255;
  assert.throws(() => decodeAvatar(encoded(corrupt)), /Foto inválida/);
});

test('rejects huge dimensions and interlaced images before decoding', () => {
  const huge = image();
  huge.writeUInt32BE(65535, 16);
  assert.throws(() => decodeAvatar(encoded(huge)), /Foto inválida/);
  const interlaced = image();
  interlaced[28] = 1;
  assert.throws(() => decodeAvatar(encoded(interlaced)), /Foto inválida/);
});

// GIF 1x1 mínimo e válido (1 quadro).
const TINY_GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
const bannerPng = (w = 600, h = 240) => PNG.sync.write({ width: w, height: h, data: Buffer.alloc(w * h * 4, 120) });

test('banner accepts a cropped PNG and re-encodes it', () => {
  const { ext, data } = decodeBanner(bannerPng());
  assert.equal(ext, 'png');
  const result = PNG.sync.read(data);
  assert.equal(result.width, 600);
  assert.equal(result.height, 240);
});

test('banner accepts a well-formed GIF unchanged, so the animation is kept', () => {
  const { ext, data } = decodeBanner(TINY_GIF);
  assert.equal(ext, 'gif');
  assert.ok(data.equals(TINY_GIF));
});

test('banner rejects damaged, truncated or disguised files', () => {
  for (const input of [Buffer.from('<html><script>alert(1)</script></html>'), Buffer.from('GIF89a'), Buffer.alloc(0), 'texto', null]) {
    assert.throws(() => decodeBanner(input), /Banner inválido/);
  }
  assert.throws(() => decodeBanner(TINY_GIF.subarray(0, TINY_GIF.length - 1)), /Banner inválido/); // sem o marcador de fim
  assert.throws(() => decodeBanner(Buffer.concat([TINY_GIF, Buffer.from('<script>')])), /Banner inválido/); // lixo depois do fim
  const noFrames = Buffer.concat([TINY_GIF.subarray(0, 13 + 6), Buffer.from([0x3b])]);
  assert.throws(() => decodeBanner(noFrames), /Banner inválido/);
});

test('banner rejects oversized dimensions', () => {
  const huge = Buffer.from(TINY_GIF);
  huge.writeUInt16LE(5000, 6);
  assert.throws(() => decodeBanner(huge), /Banner inválido/);
  assert.throws(() => decodeBanner(bannerPng(1200, 480)), /Banner inválido/);
});
