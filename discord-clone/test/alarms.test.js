const test = require('node:test');
const assert = require('node:assert/strict');
const { createAlarms, COOLDOWN_MS } = require('../server/alarms');
const { TARGETS } = require('../server/health');

const calm = { loopP99: 3, heapPct: 10, rssMb: 300, diskPct: 40, diskFreeGB: 28, monthGB: 900, monthPaceGB: 2000, relay: 'on', turnPorts: 120 };

function harness({ to = () => 'dono@exemplo.com' } = {}) {
  const sent = [], lines = [];
  let clock = Date.UTC(2026, 9, 25, 12);
  const history = [];
  const alarms = createAlarms({ to, send: async (message) => { sent.push(message); }, log: (line) => lines.push(line), now: () => clock });
  const push = async (point, times = 1) => {
    for (let i = 0; i < times; i++) { history.push({ ...calm, ...point }); alarms.check({ history, targets: TARGETS }); clock += 10_000; }
    await new Promise((r) => setImmediate(r));
  };
  return { sent, lines, alarms, push, later: (ms) => { clock += ms; } };
}

test('a slow server for 5 minutes sends one e-mail, and another when it is back to normal', async () => {
  const h = harness();
  await h.push({}, 30);
  await h.push({ loopP99: 180 }, 23);
  assert.equal(h.sent.length, 0, 'ainda não são 80% de 5 minutos');
  await h.push({ loopP99: 180 }, 1);
  assert.equal(h.sent.length, 1);
  assert.equal(h.sent[0].to, 'dono@exemplo.com');
  assert.equal(h.sent[0].subject, '[Resenhex] Alarme: servidor lento');
  assert.match(h.sent[0].text, /agora está em 180 ms/);
  assert.deepEqual(h.alarms.active(), ['loop']);
  // Uma amostra boa no meio não desliga.
  await h.push({}, 3);
  assert.deepEqual(h.alarms.active(), ['loop']);
  await h.push({}, 30);
  assert.deepEqual(h.alarms.active(), []);
  assert.equal(h.sent.length, 2);
  assert.equal(h.sent[1].subject, '[Resenhex] Resolvido: servidor lento');
  assert.ok(h.lines.some((line) => /\[alarme\] servidor lento: voltou ao normal/.test(line)));
});

test('a problem that comes back within 6 hours is logged but not mailed again', async () => {
  const h = harness();
  await h.push({ diskPct: 85, diskFreeGB: 7 }, 6);
  assert.equal(h.sent.length, 1);
  assert.match(h.sent[0].text, /85% cheio \(7 GB livres\)/);
  await h.push({}, 6);
  assert.equal(h.sent.length, 2, 'resolvido');
  await h.push({ diskPct: 86 }, 6);
  assert.equal(h.sent.length, 2, 'voltou em menos de 6 h: só no log');
  assert.equal(h.lines.filter((line) => /disco quase cheio: O disco/.test(line)).length, 2);
  await h.push({}, 6);
  assert.equal(h.sent.length, 2, 'sem o e-mail do problema, sem o de resolvido');
  h.later(COOLDOWN_MS);
  await h.push({ diskPct: 90 }, 6);
  assert.equal(h.sent.length, 3);
});

test('memory, the network pace and relay ports have their own alarms; without an address it only logs', async () => {
  const h = harness();
  await h.push({ heapPct: 75, relay: 'paused', monthGB: 3100, turnPorts: TARGETS.turnPorts + 1 }, 6);
  assert.deepEqual(h.sent.map((m) => m.subject).sort(), ['[Resenhex] Alarme: memória alta', '[Resenhex] Alarme: portas do retransmissor', '[Resenhex] Alarme: rede do mês acima do ritmo']);
  assert.match(h.sent.find((m) => /ritmo/.test(m.subject)).text, /não recebe gente nova/);
  // Medida que o servidor não tem (portas e rede no Windows): nunca liga.
  const quiet = harness({ to: () => null });
  await quiet.push({ turnPorts: null, relay: null, diskPct: null }, 30);
  assert.deepEqual(quiet.alarms.active(), []);
  await quiet.push({ heapPct: 99 }, 6);
  assert.equal(quiet.sent.length, 0);
  assert.ok(quiet.lines.some((line) => /sem e-mail para avisar/.test(line)));
});

test('near the final network cut the owner is warned; the cut mails at once, and again when the site is back', async () => {
  const h = harness();
  await h.push({ monthGB: TARGETS.monthCutGB - 400, relay: 'stopped' }, 6);
  assert.ok(h.sent.some((m) => m.subject === '[Resenhex] Alarme: rede do mês perto do corte final'));
  await h.push({ monthGB: TARGETS.monthCutGB, relay: 'stopped', cut: true });
  assert.match(h.sent.find((m) => m.subject === '[Resenhex] Alarme: site fora do ar pelo teto de rede').text, /fora do ar até o mês virar/);
  await h.push({ monthGB: 1, relay: 'on', cut: false });
  assert.ok(h.sent.some((m) => m.subject === '[Resenhex] Resolvido: site fora do ar pelo teto de rede'));
});
