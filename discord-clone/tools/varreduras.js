// Mede as varreduras que crescem com o tamanho do site (contas, amizades, conversas, servidores), sem subir o servidor.
// Monta em memória um banco do tamanho pedido, usa o server/communities.js de verdade e repete os laços do server.js
// (socialFor, sharedState, notifyAccount, communities.list e o agendamento dos castigos ao ligar).
//   ACCOUNTS=50000 SERVERS=10000 node tools/varreduras.js
// O servidor ARM é ~1,7× mais lento que o PC. Mais em docs/planos/PLANO-5000-ONLINE-2026-10-24.md (problemas 2 e 3, Fase 4a).
const crypto = require('node:crypto');
const { communityStore } = require('../server/communities');

const ACCOUNTS = Number(process.env.ACCOUNTS || 50000);
const SERVERS = Number(process.env.SERVERS || 10000);
const hex = () => crypto.randomBytes(8).toString('hex');
const root = { accounts: {}, sessions: {}, servers: {}, friendships: {}, dms: {}, blocks: {}, messages: {} };
const ids = [];
for (let i = 0; i < ACCOUNTS; i++) { const id = hex(); ids.push(id); root.accounts[id] = { id, name: 'p' + i, color: '#5865f2', createdAt: Date.now() }; }
const roles = [{ id: 'everyone', name: '@everyone', perms: ['VIEW', 'SEND', 'CONNECT', 'SPEAK'] }];
const sids = [];
for (let i = 0; i < SERVERS; i++) {
  const id = hex(); sids.push(id);
  const members = {};
  const n = i % 50 === 0 ? 300 : 5 + (i % 30); // a maioria pequena, alguns grandes
  for (let k = 0; k < n; k++) members[ids[(i * 7 + k * 13) % ACCOUNTS]] = { active: true, roles: [], joinedAt: 1 };
  root.servers[id] = { id, ownerId: ids[i % ACCOUNTS], serverName: 's' + i, roles: structuredClone(roles), channels: [{ id: hex(), name: 'geral', type: 'text' }], categories: [], members, inviteCode: 'x', soundboard: [], emojis: [], soundboardMigrated: true, musicMigrated: true, mudaeMigrated: true };
}
root.defaultServerId = sids[0];
for (let i = 0; i < ACCOUNTS * 2.5; i++) { const a = ids[i % ACCOUNTS], b = ids[(i * 31 + 7) % ACCOUNTS]; if (a !== b) root.friendships[[a, b].sort().join('-')] = { status: 'friends', from: a, ts: 1 }; }
for (let i = 0; i < ACCOUNTS * 1.5; i++) { const a = ids[i % ACCOUNTS], b = ids[(i * 17 + 3) % ACCOUNTS]; if (a !== b) { const k = 'dm-' + [a, b].sort().join('-'); root.dms[k] = { id: k, users: [a, b], closed: {} }; } }
const c = communityStore(root, hex, () => ({}));
const db = c.db;

const time = (label, fn, reps = 5) => {
  fn();
  const t0 = performance.now();
  for (let r = 0; r < reps; r++) fn();
  const ms = (performance.now() - t0) / reps;
  console.log(`${label.padEnd(58)} ${ms.toFixed(2).padStart(9)} ms`);
  return ms;
};
console.log(`${ACCOUNTS} contas, ${SERVERS} servidores, ${Object.keys(root.friendships).length} amizades, ${Object.keys(root.dms).length} conversas`);
const me = ids[123];
time('sharedState: Object.values(db.accounts) + membership', () => c.run(sids[5], () => Object.values(db.accounts).filter((a) => c.membership(a.id)).length));
time('socialFor: varre amizades + conversas', () => {
  let n = 0;
  for (const [key] of Object.entries(root.friendships)) { const [a, b] = key.split('-'); if (a === me || b === me) n++; }
  return Object.values(root.dms).filter((dm) => dm.users.includes(me)).length + n;
});
time('notifyAccount: amizades + conversas + bloqueios + servidores', () => {
  const s = new Set();
  for (const key of Object.keys(root.friendships)) { const [a, b] = key.split('-'); if (a === me) s.add(b); else if (b === me) s.add(a); }
  for (const dm of Object.values(root.dms)) if (dm.users.includes(me)) dm.users.forEach((id) => s.add(id));
  return Object.values(root.servers).filter((sv) => sv.members[me]).length;
});
time('communities.list (servidores da conta)', () => c.list(me).length);
const one = time('início: 1 servidor × todas as contas (scheduleTimeoutEnd)', () => c.run(sids[1], () => Object.values(db.accounts).forEach((a) => a.timeoutUntil)), 2);
console.log(`  → início inteiro (${SERVERS} servidores): ~${(one * SERVERS / 1000).toFixed(0)} s no PC (×1,7 no ARM)`);
