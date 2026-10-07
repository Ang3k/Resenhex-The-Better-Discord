const test = require('node:test');
const assert = require('node:assert/strict');
const { correctCatalog, isAuxiliaryRow, isAuxiliaryTitle } = require('../tools/mudae-fontes/qualidade');

const row = (id, name, score) => [id, name, 'Genshin Impact', 'https://example.com/a.jpg', '', score, 'g'];

test('páginas auxiliares saem sem confundir nomes de personagens com listas', () => {
  for (const name of ["Finn's relationships", 'Bestiary', 'Journal of Justice', 'The Powerpuff Girls in other media', 'Experiments', 'War of the Visions: Final Fantasy Brave Exvius characters']) assert.ok(isAuxiliaryTitle(name), name);
  for (const name of ['The Collector', 'Raiden Shogun', 'Cloud Strife', 'Princess Bubblegum']) assert.ok(!isAuxiliaryTitle(name), name);
  assert.equal(isAuxiliaryRow(row('g1', 'Experiments', 10)), false);
  const result = correctCatalog([row('g-wiki-1', 'Bestiary', 100), row('g-wiki-2', 'Link', 20)]);
  assert.deepEqual(result.rows.map((r) => r[0]), ['g-wiki-2']);
  assert.equal(result.report.removed.length, 1);
});

test('NPC com artigo maior fica atrás dos jogáveis, sem perder IDs ou voltar no próximo processamento', () => {
  const input = [row('g-genshin-impact-10', 'Phonia', 1000000), row('g-genshin-impact-20', 'Raiden Shogun', 500), row('g-genshin-impact-30', 'Outro Jogável', 400)];
  const options = { priorityIdsByWiki: new Map([['genshin-impact', new Set(['20', '30'])]]) };
  const result = correctCatalog(input, options);
  assert.deepEqual(result.rows.map((r) => r[0]), input.map((r) => r[0]));
  assert.equal(result.rows[0][5], 0);
  assert.ok(result.rows[1][5] > result.rows[2][5]);
  assert.deepEqual(correctCatalog(result.rows, options).rows, result.rows);
});

test('sem dados da categoria, a ausência não rebaixa todos os personagens para NPC', () => {
  const result = correctCatalog([row('g-genshin-impact-10', 'Outro Personagem', 900)], {});
  assert.ok(result.rows[0][5] > 0);
  assert.equal(result.report.backgroundIds.length, 0);
});
