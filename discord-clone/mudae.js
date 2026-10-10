// Mudae: rodar personagens ($w/$h/$m), casar com eles e montar o seu harem.
// Os personagens vêm do mudae-catalogo.json (gerado por tools/mudae-catalogo.js a partir do AniList,
// IGDB, Comic Vine, TMDB e wikis do Fandom) e ficam na memória: um roll é só um sorteio, sem rede.
// As fotos vão direto do site de cada fonte para o navegador. Cada comunidade guarda
// { claims, usage, favorites } e os limites são contados pelo relógio, sem nenhum timer rodando.
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
const IMG_PREFIX = 'https://s4.anilist.co/file/anilistcdn/character/large/';

// Fontes de personagens. A letra é o sufixo do comando ($wa, $hg…), como no Mudae do Discord.
const SOURCES = { a: 'Anime', g: 'Jogos', c: 'Quadrinhos', d: 'Desenhos', s: 'Séries' };
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
};
for (const s of Object.keys(SOURCES)) for (const kind of ['w', 'h', 'm']) COMMANDS[kind + s] = kind + s;

// Valor do card: cai com a posição no ranking (o nº 1 vale 1200, o 15.000º uns 45).
const valueOf = (rank) => Math.max(30, Math.round(1200 / (1 + rank / 250) ** 0.8));
// Raridade pela posição (1 = mais popular): lendário 1–100, épico até 1000, raro até 5000.
const rarityOf = (position) => (position <= 100 ? 'legendary' : position <= 1000 ? 'epic' : position <= 5000 ? 'rare' : 'common');
const normalize = (s) => String(s || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

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
function createMudae({ catalog, now = Date.now, random = Math.random, refSize = REF_SIZE }) {
  const bySource = new Map();
  for (const [id, name, series, img, gender, score = 0, source = 'a'] of catalog) {
    if (!SOURCES[source]) continue;
    if (!bySource.has(source)) bySource.set(source, []);
    bySource.get(source).push({ id, name, series, img, gender, score, source, key: normalize(name) });
  }
  for (const list of bySource.values()) {
    list.sort((a, b) => b.score - a.score);
    list.forEach((c, i) => {
      c.pos = i + 1;
      c.eq = (i + 1) * refSize / list.length; // posição equivalente numa fonte de 15 mil
    });
  }
  // Mais popular primeiro (entre todas as fontes): a busca do $im desempata por aqui.
  const chars = [...bySource.values()].flat().sort((a, b) => a.eq - b.eq);
  const byId = new Map(chars.map((c) => [String(c.id), c]));
  const lookup = (id) => byId.get(String(id));
  const pools = {};
  const pool = (name, filter) => { pools[name] = chars.filter(filter); };
  pool('m', () => true);
  pool('w', (c) => c.gender === 'F');
  pool('h', (c) => c.gender === 'M');
  for (const s of bySource.keys()) {
    pool('m' + s, (c) => c.source === s);
    pool('w' + s, (c) => c.source === s && c.gender === 'F');
    pool('h' + s, (c) => c.source === s && c.gender === 'M');
  }

  const imageOf = (c) => (/^https?:\/\//.test(c.img) ? c.img : IMG_PREFIX + c.img);
  // As fotos que só passam na roleta (borradas, em movimento) vão no tamanho menor de cada site.
  const thumbOf = (c) => imageOf(c)
    .replace('/scale-to-width-down/400', '/scale-to-width-down/200')
    .replace('/uploads/scale_large/', '/uploads/scale_small/')
    .replace('/t_cover_big_2x/', '/t_cover_big/')
    .replace('/t/p/w342/', '/t/p/w185/');
  const valueOfChar = (c) => valueOf(c.eq - 1);
  const card = (c) => ({ id: c.id, name: c.name, series: c.series, image: imageOf(c), value: valueOfChar(c), rank: c.pos,
    rarity: rarityOf(c.eq), source: c.source });
  const usageOf = (store, accountId) => (store.usage[accountId] ||= {});
  const pick = (list) => list[Math.floor(random() * list.length)];

  function rollsLeft(u) {
    return u.rollWindow === Math.floor(now() / ROLL_RESET_MS) ? Math.max(0, ROLLS_PER_HOUR - u.rolls) : ROLLS_PER_HOUR;
  }
  const claimReady = (u) => !u.lastClaim || Math.floor(u.lastClaim / CLAIM_RESET_MS) < Math.floor(now() / CLAIM_RESET_MS);
  const rollResetIn = () => ROLL_RESET_MS - (now() % ROLL_RESET_MS);
  const claimResetIn = () => CLAIM_RESET_MS - (now() % CLAIM_RESET_MS);

  function status(store, accountId) {
    const u = usageOf(store, accountId);
    return { rollsLeft: rollsLeft(u), rollsMax: ROLLS_PER_HOUR, rollResetIn: rollResetIn(), claimReady: claimReady(u), claimResetIn: claimResetIn() };
  }

  // Sorteia um personagem. kind: w/h/m, com ou sem a letra da fonte ($wg = waifu de jogo).
  // Erro (sem rolls) volta como texto para mostrar só a quem pediu.
  // "decoys" são fotos aleatórias para a roleta girar antes de parar no resultado.
  function roll(store, accountId, kind) {
    const u = usageOf(store, accountId);
    const left = rollsLeft(u);
    if (!left) return { error: `A roleta é limitada a ${ROLLS_PER_HOUR} rolls a cada 30 minutos. Os rolls voltam em **${minutes(rollResetIn())}**.` };
    // Sem ninguém daquele gênero, a fonte pedida vale mais que o gênero ($ha sem husbando: qualquer anime).
    const list = [kind, 'm' + (kind?.[1] || ''), kind?.[0], 'm'].map((k) => pools[k]).find((l) => l?.length);
    const c = pick(list);
    const windowId = Math.floor(now() / ROLL_RESET_MS);
    if (u.rollWindow !== windowId) { u.rollWindow = windowId; u.rolls = 0; }
    u.rolls++;
    const decoys = Array.from({ length: DECOYS }, () => thumbOf(pick(list)));
    return { card: card(c), ownerId: store.claims[c.id]?.ownerId || null, rollsLeft: left - 1, decoys };
  }

  // Fotos para o navegador já deixar carregadas ao abrir o Salão: a roleta nunca gira vazia,
  // mesmo quando as fotos sorteadas no roll (wikis, Comic Vine) demoram a chegar.
  // Separadas por fonte, para um roll de jogos girar fotos de jogos.
  function warmup(perSource = 8) {
    return Object.fromEntries([...bySource.keys()].map((s) => [s, Array.from({ length: perSource }, () => thumbOf(pick(pools['m' + s])))]));
  }

  // Casar com o personagem de um roll. Quem chamar primeiro leva (o servidor processa um de cada vez).
  // revealAt: quando o card aparece. Antes dele, ninguém; nos PRIORITY_MS seguintes, só quem rodou.
  function claim(store, accountId, charId, { revealAt, rollerId = null, priority = 0 }) {
    if (!lookup(charId)) throw new Error('Personagem desconhecido.');
    if (store.claims[charId]) throw new Error('Esse personagem já tem dono.');
    const t = now();
    if (t < revealAt) throw new Error('Calma, a roleta ainda está girando!');
    if (t - revealAt > CLAIM_WINDOW_MS) throw new Error('Tarde demais: o tempo para casar com esse personagem acabou.');
    if (rollerId && accountId !== rollerId && t < revealAt + priority) throw new Error('Quem rodou ainda tem prioridade. Espere um instante!');
    const u = usageOf(store, accountId);
    if (!claimReady(u)) throw new Error(`Você já casou nesta janela. Dá para casar de novo em ${minutes(claimResetIn())}.`);
    u.lastClaim = t;
    store.claims[charId] = { ownerId: accountId, at: t };
  }

  const owned = (store, accountId) => Object.entries(store.claims)
    .filter(([, cl]) => cl.ownerId === accountId)
    .map(([id]) => lookup(id))
    .filter(Boolean)
    .sort((a, b) => a.eq - b.eq);
  const sum = (list) => list.reduce((total, c) => total + valueOfChar(c), 0);
  const sameId = (a, b) => a !== undefined && a !== null && String(a) === String(b);

  // O favorito escolhido; sem escolha (ou se ele foi solto), o mais valioso.
  function favoriteOf(store, accountId, list = owned(store, accountId)) {
    const chosen = store.favorites?.[accountId];
    const c = (chosen !== undefined && store.claims[chosen]?.ownerId === accountId && lookup(chosen)) || list[0];
    return c ? { ...card(c), chosen: sameId(chosen, c.id) } : null;
  }

  // Harem resumido para a mensagem do $mm no chat (até 300, os mais valiosos).
  function harem(store, accountId) {
    const list = owned(store, accountId);
    return { total: list.length, value: sum(list), chars: list.slice(0, HAREM_LIMIT).map(card) };
  }

  // Álbum completo do Salão, com a data de cada casamento.
  function album(store, accountId) {
    const list = owned(store, accountId);
    return {
      ownerId: accountId, total: list.length, value: sum(list), favorite: favoriteOf(store, accountId, list),
      chars: list.map((c) => ({ ...card(c), claimedAt: store.claims[c.id].at })),
    };
  }

  function summary(store, accountId) {
    const list = owned(store, accountId);
    return list.length ? { total: list.length, value: sum(list), favorite: favoriteOf(store, accountId, list) } : null;
  }

  function setFavorite(store, accountId, charId) {
    if (charId === null) { if (store.favorites) delete store.favorites[accountId]; return; }
    const c = lookup(charId);
    if (!c || store.claims[c.id]?.ownerId !== accountId) throw new Error('Esse personagem não é seu.');
    (store.favorites ||= {})[accountId] = c.id;
  }

  // Ranking por valor total; isMember tira quem saiu do servidor.
  function ranking(store, isMember = () => true) {
    const byOwner = new Map();
    for (const [id, cl] of Object.entries(store.claims)) {
      const c = lookup(id);
      if (!c || !isMember(cl.ownerId)) continue;
      if (!byOwner.has(cl.ownerId)) byOwner.set(cl.ownerId, []);
      byOwner.get(cl.ownerId).push(c);
    }
    const rows = [...byOwner].map(([ownerId, list]) => {
      list.sort((a, b) => a.eq - b.eq);
      return { ownerId, total: list.length, value: sum(list), favorite: favoriteOf(store, ownerId, list) };
    }).sort((a, b) => b.value - a.value || b.total - a.total);
    const legendaries = [...byOwner].flatMap(([ownerId, list]) => list.filter((c) => rarityOf(c.eq) === 'legendary').map((c) => ({ ...card(c), ownerId, eq: c.eq })))
      .sort((a, b) => a.eq - b.eq)
      .map(({ eq, ...c }) => c);
    return { rows, legendaries };
  }

  // Busca pelo nome: igual > começa com > contém. "among" vem ordenado por popularidade,
  // então o primeiro encontrado em cada nível já é o mais popular.
  function find(query, among = chars) {
    const q = normalize(query);
    if (!q) return null;
    let best = null;
    let bestScore = 0;
    for (const c of among) {
      const score = c.key === q ? 3 : c.key.startsWith(q) ? 2 : c.key.includes(q) ? 1 : 0;
      if (score > bestScore) { best = c; bestScore = score; }
      if (bestScore === 3) break;
    }
    return best;
  }

  function info(store, query) {
    const c = find(query);
    return c ? { card: card(c), ownerId: store.claims[c.id]?.ownerId || null } : null;
  }

  function release(store, accountId, c) {
    delete store.claims[c.id];
    if (sameId(store.favorites?.[accountId], c.id)) delete store.favorites[accountId];
    return card(c);
  }

  function divorce(store, accountId, query) {
    const c = find(query, owned(store, accountId));
    return c ? release(store, accountId, c) : null;
  }

  function divorceId(store, accountId, charId) {
    const c = lookup(charId);
    if (!c || store.claims[c.id]?.ownerId !== accountId) throw new Error('Esse personagem não é seu.');
    return release(store, accountId, c);
  }

  // Quantos personagens há em cada fonte (a tela mostra só os filtros que existem).
  const sources = Object.fromEntries([...bySource].map(([s, list]) => [s, list.length]));

  return { size: chars.length, sources, parse, status, roll, warmup, claim, harem, album, summary, setFavorite, ranking, info, divorce, divorceId,
    card: (id) => (lookup(id) ? card(lookup(id)) : null) };
}

module.exports = { createMudae, parse, valueOf, rarityOf, normalize, SOURCES, ROLLS_PER_HOUR, ROLL_RESET_MS, CLAIM_RESET_MS, CLAIM_WINDOW_MS, REVEAL_MS, revealDelay, PRIORITY_MS };
