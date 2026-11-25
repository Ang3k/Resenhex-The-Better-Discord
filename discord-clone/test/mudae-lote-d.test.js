// Lote D: o que o servidor tira da roleta ($serverdisable), ajustes e moderação do servidor, $kakerareact, curtidas pelo álbum
// e os comandos de utilidade ($mu, $ru, $bonus, $overview, $left).
const test = require('node:test');
const assert = require('node:assert/strict');
const { createMudae, parse, CLAIM_RESET_MS, CLAIM_WINDOW_MS, PRIORITY_MS } = require('../server/mudae');
const { createCommands } = require('../server/mudae-comandos');
const { SETTINGS, ROLL_FILTER, KAKERA_COLORS } = require('../server/mudae-regras');
const { parseFlags } = require('../server/mudae-flags');

// Personagens de várias fontes; o mais popular (k = 0) é o primeiro.
const SMALL = [
  [1, 'Satoru Gojou', 'Jujutsu Kaisen', 'b1-a.png', 'M', 900],
  [2, 'Mikasa Ackerman', 'Attack on Titan', 'b2-b.jpg', 'F', 800],
  [3, 'Zero Two', 'DARLING in the FRANXX', 'b3-c.jpg', 'F', 700],
  [4, 'Kyubey', 'Madoka Magica', 'b4-d.jpg', '', 600],
  [5, 'Eren Yeager', 'Attack on Titan', 'b5-e.jpg', 'M', 500],
];
const MIXED = [
  ['c1', 'Spider-Man', 'Marvel', 'https://x/1.jpg', 'M', 9000, 'c'],
  ['d1', 'Homer Simpson', 'Os Simpsons', 'https://x/2.jpg', 'M', 8000, 'd'],
  ['s1', 'Tyrion Lannister', 'Game of Thrones', 'https://x/3.jpg', 'M', 7000, 's'],
  [1, 'Satoru Gojou', 'Jujutsu Kaisen', 'b1-a.png', 'M', 600],
  [2, 'Mikasa Ackerman', 'Attack on Titan', 'b2-b.jpg', 'F', 500],
];
// Nomes únicos (Zq0001x...) para a busca por nome nunca confundir um personagem com outro.
const BIG = Array.from({ length: 900 }, (_, i) => [i + 1, `Zq${String(i + 1).padStart(4, '0')}x`, `Obra ${i % 9}`, `b${i + 1}-x.png`, 'M', 100000 - i]);

function setup(catalog = SMALL, { random = () => 0 } = {}) {
  let t = 10 * CLAIM_RESET_MS + 1000;
  const mudae = createMudae({ catalog, now: () => t, random, refSize: catalog.length });
  const store = { claims: {}, usage: {} };
  const marry = (id, who = 'a') => { t += CLAIM_RESET_MS; mudae.claim(store, who, id, { revealAt: t }); };
  return { mudae, store, marry, advance: (ms) => { t += ms; }, now: () => t };
}
const rolled = (s, who = 'b', kind = 'm') => s.mudae.roll(s.store, who, kind).card.id;
const all = () => true;

test('parse: comandos dos ajustes, da moderação e da roleta do servidor', () => {
  for (const [text, cmd] of [['$sd Naruto', 'serverdisable'], ['$serverdisable Naruto', 'serverdisable'], ['$settings', 'settings'], ['$settimer 30', 'settimer'], ['$setrolls 5', 'setrolls'],
    ['$haremlimit 50', 'haremlimit'], ['$togglesnipe', 'togglesnipe'], ['$togglecrystals', 'togglecrystals'], ['$forcedivorce Gojo', 'forcedivorce'],
    ['$userdivorce <@b>', 'userdivorce'], ['$rl', 'restorelist'], ['$restore Gojo', 'restore'], ['$left', 'left'], ['$mu', 'mu'], ['$ru', 'ru'], ['$bonus', 'bonus'],
    ['$overview', 'overview'], ['$kakerareact roxo estrela', 'kakerareact']]) {
    assert.equal(parse(text)?.cmd, cmd, text);
  }
});

test('os filtros pessoais da roleta ($disable, $limroul, $togglewestern, $toggleirl) não existem', () => {
  for (const text of ['$disable Naruto', '$d Naruto', '$disablelist', '$dl', '$antidisable Naruto', '$ad Naruto', '$limroul 5000', '$togglewestern', '$tw', '$toggleirl']) {
    assert.equal(parse(text), null, text);
  }
});

test('$serverdisable: a obra sai da roleta de todo mundo e volta ao repetir', () => {
  const s = setup();
  assert.equal(rolled(s, 'b'), 1, 'sem filtro, o sorteio de teste cai no mais popular');
  assert.deepEqual(s.mudae.serverDisable(s.store, 'Jujutsu'), { series: 'Jujutsu Kaisen', back: false });
  assert.equal(rolled(s, 'b'), 2, 'Jujutsu saiu: o próximo é a Mikasa');
  s.advance(1);
  assert.equal(rolled(s, 'c'), 2, 'e vale para todo mundo');
  assert.deepEqual(s.mudae.serverDisabledView(s.store), { series: ['Jujutsu Kaisen'], chars: [] });
  assert.deepEqual(s.mudae.serverDisable(s.store, 'Jujutsu'), { series: 'Jujutsu Kaisen', back: true });
  assert.equal(s.store.serverOff, undefined, 'sem nada fora, nada fica guardado');
  assert.equal(rolled(s, 'b'), 1);
});

test('$serverdisable com um personagem, erros e limite', () => {
  const s = setup();
  const r = s.mudae.serverDisable(s.store, 'Gojo');
  assert.deepEqual([r.card.name, r.back], ['Satoru Gojou', false]);
  assert.equal(rolled(s, 'b'), 2);
  assert.deepEqual(s.mudae.serverDisabledView(s.store).chars, ['Satoru Gojou']);
  assert.equal(s.mudae.serverDisable(s.store, 'Gojo').back, true);
  assert.match(s.mudae.serverDisable(s.store, 'Obra Que Nao Existe Zzz').error, /Nada encontrado/);
  s.store.serverOff = { series: Array.from({ length: ROLL_FILTER.serverDisabledMax }, (_, i) => 'Obra ' + i), chars: [] };
  assert.match(s.mudae.serverDisable(s.store, 'Gojo').error, /já tirou/);
});

test('o filtro do servidor nunca trava: com tudo fora, o roll ainda sai', () => {
  const s = setup(SMALL);
  for (const name of ['Jujutsu', 'Attack on Titan', 'FRANXX', 'Madoka']) s.mudae.serverDisable(s.store, name);
  assert.ok(rolled(s, 'b'), 'sem nenhum personagem permitido, volta ao sorteio normal');
});

test('ajustes do servidor: números dentro da faixa, ligar e desligar, e voltar ao padrão', () => {
  const s = setup();
  assert.equal(s.mudae.setting(s.store, 'claimWindowSec'), SETTINGS.claimWindowSec.def);
  assert.equal(s.mudae.setSetting(s.store, 'claimWindowSec', '90').value, 90);
  assert.equal(s.mudae.setting(s.store, 'claimWindowSec'), 90);
  for (const bad of ['5', '500', 'abc', '1.5']) assert.match(s.mudae.setSetting(s.store, 'claimWindowSec', bad).error, /Diga um número/, bad);
  assert.match(s.mudae.setSetting(s.store, 'rolls', '11').error, /2 a 10/);
  assert.equal(s.mudae.setSetting(s.store, 'haremLimit', '0').value, 0, '0 é "sem limite"');
  assert.match(s.mudae.setSetting(s.store, 'haremLimit', '5').error, /0 \(sem limite\) ou 10 a 5000/);
  assert.equal(s.mudae.setSetting(s.store, 'snipe').value, false, 'sem valor, alterna');
  assert.equal(s.mudae.setSetting(s.store, 'snipe').value, true);
  assert.match(s.mudae.setSetting(s.store, 'nada', '1').error, /não existe/);
  s.mudae.setSetting(s.store, 'claimWindowSec', String(SETTINGS.claimWindowSec.def));
  assert.equal(s.store.settings, undefined, 'valores de fábrica não ficam guardados');
  assert.equal(s.mudae.settingsView(s.store).length, Object.keys(SETTINGS).length);
});

test('ajuste: tempo para casar e rolls por janela', () => {
  const s = setup();
  const claimAt = (ms) => { s.advance(CLAIM_RESET_MS); const revealAt = s.now() - ms; return () => s.mudae.claim(s.store, 'b', 1, { revealAt, rollerId: 'a', priority: 0 }); };
  assert.throws(claimAt(CLAIM_WINDOW_MS + 5000), /Tarde demais/, 'o padrão é 45 s');
  s.mudae.setSetting(s.store, 'claimWindowSec', '120');
  assert.doesNotThrow(claimAt(CLAIM_WINDOW_MS + 5000), 'com 120 s, passa');
  s.mudae.setSetting(s.store, 'rolls', '4');
  assert.equal(s.mudae.status(s.store, 'c').rollsMax, 4);
  s.store.claims = {}; // livre: personagem casado e lendário devolveria o roll (consolo)
  for (let i = 0; i < 4; i++) assert.ok(!s.mudae.roll(s.store, 'c', 'm').error);
  assert.match(s.mudae.roll(s.store, 'c', 'm').error, /limitada a 4 rolls/);
});

test('ajuste: sem snipe só quem rodou casa; o Laço continua valendo', () => {
  const s = setup();
  s.mudae.setSetting(s.store, 'snipe', undefined);
  s.advance(CLAIM_RESET_MS);
  const base = { revealAt: s.now() - PRIORITY_MS - 100, rollerId: 'a', priority: PRIORITY_MS };
  assert.throws(() => s.mudae.claim(s.store, 'b', 1, base), /só quem rodou/);
  assert.doesNotThrow(() => s.mudae.claim(s.store, 'b', 2, { ...base, lasso: true }), 'o poder Laço passa');
  assert.doesNotThrow(() => s.mudae.claim(s.store, 'a', 1, base), 'quem rodou casa');
});

test('ajuste: limite do harém impede casar além dele, e vira vaga ao divorciar', () => {
  const s = setup(BIG);
  s.mudae.setSetting(s.store, 'haremLimit', '10');
  for (let i = 1; i <= 10; i++) s.marry(i);
  assert.throws(() => s.marry(11), /harém está cheio.*10/);
  s.mudae.divorce(s.store, 'a', 'Zq0001x');
  assert.doesNotThrow(() => s.marry(11));
  assert.doesNotThrow(() => s.marry(12, 'b'), 'o limite é por pessoa');
});

test('moderação: $forcedivorce não devolve kakera, guarda para restaurar e limpa nota e imagens', () => {
  const s = setup();
  s.marry(1);
  s.mudae.haremTools.note(s.store, 'a', 'char', 'Gojo $ minha nota');
  s.store.images = { 1: { list: ['https://i.imgur.com/Abc123x.png'], pick: 1 } };
  const r = s.mudae.forceDivorce(s.store, 'mod', 'Gojo');
  assert.deepEqual([r.card.name, r.ownerId], ['Satoru Gojou', 'a']);
  assert.equal(s.mudae.kakeraOf(s.store, 'a'), 0, 'sem kakera');
  assert.equal(s.store.claims[1], undefined);
  assert.equal(s.store.notes, undefined);
  assert.equal(s.store.images, undefined);
  assert.match(s.mudae.forceDivorce(s.store, 'mod', 'Gojo').error, /não tem dono/);
  assert.match(s.mudae.forceDivorce(s.store, 'mod', 'Nome Que Nao Existe Zzz').error, /Nenhum personagem/);
  const list = s.mudae.restoreList(s.store);
  assert.deepEqual([list.length, list[0].name, list[0].ownerId, list[0].by], [1, 'Satoru Gojou', 'a', 'mod']);
  assert.deepEqual(s.mudae.restore(s.store, 'Gojo', all).ownerId, 'a');
  assert.equal(s.store.claims[1].ownerId, 'a', 'voltou para o dono');
  assert.equal(s.store.restore, undefined);
  assert.match(s.mudae.restore(s.store, 'Gojo', all).error, /lista de restauração/);
});

test('moderação: restaurar não passa por cima de um novo dono nem de quem saiu', () => {
  const s = setup();
  s.marry(1);
  s.mudae.forceDivorce(s.store, 'mod', 'Gojo');
  s.marry(1, 'b');
  assert.match(s.mudae.restore(s.store, 'Gojo', all).error, /já tem dono/);
  s.mudae.forceDivorce(s.store, 'mod', 'Gojo');
  assert.match(s.mudae.restore(s.store, 'Gojo', (id) => id !== 'b').error, /saiu do servidor/);
});

test('moderação: $userdivorce pede confirmação, tira tudo e dá para restaurar', () => {
  const s = setup();
  for (const id of [1, 2, 3]) s.marry(id);
  assert.deepEqual(s.mudae.userDivorce(s.store, 'mod', 'a', false), { count: 3, preview: true });
  assert.equal(Object.keys(s.store.claims).length, 3, 'a prévia não tira ninguém');
  assert.deepEqual(s.mudae.userDivorce(s.store, 'mod', 'a', true), { count: 3 });
  assert.equal(Object.keys(s.store.claims).length, 0);
  assert.equal(s.mudae.restoreList(s.store).length, 3);
  assert.match(s.mudae.userDivorce(s.store, 'mod', 'a', true).error, /não tem ninguém/);
});

test('o restorelist guarda só os mais recentes (o limite está em ROLL_FILTER.restoreKeep)', () => {
  const s = setup(BIG);
  for (let i = 1; i <= ROLL_FILTER.restoreKeep + 20; i++) { s.store.claims[i] = { ownerId: 'a', at: 1 }; s.mudae.forceDivorce(s.store, 'mod', `Zq${String(i).padStart(4, '0')}x`); }
  assert.equal(s.store.restore.length, ROLL_FILTER.restoreKeep);
});

test('$left: quantos personagens ainda estão livres', () => {
  const s = setup();
  assert.deepEqual(s.mudae.left(s.store), { total: 5, claimed: 0, free: 5 });
  s.marry(1);
  s.marry(2, 'b');
  assert.deepEqual(s.mudae.left(s.store), { total: 5, claimed: 2, free: 3 });
});

test('$kakerareact: forma por cor, lista, voltar ao padrão e validação', () => {
  const s = setup();
  const v = s.mudae.visual;
  assert.deepEqual(v.kakeraIcon(s.store, 'a', 'roxo estrela'), { icons: { roxo: 'estrela' }, color: 'roxo', shape: 'estrela' });
  const rainbow = v.kakeraIcon(s.store, 'a', 'Arco-Íris coração');
  assert.deepEqual([rainbow.color, rainbow.shape], ['arcoiris', 'coracao'], 'aceita acento e o hífen do arco-íris');
  assert.deepEqual(s.mudae.status(s.store, 'a').kakeraIcons.roxo, 'estrela', 'a tela recebe as formas pelo status');
  assert.equal(s.mudae.status(s.store, 'b').kakeraIcons.roxo, undefined, 'só vale para quem escolheu');
  assert.equal(v.kakeraIcon(s.store, 'a', '').list, true);
  assert.match(v.kakeraIcon(s.store, 'a', 'rosa estrela').error, /Não conheço a cor/);
  assert.match(v.kakeraIcon(s.store, 'a', 'roxo cubo').error, /Escolha a forma/);
  assert.match(v.kakeraIcon(s.store, 'a', 'roxo').error, /Escolha a forma/);
  assert.equal(v.kakeraIcon(s.store, 'a', 'roxo reset').shape, null);
  assert.equal(v.kakeraIcon(s.store, 'a', 'reset').reset, true);
  assert.equal(s.store.prefs, undefined, 'sem nenhuma escolha, nada fica guardado');
  assert.ok(KAKERA_COLORS.includes('arcoiris'));
});

test('curtidas pelo álbum: alternar, mover para o início e quem recebe o coração', () => {
  const s = setup();
  assert.equal(s.mudae.likeToggle(s.store, 'a', 1, true).total, 1);
  assert.equal(s.mudae.likeToggle(s.store, 'a', 1, true).total, 1, 'curtir de novo não duplica');
  s.mudae.likeToggle(s.store, 'a', 2, true);
  s.mudae.likeToggle(s.store, 'b', 2, true);
  assert.throws(() => s.mudae.likeToggle(s.store, 'a', 'nao-existe', true), /desconhecido/);
  assert.deepEqual(s.mudae.likeAlerts(s.store, 2, all).sort(), ['a', 'b']);
  assert.deepEqual(s.mudae.likeAlerts(s.store, 1, all), ['a']);
  assert.deepEqual(s.mudae.likeAlerts(s.store, 2, (id) => id === 'b'), ['b'], 'quem saiu do servidor não recebe');
  s.mudae.likeFront(s.store, 'a', 2);
  assert.deepEqual(s.mudae.likeList(s.store, 'a').chars.map((c) => c.id), [2, 1]);
  assert.throws(() => s.mudae.likeFront(s.store, 'a', 3), /não está na sua likelist/);
  s.mudae.likeDm(s.store, 'b', true);
  assert.deepEqual(s.mudae.likeAlerts(s.store, 2, all).sort(), ['a', 'b'], 'a likelist privada ainda recebe o próprio coração');
  s.mudae.likeToggle(s.store, 'a', 2, false);
  s.mudae.likeToggle(s.store, 'a', 1, false);
  assert.equal(s.store.likes?.a, undefined);
});

// A tabela de comandos com um chat de mentira; manager diz se a pessoa tem "Gerenciar o Mudae".
function table({ manager = true, catalog = SMALL } = {}) {
  const s = setup(catalog);
  const posted = [];
  const cmds = createCommands({ mudae: s.mudae, forja: { shownOf: () => [] }, parseFlags, postMudae: (c, acc, command, data) => posted.push({ command, ...data }), save: () => {} });
  const run = (cmd, arg = '', extra = {}) => cmds[cmd]?.({ acc: { id: 'a' }, c: { id: 'canal' }, store: s.store, cmd, arg, rest: arg, target: null, command: '$' + cmd, only: (d) => ({ ephemeral: d }),
    error: (text) => ({ ephemeral: { kind: 'error', text } }), isMember: all, can: (p) => manager && p === 'MANAGE_MUDAE', ...extra });
  return { ...s, run, posted };
}
const text = (r) => r.ephemeral.text;

test('tabela: $kakerareact pelo chat', () => {
  const t = table();
  assert.match(text(t.run('kakerareact', 'roxo estrela')), /cristal \*\*roxo\*\* agora é estrela/);
  assert.match(text(t.run('kakerareact', '')), /Formas dos cristais.*roxo: estrela/s);
  assert.match(text(t.run('kakerareact', 'reset')), /voltaram à forma de gema/);
});

test('tabela: ajustes e moderação só para quem gerencia o Mudae', () => {
  const guest = table({ manager: false });
  for (const [cmd, arg] of [['settimer', '30'], ['setrolls', '5'], ['haremlimit', '50'], ['togglesnipe', ''], ['togglecrystals', ''], ['serverdisable', 'Jujutsu'],
    ['forcedivorce', 'Gojo'], ['userdivorce', ''], ['restorelist', ''], ['restore', 'Gojo']]) {
    assert.match(text(guest.run(cmd, arg)), /não pode gerenciar o Mudae/, cmd);
  }
  assert.equal(guest.store.settings, undefined);
  assert.match(text(guest.run('settings')), /Ajustes do Mudae/, 'qualquer um vê os ajustes');
  assert.match(text(guest.run('left')), /livres/);

  const boss = table();
  assert.deepEqual(boss.run('settimer', '60'), { ok: true });
  assert.match(boss.posted.at(-1).text, /mudou tempo para casar.*\*\*60\*\*/);
  assert.match(text(boss.run('settimer', '')), /Diga o valor/);
  assert.match(text(boss.run('settimer', '3')), /Diga um número de 15 a 120/);
  assert.deepEqual(boss.run('setrolls', '6'), { ok: true });
  assert.deepEqual(boss.run('haremlimit', '20'), { ok: true });
  assert.deepEqual(boss.run('togglesnipe'), { ok: true });
  assert.match(boss.posted.at(-1).text, /\*\*desligado\*\*/);
  assert.deepEqual(boss.run('togglecrystals'), { ok: true });
  assert.match(text(boss.run('settings')), /tempo para casar com um roll: \*\*60s\*\* \(mudado\)/);
  assert.match(text(boss.run('serverdisable', '')), /não tirou nada/);
  assert.deepEqual(boss.run('serverdisable', 'Jujutsu'), { ok: true });
  assert.match(boss.posted.at(-1).text, /tirou da roleta de todo mundo: \*\*Jujutsu Kaisen\*\*/);
  assert.match(text(boss.run('serverdisable', '')), /Jujutsu Kaisen/);
  assert.deepEqual(boss.run('serverdisable', 'Jujutsu'), { ok: true });
  assert.match(boss.posted.at(-1).text, /devolveu à roleta/);
});

test('tabela: forcedivorce, restorelist, restore e userdivorce com confirmação', () => {
  const t = table();
  t.marry(1);
  t.marry(2);
  assert.match(text(t.run('forcedivorce', '')), /Diga o personagem/);
  assert.deepEqual(t.run('forcedivorce', 'Gojo'), { ok: true });
  assert.match(t.posted.at(-1).text, /divorciou \*\*Satoru Gojou\*\* de <@a> à força/);
  assert.match(text(t.run('restorelist')), /Satoru Gojou.*de <@a>/);
  assert.deepEqual(t.run('restore', 'Gojo'), { ok: true });
  assert.match(t.posted.at(-1).text, /devolveu \*\*Satoru Gojou\*\* para <@a>/);
  assert.match(text(t.run('restorelist')), /Nada para restaurar/);
  assert.match(text(t.run('userdivorce', '', { target: null })), /Diga de quem/);
  assert.match(text(t.run('userdivorce', '', { target: 'a', rest: '' })), /Isso tira \*\*2\*\* personagem.*\$userdivorce @pessoa sim/);
  assert.equal(Object.keys(t.store.claims).length, 2);
  assert.deepEqual(t.run('userdivorce', 'sim', { target: 'a', rest: 'sim' }), { ok: true });
  assert.equal(Object.keys(t.store.claims).length, 0);
});

test('tabela: $mu, $ru, $bonus, $overview e $left', () => {
  const t = table();
  assert.match(text(t.run('mu')), /pode casar/);
  t.marry(1);
  assert.match(text(t.run('mu')), /já casou.*de novo em/);
  assert.match(text(t.run('ru')), /Você tem \*\*10\*\* de 10 rolls/);
  assert.match(text(t.run('bonus')), /Você ainda não tem bônus/);
  t.mudae.chaves.gain(t.store, 'a', 1, { value: 100 });
  assert.match(text(t.run('bonus')), /1 personagem\(ns\) com chave/);
  for (const name of ['Gojo', 'Mikasa', 'Zero', 'Kyubey', 'Eren']) t.mudae.like(t.store, 'a', name);
  assert.match(text(t.run('bonus')), /\$daily guarda 2 usos/);
  const o = text(t.run('overview'));
  assert.match(o, /Lista de desejos: pública/);
  assert.doesNotMatch(o, /limroul|roleta/i, 'o $overview não fala mais de filtros pessoais da roleta');
  assert.match(text(t.run('left')), /Ainda há \*\*4\*\* personagens livres/);
});
