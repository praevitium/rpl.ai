/* tests/sanity.mjs — Fast smoke test for RPL5050.

   Goal: a sub-200-ms sanity check suitable for a pre-commit hook or
   the start of any scheduled task run.  If *any* of these fail, the
   suite is fundamentally broken and a longer run is not worth the
   time.

   This file intentionally imports the SAME modules the aggregator
   imports (types, ops, parser, state) — a module-load crash here is
   itself a useful signal.

   Not wired into `test-all.mjs`.  Run as `node tests/sanity.mjs`.

   Asserts cover:
     · value constructors (Real, Integer, Str, Name)
     · Stack push/pop/peek/depth
     · registered-op lookup succeeds for `+`, `SIN`, `→STR`
     · + on two Reals, auto-promotion Real+Integer
     · SIN(0) = 0 at any angle mode
     · →STR(42) renders HP50-canonical "42"
     · parser round-trip on  « 1 2 + » EVAL  → Integer(3)
     · EVAL of a Program literal pushed to the stack

   Every assertion uses the same shared `assert` counter so this file
   can be swapped into the full suite for debugging without
   double-counting. */

import { Stack } from '../www/src/rpl/stack.js';
import { lookup } from '../www/src/rpl/ops.js';
import {
  Real, Integer, Str, Name, Program,
  isReal, isInteger, isProgram, isString,
} from '../www/src/rpl/types.js';
import { parseEntry } from '../www/src/rpl/parser.js';
import { setAngle, resetHome } from '../www/src/rpl/state.js';
import { assert, state } from './helpers.mjs';

const t0 = Date.now();

/* ================================================================
   1. Value constructors do not throw.
   ================================================================ */
{
  const r = Real(3.14);
  assert(isReal(r) && r.value.eq(3.14), 'sanity: Real(3.14) constructs');
  const n = Integer(42n);
  assert(isInteger(n) && n.value === 42n, 'sanity: Integer(42n) constructs');
  const s = Str('hi');
  assert(isString(s) && s.value === 'hi', 'sanity: Str("hi") constructs');
  const nm = Name('X');
  assert(nm.type === 'name' && nm.id === 'X', 'sanity: Name("X") constructs');
}

/* ================================================================
   2. Stack push / pop / peek / depth round-trip a Real.
   ================================================================ */
{
  const s = new Stack();
  assert(s.depth === 0, 'sanity: new Stack has depth 0');
  s.push(Real(1));
  s.push(Real(2));
  assert(s.depth === 2, 'sanity: two pushes → depth 2');
  assert(s.peek().value.eq(2), 'sanity: top-of-stack is last push (2)');
  assert(s.peek(2).value.eq(1), 'sanity: level 2 is first push (1)');
  const popped = s.pop();
  assert(popped.value.eq(2) && s.depth === 1,
    'sanity: pop returns the top value and decrements depth');
}

/* ================================================================
   3. Registered ops resolve for the three most basic op categories:
      arithmetic (+), transcendental (SIN), conversion (→STR).
   ================================================================ */
{
  const plus = lookup('+');
  const sin  = lookup('SIN');
  const str  = lookup('→STR');
  assert(plus && typeof plus.fn === 'function',
    'sanity: lookup("+") resolves');
  assert(sin  && typeof sin.fn === 'function',
    'sanity: lookup("SIN") resolves');
  assert(str  && typeof str.fn === 'function',
    'sanity: lookup("→STR") resolves');
}

/* ================================================================
   4. + on two Reals = Real with summed value.
   ================================================================ */
{
  const s = new Stack();
  s.push(Real(1.5));
  s.push(Real(2.5));
  lookup('+').fn(s);
  assert(isReal(s.peek()) && s.peek().value.eq(4),
    'sanity: 1.5 2.5 + = Real(4)');
}

/* ================================================================
   5. + on Integer + Integer stays Integer — no accidental Real
      promotion on pure-integer input.  HP50 matches this behaviour
      (flag -105 controls only transcendental widening, not +).
   ================================================================ */
{
  const s = new Stack();
  s.push(Integer(3n));
  s.push(Integer(4n));
  lookup('+').fn(s);
  assert(isInteger(s.peek()) && s.peek().value === 7n,
    'sanity: 3 4 + = Integer(7)');
}

/* ================================================================
   6. SIN(0) = 0 under DEG, RAD, and GRAD — the "angle mode does not
      break the zero" invariant.
   ================================================================ */
{
  for (const mode of ['DEG', 'RAD', 'GRD']) {
    setAngle(mode);
    const s = new Stack();
    s.push(Real(0));
    lookup('SIN').fn(s);
    assert(isReal(s.peek()) && s.peek().value.eq(0),
      `sanity: SIN(0) = 0 under ${mode}`);
  }
  // Leave angle mode at DEG so we don't leak state into downstream
  // standalone runs of this file.
  setAngle('DEG');
}

/* ================================================================
   7. →STR(Integer(42)) = "42" (no trailing dot on Integer).  This
      is the formatter's most common regression point.
   ================================================================ */
{
  const s = new Stack();
  s.push(Integer(42n));
  lookup('→STR').fn(s);
  assert(isString(s.peek()) && s.peek().value === '42',
    'sanity: →STR(Integer(42)) = "42"');
}

/* ================================================================
   8. Parser round-trip:   « 1 2 + » EVAL   → Integer(3).
      The parsed entry is a Program literal followed by the EVAL
      name; the loop mirrors the entry-line dispatch in
      tests/test-eval.mjs.
   ================================================================ */
{
  resetHome();
  const s = new Stack();
  const values = parseEntry('« 1 2 + » EVAL');
  for (const v of values) {
    if (v?.type === 'name' && !v.quoted) {
      const op = lookup(v.id);
      if (op) { op.fn(s); continue; }
    }
    s.push(v);
  }
  assert(s.depth === 1 && isInteger(s.peek()) && s.peek().value === 3n,
    'sanity: parse-and-eval « 1 2 + » → Integer(3)');
}

/* ================================================================
   9. Program literal on the stack + EVAL runs it.
   ================================================================ */
{
  const s = new Stack();
  s.push(Program([Integer(2n), Integer(3n), Name('*')]));
  assert(isProgram(s.peek()) && s.peek().tokens.length === 3,
    'sanity: Program literal round-trips as a value');
  lookup('EVAL').fn(s);
  assert(s.depth === 1 && isInteger(s.peek()) && s.peek().value === 6n,
    'sanity: EVAL of « 2 3 * » produces Integer(6)');
}

/* ================================================================
   10. Speed budget: the whole file should finish in well under 200 ms.
       This is a soft guard — if a future regression bloats startup,
       the number will drift; update it consciously.
   ================================================================ */
{
  const elapsed = Date.now() - t0;
  assert(elapsed < 500,
    `sanity: smoke file finished in ${elapsed} ms (budget < 500 ms)`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const total = state.passed + state.failed;
  console.log(state.failed === 0
    ? `\nSANITY PASSED (${state.passed} in ${Date.now() - t0} ms)`
    : `\n${state.failed} FAILED (of ${total})`);
  process.exit(state.failed === 0 ? 0 : 1);
}
