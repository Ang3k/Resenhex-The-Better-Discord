// Transmissão da tela do celular (app de Android): leitor de pacotes, codec do H.264 e perfis do celular.
const test = require('node:test');
const assert = require('node:assert/strict');
const screen = require('../public/android-screen');
const policy = require('../public/media-policy');

// Mesmo formato do ScreenFeed.packet (Java): cabeçalho de 16 bytes, little-endian, e o conteúdo.
function packet(type, flags, gen, time, data) {
  const out = new Uint8Array(16 + data.length);
  const view = new DataView(out.buffer);
  view.setUint8(0, type);
  view.setUint8(1, flags);
  view.setUint16(2, gen, true);
  view.setUint32(4, data.length, true);
  view.setBigInt64(8, BigInt(time), true);
  out.set(data, 16);
  return out;
}

test('sem o app de Android, a transmissão do celular fica desligada', () => {
  assert.equal(screen.available, false);
  assert.equal(screen.outdated, false);
});

test('o leitor junta pacotes cortados em qualquer ponto e separa os grudados', () => {
  const info = new TextEncoder().encode(JSON.stringify({ gen: 3, codec: 'h264', width: 1280, height: 576, fps: 30 }));
  const big = new Uint8Array(200_000).map((_, i) => i % 251);
  const stream = [
    packet(screen.TYPE.INFO, 0, 3, 1_000, info),
    packet(screen.TYPE.H264, screen.FLAG_KEY, 3, 2_000_000_123, big),
    packet(screen.TYPE.PCM, 0, 0, 2_000_010_000, new Uint8Array(1920).fill(7)),
    packet(screen.TYPE.H264, 0, 3, 2_000_033_333, new Uint8Array(0)),
  ];
  const all = new Uint8Array(stream.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of stream) { all.set(p, offset); offset += p.length; }

  for (const sizes of [[1], [7, 16, 3], [16], [4096], [all.length]]) {
    const got = [];
    const push = screen.packetParser((p) => got.push(p));
    for (let at = 0, k = 0; at < all.length; k++) {
      const size = sizes[k % sizes.length];
      push(all.subarray(at, at + size));
      at += size;
    }
    assert.equal(got.length, 4, `pedaços de ${sizes}`);
    assert.deepEqual(got.map((p) => [p.type, p.flags, p.gen, p.time, p.data.length]), [
      [1, 0, 3, 1_000, info.length], [2, 1, 3, 2_000_000_123, big.length], [4, 0, 0, 2_000_010_000, 1920], [2, 0, 3, 2_000_033_333, 0],
    ]);
    assert.deepEqual(JSON.parse(new TextDecoder().decode(got[0].data)).width, 1280);
    assert.equal(got[1].data[199_999], 199_999 % 251);
    // O conteúdo é uma cópia com memória própria: pode ser transferido para o worklet do som.
    assert.equal(got[2].data.buffer.byteLength, 1920);
  }
});

test('o leitor recusa um tamanho absurdo (fluxo corrompido)', () => {
  const push = screen.packetParser(() => {});
  const bad = packet(screen.TYPE.H264, 0, 1, 0, new Uint8Array(0));
  new DataView(bad.buffer).setUint32(4, 0x7fffffff, true);
  assert.throws(() => push(bad), /inválido/);
});

test('o codec do decodificador sai do SPS do quadro-chave (SPS + PPS + IDR em Annex B)', () => {
  const sps = [0x67, 0x42, 0xc0, 0x29, 0x8d, 0x68];
  const pps = [0x68, 0xce, 0x3c, 0x80];
  const idr = [0x65, 0x88, 0x84, 0x00, 0x00];
  const key = new Uint8Array([0, 0, 0, 1, ...sps, 0, 0, 0, 1, ...pps, 0, 0, 1, ...idr]);
  assert.deepEqual(screen.nalUnits(key).map((u) => u.type), [7, 8, 5]);
  assert.equal(screen.codecFromSps(key), 'avc1.42C029');
  // Quadro sem SPS (delta): não há codec para tirar.
  assert.equal(screen.codecFromSps(new Uint8Array([0, 0, 0, 1, 0x41, 0x9a, 0x02])), null);
  assert.equal(screen.codecFromSps(new Uint8Array([1, 2, 3])), null);
});

test('perfis do celular: só no app de Android, em H.264/VP8 e a 30 fps', () => {
  assert.deepEqual(policy.sharePresetKeys(true), ['phone720', 'phone1080']);
  assert.ok(!policy.sharePresetKeys(false).some((key) => policy.presets[key].phone));
  for (const key of policy.sharePresetKeys(true)) {
    assert.deepEqual(policy.presets[key].codecs, ['video/H264', 'video/VP8'], key);
    assert.equal(policy.presets[key].fps, 30, key);
  }
  // Perfil guardado do outro lado (o celular nunca recebe um perfil de computador, e vice-versa).
  assert.equal(policy.sharePresetFor('p1080_60', true), 'phone720');
  assert.equal(policy.sharePresetFor('phone1080', false), 'p1080_60');
  assert.equal(policy.sharePresetFor('phone1080', true), 'phone1080');
  assert.equal(policy.sharePresetFor(null, false), 'p1080_60');
});

test('celular em pé (320×720) não é reduzido de novo no envio; deitado (1280×576) também não', () => {
  const preset = policy.presets.phone720;
  const demand = policy.viewerDemand({ width: 1280, height: 720 });
  assert.equal(policy.screenEncoding(preset, 2e6, demand, { width: 320, height: 720 }).scaleResolutionDownBy, 1);
  assert.equal(policy.screenEncoding(preset, 2e6, demand, { width: 1280, height: 576 }).scaleResolutionDownBy, 1);
  assert.deepEqual(policy.screenCodecs(preset, []), ['video/H264', 'video/VP8']);
});
