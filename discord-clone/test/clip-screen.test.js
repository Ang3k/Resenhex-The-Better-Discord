const test = require('node:test');
const assert = require('node:assert/strict');
const ClipScreen = require('../public/clip-screen.js');
const ClipModel = require('../public/clip-model.js');

// Rolo de 40 s a 30 fps com quadro-chave a cada 1 s.
const ring = (seconds = 40) => Array.from({ length: seconds * 30 }, (_, i) => ({ ms: i * (1000 / 30), key: i % 30 === 0 }));

test('pruneChunks: guarda a janela de 30 s começando num quadro-chave que a cobre', () => {
  const chunks = ring(40);
  const now = 40_000;
  const first = ClipScreen.pruneChunks(chunks, now);
  assert.ok(chunks[first].key);
  assert.ok(chunks[first].ms <= now - 30_000, 'cobre a janela inteira');
  assert.ok(chunks[first].ms > now - 31_000, 'não guarda mais que 1 s além do preciso');
});

test('pruneChunks: rolo curto fica inteiro; pedaços antes do primeiro quadro-chave saem', () => {
  assert.equal(ClipScreen.pruneChunks(ring(10), 10_000), 0);
  const chunks = [{ ms: 0, key: false }, { ms: 33, key: false }, { ms: 66, key: true }, { ms: 100, key: false }];
  assert.equal(ClipScreen.pruneChunks(chunks, 200), 2);
  assert.equal(ClipScreen.pruneChunks([{ ms: 0, key: false }], 200), 1);
  assert.equal(ClipScreen.pruneChunks([], 200), 0);
});

test('seekIndex: volta ao quadro-chave anterior ao instante pedido', () => {
  const chunks = ring(5).map((c) => ({ t: Math.round(c.ms) / 1000 - 1, key: c.key })); // começa em t = −1 s
  assert.equal(chunks[ClipScreen.seekIndex(chunks, 2.5)].t, 2);
  assert.equal(chunks[ClipScreen.seekIndex(chunks, 2)].t, 2);
  assert.equal(chunks[ClipScreen.seekIndex(chunks, 0)].t, 0);
  assert.equal(ClipScreen.seekIndex(chunks, -5), 0, 'antes de tudo: o primeiro quadro-chave');
});

test('fitRect: encaixa a tela inteira com faixas pretas', () => {
  assert.deepEqual(ClipScreen.fitRect(1920, 1080), { x: 0, y: 0, w: 1280, h: 720 });
  assert.deepEqual(ClipScreen.fitRect(2560, 1080), { x: 0, y: 90, w: 1280, h: 540 });
  assert.deepEqual(ClipScreen.fitRect(1080, 1920), { x: 438, y: 0, w: 405, h: 720 });
  assert.deepEqual(ClipScreen.fitRect(0, 0), { x: 0, y: 0, w: 1280, h: 720 });
});

test('stripLayout: fotos pequenas em fila no canto de baixo, sem passar da metade da largura', () => {
  const cells = ClipModel.stripLayout(4, 1280, 720);
  assert.equal(cells.length, 4);
  for (const c of cells) {
    assert.equal(c.y, cells[0].y);
    assert.ok(c.y + c.r < 720 - 8 && c.y - c.r > 720 - 110);
  }
  assert.ok(cells[1].x > cells[0].x);
  const many = ClipModel.stripLayout(12, 1280, 720);
  assert.equal(many.length, 12);
  assert.ok(many.at(-1).x + many.at(-1).r <= 1280 * 0.62, 'deixa lugar para a marca à direita');
});
