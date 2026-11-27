/* Aggregate runner: runs every test file in its own Node process, so
   no file can see state another one left behind, and prints one
   headline line per file plus the combined total. */

import { spawn } from 'node:child_process';
import { availableParallelism } from 'node:os';
import { fileURLToPath } from 'node:url';

const FILES = [
  './test-helpers.mjs',
  './test-numerics.mjs',
  './test-comparisons.mjs',
  './test-variables.mjs',
  './test-eval.mjs',
  './test-control-flow.mjs',
  './test-binary-int.mjs',
  './test-time.mjs',
  './test-root.mjs',
  './test-tvm.mjs',
  './test-algebra.mjs',
  './test-entry.mjs',
  './test-matrix.mjs',
  './test-types.mjs',
  './test-types-wrappers.mjs',
  './test-types-exact.mjs',
  './test-types-cells.mjs',
  './test-lists.mjs',
  './test-reflection.mjs',
  './test-units.mjs',
  './test-ui.mjs',
  './test-op-search.mjs',
  './test-jordan-format.mjs',
  './test-jordan.mjs',
  './test-hp-text.mjs',
  './test-sheet.mjs',
  './test-xlsx.mjs',
  './test-latex.mjs',
  './test-stack-ops.mjs',
  './test-stats.mjs',
  './test-arrow-aliases.mjs',
  './test-chatbot-parse.mjs',
  './test-remote-llm.mjs',
  './test-command-reference.mjs',
  './test-scratch.mjs',
  './test-plot-engine.mjs',
  './test-equation-editor.mjs',
  './test-matrix-editor.mjs',
  './test-fonts.mjs',
  './test-offline.mjs',
  './test-actions.mjs',
  './test-errors.mjs',
];

function runFile(file) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [fileURLToPath(new URL(file, import.meta.url))]);
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('close', (code) => {
      const m = /^(\d+) passed, (\d+) failed$/m.exec(out);
      resolve({ file, out, err, code, passed: m ? +m[1] : 0, failed: m ? +m[2] : 0, crashed: !m || (code !== 0 && m[2] === '0') });
    });
  });
}

const pending = FILES.map(() => null);
let next = 0;
async function worker() {
  while (next < FILES.length) {
    const i = next++;
    pending[i] = await runFile(FILES[i]);
  }
}
await Promise.all(Array.from({ length: Math.min(availableParallelism(), FILES.length) }, worker));

for (const r of pending) {
  process.stdout.write(r.out);
  process.stderr.write(r.err);
}

console.log('\n' + '='.repeat(60));
console.log(' Per-file headline counts');
console.log('='.repeat(60));
const nameW = Math.max(...FILES.map(f => f.length));
for (const r of pending) {
  const tag = r.crashed ? 'DIED' : r.failed === 0 ? 'ok  ' : 'FAIL';
  console.log(` ${tag}  ${r.file.padEnd(nameW)}  ${String(r.passed).padStart(5)} passed  ${String(r.failed).padStart(3)} failed`);
}

const passed = pending.reduce((n, r) => n + r.passed, 0);
const failed = pending.reduce((n, r) => n + r.failed, 0);
const crashed = pending.filter(r => r.crashed);
for (const r of crashed) console.error(`${r.file} did not finish (exit code ${r.code})`);
const clean = failed === 0 && crashed.length === 0;
console.log(clean
  ? `\nALL TESTS PASSED (${passed})`
  : `\n${failed} FAILED (of ${passed + failed})${crashed.length ? ` + ${crashed.length} file(s) did not finish` : ''}`);
process.exitCode = clean ? 0 : 1;
