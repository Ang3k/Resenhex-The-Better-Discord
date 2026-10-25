const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHealth, countRelayPorts } = require('../server/health');

// Duas portas dentro da faixa do coturn (49152 = C000, 65535 = FFFF) e duas fora (3478 = 0D96, 53 = 0035).
const UDP = `  sl  local_address rem_address   st tx_queue rx_queue tr tm->when retrnsmt   uid  timeout inode ref pointer drops
  1: 00000000:0D96 00000000:0000 07 00000000:00000000 00:00000000 00000000   112        0 1 2 0
  2: C800000A:C000 00000000:0000 07 00000000:00000000 00:00000000 00000000   112        0 2 2 0
  3: C800000A:FFFF 00000000:0000 07 00000000:00000000 00:00000000 00000000   112        0 3 2 0
  4: 3500007F:0035 00000000:0000 07 00000000:00000000 00:00000000 00000000   101        0 4 2 0
`;

test('relay ports count only the UDP sockets inside the coturn range', () => {
  assert.equal(countRelayPorts(UDP), 2);
  assert.equal(countRelayPorts(''), 0);
});

test('each sample turns the counters into per-second rates and keeps the slowest save', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'resenhex-saude-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, 'udp'), UDP);
  const lines = [];
  const health = createHealth({ connections: () => 3, online: () => 2, log: (line) => lines.push(line), every: 100, udpTable: path.join(dir, 'udp') });
  for (let i = 0; i < 5; i++) health.count('changes');
  health.count('bytes', 2048);
  health.saved(4); health.saved(12.34);
  await new Promise((r) => setTimeout(r, 160));
  const { history, targets, turnRange } = health.view();
  const [first] = history;
  assert.equal(history.length, 1);
  assert.ok(first.changes > 30 && first.changes <= 55, `changes/s: ${first.changes}`);
  assert.ok(first.sentKBps > 12 && first.sentKBps <= 22, `KB/s: ${first.sentKBps}`);
  assert.equal(first.saves, 2);
  assert.equal(first.saveMaxMs, 12.3);
  assert.equal(first.connections, 3);
  assert.equal(first.online, 2);
  assert.equal(first.turnPorts, 2);
  assert.ok(first.heapPct > 0 && first.heapPct < 100, `heap: ${first.heapPct}%`);
  assert.equal(targets.heapPct, 70);
  assert.ok(first.loopP99 >= 0 && first.loopP99 < first.loopMax + 1);
  assert.equal(targets.loopP99, 50);
  assert.equal(turnRange.min, 49152);
  // O minuto seguinte começa do zero; o log ganha uma linha a cada 6 amostras.
  await new Promise((r) => setTimeout(r, 560));
  const later = health.view().history;
  assert.ok(later.length >= 6);
  assert.equal(later.at(-1).changes, 0);
  assert.equal(later.at(-1).saveMaxMs, null);
  assert.match(lines[0], /^\[saúde\] atraso p99 .* portas do retransmissor 2$/);
});
