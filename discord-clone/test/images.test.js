const test = require('node:test');
const assert = require('node:assert/strict');
const wt = require('node:worker_threads');
const { PNG } = require('pngjs');

// Conta os workers vivos (o createImages usa o Worker de worker_threads).
const alive = new Set();
const Original = wt.Worker;
wt.Worker = class extends Original {
  constructor(...args) {
    super(...args);
    alive.add(this);
    this.on('exit', () => alive.delete(this));
  }
};
const { createImages } = require('../server/images');

const png = new PNG({ width: 32, height: 32 });
png.data.fill(180);
const dataUrl = 'data:image/png;base64,' + PNG.sync.write(png).toString('base64');
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('worker de imagens: fecha depois de um tempo parado e o próximo pedido sobe outro', async () => {
  const logs = [];
  const images = createImages({ idleMs: 200, log: (m) => logs.push(m) });
  const first = await images.decode('avatar', dataUrl);
  assert.equal(first.ext, 'png');
  assert.equal(alive.size, 1);
  // Pedidos seguidos usam o mesmo worker.
  await wait(80);
  await Promise.all([images.decode('avatar', dataUrl), images.decode('avatar', dataUrl)]);
  assert.equal(alive.size, 1);
  // Parado: fecha sozinho, sem aviso no log.
  await wait(500);
  assert.equal(alive.size, 0);
  const again = await images.decode('avatar', dataUrl);
  assert.equal(again.hash, first.hash);
  assert.equal(alive.size, 1);
  await assert.rejects(images.decode('avatar', 'data:image/png;base64,xxxx'));
  images.close();
  await wait(100);
  assert.equal(alive.size, 0);
  assert.deepEqual(logs, []);
});
