import { getSparkOrderDay } from '../lib/sparkOrders';
import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ShoppingBag,
  Plus,
  Minus,
  Search,
  Building2,
  CreditCard,
  CheckCircle,
  Vote,
  History,
  Calendar,
  Flame,
  Coins,
  ChevronRight,
  User,
  MapPin,
  Smartphone,
  Info,
  SlidersHorizontal,
  ThumbsUp,
  X,
  Printer,
  QrCode,
  MessageCircle,
  CreditCard as ShieldCheck
} from 'lucide-react';
import { CashTransaction, Meal, Order, UserProfile, MealCategory, OrderItem, OrderStatus, WaveTopupRequest } from '../types';
import jsQR from '../vendor/jsQR.mjs';
import { db, isConfigured } from '../lib/firebase';
import { collection, doc, getDoc, onSnapshot, query, setDoc, where } from 'firebase/firestore';
import { CHNCAK_BUILDINGS, CHNCAK_FLOORS, CHNCAK_SERVICES } from '../data/hospitalOptions';
import { getLocalDateKey, getMealVisual } from '../lib/business';
import { getPersonalDeliveryCode } from '../lib/deliveryCodes';

const WaveLogo = ({ compact = false }: { compact?: boolean }) => (
  <span className={`inline-flex items-center justify-center rounded-full bg-[#1dc8ff] text-[#072b6f] font-black ${compact ? 'px-2 py-1 text-[10px]' : 'px-3 py-1.5 text-xs'}`}>
    Wave
  </span>
);

const WhatsAppLogo = () => (
  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white text-blue-600">
    <svg viewBox="0 0 32 32" aria-hidden="true" className="h-4 w-4 fill-current">
      <path d="M16.04 3.2C9.02 3.2 3.32 8.9 3.32 15.92c0 2.24.59 4.42 1.72 6.34L3.2 28.8l6.7-1.76a12.7 12.7 0 0 0 6.14 1.56h.01c7.02 0 12.72-5.7 12.72-12.72S23.06 3.2 16.04 3.2Zm0 23.25h-.01c-1.9 0-3.76-.51-5.38-1.48l-.39-.23-3.97 1.04 1.06-3.87-.25-.4a10.5 10.5 0 0 1-1.62-5.59c0-5.83 4.74-10.57 10.58-10.57 2.82 0 5.48 1.1 7.47 3.1a10.5 10.5 0 0 1 3.1 7.48c0 5.83-4.75 10.56-10.59 10.56Zm5.8-7.91c-.32-.16-1.88-.93-2.17-1.03-.29-.11-.5-.16-.72.16-.21.32-.82 1.03-1 1.24-.19.21-.37.24-.69.08-.32-.16-1.34-.49-2.55-1.57-.94-.84-1.58-1.88-1.76-2.19-.19-.32-.02-.49.14-.65.14-.14.32-.37.48-.56.16-.19.21-.32.32-.53.11-.21.05-.4-.03-.56-.08-.16-.72-1.73-.98-2.37-.26-.62-.52-.54-.72-.55h-.61c-.21 0-.56.08-.85.4-.29.32-1.12 1.09-1.12 2.66s1.15 3.09 1.31 3.3c.16.21 2.26 3.45 5.48 4.84.77.33 1.36.52 1.83.67.77.24 1.47.21 2.02.13.62-.09 1.88-.77 2.15-1.51.27-.74.27-1.38.19-1.51-.08-.13-.29-.21-.61-.37Z" />
    </svg>
  </span>
);

const normalizeDigits = (value?: string) => String(value || '').replace(/\D/g, '');


type IdeaBoxMessage = {
  id: string;
  authorId: string;
  authorName: string;
  department: string;
  text: string;
  timestamp: string;
};

type DeliveryCodeIssuer = {
  id: string;
  name: string;
  department: string;
  enabled: boolean;
};

const satisfactionLikertChoices = [
  "Tout à fait d'accord",
  "D'accord",
  'Indifférent(e)',
  "Pas d'accord",
  "Absolument pas d'accord",
];

const satisfactionStatements = [
  { key: 'hotMeals', label: 'Les repas sont servis bien chauds.' },
  { key: 'variety', label: 'Le menu contient une grande variété de repas.' },
  { key: 'quality', label: 'Les repas sont de très bonne qualité.' },
  { key: 'taste', label: 'Les repas sont délicieux et bien assaisonnés.' },
  { key: 'completeOrder', label: 'Ma commande de repas était correcte et complète.' },
  { key: 'patientServers', label: 'Les serveurs/euses sont patients pendant la commande.' },
  { key: 'quickService', label: "J'ai été servi(e) immédiatement." },
  { key: 'politeStaff', label: 'Le personnel était amical et poli.' },
  { key: 'fairPrices', label: 'Les prix sont convenables.' },
  { key: 'outsideClean', label: "L'extérieur du restaurant est propre." },
  { key: 'insideClean', label: "L'intérieur du restaurant est propre." },
];

const getDailyRestaurantCode = (date: Date) => {
  const dayKey = getLocalDateKey(date).replace(/-/g, '');
  const checksum = [...dayKey].reduce((sum, char, index) => sum + Number(char) * (index + 3), 17);
  return `R${dayKey.slice(4)}${checksum.toString(36).toUpperCase().padStart(2, '0')}`;
};
const getDailyRestaurantExitCode = (_date: Date) => 'SORTIE';
const isTrueFlag = (value: unknown) =>
  value === true ||
  value === 1 ||
  (typeof value === 'string' && ['true', '1', 'oui', 'yes', 'blocked', 'bloque', 'bloqué'].includes(value.trim().toLowerCase()));

const isPersonnelProfile = (profile: UserProfile) =>
  profile.role === 'employee' ||
  (!profile.role && Boolean(profile.badgeNumber || profile.phone)) ||
  (
    Boolean(profile.badgeNumber || profile.phone) &&
    !['admin', 'restaurant_admin', 'accountant', 'delivery', 'operator'].includes(String(profile.role || ''))
  );
const normalizeServiceLabel = (service: string) => {
  const clean = String(service || '').trim();
  const folded = clean.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if ([
    'gyneco',
    'gynecologie',
    'gyneco/maternite',
    'gynecologie/maternite',
    'gyneco/meternite',
    'gynecologie/meternite',
    'gynoc/meternite',
    'gynocologie',
    'gycologie',
    'gycologie/',
    'gycologie/maternite',
  ].includes(folded.replace(/\s*\/\s*/g, '/'))) {
    return 'Gynécologie';
  }
  return clean;
};
const getTokenColorClass = (color = '') => {
  const styles: Record<string, string> = {
    Rouge: 'bg-red-100 text-red-800 border-red-300',
    Bleu: 'bg-blue-100 text-blue-800 border-blue-300',
    Vert: 'bg-blue-100 text-blue-800 border-blue-300',
    Jaune: 'bg-yellow-100 text-yellow-900 border-yellow-300',
    Orange: 'bg-orange-100 text-orange-800 border-orange-300',
    Violet: 'bg-violet-100 text-violet-800 border-violet-300',
    Rose: 'bg-pink-100 text-pink-800 border-pink-300',
    Blanc: 'bg-white text-slate-900 border-slate-300',
    Noir: 'bg-slate-900 text-white border-slate-700',
  };
  return styles[color] || 'bg-slate-100 text-slate-700 border-slate-200';
};
const getOrderFailureMessage = (error: unknown) => {
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code?: unknown }).code || '')
    : '';
  const errorMessage = error instanceof Error ? error.message.trim() : '';
  const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
  const isTemporaryNetworkFailure = [
    'network-request-failed',
    'unavailable',
    'deadline-exceeded',
    'aborted',
    'internal',
    'resource-exhausted',
    'unknown',
  ].some(value => code.includes(value));

  if (isOffline) {
    return "Connexion Internet indisponible. Vérifiez votre réseau puis réessayez. Votre badge et les portions restent inchangés.";
  }
  if (code.includes('resource-exhausted')) {
    return "Le quota gratuit Firebase est atteint ou temporairement limité. Réessayez plus tard et contactez l’administrateur si le problème persiste. Aucune nouvelle opération ne peut être confirmée tant que Firebase refuse les écritures.";
  }
  if (isTemporaryNetworkFailure) {
    return "La liaison sécurisée avec Firebase est temporairement indisponible, même si Internet fonctionne. Réessayez dans quelques secondes ou changez de réseau. Votre badge et les portions restent inchangés.";
  }
  if (errorMessage && !errorMessage.toLowerCase().includes('firebase')) {
    return `${errorMessage} La commande n'a pas été enregistrée : votre badge et les portions restent inchangés.`;
  }
  return "Firebase n'a pas accepté la commande. Vérifiez votre connexion puis réessayez. Votre badge et les portions restent inchangés.";
};

interface EmployeeViewProps {
  meals: Meal[];
  activeProfile: UserProfile;
  profiles: UserProfile[];
  services?: string[];
  isFirebaseMode?: boolean;
  sparkMode?: boolean;
  badgeSyncInProgress?: boolean;
  deliveryAccessCode?: string;
  deliveryAccessCodeExpiresAt?: string;
  deliveryCodeSeed?: string;
  deliveryCodeMaxUsesPer24h?: number;
  deliveryAuthorizationMode?: 'codes' | 'selection';
  deliveryFeeEnabled?: boolean;
  deliveryFeeAmount?: number;
  deliveryFeePayer?: 'employee' | 'hospital';
  deliverySelectionStart?: string;
  deliverySelectionEnd?: string;
  deliveryServiceDailyQuotas?: Record<string, number>;
  lateOrderPhone?: string;
  waveMerchantNumber?: string;
  wavePaymentLink?: string;
  waveFeeNotice?: string;
  waveTopupEnabled?: boolean;
  prepaidCardEnabled?: boolean;
  refundBeforeNoonEnabled?: boolean;
  accountantContactEnabled?: boolean;
  accountantContactName?: string;
  accountantContactPhone?: string;
  extrasOrderingEnabled?: boolean;
  specialDinnerEnabled?: boolean;
  orderWindowEnabled?: boolean;
  orderWindowStart?: string;
  orderWindowEnd?: string;
  weekendOrderingClosed?: boolean;
  unclaimedExpirationEnabled?: boolean;
  unclaimedExpirationTime?: string;
  unclaimedGraceEnabled?: boolean;
  unclaimedGracePerWeek?: number;
  realMealPrice?: number;
  hospitalSupportAmount?: number;
  staffMealPrice?: number;
  maxItemsPerOrder?: number;
  officialResetAt?: string;
  maxActiveHotMealsPerDay?: number;
  restaurantCapacity?: number;
  restaurantOccupancy?: number;
  restaurantPlacesLoaded?: boolean;
  onRequestRestaurantPlaces?: () => void;
  restaurantExitQrEnabled?: boolean;
  isActiveRestaurantPresence?: boolean;
  restaurantPresenceStartedAt?: string;
  restaurantPresenceExpiresAt?: string;
  restaurantPresenceReminderEnabled?: boolean;
  restaurantPresenceReminderMinutes?: number;
  onUpdateProfile: (updated: UserProfile) => void;
  onChangePassword?: (newPassword: string) => Promise<void> | void;
  orders: Order[];
  cashTransactions?: CashTransaction[];
  onCreateOrder: (order: Order) => Promise<void> | void;
  onConfirmPickupOrder: (orderId: string) => Promise<boolean> | boolean;
  onSetRestaurantPresence?: (profile: UserProfile, active: boolean) => Promise<void> | void;
  onCancelOrder: (orderId: string, options?: { replacement?: boolean }) => Promise<boolean> | boolean;
  onChangeOrderToDelivery: (
    orderId: string,
    authorization: { issuerId: string; issuerName: string; issuerService: string }
  ) => Promise<boolean> | boolean;
  onSelectEmployeeForDelivery: (employee: UserProfile) => Promise<number>;
  onRequestWaveTopup: (request: WaveTopupRequest) => Promise<void> | void;
  waveTopupRequests: WaveTopupRequest[];
  onCancelWaveTopup: (requestId: string) => Promise<void> | void;
  onRedeemPrepaidCard: (employee: UserProfile, code: string) => Promise<void> | void;
  onVoteNextDay: (mealId: string) => void;
  addNotification: (title: string, message: string, type: 'info' | 'success' | 'warning' | 'alert', orderId?: string) => void;
}

export const EmployeeView: React.FC<EmployeeViewProps> = ({
  meals,
  activeProfile,
  profiles,
  services = CHNCAK_SERVICES,
  isFirebaseMode = false,
  sparkMode = false,
  badgeSyncInProgress = false,
  deliveryAccessCode = 'SAF2026',
  deliveryAccessCodeExpiresAt,
  deliveryCodeSeed = 'Ndamatou',
  deliveryCodeMaxUsesPer24h = 1,
  deliveryAuthorizationMode = 'codes',
  deliveryFeeEnabled = false,
  deliveryFeeAmount = 0,
  deliveryFeePayer = 'employee',
  deliverySelectionStart = '08:00',
  deliverySelectionEnd = '10:00',
  deliveryServiceDailyQuotas = {},
  lateOrderPhone = '+221 33 000 00 00',
  waveMerchantNumber = '+221 77 000 00 00',
  wavePaymentLink = 'https://pay.wave.com/m/M_sn_30W1WbHEAfU-/c/sn/',
  waveFeeNotice = "Les frais Wave sont supportés par l'agent. Si vous ne voulez pas payer de frais, déplacez-vous chez l'agent comptable et payez en espèces.",
  waveTopupEnabled = false,
  prepaidCardEnabled = false,
  refundBeforeNoonEnabled = false,
  accountantContactEnabled = true,
  accountantContactName = 'Fallou Diouf',
  accountantContactPhone = '76 434 08 62',
  extrasOrderingEnabled = false,
  specialDinnerEnabled = false,
  orderWindowEnabled = true,
  orderWindowStart = '00:00',
  orderWindowEnd = '09:00',
  weekendOrderingClosed = true,
  unclaimedExpirationEnabled = true,
  unclaimedExpirationTime = '18:00',
  unclaimedGraceEnabled = true,
  unclaimedGracePerWeek = 2,
  realMealPrice = 800,
  hospitalSupportAmount = 390,
  staffMealPrice = 410,
  maxItemsPerOrder = 2,
  officialResetAt = '',
  maxActiveHotMealsPerDay = 2,
  restaurantCapacity = 70,
  restaurantOccupancy = 0,
  restaurantPlacesLoaded = false,
  onRequestRestaurantPlaces,
  restaurantExitQrEnabled = true,
  isActiveRestaurantPresence = false,
  restaurantPresenceStartedAt,
  restaurantPresenceExpiresAt,
  restaurantPresenceReminderEnabled = true,
  restaurantPresenceReminderMinutes = 20,
  onUpdateProfile,
  onChangePassword,
  orders,
  cashTransactions = [],
  onCreateOrder,
  onConfirmPickupOrder,
  onSetRestaurantPresence,
  onCancelOrder,
  onChangeOrderToDelivery,
  onSelectEmployeeForDelivery,
  onRequestWaveTopup,
  waveTopupRequests,
  onCancelWaveTopup,
  onRedeemPrepaidCard,
  onVoteNextDay,
  addNotification,
}) => {
  // Navigation tabs inside Employee Dashboard
  const [activeTab, setActiveTab] = useState<'menu' | 'nextday' | 'history' | 'profile' | 'messages' | 'delivery-service'>('menu');
  const [showRestaurantPlaces, setShowRestaurantPlaces] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<MealCategory | 'all'>('plat');
  const [searchQuery, setSearchQuery] = useState('');
  const [historyStartDate, setHistoryStartDate] = useState('');
  const [historyEndDate, setHistoryEndDate] = useState('');
  
  // Profile Form state
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editedName, setEditedName] = useState(activeProfile.name);
  const [editedPhone, setEditedPhone] = useState(activeProfile.phone);
  const [editedBuilding, setEditedBuilding] = useState(activeProfile.building);
  const [editedFloor, setEditedFloor] = useState(activeProfile.floor);
  const [editedRoom, setEditedRoom] = useState(activeProfile.room);
  const [editedDept, setEditedDept] = useState(activeProfile.department);
  const [newPassword, setNewPassword] = useState('');
  const [presenceReminderSentFor, setPresenceReminderSentFor] = useState('');
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('');
  const [passwordMessage, setPasswordMessage] = useState('');
  const [topupAmount, setTopupAmount] = useState('5000');
  const [topupProvider] = useState<'wave'>('wave');
  const [prepaidCode, setPrepaidCode] = useState('');
  const [waveTopupDate, setWaveTopupDate] = useState(() => getLocalDateKey());
  const [waveTopupTime, setWaveTopupTime] = useState(() => new Date().toTimeString().slice(0, 5));
  const [isDeclaringWave, setIsDeclaringWave] = useState(false);
  const [isValidatingPrepaid, setIsValidatingPrepaid] = useState(false);
  const [topupActionMessage, setTopupActionMessage] = useState('');
  const [cancellingWaveId, setCancellingWaveId] = useState('');

  // Cart state
  const [cart, setCart] = useState<OrderItem[]>([]);
  const [replacementOrderCredit, setReplacementOrderCredit] = useState<null | { orderId: string; quantity: number; hotMealQuantity: number }>(null);
  const [specialNotes, setSpecialNotes] = useState('');
  const [fulfillmentMode, setFulfillmentMode] = useState<'pickup' | 'delivery'>('pickup');
  const [deliveryCodeInput, setDeliveryCodeInput] = useState('');
  const [deliveryCodeIssuers, setDeliveryCodeIssuers] = useState<DeliveryCodeIssuer[]>([]);
  const [now, setNow] = useState(new Date());
  
  // Checkout / Payment Modal state
  const [isChekoutOpen, setIsCheckoutOpen] = useState(false);
  const [paymentMethod] = useState<'badge_card'>('badge_card');
  const [onlinePhone, setOnlinePhone] = useState(activeProfile.phone);
  const [transactionReference, setTransactionReference] = useState('');
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const paymentSubmissionRef = useRef(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [createdOrderId, setCreatedOrderId] = useState('');
  const [, setOrderLedgerVersion] = useState(0);
  const [isQrPreviewOpen, setIsQrPreviewOpen] = useState(false);
  const [isRestaurantScannerOpen, setIsRestaurantScannerOpen] = useState(false);
  const [scannerMessage, setScannerMessage] = useState('');
  const [restaurantCodeInput, setRestaurantCodeInput] = useState('');
  const [restaurantExitPromptPausedUntil, setRestaurantExitPromptPausedUntil] = useState(0);
  const scannerVideoRef = useRef<HTMLVideoElement | null>(null);
  const scannerStreamRef = useRef<MediaStream | null>(null);
  const scannerControlsRef = useRef<{ stop: () => void } | null>(null);
  const [restaurantScanResult, setRestaurantScanResult] = useState<null | {
    status: 'ok' | 'error';
    title: string;
    message: string;
    order?: Order;
    orders?: Order[];
    secureCode?: string;
    validatedAt?: string;
  }>(null);
  const [autoRestaurantPresenceResultShownFor, setAutoRestaurantPresenceResultShownFor] = useState('');
  const [mealRatings, setMealRatings] = useState<Record<string, number>>(() => {
    const saved = localStorage.getItem(`chncak_meal_ratings_${activeProfile.id}`);
    return saved ? JSON.parse(saved) : {};
  });
  const [messages, setMessages] = useState<{ id: string; author: string; recipientId: string; recipientName: string; text: string; timestamp: string }[]>(() => {
    const saved = localStorage.getItem('chncak_staff_messages');
    return saved ? JSON.parse(saved) : [];
  });
  const [messageText, setMessageText] = useState('');
  const [selectedMessageRecipientId, setSelectedMessageRecipientId] = useState('');
  const [ideaText, setIdeaText] = useState('');
  const [isSendingIdea, setIsSendingIdea] = useState(false);
  const [ideaMessage, setIdeaMessage] = useState('');
  const [surveyGender, setSurveyGender] = useState('');
  const [surveyAgeRange, setSurveyAgeRange] = useState('');
  const [surveyFrequency, setSurveyFrequency] = useState('');
  const [surveyRatings, setSurveyRatings] = useState<Record<string, string>>({});
  const [surveyGlobalSatisfaction, setSurveyGlobalSatisfaction] = useState('');
  const [surveyImprovementText, setSurveyImprovementText] = useState('');
  const [surveyMessage, setSurveyMessage] = useState('');
  const [isSubmittingSurvey, setIsSubmittingSurvey] = useState(false);
  const [surveyAlreadySubmitted, setSurveyAlreadySubmitted] = useState(false);
  const [deliverySelectionMessage, setDeliverySelectionMessage] = useState('');
  const [deliverySelectionEmployeeId, setDeliverySelectionEmployeeId] = useState('');

  useEffect(() => {
    localStorage.setItem(`chncak_meal_ratings_${activeProfile.id}`, JSON.stringify(mealRatings));
  }, [activeProfile.id, mealRatings]);

  useEffect(() => {
    localStorage.setItem('chncak_staff_messages', JSON.stringify(messages));
  }, [messages]);

  useEffect(() => {
    let isMounted = true;
    const localKey = `chncak_satisfaction_survey_submitted_${activeProfile.id}`;
    const localSubmitted = localStorage.getItem(localKey) === 'true';
    setSurveyAlreadySubmitted(localSubmitted);
    if (localSubmitted) {
      setSurveyMessage('Vous avez déjà validé ce questionnaire. Merci pour votre avis.');
    }

    const verifyExistingSurvey = async () => {
      if (!isConfigured || !db) return;
      try {
        const existingSurvey = await getDoc(doc(db, 'satisfactionSurveys', `survey-${activeProfile.id}`));
        if (isMounted && existingSurvey.exists()) {
          setSurveyAlreadySubmitted(true);
          localStorage.setItem(localKey, 'true');
          setSurveyMessage('Vous avez déjà validé ce questionnaire. Merci pour votre avis.');
        }
      } catch {
        // If Firestore is temporarily unavailable, local blocking still applies.
      }
    };

    verifyExistingSurvey();
    return () => {
      isMounted = false;
    };
  }, [activeProfile.id]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  // Filtering today's available meals
  const rawRegularTodayMeals = meals.filter(m =>
    m.isAvailableToday &&
    !m.isNextDay &&
    (m.mealType || 'regular') === 'regular' &&
    Number(m.stock || 0) > 0
  );
  const regularTodayMeals = [
    ...rawRegularTodayMeals.filter(meal => meal.category === 'plat').slice(0, maxActiveHotMealsPerDay),
    ...rawRegularTodayMeals.filter(meal => meal.category !== 'plat'),
  ];
  const todayMeals = [
    ...regularTodayMeals.filter(m => m.category === 'plat'),
    ...(extrasOrderingEnabled ? regularTodayMeals.filter(m => m.category === 'entrée').slice(0, 2) : []),
    ...(extrasOrderingEnabled ? regularTodayMeals.filter(m => m.category === 'dessert').slice(0, 2) : []),
    ...(extrasOrderingEnabled ? regularTodayMeals.filter(m => m.category === 'boisson').slice(0, 2) : []),
  ];
  const todayDateKey = getLocalDateKey(now);
  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
  weekStart.setHours(0, 0, 0, 0);
  const currentWeekKey = getLocalDateKey(weekStart);
  const usedGraceThisWeek = orders.filter(order =>
    order.employeeId === activeProfile.id &&
    order.expirationGraceUsed &&
    order.expirationGraceWeekKey === currentWeekKey
  ).length;
  const remainingGraceThisWeek = Math.max(0, unclaimedGracePerWeek - usedGraceThisWeek);
  const refundedOrdersThisWeek = orders.filter(order =>
    order.employeeId === activeProfile.id &&
    order.paymentStatus === 'refunded' &&
    order.expirationGraceWeekKey === currentWeekKey
  ).length;
  const remainingRefundsThisWeek = Math.max(0, unclaimedGracePerWeek - refundedOrdersThisWeek);
  const getDeliveredToday = (meal: Meal) =>
    meal.deliveredDateKey === todayDateKey ? Math.max(0, meal.deliveredToday || 0) : 0;
  const getPickupDeliveredToday = (meal: Meal) =>
    meal.deliveredDateKey === todayDateKey ? Math.max(0, meal.pickupDeliveredToday || 0) : 0;
  const getDeliveryDeliveredToday = (meal: Meal) =>
    meal.deliveredDateKey === todayDateKey ? Math.max(0, meal.deliveryDeliveredToday || 0) : 0;
  const getPhysicalRemaining = (meal: Meal) => {
    const reservedNotDelivered = orders
      .filter(order => !['delivered', 'returned', 'cancelled', 'expired'].includes(order.status))
      .reduce((sum, order) =>
        sum + order.items
          .filter(item => item.meal.id === meal.id)
          .reduce((itemSum, item) => itemSum + item.quantity, 0),
      0);
    return Math.max(0, meal.stock + reservedNotDelivered);
  };
  const restaurantPlacesOccupied = Math.max(0, restaurantOccupancy);
  const restaurantPlacesFree = Math.max(0, restaurantCapacity - restaurantPlacesOccupied);
  const restaurantPlacesFreeLabel = `${restaurantPlacesFree} place${restaurantPlacesFree > 1 ? 's' : ''} libre${restaurantPlacesFree > 1 ? 's' : ''}`;
  const filteredMeals = todayMeals.filter(meal => {
    const matchesCategory = selectedCategory === 'all' || meal.category === selectedCategory;
    const matchesSearch = meal.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          meal.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  // Next day meals (proposed)
  const nextDayMeals = meals.filter(m => m.isNextDay && m.isAvailableToday && (m.mealType || 'regular') === 'regular');
  const specialDinnerMeals = specialDinnerEnabled ? meals.filter(m => m.isNextDay && m.mealType === 'special_dinner') : [];
  const activePendingWaveRequests = waveTopupRequests.filter(request =>
    request.employeeId === activeProfile.id && request.status === 'pending'
  );

  // Cart Handlers
  useEffect(() => {
    if (!isConfigured || !db) return;
    const issuersQuery = activeProfile.department
      ? query(collection(db, 'deliveryCodeIssuers'), where('department', '==', activeProfile.department))
      : collection(db, 'deliveryCodeIssuers');
    return onSnapshot(issuersQuery, snapshot => {
      setDeliveryCodeIssuers(snapshot.docs.map(item => item.data() as DeliveryCodeIssuer));
    }, () => setDeliveryCodeIssuers([]));
  }, [isFirebaseMode, activeProfile.department]);

  const authorizedCodeIssuers = deliveryCodeIssuers.filter(profile =>
    profile.enabled &&
    profile.department.trim().toLowerCase() === activeProfile.department.trim().toLowerCase()
  );
  const resolveDeliveryCodeIssuer = (rawCode: string) => authorizedCodeIssuers.find(profile =>
    getPersonalDeliveryCode(now, deliveryCodeSeed, profile.id) === rawCode.trim()
  );
  const hasActiveDeliveryPreAuthorization = (profile: UserProfile) =>
    Boolean(profile.deliveryPreAuthorizedById) &&
    (
      profile.deliveryPreAuthorizedScope === 'permanent' ||
      new Date(profile.deliveryPreAuthorizedUntil || 0).getTime() > now.getTime()
    );
  const currentDeliveryCodeWindowStart = deliveryAccessCodeExpiresAt
    ? new Date(deliveryAccessCodeExpiresAt).getTime() - (24 * 60 * 60 * 1000)
    : now.getTime() - (24 * 60 * 60 * 1000);
  const deliveryCodeUsesInCurrentWindow = orders.filter(order =>
    order.employeeId === activeProfile.id &&
    Boolean(order.deliveryAuthorizedById) &&
    new Date(order.deliveryAuthorizationUsedAt || 0).getTime() >= currentDeliveryCodeWindowStart
  ).length;
  const deliveryCodeUsageLimitReached = deliveryCodeUsesInCurrentWindow >= deliveryCodeMaxUsesPer24h;
  const deliveryReadableDepartments = Array.from(new Set([
    normalizeServiceLabel(activeProfile.department),
    ...(activeProfile.deliveryVisibleDepartments || []).map(normalizeServiceLabel),
  ].filter(Boolean)));
  const canSeeDeliveryDepartment = (department: string) => deliveryReadableDepartments.includes(normalizeServiceLabel(department));
  const serviceDeliveryQuota = Math.max(0, deliveryServiceDailyQuotas[normalizeServiceLabel(activeProfile.department)] ?? deliveryServiceDailyQuotas[activeProfile.department] ?? deliveryServiceDailyQuotas.Gynecologie ?? activeProfile.deliverySelectionDailyLimit ?? 1);
  const serviceDeliverySelectionsToday = profiles.filter(profile =>
    canSeeDeliveryDepartment(profile.department) &&
    Boolean(profile.deliveryPreAuthorizedById) &&
    profile.deliveryPreAuthorizedUntil !== '1970-01-01T00:00:00.000Z' &&
    (
      profile.deliveryPreAuthorizedScope === 'permanent' ||
      new Date(profile.deliveryPreAuthorizedUntil || 0).getTime() > now.getTime()
    )
  ).length;
  const deliveryServiceProfiles = profiles
    .filter(profile => isPersonnelProfile(profile) && canSeeDeliveryDepartment(profile.department))
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  const deliveryServiceProfilesByDepartment = Object.entries(deliveryServiceProfiles.reduce((groups, profile) => {
    const service = normalizeServiceLabel(profile.department || 'Service non renseigné');
    groups[service] = [...(groups[service] || []), profile];
    return groups;
  }, {} as Record<string, UserProfile[]>))
    .sort(([serviceA], [serviceB]) => serviceA.localeCompare(serviceB, 'fr'));
  const hasDeliveryAuthorization = () => hasActiveDeliveryPreAuthorization(activeProfile) || (deliveryAuthorizationMode === 'codes' && Boolean(resolveDeliveryCodeIssuer(deliveryCodeInput)));
  const isDeliveryMandatory = hasActiveDeliveryPreAuthorization(activeProfile);
  const isBadgeBlocked = isTrueFlag(activeProfile.badgeBlocked) || activeProfile.status === 'blocked' || activeProfile.status === 'pending';
  const currentCartQuantity = cart.reduce((sum, item) => sum + item.quantity, 0);

  useEffect(() => {
    if (isDeliveryMandatory && cart.length > 0 && fulfillmentMode !== 'delivery') {
      setFulfillmentMode('delivery');
    }
  }, [cart.length, fulfillmentMode, isDeliveryMandatory]);

  const addToCart = (meal: Meal) => {
    if ((meal.category !== 'plat' && !extrasOrderingEnabled) || (meal.mealType === 'special_dinner' && !specialDinnerEnabled)) {
      addNotification('En attente d’activation', 'Cette option est en attente d’activation.', 'info');
      return;
    }
    if (isBadgeBlocked) {
      addNotification(
        'Badge non actif',
        "Votre badge est en attente de validation ou bloqué. Contactez l'administration.",
        'warning'
      );
      return;
    }
    if (meal.stock <= 0 && meal.mealType !== 'special_dinner') return;
    const existing = cart.find(item => item.meal.id === meal.id);
    if (effectiveOrderedQuantity + currentCartQuantity >= maxItemsPerOrder) {
      addNotification(
        'Limite atteinte',
        `L'administrateur autorise au maximum ${maxItemsPerOrder} portion(s) pendant ce créneau. Vous avez déjà commandé ${effectiveOrderedQuantity} portion(s).`,
        'warning'
      );
      return;
    }
    if (isDeliveryMandatory) {
      setFulfillmentMode('delivery');
    }
    setCart(prev => {
      const existing = prev.find(item => item.meal.id === meal.id);
      if (existing) {
        if (meal.mealType !== 'special_dinner' && existing.quantity >= meal.stock) return prev; // limit to stock
        return prev.map(item => item.meal.id === meal.id ? { ...item, quantity: item.quantity + 1 } : item);
      }
      return [...prev, { meal, quantity: 1 }];
    });
  };

  const removeFromCart = (mealId: string) => {
    setCart(prev => {
      const existing = prev.find(item => item.meal.id === mealId);
      if (existing && existing.quantity > 1) {
        return prev.map(item => item.meal.id === mealId ? { ...item, quantity: item.quantity - 1 } : item);
      }
      return prev.filter(item => item.meal.id !== mealId);
    });
  };

  const clearCart = () => {
    setCart([]);
    setReplacementOrderCredit(null);
  };
  useEffect(() => {
    if (cart.length === 0 && replacementOrderCredit) {
      setReplacementOrderCredit(null);
    }
  }, [cart.length, replacementOrderCredit]);
  useEffect(() => {
    if (!isActiveRestaurantPresence || !restaurantPresenceStartedAt || !restaurantPresenceReminderEnabled) return;
    if (presenceReminderSentFor === restaurantPresenceStartedAt) return;
    const startedAt = new Date(restaurantPresenceStartedAt).getTime();
    const delay = Math.max(1, restaurantPresenceReminderMinutes) * 60_000 - (Date.now() - startedAt);
    const timer = window.setTimeout(() => {
      setPresenceReminderSentFor(restaurantPresenceStartedAt);
      addNotification('Pensez à libérer la place', 'Vous êtes au restaurant depuis un moment. Préparez-vous à scanner la sortie après le repas.', 'warning');
      navigator.vibrate?.([350, 150, 350]);
      try {
        const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (AudioContextClass) {
          const context = new AudioContextClass();
          const oscillator = context.createOscillator();
          const gain = context.createGain();
          oscillator.frequency.value = 880;
          gain.gain.value = 0.08;
          oscillator.connect(gain);
          gain.connect(context.destination);
          oscillator.start();
          oscillator.stop(context.currentTime + 0.25);
        }
      } catch {
        // Some browsers block sound until the next user gesture.
      }
    }, Math.max(0, delay));
    return () => window.clearTimeout(timer);
  }, [addNotification, isActiveRestaurantPresence, presenceReminderSentFor, restaurantPresenceReminderEnabled, restaurantPresenceReminderMinutes, restaurantPresenceStartedAt]);

  const getRealUnitPrice = (meal: Meal) =>
    meal.category === 'plat' && meal.mealType !== 'special_dinner' ? realMealPrice : meal.price;

  const forceStaffPrice = Boolean(activeProfile.alwaysStaffMealPrice);

  const getCartTotal = () => {
    let subsidizedHotMealUsed = activeProfile.subsidyExcluded || (!forceStaffPrice && pricedOrderedHotMealQuantity > 0);
    let extraSubsidyCreditsLeft = Math.max(0, Number(activeProfile.extraSubsidyCredits || 0));
    const mealTotal = cart.reduce((sum, item) => {
      const isSubsidizedHotMeal = item.meal.category === 'plat' && item.meal.mealType !== 'special_dinner';
      const unitPrice = getRealUnitPrice(item.meal);
      let itemTotal = unitPrice * item.quantity;
      if (isSubsidizedHotMeal && item.quantity >= 1 && !subsidizedHotMealUsed) {
        itemTotal -= (unitPrice - staffMealPrice) * (forceStaffPrice ? item.quantity : 1);
        subsidizedHotMealUsed = !forceStaffPrice;
      } else if (isSubsidizedHotMeal && item.quantity >= 1 && extraSubsidyCreditsLeft > 0) {
        itemTotal -= unitPrice - staffMealPrice;
        extraSubsidyCreditsLeft -= 1;
      }
      return sum + itemTotal;
    }, 0);
    return mealTotal + (
      fulfillmentMode === 'delivery' && deliveryFeeEnabled && deliveryFeePayer === 'employee'
        ? Math.max(0, deliveryFeeAmount)
        : 0
    );
  };

  const getItemTotal = (item: OrderItem) => {
    const isSubsidizedHotMeal = item.meal.category === 'plat' && item.meal.mealType !== 'special_dinner';
    const firstSubsidizedItem = cart.find(cartItem => cartItem.meal.category === 'plat' && cartItem.meal.mealType !== 'special_dinner');
    const getsSubsidy = !activeProfile.subsidyExcluded && isSubsidizedHotMeal && (forceStaffPrice || (firstSubsidizedItem?.meal.id === item.meal.id && (pricedOrderedHotMealQuantity === 0 || Math.max(0, Number(activeProfile.extraSubsidyCredits || 0)) > 0)));
    const unitPrice = getRealUnitPrice(item.meal);
    return (unitPrice * item.quantity) - (getsSubsidy ? (unitPrice - staffMealPrice) * (forceStaffPrice ? item.quantity : 1) : 0);
  };

  const getCartRealTotal = () => cart.reduce((sum, item) => sum + (getRealUnitPrice(item.meal) * item.quantity), 0);
  const getCartHospitalSupport = () => cart.some(item =>
    item.meal.category === 'plat' && item.meal.mealType !== 'special_dinner' && item.quantity >= 1
  ) && !activeProfile.subsidyExcluded && (forceStaffPrice || pricedOrderedHotMealQuantity === 0 || Math.max(0, Number(activeProfile.extraSubsidyCredits || 0)) > 0) ? (forceStaffPrice ? cart.filter(item => item.meal.category === 'plat' && item.meal.mealType !== 'special_dinner').reduce((sum, item) => sum + Math.max(0, realMealPrice - staffMealPrice) * item.quantity, 0) : hospitalSupportAmount) : 0;
  const getHospitalSupportPercent = (mealPrice: number) => mealPrice > 0 ? Math.round((hospitalSupportAmount / mealPrice) * 100) : 0;
  const [startHour, startMinute] = orderWindowStart.split(':').map(Number);
  const [endHour, endMinute] = orderWindowEnd.split(':').map(Number);
  const startTotalMinutes = (startHour || 0) * 60 + (startMinute || 0);
  const endTotalMinutes = (endHour || 0) * 60 + (endMinute || 0);
  const nowTotalMinutes = now.getHours() * 60 + now.getMinutes();
  const crossesMidnight = endTotalMinutes < startTotalMinutes;
  const orderWindowIsValid = startTotalMinutes !== endTotalMinutes;
  const orderStart = new Date(now);
  orderStart.setHours(startHour || 0, startMinute || 0, 0, 0);
  const orderEnd = new Date(now);
  orderEnd.setHours(endHour || 0, endMinute || 0, 0, 0);
  if (crossesMidnight && nowTotalMinutes < startTotalMinutes) orderStart.setDate(orderStart.getDate() - 1);
  if (crossesMidnight && nowTotalMinutes >= startTotalMinutes) orderEnd.setDate(orderEnd.getDate() + 1);
  const isOrderWindowOpen = !orderWindowEnabled || (orderWindowIsValid && now >= orderStart && now <= orderEnd);
  const orderWindowLabel = orderWindowEnabled ? `${orderWindowStart} - ${orderWindowEnd}${crossesMidnight ? ' (traverse minuit)' : ''}` : '24h/24';
  const currentDay = now.getDay();
  const isWeekendClosed = weekendOrderingClosed && (
    (currentDay === 5 && nowTotalMinutes >= 19 * 60) ||
    currentDay === 6 ||
    (currentDay === 0 && nowTotalMinutes < 19 * 60)
  );
  const weekendReopening = new Date(now);
  if (currentDay === 5) weekendReopening.setDate(weekendReopening.getDate() + 2);
  if (currentDay === 6) weekendReopening.setDate(weekendReopening.getDate() + 1);
  weekendReopening.setHours(19, 0, 0, 0);
  const canPlaceOrderNow = isOrderWindowOpen && !isWeekendClosed;
  const currentWindowStart = orderWindowEnabled ? orderStart.getTime() : new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const currentWindowEnd = orderWindowEnabled ? orderEnd.getTime() : new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();
  const currentWindowOrders = orders.filter(order => {
    const createdAt = new Date(order.createdAt).getTime();
    return order.employeeId === activeProfile.id &&
      createdAt >= currentWindowStart &&
      createdAt <= currentWindowEnd &&
      order.orderType !== 'special_dinner' &&
      !['returned', 'cancelled', 'expired'].includes(order.status);
  });
  const orderedQuantityInCurrentWindow = currentWindowOrders.reduce(
    (sum, order) => sum + order.items.reduce((itemSum, item) => itemSum + item.quantity, 0),
    0
  );
  const orderedHotMealQuantityInCurrentWindow = currentWindowOrders.reduce(
    (sum, order) => sum + order.items.reduce(
      (itemSum, item) => itemSum + (item.meal.category === 'plat' && item.meal.mealType !== 'special_dinner' ? item.quantity : 0),
      0
    ),
    0
  );
  const persistentOrderLedgerKey = `chncak_order_quota_${activeProfile.id}_${currentWindowStart}_${officialResetAt || 'initial'}`;
  let persistentOrderLedger = { quantity: 0, hotMealQuantity: 0 };
  try {
    persistentOrderLedger = {
      ...persistentOrderLedger,
      ...JSON.parse(localStorage.getItem(persistentOrderLedgerKey) || '{}'),
    };
  } catch {
    persistentOrderLedger = { quantity: 0, hotMealQuantity: 0 };
  }
  const trustedPersistentOrderLedger =
    (persistentOrderLedger as { source?: string }).source === 'confirmed-order-v2'
      ? persistentOrderLedger
      : { quantity: 0, hotMealQuantity: 0 };
  const replacementQuantityCredit = cart.length > 0 ? Math.max(0, replacementOrderCredit?.quantity || 0) : 0;
  const replacementHotMealCredit = cart.length > 0 ? Math.max(0, replacementOrderCredit?.hotMealQuantity || 0) : 0;
  const ledgerOrderedQuantity = Math.max(orderedQuantityInCurrentWindow, trustedPersistentOrderLedger.quantity || 0);
  const ledgerOrderedHotMealQuantity = Math.max(orderedHotMealQuantityInCurrentWindow, trustedPersistentOrderLedger.hotMealQuantity || 0);
  const effectiveOrderedQuantity = sparkMode ? (activeProfile.orderCounterDay === getSparkOrderDay(orderWindowStart, now.getTime()) ? Number(activeProfile.regularPortionsToday || 0) : 0) : Math.max(0, ledgerOrderedQuantity - replacementQuantityCredit);
  const effectiveOrderedHotMealQuantity = Math.max(0, ledgerOrderedHotMealQuantity - replacementHotMealCredit);
  const pricedOrderedHotMealQuantity = sparkMode ? (activeProfile.orderCounterDay === getSparkOrderDay(orderWindowStart, now.getTime()) ? Number(activeProfile.hotPortionsToday || 0) : 0) : Math.max(0, orderedHotMealQuantityInCurrentWindow - replacementHotMealCredit);
  const remainingOrderAllowance = Math.max(0, maxItemsPerOrder - effectiveOrderedQuantity);

  useEffect(() => {
    if (
      orderedQuantityInCurrentWindow > (persistentOrderLedger.quantity || 0) ||
      orderedHotMealQuantityInCurrentWindow > (persistentOrderLedger.hotMealQuantity || 0)
    ) {
      localStorage.setItem(persistentOrderLedgerKey, JSON.stringify({
        quantity: Math.max(orderedQuantityInCurrentWindow, persistentOrderLedger.quantity || 0),
        hotMealQuantity: Math.max(orderedHotMealQuantityInCurrentWindow, persistentOrderLedger.hotMealQuantity || 0),
        source: 'confirmed-order-v2',
      }));
    }
  }, [orderedQuantityInCurrentWindow, orderedHotMealQuantityInCurrentWindow, persistentOrderLedgerKey]);
  const timeTarget = now < orderStart ? orderStart : orderEnd;
  const remainingMs = Math.max(0, timeTarget.getTime() - now.getTime());
  const remainingHours = Math.floor(remainingMs / 3600000);
  const remainingMinutes = Math.floor((remainingMs % 3600000) / 60000);
  const remainingSeconds = Math.floor((remainingMs % 60000) / 1000);
  const remainingLabel = `${String(remainingHours).padStart(2, '0')}:${String(remainingMinutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
  const requiresDeliveryIssuerCode = fulfillmentMode === 'delivery' && !isDeliveryMandatory && deliveryAuthorizationMode === 'codes';
  const deliveryChangeStartMinutes = 9 * 60;
  const deliveryChangeEndMinutes = 12 * 60;
  const canChangePickupToDeliveryNow = nowTotalMinutes >= deliveryChangeStartMinutes && nowTotalMinutes <= deliveryChangeEndMinutes;
  const canCancelOrModifyWithRefundNow = refundBeforeNoonEnabled && nowTotalMinutes < 12 * 60 && !isWeekendClosed && remainingRefundsThisWeek > 0;
  const todayRestaurantQrPayload = getDailyRestaurantCode(now);
  const todayRestaurantExitQrPayload = getDailyRestaurantExitCode(now);

  const changeExistingOrderToDelivery = async (order: Order) => {
    if (!canChangePickupToDeliveryNow) {
      addNotification('Modification hors délai', 'Le passage de sur place à livraison est autorisé uniquement entre 09h00 et 12h00.', 'warning');
      return;
    }
    const enteredCode = window.prompt(
      `Saisissez le code de livraison communiqué par l'administration pour convertir la commande #${order.id}.`
    );
    if (!enteredCode) return;
    const issuer = resolveDeliveryCodeIssuer(enteredCode);
    if (!issuer) {
      addNotification('Code incorrect', "Ce code n'est pas valide pour votre service ou n'est plus actif.", 'alert');
      return;
    }
    if (deliveryCodeUsageLimitReached) {
      addNotification(
        'Limite du code atteinte',
        `Vous avez déjà utilisé un code de livraison ${deliveryCodeUsesInCurrentWindow} fois sur les ${deliveryCodeMaxUsesPer24h} utilisation(s) autorisée(s) pendant cette période de 24 heures.`,
        'warning'
      );
      return;
    }
    const confirmed = window.confirm('Confirmer le passage de cette commande en livraison ?');
    if (!confirmed) return;
    const changed = await onChangeOrderToDelivery(order.id, {
      issuerId: issuer.id,
      issuerName: issuer.name,
      issuerService: issuer.department,
    });
    if (changed !== false) addNotification('Mode modifié', 'Votre commande est maintenant prévue en livraison.', 'success');
  };

  useEffect(() => {
    if (!restaurantScanResult) return;

    let wakeLock: { release?: () => Promise<void> } | null = null;
    const requestWakeLock = async () => {
      try {
        const nav = navigator as Navigator & { wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> } };
        wakeLock = nav.wakeLock ? await nav.wakeLock.request('screen') : null;
      } catch {
        wakeLock = null;
      }
    };

    requestWakeLock();
    return () => {
      wakeLock?.release?.().catch(() => {});
    };
  }, [restaurantScanResult]);

  useEffect(() => {
    if (!restaurantScanResult) return;
    const hideSensitiveScreen = () => {
      if (document.hidden) setRestaurantScanResult(null);
    };
    document.addEventListener('visibilitychange', hideSensitiveScreen);
    window.addEventListener('blur', hideSensitiveScreen);
    return () => {
      document.removeEventListener('visibilitychange', hideSensitiveScreen);
      window.removeEventListener('blur', hideSensitiveScreen);
    };
  }, [restaurantScanResult]);

  // Profile management handers
  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateProfile({
      ...activeProfile,
      name: editedName,
      phone: editedPhone,
      department: editedDept,
      building: editedBuilding,
      floor: editedFloor,
      room: editedRoom
    });
    setIsEditingProfile(false);
  };

  const handlePasswordChange = async (event: React.FormEvent) => {
    event.preventDefault();
    setPasswordMessage('');
    if (newPassword.length < 6) {
      setPasswordMessage('Le mot de passe doit contenir au moins 6 caractères.');
      return;
    }
    if (newPassword !== newPasswordConfirm) {
      setPasswordMessage('Les deux mots de passe ne correspondent pas.');
      return;
    }
    try {
      await onChangePassword?.(newPassword);
      setNewPassword('');
      setNewPasswordConfirm('');
      setPasswordMessage('Mot de passe modifié avec succès.');
    } catch (error) {
      setPasswordMessage(error instanceof Error ? error.message : "Modification impossible. Reconnectez-vous puis réessayez.");
    }
  };

  const handleWalletTopup = async () => {
    const amount = parseInt(topupAmount, 10);
    if (isNaN(amount) || amount <= 0) return;

    const uniqueSuffix = Date.now().toString(36).toUpperCase();
    const shortReference = `WAVE-${activeProfile.badgeNumber}-${waveTopupDate}-${waveTopupTime}-${uniqueSuffix}`;

    setIsDeclaringWave(true);
    setTopupActionMessage('');
    try {
      await onRequestWaveTopup({
        id: `wave-${Date.now()}`,
        employeeId: activeProfile.id,
        employeeName: activeProfile.name,
        badgeNumber: activeProfile.badgeNumber,
        phone: activeProfile.phone,
        amount,
        reference: shortReference,
        merchantNumber: waveMerchantNumber,
        status: 'pending',
        createdAt: new Date().toISOString(),
      });
      setTopupActionMessage('Déclaration Wave envoyée au comptable.');
    } catch {
      setTopupActionMessage("Déclaration impossible. Vérifiez votre connexion puis réessayez.");
    } finally {
      setIsDeclaringWave(false);
    }
  };

  const handlePrepaidTopup = async () => {
    const normalizedCode = prepaidCode.trim().toUpperCase().replace(/\s+/g, '');
    setTopupActionMessage('');
    if (!normalizedCode) {
      setTopupActionMessage('Saisissez le code remis par le comptable.');
      return;
    }
    if (!/^P[A-Z0-9]{3}-[A-Z0-9]{4,12}$/.test(normalizedCode)) {
      setTopupActionMessage('Format du code invalide. Exemple attendu : P123-7K9A.');
      addNotification(
        'Carte prépayée invalide',
        'Saisissez le code court remis par le comptable, par exemple P123-7K9A.',
        'warning'
      );
      return;
    }

    setIsValidatingPrepaid(true);
    setTopupActionMessage('');
    try {
      await onRedeemPrepaidCard(activeProfile, normalizedCode);
      setPrepaidCode('');
      setTopupActionMessage('Carte prépayée validée. Votre badge a été crédité.');
    } catch (error) {
      setTopupActionMessage(error instanceof Error ? error.message : "Validation impossible. Vérifiez le code et le badge bénéficiaire.");
    } finally {
      setIsValidatingPrepaid(false);
    }
  };

  const normalizeShortQrCode = (value: string) => value
    .trim()
    .toUpperCase()
    .replace(/[“”«»„‟]/g, '"')
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[ÈÉÊË]/g, '"')
    .replace(/Ç/g, '}')
    .replace(/\s+/g, '');

  const shortQrMatches = (scanned: string, expected: string) => {
    const a = normalizeShortQrCode(scanned);
    const b = normalizeShortQrCode(expected);
    return a === b || a.replace(/A/g, 'Q') === b || a.replace(/Q/g, 'A') === b.replace(/Q/g, 'A');
  };

  const validateRestaurantQr = async (rawValue: string) => {
    const normalized = normalizeShortQrCode(rawValue);
    const legacyPayload = normalizeShortQrCode(`Ndamatou-RESTO-${getLocalDateKey(now)}`);
    const activeOrdersToConfirm = activeEmployeeOrders.filter(order => !['delivered', 'returned', 'cancelled', 'expired'].includes(order.status));
    if (isBadgeBlocked) {
      setRestaurantScanResult({
        status: 'error',
        title: 'Badge bloqué',
        message: "Votre badge n'est pas actif. Contactez l'administration."
      });
      return;
    }

    if (restaurantExitQrEnabled && shortQrMatches(normalized, todayRestaurantExitQrPayload)) {
      const confirmedExit = window.confirm(
        "Êtes-vous sûr d'être sorti du restaurant ?\n\nOui : libérer votre place.\nNon : conserver votre place occupée."
      );
      if (!confirmedExit) {
        setRestaurantScanResult({
          status: 'error',
          title: 'Sortie annulée',
          message: "Votre place reste enregistrée comme occupée. Validez la sortie uniquement après avoir quitté le restaurant."
        });
        setIsRestaurantScannerOpen(false);
        return;
      }
      await onSetRestaurantPresence?.(activeProfile, false);
      setRestaurantScanResult({
        status: 'ok',
        title: 'Sortie enregistrée',
        message: 'Merci. Votre place est maintenant signalée comme libre pour vos collègues.',
        secureCode: `SORTIE-${activeProfile.badgeNumber.slice(-4)}-${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}`,
        validatedAt: new Date().toISOString()
      });
      setIsRestaurantScannerOpen(false);
      return;
    }

    if (!shortQrMatches(normalized, todayRestaurantQrPayload) && !shortQrMatches(normalized, legacyPayload)) {
      setRestaurantScanResult({
        status: 'error',
        title: 'QR non valide',
        message: `Ce code ne correspond pas au code restaurant du jour. Code attendu: ${todayRestaurantQrPayload}.`
      });
      return;
    }

    if (activeOrdersToConfirm.length === 0) {
      setRestaurantScanResult({
        status: 'error',
        title: 'Commande absente',
        message: "Aucune commande active n'est trouvée pour votre compte."
      });
      return;
    }

    const restaurantIsFull = restaurantOccupancy >= restaurantCapacity;
    let takeAway = false;
    if (restaurantIsFull) {
      takeAway = window.confirm(
        `RESTAURANT COMPLET : ${restaurantOccupancy}/${restaurantCapacity} PLACES OCCUPÉES.\n\n` +
        `OK : récupérer votre repas À EMPORTER.\n` +
        `ANNULER : attendre qu'une place soit libre sans valider votre commande.`
      );
      if (!takeAway) {
        setRestaurantScanResult({
          status: 'error',
          title: 'Restaurant complet',
          message: `Votre commande reste active. Attendez qu'une place soit libre puis scannez de nouveau.`
        });
        setIsRestaurantScannerOpen(false);
        return;
      }
    }

    const results = await Promise.all(activeOrdersToConfirm.map(order => onConfirmPickupOrder(order.id)));
    const confirmedOrders = activeOrdersToConfirm.filter((_, index) => results[index] !== false);
    if (confirmedOrders.length === 0) {
      setRestaurantScanResult({
        status: 'error',
        title: 'Commande absente',
        message: "Aucune commande active n'a pu être validée. Elle est peut-être déjà livrée, annulée ou expirée."
      });
      return;
    }

    const confirmedItems = confirmedOrders.flatMap(order => order.items.map(item => `${item.quantity} x ${(item.meal?.name || 'Repas')}`));
    if (!takeAway && confirmedOrders.some(order => order.fulfillmentMode !== 'delivery')) {
      await onSetRestaurantPresence?.(activeProfile, true);
      setRestaurantExitPromptPausedUntil(Date.now() + 30_000);
    }
    setRestaurantScanResult({
      status: 'ok',
      title: takeAway ? 'OK - Repas à emporter' : confirmedOrders.length > 1 ? `OK - ${confirmedOrders.length} commandes autorisées` : 'OK - Repas autorisé',
      message: `${confirmedItems.join(' + ')}. ${takeAway ? 'Le restaurant est complet : emportez votre repas.' : 'Présentez cet écran au restaurateur.'}`,
      order: confirmedOrders[0],
      orders: confirmedOrders,
      secureCode: `OK-${activeProfile.badgeNumber.slice(-4)}-${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`,
      validatedAt: new Date().toISOString()
    });
    setIsRestaurantScannerOpen(false);
  };

  const stopRestaurantScanner = () => {
    scannerControlsRef.current?.stop();
    scannerControlsRef.current = null;
    scannerStreamRef.current?.getTracks().forEach(track => track.stop());
    scannerStreamRef.current = null;
    if (scannerVideoRef.current) {
      scannerVideoRef.current.srcObject = null;
    }
  };

  const handleScanRestaurantQr = () => {
    setScannerMessage('');
    setRestaurantCodeInput('');
    setIsRestaurantScannerOpen(true);
  };

  const handleManualRestaurantCode = () => {
    if (!restaurantCodeInput.trim()) {
      setScannerMessage(`Saisissez le code court affiche sous le QR: ${todayRestaurantQrPayload}`);
      return;
    }
    validateRestaurantQr(restaurantCodeInput);
  };

  useEffect(() => {
    if (!isRestaurantScannerOpen) {
      stopRestaurantScanner();
      return;
    }

    let cancelled = false;
    let timeoutId = 0;
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { willReadFrequently: true });

    const scanFrame = async () => {
      if (cancelled) return;
      const video = scannerVideoRef.current;
      if (!video || !context || video.readyState < HTMLMediaElement.HAVE_ENOUGH_DATA) {
        timeoutId = window.setTimeout(scanFrame, 250);
        return;
      }

      const width = video.videoWidth;
      const height = video.videoHeight;
      if (!width || !height) {
        timeoutId = window.setTimeout(scanFrame, 250);
        return;
      }

      canvas.width = width;
      canvas.height = height;
      context.drawImage(video, 0, 0, width, height);
      const NativeBarcodeDetector = (window as unknown as {
        BarcodeDetector?: new (options?: { formats?: string[] }) => {
          detect: (source: CanvasImageSource) => Promise<Array<{ rawValue?: string }>>;
        };
      }).BarcodeDetector;

      if (NativeBarcodeDetector) {
        try {
          const detector = new NativeBarcodeDetector({ formats: ['qr_code'] });
          const detected = await detector.detect(canvas);
          const nativeValue = detected[0]?.rawValue;
          if (nativeValue) {
            validateRestaurantQr(nativeValue);
            return;
          }
        } catch {
          // jsQR below remains the fallback when native detection fails.
        }
      }

      const imageData = context.getImageData(0, 0, width, height);
      let qr: { data: string } | null = null;
      try {
        qr = jsQR(imageData.data, width, height, { inversionAttempts: 'attemptBoth' });
      } catch {
        setScannerMessage('La camera fonctionne, mais le moteur de lecture QR a rencontre une erreur. Fermez puis relancez le scanner.');
        timeoutId = window.setTimeout(scanFrame, 500);
        return;
      }

      if (qr?.data) {
        validateRestaurantQr(qr.data);
        return;
      }

      setScannerMessage(`Camera active. Approchez le QR ou saisissez le code court: ${todayRestaurantQrPayload}`);
      timeoutId = window.setTimeout(scanFrame, 250);
    };

    const startScanner = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setScannerMessage('Ce navigateur ne donne pas acces a la camera. Utilisez la saisie manuelle du code.');
        return;
      }

      try {
        const video = scannerVideoRef.current;
        if (!video) return;

        const { BrowserQRCodeReader } = await import('../vendor/zxing-browser.mjs') as unknown as {
          BrowserQRCodeReader: new (hints?: unknown, options?: {
            delayBetweenScanAttempts?: number;
            delayBetweenScanSuccess?: number;
          }) => {
            decodeFromVideoDevice: (
              deviceId: string | undefined,
              videoElement: HTMLVideoElement,
              callback: (result?: { getText?: () => string }) => void
            ) => Promise<{ stop: () => void }>;
          };
        };
        const zxingReader = new BrowserQRCodeReader(undefined, {
          delayBetweenScanAttempts: 180,
          delayBetweenScanSuccess: 250,
        });

        const controls = await zxingReader.decodeFromVideoDevice(undefined, video, (result: { getText?: () => string } | undefined) => {
          if (cancelled || !result) return;
          const text = result.getText?.();
          if (text) validateRestaurantQr(text);
        });

        if (cancelled) {
          controls.stop();
          return;
        }
        scannerControlsRef.current = controls;
        setScannerMessage(`Scanner ZXing actif. Placez le QR au centre ou saisissez le code court: ${todayRestaurantQrPayload}`);
        scanFrame();
      } catch {
        setScannerMessage('Acces camera refuse ou indisponible. Autorisez la camera dans le navigateur, puis reessayez, ou utilisez la saisie manuelle.');
      }
    };

    startScanner();
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
      stopRestaurantScanner();
    };
  }, [isRestaurantScannerOpen]);

  // Submit the order and wait for Firebase confirmation.
  const handleCheckoutSubmit = async () => {
    if (paymentSubmissionRef.current || isProcessingPayment) return;

    if (sparkMode && cart.length > 2) {
      addNotification('Panier à ajuster', 'Choisissez au maximum deux articles différents par commande.', 'warning');
      return;
    }

    const total = getCartTotal();

    if (isBadgeBlocked) {
      addNotification(
        'Badge non actif',
        "Votre badge est en attente de validation ou bloqué. Commande impossible.",
        'warning'
      );
      return;
    }

    if (!canPlaceOrderNow && !(replacementOrderCredit && canCancelOrModifyWithRefundNow)) {
      addNotification(
        isWeekendClosed ? 'Commandes fermées le week-end' : 'Commande hors délai',
        isWeekendClosed
          ? `Les commandes sont verrouillées du vendredi 19h au dimanche 19h. Réouverture le ${weekendReopening.toLocaleString('fr-FR')}.`
          : `Les commandes sont ouvertes selon la plage ${orderWindowLabel}. Appelez le ${lateOrderPhone}.`,
        'warning'
      );
      return;
    }

    if (effectiveOrderedQuantity + currentCartQuantity > maxItemsPerOrder || remainingOrderAllowance === 0) {
      addNotification(
        'Limite de commande atteinte',
        `Vous avez déjà commandé ${effectiveOrderedQuantity} portion(s) sur les ${maxItemsPerOrder} autorisées pendant ce créneau.`,
        'warning'
      );
      return;
    }

    if (fulfillmentMode === 'delivery' && !hasDeliveryAuthorization()) {
      addNotification(
        'Livraison non autorisée',
        `Saisissez le code personnel d'un responsable habilité du service ${activeProfile.department}.`,
        'warning'
      );
      return;
    }

    // Check balance if payment is by badge
    if (paymentMethod === 'badge_card' && activeProfile.walletBalance < total) {
      addNotification(
        'Solde insuffisant',
        `Commande refusée: votre badge contient ${activeProfile.walletBalance.toLocaleString('fr-FR')} FCFA alors que le panier coûte ${total.toLocaleString('fr-FR')} FCFA. Rechargez votre badge avant de recommander.`,
        'warning'
      );
      return;
    }

    paymentSubmissionRef.current = true;
    setIsProcessingPayment(true);

      // Generate standard order object
      const newOrderId = `CMD-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      const timestamp = new Date().toISOString();
      const deliveryCodeIssuer = resolveDeliveryCodeIssuer(deliveryCodeInput);

      const newOrder: Order = {
        id: newOrderId,
        employeeId: activeProfile.id,
        employeeName: activeProfile.name,
        employeeEmail: activeProfile.email,
        employeePhone: activeProfile.phone,
        badgeNumber: activeProfile.badgeNumber,
        department: activeProfile.department,
        building: activeProfile.building,
        floor: activeProfile.floor,
        room: activeProfile.room,
        fulfillmentMode,
        deliveryFeeEnabled: fulfillmentMode === 'delivery' && deliveryFeeEnabled,
        deliveryFeeAmount: fulfillmentMode === 'delivery' && deliveryFeeEnabled ? Math.max(0, deliveryFeeAmount) : 0,
        deliveryFeePayer: fulfillmentMode === 'delivery' && deliveryFeeEnabled ? deliveryFeePayer : undefined,
        subsidyExcluded: Boolean(activeProfile.subsidyExcluded),
        alwaysStaffMealPrice: Boolean(activeProfile.alwaysStaffMealPrice),
        ...(fulfillmentMode === 'delivery' && hasActiveDeliveryPreAuthorization(activeProfile)
          ? {
              deliveryAuthorizedById: activeProfile.deliveryPreAuthorizedById,
              deliveryAuthorizedByName: activeProfile.deliveryPreAuthorizedByName,
              deliveryAuthorizedByService: activeProfile.department,
              deliveryAuthorizationUsedAt: timestamp,
            }
          : {}),
        ...(fulfillmentMode === 'delivery' && !activeProfile.deliveryAllowed && !hasActiveDeliveryPreAuthorization(activeProfile) && deliveryCodeIssuer
          ? {
              deliveryAuthorizedById: deliveryCodeIssuer.id,
              deliveryAuthorizedByName: deliveryCodeIssuer.name,
              deliveryAuthorizedByService: deliveryCodeIssuer.department,
              deliveryAuthorizationUsedAt: timestamp,
            }
          : {}),
        items: [...cart],
        total: total,
        status: 'pending',
        paymentMethod: 'badge_card',
        paymentStatus: 'paid',
        createdAt: timestamp,
        notes: specialNotes,
        orderType: cart.some(item => item.meal.mealType === 'special_dinner') ? 'special_dinner' : 'regular',
        steps: [
          {
            status: 'pending',
            title: 'Commande validée',
            description: 'Montant débité de votre badge de manière sécurisée.',
            timestamp: timestamp
          }
        ]
      };

      try {
        await onCreateOrder(newOrder);
      } catch (error) {
        addNotification('Commande non enregistrée', getOrderFailureMessage(error), 'alert');
        paymentSubmissionRef.current = false;
        setIsProcessingPayment(false);
        return;
      }

      if (newOrder.orderType !== 'special_dinner') {
        const newOrderQuantity = newOrder.items.reduce((sum, item) => sum + item.quantity, 0);
        const newHotMealQuantity = newOrder.items.reduce(
          (sum, item) => sum + (item.meal.category === 'plat' && item.meal.mealType !== 'special_dinner' ? item.quantity : 0),
          0
        );
        localStorage.setItem(persistentOrderLedgerKey, JSON.stringify({
          quantity: effectiveOrderedQuantity + newOrderQuantity,
          hotMealQuantity: effectiveOrderedHotMealQuantity + newHotMealQuantity,
          source: 'confirmed-order-v2',
        }));
        setOrderLedgerVersion(version => version + 1);
      }

      setCreatedOrderId(newOrderId);
      setPaymentSuccess(true);
      setCart([]);
      setReplacementOrderCredit(null);
      setSpecialNotes('');
      setTransactionReference('');
      paymentSubmissionRef.current = false;
      setIsProcessingPayment(false);
  };

  const closePaymentModal = () => {
    if (paymentSubmissionRef.current || isProcessingPayment) return;
    setIsCheckoutOpen(false);
    setPaymentSuccess(false);
    if (paymentSuccess) {
      setActiveTab('profile');
    }
  };

  const activeEmployeeOrders = orders.filter(o => o.employeeId === activeProfile.id)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const personalRechargeHistory = cashTransactions
    .filter(transaction => transaction.employeeId === activeProfile.id)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const historyStartTime = historyStartDate ? new Date(`${historyStartDate}T00:00:00`).getTime() : Number.NEGATIVE_INFINITY;
  const historyEndTime = historyEndDate ? new Date(`${historyEndDate}T23:59:59`).getTime() : Number.POSITIVE_INFINITY;
  const isInHistoryPeriod = (dateValue?: string) => {
    const time = new Date(dateValue || 0).getTime();
    return Number.isFinite(time) && time >= historyStartTime && time <= historyEndTime;
  };
  const filteredEmployeeOrders = activeEmployeeOrders.filter(order => isInHistoryPeriod(order.createdAt));
  const filteredRechargeHistory = personalRechargeHistory.filter(transaction => isInHistoryPeriod(transaction.createdAt));
  const filteredOrdersTotal = filteredEmployeeOrders.reduce((sum, order) => sum + Number(order.total || 0), 0);
  const filteredRechargesTotal = filteredRechargeHistory.reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0);
  const escapeExcelCell = (value: unknown) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
  const exportPersonalHistoryExcel = () => {
    const periodLabel = `${historyStartDate || 'début'} au ${historyEndDate || 'aujourd’hui'}`;
    const ordersRows = filteredEmployeeOrders.map(order => `
      <tr>
        <td>${escapeExcelCell(order.id)}</td>
        <td>${escapeExcelCell(new Date(order.createdAt).toLocaleString('fr-FR'))}</td>
        <td>${escapeExcelCell(order.status)}</td>
        <td>${escapeExcelCell(order.fulfillmentMode === 'delivery' ? 'Livraison' : 'Restaurant')}</td>
        <td>${escapeExcelCell(order.items.map(item => `${item.quantity} x ${item.meal?.name || 'Repas'}`).join(', '))}</td>
        <td style="mso-number-format:'0'">${Math.round(Number(order.total || 0))}</td>
      </tr>
    `).join('');
    const rechargeRows = filteredRechargeHistory.map(transaction => `
      <tr>
        <td>${escapeExcelCell(transaction.id)}</td>
        <td>${escapeExcelCell(new Date(transaction.createdAt).toLocaleString('fr-FR'))}</td>
        <td>${escapeExcelCell(transaction.method === 'wave' ? 'Wave' : 'Espèces')}</td>
        <td style="mso-number-format:'0'">${Math.round(Number(transaction.amount || 0))}</td>
        <td>${escapeExcelCell(transaction.cashierName || 'Non tracé')}</td>
        <td>${escapeExcelCell(transaction.note || '')}</td>
      </tr>
    `).join('');
    const html = `
      <html>
        <head><meta charset="UTF-8" /></head>
        <body>
          <h2>Historique personnel Ndamatou</h2>
          <p><strong>Agent:</strong> ${escapeExcelCell(activeProfile.name)} - ${escapeExcelCell(activeProfile.badgeNumber)}</p>
          <p><strong>Service:</strong> ${escapeExcelCell(activeProfile.department || '')}</p>
          <p><strong>Période:</strong> ${escapeExcelCell(periodLabel)}</p>
          <h3>Commandes</h3>
          <table border="1">
            <thead><tr><th>Ticket</th><th>Date et heure</th><th>Statut</th><th>Mode</th><th>Détail</th><th>Montant FCFA</th></tr></thead>
            <tbody>${ordersRows || '<tr><td colspan="6">Aucune commande sur la période.</td></tr>'}</tbody>
            <tfoot><tr><th colspan="5">Total commandes</th><th>${Math.round(filteredOrdersTotal)}</th></tr></tfoot>
          </table>
          <h3>Recharges badge</h3>
          <table border="1">
            <thead><tr><th>Référence</th><th>Date et heure</th><th>Mode</th><th>Montant FCFA</th><th>Opérateur</th><th>Note</th></tr></thead>
            <tbody>${rechargeRows || '<tr><td colspan="6">Aucune recharge sur la période.</td></tr>'}</tbody>
            <tfoot><tr><th colspan="3">Total recharges</th><th>${Math.round(filteredRechargesTotal)}</th><th colspan="2"></th></tr></tfoot>
          </table>
        </body>
      </html>
    `;
    const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const safeBadge = (activeProfile.badgeNumber || activeProfile.id || 'badge').replace(/[^a-zA-Z0-9_-]/g, '-');
    link.href = url;
    link.download = `historique-${safeBadge}-${historyStartDate || 'debut'}-${historyEndDate || getLocalDateKey(new Date())}.xls`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    if (!isActiveRestaurantPresence || !restaurantPresenceStartedAt || restaurantScanResult || isRestaurantScannerOpen) return;
    if (autoRestaurantPresenceResultShownFor === restaurantPresenceStartedAt) return;

    const presenceTime = new Date(restaurantPresenceStartedAt).getTime();
    if (!Number.isFinite(presenceTime)) return;

    const recentlyDeliveredOrders = activeEmployeeOrders.filter(order => {
      if (order.status !== 'delivered') return false;
      if ((order.fulfillmentMode || 'pickup') === 'delivery') return false;
      const updatedTime = new Date(order.deliveryTime || order.createdAt).getTime();
      const createdTime = new Date(order.createdAt).getTime();
      const referenceTime = Number.isFinite(updatedTime) ? updatedTime : createdTime;
      return Number.isFinite(referenceTime) && Math.abs(referenceTime - presenceTime) <= 10 * 60_000;
    });

    if (recentlyDeliveredOrders.length === 0) return;

    const confirmedItems = recentlyDeliveredOrders.flatMap(order =>
      order.items.map(item => `${item.quantity} x ${(item.meal?.name || 'Repas')}`)
    );
    const nowForCode = new Date();
    setRestaurantScanResult({
      status: 'ok',
      title: recentlyDeliveredOrders.length > 1
        ? `OK - ${recentlyDeliveredOrders.length} commandes autorisées`
        : 'OK - Repas autorisé',
      message: `${confirmedItems.join(' + ')}. Repas validé par scan du restaurant.`,
      order: recentlyDeliveredOrders[0],
      orders: recentlyDeliveredOrders,
      secureCode: `OK-${activeProfile.badgeNumber.slice(-4)}-${nowForCode.getHours().toString().padStart(2, '0')}${nowForCode.getMinutes().toString().padStart(2, '0')}-RESTO`,
      validatedAt: restaurantPresenceStartedAt,
    });
    setAutoRestaurantPresenceResultShownFor(restaurantPresenceStartedAt);
    setRestaurantExitPromptPausedUntil(Date.now() + 30_000);
  }, [
    activeEmployeeOrders,
    activeProfile.badgeNumber,
    autoRestaurantPresenceResultShownFor,
    isActiveRestaurantPresence,
    isRestaurantScannerOpen,
    restaurantPresenceStartedAt,
    restaurantScanResult,
  ]);

  const getBadgeQrPayload = (profile: UserProfile) => {
    const linkedProfile = profiles.find(item =>
      item.id === profile.id ||
      (!!profile.email && item.email === profile.email) ||
      (!!profile.badgeNumber && item.badgeNumber === profile.badgeNumber)
    );
    const phoneDigits = String(profile.phone || linkedProfile?.phone || '').replace(/\D/g, '');
    return phoneDigits || profile.badgeNumber;
  };
  const badgeQrPayload = getBadgeQrPayload(activeProfile);
  const badgeQrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(badgeQrPayload)}`;

  const handlePrintBadge = () => {
    const printWindow = window.open('', '_blank', 'width=520,height=720');
    if (!printWindow) return;
    printWindow.document.write(`
      <html>
        <head>
          <title>Badge ${activeProfile.badgeNumber}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; background: white; color: #111827; }
            .badge { width: 340px; border-radius: 14px; background: white; color: #111827; padding: 22px; border: 2px solid #374151; }
            .muted { color: #4b5563; font-size: 11px; text-transform: uppercase; font-weight: 700; }
            .name { font-size: 18px; font-weight: 800; margin-top: 8px; }
            .row { display: flex; justify-content: space-between; gap: 16px; align-items: end; margin-top: 26px; }
            .qr { background: white; padding: 8px; border: 1px solid #9ca3af; border-radius: 8px; }
            .photo { width: 72px; height: 72px; border-radius: 10px; object-fit: cover; border: 1px solid #6b7280; margin-top: 12px; }
            .mono { font-family: Consolas, monospace; font-weight: 700; }
            .lost { margin-top: 14px; font-size: 11px; color: #4b5563; }
            .lost strong { color: #111827; display: block; margin-top: 3px; }
            @media print { body { background: white; } .badge { print-color-adjust: economy; -webkit-print-color-adjust: economy; } }
          </style>
        </head>
        <body>
          <div class="badge">
            <div class="muted">Centre Hospitalier de Ndamatou</div>
            <div class="name">${activeProfile.name}</div>
            <p>${activeProfile.department}</p>
            ${activeProfile.photoUrl ? `<img class="photo" src="${activeProfile.photoUrl}" />` : ''}
            <div class="row">
              <div>
                <div class="muted">Badge</div>
                <div class="mono">${activeProfile.badgeNumber}</div>
                <div class="lost">Téléphone propriétaire<strong>${activeProfile.phone || 'Non renseigné'}</strong></div>
                <div class="lost">Si badge trouvé, appeler<strong>${lateOrderPhone}</strong></div>
              </div>
              <div>
                <img class="qr" src="${badgeQrUrl}" />
                <div class="muted" style="text-align:center;margin-top:4px;">QR téléphone</div>
              </div>
            </div>
          </div>
          <script>window.onload = () => window.print();</script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const rateMeal = (mealId: string, rating: number) => {
    setMealRatings(prev => ({ ...prev, [mealId]: rating }));
  };

  const sendMessage = () => {
    const text = messageText.trim();
    const recipient = profiles.find(profile => profile.id === selectedMessageRecipientId);
    if (!text || !recipient) return;

    setMessages(prev => [
      {
        id: `msg-${Date.now()}`,
        author: activeProfile.name,
        recipientId: recipient.id,
        recipientName: recipient.name,
        text,
        timestamp: new Date().toISOString(),
      },
      ...prev,
    ]);
    setMessageText('');
  };

  const sendIdea = async () => {
    const text = ideaText.trim();
    if (!text) {
      setIdeaMessage('Écrivez votre suggestion avant de l’envoyer.');
      return;
    }
    setIsSendingIdea(true);
    setIdeaMessage('');
    const savedIdeas = localStorage.getItem('chncak_idea_box');
    const previousIdeas: IdeaBoxMessage[] = savedIdeas ? JSON.parse(savedIdeas) : [];
    const nextIdeas: IdeaBoxMessage[] = [
      {
        id: `idea-${Date.now()}`,
        authorId: activeProfile.id,
        authorName: activeProfile.name,
        department: activeProfile.department,
        text,
        timestamp: new Date().toISOString(),
      },
      ...previousIdeas,
    ];
    try {
      if (isConfigured && db) {
        await setDoc(doc(db, 'ideaBox', nextIdeas[0].id), nextIdeas[0]);
      }
      localStorage.setItem('chncak_idea_box', JSON.stringify(nextIdeas));
      window.dispatchEvent(new CustomEvent('Ndamatou-idea-box-updated'));
      addNotification('Idée envoyée', "Votre suggestion est enregistrée. Elle sera visible par l'administration et le restaurant.", 'success');
      setIdeaMessage('Votre idée a bien été envoyée.');
      setIdeaText('');
    } catch {
      setIdeaMessage("Envoi impossible. Les règles Firestore de la boîte d'idées doivent être publiées.");
      addNotification('Envoi impossible', "Firestore n'a pas accepté l'idée. Réessayez après la mise à jour.", 'warning');
    } finally {
      setIsSendingIdea(false);
    }
  };

  const submitSatisfactionSurvey = async () => {
    if (surveyAlreadySubmitted) {
      setSurveyMessage('Vous avez déjà validé ce questionnaire. Une seule réponse est autorisée par agent.');
      return;
    }
    const missingStatement = satisfactionStatements.find(statement => !surveyRatings[statement.key]);
    if (!surveyGender || !surveyAgeRange || !surveyFrequency || missingStatement || !surveyGlobalSatisfaction) {
      setSurveyMessage('Merci de répondre à toutes les questions obligatoires avant d’envoyer.');
      return;
    }

    setIsSubmittingSurvey(true);
    setSurveyMessage('');
    const nowIso = new Date().toISOString();
    const survey = {
      id: `survey-${activeProfile.id}`,
      employeeId: activeProfile.id,
      employeeName: activeProfile.name,
      badgeNumber: activeProfile.badgeNumber || '',
      department: activeProfile.department || '',
      phone: activeProfile.phone || '',
      gender: surveyGender,
      ageRange: surveyAgeRange,
      frequency: surveyFrequency,
      ratings: surveyRatings,
      globalSatisfaction: surveyGlobalSatisfaction,
      improvementText: surveyImprovementText.trim(),
      createdAt: nowIso,
    };

    try {
      if (isConfigured && db) {
        await setDoc(doc(db, 'satisfactionSurveys', survey.id), survey);
      }
      const savedSurveys = localStorage.getItem('chncak_satisfaction_surveys');
      const previousSurveys = savedSurveys ? JSON.parse(savedSurveys) : [];
      localStorage.setItem('chncak_satisfaction_surveys', JSON.stringify([survey, ...previousSurveys]));
      localStorage.setItem(`chncak_satisfaction_survey_submitted_${activeProfile.id}`, 'true');
      setSurveyAlreadySubmitted(true);
      setSurveyMessage('Merci. Votre questionnaire a bien été enregistré.');
      addNotification('Questionnaire envoyé', 'Merci pour votre avis sur le restaurant Ndamatou.', 'success');
      setSurveyGender('');
      setSurveyAgeRange('');
      setSurveyFrequency('');
      setSurveyRatings({});
      setSurveyGlobalSatisfaction('');
      setSurveyImprovementText('');
    } catch (error) {
      console.error(error);
      setSurveyMessage("Enregistrement impossible. Si vous avez déjà validé le questionnaire, une deuxième réponse est bloquée.");
      addNotification('Questionnaire non enregistré', "Firebase n'a pas accepté le questionnaire. Réessayez après la mise à jour.", 'warning');
    } finally {
      setIsSubmittingSurvey(false);
    }
  };

  const authorizeFutureDelivery = async (profile: UserProfile, scope: 'daily' | 'weekly' | 'monthly' | 'permanent') => {
    if (!hasActiveDeliveryPreAuthorization(profile) && serviceDeliveryQuota > 0 && serviceDeliverySelectionsToday >= serviceDeliveryQuota) {
      setDeliverySelectionMessage(`Quota quotidien atteint pour ${activeProfile.department}: ${serviceDeliverySelectionsToday} / ${serviceDeliveryQuota} activation(s).`);
      return;
    }
    const expires = new Date(now);
    if (scope === 'daily') expires.setHours(23, 59, 59, 999);
    if (scope === 'weekly') expires.setDate(expires.getDate() + 7);
    if (scope === 'monthly') expires.setMonth(expires.getMonth() + 1);
    const labelByScope = {
      daily: 'journalière',
      weekly: 'hebdomadaire',
      monthly: 'mensuelle',
      permanent: 'permanente',
    };
    await onUpdateProfile({
      ...profile,
      deliveryPreAuthorizedById: activeProfile.id,
      deliveryPreAuthorizedByName: activeProfile.name,
      deliveryPreAuthorizedScope: scope,
      deliveryPreAuthorizedUntil: scope === 'permanent' ? '' : expires.toISOString(),
    });
    setDeliverySelectionMessage(`${profile.name}: activation ${labelByScope[scope]} enregistrée. Sa prochaine commande passera automatiquement en livraison.`);
  };

  const printServiceDeliverySelectionList = () => {
    const escapeHtml = (value: unknown) => String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
    const sections = deliveryServiceProfilesByDepartment.map(([service, serviceProfiles]) => `
      <section class="service">
        <h2>${escapeHtml(service)} <span>${serviceProfiles.length} agent(s)</span></h2>
        <table>
          <thead>
            <tr><th>Nom et prénom</th><th>Badge</th><th>Téléphone</th><th>État livraison</th><th>Commandes actives</th></tr>
          </thead>
          <tbody>
            ${serviceProfiles.map(profile => {
              const activeOrdersCount = orders.filter(order => order.employeeId === profile.id && ['pending', 'preparing'].includes(order.status) && order.fulfillmentMode !== 'delivery').length;
              const preAuthorized = hasActiveDeliveryPreAuthorization(profile);
              return `
                <tr>
                  <td>${escapeHtml(profile.name)}</td>
                  <td>${escapeHtml(profile.badgeNumber)}</td>
                  <td>${escapeHtml(profile.phone || '')}</td>
                  <td>${preAuthorized ? escapeHtml(profile.deliveryPreAuthorizedScope || 'active') : 'Non activée'}</td>
                  <td>${activeOrdersCount}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </section>
    `).join('');
    const printWindow = window.open('', '_blank', 'width=900,height=720');
    if (!printWindow) return;
    printWindow.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Livraison service Ndamatou</title>
      <style>
        body{font-family:Arial,sans-serif;color:#0f172a;padding:26px}
        header{border-bottom:3px solid #1d4ed8;padding-bottom:12px;margin-bottom:18px}
        h1{font-size:20px;margin:0}.meta{font-size:12px;color:#64748b;margin-top:5px}
        .service{break-inside:avoid;page-break-inside:avoid;margin-top:18px}
        h2{background:#dbeafe;color:#1e3a8a;border:1px solid #bfdbfe;border-radius:10px;padding:10px 12px;font-size:14px;text-transform:uppercase;display:flex;justify-content:space-between}
        table{width:100%;border-collapse:collapse;margin-top:8px;font-size:11px}
        th,td{border:1px solid #dbeafe;padding:8px;text-align:left}
        th{background:#eff6ff;text-transform:uppercase;font-size:10px;color:#1e40af}
        footer{margin-top:22px;font-size:11px;color:#64748b}
      </style></head><body>
        <header>
          <h1>Liste de sélection livraison service - Ndamatou</h1>
          <div class="meta">Responsable: ${escapeHtml(activeProfile.name)} · Services visibles: ${escapeHtml(deliveryReadableDepartments.join(', '))} · ${new Date().toLocaleString('fr-FR')}</div>
        </header>
        ${sections || '<p>Aucun personnel visible pour ce compte.</p>'}
        <footer>Document d’aide au suivi des activations de livraison par service.</footer>
        <script>window.onload=()=>window.print()</script>
      </body></html>`);
    printWindow.document.close();
  };

  const deactivateFutureDelivery = async (profile: UserProfile) => {
    await onUpdateProfile({
      ...profile,
      deliveryPreAuthorizedById: activeProfile.id,
      deliveryPreAuthorizedByName: activeProfile.name,
      deliveryPreAuthorizedScope: 'daily',
      deliveryPreAuthorizedUntil: '1970-01-01T00:00:00.000Z',
    });
    setDeliverySelectionMessage(`${profile.name}: activation livraison désactivée. Ses prochaines commandes resteront sur place sauf nouvelle activation.`);
  };

  const colleagues = profiles
    .filter(profile => profile.role === 'employee' && profile.id !== activeProfile.id)
    .sort((a, b) => a.name.localeCompare(b.name));
  const selectedMessageRecipient = colleagues.find(profile => profile.id === selectedMessageRecipientId);
  const visibleMessages = messages.filter(message =>
    message.author === activeProfile.name ||
    message.recipientId === activeProfile.id ||
    message.recipientId === selectedMessageRecipientId
  );

  useEffect(() => {
    if (!selectedMessageRecipientId && colleagues.length > 0) {
      setSelectedMessageRecipientId(colleagues[0].id);
    }
  }, [colleagues, selectedMessageRecipientId]);

  const showSharedRestaurantScanExitScreen = restaurantScanResult?.status === 'ok' && isActiveRestaurantPresence;

  return (
    <div className="space-y-5 pb-20 sm:pb-0">
      {/* 1. Account Switcher & Profile Quick Info */}
      <div id="employee-welcome-banner" className="bg-gradient-to-r from-blue-600 to-indigo-700 text-white rounded-3xl p-4 sm:p-6 shadow-md border border-blue-500/10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center backdrop-blur-md">
            <User className="w-8 h-8 text-white" />
          </div>
          <div>
            <span className="text-blue-250 text-xs font-mono tracking-wider block">PERSONNEL DU Ndamatou</span>
            <h2 className="text-lg sm:text-xl font-bold font-sans flex items-center gap-2">
              Bonsoir, {activeProfile.name}
            </h2>
            <p className="text-xs text-blue-100 flex items-center gap-1 mt-1 font-sans">
              <Building2 className="w-3.5 h-3.5" />
              {activeProfile.department} - {activeProfile.building}, Ch. {activeProfile.room}
            </p>
          </div>
        </div>

        {/* Biometric Badge Wallet Balance representation */}
        <div className="bg-white p-3 rounded-2xl border border-blue-100 shadow-sm flex items-center gap-3 w-full sm:w-auto">
          <div className="p-2 bg-blue-500 rounded-xl">
            <Coins className="w-5 h-5 text-white" />
          </div>
          <div>
            <span className="text-[10px] text-slate-600 block font-sans font-black uppercase">Solde Badge Repas</span>
            <span className="font-mono text-lg font-extrabold tracking-tight text-slate-950">
              {activeProfile.walletBalance.toLocaleString('fr-FR')} FCFA
            </span>
            {badgeSyncInProgress && (
              <span className="mt-1 block text-[10px] font-black text-cyan-700">
                Synchronisation du badge en cours...
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4">
        <div className={`rounded-3xl p-5 border shadow-sm ${canPlaceOrderNow ? 'bg-blue-50 border-blue-100' : 'bg-red-50 border-red-100'}`}>
          <p className="text-[10px] uppercase tracking-widest font-black text-slate-500">Commande repas {isWeekendClosed ? 'fermée le week-end' : orderWindowLabel}</p>
          <div className={`text-4xl font-black font-mono mt-2 ${canPlaceOrderNow ? 'text-blue-700' : 'text-red-700'}`}>{remainingLabel}</div>
          <p className="text-xs text-slate-600 mt-1">
            {isWeekendClosed ? `Réouverture dimanche à 19h.` : isOrderWindowOpen ? 'Temps restant pour commander.' : now < orderStart ? 'Ouverture des commandes dans :' : `Commande fermée. Appelez ${lateOrderPhone}.`}
          </p>
        </div>
        <div className="lg:col-span-2 bg-white rounded-3xl p-5 border border-slate-100 shadow-sm">
          <p className="text-[10px] uppercase tracking-widest font-black text-slate-500 mb-3">
            {todayMeals.filter(meal => meal.category === 'plat').length} plat(s) chaud(s) disponible(s) aujourd'hui
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {todayMeals.filter(meal => meal.category === 'plat').map(meal => (
              <div key={meal.id} className="rounded-2xl bg-slate-50 border border-slate-100 p-3">
                <p className="text-xs font-bold text-slate-800 truncate">{meal.name}</p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <div className="rounded-xl border border-blue-100 bg-white p-2">
                    <p className="text-2xl font-black text-blue-700">{meal.stock}</p>
                    <p className="text-[10px] font-bold text-slate-500">à commander</p>
                  </div>
                  <div className="rounded-xl border border-blue-100 bg-blue-50 p-2">
                    <p className="text-2xl font-black text-blue-700">{getPhysicalRemaining(meal)}</p>
                    <p className="text-[10px] font-bold text-blue-700">restant physiquement</p>
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-[10px] font-black">
                  <span className="rounded-lg bg-blue-100 px-2 py-1.5 text-blue-800">Restaurant : {getPickupDeliveredToday(meal)}</span>
                  <span className="rounded-lg bg-indigo-100 px-2 py-1.5 text-indigo-800">Livraison : {getDeliveryDeliveredToday(meal)}</span>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-3 border-t border-slate-100 pt-2 text-[10px] leading-relaxed text-slate-500">
            <strong>À commander</strong> : portions encore réservables. <strong>Restant physiquement</strong> : portions non encore remises.
            <strong> Restaurant</strong> : repas remis sur place. <strong>Livraison</strong> : repas remis dans les services.
          </p>
        </div>
      </div>

      <div className="rounded-3xl border-2 border-blue-200 bg-blue-50 p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-blue-700">Places libres maintenant au restaurant</p>
            <p className="mt-1 text-xs font-bold text-blue-800">Masqué par défaut pour alléger l'application pendant les heures de forte utilisation.</p>
          </div>
          <button
            type="button"
            onClick={() => {
              const nextValue = !showRestaurantPlaces;
              setShowRestaurantPlaces(nextValue);
              if (nextValue) onRequestRestaurantPlaces?.();
            }}
            className="px-4 py-2.5 rounded-xl bg-blue-700 text-white text-xs font-black hover:bg-blue-800"
          >
            {showRestaurantPlaces ? 'Masquer les places' : 'Afficher les places'}
          </button>
        </div>
        {showRestaurantPlaces && (
          <div className="mt-4 rounded-2xl bg-white/70 border border-blue-100 p-4">
            <p className="text-4xl font-black text-blue-950">{restaurantPlacesLoaded ? `${restaurantPlacesFreeLabel} / ${restaurantCapacity}` : 'Chargement...'}</p>
            <p className="mt-1 text-xs font-black text-blue-800">{restaurantPlacesOccupied} place(s) occupée(s) actuellement</p>
            <p className="mt-3 max-w-2xl text-xs font-bold text-blue-800">
              Ce bloc affiche les places libres, pas les places occupées. Une place devient occupée après validation du repas au restaurant, puis se libère après scan sortie ou expiration automatique.
            </p>
          </div>
        )}
      </div>

      {unclaimedExpirationEnabled && unclaimedGraceEnabled && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
          <strong>{remainingRefundsThisWeek} remboursement(s) restant(s) cette semaine</strong> pour annuler ou modifier une commande avant 12h. Quota hebdomadaire: {unclaimedGracePerWeek}. Après {unclaimedExpirationTime}, les repas non récupérés restent perdus sans remboursement automatique.
        </div>
      )}

      {activeProfile.deliveryCodeViewer && deliveryAuthorizationMode === 'codes' && (
        <div className="rounded-2xl border-2 border-blue-300 bg-blue-50 p-4 text-blue-950 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-wider text-blue-700">Code livraison communiqué par l'administration</p>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
            <p className="text-4xl font-black tracking-[0.3em]">{getPersonalDeliveryCode(now, deliveryCodeSeed, activeProfile.id)}</p>
            <p className="text-xs font-bold text-blue-700">
              Valable jusqu'au {deliveryAccessCodeExpiresAt ? new Date(deliveryAccessCodeExpiresAt).toLocaleString('fr-FR') : 'prochain renouvellement'}
            </p>
          </div>
          <p className="mt-2 text-[10px] font-bold text-blue-700">Ce code fonctionne uniquement pour les agents du service {activeProfile.department}.</p>
        </div>
      )}


      {/* 3. Primary Section Tab Bar Navigation */}
      <div className="sticky top-2 z-20 flex border-2 border-slate-950 gap-2 bg-slate-100 p-1 rounded-xl shadow-sm overflow-x-auto employee-mobile-tabs">
        <button
          id="tab-menu-today"
          onClick={() => setActiveTab('menu')}
          className={`min-w-[92px] sm:min-w-0 sm:flex-1 flex items-center justify-center gap-2 py-3.5 px-3 sm:px-1 rounded-lg border text-xs sm:text-sm font-semibold transition cursor-pointer ${
            activeTab === 'menu'
              ? 'bg-slate-950 text-white border-slate-950 shadow-md shadow-slate-900/20'
              : 'bg-white text-slate-800 border-slate-700 hover:text-blue-800 hover:bg-blue-50 hover:border-slate-950'
          }`}
        >
          <ShoppingBag className="w-4 h-4" />
          <span className="sm:hidden">Commander</span>
          <span className="hidden sm:inline">Menus du Jour</span>
        </button>
        <button
          id="tab-profile-setup"
          onClick={() => setActiveTab('profile')}
          className={`min-w-[92px] sm:min-w-0 sm:flex-1 flex items-center justify-center gap-2 py-3.5 px-3 sm:px-1 rounded-lg border text-xs sm:text-sm font-semibold transition cursor-pointer ${
            activeTab === 'profile'
              ? 'bg-slate-950 text-white border-slate-950 shadow-md shadow-slate-900/20'
              : 'bg-white text-slate-800 border-slate-700 hover:text-blue-800 hover:bg-blue-50 hover:border-slate-950'
          }`}
        >
          <User className="w-4 h-4" />
          <span className="sm:hidden">Badge</span>
          <span className="hidden sm:inline">Mon badge & recharges</span>
        </button>
        <button
          id="tab-history"
          onClick={() => setActiveTab('history')}
          className={`min-w-[92px] sm:min-w-0 sm:flex-1 flex items-center justify-center gap-2 py-3.5 px-3 sm:px-1 rounded-lg border text-xs sm:text-sm font-semibold transition cursor-pointer ${
            activeTab === 'history'
              ? 'bg-slate-950 text-white border-slate-950 shadow-md shadow-slate-900/20'
              : 'bg-white text-slate-800 border-slate-700 hover:text-blue-800 hover:bg-blue-50 hover:border-slate-950'
          }`}
        >
          <History className="w-4 h-4" />
          <span className="sm:hidden">Historique</span>
          <span className="hidden sm:inline">Mon historique ({activeEmployeeOrders.length})</span>
        </button>
        <button
          id="tab-menu-tomorrow"
          onClick={() => setActiveTab('nextday')}
          className={`min-w-[92px] sm:min-w-0 sm:flex-1 flex items-center justify-center gap-2 py-3.5 px-3 sm:px-1 rounded-lg border text-xs sm:text-sm font-semibold transition relative cursor-pointer ${
            activeTab === 'nextday'
              ? 'bg-slate-950 text-white border-slate-950 shadow-md shadow-slate-900/20'
              : !surveyAlreadySubmitted
                ? 'bg-yellow-100 text-red-800 border-4 border-red-600 shadow-lg shadow-yellow-500/40 animate-pulse hover:bg-yellow-200 hover:border-red-700'
              : 'bg-white text-slate-800 border-slate-700 hover:text-blue-800 hover:bg-blue-50 hover:border-slate-950'
          }`}
        >
          <Calendar className="w-4 h-4" />
          <span className="sm:hidden">Satisfaction</span>
          <span className="hidden sm:inline">Questionnaire de satisfaction</span>
        </button>
        <button
          id="tab-messages"
          onClick={() => setActiveTab('messages')}
          className={`min-w-[92px] sm:min-w-0 sm:flex-1 flex items-center justify-center gap-2 py-3.5 px-3 sm:px-1 rounded-lg border text-xs sm:text-sm font-semibold transition cursor-pointer ${
            activeTab === 'messages'
              ? 'bg-slate-950 text-white border-slate-950 shadow-md shadow-slate-900/20'
              : 'bg-white text-slate-800 border-slate-700 hover:text-blue-800 hover:bg-blue-50 hover:border-slate-950'
          }`}
        >
          <MessageCircle className="w-4 h-4" />
          <span className="sm:hidden">Messages</span>
          <span className="hidden sm:inline">Messagerie</span>
        </button>
        {activeProfile.deliveryCodeViewer && deliveryAuthorizationMode === 'selection' && (
          <button
            id="tab-delivery-service"
            onClick={() => setActiveTab('delivery-service')}
            className={`min-w-[110px] sm:min-w-0 sm:flex-1 flex items-center justify-center gap-2 py-3.5 px-3 sm:px-1 rounded-lg border text-xs sm:text-sm font-semibold transition cursor-pointer ${
              activeTab === 'delivery-service'
                ? 'bg-blue-800 text-white border-blue-950 shadow-md'
                : 'bg-blue-50 text-blue-950 border-blue-700 hover:bg-blue-100'
            }`}
          >
            <Building2 className="w-4 h-4" />
            <span>Livraison service</span>
          </button>
        )}
      </div>

      {/* 4. Tab Views rendering */}
      <AnimatePresence mode="wait">
        {activeTab === 'menu' && (
          <motion.div
            key="today-menu-view"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="grid grid-cols-1 lg:grid-cols-3 gap-6"
          >
            {/* Left side: Search, Categories & Meals list */}
            <div className="lg:col-span-2 space-y-6">
              {/* Search & Category badges */}
              <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-50 space-y-4">
                <div className="relative">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                  <input
                    type="text"
                    placeholder="Rechercher un plat sénégalais, une salade, boisson..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs"
                    >
                      Effacer
                    </button>
                  )}
                </div>

                {/* Categories */}
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setSelectedCategory('all')}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold uppercase transition cursor-pointer ${
                      selectedCategory === 'all'
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-100'
                    }`}
                  >
                    Tout ({todayMeals.length})
                  </button>
                  {(['entrée', 'plat', 'dessert', 'boisson'] as MealCategory[]).map(cat => {
                    const count = todayMeals.filter(m => m.category === cat).length;
                    const isTemporarilyDisabled = cat !== 'plat' && !extrasOrderingEnabled;
                    return (
                      <button
                        key={cat}
                        onClick={() => {
                          if (isTemporarilyDisabled) {
                            addNotification('En attente d’activation', 'Cette option est en attente d’activation.', 'info');
                            return;
                          }
                          setSelectedCategory(cat);
                        }}
                        className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold uppercase transition flex items-center gap-1 cursor-pointer ${
                          selectedCategory === cat
                            ? 'bg-blue-600 text-white'
                            : isTemporarilyDisabled
                              ? 'bg-slate-100 text-slate-400 border border-slate-200'
                              : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-100'
                        }`}
                      >
                        {cat === 'entrée' && '🥣 Entrées'}
                        {cat === 'plat' && '🥩 Plats Chauds'}
                        {cat === 'dessert' && '🍰 Desserts'}
                        {cat === 'boisson' && '🥤 Boissons'}
                        <span className={`text-[10px] ml-1 rounded px-1 ${selectedCategory === cat ? 'bg-blue-800 text-white' : 'bg-slate-200 text-slate-700'}`}>
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Meals Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredMeals.length === 0 ? (
                  <div className="col-span-full py-12 text-center bg-white rounded-2xl border border-slate-100 text-gray-400">
                    <p>Aucun repas ne correspond à votre recherche ou catégorie.</p>
                  </div>
                ) : (
                  filteredMeals.map((meal) => {
                    const cartItem = cart.find(item => item.meal.id === meal.id);
                    const qtyInCart = cartItem?.quantity || 0;
                    const isLowStock = meal.stock > 0 && meal.stock <= 4;
                    const isOutOfStock = meal.stock === 0;

                    return (
                      <div
                        key={meal.id}
                        className={`bg-white rounded-2xl border p-4 flex flex-col justify-between transition group hover:shadow-md ${
                          qtyInCart > 0 ? 'border-blue-400 ring-2 ring-blue-400/10' : 'border-slate-100'
                        } ${isOutOfStock ? 'opacity-60 bg-slate-50/50' : ''}`}
                      >
                        <div>
                          {/* Card Top */}
                          <div className="flex justify-between items-start gap-2">
                            <span className="text-3xl p-2 bg-slate-50 rounded-xl group-hover:scale-110 transition duration-300">
                              {getMealVisual(meal.image)}
                            </span>
                            <div className="text-right">
                              <span className="font-mono text-base font-extrabold text-blue-700">
                                {(meal.category === 'plat' ? staffMealPrice : meal.price).toLocaleString('fr-FR')} FCFA
                              </span>
                              {meal.category === 'plat' ? (
                                <span className="block text-[10px] text-slate-400 line-through">
                                  Prix réel {realMealPrice.toLocaleString('fr-FR')} F
                                </span>
                              ) : (
                                <span className="block text-[10px] text-slate-400">
                                  Prix réel, non subventionné
                                </span>
                              )}
                              <span className="block text-[10px] text-blue-700 font-bold mt-1">
                                {getDeliveredToday(meal)} plat(s) déjà remis
                              </span>
                              {meal.category === 'plat' && meal.tokenColor && (
                                <span className={`inline-flex mt-1 rounded-full border px-2 py-0.5 text-[10px] font-black uppercase ${getTokenColorClass(meal.tokenColor)}`}>
                                  Jeton {meal.tokenColor}
                                </span>
                              )}
                              {isOutOfStock ? (
                                <span className="block text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full font-extrabold mt-1">
                                  Épuisé
                                </span>
                              ) : isLowStock ? (
                                <span className="block text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-semibold mt-1">
                                  Reste {meal.stock} portions
                                </span>
                              ) : (
                                <span className="block text-[10px] text-blue-600 font-semibold font-mono mt-1">
                                  Disponible
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Info */}
                          <div className="mt-3">
                            <h4 className="font-bold text-slate-900 group-hover:text-blue-700 transition font-sans leading-tight">
                              {meal.name}
                            </h4>
                            {meal.category === 'plat' && meal.tokenColor && (
                              <p className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-black ${getTokenColorClass(meal.tokenColor)}`}>
                                Couleur du jeton: {meal.tokenColor}
                              </p>
                            )}
                            <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                              {meal.description}
                            </p>
                            <div className="mt-3 rounded-xl bg-blue-50 border border-blue-100 p-2 text-[10px] text-slate-700">
                              <div className="flex justify-between">
                                <span>Total personnel</span>
                                <strong>{(meal.category === 'plat' ? staffMealPrice : meal.price).toLocaleString('fr-FR')} F</strong>
                              </div>
                              <div className="flex justify-between">
                                <span>Part hôpital</span>
                                <strong>
                                  {meal.category === 'plat'
                                    ? `${hospitalSupportAmount.toLocaleString('fr-FR')} F (${getHospitalSupportPercent(realMealPrice)}%)`
                                    : '0 F'}
                                </strong>
                              </div>
                            </div>
                          </div>

                          {/* Calories and allergens */}
                          <div className="flex flex-wrap gap-1.5 mt-3">
                            <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md flex items-center gap-1 font-mono">
                              <Flame className="w-3 h-3 text-orange-500" />
                              {meal.calories} kcal
                            </span>
                            {meal.allergens.map(al => (
                              <span key={al} className="text-[10px] bg-red-50 text-red-650 px-2 py-0.5 rounded-md">
                                Attention : {al}
                              </span>
                            ))}
                          </div>
                        </div>

                        {/* Card Action footer */}
                        <div className="mt-4 pt-3 border-t border-slate-50 flex items-center justify-between">
                          <span className="text-[11px] uppercase tracking-wide text-slate-400 font-bold">
                            {meal.category}
                          </span>

                          <div className="flex items-center gap-1">
                            {qtyInCart > 0 && (
                              <>
                                <button
                                  id={`btn-dec-cart-${meal.id}`}
                                  onClick={() => removeFromCart(meal.id)}
                                  className="w-8 h-8 rounded-full border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 flex items-center justify-center transition cursor-pointer"
                                >
                                  <Minus className="w-3.5 h-3.5" />
                                </button>
                                <span className="w-6 text-center text-sm font-bold font-mono">
                                  {qtyInCart}
                                </span>
                              </>
                            )}
                            <button
                              id={`btn-add-cart-${meal.id}`}
                              disabled={isOutOfStock}
                              onClick={() => addToCart(meal)}
                              className={`min-h-9 rounded-xl px-3 py-2 text-xs font-black flex items-center justify-center transition cursor-pointer ${
                                isOutOfStock
                                  ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                  : 'bg-blue-600 text-white hover:bg-blue-700'
                              }`}
                            >
                              Ajouter à mon panier
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Right side: Interactive Cart panel */}
            <div className="lg:col-span-1">
              <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100 sticky top-6 space-y-5 flex flex-col justify-between min-h-[460px]">
                <div>
                  <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-2">
                      <ShoppingBag className="w-5 h-5 text-blue-600 font-bold" />
                      <h3 className="font-bold text-slate-900">Mon Panier Repas</h3>
                    </div>
                    {cart.length > 0 && (
                      <button
                        onClick={clearCart}
                        className="text-xs text-red-500 hover:text-red-700 transition"
                      >
                        Vider
                      </button>
                    )}
                  </div>

                  {/* Cart Body */}
                  <div className="mt-4 space-y-4 max-h-72 overflow-y-auto pr-1">
                    {cart.length === 0 ? (
                      <div className="text-center py-10 text-slate-400 space-y-2">
                        <ShoppingBag className="w-10 h-10 mx-auto text-slate-200 stroke-[1.5]" />
                        <p className="text-xs font-medium">Votre panier est vide</p>
                        <p className="text-[11px] text-slate-400">Sélectionnez des plats à gauche pour passer commande.</p>
                      </div>
                    ) : (
                      cart.map(item => (
                        <div key={item.meal.id} className="flex gap-3 justify-between items-start text-xs pb-3 border-b border-slate-50">
                          <span className="text-xl p-1 bg-slate-50 rounded">{getMealVisual(item.meal?.image)}</span>
                          <div className="flex-1 min-w-0">
                            <h5 className="font-semibold text-slate-800 truncate">{(item.meal?.name || 'Repas')}</h5>
                            <span className="text-gray-400 font-mono mt-0.5 block">
                              {item.meal.mealType === 'special_dinner'
                                ? `Dîner spécial: ${item.meal.price.toLocaleString('fr-FR')} F`
                                : item.meal.category !== 'plat'
                                  ? `${item.quantity} x ${item.meal.price.toLocaleString('fr-FR')} F`
                                : item.quantity === 1
                                  ? `1re portion: ${staffMealPrice.toLocaleString('fr-FR')} FCFA`
                                  : `1re portion: ${staffMealPrice.toLocaleString('fr-FR')} F + portions suivantes: ${realMealPrice.toLocaleString('fr-FR')} F chacune`}
                            </span>
                            <span className="text-[10px] text-blue-700 block">
                              {item.meal.mealType === 'special_dinner'
                                ? 'Commande spéciale non subventionnée'
                                : item.meal.category === 'plat'
                                  ? `Subvention hôpital: ${hospitalSupportAmount.toLocaleString('fr-FR')} F sur la 1re portion`
                                  : "Produit non subventionné par l'hôpital"}
                            </span>
                          </div>
                          <div className="text-right font-mono font-bold text-slate-900 shrink-0">
                            {getItemTotal(item).toLocaleString('fr-FR')} F
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Delivery Location Summary */}
                  {cart.length > 0 && (
                    <div className="mt-4 bg-blue-50/50 p-3 rounded-xl border border-blue-100/40 space-y-3 text-xs text-slate-700">
                      <div>
                        <div className="font-semibold text-blue-900 flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5 text-blue-600" />
                          Mode de retrait
                        </div>
                        <div className="grid grid-cols-2 gap-2 mt-2">
                          <button
                            type="button"
                            onClick={() => {
                              if (!isDeliveryMandatory) setFulfillmentMode('pickup');
                            }}
                            disabled={isDeliveryMandatory}
                            title={isDeliveryMandatory ? "La livraison est obligatoire pour ce compte autorisé par l'administration." : 'Consommer sur place'}
                            className={`rounded-lg border px-3 py-2 font-bold transition ${
                              isDeliveryMandatory
                                ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400 opacity-70'
                                : fulfillmentMode === 'pickup'
                                ? 'bg-blue-600 text-white border-blue-600'
                                : 'bg-white text-slate-700 border-slate-200 hover:border-blue-300'
                            }`}
                          >
                            Sur place
                          </button>
                          <button
                            type="button"
                            onClick={() => setFulfillmentMode('delivery')}
                            disabled={deliveryAuthorizationMode === 'selection' && !isDeliveryMandatory}
                            title={deliveryAuthorizationMode === 'selection' && !isDeliveryMandatory ? "Dans ce mode, un responsable habilité de votre service doit sélectionner votre commande." : 'Demander la livraison'}
                            className={`rounded-lg border px-3 py-2 font-bold transition ${
                              deliveryAuthorizationMode === 'selection' && !isDeliveryMandatory
                                ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400 opacity-70'
                                : fulfillmentMode === 'delivery'
                                ? 'bg-blue-600 text-white border-blue-600'
                                : 'bg-white text-slate-700 border-slate-200 hover:border-blue-300'
                            }`}
                          >
                            Livraison
                          </button>
                        </div>
                        {isDeliveryMandatory && (
                          <p className="mt-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-[10px] font-bold text-blue-800">
                            Livraison sélectionnée automatiquement : ce compte est autorisé à recevoir ses repas dans son service.
                          </p>
                        )}
                        {deliveryAuthorizationMode === 'selection' && !isDeliveryMandatory && (
                          <p className="mt-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-[10px] font-bold text-blue-800">
                            La livraison sera activée par un responsable habilité de votre service entre {deliverySelectionStart} et {deliverySelectionEnd}.
                          </p>
                        )}
                      </div>
                      {requiresDeliveryIssuerCode && (
                        <div>
                          <label className="text-[10px] font-black uppercase text-slate-500">Code personnel du responsable habilité</label>
                          <input
                            type="password"
                            autoComplete="one-time-code"
                            inputMode="numeric"
                            maxLength={4}
                            value={deliveryCodeInput}
                            onChange={(e) => setDeliveryCodeInput(e.target.value.replace(/\D/g, '').slice(0, 4))}
                            placeholder="Code à 4 chiffres"
                            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-blue-500"
                          />
                          <p className="text-[10px] text-slate-500 mt-1">
                            Le code doit provenir d'un responsable habilité appartenant au service {activeProfile.department}.
                          </p>
                          {authorizedCodeIssuers.length > 0 ? (
                            <p className="mt-2 text-[10px] font-bold text-blue-700">
                              Responsables habilités dans votre service : {authorizedCodeIssuers.map(profile => profile.name).join(', ')}.
                            </p>
                          ) : (
                            <p className="mt-2 text-[10px] font-bold text-amber-700">
                              Aucun responsable de votre service n'est actuellement habilité à délivrer un code.
                            </p>
                          )}
                          <p className={`mt-2 text-[10px] font-black ${deliveryCodeUsageLimitReached ? 'text-red-700' : 'text-blue-700'}`}>
                            Utilisations pendant la période actuelle : {deliveryCodeUsesInCurrentWindow} / {deliveryCodeMaxUsesPer24h}.
                          </p>
                        </div>
                      )}
                      {fulfillmentMode === 'delivery' ? (
                        <div className="space-y-2">
                          <p className="font-mono text-slate-600 text-[11px]">
                            {activeProfile.building} — {activeProfile.floor} — {activeProfile.room}
                          </p>
                          <p className={`rounded-lg px-3 py-2 text-[10px] font-black ${deliveryFeeEnabled ? 'bg-amber-50 text-amber-800 border border-amber-100' : 'bg-blue-50 text-blue-800 border border-blue-100'}`}>
                            {deliveryFeeEnabled
                              ? `Frais de livraison : ${Math.max(0, deliveryFeeAmount).toLocaleString('fr-FR')} FCFA, pris en charge par ${deliveryFeePayer === 'employee' ? 'le personnel' : "l'hôpital"}.`
                              : "Frais de livraison non activés par l'administration."}
                          </p>
                        </div>
                      ) : (
                        <p className="font-mono text-slate-600 text-[11px]">
                          Le repas sera préparé pour consommation sur place au restaurant.
                        </p>
                      )}
                    </div>
                  )}

                  {/* Special Notes Instructions */}
                  {cart.length > 0 && (
                    <div className="mt-3">
                      <label className="text-[11px] text-slate-500 font-bold uppercase block mb-1">
                        Instructions complémentaires (Allergies, piment...)
                      </label>
                      <input
                        type="text"
                        placeholder="Ex: sans piment, laisser devant la chambre..."
                        value={specialNotes}
                        onChange={(e) => setSpecialNotes(e.target.value)}
                        className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-100 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                  )}
                </div>

                {/* Cart Action Footer */}
                <div className="pt-4 border-t border-slate-100 space-y-3">
                  <div className="flex justify-between items-center text-sm">
                    <span className="font-medium text-slate-500">Total :</span>
                    <span className="font-mono text-lg font-extrabold text-slate-900">
                      {getCartTotal().toLocaleString('fr-FR')} FCFA
                    </span>
                  </div>
                  {cart.length > 0 && (
                    <div className="text-[11px] bg-blue-50 border border-blue-100 rounded-xl p-3 text-slate-700 space-y-1">
                      <div className="flex justify-between"><span>Prix réel repas</span><strong>{getCartRealTotal().toLocaleString('fr-FR')} F</strong></div>
                      <div className="flex justify-between"><span>Part supportée par l'hôpital</span><strong>{getCartHospitalSupport().toLocaleString('fr-FR')} F</strong></div>
                      {fulfillmentMode === 'delivery' && deliveryFeeEnabled && (
                        <div className="flex justify-between">
                          <span>Frais de livraison ({deliveryFeePayer === 'employee' ? 'personnel' : 'hôpital'})</span>
                          <strong>{Math.max(0, deliveryFeeAmount).toLocaleString('fr-FR')} F</strong>
                        </div>
                      )}
                    </div>
                  )}
                  {cart.length > 0 && !canPlaceOrderNow && (
                    <div className={`rounded-xl border p-3 text-[11px] font-bold ${
                      replacementOrderCredit && canCancelOrModifyWithRefundNow
                        ? 'border-blue-100 bg-blue-50 text-blue-800'
                        : 'border-red-100 bg-red-50 text-red-700'
                    }`}>
                      {replacementOrderCredit && canCancelOrModifyWithRefundNow
                        ? 'Modification autorisée avant 12h: cette nouvelle commande remplace une commande annulée et remboursée.'
                        : isWeekendClosed
                          ? `Les commandes sont verrouillées du vendredi 19h au dimanche 19h. Réouverture le ${weekendReopening.toLocaleString('fr-FR')}.`
                          : `Les commandes sont ouvertes selon la plage ${orderWindowLabel}. Pour une demande hors délai, appelez le ${lateOrderPhone}.`}
                    </div>
                  )}

                  <button
                    id="btn-goto-payment"
                    disabled={cart.length === 0}
                    onClick={() => {
                      if (!canPlaceOrderNow && !(replacementOrderCredit && canCancelOrModifyWithRefundNow)) {
                        addNotification(
                          isWeekendClosed ? 'Commandes fermées le week-end' : 'Commande hors délai',
                          isWeekendClosed ? 'Réouverture dimanche à 19h.' : `Les commandes sont ouvertes selon la plage ${orderWindowLabel}. Appelez le ${lateOrderPhone}.`,
                          'warning'
                        );
                        return;
                      }
                      if (remainingOrderAllowance === 0 || effectiveOrderedQuantity + currentCartQuantity > maxItemsPerOrder) {
                        addNotification('Limite de commande atteinte', `Vous avez déjà utilisé les ${maxItemsPerOrder} portion(s) autorisées pendant ce créneau.`, 'warning');
                        return;
                      }
                      setIsCheckoutOpen(true);
                    }}
                    className={`w-full py-3 px-4 rounded-xl font-bold text-sm tracking-wide transition flex items-center justify-center gap-2 cursor-pointer ${
                      cart.length === 0
                        ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                        : 'bg-blue-600 text-white hover:bg-blue-700 shadow-md shadow-blue-600/15'
                    }`}
                  >
                    Commander mon Repas
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* TAB 2: QUESTIONNAIRE DE SATISFACTION ET COMMANDES SPECIALES DINER */}
        {activeTab === 'nextday' && (
          <motion.div
            key="nextday-menu-view"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="space-y-6"
          >
            <div className="bg-gradient-to-r from-blue-50 to-cyan-50 border border-blue-100 p-5 rounded-2xl flex items-start gap-3">
              <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-bold text-blue-950">Questionnaire de satisfaction restaurant Ndamatou</h4>
                <p className="text-xs text-blue-800 mt-1 leading-relaxed">
                  Merci d'être venu(e) sur notre plateforme. En remplissant ce questionnaire de 5 à 10 minutes, vous nous aiderez à améliorer nos services.
                </p>
              </div>
            </div>

            {surveyAlreadySubmitted && (
              <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm font-bold text-blue-800">
                Questionnaire déjà validé. Une seule réponse est autorisée par agent afin d'éviter les doublons.
              </div>
            )}

            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-black text-slate-700 uppercase mb-2">Vous êtes</label>
                  <select
                    value={surveyGender}
                    onChange={event => setSurveyGender(event.target.value)}
                    disabled={surveyAlreadySubmitted}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-semibold"
                  >
                    <option value="">Choisir</option>
                    <option value="Homme">Un homme</option>
                    <option value="Femme">Une femme</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-700 uppercase mb-2">Tranche d'âge</label>
                  <select
                    value={surveyAgeRange}
                    onChange={event => setSurveyAgeRange(event.target.value)}
                    disabled={surveyAlreadySubmitted}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-semibold"
                  >
                    <option value="">Choisir</option>
                    <option value="21-30 ans">21-30 ans</option>
                    <option value="31-40 ans">31-40 ans</option>
                    <option value="41-50 ans">41-50 ans</option>
                    <option value="51 ans et plus">51 ans et plus</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-700 uppercase mb-2">Fréquence</label>
                  <select
                    value={surveyFrequency}
                    onChange={event => setSurveyFrequency(event.target.value)}
                    disabled={surveyAlreadySubmitted}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-semibold"
                  >
                    <option value="">Choisir</option>
                    <option value="Tous les jours ouvrables">Tous les jours ouvrables</option>
                    <option value="Plusieurs fois par semaine">Plusieurs fois par semaine</option>
                    <option value="Une fois par semaine">Une fois par semaine</option>
                    <option value="Une seule fois">Je n'y suis allé(e) qu'une fois</option>
                    <option value="Jamais">Jamais</option>
                  </select>
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="font-black text-slate-950 text-sm">Veuillez évaluer les affirmations suivantes</h4>
                {satisfactionStatements.map((statement, index) => (
                  <div key={statement.key} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                    <p className="text-sm font-bold text-slate-900 mb-3">
                      {String.fromCharCode(97 + index)}. {statement.label}
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
                      {satisfactionLikertChoices.map(choice => (
                        <label
                          key={choice}
                          className={`rounded-xl border px-3 py-2 text-[11px] font-bold cursor-pointer text-center ${
                            surveyRatings[statement.key] === choice
                              ? 'border-blue-600 bg-blue-600 text-white'
                              : 'border-slate-200 bg-white text-slate-700 hover:border-blue-300'
                          }`}
                        >
                          <input
                            type="radio"
                            name={`survey-${statement.key}`}
                            value={choice}
                            checked={surveyRatings[statement.key] === choice}
                            onChange={() => setSurveyRatings(prev => ({ ...prev, [statement.key]: choice }))}
                            disabled={surveyAlreadySubmitted}
                            className="sr-only"
                          />
                          {choice}
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div>
                <label className="block text-xs font-black text-slate-700 uppercase mb-2">Satisfaction globale</label>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                  {['Très satisfait', 'Satisfait', 'Moyennement satisfait', 'Pas satisfait'].map(choice => (
                    <label
                      key={choice}
                      className={`rounded-xl border px-3 py-3 text-xs font-black cursor-pointer text-center ${
                        surveyGlobalSatisfaction === choice
                          ? 'border-cyan-700 bg-cyan-700 text-white'
                          : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-cyan-300'
                      }`}
                    >
                      <input
                        type="radio"
                        name="survey-global-satisfaction"
                        value={choice}
                        checked={surveyGlobalSatisfaction === choice}
                        onChange={() => setSurveyGlobalSatisfaction(choice)}
                        disabled={surveyAlreadySubmitted}
                        className="sr-only"
                      />
                      {choice}
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-black text-slate-700 uppercase mb-2">
                  Que pourrions-nous améliorer ?
                </label>
                <textarea
                  value={surveyImprovementText}
                  onChange={event => setSurveyImprovementText(event.target.value)}
                  disabled={surveyAlreadySubmitted}
                  rows={5}
                  maxLength={2000}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Votre suggestion..."
                />
              </div>

              {surveyMessage && (
                <div className="rounded-2xl border border-blue-100 bg-blue-50 p-3 text-sm font-bold text-blue-800">
                  {surveyMessage}
                </div>
              )}

              {!surveyAlreadySubmitted && (
                <div className="rounded-2xl border-2 border-amber-200 bg-amber-50 p-4 text-center text-sm font-black text-amber-900">
                  Remplissez svp
                </div>
              )}

              <button
                type="button"
                onClick={submitSatisfactionSurvey}
                disabled={isSubmittingSurvey || surveyAlreadySubmitted}
                className="w-full sm:w-auto rounded-2xl bg-blue-700 px-6 py-3 text-sm font-black text-white hover:bg-blue-800 disabled:opacity-60"
              >
                {surveyAlreadySubmitted ? 'Questionnaire déjà validé' : isSubmittingSurvey ? 'Enregistrement...' : 'Valider le questionnaire'}
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <h3 className="font-black text-slate-950 text-base">Commandes spéciales dîner</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Le restaurateur propose ici des plats spéciaux. Chaque commande aide à prévoir le nombre de portions à préparer pour le dîner.
                </p>
              </div>
              {!specialDinnerEnabled ? (
                <div className="rounded-2xl border border-amber-100 bg-amber-50 p-6 text-sm text-amber-800 text-center font-bold">
                  En attente d'activation.
                </div>
              ) : specialDinnerMeals.length === 0 ? (
                <div className="rounded-2xl border border-slate-100 bg-white p-6 text-sm text-slate-400 text-center">
                  Aucun dîner spécial proposé pour le moment.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {specialDinnerMeals.map(meal => {
                    const qtyInCart = cart.find(item => item.meal.id === meal.id)?.quantity || 0;
                    return (
                      <div key={meal.id} className="bg-white rounded-2xl p-4 border border-violet-100 shadow-sm">
                        <div className="flex justify-between items-start gap-3">
                          <span className="text-3xl p-2 bg-violet-50 rounded-xl">{getMealVisual(meal.image)}</span>
                          <span className="font-mono text-sm font-extrabold text-violet-800 bg-violet-50 px-2 py-1 rounded-lg">
                            {meal.price.toLocaleString('fr-FR')} FCFA
                          </span>
                        </div>
                        <h4 className="font-bold text-slate-900 text-sm mt-3">{meal.name}</h4>
                        <p className="text-xs text-slate-500 mt-1.5 line-clamp-3">{meal.description}</p>
                        <button
                          type="button"
                          onClick={() => {
                            addToCart(meal);
                            addNotification('Dîner ajouté', `${meal.name} est ajouté au panier spécial dîner.`, 'success');
                            setActiveTab('menu');
                          }}
                          className="mt-4 w-full py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-black"
                        >
                          {qtyInCart > 0 ? `Ajouté x${qtyInCart}` : 'Commander pour dîner'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* TAB 3: HISTORIQUE & CONSOMMATIONS (Order status and consumption tracking) */}
        {activeTab === 'history' && (
          <motion.div
            key="history-menu-view"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="grid grid-cols-1 lg:grid-cols-3 gap-6"
          >
            {/* Left side: Orders list (Consumption log) */}
            <div className="lg:col-span-2 space-y-4">
              <h3 className="font-bold text-slate-900 text-base">Mon historique de consommation</h3>
              <p className="text-xs text-slate-500 -mt-2">
                Cet espace affiche uniquement les commandes liées à votre compte personnel.
              </p>
              <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
                <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-3 items-end">
                  <label className="text-xs font-bold text-slate-600">
                    Date début
                    <input
                      type="date"
                      value={historyStartDate}
                      onChange={(event) => setHistoryStartDate(event.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-900 outline-none focus:border-blue-500 focus:bg-white"
                    />
                  </label>
                  <label className="text-xs font-bold text-slate-600">
                    Date fin
                    <input
                      type="date"
                      value={historyEndDate}
                      onChange={(event) => setHistoryEndDate(event.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-900 outline-none focus:border-blue-500 focus:bg-white"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={exportPersonalHistoryExcel}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-xs font-black text-white hover:bg-blue-800"
                  >
                    <Printer className="w-4 h-4" />
                    Export Excel
                  </button>
                </div>
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                  <div className="rounded-xl bg-blue-50 px-3 py-2">
                    <span className="block text-slate-500 font-bold">Commandes période</span>
                    <strong className="text-blue-900">{filteredEmployeeOrders.length}</strong>
                  </div>
                  <div className="rounded-xl bg-blue-50 px-3 py-2">
                    <span className="block text-slate-500 font-bold">Dépenses période</span>
                    <strong className="text-blue-900">{filteredOrdersTotal.toLocaleString('fr-FR')} F</strong>
                  </div>
                  <div className="rounded-xl bg-amber-50 px-3 py-2">
                    <span className="block text-slate-500 font-bold">Recharges période</span>
                    <strong className="text-amber-900">{filteredRechargesTotal.toLocaleString('fr-FR')} F</strong>
                  </div>
                </div>
              </div>
              
              {filteredEmployeeOrders.length === 0 ? (
                <div className="py-12 bg-white rounded-2xl text-center border border-slate-100 text-gray-400">
                  Aucune commande sur cette période.
                </div>
              ) : (
                filteredEmployeeOrders.map((ord) => {
                  const isActive = !['delivered', 'returned', 'cancelled', 'expired'].includes(ord.status);
                  
                  return (
                    <div key={ord.id} className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm space-y-4">
                      {/* Top info card */}
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-sm text-slate-900 bg-slate-100 px-2 py-0.5 rounded">
                              #{ord.id}
                            </span>
                            <span className="text-xs text-slate-400 font-mono">
                              {new Date(ord.createdAt).toLocaleDateString('fr-FR')} à {new Date(ord.createdAt).toLocaleTimeString('fr-FR', {hour: '2-digit', minute:'2-digit'})}
                            </span>
                          </div>
                          <p className="mt-1 text-[11px] font-bold text-slate-500">
                            Service : {ord.department || activeProfile.department || 'Non renseigné'} · Téléphone : {ord.employeePhone || activeProfile.phone || 'Non renseigné'}
                          </p>
                          
                          {/* Items listed */}
                          <div className="text-xs font-medium text-slate-700 mt-2 space-y-1">
                            {ord.items.map((it, idx) => (
                              <div key={idx} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                                <div className="flex gap-1.5">
                                  <span className="text-gray-400">({it.quantity}x)</span>
                                  <span>{(it.meal?.name || 'Repas')}</span>
                                </div>
                                {ord.status === 'delivered' && (
                                  <div className="flex items-center gap-0.5">
                                    {[1, 2, 3, 4, 5].map(star => (
                                      <button
                                        key={star}
                                        type="button"
                                        onClick={() => it.meal?.id && rateMeal(it.meal.id, star)}
                                        className={`text-base leading-none ${(it.meal?.id && mealRatings[it.meal.id] >= star) ? 'text-amber-400' : 'text-slate-300'}`}
                                        title={`${star}/5`}
                                      >
                                        ★
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="text-right">
                          <span className="font-mono text-sm font-extrabold text-slate-950 block">
                            {ord.total.toLocaleString('fr-FR')} FCFA
                          </span>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-extrabold inline-block mt-2 ${
                            ord.status === 'delivered' ? 'bg-blue-100 text-blue-800' :
                            ord.status === 'cancelled' ? 'bg-red-100 text-red-800' :
                            ord.status === 'expired' ? 'bg-slate-900 text-white' :
                            ord.status === 'delivering' ? 'bg-blue-100 text-blue-800 animate-pulse' :
                            ord.status === 'preparing' ? 'bg-amber-100 text-amber-800' :
                            'bg-slate-100 text-slate-800'
                          }`}>
                            {ord.status === 'pending' && '⏳ En attente'}
                            {ord.status === 'preparing' && 'En cuisine'}
                            {ord.status === 'delivering' && 'En livraison'}
                            {ord.status === 'delivered' && '✅ Livrée'}
                            {ord.status === 'cancelled' && '❌ Annulée'}
                            {ord.status === 'expired' && `Expirée à ${unclaimedExpirationTime}`}
                          </span>
                        </div>
                      </div>

                      {ord.status === 'pending' && canCancelOrModifyWithRefundNow && (
                        <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                          <button
                            type="button"
                            onClick={async () => {
                              if (!window.confirm("Modifier cette commande ?\n\nLa commande actuelle sera annulée et remboursée car il est avant 12h. Vous pourrez ensuite choisir un autre menu.")) return;
                              const ok = await onCancelOrder(ord.id, { replacement: true });
                              if (!ok) return;
                              const quantity = ord.items.reduce((sum, item) => sum + item.quantity, 0);
                              const hotMealQuantity = ord.items.reduce((sum, item) => sum + (item.meal.category === 'plat' ? item.quantity : 0), 0);
                              setReplacementOrderCredit({ orderId: ord.id, quantity, hotMealQuantity });
                              setCart([]);
                              setActiveTab('menu');
                              addNotification(
                                'Commande remboursée',
                                'Votre ancienne commande est remboursée. Choisissez maintenant votre nouveau repas.',
                                'success',
                                ord.id
                              );
                            }}
                            className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-black text-white hover:bg-blue-700"
                          >
                            Modifier la commande
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (!window.confirm("Annuler cette commande ?\n\nComme il est avant 12h, le badge sera recrédité si la commande est encore en attente et non déjà traitée.")) return;
                              onCancelOrder(ord.id);
                            }}
                            className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-xs font-black text-red-700 hover:bg-red-100"
                          >
                            Annuler la commande
                          </button>
                        </div>
                      )}

                      {['pending', 'preparing'].includes(ord.status) && (ord.fulfillmentMode || 'pickup') === 'pickup' && (
                        <div className="rounded-xl border border-blue-200 bg-blue-50 p-3">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <p className="text-xs font-black text-blue-950">Besoin finalement d'une livraison ?</p>
                              <p className="mt-1 text-[10px] text-blue-700">Modification autorisée de 09h00 à 12h00 avec le code communiqué par l'administration.</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => changeExistingOrderToDelivery(ord)}
                              disabled={!canChangePickupToDeliveryNow}
                              className="rounded-xl bg-blue-700 px-4 py-2 text-xs font-black text-white disabled:cursor-not-allowed disabled:bg-slate-300"
                            >
                              Passer en livraison
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Display delivery building inside card */}
                      <div className="text-[11px] text-gray-400 flex items-center gap-1 font-mono">
                        <MapPin className="w-3 h-3 text-blue-600" />
                        {ord.fulfillmentMode === 'pickup'
                          ? 'Consommation sur place au restaurant'
                          : `Livraison : ${ord.building} - Étage ${ord.floor} - Salle ${ord.room}`}
                      </div>

                      {/* Timeline Steps for active service stages */}
                      {isActive && (
                        <div className="pt-4 border-t border-slate-50 bg-slate-50/50 p-3 rounded-xl">
                          <p className="text-[10px] font-extrabold text-blue-950 uppercase tracking-widest mb-3">Suivi en temps réel de ma commande</p>
                          <div className="relative pl-5 border-l border-blue-100 space-y-3">
                            {/* We always render status stages up to the current order status */}
                            {(['pending', 'preparing', 'delivering', 'delivered'] as OrderStatus[]).map((st, i) => {
                              const orderStatusIndex = ['pending', 'preparing', 'delivering', 'delivered'].indexOf(ord.status);
                              const stepIndex = ['pending', 'preparing', 'delivering', 'delivered'].indexOf(st);
                              const isCompleted = stepIndex <= orderStatusIndex;
                              const isCurrent = stepIndex === orderStatusIndex;

                              return (
                                <div key={st} className="relative text-xs">
                                  {/* Dot */}
                                  <span className={`absolute -left-[27px] top-1 w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center ${
                                    isCurrent ? 'bg-blue-600 border-white ring-4 ring-blue-500/15' :
                                    isCompleted ? 'bg-blue-600 border-white' : 'bg-white border-gray-200'
                                  }`} />
                                  <div className={`${isCurrent ? 'font-bold text-blue-950' : isCompleted ? 'text-gray-700' : 'text-gray-400'}`}>
                                    {st === 'pending' && '1. Confirmation de commande'}
                                    {st === 'preparing' && '2. Cuisines de l\'Hôpital'}
                                    {st === 'delivering' && '3. Livreur en route dans le bâtiment'}
                                    {st === 'delivered' && '4. Repas livré chaud !'}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
              <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
                <h4 className="text-sm font-black text-slate-950">Mes recharges badge</h4>
                <p className="mt-1 text-xs text-slate-500">Liste des recharges validées pour votre badge sur la période choisie.</p>
                <div className="mt-4 divide-y divide-slate-100">
                  {filteredRechargeHistory.length === 0 ? (
                    <div className="py-6 text-center text-sm text-slate-400">Aucune recharge sur cette période.</div>
                  ) : filteredRechargeHistory.map(transaction => (
                    <div key={transaction.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 py-3">
                      <div>
                        <p className="text-sm font-black text-slate-900">{Number(transaction.amount || 0).toLocaleString('fr-FR')} FCFA</p>
                        <p className="text-xs text-slate-500">
                          {new Date(transaction.createdAt).toLocaleDateString('fr-FR')} à {new Date(transaction.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                      <div className="text-xs text-slate-600 sm:text-right">
                        <p className="font-bold">{transaction.method === 'wave' ? 'Wave' : 'Espèces'}</p>
                        <p>Opérateur : {transaction.cashierName || 'Non tracé'}</p>
                        {transaction.note && <p className="text-slate-400">{transaction.note}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right side: Consumption analytics of this employee */}
            <div className="space-y-6">
              <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100">
                <h3 className="font-bold text-slate-900 text-sm mb-4">Mes Statistiques Mensuelles</h3>
                
                {/* Visual statistics representation */}
                <div className="space-y-4">
                  <div className="bg-blue-50/45 p-4 rounded-2xl flex justify-between items-center border border-blue-100/50">
                    <div>
                      <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Repas commandés</span>
                      <span className="text-2xl font-black text-blue-950">{filteredEmployeeOrders.length}</span>
                    </div>
                    <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold">
                      #
                    </div>
                  </div>

                  <div className="bg-blue-50/45 p-4 rounded-2xl flex justify-between items-center border border-blue-100/50">
                    <div>
                      <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Dépenses totales</span>
                      <span className="text-2xl font-black text-blue-950 font-mono">
                        {filteredOrdersTotal.toLocaleString('fr-FR')} F
                      </span>
                    </div>
                    <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-700">
                      FCFA
                    </div>
                  </div>

                  <div className="text-xs text-gray-500 p-2 text-center bg-slate-50 rounded-xl">
                    📈 Vos repas favoris : <span className="font-semibold text-slate-700">Thiéboudienne, Jus de Bissap</span>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {activeTab === 'messages' && (
          <motion.div
            key="messages-view"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="grid grid-cols-1 lg:grid-cols-3 gap-6"
          >
            <div className="lg:col-span-2 bg-white rounded-3xl border border-slate-100 shadow-sm p-6 space-y-4">
              <div>
                <h3 className="font-black text-slate-950">Messagerie du personnel Ndamatou</h3>
                <p className="text-xs text-slate-500 mt-1">Premier espace de discussion interne entre collègues.</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-[240px_1fr_auto] gap-2">
                <select
                  value={selectedMessageRecipientId}
                  onChange={(e) => setSelectedMessageRecipientId(e.target.value)}
                  className="px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {colleagues.length === 0 ? (
                    <option value="">Aucun collègue disponible</option>
                  ) : (
                    colleagues.map(colleague => (
                      <option key={colleague.id} value={colleague.id}>
                        {colleague.name} - {colleague.department}
                      </option>
                    ))
                  )}
                </select>
                <input
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') sendMessage();
                  }}
                  placeholder="Écrire un message aux collègues..."
                  className="flex-1 px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="button"
                  onClick={sendMessage}
                  className="px-5 py-3 rounded-xl bg-blue-600 text-white text-sm font-black hover:bg-blue-700"
                >
                  Envoyer
                </button>
              </div>
              {selectedMessageRecipient && (
                <p className="text-xs text-slate-500">
                  Conversation avec <span className="font-bold text-slate-800">{selectedMessageRecipient.name}</span>
                </p>
              )}
              <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
                {visibleMessages.length === 0 ? (
                  <div className="py-12 text-center text-slate-400 text-sm border border-dashed border-slate-200 rounded-2xl">
                    Aucun message pour le moment.
                  </div>
                ) : (
                  visibleMessages.map(message => (
                    <div key={message.id} className="rounded-2xl bg-slate-50 border border-slate-100 p-4">
                      <div className="flex justify-between gap-3 text-xs">
                        <span className="font-black text-slate-900">{message.author} → {message.recipientName}</span>
                        <span className="text-slate-400 font-mono">
                          {new Date(message.timestamp).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-sm text-slate-700 mt-2">{message.text}</p>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="bg-blue-50 rounded-3xl border border-blue-100 p-5 h-fit">
              <h4 className="font-black text-blue-950 text-sm">Règles de discussion</h4>
              <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                Utilisez cet espace pour les informations utiles au service, aux repas et à l'organisation interne. Les messages restent visibles sur ce poste.
              </p>
              <div className="mt-5 rounded-2xl bg-white border border-blue-100 p-4 space-y-3">
                <h4 className="font-black text-slate-950 text-sm">Boîte d'idées</h4>
                <p className="text-xs text-slate-500">
                  Les suggestions envoyées ici sont visibles uniquement par le restaurant et l'administrateur.
                </p>
                <textarea
                  value={ideaText}
                  onChange={(event) => setIdeaText(event.target.value)}
                  rows={4}
                  placeholder="Proposer une idée, une amélioration ou une remarque..."
                  className="w-full px-3 py-3 rounded-xl border border-slate-200 bg-slate-50 text-sm outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
                <button
                  type="button"
                  onClick={sendIdea}
                  disabled={isSendingIdea}
                  className="w-full px-4 py-3 rounded-xl bg-slate-950 disabled:opacity-50 text-white text-sm font-black hover:bg-slate-800"
                >
                  {isSendingIdea ? 'Envoi en cours...' : "Envoyer dans la boîte d'idées"}
                </button>
                {ideaMessage && <p className="text-xs font-bold text-slate-600">{ideaMessage}</p>}
              </div>
            </div>
          </motion.div>
        )}

        {/* TAB 4: PROFILE MANAGEMENT AND CARD TOPUP */}
        {activeTab === 'delivery-service' && activeProfile.deliveryCodeViewer && deliveryAuthorizationMode === 'selection' && (
          <motion.div
            key="delivery-service-view"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="rounded-3xl border-2 border-blue-300 bg-white p-5 shadow-sm"
          >
            <div className="flex flex-col gap-3 border-b border-blue-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-black text-blue-950">Sélection des livraisons du service</h2>
                <p className="mt-1 text-xs font-bold text-blue-700">
                  Services visibles: {deliveryReadableDepartments.join(', ')} · autorisé de {deliverySelectionStart} à {deliverySelectionEnd}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-xl bg-blue-100 px-3 py-2 text-xs font-black text-blue-900">
                  Quota quotidien du service : {serviceDeliveryQuota || 'illimité'} agent(s) · utilisés : {serviceDeliverySelectionsToday}
                </span>
                <button
                  type="button"
                  onClick={printServiceDeliverySelectionList}
                  className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-3 py-2 text-xs font-black text-white hover:bg-slate-800"
                >
                  <Printer className="h-4 w-4" />
                  Imprimer la liste
                </button>
              </div>
            </div>
            <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-900">
              Une sélection transforme toutes les commandes actives de l'agent en livraison, même si l'agent avait choisi « sur place ».
            </p>
            {deliverySelectionMessage && <p className="mt-3 rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs font-black text-blue-900">{deliverySelectionMessage}</p>}
            <div className="mt-4 space-y-4">
              {deliveryServiceProfilesByDepartment.length === 0 ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-center text-sm font-bold text-slate-500">
                  Aucun personnel visible pour ce compte habilité.
                </div>
              ) : deliveryServiceProfilesByDepartment.map(([service, serviceProfiles]) => (
                <section key={service} className="overflow-hidden rounded-2xl border border-blue-200 bg-blue-50/30">
                  <div className="flex items-center justify-between gap-3 bg-blue-700 px-4 py-3 text-white">
                    <h3 className="text-sm font-black uppercase tracking-wide">{service}</h3>
                    <span className="rounded-full bg-white/15 px-3 py-1 text-[10px] font-black">{serviceProfiles.length} agent(s)</span>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {serviceProfiles.map(profile => {
                  const activeOrders = orders.filter(order => order.employeeId === profile.id && ['pending', 'preparing'].includes(order.status) && order.fulfillmentMode !== 'delivery');
                  const isWorking = deliverySelectionEmployeeId === profile.id;
                  const preAuthorized = hasActiveDeliveryPreAuthorization(profile);
                  return (
                    <div key={profile.id} className="flex flex-col gap-3 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="font-black text-slate-950">{profile.name}</p>
                        <p className="text-xs text-slate-500">{profile.badgeNumber} · {activeOrders.length} commande(s) active(s)</p>
                        {preAuthorized && (
                          <p className="mt-1 text-[10px] font-black text-blue-700">
                            Livraison préactivée {profile.deliveryPreAuthorizedScope === 'permanent' ? 'en permanence' : `jusqu'au ${new Date(profile.deliveryPreAuthorizedUntil || 0).toLocaleString('fr-FR')}`}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-wrap justify-end gap-2">
                        <button
                          type="button"
                          disabled={isWorking || activeOrders.length === 0}
                          onClick={async () => {
                            setDeliverySelectionEmployeeId(profile.id);
                            setDeliverySelectionMessage('');
                            try {
                              const count = await onSelectEmployeeForDelivery(profile);
                              setDeliverySelectionMessage(`${profile.name}: ${count} commande(s) envoyée(s) au livreur.`);
                            } catch (error: any) {
                              setDeliverySelectionMessage(error?.message || 'Sélection impossible.');
                            } finally {
                              setDeliverySelectionEmployeeId('');
                            }
                          }}
                          className="rounded-xl bg-blue-700 px-4 py-2.5 text-xs font-black text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                        >
                          {isWorking ? 'Envoi en cours...' : activeOrders.length === 0 ? 'Pas encore commandé' : 'Faire livrer'}
                        </button>
                        {(['daily', 'weekly', 'monthly', 'permanent'] as const).map(scope => (
                          <button
                            key={`${profile.id}-${scope}`}
                            type="button"
                            disabled={isWorking}
                            onClick={async () => {
                              setDeliverySelectionEmployeeId(profile.id);
                              setDeliverySelectionMessage('');
                              try {
                                await authorizeFutureDelivery(profile, scope);
                              } catch (error: any) {
                                setDeliverySelectionMessage(error?.message || 'Activation impossible.');
                              } finally {
                                setDeliverySelectionEmployeeId('');
                              }
                            }}
                            className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-[10px] font-black text-blue-800 hover:bg-blue-100 disabled:opacity-50"
                          >
                            {scope === 'daily' ? 'Activer journalier' : scope === 'weekly' ? 'Activer hebdo' : scope === 'monthly' ? 'Activer mensuel' : 'Permanent'}
                          </button>
                        ))}
                        {preAuthorized && (
                          <button
                            type="button"
                            disabled={isWorking}
                            onClick={async () => {
                              setDeliverySelectionEmployeeId(profile.id);
                              setDeliverySelectionMessage('');
                              try {
                                await deactivateFutureDelivery(profile);
                              } catch (error: any) {
                                setDeliverySelectionMessage(error?.message || 'Désactivation impossible.');
                              } finally {
                                setDeliverySelectionEmployeeId('');
                              }
                            }}
                            className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[10px] font-black text-red-800 hover:bg-red-100 disabled:opacity-50"
                          >
                            Désactiver
                          </button>
                        )}
                      </div>
                    </div>
                  );
                    })}
                  </div>
                </section>
              ))}
            </div>
          </motion.div>
        )}

        {activeTab === 'profile' && (
          <motion.div
            key="profile-menu-view"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="grid grid-cols-1 gap-6"
          >
            {/* Form to update local profile fields */}
            <div className="hidden">
              <div className="flex justify-between items-center border-b border-gray-100 pb-3">
                <h3 className="font-bold text-slate-900">Coordonnées de Livraison & Badge</h3>
                <button
                  id="btn-edit-profile-toggle"
                  onClick={() => setIsEditingProfile(!isEditingProfile)}
                  className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 py-1.5 px-3 rounded-lg font-bold transition cursor-pointer"
                >
                  {isEditingProfile ? 'Annuler' : 'Modifier les infos'}
                </button>
              </div>

              {isEditingProfile ? (
                <form id="profile-edit-form" onSubmit={handleSaveProfile} className="space-y-4 text-xs">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-slate-500 font-bold uppercase mb-1">Nom et prénom</label>
                      <input
                        type="text"
                        required
                        value={editedName}
                        onChange={(e) => setEditedName(e.target.value)}
                        className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-500 font-bold uppercase mb-1">Téléphone de livraison</label>
                      <input
                        type="text"
                        required
                        value={editedPhone}
                        onChange={(e) => setEditedPhone(e.target.value)}
                        className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-slate-500 font-bold uppercase mb-1">Service / département Ndamatou</label>
                      <input
                        type="text"
                        list="profile-service-list"
                        required
                        value={editedDept}
                        onChange={(e) => setEditedDept(e.target.value)}
                        className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm"
                      />
                      <datalist id="profile-service-list">
                        {services.map(service => <option key={service} value={service}>{service}</option>)}
                      </datalist>
                    </div>
                    <div>
                      <label className="block text-slate-500 font-bold uppercase mb-1">Bâtiment Hospitalier</label>
                      <input
                        type="text"
                        list="profile-building-list"
                        value={editedBuilding}
                        onChange={(e) => setEditedBuilding(e.target.value)}
                        className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm"
                      />
                      <datalist id="profile-building-list">
                        {CHNCAK_BUILDINGS.map(building => <option key={building} value={building}>{building}</option>)}
                      </datalist>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-slate-500 font-bold uppercase mb-1">Étage</label>
                      <select
                        value={editedFloor}
                        onChange={(e) => setEditedFloor(e.target.value)}
                        className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm"
                      >
                        {CHNCAK_FLOORS.map(floor => <option key={floor} value={floor}>{floor}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-slate-500 font-bold uppercase mb-1">Spécialité</label>
                      <input
                        type="text"
                        required
                        value={editedRoom}
                        onChange={(e) => setEditedRoom(e.target.value)}
                        className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm"
                      />
                    </div>
                  </div>

                  <button
                    id="btn-save-profile"
                    type="submit"
                    className="w-full py-2.5 px-4 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition font-sans cursor-pointer"
                  >
                    Enregistrer mes informations
                  </button>
                </form>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm text-slate-700">
                  <div className="space-y-4">
                    <div>
                      <span className="text-xs text-slate-400 block font-bold">Nom et prénom</span>
                      <p className="font-semibold text-slate-900">{activeProfile.name}</p>
                    </div>
                    <div>
                      <span className="text-xs text-slate-400 block font-bold">Téléphone</span>
                      <p className="font-semibold text-slate-900 font-mono">{activeProfile.phone}</p>
                    </div>
                    <div>
                      <span className="text-xs text-slate-400 block font-bold">Adresse Email Ndamatou</span>
                      <p className="font-semibold text-slate-900 font-mono text-xs">{activeProfile.email}</p>
                    </div>
                  </div>

                  <div className="space-y-4 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Adresse et spécialité du personnel</p>
                    <div>
                      <span className="text-[11px] text-slate-400 block">Bâtiment & Étage</span>
                      <p className="font-medium text-xs text-slate-850">{activeProfile.building} ({activeProfile.floor})</p>
                    </div>
                    <div>
                      <span className="text-[11px] text-slate-400 block">Chambre / Spécification de livraison</span>
                      <p className="font-medium text-xs text-slate-850">{activeProfile.room}</p>
                    </div>
                  </div>
                </div>
              )}
              <form onSubmit={handlePasswordChange} className="rounded-2xl border border-blue-100 bg-blue-50 p-4 space-y-3">
                <div>
                  <h4 className="font-black text-blue-950 text-sm">Changer mon mot de passe</h4>
                  <p className="text-xs text-blue-800 mt-1">Utilisez cet espace après une réinitialisation ou pour sécuriser votre compte.</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    placeholder="Nouveau mot de passe"
                    className="w-full px-3 py-2.5 bg-white border border-blue-100 rounded-xl text-sm"
                  />
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={newPasswordConfirm}
                    onChange={(event) => setNewPasswordConfirm(event.target.value)}
                    placeholder="Confirmer le mot de passe"
                    className="w-full px-3 py-2.5 bg-white border border-blue-100 rounded-xl text-sm"
                  />
                </div>
                {passwordMessage && <p className="text-xs font-bold text-blue-800">{passwordMessage}</p>}
                <button type="submit" className="rounded-xl bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 text-xs font-black">
                  Enregistrer nouveau mot de passe
                </button>
              </form>
            </div>

            {/* Badge card details */}
            <div className="mx-auto w-full max-w-3xl bg-white rounded-3xl p-6 border border-slate-100 shadow-sm space-y-6 flex flex-col justify-between">
              <div>
                <h3 className="font-bold text-slate-900">Carte badge du personnel Ndamatou</h3>
                <p className="text-xs text-gray-500 mt-1">
                  Ce badge biométrique crypté vous sert de portefeuille électronique pour payer au restaurant d'un simple scan.
                </p>
                {isBadgeBlocked && (
                  <div className="mt-3 rounded-2xl border border-red-100 bg-red-50 p-3 text-xs font-bold text-red-700">
                    Badge en attente de validation ou bloqué. Les commandes, scans et paiements par badge sont désactivés.
                  </div>
                )}

                {/* Badge card design */}
                <div className="mt-4 bg-gradient-to-br from-slate-900 to-slate-800 text-white p-4 rounded-2xl relative overflow-hidden shadow-lg border border-slate-700">
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider">Hôpital Ndamatou</span>
                      <span className="text-xs font-semibold">{activeProfile.name}</span>
                    </div>
                    <span className="text-xs bg-blue-500/15 border border-blue-500/30 text-blue-400 px-2.5 py-1 rounded-full font-bold">
                      Actif
                    </span>
                  </div>

                  <div className="mt-6 flex items-baseline justify-between">
                    <span className="font-mono text-xs text-slate-400 leading-tight">Badge ID: {activeProfile.badgeNumber}</span>
                    <span className="block text-[9px] text-slate-500 mt-1">Tél. propriétaire : {activeProfile.phone || 'Non renseigné'}</span>
                    <span className="block text-[9px] text-slate-500 mt-1">Si trouvé : {lateOrderPhone}</span>
                  </div>

                  <div className="mt-4 flex justify-between items-end border-t border-slate-700 pt-3 gap-3">
                    <div className="rounded-xl bg-white px-3 py-2 border border-white/80 shadow-sm">
                      <span className="text-[9px] text-slate-600 block font-black uppercase">Solde restant</span>
                      <span className="font-mono text-base font-extrabold text-slate-950">{activeProfile.walletBalance.toLocaleString('fr-FR')} FCFA</span>
                      {badgeSyncInProgress && (
                        <span className="mt-1 block text-[9px] font-black text-cyan-700">
                          Synchronisation du badge en cours...
                        </span>
                      )}
                    </div>
                      <img src={badgeQrUrl} alt="QR code badge" className="w-20 h-20 rounded-lg bg-white p-1" />
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setIsQrPreviewOpen(true)}
                    className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold py-2.5 px-4 rounded-xl transition"
                  >
                    <ShieldCheck className="w-4 h-4" />
                    Aperçu code QR
                  </button>
                  <button
                    type="button"
                    onClick={handleScanRestaurantQr}
                    className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold py-2.5 px-4 rounded-xl transition"
                  >
                    <Search className="w-4 h-4" />
                    Scanner entrée / sortie restaurant
                  </button>
                  <button
                    type="button"
                    onClick={handlePrintBadge}
                    className="w-full flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold py-2.5 px-4 rounded-xl transition"
                  >
                    <Printer className="w-4 h-4" />
                    Imprimer badge
                  </button>
                </div>
              </div>

              {/* Wallet Topup Actions */}
              <div className="pt-4 border-t border-slate-100">
                {false && waveTopupEnabled && <>
                <label className="block text-xs font-bold text-slate-600 mb-2">Recharger votre badge par Wave :</label>
                <div className="mb-3 rounded-lg border border-blue-500 bg-blue-50 px-3 py-2 text-xs font-black text-blue-700 flex items-center justify-between gap-2">
                  <span>Wave</span>
                  <WaveLogo compact />
                </div>
                <div className="mb-3 rounded-2xl border border-blue-100 bg-white p-3 text-xs text-slate-700">
                  <p className="font-black uppercase text-blue-700">Numéro marchand Wave</p>
                  <p className="mt-1 font-mono text-lg font-black text-slate-950">{waveMerchantNumber}</p>
                  <p className="mt-1 text-[11px] text-slate-500">Payez ce numéro puis déclarez seulement la date et l'heure du paiement. Le comptable vérifiera dans Wave Marchand avant crédit.</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[0.8fr_1fr_1fr_auto] gap-2">
                  <select
                    value={topupAmount}
                    onChange={(e) => setTopupAmount(e.target.value)}
                    className="bg-slate-50 border border-slate-200 rounded-lg p-2 font-mono text-xs text-slate-800"
                  >
                    <option value="2000">2 000 FCFA</option>
                    <option value="5000">5 000 FCFA</option>
                    <option value="10000">10 000 FCFA</option>
                    <option value="20000">20 000 FCFA</option>
                  </select>
                  <input
                    type="date"
                    value={waveTopupDate}
                    onChange={(event) => setWaveTopupDate(event.target.value)}
                    aria-label="Date Wave"
                    className="bg-slate-50 border border-slate-200 rounded-lg p-2 font-mono text-xs text-slate-800"
                  />
                  <input
                    type="time"
                    value={waveTopupTime}
                    onChange={(event) => setWaveTopupTime(event.target.value)}
                    aria-label="Heure Wave"
                    className="bg-slate-50 border border-slate-200 rounded-lg p-2 font-mono text-xs text-slate-800"
                  />
                  <button
                    id="btn-topup-wallet"
                    type="button"
                    onClick={handleWalletTopup}
                    disabled={isDeclaringWave}
                    className="w-full lg:w-auto bg-blue-600 disabled:opacity-50 hover:bg-blue-700 text-white text-xs font-bold py-2 px-4 rounded-lg transition shrink-0 cursor-pointer"
                  >
                    {isDeclaringWave ? 'Envoi...' : 'Déclarer'}
                  </button>
                </div>
                <p className="text-[10px] text-slate-400 mt-2">
                  Le badge n'est jamais crédité automatiquement. Le comptable valide après vérification du montant, téléphone, date et heure dans Wave Marchand.
                </p>
                {activePendingWaveRequests.length > 0 && (
                  <div className="mt-3 space-y-2">
                    <p className="text-xs font-black text-amber-900">Demandes Wave en attente</p>
                    {activePendingWaveRequests.map(request => (
                      <div key={request.id} className="flex items-center justify-between gap-3 rounded-xl border border-amber-100 bg-amber-50 p-3 text-xs">
                        <div>
                          <p className="font-black text-amber-950">{request.amount.toLocaleString('fr-FR')} FCFA</p>
                          <p className="mt-1 font-mono text-[10px] text-amber-700">{new Date(request.createdAt).toLocaleString('fr-FR')}</p>
                        </div>
                        <button
                          type="button"
                          disabled={cancellingWaveId === request.id}
                          onClick={async () => {
                            if (!window.confirm('Annuler cette demande Wave en attente ?')) return;
                            setCancellingWaveId(request.id);
                            try {
                              await onCancelWaveTopup(request.id);
                              setTopupActionMessage('Demande Wave annulée.');
                            } catch {
                              setTopupActionMessage("Annulation impossible. Réessayez.");
                            } finally {
                              setCancellingWaveId('');
                            }
                          }}
                          className="rounded-lg bg-red-600 px-3 py-2 font-black text-white disabled:opacity-50"
                        >
                          {cancellingWaveId === request.id ? 'Annulation...' : 'Annuler'}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                </>}

                {prepaidCardEnabled && (
                  <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50/60 p-3">
                    <label className="block text-xs font-bold text-blue-900 mb-2">Carte prépayée Ndamatou sans frais</label>
                    <div className="flex gap-2">
                      <input
                        value={prepaidCode}
                        onChange={(event) => setPrepaidCode(event.target.value)}
                        placeholder="Ex: P123-7K9A"
                        className="flex-1 bg-white border border-blue-100 rounded-lg p-2 font-mono text-xs text-slate-800 outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <button
                        type="button"
                        onClick={handlePrepaidTopup}
                        disabled={isValidatingPrepaid}
                        className="bg-slate-900 disabled:opacity-50 hover:bg-slate-800 text-white text-xs font-bold py-2 px-3 rounded-lg transition shrink-0"
                      >
                        {isValidatingPrepaid ? 'Validation...' : 'Valider'}
                      </button>
                    </div>
                    <p className="text-[10px] text-blue-800 mt-2">
                      Le code est court, unique et lié à votre badge. Il ne peut pas être utilisé par un autre personnel.
                    </p>
                  </div>
                )}
                <a
                  href="https://wa.me/221783863859?text=J%27ai%20recharg%C3%A9%20via%20Wave%20et%20mon%20badge%20n%27est%20pas%20encore%20cr%C3%A9dit%C3%A9.%0APr%C3%A9nom%20et%20nom%20%3A%20%0AService%20%3A%20"
                  target="_blank"
                  rel="noreferrer"
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-xs font-black text-white hover:bg-blue-700"
                >
                  <WhatsAppLogo />
                  Contacter le restaurant sur WhatsApp si badge non crédité
                </a>
                <button
                  type="button"
                  disabled
                  className="mt-2 flex w-full cursor-not-allowed items-center justify-center rounded-xl bg-slate-200 px-4 py-3 text-xs font-black text-slate-600"
                >
                  Bictorys — bientôt disponible
                </button>
                <p className="mt-2 text-[10px] text-slate-500">Le paiement Bictorys n’est pas encore activé. Les recharges manuelles restent disponibles.</p>
                <p className="mt-1 rounded-lg bg-blue-50 px-2 py-1.5 text-[10px] font-bold text-blue-800">Nouveau partage des frais mobile money : 510 F versés donnent 505 F de crédit badge. Un repas à 500 F débite seulement 500 F et laisse 5 F disponibles. Aucun nouveau frais au paiement du repas. Le crédit est arrondi au franc le plus proche. Les recharges en espèces restent sans frais.</p>
                {accountantContactEnabled && (
                  <p className="mt-1 text-center text-[10px] text-slate-400">
                    Pour information, contactez l'agent comptable {accountantContactName}: {accountantContactPhone}.
                  </p>
                )}
                {topupActionMessage && (
                  <p className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700">
                    {topupActionMessage}
                  </p>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isQrPreviewOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950 text-white">
            <motion.div
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              className="w-full max-w-md text-center space-y-6"
            >
              <div>
                <p className="text-[11px] uppercase tracking-[0.22em] text-blue-300 font-black">Badge QR Ndamatou</p>
                <h3 className="text-2xl font-black mt-2">{activeProfile.name}</h3>
                <p className="text-sm text-slate-300 mt-1 font-mono">{activeProfile.badgeNumber}</p>
              </div>

              <div className="bg-white rounded-[28px] p-6 shadow-2xl border border-white/20">
                <img src={badgeQrUrl} alt="QR code badge en plein écran" className="w-full max-w-[320px] mx-auto aspect-square object-contain" />
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/10 p-4 text-sm text-slate-200 space-y-1">
                <p className="font-bold text-white">Présentez ce code au restaurateur pour le scan.</p>
                <p>Téléphone : {activeProfile.phone || 'Non renseigné'}</p>
              </div>

              <button
                type="button"
                onClick={() => setIsQrPreviewOpen(false)}
                className="w-full rounded-2xl bg-white text-slate-950 py-4 font-black hover:bg-slate-100"
              >
                Fermer l'aperçu
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isActiveRestaurantPresence && !restaurantScanResult && !isRestaurantScannerOpen && now.getTime() >= restaurantExitPromptPausedUntil && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[58] flex items-center justify-center bg-blue-950 p-5 text-white"
          >
            <div className="w-full max-w-xl text-center">
              <div className="mx-auto flex h-28 w-28 items-center justify-center rounded-full bg-white text-blue-700 shadow-2xl">
                <QrCode className="h-20 w-20" />
              </div>
              <h2 className="mt-6 text-4xl font-black uppercase">Libérez votre place avant de partir</h2>
              <p className="mt-4 text-lg font-bold text-blue-100">
                Votre repas a été remis et votre place est encore comptée comme occupée. Scannez le QR de sortie ou utilisez le code simple SORTIE.
              </p>
              {restaurantPresenceExpiresAt && (
                <p className="mt-4 rounded-2xl bg-white/10 p-3 text-sm font-black">
                  Sans action, la place sera libérée automatiquement vers {new Date(restaurantPresenceExpiresAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}.
                </p>
              )}
              <div className="mt-7 grid gap-3 sm:grid-cols-2">
                <button type="button" onClick={handleScanRestaurantQr} className="rounded-2xl bg-white px-5 py-4 font-black text-blue-950">
                  Scanner le QR de sortie
                </button>
                <button type="button" onClick={() => validateRestaurantQr('SORTIE')} className="rounded-2xl bg-blue-600 px-5 py-4 font-black text-white ring-2 ring-white">
                  Saisir automatiquement SORTIE
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isRestaurantScannerOpen && (
          <div className="fixed inset-0 z-[55] flex items-center justify-center p-4 bg-slate-950/90 text-white">
            <motion.div
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              className="w-full max-w-lg space-y-4"
            >
              <div className="text-center">
                <p className="text-[11px] uppercase tracking-[0.22em] text-blue-300 font-black">Scan QR restaurant / livreur</p>
                <h3 className="text-2xl font-black mt-2">Autorisez la camera</h3>
                <p className="text-sm text-slate-300 mt-1">Placez le QR du jour dans le cadre. Si votre navigateur ne lit pas le QR, utilisez la saisie manuelle.</p>
              </div>

              <div className="rounded-[28px] overflow-hidden border border-white/20 bg-black aspect-[4/3] flex items-center justify-center">
                <video ref={scannerVideoRef} className="w-full h-full object-cover" muted playsInline />
              </div>

              {scannerMessage && (
                <div className="rounded-2xl border border-amber-300/30 bg-amber-400/10 p-3 text-sm text-amber-50">
                  {scannerMessage}
                </div>
              )}

              <div className="rounded-2xl border border-white/10 bg-white/10 p-3 space-y-2">
                <label className="block text-[11px] font-black uppercase tracking-wider text-blue-200">
                  Code court du jour
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
                  <input
                    value={restaurantCodeInput}
                    onChange={(event) => setRestaurantCodeInput(event.target.value.toUpperCase().replace(/\s+/g, ''))}
                    placeholder={todayRestaurantQrPayload}
                    className="w-full rounded-xl bg-white px-4 py-3 text-center font-mono text-lg font-black tracking-widest text-slate-950 outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleManualRestaurantCode}
                    className="rounded-xl bg-blue-500 text-white px-5 py-3 font-black hover:bg-blue-600"
                  >
                    Valider
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setRestaurantCodeInput('')}
                  className="rounded-2xl bg-blue-500 text-white py-3 font-black hover:bg-blue-600"
                >
                  Effacer code
                </button>
                <button
                  type="button"
                  onClick={() => setIsRestaurantScannerOpen(false)}
                  className="rounded-2xl bg-white text-slate-950 py-3 font-black hover:bg-slate-100"
                >
                  Fermer
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {restaurantScanResult && (
          <div
            onContextMenu={(event) => event.preventDefault()}
            className={`fixed inset-0 z-[60] flex select-none items-stretch justify-center overflow-hidden text-white ${
            restaurantScanResult.status === 'ok' ? 'bg-blue-600' : 'bg-red-600'
          }`}
          >
            {restaurantScanResult.status === 'ok' && (
              <div className="pointer-events-none absolute inset-0 opacity-10">
                {Array.from({ length: 18 }).map((_, index) => (
                  <div
                    key={index}
                    className="absolute whitespace-nowrap text-xl font-black uppercase tracking-widest text-white"
                    style={{
                      left: `${(index % 3) * 34 - 8}%`,
                      top: `${Math.floor(index / 3) * 18}%`,
                      transform: 'rotate(-22deg)',
                    }}
                  >
                    {activeProfile.name} - {activeProfile.badgeNumber} - {now.toLocaleTimeString('fr-FR')}
                  </div>
                ))}
              </div>
            )}
            <motion.div
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
              className="relative flex h-full min-h-0 w-full max-w-lg flex-col text-center"
            >
              {showSharedRestaurantScanExitScreen && (
                <button
                  type="button"
                  onClick={() => setRestaurantScanResult(null)}
                  className="absolute right-3 top-3 z-20 rounded-full bg-white/95 px-3 py-2 text-[11px] font-black text-slate-950 shadow-xl"
                >
                  Fermer
                </button>
              )}
              <div className={`${showSharedRestaurantScanExitScreen ? 'basis-1/2 px-4 pb-3 pt-4' : 'flex-1 px-5 pb-5 pt-6'} min-h-0 overflow-y-auto overscroll-contain`}>
                <div className={showSharedRestaurantScanExitScreen ? 'space-y-3 pr-16' : 'space-y-6'}>
                  <div className={`${showSharedRestaurantScanExitScreen ? 'w-16 h-16' : 'w-28 h-28 sm:w-32 sm:h-32'} mx-auto rounded-full bg-white flex items-center justify-center shadow-2xl`}>
                    {restaurantScanResult.status === 'ok' && activeProfile.photoUrl ? (
                      <img src={activeProfile.photoUrl} alt={activeProfile.name} className={`${showSharedRestaurantScanExitScreen ? 'w-14 h-14' : 'w-24 h-24 sm:w-28 sm:h-28'} rounded-full object-cover border-4 border-white`} />
                    ) : restaurantScanResult.status === 'ok' ? (
                      <CheckCircle className={`${showSharedRestaurantScanExitScreen ? 'w-12 h-12' : 'w-20 h-20 sm:w-24 sm:h-24'} text-blue-600`} />
                    ) : (
                      <X className={`${showSharedRestaurantScanExitScreen ? 'w-12 h-12' : 'w-20 h-20 sm:w-24 sm:h-24'} text-red-600`} />
                    )}
                  </div>
                  <div>
                    <h3 className={`${showSharedRestaurantScanExitScreen ? 'text-2xl' : 'text-3xl sm:text-5xl'} font-black uppercase tracking-tight`}>{restaurantScanResult.title}</h3>
                    <p className={`${showSharedRestaurantScanExitScreen ? 'mt-2 text-sm' : 'mt-4 text-base sm:text-lg'} font-bold text-white/90`}>{restaurantScanResult.message}</p>
                  </div>
                  {restaurantScanResult.orders && restaurantScanResult.orders.length > 0 && (
                    <div className={showSharedRestaurantScanExitScreen ? 'space-y-2' : 'space-y-3'}>
                      {restaurantScanResult.orders.map((order, index) => (
                        <div key={order.id} className={`${showSharedRestaurantScanExitScreen ? 'rounded-2xl p-3' : 'rounded-3xl p-5'} bg-white/20 border-2 border-white/40 text-left shadow-xl`}>
                          <p className="text-xs uppercase tracking-widest font-black text-white/80">Commande {index + 1} à remettre</p>
                          <p className={`${showSharedRestaurantScanExitScreen ? 'mt-1 text-sm' : 'mt-2 text-xl sm:text-2xl'} font-black break-all`}>#{order.id}</p>
                          <p className={`${showSharedRestaurantScanExitScreen ? 'mt-1 text-sm' : 'mt-2 text-base sm:text-lg'} font-black`}>{order.items.map(item => `${item.quantity} x ${(item.meal?.name || 'Repas')}`).join(', ')}</p>
                        </div>
                      ))}
                    </div>
                  )}
                  {restaurantScanResult.status === 'ok' && (
                    <div className={`${showSharedRestaurantScanExitScreen ? 'rounded-2xl p-3' : 'rounded-3xl p-5'} bg-white text-slate-950 shadow-2xl`}>
                      <p className="text-[11px] uppercase tracking-widest font-black text-blue-700">Code vivant anti-duplication</p>
                      <p className={`${showSharedRestaurantScanExitScreen ? 'mt-1 text-2xl' : 'mt-2 text-4xl'} font-black font-mono`}>{restaurantScanResult.secureCode}</p>
                      <div className={`${showSharedRestaurantScanExitScreen ? 'mt-2' : 'mt-3'} grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-bold text-slate-600`}>
                        <span>Heure actuelle: {now.toLocaleTimeString('fr-FR')}</span>
                        <span>Validé: {restaurantScanResult.validatedAt ? new Date(restaurantScanResult.validatedAt).toLocaleTimeString('fr-FR') : '-'}</span>
                      </div>
                    </div>
                  )}
                  <p className="text-sm font-bold text-white/80">
                    Gardez cet écran ouvert et montrez-le au restaurateur. Si l'application passe en arrière-plan, la preuve disparaît.
                  </p>
                </div>
              </div>
              {showSharedRestaurantScanExitScreen && (
                <div className="basis-1/2 min-h-0 overflow-y-auto border-t-4 border-white/50 bg-blue-950 px-5 py-4 text-white">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-white text-blue-700 shadow-xl">
                    <QrCode className="h-8 w-8" />
                  </div>
                  <h4 className="mt-2 text-2xl font-black uppercase">Sortie restaurant</h4>
                  <p className="mt-2 text-sm font-bold text-blue-100">
                    Après le repas, scannez le QR sortie ou saisissez SORTIE pour libérer la place.
                  </p>
                  {restaurantPresenceExpiresAt && (
                    <p className="mt-2 rounded-xl bg-white/10 p-2 text-xs font-black">
                      Libération automatique vers {new Date(restaurantPresenceExpiresAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  )}
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button type="button" onClick={handleScanRestaurantQr} className="rounded-xl bg-white px-3 py-3 text-xs font-black text-blue-950">
                      Scanner sortie
                    </button>
                    <button type="button" onClick={() => validateRestaurantQr('SORTIE')} className="rounded-xl bg-blue-600 px-3 py-3 text-xs font-black text-white ring-2 ring-white">
                      Code SORTIE
                    </button>
                  </div>
                </div>
              )}
              {!showSharedRestaurantScanExitScreen && <div className="shrink-0 border-t border-white/20 bg-black/15 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-md">
                <button
                  type="button"
                  onClick={() => setRestaurantScanResult(null)}
                  className="w-full rounded-2xl bg-white text-slate-950 py-4 font-black shadow-2xl hover:bg-slate-100"
                >
                  Fermer
                </button>
              </div>}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 5. CHECKOUT / PAYMENTS MODAL */}
      <AnimatePresence>
        {isChekoutOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
              id="checkout-backdrop"
              onClick={closePaymentModal}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm"
            />

            {/* Checkout panel */}
            <motion.div
              id="checkout-modal"
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl w-full max-w-lg shadow-2xl z-50 overflow-hidden border border-slate-100 relative flex flex-col max-h-[90vh]"
            >
              {/* Header */}
              <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50 text-slate-900">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-blue-600" />
                  <h3 className="font-bold text-base">Validation & Paiement Sécurisé</h3>
                </div>
                <button
                  id="btn-close-checkout"
                  onClick={closePaymentModal}
                  className="p-1 hover:bg-slate-200 rounded-full transition cursor-pointer"
                >
                  <X className="w-5 h-5 text-slate-500" />
                </button>
              </div>

              {/* Modal Content */}
              <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
                {paymentSuccess ? (
                  /* Payment success confirmation screen */
                  <div className="text-center py-8 space-y-4">
                    <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto">
                      <CheckCircle className="w-10 h-10" />
                    </div>
                    <div className="space-y-1">
                      <h4 className="font-black text-slate-900 text-base">Paiement Validé avec Succès !</h4>
                      <p className="text-slate-500 text-xs">La commande <span className="font-mono font-bold text-slate-800">#{createdOrderId}</span> a été transmise aux cuisines.</p>
                    </div>

                    <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 text-left space-y-2 mt-4 max-w-sm mx-auto">
                      <p className="font-semibold text-blue-950 text-xs">Notifications de suivi activées :</p>
                      <p className="text-slate-600 leading-relaxed text-[11px]">
                        Grâce au système de notification automatisé, vous recevrez une alerte en direct chaque fois que la cuisine ou le livreur changera de statut.
                      </p>
                    </div>

                    <button
                      id="btn-checkout-ok"
                      onClick={closePaymentModal}
                      className="mt-6 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition cursor-pointer"
                    >
                      Retourner au Dashboard
                    </button>
                  </div>
                ) : (
                  /* Fill flow details */
                  <>
                    {/* Order summary */}
                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-2">
                      <p className="font-bold text-slate-700 text-[11px] uppercase tracking-wider">Récapitulatif commande</p>
                      <div className="space-y-1 pt-1">
                        {cart.map(it => (
                          <div key={it.meal.id} className="flex justify-between text-slate-600">
                            <span>{(it.meal?.name || 'Repas')} (x{it.quantity})</span>
                            <span className="font-mono font-bold">{getItemTotal(it).toLocaleString('fr-FR')} F</span>
                          </div>
                        ))}
                      </div>
                      <div className="pt-2 text-[11px] text-blue-700 space-y-1">
                        <div className="flex justify-between"><span>Prix réel</span><strong>{getCartRealTotal().toLocaleString('fr-FR')} F</strong></div>
                        <div className="flex justify-between"><span>Subvention hôpital</span><strong>{getCartHospitalSupport().toLocaleString('fr-FR')} F</strong></div>
                      </div>
                      <div className="border-t border-slate-200/50 pt-2 flex justify-between font-bold text-slate-900 text-sm">
                        <span>Total à Payer :</span>
                        <span className="font-mono text-blue-700">{getCartTotal().toLocaleString('fr-FR')} FCFA</span>
                      </div>

                    </div>

                    <div className="p-4 bg-blue-50/70 rounded-2xl border border-blue-100 text-slate-700 leading-relaxed font-sans">
                      <p className="font-black text-blue-950">Paiement unique par badge</p>
                      <p className="mt-1 text-xs">
                                                  <>En confirmant, le montant de <span className="font-mono font-extrabold text-blue-950">{getCartTotal().toLocaleString('fr-FR')} F</span> sera débité instantanément de votre badge <span className="underline">{activeProfile.badgeNumber}</span>.</>
                      </p>
                    </div>

                    {/* Pay Button action and loading behavior */}
                    <button
                      id="btn-confirm-payment"
                      disabled={isProcessingPayment}
                      onClick={handleCheckoutSubmit}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 px-4 rounded-xl text-sm transition flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-blue-600/10"
                    >
                      {isProcessingPayment ? (
                        <>
                          <div className="w-5 h-5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                          <span>Cryptage & Débit Sécurisé...</span>
                        </>
                      ) : (
                        <>
                          <span>Confirmer le Règlement</span>
                        </>
                      )}
                    </button>
                  </>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};








