const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { reparar, escreverAtomico, anexar } = require('../tools/mudae-fontes/anilist-completo');

const dir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mudae-ckpt-'));
const row = (id) => JSON.stringify([id, 'Nome ' + id, 'Obra', 'b' + id + '.png', 'F', 5, 'a']);
const extra = (id) => JSON.stringify({ id, tipo: 'ANIME', pais: 'JP', adulto: false, formato: 'TV' });
const ler = (d, f) => fs.readFileSync(path.join(d, f), 'utf8');
const ids = (d, f) => ler(d, f).split('\n').filter(Boolean).map((l) => { const o = JSON.parse(l); return Array.isArray(o) ? o[0] : o.id; });
const montar = (d, { linhas, extras, prog }) => {
  if (linhas !== undefined) fs.writeFileSync(path.join(d, 'linhas.ndjson'), linhas);
  if (extras !== undefined) fs.writeFileSync(path.join(d, 'extras.ndjson'), extras);
  if (prog !== undefined) fs.writeFileSync(path.join(d, 'progresso.json'), prog);
};
const progresso = (proximo, aceitos) => JSON.stringify({ proximo, vazias: 0, paginas: 1, aceitos, existem: aceitos, descartados: {}, iniciadoEm: '2026-01-01T00:00:00.000Z' });

test('checkpoint: dados consistentes não mudam em nada', () => {
  const d = dir();
  montar(d, { linhas: [row(1), row(2)].join('\n') + '\n', extras: [extra(1), extra(2)].join('\n') + '\n', prog: progresso(51, 2) });
  const antes = ler(d, 'linhas.ndjson');
  const r = reparar(d);
  assert.deepEqual([r.removidas, r.linhaCortada, r.progressoRefeito, r.proximo, r.aceitos], [0, false, false, 51, 2]);
  assert.equal(ler(d, 'linhas.ndjson'), antes);
});

test('checkpoint: a linha cortada pela queda de luz é descartada, as outras ficam', () => {
  const d = dir();
  montar(d, { linhas: row(1) + '\n' + row(2) + '\n' + row(3).slice(0, 15), extras: extra(1) + '\n' + extra(2) + '\n' + extra(3).slice(0, 10), prog: progresso(51, 2) });
  const r = reparar(d);
  assert.equal(r.linhaCortada, true);
  assert.deepEqual(ids(d, 'linhas.ndjson'), [1, 2]);
  assert.deepEqual(ids(d, 'extras.ndjson'), [1, 2]);
  assert.ok(ler(d, 'linhas.ndjson').endsWith('\n'));
});

test('checkpoint: página gravada mas não confirmada no progresso é desfeita (será buscada de novo, sem duplicar)', () => {
  const d = dir();
  // Progresso diz que a próxima é a 51, mas as linhas da página 51-100 já tinham sido anexadas antes da queda.
  montar(d, { linhas: [row(1), row(2), row(51), row(52)].join('\n') + '\n', extras: [extra(1), extra(2), extra(51), extra(52)].join('\n') + '\n', prog: progresso(51, 2) });
  const r = reparar(d);
  assert.equal(r.removidas, 4);
  assert.equal(r.proximo, 51);
  assert.deepEqual(ids(d, 'linhas.ndjson'), [1, 2]);
  assert.deepEqual(ids(d, 'extras.ndjson'), [1, 2]);
});

test('checkpoint: queda entre a gravação de linhas e de extras volta o progresso para a página do id solto', () => {
  const d = dir();
  // Progresso avançou (101), mas o id 80 só existe em linhas: a página 51 inteira precisa ser refeita.
  montar(d, { linhas: [row(1), row(60), row(80)].join('\n') + '\n', extras: [extra(1), extra(60)].join('\n') + '\n', prog: progresso(101, 3) });
  const r = reparar(d);
  assert.equal(r.proximo, 51);
  assert.deepEqual(ids(d, 'linhas.ndjson'), [1]);
  assert.deepEqual(ids(d, 'extras.ndjson'), [1]);
  assert.equal(JSON.parse(ler(d, 'progresso.json')).proximo, 51);
});

test('checkpoint: progresso corrompido ou ausente é refeito a partir dos dados', () => {
  for (const prog of ['{"proximo": 5', undefined, '']) {
    const d = dir();
    montar(d, { linhas: [row(1), row(75)].join('\n') + '\n', extras: [extra(1), extra(75)].join('\n') + '\n', prog });
    const r = reparar(d);
    assert.equal(r.progressoRefeito, true, String(prog));
    // A última página (51-100) é refeita por segurança: o 75 sai e será buscado de novo.
    assert.equal(r.proximo, 51);
    assert.deepEqual(ids(d, 'linhas.ndjson'), [1]);
    assert.equal(JSON.parse(ler(d, 'progresso.json')).aceitos, 1);
  }
});

test('checkpoint: pasta vazia começa do id 1 e ids repetidos não passam', () => {
  const d = dir();
  assert.equal(reparar(d).proximo, 1);
  montar(d, { linhas: [row(1), row(1), row(2)].join('\n') + '\n', extras: [extra(1), extra(1), extra(2)].join('\n') + '\n', prog: progresso(51, 3) });
  reparar(d);
  assert.deepEqual(ids(d, 'linhas.ndjson'), [1, 2]);
  assert.deepEqual(ids(d, 'extras.ndjson'), [1, 2]);
});

test('checkpoint: gravação atômica não deixa arquivo temporário e troca o conteúdo inteiro', () => {
  const d = dir();
  const f = path.join(d, 'progresso.json');
  escreverAtomico(f, 'um');
  escreverAtomico(f, 'dois');
  assert.equal(fs.readFileSync(f, 'utf8'), 'dois');
  assert.deepEqual(fs.readdirSync(d), ['progresso.json']);
  anexar(f, '+3');
  assert.equal(fs.readFileSync(f, 'utf8'), 'dois+3');
});
