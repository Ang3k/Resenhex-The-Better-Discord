#!/usr/bin/env node
// Junta o catálogo publicado com os protótipos de coleta (AniList completo, VNDB, Fandom expandido) num catálogo CANDIDATO.
// NÃO escreve em server/mudae-catalogo.json: a saída vai para tools/mudae-cache/prototipos/ para ser conferida antes de publicar.
// Regras (as mesmas do tools/mudae-catalogo.js):
//   - ids já publicados nunca mudam nem saem: a linha publicada vence (inclusive a marca "fora da roleta");
//   - dedupe por nome normalizado + obra (homônimos de obras diferentes ficam), a fonte mais antiga vence;
//   - exceção de popularidade: se o publicado é de jogo da IGDB (id g<número>) e o Fandom tem o mesmo personagem com popularidade
//     MAIOR, a linha publicada fica (id, foto, nome) e só a popularidade sobe (a nota da IGDB é achatada: Kratos 47 mil x 1 milhão);
//   - as linhas novas passam pela limpeza (limpeza.js) para receber a marca "fora da roleta" (8ª coluna).
// Uso: node tools/mudae-montar-expandido.js [--sem-limpeza]
// Saída: catalogo-expandido.json (um personagem por linha), catalogo-expandido-meta.ndjson (id -> adulto, tipo, país…) e
//        catalogo-expandido-relatorio.json.
const fs = require('fs');
const path = require('path');
const { normalize, validateRows, writeJson } = require('./mudae-fontes/coleta');
const { marcarForaDaRoleta, lerFichas } = require('./mudae-fontes/limpeza');
const { marcarFiguracao } = require('./mudae-fontes/importancia');

const CACHE = process.env.MUDAE_CACHE || path.join(__dirname, 'mudae-cache');
const PUBLICADO = process.env.MUDAE_CATALOG || path.join(__dirname, '..', 'server', 'mudae-catalogo.json');
const PROTO = path.join(CACHE, 'prototipos');
const readJson = (f) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null);
const readNdjson = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
const identity = (r) => normalize(r[1]) + '|' + normalize(r[2]);

function carregarNovas() {
  const fontes = [
    ['anilist-completo', readNdjson(path.join(CACHE, 'anilist-completo', 'linhas.ndjson'))],
    ...['desenhos', 'quadrinhos', 'series', 'jogos'].map((g) => ['fandom-' + g, readJson(path.join(PROTO, 'fandom-' + g + '.json')) || readJson(path.join(PROTO, 'fandom-' + g + '.parcial.json')) || []]),
    ['vndb', readJson(path.join(PROTO, 'maximo', 'vndb.json')) || []],
  ];
  return fontes;
}

function main(args = process.argv.slice(2)) {
  const publicado = readJson(PUBLICADO);
  if (!publicado) throw new Error('Catálogo publicado não encontrado: ' + PUBLICADO);
  const ids = new Set(publicado.map((r) => String(r[0])));
  const identidades = new Set(publicado.map(identity));
  const novas = [];
  // Linhas publicadas da IGDB cuja popularidade sobe para a do Fandom (só o 6º campo muda; o id nunca).
  const porIdentidade = new Map(publicado.map((r) => [identity(r), r]));
  const subidas = new Map();
  const porFonte = {};
  for (const [nome, rows] of carregarNovas()) {
    const c = { lidas: rows.length, aceitas: 0, idJaPublicado: 0, duplicadas: 0 };
    for (const r of rows) {
      const row = r.slice(0, 7);
      if (ids.has(String(row[0]))) { c.idJaPublicado++; continue; }
      const key = identity(row);
      if (identidades.has(key)) {
        c.duplicadas++;
        const pub = porIdentidade.get(key);
        if (pub && row[6] === 'g' && pub[6] === 'g' && /^g\d+$/.test(String(pub[0])) && Number(row[5]) > Number(pub[5]) && Number(row[5]) > (subidas.get(String(pub[0])) || 0)) subidas.set(String(pub[0]), Number(row[5]));
        continue;
      }
      ids.add(String(row[0]));
      identidades.add(key);
      novas.push(row);
      c.aceitas++;
    }
    porFonte[nome] = c;
  }
  // Cada letra de fonte valida sozinha (7 colunas, id único, gênero válido).
  for (const letter of ['a', 'g', 'c', 'd', 's', 'v']) validateRows(novas.filter((r) => r[6] === letter), letter);

  let marcadas = novas;
  let limpeza = null;
  if (!args.includes('--sem-limpeza')) {
    const r = marcarForaDaRoleta(novas, { cacheDir: CACHE, fichas: lerFichas(CACHE), episodios: {} });
    marcadas = r.rows;
    limpeza = r.report;
  }
  // Figurantes (terciários, aparições de um episódio): só nas linhas novas; o publicado não muda. --sem-importancia desliga.
  let importancia = null;
  if (!args.includes('--sem-importancia')) {
    const r = marcarFiguracao(marcadas);
    marcadas = r.rows;
    importancia = r.report;
  }
  const publicadoFinal = publicado.map((r) => (subidas.has(String(r[0])) ? [...r.slice(0, 5), subidas.get(String(r[0])), ...r.slice(6)] : r));
  // Protagonistas por obra (protagonistas.json): a nota do Fandom é o tamanho do artigo e põe o Zote acima da Hornet.
  // A obra é reordenada: os da lista primeiro, depois o resto na ordem de antes, reaproveitando as MESMAS notas da obra
  // (1.000.000, 500.000, 333.333…). Assim nenhuma obra passa a ter notas mais altas que as outras, só a ordem muda.
  const protagonistas = readJson(path.join(__dirname, 'mudae-fontes', 'protagonistas.json')) || {};
  const naoAchados = [];
  let protagonistasAplicados = 0;
  for (const [obra, nomes] of Object.entries(protagonistas)) {
    if (obra.startsWith('_')) continue;
    const daObra = [...publicadoFinal, ...marcadas].filter((r) => r[6] === 'g' && r[2] === obra); // inclui jogos publicados da IGDB (só a nota muda)
    const lista = [];
    for (const nome of nomes) {
      const alvo = daObra.find((r) => identity(r) === normalize(nome) + '|' + normalize(obra));
      if (alvo && !lista.includes(alvo)) lista.push(alvo); else if (!alvo) naoAchados.push(obra + ': ' + nome);
    }
    const resto = daObra.filter((r) => !lista.includes(r)).sort((a, b) => b[5] - a[5]);
    const notas = daObra.map((r) => r[5]).sort((a, b) => b - a);
    [...lista, ...resto].forEach((r, i) => { r[5] = notas[i]; });
    protagonistasAplicados += lista.length;
  }
  const todas = [...publicadoFinal, ...marcadas];
  // Trava: quem já casou guarda só o id. Se um id publicado sumisse, a carta ficaria escondida no perfil. Nunca acontece sem erro.
  const nosIds = new Set(todas.map((r) => String(r[0])));
  const perdidos = publicado.filter((r) => !nosIds.has(String(r[0])));
  if (perdidos.length) throw new Error('O candidato perdeu ' + perdidos.length + ' ids publicados (ex.: ' + perdidos.slice(0, 3).map((r) => r[0]).join(', ') + '). Nada foi gravado.');
  writeJson(path.join(PROTO, 'catalogo-expandido.json'), todas, true);

  // Metadados de quem pode precisar de filtro por canal: +18, tipo da obra e país de origem (manhwa = KR, manhua = CN).
  const meta = [];
  for (const e of readNdjson(path.join(CACHE, 'anilist-completo', 'extras.ndjson'))) if (!ids.has(String(e.id)) || true) meta.push({ id: String(e.id), adulto: e.adulto, tipo: e.tipo, pais: e.pais, formato: e.formato });
  for (const e of readNdjson(path.join(PROTO, 'maximo', 'vndb-extras.ndjson'))) meta.push({ id: e.id, adulto: e.adulto, sexual: e.sexual, violencia: e.violencia, tipo: 'VN' });
  fs.writeFileSync(path.join(PROTO, 'catalogo-expandido-meta.ndjson'), meta.map((m) => JSON.stringify(m)).join('\n') + '\n');

  const contar = (rows) => {
    const o = {};
    for (const r of rows) { const k = r[6] || 'a'; (o[k] ||= { total: 0, ativos: 0 }); o[k].total++; if (r[7] !== 1) o[k].ativos++; }
    return o;
  };
  const obras = (rows) => new Set(rows.map((r) => r[2])).size;
  const novasIds = new Set(marcadas.map((r) => String(r[0])));
  const metaNova = meta.filter((m) => novasIds.has(m.id));
  const relatorio = {
    geradoEm: new Date().toISOString(),
    antes: { total: publicado.length, obras: obras(publicado), porFonte: contar(publicado) },
    depois: { total: todas.length, obras: obras(todas), porFonte: contar(todas), ativos: todas.filter((r) => r[7] !== 1).length },
    novas: { total: marcadas.length, ativas: marcadas.filter((r) => r[7] !== 1).length, foraDaRoleta: marcadas.filter((r) => r[7] === 1).length, obrasNovas: obras(marcadas.filter((r) => r[7] !== 1)) },
    popularidadeSubiuDaIgdb: subidas.size,
    protagonistas: { aplicados: protagonistasAplicados, naoAchados },
    porFonteDeColeta: porFonte,
    limpezaDasNovas: limpeza,
    importanciaDasNovas: importancia,
    conteudo: {
      adultasNasNovas: metaNova.filter((m) => m.adulto).length,
      manhwa: metaNova.filter((m) => m.pais === 'KR').length, manhua: metaNova.filter((m) => m.pais === 'CN' || m.pais === 'TW').length,
      mangaOuNovel: metaNova.filter((m) => m.tipo === 'MANGA').length, anime: metaNova.filter((m) => m.tipo === 'ANIME').length,
    },
  };
  writeJson(path.join(PROTO, 'catalogo-expandido-relatorio.json'), relatorio);
  console.log(JSON.stringify({ ...relatorio, antes: { ...relatorio.antes, porFonte: undefined }, depois: { ...relatorio.depois, porFonte: undefined }, limpezaDasNovas: limpeza && { ...limpeza, motivos: undefined } }, null, 1));
  console.log('Candidato em ' + path.join(PROTO, 'catalogo-expandido.json'));
  return relatorio;
}

if (require.main === module) { try { main(); } catch (err) { console.error(err.message); process.exitCode = 1; } }
module.exports = { main };
