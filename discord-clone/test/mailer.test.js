const test = require('node:test');
const assert = require('node:assert/strict');
const { createMailer } = require('../server/mailer');

const fakeTransport = () => {
  const calls = { options: null, sent: [] };
  const createTransport = (options) => { calls.options = options; return { sendMail: async (mail) => { calls.sent.push(mail); } }; };
  return { calls, createTransport };
};

test('mailer: sem SMTP configurado o envio fica desligado', async () => {
  const mailer = createMailer({});
  assert.equal(mailer.enabled, false);
  await assert.rejects(mailer.send({ to: 'a@b.co', subject: 's', text: 't' }), /desligado/);
});

test('mailer: Gmail com TLS direto na porta 465 e o remetente do Resenhex', async () => {
  const { calls, createTransport } = fakeTransport();
  const mailer = createMailer({ SMTP_HOST: 'smtp.gmail.com', SMTP_PORT: '465', SMTP_USER: 'resenhex.app@gmail.com', SMTP_PASS: 'senha-de-teste', MAIL_FROM: 'Resenhex <resenhex.app@gmail.com>' }, { createTransport });
  assert.equal(mailer.enabled, true);
  assert.equal(calls.options.host, 'smtp.gmail.com');
  assert.equal(calls.options.port, 465);
  assert.equal(calls.options.secure, true);
  assert.deepEqual(calls.options.auth, { user: 'resenhex.app@gmail.com', pass: 'senha-de-teste' });
  await mailer.send({ to: 'ana@exemplo.com', subject: 'Oi', text: 'texto', html: '<p>texto</p>' });
  assert.deepEqual(calls.sent, [{ from: 'Resenhex <resenhex.app@gmail.com>', to: 'ana@exemplo.com', subject: 'Oi', text: 'texto', html: '<p>texto</p>' }]);
});

test('mailer: porta 587 usa STARTTLS e, sem MAIL_FROM, o remetente é o próprio usuário', async () => {
  const { calls, createTransport } = fakeTransport();
  const mailer = createMailer({ SMTP_HOST: 'smtp.exemplo.com', SMTP_PORT: '587', SMTP_USER: 'envio@exemplo.com', SMTP_PASS: 'x' }, { createTransport });
  assert.equal(calls.options.secure, false);
  await mailer.send({ to: 'a@b.co', subject: 's', text: 't' });
  assert.equal(calls.sent[0].from, 'Resenhex <envio@exemplo.com>');
});

test('mailer: MAIL_DEV=console escreve a mensagem no log em vez de enviar', async (t) => {
  const lines = [];
  t.mock.method(console, 'log', (line) => lines.push(line));
  const mailer = createMailer({ MAIL_DEV: 'console', SMTP_HOST: 'smtp.gmail.com', SMTP_USER: 'u', SMTP_PASS: 'p' });
  assert.equal(mailer.enabled, true);
  await mailer.send({ to: 'a@b.co', subject: 'S', text: 'T' });
  assert.equal(lines.length, 1);
  assert.ok(lines[0].startsWith('[e-mail] '));
  assert.deepEqual(JSON.parse(lines[0].slice('[e-mail] '.length)), { to: 'a@b.co', subject: 'S', text: 'T' });
});
