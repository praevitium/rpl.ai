/* Shared test helpers — assertion + fail counter + common utilities.
   Each split test file imports `assert` from here and bumps the same
   shared counter.  test-all.mjs reads `state.failed` at the end to
   print the aggregate result and exit with a non-zero code on any
   failure.

   Helpers provided:
     - `assertThrows(fn, pattern, msg)` — wraps the common
       `let threw = false; try { … } catch (e) { threw = /…/.test(...) }`
       pattern.
     - `rplEqual(a, b)` — deep structural equality for RPL value shapes,
       shared across test files.
     - `runOp(opName, ...preStack)` — create a fresh Stack, push the
       pre-stack in order (level-k pushed k-th → ends up on top-of-stack
       last, matching RPL convention), run the op, return `peek()`. */

export const state = { failed: 0, passed: 0 };

export function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); state.failed++; }
  else { console.log('ok  ', msg); state.passed++; }
}

/**
 * Assert that `fn()` throws an Error whose message matches `pattern`.
 *
 *   pattern — either a RegExp, a string (substring match), or a
 *             `null`/`undefined` (any throw counts).
 *   msg     — label printed in the ok/FAIL line.
 *
 * Returns the caught error so callers can make secondary assertions.
 */
export function assertThrows(fn, pattern, msg) {
  let threw = false;
  let caught = null;
  try { fn(); }
  catch (e) {
    caught = e;
    if (pattern == null) threw = true;
    else if (pattern instanceof RegExp) threw = pattern.test(e.message);
    else threw = String(e.message).includes(String(pattern));
  }
  assert(threw, msg);
  return caught;
}

/**
 * Deep structural equality for RPL value shapes emitted by the ops
 * layer.  Used by tests that want to compare a computed result to an
 * expected value without pulling in a full equality op.
 *
 * Covers every type currently constructed in `src/rpl/types.js`:
 * real, integer, binaryInteger, complex, string, name, symbolic,
 * tagged, vector, matrix, list, unit, program.  Directory equality is
 * identity-only (mutable containers), and Grob is compared by JSON.
 *
 * This is deliberately NOT the `==` / `SAME` semantics — it's a test
 * helper, not an op.  It answers "did the implementation return the
 * value I expected?", not "what would HP50's SAME return?".
 */
export function rplEqual(a, b) {
  if (a === b) return true;
  if (!a || !b || a.type !== b.type) return false;
  switch (a.type) {
    case 'integer':        return a.value === b.value;
    // Real stores a Decimal instance — compare with .eq() so 0.1 + 0.2
    // compares equal to 0.3 (same Decimal value, different instance).
    case 'real':           return a.value.eq(b.value);
    case 'binaryInteger':  return a.value === b.value && a.base === b.base;
    case 'complex':        return a.re === b.re && a.im === b.im;
    case 'string':         return a.value === b.value;
    case 'name':           return a.id === b.id && !!a.quoted === !!b.quoted
                                && !!a.local === !!b.local;
    case 'symbolic':       return JSON.stringify(a.expr) === JSON.stringify(b.expr);
    case 'tagged':         return a.tag === b.tag && rplEqual(a.value, b.value);
    case 'vector':
      if (a.items.length !== b.items.length) return false;
      for (let i = 0; i < a.items.length; i++) {
        if (!rplEqual(a.items[i], b.items[i])) return false;
      }
      return true;
    case 'matrix':
      if (a.rows.length !== b.rows.length) return false;
      for (let i = 0; i < a.rows.length; i++) {
        if (a.rows[i].length !== b.rows[i].length) return false;
        for (let j = 0; j < a.rows[i].length; j++) {
          if (!rplEqual(a.rows[i][j], b.rows[i][j])) return false;
        }
      }
      return true;
    case 'list':
      if (a.items.length !== b.items.length) return false;
      for (let i = 0; i < a.items.length; i++) {
        if (!rplEqual(a.items[i], b.items[i])) return false;
      }
      return true;
    case 'program':
      if (a.tokens.length !== b.tokens.length) return false;
      for (let i = 0; i < a.tokens.length; i++) {
        if (!rplEqual(a.tokens[i], b.tokens[i])) return false;
      }
      return true;
    case 'unit':
      return a.value === b.value
          && JSON.stringify(a.uexpr) === JSON.stringify(b.uexpr);
    case 'directory':      return a === b;  // reference equality only
    default:
      return JSON.stringify(a) === JSON.stringify(b);
  }
}

/**
 * Convenience: create a fresh Stack, push `preStack` in argument
 * order (so `runOp('+', Real(1), Real(2))` results in `2` on top
 * before the op runs), run the op by registered name, return the
 * resulting top-of-stack value.
 *
 * Returns `undefined` on empty post-op stack.  Re-throws ops errors
 * so the caller can wrap in `assertThrows` / inspect.
 *
 * Imports `Stack` and `lookup` via the callers' module namespace; we
 * import them here directly to keep call sites terse.
 */
import { Stack } from '../www/src/rpl/stack.js';
import { lookup } from '../www/src/rpl/ops.js';
export function runOp(opName, ...preStack) {
  const s = new Stack();
  for (const v of preStack) s.push(v);
  lookup(opName).fn(s);
  return s.depth === 0 ? undefined : s.peek();
}

/**
 * Like `runOp`, but returns the full post-op stack as an array.
 *
 * The returned array mirrors `Stack.snapshot()`: **level-1 first**
 * (index 0), so `result[0]` is what sits on top of the stack,
 * `result[result.length - 1]` is what sits at the bottom.  This
 * matches the order the HP50 display shows from top to bottom.
 *
 * Use when the op produces >1 result (OBJ→, DIV2, →HMS, etc.) and
 * you want to assert the whole shape.
 */
export function runOpStack(opName, ...preStack) {
  const s = new Stack();
  for (const v of preStack) s.push(v);
  lookup(opName).fn(s);
  return s.snapshot();
}
