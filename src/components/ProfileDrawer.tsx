import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CheckCircle, KeyRound, User, X } from 'lucide-react';
import { UserProfile } from '../types';

interface ProfileDrawerProps {
  isOpen: boolean;
  profile: UserProfile;
  services: string[];
  buildings: string[];
  floors: string[];
  functions: string[];
  employmentTypes: string[];
  employmentTypeLocked: boolean;
  onClose: () => void;
  onUpdateProfile: (profile: UserProfile) => Promise<void> | void;
  onChangePassword: (password: string) => Promise<void> | void;
}

export const ProfileDrawer: React.FC<ProfileDrawerProps> = ({
  isOpen,
  profile,
  services,
  buildings,
  floors,
  functions,
  employmentTypes,
  employmentTypeLocked,
  onClose,
  onUpdateProfile,
  onChangePassword,
}) => {
  const safeEmploymentTypes = useMemo(
    () => employmentTypes?.length ? employmentTypes : ['Titulaire', 'Contractuel', 'Stagiaire'],
    [employmentTypes]
  );
  const [draft, setDraft] = useState(profile);
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [message, setMessage] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  useEffect(() => setDraft({
    ...profile,
    name: profile.name || '',
    email: profile.email || '',
    phone: profile.phone || '',
    department: profile.department || '',
    building: profile.building || '',
    floor: profile.floor || '',
    room: profile.room || '',
    employmentType: profile.employmentType || safeEmploymentTypes[0] || '',
  }), [profile, safeEmploymentTypes]);

  const saveProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSavingProfile(true);
    setMessage('');
    try {
      await onUpdateProfile({
        ...profile,
        photoUrl: draft.photoUrl || '',
        whatsappOptIn: Boolean(draft.whatsappOptIn),
        employmentType: employmentTypeLocked ? profile.employmentType : (draft.employmentType || ''),
      });
      setMessage('Modification enregistrée avec succès.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Modification impossible.');
    } finally {
      setIsSavingProfile(false);
    }
  };

  const savePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    if (password.length < 6) {
      setMessage('Le mot de passe doit contenir au moins 6 caract?res.');
      return;
    }
    if (password !== passwordConfirmation) {
      setMessage('Les deux mots de passe ne correspondent pas.');
      return;
    }
    try {
      await onChangePassword(password);
      setPassword('');
      setPasswordConfirmation('');
      setMessage('Mot de passe modifi? avec succ?s.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Modification impossible. Reconnectez-vous puis r?essayez.');
    }
  };

  const selectPhoto = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setMessage('Choisissez une image valide.');
      return;
    }
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      const size = 320;
      canvas.width = size;
      canvas.height = size;
      const context = canvas.getContext('2d');
      if (!context) return;
      const scale = Math.max(size / image.width, size / image.height);
      const width = image.width * scale;
      const height = image.height * scale;
      context.drawImage(image, (size - width) / 2, (size - height) / 2, width, height);
      setDraft(current => ({ ...current, photoUrl: canvas.toDataURL('image/jpeg', 0.72) }));
      setMessage('Photo prête. Cliquez sur Enregistrer mes informations.');
      URL.revokeObjectURL(image.src);
    };
    image.src = URL.createObjectURL(file);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
          <motion.aside
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed right-0 top-0 bottom-0 z-50 flex h-full w-full max-w-md flex-col border-l border-blue-100 bg-white shadow-2xl"
          >
            <header className="flex items-center justify-between border-b border-blue-100 bg-blue-50 p-4">
              <div className="flex items-center gap-3">
                {profile.photoUrl ? (
                  <img src={profile.photoUrl} alt="Profil" className="h-11 w-11 rounded-xl border border-blue-200 object-cover" />
                ) : (
                  <div className="rounded-xl bg-blue-600 p-2 text-white"><User className="h-5 w-5" /></div>
                )}
                <div>
                  <h3 className="font-black text-blue-950">Mon profil</h3>
                  <p className="text-xs text-blue-700">{profile.badgeNumber}</p>
                </div>
              </div>
              <button type="button" onClick={onClose} className="rounded-full p-2 text-blue-800 hover:bg-blue-100"><X className="h-5 w-5" /></button>
            </header>

            <div className="flex-1 space-y-6 overflow-y-auto p-5">
              {message && (
                <div className="flex items-center gap-2 rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs font-bold text-blue-800">
                  <CheckCircle className="h-4 w-4" /> {message}
                </div>
              )}

              <form onSubmit={saveProfile} className="space-y-3">
                <h4 className="font-black text-slate-950">Informations personnelles</h4>
                <div className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  {draft.photoUrl ? (
                    <img src={draft.photoUrl} alt="Aperçu profil" className="h-20 w-20 rounded-2xl border border-white object-cover shadow-sm" />
                  ) : (
                    <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-slate-200 text-slate-500"><User className="h-8 w-8" /></div>
                  )}
                  <div className="flex-1 space-y-2">
                    <label className="block cursor-pointer rounded-xl bg-slate-900 px-3 py-2 text-center text-xs font-black text-white">
                      Ajouter ou changer ma photo
                      <input type="file" accept="image/*" onChange={selectPhoto} className="hidden" />
                    </label>
                    {draft.photoUrl && (
                      <button type="button" onClick={() => setDraft({ ...draft, photoUrl: '' })} className="w-full rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs font-black text-red-700">
                        Supprimer la photo
                      </button>
                    )}
                  </div>
                </div>
                <input value={draft.name || ''} onChange={e => setDraft({ ...draft, name: e.target.value })} placeholder="Nom et prénom" className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm" />
                <input type="email" value={draft.email || ''} onChange={e => setDraft({ ...draft, email: e.target.value })} placeholder="Adresse e-mail" className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm" />
                <input value={draft.phone || ''} onChange={e => setDraft({ ...draft, phone: e.target.value })} placeholder="Téléphone" className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm" />
                <label className="flex items-center justify-between gap-3 rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs font-bold text-blue-950">
                  <span>
                    <span className="block">Recevoir les notifications sur WhatsApp</span>
                    <span className="mt-1 block text-[10px] font-medium text-blue-700">Votre numéro de téléphone sera utilisé uniquement pour les alertes du service restauration.</span>
                  </span>
                  <input type="checkbox" checked={Boolean(draft.whatsappOptIn)} onChange={e => setDraft({ ...draft, whatsappOptIn: e.target.checked })} className="h-5 w-5 accent-blue-600" />
                </label>
                <select value={draft.department} onChange={e => setDraft({ ...draft, department: e.target.value })} className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
                  <option value="">Choisir le service</option>
                  {services.map(item => <option key={item} value={item}>{item}</option>)}
                </select>
                <select value={draft.room} onChange={e => setDraft({ ...draft, room: e.target.value })} className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
                  <option value="">Choisir la fonction</option>
                  {functions.map(item => <option key={item} value={item}>{item}</option>)}
                </select>
                {employmentTypeLocked ? (
                  <div>
                    <select value={profile.employmentType || ''} disabled className="w-full cursor-not-allowed rounded-xl border border-slate-200 bg-slate-100 p-3 text-sm font-bold text-slate-500">
                      <option value="">Type d'engagement non renseigné</option>
                      {safeEmploymentTypes.map(item => <option key={item} value={item}>{item}</option>)}
                    </select>
                    <p className="mt-1 text-[10px] font-bold text-slate-500">Champ verrouillé : seul le DRH peut modifier le type d'engagement.</p>
                  </div>
                ) : (
                  <div>
                    <select value={draft.employmentType || ''} onChange={e => setDraft({ ...draft, employmentType: e.target.value })} className="w-full rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm font-bold text-blue-950">
                      <option value="">Choisir le type d'engagement</option>
                      {safeEmploymentTypes.map(item => <option key={item} value={item}>{item}</option>)}
                    </select>
                    <p className="mt-1 text-[10px] font-bold text-blue-700">Déverrouillé par l'administration : vous pouvez corriger votre type d'engagement.</p>
                  </div>
                )}
                <select value={draft.building} onChange={e => setDraft({ ...draft, building: e.target.value })} className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
                  {buildings.map(item => <option key={item} value={item}>{item}</option>)}
                </select>
                <select value={draft.floor} onChange={e => setDraft({ ...draft, floor: e.target.value })} className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
                  {floors.map(item => <option key={item} value={item}>{item}</option>)}
                </select>
                <button type="submit" disabled={isSavingProfile} className="w-full rounded-xl bg-blue-600 p-3 text-sm font-black text-white hover:bg-blue-700 disabled:opacity-60">
                  {isSavingProfile ? 'Enregistrement en cours...' : 'Enregistrer les modifications'}
                </button>
              </form>

              <form onSubmit={savePassword} className="space-y-3 rounded-2xl border border-blue-100 bg-blue-50 p-4">
                <div className="flex items-center gap-2"><KeyRound className="h-5 w-5 text-blue-700" /><h4 className="font-black text-blue-950">Changer mon mot de passe</h4></div>
                <input type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Nouveau mot de passe" className="w-full rounded-xl border border-blue-100 bg-white p-3 text-sm" />
                <input type="password" autoComplete="new-password" value={passwordConfirmation} onChange={e => setPasswordConfirmation(e.target.value)} placeholder="Confirmer le mot de passe" className="w-full rounded-xl border border-blue-100 bg-white p-3 text-sm" />
                <button type="submit" className="w-full rounded-xl bg-blue-600 p-3 text-sm font-black text-white hover:bg-blue-700">Modifier mon mot de passe</button>
              </form>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
};

