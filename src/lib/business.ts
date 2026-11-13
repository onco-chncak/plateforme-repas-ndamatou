import type { Order } from '../types';

export const DEFAULT_REAL_MEAL_PRICE = 1000;
export const DEFAULT_HOSPITAL_SUPPORT = 500;
export const DEFAULT_STAFF_MEAL_PRICE = 500;

const MEAL_VISUALS: Record<string, string> = {
  Plat: '🍽️',
  Assiette: '🍽️',
  Menu: '🍛',
  Viande: '🥩',
  Poisson: '🐟',
  Poulet: '🍗',
  Salade: '🥗',
  Soupe: '🥣',
  Boisson: '🥤',
  Dessert: '🍰',
  Pastels: '🥟',
  Curry: '🍛',
  Crevettes: '🍤',
  Crème: '🍮',
};

export const getMealVisual = (visual: string) => {
  const fixedVisuals: Record<string, string> = {
    Plat: '🍽️',
    Assiette: '🍽️',
    Menu: '🍛',
    Viande: '🥩',
    Poisson: '🐟',
    Poulet: '🍗',
    Salade: '🥗',
    Soupe: '🥣',
    Boisson: '🥤',
    Dessert: '🍰',
    Pastels: '🥟',
    Curry: '🍛',
    Crevettes: '🍤',
    Crème: '🍮',
  };
  if (fixedVisuals[visual]) return fixedVisuals[visual];
  const cleanVisuals: Record<string, string> = {
    Plat: '🍽️',
    Assiette: '🍽️',
    Menu: '🍛',
    Viande: '🥩',
    Poisson: '🐟',
    Poulet: '🍗',
    Salade: '🥗',
    Soupe: '🥣',
    Boisson: '🥤',
    Dessert: '🍰',
    Pastels: '🥟',
    Curry: '🍛',
    Crevettes: '🍤',
    Crème: '🍮',
    'CrÃ¨me': '🍮',
  };
  if (!visual) return cleanVisuals.Plat;
  if (cleanVisuals[visual]) return cleanVisuals[visual];
  if (!visual) return '🍽️';
  return MEAL_VISUALS[visual] || visual;
};

export type AccountingPrices = {
  real: number;
  hospital: number;
  staff: number;
  legacy?: { real: number; hospital: number; staff: number };
};

export type AccountingTotals = {
  staffPaid: number;
  hospitalSupport: number;
  quantity: number;
  subsidizedQuantity: number;
  fullPriceQuantity: number;
};

export type OrderAccountingEntry = {
  order: Order;
  accounting: AccountingTotals;
};

export type OrderLifecycleMetrics = {
  cancelledOrders: number;
  modifiedOrders: number;
};

export const isModifiedOrder = (order: Order) =>
  order.status === 'cancelled' &&
  Array.isArray(order.steps) &&
  order.steps.some(step => /commande chang|commande remplace|remplac/i.test(`${step.title || ''} ${step.description || ''}`));

export const calculateOrderLifecycleMetrics = (sourceOrders: Order[]): OrderLifecycleMetrics => {
  const modifiedOrders = sourceOrders.filter(isModifiedOrder).length;
  const cancelledOrders = sourceOrders.filter(order => order.status === 'cancelled' && !isModifiedOrder(order)).length;
  return { cancelledOrders, modifiedOrders };
};

export const getLocalDateKey = (value: Date | string = new Date()) => {
  const date = value instanceof Date ? value : new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const getOperationalDateKey = (
  value: Date | string = new Date(),
  dayStart = '00:00',
) => {
  const date = value instanceof Date ? new Date(value) : new Date(value);
  const [startHourRaw, startMinuteRaw] = dayStart.split(':').map(Number);
  const startHour = Number.isFinite(startHourRaw) ? startHourRaw : 0;
  const startMinute = Number.isFinite(startMinuteRaw) ? startMinuteRaw : 0;
  const startTotal = startHour * 60 + startMinute;
  const currentTotal = date.getHours() * 60 + date.getMinutes();
  if (startTotal > 0 && currentTotal < startTotal) {
    date.setDate(date.getDate() - 1);
  }
  return getLocalDateKey(date);
};

export const isPaidAccountingOrder = (order: Order) =>
  order.orderType !== 'special_dinner' &&
  order.status !== 'cancelled' &&
  order.paymentStatus === 'paid';

export const getOrderAccounting = (
  order: Order,
  prices: AccountingPrices,
  allowSubsidy = true,
): AccountingTotals => {
  if (!order.settlement && prices.legacy) prices = prices.legacy;
  let subsidyUsed = !allowSubsidy;
  if (order.subsidyExcluded) subsidyUsed = true;
  const forceStaffPrice = Boolean(order.alwaysStaffMealPrice);

  const totals = order.items.reduce<AccountingTotals>((totals, item) => {
    const price = item.meal.category === 'plat' ? prices.real : (item.meal.price || prices.real);
    const isRegularHotMeal = order.orderType !== 'special_dinner' && item.meal.category === 'plat' && item.meal.mealType !== 'special_dinner';
    if (forceStaffPrice && isRegularHotMeal) {
      return {
        staffPaid: totals.staffPaid + prices.staff * item.quantity,
        hospitalSupport: totals.hospitalSupport + Math.max(0, prices.real - prices.staff) * item.quantity,
        quantity: totals.quantity + item.quantity,
        subsidizedQuantity: totals.subsidizedQuantity + item.quantity,
        fullPriceQuantity: totals.fullPriceQuantity,
      };
    }
    const subsidized =
      order.orderType !== 'special_dinner' &&
      item.meal.category === 'plat' &&
      item.meal.mealType !== 'special_dinner' &&
      item.quantity >= 1 &&
      !subsidyUsed;

    if (subsidized) subsidyUsed = true;
    const fullPriceQuantity = item.quantity - (subsidized ? 1 : 0);

    return {
      staffPaid: totals.staffPaid + (subsidized ? prices.staff : price) + Math.max(0, item.quantity - 1) * price,
      hospitalSupport: totals.hospitalSupport + (subsidized ? prices.hospital : 0),
      quantity: totals.quantity + item.quantity,
      subsidizedQuantity: totals.subsidizedQuantity + (subsidized ? 1 : 0),
      fullPriceQuantity: totals.fullPriceQuantity + fullPriceQuantity,
    };
  }, {
    staffPaid: 0,
    hospitalSupport: 0,
    quantity: 0,
    subsidizedQuantity: 0,
    fullPriceQuantity: 0,
  });
  if (order.settlement?.policy === 'shared_510_505_v1') {
    totals.staffPaid = order.settlement.staffBase;
    totals.hospitalSupport = order.settlement.hospitalBase;
  }
  return totals;
};

export const calculateOrdersAccounting = (
  sourceOrders: Order[],
  prices: AccountingPrices,
  operationalDayStart = '19:00',
): AccountingTotals => {
  return calculateOrdersAccountingEntries(sourceOrders, prices, operationalDayStart).reduce<AccountingTotals>((totals, entry) => ({
    staffPaid: totals.staffPaid + entry.accounting.staffPaid,
    hospitalSupport: totals.hospitalSupport + entry.accounting.hospitalSupport,
    quantity: totals.quantity + entry.accounting.quantity,
    subsidizedQuantity: totals.subsidizedQuantity + entry.accounting.subsidizedQuantity,
    fullPriceQuantity: totals.fullPriceQuantity + entry.accounting.fullPriceQuantity,
  }), {
    staffPaid: 0,
    hospitalSupport: 0,
    quantity: 0,
    subsidizedQuantity: 0,
    fullPriceQuantity: 0,
  });
};

export const calculateOrdersAccountingEntries = (
  sourceOrders: Order[],
  prices: AccountingPrices,
  operationalDayStart = '19:00',
): OrderAccountingEntry[] => {
  const subsidizedAgentDays = new Set<string>();

  return [...sourceOrders]
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .map(order => {
      const subsidyKey = `${order.employeeId}-${getOperationalDateKey(order.createdAt, operationalDayStart)}`;
      const accounting = getOrderAccounting(order, prices, !subsidizedAgentDays.has(subsidyKey));
      if (accounting.subsidizedQuantity > 0) subsidizedAgentDays.add(subsidyKey);
      return { order, accounting };
    });
};

