// Mudae: flags de filtro e ordem para as listas ($mm, $top, $fn...). Um parser só, como no Mudae do Discord
// (wiki: Flags), mais as palavras em português que o $top já aceitava.
//
// Gênero e fonte se combinam ("w anime", "husbandos jogos"); a ordem escolhe como a lista sai ("abc", "obra",
// "recentes", "valor", "inverso"). O que sobrar é texto livre (o nome de uma obra, por exemplo).

// Palavras do $top: gênero e fonte se combinam ("$top waifus anime"); qualquer outra coisa é o nome de uma obra.
// "Outros" são os sem gênero no catálogo (bichos e robôs, mas também gente cujo gênero a fonte não diz).
const FILTER_WORDS = {
  F: 'w waifu waifus mulher mulheres', M: 'h husbando husbandos homem homens', O: 'o outro outros',
  a: 'a anime animes manga', g: 'g jogo jogos game games', c: 'c quadrinho quadrinhos hq hqs comic comics', d: 'd desenho desenhos cartoon cartoons', s: 's serie series tv', v: 'v vn vns',
};
const FILTER_OF = new Map(Object.entries(FILTER_WORDS).flatMap(([k, words]) => words.split(' ').map((w) => [w, k])));
const GENDERS = new Set(['F', 'M', 'O']);

// Como a lista se ordena. "valor" é o padrão da lista e "r" é o nome do original (ranking).
const ORDER_WORDS = {
  name: 'abc az alfabetica nome', series: 'obra obras', recent: 'recente recentes novos', value: 'valor r rank ranking', note: 'nota notas',
};
const ORDER_OF = new Map(Object.entries(ORDER_WORDS).flatMap(([k, words]) => words.split(' ').map((w) => [w, k])));
const REVERSE_WORDS = new Set(['reverse', 'inverso', 'inversa', 'invertido']);

const fold = (s) => String(s || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

// Lê as flags de um texto. Devolve { gender, source, order, reverse, rest } (campos vazios quando não vieram).
// "g-" é o "só animanga" do original (aqui, anime). Só a primeira ordem e o primeiro filtro de cada tipo valem.
function parseFlags(text) {
  const out = { gender: '', source: '', order: '', reverse: false, rest: '' };
  const rest = [];
  for (const raw of fold(text).split(/\s+/).filter(Boolean)) {
    const word = raw === 'g-' ? 'anime' : raw.replace(/[^\p{L}\p{N}]+/gu, '');
    const filter = FILTER_OF.get(word);
    if (filter && GENDERS.has(filter) && !out.gender) out.gender = filter;
    else if (filter && !GENDERS.has(filter) && !out.source) out.source = filter;
    else if (ORDER_OF.has(word) && !out.order) out.order = ORDER_OF.get(word);
    else if (REVERSE_WORDS.has(word)) out.reverse = true;
    else rest.push(raw);
  }
  out.rest = rest.join(' ');
  return out;
}

const hasFilter = (f) => !!(f.gender || f.source || f.rest);

module.exports = { FILTER_WORDS, FILTER_OF, parseFlags, hasFilter };
