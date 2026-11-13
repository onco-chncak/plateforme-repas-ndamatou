const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { FEE_POLICY, quoteMobileTopup } = require('./finance.cjs');

initializeApp();
const db = getFirestore();

const getWeekKey = (value = new Date()) => {
  const date = value instanceof Date ? new Date(value) : new Date(value);
  const day = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - day);
  date.setHours(0, 0, 0, 0);
  return date.toISOString().slice(0, 10);
};

const getMaxBadgeBalance = async () => {
  const settingsSnapshot = await db.doc('settings/institution').get();
  const maxBadgeBalance = Number(settingsSnapshot.data()?.maxBadgeBalance || 10000);
  return Number.isFinite(maxBadgeBalance) && maxBadgeBalance > 0 ? maxBadgeBalance : 10000;
};
const requireAccountant = async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Connexion requise.');
  const profile = await db.doc(`users/${request.auth.uid}`).get();
  const data = profile.data() || {};
  const role = data.role;
  const trustedTopupEmails = [
    'smsgueye@gmail.com',
    'sms@chncak.sn',
    'smsg@chncak.sn',
    'chef.diop@chncak.sn',
    'onco.chn.cak@gmail.com',
  ];
  const canTopup =
    ['accountant', 'admin', 'restaurant_admin', 'operator'].includes(role) ||
    data.accountantAccess === true ||
    data.topupAccess === true ||
    data.restaurantAccess === true ||
    trustedTopupEmails.includes(String(request.auth.token.email || '').toLowerCase());
  if (!canTopup) {
    throw new HttpsError('permission-denied', 'Opération réservée au comptable ou administrateur.');
  }
  return data;
};

exports.accountantTopup = onCall(async (request) => {
  const cashier = await requireAccountant(request);
  const { employeeId, amount, note = '', method = 'cash', requestId, grossAmount } = request.data || {};
  if (typeof employeeId !== 'string' || !employeeId || employeeId.includes('/') ||
      !Number.isSafeInteger(amount) || amount <= 0 ||
      !['cash', 'wave', 'orange_money'].includes(method) || typeof note !== 'string' || note.length > 1000 ||
      (requestId !== undefined && (typeof requestId !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(requestId)))) {
    throw new HttpsError('invalid-argument', 'Personnel, montant ou moyen de paiement invalide.');
  }
  let financialQuote;
  if (grossAmount !== undefined) {
    try {
      financialQuote = quoteMobileTopup(grossAmount);
      if (method === 'cash' || financialQuote.amount !== amount) throw new Error('Crédit incohérent.');
    } catch {
      throw new HttpsError('invalid-argument', 'Le montant versé ne correspond pas au crédit badge.');
    }
  } else if (method === 'orange_money') {
    throw new HttpsError('invalid-argument', 'Montant réellement versé requis pour Orange Money.');
  }
  const employeeRef = db.doc('users/' + employeeId);
  const transactionRef = db.collection('cashTransactions').doc(requestId ? 'topup-' + request.auth.uid + '-' + requestId : undefined);
  return db.runTransaction(async transaction => {
    const previous = await transaction.get(transactionRef);
    if (previous.exists) {
      const saved = previous.data();
      if (saved.employeeId !== employeeId || saved.amount !== amount || saved.method !== method || saved.grossAmount !== grossAmount) {
        throw new HttpsError('already-exists', 'Identifiant de recharge déjà utilisé pour une autre opération.');
      }
      return saved;
    }
    const employeeSnapshot = await transaction.get(employeeRef);
    const settingsSnapshot = await transaction.get(db.doc('settings/institution'));
    if (!employeeSnapshot.exists) throw new HttpsError('not-found', 'Personnel introuvable.');
    const employee = employeeSnapshot.data();
    const settings = settingsSnapshot.data() || {};
    const configuredMax = Number(settings.maxBadgeBalance || 10000);
    const maxBadgeBalance = Number.isSafeInteger(configuredMax) && configuredMax > 0 ? configuredMax : 10000;
    const currentBalance = Number(employee.walletBalance || 0);
    if (!Number.isSafeInteger(currentBalance) || currentBalance < 0) throw new HttpsError('failed-precondition', 'Solde badge invalide.');
    const nextBalance = currentBalance + amount;
    if (nextBalance > maxBadgeBalance) throw new HttpsError('failed-precondition', 'Plafond badge dépassé (' + maxBadgeBalance + ' FCFA).');
    if (employee.badgeBlocked || employee.status === 'blocked' || employee.status === 'pending') {
      throw new HttpsError('failed-precondition', 'Badge non actif.');
    }
    const configuredRate = Number(settings.waveCashierFeeRate || 0);
    const waveFeeRate = method === 'wave' && Number.isFinite(configuredRate) && configuredRate > 0 && configuredRate < 100 ? configuredRate : 0;
    const cashTransaction = {
      id: transactionRef.id,
      employeeId,
      employeeName: employee.name || '',
      badgeNumber: employee.badgeNumber || '',
      amount,
      method,
      waveFeeRate,
      waveFeeAmount: waveFeeRate ? Math.round(amount * waveFeeRate / (100 - waveFeeRate)) : 0,
      ...(financialQuote || {}),
      balanceAfter: nextBalance,
      cashierId: request.auth.uid,
      cashierName: cashier.name || request.auth.token.email || 'Caissier',
      createdAt: new Date().toISOString(),
      note,
    };
    transaction.update(employeeRef, { walletBalance: nextBalance });
    transaction.set(transactionRef, cashTransaction);
    return cashTransaction;
  });
});

exports.correctTopup = onCall(async (request) => {
  await requireAccountant(request);
  const { transactionId, correctedAmount, reason } = request.data || {};
  if (typeof transactionId !== 'string' || !Number.isInteger(correctedAmount) || correctedAmount < 0 || typeof reason !== 'string' || !reason.trim()) {
    throw new HttpsError('invalid-argument', 'Correction invalide.');
  }

  const sourceRef = db.doc(`cashTransactions/${transactionId}`);
  const correctionRef = db.collection('cashTransactions').doc();
  return db.runTransaction(async transaction => {
    const sourceSnapshot = await transaction.get(sourceRef);
    if (!sourceSnapshot.exists) throw new HttpsError('not-found', 'Recharge introuvable.');
    const source = sourceSnapshot.data();
    if (source.correctionOf) throw new HttpsError('failed-precondition', 'Une correction ne peut pas être corrigée.');
    if (source.correctedAt) throw new HttpsError('already-exists', 'Cette recharge a déjà été corrigée.');
    if (Date.now() - new Date(source.createdAt).getTime() > 60_000) {
      throw new HttpsError('deadline-exceeded', 'Le délai de correction de 60 secondes est dépassé.');
    }

    const difference = correctedAmount - source.amount;
    const employeeRef = db.doc(`users/${source.employeeId}`);
    const employeeSnapshot = await transaction.get(employeeRef);
    const nextBalance = (employeeSnapshot.data()?.walletBalance || 0) + difference;
    if (nextBalance < 0) throw new HttpsError('failed-precondition', 'Solde insuffisant pour cette correction.');

    const correction = {
      id: correctionRef.id,
      employeeId: source.employeeId,
      employeeName: source.employeeName,
      badgeNumber: source.badgeNumber,
      amount: difference,
      method: source.method,
      cashierId: request.auth.uid,
      cashierName: source.cashierName,
      createdAt: new Date().toISOString(),
      note: `Correction recharge: ${source.amount} -> ${correctedAmount} FCFA`,
      correctionOf: source.id,
      correctionReason: reason.trim(),
    };
    transaction.update(employeeRef, { walletBalance: nextBalance });
    transaction.update(sourceRef, { correctedAt: correction.createdAt, correctedBy: request.auth.uid });
    transaction.set(correctionRef, correction);
    return correction;
  });
});

exports.approveWaveTopup = onCall(async (request) => {
  const cashier = await requireAccountant(request);
  const { requestId } = request.data || {};
  if (typeof requestId !== 'string') throw new HttpsError('invalid-argument', 'Demande Wave invalide.');
  const requestRef = db.doc(`waveTopupRequests/${requestId}`);
  const cashTransactionRef = db.collection('cashTransactions').doc();

  return db.runTransaction(async transaction => {
    const requestSnapshot = await transaction.get(requestRef);
    if (!requestSnapshot.exists) throw new HttpsError('not-found', 'Demande Wave introuvable.');
    const topupRequest = requestSnapshot.data();
    if (topupRequest.status !== 'pending' || !Number.isInteger(topupRequest.amount) || topupRequest.amount <= 0) {
      throw new HttpsError('failed-precondition', 'Cette demande Wave ne peut pas être validée.');
    }
    const employeeRef = db.doc(`users/${topupRequest.employeeId}`);
    const employeeSnapshot = await transaction.get(employeeRef);
    if (!employeeSnapshot.exists) throw new HttpsError('not-found', 'Personnel introuvable.');
    const employee = employeeSnapshot.data();
    const maxBadgeBalance = await getMaxBadgeBalance();
    const nextBalance = Number(employee.walletBalance || 0) + Number(topupRequest.amount || 0);
    if (nextBalance > maxBadgeBalance) throw new HttpsError('failed-precondition', 'Plafond badge depasse (' + maxBadgeBalance + ' FCFA).');
    const createdAt = new Date().toISOString();
    const cashTransaction = {
      id: cashTransactionRef.id,
      employeeId: topupRequest.employeeId,
      employeeName: employee.name,
      badgeNumber: employee.badgeNumber,
      amount: topupRequest.amount,
      method: 'wave',
      cashierId: request.auth.uid,
      cashierName: cashier.name || request.auth.token.email || 'Comptable',
      createdAt,
      note: `Wave ${topupRequest.reference}`,
    };
    transaction.update(requestRef, { status: 'approved', validatedAt: createdAt, validatedBy: cashTransaction.cashierName });
    transaction.update(employeeRef, { walletBalance: FieldValue.increment(topupRequest.amount) });
    transaction.set(cashTransactionRef, cashTransaction);
    return cashTransaction;
  });
});

exports.redeemPrepaidCard = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Connexion requise.');
  const { cardId } = request.data || {};
  if (typeof cardId !== 'string') throw new HttpsError('invalid-argument', 'Carte invalide.');
  const cardRef = db.doc(`prepaidCards/${cardId}`);
  const userRef = db.doc(`users/${request.auth.uid}`);
  const transactionRef = db.collection('cashTransactions').doc();

  return db.runTransaction(async transaction => {
    const [cardSnapshot, userSnapshot] = await Promise.all([transaction.get(cardRef), transaction.get(userRef)]);
    if (!cardSnapshot.exists || !userSnapshot.exists) throw new HttpsError('not-found', 'Carte ou personnel introuvable.');
    const card = cardSnapshot.data();
    const user = userSnapshot.data();
    if (card.status !== 'active' || card.employeeId !== request.auth.uid || card.badgeNumber !== user.badgeNumber) {
      throw new HttpsError('failed-precondition', 'Carte invalide, utilisée ou réservée à un autre badge.');
    }
    const maxBadgeBalance = await getMaxBadgeBalance();
    const nextBalance = Number(user.walletBalance || 0) + Number(card.amount || 0);
    if (nextBalance > maxBadgeBalance) throw new HttpsError('failed-precondition', 'Plafond badge depasse (' + maxBadgeBalance + ' FCFA).');
    const createdAt = new Date().toISOString();
    const cashTransaction = {
      id: transactionRef.id,
      employeeId: request.auth.uid,
      employeeName: user.name,
      badgeNumber: user.badgeNumber,
      amount: card.amount,
      method: 'cash',
      cashierId: card.cashierId,
      cashierName: card.cashierName,
      createdAt,
      note: `Carte prépayée ${card.code}`,
    };
    transaction.update(cardRef, { status: 'used', usedAt: createdAt, usedBy: request.auth.uid });
    transaction.update(userRef, { walletBalance: FieldValue.increment(card.amount) });
    transaction.set(transactionRef, cashTransaction);
    return cashTransaction;
  });
});

exports.createPaidOrder = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Connexion requise.');
  const order = request.data?.order;
  if (!order || order.employeeId !== request.auth.uid || !Array.isArray(order.items) || order.items.length === 0) {
    throw new HttpsError('invalid-argument', 'Commande invalide.');
  }
  if (order.paymentMethod !== 'badge_card' || !Number.isInteger(order.total) || order.total < 0) {
    throw new HttpsError('invalid-argument', 'Paiement badge invalide.');
  }
  const orderRef = db.doc(`orders/${order.id}`);
  const userRef = db.doc(`users/${request.auth.uid}`);
  const settingsRef = db.doc('settings/institution');
  const userOrdersQuery = db.collection('orders').where('employeeId', '==', request.auth.uid);
  return db.runTransaction(async transaction => {
    const [userSnapshot, settingsSnapshot, userOrdersSnapshot] = await Promise.all([
      transaction.get(userRef),
      transaction.get(settingsRef),
      transaction.get(userOrdersQuery),
    ]);
    if (!userSnapshot.exists) throw new HttpsError('not-found', 'Personnel introuvable.');
    const user = userSnapshot.data();
    if (user.badgeBlocked || user.status === 'blocked' || user.status === 'pending') throw new HttpsError('failed-precondition', 'Badge non actif.');

    const mealRefs = order.items.map(item => db.doc(`meals/${item.meal.id}`));
    const mealSnapshots = await Promise.all(mealRefs.map(mealRef => transaction.get(mealRef)));
    const settings = settingsSnapshot.data() || {};
    const realPrice = Number.isInteger(settings.realMealPrice) ? settings.realMealPrice : 1000;
    const staffPrice = Number.isInteger(settings.staffMealPrice) ? settings.staffMealPrice : 500;
    const maxItems = Number.isInteger(settings.maxItemsPerOrder) ? settings.maxItemsPerOrder : 2;
    const orderDate = String(order.createdAt || '').slice(0, 10);
    const existingOrdersToday = userOrdersSnapshot.docs
      .map(snapshot => snapshot.data())
      .filter(existingOrder =>
        String(existingOrder.createdAt || '').slice(0, 10) === orderDate &&
        !['cancelled', 'expired'].includes(existingOrder.status)
      );
    const existingQuantity = existingOrdersToday.reduce(
      (sum, existingOrder) => sum + (existingOrder.items || []).reduce((itemSum, item) => itemSum + (item.quantity || 0), 0),
      0,
    );
    const requestedQuantity = order.items.reduce((sum, item) => sum + item.quantity, 0);
    if (!Number.isInteger(requestedQuantity) || requestedQuantity <= 0 || existingQuantity + requestedQuantity > maxItems) {
      throw new HttpsError('failed-precondition', `Limite de ${maxItems} repas atteinte pour cette journée.`);
    }

    const forceStaffPrice = Boolean(user.alwaysStaffMealPrice || order.alwaysStaffMealPrice);
    let subsidyAvailable = forceStaffPrice || !existingOrdersToday.some(existingOrder =>
      (existingOrder.items || []).some(item => item.meal?.category === 'plat' && item.quantity > 0)
    );
    let computedTotal = 0;
    let subsidizedQuantity = 0;
    order.items.forEach((item, index) => {
      const mealRef = mealRefs[index];
      const mealSnapshot = mealSnapshots[index];
      const meal = mealSnapshot.data();
      if (!mealSnapshot.exists || !Number.isInteger(item.quantity) || item.quantity <= 0 || meal.stock < item.quantity) {
        throw new HttpsError('failed-precondition', `Stock insuffisant pour ${item.meal.name}.`);
      }
      if (meal.category === 'plat' && subsidyAvailable) {
        subsidizedQuantity += forceStaffPrice ? item.quantity : 1;
        computedTotal += forceStaffPrice ? item.quantity * staffPrice : staffPrice + Math.max(0, item.quantity - 1) * realPrice;
        subsidyAvailable = forceStaffPrice;
      } else {
        computedTotal += item.quantity * (meal.category === 'plat' ? realPrice : meal.price);
      }
      transaction.update(mealRef, { stock: meal.stock - item.quantity });
    });
    if (order.total !== computedTotal) throw new HttpsError('failed-precondition', 'Le montant de la commande ne correspond pas au tarif officiel.');
    if ((user.walletBalance || 0) < computedTotal) throw new HttpsError('failed-precondition', 'Solde insuffisant.');
    transaction.update(userRef, { walletBalance: user.walletBalance - computedTotal });
    transaction.set(orderRef, { ...order, alwaysStaffMealPrice: forceStaffPrice, total: computedTotal,
      settlement: { policy: FEE_POLICY, staffBase: computedTotal, hospitalBase: subsidizedQuantity * (realPrice - staffPrice) } });
    return { orderId: order.id, total: computedTotal };
  });
});

exports.cancelPaidOrder = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Connexion requise.');
  const { orderId, steps } = request.data || {};
  if (typeof orderId !== 'string') throw new HttpsError('invalid-argument', 'Commande invalide.');
  const orderRef = db.doc(`orders/${orderId}`);
  return db.runTransaction(async transaction => {
    const orderSnapshot = await transaction.get(orderRef);
    if (!orderSnapshot.exists) throw new HttpsError('not-found', 'Commande introuvable.');
    const order = orderSnapshot.data();
    const callerSnapshot = await transaction.get(db.doc(`users/${request.auth.uid}`));
    const callerRole = callerSnapshot.data()?.role;
    const now = new Date();
    const beforeNoon = now.getHours() * 60 + now.getMinutes() < 12 * 60;
    const weekKey = getWeekKey(now);
    const canCancel =
      ['admin', 'restaurant_admin', 'operator'].includes(callerRole) ||
      (order.employeeId === request.auth.uid && beforeNoon && order.paymentMethod === 'badge_card' && order.paymentStatus === 'paid');
    if (!canCancel || order.status !== 'pending') throw new HttpsError('failed-precondition', 'Commande non annulable.');
    if (order.employeeId === request.auth.uid) {
      const refundQuotaPerWeek = 3;
      const userOrdersSnapshot = await transaction.get(
        db.collection('orders').where('employeeId', '==', order.employeeId)
      );
      const refundedThisWeek = userOrdersSnapshot.docs.filter(docSnapshot => {
        if (docSnapshot.id === orderId) return false;
        const data = docSnapshot.data();
        return data.paymentStatus === 'refunded' && data.expirationGraceWeekKey === weekKey;
      }).length;
      if (refundedThisWeek >= refundQuotaPerWeek) {
        throw new HttpsError('failed-precondition', 'Quota hebdomadaire de remboursement atteint.');
      }
    }
    const userRef = db.doc(`users/${order.employeeId}`);
    const refundRef = db.collection('cashTransactions').doc(`refund-${orderId}`);
    const mealRefs = order.items.map(item => db.doc(`meals/${item.meal.id}`));
    const mealSnapshots = await Promise.all(mealRefs.map(mealRef => transaction.get(mealRef)));
    order.items.forEach((item, index) => {
      const mealRef = mealRefs[index];
      const mealSnapshot = mealSnapshots[index];
      if (mealSnapshot.exists) transaction.update(mealRef, { stock: mealSnapshot.data().stock + item.quantity });
    });
    transaction.update(userRef, { walletBalance: FieldValue.increment(order.total) });
    transaction.update(orderRef, {
      status: 'cancelled',
      paymentStatus: 'refunded',
      expirationGraceUsed: false,
      expirationGraceWeekKey: weekKey,
      steps: Array.isArray(steps) ? steps : order.steps,
    });
    transaction.set(refundRef, {
      id: refundRef.id,
      employeeId: order.employeeId,
      employeeName: order.employeeName,
      badgeNumber: order.badgeNumber,
      amount: order.total,
      method: 'cash',
      cashierId: request.auth.uid,
      cashierName: callerSnapshot.data()?.name || 'Système CHNCAK',
      createdAt: new Date().toISOString(),
      note: `Remboursement sécurisé annulation/modification avant 12h - commande ${orderId}`,
      correctionOf: orderId,
      correctionReason: 'Annulation/modification avant 12h autorisée',
    });
    return { orderId };
  });
});

exports.adjustBadgeBalance = onCall(async (request) => {
  const cashier = await requireAccountant(request);
  const { employeeId, targetBalance, reason } = request.data || {};
  if (typeof employeeId !== 'string' || !Number.isInteger(targetBalance) || targetBalance < 0 || typeof reason !== 'string' || reason.trim().length < 5) {
    throw new HttpsError('invalid-argument', 'Correction de solde invalide. Motif obligatoire.');
  }
  const maxBadgeBalance = await getMaxBadgeBalance();
  if (targetBalance > maxBadgeBalance) throw new HttpsError('failed-precondition', `Plafond badge dépassé (${maxBadgeBalance} FCFA).`);

  const employeeRef = db.doc(`users/${employeeId}`);
  const transactionRef = db.collection('cashTransactions').doc();
  return db.runTransaction(async transaction => {
    const employeeSnapshot = await transaction.get(employeeRef);
    if (!employeeSnapshot.exists) throw new HttpsError('not-found', 'Personnel introuvable.');
    const employee = employeeSnapshot.data();
    const currentBalance = Number(employee.walletBalance || 0);
    const difference = targetBalance - currentBalance;
    if (difference === 0) throw new HttpsError('failed-precondition', 'Solde inchangé.');
    const createdAt = new Date().toISOString();
    const adjustment = {
      id: transactionRef.id,
      employeeId,
      employeeName: employee.name,
      badgeNumber: employee.badgeNumber,
      amount: difference,
      method: 'cash',
      cashierId: request.auth.uid,
      cashierName: cashier.name || request.auth.token.email || 'Comptable',
      createdAt,
      note: `Correction solde badge: ${currentBalance} -> ${targetBalance} FCFA`,
      correctionOf: `wallet-${employeeId}-${Date.now()}`,
      correctionReason: reason.trim(),
    };
    transaction.update(employeeRef, { walletBalance: targetBalance });
    transaction.set(transactionRef, adjustment);
    return adjustment;
  });
});
exports.getAccountingReportTransactions = onCall(async (request) => {
  await requireAccountant(request);
  const { startIso, endIso } = request.data || {};
  const start = new Date(startIso || '');
  const end = new Date(endIso || '');
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start > end) {
    throw new HttpsError('invalid-argument', 'Periode comptable invalide.');
  }
  const maxRangeMs = 370 * 24 * 60 * 60 * 1000;
  if (end.getTime() - start.getTime() > maxRangeMs) {
    throw new HttpsError('invalid-argument', 'Periode trop longue pour le rapport comptable.');
  }
  const snapshot = await db.collection('cashTransactions')
    .where('createdAt', '>=', start.toISOString())
    .where('createdAt', '<=', end.toISOString())
    .orderBy('createdAt', 'asc')
    .get();
  return snapshot.docs.map(docSnapshot => {
    const data = docSnapshot.data();
    return { ...data, id: data.id || docSnapshot.id };
  });
});
exports.getAccountingReportOrders = onCall(async (request) => {
  await requireAccountant(request);
  const { startIso, endIso } = request.data || {};
  const start = new Date(startIso || '');
  const end = new Date(endIso || '');
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start > end) {
    throw new HttpsError('invalid-argument', 'Periode comptable invalide.');
  }
  const maxRangeMs = 370 * 24 * 60 * 60 * 1000;
  if (end.getTime() - start.getTime() > maxRangeMs) {
    throw new HttpsError('invalid-argument', 'Periode trop longue pour le rapport comptable.');
  }
  const snapshot = await db.collection('orders')
    .where('createdAt', '>=', start.toISOString())
    .where('createdAt', '<=', end.toISOString())
    .orderBy('createdAt', 'asc')
    .get();
  return snapshot.docs.map(docSnapshot => {
    const data = docSnapshot.data();
    return { ...data, id: data.id || docSnapshot.id };
  });
});




