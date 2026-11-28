// Checks the RPL benchmark's reference answers: each task's solution runs from a fresh calculator, after its setup line, and
// must leave exactly the stack the task expects, as the display shows it, bottom level first.
//   npm run bench
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { Stack } from '../www/src/rpl/stack.js';
import { lookup } from '../www/src/rpl/ops.js';
import { parseEntry } from '../www/src/rpl/parser.js';
import { format } from '../www/src/rpl/formatter.js';
import { resetAll } from '../www/src/rpl/state.js';

export const TASKS_URL = new URL('../bench/rpl-tasks.json', import.meta.url);

// A line run as the command line runs it: a bare command runs, a bare name evaluates, anything else is pushed.
function runLine(src, stack) {
  for (const v of parseEntry(src)) {
    if (v?.type !== 'name' || v.quoted) { stack.push(v); continue; }
    if (!lookup(v.id)) stack.push(v);
    lookup(lookup(v.id) ? v.id : 'EVAL').fn(stack);
  }
}

export function runTask({ setup = '', solution }) {
  resetAll();
  const stack = new Stack();
  try {
    if (setup) runLine(setup, stack);
    runLine(solution, stack);
    return { levels: stack.snapshot().reverse().map((v) => format(v)) };
  } catch (e) {
    return { error: e.message };
  }
}

export function checkTask(task) {
  const { levels, error } = runTask(task);
  const ok = !error && JSON.stringify(levels) === JSON.stringify(task.expect);
  return { ok, got: error ? `error: ${error}` : levels };
}

export function loadTasks() {
  return JSON.parse(readFileSync(TASKS_URL, 'utf8'));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const tasks = loadTasks();
  const failed = tasks.map((task) => ({ task, ...checkTask(task) })).filter((r) => !r.ok);
  for (const { task, got } of failed) console.log(`${task.id}: expected ${JSON.stringify(task.expect)}, got ${JSON.stringify(got)}`);
  console.log(`${tasks.length - failed.length} of ${tasks.length} reference answers check out.`);
  process.exitCode = failed.length ? 1 : 0;
}
