const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { openStore, readRoot } = require('../server/store');

function temp(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'resenhex-banco-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return path.join(dir, 'data.db');
}
const sample = () => ({
  defaultServerId: 's2', schemaVersion: 2, linkSecret: 'x',
  // Fora da ordem alfabética de propósito: a lista de servidores segue a ordem de criação.
  servers: { s2: { id: 's2', serverName: 'segundo', members: { a: { active: true, roles: [] } } }, s1: { id: 's1', serverName: 'primeiro', members: {} } },
  accounts: { b: { id: 'b', name: 'Beto' }, a: { id: 'a', name: 'Ana', lastRead: {} } },
  sessions: { t1: 'a' }, friendships: {}, blocks: {}, dms: {}, uploads: {}, clips: {}, mailTokens: {},
  messages: { geral: [{ id: 'm2', text: 'oi', ts: 2 }, { id: 'm1', text: 'tchau', ts: 3 }], vazio: [] },
});

test('a new database takes everything at once and reads it back in the same order', (t) => {
  const file = temp(t);
  const store = openStore(file);
  assert.equal(store.saved, false);
  const root = sample();
  store.attach(root);
  store.importAll();
  store.close();
  const back = openStore(file);
  assert.equal(back.saved, true);
  const loaded = back.load();
  assert.deepEqual(Object.keys(loaded.servers), ['s2', 's1']);
  assert.deepEqual(Object.keys(loaded.accounts), ['b', 'a']);
  assert.deepEqual(loaded.messages.geral.map((m) => m.id), ['m2', 'm1']);
  assert.equal(loaded.linkSecret, 'x');
  assert.deepEqual(loaded.sessions, { t1: 'a' });
  back.attach(loaded);
  assert.equal(back.checkAll(), 0); // nada mudou desde a leitura
  back.close();
});

test('only marked pieces are written; the slow check catches what was left unmarked', (t) => {
  const file = temp(t);
  const logged = [];
  const store = openStore(file, { log: (line) => logged.push(line) });
  const root = sample();
  store.attach(root);
  store.importAll();

  root.accounts.a.lastRead.geral = 5;
  root.messages.geral.push({ id: 'm3', text: 'nova', ts: 4 });
  root.messages.geral.find((m) => m.id === 'm2').text = 'editada';
  root.sessions.t2 = 'b';
  delete root.sessions.t1;
  store.mark('accounts/a');
  store.mark('messages/geral/m3');
  store.mark('messages/geral/m2');
  store.mark('sessions/t2');
  store.mark('sessions/t1');
  assert.equal(store.pending(), 4);
  // Esquecida: ninguém marcou o servidor.
  root.servers.s1.serverName = 'renomeado';
  assert.ok(store.flush() >= 0);
  assert.equal(store.pending(), 0);

  let saved = readRoot(file);
  assert.equal(saved.accounts.a.lastRead.geral, 5);
  assert.deepEqual(saved.messages.geral.map((m) => [m.id, m.text]), [['m2', 'editada'], ['m1', 'tchau'], ['m3', 'nova']]);
  assert.deepEqual(saved.sessions, { t2: 'b' });
  assert.equal(saved.servers.s1.serverName, 'primeiro');

  assert.deepEqual(store.sweep(1000), ['servers/s1']);
  assert.match(logged[0], /faltou marcar: servers\/s1/);
  saved = readRoot(file);
  assert.equal(saved.servers.s1.serverName, 'renomeado');
  store.close();
});

test('deleted messages, channels and servers leave the database', (t) => {
  const file = temp(t);
  const store = openStore(file);
  const root = sample();
  store.attach(root);
  store.importAll();
  const list = root.messages.geral;
  list.splice(list.findIndex((m) => m.id === 'm1'), 1);
  store.mark('messages/geral/m1');
  delete root.servers.s1;
  store.mark('servers/s1');
  store.flush();
  let saved = readRoot(file);
  assert.deepEqual(saved.messages.geral.map((m) => m.id), ['m2']);
  assert.deepEqual(Object.keys(saved.servers), ['s2']);

  delete root.messages.geral;
  store.mark('messages/geral');
  store.flush();
  saved = readRoot(file);
  assert.equal(saved.messages.geral, undefined);
  store.close();
});

test('changes made while starting up are written once the startup check runs', (t) => {
  const file = temp(t);
  const first = openStore(file);
  first.attach(sample());
  first.importAll();
  first.close();
  const store = openStore(file);
  const root = store.load();
  store.attach(root);
  // Migrações do início mexem nos dados sem marcar.
  root.servers.s2.mudae = { claims: {}, usage: {} };
  root.siteOwnerId = 'a';
  // A conferência do início só olha o root e os servidores; o resto fica para a conferência lenta.
  delete root.accounts.b;
  assert.equal(store.checkAll(), 2);
  let saved = readRoot(file);
  assert.deepEqual(saved.servers.s2.mudae, { claims: {}, usage: {} });
  assert.equal(saved.siteOwnerId, 'a');
  assert.deepEqual(Object.keys(saved.accounts), ['b', 'a']);
  assert.deepEqual(store.sweep(1000), ['accounts/b']);
  saved = readRoot(file);
  assert.deepEqual(Object.keys(saved.accounts), ['a']);
  store.close();
});

test('the test mode lists pieces that changed without a mark', (t) => {
  const file = temp(t);
  const store = openStore(file, { verify: path.join(path.dirname(file), 'sem-marca.txt') });
  const root = sample();
  store.attach(root);
  store.importAll();
  assert.deepEqual(store.verify(), []);
  root.accounts.b.color = '#123456';
  root.messages.geral[0].reactions = { '👍': ['a'] };
  assert.deepEqual(store.verify().sort(), ['accounts/b', 'messages/geral']);
  store.mark('accounts/b');
  assert.deepEqual(store.verify(), ['messages/geral']);
  store.close();
});

test('a backup is a consistent copy that opens as a database', (t) => {
  const file = temp(t);
  const store = openStore(file);
  store.attach(sample());
  store.importAll();
  const copy = path.join(path.dirname(file), "cópia d'agora.db");
  store.backup(copy);
  store.close();
  assert.deepEqual(Object.keys(readRoot(copy).accounts), ['b', 'a']);
});

test('checkpoints run in a worker thread, and closing leaves no -wal behind', async (t) => {
  const file = temp(t);
  const logged = [];
  const store = openStore(file, { checkpointMs: 20, log: (line) => logged.push(line) });
  const root = sample();
  root.accounts.c = { id: 'c', name: 'Caio', bio: 'x'.repeat(200_000) };
  store.attach(root);
  store.importAll();
  const before = fs.statSync(file).size;
  // A conexão principal não faz checkpoint: o que foi gravado só chega ao arquivo do banco pela worker.
  for (let i = 0; i < 100 && fs.statSync(file).size === before; i++) await new Promise((r) => setTimeout(r, 20));
  assert.ok(fs.statSync(file).size > before + 200_000);
  root.accounts.c.bio = 'curta';
  store.mark('accounts/c');
  store.flush();
  store.close();
  assert.equal(fs.existsSync(file + '-wal'), false);
  assert.equal(readRoot(file).accounts.c.bio, 'curta');
  assert.deepEqual(logged, []);
});

test('the startup check skips messages; the slow check writes what changed in them', (t) => {
  const file = temp(t);
  const first = openStore(file);
  first.attach(sample());
  first.importAll();
  first.close();
  const logged = [];
  const store = openStore(file, { log: (line) => logged.push(line) });
  const root = store.load();
  store.attach(root);
  root.messages.geral[0].text = 'mudou no início';
  assert.equal(store.checkAll(), 0);
  assert.equal(readRoot(file).messages.geral[0].text, 'oi');
  // Enquanto as mensagens antigas não chegaram todas, a conferência lenta não olha mensagens.
  assert.deepEqual(store.sweep(1000), []);
  assert.equal(store.loadMessages(), true);
  assert.deepEqual(store.sweep(1000), ['messages/geral']);
  assert.equal(readRoot(file).messages.geral[0].text, 'mudou no início');
  assert.match(logged[0], /faltou marcar: messages\/geral/);
  store.close();
});

test('old messages arrive bit by bit; a channel asked for earlier is read on the spot and never overwritten', (t) => {
  const file = temp(t);
  const first = openStore(file);
  const data = sample();
  for (let i = 0; i < 250; i++) data.messages['canal' + String(i).padStart(3, '0')] = [{ id: 'x' + i, text: 'antiga ' + i, ts: i }];
  first.attach(data);
  first.importAll();
  first.close();

  const store = openStore(file);
  const root = store.load();
  store.attach(root);
  assert.equal(store.checkAll(), 0);
  // Pedido antes de carregar: vem do banco na hora, e o que mudar nele não é desfeito pela carga.
  assert.deepEqual(root.messages.geral.map((m) => m.id), ['m2', 'm1']);
  root.messages.geral.push({ id: 'm3', text: 'nova', ts: 4 });
  store.mark('messages/geral/m3');
  // Apagado antes de carregar: não volta.
  delete root.messages.canal200;
  store.mark('messages/canal200');
  // Criado antes de carregar.
  root.messages.novo = [{ id: 'n1', text: 'primeira', ts: 5 }];
  store.mark('messages/novo/n1');
  assert.equal('canal100' in root.messages, true);
  assert.equal(root.messages.inexistente, undefined);
  store.flush();

  let rounds = 0;
  while (!store.loadMessages(0)) rounds++;
  assert.ok(rounds >= 2, 'em mais de uma vez');
  assert.deepEqual(root.messages.geral.map((m) => m.id), ['m2', 'm1', 'm3']);
  assert.equal(root.messages.canal200, undefined);
  assert.equal(root.messages.canal249[0].text, 'antiga 249');
  assert.equal(Object.keys(root.messages).length, 251); // geral, os 250 canais menos o apagado e o novo ('vazio' não tem linhas)
  assert.deepEqual(store.sweep(1000), []);
  const saved = readRoot(file);
  assert.deepEqual(saved.messages.geral.map((m) => m.id), ['m2', 'm1', 'm3']);
  assert.equal(saved.messages.canal200, undefined);
  assert.deepEqual(saved.messages.novo.map((m) => m.id), ['n1']);
  store.close();
});
