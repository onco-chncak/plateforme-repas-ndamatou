import { secureBalanceFunctionsEnabled } from '../lib/secureBalance';
import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { collection, deleteDoc, doc, getDoc, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import {
  ChefHat,
  Package,
  Layers,
  BarChart3,
  TrendingUp,
  AlertTriangle,
  Clock,
  CheckCircle,
  Truck,
  Plus,
  ArrowRight,
  TrendingDown,
  ShoppingBag,
  PlusCircle,
  Vote,
  Users,
  Utensils,
  MapPin,
  RefreshCw,
  X,
  Sparkles,
  QrCode,
  ScanLine,
  Download,
  Printer,
  Search,
  Camera,
  WalletCards,
  LogOut
} from 'lucide-react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend
} from 'recharts';
import { CashTransaction, Meal, Order, UserProfile, DailyStats, MealCategory, OrderStatus, PrepaidCard } from '../types';
import { DeliveryView } from './DeliveryView';
import { SharedFinanceReport } from './SharedFinanceReport';
import { printHtmlWithQz } from '../lib/qzPrinter';
import { quoteMobileTopup, quoteMealSettlement, formatAccountingCents } from '../lib/finance';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  calculateOrderLifecycleMetrics,
  calculateOrdersAccountingEntries,
  calculateOrdersAccounting as calculateSharedAccounting,
  DEFAULT_HOSPITAL_SUPPORT,
  DEFAULT_REAL_MEAL_PRICE,
  DEFAULT_STAFF_MEAL_PRICE,
  getLocalDateKey,
  getMealVisual,
  getOperationalDateKey,
  getOrderAccounting,
  isPaidAccountingOrder,
} from '../lib/business';

const REPORT_OPERATIONAL_START = '19:00';
const REPORT_OPERATIONAL_END_LABEL = '18h59';

const parseTimeToMinutes = (value = '00:00') => {
  const [hourRaw, minuteRaw] = String(value || '00:00').split(':').map(Number);
  const hour = Number.isFinite(hourRaw) ? Math.max(0, Math.min(23, hourRaw)) : 0;
  const minute = Number.isFinite(minuteRaw) ? Math.max(0, Math.min(59, minuteRaw)) : 0;
  return hour * 60 + minute;
};

const formatTimeLabel = (value = '00:00') => String(value || '00:00').replace(':', 'h');

const formatMoney = (amount: number) => `${Math.round(amount || 0).toLocaleString('fr-FR')} FCFA`;

const parseTransactionDate = (value?: string) => {
  const date = new Date(value || '');
  return Number.isNaN(date.getTime()) ? null : date;
};

const formatTransactionDate = (value?: string) => {
  const date = parseTransactionDate(value);
  return date ? date.toLocaleDateString('fr-FR') : 'Date non tracée';
};

const formatTransactionTime = (value?: string) => {
  const date = parseTransactionDate(value);
  return date ? date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : 'Heure non tracée';
};

const isDateInTimeSlot = (dateValue: string, start = '00:00', end = '23:59') => {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return false;
  const currentMinutes = date.getHours() * 60 + date.getMinutes();
  const startMinutes = parseTimeToMinutes(start);
  const endMinutes = parseTimeToMinutes(end);
  if (startMinutes === endMinutes) return true;
  if (startMinutes < endMinutes) {
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  }
  return currentMinutes >= startMinutes || currentMinutes < endMinutes;
};

const satisfactionSurveyStatementLabels: Record<string, string> = {
  hotMeals: 'Repas servis chauds',
  variety: 'Variété du menu',
  quality: 'Qualité des repas',
  taste: 'Goût et assaisonnement',
  completeOrder: 'Commande correcte et complète',
  patientServers: 'Patience des serveurs/euses',
  quickService: 'Service immédiat',
  politeStaff: 'Personnel amical et poli',
  fairPrices: 'Prix convenables',
  outsideClean: 'Extérieur propre',
  insideClean: 'Intérieur propre',
};

const getDailyRestaurantCode = (date: Date) => {
  const dayKey = date.toISOString().slice(0, 10).replace(/-/g, '');
  const checksum = [...dayKey].reduce((sum, char, index) => sum + Number(char) * (index + 3), 17);
  return `R${dayKey.slice(4)}${checksum.toString(36).toUpperCase().padStart(2, '0')}`;
};

const getDailyRestaurantExitCode = (_date: Date) => 'SORTIE';

type RestaurantInstitutionConfig = {
  logoUrl: string;
  directorName: string;
  directorPhotoUrl: string;
  restaurantPhotoUrl?: string;
  safName: string;
  safPhotoUrl: string;
  restaurantManagerName?: string;
  acpName?: string;
  managementControllerName?: string;
  revenueReportSignatureOrder?: string[];
  blazeInvoicePeriodStart?: string;
  blazeInvoicePeriodEnd?: string;
  blazeFirestoreAmount?: number;
  blazeHostingAmount?: number;
  blazeAuthAmount?: number;
  blazeStorageAmount?: number;
  blazeOtherAmount?: number;
  blazeTaxesAmount?: number;
  blazeNotes?: string;
  deliveryAccessCode: string;
  lateOrderPhone: string;
  waveMerchantNumber: string;
  [key: string]: any;
};

interface RestaurantViewProps {
  meals: Meal[];
  orders: Order[];
  profiles: UserProfile[];
  activeProfile?: UserProfile | null;
  cashTransactions?: CashTransaction[];
  prepaidCards?: PrepaidCard[];
  restaurantCapacity?: number;
  restaurantOccupancy?: number;
  onUpdateOrderStatus: (orderId: string, status: OrderStatus) => boolean | Promise<boolean>;
  onChangeOrderToDelivery?: (orderId: string, authorization: { issuerId: string; issuerName: string; issuerService: string }) => boolean | Promise<boolean>;
  onSetRestaurantPresence?: (profile: UserProfile, active: boolean) => void | Promise<void>;
  onUpdateMealStock: (mealId: string, newStock: number) => void;
  onUpdateMeal: (meal: Meal) => void;
  onDeleteMeal: (mealId: string) => void;
  onUpdateProfile: (updated: UserProfile) => void | Promise<void>;
  onDeleteProfile?: (profile: UserProfile) => void | Promise<void>;
  onSendPasswordReset?: (profile: UserProfile) => void | Promise<void>;
  onRecoverAccount?: (profile: UserProfile) => void | Promise<void>;
  onResetAllBadgeBalances?: () => void;
  onClearOperationalHistory?: (code: string) => void | Promise<void>;
  onPromoteNextDayMeal: (mealId: string, initialStock: number) => void;
  onAddNewMeal: (meal: Omit<Meal, 'id'>) => void;
  onAddNewProposal: (meal: Omit<Meal, 'id'>) => void;
  onTopupBadge?: (profile: UserProfile, amount: number, note: string, method?: CashTransaction['method'], grossAmount?: number) => void | CashTransaction | Promise<void | CashTransaction>;
  onCorrectTopup?: (transaction: CashTransaction, correctedAmount: number, reason: string) => void | Promise<void>;
  onAdjustBadgeBalance?: (profile: UserProfile, targetBalance: number, reason: string) => void | Promise<void>;
  onCreatePrepaidCard?: (profile: UserProfile, amount: number) => void | PrepaidCard | Promise<void | PrepaidCard>;
  addNotification: (title: string, message: string, type: 'info' | 'success' | 'warning' | 'alert') => void;
  canAccessAdministration?: boolean;
  canAccessSensitiveAdministration?: boolean;
  operatorMode?: boolean;
  rotatingDeliveryCode?: string;
  rotatingDeliveryCodeExpiresAt?: string;
  institutionConfig?: RestaurantInstitutionConfig;
  onUpdateInstitutionConfig?: (config: RestaurantInstitutionConfig) => void | Promise<void>;
}

export const RestaurantView: React.FC<RestaurantViewProps> = ({
  meals,
  orders,
  profiles,
  activeProfile,
  cashTransactions = [],
  restaurantCapacity = 70,
  restaurantOccupancy = 0,
  onUpdateOrderStatus,
  onChangeOrderToDelivery,
  onSetRestaurantPresence,
  onUpdateMealStock,
  onUpdateMeal,
  onDeleteMeal,
  onUpdateProfile,
  onPromoteNextDayMeal,
  onAddNewMeal,
  onAddNewProposal,
  onTopupBadge,
  onAdjustBadgeBalance,
  addNotification,
  canAccessAdministration = false,
  canAccessSensitiveAdministration = false,
  institutionConfig,
  onUpdateInstitutionConfig,
}) => {
  // Navigation tabs inside Restaurant Admin Dashboard
  const [activeTab, setActiveTab] = useState<'orders' | 'scan' | 'inventory' | 'delivery' | 'topup' | 'anticipation' | 'analytics' | 'settings'>(
    canAccessAdministration ? 'analytics' : 'orders'
  );
  const showOperationalRestaurantTabs = !canAccessAdministration;
  const [showRestaurantInfoBlocks, setShowRestaurantInfoBlocks] = useState(false);
  
  // Custom meal forms state
  const [isAddMealOpen, setIsAddMealOpen] = useState(false);
  const [isAddProposalOpen, setIsAddProposalOpen] = useState(false);
  const [editingMealId, setEditingMealId] = useState<string | null>(null);
  
  // New meal form body
  const [newMealName, setNewMealName] = useState('');
  const [newMealDesc, setNewMealDesc] = useState('');
  const [newMealPrice, setNewMealPrice] = useState('2000');
  const [newMealStock, setNewMealStock] = useState('20');
  const [newMealCalories, setNewMealCalories] = useState('500');
  const [newMealCategory, setNewMealCategory] = useState<MealCategory>('plat');
  const [newMealImage, setNewMealImage] = useState('Plat');
  const [institutionDraft, setInstitutionDraft] = useState(institutionConfig);
  const [newServiceName, setNewServiceName] = useState('');
  const [newSpecialtyName, setNewSpecialtyName] = useState('');
  const [badgeScanInput, setBadgeScanInput] = useState('');
  const [orderSearch, setOrderSearch] = useState('');
  const [lastScannedBadge, setLastScannedBadge] = useState('');
  const [lastRestaurantScanSummary, setLastRestaurantScanSummary] = useState<{
    badge: string;
    profile: UserProfile;
    orders: Order[];
    processedAt: string;
    status: 'delivered' | 'active' | 'none';
  } | null>(null);
  const [isLastRestaurantScanPinned, setIsLastRestaurantScanPinned] = useState(false);
  const [scanReady, setScanReady] = useState(false);
  const [isCameraScannerOpen, setIsCameraScannerOpen] = useState(false);
  const [cameraScannerMessage, setCameraScannerMessage] = useState('');
  const [resumeCameraAfterScan, setResumeCameraAfterScan] = useState(false);
  const badgeScanInputRef = useRef<HTMLInputElement | null>(null);
  const cameraVideoRef = useRef<HTMLVideoElement | null>(null);
  const cameraScannerControlsRef = useRef<{ stop?: () => void } | null>(null);
  const cameraScanLockRef = useRef(false);
  const [stockInputs, setStockInputs] = useState<Record<string, string>>({});
  const [topupSearch, setTopupSearch] = useState('');
  const [topupAmount, setTopupAmount] = useState('');
  const [topupMethod, setTopupMethod] = useState<CashTransaction['method']>('cash');
  const [topupSubmitting, setTopupSubmitting] = useState(false);
  const topupInFlight = useRef(false);
  const topupGross = Number(topupAmount);
  const topupQuote = topupMethod !== 'cash' && Number.isSafeInteger(topupGross) && topupGross > 0 && topupGross <= 1000000000
    ? quoteMobileTopup(topupGross) : null;
  const [topupSelectedProfileId, setTopupSelectedProfileId] = useState('');
  const [topupServiceFilter, setTopupServiceFilter] = useState('Tous les services');
  const [badgePrintServiceFilter, setBadgePrintServiceFilter] = useState('Tous les services');
  const [badgePrintFunctionFilter, setBadgePrintFunctionFilter] = useState('Toutes les fonctions');
  const [strictBadgeSearch, setStrictBadgeSearch] = useState('');
  const [strictBadgeServiceFilter, setStrictBadgeServiceFilter] = useState('Tous les services');
  const [strictBadgeRoleFilter, setStrictBadgeRoleFilter] = useState('Tous les types');
  const [deliveryPermissionServiceFilter, setDeliveryPermissionServiceFilter] = useState('Tous les services');
  const [deliveryPermissionFunctionFilter, setDeliveryPermissionFunctionFilter] = useState('Toutes les fonctions');
  const [deliveryPermissionStatusFilter, setDeliveryPermissionStatusFilter] = useState('Tous les statuts');
  const [balanceAdjustmentMode, setBalanceAdjustmentMode] = useState<'set' | 'delta'>('set');
  const [balanceAdjustmentAmount, setBalanceAdjustmentAmount] = useState('');
  const [balanceAdjustmentReason, setBalanceAdjustmentReason] = useState('');
  const [agentAuditSearch, setAgentAuditSearch] = useState('');
  const [agentAuditServiceFilter, setAgentAuditServiceFilter] = useState('Tous les services');
  const [agentAuditProfileId, setAgentAuditProfileId] = useState('');
  const [satisfactionSurveyCount, setSatisfactionSurveyCount] = useState(0);
  const [hasLoadedSatisfactionStats, setHasLoadedSatisfactionStats] = useState(false);
  const [isLoadingSatisfactionStats, setIsLoadingSatisfactionStats] = useState(false);
  const [revenueReportStartDate, setRevenueReportStartDate] = useState(getLocalDateKey());
  const [revenueReportEndDate, setRevenueReportEndDate] = useState(getLocalDateKey());
  const [hourlyAnalysisStartDate, setHourlyAnalysisStartDate] = useState(getLocalDateKey());
  const [hourlyAnalysisEndDate, setHourlyAnalysisEndDate] = useState(getLocalDateKey());
  const [showHourlyAnalysis, setShowHourlyAnalysis] = useState(false);
  const [showAnalyticsCharts, setShowAnalyticsCharts] = useState(false);
  const revenueChartRef = useRef<HTMLDivElement | null>(null);
  const departmentChartRef = useRef<HTMLDivElement | null>(null);
  const categoryChartRef = useRef<HTMLDivElement | null>(null);
  const revenueSignatureOptions = [
    { id: 'restaurantManager', title: 'Responsable du restaurant', name: institutionConfig?.restaurantManagerName || 'Nom à renseigner' },
    { id: 'saf', title: 'Chef du service administratif et financier', name: institutionConfig?.safName || 'Nom à renseigner' },
    { id: 'managementController', title: 'Contrôleur de gestion', name: institutionConfig?.managementControllerName || 'Nom à renseigner' },
    { id: 'director', title: 'Directeur', name: institutionConfig?.directorName || 'Nom à renseigner' },
  ];
  const defaultRevenueSignatureOrder = revenueSignatureOptions.map(option => option.id);
  const getRevenueReportSignatureOrder = () => {
    const incomingOrder = Array.isArray(institutionConfig?.revenueReportSignatureOrder)
      ? institutionConfig.revenueReportSignatureOrder.map(String)
      : [];
    const validIds = new Set(defaultRevenueSignatureOrder);
    const normalized = incomingOrder.filter((id, index, list) => validIds.has(id) && list.indexOf(id) === index);
    return [...normalized, ...defaultRevenueSignatureOrder.filter(id => !normalized.includes(id))];
  };

  const handleInstitutionImage = (
    event: React.ChangeEvent<HTMLInputElement>,
    field: 'logoUrl' | 'directorPhotoUrl' | 'safPhotoUrl' | 'restaurantPhotoUrl'
  ) => {
    const file = event.target.files?.[0];
    if (!file || !institutionDraft) return;

    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const canvas = document.createElement('canvas');
        const maxSize = field === 'logoUrl' ? 360 : field === 'restaurantPhotoUrl' ? 720 : 512;
        const ratio = Math.min(maxSize / image.width, maxSize / image.height, 1);
        canvas.width = Math.max(1, Math.round(image.width * ratio));
        canvas.height = Math.max(1, Math.round(image.height * ratio));

        const context = canvas.getContext('2d');
        if (!context) return;
        context.drawImage(image, 0, 0, canvas.width, canvas.height);

        setInstitutionDraft({
          ...institutionDraft,
          [field]: canvas.toDataURL('image/jpeg', field === 'logoUrl' ? 0.8 : field === 'restaurantPhotoUrl' ? 0.76 : 0.72),
        });
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  };

  useEffect(() => {
    setInstitutionDraft(institutionConfig);
  }, [institutionConfig]);

  const normalizeReferentialEntry = (value: string) => value.trim().replace(/\s+/g, ' ');

  const normalizeServiceReferentialEntry = (value: string) => {
    const clean = normalizeReferentialEntry(value);
    const normalized = clean.toLocaleLowerCase('fr-FR').replace(/\s*\/\s*/g, '/');
    if (['sau', 'accueil des urgences', 'accueil urgences', 'urgences'].includes(normalized)) return 'SAU';
    if (['saf', 'service administratif et financier', 'services administratif et financier'].includes(normalized)) return 'SAF';
    if (['rh', 'ressource humaine', 'ressources humaines', 'ressources humaine'].includes(normalized)) return 'RH';
    if (['gyneco', 'gynéco', 'gynecologie', 'gynécologie', 'gyneco/maternite', 'gynéco/maternité', 'gynecologie/maternite', 'gynécologie/maternité'].includes(normalized)) return 'Gynecologie';
    if (['banque de sang', 'banque du sang', 'banques de sang', 'banques du sang'].includes(normalized)) return 'Banque de sang';
    if (['pharmacie centrale', 'pharmacie'].includes(normalized)) return 'Pharmacie';
    if (['cellule marches publiques', 'cellules marches publiques', 'cellule marchés publics', 'cellules marchés publics'].includes(normalized)) return 'Cellules marches publics';
    if (['administration', 'service administratif', 'services administratifs'].includes(normalized)) return 'Direction';
    return clean;
  };

  const mergeReferentialList = (items: string[] = [], nextValue: string) => {
    const merged: string[] = [];
    [...items, nextValue]
      .map(normalizeReferentialEntry)
      .filter(Boolean)
      .forEach(item => {
        const key = item.toLocaleLowerCase('fr-FR');
        if (!merged.some(existing => existing.toLocaleLowerCase('fr-FR') === key)) {
          merged.push(item);
        }
      });
    return merged.sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }));
  };

  const getReferentialAccessCode = () => String(
    institutionDraft?.registrationAccessCode
    || institutionConfig?.registrationAccessCode
    || institutionDraft?.deliveryAccessCode
    || institutionConfig?.deliveryAccessCode
    || ''
  ).trim();

  const verifyReferentialDeleteCode = () => {
    const expectedCode = getReferentialAccessCode();
    if (!expectedCode) {
      addNotification('Code absent', "Configurez d'abord un code d'accès dans les paramètres avant de supprimer un référentiel.", 'warning');
      return false;
    }
    const providedCode = window.prompt("Saisissez le code d'accès pour confirmer la suppression.");
    if (providedCode === null) return false;
    if (providedCode.trim() !== expectedCode) {
      addNotification('Suppression refusée', "Code d'accès incorrect. Aucun élément n'a été supprimé.", 'alert');
      return false;
    }
    return true;
  };

  const saveInstitutionReferential = async (
    nextDraft: RestaurantInstitutionConfig,
    title: string,
    message: string
  ) => {
    if (!onUpdateInstitutionConfig) {
      addNotification('Sauvegarde indisponible', "La sauvegarde des paramètres n'est pas disponible sur ce compte.", 'warning');
      return;
    }
    const previousDraft = institutionDraft;
    setInstitutionDraft(nextDraft);
    try {
      await onUpdateInstitutionConfig(nextDraft);
      addNotification(title, message, 'success');
    } catch (error) {
      console.error(error);
      if (previousDraft) setInstitutionDraft(previousDraft);
      addNotification('Sauvegarde refusée', "Firebase a refusé la mise à jour du référentiel. Vérifiez les droits administrateur.", 'alert');
    }
  };

  const handleAddServiceReferential = async () => {
    if (!institutionDraft) return;
    const service = normalizeServiceReferentialEntry(newServiceName);
    if (!service) {
      addNotification('Service manquant', 'Écrivez le nom du service puis cliquez sur Valider.', 'warning');
      return;
    }
    const nextServices = mergeReferentialList(institutionDraft.services || [], service);
    await saveInstitutionReferential(
      { ...institutionDraft, services: nextServices },
      'Service ajouté',
      `${service} est maintenant disponible dans les listes de services.`
    );
    setNewServiceName('');
  };

  const handleDeleteServiceReferential = async (service: string) => {
    if (!institutionDraft || !verifyReferentialDeleteCode()) return;
    const nextServices = (institutionDraft.services || []).filter(item => item !== service);
    await saveInstitutionReferential(
      { ...institutionDraft, services: nextServices },
      'Service supprimé',
      `${service} a été retiré du référentiel d'inscription.`
    );
  };

  const handleAddSpecialtyReferential = async () => {
    if (!institutionDraft) return;
    const specialty = normalizeReferentialEntry(newSpecialtyName);
    if (!specialty) {
      addNotification('Fonction manquante', 'Écrivez la fonction puis cliquez sur Valider.', 'warning');
      return;
    }
    const nextSpecialties = mergeReferentialList(institutionDraft.specialties || [], specialty);
    await saveInstitutionReferential(
      { ...institutionDraft, specialties: nextSpecialties },
      'Fonction ajoutée',
      `${specialty} est maintenant disponible dans les listes de fonctions.`
    );
    setNewSpecialtyName('');
  };

  const handleDeleteSpecialtyReferential = async (specialty: string) => {
    if (!institutionDraft || !verifyReferentialDeleteCode()) return;
    const nextSpecialties = (institutionDraft.specialties || []).filter(item => item !== specialty);
    await saveInstitutionReferential(
      { ...institutionDraft, specialties: nextSpecialties },
      'Fonction supprimée',
      `${specialty} a été retirée du référentiel d'inscription.`
    );
  };

  useEffect(() => {
    if (!canAccessAdministration && ['settings', 'anticipation'].includes(activeTab)) {
      setActiveTab('orders');
      return;
    }
    if (canAccessAdministration && ['orders', 'scan', 'inventory', 'delivery', 'topup'].includes(activeTab)) {
      setActiveTab('analytics');
    }
  }, [activeTab, canAccessAdministration]);

  // Next-day promotion states
  const [promotingMealId, setPromotingMealId] = useState<string | null>(null);
  const [promotionStockInput, setPromotionStockInput] = useState('30');
  
  // Filtering order status groups
  const visibleTodayMeals = meals.filter(m => m.isAvailableToday && !m.isNextDay);
  const employeeProfiles = profiles.filter(profile => profile.role === 'employee');
  const satisfactionResponseRate = employeeProfiles.length > 0
    ? Math.round((satisfactionSurveyCount / employeeProfiles.length) * 100)
    : 0;
  const loadSatisfactionSurveyStats = async () => {
    setIsLoadingSatisfactionStats(true);
    try {
      let surveys: any[] = [];
      if (db) {
        const snapshot = await getDocs(query(collection(db, 'satisfactionSurveys'), orderBy('createdAt', 'desc')));
        surveys = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
      }
      if (surveys.length === 0) {
        const localSurveys = localStorage.getItem('chncak_satisfaction_surveys');
        surveys = localSurveys ? JSON.parse(localSurveys) : [];
      }
      const uniqueEmployees = new Set(
        surveys
          .map(survey => String(survey.employeeId || '').trim())
          .filter(Boolean)
      );
      setSatisfactionSurveyCount(uniqueEmployees.size);
      setHasLoadedSatisfactionStats(true);
    } catch (error) {
      console.error(error);
      addNotification('Statistiques questionnaire', "Impossible de charger le taux de réponse du questionnaire.", 'warning');
    } finally {
      setIsLoadingSatisfactionStats(false);
    }
  };

  useEffect(() => {
    if (activeTab !== 'anticipation') return;
    setHasLoadedSatisfactionStats(false);
    setSatisfactionSurveyCount(0);
  }, [activeTab]);
  const getReportClosingDateKey = (value: Date | string = new Date()) => {
    const startKey = getOperationalDateKey(value, REPORT_OPERATIONAL_START);
    const closingDate = new Date(`${startKey}T00:00:00`);
    closingDate.setDate(closingDate.getDate() + 1);
    return getLocalDateKey(closingDate);
  };
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
  const getClientTimeWarning = (order: Order) => {
    if (!order.clientCreatedAt || order.clientCreatedAt === order.createdAt) return '';
    const serverTime = new Date(order.createdAt).getTime();
    const clientTime = new Date(order.clientCreatedAt).getTime();
    if (!Number.isFinite(serverTime) || !Number.isFinite(clientTime)) return '';
    const differenceMinutes = Math.round(Math.abs(serverTime - clientTime) / 60000);
    if (differenceMinutes < 15) return '';
    return `Heure appareil différente: ${new Date(order.clientCreatedAt).toLocaleDateString('fr-FR')} à ${new Date(order.clientCreatedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} (${differenceMinutes} min d'écart).`;
  };
  const restaurantTodayKey = getReportClosingDateKey(new Date());
  const restaurantTodayRange = getOperationalRange(restaurantTodayKey);
  const restaurantPeriodLabel = `${restaurantTodayRange.start.toLocaleString('fr-FR')} → ${restaurantTodayRange.end.toLocaleString('fr-FR')}`;
  const activeOrders = orders.filter(order =>
    isWithinDateRange(order.createdAt, restaurantTodayRange.start, restaurantTodayRange.end) &&
    order.paymentStatus === 'paid' &&
    ['pending', 'preparing', 'delivering'].includes(order.status) &&
    order.orderType !== 'special_dinner'
  );
  const normalizedOrderSearch = orderSearch.trim().toLowerCase();
  const filteredActiveOrders = normalizedOrderSearch
    ? activeOrders.filter(order => {
        const haystack = [
          order.id,
          order.employeeName,
          order.employeePhone,
          order.badgeNumber,
          order.department,
          order.building,
          order.floor,
          order.room,
          order.fulfillmentMode,
          order.items.map(item => item.meal?.name || '').join(' '),
        ].join(' ').toLowerCase();
        return haystack.includes(normalizedOrderSearch);
      })
    : activeOrders;
  const completedOrders = orders.filter(order =>
    isWithinDateRange(order.createdAt, restaurantTodayRange.start, restaurantTodayRange.end) &&
    order.paymentStatus === 'paid' &&
    ['delivered', 'cancelled', 'expired', 'returned'].includes(order.status) &&
    order.orderType !== 'special_dinner'
  );
  const pickupOrders = filteredActiveOrders.filter(order => (order.fulfillmentMode || 'pickup') === 'pickup');
  const deliveryOrders = filteredActiveOrders.filter(order => order.fulfillmentMode === 'delivery');
  const employeeProfilesByDepartment: { [department: string]: UserProfile[] } = {};
  employeeProfiles.forEach((profile) => {
    const department = profile.department || 'Service non renseigné';
    if (!employeeProfilesByDepartment[department]) {
      employeeProfilesByDepartment[department] = [];
    }
    employeeProfilesByDepartment[department].push(profile);
  });
  const departmentBadgeGroups = Object.entries(employeeProfilesByDepartment)
    .map(([department, departmentProfiles]) => ({
      department,
      profiles: departmentProfiles.sort((a, b) => a.name.localeCompare(b.name, 'fr')),
      pending: departmentProfiles.filter(profile => (profile.status || 'active') === 'pending').length,
      active: departmentProfiles.filter(profile => (profile.status || 'active') === 'active' && !profile.badgeBlocked).length,
      blocked: departmentProfiles.filter(profile => profile.badgeBlocked || profile.status === 'blocked').length,
    }))
    .sort((a, b) => a.department.localeCompare(b.department, 'fr'));
  const restaurantDepartments = ['Tous les services', ...Object.keys(employeeProfilesByDepartment).sort((a, b) => a.localeCompare(b, 'fr'))];
  const employeeFunctions = Array.from(new Set(
    employeeProfiles
      .map(profile => String(profile.room || '').trim())
      .filter(Boolean)
  )).sort((a, b) => a.localeCompare(b, 'fr'));
  const badgePrintProfiles = employeeProfiles.filter(profile => {
    const serviceLabel = profile.department || 'Service non renseigné';
    const functionLabel = String(profile.room || '').trim() || 'Fonction non renseignée';
    return (
      (badgePrintServiceFilter === 'Tous les services' || serviceLabel === badgePrintServiceFilter) &&
      (badgePrintFunctionFilter === 'Toutes les fonctions' || functionLabel === badgePrintFunctionFilter)
    );
  });
  const printableDepartmentBadgeGroups = Object.entries(
    badgePrintProfiles.reduce<Record<string, UserProfile[]>>((groups, profile) => {
      const department = profile.department || 'Service non renseigné';
      groups[department] = [...(groups[department] || []), profile];
      return groups;
    }, {})
  )
    .map(([department, departmentProfiles]) => ({
      department,
      profiles: departmentProfiles.sort((a, b) => a.name.localeCompare(b.name, 'fr')),
      pending: departmentProfiles.filter(profile => (profile.status || 'active') === 'pending').length,
      active: departmentProfiles.filter(profile => (profile.status || 'active') === 'active' && !profile.badgeBlocked).length,
      blocked: departmentProfiles.filter(profile => profile.badgeBlocked || profile.status === 'blocked').length,
    }))
    .sort((a, b) => a.department.localeCompare(b.department, 'fr'));
  const accountRoleLabels: Record<string, string> = {
    employee: 'Personnel',
    admin: 'Administrateur',
    restaurant_admin: 'Restaurant',
    operator: 'Opérateur scan/recharge',
    accountant: 'Comptable',
    delivery: 'Livreur',
    hr: 'DRH',
  };
  const getStrictBadgeRoleLabels = (profile: UserProfile) => {
    const labels = [accountRoleLabels[profile.role || 'employee'] || profile.role || 'Personnel'];
    if (profile.hrAccess && !labels.includes('DRH')) labels.push('DRH');
    if (profile.accountantAccess && !labels.includes('Comptable')) labels.push('Comptable');
    return labels;
  };
  const strictBadgeDepartments = ['Tous les services', ...Array.from(new Set(
    profiles.map(profile => profile.department || 'Service non renseigné')
  )).sort((a, b) => a.localeCompare(b, 'fr'))];
  const strictBadgeRoleOptions = ['Tous les types', ...Array.from(new Set(
    profiles.flatMap(profile => getStrictBadgeRoleLabels(profile))
  )).sort((a, b) => a.localeCompare(b, 'fr'))];
  const normalizedStrictBadgeSearch = strictBadgeSearch.trim().toLowerCase();
  const compactStrictBadgeSearch = strictBadgeSearch.replace(/\D/g, '');
  const strictBadgeProfiles = profiles
    .filter(profile => {
      const serviceLabel = profile.department || 'Service non renseigné';
      const roleLabels = getStrictBadgeRoleLabels(profile);
      const roleLabel = roleLabels.join(' + ');
      const searchableText = [
        profile.name,
        profile.email,
        profile.phone,
        profile.badgeNumber,
        profile.department,
        profile.room,
        roleLabel,
      ].join(' ').toLowerCase();
      const phoneDigits = String(profile.phone || '').replace(/\D/g, '');
      const searchOk = !normalizedStrictBadgeSearch ||
        searchableText.includes(normalizedStrictBadgeSearch) ||
        (!!compactStrictBadgeSearch && phoneDigits.includes(compactStrictBadgeSearch));
      return (
        searchOk &&
        (strictBadgeServiceFilter === 'Tous les services' || serviceLabel === strictBadgeServiceFilter) &&
        (strictBadgeRoleFilter === 'Tous les types' || roleLabels.includes(strictBadgeRoleFilter))
      );
    })
    .sort((a, b) => `${a.department || ''}-${a.name}`.localeCompare(`${b.department || ''}-${b.name}`, 'fr'));
  const strictDepartmentBadgeGroups = Object.entries(
    strictBadgeProfiles.reduce<Record<string, UserProfile[]>>((groups, profile) => {
      const department = profile.department || 'Service non renseigné';
      groups[department] = [...(groups[department] || []), profile];
      return groups;
    }, {})
  )
    .map(([department, departmentProfiles]) => ({
      department,
      profiles: departmentProfiles.sort((a, b) => a.name.localeCompare(b.name, 'fr')),
      pending: departmentProfiles.filter(profile => (profile.status || 'active') === 'pending').length,
      active: departmentProfiles.filter(profile => (profile.status || 'active') === 'active' && !profile.badgeBlocked).length,
      blocked: departmentProfiles.filter(profile => profile.badgeBlocked || profile.status === 'blocked').length,
    }))
    .sort((a, b) => a.department.localeCompare(b.department, 'fr'));
  const filteredDeliveryPermissionProfiles = employeeProfiles
    .filter(profile => {
      const serviceLabel = profile.department || 'Service non renseigné';
      const functionLabel = String(profile.room || '').trim() || 'Fonction non renseignée';
      const statusLabel = profile.badgeBlocked || profile.status === 'blocked'
        ? 'Bloqués'
        : profile.status === 'pending'
          ? 'En attente'
          : profile.deliveryAllowed
            ? 'Livraison autorisée'
            : 'Sur place';
      return (
        (deliveryPermissionServiceFilter === 'Tous les services' || serviceLabel === deliveryPermissionServiceFilter) &&
        (deliveryPermissionFunctionFilter === 'Toutes les fonctions' || functionLabel === deliveryPermissionFunctionFilter) &&
        (deliveryPermissionStatusFilter === 'Tous les statuts' || statusLabel === deliveryPermissionStatusFilter)
      );
    })
    .sort((a, b) => `${a.department || ''}-${a.name}`.localeCompare(`${b.department || ''}-${b.name}`, 'fr'));
  const topupServiceProfiles = topupServiceFilter === 'Tous les services'
    ? employeeProfiles
    : employeeProfiles.filter(profile => (profile.department || 'Service non renseigné') === topupServiceFilter);
  const normalizedTopupSearch = topupSearch.trim().toLowerCase();
  const compactTopupSearch = topupSearch.replace(/\D/g, '');
  const getTopupMatchPriority = (profile: UserProfile) => {
    const badge = String(profile.badgeNumber || '').toLowerCase();
    const phone = String(profile.phone || '').replace(/\D/g, '');
    const email = String(profile.email || '').toLowerCase();
    const name = String(profile.name || '').toLowerCase();
    if (normalizedTopupSearch && badge === normalizedTopupSearch) return 0;
    if (compactTopupSearch && phone === compactTopupSearch) return 1;
    if (normalizedTopupSearch && email === normalizedTopupSearch) return 2;
    if (normalizedTopupSearch && name === normalizedTopupSearch) return 3;
    if (normalizedTopupSearch && badge.includes(normalizedTopupSearch)) return 4;
    if (compactTopupSearch && phone.endsWith(compactTopupSearch)) return 5;
    return 10;
  };
  const topupMatches = (normalizedTopupSearch
    ? topupServiceProfiles
        .filter((profile) => {
          const haystack = [
            profile.name,
            profile.badgeNumber,
            profile.phone,
            profile.email,
            profile.department,
          ].join(' ').toLowerCase();
          return haystack.includes(normalizedTopupSearch);
        })
    : topupServiceProfiles
  )
    .sort((a, b) => getTopupMatchPriority(a) - getTopupMatchPriority(b) || a.name.localeCompare(b.name, 'fr'));
  const selectedTopupProfile = employeeProfiles.find(profile => profile.id === topupSelectedProfileId) || null;
  const profileLookup = new Map<string, UserProfile>(profiles.map(profile => [profile.id, profile]));
  const getTransactionCashierName = (transaction: CashTransaction) => {
    const cashierProfile = profileLookup.get(transaction.cashierId);
    return String(cashierProfile?.name || transaction.cashierName || '').trim() || 'Non tracé';
  };
  const selectedTopupTransactions = selectedTopupProfile
    ? cashTransactions
        .filter(transaction =>
          transaction.employeeId === selectedTopupProfile.id ||
          (!!selectedTopupProfile.badgeNumber && transaction.badgeNumber === selectedTopupProfile.badgeNumber)
        )
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    : [];
  const recentTopupTransactions = [...cashTransactions]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 20);
  const accountingPrices = {
    real: Number(institutionConfig?.realMealPrice || DEFAULT_REAL_MEAL_PRICE),
    hospital: Number(institutionConfig?.hospitalSupportAmount || DEFAULT_HOSPITAL_SUPPORT),
    staff: Number(institutionConfig?.staffMealPrice || DEFAULT_STAFF_MEAL_PRICE),
    legacy: institutionConfig?.legacyAccountingPrices,
  };
  const normalizedAgentAuditSearch = agentAuditSearch.trim().toLowerCase();
  const agentAuditServices = Array.from(new Set(
    employeeProfiles
      .map(profile => profile.department)
      .filter((department): department is string => Boolean(department?.trim()))
  )).sort((a, b) => a.localeCompare(b, 'fr'));
  const agentAuditServiceProfiles = agentAuditServiceFilter === 'Tous les services'
    ? employeeProfiles
    : employeeProfiles.filter(profile => profile.department === agentAuditServiceFilter);
  const agentAuditMatches = (normalizedAgentAuditSearch
    ? agentAuditServiceProfiles.filter((profile) => [
        profile.name,
        profile.badgeNumber,
        profile.phone,
        profile.email,
        profile.department,
      ].join(' ').toLowerCase().includes(normalizedAgentAuditSearch))
    : agentAuditServiceProfiles
  )
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  const selectedAgentAuditProfile = employeeProfiles.find(profile => profile.id === agentAuditProfileId) || null;
  const getProfileAudit = (profile: UserProfile) => {
    const matchOrder = (order: Order) =>
      order.employeeId === profile.id ||
      (!!profile.badgeNumber && order.badgeNumber === profile.badgeNumber) ||
      (!!profile.email && order.employeeEmail === profile.email);
    const matchTransaction = (transaction: CashTransaction) =>
      transaction.employeeId === profile.id ||
      (!!profile.badgeNumber && transaction.badgeNumber === profile.badgeNumber);
    const profileOrders = orders
      .filter(matchOrder)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const paidOrders = profileOrders.filter(isPaidAccountingOrder);
    const debitedOrders = profileOrders.filter(order =>
      order.orderType !== 'special_dinner' &&
      order.paymentStatus === 'paid'
    );
    const refundedOrders = profileOrders.filter(order =>
      order.paymentStatus === 'refunded' ||
      order.status === 'cancelled' ||
      order.status === 'expired'
    );
    const profileTransactions = cashTransactions
      .filter(matchTransaction)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const realRefundTransactions = profileTransactions.filter(transaction =>
      Number(transaction.amount || 0) > 0 &&
      /rembours|refund|recr[eé]dit|annul|expir/i.test(`${transaction.note || ''} ${transaction.correctionReason || ''}`)
    );
    const subsidizedDays = new Set<string>();
    const totalExpenses = paidOrders.reduce((sum, order) => {
      const subsidyKey = `${order.employeeId}-${getOperationalDateKey(order.createdAt, '19:00')}`;
      const accounting = getOrderAccounting(order, accountingPrices, !subsidizedDays.has(subsidyKey));
      if (accounting.subsidizedQuantity > 0) subsidizedDays.add(subsidyKey);
      return sum + accounting.staffPaid;
    }, 0);
    const debitedSubsidizedDays = new Set<string>();
    const totalDebitedExpenses = debitedOrders.reduce((sum, order) => {
      const subsidyKey = `${order.employeeId}-${getOperationalDateKey(order.createdAt, '19:00')}`;
      const accounting = getOrderAccounting(order, accountingPrices, !debitedSubsidizedDays.has(subsidyKey));
      if (accounting.subsidizedQuantity > 0) debitedSubsidizedDays.add(subsidyKey);
      return sum + accounting.staffPaid;
    }, 0);
    const totalRecharges = profileTransactions.reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0);
    const totalRefunded = refundedOrders.reduce((sum, order) => sum + Number(order.total || 0), 0);
    const totalRealRefunded = realRefundTransactions.reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0);
    const theoreticalBalance = Math.max(0, totalRecharges - totalExpenses + totalRefunded);
    const realTheoreticalBalance = Math.max(0, totalRecharges - totalDebitedExpenses + totalRealRefunded);
    const currentBalance = Number(profile.walletBalance || 0);
    return {
      profileOrders,
      paidOrders,
      debitedOrders,
      refundedOrders,
      profileTransactions,
      realRefundTransactions,
      totalExpenses,
      totalDebitedExpenses,
      totalRecharges,
      totalRefunded,
      totalRealRefunded,
      theoreticalBalance,
      realTheoreticalBalance,
      currentBalance,
      gap: currentBalance - theoreticalBalance,
      realGap: currentBalance - realTheoreticalBalance,
    };
  };
  const selectedAgentAudit = selectedAgentAuditProfile ? getProfileAudit(selectedAgentAuditProfile) : null;
  const saveProfileAdministrationChange = async (
    profile: UserProfile,
    patch: Partial<UserProfile>,
    successTitle: string,
    successMessage: string
  ) => {
    try {
      await Promise.resolve(onUpdateProfile({ ...profile, ...patch, __adminPatchKeys: Object.keys(patch) } as UserProfile & { __adminPatchKeys: string[] }));
      addNotification(successTitle, successMessage, 'success');
    } catch (error) {
      console.error(error);
      const detail = error instanceof Error ? error.message : String(error || 'Erreur inconnue');
      addNotification(
        'Modification refusée',
        `Firebase a refusé l'enregistrement (${detail}). Champs demandés: ${Object.keys(patch).join(', ') || 'aucun'}.`,
        'alert'
      );
    }
  };
  const exportBadgeAuditExcel = () => {
    const escapeCell = (value: unknown) => String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
    const table = (title: string, headers: string[], rows: Array<Array<unknown>>) => `
      <h2>${escapeCell(title)}</h2>
      <table border="1">
        <thead><tr>${headers.map(header => `<th>${escapeCell(header)}</th>`).join('')}</tr></thead>
        <tbody>${rows.length ? rows.map(row => `<tr>${row.map(cell => `<td>${escapeCell(cell)}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${headers.length}">Aucune donnée</td></tr>`}</tbody>
      </table>
    `;
    const profileRows = employeeProfiles.map(profile => {
      const audit = getProfileAudit(profile);
      const correctionTransactions = audit.profileTransactions.filter(transaction => transaction.correctionOf || transaction.correctionReason);
      const informationalRefundTotal = Math.max(0, audit.totalRefunded - audit.totalRealRefunded);
      return [
        profile.id,
        profile.name,
        profile.badgeNumber,
        profile.phone,
        profile.email,
        profile.department,
        profile.room || '',
        profile.createdAt ? new Date(profile.createdAt).toLocaleString('fr-FR') : '',
        profile.validatedByName || '',
        profile.validatedAt ? new Date(profile.validatedAt).toLocaleString('fr-FR') : '',
        profile.status || 'active',
        profile.badgeBlocked ? 'Oui' : 'Non',
        profile.walletBalance || 0,
        audit.totalRecharges,
        audit.totalExpenses,
        audit.totalRefunded,
        audit.totalRealRefunded,
        informationalRefundTotal,
        audit.realTheoreticalBalance,
        audit.realGap,
        audit.theoreticalBalance,
        audit.gap,
        audit.profileTransactions.map(transaction => `${new Date(transaction.createdAt).toLocaleString('fr-FR')} | ${transaction.amount} F | ${transaction.method === 'wave' ? 'Wave' : transaction.method === 'orange_money' ? 'Orange Money' : 'Espèces'} | ${transaction.cashierName || ''}${transaction.note ? ` | ${transaction.note}` : ''}`).join(' ; '),
        audit.profileOrders.map(order => `${new Date(order.createdAt).toLocaleString('fr-FR')} | ${order.id} | ${order.status} | ${order.paymentStatus} | ${order.items.map(item => `${item.quantity} x ${item.meal?.name || 'Repas'}`).join(', ')} | ${order.total} F`).join(' ; '),
        audit.refundedOrders.map(order => `${new Date(order.createdAt).toLocaleString('fr-FR')} | ${order.id} | ${order.status} | ${order.paymentStatus} | ${order.total} F | ${order.paymentStatus === 'refunded' ? 'marquée remboursée' : 'annulée/expirée, information seulement sauf recrédit tracé'}`).join(' ; '),
        audit.realRefundTransactions.map(transaction => `${new Date(transaction.createdAt).toLocaleString('fr-FR')} | ${transaction.amount} F | ${transaction.note || ''} | ${transaction.correctionReason || ''}`).join(' ; '),
        correctionTransactions.map(transaction => `${new Date(transaction.createdAt).toLocaleString('fr-FR')} | ${transaction.amount} F | correction de ${transaction.correctionOf || '-'} | ${transaction.correctionReason || ''}`).join(' ; '),
      ];
    });
    const rechargeRows = cashTransactions
      .slice()
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      .map(transaction => {
        const profile = employeeProfiles.find(item =>
          item.id === transaction.employeeId ||
          (!!item.badgeNumber && item.badgeNumber === transaction.badgeNumber)
        );
        return [
          transaction.id,
          new Date(transaction.createdAt).toLocaleString('fr-FR'),
          transaction.employeeName,
          profile?.phone || '',
          profile?.department || '',
          transaction.badgeNumber,
          transaction.amount,
          transaction.method === 'wave' ? 'Wave' : transaction.method === 'orange_money' ? 'Orange Money' : 'Espèces',
          transaction.cashierName || '',
          transaction.note || '',
          transaction.correctionOf || '',
          transaction.correctionReason || '',
        ];
      });
    const orderRows = orders
      .slice()
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      .map(order => [
        order.id,
        new Date(order.createdAt).toLocaleString('fr-FR'),
        order.employeeName,
        order.employeePhone || '',
        order.department || '',
        order.badgeNumber,
        order.status,
        order.paymentStatus,
        order.items.map(item => `${item.quantity} x ${item.meal?.name || 'Repas'}`).join(', '),
        order.total || 0,
        order.orderType || 'regular',
      ]);
    const html = `<html><head><meta charset="utf-8" />
      <style>body{font-family:Arial,sans-serif;color:#0f172a}h1{font-size:18px;text-transform:uppercase}h2{margin-top:24px;font-size:14px;color:#1d4ed8}table{border-collapse:collapse;width:100%;margin-bottom:18px}th,td{border:1px solid #cbd5e1;padding:6px;font-size:11px;vertical-align:top}th{background:#eff6ff;font-weight:800;text-transform:uppercase}</style>
      </head><body>
      <h1>Audit exhaustif des badges - Ndamatou</h1>
      <p>Export généré le ${escapeCell(new Date().toLocaleString('fr-FR'))}. Contrôle des soldes, recharges, commandes, annulations/expirations, corrections et écarts par agent.</p>
      <p><strong>Lecture des remboursements :</strong> les remboursements réellement faits sont uniquement ceux qui apparaissent comme recrédit/correction positive dans le journal. Les commandes annulées, expirées ou marquées remboursées sans recrédit tracé sont indiquées séparément comme information d'audit.</p>
      ${table('Synthèse par agent', ['ID', 'Nom', 'Badge', 'Téléphone', 'Email', 'Service', 'Fonction', 'Création badge', 'Validé par', 'Date validation', 'Statut', 'Badge bloqué', 'Solde actuel', 'Total recharges', 'Total commandes', 'Annulées/expirées/remboursées repérées', 'Remboursements réellement recrédités', 'Remboursements fictifs / information seulement', 'Solde théorique réel', 'Écart réel', 'Solde théorique historique', 'Écart historique', 'Détails recharges', 'Détails commandes', 'Commandes annulées / expirées / remboursées', 'Détails recrédits réels', 'Corrections de solde'], profileRows)}
      ${table('Détail des recharges', ['Transaction', 'Date', 'Personnel', 'Téléphone', 'Service', 'Badge', 'Montant', 'Mode', 'Caissier', 'Note', 'Correction de', 'Motif correction'], rechargeRows)}
      ${table('Détail des commandes', ['Commande', 'Date', 'Personnel', 'Téléphone', 'Service', 'Badge', 'Statut', 'Paiement', 'Articles', 'Montant', 'Type'], orderRows)}
      </body></html>`;
    const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = `audit-badges-Ndamatou-${getLocalDateKey()}.xls`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const exportSatisfactionSurveyExcel = async () => {
    const expectedCode = String(institutionConfig?.satisfactionExportCode || 'NDAMATOU2026').trim();
    const enteredCode = window.prompt("Code d'accès pour exporter les questionnaires de satisfaction");
    if (enteredCode === null) return;
    if (enteredCode.trim() !== expectedCode) {
      addNotification('Code incorrect', "L'export Excel du questionnaire n'a pas été autorisé.", 'alert');
      return;
    }

    const escapeCell = (value: unknown) => String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
    let surveys: any[] = [];
    try {
      if (db) {
        const snapshot = await getDocs(query(collection(db, 'satisfactionSurveys'), orderBy('createdAt', 'desc')));
        surveys = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
      }
    } catch (error) {
      console.error(error);
      addNotification('Export incomplet', "Firebase n'a pas pu charger les questionnaires. Une copie locale sera utilisée si elle existe.", 'warning');
    }

    if (surveys.length === 0) {
      try {
        const localSurveys = localStorage.getItem('chncak_satisfaction_surveys');
        surveys = localSurveys ? JSON.parse(localSurveys) : [];
      } catch {
        surveys = [];
      }
    }

    const statementKeys = Object.keys(satisfactionSurveyStatementLabels);
    const headers = [
      'Date',
      'Prénom et nom',
      'Badge',
      'Téléphone',
      'Service',
      'Sexe',
      'Tranche âge',
      'Fréquence',
      'Satisfaction globale',
      ...statementKeys.map(key => satisfactionSurveyStatementLabels[key]),
      'Améliorations proposées',
    ];
    const rows = surveys.map(survey => [
      survey.createdAt ? new Date(survey.createdAt).toLocaleString('fr-FR') : '',
      survey.employeeName || '',
      survey.badgeNumber || '',
      survey.phone || '',
      survey.department || '',
      survey.gender || '',
      survey.ageRange || '',
      survey.frequency || '',
      survey.globalSatisfaction || '',
      ...statementKeys.map(key => survey.ratings?.[key] || ''),
      survey.improvementText || '',
    ]);
    const uniqueRespondents = new Set(
      surveys
        .map(survey => String(survey.employeeId || '').trim())
        .filter(Boolean)
    ).size;
    const responseRate = employeeProfiles.length > 0
      ? Math.round((uniqueRespondents / employeeProfiles.length) * 100)
      : 0;

    const tableRows = rows.length
      ? rows.map(row => `<tr>${row.map(cell => `<td>${escapeCell(cell)}</td>`).join('')}</tr>`).join('')
      : `<tr><td colspan="${headers.length}">Aucune réponse enregistrée pour le moment</td></tr>`;
    const html = `<html><head><meta charset="utf-8" />
      <style>body{font-family:Arial,sans-serif;color:#0f172a}h1{font-size:18px;text-transform:uppercase}p{font-size:12px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #cbd5e1;padding:7px;font-size:11px;vertical-align:top}th{background:#ecfdf5;color:#1d4ed8;font-weight:800;text-transform:uppercase}</style>
      </head><body>
      <h1>Questionnaire de satisfaction restaurant Ndamatou</h1>
      <p>Export généré le ${escapeCell(new Date().toLocaleString('fr-FR'))}. Réponses du personnel au questionnaire de satisfaction.</p>
      <p><strong>Taux de réponse :</strong> ${escapeCell(uniqueRespondents)} réponse(s) unique(s) / ${escapeCell(employeeProfiles.length)} personnel(s), soit ${escapeCell(responseRate)}%.</p>
      <table>
        <thead><tr>${headers.map(header => `<th>${escapeCell(header)}</th>`).join('')}</tr></thead>
        <tbody>${tableRows}</tbody>
      </table>
      </body></html>`;
    const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = `questionnaire-satisfaction-restaurant-Ndamatou-${getLocalDateKey()}.xls`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const resetSatisfactionSurveyResponses = async () => {
    const expectedCode = String(institutionConfig?.satisfactionExportCode || 'NDAMATOU2026').trim();
    const enteredCode = window.prompt("Code d'accès pour remettre à zéro le questionnaire de satisfaction");
    if (enteredCode === null) return;
    if (enteredCode.trim() !== expectedCode) {
      addNotification('Code incorrect', "La remise à zéro du questionnaire n'a pas été autorisée.", 'alert');
      return;
    }
    const confirmed = window.confirm(
      "Confirmez-vous la suppression de toutes les réponses du questionnaire de satisfaction ? Cette action ne touche pas aux badges, commandes, paiements ni rapports financiers."
    );
    if (!confirmed) return;

    try {
      if (db) {
        const snapshot = await getDocs(query(collection(db, 'satisfactionSurveys')));
        await Promise.all(snapshot.docs.map(item => deleteDoc(doc(db, 'satisfactionSurveys', item.id))));
      }
      localStorage.removeItem('chncak_satisfaction_surveys');
      Object.keys(localStorage)
        .filter(key => key.startsWith('chncak_satisfaction_survey_submitted_'))
        .forEach(key => localStorage.removeItem(key));
      setSatisfactionSurveyCount(0);
      addNotification('Questionnaire remis à zéro', 'Toutes les réponses du questionnaire ont été supprimées.', 'success');
    } catch (error) {
      console.error(error);
      addNotification('Remise à zéro refusée', "Firebase n'a pas accepté la suppression. Vérifiez les règles Firestore et votre compte admin.", 'alert');
    }
  };
  const mealCategories: { key: MealCategory; label: string }[] = [
    { key: 'plat', label: 'Plats chauds' },
    { key: 'entrée', label: 'Entrées' },
    { key: 'dessert', label: 'Desserts' },
    { key: 'boisson', label: 'Boissons' },
  ];
  const senegaleseTomorrowMenus = [
    {
      name: 'Thiéboudienne rouge',
      description: 'Riz au poisson sénégalais avec légumes, sauce tomate mijotée, chou, carotte, manioc et aubergine.',
      price: 2500,
      calories: 680,
      image: 'Thiéboudienne',
    },
    {
      name: 'Mafé boeuf',
      description: "Boeuf mijoté dans une sauce arachide onctueuse, accompagné de riz blanc et légumes.",
      price: 2400,
      calories: 750,
      image: 'Mafé',
    },
    {
      name: 'Domoda poisson',
      description: 'Sauce domoda acidulée au poisson, légumes et riz blanc, préparée façon familiale sénégalaise.',
      price: 2300,
      calories: 650,
      image: 'Domoda',
    },
    {
      name: 'Souloukhou',
      description: 'Plat sénégalais à base de sauce riche et parfumée, servi avec riz et accompagnement de saison.',
      price: 2600,
      calories: 720,
      image: 'Souloukhou',
    },
    {
      name: 'Yassa poulet',
      description: 'Poulet mariné citron-moutarde, oignons confits et riz blanc.',
      price: 2200,
      calories: 620,
      image: 'Yassa',
    },
  ];

  const resetMealForm = () => {
    setEditingMealId(null);
    setNewMealName('');
    setNewMealDesc('');
    setNewMealPrice('2000');
    setNewMealStock('20');
    setNewMealCalories('500');
    setNewMealCategory('plat');
    setNewMealImage('Plat');
  };

  const openEditMeal = (meal: Meal) => {
    setEditingMealId(meal.id);
    setNewMealName(meal.name);
    setNewMealDesc(meal.description);
    setNewMealPrice(String(meal.price));
    setNewMealStock(String(meal.stock));
    setNewMealCalories(String(meal.calories));
    setNewMealCategory(meal.category);
    setNewMealImage(meal.image || 'Plat');
    setIsAddMealOpen(true);
  };

  // Submit adding or editing standard meal
  const handleCreateMeal = (e: React.FormEvent) => {
    e.preventDefault();
    const stock = parseInt(newMealStock, 10) || 0;
    const mealPayload = {
      name: newMealName,
      description: newMealDesc,
      category: newMealCategory,
      price: parseInt(newMealPrice, 10) || 1500,
      stock,
      maxStock: Math.max(stock, Math.ceil(stock * 1.5), 1),
      image: newMealImage,
      isNextDay: false,
      isAvailableToday: true,
      calories: parseInt(newMealCalories, 10) || 450,
      allergens: []
    };

    if (editingMealId) {
      onUpdateMeal({ ...mealPayload, id: editingMealId });
    } else {
      onAddNewMeal(mealPayload);
    }

    setIsAddMealOpen(false);
    resetMealForm();
  };

  // Submit adding proposed next-day meal
  const handleCreateProposal = (e: React.FormEvent, isNextDay: boolean) => {
    e.preventDefault();
    onAddNewProposal({
      name: newMealName,
      description: newMealDesc,
      category: newMealCategory,
      price: parseInt(newMealPrice, 10) || 1500,
      stock: 0,
      maxStock: 30,
      image: newMealImage,
      isNextDay: true,
      votesNextDay: 0,
      votedBy: [],
      isAvailableToday: false,
      calories: parseInt(newMealCalories, 10) || 450,
      allergens: []
    });
    setIsAddProposalOpen(false);
    // Reset fields
    setNewMealName('');
    setNewMealDesc('');
    setNewMealPrice('2000');
    setNewMealStock('20');
    setNewMealCalories('500');
  };

  // Promote a next-day meal to today's list dynamically
  const handleConfirmPromotion = () => {
    if (promotingMealId) {
      onPromoteNextDayMeal(promotingMealId, parseInt(promotionStockInput, 10) || 30);
      setPromotingMealId(null);
      addNotification(
        'Menu promu',
        "Le menu a été activé avec succès dans la carte d'aujourd'hui, le stock a été initialisé !",
        'success'
      );
    }
  };

  const addTomorrowMenuExample = (menu: typeof senegaleseTomorrowMenus[number]) => {
    onAddNewProposal({
      name: menu.name,
      description: menu.description,
      category: 'plat',
      price: menu.price,
      stock: 0,
      maxStock: 30,
      image: menu.image,
      isNextDay: true,
      votesNextDay: 0,
      votedBy: [],
      isAvailableToday: false,
      calories: menu.calories,
      allergens: [],
    });
    addNotification('Menu proposé', `${menu.name} a été ajouté au vote pour demain.`, 'success');
  };

  const getMealStockInput = (meal: Meal) => stockInputs[meal.id] ?? '';

  const getMealStockInputNumber = (meal: Meal) => {
    const value = Number(getMealStockInput(meal));
    return Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
  };

  const handleAddMealStock = (meal: Meal) => {
    const quantity = getMealStockInputNumber(meal);
    if (quantity <= 0) {
      addNotification('Quantité invalide', 'Renseignez une quantité supérieure à zéro avant ajout.', 'warning');
      return;
    }
    onUpdateMealStock(meal.id, meal.stock + quantity);
    setStockInputs(current => ({ ...current, [meal.id]: '' }));
    addNotification('Portions ajoutées', `${quantity} portion(s) ajoutée(s) à ${meal.name}.`, 'success');
  };

  const handleSetMealStock = (meal: Meal) => {
    const quantity = getMealStockInputNumber(meal);
    onUpdateMealStock(meal.id, quantity);
    setStockInputs(current => ({ ...current, [meal.id]: '' }));
    addNotification('Stock défini', `Le stock de ${meal.name} est maintenant à ${quantity} portion(s).`, 'success');
  };

  const handleToggleMealToday = (meal: Meal) => {
    const isHotMeal = meal.category === 'plat' && (meal.mealType || 'regular') === 'regular';
    const maxActiveHotMeals = Math.max(1, Number(institutionConfig?.maxActiveHotMealsPerDay || 2));
    const activeHotMealsCount = meals.filter(item =>
      item.id !== meal.id &&
      item.category === 'plat' &&
      item.isAvailableToday &&
      !item.isNextDay &&
      (item.mealType || 'regular') === 'regular'
    ).length;
    if (!meal.isAvailableToday && isHotMeal && activeHotMealsCount >= maxActiveHotMeals) {
      addNotification('Limite atteinte', `Vous pouvez activer seulement ${maxActiveHotMeals} plat(s) chaud(s) pour aujourd’hui.`, 'warning');
      return;
    }
    onUpdateMeal({ ...meal, isAvailableToday: !meal.isAvailableToday, isNextDay: false });
    addNotification(
      meal.isAvailableToday ? 'Menu retiré' : 'Menu activé',
      meal.isAvailableToday ? `${meal.name} n’est plus visible chez les agents.` : `${meal.name} est visible chez les agents.`,
      'success'
    );
  };

  const handleRestaurantTopup = async () => {
    if (topupInFlight.current) return;
    if (!selectedTopupProfile) {
      addNotification('Personnel introuvable', 'Recherchez puis sélectionnez le personnel à recharger.', 'warning');
      return;
    }
    const gross = Number(topupAmount || 0);
    if (!Number.isSafeInteger(gross) || gross <= 0 || gross > 1000000000) {
      addNotification('Montant invalide', 'Renseignez un montant entier supérieur à zéro.', 'warning');
      return;
    }
    if (!onTopupBadge) {
      addNotification('Recharge indisponible', 'La fonction de recharge badge n’est pas connectée sur ce compte.', 'alert');
      return;
    }
    const quote = topupMethod === 'cash' ? null : quoteMobileTopup(gross);
    const amount = quote?.amount ?? gross;
    const confirmed = window.confirm(`Versement ${topupMethod === 'cash' ? 'espèces' : topupMethod === 'wave' ? 'Wave' : 'Orange Money'} confirmé de ${gross.toLocaleString('fr-FR')} F. Créditer ${selectedTopupProfile.name} (${selectedTopupProfile.badgeNumber}) de ${amount.toLocaleString('fr-FR')} F ?${quote ? ` Contribution agent : ${quote.waveFeeAmount} F. Aucun nouveau frais au paiement du repas.` : ''}`);
    if (!confirmed) return;
    topupInFlight.current = true;
    setTopupSubmitting(true);
    try {
      await onTopupBadge(selectedTopupProfile, amount, 'Recharge badge effectuée au restaurant — paiement confirmé', topupMethod, quote ? gross : undefined);
      addNotification('Badge crédité', `${selectedTopupProfile.name} a été crédité de ${amount.toLocaleString('fr-FR')} FCFA.`, 'success');
      setTopupAmount('');
    } catch (error) {
      console.error(error);
      addNotification('Recharge refusée', 'Firebase a refusé la recharge. Vérifiez les règles et la connexion.', 'alert');
    } finally {
      topupInFlight.current = false;
      setTopupSubmitting(false);
    }
  };

  const handleRestaurantBalanceAdjustment = async () => {
    if (!selectedTopupProfile) {
      addNotification('Personnel introuvable', 'Sélectionnez un agent avant modification du solde.', 'warning');
      return;
    }
    if (!onAdjustBadgeBalance) {
      addNotification('Modification indisponible', 'La fonction modifier solde badge n’est pas connectée sur ce compte.', 'alert');
      return;
    }
    const amount = Math.floor(Number(balanceAdjustmentAmount || 0));
    if (!Number.isFinite(amount) || amount < 0) {
      addNotification('Montant invalide', 'Renseignez un montant correct.', 'warning');
      return;
    }
    const currentBalance = Number(selectedTopupProfile.walletBalance || 0);
    const targetBalance = balanceAdjustmentMode === 'set' ? amount : currentBalance + amount;
    if (targetBalance < 0) {
      addNotification('Solde impossible', 'Le solde final ne peut pas être négatif.', 'warning');
      return;
    }
    const reason = balanceAdjustmentReason.trim() || 'Correction solde badge au restaurant';
    const confirmed = window.confirm(
      `Modifier le solde de ${selectedTopupProfile.name} ?\n\nSolde actuel: ${currentBalance.toLocaleString('fr-FR')} FCFA\nNouveau solde: ${targetBalance.toLocaleString('fr-FR')} FCFA\nMotif: ${reason}`
    );
    if (!confirmed) return;
    try {
      await onAdjustBadgeBalance(selectedTopupProfile, targetBalance, reason);
      addNotification('Solde modifié', `${selectedTopupProfile.name} a maintenant ${targetBalance.toLocaleString('fr-FR')} FCFA.`, 'success');
      setBalanceAdjustmentAmount('');
      setBalanceAdjustmentReason('');
    } catch (error) {
      console.error(error);
      addNotification('Modification refusée', 'Firebase a refusé la modification du solde. Vérifiez les règles et le rôle du compte.', 'alert');
    }
  };

  const handlePrintRevenueReport = async (periodOverride?: string, customStartDate?: string, customEndDate?: string) => {
    const period = periodOverride || window.prompt('Imprimer les recettes pour quelle période ? journalier, hebdo, mensuel, semestriel, annuel ou periode', 'journalier');
    if (!period) return;

    const normalizedPeriod = period.toLowerCase();
    const allowedPeriods = ['journalier', 'hebdo', 'mensuel', 'semestriel', 'annuel', 'periode'];
    const selectedPeriod = allowedPeriods.includes(normalizedPeriod) ? normalizedPeriod : 'journalier';
    const now = new Date();
    const closingKey = getReportClosingDateKey(now);
    const getReportRange = () => {
      if (selectedPeriod === 'periode') {
        const startInput = customStartDate || window.prompt('Date de début de période (AAAA-MM-JJ)', getLocalDateKey(now));
        if (!startInput) return getOperationalRange(closingKey);
        const endInput = customEndDate || window.prompt('Date de fin de période (AAAA-MM-JJ)', startInput);
        return getOperationalRange(startInput, endInput || startInput);
      }
      if (selectedPeriod === 'journalier') return getOperationalRange(closingKey);
      const closingDate = new Date(`${closingKey}T00:00:00`);
      const startDate = new Date(closingDate);
      if (selectedPeriod === 'hebdo') startDate.setDate(startDate.getDate() - 6);
      if (selectedPeriod === 'mensuel') startDate.setMonth(startDate.getMonth() - 1);
      if (selectedPeriod === 'semestriel') startDate.setMonth(startDate.getMonth() - 6);
      if (selectedPeriod === 'annuel') startDate.setFullYear(startDate.getFullYear() - 1);
      return getOperationalRange(getLocalDateKey(startDate), closingKey);
    };
    const reportRange = getReportRange();
    let ordersForReport = orders;
    let transactionsForReport = cashTransactions;
    if (db) {
      try {
        const [ordersSnapshot, transactionsSnapshot] = await Promise.all([
          getDocs(query(
            collection(db, 'orders'),
            where('createdAt', '>=', reportRange.start.toISOString()),
            where('createdAt', '<=', reportRange.end.toISOString()),
            orderBy('createdAt', 'asc')
          )),
          getDocs(query(
            collection(db, 'cashTransactions'),
            where('createdAt', '>=', reportRange.start.toISOString()),
            where('createdAt', '<=', reportRange.end.toISOString()),
            orderBy('createdAt', 'asc')
          )),
        ]);
        ordersForReport = ordersSnapshot.docs.map((item) => {
          const data = item.data() as Order;
          return { ...data, id: data.id || item.id };
        });
        transactionsForReport = transactionsSnapshot.docs.map((item) => {
          const data = item.data() as CashTransaction;
          return { ...data, id: data.id || item.id };
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.LIST, 'orders/report-range');
        window.alert("Le rapport utilise les données déjà chargées à l'écran, car Firebase n'a pas répondu pour la période demandée. Réessayez si des journées semblent manquer.");
      }
    }
    const reportOrders = ordersForReport.filter(order =>
      isWithinDateRange(order.createdAt, reportRange.start, reportRange.end) &&
      order.paymentStatus === 'paid' &&
      order.orderType !== 'special_dinner'
    );
    const accounting = calculateSharedAccounting(reportOrders, accountingPrices, REPORT_OPERATIONAL_START);
    const averageOrder = reportOrders.length > 0 ? Math.round(accounting.staffPaid / reportOrders.length) : 0;
    const fullPricePortionsValue = accounting.fullPriceQuantity * accountingPrices.real;
    const totalPortions = accounting.subsidizedQuantity + accounting.fullPriceQuantity;
    const reportProfileLookup = new Map<string, UserProfile>(profileLookup);
    const normalizeReportBadge = (value: unknown) => String(value || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
    const normalizeReportEmail = (value: unknown) => String(value || '').trim().toLowerCase();
    const normalizeReportPhone = (value: unknown) => String(value || '').replace(/\D/g, '');
    const normalizeReportText = (value: unknown) => String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
    const addReportProfile = (id: string, data: Partial<UserProfile>) => {
      if (!id) return;
      reportProfileLookup.set(id, { ...data, id: data.id || id } as UserProfile);
    };
    if (db) {
      try {
        const fullUsersSnapshot = await getDocs(collection(db, 'users'));
        fullUsersSnapshot.forEach(item => addReportProfile(item.id, item.data() as Partial<UserProfile>));
      } catch (error) {
        console.warn('Annuaire complet du rapport non chargé', error);
      }
      const missingProfileIds = Array.from(new Set(
        reportOrders
          .map(order => String(order.employeeId || '').trim())
          .filter(employeeId => employeeId && !reportProfileLookup.has(employeeId))
      ));
      if (missingProfileIds.length > 0) {
        try {
          const missingProfileSnapshots = await Promise.all(
            missingProfileIds.map(employeeId => getDoc(doc(db, 'users', employeeId)).catch(() => null))
          );
          missingProfileSnapshots.forEach((snapshot) => {
            if (snapshot?.exists()) {
              const data = snapshot.data() as Partial<UserProfile>;
              reportProfileLookup.set(snapshot.id, { ...data, id: data.id || snapshot.id } as UserProfile);
            }
          });
        } catch (error) {
          console.warn('Profils complémentaires du rapport non chargés', error);
        }
      }
      const unresolvedOrders = reportOrders.filter((order) => {
        if (reportProfileLookup.has(order.employeeId)) return false;
        const profileValues = Array.from(reportProfileLookup.values());
        return !profileValues.some(profile =>
          (!!profile.badgeNumber && !!order.badgeNumber && normalizeReportBadge(profile.badgeNumber) === normalizeReportBadge(order.badgeNumber)) ||
          (!!profile.email && !!order.employeeEmail && normalizeReportEmail(profile.email) === normalizeReportEmail(order.employeeEmail)) ||
          (!!profile.phone && !!order.employeePhone && normalizeReportPhone(profile.phone) === normalizeReportPhone(order.employeePhone))
        );
      });
      const lookupValues = Array.from(new Set(unresolvedOrders.flatMap(order => [
        normalizeReportBadge(order.badgeNumber),
        normalizeReportEmail(order.employeeEmail),
        normalizeReportPhone(order.employeePhone),
      ]).filter(value => value && value.length >= 3)));
      if (lookupValues.length > 0) {
        try {
          const lookupSnapshots = await Promise.all(
            lookupValues.flatMap(value => [
              getDocs(query(collection(db, 'users'), where('badgeNumber', '==', value), limit(3))).catch(() => null),
              getDocs(query(collection(db, 'users'), where('email', '==', value), limit(3))).catch(() => null),
              getDocs(query(collection(db, 'users'), where('phone', '==', value), limit(3))).catch(() => null),
            ])
          );
          lookupSnapshots.forEach(snapshot => {
            snapshot?.forEach(item => addReportProfile(item.id, item.data() as Partial<UserProfile>));
          });
        } catch (error) {
          console.warn('Recherche complémentaire des profils du rapport non chargée', error);
        }
      }
    }
    const printHtmlDocument = (html: string) => {
      const existingPreview = document.getElementById('Ndamatou-print-preview');
      if (existingPreview) existingPreview.remove();
      const overlay = document.createElement('div');
      overlay.id = 'Ndamatou-print-preview';
      overlay.style.position = 'fixed';
      overlay.style.inset = '0';
      overlay.style.zIndex = '99999';
      overlay.style.background = 'rgba(15, 23, 42, 0.72)';
      overlay.style.display = 'flex';
      overlay.style.flexDirection = 'column';
      overlay.style.padding = '12px';
      overlay.style.boxSizing = 'border-box';

      const toolbar = document.createElement('div');
      toolbar.style.display = 'flex';
      toolbar.style.justifyContent = 'space-between';
      toolbar.style.alignItems = 'center';
      toolbar.style.gap = '12px';
      toolbar.style.background = '#0f172a';
      toolbar.style.color = 'white';
      toolbar.style.borderRadius = '14px 14px 0 0';
      toolbar.style.padding = '10px 12px';
      toolbar.style.fontFamily = 'Arial, sans-serif';

      const title = document.createElement('div');
      title.textContent = 'Aperçu du rapport avant impression';
      title.style.fontWeight = '800';
      title.style.fontSize = '14px';

      const actions = document.createElement('div');
      actions.style.display = 'flex';
      actions.style.gap = '8px';

      const printButton = document.createElement('button');
      printButton.type = 'button';
      printButton.textContent = 'Imprimer';
      printButton.style.border = '0';
      printButton.style.borderRadius = '10px';
      printButton.style.padding = '9px 14px';
      printButton.style.background = '#10b981';
      printButton.style.color = 'white';
      printButton.style.fontWeight = '800';
      printButton.style.cursor = 'pointer';

      const pdfButton = document.createElement('button');
      pdfButton.type = 'button';
      pdfButton.textContent = 'Enregistrer en PDF';
      pdfButton.style.border = '0';
      pdfButton.style.borderRadius = '10px';
      pdfButton.style.padding = '9px 14px';
      pdfButton.style.background = '#2563eb';
      pdfButton.style.color = 'white';
      pdfButton.style.fontWeight = '800';
      pdfButton.style.cursor = 'pointer';

      const closeButton = document.createElement('button');
      closeButton.type = 'button';
      closeButton.textContent = 'Fermer';
      closeButton.style.border = '1px solid rgba(255,255,255,0.35)';
      closeButton.style.borderRadius = '10px';
      closeButton.style.padding = '9px 14px';
      closeButton.style.background = 'transparent';
      closeButton.style.color = 'white';
      closeButton.style.fontWeight = '800';
      closeButton.style.cursor = 'pointer';

      const iframe = document.createElement('iframe');
      iframe.title = 'Aperçu impression rapport Ndamatou';
      iframe.style.width = '100%';
      iframe.style.height = 'calc(100vh - 72px)';
      iframe.style.border = '0';
      iframe.style.background = 'white';
      iframe.style.borderRadius = '0 0 14px 14px';

      actions.append(pdfButton, printButton, closeButton);
      toolbar.append(title, actions);
      overlay.append(toolbar, iframe);
      document.body.appendChild(overlay);

      iframe.srcdoc = html;

      closeButton.onclick = () => overlay.remove();
      printButton.onclick = () => {
        const target = iframe.contentWindow;
        if (!target) {
          overlay.remove();
          window.alert("Impossible d'ouvrir l'impression. Réessayez après actualisation de l'application.");
          return;
        }
        target.focus();
        target.print();
      };
      pdfButton.onclick = () => {
        const target = iframe.contentWindow;
        if (!target) {
          overlay.remove();
          window.alert("Impossible d'enregistrer le PDF. Réessayez après actualisation de l'application.");
          return;
        }
        window.alert("Dans la fenêtre qui va s'ouvrir, choisissez la destination « Enregistrer au format PDF » ou « Microsoft Print to PDF ».");
        target.focus();
        target.print();
      };

      iframe.onload = () => {
        const targetDocument = iframe.contentDocument;
        if (!targetDocument) {
          overlay.remove();
          window.alert("Impossible d'afficher l'aperçu. Réessayez après actualisation de l'application.");
        }
      };
      if (!iframe.contentWindow) {
        overlay.remove();
        window.alert("Impossible d'ouvrir l'impression. Réessayez après actualisation de l'application.");
      }
    };
    const getDayKeysInRange = () => {
      const first = new Date(reportRange.start);
      first.setHours(first.getHours() + 1);
      const currentKeyDate = new Date(`${getReportClosingDateKey(first)}T00:00:00`);
      const lastKeyDate = new Date(`${getReportClosingDateKey(reportRange.end)}T00:00:00`);
      const keys: string[] = [];
      while (currentKeyDate <= lastKeyDate) {
        keys.push(getLocalDateKey(currentKeyDate));
        currentKeyDate.setDate(currentKeyDate.getDate() + 1);
      }
      return keys;
    };
    const byDay = reportOrders.reduce((acc, order) => {
      const dayKey = getReportClosingDateKey(order.createdAt);
      if (!acc[dayKey]) {
        acc[dayKey] = { orders: [] as typeof reportOrders };
      }
      acc[dayKey].orders.push(order);
      return acc;
    }, {} as Record<string, { orders: typeof reportOrders }>);
    const dayRows = getDayKeysInRange()
      .map((dayKey) => {
        const group = byDay[dayKey] || { orders: [] as typeof reportOrders };
        const dayAccounting = calculateSharedAccounting(group.orders, accountingPrices, REPORT_OPERATIONAL_START);
        return `
      <tr>
        <td>${dayKey} <span class="muted">(19h00 → 18h59)</span></td>
        <td>${group.orders.length}</td>
        <td>${dayAccounting.subsidizedQuantity}</td>
        <td>${dayAccounting.fullPriceQuantity}</td>
        <td>${formatMoney(dayAccounting.staffPaid)}</td>
        <td>${formatMoney(dayAccounting.hospitalSupport)}</td>
        <td>${formatMoney(dayAccounting.staffPaid + dayAccounting.hospitalSupport)}</td>
      </tr>
    `;
      });
    const rows = dayRows.length > 0 ? `${dayRows.join('')}
      <tr class="total-row">
        <td>Total période</td>
        <td>${reportOrders.length}</td>
        <td>${accounting.subsidizedQuantity}</td>
        <td>${accounting.fullPriceQuantity}</td>
        <td>${formatMoney(accounting.staffPaid)}</td>
        <td>${formatMoney(accounting.hospitalSupport)}</td>
        <td>${formatMoney(accounting.staffPaid + accounting.hospitalSupport)}</td>
      </tr>
    ` : '<tr><td colspan="7">Aucune journée dans cette période.</td></tr>';
    const findReportProfile = (order: Order) => {
      const profileValues = Array.from(reportProfileLookup.values());
      const direct = reportProfileLookup.get(order.employeeId);
      if (direct) return direct;
      const byIdentifiers = profileValues.find(item =>
        (!!item.badgeNumber && !!order.badgeNumber && normalizeReportBadge(item.badgeNumber) === normalizeReportBadge(order.badgeNumber)) ||
        (!!item.email && !!order.employeeEmail && normalizeReportEmail(item.email) === normalizeReportEmail(order.employeeEmail)) ||
        (!!item.phone && !!order.employeePhone && normalizeReportPhone(item.phone) === normalizeReportPhone(order.employeePhone))
      );
      if (byIdentifiers) return byIdentifiers;
      const orderName = normalizeReportText(order.employeeName);
      const orderDepartment = normalizeReportText(order.department);
      const nameDepartmentMatches = profileValues.filter(item =>
        normalizeReportText(item.name) === orderName &&
        (!orderDepartment || normalizeReportText(item.department) === orderDepartment)
      );
      if (nameDepartmentMatches.length === 1) return nameDepartmentMatches[0];
      const nameMatches = profileValues.filter(item => normalizeReportText(item.name) === orderName);
      return nameMatches.length === 1 ? nameMatches[0] : undefined;
    };
    const getEmploymentReportGroup = (order: Order) => {
      const profile = findReportProfile(order);
      const rawType = String(profile?.employmentType || (order as Order & { employmentType?: string }).employmentType || '').trim().toLowerCase();
      if (rawType.includes('stagiaire') || rawType.includes('prestataire')) return 'Prestataire';
      return 'Titulaire';
    };
    const accountingEntries = calculateOrdersAccountingEntries(reportOrders, accountingPrices, REPORT_OPERATIONAL_START);
    const employmentGroupStats = accountingEntries.reduce((acc, entry) => {
      const order = entry.order;
      const group = getEmploymentReportGroup(order);
      if (!acc[group]) acc[group] = { orders: 0, subsidizedQuantity: 0, subsidyAmount: 0, amount: 0 };
      acc[group].orders += 1;
      acc[group].subsidizedQuantity += entry.accounting.subsidizedQuantity;
      acc[group].subsidyAmount += entry.accounting.hospitalSupport;
      acc[group].amount += entry.accounting.staffPaid + entry.accounting.hospitalSupport;
      return acc;
    }, {} as Record<string, { orders: number; subsidizedQuantity: number; subsidyAmount: number; amount: number }>);
    const employmentTotalOrders = Object.values(employmentGroupStats).reduce((sum, item) => sum + item.orders, 0);
    const employmentTotalSubsidized = Object.values(employmentGroupStats).reduce((sum, item) => sum + item.subsidizedQuantity, 0);
    const employmentTotalSubsidyAmount = Object.values(employmentGroupStats).reduce((sum, item) => sum + item.subsidyAmount, 0);
    const employmentTotalAmount = Object.values(employmentGroupStats).reduce((sum, item) => sum + item.amount, 0);
    const employmentBodyRows = ['Prestataire', 'Titulaire']
      .filter(group => employmentGroupStats[group])
      .map(group => `
        <tr>
          <td>${group}</td>
          <td>${employmentGroupStats[group].orders}</td>
          <td>${employmentGroupStats[group].subsidizedQuantity}</td>
          <td>${formatMoney(employmentGroupStats[group].subsidyAmount)}</td>
          <td>${formatMoney(employmentGroupStats[group].amount)}</td>
        </tr>
      `);
    const employmentRows = employmentBodyRows.length > 0 ? `${employmentBodyRows.join('')}
        <tr class="total-row">
          <td>Total période</td>
          <td>${employmentTotalOrders}</td>
          <td>${employmentTotalSubsidized}</td>
          <td>${formatMoney(employmentTotalSubsidyAmount)}</td>
          <td>${formatMoney(employmentTotalAmount)}</td>
        </tr>
      ` : '<tr><td colspan="5">Aucune donnée dans cette période.</td></tr>';
    const signatureBlocks = getRevenueReportSignatureOrder().map((signerId) => {
      const signer = revenueSignatureOptions.find(option => option.id === signerId) || revenueSignatureOptions[0];
      return `
            <div class="signature-box">
              <div>
                <div class="signature-title">${signer.title}</div>
                <div class="signature-name">${signer.name}</div>
              </div>
              <div class="signature-lines">
                <div class="signature-line">Signature</div>
                <div class="signature-line">Cachet</div>
              </div>
            </div>`;
    }).join('');

    printHtmlDocument(`
      <html>
        <head>
          <title>Rapport recettes ${selectedPeriod}</title>
          <style>
            body { font-family: Arial, sans-serif; color: #0f172a; padding: 28px; }
            header { border-bottom: 2px solid #10b981; padding-bottom: 14px; margin-bottom: 20px; }
            h1 { margin: 0; font-size: 22px; }
            .meta { color: #64748b; font-size: 12px; margin-top: 6px; }
            .cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 18px 0; }
            .card { border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px; }
            .label { color: #64748b; font-size: 11px; text-transform: uppercase; font-weight: 700; }
            .value { font-size: 20px; font-weight: 800; margin-top: 6px; }
            .hint { color: #64748b; font-size: 9px; line-height: 1.35; margin-top: 7px; }
            .muted { color: #64748b; font-size: 10px; }
            .note { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 12px; margin-top: 16px; font-size: 11px; color: #475569; line-height: 1.5; }
            table { width: 100%; border-collapse: collapse; margin-top: 18px; font-size: 12px; }
            th, td { border: 1px solid #e2e8f0; padding: 9px; text-align: left; }
            th { background: #f8fafc; text-transform: uppercase; font-size: 10px; color: #475569; }
            .total-row td { background: #ecfdf5; font-weight: 800; }
            .signatures { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; margin-top: 34px; page-break-inside: avoid; }
            .signature-box { border: 1px solid #cbd5e1; border-radius: 12px; min-height: 150px; padding: 14px; display: flex; flex-direction: column; justify-content: space-between; }
            .signature-title { font-size: 12px; font-weight: 800; text-transform: uppercase; color: #0f172a; }
            .signature-name { margin-top: 4px; font-size: 11px; color: #475569; }
            .signature-lines { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; align-items: end; }
            .signature-line { border-top: 1px solid #94a3b8; padding-top: 6px; font-size: 10px; font-weight: 700; color: #475569; text-align: center; min-height: 26px; }
            footer { margin-top: 24px; color: #64748b; font-size: 11px; }
          </style>
        </head>
        <body>
          <header>
            <h1>Rapport des recettes - Ndamatou</h1>
            <div class="meta">Période: ${selectedPeriod} | ${reportRange.start.toLocaleString('fr-FR')} → ${reportRange.end.toLocaleString('fr-FR')} | Généré le ${new Date().toLocaleString('fr-FR')}</div>
          </header>
          <section class="cards">
            <div class="card"><div class="label">Part supportée par l'agent</div><div class="value">${formatMoney(accounting.staffPaid)}</div><div class="hint">Somme réellement payée par les agents sur les commandes normales de la période.</div></div>
            <div class="card"><div class="label">Part hôpital</div><div class="value">${formatMoney(accounting.hospitalSupport)}</div><div class="hint">Subvention prise en charge par l'hôpital sur les portions subventionnées.</div></div>
            <div class="card"><div class="label">Total des ventes</div><div class="value">${formatMoney(accounting.staffPaid + accounting.hospitalSupport)}</div><div class="hint">Part agent + part hôpital, soit la valeur réelle des plats servis.</div></div>
            <div class="card"><div class="label">Portions subventionnées</div><div class="value">${accounting.subsidizedQuantity}</div><div class="hint">Nombre de portions bénéficiant de la subvention hôpital.</div></div>
            <div class="card"><div class="label">Portions au prix réel</div><div class="value">${accounting.fullPriceQuantity} / ${formatMoney(fullPricePortionsValue)}</div><div class="hint">Nombre de portions sans subvention et leur valeur au prix réel.</div></div>
            <div class="card"><div class="label">Commandes / portions</div><div class="value">${reportOrders.length} / ${totalPortions}</div><div class="hint">Commandes payées / total des portions servies dans la période.</div></div>
          </section>
          <div class="note">
            La part supportée par l'agent correspond à la part payée par les agents pour les commandes normales payées, y compris les commandes annulées ou expirées non remboursées, hors repas spéciaux.
            La part hôpital correspond à la subvention. Le total des ventes est la somme part agent + part hôpital.
            La moyenne par commande est ${formatMoney(averageOrder)}.
            Le bloc "Commandes / portions" affiche d'abord le nombre de commandes payées, puis le nombre total de plats/portions.
            Dans le tableau par type d'engagement, "Commandes" est le nombre de commandes payées, "Portions subventionnées" indique les portions ayant bénéficié de la subvention, "Montant subvention" reprend la part hôpital et "Montant" reprend le total des ventes de la catégorie.
            Les types d'engagement sont calculés selon l'engagement actuel renseigné par la DRH.
          </div>
          <table>
            <thead><tr><th>Journée opérationnelle</th><th>Commandes</th><th>Portions subventionnées</th><th>Portions prix réel</th><th>Part agent</th><th>Part hôpital</th><th>Total des ventes</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
          <table>
            <thead><tr><th>Type d'engagement</th><th>Commandes</th><th>Portions subventionnées</th><th>Montant subvention</th><th>Montant</th></tr></thead>
            <tbody>${employmentRows}</tbody>
          </table>
          <section class="signatures">${signatureBlocks}</section>
          <footer>Portail culinaire officiel du Centre Hospitalier de Ndamatou - Copyright SMSG 2026</footer>
        </body>
      </html>
    `);
  };

  const handlePrintTopupReport = async () => {
    const period = window.prompt('Rapport encaissement: journalier, hebdo, mensuel ou periode', 'journalier');
    if (!period) return;
    const normalizedPeriod = period.toLowerCase();
    const now = new Date();
    const closingKey = getReportClosingDateKey(now);
    const getRange = () => {
      if (normalizedPeriod === 'periode') {
        const startInput = window.prompt('Date de début (AAAA-MM-JJ)', getLocalDateKey(now));
        if (!startInput) return getOperationalRange(closingKey);
        const endInput = window.prompt('Date de fin (AAAA-MM-JJ)', startInput);
        return getOperationalRange(startInput, endInput || startInput);
      }
      if (normalizedPeriod === 'hebdo') {
        const start = new Date(`${closingKey}T00:00:00`);
        start.setDate(start.getDate() - 7);
        return getOperationalRange(getLocalDateKey(start), closingKey);
      }
      if (normalizedPeriod === 'mensuel') {
        const start = new Date(`${closingKey}T00:00:00`);
        start.setMonth(start.getMonth() - 1);
        return getOperationalRange(getLocalDateKey(start), closingKey);
      }
      return getOperationalRange(closingKey);
    };
    const range = getRange();
    let transactionsForReport = cashTransactions;
    if (db) {
      try {
        const snapshot = await getDocs(query(
          collection(db, 'cashTransactions'),
          where('createdAt', '>=', range.start.toISOString()),
          where('createdAt', '<=', range.end.toISOString()),
          orderBy('createdAt', 'asc')
        ));
        transactionsForReport = snapshot.docs.map((item) => {
          const data = item.data() as CashTransaction;
          return { ...data, id: data.id || item.id };
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.LIST, 'cashTransactions/topup-report-range');
        window.alert("Le rapport d'encaissement utilise les recharges déjà visibles à l'écran, car Firebase n'a pas répondu pour la période demandée. Réessayez avant paiement si des lignes semblent manquer.");
      }
    }
    const reportTransactions = transactionsForReport
      .filter(transaction => isWithinDateRange(transaction.createdAt, range.start, range.end))
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    const total = reportTransactions.reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0);
    const positiveTotal = reportTransactions.filter(transaction => Number(transaction.amount || 0) > 0).reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0);
    const correctionTotal = reportTransactions.filter(transaction => Number(transaction.amount || 0) < 0).reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0);
    const rows = reportTransactions.map(transaction => {
      const profile = profileLookup.get(transaction.employeeId);
      const amount = Number(transaction.amount || 0);
      return `
        <tr>
          <td>${new Date(transaction.createdAt).toLocaleString('fr-FR')}</td>
          <td>${transaction.employeeName}</td>
          <td>${transaction.badgeNumber}</td>
          <td>${profile?.phone || ''}</td>
          <td>${profile?.department || 'Service non renseigné'}</td>
          <td class="${amount < 0 ? 'negative' : ''}">${amount.toLocaleString('fr-FR')} FCFA</td>
          <td>${transaction.grossAmount !== undefined ? transaction.grossAmount.toLocaleString('fr-FR') + ' F' : 'Non détaillé'}</td>
          <td>${transaction.processorFeeCents !== undefined ? formatAccountingCents(transaction.processorFeeCents) : 'Non détaillé'}</td>
          <td>${transaction.netReceivedCents !== undefined ? formatAccountingCents(transaction.netReceivedCents) : 'Non détaillé'}</td>
          <td>${(profile?.walletBalance || 0).toLocaleString('fr-FR')} FCFA</td>
          <td>${transaction.cashierName || 'Restaurant Ndamatou'}</td>
          <td>${transaction.correctionOf ? 'Correction' : 'Recharge'}</td>
        </tr>
      `;
    }).join('') || '<tr><td colspan="12">Aucune recharge sur cette période.</td></tr>';
    const printWindow = window.open('', '_blank', 'width=1000,height=760');
    if (!printWindow) return;
    printWindow.document.write(`
      <html>
        <head>
          <title>Rapport encaissement badges</title>
          <style>
            body { font-family: Arial, sans-serif; color: #0f172a; padding: 28px; }
            h1 { margin: 0; font-size: 22px; }
            .meta { color: #64748b; font-size: 12px; margin-top: 6px; }
            .cards { display:grid; grid-template-columns: repeat(3, 1fr); gap:12px; margin:16px 0; }
            .card { border:1px solid #e2e8f0; border-radius:12px; padding:14px; }
            .label { color:#64748b; font-size:11px; font-weight:800; text-transform:uppercase; }
            .value { font-size:22px; font-weight:900; margin-top:4px; }
            .note { background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:12px; margin:14px 0; font-size:11px; color:#475569; line-height:1.5; }
            table { width:100%; border-collapse:collapse; font-size:11px; margin-top:14px; }
            th, td { border:1px solid #e2e8f0; padding:8px; text-align:left; }
            th { background:#f8fafc; text-transform:uppercase; font-size:10px; color:#475569; }
            .negative { color:#b91c1c; font-weight:900; }
            tfoot td { font-weight:900; background:#f8fafc; }
          </style>
        </head>
        <body>
          <h1>Rapport d'encaissement badges - Restaurant Ndamatou</h1>
          <div class="meta">Période: ${range.start.toLocaleString('fr-FR')} → ${range.end.toLocaleString('fr-FR')} | Généré le ${new Date().toLocaleString('fr-FR')}</div>
          <section class="cards">
            <div class="card"><div class="label">Crédits badge positifs</div><div class="value">${positiveTotal.toLocaleString('fr-FR')} FCFA</div></div>
            <div class="card"><div class="label">Corrections</div><div class="value">${correctionTotal.toLocaleString('fr-FR')} FCFA</div></div>
            <div class="card"><div class="label">Variation nette des crédits badge</div><div class="value">${total.toLocaleString('fr-FR')} FCFA</div></div>
          </section>
          <div class="note">Le crédit badge diffère du versement brut et du net après frais. Les colonnes mobiles détaillent la nouvelle formule ; les anciens reçus ne permettent pas de reconstituer les frais Bictorys. Les frais sont calculés à 2 %, avant rapprochement des arrondis réels. Une correction de badge n'est pas une preuve de remboursement externe. Pour le net dû au restaurant après retenue et la contribution hospitalière, utiliser le tableau « Partage des frais et reversements » et son export CSV.</div>
          <table>
            <thead><tr><th>Date</th><th>Agent</th><th>Badge</th><th>Téléphone</th><th>Service</th><th>Crédit badge</th><th>Versement brut mobile</th><th>Frais calculés 2 %</th><th>Net calculé</th><th>Solde actuel</th><th>Caissier</th><th>Type</th></tr></thead>
            <tbody>${rows}</tbody>
            <tfoot><tr><td colspan="5">VARIATION NETTE BADGES</td><td>${total.toLocaleString('fr-FR')} FCFA</td><td colspan="6"></td></tr></tfoot>
          </table>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
  };

  const formatFcfa = (amount: number) => `${Math.round(amount || 0).toLocaleString('fr-FR')} FCFA`;

  const getBlazeInvoiceTotal = (config = institutionDraft || institutionConfig) => {
    if (!config) return 0;
    return (
      Number(config.blazeFirestoreAmount || 0) +
      Number(config.blazeHostingAmount || 0) +
      Number(config.blazeAuthAmount || 0) +
      Number(config.blazeStorageAmount || 0) +
      Number(config.blazeOtherAmount || 0) +
      Number(config.blazeTaxesAmount || 0)
    );
  };

  const handlePrintBlazeInvoice = () => {
    const config = institutionDraft || institutionConfig;
    if (!config) return;

    const lines = [
      ['Firestore', Number(config.blazeFirestoreAmount || 0)],
      ['Firebase Hosting', Number(config.blazeHostingAmount || 0)],
      ['Authentication', Number(config.blazeAuthAmount || 0)],
      ['Storage', Number(config.blazeStorageAmount || 0)],
      ['Autres services Google Cloud / Firebase', Number(config.blazeOtherAmount || 0)],
      ['Taxes et ajustements', Number(config.blazeTaxesAmount || 0)],
    ];
    const total = getBlazeInvoiceTotal(config);
    const periodStart = config.blazeInvoicePeriodStart || 'Début non renseigné';
    const periodEnd = config.blazeInvoicePeriodEnd || 'Fin non renseignée';
    const printWindow = window.open('', '_blank', 'width=900,height=760');
    if (!printWindow) return;

    printWindow.document.write(`
      <html>
        <head>
          <title>Relevé interne Firebase Blaze</title>
          <style>
            body { font-family: Arial, sans-serif; color: #0f172a; padding: 30px; }
            header { display: flex; align-items: center; gap: 16px; border-bottom: 3px solid #10b981; padding-bottom: 16px; margin-bottom: 22px; }
            .logo { width: 72px; height: 72px; object-fit: contain; border: 1px solid #e2e8f0; border-radius: 14px; padding: 6px; }
            h1 { margin: 0; font-size: 22px; }
            .muted { color: #64748b; font-size: 12px; margin-top: 4px; }
            .cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin: 18px 0; }
            .card { border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px; background: #f8fafc; }
            .label { color: #64748b; font-size: 11px; text-transform: uppercase; font-weight: 800; }
            .value { font-size: 20px; font-weight: 900; margin-top: 7px; }
            table { width: 100%; border-collapse: collapse; margin-top: 18px; font-size: 13px; }
            th, td { border: 1px solid #e2e8f0; padding: 10px; text-align: left; }
            th { background: #ecfdf5; color: #065f46; text-transform: uppercase; font-size: 11px; }
            td.amount { text-align: right; font-weight: 800; }
            tfoot td { font-size: 15px; background: #f8fafc; }
            .note { margin-top: 18px; border-left: 4px solid #10b981; background: #f8fafc; padding: 12px; font-size: 12px; color: #475569; }
            .signatures { display: grid; grid-template-columns: repeat(2, 1fr); gap: 18px; margin-top: 34px; }
            .signature { border: 1px solid #cbd5e1; border-radius: 12px; min-height: 120px; padding: 14px; display: flex; flex-direction: column; justify-content: space-between; }
            .line { border-top: 1px solid #94a3b8; padding-top: 8px; text-align: center; font-size: 11px; color: #475569; font-weight: 700; }
            footer { margin-top: 24px; font-size: 11px; color: #64748b; }
          </style>
        </head>
        <body>
          <header>
            ${config.logoUrl ? `<img class="logo" src="${config.logoUrl}" />` : ''}
            <div>
              <h1>Relevé interne Firebase Blaze - Ndamatou</h1>
              <div class="muted">Document de suivi interne, établi à partir des montants saisis depuis la console Google/Firebase.</div>
            </div>
          </header>
          <section class="cards">
            <div class="card"><div class="label">Période début</div><div class="value">${periodStart}</div></div>
            <div class="card"><div class="label">Période fin</div><div class="value">${periodEnd}</div></div>
            <div class="card"><div class="label">Total à suivre</div><div class="value">${formatFcfa(total)}</div></div>
          </section>
          <table>
            <thead><tr><th>Rubrique</th><th>Montant saisi</th></tr></thead>
            <tbody>
              ${lines.map(([label, amount]) => `<tr><td>${label}</td><td class="amount">${formatFcfa(Number(amount))}</td></tr>`).join('')}
            </tbody>
            <tfoot><tr><td><strong>Total général</strong></td><td class="amount">${formatFcfa(total)}</td></tr></tfoot>
          </table>
          ${config.blazeNotes ? `<div class="note"><strong>Notes :</strong><br />${String(config.blazeNotes).replace(/\n/g, '<br />')}</div>` : ''}
          <section class="signatures">
            <div class="signature"><strong>Direction</strong><div class="line">${config.directorName || 'Nom à renseigner'}</div></div>
            <div class="signature"><strong>Service administratif et financier</strong><div class="line">${config.safName || 'Nom à renseigner'}</div></div>
          </section>
          <footer>Généré le ${new Date().toLocaleString('fr-FR')} - Portail restauration Ndamatou - SMSG 2026</footer>
          <script>window.onload = () => window.print();</script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const exportChartFigure = (
    container: HTMLDivElement | null,
    fileName: string,
    title: string,
    subtitle: string,
    legendItems: { label: string; value: string; color: string }[]
  ) => {
    const svg = container?.querySelector('svg');
    if (!svg) {
      addNotification('Export impossible', "La figure n'est pas encore prête. Réessayez après l'affichage complet du graphique.", 'warning');
      return;
    }

    const clonedSvg = svg.cloneNode(true) as SVGElement;
    const svgBox = svg.getBoundingClientRect();
    const chartWidth = Math.max(760, Math.ceil(svgBox.width || 760));
    const chartHeight = Math.max(320, Math.ceil(svgBox.height || 320));
    clonedSvg.setAttribute('width', String(chartWidth));
    clonedSvg.setAttribute('height', String(chartHeight));
    clonedSvg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

    const serializer = new XMLSerializer();
    const svgData = serializer.serializeToString(clonedSvg);
    const svgUrl = URL.createObjectURL(new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' }));
    const image = new Image();

    image.onload = () => {
      const legendHeight = Math.max(80, Math.ceil(legendItems.length / 2) * 28 + 34);
      const canvas = document.createElement('canvas');
      canvas.width = chartWidth + 80;
      canvas.height = chartHeight + legendHeight + 150;
      const context = canvas.getContext('2d');
      if (!context) {
        URL.revokeObjectURL(svgUrl);
        return;
      }

      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = '#0f172a';
      context.font = '700 24px Arial';
      context.fillText(title, 40, 44);
      context.fillStyle = '#64748b';
      context.font = '13px Arial';
      context.fillText(subtitle, 40, 68);
      context.fillText(`Exporté le ${new Date().toLocaleString('fr-FR')}`, 40, 90);
      context.drawImage(image, 40, 116, chartWidth, chartHeight);

      const legendTop = 132 + chartHeight;
      context.fillStyle = '#0f172a';
      context.font = '700 14px Arial';
      context.fillText('Légende', 40, legendTop);
      context.font = '12px Arial';
      legendItems.forEach((item, index) => {
        const column = index % 2;
        const row = Math.floor(index / 2);
        const x = 40 + column * Math.floor(canvas.width / 2);
        const y = legendTop + 28 + row * 28;
        context.fillStyle = item.color;
        context.fillRect(x, y - 10, 14, 14);
        context.fillStyle = '#334155';
        context.fillText(`${item.label}: ${item.value}`, x + 22, y + 1);
      });

      const link = document.createElement('a');
      link.download = `${fileName}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      URL.revokeObjectURL(svgUrl);
    };

    image.onerror = () => {
      URL.revokeObjectURL(svgUrl);
      addNotification('Export impossible', "Le navigateur n'a pas pu préparer l'image de la figure.", 'alert');
    };
    image.src = svgUrl;
  };

  // Calculate live summary stats from the same accounting rules used by the accountant reports.
  const calculateTodayStats = () => {
    const todayPaidOrders = orders.filter(order =>
      isWithinDateRange(order.createdAt, restaurantTodayRange.start, restaurantTodayRange.end) &&
      order.paymentStatus === 'paid'
    );
    const todayLifecycleOrders = orders.filter(order =>
      isWithinDateRange(order.createdAt, restaurantTodayRange.start, restaurantTodayRange.end) &&
      order.orderType !== 'special_dinner'
    );
    const regularOrders = todayPaidOrders.filter(order => order.orderType !== 'special_dinner');
    const deliveredOrders = regularOrders.filter(order => order.status === 'delivered');
    const ordersToDeliver = regularOrders.filter(order =>
      order.fulfillmentMode === 'delivery' && !['delivered', 'returned', 'cancelled', 'expired'].includes(order.status)
    );
    const accounting = calculateSharedAccounting(regularOrders, accountingPrices, REPORT_OPERATIONAL_START);
    const todayTransactions = cashTransactions.filter(transaction =>
      isWithinDateRange(transaction.createdAt, restaurantTodayRange.start, restaurantTodayRange.end)
    );
    const cashRevenue = todayTransactions.reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0);
    const totalBadgeBalance = employeeProfiles.reduce((sum, profile) => sum + Math.max(0, Number(profile.walletBalance || 0)), 0);
    const lifetimeTopups = cashTransactions.reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0);
    const lifetimePaidOrders = orders.filter(order =>
      order.paymentStatus === 'paid' &&
      order.orderType !== 'special_dinner'
    );
    const lifetimeAccounting = calculateSharedAccounting(lifetimePaidOrders, accountingPrices, REPORT_OPERATIONAL_START);
    const lifetimeRestaurantRevenue = lifetimeAccounting.staffPaid;
    const lifetimeRealSales = lifetimeAccounting.staffPaid + lifetimeAccounting.hospitalSupport;
    const badgeLiquidity = lifetimeTopups - lifetimeRestaurantRevenue;
    const remainingHotMeals = meals.filter(meal =>
      meal.category === 'plat' &&
      meal.isAvailableToday &&
      !meal.isNextDay &&
      (meal.mealType || 'regular') === 'regular'
    );
    const remainingHotStock = remainingHotMeals.reduce((sum, meal) => sum + Math.max(0, meal.stock), 0);
    const lifecycle = calculateOrderLifecycleMetrics(todayLifecycleOrders);
    const average = regularOrders.length > 0 ? Math.round(accounting.staffPaid / regularOrders.length) : 0;
    const orderRateSlots = [
      {
        id: 'slot1',
        label: `${formatTimeLabel(institutionConfig?.orderRateSlot1Start || '19:00')} - ${formatTimeLabel(institutionConfig?.orderRateSlot1End || '08:00')}`,
        start: institutionConfig?.orderRateSlot1Start || '19:00',
        end: institutionConfig?.orderRateSlot1End || '08:00',
      },
      {
        id: 'slot2',
        label: `${formatTimeLabel(institutionConfig?.orderRateSlot2Start || '08:00')} - ${formatTimeLabel(institutionConfig?.orderRateSlot2End || '13:00')}`,
        start: institutionConfig?.orderRateSlot2Start || '08:00',
        end: institutionConfig?.orderRateSlot2End || '13:00',
      },
      {
        id: 'slot3',
        label: `${formatTimeLabel(institutionConfig?.orderRateSlot3Start || '13:00')} - ${formatTimeLabel(institutionConfig?.orderRateSlot3End || '18:00')}`,
        start: institutionConfig?.orderRateSlot3Start || '13:00',
        end: institutionConfig?.orderRateSlot3End || '18:00',
      },
    ].map(slot => {
      const slotOrders = regularOrders.filter(order => isDateInTimeSlot(order.createdAt, slot.start, slot.end));
      const slotQuantity = slotOrders.reduce(
        (sum, order) => sum + order.items.reduce((itemSum, item) => itemSum + Number(item.quantity || 0), 0),
        0
      );
      const rate = regularOrders.length > 0 ? Math.round((slotOrders.length / regularOrders.length) * 100) : 0;
      return {
        ...slot,
        orders: slotOrders.length,
        quantity: slotQuantity,
        rate,
      };
    });

    return {
      regularOrders,
      accounting,
      restaurantRevenue: accounting.staffPaid,
      hospitalSupport: accounting.hospitalSupport,
      realAmount: accounting.staffPaid + accounting.hospitalSupport,
      cashRevenue,
      totalBadgeBalance,
      lifetimeTopups,
      lifetimeRestaurantRevenue,
      lifetimeRealSales,
      badgeLiquidity,
      deliveredOrders,
      ordersToDeliver,
      remainingHotMeals,
      remainingHotStock,
      lifecycle,
      average,
      orderRateSlots,
    };
  };

  const currentStats = calculateTodayStats();
  const analyticsPeriodLabel = `Période restaurant: ${restaurantPeriodLabel}`;
  const getOrderQuantity = (order: Order) => order.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const getRestaurantVisitTime = (order: Order) => {
    if (order.deliveryTime) return order.deliveryTime;
    const deliveredStep = [...(order.steps || [])].reverse().find(step => step.status === 'delivered');
    return deliveredStep?.timestamp || '';
  };
  const paidRegularOrders = orders.filter(order =>
    order.paymentStatus === 'paid' &&
    order.orderType !== 'special_dinner'
  );
  const getHourlyAnalysisRange = () => {
    const start = new Date(`${hourlyAnalysisStartDate || getLocalDateKey()}T00:00:00`);
    const end = new Date(`${hourlyAnalysisEndDate || hourlyAnalysisStartDate || getLocalDateKey()}T23:59:59.999`);
    return start <= end ? { start, end } : { start: end, end: start };
  };
  const getHourlyAnalysisRows = () => {
    const range = getHourlyAnalysisRange();
    const rangeOrders = paidRegularOrders.filter(order => isWithinDateRange(order.createdAt, range.start, range.end));
    return [
      {
        label: `${formatTimeLabel(institutionConfig?.orderRateSlot1Start || '19:00')} - ${formatTimeLabel(institutionConfig?.orderRateSlot1End || '08:00')}`,
        start: institutionConfig?.orderRateSlot1Start || '19:00',
        end: institutionConfig?.orderRateSlot1End || '08:00',
      },
      {
        label: `${formatTimeLabel(institutionConfig?.orderRateSlot2Start || '08:00')} - ${formatTimeLabel(institutionConfig?.orderRateSlot2End || '13:00')}`,
        start: institutionConfig?.orderRateSlot2Start || '08:00',
        end: institutionConfig?.orderRateSlot2End || '13:00',
      },
      {
        label: `${formatTimeLabel(institutionConfig?.orderRateSlot3Start || '13:00')} - ${formatTimeLabel(institutionConfig?.orderRateSlot3End || '18:00')}`,
        start: institutionConfig?.orderRateSlot3Start || '13:00',
        end: institutionConfig?.orderRateSlot3End || '18:00',
      },
    ].map(slot => {
      const slotOrders = rangeOrders.filter(order => isDateInTimeSlot(order.createdAt, slot.start, slot.end));
      const slotQuantity = slotOrders.reduce((sum, order) => sum + getOrderQuantity(order), 0);
      const slotAccounting = calculateSharedAccounting(slotOrders, accountingPrices, REPORT_OPERATIONAL_START);
      return {
        ...slot,
        orders: slotOrders.length,
        quantity: slotQuantity,
        rate: rangeOrders.length > 0 ? Math.round((slotOrders.length / rangeOrders.length) * 100) : 0,
        amount: slotAccounting.staffPaid + slotAccounting.hospitalSupport,
      };
    });
  };
  const hourlyAnalysisRange = showHourlyAnalysis ? getHourlyAnalysisRange() : null;
  const hourlyAnalysisRows = showHourlyAnalysis ? getHourlyAnalysisRows() : [];
  const hourlyAnalysisTotals = hourlyAnalysisRows.reduce((totals, row) => ({
    orders: totals.orders + row.orders,
    quantity: totals.quantity + row.quantity,
    amount: totals.amount + row.amount,
  }), { orders: 0, quantity: 0, amount: 0 });
  const restaurantVisitOrders = paidRegularOrders.filter(order => {
    const visitTime = getRestaurantVisitTime(order);
    return order.status === 'delivered' &&
      Boolean(visitTime) &&
      hourlyAnalysisRange &&
      isWithinDateRange(visitTime, hourlyAnalysisRange.start, hourlyAnalysisRange.end) &&
      (
        order.fulfillmentMode !== 'delivery' ||
        order.deliveredVia === 'restaurant' ||
        order.deliveredVia === 'scan agent'
      );
  });
  const restaurantAffluenceRows = [
    {
      label: `${formatTimeLabel(institutionConfig?.restaurantAffluenceSlot1Start || '12:00')} - ${formatTimeLabel(institutionConfig?.restaurantAffluenceSlot1End || '15:00')}`,
      start: institutionConfig?.restaurantAffluenceSlot1Start || '12:00',
      end: institutionConfig?.restaurantAffluenceSlot1End || '15:00',
    },
    {
      label: `${formatTimeLabel(institutionConfig?.restaurantAffluenceSlot2Start || '15:00')} - ${formatTimeLabel(institutionConfig?.restaurantAffluenceSlot2End || '18:00')}`,
      start: institutionConfig?.restaurantAffluenceSlot2Start || '15:00',
      end: institutionConfig?.restaurantAffluenceSlot2End || '18:00',
    },
  ].map(slot => {
    const slotOrders = restaurantVisitOrders.filter(order => isDateInTimeSlot(getRestaurantVisitTime(order), slot.start, slot.end));
    const slotQuantity = slotOrders.reduce((sum, order) => sum + getOrderQuantity(order), 0);
    return {
      ...slot,
      visits: slotOrders.length,
      quantity: slotQuantity,
      rate: restaurantVisitOrders.length > 0 ? Math.round((slotOrders.length / restaurantVisitOrders.length) * 100) : 0,
    };
  });
  const restaurantAffluenceTotals = restaurantAffluenceRows.reduce((totals, row) => ({
    visits: totals.visits + row.visits,
    quantity: totals.quantity + row.quantity,
  }), { visits: 0, quantity: 0 });
  const printHourlyAnalysis = () => {
    const rows = hourlyAnalysisRows.map(row => `
      <tr>
        <td>${row.label}</td>
        <td>${row.orders}</td>
        <td>${row.quantity}</td>
        <td>${row.rate}%</td>
        <td>${formatMoney(row.amount)}</td>
      </tr>
    `).join('');
    const affluenceRows = restaurantAffluenceRows.map(row => `
      <tr>
        <td>${row.label}</td>
        <td>${row.visits}</td>
        <td>${row.quantity}</td>
        <td>${row.rate}%</td>
      </tr>
    `).join('');
    const printWindow = window.open('', '_blank', 'width=900,height=720');
    if (!printWindow) return;
    printWindow.document.write(`
      <html>
        <head>
          <title>Analyse horaire des commandes</title>
          <style>
            body { font-family: Arial, sans-serif; color: #0f172a; padding: 28px; }
            h1 { margin: 0; font-size: 22px; }
            .meta { color: #64748b; font-size: 12px; margin: 8px 0 18px; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; }
            th, td { border: 1px solid #cbd5e1; padding: 9px; text-align: left; }
            th { background: #f8fafc; text-transform: uppercase; font-size: 10px; color: #475569; }
            .total td { background: #ecfdf5; font-weight: 900; }
            .note { margin-top: 16px; border: 1px solid #bfdbfe; background: #eff6ff; color: #1e3a8a; padding: 12px; border-radius: 12px; font-size: 11px; line-height: 1.5; }
          </style>
        </head>
        <body>
          <h1>Analyse horaire des commandes - Ndamatou</h1>
          <div class="meta">Période: ${(hourlyAnalysisRange || getHourlyAnalysisRange()).start.toLocaleDateString('fr-FR')} → ${(hourlyAnalysisRange || getHourlyAnalysisRange()).end.toLocaleDateString('fr-FR')} | Généré le ${new Date().toLocaleString('fr-FR')}</div>
          <table>
            <thead><tr><th>Créneau</th><th>Commandes</th><th>Portions</th><th>Taux</th><th>Total des ventes</th></tr></thead>
            <tbody>
              ${rows}
              <tr class="total"><td>Total période</td><td>${hourlyAnalysisTotals.orders}</td><td>${hourlyAnalysisTotals.quantity}</td><td>${hourlyAnalysisTotals.orders > 0 ? '100%' : '0%'}</td><td>${formatMoney(hourlyAnalysisTotals.amount)}</td></tr>
            </tbody>
          </table>
          <h2>Affluence au restaurant</h2>
          <table>
            <thead><tr><th>Créneau</th><th>Agents passés au restaurant</th><th>Portions remises</th><th>Fréquence</th></tr></thead>
            <tbody>
              ${affluenceRows}
              <tr class="total"><td>Total créneaux d'affluence</td><td>${restaurantAffluenceTotals.visits}</td><td>${restaurantAffluenceTotals.quantity}</td><td>${restaurantAffluenceTotals.visits > 0 ? '100%' : '0%'}</td></tr>
            </tbody>
          </table>
          <div class="note">Cette analyse est séparée du rapport financier. La première table mesure l'heure de commande. La table "Affluence au restaurant" mesure l'heure de remise/scan des agents venus au restaurant selon les créneaux administrés dans les paramètres.</div>
          <script>window.onload = () => window.print();</script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };
  const groupOrdersByOperationalDay = (sourceOrders: Order[]) => sourceOrders.reduce((acc, order) => {
    const dayKey = getReportClosingDateKey(order.createdAt);
    if (!acc[dayKey]) acc[dayKey] = [];
    acc[dayKey].push(order);
    return acc;
  }, {} as Record<string, Order[]>);
  const dayGroups = groupOrdersByOperationalDay(paidRegularOrders);
  const dailyAnalyticsData = Object.entries(dayGroups)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-14)
    .map(([date, dayOrders]) => {
      const dayAccounting = calculateSharedAccounting(dayOrders, accountingPrices, REPORT_OPERATIONAL_START);
      const quantity = dayOrders.reduce((sum, order) => sum + getOrderQuantity(order), 0);
      const delivered = dayOrders.filter(order => order.status === 'delivered').length;
      const notRetrieved = dayOrders.filter(order => ['expired', 'returned'].includes(order.status)).length;
      return {
        date,
        ordersCount: dayOrders.length,
        delivered,
        notRetrieved,
        quantity,
        revenue: dayAccounting.staffPaid,
        realAmount: dayAccounting.staffPaid + dayAccounting.hospitalSupport,
        averageCart: dayOrders.length > 0 ? Math.round(dayAccounting.staffPaid / dayOrders.length) : 0,
        withdrawalRate: dayOrders.length > 0 ? Math.round((delivered / dayOrders.length) * 100) : 0,
      };
    });
  const todayMenuSalesMap = currentStats.regularOrders.reduce((acc, order) => {
    order.items.forEach(item => {
      const key = item.meal?.name || 'Repas';
      acc[key] = (acc[key] || 0) + Number(item.quantity || 0);
    });
    return acc;
  }, {} as Record<string, number>);
  const menuSalesData = Object.entries(todayMenuSalesMap)
    .map(([name, value], index) => ({
      name,
      value,
      color: ['#10b981', '#3b82f6', '#ef4444', '#f59e0b', '#8b5cf6', '#14b8a6'][index % 6],
    }))
    .sort((a, b) => b.value - a.value);
  const departmentOrderData = Object.entries(currentStats.regularOrders.reduce((acc, order) => {
    const key = order.department || 'Service non renseigné';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {} as Record<string, number>))
    .map(([name, orders], index) => ({
      name,
      orders,
      color: ['#10b981', '#3b82f6', '#f97316', '#8b5cf6', '#06b6d4', '#ef4444'][index % 6],
    }))
    .sort((a, b) => b.orders - a.orders)
    .slice(0, 12);
  const dailyRevenueTotal = dailyAnalyticsData.reduce((sum, day) => sum + day.revenue, 0);
  const revenueLegendItems = [
    { label: 'Recettes cumulées', value: formatFcfa(dailyRevenueTotal), color: '#10b981' },
  ];
  const departmentLegendItems = departmentOrderData.map((entry) => ({
    label: entry.name,
    value: `${entry.orders} commande(s)`,
    color: entry.color,
  }));
  const categoryLegendItems = menuSalesData.map((entry) => ({
    label: entry.name,
    value: `${entry.value} portion(s)`,
    color: entry.color,
  }));
  const todayDateKey = new Date().toISOString().slice(0, 10);
  const todayRestaurantQrPayload = getDailyRestaurantCode(new Date());
  const todayRestaurantQrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=420x420&data=${encodeURIComponent(todayRestaurantQrPayload)}`;
  const todayRestaurantExitQrPayload = getDailyRestaurantExitCode(new Date());
  const todayRestaurantExitQrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=420x420&data=${encodeURIComponent(todayRestaurantExitQrPayload)}`;

  const handlePrintDailyRestaurantQr = () => {
    const printWindow = window.open('', '_blank', 'width=820,height=900');
    if (!printWindow) return;
    printWindow.document.write(`
      <html>
        <head>
          <title>QR restaurant du jour ${todayDateKey}</title>
          <style>
            body { font-family: Arial, sans-serif; color: #0f172a; padding: 28px; text-align: center; }
            .sheet { border: 2px solid #0f172a; border-radius: 24px; padding: 28px; max-width: 680px; margin: 0 auto; }
            h1 { margin: 0; font-size: 28px; text-transform: uppercase; }
            .date { margin-top: 8px; font-size: 16px; font-weight: 800; color: #047857; }
            img { width: 420px; height: 420px; margin: 24px auto; display: block; border: 1px solid #cbd5e1; border-radius: 18px; padding: 16px; }
            .code { font-family: Consolas, monospace; font-size: 22px; font-weight: 900; background: #f1f5f9; padding: 12px; border-radius: 12px; }
            .help { margin-top: 18px; color: #475569; font-size: 14px; line-height: 1.5; }
          </style>
        </head>
        <body>
          <div class="sheet">
            <h1>QR Restaurant Ndamatou</h1>
            <div class="date">Code du jour : ${new Date().toLocaleDateString('fr-FR')}</div>
            <img src="${todayRestaurantQrUrl}" />
            <div class="code">${todayRestaurantQrPayload}</div>
            <p class="help">Le personnel scanne ce QR avec son téléphone. Si la caméra ne lit pas, il saisit le code court affiché dessous.</p>
          </div>
          <script>window.onload = () => window.print();</script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handlePrintRestaurantExitQr = () => {
    const printWindow = window.open('', '_blank', 'width=820,height=900');
    if (!printWindow) return;
    printWindow.document.write(`
      <html>
        <head>
          <title>QR sortie restaurant</title>
          <style>
            body { font-family: Arial, sans-serif; color: #0f172a; padding: 28px; text-align: center; }
            .sheet { border: 2px solid #1d4ed8; border-radius: 24px; padding: 28px; max-width: 680px; margin: 0 auto; }
            h1 { margin: 0; font-size: 28px; text-transform: uppercase; color: #1d4ed8; }
            img { width: 420px; height: 420px; margin: 24px auto; display: block; border: 1px solid #cbd5e1; border-radius: 18px; padding: 16px; }
            .code { font-family: Consolas, monospace; font-size: 28px; font-weight: 900; background: #eff6ff; padding: 14px; border-radius: 12px; color: #1d4ed8; }
            .help { margin-top: 18px; color: #475569; font-size: 14px; line-height: 1.5; }
          </style>
        </head>
        <body>
          <div class="sheet">
            <h1>QR Sortie Restaurant</h1>
            <img src="${todayRestaurantExitQrUrl}" />
            <div class="code">${todayRestaurantExitQrPayload}</div>
            <p class="help">À scanner en quittant le restaurant pour libérer une place. Si la caméra ne lit pas, saisir le code simple SORTIE.</p>
          </div>
          <script>window.onload = () => window.print();</script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const normalizeBadgeScan = (value: string) => {
    const rawValue = value.trim();
    if (!rawValue) return '';

    try {
      const parsedPayload = JSON.parse(rawValue) as {
        badge?: string;
        badgeNumber?: string;
        code?: string;
        id?: string;
        phone?: string;
        telephone?: string;
        employeePhone?: string;
      };
      const badgeFromPayload =
        parsedPayload.badge ||
        parsedPayload.badgeNumber ||
        parsedPayload.code ||
        parsedPayload.id ||
        parsedPayload.phone ||
        parsedPayload.telephone ||
        parsedPayload.employeePhone;
      if (badgeFromPayload) return String(badgeFromPayload).trim().toUpperCase();
    } catch {
      // Some badges encode a simple text value instead of JSON.
    }

    const explicitPhone = rawValue.match(/(?:phone|telephone|t[ée]l[ée]phone|employeePhone)\s*[:=]\s*["']?([+0-9\s().-]{7,})/i)?.[1];
    if (explicitPhone) return explicitPhone.trim().toUpperCase();

    const explicitBadge = rawValue.match(/(?:badge|badgeNumber|code|id)\s*[:=]\s*["']?([A-Z]{1,4}[-\s]?\d{4}[-\s]?[A-Z0-9]{3,12})/i)?.[1];
    if (explicitBadge) return explicitBadge.trim().toUpperCase();

    try {
      const parsedUrl = new URL(rawValue);
      const badgeFromUrl =
        parsedUrl.searchParams.get('badge') ||
        parsedUrl.searchParams.get('badgeNumber') ||
        parsedUrl.searchParams.get('code') ||
        parsedUrl.searchParams.get('id');
      if (badgeFromUrl) return badgeFromUrl.trim().toUpperCase();
    } catch {
      // Scanner hardware usually sends plain text, not a URL.
    }

    return rawValue.split(/\s+/).pop()?.trim().toUpperCase() || '';
  };

  const getPhoneScanCandidates = (value: string) => {
    const raw = String(value || '');
    const directDigits = raw.replace(/\D/g, '');
    const digitMap: Record<string, string[]> = {
      '&': ['1'],
      ' ': ['', '1'],
      'É': ['2', '7'],
      'é': ['2', '7'],
      '"': ['3'],
      "'": ['4'],
      '(': ['5', '6'],
      '-': ['6'],
      'È': ['7'],
      'è': ['7'],
      '_': ['8'],
      'Ç': ['9'],
      'ç': ['9'],
      'À': ['0'],
      'à': ['0'],
    };
    let candidates = [''];
    raw.split('').forEach((char) => {
      const replacements = /\d/.test(char) ? [char] : (digitMap[char] || ['']);
      candidates = candidates
        .flatMap(candidate => replacements.map(replacement => `${candidate}${replacement}`))
        .slice(0, 64);
    });
    return Array.from(new Set([directDigits, ...candidates].map(candidate => candidate.replace(/\D/g, '')).filter(Boolean)));
  };
  const scannedBadge = normalizeBadgeScan(lastScannedBadge || badgeScanInput);
  const compactPhone = (value: string) => getPhoneScanCandidates(value)[0] || '';
  const isSamePhone = (value: string, expectedPhone: string) => {
    const leftCandidates = getPhoneScanCandidates(value);
    const right = compactPhone(expectedPhone);
    return Boolean(right && leftCandidates.some(left => left === right || left.endsWith(right) || right.endsWith(left)));
  };
  const isSameBadge = (value: string, expectedBadge: string) => {
    const normalizedValue = value.toUpperCase();
    const normalizedExpected = expectedBadge.toUpperCase();
    return (
      normalizedValue === normalizedExpected ||
      normalizedValue.replace(/[^A-Z0-9]/g, '') === normalizedExpected.replace(/[^A-Z0-9]/g, '')
    );
  };
  const matchesScannedProfile = (profile: UserProfile, scannedValue: string) =>
    isSameBadge(profile.badgeNumber, scannedValue) ||
    isSamePhone(scannedValue, profile.phone);
  const matchesScannedOrderIdentity = (order: Order, scannedValue: string) =>
    isSameBadge(order.badgeNumber, scannedValue) ||
    isSamePhone(scannedValue, order.employeePhone);
  const buildProfileFromOrder = (order: Order): UserProfile => ({
    id: order.employeeId,
    name: order.employeeName,
    email: order.employeeEmail || '',
    phone: order.employeePhone || '',
    badgeNumber: order.badgeNumber,
    department: order.department || '',
    building: order.building || '',
    floor: order.floor || '',
    room: order.room || '',
    walletBalance: 0,
    role: 'employee',
    status: 'active',
    badgeBlocked: false,
  });
  const isRestaurantScannableOrder = (order: Order, profile: UserProfile) =>
    (
      order.employeeId === profile.id ||
      isSameBadge(order.badgeNumber, profile.badgeNumber) ||
      isSamePhone(order.employeePhone, profile.phone)
    ) &&
    isWithinDateRange(order.createdAt, restaurantTodayRange.start, restaurantTodayRange.end) &&
    order.paymentStatus === 'paid' &&
    ['pending', 'preparing', 'delivering'].includes(order.status) &&
    order.orderType !== 'special_dinner';
  const scannedProfile = scannedBadge
    ? employeeProfiles.find(profile => matchesScannedProfile(profile, scannedBadge)) ||
      (() => {
        const orderMatch = activeOrders.find(order => matchesScannedOrderIdentity(order, scannedBadge));
        return orderMatch ? buildProfileFromOrder(orderMatch) : undefined;
      })()
    : undefined;
  const scannedOrders = scannedProfile
    ? orders.filter(order => isRestaurantScannableOrder(order, scannedProfile))
    : [];
  const canUseLastScanSummary = Boolean(
    scannedBadge &&
    lastRestaurantScanSummary &&
    lastRestaurantScanSummary.badge === scannedBadge
  );
  const displayedScannedProfile = canUseLastScanSummary ? lastRestaurantScanSummary!.profile : scannedProfile;
  const displayedScannedOrders = canUseLastScanSummary ? lastRestaurantScanSummary!.orders : scannedOrders;
  const scanWasAutoDelivered = canUseLastScanSummary && lastRestaurantScanSummary!.status === 'delivered';
  const displayedScannedItems = displayedScannedOrders.flatMap(order => order.items);
  const displayedScannedTotal = displayedScannedOrders.reduce((sum, order) => sum + Number(order.total || 0), 0);
  const hasScannedMealAuthorization = displayedScannedOrders.length > 0;

  const buildRestaurantTicketHtml = (order: Order, profile?: UserProfile) => {
    const width = Number(institutionConfig?.restaurantTicketWidthMm || 80);
    return `
      <html>
        <head>
          <style>
            @page { size: ${width}mm auto; margin: 0; }
            body { font-family: Arial, sans-serif; width: ${width}mm; margin: 0; padding: 3mm; color: #111827; }
            .center { text-align: center; }
            .title { font-weight: 900; font-size: 14px; }
            .muted { font-size: 10px; color: #4b5563; }
            .line { border-top: 1px dashed #111827; margin: 8px 0; }
            .row { display: flex; justify-content: space-between; gap: 8px; font-size: 11px; margin: 3px 0; }
            .item { font-size: 12px; font-weight: 800; margin: 4px 0; }
            .big { font-size: 16px; font-weight: 900; }
          </style>
        </head>
        <body>
          <div class="center">
            <div class="title">RESTAURANT Ndamatou</div>
            <div class="muted">Ticket de retrait repas</div>
          </div>
          <div class="line"></div>
          <div class="row"><span>Ticket</span><strong>${order.id}</strong></div>
          <div class="row"><span>Date</span><strong>${new Date().toLocaleString('fr-FR')}</strong></div>
          <div class="row"><span>Badge</span><strong>${order.badgeNumber}</strong></div>
          <div class="row"><span>Service</span><strong>${order.department || profile?.department || 'Non renseigné'}</strong></div>
          <div class="line"></div>
          <div><strong>${order.employeeName}</strong></div>
          <div class="muted">${order.employeePhone || profile?.phone || ''}</div>
          <div class="line"></div>
          ${order.items.map(item => `<div class="item">${item.meal.name} x${item.quantity}</div>`).join('')}
          <div class="line"></div>
          <div class="row big"><span>Total</span><span>${order.total.toLocaleString('fr-FR')} F</span></div>
          <div class="center muted">Bon appétit</div>
        </body>
      </html>
    `;
  };

  const printRestaurantTicket = async (order: Order, profile?: UserProfile) => {
    const html = buildRestaurantTicketHtml(order, profile);
    try {
      await printHtmlWithQz(html, {
        printerName: institutionConfig?.restaurantQzPrinterName,
        widthMm: Number(institutionConfig?.restaurantTicketWidthMm || 80),
        certificateUrl: institutionConfig?.restaurantQzCertificateUrl,
        signatureUrl: institutionConfig?.restaurantQzSignatureUrl,
      });
      addNotification('Ticket imprimé', `Ticket ${order.id} envoyé à l’imprimante.`, 'success');
    } catch (error) {
      console.error(error);
      const printWindow = window.open('', '_blank', 'width=420,height=680');
      if (printWindow) {
        printWindow.document.write(html.replace('</body>', '<script>window.onload = () => window.print();</script></body>'));
        printWindow.document.close();
        addNotification('Aperçu impression ouvert', 'QZ Tray est indisponible, impression via le navigateur.', 'warning');
      } else {
        addNotification('Impression impossible', 'QZ Tray et la fenêtre d’impression sont indisponibles.', 'alert');
      }
    }
  };

  const handleTestPrinter = async () => {
    const fallbackMeal: Meal = {
      id: 'test-meal',
      name: 'Ticket test',
      description: '',
      category: 'plat',
      price: 0,
      stock: 0,
      maxStock: 0,
      image: 'Plat',
      isNextDay: false,
      isAvailableToday: true,
      calories: 0,
      allergens: [],
    };
    const testOrder: Order = {
      id: 'TEST-IMPRIMANTE',
      employeeId: 'test',
      employeeName: 'Test restaurant Ndamatou',
      employeeEmail: '',
      employeePhone: '',
      badgeNumber: 'TEST',
      department: 'Restaurant',
      building: '',
      floor: '',
      room: '',
      items: [{ meal: fallbackMeal, quantity: 1 }],
      total: 0,
      status: 'pending',
      paymentMethod: 'badge_card',
      paymentStatus: 'paid',
      createdAt: new Date().toISOString(),
      steps: [],
    };
    await printRestaurantTicket(testOrder);
  };

  const startHardwareScan = () => {
    setScanReady(true);
    setBadgeScanInput('');
    window.setTimeout(() => {
      badgeScanInputRef.current?.focus();
      badgeScanInputRef.current?.select();
    }, 50);
  };

  const processRestaurantBadgeScan = async (rawValue: string) => {
    const nextBadge = normalizeBadgeScan(rawValue);
    if (!nextBadge) {
      addNotification('Scan vide', 'Aucun code badge lisible. Recommencez le scan ou saisissez le code manuellement.', 'warning');
      return;
    }

    setLastScannedBadge(nextBadge);
    setBadgeScanInput('');
    setScanReady(true);
    window.setTimeout(() => badgeScanInputRef.current?.focus(), 80);

    const profile =
      employeeProfiles.find(item => matchesScannedProfile(item, nextBadge)) ||
      (() => {
        const orderMatch = activeOrders.find(order => matchesScannedOrderIdentity(order, nextBadge));
        return orderMatch ? buildProfileFromOrder(orderMatch) : undefined;
      })();
    if (!profile) {
      addNotification('Badge non reconnu', `Le code ${nextBadge} ne correspond à aucun badge, téléphone ou commande active visible. Vérifiez que l'agent est bien chargé dans Firebase et que la commande appartient à la période restaurant actuelle.`, 'alert');
      return;
    }

    const activeBadgeOrders = orders.filter(order => isRestaurantScannableOrder(order, profile));
    const activeMealsSummary = activeBadgeOrders
      .flatMap(order => order.items.map(item => `${item.meal?.name || 'Repas'} x${item.quantity}`))
      .join(', ');
    setLastRestaurantScanSummary({
      badge: nextBadge,
      profile,
      orders: activeBadgeOrders,
      processedAt: new Date().toISOString(),
      status: activeBadgeOrders.length > 0 ? 'active' : 'none',
    });
    setIsLastRestaurantScanPinned(true);

    addNotification(
      activeBadgeOrders.length > 0 ? 'Badge valide' : 'Badge valide sans commande active',
      activeBadgeOrders.length > 0
        ? `${profile.name} | Service: ${profile.department || 'Non renseigné'} | Tél: ${profile.phone || 'Non renseigné'} | Menu: ${activeMealsSummary || 'Non renseigné'}`
        : `${profile.name} | Service: ${profile.department || 'Non renseigné'} | Badge reconnu, aucune commande active enregistrée.`,
      activeBadgeOrders.length > 0 ? 'success' : 'warning'
    );

    if (activeBadgeOrders.length > 0) {
      for (const order of activeBadgeOrders) {
        if (institutionConfig?.restaurantAutoPrintEnabled) {
          await printRestaurantTicket(order, profile);
        }
        const updated = await onUpdateOrderStatus(order.id, 'delivered');
        if (updated !== false && (order.fulfillmentMode || 'pickup') !== 'delivery') {
          await onSetRestaurantPresence?.(profile, true);
        }
      }
      setLastRestaurantScanSummary({
        badge: nextBadge,
        profile,
        orders: activeBadgeOrders,
        processedAt: new Date().toISOString(),
        status: 'delivered',
      });
      setIsLastRestaurantScanPinned(true);
      addNotification('Commande validée', `${profile.name}: ${activeBadgeOrders.length} commande(s) validée(s) au restaurant.`, 'success');
    }
  };

  const handleBadgeScanSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    void processRestaurantBadgeScan(badgeScanInput);
  };

  const handleRestaurantCounterExit = async (profile: UserProfile) => {
    await onSetRestaurantPresence?.(profile, false);
    addNotification('Sortie restaurant enregistrée', `${profile.name} ne compte plus comme présent au restaurant.`, 'success');
  };

  const stopCameraScanner = () => {
    cameraScannerControlsRef.current?.stop?.();
    cameraScannerControlsRef.current = null;
    if (cameraVideoRef.current) cameraVideoRef.current.srcObject = null;
  };

  const closeScanResultAndPrepareNext = () => {
    setIsLastRestaurantScanPinned(false);
    if (resumeCameraAfterScan) {
      setResumeCameraAfterScan(false);
      window.setTimeout(() => {
        setCameraScannerMessage('');
        setIsCameraScannerOpen(true);
      }, 180);
      return;
    }
    startHardwareScan();
  };

  useEffect(() => {
    if (!isCameraScannerOpen) {
      stopCameraScanner();
      return;
    }

    let cancelled = false;
    const startCameraScanner = async () => {
      try {
        cameraScanLockRef.current = false;
        if (!navigator.mediaDevices?.getUserMedia) {
          setCameraScannerMessage('Ce navigateur ne donne pas accès à la caméra. Utilisez le lecteur USB ou la saisie manuelle.');
          return;
        }
        const { BrowserQRCodeReader } = await import('../vendor/zxing-browser.mjs') as any;
        const reader = new BrowserQRCodeReader(undefined, {
          delayBetweenScanAttempts: 180,
          delayBetweenScanSuccess: 350,
          tryPlayVideoTimeout: 8000,
        });
        const controls = await reader.decodeFromVideoDevice(undefined, cameraVideoRef.current!, (result: any) => {
          const text = result?.getText?.();
          if (!text || cancelled) return;
          if (cameraScanLockRef.current) return;
          cameraScanLockRef.current = true;
          void (async () => {
            await processRestaurantBadgeScan(text);
            setResumeCameraAfterScan(true);
            setCameraScannerMessage('Badge lu. Fermez le résultat pour scanner le personnel suivant.');
            window.setTimeout(() => setIsCameraScannerOpen(false), 250);
          })();
        });
        cameraScannerControlsRef.current = controls;
        setCameraScannerMessage('Caméra active. Présentez le QR du badge ou du téléphone devant la caméra.');
      } catch (error) {
        console.error(error);
        setCameraScannerMessage('Accès caméra impossible. Autorisez la caméra dans le navigateur, puis réessayez.');
      }
    };

    startCameraScanner();
    return () => {
      cancelled = true;
      stopCameraScanner();
    };
  }, [isCameraScannerOpen]);

  const getBadgeQrUrl = (profile: UserProfile, size = 120) => {
    const phoneDigits = String(profile.phone || '').replace(/\D/g, '');
    const payload = phoneDigits || profile.badgeNumber;

    return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(payload)}`;
  };

  const handlePrintPersonnelBadges = () => {
    const groupedProfiles = [...badgePrintProfiles].sort((a, b) =>
      `${a.department}-${a.name}`.localeCompare(`${b.department}-${b.name}`, 'fr')
    );
    const printScope = [
      badgePrintServiceFilter === 'Tous les services' ? 'Tous les services' : `Service: ${badgePrintServiceFilter}`,
      badgePrintFunctionFilter === 'Toutes les fonctions' ? 'Toutes les fonctions' : `Fonction: ${badgePrintFunctionFilter}`,
    ].join(' | ');
    const lostContact = institutionConfig?.lateOrderPhone || '+221 33 000 00 00';
    const badgeBlocks = groupedProfiles.map((profile) => `
      <article class="badge">
        <div class="badge-head">
          <div>
            <div class="hospital">Ndamatou</div>
            <div class="service">${profile.department || 'Service non renseigné'}</div>
          </div>
          <div class="status">ACTIF</div>
        </div>
        <div class="name">${profile.name}</div>
        <div class="meta">${profile.building || ''} ${profile.floor ? `- ${profile.floor}` : ''}</div>
        <div class="badge-bottom">
          <div>
            <div class="label">Badge</div>
            <div class="code">${profile.badgeNumber}</div>
            <div class="label lost">Téléphone propriétaire</div>
            <div class="contact">${profile.phone || 'Non renseigné'}</div>
            <div class="label lost">Si trouvé, appeler</div>
            <div class="contact">${lostContact}</div>
          </div>
          <div>
            <img class="qr" src="${getBadgeQrUrl(profile, 118)}" />
            <div class="label" style="text-align:center;margin-top:4px;">QR téléphone</div>
          </div>
        </div>
      </article>
    `).join('');

    const printWindow = window.open('', '_blank', 'width=1000,height=760');
    if (!printWindow) return;
    printWindow.document.write(`
      <html>
        <head>
          <title>Badges personnel Ndamatou</title>
          <style>
            @page { size: A4; margin: 10mm; }
            * { box-sizing: border-box; }
            body { margin: 0; font-family: Arial, sans-serif; color: #0f172a; background: white; }
            header { margin-bottom: 10mm; border-bottom: 2px solid #0f172a; padding-bottom: 8px; }
            h1 { margin: 0; font-size: 18px; text-transform: uppercase; }
            .meta { font-size: 11px; color: #475569; margin-top: 4px; }
            .sheet { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8mm; }
            .badge { height: 82mm; border: 1.5px solid #0f172a; border-radius: 5mm; padding: 6mm; background: #f8fafc; break-inside: avoid; page-break-inside: avoid; display: flex; flex-direction: column; justify-content: space-between; }
            .badge-head { display: flex; justify-content: space-between; gap: 8px; align-items: flex-start; border-bottom: 1px solid #cbd5e1; padding-bottom: 4mm; }
            .hospital { font-size: 11px; font-weight: 900; letter-spacing: .8px; }
            .service { font-size: 10px; color: #475569; font-weight: 700; margin-top: 2px; }
            .status { font-size: 9px; font-weight: 900; color: #047857; border: 1px solid #10b981; border-radius: 999px; padding: 3px 7px; }
            .name { font-size: 16px; font-weight: 900; margin-top: 5mm; min-height: 14mm; }
            .badge-bottom { display: flex; justify-content: space-between; align-items: flex-end; gap: 6mm; }
            .label { font-size: 8px; color: #64748b; text-transform: uppercase; font-weight: 800; margin-top: 2mm; }
            .lost { margin-top: 5mm; }
            .code { font-family: Consolas, monospace; font-size: 13px; font-weight: 900; }
            .contact { font-size: 12px; font-weight: 900; color: #0f172a; }
            .qr { width: 27mm; height: 27mm; border: 1px solid #cbd5e1; border-radius: 3mm; padding: 2mm; background: white; }
            @media print {
              header { break-after: avoid; }
              .badge:nth-of-type(6n) { page-break-after: always; }
            }
          </style>
        </head>
        <body>
          <header>
            <h1>Badges du personnel inscrit - Ndamatou</h1>
            <div class="meta">${printScope} | ${groupedProfiles.length} badge(s) | Généré le ${new Date().toLocaleString('fr-FR')}</div>
          </header>
          <main class="sheet">${badgeBlocks || '<p>Aucun personnel inscrit.</p>'}</main>
          <script>window.onload = () => window.print();</script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div className="space-y-6">
      {/* 1. Header Metrics Card Bar */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h3 className="text-sm font-black text-slate-900">Blocs d'information</h3>
          <p className="text-xs font-semibold text-slate-500 mt-1">Masqués par défaut pour réduire les calculs et lectures inutiles pendant l'exploitation.</p>
        </div>
        <button
          type="button"
          onClick={() => setShowRestaurantInfoBlocks(value => !value)}
          className="px-4 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-black hover:bg-slate-800"
        >
          {showRestaurantInfoBlocks ? 'Masquer les blocs' : 'Afficher les blocs'}
        </button>
      </div>

      {showRestaurantInfoBlocks && (<>
      <div id="restaurant-metrics-grid" className="grid grid-cols-2 xl:grid-cols-5 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block">Part agent des repas</span>
            <span className="text-xl font-black text-slate-900 font-mono">
              {currentStats.restaurantRevenue.toLocaleString('fr-FR')} FCFA
            </span>
            <span className="block text-[9px] font-bold text-slate-400">Période {REPORT_OPERATIONAL_START} → {REPORT_OPERATIONAL_END_LABEL}</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
            <TrendingUp className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block">Part hôpital</span>
            <span className="text-xl font-black text-slate-900 font-mono">
              {currentStats.hospitalSupport.toLocaleString('fr-FR')} FCFA
            </span>
            <span className="block text-[9px] font-bold text-slate-400">{currentStats.accounting.subsidizedQuantity} portion(s) subventionnée(s)</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
            <TrendingUp className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block">Montant réel</span>
            <span className="text-xl font-black text-slate-900 font-mono">
              {currentStats.realAmount.toLocaleString('fr-FR')} FCFA
            </span>
            <span className="block text-[9px] font-bold text-slate-400">Part agent + subvention de base</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center">
            <ShoppingBag className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block">Commandes payées</span>
            <span className="text-xl font-black text-slate-900">
              {currentStats.regularOrders.length}
            </span>
            <span className="block text-[9px] font-bold text-slate-400">{currentStats.accounting.quantity} portion(s)</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
            <ChefHat className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block">Commandes remises</span>
            <span className="text-xl font-black text-slate-900">
              {currentStats.deliveredOrders.length}
            </span>
            <span className="block text-[9px] font-bold text-slate-400">Validées par scan / remise</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
            <CheckCircle className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block">À livrer</span>
            <span className="text-xl font-black text-slate-900">{currentStats.ordersToDeliver.length}</span>
            <span className="block text-[9px] font-bold text-slate-400">Livraisons non finalisées</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
            <Truck className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block">Recharges encaissées</span>
            <span className="text-xl font-black text-slate-900 font-mono">{currentStats.cashRevenue.toLocaleString('fr-FR')} FCFA</span>
            <span className="block text-[9px] font-bold text-slate-400">Recharges badge de la période</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-slate-50 text-slate-700 flex items-center justify-center">
            <TrendingUp className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block">Total recharges depuis début</span>
            <span className="text-xl font-black text-slate-900 font-mono">{currentStats.lifetimeTopups.toLocaleString('fr-FR')} FCFA</span>
            <span className="block text-[9px] font-bold text-slate-400">Cumul de toutes les recharges badges</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
            <WalletCards className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block">Solde total badges</span>
            <span className="text-xl font-black text-slate-900 font-mono">{currentStats.totalBadgeBalance.toLocaleString('fr-FR')} FCFA</span>
            <span className="block text-[9px] font-bold text-slate-400">{employeeProfiles.length} badge(s) personnel</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
            <Users className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block">Liquidités badges</span>
            <span className={`text-xl font-black font-mono ${currentStats.badgeLiquidity < 0 ? 'text-red-700' : 'text-slate-900'}`}>
              {currentStats.badgeLiquidity.toLocaleString('fr-FR')} FCFA
            </span>
            <span className="block text-[9px] font-bold text-slate-400">Recharges totales - part restaurateur</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
            <BarChart3 className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block">Ventes réelles depuis début</span>
            <span className="text-xl font-black text-slate-900 font-mono">{currentStats.lifetimeRealSales.toLocaleString('fr-FR')} FCFA</span>
            <span className="block text-[9px] font-bold text-slate-400">Part agents + part hôpital</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
            <TrendingUp className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block">Portions restantes</span>
            <span className="text-xl font-black text-slate-900">{currentStats.remainingHotStock}</span>
            <span className="block text-[9px] font-bold text-slate-400">Plats chauds actifs</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center">
            <Package className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block">Places libres</span>
            <span className="text-xl font-black text-slate-900">{Math.max(0, (restaurantCapacity || 0) - (restaurantOccupancy || 0))}</span>
            <span className="block text-[9px] font-bold text-slate-400">{restaurantOccupancy || 0} occupée(s) / {restaurantCapacity || 0}</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-cyan-50 text-cyan-600 flex items-center justify-center">
            <Utensils className="w-5 h-5" />
          </div>
        </div>

        {currentStats.orderRateSlots.map((slot, index) => (
          <div key={`order-rate-${slot.id}`} className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div className="space-y-1">
                <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block">Taux commandes {slot.label}</span>
                <span className="text-xl font-black text-slate-900">{slot.rate}%</span>
                <span className="block text-[9px] font-bold text-slate-400">
                  {slot.orders} commande(s) / {slot.quantity} portion(s)
                </span>
              </div>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                index === 0 ? 'bg-slate-100 text-slate-700' : index === 1 ? 'bg-sky-50 text-sky-600' : 'bg-orange-50 text-orange-600'
              }`}>
                <Clock className="w-5 h-5" />
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-[11px] font-semibold text-blue-900">
        Blocs de période calculés sur la journée restaurant en cours ({restaurantPeriodLabel}). Les taux par créneau indiquent la part des commandes payées de la période passées dans chaque plage horaire administrable. Les ventes ordinaires excluent les commandes annulées et les repas spéciaux. La part restaurateur correspond au montant payé par les agents; la part hôpital correspond uniquement aux portions subventionnées. Les ventes réelles depuis le début cumulent part agents + part hôpital sur toutes les commandes payées. Les liquidités badges correspondent ici à: total des recharges encaissées - part restaurateur depuis le début.
      </div>
      </>)}

      {/* 2. Main Admin navigation */}
      <div className="flex border border-slate-800 gap-1 bg-white p-1 rounded-xl shadow-sm overflow-x-auto">
        {showOperationalRestaurantTabs && (
          <>
            <button
              id="btn-nav-scan"
              onClick={() => setActiveTab('scan')}
              className={`flex-1 flex items-center justify-center gap-2 py-3 px-1 rounded-lg border text-xs font-bold uppercase tracking-wide transition cursor-pointer ${
                activeTab === 'scan'
                  ? 'bg-blue-50 text-blue-800 border-slate-900'
                  : 'text-gray-600 border-slate-300 hover:text-blue-700 hover:bg-gray-50 hover:border-slate-700'
              }`}
            >
              <QrCode className="w-4 h-4" />
              Scan badge QR
            </button>
            <button
              id="btn-nav-topup"
              onClick={() => setActiveTab('topup')}
              className={`flex-1 flex items-center justify-center gap-2 py-3 px-1 rounded-lg border text-xs font-bold uppercase tracking-wide transition cursor-pointer ${
                activeTab === 'topup'
                  ? 'bg-blue-50 text-blue-800 border-slate-900'
                  : 'text-gray-600 border-slate-300 hover:text-blue-700 hover:bg-gray-50 hover:border-slate-700'
              }`}
            >
              <PlusCircle className="w-4 h-4" />
              Recharge badges
            </button>
            <button
              id="btn-nav-orders"
              onClick={() => setActiveTab('orders')}
              className={`flex-1 flex items-center justify-center gap-2 py-3 px-1 rounded-lg border text-xs font-bold uppercase tracking-wide transition cursor-pointer ${
                activeTab === 'orders'
                  ? 'bg-blue-50 text-blue-800 border-slate-900'
                  : 'text-gray-600 border-slate-300 hover:text-blue-700 hover:bg-gray-50 hover:border-slate-700'
              }`}
            >
              <Clock className="w-4 h-4" />
              Commandes en direct ({activeOrders.length})
            </button>
            <button
              id="btn-nav-inventory"
              onClick={() => setActiveTab('inventory')}
              className={`flex-1 flex items-center justify-center gap-2 py-3 px-1 rounded-lg border text-xs font-bold uppercase tracking-wide transition cursor-pointer ${
                activeTab === 'inventory'
                  ? 'bg-blue-50 text-blue-800 border-slate-900'
                  : 'text-gray-600 border-slate-300 hover:text-blue-700 hover:bg-gray-50 hover:border-slate-700'
              }`}
            >
              <Package className="w-4 h-4" />
              Gestion alimentaire & stocks
            </button>
            <button
              id="btn-nav-delivery"
              onClick={() => setActiveTab('delivery')}
              className={`flex-1 flex items-center justify-center gap-2 py-3 px-1 rounded-lg border text-xs font-bold uppercase tracking-wide transition cursor-pointer ${
                activeTab === 'delivery'
                  ? 'bg-blue-50 text-blue-800 border-slate-900'
                  : 'text-gray-600 border-slate-300 hover:text-blue-700 hover:bg-gray-50 hover:border-slate-700'
              }`}
            >
              <Truck className="w-4 h-4" />
              Livraisons ({deliveryOrders.length})
            </button>
          </>
        )}
        {canAccessAdministration && (
            <button
              id="btn-nav-anticipation"
              onClick={() => setActiveTab('anticipation')}
              className={`flex-1 flex items-center justify-center gap-2 py-3 px-1 rounded-lg border text-xs font-bold uppercase tracking-wide transition cursor-pointer ${
                activeTab === 'anticipation'
                  ? 'bg-blue-50 text-blue-800 border-slate-900'
                  : 'text-gray-600 border-slate-300 hover:text-blue-700 hover:bg-gray-50 hover:border-slate-700'
              }`}
            >
              <Vote className="w-4 h-4" />
              Questionnaire
            </button>
        )}
        <button
          id="btn-nav-analytics"
          onClick={() => setActiveTab('analytics')}
          className={`flex-1 flex items-center justify-center gap-2 py-3 px-1 rounded-lg border text-xs font-bold uppercase tracking-wide transition cursor-pointer ${
            activeTab === 'analytics'
              ? 'bg-blue-50 text-blue-800 border-slate-900'
              : 'text-gray-600 border-slate-300 hover:text-blue-700 hover:bg-gray-50 hover:border-slate-700'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          Analyse des Performances
        </button>
        {canAccessAdministration && (
          <button
            id="btn-nav-settings"
            onClick={() => setActiveTab('settings')}
            className={`flex-1 flex items-center justify-center gap-2 py-3 px-1 rounded-lg border text-xs font-bold uppercase tracking-wide transition cursor-pointer ${
              activeTab === 'settings'
                ? 'bg-blue-50 text-blue-800 border-slate-900'
                : 'text-gray-600 border-slate-300 hover:text-blue-700 hover:bg-gray-50 hover:border-slate-700'
            }`}
          >
            <Users className="w-4 h-4" />
            Administration
          </button>
        )}
      </div>

      {/* 3. Render view depending on navigation tabs */}
      <AnimatePresence mode="wait">
        {activeTab === 'settings' && canAccessAdministration && institutionDraft && (
          <motion.div
            key="settings-view"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 space-y-5"
          >
            <div>
              <h3 className="font-black text-slate-950 text-base">Paramètres institutionnels</h3>
              <p className="text-xs text-slate-500 mt-1">Ces champs alimentent l'en-tête: logo, Directeur, photo du restaurant, chef du service administratif et financier.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block font-bold uppercase text-slate-500 mb-1">Logo de l'hôpital</label>
                <input type="file" accept="image/*" onChange={(e) => handleInstitutionImage(e, 'logoUrl')} className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50" />
                {institutionDraft.logoUrl && <img src={institutionDraft.logoUrl} alt="Logo" className="mt-2 w-16 h-16 rounded-xl object-contain border border-slate-200 bg-white" />}
              </div>
              <div>
                <label className="block font-bold uppercase text-slate-500 mb-1">Nom du directeur</label>
                <input value={institutionDraft.directorName} onChange={(e) => setInstitutionDraft({ ...institutionDraft, directorName: e.target.value })} className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50" />
              </div>
              <div>
                <label className="block font-bold uppercase text-slate-500 mb-1">Photo du directeur</label>
                <input type="file" accept="image/*" onChange={(e) => handleInstitutionImage(e, 'directorPhotoUrl')} className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50" />
                {institutionDraft.directorPhotoUrl && <img src={institutionDraft.directorPhotoUrl} alt="Directeur" className="mt-2 w-16 h-16 rounded-xl object-cover border border-slate-200 bg-white" />}
              </div>
              <div>
                <label className="block font-bold uppercase text-slate-500 mb-1">Nom du chef SAF</label>
                <input value={institutionDraft.safName} onChange={(e) => setInstitutionDraft({ ...institutionDraft, safName: e.target.value })} className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50" />
              </div>
              <div>
                <label className="block font-bold uppercase text-slate-500 mb-1">Photo chef SAF</label>
                <input type="file" accept="image/*" onChange={(e) => handleInstitutionImage(e, 'safPhotoUrl')} className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50" />
                {institutionDraft.safPhotoUrl && <img src={institutionDraft.safPhotoUrl} alt="Chef SAF" className="mt-2 w-16 h-16 rounded-xl object-cover border border-slate-200 bg-white" />}
              </div>              <div>
                <label className="block font-bold uppercase text-slate-500 mb-1">Photo du restaurant</label>
                <input type="file" accept="image/*" onChange={(e) => handleInstitutionImage(e, 'restaurantPhotoUrl')} className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50" />
                {institutionDraft.restaurantPhotoUrl && <img src={institutionDraft.restaurantPhotoUrl} alt="Restaurant Ndamatou" className="mt-2 w-32 h-20 rounded-xl object-cover border border-slate-200 bg-white shadow-sm" />}
              </div>
              <div>
                <label className="block font-bold uppercase text-slate-500 mb-1">Code livraison SAF</label>
                <input value={institutionDraft.deliveryAccessCode || ''} onChange={(e) => setInstitutionDraft({ ...institutionDraft, deliveryAccessCode: e.target.value })} className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50" />
              </div>
              <div>
                <label className="block font-bold uppercase text-slate-500 mb-1">Numéro à appeler après 13h</label>
                <input value={institutionDraft.lateOrderPhone || ''} onChange={(e) => setInstitutionDraft({ ...institutionDraft, lateOrderPhone: e.target.value })} className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50" />
              </div>
              <div>
                <label className="block font-bold uppercase text-slate-500 mb-1">Numéro marchand Wave</label>
                <input value={institutionDraft.waveMerchantNumber || ''} onChange={(e) => setInstitutionDraft({ ...institutionDraft, waveMerchantNumber: e.target.value })} className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50" />
              </div>
              <div className="md:col-span-2 rounded-3xl border border-slate-100 bg-slate-50 p-4 space-y-4">
                <div>
                  <h4 className="font-black text-slate-950 text-sm">Paramètres opérationnels du restaurant</h4>
                  <p className="text-[11px] text-slate-600 mt-1">Ces réglages pilotent les commandes, le week-end, les places, l'impression et les rapports.</p>
                </div>
                <div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-4 space-y-3">
                  <div>
                    <h5 className="font-black text-blue-950 text-xs uppercase">Tarifs repas administrables</h5>
                    <p className="text-[11px] text-blue-800 mt-1">
                      Pour un plat chaud subventionné, la somme part agent + subvention de base doit correspondre au prix réel : 500 + 500 = 1 000 FCFA. La contribution hôpital de 1 % et la retenue restaurant de 1 % sont suivies séparément.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <label className="text-xs font-bold text-slate-600">
                      Prix réel du repas
                      <input
                        type="number"
                        min="0"
                        value={Number(institutionDraft.realMealPrice || 0)}
                        onChange={(e) => {
                          const real = Math.max(0, Number(e.target.value || 0));
                          const staff = Math.min(real, Math.max(0, Number(institutionDraft.staffMealPrice || 0)));
                          setInstitutionDraft({
                            ...institutionDraft,
                            realMealPrice: real,
                            staffMealPrice: staff,
                            hospitalSupportAmount: Math.max(0, real - staff),
                          });
                        }}
                        className="mt-1 w-full px-3 py-2.5 rounded-xl border border-blue-100 bg-white font-black text-slate-900"
                      />
                    </label>
                    <label className="text-xs font-bold text-slate-600">
                      Part payée par l'agent
                      <input
                        type="number"
                        min="0"
                        value={Number(institutionDraft.staffMealPrice || 0)}
                        onChange={(e) => {
                          const real = Math.max(0, Number(institutionDraft.realMealPrice || 0));
                          const staff = Math.min(real, Math.max(0, Number(e.target.value || 0)));
                          setInstitutionDraft({
                            ...institutionDraft,
                            staffMealPrice: staff,
                            hospitalSupportAmount: Math.max(0, real - staff),
                          });
                        }}
                        className="mt-1 w-full px-3 py-2.5 rounded-xl border border-blue-100 bg-white font-black text-slate-900"
                      />
                    </label>
                    <label className="text-xs font-bold text-slate-600">
                      Part supportée par l'hôpital
                      <input
                        type="number"
                        min="0"
                        value={Number(institutionDraft.hospitalSupportAmount || 0)}
                        onChange={(e) => {
                          const real = Math.max(0, Number(institutionDraft.realMealPrice || 0));
                          const hospital = Math.min(real, Math.max(0, Number(e.target.value || 0)));
                          setInstitutionDraft({
                            ...institutionDraft,
                            hospitalSupportAmount: hospital,
                            staffMealPrice: Math.max(0, real - hospital),
                          });
                        }}
                        className="mt-1 w-full px-3 py-2.5 rounded-xl border border-blue-100 bg-white font-black text-slate-900"
                      />
                    </label>
                  </div>
                  <div className="rounded-xl border border-blue-100 bg-white px-3 py-2 text-[11px] font-black text-blue-900">
                    Vérification: {Number(institutionDraft.staffMealPrice || 0).toLocaleString('fr-FR')} F agent + {Number(institutionDraft.hospitalSupportAmount || 0).toLocaleString('fr-FR')} F hôpital = {(Number(institutionDraft.staffMealPrice || 0) + Number(institutionDraft.hospitalSupportAmount || 0)).toLocaleString('fr-FR')} F / prix réel {Number(institutionDraft.realMealPrice || 0).toLocaleString('fr-FR')} F.
                  </div>
                </div>                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <label className="text-xs font-bold text-slate-600">
                    Début commandes
                    <input type="time" value={institutionDraft.orderWindowStart || '00:00'} onChange={(e) => setInstitutionDraft({ ...institutionDraft, orderWindowStart: e.target.value })} className="mt-1 w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white" />
                  </label>
                  <label className="text-xs font-bold text-slate-600">
                    Fin commandes
                    <input type="time" value={institutionDraft.orderWindowEnd || '09:00'} onChange={(e) => setInstitutionDraft({ ...institutionDraft, orderWindowEnd: e.target.value })} className="mt-1 w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white" />
                  </label>
                  <label className="text-xs font-bold text-slate-600">
                    Perte commande
                    <input type="time" value={institutionDraft.unclaimedExpirationTime || '18:00'} onChange={(e) => setInstitutionDraft({ ...institutionDraft, unclaimedExpirationTime: e.target.value })} className="mt-1 w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white" />
                  </label>
                  <label className="text-xs font-bold text-slate-600">
                    Capacité restau
                    <input type="number" min="1" value={Number(institutionDraft.restaurantCapacity || 70)} onChange={(e) => setInstitutionDraft({ ...institutionDraft, restaurantCapacity: Number(e.target.value || 70) })} className="mt-1 w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white" />
                  </label>
                  <label className="flex items-center gap-2 rounded-xl bg-white border border-slate-200 px-3 py-2 text-xs font-black">
                    <input type="checkbox" checked={Boolean(institutionDraft.orderWindowEnabled)} onChange={(e) => setInstitutionDraft({ ...institutionDraft, orderWindowEnabled: e.target.checked })} />
                    Activer délai commande
                  </label>
                  <label className="flex items-center gap-2 rounded-xl bg-white border border-slate-200 px-3 py-2 text-xs font-black">
                    <input type="checkbox" checked={Boolean(institutionDraft.weekendOrderingClosed)} onChange={(e) => setInstitutionDraft({ ...institutionDraft, weekendOrderingClosed: e.target.checked })} />
                    Fermer week-end
                  </label>
                  <label className="flex items-center gap-2 rounded-xl bg-white border border-slate-200 px-3 py-2 text-xs font-black">
                    <input type="checkbox" checked={Boolean(institutionDraft.restaurantAutoPrintEnabled)} onChange={(e) => setInstitutionDraft({ ...institutionDraft, restaurantAutoPrintEnabled: e.target.checked })} />
                    Impression auto ticket
                  </label>
                  <label className="flex items-center gap-2 rounded-xl bg-white border border-slate-200 px-3 py-2 text-xs font-black">
                    <input type="checkbox" checked={Boolean(institutionDraft.restaurantExitQrEnabled)} onChange={(e) => setInstitutionDraft({ ...institutionDraft, restaurantExitQrEnabled: e.target.checked })} />
                    QR sortie actif
                  </label>
                  <label className="text-xs font-bold text-slate-600">
                    Sortie auto (minutes)
                    <input type="number" min="1" value={Number(institutionDraft.restaurantOccupancyMinutes || 40)} onChange={(e) => setInstitutionDraft({ ...institutionDraft, restaurantOccupancyMinutes: Number(e.target.value || 40) })} className="mt-1 w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white" />
                  </label>
                  <label className="text-xs font-bold text-slate-600">
                    Mode sortie après scan (s)
                    <input type="number" min="1" value={Number(institutionDraft.restaurantExitScanModeSeconds || 20)} onChange={(e) => setInstitutionDraft({ ...institutionDraft, restaurantExitScanModeSeconds: Number(e.target.value || 20) })} className="mt-1 w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white" />
                  </label>
                  <label className="text-xs font-bold text-slate-600">
                    Largeur ticket (mm)
                    <input type="number" min="40" value={Number(institutionDraft.restaurantTicketWidthMm || 80)} onChange={(e) => setInstitutionDraft({ ...institutionDraft, restaurantTicketWidthMm: Number(e.target.value || 80) })} className="mt-1 w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white" />
                  </label>
                  <label className="text-xs font-bold text-slate-600">
                    Plafond badge
                    <input type="number" min="0" value={Number(institutionDraft.maxBadgeBalance || 10000)} onChange={(e) => setInstitutionDraft({ ...institutionDraft, maxBadgeBalance: Number(e.target.value || 10000) })} className="mt-1 w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white" />
                  </label>
                </div>
                <div className="rounded-2xl border border-slate-100 bg-white p-4 space-y-3">
                  <div>
                    <h5 className="font-black text-slate-900 text-xs uppercase">Créneaux statistiques des commandes</h5>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Ces heures pilotent les taux affichés dans les blocs d'information. Un créneau peut traverser minuit, par exemple 19:00 → 08:00.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {[
                      ['Créneau 1', 'orderRateSlot1Start', 'orderRateSlot1End', '19:00', '08:00'],
                      ['Créneau 2', 'orderRateSlot2Start', 'orderRateSlot2End', '08:00', '13:00'],
                      ['Créneau 3', 'orderRateSlot3Start', 'orderRateSlot3End', '13:00', '18:00'],
                    ].map(([label, startKey, endKey, defaultStart, defaultEnd]) => (
                      <div key={label} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                        <p className="text-[11px] font-black uppercase text-slate-600">{label}</p>
                        <div className="mt-2 grid grid-cols-2 gap-2">
                          <label className="text-[10px] font-bold text-slate-500">
                            Début
                            <input
                              type="time"
                              value={String(institutionDraft[startKey] || defaultStart)}
                              onChange={(e) => setInstitutionDraft({ ...institutionDraft, [startKey]: e.target.value })}
                              className="mt-1 w-full px-2 py-2 rounded-lg border border-slate-200 bg-white"
                            />
                          </label>
                          <label className="text-[10px] font-bold text-slate-500">
                            Fin
                            <input
                              type="time"
                              value={String(institutionDraft[endKey] || defaultEnd)}
                              onChange={(e) => setInstitutionDraft({ ...institutionDraft, [endKey]: e.target.value })}
                              className="mt-1 w-full px-2 py-2 rounded-lg border border-slate-200 bg-white"
                            />
                          </label>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4 space-y-3">
                  <div>
                    <h5 className="font-black text-amber-950 text-xs uppercase">Créneaux d'affluence restaurant</h5>
                    <p className="text-[11px] text-amber-800 mt-1">
                      Ces heures pilotent l'analyse des agents réellement passés au restaurant après scan/remise du repas.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {[
                      ['Affluence 1', 'restaurantAffluenceSlot1Start', 'restaurantAffluenceSlot1End', '12:00', '15:00'],
                      ['Affluence 2', 'restaurantAffluenceSlot2Start', 'restaurantAffluenceSlot2End', '15:00', '18:00'],
                    ].map(([label, startKey, endKey, defaultStart, defaultEnd]) => (
                      <div key={label} className="rounded-xl border border-amber-100 bg-white p-3">
                        <p className="text-[11px] font-black uppercase text-amber-700">{label}</p>
                        <div className="mt-2 grid grid-cols-2 gap-2">
                          <label className="text-[10px] font-bold text-slate-500">
                            Début
                            <input
                              type="time"
                              value={String(institutionDraft[startKey] || defaultStart)}
                              onChange={(e) => setInstitutionDraft({ ...institutionDraft, [startKey]: e.target.value })}
                              className="mt-1 w-full px-2 py-2 rounded-lg border border-amber-100 bg-white"
                            />
                          </label>
                          <label className="text-[10px] font-bold text-slate-500">
                            Fin
                            <input
                              type="time"
                              value={String(institutionDraft[endKey] || defaultEnd)}
                              onChange={(e) => setInstitutionDraft({ ...institutionDraft, [endKey]: e.target.value })}
                              className="mt-1 w-full px-2 py-2 rounded-lg border border-amber-100 bg-white"
                            />
                          </label>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-2xl border border-blue-100 bg-white p-4 space-y-3">
                  <div>
                    <h5 className="font-black text-slate-900 text-xs uppercase">Quotas quotidiens de livraison par service</h5>
                    <p className="text-[11px] text-slate-500 mt-1">
                      0 signifie illimité. Ces quotas limitent le nombre d'agents qu'un service peut faire livrer sur une journée opérationnelle.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-72 overflow-y-auto pr-1">
                    {(institutionDraft.services || []).map((service) => (
                      <label key={`quota-${service}`} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700">
                        <span className="min-w-0 truncate" title={service}>{service}</span>
                        <input
                          type="number"
                          min="0"
                          value={Number(institutionDraft.deliveryServiceDailyQuotas?.[service] ?? 0)}
                          onChange={(event) => {
                            const nextValue = Math.max(0, Math.trunc(Number(event.target.value || 0) || 0));
                            setInstitutionDraft({
                              ...institutionDraft,
                              deliveryServiceDailyQuotas: {
                                ...(institutionDraft.deliveryServiceDailyQuotas || {}),
                                [service]: nextValue,
                              },
                            });
                          }}
                          className="w-24 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-right font-black text-slate-900"
                        />
                      </label>
                    ))}
                  </div>
                </div>
              </div>
              <div className="md:col-span-2 rounded-3xl border border-amber-100 bg-amber-50/70 p-4 space-y-4">
                <div>
                  <h4 className="font-black text-slate-950 text-sm">Publicité et signataires</h4>
                  {!canAccessSensitiveAdministration && (
                    <p className="mt-1 rounded-2xl border border-amber-200 bg-white px-3 py-2 text-[11px] font-bold text-amber-800">
                      La publicité du bandeau est un paramètre sensible. Connectez-vous avec le compte autorisé pour modifier le texte, l'activation ou la vitesse de défilement.
                    </p>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <label className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-black ${canAccessSensitiveAdministration ? 'bg-white border-amber-100' : 'bg-slate-100 border-slate-200 text-slate-400'}`}>
                    <input
                      type="checkbox"
                      disabled={!canAccessSensitiveAdministration}
                      checked={Boolean(institutionDraft.advertisingEnabled)}
                      onChange={(e) => setInstitutionDraft({ ...institutionDraft, advertisingEnabled: e.target.checked })}
                    />
                    Activer publicité
                  </label>
                  <label className="text-xs font-bold text-slate-600">
                    Vitesse défilement (s)
                    <input
                      type="number"
                      min="10"
                      disabled={!canAccessSensitiveAdministration}
                      value={institutionDraft.advertisingSpeedSeconds ?? ''}
                      onChange={(e) => setInstitutionDraft({
                        ...institutionDraft,
                        advertisingSpeedSeconds: e.target.value === '' ? '' : Number(e.target.value),
                      })}
                      onBlur={(e) => {
                        const nextSpeed = Number(e.target.value);
                        if (!Number.isFinite(nextSpeed) || nextSpeed < 10) {
                          setInstitutionDraft({ ...institutionDraft, advertisingSpeedSeconds: 35 });
                        }
                      }}
                      className={`mt-1 w-full px-3 py-2.5 rounded-xl border ${canAccessSensitiveAdministration ? 'border-amber-100 bg-white' : 'border-slate-200 bg-slate-100 text-slate-400'}`}
                    />
                  </label>
                  <label className="text-xs font-bold text-slate-600">
                    Nom responsable restaurant
                    <input value={institutionDraft.restaurantManagerName || ''} onChange={(e) => setInstitutionDraft({ ...institutionDraft, restaurantManagerName: e.target.value })} className="mt-1 w-full px-3 py-2.5 rounded-xl border border-amber-100 bg-white" />
                  </label>
                  <label className="md:col-span-2 text-xs font-bold text-slate-600">
                    Texte publicité
                    <input
                      disabled={!canAccessSensitiveAdministration}
                      value={institutionDraft.advertisingText || ''}
                      onChange={(e) => setInstitutionDraft({ ...institutionDraft, advertisingText: e.target.value })}
                      className={`mt-1 w-full px-3 py-2.5 rounded-xl border ${canAccessSensitiveAdministration ? 'border-amber-100 bg-white' : 'border-slate-200 bg-slate-100 text-slate-400'}`}
                    />
                  </label>
                  <label className="text-xs font-bold text-slate-600">
                    Service ACP
                    <input value={institutionDraft.acpName || ''} onChange={(e) => setInstitutionDraft({ ...institutionDraft, acpName: e.target.value })} className="mt-1 w-full px-3 py-2.5 rounded-xl border border-amber-100 bg-white" />
                  </label>
                  <label className="text-xs font-bold text-slate-600">
                    Contrôleur de gestion
                    <input value={institutionDraft.managementControllerName || ''} onChange={(e) => setInstitutionDraft({ ...institutionDraft, managementControllerName: e.target.value })} className="mt-1 w-full px-3 py-2.5 rounded-xl border border-amber-100 bg-white" />
                  </label>
                  <label className="md:col-span-2 text-xs font-bold text-slate-600">
                    Ordre signataires
                    <input
                      value={(institutionDraft.revenueReportSignatureOrder || ['restaurantManager', 'saf', 'managementController', 'director']).join(',')}
                      onChange={(e) => setInstitutionDraft({ ...institutionDraft, revenueReportSignatureOrder: e.target.value.split(',').map(item => item.trim()).filter(Boolean) })}
                      className="mt-1 w-full px-3 py-2.5 rounded-xl border border-amber-100 bg-white"
                    />
                  </label>
                </div>
              </div>
              {secureBalanceFunctionsEnabled && (
              <div className="md:col-span-2 rounded-3xl border border-blue-100 bg-blue-50/60 p-4 space-y-4">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <div>
                    <h4 className="font-black text-slate-950 text-sm">Facture Firebase Blaze</h4>
                    <p className="text-[11px] text-slate-600 mt-1">
                      Saisissez ici les montants lus dans Google Cloud Billing/Firebase. Ce module imprime un relevé interne Ndamatou.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handlePrintBlazeInvoice}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-950 text-white text-xs font-black hover:bg-slate-800"
                  >
                    <Printer className="w-4 h-4" />
                    Imprimer la facture
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block font-bold uppercase text-slate-500 mb-1">Début période</label>
                    <input type="date" value={institutionDraft.blazeInvoicePeriodStart || ''} onChange={(e) => setInstitutionDraft({ ...institutionDraft, blazeInvoicePeriodStart: e.target.value })} className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white" />
                  </div>
                  <div>
                    <label className="block font-bold uppercase text-slate-500 mb-1">Fin période</label>
                    <input type="date" value={institutionDraft.blazeInvoicePeriodEnd || ''} onChange={(e) => setInstitutionDraft({ ...institutionDraft, blazeInvoicePeriodEnd: e.target.value })} className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white" />
                  </div>
                  <div>
                    <label className="block font-bold uppercase text-slate-500 mb-1">Total calculé</label>
                    <div className="px-3 py-2.5 rounded-xl border border-blue-200 bg-white font-black text-blue-700">
                      {formatFcfa(getBlazeInvoiceTotal())}
                    </div>
                  </div>
                  {[
                    ['blazeFirestoreAmount', 'Firestore'],
                    ['blazeHostingAmount', 'Hosting'],
                    ['blazeAuthAmount', 'Authentication'],
                    ['blazeStorageAmount', 'Storage'],
                    ['blazeOtherAmount', 'Autres services'],
                    ['blazeTaxesAmount', 'Taxes / ajustements'],
                  ].map(([field, label]) => (
                    <div key={field}>
                      <label className="block font-bold uppercase text-slate-500 mb-1">{label}</label>
                      <input
                        type="number"
                        min="0"
                        value={Number(institutionDraft[field] || 0)}
                        onChange={(e) => setInstitutionDraft({ ...institutionDraft, [field]: Number(e.target.value || 0) })}
                        className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white"
                      />
                    </div>
                  ))}
                  <div className="md:col-span-3">
                    <label className="block font-bold uppercase text-slate-500 mb-1">Notes</label>
                    <textarea
                      value={institutionDraft.blazeNotes || ''}
                      onChange={(e) => setInstitutionDraft({ ...institutionDraft, blazeNotes: e.target.value })}
                      rows={3}
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white"
                      placeholder="Exemple: période relevée depuis Google Cloud Billing, détails ou observations."
                    />
                  </div>
                </div>
              </div>
              )}
              <div className="md:col-span-2 rounded-3xl border border-slate-200 bg-white p-4 space-y-5">
                <div>
                  <h4 className="font-black text-slate-950 text-sm">Référentiels d'inscription</h4>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Ajoutez les services et les fonctions visibles dans l'inscription et le profil. Toute suppression demande le code d'accès.
                  </p>
                </div>
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                  <section className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4 space-y-3">
                    <div>
                      <h5 className="font-black text-slate-900 text-xs uppercase">Services</h5>
                      <p className="text-[10px] text-slate-500 mt-0.5">{(institutionDraft.services || []).length} service(s) configuré(s)</p>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        value={newServiceName}
                        onChange={(event) => setNewServiceName(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            void handleAddServiceReferential();
                          }
                        }}
                        placeholder="Écrire le nouveau service"
                        className="flex-1 px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-semibold outline-none focus:border-blue-500"
                      />
                      <button
                        type="button"
                        onClick={() => void handleAddServiceReferential()}
                        className="px-4 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-black hover:bg-blue-700"
                      >
                        Valider
                      </button>
                    </div>
                    <div className="max-h-56 overflow-y-auto rounded-xl border border-slate-100 bg-white divide-y divide-slate-100">
                      {(institutionDraft.services || []).length === 0 ? (
                        <div className="p-3 text-xs text-slate-500">Aucun service configuré.</div>
                      ) : (
                        (institutionDraft.services || []).map(service => (
                          <div key={`service-ref-${service}`} className="flex items-center justify-between gap-3 p-3">
                            <span className="text-xs font-bold text-slate-800">{service}</span>
                            <button
                              type="button"
                              onClick={() => void handleDeleteServiceReferential(service)}
                              className="px-3 py-1.5 rounded-lg border border-red-100 bg-red-50 text-red-700 text-[10px] font-black hover:bg-red-100"
                            >
                              Supprimer
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </section>
                  <section className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4 space-y-3">
                    <div>
                      <h5 className="font-black text-slate-900 text-xs uppercase">Fonctions</h5>
                      <p className="text-[10px] text-slate-500 mt-0.5">{(institutionDraft.specialties || []).length} fonction(s) configurée(s)</p>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        value={newSpecialtyName}
                        onChange={(event) => setNewSpecialtyName(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            void handleAddSpecialtyReferential();
                          }
                        }}
                        placeholder="Écrire la nouvelle fonction"
                        className="flex-1 px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-semibold outline-none focus:border-blue-500"
                      />
                      <button
                        type="button"
                        onClick={() => void handleAddSpecialtyReferential()}
                        className="px-4 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-black hover:bg-blue-700"
                      >
                        Valider
                      </button>
                    </div>
                    <div className="max-h-56 overflow-y-auto rounded-xl border border-slate-100 bg-white divide-y divide-slate-100">
                      {(institutionDraft.specialties || []).length === 0 ? (
                        <div className="p-3 text-xs text-slate-500">Aucune fonction configurée.</div>
                      ) : (
                        (institutionDraft.specialties || []).map(specialty => (
                          <div key={`specialty-ref-${specialty}`} className="flex items-center justify-between gap-3 p-3">
                            <span className="text-xs font-bold text-slate-800">{specialty}</span>
                            <button
                              type="button"
                              onClick={() => void handleDeleteSpecialtyReferential(specialty)}
                              className="px-3 py-1.5 rounded-lg border border-red-100 bg-red-50 text-red-700 text-[10px] font-black hover:bg-red-100"
                            >
                              Supprimer
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </section>
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={async () => {
                try {
                  await onUpdateInstitutionConfig?.(institutionDraft);
                  addNotification('Paramètres enregistrés', "L'en-tête institutionnel a été sauvegardé dans Firestore.", 'success');
                } catch (error) {
                  console.error(error);
                  addNotification('Sauvegarde impossible', "Firestore a refusé la sauvegarde. Vérifiez les règles Firestore et le rôle admin du compte connecté.", 'alert');
                }
              }}
              className="px-5 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-black hover:bg-blue-700"
            >
              Enregistrer les paramètres
            </button>
            <div className="border-t border-slate-100 pt-5">
              <div className="flex items-center justify-between gap-3 mb-4">
                <div>
                  <h3 className="font-black text-slate-950 text-base">Autorisations de livraison</h3>
                  <p className="text-xs text-slate-500 mt-1">Par défaut, le personnel consomme au restaurant. Cochez uniquement les personnes autorisées par le SAF.</p>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                  <select
                    value={badgePrintServiceFilter}
                    onChange={(event) => setBadgePrintServiceFilter(event.target.value)}
                    className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-black text-slate-700 outline-none focus:border-blue-500"
                  >
                    {restaurantDepartments.map(department => (
                      <option key={department} value={department}>{department}</option>
                    ))}
                  </select>
                  <select
                    value={badgePrintFunctionFilter}
                    onChange={(event) => setBadgePrintFunctionFilter(event.target.value)}
                    className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-black text-slate-700 outline-none focus:border-blue-500"
                  >
                    <option>Toutes les fonctions</option>
                    <option>Fonction non renseignée</option>
                    {employeeFunctions.map(item => (
                      <option key={`badge-print-function-${item}`} value={item}>{item}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={handlePrintPersonnelBadges}
                    className="px-3 py-2 rounded-xl bg-slate-950 text-white text-xs font-black hover:bg-slate-800"
                  >
                    Imprimer les badges
                  </button>
                  <span className="px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-black">
                    {badgePrintProfiles.length} badge(s)
                  </span>
                </div>
              </div>
              <div className="mb-4 grid grid-cols-1 gap-3 lg:grid-cols-4">
                <select
                  value={deliveryPermissionServiceFilter}
                  onChange={(event) => setDeliveryPermissionServiceFilter(event.target.value)}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs font-black text-slate-700 outline-none focus:border-blue-500"
                >
                  {restaurantDepartments.map(department => (
                    <option key={`delivery-permission-service-${department}`} value={department}>{department}</option>
                  ))}
                </select>
                <select
                  value={deliveryPermissionFunctionFilter}
                  onChange={(event) => setDeliveryPermissionFunctionFilter(event.target.value)}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs font-black text-slate-700 outline-none focus:border-blue-500"
                >
                  <option>Toutes les fonctions</option>
                  <option>Fonction non renseignée</option>
                  {employeeFunctions.map(item => (
                    <option key={`delivery-permission-function-${item}`} value={item}>{item}</option>
                  ))}
                </select>
                <select
                  value={deliveryPermissionStatusFilter}
                  onChange={(event) => setDeliveryPermissionStatusFilter(event.target.value)}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs font-black text-slate-700 outline-none focus:border-blue-500"
                >
                  <option>Tous les statuts</option>
                  <option>Livraison autorisée</option>
                  <option>Sur place</option>
                  <option>En attente</option>
                  <option>Bloqués</option>
                </select>
                <div className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-3 text-xs font-black text-blue-800">
                  {filteredDeliveryPermissionProfiles.length} agent(s) affiché(s)
                </div>
              </div>
              <div className="max-h-72 overflow-y-auto rounded-2xl border border-slate-100 divide-y divide-slate-100">
                {filteredDeliveryPermissionProfiles.length === 0 ? (
                  <div className="p-4 text-sm text-slate-500">Aucun compte personnel enregistré pour le moment.</div>
                ) : (
                  filteredDeliveryPermissionProfiles.map(profile => (
                    <label key={profile.id} className="flex items-center justify-between gap-4 p-4 hover:bg-slate-50 cursor-pointer">
                      <div>
                        <p className="text-sm font-black text-slate-900">{profile.name}</p>
                        <p className="text-xs text-slate-500">{profile.badgeNumber} · {profile.department} · {profile.email}</p>
                      </div>
                      <input
                        type="checkbox"
                        checked={Boolean(profile.deliveryAllowed)}
                        onChange={(event) => {
                          const checked = event.target.checked;
                          void saveProfileAdministrationChange(
                            profile,
                            { deliveryAllowed: checked },
                            checked ? 'Livraison autorisée' : 'Autorisation retirée',
                            `${profile.name} ${checked ? 'peut maintenant demander la livraison.' : 'devra consommer au restaurant sauf code SAF ponctuel.'}`
                          );
                        }}
                        className="w-5 h-5 accent-blue-600"
                      />
                    </label>
                  ))
                )}
              </div>
            </div>
            <div className="border-t border-slate-100 pt-5">
              <div className="flex items-center justify-between gap-3 mb-4">
                <div>
                  <h3 className="font-black text-slate-950 text-base">Suivi strict des inscriptions et badges</h3>
                  <p className="text-xs text-slate-500 mt-1">Validez les nouvelles inscriptions, bloquez ou débloquez les badges depuis l'administration.</p>
                </div>
                <div className="flex flex-wrap gap-2 text-[10px] font-black">
                  <span className="px-2 py-1 rounded-full bg-amber-50 text-amber-700">{employeeProfiles.filter(profile => (profile.status || 'active') === 'pending').length} en attente</span>
                  <span className="px-2 py-1 rounded-full bg-blue-50 text-blue-700">{employeeProfiles.filter(profile => (profile.status || 'active') === 'active' && !profile.badgeBlocked).length} actifs</span>
                  <span className="px-2 py-1 rounded-full bg-red-50 text-red-700">{employeeProfiles.filter(profile => profile.badgeBlocked || profile.status === 'blocked').length} bloqués</span>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4 rounded-2xl border border-blue-100 bg-blue-50/40 p-3">
                <label className="block text-[11px] font-black uppercase text-slate-500">
                  Recherche agent
                  <input
                    value={strictBadgeSearch}
                    onChange={(event) => setStrictBadgeSearch(event.target.value)}
                    placeholder="Nom, téléphone, badge, e-mail..."
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-bold text-slate-800 outline-none focus:border-blue-500"
                  />
                </label>
                <label className="block text-[11px] font-black uppercase text-slate-500">
                  Filtrer par service
                  <select
                    value={strictBadgeServiceFilter}
                    onChange={(event) => setStrictBadgeServiceFilter(event.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-bold text-slate-800"
                  >
                    {strictBadgeDepartments.map(service => <option key={`strict-service-${service}`} value={service}>{service}</option>)}
                  </select>
                </label>
                <label className="block text-[11px] font-black uppercase text-slate-500">
                  Filtrer par type de compte
                  <select
                    value={strictBadgeRoleFilter}
                    onChange={(event) => setStrictBadgeRoleFilter(event.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-bold text-slate-800"
                  >
                    {strictBadgeRoleOptions.map(role => <option key={`strict-role-${role}`} value={role}>{role}</option>)}
                  </select>
                </label>
                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={() => {
                      setStrictBadgeSearch('');
                      setStrictBadgeServiceFilter('Tous les services');
                      setStrictBadgeRoleFilter('Tous les types');
                    }}
                    className="w-full rounded-xl border border-blue-200 bg-white px-3 py-2.5 text-xs font-black text-blue-800 hover:bg-blue-50"
                  >
                    Réinitialiser les filtres
                  </button>
                </div>
              </div>
              <div className="mb-3 text-[11px] font-black text-slate-500">
                {strictBadgeProfiles.length} compte(s) affiché(s) sur {profiles.length} profil(s) chargés.
              </div>              <div className="max-h-[32rem] overflow-y-auto rounded-2xl border border-slate-100 bg-slate-50/50 p-3 space-y-3">
                {strictDepartmentBadgeGroups.map(group => (
                  <section key={group.department} className="rounded-2xl border border-slate-100 bg-white overflow-hidden">
                    <div className="bg-slate-950 text-white px-4 py-3 flex flex-col md:flex-row md:items-center justify-between gap-2">
                      <div>
                        <h4 className="font-black text-sm">{group.department}</h4>
                        <p className="text-[10px] text-slate-300 mt-0.5">{group.profiles.length} badge(s) inscrit(s)</p>
                      </div>
                      <div className="flex flex-wrap gap-2 text-[10px] font-black">
                        <span className="px-2 py-1 rounded-full bg-blue-500/15 text-blue-200 border border-blue-400/20">{group.active} actifs</span>
                        <span className="px-2 py-1 rounded-full bg-amber-500/15 text-amber-200 border border-amber-400/20">{group.pending} attente</span>
                        <span className="px-2 py-1 rounded-full bg-red-500/15 text-red-200 border border-red-400/20">{group.blocked} bloqués</span>
                      </div>
                    </div>
                    <div className="divide-y divide-slate-100">
                      {group.profiles.map(profile => {
                        const status = profile.badgeBlocked || profile.status === 'blocked'
                          ? 'blocked'
                          : profile.status === 'pending'
                            ? 'pending'
                            : 'active';
                        return (
                          <div key={`registration-${profile.id}`} className="p-4 flex flex-col xl:flex-row xl:items-center justify-between gap-3 hover:bg-slate-50">
                            <div className="grid grid-cols-1 md:grid-cols-[1.15fr_0.9fr_0.9fr] gap-2 flex-1">
                              <div>
                                <div className="flex items-center gap-2">
                                  <p className="text-sm font-black text-slate-900">{profile.name}</p>
                                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${
                                    status === 'active' ? 'bg-blue-50 text-blue-700' :
                                    status === 'pending' ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'
                                  }`}>
                                    {status === 'active' ? 'Actif' : status === 'pending' ? 'En attente' : 'Bloqué'}
                                  </span>
                                </div>
                                <p className="text-xs text-slate-500 mt-1">{profile.email}</p>
                              </div>
                              <div className="text-xs text-slate-600">
                                <p className="font-mono font-black text-slate-900">{profile.badgeNumber}</p>
                                <p>{profile.phone || 'Téléphone non renseigné'}</p>
                              </div>
                              <div className="text-xs text-slate-600">
                                <p>{profile.building || 'Bâtiment non renseigné'}</p>
                                <p>{profile.floor || 'Étage non renseigné'} · {profile.room || 'Bureau non renseigné'}</p>
                              </div>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2 min-w-[18rem]">
                              <label className="text-[10px] font-black uppercase text-slate-500">
                                Type principal
                                <select
                                  value={profile.role || 'employee'}
                                  onChange={(event) => {
                                    const nextRole = event.target.value as UserProfile['role'];
                                    void saveProfileAdministrationChange(
                                      profile,
                                      { role: nextRole },
                                      'Type de compte modifié',
                                      `${profile.name} a maintenant le type principal ${nextRole}.`
                                    );
                                  }}
                                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-2 py-2 text-xs font-bold text-slate-800"
                                >
                                  <option value="employee">Personnel</option>
                                  <option value="admin">Administrateur</option>
                                  <option value="restaurant_admin">Restaurant</option>
                                  <option value="operator">Opérateur scan/recharge</option>
                                  <option value="accountant">Comptable</option>
                                  <option value="delivery">Livreur</option>
                                  <option value="hr">DRH</option>
                                </select>
                              </label>
                              {[
                                ['hrAccess', 'Accès DRH'],
                                ['accountantAccess', 'Accès comptable'],
                                ['deliveryCodeViewer', 'Habilité service'],
                              ].map(([key, label]) => (
                                <label key={`${profile.id}-${key}`} className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-black text-slate-700">
                                  <span>{label}</span>
                                  <input
                                    type="checkbox"
                                    checked={Boolean((profile as unknown as Record<string, unknown>)[key])}
                                    onChange={(event) => {
                                      const checked = event.target.checked;
                                      const patch: Partial<UserProfile> = { [key]: checked } as Partial<UserProfile>;
                                      if (key === 'deliveryCodeViewer') {
                                        patch.deliveryVisibleDepartments = checked
                                          ? (profile.deliveryVisibleDepartments?.length ? profile.deliveryVisibleDepartments : [profile.department])
                                          : [];
                                        patch.deliverySelectionDailyLimit = Math.max(1, profile.deliverySelectionDailyLimit || 1);
                                      }
                                      void saveProfileAdministrationChange(
                                        profile,
                                        patch,
                                        checked ? 'Accès activé' : 'Accès retiré',
                                        `${label} ${checked ? 'activé' : 'retiré'} pour ${profile.name}.`
                                      );
                                    }}
                                    className="h-4 w-4 accent-blue-600"
                                  />
                                </label>
                              ))}
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  const nextAllowed = !profile.deliveryAllowed;
                                  void saveProfileAdministrationChange(
                                    profile,
                                    { deliveryAllowed: nextAllowed },
                                    nextAllowed ? 'Mode livraison' : 'Mode sur place',
                                    `${profile.name} est maintenant en mode ${nextAllowed ? 'livraison' : 'sur place'}.`
                                  );
                                }}
                                className={`px-3 py-2 rounded-xl text-xs font-black border ${profile.deliveryAllowed ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-blue-700 border-blue-100'}`}
                              >
                                {profile.deliveryAllowed ? 'Livraison activée' : 'Sur place'}
                              </button>                              <button
                                type="button"
                                onClick={() => {
                                  const nextForce = !profile.alwaysStaffMealPrice;
                                  void saveProfileAdministrationChange(
                                    profile,
                                    { alwaysStaffMealPrice: nextForce },
                                    nextForce ? 'Tarif agent permanent' : 'Tarif normal rétabli',
                                    nextForce
                                      ? `${profile.name} paiera toutes ses commandes au tarif agent administrable (${Number(institutionConfig?.staffMealPrice || 410).toLocaleString('fr-FR')} FCFA).`
                                      : `${profile.name} revient à la règle normale: première portion au tarif agent, puis prix réel selon les paramètres.`
                                  );
                                }}
                                className={`px-3 py-2 rounded-xl text-xs font-black border ${profile.alwaysStaffMealPrice ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-amber-700 border-amber-100'}`}
                              >
                                {profile.alwaysStaffMealPrice ? `Tout à ${Number(institutionConfig?.staffMealPrice || 410).toLocaleString('fr-FR')} F` : `Tarif agent permanent`}
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  const nextViewer = !profile.deliveryCodeViewer;
                                  void saveProfileAdministrationChange(
                                    profile,
                                    {
                                      deliveryCodeViewer: nextViewer,
                                      deliveryVisibleDepartments: nextViewer
                                        ? (profile.deliveryVisibleDepartments?.length ? profile.deliveryVisibleDepartments : [profile.department])
                                        : [],
                                      deliverySelectionDailyLimit: Math.max(1, profile.deliverySelectionDailyLimit || 1),
                                    },
                                    nextViewer ? 'Habilitation activée' : 'Habilitation retirée',
                                    `${profile.name} ${nextViewer ? 'peut voir et activer la livraison de son service.' : 'ne peut plus activer la livraison service.'}`
                                  );
                                }}
                                className={`px-3 py-2 rounded-xl text-xs font-black border ${profile.deliveryCodeViewer ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-indigo-700 border-indigo-100'}`}
                              >
                                {profile.deliveryCodeViewer ? 'Habilité livraison' : 'Habiliter service'}
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  void saveProfileAdministrationChange(
                                    profile,
                                    {
                                      status: 'active',
                                      badgeBlocked: false,
                                      verificationFlagged: false,
                                      validatedById: activeProfile?.id || '',
                                      validatedByName: activeProfile?.name || 'Administration Ndamatou',
                                      validatedAt: new Date().toISOString(),
                                    },
                                    'Badge validé',
                                    `${profile.name} peut maintenant utiliser son badge.`
                                  );
                                }}
                                className="px-3 py-2 rounded-xl bg-blue-600 text-white text-xs font-black"
                              >
                                Valider
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  const block = status !== 'blocked';
                                  void saveProfileAdministrationChange(
                                    profile,
                                    { status: block ? 'blocked' : 'active', badgeBlocked: block },
                                    block ? 'Badge bloqué' : 'Badge débloqué',
                                    `${profile.name} ${block ? 'ne peut plus utiliser son badge.' : 'peut réutiliser son badge.'}`
                                  );
                                }}
                                className={`px-3 py-2 rounded-xl text-xs font-black ${status === 'blocked' ? 'bg-slate-900 text-white' : 'bg-red-50 text-red-700 border border-red-100'}`}
                              >
                                {status === 'blocked' ? 'Débloquer' : 'Bloquer'}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
            </div>
            <div className="border-t border-slate-100 pt-5">
              <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-3 mb-4">
                <div>
                  <h3 className="font-black text-slate-950 text-base">Vérification historique agent</h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Contrôle lecture seule: recharges, commandes payées, remboursements repérés, solde théorique et écart à vérifier.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={exportBadgeAuditExcel}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-950 text-white text-xs font-black hover:bg-slate-800"
                  >
                    <Download className="w-4 h-4" />
                    Export Excel audit badges
                  </button>
                  <span className="px-3 py-1.5 rounded-full bg-blue-50 text-blue-700 text-xs font-black border border-blue-100">
                    {agentAuditMatches.length} agent(s) affiché(s)
                    {agentAuditServiceFilter !== 'Tous les services' ? ` · ${agentAuditServiceFilter}` : ''}
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-[0.85fr_1.15fr] gap-4">
                <div className="rounded-3xl border border-slate-100 bg-slate-50 p-4 space-y-3">
                  <label className="block text-[11px] font-black uppercase text-slate-500">Filtrer par service</label>
                  <select
                    value={agentAuditServiceFilter}
                    onChange={(event) => {
                      setAgentAuditServiceFilter(event.target.value);
                      setAgentAuditProfileId('');
                    }}
                    className="w-full px-4 py-3 rounded-2xl border border-slate-200 bg-white text-sm font-semibold outline-none focus:border-blue-500"
                  >
                    <option value="Tous les services">Tous les services</option>
                    {agentAuditServices.map(service => (
                      <option key={`audit-service-${service}`} value={service}>
                        {service}
                      </option>
                    ))}
                  </select>
                  <label className="block text-[11px] font-black uppercase text-slate-500">Rechercher un agent</label>
                  <input
                    value={agentAuditSearch}
                    onChange={(event) => {
                      setAgentAuditSearch(event.target.value);
                      setAgentAuditProfileId('');
                    }}
                    placeholder="Nom, badge, téléphone, email ou service"
                    className="w-full px-4 py-3 rounded-2xl border border-slate-200 bg-white text-sm font-semibold outline-none focus:border-blue-500"
                  />
                  <label className="block text-[11px] font-black uppercase text-slate-500">Sélectionner dans la liste</label>
                  <select
                    value={agentAuditProfileId}
                    onChange={(event) => setAgentAuditProfileId(event.target.value)}
                    className="w-full px-4 py-3 rounded-2xl border border-slate-200 bg-white text-sm font-semibold outline-none focus:border-blue-500"
                  >
                    <option value="">Choisir un agent à contrôler</option>
                    {agentAuditMatches.map(profile => (
                      <option key={`audit-${profile.id}`} value={profile.id}>
                        {profile.name} - {profile.badgeNumber} - {profile.phone || 'tél. non renseigné'} - {formatFcfa(profile.walletBalance || 0)}
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] font-semibold text-slate-500">
                    Les écarts sont indicatifs: ils comparent le solde actuel au solde théorique calculé avec les recharges et les commandes enregistrées.
                  </p>
                </div>
                <div className="rounded-3xl border border-slate-100 bg-white p-4">
                  {!selectedAgentAuditProfile || !selectedAgentAudit ? (
                    <div className="py-10 text-center text-slate-400">
                      <Search className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                      <p className="text-sm font-bold">Sélectionnez un agent pour afficher son historique financier.</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div>
                        <h4 className="text-lg font-black text-slate-950">{selectedAgentAuditProfile.name}</h4>
                        <p className="text-xs text-slate-500">
                          {selectedAgentAuditProfile.badgeNumber} · {selectedAgentAuditProfile.department || 'Service non renseigné'} · {selectedAgentAuditProfile.phone || 'Téléphone non renseigné'}
                        </p>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        <div className="rounded-2xl border border-blue-100 bg-blue-50 p-3">
                          <p className="text-[10px] font-black uppercase text-blue-700">Date de création du badge</p>
                          <p className="mt-1 text-sm font-black text-blue-950">
                            {selectedAgentAuditProfile.createdAt
                              ? new Date(selectedAgentAuditProfile.createdAt).toLocaleString('fr-FR')
                              : 'Date non renseignée'}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-blue-100 bg-blue-50 p-3">
                          <p className="text-[10px] font-black uppercase text-blue-700">Validation DRH</p>
                          <p className="mt-1 text-sm font-black text-blue-950">
                            {selectedAgentAuditProfile.validatedByName
                              ? `${selectedAgentAuditProfile.validatedByName}${selectedAgentAuditProfile.validatedAt ? ` · ${new Date(selectedAgentAuditProfile.validatedAt).toLocaleString('fr-FR')}` : ''}`
                              : 'Validation non encore tracée'}
                          </p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-9 gap-2">
                        {[
                          ['Solde actuel', selectedAgentAudit.currentBalance, 'text-blue-700'],
                          ['Solde théorique réel', selectedAgentAudit.realTheoreticalBalance, 'text-indigo-700'],
                          ['Total recharges', selectedAgentAudit.totalRecharges, 'text-blue-700'],
                          ['Dépenses commandes payées', selectedAgentAudit.totalExpenses, 'text-rose-700'],
                          ['Dépenses réellement débitées', selectedAgentAudit.totalDebitedExpenses, 'text-fuchsia-700'],
                          ['Annulées/expirées/remboursées', selectedAgentAudit.totalRefunded, 'text-amber-700'],
                          ['Recrédits réels tracés', selectedAgentAudit.totalRealRefunded, 'text-cyan-700'],
                          ['Écart réel à vérifier', selectedAgentAudit.realGap, selectedAgentAudit.realGap === 0 ? 'text-slate-700' : selectedAgentAudit.realGap > 0 ? 'text-red-700' : 'text-amber-700'],
                          ['Solde théorique historique', selectedAgentAudit.theoreticalBalance, 'text-slate-500'],
                        ].map(([label, amount, color]) => (
                          <div key={String(label)} className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
                            <p className="text-[10px] font-black uppercase text-slate-500">{label}</p>
                            <p className={`mt-1 text-sm font-black ${color}`}>{formatFcfa(Number(amount))}</p>
                          </div>
                        ))}
                      </div>
                      <div className="rounded-2xl border border-blue-100 bg-blue-50 p-3 text-[11px] font-semibold text-blue-900">
                        <strong>Lecture des dépenses:</strong> "Dépenses commandes payées" additionne les commandes ordinaires encore comptabilisées comme payées.
                        "Dépenses réellement débitées" exclut les commandes annulées, expirées ou retournées. Les annulations/expirations sont donc isolées dans le bloc orange pour audit.
                      </div>
                      <div className="rounded-2xl border border-amber-100 bg-amber-50 p-3 text-[11px] font-semibold text-amber-900">
                        <strong>Lecture des remboursements:</strong> "Remboursements repérés" signale les commandes annulées, expirées ou marquées remboursées.
                        Ce bloc est une information d'audit. Un remboursement réellement crédité doit apparaître dans "Recrédits réels tracés" ou dans les corrections/recharges du journal.
                      </div>
                      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                        <div className="rounded-2xl border border-slate-100 overflow-hidden">
                          <div className="bg-slate-950 text-white px-4 py-2 text-xs font-black">
                            Toutes les recharges retrouvées ({selectedAgentAudit.profileTransactions.length})
                          </div>
                          <div className="max-h-72 overflow-y-auto divide-y divide-slate-100">
                            {selectedAgentAudit.profileTransactions.length === 0 ? (
                              <p className="p-4 text-xs text-slate-500">Aucune recharge retrouvée.</p>
                            ) : selectedAgentAudit.profileTransactions.map(transaction => (
                              <div key={transaction.id} className="p-3 text-xs">
                                <p className="font-black text-slate-900">{formatFcfa(transaction.amount)} · {transaction.method === 'wave' ? 'Wave' : transaction.method === 'orange_money' ? 'Orange Money' : 'Espèces'}</p>
                                <p className="text-slate-500">{new Date(transaction.createdAt).toLocaleString('fr-FR')} · {transaction.cashierName || 'Comptable non renseigné'}</p>
                                {(transaction.note || transaction.correctionReason) && (
                                  <p className="mt-1 text-[11px] font-semibold text-slate-500">
                                    {[transaction.note, transaction.correctionReason].filter(Boolean).join(' · ')}
                                  </p>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className="rounded-2xl border border-slate-100 overflow-hidden">
                          <div className="bg-slate-950 text-white px-4 py-2 text-xs font-black">Dernières commandes</div>
                          <div className="max-h-56 overflow-y-auto divide-y divide-slate-100">
                            {selectedAgentAudit.profileOrders.length === 0 ? (
                              <p className="p-4 text-xs text-slate-500">Aucune commande retrouvée.</p>
                            ) : selectedAgentAudit.profileOrders.slice(0, 12).map(order => (
                              <div key={order.id} className="p-3 text-xs">
                                <p className="font-black text-slate-900">{formatFcfa(order.total)} · {order.status} · {order.paymentStatus}</p>
                                <p className="text-slate-500">{new Date(order.createdAt).toLocaleString('fr-FR')} · {order.items.map(item => `${item.quantity} x ${item.meal?.name || 'Repas'}`).join(', ')}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        )}
        {/* ORDERS WORKFLOW BAR (Real-time monitoring panel with manual transitions) */}
        {activeTab === 'orders' && (
          <motion.div
            key="resto-orders-tab"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="grid grid-cols-1 lg:grid-cols-3 gap-6"
          >
            {/* Left Column (2/3 width): Live Active tickets */}
            <div className="lg:col-span-2 space-y-4">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Commandes en direct</h3>
                  <p className="mt-1 text-[10px] font-bold text-slate-500">
                    Liste des commandes encore à traiter. Total période: {currentStats.regularOrders.length} commande(s), dont {activeOrders.length} active(s) et {completedOrders.length} terminée(s).
                  </p>
                </div>
                <span className="text-[10px] font-mono text-slate-400">Période: {restaurantPeriodLabel}</span>
              </div>

              <div className="relative">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={orderSearch}
                  onChange={(event) => setOrderSearch(event.target.value)}
                  placeholder="Rechercher commande: nom, téléphone, badge, service, menu..."
                  className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-11 pr-4 text-sm font-semibold text-slate-900 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                />
                {normalizedOrderSearch && (
                  <p className="mt-2 text-[11px] font-bold text-slate-500">
                    {filteredActiveOrders.length} commande(s) trouvée(s) sur {activeOrders.length} active(s).
                  </p>
                )}
              </div>

              {filteredActiveOrders.length === 0 ? (
                <div className="py-16 bg-white rounded-3xl border border-slate-100 text-center text-slate-400 space-y-2">
                  <ChefHat className="w-12 h-12 stroke-[1.2] text-slate-200 mx-auto" />
                  <p className="font-semibold text-slate-500">
                    {normalizedOrderSearch ? 'Aucune commande ne correspond à la recherche' : 'Aucune commande active'}
                  </p>
                  <p className="text-xs">
                    {normalizedOrderSearch ? 'Effacez la recherche pour revoir toutes les commandes actives.' : "Toutes les commandes d'aujourd'hui ont été livrées ou annulées."}
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {[...pickupOrders, ...deliveryOrders].map((ord, index) => (
                    <React.Fragment key={ord.id}>
                    {(index === 0 || ([...pickupOrders, ...deliveryOrders][index - 1]?.fulfillmentMode || 'pickup') !== (ord.fulfillmentMode || 'pickup')) && (
                      <div className={`px-4 py-2 rounded-2xl text-xs font-black uppercase tracking-wider ${
                        (ord.fulfillmentMode || 'pickup') === 'pickup'
                          ? 'bg-blue-50 text-blue-800 border border-blue-100'
                          : 'bg-blue-50 text-blue-800 border border-blue-100'
                      }`}>
                        {(ord.fulfillmentMode || 'pickup') === 'pickup'
                          ? `Consommation sur place (${pickupOrders.length})`
                          : `Livraison (${deliveryOrders.length})`}
                      </div>
                    )}
                    <div key={ord.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4 relative overflow-hidden">
                      {/* Left accent color based on status */}
                      <span className={`absolute left-0 top-0 bottom-0 w-1.5 ${
                        ord.status === 'pending' ? 'bg-amber-400' :
                        ord.status === 'preparing' ? 'bg-orange-500 animate-pulse' :
                        ord.status === 'delivering' ? 'bg-blue-500' : 'bg-blue-500'
                      }`} />

                      <div className="flex justify-between items-start">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm font-black bg-slate-100 text-slate-900 px-2 py-0.5 rounded">
                              #{ord.id}
                            </span>
                            <span className="text-xs text-slate-500 font-semibold">{ord.employeeName} ({ord.badgeNumber})</span>
                          </div>
                          <p className="text-[11px] text-gray-500 mt-1 flex items-center gap-1 font-mono">
                            <MapPin className="w-3 h-3 text-blue-600" />
                            {ord.fulfillmentMode === 'pickup'
                              ? 'Consommation sur place au restaurant'
                              : `${ord.building} — Étage ${ord.floor} — Spéc. ${ord.room}`}
                          </p>
                          <p className="text-[11px] text-slate-600 mt-1 font-bold">
                            Service: {ord.department || 'Service non renseigné'}
                          </p>
                          <p className="text-[11px] text-slate-500 mt-1 font-mono">
                            Commande faite le {new Date(ord.createdAt).toLocaleDateString('fr-FR')} à {new Date(ord.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                          </p>
                          {getClientTimeWarning(ord) && (
                            <p className="mt-1 rounded-lg bg-amber-50 px-2 py-1 text-[10px] font-black text-amber-800">
                              {getClientTimeWarning(ord)}
                            </p>
                          )}
                        </div>

                        <div className="text-right">
                          <span className="font-mono text-sm font-extrabold text-slate-900 block">{ord.total.toLocaleString()} F</span>
                          <span className="text-[10px] text-gray-400 block mt-1 font-mono">
                            {new Date(ord.createdAt).toLocaleTimeString('fr-FR', {hour: '2-digit', minute:'2-digit'})}
                          </span>
                        </div>
                      </div>

                      {/* Items listed */}
                      <div className="bg-slate-50 p-3 rounded-xl space-y-1.5">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Ingrédients / Portions commandées :</p>
                        {ord.items.map((it, i) => (
                          <div key={i} className="flex justify-between font-mono text-xs text-slate-800">
                            <span>{it.meal.name}</span>
                            <span className="font-bold text-blue-800">x{it.quantity}</span>
                          </div>
                        ))}
                        {ord.notes && (
                          <div className="text-[11px] bg-red-50 text-red-700 p-2 rounded-lg mt-2 font-mono">
                            Note employé : "{ord.notes}"
                          </div>
                        )}
                      </div>

                      {/* Interactive Stage Advancing buttons */}
                      <div className="pt-3 border-t border-slate-100 flex justify-between items-center flex-wrap gap-2 text-xs">
                        {/* Summary of payment */}
                        <div className="flex items-center gap-2 text-[11px]">
                          <span className="text-slate-400 font-bold">Règlement :</span>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            ord.paymentMethod === 'badge_card' ? 'bg-indigo-50 text-indigo-700' :
                            ord.paymentMethod === 'online_card' ? 'bg-blue-50 text-blue-700' : 'bg-slate-50 text-slate-700'
                          }`}>
                            {ord.paymentMethod === 'badge_card' && 'Badge'}
                            {ord.paymentMethod === 'online_card' && 'Mobile Wave/OM'}
                            {ord.paymentMethod === 'cash' && 'Espèces'}
                          </span>
                          <span className={`font-bold ${ord.paymentStatus === 'paid' ? 'text-blue-600' : 'text-amber-600'}`}>
                            ({ord.paymentStatus === 'paid' ? 'Payé' : 'À percevoir'})
                          </span>
                        </div>

                        {/* Transition controllers */}
                        <div className="flex gap-2">
                          {(ord.fulfillmentMode || 'pickup') === 'pickup' && (
                            <button
                              id={`btn-validate-pickup-${ord.id}`}
                              onClick={async () => {
                                const profile = employeeProfiles.find(item => item.id === ord.employeeId);
                                if (profile) {
                                  await printRestaurantTicket(ord, profile);
                                }
                                const updated = await onUpdateOrderStatus(ord.id, 'delivered');
                                if (updated !== false && profile) {
                                  await onSetRestaurantPresence?.(profile, true);
                                }
                              }}
                              className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2 rounded-xl transition flex items-center gap-1.5 cursor-pointer shadow-sm shadow-blue-500/10"
                            >
                              <CheckCircle className="w-4 h-4" /> Valider commande
                            </button>
                          )}

                          {ord.fulfillmentMode === 'delivery' && ord.status === 'pending' && (
                            <button
                              id={`btn-accept-${ord.id}`}
                              onClick={() => {
                                onUpdateOrderStatus(ord.id, 'delivering');
                              }}
                              className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2 rounded-xl transition flex items-center gap-1.5 cursor-pointer shadow-sm shadow-blue-500/10"
                            >
                              <Truck className="w-4 h-4" /> Remettre au livreur
                            </button>
                          )}
                          
                          {ord.fulfillmentMode === 'delivery' && ord.status === 'preparing' && (
                            <button
                              id={`btn-dispatch-${ord.id}`}
                              onClick={() => {
                                onUpdateOrderStatus(ord.id, 'delivering');
                              }}
                              className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2 rounded-xl transition flex items-center gap-1.5 cursor-pointer shadow-sm shadow-blue-500/10"
                            >
                              <Truck className="w-4 h-4" /> Dispatcher au Livreur
                            </button>
                          )}

                          {ord.fulfillmentMode === 'delivery' && ord.status === 'delivering' && (
                            <button
                              id={`btn-complete-${ord.id}`}
                              onClick={() => {
                                onUpdateOrderStatus(ord.id, 'delivered');
                              }}
                              className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2 rounded-xl transition flex items-center gap-1.5 cursor-pointer shadow-sm shadow-blue-500/10"
                            >
                              <CheckCircle className="w-4 h-4" /> Confirmer Livré
                            </button>
                          )}

                          <button
                            id={`btn-cancel-${ord.id}`}
                            onClick={() => {
                              const ok = window.confirm(
                                `Annuler et recréditer cette commande ?\n\n` +
                                `Agent : ${ord.employeeName}\n` +
                                `Ticket : ${ord.id}\n` +
                                `Montant à recréditer : ${Number(ord.total || 0).toLocaleString('fr-FR')} FCFA\n\n` +
                                `Cette action doit être réservée aux erreurs constatées par le restaurant, l'opérateur ou l'administrateur. Elle sera tracée dans l'historique.`
                              );
                              if (!ok) return;
                              onUpdateOrderStatus(ord.id, 'cancelled');
                            }}
                            className="bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-100 font-bold px-3 py-2 rounded-xl transition cursor-pointer"
                          >
                            Annuler
                          </button>
                        </div>
                      </div>
                    </div>
                    </React.Fragment>
                  ))}
                </div>
              )}
            </div>

            {/* Right Column (1/3 width): Historical archives for today */}
            <div className="space-y-4">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">Précédemment Traitées / Terminées</h3>
                <p className="mt-1 text-[10px] font-bold text-slate-500">Période restaurant: {restaurantPeriodLabel}</p>
              </div>
              <div className="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm space-y-4 max-h-[580px] overflow-y-auto">
                {completedOrders.length === 0 ? (
                  <p className="text-center py-8 text-xs text-gray-400">Aucun ticket archivé aujourd'hui.</p>
                ) : (
                  completedOrders.map(ord => (
                    <div key={ord.id} className="text-xs pb-3 border-b border-slate-150 last:border-0 last:pb-0 space-y-2">
                      <div className="flex justify-between items-start">
                        <span className="font-mono font-bold text-slate-700">Ticket #{ord.id}</span>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded font-extrabold ${ord.status === 'delivered' ? 'bg-blue-50 text-blue-800' : 'bg-red-50 text-red-800'}`}>
                          {ord.status === 'delivered' ? 'LIVRÉ' : 'ANNULÉ'}
                        </span>
                      </div>
                      <div className="text-slate-500">
                        <p className="font-semibold text-slate-800">{ord.employeeName}</p>
                        <p className="text-[10px] font-bold text-slate-600">Service: {ord.department || 'Service non renseigné'}</p>
                        <p className="text-[10px] font-mono text-slate-500">
                          Commande faite le {new Date(ord.createdAt).toLocaleDateString('fr-FR')} à {new Date(ord.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                        {getClientTimeWarning(ord) && (
                          <p className="mt-1 rounded-lg bg-amber-50 px-2 py-1 text-[10px] font-black text-amber-800">
                            {getClientTimeWarning(ord)}
                          </p>
                        )}
                        <p className="text-[10px] font-mono text-slate-500">
                          {ord.deliveryTime
                            ? `Remise/traitement le ${new Date(ord.deliveryTime).toLocaleDateString('fr-FR')} à ${new Date(ord.deliveryTime).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`
                            : 'Remise non tracée précisément'}
                        </p>
                        <p className="text-[10px] font-bold text-blue-700">
                          Mode: {ord.deliveredVia || (ord.fulfillmentMode === 'delivery' ? 'livraison' : 'restaurant')} · Par: {ord.deliveredByName || 'non tracé'}
                        </p>
                        <p className="text-[10px] truncate">{ord.items.map(it => `${it.meal.name} (x${it.quantity})`).join(', ')}</p>
                      </div>
                      <p className="text-[10px] font-mono font-extrabold text-slate-900 text-end">Total : {ord.total} FCFA</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </motion.div>
        )}

        {activeTab === 'delivery' && (
          <motion.div
            key="resto-delivery-tab"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="space-y-5"
          >
            <DeliveryView
              orders={orders}
              profiles={profiles}
              onUpdateOrderStatus={onUpdateOrderStatus}
              onChangeOrderToDelivery={onChangeOrderToDelivery}
              activeProfile={{
                name: activeProfile?.name || 'Restaurant Ndamatou',
                badgeNumber: activeProfile?.badgeNumber || ''
              }}
              deliveryAuthorizationMode={institutionConfig?.deliveryAuthorizationMode || 'codes'}
              canPrintThermalLabels
              deliveryLabelWidthMm={Number(institutionConfig?.deliveryLabelWidthMm || 100)}
              deliveryLabelHeightMm={Number(institutionConfig?.deliveryLabelHeightMm || 70)}
            />
          </motion.div>
        )}

        {activeTab === 'topup' && (
          <motion.div
            key="resto-topup-tab"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="grid grid-cols-1 lg:grid-cols-[1fr_1.2fr] gap-5"
          >
            <div className="lg:col-span-2"><SharedFinanceReport orders={currentStats.regularOrders} transactions={cashTransactions.filter(item => isWithinDateRange(item.createdAt, restaurantTodayRange.start, restaurantTodayRange.end))} badgeReserve={currentStats.totalBadgeBalance} period={restaurantPeriodLabel} /></div>
            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5 space-y-4">
              <div>
                <h3 className="font-black text-slate-950 text-base">Recharge badge au restaurant</h3>
                <p className="text-xs text-slate-500 mt-1">Rechercher par nom, téléphone, e-mail ou numéro de badge puis créditer le badge.</p>
              </div>
              <div>
                <label className="block font-bold uppercase text-slate-500 mb-1 text-xs">Filtrer par service</label>
                <select
                  value={topupServiceFilter}
                  onChange={(event) => {
                    setTopupServiceFilter(event.target.value);
                    setTopupSelectedProfileId('');
                  }}
                  className="w-full px-4 py-3 rounded-2xl border border-slate-200 bg-slate-50 text-sm font-semibold outline-none focus:bg-white focus:border-blue-500"
                >
                  {restaurantDepartments.map(department => (
                    <option key={department} value={department}>{department}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-bold uppercase text-slate-500 mb-1 text-xs">Personnel du service</label>
                <select
                  value={topupSelectedProfileId}
                  onChange={(event) => setTopupSelectedProfileId(event.target.value)}
                  className="w-full px-4 py-3 rounded-2xl border border-slate-200 bg-slate-50 text-sm font-semibold outline-none focus:bg-white focus:border-blue-500"
                >
                  <option value="">
                    {topupMatches.length === 0
                      ? 'Aucun agent trouvé'
                      : `Sélectionner un agent (${topupMatches.length})`}
                  </option>
                  {topupMatches.map(profile => (
                    <option key={`topup-select-${profile.id}`} value={profile.id}>
                      {profile.name} - {profile.badgeNumber} - {profile.phone || 'téléphone non renseigné'} - {(profile.walletBalance || 0).toLocaleString('fr-FR')} F
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[11px] font-semibold text-slate-500">
                  Après choix du service, déroulez cette liste pour sélectionner directement l’agent à recharger.
                </p>
              </div>
              <div>
                <label className="block font-bold uppercase text-slate-500 mb-1 text-xs">Recherche personnel</label>
                <input
                  value={topupSearch}
                  onChange={(event) => {
                    setTopupSearch(event.target.value);
                    setTopupSelectedProfileId('');
                  }}
                  placeholder="Nom, téléphone, badge ou service"
                  className="w-full px-4 py-3 rounded-2xl border border-slate-200 bg-slate-50 text-sm font-semibold outline-none focus:bg-white focus:border-blue-500"
                />
              </div>
              {selectedTopupProfile && (
                <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm">
                  <p className="font-black text-slate-900">{selectedTopupProfile.name}</p>
                  <p className="text-xs text-slate-600 mt-1">{selectedTopupProfile.badgeNumber} · {selectedTopupProfile.phone || 'Téléphone non renseigné'}</p>
                  <p className="text-xs text-slate-600">{selectedTopupProfile.department || 'Service non renseigné'}</p>
                  <p className="text-lg font-black text-blue-700 mt-2">Solde actuel : {(selectedTopupProfile.walletBalance || 0).toLocaleString('fr-FR')} FCFA</p>
                </div>
              )}
              <div>
                <label className="block font-bold uppercase text-slate-500 mb-1 text-xs">Moyen de paiement confirmé</label>
                <select value={topupMethod} onChange={event => setTopupMethod(event.target.value as CashTransaction['method'])} disabled={topupSubmitting} className="w-full mb-3 px-4 py-3 rounded-2xl border border-slate-200 bg-slate-50 text-sm font-bold">
                  <option value="cash">Espèces — sans frais</option>
                  <option value="wave">Wave — partage des frais</option>
                  <option value="orange_money">Orange Money — partage des frais</option>
                </select>
                <label className="block font-bold uppercase text-slate-500 mb-1 text-xs">Montant réellement versé par l'agent</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  disabled={topupSubmitting}
                  inputMode="numeric"
                  value={topupAmount}
                  onChange={(event) => setTopupAmount(event.target.value)}
                  placeholder="Exemple : 5000"
                  className="w-full px-4 py-3 rounded-2xl border border-slate-200 bg-slate-50 text-sm font-black outline-none focus:bg-white focus:border-blue-500"
                />
                {topupQuote && <div className="mt-3 rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs space-y-1">
                  <p className="font-black">Crédit badge : {topupQuote.amount.toLocaleString('fr-FR')} F</p>
                  <p>Contribution agent : {topupQuote.waveFeeAmount.toLocaleString('fr-FR')} F</p>
                  <p>Frais Bictorys/opérateur (2 %) : {formatAccountingCents(topupQuote.processorFeeCents)}</p>
                  <p>Net calculé sur le compte : {formatAccountingCents(topupQuote.netReceivedCents)}</p>
                  <p>Aucun frais supplémentaire lors du débit du repas. Arrondi du crédit au franc le plus proche.</p>
                </div>}
              </div>
              <button
                type="button"
                onClick={handleRestaurantTopup}
                disabled={topupSubmitting}
                className="w-full px-5 py-3 rounded-2xl bg-blue-600 text-white text-sm font-black hover:bg-blue-700"
              >
                {topupSubmitting ? 'Enregistrement…' : 'Confirmer le versement et créditer'}
              </button>
              <button
                type="button"
                onClick={handlePrintTopupReport}
                className="w-full px-5 py-3 rounded-2xl bg-slate-950 text-white text-sm font-black hover:bg-slate-800 flex items-center justify-center gap-2"
              >
                <Printer className="w-4 h-4" />
                Imprimer rapport encaissement
              </button>
              <div className="rounded-3xl border border-amber-100 bg-amber-50 p-4 space-y-3">
                <div>
                  <h4 className="font-black text-amber-950 text-sm">Modifier solde badge</h4>
                  <p className="text-[11px] text-amber-800 mt-1">À utiliser seulement pour corriger une erreur constatée. Une confirmation est demandée.</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setBalanceAdjustmentMode('set')}
                    className={`px-3 py-2 rounded-xl text-xs font-black border ${balanceAdjustmentMode === 'set' ? 'bg-slate-950 text-white border-slate-950' : 'bg-white text-slate-700 border-slate-200'}`}
                  >
                    Solde final
                  </button>
                  <button
                    type="button"
                    onClick={() => setBalanceAdjustmentMode('delta')}
                    className={`px-3 py-2 rounded-xl text-xs font-black border ${balanceAdjustmentMode === 'delta' ? 'bg-slate-950 text-white border-slate-950' : 'bg-white text-slate-700 border-slate-200'}`}
                  >
                    Ajouter écart
                  </button>
                </div>
                <input
                  type="number"
                  min="0"
                  inputMode="numeric"
                  value={balanceAdjustmentAmount}
                  onChange={(event) => setBalanceAdjustmentAmount(event.target.value)}
                  placeholder={balanceAdjustmentMode === 'set' ? 'Nouveau solde exact' : 'Montant à ajouter'}
                  className="w-full px-4 py-3 rounded-2xl border border-amber-200 bg-white text-sm font-black outline-none focus:border-amber-500"
                />
                <input
                  value={balanceAdjustmentReason}
                  onChange={(event) => setBalanceAdjustmentReason(event.target.value)}
                  placeholder="Motif obligatoire conseillé"
                  className="w-full px-4 py-3 rounded-2xl border border-amber-200 bg-white text-sm font-semibold outline-none focus:border-amber-500"
                />
                <button
                  type="button"
                  onClick={handleRestaurantBalanceAdjustment}
                  className="w-full px-5 py-3 rounded-2xl bg-amber-600 text-white text-sm font-black hover:bg-amber-700"
                >
                  Modifier le solde
                </button>
              </div>
            </div>
            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5 space-y-3">
              <h4 className="font-black text-slate-950 text-sm">Résultats</h4>
              {topupMatches.length === 0 ? (
                <p className="text-sm text-slate-500 py-8 text-center">Tapez un nom, téléphone ou numéro badge pour afficher les agents.</p>
              ) : (
                <div className="max-h-[28rem] overflow-y-auto divide-y divide-slate-100">
                  <p className="px-4 pb-3 text-[11px] font-bold text-slate-500">
                    Vous pouvez aussi sélectionner l’agent ici. Le choix apparaît ensuite dans le bloc de recharge.
                  </p>
                  {topupMatches.map(profile => (
                    <button
                      key={`topup-${profile.id}`}
                      type="button"
                      onClick={() => setTopupSelectedProfileId(profile.id)}
                      className={`w-full text-left p-4 hover:bg-slate-50 ${selectedTopupProfile?.id === profile.id ? 'bg-blue-50' : ''}`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-black text-slate-900 text-sm">{profile.name}</p>
                          <p className="text-xs text-slate-500">{profile.badgeNumber} · {profile.department || 'Service non renseigné'}</p>
                          <p className="text-[11px] font-semibold text-slate-400">Tél: {profile.phone || 'Non renseigné'}</p>
                        </div>
                        <span className="text-xs font-black text-blue-700">{(profile.walletBalance || 0).toLocaleString('fr-FR')} F</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {selectedTopupProfile && (
                <div className="mt-4 rounded-3xl border border-blue-100 bg-blue-50/60 p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h4 className="font-black text-blue-950 text-sm">Historique de recharge de l’agent</h4>
                      <p className="mt-1 text-xs font-semibold text-blue-800">
                        {selectedTopupProfile.name} · {selectedTopupProfile.badgeNumber} · {selectedTopupProfile.department || 'Service non renseigné'}
                      </p>
                    </div>
                    <span className="rounded-full bg-white px-3 py-1 text-[11px] font-black text-blue-700">
                      {selectedTopupTransactions.length} recharge(s)
                    </span>
                  </div>
                  {selectedTopupTransactions.length === 0 ? (
                    <p className="mt-4 rounded-2xl bg-white/80 px-4 py-5 text-center text-sm font-semibold text-slate-500">
                      Aucune recharge retrouvée pour cet agent.
                    </p>
                  ) : (
                    <div className="mt-4 max-h-[24rem] overflow-y-auto divide-y divide-blue-100 rounded-2xl border border-blue-100 bg-white">
                      {selectedTopupTransactions.map(transaction => (
                        <div key={`selected-topup-history-${transaction.id}`} className="p-4 text-xs">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="font-black text-slate-950">
                                {Number(transaction.amount || 0).toLocaleString('fr-FR')} FCFA
                              </p>
                              <p className="mt-1 text-slate-500">
                                Mode: <strong className="text-slate-800">{transaction.method === 'wave' ? 'Wave' : transaction.method === 'orange_money' ? 'Orange Money' : 'Espèces'}</strong>
                              </p>
                              <p className="mt-1 text-slate-500">
                                Opérateur: <strong className="text-slate-800">{getTransactionCashierName(transaction)}</strong>
                              </p>
                              {transaction.note && (
                                <p className="mt-2 rounded-xl bg-slate-50 px-3 py-2 text-[11px] font-semibold text-slate-600">
                                  Note: {transaction.note}
                                </p>
                              )}
                              {transaction.correctionReason && (
                                <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-800">
                                  Correction: {transaction.correctionReason}
                                </p>
                              )}
                            </div>
                            <div className="shrink-0 text-right">
                              <p className="font-black text-slate-900">{formatTransactionDate(transaction.createdAt)}</p>
                              <p className="mt-1 text-[11px] font-bold text-slate-500">{formatTransactionTime(transaction.createdAt)}</p>
                              <p className="mt-2 max-w-[9rem] truncate font-mono text-[10px] text-slate-400" title={transaction.id}>
                                {transaction.id}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <div className="border-t border-slate-100 pt-4">
                <h4 className="font-black text-slate-950 text-sm">Historique récent des recharges</h4>
                {recentTopupTransactions.length === 0 ? (
                  <p className="text-sm text-slate-500 py-6 text-center">Aucune recharge enregistrée.</p>
                ) : (
                  <div className="mt-3 max-h-[22rem] overflow-y-auto divide-y divide-slate-100 rounded-2xl border border-slate-100">
                    {recentTopupTransactions.map(transaction => {
                      const profile = profileLookup.get(transaction.employeeId);
                      const cashierName = getTransactionCashierName(transaction);
                      return (
                        <div key={`recent-topup-${transaction.id}`} className="p-3 text-xs">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-black text-slate-900">{transaction.employeeName}</p>
                              <p className="text-slate-500">{transaction.badgeNumber} · {profile?.department || 'Service non renseigné'}</p>
                              <p className="text-slate-500">Tél: {profile?.phone || 'Non renseigné'}</p>
                              <div className="mt-2 grid gap-1 rounded-xl bg-slate-50 px-3 py-2 text-[11px] font-bold text-slate-600 sm:grid-cols-3">
                                <span>Opérateur: <strong className="text-slate-900">{cashierName}</strong></span>
                                <span>Date: <strong className="text-slate-900">{formatTransactionDate(transaction.createdAt)}</strong></span>
                                <span>Heure: <strong className="text-slate-900">{formatTransactionTime(transaction.createdAt)}</strong></span>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="font-black text-blue-700">Crédit : {Number(transaction.amount || 0).toLocaleString('fr-FR')} F</p>
                              {transaction.grossAmount !== undefined && <p className="text-[10px] text-slate-600">Versé : {transaction.grossAmount} F · {transaction.method === 'orange_money' ? 'Orange Money' : 'Wave'}<br />Frais calculés : {formatAccountingCents(transaction.processorFeeCents || 0)} · Net calculé : {formatAccountingCents(transaction.netReceivedCents || 0)}</p>}
                              <p className="text-[10px] font-bold text-slate-500">Solde: {(profile?.walletBalance || 0).toLocaleString('fr-FR')} F</p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {activeTab === 'scan' && (
          <motion.div
            key="resto-scan-tab"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="grid grid-cols-1 lg:grid-cols-3 gap-6"
          >
            {isLastRestaurantScanPinned && lastRestaurantScanSummary && (
              <div className={`fixed inset-0 z-[75] flex items-stretch justify-center text-white ${
                lastRestaurantScanSummary.orders.length > 0 ? 'bg-blue-700' : 'bg-red-700'
              }`}>
                <div className="flex h-full w-full max-w-3xl flex-col overflow-y-auto p-5 sm:p-8">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="inline-flex rounded-full bg-white/15 px-4 py-2 text-[11px] font-black uppercase tracking-widest">
                        {lastRestaurantScanSummary.orders.length > 0
                          ? lastRestaurantScanSummary.status === 'delivered' ? 'Commande validée' : 'Commande active'
                          : 'Aucune commande active'}
                      </p>
                      <h2 className="mt-5 text-4xl font-black uppercase leading-tight sm:text-6xl">
                        {lastRestaurantScanSummary.orders.length > 0 ? 'PLAT AUTORISÉ' : 'COMMANDE ABSENTE'}
                      </h2>
                      <p className={`mt-4 text-2xl font-black ${lastRestaurantScanSummary.orders.length > 0 ? 'text-blue-50' : 'text-red-50'}`}>
                        {lastRestaurantScanSummary.profile.name}
                      </p>
                      <p className={`mt-2 text-sm font-bold ${lastRestaurantScanSummary.orders.length > 0 ? 'text-blue-50' : 'text-red-50'}`}>
                        {lastRestaurantScanSummary.profile.department || 'Service non renseigné'} · {lastRestaurantScanSummary.profile.phone || 'Téléphone non renseigné'}
                      </p>
                      <p className={`mt-1 font-mono text-sm font-black ${lastRestaurantScanSummary.orders.length > 0 ? 'text-blue-100' : 'text-red-100'}`}>
                        Badge: {lastRestaurantScanSummary.profile.badgeNumber}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={closeScanResultAndPrepareNext}
                      className={`rounded-2xl bg-white px-4 py-3 text-xs font-black shadow-xl ${
                        lastRestaurantScanSummary.orders.length > 0 ? 'text-blue-800 hover:bg-blue-50' : 'text-red-800 hover:bg-red-50'
                      }`}
                    >
                      Fermer
                    </button>
                  </div>

                  <div className="mt-6 grid grid-cols-1 gap-3">
                    {lastRestaurantScanSummary.orders.length > 0 ? lastRestaurantScanSummary.orders.map((order, orderIndex) => (
                      <div key={`scan-fullscreen-${order.id}`} className="rounded-3xl border-2 border-white/30 bg-white/15 p-4 shadow-xl">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-blue-100">
                              Commande {orderIndex + 1}
                            </p>
                            <p className="mt-1 break-all font-mono text-lg font-black">#{order.id}</p>
                          </div>
                          <p className="rounded-2xl bg-white px-4 py-2 font-mono text-lg font-black text-blue-800">
                            {Number(order.total || 0).toLocaleString('fr-FR')} FCFA
                          </p>
                        </div>
                        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                          {order.items.map((item, index) => (
                            <div key={`scan-fullscreen-${order.id}-${item.meal?.id || index}`} className="flex items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3 text-blue-950">
                              <span className="text-base font-black">{item.meal?.name || 'Repas'}</span>
                              <span className="font-mono text-xl font-black">x{item.quantity}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )) : (
                      <div className="rounded-3xl border-2 border-white/30 bg-white/15 p-5 shadow-xl">
                        <p className="text-[11px] font-black uppercase tracking-widest text-red-100">Repas non autorisé</p>
                        <p className="mt-2 text-2xl font-black">Cet agent n'a aucune commande active à remettre.</p>
                        <p className="mt-3 text-sm font-bold text-red-50">
                          Ne pas servir de repas sur ce scan. Vérifiez son historique ou demandez-lui de confirmer sa commande si nécessaire.
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="mt-auto pt-6">
                    <div className="rounded-3xl bg-white p-4 text-slate-950 shadow-2xl">
                      <p className={`text-[11px] font-black uppercase tracking-widest ${lastRestaurantScanSummary.orders.length > 0 ? 'text-blue-700' : 'text-red-700'}`}>Contrôle restaurant</p>
                      <p className="mt-1 text-sm font-bold">
                        Scan effectué à {new Date(lastRestaurantScanSummary.processedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}. {lastRestaurantScanSummary.orders.length > 0 ? 'Vérifiez le nom, le service et le détail du menu avant remise.' : 'Badge reconnu, mais aucune commande active n’est disponible.'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
            <div className="lg:col-span-1 bg-white rounded-3xl border border-slate-100 shadow-sm p-6 space-y-5">
              <div className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-700 flex items-center justify-center">
                <ScanLine className="w-7 h-7" />
              </div>
              <div>
                <h3 className="font-black text-slate-950 text-lg">Scanner le badge QR</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Branchez le lecteur QR sur le PC. Cliquez dans le champ, scannez le QR téléphone du badge, puis le lecteur valide automatiquement.
                </p>
              </div>
              <form onSubmit={handleBadgeScanSubmit} className="space-y-3">
                <input
                  ref={badgeScanInputRef}
                  autoFocus
                  value={badgeScanInput}
                  onFocus={() => setScanReady(true)}
                  onBlur={() => setScanReady(false)}
                  onChange={(event) => setBadgeScanInput(event.target.value)}
                  placeholder="Scanner ou saisir le code badge"
                  className={`w-full px-4 py-4 rounded-2xl border text-sm font-mono outline-none focus:ring-2 focus:ring-blue-500 ${
                    scanReady ? 'border-blue-400 bg-blue-50' : 'border-slate-200 bg-slate-50'
                  }`}
                />
                <button
                  type="button"
                  onClick={startHardwareScan}
                  className={`w-full text-sm font-black py-3 rounded-2xl flex items-center justify-center gap-2 ${
                    scanReady
                      ? 'bg-blue-100 text-blue-800 border border-blue-300'
                      : 'bg-white text-slate-800 border border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <ScanLine className="w-4 h-4" />
                  {scanReady ? 'Lecteur prêt - scannez le badge' : 'Démarrer scan'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCameraScannerMessage('');
                    setIsCameraScannerOpen(true);
                  }}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-black py-3 rounded-2xl flex items-center justify-center gap-2"
                >
                  <Camera className="w-4 h-4" />
                  Scanner avec caméra
                </button>
                <button
                  type="submit"
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-black py-3 rounded-2xl flex items-center justify-center gap-2"
                >
                  <QrCode className="w-4 h-4" />
                  Vérifier le badge
                </button>
                <button
                  type="button"
                  onClick={handleTestPrinter}
                  className="w-full bg-slate-950 hover:bg-slate-800 text-white text-sm font-black py-3 rounded-2xl flex items-center justify-center gap-2"
                >
                  <Printer className="w-4 h-4" />
                  Test imprimante ticket
                </button>
              </form>
              <div className="rounded-2xl bg-slate-50 border border-slate-100 p-4 text-xs text-slate-600 space-y-2">
                <p className="font-black text-slate-900">Matériel recommandé</p>
                <p>Lecteur QR 2D USB filaire, mode clavier HID, avec support de table. C'est le moins cher et le plus stable au comptoir.</p>
                <p className="font-mono text-[11px] text-slate-500">Prix indicatif: 15 000 à 35 000 FCFA selon marque et disponibilité.</p>
              </div>
            </div>

            <div className="lg:col-span-2 space-y-4">
              <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5 grid grid-cols-1 md:grid-cols-[180px_1fr] gap-5 items-center">
                <div className="bg-slate-50 border border-slate-100 rounded-2xl p-3">
                  <img src={todayRestaurantQrUrl} alt="QR restaurant du jour" className="w-full aspect-square object-contain bg-white rounded-xl" />
                </div>
                <div className="space-y-3">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-wider text-blue-700">QR restaurant du jour</p>
                    <h3 className="text-xl font-black text-slate-950">À afficher au comptoir</h3>
                    <p className="text-xs text-slate-500 mt-1">
                      Le personnel scanne ce QR après avoir commandé. Si la caméra ne lit pas, il saisit le code court affiché dessous.
                    </p>
                  </div>
                  <div className="font-mono text-sm font-black bg-slate-100 rounded-xl px-3 py-2 inline-block">{todayRestaurantQrPayload}</div>
                  <button
                    type="button"
                    onClick={handlePrintDailyRestaurantQr}
                    className="block bg-slate-950 hover:bg-slate-800 text-white font-black px-4 py-3 rounded-2xl text-xs"
                  >
                    Imprimer QR du jour
                  </button>
                </div>
              </div>

              <div className="bg-white rounded-3xl border border-blue-100 shadow-sm p-5 grid grid-cols-1 md:grid-cols-[180px_1fr] gap-5 items-center">
                <div className="bg-blue-50 border border-blue-100 rounded-2xl p-3">
                  <img src={todayRestaurantExitQrUrl} alt="QR sortie restaurant" className="w-full aspect-square object-contain bg-white rounded-xl" />
                </div>
                <div className="space-y-3">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-wider text-blue-700">QR sortie restaurant</p>
                    <h3 className="text-xl font-black text-slate-950">À afficher sur les tables ou à la sortie</h3>
                    <p className="text-xs text-slate-500 mt-1">
                      Le personnel scanne ce QR après le repas pour libérer une place. Le code simple à retenir est SORTIE.
                    </p>
                  </div>
                  <div className="font-mono text-sm font-black bg-blue-50 text-blue-800 rounded-xl px-3 py-2 inline-block">{todayRestaurantExitQrPayload}</div>
                  <button
                    type="button"
                    onClick={handlePrintRestaurantExitQr}
                    className="block bg-blue-600 hover:bg-blue-700 text-white font-black px-4 py-3 rounded-2xl text-xs"
                  >
                    Imprimer QR sortie
                  </button>
                </div>
              </div>

              {isLastRestaurantScanPinned && lastRestaurantScanSummary && (
                <div className="rounded-3xl border-2 border-blue-300 bg-blue-50 p-5 shadow-sm">
                  <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-wider text-blue-700">Dernier scan conservé à l'écran</p>
                      <h3 className="text-2xl font-black text-slate-950">{lastRestaurantScanSummary.profile.name}</h3>
                      <p className="mt-2 text-xs font-bold text-slate-600">
                        {lastRestaurantScanSummary.profile.department || 'Service non renseigné'} · {lastRestaurantScanSummary.profile.phone || 'Téléphone non renseigné'} · {lastRestaurantScanSummary.profile.badgeNumber}
                      </p>
                      <p className="mt-1 text-[11px] font-bold text-blue-700">
                        {new Date(lastRestaurantScanSummary.processedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} · {lastRestaurantScanSummary.status === 'delivered' ? 'Commande validée/remise' : lastRestaurantScanSummary.status === 'active' ? 'Commande active' : 'Aucune commande active'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={closeScanResultAndPrepareNext}
                      className="self-start rounded-2xl bg-white px-4 py-2 text-xs font-black text-slate-700 border border-blue-200 hover:bg-blue-100"
                    >
                      Fermer
                    </button>
                  </div>
                  {lastRestaurantScanSummary.orders.length > 0 ? (
                    <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                      {lastRestaurantScanSummary.orders.map(order => (
                        <div key={`pinned-${order.id}`} className="rounded-2xl bg-white border border-blue-100 p-4">
                          <p className="font-mono text-xs font-black text-slate-500">#{order.id}</p>
                          <div className="mt-2 space-y-2">
                            {order.items.map((item, index) => (
                              <div key={`pinned-${order.id}-${item.meal?.id || index}`} className="flex justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2 text-sm">
                                <span className="font-black text-slate-900">{item.meal?.name || 'Repas'}</span>
                                <span className="font-mono font-black text-blue-800">x{item.quantity}</span>
                              </div>
                            ))}
                          </div>
                          <p className="mt-3 text-right font-mono font-black text-slate-950">{Number(order.total || 0).toLocaleString('fr-FR')} FCFA</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-3 rounded-2xl bg-white border border-amber-100 p-3 text-sm font-bold text-amber-800">Badge reconnu, aucune commande active.</p>
                  )}
                </div>
              )}

              {!scannedBadge ? (
                <div className="bg-white rounded-3xl border border-dashed border-slate-200 p-10 text-center text-slate-400">
                  <QrCode className="w-14 h-14 mx-auto text-slate-200 mb-3" />
                  <p className="font-bold text-slate-500">En attente d'un scan badge</p>
                  <p className="text-xs mt-1">Le résultat apparaîtra ici immédiatement après lecture du QR.</p>
                </div>
              ) : !displayedScannedProfile ? (
                <div className="bg-rose-50 rounded-3xl border border-rose-100 p-6 text-rose-800">
                  <p className="text-xs font-black uppercase tracking-wider">Badge non reconnu</p>
                  <p className="mt-2 font-mono text-lg font-black">{scannedBadge}</p>
                  <p className="mt-2 text-sm">Aucun compte personnel Ndamatou ne correspond à ce badge.</p>
                </div>
              ) : (
                <div className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm">
                  <div className={`min-h-[320px] p-6 md:p-8 ${
                    hasScannedMealAuthorization
                      ? 'bg-blue-600 text-white'
                      : 'bg-amber-100 text-amber-950'
                  }`}>
                    <div className="flex min-h-[280px] flex-col justify-between gap-6">
                      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <div className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-black uppercase ${
                            hasScannedMealAuthorization ? 'bg-white/15 text-white' : 'bg-amber-200 text-amber-950'
                          }`}>
                            <CheckCircle className="h-4 w-4" />
                            {hasScannedMealAuthorization
                              ? scanWasAutoDelivered ? 'Plat déjà validé' : 'Plat autorisé'
                              : 'Badge reconnu'}
                          </div>
                          <h3 className="mt-5 text-4xl font-black leading-tight md:text-5xl">
                            {hasScannedMealAuthorization ? 'PLAT AUTORISÉ' : 'AUCUNE COMMANDE ACTIVE'}
                          </h3>
                          <p className={`mt-3 text-2xl font-black ${hasScannedMealAuthorization ? 'text-blue-50' : 'text-amber-950'}`}>
                            {displayedScannedProfile.name}
                          </p>
                          <p className={`mt-2 text-sm font-bold ${hasScannedMealAuthorization ? 'text-blue-50' : 'text-amber-900'}`}>
                            {displayedScannedProfile.department || 'Service non renseigné'} · {displayedScannedProfile.phone || 'Téléphone non renseigné'} · {displayedScannedProfile.badgeNumber}
                          </p>
                        </div>
                        <div className={`rounded-2xl px-5 py-4 text-right ${
                          hasScannedMealAuthorization ? 'bg-white text-blue-900' : 'bg-white/70 text-amber-950'
                        }`}>
                          <p className="text-[10px] font-black uppercase">Commandes</p>
                          <p className="text-4xl font-black">{displayedScannedOrders.length}</p>
                          <p className="mt-1 font-mono text-sm font-black">{displayedScannedTotal.toLocaleString('fr-FR')} FCFA</p>
                        </div>
                      </div>

                      {hasScannedMealAuthorization ? (
                        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_auto] lg:items-end">
                          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                            {displayedScannedItems.map((item, index) => (
                              <div key={`${item.meal?.id || 'meal'}-${index}`} className="flex items-center justify-between gap-3 rounded-2xl bg-white/95 px-4 py-3 text-blue-950">
                                <span className="text-base font-black">{item.meal?.name || 'Repas'}</span>
                                <span className="font-mono text-xl font-black">x{item.quantity}</span>
                              </div>
                            ))}
                          </div>
                          {!scanWasAutoDelivered && (
                            <div className="grid grid-cols-1 gap-2 lg:w-80">
                              {displayedScannedOrders.map(order => (
                                <div key={`scan-action-${order.id}`} className="grid grid-cols-1 gap-2 rounded-2xl bg-blue-700/40 p-2">
                                  <button
                                    type="button"
                                    onClick={() => printRestaurantTicket(order, displayedScannedProfile)}
                                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-sm font-black text-white hover:bg-slate-800"
                                  >
                                    <Printer className="h-4 w-4" />
                                    Ticket #{order.id}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      await printRestaurantTicket(order, displayedScannedProfile);
                                      const updated = await onUpdateOrderStatus(order.id, 'delivered');
                                      if (updated !== false && (order.fulfillmentMode || 'pickup') !== 'delivery') {
                                        await onSetRestaurantPresence?.(displayedScannedProfile, true);
                                      }
                                      addNotification('Plat remis au restaurant', `La commande #${order.id} de ${order.employeeName} est comptabilisée comme servie.`, 'success');
                                    }}
                                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-black text-blue-800 hover:bg-blue-50"
                                  >
                                    <CheckCircle className="h-4 w-4" />
                                    Remettre + imprimer
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="rounded-2xl bg-white/70 p-4 text-sm font-bold">
                          Badge correct, mais aucune commande non livrée n'est enregistrée pour ce personnel.
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="min-h-[250px] bg-blue-600 p-6 text-white md:p-8">
                    <div className="flex h-full min-h-[210px] flex-col justify-between gap-6 md:flex-row md:items-center">
                      <div>
                        <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-2 text-xs font-black uppercase">
                          <LogOut className="h-4 w-4" />
                          Sortie restaurant
                        </div>
                        <h3 className="mt-5 text-3xl font-black md:text-4xl">Libérer la place</h3>
                        <p className="mt-3 max-w-xl text-sm font-bold text-blue-50">
                          Utiliser ce bouton quand l'agent quitte le restaurant afin que la place soit de nouveau disponible.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRestaurantCounterExit(displayedScannedProfile)}
                        className="flex w-full items-center justify-center gap-3 rounded-2xl bg-white px-6 py-5 text-base font-black text-blue-700 hover:bg-blue-50 md:w-80"
                      >
                        <LogOut className="h-5 w-5" />
                        Sortie restau
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {isCameraScannerOpen && (
          <div className="fixed inset-0 z-50 bg-slate-950/80 p-4 flex items-center justify-center">
            <div className="w-full max-w-lg rounded-3xl bg-white p-5 shadow-2xl">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="font-black text-slate-950">Scanner le badge avec la caméra</h3>
                  <p className="text-xs text-slate-500 mt-1">Autorisez la caméra, puis présentez le QR téléphone du badge devant l’objectif.</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setResumeCameraAfterScan(false);
                    setIsCameraScannerOpen(false);
                  }}
                  className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="mt-4 overflow-hidden rounded-2xl bg-slate-950 aspect-video">
                <video ref={cameraVideoRef} muted playsInline className="w-full h-full object-cover" />
              </div>
              <p className="mt-3 rounded-2xl bg-slate-50 border border-slate-100 px-4 py-3 text-xs font-bold text-slate-700">
                {cameraScannerMessage || 'Préparation de la caméra...'}
              </p>
              <button
                type="button"
                onClick={() => {
                  setResumeCameraAfterScan(false);
                  setIsCameraScannerOpen(false);
                }}
                className="mt-3 w-full rounded-2xl bg-slate-900 py-3 text-sm font-black text-white hover:bg-slate-800"
              >
                Fermer le scanner
              </button>
            </div>
          </div>
        )}

        {/* FOOD MANAGEMENT AND STOCKS INVENTORY CONTROL */}
        {activeTab === 'inventory' && (
          <motion.div
            key="resto-inventory-tab"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="space-y-6"
          >
            {/* Action Bar */}
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-slate-900 text-sm">Fiches Générales de Stock d'Ingrédients & Repas</h3>
              <button
                id="btn-open-add-meal"
                onClick={() => {
                  setNewMealCategory('plat');
                  setNewMealStock('20');
                  setNewMealPrice('2500');
                  setNewMealCalories('500');
                  resetMealForm();
                  setNewMealStock('20');
                  setNewMealPrice('2500');
                  setNewMealCalories('500');
                  setIsAddMealOpen(true);
                }}
                className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold py-2 px-4 rounded-xl transition flex items-center gap-1.5 cursor-pointer shadow-sm shadow-blue-605/10 bg-blue-600"
              >
                <PlusCircle className="w-4 h-4" /> Ajouter un Repas à la Carte
              </button>
            </div>

            {/* Inventory list items */}
            <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-x-auto overflow-y-visible text-xs touch-pan-x [-webkit-overflow-scrolling:touch]">
              <table className="min-w-[1120px] w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-slate-400 font-extrabold uppercase border-b border-slate-100">
                    <th className="p-4">Repas</th>
                    <th className="p-4">Catégorie</th>
                    <th className="p-4">Prix Public</th>
                    <th className="p-4">Énergie</th>
                    <th className="p-4">Stock de Portions</th>
                    <th className="p-4 text-center">Niveau de Stock</th>
                    <th className="p-4 text-center min-w-[330px]">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {mealCategories.map(group => {
                    const categoryMeals = meals
                      .filter(meal =>
                        meal.category === group.key &&
                        !meal.isNextDay &&
                        (meal.mealType || 'regular') === 'regular'
                      )
                      .sort((a, b) => Number(b.isAvailableToday) - Number(a.isAvailableToday) || a.name.localeCompare(b.name, 'fr'));
                    if (categoryMeals.length === 0) return null;

                    return (
                      <React.Fragment key={group.key}>
                        <tr className="bg-blue-50/70 border-y border-blue-100">
                          <td colSpan={7} className="px-4 py-2 text-[11px] font-black uppercase tracking-wider text-blue-800">
                            {group.label} ({categoryMeals.length})
                          </td>
                        </tr>
                        {categoryMeals.map(meal => {
                          const isOutOfStock = meal.stock === 0;
                          const isLowStock = meal.stock > 0 && meal.stock <= 4;
                          const fillPercent = Math.min(100, Math.round((meal.stock / meal.maxStock) * 100));

                          return (
                            <tr key={meal.id} className="hover:bg-slate-50/50 transition duration-150">
                              <td className="p-4 min-w-[280px]">
                                <div className="flex items-center gap-3">
                                <span className="text-xl font-black p-2 bg-slate-50 border border-slate-100 rounded-lg min-w-12 text-center">{getMealVisual(meal.image)}</span>
                                <div>
                                  <p className="font-bold text-slate-900 text-sm leading-tight">{meal.name}</p>
                                  <p className="text-[10px] text-gray-400 truncate max-w-[260px]">{meal.description}</p>
                                </div>
                                </div>
                              </td>
                              <td className="p-4">
                                <span className="text-[10px] font-bold px-2 py-0.5 bg-slate-100 text-slate-600 tracking-wide uppercase rounded">
                                  {meal.category}
                                </span>
                              </td>
                              <td className="p-4 font-mono font-bold text-slate-800">
                                {meal.price.toLocaleString('fr-FR')} FCFA
                              </td>
                              <td className="p-4 font-mono text-slate-500">
                                {meal.calories} kcal
                              </td>
                              <td className="p-4 font-mono">
                                <span className={`text-sm font-black ${
                                  isOutOfStock ? 'text-red-650' : isLowStock ? 'text-amber-500' : 'text-slate-800'
                                }`}>
                                  {meal.stock}
                                </span>
                                <span className="text-slate-400"> / {meal.maxStock} portions</span>
                              </td>
                              <td className="p-4">
                                <div className="w-24 mx-auto">
                                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                                    <div
                                      style={{ width: `${fillPercent}%` }}
                                      className={`h-full rounded-full ${
                                        isOutOfStock ? 'bg-red-500' :
                                        isLowStock ? 'bg-amber-500' : 'bg-blue-500'
                                      }`}
                                    />
                                  </div>
                                  <span className="text-[9px] text-slate-400 block text-center mt-1">
                                    {fillPercent}% rempli
                                  </span>
                                </div>
                              </td>
                              <td className="p-4 min-w-[330px]">
                                <div className="flex items-center justify-center gap-1.5 flex-wrap">
                                  <input
                                    id={`input-stock-${meal.id}`}
                                    type="number"
                                    min="0"
                                    inputMode="numeric"
                                    placeholder="Qté"
                                    value={getMealStockInput(meal)}
                                    onChange={(event) => setStockInputs(current => ({ ...current, [meal.id]: event.target.value }))}
                                    className="w-20 px-2 py-1 rounded border border-slate-200 bg-white text-xs font-bold text-slate-900 outline-none focus:border-blue-500"
                                  />
                                  <button id={`btn-stock-add-${meal.id}`} onClick={() => handleAddMealStock(meal)} className="bg-blue-50 hover:bg-blue-100 text-blue-700 font-extrabold px-2.5 py-1 rounded transition border border-blue-100 cursor-pointer text-[10px]">Ajouter</button>
                                  <button id={`btn-stock-set-${meal.id}`} onClick={() => handleSetMealStock(meal)} className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold px-2.5 py-1 rounded transition border border-slate-200 cursor-pointer text-[10px]">Définir</button>
                                  <button id={`btn-stock-zero-${meal.id}`} onClick={() => onUpdateMealStock(meal.id, 0)} className="bg-slate-100 hover:bg-red-50 text-slate-500 hover:text-red-700 font-medium px-2 py-1 rounded transition border border-slate-200 hover:border-rose-200 cursor-pointer text-[10px]">Vider</button>
                                  <button id={`btn-toggle-today-${meal.id}`} onClick={() => handleToggleMealToday(meal)} className={`${meal.isAvailableToday ? 'bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-100' : 'bg-blue-50 hover:bg-blue-100 text-blue-800 border-blue-100'} font-extrabold px-2.5 py-1 rounded transition border cursor-pointer text-[10px]`}>
                                    {meal.isAvailableToday ? 'Retirer menu' : 'Activer aujourd’hui'}
                                  </button>
                                  <button id={`btn-edit-meal-${meal.id}`} onClick={() => openEditMeal(meal)} className="bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold px-2 py-1 rounded transition border border-blue-100 cursor-pointer text-[10px]">Modifier</button>
                                  <button id={`btn-delete-meal-${meal.id}`} onClick={() => { if (window.confirm(`Supprimer le repas ${meal.name} ?`)) onDeleteMeal(meal.id); }} className="bg-red-50 hover:bg-red-100 text-red-700 font-bold px-2 py-1 rounded transition border border-red-100 cursor-pointer text-[10px]">Supprimer</button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </React.Fragment>
                    );
                  })}                </tbody>
              </table>
            </div>
          </motion.div>
        )}

        {/* QUESTIONNAIRE DE SATISFACTION RESTAURANT */}
        {activeTab === 'anticipation' && canAccessAdministration && (
          <motion.div
            key="resto-anticipation-tab"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="space-y-6"
          >
            <div className="rounded-3xl border border-blue-100 bg-gradient-to-r from-blue-50 to-cyan-50 p-6 shadow-sm">
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                <div>
                  <h3 className="font-black text-blue-950 text-base">Questionnaire de satisfaction restaurant Ndamatou</h3>
                  <p className="text-sm text-blue-800 mt-2 max-w-3xl leading-relaxed">
                    L'ancien vote semaine est remplacé par un questionnaire de satisfaction. Les agents remplissent le formulaire depuis leur compte personnel; l'administration peut exporter les réponses dans un fichier Excel.
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <button
                    type="button"
                    onClick={loadSatisfactionSurveyStats}
                    disabled={isLoadingSatisfactionStats}
                    className="bg-white hover:bg-blue-50 text-blue-800 border border-blue-200 text-sm font-black py-3 px-5 rounded-2xl transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
                  >
                    <RefreshCw className="w-4 h-4" /> {isLoadingSatisfactionStats ? 'Chargement...' : 'Charger les statistiques'}
                  </button>
                  <button
                    id="btn-export-satisfaction-survey"
                    onClick={exportSatisfactionSurveyExcel}
                    className="bg-blue-700 hover:bg-blue-800 text-white text-sm font-black py-3 px-5 rounded-2xl transition flex items-center justify-center gap-2 cursor-pointer shadow-sm shadow-blue-700/20"
                  >
                    <Download className="w-4 h-4" /> Exporter Excel
                  </button>
                  <button
                    id="btn-reset-satisfaction-survey"
                    onClick={resetSatisfactionSurveyResponses}
                    className="bg-red-600 hover:bg-red-700 text-white text-sm font-black py-3 px-5 rounded-2xl transition flex items-center justify-center gap-2 cursor-pointer shadow-sm shadow-red-700/20"
                  >
                    <X className="w-4 h-4" /> Remettre à zéro
                  </button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                <p className="text-xs font-black uppercase text-slate-400">Personnel total</p>
                <p className="mt-2 text-3xl font-black text-slate-950">{employeeProfiles.length.toLocaleString('fr-FR')}</p>
                <p className="mt-1 text-xs text-slate-500">Base utilisée pour calculer le taux de réponse.</p>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                <p className="text-xs font-black uppercase text-slate-400">Réponses validées</p>
                <p className="mt-2 text-3xl font-black text-blue-700">
                  {isLoadingSatisfactionStats ? '...' : hasLoadedSatisfactionStats ? satisfactionSurveyCount.toLocaleString('fr-FR') : '-'}
                </p>
                <p className="mt-1 text-xs text-slate-500">Une seule réponse comptée par agent.</p>
              </div>
              <div className="rounded-2xl border border-blue-100 bg-blue-50 p-5 shadow-sm">
                <p className="text-xs font-black uppercase text-blue-700">Taux de réponse</p>
                <p className="mt-2 text-3xl font-black text-blue-950">
                  {isLoadingSatisfactionStats ? '...' : `${satisfactionResponseRate}%`}
                </p>
                <p className="mt-1 text-xs text-blue-800">Réponses validées / personnel total.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                <p className="text-xs font-black uppercase text-slate-400">Onglet personnel</p>
                <p className="mt-2 text-sm font-bold text-slate-900">Questionnaire</p>
                <p className="mt-1 text-xs text-slate-500">Les agents répondent directement depuis leur espace.</p>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                <p className="text-xs font-black uppercase text-slate-400">Enregistrement</p>
                <p className="mt-2 text-sm font-bold text-slate-900">Firestore + copie locale</p>
                <p className="mt-1 text-xs text-slate-500">Les réponses sont conservées dans la collection satisfactionSurveys.</p>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                <p className="text-xs font-black uppercase text-slate-400">Exploitation</p>
                <p className="mt-2 text-sm font-bold text-slate-900">Fichier Excel</p>
                <p className="mt-1 text-xs text-slate-500">L'export contient les réponses, le service, le badge et les suggestions.</p>
              </div>
            </div>
          </motion.div>
        )}

        {/* ANALYTICAL TOOL & CHARTS performance panels */}
        {activeTab === 'analytics' && (
          <motion.div
            key="resto-analytics-tab"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="space-y-6"
          >
            <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm space-y-4">
              <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-3">
                <div>
                  <h4 className="font-black text-slate-900 text-sm">Analyse horaire des commandes</h4>
                  <p className="text-xs text-slate-500 mt-1">
                    Outil séparé des rapports financiers: choisissez une période pour voir la répartition des commandes par créneau.
                  </p>
                </div>
                <div className="flex flex-wrap items-end gap-2">
                  <label className="text-[10px] font-black uppercase text-slate-500">
                    Du
                    <input type="date" value={hourlyAnalysisStartDate} onChange={(event) => setHourlyAnalysisStartDate(event.target.value)} className="block mt-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-900" />
                  </label>
                  <label className="text-[10px] font-black uppercase text-slate-500">
                    Au
                    <input type="date" value={hourlyAnalysisEndDate} onChange={(event) => setHourlyAnalysisEndDate(event.target.value)} className="block mt-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-900" />
                  </label>
                  <button type="button" onClick={() => setShowHourlyAnalysis(value => !value)} className="px-4 py-2 rounded-xl bg-slate-950 text-white text-xs font-black hover:bg-slate-800">
                    {showHourlyAnalysis ? 'Masquer analyse horaire' : 'Afficher analyse horaire'}
                  </button>
                  {showHourlyAnalysis && (
                    <button type="button" onClick={printHourlyAnalysis} className="px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-black hover:bg-blue-700">
                      Imprimer analyse horaire
                    </button>
                  )}
                </div>
              </div>
              {showHourlyAnalysis && (<>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {hourlyAnalysisRows.map((row, index) => (
                  <div key={`hourly-analysis-${row.label}`} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-black uppercase text-slate-500">{row.label}</p>
                        <p className="mt-1 text-2xl font-black text-slate-950">{row.rate}%</p>
                        <p className="mt-1 text-[11px] font-bold text-slate-500">{row.orders} commande(s), {row.quantity} portion(s)</p>
                        <p className="mt-1 text-[11px] font-black text-blue-700">{formatMoney(row.amount)}</p>
                      </div>
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                        index === 0 ? 'bg-slate-200 text-slate-700' : index === 1 ? 'bg-sky-100 text-sky-700' : 'bg-orange-100 text-orange-700'
                      }`}>
                        <Clock className="w-5 h-5" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-[11px] font-semibold text-blue-900">
                Total période: {hourlyAnalysisTotals.orders} commande(s), {hourlyAnalysisTotals.quantity} portion(s), {formatMoney(hourlyAnalysisTotals.amount)}. Les créneaux sont administrables dans les paramètres opérationnels.
              </div>
              <div className="rounded-3xl border border-amber-100 bg-amber-50 p-4 space-y-3">
                <div>
                  <h5 className="text-sm font-black text-amber-950">Affluence au restaurant</h5>
                  <p className="mt-1 text-xs font-semibold text-amber-800">
                    Basée sur l'heure de remise/scan des agents venus au restaurant, pas sur l'heure de commande.
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {restaurantAffluenceRows.map((row) => (
                    <div key={`restaurant-affluence-${row.label}`} className="rounded-2xl border border-amber-100 bg-white p-4">
                      <p className="text-[10px] font-black uppercase text-amber-700">{row.label}</p>
                      <p className="mt-1 text-2xl font-black text-slate-950">{row.rate}%</p>
                      <p className="mt-1 text-[11px] font-bold text-slate-500">
                        {row.visits} agent(s) passé(s), {row.quantity} portion(s) remise(s)
                      </p>
                    </div>
                  ))}
                </div>
                <p className="text-[11px] font-bold text-amber-900">
                  Total créneaux d'affluence: {restaurantAffluenceTotals.visits} agent(s), {restaurantAffluenceTotals.quantity} portion(s).
                </p>
              </div>
              </>)}
            </div>

            <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div>
                <h4 className="font-black text-slate-900 text-sm">Graphiques d'analyse</h4>
                <p className="text-xs text-slate-500 mt-1">Masqués par défaut pour réduire le rendu et limiter la charge pendant les heures de forte utilisation.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowAnalyticsCharts(value => !value)}
                className="px-4 py-2 rounded-xl bg-slate-950 text-white text-xs font-black hover:bg-slate-800"
              >
                {showAnalyticsCharts ? 'Masquer les graphiques' : 'Afficher les graphiques'}
              </button>
            </div>
            {showAnalyticsCharts && (<>
            {/* Top Overview Cards */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Chart 1: Daily Revenue performance analytics (Area Chart represent) */}
              <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm space-y-4">
                <div className="flex justify-between items-center gap-3">
                  <div>
                    <h4 className="font-bold text-slate-900 text-sm">Chiffre d'Affaires Quotidien (Revenus)</h4>
                    <p className="text-xs text-slate-500">Maturité financière commerciale sur les 7 derniers jours.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => exportChartFigure(revenueChartRef.current, 'chiffre-affaires-quotidien', "Chiffre d'affaires quotidien", analyticsPeriodLabel, revenueLegendItems)}
                      className="inline-flex items-center gap-1 px-3 py-2 rounded-xl border border-slate-200 text-slate-700 text-[11px] font-black hover:bg-slate-50"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Exporter
                    </button>
                    <TrendingUp className="w-4 h-4 text-blue-600" />
                  </div>
                </div>

                <div ref={revenueChartRef} className="h-72 w-full text-xs">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={dailyAnalyticsData}
                      margin={{ top: 10, right: 10, left: 10, bottom: 0 }}
                    >
                      <defs>
                        <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="date" stroke="#94a3b8" fontSize={10} />
                      <YAxis stroke="#94a3b8" fontSize={10} tickFormatter={(v) => `${v / 1000}k`} />
                      <Tooltip formatter={(value: any) => [`${value.toLocaleString()} FCFA`, "Revenu"]} />
                      <Area
                        type="monotone"
                        dataKey="revenue"
                        stroke="#10b981"
                        strokeWidth={2}
                        fillOpacity={1}
                        fill="url(#colorRevenue)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Chart 2: Department consumption metrics (Bar Chart representing doctors, nurses places) */}
              <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm space-y-4">
                <div className="flex justify-between items-center gap-3">
                  <div>
                    <h4 className="font-bold text-slate-900 text-sm">Répartition des Commandes par Service Hospitalier</h4>
                    <p className="text-xs text-slate-500">Flux d'appels repas par division au sein de l'hôpital Ndamatou.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => exportChartFigure(departmentChartRef.current, 'commandes-par-service', 'Répartition des commandes par service hospitalier', analyticsPeriodLabel, departmentLegendItems)}
                      className="inline-flex items-center gap-1 px-3 py-2 rounded-xl border border-slate-200 text-slate-700 text-[11px] font-black hover:bg-slate-50"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Exporter
                    </button>
                    <Users className="w-4 h-4 text-blue-600" />
                  </div>
                </div>

                <div ref={departmentChartRef} className="h-72 w-full text-xs">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={departmentOrderData}
                      margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="name" stroke="#94a3b8" fontSize={10} />
                      <YAxis stroke="#94a3b8" fontSize={10} />
                      <Tooltip formatter={(value: any) => [`${value} commandes`, "Volume"]} />
                      <Bar dataKey="orders" fill="#3b82f6" radius={[4, 4, 0, 0]}>
                        {departmentOrderData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Category Breakdown (Pie Chart representation) */}
              <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm space-y-4 lg:col-span-1">
                <div className="flex items-center justify-between gap-3">
                  <h4 className="font-bold text-slate-900 text-sm">Ventes par menus proposés</h4>
                  <button
                    type="button"
                    onClick={() => exportChartFigure(categoryChartRef.current, 'ventes-par-menus', 'Ventes par menus proposés', analyticsPeriodLabel, categoryLegendItems)}
                    className="inline-flex items-center gap-1 px-3 py-2 rounded-xl border border-slate-200 text-slate-700 text-[11px] font-black hover:bg-slate-50"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Exporter
                  </button>
                </div>
                <div ref={categoryChartRef} className="h-64 flex items-center justify-center">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={menuSalesData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {menuSalesData.map(entry => (
                          <Cell key={entry.name} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v) => `${v} portion(s)`} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[10px] text-slate-500">
                  {menuSalesData.length === 0 ? (
                    <div className="font-bold text-slate-400">Aucune vente de menu sur la période.</div>
                  ) : menuSalesData.map(entry => (
                    <div key={entry.name} className="flex items-center gap-1.5 font-sans">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
                      {entry.name} ({entry.value})
                    </div>
                  ))}
                </div>
              </div>

            </div>
            </>)}

              {/* Transactions logs table summary */}
              <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm space-y-4 lg:col-span-2">
                <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-3">
                  <div>
                    <h4 className="font-bold text-slate-900 text-sm">Consommations Historiques & Performances Récentes</h4>
                    <p className="text-xs text-slate-500 mt-1">La moyenne par commande correspond aux recettes divisées par le nombre de commandes.</p>
                  </div>
                  <div className="flex flex-wrap items-end gap-2">
                    <label className="text-[10px] font-black uppercase text-slate-500">
                      Du
                      <input type="date" value={revenueReportStartDate} onChange={(event) => setRevenueReportStartDate(event.target.value)} className="block mt-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-900" />
                    </label>
                    <label className="text-[10px] font-black uppercase text-slate-500">
                      Au
                      <input type="date" value={revenueReportEndDate} onChange={(event) => setRevenueReportEndDate(event.target.value)} className="block mt-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-900" />
                    </label>
                    <button type="button" onClick={() => handlePrintRevenueReport('periode', revenueReportStartDate, revenueReportEndDate)} className="px-4 py-2 rounded-xl bg-slate-950 text-white text-xs font-black hover:bg-slate-800">Imprimer période</button>
                    <button type="button" onClick={() => handlePrintRevenueReport()} className="px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-black hover:bg-blue-700">Imprimer recettes</button>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left font-mono text-xs">
                    <thead>
                      <tr className="bg-slate-50 text-slate-400 uppercase font-bold border-b border-slate-100">
                        <th className="p-3">Période</th>
                        <th className="p-3">Commandes totals</th>
                        <th className="p-3 text-end">Revenus totaux</th>
                        <th className="p-3 text-end">Moyenne par commande</th>
                        <th className="p-3 text-end">Taux de retrait</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {dailyAnalyticsData.length === 0 ? (
                        <tr>
                          <td className="p-4 text-slate-400 font-bold" colSpan={5}>Aucune consommation réelle retrouvée sur la période affichée.</td>
                        </tr>
                      ) : dailyAnalyticsData.slice(-8).reverse().map((d) => (
                        <tr key={d.date} className="hover:bg-slate-50">
                          <td className="p-3 font-semibold text-slate-700">{d.date}</td>
                          <td className="p-3 text-slate-900 font-bold">{d.ordersCount} cmd</td>
                          <td className="p-3 text-end font-bold text-blue-700">{d.revenue.toLocaleString()} FCFA</td>
                          <td className="p-3 text-end text-slate-500">{d.averageCart.toLocaleString()} F</td>
                          <td className="p-3 text-end text-slate-500 font-bold">{d.withdrawalRate}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 4. MODALS (Add meal modal & Next day proposed menus promotions popup) */}
      <AnimatePresence>
        {isAddMealOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl relative space-y-4"
            >
              <div className="flex justify-between items-center border-b border-slate-150 pb-3">
                <h4 className="font-bold text-slate-950 text-base">{editingMealId ? 'Modifier le repas' : "Nouveau repas aujourd'hui"}</h4>
                <button
                  id="btn-close-add-meal"
                  onClick={() => { setIsAddMealOpen(false); resetMealForm(); }}
                  className="p-1 hover:bg-slate-100 rounded-full cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form id="add-meal-form" onSubmit={handleCreateMeal} className="space-y-4 text-xs">
                <div>
                  <label className="block text-slate-500 font-bold uppercase mb-1">Nom du Plat</label>
                  <input
                    type="text"
                    required
                    value={newMealName}
                    onChange={(e) => setNewMealName(e.target.value)}
                    placeholder="Ex: Yassa Poisson de Mer"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm"
                  />
                </div>

                <div>
                  <label className="block text-slate-500 font-bold uppercase mb-1">Description</label>
                  <textarea
                    required
                    value={newMealDesc}
                    onChange={(e) => setNewMealDesc(e.target.value)}
                    placeholder="Détails du plat..."
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm min-h-[60px]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-slate-500 font-bold uppercase mb-1">Prix (FCFA)</label>
                    <input
                      type="number"
                      required
                      value={newMealPrice}
                      onChange={(e) => setNewMealPrice(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-500 font-bold uppercase mb-1">Stock Initial</label>
                    <input
                      type="number"
                      required
                      value={newMealStock}
                      onChange={(e) => setNewMealStock(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-slate-500 font-bold uppercase mb-1">Catégorie</label>
                    <select
                      value={newMealCategory}
                      onChange={(e) => setNewMealCategory(e.target.value as MealCategory)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm"
                    >
                      <option value="plat">Plat Chaud</option>
                      <option value="entrée">Entrée</option>
                      <option value="dessert">Dessert</option>
                      <option value="boisson">Boisson</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-500 font-bold uppercase mb-1">Calories (kcal)</label>
                    <input
                      type="number"
                      value={newMealCalories}
                      onChange={(e) => setNewMealCalories(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-slate-500 font-bold uppercase mb-1">Visuel Emoji</label>
                    <select
                      value={newMealImage}
                      onChange={(e) => setNewMealImage(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm"
                    >
                      <option value="Plat">Plat</option>
                      <option value="Viande">Viande</option>
                      <option value="Poisson">Poisson</option>
                      <option value="Poulet">Poulet</option>
                      <option value="Menu">Menu</option>
                      <option value="Salade">Salade</option>
                      <option value="Soupe">Soupe</option>
                      <option value="Boisson">Boisson</option>
                      <option value="Dessert">Dessert</option>
                    </select>
                  </div>
                </div>

                <button
                  id="btn-confirm-add-meal"
                  type="submit"
                  className="w-full py-2.5 px-4 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition cursor-pointer font-sans"
                >
                  {editingMealId ? 'Enregistrer les modifications' : 'Ajouter à la carte'}
                </button>
              </form>
            </motion.div>
          </div>
        )}

        {/* PROPOSE NEXT DAY DIAL */}
        {isAddProposalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl relative space-y-4"
            >
              <div className="flex justify-between items-center border-b border-slate-150 pb-3">
                <h4 className="font-bold text-slate-950 text-base">Proposer un plat pour Demain</h4>
                <button
                  id="btn-close-add-proposal"
                  onClick={() => setIsAddProposalOpen(false)}
                  className="p-1 hover:bg-slate-100 rounded-full cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form id="add-proposal-form" onSubmit={(e) => handleCreateProposal(e, true)} className="space-y-4 text-xs">
                <div>
                  <label className="block text-slate-500 font-bold uppercase mb-1">Nom du Plat proposé</label>
                  <input
                    type="text"
                    required
                    value={newMealName}
                    onChange={(e) => setNewMealName(e.target.value)}
                    placeholder="Ex: Riz au Poisson (Thiéboudienne) Blanc"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm"
                  />
                </div>

                <div>
                  <label className="block text-slate-500 font-bold uppercase mb-1">Description</label>
                  <textarea
                    required
                    value={newMealDesc}
                    onChange={(e) => setNewMealDesc(e.target.value)}
                    placeholder="Ingrédients phares, accompagnements..."
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm min-h-[60px]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-slate-500 font-bold uppercase mb-1">Prix Estimé (FCFA)</label>
                    <input
                      type="number"
                      required
                      value={newMealPrice}
                      onChange={(e) => setNewMealPrice(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-500 font-bold uppercase mb-1">Calories (kcal)</label>
                    <input
                      type="number"
                      value={newMealCalories}
                      onChange={(e) => setNewMealCalories(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-slate-500 font-bold uppercase mb-1">Visuel Emoji</label>
                    <select
                      value={newMealImage}
                      onChange={(e) => setNewMealImage(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm"
                    >
                      <option value="Plat">Plat</option>
                      <option value="Assiette">Assiette</option>
                      <option value="Poulet">Poulet</option>
                      <option value="Pastels">Pastels</option>
                      <option value="Viande">Viande</option>
                      <option value="Curry">Curry</option>
                      <option value="Crevettes">Crevettes</option>
                      <option value="Crème">Crème</option>
                    </select>
                  </div>
                </div>

                <button
                  id="btn-confirm-add-proposal"
                  type="submit"
                  className="w-full py-2.5 px-4 bg-amber-500 text-white font-bold rounded-xl hover:bg-amber-600 transition cursor-pointer font-sans"
                >
                  Proposer au Vote
                </button>
              </form>
            </motion.div>
          </div>
        )}

        {/* PROMOTE DIALOG BOX WITH QUANTITY INITIALIZATION */}
        {promotingMealId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl space-y-4"
            >
              <h4 className="font-bold text-slate-950 text-base">Activer le repas pour Aujourd'hui</h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                Vous vous apprêtez à activer ce plat proposé pour demain dans le catalogue public d'hier/aujourd'hui. S.V.P déterminez le stock de portions initiales cuisinées :
              </p>

              <div className="space-y-3">
                <label className="block text-slate-400 font-bold uppercase text-[10px]">Quantité de portions cuisinées</label>
                <input
                  type="number"
                  value={promotionStockInput}
                  onChange={(e) => setPromotionStockInput(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-sm font-black focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="flex gap-2 text-xs pt-3">
                <button
                  id="btn-cancel-promote"
                  onClick={() => setPromotingMealId(null)}
                  className="flex-1 py-2 px-3 bg-slate-100 rounded-xl hover:bg-slate-250 transition font-bold cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  id="btn-confirm-promote"
                  onClick={handleConfirmPromotion}
                  className="flex-1 py-2 px-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition font-bold cursor-pointer font-sans"
                >
                  Activer la Vente
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};






























