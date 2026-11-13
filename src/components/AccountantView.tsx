import React, { useEffect, useState } from 'react';
import { collection, getDocs, orderBy, query as firestoreQuery, where } from 'firebase/firestore';
import { Banknote, CheckCircle, Download, Printer, Search, WalletCards } from 'lucide-react';
import { CashTransaction, Meal, Order, UserProfile, WaveTopupRequest } from '../types';
import type { PrepaidCard } from '../types';
import { HrView } from './HrView';
import { SharedFinanceReport } from './SharedFinanceReport';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { sparkBalanceEnabled, secureLoadAccountingReportOrders, secureLoadAccountingReportTransactions } from '../lib/secureBalance';
import {
  AccountingPrices,
  calculateOrderLifecycleMetrics,
  calculateOrdersAccountingEntries,
  calculateOrdersAccounting as calculateSharedAccounting,
  DEFAULT_HOSPITAL_SUPPORT,
  DEFAULT_REAL_MEAL_PRICE,
  DEFAULT_STAFF_MEAL_PRICE,
  getLocalDateKey,
  getOperationalDateKey,
  getOrderAccounting,
  isPaidAccountingOrder,
} from '../lib/business';

const isTrueFlag = (value: unknown) =>
  value === true ||
  value === 1 ||
  (typeof value === 'string' && ['true', '1', 'oui', 'yes', 'blocked', 'bloque', 'bloqué'].includes(value.trim().toLowerCase()));

interface AccountantViewProps {
  activeProfile: UserProfile;
  profiles: UserProfile[];
  transactions: CashTransaction[];
  orders: Order[];
  meals: Meal[];
  waveTopupRequests: WaveTopupRequest[];
  prepaidCards: PrepaidCard[];
  onTopupBadge: (employee: UserProfile, amount: number, note: string, method: 'cash' | 'wave') => Promise<CashTransaction>;
  onCreatePrepaidCard: (employee: UserProfile, amount: number) => Promise<PrepaidCard | null> | PrepaidCard | null;
  onCorrectTopup: (transaction: CashTransaction, correctedAmount: number, reason: string) => Promise<void> | void;
  onAdjustBadgeBalance?: (employee: UserProfile, targetBalance: number, reason: string) => Promise<void> | void;
  onClaimLegacyTransactions: () => Promise<number>;
  onApproveWaveTopup: (requestId: string) => void;
  onFlagProfileForHr: (profile: UserProfile) => Promise<void> | void;
  onClearCashHistory: (code: string) => Promise<void> | void;
  institutionConfig: {
    logoUrl: string;
    directorName: string;
    safName: string;
    restaurantManagerName?: string;
    acpName?: string;
    managementControllerName?: string;
    revenueReportSignatureOrder?: string[];
    realMealPrice: number;
    hospitalSupportAmount: number;
    staffMealPrice: number;
    legacyAccountingPrices?: AccountingPrices['legacy'];
    waveCashierFeeRate: number;
    maxBadgeBalance: number;
    historyClearCode: string;
    deliveryFeeEnabled: boolean;
    topupUndoSeconds: number;
    services: string[];
    employmentTypes: string[];
  };
}

const REPORT_OPERATIONAL_START = '19:00';
const REPORT_OPERATIONAL_END_LABEL = '18h59';

const getReportClosingDateKey = (value: Date | string = new Date()) => {
  const startKey = getOperationalDateKey(value, REPORT_OPERATIONAL_START);
  const closingDate = new Date(`${startKey}T00:00:00`);
  closingDate.setDate(closingDate.getDate() + 1);
  return getLocalDateKey(closingDate);
};

export const AccountantView: React.FC<AccountantViewProps> = ({
  activeProfile,
  profiles,
  transactions,
  orders,
  meals,
  waveTopupRequests,
  prepaidCards,
  onTopupBadge,
  onCreatePrepaidCard,
  onCorrectTopup,
  onAdjustBadgeBalance,
  onClaimLegacyTransactions,
  onApproveWaveTopup,
  onFlagProfileForHr,
  onClearCashHistory,
  institutionConfig,
}) => {
  const [query, setQuery] = useState('');
  const [serviceFilter, setServiceFilter] = useState('Tous les services');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [amount, setAmount] = useState('5000');
  const [note, setNote] = useState('');
  const [topupMethod, setTopupMethod] = useState<'cash' | 'wave'>('cash');
  const [generatedCode, setGeneratedCode] = useState('');
  const [locallyApprovedWaveIds, setLocallyApprovedWaveIds] = useState<string[]>([]);
  const [generatedCodeOwner, setGeneratedCodeOwner] = useState<UserProfile | null>(null);
  const [isGeneratingCode, setIsGeneratingCode] = useState(false);
  const [codeGenerationMessage, setCodeGenerationMessage] = useState('');
  const [reportStartDate, setReportStartDate] = useState(() => getReportClosingDateKey());
  const [reportEndDate, setReportEndDate] = useState(() => getReportClosingDateKey());
  const [showAccountingBlocks, setShowAccountingBlocks] = useState(false);
  const [showPeriodOrders, setShowPeriodOrders] = useState(false);
  const [showHrControl, setShowHrControl] = useState(false);
  const [recentTopup, setRecentTopup] = useState<CashTransaction | null>(null);
  const [undoSecondsLeft, setUndoSecondsLeft] = useState(0);
  const [topupActionMessage, setTopupActionMessage] = useState('');
  const [isClaimingLegacyTransactions, setIsClaimingLegacyTransactions] = useState(false);
  const topupMovedToRestaurant = true;
  const topupMovedMessage = 'La recharge badge est maintenant gérée par le compte Restaurant. Le compte comptable conserve les rapports, exports et contrôles.';
  const undoWindowSeconds = Math.max(10, Math.min(600, institutionConfig.topupUndoSeconds ?? 60));
  const activeAccountantName = String(activeProfile.name || '').trim();
  const accountantNameIsGeneric = !activeAccountantName || /^comptable(:\s+(Ndamatou|restaurant))$/i.test(activeAccountantName);
  const legacyGenericTransactions = transactions.filter(transaction =>
    transaction.cashierId === 'cashier1' ||
    !transaction.cashierName.trim() ||
    /^comptable(:\s+(Ndamatou|restaurant))$/i.test(transaction.cashierName.trim())
  );
  const signatureOptions = [
    { id: 'restaurantManager', title: 'Responsable du restaurant', name: institutionConfig.restaurantManagerName || 'Nom à renseigner' },
    { id: 'saf', title: 'Chef du service administratif et financier', name: institutionConfig.safName || 'Nom à renseigner' },
    { id: 'managementController', title: 'Contrôleur de gestion', name: institutionConfig.managementControllerName || 'Nom à renseigner' },
    { id: 'director', title: 'Directeur', name: institutionConfig.directorName || 'Nom à renseigner' },
  ];
  const defaultSignatureOrder = signatureOptions.map(option => option.id);
  const getReportSignatureOrder = () => {
    const incomingOrder = Array.isArray(institutionConfig.revenueReportSignatureOrder)
      ? institutionConfig.revenueReportSignatureOrder.map(String)
      : [];
    const validIds = new Set(defaultSignatureOrder);
    const normalized = incomingOrder.filter((id, index, list) => validIds.has(id) && list.indexOf(id) === index);
    return [...normalized, ...defaultSignatureOrder.filter(id => !normalized.includes(id))];
  };

  useEffect(() => {
    if (!recentTopup) return;
    const updateRemaining = () => {
      const remaining = Math.max(0, undoWindowSeconds - Math.floor((Date.now() - new Date(recentTopup.createdAt).getTime()) / 1000));
      setUndoSecondsLeft(remaining);
      if (remaining === 0) setRecentTopup(null);
    };
    updateRemaining();
    const timer = window.setInterval(updateRemaining, 1000);
    return () => window.clearInterval(timer);
  }, [recentTopup, undoWindowSeconds]);

  const employeeProfiles = profiles.filter(profile => profile.role === 'employee');
  const services = Array.from(new Set(employeeProfiles.map(profile => profile.department).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'fr'));
  const getTransactionService = (transaction: CashTransaction) =>
    employeeProfiles.find(profile => profile.id === transaction.employeeId)?.department || 'Non renseigné';
  const getTransactionCashierName = (transaction: CashTransaction) => {
    const cashierProfile = profiles.find(profile => profile.id === transaction.cashierId);
    const resolvedName = String(cashierProfile?.name || transaction.cashierName || '').trim();
    if (resolvedName && !/^comptable(:\s+Ndamatou)$/i.test(resolvedName)) return resolvedName;
    if (activeProfile.role === 'accountant' && !accountantNameIsGeneric) return activeAccountantName;
    const namedAccountants = profiles.filter(profile =>
      profile.role === 'accountant' &&
      profile.name.trim() &&
      !/^comptable(:\s+Ndamatou)$/i.test(profile.name.trim())
    );
    return namedAccountants.length === 1 ? namedAccountants[0].name.trim() : 'Nom du comptable non renseigné';
  };
  const selectedEmployee = employeeProfiles.find(profile => profile.id === selectedEmployeeId);
  const normalizedQuery = query.trim().toLowerCase();
  const filteredEmployees = employeeProfiles.filter(profile =>
    (serviceFilter === 'Tous les services' || profile.department === serviceFilter) &&
    `${profile.name} ${profile.badgeNumber} ${profile.phone} ${profile.department}`.toLowerCase().includes(normalizedQuery)
  );
  const pendingWaveRequests = waveTopupRequests.filter(request =>
    request.status === 'pending' &&
    !locallyApprovedWaveIds.includes(request.id)
  );

  const todayKey = getReportClosingDateKey(new Date());
  const getOperationalRange = (startKey: string, endKey = startKey) => {
    const start = new Date(`${startKey}T${REPORT_OPERATIONAL_START}:00`);
    start.setDate(start.getDate() - 1);
    const end = new Date(`${endKey}T${REPORT_OPERATIONAL_START}:00`);
    end.setMilliseconds(end.getMilliseconds() - 1);
    return { start, end };
  };
  const isWithinDateRange = (value: string, start: Date, end: Date) => {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) && date >= start && date <= end;
  };
  const todayRange = getOperationalRange(todayKey);
  const todayTransactions = transactions.filter(transaction => isWithinDateRange(transaction.createdAt, todayRange.start, todayRange.end));
  const todayTotal = todayTransactions.reduce((sum, transaction) => sum + transaction.amount, 0);
  const todayWaveFees = todayTransactions.reduce((sum, transaction) => sum + Math.max(0, transaction.waveFeeAmount || 0), 0);
  const totalBadgeBalance = employeeProfiles.reduce((sum, profile) => sum + Math.max(0, profile.walletBalance || 0), 0);
  const todayPaidOrders = orders.filter(order =>
    isWithinDateRange(order.createdAt, todayRange.start, todayRange.end) &&
    order.paymentStatus === 'paid'
  );
  const todayLifecycleOrders = orders.filter(order =>
    isWithinDateRange(order.createdAt, todayRange.start, todayRange.end) &&
    order.orderType !== 'special_dinner'
  );
  const lifecycleMetrics = calculateOrderLifecycleMetrics(todayLifecycleOrders);
  const regularOrders = todayPaidOrders.filter(order => order.orderType !== 'special_dinner');
  const deliveredOrdersToday = regularOrders.filter(order => order.status === 'delivered');
  const ordersToDeliverToday = regularOrders.filter(order =>
    order.fulfillmentMode === 'delivery' && !['delivered', 'returned', 'cancelled', 'expired'].includes(order.status)
  );
  const remainingHotMeals = meals
    .filter(meal => meal.category === 'plat' && meal.isAvailableToday && !meal.isNextDay && (meal.mealType || 'regular') === 'regular')
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  const accountingPrices: AccountingPrices = {
    real: institutionConfig.realMealPrice ?? DEFAULT_REAL_MEAL_PRICE,
    hospital: institutionConfig.hospitalSupportAmount ?? DEFAULT_HOSPITAL_SUPPORT,
    staff: institutionConfig.staffMealPrice ?? DEFAULT_STAFF_MEAL_PRICE,
    legacy: institutionConfig.legacyAccountingPrices,
  };
  const calculateOrdersAccounting = (sourceOrders: Order[]) => calculateSharedAccounting(sourceOrders, accountingPrices, REPORT_OPERATIONAL_START);
  const lifetimeRegularOrders = orders.filter(order =>
    order.orderType !== 'special_dinner' &&
    order.paymentStatus === 'paid'
  );
  const lifetimeTopups = transactions.reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0);
  const badgeLiquidity = lifetimeTopups - calculateOrdersAccounting(lifetimeRegularOrders).staffPaid;
  const regularAccounting = calculateOrdersAccounting(regularOrders);
  const todayMealSales = regularAccounting.staffPaid;
  const todayRealOrderAmount = regularAccounting.staffPaid + regularAccounting.hospitalSupport;
  const todayEmployeeDeliveryFees = regularOrders.reduce((sum, order) =>
    sum + (order.deliveryFeePayer === 'employee' ? Math.max(0, order.deliveryFeeAmount || 0) : 0), 0);
  const todayHospitalDeliveryFees = regularOrders.reduce((sum, order) =>
    sum + (order.deliveryFeePayer === 'hospital' ? Math.max(0, order.deliveryFeeAmount || 0) : 0), 0);

  const previewRange = getOperationalRange(reportStartDate || todayKey, reportEndDate || reportStartDate || todayKey);
  const previewOrders = orders
    .filter(order =>
      order.orderType !== 'special_dinner' &&
      order.paymentStatus === 'paid' &&
      isWithinDateRange(order.createdAt, previewRange.start, previewRange.end)
    )
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  const previewAccountingEntries = calculateOrdersAccountingEntries(previewOrders, accountingPrices, REPORT_OPERATIONAL_START);
  const previewAccounting = previewAccountingEntries.reduce((totals, entry) => ({
    staffPaid: totals.staffPaid + entry.accounting.staffPaid,
    hospitalSupport: totals.hospitalSupport + entry.accounting.hospitalSupport,
    quantity: totals.quantity + entry.accounting.quantity,
    subsidizedQuantity: totals.subsidizedQuantity + entry.accounting.subsidizedQuantity,
    fullPriceQuantity: totals.fullPriceQuantity + entry.accounting.fullPriceQuantity,
  }), { staffPaid: 0, hospitalSupport: 0, quantity: 0, subsidizedQuantity: 0, fullPriceQuantity: 0 });

  const getCorrectionDetails = (transaction: CashTransaction) => {
    if (!transaction.correctionOf) return null;
    const original = transactions.find(item => item.id === transaction.correctionOf);
    if (!original) return null;
    return {
      initialAmount: original.amount,
      correctedAmount: original.amount + transaction.amount,
    };
  };

  const findEmployeeFromQuery = () => {
    const raw = query.trim();
    if (!raw) return null;
    const compact = raw.replace(/\s+/g, '').toLowerCase();
    const compactPhone = compact.replace(/[^\d+]/g, '');
    return employeeProfiles.find(profile => {
      const badge = profile.badgeNumber.replace(/\s+/g, '').toLowerCase();
      const phone = profile.phone.replace(/\s+/g, '').replace(/[^\d+]/g, '');
      return badge === compact || phone.endsWith(compactPhone) || compactPhone.endsWith(phone);
    }) || filteredEmployees[0] || null;
  };

  const resolveSearch = () => {
    const match = findEmployeeFromQuery();
    if (!match) {
      window.alert('Aucun personnel trouve avec ce badge ou ce numero.');
      return;
    }
    setSelectedEmployeeId(match.id);
    setGeneratedCode('');
    setGeneratedCodeOwner(null);
  };

  const getWaveFeeFromNetAmount = (netAmount: number) => {
    const rate = Math.max(0, institutionConfig.waveCashierFeeRate ?? 1);
    return rate > 0 && rate < 100 ? Math.round(netAmount * rate / (100 - rate)) : 0;
  };

  const handleTopup = async (noteOverride: string) => {
    if (topupMovedToRestaurant) {
      setTopupActionMessage(topupMovedMessage);
      return;
    }
    const parsedAmount = Number(amount);
    if (!selectedEmployee || !Number.isFinite(parsedAmount) || parsedAmount <= 0) return;
    if (accountantNameIsGeneric) {
      window.alert("Renseignez d'abord votre vrai nom dans l'icône Profil. Ce nom apparaîtra sur toutes les recharges et les rapports comptables.");
      return;
    }
    if (isTrueFlag(selectedEmployee.badgeBlocked) || selectedEmployee.status === 'blocked' || selectedEmployee.status === 'pending') {
      window.alert("Badge non actif. L'administration doit d'abord valider ou debloquer ce badge.");
      return;
    }
    const ok = window.confirm(`Confirmer la recharge de ${parsedAmount.toLocaleString('fr-FR')} FCFA pour ${selectedEmployee.name} `);
    if (!ok) return;
    try {
      const transaction = await onTopupBadge(selectedEmployee, parsedAmount, noteOverride || note.trim(), topupMethod);
      setRecentTopup(transaction);
      setUndoSecondsLeft(undoWindowSeconds);
      setTopupActionMessage(`Recharge enregistrée. Annulation possible pendant ${undoWindowSeconds} secondes.`);
      setNote('');
    } catch (error) {
      setTopupActionMessage(error instanceof Error ? error.message : "Recharge refusée. Aucun solde n'a été modifié.");
    }
  };

  const undoRecentTopup = async () => {
    if (!recentTopup || undoSecondsLeft <= 0) return;
    const ok = window.confirm(`Annuler la recharge de ${recentTopup.amount.toLocaleString('fr-FR')} FCFA pour ${recentTopup.employeeName} ? Cette action restera tracée.`);
    if (!ok) return;
    await onCorrectTopup(recentTopup, 0, `Annulation dans la fenêtre de contrôle de ${undoWindowSeconds} secondes`);
    setRecentTopup(null);
    setTopupActionMessage('Recharge annulée et badge corrigé avec succès.');
  };

  const adjustSelectedBadgeBalance = async () => {
    if (!selectedEmployee || !onAdjustBadgeBalance) return;
    const currentBalance = Math.max(0, Number(selectedEmployee.walletBalance || 0));
    const target = window.prompt(
      `Solde actuel de ${selectedEmployee.name}: ${currentBalance.toLocaleString('fr-FR')} FCFA\nSaisissez le nouveau solde exact à conserver:`,
      String(currentBalance)
    );
    if (target === null) return;
    const targetBalance = Number(target.replace(/\s+/g, ''));
    if (!Number.isFinite(targetBalance) || targetBalance < 0) {
      setTopupActionMessage('Solde invalide.');
      return;
    }
    const reason = window.prompt('Motif obligatoire de la correction du solde badge:');
    if (!reason?.trim()) {
      setTopupActionMessage('Correction annulée: motif obligatoire.');
      return;
    }
    const ok = window.confirm(
      `Confirmer la correction du solde badge ?\n\nAgent: ${selectedEmployee.name}\nAncien solde: ${currentBalance.toLocaleString('fr-FR')} FCFA\nNouveau solde: ${targetBalance.toLocaleString('fr-FR')} FCFA\nMotif: ${reason.trim()}`
    );
    if (!ok) return;
    try {
      await onAdjustBadgeBalance(selectedEmployee, targetBalance, reason.trim());
      setTopupActionMessage(`Solde corrigé pour ${selectedEmployee.name}: ${targetBalance.toLocaleString('fr-FR')} FCFA.`);
    } catch (error) {
      setTopupActionMessage(error instanceof Error ? error.message : 'Correction du solde refusée.');
    }
  };

  const generatePrepaidCode = async () => {
    if (topupMovedToRestaurant) {
      setCodeGenerationMessage(topupMovedMessage);
      return;
    }
    const parsedAmount = Number(amount);
    const employeeForCode = selectedEmployee || findEmployeeFromQuery();
    if (!employeeForCode) {
      window.alert("Selectionnez le personnel, ou tapez son badge/telephone puis cliquez OK.");
      return;
    }
    if (!selectedEmployeeId) setSelectedEmployeeId(employeeForCode.id);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      window.alert('Saisissez un montant valide avant de generer le code.');
      return;
    }
    setIsGeneratingCode(true);
    setCodeGenerationMessage('');
    try {
      const card = await onCreatePrepaidCard(employeeForCode, parsedAmount);
      if (!card) throw new Error('Aucun code créé');
      setSelectedEmployeeId(employeeForCode.id);
      setGeneratedCodeOwner(employeeForCode);
      setGeneratedCode(card.code);
      setCodeGenerationMessage(`Code ${card.code} généré et enregistré avec succès.`);
    } catch (error) {
      setGeneratedCode('');
      setCodeGenerationMessage(error instanceof Error ? `Échec: ${error.message}` : "Échec de création du code.");
    } finally {
      setIsGeneratingCode(false);
    }
  };

  const handleCorrection = (transaction: CashTransaction) => {
    if (transaction.correctionOf) {
      window.alert('Cette ligne est deja une correction.');
      return;
    }
    const corrected = window.prompt(
      `Montant initial: ${transaction.amount.toLocaleString('fr-FR')} FCFA\nSaisissez le montant correct a conserver:`,
      String(transaction.amount)
    );
    if (corrected === null) return;
    const correctedAmount = Number(corrected.replace(/\s+/g, ''));
    if (!Number.isFinite(correctedAmount) || correctedAmount < 0) {
      window.alert('Montant invalide.');
      return;
    }
    const reason = window.prompt('Motif obligatoire de la correction comptable:');
    if (!reason.trim()) {
      window.alert('Correction annulee: le motif est obligatoire.');
      return;
    }
    const ok = window.confirm(
      `Confirmer la correction pour ${transaction.employeeName} \n\nMontant initial: ${transaction.amount.toLocaleString('fr-FR')} FCFA\nMontant corrigé: ${correctedAmount.toLocaleString('fr-FR')} FCFA\nMotif: ${reason.trim()}`
    );
    if (ok) onCorrectTopup(transaction, correctedAmount, reason.trim());
  };

  const printReport = async (period: 'journalier' | 'hebdomadaire' | 'personnalisee') => {
    const now = new Date();
    const weekStartKeyDate = new Date(`${todayKey}T00:00:00`);
    weekStartKeyDate.setDate(weekStartKeyDate.getDate() - 6);
    const weekStartKey = getLocalDateKey(weekStartKeyDate);
    const { start, end } = period === 'journalier'
      ? getOperationalRange(todayKey)
      : period === 'hebdomadaire'
        ? getOperationalRange(weekStartKey, todayKey)
        : getOperationalRange(reportStartDate, reportEndDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
      window.alert('Sélectionnez une période valide: la date de début doit précéder la date de fin.');
      return;
    }
    let transactionsForReport = transactions;
    let ordersForReport = orders;
    const getReportDayKeys = () => {
      const first = new Date(start);
      first.setHours(first.getHours() + 1);
      const cursor = new Date(`${getReportClosingDateKey(first)}T00:00:00`);
      const last = new Date(`${getReportClosingDateKey(end)}T00:00:00`);
      const keys: string[] = [];
      while (cursor <= last) {
        keys.push(getLocalDateKey(cursor));
        cursor.setDate(cursor.getDate() + 1);
      }
      return keys;
    };
    const loadCollectionForReport = async <T extends { id?: string }>(collectionName: 'cashTransactions' | 'orders') => {
      if (sparkBalanceEnabled) return (collectionName === 'orders'
        ? await secureLoadAccountingReportOrders(start.toISOString(),end.toISOString())
        : await secureLoadAccountingReportTransactions(start.toISOString(),end.toISOString())) as unknown as T[];
      const mapDoc = (item: { id: string; data: () => unknown }) => {
        const data = item.data() as T;
        return { ...data, id: data.id || item.id } as T;
      };
      try {
        const snapshot = await getDocs(firestoreQuery(
          collection(db, collectionName),
          where('createdAt', '>=', start.toISOString()),
          where('createdAt', '<=', end.toISOString()),
          orderBy('createdAt', 'asc')
        ));
        return snapshot.docs.map(mapDoc);
      } catch (globalError) {
        console.warn(`Chargement global ${collectionName} refusé, tentative par journée restaurant.`, globalError);
        const docs = new Map<string, T>();
        const failedDays: string[] = [];
        for (const dayKey of getReportDayKeys()) {
          const dayRange = getOperationalRange(dayKey);
          try {
            const snapshot = await getDocs(firestoreQuery(
              collection(db, collectionName),
              where('createdAt', '>=', dayRange.start.toISOString()),
              where('createdAt', '<=', dayRange.end.toISOString()),
              orderBy('createdAt', 'asc')
            ));
            snapshot.docs.forEach((item) => docs.set(item.id, mapDoc(item)));
          } catch (dayError) {
            console.warn(`Jour ${dayKey} non chargé pour ${collectionName}`, dayError);
            failedDays.push(dayKey);
          }
        }
        if (docs.size === 0 && failedDays.length > 0) throw globalError;
        if (failedDays.length > 0) {
          throw new Error(`${collectionName}: ${failedDays.length} journée(s) non chargée(s). Rapport incomplet interdit pour paiement.`);
        }
        return Array.from(docs.values());
      }
    };
    if (db) {
      try {
        transactionsForReport = await loadCollectionForReport<CashTransaction>('cashTransactions');
      } catch (error) {
        handleFirestoreError(error, OperationType.LIST, 'accounting/cashTransactions-report-range');
        try {
          transactionsForReport = await secureLoadAccountingReportTransactions(start.toISOString(), end.toISOString());
        } catch (serverError) {
          console.error('Chargement complémentaire des recharges impossible', serverError);
          window.alert("Rapport non imprimé : les recharges de badges n'ont pas pu être chargées entièrement. Vérifiez la connexion et les autorisations du compte, puis réessayez.");
          return;
        }
      }
      try {
        ordersForReport = await loadCollectionForReport<Order>('orders');
      } catch (error) {
        handleFirestoreError(error, OperationType.LIST, 'accounting/orders-report-range');
        try {
          ordersForReport = await secureLoadAccountingReportOrders(start.toISOString(), end.toISOString());
        } catch (serverError) {
          console.error('Chargement complémentaire des commandes impossible', serverError);
          window.alert("Rapport non imprimé : les commandes n'ont pas pu être chargées entièrement. Vérifiez la connexion et les autorisations du compte, puis réessayez.");
          return;
        }
      }
    }
    const sourceTransactions = transactionsForReport.filter(transaction => {
      return isWithinDateRange(transaction.createdAt, start, end);
    });
    const sourceRegularOrders = ordersForReport.filter(order => {
      return order.orderType !== 'special_dinner' &&
        order.paymentStatus === 'paid' &&
        isWithinDateRange(order.createdAt, start, end);
    });
    const accountingEntries = calculateOrdersAccountingEntries(sourceRegularOrders, accountingPrices, REPORT_OPERATIONAL_START);
    const periodAccounting = accountingEntries.reduce((totals, entry) => ({
      staffPaid: totals.staffPaid + entry.accounting.staffPaid,
      hospitalSupport: totals.hospitalSupport + entry.accounting.hospitalSupport,
      quantity: totals.quantity + entry.accounting.quantity,
      subsidizedQuantity: totals.subsidizedQuantity + entry.accounting.subsidizedQuantity,
      fullPriceQuantity: totals.fullPriceQuantity + entry.accounting.fullPriceQuantity,
    }), { staffPaid: 0, hospitalSupport: 0, quantity: 0, subsidizedQuantity: 0, fullPriceQuantity: 0 });
    const getEmploymentReportGroup = (order: Order) => {
      const profile = profiles.find(item => item.id === order.employeeId || item.badgeNumber === order.badgeNumber || item.email === order.employeeEmail);
      const rawType = String(profile?.employmentType || (order as Order & { employmentType?: string }).employmentType || '').trim().toLowerCase();
      if (rawType.includes('stagiaire') || rawType.includes('prestataire')) return 'Prestataire';
      return 'Titulaire';
    };
    const groupedAccountingEntries = accountingEntries.reduce((acc, entry) => {
      const group = getEmploymentReportGroup(entry.order);
      if (!acc[group]) acc[group] = [];
      acc[group].push(entry);
      return acc;
    }, {} as Record<string, typeof accountingEntries>);
    const transactionRows = sourceTransactions.map(transaction => `
      <tr>
        <td>${new Date(transaction.createdAt).toLocaleString('fr-FR')}</td>
        <td>${transaction.employeeName}</td>
        <td>${getTransactionService(transaction)}</td>
        <td>${transaction.badgeNumber}</td>
        <td>${transaction.amount.toLocaleString('fr-FR')} FCFA</td>
        <td>${transaction.method === 'wave' ? 'Wave' : transaction.method === 'orange_money' ? 'Orange Money' : 'Espèces'}</td>
        <td>${getTransactionCashierName(transaction)}</td>
      </tr>
    `).join('');
    const buildOrderRows = (entries: typeof accountingEntries) => entries.map(entry => {
      const order = entry.order;
      const accounting = entry.accounting;
      const profile = profiles.find(item => item.id === order.employeeId || item.badgeNumber === order.badgeNumber || item.email === order.employeeEmail);
      const dishNames = order.items.map(item => `${item.quantity} x ${(item.meal?.name || 'Repas')}`).join(', ');
      const rowTotal = accounting.staffPaid + accounting.hospitalSupport;
      return `<tr><td>${new Date(order.createdAt).toLocaleString('fr-FR')}</td><td>${order.employeeName}</td><td>${profile?.department || order.department || 'Service non renseigné'}</td><td>${profile?.phone || order.employeePhone || ''}</td><td>${dishNames}</td><td>${accounting.quantity}</td><td>${accounting.subsidizedQuantity}</td><td>${accounting.fullPriceQuantity}</td><td>${accounting.staffPaid.toLocaleString('fr-FR')} FCFA</td><td>${accounting.hospitalSupport.toLocaleString('fr-FR')} FCFA</td><td>${rowTotal.toLocaleString('fr-FR')} FCFA</td></tr>`;
    }).join('');
    const buildGroupSection = (group: 'Titulaire' | 'Prestataire') => {
      const entries = groupedAccountingEntries[group] || [];
      const groupTotals = entries.reduce((totals, entry) => ({
        staffPaid: totals.staffPaid + entry.accounting.staffPaid,
        hospitalSupport: totals.hospitalSupport + entry.accounting.hospitalSupport,
        quantity: totals.quantity + entry.accounting.quantity,
        subsidizedQuantity: totals.subsidizedQuantity + entry.accounting.subsidizedQuantity,
        fullPriceQuantity: totals.fullPriceQuantity + entry.accounting.fullPriceQuantity,
      }), { staffPaid: 0, hospitalSupport: 0, quantity: 0, subsidizedQuantity: 0, fullPriceQuantity: 0 });
      const body = buildOrderRows(entries) || `<tr><td colspan="11">Aucune commande ${group.toLowerCase()} sur cette période.</td></tr>`;
      const totalRow = entries.length ? `<tr style="font-weight:900;background:#f8fafc"><td colspan="5">TOTAL ${group}</td><td>${groupTotals.quantity}</td><td>${groupTotals.subsidizedQuantity}</td><td>${groupTotals.fullPriceQuantity}</td><td>${groupTotals.staffPaid.toLocaleString('fr-FR')} FCFA</td><td>${groupTotals.hospitalSupport.toLocaleString('fr-FR')} FCFA</td><td>${(groupTotals.staffPaid + groupTotals.hospitalSupport).toLocaleString('fr-FR')} FCFA</td></tr>` : '';
      return `<h2>${group}</h2><table><thead><tr><th>Date</th><th>Personnel</th><th>Service</th><th>Téléphone</th><th>Repas</th><th>Portions</th><th>Subventionnées</th><th>Prix réel</th><th>Part restaurateur</th><th>Part hôpital</th><th>Montant réel</th></tr></thead><tbody>${body}${totalRow}</tbody></table>`;
    };
    const salesBody = `${buildGroupSection('Titulaire')}${buildGroupSection('Prestataire')}`;
    const total = sourceTransactions.reduce((sum, transaction) => sum + transaction.amount, 0);
    const totalPortions = sourceRegularOrders.reduce((sum, order) =>
      sum + order.items.reduce((itemSum, item) => itemSum + Number(item.quantity || 0), 0), 0);
    const fullPricePortionsValue = periodAccounting.fullPriceQuantity * accountingPrices.real;
    const signatureBlocks = getReportSignatureOrder().map((signerId) => {
      const signer = signatureOptions.find(option => option.id === signerId) || signatureOptions[0];
      return `<div class="signature"><strong>${signer.title}</strong><span>${signer.name}</span><div class="line">Signature et cachet</div></div>`;
    }).join('');
    const printWindow = window.open('', '_blank', 'width=980,height=760');
    if (!printWindow) return;
    printWindow.document.write(`
      <html>
        <head>
          <title>Rapport comptable ${period}</title>
          <style>
            body { font-family: Arial, sans-serif; color: #0f172a; padding: 28px; }
            header { display: flex; gap: 14px; align-items: center; border-bottom: 2px solid #0f172a; padding-bottom: 14px; margin-bottom: 18px; }
            .logo { width: 62px; height: 62px; object-fit: contain; border: 1px solid #cbd5e1; border-radius: 12px; }
            h1 { margin: 0; font-size: 20px; text-transform: uppercase; }
            h2 { margin: 22px 0 8px; font-size: 15px; }
            .meta { color: #64748b; font-size: 12px; margin-top: 5px; }
            .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 18px 0; }
            .card { border: 1px solid #cbd5e1; border-radius: 12px; padding: 12px; }
            .label { font-size: 10px; color: #64748b; text-transform: uppercase; font-weight: 800; }
            .value { font-size: 18px; font-weight: 900; margin-top: 6px; }
            .hint { color: #64748b; font-size: 9px; line-height: 1.35; margin-top: 7px; }
            table { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 10px; }
            th, td { border: 1px solid #cbd5e1; padding: 8px; text-align: left; vertical-align: top; }
            th { background: #f8fafc; text-transform: uppercase; font-size: 9px; }
            .signatures { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 34px; page-break-inside: avoid; }
            .signature { border: 1px solid #cbd5e1; border-radius: 12px; min-height: 120px; padding: 12px; display: flex; flex-direction: column; justify-content: space-between; }
            .signature span { display: block; margin-top: 5px; color: #475569; font-size: 11px; font-weight: 700; }
            .line { border-top: 1px solid #94a3b8; padding-top: 6px; text-align: center; font-size: 10px; font-weight: 800; color: #475569; }
          </style>
        </head>
        <body>
          <header>
            ${institutionConfig.logoUrl ? `<img class="logo" src="${institutionConfig.logoUrl}" />` : ''}
            <div>
              <h1>Rapport comptable - Ndamatou</h1>
              <div class="meta">Période opérationnelle: du ${start.toLocaleString('fr-FR')} au ${end.toLocaleString('fr-FR')} | Journée restaurant: ${REPORT_OPERATIONAL_START} à ${REPORT_OPERATIONAL_END_LABEL} | Généré le ${new Date().toLocaleString('fr-FR')}</div>
            </div>
          </header>
          <section class="summary">
            <div class="card"><div class="label">Part supportée par l'agent</div><div class="value">${periodAccounting.staffPaid.toLocaleString('fr-FR')} FCFA</div><div class="hint">Somme réellement payée par les agents sur les commandes normales de la période.</div></div>
            <div class="card"><div class="label">Part hôpital</div><div class="value">${periodAccounting.hospitalSupport.toLocaleString('fr-FR')} FCFA</div><div class="hint">Subvention prise en charge par l'hôpital sur les portions subventionnées.</div></div>
            <div class="card"><div class="label">Total des ventes</div><div class="value">${(periodAccounting.staffPaid + periodAccounting.hospitalSupport).toLocaleString('fr-FR')} FCFA</div><div class="hint">Part agent + part hôpital, soit la valeur réelle des plats servis.</div></div>
            <div class="card"><div class="label">Portions subventionnées</div><div class="value">${periodAccounting.subsidizedQuantity}</div><div class="hint">Nombre de portions bénéficiant de la subvention hôpital.</div></div>
            <div class="card"><div class="label">Portions au prix réel</div><div class="value">${periodAccounting.fullPriceQuantity} / ${fullPricePortionsValue.toLocaleString('fr-FR')} FCFA</div><div class="hint">Nombre de portions sans subvention et leur valeur au prix réel.</div></div>
            <div class="card"><div class="label">Commandes / portions</div><div class="value">${sourceRegularOrders.length} / ${totalPortions}</div><div class="hint">Commandes payées / total des portions servies dans la période.</div></div>
          </section>
          <p class="meta"><strong>Lecture comptable :</strong> les blocs du haut reprennent les mêmes indicateurs que le rapport des recettes admin/restaurant. <strong>Recharges badges sur la période :</strong> ${total.toLocaleString('fr-FR')} FCFA. <strong>Liquidité actuelle des badges :</strong> ${badgeLiquidity.toLocaleString('fr-FR')} FCFA. Les tableaux ci-dessous détaillent ensuite les ventes par type d'engagement puis les encaissements/recharges.</p>
          <h2>Ventes ordinaires par type d'engagement</h2>
          ${salesBody}
          <h2>Encaissements et recharges</h2>
          <table><thead><tr><th>Date</th><th>Personnel</th><th>Service</th><th>Badge</th><th>Montant</th><th>Mode</th><th>Nom du comptable ayant chargé le badge</th></tr></thead><tbody>${transactionRows || '<tr><td colspan="7">Aucun encaissement</td></tr>'}</tbody></table>
          <section class="signatures">${signatureBlocks}</section>
          <script>window.onload = () => window.print();</script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const downloadAccountingExcel = () => {
    const escapeCell = (value: unknown) => String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
    const table = (title: string, headers: string[], rows: unknown[][]) => `
      <h2>${escapeCell(title)}</h2>
      <table>
        <thead><tr>${headers.map(header => `<th>${escapeCell(header)}</th>`).join('')}</tr></thead>
        <tbody>
          ${rows.length ? rows.map(row => `<tr>${row.map(cell => `<td>${escapeCell(cell)}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${headers.length}">Aucune donnee</td></tr>`}
        </tbody>
      </table>
    `;

    const matchProfileOrder = (profile: UserProfile, order: Order) =>
      order.employeeId === profile.id ||
      (!!profile.badgeNumber && order.badgeNumber === profile.badgeNumber) ||
      (!!profile.email && order.employeeEmail === profile.email);
    const matchProfileTransaction = (profile: UserProfile, transaction: CashTransaction) =>
      transaction.employeeId === profile.id ||
      (!!profile.badgeNumber && transaction.badgeNumber === profile.badgeNumber);
    const formatOrderDetail = (order: Order) =>
      `${new Date(order.createdAt).toLocaleDateString('fr-FR')} ${order.id}: ${order.items.map(item => `${item.quantity} x ${item.meal?.name || 'Repas'}`).join(', ')} = ${Number(order.total || 0).toLocaleString('fr-FR')} F (${order.status})`;
    const formatRechargeDetail = (transaction: CashTransaction) =>
      `${new Date(transaction.createdAt).toLocaleDateString('fr-FR')} ${Number(transaction.amount || 0).toLocaleString('fr-FR')} F ${transaction.method === 'wave' ? 'Wave' : transaction.method === 'orange_money' ? 'Orange Money' : 'Espèces'} par ${getTransactionCashierName(transaction)}`;
    const employeeRows = employeeProfiles.map(profile => {
      const profileOrders = orders
        .filter(order => matchProfileOrder(profile, order))
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      const paidProfileOrders = profileOrders.filter(isPaidAccountingOrder);
      const debitedProfileOrders = profileOrders.filter(order =>
        order.orderType !== 'special_dinner' &&
        order.paymentStatus === 'paid'
      );
      const refundedProfileOrders = profileOrders.filter(order =>
        order.paymentStatus === 'refunded' ||
        order.status === 'cancelled' ||
        order.status === 'expired'
      );
      const profileTransactions = transactions
        .filter(transaction => matchProfileTransaction(profile, transaction))
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      const realRefundTransactions = profileTransactions.filter(transaction =>
        Number(transaction.amount || 0) > 0 &&
        /rembours|refund|recr[eé]dit|annul|expir/i.test(`${transaction.note || ''} ${transaction.correctionReason || ''}`)
      );
      const totalExpenses = paidProfileOrders.reduce((sum, order) => sum + Number(order.total || 0), 0);
      const totalDebitedExpenses = debitedProfileOrders.reduce((sum, order) => sum + Number(order.total || 0), 0);
      const totalRecharges = profileTransactions.reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0);
      const totalRefunded = refundedProfileOrders.reduce((sum, order) => sum + Number(order.total || 0), 0);
      const totalRealRefunded = realRefundTransactions.reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0);
      const informationalRefundTotal = Math.max(0, totalRefunded - totalRealRefunded);
      const theoreticalBalance = Math.max(0, totalRecharges - totalExpenses + totalRefunded);
      const realTheoreticalBalance = Math.max(0, totalRecharges - totalDebitedExpenses + totalRealRefunded);
      const balanceGap = Number(profile.walletBalance || 0) - theoreticalBalance;
      const realBalanceGap = Number(profile.walletBalance || 0) - realTheoreticalBalance;
      return [
        profile.id,
        profile.name,
        profile.badgeNumber,
        profile.phone,
        profile.department,
        profile.room || '',
        profile.walletBalance,
        totalExpenses,
        paidProfileOrders.map(formatOrderDetail).join(' | '),
        totalRecharges,
        profileTransactions.map(formatRechargeDetail).join(' | '),
        totalRefunded,
        totalRealRefunded,
        informationalRefundTotal,
        refundedProfileOrders.map(order => `${formatOrderDetail(order)} | ${order.paymentStatus === 'refunded' ? 'marquee remboursee' : 'annulee/expiree, information seulement sauf recredit trace'}`).join(' | '),
        realRefundTransactions.map(transaction => `${new Date(transaction.createdAt).toLocaleDateString('fr-FR')} ${Number(transaction.amount || 0).toLocaleString('fr-FR')} F | ${transaction.note || ''} | ${transaction.correctionReason || ''}`).join(' | '),
        realTheoreticalBalance,
        realBalanceGap,
        theoreticalBalance,
        balanceGap,
        profile.status,
        profile.badgeBlocked ? 'Oui' : 'Non',
      ];
    });
    const exportedSubsidizedAgentDays = new Set<string>();
    const orderRows = orders.filter(isPaidAccountingOrder).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()).map(order => {
      const subsidyKey = `${order.employeeId}-${getOperationalDateKey(order.createdAt, REPORT_OPERATIONAL_START)}`;
      const accounting = getOrderAccounting(order, accountingPrices, !exportedSubsidizedAgentDays.has(subsidyKey));
      if (accounting.subsidizedQuantity > 0) exportedSubsidizedAgentDays.add(subsidyKey);
      return [
        order.id,
        new Date(order.createdAt).toLocaleString('fr-FR'),
        order.employeeName,
        order.badgeNumber,
        order.orderType || 'regular',
        order.status,
        order.paymentStatus,
        order.items.map(item => `${item.quantity} x ${(item.meal?.name || 'Repas')}`).join(', '),
        accounting.quantity,
        accounting.subsidizedQuantity,
        accounting.fullPriceQuantity,
        accounting.staffPaid,
        accounting.hospitalSupport,
        Math.max(0, order.deliveryFeeAmount || 0),
        order.deliveryFeePayer === 'hospital' ? 'Hôpital' : order.deliveryFeePayer === 'employee' ? 'Personnel' : 'Aucun',
        accounting.staffPaid + accounting.hospitalSupport,
      ];
    });
    const transactionRows = transactions.map(transaction => [
      transaction.id,
      new Date(transaction.createdAt).toLocaleString('fr-FR'),
      transaction.employeeName,
      getTransactionService(transaction),
      transaction.badgeNumber,
      transaction.amount,
      transaction.method === 'wave' ? 'Wave' : transaction.method === 'orange_money' ? 'Orange Money' : 'Espèces',
      transaction.waveFeeRate || 0,
      transaction.waveFeeAmount || 0,
      getTransactionCashierName(transaction),
      transaction.note || '',
      transaction.correctionOf || '',
      transaction.correctionReason || '',
      transaction.grossAmount ?? '',
      transaction.processorFeeCents !== undefined ? transaction.processorFeeCents / 100 : '',
      transaction.netReceivedCents !== undefined ? transaction.netReceivedCents / 100 : '',
      transaction.feePolicy || '',
    ]);
    const waveRows = waveTopupRequests.map(request => [
      request.id,
      new Date(request.createdAt).toLocaleString('fr-FR'),
      request.employeeName,
      request.badgeNumber,
      request.phone,
      request.amount,
      request.reference,
      request.merchantNumber,
      request.status,
    ]);
    const prepaidRows = prepaidCards.map(card => [
      card.id,
      card.code,
      card.employeeName,
      card.badgeNumber,
      card.amount,
      card.status,
      new Date(card.createdAt).toLocaleString('fr-FR'),
      card.usedAt ? new Date(card.usedAt).toLocaleString('fr-FR') : '',
    ]);

    const html = `
      <html>
        <head>
          <meta charset="utf-8" />
          <style>
            body { font-family: Arial, sans-serif; color: #0f172a; }
            h1 { font-size: 18px; text-transform: uppercase; }
            h2 { margin-top: 24px; font-size: 14px; color: #1d4ed8; }
            table { border-collapse: collapse; width: 100%; margin-bottom: 18px; }
            th, td { border: 1px solid #cbd5e1; padding: 6px; font-size: 11px; vertical-align: top; }
            th { background: #eff6ff; font-weight: 800; text-transform: uppercase; }
          </style>
        </head>
        <body>
          <h1>Sauvegarde comptable Ndamatou</h1>
          <p>Export genere le ${escapeCell(new Date().toLocaleString('fr-FR'))}. A conserver chaque jour a 18h.</p>
          <p><strong>Lecture des remboursements :</strong> les remboursements reellement faits sont uniquement les recredits/corrections positives traces dans le journal. Les commandes annulees, expirees ou marquees remboursees sans recredit trace sont des informations d'audit.</p>
          ${table('Soldes badges du personnel', ['ID', 'Nom', 'Badge', 'Telephone', 'Service', 'Specialite', 'Solde actuel', 'Depenses commandes', 'Details commandes', 'Total recharges', 'Details recharges', 'Annulees/expirees/remboursees reperees', 'Remboursements reellement recredites', 'Remboursements fictifs / information seulement', 'Details annulees/expirees/remboursees', 'Details recredits reels', 'Solde theorique reel', 'Ecart reel', 'Solde theorique historique', 'Ecart historique', 'Statut', 'Badge bloque'], employeeRows)}
          ${table('Ventes et commandes', ['Commande', 'Date', 'Personnel', 'Badge', 'Type', 'Statut', 'Paiement', 'Articles', 'Quantite', 'Subventionnees', 'Prix reel', 'Part restaurateur', 'Part hopital', 'Frais livraison', 'Payeur livraison', 'Montant reel repas'], orderRows)}
          ${table('Crédits badge et versements', ['Transaction', 'Date', 'Personnel', 'Service', 'Badge', 'Crédit badge', 'Mode', 'Taux nominal contribution agent (%)', 'Contribution agent', 'Nom du comptable ayant chargé le badge', 'Note', 'Correction de', 'Motif correction', 'Brut mobile F', 'Frais calculés Bictorys/opérateur F', 'Net calculé F', 'Modèle de frais'], transactionRows)}
          ${table('Demandes Wave', ['ID', 'Date', 'Personnel', 'Badge', 'Telephone', 'Montant', 'Repere', 'Marchand', 'Statut'], waveRows)}
          ${table('Cartes prepayees', ['ID', 'Code', 'Personnel', 'Badge', 'Montant', 'Statut', 'Creation', 'Utilisation'], prepaidRows)}
        </body>
      </html>
    `;
    const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = `sauvegarde-comptable-Ndamatou-${todayKey}.xls`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <SharedFinanceReport orders={todayPaidOrders} transactions={todayTransactions} badgeReserve={totalBadgeBalance} period={`${todayRange.start.toLocaleString('fr-FR')} → ${todayRange.end.toLocaleString('fr-FR')}`} />
      {accountantNameIsGeneric && (
        <div className="rounded-2xl border-2 border-red-300 bg-red-50 p-4 text-red-900">
          <p className="font-black">Vrai nom du comptable obligatoire</p>
          <p className="mt-1 text-xs font-bold">
            Le profil connecté porte encore le nom générique « Comptable Ndamatou ». Ouvrez l'icône Profil en haut, renseignez le nom réel de l'agent comptable puis enregistrez. Les anciennes recharges seront automatiquement mises à jour.
          </p>
        </div>
      )}
      {!accountantNameIsGeneric && legacyGenericTransactions.length > 0 && (
        <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4 text-amber-950">
          <p className="font-black">{legacyGenericTransactions.length} ancienne(s) recharge(s) sans comptable identifié</p>
          <p className="mt-1 text-xs font-bold">
            Ces anciennes opérations portent encore le nom générique « Comptable Ndamatou ». Utilisez ce bouton uniquement si elles ont réellement été effectuées par {activeAccountantName}.
          </p>
          <button
            type="button"
            disabled={isClaimingLegacyTransactions}
            onClick={async () => {
              const confirmed = window.confirm(
                `Attribuer ${legacyGenericTransactions.length} ancienne(s) recharge(s) générique(s) à ${activeAccountantName} \n\nCette attribution apparaîtra dans les rapports comptables.`
              );
              if (!confirmed) return;
              setIsClaimingLegacyTransactions(true);
              try {
                const updatedCount = await onClaimLegacyTransactions();
                setTopupActionMessage(`${updatedCount} ancienne(s) recharge(s) attribuée(s) à ${activeAccountantName}.`);
              } catch {
                setTopupActionMessage("Firebase a refusé l'attribution. Déployez les nouvelles règles Firestore puis réessayez.");
              } finally {
                setIsClaimingLegacyTransactions(false);
              }
            }}
            className="mt-3 rounded-xl bg-amber-700 px-4 py-2.5 text-xs font-black text-white disabled:opacity-60"
          >
              {isClaimingLegacyTransactions ? 'Attribution en cours...' : 'Attribuer mes anciennes recharges'}
          </button>
        </div>
      )}
      {false && <section className="bg-white rounded-3xl border border-blue-100 p-5 shadow-sm">
        <h2 className="font-black text-slate-950">Demandes Wave en attente</h2>
        {pendingWaveRequests.length === 0 ? (
          <p className="text-sm text-slate-500 mt-2">Aucune demande Wave en attente pour le moment.</p>
        ) : (
          <div className="space-y-3 mt-4">
            {pendingWaveRequests.map(request => (
              <div key={request.id} className="bg-blue-50 rounded-2xl border border-blue-100 p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3 text-sm">
                <div>
                  <p className="font-black text-slate-950">{request.employeeName}</p>
                  <p className="text-xs text-slate-500 font-mono">{request.badgeNumber} - {request.phone}</p>
                  <p className="text-xs text-blue-700 font-mono mt-1">Repere {request.reference} - Marchand {request.merchantNumber}</p>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <p className="font-mono font-black text-blue-900">{request.amount.toLocaleString('fr-FR')} F</p>
                  <button
                    type="button"
                    onClick={() => {
                      const ok = window.confirm(`Confirmer la recharge Wave de ${request.amount.toLocaleString('fr-FR')} FCFA pour ${request.employeeName} `);
                      if (!ok) return;
                      setLocallyApprovedWaveIds(prev => [...prev, request.id]);
                      onApproveWaveTopup(request.id);
                    }}
                    className="rounded-xl bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 text-xs font-black"
                  >
                    Valider et crediter
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>}

      <div className="bg-white rounded-3xl border border-slate-100 p-5 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <p className="font-black text-slate-950">Blocs d'information comptable</p>
          <p className="text-xs text-slate-500 mt-1">Affichage uniquement sur demande.</p>
        </div>
        <button type="button" onClick={() => setShowAccountingBlocks(value => !value)} className="rounded-2xl bg-slate-950 text-white px-5 py-3 text-xs font-black">{showAccountingBlocks ? 'Masquer les blocs' : 'Afficher les blocs'}</button>
      </div>

      {showAccountingBlocks && <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        <div className="bg-white rounded-3xl border border-cyan-100 p-5 shadow-sm">
          <p className="text-xs uppercase font-black text-cyan-700">Commandes payées aujourd'hui</p>
          <p className="text-3xl font-black text-cyan-800 mt-2">{regularOrders.length}</p>
          <p className="mt-3 border-t border-cyan-100 pt-2 text-[10px] font-bold leading-relaxed text-cyan-800">Commandes normales débitées du badge et enregistrées comme payées aujourd'hui.</p>
          <p className="mt-1 text-[10px] font-bold text-cyan-600">{regularAccounting.quantity} portion(s), dont {regularAccounting.subsidizedQuantity} subventionnée(s) et {regularAccounting.fullPriceQuantity} au prix réel.</p>
        </div>
        <div className="bg-white rounded-3xl border border-blue-100 p-5 shadow-sm">
          <p className="text-xs uppercase font-black text-blue-700">Contributions agents mobile money</p>
          <p className="text-3xl font-black text-blue-800 mt-2">{todayWaveFees.toLocaleString('fr-FR')} FCFA</p>
          <p className="mt-3 border-t border-blue-100 pt-2 text-[10px] font-bold leading-relaxed text-blue-800">Différence entre versement mobile et crédit badge. Les frais Bictorys/opérateur de 2 % sont suivis séparément dans le tableau de partage.</p>
        </div>
        <div className="bg-white rounded-3xl border border-blue-100 p-5 shadow-sm">
          <p className="text-xs uppercase font-black text-blue-700">Commandes livrées / remises</p>
          <p className="text-3xl font-black text-blue-800 mt-2">{deliveredOrdersToday.length}</p>
          <p className="mt-3 border-t border-blue-100 pt-2 text-[10px] font-bold leading-relaxed text-blue-800">Commandes du jour déjà validées par scan QR et remises au personnel.</p>
        </div>
        <div className="bg-white rounded-3xl border border-blue-100 p-5 shadow-sm">
          <p className="text-xs uppercase font-black text-blue-700">Commandes à livrer</p>
          <p className="text-3xl font-black text-blue-800 mt-2">{ordersToDeliverToday.length}</p>
          <p className="mt-3 border-t border-blue-100 pt-2 text-[10px] font-bold leading-relaxed text-blue-800">Commandes avec livraison encore en attente de validation finale.</p>
        </div>
        <div className="bg-white rounded-3xl border border-red-100 p-5 shadow-sm">
          <p className="text-xs uppercase font-black text-red-700">Commandes annulees</p>
          <p className="text-3xl font-black text-red-800 mt-2">{lifecycleMetrics.cancelledOrders}</p>
          <p className="mt-3 border-t border-red-100 pt-2 text-[10px] font-bold leading-relaxed text-red-800">Annulations simples du jour, sans remplacement par une nouvelle commande.</p>
        </div>
        <div className="bg-white rounded-3xl border border-indigo-100 p-5 shadow-sm">
          <p className="text-xs uppercase font-black text-indigo-700">Commandes modifiees</p>
          <p className="text-3xl font-black text-indigo-800 mt-2">{lifecycleMetrics.modifiedOrders}</p>
          <p className="mt-3 border-t border-indigo-100 pt-2 text-[10px] font-bold leading-relaxed text-indigo-800">Anciennes commandes annulees puis remplacees par le personnel dans le delai.</p>
        </div>
        <div className="bg-white rounded-3xl border border-slate-100 p-5 shadow-sm">
          <p className="text-xs uppercase font-black text-slate-400">Recharges encaissees</p>
          <p className="text-3xl font-black text-slate-950 mt-2">{todayTotal.toLocaleString('fr-FR')} FCFA</p>
          <p className="mt-3 border-t border-slate-100 pt-2 text-[10px] font-bold leading-relaxed text-slate-600">Sommes versées aujourd'hui par les agents pour créditer leurs badges.</p>
          <p className="mt-1 text-[10px] font-bold text-slate-400">Montants chargés aujourd'hui uniquement</p>
        </div>
        <div className="bg-white rounded-3xl border border-blue-100 p-5 shadow-sm">
          <p className="text-xs uppercase font-black text-blue-700">Solde total actuel des badges</p>
          <p className="text-3xl font-black text-blue-800 mt-2">{totalBadgeBalance.toLocaleString('fr-FR')} FCFA</p>
          <p className="mt-3 border-t border-blue-100 pt-2 text-[10px] font-bold leading-relaxed text-blue-800">Argent encore disponible sur les badges du personnel et non encore consommé.</p>
          <p className="mt-1 text-[10px] font-bold text-blue-600">{employeeProfiles.length} badge(s) personnel</p>
        </div>
        <div className="bg-white rounded-3xl border border-slate-100 p-5 shadow-sm">
          <p className="text-xs uppercase font-black text-slate-400">Part restaurateur aujourd'hui</p>
          <p className="text-3xl font-black text-blue-700 mt-2">{todayMealSales.toLocaleString('fr-FR')} FCFA</p>
          <p className="mt-3 border-t border-slate-100 pt-2 text-[10px] font-bold leading-relaxed text-slate-600">Montant payé par les agents pour leurs commandes. Formule : prix réel moins subvention hôpital.</p>
          <p className="mt-1 text-[10px] font-bold text-slate-400">Prix réel moins subvention hôpital</p>
        </div>
        <div className="bg-white rounded-3xl border border-amber-100 p-5 shadow-sm">
          <p className="text-xs uppercase font-black text-amber-700">Part hôpital aujourd'hui</p>
          <p className="text-3xl font-black text-amber-800 mt-2">{regularAccounting.hospitalSupport.toLocaleString('fr-FR')} FCFA</p>
          <p className="mt-3 border-t border-amber-100 pt-2 text-[10px] font-bold leading-relaxed text-amber-800">
            {accountingPrices.hospital.toLocaleString('fr-FR')} FCFA × {regularAccounting.subsidizedQuantity} portion(s) subventionnée(s). Une seule subvention est accordée par agent et par jour.
          </p>
        </div>
        <div className="bg-white rounded-3xl border border-violet-100 p-5 shadow-sm">
          <p className="text-xs uppercase font-black text-violet-700">Montant réel des commandes aujourd'hui</p>
          <p className="text-3xl font-black text-violet-800 mt-2">{todayRealOrderAmount.toLocaleString('fr-FR')} FCFA</p>
          <p className="mt-3 border-t border-violet-100 pt-2 text-[10px] font-bold leading-relaxed text-violet-800">Valeur réelle totale des repas commandés. Formule : part restaurateur plus part hôpital.</p>
          <p className="mt-1 text-[10px] font-bold text-violet-600">Part restaurateur + subvention hôpital</p>
        </div>
      </div>}

      {showAccountingBlocks && <section className="bg-white rounded-3xl border border-slate-100 p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
          <div>
            <p className="font-black text-slate-950">Portions restantes par plat chaud</p>
            <p className="text-xs text-slate-500 mt-1">Stock actuellement disponible pour les plats activés aujourd'hui.</p>
          </div>
          <p className="text-sm font-black text-slate-700">
            Total : {remainingHotMeals.reduce((sum, meal) => sum + Math.max(0, meal.stock), 0)} portion(s)
          </p>
        </div>
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {remainingHotMeals.length === 0 ? (
            <p className="text-sm text-slate-400 sm:col-span-2 xl:col-span-3">Aucun plat chaud actif aujourd'hui.</p>
          ) : remainingHotMeals.map(meal => (
            <div key={meal.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 flex items-center justify-between gap-3">
              <span className="text-sm font-black text-slate-800">{meal.name}</span>
              <span className={`shrink-0 rounded-xl px-3 py-1 text-sm font-black ${meal.stock <= 5 ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>
                {Math.max(0, meal.stock)}
              </span>
            </div>
          ))}
        </div>
      </section>}

      <section className="bg-white rounded-3xl border border-slate-100 p-5 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div>
            <p className="font-black text-slate-950">Commandes de la période</p>
            <p className="text-xs text-slate-500 mt-1">Choisissez la période puis affichez les détails seulement si nécessaire.</p>
          </div>
          <button type="button" onClick={() => setShowPeriodOrders(value => !value)} className="rounded-2xl bg-blue-600 text-white px-5 py-3 text-xs font-black">{showPeriodOrders ? 'Masquer les commandes' : 'Afficher les commandes'}</button>
        </div>
      </section>

      {showPeriodOrders && <section className="bg-white rounded-3xl border border-slate-100 p-5 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-3">
          <div>
            <p className="font-black text-slate-950">Commandes de la période</p>
            <p className="text-xs text-slate-500 mt-1">
              Période restaurant: {previewRange.start.toLocaleString('fr-FR')} → {previewRange.end.toLocaleString('fr-FR')}. Les montants utilisent la même formule que le rapport recette.
            </p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
            <div className="rounded-2xl bg-cyan-50 border border-cyan-100 p-3"><span className="block font-black text-cyan-700 uppercase">Commandes</span><strong className="text-lg text-cyan-900">{previewOrders.length}</strong></div>
            <div className="rounded-2xl bg-slate-50 border border-slate-100 p-3"><span className="block font-black text-slate-500 uppercase">Portions</span><strong className="text-lg text-slate-900">{previewAccounting.quantity}</strong></div>
            <div className="rounded-2xl bg-blue-50 border border-blue-100 p-3"><span className="block font-black text-blue-700 uppercase">Part agent</span><strong className="text-lg text-blue-900">{previewAccounting.staffPaid.toLocaleString('fr-FR')} F</strong></div>
            <div className="rounded-2xl bg-amber-50 border border-amber-100 p-3"><span className="block font-black text-amber-700 uppercase">Part hôpital</span><strong className="text-lg text-amber-900">{previewAccounting.hospitalSupport.toLocaleString('fr-FR')} F</strong></div>
            <div className="rounded-2xl bg-violet-50 border border-violet-100 p-3"><span className="block font-black text-violet-700 uppercase">Montant réel</span><strong className="text-lg text-violet-900">{(previewAccounting.staffPaid + previewAccounting.hospitalSupport).toLocaleString('fr-FR')} F</strong></div>
          </div>
        </div>
        <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-100">
          <table className="min-w-[980px] w-full text-xs">
            <thead className="bg-slate-50 text-slate-500 uppercase">
              <tr><th className="p-3 text-left">Date</th><th className="p-3 text-left">Agent</th><th className="p-3 text-left">Service</th><th className="p-3 text-left">Téléphone</th><th className="p-3 text-left">Repas</th><th className="p-3 text-left">Portions</th><th className="p-3 text-left">Part agent</th><th className="p-3 text-left">Part hôpital</th><th className="p-3 text-left">Montant réel</th></tr>
            </thead>
            <tbody>
              {previewAccountingEntries.length === 0 ? (
                <tr><td className="p-4 text-slate-400 text-center" colSpan={9}>Aucune commande payée sur cette période.</td></tr>
              ) : previewAccountingEntries.slice(0, 120).map(entry => {
                const order = entry.order;
                const profile = profiles.find(item => item.id === order.employeeId || item.badgeNumber === order.badgeNumber || item.email === order.employeeEmail);
                const realAmount = entry.accounting.staffPaid + entry.accounting.hospitalSupport;
                return (
                  <tr key={order.id} className="border-t border-slate-100">
                    <td className="p-3 font-mono text-slate-500">{new Date(order.createdAt).toLocaleString('fr-FR')}</td>
                    <td className="p-3 font-black text-slate-900">{order.employeeName}</td>
                    <td className="p-3 text-slate-600">{profile?.department || order.department || 'Service non renseigné'}</td>
                    <td className="p-3 font-mono text-slate-500">{profile?.phone || order.employeePhone || ''}</td>
                    <td className="p-3 text-slate-700">{order.items.map(item => `${item.quantity} x ${item.meal?.name || 'Repas'}`).join(', ')}</td>
                    <td className="p-3 font-black">{entry.accounting.quantity}</td>
                    <td className="p-3 font-black text-blue-700">{entry.accounting.staffPaid.toLocaleString('fr-FR')} F</td>
                    <td className="p-3 font-black text-amber-700">{entry.accounting.hospitalSupport.toLocaleString('fr-FR')} F</td>
                    <td className="p-3 font-black text-violet-700">{realAmount.toLocaleString('fr-FR')} F</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {previewAccountingEntries.length > 120 && <p className="mt-2 text-[10px] font-bold text-slate-500">Aperçu limité aux 120 premières lignes. Utilisez l'impression ou l'export Excel pour la période complète.</p>}
      </section>}

      <div className="bg-white rounded-3xl border border-slate-100 p-5 shadow-sm flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
        <div>
          <p className="font-black text-slate-950">Rapports d'encaissement</p>
          <p className="text-xs text-slate-500">Impression des commandes normales avec part personnel, part hôpital et signatures.</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <button onClick={downloadAccountingExcel} className="rounded-2xl bg-blue-600 text-white px-5 py-3 text-xs font-black flex items-center justify-center gap-2"><Download className="w-4 h-4" /> Export Excel complet</button>
          <button onClick={() => printReport('journalier')} className="rounded-2xl bg-blue-600 text-white px-5 py-3 text-xs font-black flex items-center justify-center gap-2"><Printer className="w-4 h-4" /> Journalier</button>
          <button onClick={() => printReport('hebdomadaire')} className="rounded-2xl bg-slate-950 text-white px-5 py-3 text-xs font-black flex items-center justify-center gap-2"><Printer className="w-4 h-4" /> Hebdo</button>
          <label className="text-[10px] font-black uppercase text-slate-500">Du
            <input type="date" value={reportStartDate} onChange={(event) => setReportStartDate(event.target.value)} className="mt-1 block rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900" />
          </label>
          <label className="text-[10px] font-black uppercase text-slate-500">Au
            <input type="date" value={reportEndDate} onChange={(event) => setReportEndDate(event.target.value)} className="mt-1 block rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900" />
          </label>
          <button onClick={() => printReport('personnalisee')} className="rounded-2xl bg-amber-600 text-white px-5 py-3 text-xs font-black flex items-center justify-center gap-2"><Printer className="w-4 h-4" /> Imprimer la période</button>
        </div>
      </div>

      <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <p className="font-black text-slate-950">Contrôle DRH</p>
            <p className="text-xs text-slate-500 mt-1">Consultation lecture seule des agents. Affichage uniquement sur demande pour alléger le compte comptable.</p>
          </div>
          <button
            type="button"
            onClick={() => setShowHrControl(value => !value)}
            className="rounded-2xl bg-slate-950 text-white px-5 py-3 text-xs font-black"
          >
            {showHrControl ? 'Masquer DRH' : 'Afficher DRH'}
          </button>
        </div>
        {showHrControl && (
          <div className="mt-5">
            <HrView
              profiles={profiles}
              employmentTypes={institutionConfig.employmentTypes || []}
              services={institutionConfig.services || services}
              readOnly
              onUpdateProfile={async () => undefined}
              onDeleteProfile={async () => undefined}
            />
          </div>
        )}
      </section>
    </div>
  );
};


















