const CACHE_VERSION = 'picforge-v0.17.0-heif-1.23.4-de265-1.1.1';
const APP_SHELL_CACHE = `${CACHE_VERSION}-app-shell`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;
/**
 * Heavy engines live in versioned directories whose bytes never change, so they
 * are cached per engine version instead of per app version: an app release does
 * not force another ~33 MB download or drop offline conversion.
 */
const ENGINE_PREFIX = 'picforge-engine-';
const ENGINES = ['ffmpeg-0.12.10', 'heif-1.23.4-de265-1.1.1'];
const ENGINE_PATH = /^\/wasm\/((?:ffmpeg|heif)-[^/]+)\//;
/** Records which version was active, so its app shell can outlive one update. */
const META_CACHE = 'picforge-meta';
const META_ACTIVE = '/__picforge/active-cache-version';

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
  // No skipWaiting here: an open page keeps the worker (and cached modules) it
  // started with until the user accepts the update prompt.
  event.waitUntil(
    caches.open(APP_SHELL_CACHE).then(async (cache) => {
      const response = await fetch('/precache.json', { cache: 'reload' });
      if (!response.ok) throw new Error('Missing application precache manifest');
      const modules = await response.json();
      await cache.addAll(
        [...APP_SHELL, ...modules].map((url) => new Request(url, { cache: 'reload' })),
      );
    }),
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(activate().then(() => self.clients.claim()));
});

async function activate() {
  const meta = await caches.open(META_CACHE);
  const previous = await (await meta.match(META_ACTIVE))?.text();
  const keys = await caches.keys();

  // Move engines cached by earlier versions into their engine caches first.
  for (const key of keys) {
    if (!key.startsWith('picforge-v') || key.startsWith(CACHE_VERSION)) continue;
    const cache = await caches.open(key);
    for (const request of await cache.keys()) {
      const engine = engineOf(new URL(request.url));
      if (!engine || !ENGINES.includes(engine)) continue;
      const response = await cache.match(request);
      if (response) await (await caches.open(ENGINE_PREFIX + engine)).put(request, response);
    }
  }

  await Promise.all(
    keys.map((key) => {
      if (key === META_CACHE || key.startsWith(CACHE_VERSION)) return undefined;
      if (key.startsWith(ENGINE_PREFIX)) {
        return ENGINES.includes(key.slice(ENGINE_PREFIX.length)) ? undefined : caches.delete(key);
      }
      if (!key.startsWith('picforge-')) return undefined;
      // Tabs opened before this update may still lazy-load the previous version's
      // hashed modules, which the server no longer has: keep only those modules of
      // that version's app shell until the next activation. Without a record, keep
      // any shell once.
      const keepShell =
        key.endsWith('-app-shell') &&
        (previous ? key === `${previous}-app-shell` : true) &&
        previous !== CACHE_VERSION;
      return keepShell ? keepHashedModules(key) : caches.delete(key);
    }),
  );
  await meta.put(META_ACTIVE, new Response(CACHE_VERSION));
}

/**
 * A kept old shell may only serve content-hashed modules. Fixed URLs (index.html,
 * codec WASM, icons, manifest) and engines must always come from this version.
 */
async function keepHashedModules(key) {
  const cache = await caches.open(key);
  for (const request of await cache.keys()) {
    if (!isHashedModule(new URL(request.url))) await cache.delete(request);
  }
}

function isHashedModule(url) {
  return url.origin === self.location.origin && url.pathname.startsWith('/assets/');
}

function engineOf(url) {
  return url.origin === self.location.origin ? url.pathname.match(ENGINE_PATH)?.[1] : undefined;
}

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
    url.pathname.startsWith('/src/') ||
    url.pathname.startsWith('/__picforge/')
  ) {
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstPage(request));
    return;
  }

  const engine = engineOf(url);
  if (engine) {
    event.respondWith(
      ENGINES.includes(engine) ? cacheFirst(request, ENGINE_PREFIX + engine, url) : fetch(request),
    );
    return;
  }

  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(request, RUNTIME_CACHE, url));
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
    return (
      (await cache.match(request)) || (await (await caches.open(APP_SHELL_CACHE)).match('/index.html'))
    );
  }
}

async function cacheFirst(request, cacheName, url) {
  // Same-origin static files have identical content across Origin request modes.
  // This version's caches first: caches.match() searches in creation order, and an
  // older kept shell must never shadow a fixed URL whose bytes changed.
  for (const name of new Set([APP_SHELL_CACHE, RUNTIME_CACHE, cacheName])) {
    const cached = await (await caches.open(name)).match(request, { ignoreVary: true });
    if (cached) return cached;
  }
  // Only content-hashed modules may come from the previous version's shell.
  if (isHashedModule(url)) {
    const previous = await caches.match(request, { ignoreVary: true });
    if (previous) return previous;
  }

  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(cacheName);
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
