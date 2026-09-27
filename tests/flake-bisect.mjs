#!/usr/bin/env node
/* tests/flake-bisect.mjs — Test-ordering bisection driver.

   Goal.  When `flake-scan.mjs` surfaces a non-deterministic assertion
   whose outcome depends on the import order, bisect on the ordering to
   find the minimal prefix of test files that still reproduces the
   observation.  Builds on `tests/run-order.mjs`, which lets us run
   the shared-counter aggregator with an arbitrary FILES list.

   Usage:

     node tests/flake-bisect.mjs --label "some tag"
     node tests/flake-bisect.mjs --label "…" --trials 8
     node tests/flake-bisect.mjs --label "…" --shuffles 20 --trials 6
     node tests/flake-bisect.mjs --label "…" --order a.mjs,b.mjs   # test a specific order directly

   Parameters:

     --label T       Assertion label to watch.  Reproduce = label is
                     missing OR FAIL in the output.  (Ordering flakes
                     often surface as a crash stranding every assertion
                     past that point.)
     --shuffles N    How many random orderings to try when hunting for
                     a reproducing order.  Default 12.
     --trials N      How many runs per candidate ordering (to defeat
                     timing jitter).  Default 4.  Bisect treats the
                     ordering as a reproducer if ANY trial reproduces.
     --order a,b,…   Skip the hunt; use this order as the starting
                     reproducer and bisect directly.  Filenames are
                     dot-slash-relative to tests/ (same as test-all).

   Algorithm:

     1. Hunt phase — try up to `--shuffles` random full-set orderings.
        For each, run the suite `--trials` times.  Stop on the first
        order where ANY trial reproduces the flake.
     2. If hunt fails → exit 3 "could not reproduce; try more shuffles
        or a larger --trials value".
     3. Bisect phase — given a reproducing order O of length N, find
        the smallest k such that O[0..k] still reproduces.  Linear
        shrink first (try k = N, N-1, N-2, …) to minimize work when
        the prefix is long; fall back to binary search once the
        linear shrink stalls.
     4. Report the minimal prefix + the trial counts that pinned it. */

import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const RUNNER     = join(__dirname, 'run-order.mjs');

const argv = process.argv.slice(2);
function getArg(name, def) {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : def;
}

const LABEL    = getArg('--label', null);
const SHUFFLES = Number(getArg('--shuffles', '12'));
const TRIALS   = Number(getArg('--trials', '4'));
const ORDER    = getArg('--order', null);
const QUIET    = argv.includes('--quiet');

if (!LABEL) {
  console.error('flake-bisect: --label <assertion-label> is required.');
  console.error('  Example: --label "some tag"');
  process.exit(64);
}

/** Fire one run with the given FILES list.  Returns a record with
 *  the captured output and a classification of the watched label. */
function runOnce(files) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const child = spawn(process.execPath, [RUNNER, ...files], {
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: __dirname,
    });
    let out = '';
    child.stdout.on('data', d => { out += d.toString(); });
    child.stderr.on('data', d => { out += d.toString(); });
    child.on('error', (e) => resolve({
      exit: -1, elapsed: Date.now() - t0, out, crashed: true, errMsg: e.message,
    }));
    child.on('close', (code) => resolve({
      exit: code ?? -1, elapsed: Date.now() - t0, out, crashed: code !== 0,
    }));
  });
}

/** Classify a run's output with respect to the watched label.
 *   'ok'      — label appeared on an `ok` line.
 *   'FAIL'    — label appeared on a `FAIL:` line.
 *   'missing' — label not present (often because a mid-run crash
 *               stranded everything downstream).
 */
function classify(out, label) {
  const okLine   = `ok   ${label}`;
  const failLine = `FAIL: ${label}`;
  if (out.includes(failLine)) return 'FAIL';
  if (out.includes(okLine))   return 'ok';
  return 'missing';
}

/** Does this order reproduce the flake under at least one of `trials` runs?
 *  Reproduces ⇔ the label comes back as 'FAIL' or 'missing' on some trial. */
async function reproducesFlake(files, trials) {
  const outcomes = [];
  for (let i = 0; i < trials; i++) {
    const r = await runOnce(files);
    outcomes.push(classify(r.out, LABEL));
    if (outcomes[i] !== 'ok') {
      return { reproduced: true, outcomes, trialsRun: i + 1 };
    }
  }
  return { reproduced: false, outcomes, trialsRun: trials };
}

/** Read the FILES list from test-all.mjs.  Same idea as run-order. */
function readTestAllFiles() {
  const src = (require('node:fs')).readFileSync(__dirname + '/test-all.mjs', 'utf8');
  const m = src.match(/const FILES = \[([\s\S]*?)\];/);
  if (!m) throw new Error('flake-bisect: could not locate FILES in test-all.mjs');
  return [...m[1].matchAll(/'([^']+)'/g)].map(r => r[1]);
}
// ESM: synthesize a classic require for the helper above.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

function shuffled(list) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function huntReproducer(allFiles, shuffles, trials) {
  console.log(`flake-bisect: hunting for a reproducing order (up to ${shuffles} shuffles × ${trials} trials each)…`);
  // First try the declared order as-is — cheapest possible.
  const declared = await reproducesFlake(allFiles, trials);
  if (declared.reproduced) {
    console.log(`  declared order reproduces on trial ${declared.trialsRun}: outcomes=${declared.outcomes.join(',')}`);
    return allFiles;
  }
  for (let i = 0; i < shuffles; i++) {
    const order = shuffled(allFiles);
    const r = await reproducesFlake(order, trials);
    if (!QUIET) {
      console.log(`  shuffle ${i + 1}/${shuffles}: outcomes=${r.outcomes.join(',')}${r.reproduced ? ' ← REPRODUCED' : ''}`);
    }
    if (r.reproduced) return order;
  }
  return null;
}

async function bisectPrefix(order, trials) {
  // Linear shrink from the tail.  For each k from N-1 down to 1, check
  // whether O[0..k] still reproduces.  The smallest k that does is the
  // answer.  This is O(N) subprocess launches in the worst case, which
  // for N=18 files × 4 trials is under a minute — good enough.
  let best = order.slice();
  console.log(`\nflake-bisect: bisecting on prefix length (starting from ${best.length})…`);
  for (let k = best.length - 1; k >= 1; k--) {
    const candidate = best.slice(0, k);
    const r = await reproducesFlake(candidate, trials);
    if (!QUIET) {
      const last = candidate[candidate.length - 1];
      console.log(`  prefix of ${k} (…${last}): outcomes=${r.outcomes.join(',')}${r.reproduced ? ' ← still reproduces' : ''}`);
    }
    if (!r.reproduced) {
      // Can't shrink below k; the file at index k is load-bearing.
      return best.slice(0, k + 1);
    }
    best = candidate;
  }
  return best;
}

const ALL_FILES = ORDER
  ? ORDER.split(',').map(s => s.trim())
  : readTestAllFiles();

let reproducer;
if (ORDER) {
  console.log(`flake-bisect: using provided order of ${ALL_FILES.length} files`);
  const r = await reproducesFlake(ALL_FILES, TRIALS);
  if (!r.reproduced) {
    console.log(`  provided order did NOT reproduce under ${TRIALS} trials: outcomes=${r.outcomes.join(',')}`);
    console.log(`  (try increasing --trials or falling back to the hunt by omitting --order)`);
    process.exit(3);
  }
  reproducer = ALL_FILES;
} else {
  reproducer = await huntReproducer(ALL_FILES, SHUFFLES, TRIALS);
  if (!reproducer) {
    console.log(`\nflake-bisect: could not reproduce under ${SHUFFLES} shuffle(s) × ${TRIALS} trial(s).`);
    console.log(`  (If the flake has a timing component, try --shuffles 40 --trials 10.)`);
    console.log(`  (If the label is misspelled, the label never matches any line → misses count as reproduces.)`);
    process.exit(3);
  }
}

const minimal = await bisectPrefix(reproducer, TRIALS);

console.log('\n' + '='.repeat(70));
console.log(' Bisection result');
console.log('='.repeat(70));
console.log(`  Label: ${LABEL}`);
console.log(`  Minimal reproducing prefix (${minimal.length} file${minimal.length === 1 ? '' : 's'}):`);
for (const f of minimal) console.log(`    ${f}`);
console.log('\n  Rerun with:');
console.log(`    node tests/flake-bisect.mjs --label ${JSON.stringify(LABEL)} --order ${minimal.join(',')}`);
process.exit(0);
