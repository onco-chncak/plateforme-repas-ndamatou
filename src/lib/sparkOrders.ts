import { doc, runTransaction, serverTimestamp, type Firestore } from 'firebase/firestore';
import type { Order, Meal, UserProfile } from '../types';
import { FEE_POLICY } from '@ndamatou/finance';

export const getSparkOrderDay = (start: string, now = Date.now()) => {
  const [hour, minute] = start.split(':').map(Number);
  return Math.floor((now - (hour * 60 + minute) * 60000) / 86400000);
};

export const createSparkPaidOrder = async (db: Firestore, actorId: string, input: Order) => {
  if (input.employeeId !== actorId || !input.items.length || input.items.length > 2 || new Set(input.items.map(item=>item.meal.id)).size !== input.items.length) {
    throw new Error('Choisissez un ou deux articles différents pour votre propre badge.');
  }
  const orderRef = doc(db, 'orders', input.id);
  return runTransaction(db, async transaction => {
    const previous = await transaction.get(orderRef);
    const userRef = doc(db, 'users', actorId);
    const [userSnapshot, settingsSnapshot] = await Promise.all([transaction.get(userRef), transaction.get(doc(db,'settings','institution'))]);
    if (!userSnapshot.exists()) throw new Error('Profil introuvable.');
    const user = userSnapshot.data() as UserProfile;
    const settings = settingsSnapshot.data() || {};
    const mealSnapshots = await Promise.all(input.items.map(item=>transaction.get(doc(db,'meals',item.meal.id))));
    if (previous.exists()) {
      const saved = previous.data() as Order;
      if (saved.employeeId !== actorId || saved.total !== input.total || JSON.stringify(saved.items.map(i=>[i.meal.id,i.quantity])) !== JSON.stringify(input.items.map(i=>[i.meal.id,i.quantity]))) throw new Error('Identifiant de commande déjà utilisé.');
      return {order:saved,profilePatch:user,stocks:Object.fromEntries(mealSnapshots.map(meal=>[meal.id,Number(meal.data()?.stock || 0)]))};
    }
    if (user.badgeBlocked || ['pending','blocked'].includes(user.status || '')) throw new Error('Badge non actif.');
    const now = Date.now();
    const day = getSparkOrderDay(String(settings.orderWindowStart || '00:00'),now);
    const oldQuantity = user.orderCounterDay === day ? Number(user.regularPortionsToday || 0) : 0;
    const oldHot = user.orderCounterDay === day ? Number(user.hotPortionsToday || 0) : 0;
    const maximum = Number(settings.maxItemsPerOrder || 2);
    const realPrice = Number(settings.realMealPrice ?? 1000);
    const staffPrice = Number(settings.staffMealPrice ?? 500);
    if (!Number.isSafeInteger(realPrice) || !Number.isSafeInteger(staffPrice) || realPrice <= 0 || staffPrice < 0 || staffPrice > realPrice) throw new Error('Tarifs institutionnels invalides.');
    let quantity=0, hot=0, specialQuantity=0, baseTotal=0;
    const stocks: Record<string,number> = {};
    const items = input.items.map((item,index)=>{
      const snapshot=mealSnapshots[index];
      if (!snapshot.exists()) throw new Error('Plat introuvable.');
      const meal={...snapshot.data(),id:snapshot.id} as Meal;
      if (!Number.isSafeInteger(item.quantity) || item.quantity <= 0 || item.quantity > maximum || meal.stock < item.quantity || meal.isNextDay || meal.isAvailableToday === false) throw new Error('Quantité ou stock indisponible pour '+meal.name+'.');
      const isSpecial = meal.mealType === 'special_dinner';
      if (isSpecial && (!settings.specialDinnerEnabled || input.orderType !== 'special_dinner')) throw new Error('Dîner spécial non disponible.');
      if (input.orderType === 'special_dinner' && meal.category === 'plat' && !isSpecial) throw new Error('Séparez les plats ordinaires du dîner spécial.');
      if (meal.category !== 'plat' && settings.extrasOrderingEnabled !== true) throw new Error('Les suppléments ne sont pas ouverts à la commande.');
      const isHot = meal.category === 'plat' && !isSpecial;
      const unit = isHot ? realPrice : Number(meal.price);
      if (!Number.isSafeInteger(unit) || unit < 0) throw new Error('Prix de plat invalide.');
      specialQuantity+=isSpecial?item.quantity:0; quantity+=item.quantity; hot+=isHot?item.quantity:0; baseTotal+=unit*item.quantity;
      stocks[meal.id]=meal.stock-item.quantity;
      return {meal,quantity:item.quantity};
    });
    if (input.orderType === 'special_dinner' && specialQuantity === 0) throw new Error('Un dîner spécial doit contenir un plat de dîner spécial.');
    const regular = input.orderType !== 'special_dinner' ? quantity : 0;
    if (quantity > maximum || oldQuantity + regular > maximum) throw new Error('Quota de portions atteint pour cette journée.');
    const extra = Number(user.extraSubsidyCredits || 0);
    const extraUsed = !user.subsidyExcluded && !user.alwaysStaffMealPrice && hot > 0 && oldHot > 0 && extra > 0 ? 1 : 0;
    const subsidized = user.subsidyExcluded ? 0 : user.alwaysStaffMealPrice ? hot : hot > 0 && (oldHot === 0 || extra > 0) ? 1 : 0;
    const deliveryFee = input.fulfillmentMode === 'delivery' && settings.deliveryFeeEnabled === true ? Number(settings.deliveryFeeAmount || 0) : 0;
    const total = baseTotal - subsidized * (realPrice-staffPrice) + (settings.deliveryFeePayer === 'employee' ? deliveryFee : 0);
    if (total !== input.total || total <= 0) throw new Error('Le tarif du panier a changé. Actualisez le panier avant de confirmer.');
    if (user.walletBalance < total) throw new Error('Solde insuffisant.');
    const profilePatch = {walletBalance:user.walletBalance-total,lastPaidOrderId:input.id,orderCounterDay:day,regularPortionsToday:oldQuantity+regular,hotPortionsToday:oldHot+hot,extraSubsidyCredits:extra-extraUsed};
    const order = {...input,employeeName:user.name,employeeEmail:String(user.email || ''),employeePhone:String(user.phone || ''),badgeNumber:String(user.badgeNumber || ''),department:String(user.department || ''),building:String(user.building || ''),floor:String(user.floor || ''),room:String(user.room || ''),steps:[{status:'pending' as const,title:'Commande validée',description:'Montant débité de votre badge de manière sécurisée.',timestamp:input.createdAt}],items,total,alwaysStaffMealPrice:Boolean(user.alwaysStaffMealPrice),subsidyExcluded:Boolean(user.subsidyExcluded),createdAtMillis:Date.parse(input.createdAt),serverCreatedAt:serverTimestamp(),orderCounterDay:day,regularPortions:regular,hotPortions:hot,extraCreditsUsed:extraUsed};
    Object.assign(order, { settlement: { policy: FEE_POLICY, staffBase: baseTotal - subsidized * (realPrice - staffPrice), hospitalBase: subsidized * (realPrice - staffPrice) } });
    transaction.update(userRef,profilePatch);
    transaction.set(orderRef,order);
    mealSnapshots.forEach(meal=>transaction.update(meal.ref,{stock:stocks[meal.id]}));
    return {order:order as Order,profilePatch,stocks};
  });
};
