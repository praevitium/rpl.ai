/* Level-addressed stack edits for the selected-level actions.  They
   work on any object with an `_items` array plus `_emit` — the Stack
   class satisfies this, and a plain test double can too. */

export function clampLevel(level, depth) {
  if (depth <= 0) return 0;
  if (level < 1) return 1;
  if (level > depth) return depth;
  return Math.trunc(level);
}

/** ROLL: move the value at level N to level 1. */
export function rollLevel(stack, level) {
  moveLevel(stack, level, 1);
}

/** ROLLD: move the value at level 1 to level N. */
export function rollDownToLevel(stack, level) {
  moveLevel(stack, 1, level);
}

export function dropLevel(stack, level) {
  const depth = stack.depth;
  if (level < 1 || level > depth) throw new Error('Too few arguments');
  stack._items.splice(stack._items.length - level, 1);
  stack._emit();
}

/** Move the value at level `from` so it ends up at level `to`. */
export function moveLevel(stack, from, to) {
  const depth = stack.depth;
  if (from < 1 || from > depth || to < 1 || to > depth) throw new Error('Too few arguments');
  if (from === to) return;
  const [v] = stack._items.splice(stack._items.length - from, 1);
  stack._items.splice(stack._items.length - (to - 1), 0, v);
  stack._emit();
}

/** Replace the value at `level` with `values` (in push order), so the
 *  last of them lands at `level`. */
export function replaceLevel(stack, level, values) {
  const depth = stack.depth;
  if (level < 1 || level > depth) throw new Error('Too few arguments');
  const at = stack._items.length - level;
  stack._items.splice(at, 1, ...values);
  stack._emit();
}
