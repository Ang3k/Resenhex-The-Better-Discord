#!/usr/bin/env node
// Compara a wiki da comunidade do Mudae (mudae.fandom.com, CC-BY-SA) com o nosso catálogo, para medir QUAIS personagens e séries
// do original ainda não temos. Só lê: não escreve em server/mudae-catalogo.json.
// Uso: node tools/mudae-comparar-wiki.js [--baixar] [--saida pasta]
//   --baixar  baixa de novo a lista da wiki (senão usa o cache de uma execução anterior)
// Saída (padrão tools/mudae-cache/wiki-mudae/, fora do Git): wiki.json, comparacao.json, relatorio.md
const fs = require('fs');
const path = require('path');
const { request, pacer } = require('./mudae-fontes/comum');
const { normalize, writeJson } = require('./mudae-fontes/coleta');

const args = process.argv.slice(2);
const outDir = args.includes('--saida') ? args[args.indexOf('--saida') + 1] : path.join(__dirname, 'mudae-cache', 'wiki-mudae');
const CATALOG = process.env.MUDAE_CATALOG || path.join(__dirname, '..', 'server', 'mudae-catalogo.json');
const UA = { 'User-Agent': 'ResenhexMudaeCatalog/1.0 (personal, non-commercial)' };
const pace = pacer(400);
const NL = String.fromCharCode(10);

const clean = (v) => String(v || '').replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
// "Maya (AL)", "Chase (PKMN)", "Absorbing Man (Carl Creel)": o sufixo desambigua na wiki; o nome do personagem é o resto.
const semSufixo = (s) => String(s || '').replace(/\s*\([^)]*\)\s*$/, '').trim();
// A wiki escreve a roleta de várias formas ("Game roulette", "Animanga", "Game & Animanga roulette", com erro de digitação).
function roletaDe(v) {
  const t = String(v || '').toLowerCase();
  const game = /game/.test(t);
  const anim = /anim/.test(t);
  return game && anim ? 'ambas' : game ? 'games' : anim ? 'animanga' : '(vazia)';
}

// Campos do {{Character Info ...}}: "|chave = valor" no começo de uma linha (o valor de images ocupa várias linhas).
// O template fecha com "}}" no fim da última linha de campo ("|roulette = Animanga}}"): corta ali e para.
function parseInfo(wikitext, title = '') {
  const start = wikitext.search(/\{\{\s*Character Info/i);
  if (start < 0) return null;
  const fields = {};
  let key = null;
  for (const raw of wikitext.slice(start).split(NL).slice(1)) {
    const end = raw.indexOf('}}');
    const line = end >= 0 ? raw.slice(0, end) : raw;
    const m = /^\|\s*([\w ]+?)\s*=\s*(.*)$/.exec(line);
    if (m) { key = m[1].toLowerCase(); fields[key] = m[2]; } else if (key && key !== 'images') fields[key] += ' ' + line;
    if (end >= 0) break;
  }
  // Sem "name", a wiki usa o título da página.
  const name = clean(fields.name) || title;
  const aliases = clean(fields.aliases).split(/\s*[,;]\s*/).filter(Boolean);
  const series = clean(fields.series);
  return { name, series, gender: clean(fields.gender), roulette: roletaDe(fields.roulette), aliases, serieSuspeita: !series || series.length > 90 };
}

async function baixar() {
  const rows = [];
  let cont = {};
  let pages = 0;
  do {
    await pace();
    const q = new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', generator: 'categorymembers', gcmtitle: 'Category:Characters',
      gcmnamespace: '0', gcmtype: 'page', gcmlimit: '50', prop: 'revisions', rvprop: 'content', rvslots: 'main', ...cont });
    const data = await request('https://mudae.fandom.com/api.php?' + q, { headers: UA }, { label: 'Mudae wiki' });
    for (const p of data.query?.pages || []) {
      const text = p.revisions?.[0]?.slots?.main?.content || '';
      const info = parseInfo(text, p.title);
      rows.push({ pageid: p.pageid, title: p.title, redirect: /^#redirect/i.test(text.trim()), ...(info || { name: p.title, series: '', gender: '', roulette: '(vazia)', aliases: [] }), hasInfo: !!info });
    }
    pages += (data.query?.pages || []).length;
    cont = data.continue || null;
    if (pages % 500 < 50) console.log('  wiki: ' + pages + ' páginas');
  } while (cont);
  writeJson(path.join(outDir, 'wiki.json'), { fetchedAt: new Date().toISOString(), rows });
  return rows;
}

const sortedTokens = (s) => normalize(s).split(' ').filter(Boolean).sort().join(' ');
const pct = (a, b) => (b ? (100 * a / b).toFixed(1) + '%' : '-');

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const wikiFile = path.join(outDir, 'wiki.json');
  const rows = args.includes('--baixar') || !fs.existsSync(wikiFile) ? await baixar() : JSON.parse(fs.readFileSync(wikiFile, 'utf8')).rows;
  const wiki = rows.filter((r) => r.hasInfo && r.name && !r.redirect);
  console.log('wiki: ' + rows.length + ' páginas, ' + wiki.length + ' com ficha de personagem');

  // Índices do nosso catálogo: por nome normalizado e por nome com as palavras em ordem alfabética (AniList usa "Sobrenome Nome" em parte dos casos).
  const cat = JSON.parse(fs.readFileSync(CATALOG, 'utf8'));
  const byName = new Map();
  const byTokens = new Map();
  const add = (map, key, i) => { if (key) (map.get(key) || map.set(key, []).get(key)).push(i); };
  cat.forEach((r, i) => { add(byName, normalize(r[1]), i); add(byTokens, sortedTokens(r[1]), i); });

  const ownSeries = new Map(); // série da wiki -> { obra nossa: votos }
  const result = [];
  for (const w of wiki) {
    const candidatos = [[w.name, 'nome'], [semSufixo(w.name), 'nome_sem_sufixo'], ...w.aliases.map((a) => [a, 'alias'])].filter(([n]) => n);
    let level = 'nenhum';
    let hits = [];
    for (const [n, tipo] of candidatos) { const h = byName.get(normalize(n)); if (h) { hits = h; level = tipo; break; } }
    if (!hits.length) for (const [n] of candidatos) { const h = byTokens.get(sortedTokens(n)); if (h) { hits = h; level = 'nome_invertido'; break; } }
    // Homônimos: separa os que também batem na obra (igual ou contida) dos que só batem no nome.
    const ws = normalize(w.series);
    const sameSeries = (i) => { const o = normalize(cat[i][2]); return !!ws && (o === ws || (ws.length > 4 && (o.includes(ws) || ws.includes(o)))); };
    const nasMesmasObras = hits.filter(sameSeries);
    const usados = nasMesmasObras.length ? nasMesmasObras : hits;
    const todasObras = [...new Set(hits.map((i) => cat[i][2]))];
    result.push({ title: w.title, name: w.name, series: w.series, roulette: w.roulette, gender: w.gender, nivel: level, serieSuspeita: w.serieSuspeita,
      // "confirmado" = nome e obra batem; "so_nome" = o nome existe no catálogo mas em outra obra (pode ser homônimo, não necessariamente o mesmo personagem)
      confianca: level === 'nenhum' ? 'nenhum' : nasMesmasObras.length ? 'confirmado' : 'so_nome',
      _obras: todasObras,
      achados: usados.slice(0, 5).map((i) => ({ id: cat[i][0], nome: cat[i][1], obra: cat[i][2], fonte: cat[i][6] || 'a', fora: cat[i][7] === 1 })) });
    for (const i of usados) { const m = ownSeries.get(w.series) || ownSeries.set(w.series, {}).get(w.series); m[cat[i][2]] = (m[cat[i][2]] || 0) + 1; }
  }

  // Mapeamento por votação: o Mudae chama as obras de outro jeito (romaji, abreviações). Se vários personagens de uma série da wiki caem
  // na MESMA obra nossa, essa obra é a equivalente, e os personagens que caem nela são 'provavel' (não só homônimos).
  const votos = new Map();
  for (const r of result) for (const o of r._obras) { const m = votos.get(r.series) || votos.set(r.series, new Map()).get(r.series); m.set(o, (m.get(o) || 0) + 1); }
  const mapa = new Map();
  for (const [serie, m] of votos) { const [obra, n] = [...m].sort((a, b) => b[1] - a[1])[0]; if (n >= 2) mapa.set(serie, obra); }
  for (const r of result) { if (r.confianca === 'so_nome' && mapa.has(r.series) && r._obras.includes(mapa.get(r.series))) r.confianca = 'provavel'; delete r._obras; }
  // Estado de cada série da wiki.
  const series = new Map();
  for (const r of result) {
    const s = series.get(r.series) || series.set(r.series, { series: r.series, total: 0, achados: 0, confirmados: 0, roletas: new Set() }).get(r.series);
    s.total++;
    if (r.nivel !== 'nenhum') s.achados++;
    if (r.confianca === 'confirmado' || r.confianca === 'provavel') s.confirmados++;
    s.roletas.add(r.roulette);
  }
  const seriesList = [...series.values()].map((s) => ({ ...s, roletas: [...s.roletas], obraNossa: Object.entries(ownSeries.get(s.series) || {}).sort((a, b) => b[1] - a[1])[0]?.[0] || null }))
    .sort((a, b) => b.total - a.total);
  const validas = seriesList.filter((s) => s.series && s.series.length <= 90);
  const semNenhum = validas.filter((s) => s.confirmados === 0);
  const faltaMuito = validas.filter((s) => s.confirmados > 0 && s.confirmados < s.total / 2 && s.total >= 5);

  const count = (key) => { const o = {}; for (const r of result) o[r[key]] = (o[r[key]] || 0) + 1; return o; };
  const total = result.length;
  const achados = result.filter((r) => r.nivel !== 'nenhum').length;
  const confirmados = result.filter((r) => r.confianca === 'confirmado').length;
  const provaveis = result.filter((r) => r.confianca === 'provavel').length;
  const foraDaRoleta = result.filter((r) => r.nivel !== 'nenhum' && r.achados.every((a) => a.fora)).length;
  const roleta = {};
  for (const r of result) { const o = (roleta[r.roulette] ||= { total: 0, achados: 0, confirmados: 0 }); o.total++; if (r.nivel !== 'nenhum') o.achados++; if (r.confianca === 'confirmado' || r.confianca === 'provavel') o.confirmados++; }
  const fontes = {};
  for (const r of result) if (r.nivel !== 'nenhum') { const f = r.achados[0]?.fonte; fontes[f] = (fontes[f] || 0) + 1; }

  const resumo = { geradoEm: new Date().toISOString(), paginasWiki: rows.length, redirecionamentos: rows.filter((r) => r.redirect).length, comFicha: total,
    achadosPorNome: achados, confirmadosNomeEObra: confirmados, provaveisPelaObraEquivalente: provaveis, soNomeEmOutraObra: achados - confirmados - provaveis, naoAchados: total - achados,
    achadosMasForaDaRoleta: foraDaRoleta, porNivel: count('nivel'), porRoleta: roleta, achadosPorFonteNossa: fontes,
    seriesWiki: validas.length, seriesSemNenhumConfirmado: semNenhum.length, seriesComMenosDaMetade: faltaMuito.length };
  writeJson(path.join(outDir, 'comparacao.json'), { resumo, series: seriesList, personagens: result });

  const top = (list, n) => list.slice(0, n).map((s) => '| ' + s.series + ' | ' + s.total + ' | ' + s.confirmados + ' | ' + s.roletas.join(', ') + ' |');
  const md = ['# Comparação: wiki do Mudae × catálogo do Resenhex', '', 'Gerado por `tools/mudae-comparar-wiki.js` em ' + resumo.geradoEm + '.', '',
    '| | |', '|---|---:|',
    '| Páginas em Category:Characters | ' + rows.length + ' (' + resumo.redirecionamentos + ' redirecionamentos) |',
    '| Personagens com ficha | ' + total + ' |',
    '| **Nome e obra batem (confirmados)** | **' + confirmados + ' (' + pct(confirmados, total) + ')** |',
    '| Nome bate numa obra que é equivalente à da wiki (provável) | ' + provaveis + ' (' + pct(provaveis, total) + ') |',
    '| Só o nome bate, em obra sem relação clara (muito homônimo) | ' + (achados - confirmados - provaveis) + ' (' + pct(achados - confirmados - provaveis, total) + ') |',
    '| **Não achados** | **' + (total - achados) + ' (' + pct(total - achados, total) + ')** |',
    '| Achados, mas só "fora da roleta" | ' + foraDaRoleta + ' |', '',
    '## Como foram achados (nível do nome)', '', ...Object.entries(count('nivel')).map(([k, v]) => '- ' + k + ': ' + v), '',
    '## Por roleta', '', '| Roleta | Total | Confirmados | Não achados |', '|---|---:|---:|---:|',
    ...Object.entries(roleta).sort((a, b) => b[1].total - a[1].total).map(([k, v]) => '| ' + k + ' | ' + v.total + ' | ' + v.confirmados + ' (' + pct(v.confirmados, v.total) + ') | ' + (v.total - v.achados) + ' |'), '',
    '## Por fonte nossa (onde o personagem foi achado)', '', ...Object.entries(fontes).map(([k, v]) => '- ' + k + ': ' + v), '',
    '## Séries', '', '- Séries na wiki: ' + validas.length, '- Sem nenhum personagem confirmado no nosso catálogo: ' + semNenhum.length,
    '- Com menos da metade confirmada (séries de 5+ personagens): ' + faltaMuito.length, '',
    '### Maiores séries da wiki sem nenhum personagem confirmado', '', '| Série | Personagens na wiki | Confirmados | Roleta |', '|---|---:|---:|---|', ...top(semNenhum, 50), '',
    '### Maiores séries com menos da metade confirmada', '', '| Série | Personagens na wiki | Confirmados | Roleta |', '|---|---:|---:|---|', ...top(faltaMuito, 40), ''].join(NL);
  fs.writeFileSync(path.join(outDir, 'relatorio.md'), md);
  console.log(JSON.stringify(resumo, null, 1));
  console.log('Relatório em ' + path.join(outDir, 'relatorio.md'));
}

if (require.main === module) main().catch((err) => { console.error(err); process.exitCode = 1; });
module.exports = { parseInfo, semSufixo, roletaDe };
