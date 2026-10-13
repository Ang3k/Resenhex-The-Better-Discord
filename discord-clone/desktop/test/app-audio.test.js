const test = require('node:test');
const assert = require('node:assert/strict');
const { AppAudioPlans, selectedAudioApps } = require('../lib/app-audio');

test('audio selections admit only known applications, deduplicate and never fall back to system audio', () => {
  const apps = [{ pid: 20 }, { pid: 30 }, { pid: 40 }];
  assert.deepEqual(selectedAudioApps({ apps: [20, 30, 20, 40] }, apps), [20, 30, 40]);
  assert.deepEqual(selectedAudioApps({ app: 20 }, apps), [20]);
  assert.deepEqual(selectedAudioApps({}, apps), []);
  for (const choice of [{ apps: [] }, { apps: [20, 99] }, { app: '20' }, { apps: [-1] }]) assert.throws(() => selectedAudioApps(choice, apps));
});

test('extra audio grants are bound to the confirmed source/frame, expire and cannot be replayed', () => {
  let time = 100;
  const plans = new AppAudioPlans({ now: () => time, ttl: 100 });
  const owner = {}, frame = {}, other = {};
  const source = { id: 'window:7:0', name: 'Jogo' };
  const token = plans.create(owner, frame, source, [20, 30, 40]);
  assert.throws(() => plans.prepare(other, frame, token, 30));
  assert.throws(() => plans.prepare(owner, other, token, 30));
  assert.throws(() => plans.prepare(owner, frame, token, 99));
  plans.prepare(owner, frame, token, 30);
  assert.throws(() => plans.consume(owner, other));
  assert.deepEqual(plans.consume(owner, frame), { source, pid: 30 });
  assert.equal(plans.consume(owner, frame), null);
  assert.throws(() => plans.prepare(owner, frame, token, 30));
  plans.prepare(owner, frame, token, 40);
  assert.equal(plans.consume(owner, frame).pid, 40);
  assert.throws(() => plans.prepare(owner, frame, token, 40));
  const expired = plans.create(owner, frame, source, [20, 30]);
  time = 201;
  assert.throws(() => plans.prepare(owner, frame, expired, 30), /expirou/);
  const discarded = plans.create(owner, frame, source, [20, 30]);
  plans.clear(owner);
  assert.throws(() => plans.prepare(owner, frame, discarded, 30));
});
