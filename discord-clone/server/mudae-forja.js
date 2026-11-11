// Mudae: a Forja de medalhas. Cada pessoa tem 7 medalhas, de 4 níveis; cada nível forjado sorteia um acabamento.
// Os dados moram no store da comunidade (store.medals[conta][medal]); aqui ficam só as contas e o sorteio.
// Este arquivo não pode usar server/mudae.js (o mudae.js é que usa este).
const { MEDAL_KEYS, MEDALS, priceOf, PERKS, FINISHES, REFORGE_PRICE, POWER_RECHARGE_MS } = require('./mudae-regras');
const { kakeraOf, addKakera } = require('./mudae-conta');

const MAX_LEVEL = 4;
const ROMAN = ['', 'I', 'II', 'III', 'IV'];

const entryOf = (store, accountId, medal) => store.medals?.[accountId]?.[medal];
const levelOf = (store, accountId, medal) => entryOf(store, accountId, medal)?.level || 0;
const forgedCount = (store, accountId) => MEDAL_KEYS.filter((m) => levelOf(store, accountId, m) >= 1).length;
const atLeast = (store, accountId, level) => MEDAL_KEYS.filter((m) => levelOf(store, accountId, m) >= level).length;

// Soma as vantagens de todas as medalhas. Cada nível pega o valor do seu índice (nível I = índice 0).
function perksOf(store, accountId) {
  const perks = { wishSlots: 0, carry: 0, crystalBonus: 0, dkDouble: false, extraRolls: 0, wishChance: 0, reserveEveryMs: 0, rechargeMs: POWER_RECHARGE_MS };
  for (const medal of MEDAL_KEYS) {
    const level = levelOf(store, accountId, medal);
    if (!level) continue;
    for (const [key, values] of Object.entries(PERKS[medal])) {
      const value = values[level - 1];
      perks[key] = typeof value === 'boolean' ? perks[key] || value : value;
    }
  }
  return perks;
}

function createForja({ random = Math.random } = {}) {
  const checkMedal = (medal) => { if (!MEDALS[medal]) throw new Error('Medalha inválida.'); };

  // Um sorteio só (um random), com os pesos de FINISHES em ordem. `except` tira o acabamento que a medalha já tem:
  // quando a pessoa vai escolher entre o atual e um novo, o novo nunca é igual (os pesos dos outros continuam na mesma proporção).
  function drawFinish(except = null) {
    const pool = FINISHES.filter((f) => f.key !== except);
    const total = pool.reduce((sum, f) => sum + f.weight, 0);
    const roll = random() * total;
    let upTo = 0;
    for (const f of pool) {
      upTo += f.weight;
      if (roll < upTo) return f.key;
    }
    return pool.at(-1).key;
  }

  function medalsOf(store, accountId) {
    return Object.fromEntries(MEDAL_KEYS.map((medal) => {
      const e = entryOf(store, accountId, medal);
      return [medal, { level: e?.level || 0, finish: e?.finish || null, offer: e?.offer || null }];
    }));
  }

  function pay(store, accountId, price, label) {
    const have = kakeraOf(store, accountId);
    if (have < price) throw new Error(`${label} custa ${price} kakera e você tem ${have}. Faltam ${price - have}.`);
    addKakera(store, accountId, -price);
  }

  function forge(store, accountId, medal) {
    checkMedal(medal);
    const e = entryOf(store, accountId, medal);
    const level = (e?.level || 0) + 1;
    const name = MEDALS[medal].name;
    if (e?.offer) throw new Error('Escolha o acabamento antes.');
    if (level > MAX_LEVEL) throw new Error(`A ${name} já está no nível IV.`);
    const price = priceOf(medal, level);
    pay(store, accountId, price, `A ${name} ${ROMAN[level]}`);
    const entry = (((store.medals ||= {})[accountId] ||= {})[medal] ||= { level: 0, finish: null });
    const drawn = drawFinish(level === 1 ? null : entry.finish);
    entry.level = level;
    if (level === 1) entry.finish = drawn;
    else entry.offer = drawn;
    return { medal, level, price, finish: entry.finish, offer: entry.offer || null, kakera: kakeraOf(store, accountId) };
  }

  function chooseFinish(store, accountId, medal, pick) {
    checkMedal(medal);
    const e = entryOf(store, accountId, medal);
    if (!e?.offer) throw new Error('Não há acabamento para escolher.');
    if (pick !== 'old' && pick !== 'new') throw new Error('Escolha inválida.');
    if (pick === 'new') e.finish = e.offer;
    delete e.offer;
    // No nível IV a notícia sai uma vez só, com o acabamento que a pessoa ficou (reforjar depois não repete).
    const announce = e.level === MAX_LEVEL && !e.announced;
    if (announce) e.announced = true;
    return { finish: e.finish, announce };
  }

  function reforge(store, accountId, medal) {
    checkMedal(medal);
    const e = entryOf(store, accountId, medal);
    const name = MEDALS[medal].name;
    if (!e?.level) throw new Error(`Forje a ${name} antes de reforjar.`);
    if (e.offer) throw new Error('Escolha o acabamento antes.');
    pay(store, accountId, REFORGE_PRICE, `Reforjar a ${name}`);
    e.offer = drawFinish(e.finish);
    return { price: REFORGE_PRICE, finish: e.finish, offer: e.offer, kakera: kakeraOf(store, accountId) };
  }

  // Medalhas no perfil: a lista escolhida (store.medalsShown[conta]) ou, sem escolha, as forjadas da mais alta para a mais baixa.
  function shownOf(store, accountId) {
    const chosen = store.medalsShown?.[accountId];
    const list = chosen ? chosen.filter((m) => levelOf(store, accountId, m) >= 1)
      : MEDAL_KEYS.filter((m) => levelOf(store, accountId, m) >= 1).sort((a, b) => levelOf(store, accountId, b) - levelOf(store, accountId, a));
    return list.map((medal) => ({ medal, level: levelOf(store, accountId, medal), finish: entryOf(store, accountId, medal).finish || null }));
  }

  function setShown(store, accountId, medals) {
    if (!Array.isArray(medals) || medals.length > MEDAL_KEYS.length) throw new Error('Escolha inválida.');
    for (const medal of medals) {
      checkMedal(medal);
      if (levelOf(store, accountId, medal) < 1) throw new Error(`Forje a ${MEDALS[medal].name} antes.`);
    }
    if (new Set(medals).size !== medals.length) throw new Error('Medalha repetida.');
    (store.medalsShown ||= {})[accountId] = [...medals];
  }

  return { medalsOf, forge, chooseFinish, reforge, shownOf, setShown };
}

module.exports = { createForja, perksOf, levelOf, forgedCount, atLeast };
