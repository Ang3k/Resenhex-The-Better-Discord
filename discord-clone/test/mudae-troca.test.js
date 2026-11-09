// Comandos novos do Mudae pelo servidor de verdade, com duas contas: desejo com aviso, cristal de
// kakera, $top, a troca com os dois confirmando, $give, $dk e o cancelamento de uma troca.
const test = require('node:test');
const assert = require('node:assert/strict');
const { applyPatch } = require('../public/state-patch');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { io } = require('socket.io-client');
const wait = (ms = 70) => new Promise((r) => setTimeout(r, ms));
async function eventually(check, timeout = 3000) {
  const end = Date.now() + timeout;
  for (;;) {
    try { return check(); } catch (error) { if (Date.now() > end) throw error; }
    await wait(20);
  }
}

// Uma waifu de anime e um husbando de jogo: "$wa" sempre tira a Mikasa e "$hg" sempre tira o Link.
async function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'resenhex-mudae-troca-'));
  const catalog = path.join(dir, 'catalogo.json');
  fs.writeFileSync(catalog, JSON.stringify([[2, 'Mikasa Ackerman', 'Attack on Titan', 'b2-x.jpg', 'F', 800, 'a'], ['g1', 'Link', 'Zelda', 'https://images.igdb.com/1.jpg', 'M', 300, 'g']]));
  const port = 40000 + Math.floor(Math.random() * 20000);
  const base = 'http://127.0.0.1:' + port;
  const proc = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), DATA_FILE: path.join(dir, 'data.json'), UPLOAD_DIR: path.join(dir, 'uploads'), MUDAE_CATALOG: catalog },
    stdio: ['ignore', 'pipe', 'pipe'],
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
    const socket = io(base, { forceNew: true, transports: ['websocket'] }); clients.push(socket);
    socket.on('state', (s) => { socket.last = s; }); socket.on('state:patch', (p) => applyPatch(socket.last, p));
    socket.messages = [];
    socket.updates = [];
    socket.trades = [];
    socket.wishes = [];
    socket.on('chat:message', (m) => socket.messages.push(m.msg));
    socket.on('chat:update', (m) => socket.updates.push(m.msg));
    socket.on('mudae:trade', (v) => socket.trades.push(v));
    socket.on('mudae:wish', (w) => socket.wishes.push(w));
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

test('Mudae com duas contas: desejo, cristal, $top, troca confirmada pelos dois, $give e $dk', async (t) => {
  const { connect } = await fixture(t);
  const ana = await connect('Ana');
  const beto = await connect('Beto');
  const A = ana.auth.accountId;
  const B = beto.auth.accountId;
  const created = await ana.call('channel', { action: 'create', type: 'mudae', name: 'Salão Mudae' });
  assert.ok(!created.error, created.error);
  const salon = await eventually(() => { const c = beto.last.channels.find((ch) => ch.id === created.id); assert.ok(c); return c; });
  const send = (s, text) => s.call('chat:send', { channel: salon.id, text });
  const lastBot = (s, kind) => s.messages.filter((m) => m.bot === 'mudae' && (!kind || m.mudae.kind === kind)).at(-1);
  async function rollAndWait(s, text) {
    const before = s.messages.length;
    assert.deepEqual(await send(s, text), { ok: true });
    const roll = await eventually(() => { const m = s.messages.slice(before).find((x) => x.mudae?.kind === 'roll'); assert.ok(m); return m; });
    await wait(roll.mudae.revealAt - Date.now() + 50);
    return roll;
  }

  // Desejo: só para quem pediu, e o aviso chega quando alguém roda.
  const wished = await send(beto, '$wish mikasa');
  assert.equal(wished.ephemeral.kind, 'wish');
  assert.equal(wished.ephemeral.card.name, 'Mikasa Ackerman');
  const r1 = await rollAndWait(ana, '$wa');
  assert.deepEqual(r1.mudae.wishedBy, [B]);
  await eventually(() => assert.equal(beto.wishes.at(-1)?.card.name, 'Mikasa Ackerman'));
  assert.equal(beto.wishes.at(-1).by, A);
  assert.equal(ana.wishes.length, 0, 'quem rodou não recebe aviso');
  assert.ok(!(await ana.call('mudae:claim', { channel: salon.id, id: r1.id })).error);
  assert.ok(!(await beto.call('mudae:claim', { channel: salon.id, id: (await rollAndWait(beto, '$hg')).id })).error);

  // $top: a mensagem leva só o filtro; as páginas vêm com o dono de cada um.
  await send(ana, '$top');
  const top = await eventually(() => { const m = lastBot(beto, 'top'); assert.ok(m); return m; });
  const page = await beto.call('mudae:list', { key: top.mudae.key, page: 0 });
  assert.deepEqual(page.chars.map((c) => [c.name, c.ownerId]), [['Mikasa Ackerman', A], ['Link', B]]);
  assert.equal((await beto.call('mudae:filter', { text: 'husbandos' })).label, 'Husbandos');
  assert.match((await send(beto, '$top animais')).ephemeral.text, /ainda não separa/);
  assert.match((await send(beto, '$obra pokemon')).ephemeral.text, /Nenhuma obra/);

  await send(beto, '$dk'); // o Beto precisa de kakera para a troca
  // Troca: Ana chama, os dois recebem o painel e a mensagem fica no Salão.
  assert.deepEqual(await send(ana, `$trade <@${B}>`), { ok: true });
  const opened = await eventually(() => { const v = beto.trades.at(-1); assert.equal(v?.state, 'open'); return v; });
  assert.equal(opened.a, A);
  const tradeMsg = await eventually(() => { const m = lastBot(beto, 'trade'); assert.equal(m?.mudae.state, 'open'); return m; });
  assert.equal((await beto.call('mudae:trade:get')).trade.id, opened.id);
  assert.match((await send(beto, `$trade <@${A}>`)).error, /já tem uma troca/);

  // Quem não tem a carta não oferece; cada mudança desfaz as confirmações.
  assert.match((await beto.call('mudae:trade:offer', { id: opened.id, chars: [2] })).error, /do seu harem/);
  let view = await ana.call('mudae:trade:offer', { id: opened.id, chars: [2] });
  view = await beto.call('mudae:trade:offer', { id: opened.id, chars: ['g1'], kakera: 50 });
  assert.deepEqual(view.sides[B].chars.map((c) => c.name), ['Link']);
  view = await ana.call('mudae:trade:confirm', { id: opened.id, rev: view.rev });
  assert.equal(view.sides[A].ok, true);
  await eventually(() => assert.equal(beto.trades.at(-1).sides[A].ok, true));
  const stale = view.rev;
  view = await beto.call('mudae:trade:offer', { id: opened.id, chars: ['g1'], kakera: 20 });
  assert.equal(view.sides[A].ok, false, 'Beto mudou: a confirmação da Ana caiu');
  assert.match((await ana.call('mudae:trade:confirm', { id: opened.id, rev: stale })).error, /mudou/);
  await ana.call('mudae:trade:confirm', { id: opened.id, rev: view.rev });
  const done = await beto.call('mudae:trade:confirm', { id: opened.id, rev: view.rev });
  assert.equal(done.state, 'done');

  // Trocou tudo de uma vez: cartas e kakera, e a mensagem do Salão conta como foi.
  const finished = await eventually(() => { const m = ana.updates.find((x) => x.id === tradeMsg.id && x.mudae.state === 'done'); assert.ok(m); return m; });
  assert.deepEqual(finished.mudae.sides[A].chars.map((c) => c.name), ['Mikasa Ackerman']);
  assert.equal(finished.mudae.sides[B].kakera, 20);
  assert.deepEqual((await ana.call('mudae:harem', {})).chars.map((c) => c.name), ['Link']);
  assert.deepEqual((await beto.call('mudae:harem', {})).chars.map((c) => c.name), ['Mikasa Ackerman']);
  // (o saldo pelo evento de status: os comandos têm limite de 8 a cada 5 s)
  assert.equal((await ana.call('mudae:status')).kakera, 20);
  assert.equal((await beto.call('mudae:status')).kakera, 230);
  assert.equal((await beto.call('mudae:wishlist', {})).total, 0, 'ganhar na troca quem desejava tira da lista');
  await send(ana, '$im mikasa');
  const info = await eventually(() => { const m = lastBot(ana, 'info'); assert.ok(m); return m; });
  assert.deepEqual([info.mudae.ownerId, info.mudae.via, info.mudae.owners], [B, 'trade', 2]);
  assert.equal((await beto.call('mudae:trade:get')).trade, null);

  // $give: só quem dá confirma (no app); a carta muda de dono na hora.
  assert.match((await send(ana, `$give <@${B}> mikasa`)).ephemeral.text, /não tem ninguém/);
  assert.deepEqual(await send(beto, `$give <@${A}> mikasa`), { ok: true });
  await eventually(() => assert.equal(lastBot(ana, 'give')?.mudae.to, A));
  assert.deepEqual((await ana.call('mudae:harem', {})).chars.map((c) => c.name), ['Mikasa Ackerman', 'Link']);

  // $dk sai no Salão e soma no saldo; o segundo do dia é recusado.
  await send(ana, '$dk');
  await eventually(() => assert.equal(lastBot(beto, 'dk')?.mudae.kakera, 270));
  assert.match((await send(ana, '$dk')).ephemeral.text, /volta em/);
  const tu = (await send(ana, '$tu')).ephemeral;
  assert.equal(tu.kakera, 270);
  assert.ok(tu.dkIn > 0);

  // Cancelar: qualquer um dos dois cancela e a mensagem do Salão mostra o fim.
  const second = await ana.call('mudae:trade:open', { channel: salon.id, with: B });
  assert.equal(second.state, 'open');
  const secondMsg = await eventually(() => { const m = lastBot(beto, 'trade'); assert.equal(m?.mudae.tradeId, second.id); return m; });
  assert.equal((await beto.call('mudae:trade:cancel', { id: second.id })).state, 'canceled');
  await eventually(() => assert.equal(ana.updates.find((x) => x.id === secondMsg.id)?.mudae.state, 'canceled'));
  assert.deepEqual((await ana.call('mudae:harem', {})).chars.map((c) => c.name), ['Mikasa Ackerman', 'Link'], 'cancelar não mexe em nada');
});
