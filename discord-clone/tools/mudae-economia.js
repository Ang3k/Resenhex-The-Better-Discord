#!/usr/bin/env node
// Simulação da economia do Mudae: quanto kakera cada tipo de jogador ganha por dia e em quantos dias chega a cada marco
// (1ª medalha, todas no I, todas no IV e cada superpoder). Não sobe o servidor e não mexe em nenhum arquivo de dados.
// Uso: node tools/mudae-economia.js [--dias 200] [--semente 12345] [--md]
//   --md imprime também as tabelas em Markdown, prontas para o relatório.
const R = require('../server/mudae-regras');
const mudae = require('../server/mudae');
const { valueOf, rarityOf } = mudae;
const REF_SIZE = mudae.REF_SIZE ?? 15000; // o mudae.js ainda não exporta o tamanho de referência

const args = process.argv.slice(2);
const argOf = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? Number(args[i + 1]) : fallback; };
const DAYS = argOf('--dias', 200);
const SEED = argOf('--semente', 12345);
const SCALE = argOf('--escala', 1); // multiplica os valores dos cristais, só para testar ajustes sem editar o arquivo de regras
const FORCE_DIVORCE = args.includes('--divorcio-no-limite'); // pouco/normal também divorciam quando o harem enche (teste de sensibilidade)
const REPS = argOf('--repeticoes', 40); // quantas comunidades diferentes entram na média (tira a sorte do resultado)

// Sorteio com semente fixa (mulberry32): a mesma semente dá sempre o mesmo resultado.
const makeRandom = (seed) => () => {
  seed = (seed + 0x6D2B79F5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

if (SCALE !== 1) {
  R.CRYSTAL.colors = R.CRYSTAL.colors.map((c) => ({ ...c, value: c.value * SCALE }));
  R.CRYSTAL.chain.values = R.CRYSTAL.chain.values.map((v) => v * SCALE);
}

const HAREM_LIMIT = 300; // igual ao do servidor
const DK_AMOUNT = 250;
const MIN_PER_DAY = 1440;
const ROLLS_PER_WINDOW = 10; // a cada 30 min
const STORM_CLICK_SHARE = 0.75; // quanto da chuva a pessoa realmente consegue clicar
const KAKERA_PER_DAY_TARGET = 1000;

// Perfis de jogador. `visits`: quantas visitas por dia e quantos minutos cada uma; `windows`: janelas de 30 min usadas
// (cada uma tem 10 rolls e 1 casamento); `reserveUses`: quantos casamentos de reserva da Esmeralda ele consegue usar por dia
// (uma por visita, no máximo); `divorce`: 'mediana' divorcia o que vale menos que a mediana, 'nunca' só divorcia com --divorcio-no-limite; `catchRate`: chance de clicar a tempo num cristal quando está no Salão.
const PROFILES = {
  pouco: { label: 'Joga pouco', visits: [20], rolls: 10, claims: 1, reserveUses: 1, catchRate: 0.9, divorce: 'nunca' },
  normal: { label: 'Normal', visits: [20, 20], rolls: 20, claims: 3, reserveUses: 2, catchRate: 0.95, divorce: 'nunca' },
  viciado: { label: 'Viciado', visits: [480], rolls: 160, claims: 16, reserveUses: 4, catchRate: 1, divorce: 'mediana' },
};
const SERVER_SIZES = [1, 5, 20];

// A ordem de compra: o nível I de todas (da mais barata à mais cara), depois o II de todas, e assim por diante.
const BUY_ORDER = [];
for (let level = 1; level <= 4; level++) for (const key of R.MEDAL_KEYS) BUY_ORDER.push({ key, level });

function pickWeighted(list, rand) {
  const total = list.reduce((sum, item) => sum + item.weight, 0);
  let roll = rand() * total;
  for (const item of list) { roll -= item.weight; if (roll < 0) return item; }
  return list[list.length - 1];
}

function newPlayer(profile, rand) {
  return { profile, rand, kakera: 0, medals: {}, buyIndex: 0, claims: 0, rolls: 0, legendary: 0, crystals: 0, forged: 0,
    harem: [], dayCrystals: 0, earnedToday: 0, earnedByDay: [], marks: {} };
}

// Uma comunidade com `size` jogadores do mesmo perfil, simulada minuto a minuto por `DAYS` dias.
function simulate(profileKey, size, seed) {
  const profile = PROFILES[profileKey];
  const rand = makeRandom(seed);
  const players = Array.from({ length: size }, () => newPlayer(profile, makeRandom(Math.floor(rand() * 2 ** 31))));
  // O relógio do cristal só anda com alguém no Salão, então o ritmo é o mesmo em servidor pequeno e grande.
  const nextEvery = () => (R.CRYSTAL.everyMinMs + rand() * (R.CRYSTAL.everyMaxMs - R.CRYSTAL.everyMinMs)) / 60_000;
  let countdown = nextEvery();
  const done = (p) => p.marks.todasIV;

  for (let day = 1; day <= DAYS; day++) {
    const present = players.map((p) => {
      const slots = new Uint8Array(MIN_PER_DAY);
      for (const length of p.profile.visits) {
        const start = Math.floor(p.rand() * (MIN_PER_DAY - length));
        slots.fill(1, start, start + length);
      }
      return slots;
    });
    for (const p of players) { p.dayCrystals = 0; p.earnedToday = 0; p.divorcedToday = 0; }

    for (let minute = 0; minute < MIN_PER_DAY; minute++) {
      const here = [];
      for (let i = 0; i < size; i++) if (present[i][minute]) here.push(players[i]);
      if (!here.length) continue;
      countdown -= 1;
      if (countdown > 0) continue;
      countdown = nextEvery();
      spawn(here, rand);
    }

    for (const p of players) endOfDay(p, day);
  }

  // Resumo: média dos jogadores da comunidade.
  const avg = (fn) => players.reduce((sum, p) => sum + fn(p), 0) / players.length;
  const markKeys = ['primeira', 'todasI', 'todasIV', ...R.POWERS.map((power) => power.key)];
  const marks = {};
  for (const key of markKeys) {
    const days = players.map((p) => p.marks[key]).filter((d) => d != null);
    marks[key] = days.length === players.length ? days.reduce((a, b) => a + b, 0) / days.length : null;
  }
  const upTo = Math.round(marks.todasIV || DAYS);
  return {
    marks,
    perDayFirst30: avg((p) => p.earnedByDay.slice(0, 30).reduce((a, b) => a + b, 0) / 30),
    perDayToIV: avg((p) => p.earnedByDay.slice(0, upTo).reduce((a, b) => a + b, 0) / upTo),
    crystalsPerDay: avg((p) => p.crystals / DAYS),
  };

  function endOfDay(p, day) {
    // $dk: 250 por dia (em dobro com a Ouro IV).
    const ouro = p.medals.ouro || 0;
    const dk = DK_AMOUNT * (ouro >= 1 && R.PERKS.ouro.dkDouble[ouro - 1] ? 2 : 1);
    gain(p, dk);
    // Rolls e casamentos do dia.
    const windows = p.profile.claims;
    const safira = p.medals.safira || 0;
    const rollsToday = p.profile.rolls + (safira ? R.PERKS.safira.extraRolls[safira - 1] * windows : 0);
    p.rolls += rollsToday;
    const esmeralda = p.medals.esmeralda || 0;
    const reserve = esmeralda ? Math.min(p.profile.reserveUses, Math.floor(R.DAY_MS / R.PERKS.esmeralda.reserveEveryMs[esmeralda - 1])) : 0;
    const claims = Math.min(rollsToday, p.profile.claims + reserve);
    const seen = [];
    for (let i = 0; i < rollsToday; i++) seen.push(1 + Math.floor(p.rand() * REF_SIZE));
    seen.sort((a, b) => a - b); // posição menor = personagem mais valioso
    for (const position of seen.slice(0, claims)) {
      if (p.harem.length >= HAREM_LIMIT) {
        // Harem cheio: quem não divorcia para de casar.
        if (p.profile.divorce !== 'mediana' && !FORCE_DIVORCE) break;
        divorceLowest(p);
      }
      else if (p.profile.divorce === 'mediana' && p.harem.length > 10) {
        p.harem.sort((a, b) => a - b);
        if (p.harem[0] < p.harem[Math.floor(p.harem.length / 2)]) divorceLowest(p);
      }
      p.harem.push(valueOf(position - 1));
      p.claims += 1;
      if (rarityOf(position) === 'legendary') p.legendary += 1;
    }
    p.earnedByDay.push(p.earnedToday);
    buy(p);
    mark(p, day);
  }

  // Divórcio: devolve o valor da carta, mas só até 500 de kakera por dia.
  function divorceLowest(p) {
    p.harem.sort((a, b) => a - b);
    const value = p.harem.shift();
    const refund = Math.max(0, Math.min(value, R.DIVORCE_CAP - p.divorcedToday));
    p.divorcedToday += refund;
    gain(p, refund);
  }

  function gain(p, amount) { p.kakera += amount; p.earnedToday += amount; }

  function buy(p) {
    while (p.buyIndex < BUY_ORDER.length) {
      const { key, level } = BUY_ORDER[p.buyIndex];
      const price = R.priceOf(key, level);
      if (p.kakera < price) break;
      p.kakera -= price;
      p.medals[key] = level;
      p.forged += 1;
      p.buyIndex += 1;
    }
  }

  function mark(p, day) {
    const set = (key) => { if (p.marks[key] == null) p.marks[key] = day; };
    const levels = R.MEDAL_KEYS.map((key) => p.medals[key] || 0);
    if (p.forged >= 1) set('primeira');
    if (levels.every((l) => l >= 1)) set('todasI');
    if (levels.every((l) => l >= 4)) set('todasIV');
    const counters = { forged: p.forged, claims: p.claims, legendary: p.legendary, crystals: p.crystals, rolls: p.rolls,
      bronzeLevel: p.medals.bronze || 0, medalsAt2: levels.filter((l) => l >= 2).length };
    for (const power of R.POWERS) if (counters[power.count] >= power.need) set(power.key);
  }

  // Um cristal nasceu: quem está no Salão tenta pegar. Cada pessoa pega uma vez por cristal.
  function spawn(here, rand) {
    const color = pickWeighted(R.CRYSTAL.colors, rand);
    const kind = rand();
    const takes = (list) => list.filter((p) => p.rand() < p.profile.catchRate);
    const give = (p, base) => {
      p.crystals += 1;
      p.dayCrystals += 1;
      const ouro = p.medals.ouro || 0;
      const bonus = ouro ? 1 + R.PERKS.ouro.crystalBonus[ouro - 1] : 1;
      const cap = p.dayCrystals <= R.CRYSTAL.dailyFull ? 1 : R.CRYSTAL.afterCap;
      gain(p, Math.round(base * bonus * cap));
    };
    if (kind < R.CRYSTAL.storm.chance) {
      // Chuva: conta como um cristal só; cada pessoa clica uma parte dos cristais pequenos.
      for (const p of takes(here)) give(p, color.value * R.CRYSTAL.storm.valueFactor * R.CRYSTAL.storm.gems * STORM_CLICK_SHARE);
      return;
    }
    const isChain = kind < R.CRYSTAL.storm.chance + R.CRYSTAL.chain.chance;
    let caught = takes(here);
    for (const p of caught) give(p, color.value);
    if (!isChain) return;
    // Corrente: continua enquanto pelo menos uma pessoa pegar o anterior; cada elo vale mais.
    for (const value of R.CRYSTAL.chain.values) {
      if (!caught.length) break;
      caught = takes(here);
      for (const p of caught) give(p, value);
    }
  }
}

// ---- Relatório ----
const fmt = (n, digits = 0) => (n == null ? 'nunca' : n.toFixed(digits));
const results = {};
// Média de várias comunidades; um marco só conta se todas chegaram nele.
function average(runs) {
  const mean = (list) => (list.every((v) => v != null) ? list.reduce((a, b) => a + b, 0) / list.length : null);
  const marks = {};
  for (const key of Object.keys(runs[0].marks)) marks[key] = mean(runs.map((r) => r.marks[key]));
  return { marks, perDayFirst30: mean(runs.map((r) => r.perDayFirst30)), perDayToIV: mean(runs.map((r) => r.perDayToIV)), crystalsPerDay: mean(runs.map((r) => r.crystalsPerDay)) };
}
for (const key of Object.keys(PROFILES)) {
  for (const size of SERVER_SIZES) {
    results[`${key}/${size}`] = average(Array.from({ length: REPS }, (_, rep) => simulate(key, size, SEED + size * 1000 + rep)));
  }
}

console.log(`Simulação da economia do Mudae: ${DAYS} dias, semente ${SEED}, média de ${REPS} comunidades\n`);
console.log('Cristais (cor: valor / peso): ' + R.CRYSTAL.colors.map((c) => `${c.key} ${c.value}/${c.weight}`).join(', '));
console.log(`Chuva: ${R.CRYSTAL.storm.chance * 100}%   Corrente: ${R.CRYSTAL.chain.chance * 100}% (${R.CRYSTAL.chain.values.join(', ')})\n`);

const markCols = [['primeira', '1ª medalha'], ['todasI', 'Todas I'], ['todasIV', 'Todas IV'], ...R.POWERS.map((p) => [p.key, p.name])];
const head = ['Perfil', 'Servidor', 'kakera/dia (30 dias)', 'kakera/dia (até IV)', 'cristais/dia', ...markCols.map((c) => c[1])];
const rows = [];
for (const key of Object.keys(PROFILES)) {
  for (const size of SERVER_SIZES) {
    const r = results[`${key}/${size}`];
    rows.push([PROFILES[key].label, `${size}`, fmt(r.perDayFirst30), fmt(r.perDayToIV), fmt(r.crystalsPerDay, 1), ...markCols.map(([m]) => fmt(r.marks[m], 1))]);
  }
}
console.log(head.join(' | '));
for (const row of rows) console.log(row.join(' | '));

// Conferência com as metas da spec.
const normal = SERVER_SIZES.map((s) => results[`normal/${s}`]);
const vicio = SERVER_SIZES.map((s) => results[`viciado/${s}`]);
const spread = (vals) => (vals.every((v) => v != null) ? (Math.max(...vals) - Math.min(...vals)) / Math.min(...vals) : null);
const checks = [
  ['normal: kakera por dia (dias 1 a 30) em 850 a 1150', normal.every((r) => Math.abs(r.perDayFirst30 - KAKERA_PER_DAY_TARGET) <= 150)],
  ['1ª medalha no dia 1 (normal, média até 1,25)', normal.every((r) => r.marks.primeira <= 1.25)],
  ['todas no I entre os dias 9 e 13 (normal)', normal.every((r) => r.marks.todasI >= 9 && r.marks.todasI <= 13)],
  ['todas no IV entre os dias 100 e 135 (normal)', normal.every((r) => r.marks.todasIV >= 100 && r.marks.todasIV <= 135)],
  ['viciado chega ao IV no máximo 4x mais rápido que o normal', normal.every((r, i) => vicio[i].marks.todasIV != null && r.marks.todasIV / vicio[i].marks.todasIV <= 4)],
  ['servidor de 1 e de 20 pessoas: diferença até 10% (todas I e todas IV, normal)',
    spread([results['normal/1'].marks.todasI, results['normal/20'].marks.todasI]) <= 0.1 && spread([results['normal/1'].marks.todasIV, results['normal/20'].marks.todasIV]) <= 0.1],
];
console.log('\nMetas da spec:');
for (const [label, ok] of checks) console.log(`${ok ? 'OK  ' : 'FALHA'} ${label}`);
console.log(`Viciado/normal (todas IV), servidor de 5: ${(results['normal/5'].marks.todasIV / results['viciado/5'].marks.todasIV).toFixed(2)}x`);

if (args.includes('--md')) {
  console.log('\n' + '| ' + head.join(' | ') + ' |\n|' + head.map(() => '---').join('|') + '|');
  for (const row of rows) console.log('| ' + row.join(' | ') + ' |');
}
process.exitCode = checks.every((c) => c[1]) ? 0 : 1;
