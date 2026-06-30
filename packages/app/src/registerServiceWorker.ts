export const SERVICE_WORKER_UPDATE_EVENT = 'picforge-update-ready';

let hasNotifiedUpdate = false;

function notifyUpdateReady(): void {
  if (hasNotifiedUpdate) return;
  hasNotifiedUpdate = true;
  window.dispatchEvent(new CustomEvent(SERVICE_WORKER_UPDATE_EVENT));
}

function watchInstallingWorker(registration: ServiceWorkerRegistration): void {
  const installingWorker = registration.installing;
  if (!installingWorker) return;

  installingWorker.addEventListener('statechange', () => {
    if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
      notifyUpdateReady();
    }
  });
}

export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        if (registration.waiting && navigator.serviceWorker.controller) {
          notifyUpdateReady();
        }

        registration.addEventListener('updatefound', () => {
          watchInstallingWorker(registration);
        });

        registration.update().catch(() => undefined);
      })
      .catch((error) => {
        console.warn('PicForge service worker registration failed:', error);
      });
  });
}
