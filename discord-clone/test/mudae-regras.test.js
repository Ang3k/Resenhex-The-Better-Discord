const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../server/mudae-regras');

const HOUR = 3600_000;

test('regras batem com a spec', () => {
  assert.deepEqual(R.MEDAL_KEYS, ['bronze', 'prata', 'ouro', 'safira', 'rubi', 'esmeralda', 'diamante']);
  assert.equal(R.priceOf('diamante', 4), 12000);
  assert.equal(R.priceOf('bronze', 2), 1000);
  let total = 0;
  for (const key of R.MEDAL_KEYS) for (let level = 1; level <= 4; level++) total += R.priceOf(key, level);
  assert.equal(total, 112500);

  assert.deepEqual(R.PERKS.bronze.wishSlots, [1, 2, 3, 4]);
  assert.deepEqual(R.PERKS.prata.carry, [1, 2, 3, 4]);
  assert.deepEqual(R.PERKS.ouro.crystalBonus, [0.1, 0.2, 0.3, 0.3]);
  assert.deepEqual(R.PERKS.ouro.dkDouble, [false, false, false, true]);
  assert.deepEqual(R.PERKS.safira.extraRolls, [1, 2, 3, 4]);
  assert.deepEqual(R.PERKS.rubi.wishChance, [0.005, 0.01, 0.015, 0.02]);
  assert.equal(R.PERKS.esmeralda.reserveEveryMs[3], 6 * HOUR);
  assert.deepEqual(R.PERKS.esmeralda.reserveEveryMs, [24, 18, 12, 6].map((h) => h * HOUR));
  assert.deepEqual(R.PERKS.diamante.rechargeMs, [20, 17, 14, 12].map((h) => h * HOUR));

  assert.deepEqual(R.FINISHES.map((f) => f.weight), [60, 28, 10, 2]);
  assert.deepEqual(R.FINISHES.map((f) => f.rarity), ['common', 'rare', 'epic', 'legendary']);
  assert.equal(R.REFORGE_PRICE, 500);
  assert.equal(R.DIVORCE_CAP, 500);
  assert.equal(R.DIVORCE_CAP_MS, 24 * HOUR);
  assert.equal(R.DAY_MS, 24 * HOUR);
  assert.equal(R.DAY_OFFSET_MS, 3 * HOUR);

  assert.equal(R.CRYSTAL.dailyFull, 15);
  assert.equal(R.CRYSTAL.afterCap, 0.02);
  assert.equal(R.CRYSTAL.cardEveryMs, 30 * 60_000);
  assert.equal(R.CRYSTAL.storm.calledFactor, 0.1);
  assert.equal(R.CRYSTAL.storm.capCost, 2);
  assert.equal(R.CRYSTAL.everyMinMs, 5 * 60_000);
  assert.equal(R.CRYSTAL.everyMaxMs, 15 * 60_000);
  assert.equal(R.CRYSTAL.lifeMs, 10_000);
  assert.equal(R.CRYSTAL.graceMs, 1500);
  assert.equal(R.CRYSTAL.tickMs, 5000);
  assert.equal(R.CRYSTAL.colors.length, 7);
  assert.equal(R.CRYSTAL.storm.gems, 16);
  assert.equal(R.CRYSTAL.storm.lifeMs, 7000);
  assert.equal(R.CRYSTAL.storm.valueFactor, 0.25);
  assert.equal(R.CRYSTAL.chain.gapMs, 1200);
  assert.equal(R.CRYSTAL.chain.lifeMs, 6000);

  assert.deepEqual(R.POWERS.map((p) => [p.key, p.count, p.need]), [
    ['videncia', 'forged', 1], ['cadeado', 'claims', 20], ['amuleto', 'legendary', 1], ['chuva', 'crystals', 40],
    ['desejo', 'bronzeLevel', 3], ['eco', 'claims', 60], ['dupla', 'rolls', 500], ['laco', 'medalsAt2', 7]]);
  // O ícone de cada poder é desenhado no navegador (public/mudae-icones.js), pela chave.
  assert.ok(R.POWERS.every((p) => !('icon' in p)));
  assert.equal(R.POWER_SLOTS, 3);
  assert.equal(R.POWER_RECHARGE_MS, 24 * HOUR);
  assert.deepEqual(R.AMULETO, { legendary: 5, epic: 3 });
  assert.equal(R.DESEJO_CHANCE, 0.4);
  assert.deepEqual(R.ECO, { recent: 5, withinMs: 10 * 60_000 });
});
