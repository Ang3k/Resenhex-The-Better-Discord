// Mudae: os superpoderes de cada pessoa. Aqui ficam só as contas: quais poderes abriram, os 3 espaços
// do palco e a carga de cada um. O que cada poder faz mora em outros arquivos.
// Tudo mora no store da comunidade: store.powers[conta] = { unlocked: [], slots: [null, null, null], readyAt: {} }.
const { POWERS, POWER_SLOTS } = require('./mudae-regras');

const byKey = (key) => POWERS.find((p) => p.key === key);

function minutes(ms) {
  const m = Math.max(1, Math.ceil(ms / 60_000));
  return m >= 60 ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}` : `${m} min`;
}

function createPoderes({ now = Date.now } = {}) {
  const entryOf = (store, accountId) => store.powers?.[accountId];
  const ensure = (store, accountId) => ((store.powers ||= {})[accountId] ||= { unlocked: [], slots: Array(POWER_SLOTS).fill(null), readyAt: {} });

  // Abre cada poder que chegou à meta e nunca tira. O poder novo entra no primeiro espaço vazio, já cheio.
  // unlocked: os poderes que abriram agora. first: é a primeira vez que a pessoa é avaliada (o crédito do dia
  // do lançamento), então não há aviso público. fresh: os que merecem aviso público.
  function refresh(store, accountId, ctx) {
    const first = !entryOf(store, accountId);
    const e = ensure(store, accountId);
    const unlocked = [];
    for (const p of POWERS) {
      if (e.unlocked.includes(p.key) || (ctx[p.count] || 0) < p.need) continue;
      e.unlocked.push(p.key);
      unlocked.push(p.key);
      const free = e.slots.indexOf(null);
      if (free >= 0) { e.slots[free] = p.key; e.readyAt[p.key] = 0; }
    }
    return { unlocked, fresh: first ? [] : unlocked, first };
  }

  function powersOf(store, accountId, ctx, perks) {
    const e = entryOf(store, accountId) || { unlocked: [], slots: Array(POWER_SLOTS).fill(null), readyAt: {} };
    const t = now();
    const readyIn = {};
    for (const key of e.slots) if (key) readyIn[key] = Math.max(0, (e.readyAt[key] || 0) - t);
    const progress = Object.fromEntries(POWERS.map((p) => [p.key, { have: Math.min(ctx[p.count] || 0, p.need), need: p.need }]));
    return { unlocked: [...e.unlocked], slots: [...e.slots], readyIn, progress, rechargeMs: perks.rechargeMs };
  }

  function equip(store, accountId, slot, power, perks) {
    if (!Number.isInteger(slot) || slot < 0 || slot >= POWER_SLOTS) throw new Error('Espaço inválido.');
    const e = ensure(store, accountId);
    if (power === null) {
      const gone = e.slots[slot];
      e.slots[slot] = null;
      if (gone) delete e.readyAt[gone];
      return;
    }
    if (!e.unlocked.includes(power)) throw new Error('Você ainda não tem esse poder.');
    const from = e.slots.indexOf(power);
    if (from === slot) return;
    const displaced = e.slots[slot];
    if (from >= 0) { // já estava noutro espaço: os dois trocam de lugar e cada um mantém a carga
      e.slots[from] = displaced;
      e.slots[slot] = power;
      return;
    }
    if (displaced) delete e.readyAt[displaced];
    e.slots[slot] = power;
    e.readyAt[power] = now() + perks.rechargeMs; // quem vinha de fora chega vazio
  }

  // Gasta a carga só se o efeito der certo; se ele lançar erro, nada muda.
  function use(store, accountId, power, perks, effect) {
    const e = entryOf(store, accountId);
    if (!e || !e.slots.includes(power)) throw new Error('Esse poder não está no seu palco.');
    const wait = (e.readyAt[power] || 0) - now();
    if (wait > 0) throw new Error(`${byKey(power).name} recarrega em ${minutes(wait)}.`);
    const result = effect();
    e.readyAt[power] = now() + perks.rechargeMs;
    return result;
  }

  return { refresh, powersOf, equip, use };
}

module.exports = { createPoderes };
