// As linhas novas do bot (Forja, poderes e cristais) desenhadas por public/mudae.js, sem o resto do site.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const people = { a: 'Ana', c: 'Caio', b: 'Beto', d: 'Duda', e: 'Edu' };

function setup(t) {
  const dom = new JSDOM('<!doctype html><body></body>', { runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  t.after(() => w.close());
  w.eval(fs.readFileSync(path.join(__dirname, '..', 'public', 'mudae.js'), 'utf8'));
  w.eval(fs.readFileSync(path.join(__dirname, '..', 'public', 'mudae-icones.js'), 'utf8'));
  const calls = [];
  const replies = {};
  const el = (tag, props = {}, ...children) => {
    const node = w.document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === 'class') node.className = v;
      else if (k === 'style') Object.assign(node.style, v);
      else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
      else if (k.startsWith('aria')) node.setAttribute(k.replace(/^aria([A-Z])/, (_, c) => 'aria-' + c.toLowerCase()), v);
      else node[k] = v;
    }
    node.append(...children.flat().filter((c) => c != null && c !== false));
    return node;
  };
  const opened = [];
  const ui = w.MudaeUI({
    state: { me: { accountId: 'a' }, messages: {}, textChannel: 'salao' }, el, Icon: () => el('i'),
    call: async (event, payload) => { calls.push(JSON.parse(JSON.stringify({ event, payload }))); return replies[event] ?? { ok: true }; },
    member: (id) => (people[id] ? { id, name: people[id] } : null), avatar: () => el('span'), nameColor: () => '',
    Format: { render: (text) => text }, fmtCtx: {}, openProfile() {}, openImage() {}, openChannel() {}, renderMessages() {}, keepBottom() {},
    openForja: () => opened.push('forja'),
  });
  // O texto de uma linha, com os espaços do jeito que a pessoa lê.
  const text = (mudae, extra = {}) => {
    const node = w.document.createElement('div');
    node.append(...ui.body({ id: 'm', by: 'a', mudae, ...extra }));
    return node;
  };
  const say = (mudae) => text(mudae).textContent.replace(/\s+/g, ' ').trim();
  return { w, ui, say, text, calls, replies, opened };
}

test('linhas novas do bot', async (t) => {
  const { w, say, text, calls, replies, opened, ui } = setup(t);

  // Linhas salvas.
  assert.equal(say({ kind: 'medal', ownerId: 'a', medal: 'bronze', level: 4, finish: 'galaxia' }), 'Ana forjou a Bronze IV (galáxia)!');
  assert.equal(say({ kind: 'medal', ownerId: 'a', medal: 'diamante', level: 4, finish: 'holo' }), 'Ana forjou a Diamante IV (holográfico)!');
  assert.equal(say({ kind: 'unlock', ownerId: 'a', power: 'cadeado' }), 'Ana ganhou um poder: Cadeado!');
  assert.equal(say({ kind: 'unlock', ownerId: 'a', power: 'dupla' }), 'Ana ganhou um poder: Escolha dupla!');
  const said = {
    cadeado: 'Ana trancou o roll.',
    amuleto: 'Ana usou o Amuleto: o próximo roll tem mais chance de ser épico ou lendário.',
    desejo: 'Ana chamou um desejo para o próximo roll.',
    dupla: 'Ana vai abrir duas cartas no próximo roll.',
    chuva: 'Ana chamou uma chuva de cristais!',
  };
  for (const [power, line] of Object.entries(said)) assert.equal(say({ kind: 'power', ownerId: 'a', power }), line, power);
  assert.equal(say({ kind: 'power', ownerId: 'a', power: 'laco', bounced: true, card: { name: 'Frieren' } }), 'Ana tentou laçar Frieren, mas bateu no cadeado!');
  const card = { id: 1, name: 'Frieren' };
  assert.equal(say({ kind: 'married', card, ownerId: 'a' }), 'Ana e Frieren agora são casados!');
  assert.equal(say({ kind: 'married', card, ownerId: 'a', lasso: true }), 'Ana e Frieren agora são casados! com o Laço');
  assert.match(say({ kind: 'married', card, ownerId: 'a', from: 'c', lasso: true }), /roubou Frieren do roll de Caio! com o Laço$/);

  // Cristal que acabou: os nomes cortam em "e mais N".
  const end = (ids) => say({ kind: 'crystalEnd', crystal: { id: 'x', colorKey: 'laranja', takers: ids.map((id) => ({ id, amount: 5 })) } });
  assert.equal(end([]), 'O cristal laranja sumiu. Ninguém pegou.');
  assert.equal(end(['a']), 'Ana pegou o cristal laranja');
  assert.equal(end(['a', 'c']), 'Ana e Caio pegaram o cristal laranja');
  assert.equal(end(['a', 'c', 'b']), 'Ana, Caio e Beto pegaram o cristal laranja');
  assert.equal(end(['a', 'c', 'b', 'd', 'e']), 'Ana, Caio e mais 3 pegaram o cristal laranja');

  // Cristal que apareceu: o botão pega o cristal e some depois da vida dele.
  const now = ui.serverNow();
  const live = text({ kind: 'crystal', crystal: { id: 'g1', kind: 'wander', colorKey: 'laranja', appearAt: now - 100, life: 10_000 } });
  w.document.body.append(live);
  assert.equal(live.querySelector('.mudae-line').textContent, 'Um cristal laranja apareceu!');
  const take = live.querySelector('button');
  assert.equal(take.textContent, 'Pegar');
  assert.equal(take.disabled, false);
  replies['mudae:crystal:take'] = { ok: true, amount: 340, kakera: 400, full: false };
  take.click();
  await new Promise((r) => setTimeout(r));
  assert.deepEqual(calls.at(-1), { event: 'mudae:crystal:take', payload: { id: 'g1', gem: 0 } });
  assert.equal(take.textContent, '+340');
  assert.equal(take.disabled, true);
  const storm = text({ kind: 'crystal', crystal: { id: 'g2', kind: 'storm', colorKey: 'azul', appearAt: now - 100, life: 7000 } });
  assert.equal(storm.querySelector('.mudae-line').textContent, 'Uma chuva de cristais azul começou!');
  const gone = text({ kind: 'crystal', crystal: { id: 'g3', kind: 'wander', colorKey: 'roxo', appearAt: now - 20_000, life: 10_000 } });
  assert.equal(gone.querySelector('button').disabled, true, 'passou da vida: o botão não pega mais');

  // $forja: as 7 medalhas e o botão que abre a Forja.
  const medals = Object.fromEntries(['bronze', 'prata', 'ouro', 'safira', 'rubi', 'esmeralda', 'diamante'].map((m) => [m, { level: 0, finish: null, offer: null }]));
  medals.bronze = { level: 2, finish: 'esmalte', offer: null };
  const forja = text({ kind: 'forja', medals, kakera: 1234, prices: { bronze: 1500, prata: 750, ouro: 1000, safira: 1500, rubi: 2000, esmeralda: 2500, diamante: 3000 },
    powers: { unlocked: ['cadeado'], slots: ['cadeado', null, null], readyIn: { cadeado: 0 }, progress: {}, rechargeMs: 1 } }, { ephemeral: true });
  assert.equal(forja.querySelectorAll('.mudae-medal').length, 7);
  assert.match(forja.querySelector('.mudae-medal.l2').textContent, /Bronze II/);
  const open = [...forja.querySelectorAll('button')].find((b) => b.textContent === 'Abrir a Forja');
  open.click();
  assert.deepEqual(opened, ['forja']);

  // $forjar com escolha: os dois botões chamam mudae:forja:finish.
  const offer = text({ kind: 'medal', ownerId: 'a', medal: 'ouro', level: 2, price: 2000, finish: 'metal', offer: 'holo', kakera: 50 }, { ephemeral: true });
  const buttons = [...offer.querySelectorAll('button')].map((b) => b.textContent);
  assert.deepEqual(buttons, ['Ficar com Metal', 'Ficar com Holográfico', 'Ignorar']);
  replies['mudae:forja:finish'] = { finish: 'holo' };
  offer.querySelectorAll('button')[1].click();
  await new Promise((r) => setTimeout(r));
  assert.deepEqual(calls.at(-1), { event: 'mudae:forja:finish', payload: { medal: 'ouro', pick: 'new' } });
  assert.match(offer.textContent, /Ouro II ficou com o acabamento holográfico/);

  // $poderes e $tu.
  const poderes = text({ kind: 'powers', unlocked: ['cadeado'], slots: ['cadeado', null, null], readyIn: { cadeado: 3 * 3600_000 }, rechargeMs: 20 * 3600_000,
    progress: { cadeado: { have: 20, need: 20 }, eco: { have: 33, need: 60 }, videncia: { have: 0, need: 1 } } });
  assert.match(poderes.textContent, /Cadeado · volta em 3h00/);
  assert.match(poderes.textContent, /Eco · Casamentos: 33 de 60/);
  const tu = text({ kind: 'status', rollsLeft: 3, rollsMax: 10, rollResetIn: 60_000, claimReady: true, claimResetIn: 0, reserveReady: true, powersReady: ['cadeado', 'eco'] });
  assert.match(tu.textContent, /um casamento de reserva guardado/);
  assert.match(tu.textContent, /Poderes prontos: Cadeado, Eco\./);
  assert.deepEqual([...tu.querySelectorAll('svg.mi-power')].map((s) => s.dataset.power), ['cadeado', 'eco']);

  // $poder eco: um botão por personagem, cada um usa o Eco.
  const eco = text({ kind: 'eco', cards: [{ id: 7, name: 'Zero Two' }, { id: 8, name: 'Kyubey' }] });
  assert.deepEqual([...eco.querySelectorAll('button')].map((b) => b.textContent), ['Zero Two', 'Kyubey']);
  eco.querySelectorAll('button')[1].click();
  await new Promise((r) => setTimeout(r));
  assert.deepEqual(calls.at(-1), { event: 'mudae:power:use', payload: { channel: 'salao', power: 'eco', charId: 8 } });

  // Os comandos aparecem no autocompletar e são reconhecidos.
  assert.ok(['$forja', '$forjar', '$poderes', '$poder'].every((c) => ui.suggestions(c.slice(1)).some((s) => s.insert === c)));
  assert.ok(['$forja', '$badges', '$forjar diamante', '$poderes', '$poder laço', '$PODER Cadeado'].every((c) => ui.isCommand(c)));
});

test('linhas do bot usam os ícones próprios, sem emoji', (t) => {
  const { text } = setup(t);
  const EMOJI = /[\u{2190}-\u{2BFF}\u{1F000}-\u{1FFFF}\u{2700}-\u{27BF}]/u;
  const kakera = text({ kind: 'dk', ownerId: 'a', amount: 120, kakera: 1340 });
  assert.ok(kakera.querySelector('svg.mi-kakera'), 'o kakera é o cristal desenhado');
  assert.equal(kakera.querySelector('.mudae-kakera').getAttribute('aria-label'), 'kakera', 'o leitor de tela fala "kakera"');
  assert.doesNotMatch(kakera.textContent, EMOJI);
  const power = text({ kind: 'power', ownerId: 'a', power: 'cadeado' });
  const icon = power.querySelector('svg.mi-power');
  assert.equal(icon?.dataset.power, 'cadeado', 'cada poder tem o seu ícone');
  assert.equal(icon.getAttribute('viewBox'), '0 0 24 24');
  assert.equal(icon.getAttribute('stroke'), 'currentColor', 'segue a cor do tema');
  assert.doesNotMatch(power.textContent, EMOJI);
  for (const mudae of [{ kind: 'married', card: { name: 'Frieren' }, ownerId: 'a', lasso: true }, { kind: 'divorce', card: { name: 'Frieren' }, ownerId: 'a' },
    { kind: 'unlock', ownerId: 'a', power: 'laco' }, { kind: 'topserv', rows: [{ ownerId: 'a', total: 2, value: 900 }] }]) {
    const node = text(mudae);
    assert.ok(node.querySelector('svg'), mudae.kind + ': tem ícone');
    assert.doesNotMatch(node.textContent, EMOJI, mudae.kind + ': sem emoji');
  }
});
