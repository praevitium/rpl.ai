import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const EXCLUDED = [
  /(^|\/)(README|LICENSE)[^/]*$/i,
  /(^|\/)package\.json$/,
  /\.map$/,
  /^vendor\/codemirror\/src-entry\.mjs$/,
  /^sw\.js$/,
  /^precache\.js$/,
  /(^|\/)\./,
];

function walk(dir, prefix = '') {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const rel = prefix ? `${prefix}/${d.name}` : d.name;
    return d.isDirectory() ? walk(join(dir, d.name), rel) : [rel];
  });
}

export function precacheFiles(wwwDir) {
  return walk(wwwDir).filter((f) => !EXCLUDED.some((re) => re.test(f))).sort();
}

export function precacheVersion(wwwDir, files, label) {
  const hash = createHash('sha256');
  for (const f of files) hash.update(f).update(readFileSync(join(wwwDir, f)));
  return `${label}-${hash.digest('hex').slice(0, 10)}`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const www = resolve(fileURLToPath(new URL('../www/', import.meta.url)));
  const files = precacheFiles(www);
  const { FULL } = await import(new URL('../www/src/build-info.js', import.meta.url));
  const version = precacheVersion(www, files, FULL);
  writeFileSync(join(www, 'precache.js'), `self.PRECACHE = ${JSON.stringify({ version, files: ['./', ...files] }, null, 1)};\n`);
  process.stdout.write(`precache: ${files.length} files, ${version}\n`);
}
