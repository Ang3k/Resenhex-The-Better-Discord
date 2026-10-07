// Revisão das fichas Fandom: páginas auxiliares não são personagens e texto longo não mede fama.
const fs = require('fs');
const path = require('path');
const { normalize, suffix } = require('./coleta');
const { realPeopleExclusions, isRealPersonRow } = require('./pessoas-reais');

const AUXILIARY = /\brelationships?\b|\bcostumes through the years\b|\bin other media\b|\bpowers and abilities\b|\bdisambiguation\b|^lists? of\b|\bcharacters$|^(?:bestiary|journal of justice|creatures|experiments|enemies|species|organizations|weapons|items|objects|abilities|the collection)$/i;
const PLAYABLE = { 'genshin-impact': 'Playable Characters', 'honkai-star-rail': 'Playable Characters', wutheringwaves: 'Playable Resonators' };

// Âncoras dos casos revisados. O restante segue o ranking da franquia, sem alterar as faixas de raridade.
const ANCHORS = {
  'genshin-impact': ['Raiden Shogun', 'Furina', 'Zhongli', 'Nahida', 'Hu Tao', 'Venti', 'Arlecchino', 'Paimon', 'Traveler', 'Diluc', 'Xiao', 'Dainsleif'],
  'honkai-star-rail': ['Kafka', 'Acheron', 'Firefly', 'March 7th', 'Dan Heng', 'Trailblazer', 'Silver Wolf', 'Himeko', 'Welt', 'Jing Yuan', 'Seele'],
  wutheringwaves: ['Rover', 'Jinhsi', 'Changli', 'Yinlin', 'Camellya', 'The Shorekeeper', 'Jiyan', 'Cartethyia'],
  leagueoflegends: ['Jinx', 'Ahri', 'Yasuo', 'Lux', 'Miss Fortune', 'Teemo', 'Akali', 'Lee Sin'],
  mortalkombat: ['Scorpion', 'Sub-Zero', 'Liu Kang', 'Raiden', 'Kitana', 'Johnny Cage', 'Sonya Blade', 'Shao Kahn'],
  avatar: ['Aang', 'Korra', 'Zuko', 'Katara', 'Toph Beifong', 'Sokka'],
  adventuretime: ['Finn', 'Jake', 'Princess Bubblegum', 'Marceline', 'Ice King', 'BMO'],
  powerpuffgirls: ['Blossom', 'Bubbles', 'Buttercup', 'Mojo Jojo', 'Professor Utonium', 'Him'],
  disney: ['Mickey Mouse', 'Donald Duck', 'Elsa', 'Simba', 'Aladdin', 'Belle', 'Fa Mulan', 'Cinderella', 'Snow White', 'Minnie Mouse', 'Goofy', 'Stitch'],
  pixar: ['Woody', 'Buzz Lightyear', 'Lightning McQueen', 'Nemo', 'Dory', 'Sulley', 'Mike Wazowski', 'WALL-E', 'EVE', 'Mr. Incredible'],
  dreamworks: ['Shrek', 'Donkey', 'Princess Fiona', 'Puss in Boots', 'Po', 'Toothless', 'Hiccup', 'Megamind', 'Alex'],
};

function wikiOf(row) {
  const match = String(row[0]).match(/^[gd]-(.+)-\d+$/);
  return match?.[1];
}

function isAuxiliaryTitle(title) { return AUXILIARY.test(String(title)); }
function isAuxiliaryRow(row) { return Boolean(wikiOf(row)) && isAuxiliaryTitle(row[1]); }

function playableIds(cacheDir, wiki) {
  const ids = new Set();
  if (!cacheDir) return ids;
  let continuation = {};
  do {
    const params = { action: 'query', generator: 'categorymembers', gcmtitle: 'Category:' + PLAYABLE[wiki], gcmlimit: '500', gcmnamespace: '0', prop: 'info', ...continuation };
    const key = wiki + ':' + JSON.stringify(params);
    const file = path.join(cacheDir, 'consultas', 'jogos-fandom', suffix(key) + '.json');
    if (!fs.existsSync(file)) return null; // Sem evidência completa, não rebaixa personagens por ausência.
    const cached = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (cached.key !== key || cached.data.error) return null;
    for (const page of cached.data.query?.pages || []) ids.add(String(page.pageid));
    continuation = cached.data.continue;
  } while (continuation);
  return ids;
}

function correctCatalog(input, { cacheDir, priorityIdsByWiki, excludedPeopleById = realPeopleExclusions(cacheDir) } = {}) {
  const removed = input.filter(isAuxiliaryRow);
  const removedRealPeople = input.filter((row) => !isAuxiliaryRow(row) && isRealPersonRow(row, excludedPeopleById));
  const rows = input.filter((row) => !isAuxiliaryRow(row) && !isRealPersonRow(row, excludedPeopleById));
  const groups = new Map();
  for (const row of rows) {
    if (!['g', 'd'].includes(row[6])) continue;
    const wiki = wikiOf(row);
    const key = row[6] + ':' + (wiki || 'native');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  const updates = new Map();
  const demoted = [];
  const priorityEvidence = {};
  for (const [key, group] of groups) {
    const wiki = key.slice(2);
    const ids = PLAYABLE[wiki] ? (priorityIdsByWiki?.get(wiki) ?? playableIds(cacheDir, wiki)) : null;
    if (ids?.size) priorityEvidence[wiki] = ids.size;
    const pageId = (row) => String(row[0]).split('-').at(-1);
    // Só uma versão por nome recebe a promoção; páginas alternativas mantêm sua posição própria.
    const best = new Map();
    for (const row of [...group].sort((a, b) => b[5] - a[5])) {
      const name = normalize(row[1]);
      if (!best.has(name)) best.set(name, String(row[0]));
    }
    const anchor = new Map((ANCHORS[wiki] || []).map((name, i) => [normalize(name), i]));
    const anchorOrder = (row) => best.get(normalize(row[1])) === String(row[0]) ? (anchor.get(normalize(row[1])) ?? Infinity) : Infinity;
    const background = (row) => ids?.size && !ids.has(pageId(row)) && !Number.isFinite(anchorOrder(row));
    group.sort((a, b) => Number(background(a)) - Number(background(b))
      || (Number.isFinite(anchorOrder(a)) || Number.isFinite(anchorOrder(b)) ? anchorOrder(a) - anchorOrder(b) : 0)
      || (ids?.size ? Number(ids.has(pageId(b))) - Number(ids.has(pageId(a))) : 0)
      || b[5] - a[5]);
    group.forEach((row, i) => {
      const score = background(row) ? 0 : Math.round(1e6 / (i + 1));
      updates.set(String(row[0]), [...row.slice(0, 5), score, row[6]]);
      if (background(row)) demoted.push(String(row[0]));
    });
  }
  return { rows: rows.map((row) => updates.get(String(row[0])) || row), report: {
    before: input.length, after: rows.length, removed: removed.map((r) => ({ id: r[0], name: r[1], source: r[6] })),
    removedRealPeople: removedRealPeople.map((r) => ({ id: r[0], name: r[1], source: r[6], reason: excludedPeopleById.get(String(r[0])).reason })),
    priorityEvidence, backgroundIds: demoted, method: 'Remove páginas auxiliares e biografias confirmadas de pessoas reais; promove âncoras revisadas e jogáveis; páginas restantes dos três gachas recebem score 0, sem excluir seus IDs.' } };
}

module.exports = { correctCatalog, isAuxiliaryTitle, isAuxiliaryRow };
