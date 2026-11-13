const test = require('node:test');
const assert = require('node:assert/strict');
const finance = require('../functions/finance.cjs');

test('510 F versés : crédit 505, frais agent 5, frais Bictorys 10,20, net 499,80', () => {
  const quote = finance.quoteMobileTopup(510);
  assert.equal(quote.amount, 505);
  assert.equal(quote.grossAmount, 510);
  assert.equal(quote.waveFeeAmount, 5);
  assert.equal(quote.processorFeeCents, 1020);
  assert.equal(quote.netReceivedCents, 49980);
  assert.equal(quote.amount - 500, 5);
  assert.equal(quote.netReceivedCents + 50500 - 99000 - 500, 980);
});

test('les grands montants respectent le même partage et restent en XOF entiers', () => {
  const quote = finance.quoteMobileTopup(5100);
  assert.equal(quote.amount, 5050);
  assert.equal(quote.waveFeeAmount, 50);
  for (let gross = 1; gross <= 10000; gross++) {
    const q = finance.quoteMobileTopup(gross);
    assert.ok(Number.isSafeInteger(q.amount));
    assert.equal(q.amount + q.waveFeeAmount, gross);
    assert.equal(q.netReceivedCents + q.processorFeeCents, gross * 100);
  }
});

test('montants négatifs, fractionnaires et non finis sont refusés', () => {
  for (const amount of [0, -510, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER]) {
    assert.throws(() => finance.quoteMobileTopup(amount));
  }
});

test('repas servi : hôpital dû 505 F et restaurant dû 990 F, sans frais sur le badge', () => {
  const result = finance.quoteMealSettlement(500, 500);
  assert.equal(result.staffDebit, 500);
  assert.equal(result.hospitalDueCents, 50500);
  assert.equal(result.restaurantDueCents, 99000);
  assert.equal(result.restaurantContributionCents, 1000);
});

test('repas non subventionné : aucune contribution hospitalière', () => {
  const result = finance.quoteMealSettlement(1000, 0);
  assert.equal(result.hospitalDueCents, 0);
  assert.equal(result.restaurantDueCents, 99000);
});

test('reversements : seuls les nouveaux repas remis et payés sont comptabilisés', () => {
  const meal = { status: 'delivered', paymentStatus: 'paid', settlement: { policy: finance.FEE_POLICY, staffBase: 500, hospitalBase: 500 } };
  const result = finance.summarizeMealSettlements([meal, { ...meal, status: 'pending' }, { ...meal, status: 'cancelled' }, { ...meal, paymentStatus: 'refunded' }, { status: 'delivered', paymentStatus: 'paid' }]);
  assert.equal(result.count, 1);
  assert.equal(result.hospitalDueCents, 50500);
  assert.equal(result.restaurantDueCents, 99000);
  // There is no read of mutable institution settings: the paid meal keeps its original price.
  assert.equal(finance.summarizeMealSettlements([meal]).staffDebit, 500);
});

test('migration des tarifs : 1000/500/500, anciens tarifs conservés et activation unique', () => {
  const patch = finance.getSharedFeeSettingsPatch({ realMealPrice:800, staffMealPrice:410, hospitalSupportAmount:390 });
  assert.equal(patch.realMealPrice,1000);
  assert.equal(patch.staffMealPrice,500);
  assert.equal(patch.hospitalSupportAmount,500);
  assert.deepEqual(patch.legacyAccountingPrices,{real:800,staff:410,hospital:390});
  assert.equal(finance.getSharedFeeSettingsPatch({...patch,realMealPrice:1200}),null);
});
