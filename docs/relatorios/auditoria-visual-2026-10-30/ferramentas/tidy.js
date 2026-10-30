const path = require('path'); const fs = require('fs');
const APP = '/home/user/Resenhex-The-Better-Discord/discord-clone';
const { io } = require(path.join(APP, 'node_modules/socket.io-client'));
const SP = '/tmp/claude-0/-home-user-Resenhex-The-Better-Discord/42cdefbc-e31e-54b4-9e95-db8465c8646a/scratchpad';
const seed = JSON.parse(fs.readFileSync(process.argv[2] || SP + '/seed-out.json'));
const call = (s, ev, p) => new Promise((res, rej) => s.emit(ev, p, (r) => (r && r.error ? rej(new Error(ev + ': ' + r.error)) : res(r))));
(async () => {
  const s = io(seed.base, { transports: ['websocket'] }); let state;
  s.on('state', (st) => { state = st; });
  await new Promise((r) => s.on('connect', r));
  await call(s, 'auth', { token: seed.accounts.ana.token, version: '2.2.0', patches: 1 });
  for (let i = 0; i < 50 && !state; i++) await new Promise((r) => setTimeout(r, 100));
  const cats = state.categories; console.log(cats.map((c) => c.id + ':' + c.name).join(', '));
  const byName = (n) => cats.find((c) => c.name.toLowerCase() === n);
  const txt = byName('canais de texto'), voz = byName('canais de voz'), papo = byName('papo'), calls = byName('calls');
  for (const ch of state.channels) {
    if (ch.type === 'text') await call(s, 'channel', { action: 'update', id: ch.id, categoryId: txt.id });
    else await call(s, 'channel', { action: 'update', id: ch.id, categoryId: voz.id });
  }
  await call(s, 'category', { action: 'delete', id: papo.id });
  await call(s, 'category', { action: 'delete', id: calls.id });
  console.log('ok'); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
