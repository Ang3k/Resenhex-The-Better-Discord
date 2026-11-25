// Cristal errante do Mudae: quando nasce, quem pegou, quanto paga e quando acaba.
// Tudo em memória, sem socket e sem timer: quem chama (server.js) passa o relógio e chama tick().
const { CRYSTAL, KEYS } = require('./mudae-regras');
const { addKakera, dayOf, powerOf, spendPower, powerView } = require('./mudae-conta');

const CHAIN_COLORS = ['roxo', 'ciano', 'amarelo', 'laranja', 'vermelho']; // cor de cada degrau da corrente

function createCrystals({ now, random, rules = CRYSTAL, countCrystal = () => {} }) {
  const crystals = new Map(); // id -> cristal
  const nextAt = new Map(); // serverId -> quando nasce o próximo, enquanto tem gente no Salão
  const paused = new Map(); // serverId -> quanto faltava quando o Salão esvaziou (continua dali na volta)
  let counter = 0;

  const between = (min, max) => min + Math.floor(random() * (max - min + 1));
  const colorOf = (key) => rules.colors.find((c) => c.key === key);

  function pickColor() {
    const total = rules.colors.reduce((s, c) => s + c.weight, 0);
    let r = random() * total;
    for (const c of rules.colors) { r -= c.weight; if (r < 0) return c; }
    return rules.colors[rules.colors.length - 1];
  }

  // Cristal da carta: o arco-íris pode sair; com a chave prata (3) ou mais, ciano e verde viram laranja.
  function pickCardColor(level) {
    if (random() < rules.rainbow.chance) return { key: 'arcoiris', hex: rules.rainbow.hex, value: between(rules.rainbow.min, rules.rainbow.max) };
    const c = pickColor();
    return level >= KEYS.reaction.orangeFrom && KEYS.reaction.orangeColors.includes(c.key) ? colorOf('laranja') : c;
  }
  // Mais kakera nos cristais roxo, vermelho e arco-íris de personagens com muitas chaves (50, 200 e 400).
  const cardBonus = (c) => (c.card && KEYS.reaction.bonusColors.includes(c.colorKey) ? KEYS.reaction.bonus.find(([from]) => c.card.level >= from)?.[1] || 0 : 0);

  const endOf = (c) => c.appearAt + c.life + rules.graceMs;

  function spawn(serverId, { kind = 'drifter', appearAt = now(), from = null, by = null, step = 1, called = false, card = null } = {}) {
    const color = kind === 'chain' ? colorOf(CHAIN_COLORS[step - 1]) : card ? pickCardColor(card.level) : pickColor();
    const c = {
      id: `${(++counter).toString(36)}${now().toString(36)}`,
      serverId, kind, colorKey: color.key, color: color.hex,
      value: kind === 'chain' ? rules.chain.values[step - 1] : color.value,
      appearAt,
      life: kind === 'storm' ? rules.storm.lifeMs : kind === 'chain' ? rules.chain.lifeMs : rules.lifeMs,
      seed: Math.floor(random() * 2 ** 31), // o navegador usa para desenhar o caminho do voo
      gems: kind === 'storm' ? rules.storm.gems : 1,
      // Quanto vale cada gota: a chuva do poder rende menos que a que nasce sozinha.
      factor: kind === 'storm' ? (called ? rules.storm.calledFactor : rules.storm.valueFactor) : 1,
      step: kind === 'chain' ? step : 1,
      from, by, card,
      takers: new Map(), // accountId -> total ganho
      gemTakers: new Set(), // "accountId:gota"
      fullFor: new Map(), // accountId -> se o cristal valeu inteiro para a pessoa (teto do dia)
    };
    crystals.set(c.id, c);
    return c;
  }

  function view(c) {
    const { id, serverId, kind, color, colorKey, value, appearAt, life, seed, gems, step, from, by } = c;
    return { id, serverId, kind, color, colorKey, value, appearAt, life, seed, gems, step, from, by, ...(c.card?.level ? { keys: c.card.level } : {}) };
  }

  function tick(presentServerIds) {
    const t = now();
    const present = new Set(presentServerIds);
    // O Salão esvaziou: guarda quanto faltava, para a próxima visita não começar a espera do zero.
    for (const [id, at] of [...nextAt]) if (!present.has(id)) { paused.set(id, Math.max(0, at - t)); nextAt.delete(id); }
    const spawned = [];
    for (const id of present) {
      if (!nextAt.has(id)) {
        nextAt.set(id, t + (paused.has(id) ? paused.get(id) : between(rules.everyMinMs, rules.everyMaxMs)));
        paused.delete(id);
        continue;
      }
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

    // O cristal da carta gasta o poder de reação (metade com a chave 10 ou mais; o roxo é de graça).
    let power = null;
    if (c.card) {
      const base = rules.power.cost[c.colorKey] ?? rules.power.cost.arcoiris;
      const cost = c.card.level >= KEYS.reaction.halfCostFrom ? Math.ceil(base / 2) : base;
      if (cost > powerOf(store, accountId, t)) {
        const wait = Math.ceil(((cost - powerOf(store, accountId, t)) / rules.power.regenPerHour) * 60);
        return { error: `Sem poder de reação para esse cristal (gasta ${cost}). Em uns ${wait} min dá para pegar.` };
      }
      spendPower(store, accountId, cost, t);
      power = powerView(store, accountId, t);
    }

    // A chuva conta como 1 cristal pego, mas gasta capCost do teto do dia, já na primeira gota da pessoa.
    if (!c.fullFor.has(accountId)) {
      const u = ((store.usage ||= {})[accountId] ||= {});
      if (!Array.isArray(u.crystalDay) || u.crystalDay[0] !== dayOf(t)) u.crystalDay = [dayOf(t), 0];
      c.fullFor.set(accountId, u.crystalDay[1] < rules.dailyFull);
      u.crystalDay[1] += c.kind === 'storm' ? rules.storm.capCost : 1;
      countCrystal(store, accountId);
    }
    const full = c.fullFor.get(accountId);

    const base = c.value * c.factor;
    let amount = Math.max(1, Math.round(base * (1 + (perks?.crystalBonus || 0)) * (1 + cardBonus(c))));
    if (!full) amount = Math.max(1, Math.round(amount * rules.afterCap));

    const firstOfAll = c.takers.size === 0;
    c.gemTakers.add(key);
    c.takers.set(accountId, (c.takers.get(accountId) || 0) + amount);
    const kakera = addKakera(store, accountId, amount);

    let next = null;
    if (c.kind === 'chain' && firstOfAll && c.step < rules.chain.values.length) {
      next = view(spawn(serverId, { kind: 'chain', appearAt: t + rules.chain.gapMs, from: c.from, by: c.by, step: c.step + 1 }));
    }
    return { amount, kakera, full, next, ...(power ? { power } : {}), ...(c.card ? { card: true, colorKey: c.colorKey } : {}) };
  }

  // O cristal que nasce de um roll de personagem com dono. Com a chave 25, 100, 300 ou 500, pode vir um segundo
  // (25%, 50%, 75% e 100% de chance), logo depois do primeiro. Devolve a lista de cristais criados.
  function spawnForCard(serverId, { card, appearAt = now(), ...rest }) {
    const made = [spawn(serverId, { ...rest, appearAt, card })];
    const chance = KEYS.reaction.second.find(([from]) => card.level >= from)?.[1] || 0;
    if (chance && random() < chance) made.push(spawn(serverId, { ...rest, appearAt: appearAt + 450, card }));
    return made;
  }

  return { tick, spawn, spawnForCard, take, view };
}

module.exports = { createCrystals, CHAIN_COLORS };
