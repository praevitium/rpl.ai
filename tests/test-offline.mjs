import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assert } from './helpers.mjs';
import { createHash } from 'node:crypto';
import { precacheFiles, precacheVersion, precacheHashes } from '../scripts/gen-precache.mjs';

const WWW = fileURLToPath(new URL('../www/', import.meta.url));
const files = new Set(precacheFiles(WWW));

function importGraph(entry) {
  const seen = new Set();
  const queue = [entry];
  const specifiers = /(?:import|export)\s[^'"`;]*?from\s*['"]([^'"]+)['"]|import\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;
  while (queue.length) {
    const file = queue.shift();
    if (seen.has(file)) continue;
    seen.add(file);
    const src = readFileSync(join(WWW, file), 'utf8');
    for (const m of src.matchAll(specifiers)) {
      const spec = m[1] ?? m[2] ?? m[3];
      if (!spec.startsWith('.')) continue;
      queue.push(normalize(join(dirname(file), spec)).replace(/\\/g, '/'));
    }
  }
  return [...seen];
}

{
  const modules = importGraph('src/app.js');
  const missing = modules.filter((f) => !files.has(f));
  assert(modules.length > 40 && missing.length === 0,
    `precache holds every module app.js imports (${modules.length})${missing.length ? `; missing ${missing.join(', ')}` : ''}`);
}

{
  const html = readFileSync(join(WWW, 'index.html'), 'utf8');
  const refs = [...html.matchAll(/(?:href|src)="([^"#:]+)"/g)].map((m) => m[1]).filter((r) => !r.startsWith('/'));
  const missing = refs.filter((r) => !files.has(r));
  assert(refs.length >= 6 && missing.length === 0, `precache holds every file index.html links${missing.length ? `; missing ${missing.join(', ')}` : ''}`);
}

{
  const rooted = [...files].filter((f) => /\.(m?js|html|css)$/.test(f) && !f.startsWith('vendor/')).flatMap((f) =>
    [...readFileSync(join(WWW, f), 'utf8').matchAll(/['"`(]\/([^'"`)\s?#]+)/g)]
      .filter((m) => files.has(m[1])).map((m) => `${f}: /${m[1]}`));
  assert(rooted.length === 0, `app files reference each other relatively, so the app runs under /rpl.ai/${rooted.length ? `; rooted ${rooted.join(', ')}` : ''}`);
}

{
  const css = readFileSync(join(WWW, 'css/fonts.css'), 'utf8');
  const fonts = [...css.matchAll(/url\("\.\.\/([^"]+)"\)/g)].map((m) => m[1]);
  assert(fonts.length > 0 && fonts.every((f) => files.has(f)), 'precache holds every font fonts.css declares');
}

for (const f of ['vendor/giac/giacwasm.js', 'vendor/giac/giacwasm.wasm', 'docs/hp50-commands.html', 'vendor/mermaid/mermaid.min.js', 'vendor/katex/katex.mjs', 'manifest.webmanifest']) {
  assert(files.has(f), `precache holds ${f}, which the app fetches at run time`);
}

assert(!files.has('sw.js') && !files.has('precache.js'), 'precache leaves out the service worker and its own list');
assert(![...files].some((f) => /(^|\/)(README|LICENSE)/i.test(f) || f.endsWith('package.json')),
  'precache leaves out vendor READMEs, licenses and package.json files');

{
  const manifest = JSON.parse(readFileSync(join(WWW, 'manifest.webmanifest'), 'utf8'));
  assert(manifest.display === 'standalone' && manifest.start_url === './', 'manifest: installs as a standalone app rooted at ./');
  for (const ic of manifest.icons.filter((i) => i.type === 'image/png')) {
    const png = readFileSync(join(WWW, ic.src));
    const size = `${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`;
    assert(files.has(ic.src) && size === ic.sizes, `manifest: ${ic.src} is precached and really ${ic.sizes}`);
  }
  assert(manifest.icons.some((i) => i.purpose === 'maskable'), 'manifest: has a maskable icon');
  const target = manifest.share_target;
  assert(target?.action === './' && target.method === 'GET' && target.params?.text === 'text' && target.params?.url === 'url',
    'manifest: the installed app takes text shared from other apps as ./?text=…, which the service worker serves from its cache (ignoreSearch)');
  const appSrc = readFileSync(join(WWW, 'src/app.js'), 'utf8');
  const opens = (manifest.shortcuts ?? []).map((s) => new URL(s.url, 'https://x/').searchParams.get('open'));
  assert(opens.join() === 'equation,matrix,vars,search' && opens.every((o) => appSrc.includes(`['${o}', (app) =>`))
    && manifest.shortcuts.every((s) => s.icons?.every((i) => files.has(i.src))),
    'manifest: the app icon\'s shortcuts open the equation writer, the matrix writer, Variables and command search, each one the app knows, with a precached icon');
}

{
  const dir = mkdtempSync(join(tmpdir(), 'rplai-precache-'));
  try {
    writeFileSync(join(dir, 'a.js'), 'one');
    const v1 = precacheVersion(dir, ['a.js'], '1.0');
    writeFileSync(join(dir, 'a.js'), 'two');
    const v2 = precacheVersion(dir, ['a.js'], '1.0');
    assert(v1 !== v2 && v1.startsWith('1.0-'), 'precacheVersion changes when a cached file changes, so installs pick up new code');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

{
  const hashes = precacheHashes(WWW, [...files]);
  const sha = (f) => createHash('sha256').update(readFileSync(join(WWW, f))).digest('hex');
  assert(Object.keys(hashes).length === files.size + 1 && [...files].every((f) => /^[0-9a-f]{16}$/.test(hashes[f])),
    'precacheHashes gives every precached file a content hash');
  assert(hashes['./'] === hashes['index.html'] && sha('index.html').startsWith(hashes['./']), 'precacheHashes gives the page itself index.html\'s hash');
}

/* --- The service worker's install, run from www/sw.js against a fake cache store and network. --- */
{
  const swSrc = readFileSync(join(WWW, 'sw.js'), 'utf8');
  const short = (text) => createHash('sha256').update(text).digest('hex').slice(0, 16);

  function fakeCaches() {
    const stores = new Map();
    const keyOf = (k) => (typeof k === 'string' ? k : k.url);
    const open = async (name) => {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name);
      return {
        match: async (k) => store.get(keyOf(k))?.clone(),
        put: async (k, response) => { store.set(keyOf(k), response); },
        addAll: async (requests) => {
          const got = await Promise.all(requests.map((r) => world.fetch(r)));
          if (got.some((r) => !r.ok)) throw new Error('addAll failed');
          requests.forEach((r, i) => store.set(keyOf(r), got[i]));
        },
      };
    };
    const world = { stores, caches: { open, keys: async () => [...stores.keys()], delete: async (name) => stores.delete(name) }, fetch: null };
    return world;
  }

  // Installs a worker for `site` (file -> text) and reports what it fetched.
  async function install(world, { version, site, served = site, hostname = 'example.github.io', listed = (f) => short(site[f]) }) {
    const fetches = [];
    world.fetch = async (request) => {
      fetches.push(request.url);
      if (request.cache !== 'reload') throw new Error('precache fetch reused the HTTP cache');
      return request.url in served ? new Response(served[request.url]) : new Response('', { status: 404 });
    };
    const listeners = {};
    const self = {
      PRECACHE: { version, hashes: Object.fromEntries(Object.keys(site).map((f) => [f, listed(f)])) },
      location: { hostname, origin: `https://${hostname}` },
      addEventListener: (type, fn) => { listeners[type] = fn; },
      clients: { claim: async () => {} },
    };
    class FakeRequest { constructor(url, opts = {}) { this.url = url; this.cache = opts.cache; } }
    new Function('self', 'caches', 'fetch', 'importScripts', 'Request', swSrc)(self, world.caches, (r) => world.fetch(r), () => {}, FakeRequest);
    let done;
    listeners.install({ waitUntil: (p) => { done = p; } });
    let error = null;
    try { await done; } catch (e) { error = e; }
    return { fetches: fetches.sort(), error, activate: async () => { let p; listeners.activate({ waitUntil: (q) => { p = q; } }); await p; } };
  }
  const textOf = async (world, name, file) => (await world.stores.get(name)?.get(file)?.clone().text()) ?? null;
  const listOf = async (world, name) => JSON.parse(await textOf(world, name, './precache-hashes'));

  const v1 = { './': 'page 1', 'app.js': 'app 1', 'vendor/giac.wasm': 'giac' };
  const v2 = { ...v1, 'app.js': 'app 2' };

  const world = fakeCaches();
  const first = await install(world, { version: '1', site: v1 });
  assert(!first.error && first.fetches.join() === './,app.js,vendor/giac.wasm', 'sw install: with no earlier cache every file is fetched, past the HTTP cache');
  assert(Object.keys(await listOf(world, 'rplai-1')).sort().join() === './,app.js,vendor/giac.wasm', 'sw install: the cache keeps a list of what it holds');
  const second = await install(world, { version: '2', site: v2 });
  assert(!second.error && second.fetches.join() === 'app.js', 'sw install: an update fetches only the file that changed');
  assert(await textOf(world, 'rplai-2', 'vendor/giac.wasm') === 'giac' && await textOf(world, 'rplai-2', 'app.js') === 'app 2' && await textOf(world, 'rplai-2', './') === 'page 1',
    'sw install: the new cache holds the unchanged files carried over and the changed one fetched');
  await second.activate();
  assert([...world.stores.keys()].join() === 'rplai-2', 'sw activate: the earlier cache goes once the new one is complete');

  const legacy = fakeCaches();
  legacy.stores.set('rplai-0', new Map(Object.entries(v1).map(([f, text]) => [f, new Response(text)])));
  const fromLegacy = await install(legacy, { version: '1', site: v1 });
  assert(!fromLegacy.error && fromLegacy.fetches.length === 3, 'sw install: an earlier cache with no list is not trusted, so everything is fetched');

  const broken = fakeCaches();
  broken.stores.set('rplai-0', new Map([['./precache-hashes', new Response('{not json')], ['app.js', new Response('app 1')]]));
  const fromBroken = await install(broken, { version: '1', site: v1 });
  assert(!fromBroken.error && fromBroken.fetches.length === 3 && await textOf(broken, 'rplai-1', 'app.js') === 'app 1', 'sw install: an earlier cache whose list cannot be read does not stop the install');
  const throwing = fakeCaches();
  throwing.caches.keys = async () => { throw new Error('storage'); };
  const fromThrowing = await install(throwing, { version: '1', site: v1 });
  assert(!fromThrowing.error && fromThrowing.fetches.length === 3, 'sw install: a cache store that cannot be listed does not stop the install');

  const offline = fakeCaches();
  await install(offline, { version: '1', site: v1 });
  const failed = await install(offline, { version: '2', site: v2, served: {} });
  assert(failed.error && !offline.stores.get('rplai-2')?.size && await textOf(offline, 'rplai-1', 'app.js') === 'app 1',
    'sw install: a file that cannot be fetched fails the install with nothing written, and the earlier cache stays');

  const stale = fakeCaches();
  const staleInstall = await install(stale, { version: '2', site: v2, served: { ...v2, 'app.js': 'app 1' } });
  const staleList = await listOf(stale, 'rplai-2');
  assert(!staleInstall.error && !('app.js' in staleList) && 'vendor/giac.wasm' in staleList, 'sw install: a fetched file that is not the listed version is cached but left off the list');
  const healed = await install(stale, { version: '3', site: v2 });
  assert(healed.fetches.join() === 'app.js' && await textOf(stale, 'rplai-3', 'app.js') === 'app 2', 'sw install: so the next install fetches that file again');

  const dev = fakeCaches();
  await install(dev, { version: '1', site: v1, hostname: 'localhost' });
  const devAgain = await install(dev, { version: '2', site: v2, hostname: 'localhost' });
  assert(devAgain.fetches.length === 3 && !dev.stores.get('rplai-2').has('./precache-hashes'), 'sw install: on localhost every file is fetched and no list is kept');
}

{
  const { BrowserGiacEngine } = await import('../www/src/rpl/cas/giac-engine.mjs');
  const scripts = [];
  globalThis.document = { createElement: () => ({ remove() { this.removed = true; } }), head: { appendChild: (script) => scripts.push(script) } };
  try {
    const engine = new BrowserGiacEngine();
    const lost = engine.init();
    scripts[0].onerror();
    const reason = await lost.then(() => null, (e) => e.message);
    assert(reason === 'Failed to load giacwasm.js' && engine.loadFailed() && !engine.isReady() && scripts[0].removed,
      'a Giac download that fails is reported, and its script is taken out of the page');
    const again = engine.init();
    assert(scripts.length === 2 && !engine.loadFailed() && engine.init() === again,
      'the next init() after a failed download starts it again, where it used to hand back the failure for the whole session, and shares the attempt in progress');
    globalThis.Module.cwrap = () => (cmd) => cmd;
    globalThis.Module.onRuntimeInitialized();
    await again;
    assert(engine.isReady() && !engine.loadFailed(), 'a retried download that succeeds leaves the engine ready');

    const aborted = new BrowserGiacEngine();
    const wasm = aborted.init();
    globalThis.Module.onAbort('no wasm binary');
    assert(await wasm.then(() => null, (e) => e.message) === 'Giac aborted: no wasm binary' && aborted.loadFailed() && aborted.init() !== wasm,
      'a wasm file that fails to arrive aborts the runtime, and that is a failed load too');
  } finally {
    delete globalThis.document;
    delete globalThis.Module;
    delete globalThis.UI;
  }
}
