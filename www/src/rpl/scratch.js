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
