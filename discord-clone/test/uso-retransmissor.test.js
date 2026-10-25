const test = require('node:test');
const assert = require('node:assert/strict');
const { summarize, report } = require('../tools/uso-retransmissor');

// Linhas do journal (journalctl -o short-iso) no formato do coturn 4.6.1, medido com o coturn de verdade.
const LOG = `2026-10-25T03:00:01+00:00 resenhex turnserver[812]: 13: : session 015000000000000001: usage: realm=<resenhex.com.br>, username=<1792994400:ana>, rp=308, rb=302144, sp=308, sb=301904
2026-10-25T03:00:01+00:00 resenhex turnserver[812]: 13: : session 015000000000000001: peer usage: realm=<resenhex.com.br>, username=<1792994400:ana>, rp=300, rb=300000, sp=300, sb=300000
2026-10-25T03:00:02+00:00 resenhex turnserver[812]: 14: : session 015000000000000001: usage: realm=<resenhex.com.br>, username=<1792994400:ana>, rp=10, rb=1000, sp=10, sb=2000000000
2026-10-25T09:10:00+00:00 resenhex turnserver[812]: 9000: : session 009000000000000002: usage: realm=<resenhex.com.br>, username=<1792994400:beto>, rp=1, rb=500, sp=1, sb=1000000000
2026-10-25T09:10:00+00:00 resenhex turnserver[812]: 9000: : session 009000000000000002: closed (2nd stage), user <1792994400:beto> realm <resenhex.com.br>
2026-10-26T00:00:05+00:00 resenhex turnserver[812]: 75000: : session 012000000000000003: usage: realm=<resenhex.com.br>, username=<1793016000:ana>, rp=1, rb=1, sp=1, sb=500000000
`;

test('relay usage adds up what coturn sent per day, per session and per account', () => {
  const { days, top } = summarize(LOG);
  assert.equal(days.length, 2);
  assert.equal(days[0].date, '2026-10-25');
  assert.equal(Math.round(days[0].sentGB * 1e6), Math.round((301904 + 300000 + 2e9 + 1e9) / 1e3));
  assert.equal(days[0].sessions, 2);
  assert.equal(days[0].accounts, 2);
  assert.deepEqual([days[1].sessions, days[1].sentGB], [1, 0.5]);
  assert.equal(top[0].account, 'ana', 'a mesma conta com senhas de dias diferentes soma junto');
  assert.ok(top[0].sentGB > 2.5);
  const text = report({ days, top });
  assert.match(text, /2026-10-25 {2}enviou 3 GB · recebeu 0 GB · 2 sessões · 2 contas/);
  assert.match(text, /num mês de 30 dias, ~52,51 GB/);
  assert.match(report(summarize('nada aqui')), /verbose/);
});
