// Mudae: contas de teste sem limite, para experimentar todas as funções sem esperar relógio nem juntar kakera.
// Liga pela variável de ambiente MUDAE_TESTERS (nomes de conta ou ids, separados por vírgula):
//   MUDAE_TESTERS=teste,outroteste node server.js
// Antes de cada ação do Mudae, a conta de teste volta a ter tudo cheio: rolls, casamento, $daily/$dk, $rolls,
// energia, cristais do dia, teto do divórcio, chaves de ouro, inveja e reserva; kakera no mínimo TESTER_KAKERA;
// todos os superpoderes abertos e carregados. O que é escolha da pessoa (poder armado, previsão da Vidência,
// harém, desejos) fica como está.
const { POWERS, POWER_SLOTS } = require('./mudae-regras');
const { kakeraOf, addKakera } = require('./mudae-conta');

const TESTER_KAKERA = 1_000_000;
// Os campos de store.usage[conta] que são só relógio e contagem de limite.
const COOLDOWNS = ['rolls', 'rollWindow', 'carry', 'buys', 'lastClaim', 'daily', 'dailyUses', 'dk', 'crystalDay', 'refunds', 'power', 'gold', 'envyAt', 'reserveAt'];

function parseTesters(text) {
  return new Set(String(text || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean));
}

function createTesters(list = process.env.MUDAE_TESTERS) {
  const set = parseTesters(list);
  const isTester = (acc) => !!acc && set.size > 0 && (set.has(String(acc.id).toLowerCase()) || set.has(String(acc.name || '').toLowerCase()));

  function refill(store, accountId) {
    const u = store.usage?.[accountId];
    if (u) for (const key of COOLDOWNS) delete u[key];
    const have = kakeraOf(store, accountId);
    if (have < TESTER_KAKERA) addKakera(store, accountId, TESTER_KAKERA - have, { transfer: true });
    const p = ((store.powers ||= {})[accountId] ||= { unlocked: [], slots: Array(POWER_SLOTS).fill(null), readyAt: {} });
    for (const { key } of POWERS) {
      if (!p.unlocked.includes(key)) p.unlocked.push(key);
      if (!p.slots.includes(key)) { const free = p.slots.indexOf(null); if (free >= 0) p.slots[free] = key; }
    }
    for (const key of Object.keys(p.readyAt)) p.readyAt[key] = 0;
    for (const key of p.slots) if (key) p.readyAt[key] = 0;
  }

  return { isTester, refill, enabled: set.size > 0 };
}

module.exports = { createTesters, parseTesters, TESTER_KAKERA, COOLDOWNS };
