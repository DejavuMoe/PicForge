const CACHE_VERSION = 'picforge-v0.17.0';
const APP_SHELL_CACHE = `${CACHE_VERSION}-app-shell`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

const APP_SHELL = [
  '/',
  '/index.html',
  '/favicon.svg',
  '/favicon.svg?v=folded-p',
  '/favicon.ico',
  '/favicon-32.png',
  '/apple-touch-icon.png',
  '/pwa-icon.svg',
  '/pwa-192.png',
  '/pwa-512.png',
  '/pwa-maskable-512.png',
  '/og-image.png',
  '/og-image.jpg',
  '/twitter-card.png',
  '/manifest.webmanifest',
  '/wasm/avif_enc.wasm',
  '/wasm/mozjpeg_enc.wasm',
  '/wasm/oxipng.wasm',
  '/wasm/webp_enc.wasm',
  '/wasm/webp_enc_simd.wasm',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(APP_SHELL_CACHE)
      .then(async (cache) => {
        const response = await fetch('/precache.json', { cache: 'reload' });
        if (!response.ok) throw new Error('Missing application precache manifest');
        const modules = await response.json();
        await cache.addAll(
          [...APP_SHELL, ...modules].map((url) => new Request(url, { cache: 'reload' })),
        );
      })
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('picforge-') && !key.startsWith(CACHE_VERSION))
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never intercept Vite dev-server URLs. A stale registration left on a dev
  // origin must pass modules/HMR through to the network instead of serving
  // cached production assets.
  if (
    url.pathname.startsWith('/@') ||
    url.pathname.startsWith('/node_modules/') ||
    url.pathname.startsWith('/src/')
  ) {
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstPage(request));
    return;
  }

  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  event.respondWith(staleWhileRevalidate(request));
});

function isStaticAsset(url) {
  return (
    url.pathname.startsWith('/assets/') ||
    url.pathname.startsWith('/fonts/') ||
    url.pathname.startsWith('/wasm/') ||
    /\.(?:css|m?js|svg|png|webp|avif|ico|woff2?)$/i.test(url.pathname)
  );
}

async function networkFirstPage(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch {
    return (await cache.match(request)) || (await caches.match('/index.html'));
  }
}

async function cacheFirst(request) {
  // Same-origin static files have identical content across Origin request modes.
  const cached = await caches.match(request, { ignoreVary: true });
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(RUNTIME_CACHE);
    await cache.put(request, response.clone());
  }
  return response;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);
  const networkResponsePromise = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => undefined);

  if (cached) return cached;

  const networkResponse = await networkResponsePromise;
  return networkResponse || Response.error();
}
