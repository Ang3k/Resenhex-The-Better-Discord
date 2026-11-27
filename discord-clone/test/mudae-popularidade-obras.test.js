const test = require('node:test');
const assert = require('node:assert/strict');
const { pesos, pesarDesenhos, notaDaPosicao, periodo } = require('../tools/mudae-fontes/popularidade-obras');
const { correctCatalog } = require('../tools/mudae-fontes/qualidade');

const pop = (wikis) => ({ expoente: 0.5, wikis: Object.fromEntries(Object.entries(wikis).map(([w, v]) => [w, { visualizacoes: v }])) });
const d = (wiki, n, nome, nota, fora) => [`d-${wiki}-${n}`, nome, wiki, 'https://example.com/a.jpg', '', nota, 'd', ...(fora === undefined ? [] : [fora])];

test('o peso é a raiz da fração das visualizações da obra mais vista; sem dado, a mediana; sem arquivo, 1', () => {
  const p = pesos(pop({ grande: 1600, media: 400, pequena: 100, sem: null }));
  assert.equal(p.de('grande'), 1);
  assert.equal(p.de('media'), 0.5);
  assert.equal(p.de('pequena'), 0.25);
  assert.equal(p.de('sem'), 0.5); // mediana
  assert.equal(p.de('desconhecida'), 0.5);
  assert.equal(pesos(null).de('grande'), 1);
});

test('com peso 1 a nota é a de sempre (1.000.000 / posição)', () => {
  assert.equal(notaDaPosicao(0), 1e6);
  assert.equal(notaDaPosicao(1), 500000);
  assert.equal(notaDaPosicao(2), 333333);
  assert.equal(notaDaPosicao(0, 0.25), 250000);
});

test('o nº 1 de uma obra pouco vista fica atrás dos primeiros de uma obra famosa, sem mudar a ordem dentro de cada obra', () => {
  const rows = [
    d('grande', 1, 'Homer', 1e6, 0), d('grande', 2, 'Bart', 500000, 0), d('grande', 3, 'Lisa', 333333, 1),
    d('pequena', 1, 'Lider pequeno', 1e6, 0), d('pequena', 2, 'Segundo pequeno', 500000, 0),
    ['g-jogo-1', 'Link', 'Zelda', 'https://example.com/a.jpg', 'M', 1e6, 'g', 0],
  ];
  const peso = pesos(pop({ grande: 1600, pequena: 100 })).de;
  const { rows: out } = pesarDesenhos(rows, peso);
  const nota = (id) => out.find((r) => r[0] === id)[5];
  assert.ok(nota('d-grande-1') > nota('d-grande-2') && nota('d-grande-2') > nota('d-grande-3'));
  assert.ok(nota('d-pequena-1') > nota('d-pequena-2'));
  assert.equal(nota('d-pequena-1'), 250000); // = o nº 4 da obra grande
  assert.ok(nota('d-grande-3') > nota('d-pequena-1'));
  // Só a nota muda: id, nome, obra, foto, gênero, fonte e a marca "fora da roleta" ficam.
  out.forEach((r, i) => { assert.deepEqual([...r.slice(0, 5), ...r.slice(6)], [...rows[i].slice(0, 5), ...rows[i].slice(6)]); });
  assert.deepEqual(out[5], rows[5], 'jogos não mudam');
  assert.deepEqual(pesarDesenhos(out, peso).rows, out, 'aplicar de novo não muda nada');
});

test('a montagem (qualidade.js) usa o mesmo peso e continua estável', () => {
  const input = [d('grande', 1, 'Homer', 900), d('grande', 2, 'Bart', 500), d('pequena', 1, 'Lider pequeno', 990)];
  const options = { excludedPeopleById: new Map(), pesoDesenho: pesos(pop({ grande: 1600, pequena: 100 })).de };
  const result = correctCatalog(input, options);
  const nota = (id) => result.rows.find((r) => r[0] === id)[5];
  assert.equal(nota('d-grande-1'), 1e6);
  assert.equal(nota('d-grande-2'), 500000);
  assert.equal(nota('d-pequena-1'), 250000);
  assert.deepEqual(correctCatalog(result.rows, options).rows, result.rows);
});

test('o período são os 10 anos fechados antes de hoje', () => {
  assert.deepEqual(periodo(new Date('2026-11-26T12:00:00Z')), { inicio: '2016110100', fim: '2026103100' });
});
