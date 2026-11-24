// PROTÓTIPO: mais wikis do Fandom (desenhos, jogos e quadrinhos) além das que o fandom.js já traz. Cada wiki foi sondada antes
// (existe, tem categoria de personagens e quantas páginas). Reaproveita o coletor do fandom.js, com os mesmos filtros de
// páginas auxiliares, de biografias de pessoas reais, de foto-padrão e de ficha de episódio.
// Não escreve no catálogo publicado nem nos caches das outras fontes: a saída vai para tools/mudae-cache/prototipos/fandom-<grupo>.json.
//
// Uso: node tools/mudae-fontes/fandom-expandido.js [desenhos] [jogos] [quadrinhos] [series] [--refazer] [--do-zero]
//      (sem grupo, roda todos; continua de onde parou por padrão, ver CHECKPOINT abaixo)
//
// Campos de cada wiki: wiki (subdomínio em fandom.com), series (a obra que aparece na carta), category (categoria extra além de
// "Characters"; string ou lista), maxPages (teto de páginas: ficam as de artigo mais longo, que são as mais importantes).
const fs = require('fs');
const path = require('path');
const { fandom } = require('./fandom');
const { createCollection, validateRows, writeJson } = require('./coleta');

const DESENHOS = [
  { wiki: 'scoobydoo', series: 'Scooby-Doo' },
  { wiki: 'invincible', series: 'Invincible' },
  { wiki: 'arcane', series: 'Arcane' },
  { wiki: 'gargoyles', series: 'Gargoyles' },
  { wiki: 'batmantheanimatedseries', series: 'Batman: A Série Animada' },
  { wiki: 'tmnt', series: 'As Tartarugas Ninja' },
  { wiki: 'transformers', series: 'Transformers' },
  { wiki: 'heman', series: 'He-Man e os Defensores do Universo' },
  { wiki: 'samuraijack', series: 'Samurai Jack' },
  { wiki: 'dexterslab', series: 'O Laboratório de Dexter' },
  { wiki: 'johnnybravo', series: 'Johnny Bravo' },
  { wiki: 'courage', series: 'Coragem, o Cão Covarde' },
  { wiki: 'amphibia', series: 'Amphibia' },
  { wiki: 'bluey', series: 'Bluey' },
  { wiki: 'peppapig', series: 'Peppa Pig' },
  { wiki: 'pawpatrol', series: 'Patrulha Canina' },
  { wiki: 'miraculousladybug', series: 'Miraculous: As Aventuras de Ladybug' },
  { wiki: 'winx', series: 'Clube das Winx' },
  { wiki: 'witch', series: 'W.I.T.C.H.' },
  { wiki: 'trollhunters', series: 'Caçadores de Trolls' },
  { wiki: 'voltron', series: 'Voltron' },
  { wiki: 'starvstheforcesofevil', series: 'Star vs. As Forças do Mal' },
  { wiki: 'hilda', series: 'Hilda' },
  { wiki: 'primal', series: 'Primal' },
  { wiki: 'helluvaboss', series: 'Helluva Boss' },
  { wiki: 'bojackhorseman', series: 'BoJack Horseman' },
  { wiki: 'archer', series: 'Archer' },
  { wiki: 'bobsburgers', series: 'Bob\'s Burgers' },
  { wiki: 'kingofthehill', series: 'Rei do Pedaço' },
  { wiki: 'americandad', series: 'American Dad!' },
  { wiki: 'daria', series: 'Daria' },
  { wiki: 'beavisandbutthead', series: 'Beavis e Butt-Head' },
  { wiki: 'rugrats', series: 'Rugrats' },
  { wiki: 'heyarnold', series: 'Ei, Arnold!' },
  { wiki: 'recess', series: 'Recess' },
  { wiki: 'fairlyoddparents', series: 'Os Padrinhos Mágicos' },
  { wiki: 'jimmyneutron', series: 'Jimmy Neutron' },
  { wiki: 'renandstimpy', series: 'Ren & Stimpy' },
  { wiki: 'animaniacs', series: 'Animaniacs' },
  { wiki: 'tinytoons', series: 'Tiny Toon Adventures' },
  { wiki: 'ducktales', series: 'DuckTales' },
  { wiki: 'darkwingduck', series: 'Darkwing Duck' },
  { wiki: 'flintstones', series: 'Os Flintstones' },
  { wiki: 'tomandjerry', series: 'Tom e Jerry' },
  { wiki: 'popeye', series: 'Popeye' },
  { wiki: 'shaunthesheep', series: 'Shaun, o Carneiro' },
  { wiki: 'kungfupanda', series: 'Kung Fu Panda' },
  { wiki: 'madagascar', series: 'Madagascar' },
];

const QUADRINHOS = [
  { wiki: 'marvel', series: 'Marvel', maxPages: 30000 },
  { wiki: 'dc', series: 'DC Comics', maxPages: 15000 },
  { wiki: 'spiderman', series: 'Homem-Aranha' },
];

const JOGOS = [
  { wiki: 'castlevania', series: 'Castlevania', category: ['Playable Characters'] },
  { wiki: 'pokemon', series: 'Pokémon', category: ['Male characters', 'Female characters', 'Main characters', 'Playable characters'], maxPages: 5000 },
  { wiki: 'touhou', series: 'Touhou Project' },
  { wiki: 'fireemblem', series: 'Fire Emblem', category: ['Playable Characters'] },
  { wiki: 'azurlane', series: 'Azur Lane', category: ['Ships'] },
  { wiki: 'fategrandorder', series: 'Fate/Grand Order', category: ['Servants', '5-Star Servants', '4-Star Servants', '3-Star Servants', '2-Star Servants', '1-Star Servants', '0-Star Servants'] },
  { wiki: 'bluearchive', series: 'Blue Archive', category: ['Students', 'NPC'] },
  { wiki: 'arknights', series: 'Arknights', category: ['Operator', 'NPCs'] },
  { wiki: 'honkaiimpact3', series: 'Honkai Impact 3rd', category: ['Playable Characters'] },
  { wiki: 'umamusume', series: 'Uma Musume: Pretty Derby' },
  { wiki: 'granbluefantasy', series: 'Granblue Fantasy' },
  { wiki: 'dragonquest', series: 'Dragon Quest', category: ['Heroes', 'Male characters', 'Female characters'], maxPages: 4000 },
  { wiki: 'kirby', series: 'Kirby' },
  { wiki: 'supersmashbros', series: 'Super Smash Bros.', category: ['Playable Characters'] },
  { wiki: 'metroid', series: 'Metroid' },
  { wiki: 'splatoon', series: 'Splatoon' },
  { wiki: 'animalcrossing', series: 'Animal Crossing' },
  { wiki: 'fortnite', series: 'Fortnite', category: ['Heroes'] },
  { wiki: 'valorant', series: 'Valorant', category: ['Agents', 'Scrapped Agents'] },
  { wiki: 'ultrakill', series: 'ULTRAKILL', category: ['Characters', 'Bosses', 'Unique Bosses', 'Angels', 'Demons', 'Machines', 'Supreme Enemies', 'Prime Enemies'] },
  { wiki: 'slimerancher', series: 'Slime Rancher', category: ['Characters', 'NPC', 'Slimes in Slime Rancher', 'Slimes in Slime Rancher 2'] },
  { wiki: 'infamous', series: 'inFAMOUS', category: ['Characters in Infamous', 'Characters in Infamous 2', 'Characters in Infamous: Second Son', 'Characters in Infamous: First Light', 'Characters in Festival of Blood', 'Bosses'] },
  { wiki: 'davethediver', series: 'Dave the Diver', category: ['Characters', 'Sea People'] },
  { wiki: 'outerwilds', series: 'Outer Wilds', category: ['Characters'] },
  { wiki: 'doom', series: 'Doom', maxPages: 220, category: ['Characters', 'Doom Eternal characters', 'Doom (2016) characters', 'Doom: The Dark Ages characters', 'Doom movie characters', 'Doom 3 characters', 'Boss monsters'] },
  { wiki: 'baldursgate', series: "Baldur's Gate 3", category: ['Companions (BG3)', 'Origin characters (BG3)', 'Humans (BG3)'] },
  { wiki: 'baldursgate', series: "Baldur's Gate", category: ['Companions', 'Temporary companions', 'Characters from affiliated media'] },
  { wiki: 'danganronpa', series: 'Danganronpa', category: ['Playable Characters'] },
  { wiki: 'aceattorney', series: 'Ace Attorney' },
  { wiki: 'bayonetta', series: 'Bayonetta', category: ['Playable Characters'] },
  { wiki: 'devilmaycry', series: 'Devil May Cry' },
  { wiki: 'metalgear', series: 'Metal Gear' },
  { wiki: 'fallout', series: 'Fallout', maxPages: 8000 },
  { wiki: 'elderscrolls', series: 'The Elder Scrolls', category: ['Lore: Characters'], maxPages: 8000 },
  { wiki: 'witcher', series: 'The Witcher' },
  { wiki: 'dragonage', series: 'Dragon Age' },
  { wiki: 'borderlands', series: 'Borderlands' },
  { wiki: 'bioshock', series: 'BioShock' },
  { wiki: 'hades', series: 'Hades' },
  { wiki: 'stardewvalley', series: 'Stardew Valley', category: ['Villagers'] },
  { wiki: 'monsterhunter', series: 'Monster Hunter' },
  { wiki: 'doki-doki-literature-club', series: 'Doki Doki Literature Club!' },
  { wiki: 'yandere-simulator', series: 'Yandere Simulator' },
  { wiki: 'nier', series: 'NieR' },
  { wiki: 'idolmaster', series: 'THE IDOLM@STER' },
  { wiki: 'bandori', series: 'BanG Dream!' },
  { wiki: 'projectsekai', series: 'Project SEKAI' },
  { wiki: 'crashbandicoot', series: 'Crash Bandicoot', category: ['Playable Characters'] },
  { wiki: 'spyro', series: 'Spyro' },
  { wiki: 'ratchet-and-clank', series: 'Ratchet & Clank' },
  { wiki: 'godofwar', series: 'God of War' },
  { wiki: 'diablo', series: 'Diablo' },
  { wiki: 'minecraft', series: 'Minecraft' },
  { wiki: 'hollowknight', series: 'Hollow Knight', category: ['NPCs (Hollow Knight)', 'Bosses (Hollow Knight)'], paginas: ['Knight'] },
  { wiki: 'hollowknight', series: 'Hollow Knight: Silksong', category: ['NPCs (Silksong)', 'Bosses (Silksong)'], paginas: ['Hornet (Silksong)'] },
  { wiki: 'freddy-fazbears-pizza', series: "Five Nights at Freddy's", maxPages: 700, category: ['Core FNaF Series: Characters', 'Core FNaF Series: Bots', 'Core Series: Animatronics', 'Film Series: Characters', 'Film Series: Bots', 'FNaF SB: Characters', 'FNaF SB: Bots', 'FNaF SL: Characters', 'FNaF SL: Bots', 'FNaF ItP: Characters', 'FNaF SD: Characters'] },
  { wiki: 'zenless-zone-zero', series: 'Zenless Zone Zero', category: ['Agents'] },
  { wiki: 'brawlstars', series: 'Brawl Stars', category: ['Brawlers'] },
];

const SERIES = [
  { wiki: 'lotr', series: 'O Senhor dos Anéis', maxPages: 6000 },
  { wiki: 'harrypotter', series: 'Harry Potter', category: ['Individuals'], maxPages: 6000 },
  { wiki: 'starwars', series: 'Star Wars', category: ['Individuals'], maxPages: 15000 },
];

// Jogos descobertos sozinhos pelo tools/mudae-descobrir-jogos.js (Wikidata + categorias da própria wiki). Sem o arquivo, a lista manual basta.
function lerDescobertos() {
  try {
    const cache = process.env.MUDAE_CACHE || path.join(__dirname, '..', 'mudae-cache');
    return JSON.parse(fs.readFileSync(path.join(cache, 'prototipos', 'jogos-descobertos.json'), 'utf8'))
      .filter((j) => j && j.wiki && j.series && Array.isArray(j.category) && j.category.length)
      .map(({ wiki, series, category, maxPages }) => ({ wiki, series, category, maxPages }));
  } catch { return []; }
}
const manuais = new Set(JOGOS.map((f) => f.wiki));
const JOGOS_DESCOBERTOS = lerDescobertos().filter((f) => !manuais.has(f.wiki));

const GRUPOS = {
  desenhos: { franchises: DESENHOS, letter: 'd', label: 'desenhos-extra' },
  quadrinhos: { franchises: QUADRINHOS, letter: 'c', label: 'quadrinhos-extra' },
  jogos: { franchises: [...JOGOS, ...JOGOS_DESCOBERTOS], letter: 'g', label: 'jogos-extra' },
  series: { franchises: SERIES, letter: 's', label: 'series-extra' },
};

// Erros que não adiantam tentar de novo (a wiki não tem a categoria): não impedem o grupo de ser dado como pronto.
const PERMANENTE = /Categoria sem fichas utilizáveis/;

// CHECKPOINT: cada pedido à Fandom é guardado em disco (consultas/<grupo>-fandom/) e, por padrão, reaproveitado numa nova
// execução, então uma queda de luz ou de internet só refaz o pedido que estava em andamento. Um grupo só vira
// fandom-<grupo>.json quando NENHUMA wiki falhou por rede; com falha vira fandom-<grupo>.parcial.json e o programa sai com código 1
// (rodar de novo completa só o que faltou). Grupos já prontos são pulados (--refazer força, --do-zero ignora o cache).
async function main(args = process.argv.slice(2)) {
  const asked = args.filter((a) => !a.startsWith('--'));
  for (const g of asked) if (!GRUPOS[g]) throw new Error('Grupo desconhecido: ' + g + ' (use ' + Object.keys(GRUPOS).join(', ') + ')');
  const out = path.join(process.env.MUDAE_CACHE || path.join(__dirname, '..', 'mudae-cache'), 'prototipos');
  fs.mkdirSync(out, { recursive: true });
  const resume = !args.includes('--do-zero');
  const refazer = args.includes('--refazer');
  const resumo = {};
  let incompleto = false;
  for (const name of asked.length ? asked : Object.keys(GRUPOS)) {
    const { franchises, letter, label } = GRUPOS[name];
    const final = path.join(out, 'fandom-' + name + '.json');
    const parcial = path.join(out, 'fandom-' + name + '.parcial.json');
    if (!refazer && fs.existsSync(final)) { console.log('== ' + name + ': já pronto (use --refazer para refazer)'); continue; }
    console.log('== ' + name + ': ' + franchises.length + ' wikis' + (resume ? ' (reaproveitando consultas já feitas)' : ''));
    const collection = createCollection(label + '-fandom', { resume });
    const rows = await fandom({ franchises, letter, label, previous: [], collection });
    validateRows(rows, letter);
    const transitorios = collection.report.errors.filter((e) => !PERMANENTE.test(e.message));
    const porObra = {};
    for (const r of rows) porObra[r[2]] = (porObra[r[2]] || 0) + 1;
    resumo[name] = { personagens: rows.length, obras: Object.keys(porObra).length, status: collection.report.status, errosDeRede: transitorios.length,
      semCategoria: collection.report.errors.length - transitorios.length, porObra };
    if (transitorios.length) {
      writeJson(parcial, rows, true);
      incompleto = true;
      console.log(name + ': PARCIAL (' + rows.length + ' personagens; ' + transitorios.length + ' erro(s) de rede). Rode de novo para completar:');
      for (const e of transitorios.slice(0, 5)) console.log('    ' + e.unit + ': ' + e.message.slice(0, 120));
      continue;
    }
    writeJson(final, rows, true);
    fs.rmSync(parcial, { force: true });
    console.log(name + ': ' + rows.length + ' personagens em ' + Object.keys(porObra).length + ' obras (' + collection.report.status + ')');
  }
  if (Object.keys(resumo).length) writeJson(path.join(out, 'fandom-expandido-relatorio.json'), { geradoEm: new Date().toISOString(), ...resumo });
  if (incompleto) process.exitCode = 1;
  return resumo;
}

if (require.main === module) main().catch((err) => { console.error(err); process.exitCode = 1; });
module.exports = { main, DESENHOS, JOGOS, JOGOS_MANUAIS: JOGOS, JOGOS_DESCOBERTOS, QUADRINHOS, SERIES, GRUPOS };
