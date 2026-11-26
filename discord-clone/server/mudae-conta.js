// Mudae: a conta de cada pessoa (kakera, contadores que destravam poderes e o teto do divórcio).
// Tudo mora no store da comunidade; aqui só ficam as contas, sem relógio nem sorteio próprios.
const { DIVORCE_CAP, DIVORCE_CAP_MS, DAY_MS, DAY_OFFSET_MS, CRYSTAL } = require('./mudae-regras');
const HOUR_MS = 3600_000;

const kakeraOf = (store, accountId) => store.kakera?.[accountId] || 0;
// transfer: kakera que só mudou de mãos (presente, troca, prêmio de conquista) não conta como "ganho" para as conquistas.
function addKakera(store, accountId, amount, { transfer = false } = {}) {
  const total = kakeraOf(store, accountId) + amount;
  if (total) (store.kakera ||= {})[accountId] = total;
  else if (store.kakera) delete store.kakera[accountId];
  if (amount > 0) {
    if (total > (store.peak?.[accountId] || 0)) (store.peak ||= {})[accountId] = total;
    if (!transfer) (store.earned ||= {})[accountId] = (store.earned?.[accountId] || 0) + amount;
  }
  return total;
}

// O dia do Mudae vira à meia-noite de Brasília (3 h da manhã em UTC).
const dayOf = (t) => Math.floor((t - DAY_OFFSET_MS) / DAY_MS);

// Cristais de hoje que valem inteiro (o teto do dia), para a pessoa ver quanto falta. A chuva gasta mais de 1, então
// `used` pode passar de `max`. resetIn: quanto falta para a meia-noite de Brasília zerar a conta.
function crystalsToday(store, accountId, t) {
  const day = store.usage?.[accountId]?.crystalDay;
  const used = Array.isArray(day) && day[0] === dayOf(t) ? day[1] : 0;
  return { used, max: CRYSTAL.dailyFull, after: CRYSTAL.afterCap, storm: CRYSTAL.storm.capCost, resetIn: (dayOf(t) + 1) * DAY_MS + DAY_OFFSET_MS - t };
}

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

// O que o divórcio ainda devolve agora, sem gastar nada: quanto sobra do teto e, se já usou algum,
// em quanto tempo o reembolso mais antigo sai da janela de 24 h e abre espaço de novo.
function refundStatus(store, accountId, t) {
  const recent = (store.usage?.[accountId]?.refunds || []).filter(([at]) => t - at < DIVORCE_CAP_MS);
  const used = recent.reduce((total, [, amount]) => total + amount, 0);
  return { divorceLeft: Math.max(0, DIVORCE_CAP - used), divorceCap: DIVORCE_CAP, divorceIn: recent.length ? Math.max(1, recent[0][0] + DIVORCE_CAP_MS - t) : 0 };
}

// Energia (o "poder de reação" do Mudae): sobe CRYSTAL.power.regenPerHour por hora, até o máximo. store.usage[conta].power = { value, at }.
function powerOf(store, accountId, t) {
  const p = store.usage?.[accountId]?.power;
  const max = CRYSTAL.power.max;
  if (!p) return max;
  return Math.min(max, p.value + ((t - p.at) / HOUR_MS) * CRYSTAL.power.regenPerHour);
}
function spendPower(store, accountId, cost, t) {
  if (!cost) return;
  const u = ((store.usage ||= {})[accountId] ||= {});
  u.power = { value: powerOf(store, accountId, t) - cost, at: t };
}
// Para mostrar: quanto tem, o máximo e em quanto tempo enche.
function powerView(store, accountId, t) {
  const value = powerOf(store, accountId, t);
  const max = CRYSTAL.power.max;
  return { value: Math.floor(value), max, fullIn: value >= max ? 0 : Math.ceil(((max - value) / CRYSTAL.power.regenPerHour) * HOUR_MS) };
}

// Um teto em janela móvel (por exemplo, "no máximo 300 de kakera a cada 24 h"): devolve quanto ainda cabe de amount.
function takeBucket(store, accountId, name, amount, cap, windowMs, t) {
  const u = ((store.usage ||= {})[accountId] ||= {});
  const recent = (u[name] || []).filter(([at]) => t - at < windowMs);
  const used = recent.reduce((total, [, n]) => total + n, 0);
  const paid = Math.max(0, Math.min(amount, cap - used));
  if (paid) recent.push([t, paid]);
  if (recent.length) u[name] = recent; else delete u[name];
  return paid;
}

module.exports = { powerOf, spendPower, powerView, takeBucket, kakeraOf, addKakera, dayOf, crystalsToday, statsOf, bumpStat, refundOf, refundStatus };
