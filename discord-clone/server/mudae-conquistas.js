// Mudae: conquistas e marcos. Por servidor, como os casamentos e o kakera: tudo mora no store da comunidade.
//   store.achievements[conta] = { done: { 'giro:1': quando, ... }, queue, title, d: contadores derivados }
//
// Regras (docs/planos/PLANO-MUDAE-CONQUISTAS-2026-11-24.md):
// - Conquista nunca tira nada nem expira. Vem de contadores que o servidor guarda (nada vem do cliente).
// - Kakera de conquista paga uma vez, inteiro, sem teto por dia (a fila só guarda até a avaliação seguinte).
// - Na primeira avaliação de uma pessoa, o que ela já tinha feito abre de uma vez, sem aviso. Quem jogou no último mês antes
//   da atualização (lista guardada em achievements._retro por snapshotRetro) também recebe o kakera; os demais entram só com
//   título e vantagem.
const { ACHIEVEMENTS: A } = require('./mudae-regras');
const { addKakera } = require('./mudae-conta');

const TIER = ['bronze', 'prata', 'ouro'];
const keyOf = (trail, tier) => `${trail}:${tier}`;

// Todas as conquistas numa lista só: { key, trail, tier (1 a 3; 0 nas escondidas), cat, name, trailName, count, need, kakera, hidden, hint }.
const ALL = [];
for (const [trail, cat, trailName, count, needs, names] of A.trails) {
  needs.forEach((need, i) => ALL.push({ key: keyOf(trail, i + 1), trail, tier: i + 1, cat, name: names[i], trailName, count, need, kakera: A.noKakera.includes(trail) ? 0 : A.kakera[i], hidden: false }));
}
for (const [trail, name, count, need, hint] of A.hidden) ALL.push({ key: keyOf(trail, 1), trail, tier: 1, cat: 'ocultas', name, trailName: name, count, need, kakera: A.hiddenKakera, hidden: true, hint });
// As coletivas: o servidor chega à meta e quem jogava no último mês ganha (a lista fica guardada no momento da meta).
const [SRV_TRAIL, SRV_CAT, SRV_NAME, SRV_COUNT, SRV_NEEDS, SRV_NAMES, SRV_KAKERA] = A.serverTrail;
SRV_NEEDS.forEach((need, i) => ALL.push({ key: keyOf(SRV_TRAIL, i + 1), trail: SRV_TRAIL, tier: i + 1, cat: SRV_CAT, name: SRV_NAMES[i], trailName: SRV_NAME, count: SRV_COUNT, need, kakera: SRV_KAKERA[i], hidden: false, server: true }));
const BY_KEY = new Map(ALL.map((a) => [a.key, a]));

const entryOf = (store, accountId) => store.achievements?.[accountId];
const isDone = (store, accountId, key) => !!entryOf(store, accountId)?.done?.[key];

// Vantagens permanentes que as conquistas de ouro dão. Soma tudo o que a pessoa já abriu.
function achievementPerks(store, accountId) {
  const out = { wishSlots: 0, carry: 0, rollsDiscount: 0 };
  const done = entryOf(store, accountId)?.done;
  if (!done) return out;
  for (const [key, perk] of Object.entries(A.perks)) {
    if (!done[key]) continue;
    out.wishSlots += perk.wishSlots || 0;
    out.carry += perk.carry || 0;
    out.rollsDiscount += perk.rollsDiscount || 0;
  }
  return out;
}

// O texto do título escolhido (o nome da conquista), ou null.
const titleName = (store, accountId) => {
  const e = entryOf(store, accountId);
  return e?.title && e.done?.[e.title] ? BY_KEY.get(e.title)?.name || null : null;
};

function createConquistas({ now = Date.now } = {}) {
  // Paga tudo o que está na fila.
  function payQueue(store, accountId) {
    const e = entryOf(store, accountId);
    if (!e?.queue) return 0;
    const give = e.queue;
    addKakera(store, accountId, give, { transfer: true });
    delete e.queue;
    return give;
  }

  // Abre o que chegou à meta. ctx: os contadores (rolls, claims, haremSize...). Devolve { fresh, first, changed, paid }:
  // fresh são as conquistas novas que merecem aviso (nunca vem na primeira avaliação).
  function refresh(store, accountId, ctx) {
    const first = !entryOf(store, accountId);
    const retro = first && !!store.achievements?._retro?.members?.includes(accountId); // jogou no último mês: leva o kakera
    const e = ((store.achievements ||= {})[accountId] ||= { done: {} });
    const fresh = [];
    const serverEvents = [];
    let changed = first;
    const t = now();
    for (const a of ALL) {
      if (a.server || e.done[a.key] || (ctx[a.count] || 0) < a.need) continue;
      e.done[a.key] = t;
      changed = true;
      if (!first || retro) e.queue = (e.queue || 0) + a.kakera;
      if (!first) {
        fresh.push({ key: a.key, name: a.name, trail: a.trail, trailName: a.trailName, tier: a.tier, cat: a.cat, hidden: a.hidden, kakera: a.kakera, perk: A.perks[a.key]?.label || null });
      }
    }
    // Do servidor: a meta é do servidor inteiro. No instante em que ela é alcançada, guarda quem jogou no último mês; cada um
    // deles abre a conquista na próxima avaliação (sem aviso público por pessoa, só um aviso no momento da meta).
    const srv = ((store.achievements ||= {})._server ||= { goals: {} });
    for (const a of ALL) {
      if (!a.server) continue;
      if ((ctx.serverClaims || 0) >= a.need && !srv.goals[a.key]) {
        srv.goals[a.key] = { at: t, members: (ctx.activeMembers?.() || []).slice(0, 500) };
        serverEvents.push({ key: a.key, name: a.name, need: a.need });
        changed = true;
      }
      if (e.done[a.key] || !srv.goals[a.key]?.members.includes(accountId)) continue;
      e.done[a.key] = t;
      changed = true;
      if (!first || retro) e.queue = (e.queue || 0) + a.kakera;
      if (!first) {
        fresh.push({ key: a.key, name: a.name, trail: a.trail, trailName: a.trailName, tier: a.tier, cat: a.cat, hidden: false, server: true, kakera: a.kakera, perk: null });
      }
    }
    const paid = payQueue(store, accountId);
    if (paid) changed = true;
    return { fresh, first, changed, paid, serverEvents };
  }

  // Guarda, uma vez só por servidor, quem jogou no último mês. Roda na partida do servidor, antes de qualquer pessoa jogar com as
  // conquistas no ar (o dia da última jogada é atualizado a cada roll, então depois não dá mais para saber).
  function snapshotRetro(store, isActive) {
    const root = (store.achievements ||= {});
    if (root._retro) return false;
    root._retro = { at: now(), members: Object.entries(store.stats || {}).filter(([id, s]) => isActive(id, s)).map(([id]) => id) };
    return true;
  }

  // Conserto da 2.8.0, uma vez por servidor. O dia da última jogada (stats.lastDay) só passou a existir na 2.8.0, então na
  // partida ninguém o tinha: a lista do retroativo saiu vazia e a meta "Cem casamentos" (alcançada na hora) só pegou quem já
  // tinha rolado depois da atualização. Aqui a lista é refeita pela última jogada (lastPlayed, em ms: último roll ou
  // casamento), quem ficou de fora das metas do servidor entra nelas (abre na avaliação seguinte, com aviso e kakera) e quem
  // abriu as conquistas do histórico sem kakera recebe agora. Também paga o que sobrou na fila do antigo teto diário.
  //   lastPlayed(id): ms da última jogada; playedBefore(id): já jogava antes da 2.8.0; rollsOf(id); isMember(id).
  // Devolve { conta: kakera pago agora } ou null se já rodou.
  function repairRetro(store, { lastPlayed, playedBefore, rollsOf, isMember }) {
    const root = store.achievements;
    if (!root?._retro || root._retroFix) return null;
    const since = root._retro.at - A.activeDays * 86_400_000;
    const ids = new Set([...Object.keys(store.stats || {}), ...Object.keys(store.usage || {})]);
    const active = [...ids].filter((id) => lastPlayed(id) >= since);
    const before = new Set(root._retro.members);
    root._retro.members = [...new Set([...before, ...active])];
    const retro = new Set(root._retro.members);
    for (const goal of Object.values(root._server?.goals || {})) {
      for (const id of active) {
        if (goal.members.length >= 500) break;
        if (!goal.members.includes(id) && rollsOf(id) >= A.activeMinRolls && isMember(id)) goal.members.push(id);
      }
    }
    const paid = {};
    for (const [id, e] of Object.entries(root)) {
      if (id[0] === '_' || !e?.done) continue;
      const keys = Object.keys(e.done);
      if (keys.length && !before.has(id) && retro.has(id)) {
        // Nunca recebeu kakera de conquista: tudo o que abriu veio do histórico. Senão, o histórico é o primeiro lote (abertas
        // no mesmo instante), e só para quem já jogava antes (quem chegou depois abriu o primeiro lote jogando, e já recebeu).
        let unpaid = [];
        if (!e.paid && !e.queue) unpaid = keys;
        else if (playedBefore(id)) { const t0 = Math.min(...keys.map((k) => e.done[k])); unpaid = keys.filter((k) => e.done[k] === t0); }
        const owed = unpaid.reduce((n, k) => n + (BY_KEY.get(k)?.kakera || 0), 0);
        if (owed) e.queue = (e.queue || 0) + owed;
      }
      delete e.paid; // do antigo teto diário
      const give = payQueue(store, id);
      if (give) paid[id] = give;
    }
    root._retroFix = { at: now(), paid };
    return paid;
  }

  function setTitle(store, accountId, key) {
    const e = entryOf(store, accountId);
    if (key === null || key === '') { if (e) delete e.title; return { title: null }; }
    if (!e?.done?.[key]) throw new Error('Você ainda não abriu essa conquista.');
    e.title = key;
    return { title: BY_KEY.get(key).name };
  }

  // Meta do servidor que já foi alcançada, mas esta pessoa não estava jogando na hora: explica por que não abriu.
  const serverHint = (store, accountId, a) => {
    if (!a.server) return null;
    const goal = store.achievements?._server?.goals?.[a.key];
    return goal && !goal.members.includes(accountId) && !isDone(store, accountId, a.key) ? 'O servidor já passou desta meta, mas você não estava jogando nos últimos 30 dias.' : null;
  };

  // Para a aba e o $conquistas: cada trilha com o nível seguinte, o progresso e o que ela dá.
  function view(store, accountId, ctx) {
    payQueue(store, accountId);
    const e = entryOf(store, accountId) || { done: {} };
    const items = [];
    const trails = new Map();
    for (const a of ALL) { if (!trails.has(a.trail)) trails.set(a.trail, []); trails.get(a.trail).push(a); }
    for (const [trail, list] of trails) {
      const doneCount = list.filter((a) => e.done[a.key]).length;
      const next = list.find((a) => !e.done[a.key]);
      const shown = next || list.at(-1);
      const hidden = list[0].hidden;
      if (hidden && !doneCount) { items.push({ trail, cat: 'ocultas', hidden: true, locked: true, name: '???', tiers: 1, done: [false], have: 0, need: 1, pct: 0, kakera: shown.kakera }); continue; }
      const have = Math.min(ctx[shown.count] || 0, shown.need);
      items.push({
        trail, cat: shown.cat, hidden, locked: false, name: shown.name, trailName: shown.trailName, tier: shown.tier, tiers: list.length, done: list.map((a) => !!e.done[a.key]),
        complete: !next, have, need: shown.need, pct: Math.round((have / shown.need) * 100), kakera: shown.kakera,
        perk: A.perks[shown.key]?.label || null, hint: hidden ? shown.hint : serverHint(store, accountId, shown), count: shown.count, ...(shown.server ? { server: true } : {}),
      });
    }
    const titles = ALL.filter((a) => e.done[a.key]).map((a) => ({ key: a.key, name: a.name, tier: a.tier })).reverse();
    return {
      items, titles, title: e.title && e.done[e.title] ? e.title : null, titleName: titleName(store, accountId),
      done: Object.keys(e.done).length, total: ALL.length,
      perks: Object.entries(A.perks).filter(([key]) => e.done[key]).map(([, p]) => p.label), categories: A.categories,
    };
  }

  return { refresh, payQueue, setTitle, view, snapshotRetro, repairRetro };
}

module.exports = { createConquistas, achievementPerks, titleName, isDone, ALL, TIER };
