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
  stack.replaceLevels(level, 1);
}

// The HP interactive stack's KEEP: levels 1 to level stay, everything above goes.
export function keepLevels(stack, level) {
  if (level < 1 || level > stack.depth) throw new Error('Too few arguments');
  if (level === stack.depth) return;
  stack.replaceLevels(stack.depth, stack.depth - level);
}

export function moveLevel(stack, from, to) {
  const depth = stack.depth;
  if (from < 1 || from > depth || to < 1 || to > depth) throw new Error('Too few arguments');
  if (from === to) return;
  stack.moveLevel(from, to);
}

export function replaceLevel(stack, level, values) {
  const depth = stack.depth;
  if (level < 1 || level > depth) throw new Error('Too few arguments');
  stack.replaceLevels(level, 1, values);
}
