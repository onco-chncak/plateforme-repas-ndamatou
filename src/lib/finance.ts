export { FEE_POLICY, quoteMobileTopup, quoteMealSettlement, summarizeMealSettlements, getSharedFeeSettingsPatch } from '@ndamatou/finance';

export const formatAccountingCents = (cents: number) =>
  `${(cents / 100).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} F CFA`;
