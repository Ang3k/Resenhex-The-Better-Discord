// Cristal errante do Mudae: quando nasce, quem pegou, quanto paga e quando acaba.
// Tudo em memória, sem socket e sem timer: quem chama (server.js) passa o relógio e chama tick().
const { CRYSTAL } = require('./mudae-regras');
const { addKakera, dayOf } = require('./mudae-conta');

const CHAIN_COLORS = ['roxo', 'ciano', 'amarelo', 'laranja', 'vermelho']; // cor de cada degrau da corrente

function createCrystals({ now, random, rules = CRYSTAL, countCrystal = () => {} }) {
  const crystals = new Map(); // id -> cristal
  const nextAt = new Map(); // serverId -> quando nasce o próximo (nunca sai daqui)
  let counter = 0;

  const between = (min, max) => min + Math.floor(random() * (max - min + 1));
  const colorOf = (key) => rules.colors.find((c) => c.key === key);

  function pickColor() {
    const total = rules.colors.reduce((s, c) => s + c.weight, 0);
    let r = random() * total;
    for (const c of rules.colors) { r -= c.weight; if (r < 0) return c; }
    return rules.colors[rules.colors.length - 1];
  }

  const endOf = (c) => c.appearAt + c.life + rules.graceMs;

  function spawn(serverId, { kind = 'drifter', appearAt = now(), from = null, by = null, step = 1 } = {}) {
    const color = kind === 'chain' ? colorOf(CHAIN_COLORS[step - 1]) : pickColor();
    const c = {
      id: `${(++counter).toString(36)}${now().toString(36)}`,
      serverId, kind, colorKey: color.key, color: color.hex,
      value: kind === 'chain' ? rules.chain.values[step - 1] : color.value,
      appearAt,
      life: kind === 'storm' ? rules.storm.lifeMs : kind === 'chain' ? rules.chain.lifeMs : rules.lifeMs,
      seed: Math.floor(random() * 2 ** 31), // o navegador usa para desenhar o caminho do voo
      gems: kind === 'storm' ? rules.storm.gems : 1,
      step: kind === 'chain' ? step : 1,
      from, by,
      takers: new Map(), // accountId -> total ganho
      gemTakers: new Set(), // "accountId:gota"
      fullFor: new Map(), // accountId -> se o cristal valeu inteiro para a pessoa (teto do dia)
    };
    crystals.set(c.id, c);
    return c;
  }

  function view(c) {
    const { id, serverId, kind, color, colorKey, value, appearAt, life, seed, gems, step, from, by } = c;
    return { id, serverId, kind, color, colorKey, value, appearAt, life, seed, gems, step, from, by };
  }

  function tick(presentServerIds) {
    const t = now();
    const present = new Set(presentServerIds);
    for (const id of [...nextAt.keys()]) if (!present.has(id)) nextAt.delete(id);
    const spawned = [];
    for (const id of present) {
      if (!nextAt.has(id)) { nextAt.set(id, t + between(rules.everyMinMs, rules.everyMaxMs)); continue; }
      if (nextAt.get(id) > t) continue;
      const r = random();
      const kind = r < rules.storm.chance ? 'storm' : r < rules.storm.chance + rules.chain.chance ? 'chain' : 'drifter';
      spawned.push(spawn(id, { kind, appearAt: t }));
      nextAt.set(id, t + between(rules.everyMinMs, rules.everyMaxMs));
    }
    const ended = [];
    for (const c of [...crystals.values()]) {
      if (t <= endOf(c)) continue;
      crystals.delete(c.id);
      ended.push({ id: c.id, serverId: c.serverId, kind: c.kind, colorKey: c.colorKey, color: c.color, from: c.from,
        takers: [...c.takers].map(([id, amount]) => ({ id, amount })) });
    }
    return { spawned, ended };
  }

  function take(store, serverId, id, accountId, { gem = 0, perks } = {}) {
    const c = crystals.get(id);
    if (!c || c.serverId !== serverId) return { error: 'Esse cristal já sumiu.' };
    const t = now();
    if (t < c.appearAt) return { error: 'Calma, o cristal ainda está chegando!' };
    if (t > endOf(c)) return { error: 'Tarde demais: o cristal sumiu.' };
    const slot = c.kind === 'storm' ? gem : 0;
    if (!Number.isInteger(slot) || slot < 0 || slot >= c.gems) return { error: 'Esse cristal já sumiu.' };
    const key = `${accountId}:${slot}`;
    if (c.gemTakers.has(key)) return { error: 'Você já pegou esse cristal.' };

    // A chuva conta como 1 cristal (teto do dia e contador) já na primeira gota da pessoa.
    if (!c.fullFor.has(accountId)) {
      const u = ((store.usage ||= {})[accountId] ||= {});
      if (!Array.isArray(u.crystalDay) || u.crystalDay[0] !== dayOf(t)) u.crystalDay = [dayOf(t), 0];
      c.fullFor.set(accountId, u.crystalDay[1] < rules.dailyFull);
      u.crystalDay[1]++;
      countCrystal(store, accountId);
    }
    const full = c.fullFor.get(accountId);

    const base = c.kind === 'storm' ? c.value * rules.storm.valueFactor : c.value;
    let amount = Math.max(1, Math.round(base * (1 + (perks?.crystalBonus || 0))));
    if (!full) amount = Math.max(1, Math.round(amount * rules.afterCap));

    const firstOfAll = c.takers.size === 0;
    c.gemTakers.add(key);
    c.takers.set(accountId, (c.takers.get(accountId) || 0) + amount);
    const kakera = addKakera(store, accountId, amount);

    let next = null;
    if (c.kind === 'chain' && firstOfAll && c.step < rules.chain.values.length) {
      next = view(spawn(serverId, { kind: 'chain', appearAt: t + rules.chain.gapMs, from: c.from, by: c.by, step: c.step + 1 }));
    }
    return { amount, kakera, full, next };
  }

  return { tick, spawn, take, view };
}

module.exports = { createCrystals, CHAIN_COLORS };
