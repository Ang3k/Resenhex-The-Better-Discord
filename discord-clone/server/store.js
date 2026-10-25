// Banco em SQLite (node:sqlite, que vem com o Node), gravado em pedaços. Os dados continuam em memória, no mesmo
// objeto de sempre (`root`): cada conta, servidor, sessão, amizade, conversa, bloqueio, envio, clipe e token de
// e-mail é uma linha da tabela `chunks`, e cada mensagem é uma linha da tabela `messages`.
// Quem muda algo marca o pedaço (mark) e flush() grava só os marcados, numa transação: o servidor não para mais
// para regravar o banco inteiro. Uma conferência lenta (sweep) passa por todos os pedaços aos poucos e grava o que
// tiver mudado sem marca, avisando no log, para um esquecimento nunca virar dado perdido.
const fs = require('node:fs');
const path = require('node:path');
const { Worker } = require('node:worker_threads');
// O node:sqlite avisa que é experimental a cada início; o aviso só polui o log.
const emitWarning = process.emitWarning;
process.emitWarning = (warning, ...rest) => (String(warning).includes('SQLite') ? undefined : emitWarning.call(process, warning, ...rest));
const { DatabaseSync } = require('node:sqlite');
process.emitWarning = emitWarning;

const COLLECTIONS = ['accounts', 'sessions', 'sessionUse', 'servers', 'friendships', 'blocks', 'dms', 'uploads', 'clips', 'mailTokens'];
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
  // máquina inteira cair, nunca corrompe). O -wal volta a ter no máximo 32 MB depois de cada checkpoint completo.
  db.exec(`PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA journal_size_limit = 33554432;
    CREATE TABLE IF NOT EXISTS chunks (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS messages (channel TEXT NOT NULL, id TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY (channel, id));
    -- Por canal e, dentro do canal, na ordem em que as mensagens entraram (o índice guarda o rowid junto).
    CREATE INDEX IF NOT EXISTS messages_by_channel ON messages (channel);`);
  return db;
}

// Lê os pedaços que não são mensagens, na ordem em que cada um entrou (a ordem das contas e dos servidores importa:
// é a ordem da lista de servidores). Guarda o texto do root e dos servidores, os únicos pedaços que as migrações do
// início mexem, para a conferência do início.
function readChunks(db) {
  const root = {};
  const texts = new Map();
  const rest = db.prepare("SELECT value FROM chunks WHERE key = 'root'").get();
  if (rest) { Object.assign(root, JSON.parse(rest.value)); texts.set('root', rest.value); }
  for (const collection of SPLIT) root[collection] ||= {};
  for (const { key, value } of db.prepare("SELECT key, value FROM chunks WHERE key <> 'root' ORDER BY rowid").iterate()) {
    const { collection, id } = parseKey(key);
    root[collection][id] = JSON.parse(value);
    if (collection === 'servers') texts.set(key, value);
  }
  return { root, texts };
}

// As mensagens de um canal numa lista só, na ordem em que entraram: com 1,35 milhão de mensagens, o SQLite junta
// tudo em 40% do tempo de ler uma linha por mensagem.
const CHANNEL_LIST = "'[' || group_concat(value, ',' ORDER BY rowid) || ']'";
const CHANNEL_PAGE = 100;

// Para testes e ferramentas: o que está gravado, como um objeto (o servidor pode estar ligado).
function readRoot(file) {
  if (!fs.existsSync(file)) throw new Error('Banco não encontrado: ' + file);
  const db = new DatabaseSync(file);
  try {
    const { root } = readChunks(db);
    const channels = db.prepare(`SELECT channel, ${CHANNEL_LIST} AS list FROM messages INDEXED BY messages_by_channel GROUP BY channel`);
    for (const { channel, list } of channels.iterate()) root.messages[channel] = JSON.parse(list);
    return root;
  } finally { db.close(); }
}

// Para ferramentas: grava um objeto inteiro como banco novo (apaga o que houver no arquivo).
function writeRoot(file, root) {
  for (const suffix of ['', '-wal', '-shm']) fs.rmSync(file + suffix, { force: true });
  const store = openStore(file);
  store.attach(root);
  store.importAll();
  store.close();
}

// Checkpoint numa worker_thread (server/store-checkpoint.js). O automático roda dentro da gravação a cada ~4 MB de
// -wal e para a linha principal até ~150 ms, esperando o disco. Se a worker morrer, o automático volta.
function startCheckpoints(db, file, intervalMs, log) {
  const shared = new SharedArrayBuffer(8);
  const state = new Int32Array(shared);
  db.exec('PRAGMA wal_autocheckpoint = 0');
  const worker = new Worker(path.join(__dirname, 'store-checkpoint.js'), { workerData: { file, intervalMs, shared } });
  worker.unref();
  let stopped = false;
  const fallback = (why) => {
    if (stopped) return;
    stopped = true;
    try { db.exec('PRAGMA wal_autocheckpoint = 1000'); } catch { /* banco já fechado */ }
    log(`[banco] checkpoint em segundo plano parou (${why}); voltou o automático`);
  };
  worker.on('error', (error) => fallback(error.message));
  worker.on('exit', (code) => fallback('saiu com código ' + code));
  return {
    // Para e espera a worker fechar a conexão dela (até 2 s): assim o fechamento da principal limpa o -wal.
    stop() {
      if (stopped) return;
      stopped = true;
      Atomics.store(state, 0, 1);
      Atomics.notify(state, 0);
      Atomics.wait(state, 1, 0, 2000);
    },
  };
}

// checkpointMs: com um número, o checkpoint roda numa worker_thread a cada checkpointMs (o servidor usa 1000).
function openStore(file, { log = console.error, verify = '', checkpointMs = 0 } = {}) {
  const db = openDatabase(file);
  const checkpoints = checkpointMs ? startCheckpoints(db, file, checkpointMs, log) : null;
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
    channelList: db.prepare(`SELECT ${CHANNEL_LIST} AS list FROM messages INDEXED BY messages_by_channel WHERE channel = ?`),
    channelPage: db.prepare(`SELECT channel, ${CHANNEL_LIST} AS list FROM messages INDEXED BY messages_by_channel
      WHERE channel > ? GROUP BY channel ORDER BY channel LIMIT ${CHANNEL_PAGE}`),
  };
  let root = null;
  let texts = null; // texto do root e dos servidores lidos ao ligar, até a conferência do início
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
    if (part.kind === 'channel') return writeChannel(part.channel);
    const stored = texts?.has(key) ? texts.get(key) : sql.get.get(key)?.value;
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

  // Mensagens antigas: chegam aos poucos depois do início (loadMessages). Até lá, root.messages é um Proxy, e o
  // canal que alguém pedir antes é lido na hora, só ele.
  let lazy = null; // { list: as mensagens de verdade, settled: canais já resolvidos na memória, after: onde parou }
  function lazyMessages() {
    const list = {};
    const settled = new Set(); // lidos, criados ou apagados desde o início: o banco não vale mais para eles
    const resolve = (channel) => {
      if (!lazy || typeof channel !== 'string' || settled.has(channel)) return;
      settled.add(channel);
      const text = sql.channelList.get(channel)?.list;
      if (text) list[channel] = JSON.parse(text);
    };
    lazy = { list, settled, after: '' };
    return new Proxy(list, {
      get: (target, key) => { resolve(key); return target[key]; },
      has: (target, key) => { resolve(key); return key in target; },
      getOwnPropertyDescriptor: (target, key) => { resolve(key); return Reflect.getOwnPropertyDescriptor(target, key); },
      set: (target, key, value) => { settled.add(key); target[key] = value; return true; },
      deleteProperty: (target, key) => { settled.add(key); delete target[key]; return true; },
    });
  }

  // Todos os pedaços: os da memória e depois os que só existem no banco (apagados da memória). As mensagens só
  // depois de carregadas: antes disso, um canal que ainda está só no banco pareceria apagado.
  function* everyKey(withMessages = true) {
    withMessages &&= !lazy;
    yield 'root';
    for (const collection of COLLECTIONS) for (const id in root[collection] || {}) yield collection + '/' + id;
    if (withMessages) for (const channel in root.messages || {}) yield 'messages/' + channel;
    for (let after = ''; ;) {
      const rows = sql.keysAfter.all(after);
      if (!rows.length) break;
      for (const { key } of rows) {
        after = key;
        if (key !== 'root' && textOf(parseKey(key)) === undefined) yield key;
      }
    }
    for (let after = ''; withMessages;) {
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
    // Tudo menos as mensagens antigas, que chegam por loadMessages (ou na hora, canal por canal, se alguém pedir).
    load() {
      const loaded = readChunks(db);
      texts = loaded.texts;
      loaded.root.messages = lazyMessages();
      return loaded.root;
    },
    // Lê mais canais de mensagens antigas, por até `budgetMs`. Devolve true quando não falta nenhum.
    loadMessages(budgetMs = 8) {
      if (!lazy) return true;
      const end = performance.now() + budgetMs;
      do {
        const rows = sql.channelPage.all(lazy.after);
        for (const { channel, list } of rows) {
          lazy.after = channel;
          if (!lazy.settled.has(channel)) { lazy.settled.add(channel); lazy.list[channel] = JSON.parse(list); }
        }
        if (rows.length < CHANNEL_PAGE) {
          root.messages = lazy.list;
          lazy = null;
          return true;
        }
      } while (performance.now() < end);
      return false;
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
    // Só o root e os servidores, os únicos pedaços que as migrações do início mexem: se um dia uma mexer em outro,
    // a conferência lenta grava (e avisa no log).
    checkAll() {
      let changed = 0;
      transaction(() => {
        for (const key of ['root', ...Object.keys(root.servers || {}).map((id) => 'servers/' + id)]) if (fix(key)) changed++;
      });
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
    close() { checkpoints?.stop(); db.close(); },
  };
}

module.exports = { openStore, readRoot, writeRoot, COLLECTIONS };
