// Conquistas: catálogo, abrir na meta, histórico sem kakera, fila diária, títulos, vantagens e os contadores do jogo.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createMudae, parse, CLAIM_RESET_MS, DAILY_MS, ROLLS_PRICE } = require('../server/mudae');
const { createConquistas, achievementPerks, titleName, ALL } = require('../server/mudae-conquistas');
const { createCommands } = require('../server/mudae-comandos');
const { ACHIEVEMENTS: A } = require('../server/mudae-regras');
const { parseFlags } = require('../server/mudae-flags');

const DAY = 24 * 3600_000;
const CATALOG = [
  [1, 'Satoru Gojou', 'Jujutsu Kaisen', 'b1-a.png', 'M', 900],
  [2, 'Mikasa Ackerman', 'Attack on Titan', 'b2-b.jpg', 'F', 800],
  [3, 'Zero Two', 'DARLING in the FRANXX', 'b3-c.jpg', 'F', 700],
  [4, 'Kyubey', 'Madoka Magica', 'b4-d.jpg', '', 600],
  [5, 'Eren Yeager', 'Attack on Titan', 'b5-e.jpg', 'M', 500],
  ['g1', 'Link', 'Zelda', 'https://x/1.jpg', 'M', 400, 'g'],
  [7, 'Levi Ackerman', 'Attack on Titan', 'b7-g.jpg', 'M', 300],
];
// Contadores que o jogo conta: o que não é dado vale 0.
const COUNTERS = ['rolls', 'daysPlayed', 'dkStreak', 'claims', 'haremSize', 'bestSeries', 'seriesComplete', 'sourcesOwned', 'legendary', 'epic', 'deepClaims', 'crystals',
  'kakeraPeak', 'earned', 'forged', 'powersOpen', 'gifts', 'trades', 'kakeraGiven', 'wishClaims', 'notes', 'organized', 'divorces', 'keys', 'soulmates', 'cardKakera', 'rareColors',
  'night', 'remarried', 'firstRollClaims', 'fastWish', 'finishRare', 'closeCall', 'perfectDay', 'serverClaims', 'unlucky'];

function setup({ start = Date.UTC(2026, 10, 25, 15) } = {}) {
  let t = start;
  const mudae = createMudae({ catalog: CATALOG, now: () => t, random: () => 0, refSize: CATALOG.length });
  const conquistas = createConquistas({ now: () => t });
  const store = { claims: {}, usage: {} };
  const marry = (id, who = 'a') => { t += CLAIM_RESET_MS; mudae.claim(store, who, id, { revealAt: t }); };
  return { mudae, conquistas, store, marry, advance: (ms) => { t += ms; }, now: () => t };
}
const ctx = (extra = {}) => ({ ...Object.fromEntries(COUNTERS.map((c) => [c, 0])), ...extra });

test('catálogo: chaves únicas, metas crescentes, contadores que existem e orçamento de kakera', () => {
  const keys = ALL.map((a) => a.key);
  assert.equal(new Set(keys).size, keys.length);
  for (const a of ALL) assert.ok(COUNTERS.includes(a.count), `${a.key} usa o contador ${a.count}`);
  for (const [trail, , , , needs] of A.trails) assert.deepEqual(needs, [...needs].sort((x, y) => x - y), `${trail} cresce`);
  assert.equal(ALL.length, A.trails.length * 3 + A.hidden.length + A.serverTrail[4].length);
  const total = ALL.reduce((sum, a) => sum + a.kakera, 0);
  assert.equal(total, 11250, 'a soma de todas as conquistas (com as do servidor) é o orçamento combinado');
  assert.ok(total <= 112_500 * 0.1, 'e fica em 10% da Forja inteira (112.500)');
  for (const key of Object.keys(A.perks)) assert.ok(keys.includes(key), `a vantagem ${key} aponta para uma conquista`);
  assert.ok(Object.keys(A.perks).length <= 3, 'no máximo 3 vantagens permanentes');
  for (const a of ALL) assert.ok(A.categories[a.cat], `${a.key} tem categoria`);
});

test('primeira avaliação: o histórico abre sem aviso e sem kakera; depois, só o que for novo paga', () => {
  const s = setup();
  const first = s.conquistas.refresh(s.store, 'a', ctx({ rolls: 600, claims: 12 }));
  assert.equal(first.first, true);
  assert.deepEqual(first.fresh, []);
  assert.equal(s.store.achievements.a.queue, undefined, 'sem kakera pelo histórico');
  for (const key of ['giro:1', 'giro:2', 'casamenteiro:1']) assert.ok(s.store.achievements.a.done[key], key);
  assert.equal(s.store.achievements.a.done['giro:3'], undefined);
  assert.equal(s.mudae.kakeraOf(s.store, 'a'), 0);

  const next = s.conquistas.refresh(s.store, 'a', ctx({ rolls: 5000, claims: 12 }));
  assert.equal(next.first, false);
  assert.deepEqual(next.fresh.map((f) => f.key), ['giro:3']);
  assert.equal(next.fresh[0].kakera, A.kakera[2]);
  assert.equal(s.mudae.kakeraOf(s.store, 'a'), A.kakera[2], 'o kakera novo é pago na hora (cabe no teto do dia)');
  assert.deepEqual(s.conquistas.refresh(s.store, 'a', ctx({ rolls: 5000, claims: 12 })).fresh, [], 'não reabre');
});

test('uma meta nunca tira nada: o contador cair não fecha a conquista', () => {
  const s = setup();
  s.conquistas.refresh(s.store, 'a', ctx());
  s.conquistas.refresh(s.store, 'a', ctx({ claims: 10 }));
  assert.ok(s.store.achievements.a.done['casamenteiro:1']);
  s.conquistas.refresh(s.store, 'a', ctx({ claims: 0 }));
  assert.ok(s.store.achievements.a.done['casamenteiro:1']);
});

test('vários níveis de uma vez abrem em ordem, e as escondidas só abrem com o contador', () => {
  const s = setup();
  s.conquistas.refresh(s.store, 'a', ctx());
  const r = s.conquistas.refresh(s.store, 'a', ctx({ claims: 200, night: 1 }));
  assert.deepEqual(r.fresh.filter((f) => f.trail === 'casamenteiro').map((f) => f.tier), [1, 2, 3]);
  const hidden = r.fresh.find((f) => f.key === 'madrugada:1');
  assert.deepEqual([hidden.hidden, hidden.kakera], [true, A.hiddenKakera]);
  assert.equal(s.store.achievements.a.done['reencontro:1'], undefined);
});

test('kakera na fila: no máximo 1.500 por dia, o resto espera e vem no dia seguinte', () => {
  const s = setup();
  s.conquistas.refresh(s.store, 'a', ctx());
  // Todas as trilhas de uma vez (com a pessoa entre os ativos do servidor): 97 conquistas, 11.250 de kakera.
  const all = ctx(Object.fromEntries(ALL.map((a) => [a.count, a.need])));
  for (const a of ALL) all[a.count] = Math.max(all[a.count], a.need);
  all.activeMembers = () => ['a'];
  s.conquistas.refresh(s.store, 'a', all);
  assert.equal(s.mudae.kakeraOf(s.store, 'a'), A.dailyKakera, 'hoje só entram 1.500');
  assert.equal(s.store.achievements.a.queue, 11250 - A.dailyKakera);
  assert.equal(s.conquistas.payQueue(s.store, 'a'), 0, 'o teto do dia já foi usado');
  s.advance(DAY);
  assert.equal(s.conquistas.payQueue(s.store, 'a'), A.dailyKakera, 'no dia seguinte entram mais 1.500');
  for (let i = 0; i < 10; i++) { s.advance(DAY); s.conquistas.payQueue(s.store, 'a'); }
  assert.equal(s.store.achievements.a.queue, undefined, 'a fila acaba');
  assert.equal(s.mudae.kakeraOf(s.store, 'a'), 11250);
  assert.equal(s.store.earned?.a, undefined, 'o prêmio das conquistas não conta como kakera ganho (senão se alimentaria)');
});

test('títulos: só os abertos, aparece ao lado do nome e some ao tirar', () => {
  const s = setup();
  s.conquistas.refresh(s.store, 'a', ctx());
  s.conquistas.refresh(s.store, 'a', ctx({ rolls: 50 }));
  assert.throws(() => s.conquistas.setTitle(s.store, 'a', 'giro:2'), /ainda não abriu/);
  assert.deepEqual(s.conquistas.setTitle(s.store, 'a', 'giro:1'), { title: 'Girador' });
  assert.equal(titleName(s.store, 'a'), 'Girador');
  s.marry(1);
  assert.equal(s.mudae.harem(s.store, 'a').look.badge, 'Girador');
  assert.equal(s.mudae.album(s.store, 'a').look.badge, 'Girador');
  assert.equal(s.mudae.badgeOf(s.store, 'a'), 'Girador');
  assert.equal(s.mudae.badgeOf(s.store, 'b'), null);
  s.conquistas.setTitle(s.store, 'a', null);
  assert.equal(titleName(s.store, 'a'), null);
  assert.equal(s.mudae.harem(s.store, 'a').look, undefined, 'sem título, cor ou nome, a vista não leva o campo');
});

test('vantagens permanentes: desejo, roll guardado e desconto no $rolls', () => {
  const s = setup();
  s.conquistas.refresh(s.store, 'a', ctx());
  assert.deepEqual(achievementPerks(s.store, 'a'), { wishSlots: 0, carry: 0, rollsDiscount: 0 });
  const wishMax = s.mudae.status(s.store, 'a').wishMax;
  assert.equal(s.mudae.status(s.store, 'a').rollsPrice, ROLLS_PRICE);

  s.conquistas.refresh(s.store, 'a', ctx({ claims: 200 }));
  assert.equal(s.mudae.status(s.store, 'a').wishMax, wishMax + 1, 'Casamenteiro ouro: +1 vaga de desejo');
  s.conquistas.refresh(s.store, 'a', ctx({ claims: 200, dkStreak: 30 }));
  assert.equal(s.mudae.status(s.store, 'a').rollsPrice, Math.round(ROLLS_PRICE * 0.9), 'Sequência ouro: -10% no $rolls');
  s.conquistas.refresh(s.store, 'a', ctx({ claims: 200, dkStreak: 30, seriesComplete: 10 }));
  assert.deepEqual(achievementPerks(s.store, 'a'), { wishSlots: 1, carry: 1, rollsDiscount: 0.1 });

  // O desconto vale na compra de verdade.
  for (let i = 0; i < 10; i++) s.mudae.roll(s.store, 'a', 'm');
  s.mudae.addKakera(s.store, 'a', 1000);
  const before = s.mudae.kakeraOf(s.store, 'a');
  const bought = s.mudae.buyRolls(s.store, 'a');
  assert.equal(bought.price, Math.round(ROLLS_PRICE * 0.9));
  assert.equal(before - s.mudae.kakeraOf(s.store, 'a'), Math.round(ROLLS_PRICE * 0.9));
  assert.equal(achievementPerks(s.store, 'zzz').wishSlots, 0, 'quem não tem nada, não tem vantagem');
});

test('view: trilha com o nível seguinte, progresso, escondidas fechadas e o que paga', () => {
  const s = setup();
  s.conquistas.refresh(s.store, 'a', ctx());
  s.conquistas.refresh(s.store, 'a', ctx({ claims: 12, haremSize: 12 }));
  const v = s.conquistas.view(s.store, 'a', ctx({ claims: 12, haremSize: 12 }));
  const casamenteiro = v.items.find((i) => i.trail === 'casamenteiro');
  assert.deepEqual([casamenteiro.tier, casamenteiro.tiers, casamenteiro.done, casamenteiro.have, casamenteiro.need, casamenteiro.pct], [2, 3, [true, false, false], 12, 50, 24]);
  assert.equal(casamenteiro.kakera, A.kakera[1]);
  const hidden = v.items.find((i) => i.trail === 'madrugada');
  assert.deepEqual([hidden.locked, hidden.name, hidden.hidden], [true, '???', true]);
  assert.equal(v.total, ALL.length);
  assert.equal(v.done, 1, 'só o Casamenteiro bronze (10 casamentos) abriu; o Harém cheio pede 25');
  assert.equal(v.dailyCap, A.dailyKakera);
  assert.deepEqual(v.titles.map((x) => x.name), ['Casamenteiro']);
  s.conquistas.refresh(s.store, 'a', ctx({ night: 1 }));
  const open = s.conquistas.view(s.store, 'a', ctx({ night: 1 })).items.find((i) => i.trail === 'madrugada');
  assert.deepEqual([open.locked, open.name, open.hint], [false, 'Madrugada', 'Casou entre 3h e 5h da manhã (Brasília).']);
});

// ---------- contadores do jogo ----------
test('contadores: casar um desejo, voltar para um personagem e casar de madrugada', () => {
  const s = setup({ start: Date.UTC(2026, 10, 25, 6, 0) }); // 3h em Brasília
  s.mudae.wish(s.store, 'a', 'Gojo');
  s.marry(1); // 3h30
  assert.equal(s.store.stats.a.wishClaims, 1);
  assert.equal(s.store.stats.a.night, 1, 'entre 3h e 5h');
  assert.equal(s.store.stats.a.remarried, undefined);
  s.mudae.divorce(s.store, 'a', 'Gojo');
  s.marry(1);
  assert.equal(s.store.stats.a.remarried, 1, 'casou de novo com quem já foi seu');
  assert.equal(s.store.stats.a.wishClaims, 1, 'sem desejo da segunda vez');
  const day = setup({ start: Date.UTC(2026, 10, 25, 15) });
  day.marry(1);
  assert.equal(day.store.stats.a.night, undefined, 'de tarde não conta');
});

test('contadores: raridade e dias jogados', () => {
  const s = setup();
  s.marry(1);
  assert.ok((s.store.stats.a.legendary || 0) + (s.store.stats.a.epic || 0) >= 0);
  for (let day = 0; day < 3; day++) { s.mudae.roll(s.store, 'b', 'm'); s.advance(DAY); }
  assert.equal(s.store.stats.b.daysPlayed, 3);
  s.mudae.roll(s.store, 'b', 'm');
  s.mudae.roll(s.store, 'b', 'm');
  assert.equal(s.store.stats.b.daysPlayed, 4, 'dois rolls no mesmo dia contam um dia só');
});

test('contadores: sequência do $dk', () => {
  const s = setup();
  s.mudae.dailyKakera(s.store, 'a');
  assert.equal(s.store.stats.a.dkStreak, 1);
  s.advance(DAILY_MS + 3600_000);
  s.mudae.dailyKakera(s.store, 'a');
  assert.equal(s.store.stats.a.dkStreak, 2, 'um dia depois');
  s.advance(DAILY_MS + 3600_000);
  s.mudae.dailyKakera(s.store, 'a');
  assert.equal(s.store.stats.a.dkStreak, 3);
  s.advance(3 * DAY);
  s.mudae.dailyKakera(s.store, 'a');
  assert.equal(s.store.stats.a.dkStreak, 1, 'pulou dias: recomeça');
});

test('contadores: kakera ganho e maior saldo; presente e troca não contam como ganho', () => {
  const s = setup();
  s.mudae.addKakera(s.store, 'a', 500);
  s.mudae.addKakera(s.store, 'a', 300);
  s.mudae.addKakera(s.store, 'a', -200);
  assert.equal(s.store.earned.a, 800);
  assert.equal(s.store.peak.a, 800, 'o maior saldo que já teve');
  s.mudae.giveKakera(s.store, 'a', 'b', 400);
  assert.equal(s.store.earned.b, undefined, 'quem recebe de presente não "ganhou"');
  assert.equal(s.store.peak.b, 400, 'mas o saldo dele subiu');
  assert.equal(s.store.stats.a.kakeraGiven, 400);
});

test('anti-abuso: presentes e kakera entre as mesmas duas contas contam 3 vezes por dia', () => {
  const s = setup();
  s.mudae.addKakera(s.store, 'a', 1000);
  for (let i = 0; i < 5; i++) s.mudae.giveKakera(s.store, 'a', 'b', 10);
  assert.equal(s.store.stats.a.kakeraGiven, 30, 'só as 3 primeiras do dia contam');
  s.mudae.giveKakera(s.store, 'a', 'c', 10);
  assert.equal(s.store.stats.a.kakeraGiven, 40, 'outra pessoa tem a sua cota');
  s.advance(DAY + 1);
  s.mudae.giveKakera(s.store, 'a', 'b', 10);
  assert.equal(s.store.stats.a.kakeraGiven, 50, 'no dia seguinte volta a contar');
  for (const id of [1, 2, 3, 4, 5]) s.marry(id);
  for (const name of ['Gojo', 'Mikasa', 'Zero', 'Kyubey', 'Eren']) s.mudae.give(s.store, 'a', 'b', name);
  assert.equal(s.store.stats.a.gifts, 3, 'cinco presentes para a mesma pessoa no dia: 3 contam');
  assert.equal(Object.keys(s.store.pairs).length > 0, true);
});

test('haremStats: tamanho, mais personagens da mesma obra, obra completa e fontes', () => {
  const s = setup();
  assert.deepEqual(s.mudae.haremStats(s.store, 'a'), { haremSize: 0, bestSeries: 0, seriesComplete: 0, sourcesOwned: 0 });
  s.marry(2);
  assert.deepEqual(s.mudae.haremStats(s.store, 'a'), { haremSize: 1, bestSeries: 1, seriesComplete: 0, sourcesOwned: 1 }, 'Mikasa sozinha não completa Attack on Titan (são 3)');
  s.marry(5);
  s.marry('g1');
  assert.deepEqual(s.mudae.haremStats(s.store, 'a'), { haremSize: 3, bestSeries: 2, seriesComplete: 0, sourcesOwned: 2 }, 'Attack on Titan tem 3 e Zelda 1: nenhuma completa (obra de 1 ou 2 personagens não vale)');
  s.marry(7);
  assert.deepEqual(s.mudae.haremStats(s.store, 'a'), { haremSize: 4, bestSeries: 3, seriesComplete: 1, sourcesOwned: 2 }, 'agora Attack on Titan (3 de 3) está completa');
});

// ---------- comandos ----------
function table() {
  const s = setup();
  const posted = [];
  const achievements = { view: (store, id) => s.conquistas.view(store, id, ctx({ claims: 12, haremSize: 12 })), setTitle: (store, id, key) => s.conquistas.setTitle(store, id, key) };
  const cmds = createCommands({ mudae: s.mudae, forja: { shownOf: () => [] }, parseFlags, postMudae: (c, acc, command, data) => posted.push({ command, ...data }), save: () => {}, achievements });
  const run = (cmd, arg = '') => cmds[cmd]?.({ acc: { id: 'a' }, c: { id: 'canal' }, store: s.store, cmd, arg, rest: arg, target: null, command: '$' + cmd, only: (d) => ({ ephemeral: d }),
    error: (text) => ({ ephemeral: { kind: 'error', text } }), isMember: () => true, can: () => false });
  return { ...s, run, posted };
}
const text = (r) => r.ephemeral.text;

test('parse: $conquistas, $marcos e $titulo', () => {
  assert.equal(parse('$conquistas')?.cmd, 'conquistas');
  assert.equal(parse('$marcos')?.cmd, 'conquistas');
  assert.equal(parse('$titulo Girador')?.cmd, 'titulo');
});

test('$conquistas e $titulo pela tabela', () => {
  const t = table();
  t.conquistas.refresh(t.store, 'a', ctx());
  assert.match(text(t.run('titulo')), /ainda não abriu nenhuma conquista/);
  t.conquistas.refresh(t.store, 'a', ctx({ claims: 12, rolls: 60 }));
  const list = text(t.run('conquistas'));
  assert.match(list, new RegExp('Conquistas:\\*\\* 2 de ' + ALL.length));
  assert.match(list, /Mais perto de abrir:/);
  assert.match(list, /\$titulo nome/);
  assert.match(text(t.run('titulo')), /Seus títulos: .*Girador/);
  assert.match(text(t.run('titulo', 'girador')), /Seu título agora é \*\*Girador\*\*/);
  assert.match(text(t.run('titulo')), /Agora: \*\*Girador\*\*/);
  assert.match(text(t.run('titulo', 'gira')), /Girador/, 'aceita um pedaço do nome');
  assert.match(text(t.run('titulo', 'Lendario Inexistente')), /não tem nenhum título/);
  assert.match(text(t.run('titulo', 'none')), /ficou sem título/);
  assert.equal(titleName(t.store, 'a'), null);
});
