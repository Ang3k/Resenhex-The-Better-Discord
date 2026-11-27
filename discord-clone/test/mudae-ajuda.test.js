// A ajuda do Mudae: o texto cobre todos os comandos, a busca, o popup do Salão e o $ajuda do chat.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const help = require('../public/mudae-ajuda');
const { COMMANDS, parse } = require('../server/mudae');
const { createCommands } = require('../server/mudae-comandos');
const { parseFlags } = require('../server/mudae-flags');

const SOURCE = fs.readFileSync(path.join(__dirname, '..', 'public', 'mudae-ajuda.js'), 'utf8');
const helped = new Set(help.SECTIONS.flatMap((s) => s.items.flatMap((i) => i.cmds || [])));
// $wa, $hg, $ms... são o mesmo roll com a letra da fonte: uma explicação só cobre todos.
const isSourceRoll = (name) => /^[whmo][acgdsv]$/.test(name);

test('todo comando do servidor tem explicação na ajuda', () => {
  const canonical = [...new Set(Object.values(COMMANDS))].filter((c) => !isSourceRoll(c));
  assert.ok(canonical.length > 90, 'o servidor tem mais de 90 comandos');
  const missing = canonical.filter((c) => !Object.entries(COMMANDS).some(([name, target]) => target === c && helped.has(name)));
  assert.deepEqual(missing, [], 'sem explicação: ' + missing.join(', '));
});

test('toda explicação fala de um comando que existe, sem repetir', () => {
  const unknown = [...helped].filter((c) => !parse('$' + c));
  assert.deepEqual(unknown, [], 'comandos que a ajuda cita e o servidor não conhece: ' + unknown.join(', '));
  const all = help.SECTIONS.flatMap((s) => s.items.flatMap((i) => i.cmds || []));
  const dup = all.filter((c, i) => all.indexOf(c) !== i);
  assert.deepEqual(dup, [], 'a mesma palavra explicada duas vezes: ' + dup.join(', '));
});

test('estrutura: seções com id único, introdução e itens com texto', () => {
  const ids = help.SECTIONS.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const s of help.SECTIONS) {
    assert.ok(s.title && s.intro && s.items.length, s.id);
    for (const item of s.items) {
      assert.ok(item.text.length > 20, `${s.id}: texto curto demais`);
      assert.ok(item.title || item.cmds?.length, `${s.id}: item sem nome`);
      assert.ok(!/\$\{|undefined|\[object/.test(item.text), `${s.id}: texto quebrado`);
    }
  }
  assert.ok(!/(^|[^\w])\$\w+\s+\$\w+\s+\$\w+\s+\$\w+\s+\$\w+\s+\$\w+\s+\$\w+\s+\$\w+/.test(SOURCE), 'sem lista de comandos sem explicação');
});

test('números do texto batem com as regras do jogo', () => {
  const { SETTINGS, ACHIEVEMENTS: A, KEYS, WISHES, LIKES, CRYSTAL } = require('../server/mudae-regras');
  const text = help.SECTIONS.flatMap((s) => s.items.map((i) => i.text)).join('\n');
  const has = (fragment, label) => assert.ok(text.includes(fragment), `a ajuda deveria dizer "${fragment}" (${label})`);
  has(`${SETTINGS.rolls.def} rolls a cada 30 minutos`, 'rolls por janela');
  has(`${SETTINGS.claimWindowSec.def} segundos`, 'tempo para casar');
  has(`${SETTINGS.claimWindowSec.min} a ${SETTINGS.claimWindowSec.max} segundos`, 'faixa do $settimer');
  has(`${SETTINGS.rolls.min} a ${SETTINGS.rolls.max}`, 'faixa do $setrolls');
  has(`${SETTINGS.haremLimit.min} a ${SETTINGS.haremLimit.max.toLocaleString('pt-BR')}`, 'faixa do $haremlimit');
  has('O kakera entra na hora, inteiro', 'conquistas pagam sem teto diário');
  has(`${KEYS.goldCap} por 24 horas`, 'teto do prêmio da chave 6');
  has(`máximo é ${KEYS.max}`, 'chave máxima');
  has(`${KEYS.soulNeed} chaves`, 'soulmate');
  has(`${WISHES.wishkReward} de kakera`, 'wishk');
  has(`até ${WISHES.wishkCap} por 24 horas`, 'teto do wishk');
  has(`Até ${LIKES.max}.`, 'limite da likelist');
  has(`${LIKES.dailyFrom} ou mais`, 'curtidas para o $daily guardar 2 usos');
  has(`até ${CRYSTAL.power.max} e ganha ${CRYSTAL.power.regenPerHour} por hora`, 'poder de reação');
  has(`${CRYSTAL.dailyFull} primeiros cristais`, 'cristais inteiros por dia');
  has('100, 1.000 e 10.000 casamentos', 'metas do servidor');
});

test('find: por comando, por assunto, por palavras e sem nada', () => {
  assert.equal(help.find('').sections.length, help.SECTIONS.length);
  const byCmd = help.find('$sortmarry');
  assert.equal(byCmd.exact, true);
  assert.deepEqual(byCmd.sections.map((s) => s.section.id), ['harem']);
  assert.equal(help.find('sm').exact, true, 'o apelido também acha');
  assert.equal(help.find('tsk').sections[0].items[0].cmds.includes('topservk'), true);
  const topic = help.find('chaves');
  assert.deepEqual(topic.sections.map((s) => s.section.id).includes('chaves'), true);
  assert.equal(help.find('conquistas').topic, true);
  const words = help.find('divórcio lote');
  assert.ok(words.sections.length && words.sections.every((s) => s.items.length));
  assert.match(words.sections[0].items[0].text, /confirmar/);
  assert.deepEqual(help.find('palavra que nao existe zzz').sections, []);
  assert.equal(help.find('ROXO estrela').sections.length > 0, true, 'sem acento nem maiúscula');
});

test('chatText: lista os assuntos, explica um comando e avisa quando não acha', () => {
  const list = help.chatText('');
  for (const s of help.SECTIONS) assert.ok(list.includes(s.title) && list.includes('$ajuda ' + s.id), s.id);
  assert.match(help.chatText('wishk'), /\*\*\$wishk\*\*: .*desejo quieto/);
  assert.match(help.chatText('$sm'), /sortmarry/);
  assert.match(help.chatText('chaves'), /\*\*Chaves e soulmates\.\*\*/, 'um assunto vem com a introdução');
  assert.match(help.chatText('xyzzy123'), /Não achei nada sobre \*\*xyzzy123\*\*/);
  assert.ok(help.chatText('chaves', 300).length <= 300, 'respeita o tamanho máximo');
  assert.ok(help.chatText('forja').length <= 1800);
});

test('$ajuda pela tabela de comandos', () => {
  const cmds = createCommands({ mudae: {}, forja: {}, parseFlags, postMudae: () => {}, save: () => {} });
  const run = (arg) => cmds.ajuda({ arg, only: (d) => ({ ephemeral: d }) }).ephemeral;
  assert.equal(run('').kind, 'notice');
  assert.match(run('').text, /Ajuda do Mudae/);
  assert.match(run('wishk').text, /desejo quieto/);
  assert.equal(parse('$ajuda sortmarry')?.cmd, 'ajuda');
  assert.equal(parse('$help')?.cmd, 'ajuda');
  assert.equal(parse('$comandos')?.cmd, 'ajuda');
});

// ---------- o popup ----------
function popup(t) {
  const dom = new JSDOM('<body><button id="abre">Ajuda</button></body>', { runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  t.after(() => w.close());
  w.Element.prototype.scrollIntoView = function () { (w.scrolled ||= []).push(this.id); };
  w.eval(SOURCE);
  const d = w.document;
  const key = (target, k, extra = {}) => target.dispatchEvent(new w.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...extra }));
  return { w, d, key, api: w.MudaeAjuda, overlay: () => d.getElementById('mudae-help') };
}

test('popup: abre com tudo, é um diálogo e foca a busca', (t) => {
  const p = popup(t);
  assert.ok(p.api && typeof p.api.open === 'function', 'o script registra window.MudaeAjuda');
  p.d.getElementById('abre').focus();
  p.api.open();
  const o = p.overlay();
  assert.equal(o.getAttribute('role'), 'dialog');
  assert.equal(o.getAttribute('aria-modal'), 'true');
  assert.equal(p.d.getElementById('mudae-help-title').textContent, 'Ajuda do Mudae');
  assert.equal(p.d.activeElement, o.querySelector('input'), 'a busca já está pronta para digitar');
  assert.equal(o.querySelectorAll('.mudae-help-link').length, help.SECTIONS.length);
  assert.equal(o.querySelectorAll('.mudae-help-section').length, help.SECTIONS.length);
  const items = help.SECTIONS.reduce((n, s) => n + s.items.length, 0);
  assert.equal(o.querySelectorAll('.mudae-help-item').length, items);
  assert.ok(o.textContent.includes('$sortmarry') && o.textContent.includes('Dá 250 de kakera'));
  p.api.open();
  assert.equal(p.d.querySelectorAll('#mudae-help').length, 1, 'abrir duas vezes não duplica');
});

test('popup: a busca filtra, avisa quando não acha e volta ao digitar de novo', (t) => {
  const p = popup(t);
  p.api.open();
  const input = p.overlay().querySelector('input');
  const type = (value) => { input.value = value; input.dispatchEvent(new p.w.Event('input', { bubbles: true })); };
  type('sortmarry');
  assert.equal(p.overlay().querySelectorAll('.mudae-help-section').length, 1);
  assert.equal(p.overlay().querySelectorAll('.mudae-help-item').length, 1);
  assert.equal(p.overlay().querySelectorAll('.mudae-help-link').length, 1);
  assert.match(p.overlay().querySelector('.mudae-help-item code').textContent, /\$sortmarry/);
  type('xyzzy123');
  assert.equal(p.overlay().querySelectorAll('.mudae-help-item').length, 0);
  assert.match(p.overlay().querySelector('.mudae-help-empty').textContent, /Nada encontrado/);
  type('');
  assert.equal(p.overlay().querySelectorAll('.mudae-help-section').length, help.SECTIONS.length);
  type('chaves');
  assert.ok(p.overlay().querySelectorAll('.mudae-help-item').length >= 4, 'um assunto traz todos os seus itens');
});

test('popup: o texto digitado nunca vira HTML', (t) => {
  const p = popup(t);
  p.api.open({ query: '<img src=x onerror=alert(1)>' });
  assert.equal(p.overlay().querySelector('img'), null);
  assert.equal(p.overlay().querySelector('input').value, '<img src=x onerror=alert(1)>');
});

test('popup: Esc fecha e devolve o foco, e clicar fora também fecha', (t) => {
  const p = popup(t);
  const opener = p.d.getElementById('abre');
  opener.focus();
  p.api.open();
  p.key(p.overlay().querySelector('input'), 'Escape');
  assert.equal(p.overlay(), null);
  assert.equal(p.d.activeElement, opener, 'o foco volta para o botão que abriu');
  p.api.open();
  p.overlay().querySelector('.mudae-help-panel').dispatchEvent(new p.w.MouseEvent('click', { bubbles: true }));
  assert.ok(p.overlay(), 'clicar dentro não fecha');
  p.overlay().dispatchEvent(new p.w.MouseEvent('click', { bubbles: true }));
  assert.equal(p.overlay(), null, 'clicar no fundo fecha');
  p.api.open();
  p.overlay().querySelector('.mudae-help-close').click();
  assert.equal(p.overlay(), null, 'o botão × fecha');
  p.key(p.d.body, 'Escape');
  assert.equal(p.overlay(), null, 'depois de fechar, o Esc não faz mais nada');
});

test('popup: o Tab não escapa da janela e os assuntos rolam até a seção', (t) => {
  const p = popup(t);
  p.api.open();
  const o = p.overlay();
  const focusable = [...o.querySelectorAll('button, input')];
  focusable.at(-1).focus();
  p.key(p.d.activeElement, 'Tab');
  assert.equal(p.d.activeElement, focusable[0], 'Tab no último volta ao primeiro');
  focusable[0].focus();
  p.key(p.d.activeElement, 'Tab', { shiftKey: true });
  assert.equal(p.d.activeElement, focusable.at(-1), 'Shift+Tab no primeiro vai ao último');
  o.querySelectorAll('.mudae-help-link')[3].click();
  assert.deepEqual(p.w.scrolled, ['mudae-help-' + help.SECTIONS[3].id]);
});

test('popup: abre já numa seção e a página carrega o script antes do Salão', (t) => {
  const p = popup(t);
  p.api.open({ section: 'forja' });
  assert.deepEqual(p.w.scrolled, ['mudae-help-forja']);
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  const ajuda = html.indexOf('<script src="mudae-ajuda.js">');
  const salao = html.indexOf('<script src="mudae-salao.js">');
  assert.ok(ajuda > 0 && ajuda < salao, 'mudae-ajuda.js vem antes de mudae-salao.js');
  const salon = fs.readFileSync(path.join(__dirname, '..', 'public', 'mudae-salao.js'), 'utf8');
  assert.match(salon, /class: 'salon-help'[\s\S]*MudaeAjuda\?\.open\(\)/, 'o botão Ajuda do Salão abre o popup');
});
