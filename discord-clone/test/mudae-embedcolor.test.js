// $embedcolor: a cor do personagem, liberada pela chave nível 1, que fica com o personagem.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createMudae, parse, CLAIM_RESET_MS } = require('../server/mudae');
const { createCommands } = require('../server/mudae-comandos');
const { parseFlags } = require('../server/mudae-flags');

const CATALOG = [
  [1, 'Satoru Gojou', 'Jujutsu Kaisen', 'b1-a.png', 'M', 900],
  [2, 'Mikasa Ackerman', 'Attack on Titan', 'b2-b.jpg', 'F', 800],
];

function setup() {
  let t = 10 * CLAIM_RESET_MS + 1000;
  const mudae = createMudae({ catalog: CATALOG, now: () => t, random: () => 0, refSize: CATALOG.length });
  const store = { claims: {}, usage: {} };
  for (const id of [1, 2]) { t += CLAIM_RESET_MS; mudae.claim(store, 'a', id, { revealAt: t }); }
  return { mudae, store };
}

test('parse: $embedcolor e $ec', () => {
  assert.equal(parse('$embedcolor Gojo $ #ff0000')?.cmd, 'embedcolor');
  assert.equal(parse('$ec Gojo $ none')?.cmd, 'embedcolor');
});

test('sem chave não há cor; com a chave nível 1 a cor vale na carta e fica com o personagem', () => {
  const { mudae, store } = setup();
  assert.match(mudae.embedColor(store, 'a', 'Gojo', '#ff4d94').error, /ainda não tem chave/);
  mudae.chaves.gain(store, 'a', 1, { value: 100 });
  assert.deepEqual(mudae.embedColor(store, 'a', 'Gojo', '#FF4D94'), { name: 'Satoru Gojou', color: '#ff4d94' });
  assert.equal(mudae.album(store, 'a').chars.find((c) => c.id === 1).color, '#ff4d94');
  assert.equal(mudae.album(store, 'a').chars.find((c) => c.id === 2).color, undefined);
  assert.equal(mudae.info(store, 'Gojo').card.color, '#ff4d94');

  mudae.give(store, 'a', 'b', 'Gojo');
  assert.equal(mudae.album(store, 'b').chars[0].color, '#ff4d94', 'a cor fica com o personagem, como a chave');
  assert.match(mudae.embedColor(store, 'a', 'Gojo', '#000000').error, /não tem ninguém/, 'quem não é mais dono não muda a cor');
});

test('cor inválida, personagem de outro e voltar ao padrão', () => {
  const { mudae, store } = setup();
  mudae.chaves.gain(store, 'a', 1, { value: 100 });
  for (const bad of ['rosa', '#fff', '#gggggg', 'red;x', '#ff4d94; background:url(x)']) assert.match(mudae.embedColor(store, 'a', 'Gojo', bad).error, /hexadecimal/, bad);
  assert.match(mudae.embedColor(store, 'b', 'Gojo', '#ff4d94').error, /não tem ninguém/);
  mudae.embedColor(store, 'a', 'Gojo', 'ff4d94');
  assert.equal(store.embeds[1], '#ff4d94');
  assert.deepEqual(mudae.embedColor(store, 'a', 'Gojo', 'none'), { name: 'Satoru Gojou', color: null });
  assert.equal(store.embeds, undefined, 'sem cor, nada fica guardado');
});

test('$embedcolor pela tabela de comandos', () => {
  const { mudae, store } = setup();
  const cmds = createCommands({ mudae, forja: { shownOf: () => [] }, parseFlags, postMudae: () => {}, save: () => {} });
  const run = (arg) => cmds.embedcolor({ acc: { id: 'a' }, store, cmd: 'embedcolor', arg, only: (d) => ({ ephemeral: d }), error: (text) => ({ ephemeral: { kind: 'error', text } }) }).ephemeral;
  assert.match(run('Gojo').text, /Diga o personagem e a cor/);
  assert.match(run('Gojo $ #ff4d94').text, /ainda não tem chave/);
  mudae.chaves.gain(store, 'a', 1, { value: 100 });
  assert.match(run('Gojo $ #ff4d94').text, /agora tem a cor \*\*#ff4d94\*\*/);
  assert.match(run('Gojo $ none').text, /voltou à cor padrão/);
});
