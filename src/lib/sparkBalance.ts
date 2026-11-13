import { doc, runTransaction, serverTimestamp, type Firestore } from 'firebase/firestore';
import type { CashTransaction, Order } from '../types';
import { quoteMobileTopup } from '@ndamatou/finance';

type Actor = { uid: string; email?: string | null };
type Kind = 'topup' | 'wave_topup' | 'prepaid' | 'adjustment' | 'correction' | 'refund';
type Options = { kind: Kind; id: string; employeeId?: string; amount?: number; target?: number; method?: CashTransaction['method']; grossAmount?: number; note?: string; reason?: string; sourceId?: string; steps?: Order['steps'] };

export const createSparkBalance = (db: Firestore, getActor: () => Actor | null) => {
  const execute = async (options: Options): Promise<CashTransaction> => {
    const actor = getActor();
    if (!actor) throw new Error('Connexion requise pour enregistrer une opération.');
    if (!/^[a-zA-Z0-9_-]{1,500}$/.test(options.id)) throw new Error('Identifiant de recharge invalide.');
    const operationRef = doc(db, 'walletOperations', options.id);
    return runTransaction(db, async transaction => {
      const previous = await transaction.get(operationRef);
      if (previous.exists()) {
        const saved = previous.data();
        if (saved.actorId !== actor.uid || saved.kind !== options.kind ||
            (options.employeeId && saved.employeeId !== options.employeeId) ||
            (options.amount !== undefined && saved.amount !== options.amount) ||
            (options.sourceId && saved.sourceId !== options.sourceId) ||
            (options.target !== undefined && saved.requestedTarget !== options.target) ||
            (options.method !== undefined && saved.method !== options.method) ||
            saved.grossAmount !== options.grossAmount) throw new Error('Identifiant déjà utilisé pour une autre opération.');
        return saved as CashTransaction;
      }
      const sourceCollection = options.kind === 'prepaid' ? 'prepaidCards' : options.kind === 'wave_topup' ? 'waveTopupRequests' : options.kind === 'refund' ? 'orders' : options.kind === 'correction' ? 'cashTransactions' : null;
      const sourceRef = sourceCollection && options.sourceId ? doc(db, sourceCollection, options.sourceId) : null;
      const sourceSnapshot = sourceRef ? await transaction.get(sourceRef) : null;
      const source = sourceSnapshot?.data();
      if (sourceRef && !sourceSnapshot?.exists()) throw new Error('Justificatif introuvable.');
      const employeeId = options.employeeId || source?.employeeId;
      if (!employeeId || employeeId.includes('/')) throw new Error('Badge introuvable.');
      const userRef = doc(db, 'users', employeeId);
      const [userSnapshot, actorSnapshot, settingsSnapshot] = await Promise.all([
        transaction.get(userRef), transaction.get(doc(db, 'users', actor.uid)), transaction.get(doc(db, 'settings', 'institution')),
      ]);
      if (!userSnapshot.exists()) throw new Error('Personnel introuvable.');
      const user = userSnapshot.data();
      const cashier = actorSnapshot.data() || {};
      const settings = settingsSnapshot.data() || {};
      const before = Number(user.walletBalance || 0);
      let amount = options.amount;
      let method = options.method || 'cash';
      if (options.kind === 'adjustment') {
        if (!Number.isSafeInteger(options.target) || (options.target ?? -1) < 0 || (options.reason || '').trim().length < 5) throw new Error('Solde cible ou motif invalide.');
        amount = options.target! - before;
      }
      if (options.kind === 'correction') {
        if (!Number.isSafeInteger(options.target) || options.target! < 0 || (options.reason || '').trim().length < 5 || source?.correctedAt) throw new Error('Correction invalide ou déjà effectuée.');
        amount = options.target! - Number(source!.amount);
        method = source!.method;
      }
      if (options.kind === 'prepaid') {
        if (source?.employeeId !== actor.uid || source.status !== 'active' || source.badgeNumber !== user.badgeNumber) throw new Error('Carte invalide, utilisée ou réservée à un autre badge.');
        amount = Number(source.amount);
      }
      if (options.kind === 'wave_topup') {
        if (source?.status !== 'pending') throw new Error('Demande Wave déjà traitée.');
        amount = Number(source.amount); method = 'wave';
      }
      if (options.kind === 'refund') {
        if (source?.paymentStatus !== 'paid' || !['pending', 'preparing', 'ready', 'out_for_delivery', 'delivering'].includes(source.status)) throw new Error('Commande déjà traitée ou non remboursable.');
        amount = Number(source.total);
      }
      if (!Number.isSafeInteger(amount) || amount === 0 || (!['adjustment', 'correction'].includes(options.kind) && amount! < 0) || !['cash', 'wave', 'orange_money'].includes(method)) throw new Error('Montant entier non nul et moyen de paiement valides requis.');
      let financialQuote;
      if (options.grossAmount !== undefined) {
        financialQuote = quoteMobileTopup(options.grossAmount);
        if (options.kind !== 'topup' || method === 'cash' || financialQuote.amount !== amount) throw new Error('Le montant versé ne correspond pas au crédit badge.');
      } else if (method === 'orange_money' && options.kind === 'topup') {
        throw new Error('Montant réellement versé requis pour Orange Money.');
      }
      const after = before + amount!;
      const max = Number(settings.maxBadgeBalance || 10000);
      if (!Number.isSafeInteger(before) || !Number.isSafeInteger(after) || after < 0 || after > max) throw new Error('Solde insuffisant ou plafond badge dépassé.');
      if (options.kind !== 'refund' && (user.badgeBlocked || ['pending', 'blocked'].includes(user.status))) throw new Error('Badge non actif.');
      const rate = Number(settings.waveCashierFeeRate || 0);
      const waveFeeRate = ['topup', 'wave_topup'].includes(options.kind) && method === 'wave' && rate > 0 && rate < 100 ? rate : 0;
      const createdAt = new Date().toISOString();
      const receipt = {
        id: operationRef.id, kind: options.kind, actorId: actor.uid, employeeId,
        employeeName: String(user.name || ''), badgeNumber: String(user.badgeNumber || ''), amount: amount!, method,
        waveFeeRate, waveFeeAmount: waveFeeRate ? Math.round(amount! * waveFeeRate / (100 - waveFeeRate)) : 0,
        ...(financialQuote || {}),
        cashierId: options.kind === 'prepaid' ? source!.cashierId : actor.uid,
        cashierName: options.kind === 'prepaid' ? source!.cashierName : String(cashier.name || actor.email || 'Personnel'),
        balanceBefore: before, balanceAfter: after, createdAt, recordedAt: serverTimestamp(),
        ...(options.target !== undefined ? { requestedTarget: options.target } : {}),
        note: options.note || (options.kind === 'refund' ? 'Remboursement sécurisé annulation - commande ' + options.sourceId : options.kind === 'prepaid' ? 'Carte prépayée ' + source!.code : options.reason || ''),
        ...(options.sourceId ? { sourceId: options.sourceId } : {}),
        ...(['adjustment', 'correction', 'refund'].includes(options.kind) ? { correctionOf: options.sourceId || 'wallet-' + employeeId, correctionReason: options.reason || 'Annulation autorisée' } : {}),
      };
      // Read stock before performing any writes. Firestore retries the entire operation on contention.
      const mealEntries = options.kind === 'refund' ? (source!.items as Order['items']) : [];
      const quantities = new Map<string, number>();
      mealEntries.forEach(item => quantities.set(item.meal.id, (quantities.get(item.meal.id) || 0) + item.quantity));
      const mealSnapshots = await Promise.all([...quantities.keys()].map(id => transaction.get(doc(db, 'meals', id))));
      transaction.update(userRef, { walletBalance: after, lastWalletOperationId: operationRef.id,
        ...(options.kind === 'refund' && Number.isSafeInteger(source!.orderCounterDay) && source!.orderCounterDay === user.orderCounterDay ? {
          regularPortionsToday: Number(user.regularPortionsToday || 0) - Number(source!.regularPortions || 0),
          hotPortionsToday: Number(user.hotPortionsToday || 0) - Number(source!.hotPortions || 0),
        } : {}),
      });
      transaction.set(operationRef, receipt);
      transaction.set(doc(db, 'cashTransactions', operationRef.id), receipt);
      if (sourceRef && options.kind === 'prepaid') transaction.update(sourceRef, {status:'used', usedAt:createdAt, usedBy:actor.uid});
      if (sourceRef && options.kind === 'wave_topup') transaction.update(sourceRef, {status:'approved', validatedAt:createdAt, validatedBy:actor.uid});
      if (sourceRef && options.kind === 'correction') transaction.update(sourceRef, {correctedAt:createdAt, correctedBy:actor.uid});
      if (sourceRef && options.kind === 'refund') {
        transaction.update(sourceRef, {status:'cancelled',paymentStatus:'refunded',steps:options.steps || source!.steps});
        mealSnapshots.forEach(meal => {if(meal.exists()) transaction.update(meal.ref,{stock:Number(meal.data().stock || 0)+(quantities.get(meal.id) || 0)});});
      }
      return receipt as CashTransaction;
    });
  };
  return {
    topup: (employeeId: string, amount: number, note: string, method: CashTransaction['method'], requestId: string, grossAmount?: number) => execute({kind:'topup',id:'topup-'+getActor()?.uid+'-'+requestId,employeeId,amount,note,method,grossAmount}),
    approveWave: (sourceId: string) => execute({kind:'wave_topup',id:'wave-'+sourceId,sourceId}),
    redeem: (sourceId: string) => execute({kind:'prepaid',id:'prepaid-'+sourceId,sourceId}),
    adjust: (employeeId: string, target: number, reason: string) => execute({kind:'adjustment',id:'adjust-'+crypto.randomUUID(),employeeId,target,reason}),
    correct: (sourceId: string, target: number, reason: string) => execute({kind:'correction',id:'correction-'+sourceId,sourceId,target,reason}),
    cancel: (sourceId: string, steps: Order['steps']) => execute({kind:'refund',id:'refund-'+sourceId,sourceId,steps}),
  };
};
