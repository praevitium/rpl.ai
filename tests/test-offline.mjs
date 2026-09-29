import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assert } from './helpers.mjs';
import { precacheFiles, precacheVersion } from '../scripts/gen-precache.mjs';

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
