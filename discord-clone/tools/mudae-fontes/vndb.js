// PROTÓTIPO: personagens de visual novels a partir do dump aberto da VNDB (ODbL + DbCL, https://vndb.org/d14).
// Ainda NÃO está ligado ao tools/mudae-catalogo.js: não entra no catálogo publicado e não mexe em nenhum cache das outras fontes.
// Uso:
//   node tools/mudae-fontes/vndb.js --baixar                      baixa o dump mais recente (~195 MB) para tools/mudae-cache/vndb/
//   node tools/mudae-fontes/vndb.js --dump caminho.tar.zst        usa um dump já baixado
// Opções: --max-sexual=50 --max-violence=50 (nota média da imagem, 0 a 200; ver abaixo) --fonte=v (letra de fonte das linhas) --saida=pasta
//         --incluir-adulto (por padrão, VNs em que TODAS as releases com idade mínima conhecida são 18+ ficam de fora)
//         --maximo  = --incluir-adulto + --max-sexual=200 --max-violence=200: tudo, com os menores de idade ainda de fora (ver TRACOS_MENOR)
//                     e um arquivo vndb-extras.ndjson com { id, adulto, sexual, violencia } para o produto filtrar por canal.
// Saída (padrão tools/mudae-cache/prototipos/): vndb.json (linhas de 7 colunas, como as outras fontes) e vndb-relatorio.json.
//
// Como cada coluna é montada:
//   id        "vndb" + número do personagem (c33 -> vndb33). Não colide com g123, c123, d-wiki-123, s12-34.
//   nome      o nome em inglês da ficha, senão o romanizado, senão o original.
//   obra      título da VN em que o personagem mais pesa (papel x votos da VN), preferindo o título oficial em inglês.
//   foto      https://t.vndb.org/ch/<últimos 2 dígitos>/<número>.jpg (miniatura pública; carrega sem Referer).
//   gênero    "gender" da ficha se existir, senão "sex" (f/m); b, n e vazio ficam sem gênero.
//   score     max(papel x votos da VN). Só serve para ordenar DENTRO da fonte (o servidor usa a posição, não o valor).
// Filtros: sem imagem, variantes (campo "main" preenchido = é outra versão de um personagem), imagem com nota de conteúdo
// acima do limite e VN adulta (idade mínima 18 em todas as releases que informam idade).
//
// A letra de fonte padrão é "v" (nova), não "g": o score da VNDB (votos da VN) não é comparável ao do IGDB, e o servidor calcula a
// raridade pela posição DENTRO de cada fonte. Misturar as duas distorceria a raridade dos jogos que já existem. O servidor ainda não
// conhece a letra "v" (SOURCES em server/mudae.js): uma linha com fonte desconhecida é descartada em silêncio. As notas c_sexual_avg e c_violence_avg vão de 0 a 200 (média x100 de 0=seguro, 1=sugestivo, 2=explícito).
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { pipeline } = require('stream/promises');
const { Readable } = require('stream');
const { normalize, writeJson } = require('./coleta');

const DUMP_URL = 'https://dl.vndb.org/dump/vndb-db-latest.tar.zst';
const UA = 'ResenhexMudaeCatalog/1.0 (personal, non-commercial)';
const TABLES = ['chars', 'chars_names', 'chars_vns', 'images', 'vn', 'vn_titles', 'releases', 'releases_vn', 'chars_traits'];
// Traços da VNDB que dizem que o personagem é criança (os de idade escolar fundamental e menores). Junto com a idade declarada < 18,
// servem para tirar MENORES do conteúdo adulto: nunca entram personagens menores em VN 18+ nem com imagem sugestiva ou explícita.
const TRACOS_MENOR = new Set(['i855', 'i856', 'i886', 'i1310']); // Middle School Student, Elementary School Student, Kindergartener, Infant
const ROLE_WEIGHT = { primary: 1, main: 0.8, side: 0.4, appears: 0.1 };

// ---- leitura do .tar.zst (só as tabelas que importam; o resto é pulado sem guardar)
async function lerTabelas(file, names = TABLES) {
  const wanted = new Set(names.flatMap((n) => ['db/' + n, 'db/' + n + '.header']));
  const parts = new Map();
  const stream = fs.createReadStream(file).pipe(zlib.createZstdDecompress());
  let buf = Buffer.alloc(0);
  let skip = 0;
  let cur = null;
  for await (const chunk of stream) {
    buf = buf.length ? Buffer.concat([buf, chunk]) : chunk;
    for (;;) {
      if (cur) {
        const n = Math.min(cur.left, buf.length);
        if (n) { cur.chunks.push(Buffer.from(buf.subarray(0, n))); buf = buf.subarray(n); cur.left -= n; }
        if (cur.left > 0) break;
        parts.set(cur.name, Buffer.concat(cur.chunks));
        cur = null;
      }
      if (skip > 0) { const n = Math.min(skip, buf.length); buf = buf.subarray(n); skip -= n; if (skip > 0) break; }
      if (buf.length < 512) break;
      const h = buf.subarray(0, 512);
      if (h.every((b) => b === 0)) { buf = buf.subarray(512); continue; }
      const name = h.toString('utf8', 0, 100).replace(/\0.*$/, '');
      const size = parseInt(h.toString('utf8', 124, 136).replace(/\0.*$/, '').trim() || '0', 8);
      buf = buf.subarray(512);
      const padding = Math.ceil(size / 512) * 512 - size;
      if (wanted.has(name)) { cur = { name, left: size, chunks: [] }; skip = padding; } else skip = size + padding;
    }
  }
  const tables = {};
  for (const n of names) {
    const header = parts.get('db/' + n + '.header');
    const body = parts.get('db/' + n);
    if (!header || !body) throw new Error('O dump não tem a tabela ' + n);
    tables[n] = { cols: header.toString('utf8').trim().split('\t'), text: body.toString('utf8') };
  }
  return tables;
}

// Formato COPY do PostgreSQL: TSV com \N = nulo e \n \t \\ escapados.
const unescape = (s) => (s === '\\N' ? null : s.includes('\\') ? s.replace(/\\(.)/g, (_, c) => (c === 'n' ? '\n' : c === 't' ? '\t' : c === 'r' ? '\r' : c)) : s);
function* linhas(table, want) {
  const idx = want.map((c) => { const i = table.cols.indexOf(c); if (i < 0) throw new Error('Coluna ausente: ' + c); return i; });
  let start = 0;
  const text = table.text;
  while (start < text.length) {
    let end = text.indexOf('\n', start);
    if (end < 0) end = text.length;
    if (end > start) {
      const f = text.slice(start, end).split('\t');
      yield idx.map((i) => unescape(f[i] ?? '\\N'));
    }
    start = end + 1;
  }
}

const num = (id) => Number(String(id).replace(/\D/g, ''));
const fotoDe = (image) => { const n = num(image); return `https://t.vndb.org/ch/${String(n % 100).padStart(2, '0')}/${n}.jpg`; };

// ---- montagem das linhas
function montar(tables, { maxSexual = 50, maxViolence = 50, source = 'v', incluirAdulto = false } = {}) {
  const report = { total: 0, descartados: {}, aceitos: 0 };
  const extras = [];
  const drop = (k) => { report.descartados[k] = (report.descartados[k] || 0) + 1; };

  const imagens = new Map();
  for (const [id, sexual, violence, votes] of linhas(tables.images, ['id', 'c_sexual_avg', 'c_violence_avg', 'c_votecount'])) imagens.set(id, { sexual: Number(sexual), violence: Number(violence), votes: Number(votes) });

  const vns = new Map();
  for (const [id, olang, votes] of linhas(tables.vn, ['id', 'olang', 'c_votecount'])) vns.set(id, { olang, votes: Number(votes) || 0 });
  // Título da VN: inglês oficial > romanizado do idioma original > título do idioma original > qualquer um.
  const titulos = new Map();
  for (const [id, lang, official, title, latin] of linhas(tables.vn_titles, ['id', 'lang', 'official', 'title', 'latin'])) {
    (titulos.get(id) || titulos.set(id, []).get(id)).push({ lang, official: official === 't', title, latin });
  }
  const tituloDe = (vid) => {
    const list = titulos.get(vid) || [];
    const olang = vns.get(vid)?.olang;
    const pick = list.find((t) => t.lang === 'en' && t.official) || list.find((t) => t.lang === 'en')
      || list.find((t) => t.lang === olang && t.latin) || list.find((t) => t.lang === olang) || list[0];
    return pick ? (pick.lang === 'en' ? pick.title : pick.latin || pick.title) : null;
  };

  // VN adulta: tem releases com idade mínima conhecida e nenhuma delas abaixo de 18.
  const idadePorRelease = new Map();
  for (const [id, minage] of linhas(tables.releases, ['id', 'minage'])) if (minage !== null) idadePorRelease.set(id, Number(minage));
  const idades = new Map();
  for (const [rid, vid] of linhas(tables.releases_vn, ['id', 'vid'])) { const a = idadePorRelease.get(rid); if (a !== undefined) (idades.get(vid) || idades.set(vid, []).get(vid)).push(a); }
  const adulta = (vid) => { const l = idades.get(vid); return !!l && Math.min(...l) >= 18; };
  report.vnsAdultas = [...vns.keys()].filter(adulta).length;

  const nomes = new Map();
  for (const [id, lang, name, latin] of linhas(tables.chars_names, ['id', 'lang', 'name', 'latin'])) (nomes.get(id) || nomes.set(id, []).get(id)).push({ lang, name, latin });
  const nomeDe = (cid) => {
    const list = nomes.get(cid) || [];
    const en = list.find((n) => n.lang === 'en');
    const pick = en?.name || list.find((n) => n.latin)?.latin || list[0]?.name;
    return pick ? pick.trim() : null;
  };

  const papeis = new Map();
  for (const [cid, vid, role] of linhas(tables.chars_vns, ['id', 'vid', 'role'])) (papeis.get(cid) || papeis.set(cid, []).get(cid)).push({ vid, role });

  const menores = new Set();
  for (const [cid, tid] of linhas(tables.chars_traits, ['id', 'tid'])) if (TRACOS_MENOR.has(tid)) menores.add(cid);

  const rows = [];
  for (const [id, image, main, sex, gender, age] of linhas(tables.chars, ['id', 'image', 'main', 'sex', 'gender', 'age'])) {
    report.total++;
    if (!image) { drop('semImagem'); continue; }
    if (main) { drop('variante'); continue; }
    const img = imagens.get(image);
    if (!img || img.votes < 1) { drop('imagemSemNota'); continue; }
    if (img.sexual > maxSexual) { drop('imagemSexual'); continue; }
    if (img.violence > maxViolence) { drop('imagemViolenta'); continue; }
    const name = nomeDe(id);
    if (!name) { drop('semNome'); continue; }
    // A VN em que o personagem mais pesa.
    let best = null;
    let soAdulta = false;
    for (const { vid, role } of papeis.get(id) || []) {
      if (!incluirAdulto && adulta(vid)) { soAdulta = true; continue; }
      const score = (ROLE_WEIGHT[role] ?? 0.1) * (vns.get(vid)?.votes || 0);
      if (!best || score > best.score) best = { vid, score };
    }
    if (!best) { drop(soAdulta ? 'vnAdulta' : 'semVN'); continue; }
    const obra = tituloDe(best.vid);
    if (!obra) { drop('VNSemTitulo'); continue; }
    // Menor de idade (idade declarada < 18 ou traço de criança): só fica em obra e imagem sem conteúdo adulto.
    const menor = (age !== null && Number(age) < 18) || menores.has(id);
    const adultoVN = adulta(best.vid);
    if (menor && (adultoVN || img.sexual > 0)) { drop('menorEmConteudoAdulto'); continue; }
    const g = gender || sex;
    extras.push({ id: 'vndb' + num(id), adulto: adultoVN, sexual: img.sexual, violencia: img.violence });
    rows.push(['vndb' + num(id), name, obra, fotoDe(image), g === 'f' ? 'F' : g === 'm' ? 'M' : '', Math.round(best.score), source]);
  }
  rows.sort((a, b) => b[5] - a[5]);
  report.aceitos = rows.length;
  return { rows, report, extras };
}

async function baixarDump(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'vndb-db-latest.tar.zst');
  const res = await fetch(DUMP_URL, { headers: { 'User-Agent': UA }, redirect: 'follow' });
  if (!res.ok) throw new Error('VNDB: HTTP ' + res.status);
  await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(file + '.tmp'));
  fs.renameSync(file + '.tmp', file);
  return file;
}

async function vndb({ dumpFile, options = {} }) {
  const tables = await lerTabelas(dumpFile);
  return montar(tables, options);
}

function resumo(rows, report) {
  const porObra = new Map();
  for (const r of rows) porObra.set(r[2], (porObra.get(r[2]) || 0) + 1);
  const gen = { F: 0, M: 0, '': 0 };
  for (const r of rows) gen[r[4]]++;
  return { ...report, obras: porObra.size, genero: gen, personagensPorObra: +(rows.length / Math.max(1, porObra.size)).toFixed(1),
    maioresObras: [...porObra].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([obra, n]) => ({ obra, n })),
    topPersonagens: rows.slice(0, 25).map((r) => ({ id: r[0], nome: r[1], obra: r[2], score: r[5] })) };
}

async function main(args = process.argv.slice(2)) {
  const opt = (k, d) => { const a = args.find((x) => x.startsWith('--' + k + '=')); return a ? a.split('=')[1] : d; };
  const cache = process.env.MUDAE_CACHE || path.join(__dirname, '..', 'mudae-cache');
  let dumpFile = opt('dump', null) || (args.includes('--dump') ? args[args.indexOf('--dump') + 1] : null);
  if (args.includes('--baixar')) { console.log('Baixando o dump da VNDB...'); dumpFile = await baixarDump(path.join(cache, 'vndb')); }
  dumpFile ||= path.join(cache, 'vndb', 'vndb-db-latest.tar.zst');
  if (!fs.existsSync(dumpFile)) throw new Error('Dump não encontrado: ' + dumpFile + ' (use --baixar ou --dump arquivo.tar.zst)');
  const out = opt('saida', path.join(cache, 'prototipos'));
  const maximo = args.includes('--maximo');
  const options = { maxSexual: Number(opt('max-sexual', maximo ? 200 : 50)), maxViolence: Number(opt('max-violence', maximo ? 200 : 50)), source: opt('fonte', 'v'), incluirAdulto: maximo || args.includes('--incluir-adulto') };
  console.log('Lendo ' + dumpFile);
  const { rows, report, extras } = await vndb({ dumpFile, options });
  writeJson(path.join(out, 'vndb.json'), rows, true);
  if (args.includes('--maximo')) fs.writeFileSync(path.join(out, 'vndb-extras.ndjson'), extras.map((e) => JSON.stringify(e)).join('\n') + '\n');
  const sum = { geradoEm: new Date().toISOString(), dump: path.basename(dumpFile), opcoes: options, ...resumo(rows, report) };
  writeJson(path.join(out, 'vndb-relatorio.json'), sum);
  console.log(JSON.stringify({ ...sum, topPersonagens: undefined, maioresObras: undefined }, null, 1));
  console.log('Linhas em ' + path.join(out, 'vndb.json'));
  return sum;
}

if (require.main === module) main().catch((err) => { console.error(err.message); process.exitCode = 1; });
module.exports = { vndb, montar, lerTabelas, fotoDe, normalize };
