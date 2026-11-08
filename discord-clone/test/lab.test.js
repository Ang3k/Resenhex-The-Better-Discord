// Laboratório da transmissão do celular (server/lab.js): ligar, nome do teste, amostras gravadas e limites.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createLab, MAX_ON_MS } = require('../server/lab');

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'resenhex-lab-'));
  let clock = Date.parse('2026-11-08T12:00:00Z');
  const lab = createLab({ dir, now: () => clock, log: { warn() {} } });
  return { lab, dir, tick: (ms) => { clock += ms; } };
}
const flush = (lab) => new Promise((resolve) => { lab.close(); setTimeout(resolve, 50); });
const readLines = (dir) => fs.readFileSync(path.join(dir, 'tela-2026-11-08.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));

test('desligado, nenhuma amostra é gravada e as páginas recebem só on: false', () => {
  const { lab } = setup();
  assert.equal(lab.active(), false);
  assert.deepEqual(lab.client(), { on: false });
  assert.equal(lab.write('abc', { phone: { pk: 30 } }), false);
});

test('ligar abre um teste novo; trocar o nome ou a variação abre outro', () => {
  const { lab } = setup();
  const before = lab.version;
  const on = lab.set({ on: true, mode: 'tela', content: 'mexendo' });
  assert.equal(on.on, true);
  assert.equal(on.run, 1);
  assert.ok(lab.version > before);
  assert.deepEqual(lab.client(), { on: true, run: 1, lagRule: true, codec: 'auto', capture: 'h264' });
  assert.equal(lab.set({ mode: 'app' }).run, 2);
  assert.equal(lab.set({ lagRule: false, codec: 'vp8' }).run, 3);
  assert.equal(lab.client().lagRule, false);
  // Sem mudança nenhuma, o teste continua o mesmo.
  assert.equal(lab.set({ mode: 'app' }).run, 3);
  assert.throws(() => lab.set({ codec: 'av1' }), /Opção inválida/);
  assert.throws(() => lab.set({ mode: 'outro' }), /Opção inválida/);
});

test('cada amostra vira uma linha com o teste, o nome e as variações; uma por segundo por conexão', async () => {
  const { lab, dir, tick } = setup();
  lab.set({ on: true, mode: 'tela', content: 'mexendo' });
  assert.equal(lab.write('sid-telefone-1', { role: 'phone', phone: { pk: 29 } }, { owner: true }), true);
  tick(300);
  assert.equal(lab.write('sid-telefone-1', { role: 'phone', phone: { pk: 31 } }), false, 'rápido demais');
  assert.equal(lab.write('sid-pc-2', { role: 'viewer', in: [{ fps: 24 }] }), true, 'outra conexão');
  tick(800);
  assert.equal(lab.write('sid-telefone-1', { role: 'phone', phone: { pk: 30 } }), true);
  assert.equal(lab.write('sid-pc-2', ['lista']), false, 'só objetos');
  assert.equal(lab.write('sid-pc-3', { big: 'x'.repeat(20_000) }), false, 'grande demais');
  assert.equal(lab.view().written, 3);
  await flush(lab);
  const lines = readLines(dir);
  assert.equal(lines.length, 3);
  assert.deepEqual([lines[0].run, lines[0].mode, lines[0].content, lines[0].lagRule, lines[0].codec, lines[0].capture], [1, 'tela', 'mexendo', true, 'auto', 'h264']);
  assert.equal(lines[0].sid, 'sid-te');
  assert.equal(lines[0].owner, true);
  assert.equal(lines[0].sample.phone.pk, 29);
  assert.equal(lines[1].sample.in[0].fps, 24);
});

test('desliga sozinho depois de 2 h, e ligar de novo avisa as páginas', () => {
  const { lab, tick } = setup();
  lab.set({ on: true });
  const version = lab.version;
  tick(MAX_ON_MS - 1000);
  assert.equal(lab.expire(), false);
  assert.equal(lab.active(), true);
  tick(2000);
  assert.equal(lab.active(), false);
  assert.equal(lab.write('abc', { phone: {} }), false);
  assert.equal(lab.expire(), true);
  assert.ok(lab.version > version);
  assert.equal(lab.expire(), false, 'só uma vez');
  const again = lab.set({ on: true });
  assert.equal(again.on, true);
  assert.equal(again.run, 2);
});
