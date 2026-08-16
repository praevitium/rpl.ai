/* Aggregate runner: imports every split test file and prints the
   combined pass/fail summary.

   A dynamic-import loop snapshots the shared pass/fail counters
   before and after each file and prints one headline line per file,
   giving per-file attribution on top of the aggregate total.

   Each dynamic import is wrapped in a try/catch so a file that throws
   at module-load time is reported with its filename and the remaining
   files still run — one crash does not knock out the aggregate. */

import { state } from './helpers.mjs';

const FILES = [
  './test-helpers.mjs',
  './test-numerics.mjs',
  './test-comparisons.mjs',
  './test-variables.mjs',
  './test-eval.mjs',
  './test-control-flow.mjs',
  './test-binary-int.mjs',
  './test-algebra.mjs',
  './test-entry.mjs',
  './test-matrix.mjs',
  './test-types.mjs',
  './test-lists.mjs',
  './test-reflection.mjs',
  './test-units.mjs',
  './test-ui.mjs',
  './test-op-search.mjs',
  './test-jordan-format.mjs',
  './test-stack-ops.mjs',
  './test-stats.mjs',
  './test-arrow-aliases.mjs',
  './test-chatbot-parse.mjs',
  './test-remote-llm.mjs',
  './test-llm-manager.mjs',
  './test-command-reference.mjs',
  './test-scratch.mjs',
];

const perFile = [];
const importErrors = [];

for (const f of FILES) {
  const beforePass = state.passed;
  const beforeFail = state.failed;
  try {
    await import(f);
  } catch (e) {
    importErrors.push({ file: f, err: e });
  }
  perFile.push({
    file: f,
    passed: state.passed - beforePass,
    failed: state.failed - beforeFail,
  });
}

console.log('\n' + '='.repeat(60));
console.log(' Per-file headline counts');
console.log('='.repeat(60));
// Width of the longest filename (trimmed of leading './') + a bit.
const nameW = Math.max(...perFile.map(r => r.file.length));
for (const r of perFile) {
  const tag = r.failed === 0 ? 'ok  ' : 'FAIL';
  console.log(` ${tag}  ${r.file.padEnd(nameW)}  ${String(r.passed).padStart(5)} passed  ${String(r.failed).padStart(3)} failed`);
}

if (importErrors.length) {
  console.error('\n' + '='.repeat(60));
  console.error(' Module-load failures');
  console.error('='.repeat(60));
  for (const { file, err } of importErrors) {
    console.error(` ${file}:`);
    console.error('   ' + (err && err.stack ? err.stack.split('\n').join('\n   ') : String(err)));
  }
}

const total = state.passed + state.failed;
const hasImportErr = importErrors.length > 0;
console.log(state.failed === 0 && !hasImportErr
  ? `\nALL TESTS PASSED (${state.passed})`
  : `\n${state.failed} FAILED (of ${total})${hasImportErr ? ` + ${importErrors.length} import error(s)` : ''}`);
process.exit(state.failed === 0 && !hasImportErr ? 0 : 1);
