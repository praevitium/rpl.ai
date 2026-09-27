/* =================================================================
   Scratch (dry-run) evaluation for the AI assistant.

   Runs an RPL line exactly the way ENTER would — literals push, bare
   names that resolve to ops execute — but against a throwaway Stack
   seeded with a copy of the live one, inside withScratchState so any
   STO / mode change / flag flip is rolled back afterwards.  The
   assistant uses this to compute intermediate values, preview what a
   proposed `run` would do, and catch parse / argument errors before
   asking the user to confirm anything.
   ================================================================= */

import { Stack, RPLError } from './stack.js';
import { parseEntry } from './parser.js';
import { lookup } from './ops.js';
import { withScratchState } from './state.js';
import { format } from './formatter.js';

/** Evaluate `text` on a scratch copy of `liveItems` (bottom-first, as
 *  Stack.save() returns).  Resolves to
 *    { ok: true,  stack: string[], depth }   formatted, level 1 first
 *    { ok: false, error }
 *  Never throws for RPL errors; only a broken caller contract does. */
export function evalScratch(text, { liveItems = [], displayOpts, maxLevels = 8 } = {}) {
  const stack = new Stack();
  stack.restore(liveItems);
  return withScratchState(() => {
    try {
      const values = parseEntry(String(text ?? ''));
      for (const v of values) {
        const op = (v?.type === 'name' && !v.quoted) ? lookup(v.id) : null;
        if (op) {
          try {
            stack.runOp(() => op.fn(stack));
          } catch (e) {
            const msg = (e && typeof e === 'object' && e.message != null) ? e.message : String(e);
            throw new RPLError(`${v.id}: ${msg}`);
          }
        } else {
          stack.push(v);
        }
      }
      return {
        ok: true,
        stack: stack.snapshot().slice(0, maxLevels).map((v) => format(v, displayOpts)),
        depth: stack.depth,
      };
    } catch (e) {
      const error = (e && typeof e === 'object' && e.message != null) ? String(e.message) : String(e);
      return { ok: false, error };
    }
  });
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
    stack.runOp(() => op.fn(stack));
  } catch (e) {
    return { ok: false, error: (e && typeof e === 'object' && e.message != null) ? String(e.message) : String(e) };
  }
  const after = stack.save();
  let kept = 0;
  while (kept < liveItems.length && kept < after.length && liveItems[kept] === after[kept]) kept++;
  return { ok: true, consumed: liveItems.length - kept, results: after.slice(kept) };
}
