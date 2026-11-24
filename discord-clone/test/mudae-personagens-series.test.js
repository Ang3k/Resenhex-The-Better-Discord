const test = require('node:test');
const assert = require('node:assert/strict');
const { aplicarImagens, nomesParaBuscar, wikisCandidatas, paginaDe } = require('../tools/mudae-fontes/personagens-series');

const ator = 'https://image.tmdb.org/t/p/w342/ator.jpg';
const personagem = 'https://static.wikia.nocookie.net/x/images/a/ab/Personagem.png/revision/latest/scale-to-width-down/400?cb=1';

test('séries: a imagem do personagem troca a foto do ator, sem mexer em id, nome, gênero, nota e marca', () => {
  const rows = [['s1-2', 'Wanda Maximoff', 'WandaVision', ator, 'F', 100, 's', 1]];
  const r = aplicarImagens(rows, { 's1-2': personagem });
  assert.equal(r.trocadas, 1);
  assert.deepEqual(r.rows[0], ['s1-2', 'Wanda Maximoff', 'WandaVision', personagem, 'F', 100, 's', 1]);
});

test('séries: sem imagem do personagem fica a foto do ator, e outras fontes nunca são tocadas', () => {
  const rows = [['s1-3', 'Figurante', 'X', ator, '', 1, 's'], ['a1', 'Naruto', 'Naruto', 'x.png', 'M', 9, 'a']];
  const r = aplicarImagens(rows, { 'a1': personagem });
  assert.equal(r.trocadas, 0);
  assert.deepEqual(r.rows, rows);
});

test('séries: apelido entre aspas e parênteses saem na segunda tentativa de nome', () => {
  assert.deepEqual(nomesParaBuscar("Tyrion 'The Halfman' Lannister"), ["Tyrion 'The Halfman' Lannister", 'Tyrion Lannister']);
  assert.deepEqual(nomesParaBuscar('Joyce Byers'), ['Joyce Byers']);
  assert.deepEqual(nomesParaBuscar('Sam (young)'), ['Sam']);
});

test('séries: endereços prováveis da wiki vêm do nome em inglês', () => {
  assert.ok(wikisCandidatas('Breaking Bad').includes('breakingbad'));
  assert.ok(wikisCandidatas('The Big Bang Theory').includes('bigbangtheory'));
  assert.ok(wikisCandidatas('Brooklyn Nine-Nine').includes('brooklyn-nine-nine'));
});

test('séries: a página do personagem é achada pelo título, passando por normalização e redirecionamento', () => {
  const data = { query: {
    normalized: [{ from: 'scarlet witch', to: 'Scarlet witch' }],
    redirects: [{ from: 'Scarlet witch', to: 'Wanda Maximoff' }],
    pages: [{ title: 'Wanda Maximoff', original: { source: personagem } }],
  } };
  assert.equal(paginaDe(data, 'scarlet witch').title, 'Wanda Maximoff');
  assert.equal(paginaDe(data, 'Outra pessoa'), null);
});
