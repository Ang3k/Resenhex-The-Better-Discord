// Comandos novos do Mudae: kakera ($dk, $daily, $rolls, $givek, cristais, divórcio), lista de desejos,
// $give, $fm, $mm com ordem, $im com histórico, $top/$obra e as trocas entre duas pessoas.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createMudae, parse, isRoll, ROLL_RESET_MS, CLAIM_RESET_MS, CLAIM_WINDOW_MS, PRIORITY_MS, DAILY_MS, DK_AMOUNT, ROLLS_PRICE, ROLLS_BUYS,
  WISH_LIMIT, TRADE_TTL, TRADE_MAX, LIST_PAGE, TOP_LIMIT } = require('../server/mudae');

const CATALOG = [
  [1, 'Satoru Gojou', 'Jujutsu Kaisen', 'b1-a.png', 'M', 900],
  [2, 'Mikasa Ackerman', 'Attack on Titan', 'b2-b.jpg', 'F', 800],
  [3, 'Zero Two', 'DARLING in the FRANXX', 'b3-c.jpg', 'F', 700],
  [4, 'Kyubey', 'Madoka Magica', 'b4-d.jpg', '', 600],
  [5, 'Satoru Fujinuma', 'Erased', 'b5-e.jpg', 'M', 500],
  [6, 'Eren Yeager', 'Attack on Titan', 'b6-f.jpg', 'M', 400],
  ['g1', 'Link', 'Zelda', 'https://images.igdb.com/1.jpg', 'M', 300, 'g'],
];

function setup({ pick = 0, catalog = CATALOG } = {}) {
  let t = 10 * CLAIM_RESET_MS + 1000; // começo de uma janela de claim
  const mudae = createMudae({ catalog, now: () => t, random: () => pick, refSize: catalog.length });
  const store = { claims: {}, usage: {} };
  // Casa direto (cada pessoa um por janela): avança a janela antes de cada casamento.
  const marry = (accountId, charId) => { t += CLAIM_RESET_MS; mudae.claim(store, accountId, charId, { revealAt: t }); };
  return { mudae, store, marry, advance: (ms) => { t += ms; }, now: () => t };
}
// Toda carta tem exatamente um dono: nenhuma some nem fica duplicada.
const owners = (store) => Object.fromEntries(Object.entries(store.claims).map(([id, cl]) => [id, cl.ownerId]));

test('parse: comandos novos, apelidos e o que é roll', () => {
  for (const [text, cmd] of [['$top waifus', 'top'], ['$topserv', 'topserv'], ['$obra Naruto', 'obra'], ['$mma', 'mma'], ['$mms', 'mms'], ['$mmr', 'mmr'],
    ['$give <@b> Gojo', 'give'], ['$givek <@b> 10', 'givek'], ['$wish Gojo', 'wish'], ['$wl', 'wl'], ['$wr Gojo', 'wr'], ['$k', 'k'], ['$dk', 'dk'],
    ['$daily', 'daily'], ['$rolls', 'rolls'], ['$fm Gojo', 'fm'], ['$trade <@b>', 'trade'], ['$trocar <@b>', 'trade'], ['$desejar Gojo', 'wish']]) {
    assert.equal(parse(text)?.cmd, cmd, text);
  }
  assert.ok(isRoll('w') && isRoll('hg') && isRoll('ms') && isRoll('m'));
  assert.ok(!isRoll('mm') && !isRoll('wl') && !isRoll('wr') && !isRoll('mma') && !isRoll('k'), 'listas e desejos não rodam personagem');
});

test('$dk e $daily: a cada 20 h; o $daily só gasta quando faltam rolls', () => {
  const { mudae, store, advance } = setup();
  assert.deepEqual(mudae.dailyKakera(store, 'a'), { amount: DK_AMOUNT, kakera: DK_AMOUNT });
  assert.match(mudae.dailyKakera(store, 'a').error, /volta em/);
  assert.equal(mudae.status(store, 'a').dkIn, DAILY_MS);
  advance(DAILY_MS);
  assert.equal(mudae.dailyKakera(store, 'a').kakera, 2 * DK_AMOUNT);

  assert.match(mudae.daily(store, 'a').error, /ainda tem todos os rolls/);
  assert.equal(mudae.status(store, 'a').dailyIn, 0, 'tentar com os rolls cheios não gasta o $daily');
  for (let i = 0; i < 10; i++) mudae.roll(store, 'a', 'm');
  assert.equal(mudae.status(store, 'a').rollsLeft, 0);
  assert.deepEqual(mudae.daily(store, 'a'), { rollsLeft: 10 });
  assert.equal(mudae.status(store, 'a').rollsLeft, 10);
  mudae.roll(store, 'a', 'm');
  assert.match(mudae.daily(store, 'a').error, /volta em/);
  advance(DAILY_MS);
  mudae.roll(store, 'a', 'm'); // a janela virou e os rolls voltaram: gasta um para o $daily valer
  assert.ok(!mudae.daily(store, 'a').error);
});

test('$rolls: custa kakera, só com rolls gastos e até 3 vezes em 24 h', () => {
  const { mudae, store, advance } = setup();
  for (let i = 0; i < 10; i++) mudae.roll(store, 'a', 'm');
  assert.match(mudae.buyRolls(store, 'a').error, new RegExp(`custa \\*\\*${ROLLS_PRICE}\\*\\*`));
  store.kakera = { a: ROLLS_PRICE * 5 };
  for (let i = 1; i <= ROLLS_BUYS; i++) {
    const r = mudae.buyRolls(store, 'a');
    assert.equal(r.rollsLeft, 10);
    assert.equal(r.buysLeft, ROLLS_BUYS - i);
    assert.equal(mudae.kakeraOf(store, 'a'), ROLLS_PRICE * (5 - i));
    mudae.roll(store, 'a', 'm');
    advance(60_000);
  }
  assert.match(mudae.buyRolls(store, 'a').error, /3 vezes/);
  assert.equal(mudae.status(store, 'a').buysLeft, 0);
  advance(24 * 3600_000);
  mudae.roll(store, 'a', 'm');
  assert.ok(!mudae.buyRolls(store, 'a').error, 'depois de 24 h, a primeira compra libera');
  assert.match(mudae.buyRolls(store, 'a').error, /todos os rolls/);
});

test('$givek: passa kakera inteiro e nunca mais do que tem', () => {
  const { mudae, store } = setup();
  store.kakera = { a: 100 };
  assert.match(mudae.giveKakera(store, 'a', 'b', 'muito').error, /Diga quanto/);
  assert.match(mudae.giveKakera(store, 'a', 'b', -5).error, /Diga quanto/);
  assert.match(mudae.giveKakera(store, 'a', 'a', 10).error, /si mesmo/);
  assert.match(mudae.giveKakera(store, 'a', 'b', 101).error, /só tem \*\*100\*\*/);
  assert.deepEqual(mudae.giveKakera(store, 'a', 'b', '40.9'), { amount: 40, kakera: 60 });
  assert.equal(mudae.kakeraOf(store, 'b'), 40);
  assert.deepEqual(mudae.giveKakera(store, 'a', 'b', 60), { amount: 60, kakera: 0 });
  assert.equal(store.kakera.a, undefined, 'saldo zerado sai do banco');
});

test('divórcio devolve o valor da carta em kakera', () => {
  const { mudae, store, marry } = setup();
  marry('a', 3);
  marry('a', 1);
  const first = mudae.divorce(store, 'a', 'zero');
  assert.equal(first.value, mudae.card(3).value);
  assert.equal(first.refund, Math.min(mudae.card(3).value, 500));
  assert.equal(mudae.kakeraOf(store, 'a'), first.refund);
  const second = mudae.divorceId(store, 'a', 1);
  assert.equal(second.refund, Math.min(mudae.card(1).value, 500 - first.refund));
  assert.equal(mudae.kakeraOf(store, 'a'), first.refund + second.refund);
});

test('lista de desejos: até 10, sem repetir, sem os seus; quem casa sai da lista; o álbum mostra quem deseja', () => {
  const { mudae, store, marry } = setup();
  const w = mudae.wish(store, 'a', 'mikasa');
  assert.equal(w.card.name, 'Mikasa Ackerman');
  assert.equal(w.total, 1);
  assert.match(mudae.wish(store, 'a', 'mikasa').error, /já está/);
  assert.match(mudae.wish(store, 'a', 'ninguém').error, /Nenhum personagem/);
  mudae.wish(store, 'b', 'mikasa');
  assert.deepEqual(mudae.wishersOf(store, 2), ['a', 'b']);
  assert.deepEqual(mudae.wishersOf(store, 2, (id) => id !== 'b'), ['a'], 'quem saiu do servidor não conta');

  marry('c', 2);
  assert.deepEqual(mudae.album(store, 'c').chars[0].wishedBy, ['a', 'b']);
  assert.equal(mudae.wishlist(store, 'a').chars[0].ownerId, 'c');
  marry('a', 3);
  assert.match(mudae.wish(store, 'a', 'zero two').error, /já é seu/);

  mudae.divorceId(store, 'c', 2);
  mudae.wish(store, 'z', 'mikasa');
  marry('z', 2);
  assert.deepEqual(store.wishes.z, undefined, 'casar com quem desejava tira da lista');

  for (const name of ['gojou', 'kyubey', 'fujinuma', 'eren', 'link']) mudae.wish(store, 'd', name);
  assert.equal(mudae.wishlist(store, 'd').total, 5);
  assert.equal(mudae.unwish(store, 'd', 'link').card.name, 'Link');
  assert.match(mudae.unwish(store, 'd', 'link').error, /Ninguém chamado/);
  assert.equal(mudae.wishToggle(store, 'd', 'g1', true).total, 5);
  assert.equal(mudae.wishToggle(store, 'd', 'g1', false).total, 4);
  assert.throws(() => mudae.wishToggle(store, 'a', 3, true), /já é seu/);

  const many = Array.from({ length: WISH_LIMIT + 1 }, (_, i) => [100 + i, `Extra ${i}`, 'Obra', `b${i}.png`, 'F', 10 - i / 100]);
  const big = setup({ catalog: many });
  for (let i = 0; i < WISH_LIMIT; i++) assert.ok(!big.mudae.wish(big.store, 'a', `extra ${i}`).error);
  assert.match(big.mudae.wish(big.store, 'a', `extra ${WISH_LIMIT}`).error, /cheia/);
});

test('$give, $fm, $mm com ordem e $im com histórico', () => {
  const { mudae, store, marry, advance } = setup();
  marry('a', 3);
  marry('a', 1);
  marry('a', 5);
  assert.deepEqual(mudae.harem(store, 'a').chars.map((c) => c.id), [1, 3, 5]);
  assert.deepEqual(mudae.harem(store, 'a', 'name').chars.map((c) => c.name), ['Satoru Fujinuma', 'Satoru Gojou', 'Zero Two']);
  assert.deepEqual(mudae.harem(store, 'a', 'series').chars.map((c) => c.series), ['DARLING in the FRANXX', 'Erased', 'Jujutsu Kaisen']);
  assert.deepEqual(mudae.harem(store, 'a', 'recent').chars.map((c) => c.id), [5, 1, 3]);
  assert.equal(mudae.harem(store, 'a', 'bobagem').sort, 'value');

  assert.equal(mudae.firstMarry(store, 'a', 'zero').card.name, 'Zero Two');
  assert.equal(mudae.summary(store, 'a').favorite.chosen, true);
  assert.match(mudae.firstMarry(store, 'a', 'mikasa').error, /não tem ninguém/);

  mudae.wish(store, 'b', 'zero two');
  assert.match(mudae.give(store, 'a', 'a', 'zero').error, /si mesmo/);
  assert.match(mudae.give(store, 'b', 'a', 'zero').error, /não tem ninguém/);
  advance(1000);
  assert.equal(mudae.give(store, 'a', 'b', 'zero').card.name, 'Zero Two');
  assert.equal(store.claims[3].ownerId, 'b');
  assert.equal(store.favorites.a, undefined, 'o favorito dado volta para o mais valioso');
  assert.equal(store.wishes?.b, undefined, 'ganhar quem desejava tira da lista');

  const info = mudae.info(store, 'zero two');
  assert.equal(info.ownerId, 'b');
  assert.equal(info.via, 'give');
  assert.equal(info.owners, 2);
  assert.ok(info.since > 0);
  assert.deepEqual(info.wishedBy, []);
  assert.equal(mudae.info(store, 'gojou').via, 'claim');
  assert.equal(mudae.info(store, 'mikasa').owners, 0);

  // Casamento de antes do histórico: entra como o primeiro dono quando muda de mãos.
  store.claims[2] = { ownerId: 'velho', at: 5 };
  mudae.give(store, 'velho', 'b', 'mikasa');
  assert.deepEqual(store.hist[2].last.map(([who, how]) => [who, how]), [['velho', 'claim'], ['b', 'give']]);
  assert.equal(mudae.info(store, 'mikasa').owners, 2);
});

test('$top e $obra: filtros, páginas, dono de cada um e progresso na obra', () => {
  const { mudae, store, marry } = setup();
  const top = mudae.topFilter('');
  assert.equal(top.label, 'Personagens');
  const all = mudae.list(store, top.key, 0);
  assert.deepEqual(all.chars.map((c) => c.name).slice(0, 2), ['Satoru Gojou', 'Mikasa Ackerman'], 'o mais valioso primeiro');
  assert.equal(all.chars[0].pos, 1);
  assert.equal(all.total, CATALOG.length);
  assert.equal(all.pages, 1);

  assert.deepEqual(mudae.list(store, mudae.topFilter('waifus').key).chars.map((c) => c.id), [2, 3]);
  assert.deepEqual(mudae.list(store, mudae.topFilter('husbandos jogos').key).chars.map((c) => c.id), ['g1']);
  assert.equal(mudae.topFilter('husbandos jogos').label, 'Husbandos de jogos');
  assert.deepEqual(mudae.list(store, mudae.topFilter('outros').key).chars.map((c) => c.id), [4], 'sem gênero');
  assert.match(mudae.topFilter('animais').error, /ainda não separa animais/);
  assert.equal(mudae.topFilter('obra que não existe'), null);
  assert.equal(mudae.topFilter('waifus', true), null, 'no $obra, só nome de obra');

  marry('a', 6);
  marry('b', 2);
  const obra = mudae.topFilter('attack', true);
  assert.equal(obra.series, 'Attack on Titan');
  const page = mudae.list(store, obra.key, 0, 'a');
  assert.deepEqual(page.chars.map((c) => [c.name, c.ownerId]), [['Mikasa Ackerman', 'b'], ['Eren Yeager', 'a']]);
  assert.deepEqual([page.total, page.claimed, page.mine], [2, 2, 1]);
  assert.equal(mudae.list(store, 'X||'), null, 'chave inventada não passa');
  assert.equal(mudae.list(store, '||Obra inventada'), null);

  const many = Array.from({ length: TOP_LIMIT + 20 }, (_, i) => [i + 1, `P${i}`, i < 40 ? 'Grande' : 'Outra', `b${i}.png`, 'F', 5000 - i]);
  const big = setup({ catalog: many });
  const p = big.mudae.list(big.store, big.mudae.topFilter('').key, 999);
  assert.equal(p.total, TOP_LIMIT, 'o $top para nos mil primeiros');
  assert.equal(p.page, p.pages - 1, 'página além do fim vira a última');
  assert.equal(p.chars.at(-1).pos, TOP_LIMIT);
  const second = big.mudae.list(big.store, big.mudae.topFilter('grande', true).key, 1);
  assert.deepEqual([second.total, second.chars.length, second.chars[0].pos], [40, LIST_PAGE, LIST_PAGE + 1]);
});

test('troca: os dois confirmam, mudança desfaz as confirmações, e tudo troca de uma vez', () => {
  const { mudae, store, marry, advance } = setup();
  marry('a', 1);
  marry('a', 2);
  marry('b', 3);
  store.kakera = { a: 50, b: 300 };
  const before = owners(store);

  assert.throws(() => mudae.tradeOpen(store, { serverId: 's', a: 'a', b: 'a' }), /você mesmo/);
  const t = mudae.tradeOpen(store, { serverId: 's', a: 'a', b: 'b' });
  assert.throws(() => mudae.tradeOpen(store, { serverId: 's', a: 'a', b: 'c' }), /já tem uma troca/);
  assert.throws(() => mudae.tradeOpen(store, { serverId: 's', a: 'c', b: 'b' }), /já está numa troca/);
  assert.ok(mudae.tradeOpen(store, { serverId: 'outro', a: 'a', b: 'c' }), 'em outro servidor pode');
  assert.equal(mudae.tradeOf('s', 'b'), t);
  assert.throws(() => mudae.tradeOffer(store, t.id, 'c', { chars: [] }), /não encontrada/, 'quem está de fora não mexe');

  // Só oferece o que é seu e o kakera que tem.
  assert.throws(() => mudae.tradeOffer(store, t.id, 'b', { chars: [1] }), /do seu harem/);
  assert.throws(() => mudae.tradeOffer(store, t.id, 'b', { chars: [99] }), /do seu harem/);
  assert.throws(() => mudae.tradeOffer(store, t.id, 'a', { kakera: 51 }), /só tem 50/);
  assert.throws(() => mudae.tradeConfirm(store, t.id, 'a', { rev: t.rev }), /vazia/);

  mudae.tradeOffer(store, t.id, 'a', { chars: [1, '1', 2] });
  assert.deepEqual(mudae.tradeView(store, t).sides.a.chars.map((c) => c.id), [1, 2], 'sem repetir carta');
  mudae.tradeOffer(store, t.id, 'b', { chars: ['3'], kakera: 100 });
  const rev = t.rev;
  mudae.tradeConfirm(store, t.id, 'a', { rev });
  assert.equal(t.ok.a, true);
  assert.equal(t.state, 'open', 'falta o outro lado');

  // Beto muda a oferta: as duas confirmações caem e a da Ana não vale mais.
  mudae.tradeOffer(store, t.id, 'b', { chars: ['3'], kakera: 10 });
  assert.deepEqual(t.ok, { a: false, b: false });
  assert.throws(() => mudae.tradeConfirm(store, t.id, 'b', { rev }), /mudou/);
  mudae.tradeConfirm(store, t.id, 'b', { rev: t.rev });
  assert.deepEqual(owners(store), before, 'só um lado confirmou: nada muda');
  mudae.tradeConfirm(store, t.id, 'b', { rev: t.rev, ok: false });
  assert.equal(t.ok.b, false, 'dá para desfazer a confirmação');
  mudae.tradeConfirm(store, t.id, 'b', { rev: t.rev });
  advance(1000);
  mudae.tradeConfirm(store, t.id, 'a', { rev: t.rev });

  assert.equal(t.state, 'done');
  assert.deepEqual(owners(store), { 1: 'b', 2: 'b', 3: 'a' });
  assert.deepEqual(store.kakera, { a: 60, b: 290 }, 'kakera passa de um lado para o outro');
  assert.equal(mudae.kakeraOf(store, 'a') + mudae.kakeraOf(store, 'b'), 350, 'nenhum kakera some ou nasce');
  assert.equal(mudae.info(store, 'zero two').via, 'trade');
  assert.equal(mudae.tradeOf('s', 'a'), null, 'a troca acabou');
  assert.throws(() => mudae.tradeConfirm(store, t.id, 'a', { rev: t.rev }), /não encontrada/);
});

test('troca: carta que sumiu antes de fechar cancela tudo sem mexer em ninguém', () => {
  const { mudae, store, marry } = setup();
  marry('a', 1);
  marry('a', 2);
  marry('b', 3);
  store.kakera = { a: 500 };
  const t = mudae.tradeOpen(store, { serverId: 's', a: 'a', b: 'b' });
  mudae.tradeOffer(store, t.id, 'a', { chars: [1, 2], kakera: 500 });
  mudae.tradeOffer(store, t.id, 'b', { chars: [3] });
  mudae.tradeConfirm(store, t.id, 'a', { rev: t.rev });
  // Depois de oferecer, Ana se divorcia da Mikasa (pelo álbum, fora da troca).
  mudae.divorceId(store, 'a', 2);
  const before = JSON.stringify(store);
  mudae.tradeConfirm(store, t.id, 'b', { rev: t.rev });
  assert.equal(t.state, 'canceled');
  assert.match(t.reason, /Mikasa Ackerman não estava mais/);
  assert.equal(JSON.stringify(store), before, 'nada mudou: nem cartas, nem kakera, nem histórico');

  // Faltou kakera na hora (gastou depois de oferecer).
  const t2 = mudae.tradeOpen(store, { serverId: 's', a: 'a', b: 'b' });
  mudae.tradeOffer(store, t2.id, 'a', { kakera: 100 });
  mudae.tradeConfirm(store, t2.id, 'a', { rev: t2.rev });
  store.kakera.a = 99;
  mudae.tradeConfirm(store, t2.id, 'b', { rev: t2.rev });
  assert.equal(t2.state, 'canceled');
  assert.match(t2.reason, /Faltou kakera/);
  assert.equal(store.kakera.a, 99);

  // Quem saiu do servidor não recebe nada.
  const t3 = mudae.tradeOpen(store, { serverId: 's', a: 'a', b: 'b' });
  mudae.tradeOffer(store, t3.id, 'a', { chars: [1] });
  mudae.tradeConfirm(store, t3.id, 'a', { rev: t3.rev });
  mudae.tradeConfirm(store, t3.id, 'b', { rev: t3.rev, isMember: (id) => id !== 'b' });
  assert.equal(t3.state, 'canceled');
  assert.equal(store.claims[1].ownerId, 'a');
});

test('troca: vence 5 min depois da última mudança, cancela por quem está nela e tem limite de cartas', () => {
  const many = Array.from({ length: TRADE_MAX + 1 }, (_, i) => [i + 1, `P${i}`, 'Obra', `b${i}.png`, 'F', 100 - i]);
  const { mudae, store, advance } = setup({ catalog: many });
  for (const [id] of many) store.claims[id] = { ownerId: 'a', at: 0 };
  const t = mudae.tradeOpen(store, { serverId: 's', a: 'a', b: 'b' });
  assert.throws(() => mudae.tradeOffer(store, t.id, 'a', { chars: many.map(([id]) => id) }), /No máximo 20/);
  mudae.tradeOffer(store, t.id, 'a', { chars: [1] });
  advance(TRADE_TTL - 10);
  assert.equal(mudae.tradeExpire(t.id), null, 'ainda não venceu');
  mudae.tradeOffer(store, t.id, 'a', { chars: [2] });
  advance(TRADE_TTL - 10);
  assert.equal(mudae.tradeExpire(t.id), null, 'a mudança renovou o prazo');
  advance(20);
  assert.equal(mudae.tradeExpire(t.id).reason, 'O tempo acabou.');
  assert.equal(t.state, 'canceled');
  assert.equal(store.claims[2].ownerId, 'a');

  const t2 = mudae.tradeOpen(store, { serverId: 's', a: 'a', b: 'b' });
  assert.throws(() => mudae.tradeCancel(t2.id, 'c'), /não encontrada/);
  const canceled = mudae.tradeCancel(t2.id, 'b', 'Beto');
  assert.equal(canceled.state, 'canceled');
  assert.equal(canceled.reason, 'Beto cancelou.');
  advance(TRADE_TTL + 1);
  const t3 = mudae.tradeOpen(store, { serverId: 's', a: 'a', b: 'b' });
  advance(TRADE_TTL + 1);
  assert.deepEqual(mudae.sweepTrades().map((x) => x.id), [t3.id], 'a varredura acha as vencidas');
});

test('parse: comandos da Forja e dos poderes', () => {
  for (const [text, cmd, arg] of [['$forja', 'forja', ''], ['$badges', 'forja', ''], ['$FORJA', 'forja', ''], ['$forjar bronze', 'forjar', 'bronze'],
    ['$forjar Diamante', 'forjar', 'Diamante'], ['$poderes', 'poderes', ''], ['$poder cadeado', 'poder', 'cadeado'], ['$poder laço', 'poder', 'laço']]) {
    assert.deepEqual(parse(text), { cmd, arg }, text);
  }
  assert.ok(!isRoll('forja') && !isRoll('poder'));
});
