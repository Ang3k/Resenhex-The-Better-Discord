const test = require('node:test');
const assert = require('node:assert/strict');
const { createRecovery, normalizeEmail, CONFIRM_MS, RESET_MS } = require('../server/recovery');

function setup({ failSend = false } = {}) {
  let clock = 1_000_000;
  const sent = [];
  const db = { accounts: { a: { id: 'a', name: 'Ana' }, b: { id: 'b', name: 'Bia' } } };
  const mailer = { enabled: true, async send(mail) { if (failSend) throw new Error('SMTP fora do ar'); sent.push(mail); } };
  const recovery = createRecovery({ db, save() {}, mailer, publicUrl: 'https://resenhex.duckdns.org/', now: () => clock, log() {} });
  const token = (mail, kind) => new RegExp(`https://resenhex\\.duckdns\\.org/#${kind}=([0-9a-f]{64})`).exec(mail.text)?.[1];
  const confirmFor = async (id, email) => { await recovery.setEmail(db.accounts[id], email); recovery.confirm(token(sent.at(-1), 'confirmar')); };
  return { db, sent, recovery, token, confirmFor, tick(ms) { clock += ms; } };
}

test('recuperação: normaliza o e-mail e recusa endereço inválido', () => {
  assert.equal(normalizeEmail('  Ana@Exemplo.COM '), 'ana@exemplo.com');
  assert.equal(normalizeEmail(''), '');
  assert.equal(normalizeEmail(undefined), '');
  for (const bad of ['sem-arroba', 'a@b', 'a b@c.com', 'x'.repeat(250) + '@b.com']) assert.throws(() => normalizeEmail(bad), /e-mail válido/);
});

test('recuperação: e-mail novo fica não confirmado até o link, que vale uma vez só', async () => {
  const { db, sent, recovery, token } = setup();
  assert.deepEqual(await recovery.setEmail(db.accounts.a, ' Ana@Exemplo.com '), { email: 'ana@exemplo.com', emailVerified: false, sent: true });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, 'ana@exemplo.com');
  assert.match(sent[0].subject, /Confirme/);
  assert.match(sent[0].html, /Confirmar e-mail/);
  const link = token(sent[0], 'confirmar');
  assert.ok(link, 'o e-mail traz o link com PUBLIC_URL');
  assert.ok(!JSON.stringify(db.mailTokens).includes(link), 'o token não pode ficar guardado em texto');
  assert.equal(recovery.confirm(link), db.accounts.a);
  assert.deepEqual(recovery.view(db.accounts.a), { email: 'ana@exemplo.com', emailVerified: true });
  assert.equal(recovery.confirm(link), null);
  assert.equal(recovery.confirm('não-é-token'), null);
});

test('recuperação: o link de confirmação expira em 7 dias', async () => {
  const { db, sent, recovery, token, tick } = setup();
  await recovery.setEmail(db.accounts.a, 'ana@exemplo.com');
  tick(CONFIRM_MS + 1);
  assert.equal(recovery.confirm(token(sent[0], 'confirmar')), null);
  assert.equal(db.accounts.a.emailVerified, false);
});

test('recuperação: esqueci a senha só envia para e-mail confirmado, com um link por conta', async () => {
  const { db, sent, recovery, confirmFor } = setup();
  await confirmFor('a', 'turma@exemplo.com');
  await confirmFor('b', 'turma@exemplo.com');
  sent.length = 0;
  assert.equal(await recovery.forgot('ninguem@exemplo.com'), false);
  assert.equal(sent.length, 0);
  assert.equal(await recovery.forgot('turma@exemplo.com'), true);
  assert.equal(sent.length, 1);
  assert.match(sent[0].subject, /senha nova/);
  assert.match(sent[0].text, /Ana/);
  assert.match(sent[0].text, /Bia/);
  const tokens = [...sent[0].text.matchAll(/#redefinir=([0-9a-f]{64})/g)].map((m) => m[1]);
  assert.equal(tokens.length, 2);
  assert.deepEqual(tokens.map((t) => recovery.takeReset(t)?.id).sort(), ['a', 'b']);
  assert.equal(recovery.takeReset(tokens[0]), null, 'cada link vale uma vez só');
});

test('recuperação: e-mail ainda não confirmado não recebe link de senha nova', async () => {
  const { db, sent, recovery } = setup();
  await recovery.setEmail(db.accounts.a, 'ana@exemplo.com');
  sent.length = 0;
  assert.equal(await recovery.forgot('ana@exemplo.com'), false);
  assert.equal(sent.length, 0);
});

test('recuperação: o link de senha nova expira em 1 hora e um pedido novo invalida o anterior', async () => {
  const { db, sent, recovery, confirmFor, tick } = setup();
  await confirmFor('a', 'ana@exemplo.com');
  await recovery.forgot('ana@exemplo.com');
  const first = /#redefinir=([0-9a-f]{64})/.exec(sent.at(-1).text)[1];
  await recovery.forgot('ana@exemplo.com');
  const second = /#redefinir=([0-9a-f]{64})/.exec(sent.at(-1).text)[1];
  assert.equal(recovery.takeReset(first), null);
  tick(RESET_MS + 1);
  assert.equal(recovery.takeReset(second), null);
});

test('recuperação: trocar o e-mail avisa o antigo e invalida os links enviados para ele', async () => {
  const { db, sent, recovery, confirmFor } = setup();
  await confirmFor('a', 'ana@exemplo.com');
  await recovery.forgot('ana@exemplo.com');
  const oldLink = /#redefinir=([0-9a-f]{64})/.exec(sent.at(-1).text)[1];
  sent.length = 0;
  assert.deepEqual(await recovery.setEmail(db.accounts.a, 'ana.nova@exemplo.com'), { email: 'ana.nova@exemplo.com', emailVerified: false, sent: true });
  assert.deepEqual(sent.map((m) => m.to).sort(), ['ana.nova@exemplo.com', 'ana@exemplo.com']);
  assert.match(sent.find((m) => m.to === 'ana@exemplo.com').subject, /alterado/);
  assert.equal(recovery.takeReset(oldLink), null);
});

test('recuperação: remover o e-mail apaga o endereço e os links', async () => {
  const { db, sent, recovery, confirmFor } = setup();
  await confirmFor('a', 'ana@exemplo.com');
  sent.length = 0;
  assert.deepEqual(await recovery.setEmail(db.accounts.a, ''), { email: null, emailVerified: false, sent: false });
  assert.equal('email' in db.accounts.a, false);
  assert.deepEqual(db.mailTokens, {});
  assert.equal(sent.length, 1, 'o e-mail removido recebe o aviso');
  assert.match(sent[0].text, /removido/);
});

test('recuperação: salvar o mesmo e-mail já confirmado não muda nada', async () => {
  const { db, sent, recovery, confirmFor } = setup();
  await confirmFor('a', 'ana@exemplo.com');
  sent.length = 0;
  assert.deepEqual(await recovery.setEmail(db.accounts.a, 'ANA@exemplo.com'), { email: 'ana@exemplo.com', emailVerified: true, sent: false });
  assert.equal(sent.length, 0);
});

test('recuperação: reenviar a confirmação só vale para e-mail não confirmado', async () => {
  const { db, sent, recovery, token } = setup();
  await assert.rejects(recovery.resend(db.accounts.a), /Adicione um e-mail/);
  await recovery.setEmail(db.accounts.a, 'ana@exemplo.com');
  const first = token(sent.at(-1), 'confirmar');
  assert.equal((await recovery.resend(db.accounts.a)).sent, true);
  assert.equal(recovery.confirm(first), null, 'só o link mais novo vale');
  assert.ok(recovery.confirm(token(sent.at(-1), 'confirmar')));
  await assert.rejects(recovery.resend(db.accounts.a), /já está confirmado/);
});

test('recuperação: depois de criar a senha nova, os links da conta caem e chega um aviso', async () => {
  const { db, sent, recovery, confirmFor } = setup();
  await confirmFor('a', 'ana@exemplo.com');
  await recovery.forgot('ana@exemplo.com');
  const link = /#redefinir=([0-9a-f]{64})/.exec(sent.at(-1).text)[1];
  assert.equal(await recovery.passwordChanged(db.accounts.a), true);
  assert.match(sent.at(-1).subject, /senha do Resenhex foi trocada/);
  assert.equal(recovery.takeReset(link), null);
});

test('recuperação: falha no envio não perde o e-mail salvo', async () => {
  const { db, recovery } = setup({ failSend: true });
  assert.deepEqual(await recovery.setEmail(db.accounts.a, 'ana@exemplo.com'), { email: 'ana@exemplo.com', emailVerified: false, sent: false });
  assert.equal(db.accounts.a.email, 'ana@exemplo.com');
});

test('recuperação: o nome da conta é escapado no HTML do e-mail', async () => {
  const { db, sent, recovery } = setup();
  db.accounts.a.name = '<b>Ana</b>';
  await recovery.setEmail(db.accounts.a, 'ana@exemplo.com');
  assert.ok(!sent[0].html.includes('<b>Ana</b>'));
  assert.ok(sent[0].html.includes('&lt;b&gt;Ana&lt;/b&gt;'));
});

test('recuperação: prune apaga só os tokens vencidos', async () => {
  const { db, recovery, tick } = setup();
  await recovery.setEmail(db.accounts.a, 'ana@exemplo.com');
  tick(RESET_MS);
  await recovery.setEmail(db.accounts.b, 'bia@exemplo.com');
  tick(CONFIRM_MS - RESET_MS + 1);
  recovery.prune();
  assert.deepEqual(Object.values(db.mailTokens).map((e) => e.accountId), ['b']);
});

test('recuperação: recusa endereço com nome, vírgula ou ponto e vírgula, que mudariam quem recebe', () => {
  for (const bad of ['ana<vitima@x.com>', 'a@b.c,d', 'a@b.co;c', '"a"@b.com', 'a@b.com>', 'a(b)@c.com']) assert.throws(() => normalizeEmail(bad), /e-mail válido/, bad);
  for (const good of ['ana.silva+resenha@exemplo.com.br', 'a_b-c%d@sub.exemplo.io']) assert.equal(normalizeEmail(good), good);
});

test('recuperação: cada endereço recebe no máximo 5 e-mails por hora e 20 por dia, somando todos os tipos', async () => {
  const { db, sent, recovery, tick } = setup();
  await recovery.setEmail(db.accounts.a, 'alvo@exemplo.com');
  for (let i = 0; i < 4; i++) assert.equal((await recovery.resend(db.accounts.a)).sent, true);
  assert.equal((await recovery.setEmail(db.accounts.b, 'alvo@exemplo.com')).sent, false, 'o sexto e-mail na mesma hora não sai');
  assert.equal((await recovery.resend(db.accounts.a)).sent, false);
  assert.equal(sent.length, 5);
  assert.equal(sent.every((m) => m.to === 'alvo@exemplo.com'), true);
  assert.equal((await recovery.setEmail(db.accounts.b, 'outro@exemplo.com')).sent, true, 'outro endereço não é afetado');
  tick(60 * 60 * 1000 + 1);
  assert.equal((await recovery.resend(db.accounts.a)).sent, true, 'depois de uma hora libera');
  for (let h = 0; h < 3; h++) {
    for (let i = 0; i < 4 + (h > 0); i++) await recovery.resend(db.accounts.a);
    tick(60 * 60 * 1000 + 1);
  }
  assert.equal(sent.filter((m) => m.to === 'alvo@exemplo.com').length, 20);
  assert.equal((await recovery.resend(db.accounts.a)).sent, false, 'o limite do dia segura mesmo com a hora livre');
  tick(24 * 60 * 60 * 1000);
  assert.equal((await recovery.resend(db.accounts.a)).sent, true);
});

test('recuperação: o Resenhex inteiro manda no máximo 400 e-mails por dia', async () => {
  const { db, sent, recovery } = setup();
  for (let i = 0; i < 400; i++) {
    db.accounts['x' + i] = { id: 'x' + i, name: 'X' + i };
    assert.equal((await recovery.setEmail(db.accounts['x' + i], `p${i}@exemplo.com`)).sent, true);
  }
  db.accounts.z = { id: 'z', name: 'Zé' };
  assert.equal((await recovery.setEmail(db.accounts.z, 'ze@exemplo.com')).sent, false);
  assert.equal(sent.length, 400);
  assert.equal(db.accounts.z.email, 'ze@exemplo.com', 'o e-mail fica salvo para reenviar depois');
});
