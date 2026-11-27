#!/usr/bin/env node
// Peso das obras de desenho pela popularidade na Wikipédia (ver tools/mudae-fontes/popularidade-obras.js).
//   node tools/mudae-popularidade-obras.js --coletar   consulta a Wikipédia e grava tools/mudae-fontes/popularidade-desenhos.json
//   node tools/mudae-popularidade-obras.js             mostra como ficaria o ranking (não grava nada)
//   node tools/mudae-popularidade-obras.js --aplicar   grava as notas novas em server/mudae-catalogo.json (com backup)
//   --expoente=0.5                                      testa outro expoente na simulação/aplicação
// Só a nota (6ª coluna) das linhas de desenho muda: ids, nomes, fotos e a marca "fora da roleta" ficam iguais.
// A montagem normal (tools/mudae-catalogo.js) aplica o mesmo peso pelo qualidade.js.
const fs = require('fs');
const path = require('path');
const { writeJson } = require('./mudae-fontes/coleta');
const { ARTIGOS, ARQUIVO, coletar, lerPopularidade, pesos, pesarDesenhos, wikiDe } = require('./mudae-fontes/popularidade-obras');

const CATALOGO = process.env.MUDAE_CATALOG || path.join(__dirname, '..', 'server', 'mudae-catalogo.json');
const CACHE = process.env.MUDAE_CACHE || path.join(__dirname, 'mudae-cache');
const REF = 15000; // as faixas de raridade são de uma fonte de 15 mil (server/mudae.js)

function resumo(rows, titulo) {
  const ativos = rows.filter((r) => r[6] === 'd' && r[7] !== 1).sort((a, b) => b[5] - a[5]);
  const lend = Math.round(100 * ativos.length / REF);
  const epico = Math.round(1000 * ativos.length / REF);
  const porObra = new Map();
  ativos.forEach((r, i) => {
    const w = wikiDe(r) || r[2];
    const o = porObra.get(w) || { lend: 0, epico: 0, melhor: i + 1 };
    if (i < lend) o.lend++; else if (i < epico) o.epico++;
    porObra.set(w, o);
  });
  console.log(`\n== ${titulo}: ${ativos.length} na roleta, ${lend} lendários, ${epico - lend} épicos`);
  console.log('Top 25: ' + ativos.slice(0, 25).map((r, i) => `${i + 1}. ${r[1]} (${r[2]})`).join(' · '));
  return porObra;
}

async function main(args = process.argv.slice(2)) {
  if (args.includes('--coletar')) {
    const dados = await coletar({ cacheDir: CACHE });
    writeJson(ARQUIVO, { ...dados, coletadoEm: new Date().toISOString() });
    const sem = Object.entries(dados.wikis).filter(([, x]) => !Number.isFinite(x.visualizacoes)).map(([w]) => w);
    console.log(`Gravado ${path.relative(process.cwd(), ARQUIVO)} (${Object.keys(dados.wikis).length} obras${sem.length ? ', sem dado: ' + sem.join(', ') : ''})`);
  }
  const popularidade = lerPopularidade();
  if (!popularidade) throw new Error('Sem ' + ARQUIVO + ': rode com --coletar primeiro');
  const exp = args.find((a) => a.startsWith('--expoente='));
  const p = pesos(popularidade, exp ? Number(exp.split('=')[1]) : undefined);

  const rows = JSON.parse(fs.readFileSync(CATALOGO, 'utf8'));
  const semArtigo = [...new Set(rows.filter((r) => r[6] === 'd').map(wikiDe).filter((w) => w && !ARTIGOS[w]))];
  if (semArtigo.length) console.log('Aviso: wikis de desenho sem artigo da Wikipédia (ficam com o peso mediano): ' + semArtigo.join(', '));
  const { rows: novas, mudaram, wikis } = pesarDesenhos(rows, p.de);
  const antes = resumo(rows, 'Antes');
  const depois = resumo(novas, 'Depois');
  console.log('\nObra                         peso   lendários (antes→depois)   épicos (antes→depois)   melhor posição');
  for (const [w, d] of [...depois].sort((a, b) => b[1].lend - a[1].lend || b[1].epico - a[1].epico)) {
    const a = antes.get(w) || { lend: 0, epico: 0, melhor: '-' };
    console.log(`${w.padEnd(28)} ${p.de(w).toFixed(2)}   ${String(a.lend).padStart(3)} → ${String(d.lend).padEnd(18)} ${String(a.epico).padStart(4)} → ${String(d.epico).padEnd(16)} ${a.melhor} → ${d.melhor}`);
  }
  console.log(`\n${mudaram} notas mudam em ${wikis} wikis de desenho.`);

  if (args.includes('--aplicar')) {
    const backup = path.join(CACHE, 'backups', 'antes-do-peso-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json');
    fs.mkdirSync(path.dirname(backup), { recursive: true });
    fs.copyFileSync(CATALOGO, backup);
    writeJson(CATALOGO, novas, true);
    console.log('Gravado ' + CATALOGO + ' (backup em ' + backup + ')');
  } else {
    console.log('Nada gravado no catálogo (use --aplicar).');
  }
}

if (require.main === module) main().catch((err) => { console.error(err.message); process.exitCode = 1; });
module.exports = { main };
