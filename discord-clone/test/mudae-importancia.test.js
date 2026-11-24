const test = require('node:test');
const assert = require('node:assert/strict');
const { classificar, marcarFiguracao } = require('../tools/mudae-fontes/importancia');

const obra = (n, f, nome, score0 = 1000) => Array.from({ length: n }, (_, i) => [f + nome + i, 'P' + i, nome, 'x.png', 'F', Math.max(0, score0 - i * 10), f]);

test('importância: o elenco principal de cada obra nunca sai, mesmo com score 0', () => {
  const rows = obra(5, 'a', 'Obra pequena', 0);
  assert.deepEqual(classificar(rows), [null, null, null, null, null]);
});

test('importância: AniList sem favoritos fora do elenco principal sai; com favoritos fica', () => {
  const rows = obra(12, 'a', 'Obra A', 40); // scores 40,30,20,10,0,0...
  const m = classificar(rows);
  assert.equal(m.filter(Boolean).length, 4); // 12 personagens, 8 ficam pelo piso, os outros 4 têm score 0
  assert.ok(rows.every((r, i) => !m[i] || r[5] === 0));
  const mais = obra(12, 'a', 'Obra B', 4000);
  assert.equal(classificar(mais).filter(Boolean).length, 0);
});

test('importância: obra gigante é cortada no teto, pela popularidade', () => {
  const rows = obra(3000, 'g', 'Saga enorme', 100000);
  const m = classificar(rows);
  assert.equal(m[2499], null);
  assert.equal(m[2500], 'alem-do-teto');
});

test('importância: marca só com 1 na 8ª coluna, não apaga ids e não desfaz o que já estava fora', () => {
  const rows = obra(12, 'a', 'Obra A', 40);
  rows[0] = [...rows[0], 1];
  const { rows: out, report } = marcarFiguracao(rows);
  assert.equal(out.length, rows.length);
  assert.deepEqual(out.map((r) => r[0]), rows.map((r) => r[0]));
  assert.equal(out[0][7], 1);
  assert.equal(out.filter((r) => r[7] === 1).length, 5); // o que já estava fora + 4 figurantes
  assert.equal(report.motivos['score-baixo'] >= 1, true);
});

test('importância: fonte sem regra (letra desconhecida) fica como está', () => {
  assert.deepEqual(classificar(obra(50, 'z', 'X', 0)).filter(Boolean), []);
});

test('importância: páginas de tipo ou de grupo das wikis saem, mesmo no elenco principal; nomes reais ficam', () => {
  const { nomeGenerico } = require('../tools/mudae-fontes/importancia');
  const g = (nome, obra = 'Doom', f = 'g') => [nome + obra, nome, obra, 'x.png', '', 999999, f];
  for (const nome of ['Monster', 'Boss', 'Marine', "Doom's protagonists", 'Blacklight Animatronics', 'MAP31: Wolfenstein', 'Slimes', 'Gordo Slimes', 'Season 9', 'The Alley Cat Gang', 'Companions']) {
    assert.equal(nomeGenerico(g(nome)), true, nome);
  }
  for (const nome of ['Doom Slayer', 'Doom Marine', 'Samuel Hayden', 'Pink Slime', 'Beatrix LeBeau', 'Freddy Fazbear', 'Marine Corps Sam', 'Kirby', 'Spyro']) {
    assert.equal(nomeGenerico(g(nome, nome === 'Kirby' ? 'Kirby' : 'Doom')), false, nome);
  }
  // No AniList e no VNDB "Monster" pode ser o nome de um personagem de verdade.
  assert.equal(nomeGenerico(g('Monster', 'Naruto', 'a')), false);
  assert.equal(nomeGenerico(g('Monster', 'Naruto', 'v')), false);
  const m = classificar([g('Monster'), g('Doom Slayer')]);
  assert.deepEqual(m, ['nome-generico', null]);
});
