const test = require('node:test');
const assert = require('node:assert/strict');
const { PNG } = require('pngjs');
const { decodeAvatar } = require('../avatar');

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
