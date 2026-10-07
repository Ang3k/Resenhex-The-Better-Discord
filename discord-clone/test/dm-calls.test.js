const test = require('node:test');
const assert = require('node:assert/strict');
const { createDmCalls } = require('../dm-calls');

function setup() {
  const history = { dm: [] };
  const events = [];
  let clock = 1000;
  let id = 0;
  const calls = createDmCalls({
    ringMs: 50,
    messages: (dm) => history[dm] || [],
    newId: () => 'm' + ++id,
    emit: (account, event, payload) => events.push([account, event, payload.dm]),
    post: (dm, msg) => history[dm].push(msg),
    update: () => {},
    changed: () => {},
    now: () => clock,
  });
  return { calls, history, events, tick: (ms) => { clock += ms; } };
}

test('quem volta de uma reconexão continua a mesma chamada, sem tocar de novo', () => {
  const { calls, history, events, tick } = setup();
  calls.joined('dm', 'ana', 'beto', { first: true });
  calls.joined('dm', 'beto', 'ana');
  tick(60_000);
  calls.left('dm', 'beto', ['ana']);
  calls.left('dm', 'ana', []);
  assert.equal(history.dm[0].call.endedAt, 61_000);

  // Uma chamada nova abre outra mensagem e toca; ao cair a conexão e voltar, retoma a aberta.
  calls.joined('dm', 'ana', 'beto', { first: true });
  assert.equal(history.dm.length, 2);
  history.dm[1].call.endedAt = null;
  const rings = events.filter(([, e]) => e === 'dm:ring').length;
  calls.left('dm', 'ana', []);
  history.dm[1].call.endedAt = null; // o servidor reiniciou no meio da chamada
  calls.joined('dm', 'ana', 'beto', { first: true, silent: true });
  assert.equal(history.dm.length, 2, 'não cria outra mensagem');
  assert.equal(events.filter(([, e]) => e === 'dm:ring').length, rings, 'não toca de novo');
  assert.equal(history.dm[1].call.endedAt, null);
});

test('chamadas que ninguém retomou depois de reiniciar terminam na limpeza', () => {
  const { calls, history } = setup();
  history.dm.push({ id: 'velha', authorId: 'ana', ts: 1, call: { startedAt: 1, endedAt: null, joined: ['ana', 'beto'] } });
  calls.sweep(['dm']);
  assert.equal(history.dm[0].call.endedAt, 1000);
});
