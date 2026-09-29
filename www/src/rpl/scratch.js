/* Dry runs for the AI assistant: an RPL line runs exactly as ENTER would,
   on a copy of the live stack, and every STO, mode change and flag flip
   is rolled back afterwards. */

import { Stack, RPLError, RPLAbort, RPLInterrupt, withTimeLimit, RUN_TIME_LIMIT_MS } from './stack.js';
import { parseEntry } from './parser.js';
import { lookup } from './ops.js';
import { withScratchState } from './state.js';
import { format } from './formatter.js';
import { withoutCas } from './cas/giac-engine.mjs';

const PREVIEW_TIME_LIMIT_MS = 150;

const errorText = (e) => ((e && typeof e === 'object' && e.message != null) ? String(e.message) : String(e));

// Like Entry._runOpTagged: errors carry the command name, but ABORT passes through untouched.
function runTagged(stack, name, op) {
  try {
    stack.runOp(() => op.fn(stack));
  } catch (e) {
    if (e instanceof RPLAbort) throw e;
    throw new RPLError(`${name}: ${errorText(e)}`);
  }
}

/** Resolves to { ok: true, stack: formatted strings (level 1 first), depth }
 *  or { ok: false, error }.  `liveItems` is bottom-first, as Stack.save() returns. */
export function evalScratch(text, { liveItems = [], displayOpts, maxLevels = 8 } = {}) {
  const stack = new Stack();
  stack.restore(liveItems);
  const result = () => ({
    ok: true,
    stack: stack.snapshot().slice(0, maxLevels).map((v) => format(v, displayOpts)),
    depth: stack.depth,
  });
  return withScratchState(() => withTimeLimit(RUN_TIME_LIMIT_MS, () => {
    try {
      for (const v of parseEntry(String(text ?? ''))) {
        const bare = v?.type === 'name' && !v.quoted;
        const op = bare ? lookup(v.id) : null;
        if (!op) stack.push(v);
        if (bare) runTagged(stack, v.id, op ?? lookup('EVAL'));
      }
      return result();
    } catch (e) {
      // The entry line treats ABORT as a notice, not an error, and keeps the stack it left.
      if (e instanceof RPLAbort) return result();
      return { ok: false, error: errorText(e) };
    }
  }));
}

const STATE_READ_ONLY_CATEGORIES = new Set([
  'Stack', 'Arithmetic', 'Trig / log / exp / hyperbolic', 'Complex / coordinates',
  'Comparisons / logic', 'Integer / number theory', 'Special functions',
  'Vectors / matrices', 'Lists / strings', 'Units', 'Types & tags',
]);
const WRITES_STATE_OR_RANDOM = new Set([
  'UNDO', 'REDO', 'LASTSTACK', 'LASTARG', 'LAST', 'RAND', 'RDZ', 'RANM',
  'DEG', 'RAD', 'GRAD', 'GRD', 'RECT', 'CYLIN', 'SPHERE', 'CMPLX', 'MODSTO',
]);

export function isPreviewable(name) {
  const op = lookup(name);
  return !!op && STATE_READ_ONLY_CATEGORIES.has(op.category) && !WRITES_STATE_OR_RANDOM.has(String(name).toUpperCase());
}

export function previewCommand(name, liveItems = []) {
  if (!isPreviewable(name)) return null;
  const op = lookup(name);
  const stack = new Stack();
  stack.restore(liveItems);
  try {
    withoutCas(() => withTimeLimit(PREVIEW_TIME_LIMIT_MS, () => stack.runOp(() => op.fn(stack))));
  } catch (e) {
    if (e instanceof RPLInterrupt) return null;
    return { ok: false, error: errorText(e) };
  }
  const after = stack.save();
  let kept = 0;
  while (kept < liveItems.length && kept < after.length && liveItems[kept] === after[kept]) kept++;
  return { ok: true, consumed: liveItems.length - kept, results: after.slice(kept) };
}
