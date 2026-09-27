#!/usr/bin/env node
/* tests/flake-scan.mjs — Non-determinism detector for the RPL5050 test suite.

   The aggregator's module-side-effect architecture means two test files
   can leak shared state into each other's fixtures (angle mode, wordsize,
   binary-base override, halted slot, last-error slot, directory path,
   etc.).  A flake surfaces when the *order* the aggregator imports the
   files — normally deterministic — meets a per-file state-leak edge.

   Usage:

     node tests/flake-scan.mjs            # 10 runs, default
     node tests/flake-scan.mjs 20         # 20 runs
     node tests/flake-scan.mjs 5 --quiet  # 5 runs, hide per-run progress

   Exit 0 if every assertion label saw the same ok/FAIL outcome on every
   run (or if only one run happened).  Exit 2 if any assertion was
   non-deterministic (i.e., passed in some runs and failed in others,
   or the suite itself crashed mid-run in some runs and not others).
   Exit 1 if every run failed the same way (treated as a regression,
   not a flake — run `node tests/test-all.mjs` to see the full output).

   This file is standalone — NOT wired into test-all.mjs, NOT wired into
   any sanity pipeline.  It's meant to be invoked on demand by scheduled
   tasks or the unit-test lane to hunt ordering bugs.

   Design notes:
     · Each run spawns a fresh `node tests/test-all.mjs` child, so we
       get a clean module-state reset every iteration.  `node --import`
       won't work here — we WANT the cold-start boot to be part of the
       equation.
     · Captures combined stdout+stderr so a mid-run exception is
       visible in the report rather than silently dropped.
     · Per-run result is a Map<label, 'ok' | 'FAIL'>.  Tally any label
       that sees both outcomes across the full run set → report as
       flaky, with a count of each outcome.
     · Crashes are tallied separately: a run that crashed before
       completion is recorded as a "run crashed" event with its exit
       code, not as N failed assertions. */

import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const SUITE      = join(__dirname, 'test-all.mjs');

const argRuns = Number(process.argv.find(a => /^\d+$/.test(a))) || 10;
const QUIET   = process.argv.includes('--quiet');

function runOnce(idx) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const child = spawn(process.execPath, [SUITE], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    child.stdout.on('data', d => { out += d.toString(); });
    child.stderr.on('data', d => { out += d.toString(); });
    child.on('error', (e) => resolve({
      idx, exit: -1, elapsed: Date.now() - t0, out, crashed: true, errMsg: e.message,
    }));
    child.on('close', (code) => resolve({
      idx, exit: code ?? -1, elapsed: Date.now() - t0, out, crashed: code !== 0,
    }));
  });
}

/** Parse the ok/FAIL lines from a single run's output into a Map. */
function parseRun(out) {
  const results = new Map();  // label → 'ok' | 'FAIL'
  for (const line of out.split('\n')) {
    // aggregator format: "ok   <label>" or "FAIL: <label>"
    if (line.startsWith('ok   ')) {
      const label = line.slice(5).trim();
      // Flag duplicate-label collisions as a single entry — parseRun
      // prefers the stricter (FAIL) outcome if both appear in one run.
      if (results.get(label) !== 'FAIL') results.set(label, 'ok');
    } else if (line.startsWith('FAIL:')) {
      const label = line.slice(5).trim();
      results.set(label, 'FAIL');
    }
  }
  return results;
}

console.log(`flake-scan: running ${SUITE} ${argRuns} time(s)…`);

const runs = [];
for (let i = 0; i < argRuns; i++) {
  const r = await runOnce(i);
  runs.push({ ...r, results: parseRun(r.out) });
  if (!QUIET) {
    const tag = r.crashed ? `CRASH (exit ${r.exit})` : 'clean';
    const assertions = runs[i].results.size;
    console.log(`  run ${i + 1}/${argRuns}: ${tag}, ${assertions} assertion(s), ${r.elapsed} ms`);
  }
}

console.log('\n' + '='.repeat(70));
console.log(' Flake report');
console.log('='.repeat(70));

const crashes = runs.filter(r => r.crashed);
if (crashes.length > 0) {
  console.log(`\n  ${crashes.length}/${argRuns} run(s) crashed (non-zero exit):`);
  for (const c of crashes) {
    console.log(`    run ${c.idx + 1}: exit ${c.exit}, ${c.results.size} assertion(s) parsed before crash`);
    const lastLines = c.out.trim().split('\n').slice(-6);
    for (const l of lastLines) console.log(`      | ${l}`);
  }
}

// Per-label tally across all runs.
const tally = new Map();  // label → { ok: n, fail: n, missing: n }
const allLabels = new Set();
for (const r of runs) for (const k of r.results.keys()) allLabels.add(k);

for (const label of allLabels) {
  const t = { ok: 0, fail: 0, missing: 0 };
  for (const r of runs) {
    const v = r.results.get(label);
    if (v === 'ok') t.ok++;
    else if (v === 'FAIL') t.fail++;
    else t.missing++;
  }
  tally.set(label, t);
}

// Classify:
//   stable-ok      — always ok, always present
//   stable-fail    — always FAIL (regression, not flake)
//   flaky-ok/fail  — mix of ok and FAIL
//   flaky-missing  — sometimes present, sometimes missing (a crash
//                    mid-run can strand downstream assertions)
const flakyOutcome = [];
const flakyPresence = [];
let stableFail = 0;
let stableOk = 0;

for (const [label, t] of tally) {
  if (t.ok > 0 && t.fail > 0) flakyOutcome.push({ label, ...t });
  else if (t.missing > 0 && (t.ok > 0 || t.fail > 0)) flakyPresence.push({ label, ...t });
  else if (t.fail > 0) stableFail++;
  else stableOk++;
}

console.log(`\n  Summary across ${argRuns} run(s):`);
console.log(`    ${stableOk} assertion(s) stable-ok`);
console.log(`    ${stableFail} assertion(s) stable-fail (regression — NOT flake)`);
console.log(`    ${flakyOutcome.length} assertion(s) flaky-outcome (mixed ok/FAIL)`);
console.log(`    ${flakyPresence.length} assertion(s) flaky-presence (mid-run crash stranded them)`);

if (flakyOutcome.length > 0) {
  console.log('\n  Flaky-outcome assertions (most suspicious first — any mixed ok/FAIL):');
  flakyOutcome.sort((a, b) => Math.abs(b.ok - b.fail) - Math.abs(a.ok - a.fail));
  for (const { label, ok, fail, missing } of flakyOutcome) {
    console.log(`    [${ok} ok / ${fail} FAIL${missing ? ` / ${missing} miss` : ''}] ${label}`);
  }
}

if (flakyPresence.length > 0 && argRuns > 1) {
  console.log('\n  Flaky-presence assertions (seen in some runs, missing in others):');
  // Only show up to 20 to keep the report readable.
  for (const { label, ok, fail, missing } of flakyPresence.slice(0, 20)) {
    console.log(`    [${ok} ok / ${fail} FAIL / ${missing} miss] ${label}`);
  }
  if (flakyPresence.length > 20) {
    console.log(`    …and ${flakyPresence.length - 20} more.`);
  }
}

if (flakyOutcome.length === 0 && flakyPresence.length === 0 && stableFail === 0) {
  console.log(`\n  ✓ Fully deterministic: ${stableOk} assertions stable-ok across ${argRuns} run(s).`);
  process.exit(0);
}
if (flakyOutcome.length === 0 && flakyPresence.length === 0 && stableFail > 0) {
  console.log(`\n  ✗ ${stableFail} consistently-failing assertion(s) — this is a regression, not a flake.`);
  console.log('    Run `node tests/test-all.mjs` for full output.');
  process.exit(1);
}
console.log('\n  ✗ Non-determinism detected.  Next step: bisect by shuffling test-all.mjs import order.');
process.exit(2);
