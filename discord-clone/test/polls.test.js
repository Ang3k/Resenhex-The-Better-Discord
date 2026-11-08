// Enquetes do chat da chamada: as regras (server/polls.js) e o caminho com o servidor de verdade.
const test = require('node:test');
const assert = require('node:assert/strict');
const { applyPatch } = require('../public/state-patch');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { io } = require('socket.io-client');
const polls = require('../server/polls');

const wait = (ms = 70) => new Promise((r) => setTimeout(r, ms));
async function eventually(check, timeout = 2000) {
  const end = Date.now() + timeout;
  for (;;) {
    try { return check(); } catch (error) { if (Date.now() > end) throw error; }
    await wait(20);
  }
}

test('regras: pergunta e opções limpas, um voto por pessoa que dá para trocar ou tirar, prazo e vencedora', () => {
  const now = 1_000_000;
  assert.throws(() => polls.create({ question: ' ', options: ['a', 'b'], duration: 0 }), /pergunta/);
  assert.throws(() => polls.create({ question: 'q', options: ['a', ' '], duration: 0 }), /pelo menos 2/);
  assert.throws(() => polls.create({ question: 'q', options: ['1', '2', '3', '4', '5', '6', '7'], duration: 0 }), /até 6/);
  assert.throws(() => polls.create({ question: 'q', options: ['Pizza', 'pizza'], duration: 0 }), /repetidas/);
  assert.throws(() => polls.create({ question: 'q', options: ['a', 'b'], duration: 1234 }), /Duração/);

  const poll = polls.create({ question: '  Qual   jogo? ', options: [' Valorant ', 'LoL', ''], duration: 60_000 }, now);
  assert.deepEqual(poll, { question: 'Qual jogo?', options: [{ text: 'Valorant', votes: [] }, { text: 'LoL', votes: [] }], endsAt: now + 60_000, ended: null });
  assert.equal(polls.create({ question: 'q', options: ['a', 'b'], duration: 0 }).endsAt, null, 'até alguém encerrar');

  assert.equal(polls.vote(poll, 'ana', 0, now), true);
  assert.equal(polls.vote(poll, 'beto', 0, now), true);
  assert.equal(polls.vote(poll, 'ana', 1, now), true, 'trocar de opção');
  assert.deepEqual(poll.options.map((o) => o.votes), [['beto'], ['ana']]);
  assert.equal(polls.vote(poll, 'ana', 1, now), false, 'votar de novo na mesma tira o voto');
  assert.deepEqual(poll.options.map((o) => o.votes), [['beto'], []]);
  assert.throws(() => polls.vote(poll, 'ana', 5, now), /Opção inválida/);
  assert.deepEqual(polls.winners(poll), [0]);

  // Passou do prazo: não vota mais, e o fim fica marcado na hora do prazo.
  assert.equal(polls.isOpen(poll, now + 60_000), false);
  assert.throws(() => polls.vote(poll, 'ana', 0, now + 60_001), /já acabou/);
  assert.equal(polls.end(poll, now + 90_000), true);
  assert.equal(poll.ended, now + 60_000);
  assert.equal(polls.end(poll, now + 99_000), false, 'encerrar de novo não muda nada');

  const tie = polls.create({ question: 'q', options: ['a', 'b'], duration: 0 });
  assert.deepEqual(polls.winners(tie), [], 'sem votos, sem vencedora');
  polls.vote(tie, 'x', 0); polls.vote(tie, 'y', 1);
  assert.deepEqual(polls.winners(tie), [0, 1], 'empate');
});

async function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'resenhex-polls-'));
  const port = 40000 + Math.floor(Math.random() * 20000);
  const proc = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), DATA_FILE: path.join(dir, 'data.json'), UPLOAD_DIR: path.join(dir, 'uploads'), ACCESS_PASSWORD: '' },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Server startup timeout')), 8000);
    proc.stdout.on('data', (data) => { if (String(data).includes('rodando')) { clearTimeout(timer); resolve(); } });
    proc.once('exit', (code) => { clearTimeout(timer); reject(new Error('Server exited: ' + code)); });
  });
  const clients = [];
  t.after(async () => {
    clients.forEach((s) => s.disconnect());
    const exit = new Promise((r) => proc.once('exit', r)); proc.kill(); await exit;
    fs.rmSync(dir, { recursive: true, force: true });
  });
  async function connect(name) {
    const socket = io('http://127.0.0.1:' + port, { forceNew: true, transports: ['websocket'] }); clients.push(socket);
    socket.on('state', (s) => { socket.last = s; }); socket.on('state:patch', (p) => applyPatch(socket.last, p));
    socket.messages = [];
    socket.updates = [];
    socket.on('chat:message', (m) => socket.messages.push(m.msg));
    socket.on('chat:update', (m) => socket.updates.push(m.msg));
    socket.call = (event, value = {}) => new Promise((r) => socket.timeout(3000).emit(event, value, (error, reply) => r(error ? { error: error.message } : reply)));
    socket.auth = await socket.call('auth', { mode: 'register', name, password: '1234', confirmPassword: '1234' });
    assert.ok(!socket.auth.error, socket.auth.error);
    await wait();
    if (!socket.last.serverId) {
      const invite = await clients[0].call('server:invite');
      assert.ok(!(await socket.call('server:join', { code: invite.code })).error);
      await wait();
    }
    return socket;
  }
  return { connect };
}

test('enquete no chat da sala de voz: criar, votar com foto, uma aberta por vez, encerrar e a da chamada', async (t) => {
  const { connect } = await fixture(t);
  const ana = await connect('Ana'); // dona do servidor
  const beto = await connect('Beto');
  const caio = await connect('Caio');
  const sala = ana.last.channels.find((c) => c.type === 'voice');
  const geral = ana.last.channels.find((c) => c.type === 'text');

  // Só no chat das salas de voz.
  assert.match((await beto.call('poll:create', { channel: geral.id, question: 'q', options: ['a', 'b'], duration: 0 })).error, /salas de voz/);
  assert.match((await beto.call('poll:create', { channel: sala.id, question: 'q', options: ['a'], duration: 0 })).error, /2 opções/);

  const created = await beto.call('poll:create', { channel: sala.id, question: 'Qual jogo?', options: ['Valorant', 'LoL'], duration: 300_000 });
  assert.ok(created.ok, created.error);
  const msg = await eventually(() => { const m = caio.messages.find((x) => x.poll); assert.ok(m); return m; });
  assert.equal(msg.id, created.id);
  assert.equal(msg.authorId, beto.auth.accountId);
  assert.equal(msg.poll.question, 'Qual jogo?');
  assert.ok(Math.abs(msg.poll.endsAt - msg.ts - 300_000) < 50);
  assert.match((await caio.call('poll:create', { channel: sala.id, question: 'outra', options: ['a', 'b'], duration: 0 })).error, /Já tem uma enquete aberta/);
  assert.match((await beto.call('chat:edit', { channel: sala.id, id: msg.id, text: 'oi' })).error, /editar uma enquete/);

  // A da chamada: quem entra depois pede a aberta da sala.
  const active = await caio.call('poll:active', { channel: sala.id });
  assert.equal(active.msg.id, msg.id);
  assert.equal(active.authors[0].id, beto.auth.accountId);

  // Votos: um por pessoa, trocar e tirar; todo mundo vê quem votou em quê.
  assert.deepEqual(await caio.call('poll:vote', { channel: sala.id, id: msg.id, option: 0 }), { ok: true, voted: true });
  assert.deepEqual(await ana.call('poll:callVote', { channel: sala.id, id: msg.id, option: 0 }), { ok: true, voted: true });
  assert.deepEqual(await caio.call('poll:vote', { channel: sala.id, id: msg.id, option: 1 }), { ok: true, voted: true });
  await eventually(() => assert.deepEqual(beto.updates.at(-1).poll.options.map((o) => o.votes), [[ana.auth.accountId], [caio.auth.accountId]]));
  assert.deepEqual(await ana.call('poll:vote', { channel: sala.id, id: msg.id, option: 0 }), { ok: true, voted: false });
  assert.match((await caio.call('poll:vote', { channel: sala.id, id: msg.id, option: 9 })).error, /Opção inválida/);

  // Encerrar: quem criou ou quem gerencia mensagens (a dona); os outros não.
  assert.match((await caio.call('poll:end', { channel: sala.id, id: msg.id })).error, /Só quem criou/);
  assert.ok(!(await ana.call('poll:end', { channel: sala.id, id: msg.id })).error);
  const ended = await eventually(() => { const m = caio.updates.at(-1); assert.ok(m.poll.ended); return m; });
  assert.deepEqual(ended.poll.options.map((o) => o.votes), [[], [caio.auth.accountId]]);
  assert.match((await beto.call('poll:vote', { channel: sala.id, id: msg.id, option: 0 })).error, /já acabou/);
  assert.equal((await caio.call('poll:active', { channel: sala.id })).msg, null);

  // Fechada a anterior, dá para abrir outra; apagar a mensagem tira a enquete.
  const second = await caio.call('poll:create', { channel: sala.id, question: 'Pizza?', options: ['Sim', 'Não'], duration: 0 });
  assert.ok(second.ok, second.error);
  assert.equal((await beto.call('poll:active', { channel: sala.id })).msg.poll.endsAt, null);
  assert.ok(!(await caio.call('chat:delete', { channel: sala.id, id: second.id })).error);
  assert.equal((await beto.call('poll:active', { channel: sala.id })).msg, null);
});
