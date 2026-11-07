const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { feedbackRoutes } = require('../server/feedback');

const ACCOUNTS = {
  'valid-session': { id: 'ana', name: 'Ana', email: 'ana@exemplo.com', emailVerified: true },
  'unverified-session': { id: 'bia', name: 'Bia\r\nBcc: x@y.z', email: 'bia@exemplo.com' },
};

async function setup(t, options = {}) {
  const deliveries = [];
  const counts = new Map();
  const app = express();
  app.use(feedbackRoutes({
    authenticate: (req) => ACCOUNTS[req.get('x-token')] || null,
    allow: (key, max) => { const count = (counts.get(key) || 0) + 1; counts.set(key, count); return count <= max; },
    version: '1.3.0',
    to: options.to,
    mailer: options.mailer || {
      enabled: true,
      async send(message) { deliveries.push(message); if (options.deliver) await options.deliver(); },
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

test('feedback: manda e-mail só para o destinatário fixo, com os dados previstos, e limita os envios', async (t) => {
  const { send, deliveries } = await setup(t);
  assert.deepEqual(await send({ message: '  Adicionar busca no histórico.  ', name: 'Outra pessoa', to: 'outro@example.com', token: 'não enviar' }), { status: 200, body: { ok: true } });
  const mail = deliveries[0];
  assert.equal(mail.to, 'angejesufern@gmail.com');
  assert.equal(mail.replyTo, 'ana@exemplo.com');
  assert.equal(mail.subject, '[Resenhex] Sugestão de Ana');
  assert.ok(mail.text.startsWith('Adicionar busca no histórico.\n'));
  assert.match(mail.text, /De: Ana \(conta ana\)/);
  assert.match(mail.text, /Versão: 1\.3\.0/);
  assert.doesNotMatch(mail.text, /Outra pessoa|outro@example\.com|não enviar|valid-session/);
  assert.equal((await send({ message: 'x'.repeat(3000) })).status, 200);
  assert.equal((await send({ message: 'Outra ideia' })).status, 200);
  assert.equal((await send({ message: 'Ideia demais' })).status, 429);
  assert.equal(deliveries.length, 3);
});

test('feedback: sem e-mail confirmado não há "responder para", e o nome não quebra o assunto', async (t) => {
  const { send, deliveries } = await setup(t, { to: 'dono@exemplo.com' });
  assert.equal((await send({ message: 'Ideia' }, 'unverified-session')).status, 200);
  assert.equal(deliveries[0].to, 'dono@exemplo.com');
  assert.equal(deliveries[0].replyTo, undefined);
  assert.doesNotMatch(deliveries[0].subject, /[\r\n]/);
  assert.match(deliveries[0].text, /sem e-mail confirmado/);
});

test('feedback: com o e-mail do site desligado, avisa sem gastar a cota de envios', async (t) => {
  const { send } = await setup(t, { mailer: { enabled: false, async send() { throw new Error('desligado'); } } });
  for (let i = 0; i < 4; i++) {
    const result = await send({ message: 'Ideia' });
    assert.equal(result.status, 503);
    assert.match(result.body.error, /desligado/);
  }
});

test('feedback: falhas do envio nunca confirmam nem mostram o erro do provedor', async (t) => {
  t.mock.method(console, 'error', () => {});
  const { send } = await setup(t, { deliver: () => { throw new Error('Segredo do provedor'); } });
  const result = await send({ message: 'Ideia' });
  assert.equal(result.status, 502);
  assert.match(result.body.error, /tente novamente/);
  assert.doesNotMatch(result.body.error, /Segredo/);
});
