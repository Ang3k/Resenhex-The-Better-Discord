// Mudae: rodar personagens ($w/$h/$m), casar com eles e montar o seu harem; kakera, desejos, presentes,
// rankings de personagens ($top, $obra) e trocas entre duas pessoas.
// Os personagens vêm do mudae-catalogo.json (gerado por tools/mudae-catalogo.js a partir do AniList,
// IGDB, Comic Vine, TMDB e wikis do Fandom). Um roll é só um sorteio, sem rede: as listas de sorteio ficam
// na memória (só números) e o nome e a foto vêm de um banco SQLite local (server/mudae-catalogo-banco.js).
// As fotos vão direto do site de cada fonte para o navegador. Cada comunidade guarda
// { claims, usage, favorites } e os limites são contados pelo relógio, sem nenhum timer rodando.
const { kakeraOf, addKakera, crystalsToday, statsOf, bumpStat, refundOf, refundStatus } = require('./mudae-conta');
const { openCatalog } = require('./mudae-catalogo-banco');
const { perksOf } = require('./mudae-forja');
const { POWERS, AMULETO, DESEJO_CHANCE } = require('./mudae-regras');

const ROLLS_PER_HOUR = 10;
const ROLL_RESET_MS = 30 * 60_000;
const CLAIM_RESET_MS = 30 * 60_000;
const CLAIM_WINDOW_MS = 45_000;
// Quanto a cápsula do Salão leva para abrir, por raridade: cai, balança uma vez por degrau de cor
// (e o lendário ainda trava antes de dourar). Tem que bater com public/gacha/linha-do-tempo.mjs.
const REVEAL_MS = { common: 1950, rare: 2400, epic: 2850, legendary: 3850 };
const revealDelay = (rarity) => REVEAL_MS[rarity] ?? REVEAL_MS.common;
// Depois que o card aparece, quem rodou tem um tempinho só dele antes dos outros poderem roubar.
const PRIORITY_MS = 3000;
const DECOYS = 8;
const HAREM_LIMIT = 300;
// Kakera: a moeda do Mudae. Ganha no $dk, nos cristais dos rolls de quem já tem dono e no divórcio;
// gasta no $rolls, nas trocas e no $givek.
const DAILY_MS = 20 * 3600_000; // $daily e $dk voltam a cada 20 h, como no Mudae do Discord
const DK_AMOUNT = 250;
const ROLLS_PRICE = 500;
const ROLLS_BUYS = 3; // compras de $rolls a cada 24 h
const DAY_MS = 24 * 3600_000;
const WISH_LIMIT = 10;
// Trocas: ficam abertas 5 min depois da última mudança, com até 20 cartas de cada lado.
const TRADE_TTL = 5 * 60_000;
const TRADE_MAX = 20;
const TOP_LIMIT = 1000; // o $top mostra os mil primeiros (a lista de uma obra vai inteira)
const LIST_PAGE = 15;
const HIST_KEEP = 5;
const IMG_PREFIX = 'https://s4.anilist.co/file/anilistcdn/character/large/';

// Fontes de personagens. A letra é o sufixo do comando ($wa, $hg…), como no Mudae do Discord.
const SOURCES = { a: 'Anime', g: 'Jogos', c: 'Quadrinhos', d: 'Desenhos', s: 'Séries', v: 'Visual novels' };
// As faixas de raridade e valor foram pensadas para uma fonte de 15 mil personagens. Fontes menores
// usam a mesma proporção (os 0,67% do topo são lendários), então a chance de lendário não muda.
const REF_SIZE = 15000;

// Comandos e apelidos (os nomes do Mudae do Discord, mais alguns em português).
const COMMANDS = {
  w: 'w', waifu: 'w',
  h: 'h', husbando: 'h',
  m: 'm', marry: 'm',
  mm: 'mm', harem: 'mm',
  im: 'im', info: 'im',
  divorce: 'divorce', divorciar: 'divorce',
  tu: 'tu',
  divorcio: 'dt', dt: 'dt',
  // $mm com ordem: a = de A a Z, s = por obra, r = mais recentes (o padrão é o valor).
  mma: 'mma', mms: 'mms', mmr: 'mmr',
  top: 'top', topserv: 'topserv', obra: 'obra',
  give: 'give', dar: 'give',
  givek: 'givek', givekakera: 'givek',
  wish: 'wish', desejar: 'wish', wl: 'wl', wishlist: 'wl', wr: 'wr', wishremove: 'wr',
  k: 'k', kakera: 'k', dk: 'dk', dailykakera: 'dk', daily: 'daily', rolls: 'rolls',
  fm: 'fm', favorito: 'fm',
  trade: 'trade', trocar: 'trade', troca: 'trade',
  // Forja de medalhas e superpoderes.
  forja: 'forja', badges: 'forja', forjar: 'forjar', poderes: 'poderes', poder: 'poder',
};
for (const s of Object.keys(SOURCES)) for (const kind of ['w', 'h', 'm']) COMMANDS[kind + s] = kind + s;
// Os comandos que rodam um personagem ($w, $h, $m e os de fonte, como $wg).
const isRoll = (cmd) => new RegExp(`^[whm][${Object.keys(SOURCES).join('')}]?$`).test(cmd);

// Valor do card: cai com a posição no ranking (o nº 1 vale 1200, o 15.000º uns 45).
const valueOf = (rank) => Math.max(30, Math.round(1200 / (1 + rank / 250) ** 0.8));
// Raridade pela posição (1 = mais popular): lendário 1–100, épico até 1000, raro até 5000.
const rarityOf = (position) => (position <= 100 ? 'legendary' : position <= 1000 ? 'epic' : position <= 5000 ? 'rare' : 'common');
// As mesmas faixas, da mais comum para a mais rara: até que posição vai cada raridade.
const RARITIES = ['common', 'rare', 'epic', 'legendary'];
const RARITY_TOP = { legendary: 100, epic: 1000, rare: 5000, common: Infinity };
// Os poderes que mudam o próximo roll e ficam armados até ele (a Vidência só olha).
const ARMABLE = ['amuleto', 'desejo', 'dupla'];
const PREVIEW = 3; // quantos rolls a Vidência mostra
const normalize = (s) => String(s || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

// Palavras do $top: gênero e fonte se combinam ("$top waifus anime"); qualquer outra coisa é o nome de uma obra.
// "Outros" são os sem gênero no catálogo (bichos e robôs, mas também gente cujo gênero a fonte não diz).
const FILTER_WORDS = {
  F: 'w waifu waifus mulher mulheres', M: 'h husbando husbandos homem homens', O: 'o outro outros',
  a: 'a anime animes manga', g: 'g jogo jogos game games', c: 'c quadrinho quadrinhos hq hqs comic comics', d: 'd desenho desenhos cartoon cartoons', s: 's serie series tv', v: 'v vn vns',
};
const FILTER_OF = new Map(Object.entries(FILTER_WORDS).flatMap(([k, words]) => words.split(' ').map((w) => [w, k])));
const GENDER_LABEL = { F: 'Waifus', M: 'Husbandos', O: 'Sem gênero definido' };
// O catálogo ainda não diz a espécie: para "animais" ou "pessoas", o bot explica em vez de errar.
const SPECIES_WORDS = new Set('animal animais bicho bichos pessoa pessoas humano humanos'.split(' '));
const SOURCE_OF = { a: 'de anime', g: 'de jogos', c: 'de quadrinhos', d: 'de desenhos', s: 'de séries', v: 'de visual novels' };

function minutes(ms) {
  const m = Math.max(1, Math.ceil(ms / 60_000));
  return m >= 60 ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}` : `${m} min`;
}

function parse(text) {
  const m = /^\$(\S+)(?:\s+([\s\S]*))?$/.exec(String(text || '').trim());
  const cmd = m && COMMANDS[m[1].toLowerCase()];
  return cmd ? { cmd, arg: (m[2] || '').trim() } : null;
}

// Linha do catálogo: [id, nome, obra, foto, gênero, popularidade, fonte]. A fonte falta nas linhas
// antigas (só anime), e a foto do anime é só o final do endereço do AniList.
// O catálogo vem de catalogFile (o mudae-catalogo.json), guardado num banco SQLite em catalogDb (montado sozinho
// na primeira vez e quando o JSON muda), ou de catalog, um array de linhas (os testes), montado na memória.
// Se esse banco não serve mas o molde ao lado do JSON (mudae-catalogo.db, que o `npm test` monta antes dos testes)
// serve, usa o molde. Veja server/mudae-catalogo-banco.js.
//
// Cada personagem é um número k: a sua posição na lista de todos, do mais popular para o menos (entre todas as
// fontes). Na memória ficam só números por personagem; o id, o nome e a foto vêm do banco quando uma carta
// aparece. Cuidado: k = 0 é um personagem (o mais popular), então "não achou" é sempre undefined ou null.
function createMudae({ catalog = null, catalogFile = null, catalogDb = null, now = Date.now, random = Math.random, refSize = REF_SIZE }) {
  const molde = catalogFile ? catalogFile.replace(/\.json$/i, '') + '.db' : null;
  const cat = openCatalog({ rows: catalog, file: catalogFile, dbFile: catalogDb, molde, refSize, isSource: (s) => !!SOURCES[s], normalize });
  const { n, src, gen, fora, pos, sid, srcOrder, srcLen, obras } = cat;
  // Posição equivalente numa fonte de 15 mil (a mesma conta de antes, (posição × refSize) / tamanho da fonte).
  const eqOf = (k) => pos[k] * refSize / srcLen[src[k]];
  const sourceOf = (k) => srcOrder[src[k]];
  const seriesOf = (k) => obras[sid[k]];
  const idOf = (k) => cat.row(k).id;
  const lookup = (id) => cat.lookup(id);
  const lookupAll = (ids) => cat.lookupMany(ids).filter((k) => k !== undefined);
  const byEq = (a, b) => eqOf(a) - eqOf(b);
  // Quem tem 1 na 8ª coluna (não é personagem: lugar, item, figurante de um episódio) saiu da roleta,
  // mas continua no harém, no álbum e no ranking de quem já casou. Posição e valor contam com todos.
  let nAtivos = 0;
  for (let k = 0; k < n; k++) if (!fora[k]) nAtivos++;
  const ativos = new Int32Array(nAtivos);
  for (let k = 0, a = 0; k < n; k++) if (!fora[k]) ativos[a++] = k;
  // Personagens de cada obra (só os da roleta), do mais valioso ao menos; as obras mais populares
  // vêm primeiro na busca do $obra e do $top, que desempata por aqui. Todos num Int32Array só, obra a obra.
  const seriesCount = new Int32Array(obras.length);
  const seriesOrder = []; // as obras na ordem em que aparecem nos ativos
  for (const k of ativos) if (seriesCount[sid[k]]++ === 0) seriesOrder.push(sid[k]);
  const seriesStart = new Int32Array(obras.length);
  const seriesEnd = new Int32Array(obras.length);
  for (let s = 0, off = 0; s < seriesOrder.length; s++) { seriesStart[seriesOrder[s]] = off; seriesEnd[seriesOrder[s]] = off; off += seriesCount[seriesOrder[s]]; }
  const bySeriesAll = new Int32Array(nAtivos);
  for (const k of ativos) bySeriesAll[seriesEnd[sid[k]]++] = k;
  const sidOfSeries = new Map(seriesOrder.map((s) => [obras[s], s]));
  const bySeries = {
    has: (name) => sidOfSeries.has(name),
    get: (name) => { const s = sidOfSeries.get(name); return s === undefined ? undefined : bySeriesAll.subarray(seriesStart[s], seriesEnd[s]); },
  };
  const seriesKeys = seriesOrder.map((s) => [normalize(obras[s]), obras[s]]);
  // Listas de sorteio ($w, $h, $m e por fonte), na mesma ordem dos personagens, como Int32Array de k.
  // "m" é a própria ativos: nenhuma lista é alterada depois de pronta.
  const counts = { w: 0, h: 0 };
  for (const s of srcOrder) { counts['m' + s] = 0; counts['w' + s] = 0; counts['h' + s] = 0; }
  for (const k of ativos) {
    const s = sourceOf(k);
    counts['m' + s]++;
    if (gen[k] === 1) { counts.w++; counts['w' + s]++; } else if (gen[k] === 2) { counts.h++; counts['h' + s]++; }
  }
  const pools = { m: ativos };
  const filled = {};
  for (const [key, len] of Object.entries(counts)) { pools[key] = new Int32Array(len); filled[key] = 0; }
  const put = (key, k) => { pools[key][filled[key]++] = k; };
  for (const k of ativos) {
    const s = sourceOf(k);
    put('m' + s, k);
    if (gen[k] === 1) { put('w', k); put('w' + s, k); } else if (gen[k] === 2) { put('h', k); put('h' + s, k); }
  }

  const imageOf = (img) => (/^https?:\/\//.test(img) ? img : IMG_PREFIX + img);
  // As fotos que só passam na roleta (borradas, em movimento) vão no tamanho menor de cada site.
  const thumbOf = (img) => imageOf(img)
    .replace('/scale-to-width-down/400', '/scale-to-width-down/200')
    .replace('/uploads/scale_large/', '/uploads/scale_small/')
    .replace('/t_cover_big_2x/', '/t_cover_big/')
    .replace('/t/p/w342/', '/t/p/w185/');
  const thumbsOf = (ks) => cat.imgs(ks).map(thumbOf);
  const valueOfChar = (k) => valueOf(eqOf(k) - 1);
  // r: a linha do banco (id, nome, foto), quando já foi lida junto com outras.
  const card = (k, r = cat.row(k)) => ({ id: r.id, name: r.name, series: seriesOf(k), image: imageOf(r.img), value: valueOfChar(k), rank: pos[k],
    rarity: rarityOf(eqOf(k)), source: sourceOf(k) });
  const usageOf = (store, accountId) => (store.usage[accountId] ||= {});
  const pick = (list) => list[Math.floor(random() * list.length)];

  // Os rolls da janela de 30 min de agora: max = 10 + Safira + os guardados pela Prata; used = quantos já foram.
  // Quando a janela ainda não foi vista, os guardados saem da sobra da janela imediatamente anterior
  // (se a pessoa nem passou por ela, a sobra era a janela cheia). Nada é gravado aqui.
  function rollWindow(u, perks) {
    const current = Math.floor(now() / ROLL_RESET_MS);
    const base = ROLLS_PER_HOUR + perks.extraRolls;
    if (u.rollWindow === current) return { max: base + (u.carry || 0), used: u.rolls, carry: u.carry || 0 };
    const leftover = u.rollWindow === current - 1 ? Math.max(0, base + (u.carry || 0) - u.rolls) : base;
    const carry = Math.min(perks.carry, leftover);
    return { max: base + carry, used: 0, carry };
  }
  const rollsLeft = (u, perks) => { const w = rollWindow(u, perks); return Math.max(0, w.max - w.used); };
  // Quem gastou todos os rolls na janela `windowId` (o servidor avisa essas pessoas quando os rolls voltam).
  const ranOut = (store, windowId) => Object.entries(store.usage || {})
    .filter(([id, u]) => u.rollWindow === windowId && u.rolls >= ROLLS_PER_HOUR + perksOf(store, id).extraRolls + (u.carry || 0))
    .map(([id]) => id);
  const rollsMaxOf = (u, perks) => rollWindow(u, perks).max;
  const claimReady = (u) => !u.lastClaim || Math.floor(u.lastClaim / CLAIM_RESET_MS) < Math.floor(now() / CLAIM_RESET_MS);
  const rollResetIn = () => ROLL_RESET_MS - (now() % ROLL_RESET_MS);
  const claimResetIn = () => CLAIM_RESET_MS - (now() % CLAIM_RESET_MS);
  // Quanto falta para algo que tem espera (0 = já pode).
  const waitFor = (last, ms) => (last && now() - last < ms ? ms - (now() - last) : 0);
  const recentBuys = (u) => (u.buys || []).filter((t) => now() - t < DAY_MS);

  // ---------- kakera ----------
  // (kakeraOf e addKakera vêm de mudae-conta.js.)
  // Contadores: na primeira leitura, o harém de hoje vira o crédito de casamentos e lendários.
  // Por isso toda mudança no harém lê os contadores antes (veja claim, transfer e release).
  const stats = (store, accountId) => statsOf(store, accountId, () => {
    const mine = owned(store, accountId);
    return { claims: mine.length, legendary: mine.filter((k) => rarityOf(eqOf(k)) === 'legendary').length };
  });
  const bump = (store, accountId, key) => { stats(store, accountId); bumpStat(store, accountId, key); };

  function status(store, accountId) {
    const u = usageOf(store, accountId);
    const buys = recentBuys(u);
    const perks = perksOf(store, accountId);
    return { rollsLeft: rollsLeft(u, perks), rollsMax: rollsMaxOf(u, perks), wishMax: WISH_LIMIT + perks.wishSlots,
      reserveReady: reserveReady(u, perks), reserveIn: perks.reserveEveryMs > 0 ? waitFor(u.reserveAt, perks.reserveEveryMs) : 0, rollResetIn: rollResetIn(), claimReady: claimReady(u), claimResetIn: claimResetIn(),
      kakera: kakeraOf(store, accountId), crystals: crystalsToday(store, accountId, now()), dailyIn: waitFor(u.daily, DAILY_MS), dkIn: waitFor(u.dk, DAILY_MS), dkAmount: DK_AMOUNT,
      buysLeft: ROLLS_BUYS - buys.length, buysMax: ROLLS_BUYS, buysIn: buys.length >= ROLLS_BUYS ? DAY_MS - (now() - buys[0]) : 0, rollsPrice: ROLLS_PRICE,
      ...refundStatus(store, accountId, now()) };
  }

  // A reserva da Esmeralda: no máximo 1 guardado, pronto de novo depois de reserveEveryMs.
  const reserveReady = (u, perks) => perks.reserveEveryMs > 0 && !waitFor(u.reserveAt, perks.reserveEveryMs);

  // Os rolls voltam todos agora (o $daily e o $rolls), até o máximo da janela.
  function refillRolls(u, perks) {
    u.carry = rollWindow(u, perks).carry;
    u.rollWindow = Math.floor(now() / ROLL_RESET_MS);
    u.rolls = 0;
  }

  // $daily: os rolls voltam na hora, uma vez a cada 20 h. Com todos os rolls ainda, não gasta.
  function daily(store, accountId) {
    const u = usageOf(store, accountId);
    const wait = waitFor(u.daily, DAILY_MS);
    if (wait) return { error: `O **$daily** volta em **${minutes(wait)}**.` };
    const perks = perksOf(store, accountId);
    const max = rollsMaxOf(u, perks);
    if (rollsLeft(u, perks) === max) return { error: 'Você ainda tem todos os rolls. Guarde o **$daily** para quando eles acabarem!' };
    u.daily = now();
    refillRolls(u, perks);
    return { rollsLeft: max };
  }

  // $dk: o kakera do dia, a cada 20 h.
  function dailyKakera(store, accountId) {
    const u = usageOf(store, accountId);
    const wait = waitFor(u.dk, DAILY_MS);
    if (wait) return { error: `O **$dk** volta em **${minutes(wait)}**.` };
    u.dk = now();
    const amount = perksOf(store, accountId).dkDouble ? DK_AMOUNT * 2 : DK_AMOUNT;
    return { amount, kakera: addKakera(store, accountId, amount) };
  }

  // $rolls: compra os rolls de volta com kakera, até 3 vezes a cada 24 h.
  function buyRolls(store, accountId) {
    const u = usageOf(store, accountId);
    const buys = recentBuys(u);
    if (buys.length >= ROLLS_BUYS) return { error: `Você já usou o **$rolls** ${ROLLS_BUYS} vezes nas últimas 24 h. O próximo libera em **${minutes(DAY_MS - (now() - buys[0]))}**.` };
    const perks = perksOf(store, accountId);
    const max = rollsMaxOf(u, perks);
    if (rollsLeft(u, perks) === max) return { error: 'Você ainda tem todos os rolls.' };
    const have = kakeraOf(store, accountId);
    if (have < ROLLS_PRICE) return { error: `O **$rolls** custa **${ROLLS_PRICE}** kakera e você tem **${have}**. Faltam ${ROLLS_PRICE - have}.` };
    u.buys = [...buys, now()];
    refillRolls(u, perks);
    return { price: ROLLS_PRICE, kakera: addKakera(store, accountId, -ROLLS_PRICE), rollsLeft: max, buysLeft: ROLLS_BUYS - u.buys.length };
  }

  // $givek: passa kakera para outra pessoa.
  function giveKakera(store, from, to, amount) {
    const n = Math.floor(Number(amount));
    if (!Number.isFinite(n) || n < 1) return { error: 'Diga quanto: **$givek @pessoa 100**' };
    if (from === to) return { error: 'Você não pode dar kakera para si mesmo.' };
    const have = kakeraOf(store, from);
    if (have < n) return { error: `Você só tem **${have}** kakera.` };
    addKakera(store, from, -n);
    addKakera(store, to, n);
    return { amount: n, kakera: kakeraOf(store, from) };
  }

  // Desejos da pessoa sem dono que estão na lista do roll (e na raridade, se vier uma).
  const freeWishes = (store, accountId, list, rarity = null) => cat.lookupMany(wishesOf(store, accountId))
    .filter((k) => k !== undefined && !store.claims[idOf(k)] && list.includes(k) && (!rarity || rarityOf(eqOf(k)) === rarity));

  // Rubi: com a chance da medalha (um random a mais, só para quem tem Rubi), o roll vira um desejo da pessoa
  // que esteja na lista que o roll sortearia e não tenha dono. Sem nenhum assim, volta null e o sorteio segue normal.
  // Com a previsão da Vidência, só vale um desejo da raridade prevista, para a previsão se cumprir.
  function wishedPick(store, accountId, list, perks, rarity = null) {
    if (!(perks.wishChance > 0) || random() >= perks.wishChance) return null;
    const fits = freeWishes(store, accountId, list, rarity);
    return fits.length ? pick(fits) : null;
  }

  // ---------- sorteio por raridade (Vidência, Amuleto, Chamar desejo, Escolha dupla) ----------
  // As listas vêm ordenadas pela posição na escala, então cada raridade é um trecho seguido da lista.
  // above: o primeiro da lista que passa da posição x (busca binária).
  function above(list, x) {
    let lo = 0;
    let hi = list.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (eqOf(list[mid]) <= x) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }
  // O trecho [início, fim) da lista com aquela raridade.
  function rangeOf(list, rarity) {
    const i = RARITIES.indexOf(rarity);
    const start = i === RARITIES.length - 1 ? 0 : above(list, RARITY_TOP[RARITIES[i + 1]]);
    return [start, above(list, RARITY_TOP[rarity])];
  }
  // Um personagem daquela raridade. Se a lista não tem nenhum, vale a raridade mais próxima que tiver
  // (no empate, a mais rara).
  function pickInRarity(list, rarity) {
    const i = RARITIES.indexOf(rarity);
    for (let d = 0; d < RARITIES.length; d++) {
      for (const j of d ? [i + d, i - d] : [i]) {
        if (j < 0 || j >= RARITIES.length) continue;
        const [start, end] = rangeOf(list, RARITIES[j]);
        if (end > start) return list[start + Math.floor(random() * (end - start))];
      }
    }
    return pick(list);
  }
  // Sorteia a raridade pelo tanto de personagens de cada uma na lista. O Amuleto multiplica o peso
  // do lendário e do épico (AMULETO). Vai do mais raro para o mais comum.
  function drawRarity(list, amuleto = false) {
    const weights = RARITIES.map((r) => { const [start, end] = rangeOf(list, r); return (end - start) * (amuleto ? AMULETO[r] || 1 : 1); });
    let x = random() * weights.reduce((a, b) => a + b, 0);
    let last = 'common';
    for (let i = RARITIES.length - 1; i >= 0; i--) {
      if (!weights[i]) continue;
      if (x < weights[i]) return RARITIES[i];
      x -= weights[i];
      last = RARITIES[i];
    }
    return last;
  }
  const nameOf = (power) => POWERS.find((p) => p.key === power)?.name || power;

  // Vidência: completa a previsão até 3 rolls, sorteada pela lista $m (com o Amuleto armado, ele pesa no 1º).
  // A previsão guarda só a raridade; o personagem sai na hora do roll, dentro dela, em qualquer comando.
  function foresee(store, accountId) {
    const u = usageOf(store, accountId);
    const future = (u.future ||= []);
    while (future.length < PREVIEW) future.push(drawRarity(pools.m, !future.length && !!u.armed?.amuleto));
    return { future: [...future], wish: !!u.armed?.desejo?.hit };
  }

  // Arma um poder para o próximo roll. O Chamar desejo sorteia os 40% agora, para a Vidência já mostrar o resultado;
  // o Amuleto com uma previsão pendente sorteia de novo o 1º item dela, com os pesos dele, e fica com o mais raro
  // dos dois (o Amuleto só ajuda: um épico previsto nunca vira raro).
  function arm(store, accountId, effect) {
    if (!ARMABLE.includes(effect)) throw new Error('Esse poder não muda o roll.');
    const u = usageOf(store, accountId);
    if (u.armed?.[effect]) throw new Error(`O poder ${nameOf(effect)} já está ativo para o próximo roll.`);
    if (effect === 'desejo' && !wishesOf(store, accountId).length) throw new Error('Sua lista de desejos está vazia.');
    u.armed = { ...u.armed, [effect]: effect === 'desejo' ? { hit: random() < DESEJO_CHANCE } : true };
    if (effect === 'amuleto' && u.future?.length) {
      const again = drawRarity(pools.m, true);
      if (RARITIES.indexOf(again) > RARITIES.indexOf(u.future[0])) u.future[0] = again;
    }
    return { future: u.future?.length ? [...u.future] : null, wish: !!u.armed.desejo?.hit };
  }

  // Para o palco: os poderes ativos para o próximo roll e quantos desejos a pessoa tem (o Chamar desejo precisa de um).
  const armedView = (store, accountId) => ({ armed: Object.keys(store.usage[accountId]?.armed || {}), wishes: wishesOf(store, accountId).length });

  // O personagem do roll. Sem previsão e sem poder armado, é o sorteio de sempre (Rubi ou qualquer um da lista).
  // Com efeito: o desejo chamado, se acertou e algum cabe na lista; senão a raridade prevista (ou sorteada,
  // com o Amuleto se ele estiver armado) e um personagem dentro dela. Gasta os efeitos e um item da previsão.
  // A Escolha dupla traz uma segunda carta, outra da mesma lista, sem efeito nenhum.
  function drawFor(store, accountId, list, perks) {
    const u = usageOf(store, accountId);
    const armed = u.armed;
    if (!u.future?.length && !armed) return { c: wishedPick(store, accountId, list, perks) ?? pick(list) };
    const predicted = u.future?.shift() || null;
    if (u.future && !u.future.length) delete u.future;
    delete u.armed;
    const called = armed?.desejo?.hit ? freeWishes(store, accountId, list) : [];
    // O desejo acertou, mas nenhum cabe neste comando (ex.: $wg com desejos só de anime): o Chamar desejo
    // continua ativo para o próximo roll, em vez de ser gasto à toa.
    if (armed?.desejo?.hit && !called.length && freeWishes(store, accountId, pools.m).length) u.armed = { desejo: armed.desejo };
    const c = (called.length ? pick(called) : null)
      ?? wishedPick(store, accountId, list, perks, predicted)
      ?? pickInRarity(list, predicted || drawRarity(list, !!armed?.amuleto));
    return { c, second: armed?.dupla ? another(list, c) : null };
  }
  function another(list, c) {
    if (list.length < 2) return null;
    let d = c;
    for (let tries = 0; tries < 5 && d === c; tries++) d = pickInRarity(list, drawRarity(list));
    return d === c ? list[(list.indexOf(c) + 1) % list.length] : d;
  }

  // Sorteia um personagem. kind: w/h/m, com ou sem a letra da fonte ($wg = waifu de jogo).
  // Erro (sem rolls) volta como texto para mostrar só a quem pediu.
  // "decoys" são fotos aleatórias para a roleta girar antes de parar no resultado.
  // "second" é a segunda carta da Escolha dupla.
  function roll(store, accountId, kind) {
    const u = usageOf(store, accountId);
    const perks = perksOf(store, accountId);
    const window = rollWindow(u, perks);
    const left = Math.max(0, window.max - window.used);
    if (!left) return { error: `A roleta é limitada a ${window.max} rolls a cada 30 minutos. Os rolls voltam em **${minutes(rollResetIn())}**.` };
    // Sem ninguém daquele gênero, a fonte pedida vale mais que o gênero ($ha sem husbando: qualquer anime).
    const list = [kind, 'm' + (kind?.[1] || ''), kind?.[0], 'm'].map((k) => pools[k]).find((l) => l?.length);
    const { c, second } = drawFor(store, accountId, list, perks);
    const windowId = Math.floor(now() / ROLL_RESET_MS);
    if (u.rollWindow !== windowId) { u.rollWindow = windowId; u.rolls = 0; u.carry = window.carry; }
    u.rolls++;
    bump(store, accountId, 'rolls');
    const decoys = thumbsOf(Array.from({ length: DECOYS }, () => pick(list)));
    const out = card(c);
    const ownerId = store.claims[out.id]?.ownerId || null;
    return { card: out, ownerId, rollsLeft: left - 1, decoys,
      ...(second != null ? { second: { card: card(second), ownerId: store.claims[idOf(second)]?.ownerId || null } } : {}) };
  }

  // Fotos soltas para a roleta girar (o Eco não sorteia, só repete uma carta).
  const spin = (c) => thumbsOf(Array.from({ length: DECOYS }, () => pick(pools['m' + c.source]?.length ? pools['m' + c.source] : pools.m)));

  // Fotos para o navegador já deixar carregadas ao abrir o Salão: a roleta nunca gira vazia,
  // mesmo quando as fotos sorteadas no roll (wikis, Comic Vine) demoram a chegar.
  // Separadas por fonte, para um roll de jogos girar fotos de jogos.
  function warmup(perSource = 8) {
    const picked = Object.keys(sources).map((s) => [s, Array.from({ length: perSource }, () => pick(pools['m' + s]))]);
    const thumbs = thumbsOf(picked.flatMap(([, ks]) => ks));
    return Object.fromEntries(picked.map(([s], i) => [s, thumbs.slice(i * perSource, (i + 1) * perSource)]));
  }

  // Por que esta pessoa não pode casar agora (texto), ou null se pode: a janela normal ou a reserva da Esmeralda.
  function claimError(store, accountId) {
    if (claimReady(usageOf(store, accountId)) || reserveReady(usageOf(store, accountId), perksOf(store, accountId))) return null;
    return `Você já casou nesta janela. Dá para casar de novo em ${minutes(claimResetIn())}.`;
  }

  // Casar com o personagem de um roll. Quem chamar primeiro leva (o servidor processa um de cada vez).
  // revealAt: quando o card aparece. Antes dele, ninguém; nos PRIORITY_MS seguintes, só quem rodou
  // (o Laço, lasso: true, ignora essa prioridade). lockedBy: carta trancada pelo Cadeado, só essa pessoa casa.
  function claim(store, accountId, charId, { revealAt, rollerId = null, priority = 0, lockedBy = null, lasso = false }) {
    if (lookup(charId) === undefined) throw new Error('Personagem desconhecido.');
    if (store.claims[charId]) throw new Error('Esse personagem já tem dono.');
    const t = now();
    if (t < revealAt) throw new Error('Calma, a roleta ainda está girando!');
    if (t - revealAt > CLAIM_WINDOW_MS) throw new Error('Tarde demais: o tempo para casar com esse personagem acabou.');
    if (lockedBy && accountId !== lockedBy) throw new Error('Essa carta está trancada.');
    if (!lasso && rollerId && accountId !== rollerId && t < revealAt + priority) throw new Error('Quem rodou ainda tem prioridade. Espere um instante!');
    const u = usageOf(store, accountId);
    // Janela de casamento já gasta: a reserva da Esmeralda, se estiver pronta, casa no lugar.
    const blocked = claimError(store, accountId);
    if (blocked) throw new Error(blocked);
    const reserve = !claimReady(u);
    if (reserve) u.reserveAt = t;
    else u.lastClaim = t;
    stats(store, accountId);
    store.claims[charId] = { ownerId: accountId, at: t };
    note(store, charId, accountId, 'claim');
    dropWish(store, accountId, charId);
    bumpStat(store, accountId, 'claims');
    if (rarityOf(eqOf(lookup(charId))) === 'legendary') bumpStat(store, accountId, 'legendary');
    return { reserve };
  }

  // Histórico de cada personagem: quantos donos já teve e os últimos (quem, como, quando).
  function note(store, charId, ownerId, how) {
    const k = lookup(charId);
    const key = String(k !== undefined ? idOf(k) ?? charId : charId);
    const h = ((store.hist ||= {})[key] ||= { n: 0, last: [] });
    h.n++;
    h.last.push([ownerId, how, now()]);
    if (h.last.length > HIST_KEEP) h.last.shift();
  }

  // Passa um personagem de uma pessoa para outra (presente ou troca).
  function transfer(store, k, from, to, how) {
    const id = idOf(k);
    // Presente e troca não contam como casamento: os contadores de quem dá e de quem recebe nascem antes.
    stats(store, from);
    stats(store, to);
    const old = store.claims[id];
    // Casamentos de antes do histórico entram nele como o primeiro dono.
    if (old && !store.hist?.[id]) ((store.hist ||= {})[id] = { n: 1, last: [[old.ownerId, 'claim', old.at]] });
    store.claims[id] = { ownerId: to, at: now() };
    if (sameId(store.favorites?.[from], id)) delete store.favorites[from];
    note(store, id, to, how);
    dropWish(store, to, id);
  }

  // As cartas de uma pessoa, da mais valiosa para a menos (os ids são achados numa consulta só).
  function owned(store, accountId) {
    const ids = [];
    for (const [id, cl] of Object.entries(store.claims)) if (cl.ownerId === accountId) ids.push(id);
    return lookupAll(ids).sort(byEq);
  }
  const sum = (list) => list.reduce((total, k) => total + valueOfChar(k), 0);
  const sameId = (a, b) => a !== undefined && a !== null && String(a) === String(b);

  // O favorito escolhido; sem escolha (ou se ele foi solto), o mais valioso.
  function favoriteOf(store, accountId, list = owned(store, accountId)) {
    const chosen = store.favorites?.[accountId];
    let k = chosen !== undefined && store.claims[chosen]?.ownerId === accountId ? lookup(chosen) : undefined;
    if (k === undefined) k = list[0];
    if (k === undefined) return null;
    const out = card(k);
    return { ...out, chosen: sameId(chosen, out.id) };
  }

  // Harem resumido para a mensagem do $mm no chat (até 300). sort: value (padrão), name, series ou recent.
  // Cada item é [k, linha do banco]: as linhas vêm todas numa consulta só.
  const SORTS = {
    name: (a, b) => a[1].name.localeCompare(b[1].name, 'pt'),
    series: (a, b) => seriesOf(a[0]).localeCompare(seriesOf(b[0]), 'pt') || eqOf(a[0]) - eqOf(b[0]),
  };
  function harem(store, accountId, sort = 'value') {
    const list = owned(store, accountId);
    const value = sum(list);
    let items;
    if (sort === 'recent' || SORTS[sort]) {
      const rows = cat.rows(list);
      items = list.map((k, i) => [k, rows[i]]);
      if (sort === 'recent') items.sort((a, b) => store.claims[b[1].id].at - store.claims[a[1].id].at);
      else items.sort(SORTS[sort]);
      items = items.slice(0, HAREM_LIMIT);
    } else {
      sort = 'value';
      const top = list.slice(0, HAREM_LIMIT);
      const rows = cat.rows(top);
      items = top.map((k, i) => [k, rows[i]]);
    }
    return { total: list.length, value, sort, chars: items.map(([k, r]) => card(k, r)) };
  }

  // Álbum completo do Salão, com a data de cada casamento e quem deseja cada carta (para propor troca).
  function album(store, accountId, isMember = () => true) {
    const list = owned(store, accountId);
    const wishes = wishIndex(store, isMember);
    const rows = cat.rows(list);
    return {
      ownerId: accountId, total: list.length, value: sum(list), favorite: favoriteOf(store, accountId, list),
      chars: list.map((k, i) => {
        const r = rows[i];
        const wishedBy = wishes.get(String(r.id));
        return { ...card(k, r), claimedAt: store.claims[r.id].at, ...(wishedBy ? { wishedBy } : {}) };
      }),
    };
  }

  // medals: as medalhas que a pessoa mostra no perfil (já na ordem). Com medalha, o resumo sai mesmo sem personagem.
  function summary(store, accountId, medals = []) {
    const list = owned(store, accountId);
    return list.length || medals.length ? { total: list.length, value: sum(list), favorite: favoriteOf(store, accountId, list), medals } : null;
  }

  function setFavorite(store, accountId, charId) {
    if (charId === null) { if (store.favorites) delete store.favorites[accountId]; return; }
    const k = lookup(charId);
    if (k === undefined || store.claims[idOf(k)]?.ownerId !== accountId) throw new Error('Esse personagem não é seu.');
    (store.favorites ||= {})[accountId] = idOf(k);
  }

  // Ranking por valor total; isMember tira quem saiu do servidor.
  function ranking(store, isMember = () => true) {
    const byOwner = new Map();
    const entries = Object.entries(store.claims);
    const ks = cat.lookupMany(entries.map(([id]) => id));
    entries.forEach(([, cl], i) => {
      const k = ks[i];
      if (k === undefined || !isMember(cl.ownerId)) return;
      if (!byOwner.has(cl.ownerId)) byOwner.set(cl.ownerId, []);
      byOwner.get(cl.ownerId).push(k);
    });
    const rows = [...byOwner].map(([ownerId, list]) => {
      list.sort(byEq);
      return { ownerId, total: list.length, value: sum(list), favorite: favoriteOf(store, ownerId, list) };
    }).sort((a, b) => b.value - a.value || b.total - a.total);
    const legendaries = [...byOwner].flatMap(([ownerId, list]) => list.filter((k) => rarityOf(eqOf(k)) === 'legendary').map((k) => ({ ...card(k), ownerId, eq: eqOf(k) })))
      .sort((a, b) => a.eq - b.eq)
      .map(({ eq, ...c }) => c);
    return { rows, legendaries };
  }

  // Busca pelo nome: igual > começa com > contém. "among" vem ordenado por popularidade,
  // então o primeiro encontrado em cada nível já é o mais popular. Devolve k ou null.
  function find(query, among) {
    const q = normalize(query);
    if (!q) return null;
    let best = null;
    let bestScore = 0;
    for (const k of among) {
      const key = cat.keyOf(k);
      const score = key === q ? 3 : key.startsWith(q) ? 2 : key.includes(q) ? 1 : 0;
      if (score > bestScore) { best = k; bestScore = score; }
      if (bestScore === 3) break;
    }
    return best;
  }
  // A mesma busca em todo o catálogo, primeiro só entre os da roleta e, sem ninguém, entre todos.
  // Usa as chaves num Buffer só (veja mudae-catalogo-banco.js): o resultado é o mesmo do find acima.
  const isActive = (k) => !fora[k];
  const anyone = () => true;
  function findAll(query) {
    const q = normalize(query);
    if (!q) return null;
    return cat.search(q, isActive) ?? cat.search(q, anyone) ?? null;
  }

  // $im: o card, o dono, desde quando e como ficou com ele, quantos donos já teve e quem deseja.
  function info(store, query, isMember = () => true) {
    const k = findAll(query);
    if (k === null) return null;
    const out = card(k);
    const cl = store.claims[out.id];
    const h = store.hist?.[out.id];
    const last = h?.last.at(-1);
    return {
      card: out, ownerId: cl?.ownerId || null, since: cl?.at || null, via: cl ? (last?.[0] === cl.ownerId ? last[1] : 'claim') : null,
      owners: Math.max(h?.n || 0, cl ? 1 : 0), wishedBy: wishersOf(store, out.id, isMember),
    };
  }

  // Divorciar devolve o valor da carta em kakera (até DIVORCE_CAP por dia).
  function release(store, accountId, k) {
    const id = idOf(k);
    stats(store, accountId);
    delete store.claims[id];
    if (sameId(store.favorites?.[accountId], id)) delete store.favorites[accountId];
    const out = card(k);
    const r = refundOf(store, accountId, out.value, now());
    addKakera(store, accountId, r.refund);
    return { ...out, ...r };
  }

  // Quem tem cartas mas não está mais no servidor (isMember diz quem está): dono, quantas cartas e o valor delas.
  function orphans(store, isMember) {
    const byOwner = new Map();
    const entries = Object.entries(store.claims);
    const ks = cat.lookupMany(entries.map(([id]) => id));
    entries.forEach(([, cl], i) => {
      if (isMember(cl.ownerId)) return;
      const row = byOwner.get(cl.ownerId) || { ownerId: cl.ownerId, total: 0, value: 0 };
      row.total++;
      if (ks[i] !== undefined) row.value += valueOfChar(ks[i]);
      byOwner.set(cl.ownerId, row);
    });
    return [...byOwner.values()].sort((a, b) => b.value - a.value || b.total - a.total);
  }

  // Solta todas as cartas de quem saiu, sem devolver kakera (as cartas voltam para a roleta). Devolve quantas soltou.
  function releaseAll(store, accountId) {
    let total = 0;
    for (const [id, cl] of Object.entries(store.claims)) {
      if (cl.ownerId !== accountId) continue;
      delete store.claims[id];
      total++;
    }
    if (store.favorites) delete store.favorites[accountId];
    return total;
  }

  function divorce(store, accountId, query) {
    const k = find(query, owned(store, accountId));
    return k !== null ? release(store, accountId, k) : null;
  }

  // $divorcio: quanto o divórcio ainda devolve e quando o teto de 24 h abre espaço de novo.
  const divorceStatus = (store, accountId) => refundStatus(store, accountId, now());

  function divorceId(store, accountId, charId) {
    const k = lookup(charId);
    if (k === undefined || store.claims[idOf(k)]?.ownerId !== accountId) throw new Error('Esse personagem não é seu.');
    return release(store, accountId, k);
  }

  // ---------- lista de desejos ($wish, $wl, $wr) ----------
  const wishesOf = (store, accountId) => store.wishes?.[accountId] || [];
  function dropWish(store, accountId, charId) {
    const list = store.wishes?.[accountId];
    if (!list) return;
    const left = list.filter((id) => !sameId(id, charId));
    if (left.length) store.wishes[accountId] = left;
    else delete store.wishes[accountId];
  }
  // Quem deseja cada personagem, numa passada só pela lista de todo mundo.
  function wishIndex(store, isMember = () => true) {
    const map = new Map();
    for (const [accountId, list] of Object.entries(store.wishes || {})) {
      if (!isMember(accountId)) continue;
      for (const id of list) {
        const key = String(id);
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(accountId);
      }
    }
    return map;
  }
  const wishersOf = (store, charId, isMember = () => true) => Object.entries(store.wishes || {})
    .filter(([accountId, list]) => isMember(accountId) && list.some((id) => sameId(id, charId))).map(([accountId]) => accountId);

  // Põe um personagem na lista de desejos (pelo comando, com o nome, ou pela estrela na carta, com o id).
  function addWish(store, accountId, k) {
    const { id, name } = cat.row(k);
    const list = wishesOf(store, accountId);
    if (store.claims[id]?.ownerId === accountId) return { error: `**${name}** já é seu!` };
    if (list.some((x) => sameId(x, id))) return { error: `**${name}** já está na sua lista de desejos.` };
    const max = WISH_LIMIT + perksOf(store, accountId).wishSlots;
    if (list.length >= max) return { error: `Sua lista de desejos está cheia (${max}). Tire alguém com **$wr nome**.` };
    (store.wishes ||= {})[accountId] = [...list, id];
    return { card: card(k), ownerId: store.claims[id]?.ownerId || null, total: list.length + 1, max };
  }

  function wish(store, accountId, query) {
    const k = findAll(query);
    return k !== null ? addWish(store, accountId, k) : { error: `Nenhum personagem encontrado para **${String(query).slice(0, 80)}**.` };
  }

  function wishToggle(store, accountId, charId, on) {
    const k = lookup(charId);
    if (k === undefined) throw new Error('Personagem desconhecido.');
    const id = idOf(k);
    const has = wishesOf(store, accountId).some((x) => sameId(x, id));
    if (!on) dropWish(store, accountId, id);
    else if (!has) {
      const r = addWish(store, accountId, k);
      if (r.error) throw new Error(r.error.replaceAll('**', ''));
    }
    return { total: wishesOf(store, accountId).length, max: WISH_LIMIT + perksOf(store, accountId).wishSlots };
  }

  function unwish(store, accountId, query) {
    const k = find(query, lookupAll(wishesOf(store, accountId)));
    if (k === null) return { error: `Ninguém chamado **${String(query).slice(0, 80)}** na sua lista de desejos.` };
    dropWish(store, accountId, idOf(k));
    return { card: card(k), total: wishesOf(store, accountId).length, max: WISH_LIMIT + perksOf(store, accountId).wishSlots };
  }

  function wishlist(store, accountId) {
    const ks = lookupAll(wishesOf(store, accountId));
    const rows = cat.rows(ks);
    const chars = ks.map((k, i) => ({ ...card(k, rows[i]), ownerId: store.claims[rows[i].id]?.ownerId || null }));
    return { ownerId: accountId, total: chars.length, max: WISH_LIMIT + perksOf(store, accountId).wishSlots, chars };
  }

  // ---------- presentes e favorito ----------
  // $give: dá uma carta do seu harém (só quem dá confirma, como no Mudae do Discord).
  function give(store, from, to, query) {
    if (from === to) return { error: 'Você não pode dar um personagem para si mesmo.' };
    const k = find(query, owned(store, from));
    if (k === null) return { error: `Você não tem ninguém chamado **${String(query).slice(0, 80)}** no seu harem.` };
    transfer(store, k, from, to, 'give');
    return { card: card(k) };
  }

  // $fm: escolhe o favorito pelo nome.
  function firstMarry(store, accountId, query) {
    const k = find(query, owned(store, accountId));
    if (k === null) return { error: `Você não tem ninguém chamado **${String(query).slice(0, 80)}** no seu harem.` };
    (store.favorites ||= {})[accountId] = idOf(k);
    return { card: card(k) };
  }

  // ---------- $top, $obra e $topserv ----------
  function findSeries(query) {
    const q = normalize(query);
    if (!q) return null;
    let best = null;
    let bestScore = 0;
    for (const [key, name] of seriesKeys) {
      const score = key === q ? 3 : key.startsWith(q) ? 2 : key.includes(q) ? 1 : 0;
      if (score > bestScore) { best = name; bestScore = score; }
      if (bestScore === 3) break;
    }
    return best;
  }

  // Texto do $top ("waifus anime", "jogos", "Naruto") -> filtro. Sem nada, todos.
  function parseFilter(text, onlySeries = false) {
    const words = normalize(text).split(' ').filter(Boolean);
    if (!words.length) return onlySeries ? null : {};
    if (!onlySeries && words.every((w) => FILTER_OF.has(w))) {
      const f = {};
      for (const w of words) f[/^[FMO]$/.test(FILTER_OF.get(w)) ? 'gender' : 'source'] = FILTER_OF.get(w);
      return f;
    }
    const series = findSeries(text);
    return series ? { series } : null;
  }
  // O filtro vai na mensagem do bot como texto ("F|a|"), e a lista é buscada página a página.
  const filterKey = (f) => [f.gender || '', f.source || '', f.series || ''].join('|');
  function parseKey(key) {
    const [gender = '', source = '', ...rest] = String(key || '').split('|');
    const series = rest.join('|');
    if ((gender && !GENDER_LABEL[gender]) || (source && !SOURCES[source]) || (series && !bySeries.has(series))) return null;
    return { gender, source, series };
  }
  const labelOf = (f) => (f.series ? f.series
    : [f.gender ? GENDER_LABEL[f.gender] : 'Personagens', f.source ? SOURCE_OF[f.source] : ''].filter(Boolean).join(' '));

  const filtered = new Map();
  function listOf(f) {
    if (f.series) return bySeries.get(f.series) || [];
    const key = filterKey(f);
    if (!filtered.has(key)) {
      const base = f.gender === 'F' ? pools['w' + f.source] : f.gender === 'M' ? pools['h' + f.source] : pools['m' + f.source];
      filtered.set(key, f.gender === 'O' ? (base || []).filter((k) => gen[k] === 0) : base || []);
    }
    return filtered.get(key);
  }
  // Quantas cartas da obra têm dono e quantas são de viewerId. Uma obra grande (a Disney tem ~5.900) passa pelos
  // casamentos da comunidade em vez de pelos personagens: a conta é a mesma, porque cada id é de um personagem só.
  function seriesOwners(store, all, series, viewerId) {
    let mine = 0;
    let claimed = 0;
    const count = (owner) => { if (owner) { claimed++; if (owner === viewerId) mine++; } };
    const entries = Object.entries(store.claims);
    if (entries.length < all.length) {
      const s = sidOfSeries.get(series);
      const ks = cat.lookupMany(entries.map(([id]) => id));
      entries.forEach(([, cl], i) => { const k = ks[i]; if (k !== undefined && !fora[k] && sid[k] === s) count(cl?.ownerId); });
    } else {
      for (const r of cat.rows(Array.from(all), false)) count(store.claims[r.id]?.ownerId);
    }
    return { mine, claimed };
  }

  // Para o comando: confere o filtro e devolve o que vai na mensagem.
  function topFilter(text, onlySeries = false) {
    const words = normalize(text).split(' ').filter(Boolean);
    if (words.some((w) => SPECIES_WORDS.has(w)) && words.every((w) => SPECIES_WORDS.has(w) || FILTER_OF.has(w))) {
      return { error: 'O catálogo ainda não separa animais de pessoas. Dá para filtrar por **waifus**, **husbandos**, **outros** (sem gênero), pela fonte (**anime**, **jogos**, **quadrinhos**, **desenhos**, **séries**) ou pelo nome da obra.' };
    }
    const f = parseFilter(text, onlySeries);
    return f ? { key: filterKey(f), label: labelOf(f), series: f.series || null } : null;
  }

  // Uma página do ranking de personagens, com o dono de cada um. Numa obra, quantos já têm dono e quantos são seus.
  function list(store, key, page = 0, viewerId = null, focusId = null) {
    const f = parseKey(key);
    if (!f) return null;
    const all = listOf(f);
    const total = f.series ? all.length : Math.min(all.length, TOP_LIMIT);
    const pages = Math.max(1, Math.ceil(total / LIST_PAGE));
    // focusId: abre na página onde está esse personagem (a busca da aba Personagens leva direto a ele).
    const fk = focusId === null || focusId === undefined ? undefined : lookup(focusId);
    const at = fk === undefined ? -1 : Array.prototype.indexOf.call(all, fk);
    const p = at >= 0 && at < total ? Math.floor(at / LIST_PAGE) : Math.min(Math.max(0, Math.floor(Number(page)) || 0), pages - 1);
    const shown = Array.prototype.slice.call(all, p * LIST_PAGE, Math.min(total, (p + 1) * LIST_PAGE));
    const rows = cat.rows(shown);
    const chars = shown.map((k, i) => ({ ...card(k, rows[i]), pos: p * LIST_PAGE + i + 1, ownerId: store.claims[rows[i].id]?.ownerId || null }));
    const out = { key: filterKey(f), label: labelOf(f), series: f.series || null, total, page: p, pages, chars };
    if (at >= 0 && at < total) out.focus = String(idOf(fk));
    if (f.series) Object.assign(out, seriesOwners(store, all, f.series, viewerId));
    return out;
  }

  // Sugestões da busca da aba Personagens: obras, personagens (pelo nome) e, se o texto for só "waifus jogos",
  // o filtro correspondente. Gênero e fonte (os mesmos chips da tela) valem para os personagens; a fonte, para as obras.
  const SUGGEST_MAX = 6;
  const GENDER_CODE = { F: 1, M: 2, O: 0 };
  function suggest(store, text, { gender = '', source = '', limit = SUGGEST_MAX } = {}) {
    const q = normalize(String(text || '').slice(0, 80));
    const out = { series: [], chars: [], filter: null };
    if (q.length < 2) return out;
    const max = Math.min(Math.max(1, Math.floor(Number(limit)) || SUGGEST_MAX), 10);
    const words = q.split(' ');
    const g = GENDER_CODE[gender];
    const src = SOURCES[source] ? source : '';
    if (words.every((w) => FILTER_OF.has(w))) {
      const f = parseFilter(q);
      out.filter = { key: filterKey(f), label: labelOf(f), gender: f.gender || '', source: f.source || '' };
    }
    // Obras: igual > começa com > uma palavra começa com > contém > tem todas as palavras. Dentro de cada nível, as mais populares.
    const ranked = [];
    seriesKeys.forEach(([key, name], i) => {
      const score = key === q ? 5 : key.startsWith(q) ? 4 : key.includes(' ' + q) ? 3 : key.includes(q) ? 2 : words.length > 1 && words.every((w) => key.includes(w)) ? 1 : 0;
      if (score) ranked.push([score, i, name]);
    });
    ranked.sort((a, b) => b[0] - a[0] || a[1] - b[1]);
    for (const [, , name] of ranked) {
      const ks = bySeries.get(name);
      if (src && sourceOf(ks[0]) !== src) continue;
      out.series.push({ name, count: ks.length, source: sourceOf(ks[0]) });
      if (out.series.length >= max) break;
    }
    // Personagens: o mesmo trio igual > começa com > contém; com mais de uma palavra, também fora de ordem ("naruto uzumaki").
    const ok = (k) => !fora[k] && (g === undefined || gen[k] === g) && (!src || sourceOf(k) === src);
    let ks = cat.searchMany(q, ok, max);
    if (ks.length < max && words.length > 1) {
      const longest = words.reduce((a, b) => (b.length > a.length ? b : a));
      for (const k of cat.searchMany(longest, (x) => ok(x) && words.every((w) => cat.keyOf(x).includes(w)), max)) if (!ks.includes(k)) ks.push(k);
      ks = ks.slice(0, max);
    }
    const rows = cat.rows(ks);
    out.chars = ks.map((k, i) => {
      const c = card(k, rows[i]);
      return { id: c.id, name: c.name, series: c.series, image: c.image, rarity: c.rarity, source: c.source, rank: c.rank, ownerId: store.claims[c.id]?.ownerId || null };
    });
    return out;
  }

  // ---------- trocas ----------
  // Ficam só na memória: uma reinicialização do servidor cancela todas sem mexer em ninguém.
  // Cada lado escolhe o que oferece; qualquer mudança desfaz as duas confirmações e muda a "rev",
  // e a confirmação só vale para a rev que a pessoa viu. Na hora de trocar, tudo é conferido de novo.
  const trades = new Map();
  let tradeSeq = 0;
  const openTrades = () => [...trades.values()].filter((t) => t.state === 'open');
  const tradeOf = (serverId, accountId) => openTrades().find((t) => t.serverId === serverId && (t.a === accountId || t.b === accountId)) || null;
  const otherSide = (t, accountId) => (t.a === accountId ? t.b : t.a);
  function tradeFor(id, accountId) {
    const t = trades.get(String(id));
    if (!t || (t.a !== accountId && t.b !== accountId)) throw new Error('Troca não encontrada.');
    return t;
  }
  function touch(t) {
    t.rev++;
    t.ok = { [t.a]: false, [t.b]: false };
    t.expires = now() + TRADE_TTL;
  }
  function finish(t, state, reason = null) {
    t.state = state;
    t.reason = reason;
    trades.delete(t.id);
    return t;
  }

  function tradeOpen(store, { serverId, a, b }) {
    if (a === b) throw new Error('Você não pode trocar com você mesmo.');
    sweep();
    if (tradeOf(serverId, a)) throw new Error('Você já tem uma troca aberta. Termine ou cancele ela antes.');
    if (tradeOf(serverId, b)) throw new Error('Essa pessoa já está numa troca. Espere ela acabar.');
    const t = { id: 't' + (++tradeSeq) + '-' + now().toString(36), serverId, a, b, state: 'open', reason: null, rev: 0, at: now(), expires: 0,
      offers: { [a]: { chars: [], kakera: 0 }, [b]: { chars: [], kakera: 0 } }, ok: {} };
    touch(t);
    trades.set(t.id, t);
    return t;
  }

  // Muda a oferta de um lado: só cartas que são dele e kakera que ele tem.
  function tradeOffer(store, id, accountId, { chars = [], kakera = 0 } = {}) {
    const t = tradeFor(id, accountId);
    if (t.state !== 'open') throw new Error('Essa troca já acabou.');
    const ids = [...new Set((Array.isArray(chars) ? chars : []).map((x) => String(x).slice(0, 64)))];
    if (ids.length > TRADE_MAX) throw new Error(`No máximo ${TRADE_MAX} personagens de cada lado.`);
    const list = ids.map((x) => {
      const k = lookup(x);
      if (k === undefined || store.claims[idOf(k)]?.ownerId !== accountId) throw new Error('Você só pode oferecer personagens do seu harem.');
      return idOf(k);
    });
    const k = Math.floor(Number(kakera)) || 0;
    if (k < 0) throw new Error('Kakera inválido.');
    if (k > kakeraOf(store, accountId)) throw new Error(`Você só tem ${kakeraOf(store, accountId)} kakera.`);
    t.offers[accountId] = { chars: list, kakera: k };
    touch(t);
    return t;
  }

  // Confirma (ok = true) ou desfaz a confirmação. Com os dois confirmados, a troca acontece:
  // confere tudo antes e só então mexe, então ou troca tudo ou nada muda.
  function tradeConfirm(store, id, accountId, { rev, ok = true, isMember = () => true } = {}) {
    const t = tradeFor(id, accountId);
    if (t.state !== 'open') throw new Error('Essa troca já acabou.');
    if (now() > t.expires) { finish(t, 'canceled', 'O tempo acabou.'); return t; }
    if (rev !== t.rev) throw new Error('A troca mudou. Confira de novo antes de confirmar.');
    const oa = t.offers[t.a];
    const ob = t.offers[t.b];
    if (ok && !oa.chars.length && !ob.chars.length && !oa.kakera && !ob.kakera) throw new Error('A troca está vazia.');
    t.ok[accountId] = !!ok;
    if (!t.ok[t.a] || !t.ok[t.b]) return t;
    for (const who of [t.a, t.b]) {
      if (!isMember(who)) return finish(t, 'canceled', 'Alguém saiu do servidor.');
      const offer = t.offers[who];
      for (const charId of offer.chars) {
        if (store.claims[charId]?.ownerId !== who) {
          const k = lookup(charId);
          return finish(t, 'canceled', `${(k !== undefined ? cat.row(k).name : undefined) || 'Um personagem'} não estava mais no harem de quem ofereceu.`);
        }
      }
      if (kakeraOf(store, who) < offer.kakera) return finish(t, 'canceled', 'Faltou kakera para fechar a troca.');
    }
    for (const charId of oa.chars) transfer(store, lookup(charId), t.a, t.b, 'trade');
    for (const charId of ob.chars) transfer(store, lookup(charId), t.b, t.a, 'trade');
    addKakera(store, t.a, ob.kakera - oa.kakera);
    addKakera(store, t.b, oa.kakera - ob.kakera);
    return finish(t, 'done');
  }

  function tradeCancel(id, accountId, name = '') {
    const t = tradeFor(id, accountId);
    if (t.state !== 'open') return t;
    return finish(t, 'canceled', name ? `${name} cancelou.` : 'Cancelada por quem estava na troca.');
  }

  // Trocas vencidas saem da lista (o servidor também agenda o fim de cada uma para avisar na hora).
  function sweep() {
    const done = [];
    for (const t of openTrades()) if (now() > t.expires) done.push(finish(t, 'canceled', 'O tempo acabou.'));
    return done;
  }
  function tradeExpire(id) {
    const t = trades.get(String(id));
    if (!t || t.state !== 'open' || now() < t.expires) return null;
    return finish(t, 'canceled', 'O tempo acabou.');
  }

  // O que os dois veem: as cartas de cada lado (com foto e valor), o kakera e quem já confirmou.
  function tradeView(store, t) {
    const side = (who) => ({ chars: lookupAll(t.offers[who].chars).map((k) => card(k)), kakera: t.offers[who].kakera, ok: !!t.ok[who] });
    return { id: t.id, a: t.a, b: t.b, state: t.state, reason: t.reason, rev: t.rev, expires: t.expires, sides: { [t.a]: side(t.a), [t.b]: side(t.b) } };
  }

  // Quantos personagens há em cada fonte na roleta (a tela mostra só os filtros que existem).
  const sources = Object.fromEntries(srcOrder.map((s) => [s, pools['m' + s].length]).filter(([, len]) => len));

  return { size: ativos.length, sources, parse, status, ranOut, roll, foresee, arm, armedView, warmup, spin, claim, claimError, harem, album, summary, setFavorite, ranking, info, divorce, divorceStatus, divorceId, orphans, releaseAll,
    kakeraOf, addKakera, crystalsToday: (store, accountId) => crystalsToday(store, accountId, now()), countCrystal: (store, accountId) => bump(store, accountId, 'crystals'), stats, daily, dailyKakera, buyRolls, giveKakera, wish, wishToggle, unwish, wishlist, wishersOf, give, firstMarry, topFilter, list, suggest,
    tradeOpen, tradeOffer, tradeConfirm, tradeCancel, tradeExpire, tradeOf, tradeView, otherSide, sweepTrades: sweep,
    card: (id) => { const k = lookup(id); return k !== undefined ? card(k) : null; },
    // Ao ligar: deixa no cache as cartas que já têm dono, para o primeiro harém ou álbum não esperar o disco.
    preload: (ids) => cat.preload(ids) };
}

module.exports = { createMudae, parse, isRoll, valueOf, rarityOf, normalize, SOURCES, ROLLS_PER_HOUR, ROLL_RESET_MS, CLAIM_RESET_MS, CLAIM_WINDOW_MS, REVEAL_MS, revealDelay, PRIORITY_MS,
  DAILY_MS, DK_AMOUNT, ROLLS_PRICE, ROLLS_BUYS, WISH_LIMIT, TRADE_TTL, TRADE_MAX, LIST_PAGE, TOP_LIMIT };
