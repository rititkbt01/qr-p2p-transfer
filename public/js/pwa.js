// pwa.js — installability + offline app-shell caching.
// The app works fine without any of this (e.g. served over plain http, or opened
// during local development); it's purely additive.

let deferredPrompt = null;

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js').catch(() => {
      // Service workers can't register over file:// or plain http on some setups —
      // that's fine, the app still runs, it just won't work offline.
    });
  });
}

export function watchInstallPrompt(onAvailable) {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    onAvailable(true);
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    onAvailable(false);
  });
}

export async function promptInstall() {
  if (!deferredPrompt) return 'unavailable';
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  deferredPrompt = null;
  return outcome; // 'accepted' | 'dismissed'
}
