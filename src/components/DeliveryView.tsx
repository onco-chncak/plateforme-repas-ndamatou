import React, { useEffect, useRef, useState } from 'react';
import {
  Building2,
  Camera,
  CheckCircle,
  ClipboardList,
  Compass,
  Navigation,
  Phone,
  Printer,
  QrCode,
  RotateCcw,
  Truck,
  User,
  X
} from 'lucide-react';
import { getLocalDateKey, getMealVisual } from '../lib/business';
import { Order, OrderStatus, UserProfile } from '../types';
import jsQR from '../vendor/jsQR.mjs';

const getDailyRestaurantCode = (date: Date) => {
  const dayKey = getLocalDateKey(date).replace(/-/g, '');
  const checksum = [...dayKey].reduce((sum, char, index) => sum + Number(char) * (index + 3), 17);
  return `R${dayKey.slice(4)}${checksum.toString(36).toUpperCase().padStart(2, '0')}`;
};

const isPersonnelProfile = (profile: UserProfile) =>
  profile.role === 'employee' ||
  (!profile.role && Boolean(profile.badgeNumber || profile.phone)) ||
  (
    Boolean(profile.badgeNumber || profile.phone) &&
    !['admin', 'restaurant_admin', 'accountant', 'delivery', 'operator'].includes(String(profile.role || ''))
  );

interface DeliveryViewProps {
  orders: Order[];
  profiles: UserProfile[];
  onUpdateOrderStatus: (orderId: string, status: OrderStatus) => Promise<boolean> | boolean;
  onChangeOrderToDelivery?: (orderId: string, authorization: { issuerId: string; issuerName: string; issuerService: string }) => Promise<boolean> | boolean;
  activeProfile: { name: string; badgeNumber: string };
  deliveryAuthorizationMode?: 'codes' | 'selection';
  canPrintThermalLabels?: boolean;
  deliveryLabelWidthMm?: number;
  deliveryLabelHeightMm?: number;
}

export const DeliveryView: React.FC<DeliveryViewProps> = ({
  orders,
  profiles,
  onUpdateOrderStatus,
  onChangeOrderToDelivery,
  activeProfile,
  deliveryAuthorizationMode = 'codes',
  canPrintThermalLabels = false,
  deliveryLabelWidthMm = 100,
  deliveryLabelHeightMm = 70
}) => {
  const [activeDeliveryTab, setActiveDeliveryTab] = useState<'routes' | 'authorized'>('routes');
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scannerMessage, setScannerMessage] = useState('');
  const [manualBadge, setManualBadge] = useState('');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scannerControlsRef = useRef<{ stop: () => void } | null>(null);
  const processedDeliveryIdsRef = useRef<Set<string>>(new Set());
  const todayDateKey = getLocalDateKey();
  const dailyQrPayload = getDailyRestaurantCode(new Date());
  const dailyQrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(dailyQrPayload)}`;
  const profileRequiresDelivery = (order: Order) => {
    const profile = profiles.find(item => item.id === order.employeeId || item.badgeNumber === order.badgeNumber);
    if (!profile) return false;
    const preAuthorizationActive = Boolean(profile.deliveryPreAuthorizedById) && (
      profile.deliveryPreAuthorizedScope === 'permanent' ||
      new Date(profile.deliveryPreAuthorizedUntil || 0).getTime() > Date.now()
    );
    return Boolean(profile.deliveryAllowed || preAuthorizationActive);
  };

  const deliveryPendingOrders = orders.filter(
    (order) => ['pending', 'preparing', 'delivering'].includes(order.status) &&
      (order.fulfillmentMode === 'delivery' || profileRequiresDelivery(order)) &&
      !processedDeliveryIdsRef.current.has(order.id)
  );

  const completedDeliveryOrders = orders.filter(
    (order) => ['delivered', 'returned'].includes(order.status) && (order.fulfillmentMode === 'delivery' || profileRequiresDelivery(order)) && getLocalDateKey(order.deliveryTime || order.createdAt) === todayDateKey
  );
  const authorizedProfiles = profiles.filter(profile => {
    if (!isPersonnelProfile(profile)) return false;
    const preAuthorizationActive = Boolean(profile.deliveryPreAuthorizedById) && (
      profile.deliveryPreAuthorizedScope === 'permanent' ||
      new Date(profile.deliveryPreAuthorizedUntil || 0).getTime() > Date.now()
    );
    return Boolean(profile.deliveryAllowed || preAuthorizationActive);
  });
  const deliveryDailyCapacity = profiles
    .filter(profile => isPersonnelProfile(profile) && profile.deliveryCodeViewer)
    .reduce((sum, profile) => sum + Math.max(1, profile.deliverySelectionDailyLimit || 1), 0);
  const todayDeliverySelections = new Set(
    orders
      .filter(order => order.deliveryAuthorizedById && getLocalDateKey(order.deliveryAuthorizationUsedAt || new Date(0)) === todayDateKey)
      .map(order => order.employeeId)
  ).size;
  const pendingDeliveryGroups: Record<string, Order[]> = deliveryPendingOrders.reduce((groups: Record<string, Order[]>, order: Order) => {
      const service = order.department?.trim() || 'Service non renseigné';
      groups[service] = [...(groups[service] || []), order];
      return groups;
    }, {} as Record<string, Order[]>);
  const pendingDeliveriesByService = (Object.entries(pendingDeliveryGroups) as Array<[string, Order[]]>)
    .sort(([serviceA], [serviceB]) => serviceA.localeCompare(serviceB, 'fr'));
  const authorizedProfileGroups: Record<string, UserProfile[]> = authorizedProfiles.reduce((groups: Record<string, UserProfile[]>, profile: UserProfile) => {
      const service = profile.department?.trim() || 'Service non renseigné';
      groups[service] = [...(groups[service] || []), profile];
      return groups;
    }, {} as Record<string, UserProfile[]>);
  const authorizedProfilesByService = (Object.entries(authorizedProfileGroups) as Array<[string, UserProfile[]]>)
    .sort(([serviceA], [serviceB]) => serviceA.localeCompare(serviceB, 'fr'));

  const compactBadge = (value: string) => String(value || '')
    .toUpperCase()
    .replace(/[ÀÂ]/g, '0')
    .replace(/[ÉÊË]/g, '2')
    .replace(/È/g, '7')
    .replace(/Ç/g, '9')
    .replace(/[^A-Z0-9]/g, '');
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
  const compactPhone = (value: string) => getPhoneScanCandidates(value)[0] || '';
  const isSamePhone = (left: string, right: string) => {
    const leftCandidates = getPhoneScanCandidates(left);
    const b = compactPhone(right);
    return Boolean(b && leftCandidates.some(a => a === b || a.endsWith(b) || b.endsWith(a)));
  };

  const levenshteinDistance = (left: string, right: string) => {
    const a = compactBadge(left);
    const b = compactBadge(right);
    if (a === b) return 0;
    if (!a) return b.length;
    if (!b) return a.length;
    const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
    const current = Array.from({ length: b.length + 1 }, () => 0);
    for (let i = 1; i <= a.length; i += 1) {
      current[0] = i;
      for (let j = 1; j <= b.length; j += 1) {
        current[j] = Math.min(
          previous[j] + 1,
          current[j - 1] + 1,
          previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
        );
      }
      for (let j = 0; j <= b.length; j += 1) previous[j] = current[j];
    }
    return previous[b.length];
  };

  const findProfileFromScannedBadge = (candidate: string) => {
    const compact = compactBadge(candidate);
    const phoneMatch = profiles.find(profile => isSamePhone(candidate, profile.phone));
    if (phoneMatch) return phoneMatch;

    const exact = profiles.find(profile => compactBadge(profile.badgeNumber) === compact);
    if (exact) return exact;

    const tail8 = compact.slice(-8);
    const tail6 = compact.slice(-6);
    const tailMatches = profiles.filter(profile => {
      const profileCompact = compactBadge(profile.badgeNumber);
      return (tail8.length >= 8 && profileCompact.endsWith(tail8)) ||
        (tail6.length >= 6 && profileCompact.endsWith(tail6));
    });
    if (tailMatches.length === 1) return tailMatches[0];

    const fuzzyMatches = profiles
      .map(profile => {
        const profileCompact = compactBadge(profile.badgeNumber);
        const profileTail = profileCompact.slice(-8);
        const distance = Math.min(
          levenshteinDistance(compact, profileCompact),
          levenshteinDistance(tail8, profileTail)
        );
        return { profile, distance };
      })
      .filter(match => compact.length >= 8 && match.distance <= 2)
      .sort((a, b) => a.distance - b.distance);
    if (fuzzyMatches.length === 1) return fuzzyMatches[0].profile;
    if (fuzzyMatches.length > 1 && fuzzyMatches[0].distance < fuzzyMatches[1].distance) return fuzzyMatches[0].profile;
    return undefined;
  };

  const normalizeBadge = (raw: string) => {
    const rawValue = raw.trim();
    if (!rawValue) return '';

    const keyboardDigitMap: Record<string, string> = {
      '&': '1',
      'É': '2',
      'é': '2',
      '"': '3',
      "'": '4',
      '(': '5',
      '-': '6',
      'È': '7',
      'è': '7',
      '_': '8',
      'Ç': '9',
      'ç': '9',
      'À': '0',
      'à': '0',
    };
    const keyboardDecodedText = rawValue.split('').map(char => keyboardDigitMap[char] ?? char).join('');
    const text = rawValue
      .replace(/[“”«»„‟]/g, '"')
      .replace(/[‘’‚‛]/g, "'")
      .replace(/[^\x20-\x7EÀ-ÿ]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const candidates = [rawValue, keyboardDecodedText, text];
    const flattened = candidates.join(' ').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const embeddedKnownProfile = profiles.find(profile => flattened.includes(compactBadge(profile.badgeNumber)));
    if (embeddedKnownProfile) return embeddedKnownProfile.badgeNumber.toUpperCase();
    const embeddedPhoneProfile = profiles.find(profile => candidates.some(candidate => isSamePhone(candidate, profile.phone)));
    if (embeddedPhoneProfile) return embeddedPhoneProfile.badgeNumber.toUpperCase();

    for (const candidate of candidates) {
      const embeddedBadge = candidate.toUpperCase().match(/CH\D*\d{4}\D*[A-Z0-9]{3,20}/)?.[0];
      if (embeddedBadge) {
        const parts = embeddedBadge.match(/CH\D*(\d{4})\D*([A-Z0-9]{3,20})/i);
        if (parts) {
          const canonical = `CH-${parts[1]}-${parts[2]}`.toUpperCase();
          return findProfileFromScannedBadge(canonical)?.badgeNumber.toUpperCase() || canonical;
        }
      }
    }

    try {
      const parsed = JSON.parse(text);
      const badge = String(parsed.badge || parsed.badgeNumber || parsed.code || parsed.id || '').trim().toUpperCase();
      if (badge) return findProfileFromScannedBadge(badge)?.badgeNumber.toUpperCase() || badge;
    } catch {
      try {
        const parsedUrl = new URL(text);
        const badge = String(
          parsedUrl.searchParams.get('badge') ||
          parsedUrl.searchParams.get('badgeNumber') ||
          parsedUrl.searchParams.get('code') ||
          parsedUrl.searchParams.get('id') ||
          ''
        ).trim().toUpperCase();
        if (badge) return findProfileFromScannedBadge(badge)?.badgeNumber.toUpperCase() || badge;
      } catch {
        // Plain-text scanner payload.
      }
    }
    return findProfileFromScannedBadge(text)?.badgeNumber.toUpperCase() || text.toUpperCase().replace(/\s+/g, '');
  };

  const printDeliveryList = (mode: 'pending' | 'completed') => {
    const reportOrders = mode === 'pending' ? deliveryPendingOrders : completedDeliveryOrders;
    const title = mode === 'pending' ? 'Feuille de route des livraisons' : "Livraisons traitées aujourd'hui";
    const escapeHtml = (value: unknown) => String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
    const groupedOrders = reportOrders.reduce<Record<string, Order[]>>((groups, order) => {
      const service = order.department?.trim() || 'Service non renseigné';
      groups[service] = [...(groups[service] || []), order];
      return groups;
    }, {});
    const groupedSections = Object.entries(groupedOrders)
      .sort(([serviceA], [serviceB]) => serviceA.localeCompare(serviceB, 'fr'))
      .map(([service, serviceOrders]) => `
        <section class="service-section">
          <h2>${escapeHtml(service)} <span>${serviceOrders.length} commande(s)</span></h2>
          <table>
            <thead><tr><th>Personnel</th><th>Badge</th><th>Téléphone</th><th>Destination</th><th>Repas</th><th>État</th></tr></thead>
            <tbody>
              ${serviceOrders.map(order => `
                <tr>
                  <td>${escapeHtml(order.employeeName)}</td>
                  <td>${escapeHtml(order.badgeNumber)}</td>
                  <td>${escapeHtml(order.employeePhone || '-')}</td>
                  <td>${escapeHtml(order.department || service || 'Service non renseigné')}</td>
                  <td>${escapeHtml(order.items.map(item => `${item.quantity} x ${(item.meal?.name || 'Repas')}`).join(', '))}</td>
                  <td>${escapeHtml(order.status === 'delivered' ? 'Livrée' : order.status === 'returned' ? 'Retournée' : order.status === 'delivering' ? 'En acheminement' : 'À livrer')}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </section>
      `).join('');
    const printWindow = window.open('', '_blank', 'width=1100,height=800');
    if (!printWindow) {
      window.alert("Le navigateur a bloqué l'impression. Autorisez les fenêtres contextuelles puis réessayez.");
      return;
    }
    printWindow.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
      <style>
        body{font-family:Arial,sans-serif;color:#0f172a;padding:28px} h1{font-size:20px;margin:0} p{font-size:12px;color:#475569}
        h2{margin:22px 0 8px;padding:9px 12px;background:#1d4ed8;color:white;border-radius:8px;font-size:15px;text-transform:uppercase}
        h2 span{float:right;font-size:11px;opacity:.9;text-transform:none}
        table{width:100%;border-collapse:collapse;margin-top:8px;font-size:10px;page-break-inside:auto} th,td{border:1px solid #94a3b8;padding:7px;text-align:left;vertical-align:top}
        th{background:#dbeafe;font-weight:800}.header{border-bottom:3px solid #1d4ed8;padding-bottom:14px}.empty{text-align:center;padding:28px}
        .service-section{break-inside:avoid;page-break-inside:avoid}
      </style></head><body>
      <div class="header"><h1>Ndamatou - ${escapeHtml(title)}</h1><p>Date : ${new Date().toLocaleString('fr-SN')} | Livreur : ${escapeHtml(activeProfile.name)}</p></div>
      ${groupedSections || '<div class="empty">Aucune commande dans cette liste.</div>'}
      <script>window.onload=()=>window.print()</script></body></html>`);
    printWindow.document.close();
  };

  const printThermalDeliveryLabels = () => {
    const escapeHtml = (value: unknown) => String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
    const sortedOrders = deliveryPendingOrders.slice().sort((a, b) =>
      `${a.department}-${a.employeeName}`.localeCompare(`${b.department}-${b.employeeName}`, 'fr')
    );
    const labels = sortedOrders.flatMap(order =>
      order.items.flatMap(item =>
        Array.from({ length: Math.max(1, item.quantity) }, (_, portionIndex) => ({
          order,
          mealName: (item.meal?.name || 'Repas'),
          portionIndex: portionIndex + 1,
          portionTotal: Math.max(1, item.quantity),
        }))
      )
    );
    if (labels.length === 0) {
      window.alert("Aucune commande active à livrer. Le fichier d'étiquettes n'a pas été créé.");
      return;
    }
    const labelsHtml = labels.map(({ order, mealName, portionIndex, portionTotal }) => `
      <section class="label">
        <div class="service">${escapeHtml(order.department || 'Service non renseigné')}</div>
        <div class="person">${escapeHtml(order.employeeName)}</div>
        <div class="meal">${escapeHtml(mealName)}</div>
        <div class="destination">${escapeHtml(order.building)} · ${escapeHtml(order.floor)} · ${escapeHtml(order.room)}</div>
        <table class="meta"><tr><td>Badge</td><td>${escapeHtml(order.badgeNumber)}</td></tr>
          <tr><td>Commande</td><td>${escapeHtml(order.id)}</td></tr>
          <tr><td>Barquette</td><td>${portionIndex} / ${portionTotal}</td></tr></table>
        ${order.notes ? `<div class="notes">Note : ${escapeHtml(order.notes)}</div>` : ''}
        <div class="footer">Préparée le ${new Date().toLocaleDateString('fr-FR')} · Ndamatou</div>
      </section>
    `).join('');
    const printWindow = window.open('', '_blank', 'width=700,height=800');
    if (!printWindow) {
      window.alert("Le navigateur a bloqué l'impression. Autorisez les fenêtres contextuelles puis réessayez.");
      return;
    }
    printWindow.document.write(`<!doctype html><html>
      <head><meta charset="utf-8"><title>Étiquettes thermiques livraison Ndamatou</title>
      <style>
        @page{size:${deliveryLabelWidthMm}mm ${deliveryLabelHeightMm}mm;margin:3mm}
        *{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#000;margin:0}
        .label{width:${Math.max(34, deliveryLabelWidthMm - 6)}mm;height:${Math.max(24, deliveryLabelHeightMm - 6)}mm;overflow:hidden;border:1.2px solid #000;padding:3mm;page-break-after:always}
        .label:last-child{page-break-after:auto}.service{font-size:12pt;font-weight:900;text-transform:uppercase;border-bottom:2px solid #000;padding-bottom:2mm}
        .person{font-size:16pt;font-weight:900;margin-top:2.5mm}.meal{font-size:14pt;font-weight:900;margin-top:2mm}
        .destination{font-size:9pt;margin-top:1.5mm}.meta{width:100%;border-collapse:collapse;margin-top:2mm;font-size:8pt}
        .meta td{border:1px solid #000;padding:1mm}.meta td:first-child{font-weight:900;width:27%}
        .notes{margin-top:1.5mm;border:1px solid #000;padding:1mm;font-size:8pt;font-weight:900}.footer{font-size:7pt;margin-top:1.5mm}
      </style></head><body>${labelsHtml}<script>window.onload=()=>window.print()</script></body></html>`);
    printWindow.document.close();
  };

  const markOrderReturned = async (order: Order) => {
    const confirmed = window.confirm(
      `Signaler la commande de ${order.employeeName} comme retournée au restaurant ?\n\nCette action indique que le bénéficiaire était absent et clôture la livraison.`
    );
    if (!confirmed) return;
    await onUpdateOrderStatus(order.id, 'returned');
  };

  const stopScanner = () => {
    scannerControlsRef.current?.stop();
    scannerControlsRef.current = null;
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  const validateDeliveryBadge = async (raw: string) => {
    const badge = normalizeBadge(raw);
    const profile = findProfileFromScannedBadge(badge) || profiles.find(item => item.badgeNumber.toUpperCase() === badge || isSamePhone(badge, item.phone));
    const matchingOrders = profile
      ? deliveryPendingOrders.filter(order =>
          order.employeeId === profile.id ||
          order.badgeNumber.toUpperCase() === profile.badgeNumber.toUpperCase() ||
          isSamePhone(order.employeePhone, profile.phone)
        )
      : [];
    if (!profile) {
      setScannerMessage(`Badge non reconnu : ${badge || 'code vide'}.`);
      return;
    }
    if (matchingOrders.length === 0) {
      setScannerMessage(`${profile.name} n'a aucune commande de livraison active aujourd'hui.`);
      return;
    }
    const results = await Promise.all(matchingOrders.map(async order => {
      if ((order.fulfillmentMode || 'pickup') !== 'delivery' && onChangeOrderToDelivery) {
        const converted = await onChangeOrderToDelivery(order.id, {
          issuerId: 'restaurant',
          issuerName: activeProfile.name || 'Restaurant Ndamatou',
          issuerService: profile.department,
        });
        if (converted === false) return false;
      }
      return onUpdateOrderStatus(order.id, 'delivered');
    }));
    const confirmedOrders = matchingOrders.filter((_, index) => results[index] !== false);
    confirmedOrders.forEach(order => processedDeliveryIdsRef.current.add(order.id));
    if (confirmedOrders.length === 0) {
      setScannerMessage(`Firebase a refusé la validation pour ${profile.name}. La commande reste en cours d'acheminement.`);
      return;
    }
    setScannerMessage(`Livraison confirmée pour ${profile.name}. ${confirmedOrders.length} commande(s) remise(s).`);
    setManualBadge('');
    stopScanner();
  };

  useEffect(() => {
    if (!isScannerOpen) {
      stopScanner();
      return;
    }
    let cancelled = false;
    let timeoutId = 0;
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { willReadFrequently: true });
    const scanFrame = () => {
      const video = videoRef.current;
      if (cancelled || !video || !context || video.readyState < HTMLMediaElement.HAVE_ENOUGH_DATA) {
        timeoutId = window.setTimeout(scanFrame, 250);
        return;
      }
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      context.drawImage(video, 0, 0);
      const image = context.getImageData(0, 0, canvas.width, canvas.height);
      const result = jsQR(image.data, canvas.width, canvas.height, { inversionAttempts: 'attemptBoth' });
      if (result?.data) validateDeliveryBadge(result.data);
      else timeoutId = window.setTimeout(scanFrame, 250);
    };
    const start = async () => {
      try {
        const { BrowserQRCodeReader } = await import('../vendor/zxing-browser.mjs') as any;
        const reader = new BrowserQRCodeReader();
        const controls = await reader.decodeFromVideoDevice(undefined, videoRef.current!, (result: any) => {
          const text = result?.getText?.();
          if (text) validateDeliveryBadge(text);
        });
        scannerControlsRef.current = controls;
        setScannerMessage('Caméra active. Présentez le QR du badge du bénéficiaire.');
        scanFrame();
      } catch {
        setScannerMessage("Accès caméra impossible. Autorisez la caméra ou saisissez le numéro du badge.");
      }
    };
    start();
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
      stopScanner();
    };
  }, [isScannerOpen]);

  return (
    <div className="space-y-6">
      <div id="delivery-welcome-banner" className="bg-gradient-to-r from-blue-700 to-indigo-800 text-white rounded-3xl p-6 shadow-md border border-blue-500/10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center backdrop-blur-md">
            <Truck className="w-8 h-8 text-white" />
          </div>
          <div>
            <span className="text-blue-200 text-xs font-mono tracking-wider block">LIVREUR INTERNE HOSPITALIER</span>
            <h2 className="text-xl font-bold font-sans">Espace coursier : {activeProfile.name}</h2>
            <p className="text-xs text-blue-100 flex items-center gap-1 mt-1 font-sans">
              <Compass className="w-3.5 h-3.5" />
              Zone départ : cellule cuisine centrale Ndamatou
            </p>
          </div>
        </div>

        <div className="bg-white/10 p-3 rounded-2xl backdrop-blur-md border border-white/10 flex items-center gap-3">
          <div className="p-2 bg-blue-500 rounded-xl">
            <ClipboardList className="w-5 h-5 text-white" />
          </div>
          <div>
            <span className="text-[10px] text-blue-100 block font-sans">Courses du moment</span>
            <span className="font-mono text-lg font-extrabold tracking-tight">
              {deliveryPendingOrders.length} à assurer
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-indigo-200 bg-white p-4 shadow-sm">
          <p className="text-[10px] font-black uppercase text-indigo-700">Capacité maximale de livraison / jour</p>
          <p className="mt-1 text-3xl font-black text-indigo-950">{deliveryDailyCapacity}</p>
          <p className="mt-2 border-t border-indigo-100 pt-2 text-[10px] font-bold text-indigo-700">Somme fixe des quotas quotidiens définis par l'administrateur pour les responsables habilités.</p>
        </div>
        <div className="rounded-2xl border border-blue-200 bg-white p-4 shadow-sm">
          <p className="text-[10px] font-black uppercase text-blue-700">Agents sélectionnés aujourd'hui</p>
          <p className="mt-1 text-3xl font-black text-blue-950">{todayDeliverySelections}</p>
          <p className="mt-2 border-t border-blue-100 pt-2 text-[10px] font-bold text-blue-700">Nombre variable d'agents uniques inscrits à la livraison aujourd'hui. Mode actif : {deliveryAuthorizationMode === 'selection' ? 'sélection directe' : 'codes personnels'}.</p>
        </div>
      </div>

      <div className="flex w-full max-w-xl gap-2 rounded-2xl border border-slate-200 bg-white p-1.5">
        <button type="button" onClick={() => setActiveDeliveryTab('routes')} className={`flex-1 rounded-xl px-4 py-3 text-xs font-black ${activeDeliveryTab === 'routes' ? 'bg-blue-700 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>Tournées par service</button>
        <button type="button" onClick={() => setActiveDeliveryTab('authorized')} className={`flex-1 rounded-xl px-4 py-3 text-xs font-black ${activeDeliveryTab === 'authorized' ? 'bg-blue-700 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>Personnel autorisé</button>
      </div>

      {activeDeliveryTab === 'routes' && <section className="bg-white rounded-3xl border border-blue-100 p-5 shadow-sm grid grid-cols-1 md:grid-cols-[1fr_auto] gap-5 items-center">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">
            <QrCode className="w-4 h-4" />
            QR du jour pour validation livraison
          </div>
          <h3 className="text-xl font-black text-slate-950">Faire scanner ce code au personnel</h3>
          <p className="text-sm text-slate-600">
            À l'arrivée, le bénéficiaire ouvre son espace badge, clique sur Scanner QR restaurant, scanne ce code ou saisit le code court, puis montre l'écran vert de confirmation.
          </p>
          <p className="font-mono text-xs font-black text-slate-700 bg-slate-100 rounded-xl px-3 py-2 inline-block">{dailyQrPayload}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-3xl p-3 shadow-sm justify-self-center">
          <img src={dailyQrUrl} alt="QR du jour livraison" className="w-44 h-44 object-contain" />
        </div>
      </section>}

      <section className={`grid grid-cols-1 gap-5 ${activeDeliveryTab === 'routes' ? 'lg:grid-cols-1' : ''}`}>
        {activeDeliveryTab === 'routes' && (
        <div className="rounded-3xl border border-blue-200 bg-blue-50 p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="font-black text-blue-950">Scanner le badge à la remise</h3>
              <p className="mt-1 text-xs text-blue-800">Le scan confirme automatiquement toutes les commandes de livraison actives du bénéficiaire.</p>
            </div>
            <button type="button" onClick={() => { setScannerMessage(''); setIsScannerOpen(true); }} className="rounded-xl bg-blue-700 px-4 py-3 text-xs font-black text-white flex items-center gap-2">
              <Camera className="w-4 h-4" /> Scanner
            </button>
          </div>
        </div>
        )}
        {activeDeliveryTab === 'authorized' && (
        <div className="rounded-3xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="font-black text-slate-950">Agents autorisés à la livraison</h3>
              <p className="mt-1 text-xs text-slate-500">Liste définie et modifiable uniquement par l'administrateur.</p>
            </div>
            <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">{authorizedProfiles.length} autorisé(s)</span>
          </div>
          <div className="mt-4 max-h-56 overflow-y-auto space-y-3">
            {authorizedProfiles.length === 0 ? <p className="py-5 text-center text-xs text-slate-400">Aucun agent autorisé.</p> : authorizedProfilesByService.map(([service, serviceProfiles]) => (
              <div key={service} className="overflow-hidden rounded-xl border border-blue-100">
                <div className="flex items-center justify-between bg-blue-50 px-3 py-2">
                  <span className="text-[11px] font-black uppercase text-blue-900">{service}</span>
                  <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-black text-blue-700">{serviceProfiles.length}</span>
                </div>
                <div className="divide-y divide-slate-100 px-3">
                  {serviceProfiles.map(profile => (
                    <div key={profile.id} className="py-3 flex justify-between gap-3 text-xs">
                      <div><p className="font-black text-slate-900">{profile.name}</p><p className="text-slate-500">{profile.building} · {profile.floor}</p></div>
                      <div className="text-right"><p className="font-mono font-black">{profile.badgeNumber}</p><p className="text-slate-500">{profile.phone}</p></div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
        )}
      </section>

      {activeDeliveryTab === 'routes' && <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-bold text-slate-900 text-sm">Feuilles de route actives</h3>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => printDeliveryList('pending')} className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-black text-blue-800 flex items-center gap-2">
                <Printer className="w-4 h-4" /> Imprimer la liste à livrer
              </button>
              {canPrintThermalLabels && <button type="button" onClick={printThermalDeliveryLabels} className="rounded-xl bg-blue-800 px-3 py-2 text-xs font-black text-white flex items-center gap-2">
                <Printer className="w-4 h-4" /> Imprimer étiquettes thermiques
              </button>}
            </div>
          </div>

          {deliveryPendingOrders.length === 0 ? (
            <div className="py-16 bg-white rounded-3xl border border-slate-100 text-center text-slate-400 space-y-2">
              <CheckCircle className="w-12 h-12 stroke-[1.2] text-blue-400 mx-auto" />
              <p className="font-semibold text-slate-500">Zéro livraison restante.</p>
              <p className="text-xs">Toutes les commandes sont remises à température.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {pendingDeliveriesByService.map(([service, serviceOrders]) => (
                <section key={service} className="space-y-3 rounded-3xl border-2 border-blue-200 bg-blue-50/40 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-blue-900 px-4 py-3 text-white">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-5 w-5" />
                      <h4 className="font-black uppercase tracking-wide">{service}</h4>
                    </div>
                    <div className="flex gap-2 text-[10px] font-black">
                      <span className="rounded-full bg-white/15 px-3 py-1">{new Set(serviceOrders.map(order => order.employeeId)).size} agent(s)</span>
                      <span className="rounded-full bg-white px-3 py-1 text-blue-900">{serviceOrders.length} commande(s)</span>
                    </div>
                  </div>
                  {serviceOrders.map((order) => {
                    const isReadyToCollect = order.status === 'preparing';
                    const isInTransit = order.status === 'delivering';

                    return (
                  <div key={order.id} className="bg-white rounded-2xl border-2 border-slate-200 p-5 shadow-sm space-y-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold bg-slate-100 text-slate-800 px-2 py-0.5 rounded text-xs">
                            #{order.id}
                          </span>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-extrabold uppercase ${
                            isInTransit ? 'bg-blue-100 text-blue-800 animate-pulse' : 'bg-amber-100 text-amber-800'
                          }`}>
                            {isReadyToCollect ? 'Prêt en cuisine' : "En cours d'acheminement"}
                          </span>
                        </div>
                        <h4 className="font-bold text-slate-900 text-sm mt-2 flex items-center gap-1">
                          <User className="w-4 h-4 text-slate-400" /> {order.employeeName}
                        </h4>
                        <div className="mt-2 flex flex-wrap gap-2 text-[10px] font-black">
                          <span className="rounded-full bg-blue-50 px-2.5 py-1 text-blue-800">
                            Service: {order.department || 'Non renseigné'}
                          </span>
                          <span className="rounded-full bg-blue-50 px-2.5 py-1 text-blue-800">
                            Tél: {order.employeePhone || 'Non renseigné'}
                          </span>
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="text-slate-400 text-[10px] block">Service :</span>
                        <span className="font-bold text-slate-800 block text-xs">{order.department}</span>
                      </div>
                    </div>

                    <div className="p-3 bg-slate-50 rounded-2xl text-xs space-y-1">
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-2">Repas à charger :</p>
                      {order.items.map((item, index) => (
                        <div key={index} className="flex justify-between items-center text-slate-800">
                          <span className="font-medium">{getMealVisual(item.meal?.image)} {(item.meal?.name || 'Repas')}</span>
                          <span className="font-mono font-bold text-slate-900 bg-slate-200/50 px-1.5 py-0.5 rounded">x{item.quantity}</span>
                        </div>
                      ))}
                      {order.notes && (
                        <p className="text-[10px] text-red-700 bg-red-50 p-2 rounded-lg mt-2 italic font-mono">
                          Attention : {order.notes}
                        </p>
                      )}
                    </div>

                    <div className="p-3.5 bg-indigo-50/50 border border-blue-100/30 rounded-2xl flex flex-col md:flex-row justify-between text-xs gap-3">
                      <div className="space-y-1">
                        <p className="font-extrabold text-blue-900 uppercase tracking-wider text-[10px] flex items-center gap-1">
                          <Building2 className="w-3.5 h-3.5 text-blue-600" />
                          Plan d'acheminement interne :
                        </p>
                        <p className="font-semibold text-slate-700">{order.building} - {order.floor}</p>
                        <p className="font-mono text-[11px] text-slate-500">
                          Chambre / Bureau destinataire : <span className="font-semibold text-slate-900">{order.room}</span>
                        </p>
                      </div>

                      <div className="bg-white border border-blue-100/70 rounded-xl p-2.5 flex items-center gap-2 max-w-xs shrink-0 self-center">
                        <Navigation className="w-7 h-7 text-blue-500" />
                        <div className="text-[10px] text-slate-500 font-mono leading-tight">
                          <span className="text-blue-700 font-bold uppercase block tracking-wider">Fléchage :</span>
                          Entrée {order.building.includes('Principal') ? 'centrale' : 'ailes'}, {order.floor}.
                        </div>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-slate-100 flex justify-between items-center flex-wrap gap-2 text-xs">
                      <a
                        href={`tel:${order.employeePhone}`}
                        className="flex items-center gap-1.5 text-blue-700 hover:text-blue-900 font-bold transition font-mono bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-xl cursor-pointer"
                      >
                        <Phone className="w-3.5 h-3.5" /> Appeler le personnel ({order.employeePhone})
                      </a>

                      <div className="flex gap-2">
                        {isReadyToCollect && (
                          <>
                            <button
                              id={`btn-collect-by-courier-${order.id}`}
                              onClick={() => onUpdateOrderStatus(order.id, 'delivering')}
                              className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-4 rounded-xl transition flex items-center gap-1.5 cursor-pointer font-sans shadow-sm shadow-blue-500/15"
                            >
                              <Navigation className="w-4 h-4" /> Commencer la livraison
                            </button>
                            <button
                              id={`btn-direct-delivered-by-courier-${order.id}`}
                              onClick={() => {
                                if (!window.confirm(`Confirmer la livraison du repas de ${order.employeeName} sans scan du badge ?`)) return;
                                onUpdateOrderStatus(order.id, 'delivered');
                              }}
                              className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-4 rounded-xl transition flex items-center gap-1.5 cursor-pointer font-sans shadow-sm shadow-blue-500/15"
                            >
                              <CheckCircle className="w-4 h-4" /> Livré
                            </button>
                          </>
                        )}

                        {isInTransit && (
                          <>
                            <button
                              id={`btn-returned-by-courier-${order.id}`}
                              onClick={() => markOrderReturned(order)}
                              className="bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-200 font-bold py-2.5 px-4 rounded-xl transition flex items-center gap-1.5 cursor-pointer font-sans"
                            >
                              <RotateCcw className="w-4 h-4" /> Signaler retournée
                            </button>
                            <button
                              id={`btn-delivered-by-courier-${order.id}`}
                              onClick={() => onUpdateOrderStatus(order.id, 'delivered')}
                              className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-4 rounded-xl transition flex items-center gap-1.5 cursor-pointer font-sans shadow-sm shadow-blue-500/15"
                            >
                              <CheckCircle className="w-4 h-4" /> Remis en main propre
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                    );
                  })}
                </section>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-bold text-slate-900 text-sm">Livraisons traitées aujourd'hui</h3>
            <button type="button" onClick={() => printDeliveryList('completed')} title="Imprimer les livraisons traitées" className="rounded-xl border border-slate-200 bg-white p-2 text-slate-700 hover:bg-slate-50">
              <Printer className="w-4 h-4" />
            </button>
          </div>
          <div className="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm space-y-3 max-h-[580px] overflow-y-auto">
            {completedDeliveryOrders.length === 0 ? (
              <p className="text-center py-8 text-xs text-slate-400">Aucun colis n'a encore été remis en main aujourd'hui.</p>
            ) : (
              completedDeliveryOrders.map((order) => (
                <div key={order.id} className="pb-3 border-b border-slate-100 last:border-0 last:pb-0 text-xs">
                  <div className="flex justify-between font-mono font-bold text-slate-700">
                    <span>CMD #{order.id}</span>
                    <span className={order.status === 'returned' ? 'text-amber-700' : 'text-blue-700'}>{order.status === 'returned' ? 'Retournée' : 'Remise'}</span>
                  </div>
                  <p className="font-semibold text-slate-900 mt-1">{order.employeeName}</p>
                  <p className="text-[10px] font-black text-blue-700 mt-0.5">Service : {order.department || 'Non renseigné'}</p>
                  <p className="text-[10px] text-slate-400 font-mono mt-0.5">{order.building} - {order.room}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>}

      {isScannerOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 p-4 flex items-center justify-center">
          <div className="w-full max-w-lg rounded-3xl bg-white p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <div><h3 className="font-black text-slate-950">Scanner le badge du bénéficiaire</h3><p className="text-xs text-slate-500">La livraison sera validée après reconnaissance du badge.</p></div>
              <button type="button" onClick={() => setIsScannerOpen(false)} className="p-2 rounded-xl bg-slate-100"><X className="w-5 h-5" /></button>
            </div>
            <div className="mt-4 aspect-video overflow-hidden rounded-2xl bg-black">
              <video ref={videoRef} muted playsInline className="w-full h-full object-cover" />
            </div>
            {scannerMessage && <p className={`mt-3 rounded-xl p-3 text-sm font-bold ${scannerMessage.startsWith('Livraison confirmée') ? 'bg-blue-50 text-blue-800' : 'bg-amber-50 text-amber-800'}`}>{scannerMessage}</p>}
            <div className="mt-4 flex gap-2">
              <input value={manualBadge} onChange={event => setManualBadge(event.target.value)} placeholder="Numéro du badge" className="flex-1 rounded-xl border border-slate-200 px-3 py-3 text-sm font-mono" />
              <button type="button" onClick={() => validateDeliveryBadge(manualBadge)} className="rounded-xl bg-slate-950 px-5 py-3 text-xs font-black text-white">Valider</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};




