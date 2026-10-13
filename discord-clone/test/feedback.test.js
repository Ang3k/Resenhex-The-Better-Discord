const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { feedbackRoutes } = require('../feedback');

async function setup(t, options = {}) {
  const deliveries = [];
  const counts = new Map();
  const app = express();
  app.use(feedbackRoutes({
    authenticate: (req) => req.get('x-token') === 'valid-session' ? { id: 'ana', name: 'Ana' } : null,
    allow: (key, max) => { const count = (counts.get(key) || 0) + 1; counts.set(key, count); return count <= max; },
    version: '1.3.0', domain: 'resenhex.test',
    fetchImpl: async (url, request) => {
      deliveries.push({ url, request });
      return options.deliver ? options.deliver() : { ok: true, json: async () => ({ success: 'true' }) };
    },
  }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }));
  const send = async (body, token = 'valid-session', raw = false) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/feedback`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-token': token }, body: raw ? body : JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  };
  return { send, deliveries };
}

test('feedback: exige autenticação e rejeita conteúdo vazio, inválido ou grande', async (t) => {
  const { send, deliveries } = await setup(t);
  assert.equal((await send({ message: 'Uma ideia' }, '')).status, 401);
  for (const message of ['', '   ', 123, null, 'x'.repeat(3001)]) assert.equal((await send({ message })).status, 400);
  assert.equal((await send('{', 'valid-session', true)).status, 400);
  assert.equal((await send('x'.repeat(16 * 1024 + 1), 'valid-session', true)).status, 413);
  assert.equal(deliveries.length, 0);
});

test('feedback: envia só os dados previstos para o destinatário fixo e limita os envios', async (t) => {
  const { send, deliveries } = await setup(t);
  assert.deepEqual(await send({ message: '  Adicionar busca no histórico.  ', name: 'Outra pessoa', to: 'outro@example.com', token: 'não enviar' }), { status: 200, body: { ok: true } });
  assert.equal(deliveries[0].url, 'https://formsubmit.co/ajax/angejesufern@gmail.com');
  const { request } = deliveries[0];
  const payload = JSON.parse(request.body);
  assert.equal(payload.name, 'Ana');
  assert.equal(payload.message, 'Adicionar busca no histórico.');
  assert.equal(payload.Versão, '1.3.0');
  assert.equal(payload._url, 'https://resenhex.test/');
  assert.equal(request.headers.Referer, payload._url);
  assert.equal(request.headers.Origin, 'https://resenhex.test');
  assert.equal(request.headers['x-token'], undefined);
  assert.equal(payload.token, undefined);
  assert.equal(payload.to, undefined);
  assert.ok(request.signal instanceof AbortSignal);
  assert.equal((await send({ message: 'x'.repeat(3000) })).status, 200);
  assert.equal((await send({ message: 'Outra ideia' })).status, 200);
  assert.equal((await send({ message: 'Ideia demais' })).status, 429);
  assert.equal(deliveries.length, 3);
});

test('feedback: recusas, erros de rede e respostas inválidas nunca confirmam o envio', async (t) => {
  for (const deliver of [
    () => ({ ok: false, json: async () => ({ success: true }) }),
    () => ({ ok: true, json: async () => ({ success: 'false' }) }),
    () => ({ ok: true, json: async () => ({}) }),
    () => ({ ok: true, json: async () => { throw new SyntaxError('JSON inválido'); } }),
    () => { throw new Error('Segredo do provedor'); },
  ]) {
    const { send } = await setup(t, { deliver });
    const result = await send({ message: 'Ideia' });
    assert.equal(result.status, 502);
    assert.match(result.body.error, /tente novamente/);
    assert.doesNotMatch(result.body.error, /Segredo/);
  }
});
