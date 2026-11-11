// Poderes que mudam o próximo roll: Vidência, Amuleto, Chamar desejo e Escolha dupla.
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { io } = require('socket.io-client');
const { applyPatch } = require('../public/state-patch');
const { createMudae, rarityOf, CLAIM_RESET_MS, ROLL_RESET_MS } = require('../server/mudae');
const { createPoderes } = require('../server/mudae-poderes');
const { AMULETO, DESEJO_CHANCE, POWER_RECHARGE_MS } = require('../server/mudae-regras');
const { readRoot, writeRoot } = require('../server/store');

// Catálogo com as 4 raridades. Numa fonte de n personagens, a posição i vale i × REF / n na escala,
// então 120 de anime numa escala de 6 mil ficam de 50 em 50: 2 lendários (até 100), 18 épicos (até 1000),
// 80 raros (até 5000) e 20 comuns. Os 10 de jogo ficam de 600 em 600: nenhum lendário.
// Ímpar é mulher, par é homem: $w e $h também têm as 4 raridades.
const REF = 6000;
const ANIME = Array.from({ length: 120 }, (_, k) => [k + 1, 'Anime ' + (k + 1), 'Obra', `b${k + 1}-x.jpg`, k % 2 ? 'M' : 'F', 10000 - k, 'a']);
const JOGOS = Array.from({ length: 10 }, (_, k) => ['g' + (k + 1), 'Jogo ' + (k + 1), 'Jogo', `https://images.igdb.com/${k + 1}.jpg`, k % 2 ? 'M' : 'F', 10000 - k, 'g']);
const CATALOG = [...ANIME, ...JOGOS];
// A lista do $m como o servidor monta: pela posição na escala, anime antes de jogo no empate.
const SCALED = [...ANIME.map((row, k) => [row, (k + 1) * REF / ANIME.length]), ...JOGOS.map((row, k) => [row, (k + 1) * REF / JOGOS.length])]
  .sort((a, b) => a[1] - b[1]);
const POOL = { m: SCALED.map(([row]) => row[0]), w: SCALED.filter(([row]) => row[4] === 'F').map(([row]) => row[0]) };
const RARITY = Object.fromEntries(SCALED.map(([row, eq]) => [row[0], rarityOf(eq)]));
// Quantos de cada raridade há no $m: 2 lendários, 19 épicos, 87 raros e 22 comuns.
const COUNT = { legendary: 2, epic: 19, rare: 87, common: 22 };

// random: devolve a fila "next" e, quando ela acaba, "r".
function setup() {
  let t = 10 * CLAIM_RESET_MS + 1000;
  const state = { r: 0.5, next: [], calls: 0 };
  const random = () => { state.calls++; return state.next.length ? state.next.shift() : state.r; };
  const make = () => createMudae({ catalog: CATALOG, now: () => t, random, refSize: REF });
  const store = { claims: {}, usage: {} };
  return { mudae: make(), make, store, state, advance: (ms) => { t += ms; }, now: () => t };
}
const rarityOfCard = (r) => r.card.rarity;

test('o catálogo do teste tem as 4 raridades em $m, $w e $h', () => {
  const counts = {};
  for (const id of POOL.m) counts[RARITY[id]] = (counts[RARITY[id]] || 0) + 1;
  assert.deepEqual(counts, { legendary: 2, epic: 19, rare: 87, common: 22 });
  assert.deepEqual(new Set(POOL.w.map((id) => RARITY[id])), new Set(['legendary', 'epic', 'rare', 'common']));
});

test('sem efeito, o roll é o mesmo de antes', () => {
  const { mudae, store, state } = setup();
  // O sorteio de hoje: um random escolhe a posição na lista e mais 8 fazem as fotos da roleta.
  for (const [kind, r] of [['m', 0], ['m', 0.37], ['w', 0.61], ['m', 0.999], ['w', 0.2]]) {
    state.next = [r];
    const before = state.calls;
    const got = mudae.roll(store, 'a', kind);
    assert.equal(got.card.id, POOL[kind][Math.floor(r * POOL[kind].length)], `${kind} com ${r}`);
    assert.equal(state.calls - before, 9, 'um random para a carta e 8 para a roleta');
    assert.equal(got.second, undefined);
  }
  assert.equal(store.usage.a.future, undefined);
  assert.equal(store.usage.a.armed, undefined);
});

test('Vidência: as 3 próximas raridades se cumprem em qualquer comando', () => {
  const { mudae, store, state } = setup();
  // Pesos da lista $m (do mais raro para o mais comum): lendário abaixo de 2/130, épico abaixo de 21/130…
  state.next = [0.01, 0.1, 0.9];
  assert.deepEqual(mudae.foresee(store, 'a'), { future: ['legendary', 'epic', 'common'], wish: false });
  assert.deepEqual(mudae.foresee(store, 'a').future, ['legendary', 'epic', 'common'], 'olhar de novo não muda nada');
  assert.equal(rarityOfCard(mudae.roll(store, 'a', 'w')), 'legendary');
  state.next = [0.95];
  assert.deepEqual(mudae.foresee(store, 'a').future, ['epic', 'common', 'common'], 'a previsão anda junto e completa até 3');
  assert.equal(rarityOfCard(mudae.roll(store, 'a', 'h')), 'epic');
  assert.equal(rarityOfCard(mudae.roll(store, 'a', 'm')), 'common');
  assert.equal(rarityOfCard(mudae.roll(store, 'a', 'wa')), 'common');
  assert.equal(store.usage.a.future, undefined, 'previsão cumprida, nada sobra');
});

test('raridade que a lista não tem cai na mais próxima, sem erro', () => {
  const { mudae, store, state } = setup();
  state.next = [0.01, 0.01, 0.9];
  assert.deepEqual(mudae.foresee(store, 'a').future, ['legendary', 'legendary', 'common']);
  // $mg (jogos) não tem lendário: o mais próximo é o épico, e o único épico de jogo é o g1.
  const got = mudae.roll(store, 'a', 'mg');
  assert.equal(got.card.id, 'g1');
  assert.equal(got.card.rarity, 'epic');
  assert.equal(rarityOfCard(mudae.roll(store, 'a', 'm')), 'legendary', 'no $m a previsão vale como veio');
});

test('Amuleto: lendário 5× e épico 3× mais provável', () => {
  assert.deepEqual(AMULETO, { legendary: 5, epic: 3 });
  const w = { legendary: COUNT.legendary * AMULETO.legendary, epic: COUNT.epic * AMULETO.epic, rare: COUNT.rare, common: COUNT.common };
  const total = w.legendary + w.epic + w.rare + w.common;
  const edges = [w.legendary / total, (w.legendary + w.epic) / total, (w.legendary + w.epic + w.rare) / total];
  const eps = 1e-6;
  const cases = [
    [0, 'legendary'], [edges[0] - eps, 'legendary'], [edges[0] + eps, 'epic'],
    [edges[1] - eps, 'epic'], [edges[1] + eps, 'rare'], [edges[2] - eps, 'rare'], [edges[2] + eps, 'common'], [0.999, 'common'],
  ];
  const { mudae, store, state, advance } = setup();
  for (const [r, rarity] of cases) {
    advance(ROLL_RESET_MS);
    assert.deepEqual(mudae.arm(store, 'a', 'amuleto'), { future: null, wish: false });
    state.next = [r];
    assert.equal(rarityOfCard(mudae.roll(store, 'a', 'm')), rarity, `random ${r}`);
  }
  // Sem o Amuleto, o mesmo random 0.05 cai no épico (o lendário vai só até 2/130).
  advance(ROLL_RESET_MS);
  state.next = [0.05];
  assert.equal(mudae.foresee(store, 'a').future[0], 'epic');
});

test('Amuleto depois da Vidência muda a previsão e devolve a nova', () => {
  const { mudae, store, state } = setup();
  state.next = [0.9, 0.9, 0.5];
  assert.deepEqual(mudae.foresee(store, 'a').future, ['common', 'common', 'rare']);
  state.next = [0.05]; // com o Amuleto, 0.05 é lendário
  assert.deepEqual(mudae.arm(store, 'a', 'amuleto'), { future: ['legendary', 'common', 'rare'], wish: false });
  assert.deepEqual(mudae.foresee(store, 'a').future, ['legendary', 'common', 'rare']);
  assert.throws(() => mudae.arm(store, 'a', 'amuleto'), /^Error: O poder Amuleto já está ativo para o próximo roll\.$/);
  assert.equal(rarityOfCard(mudae.roll(store, 'a', 'h')), 'legendary');

  // E na outra ordem: o Amuleto armado pesa no 1º item que a Vidência sortear.
  const other = setup();
  assert.deepEqual(other.mudae.arm(other.store, 'a', 'amuleto'), { future: null, wish: false });
  other.state.next = [0.05, 0.05, 0.05];
  assert.deepEqual(other.mudae.foresee(other.store, 'a').future, ['legendary', 'epic', 'epic']);
});

test('Amuleto depois da Vidência só melhora: fica com o mais raro dos dois', () => {
  // Épico previsto: o sorteio novo do Amuleto nunca derruba para raro ou comum.
  for (const [r, expected] of [[0.01, 'legendary'], [0.2, 'epic'], [0.5, 'epic'], [0.9, 'epic'], [0.999, 'epic']]) {
    const { mudae, store, state } = setup();
    state.next = [0.1, 0.9, 0.9];
    assert.deepEqual(mudae.foresee(store, 'a').future, ['epic', 'common', 'common']);
    state.next = [r];
    assert.deepEqual(mudae.arm(store, 'a', 'amuleto').future, [expected, 'common', 'common'], `épico com ${r}`);
  }
  // Comum previsto: pode melhorar.
  for (const [r, expected] of [[0.2, 'epic'], [0.5, 'rare'], [0.9, 'common']]) {
    const { mudae, store, state } = setup();
    state.next = [0.9, 0.9, 0.9];
    assert.deepEqual(mudae.foresee(store, 'a').future, ['common', 'common', 'common']);
    state.next = [r];
    assert.deepEqual(mudae.arm(store, 'a', 'amuleto').future, [expected, 'common', 'common'], `comum com ${r}`);
  }
});

test('Rubi com a Vidência: só vale um desejo da raridade prevista', () => {
  // Rubi IV (2%). Desejos: o 1 (lendário) e o 9 (épico), as duas mulheres de anime.
  const withRubi = () => {
    const s = setup();
    s.store.medals = { a: { rubi: { level: 4, finish: 'metal' } } };
    s.store.wishes = { a: [1, 9] };
    return s;
  };
  // Sem previsão, o Rubi pega qualquer desejo: o primeiro da fila é o lendário.
  let s = withRubi();
  s.state.next = [0.01, 0];
  assert.equal(s.mudae.roll(s.store, 'a', 'w').card.id, 1);
  // Com épico previsto, o lendário não serve: vem o 9.
  s = withRubi();
  s.state.next = [0.1, 0.9, 0.9];
  assert.equal(s.mudae.foresee(s.store, 'a').future[0], 'epic');
  s.state.next = [0.01, 0];
  assert.equal(s.mudae.roll(s.store, 'a', 'w').card.id, 9);
  // Com comum previsto, nenhum desejo serve: sai um comum, e a previsão se cumpre.
  s = withRubi();
  s.state.next = [0.9, 0.9, 0.9];
  s.mudae.foresee(s.store, 'a');
  s.state.next = [0.01, 0];
  const got = s.mudae.roll(s.store, 'a', 'w').card;
  assert.equal(got.rarity, 'common');
  assert.ok(![1, 9].includes(got.id));
});

test('Chamar desejo: 40% de chance; sem desejo, recusa sem gastar', () => {
  assert.equal(DESEJO_CHANCE, 0.4);
  const { mudae, store, state, advance } = setup();
  const clock = { t: 1000 };
  const poderes = createPoderes({ now: () => clock.t });
  const perks = { rechargeMs: POWER_RECHARGE_MS };
  poderes.refresh(store, 'a', { bronzeLevel: 2 });
  const use = () => poderes.use(store, 'a', 'desejo', perks, () => mudae.arm(store, 'a', 'desejo'));
  const readyIn = () => poderes.powersOf(store, 'a', {}, perks).readyIn.desejo;

  assert.throws(use, /^Error: Sua lista de desejos está vazia\.$/);
  assert.equal(readyIn(), 0, 'a carga continua');
  assert.equal(store.usage.a?.armed, undefined);

  // O desejo é a comum 119 (mulher de anime); o 3 tem dono e não conta.
  store.wishes = { a: [119, 3] };
  store.claims[3] = { ownerId: 'b', at: 1 };
  state.next = [DESEJO_CHANCE - 0.01];
  assert.deepEqual(use(), { future: null, wish: true });
  assert.equal(readyIn(), POWER_RECHARGE_MS);
  assert.deepEqual(store.usage.a.armed, { desejo: { hit: true } });
  assert.throws(() => mudae.arm(store, 'a', 'desejo'), /^Error: O poder Chamar desejo já está ativo para o próximo roll\.$/);
  state.next = [0.01]; // sem o desejo, 0.01 seria um lendário
  assert.equal(mudae.roll(store, 'a', 'm').card.id, 119);
  assert.equal(store.usage.a.armed, undefined);

  // Errou os 40%: a carga vai embora mesmo assim e o roll segue o sorteio por raridade.
  clock.t += POWER_RECHARGE_MS;
  advance(ROLL_RESET_MS);
  state.next = [DESEJO_CHANCE];
  assert.deepEqual(use(), { future: null, wish: false });
  assert.equal(readyIn(), POWER_RECHARGE_MS);
  state.next = [0.01];
  const missed = mudae.roll(store, 'a', 'm');
  assert.equal(missed.card.rarity, 'legendary');
});

test('Chamar desejo com Vidência: wish aparece na previsão e se cumpre', () => {
  const { mudae, store, state } = setup();
  store.wishes = { a: [119] }; // comum, mulher de anime
  state.next = [0.1, 0.1, 0.1];
  assert.deepEqual(mudae.foresee(store, 'a'), { future: ['epic', 'epic', 'epic'], wish: false });
  state.next = [0.2];
  assert.deepEqual(mudae.arm(store, 'a', 'desejo'), { future: ['epic', 'epic', 'epic'], wish: true });
  assert.deepEqual(mudae.foresee(store, 'a'), { future: ['epic', 'epic', 'epic'], wish: true });
  assert.equal(mudae.roll(store, 'a', 'w').card.id, 119, 'o desejo vem no lugar do épico');
  state.next = [0.1];
  assert.deepEqual(mudae.foresee(store, 'a'), { future: ['epic', 'epic', 'epic'], wish: false });

  // $h não tem o desejo (é mulher): sai a raridade prevista, e a previsão continua certa.
  state.next = [0.2];
  assert.equal(mudae.arm(store, 'a', 'desejo').wish, true);
  const got = mudae.roll(store, 'a', 'h');
  assert.equal(got.card.rarity, 'epic');
  assert.notEqual(got.card.id, 119);
  // O desejo não cabia nesse comando: ele continua ativo e vem no próximo roll em que couber.
  assert.deepEqual(store.usage.a.armed, { desejo: { hit: true } }, 'o desejo não é gasto à toa');
  assert.equal(mudae.roll(store, 'a', 'w').card.id, 119);
  assert.equal(store.usage.a.armed, undefined);
});

test('Escolha dupla: duas cartas diferentes num roll só', () => {
  const { mudae, store, state } = setup();
  store.claims[2] = { ownerId: 'b', at: 1 };
  assert.deepEqual(mudae.arm(store, 'a', 'dupla'), { future: null, wish: false });
  assert.throws(() => mudae.arm(store, 'a', 'dupla'), /^Error: O poder Escolha dupla já está ativo para o próximo roll\.$/);
  state.r = 0.5; // o mesmo random para tudo: a segunda carta não pode repetir a primeira
  const got = mudae.roll(store, 'a', 'w');
  assert.ok(got.second, 'veio a segunda carta');
  assert.notEqual(got.second.card.id, got.card.id);
  assert.ok(POOL.w.includes(got.card.id) && POOL.w.includes(got.second.card.id), 'as duas da lista do $w');
  assert.equal(got.second.ownerId, null);
  assert.equal(got.rollsLeft, 9, 'gasta um roll só');
  assert.equal(mudae.status(store, 'a').rollsLeft, 9);
  assert.equal(mudae.roll(store, 'a', 'w').second, undefined, 'só no roll seguinte ao uso');

  // A segunda carta mostra o dono, se tiver.
  const pair = setup();
  pair.store.claims[2] = { ownerId: 'b', at: 1 };
  pair.mudae.arm(pair.store, 'a', 'dupla');
  pair.state.next = [0.01, 0, 0.01, 0.99]; // a primeira: lendário, o 1º; a segunda: lendário, o 2º
  const both = pair.mudae.roll(pair.store, 'a', 'm');
  assert.deepEqual([both.card.id, both.second.card.id], [1, 2]);
  assert.equal(both.second.ownerId, 'b');
});

test('efeitos valem para um roll só e ficam guardados no store', () => {
  const { mudae, make, store, state } = setup();
  mudae.arm(store, 'a', 'amuleto');
  mudae.arm(store, 'a', 'dupla');
  state.next = [0.9, 0.9, 0.9];
  mudae.foresee(store, 'a');
  assert.deepEqual(store.usage.a.armed, { amuleto: true, dupla: true });
  assert.deepEqual(store.usage.a.future, ['common', 'common', 'common']);

  // Depois de um reinício (o store volta do disco), tudo continua lá.
  const saved = JSON.parse(JSON.stringify(store));
  const again = make();
  const got = again.roll(saved, 'a', 'm');
  assert.equal(got.card.rarity, 'common');
  assert.ok(got.second);
  assert.equal(saved.usage.a.armed, undefined);
  assert.deepEqual(saved.usage.a.future, ['common', 'common']);
  state.next = [0.01];
  const next = again.roll(saved, 'a', 'm');
  assert.equal(next.second, undefined);
  assert.equal(next.card.rarity, 'common', 'a previsão vale; o Amuleto já foi');
});

// ---------------- pelo socket ----------------
const wait = (ms = 70) => new Promise((r) => setTimeout(r, ms));
async function eventually(check, timeout = 2000) {
  const end = Date.now() + timeout;
  for (;;) {
    try { return check(); } catch (error) { if (Date.now() > end) throw error; }
    await wait(20);
  }
}

async function startServer(dir, clients) {
  const port = 40000 + Math.floor(Math.random() * 20000);
  const proc = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), DATA_FILE: path.join(dir, 'data.json'), UPLOAD_DIR: path.join(dir, 'uploads'), MUDAE_CATALOG: path.join(dir, 'catalogo.json') },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Server startup timeout')), 8000);
    proc.stdout.on('data', (data) => { if (String(data).includes('rodando')) { clearTimeout(timer); resolve(); } });
    proc.once('exit', (code) => { clearTimeout(timer); reject(new Error('Server exited: ' + code)); });
  });
  const stop = async () => {
    clients.splice(0).forEach((s) => s.disconnect());
    if (proc.exitCode !== null || proc.signalCode) return;
    const exit = new Promise((r) => proc.once('exit', r)); proc.kill(); await exit;
  };
  async function connect(name, mode = 'register') {
    const socket = io('http://127.0.0.1:' + port, { forceNew: true, transports: ['websocket'] }); clients.push(socket);
    socket.on('state', (s) => { socket.last = s; }); socket.on('state:patch', (p) => applyPatch(socket.last, p));
    socket.messages = [];
    socket.updates = [];
    socket.powers = [];
    socket.on('chat:message', (m) => socket.messages.push(m.msg));
    socket.on('chat:update', (m) => socket.updates.push(m.msg));
    socket.on('mudae:power', (p) => socket.powers.push(p));
    socket.call = (event, value = {}) => new Promise((r) => socket.timeout(3000).emit(event, value, (error, reply) => r(error ? { error: error.message } : reply)));
    socket.auth = await socket.call('auth', { mode, name, password: '1234', confirmPassword: '1234' });
    assert.ok(!socket.auth.error, socket.auth.error);
    await wait();
    return socket;
  }
  return { connect, stop };
}

test('Escolha dupla pelo socket: duas cartas, casar numa libera a outra', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'resenhex-efeitos-'));
  fs.writeFileSync(path.join(dir, 'catalogo.json'), JSON.stringify(ANIME.slice(0, 40)));
  const clients = [];
  let server = await startServer(dir, clients);
  t.after(async () => { await server.stop(); fs.rmSync(dir, { recursive: true, force: true }); });

  // Primeira rodada: só cria a conta da Ana. Com ela gravada, o servidor para e a Ana ganha a Escolha dupla e a Vidência
  // no palco, a Esmeralda (um casamento de reserva) e uma Escolha dupla já armada de antes (o efeito sobrevive ao reinício).
  const first = await server.connect('Ana');
  const anaId = first.auth.accountId;
  const dbFile = path.join(dir, 'data.db');
  const saved = () => { try { const r = readRoot(dbFile); return r.accounts[anaId] && Object.values(r.servers).some((x) => x.ownerId === anaId) ? r : null; } catch { return null; } };
  await eventually(() => assert.ok(saved()), 5000);
  await server.stop();
  const root = saved();
  const community = Object.values(root.servers).find((x) => x.ownerId === anaId);
  const seed = (community.mudae ||= { claims: {}, usage: {} });
  seed.powers = { [anaId]: { unlocked: ['videncia', 'dupla'], slots: ['dupla', 'videncia', null], readyAt: {} } };
  seed.medals = { [anaId]: { esmeralda: { level: 1, finish: 'metal' } } };
  seed.usage = { ...seed.usage, [anaId]: { armed: { dupla: true } } };
  writeRoot(dbFile, root);

  server = await startServer(dir, clients);
  const ana = await server.connect('Ana', 'login');
  const invite = await ana.call('server:invite');
  const beto = await server.connect('Beto');
  const caio = await server.connect('Caio');
  for (const s of [beto, caio]) assert.ok(!(await s.call('server:join', { code: invite.code })).error);
  const created = await ana.call('channel', { action: 'create', type: 'mudae', name: 'Salão Mudae' });
  assert.ok(!created.error, created.error);
  await eventually(() => assert.ok(beto.last.channels.find((c) => c.id === created.id) && caio.last.channels.find((c) => c.id === created.id)));
  for (const s of [ana, beto, caio]) assert.ok((await s.call('mudae:presence', { channel: created.id })).ok);
  const lines = (s) => s.messages.filter((m) => m.mudae?.kind === 'power');
  const rollsOf = (s) => s.messages.filter((m) => m.mudae?.kind === 'roll');
  // O palco lê do servidor o que está ativo para o próximo roll e quantos desejos a pessoa tem (vale depois de recarregar).
  const view = await ana.call('mudae:powers:get');
  assert.deepEqual([view.armed, view.wishes], [['dupla'], 0]);
  const equipped = await ana.call('mudae:powers:equip', { slot: 2, power: null });
  assert.deepEqual([equipped.armed, equipped.wishes], [['dupla'], 0]);
  assert.deepEqual((await beto.call('mudae:powers:get')).armed, [], 'cada um vê só o seu');

  // A dupla armada de antes: um $h (homens, para não cruzar com o $w de depois) abre duas cartas. Passados os 3 s da Ana,
  // o Caio casa com uma, e a outra não muda: só quem rodou libera a outra carta.
  assert.ok(!(await ana.call('chat:send', { channel: created.id, text: '$h' })).error);
  const [p1, p2] = await eventually(() => { const r = rollsOf(beto); assert.equal(r.length, 2); return r; });
  assert.equal(p1.mudae.pair, p2.mudae.pair);
  await wait(Math.max(p1.mudae.priorityUntil, p2.mudae.priorityUntil) - Date.now() + 80);
  assert.ok(!(await caio.call('mudae:claim', { channel: created.id, id: p1.id })).error);
  await eventually(() => assert.ok(beto.updates.some((x) => x.id === p1.id)));
  await wait(150);
  assert.ok(!beto.updates.some((x) => x.id === p2.id), 'a outra carta não recebeu nada');
  const untouched = (await beto.call('chat:history', { channel: created.id })).messages.find((m) => m.id === p2.id);
  assert.equal(untouched.mudae.pairFree, undefined);
  assert.equal(untouched.mudae.priorityUntil, p2.mudae.priorityUntil);
  assert.equal(untouched.mudae.ownerId, null);
  assert.deepEqual((await ana.call('mudae:powers:get')).armed, [], 'o roll gastou a dupla');

  // Vidência: só a Ana vê, sem aviso e sem linha.
  const seen = await ana.call('mudae:power:use', { channel: created.id, power: 'videncia' });
  assert.ok(!seen.error, seen.error);
  assert.equal(seen.future.length, 3);
  assert.equal(seen.wish, false);
  assert.match((await ana.call('mudae:power:use', { channel: created.id, power: 'videncia' })).error, /Vidência recarrega/);
  assert.match((await ana.call('mudae:power:use', { channel: created.id, power: 'amuleto' })).error, /não está no seu palco/);

  // Escolha dupla: todo mundo no Salão vê, e fica uma linha no chat.
  const armed = await ana.call('mudae:power:use', { channel: created.id, power: 'dupla' });
  assert.ok(!armed.error, armed.error);
  assert.deepEqual(armed, { armed: 'dupla', future: seen.future, wish: false });
  assert.deepEqual((await ana.call('mudae:powers:get')).armed, ['dupla']);
  const aviso = await eventually(() => { assert.equal(beto.powers.length, 1); return beto.powers[0]; });
  assert.deepEqual(aviso, { channel: created.id, by: anaId, power: 'dupla' });
  const line = await eventually(() => { assert.equal(lines(beto).length, 1); return lines(beto)[0]; });
  assert.equal(line.mudae.ownerId, anaId);
  assert.equal(line.mudae.power, 'dupla');

  // Um $w, duas cartas com o mesmo par, as duas com a prioridade da Ana.
  assert.ok(!(await ana.call('chat:send', { channel: created.id, text: '$w' })).error);
  const rolls = await eventually(() => { const r = rollsOf(beto); assert.equal(r.length, 4); return r.slice(2); });
  const [a, b] = rolls;
  assert.notEqual(a.mudae.pair, p1.mudae.pair);
  assert.ok(a.mudae.pair);
  assert.equal(a.mudae.pair, b.mudae.pair);
  assert.notEqual(a.mudae.card.id, b.mudae.card.id);
  assert.equal(a.mudae.card.rarity, seen.future[0], 'a primeira carta cumpre a Vidência');
  for (const m of rolls) {
    assert.equal(m.by, anaId);
    assert.equal(m.mudae.priorityUntil - m.mudae.revealAt, 3000);
  }
  assert.equal(beto.powers.length, 1, 'a Vidência não avisou ninguém');
  assert.equal(lines(beto).length, 1);

  await wait(Math.max(a.mudae.revealAt, b.mudae.revealAt) - Date.now() + 80);
  assert.match((await beto.call('mudae:claim', { channel: created.id, id: b.id })).error, /prioridade/);
  assert.ok(!(await ana.call('mudae:claim', { channel: created.id, id: a.id })).error);
  const freed = await eventually(() => { const m = beto.updates.find((x) => x.id === b.id); assert.ok(m); return m; });
  assert.equal(freed.mudae.pairFree, true);
  assert.ok(freed.mudae.priorityUntil <= Date.now());
  assert.ok(freed.mudae.priorityUntil >= b.mudae.revealAt, 'livre só depois de abrir');
  assert.ok(Date.now() < b.mudae.priorityUntil, 'ainda dentro dos 3 s da Ana');
  // A Ana tem a reserva da Esmeralda, mas já ficou com uma carta do par: a outra é dos outros, e a reserva não é gasta.
  assert.equal((await ana.call('mudae:status')).reserveReady, true);
  assert.equal((await ana.call('mudae:claim', { channel: created.id, id: b.id })).error, 'Você já ficou com uma das cartas da Escolha dupla.');
  assert.equal((await ana.call('mudae:status')).reserveReady, true);
  assert.ok(!(await beto.call('mudae:claim', { channel: created.id, id: b.id })).error);
  const married = await eventually(() => { const m = ana.messages.filter((x) => x.mudae?.kind === 'married'); assert.equal(m.length, 3); return m; });
  assert.deepEqual(married.map((m) => m.mudae.ownerId), [caio.auth.accountId, anaId, beto.auth.accountId]);
});
