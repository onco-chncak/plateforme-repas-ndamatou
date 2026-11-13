type QzTray = {
  websocket: {
    isActive: () => boolean;
    connect: () => Promise<void>;
  };
  security?: {
    setCertificatePromise: (resolver: (resolve: (certificate: string) => void, reject: (error: unknown) => void) => void) => void;
    setSignatureAlgorithm?: (algorithm: string) => void;
    setSignaturePromise: (resolver: (toSign: string) => (resolve: (signature: string) => void, reject: (error: unknown) => void) => void) => void;
  };
  configs: {
    create: (printer: string | null | undefined, options?: Record<string, unknown>) => unknown;
  };
  printers: {
    getDefault: () => Promise<string>;
    find: (printer: string) => Promise<string>;
  };
  print: (config: unknown, data: unknown[]) => Promise<void>;
};

declare global {
  interface Window {
    qz?: QzTray;
  }
}

const QZ_SCRIPT_ID = 'qz-tray-script';
const QZ_SCRIPT_URL = 'https://cdn.jsdelivr.net/npm/qz-tray@2.2.4/qz-tray.js';
const DEFAULT_CERTIFICATE_URL = 'http://127.0.0.1:8182/certificate';
const DEFAULT_SIGNATURE_URL = 'http://127.0.0.1:8182/sign';

let configuredSecurityKey = '';
let cachedCertificate = '';

const fetchWithTimeout = async (url: string, options: RequestInit = {}, timeoutMs = 1800) => {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal, cache: 'no-store' });
  } finally {
    window.clearTimeout(timeout);
  }
};

const loadQzScript = async () => {
  if (window.qz) return;
  const existing = document.getElementById(QZ_SCRIPT_ID) as HTMLScriptElement | null;
  if (existing) {
    await new Promise<void>((resolve, reject) => {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Chargement QZ Tray impossible.')), { once: true });
    });
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.id = QZ_SCRIPT_ID;
    script.src = QZ_SCRIPT_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Chargement QZ Tray impossible.'));
    document.head.appendChild(script);
  });
};

const configureQzSecurity = async (
  qz: QzTray,
  options: {
    certificateUrl?: string;
    signatureUrl?: string;
    requireSigned?: boolean;
  } = {},
) => {
  if (!qz.security) {
    if (options.requireSigned) throw new Error('QZ Tray ne supporte pas la signature sur cette installation.');
    return false;
  }

  const certificateUrl = String(options.certificateUrl || DEFAULT_CERTIFICATE_URL).trim();
  const signatureUrl = String(options.signatureUrl || DEFAULT_SIGNATURE_URL).trim();
  const securityKey = `${certificateUrl}|${signatureUrl}`;
  if (configuredSecurityKey === securityKey && cachedCertificate) return true;

  try {
    const certificateResponse = await fetchWithTimeout(certificateUrl);
    if (!certificateResponse.ok) throw new Error(`certificat HTTP ${certificateResponse.status}`);
    cachedCertificate = await certificateResponse.text();
    if (!cachedCertificate.trim()) throw new Error('certificat vide');

    qz.security.setCertificatePromise((resolve) => resolve(cachedCertificate));
    qz.security.setSignatureAlgorithm?.('SHA512');
    qz.security.setSignaturePromise((toSign: string) => (resolve, reject) => {
      fetchWithTimeout(signatureUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request: toSign }),
      }, 4500)
        .then(async response => {
          if (!response.ok) throw new Error(`signature HTTP ${response.status}`);
          const contentType = response.headers.get('content-type') || '';
          if (contentType.includes('application/json')) {
            const payload = await response.json();
            return String(payload.signature || '');
          }
          return response.text();
        })
        .then(signature => {
          if (!signature.trim()) throw new Error('signature vide');
          resolve(signature.trim());
        })
        .catch(reject);
    });
    configuredSecurityKey = securityKey;
    return true;
  } catch (error) {
    configuredSecurityKey = '';
    cachedCertificate = '';
    if (options.requireSigned) {
      throw error instanceof Error ? error : new Error('Service de signature QZ indisponible.');
    }
    return false;
  }
};

export const printHtmlWithQz = async (
  html: string,
  options: {
    printerName?: string;
    widthMm?: number;
    certificateUrl?: string;
    signatureUrl?: string;
    requireSigned?: boolean;
  } = {},
) => {
  await loadQzScript();
  const qz = window.qz;
  if (!qz) throw new Error('QZ Tray indisponible.');
  await configureQzSecurity(qz, options);
  if (!qz.websocket.isActive()) {
    await qz.websocket.connect();
  }
  const configuredPrinter = String(options.printerName || '').trim();
  const printer = configuredPrinter ? await qz.printers.find(configuredPrinter) : await qz.printers.getDefault();
  const config = qz.configs.create(printer, {
    units: 'mm',
    size: { width: options.widthMm || 80 },
    margins: 0,
    density: 203,
  });
  await qz.print(config, [{
    type: 'html',
    format: 'plain',
    data: html,
    options: { pageWidth: options.widthMm || 80 },
  }]);
};
