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

// Divórcio devolve o valor da carta, mas no máximo 200 de kakera a cada 24 h (era 500; baixado em 11/11, ver o plano).
const DIVORCE_CAP = 200;
const DIVORCE_CAP_MS = 24 * HOUR;
// O "dia" do jogo vira à meia-noite de Brasília (UTC-3).
const DAY_MS = 24 * HOUR;
const DAY_OFFSET_MS = 3 * HOUR;

// Cristal errante. Valores e pesos saem da simulação (tools/mudae-economia.js).
const CRYSTAL = {
  // Um cristal novo a cada 5 a 10 min (média de 7,5), com alguém no Salão: escolha do dono em 16/11. No ar até a 2.6.0
  // era 5 a 15 (~990 de kakera por dia no jogador normal); 3 a 7 dava ~1.670; 5 a 10 dá ~1.220 (ver tools/mudae-economia.js).
  everyMinMs: 5 * MIN,
  everyMaxMs: 10 * MIN,
  lifeMs: 10_000, // tempo de vida do cristal que passa
  graceMs: 1500, // folga para a internet lenta
  tickMs: 5000, // de quanto em quanto tempo o servidor olha se é hora de nascer um
  dailyFull: 15, // os 15 primeiros do dia rendem o valor inteiro
  afterCap: 0.02, // depois disso rendem 2% (quem fica o dia todo, ou um robô, não dispara na frente)
  cardEveryMs: 30 * MIN, // o cristal que sai da carta com dono: no máximo 1 a cada 30 min por quem rodou
  colors: [
    { key: 'roxo', value: 75, weight: 30, hex: '#a35bff' },
    { key: 'azul', value: 100, weight: 28, hex: '#3b82f6' },
    { key: 'ciano', value: 130, weight: 18, hex: '#22d3ee' },
    { key: 'verde', value: 175, weight: 12, hex: '#22c55e' },
    { key: 'amarelo', value: 235, weight: 7, hex: '#facc15' },
    { key: 'laranja', value: 340, weight: 3.5, hex: '#fb923c' },
    { key: 'vermelho', value: 560, weight: 1.5, hex: '#ef4444' },
  ],
  // Kakera que nasce da carta de um personagem com dono (o cristal "da carta"): às vezes vem arco-íris (valor sorteado).
  rainbow: { chance: 0.03, min: 250, max: 900, hex: '#ff4d94' },
  // Energia (o "poder de reação" do Mudae): cada pessoa gasta um pouco ao pegar um cristal da carta (o errante e a chuva não gastam). Volta com o tempo.
  // O roxo é de graça, como no original.
  power: { max: 100, regenPerHour: 50, cost: { roxo: 0, azul: 15, ciano: 20, verde: 25, amarelo: 30, laranja: 35, vermelho: 45, arcoiris: 50 } },
  // Chuva: muitos cristais pequenos; cada um vale valueFactor do valor da cor (a que nasce sozinha, rara) ou
  // calledFactor (a do poder Chuva, uma por dia: ~210 se pegar todas). Conta capCost no teto do dia.
  // lifeMs: 10 s (era 7 s). Com as gotas caindo mais devagar (4,2 s cada, public/mudae-cristal.js), as 16 continuam
  // espaçadas (uma a cada ~0,4 s) em vez de caírem quase todas juntas.
  storm: { chance: 0.04, gems: 16, lifeMs: 10_000, valueFactor: 0.25, calledFactor: 0.1, capCost: 2 },
  // Corrente: pegar um cristal faz nascer outro, valendo mais, enquanto alguém pegar o anterior.
  chain: { chance: 0.04, values: [40, 75, 140, 280, 560], gapMs: 1200, lifeMs: 6000 },
};

// Superpoderes: cada um abre quando o contador `count` chega a `need`.
const POWERS = [
  { key: 'videncia', name: 'Vidência', count: 'forged', need: 1 },
  { key: 'cadeado', name: 'Cadeado', count: 'claims', need: 20 },
  { key: 'amuleto', name: 'Amuleto', count: 'legendary', need: 1 },
  { key: 'chuva', name: 'Chuva de cristais', count: 'crystals', need: 40 },
  { key: 'desejo', name: 'Chamar desejo', count: 'bronzeLevel', need: 2 },
  { key: 'eco', name: 'Eco', count: 'claims', need: 60 },
  { key: 'dupla', name: 'Escolha dupla', count: 'rolls', need: 500 },
  { key: 'laco', name: 'Laço', count: 'medalsAt2', need: 7 },
];
const POWER_SLOTS = 3; // poderes equipados ao mesmo tempo
const POWER_RECHARGE_MS = 24 * HOUR;
const AMULETO = { legendary: 5, epic: 3 }; // vezes a chance de cada raridade
const DESEJO_CHANCE = 0.4;
const ECO = { recent: 5, withinMs: 10 * MIN };

// Chaves (wiki do Mudae: Keys). Rolar um personagem seu sobe a chave dele; a chave fica com o personagem.
// bonuses: [nível, 'pct' ou 'flat', quanto]. Os % somam sobre o valor base; os fixos são kakera a mais.
const KEY_BONUSES = [];
for (const level of [2, 4, 5, 7, 8, 9]) KEY_BONUSES.push([level, 'pct', 0.1]);
KEY_BONUSES.push([10, 'flat', 15], [11, 'pct', 0.05], [15, 'flat', 15]);
for (const level of [20, 25, 30]) KEY_BONUSES.push([level, 'flat', 10]);
for (let level = 35; level <= 60; level += 5) KEY_BONUSES.push([level, 'flat', 5]);
for (let level = 70; level <= 300; level += 10) KEY_BONUSES.push([level, 'flat', 5]);
const KEYS = {
  // Chance de um roll sem poder armado cair num personagem seu (é o que faz as chaves andarem num catálogo de 130 mil).
  // O createMudae começa com 0 (os testes não dependem de sorte); o server.js liga este valor.
  ownChance: 0.02,
  max: 500, // nível máximo de uma chave (o último degrau da wiki)
  embedFrom: 1, // a partir deste nível o dono pode escolher a cor do personagem ($embedcolor)
  tiers: [{ key: 'caos', from: 10 }, { key: 'ouro', from: 6 }, { key: 'prata', from: 3 }, { key: 'bronze', from: 1 }],
  bonuses: KEY_BONUSES,
  // Rolar um personagem de chave 6 ou mais rende o valor dele em kakera, até goldCap a cada 24 h (no original são 4.500 a cada 3 h).
  goldFrom: 6,
  goldCap: 100,
  // O que a chave faz no cristal da carta (tabela da wiki: Keys). second: [nível, chance] de um segundo cristal.
  reaction: {
    orangeFrom: 3, orangeColors: ['ciano', 'verde'], // da prata em diante, ciano e verde viram laranja
    halfCostFrom: 10, // a partir do 10, a energia custa metade
    bonusColors: ['roxo', 'vermelho', 'arcoiris'],
    bonus: [[400, 2.5], [200, 1.5], [50, 0.75]], // +75% (50), +150% (200) e +250% (400) no total
    second: [[500, 1], [300, 0.75], [100, 0.5], [25, 0.25]],
  },
  soulNeed: 10, // chaves rolladas por você mesmo para o personagem virar soulmate
  // O valor de todos sobe com os casamentos do servidor: +5% a cada 500, até +20% (com 2.000 ou mais).
  serverStep: 500,
  serverPct: 0.05,
  serverMax: 0.2,
};

// Likelist e desejos (Lote C).
const LIKES = { max: 100, dailyFrom: 5, titleMax: 40 }; // com dailyFrom curtidas, o $daily guarda 2 usos
const WISHES = {
  starBase: 1, starSlotCost: 2, // a n-ésima vaga extra de starwish custa 2 × n vagas de desejo
  starWeight: 3, // a starwish pesa 3 vezes mais quando o Rubi e o Chamar desejo escolhem um desejo
  seriesBase: 1, // obras inteiras desejadas (mais 1 a cada 2 vagas de desejo da Bronze)
  wishkReward: 100, wishkCap: 300, // $wishk: kakera quando OUTRA pessoa casa com o personagem, no máximo wishkCap por 24 h
};

// Ajustes do servidor ($settings): quem tem "Gerenciar o Mudae" muda. Cada um tem o padrão e, nos números, a faixa aceita.
const SETTINGS = {
  claimWindowSec: { def: 45, min: 15, max: 120, label: 'tempo para casar com um roll', unit: 's' },
  rolls: { def: 10, min: 2, max: 10, label: 'rolls por janela de 30 minutos (antes das medalhas)', unit: '' },
  haremLimit: { def: 0, min: 10, max: 5000, label: 'limite de personagens no harém (0 = sem limite)', unit: '' },
  snipe: { def: true, label: 'casar com o roll de outra pessoa depois da prioridade' },
  crystals: { def: true, label: 'cristais de kakera (errante, da carta e chuva)' },
};
// O que o servidor tira da roleta ($serverdisable) e quantos itens a moderação guarda para restaurar.
const ROLL_FILTER = { tries: 40, serverDisabledMax: 1000, restoreKeep: 200 };
// As formas do cristal que cada pessoa escolhe para cada cor ($kakerareact).
const KAKERA_SHAPES = ['gema', 'coracao', 'estrela', 'gota', 'losango'];
const KAKERA_COLORS = ['roxo', 'azul', 'ciano', 'verde', 'amarelo', 'laranja', 'vermelho', 'arcoiris'];

// Conquistas (Fase 9). Cada trilha tem 3 níveis (bronze, prata, ouro); a meta de cada um vem de um contador (count).
// Recompensas: kakera uma vez (KAKERA × peso da trilha; a soma de todas fica perto de 11.000, cerca de 10% da Forja),
// um título por nível e, em 3 conquistas de ouro, uma vantagem pequena e permanente.
// Consolo de quem rola personagem que já tem dono: o lendário devolve o roll e metade do valor em kakera; a cada pityAt rolls
// de casados, o roll seguinte vem livre e épico ou lendário (legendaryShare dessas vezes é lendário). O $inveja avisa o dono.
const UNLUCKY = { pityAt: 15, legendaryKakeraShare: 0.5, pityLegendaryShare: 0.25, envyCooldownMs: 30 * 60_000, envyLines: [
  '{quem} está de olho em {personagem}. Dorme com um olho aberto.',
  '{quem} rolou {personagem} e saiu chorando. Cuida bem, hein?',
  '{quem} suspirou olhando para {personagem} no seu harém.',
  'Alerta de inveja: {quem} queria muito {personagem}.',
  '{quem} jura que {personagem} merecia um dono melhor. Será?',
  '{quem} está contando os dias para {personagem} sair do seu harém.',
] };

const ACHIEVEMENTS = {
  kakera: [18, 72, 260], // kakera de cada nível
  noKakera: ['azar'], // trilhas só de título: o consolo de lendário já paga, e o total fica nos 10% da Forja
  pairPerDay: 3, // trocas e presentes entre as mesmas duas contas contam no máximo 3 vezes por dia
  deepFrom: 50000, // "Garimpeiro": personagem a partir desta posição do catálogo
  // "Obra completa": só vale obra com 3 a 12 personagens na roleta (uma obra de 1 ou 2 personagens se completaria sem querer).
  seriesMin: 3,
  seriesMax: 12,
  hiddenKakera: 100,
  // [chave, categoria, nome da trilha, contador, metas, nomes dos níveis]
  trails: [
    ['giro', 'roleta', 'Giro', 'rolls', [50, 500, 5000], ['Girador', 'Roleteiro', 'Sem freio']],
    ['constancia', 'constancia', 'Frequentador', 'daysPlayed', [3, 14, 60], ['De passagem', 'Frequentador', 'De casa']],
    ['sequencia', 'constancia', 'Sequência do $dk', 'dkStreak', [3, 7, 30], ['Três dias', 'Uma semana', 'Um mês']],
    ['casamenteiro', 'colecao', 'Casamenteiro', 'claims', [10, 50, 200], ['Casamenteiro', 'Colecionador', 'Grande harém']],
    ['haremcheio', 'colecao', 'Harém cheio', 'haremSize', [25, 100, 250], ['Harém em formação', 'Harém cheio', 'Harém lotado']],
    ['fiel', 'colecao', 'Fiel a uma obra', 'bestSeries', [5, 15, 30], ['Fã', 'Devoto', 'Dono da obra']],
    ['obracompleta', 'colecao', 'Obra completa', 'seriesComplete', [1, 3, 10], ['Completista', 'Colecionador de obras', 'Enciclopédia']],
    ['cosmopolita', 'colecao', 'Cosmopolita', 'sourcesOwned', [3, 5, 6], ['Viajante', 'Cosmopolita', 'Cidadão do mundo']],
    ['brilho', 'raridade', 'Brilho', 'legendary', [1, 5, 20], ['Primeiro brilho', 'Caçador de lendas', 'Lenda viva']],
    ['faro', 'raridade', 'Faro', 'epic', [5, 25, 100], ['Faro bom', 'Faro apurado', 'Faro de ouro']],
    ['garimpeiro', 'raridade', 'Garimpeiro', 'deepClaims', [1, 10, 50], ['Garimpeiro', 'Minerador', 'Arqueólogo']],
    ['cristaleiro', 'kakera', 'Cristaleiro', 'crystals', [20, 200, 1000], ['Cristaleiro', 'Colecionador de cristais', 'Chuva de cristais']],
    ['cofre', 'kakera', 'Cofre', 'kakeraPeak', [1000, 10000, 50000], ['Cofrinho', 'Cofre', 'Tesouro']],
    ['rendimento', 'kakera', 'Rendimento', 'earned', [2000, 20000, 100000], ['Poupador', 'Investidor', 'Magnata']],
    ['ferreiro', 'forja', 'Ferreiro', 'forged', [1, 7, 28], ['Aprendiz', 'Ferreiro', 'Mestre ferreiro']],
    ['poderes', 'forja', 'Mestre dos poderes', 'powersOpen', [3, 6, 8], ['Poderoso', 'Muito poderoso', 'Todos os poderes']],
    ['generoso', 'social', 'Generoso', 'gifts', [1, 10, 50], ['Presenteador', 'Generoso', 'Papai Noel']],
    ['negociante', 'social', 'Negociante', 'trades', [1, 10, 50], ['Negociante', 'Comerciante', 'Magnata das trocas']],
    ['maoaberta', 'social', 'Mão aberta', 'kakeraGiven', [500, 5000, 25000], ['Mão aberta', 'Mecenas', 'Filantropo']],
    ['realizador', 'desejos', 'Realizador', 'wishClaims', [1, 10, 50], ['Desejo realizado', 'Realizador', 'Gênio da lâmpada']],
    ['cuidador', 'harem', 'Cuidador', 'notes', [5, 25, 100], ['Anotador', 'Cuidador', 'Arquivista']],
    ['organizado', 'harem', 'Organizado', 'organized', [1, 3, 5], ['Arrumadinho', 'Organizado', 'Bibliotecário']],
    ['faxina', 'harem', 'Faxina', 'divorces', [5, 25, 100], ['Limpeza leve', 'Faxineiro', 'Terra arrasada']],
    ['chaveiro', 'chaves', 'Chaveiro', 'keys', [3, 20, 100], ['Chaveiro', 'Molho de chaves', 'Guardião das chaves']],
    ['almagemea', 'chaves', 'Alma gêmea', 'soulmates', [1, 5, 15], ['Alma gêmea', 'Corações ligados', 'Constelação']],
    ['reflexo', 'reacao', 'Reflexo', 'cardKakera', [10, 100, 500], ['Reflexo', 'Reflexo rápido', 'Reflexo de ouro']],
    ['arcoiris', 'reacao', 'Arco-íris', 'rareColors', [1, 5, 20], ['Cor rara', 'Colecionador de cores', 'Arco-íris completo']],
    ['azar', 'roleta', 'Azarado', 'unlucky', [10, 50, 150], ['Vítima do Roll', 'Injustiçado do Harém', 'Sempre Chego Tarde']],
    ['sorte', 'roleta', 'Sorte de principiante', 'firstRollClaims', [1, 10, 50], ['Sorte de principiante', 'Sorte de campeão', 'Sorte lendária']],
    ['gatilho', 'desejos', 'Dedo no gatilho', 'fastWish', [1, 5, 20], ['Dedo rápido', 'Gatilho veloz', 'Mais rápido que a luz']],
    ['acabamento', 'forja', 'Acabamento raro', 'finishRare', [1, 3, 7], ['Acabamento raro', 'Coleção de brilhos', 'Galeria de luxo']],
  ],
  // Conquistas escondidas (um nível só, só aparecem depois de abertas).
  hidden: [
    ['madrugada', 'Madrugada', 'night', 1, 'Casou entre 3h e 5h da manhã (Brasília).'],
    ['reencontro', 'Reencontro', 'remarried', 1, 'Casou de novo com um personagem que já foi seu.'],
    ['quase', 'Quase', 'closeCall', 1, 'Perdeu um personagem por menos de 1 segundo.'],
    ['diaperfeito', 'Dia perfeito', 'perfectDay', 1, 'No mesmo dia: os 15 cristais inteiros, o $dk e o $daily.'],
  ],
  // Do servidor (coletivas): quando o servidor inteiro chega à meta de casamentos, quem jogou nos últimos activeDays dias (e já
  // tinha activeMinRolls rolls) ganha a conquista, uma vez por meta. [chave, categoria, nome, contador, metas, nomes, kakera]
  serverTrail: ['servidor', 'servidor', 'Todos juntos', 'serverClaims', [100, 1000, 10000], ['Cem casamentos', 'Mil casamentos', 'Dez mil casamentos'], [50, 100, 200]],
  activeDays: 30,
  activeMinRolls: 10,
  // Vantagens permanentes (no máximo 3), dadas pelo nível ouro destas trilhas.
  perks: { 'casamenteiro:3': { wishSlots: 1, label: '+1 vaga de desejo' }, 'obracompleta:3': { carry: 1, label: '+1 roll guardado para a janela seguinte' }, 'sequencia:3': { rollsDiscount: 0.1, label: '-10% no preço do $rolls' } },
  categories: { roleta: 'Roleta', constancia: 'Constância', colecao: 'Coleção', raridade: 'Raridade', kakera: 'Kakera', forja: 'Forja e poderes', social: 'Social', desejos: 'Desejos', harem: 'Harém', chaves: 'Chaves', reacao: 'Kakera nos casados', servidor: 'Do servidor', ocultas: 'Ocultas' },
};

module.exports = { UNLUCKY, ACHIEVEMENTS, SETTINGS, ROLL_FILTER, KAKERA_SHAPES, KAKERA_COLORS, KEYS, KEY_BONUSES, LIKES, WISHES, MEDAL_KEYS, MEDALS, priceOf, PERKS, FINISHES, REFORGE_PRICE, DIVORCE_CAP, DIVORCE_CAP_MS, DAY_MS, DAY_OFFSET_MS,
  CRYSTAL, POWERS, POWER_SLOTS, POWER_RECHARGE_MS, AMULETO, DESEJO_CHANCE, ECO };
