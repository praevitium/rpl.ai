importScripts('precache.js');

const { version, files } = self.PRECACHE;
const CACHE = `rplai-${version}`;
const NETWORK_FIRST_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const networkFirst = NETWORK_FIRST_HOSTS.has(self.location.hostname);

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(files)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const stale = (await caches.keys()).filter((key) => key.startsWith('rplai-') && key !== CACHE);
    await Promise.all(stale.map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'activate-update') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(networkFirst ? fromNetwork(request) : fromCache(request));
});

async function cached(cache, request) {
  const hit = await cache.match(request, { ignoreSearch: true });
  if (hit || request.mode !== 'navigate') return hit;
  return cache.match('./');
}

async function fromCache(request) {
  const cache = await caches.open(CACHE);
  const hit = await cached(cache, request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

async function fromNetwork(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (err) {
    const hit = await cached(cache, request);
    if (hit) return hit;
    throw err;
  }
}
