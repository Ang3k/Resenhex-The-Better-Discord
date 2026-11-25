// Cuidar do harém: flags, notas ($note, $fn), ordem guardada ($sortmarry) e divórcio em lote.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createMudae, parse, CLAIM_RESET_MS } = require('../server/mudae');
const { parseFlags } = require('../server/mudae-flags');
const { DIVORCE_CAP } = require('../server/mudae-regras');

const CATALOG = [
  [1, 'Satoru Gojou', 'Jujutsu Kaisen', 'b1-a.png', 'M', 900],
  [2, 'Mikasa Ackerman', 'Attack on Titan', 'b2-b.jpg', 'F', 800],
  [3, 'Zero Two', 'DARLING in the FRANXX', 'b3-c.jpg', 'F', 700],
  [4, 'Kyubey', 'Madoka Magica', 'b4-d.jpg', '', 600],
  [5, 'Satoru Fujinuma', 'Erased', 'b5-e.jpg', 'M', 500],
  [6, 'Eren Yeager', 'Attack on Titan', 'b6-f.jpg', 'M', 400],
  ['g1', 'Link', 'Zelda', 'https://images.igdb.com/1.jpg', 'M', 300, 'g'],
];

// Uma pessoa com o harém inteiro (cada casamento numa janela nova).
function setup({ mine = [1, 2, 3, 4, 5, 6, 'g1'] } = {}) {
  let t = 10 * CLAIM_RESET_MS + 1000;
  const mudae = createMudae({ catalog: CATALOG, now: () => t, random: () => 0, refSize: CATALOG.length });
  const store = { claims: {}, usage: {} };
  for (const id of mine) { t += CLAIM_RESET_MS; mudae.claim(store, 'a', id, { revealAt: t }); }
  const marry = (id, who = 'a') => { t += CLAIM_RESET_MS; mudae.claim(store, who, id, { revealAt: t }); };
  return { mudae, store, marry, tools: mudae.haremTools, advance: (ms) => { t += ms; } };
}
const names = (mudae, store, flags, sort) => mudae.harem(store, 'a', sort, flags).chars.map((c) => c.name);

test('parseFlags: gênero, fonte, ordem e o que sobra', () => {
  assert.deepEqual(parseFlags('w anime'), { gender: 'F', source: 'a', order: '', reverse: false, rest: '' });
  assert.deepEqual(parseFlags('Husbandos JOGOS abc inverso'), { gender: 'M', source: 'g', order: 'name', reverse: true, rest: '' });
  assert.equal(parseFlags('g-').source, 'a', '"g-" é o só animanga do original');
  assert.equal(parseFlags('Attack on Titan').rest, 'attack on titan', 'o resto sai sem acento nem maiúscula, como a busca de obra quer');
  assert.equal(parseFlags('r').order, 'value');
  assert.equal(parseFlags('').rest, '');
});

test('parse: comandos novos de harém existem e não rodam personagem', () => {
  for (const [text, cmd] of [['$note Gojo $ oi', 'note'], ['$n Gojo $ oi', 'note'], ['$fn oi', 'fn'], ['$sm abc', 'sortmarry'], ['$divorceall', 'divorceall'],
    ['$divorceseries Naruto', 'divorceseries'], ['$divorcepage 2', 'divorcepage'], ['$confirmar', 'confirm'], ['$cancelar', 'cancel']]) {
    assert.equal(parse(text)?.cmd, cmd, text);
  }
});

test('$mm com flags: filtra por gênero, fonte e obra, e ordena', () => {
  const { mudae, store } = setup();
  assert.equal(mudae.harem(store, 'a').total, 7);
  const waifus = mudae.harem(store, 'a', 'value', 'w');
  assert.deepEqual(waifus.chars.map((c) => c.name).sort(), ['Mikasa Ackerman', 'Zero Two']);
  assert.equal(waifus.total, 2);
  assert.equal(waifus.all, 7);
  assert.ok(waifus.filtered);
  assert.deepEqual(names(mudae, store, 'jogos'), ['Link']);
  assert.deepEqual(names(mudae, store, 'Attack on Titan').sort(), ['Eren Yeager', 'Mikasa Ackerman']);
  assert.deepEqual(names(mudae, store, 'husbandos anime abc'), ['Eren Yeager', 'Satoru Fujinuma', 'Satoru Gojou']);
  assert.deepEqual(names(mudae, store, 'h anime abc inverso'), ['Satoru Gojou', 'Satoru Fujinuma', 'Eren Yeager']);
  assert.deepEqual(mudae.harem(store, 'a', 'value', 'quadrinhos').chars, [], 'filtro sem ninguém dá lista vazia');
  assert.deepEqual(mudae.harem(store, 'a').chars.length, 7, 'sem flags, nada muda');
});

test('$note: guarda, mostra no harém e no álbum, troca e apaga', () => {
  const { mudae, store, tools } = setup();
  const r = tools.note(store, 'a', 'char', 'Gojo $ meu   favorito\n de todos');
  assert.equal(r.count, 1);
  assert.equal(r.text, 'meu favorito de todos', 'espaços e quebras viram um espaço só');
  assert.equal(mudae.harem(store, 'a').chars.find((c) => c.name === 'Satoru Gojou').note, 'meu favorito de todos');
  assert.equal(mudae.album(store, 'a').chars.find((c) => c.name === 'Satoru Gojou').note, 'meu favorito de todos');
  assert.equal(mudae.harem(store, 'a').chars.find((c) => c.name === 'Zero Two').note, undefined);

  tools.note(store, 'a', 'char', 'Gojo $ outra nota');
  assert.equal(tools.noteOf(store, 'a', 1), 'outra nota');
  const gone = tools.note(store, 'a', 'char', 'Gojo $');
  assert.ok(gone.removed);
  assert.equal(store.notes, undefined, 'sem notas, o campo some do banco');
});

test('$note: erros e limites', () => {
  const { store, tools } = setup({ mine: [1] });
  assert.match(tools.note(store, 'a', 'char', 'Gojo').error, /nota/, 'sem $ não há nota');
  assert.match(tools.note(store, 'a', 'char', 'Mikasa $ oi').error, /não tem ninguém/);
  assert.match(tools.note(store, 'a', 'char', ' $ oi').error, /a quem a nota vale/);
  assert.equal(tools.note(store, 'a', 'char', 'Gojo $ ' + 'x'.repeat(500)).text.length, 200);
  assert.equal(tools.note(store, 'b', 'char', 'Gojo $ oi').error?.includes('Gojo'), true, 'quem não tem o personagem não anota');
});

test('$noteseries e $notepage: uma nota para vários', () => {
  const { store, tools } = setup();
  assert.equal(tools.note(store, 'a', 'series', 'Attack on Titan $ titãs').count, 2);
  assert.equal(tools.noteOf(store, 'a', 2), 'titãs');
  assert.equal(tools.noteOf(store, 'a', 6), 'titãs');
  assert.match(tools.note(store, 'a', 'series', 'Naruto $ x').error, /não tem ninguém da obra/);
  assert.equal(tools.note(store, 'a', 'page', '1 $ primeira página').count, 7, 'a página 1 tem até 15 personagens');
  assert.match(tools.note(store, 'a', 'page', '9 $ x').error, /não existe/);
  assert.equal(tools.note(store, 'a', 'char', 'Gojo $ A $ Zero $ B').count, 2, 'vários alvos separados por $ (o último é o texto)');
  assert.equal(tools.noteRemoveAll(store, 'a').count, 7);
  assert.equal(store.notes, undefined);
});

test('a nota some quando o personagem sai do harém (divórcio, presente, troca)', () => {
  const { mudae, store, tools } = setup();
  tools.note(store, 'a', 'char', 'Gojo $ a');
  tools.note(store, 'a', 'char', 'Mikasa $ b');
  tools.note(store, 'a', 'char', 'Zero $ c');
  mudae.divorce(store, 'a', 'Gojo');
  mudae.give(store, 'a', 'b', 'Mikasa');
  assert.deepEqual(Object.keys(store.notes.a), ['3']);
  assert.equal(tools.noteOf(store, 'b', 2), '', 'quem recebe não herda a nota');
  assert.equal(mudae.releaseAll(store, 'a'), 5);
  assert.equal(store.notes?.a, undefined);
});

test('$fn e $fnall: procura nas notas', () => {
  const { mudae, store, tools } = setup({ mine: [1, 2] });
  tools.note(store, 'a', 'char', 'Gojo $ Favorito do Verão');
  tools.note(store, 'a', 'char', 'Mikasa $ forte e leal');
  const own = tools.findNotes(store, 'a', 'favorito');
  assert.equal(own.total, 1);
  assert.equal(own.items[0].card.name, 'Satoru Gojou');
  assert.equal(own.items[0].note, 'Favorito do Verão');
  assert.equal(tools.findNotes(store, 'a', 'verao').total, 1, 'sem acento nem maiúscula');
  assert.equal(tools.findNotes(store, 'a', 'forte --leal').total, 0, '"--" tira quem tem a palavra');
  assert.equal(tools.findNotes(store, 'a', '--leal').total, 1);
  assert.match(tools.findNotes(store, 'a', '').error, /procurar/);
  assert.equal(tools.findNotes(store, 'x', 'favorito').total, 0, 'só vê as próprias');
  assert.equal(tools.findNotes(store, 'x', 'favorito', { all: true }).total, 1, '$fnall vê as do servidor');
  assert.equal(tools.findNotes(store, 'x', 'favorito', { all: true, isMember: () => false }).total, 0, 'quem saiu do servidor some');
});

test('$sortmarry: ordem guardada, volta ao padrão e vale no harém e no álbum', () => {
  const { mudae, store, tools } = setup();
  const byValue = names(mudae, store);
  assert.equal(tools.sort(store, 'a', 'name').mode, 'name');
  const abc = names(mudae, store);
  assert.deepEqual(abc, [...byValue].sort((x, y) => x.localeCompare(y, 'pt')));
  assert.deepEqual(mudae.album(store, 'a').chars.map((c) => c.name), abc, 'o álbum segue a mesma ordem');
  assert.equal(mudae.album(store, 'a').favorite.name, 'Satoru Gojou', 'o favorito automático continua sendo o mais valioso');

  tools.sort(store, 'a', null, true);
  assert.deepEqual(names(mudae, store), [...abc].reverse(), '"inverso" vira a ordem de ponta-cabeça');

  tools.sort(store, 'a', 'series');
  const series = mudae.harem(store, 'a').chars.map((c) => c.series);
  assert.deepEqual(series, [...series].sort((x, y) => x.localeCompare(y, 'pt')));

  tools.note(store, 'a', 'char', 'Link $ nota');
  tools.sort(store, 'a', 'note');
  assert.equal(names(mudae, store)[0], 'Link', 'quem tem nota vem primeiro');

  assert.equal(tools.sort(store, 'a', 'value').mode, 'value');
  assert.deepEqual(names(mudae, store), byValue);
  assert.equal(store.order?.a, undefined, 'a ordem padrão não guarda nada');
});

test('$sortmarry: quem entra depois fica no fim e quem sai some da ordem', () => {
  const { mudae, store, tools, marry } = setup({ mine: [1, 2, 3] });
  tools.sort(store, 'a', 'name');
  const before = names(mudae, store);
  mudae.divorce(store, 'a', 'Mikasa');
  assert.deepEqual(names(mudae, store), before.filter((n) => n !== 'Mikasa Ackerman'));
  marry('g1');
  assert.equal(names(mudae, store).at(-1), 'Link', 'quem entrou depois fica no fim da ordem guardada');
});

test('$sortmarry: harém vazio e flags de ordem do $mm', () => {
  const { mudae, store, tools } = setup({ mine: [] });
  assert.match(tools.sort(store, 'a', 'name').error, /vazio/);
  const full = setup();
  assert.deepEqual(names(full.mudae, full.store, 'abc'), names(full.mudae, full.store, '', 'name'), '$mm abc = $mma');
});

test('divórcio em lote: pede confirmação e só então solta', () => {
  const { mudae, store, tools } = setup();
  const p = tools.prepareDivorce(store, 'a', 'series', 'Attack on Titan');
  assert.equal(p.count, 2);
  assert.ok(p.value > 0 && p.refund > 0 && p.refund <= p.value);
  assert.equal(mudae.harem(store, 'a').total, 7, 'preparar não solta ninguém');
  assert.ok(tools.hasPending('a'));
  const done = tools.confirmDivorce(store, 'a');
  assert.equal(done.count, 2);
  assert.equal(done.refund, Math.min(done.value, DIVORCE_CAP));
  assert.equal(mudae.harem(store, 'a').total, 5);
  assert.equal(mudae.kakeraOf(store, 'a'), done.refund);
  assert.match(tools.confirmDivorce(store, 'a').error, /não há divórcio/i, 'não confirma duas vezes');
});

test('divórcio em lote: o teto diário de kakera continua valendo', () => {
  const { mudae, store, tools } = setup();
  const p = tools.prepareDivorce(store, 'a', 'all', '');
  assert.equal(p.count, 7);
  const done = tools.confirmDivorce(store, 'a');
  assert.equal(done.count, 7);
  assert.ok(done.refund <= DIVORCE_CAP, `devolveu ${done.refund}, o teto é ${DIVORCE_CAP}`);
  assert.equal(done.capped, done.refund < done.value);
  assert.equal(mudae.harem(store, 'a').total, 0);
  assert.equal(store.stats.a.divorces, 7, 'cada divórcio conta para os marcos');
  assert.match(tools.prepareDivorce(store, 'a', 'all', '').error, /vazio/);
});

test('divórcio em lote: página, "tudo menos" e erros', () => {
  const { mudae, store, tools } = setup();
  assert.equal(tools.prepareDivorce(store, 'a', 'page', '1').count, 7);
  assert.match(tools.prepareDivorce(store, 'a', 'page', '4').error, /não existe/);
  assert.match(tools.prepareDivorce(store, 'a', 'series', 'Naruto').error, /não tem ninguém da obra/);
  assert.match(tools.prepareDivorce(store, 'a', 'series', '').error, /Diga a obra/);
  assert.match(tools.prepareDivorce(store, 'a', 'allbut', '').error, /quem fica/);

  const keep = tools.prepareDivorce(store, 'a', 'allbut', 'Gojo $ Mikasa');
  assert.equal(keep.count, 5);
  tools.confirmDivorce(store, 'a');
  assert.deepEqual(names(mudae, store).sort(), ['Mikasa Ackerman', 'Satoru Gojou']);

  const page = tools.prepareDivorce(store, 'a', 'allbut', 'page 1');
  assert.match(page.error, /Não sobrou ninguém/, 'a página 1 é tudo: não sobra ninguém');
});

test('divórcio em lote: expira, pode ser cancelado e só solta quem ainda é seu', () => {
  const { mudae, store, tools, advance } = setup({ mine: [1, 2, 3] });
  tools.prepareDivorce(store, 'a', 'all', '');
  advance(61_000);
  assert.ok(!tools.hasPending('a'));
  assert.match(tools.confirmDivorce(store, 'a').error, /1 minuto/);
  assert.equal(mudae.harem(store, 'a').total, 3);

  tools.prepareDivorce(store, 'a', 'all', '');
  assert.ok(tools.cancelDivorce('a'));
  assert.match(tools.confirmDivorce(store, 'a').error, /não há/i);

  tools.prepareDivorce(store, 'a', 'all', '');
  mudae.give(store, 'a', 'b', 'Gojo'); // some do harém entre pedir e confirmar
  const done = tools.confirmDivorce(store, 'a');
  assert.equal(done.count, 2, 'só soltou quem ainda era dele');
  assert.equal(store.claims[1].ownerId, 'b', 'o personagem que foi para outra pessoa não é tocado');
});
