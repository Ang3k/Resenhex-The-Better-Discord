// Mudae: chaves e soulmates. Cada vez que você rola um personagem que já é seu, a chave dele sobe um nível
// (wiki do Mudae: Keys). A chave fica com o personagem, não com o dono: sobrevive a divórcio, presente e troca.
//
// Tudo mora no store da comunidade:
//   store.keys[idDoPersonagem] = nível
//   store.souls[conta][idDoPersonagem] = chaves que ESSA conta rolou (só elas contam para soulmate)
//   store.soulmates[conta] = [ids] (quem chegou a KEYS.soulNeed chaves rolando sozinho)
// O bônus de valor, o teto diário do prêmio do nível 6 e os números moram em mudae-regras.js (KEYS).
const { KEYS, DAY_MS } = require('./mudae-regras');

const levelOf = (store, id) => store.keys?.[String(id)] || 0;

// bronze (1-2), prata (3-5), ouro (6-9) e caos (10+); '' sem chave.
const tierOf = (level) => KEYS.tiers.find((t) => level >= t.from)?.key || '';
const TIER_ORDER = [...KEYS.tiers].reverse().map((t) => t.key);

// Valor do personagem com as chaves: +% de cada nível especial sobre o valor base e um bônus fixo em níveis marcados.
function keyedValue(base, level) {
  if (!level) return base;
  let pct = 0;
  let flat = 0;
  for (const [at, kind, amount] of KEYS.bonuses) {
    if (level < at) continue;
    if (kind === 'pct') pct += amount; else flat += amount;
  }
  return Math.round(base * (1 + pct)) + flat;
}

function createChaves({ now = Date.now } = {}) {
  // Teto do prêmio por rolar um personagem de chave alta: no máximo KEYS.goldCap de kakera a cada 24 h (janela móvel).
  function goldReward(store, accountId, amount) {
    const u = ((store.usage ||= {})[accountId] ||= {});
    const t = now();
    const recent = (u.gold || []).filter(([at]) => t - at < DAY_MS);
    const used = recent.reduce((total, [, n]) => total + n, 0);
    const paid = Math.max(0, Math.min(amount, KEYS.goldCap - used));
    if (paid) recent.push([t, paid]);
    if (recent.length) u.gold = recent; else delete u.gold;
    return { paid, capped: paid < amount };
  }

  // Sobe a chave de um personagem seu. value: o valor dele ANTES desta chave (o prêmio do nível 6 usa esse valor).
  // Devolve o que aconteceu, para a mensagem do roll: nível novo, se mudou de cor, se virou soulmate e o kakera do prêmio.
  function gain(store, accountId, id, { value = 0, n = 1 } = {}) {
    const key = String(id);
    const before = levelOf(store, key);
    const reward = before >= KEYS.goldFrom && value > 0 ? goldReward(store, accountId, value) : { paid: 0, capped: false };
    const level = Math.min(KEYS.max, before + n);
    const gained = level - before;
    if (gained > 0) (store.keys ||= {})[key] = level;
    const souls = ((store.souls ||= {})[accountId] ||= {});
    souls[key] = (souls[key] || 0) + gained;
    let soulmate = false;
    const list = (store.soulmates ||= {})[accountId] ||= [];
    if (souls[key] >= KEYS.soulNeed && !list.includes(key)) { list.push(key); soulmate = true; }
    if (!list.length) { delete store.soulmates[accountId]; if (!Object.keys(store.soulmates).length) delete store.soulmates; }
    return { level, gained, tier: tierOf(level), tierUp: tierOf(level) !== tierOf(before), soulmate, gold: reward.paid, goldCapped: reward.capped };
  }

  // $removekeys: tira chaves de um personagem seu (não mexe nas soulkeys, então o caminho para soulmate fica).
  function remove(store, id, n) {
    const key = String(id);
    const level = Math.max(0, levelOf(store, key) - n);
    if (level) (store.keys ||= {})[key] = level;
    else if (store.keys) { delete store.keys[key]; if (!Object.keys(store.keys).length) delete store.keys; }
    return level;
  }

  // Cor própria do personagem ($embedcolor, liberada no nível 1). Fica com o personagem, como a chave.
  function setColor(store, id, hex) {
    const key = String(id);
    if (hex) (store.embeds ||= {})[key] = hex;
    else if (store.embeds) { delete store.embeds[key]; if (!Object.keys(store.embeds).length) delete store.embeds; }
  }

  const soulmatesOf = (store, accountId) => [...(store.soulmates?.[accountId] || [])];
  const soulkeysOf = (store, accountId, id) => store.souls?.[accountId]?.[String(id)] || 0;
  // Quanto a pessoa já pegou do teto do prêmio nas últimas 24 h.
  const goldLeft = (store, accountId) => {
    const t = now();
    const used = (store.usage?.[accountId]?.gold || []).filter(([at]) => t - at < DAY_MS).reduce((total, [, n]) => total + n, 0);
    return Math.max(0, KEYS.goldCap - used);
  };

  return { gain, remove, setColor, soulmatesOf, soulkeysOf, goldLeft };
}

module.exports = { createChaves, levelOf, tierOf, keyedValue, TIER_ORDER };
