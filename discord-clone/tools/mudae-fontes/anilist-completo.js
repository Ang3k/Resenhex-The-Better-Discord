// PROTÓTIPO: TODOS os personagens do AniList (anime, mangá, manhwa, manhua, light novel, hentai incluído), varrendo os ids de 50 em 50.
// O coletor atual (anilist.js) só pega o elenco das obras mais populares; este não depende de obra nenhuma.
// Não escreve em server/mudae-catalogo.json nem nos caches das outras fontes: tudo vai para tools/mudae-cache/anilist-completo/.
//
// Uso:  node tools/mudae-fontes/anilist-completo.js            (continua de onde parou)
//       node tools/mudae-fontes/anilist-completo.js --do-zero  (apaga o progresso)
//       node tools/mudae-fontes/anilist-completo.js --ate=450000 --parar-apos=100
// Saída: linhas.ndjson  uma linha de 7 colunas por personagem aceito (formato do catálogo, fonte "a"),
//        extras.ndjson  { id, tipo ANIME|MANGA, pais, adulto, formato } para filtrar depois (manhwa = pais KR, +18 = adulto),
//        progresso.json onde parou, e relatorio.json ao terminar.
//
// CHECKPOINT (queda de luz, internet, Ctrl+C):
//   - cada página é gravada com fsync e SÓ DEPOIS o progresso avança (também com fsync, por arquivo temporário + rename);
//   - ao iniciar, reparar() corta linha cortada ao meio, tira o que passou do progresso (página gravada e não confirmada) e
//     refaz o progresso se ele estiver corrompido ou sumiu. Resultado: nunca fica id repetido nem faltando;
//   - sem internet / 429 / erro 5xx, espera e tenta de novo para sempre (não derruba o processo);
//   - Ctrl+C (SIGINT/SIGTERM) termina a página em andamento e sai limpo.
// O limite do AniList é lido do cabeçalho (hoje 30/min, o normal é 90/min); o ritmo se ajusta sozinho.
const fs = require('fs');
const path = require('path');
const { wait } = require('./comum');

const IMG_PREFIX = 'https://s4.anilist.co/file/anilistcdn/character/large/';
const BATCH = 50;
const QUERY = 'query($ids:[Int]){ Page(perPage:50){ characters(id_in:$ids){ id name{full} gender favourites image{large} '
  + 'media(perPage:1,sort:POPULARITY_DESC){ nodes{ type format countryOfOrigin isAdult title{romaji english} } } } } }';

// ---- gravação segura
function anexar(file, text) {
  const fd = fs.openSync(file, 'a');
  try { fs.writeSync(fd, text); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}
function escreverAtomico(file, text) {
  const tmp = file + '.tmp';
  const fd = fs.openSync(tmp, 'w');
  try { fs.writeSync(fd, text); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  // Antivírus/indexador do Windows pode segurar o destino por alguns milissegundos.
  for (let tentativa = 0; ; tentativa++) {
    try { fs.renameSync(tmp, file); return; } catch (err) {
      if (!['EPERM', 'EBUSY', 'EACCES'].includes(err.code) || tentativa >= 10) throw err;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50 * (tentativa + 1));
    }
  }
}
// Linhas COMPLETAS (terminadas em \n) e que são JSON válido. A última, se foi cortada pela queda, é descartada.
function lerValidas(file, idDe) {
  if (!fs.existsSync(file)) return { itens: [], cortou: false };
  const partes = fs.readFileSync(file, 'utf8').split('\n');
  const cortou = partes.pop() !== ''; // sobra algo depois do último \n: linha pela metade
  const itens = [];
  for (const txt of partes) {
    if (!txt) continue;
    try { itens.push({ txt, id: Number(idDe(JSON.parse(txt))) }); } catch { /* linha ilegível: some */ }
  }
  return { itens, cortou: cortou || itens.length !== partes.filter(Boolean).length };
}
const paginaDe = (id) => Math.floor((id - 1) / BATCH) * BATCH + 1;

// Deixa linhas.ndjson, extras.ndjson e progresso.json consistentes entre si. Devolve o que mudou.
function reparar(dir) {
  const f = { linhas: path.join(dir, 'linhas.ndjson'), extras: path.join(dir, 'extras.ndjson'), progresso: path.join(dir, 'progresso.json') };
  let prog = null;
  try { prog = JSON.parse(fs.readFileSync(f.progresso, 'utf8')); if (!Number.isInteger(prog.proximo) || prog.proximo < 1) prog = null; } catch { prog = null; }
  const L = lerValidas(f.linhas, (r) => r[0]);
  const E = lerValidas(f.extras, (r) => r.id);
  const relatorio = { progressoRefeito: !prog && (L.itens.length > 0), linhaCortada: L.cortou || E.cortou, removidas: 0 };
  let proximo = prog ? prog.proximo : (L.itens.length ? paginaDe(Math.max(...L.itens.map((i) => i.id))) : 1);
  // Um id que está só num dos arquivos (queda entre as duas gravações): volta o progresso para a página dele.
  const idsE = new Set(E.itens.map((i) => i.id));
  const idsL = new Set(L.itens.map((i) => i.id));
  for (const id of [...idsL].filter((i) => !idsE.has(i) && i < proximo).concat([...idsE].filter((i) => !idsL.has(i) && i < proximo))) proximo = Math.min(proximo, paginaDe(id));
  // O que passou do progresso é de uma página que não foi confirmada: sai, e a página é buscada de novo.
  const keepL = [];
  const vistos = new Set();
  for (const i of L.itens) if (i.id < proximo && idsE.has(i.id) && !vistos.has(i.id)) { vistos.add(i.id); keepL.push(i); }
  const keepE = [];
  const vistosE = new Set();
  for (const i of E.itens) if (i.id < proximo && idsL.has(i.id) && !vistosE.has(i.id)) { vistosE.add(i.id); keepE.push(i); }
  relatorio.removidas = (L.itens.length - keepL.length) + (E.itens.length - keepE.length);
  if (relatorio.removidas || L.cortou || E.cortou) {
    escreverAtomico(f.linhas, keepL.map((i) => i.txt + '\n').join(''));
    escreverAtomico(f.extras, keepE.map((i) => i.txt + '\n').join(''));
  }
  const novo = { ...(prog || { vazias: 0, paginas: 0, existem: 0, descartados: {}, iniciadoEm: new Date().toISOString() }), proximo, aceitos: keepL.length };
  if (!prog || prog.proximo !== proximo || prog.aceitos !== keepL.length) escreverAtomico(f.progresso, JSON.stringify(novo));
  return { ...relatorio, proximo, aceitos: keepL.length, prog: novo };
}

// ---- rede: espera e tenta de novo para sempre (queda de internet, 429, 5xx).
async function pedir(ids, estado) {
  for (let tentativa = 1; ; tentativa++) {
    let res;
    try {
      res = await fetch('https://graphql.anilist.co', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ query: QUERY, variables: { ids } }), signal: AbortSignal.timeout(45_000) });
    } catch (err) { res = { ok: false, status: 0, headers: new Headers(), err }; }
    const limit = Number(res.headers.get('x-ratelimit-limit'));
    if (limit > 0) estado.limit = limit;
    const restam = res.headers.get('x-ratelimit-remaining');
    if (res.ok) {
      const body = await res.json();
      if (body.errors?.length && !body.data) throw new Error('AniList: ' + body.errors.map((e) => e.message).join('; '));
      // Pouco saldo na janela: espera ela virar em vez de bater no 429.
      if (restam !== null && Number(restam) <= 1) await wait(Math.max(1000, (Number(res.headers.get('x-ratelimit-reset')) * 1000 - Date.now()) + 500));
      if (tentativa > 1) console.log('  AniList voltou.');
      return body.data.Page.characters;
    }
    if (!(res.status === 0 || res.status === 429 || res.status >= 500)) throw new Error('AniList: HTTP ' + res.status);
    const espera = Number(res.headers.get('retry-after')) || Math.min(120, 2 ** Math.min(tentativa, 7));
    if (tentativa === 1 || tentativa % 10 === 0) console.log(`  AniList ${res.status === 0 ? 'sem conexão' : 'HTTP ' + res.status}, tentando de novo em ${espera}s (tentativa ${tentativa})`);
    await wait(espera * 1000);
  }
}

function linhaDe(c) {
  const img = c.image?.large || '';
  const name = c.name?.full?.trim();
  const media = c.media?.nodes?.[0];
  const series = media?.title?.english || media?.title?.romaji;
  if (!name) return { skip: 'semNome' };
  if (!/^https?:\/\//.test(img) || /\/default\.(jpg|png)/i.test(img)) return { skip: 'semImagem' };
  if (!series) return { skip: 'semObra' };
  const row = [c.id, name, series, img.startsWith(IMG_PREFIX) ? img.slice(IMG_PREFIX.length) : img,
    c.gender === 'Female' ? 'F' : c.gender === 'Male' ? 'M' : '', c.favourites || 0, 'a'];
  return { row, extra: { id: c.id, tipo: media.type, pais: media.countryOfOrigin || null, adulto: !!media.isAdult, formato: media.format || null } };
}

async function main(args = process.argv.slice(2)) {
  const opt = (k, d) => { const a = args.find((x) => x.startsWith('--' + k + '=')); return a ? Number(a.split('=')[1]) : d; };
  const dir = path.join(process.env.MUDAE_CACHE || path.join(__dirname, '..', 'mudae-cache'), 'anilist-completo');
  fs.mkdirSync(dir, { recursive: true });
  const files = { linhas: path.join(dir, 'linhas.ndjson'), extras: path.join(dir, 'extras.ndjson'), progresso: path.join(dir, 'progresso.json') };
  if (args.includes('--do-zero')) for (const f of [...Object.values(files), path.join(dir, 'relatorio.json')]) fs.rmSync(f, { force: true });
  const ate = opt('ate', 600_000);
  const pararApos = opt('parar-apos', 100); // páginas seguidas sem nenhum personagem
  const rep = reparar(dir);
  if (rep.removidas || rep.linhaCortada || rep.progressoRefeito) console.log(`Reparo: ${rep.removidas} linha(s) removida(s)${rep.linhaCortada ? ', linha cortada descartada' : ''}${rep.progressoRefeito ? ', progresso refeito' : ''}.`);
  const prog = rep.prog;
  let sair = false;
  for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => { sair = true; console.log('  Pedido de parada: termino a página atual e saio.'); });
  const estado = { limit: 30 };
  console.log('AniList completo: a partir do id ' + prog.proximo + ' (' + prog.aceitos + ' aceitos até agora)');
  while (!sair && prog.proximo <= ate && prog.vazias < pararApos) {
    const ids = Array.from({ length: BATCH }, (_, i) => prog.proximo + i);
    const t = Date.now();
    const chars = await pedir(ids, estado);
    const linhas = [];
    const extras = [];
    for (const c of chars) {
      const r = linhaDe(c);
      if (r.skip) { prog.descartados[r.skip] = (prog.descartados[r.skip] || 0) + 1; continue; }
      linhas.push(JSON.stringify(r.row));
      extras.push(JSON.stringify(r.extra));
    }
    // 1) a página inteira, com fsync; 2) só depois o progresso avança. Se cair no meio, reparar() desfaz a página.
    if (linhas.length) { anexar(files.linhas, linhas.join('\n') + '\n'); anexar(files.extras, extras.join('\n') + '\n'); }
    prog.existem += chars.length;
    prog.aceitos += linhas.length;
    prog.vazias = chars.length ? 0 : prog.vazias + 1;
    prog.proximo += BATCH;
    prog.paginas++;
    escreverAtomico(files.progresso, JSON.stringify(prog));
    if (prog.paginas % 20 === 0) console.log(`  id ${prog.proximo} | ${prog.aceitos} aceitos de ${prog.existem} | limite ${estado.limit}/min`);
    // Ritmo: um pouco abaixo do limite informado pelo AniList.
    const passo = (60_000 / estado.limit) * 1.08;
    const gasto = Date.now() - t;
    if (!sair && gasto < passo) await wait(passo - gasto);
  }
  if (sair) { console.log('Parado no id ' + prog.proximo + ' (' + prog.aceitos + ' aceitos). Rode de novo para continuar.'); return null; }
  const fim = { terminouEm: new Date().toISOString(), motivo: prog.vazias >= pararApos ? 'fim dos ids' : 'limite --ate', ultimoId: prog.proximo - BATCH * prog.vazias, ...prog };
  escreverAtomico(path.join(dir, 'relatorio.json'), JSON.stringify(fim, null, 2));
  console.log('Pronto: ' + prog.aceitos + ' personagens (' + fim.motivo + ')');
  return fim;
}

if (require.main === module) main().catch((err) => { console.error(err.message); process.exitCode = 1; });
module.exports = { linhaDe, main, reparar, escreverAtomico, anexar };
