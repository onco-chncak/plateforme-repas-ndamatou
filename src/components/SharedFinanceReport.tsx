import React from 'react';
import type { CashTransaction, Order } from '../types';
import { FEE_POLICY, summarizeMealSettlements, formatAccountingCents } from '../lib/finance';

type Props = { orders: Order[]; transactions: CashTransaction[]; badgeReserve: number; period: string };

export function SharedFinanceReport({ orders, transactions, badgeReserve, period }: Props) {
  const settlement = summarizeMealSettlements(orders);
  const mobile = transactions.filter(item => item.feePolicy === FEE_POLICY && !item.correctionOf && Number.isSafeInteger(item.grossAmount) && Number.isSafeInteger(item.processorFeeCents) && Number.isSafeInteger(item.netReceivedCents));
  const sums = mobile.reduce((sum, item) => ({
    gross: sum.gross + item.grossAmount! * 100,
    credit: sum.credit + item.amount * 100,
    agent: sum.agent + (item.waveFeeAmount || 0) * 100,
    fees: sum.fees + item.processorFeeCents!,
    net: sum.net + item.netReceivedCents!,
  }), { gross: 0, credit: 0, agent: 0, fees: 0, net: 0 });
  const lines: [string, number][] = [
    ['Versements mobiles confirmés', sums.gross],
    ['Crédits badge correspondants', sums.credit],
    ['Contributions des agents à la recharge', sums.agent],
    ['Frais calculés Bictorys et opérateur (2 %)', sums.fees],
    ['Net calculé des versements mobiles après 2 %', sums.net],
    ['Subvention de base des repas remis', settlement.hospitalBase * 100],
    ['Contribution hospitalière supplémentaire (1 %)', settlement.hospitalContributionCents],
    ['Montant à verser par l’hôpital, net de frais', settlement.hospitalDueCents],
    ['Retenue restaurant (1 % de la valeur des repas remis)', settlement.restaurantContributionCents],
    ['Net dû au restaurant pour les repas remis', settlement.restaurantDueCents],
  ];
  const exportCsv = () => {
    const escape = (value: unknown) => {
      const raw = String(value);
      const safe = /^[=+@\-\t\r]/.test(raw) ? "'" + raw : raw;
      return `"${safe.replace(/"/g, '""')}"`;
    };
    const rows = [['Période', period], ['Libellé', 'Montant F CFA'], ...lines.map(([label, cents]) => [label, (cents / 100).toFixed(2).replace('.', ',')]),
      [], ['Reçu', 'Date', 'Mode', 'Agent', 'Brut F', 'Crédit F', 'Contribution agent F', 'Frais externes F', 'Net reçu F'],
      ...mobile.map(item => [item.id, item.createdAt, item.method, item.employeeName, item.grossAmount, item.amount, item.waveFeeAmount, (item.processorFeeCents! / 100).toFixed(2), (item.netReceivedCents! / 100).toFixed(2)]),
    ];
    const url = URL.createObjectURL(new Blob(['\uFEFF' + rows.map(row => row.map(escape).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'partage-frais-ndamatou.csv'; anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <section className="rounded-3xl border border-blue-200 bg-white p-5 space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h3 className="font-black text-blue-950">Partage des frais et reversements</h3><p className="text-xs text-slate-500">{period} · {settlement.count} commande(s) remise(s) · {mobile.length} recharge(s) mobile(s) au nouveau modèle</p></div>
      <button type="button" onClick={exportCsv} className="rounded-xl bg-blue-700 px-4 py-2 text-xs font-bold text-white">Exporter le détail CSV</button>
    </div>
    <p className="text-xs text-blue-900">510 F versés → 505 F crédités. Le repas débite son prix agent sans nouvelle commission. Le versement de l’hôpital est attendu net de frais ; aucun virement n’est exécuté depuis ce tableau.</p>
    <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{lines.map(([label, cents]) => <div key={label} className="rounded-xl bg-slate-50 p-3"><dt className="text-xs text-slate-600">{label}</dt><dd className="mt-1 text-lg font-black text-slate-950">{formatAccountingCents(cents)}</dd></div>)}</dl>
    <p className="text-xs font-bold text-amber-900">Réserve globale des badges visibles : {badgeReserve.toLocaleString('fr-FR')} F. Ces crédits restent dus aux agents ; ils ne sont pas une rémunération.</p>
    <p className="text-[11px] text-slate-500">Collecte mobile avant remboursements et régularisations, limitée aux opérations chargées pour cette période. Les anciens reçus et repas sans détail du nouveau modèle sont exclus. Les montants hôpital et restaurant sont des sommes à régler calculées sur les repas remis, hors livraison ; ils ne prouvent pas un versement reçu ou effectué. Les tarifs enregistrés à la commande sont conservés. Les décimales sont conservées pour le rapprochement ; les règlements XOF doivent être arrondis et régularisés à la clôture. Aucun bénéfice global n’est déduit de ces seuls totaux.</p>
  </section>;
}
