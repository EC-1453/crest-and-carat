const cachePrefix = 'crest-carat-static-';
const cacheName = `${cachePrefix}2`;
const assetCacheName = `${cacheName}-assets`;
const assetLimit = 96;
const offlinePage = '/offline.html';
const offlineAssets = [offlinePage, '/offline.css', '/icons/icon-192.png'];
const fingerprintedAsset = /^\/assets\/.+-[\w-]{8,}\.(?:avif|webp|png|jpe?g|svg|woff2?|css|js|ico)$/i;
const onlineOnlyPath = /^\/(?:api|bag|checkout|availability|track-order|order-status|orders|contact)(?:\/|$)/i;
const cacheableDestinations = new Set(['image', 'style', 'script', 'font']);

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(cacheName).then((cache) => cache.addAll(offlineAssets)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    const oldKeys = keys.filter((key) => key.startsWith(cachePrefix) && key !== cacheName && key !== assetCacheName);
    await Promise.all(oldKeys.map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || onlineOnlyPath.test(url.pathname)) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkNavigation(request));
    return;
  }

  if (url.search || !cacheableDestinations.has(request.destination)) return;
  if (offlineAssets.includes(url.pathname)) event.respondWith(offlineAsset(request));
  else if (fingerprintedAsset.test(url.pathname)) event.respondWith(staticAsset(request));
});

async function networkNavigation(request) {
  try {
    return await fetch(request, { cache: 'no-store' });
  } catch {
    const cached = await caches.match(offlinePage, { cacheName }).catch(() => undefined);
    return cached ?? Response.error();
  }
}

async function offlineAsset(request) {
  const cached = await caches.match(request, { cacheName }).catch(() => undefined);
  return cached ?? fetch(request);
}

async function staticAsset(request) {
  const cache = await caches.open(assetCacheName).catch(() => undefined);
  const cached = await cache?.match(request).catch(() => undefined);
  if (cached) return cached;

  const response = await fetch(request);
  const cacheControl = response.headers.get('cache-control') ?? '';
  const contentType = response.headers.get('content-type') ?? '';
  const safeToCache = response.ok && response.type === 'basic' && !response.redirected
    && !/\b(?:private|no-store)\b/i.test(cacheControl) && !/^text\/html\b/i.test(contentType);

  if (cache && safeToCache) await storeAsset(cache, request, response.clone()).catch(() => undefined);
  return response;
}

async function storeAsset(cache, request, response) {
  await cache.put(request, response);
  const keys = await cache.keys();
  await Promise.all(keys.slice(0, Math.max(0, keys.length - assetLimit)).map((key) => cache.delete(key)));
}
