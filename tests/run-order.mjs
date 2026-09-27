#!/usr/bin/env node
/* tests/run-order.mjs — Variant test aggregator that takes the FILES
   list from argv instead of hard-coding it.

   Sibling to `tests/test-all.mjs`: identical per-file dynamic-import
   loop and shared-state contract, only the `FILES` source differs.
   Used by `tests/flake-bisect.mjs` to spawn the suite under an
   arbitrary import order without mutating `test-all.mjs` each trial.

   Usage:

     node tests/run-order.mjs ./test-numerics.mjs ./test-control-flow.mjs
     node tests/run-order.mjs --from-test-all           # same set as test-all, in declared order
     node tests/run-order.mjs --from-test-all --shuffle # same set, shuffled (non-seeded)

   The paths are resolved RELATIVE TO THIS FILE (i.e. the `tests/`
   directory), matching `test-all.mjs`'s dot-slash notation.

   Exit 0 on all-pass AND no import errors.  Exit 1 on any assertion
   failure OR any import error (matches `test-all.mjs`).  Prints
   `FLAKE_BISECT_ORDER: file1,file2,…` on stdout so the driver can
   round-trip the exact order that produced the observed outcome. */

import { state } from './helpers.mjs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

/** Parse the `FILES` array out of test-all.mjs by static scan.
 *  We deliberately do NOT import test-all.mjs — importing it would
 *  execute the full suite under the declared order, which is exactly
 *  what we're trying to bypass. */
function readTestAllFiles() {
  const src = readFileSync(__dirname + '/test-all.mjs', 'utf8');
  const m = src.match(/const FILES = \[([\s\S]*?)\];/);
  if (!m) throw new Error('run-order: could not locate FILES in test-all.mjs');
  return [...m[1].matchAll(/'([^']+)'/g)].map(r => r[1]);
}

const argv = process.argv.slice(2);
let files = [];
let shuffle = false;
for (const a of argv) {
  if (a === '--from-test-all') files = readTestAllFiles();
  else if (a === '--shuffle')   shuffle = true;
  else if (a.startsWith('--'))  throw new Error(`run-order: unknown flag ${a}`);
  else                          files.push(a);
}
if (files.length === 0) files = readTestAllFiles();
if (shuffle) {
  // Fisher-Yates.  NOT seeded — flake-bisect seeds via node's Math.random
  // override in a subprocess if it needs reproducibility.
  for (let i = files.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [files[i], files[j]] = [files[j], files[i]];
  }
}

const importErrors = [];
for (const f of files) {
  try { await import(f); }
  catch (e) { importErrors.push({ file: f, err: e }); }
}

// Marker line — bisection driver parses this.
console.log(`FLAKE_BISECT_ORDER: ${files.join(',')}`);

if (importErrors.length) {
  console.error('Module-load failures:');
  for (const { file, err } of importErrors) {
    console.error(`  ${file}: ${err && err.message ? err.message : String(err)}`);
  }
}

console.log(state.failed === 0 && importErrors.length === 0
  ? `ALL TESTS PASSED (${state.passed})`
  : `${state.failed} FAILED (of ${state.passed + state.failed})${importErrors.length ? ` + ${importErrors.length} import error(s)` : ''}`);
process.exit(state.failed === 0 && importErrors.length === 0 ? 0 : 1);
