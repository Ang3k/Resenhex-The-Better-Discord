const test = require('node:test');
const assert = require('node:assert/strict');
const { createMudae, CLAIM_RESET_MS } = require('../server/mudae');

// Catálogo antigo (o publicado) e o novo (o publicado + muita gente mais popular, de fontes novas, e um já dono marcado "fora da roleta").
const ANTIGO = [
  [1, 'Satoru Gojou', 'Jujutsu Kaisen', 'b1-a.png', 'M', 900],
  [2, 'Mikasa Ackerman', 'Attack on Titan', 'b2-b.jpg', 'F', 800],
  [3, 'Zero Two', 'DARLING in the FRANXX', 'b3-c.jpg', 'F', 700],
  [4, 'Kyubey', 'Madoka Magica', 'b4-d.jpg', '', 600],
  [5, 'Satoru Fujinuma', 'Erased', 'b5-e.jpg', 'M', 500],
];
// Metade entra na fonte nova (v) e metade na fonte do anime (a), que muda a posição de quem já existe.
const NOVOS = Array.from({ length: 200 }, (_, i) => (i % 2
  ? [100 + i, 'Novo ' + i, 'Obra Nova ' + (i % 20), 'b' + i + '.png', 'F', 5000 - i, 'a']
  : ['vndb' + i, 'Novo ' + i, 'Obra Nova ' + (i % 20), 'https://t.vndb.org/ch/00/' + i + '.jpg', 'M', 5000 - i, 'v']));
const NOVO = [...ANTIGO.map((r) => (r[0] === 5 ? [...r, 'a', 1] : r)), ...NOVOS];

const T0 = 10 * CLAIM_RESET_MS + 1000;
const abrir = (catalog, refSize) => createMudae({ catalog, now: () => T0, random: () => 0, refSize });
const dono = () => ({ claims: { 1: { ownerId: 'u1', at: 1 }, 3: { ownerId: 'u1', at: 2 }, 5: { ownerId: 'u1', at: 3 }, 2: { ownerId: 'u2', at: 4 } }, usage: {} });

test('catálogo novo: quem já casou continua com todos, inclusive o que saiu da roleta', () => {
  const store = dono();
  const antes = JSON.stringify(store);
  const novo = abrir(NOVO, NOVO.length);
  const h = novo.harem(store, 'u1');
  assert.equal(h.total, 3);
  assert.deepEqual(h.chars.map((c) => String(c.id)).sort(), ['1', '3', '5']);
  assert.equal(JSON.stringify(store), antes, 'a troca de catálogo não mexe em nenhum casamento');
  assert.equal(novo.album(store, 'u1').total, 3);
  assert.equal(novo.harem(store, 'u2').total, 1);
});

test('catálogo novo: nome, obra e foto seguem iguais; só o valor e a raridade acompanham a nova posição', () => {
  const store = dono();
  const velho = abrir(ANTIGO, ANTIGO.length);
  const novo = abrir(NOVO, ANTIGO.length); // mesma régua de referência: o que muda é só a posição na lista maior
  for (const id of ['1', '3', '5']) {
    const a = velho.card(id);
    const b = novo.card(id);
    assert.equal(b.name, a.name);
    assert.equal(b.series, a.series);
    assert.equal(b.image, a.image);
    assert.equal(b.gender, a.gender);
  }
  // Os 200 novos são mais populares: o Satoru Gojou (era o nº 1) desce na lista, então vale menos.
  assert.ok(novo.card('1').value < velho.card('1').value, 'o valor é recalculado');
  assert.equal(novo.harem(store, 'u1').value, novo.harem(store, 'u1').chars.reduce((s, c) => s + c.value, 0));
});

test('catálogo novo: o ranking e o $im contam os personagens antigos', () => {
  const store = dono();
  const novo = abrir(NOVO, NOVO.length);
  const r = novo.ranking(store);
  assert.deepEqual(r.rows.map((x) => [x.ownerId, x.total]).sort(), [['u1', 3], ['u2', 1]]);
  assert.equal(String(novo.card('5').id), '5');
});

test('catálogo sem um id já casado esconde a carta, mas não apaga o casamento (por isso a junção recusa perder ids)', () => {
  const store = dono();
  const sem = abrir(ANTIGO.filter((r) => r[0] !== 3), 4);
  assert.equal(sem.harem(store, 'u1').total, 2);
  assert.ok(store.claims[3], 'o casamento continua guardado');
  assert.equal(abrir(ANTIGO, 5).harem(store, 'u1').total, 3, 'se o id volta, a carta volta');
});
