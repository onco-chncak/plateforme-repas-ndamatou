// Versioned policy: 102 paid / 101 badge credit. XOF badge balances stay integer;
// accounting amounts use cents to preserve the 2% processor deduction exactly.
const FEE_POLICY = 'shared_510_505_v1';
const validMoney = value => Number.isSafeInteger(value) && value >= 0 && value <= 1000000000;

function quoteMobileTopup(grossAmount) {
  if (!validMoney(grossAmount) || grossAmount === 0) throw new Error('Montant versé entier positif requis.');
  const amount = Math.round(grossAmount * 101 / 102);
  return {
    feePolicy: FEE_POLICY,
    amount,
    grossAmount,
    waveFeeRate: 1,
    waveFeeAmount: grossAmount - amount,
    processorFeeCents: grossAmount * 2,
    netReceivedCents: grossAmount * 98,
  };
}

function quoteMealSettlement(staffDebit, hospitalBase) {
  if (!validMoney(staffDebit) || !validMoney(hospitalBase)) throw new Error('Parts du repas invalides.');
  const mealBase = staffDebit + hospitalBase;
  return {
    staffDebit,
    hospitalBase,
    hospitalContributionCents: hospitalBase,
    hospitalDueCents: hospitalBase * 101,
    restaurantContributionCents: mealBase,
    restaurantDueCents: mealBase * 99,
  };
}

function summarizeMealSettlements(orders) {
  const total = { count: 0, staffDebit: 0, hospitalBase: 0, hospitalContributionCents: 0, hospitalDueCents: 0, restaurantContributionCents: 0, restaurantDueCents: 0 };
  for (const order of orders) {
    const snapshot = order.settlement;
    if (order.status !== 'delivered' || order.paymentStatus !== 'paid' || order.orderType === 'special_dinner' || snapshot?.policy !== FEE_POLICY || !validMoney(snapshot.staffBase) || !validMoney(snapshot.hospitalBase)) continue;
    const quote = quoteMealSettlement(snapshot.staffBase, snapshot.hospitalBase);
    total.count++;
    for (const key of Object.keys(quote)) total[key] += quote[key];
  }
  return total;
}

function getSharedFeeSettingsPatch(settings) {
  if (settings.sharedFeeModelVersion === FEE_POLICY) return null;
  return {
    sharedFeeModelVersion: FEE_POLICY,
    realMealPrice: 1000,
    staffMealPrice: 500,
    hospitalSupportAmount: 500,
    legacyAccountingPrices: settings.legacyAccountingPrices || {
      real: settings.realMealPrice ?? 800,
      staff: settings.staffMealPrice ?? 410,
      hospital: settings.hospitalSupportAmount ?? 390,
    },
  };
}

module.exports = { FEE_POLICY, quoteMobileTopup, quoteMealSettlement, summarizeMealSettlements, getSharedFeeSettingsPatch };
