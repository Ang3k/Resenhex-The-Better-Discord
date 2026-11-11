// Mudae: a conta de cada pessoa (kakera, contadores que destravam poderes e o teto do divórcio).
// Tudo mora no store da comunidade; aqui só ficam as contas, sem relógio nem sorteio próprios.
const { DIVORCE_CAP, DIVORCE_CAP_MS, DAY_MS, DAY_OFFSET_MS } = require('./mudae-regras');

const kakeraOf = (store, accountId) => store.kakera?.[accountId] || 0;
function addKakera(store, accountId, amount) {
  const total = kakeraOf(store, accountId) + amount;
  if (total) (store.kakera ||= {})[accountId] = total;
  else if (store.kakera) delete store.kakera[accountId];
  return total;
}

// O dia do Mudae vira à meia-noite de Brasília (3 h da manhã em UTC).
const dayOf = (t) => Math.floor((t - DAY_OFFSET_MS) / DAY_MS);

// Contadores: claims (casamentos), rolls, crystals (cristais pegos) e legendary (lendários casados).
// Na primeira leitura, o harém de hoje vira o crédito de claims e legendary.
function statsOf(store, accountId, backfill) {
  const all = (store.stats ||= {});
  if (!all[accountId]) {
    const { claims = 0, legendary = 0 } = backfill ? backfill() : {};
    all[accountId] = { claims, rolls: 0, crystals: 0, legendary };
  }
  return all[accountId];
}

function bumpStat(store, accountId, key, n = 1) {
  const s = statsOf(store, accountId);
  s[key] = (s[key] || 0) + n;
}

// Divórcio devolve o valor da carta, mas no máximo DIVORCE_CAP de kakera a cada 24 h.
function refundOf(store, accountId, value, t) {
  const u = ((store.usage ||= {})[accountId] ||= {});
  const recent = (u.refunds || []).filter(([at]) => t - at < DIVORCE_CAP_MS);
  const used = recent.reduce((total, [, amount]) => total + amount, 0);
  const refund = Math.max(0, Math.min(value, DIVORCE_CAP - used));
  if (refund) recent.push([t, refund]);
  u.refunds = recent;
  // Quando o reembolso mais antigo sair da janela de 24 h, abre espaço de novo.
  const capped = refund < value;
  const refundIn = capped && recent.length ? Math.max(1, recent[0][0] + DIVORCE_CAP_MS - t) : 0;
  return { refund, capped, refundIn, cap: DIVORCE_CAP };
}

module.exports = { kakeraOf, addKakera, dayOf, statsOf, bumpStat, refundOf };
