const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { io } = require('socket.io-client');

const wait = (ms = 100) => new Promise((r) => setTimeout(r, ms));
const emit = (socket, event, payload) => new Promise((resolve) => socket.emit(event, payload, resolve));
const tokenIn = (mail, kind) => new RegExp(`https://resenhex\\.test/#${kind}=([0-9a-f]{64})`).exec(mail.text)?.[1];

// Sobe o server.js com MAIL_DEV=console: cada e-mail sai no stdout como "[e-mail] {json}".
async function startServer(t, env = { MAIL_DEV: 'console' }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'resenhex-'));
  const port = 40000 + Math.floor(Math.random() * 20000);
  const base = `http://127.0.0.1:${port}`;
  const proc = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', DATA_FILE: path.join(dir, 'data.json'), UPLOAD_DIR: path.join(dir, 'uploads'), ACCESS_PASSWORD: '',
      SMTP_HOST: '', SMTP_USER: '', SMTP_PASS: '', PUBLIC_URL: 'https://resenhex.test', ...env },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  const mails = [];
  let buffer = '';
  proc.stdout.on('data', (chunk) => {
    buffer += chunk;
    let end;
    while ((end = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, end).trim();
      buffer = buffer.slice(end + 1);
      if (line.startsWith('[e-mail] ')) mails.push(JSON.parse(line.slice('[e-mail] '.length)));
    }
  });
  await new Promise((resolve, reject) => {
    proc.stdout.on('data', (d) => String(d).includes('rodando') && resolve());
    proc.on('exit', reject);
  });
  const clients = [];
  t.after(async () => {
    clients.forEach((c) => c.disconnect());
    const exited = new Promise((resolve) => proc.once('exit', resolve));
    proc.kill();
    await exited;
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const auth = async (payload) => {
    const socket = io(base, { forceNew: true, transports: ['websocket'] });
    clients.push(socket);
    socket.res = await new Promise((resolve) => socket.emit('auth', payload, resolve));
    return socket;
  };
  const post = async (url, body) => {
    const response = await fetch(base + url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  };
  const config = async () => (await fetch(base + '/config')).json();
  const nextMail = async () => {
    for (let i = 0; i < 60 && !mails.length; i++) await wait(50);
    assert.ok(mails.length, 'esperava um e-mail');
    return mails.shift();
  };
  return { auth, post, config, mails, nextMail };
}

test('e-mail: cadastro, confirmação e senha nova pelo link encerram as sessões antigas', async (t) => {
  const { auth, post, config, nextMail } = await startServer(t);
  assert.equal((await config()).mailEnabled, true);
  const ana = await auth({ mode: 'register', name: 'Ana', password: '1234', confirmPassword: '1234', email: ' Ana@Exemplo.com ' });
  assert.ok(!ana.res.error, ana.res.error);
  assert.equal(ana.res.email, 'ana@exemplo.com');
  assert.equal(ana.res.emailVerified, false);
  assert.equal(ana.res.mailEnabled, true);
  const confirmMail = await nextMail();
  assert.equal(confirmMail.to, 'ana@exemplo.com');
  const confirmToken = tokenIn(confirmMail, 'confirmar');
  assert.ok(confirmToken, 'link montado com PUBLIC_URL');

  let pushed = null;
  ana.on('account:email', (info) => { pushed = info; });
  assert.deepEqual((await post('/email/confirm', { token: confirmToken })).body, { ok: true });
  await wait(100);
  assert.deepEqual(pushed, { email: 'ana@exemplo.com', emailVerified: true });
  const again = await post('/email/confirm', { token: confirmToken });
  assert.equal(again.status, 400);
  assert.match(again.body.error, /expirou ou já foi usado/);

  const celular = await auth({ mode: 'login', name: 'Ana', password: '1234' });
  let ended = null;
  celular.on('session:ended', (reason) => { ended = reason; });

  assert.deepEqual((await post('/password/forgot', { email: 'ANA@exemplo.com' })).body, { ok: true });
  const resetMail = await nextMail();
  assert.match(resetMail.subject, /senha nova/);
  const resetToken = tokenIn(resetMail, 'redefinir');

  // Erro de digitação na senha não gasta o link.
  const short = await post('/password/reset', { token: resetToken, next: 'ab', confirm: 'ab' });
  assert.equal(short.status, 400);
  assert.match(short.body.error, /4 caracteres/);
  assert.match((await post('/password/reset', { token: resetToken, next: 'nova1', confirm: 'nova2' })).body.error, /não coincidem/);

  const reset = await post('/password/reset', { token: resetToken, next: 'nova1', confirm: 'nova1' });
  assert.equal(reset.status, 200);
  assert.equal(reset.body.ok, true);
  assert.equal(reset.body.name, 'Ana');
  await wait(200);
  assert.match(ended, /senha foi redefinida/);
  assert.equal(celular.connected, false);
  assert.equal(ana.connected, false);
  assert.match((await auth({ token: ana.res.token })).res.error, /Sessão expirada/);
  assert.ok(!(await auth({ token: reset.body.token })).res.error, 'a sessão nova vale');
  assert.match((await auth({ mode: 'login', name: 'Ana', password: '1234' })).res.error, /incorretos/);
  assert.ok(!(await auth({ mode: 'login', name: 'Ana', password: 'nova1' })).res.error);
  assert.match((await nextMail()).subject, /senha do Resenhex foi trocada/);
  const reused = await post('/password/reset', { token: resetToken, next: 'outra1', confirm: 'outra1' });
  assert.equal(reused.status, 400);
  assert.match(reused.body.error, /expirou ou já foi usado/);
});

test('e-mail: esqueci a senha responde igual para e-mail desconhecido e não confirmado, com limite', async (t) => {
  const { auth, post, mails, nextMail } = await startServer(t);
  await auth({ mode: 'register', name: 'Bia', password: '1234', confirmPassword: '1234', email: 'bia@exemplo.com' });
  await nextMail(); // confirmação, que a Bia não abriu
  assert.deepEqual((await post('/password/forgot', { email: 'ninguem@exemplo.com' })).body, { ok: true });
  assert.deepEqual((await post('/password/forgot', { email: 'bia@exemplo.com' })).body, { ok: true });
  await wait(300);
  assert.equal(mails.length, 0);
  const invalid = await post('/password/forgot', { email: 'invalido' });
  assert.equal(invalid.status, 400);
  assert.match(invalid.body.error, /e-mail válido/);
  assert.equal((await post('/password/forgot', { email: 'bia@exemplo.com' })).status, 200);
  assert.equal((await post('/password/forgot', { email: 'bia@exemplo.com' })).status, 200);
  const limited = await post('/password/forgot', { email: 'bia@exemplo.com' });
  assert.equal(limited.status, 429);
  assert.match(limited.body.error, /Muitos pedidos/);
});

test('e-mail: Minha conta pede a senha atual e o endereço não vaza para ninguém', async (t) => {
  const { auth, post, nextMail } = await startServer(t);
  assert.match((await auth({ mode: 'register', name: 'Caio', password: '1234', confirmPassword: '1234', email: 'invalido' })).res.error, /e-mail válido/);
  const ana = await auth({ mode: 'register', name: 'Ana', password: '1234', confirmPassword: '1234' });
  assert.equal(ana.res.email, null);
  const states = [];
  ana.on('state', (state) => states.push(JSON.stringify(state)));

  assert.match((await emit(ana, 'account:email', { email: 'ana@exemplo.com', password: 'errada' })).error, /atual está incorreta/);
  assert.match((await emit(ana, 'account:email', { email: 'invalido', password: '1234' })).error, /e-mail válido/);
  assert.deepEqual(await emit(ana, 'account:email', { email: 'ana@exemplo.com', password: '1234' }), { ok: true, email: 'ana@exemplo.com', emailVerified: false, sent: true });
  await post('/email/confirm', { token: tokenIn(await nextMail(), 'confirmar') });

  assert.deepEqual(await emit(ana, 'account:email', { email: 'ana2@exemplo.com', password: '1234' }), { ok: true, email: 'ana2@exemplo.com', emailVerified: false, sent: true });
  const [first, second] = [await nextMail(), await nextMail()];
  const byTo = Object.fromEntries([first, second].map((m) => [m.to, m]));
  assert.match(byTo['ana@exemplo.com'].subject, /alterado/);
  assert.match(byTo['ana2@exemplo.com'].subject, /Confirme/);

  assert.equal((await emit(ana, 'account:email:resend', {})).sent, true);
  await nextMail();
  assert.deepEqual(await emit(ana, 'account:email', { email: '', password: '1234' }), { ok: true, email: null, emailVerified: false, sent: false });

  await emit(ana, 'presence', { presence: 'idle' });
  await wait(200);
  assert.ok(states.length > 0, 'recebeu estado depois das mudanças');
  for (const state of states) assert.ok(!state.includes('@exemplo.com'), 'o e-mail não pode ir no estado');
});

test('e-mail: sem SMTP configurado a recuperação fica desligada', async (t) => {
  const { auth, post, config, mails } = await startServer(t, { MAIL_DEV: '' });
  assert.equal((await config()).mailEnabled, false);
  const ana = await auth({ mode: 'register', name: 'Ana', password: '1234', confirmPassword: '1234', email: 'ana@exemplo.com' });
  assert.ok(!ana.res.error, ana.res.error);
  assert.equal(ana.res.email, null, 'o e-mail é ignorado quando o envio está desligado');
  assert.equal(ana.res.mailEnabled, false);
  assert.match((await emit(ana, 'account:email', { email: 'ana@exemplo.com', password: '1234' })).error, /desligad/);
  const forgot = await post('/password/forgot', { email: 'ana@exemplo.com' });
  assert.equal(forgot.status, 404);
  assert.equal(mails.length, 0);
});
