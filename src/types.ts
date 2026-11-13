export type MealCategory = 'entrée' | 'plat' | 'dessert' | 'boisson';
export type MealType = 'regular' | 'special_dinner';
export type VoteScope = 'daily' | 'weekly';

export interface Meal {
  id: string;
  name: string;
  description: string;
  category: MealCategory;
  price: number;
  stock: number;
  maxStock: number;
  tokenColor?: string;
  deliveredToday?: number;
  deliveredDateKey?: string;
  pickupDeliveredToday?: number;
  deliveryDeliveredToday?: number;
  image: string;
  isNextDay: boolean; // Proposed for tomorrow
  votesNextDay?: number; // Votes from employees for this next-day meal
  votedBy?: string[]; // Employee IDs who voted for this next-day meal
  mealType?: MealType;
  voteScope?: VoteScope;
  isAvailableToday: boolean;
  calories: number;
  allergens: string[];
}

export type OrderStatus = 'pending' | 'preparing' | 'delivering' | 'delivered' | 'returned' | 'cancelled' | 'expired';

export interface OrderItem {
  meal: Meal;
  quantity: number;
}

export interface OrderHistoryStep {
  status: OrderStatus;
  title: string;
  description: string;
  timestamp: string;
}

export interface Order {
  settlement?: { policy: 'shared_510_505_v1'; staffBase: number; hospitalBase: number };
  id: string;
  employeeId: string;
  employeeName: string;
  employeeEmail: string;
  employeePhone: string;
  badgeNumber: string;
  department: string;
  building: string;
  floor: string;
  room: string;
  fulfillmentMode?: 'pickup' | 'delivery';
  deliveryAuthorizedById?: string;
  deliveryAuthorizedByName?: string;
  deliveryAuthorizedByService?: string;
  deliveryAuthorizationUsedAt?: string;
  deliveryFeeEnabled?: boolean;
  deliveryFeeAmount?: number;
  deliveryFeePayer?: 'employee' | 'hospital';
  subsidyExcluded?: boolean;
  alwaysStaffMealPrice?: boolean;
  items: OrderItem[];
  total: number;
  status: OrderStatus;
  paymentMethod: 'badge_card' | 'online_card' | 'cash';
  paymentStatus: 'pending' | 'paid' | 'refunded';
  createdAt: string;
  clientCreatedAt?: string;
  serverCreatedAt?: string | { toDate?: () => Date; seconds?: number; nanoseconds?: number };
  deliveryTime?: string;
  deliveredById?: string;
  deliveredByName?: string;
  deliveredByRole?: string;
  deliveredVia?: string;
  restaurantExitedAt?: string;
  expirationGraceUsed?: boolean;
  expirationGraceWeekKey?: string;
  notes?: string;
  orderType?: 'regular' | 'special_dinner';
  steps: OrderHistoryStep[];
}

export interface UserProfile {
  id: string;
  createdAt?: string;
  name: string;
  email: string;
  phone: string;
  badgeNumber: string;
  department: string;
  building: string;
  floor: string;
  room: string;
  orderCounterDay?: number;
  regularPortionsToday?: number;
  hotPortionsToday?: number;
  lastPaidOrderId?: string;
  walletBalance: number; // For badge_card payment
  role: 'employee' | 'restaurant_admin' | 'admin' | 'accountant' | 'delivery' | 'hr' | 'operator';
  hrAccess?: boolean;
  accountantAccess?: boolean;
  employmentType?: string;
  contractEndDate?: string;
  verificationFlagged?: boolean;
  verificationFlaggedAt?: string;
  verificationFlaggedBy?: string;
  validatedById?: string;
  validatedByName?: string;
  validatedAt?: string;
  subsidyExcluded?: boolean;
  alwaysStaffMealPrice?: boolean;
  extraSubsidyCredits?: number;
  deliveryAllowed?: boolean;
  deliveryCodeViewer?: boolean;
  deliveryVisibleDepartments?: string[];
  deliverySelectionDailyLimit?: number;
  deliveryPreAuthorizedUntil?: string;
  deliveryPreAuthorizedById?: string;
  deliveryPreAuthorizedByName?: string;
  deliveryPreAuthorizedScope?: 'daily' | 'weekly' | 'monthly' | 'permanent';
  status?: 'pending' | 'active' | 'blocked';
  badgeBlocked?: boolean;
  photoUrl?: string;
  whatsappOptIn?: boolean;
}

export interface CashTransaction {
  id: string;
  employeeId: string;
  employeeName: string;
  badgeNumber: string;
  amount: number;
  method: 'cash' | 'wave' | 'orange_money';
  feePolicy?: 'shared_510_505_v1';
  grossAmount?: number;
  processorFeeCents?: number;
  netReceivedCents?: number;
  waveFeeRate?: number;
  waveFeeAmount?: number;
  cashierId: string;
  cashierName: string;
  createdAt: string;
  note?: string;
  balanceAfter?: number;
  correctionOf?: string;
  correctionReason?: string;
}

export interface WaveTopupRequest {
  id: string;
  employeeId: string;
  employeeName: string;
  badgeNumber: string;
  phone: string;
  amount: number;
  reference: string;
  merchantNumber: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  cancelledBy?: string;
  cancelledAt?: unknown;
  createdAt: string;
  validatedAt?: string;
  validatedBy?: string;
}

export interface PrepaidCard {
  id: string;
  code: string;
  amount: number;
  employeeId: string;
  employeeName: string;
  badgeNumber: string;
  cashierId: string;
  cashierName: string;
  status: 'active' | 'used' | 'cancelled';
  createdAt: string;
  usedAt?: string;
  usedBy?: string;
}

export type NotificationType = 'info' | 'success' | 'warning' | 'alert';

export interface AppNotification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: NotificationType;
  timestamp: string;
  read: boolean;
  orderId?: string;
}

export interface DailyStats {
  date: string;
  revenue: number;
  ordersCount: number;
  averageCart: number;
  mealsStocked: number;
}

