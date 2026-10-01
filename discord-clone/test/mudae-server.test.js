const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { io } = require('socket.io-client');
const wait = (ms = 70) => new Promise((r) => setTimeout(r, ms));
async function eventually(check, timeout = 2000) {
  const end = Date.now() + timeout;
  for (;;) {
    try { return check(); } catch (error) { if (Date.now() > end) throw error; }
    await wait(20);
  }
}

// Catálogo de um personagem só: todo roll cai nele, então dá para testar o claim disputado.
async function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'resenhex-mudae-'));
  const catalog = path.join(dir, 'catalogo.json');
  fs.writeFileSync(catalog, JSON.stringify([[40882, 'Eren Yeager', 'Attack on Titan', 'b40882-x.jpg', 'M', 31784]]));
  const port = 40000 + Math.floor(Math.random() * 20000);
  const base = 'http://127.0.0.1:' + port;
  const proc = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), DATA_FILE: path.join(dir, 'data.json'), UPLOAD_DIR: path.join(dir, 'uploads'), MUDAE_CATALOG: catalog },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Server startup timeout')), 5000);
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
    const socket = io(base, { forceNew: true, transports: ['websocket'] }); clients.push(socket);
    socket.on('state', (s) => { socket.last = s; });
    socket.messages = [];
    socket.updates = [];
    socket.on('chat:message', (m) => socket.messages.push(m.msg));
    socket.on('chat:update', (m) => socket.updates.push(m.msg));
    socket.on('mudae:presence', (p) => { socket.presence = p; });
    socket.reactions = [];
    socket.on('mudae:reaction', (r) => socket.reactions.push(r));
    socket.call = (event, value = {}) => new Promise((r) => socket.timeout(3000).emit(event, value, (error, reply) => r(error ? { error: error.message } : reply)));
    socket.auth = await socket.call('auth', { mode: 'register', name, password: '1234', confirmPassword: '1234' });
    assert.ok(!socket.auth.error, socket.auth.error);
    await wait();
    if (!socket.last.serverId) {
      const invite = await clients[0].call('server:invite');
      assert.ok(!(await socket.call('server:join', { code: invite.code })).error);
    }
    return socket;
  }
  return { connect };
}

test('Salão do Mudae: comandos só no Salão, giro, prioridade, roubo, presença e reações', async (t) => {
  const { connect } = await fixture(t);
  const ana = await connect('Ana');
  const beto = await connect('Beto');
  const geral = ana.last.channels.find((c) => c.type === 'text');
  const lastBot = (s) => s.messages.filter((m) => m.bot === 'mudae').at(-1);

  // Sem Salão, o comando no #geral só explica onde o Mudae mora.
  const lost = await ana.call('chat:send', { channel: geral.id, text: '$w' });
  assert.deepEqual(lost.ephemeral, { command: '$w', kind: 'redirect', channel: null, name: null });

  // Criar o Salão: canal de texto marcado com mudae.
  const created = await ana.call('channel', { action: 'create', type: 'mudae', name: 'Salão Mudae' });
  assert.ok(!created.error, created.error);
  const salon = await eventually(() => { const c = beto.last.channels.find((ch) => ch.id === created.id); assert.ok(c); return c; });
  assert.equal(salon.type, 'text');
  assert.equal(salon.mudae, true);
  assert.equal(salon.name, 'salão-mudae');
  assert.equal((await ana.call('chat:send', { channel: geral.id, text: '$w' })).ephemeral.channel, salon.id);
  const send = (s, text) => s.call('chat:send', { channel: salon.id, text });

  // Presença: quem abre o Salão aparece para os outros, com os rolls.
  const me = await ana.call('mudae:presence', { channel: salon.id });
  assert.equal(me.rollsLeft, 10);
  await beto.call('mudae:presence', { channel: salon.id });
  await eventually(() => assert.deepEqual(ana.presence.people.map((p) => p.id).sort(), [ana.auth.accountId, beto.auth.accountId].sort()));
  assert.match((await ana.call('mudae:presence', { channel: geral.id })).error, /só funciona no Salão/);

  // Roll: as fotos da roleta vão no envio, mas não ficam gravadas.
  assert.deepEqual(await send(ana, '$w'), { ok: true });
  const roll = await eventually(() => { const m = lastBot(beto); assert.equal(m?.mudae.kind, 'roll'); return m; });
  assert.equal(roll.by, ana.auth.accountId);
  assert.equal(roll.mudae.card.rarity, 'common', 'um personagem sozinho é o último de 15 mil na escala proporcional');
  assert.equal(roll.mudae.decoys.length, 8);
  assert.ok(Math.abs(roll.mudae.revealAt - roll.ts - 1950) < 50);
  assert.equal(roll.mudae.priorityUntil - roll.mudae.revealAt, 3000);
  assert.equal(roll.mudae.expires - roll.mudae.revealAt, 45_000);
  await eventually(() => assert.equal(beto.presence.people.find((p) => p.id === ana.auth.accountId).rollsLeft, 9));

  // Durante o giro ninguém casa; depois, só quem rodou, por 3 s; depois, qualquer um rouba.
  assert.match((await beto.call('mudae:claim', { channel: salon.id, id: roll.id })).error, /girando/);
  await wait(roll.mudae.revealAt - Date.now() + 50);
  assert.match((await beto.call('mudae:claim', { channel: salon.id, id: roll.id })).error, /prioridade/);
  await wait(roll.mudae.priorityUntil - Date.now() + 50);
  assert.ok(!(await beto.call('mudae:claim', { channel: salon.id, id: roll.id })).error);
  const stolen = await eventually(() => { const m = lastBot(ana); assert.equal(m.mudae.kind, 'married'); return m; });
  assert.equal(stolen.mudae.ownerId, beto.auth.accountId);
  assert.equal(stolen.mudae.from, ana.auth.accountId, 'roubo do roll da Ana');
  await eventually(() => assert.equal(ana.presence.people.find((p) => p.id === beto.auth.accountId).claimReady, false));

  const history = await beto.call('chat:history', { channel: salon.id });
  const saved = history.messages.find((m) => m.id === roll.id);
  assert.equal(saved.mudae.decoys, undefined);
  assert.equal(saved.mudae.ownerId, beto.auth.accountId);

  // Reações: chegam a quem está no Salão, sem gravar.
  assert.ok(!(await ana.call('mudae:react', { channel: salon.id, id: roll.id, emoji: '🔥' })).error);
  await eventually(() => assert.deepEqual(beto.reactions.at(-1), { channel: salon.id, id: roll.id, emoji: '🔥', by: ana.auth.accountId }));
  assert.match((await ana.call('mudae:react', { channel: salon.id, id: roll.id, emoji: '🍕' })).error, /inválida/);

  // Álbum, favorito, ranking e o resumo do perfil.
  const album = await ana.call('mudae:harem', { ownerId: beto.auth.accountId });
  assert.equal(album.ownerId, beto.auth.accountId);
  assert.deepEqual(album.chars.map((c) => c.name), ['Eren Yeager']);
  assert.equal(album.favorite.name, 'Eren Yeager');
  assert.equal((await ana.call('mudae:harem', {})).total, 0);
  assert.match((await ana.call('mudae:favorite', { charId: 40882 })).error, /não é seu/);
  assert.ok(!(await beto.call('mudae:favorite', { charId: 40882 })).error);
  assert.equal((await ana.call('mudae:profile', { accountId: beto.auth.accountId })).summary.favorite.chosen, true);
  assert.equal((await ana.call('mudae:profile', { accountId: ana.auth.accountId })).summary, null);
  const ranking = await ana.call('mudae:ranking');
  assert.deepEqual(ranking.rows.map((r) => [r.ownerId, r.total]), [[beto.auth.accountId, 1]]);
  assert.deepEqual(ranking.legendaries, []);

  // Divórcio pelo álbum: a notícia sai no Salão.
  assert.match((await ana.call('mudae:divorce', { channel: salon.id, charId: 40882 })).error, /não é seu/);
  assert.ok(!(await beto.call('mudae:divorce', { channel: salon.id, charId: 40882 })).error);
  await eventually(() => assert.equal(lastBot(ana).mudae.kind, 'divorce'));
  assert.equal((await ana.call('mudae:profile', { accountId: beto.auth.accountId })).summary, null);

  // $im e erros continuam no chat do Salão.
  await send(ana, '$im eren');
  await eventually(() => { assert.equal(lastBot(beto).mudae.kind, 'info'); assert.equal(lastBot(beto).mudae.ownerId, null); });
  assert.match((await send(ana, '$im naruto')).ephemeral.text, /Nenhum personagem/);

  // Sair do Salão tira a pessoa da lista.
  await beto.call('mudae:presence', { channel: null });
  await eventually(() => assert.deepEqual(ana.presence.people.map((p) => p.id), [ana.auth.accountId]));

  // O último canal de texto comum não pode ser apagado, mesmo com um Salão.
  const plain = ana.last.channels.filter((c) => c.type === 'text' && !c.mudae);
  for (const c of plain.slice(1)) assert.ok(!(await ana.call('channel', { action: 'delete', id: c.id })).error);
  assert.match((await ana.call('channel', { action: 'delete', id: plain[0].id })).error, /pelo menos um canal de texto/);

  // Sem a permissão "Usar o Mudae", o comando é recusado.
  const everyone = ana.last.roles.find((r) => r.id === 'everyone');
  assert.ok(everyone.perms.includes('MUDAE'));
  assert.ok(!(await ana.call('role', { action: 'update', id: 'everyone', perms: everyone.perms.filter((p) => p !== 'MUDAE') })).error);
  assert.match((await send(beto, '$w')).error, /permissão para usar o Mudae/);
});
