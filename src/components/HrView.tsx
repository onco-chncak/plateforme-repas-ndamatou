import React, { useMemo, useState } from 'react';
import { Download, Edit3, Lock, Save, Search, Trash2, Unlock, Users } from 'lucide-react';
import { UserProfile } from '../types';
import { getLocalDateKey } from '../lib/business';

interface HrViewProps {
  profiles: UserProfile[];
  activeProfile?: UserProfile;
  employmentTypes?: string[];
  services?: string[];
  employmentTypeLocked?: boolean;
  readOnly?: boolean;
  onUpdateProfile: (profile: UserProfile) => Promise<void> | void;
  onDeleteProfile: (profile: UserProfile) => Promise<void> | void;
  onSetEmploymentTypeLocked?: (locked: boolean) => Promise<void> | void;
}

const escapeCell = (value: unknown) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const isPersonnelProfile = (profile: UserProfile) =>
  profile.role === 'employee' ||
  (!profile.role && Boolean(profile.badgeNumber || profile.phone)) ||
  (
    Boolean(profile.badgeNumber || profile.phone) &&
    !['admin', 'restaurant_admin', 'accountant', 'delivery', 'operator'].includes(String(profile.role || ''))
  );

const normalizeServiceLabel = (service: string) => {
  const clean = String(service || '').trim();
  const folded = clean.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s*\/\s*/g, '/');
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
  ].includes(folded)) {
    return 'Gynécologie';
  }
  return clean;
};

const normalizeDigits = (value: unknown) => String(value ?? '').replace(/\D/g, '');
const MISSING_EMPLOYMENT_TYPE_FILTER = 'Engagement non renseigné';
const MISSING_SERVICE_FILTER = 'Service non renseigné';

const splitDisplayName = (name: string) => {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { firstName: parts[0] || '', lastName: '' };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
};

type HrProfileDraft = {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  department: string;
  building: string;
  floor: string;
  room: string;
  employmentType: string;
  contractEndDate: string;
};

const hasDrhValidationTrace = (profile: UserProfile) =>
  Boolean(profile.validatedAt || profile.validatedByName || profile.validatedById);

const isPendingValidation = (profile: UserProfile) =>
  isPersonnelProfile(profile) &&
  !hasDrhValidationTrace(profile) &&
  profile.status !== 'blocked' &&
  (profile.status === 'pending' || (!profile.status && profile.badgeBlocked));

const isBlockedByHr = (profile: UserProfile) =>
  profile.status === 'blocked' || (profile.badgeBlocked && profile.status !== 'pending');

const isVerifiedByDrh = (profile: UserProfile) =>
  hasDrhValidationTrace(profile) && !isBlockedByHr(profile) && profile.badgeBlocked !== true;

const getStatusLabel = (profile: UserProfile) => {
  if (isBlockedByHr(profile)) return 'Bloqué par DRH';
  if (isVerifiedByDrh(profile)) return 'Badge vérifié par DRH';
  if (isPendingValidation(profile) || profile.verificationFlagged) return 'À vérifier par DRH';
  return 'Badge vérifié par DRH';
};

const getStatusClass = (profile: UserProfile) => {
  if (isBlockedByHr(profile)) return 'bg-red-50 text-red-700';
  if (isVerifiedByDrh(profile)) return 'bg-blue-50 text-blue-700';
  if (isPendingValidation(profile) || profile.verificationFlagged) return 'bg-amber-50 text-amber-700';
  return 'bg-blue-50 text-blue-700';
};

export const HrView: React.FC<HrViewProps> = ({
  profiles,
  activeProfile,
  employmentTypes: configuredEmploymentTypes = [],
  services: configuredServices = [],
  employmentTypeLocked = true,
  readOnly = false,
  onUpdateProfile,
  onDeleteProfile,
  onSetEmploymentTypeLocked,
}) => {
  const [query, setQuery] = useState('');
  const [service, setService] = useState('Tous les services');
  const [employmentType, setEmploymentType] = useState('Tous les engagements');
  const [statusFilter, setStatusFilter] = useState('Tous les statuts');
  const [actionMessage, setActionMessage] = useState('');
  const [isSavingEmploymentLock, setIsSavingEmploymentLock] = useState(false);
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [profileDrafts, setProfileDrafts] = useState<Record<string, HrProfileDraft>>({});

  const employees = useMemo(() => profiles.filter(isPersonnelProfile), [profiles]);
  const services = useMemo(
    () => Array.from(new Set([
      ...configuredServices.map(normalizeServiceLabel),
      ...(employees.map(profile => normalizeServiceLabel(profile.department)).filter(Boolean) as string[]),
    ])).filter(Boolean).sort((a, b) => a.localeCompare(b, 'fr')),
    [configuredServices, employees]
  );
  const employmentTypes = useMemo(
    () => Array.from(new Set([
      ...configuredEmploymentTypes,
      ...(employees.map(profile => profile.employmentType).filter(Boolean) as string[]),
    ])).filter(Boolean).sort((a, b) => a.localeCompare(b, 'fr')),
    [configuredEmploymentTypes, employees]
  );

  const resetNarrowFilters = () => {
    setQuery('');
    setService('Tous les services');
    setEmploymentType('Tous les engagements');
  };

  const todayKey = getLocalDateKey();
  const pendingCount = employees.filter(isPendingValidation).length;
  const todayCount = employees.filter(profile => getLocalDateKey(profile.createdAt || new Date()) === todayKey).length;
  const missingEmploymentTypeCount = employees.filter(profile => !String(profile.employmentType || '').trim()).length;
  const missingServiceCount = employees.filter(profile => !String(profile.department || '').trim()).length;
  const blockedCount = employees.filter(isBlockedByHr).length;

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('fr-FR');
    const needleDigits = normalizeDigits(query);
    return employees.filter(profile => {
      const createdToday = getLocalDateKey(profile.createdAt || new Date()) === todayKey;
      const matchesStatus =
        statusFilter === 'Tous les statuts' ||
        (statusFilter === 'Attente validation' && isPendingValidation(profile)) ||
        (statusFilter === 'Nouvelles inscriptions du jour' && createdToday) ||
        (statusFilter === 'Bloqués' && isBlockedByHr(profile)) ||
        (statusFilter === 'À vérifier' && Boolean(profile.verificationFlagged));
      const haystack = `${profile.name} ${profile.phone} ${profile.email} ${profile.department} ${profile.room} ${profile.employmentType || ''} ${profile.badgeNumber || ''}`.toLocaleLowerCase('fr-FR');
      const phoneDigits = normalizeDigits(profile.phone);
      return (
        (
          service === 'Tous les services' ||
          (service === MISSING_SERVICE_FILTER && !String(profile.department || '').trim()) ||
          normalizeServiceLabel(profile.department) === service
        ) &&
        (
          employmentType === 'Tous les engagements' ||
          (employmentType === MISSING_EMPLOYMENT_TYPE_FILTER && !String(profile.employmentType || '').trim()) ||
          profile.employmentType === employmentType
        ) &&
        matchesStatus &&
        (!needle || haystack.includes(needle) || (!!needleDigits && phoneDigits.includes(needleDigits)))
      );
    });
  }, [employees, employmentType, query, service, statusFilter, todayKey]);

  const exportExcel = () => {
    const rows = filtered.map(profile => `
      <tr>
        <td>${escapeCell(profile.name)}</td><td>${escapeCell(profile.phone)}</td><td>${escapeCell(profile.room)}</td>
        <td>${escapeCell(profile.department)}</td><td>${escapeCell(profile.walletBalance || 0)} FCFA</td>
        <td>${escapeCell(profile.employmentType || 'Non renseigné')}</td><td>${escapeCell(profile.contractEndDate || '')}</td>
        <td>${escapeCell(getStatusLabel(profile))}</td><td>${escapeCell(profile.email)}</td><td>${escapeCell(profile.badgeNumber)}</td>
      </tr>`).join('');
    const html = `<html><head><meta charset="utf-8"></head><body>
      <h1>Personnel inscrit - Ndamatou</h1><p>Service: ${escapeCell(service)} | Export: ${escapeCell(new Date().toLocaleString('fr-FR'))}</p>
      <table border="1"><thead><tr><th>Nom</th><th>Téléphone</th><th>Fonction</th><th>Service</th><th>Solde badge</th><th>Type d'engagement</th><th>Fin contrat</th><th>Statut</th><th>Email</th><th>Badge</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="10">Aucun agent</td></tr>'}</tbody></table></body></html>`;
    const link = document.createElement('a');
    const url = URL.createObjectURL(new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8;' }));
    link.href = url;
    link.download = `personnel-Ndamatou-${service === 'Tous les services' ? 'tous-services' : service}-${getLocalDateKey()}.xls`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const toggleBlock = async (profile: UserProfile) => {
    if (readOnly) return;
    const blocked = isBlockedByHr(profile);
    await onUpdateProfile({ ...profile, status: blocked ? 'active' : 'blocked', badgeBlocked: !blocked, __adminPatchKeys: ['status', 'badgeBlocked'] } as UserProfile & { __adminPatchKeys: string[] });
    setActionMessage(blocked ? `${profile.name} est débloqué.` : `${profile.name} est bloqué et ne peut plus utiliser son compte.`);
  };

  const validateProfile = async (profile: UserProfile) => {
    if (readOnly) return;
    try {
      await onUpdateProfile({
        ...profile,
        status: 'active',
        badgeBlocked: false,
        verificationFlagged: false,
        validatedById: activeProfile?.id,
        validatedByName: activeProfile?.name || 'DRH Ndamatou',
        validatedAt: new Date().toISOString(),
        __adminPatchKeys: ['status', 'badgeBlocked', 'verificationFlagged', 'validatedById', 'validatedByName', 'validatedAt'],
      } as UserProfile & { __adminPatchKeys: string[] });
      setActionMessage(`${profile.name} est validé par la DRH.`);
    } catch (error) {
      setActionMessage(`Échec validation DRH: ${error instanceof Error ? error.message : 'Firebase a refusé la modification.'}`);
    }
  };

  const changeEmploymentType = async (profile: UserProfile, nextType: string) => {
    if (readOnly) return;
    await onUpdateProfile({ ...profile, employmentType: nextType });
    setActionMessage(`Type d'engagement de ${profile.name} mis à jour.`);
  };

  const changeService = async (profile: UserProfile, nextService: string) => {
    if (readOnly) return;
    await onUpdateProfile({ ...profile, department: nextService });
    setActionMessage(`Service de ${profile.name} mis à jour.`);
  };

  const changeContractEndDate = async (profile: UserProfile, nextDate: string) => {
    if (readOnly) return;
    const expired = Boolean(nextDate) && new Date(`${nextDate}T23:59:59`).getTime() < Date.now();
    await onUpdateProfile({
      ...profile,
      contractEndDate: nextDate,
      ...(!nextDate && profile.contractEndDate ? { status: 'active' as const, badgeBlocked: false } : {}),
      ...(expired ? { status: 'blocked' as const, badgeBlocked: true } : {}),
    });
    setActionMessage(expired ? `${profile.name}: contrat terminé, compte rendu inactif.` : `${profile.name}: fin de contrat mise à jour.`);
  };

  const changeSubsidyAccess = async (profile: UserProfile, nextGetsSubsidy: boolean) => {
    if (readOnly) return;
    await onUpdateProfile({ ...profile, subsidyExcluded: !nextGetsSubsidy });
    setActionMessage(
      nextGetsSubsidy
        ? `${profile.name} bénéficie de la subvention.`
        : `${profile.name} ne bénéficie plus de la subvention.`
    );
  };

  const openProfileEditor = (profile: UserProfile) => {
    const splitName = splitDisplayName(profile.name);
    setProfileDrafts(previous => ({
      ...previous,
      [profile.id]: previous[profile.id] || {
        firstName: splitName.firstName,
        lastName: splitName.lastName,
        phone: profile.phone || '',
        email: profile.email || '',
        department: profile.department || '',
        building: profile.building || '',
        floor: profile.floor || '',
        room: profile.room || '',
        employmentType: profile.employmentType || '',
        contractEndDate: profile.contractEndDate || '',
      },
    }));
    setEditingProfileId(profile.id);
  };

  const updateDraft = (profileId: string, key: keyof HrProfileDraft, value: string) => {
    setProfileDrafts(previous => ({
      ...previous,
      [profileId]: {
        ...(previous[profileId] || {
          firstName: '',
          lastName: '',
          phone: '',
          email: '',
          department: '',
          building: '',
          floor: '',
          room: '',
          employmentType: '',
          contractEndDate: '',
        }),
        [key]: value,
      },
    }));
  };

  const saveProfileDraft = async (profile: UserProfile) => {
    if (readOnly) return;
    const draft = profileDrafts[profile.id];
    if (!draft) return;
    const fullName = `${draft.firstName.trim()} ${draft.lastName.trim()}`.trim();
    if (fullName.length < 3) {
      setActionMessage('Le prénom et le nom doivent être renseignés correctement.');
      return;
    }
    try {
      await onUpdateProfile({
        ...profile,
        name: fullName,
        phone: draft.phone.trim(),
        email: draft.email.trim().toLowerCase(),
        department: draft.department.trim(),
        building: draft.building.trim(),
        floor: draft.floor.trim(),
        room: draft.room.trim(),
        employmentType: draft.employmentType.trim(),
        contractEndDate: draft.contractEndDate,
      });
      setEditingProfileId(null);
      setActionMessage(`Profil de ${fullName} complété et enregistré.`);
    } catch (error) {
      setActionMessage(`Échec enregistrement profil: ${error instanceof Error ? error.message : 'Firebase a refusé la modification.'}`);
    }
  };

  const showPending = () => {
    resetNarrowFilters();
    setStatusFilter('Attente validation');
  };

  const showToday = () => {
    resetNarrowFilters();
    setStatusFilter('Nouvelles inscriptions du jour');
  };

  const showMissingEmploymentType = () => {
    setQuery('');
    setService('Tous les services');
    setEmploymentType(MISSING_EMPLOYMENT_TYPE_FILTER);
    setStatusFilter('Tous les statuts');
  };

  const showMissingService = () => {
    setQuery('');
    setService(MISSING_SERVICE_FILTER);
    setEmploymentType('Tous les engagements');
    setStatusFilter('Tous les statuts');
  };

  const showBlockedBadges = () => {
    resetNarrowFilters();
    setStatusFilter('Bloqués');
  };

  const resetAll = () => {
    resetNarrowFilters();
    setStatusFilter('Tous les statuts');
  };

  const toggleEmploymentTypeLock = async () => {
    if (readOnly || !onSetEmploymentTypeLocked) return;
    const nextLocked = !employmentTypeLocked;
    setIsSavingEmploymentLock(true);
    setActionMessage('');
    try {
      await onSetEmploymentTypeLocked(nextLocked);
      setActionMessage(
        nextLocked
          ? "Type d'engagement verrouillé : seul le DRH peut le modifier."
          : "Type d'engagement déverrouillé : le personnel peut le corriger depuis son profil."
      );
    } catch (error) {
      setActionMessage(`Modification du verrou impossible: ${error instanceof Error ? error.message : 'Firebase a refusé la modification.'}`);
    } finally {
      setIsSavingEmploymentLock(false);
    }
  };

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-black text-slate-950">
              <Users className="h-5 w-5 text-blue-600" /> Gestion DRH du personnel inscrit
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              {employees.length} agent(s) inscrit(s), {filtered.length} affiché(s). Les nouveaux comptes restent inactifs jusqu'à validation DRH.
            </p>
          </div>
          <button type="button" onClick={exportExcel} className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-xs font-black text-white">
            <Download className="h-4 w-4" /> Export Excel
          </button>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <button type="button" onClick={showPending} className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-left text-xs font-black text-amber-800">
            Attente validation: {pendingCount}
          </button>
          <button type="button" onClick={showToday} className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-3 text-left text-xs font-black text-blue-800">
            Nouvelles du jour: {todayCount}
          </button>
          <button type="button" onClick={showBlockedBadges} className="rounded-xl border border-red-200 bg-red-50 px-3 py-3 text-left text-xs font-black text-red-800">
            Badges bloqués: {blockedCount}
          </button>
          <button type="button" onClick={showMissingService} className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-3 text-left text-xs font-black text-rose-800">
            Service non renseigné: {missingServiceCount}
          </button>
          <button type="button" onClick={showMissingEmploymentType} className="rounded-xl border border-purple-200 bg-purple-50 px-3 py-3 text-left text-xs font-black text-purple-800">
            Engagement non renseigné: {missingEmploymentTypeCount}
          </button>
          <button type="button" onClick={resetAll} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-left text-xs font-black text-slate-700">
            Réinitialiser les filtres
          </button>
        </div>

        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-black text-slate-950">Modification du type d'engagement par le personnel</p>
              <p className="mt-1 text-xs font-semibold text-slate-500">
                {employmentTypeLocked
                  ? "Actuellement verrouillé : seul le DRH peut corriger le type d'engagement."
                  : "Actuellement déverrouillé : les agents peuvent corriger leur type d'engagement depuis leur profil."}
              </p>
            </div>
            <button
              type="button"
              onClick={toggleEmploymentTypeLock}
              disabled={readOnly || isSavingEmploymentLock || !onSetEmploymentTypeLocked}
              className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-xs font-black text-white disabled:opacity-50 ${
                employmentTypeLocked ? 'bg-blue-700 hover:bg-blue-800' : 'bg-slate-800 hover:bg-slate-900'
              }`}
            >
              {employmentTypeLocked ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
              {isSavingEmploymentLock
                ? 'Enregistrement...'
                : employmentTypeLocked
                  ? 'Déverrouiller'
                  : 'Verrouiller'}
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 xl:grid-cols-[1fr_220px_220px_240px]">
          <label className="relative">
            <Search className="absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
            <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Téléphone, email, nom, fonction ou service" className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-3 text-sm" />
          </label>
          <select value={service} onChange={event => setService(event.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-bold">
            <option>Tous les services</option>
            <option>{MISSING_SERVICE_FILTER}</option>
            {services.map(item => <option key={item}>{item}</option>)}
          </select>
          <select value={employmentType} onChange={event => setEmploymentType(event.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-bold">
            <option>Tous les engagements</option>
            <option>{MISSING_EMPLOYMENT_TYPE_FILTER}</option>
            {employmentTypes.map(item => <option key={item}>{item}</option>)}
          </select>
          <select value={statusFilter} onChange={event => setStatusFilter(event.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-bold">
            <option>Tous les statuts</option>
            <option>Attente validation</option>
            <option>Nouvelles inscriptions du jour</option>
            <option>Bloqués</option>
            <option>À vérifier</option>
          </select>
        </div>
        {actionMessage && <p className="mt-3 rounded-xl bg-blue-50 px-3 py-2 text-xs font-bold text-blue-800">{actionMessage}</p>}
      </section>

      <section className="grid gap-3">
        {filtered.map(profile => {
          const blocked = isBlockedByHr(profile);
          const pending = isPendingValidation(profile);
          const isEditing = editingProfileId === profile.id;
          const draft = profileDrafts[profile.id];
          return (
            <article key={profile.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr_1fr_auto] lg:items-center">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-black text-slate-950">{profile.name}</h3>
                    <span className={`rounded-full px-2 py-1 text-[10px] font-black ${getStatusClass(profile)}`}>
                      {getStatusLabel(profile)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{profile.email}</p>
                  <p className={`mt-1 text-[11px] font-bold ${profile.validatedByName ? 'text-blue-700' : 'text-amber-700'}`}>
                    Validation DRH: {profile.validatedByName
                      ? `validee par ${profile.validatedByName}${profile.validatedAt ? ` le ${new Date(profile.validatedAt).toLocaleDateString('fr-FR')}` : ''}`
                      : 'non encore tracee'}
                  </p>
                  {profile.validatedByName && (
                    <p className="mt-1 text-[11px] font-bold text-blue-700">
                      Validé par {profile.validatedByName}
                      {profile.validatedAt ? ` le ${new Date(profile.validatedAt).toLocaleDateString('fr-FR')}` : ''}
                    </p>
                  )}
                  <p className="mt-1 text-xs font-bold text-slate-700">{profile.phone || 'Téléphone non renseigné'} · {profile.badgeNumber}</p>
                </div>

                <div className="text-xs text-slate-600">
                  <p><span className="font-black text-slate-800">Service:</span> {profile.department || '-'}</p>
                  <p><span className="font-black text-slate-800">Fonction:</span> {profile.room || '-'}</p>
                  <p><span className="font-black text-slate-800">Solde:</span> <span className="font-black text-blue-700">{Math.max(0, profile.walletBalance || 0).toLocaleString('fr-FR')} F</span></p>
                  <p>
                    <span className="font-black text-slate-800">Subvention:</span>{' '}
                    <span className={profile.subsidyExcluded ? 'font-black text-red-700' : 'font-black text-blue-700'}>
                      {profile.subsidyExcluded ? 'Non' : 'Oui'}
                    </span>
                  </p>
                </div>

                <div className="grid gap-2 text-xs">
                  {readOnly ? (
                    <>
                      <p><span className="font-black">Service:</span> {profile.department || '-'}</p>
                      <p><span className="font-black">Engagement:</span> {profile.employmentType || 'Non renseigné'}</p>
                      <p><span className="font-black">Fin contrat:</span> {profile.contractEndDate || '-'}</p>
                    </>
                  ) : (
                    <>
                      <select value={profile.department || ''} onChange={event => changeService(profile, event.target.value)} className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-2 text-xs font-bold text-slate-800">
                        <option value="">Service non renseigné</option>
                        {services.map(item => <option key={item} value={item}>{item}</option>)}
                      </select>
                      <select value={profile.employmentType || ''} onChange={event => changeEmploymentType(profile, event.target.value)} className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-2 text-xs font-bold text-slate-800">
                        <option value="">Non renseigné</option>
                        {employmentTypes.map(item => <option key={item} value={item}>{item}</option>)}
                      </select>
                      <div className="grid grid-cols-[1fr_auto] gap-2">
                        <input type="date" value={profile.contractEndDate || ''} onChange={event => changeContractEndDate(profile, event.target.value)} className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-2 text-xs font-bold text-slate-800" />
                        <button
                          type="button"
                          onClick={() => changeContractEndDate(profile, '')}
                          disabled={!profile.contractEndDate}
                          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 disabled:opacity-40"
                        >
                          Effacer
                        </button>
                      </div>
                      <label className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-2 py-2 text-xs font-bold text-slate-800">
                        <span>Bénéficie subvention</span>
                        <input
                          type="checkbox"
                          checked={!profile.subsidyExcluded}
                          onChange={event => changeSubsidyAccess(profile, event.target.checked)}
                          className="h-4 w-4 accent-blue-600"
                        />
                      </label>
                    </>
                  )}
                </div>

                {!readOnly && (
                  <div className="flex flex-wrap gap-2 lg:justify-end">
                    {pending && <button type="button" onClick={() => validateProfile(profile)} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-black text-white">Valider DRH</button>}
                    <button type="button" onClick={() => isEditing ? setEditingProfileId(null) : openProfileEditor(profile)} className="flex items-center gap-1 rounded-lg bg-blue-50 px-3 py-2 text-xs font-black text-blue-700">
                      <Edit3 className="h-3.5 w-3.5" />
                      {isEditing ? 'Fermer fiche' : 'Compléter profil'}
                    </button>
                    <button type="button" onClick={() => toggleBlock(profile)} className={`flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-black ${blocked ? 'bg-slate-900 text-white' : 'bg-amber-50 text-amber-700'}`}>
                      {blocked ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
                      {blocked ? 'Débloquer' : 'Bloquer'}
                    </button>
                    <button type="button" onClick={async () => {
                      if (!window.confirm(`Retirer ${profile.name} de la liste de la plateforme ? Pour empêcher son accès, utilisez d'abord Bloquer.`)) return;
                      await onDeleteProfile(profile);
                      setActionMessage(`${profile.name} a été retiré de la liste de la plateforme.`);
                    }} className="flex items-center gap-1 rounded-lg bg-red-50 px-3 py-2 text-xs font-black text-red-700">
                      <Trash2 className="h-3.5 w-3.5" /> Retirer
                    </button>
                  </div>
                )}
              </div>
              {!readOnly && isEditing && draft && (
                <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50/70 p-4">
                  <div className="mb-3">
                    <h4 className="text-sm font-black text-blue-950">Compléter / corriger le profil agent</h4>
                    <p className="text-xs font-medium text-blue-800">Corriger l'identité réelle, le téléphone, la fonction, le service et les informations manquantes.</p>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <label className="text-xs font-black text-slate-700">
                      Prénom
                      <input value={draft.firstName} onChange={event => updateDraft(profile.id, 'firstName', event.target.value)} className="mt-1 w-full rounded-xl border border-blue-200 bg-white px-3 py-2 text-sm font-bold text-slate-900" />
                    </label>
                    <label className="text-xs font-black text-slate-700">
                      Nom
                      <input value={draft.lastName} onChange={event => updateDraft(profile.id, 'lastName', event.target.value)} className="mt-1 w-full rounded-xl border border-blue-200 bg-white px-3 py-2 text-sm font-bold text-slate-900" />
                    </label>
                    <label className="text-xs font-black text-slate-700">
                      Téléphone
                      <input value={draft.phone} onChange={event => updateDraft(profile.id, 'phone', event.target.value)} className="mt-1 w-full rounded-xl border border-blue-200 bg-white px-3 py-2 text-sm font-bold text-slate-900" />
                    </label>
                    <label className="text-xs font-black text-slate-700">
                      Adresse e-mail
                      <input value={draft.email} onChange={event => updateDraft(profile.id, 'email', event.target.value)} className="mt-1 w-full rounded-xl border border-blue-200 bg-white px-3 py-2 text-sm font-bold text-slate-900" />
                    </label>
                    <label className="text-xs font-black text-slate-700">
                      Service
                      <select value={draft.department} onChange={event => updateDraft(profile.id, 'department', event.target.value)} className="mt-1 w-full rounded-xl border border-blue-200 bg-white px-3 py-2 text-sm font-bold text-slate-900">
                        <option value="">Service non renseigné</option>
                        {services.map(item => <option key={item} value={item}>{item}</option>)}
                      </select>
                    </label>
                    <label className="text-xs font-black text-slate-700">
                      Fonction
                      <input value={draft.room} onChange={event => updateDraft(profile.id, 'room', event.target.value)} className="mt-1 w-full rounded-xl border border-blue-200 bg-white px-3 py-2 text-sm font-bold text-slate-900" />
                    </label>
                    <label className="text-xs font-black text-slate-700">
                      Bâtiment
                      <input value={draft.building} onChange={event => updateDraft(profile.id, 'building', event.target.value)} className="mt-1 w-full rounded-xl border border-blue-200 bg-white px-3 py-2 text-sm font-bold text-slate-900" />
                    </label>
                    <label className="text-xs font-black text-slate-700">
                      Étage
                      <input value={draft.floor} onChange={event => updateDraft(profile.id, 'floor', event.target.value)} className="mt-1 w-full rounded-xl border border-blue-200 bg-white px-3 py-2 text-sm font-bold text-slate-900" />
                    </label>
                    <label className="text-xs font-black text-slate-700">
                      Type d'engagement
                      <select value={draft.employmentType} onChange={event => updateDraft(profile.id, 'employmentType', event.target.value)} className="mt-1 w-full rounded-xl border border-blue-200 bg-white px-3 py-2 text-sm font-bold text-slate-900">
                        <option value="">Non renseigné</option>
                        {employmentTypes.map(item => <option key={item} value={item}>{item}</option>)}
                      </select>
                    </label>
                    <label className="text-xs font-black text-slate-700">
                      Fin contrat
                      <input type="date" value={draft.contractEndDate} onChange={event => updateDraft(profile.id, 'contractEndDate', event.target.value)} className="mt-1 w-full rounded-xl border border-blue-200 bg-white px-3 py-2 text-sm font-bold text-slate-900" />
                    </label>
                  </div>
                  <button type="button" onClick={() => saveProfileDraft(profile)} className="mt-4 flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-xs font-black text-white">
                    <Save className="h-4 w-4" /> Enregistrer le profil complet
                  </button>
                </div>
              )}
            </article>
          );
        })}
        {filtered.length === 0 && <p className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-400">Aucun agent trouvé.</p>}
      </section>
    </div>
  );
};





