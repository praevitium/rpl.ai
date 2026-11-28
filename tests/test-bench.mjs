// Every reference answer in the RPL benchmark leaves the stack its task expects.
import { loadTasks, checkTask } from '../scripts/check-bench.mjs';
import { assert } from './helpers.mjs';

const tasks = loadTasks();
const ids = new Set(tasks.map((t) => t.id));
assert(ids.size === tasks.length && tasks.every((t) => t.id && t.area && t.prompt && t.solution && Array.isArray(t.expect)),
  `bench: each of the ${tasks.length} tasks has a unique id, an area, a prompt, a solution and an expected stack`);
for (const task of tasks) {
  const { ok, got } = checkTask(task);
  assert(ok, `bench ${task.id}: ${task.solution} leaves ${JSON.stringify(task.expect)}${ok ? '' : `, not ${JSON.stringify(got)}`}`);
}
