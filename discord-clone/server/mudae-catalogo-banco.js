// Catálogo do Mudae num banco SQLite próprio (mudae-catalogo.db), para não guardar 233 mil personagens na memória.
// Na memória ficam só números, em arrays tipados (um a quatro bytes por personagem): fonte, gênero, "fora da
// roleta", posição na fonte e a obra. Os textos (id, nome e foto) ficam no banco e são lidos quando uma carta
// aparece; as cartas lidas há pouco ficam num cache pequeno. As chaves da busca do $im (o nome normalizado)
// ficam num Buffer só, fora do heap do JavaScript.
//
// O banco é montado sozinho a partir do mudae-catalogo.json (lido linha a linha) quando não existe ou quando o
// JSON muda: o tamanho, a data e o hash do JSON ficam guardados no próprio banco. Os testes passam o catálogo
// como array e aí o banco é montado na memória (":memory:").
//
// O personagem é o seu índice k na ordem de sempre (do mais popular para o menos, entre todas as fontes):
// a mesma ordem do array "chars" que o mudae.js montava antes, com as mesmas regras de desempate.
const fs = require('node:fs');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

// Muda quando o formato do banco muda: um banco de formato velho é montado de novo.
const FORMATO = 2;
// Abaixo disto o JSON é lido inteiro de uma vez (os testes); acima, linha a linha.
const LINHA_A_LINHA_BYTES = 4 * 1024 * 1024;
// Cartas no cache (duas gerações de até CACHE_METADE cada): cabe um álbum de 5 mil inteiro.
const CACHE_METADE = 6000;

// Um mapa com duas gerações: o que foi usado há pouco fica, o resto sai sozinho quando a geração nova enche.
// Quase tão bom quanto um LRU, e um acerto custa um Map.get.
function cacheDuasGeracoes(metade) {
  let nova = new Map();
  let velha = new Map();
  const set = (key, v) => {
    nova.set(key, v);
    if (nova.size >= metade) { velha = nova; nova = new Map(); }
  };
  return {
    set,
    get(key) {
      let v = nova.get(key);
      if (v !== undefined) return v;
      v = velha.get(key);
      if (v !== undefined) set(key, v);
      return v;
    },
    // Só olha: não traz da geração velha para a nova (para leituras que não devem ocupar o cache).
    peek: (key) => nova.get(key) ?? velha.get(key),
  };
}

// Lê o JSON do catálogo (um personagem por linha, como o tools/mudae-catalogo.js grava) sem ter o arquivo
// inteiro na memória. Devolve o hash do arquivo. Se alguma linha não for "[", "]" ou uma linha de personagem,
// lê o arquivo inteiro com JSON.parse, como antes.
function lerCatalogo(file, cada) {
  const size = fs.statSync(file).size;
  if (size <= LINHA_A_LINHA_BYTES) return lerInteiro(file, cada);
  const linhas = [];
  const hash = crypto.createHash('sha256');
  const fd = fs.openSync(file, 'r');
  try {
    const chunk = Buffer.allocUnsafe(1 << 20);
    let resto = null;
    let ok = true;
    const linha = (buf, a, b) => {
      let s = buf.toString('utf8', a, b).trim();
      if (!s || s === '[' || s === ']') return;
      if (s.endsWith(',')) s = s.slice(0, -1);
      let row;
      try { row = JSON.parse(s); } catch { ok = false; return; }
      if (!Array.isArray(row) || Array.isArray(row[0])) { ok = false; return; }
      linhas.push(row);
      if (linhas.length >= 2000) { for (const r of linhas) cada(r); linhas.length = 0; }
    };
    for (;;) {
      const n = fs.readSync(fd, chunk, 0, chunk.length, null);
      if (!n) break;
      hash.update(chunk.subarray(0, n));
      let buf = resto ? Buffer.concat([resto, chunk.subarray(0, n)]) : chunk.subarray(0, n);
      let inicio = 0;
      for (let i = buf.indexOf(10); i !== -1 && ok; i = buf.indexOf(10, inicio)) {
        linha(buf, inicio, i);
        inicio = i + 1;
      }
      if (!ok) break;
      resto = inicio < buf.length ? Buffer.from(buf.subarray(inicio)) : null;
      buf = null;
    }
    if (ok && resto) linha(resto, 0, resto.length);
    if (!ok) return null; // formato inesperado: quem chamou começa de novo lendo inteiro
    for (const r of linhas) cada(r);
  } finally { fs.closeSync(fd); }
  return hash.digest('hex');
}
function lerInteiro(file, cada) {
  const buf = fs.readFileSync(file);
  for (const r of JSON.parse(buf.toString('utf8'))) cada(r);
  return crypto.createHash('sha256').update(buf).digest('hex');
}
function hashDoArquivo(file) {
  const hash = crypto.createHash('sha256');
  const fd = fs.openSync(file, 'r');
  try {
    const chunk = Buffer.allocUnsafe(1 << 20);
    for (let n; (n = fs.readSync(fd, chunk, 0, chunk.length, null));) hash.update(chunk.subarray(0, n));
  } finally { fs.closeSync(fd); }
  return hash.digest('hex');
}

// Hash de 32 bits (FNV-1a) do id em texto, para o índice dos ids na memória. Dois ids com o mesmo hash não
// atrapalham: quem acha pelo hash sempre confere o id de verdade na linha do banco.
function hashId(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

// Foto sem o começo repetido do endereço (economiza ~40% da tabela, então uma carta lê menos páginas do disco).
// Um caractere de controle (que não aparece em endereço) diz qual começo foi tirado; uma foto que já comece com
// um deles ganha um \x00 na frente. Por isso a volta é exata para qualquer texto.
const PREFIXOS = ['https://image.tmdb.org/t/p/w342/', 'https://comicvine.gamespot.com/a/uploads/scale_large/',
  'https://images.igdb.com/igdb/image/upload/t_cover_big_2x/', 'https://static.wikia.nocookie.net/'];
const WIKIA = 4; // código do Fandom; o 5 é o Fandom com o meio do endereço trocado por \x05
const WIKIA_MEIO = '/revision/latest/scale-to-width-down/400?cb=';
function fotoCurta(img) {
  if (typeof img !== 'string') return img;
  for (let i = 0; i < PREFIXOS.length; i++) {
    if (!img.startsWith(PREFIXOS[i])) continue;
    const rest = img.slice(PREFIXOS[i].length);
    if (i + 1 === WIKIA && rest.includes(WIKIA_MEIO) && !rest.includes('\x05')) return '\x05' + rest.replace(WIKIA_MEIO, () => '\x05');
    return String.fromCharCode(i + 1) + rest;
  }
  return img.charCodeAt(0) < 32 ? '\x00' + img : img;
}
function fotoInteira(s) {
  if (typeof s !== 'string') return s;
  const c = s.charCodeAt(0);
  if (!(c < 32)) return s;
  if (c === 0) return s.slice(1);
  if (c === WIKIA + 1) return PREFIXOS[WIKIA - 1] + s.slice(1).replace('\x05', () => WIKIA_MEIO);
  return PREFIXOS[c - 1] + s.slice(1);
}

// Chaves de busca do $im num Buffer só ("\nchave0\nchave1\n…", UTF-8), com o byte onde começa cada uma.
function montarChaves(keys) {
  const partes = ['\n'];
  for (const k of keys) partes.push(k, '\n');
  const buf = Buffer.from(partes.join(''), 'utf8');
  const start = new Int32Array(keys.length);
  for (let k = 0, p = 1; k < keys.length; k++) { start[k] = p; p += Buffer.byteLength(keys[k]) + 1; }
  return { buf, start };
}

// Monta o banco em db (aberto e vazio). ler(cada) chama cada(linha) para cada linha do catálogo, na ordem, e
// devolve o hash do arquivo (null = formato inesperado: nada é gravado e montar devolve null). As linhas passam
// duas vezes: na 1ª, só a nota, a fonte, o gênero e o "fora" ficam na memória, para achar a ordem; na 2ª, cada
// linha vai direto para o seu lugar na tabela. As contas e as ordenações são as mesmas que o mudae.js fazia com
// os objetos, por isso a ordem sai igual.
function montar(db, ler, { refSize, isSource, normalize }) {
  // 1ª passada.
  const srcOrder = []; // letras das fontes, na ordem em que aparecem (a ordem de sempre)
  const porFonte = []; // linhas de cada fonte
  const score = [];
  const gen = [];
  const fora = [];
  const srcOfLn = [];
  const obraLocal = new Map(); // obra -> número na ordem do arquivo
  const obraOfLn = [];
  const hash = ler((row) => {
    const [, , series, , gender, sc = 0, source = 'a', f = 0] = row;
    if (!isSource(source)) return;
    let s = srcOrder.indexOf(source);
    if (s === -1) { s = srcOrder.push(source) - 1; porFonte.push([]); }
    const ln = score.length;
    score.push(Number(sc)); // b.score - a.score faz a mesma conversão
    gen.push(gender === 'F' ? 1 : gender === 'M' ? 2 : 0);
    fora.push(f === 1 ? 1 : 0);
    srcOfLn.push(s);
    let o = obraLocal.get(series);
    if (o === undefined) { o = obraLocal.size; obraLocal.set(series, o); }
    obraOfLn.push(o);
    porFonte[s].push(ln);
  });
  if (hash === null) return null;
  const total = score.length;

  // Posição dentro da fonte (pela nota, do maior para o menor) e a posição equivalente numa fonte de 15 mil.
  const pos = new Int32Array(total);
  const eq = new Float64Array(total);
  porFonte.forEach((list) => {
    list.sort((a, b) => score[b] - score[a]);
    list.forEach((ln, i) => {
      pos[ln] = i + 1;
      eq[ln] = (i + 1) * refSize / list.length;
    });
  });
  // Mais popular primeiro, entre todas as fontes (as fontes na ordem em que apareceram, como no flat()).
  const chars = porFonte.flat().sort((a, b) => eq[a] - eq[b]); // k -> linha
  const kOf = new Int32Array(total); // linha -> k
  chars.forEach((ln, k) => { kOf[ln] = k; });

  // Os números de cada personagem, já na ordem k. As obras ganham número pela 1ª aparição nessa ordem.
  const out = { src: new Uint8Array(total), gen: new Uint8Array(total), fora: new Uint8Array(total), pos: new Int32Array(total) };
  const obraNames = [...obraLocal.keys()];
  const sidOfLocal = new Int32Array(obraNames.length).fill(-1);
  const sidNames = [];
  const sidArr = new Uint32Array(total);
  chars.forEach((ln, k) => {
    out.src[k] = srcOfLn[ln];
    out.gen[k] = gen[ln];
    out.fora[k] = fora[ln];
    out.pos[k] = pos[ln];
    const o = obraOfLn[ln];
    if (sidOfLocal[o] === -1) { sidOfLocal[o] = sidNames.length; sidNames.push(obraNames[o]); }
    sidArr[k] = sidOfLocal[o];
  });

  db.exec(`PRAGMA journal_mode = OFF; PRAGMA synchronous = OFF;
    CREATE TABLE meta (k TEXT PRIMARY KEY, v);
    CREATE TABLE obra (sid INTEGER PRIMARY KEY, name);
    -- Colunas sem tipo guardam o valor como veio (número como número, texto como texto).
    -- img vai sem o começo repetido do endereço (fotoCurta); a busca pelo id usa um índice na memória.
    CREATE TABLE c (idx INTEGER PRIMARY KEY, id, name, img);`);
  db.exec('BEGIN');
  try {
    const val = (v) => (v === undefined ? null : v);
    const insObra = db.prepare('INSERT INTO obra VALUES (?, ?)');
    sidNames.forEach((name, sid) => insObra.run(sid, val(name)));

    // 2ª passada: cada linha vai para o seu k.
    const keys = new Array(total);
    const numIds = []; // [id numérico, k]
    const txtIds = []; // [hash do id em texto, k]
    const insC = db.prepare('INSERT INTO c VALUES (?, ?, ?, ?)');
    let ln = 0;
    ler((row) => {
      const [id, name, , img, , , source = 'a'] = row;
      if (!isSource(source)) return;
      if (ln >= total) throw new Error('O catálogo mudou enquanto era lido.');
      const k = kOf[ln++];
      keys[k] = normalize(name);
      if (typeof id === 'number') numIds.push([id, k]);
      else txtIds.push([hashId(String(id)), k]);
      insC.run(k, val(id), val(name), val(fotoCurta(img)));
    });
    if (ln !== total) throw new Error('O catálogo mudou enquanto era lido.');

    const sid = sidNames.length <= 65536 ? Uint16Array.from(sidArr) : sidArr;
    const chaves = montarChaves(keys);
    // Índice dos ids, ordenado (busca binária): os números pelo valor e os textos pelo hash (conferido na leitura).
    numIds.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    txtIds.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const insMeta = db.prepare('INSERT INTO meta VALUES (?, ?)');
    const blob = (a) => new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
    insMeta.run('formato', FORMATO);
    insMeta.run('refSize', refSize);
    insMeta.run('n', total);
    insMeta.run('srcOrder', JSON.stringify(srcOrder));
    insMeta.run('srcLen', JSON.stringify(porFonte.map((l) => l.length)));
    insMeta.run('sidBytes', sid.BYTES_PER_ELEMENT);
    const idArrays = [
      ['numId', Float64Array.from(numIds, (x) => x[0])], ['numIdx', Int32Array.from(numIds, (x) => x[1])],
      ['txtHash', Uint32Array.from(txtIds, (x) => x[0])], ['txtIdx', Int32Array.from(txtIds, (x) => x[1])],
    ];
    for (const [nome, a] of [['src', out.src], ['gen', out.gen], ['fora', out.fora], ['pos', out.pos], ['sid', sid], ['chaves', chaves.buf], ['chavesInicio', chaves.start], ...idArrays]) insMeta.run(nome, blob(a));
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  return hash;
}

const lerMeta = (db) => Object.fromEntries(db.prepare('SELECT k, v FROM meta').all().map((r) => [r.k, r.v]));

// O banco serve para este JSON e este refSize? (Se só a data mudou, confere o hash e guarda a data nova.)
function bancoServe(dbFile, jsonFile, refSize) {
  if (!fs.existsSync(dbFile)) return false;
  let db;
  try {
    db = new DatabaseSync(dbFile, { readOnly: true });
    const get = (k) => db.prepare('SELECT v FROM meta WHERE k = ?').get(k)?.v;
    if (get('formato') !== FORMATO || get('refSize') !== refSize || get('jsonSize') !== fs.statSync(jsonFile).size) return false;
    const mtime = fs.statSync(jsonFile).mtimeMs;
    if (get('jsonMtime') === mtime) return true;
    const hash = get('jsonHash');
    db.close();
    db = null;
    if (hashDoArquivo(jsonFile) !== hash) return false;
    // Guarda a data nova para não calcular o hash de novo na próxima vez. Se outro processo estiver com o banco
    // aberto, fica para depois: o banco serve do mesmo jeito.
    try {
      const w = new DatabaseSync(dbFile);
      try { w.prepare("UPDATE meta SET v = ? WHERE k = 'jsonMtime'").run(mtime); } finally { w.close(); }
    } catch {}
    return true;
  } catch {
    return false;
  } finally {
    db?.close();
  }
}

// Gera o banco do JSON num arquivo temporário e troca pelo de verdade no fim (um banco pela metade nunca é usado).
function gerarArquivo(dbFile, jsonFile, opts) {
  const tmp = dbFile + '.gerando';
  const stat = fs.statSync(jsonFile);
  const tentar = (ler) => {
    fs.rmSync(tmp, { force: true });
    const db = new DatabaseSync(tmp);
    try {
      const hash = montar(db, ler, opts);
      if (hash === null) return false;
      gravarOrigem(db, stat, hash);
      return true;
    } finally { db.close(); }
  };
  // Formato inesperado no meio do arquivo: começa de novo lendo o JSON inteiro, como antes.
  if (!tentar((cada) => lerCatalogo(jsonFile, cada))) tentar((cada) => lerInteiro(jsonFile, cada));
  try {
    fs.renameSync(tmp, dbFile);
    return dbFile;
  } catch (err) {
    // No Windows, um banco velho aberto por outro processo não deixa trocar: usa o novo mesmo assim.
    console.error(`[mudae] não deu para trocar ${dbFile} (${err.code || err.message}); usando ${tmp}.`);
    return tmp;
  }
}
function gravarOrigem(db, stat, hash) {
  const ins = db.prepare('INSERT INTO meta VALUES (?, ?)');
  ins.run('jsonSize', stat.size);
  ins.run('jsonMtime', stat.mtimeMs);
  ins.run('jsonHash', hash);
}

// Abre o catálogo. rows: as linhas num array (testes) -> banco na memória. file + dbFile: o JSON e o banco ao lado
// do data.db. Sem rows e sem o arquivo, o catálogo fica vazio (como antes, quando o JSON não existia).
// molde: um banco pronto ao lado do JSON (server/mudae-catalogo.db, fora do Git), que o `npm test` monta uma vez
// antes dos testes. Se o banco do data.db não serve e o molde serve, o servidor abre o molde (só leitura) em vez de
// montar outro: cada teste que liga o servidor usa uma pasta de dados nova e montaria o banco de novo (~2 s cada).
// No servidor de verdade o molde não existe (o deploy só leva os arquivos do Git) e nada muda.
function openCatalog({ rows = null, file = null, dbFile = null, molde = null, refSize, isSource, normalize }) {
  const opts = { refSize, isSource, normalize };
  let db;
  if (rows || !file || !fs.existsSync(file) || !dbFile) {
    db = new DatabaseSync(':memory:');
    if (!rows && file && fs.existsSync(file)) montar(db, (cada) => lerInteiro(file, cada), opts);
    else montar(db, (cada) => { for (const r of rows || []) cada(r); }, opts);
  } else {
    let path;
    if (bancoServe(dbFile, file, refSize)) path = dbFile;
    else if (molde && molde !== dbFile && bancoServe(molde, file, refSize)) path = molde;
    else {
      const t0 = Date.now();
      path = gerarArquivo(dbFile, file, opts);
      console.log(`[mudae] catálogo montado em ${path} (${Date.now() - t0} ms).`);
    }
    db = new DatabaseSync(path, { readOnly: true });
    // Ninguém escreve no banco aberto: a trava de leitura fica presa em vez de ser pega e solta a cada leitura,
    // que relia o cabeçalho (110 µs por carta no Windows, medido; com isto, ~9 µs). Outros processos ainda leem.
    db.exec('PRAGMA locking_mode = EXCLUSIVE');
  }
  return abrir(db);
}

function abrir(db) {
  const meta = lerMeta(db);
  const n = meta.n;
  const copia = (u8, Tipo) => new Tipo(new Uint8Array(u8).buffer); // cópia alinhada, só deste array
  const src = copia(meta.src, Uint8Array);
  const gen = copia(meta.gen, Uint8Array);
  const fora = copia(meta.fora, Uint8Array);
  const pos = copia(meta.pos, Int32Array);
  const sid = copia(meta.sid, meta.sidBytes === 2 ? Uint16Array : Uint32Array);
  const srcOrder = JSON.parse(meta.srcOrder);
  const srcLen = Float64Array.from(JSON.parse(meta.srcLen));
  const obras = db.prepare('SELECT name FROM obra ORDER BY sid').all().map((r) => r.name);
  const chaves = Buffer.from(new Uint8Array(meta.chaves).buffer); // fora do heap do JavaScript
  const chavesInicio = copia(meta.chavesInicio, Int32Array);

  // Índice dos ids (ordenado): os numéricos pelo valor e os de texto pelo hash, cada um com o seu k.
  const numId = copia(meta.numId, Float64Array);
  const numIdx = copia(meta.numIdx, Int32Array);
  const txtHash = copia(meta.txtHash, Uint32Array);
  const txtIdx = copia(meta.txtIdx, Int32Array);

  // Textos: lidos do banco quando precisa, numa consulta só para uma lista inteira.
  const stRow = db.prepare('SELECT idx, id, name, img FROM c WHERE idx = ?');
  const stRows = db.prepare('SELECT idx, id, name, img FROM c WHERE idx IN (SELECT value FROM json_each(?))');
  const stImgs = db.prepare('SELECT idx, img FROM c WHERE idx IN (SELECT value FROM json_each(?))');

  const porIdx = cacheDuasGeracoes(CACHE_METADE); // k -> { idx, id, name, img }
  const pronta = (r) => { r.img = fotoInteira(r.img); return r; };

  function row(k) {
    let r = porIdx.get(k);
    if (r === undefined) { r = pronta(stRow.get(k)); porIdx.set(k, r); }
    return r;
  }
  // As linhas de uma lista de personagens, na mesma ordem (guarda no cache, a não ser com guardar = false).
  function rows(ks, guardar = true) {
    const out = new Array(ks.length);
    let faltam = null;
    for (let i = 0; i < ks.length; i++) {
      const r = guardar ? porIdx.get(ks[i]) : porIdx.peek(ks[i]);
      if (r !== undefined) out[i] = r;
      else (faltam ||= []).push(i);
    }
    if (faltam) {
      if (faltam.length === 1 && guardar) out[faltam[0]] = row(ks[faltam[0]]);
      else {
        const achou = new Map();
        for (const r of stRows.iterate(JSON.stringify(faltam.map((i) => ks[i])))) achou.set(r.idx, pronta(r));
        for (const i of faltam) {
          const r = achou.get(ks[i]);
          out[i] = r;
          if (guardar) porIdx.set(ks[i], r);
        }
      }
    }
    return out;
  }
  // Só as fotos (a roleta gira fotos ao acaso: não ocupam o cache).
  function imgs(ks) {
    const out = new Array(ks.length);
    let faltam = null;
    for (let i = 0; i < ks.length; i++) {
      const r = porIdx.peek(ks[i]);
      if (r !== undefined) out[i] = r.img;
      else (faltam ||= []).push(i);
    }
    if (faltam) {
      const achou = new Map();
      for (const r of stImgs.iterate(JSON.stringify(faltam.map((i) => ks[i])))) achou.set(r.idx, fotoInteira(r.img));
      for (const i of faltam) out[i] = achou.get(ks[i]);
    }
    return out;
  }

  // id (número ou texto, como vem do banco do Salão ou do cliente) -> k. A regra é a do Map de antes,
  // String(id) -> personagem: com ids repetidos (não há hoje), vale o último na ordem (o maior k).
  // Primeiro índice de arr com valor >= x (busca binária).
  const lowerBound = (arr, x) => {
    let lo = 0;
    let hi = arr.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (arr[mid] < x) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  const PENDENTE = -2;
  // O k do id em texto s, ou -1. Os ids numéricos batem pelo valor (String(x) === s só quando x === Number(s)
  // e s é a forma normal do número); os de texto, pelo hash e depois pelo id lido na linha.
  // soCache: se uma linha a conferir não está no cache, devolve PENDENTE em vez de ir ao banco.
  function resolve(s, soCache) {
    let best = -1;
    const x = Number(s);
    if (String(x) === s) for (let j = lowerBound(numId, x); j < numId.length && numId[j] === x; j++) best = numIdx[j];
    const h = hashId(s);
    for (let j = lowerBound(txtHash, h); j < txtHash.length && txtHash[j] === h; j++) {
      const k = txtIdx[j];
      if (k <= best) continue;
      let r;
      if (soCache) { r = porIdx.get(k); if (r === undefined) return PENDENTE; } else r = row(k);
      if (String(r.id) === s) best = k;
    }
    return best;
  }
  // Os ids achados há pouco (os das cartas com dono se repetem o tempo todo: harém, álbum, perfil, ranking).
  const porId = cacheDuasGeracoes(CACHE_METADE); // String(id) -> k
  function lookup(id) {
    const s = String(id);
    let k = porId.get(s);
    if (k !== undefined) return k;
    k = resolve(s, false);
    if (k < 0) return undefined;
    porId.set(s, k);
    return k;
  }
  // Vários ids de uma vez: as linhas que faltam conferir vêm todas numa consulta só.
  function lookupMany(ids) {
    const out = new Array(ids.length);
    let pend = null;
    for (let i = 0; i < ids.length; i++) {
      const s = String(ids[i]);
      let k = porId.get(s);
      if (k === undefined) {
        k = resolve(s, true);
        if (k === PENDENTE) { (pend ||= []).push(i); continue; }
        if (k >= 0) porId.set(s, k);
      }
      out[i] = k < 0 ? undefined : k;
    }
    if (pend) {
      const ks = [];
      for (const i of pend) {
        const h = hashId(String(ids[i]));
        for (let j = lowerBound(txtHash, h); j < txtHash.length && txtHash[j] === h; j++) ks.push(txtIdx[j]);
      }
      rows(ks);
      for (const i of pend) out[i] = lookup(ids[i]);
    }
    return out;
  }
  // Deixa no cache as cartas destes ids (até o tamanho de uma geração do cache), numa consulta só.
  function preload(ids) {
    rows(lookupMany(ids.slice(0, CACHE_METADE)).filter((k) => k !== undefined));
  }

  // Busca do $im no Buffer das chaves: o primeiro personagem (aceito por ok) cuja chave é igual a q, senão o
  // primeiro cuja chave começa com q, senão o primeiro que contém q. "Primeiro" = menor k = o mais popular,
  // o mesmo desempate do find de antes. A agulha com \n marca o começo e o fim de uma chave.
  const idxAt = (byte) => {
    let lo = 0;
    let hi = chavesInicio.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (chavesInicio[mid] <= byte) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };
  function primeiro(agulha, ok, ajuste) {
    let p = chaves.indexOf(agulha, 0, 'utf8');
    while (p !== -1) {
      const k = idxAt(p + ajuste);
      if (ok(k)) return k;
      if (k + 1 >= chavesInicio.length) return undefined;
      p = chaves.indexOf(agulha, chavesInicio[k + 1] - ajuste, 'utf8');
    }
    return undefined;
  }
  const search = (q, ok) => primeiro('\n' + q + '\n', ok, 1) ?? primeiro('\n' + q, ok, 1) ?? primeiro(q, ok, 0);
  // A chave de busca de um personagem (o nome normalizado), lida do Buffer.
  const keyOf = (k) => chaves.toString('utf8', chavesInicio[k], (k + 1 < n ? chavesInicio[k + 1] : chaves.length) - 1);

  return { n, src, gen, fora, pos, sid, srcOrder, srcLen, obras, row, rows, imgs, lookup, lookupMany, preload, search, keyOf, close: () => db.close() };
}

module.exports = { openCatalog };
