import { getFunctions, httpsCallable } from 'firebase/functions';
import type { CashTransaction, Order, UserProfile } from '../types';
import { app, auth, db, isConfigured } from './firebase';
import { createSparkBalance } from './sparkBalance';
import { createSparkPaidOrder } from './sparkOrders';
import { loadSparkReport } from './sparkReports';

export const secureBalanceFunctionsEnabled =
  isConfigured && import.meta.env.VITE_SECURE_BALANCE_FUNCTIONS === 'true';

export const sparkBalanceEnabled = isConfigured && !secureBalanceFunctionsEnabled;
const functions = app ? getFunctions(app, 'us-central1') : null;
const spark = () => {
  if (!db || !auth?.currentUser) throw new Error('Connexion Firebase requise.');
  return createSparkBalance(db, () => auth.currentUser);
};

export const secureAccountantTopup = async (employee: UserProfile, amount: number, note: string, method: CashTransaction['method'], requestId: string, grossAmount?: number) => {
  if (sparkBalanceEnabled) return spark().topup(employee.id, amount, note, method, requestId, grossAmount);
  if (!functions) throw new Error('Firebase Functions indisponible.');
  const callable = httpsCallable<{ employeeId: string; amount: number; note: string; method: CashTransaction['method']; requestId: string; grossAmount?: number }, CashTransaction>(functions, 'accountantTopup');
  const result = await callable({ employeeId: employee.id, amount, note, method, requestId, ...(grossAmount !== undefined ? { grossAmount } : {}) });
  return result.data;
};

export const secureCorrectTopup = async (transaction: CashTransaction, correctedAmount: number, reason: string) => {
  if (sparkBalanceEnabled) return spark().correct(transaction.id, correctedAmount, reason);
  if (!functions) throw new Error('Firebase Functions indisponible.');
  const callable = httpsCallable<{ transactionId: string; correctedAmount: number; reason: string }, CashTransaction>(functions, 'correctTopup');
  const result = await callable({ transactionId: transaction.id, correctedAmount, reason });
  return result.data;
};

export const secureApproveWaveTopup = async (requestId: string) => {
  if (sparkBalanceEnabled) return spark().approveWave(requestId);
  if (!functions) throw new Error('Firebase Functions indisponible.');
  const callable = httpsCallable<{ requestId: string }, CashTransaction>(functions, 'approveWaveTopup');
  const result = await callable({ requestId });
  return result.data;
};

export const secureRedeemPrepaidCard = async (cardId: string) => {
  if (sparkBalanceEnabled) return spark().redeem(cardId);
  if (!functions) throw new Error('Firebase Functions indisponible.');
  const callable = httpsCallable<{ cardId: string }, CashTransaction>(functions, 'redeemPrepaidCard');
  const result = await callable({ cardId });
  return result.data;
};

export const secureCreatePaidOrder = async (order: Order) => {
  if (sparkBalanceEnabled) {
    if (!db || !auth?.currentUser) throw new Error('Connexion requise.');
    return createSparkPaidOrder(db, auth.currentUser.uid, order);
  }
  if (!functions) throw new Error('Firebase Functions indisponible.');
  const callable = httpsCallable(functions, 'createPaidOrder');
  await callable({ order });
};

export const secureCancelPaidOrder = async (orderId: string, steps: Order['steps']) => {
  if (sparkBalanceEnabled) return spark().cancel(orderId, steps);
  if (!functions) throw new Error('Firebase Functions indisponible.');
  const callable = httpsCallable(functions, 'cancelPaidOrder');
  await callable({ orderId, steps });
};
export const secureAdjustBadgeBalance = async (employee: UserProfile, targetBalance: number, reason: string) => {
  if (sparkBalanceEnabled) return spark().adjust(employee.id, targetBalance, reason);
  if (!functions) throw new Error('Firebase Functions indisponible.');
  const callable = httpsCallable<{ employeeId: string; targetBalance: number; reason: string }, CashTransaction>(functions, 'adjustBadgeBalance');
  const result = await callable({ employeeId: employee.id, targetBalance, reason });
  return result.data;
};
export const secureLoadAccountingReportTransactions = async (startIso: string, endIso: string) => {
  if (sparkBalanceEnabled) {
    if (!db) throw new Error('Firestore indisponible.');
    return await loadSparkReport(db,'cashTransactions',startIso,endIso) as unknown as CashTransaction[];
  }
  if (!functions) throw new Error('Firebase Functions indisponible.');
  const callable = httpsCallable<{ startIso: string; endIso: string }, CashTransaction[]>(functions, 'getAccountingReportTransactions');
  const result = await callable({ startIso, endIso });
  return result.data;
};
export const secureLoadAccountingReportOrders = async (startIso: string, endIso: string) => {
  if (sparkBalanceEnabled) {
    if (!db) throw new Error('Firestore indisponible.');
    return await loadSparkReport(db,'orders',startIso,endIso) as unknown as Order[];
  }
  if (!functions) throw new Error('Firebase Functions indisponible.');
  const callable = httpsCallable<{ startIso: string; endIso: string }, Order[]>(functions, 'getAccountingReportOrders');
  const result = await callable({ startIso, endIso });
  return result.data;
};



