importScripts('precache.js');

const { version, hashes } = self.PRECACHE;
const CACHE = `rplai-${version}`;
const HASHES_KEY = './precache-hashes';
const NETWORK_FIRST_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const networkFirst = NETWORK_FIRST_HOSTS.has(self.location.hostname);

// Skip the HTTP cache: GitHub Pages lets browsers reuse files for 10 minutes, so a new version could precache old copies.
const fresh = (file) => new Request(file, { cache: 'reload' });

async function hashOf(response) {
  const digest = await crypto.subtle.digest('SHA-256', await response.clone().arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Earlier caches with the list of what they hold. Nothing here may stop an install, so a cache that cannot be read is left out.
async function earlierCaches() {
  const found = [];
  try {
    for (const key of await caches.keys()) {
      if (!key.startsWith('rplai-')) continue;
      try {
        const cache = await caches.open(key);
        const held = await (await cache.match(HASHES_KEY))?.json();
        if (held && typeof held === 'object') found.push({ cache, held });
      } catch {}
    }
  } catch {}
  return found;
}

async function carried(earlier, file, hash) {
  for (const { cache, held } of earlier) {
    if (held[file] !== hash) continue;
    try {
      const response = await cache.match(file);
      if (response?.ok) return response;
    } catch {}
  }
  return null;
}

// A file whose bytes are not the ones the list names (an old copy served while a deploy spreads) is still cached,
// but left off the saved list so a later install fetches it again.
async function fetched(file, hash) {
  const response = await fetch(fresh(file));
  if (!response.ok) throw new Error(`precache: ${file} answered ${response.status}`);
  let verified = false;
  try { verified = (await hashOf(response)).startsWith(hash); } catch {}
  return { response, verified };
}

// Unchanged files come from an earlier cache, so an update downloads only what changed. Everything is in hand
// before the first write, and the list is written last: a cache without one is never carried from.
async function installCarrying() {
  const earlier = await earlierCaches();
  const entries = await Promise.all(Object.entries(hashes).map(async ([file, hash]) => {
    const kept = await carried(earlier, file, hash);
    return kept ? { file, hash, response: kept, verified: true } : { file, hash, ...await fetched(file, hash) };
  }));
  const cache = await caches.open(CACHE);
  await Promise.all(entries.map(({ file, response }) => cache.put(file, response)));
  const held = Object.fromEntries(entries.filter((e) => e.verified).map((e) => [e.file, e.hash]));
  await cache.put(HASHES_KEY, new Response(JSON.stringify(held), { headers: { 'Content-Type': 'application/json' } }));
}

// The dev server rewrites pages and network-first replaces entries after the install, so no list would stay true there.
async function installFresh() {
  const cache = await caches.open(CACHE);
  await cache.addAll(Object.keys(hashes).map(fresh));
}

self.addEventListener('install', (event) => {
  event.waitUntil(networkFirst ? installFresh() : installCarrying());
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
