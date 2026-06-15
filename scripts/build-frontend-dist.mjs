#!/usr/bin/env node
/* Used as Tauri's beforeBuildCommand / beforeDevCommand so that local
   model weights downloaded for development don't end up in the
   production bundle.  Run from the project root. */
import { cpSync, rmSync, mkdirSync } from 'node:fs';
import { join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root      = join(fileURLToPath(import.meta.url), '..', '..');
const src       = join(root, 'www');
const dst       = join(root, 'www-dist');
const modelsDir = join(src, 'models');

rmSync(dst, { recursive: true, force: true });
mkdirSync(dst);

cpSync(src, dst, {
  recursive: true,
  filter: (s) => s !== modelsDir && !s.startsWith(modelsDir + sep),
});

console.log('[build-frontend-dist] www-dist/ ready (models/ excluded)');
