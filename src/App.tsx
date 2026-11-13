import { FormEvent, useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Bell,
  ChefHat,
  Truck,
  User,
  Activity,
  Sparkles,
  HeartHandshake,
  CloudCheck,
  Database,
  LogOut,
  ShieldCheck,
  CalendarDays,
  Clock3,
  Banknote,
  RefreshCw,
  Eye,
  EyeOff,
  Users
} from 'lucide-react';
import { Meal, Order, UserProfile, AppNotification, OrderStatus } from './types';
import type { CashTransaction, PrepaidCard, WaveTopupRequest } from './types';
import { EMPTY_PROFILE } from './data/initialState';
import { EmployeeView } from './components/EmployeeView';
import { RestaurantView } from './components/RestaurantView';
import { DeliveryView } from './components/DeliveryView';
import { AccountantView } from './components/AccountantView';
import { HrView } from './components/HrView';
import { NotificationCenter, ActiveToast } from './components/NotificationCenter';
import { ProfileDrawer } from './components/ProfileDrawer';
import { CHNCAK_BUILDINGS, CHNCAK_FLOORS, CHNCAK_SERVICES, CHNCAK_SPECIALTIES } from './data/hospitalOptions';
import { USERS_DIRECTORY_FALLBACK, USERS_DIRECTORY_FALLBACK_GENERATED_AT } from './data/usersDirectoryFallback';
import { getDeliveryCodeExpiresAt, getPersonalDeliveryCode } from './lib/deliveryCodes';
import { getLocalDateKey, getOperationalDateKey } from './lib/business';
import { createTopupRequestStore } from './lib/topupRequests';
import { FEE_POLICY } from './lib/finance';
import { canTransitionOrder } from './lib/orderLifecycle';

// Import Firebase context elements
import { auth, db, firebaseConfig, isConfigured, handleFirestoreError, OperationType } from './lib/firebase';
import { deleteApp, initializeApp } from 'firebase/app';
import {
  secureAccountantTopup,
  secureAdjustBadgeBalance,
  secureApproveWaveTopup,
  secureBalanceFunctionsEnabled,
  sparkBalanceEnabled,
  secureCancelPaidOrder,
  secureCorrectTopup,
  secureCreatePaidOrder,
  secureRedeemPrepaidCard,
} from './lib/secureBalance';
import { collection, onSnapshot, doc, getDoc, getDocFromServer, getDocs, getDocsFromServer, query, setDoc, updateDoc, deleteDoc, where, writeBatch, increment, runTransaction, orderBy, limit, serverTimestamp } from 'firebase/firestore';
import { createUserWithEmailAndPassword, deleteUser, EmailAuthProvider, getAuth, onAuthStateChanged, reauthenticateWithCredential, sendPasswordResetEmail, signInWithEmailAndPassword, signOut, verifyBeforeUpdateEmail, updatePassword, User as FirebaseUser } from 'firebase/auth';

const buildReadableBadgeNumber = (uid: string, year = new Date().getFullYear()) => {
  let hash = 0;
  for (let index = 0; index < uid.length; index += 1) {
    hash = (hash * 31 + uid.charCodeAt(index)) % 1_000_000;
  }
  return `CH-${year}-${String(hash).padStart(6, '0')}`;
};

const normalizeDigits = (value?: string) => String(value || '').replace(/\\D/g, '');

const parseTimeToMinutes = (value = '00:00') => {
  const [hourRaw, minuteRaw] = value.split(':').map(Number);
  const hour = Number.isFinite(hourRaw) ? hourRaw : 0;
  const minute = Number.isFinite(minuteRaw) ? minuteRaw : 0;
  return Math.max(0, Math.min(23, hour)) * 60 + Math.max(0, Math.min(59, minute));
};

const getUnclaimedOrderDeadline = (
  createdAtValue: string,
  expirationTime = '18:00',
  operationalDayStart = '19:00',
) => {
  const createdAt = new Date(createdAtValue);
  if (Number.isNaN(createdAt.getTime())) return null;

  const operationalDateKey = getOperationalDateKey(createdAt, operationalDayStart || '19:00');
  const [year, month, day] = operationalDateKey.split('-').map(Number);
  const deadline = new Date(year, (month || 1) - 1, day || 1);
  const [expiryHourRaw, expiryMinuteRaw] = expirationTime.split(':').map(Number);
  const expiryHour = Number.isFinite(expiryHourRaw) ? expiryHourRaw : 18;
  const expiryMinute = Number.isFinite(expiryMinuteRaw) ? expiryMinuteRaw : 0;
  deadline.setHours(expiryHour, expiryMinute, 0, 0);

  const startMinutes = parseTimeToMinutes(operationalDayStart || '19:00');
  const expiryMinutes = parseTimeToMinutes(expirationTime || '18:00');
  if (startMinutes > 0 && expiryMinutes <= startMinutes) {
    deadline.setDate(deadline.getDate() + 1);
  }

  return deadline;
};

type InstitutionConfig = {
  logoUrl: string;
  directorName: string;
  directorPhotoUrl: string;
  restaurantPhotoUrl: string;
  safName: string;
  safPhotoUrl: string;
  restaurantManagerName: string;
  acpName: string;
  managementControllerName: string;
  revenueReportSignatureOrder: string[];
  blazeInvoicePeriodStart: string;
  blazeInvoicePeriodEnd: string;
  blazeFirestoreAmount: number;
  blazeHostingAmount: number;
  blazeAuthAmount: number;
  blazeStorageAmount: number;
  blazeOtherAmount: number;
  blazeTaxesAmount: number;
  blazeNotes: string;
  deliveryAccessCode: string;
  deliveryCodeMaxUsesPer24h: number;
  deliveryAuthorizationMode: 'codes' | 'selection';
  deliverySelectionStart: string;
  deliverySelectionEnd: string;
  deliveryServiceDailyQuotas: Record<string, number>;
  deliveryFeeEnabled: boolean;
  deliveryFeeAmount: number;
  deliveryFeePayer: 'employee' | 'hospital';
  advertisingEnabled: boolean;
  advertisingText: string;
  advertisingImageUrl: string;
  advertisingSpeedSeconds: number;
  diagnosticBannerEnabled: boolean;
  lateOrderPhone: string;
  waveMerchantNumber: string;
  wavePaymentLink: string;
  waveTopupEnabled: boolean;
  prepaidCardEnabled: boolean;
  waveCashierFeeRate: number;
  waveFeeNotice: string;
  maxBadgeBalance: number;
  historyClearCode: string;
  topupUndoSeconds: number;
  registrationAccessEnabled: boolean;
  registrationAccessCode: string;
  accountantContactEnabled: boolean;
  accountantContactName: string;
  accountantContactPhone: string;
  deliveryContactPhone: string;
  extrasOrderingEnabled: boolean;
  specialDinnerEnabled: boolean;
  proposalCreationEnabled: boolean;
  orderWindowEnabled: boolean;
  orderWindowStart: string;
  orderWindowEnd: string;
  orderRateSlot1Start: string;
  orderRateSlot1End: string;
  orderRateSlot2Start: string;
  orderRateSlot2End: string;
  orderRateSlot3Start: string;
  orderRateSlot3End: string;
  restaurantAffluenceSlot1Start: string;
  restaurantAffluenceSlot1End: string;
  restaurantAffluenceSlot2Start: string;
  restaurantAffluenceSlot2End: string;
  weekendOrderingClosed: boolean;
  unclaimedExpirationEnabled: boolean;
  unclaimedExpirationTime: string;
  unclaimedGraceEnabled: boolean;
  unclaimedGracePerWeek: number;
  refundOnCancelEnabled: boolean;
  realMealPrice: number;
  hospitalSupportAmount: number;
  staffMealPrice: number;
  sharedFeeModelVersion?: string;
  legacyAccountingPrices?: { real: number; staff: number; hospital: number };
  maxItemsPerOrder: number;
  maxActiveHotMealsPerDay: number;
  autoRetireMenusEnabled: boolean;
  autoRetireMenusTime: string;
  lastAutoRetireMenusDate: string;
  restaurantCapacity: number;
  restaurantExitQrEnabled: boolean;
  restaurantExitScanModeSeconds: number;
  restaurantOccupancyMinutes: number;
  restaurantPresenceReminderEnabled: boolean;
  restaurantPresenceReminderMinutes: number;
  restaurantTicketWidthMm: number;
  restaurantAutoPrintEnabled: boolean;
  restaurantQzPrinterName: string;
  restaurantQzCertificateUrl: string;
  restaurantQzSignatureUrl: string;
  deliveryLabelWidthMm: number;
  deliveryLabelHeightMm: number;
  mealTokenColors: string[];
  officialResetAt: string;
  services: string[];
  buildings: string[];
  floors: string[];
  specialties: string[];
  employmentTypes: string[];
  employeeEmploymentTypeLocked: boolean;
};

const DEFAULT_INSTITUTION_CONFIG: InstitutionConfig = {
  logoUrl: '',
  directorName: 'Nom à renseigner',
  directorPhotoUrl: '',
  restaurantPhotoUrl: '',
  safName: 'Nom à renseigner',
  safPhotoUrl: '',
  restaurantManagerName: 'Nom à renseigner',
  acpName: 'Nom à renseigner',
  managementControllerName: 'Nom à renseigner',
  revenueReportSignatureOrder: ['director', 'saf', 'acp', 'managementController', 'restaurantManager'],
  blazeInvoicePeriodStart: '',
  blazeInvoicePeriodEnd: '',
  blazeFirestoreAmount: 0,
  blazeHostingAmount: 0,
  blazeAuthAmount: 0,
  blazeStorageAmount: 0,
  blazeOtherAmount: 0,
  blazeTaxesAmount: 0,
  blazeNotes: '',
  deliveryAccessCode: 'SAF2026',
  deliveryCodeMaxUsesPer24h: 1,
  deliveryAuthorizationMode: 'codes',
  deliverySelectionStart: '08:00',
  deliverySelectionEnd: '10:00',
  deliveryServiceDailyQuotas: {},
  deliveryFeeEnabled: false,
  deliveryFeeAmount: 0,
  deliveryFeePayer: 'employee',
  advertisingEnabled: false,
  advertisingText: '',
  advertisingImageUrl: '',
  advertisingSpeedSeconds: 35,
  diagnosticBannerEnabled: false,
  lateOrderPhone: '+221 33 000 00 00',
  waveMerchantNumber: '+221 77 000 00 00',
  wavePaymentLink: 'https://pay.wave.com/m/M_sn_30W1WbHEAfU-/c/sn/',
  waveTopupEnabled: false,
  prepaidCardEnabled: false,
  waveCashierFeeRate: 1,
  waveFeeNotice: "Les frais Wave sont supportés par l'agent. Si vous ne voulez pas payer de frais, déplacez-vous chez l'agent comptable et payez en espèces.",
  maxBadgeBalance: 10000,
  historyClearCode: '2026',
  topupUndoSeconds: 60,
  registrationAccessEnabled: false,
  registrationAccessCode: '',
  accountantContactEnabled: true,
  accountantContactName: 'Fallou Diouf',
  accountantContactPhone: '76 434 08 62',
  deliveryContactPhone: '',
  extrasOrderingEnabled: false,
  specialDinnerEnabled: false,
  proposalCreationEnabled: false,
  orderWindowEnabled: true,
  orderWindowStart: '00:00',
  orderWindowEnd: '09:00',
  orderRateSlot1Start: '19:00',
  orderRateSlot1End: '08:00',
  orderRateSlot2Start: '08:00',
  orderRateSlot2End: '13:00',
  orderRateSlot3Start: '13:00',
  orderRateSlot3End: '18:00',
  restaurantAffluenceSlot1Start: '12:00',
  restaurantAffluenceSlot1End: '15:00',
  restaurantAffluenceSlot2Start: '15:00',
  restaurantAffluenceSlot2End: '18:00',
  weekendOrderingClosed: true,
  unclaimedExpirationEnabled: true,
  unclaimedExpirationTime: '18:00',
  unclaimedGraceEnabled: true,
  unclaimedGracePerWeek: 3,
  refundOnCancelEnabled: false,
  realMealPrice: 1000,
  hospitalSupportAmount: 500,
  staffMealPrice: 500,
  sharedFeeModelVersion: FEE_POLICY,
  maxItemsPerOrder: 2,
  maxActiveHotMealsPerDay: 2,
  autoRetireMenusEnabled: true,
  autoRetireMenusTime: '18:30',
  lastAutoRetireMenusDate: '',
  restaurantCapacity: 70,
  restaurantExitQrEnabled: true,
  restaurantExitScanModeSeconds: 20,
  restaurantOccupancyMinutes: 40,
  restaurantPresenceReminderEnabled: true,
  restaurantPresenceReminderMinutes: 20,
  restaurantTicketWidthMm: 80,
  restaurantAutoPrintEnabled: false,
  restaurantQzPrinterName: 'EPSON TM-T20X',
  restaurantQzCertificateUrl: 'http://127.0.0.1:8182/certificate',
  restaurantQzSignatureUrl: 'http://127.0.0.1:8182/sign',
  deliveryLabelWidthMm: 100,
  deliveryLabelHeightMm: 70,
  mealTokenColors: ['Rouge', 'Bleu', 'Vert', 'Jaune', 'Orange', 'Violet', 'Rose', 'Blanc', 'Noir'],
  officialResetAt: '',
  services: CHNCAK_SERVICES,
  buildings: CHNCAK_BUILDINGS,
  floors: CHNCAK_FLOORS,
  specialties: CHNCAK_SPECIALTIES,
  employmentTypes: ['Titulaire', 'Contractuel', 'Stagiaire'],
  employeeEmploymentTypeLocked: true,
};

const secureRandomCode = (length: number) => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const values = new Uint32Array(length);
  crypto.getRandomValues(values);
  return [...values].map(value => alphabet[value % alphabet.length]).join('');
};

const getWeekKey = (value: Date | string = new Date()) => {
  const date = value instanceof Date ? new Date(value) : new Date(value);
  const day = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - day);
  date.setHours(0, 0, 0, 0);
  return getLocalDateKey(date);
};

const firestoreSafe = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const readLocalStorageJson = <T,>(key: string, fallback: T): T => {
  try {
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) as T : fallback;
  } catch {
    localStorage.removeItem(key);
    return fallback;
  }
};
const safeLocalStorageSet = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn(`Cache local ignore pour ${key}: quota navigateur atteint.`, error);
    localStorage.removeItem(key);
  }
};
const compactProfilesForCache = (profiles: UserProfile[]) =>
  profiles.map(profile => ({
    ...profile,
    photoUrl: profile.photoUrl && profile.photoUrl.startsWith('data:') ? '' : profile.photoUrl,
  }));
const clearLargeFirebaseCaches = () => {
  if (!isConfigured) return;
  [
    'ndamatou_profiles',
    'ndamatou_orders',
    'ndamatou_notifications',
    'ndamatou_cash_transactions',
    'ndamatou_wave_topup_requests',
    'ndamatou_prepaid_cards',
  ].forEach(key => {
    try {
      localStorage.removeItem(key);
    } catch {
      // Ignore browser storage cleanup failures.
    }
  });
};
const getFirestoreErrorCode = (error: unknown) =>
  typeof error === 'object' && error !== null && 'code' in error ? String((error as { code: unknown }).code || '') : '';
const isTransientFirestoreError = (error: unknown) =>
  ['unavailable', 'deadline-exceeded', 'aborted', 'internal', 'resource-exhausted', 'unknown']
    .some(code => getFirestoreErrorCode(error).includes(code));
const retryFirestoreWrite = async <T,>(operation: () => Promise<T>, attempts = 5): Promise<T> => {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isTransientFirestoreError(error) || attempt === attempts) throw error;
      await new Promise(resolve => window.setTimeout(resolve, 600 * attempt * attempt));
    }
  }
  throw lastError;
};
const normalizeHospitalService = (service: string) => {
  const normalized = (service || '').trim().toLocaleLowerCase('fr-FR');
  const compactNormalized = normalized.replace(/\s*\/\s*/g, '/');
  if (['accueil des urgences', 'accueil urgences', 'urgences', 'sau'].includes(normalized)) return 'SAU';
  if (['services administratif et financier', 'service administratif et financier', 'saf'].includes(normalized)) return 'SAF';
  if (['banque de sang', 'banque du sang', 'banques de sang', 'banques du sang'].includes(normalized)) return 'Banque de sang';
  if (['rh', 'ressource humaine', 'ressources humaines', 'ressources humaine'].includes(normalized)) return 'RH';
  if (['administration', 'administratio', 'service administration', 'service administratif', 'services administratifs', 'services administratif'].includes(normalized)) return 'Direction';
  if (['cellule marches publiques', 'cellule marche publique', 'cellule marchés publics', 'cellule marché public', 'cellules marches publiques', 'cellules marches publics', 'cellules marchés publics'].includes(normalized)) return 'Cellules marches publics';
  if ([
    'gyneco',
    'gynéco',
    'gynecologie',
    'gynécologie',
    'gyneco/maternite',
    'gyneco/meternite',
    'gynéco/maternité',
    'gynéco/meternité',
    'gynecologie/maternite',
    'gynecologie/meternite',
    'gynécologie/maternité',
    'gynécologie/meternité',
    'gynéco/maternite',
    'gynécologie/maternite',
    'gynoc/meternite',
    'gynocologie',
    'gycologie',
    'gycologie/',
    'gycologie/maternite',
    'gycologie/meternite',
    'gynã©co/maternitã©',
    'gynã©cologie/maternitã©',
  ].includes(compactNormalized)) return 'Gynécologie';
  if (['pharmacie centrale', 'pharmacie'].includes(normalized)) return 'Pharmacie';
  return (service || '').trim();
};
const normalizeTextList = (items: unknown[] = []) =>
  Array.from(new Set(
    items
      .map(item => String(item || '').trim())
      .filter(Boolean)
  ));
const normalizeServiceList = (services: unknown[] = []) =>
  Array.from(new Set(services.map(service => normalizeHospitalService(String(service || ''))).filter(Boolean)));
const GYNECOLOGY_SERVICE_VARIANTS = [
  'Gynécologie',
  'Gynecologie',
  'Gynéco/Maternité',
  'Gynécologie/Maternité',
  'Gynécologie',
  'gyneco/meternite',
  'gyneco/maternite',
  'gynecologie/maternite',
  'gynecologie/meternite',
  'gycologie/',
];
const getDepartmentQueryVariants = (department: string) =>
  normalizeHospitalService(department) === 'Gynécologie'
    ? Array.from(new Set(GYNECOLOGY_SERVICE_VARIANTS))
    : [department].filter(Boolean);

const toStrictBoolean = (value: unknown, fallback = false) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'oui', 'yes', 'blocked', 'bloque', 'bloqué'].includes(normalized)) return true;
    if (['false', '0', 'non', 'no', 'active', ''].includes(normalized)) return false;
  }
  return fallback;
};

const normalizeFirebaseProfile = (raw: Partial<UserProfile> = {}, fallbackId = '', fallbackEmail = ''): UserProfile => {
  const email = String(raw.email || fallbackEmail || '').trim();
  const id = String(fallbackId || raw.id || email || `profile-${Date.now()}`);
  const role = (raw.role || 'employee') as UserProfile['role'];
  const rawStatus = String(raw.status || 'active').trim().toLowerCase();
  const hasValidationTrace = Boolean(raw.validatedAt || raw.validatedByName || raw.validatedById);
  const rawBadgeBlocked = raw.badgeBlocked;
  const explicitlyBlocked = toStrictBoolean(rawBadgeBlocked);
  const parsedStatus = (
    ['pending', 'attente', 'en attente', 'validation', 'a valider', 'à valider'].includes(rawStatus)
      ? 'pending'
      : ['blocked', 'bloque', 'bloqué', 'inactif', 'inactive'].includes(rawStatus)
        ? 'blocked'
        : 'active'
  ) as UserProfile['status'];
  const status = parsedStatus === 'pending' && hasValidationTrace && !explicitlyBlocked ? 'active' : parsedStatus;
  return {
    id,
    createdAt: raw.createdAt || '',
    name: String(raw.name || email.split('@')[0] || 'Personnel Ndamatou').trim(),
    email,
    phone: String(raw.phone || '').trim(),
    badgeNumber: String(raw.badgeNumber || '').trim(),
    department: normalizeHospitalService(String(raw.department || '')),
    building: String(raw.building || '').trim(),
    floor: String(raw.floor || '').trim(),
    room: String(raw.room || '').trim(),
    walletBalance: Math.max(0, Number(raw.walletBalance || 0) || 0),
    role,
    hrAccess: toStrictBoolean(raw.hrAccess),
    accountantAccess: toStrictBoolean(raw.accountantAccess),
    employmentType: raw.employmentType || '',
    contractEndDate: raw.contractEndDate || '',
    verificationFlagged: toStrictBoolean(raw.verificationFlagged),
    verificationFlaggedAt: raw.verificationFlaggedAt || '',
    verificationFlaggedBy: raw.verificationFlaggedBy || '',
    validatedById: raw.validatedById || '',
    validatedByName: raw.validatedByName || '',
    validatedAt: raw.validatedAt || '',
    subsidyExcluded: toStrictBoolean(raw.subsidyExcluded),
    alwaysStaffMealPrice: toStrictBoolean(raw.alwaysStaffMealPrice),
    extraSubsidyCredits: Math.max(0, Number(raw.extraSubsidyCredits || 0) || 0),
    deliveryAllowed: toStrictBoolean(raw.deliveryAllowed),
    deliveryCodeViewer: toStrictBoolean(raw.deliveryCodeViewer),
    deliveryVisibleDepartments: normalizeServiceList(Array.isArray(raw.deliveryVisibleDepartments) ? raw.deliveryVisibleDepartments : []),
    deliverySelectionDailyLimit: Math.max(1, Number(raw.deliverySelectionDailyLimit || 1) || 1),
    deliveryPreAuthorizedUntil: raw.deliveryPreAuthorizedUntil || '',
    deliveryPreAuthorizedById: raw.deliveryPreAuthorizedById || '',
    deliveryPreAuthorizedByName: raw.deliveryPreAuthorizedByName || '',
    deliveryPreAuthorizedScope: raw.deliveryPreAuthorizedScope,
    status,
    badgeBlocked: toStrictBoolean(rawBadgeBlocked, role === 'employee' && status === 'pending'),
    photoUrl: raw.photoUrl || '',
    whatsappOptIn: toStrictBoolean(raw.whatsappOptIn),
  };
};

const hasDrhValidationTrace = (profile?: Partial<UserProfile> | null) =>
  Boolean(profile?.validatedAt || profile?.validatedByName || profile?.validatedById);

const preventValidatedProfilePendingRegression = (
  incoming: UserProfile,
  previous?: Partial<UserProfile> | null,
): UserProfile => {
  const incomingStatus = String(incoming.status || '').trim().toLowerCase();
  const previousStatus = String(previous?.status || '').trim().toLowerCase();
  const wasAlreadyValidated =
    hasDrhValidationTrace(previous) ||
    hasDrhValidationTrace(incoming) ||
    previousStatus === 'active';
  const explicitlyBlocked =
    incomingStatus === 'blocked' ||
    previousStatus === 'blocked' ||
    toStrictBoolean(incoming.badgeBlocked) ||
    toStrictBoolean(previous?.badgeBlocked);

  if (incomingStatus === 'pending' && wasAlreadyValidated && !explicitlyBlocked) {
    return {
      ...incoming,
      status: 'active',
      badgeBlocked: false,
    };
  }

  return incoming;
};

const isProfileUsable = (profile: UserProfile) =>
  profile.role !== 'employee' ||
  (profile.status === 'active' && !toStrictBoolean(profile.badgeBlocked) && !isContractExpired(profile));

const timestampLikeToIso = (value: unknown): string => {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object' && value !== null) {
    const candidate = value as { toDate?: () => Date; seconds?: number; nanoseconds?: number };
    if (typeof candidate.toDate === 'function') {
      const date = candidate.toDate();
      return Number.isFinite(date.getTime()) ? date.toISOString() : '';
    }
    if (typeof candidate.seconds === 'number') {
      return new Date(candidate.seconds * 1000 + Math.floor((candidate.nanoseconds || 0) / 1_000_000)).toISOString();
    }
  }
  return '';
};

const normalizeFirebaseOrder = (raw: Partial<Order> = {}): Order => {
  const serverCreatedAtIso = timestampLikeToIso(raw.serverCreatedAt);
  const clientCreatedAt = String(raw.clientCreatedAt || raw.createdAt || '').trim();
  return {
    ...(raw as Order),
    createdAt: serverCreatedAtIso || clientCreatedAt,
    clientCreatedAt,
    serverCreatedAt: serverCreatedAtIso || raw.serverCreatedAt,
    department: normalizeHospitalService(raw.department || ''),
  };
};

const getProfileAccessPriority = (profile: UserProfile, preferredId = '') => {
  const rolePriority: Record<UserProfile['role'], number> = {
    admin: 10000,
    restaurant_admin: 9000,
    operator: 8500,
    accountant: 8000,
    hr: 7500,
    delivery: 7000,
    employee: 0,
  };
  const delegatedAccess =
    (profile.accountantAccess ? 7900 : 0) +
    (profile.hrAccess ? 7400 : 0) +
    (profile.deliveryCodeViewer ? 1200 : 0);
  return (
    Math.max(rolePriority[profile.role] || 0, delegatedAccess) +
    (profile.badgeNumber ? 300 : 0) +
    (isProfileUsable(profile) ? 80 : 0) +
    (profile.validatedAt ? 40 : 0) +
    (profile.validatedByName ? 20 : 0) +
    (Number(profile.walletBalance || 0) > 0 ? 10 : 0) +
    (preferredId && profile.id === preferredId ? 5 : 0)
  );
};

const chooseBestProfile = (profiles: UserProfile[], preferredId = '') =>
  [...profiles].sort((a, b) => {
    return getProfileAccessPriority(b, preferredId) - getProfileAccessPriority(a, preferredId);
  })[0];

const sameProfileIdentity = (left: Partial<UserProfile>, right: Partial<UserProfile>) => {
  const leftEmail = String(left.email || '').trim().toLowerCase();
  const rightEmail = String(right.email || '').trim().toLowerCase();
  const leftBadge = String(left.badgeNumber || '').trim().toUpperCase();
  const rightBadge = String(right.badgeNumber || '').trim().toUpperCase();
  const leftPhone = String(left.phone || '').replace(/[^\d+]/g, '');
  const rightPhone = String(right.phone || '').replace(/[^\d+]/g, '');
  return (
    (!!left.id && !!right.id && left.id === right.id) ||
    (!!leftBadge && !!rightBadge && leftBadge === rightBadge) ||
    (!!leftEmail && !!rightEmail && leftEmail === rightEmail) ||
    (!!leftPhone && !!rightPhone && leftPhone === rightPhone)
  );
};

const protectTransientProfileState = (
  previous: UserProfile | undefined,
  incoming: UserProfile,
  preservePreviousValues = false,
) => {
  if (!previous || !preservePreviousValues || !sameProfileIdentity(previous, incoming)) return incoming;
  const incomingWallet = Math.max(0, Number(incoming.walletBalance || 0) || 0);
  const previousWallet = Math.max(0, Number(previous.walletBalance || 0) || 0);
  const suspiciousZeroRead = incomingWallet === 0 && previousWallet > 0;
  const suspiciousLowerRead = incomingWallet < previousWallet && previousWallet - incomingWallet >= 100;
  const suspiciousBlockRead =
    (suspiciousZeroRead || suspiciousLowerRead) &&
    previous.status === 'active' &&
    !toStrictBoolean(previous.badgeBlocked) &&
    (incoming.status === 'pending' || incoming.status === 'blocked' || toStrictBoolean(incoming.badgeBlocked));

  return {
    ...previous,
    ...incoming,
    walletBalance: (suspiciousZeroRead || suspiciousLowerRead) ? previousWallet : incomingWallet,
    status: suspiciousBlockRead ? previous.status : incoming.status,
    badgeBlocked: suspiciousBlockRead ? previous.badgeBlocked : incoming.badgeBlocked,
  };
};

const isTransientProfileReadProtected = (
  previous: UserProfile | undefined,
  incoming: UserProfile,
  preservePreviousValues = false,
) => {
  if (!previous || !preservePreviousValues || !sameProfileIdentity(previous, incoming)) return false;
  const incomingWallet = Math.max(0, Number(incoming.walletBalance || 0) || 0);
  const previousWallet = Math.max(0, Number(previous.walletBalance || 0) || 0);
  return incomingWallet < previousWallet && previousWallet - incomingWallet >= 100;
};

const isSameActiveProfileState = (left: UserProfile, right: UserProfile) => {
  const leftServices = normalizeServiceList(left.deliveryVisibleDepartments || []).join('|');
  const rightServices = normalizeServiceList(right.deliveryVisibleDepartments || []).join('|');
  return left.id === right.id &&
    left.email === right.email &&
    left.role === right.role &&
    left.status === right.status &&
    left.badgeBlocked === right.badgeBlocked &&
    left.hrAccess === right.hrAccess &&
    left.accountantAccess === right.accountantAccess &&
    left.deliveryCodeViewer === right.deliveryCodeViewer &&
    left.department === right.department &&
    left.badgeNumber === right.badgeNumber &&
    Number(left.walletBalance || 0) === Number(right.walletBalance || 0) &&
    leftServices === rightServices;
};

const decodeFirestoreRestValue = (value: any): any => {
  if (!value || typeof value !== 'object') return value;
  if ('stringValue' in value) return value.stringValue;
  if ('integerValue' in value) return Number(value.integerValue || 0);
  if ('doubleValue' in value) return Number(value.doubleValue || 0);
  if ('booleanValue' in value) return Boolean(value.booleanValue);
  if ('timestampValue' in value) return value.timestampValue;
  if ('nullValue' in value) return null;
  if ('arrayValue' in value) {
    return (value.arrayValue?.values || []).map(decodeFirestoreRestValue);
  }
  if ('mapValue' in value) {
    return decodeFirestoreRestFields(value.mapValue?.fields || {});
  }
  return undefined;
};

const decodeFirestoreRestFields = (fields: Record<string, any>) =>
  Object.fromEntries(
    Object.entries(fields || {}).map(([key, value]) => [key, decodeFirestoreRestValue(value)])
  );

const fetchUsersDirectoryViaRest = async (user: FirebaseUser): Promise<UserProfile[]> => {
  if (!firebaseConfig.projectId) return [];
  const token = await user.getIdToken();
  const databaseId = firebaseConfig.firestoreDatabaseId || '(default)';
  const profiles: UserProfile[] = [];
  let pageToken = '';
  for (let page = 0; page < 12; page += 1) {
    const url = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/${databaseId}/documents/users?pageSize=300${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
      cache: 'no-store',
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`REST users ${response.status}${body ? ` ${body.slice(0, 120)}` : ''}`);
    }
    const payload = await response.json();
    profiles.push(...(payload.documents || []).map((documentData: any) => {
      const id = String(documentData.name || '').split('/').pop() || '';
      return normalizeFirebaseProfile(decodeFirestoreRestFields(documentData.fields || {}), id);
    }));
    pageToken = payload.nextPageToken || '';
    if (!pageToken) break;
  }
  return profiles;
};

const fetchUsersDirectoryViaHostedFallback = async (): Promise<UserProfile[]> => {
  return USERS_DIRECTORY_FALLBACK.map((profile: Partial<UserProfile>) =>
    normalizeFirebaseProfile(profile, String(profile.id || ''))
  );
};

const fetchMealsViaRest = async (user: FirebaseUser): Promise<Meal[]> => {
  if (!firebaseConfig.projectId) return [];
  const token = await user.getIdToken();
  const databaseId = firebaseConfig.firestoreDatabaseId || '(default)';
  const meals: Meal[] = [];
  let pageToken = '';
  for (let page = 0; page < 4; page += 1) {
    const url = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/${databaseId}/documents/meals?pageSize=1000${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
      cache: 'no-store',
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`REST meals ${response.status}${body ? ` ${body.slice(0, 120)}` : ''}`);
    }
    const payload = await response.json();
    meals.push(...(payload.documents || []).map((documentData: any) => {
      const id = String(documentData.name || '').split('/').pop() || '';
      return cleanLegacyMeal({ ...decodeFirestoreRestFields(documentData.fields || {}), id } as Meal);
    }));
    pageToken = payload.nextPageToken || '';
    if (!pageToken) break;
  }
  return meals;
};

const mirrorAuthenticatedAccessProfile = async (user: FirebaseUser, profile: UserProfile) => {
  if (!db || !user.email || profile.role !== 'employee' || profile.hrAccess === true) return;
  const userRef = doc(db, 'users', user.uid);
  const currentSnap = await getDoc(userRef).catch(() => null);
  const currentData = currentSnap?.exists() ? currentSnap.data() as Partial<UserProfile> : {};
  const uidProfilePatch = firestoreSafe({
    id: user.uid,
    email: user.email.trim().toLowerCase(),
    name: profile.name || user.email.split('@')[0],
    phone: profile.phone || '',
    ...(!currentData.badgeNumber ? { badgeNumber: profile.badgeNumber || `CH-2026-${user.uid.slice(0, 10).toUpperCase()}` } : {}),
    ...(!Number.isFinite(Number(currentData.walletBalance)) ? { walletBalance: Math.max(0, Number(profile.walletBalance || 0) || 0) } : {}),
    department: normalizeHospitalService(profile.department || ''),
    role: profile.role || 'employee',
    status: profile.status || 'active',
    badgeBlocked: Boolean(profile.badgeBlocked),
    hrAccess: Boolean(profile.hrAccess),
    accountantAccess: Boolean(profile.accountantAccess),
    deliveryCodeViewer: Boolean(profile.deliveryCodeViewer),
    deliveryVisibleDepartments: normalizeServiceList(profile.deliveryVisibleDepartments || []),
    deliverySelectionDailyLimit: Math.max(1, Number(profile.deliverySelectionDailyLimit || 1) || 1),
  });
  await setDoc(userRef, uidProfilePatch, { merge: true });
};

const isContractExpired = (profile: Pick<UserProfile, 'contractEndDate'>) => {
  if (!profile.contractEndDate) return false;
  const end = new Date(`${profile.contractEndDate}T23:59:59`);
  return Number.isFinite(end.getTime()) && end.getTime() < Date.now();
};

const STANDARD_REAL_MEAL_PRICE = 800;
const ADMIN_USERS_LIMIT = 1500;
const ADMIN_RECENT_ORDERS_LIMIT = 650;
const ADMIN_RECENT_NOTIFICATIONS_LIMIT = 120;
const ADMIN_RECENT_TRANSACTIONS_LIMIT = 900;
const ADMIN_RECENT_REQUESTS_LIMIT = 200;
const MIN_COMPLETE_USER_DIRECTORY_SIZE = 50;
const isWeekendOrderingClosed = (date: Date) => {
  const day = date.getDay();
  const minutes = date.getHours() * 60 + date.getMinutes();
  return (day === 5 && minutes >= 19 * 60) || day === 6 || (day === 0 && minutes < 19 * 60);
};
const cleanLegacyText = (value: string) => {
  const corrections: Array<[string, string]> = [
    ['Thi?boudienne', 'Thiéboudienne'],
    ['Thiouboudienne', 'Thiéboudienne'],
    ['s?n?galais', 'sénégalais'],
    ['s?n?galaise', 'sénégalaise'],
    ['parfum?', 'parfumé'],
    ['Grill?', 'Grillé'],
    ['marin?', 'mariné'],
    ['g?n?reuse', 'généreuse'],
    ['Maf?', 'Mafé'],
    ['mijot?', 'mijoté'],
    ['Velout?', 'Velouté'],
    ['L?gumes', 'Légumes'],
    ['Cr?me Br?l?e', 'Crème brûlée'],
    ['2?me ?tage', '2e étage'],
  ];
  return corrections.reduce((text, [from, to]) => text.split(from).join(to), String(value || ''));
};

const cleanLegacyMeal = (meal: Meal): Meal => ({
  ...meal,
  name: cleanLegacyText(meal.name),
  description: cleanLegacyText(meal.description),
  category: meal.category || 'plat',
  price: meal.mealType === 'special_dinner' ? meal.price : STANDARD_REAL_MEAL_PRICE,
  stock: Math.max(0, Number(meal.stock || 0) || 0),
  maxStock: Math.max(Number(meal.maxStock || 0) || 0, Number(meal.stock || 0) || 0),
  tokenColor: meal.tokenColor || '',
  mealType: meal.mealType || 'regular',
  isNextDay: Boolean(meal.isNextDay),
  isAvailableToday: Boolean(meal.isAvailableToday),
  calories: Math.max(0, Number(meal.calories || 0) || 0),
  image: meal.image || 'Plat',
  allergens: Array.isArray(meal.allergens) ? meal.allergens.map(cleanLegacyText) : [],
});

export default function App() {
  // Firebase is the source of truth; local storage only caches existing data.
  const [meals, setMeals] = useState<Meal[]>(() => {
    const parsed = isConfigured ? [] : readLocalStorageJson<Meal[]>('ndamatou_meals', []);
    return parsed.map(cleanLegacyMeal);
  });

  const [orders, setOrders] = useState<Order[]>(() => {
    return isConfigured ? [] : readLocalStorageJson<Order[]>('ndamatou_orders', []);
  });

  const [notifications, setNotifications] = useState<AppNotification[]>(() => {
    return isConfigured ? [] : readLocalStorageJson<AppNotification[]>('ndamatou_notifications', []);
  });

  const [profiles, setProfiles] = useState<UserProfile[]>(() => {
    return isConfigured ? [] : readLocalStorageJson<UserProfile[]>('ndamatou_profiles', []);
  });

  // Current active employee profile
  const [activeProfile, setActiveProfile] = useState<UserProfile>(() => {
    if (isConfigured) return EMPTY_PROFILE;
    const saved = readLocalStorageJson<UserProfile | null>('ndamatou_active_profile', null);
    if (saved) return saved;
    return EMPTY_PROFILE;
  });

  // Active perspective switcher (Employee, Restaurant manager, Courier driver)
  const [activeWorkspace, setActiveWorkspace] = useState<'employee' | 'restaurant' | 'admin' | 'accountant' | 'delivery' | 'hr'>('employee');
  const [cashTransactions, setCashTransactions] = useState<CashTransaction[]>(() => {
    return isConfigured ? [] : readLocalStorageJson<CashTransaction[]>('ndamatou_cash_transactions', []);
  });
  const [waveTopupRequests, setWaveTopupRequests] = useState<WaveTopupRequest[]>(() => {
    return isConfigured ? [] : readLocalStorageJson<WaveTopupRequest[]>('ndamatou_wave_topup_requests', []);
  });
  const [prepaidCards, setPrepaidCards] = useState<PrepaidCard[]>(() => {
    return isConfigured ? [] : readLocalStorageJson<PrepaidCard[]>('ndamatou_prepaid_cards', []);
  });
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [activeToast, setActiveToast] = useState<AppNotification | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [restaurantPresenceEntries, setRestaurantPresenceEntries] = useState<Array<{ employeeId: string; active: boolean; updatedAt: string }>>([]);
  const [restaurantPresenceRequested, setRestaurantPresenceRequested] = useState(false);
  const expirationProcessingRef = useRef<Set<string>>(new Set());
  const pendingTopupRequests = useRef(createTopupRequestStore());
  const autoRetireMenusProcessingRef = useRef(false);
  const [authReady, setAuthReady] = useState(!isConfigured);
  const [cloudProfileReady, setCloudProfileReady] = useState(!isConfigured);
  const [userDirectoryStatus, setUserDirectoryStatus] = useState('Profils: attente Firebase');
  const [restDirectoryStatus, setRestDirectoryStatus] = useState('REST: attente');
  const [isBadgeSyncInProgress, setIsBadgeSyncInProgress] = useState(false);
  const badgeSyncNoticeTimerRef = useRef<number | null>(null);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [registerPasswordConfirmation, setRegisterPasswordConfirmation] = useState('');
  const [showAuthPassword, setShowAuthPassword] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [passwordResetMessage, setPasswordResetMessage] = useState('');
  const [isSendingPasswordReset, setIsSendingPasswordReset] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [registerLastName, setRegisterLastName] = useState('');
  const [registerFirstName, setRegisterFirstName] = useState('');
  const [registerPhone, setRegisterPhone] = useState('');
  const [registerDepartment, setRegisterDepartment] = useState('');
  const [registerBuilding, setRegisterBuilding] = useState('Bâtiment principal');
  const [registerFloor, setRegisterFloor] = useState('Rez-de-chaussée');
  const [registerSpecialty, setRegisterSpecialty] = useState('Infirmier');
  const [registerEmploymentType, setRegisterEmploymentType] = useState('Titulaire');
  const [registerAccessCode, setRegisterAccessCode] = useState('');
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const [institutionConfig, setInstitutionConfig] = useState<InstitutionConfig>(() => {
    const saved = localStorage.getItem('ndamatou_institution_config');
    return saved ? { ...DEFAULT_INSTITUTION_CONFIG, ...JSON.parse(saved) } : DEFAULT_INSTITUTION_CONFIG;
  });
  const rotatingDeliveryCode = getPersonalDeliveryCode(currentTime, institutionConfig.deliveryAccessCode, activeProfile.id);
  const rotatingDeliveryCodeExpiresAt = getDeliveryCodeExpiresAt(currentTime);
  const canManageSensitiveAdminSettings =
    (firebaseUser?.email || auth?.currentUser?.email || activeProfile.email || '').trim().toLowerCase() === 'smsgueye@gmail.com';

  useEffect(() => {
    if (!isConfigured || !db) return;

    const unsubInstitution = onSnapshot(doc(db, 'settings', 'institution'), (snapshot) => {
      if (snapshot.exists()) {
        const cloudConfig = { ...DEFAULT_INSTITUTION_CONFIG, ...(snapshot.data() as Partial<InstitutionConfig>) };
        setInstitutionConfig({ ...cloudConfig, services: normalizeServiceList(cloudConfig.services) });
      } else {
        setDoc(doc(db, 'settings', 'institution'), institutionConfig, { merge: true }).catch((error) => {
          handleFirestoreError(error, OperationType.WRITE, 'settings/institution');
        });
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'settings/institution');
    });

    return () => unsubInstitution();
  }, [isConfigured]);

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(new Date()), 10_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    setRestaurantPresenceRequested(false);
  }, [activeProfile.id]);

  const canAutoReadRestaurantPresence =
    activeProfile.role !== 'employee' ||
    activeProfile.hrAccess === true ||
    activeProfile.accountantAccess === true ||
    activeProfile.deliveryCodeViewer === true;
  const shouldReadRestaurantPresence = canAutoReadRestaurantPresence || restaurantPresenceRequested;

  useEffect(() => {
    if (!isConfigured || !db || !firebaseUser || !shouldReadRestaurantPresence) return;
    return onSnapshot(collection(db, 'restaurantPresence'), snapshot => {
      setRestaurantPresenceEntries(snapshot.docs.map(item => {
        const data = item.data() as { employeeId: string; active: boolean; updatedAt: string };
        return { ...data, employeeId: data.employeeId || item.id };
      }));
    }, error => handleFirestoreError(error, OperationType.GET, 'restaurantPresence'));
  }, [isConfigured, firebaseUser, shouldReadRestaurantPresence]);
  const restaurantOccupancy = restaurantPresenceEntries.filter(entry =>
    entry.active === true &&
    currentTime.getTime() - new Date(entry.updatedAt).getTime() < institutionConfig.restaurantOccupancyMinutes * 60_000
  ).length;
  const activeProfileRestaurantPresence = restaurantPresenceEntries.find(entry =>
    entry.employeeId === activeProfile.id &&
    entry.active === true &&
    currentTime.getTime() - new Date(entry.updatedAt).getTime() < institutionConfig.restaurantOccupancyMinutes * 60_000
  );

  useEffect(() => {
    if (!isConfigured || !auth) return;

    return onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      setAuthReady(true);
      setCloudProfileReady(false);

      if (!user || !user.email) return;

      let firebaseProfile: UserProfile | null = null;

      if (db) {
        try {
          const emailProfiles: UserProfile[] = [];
          const emailSnapshot = await getDocs(query(collection(db, 'users'), where('email', '==', user.email.trim().toLowerCase()), limit(5))).catch(() => null);
          emailSnapshot.forEach((item) => {
            emailProfiles.push(normalizeFirebaseProfile(item.data() as Partial<UserProfile>, item.id, user.email || ''));
          });
          const profileSnap = await getDoc(doc(db, 'users', user.uid));
          if (profileSnap.exists()) {
            emailProfiles.push(normalizeFirebaseProfile(profileSnap.data() as Partial<UserProfile>, user.uid, user.email));
          }
          firebaseProfile = chooseBestProfile(emailProfiles, user.uid) || null;
        } catch (error) {
          console.error('Error reading Firebase user profile:', error);
        }
      }

      if (!firebaseProfile) {
        firebaseProfile = normalizeFirebaseProfile({
          id: user.uid,
          name: user.email.split('@')[0],
          email: user.email,
          phone: '',
          badgeNumber: buildReadableBadgeNumber(user.uid),
          department: '',
          building: '',
          floor: '',
          room: '',
          walletBalance: 0,
          role: 'employee',
          status: 'pending',
          badgeBlocked: true,
        }, user.uid, user.email);
      }

      if (!firebaseProfile) return;

      if (db) {
        try {
          await mirrorAuthenticatedAccessProfile(user, firebaseProfile);
        } catch (error) {
          handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}/access-mirror`);
        }
      }

      if (firebaseProfile.role === 'employee' && (firebaseProfile.status === 'blocked' || isContractExpired(firebaseProfile))) {
        setLoginError(
          isContractExpired(firebaseProfile)
              ? "Votre contrat est arrivé à échéance. Contactez la DRH."
              : "Ce compte est bloqué par l'administration. Contactez la DRH ou l'administrateur."
        );
        await signOut(auth).catch(() => undefined);
        return;
      }

      setActiveProfile(firebaseProfile);
      setCloudProfileReady(true);
      const workspaceByRole: Record<UserProfile['role'], 'employee' | 'restaurant' | 'admin' | 'accountant' | 'delivery' | 'hr'> = {
        admin: 'admin',
        restaurant_admin: 'restaurant',
        operator: 'restaurant',
        accountant: 'accountant',
        hr: 'hr',
        delivery: 'delivery',
        employee: 'employee',
      };
      setActiveWorkspace(workspaceByRole[firebaseProfile.role] || 'employee');
    });
  }, [isConfigured]);

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!auth) return;

    setLoginError('');
    setIsLoggingIn(true);

    try {
      await signInWithEmailAndPassword(auth, loginEmail.trim(), loginPassword);
      setLoginPassword('');
    } catch (error) {
      console.error(error);
      const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';
      const messageByCode: Record<string, string> = {
        'auth/invalid-credential': "Email ou mot de passe incorrect. Vérifiez d'abord que cet email existe dans Firebase Authentication. Si le profil existe seulement dans Firestore, il ne peut pas se connecter. Sinon, réinitialisez son mot de passe.",
        'auth/user-not-found': "Aucun compte Firebase ne correspond à cet email.",
        'auth/wrong-password': "Mot de passe incorrect pour ce compte Firebase.",
        'auth/invalid-email': "Format d'email invalide.",
        'auth/too-many-requests': "Trop d'essais. Patientez quelques minutes ou réinitialisez le mot de passe dans Firebase.",
        'auth/network-request-failed': "Problème réseau entre l'application et Firebase."
      };
      setLoginError(messageByCode[code] || `Connexion impossible (${code || 'erreur inconnue'}). Vérifiez le compte dans Firebase.`);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleRegister = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!auth || !db) return;

    setLoginError('');
    setIsLoggingIn(true);

    try {
      if (loginPassword !== registerPasswordConfirmation) {
        throw new Error('Les deux mots de passe ne correspondent pas.');
      }
      if (institutionConfig.registrationAccessEnabled && registerAccessCode.trim() !== institutionConfig.registrationAccessCode.trim()) {
        throw new Error("Code d'inscription Ndamatou incorrect. Contactez la DRH ou l'administration.");
      }
      const normalizedPhone = registerPhone.replace(/\D+/g, '').trim();
      if (normalizedPhone.length < 8) throw new Error('Saisissez un numéro de téléphone valide.');
      const fullName = `${registerFirstName.trim()} ${registerLastName.trim()}`.trim();
      const credential = await createUserWithEmailAndPassword(auth, loginEmail.trim(), loginPassword);
      const badgeNumber = buildReadableBadgeNumber(credential.user.uid);
      const profile: UserProfile = {
        id: credential.user.uid,
        name: fullName,
        email: loginEmail.trim(),
        phone: normalizedPhone,
        badgeNumber,
        department: registerDepartment.trim(),
        building: registerBuilding,
        floor: registerFloor.trim(),
        room: registerSpecialty.trim(),
        walletBalance: 0,
        role: 'employee',
        employmentType: registerEmploymentType,
        status: 'pending',
        badgeBlocked: true,
      };

      try {
        const registrationBatch = writeBatch(db);
        registrationBatch.set(doc(db, 'registrationIdentifiers', `phone-${normalizedPhone}`), {
          uid: credential.user.uid,
          type: 'phone',
          createdAt: new Date().toISOString(),
        });
        registrationBatch.set(doc(db, 'registrationIdentifiers', `email-${loginEmail.trim().toLowerCase()}`), {
          uid: credential.user.uid,
          type: 'email',
          createdAt: new Date().toISOString(),
        });
        registrationBatch.set(doc(db, 'users', credential.user.uid), profile);
        await registrationBatch.commit();
        profiles.filter(item => item.role === 'hr' || item.hrAccess === true).forEach(hrProfile => {
          const notificationId = `notif-hr-register-${credential.user.uid}-${hrProfile.id}`;
          setDoc(doc(db, 'notifications', notificationId), {
            id: notificationId,
            userId: hrProfile.id,
            title: 'Nouvelle inscription personnel',
            message: `${fullName} vient de créer un compte (${registerDepartment.trim() || 'service non renseigné'}).`,
            type: 'info',
            timestamp: new Date().toISOString(),
            read: false,
          }).catch(error => handleFirestoreError(error, OperationType.WRITE, `notifications/${notificationId}`));
        });
      } catch (error) {
        try {
          const [samePhoneSnapshot, sameEmailSnapshot] = await Promise.all([
            getDocs(query(collection(db, 'users'), where('phone', '==', normalizedPhone), limit(1))),
            getDocs(query(collection(db, 'users'), where('email', '==', loginEmail.trim()), limit(1))),
          ]);
          const duplicateExists = [...samePhoneSnapshot.docs, ...sameEmailSnapshot.docs]
            .some(item => item.id !== credential.user.uid);
          if (duplicateExists) {
            await deleteUser(credential.user).catch(() => undefined);
            throw new Error('Ce téléphone ou cet e-mail est déjà utilisé par un autre profil.');
          }
          await setDoc(doc(db, 'users', credential.user.uid), profile);
          setDoc(doc(db, 'registrationIdentifiers', `phone-${normalizedPhone}`), {
            uid: credential.user.uid,
            type: 'phone',
            createdAt: new Date().toISOString(),
          }).catch(indexError => handleFirestoreError(indexError, OperationType.WRITE, `registrationIdentifiers/phone-${normalizedPhone}`));
          setDoc(doc(db, 'registrationIdentifiers', `email-${loginEmail.trim().toLowerCase()}`), {
            uid: credential.user.uid,
            type: 'email',
            createdAt: new Date().toISOString(),
          }).catch(indexError => handleFirestoreError(indexError, OperationType.WRITE, `registrationIdentifiers/email-${loginEmail.trim().toLowerCase()}`));
        } catch (fallbackError) {
          await deleteUser(credential.user).catch(() => undefined);
          if (fallbackError instanceof Error) throw fallbackError;
          throw new Error('Firebase a refusé la création du profil. Vérifiez les règles Firestore puis réessayez.');
        }
      }
      setProfiles(prev => [profile, ...prev.filter(p => p.id !== profile.id)]);
      setActiveProfile(profile);
      setActiveWorkspace('employee');
      addNotification(
        'Inscription enregistrée',
        'Votre compte est créé. Le badge reste inactif jusqu’à validation par la DRH.',
        'info',
        undefined,
        profile.id
      );
      setLoginPassword('');
      setRegisterPasswordConfirmation('');
    } catch (error) {
      console.error(error);
      const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';
      const messageByCode: Record<string, string> = {
        'auth/email-already-in-use': "Cet email est déjà inscrit. Utilisez la connexion.",
        'auth/invalid-email': "Format d'email invalide.",
        'auth/weak-password': "Le mot de passe doit contenir au moins 6 caractères.",
        'auth/network-request-failed': "Problème réseau entre l'application et Firebase."
      };
      setLoginError(error instanceof Error && !code ? error.message : messageByCode[code] || `Inscription impossible (${code || 'erreur inconnue'}).`);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    setCloudProfileReady(false);
    setActiveProfile(EMPTY_PROFILE);
    setActiveWorkspace('employee');
    setNotifications([]);
    setLoginEmail('');
    setLoginPassword('');
    if (auth) {
      await signOut(auth);
    }
    setFirebaseUser(null);
  };

  const handleUpdateInstitutionConfig = async (config: InstitutionConfig) => {
    const protectedConfig = canManageSensitiveAdminSettings
      ? config
      : {
          ...config,
          advertisingEnabled: institutionConfig.advertisingEnabled,
          advertisingText: institutionConfig.advertisingText,
          advertisingImageUrl: institutionConfig.advertisingImageUrl,
          advertisingSpeedSeconds: institutionConfig.advertisingSpeedSeconds,
          wavePaymentLink: institutionConfig.wavePaymentLink,
          registrationAccessEnabled: institutionConfig.registrationAccessEnabled,
          registrationAccessCode: institutionConfig.registrationAccessCode,
        };
    const nextServices = normalizeServiceList(protectedConfig.services || []);
    const rawQuotas = protectedConfig.deliveryServiceDailyQuotas || {};
    const nextQuotas = nextServices.reduce<Record<string, number>>((acc, service) => {
      acc[service] = Math.max(0, Number(rawQuotas[service] ?? 0) || 0);
      return acc;
    }, {});
    const safeRealMealPrice = Math.max(0, Math.trunc(Number(protectedConfig.realMealPrice || DEFAULT_INSTITUTION_CONFIG.realMealPrice) || DEFAULT_INSTITUTION_CONFIG.realMealPrice));
    const safeStaffMealPrice = Math.min(
      safeRealMealPrice,
      Math.max(0, Math.trunc(Number(protectedConfig.staffMealPrice || DEFAULT_INSTITUTION_CONFIG.staffMealPrice) || DEFAULT_INSTITUTION_CONFIG.staffMealPrice))
    );
    const safeHospitalSupportAmount = Math.max(0, safeRealMealPrice - safeStaffMealPrice);
    const nextConfig = {
      ...DEFAULT_INSTITUTION_CONFIG,
      ...protectedConfig,
      realMealPrice: safeRealMealPrice,
      staffMealPrice: safeStaffMealPrice,
      hospitalSupportAmount: safeHospitalSupportAmount,
      services: nextServices,
      buildings: normalizeTextList(protectedConfig.buildings || DEFAULT_INSTITUTION_CONFIG.buildings),
      floors: normalizeTextList(protectedConfig.floors || DEFAULT_INSTITUTION_CONFIG.floors),
      specialties: normalizeTextList(protectedConfig.specialties || DEFAULT_INSTITUTION_CONFIG.specialties),
      employmentTypes: normalizeTextList(protectedConfig.employmentTypes || DEFAULT_INSTITUTION_CONFIG.employmentTypes),
      deliveryServiceDailyQuotas: nextQuotas,
    };
    setInstitutionConfig(nextConfig);

    if (isConfigured && db) {
      await setDoc(doc(db, 'settings', 'institution'), nextConfig, { merge: true }).catch((error) => {
        handleFirestoreError(error, OperationType.WRITE, 'settings/institution');
        throw error;
      });
    }
  };

  const showBadgeSyncNotice = () => {
    setIsBadgeSyncInProgress(true);
    if (badgeSyncNoticeTimerRef.current) {
      window.clearTimeout(badgeSyncNoticeTimerRef.current);
    }
    badgeSyncNoticeTimerRef.current = window.setTimeout(() => {
      setIsBadgeSyncInProgress(false);
      badgeSyncNoticeTimerRef.current = null;
    }, 45_000);
  };

  // --- REAL-TIME FIREBASE SYNC HOOKS ---
  const activeDeliveryVisibleDepartmentsKey = normalizeServiceList(activeProfile.deliveryVisibleDepartments || []).join('|');
  useEffect(() => {
    if (!isConfigured || !db) {
       return;
    }

    if (!firebaseUser || !cloudProfileReady) {
      return;
    }

    const currentUid = firebaseUser.uid;
    const currentEmail = (firebaseUser.email || '').trim().toLowerCase();
    if (!currentUid) {
      return;
    }

    const applyUserDirectory = (list: UserProfile[], source: string) => {
      const isCompleteDirectory = list.length >= MIN_COMPLETE_USER_DIRECTORY_SIZE;
      const preservePreviousValues = !isCompleteDirectory || source.toLowerCase().includes('secours') || source.toLowerCase().includes('cache');
      setProfiles(previous => {
        if (!isCompleteDirectory && previous.length >= MIN_COMPLETE_USER_DIRECTORY_SIZE) {
          return previous;
        }
        const previousById = new Map(previous.map(profile => [profile.id, profile]));
        const merged = list.map(profile => {
          const previousProfile = previousById.get(profile.id);
          if (!previousProfile) return profile;
          return protectTransientProfileState(previousProfile, profile, preservePreviousValues);
        });
        return merged.length > 0 ? merged : previous;
      });
      const match = chooseBestProfile(
        list.filter(u => u.id === activeProfile.id || u.email.toLowerCase() === currentEmail),
        currentUid
      );
      if (match) {
        setActiveProfile(previous => {
          if (isTransientProfileReadProtected(previous, match, preservePreviousValues)) {
            showBadgeSyncNotice();
          }
          const protectedMatch = protectTransientProfileState(previous, match, preservePreviousValues);
          if (protectedMatch.role === 'employee' && (protectedMatch.status === 'blocked' || isContractExpired(protectedMatch))) {
            if (auth) signOut(auth).catch(() => undefined);
            return previous;
          }
          return isSameActiveProfileState(previous, protectedMatch) ? previous : protectedMatch;
        });
      }
      if (isCompleteDirectory) {
        safeLocalStorageSet('ndamatou_profiles_last_good', compactProfilesForCache(list));
      }
    };

    const recoverUsersViaRest = async (reason: string) => {
      try {
        const restProfiles = await fetchUsersDirectoryViaRest(firebaseUser);
        setRestDirectoryStatus(`REST ${reason}: ${restProfiles.length}`);
        if (restProfiles.length >= MIN_COMPLETE_USER_DIRECTORY_SIZE) {
          applyUserDirectory(restProfiles, `REST ${reason}`);
        } else {
          throw new Error(`REST incomplet ${restProfiles.length}`);
        }
      } catch (error) {
        try {
          const hostedProfiles = await fetchUsersDirectoryViaHostedFallback();
          setRestDirectoryStatus(`REST ${reason}: erreur ${error instanceof Error ? error.message : 'inconnue'} | secours integre: ${hostedProfiles.length} (${USERS_DIRECTORY_FALLBACK_GENERATED_AT.slice(0, 10)})`);
          if (hostedProfiles.length >= MIN_COMPLETE_USER_DIRECTORY_SIZE) {
            applyUserDirectory(hostedProfiles, 'annuaire secours');
            return;
          }
        } catch (fallbackError) {
          const cachedProfiles = readLocalStorageJson<UserProfile[]>('ndamatou_profiles_last_good', []);
          setRestDirectoryStatus(`REST ${reason}: erreur ${error instanceof Error ? error.message : 'inconnue'} | secours erreur ${fallbackError instanceof Error ? fallbackError.message : 'inconnue'}${cachedProfiles.length > 1 ? ` | cache ${cachedProfiles.length}` : ''}`);
          if (cachedProfiles.length >= MIN_COMPLETE_USER_DIRECTORY_SIZE) {
            applyUserDirectory(cachedProfiles.map(profile => normalizeFirebaseProfile(profile, profile.id)), 'cache profils');
          }
        }
      }
    };

    const applyMealsDirectory = (list: Meal[], source: string) => {
      const normalizedMeals = list.map(cleanLegacyMeal);
      if (normalizedMeals.length === 0) return;
      setMeals(previous => normalizedMeals.length > 0 ? normalizedMeals : previous);
      safeLocalStorageSet('ndamatou_meals_last_good', normalizedMeals);
    };

    const recoverMealsDirectory = async (reason: string) => {
      try {
        const serverSnapshot = await getDocsFromServer(collection(db, 'meals'));
        const serverMeals: Meal[] = [];
        serverSnapshot.forEach(item => serverMeals.push(cleanLegacyMeal({ ...(item.data() as Meal), id: item.id })));
        if (serverMeals.length > 0) {
          applyMealsDirectory(serverMeals, `serveur ${reason}`);
          return;
        }
        throw new Error('serveur vide');
      } catch (serverError) {
        try {
          const restMeals = await fetchMealsViaRest(firebaseUser);
          if (restMeals.length > 0) {
            applyMealsDirectory(restMeals, `REST ${reason}`);
            return;
          }
          throw new Error('REST vide');
        } catch (restError) {
          const cachedMeals = readLocalStorageJson<Meal[]>('ndamatou_meals_last_good', []);
          if (cachedMeals.length > 0) {
            applyMealsDirectory(cachedMeals, `cache ${reason}`);
            return;
          }
          console.warn('Impossible de récupérer les repas', { reason, serverError, restError });
        }
      }
    };

    // 1. Sync meals
    const unsubMeals = onSnapshot(collection(db, 'meals'), (snapshot) => {
      if (snapshot.empty) {
        void recoverMealsDirectory('snapshot vide');
      } else {
        const list: Meal[] = [];
        snapshot.forEach((doc) => {
          list.push({ ...(doc.data() as Meal), id: doc.id });
        });
        applyMealsDirectory(list, 'SDK');
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'meals');
      void recoverMealsDirectory('erreur snapshot');
    });

    // 2. Sync profiles / users.
    const canReadFullUserDirectory =
      ['admin', 'restaurant_admin', 'accountant', 'delivery', 'hr', 'operator'].includes(activeProfile.role) ||
      activeProfile.hrAccess === true ||
      activeProfile.accountantAccess === true ||
      activeProfile.deliveryCodeViewer === true;
    const userDirectoryBucket = new Map<string, UserProfile>();
    const handleUsersSnapshot = (snapshot: any) => {
      const list: UserProfile[] = canReadFullUserDirectory
        ? []
        : Array.from(userDirectoryBucket.values());
      snapshot.forEach((doc) => {
        const profile = normalizeFirebaseProfile(doc.data() as Partial<UserProfile>, doc.id);
        if (canReadFullUserDirectory) {
          list.push(profile);
        } else {
          userDirectoryBucket.set(profile.id, profile);
        }
      });
      const nextList = canReadFullUserDirectory ? list : Array.from(userDirectoryBucket.values());
      setUserDirectoryStatus(`SDK users: ${nextList.length}`);
      applyUserDirectory(nextList, 'SDK');
      if (canReadFullUserDirectory && nextList.length < 50) void recoverUsersViaRest(`apres SDK=${nextList.length}`);
    };
    const deliveryReadableDepartments = normalizeServiceList([
      activeProfile.department,
      ...(activeProfile.deliveryVisibleDepartments || []),
    ]);
    const userSources = canReadFullUserDirectory
      ? [query(collection(db, 'users'), limit(ADMIN_USERS_LIMIT))]
      : [
          query(collection(db, 'users'), where('email', '==', currentEmail), limit(5)),
          ...(activeProfile.department
            ? [query(collection(db, 'users'), where('department', '==', activeProfile.department), limit(500))]
            : []),
        ];
    const userUnsubs = userSources.map((source, index) => onSnapshot(
      source,
      handleUsersSnapshot,
      (error) => {
        setUserDirectoryStatus(`Erreur profils: ${getFirestoreErrorCode(error) || 'lecture refusee'}`);
        handleFirestoreError(error, OperationType.LIST, `users/source-${index}`);
      }
    ));
    const unsubUsers = () => userUnsubs.forEach(unsubscribe => unsubscribe());

    // 3. Sync orders. Delivery issuers receive active candidates from their own service.
    const canReadAllOrders =
      ['admin', 'restaurant_admin', 'accountant', 'delivery', 'operator'].includes(activeProfile.role) ||
      activeProfile.hrAccess === true ||
      activeProfile.accountantAccess === true;
    const canReadServiceOrders =
      !canReadAllOrders &&
      activeProfile.role === 'employee' &&
      Boolean(activeProfile.deliveryCodeViewer);
    const ownOrdersProfileId = activeProfile.id || currentUid;
    const orderUnsubs: Array<() => void> = [];
    const applyOrdersSnapshot = (snapshot: any, bucket?: Map<string, Order>) => {
      const list: Order[] = [];
      snapshot.forEach((doc: any) => {
        list.push(normalizeFirebaseOrder(doc.data() as Partial<Order>));
      });
      if (bucket) {
        list.forEach(order => bucket.set(order.id, order));
        const merged = Array.from(bucket.values()).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setOrders(merged);
      } else {
        list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setOrders(list);
      }
    };
    if (canReadAllOrders) {
      orderUnsubs.push(onSnapshot(query(collection(db, 'orders'), orderBy('createdAt', 'desc'), limit(ADMIN_RECENT_ORDERS_LIMIT)), (snapshot) => {
        applyOrdersSnapshot(snapshot);
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, 'orders');
      }));
    } else if (canReadServiceOrders) {
      orderUnsubs.push(onSnapshot(query(collection(db, 'orders'), orderBy('createdAt', 'desc'), limit(ADMIN_RECENT_ORDERS_LIMIT)), (snapshot) => {
        const serviceOrderBucket = new Map<string, Order>();
        snapshot.forEach((doc: any) => {
          const order = normalizeFirebaseOrder(doc.data() as Partial<Order>);
          const normalizedDepartment = normalizeHospitalService(order.department);
          if (deliveryReadableDepartments.includes(normalizedDepartment)) {
            serviceOrderBucket.set(order.id, { ...order, department: normalizedDepartment });
          }
        });
        const merged = Array.from(serviceOrderBucket.values()).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setOrders(merged);
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, 'orders/delivery-visible');
      }));
    } else {
      orderUnsubs.push(onSnapshot(query(collection(db, 'orders'), where('employeeId', '==', ownOrdersProfileId), limit(120)), (snapshot) => {
        applyOrdersSnapshot(snapshot);
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, 'orders');
      }));
    }
    const unsubOrders = () => orderUnsubs.forEach(unsubscribe => unsubscribe());

    // 4. Sync notifications. Personnel accounts only subscribe to their own messages.
    const canReadAllNotifications = ['admin', 'restaurant_admin'].includes(activeProfile.role);
    const notificationsSource = canReadAllNotifications
      ? query(collection(db, 'notifications'), orderBy('timestamp', 'desc'), limit(ADMIN_RECENT_NOTIFICATIONS_LIMIT))
      : query(collection(db, 'notifications'), where('userId', '==', currentUid), limit(80));
    const unsubNotifs = onSnapshot(notificationsSource, (snapshot) => {
      if (snapshot.empty) {
        setNotifications([]);
      } else {
        const list: AppNotification[] = [];
        snapshot.forEach((doc) => {
          list.push(doc.data() as AppNotification);
        });
        // Sort newest first
        list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        setNotifications(list);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'notifications');
    });

    const canReadCashTransactions =
      ['admin', 'restaurant_admin', 'accountant', 'operator'].includes(activeProfile.role) ||
      activeProfile.accountantAccess === true ||
      activeProfile.hrAccess === true;
    const cashTransactionsSource = canReadCashTransactions
      ? query(collection(db, 'cashTransactions'), orderBy('createdAt', 'desc'), limit(ADMIN_RECENT_TRANSACTIONS_LIMIT))
      : query(collection(db, 'cashTransactions'), where('employeeId', '==', currentUid), limit(80));
    const unsubCashTransactions = onSnapshot(cashTransactionsSource, (snapshot) => {
          const list: CashTransaction[] = [];
          snapshot.forEach((item) => list.push(item.data() as CashTransaction));
          list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          setCashTransactions(list);
        }, (error) => {
          handleFirestoreError(error, OperationType.LIST, 'cashTransactions');
        });

    const canReadAllWaveTopups =
      ['admin', 'restaurant_admin', 'accountant'].includes(activeProfile.role) ||
      activeProfile.accountantAccess === true;
    const waveTopupsSource = canReadAllWaveTopups
      ? query(collection(db, 'waveTopupRequests'), orderBy('createdAt', 'desc'), limit(ADMIN_RECENT_REQUESTS_LIMIT))
      : query(collection(db, 'waveTopupRequests'), where('employeeId', '==', currentUid), limit(50));
    const unsubWaveTopups = onSnapshot(waveTopupsSource, (snapshot) => {
      const list: WaveTopupRequest[] = [];
      snapshot.forEach((item) => list.push(item.data() as WaveTopupRequest));
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setWaveTopupRequests(list);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'waveTopupRequests');
    });

    const canReadAllPrepaidCards =
      ['admin', 'restaurant_admin', 'accountant'].includes(activeProfile.role) ||
      activeProfile.accountantAccess === true;
    const prepaidCardsSource = canReadAllPrepaidCards
      ? query(collection(db, 'prepaidCards'), orderBy('createdAt', 'desc'), limit(ADMIN_RECENT_REQUESTS_LIMIT))
      : query(collection(db, 'prepaidCards'), where('employeeId', '==', currentUid), limit(50));
    const unsubPrepaidCards = onSnapshot(prepaidCardsSource, (snapshot) => {
      const list: PrepaidCard[] = [];
      snapshot.forEach((item) => list.push(item.data() as PrepaidCard));
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setPrepaidCards(list);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'prepaidCards');
    });

    return () => {
      unsubMeals();
      unsubUsers();
      unsubOrders();
      unsubNotifs();
      unsubCashTransactions();
      unsubWaveTopups();
      unsubPrepaidCards();
    };
  }, [isConfigured, firebaseUser, cloudProfileReady, activeProfile.id, activeProfile.role, activeProfile.department, activeProfile.hrAccess, activeProfile.accountantAccess, activeDeliveryVisibleDepartmentsKey]);

  useEffect(() => {
    if (!isConfigured || !firebaseUser || !cloudProfileReady) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const restProfiles = await fetchUsersDirectoryViaRest(firebaseUser);
        if (cancelled) return;
        setUserDirectoryStatus(`Profils REST: ${restProfiles.length}`);
        if (restProfiles.length >= MIN_COMPLETE_USER_DIRECTORY_SIZE) {
          setProfiles(previous => {
            const previousById = new Map(previous.map(profile => [profile.id, profile]));
            return restProfiles.map(profile => {
              const previousProfile = previousById.get(profile.id);
              if (!previousProfile) return profile;
              return protectTransientProfileState(previousProfile, profile, false);
            });
          });
          const match = chooseBestProfile(
            restProfiles.filter(profile => profile.id === activeProfile.id || profile.email.toLowerCase() === activeProfile.email.toLowerCase()),
            firebaseUser.uid
          );
          if (match) setActiveProfile(previous => {
            if (isTransientProfileReadProtected(previous, match, false)) {
              showBadgeSyncNotice();
            }
            const protectedMatch = protectTransientProfileState(previous, match, false);
            return isSameActiveProfileState(previous, protectedMatch) ? previous : protectedMatch;
          });
        } else if (restProfiles.length > 0) {
          setProfiles(previous => previous.length >= MIN_COMPLETE_USER_DIRECTORY_SIZE ? previous : restProfiles);
        }
      } catch (error) {
        if (!cancelled) {
          setUserDirectoryStatus(`Erreur REST profils: ${error instanceof Error ? error.message : 'lecture impossible'}`);
        }
      }
    }, 1200);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [isConfigured, firebaseUser, cloudProfileReady, activeProfile.id, activeProfile.email]);

  useEffect(() => {
    if (!isConfigured || !db || !firebaseUser || !cloudProfileReady) return;

    const canReadOperationalData =
      ['admin', 'restaurant_admin', 'accountant', 'delivery', 'hr', 'operator'].includes(activeProfile.role) ||
      activeProfile.hrAccess === true ||
      activeProfile.accountantAccess === true ||
      activeProfile.deliveryCodeViewer === true;

    if (!canReadOperationalData) return;

    const needsOneShotServerRefresh =
      profiles.length < MIN_COMPLETE_USER_DIRECTORY_SIZE ||
      meals.length === 0;

    if (!needsOneShotServerRefresh) return;

    let cancelled = false;
    const refreshCloudDataOnce = async () => {
      try {
        const [usersSnapshot, mealsSnapshot] = await Promise.all([
          getDocsFromServer(query(collection(db, 'users'), limit(ADMIN_USERS_LIMIT))),
          getDocsFromServer(collection(db, 'meals')),
        ]);

        if (cancelled) return;

        const nextProfiles: UserProfile[] = [];
        usersSnapshot.forEach(item => nextProfiles.push(normalizeFirebaseProfile(item.data() as Partial<UserProfile>, item.id)));
        setUserDirectoryStatus(`Profils serveur: ${nextProfiles.length}`);
        if (nextProfiles.length > 0) {
          const readableDepartments = normalizeServiceList([
            activeProfile.department,
            ...(activeProfile.deliveryVisibleDepartments || []),
          ]);
          const shouldRestrictToDeliveryDepartments =
            activeProfile.role === 'employee' &&
            activeProfile.hrAccess !== true &&
            activeProfile.accountantAccess !== true &&
            !['admin', 'restaurant_admin', 'accountant', 'delivery', 'hr', 'operator'].includes(activeProfile.role);
          const filteredProfiles = shouldRestrictToDeliveryDepartments
            ? nextProfiles.filter(profile => readableDepartments.includes(normalizeHospitalService(profile.department)))
            : nextProfiles;
          const directoryToKeep = nextProfiles.length >= MIN_COMPLETE_USER_DIRECTORY_SIZE
            ? nextProfiles
            : filteredProfiles;
          setProfiles(previous => {
            if (directoryToKeep.length < MIN_COMPLETE_USER_DIRECTORY_SIZE && previous.length >= MIN_COMPLETE_USER_DIRECTORY_SIZE) {
              return previous;
            }
            const preservePreviousValues = directoryToKeep.length < MIN_COMPLETE_USER_DIRECTORY_SIZE;
            const previousById = new Map(previous.map(profile => [profile.id, profile]));
            const merged = directoryToKeep.map(profile =>
              protectTransientProfileState(previousById.get(profile.id), profile, preservePreviousValues)
            );
            return merged.length > 0 ? merged : previous;
          });
          const match = nextProfiles.find(profile => profile.id === activeProfile.id || profile.email === activeProfile.email);
          if (match) setActiveProfile(previous => {
            const preservePreviousValues = nextProfiles.length < MIN_COMPLETE_USER_DIRECTORY_SIZE;
            if (isTransientProfileReadProtected(previous, match, preservePreviousValues)) {
              showBadgeSyncNotice();
            }
            const protectedMatch = protectTransientProfileState(previous, match, preservePreviousValues);
            return isSameActiveProfileState(previous, protectedMatch) ? previous : protectedMatch;
          });
        }

        const nextMeals: Meal[] = [];
        mealsSnapshot.forEach(item => nextMeals.push(cleanLegacyMeal(item.data() as Meal)));
        setMeals(nextMeals);


      } catch (error) {
        setUserDirectoryStatus(`Erreur serveur profils: ${getFirestoreErrorCode(error) || 'lecture impossible'}`);
        handleFirestoreError(error, OperationType.LIST, 'cloud-refresh/fallback');
      }
    };

    const timer = window.setTimeout(refreshCloudDataOnce, 800);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [isConfigured, firebaseUser, cloudProfileReady, activeProfile.id, activeProfile.role, activeProfile.department, activeProfile.email, activeProfile.hrAccess, activeProfile.accountantAccess, activeProfile.deliveryCodeViewer, activeProfile.deliveryVisibleDepartments, profiles.length, meals.length]);

  // Sync state changes with localStorage as offline cache / secondary state persistence
  useEffect(() => {
    clearLargeFirebaseCaches();
  }, []);

  useEffect(() => {
    if (!isConfigured) safeLocalStorageSet('ndamatou_meals', meals);
  }, [meals]);

  useEffect(() => {
    if (!isConfigured) safeLocalStorageSet('ndamatou_orders', orders);
  }, [orders]);

  useEffect(() => {
    if (!isConfigured) safeLocalStorageSet('ndamatou_notifications', notifications);
  }, [notifications]);

  useEffect(() => {
    if (!isConfigured) safeLocalStorageSet('ndamatou_cash_transactions', cashTransactions);
  }, [cashTransactions]);

  useEffect(() => {
    if (!isConfigured) safeLocalStorageSet('ndamatou_wave_topup_requests', waveTopupRequests);
  }, [waveTopupRequests]);

  useEffect(() => {
    if (!isConfigured) safeLocalStorageSet('ndamatou_prepaid_cards', prepaidCards);
  }, [prepaidCards]);

  useEffect(() => {
    if (!isConfigured) safeLocalStorageSet('ndamatou_profiles', profiles);
  }, [profiles]);

  useEffect(() => {
    if (!isConfigured) safeLocalStorageSet('ndamatou_active_profile', activeProfile);
  }, [activeProfile]);

  useEffect(() => {
    safeLocalStorageSet('ndamatou_institution_config', institutionConfig);
  }, [institutionConfig]);

  // Handle system wide notifications addition
  const addNotification = (
    title: string,
    message: string,
    type: 'info' | 'success' | 'warning' | 'alert',
    orderId?: string,
    targetUserId: string = activeProfile.id
  ) => {
    const newNotif: AppNotification = {
      id: `notif-${Date.now()}`,
      userId: targetUserId,
      title,
      message,
      type,
      timestamp: new Date().toISOString(),
      read: false,
      ...(orderId ? { orderId } : {})
    };

    const currentAuthUid = auth?.currentUser?.uid || '';
    const canWriteTargetNotification =
      currentAuthUid === targetUserId ||
      ['admin', 'restaurant_admin', 'delivery'].includes(activeProfile.role);

    if (isConfigured && db && currentAuthUid && canWriteTargetNotification) {
      setDoc(doc(db, 'notifications', newNotif.id), newNotif).catch(error => {
        handleFirestoreError(error, OperationType.WRITE, `notifications/${newNotif.id}`);
      });
    } else if (!isConfigured || !db) {
      setNotifications(prev => [newNotif, ...prev]);
    }
    if (targetUserId === activeProfile.id) {
      setActiveToast(newNotif);
    }
  };

  const handleSelfPasswordReset = async () => {
    if (!auth) return;
    const normalizedEmail = loginEmail.trim().toLowerCase();
    setPasswordResetMessage('');
    setLoginError('');
    if (!normalizedEmail) {
      setPasswordResetMessage("Saisissez d'abord votre adresse e-mail dans le champ ci-dessus.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setPasswordResetMessage("Cette adresse e-mail n'est pas valide.");
      return;
    }
    setIsSendingPasswordReset(true);
    try {
      await sendPasswordResetEmail(auth, normalizedEmail);
      setPasswordResetMessage(
        `Si ${normalizedEmail} correspond à un compte Firebase, un lien de réinitialisation vient d'être envoyé. Vérifiez aussi les courriers indésirables.`
      );
    } catch (error) {
      const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';
      const messageByCode: Record<string, string> = {
        'auth/invalid-email': "Cette adresse e-mail n'est pas valide.",
        'auth/user-not-found': "Aucun compte Firebase ne correspond à cette adresse. Si l'e-mail utilisé à l'inscription était fictif, contactez l'administrateur pour remplacer l'adresse.",
        'auth/too-many-requests': 'Trop de demandes ont été envoyées. Patientez quelques minutes avant de réessayer.',
        'auth/network-request-failed': 'Connexion à Firebase impossible. Vérifiez Internet puis réessayez.',
      };
      setPasswordResetMessage(messageByCode[code] || "Envoi impossible. Si votre ancien e-mail était fictif, contactez l'administrateur pour récupérer votre compte.");
    } finally {
      setIsSendingPasswordReset(false);
    }
  };

  useEffect(() => {
    const sendAccountingExportReminder = () => {
      const reminderDate = new Date();
      const reminderKey = `ndamatou_accounting_export_reminder_${getLocalDateKey(reminderDate)}`;
      if (localStorage.getItem(reminderKey)) return;
      const accountantProfiles = profiles.filter(profile => profile.role === 'accountant');
      accountantProfiles.forEach(profile => {
        addNotification(
          'Sauvegarde comptable 18h',
          "Téléchargez l'export Excel complet: ventes, encaissements, demandes Wave, cartes prépayées et soldes badges.",
          'warning',
          undefined,
          profile.id
        );
      });
      if (accountantProfiles.length > 0) {
        localStorage.setItem(reminderKey, 'sent');
      }
    };

    const scheduleNextReminder = () => {
      const current = new Date();
      const next = new Date(current);
      next.setHours(18, 0, 0, 0);
      if (next <= current) next.setDate(next.getDate() + 1);
      return window.setTimeout(() => {
        sendAccountingExportReminder();
        reminderTimeout = scheduleNextReminder();
      }, next.getTime() - current.getTime());
    };

    if (new Date().getHours() >= 18) {
      sendAccountingExportReminder();
    }
    let reminderTimeout = scheduleNextReminder();
    return () => window.clearTimeout(reminderTimeout);
  }, [profiles, activeProfile.id, isConfigured]);

  // Callback to update local employee profile variables
  const handleUpdateProfile = async (updated: UserProfile) => {
    const explicitProfilePatchKeys = Array.isArray((updated as unknown as { __adminPatchKeys?: unknown }).__adminPatchKeys)
      ? ((updated as unknown as { __adminPatchKeys?: Array<keyof UserProfile> }).__adminPatchKeys || [])
      : null;
    const previousProfile = activeProfile;
    const editsOwnProfile = String(updated.id || activeProfile.id || '') === activeProfile.id;
    let normalizedUpdated: UserProfile = {
      ...updated,
      id: String(updated.id || activeProfile.id || ''),
      name: String(updated.name || '').trim(),
      email: String(updated.email || (editsOwnProfile ? (activeProfile.email || auth?.currentUser?.email || '') : '')).trim().toLowerCase(),
      phone: String(updated.phone || ''),
      badgeNumber: String(updated.badgeNumber || (editsOwnProfile ? activeProfile.badgeNumber : '') || ''),
      department: normalizeHospitalService(String(updated.department || '')),
      building: String(updated.building || ''),
      floor: String(updated.floor || ''),
      room: String(updated.room || ''),
      walletBalance: Number.isFinite(Number(updated.walletBalance)) ? Number(updated.walletBalance) : 0,
      role: updated.role || activeProfile.role,
    };
    const localExistingProfile = profiles.find(profile =>
      profile.id === normalizedUpdated.id || sameProfileIdentity(profile, normalizedUpdated)
    );
    normalizedUpdated = preventValidatedProfilePendingRegression(normalizedUpdated, localExistingProfile);
    if (!normalizedUpdated.name) {
      throw new Error('Le nom et prénom sont obligatoires.');
    }
    if (!normalizedUpdated.email) {
      throw new Error("L'adresse e-mail du compte est absente. Renseignez une adresse e-mail valide.");
    }
    const emailChanged = normalizedUpdated.id === activeProfile.id && normalizedUpdated.email !== String(activeProfile.email || '').trim().toLowerCase();

    if (isConfigured && db) {
      try {
        const isHrEditingAnotherProfile =
          normalizedUpdated.id !== activeProfile.id &&
          activeWorkspace === 'hr' &&
          !['admin', 'restaurant_admin', 'operator', 'accountant', 'delivery'].includes(activeProfile.role) &&
          (activeProfile.role === 'hr' || activeProfile.hrAccess === true);
        if (isHrEditingAnotherProfile) {
          if (firebaseUser) {
            try {
              await mirrorAuthenticatedAccessProfile(firebaseUser, activeProfile);
            } catch (mirrorError) {
              console.warn('Miroir acces DRH non synchronise, validation directe tentee.', mirrorError);
            }
          }
          const targetProfileRef = doc(db, 'users', normalizedUpdated.id);
          let targetProfileSnap: Awaited<ReturnType<typeof getDocFromServer>> | Awaited<ReturnType<typeof getDoc>> | null = null;
          try {
            targetProfileSnap = await getDocFromServer(targetProfileRef);
          } catch {
            targetProfileSnap = await getDoc(targetProfileRef).catch(() => null);
          }
          const targetProfileExists = Boolean(targetProfileSnap?.exists());
          const rawRemoteProfile = targetProfileExists && targetProfileSnap
            ? targetProfileSnap.data() as Partial<UserProfile>
            : null;
          const remoteProfile = rawRemoteProfile && targetProfileSnap
            ? normalizeFirebaseProfile(rawRemoteProfile, targetProfileSnap.id)
            : null;
          const remoteNeedsPendingRepair =
            rawRemoteProfile &&
            ['pending', 'attente', 'en attente', 'validation', 'a valider', 'à valider'].includes(String(rawRemoteProfile.status || '').trim().toLowerCase()) &&
            hasDrhValidationTrace(rawRemoteProfile) &&
            !toStrictBoolean(rawRemoteProfile.badgeBlocked);
          const existingProfile = remoteProfile || profiles.find(profile => profile.id === normalizedUpdated.id) || updated;
          normalizedUpdated = preventValidatedProfilePendingRegression(normalizedUpdated, existingProfile);
          if (normalizedUpdated.status === 'active' && normalizedUpdated.badgeBlocked === false) {
            normalizedUpdated = {
              ...normalizedUpdated,
              verificationFlagged: false,
              validatedById: activeProfile.id || firebaseUser?.uid || '',
              validatedByName: activeProfile.name || normalizedUpdated.validatedByName || 'Administration Ndamatou',
              validatedAt: normalizedUpdated.validatedAt || new Date().toISOString(),
            };
          }
          const allowedHrKeys: Array<keyof UserProfile> = [
            'name',
            'email',
            'phone',
            'status',
            'badgeBlocked',
            'subsidyExcluded',
            'alwaysStaffMealPrice',
            'employmentType',
            'contractEndDate',
            'department',
            'building',
            'floor',
            'room',
            'verificationFlagged',
            'verificationFlaggedAt',
            'verificationFlaggedBy',
            'validatedById',
            'validatedByName',
            'validatedAt',
          ];
          const hrPatch = allowedHrKeys.reduce<Record<string, unknown>>((patch, key) => {
            const forceKey = explicitProfilePatchKeys?.includes(key);
            if (forceKey || JSON.stringify(existingProfile[key]) !== JSON.stringify(normalizedUpdated[key])) {
              if (normalizedUpdated[key] !== undefined) {
                patch[key] = normalizedUpdated[key];
              }
            }
            return patch;
          }, {});
          if (remoteNeedsPendingRepair) {
            hrPatch.status = 'active';
            hrPatch.badgeBlocked = false;
          }

          if (Object.keys(hrPatch).length === 0 && targetProfileExists) {
            setActiveWorkspace('hr');
            return;
          }

          try {
            const hrCreatePayload = firestoreSafe({
              id: normalizedUpdated.id,
              name: normalizedUpdated.name,
              email: normalizedUpdated.email,
              phone: normalizedUpdated.phone || '',
              badgeNumber: normalizedUpdated.badgeNumber || buildReadableBadgeNumber(normalizedUpdated.id),
              department: normalizeHospitalService(normalizedUpdated.department || ''),
              building: normalizedUpdated.building || '',
              floor: normalizedUpdated.floor || '',
              room: normalizedUpdated.room || '',
              walletBalance: Math.max(0, Math.trunc(Number(existingProfile.walletBalance ?? normalizedUpdated.walletBalance ?? 0) || 0)),
              role: 'employee' as const,
              status: normalizedUpdated.status || 'active',
              badgeBlocked: Boolean(normalizedUpdated.badgeBlocked),
              subsidyExcluded: Boolean(normalizedUpdated.subsidyExcluded),
              alwaysStaffMealPrice: Boolean(normalizedUpdated.alwaysStaffMealPrice),
              extraSubsidyCredits: Math.max(0, Math.trunc(Number(normalizedUpdated.extraSubsidyCredits || 0) || 0)),
              employmentType: normalizedUpdated.employmentType || '',
              contractEndDate: normalizedUpdated.contractEndDate || '',
              verificationFlagged: Boolean(normalizedUpdated.verificationFlagged),
              verificationFlaggedAt: normalizedUpdated.verificationFlaggedAt || '',
              verificationFlaggedBy: normalizedUpdated.verificationFlaggedBy || '',
              validatedById: normalizedUpdated.validatedById || activeProfile.id,
              validatedByName: normalizedUpdated.validatedByName || activeProfile.name || 'DRH Ndamatou',
              validatedAt: normalizedUpdated.validatedAt || new Date().toISOString(),
              hrAccess: false,
              accountantAccess: false,
              deliveryAllowed: Boolean(normalizedUpdated.deliveryAllowed),
              deliveryCodeViewer: Boolean(normalizedUpdated.deliveryCodeViewer),
              deliveryVisibleDepartments: normalizeServiceList(normalizedUpdated.deliveryVisibleDepartments || []),
              deliverySelectionDailyLimit: Math.max(1, Math.trunc(Number(normalizedUpdated.deliverySelectionDailyLimit || 1) || 1)),
              photoUrl: normalizedUpdated.photoUrl || '',
              whatsappOptIn: Boolean(normalizedUpdated.whatsappOptIn),
            });
            const hrWritePayload = targetProfileExists ? firestoreSafe(hrPatch) : hrCreatePayload;
            console.info('Patch DRH Firebase', {
              target: normalizedUpdated.id,
              actor: activeProfile.id,
              actorEmail: firebaseUser?.email,
              targetExists: targetProfileExists,
              keys: Object.keys(hrWritePayload),
              patch: hrWritePayload,
            });
            await retryFirestoreWrite(() => setDoc(
              targetProfileRef,
              hrWritePayload,
              { merge: true }
            ));
            const isDrhValidationAction =
              normalizedUpdated.status === 'active' &&
              normalizedUpdated.badgeBlocked === false &&
              Boolean(normalizedUpdated.validatedAt || normalizedUpdated.validatedById || normalizedUpdated.validatedByName);
            let verifiedDrhPatch: Record<string, unknown> = targetProfileExists ? { ...hrPatch } : { ...hrCreatePayload };
            if (isDrhValidationAction) {
              const validationPatch = firestoreSafe({
                status: 'active',
                badgeBlocked: false,
                verificationFlagged: false,
                validatedById: normalizedUpdated.validatedById || activeProfile.id,
                validatedByName: normalizedUpdated.validatedByName || activeProfile.name || 'DRH Ndamatou',
                validatedAt: normalizedUpdated.validatedAt || new Date().toISOString(),
              });
              const verifySnap = await getDocFromServer(targetProfileRef).catch(() => null);
              const verifyData = verifySnap?.exists() ? verifySnap.data() as Partial<UserProfile> : null;
              const stillPending = verifyData && (
                String(verifyData.status || '').trim().toLowerCase() !== 'active' ||
                toStrictBoolean(verifyData.badgeBlocked)
              );
              if (stillPending) {
                await retryFirestoreWrite(() => setDoc(targetProfileRef, validationPatch, { merge: true }));
              }
              verifiedDrhPatch = { ...verifiedDrhPatch, ...validationPatch };
            }
            const localPatch = verifiedDrhPatch;
            setProfiles(prev => {
              if (prev.some(profile => profile.id === normalizedUpdated.id)) {
                return prev.map(profile =>
                  profile.id === normalizedUpdated.id ? { ...profile, ...localPatch } as UserProfile : profile
                );
              }
              return [normalizeFirebaseProfile(localPatch as Partial<UserProfile>, normalizedUpdated.id), ...prev];
            });
          } catch (hrError) {
            handleFirestoreError(hrError, OperationType.UPDATE, `users/${normalizedUpdated.id}/hr-validation`);
            throw hrError;
          }
          setActiveWorkspace('hr');
          addNotification('DRH', 'Modification DRH enregistrée.', 'success', undefined, activeProfile.id);
          return;
        }

        const isDeliveryIssuerEditingServiceProfile =
          normalizedUpdated.id !== activeProfile.id &&
          activeProfile.deliveryCodeViewer === true &&
          activeWorkspace === 'employee' &&
          normalizeServiceList([
            activeProfile.department,
            ...(activeProfile.deliveryVisibleDepartments || []),
          ]).includes(normalizedUpdated.department);
        if (isDeliveryIssuerEditingServiceProfile) {
          const existingProfile = profiles.find(profile => profile.id === normalizedUpdated.id) || updated;
          const deliveryPatchKeys: Array<keyof UserProfile> = [
            'deliveryPreAuthorizedUntil',
            'deliveryPreAuthorizedById',
            'deliveryPreAuthorizedByName',
            'deliveryPreAuthorizedScope',
          ];
          const deliveryPatch = deliveryPatchKeys.reduce<Record<string, unknown>>((patch, key) => {
            if (JSON.stringify(existingProfile[key]) !== JSON.stringify(normalizedUpdated[key])) {
              patch[key] = normalizedUpdated[key] ?? null;
            }
            return patch;
          }, {});

          if (Object.keys(deliveryPatch).length === 0) {
            setActiveWorkspace('employee');
            return;
          }

          await retryFirestoreWrite(() => setDoc(
            doc(db, 'users', normalizedUpdated.id),
            firestoreSafe(deliveryPatch),
            { merge: true }
          ));
          setProfiles(prev => prev.map(profile =>
            profile.id === normalizedUpdated.id ? { ...profile, ...deliveryPatch } as UserProfile : profile
          ));
          setActiveWorkspace('employee');
          addNotification('Livraison', 'Activation livraison enregistrée.', 'success', undefined, activeProfile.id);
          return;
        }

        const isAdminEditingAnotherProfile =
          normalizedUpdated.id !== activeProfile.id &&
          (
            activeProfile.role === 'admin' ||
            activeProfile.role === 'restaurant_admin' ||
            activeProfile.role === 'operator' ||
            activeProfile.hrAccess === true ||
            activeProfile.accountantAccess === true ||
            activeProfile.deliveryCodeViewer === true
          );
        if (isAdminEditingAnotherProfile) {
          const existingProfile = profiles.find(profile => profile.id === normalizedUpdated.id) || updated;
          normalizedUpdated = preventValidatedProfilePendingRegression(normalizedUpdated, existingProfile);
          if (normalizedUpdated.status === 'active' && normalizedUpdated.badgeBlocked === false) {
            normalizedUpdated = {
              ...normalizedUpdated,
              verificationFlagged: false,
              validatedById: activeProfile.id || firebaseUser?.uid || '',
              validatedByName: activeProfile.name || normalizedUpdated.validatedByName || 'Administration Ndamatou',
              validatedAt: normalizedUpdated.validatedAt || new Date().toISOString(),
            };
          }
          const allowedAdminKeys: Array<keyof UserProfile> = [
            'name',
            'email',
            'phone',
            'status',
            'badgeBlocked',
            'subsidyExcluded',
            'alwaysStaffMealPrice',
            'extraSubsidyCredits',
            'employmentType',
            'contractEndDate',
            'department',
            'building',
            'floor',
            'room',
            'role',
            'hrAccess',
            'accountantAccess',
            'deliveryAllowed',
            'deliveryCodeViewer',
            'deliveryVisibleDepartments',
            'deliverySelectionDailyLimit',
            'deliveryPreAuthorizedUntil',
            'deliveryPreAuthorizedById',
            'deliveryPreAuthorizedByName',
            'deliveryPreAuthorizedScope',
            'verificationFlagged',
            'verificationFlaggedAt',
            'verificationFlaggedBy',
            'validatedById',
            'validatedByName',
            'validatedAt',
          ];
          const adminPatch = allowedAdminKeys.reduce<Record<string, unknown>>((patch, key) => {
            const forceKey = explicitProfilePatchKeys?.includes(key);
            if (forceKey || JSON.stringify(existingProfile[key]) !== JSON.stringify(normalizedUpdated[key])) {
              patch[key] = normalizedUpdated[key] ?? null;
            }
            return patch;
          }, {});

          if (Object.keys(adminPatch).length === 0) {
            return;
          }

          await retryFirestoreWrite(() => setDoc(
            doc(db, 'users', normalizedUpdated.id),
            firestoreSafe(adminPatch),
            { merge: true }
          ));

          if (
            'deliveryCodeViewer' in adminPatch ||
            'deliveryVisibleDepartments' in adminPatch ||
            'name' in adminPatch ||
            'department' in adminPatch
          ) {
            if (normalizedUpdated.deliveryCodeViewer) {
              await retryFirestoreWrite(() => setDoc(doc(db, 'deliveryCodeIssuers', normalizedUpdated.id), {
                id: normalizedUpdated.id,
                name: normalizedUpdated.name,
                department: normalizedUpdated.department,
                enabled: true,
                deliveryVisibleDepartments: normalizedUpdated.deliveryVisibleDepartments || [],
              }, { merge: true }));
            } else {
              await deleteDoc(doc(db, 'deliveryCodeIssuers', normalizedUpdated.id)).catch(() => undefined);
            }
          }

          setProfiles(prev => prev.map(profile =>
            profile.id === normalizedUpdated.id ? { ...profile, ...adminPatch } as UserProfile : profile
          ));
          addNotification('Administration', 'Modification enregistrée.', 'success', undefined, activeProfile.id);
          return;
        }

        // Firestore must be updated while the authentication token still contains
        // the old email, otherwise ownership checks reject legacy profile IDs.
        const editableProfileFields = {
          photoUrl: normalizedUpdated.photoUrl || '',
          whatsappOptIn: Boolean(normalizedUpdated.whatsappOptIn),
          ...(institutionConfig.employeeEmploymentTypeLocked === false ? { employmentType: normalizedUpdated.employmentType || '' } : {}),
        };
        await setDoc(
          doc(db, 'users', normalizedUpdated.id),
          normalizedUpdated.id === activeProfile.id ? editableProfileFields : normalizedUpdated,
          { merge: true }
        );
        const canMaintainDeliveryIssuerIndex =
          normalizedUpdated.id === activeProfile.id ||
          activeProfile.role === 'admin' ||
          activeProfile.role === 'restaurant_admin' || activeProfile.role === 'operator';
        if (canMaintainDeliveryIssuerIndex) {
          if (normalizedUpdated.deliveryCodeViewer) {
            await setDoc(doc(db, 'deliveryCodeIssuers', normalizedUpdated.id), {
              id: normalizedUpdated.id,
              name: normalizedUpdated.name,
              department: normalizedUpdated.department,
              enabled: true,
            });
          } else {
            await deleteDoc(doc(db, 'deliveryCodeIssuers', normalizedUpdated.id)).catch(() => undefined);
          }
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, `users/${updated.id}`);
        if (activeWorkspace === 'hr') setActiveWorkspace('hr');
        throw new Error("Enregistrement impossible dans Firebase. Publiez les nouvelles règles Firestore puis réessayez.");
      }

      if (emailChanged && auth.currentUser) {
        try {
          await verifyBeforeUpdateEmail(auth.currentUser, normalizedUpdated.email);
          await setDoc(doc(db, 'users', previousProfile.id), previousProfile, { merge: true });
          throw new Error("Un lien de vérification a été envoyé à la nouvelle adresse. Ouvrez ce lien, puis reconnectez-vous avec la nouvelle adresse.");
        } catch (error: any) {
          await setDoc(doc(db, 'users', previousProfile.id), previousProfile, { merge: true }).catch(() => undefined);
          if (error.code === 'auth/requires-recent-login') {
            throw new Error("Pour changer l'adresse e-mail, déconnectez-vous puis reconnectez-vous avant de réessayer.");
          }
          if (error.code === 'auth/email-already-in-use') {
            throw new Error('Cette adresse e-mail est déjà utilisée par un autre compte.');
          }
          throw new Error("Firebase Authentification a refusé la modification de l'adresse e-mail.");
        }
      }

      if (
        normalizedUpdated.role === 'accountant' &&
        normalizedUpdated.name !== String(previousProfile.name || '').trim()
      ) {
        setCashTransactions(previous => previous.map(transaction =>
          transaction.cashierId === normalizedUpdated.id
              ? { ...transaction, cashierName: normalizedUpdated.name }
            : transaction
        ));
        try {
          const accountantTransactions = await getDocs(
            query(collection(db, 'cashTransactions'), where('cashierId', '==', normalizedUpdated.id))
          );
          for (let offset = 0; offset < accountantTransactions.docs.length; offset += 400) {
            const batch = writeBatch(db);
            accountantTransactions.docs.slice(offset, offset + 400).forEach(item => {
              batch.update(item.ref, { cashierName: normalizedUpdated.name });
            });
            await batch.commit();
          }
        } catch (historyError) {
          handleFirestoreError(historyError, OperationType.UPDATE, 'cashTransactions/cashierName');
          addNotification(
            'Profil enregistré',
            "Le vrai nom est enregistré et sera utilisé dans les rapports. Certaines anciennes lignes Firebase n'ont pas pu être réécrites.",
            'warning',
            undefined,
            normalizedUpdated.id
          );
        }
      }

      setProfiles(prev => prev.map(profile => profile.id === normalizedUpdated.id ? normalizedUpdated : profile));
      if (normalizedUpdated.id === activeProfile.id) setActiveProfile(normalizedUpdated);
      addNotification('Profil mis à jour', 'Vos informations ont été enregistrées sur le Cloud.', 'success');
    } else {
      setProfiles(prev => prev.map(p => p.id === normalizedUpdated.id ? normalizedUpdated : p));
      setActiveProfile(normalizedUpdated);
      addNotification(
        'Profil mis à jour 🎉',
        'Vos coordonnées de livraison hospitalière ont été enregistrées avec succès dans le stockage local.',
        'success'
      );
    }
  };

  const handleWaveTopupRequest = async (request: WaveTopupRequest) => {
    const normalizedReference = request.reference.trim().toUpperCase();
    const isDuplicateReference = waveTopupRequests.some(item =>
      item.reference.trim().toUpperCase() === normalizedReference && item.status !== 'rejected'
    );

    if (isDuplicateReference) {
      addNotification(
        'Référence Wave déjà utilisée',
        "Cette référence de transaction existe déjà dans les demandes Wave. Vérifiez l'ID avant de renvoyer la demande.",
        'warning',
        undefined,
        request.employeeId
      );
      throw new Error('Référence Wave déjà utilisée');
    }

    const securedRequest: WaveTopupRequest = {
      ...request,
      reference: normalizedReference,
    };

    if (isConfigured && db) {
      await setDoc(doc(db, 'waveTopupRequests', securedRequest.id), { ...securedRequest });
      setWaveTopupRequests(prev => [securedRequest, ...prev.filter(item => item.id !== securedRequest.id)]);
    } else {
      setWaveTopupRequests(prev => [securedRequest, ...prev]);
    }
    addNotification('Recharge Wave en attente', `${securedRequest.employeeName} demande une recharge de ${securedRequest.amount.toLocaleString('fr-FR')} FCFA.`, 'info', undefined, 'cashier1');
  };

  useEffect(() => {
    if (!isConfigured || !db || activeProfile.role !== 'admin') return;
    const deliveryIssuers = profiles.filter(profile => profile.deliveryCodeViewer);
    const deliveryIssuerSignature = deliveryIssuers
      .map(profile => JSON.stringify({
        id: profile.id,
        name: profile.name,
        department: profile.department,
        deliveryVisibleDepartments: normalizeServiceList(profile.deliveryVisibleDepartments || []),
      }))
      .sort()
      .join('|');
    const signatureKey = 'ndamatou_delivery_issuers_sync_signature';
    if (localStorage.getItem(signatureKey) === deliveryIssuerSignature) return;
    Promise.all(deliveryIssuers.map(profile => setDoc(doc(db, 'deliveryCodeIssuers', profile.id), {
      id: profile.id,
      name: profile.name,
      department: profile.department,
      enabled: true,
      deliveryVisibleDepartments: normalizeServiceList(profile.deliveryVisibleDepartments || []),
    })))
      .then(() => localStorage.setItem(signatureKey, deliveryIssuerSignature))
      .catch(error => handleFirestoreError(error, OperationType.WRITE, 'deliveryCodeIssuers/sync'));
  }, [profiles, activeProfile.role, isConfigured]);

  useEffect(() => {
    const automaticServiceNormalizationEnabled = Boolean((institutionConfig as any)?.enableAutomaticServiceNormalization);
    if (!automaticServiceNormalizationEnabled || !isConfigured || !db || activeProfile.role !== 'admin') return;
    getDocs(query(collection(db, 'users'), limit(ADMIN_USERS_LIMIT))).then(snapshot => {
      const batch = writeBatch(db);
      let changed = 0;
      snapshot.docs.forEach(item => {
        const department = String(item.data().department || '');
        const normalizedDepartment = normalizeHospitalService(department);
        if (department !== normalizedDepartment) {
          batch.update(item.ref, { department: normalizedDepartment });
          changed += 1;
        }
      });
      if (changed > 0) return batch.commit();
    }).catch(error => handleFirestoreError(error, OperationType.WRITE, 'users/service-normalization'));
  }, [activeProfile.role, isConfigured, (institutionConfig as any)?.enableAutomaticServiceNormalization]);

  const handleCancelWaveTopup = async (requestId: string) => {
    const request = waveTopupRequests.find(item => item.id === requestId);
    if (!request || request.employeeId !== activeProfile.id || request.status !== 'pending') {
      throw new Error('Demande Wave non annulable');
    }
    if (isConfigured && db) {
      const uid = auth?.currentUser?.uid;
      if (!uid) throw new Error('Connexion requise');
      const requestRef = doc(db, 'waveTopupRequests', requestId);
      await runTransaction(db, async transaction => {
        const snapshot = await transaction.get(requestRef);
        const live = snapshot.data();
        if (!live || live.employeeId !== uid) throw new Error('Demande Wave non annulable');
        if (live.status === 'cancelled') return;
        if (live.status !== 'pending') throw new Error('Cette demande a déjà été traitée par la caisse.');
        transaction.update(requestRef, { status: 'cancelled', cancelledBy: uid, cancelledAt: serverTimestamp() });
      });
    }
    setWaveTopupRequests(prev => prev.map(item => item.id === requestId ? { ...item, status: 'cancelled' } : item));
  };

  const handleDeleteProfile = async (profile: UserProfile) => {
    if (isConfigured && db) {
      await deleteDoc(doc(db, 'users', profile.id)).catch(error => {
        handleFirestoreError(error, OperationType.DELETE, `users/${profile.id}`);
        throw error;
      });
    }
    setProfiles(prev => prev.filter(item => item.id !== profile.id));
    if (activeProfile.id === profile.id) {
      setActiveProfile(EMPTY_PROFILE);
      setActiveWorkspace('employee');
    }
  };

  const handleSendPasswordReset = async (profile: UserProfile) => {
    if (!auth || !profile.email) {
      addNotification('Réinitialisation impossible', "Aucune adresse e-mail n'est disponible pour ce compte.", 'alert', undefined, activeProfile.id);
      return;
    }
    const emailIsAccessible = window.confirm(
      `L'agent ${profile.name} peut-il réellement ouvrir la boîte e-mail ${profile.email} \n\nOK : envoyer un lien de réinitialisation à cet e-mail.\nAnnuler : remplacer l'e-mail fictif par une nouvelle adresse valide.`
    );
    if (!emailIsAccessible) {
      await handleRecoverAccountWithNewEmail(profile);
      return;
    }
    try {
      await sendPasswordResetEmail(auth, profile.email.trim().toLowerCase());
      addNotification(
        'Lien de réinitialisation envoyé',
        `Un lien sécurisé a été envoyé à ${profile.email}. L'agent pourra choisir lui-même son nouveau mot de passe.`,
        'success',
        undefined,
        activeProfile.id
      );
    } catch (error) {
      addNotification(
        'Réinitialisation impossible',
        `Firebase n'a pas trouvé ou refusé le compte ${profile.email}. Utilisez de nouveau le bouton puis choisissez Annuler pour remplacer l'e-mail fictif.`,
        'alert',
        undefined,
        activeProfile.id
      );
    }
  };

  const handleRecoverAccountWithNewEmail = async (profile: UserProfile) => {
    if (!db || !isConfigured) {
      addNotification('Récupération impossible', 'Firebase doit être connecté pour remplacer ce compte.', 'alert');
      return;
    }
    const newEmail = window.prompt(
      `Nouvelle adresse e-mail valide pour ${profile.name} :\n\nUn nouveau compte de connexion sera créé et remplacera l'ancien profil.`,
      ''
    ).trim().toLowerCase();
    if (!newEmail) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
      addNotification('Adresse invalide', 'Saisissez une adresse e-mail valide et accessible par l’agent.', 'warning');
      return;
    }
    const temporaryPassword = `CHN-${secureRandomCode(8)}`;
    const confirmed = window.confirm(
      `Confirmer la récupération du compte de ${profile.name} \n\nNouvel e-mail : ${newEmail}\nLe badge, le solde et l'historique des commandes seront transférés. L'ancien profil ne permettra plus d'accéder à l'application.`
    );
    if (!confirmed) return;

    const secondaryApp = initializeApp(firebaseConfig, `account-recovery-${Date.now()}`);
    const secondaryAuth = getAuth(secondaryApp);
    let replacementUser: FirebaseUser | null = null;
    try {
      const credential = await createUserWithEmailAndPassword(secondaryAuth, newEmail, temporaryPassword);
      replacementUser = credential.user;
      const recoveredProfile: UserProfile = {
        ...profile,
        id: credential.user.uid,
        email: newEmail,
        status: 'active',
        badgeBlocked: false,
      };
      const relatedOrders = orders.filter(order => order.employeeId === profile.id);
      const chunks: Order[][] = [];
      for (let index = 0; index < relatedOrders.length; index += 400) chunks.push(relatedOrders.slice(index, index + 400));

      // Create the replacement profile first. The old profile remains intact until
      // every historical order has been transferred successfully.
      await setDoc(doc(db, 'users', recoveredProfile.id), firestoreSafe(recoveredProfile));
      for (const chunk of chunks) {
        const orderBatch = writeBatch(db);
        chunk.forEach(order => orderBatch.update(doc(db, 'orders', order.id), { employeeId: recoveredProfile.id, employeeEmail: newEmail }));
        await orderBatch.commit();
      }
      await deleteDoc(doc(db, 'users', profile.id));

      setProfiles(previous => [recoveredProfile, ...previous.filter(item => item.id !== profile.id && item.id !== recoveredProfile.id)]);
      setOrders(previous => previous.map(order => order.employeeId === profile.id ? { ...order, employeeId: recoveredProfile.id, employeeEmail: newEmail } : order));
      addNotification(
        'Compte récupéré avec succès',
        `${profile.name} peut maintenant se connecter avec ${newEmail} et le mot de passe temporaire communiqué. Son badge et son solde sont conservés.`,
        'success'
      );
      window.alert(
        `RÉCUPÉRATION TERMINÉE\n\nAgent : ${profile.name}\nNouvel e-mail : ${newEmail}\nMot de passe temporaire : ${temporaryPassword}\n\nCommuniquez ces identifiants à l'agent. Il devra changer le mot de passe dans son profil après connexion.`
      );
    } catch (error) {
      if (replacementUser) {
        const relatedOrders = orders.filter(order => order.employeeId === profile.id);
        for (let index = 0; index < relatedOrders.length; index += 400) {
          const rollbackBatch = writeBatch(db);
          relatedOrders.slice(index, index + 400).forEach(order => {
            rollbackBatch.update(doc(db, 'orders', order.id), { employeeId: profile.id, employeeEmail: profile.email });
          });
          await rollbackBatch.commit().catch(() => undefined);
        }
        await deleteDoc(doc(db, 'users', replacementUser.uid)).catch(() => undefined);
        await deleteUser(replacementUser).catch(() => undefined);
      }
      const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';
      const messageByCode: Record<string, string> = {
        'auth/email-already-in-use': 'Cette nouvelle adresse e-mail possède déjà un compte Firebase.',
        'auth/invalid-email': "La nouvelle adresse e-mail n'est pas valide.",
        'auth/operation-not-allowed': "La création de compte par e-mail et mot de passe n'est pas activée dans Firebase Authentification.",
        'auth/network-request-failed': 'La connexion à Firebase a échoué. Vérifiez Internet puis réessayez.',
        'permission-denied': "Le compte connecté n'a pas les droits administrateur nécessaires. Publiez les règles Firestore et vérifiez son rôle.",
      };
      addNotification(
        'Récupération impossible',
        messageByCode[code] || `Firebase a refusé la création ou le transfert (${code || 'erreur inconnue'}). L'ancien profil reste conservé.`,
        'alert'
      );
      console.error('Account recovery failed', error);
    } finally {
      await signOut(secondaryAuth).catch(() => undefined);
      await deleteApp(secondaryApp).catch(() => undefined);
    }
  };

  const handleChangeOwnPassword = async (newPassword: string) => {
    if (!auth.currentUser) {
      addNotification('Mot de passe non modifié', 'Reconnectez-vous puis réessayez.', 'warning');
      throw new Error('Reconnectez-vous puis réessayez.');
    }
    const changePassword = async () => {
      if (!auth.currentUser) throw new Error('Session Firebase absente.');
      await updatePassword(auth.currentUser, newPassword);
    };
    try {
      await changePassword();
    } catch (error) {
      const code = typeof error === 'object' && error && 'code' in error ? String((error as { code?: string }).code) : '';
      if (code !== 'auth/requires-recent-login') {
        const messageByCode: Record<string, string> = {
          'auth/weak-password': 'Le mot de passe doit contenir au moins 6 caractères.',
          'auth/network-request-failed': 'Connexion Firebase impossible. Vérifiez Internet puis réessayez.',
          'auth/too-many-requests': 'Trop de tentatives. Patientez quelques minutes puis réessayez.',
        };
        const message = messageByCode[code] || 'Firebase a refusé la modification du mot de passe.';
        addNotification('Mot de passe non modifié', message, 'alert');
        throw new Error(message);
      }
      const email = auth.currentUser.email || activeProfile.email;
      if (!email) {
        const message = "Impossible de confirmer l'identité: l'adresse e-mail du compte est absente.";
        addNotification('Mot de passe non modifié', message, 'alert');
        throw new Error(message);
      }
      const currentPassword = window.prompt('Pour confirmer votre identité, saisissez votre mot de passe actuel.');
      if (!currentPassword) {
        const message = 'Modification annulée: mot de passe actuel non saisi.';
        addNotification('Mot de passe non modifié', message, 'warning');
        throw new Error(message);
      }
      try {
        const credential = EmailAuthProvider.credential(email, currentPassword);
        await reauthenticateWithCredential(auth.currentUser, credential);
        await changePassword();
      } catch (reauthError) {
        const reauthCode = typeof reauthError === 'object' && reauthError && 'code' in reauthError ? String((reauthError as { code?: string }).code) : '';
        const messageByCode: Record<string, string> = {
          'auth/wrong-password': 'Mot de passe actuel incorrect.',
          'auth/invalid-credential': 'Mot de passe actuel incorrect.',
          'auth/network-request-failed': 'Connexion Firebase impossible. Vérifiez Internet puis réessayez.',
          'auth/too-many-requests': 'Trop de tentatives. Patientez quelques minutes puis réessayez.',
        };
        const message = messageByCode[reauthCode] || 'Confirmation impossible. Reconnectez-vous puis réessayez.';
        addNotification('Mot de passe non modifié', message, 'alert');
        throw new Error(message);
      }
    }
    addNotification('Mot de passe modifié', 'Votre nouveau mot de passe est enregistré.', 'success');
  };

  const handleSoftRefreshApp = async () => {
    try {
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(
          registrations.map(async (registration) => {
            registration.active?.postMessage({ type: 'CLEAR_APP_CACHE' });
            registration.waiting?.postMessage({ type: 'SKIP_WAITING' });
            await registration.update().catch(() => undefined);
            await registration.unregister().catch(() => undefined);
          })
        );
      }
      if ('caches' in window) {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName)));
      }
    } catch (error) {
      console.warn('Service worker update skipped', error);
    }
    const refreshUrl = new URL(window.location.href);
    refreshUrl.searchParams.set('refresh', Date.now().toString());
    window.location.replace(refreshUrl.toString());
  };

  const handleResetAllBadgeBalances = async () => {
    throw new Error('La remise à zéro globale est désactivée pour protéger les soldes et les historiques.');
  };

  const handleApproveWaveTopup = async (requestId: string) => {
    const request = waveTopupRequests.find(item => item.id === requestId);
    if (!request || request.status !== 'pending') return;
    const employee = profiles.find(profile => profile.id === request.employeeId);
    if (!employee) return;
    if ((employee.walletBalance || 0) + request.amount > institutionConfig.maxBadgeBalance) {
      addNotification(
        'Plafond badge dépassé',
        `Validation refusée pour ${employee.name}. Le solde dépasserait ${institutionConfig.maxBadgeBalance.toLocaleString('fr-FR')} FCFA.`,
        'alert',
        undefined,
        activeProfile.id
      );
      return;
    }
    const waveRate = Math.max(0, institutionConfig.waveCashierFeeRate);
    const waveFeeAmount = waveRate > 0 && waveRate < 100
        ? Math.round(request.amount * waveRate / (100 - waveRate))
      : 0;

    const approvedRequest: WaveTopupRequest = {
      ...request,
      status: 'approved',
      validatedAt: new Date().toISOString(),
      validatedBy: activeProfile.name,
    };
    const transaction: CashTransaction = {
      id: `cash-wave-${Date.now()}`,
      employeeId: employee.id,
      employeeName: employee.name,
      badgeNumber: employee.badgeNumber,
      amount: request.amount,
      method: 'wave',
      waveFeeRate: waveRate,
      waveFeeAmount,
      cashierId: activeProfile.id,
      cashierName: activeProfile.name,
      createdAt: new Date().toISOString(),
      note: `Wave ${request.reference}`,
    };
    const updatedEmployee = { ...employee, walletBalance: employee.walletBalance + request.amount };

    try {
      if (secureBalanceFunctionsEnabled || sparkBalanceEnabled) {
        const securedTransaction = await secureApproveWaveTopup(request.id);
      if (Number.isSafeInteger(securedTransaction.balanceAfter)) updatedEmployee.walletBalance = securedTransaction.balanceAfter!;
        setWaveTopupRequests(prev => prev.map(item => item.id === request.id ? approvedRequest : item));
        setCashTransactions(prev => [securedTransaction, ...prev.filter(item => item.id !== securedTransaction.id)]);
        setProfiles(prev => prev.map(profile => profile.id === employee.id ? { ...profile, walletBalance: updatedEmployee.walletBalance } : profile));
        addNotification('Recharge Wave validée', `${employee.name} a été crédité de ${request.amount.toLocaleString('fr-FR')} FCFA.`, 'success', undefined, employee.id);
        return;
      }
      if (isConfigured && db) {
        const batch = writeBatch(db);
        batch.update(doc(db, 'waveTopupRequests', request.id), { ...firestoreSafe(approvedRequest) });
        batch.set(doc(db, 'cashTransactions', transaction.id), firestoreSafe(transaction));
        batch.update(doc(db, 'users', employee.id), { walletBalance: increment(request.amount) });
        await batch.commit();
      }
      setWaveTopupRequests(prev => prev.map(item => item.id === request.id ? approvedRequest : item));
      setCashTransactions(prev => [transaction, ...prev.filter(item => item.id !== transaction.id)]);
      setProfiles(prev => prev.map(profile => profile.id === employee.id ? { ...profile, walletBalance: updatedEmployee.walletBalance } : profile));
      addNotification('Recharge Wave validée', `${employee.name} a été crédité de ${request.amount.toLocaleString('fr-FR')} FCFA.`, 'success', undefined, employee.id);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `waveTopupRequests/${request.id}`);
      throw error;
    }
  };
  const handleAccountantTopup = async (employee: UserProfile, amount: number, note: string, method: CashTransaction['method'] = 'cash', grossAmount?: number) => {
    if (!isConfigured || !db || !auth?.currentUser) {
      throw new Error('Recharge indisponible : connexion Firebase requise.');
    }
    if (!Number.isSafeInteger(amount) || amount <= 0) {
      throw new Error('Le montant de recharge doit être supérieur à zéro.');
    }
    const withTimeout = async <T,>(promise: Promise<T>, timeoutMs = 4500): Promise<T> => {
      let timeoutId: number | undefined;
      const timeout = new Promise<never>((_, reject) => {
        timeoutId = window.setTimeout(() => reject(new Error('lecture Firebase trop lente')), timeoutMs);
      });
      try {
        return await Promise.race([promise, timeout]);
      } finally {
        if (timeoutId) window.clearTimeout(timeoutId);
      }
    };
    let topupEmployee = employee;
    if (isConfigured && db) {
      const candidateMap = new Map<string, UserProfile>();
      const addCandidate = (candidate: UserProfile) => {
        if (!candidate.id) return;
        candidateMap.set(candidate.id, candidate);
      };
      addCandidate(employee);
      const rawBadge = String(employee.badgeNumber || '').trim();
      const rawPhone = String(employee.phone || '').trim();
      const compactPhone = rawPhone.replace(/[^\d+]/g, '');
      const rawEmail = String(employee.email || '').trim().toLowerCase();
      try {
        const liveSnap = await withTimeout(getDocFromServer(doc(db, 'users', employee.id)));
        if (liveSnap.exists()) {
          addCandidate(normalizeFirebaseProfile(liveSnap.data() as Partial<UserProfile>, liveSnap.id));
        }
      } catch {
        // Continue with badge/phone/email lookup. A slow direct read must not
        // force a recharge onto a stale mirror document.
      }
      const lookupQueries = [
        ...(rawBadge ? [
          query(collection(db, 'users'), where('badgeNumber', '==', rawBadge), limit(5)),
          query(collection(db, 'users'), where('badgeNumber', '==', rawBadge.toUpperCase()), limit(5)),
        ] : []),
        ...(rawPhone ? [
          query(collection(db, 'users'), where('phone', '==', rawPhone), limit(5)),
          query(collection(db, 'users'), where('phone', '==', compactPhone), limit(5)),
        ] : []),
        ...(rawEmail ? [query(collection(db, 'users'), where('email', '==', rawEmail), limit(5))] : []),
      ];
      for (const lookupQuery of lookupQueries) {
        try {
          const lookupSnapshot = await withTimeout(getDocsFromServer(lookupQuery), 4500);
          lookupSnapshot.docs.forEach(liveDoc => {
            addCandidate(normalizeFirebaseProfile(liveDoc.data() as Partial<UserProfile>, liveDoc.id));
          });
        } catch {
          // Continue with the next lookup route; the final write remains atomic.
        }
      }
      const candidates = Array.from(candidateMap.values()).filter(candidate => sameProfileIdentity(candidate, employee));
      topupEmployee = chooseBestProfile(candidates.length ? candidates : Array.from(candidateMap.values()), employee.id) || employee;
    }
    const operationKey = JSON.stringify([auth.currentUser.uid, topupEmployee.id, amount, method, note, grossAmount]);
    const requestId = pendingTopupRequests.current.begin(operationKey);
    const securedTransaction = await secureAccountantTopup(topupEmployee, amount, note, method, requestId, grossAmount);
    const serverBalance = securedTransaction.balanceAfter;
    if (!Number.isSafeInteger(serverBalance)) throw new Error('Réponse de recharge invalide. Actualisez le solde avant de réessayer.');
    pendingTopupRequests.current.complete(operationKey);
    const updatedEmployee = { ...topupEmployee, walletBalance: serverBalance! };
    setCashTransactions(prev => [securedTransaction, ...prev.filter(item => item.id !== securedTransaction.id)]);
    setProfiles(prev => prev.some(profile => profile.id === topupEmployee.id)
      ? prev.map(profile => profile.id === topupEmployee.id ? updatedEmployee : profile)
      : [updatedEmployee, ...prev]);
    if (sameProfileIdentity(activeProfile, topupEmployee)) {
      setActiveProfile(prev => ({ ...prev, walletBalance: serverBalance! }));
    }
    addNotification('Badge rechargé', topupEmployee.name + ' a été crédité de ' + amount.toLocaleString('fr-FR') + ' FCFA.', 'success', undefined, topupEmployee.id);
    return securedTransaction;
  };

  const handleClaimLegacyTransactions = async (): Promise<number> => {
    if (activeProfile.role !== 'accountant') throw new Error('Opération réservée au comptable.');
    const accountantName = String(activeProfile.name || '').trim();
    if (!accountantName || /^comptable(:\s+(Ndamatou|restaurant))$/i.test(accountantName)) {
      throw new Error("Renseignez d'abord le vrai nom du comptable dans le profil.");
    }
    const legacyTransactions = cashTransactions.filter(transaction =>
      transaction.cashierId === 'cashier1' ||
      !transaction.cashierName.trim() ||
      /^comptable(:\s+(Ndamatou|restaurant))$/i.test(transaction.cashierName.trim())
    );
    if (legacyTransactions.length === 0) return 0;

    if (isConfigured && db) {
      for (let offset = 0; offset < legacyTransactions.length; offset += 400) {
        const batch = writeBatch(db);
        legacyTransactions.slice(offset, offset + 400).forEach(transaction => {
          batch.update(doc(db, 'cashTransactions', transaction.id), {
            cashierId: activeProfile.id,
            cashierName: accountantName,
          });
        });
        await batch.commit();
      }
    }
    setCashTransactions(previous => previous.map(transaction =>
      legacyTransactions.some(legacy => legacy.id === transaction.id)
        ? { ...transaction, cashierId: activeProfile.id, cashierName: accountantName }
        : transaction
    ));
    return legacyTransactions.length;
  };

  const handleFlagProfileForHr = async (profile: UserProfile) => {
    const flaggedAt = new Date().toISOString();
    const updatedProfile: UserProfile = {
      ...profile,
      verificationFlagged: true,
      verificationFlaggedAt: flaggedAt,
      verificationFlaggedBy: activeProfile.id,
    };
    if (isConfigured && db) {
      await updateDoc(doc(db, 'users', profile.id), {
        verificationFlagged: true,
        verificationFlaggedAt: flaggedAt,
        verificationFlaggedBy: activeProfile.id,
      }).catch(error => {
        handleFirestoreError(error, OperationType.UPDATE, `users/${profile.id}`);
        throw error;
      });
    }
    setProfiles(prev => prev.map(item => item.id === profile.id ? updatedProfile : item));
    addNotification(
      'Vérification DRH demandée',
      `${activeProfile.name} demande à vérifier le compte de ${profile.name} (${profile.department}).`,
      'warning',
      undefined,
      'hr'
    );
  };

  const handleClearCashHistory = async (_code: string) => {
    throw new Error('La suppression des historiques financiers est désactivée.');
  };

  const handleClearOperationalHistory = async (_code: string) => {
    throw new Error('La suppression des commandes et des historiques est désactivée.');
  };

  const buildPrepaidCode = (badgeNumber: string, amount: number) => {
    const badgeTail = badgeNumber.replace(/[^A-Z0-9]/gi, '').slice(-3).toUpperCase().padStart(3, 'X');
    const amountCode = Math.round(amount / 100).toString(36).toUpperCase().padStart(2, '0');
    const randomCode = secureRandomCode(6);
    return `P${badgeTail}-${amountCode}${randomCode}`;
  };

  const handleCreatePrepaidCard = async (employee: UserProfile, amount: number) => {
    if (!Number.isFinite(amount) || amount <= 0) return null;
    if ((employee.walletBalance || 0) + amount > institutionConfig.maxBadgeBalance) {
      throw new Error(`Plafond badge dépassé. Solde maximal autorisé : ${institutionConfig.maxBadgeBalance.toLocaleString('fr-FR')} FCFA.`);
    }
    const card: PrepaidCard = {
      id: `prepaid-${Date.now()}-${secureRandomCode(4)}`,
      code: buildPrepaidCode(employee.badgeNumber, amount),
      amount,
      employeeId: employee.id,
      employeeName: employee.name,
      badgeNumber: employee.badgeNumber,
      cashierId: activeProfile.id,
      cashierName: activeProfile.name,
      status: 'active',
      createdAt: new Date().toISOString(),
    };

    if (isConfigured && db) {
      await setDoc(doc(db, 'prepaidCards', card.id), card);
    }
    setPrepaidCards(prev => [card, ...prev.filter(item => item.id !== card.id)]);

    addNotification(
      'Carte prépayée générée',
      `Code ${card.code} créé pour ${employee.name} (${employee.badgeNumber}).`,
      'success'
    );
    return card;
  };

  const handleRedeemPrepaidCard = async (employee: UserProfile, rawCode: string) => {
    const code = rawCode.trim().toUpperCase().replace(/\s+/g, '');
    let card = prepaidCards.find(item => item.code.toUpperCase() === code);

    if (!card && isConfigured && db) {
      const cardQuery = query(
        collection(db, 'prepaidCards'),
        where('employeeId', '==', employee.id)
      );
      const snapshot = await getDocs(cardQuery);
      card = snapshot.docs
        .map(item => item.data() as PrepaidCard)
        .find(item => item.code.trim().toUpperCase().replace(/\s+/g, '') === code);
    }

    if (!card || card.status !== 'active') {
      addNotification('Code prépayé invalide', 'Ce code est introuvable, déjà utilisé ou annulé.', 'warning', undefined, employee.id);
      throw new Error('Code prépayé invalide');
    }

    if (card.employeeId !== employee.id || card.badgeNumber !== employee.badgeNumber) {
      addNotification(
        'Code refusé',
        'Ce code prépayé est réservé à un autre badge. Contactez le comptable.',
        'alert',
        undefined,
        employee.id
      );
      throw new Error('Code réservé à un autre badge');
    }
    if ((employee.walletBalance || 0) + card.amount > institutionConfig.maxBadgeBalance) {
      addNotification(
        'Plafond badge atteint',
        `Recharge refusée: le solde ne peut pas dépasser ${institutionConfig.maxBadgeBalance.toLocaleString('fr-FR')} FCFA.`,
        'warning',
        undefined,
        employee.id
      );
      throw new Error('Plafond badge dépassé');
    }

    const usedCard: PrepaidCard = {
      ...card,
      status: 'used',
      usedAt: new Date().toISOString(),
      usedBy: employee.id,
    };

    const transaction: CashTransaction = {
      id: `cash-prepaid-${Date.now()}`,
      employeeId: employee.id,
      employeeName: employee.name,
      badgeNumber: employee.badgeNumber,
      amount: card.amount,
      method: 'cash',
      cashierId: card.cashierId,
      cashierName: card.cashierName,
      createdAt: new Date().toISOString(),
      note: `Carte prépayée ${card.code}`,
    };
    const updatedEmployee = { ...employee, walletBalance: employee.walletBalance + card.amount };

    if (secureBalanceFunctionsEnabled || sparkBalanceEnabled) {
      const securedTransaction = await secureRedeemPrepaidCard(card.id);
      if (Number.isSafeInteger(securedTransaction.balanceAfter)) updatedEmployee.walletBalance = securedTransaction.balanceAfter!;
      setPrepaidCards(prev => [usedCard, ...prev.filter(item => item.id !== card.id)]);
      setProfiles(prev => prev.map(profile => profile.id === employee.id ? { ...profile, walletBalance: updatedEmployee.walletBalance } : profile));
      setActiveProfile(prev => prev.id === employee.id ? { ...prev, walletBalance: updatedEmployee.walletBalance } : prev);
      setCashTransactions(prev => [securedTransaction, ...prev.filter(item => item.id !== securedTransaction.id)]);

      addNotification(
        'Badge rechargé',
        `Votre badge a été crédité de ${card.amount.toLocaleString('fr-FR')} FCFA par carte prépayée.`,
        'success',
        undefined,
        employee.id
      );
      return;
    }

    if (isConfigured && db) {
      const batch = writeBatch(db);
      batch.update(doc(db, 'prepaidCards', card.id), {
          status: usedCard.status,
          usedAt: usedCard.usedAt,
          usedBy: usedCard.usedBy,
      });
      batch.update(doc(db, 'users', employee.id), { walletBalance: updatedEmployee.walletBalance });
      batch.set(doc(db, 'cashTransactions', transaction.id), firestoreSafe(transaction));
      await batch.commit();
    }
    setPrepaidCards(prev => [usedCard, ...prev.filter(item => item.id !== card.id)]);
    setProfiles(prev => prev.map(profile => profile.id === employee.id ? { ...profile, walletBalance: updatedEmployee.walletBalance } : profile));
    setActiveProfile(prev => prev.id === employee.id ? { ...prev, walletBalance: updatedEmployee.walletBalance } : prev);
    setCashTransactions(prev => [transaction, ...prev.filter(item => item.id !== transaction.id)]);

    addNotification(
      'Badge rechargé',
      `Votre badge a été crédité de ${card.amount.toLocaleString('fr-FR')} FCFA par carte prépayée.`,
      'success',
      undefined,
      employee.id
    );
  };

  const handleCorrectTopup = async (transaction: CashTransaction, correctedAmount: number, reason: string) => {
    const employee = profiles.find(profile => profile.id === transaction.employeeId);
    if (!employee || !Number.isFinite(correctedAmount) || correctedAmount < 0) return;

    const difference = correctedAmount - transaction.amount;
    if (difference === 0) {
      addNotification('Correction inutile', 'Le montant corrigé est identique au montant initial.', 'info');
      return;
    }

    if (employee.walletBalance + difference < 0) {
      addNotification(
        'Correction refusée',
        "Cette correction ferait passer le badge en solde négatif. Vérifiez le montant saisi.",
        'warning'
      );
      return;
    }

    const correction: CashTransaction = {
      id: `cash-correction-${Date.now()}`,
      employeeId: transaction.employeeId,
      employeeName: transaction.employeeName,
      badgeNumber: transaction.badgeNumber,
      amount: difference,
      method: transaction.method,
      cashierId: activeProfile.id,
      cashierName: activeProfile.name,
      createdAt: new Date().toISOString(),
      note: `Correction recharge: ${transaction.amount.toLocaleString('fr-FR')} -> ${correctedAmount.toLocaleString('fr-FR')} FCFA`,
      correctionOf: transaction.id,
      correctionReason: reason,
    };
    const updatedEmployee = { ...employee, walletBalance: employee.walletBalance + difference };

    if (secureBalanceFunctionsEnabled || sparkBalanceEnabled) {
      const securedCorrection = await secureCorrectTopup(transaction, correctedAmount, reason);
      if (Number.isSafeInteger(securedCorrection.balanceAfter)) updatedEmployee.walletBalance = securedCorrection.balanceAfter!;
      setCashTransactions(prev => [securedCorrection, ...prev.filter(item => item.id !== securedCorrection.id)]);
      setProfiles(prev => prev.map(profile => profile.id === employee.id ? { ...profile, walletBalance: updatedEmployee.walletBalance } : profile));
      addNotification('Correction enregistrée', `Ajustement de ${difference.toLocaleString('fr-FR')} FCFA appliqué au badge de ${employee.name}.`, 'success', undefined, employee.id);
      return;
    }
    if (isConfigured && db) {
      try {
        const batch = writeBatch(db);
        batch.set(doc(db, 'cashTransactions', correction.id), firestoreSafe(correction));
        batch.update(doc(db, 'users', employee.id), { walletBalance: updatedEmployee.walletBalance });
        await batch.commit();
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, `cashTransactions/${correction.id}`);
        throw error;
      }
    }
    setCashTransactions(prev => [correction, ...prev.filter(item => item.id !== correction.id)]);
    setProfiles(prev => prev.map(profile => profile.id === employee.id ? { ...profile, walletBalance: updatedEmployee.walletBalance } : profile));

    addNotification(
      'Correction enregistrée',
      `Ajustement de ${difference.toLocaleString('fr-FR')} FCFA appliqué au badge de ${employee.name}.`,
      'success',
      undefined,
      employee.id
    );
  };

  const handleAdjustBadgeBalance = async (employee: UserProfile, targetBalance: number, reason: string) => {
    const normalizedTarget = Math.round(Number(targetBalance));
    if (!Number.isFinite(normalizedTarget) || normalizedTarget < 0) {
      throw new Error('Solde cible invalide.');
    }
    if (normalizedTarget > institutionConfig.maxBadgeBalance) {
      throw new Error(`Le solde cible dépasse le plafond autorisé de ${institutionConfig.maxBadgeBalance.toLocaleString('fr-FR')} FCFA.`);
    }
    const motif = reason.trim();
    if (motif.length < 5) {
      throw new Error('Motif obligatoire pour corriger un solde badge.');
    }

    const currentBalance = Math.max(0, Number(employee.walletBalance || 0));
    const difference = normalizedTarget - currentBalance;
    if (difference === 0) {
      addNotification('Correction inutile', 'Le solde indiqué est identique au solde actuel.', 'info', undefined, activeProfile.id);
      return;
    }

    let adjustment: CashTransaction = {
      id: `cash-balance-adjust-${Date.now()}`,
      employeeId: employee.id,
      employeeName: employee.name,
      badgeNumber: employee.badgeNumber,
      amount: difference,
      method: 'cash',
      cashierId: activeProfile.id,
      cashierName: activeProfile.name,
      createdAt: new Date().toISOString(),
      note: `Correction solde badge: ${currentBalance.toLocaleString('fr-FR')} -> ${normalizedTarget.toLocaleString('fr-FR')} FCFA`,
      correctionOf: `wallet-${employee.id}-${Date.now()}`,
      correctionReason: motif,
    };

    if (secureBalanceFunctionsEnabled || sparkBalanceEnabled) {
      adjustment = await secureAdjustBadgeBalance(employee, normalizedTarget, motif);
    } else if (isConfigured && db) {
      const batch = writeBatch(db);
      batch.update(doc(db, 'users', employee.id), { walletBalance: normalizedTarget });
      batch.set(doc(db, 'cashTransactions', adjustment.id), firestoreSafe(adjustment));
      await batch.commit();
    }

    const updatedEmployee = { ...employee, walletBalance: normalizedTarget };
    setProfiles(prev => prev.map(profile => profile.id === employee.id ? { ...profile, walletBalance: updatedEmployee.walletBalance } : profile));
    if (activeProfile.id === employee.id) {
      setActiveProfile(prev => ({ ...prev, walletBalance: normalizedTarget }));
    }
    setCashTransactions(prev => [adjustment, ...prev.filter(item => item.id !== adjustment.id)]);
    addNotification(
      'Solde badge corrigé',
      `${employee.name}: solde ajusté à ${normalizedTarget.toLocaleString('fr-FR')} FCFA. Motif: ${motif}`,
      'warning',
      undefined,
      employee.id
    );
  };


  // Order creation workflow
  const handleCreateOrder = async (newOrder: Order) => {
    if (!isConfigured || !db || !auth?.currentUser) {
      throw new Error('Connexion Firebase requise pour enregistrer une commande.');
    }
    if (isConfigured && db && auth?.currentUser && activeProfile.role === 'employee') {
      try {
        await mirrorAuthenticatedAccessProfile(auth.currentUser, activeProfile);
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, `users/${auth.currentUser.uid}/order-access-mirror`);
      }
    }
    if (activeProfile.role === 'employee' && (activeProfile.status === 'pending' || activeProfile.status === 'blocked' || activeProfile.badgeBlocked || isContractExpired(activeProfile))) {
      throw new Error(
        activeProfile.status === 'pending'
          ? 'Votre inscription attend la validation DRH.'
          : isContractExpired(activeProfile)
            ? 'Votre contrat est termin?. Contactez la DRH.'
            : 'Votre compte est bloqu?.'
      );
    }
    const orderDateKey = getOperationalDateKey(newOrder.createdAt, institutionConfig.orderWindowStart);
    const existingRegularOrdersToday = orders.filter(order =>
      order.employeeId === newOrder.employeeId &&
      getOperationalDateKey(order.createdAt, institutionConfig.orderWindowStart) === orderDateKey &&
      order.orderType !== 'special_dinner' &&
      !['returned', 'cancelled', 'expired'].includes(order.status)
    );
    const existingRegularQuantity = existingRegularOrdersToday.reduce(
      (sum, order) => sum + order.items.reduce((itemSum, item) => itemSum + item.quantity, 0),
      0
    );
    const newRegularQuantity = newOrder.orderType === 'special_dinner'
        ? 0
        : newOrder.items.reduce((sum, item) => sum + item.quantity, 0);
    if (existingRegularQuantity + newRegularQuantity > institutionConfig.maxItemsPerOrder) {
      throw new Error(`Limite atteinte: ${institutionConfig.maxItemsPerOrder} portion(s) maximum par jour.`);
    }

    const forceStaffPrice = Boolean(activeProfile.alwaysStaffMealPrice);
    let subsidyAlreadyUsed = !forceStaffPrice && existingRegularOrdersToday.some(order =>
      order.items.some(item => item.meal.category === 'plat' && item.meal.mealType !== 'special_dinner')
    );
    let extraSubsidyCreditsLeft = Math.max(0, Number(activeProfile.extraSubsidyCredits || 0));
    let extraSubsidyCreditUsed = false;
    const expectedTotal = newOrder.items.reduce((sum, item) => {
      const isRegularHotMeal = item.meal.category === 'plat' && item.meal.mealType !== 'special_dinner';
      const unitPrice = isRegularHotMeal ? institutionConfig.realMealPrice : item.meal.price;
      let subsidized = isRegularHotMeal && !activeProfile.subsidyExcluded && (forceStaffPrice || !subsidyAlreadyUsed) && item.quantity > 0;
      if (subsidized) {
        subsidyAlreadyUsed = !forceStaffPrice;
      } else if (isRegularHotMeal && !activeProfile.subsidyExcluded && extraSubsidyCreditsLeft > 0 && item.quantity > 0) {
        subsidized = true;
        extraSubsidyCreditsLeft -= 1;
        extraSubsidyCreditUsed = true;
      }
      return sum + (unitPrice * item.quantity) - (subsidized ? (unitPrice - institutionConfig.staffMealPrice) * (forceStaffPrice ? item.quantity : 1) : 0);
    }, 0);
    const expectedDeliveryFee = newOrder.fulfillmentMode === 'delivery' && institutionConfig.deliveryFeeEnabled
        ? Math.max(0, institutionConfig.deliveryFeeAmount)
      : 0;
    const expectedEmployeeTotal = expectedTotal + (institutionConfig.deliveryFeePayer === 'employee' ? expectedDeliveryFee : 0);
    if (newOrder.total <= 0) {
      throw new Error('Montant de commande invalide.');
    }
    if (
      Number(newOrder.deliveryFeeAmount || 0) !== expectedDeliveryFee ||
      (expectedDeliveryFee > 0 && newOrder.deliveryFeePayer !== institutionConfig.deliveryFeePayer)
    ) {
      throw new Error(`Frais de livraison incohérents: ${expectedDeliveryFee.toLocaleString('fr-FR')} FCFA attendu.`);
    }
    if (newOrder.total !== expectedEmployeeTotal) {
      console.warn('Montant commande différent du recalcul local, montant agent conservé pour éviter un blocage de service.', {
        orderId: newOrder.id,
        received: newOrder.total,
        expectedEmployeeTotal,
      });
    }

    if (institutionConfig.weekendOrderingClosed && isWeekendOrderingClosed(new Date())) {
      addNotification(
        'Commandes fermées le week-end',
        'Les commandes sont verrouillées du vendredi 19h au dimanche 19h.',
        'warning',
        undefined,
        newOrder.employeeId
      );
      throw new Error('Commandes fermées du vendredi 19h au dimanche 19h.');
    }
    if (newOrder.deliveryAuthorizedById) {
      const windowStart = rotatingDeliveryCodeExpiresAt
          ? new Date(rotatingDeliveryCodeExpiresAt).getTime() - (24 * 60 * 60 * 1000)
        : Date.now() - (24 * 60 * 60 * 1000);
      const uses = orders.filter(order =>
        order.employeeId === newOrder.employeeId &&
        Boolean(order.deliveryAuthorizedById) &&
        new Date(order.deliveryAuthorizationUsedAt || 0).getTime() >= windowStart
      ).length;
      if (uses >= institutionConfig.deliveryCodeMaxUsesPer24h) {
        addNotification('Limite du code atteinte', `La limite est de ${institutionConfig.deliveryCodeMaxUsesPer24h} utilisation(s) par période de 24 heures.`, 'warning', undefined, newOrder.employeeId);
        throw new Error('Limite d’utilisation du code de livraison atteinte.');
      }
    }
    if (newOrder.fulfillmentMode === 'delivery') {
      const serviceKey = newOrder.department.trim();
      const serviceQuota = Math.max(0, institutionConfig.deliveryServiceDailyQuotas?.[serviceKey] ?? 0);
      if (serviceQuota > 0) {
        const todayKey = getLocalDateKey();
        const deliveredEmployeeIds = new Set(
          orders
            .filter(order =>
              order.fulfillmentMode === 'delivery' &&
              order.department.trim() === serviceKey &&
              getLocalDateKey(order.createdAt) === todayKey &&
              !['cancelled', 'expired', 'returned'].includes(order.status)
            )
            .map(order => order.employeeId)
        );
        if (!deliveredEmployeeIds.has(newOrder.employeeId) && deliveredEmployeeIds.size >= serviceQuota) {
          throw new Error(`Le quota quotidien de livraison du service ${serviceKey} (${serviceQuota}) est atteint.`);
        }
      }
    }
    const validateOrderProfileSnapshot = (profileSnapshot: { exists: () => boolean; data: () => any }) => {
      if (!profileSnapshot.exists()) {
        throw new Error("Profil Firestore introuvable pour ce badge. La DRH doit vérifier le compte de l'agent.");
      }
      const serverProfile = profileSnapshot.data();
      const allowedRoles = ['employee', 'hr', 'accountant', 'admin', 'operator', 'delivery'];
      if (serverProfile.role && !allowedRoles.includes(serverProfile.role) && serverProfile.hrAccess !== true && serverProfile.accountantAccess !== true) {
        throw new Error(`Type de compte non autorisé pour commander: ${serverProfile.role}. Corrigez le rôle du profil dans l'administration.`);
      }
      if (serverProfile.status === 'pending') {
        throw new Error("Badge en attente de validation DRH. La commande est bloquée pour cet agent.");
      }
      if (serverProfile.status === 'blocked' || serverProfile.badgeBlocked === true) {
        throw new Error("Badge bloqué ou inactif. La commande est bloquée pour cet agent.");
      }
      if (serverProfile.badgeNumber && (typeof serverProfile.badgeNumber !== 'string' || serverProfile.badgeNumber.length > 40)) {
        throw new Error("Numéro de badge invalide ou trop long dans Firebase. Corrigez le profil de l'agent.");
      }
      if (serverProfile.phone && (typeof serverProfile.phone !== 'string' || serverProfile.phone.length > 40)) {
        throw new Error("Numéro de téléphone invalide ou trop long dans Firebase. Corrigez le profil de l'agent.");
      }
      const currentWallet = Number(serverProfile.walletBalance || 0);
      if (!Number.isFinite(currentWallet) || !Number.isInteger(currentWallet)) {
        throw new Error("Solde badge invalide dans Firebase. Le solde doit être un nombre entier en FCFA.");
      }
      if (
        serverProfile.extraSubsidyCredits !== undefined &&
        serverProfile.extraSubsidyCredits !== null &&
        !Number.isInteger(Number(serverProfile.extraSubsidyCredits))
      ) {
        throw new Error("Crédit de subvention invalide dans Firebase. Corrigez extraSubsidyCredits en nombre entier.");
      }
      return { serverProfile, currentWallet };
    };
    if (isConfigured && db) {
      try {
        const nextStocks = new Map<string, number>();
        let updatedWallet = activeProfile.walletBalance;
        let sparkProfilePatch: Partial<UserProfile> = {};

        const createOrderWithBatchFallback = async () => {
          const mealQuantities = new Map<string, number>();
          newOrder.items.forEach(item => {
            if (!item.meal.id) return;
            mealQuantities.set(item.meal.id, (mealQuantities.get(item.meal.id) || 0) + item.quantity);
          });

          const mealRefs = [...mealQuantities.keys()].map(mealId => doc(db, 'meals', mealId));
          const mealSnapshots = await Promise.all(mealRefs.map(mealRef => getDocFromServer(mealRef)));
          const profileRef = doc(db, 'users', newOrder.employeeId);
          const profileSnapshot = newOrder.paymentMethod === 'badge_card'
              ? await getDocFromServer(profileRef)
            : null;

          mealSnapshots.forEach(snapshot => {
            const requestedQuantity = mealQuantities.get(snapshot.id) || 0;
            const currentStock = Number(snapshot.data().stock || 0);
            const mealName = newOrder.items.find(item => item.meal.id === snapshot.id).meal.name || snapshot.id;
            if (!snapshot.exists() || currentStock < requestedQuantity) {
              throw new Error(`Stock insuffisant pour ${mealName}.`);
            }
            nextStocks.set(snapshot.id, currentStock - requestedQuantity);
          });

          if (profileSnapshot) {
            const { currentWallet } = validateOrderProfileSnapshot(profileSnapshot);
            if (currentWallet < newOrder.total) {
              throw new Error(`Solde insuffisant: ${currentWallet.toLocaleString('fr-FR')} FCFA disponible.`);
            }
            updatedWallet = currentWallet - newOrder.total;
          }

          const batch = writeBatch(db);
          batch.set(doc(db, 'orders', newOrder.id), {
            ...firestoreSafe(newOrder),
            clientCreatedAt: newOrder.createdAt,
            serverCreatedAt: serverTimestamp(),
          });
          mealQuantities.forEach((quantity, mealId) => {
            batch.update(doc(db, 'meals', mealId), { stock: increment(-quantity) });
          });
          if (profileSnapshot) {
            batch.update(profileRef, {
              walletBalance: increment(-newOrder.total),
              lastPaidOrderId: newOrder.id,
              ...(extraSubsidyCreditUsed ? { extraSubsidyCredits: increment(-1) } : {}),
            });
          }
          await batch.commit();
        };

        if ((secureBalanceFunctionsEnabled || sparkBalanceEnabled) && newOrder.paymentMethod === 'badge_card') {
          const result = await retryFirestoreWrite(() => secureCreatePaidOrder(firestoreSafe(newOrder) as Order));
          if (result) {
            newOrder = result.order;
            sparkProfilePatch = result.profilePatch;
            updatedWallet = result.profilePatch.walletBalance;
            Object.entries(result.stocks).forEach(([id,stock]) => nextStocks.set(id,stock));
          }
        } else {
          try {
            await retryFirestoreWrite(() => runTransaction(db, async transaction => {
              const mealQuantities = new Map<string, number>();
              newOrder.items.forEach(item => {
                if (!item.meal.id) return;
            mealQuantities.set(item.meal.id, (mealQuantities.get(item.meal.id) || 0) + item.quantity);
              });
              const mealRefs = [...mealQuantities.keys()].map(mealId => doc(db, 'meals', mealId));
              const mealSnapshots = await Promise.all(mealRefs.map(mealRef => transaction.get(mealRef)));
              const profileRef = doc(db, 'users', newOrder.employeeId);
              const profileSnapshot = newOrder.paymentMethod === 'badge_card'
                  ? await transaction.get(profileRef)
                : null;

              mealSnapshots.forEach(snapshot => {
                const requestedQuantity = mealQuantities.get(snapshot.id) || 0;
                const currentStock = Number(snapshot.data().stock || 0);
                const mealName = newOrder.items.find(item => item.meal.id === snapshot.id).meal.name || snapshot.id;
                if (!snapshot.exists() || currentStock < requestedQuantity) {
                  throw new Error(`Stock insuffisant pour ${mealName}.`);
                }
                nextStocks.set(snapshot.id, currentStock - requestedQuantity);
              });

              if (profileSnapshot) {
                const { currentWallet } = validateOrderProfileSnapshot(profileSnapshot);
                if (currentWallet < newOrder.total) {
                  throw new Error(`Solde insuffisant: ${currentWallet.toLocaleString('fr-FR')} FCFA disponible.`);
                }
                updatedWallet = currentWallet - newOrder.total;
              }

              transaction.set(doc(db, 'orders', newOrder.id), {
                ...firestoreSafe(newOrder),
                clientCreatedAt: newOrder.createdAt,
                serverCreatedAt: serverTimestamp(),
              });
              nextStocks.forEach((stock, mealId) => transaction.update(doc(db, 'meals', mealId), { stock }));
              if (profileSnapshot) transaction.update(profileRef, {
                walletBalance: updatedWallet,
                lastPaidOrderId: newOrder.id,
                ...(extraSubsidyCreditUsed ? { extraSubsidyCredits: Math.max(0, Number(profileSnapshot.data().extraSubsidyCredits || 0) - 1) } : {}),
              });
            }));
          } catch (transactionError) {
            if (!isTransientFirestoreError(transactionError)) throw transactionError;
            await retryFirestoreWrite(createOrderWithBatchFallback);
          }
        }

        setOrders(prev => [newOrder, ...prev.filter(order => order.id !== newOrder.id)]);
        setMeals(prev => prev.map(meal => nextStocks.has(meal.id) ? { ...meal, stock: nextStocks.get(meal.id)! } : meal));
        if (newOrder.paymentMethod === 'badge_card') {
          setProfiles(prev => prev.map(profile => profile.id === newOrder.employeeId ? {
            ...profile,
            ...sparkProfilePatch,
            walletBalance: updatedWallet,
            ...(extraSubsidyCreditUsed ? { extraSubsidyCredits: Math.max(0, Number(profile.extraSubsidyCredits || 0) - 1) } : {}),
          } : profile));
          setActiveProfile(prev => ({
            ...prev,
            ...sparkProfilePatch,
            walletBalance: updatedWallet,
            ...(extraSubsidyCreditUsed ? { extraSubsidyCredits: Math.max(0, Number(prev.extraSubsidyCredits || 0) - 1) } : {}),
          }));
        }
        addNotification(
          `Commande validée (#${newOrder.id})`,
          `Votre commande de ${newOrder.total.toLocaleString('fr-FR')} FCFA est enregistrée et les portions ont été réservées.`,
          'success',
          newOrder.id,
          newOrder.employeeId
        );
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, `orders/${newOrder.id}`);
        throw error;
      }

    } else {
      // 1. Save order locally
      setOrders(prev => [newOrder, ...prev]);

      // 2. Subtract inventory quantities immediately
      setMeals(prevMeals => {
        return prevMeals.map(meal => {
          const orderedItem = newOrder.items.find(it => it.meal.id === meal.id);
          if (orderedItem) {
            const updatedStock = Math.max(0, meal.stock - orderedItem.quantity);
            
            // Trigger automated alert inside kitchen panel if meal stock becomes low
            if (updatedStock === 0) {
              setTimeout(() => {
                addNotification(
                  `Alerte Rupture : ${meal.name}`,
                  `Le plat "${meal.name}" est à présent épuisé. S.V.P réapprovisionnez-le.`,
                  'alert',
                  undefined,
                  'chef1'
                );
              }, 600);
            } else if (updatedStock <= 3) {
              setTimeout(() => {
                addNotification(
                  `Alerte Stock Bas : ${meal.name}`,
                  `Il ne reste plus que ${updatedStock} portions disponibles de "${meal.name}".`,
                  'warning',
                  undefined,
                  'chef1'
                );
              }, 600);
            }
            
            return { ...meal, stock: updatedStock };
          }
          return meal;
        });
      });

      // 3. Dispatch confirmation notification
      addNotification(
        `Commande validée (#${newOrder.id})`,
        `Votre commande de repas de ${newOrder.total.toLocaleString()} FCFA est enregistrée. Le restaurant prépare votre portion.`,
        'success',
        newOrder.id,
        newOrder.employeeId
      );
      if (newOrder.paymentMethod === 'badge_card') {
        const updatedWallet = Math.max(0, activeProfile.walletBalance - newOrder.total);
        setProfiles(prev => prev.map(profile => profile.id === activeProfile.id ? { ...profile, walletBalance: updatedWallet } : profile));
        setActiveProfile(prev => ({ ...prev, walletBalance: updatedWallet }));
      }
    }
  };

  // State transitions management (Real-time automated order logs)
  const handleUpdateOrderStatus = async (
    orderId: string,
    status: OrderStatus,
    expirationGrace: { used: boolean; weekKey: string; replacement?: boolean } = { used: false, weekKey: '' }
  ): Promise<boolean> => {
    const order = orders.find(o => o.id === orderId);
    if (!order) return false;
    if (!canTransitionOrder(order, status)) {
      addNotification('Commande déjà clôturée', 'Cette commande ne peut plus changer de statut.', 'warning', undefined, activeProfile.id);
      return false;
    }
    if (order.status === status) return true;


    const timestamp = new Date().toISOString();
    
    let refundedBalanceAfter: number | undefined;
    let stepTitle = '';
    let stepMessage = '';
    let notifTitle = '';
    let notifMsg = '';
    let notifType: 'info' | 'success' | 'warning' | 'alert' = 'info';
    const isReplacementCancellation = status === 'cancelled' && Boolean(expirationGrace.replacement);
    const canPrivilegedCancelWithRefund = ['admin', 'restaurant_admin', 'operator'].includes(activeProfile.role);
    const statusChangeDate = new Date(timestamp);
    const statusChangeMinutes = statusChangeDate.getHours() * 60 + statusChangeDate.getMinutes();
    const cancellationWeekKey = expirationGrace.weekKey || getWeekKey(statusChangeDate);
    const refundedThisWeek = orders.filter(item =>
      item.employeeId === order.employeeId &&
      item.id !== order.id &&
      item.paymentStatus === 'refunded' &&
      item.expirationGraceWeekKey === cancellationWeekKey
    ).length;
    const refundQuotaPerWeek = Math.max(0, Number(institutionConfig.unclaimedGracePerWeek || 3) || 3);
    const canOwnerCancelWithRefundBeforeNoon =
      secureBalanceFunctionsEnabled &&
      activeProfile.id === order.employeeId &&
      order.paymentMethod === 'badge_card' &&
      order.paymentStatus === 'paid' &&
      statusChangeMinutes < 12 * 60 &&
      refundedThisWeek < refundQuotaPerWeek;
    const refundOnCancel =
      (canPrivilegedCancelWithRefund || canOwnerCancelWithRefundBeforeNoon) &&
      order.status === 'pending' &&
      !expirationGrace.used;

    if (status === 'preparing') {
      stepTitle = 'En cours de préparation';
      stepMessage = 'Les fourneaux s’activent. Le chef mijote votre repas.';
      notifTitle = 'Repas en cuisine';
      notifMsg = `Votre commande #${order.id} est entrée en préparation.`;
    } else if (status === 'delivering') {
      stepTitle = 'En cours de livraison';
      stepMessage = 'La commande a quitté la cuisine centrale avec le livreur.';
      notifTitle = 'Commande en route';
      notifMsg = `Votre repas #${order.id} a été remis au livreur vers le ${order.building}.`;
    } else if (status === 'delivered') {
      stepTitle = 'Livré avec succès';
      stepMessage = 'Repas remis en main propre à température.';
      notifTitle = 'Bon appétit';
      notifMsg = `Votre commande #${order.id} a été livrée.`;
      notifType = 'success';
    } else if (status === 'returned') {
      stepTitle = 'Commande retournée au restaurant';
      stepMessage = "Le bénéficiaire était absent au point de livraison. Le repas a été retourné au restaurant.";
      notifTitle = 'Livraison non remise';
      notifMsg = `Votre commande #${order.id} a été retournée au restaurant car le livreur n'a pas pu vous trouver.`;
      notifType = 'warning';
    } else if (status === 'cancelled') {
      stepTitle = expirationGrace.used ? 'Commande non récupérée' : (isReplacementCancellation ? 'Commande changée' : 'Commande annulée');
      stepMessage = expirationGrace.used
        ? `Commande non récupérée après ${institutionConfig.unclaimedExpirationTime || '18:00'}. Le repas est perdu sans remboursement automatique.`
        : (isReplacementCancellation
          ? (refundOnCancel
            ? 'Cette commande a été remplacée avant 12h. Le badge a été recrédité de façon sécurisée.'
            : 'Cette commande a été remplacée par une nouvelle commande. Le badge n’a pas été recrédité automatiquement.')
        : (refundOnCancel
          ? 'La commande a été annulée avant 12h et le badge est recrédité.'
          : 'La commande a été annulée sans remboursement automatique.'));
      notifTitle = expirationGrace.used ? 'Repas perdu' : (isReplacementCancellation ? 'Commande changée' : (refundOnCancel ? 'Commande remboursée' : 'Commande annulée'));
      notifMsg = expirationGrace.used
        ? `La commande #${order.id} est perdue. Le badge n'est pas recrédité.`
        : (isReplacementCancellation
          ? `La commande #${order.id} a été remplacée. Vérifiez la nouvelle commande dans votre historique.`
        : (refundOnCancel
          ? `La commande #${order.id} a été annulée avant 12h. Votre badge a été recrédité.`
          : `La commande #${order.id} est annulée. Le badge n'est pas recrédité automatiquement.`));
      notifType = 'alert';
    } else if (status === 'expired') {
      const expirationTime = institutionConfig.unclaimedExpirationTime || '18:00';
      stepTitle = `Commande expirée à ${expirationTime}`;
      stepMessage = `La présence au restaurant n'a pas été validée avant ${expirationTime}.`;
      notifTitle = 'Commande perdue';
      notifMsg = `La commande #${order.id} a expiré à ${expirationTime} faute de validation au restaurant.`;
      notifType = 'alert';
    }

    const actorTrace = `Action enregistrée par ${activeProfile.name || 'Compte Ndamatou'} (${activeProfile.role || 'profil'}) le ${new Date(timestamp).toLocaleString('fr-FR')}.`;
    const tracedStepMessage = ['cancelled', 'expired', 'returned', 'delivered'].includes(status)
      ? `${stepMessage} ${actorTrace}`
      : stepMessage;

    const newStep = {
      status,
      title: stepTitle,
      description: tracedStepMessage,
      timestamp
    };
    const deliveryTrace = ['delivered', 'returned'].includes(status)
      ? {
          deliveredById: activeProfile.id,
          deliveredByName: activeProfile.name || 'Compte non renseigné',
          deliveredByRole: activeProfile.role || 'employee',
          deliveredVia:
            activeProfile.role === 'delivery'
              ? 'livreur'
              : activeProfile.role === 'restaurant_admin' || activeProfile.role === 'operator'
                ? 'restaurant'
                : activeProfile.id === order.employeeId
                  ? 'scan agent'
                  : 'validation manuelle',
        }
      : {};

    const updatedOrder: Order = {
      ...order,
      status,
      ...(expirationGrace ? {
        expirationGraceUsed: expirationGrace.used,
        expirationGraceWeekKey: cancellationWeekKey,
      } : {}),
      steps: [...order.steps, newStep],
      paymentStatus: status === 'cancelled' && refundOnCancel ? 'refunded' : (status === 'delivered' ? 'paid' : order.paymentStatus),
      deliveryTime: ['delivered', 'returned'].includes(status) ? timestamp : order.deliveryTime,
      ...deliveryTrace,
    };

    if (isConfigured && db) {
      try {
        const statusUpdate: Record<string, unknown> = {
          status: updatedOrder.status,
          steps: updatedOrder.steps,
        };
        if (expirationGrace) {
          statusUpdate.expirationGraceUsed = expirationGrace.used;
          statusUpdate.expirationGraceWeekKey = cancellationWeekKey;
        }
        if (status === 'delivered' || status === 'returned' || (status === 'cancelled' && refundOnCancel)) {
          statusUpdate.paymentStatus = updatedOrder.paymentStatus;
        }
        if (status === 'delivered' || status === 'returned') {
          statusUpdate.deliveryTime = updatedOrder.deliveryTime;
          statusUpdate.deliveredById = updatedOrder.deliveredById;
          statusUpdate.deliveredByName = updatedOrder.deliveredByName;
          statusUpdate.deliveredByRole = updatedOrder.deliveredByRole;
          statusUpdate.deliveredVia = updatedOrder.deliveredVia;
        }
        let remoteStatusAlreadyFinal = false;
        if (status === 'cancelled' && refundOnCancel) {
          const receipt = await retryFirestoreWrite(() => secureCancelPaidOrder(order.id, updatedOrder.steps));
          if (receipt && Number.isSafeInteger(receipt.balanceAfter)) refundedBalanceAfter = receipt.balanceAfter;
        } else if ((status === 'cancelled' && !refundOnCancel) || status === 'expired') {
          statusUpdate.paymentStatus = order.paymentStatus;
          const updateFinalStatusWithoutBalance = () => runTransaction(db, async transaction => {
            const orderRef = doc(db, 'orders', order.id);
            const serverOrderSnapshot = await transaction.get(orderRef);
            if (serverOrderSnapshot.exists()) {
              const serverStatus = String(serverOrderSnapshot.data().status || '');
              const serverPaymentStatus = String(serverOrderSnapshot.data().paymentStatus || '');
              if (['cancelled', 'expired', 'delivered', 'returned'].includes(serverStatus) || serverPaymentStatus === 'refunded') {
                remoteStatusAlreadyFinal = true;
                return;
              }
            }
            transaction.update(orderRef, firestoreSafe(statusUpdate));
          });
          await retryFirestoreWrite(updateFinalStatusWithoutBalance);
          if (remoteStatusAlreadyFinal) return false;
        } else if (status === 'cancelled' && refundOnCancel) {
          const cancelWithTransaction = () => runTransaction(db, async transaction => {
            const orderRef = doc(db, 'orders', order.id);
            const serverOrderSnapshot = await transaction.get(orderRef);
            if (serverOrderSnapshot.exists()) {
              const serverStatus = String(serverOrderSnapshot.data().status || '');
              const serverPaymentStatus = String(serverOrderSnapshot.data().paymentStatus || '');
              if (['cancelled', 'expired', 'delivered', 'returned'].includes(serverStatus) || serverPaymentStatus === 'refunded') {
                remoteStatusAlreadyFinal = true;
                return;
              }
            }
            const mealQuantities = new Map<string, number>();
            order.items.forEach(item => {
              if (!item.meal.id) return;
            mealQuantities.set(item.meal.id, (mealQuantities.get(item.meal.id) || 0) + item.quantity);
            });
            const mealRefs = [...mealQuantities.keys()].map(mealId => doc(db, 'meals', mealId));
            const mealSnapshots = await Promise.all(mealRefs.map(mealRef => transaction.get(mealRef)));
            const matchedUser = order.paymentMethod === 'badge_card'
              ? profiles.find(profile => profile.id === order.employeeId)
              : undefined;
            const userRef = matchedUser ? doc(db, 'users', matchedUser.id) : null;
            const userSnapshot = userRef ? await transaction.get(userRef) : null;
            const refundTransactionRef = doc(db, 'cashTransactions', `refund-${order.id}`);

            transaction.update(orderRef, firestoreSafe(statusUpdate));
            mealSnapshots.forEach(snapshot => {
              if (!snapshot.exists()) return;
              const quantity = mealQuantities.get(snapshot.id) || 0;
              transaction.update(snapshot.ref, { stock: Number(snapshot.data().stock || 0) + quantity });
            });
            if (userRef && userSnapshot.exists()) {
              transaction.update(userRef, { walletBalance: Number(userSnapshot.data().walletBalance || 0) + order.total });
            }
            transaction.set(refundTransactionRef, firestoreSafe({
              id: refundTransactionRef.id,
              employeeId: order.employeeId,
              employeeName: order.employeeName,
              badgeNumber: order.badgeNumber,
              amount: order.total,
              method: 'cash',
              cashierId: activeProfile.id,
              cashierName: activeProfile.name || 'Système Ndamatou',
              createdAt: timestamp,
              note: isReplacementCancellation
                ? `Remboursement sécurisé modification avant 12h - commande ${order.id}`
                : `Remboursement sécurisé annulation avant 12h - commande ${order.id}`,
              correctionOf: order.id,
              correctionReason: 'Annulation/modification avant 12h autorisée',
            }));
          });
          await retryFirestoreWrite(cancelWithTransaction);
          if (remoteStatusAlreadyFinal) return false;
        } else if (status === 'cancelled') {
          const cancelWithTransaction = () => runTransaction(db, async transaction => {
            const orderRef = doc(db, 'orders', order.id);
            const serverOrderSnapshot = await transaction.get(orderRef);
            if (serverOrderSnapshot.exists()) {
              const serverStatus = String(serverOrderSnapshot.data().status || '');
              const serverPaymentStatus = String(serverOrderSnapshot.data().paymentStatus || '');
              if (['cancelled', 'expired', 'delivered', 'returned'].includes(serverStatus) || serverPaymentStatus === 'refunded') {
                remoteStatusAlreadyFinal = true;
                return;
              }
            }
            transaction.update(orderRef, firestoreSafe(statusUpdate));
          });
          await retryFirestoreWrite(cancelWithTransaction);
          if (remoteStatusAlreadyFinal) return false;
        } else if (status === 'delivered' && order.status !== 'delivered') {
          // The order status is the authoritative delivery record. Keep this
          // write independent so an employee scan cannot be rejected merely
          // because employees cannot edit the restaurant's global counters.
          await retryFirestoreWrite(() => updateDoc(doc(db, 'orders', order.id), firestoreSafe(statusUpdate)));

          const deliveredDateKey = getLocalDateKey(timestamp);
          void retryFirestoreWrite(async () => {
              const statsBatch = writeBatch(db);
              order.items.forEach(item => {
                const matchedMeal = meals.find(meal => meal.id === item.meal.id);
                if (!matchedMeal) return;
                statsBatch.update(doc(db, 'meals', matchedMeal.id), matchedMeal.deliveredDateKey === deliveredDateKey
                  ? {
                      deliveredToday: increment(item.quantity),
                      [order.fulfillmentMode === 'delivery' ? 'deliveryDeliveredToday' : 'pickupDeliveredToday']: increment(item.quantity),
                      deliveredDateKey,
                    }
                  : {
                      deliveredToday: item.quantity,
                      pickupDeliveredToday: order.fulfillmentMode === 'delivery' ? 0 : item.quantity,
                      deliveryDeliveredToday: order.fulfillmentMode === 'delivery' ? item.quantity : 0,
                      deliveredDateKey,
                    }
                );
              });
              await statsBatch.commit();
            })
            .catch((statsError) => {
            handleFirestoreError(statsError, OperationType.WRITE, `meals/delivery-counters/${order.id}`);
            addNotification('Commande validée', `La commande #${order.id} est bien livrée. Les compteurs physiques seront resynchronisés dès que possible.`, 'warning', order.id);
            });
        } else {
          await retryFirestoreWrite(() => updateDoc(doc(db, 'orders', order.id), firestoreSafe(statusUpdate)));
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, `orders/${order.id}`);
        const transient = isTransientFirestoreError(error);
        const errorCode = getFirestoreErrorCode(error) || 'sans-code';
        const quotaMessage = errorCode.includes('resource-exhausted')
          ? "Le quota gratuit Firebase est atteint ou temporairement limité. Réessayez plus tard ; si le problème persiste, contactez l’administrateur."
          : "Vérifiez Internet puis rescanner le badge.";
        addNotification(
          transient ? 'Connexion Firebase instable' : 'Synchronisation commande refusée',
          transient
            ? `La commande #${order.id} n'a pas pu être confirmée après plusieurs tentatives (${errorCode}). ${quotaMessage} L'ancien statut est conservé.`
            : `Firebase a refusé le statut de la commande #${order.id} (${errorCode}). Publiez les règles Firestore puis rescanner le badge. L'ancien statut est conservé.`,
          'alert',
          order.id
        );
        return false;
      }
    }

    setOrders(prevOrders => prevOrders.map(o => o.id === orderId ? updatedOrder : o));

    if (status === 'delivered' && order.status !== 'delivered') {
      const deliveredDateKey = getLocalDateKey(timestamp);
      setMeals(currMeals => currMeals.map(meal => {
        const deliveredItem = order.items.find(item => item.meal.id === meal.id);
        if (!deliveredItem) return meal;
        return {
          ...meal,
          deliveredDateKey,
          deliveredToday: meal.deliveredDateKey === deliveredDateKey
            ? (meal.deliveredToday || 0) + deliveredItem.quantity
            : deliveredItem.quantity,
          pickupDeliveredToday: meal.deliveredDateKey === deliveredDateKey
            ? (meal.pickupDeliveredToday || 0) + (order.fulfillmentMode === 'delivery' ? 0 : deliveredItem.quantity)
            : (order.fulfillmentMode === 'delivery' ? 0 : deliveredItem.quantity),
          deliveryDeliveredToday: meal.deliveredDateKey === deliveredDateKey
            ? (meal.deliveryDeliveredToday || 0) + (order.fulfillmentMode === 'delivery' ? deliveredItem.quantity : 0)
            : (order.fulfillmentMode === 'delivery' ? deliveredItem.quantity : 0),
        };
      }));
    }

    if (status === 'cancelled' && refundOnCancel) {
      setMeals(currMeals => currMeals.map(meal => {
        const itemToRestore = order.items.find(it => it.meal.id === meal.id);
        return itemToRestore ? { ...meal, stock: meal.stock + itemToRestore.quantity } : meal;
      }));

      if (order.paymentMethod === 'badge_card') {
        setProfiles(currProfiles => currProfiles.map(p => {
          if (p.id !== order.employeeId) return p;
          const updatedWallet = refundedBalanceAfter ?? (p.walletBalance + order.total);
          if (activeProfile.id === p.id) {
            setActiveProfile(prev => ({ ...prev, walletBalance: updatedWallet }));
          }
          return { ...p, walletBalance: updatedWallet };
        }));
      }
    }

    addNotification(notifTitle, notifMsg, notifType, order.id, order.employeeId);

    return true;
  };

  const handleSetRestaurantPresence = async (profile: UserProfile, active: boolean) => {
    const presenceEntry = {
      employeeId: profile.id,
      employeeName: profile.name,
      department: profile.department,
      active,
      updatedAt: new Date().toISOString(),
    };
    setRestaurantPresenceEntries(current => [
      ...current.filter(entry => entry.employeeId !== profile.id),
      presenceEntry,
    ]);
    if (!isConfigured || !db) {
      return;
    }
    try {
      await retryFirestoreWrite(() => setDoc(doc(db, 'restaurantPresence', profile.id), presenceEntry, { merge: true }));
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `restaurantPresence/${profile.id}`);
      addNotification(
        'Présence restaurant locale',
        "La place est mise à jour sur cet écran, mais Firebase n'a pas encore confirmé la synchronisation. Vérifiez la connexion ou le quota.",
        'warning'
      );
    }
  };

  const handleChangeOrderToDelivery = async (
    orderId: string,
    authorization: { issuerId: string; issuerName: string; issuerService: string }
  ): Promise<boolean> => {
    const order = orders.find(item => item.id === orderId);
    if (!order || !['pending', 'preparing'].includes(order.status) || order.fulfillmentMode === 'delivery') return false;
    const serviceQuota = Math.max(0, institutionConfig.deliveryServiceDailyQuotas?.[order.department.trim()] ?? 0);
    if (serviceQuota > 0) {
      const todayKey = getLocalDateKey();
      const deliveredEmployeeIds = new Set(
        orders
          .filter(item =>
            item.fulfillmentMode === 'delivery' &&
            item.department.trim() === order.department.trim() &&
            getLocalDateKey(item.createdAt) === todayKey &&
            !['cancelled', 'expired', 'returned'].includes(item.status)
          )
          .map(item => item.employeeId)
      );
      if (!deliveredEmployeeIds.has(order.employeeId) && deliveredEmployeeIds.size >= serviceQuota) {
        addNotification('Quota livraison atteint', `Le quota quotidien du service ${order.department} est atteint.`, 'warning', order.id, order.employeeId);
        return false;
      }
    }
    const windowStart = new Date(rotatingDeliveryCodeExpiresAt).getTime() - (24 * 60 * 60 * 1000);
    const uses = orders.filter(item =>
      item.employeeId === order.employeeId &&
      Boolean(item.deliveryAuthorizedById) &&
      new Date(item.deliveryAuthorizationUsedAt || 0).getTime() >= windowStart
    ).length;
    if (uses >= institutionConfig.deliveryCodeMaxUsesPer24h) {
      addNotification('Limite du code atteinte', `La limite administrateur est de ${institutionConfig.deliveryCodeMaxUsesPer24h} utilisation(s) par période de 24 heures.`, 'warning', order.id, order.employeeId);
      return false;
    }
    const authorizationUsedAt = new Date().toISOString();
    const deliveryFeeAmount = institutionConfig.deliveryFeeEnabled ? Math.max(0, institutionConfig.deliveryFeeAmount) : 0;
    const employeeDeliveryFee = institutionConfig.deliveryFeePayer === 'employee' ? deliveryFeeAmount : 0;
    if (employeeDeliveryFee > 0 && activeProfile.id !== order.employeeId) {
      addNotification(
        'Frais de livraison non débités',
        "Lorsque le personnel paie la livraison, l'agent doit lui-même sélectionner ou convertir sa commande en livraison afin d'autoriser le débit de son badge.",
        'warning',
        order.id,
        order.employeeId
      );
      return false;
    }
    const employeeProfile = profiles.find(profile => profile.id === order.employeeId);
    if (employeeDeliveryFee > 0 && (!employeeProfile || employeeProfile.walletBalance < employeeDeliveryFee)) {
      addNotification('Solde insuffisant', `Le passage en livraison nécessite ${employeeDeliveryFee.toLocaleString('fr-FR')} FCFA de frais de livraison.`, 'warning', order.id, order.employeeId);
      return false;
    }
    const updatedOrder: Order = {
      ...order,
      fulfillmentMode: 'delivery',
      deliveryFeeEnabled: deliveryFeeAmount > 0,
      deliveryFeeAmount,
      deliveryFeePayer: institutionConfig.deliveryFeePayer,
      total: order.total + employeeDeliveryFee,
      deliveryAuthorizedById: authorization.issuerId,
      deliveryAuthorizedByName: authorization.issuerName,
      deliveryAuthorizedByService: authorization.issuerService,
      deliveryAuthorizationUsedAt: authorizationUsedAt,
    };
    if (isConfigured && db) {
      try {
        await runTransaction(db, async transaction => {
          const orderRef = doc(db, 'orders', orderId);
          const profileRef = doc(db, 'users', order.employeeId);
          const profileSnapshot = employeeDeliveryFee > 0 ? await transaction.get(profileRef) : null;
          if (profileSnapshot && Number(profileSnapshot.data().walletBalance || 0) < employeeDeliveryFee) {
            throw new Error('Solde insuffisant pour les frais de livraison.');
          }
          transaction.update(orderRef, {
            fulfillmentMode: 'delivery',
            deliveryAuthorizedById: authorization.issuerId,
            deliveryAuthorizedByName: authorization.issuerName,
            deliveryAuthorizedByService: authorization.issuerService,
            deliveryAuthorizationUsedAt: authorizationUsedAt,
            deliveryFeeEnabled: deliveryFeeAmount > 0,
            deliveryFeeAmount,
            deliveryFeePayer: institutionConfig.deliveryFeePayer,
            total: order.total + employeeDeliveryFee,
          });
          if (profileSnapshot) {
            transaction.update(profileRef, {
              walletBalance: Number(profileSnapshot.data().walletBalance || 0) - employeeDeliveryFee,
            });
          }
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `orders/${orderId}`);
        addNotification('Modification refusée', "Firebase n'a pas autorisé le passage en livraison.", 'alert', orderId, order.employeeId);
        return false;
      }
    }
    setOrders(previous => previous.map(item => item.id === orderId ? updatedOrder : item));
    if (employeeDeliveryFee > 0) {
      setProfiles(previous => previous.map(profile => profile.id === order.employeeId
          ? { ...profile, walletBalance: profile.walletBalance - employeeDeliveryFee }
        : profile));
      if (activeProfile.id === order.employeeId) {
        setActiveProfile(previous => ({ ...previous, walletBalance: previous.walletBalance - employeeDeliveryFee }));
      }
    }
    addNotification('Livraison activée', `La commande #${order.id} sera livrée dans votre service.`, 'success', order.id, order.employeeId);
    return true;
  };

  const handleIssuerSelectEmployeeForDelivery = async (employee: UserProfile): Promise<number> => {
    if (institutionConfig.deliveryAuthorizationMode !== 'selection') {
      throw new Error("Le mode de sélection directe n'est pas activé par l'administrateur.");
    }
    const readableDepartments = normalizeServiceList([
      activeProfile.department,
      ...(activeProfile.deliveryVisibleDepartments || []),
    ]);
    const employeeDepartment = normalizeHospitalService(employee.department || '');
    if (!activeProfile.deliveryCodeViewer || !readableDepartments.includes(employeeDepartment)) {
      throw new Error("Vous pouvez sélectionner uniquement un agent d'un service autorisé par l'administrateur.");
    }

    const toMinutes = (value: string) => {
      const [hour, minute] = value.split(':').map(Number);
      return (hour || 0) * 60 + (minute || 0);
    };
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const startMinutes = toMinutes(institutionConfig.deliverySelectionStart || '08:00');
    const endMinutes = toMinutes(institutionConfig.deliverySelectionEnd || '10:00');
    const isOpen = startMinutes <= endMinutes
        ? currentMinutes >= startMinutes && currentMinutes <= endMinutes
      : currentMinutes >= startMinutes || currentMinutes <= endMinutes;
    if (!isOpen) {
      throw new Error(`La sélection est autorisée uniquement de ${institutionConfig.deliverySelectionStart} à ${institutionConfig.deliverySelectionEnd}.`);
    }

    const eligibleOrders = orders.filter(order =>
      order.employeeId === employee.id &&
      ['pending', 'preparing'].includes(order.status) &&
      order.fulfillmentMode !== 'delivery'
    );
    if (eligibleOrders.length === 0) {
      throw new Error("Cet agent n'a aucune commande active à convertir en livraison.");
    }
    const todayKey = getLocalDateKey(now);
    const selectedToday = new Set(
      orders
        .filter(order =>
          order.deliveryAuthorizedById === activeProfile.id &&
          getLocalDateKey(order.deliveryAuthorizationUsedAt || new Date(0)) === todayKey
        )
        .map(order => order.employeeId)
    );
    const serviceQuota = Math.max(0, institutionConfig.deliveryServiceDailyQuotas?.[employee.department.trim()] ?? 0);
    if (serviceQuota > 0) {
      const serviceSelectionsToday = new Set(
        orders
          .filter(order =>
            order.fulfillmentMode === 'delivery' &&
            order.department.trim() === employee.department.trim() &&
            getLocalDateKey(order.createdAt) === getLocalDateKey(now) &&
            !['cancelled', 'expired', 'returned'].includes(order.status)
          )
          .map(order => order.employeeId)
      );
      if (!serviceSelectionsToday.has(employee.id) && serviceSelectionsToday.size >= serviceQuota) {
        throw new Error(`Le quota quotidien de livraison du service ${employee.department} (${serviceQuota}) est atteint.`);
      }
    }
    const dailyLimit = Math.max(1, activeProfile.deliverySelectionDailyLimit || 1);
    if (!selectedToday.has(employee.id) && selectedToday.size >= dailyLimit) {
      throw new Error(`Votre quota quotidien de ${dailyLimit} agent(s) est atteint.`);
    }

    const authorizationUsedAt = now.toISOString();
    const updatePayload = {
      fulfillmentMode: 'delivery' as const,
      deliveryAuthorizedById: activeProfile.id,
      deliveryAuthorizedByName: activeProfile.name,
      deliveryAuthorizedByService: activeProfile.department,
      deliveryAuthorizationUsedAt: authorizationUsedAt,
    };

    if (isConfigured && db) {
      const batch = writeBatch(db);
      eligibleOrders.forEach(order => batch.update(doc(db, 'orders', order.id), updatePayload));
      try {
        await batch.commit();
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, 'orders/delivery-selection');
        throw new Error("Firebase a refusé la sélection. Publiez les règles Firestore mises à jour.");
      }
    }

    const eligibleIds = new Set(eligibleOrders.map(order => order.id));
    setOrders(previous => previous.map(order => eligibleIds.has(order.id) ? { ...order, ...updatePayload } : order));
    addNotification(
      'Livraison sélectionnée',
      `${activeProfile.name} a demandé la livraison de ${eligibleOrders.length} commande(s) pour ${employee.name}.`,
      'success',
      eligibleOrders[0].id,
      employee.id
    );
    return eligibleOrders.length;
  };

  useEffect(() => {
    const autoRetireVisibleMenus = async () => {
      if (!institutionConfig.autoRetireMenusEnabled) return;
      const canRun =
        activeProfile.role === 'admin' ||
        activeProfile.role === 'restaurant_admin' ||
        activeProfile.role === 'accountant';
      if (!canRun || autoRetireMenusProcessingRef.current) return;

      const now = new Date();
      const dateKey = getLocalDateKey(now);
      if (institutionConfig.lastAutoRetireMenusDate === dateKey) return;

      const [hourRaw, minuteRaw] = (institutionConfig.autoRetireMenusTime || '18:30').split(':').map(Number);
      const deadline = new Date(now);
      deadline.setHours(Number.isFinite(hourRaw) ? hourRaw : 18, Number.isFinite(minuteRaw) ? minuteRaw : 30, 0, 0);
      if (now < deadline) return;
      const retireWindowEnd = new Date(deadline.getTime() + 15 * 60_000);
      if (now > retireWindowEnd) return;

      const activeMenus = meals.filter(meal =>
        meal.category === 'plat' &&
        meal.isAvailableToday &&
        !meal.isNextDay &&
        (meal.mealType || 'regular') === 'regular'
      );

      autoRetireMenusProcessingRef.current = true;
      try {
        setInstitutionConfig(current => ({ ...current, lastAutoRetireMenusDate: dateKey }));
        if (activeMenus.length > 0) {
          setMeals(previous => previous.map(meal =>
            activeMenus.some(activeMeal => activeMeal.id === meal.id)
              ? { ...meal, isAvailableToday: false }
              : meal
          ));
        }

        if (isConfigured && db && activeMenus.length > 0) {
          const batch = writeBatch(db);
          activeMenus.forEach(meal => {
            batch.update(doc(db, 'meals', meal.id), { isAvailableToday: false });
          });
          await batch.commit();
        }
        if (isConfigured && db) {
          setDoc(doc(db, 'settings', 'institution'), { lastAutoRetireMenusDate: dateKey }, { merge: true })
            .catch(error => handleFirestoreError(error, OperationType.WRITE, 'settings/institution/auto-retire'));
        }

        if (activeMenus.length > 0) {
          addNotification(
            'Menus retirés automatiquement',
            `${activeMenus.length} plat(s) chaud(s) actifs ont été retirés à ${institutionConfig.autoRetireMenusTime || '18:30'}.`,
            'info',
            undefined,
            activeProfile.id
          );
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, 'meals/auto-retire');
        setInstitutionConfig(current => ({ ...current, lastAutoRetireMenusDate: '' }));
      } finally {
        autoRetireMenusProcessingRef.current = false;
      }
    };

    autoRetireVisibleMenus();
    const timer = window.setInterval(autoRetireVisibleMenus, 60_000);
    return () => window.clearInterval(timer);
  }, [
    activeProfile.id,
    activeProfile.role,
    institutionConfig.autoRetireMenusEnabled,
    institutionConfig.autoRetireMenusTime,
    institutionConfig.lastAutoRetireMenusDate,
    meals,
  ]);

  useEffect(() => {
    const expireUnclaimedOrders = () => {
      if (!institutionConfig.unclaimedExpirationEnabled) return;
      const canRunExpiration =
        activeProfile.role === 'admin' ||
        activeProfile.role === 'restaurant_admin' ||
        activeProfile.role === 'operator';
      if (!canRunExpiration) return;
      const now = new Date();
      const weekKey = getWeekKey(now);
      const usedByEmployee = new Map<string, number>();
      orders.filter(order => order.expirationGraceUsed && order.expirationGraceWeekKey === weekKey)
        .forEach(order => usedByEmployee.set(order.employeeId, (usedByEmployee.get(order.employeeId) || 0) + 1));
      orders
        .filter(order =>
          !expirationProcessingRef.current.has(order.id) &&
          !['delivered', 'returned', 'cancelled', 'expired'].includes(order.status) &&
          (() => {
            const deadline = getUnclaimedOrderDeadline(
              order.createdAt,
              institutionConfig.unclaimedExpirationTime || '18:00',
              institutionConfig.orderWindowStart || '19:00'
            );
            return Boolean(deadline) && now >= deadline;
          })() &&
          (activeProfile.role !== 'employee' || order.employeeId === activeProfile.id)
        )
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
        .forEach(order => {
          const used = usedByEmployee.get(order.employeeId) || 0;
          const canUseGrace = institutionConfig.unclaimedGraceEnabled !== false && used < institutionConfig.unclaimedGracePerWeek;
          expirationProcessingRef.current.add(order.id);
          if (canUseGrace) {
            usedByEmployee.set(order.employeeId, used + 1);
            void handleUpdateOrderStatus(order.id, 'cancelled', { used: true, weekKey })
              .finally(() => expirationProcessingRef.current.delete(order.id));
          } else {
            void handleUpdateOrderStatus(order.id, 'expired', { used: false, weekKey })
              .finally(() => expirationProcessingRef.current.delete(order.id));
          }
        });
    };
    expireUnclaimedOrders();
    const timer = window.setInterval(expireUnclaimedOrders, 60_000);
    return () => window.clearInterval(timer);
  }, [orders, activeProfile.id, activeProfile.role, institutionConfig.unclaimedExpirationEnabled, institutionConfig.unclaimedExpirationTime, institutionConfig.orderWindowStart, institutionConfig.unclaimedGraceEnabled, institutionConfig.unclaimedGracePerWeek]);

  // Restock action callback inside inventory dashboard
  const handleUpdateMealStock = async (mealId: string, newStock: number) => {
    const currentMeal = meals.find(meal => meal.id === mealId);
    if (!currentMeal) return;
    const nextMaxStock = Math.max(currentMeal.maxStock || 0, newStock, 1);

    const affectedOrders = newStock === 0 && currentMeal.category === 'plat'
      ? orders.filter(order =>
          ['pending', 'preparing'].includes(order.status) &&
          order.items.some(item => item.meal.id === mealId)
        )
      : [];
    const portionsToReplace = affectedOrders.reduce(
      (sum, order) => sum + order.items.filter(item => item.meal.id === mealId).reduce((itemSum, item) => itemSum + item.quantity, 0),
      0
    );
    const fallbackMeal = portionsToReplace > 0
      ? meals
          .filter(meal =>
            meal.id !== mealId &&
            meal.category === 'plat' &&
            meal.isAvailableToday &&
            !meal.isNextDay &&
            (meal.mealType || 'regular') === 'regular' &&
            meal.stock >= portionsToReplace
          )
          .sort((a, b) => b.stock - a.stock)[0]
      : undefined;
    const replacementTimestamp = new Date().toISOString();
    const replacedOrders = fallbackMeal
      ? affectedOrders.map(order => ({
          ...order,
          items: order.items.map(item => item.meal.id === mealId ? { ...item, meal: fallbackMeal } : item),
          steps: [
            ...order.steps,
            {
              status: order.status,
              title: 'Plat remplacé après rupture',
              description: `${currentMeal.name} est épuisé. La commande a été transférée automatiquement vers ${fallbackMeal.name}.`,
              timestamp: replacementTimestamp,
            },
          ],
        }))
      : [];

    if (isConfigured && db) {
      try {
        const batch = writeBatch(db);
        batch.update(doc(db, 'meals', mealId), { stock: newStock, maxStock: nextMaxStock });
        if (fallbackMeal && replacedOrders.length > 0) {
          batch.update(doc(db, 'meals', fallbackMeal.id), { stock: fallbackMeal.stock - portionsToReplace });
          replacedOrders.forEach(order => batch.update(doc(db, 'orders', order.id), {
            items: firestoreSafe(order.items),
            steps: firestoreSafe(order.steps),
          }));
        }
        await batch.commit();
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, `meals/${mealId}`);
        addNotification('Modification du stock refusée', "Firebase n'a pas enregistré la rupture ni les remplacements.", 'alert');
        return;
      }
    }

    setMeals(prev => prev.map(meal => {
      if (meal.id === mealId) return { ...meal, stock: newStock, maxStock: nextMaxStock };
      if (fallbackMeal && meal.id === fallbackMeal.id) return { ...meal, stock: fallbackMeal.stock - portionsToReplace };
      return meal;
    }));
    if (replacedOrders.length > 0) {
      const replacementsById = new Map(replacedOrders.map(order => [order.id, order]));
      setOrders(previous => previous.map(order => replacementsById.get(order.id) || order));
      replacedOrders.forEach(order => addNotification(
        'Votre plat a été remplacé',
        `${currentMeal.name} est épuisé. Votre commande #${order.id} a été transférée automatiquement vers ${fallbackMeal!.name}.`,
        'warning',
        order.id,
        order.employeeId
      ));
      addNotification(
        'Substitution automatique terminée',
        `${portionsToReplace} portion(s) de ${currentMeal.name} ont été transférées vers ${fallbackMeal!.name}.`,
        'success',
        undefined,
        'chef1'
      );
    } else if (affectedOrders.length > 0) {
      addNotification(
        'Rupture sans plat de remplacement',
        `${currentMeal.name} est épuisé, mais aucun autre plat chaud ne possède les ${portionsToReplace} portion(s) nécessaires. Les commandes concernées doivent être traitées manuellement.`,
        'alert',
        undefined,
        'chef1'
      );
    } else if (newStock > 0) {
      addNotification(
        'Stock Réapprovisionné',
        `Les équipes de cuisine ont renouvelé les portions pour ce plat. Reste : ${newStock}`,
        'success',
        undefined,
        'chef1'
      );
    }
  };

  // Convert proposed next-day card item into today's available dish lists
  const handlePromoteNextDayMeal = (mealId: string, initialStock: number) => {
    if (isConfigured && db) {
      updateDoc(doc(db, 'meals', mealId), {
        isNextDay: false,
        isAvailableToday: true,
        stock: initialStock,
        maxStock: Math.max(initialStock, Math.ceil(initialStock * 1.5)),
        votesNextDay: 0,
        votedBy: []
      })
        .then(() => {
          addNotification(
            'Nouveau plat à la carte !',
            `Faisant suite aux votes enthousiastes, un nouveau plat est disponible aujourd'hui à la vente !`,
            'success'
          );
        })
        .catch(error => {
          handleFirestoreError(error, OperationType.WRITE, `meals/${mealId}`);
        });
    } else {
      setMeals(prev => prev.map(m => {
        if (m.id === mealId) {
          return {
            ...m,
            isNextDay: false,
            isAvailableToday: true,
            stock: initialStock,
            maxStock: Math.max(initialStock, Math.ceil(initialStock * 1.5)),
            votesNextDay: 0,
            votedBy: []
          };
        }
        return m;
      }));

      addNotification(
        'Nouveau plat à la carte !',
        `Faisant suite aux votes enthousiastes, un nouveau plat est disponible aujourd'hui à la vente !`,
        'success'
      );
    }
  };

  // Vote tally trigger for proposed items
  const handleVoteNextDay = async (mealId: string) => {
    const mealItem = meals.find(m => m.id === mealId);
    if (!mealItem) return;

    const voters = mealItem.votedBy || [];
    const hasVoted = voters.includes(activeProfile.id);
    const updatedVoters = hasVoted
      ? voters.filter(id => id !== activeProfile.id)
      : [...voters, activeProfile.id];
    const updatedMeals = meals.map(meal => {
      if (!meal.isNextDay || (meal.mealType || 'regular') !== 'regular') return meal;
      if (meal.id === mealId) return { ...meal, votedBy: updatedVoters, votesNextDay: updatedVoters.length };
      if (!hasVoted && meal.votedBy.includes(activeProfile.id)) {
        const nextVoters = meal.votedBy.filter(id => id !== activeProfile.id);
        return { ...meal, votedBy: nextVoters, votesNextDay: nextVoters.length };
      }
      return meal;
    });
    const changedMeals = updatedMeals.filter((meal, index) => meal !== meals[index]);

    if (isConfigured && db) {
      try {
        const batch = writeBatch(db);
        changedMeals.forEach(meal => batch.update(doc(db, 'meals', meal.id), {
          votesNextDay: meal.votesNextDay || 0,
          votedBy: meal.votedBy || [],
        }));
        await batch.commit();
        setMeals(updatedMeals);
        addNotification(hasVoted ? 'Vote annulé' : 'Vote enregistré', hasVoted ? `Votre vote pour ${mealItem.name} a été annulé.` : `Votre choix hebdomadaire est maintenant ${mealItem.name}.`, 'success');
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, `meals/${mealId}`);
        addNotification('Vote non enregistré', 'Firebase a refusé la synchronisation du vote. Réessayez.', 'alert');
      }
    } else {
      setMeals(updatedMeals);
    }
  };

  // Create standard dish
  const handleAddNewMeal = async (newMeal: Omit<Meal, 'id'>) => {
    const mealId = `meal-${Date.now()}`;
    const mealWithId: Meal = { ...newMeal, id: mealId };
    const weeklyVoteMeal: Meal | null = newMeal.category === 'plat'
      ? {
          ...newMeal,
          id: `${mealId}-weekly-vote`,
          stock: 0,
          isNextDay: true,
          isAvailableToday: true,
          votesNextDay: 0,
          votedBy: [],
          mealType: 'regular',
          voteScope: 'weekly',
        }
      : null;

    if (isConfigured && db) {
      try {
        const batch = writeBatch(db);
        batch.set(doc(db, 'meals', mealId), mealWithId);
        if (weeklyVoteMeal) batch.set(doc(db, 'meals', weeklyVoteMeal.id), weeklyVoteMeal);
        await batch.commit();
        setMeals(prev => [
          ...prev.filter(meal => meal.id !== mealId && meal.id !== weeklyVoteMeal?.id),
          mealWithId,
          ...(weeklyVoteMeal ? [weeklyVoteMeal] : []),
        ]);
        addNotification(
          'Plat Cuisine Ajouté',
          weeklyVoteMeal ?
            `Le plat "${newMeal.name}" a été ajouté à la carte et automatiquement au vote hebdomadaire.`
            : `Le plat "${newMeal.name}" a été ajouté par le Chef.`,
          'success',
          undefined,
          'chef1'
        );
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, `meals/${mealId}`);
        throw error;
      }
    } else {
      setMeals(prev => [...prev, mealWithId, ...(weeklyVoteMeal ? [weeklyVoteMeal] : [])]);
      addNotification(
        'Plat Cuisine Ajouté',
        weeklyVoteMeal ?
          `Le plat "${newMeal.name}" a été ajouté à la carte et automatiquement au vote hebdomadaire.`
          : `Le plat "${newMeal.name}" a été ajouté par le Chef.`,
        'success',
        undefined,
        'chef1'
      );
    }
  };

  const handleUpdateMeal = async (meal: Meal) => {
    const previousMeal = meals.find(item => item.id === meal.id);
    const isManualHotMealActivation =
      previousMeal &&
      !previousMeal.isAvailableToday &&
      meal.isAvailableToday &&
      meal.category === 'plat' &&
      !meal.isNextDay &&
      (meal.mealType || 'regular') === 'regular';
    const markAutoRetireDoneAfterLateManualActivation = async () => {
      if (!isManualHotMealActivation || !institutionConfig.autoRetireMenusEnabled) return;
      const now = new Date();
      const [hourRaw, minuteRaw] = (institutionConfig.autoRetireMenusTime || '18:30').split(':').map(Number);
      const deadline = new Date(now);
      deadline.setHours(Number.isFinite(hourRaw) ? hourRaw : 18, Number.isFinite(minuteRaw) ? minuteRaw : 30, 0, 0);
      if (now < deadline) return;
      const dateKey = getLocalDateKey(now);
      setInstitutionConfig(current => ({ ...current, lastAutoRetireMenusDate: dateKey }));
      if (isConfigured && db) {
        await setDoc(doc(db, 'settings', 'institution'), { lastAutoRetireMenusDate: dateKey }, { merge: true })
          .catch(error => handleFirestoreError(error, OperationType.WRITE, 'settings/institution/auto-retire-manual-activation'));
      }
    };

    if (isConfigured && db) {
      try {
        if (previousMeal) {
          const changedFields = Object.entries(meal).reduce<Record<string, unknown>>((changes, [key, value]) => {
            if (JSON.stringify((previousMeal as any)[key]) !== JSON.stringify(value)) {
              changes[key] = value;
            }
            return changes;
          }, {});
          if (Object.keys(changedFields).length > 0) {
            await updateDoc(doc(db, 'meals', meal.id), changedFields);
          }
        } else {
          await setDoc(doc(db, 'meals', meal.id), meal);
        }
        await markAutoRetireDoneAfterLateManualActivation();
        setMeals(prev => prev.map(m => m.id === meal.id ? meal : m));
        addNotification('Repas modifié', `${meal.name} a été mis à jour dans la carte.`, 'success', undefined, 'chef1');
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, `meals/${meal.id}`);
        throw error;
      }
    } else {
      void markAutoRetireDoneAfterLateManualActivation();
      setMeals(prev => prev.map(m => m.id === meal.id ? meal : m));
      addNotification('Repas modifié', `${meal.name} a été mis à jour dans la carte locale.`, 'success', undefined, 'chef1');
    }
  };

  const handleDeleteMeal = (mealId: string) => {
    const meal = meals.find(m => m.id === mealId);
    setMeals(prev => prev.filter(m => m.id !== mealId));

    if (isConfigured && db) {
      deleteDoc(doc(db, 'meals', mealId))
        .then(() => {
          addNotification('Repas supprimé', `${meal.name || 'Le repas'} a été retiré de la carte.`, 'info', undefined, 'chef1');
        })
        .catch(error => {
          handleFirestoreError(error, OperationType.DELETE, `meals/${mealId}`);
        });
    } else {
      addNotification('Repas supprimé', `${meal.name || 'Le repas'} a été retiré de la carte locale.`, 'info', undefined, 'chef1');
    }
  };
  // Create proposed dish
  const handleAddNewProposal = async (newMeal: Omit<Meal, 'id'>) => {
    const mealId = `prop-${Date.now()}`;
    const mealWithId: Meal = { ...newMeal, id: mealId };

    if (isConfigured && db) {
      try {
        await setDoc(doc(db, 'meals', mealId), mealWithId);
        setMeals(prev => [...prev.filter(meal => meal.id !== mealId), mealWithId]);
        addNotification('Proposition ajoutée', `La suggestion "${newMeal.name}" a été proposée pour le vote hebdomadaire ou le dîner spécial.`, 'success', undefined, 'chef1');
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, `meals/${mealId}`);
        throw error;
      }
    } else {
      setMeals(prev => [...prev, mealWithId]);
      addNotification('Proposition ajoutée', `La suggestion "${newMeal.name}" a été proposée pour le vote hebdomadaire ou le dîner spécial.`, 'success', undefined, 'chef1');
    }
  };

  // Notifications general actions
  const handleMarkAllNotificationsAsRead = () => {
    if (isConfigured && db) {
      visibleNotifications.forEach((n) => {
        if (!n.read) {
          updateDoc(doc(db, 'notifications', n.id), { read: true }).catch(err => {
            console.error("Error reading notif:", err);
          });
        }
      });
    } else {
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    }
  };

  const handleClearAllNotifications = () => {
    if (isConfigured && db) {
      visibleNotifications.forEach((n) => {
        deleteDoc(doc(db, 'notifications', n.id)).catch(err => {
          console.error("Error deleting notification:", err);
        });
      });
      setNotifications(prev => prev.filter(item => !visibleNotifications.some(visible => visible.id === item.id)));
    } else {
      setNotifications(prev => prev.filter(item => !visibleNotifications.some(visible => visible.id === item.id)));
    }
  };

  const handleReadNotification = (id: string) => {
    if (isConfigured && db) {
      updateDoc(doc(db, 'notifications', id), { read: true }).catch(err => {
        console.error("Error marking read:", err);
      });
    } else {
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    }
  };

  // Calculate unread count
  const restrictToPersonalNotifications = activeWorkspace === 'employee';
  const visibleNotifications = restrictToPersonalNotifications
    ? notifications.filter(notification => notification.userId === activeProfile.id)
    : notifications;
  const unreadCount = visibleNotifications.filter(n => !n.read).length;
  const isEmployeeOnly = isConfigured && activeProfile.role === 'employee';
  const isRestaurantOnly = isConfigured && activeProfile.role === 'restaurant_admin';
  const isOperatorOnly = isConfigured && activeProfile.role === 'operator';
  const isAdminOnly = isConfigured && activeProfile.role === 'admin';
  const isAccountantOnly = isConfigured && activeProfile.role === 'accountant';
  const isDeliveryOnly = isConfigured && activeProfile.role === 'delivery';
  const isHrOnly = isConfigured && activeProfile.role === 'hr';
  const hasHrAccess = isConfigured && (activeProfile.role === 'hr' || activeProfile.hrAccess === true);
  const hasAccountantAccess = isConfigured && (activeProfile.role === 'accountant' || activeProfile.accountantAccess === true);
  const authDateLabel = currentTime.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  });
  const authTimeLabel = currentTime.toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });

  useEffect(() => {
    if (activeProfile.role === 'operator' && activeWorkspace !== 'restaurant') {
      setActiveWorkspace('restaurant');
    }
  }, [activeProfile.role, activeWorkspace]);

  if (!isConfigured || !db || !auth) {
    return <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
      <div className="max-w-md rounded-2xl border bg-white p-6 text-center">
        <h1 className="text-xl font-bold">Connexion au service indisponible</h1>
        <p className="mt-3 text-slate-600">La configuration Firebase doit être rétablie pour accéder à votre compte et enregistrer les opérations.</p>
      </div>
    </div>;
  }

  if (isConfigured && !authReady) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center px-4">
        <div className="text-center">
          <Activity className="w-10 h-10 text-blue-400 animate-pulse mx-auto mb-4" />
          <p className="font-bold">Connexion au service Firebase...</p>
        </div>
      </div>
    );
  }

  if (isConfigured && !firebaseUser) {
    return (
      <div className="min-h-screen bg-slate-950 text-white px-4 py-6 flex items-center justify-center">
        <div className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-[0.95fr_1.15fr] overflow-hidden rounded-[28px] border border-white/10 bg-white shadow-2xl">
          <section className="relative bg-slate-950 text-white p-7 sm:p-10 flex flex-col justify-between min-h-[520px]">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.34),transparent_34%),linear-gradient(135deg,rgba(15,23,42,0.95),rgba(30,64,175,0.94))]" />
            <div className="relative space-y-8">
              <div className="flex items-center gap-4">
                {institutionConfig.logoUrl ? (
                  <img src={institutionConfig.logoUrl} alt="Logo Ndamatou" className="w-16 h-16 rounded-2xl object-contain bg-white p-2 border border-white/20" />
                ) : (
                  <div className="w-16 h-16 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center text-xs font-black text-amber-100">NDAMATOU</div>
                )}
                <div>
                  <p className="text-[11px] uppercase tracking-[0.24em] text-amber-200 font-black">Portail officiel</p>
                  <h1 className="text-xl sm:text-2xl font-black leading-tight mt-1">Plateforme Restauration Ndamatou</h1>
                </div>
              </div>

              <div>
                <p className="text-sm text-amber-100 font-semibold">Centre Hospitalier de Ndamatou</p>
                <p className="text-sm text-slate-300 mt-3 leading-relaxed max-w-md">
                  Plateforme interne de commande, distribution, badge QR et suivi des repas du personnel.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-4">
                <div className="rounded-3xl border border-white/15 bg-white/10 p-5">
                  <div className="flex items-center gap-2 text-amber-200 text-xs font-black uppercase tracking-wider">
                    <Clock3 className="w-4 h-4" />
                    Heure Ndamatou
                  </div>
                  <p className="mt-4 text-4xl sm:text-5xl font-black font-mono tracking-tight">{authTimeLabel}</p>
                </div>
                <div className="rounded-3xl border border-white/15 bg-white/10 p-5">
                  <div className="flex items-center gap-2 text-amber-200 text-xs font-black uppercase tracking-wider">
                    <CalendarDays className="w-4 h-4" />
                    Calendrier
                  </div>
                  <p className="mt-4 text-lg sm:text-xl font-black capitalize leading-snug">{authDateLabel}</p>
                </div>
              </div>
            </div>

            <p className="relative text-xs text-slate-300 leading-relaxed">
              Accès réservé au personnel autorisé de Ndamatou.
            </p>
          </section>

          <section className="bg-white text-slate-950 p-5 sm:p-8 lg:p-10">
            <div className="max-w-2xl mx-auto">
              <div className="flex items-start gap-4 mb-7">
                <div className="w-13 h-13 rounded-2xl bg-blue-700 flex items-center justify-center shadow-lg shadow-blue-700/20">
                  <ShieldCheck className="w-7 h-7 text-white" />
                </div>
                <div>
                  <h2 className="text-2xl font-black tracking-tight">{authMode === 'login' ? 'Connexion sécurisée' : 'Inscription du personnel'}</h2>
                  <p className="text-sm text-slate-500 mt-1">Accès Firebase Authentification pour le personnel de Ndamatou.</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 mb-6 rounded-2xl border border-slate-200 bg-slate-50 p-1.5 text-sm font-black">
                <button
                  type="button"
                  onClick={() => setAuthMode('login')}
                  className={`rounded-xl py-3 transition ${authMode === 'login' ? 'bg-blue-700 text-white shadow-sm' : 'text-slate-600 hover:bg-white'}`}
                >
                  Connexion
                </button>
                <button
                  type="button"
                  onClick={() => setAuthMode('register')}
                  className={`rounded-xl py-3 transition ${authMode === 'register' ? 'bg-blue-700 text-white shadow-sm' : 'text-slate-600 hover:bg-white'}`}
                >
                  Inscription
                </button>
              </div>

              <form onSubmit={authMode === 'login' ? handleLogin : handleRegister} className="space-y-5">
                {authMode === 'register' && (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[11px] font-black uppercase tracking-wider text-slate-700 mb-2">Prénom</label>
                        <input
                          type="text"
                          value={registerFirstName}
                          onChange={(event) => setRegisterFirstName(event.target.value)}
                          className="w-full border border-slate-300 bg-slate-50 rounded-2xl px-4 py-3.5 text-sm font-semibold text-slate-900 outline-none focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-black uppercase tracking-wider text-slate-700 mb-2">Nom</label>
                        <input
                          type="text"
                          value={registerLastName}
                          onChange={(event) => setRegisterLastName(event.target.value)}
                          className="w-full border border-slate-300 bg-slate-50 rounded-2xl px-4 py-3.5 text-sm font-semibold text-slate-900 outline-none focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                          required
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[11px] font-black uppercase tracking-wider text-slate-700 mb-2">Téléphone</label>
                        <input
                          type="text"
                          value={registerPhone}
                          onChange={(event) => setRegisterPhone(event.target.value)}
                          className="w-full border border-slate-300 bg-slate-50 rounded-2xl px-4 py-3.5 text-sm font-semibold text-slate-900 outline-none focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-black uppercase tracking-wider text-slate-700 mb-2">Service Ndamatou</label>
                        <select
                          value={registerDepartment}
                          onChange={(event) => setRegisterDepartment(event.target.value)}
                          className="w-full border border-slate-300 bg-slate-50 rounded-2xl px-4 py-3.5 text-sm font-semibold text-slate-900 outline-none focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                          required
                        >
                          <option value="">Sélectionner votre service</option>
                          {institutionConfig.services.map(service => <option key={service} value={service}>{service}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-[11px] font-black uppercase tracking-wider text-slate-700 mb-2">Bâtiment</label>
                        <select
                          value={registerBuilding}
                          onChange={(event) => setRegisterBuilding(event.target.value)}
                          className="w-full border border-slate-300 bg-slate-50 rounded-2xl px-4 py-3.5 text-sm font-semibold text-slate-900 outline-none focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                          required
                        >
                          <option value="">Sélectionner votre bâtiment</option>
                          {institutionConfig.buildings.map(building => <option key={building} value={building}>{building}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] font-black uppercase tracking-wider text-slate-700 mb-2">Étage</label>
                        <select
                          value={registerFloor}
                          onChange={(event) => setRegisterFloor(event.target.value)}
                          className="w-full border border-slate-300 bg-slate-50 rounded-2xl px-4 py-3.5 text-sm font-semibold text-slate-900 outline-none focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                        >
                          {institutionConfig.floors.map(floor => <option key={floor} value={floor}>{floor}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] font-black uppercase tracking-wider text-slate-700 mb-2">Fonction</label>
                        <select
                          value={registerSpecialty}
                          onChange={(event) => setRegisterSpecialty(event.target.value)}
                          className="w-full border border-slate-300 bg-slate-50 rounded-2xl px-4 py-3.5 text-sm font-semibold text-slate-900 outline-none focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                          required
                        >
                          {institutionConfig.specialties.map(specialty => <option key={specialty} value={specialty}>{specialty}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[11px] font-black uppercase tracking-wider text-slate-700 mb-2">Type d'engagement</label>
                        <select value={registerEmploymentType} onChange={(event) => setRegisterEmploymentType(event.target.value)} className="w-full border border-slate-300 bg-slate-50 rounded-2xl px-4 py-3.5 text-sm font-semibold text-slate-900" required>
                          {(institutionConfig.employmentTypes || DEFAULT_INSTITUTION_CONFIG.employmentTypes).map(type => <option key={type} value={type}>{type}</option>)}
                        </select>
                      </div>
                      {institutionConfig.registrationAccessEnabled && (
                        <div>
                          <label className="block text-[11px] font-black uppercase tracking-wider text-slate-700 mb-2">Code d'inscription Ndamatou</label>
                          <input type="password" autoComplete="one-time-code" value={registerAccessCode} onChange={(event) => setRegisterAccessCode(event.target.value)} placeholder="Fourni par la DRH ou l'administration" className="w-full border border-slate-300 bg-slate-50 rounded-2xl px-4 py-3.5 text-sm font-semibold text-slate-900" required />
                        </div>
                      )}
                    </div>
                  </>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-black uppercase tracking-wider text-slate-700 mb-2">
                      {authMode === 'register'
                          ? 'Adresse e-mail (de votre choix, utilisez un e-mail valide pour récupérer un mot de passe oublié)'
                        : 'Adresse e-mail'}
                    </label>
                      <input
                        type="email"
                        autoComplete="email"
                        value={loginEmail}
                      onChange={(event) => setLoginEmail(event.target.value)}
                      placeholder="votre@email.com"
                      className="w-full border border-slate-300 bg-slate-50 rounded-2xl px-4 py-3.5 text-sm font-semibold text-slate-900 outline-none focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-black uppercase tracking-wider text-slate-700 mb-2">Mot de passe</label>
                    <div className="relative">
                      <input
                        type={showAuthPassword ? 'text' : 'password'}
                        autoComplete={authMode === 'register' ? 'new-password' : 'current-password'}
                        value={loginPassword}
                        onChange={(event) => setLoginPassword(event.target.value)}
                        className="w-full border border-slate-300 bg-slate-50 rounded-2xl px-4 py-3.5 pr-12 text-sm font-semibold text-slate-900 outline-none focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                        required
                      />
                      <button type="button" title={showAuthPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'} onClick={() => setShowAuthPassword(value => !value)} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-500 hover:bg-slate-200">
                        {showAuthPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                </div>
                {authMode === 'register' && (
                  <div>
                    <label className="block text-[11px] font-black uppercase tracking-wider text-slate-700 mb-2">Confirmer le mot de passe</label>
                    <input
                      type={showAuthPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={registerPasswordConfirmation}
                      onChange={(event) => setRegisterPasswordConfirmation(event.target.value)}
                      className="w-full border border-slate-300 bg-slate-50 rounded-2xl px-4 py-3.5 text-sm font-semibold text-slate-900 outline-none focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                      required
                    />
                  </div>
                )}
                {authMode === 'login' && (
                  <div className="-mt-2 flex flex-col items-end gap-2">
                    <button
                      type="button"
                      onClick={handleSelfPasswordReset}
                      disabled={isSendingPasswordReset}
                      className="text-xs font-black text-blue-800 hover:text-blue-950 disabled:opacity-60"
                    >
                        {isSendingPasswordReset ? 'Envoi du lien...' : 'Mot de passe oublié'}
                    </button>
                    {passwordResetMessage && (
                      <p className="w-full rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs font-semibold leading-relaxed text-blue-800">
                        {passwordResetMessage}
                      </p>
                    )}
                  </div>
                )}

                {loginError && (
                  <p className="text-sm font-semibold text-red-700 bg-red-50 border border-red-100 rounded-2xl px-4 py-3">{loginError}</p>
                )}

                <button
                  type="submit"
                  disabled={isLoggingIn}
                  className="w-full bg-blue-700 text-white rounded-2xl px-4 py-4 font-black text-sm hover:bg-blue-800 disabled:opacity-60 shadow-lg shadow-blue-700/15"
                >
                    {isLoggingIn ? 'Traitement...' : authMode === 'login' ? 'Se connecter' : 'Créer mon compte'}
                </button>
                <button
                  type="button"
                  onClick={handleSoftRefreshApp}
                  className="mx-auto flex items-center justify-center gap-1 text-[11px] font-bold text-slate-400 hover:text-blue-800"
                >
                  <RefreshCw className="w-3 h-3" />
                  Actualiser l'application
                </button>
              </form>

              <p className="text-xs text-slate-500 mt-5 leading-relaxed">
                Les comptes sont créés dans Firebase Authentification, puis reliés à un profil dans la collection <span className="font-mono font-bold">users</span>.
              </p>
              <div className="mt-5 pt-4 border-t border-slate-100 text-center text-[10px] text-slate-400 leading-relaxed">
                <p>Portail culinaire officiel du Centre Hospitalier de Ndamatou - © 2026</p>
                <p className="font-mono text-slate-500">Copyright SMSG 2026 - smsgueye@gmail.com - 774190805</p>
              </div>
            </div>
          </section>
        </div>
      </div>
    );
  }

  if (isConfigured && firebaseUser && !cloudProfileReady) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center px-4">
        <div className="max-w-md rounded-3xl border border-blue-500/20 bg-slate-900 p-8 text-center shadow-2xl">
          <Activity className="w-10 h-10 text-blue-400 animate-pulse mx-auto mb-4" />
          <p className="text-lg font-black">Chargement des données réelles Firebase...</p>
          <p className="mt-2 text-sm text-slate-300">
            L'application attend le vrai profil, les services et les soldes enregistrés dans le cloud. Les données test ne sont pas affichées.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-12 flex flex-col font-sans">
      <style>{`@keyframes marquee { 0% { transform: translateX(100%); } 100% { transform: translateX(-100%); } }`}</style>
      <section className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-3 items-center">
          <div className="flex items-center gap-3">
            {institutionConfig.logoUrl ? (
              <img src={institutionConfig.logoUrl} alt="Logo Ndamatou" className="w-16 h-16 rounded-xl border border-slate-200 object-contain bg-white" />
            ) : (
              <div className="w-16 h-16 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-center text-[10px] font-black text-slate-400 text-center px-2">
                LOGO<br />NDAMATOU
              </div>
            )}
            <div>
              <p className="text-[10px] uppercase tracking-widest text-slate-500 font-black">République du Sénégal</p>
              <h1 className="text-sm sm:text-base font-black text-slate-950 leading-tight">Centre Hospitalier de Ndamatou</h1>
              <p className="text-xs text-slate-500 font-semibold">Plateforme interne de commande des repas du personnel</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-[1fr_1.25fr] gap-2">
            <div className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 p-2 min-h-[80px]">
              {institutionConfig.directorPhotoUrl ? (
                <img src={institutionConfig.directorPhotoUrl} alt="Directeur" className="w-14 h-14 rounded-lg object-cover bg-white border border-slate-200" />
              ) : (
                <div className="w-14 h-14 rounded-lg bg-white border border-dashed border-slate-300 flex items-center justify-center text-[9px] font-bold text-slate-400">PHOTO</div>
              )}
              <div>
                <p className="text-[10px] uppercase text-slate-400 font-black">Directeur</p>
                <p className="text-sm font-extrabold text-slate-900">{institutionConfig.directorName}</p>
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 p-2 min-h-[80px]">
              {institutionConfig.restaurantPhotoUrl ? (
                <img src={institutionConfig.restaurantPhotoUrl} alt="Restaurant Ndamatou" className="w-28 h-16 rounded-lg object-cover bg-white border border-slate-200 shadow-sm" />
              ) : (
                <div className="w-28 h-16 rounded-lg bg-white border border-dashed border-slate-300 flex items-center justify-center text-[9px] font-bold text-slate-400">PHOTO<br />RESTO</div>
              )}
              <div>
                <p className="text-[10px] uppercase text-slate-400 font-black">Restaurant</p>
                <p className="text-sm font-extrabold text-slate-900">Service restauration</p>
              </div>
            </div>
          </div>

        </div>
      </section>
      
      {/* 1. TOP HEADER NAVIGATION - Workspace navigation */}
      <header className="sticky top-0 z-30 bg-slate-950 border-b border-slate-900 text-white shadow-xl">
        <div className="max-w-7xl w-full overflow-hidden mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex flex-col xl:flex-row justify-between items-center gap-3">
          
          {/* Left side: configurable advertising space or platform identity */}
          <div className="flex min-w-0 flex-1 flex-col sm:flex-row items-center gap-3.5">
            {institutionConfig.advertisingEnabled ? (
              <div className="flex w-full min-w-0 items-center gap-3 overflow-hidden rounded-xl border border-amber-400/40 bg-slate-900 px-3 py-2">
                {institutionConfig.advertisingImageUrl && <img src={institutionConfig.advertisingImageUrl} alt="Annonce" className="h-11 w-16 shrink-0 rounded-lg object-cover" />}
                <div className="min-w-0 flex-1 overflow-hidden">
                  <div
                    className="app-marquee-track text-sm font-black text-amber-100 animate-[marquee_35s_linear_infinite]"
                    style={{ animationDuration: `${Math.max(10, institutionConfig.advertisingSpeedSeconds || 35)}s` }}
                  >
                    {institutionConfig.advertisingText || 'Information Ndamatou'}
                  </div>
                </div>
              </div>
            ) : (
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-500 to-indigo-400 flex items-center justify-center shadow-lg shadow-blue-500/10">
                <Activity className="w-6 h-6 text-slate-950 animate-pulse stroke-[2.5]" />
              </div>
              <div>
                <h1 className="text-sm font-black tracking-tight flex items-center gap-1">
                  PLATEFORME RESTAURATION NDAMATOU <span className="font-sans font-light text-[10px] bg-blue-600 px-1.5 py-0.5 rounded-full text-white font-semibold">Ndamatou</span>
                </h1>
                <p className="text-[9px] text-gray-400 font-mono tracking-wider">GESTION LOGISTIQUE & ALIMENTAIRE INTERNE</p>
              </div>
            </div>
            )}

            {/* Configured Status Bubble */}
            {!institutionConfig.advertisingEnabled && <div className="flex items-center">
              {isConfigured ? (
                <div className="flex flex-col gap-1">
                  <span className="flex items-center gap-1 text-[10px] bg-blue-900/40 text-blue-400 px-2.5 py-1 rounded-full border border-blue-800/30 font-medium">
                    <Sparkles className="w-3 h-3 text-blue-400" />
                    Firebase Synchronisé (Cloud)
                  </span>
                  {institutionConfig.diagnosticBannerEnabled && (
                    <span className="text-[9px] font-bold text-amber-200 bg-amber-950/50 border border-amber-800/50 rounded-full px-2 py-0.5">
                      {userDirectoryStatus}
                    </span>
                  )}
                </div>
              ) : (
                <span className="flex items-center gap-1 text-[10px] bg-blue-900/40 text-blue-400 px-2.5 py-1 rounded-full border border-blue-800/20 font-medium">
                  <Database className="w-3 h-3 text-blue-400" />
                  Mode Local (Firebase en attente)
                </span>
              )}
            </div>}
          </div>

          {/* Perspective Selector tab */}
          <div className="flex bg-slate-900 border border-slate-800 p-1 rounded-xl text-xs font-semibold gap-1">
            {!isRestaurantOnly && !isOperatorOnly && !isAdminOnly && !isAccountantOnly && !isDeliveryOnly && (
            <button
              id="top-wsp-employee"
              onClick={() => setActiveWorkspace('employee')}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg transition cursor-pointer ${
                activeWorkspace === 'employee'
                  ? 'bg-blue-600 text-white font-bold'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <User className="w-3.5 h-3.5" />
              Personnel Ndamatou
            </button>
            )}
            {!isEmployeeOnly && !isAdminOnly && !isAccountantOnly && !isDeliveryOnly && !isHrOnly && (
            <button
              id="top-wsp-restaurant"
              onClick={() => setActiveWorkspace('restaurant')}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg transition cursor-pointer ${
                activeWorkspace === 'restaurant'
                  ? 'bg-blue-600 text-white font-bold'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <ChefHat className="w-3.5 h-3.5" />
              Restaurant
            </button>
            )}
            {!isEmployeeOnly && !isRestaurantOnly && !isOperatorOnly && !isAccountantOnly && !isDeliveryOnly && !isHrOnly && (
            <button
              id="top-wsp-admin"
              onClick={() => setActiveWorkspace('admin')}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg transition cursor-pointer ${
                activeWorkspace === 'admin'
                  ? 'bg-blue-600 text-white font-bold'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              Administration
            </button>
            )}
            {hasAccountantAccess && !isRestaurantOnly && !isOperatorOnly && !isAdminOnly && !isDeliveryOnly && !isHrOnly && (
            <button
              id="top-wsp-accountant"
              onClick={() => setActiveWorkspace('accountant')}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg transition cursor-pointer ${
                activeWorkspace === 'accountant'
                  ? 'bg-blue-600 text-white font-bold'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <Banknote className="w-3.5 h-3.5" />
              Comptable
            </button>
            )}
            {!isEmployeeOnly && !isRestaurantOnly && !isOperatorOnly && !isAdminOnly && !isAccountantOnly && !isHrOnly && (
            <button
              id="top-wsp-delivery"
              onClick={() => setActiveWorkspace('delivery')}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg transition cursor-pointer ${
                activeWorkspace === 'delivery'
                  ? 'bg-blue-600 text-white font-bold'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <Truck className="w-3.5 h-3.5" />
              Livreurs
            </button>
            )}
            {hasHrAccess && !isRestaurantOnly && !isOperatorOnly && !isAdminOnly && !isAccountantOnly && !isDeliveryOnly && (
            <button
              id="top-wsp-hr"
              onClick={() => setActiveWorkspace('hr')}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg transition cursor-pointer ${activeWorkspace === 'hr' ? 'bg-blue-600 text-white font-bold' : 'text-gray-400 hover:text-white'}`}
            >
              <Users className="w-3.5 h-3.5" />
              DRH
            </button>
            )}
          </div>

          {/* Notification bell trigger */}
          <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-4">
            {isConfigured && institutionConfig.diagnosticBannerEnabled && (
              <span className="max-w-[min(92vw,680px)] whitespace-normal break-words rounded-xl border border-amber-700 bg-amber-950 px-2.5 py-1 text-[10px] font-black text-amber-100 shadow-sm">
                DIAG {userDirectoryStatus} | {restDirectoryStatus}
              </span>
            )}
            <button
              type="button"
              title="Actualiser l'application"
              aria-label="Actualiser l'application"
              onClick={handleSoftRefreshApp}
              className="p-2 text-slate-300 hover:text-white rounded-xl bg-slate-900 border border-slate-700 transition cursor-pointer"
            >
              <RefreshCw className="w-4.5 h-4.5" />
            </button>
            <button
              type="button"
              title="Mon profil"
              aria-label="Mon profil"
              onClick={() => {
                if (!isAccountantOnly && !isRestaurantOnly && !isOperatorOnly && !isAdminOnly && !isDeliveryOnly && !isHrOnly) setActiveWorkspace('employee');
                setIsProfileOpen(true);
              }}
              className="p-2 text-slate-300 hover:text-white rounded-xl bg-slate-900 border border-slate-700 transition cursor-pointer"
            >
              {activeProfile.photoUrl ? (
                <img src={activeProfile.photoUrl} alt="Mon profil" className="h-[18px] w-[18px] rounded-md object-cover" />
              ) : (
                <User className="w-4.5 h-4.5" />
              )}
            </button>
            <button
              id="top-bell-unreads"
              type="button"
              title="Notifications"
              aria-label="Notifications"
              onClick={() => setIsNotifOpen(true)}
              className="relative p-2 text-slate-300 hover:text-white rounded-xl bg-slate-900 border border-slate-700 transition cursor-pointer"
            >
              <Bell className="w-4.5 h-4.5" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-600 text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center animate-bounce">
                  {unreadCount}
                </span>
              )}
            </button>
            {isConfigured && firebaseUser && (
              <button
                onClick={handleLogout}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs font-bold text-slate-300 hover:text-white transition cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                Déconnexion
              </button>
            )}
          </div>

        </div>
      </header>

      {/* 2. WORKSPACE INSTRUCTIONS */}
      <div className="bg-blue-50 border-b border-blue-100/50 py-2.5 px-4 text-center">
        <p className="text-xs text-blue-950 font-sans flex items-center justify-center gap-1.5">
          <Sparkles className="w-4 h-4 text-blue-600" />
          {activeWorkspace === 'employee' && (
            <span><strong>Espace Personnel Ndamatou :</strong> Commandez votre repas et choisissez consommation sur place ou livraison.</span>
          )}
          {activeWorkspace === 'restaurant' && (
            <span><strong>Espace Restaurant :</strong> Expédiez les commandes, augmentez les stocks, proposez les menus votés par les collègues et consultez les graphiques.</span>
          )}
          {activeWorkspace === 'admin' && (
            <span><strong>Espace Administration :</strong> Gérez les paramètres institutionnels, les badges du personnel, les autorisations et les rapports.</span>
          )}
          {activeWorkspace === 'accountant' && (
            <span><strong>Espace Comptable :</strong> Encaissez les paiements, rechargez les badges et imprimez les rapports de versement.</span>
          )}
          {activeWorkspace === 'delivery' && (
            <span><strong>Espace Courriers :</strong> Naviguez entre les étages de l'hôpital et confirmez la livraison des portions d'un simple clic.</span>
          )}
          {activeWorkspace === 'hr' && (
            <span><strong>Espace DRH :</strong> Contrôlez, recherchez et exportez la liste des agents inscrits.</span>
          )}
        </p>
      </div>

      {/* 3. PRIMARY MAIN CONTAINER WRAPPER */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1 w-full bg-slate-50">
        <AnimatePresence mode="wait">
          {activeWorkspace === 'employee' && !isRestaurantOnly && !isOperatorOnly && !isAdminOnly && !isAccountantOnly && !isDeliveryOnly && (
            <motion.div
              key="employee-workspace"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <EmployeeView
                meals={meals}
                activeProfile={activeProfile}
                profiles={profiles}
                services={institutionConfig.services}
                isFirebaseMode={isConfigured}
                sparkMode={sparkBalanceEnabled}
                badgeSyncInProgress={isBadgeSyncInProgress}
                deliveryAccessCode={rotatingDeliveryCode}
                deliveryAccessCodeExpiresAt={rotatingDeliveryCodeExpiresAt}
                deliveryCodeSeed={institutionConfig.deliveryAccessCode}
                deliveryCodeMaxUsesPer24h={institutionConfig.deliveryCodeMaxUsesPer24h}
                deliveryAuthorizationMode={institutionConfig.deliveryAuthorizationMode}
                deliveryFeeEnabled={institutionConfig.deliveryFeeEnabled}
                deliveryFeeAmount={institutionConfig.deliveryFeeAmount}
                deliveryFeePayer={institutionConfig.deliveryFeePayer}
                deliverySelectionStart={institutionConfig.deliverySelectionStart}
                deliverySelectionEnd={institutionConfig.deliverySelectionEnd}
                deliveryServiceDailyQuotas={institutionConfig.deliveryServiceDailyQuotas}
                lateOrderPhone={institutionConfig.lateOrderPhone}
                waveMerchantNumber={institutionConfig.waveMerchantNumber}
                wavePaymentLink={institutionConfig.wavePaymentLink}
                waveFeeNotice={institutionConfig.waveFeeNotice}
                waveTopupEnabled={institutionConfig.waveTopupEnabled}
                prepaidCardEnabled={institutionConfig.prepaidCardEnabled}
                refundBeforeNoonEnabled={secureBalanceFunctionsEnabled}
                accountantContactEnabled={institutionConfig.accountantContactEnabled}
                accountantContactName={institutionConfig.accountantContactName}
                accountantContactPhone={institutionConfig.accountantContactPhone}
                extrasOrderingEnabled={institutionConfig.extrasOrderingEnabled}
                specialDinnerEnabled={institutionConfig.specialDinnerEnabled}
                orderWindowEnabled={institutionConfig.orderWindowEnabled}
                orderWindowStart={institutionConfig.orderWindowStart}
                orderWindowEnd={institutionConfig.orderWindowEnd}
                weekendOrderingClosed={institutionConfig.weekendOrderingClosed}
                unclaimedExpirationEnabled={institutionConfig.unclaimedExpirationEnabled}
                unclaimedExpirationTime={institutionConfig.unclaimedExpirationTime}
                unclaimedGraceEnabled={institutionConfig.unclaimedGraceEnabled}
                unclaimedGracePerWeek={institutionConfig.unclaimedGracePerWeek}
                realMealPrice={institutionConfig.realMealPrice}
                hospitalSupportAmount={institutionConfig.hospitalSupportAmount}
                staffMealPrice={institutionConfig.staffMealPrice}
                maxItemsPerOrder={institutionConfig.maxItemsPerOrder}
                officialResetAt={institutionConfig.officialResetAt}
                maxActiveHotMealsPerDay={institutionConfig.maxActiveHotMealsPerDay}
                restaurantCapacity={institutionConfig.restaurantCapacity}
                restaurantOccupancy={restaurantOccupancy}
                restaurantPlacesLoaded={shouldReadRestaurantPresence}
                onRequestRestaurantPlaces={() => setRestaurantPresenceRequested(true)}
                restaurantExitQrEnabled={institutionConfig.restaurantExitQrEnabled}
                isActiveRestaurantPresence={Boolean(activeProfileRestaurantPresence)}
                restaurantPresenceStartedAt={activeProfileRestaurantPresence?.updatedAt}
                restaurantPresenceExpiresAt={activeProfileRestaurantPresence
                    ? new Date(new Date(activeProfileRestaurantPresence.updatedAt).getTime() + institutionConfig.restaurantOccupancyMinutes * 60_000).toISOString()
                  : undefined}
                restaurantPresenceReminderEnabled={institutionConfig.restaurantPresenceReminderEnabled}
                restaurantPresenceReminderMinutes={institutionConfig.restaurantPresenceReminderMinutes}
                onSetRestaurantPresence={handleSetRestaurantPresence}
                onUpdateProfile={handleUpdateProfile}
                onChangePassword={handleChangeOwnPassword}
                orders={orders}
                cashTransactions={cashTransactions}
                onCreateOrder={handleCreateOrder}
                onConfirmPickupOrder={(orderId) => handleUpdateOrderStatus(orderId, 'delivered')}
                onCancelOrder={(orderId, options) => handleUpdateOrderStatus(orderId, 'cancelled', { used: false, weekKey: '', replacement: Boolean(options?.replacement) })}
                onChangeOrderToDelivery={handleChangeOrderToDelivery}
                onSelectEmployeeForDelivery={handleIssuerSelectEmployeeForDelivery}
                onRequestWaveTopup={handleWaveTopupRequest}
                waveTopupRequests={waveTopupRequests}
                onCancelWaveTopup={handleCancelWaveTopup}
                onRedeemPrepaidCard={handleRedeemPrepaidCard}
                onVoteNextDay={handleVoteNextDay}
                addNotification={addNotification}
              />
            </motion.div>
          )}

          {activeWorkspace === 'restaurant' && !isEmployeeOnly && !isAdminOnly && !isAccountantOnly && !isDeliveryOnly && !isHrOnly && (
            <motion.div
              key="restaurant-workspace"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <RestaurantView
                meals={meals}
                orders={orders}
                profiles={profiles}
                activeProfile={activeProfile}
                cashTransactions={cashTransactions}
                prepaidCards={prepaidCards}
                restaurantCapacity={institutionConfig.restaurantCapacity}
                restaurantOccupancy={restaurantOccupancy}
                onUpdateOrderStatus={handleUpdateOrderStatus}
                onChangeOrderToDelivery={handleChangeOrderToDelivery}
                onSetRestaurantPresence={handleSetRestaurantPresence}
                onUpdateMealStock={handleUpdateMealStock}
                onUpdateMeal={handleUpdateMeal}
                onDeleteMeal={handleDeleteMeal}
                onUpdateProfile={handleUpdateProfile}
                onDeleteProfile={handleDeleteProfile}
                onSendPasswordReset={handleSendPasswordReset}
                onRecoverAccount={handleRecoverAccountWithNewEmail}
                onResetAllBadgeBalances={handleResetAllBadgeBalances}
                onClearOperationalHistory={sparkBalanceEnabled ? undefined : handleClearOperationalHistory}
                onPromoteNextDayMeal={handlePromoteNextDayMeal}
                onAddNewMeal={handleAddNewMeal}
                onAddNewProposal={handleAddNewProposal}
                onTopupBadge={handleAccountantTopup}
                onCorrectTopup={handleCorrectTopup}
                onAdjustBadgeBalance={handleAdjustBadgeBalance}
                onCreatePrepaidCard={handleCreatePrepaidCard}
                addNotification={addNotification}
                canAccessAdministration={false}
                canAccessSensitiveAdministration={false}
                operatorMode={isOperatorOnly}
                institutionConfig={institutionConfig}
                rotatingDeliveryCode={rotatingDeliveryCode}
                rotatingDeliveryCodeExpiresAt={rotatingDeliveryCodeExpiresAt}
                onUpdateInstitutionConfig={handleUpdateInstitutionConfig}
              />
            </motion.div>
          )}

          {activeWorkspace === 'admin' && !isEmployeeOnly && !isRestaurantOnly && !isOperatorOnly && !isAccountantOnly && !isDeliveryOnly && !isHrOnly && (
            <motion.div
              key="admin-workspace"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <RestaurantView
                meals={meals}
                orders={orders}
                profiles={profiles}
                activeProfile={activeProfile}
                cashTransactions={cashTransactions}
                prepaidCards={prepaidCards}
                restaurantCapacity={institutionConfig.restaurantCapacity}
                restaurantOccupancy={restaurantOccupancy}
                onUpdateOrderStatus={handleUpdateOrderStatus}
                onChangeOrderToDelivery={handleChangeOrderToDelivery}
                onSetRestaurantPresence={handleSetRestaurantPresence}
                onUpdateMealStock={handleUpdateMealStock}
                onUpdateMeal={handleUpdateMeal}
                onDeleteMeal={handleDeleteMeal}
                onUpdateProfile={handleUpdateProfile}
                onDeleteProfile={handleDeleteProfile}
                onSendPasswordReset={handleSendPasswordReset}
                onRecoverAccount={handleRecoverAccountWithNewEmail}
                onResetAllBadgeBalances={handleResetAllBadgeBalances}
                onClearOperationalHistory={sparkBalanceEnabled ? undefined : handleClearOperationalHistory}
                onPromoteNextDayMeal={handlePromoteNextDayMeal}
                onAddNewMeal={handleAddNewMeal}
                onAddNewProposal={handleAddNewProposal}
                onTopupBadge={handleAccountantTopup}
                onCorrectTopup={handleCorrectTopup}
                onAdjustBadgeBalance={handleAdjustBadgeBalance}
                onCreatePrepaidCard={handleCreatePrepaidCard}
                addNotification={addNotification}
                canAccessAdministration={true}
                canAccessSensitiveAdministration={canManageSensitiveAdminSettings}
                operatorMode={false}
                institutionConfig={institutionConfig}
                rotatingDeliveryCode={rotatingDeliveryCode}
                rotatingDeliveryCodeExpiresAt={rotatingDeliveryCodeExpiresAt}
                onUpdateInstitutionConfig={handleUpdateInstitutionConfig}
              />
            </motion.div>
          )}

          {activeWorkspace === 'accountant' && hasAccountantAccess && !isRestaurantOnly && !isOperatorOnly && !isAdminOnly && !isDeliveryOnly && !isHrOnly && (
            <motion.div
              key="accountant-workspace"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <AccountantView
                activeProfile={activeProfile}
                profiles={profiles}
                transactions={cashTransactions}
                orders={orders}
                meals={meals}
                waveTopupRequests={waveTopupRequests}
                prepaidCards={prepaidCards}
                onTopupBadge={handleAccountantTopup}
                onCreatePrepaidCard={handleCreatePrepaidCard}
                onCorrectTopup={handleCorrectTopup}
                onAdjustBadgeBalance={handleAdjustBadgeBalance}
                onClaimLegacyTransactions={handleClaimLegacyTransactions}
                onApproveWaveTopup={handleApproveWaveTopup}
                onFlagProfileForHr={handleFlagProfileForHr}
                onClearCashHistory={sparkBalanceEnabled ? undefined : handleClearCashHistory}
                institutionConfig={institutionConfig}
              />
            </motion.div>
          )}

          {activeWorkspace === 'delivery' && !isEmployeeOnly && !isRestaurantOnly && !isOperatorOnly && !isAdminOnly && !isAccountantOnly && !isHrOnly && (
            <motion.div
              key="delivery-workspace"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <DeliveryView
                orders={orders}
                profiles={profiles}
                onUpdateOrderStatus={handleUpdateOrderStatus}
                onChangeOrderToDelivery={handleChangeOrderToDelivery}
                activeProfile={{ name: activeProfile.name, badgeNumber: activeProfile.badgeNumber }}
                deliveryAuthorizationMode={institutionConfig.deliveryAuthorizationMode}
                canPrintThermalLabels={false}
              />
            </motion.div>
          )}
          {activeWorkspace === 'hr' && hasHrAccess && !isRestaurantOnly && !isOperatorOnly && !isAdminOnly && !isAccountantOnly && !isDeliveryOnly && (
            <motion.div key="hr-workspace" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <HrView
                profiles={profiles}
                activeProfile={activeProfile}
                employmentTypes={institutionConfig.employmentTypes || DEFAULT_INSTITUTION_CONFIG.employmentTypes}
                services={institutionConfig.services}
                employmentTypeLocked={institutionConfig.employeeEmploymentTypeLocked !== false}
                onSetEmploymentTypeLocked={async (locked) => {
                  await handleUpdateInstitutionConfig({
                    ...institutionConfig,
                    employeeEmploymentTypeLocked: locked,
                  });
                }}
                onUpdateProfile={async (profile) => {
                  await handleUpdateProfile(profile);
                  setActiveWorkspace('hr');
                }}
                onDeleteProfile={handleDeleteProfile}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* 4. NOTIFICATION CENTER DRAWER AND GLOBAL ACTIVE SYSTEM TOAST popups */}
      <NotificationCenter
        notifications={visibleNotifications}
        onMarkAllAsRead={handleMarkAllNotificationsAsRead}
        onClearAll={handleClearAllNotifications}
        onClose={() => setIsNotifOpen(false)}
        isOpen={isNotifOpen}
        onReadNotification={handleReadNotification}
      />
      <ProfileDrawer
        isOpen={isProfileOpen}
        profile={activeProfile}
        services={institutionConfig.services}
        buildings={institutionConfig.buildings}
        floors={institutionConfig.floors}
        functions={institutionConfig.specialties}
        employmentTypes={institutionConfig.employmentTypes || DEFAULT_INSTITUTION_CONFIG.employmentTypes}
        employmentTypeLocked={institutionConfig.employeeEmploymentTypeLocked !== false}
        onClose={() => setIsProfileOpen(false)}
        onUpdateProfile={handleUpdateProfile}
        onChangePassword={handleChangeOwnPassword}
      />

      <ActiveToast
        toast={activeToast}
        onDismiss={() => setActiveToast(null)}
      />

      {/* Footer credits representation */}
      <footer className="mt-12 border-t border-gray-100 py-6 text-center text-xs text-slate-400 bg-white">
        <div className="max-w-7xl mx-auto px-4 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="flex items-center gap-1.5 font-sans justify-center">
            <HeartHandshake className="w-4 h-4 text-blue-500" />
            Portail culinaire officiel du Centre Hospitalier de Ndamatou — © {new Date().getFullYear()}
          </p>
          <p className="font-mono text-[10px] text-slate-500">
            Copyright SMSG 2026 - smsgueye@gmail.com - 774190805
          </p>
          <div className="flex gap-4 font-mono text-[10px]">
            <span>Version: production-20260628</span>
            <span>Sécurisé TLS 1.3 avec Firebase</span>
          </div>
        </div>
      </footer>

    </div>
  );
}





















