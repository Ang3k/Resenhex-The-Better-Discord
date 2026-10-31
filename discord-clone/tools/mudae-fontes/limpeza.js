// Tira da roleta o que não é personagem: os grupos A e B da conferência de 30/10/2026
// (docs/relatorios/CATALOGO-MUDAE-2026-10-30.md). Quem sai continua no catálogo com 1 na 8ª coluna
// ("fora da roleta"): o servidor não sorteia, mas um casamento antigo segue no harém, no álbum e no ranking.
// Lê só o cache local: fichas, primeira frase e categorias das wikis, e episódios de cada papel no TMDB.
const fs = require('fs');
const path = require('path');
const { normalize: norm, suffix } = require('./coleta');

// ---- Nomes que não são de personagem ("Cop 2", "Kallen no Haha", "Shannon's Mom")
const PAPEL = new Set(`man men woman women guy guys girl girls boy boys kid kids child children baby officer officers guard guards clerk cop cops
incidental incidentals classmate classmates manager driver mother mom father dad agent agents nurse tech technician worker workers reporter assistant owner leader doctor member members
lawyer wife husband teacher lady employee director soldier soldiers pilot attendant priest attorney judge patient friend friends sergeant
anchor student students dealer commander thug thugs demon paramedic guest vendor foreman bartender waiter waitress cashier customer
receptionist announcer dancer singer visitor passerby pedestrian realtor actor actress orderly minister emt hostess host bouncer bailiff
detective inspector lieutenant deputy sheriff trooper ranger prisoner inmate convict henchman henchmen goon goons gangster mobster robber
thief burglar hooker prostitute stripper junkie addict bum hobo drunk biker punk jock nerd cheerleader fan tourist villager villagers
townsperson townspeople citizen citizens resident neighbor neighbour landlord tenant roommate boyfriend girlfriend bride groom widow son
daughter brother sister uncle aunt grandma grandpa grandmother grandfather cousin nephew niece teen teenager teens person people presenter
narrator scientist professor principal coach referee umpire chef cook butcher farmer fisherman sailor pirate knight secretary journalist
photographer cameraman producer bodyguard maid butler servant valet janitor mechanic surgeon dentist therapist psychiatrist counselor
pharmacist vet veterinarian coroner examiner medic pathologist analyst operator dispatcher teller banker broker accountant executive ceo
boss intern trainee recruit cadet private corporal marine sniper hitman assassin mercenary rebel terrorist hostage victim suspect witness
juror stranger survivor zombie zombies vampire alien monster creature robot android shooter gunman bystander onlooker spectator crowd
audience extra extras background unknown unnamed uncredited voice voices additional various self himself herself themselves mourner
protester partygoer reveler shopper patron diner client salesman saleswoman salesperson salesgirl courier messenger mailman postman
chauffeur cabbie trucker barista bellhop concierge doorman usher lifeguard caddy caretaker nanny babysitter tutor librarian clergyman nun
monk reverend pastor rabbi imam preacher deacon priestess chaplain sailors marines staffer aide adviser advisor spokesman spokeswoman
official officials politician senator congressman mayor governor councilman ambassador diplomat delegate`.split(/\s+/));
const DESCRITIVO = new Set(`a an the of in at on with from to young old older elderly middle aged large big small little tall short fat thin skinny
bald blonde blond redheaded pretty beautiful handsome attractive cute ugly scary creepy drunken angry crying dead dying injured wounded
sick pregnant homeless masked armed naked hot sexy nervous happy sad first second third fourth fifth sixth head chief senior junior lead
male female white black asian hispanic latino latina local city county state federal police fire hospital er icu school high college
university prison jail bank store shop hotel motel bar club nightclub strip restaurant cafe coffee gas station news tv radio security
army navy military fbi cia nsa dea atf swat nypd lapd cpd uniform uniformed plainclothes undercover drug crime scene desk front night
day delivery pizza taxi cab bus truck limo ambulance construction office morgue lab forensic forensics medical court courtroom brothel
casino airport airline flight train subway parking lot gym pool beach park church wedding party funeral market supermarket grocery
liquor convenience pawn gun car auto rental real estate insurance personal private public social case field homicide narcotics vice
patrol traffic border customs immigration coast secret service special task force staff team crew gang cult street corner russian
chinese mexican irish italian german french british english american japanese korean african arab indian native mafia cartel yakuza
triad bratva new other another random mysterious hooded unidentified generic regular frat sorority hippie emo goth teenage mean popular
burger food ice cream dog flower press camera sound make up makeup hair wardrobe set stage band rock pop jazz country lounge dance
ballet yoga karate boxing wrestling football basketball baseball soccer hockey tennis golf track varsity league sports reality show game
quiz talk late morning evening weekend`.split(/\s+/));
// As palavras japonesas só valem para o AniList: fora dele "Otto" é nome, não "marido".
const PAPEL_JP = new Set(`sensei shounen shoujo tenin kouchou kyoushi roujin hahaoya chichioya tenchou shachou onnanoko otokonoko keikan sonchou isha
roufujin kangoshi seito gakusei joshi danshi kyaku okyakusan obaasan ojiisan obasan ojisan oneesan oniisan oyaji okami kodomo akachan ani ane
imouto otouto haha chichi musume musuko tsuma otto sofu sobo kanojo kareshi tomodachi heishi senshi hei keibi keibiin untenshu jimuin
kaichou fukukaichou buchou kakarichou kachou kouhai senpai sempai jijii babaa shounin murabito ojii obaa oba oji onee onii`.split(/\s+/));
const HONORIFICO = new Set(['san', 'sama', 'chan', 'kun', 'dono']);
const NUMERO = /^(?:\d+\w*|[a-z]|i{1,3}|iv|vi{0,3}|one|two|three|four|five|alpha|beta|gamma|delta)$/;
// Codinome com hífen e letra ou número (D-Man, Leader-1, Agent-X) é nome próprio.
const CODINOME = /(?:^|[\s-])[A-Z0-9]-[A-Za-z]|[A-Za-z]-[A-Z0-9](?:$|\s)/;
const palavras = (name) => norm(name).split(' ').filter(Boolean);

function nomeDeFuncao(name, fonte) {
  if (CODINOME.test(name)) return false;
  const papel = (w) => PAPEL.has(w) || (fonte === 'a' && PAPEL_JP.has(w));
  const t = palavras(name);
  if (!t.length || !t.some(papel)) return false;
  return t.every((w) => papel(w) || DESCRITIVO.has(w) || NUMERO.test(w) || (fonte === 'a' && HONORIFICO.has(w)));
}
const POR_RELACAO = new RegExp([
  "^.+?['’]s? (?:mother|mom|father|dad|wife|husband|son|daughter|brother|sister|boyfriend|girlfriend|friend|grandma|grandpa|grandmother|grandfather|uncle|aunt|cousin|niece|nephew|parents|family|boss|assistant|secretary|bodyguard|lawyer|doctor|maid|butler|servant|pet|dog|cat|mother-in-law|father-in-law|ex|ex-wife|ex-husband|fiancee|fiance|baby|child|kid|twin|lover|partner|teacher|student|classmate|subordinate|minion|henchman|guard|date|mistress|attorney|agent|manager|driver|nurse|sister-in-law|brother-in-law)s?(?: \\d+)?$",
  '^(?:mother|father|wife|husband|son|daughter|brother|sister|friend|parents|family|boss|mom|dad) of ',
  '\\bno (?:haha|chichi|hahaoya|chichioya|musume|musuko|tsuma|otto|ani|ane|imouto|otouto|sofu|sobo|kanojo|kareshi|tomodachi|obaasan|ojiisan|oneesan|oniisan)$',
].join('|'), 'i');
const NOME_DE_GRUPO = /\s(?:and|&)\s|\b(?:brothers|sisters|twins|triplets|family|gang|crew|team|squad|clan|army|minions|villagers|people|students|guards|soldiers|kids|children|workers|members|couple|parents|band|duo|trio|group|council|committee|squadron|platoon|troops|staff|corps|knights|warriors|pirates|thugs|henchmen|goons|ninjas|citizens|residents|aliens|zombies|monsters|robots|fans|crowd|audience|cheerleaders|cultists|followers|elders|guardians|spirits)$/i;
// Dupla ou trio com nome próprio ("Heebee & Jeebee", "Babkak, Omar, and Kassim"): nenhuma parte é um papel ("Rebecca and Her Mother").
function duplaComNome(name) {
  const partes = String(name).split(/\s*,\s*(?:and\s+|&\s+)?|\s+(?:and|&)\s+/).filter(Boolean);
  return partes.length >= 2 && partes.length <= 4 && /\s(?:and|&)\s/.test(name) && partes.every((p) => !palavras(p).some((w) => PAPEL.has(w)));
}

// ---- Categorias da wiki, pela palavra principal: "Locations in Breath of the Wild" -> locations
const conjunto = (s) => new Set(s.trim().split(/\s+/));
const CAT_PERSONAGEM = conjunto('characters character npcs npc males females villains antagonists protagonists heroes heroines bosses boss sub-bosses minibosses mini-bosses');
const CAT_DUPLA = conjunto('pairs duos trios twins triplets');
const CAT_RELACAO = conjunto('interaction interactions conflicts friendships relationships rivalries romances alliances');
const CAT_GRUPO = conjunto('groups factions organizations organisations agencies teams gangs clans tribes races species');
const CAT_INIMIGO = conjunto('enemies badniks scrapniks monsters');
const CAT_PESSOA = conjunto('celebrities cast crew cast/crew writers directors producers composers animators actors actresses');
const CAT_COISA = conjunto(`locations location places objects items songs music soundtracks albums vehicles transportation spacecraft ships starships
weapons equipment armor armour clothing outfits food drinks plants trees materials elements traps quests missions levels stages zones worlds
planets cities towns villages regions areas forests caves islands rivers lakes seas mountains hills fields bridges inns shops stores restaurants
buildings structures bases lairs dungeons temples shrines castles houses businesses companies products brands books comics issues novels
magazines newspapers chapters episodes films movies shorts games media mechanics modes abilities moves techniques spells
terminology concepts technology machines devices gadgets tools symbols events wars battles holidays festivals attractions rides merchandise
cards achievements disambiguation disambiguations redirects ashes runes talismans lore legend works`);
// Categorias que terminam em "characters" mas são de coisa (constelações de Genshin, por exemplo).
const FALSO_PERSONAGEM = /constellation|talent|weapon|outfit|skin|song|item/i;
const cabeca = (c) => String(c).replace(/\([^)]*\)/g, ' ').replace(/\s+(?:in|from|of|by|on|at|for|with|about)\s.+$/i, '').trim().toLowerCase().split(/\s+/).pop();
function lerCategorias(cats = []) {
  const tem = (S) => cats.some((c) => S.has(cabeca(c)));
  return {
    // No Apex Legends os jogáveis ficam em "Legends" ("Arthurian Legends" da Disney não entra).
    pers: cats.some((c) => (CAT_PERSONAGEM.has(cabeca(c)) && !FALSO_PERSONAGEM.test(c)) || /^(?:locked )?legends$/i.test(c)),
    duo: tem(CAT_DUPLA), relacao: tem(CAT_RELACAO), grupo: tem(CAT_GRUPO), inimigo: tem(CAT_INIMIGO), pessoa: tem(CAT_PESSOA), coisa: tem(CAT_COISA),
    desambiguacao: cats.some((c) => /^disambiguations?$/i.test(c)),
    // Figurante sem nome ("Popular Girl 2", "Incidental 44"). "Background characters" não entra: no MLP tem pônei com nome e fãs.
    semNome: cats.some((c) => /^(?:unnamed characters?|incidentals)$/i.test(c)),
  };
}

// ---- O que a primeira frase da wiki diz que a página é ("X is a song from...")
const K = (s) => s.trim().split(/\s+/).join('|');
const TIPOS = {
  personagem: K('character characters npc npcs protagonist protagonists antagonist antagonists deuteragonist tritagonist villain villains hero heroes heroine man woman boy girl boss champion fighter mascot figure companion sidekick legend'),
  lugar: K(`location place island town city village area region dungeon temple shrine building world planet attraction ride shop store restaurant house castle kingdom land realm console
    arena residence apartment headquarters base zone inn hill lake bridge forest mountain camp lair hideout tavern bar school academy mansion palace prison station river cave valley mall hotel hospital neighborhood district`),
  item: K('object item weapon sword catalyst bow polearm claymore vehicle vehicles weapons objects items ship car boat plant tree food dish material relic curio equation card skin costume outfit device tool artifact gadget accessory gem jewel potion amulet instrument ash article trainers'),
  midia: K('song album episode short film movie game show franchise segment commercial parody sketch featurette sitcom sitcoms channel network newscast novel comic issue release releases soundtrack theme musical series video tale'),
  texto: K('readable book list chapter story poem letter diary journal'),
  evento: K('event quest mission minigame level stage task sidequest challenge tournament competition ceremony festival holiday incident'),
  conceito: K('attack ability move technique spell transformation term concept title nickname alias mechanic feature mode reference type form cognition constellation talent motif phenomenon'),
  grupo: K('group team band family crew tribe faction organization organisation company species race order alliance army clan gang squad unit council groups teams bands factions organizations fraternity society club guild cult syndicate brotherhood'),
  inimigo: K('enemy enemies badnik'),
  pessoa_real: K('actor actress comedian musician cinematographer animator director producer writer composer screenwriter'),
};
const TIPO_DE = new Map(Object.entries(TIPOS).flatMap(([k, v]) => v.split('|').map((w) => [w, k])));
// O núcleo da definição: "X is a fighting game character from..." -> "character".
const CORTE = /\s(?:who|whom|which|that|from|in|of|for|by|with|on|at|and|or|to|as|featured|appearing|appeared|appears|seen|found|used|created|introduced|located|owned|built|made|sung|performed|written|known|called|named|based|exclusive|originally|produced|directed|developed|released|published|aired|broadcast|launched|starring|drawn)\b|[,.;:!?—–]/i;
const BANDA = /\b(?:is|are|was|were) (?:an?|the) [^.]{0,50}?\b(?:band|group)\b/i;
const ORACAO = /\s(?:who|whom|which|that|from|by|of|in|for|featuring|located|found|appearing|appears|appeared|sung|performed|seen)\b|[,.;:!?—–]/i;
const PESSOA_PALAVRA = /^(?:npcs?|character|characters|protagonist|antagonist|villain|hero|heroine)$/;
const BIOGRAFIA = /\bborn\b|\(né\b|\b(?:American|British|English|Canadian|Australian|Irish|Scottish|Italian|French|German|Mexican|Japanese|Korean|Chinese|Swedish|Dutch|Israeli)\b|\bworked on\b|\bworks on\b|\bbest known\b|\bnoted for\b|\b(?:on|for) (?:The Simpsons|Family Guy|South Park|Futurama|Rick and Morty|Adventure Time|the (?:show|series))\b/;
const limpaFrase = (desc) => String(desc || '').replace(/\([^)]*\)/g, ' ').replace(/\[[^\]]*\]/g, '').replace(/[“”"]/g, '');

function tipoDaDescricao(desc) {
  const d = limpaFrase(desc);
  if (/\b(?:may|can|could) refer to\b|serves as a redirect/i.test(d)) return 'desambiguacao';
  if (/focuses on the interactions between|is a list of|following is a list/i.test(d)) return 'relacao';
  const m = d.match(/\b(?:is|was|are|were)\s+(?:an?|the|one of the|two|three)\s+(.{1,120})/i);
  if (!m) return null;
  const tipoDe = (w) => TIPO_DE.get(w);
  // "a quest and event-exclusive NPC who...", "an NPC aboard the station": se a oração diz NPC, personagem ou vilão,
  // é personagem. Menos quando a palavra só qualifica outra ("character faction", "villain song").
  const oracao = m[1].split(ORACAO)[0].trim().toLowerCase().split(/\s+/);
  if (oracao.some((w, i) => PESSOA_PALAVRA.test(w) && !tipoDe(oracao[i + 1] || ''))) return 'personagem';
  // "an American film and television actor": só com sinal de biografia ("actress NPC" e "Director of the Fatui" são personagens).
  const frase = m[1].split(/[,.;:(]/)[0];
  if (/^(?:[\w'’-]+\s+){0,5}?(?:actor|actress|comedian|musician|cinematographer|animator|director|producer|screenwriter|writer|composer|painter|(?<!martial )artist|illustrator|singer|songwriter|rapper|author|journalist|businessman|businesswoman|politician|youtuber|presenter)\b/i.test(frase)
    && !/\b(?:npc|character|characters)\b/i.test(frase) && BIOGRAFIA.test(String(desc))) return 'pessoa_real';
  const nucleo = m[1].split(CORTE)[0].trim().toLowerCase().split(/\s+/);
  if (nucleo.length > 6) return null;
  if (/^voice (?:actor|actress)$/.test(nucleo.slice(-2).join(' '))) return 'pessoa_real';
  // "a Controller Legend" (Apex) é personagem; "a The Legend of Zelda-themed DLC" não.
  if (nucleo[nucleo.length - 1] === 'legend' && (nucleo[nucleo.length - 2] === 'the' || /\blegend of\b/i.test(m[1]))) return null;
  return tipoDe(nucleo[nucleo.length - 1]) || null;
}

// "Hotheads are enemies…", "Unicorns are mythological creatures…": a página fala de um tipo ou de uma turma, não de alguém.
// Só quando o sujeito da frase é o próprio nome; "The Walrus and the Carpenter are minor characters" fica.
const PLURAL_PESSOA = /\b(?:characters?|npcs?|protagonists?|antagonists?|villains?|heroes|heroines|twins|triplets|siblings|brothers|sisters|duo|trio|couple|pair)\b/i;
function falaNoPlural(desc, name) {
  const m = limpaFrase(desc).trim().match(/^((?:(?!\s(?:is|was|are|were)\s).){1,90}?)\s(?:are|were)\s+(?!an?\s|the\s|one\s|two\s|three\s|four\s|both\s|also\s|not\s|all\s|you\s|we\s|they\s)([^.;:]{1,80})/i);
  if (!m) return false;
  // "Ann Landers and her twin sister were…": sujeito composto é gente, não tipo.
  if (/\s(?:and|&)\s/i.test(m[1]) && !/\s(?:and|&)\s/i.test(name)) return false;
  const raiz = norm(name.replace(/\(.*?\)/g, '')).split(' ').pop().slice(0, 4);
  return raiz.length >= 3 && norm(m[1]).includes(raiz) && m[1].length <= name.length + 40 && !PLURAL_PESSOA.test(m[2]);
}

const CAMPOS_DE_PERSONAGEM = new Set(['gender', 'sex', 'species', 'race', 'voice', 'voiced by', 'voicedby', 'voiceactor', 'voice actor', 'japanese voice actor',
  'english voice actor', 'englishactor', 'japanactor', 'otheractor', 'actor', 'portrayer', 'performer', 'age', 'family', 'relatives', 'relative',
  'relativename1', 'parents', 'children', 'siblings', 'height', 'weight', 'hair', 'hair color', 'haircolor', 'eye color', 'eye-color', 'eyes',
  'eye', 'skin color', 'fur color', 'likes', 'dislikes', 'alignment', 'affiliation', 'affiliations', 'occupation', 'occupation(s)', 'occup', 'job',
  'profession', 'residence', 'resides', 'homeworld', 'home world', 'home-planet', 'birthplace', 'hometown', 'birthdate', 'dob', 'birth', 'bloodtype',
  'nationality', 'ethnicity', 'religion', 'pronouns', 'fullname', 'nickname', 'nicknames', 'partner', 'friends', 'enemies', 'allies', 'pets',
  'powers', 'fightingstyle', 'date of death', 'died', 'place of death', 'employer', 'va', 'seiyuu', 'birthday', 'element', 'weapon', 'path', 'rarity', 'faction']);
const CAMPOS_DE_INIMIGO = /^(?:hp|health|drops|souls|exp|attack|attacks|defeated|habitat|moveset|hitpoints)$/;
const FOTO_PADRAO = /^(?:actor_silhouette.*|no[_ -]?image.*|noimage.*|mentioned\.png|tba\.png|placeholder.*|.*placeholder_asset.*|hw_unknown_icon.*|default\.(?:jpe?g|png))$/i;
const FOTO_DE_OBJETO = /^(?:item|icon|ui|weapon|achievement|book|readable|bg|background|banner|logo|symbol|emblem|flag)[_ -]|[_ -](?:readable|parchment|map|logo|icon|interior|exterior|title[_ -]card|emblem|symbol|flag)\.(?:png|jpe?g|webp)$|_icon[_ .]/i;
// Séries de antologia (palavra-chave 9706 do TMDB): cada episódio tem protagonistas próprios.
const ANTOLOGIA = new Set(['s46648', 's39852', 's60622', 's42009', 's82883', 's1413', 's111803']);
const GACHA = new Set(['genshin-impact', 'honkai-star-rail', 'wutheringwaves']);
// Fotos-padrão com outra foto do próprio personagem na página do Fandom: ficam em dúvida, para trocar a foto.
const FOTO_PADRAO_COM_OUTRA = new Set(['g-thelastofus-52626', 'g-thelastofus-53264', 'g-thelastofus-55249', 'g-cuphead-11658', 'g-residentevil-75250',
  'g-residentevil-92742', 'g-residentevil-75746', 'g-residentevil-247411', 'g-residentevil-145451', 'g-residentevil-247409', 'g-residentevil-247413',
  'g-residentevil-167468', 'g-residentevil-4714', 'g-sonic-682985', 'g-sonic-20203', 'g-sonic-371497', 'g-sonic-398205', 'g-sonic-599887',
  'g-sonic-663156', 'd-spongebob-30581', 'd-disney-1344395', 'd-disney-1515361']);

const ANILIST = 'https://s4.anilist.co/file/anilistcdn/character/large/';
const fotoSemVersao = (r) => (/^https?:/.test(r[3]) ? r[3] : ANILIST + r[3]).replace(/\?.*$/, '').replace(/\/revision\/latest.*$/, '');
const arquivoDaFoto = (r) => { const f = fotoSemVersao(r).split('/').pop(); try { return decodeURIComponent(f); } catch { return f; } };
const wikiDe = (r) => (String(r[0]).match(/^[gd]-(.+)-\d+$/) || [])[1];

// Diz quem sai e quem fica em dúvida, com os motivos. fichas: { id: { cats, fields, desc } } das wikis;
// episodios: { id: { eps } } dos papéis do TMDB (lerFichas e lerEpisodios montam os dois a partir do cache).
function conferir(rows, { fichas = {}, episodios = {} } = {}) {
  // Conhecido = terço de cima da própria fonte (raro, épico ou lendário no jogo): nas regras mais fracas vai para dúvida.
  const porFonte = new Map();
  for (const r of rows) { if (!porFonte.has(r[6])) porFonte.set(r[6], []); porFonte.get(r[6]).push(r); }
  const posicao = new Map();
  for (const list of porFonte.values()) [...list].sort((a, b) => b[5] - a[5]).forEach((r, i) => posicao.set(String(r[0]), (i + 1) / list.length));
  const conhecido = (r) => posicao.get(String(r[0])) <= 1 / 3;
  const porFoto = new Map();
  for (const r of rows) { const k = fotoSemVersao(r); porFoto.set(k, (porFoto.get(k) || 0) + 1); }
  const marcas = new Map();
  const marca = (r, tipo, motivo) => {
    const id = String(r[0]);
    const o = marcas.get(id) || { sai: [], revisar: [] };
    if (!o[tipo].includes(motivo)) o[tipo].push(motivo);
    marcas.set(id, o);
  };
  const sai = (r) => !!marcas.get(String(r[0]))?.sai.length;
  const episodiosDe = (r) => { const id = String(r[0]); return id.split('-').length === 3 ? episodios[id] : episodios[id + '|' + norm(r[1])]; };

  for (const r of rows) {
    const name = String(r[1] || '');
    const foto = arquivoDaFoto(r);
    const wiki = wikiDe(r);
    // 1. Foto
    if (FOTO_PADRAO.test(foto)) marca(r, FOTO_PADRAO_COM_OUTRA.has(String(r[0])) ? 'revisar' : 'sai', FOTO_PADRAO_COM_OUTRA.has(String(r[0])) ? 'foto_padrao_tem_outra' : 'foto_padrao');
    else if (r[6] !== 's' && porFoto.get(fotoSemVersao(r)) >= 3) marca(r, 'revisar', 'foto_repetida');
    // 2. Página de wiki que não é de um personagem
    if (wiki) {
      const fi = fichas[r[0]] || {};
      const tipo = tipoDaDescricao(fi.desc);
      const jogavel = GACHA.has(wiki) && r[5] > 0;
      const fichaPersonagem = (fi.fields || []).some((x) => CAMPOS_DE_PERSONAGEM.has(x));
      const fichaOutra = (fi.fields || []).length > 0 && !fichaPersonagem;
      const fichaInimigo = fichaOutra && (fi.fields || []).some((x) => CAMPOS_DE_INIMIGO.test(x));
      const cats = lerCategorias(fi.cats);
      // "Krusty and the Krums is a band": banda não é dupla ("The Walrus and the Carpenter are minor characters" é).
      const dupla = duplaComNome(name) && !BANDA.test(fi.desc || '') && (cats.duo || cats.pers);
      if (tipo === 'desambiguacao' || cats.desambiguacao) marca(r, 'sai', 'desambiguacao');
      else if (/^(?:list of|lists of|locations in|enemies in|bosses in|items in|characters in|unconfirmed)\s/i.test(name)) marca(r, 'sai', 'relacao_ou_lista');
      // "DC The Powerpuff Girls Issue 20", "Steven Universe Vol. 2", "Season 5": revista, coletânea ou temporada.
      else if (tipo !== 'personagem' && /\b(?:issue|vol\.?|volume|season)\s*#?\d+\b|\btheme song\b/i.test(name)) marca(r, 'sai', 'nao_personagem_midia');
      else if (!jogavel && tipo !== 'personagem') {
        if (tipo === 'relacao' || (cats.relacao && !cats.pers)) marca(r, 'sai', 'relacao_ou_lista');
        else if (['lugar', 'item', 'midia', 'texto', 'evento', 'conceito'].includes(tipo)) marca(r, fichaPersonagem || cats.pers ? 'revisar' : 'sai', 'nao_personagem_' + tipo);
        else if (dupla) { /* dupla ou trio com nome próprio fica */ }
        else if (tipo === 'grupo') marca(r, conhecido(r) ? 'revisar' : 'sai', 'grupo_ou_especie');
        else if (tipo === 'inimigo') marca(r, conhecido(r) ? 'revisar' : 'sai', 'inimigo_generico');
        else if (tipo === 'pessoa_real') marca(r, 'revisar', 'pessoa_real'); // participação especial e biografia se confundem
        else if (!tipo && cats.pers) { // categoria de personagem: na dúvida, revisar
          if (fichaOutra) marca(r, 'revisar', fichaInimigo ? 'inimigo_generico' : 'nao_personagem_ficha');
          else if (!fichaPersonagem && FOTO_DE_OBJETO.test(foto)) marca(r, 'revisar', 'nao_personagem_imagem');
        }
        else if (!tipo && (fichaInimigo || cats.inimigo)) marca(r, conhecido(r) ? 'revisar' : 'sai', 'inimigo_generico');
        else if (!tipo && cats.pessoa) marca(r, 'revisar', 'pessoa_real');
        else if (!tipo && cats.coisa) marca(r, fichaPersonagem ? 'revisar' : 'sai', 'nao_personagem_categoria');
        else if (!tipo && cats.grupo && wiki !== 'megamitensei') marca(r, conhecido(r) ? 'revisar' : 'sai', 'grupo_ou_especie');
        else if (!tipo && fichaOutra) marca(r, conhecido(r) || wiki === 'megamitensei' ? 'revisar' : 'sai', 'nao_personagem_ficha');
        else if (!tipo && !fichaPersonagem && FOTO_DE_OBJETO.test(foto)) marca(r, 'sai', 'nao_personagem_imagem');
      }
      if (!jogavel && tipo !== 'personagem' && !dupla && NOME_DE_GRUPO.test(name) && !sai(r)) marca(r, conhecido(r) ? 'revisar' : 'sai', 'grupo_ou_especie');
      if (!jogavel && cats.semNome) marca(r, conhecido(r) ? 'revisar' : 'sai', 'sem_nome');
      if (!jogavel && tipo !== 'personagem' && !dupla && !duplaComNome(name) && !sai(r) && falaNoPlural(fi.desc, name)) marca(r, conhecido(r) ? 'revisar' : 'sai', 'tipo_no_plural');
    } else if (r[6] !== 's' && NOME_DE_GRUPO.test(name) && /\s(?:and|&)\s/.test(name) && !duplaComNome(name)) marca(r, conhecido(r) ? 'revisar' : 'sai', 'grupo_ou_especie');
    // 3. Nome que não é de personagem (só fora do terço mais conhecido da fonte)
    const nomeRuim = !/\p{L}/u.test(name) || norm(name).length < 2 ? 'nome_vazio'
      : /^(?:narrator|unknown|unnamed|extra|extras|background|announcer|voice|various|additional voices|self|himself|herself|uncredited|crowd|n\/a|tba|tbd)$/i.test(name.trim()) ? 'nome_generico'
        : nomeDeFuncao(name, r[6]) ? 'nome_generico' : POR_RELACAO.test(name) ? 'nome_por_relacao' : null;
    // Nos quadrinhos o nome é codinome ("Hitman", "Night Man", "Black Knight"): só revisar.
    if (nomeRuim) marca(r, conhecido(r) || r[6] === 'c' ? 'revisar' : 'sai', nomeRuim);
    // 4. Séries: figurante de um episódio só
    if (r[6] === 's') {
      const e = episodiosDe(r);
      if (e && e.eps <= 1) marca(r, ANTOLOGIA.has(String(r[0]).split('-')[0]) ? 'revisar' : 'sai', 'serie_1_episodio');
      else if (e && e.eps <= 3) marca(r, 'revisar', 'serie_2a3_episodios');
    }
    // 5. IGDB com o nome do programa colado ("Fulano - Programa")
    if (r[6] === 'g' && /\s[-–]\s/.test(name) && !wiki) marca(r, 'revisar', 'nome_com_sufixo');
  }
  // 6. O mesmo papel de série feito por dois atores (Geralt, Spartacus): fica o mais popular. No AniList e no
  // Comic Vine cada número já é um personagem diferente, mesmo com nome igual.
  const mesmoPapel = new Map();
  for (const r of rows) if (r[6] === 's') { const k = norm(r[1]) + '|' + norm(r[2]); if (!mesmoPapel.has(k)) mesmoPapel.set(k, []); mesmoPapel.get(k).push(r); }
  for (const g of mesmoPapel.values()) if (g.length > 1) {
    const ficam = g.filter((r) => !sai(r)).sort((a, b) => b[5] - a[5]);
    for (const r of ficam.slice(1)) marca(r, 'sai', 'duplicado');
  }
  // Mesmo ator em vários papéis da mesma série (entre os que ficam): o papel com mais episódios fica sem marca.
  const atorSerie = new Map();
  for (const r of rows) if (r[6] === 's' && !sai(r)) { const k = fotoSemVersao(r) + '|' + r[2]; if (!atorSerie.has(k)) atorSerie.set(k, []); atorSerie.get(k).push(r); }
  for (const g of atorSerie.values()) if (g.length > 1) {
    g.sort((a, b) => (episodiosDe(b)?.eps || 0) - (episodiosDe(a)?.eps || 0) || b[5] - a[5]);
    for (const r of g.slice(1)) marca(r, 'revisar', 'mesmo_ator_outro_papel');
  }
  // IGDB e wiki com o mesmo nome completo
  const mesmoNome = new Map();
  for (const r of rows) if (r[6] === 'g' && norm(r[1]).includes(' ') && !sai(r)) { const k = norm(r[1]); if (!mesmoNome.has(k)) mesmoNome.set(k, []); mesmoNome.get(k).push(r); }
  for (const g of mesmoNome.values()) if (g.some((r) => /^g\d+$/.test(String(r[0]))) && g.some((r) => wikiDe(r))) {
    const fica = g.sort((a, b) => b[5] - a[5])[0];
    for (const r of g) if (r !== fica && wikiDe(r) !== undefined) marca(r, 'revisar', 'duplicado_igdb_wiki');
  }
  return marcas;
}

// Ficha, categorias e começo da descrição de cada página das wikis, tirados das consultas salvas.
function lerFichas(cacheDir) {
  const fichas = {};
  const texto = (v) => String(v || '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#0?39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
  for (const [dir, letter] of [['desenhos', 'd'], ['jogos-fandom', 'g']]) {
    const base = path.join(cacheDir, 'consultas', dir);
    for (const f of fs.readdirSync(base)) {
      let d;
      try { d = JSON.parse(fs.readFileSync(path.join(base, f), 'utf8')); } catch { continue; }
      const i = d.key.indexOf(':');
      const wiki = d.key.slice(0, i);
      let params;
      try { params = JSON.parse(d.key.slice(i + 1)); } catch { continue; }
      for (const p of d.data?.query?.pages || []) {
        const o = (fichas[letter + '-' + wiki + '-' + p.pageid] ||= { cats: [] });
        if (params.generator === 'categorymembers') {
          const cat = params.gcmtitle.replace(/^Category:/, '');
          if (!o.cats.includes(cat)) o.cats.push(cat);
        } else if (params.prop === 'pageimages|pageprops') {
          const fields = new Set();
          const walk = (items) => {
            for (const it of items || []) {
              if (it.type === 'group') walk(it.data?.value);
              else if (it.type === 'data' && texto(it.data?.value)) fields.add(String(it.data?.source || '').toLowerCase());
            }
          };
          try { for (const box of JSON.parse(p.pageprops?.infoboxes || '[]')) walk(box.data); } catch { /* ficha ilegível */ }
          o.fields = [...fields];
          o.desc = texto(p.pageprops?.fandomdescription).slice(0, 220);
        }
      }
    }
  }
  return fichas;
}

// Episódios de cada papel das séries (aggregate_credits do TMDB), pelo mesmo ID que o tmdb.js publica.
function lerEpisodios(cacheDir) {
  const episodios = {};
  const base = path.join(cacheDir, 'consultas', 'series');
  const nomes = (v) => String(v || '').split(/\s*\/\s*/).map((s) => s.replace(/\s*\([^)]*\)\s*/g, ' ').trim()).filter(Boolean);
  for (const f of fs.readdirSync(base)) {
    let d;
    try { d = JSON.parse(fs.readFileSync(path.join(base, f), 'utf8')); } catch { continue; }
    const m = /^tv\/(\d+):/.exec(d.key);
    const cast = d.data?.aggregate_credits?.cast;
    if (!m || !cast) continue;
    for (const p of cast) for (const role of p.roles || []) for (const name of nomes(role.character)) {
      const k = norm(name);
      const id = 's' + m[1] + '-' + p.id;
      for (const key of [id + '|' + k, id + '-' + suffix(k)]) if (!episodios[key] || episodios[key].eps < role.episode_count) episodios[key] = { eps: role.episode_count };
    }
  }
  return episodios;
}

// Devolve as linhas com a 8ª coluna (1 = fora da roleta) e um resumo por motivo. Nenhum ID é apagado.
function marcarForaDaRoleta(rows, { cacheDir, fichas, episodios } = {}) {
  if (!fichas || !episodios) {
    for (const dir of ['desenhos', 'jogos-fandom', 'series']) {
      if (!cacheDir || !fs.existsSync(path.join(cacheDir, 'consultas', dir))) throw new Error('Limpeza do catálogo sem o cache das wikis e do TMDB (consultas/' + dir + ')');
    }
  }
  const marcas = conferir(rows, { fichas: fichas || lerFichas(cacheDir), episodios: episodios || lerEpisodios(cacheDir) });
  const motivos = {};
  let fora = 0;
  let emDuvida = 0;
  const saida = rows.map((r) => {
    const o = marcas.get(String(r[0]));
    if (o?.sai.length) { fora++; for (const m of o.sai) motivos[m] = (motivos[m] || 0) + 1; return [...r.slice(0, 7), 1]; }
    if (o?.revisar.length) emDuvida++;
    return r.slice(0, 7);
  });
  return { rows: saida, report: { total: rows.length, foraDaRoleta: fora, naRoleta: rows.length - fora, emDuvida, motivos } };
}

module.exports = { conferir, marcarForaDaRoleta, lerFichas, lerEpisodios, tipoDaDescricao, lerCategorias, nomeDeFuncao, duplaComNome };
