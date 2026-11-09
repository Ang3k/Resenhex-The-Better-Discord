// Mudae: todas as regras de números num lugar só (medalhas, acabamentos, cristal errante, superpoderes).
// O servidor, os testes e a simulação (tools/mudae-economia.js) leem daqui; nada de número solto por aí.
const HOUR = 3600_000;
const MIN = 60_000;

// Medalhas da Forja. O preço de cada nível é a base × o nível (I a IV).
const MEDAL_KEYS = ['bronze', 'prata', 'ouro', 'safira', 'rubi', 'esmeralda', 'diamante'];
const MEDALS = {
  bronze: { name: 'Bronze', base: 500 },
  prata: { name: 'Prata', base: 750 },
  ouro: { name: 'Ouro', base: 1000 },
  safira: { name: 'Safira', base: 1500 },
  rubi: { name: 'Rubi', base: 2000 },
  esmeralda: { name: 'Esmeralda', base: 2500 },
  diamante: { name: 'Diamante', base: 3000 },
};
const priceOf = (medal, level) => MEDALS[medal].base * level;

// Vantagens por nível (o índice 0 é o nível I).
const PERKS = {
  bronze: { wishSlots: [1, 2, 3, 4] }, // vagas de desejo a mais
  prata: { carry: [1, 2, 3, 4] }, // rolls que passam para a meia hora seguinte
  ouro: { crystalBonus: [0.1, 0.2, 0.3, 0.3], dkDouble: [false, false, false, true] }, // mais kakera nos cristais; $dk em dobro no IV
  safira: { extraRolls: [1, 2, 3, 4] }, // rolls a mais a cada 30 min
  rubi: { wishChance: [0.005, 0.01, 0.015, 0.02] }, // chance de o roll trazer um desejo
  esmeralda: { reserveEveryMs: [24, 18, 12, 6].map((h) => h * HOUR) }, // um casamento de reserva a cada tanto tempo
  diamante: { rechargeMs: [20, 17, 14, 12].map((h) => h * HOUR) }, // tempo para um poder recarregar
};

// Acabamentos sorteados ao forjar (peso em %), com a raridade cuja cor eles usam.
const FINISHES = [
  { key: 'metal', label: 'Metal', weight: 60, rarity: 'common' },
  { key: 'esmalte', label: 'Esmalte', weight: 28, rarity: 'rare' },
  { key: 'holo', label: 'Holográfico', weight: 10, rarity: 'epic' },
  { key: 'galaxia', label: 'Galáxia', weight: 2, rarity: 'legendary' },
];
const REFORGE_PRICE = 500; // kakera para sortear o acabamento de novo

// Divórcio devolve o valor da carta, mas no máximo 500 de kakera a cada 24 h.
const DIVORCE_CAP = 500;
const DIVORCE_CAP_MS = 24 * HOUR;
// O "dia" do jogo vira à meia-noite de Brasília (UTC-3).
const DAY_MS = 24 * HOUR;
const DAY_OFFSET_MS = 3 * HOUR;

// Cristal errante. Valores e pesos saem da simulação (tools/mudae-economia.js).
const CRYSTAL = {
  everyMinMs: 5 * MIN, // um cristal novo a cada 5 a 15 min, com alguém no Salão
  everyMaxMs: 15 * MIN,
  lifeMs: 10_000, // tempo de vida do cristal que passa
  graceMs: 1500, // folga para a internet lenta
  tickMs: 5000, // de quanto em quanto tempo o servidor olha se é hora de nascer um
  dailyFull: 15, // os 15 primeiros do dia rendem o valor inteiro
  afterCap: 0.1, // depois disso rendem 10%
  colors: [
    { key: 'roxo', value: 75, weight: 30, hex: '#a35bff' },
    { key: 'azul', value: 100, weight: 28, hex: '#3b82f6' },
    { key: 'ciano', value: 130, weight: 18, hex: '#22d3ee' },
    { key: 'verde', value: 175, weight: 12, hex: '#22c55e' },
    { key: 'amarelo', value: 235, weight: 7, hex: '#facc15' },
    { key: 'laranja', value: 340, weight: 3.5, hex: '#fb923c' },
    { key: 'vermelho', value: 560, weight: 1.5, hex: '#ef4444' },
  ],
  // Chuva: muitos cristais pequenos; cada um vale valueFactor do valor da cor.
  storm: { chance: 0.04, gems: 16, lifeMs: 7000, valueFactor: 0.25 },
  // Corrente: pegar um cristal faz nascer outro, valendo mais, enquanto alguém pegar o anterior.
  chain: { chance: 0.04, values: [40, 75, 140, 280, 560], gapMs: 1200, lifeMs: 6000 },
};

// Superpoderes: cada um abre quando o contador `count` chega a `need`.
const POWERS = [
  { key: 'videncia', name: 'Vidência', icon: '🔮', count: 'forged', need: 1 },
  { key: 'cadeado', name: 'Cadeado', icon: '🔒', count: 'claims', need: 20 },
  { key: 'amuleto', name: 'Amuleto', icon: '🍀', count: 'legendary', need: 1 },
  { key: 'chuva', name: 'Chuva de cristais', icon: '🌧️', count: 'crystals', need: 40 },
  { key: 'desejo', name: 'Chamar desejo', icon: '💫', count: 'bronzeLevel', need: 3 },
  { key: 'eco', name: 'Eco', icon: '🔁', count: 'claims', need: 60 },
  { key: 'dupla', name: 'Escolha dupla', icon: '🃏', count: 'rolls', need: 500 },
  { key: 'laco', name: 'Laço', icon: '🪢', count: 'medalsAt2', need: 7 },
];
const POWER_SLOTS = 3; // poderes equipados ao mesmo tempo
const POWER_RECHARGE_MS = 24 * HOUR;
const AMULETO = { legendary: 5, epic: 3 }; // vezes a chance de cada raridade
const DESEJO_CHANCE = 0.4;
const ECO = { recent: 5, withinMs: 10 * MIN };

module.exports = { MEDAL_KEYS, MEDALS, priceOf, PERKS, FINISHES, REFORGE_PRICE, DIVORCE_CAP, DIVORCE_CAP_MS, DAY_MS, DAY_OFFSET_MS,
  CRYSTAL, POWERS, POWER_SLOTS, POWER_RECHARGE_MS, AMULETO, DESEJO_CHANCE, ECO };
