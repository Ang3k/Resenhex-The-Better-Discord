// Tira da roleta os personagens "figurantes": terciários, amigos do secundário, aparições de um episódio.
// Complementa a limpeza.js (que olha o TIPO da página: lugar, item, "Cop 2"); aqui se mede a IMPORTÂNCIA dentro da obra.
// Sinais usados (todos já estão no catálogo): o score (popularidade da fonte) e a posição do personagem na própria obra.
// Calibrado com os personagens que a wiki do Mudae lista de verdade (tools/mudae-comparar-wiki.js): ver REGRAS e o teste.
// Quem sai ganha 1 na 8ª coluna ("fora da roleta"), como na limpeza: nenhum id some.
const { normalize } = require('./coleta');

// Por fonte: { min } score mínimo absoluto; { piso } quantos de cada obra ficam sempre; { pct } fatia da obra que fica
// (de cima para baixo); { teto } máximo de uma obra; { rel } fração do score do líder abaixo da qual cai.
// Um personagem sai se estiver FORA do "piso" E (abaixo do mínimo OU fora da fatia OU abaixo da fração do líder).
const REGRAS = {
  a: { piso: 8, min: 3, pct: 1, teto: 120 },                // AniList: score = favoritos. Calibrado: perde 3,3% do gabarito da wiki
  v: { piso: 6, min: 5, pct: 0.5, teto: 80 },               // VNDB: papel x votos (sem gabarito: regra prudente)
  d: { piso: 40, min: 0, pct: 0.5, teto: 1500 },            // desenhos (Fandom): o score é o tamanho do artigo
  g: { piso: 40, min: 0, pct: 1, teto: 2500 },              // jogos: perde 2,5% do gabarito
  c: { piso: 60, min: 0, pct: 1, teto: 8000 },              // quadrinhos: Marvel/DC são uma obra só, o teto é largo (perde 4,9%)
  s: { piso: 20, min: 0, pct: 1, teto: 600 },               // séries de TV
};

// Páginas das wikis que falam de um TIPO ou de um GRUPO, não de um personagem: "Monster", "Doom's protagonists",
// "MAP31: Wolfenstein", "Slimes", "Blacklight Animatronics". Só vale para as fontes de wiki (d g c s): no AniList
// e no VNDB um personagem pode se chamar "Monster". Vale mesmo para o elenco principal da obra.
const GENERICO = /^(?:monsters?|bosse?s?|soldiers?|marines?|spirits|players?|runes|companions|agents|characters|enemies|humans|demons|slimes|conduits|npcs?|villagers|animatronics|robots?|ghosts|former humans|old ones|the possessed|unknown|unnamed|other|others|misc(?:ellaneous)?)$/i;
const NOME_DE_TIPO = /(?:^|\s)(?:protagonists|antagonists|companions|enemies|monsters|characters|agents|animatronics|slimes|bots)$/i;
const FASE = /^(?:map|e\dm|level|stage|episode|season|chapter)\s*\d+[a-z]?\s*[:-]/i;
const FONTES_DE_WIKI = new Set(['d', 'g', 'c', 's']);
function nomeGenerico(r) {
  if (!FONTES_DE_WIKI.has(r[6])) return false;
  const nome = String(r[1] || '').trim();
  const semMarca = nome.replace(/\s*\([^)]*\)\s*$/, '');
  return GENERICO.test(semMarca) || NOME_DE_TIPO.test(semMarca) || FASE.test(semMarca)
    || /^(?:season|series|volume|vol\.?)\s*\d+/i.test(semMarca) || /\bgang$/i.test(semMarca);
}

function classificar(rows, regras = REGRAS) {
  const grupos = new Map();
  rows.forEach((r, i) => { const k = (r[6] || 'a') + '|' + normalize(r[2]); (grupos.get(k) || grupos.set(k, []).get(k)).push(i); });
  const motivo = new Array(rows.length).fill(null);
  rows.forEach((r, i) => { if (nomeGenerico(r)) motivo[i] = 'nome-generico'; });
  for (const [k, idx] of grupos) {
    const f = k[0];
    const g = regras[f];
    if (!g) continue;
    idx.sort((x, y) => (rows[y][5] - rows[x][5]) || (String(rows[x][0]) < String(rows[y][0]) ? -1 : 1));
    const n = idx.length;
    const lider = rows[idx[0]][5];
    const ficam = Math.max(g.piso, Math.ceil(n * g.pct));
    idx.forEach((i, pos) => {
      if (motivo[i]) return;
      if (pos < g.piso) return;
      const sc = rows[i][5];
      if (sc < g.min) motivo[i] = 'score-baixo';
      else if (pos >= Math.min(ficam, g.teto)) motivo[i] = pos >= g.teto ? 'alem-do-teto' : 'cauda-da-obra';
      else if (g.rel && lider > 0 && sc / lider < g.rel) motivo[i] = 'minusculo-perto-do-lider';
    });
  }
  return motivo;
}

// Devolve as linhas com 1 na 8ª coluna para os figurantes (nunca desmarca quem já estava fora) e um resumo por motivo.
function marcarFiguracao(rows, regras = REGRAS) {
  const motivo = classificar(rows, regras);
  const motivos = {};
  let novos = 0;
  const saida = rows.map((r, i) => {
    if (!motivo[i]) return r;
    motivos[motivo[i]] = (motivos[motivo[i]] || 0) + 1;
    if (r[7] === 1) return r;
    novos++;
    return [...r.slice(0, 7), 1];
  });
  return { rows: saida, report: { marcadosAgora: novos, motivos } };
}

module.exports = { REGRAS, classificar, marcarFiguracao, nomeGenerico };
