export const SERVICE_WORKER_UPDATE_EVENT = 'picforge-update-ready';

let hasNotifiedUpdate = false;
let activeRegistration: ServiceWorkerRegistration | null = null;

/**
 * Activate a waiting update and reload once it controls the page. The new
 * worker never takes over on its own (no skipWaiting on install), so an open
 * page keeps the modules it was built with until the user chooses to refresh.
 */
export function applyServiceWorkerUpdate(): void {
  const waiting = activeRegistration?.waiting;
  if (!waiting || !('serviceWorker' in navigator)) {
    window.location.reload();
    return;
  }
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded) return;
    reloaded = true;
    window.location.reload();
  });
  waiting.postMessage({ type: 'SKIP_WAITING' });
}

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

/**
 * Dev servers must never be controlled by a service worker: a registration left
 * behind by a production/preview build previously served on this origin would
 * keep answering with stale modules, fonts and CSS. Remove it and its caches.
 */
async function clearServiceWorkersForDev(): Promise<void> {
  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));

    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((key) => key.startsWith('picforge-')).map((key) => caches.delete(key)),
      );
    }
  } catch (error) {
    console.warn('PicForge dev service worker cleanup failed:', error);
  }
}

export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return;

  if (!import.meta.env.PROD) {
    void clearServiceWorkersForDev();
    return;
  }

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        activeRegistration = registration;
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
