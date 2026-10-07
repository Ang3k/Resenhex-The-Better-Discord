const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const os = require('os');
const { hourlyPacer } = require('../tools/mudae-fontes/limite');

test('cota horária impede a 201ª consulta até uma tentativa anterior expirar', async () => {
  let clock = 1_000_000;
  const snapshots = [];
  const file = path.join(os.tmpdir(), 'mudae-quota-test-' + process.pid + '-' + Date.now() + '.json');
  const pace = hourlyPacer(file, [], { reserve: 0, gapMs: 0, now: () => clock, sleep: async (ms) => { clock += ms; },
    save: (target, value) => snapshots.push([...value.timestamps]) });
  for (let i = 0; i < 200; i++) await pace();
  assert.equal(clock, 1_000_000);
  await pace();
  assert.ok(clock >= 4_600_000);
  assert.equal(snapshots[199].length, 200);
  assert.equal(snapshots[200].length, 1);
});
