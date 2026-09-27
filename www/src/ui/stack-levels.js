export function clampLevel(level, depth) {
  if (depth <= 0) return 0;
  if (level < 1) return 1;
  if (level > depth) return depth;
  return Math.trunc(level);
}

export function rollLevel(stack, level) {
  moveLevel(stack, level, 1);
}

export function rollDownToLevel(stack, level) {
  moveLevel(stack, 1, level);
}

export function dropLevel(stack, level) {
  const depth = stack.depth;
  if (level < 1 || level > depth) throw new Error('Too few arguments');
  stack._items.splice(stack._items.length - level, 1);
  stack._emit();
}

export function moveLevel(stack, from, to) {
  const depth = stack.depth;
  if (from < 1 || from > depth || to < 1 || to > depth) throw new Error('Too few arguments');
  if (from === to) return;
  const [v] = stack._items.splice(stack._items.length - from, 1);
  stack._items.splice(stack._items.length - (to - 1), 0, v);
  stack._emit();
}

export function replaceLevel(stack, level, values) {
  const depth = stack.depth;
  if (level < 1 || level > depth) throw new Error('Too few arguments');
  const at = stack._items.length - level;
  stack._items.splice(at, 1, ...values);
  stack._emit();
}
