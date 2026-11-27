// Chaves e soulmates, o valor com chaves e fator do servidor, os rankings novos e os comandos da tabela.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createMudae, parse, CLAIM_RESET_MS } = require('../server/mudae');
const { keyedValue, tierOf, createChaves } = require('../server/mudae-chaves');
const { createCommands } = require('../server/mudae-comandos');
const { KEYS, DIVORCE_CAP } = require('../server/mudae-regras');
const { parseFlags } = require('../server/mudae-flags');

const CATALOG = [
  [1, 'Satoru Gojou', 'Jujutsu Kaisen', 'b1-a.png', 'M', 900],
  [2, 'Mikasa Ackerman', 'Attack on Titan', 'b2-b.jpg', 'F', 800],
  [3, 'Zero Two', 'DARLING in the FRANXX', 'b3-c.jpg', 'F', 700],
  [4, 'Kyubey', 'Madoka Magica', 'b4-d.jpg', '', 600],
];

function setup({ ownChance = 0, random = () => 0, mine = [1, 2] } = {}) {
  let t = 10 * CLAIM_RESET_MS + 1000;
  const mudae = createMudae({ catalog: CATALOG, now: () => t, random, refSize: CATALOG.length, ownChance });
  const store = { claims: {}, usage: {} };
  const marry = (id, who = 'a') => { t += CLAIM_RESET_MS; mudae.claim(store, who, id, { revealAt: t }); };
  for (const id of mine) marry(id);
  return { mudae, store, marry, advance: (ms) => { t += ms; } };
}
// Dá n chaves seguidas, como se fossem n rolls do mesmo personagem.
const giveKeys = (mudae, store, id, n, who = 'a') => { let last; for (let i = 0; i < n; i++) last = mudae.chaves.gain(store, who, id, { value: 100 }); return last; };

test('keyedValue e tierOf: as faixas da wiki', () => {
  assert.equal(keyedValue(100, 0), 100);
  assert.equal(keyedValue(100, 1), 100, 'a 1ª chave não muda o valor');
  assert.equal(keyedValue(100, 2), 110);
  assert.equal(keyedValue(100, 3), 110);
  assert.equal(keyedValue(100, 5), 130, '2, 4 e 5 somam +10% cada');
  assert.equal(keyedValue(100, 9), 160);
  assert.equal(keyedValue(100, 10), 175, 'o nível 10 dá 15 de kakera fixos');
  assert.equal(keyedValue(100, 11), 180, 'e o 11 soma +5%');
  assert.equal(keyedValue(100, 15), 195);
  assert.equal(keyedValue(100, 30), 225);
  assert.equal(keyedValue(100, 100), 275);
  assert.ok(keyedValue(100, KEYS.max) < 400, 'mesmo no último degrau, o valor não passa de 4 vezes o base');
  assert.equal(keyedValue(100, 300), keyedValue(100, 500), 'depois do 300 não há mais bônus fixo');
  for (let level = 1; level < KEYS.max; level++) assert.ok(keyedValue(100, level + 1) >= keyedValue(100, level), `nunca cai (nível ${level})`);
  assert.deepEqual([0, 1, 2, 3, 5, 6, 9, 10, 40].map(tierOf), ['', 'bronze', 'bronze', 'prata', 'prata', 'ouro', 'ouro', 'caos', 'caos']);
});

test('chave: sobe, muda de cor, vira soulmate com 10 e para no máximo', () => {
  const { mudae, store } = setup();
  const first = mudae.chaves.gain(store, 'a', 1, { value: 100 });
  assert.deepEqual([first.level, first.gained, first.tier, first.tierUp, first.soulmate, first.gold], [1, 1, 'bronze', true, false, 0]);
  assert.equal(mudae.chaves.gain(store, 'a', 1, { value: 100 }).tierUp, false);
  assert.equal(mudae.chaves.gain(store, 'a', 1, { value: 100 }).tierUp, true, 'a 3ª é prata');
  const last = giveKeys(mudae, store, 1, 7);
  assert.equal(last.level, 10);
  assert.equal(last.soulmate, true, 'a 10ª chave vira soulmate');
  assert.deepEqual(mudae.chaves.soulmatesOf(store, 'a'), ['1']);
  assert.equal(mudae.chaves.gain(store, 'a', 1, { value: 100 }).soulmate, false, 'só vira uma vez');
  giveKeys(mudae, store, 1, KEYS.max + 50);
  assert.equal(store.keys[1], KEYS.max);
  assert.equal(mudae.chaves.gain(store, 'a', 1, { value: 100 }).gained, 0, 'no máximo, nada sobe');
});

test('prêmio do nível 6: valor em kakera, com teto de 24 h', () => {
  const { mudae, store, advance } = setup();
  assert.equal(giveKeys(mudae, store, 1, 6).gold, 0, 'subir até o 6 não paga');
  const paid = mudae.chaves.gain(store, 'a', 1, { value: 60 });
  assert.equal(paid.gold, 60);
  assert.equal(paid.goldCapped, false);
  const capped = mudae.chaves.gain(store, 'a', 1, { value: 80 });
  assert.equal(capped.gold, KEYS.goldCap - 60, 'só cabe o que resta do teto');
  assert.equal(capped.goldCapped, true);
  assert.equal(mudae.chaves.gain(store, 'a', 1, { value: 50 }).gold, 0, 'teto cheio');
  assert.equal(mudae.chaves.goldLeft(store, 'a'), 0);
  advance(24 * 3600_000 + 1);
  assert.equal(mudae.chaves.gain(store, 'a', 1, { value: 50 }).gold, 50, 'passadas 24 h, volta a pagar');
});

test('roll: com ownChance, cai num personagem seu, sobe a chave e mostra o selo no álbum', () => {
  const { mudae, store } = setup({ ownChance: 1, mine: [1] });
  const r = mudae.roll(store, 'a', 'm');
  assert.equal(r.card.id, 1);
  assert.equal(r.ownerId, 'a');
  assert.equal(r.keyGain.level, 1);
  assert.equal(r.card.keys, 1);
  const r2 = mudae.roll(store, 'a', 'm');
  assert.equal(r2.keyGain.level, 2);
  assert.equal(r2.card.keys, 2);
  const album = mudae.album(store, 'a').chars[0];
  assert.equal(album.keys, 2);
  assert.ok(album.value > r2.card.value, 'o álbum já mostra o valor do nível novo (o roll mostra o de antes da chave)');
  assert.equal(store.stats.a.keys, 2, 'conta para o marco');
  assert.equal(mudae.album(store, 'a').value, album.value, 'o total do harém usa o valor com chaves');
  assert.equal(mudae.info(store, 'Gojo').card.keys, 2);
});

test('roll: o próprio personagem respeita o comando (gênero e fonte) e não rouba o roll sem harém', () => {
  const only = setup({ ownChance: 1, mine: [2] }); // só Mikasa (F)
  assert.equal(only.mudae.roll(only.store, 'a', 'h').card.id !== 2, true, '$h nunca traz uma waifu sua');
  assert.equal(only.mudae.roll(only.store, 'a', 'w').card.id, 2, '$w traz');
  const empty = setup({ ownChance: 1, mine: [] });
  assert.ok(empty.mudae.roll(empty.store, 'a', 'm').card, 'sem harém, é o sorteio de sempre');
  const off = setup({ ownChance: 0, mine: [1], random: () => 0.999 }); // sem a chance própria e com o sorteio caindo longe do harém
  assert.notEqual(off.mudae.roll(off.store, 'a', 'm').card.id, 1);
  assert.equal(off.store.keys, undefined, 'com ownChance 0 nenhuma chave nasce sozinha');
});

test('roll de personagem de outra pessoa não dá chave', () => {
  const { mudae, store, marry } = setup({ ownChance: 0, mine: [] });
  marry(1, 'b');
  const r = mudae.roll(store, 'a', 'm'); // random 0: o mais popular, que é do 'b'
  assert.equal(r.ownerId, 'b');
  assert.equal(r.keyGain, undefined);
  assert.equal(store.keys, undefined);
});

test('a chave fica com o personagem: sobrevive a divórcio, presente e troca; o valor do divórcio conta as chaves', () => {
  const { mudae, store } = setup({ mine: [1, 2] });
  giveKeys(mudae, store, 1, 5);
  giveKeys(mudae, store, 2, 2);
  const withKeys = mudae.album(store, 'a').chars.find((c) => c.id === 1).value;
  mudae.give(store, 'a', 'b', 'Mikasa');
  assert.equal(store.keys[2], 2, 'o presente leva a chave junto');
  assert.equal(mudae.album(store, 'b').chars[0].keys, 2);
  const divorced = mudae.divorce(store, 'a', 'Gojo');
  assert.equal(divorced.value, withKeys, 'o valor do divórcio já traz as chaves');
  assert.ok(divorced.refund <= DIVORCE_CAP);
  assert.equal(store.keys[1], 5, 'a chave continua depois do divórcio');
  assert.equal(mudae.chaves.soulkeysOf(store, 'a', 1), 5, 'e as soulkeys de quem rolou');
});

test('soulkeys: só as chaves que você mesmo rolou contam para o soulmate', () => {
  const { mudae, store } = setup({ mine: [1] });
  giveKeys(mudae, store, 1, 8, 'b'); // outra pessoa rolou 8
  mudae.give(store, 'a', 'b', 'Gojo');
  mudae.give(store, 'b', 'a', 'Gojo');
  const r = giveKeys(mudae, store, 1, 2, 'a');
  assert.equal(r.level, 10);
  assert.equal(r.soulmate, false, 'nível 10, mas só 2 soulkeys suas');
  assert.deepEqual(mudae.chaves.soulmatesOf(store, 'a'), []);
  assert.equal(giveKeys(mudae, store, 1, 8, 'a').soulmate, true);
});

test('removeKeys: tira chaves e não mexe nas soulkeys', () => {
  const { mudae, store } = setup({ mine: [1] });
  giveKeys(mudae, store, 1, 6);
  const r = mudae.removeKeys(store, 'a', 'Gojo', 4);
  assert.deepEqual([r.before, r.level], [6, 2]);
  assert.equal(mudae.chaves.soulkeysOf(store, 'a', 1), 6);
  assert.equal(mudae.removeKeys(store, 'a', 'Gojo', 99).level, 0);
  assert.equal(store.keys, undefined, 'sem chaves, nada fica guardado');
  assert.match(mudae.removeKeys(store, 'a', 'Gojo', 1).error, /não tem chaves/);
  assert.match(mudae.removeKeys(store, 'a', 'Kyubey', 1).error, /não tem ninguém/);
});

test('valor: +5% do servidor a cada 500 casamentos, até +20%', () => {
  const { mudae, store } = setup({ mine: [1] });
  const base = mudae.valueWith(store, 100, 1);
  assert.equal(base, 100, 'servidor pequeno: sem fator');
  const fill = (n) => { store.claims = Object.fromEntries(Array.from({ length: n }, (_, i) => [`x${i}`, { ownerId: 'z', at: 1 }])); };
  const at = (n) => { fill(n); const fresh = setup({ mine: [] }); fresh.store.claims = store.claims; return fresh.mudae.valueWith(fresh.store, 100, 'x0'); };
  assert.equal(at(499), 100);
  assert.equal(at(500), 105);
  assert.equal(at(1000), 110);
  assert.equal(at(2000), 120);
  assert.equal(at(50_000), 120, 'o teto é +20%');
});

test('valor mostrado: harém, ranking, Personagens, desejos, curtidas, troca e divórcio em lote dão o mesmo número', () => {
  const { mudae, store } = setup({ mine: [1] });
  giveKeys(mudae, store, 1, 2); // chave 2: +10%
  // 2.000 casamentos de mentira (ids fora do catálogo): o servidor chega ao teto de +20%.
  for (let i = 0; i < 2000; i++) store.claims[`x${i}`] = { ownerId: 'z', at: 1 };
  const harem = mudae.album(store, 'a').chars.find((c) => c.id === 1).value;
  assert.ok(harem > mudae.card(1).value, 'o harém já tinha o bônus');
  mudae.wish(store, 'b', 'Gojo');
  mudae.like(store, 'b', 'Gojo');
  const t = mudae.tradeOpen(store, { serverId: 's', a: 'a', b: 'b' });
  mudae.tradeOffer(store, t.id, 'a', { chars: [1] });
  const shown = {
    ranking: mudae.ranking(store).legendaries.find((c) => c.id === 1).value,
    personagens: mudae.list(store, '||Jujutsu Kaisen').chars.find((c) => c.id === 1).value,
    desejos: mudae.wishlist(store, 'b').chars.find((c) => c.id === 1).value,
    curtidas: mudae.likeList(store, 'b').chars.find((c) => c.id === 1).value,
    troca: mudae.tradeView(store, t).sides.a.chars[0].value,
    divorcioEmLote: mudae.haremTools.prepareDivorce(store, 'a', 'all').value,
  };
  for (const [where, value] of Object.entries(shown)) assert.equal(value, harem, where);
});

test('board: kakera, chaves, personagens e último casamento', () => {
  const { mudae, store, marry } = setup({ mine: [1, 2] });
  marry(3, 'b');
  mudae.addKakera(store, 'b', 500);
  mudae.addKakera(store, 'a', 100);
  giveKeys(mudae, store, 1, 4);
  giveKeys(mudae, store, 3, 1, 'b');
  assert.deepEqual(mudae.board(store, 'k').map((r) => [r.ownerId, r.value]), [['b', 500], ['a', 100]]);
  assert.deepEqual(mudae.board(store, 'y').map((r) => [r.ownerId, r.value]), [['a', 4], ['b', 1]]);
  assert.deepEqual(mudae.board(store, 'nbr').map((r) => [r.ownerId, r.value]), [['a', 2], ['b', 1]]);
  const lc = mudae.board(store, 'lc');
  assert.equal(lc[0].ownerId, 'b', 'quem casou por último vem primeiro');
  assert.match(lc[0].label, /^\d\d\/\d\d$/);
  assert.equal(mudae.board(store, 'k', (id) => id !== 'b').length, 1, 'quem saiu do servidor some');
  assert.equal(mudae.board(store, 'nada'), null);
});

test('parse: comandos novos de chaves e rankings', () => {
  for (const [text, cmd] of [['$infokeys', 'infokeys'], ['$keys', 'infokeys'], ['$sl', 'sl'], ['$removekeys Gojo $ 2', 'removekeys'], ['$tsk', 'topservk'], ['$topservy', 'topservy'],
    ['$tsn', 'topservn'], ['$tslc', 'topservlc'], ['$ts', 'topserv'], ['$tsv', 'topserv']]) {
    assert.equal(parse(text)?.cmd, cmd, text);
  }
});

// A tabela de comandos com um "chat" de mentira: o que sai só para quem pediu e o que vai para o canal.
function table() {
  const s = setup({ mine: [1, 2] });
  const posted = [];
  const saves = [];
  const cmds = createCommands({ mudae: s.mudae, forja: { shownOf: () => [] }, parseFlags, postMudae: (c, acc, command, data) => posted.push({ command, ...data }), save: () => saves.push(1) });
  const only = (data) => ({ ephemeral: data });
  const run = (cmd, arg = '', extra = {}) => {
    const handler = cmds[cmd];
    return handler?.({ acc: { id: 'a' }, c: { id: 'canal' }, store: s.store, cmd, arg, rest: arg, target: null, command: '$' + cmd, only, error: (text) => only({ kind: 'error', text }), isMember: () => true, ...extra });
  };
  return { ...s, run, posted, saves };
}

test('$infokeys, $sl e $removekeys pela tabela', () => {
  const t = table();
  assert.match(t.run('infokeys').ephemeral.text, /ainda não tem nenhuma chave/);
  assert.match(t.run('sl').ephemeral.text, /ainda não tem soulmates/);
  giveKeys(t.mudae, t.store, 1, 10);
  const info = t.run('infokeys').ephemeral.text;
  assert.match(info, /Satoru Gojou\*\*: nível 10 \(caos\), 10\/10 soulkeys/);
  assert.match(info, /ainda dá para pegar \*\*0\*\*/, 'subir do 6 ao 10 já usou o teto do dia');
  assert.match(t.run('sl').ephemeral.text, /Satoru Gojou.*chave 10/);
  assert.match(t.run('removekeys', 'Gojo $ 3').ephemeral.text, /de chave \*\*10\*\* para \*\*7\*\*/);
  assert.match(t.run('removekeys', 'Gojo').ephemeral.text, /de chave \*\*7\*\* para \*\*6\*\*/, 'sem número, tira 1');
  assert.match(t.run('removekeys', '').ephemeral.text, /Diga quem/);
  assert.match(t.run('removekeys', 'Gojo $ 0').ephemeral.text, /Diga quem/);
  assert.equal(t.saves.length, 2, 'só grava quando mudou algo');
});

test('$topserv com métrica e o comando puro cai no ranking de sempre', () => {
  const t = table();
  assert.equal(t.run('topserv', ''), undefined, '$topserv puro segue para o ranking antigo');
  assert.equal(t.run('topserv', 'valor'), undefined);
  assert.equal(t.run('topserv', 'qualquer coisa'), undefined);
  t.mudae.addKakera(t.store, 'a', 300);
  assert.deepEqual(t.run('topservk'), { ok: true });
  assert.deepEqual([t.posted[0].kind, t.posted[0].title, t.posted[0].unit], ['topserv', 'Mais kakera guardado', 'kakera']);
  assert.deepEqual(t.posted[0].rows.map((r) => [r.ownerId, r.value]), [['a', 300]]);
  t.run('topserv', 'nbr');
  assert.equal(t.posted[1].title, 'Mais personagens');
  t.run('topserv', 'lc');
  assert.equal(t.posted[2].title, 'Último casamento');
  assert.ok(t.posted[2].rows[0].label);
});

test('tabela: os comandos do harém continuam respondendo como antes', () => {
  const t = table();
  assert.match(t.run('note', 'Gojo $ oi').ephemeral.text, /Nota guardada/);
  assert.match(t.run('sortmarry', 'abc').ephemeral.text, /de A a Z/);
  assert.match(t.run('sortmarry', 'xyz').ephemeral.text, /Como ordenar/);
  assert.match(t.run('divorceall', '').ephemeral.text, /\$confirmar/);
  assert.deepEqual(t.run('confirm'), { ok: true });
  assert.match(t.posted.at(-1).text, /se divorciou de \*\*2\*\*/);
  assert.match(t.run('confirm').ephemeral.text, /Não há divórcio/);
  assert.deepEqual(t.run('profile'), { ok: true }, 'o perfil posta no canal');
  assert.equal(t.posted.at(-1).kind, 'profile');
  assert.equal(t.posted.at(-1).stats.keys, 0);
  assert.equal(typeof createChaves, 'function');
});
