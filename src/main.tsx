import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { AppErrorBoundary } from './components/AppErrorBoundary.tsx';
import './index.css';

const APP_BUILD_VERSION = '2026-07-01-restaurant-admin-cache-refresh-v1';
const LARGE_LOCAL_CACHE_KEYS = [
  'chncak_profiles',
  'chncak_orders',
  'chncak_notifications',
  'chncak_cash_transactions',
  'chncak_wave_topup_requests',
  'chncak_prepaid_cards',
  'chncak_active_profile',
];

const clearLegacyBrowserCaches = async () => {
  try {
    const previousVersion = localStorage.getItem('chncak_app_build_version');
    if (previousVersion === APP_BUILD_VERSION) return;
    LARGE_LOCAL_CACHE_KEYS.forEach((key) => localStorage.removeItem(key));
    localStorage.setItem('chncak_app_build_version', APP_BUILD_VERSION);
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName)));
    }
  } catch (error) {
    console.warn('Ancien cache navigateur ignore:', error);
  }
};

void clearLegacyBrowserCaches();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>,
);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.getRegistrations()
      .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
      .then(async () => {
        if ('caches' in window) {
          const cacheNames = await caches.keys();
          await Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName)));
        }
      })
      .catch((error) => {
        console.warn('Nettoyage service worker ignore:', error);
      });
  });
}
