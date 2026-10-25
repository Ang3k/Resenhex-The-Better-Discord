// Banco em SQLite (node:sqlite, que vem com o Node), gravado em pedaços. Os dados continuam em memória, no mesmo
// objeto de sempre (`root`): cada conta, servidor, sessão, amizade, conversa, bloqueio, envio, clipe e token de
// e-mail é uma linha da tabela `chunks`, e cada mensagem é uma linha da tabela `messages`.
// Quem muda algo marca o pedaço (mark) e flush() grava só os marcados, numa transação: o servidor não para mais
// para regravar o banco inteiro. Uma conferência lenta (sweep) passa por todos os pedaços aos poucos e grava o que
// tiver mudado sem marca, avisando no log, para um esquecimento nunca virar dado perdido.
const fs = require('node:fs');
// O node:sqlite avisa que é experimental a cada início; o aviso só polui o log.
const emitWarning = process.emitWarning;
process.emitWarning = (warning, ...rest) => (String(warning).includes('SQLite') ? undefined : emitWarning.call(process, warning, ...rest));
const { DatabaseSync } = require('node:sqlite');
process.emitWarning = emitWarning;

const COLLECTIONS = ['accounts', 'sessions', 'servers', 'friendships', 'blocks', 'dms', 'uploads', 'clips', 'mailTokens'];
const SPLIT = new Set([...COLLECTIONS, 'messages']);

// Chave de cada pedaço: 'root' (o que sobra: id do servidor padrão, dono do site…), 'accounts/<id>',
// 'messages/<canal>' (o canal inteiro) ou 'messages/<canal>/<id da mensagem>'.
function parseKey(key) {
  if (key === 'root') return { kind: 'root' };
  const slash = key.indexOf('/');
  const collection = key.slice(0, slash);
  if (collection === 'messages') {
    const rest = key.slice(slash + 1);
    const second = rest.indexOf('/');
    return second < 0 ? { kind: 'channel', channel: rest } : { kind: 'message', channel: rest.slice(0, second), id: rest.slice(second + 1) };
  }
  if (slash < 0 || !COLLECTIONS.includes(collection)) throw new Error('Pedaço desconhecido do banco: ' + key);
  return { kind: 'chunk', collection, id: key.slice(slash + 1) };
}

function openDatabase(file) {
  const db = new DatabaseSync(file);
  // WAL: ler não espera a gravação. NORMAL: sem esperar o disco a cada transação (pode perder a última se a
  // máquina inteira cair, nunca corrompe).
  db.exec(`PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;
    CREATE TABLE IF NOT EXISTS chunks (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS messages (channel TEXT NOT NULL, id TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY (channel, id));`);
  return db;
}

// Lê o banco inteiro para um objeto, na ordem em que cada pedaço entrou (a ordem das contas e dos servidores
// importa: é a ordem da lista de servidores). Também devolve o texto de cada pedaço, para conferir depois.
function readAll(db) {
  const root = {};
  const texts = new Map();
  const rest = db.prepare("SELECT value FROM chunks WHERE key = 'root'").get();
  if (rest) { Object.assign(root, JSON.parse(rest.value)); texts.set('root', rest.value); }
  for (const collection of SPLIT) root[collection] ||= {};
  for (const { key, value } of db.prepare("SELECT key, value FROM chunks WHERE key <> 'root' ORDER BY rowid").iterate()) {
    const { collection, id } = parseKey(key);
    root[collection][id] = JSON.parse(value);
    texts.set(key, value);
  }
  for (const { channel, id, value } of db.prepare('SELECT channel, id, value FROM messages ORDER BY rowid').iterate()) {
    (root.messages[channel] ||= []).push(JSON.parse(value));
    let stored = texts.get('messages/' + channel);
    if (!stored) texts.set('messages/' + channel, (stored = new Map()));
    stored.set(id, value);
  }
  return { root, texts };
}

// Para testes e ferramentas: o que está gravado, como um objeto (o servidor pode estar ligado).
function readRoot(file) {
  if (!fs.existsSync(file)) throw new Error('Banco não encontrado: ' + file);
  const db = new DatabaseSync(file);
  try { return readAll(db).root; } finally { db.close(); }
}

// Para ferramentas: grava um objeto inteiro como banco novo (apaga o que houver no arquivo).
function writeRoot(file, root) {
  for (const suffix of ['', '-wal', '-shm']) fs.rmSync(file + suffix, { force: true });
  const store = openStore(file);
  store.attach(root);
  store.importAll();
  store.close();
}

function openStore(file, { log = console.error, verify = '' } = {}) {
  const db = openDatabase(file);
  const saved = !!db.prepare("SELECT 1 FROM chunks WHERE key = 'root'").get();
  const sql = {
    put: db.prepare('INSERT INTO chunks (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value'),
    del: db.prepare('DELETE FROM chunks WHERE key = ?'),
    get: db.prepare('SELECT value FROM chunks WHERE key = ?'),
    putMessage: db.prepare('INSERT INTO messages (channel, id, value) VALUES (?, ?, ?) ON CONFLICT (channel, id) DO UPDATE SET value = excluded.value'),
    delMessage: db.prepare('DELETE FROM messages WHERE channel = ? AND id = ?'),
    channel: db.prepare('SELECT id, value FROM messages WHERE channel = ?'),
    keysAfter: db.prepare('SELECT key FROM chunks WHERE key > ? ORDER BY key LIMIT 500'),
    channelsAfter: db.prepare('SELECT DISTINCT channel FROM messages WHERE channel > ? ORDER BY channel LIMIT 200'),
  };
  let root = null;
  let texts = null; // texto de cada pedaço lido ao ligar, até a conferência do início
  const dirty = new Set(); // pedaços marcados
  const dirtyMessages = new Map(); // canal -> ids das mensagens marcadas (o canal inteiro fica em dirty)

  const transaction = (work) => {
    db.exec('BEGIN');
    try { const result = work(); db.exec('COMMIT'); return result; } catch (error) { db.exec('ROLLBACK'); throw error; }
  };
  const rest = () => JSON.stringify(Object.fromEntries(Object.entries(root).filter(([key]) => !SPLIT.has(key))));
  const textOf = ({ kind, collection, id }) => {
    if (kind === 'root') return rest();
    const value = root[collection]?.[id];
    return value === undefined ? undefined : JSON.stringify(value);
  };

  // Grava um pedaço como está na memória. Com `stored`, só se for diferente; devolve se gravou.
  function writeChunk(key, part, stored) {
    const text = textOf(part);
    if (stored !== null && text === stored) return false;
    if (text === undefined) sql.del.run(key); else sql.put.run(key, text);
    return true;
  }
  // Canal inteiro: confere cada mensagem com o que está gravado.
  function writeChannel(channel, stored = new Map(sql.channel.all(channel).map((row) => [row.id, row.value]))) {
    const list = root.messages?.[channel] || [];
    let changed = false;
    const seen = new Set();
    for (const msg of list) {
      const text = JSON.stringify(msg);
      seen.add(msg.id);
      if (stored.get(msg.id) !== text) { sql.putMessage.run(channel, msg.id, text); changed = true; }
    }
    for (const id of stored.keys()) if (!seen.has(id)) { sql.delMessage.run(channel, id); changed = true; }
    return changed;
  }
  function writeMessages(channel, ids) {
    const list = root.messages?.[channel] || [];
    const byId = ids.size > 3 ? new Map(list.map((msg) => [msg.id, msg])) : null;
    for (const id of ids) {
      const msg = byId ? byId.get(id) : list.find((m) => m.id === id);
      if (msg) sql.putMessage.run(channel, id, JSON.stringify(msg)); else sql.delMessage.run(channel, id);
    }
  }

  // Confere um pedaço com o banco (ou com o texto lido ao ligar) e grava se estiver diferente.
  function fix(key) {
    const part = parseKey(key);
    if (part.kind === 'channel') return writeChannel(part.channel, texts ? texts.get(key) || new Map() : undefined);
    const stored = texts ? texts.get(key) : sql.get.get(key)?.value;
    return writeChunk(key, part, stored);
  }
  // Conferência sem gravar (modo de teste): devolve se o pedaço está diferente do banco.
  function differs(key) {
    const part = parseKey(key);
    if (part.kind === 'channel') {
      const stored = new Map(sql.channel.all(part.channel).map((row) => [row.id, row.value]));
      const list = root.messages?.[part.channel] || [];
      return list.length !== stored.size || list.some((msg) => stored.get(msg.id) !== JSON.stringify(msg));
    }
    return textOf(part) !== sql.get.get(key)?.value;
  }

  // Todos os pedaços: os da memória e depois os que só existem no banco (apagados da memória).
  function* everyKey() {
    yield 'root';
    for (const collection of COLLECTIONS) for (const id in root[collection] || {}) yield collection + '/' + id;
    for (const channel in root.messages || {}) yield 'messages/' + channel;
    for (let after = ''; ;) {
      const rows = sql.keysAfter.all(after);
      if (!rows.length) break;
      for (const { key } of rows) {
        after = key;
        if (key !== 'root' && textOf(parseKey(key)) === undefined) yield key;
      }
    }
    for (let after = ''; ;) {
      const rows = sql.channelsAfter.all(after);
      if (!rows.length) break;
      for (const { channel } of rows) { after = channel; if (!root.messages?.[channel]) yield 'messages/' + channel; }
    }
  }
  const isDirty = (key) => dirty.has(key) || (key.startsWith('messages/') && dirtyMessages.has(parseKey(key).channel));

  let cursor = null;
  let suspects = new Set(); // modo de teste: pedaços diferentes e sem marca na conferência anterior

  return {
    saved, // o arquivo já tinha um banco (senão, os dados vêm do data.json ou começam do zero)
    load() {
      const loaded = readAll(db);
      texts = loaded.texts;
      return loaded.root;
    },
    attach(value) { root = value; },
    mark(key) {
      const part = parseKey(key);
      if (part.kind === 'message') {
        let ids = dirtyMessages.get(part.channel);
        if (!ids) dirtyMessages.set(part.channel, (ids = new Set()));
        ids.add(part.id);
      } else dirty.add(key);
    },
    pending: () => dirty.size + dirtyMessages.size,
    // Grava os pedaços marcados. Devolve quanto tempo levou (ms).
    flush() {
      if (!dirty.size && !dirtyMessages.size) return 0;
      const started = performance.now();
      transaction(() => {
        for (const key of dirty) {
          const part = parseKey(key);
          if (part.kind === 'channel') writeChannel(part.channel); else writeChunk(key, part, null);
        }
        for (const [channel, ids] of dirtyMessages) if (!dirty.has('messages/' + channel)) writeMessages(channel, ids);
      });
      dirty.clear();
      dirtyMessages.clear();
      return performance.now() - started;
    },
    // Banco novo: grava tudo de uma vez (vindo do data.json ou do zero).
    importAll() {
      texts = null;
      transaction(() => {
        sql.put.run('root', rest());
        for (const collection of COLLECTIONS) {
          for (const [id, value] of Object.entries(root[collection] || {})) sql.put.run(collection + '/' + id, JSON.stringify(value));
        }
        for (const [channel, list] of Object.entries(root.messages || {})) {
          for (const msg of list) sql.putMessage.run(channel, msg.id, JSON.stringify(msg));
        }
      });
    },
    // Ao ligar, depois das migrações: grava o que elas mudaram (compara com o texto lido) e esquece o texto.
    checkAll() {
      let changed = 0;
      transaction(() => { for (const key of everyKey()) if (fix(key)) changed++; });
      texts = null;
      return changed;
    },
    // Conferência lenta: até `budgetMs` por chamada, recomeçando do início quando termina.
    // Devolve os pedaços que estavam diferentes sem marca (já gravados).
    sweep(budgetMs = 2) {
      const end = performance.now() + budgetMs;
      const found = [];
      transaction(() => {
        cursor ||= everyKey();
        while (performance.now() < end) {
          const { value: key, done } = cursor.next();
          if (done) { cursor = null; break; }
          if (!isDirty(key) && fix(key)) found.push(key);
        }
      });
      for (const key of found) log(`[banco] gravado pela conferência, faltou marcar: ${key}`);
      return found;
    },
    // Modo de teste: confere tudo sem gravar e registra (no arquivo `verify`) o pedaço que continua diferente e sem
    // marca de uma conferência para a outra (uma mudança pode vir um pouco antes da marca, numa função assíncrona).
    verify() {
      const next = new Set();
      for (const key of everyKey()) {
        if (isDirty(key) || !differs(key)) continue;
        next.add(key);
        if (suspects.has(key) && verify) fs.appendFileSync(verify, `${new Date().toISOString()} faltou marcar: ${key}\n`);
      }
      suspects = next;
      return [...next];
    },
    // Cópia consistente com o servidor ligado.
    backup(dest) { db.exec(`VACUUM INTO '${String(dest).replaceAll("'", "''")}'`); },
    close() { db.close(); },
  };
}

module.exports = { openStore, readRoot, writeRoot, COLLECTIONS };
