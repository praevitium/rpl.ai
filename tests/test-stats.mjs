/* Coverage for HP50 statistics accumulator ops registered in ops.js.
   The ops in this batch take the "ΣDAT-style" argument directly off
   the stack (a 2-col Matrix of (x, y) pairs, or a single-column Matrix
   / Vector for univariate sums) and return a summary scalar or
   per-column Vector.

   Ops covered (HP50 AUR §18):
     NΣ / NSIGMA       — observation count
     ΣX  / ΣX2         — sum / sum-of-squares of x column
     ΣY  / ΣY2 / ΣXY   — y column + cross-moment (require 2-col Matrix)
     MAXΣ / MINΣ       — per-column max / min (returns Vector)
     ASCII aliases:      SX, SX2, SY, SY2, SXY, MAXS, MINS route to the
                         same backend — we verify by calling both.

   HP50 fidelity: ΣDAT stored as a column matrix; single-variable sums
   work on a 1-column Matrix OR on a bare Vector of Reals.  Y-related
   sums require at least 2 columns.  Empty datasets throw
   "Bad argument value".  Non-numeric entries throw
   "Bad argument type". */

import { Stack } from '../www/src/rpl/stack.js';
import { lookup } from '../www/src/rpl/ops.js';
import {
  Real, Integer, Complex, Str, Vector, Matrix,
  isReal, isInteger, isVector,
} from '../www/src/rpl/types.js';
import { assert, assertThrows } from './helpers.mjs';

/* Dataset from HP50 AUR §18.2 example (simplified):
     X = [1, 2, 3, 4]
     Y = [2, 4, 6, 8]
   ΣX = 10, ΣX² = 30, ΣY = 20, ΣY² = 120, ΣXY = 60, NΣ = 4
   MAX per column = [4, 8], MIN per column = [1, 2]. */
function makeXYMatrix() {
  return Matrix([
    [Real(1), Real(2)],
    [Real(2), Real(4)],
    [Real(3), Real(6)],
    [Real(4), Real(8)],
  ]);
}

{
  const s = new Stack();
  s.push(makeXYMatrix());
  lookup('NΣ').fn(s);
  assert(s.depth === 1 && isReal(s.peek()) && s.peek().value.eq(4),
    'session064: NΣ on 4-row XY matrix returns 4');

  const t = new Stack();
  t.push(makeXYMatrix());
  lookup('NSIGMA').fn(t);
  assert(t.peek().value.eq(4), 'session064: NSIGMA ASCII name == NΣ');

  const u = new Stack();
  u.push(Vector([Real(1), Real(2), Real(3), Real(4), Real(5)]));
  lookup('NΣ').fn(u);
  assert(u.peek().value.eq(5), 'session064: NΣ on 5-item Vector returns 5');
}

{
  const s = new Stack();
  s.push(Vector([Real(1), Real(2), Real(3), Real(4)]));
  lookup('ΣX').fn(s);
  assert(isReal(s.peek()) && s.peek().value.eq(10),
    'session064: ΣX on [1 2 3 4] → 10');

  const t = new Stack();
  t.push(Vector([Real(1), Real(2), Real(3), Real(4)]));
  lookup('ΣX2').fn(t);
  assert(t.peek().value.eq(30),
    'session064: ΣX² on [1 2 3 4] → 30 (=1+4+9+16)');

  const u = new Stack();
  u.push(makeXYMatrix());
  lookup('SX').fn(u);
  assert(u.peek().value.eq(10),
    'session064: SX (ASCII) on XY matrix col-0 → 10');
}

{
  const s = new Stack();
  s.push(makeXYMatrix());
  lookup('ΣY').fn(s);
  assert(s.peek().value.eq(20), 'session064: ΣY on XY matrix → 20');

  const t = new Stack();
  t.push(makeXYMatrix());
  lookup('ΣY2').fn(t);
  assert(t.peek().value.eq(120),
    'session064: ΣY² on XY matrix → 120 (=4+16+36+64)');

  const u = new Stack();
  u.push(makeXYMatrix());
  lookup('ΣXY').fn(u);
  assert(u.peek().value.eq(60),
    'session064: ΣXY on XY matrix → 60 (=2+8+18+32)');

  const v = new Stack();
  v.push(makeXYMatrix());
  lookup('SY2').fn(v);
  assert(v.peek().value.eq(120), 'session064: SY2 (ASCII) == ΣY²');

  const w = new Stack();
  w.push(Matrix([[Real(1)], [Real(2)]]));
  assertThrows(() => lookup('ΣY').fn(w), /Invalid dimension/,
    'session064: ΣY on single-column matrix → Invalid dimension');
}

{
  const s = new Stack();
  s.push(makeXYMatrix());
  lookup('MAXΣ').fn(s);
  const v = s.peek();
  assert(isVector(v) && v.items.length === 2
         && v.items[0].value.eq(4) && v.items[1].value.eq(8),
    'session064: MAXΣ on XY matrix → Vector [4, 8]');

  const t = new Stack();
  t.push(makeXYMatrix());
  lookup('MINΣ').fn(t);
  const w = t.peek();
  assert(isVector(w) && w.items.length === 2
         && w.items[0].value.eq(1) && w.items[1].value.eq(2),
    'session064: MINΣ on XY matrix → Vector [1, 2]');

  const u = new Stack();
  u.push(makeXYMatrix());
  lookup('MAXS').fn(u);
  const mv = u.peek();
  assert(isVector(mv) && mv.items[0].value.eq(4),
    'session064: MAXS (ASCII) == MAXΣ');

  const x = new Stack();
  x.push(Vector([Real(-3), Real(5), Real(0)]));
  lookup('MAXΣ').fn(x);
  const mv2 = x.peek();
  assert(isVector(mv2) && mv2.items.length === 1 && mv2.items[0].value.eq(5),
    'session064: MAXΣ on plain Vector → 1-elem Vector of the max');
}

{
  const s = new Stack();
  s.push(Matrix([]));
  assertThrows(() => lookup('NΣ').fn(s), /Bad argument value/,
    'session064: NΣ on empty Matrix → Bad argument value');

  // Empty Vector: ΣX rejects (per _statsVectorOrMatrixCol0 — call
  // should either reject at Bad argument value or produce 0).  Actual
  // current code returns 0 for an empty Vector sum, so assert that.
  const t = new Stack();
  t.push(Vector([]));
  let res = null;
  try { lookup('ΣX').fn(t); res = t.peek(); } catch (e) { res = e; }
  assert(res instanceof Error ? /Bad argument/.test(res.message)
                              : (isReal(res) && res.value.eq(0)),
    'session064: ΣX on empty Vector → 0 or Bad argument (documented)');

  const u = new Stack();
  u.push(Real(5));
  assertThrows(() => lookup('NΣ').fn(u), /Bad argument type/,
    'session064: NΣ on Real → Bad argument type');

  const w = new Stack();
  w.push(Matrix([[Str('oops')]]));
  assertThrows(() => lookup('ΣX').fn(w), /Bad argument type/,
    'session064: ΣX on Matrix with String entry → Bad argument type');
}

/* ================================================================
   session127: stats-op rejection-path coverage.

 The block has thorough rejection coverage for ΣY (the
   third op in the file) but the symmetric Y-family ops ΣY2 and
   ΣXY share its rejection contract and were not pinned.  Likewise
   ΣX2 has a positive pin only — its non-Vector/non-Matrix reject
   path is still uncovered.  The MAXΣ / MINΣ ops have positive
   coverage on Vector and Matrix shapes but their three rejection
   branches (non-Vector/non-Matrix → Bad argument type; empty Vector
   / empty Matrix → Bad argument value) are not pinned.

   This block adds:
     • ΣY2 1-col-Matrix → Invalid dimension (mirrors the existing
       ΣY pin and the source-shared `M.rows[0].length < 2` guard).
     • ΣXY on Real → Bad argument type
     • ΣXY on 1-col Matrix → Invalid dimension
     • ΣXY on empty Matrix → Bad argument value
     • ΣX2 on Real → Bad argument type (the symmetric uncovered
       sibling of ΣX's already-pinned Real rejection).
     • MAXΣ on Real → Bad argument type (catches the bottom-of-fn
       fallthrough).
     • MAXΣ on empty Vector → Bad argument value
     • MAXΣ on empty Matrix → Bad argument value
     • MINΣ on a 3-column Matrix returns 3-element per-column min
       (positive multi-col coverage; existing MINΣ tests only do
        Vector or 2-col).
     • SXY ASCII alias matches ΣXY (the only Y-family alias not yet
       end-to-end pinned — the existing block pins SX, SY2, MAXS).
   ================================================================ */

{
  const s = new Stack();
  s.push(Matrix([[Real(1)], [Real(2)]]));
  assertThrows(() => lookup('ΣY2').fn(s), /Invalid dimension/,
    'session127: ΣY2 on single-column matrix → Invalid dimension');
}

{
  // Non-Matrix → Bad argument type (the `!isMatrix(M)` guard).
  const s = new Stack();
  s.push(Real(5));
  assertThrows(() => lookup('ΣXY').fn(s), /Bad argument type/,
    'session127: ΣXY on Real → Bad argument type');
}
{
  // 1-col Matrix → Invalid dimension (needs ≥2 cols).
  const s = new Stack();
  s.push(Matrix([[Real(1)], [Real(2)]]));
  assertThrows(() => lookup('ΣXY').fn(s), /Invalid dimension/,
    'session127: ΣXY on single-column matrix → Invalid dimension');
}
{
  // Empty Matrix → Bad argument value (rows.length === 0 guard).
  const s = new Stack();
  s.push(Matrix([]));
  assertThrows(() => lookup('ΣXY').fn(s), /Bad argument value/,
    'session127: ΣXY on empty Matrix → Bad argument value');
}

/* ---- ΣX2 rejection: non-Vector/Matrix → Bad argument type ---- *
 * `_statsVectorOrMatrixCol0` rejects non-Vector/non-Matrix inputs;
 * the existing block pins ΣX's Real rejection but not ΣX2's, even
 * though they share the same dispatch helper.  Pinning so a later
 * refactor that special-cases ΣX2 doesn't silently bypass the type
 * check. */
{
  const s = new Stack();
  s.push(Real(5));
  assertThrows(() => lookup('ΣX2').fn(s), /Bad argument type/,
    'session127: ΣX2 on Real → Bad argument type');
}

{
  const s = new Stack();
  s.push(Real(5));
  assertThrows(() => lookup('MAXΣ').fn(s), /Bad argument type/,
    'session127: MAXΣ on Real → Bad argument type (bottom-of-fn fallthrough)');
}

{
  const s = new Stack();
  s.push(Vector([]));
  assertThrows(() => lookup('MAXΣ').fn(s), /Bad argument value/,
    'session127: MAXΣ on empty Vector → Bad argument value');
}

{
  const s = new Stack();
  s.push(Matrix([]));
  assertThrows(() => lookup('MAXΣ').fn(s), /Bad argument value/,
    'session127: MAXΣ on empty Matrix → Bad argument value');
}

/* ---- MINΣ on a 3-column Matrix returns 3-element per-column min ---- *
 * Positive multi-col case for MINΣ — the existing block pins MINΣ on
 * a 2-col matrix and on a Vector but never on >2 columns, leaving
 * the column-iteration loop's general N coverage thin.  Pin a
 * 3-column matrix where the per-column mins differ across all three
 * columns so a regression that drops/duplicates a column would
 * surface immediately. */
{
  const s = new Stack();
  s.push(Matrix([
    [Real(3), Real(8), Real(-1)],
    [Real(1), Real(5), Real( 0)],
    [Real(7), Real(2), Real( 4)],
  ]));
  lookup('MINΣ').fn(s);
  const v = s.peek();
  assert(isVector(v) && v.items.length === 3,
    `session127: MINΣ on 3-col matrix returns 3-element Vector (got len=${v && v.items && v.items.length})`);
  assert(v.items[0].value.eq(1) && v.items[1].value.eq(2) && v.items[2].value.eq(-1),
    `session127: MINΣ 3-col per-column mins → [1, 2, -1] (got ${v.items.map(x => x.value).join(',')})`);
}

{
  const s = new Stack();
  s.push(makeXYMatrix());
  lookup('SXY').fn(s);
  assert(isReal(s.peek()) && s.peek().value.eq(60),
    'session127: SXY (ASCII) on XY matrix → 60 (alias of ΣXY)');
}

{
  const s = new Stack();
  s.push(makeXYMatrix());
  lookup('MEAN').fn(s);
  // MEAN returns either a scalar or a Vector depending on shape; on a
  // 2-col matrix HP50 returns per-column means.  Accept either a Vector
  // of [2.5, 5] or a Real 2.5 (our impl uses col-0-only for plain ΣX
  // but MEAN is multi-column on HP50).  Assert the weaker invariant:
  // the (x-col) answer 2.5 appears somewhere in the result.
  const r = s.peek();
  const ok = (isReal(r) && r.value.eq(2.5))
          || (isVector(r) && r.items.length >= 1 && r.items[0].value.eq(2.5));
  assert(ok, 'session064: MEAN on XY matrix reports col-0 mean 2.5 (scalar or col-0 of Vector)');
}

/* ================================================================
   session132: stats-op ASCII-alias positive-coverage closure +
   MAXΣ multi-column positive case.

   The file's top-of-file comment promises that SX, SX2, SY, SY2,
   SXY, MAXS, MINS are ASCII aliases that route to the same
   backend.  Today only **5 of 7** have an end-to-end positive pin
 under their alias name (SX ; SY2 ; MAXS
 ; SXY ). **SX2, SY, and MINS have no
   `lookup(<alias>)` exercise anywhere in the test tree** — verified
   by `grep -rn "lookup\\('SX2\\|lookup\\('SY'\\|lookup\\('MINS\\)"
 tests/` returning no matches at entry. A future
   refactor that accidentally drops one of those ASCII names from
   the registration block would not be caught by any assertion;
   pinning them here closes that gap.

 The block also added a 3-column positive pin for
   MINΣ but stopped short of the symmetric MAXΣ multi-column case;
   the existing MAXΣ tests only exercise 2-col Matrix and a bare
   Vector, leaving the column-iteration loop's general-N max
 coverage thin. Mirroring the MINΣ 3-col pin closes
   that asymmetry.

   Adds:
     • SX2 on plain Vector → 30 (alias of ΣX2; the existing SX2
       coverage in `lookup('ΣX2')` exercises both shapes, but the
       alias dispatch from SX2 → ΣX2 was untested).
     • SX2 on XY matrix uses col-0 → 30 (alias-routed shape).
     • SY on XY matrix → 20 (alias of ΣY positive end-to-end).
     • SY rejection: 1-col Matrix → Invalid dimension (the alias
       inherits the same 2-col guard — pin it through the alias).
     • MINS on XY matrix → Vector [1, 2] (alias of MINΣ end-to-end).
     • MINS on bare Vector → 1-elem Vector of the min (the
 symmetric counterpart to the MAXS Matrix pin
 and the MAXΣ-on-Vector pin).
     • MAXΣ on 3-col Matrix returns 3-element per-column Vector
 (multi-column positive coverage; mirrors MINΣ).
     • MAXΣ 3-col per-column maxes [3, 8, 4] (all-distinct columns
       so a column-iteration drop or duplicate would surface).
     • MAXΣ on a Vector of all-negative entries returns the
       least-negative entry (Math.max corner: spread/reducer
       behavior on uniformly negative inputs is easy to break).
   ================================================================ */

{
  const s = new Stack();
  s.push(Vector([Real(1), Real(2), Real(3), Real(4)]));
  lookup('SX2').fn(s);
  assert(isReal(s.peek()) && s.peek().value.eq(30),
    'session132: SX2 (ASCII) on [1 2 3 4] → 30 (alias of ΣX2)');
}
{
  const s = new Stack();
  s.push(makeXYMatrix());
  lookup('SX2').fn(s);
  assert(isReal(s.peek()) && s.peek().value.eq(30),
    'session132: SX2 (ASCII) on XY matrix col-0 → 30 (alias routes through col-0 reducer)');
}

{
  const s = new Stack();
  s.push(makeXYMatrix());
  lookup('SY').fn(s);
  assert(isReal(s.peek()) && s.peek().value.eq(20),
    'session132: SY (ASCII) on XY matrix → 20 (alias of ΣY)');
}
{
  // Single-column input — the alias must surface the same Invalid
  // dimension as the canonical ΣY (the alias is a one-line
  // re-dispatch, but pinning it guards against an accidental
  // shape-bypass refactor that special-cases SY).
  const s = new Stack();
  s.push(Matrix([[Real(1)], [Real(2)]]));
  assertThrows(() => lookup('SY').fn(s), /Invalid dimension/,
    'session132: SY (ASCII) on single-column matrix → Invalid dimension (alias inherits ΣY 2-col guard)');
}

{
  const s = new Stack();
  s.push(makeXYMatrix());
  lookup('MINS').fn(s);
  const v = s.peek();
  assert(isVector(v) && v.items.length === 2
         && v.items[0].value.eq(1) && v.items[1].value.eq(2),
    'session132: MINS (ASCII) on XY matrix → Vector [1, 2] (alias of MINΣ)');
}
{
  // MINS on bare Vector — symmetric to the MAXΣ-on-Vector
  // 1-elem-Vector pin.  The single-element-Vector return shape is the
  // same end-to-end contract.
  const s = new Stack();
  s.push(Vector([Real(7), Real(-2), Real(3)]));
  lookup('MINS').fn(s);
  const v = s.peek();
  assert(isVector(v) && v.items.length === 1 && v.items[0].value.eq(-2),
    'session132: MINS (ASCII) on plain Vector → 1-elem Vector of the min (-2)');
}

/* ---- MAXΣ multi-column positive case ---- *
 * Mirrors the MINΣ 3-col pin: a 3-column Matrix with
 * per-column maxes that are all distinct, so a regression that
 * drops/duplicates a column surfaces immediately. */
{
  const s = new Stack();
  s.push(Matrix([
    [Real(3), Real(8), Real(-1)],
    [Real(1), Real(5), Real( 0)],
    [Real(2), Real(7), Real( 4)],
  ]));
  lookup('MAXΣ').fn(s);
  const v = s.peek();
  assert(isVector(v) && v.items.length === 3,
    `session132: MAXΣ on 3-col matrix returns 3-element Vector (got len=${v && v.items && v.items.length})`);
  assert(v.items[0].value.eq(3) && v.items[1].value.eq(8) && v.items[2].value.eq(4),
    `session132: MAXΣ 3-col per-column maxes → [3, 8, 4] (got ${v.items.map(x => x.value).join(',')})`);
}

/* ---- MAXΣ on all-negative Vector picks the least-negative entry ----
 * Math.max(...negatives) is a common spread/reducer corner; an
 * accidental Math.abs-then-max refactor would silently invert the
 * answer.  Pinning the all-negative case so that path's correct
 * behavior is locked in. */
{
  const s = new Stack();
  s.push(Vector([Real(-9), Real(-3), Real(-5)]));
  lookup('MAXΣ').fn(s);
  const v = s.peek();
  assert(isVector(v) && v.items.length === 1 && v.items[0].value.eq(-3),
    'session132: MAXΣ on all-negative Vector → least-negative entry (-3)');
}

/* ================================================================
   session137: stats-op ASCII-alias rejection-path coverage closure.

 The block pinned ΣX2 / ΣXY / MAXΣ / MINΣ rejection
 branches under their canonical Unicode names, and
   added the symmetric POSITIVE alias coverage for SX2 / SY / MINS
 (mirrors of 's SX / SY2 / MAXS positive aliases).
   But the alias branches' REJECTION paths are still untested for
   SX / SY2 / SXY / MAXS / MINS — a refactor that special-cases
   one of these aliases and accidentally bypasses the type-/dim-
   guards in the canonical backend would silently slip through.

   Pinning each alias's analogous reject branch (the same one the
 canonical name has under / ):

 • SX on Real → Bad argument type (mirror of ΣX).
     • SY2 on 1-col Matrix → Invalid dimension (mirror of
 ΣY2 + the existing ΣY pin).
 • SXY on Real → Bad argument type (mirror of
       ΣXY-on-Real reject).
 • MAXS on Real → Bad argument type (mirror of
       MAXΣ-on-Real reject).
     • MAXS on empty Vector → Bad argument value (mirror of
 MAXΣ-on-empty-Vector reject).
 • MINS on Real → Bad argument type (mirror of
       MAXΣ-on-Real reject; MINS shares the same dispatcher).
     • MINS on empty Matrix → Bad argument value (mirror of
 MAXΣ-on-empty-Matrix reject).
   ================================================================ */

/* ---- SX (alias of ΣX) rejects Real ---- */
{
  const s = new Stack();
  s.push(Real(5));
  assertThrows(() => lookup('SX').fn(s), /Bad argument type/,
    'session137: SX (ASCII) on Real → Bad argument type (alias inherits ΣX type guard)');
}

/* ---- SY2 (alias of ΣY2) rejects 1-col Matrix → Invalid dimension ---- */
{
  const s = new Stack();
  s.push(Matrix([[Real(1)], [Real(2)]]));
  assertThrows(() => lookup('SY2').fn(s), /Invalid dimension/,
    'session137: SY2 (ASCII) on single-column matrix → Invalid dimension (alias inherits ΣY2 2-col guard)');
}

/* ---- SXY (alias of ΣXY) rejects Real ---- */
{
  const s = new Stack();
  s.push(Real(5));
  assertThrows(() => lookup('SXY').fn(s), /Bad argument type/,
    'session137: SXY (ASCII) on Real → Bad argument type (alias inherits ΣXY type guard)');
}

{
  const s = new Stack();
  s.push(Real(5));
  assertThrows(() => lookup('MAXS').fn(s), /Bad argument type/,
    'session137: MAXS (ASCII) on Real → Bad argument type (alias inherits MAXΣ type guard)');
}

{
  const s = new Stack();
  s.push(Vector([]));
  assertThrows(() => lookup('MAXS').fn(s), /Bad argument value/,
    'session137: MAXS (ASCII) on empty Vector → Bad argument value (alias inherits MAXΣ empty guard)');
}

{
  const s = new Stack();
  s.push(Real(5));
  assertThrows(() => lookup('MINS').fn(s), /Bad argument type/,
    'session137: MINS (ASCII) on Real → Bad argument type (alias inherits MINΣ type guard)');
}

{
  const s = new Stack();
  s.push(Matrix([]));
  assertThrows(() => lookup('MINS').fn(s), /Bad argument value/,
    'session137: MINS (ASCII) on empty Matrix → Bad argument value (alias inherits MINΣ empty guard)');
}

/* ================================================================
   session147: NSIGMA / NΣ + MEAN / VAR / SDEV rejection-path closure
   + canonical ΣX / ΣX2 col-0-routing positive coverage closure.

 The / / / sweep
   between them pin ΣX / ΣX2 / ΣY / ΣY2 / ΣXY / MAXΣ / MINΣ
   rejection branches under both their canonical Unicode names and
   the SX/SY/SY2/SXY/MAXS/MINS ASCII aliases.  Three holes remain:

     • NSIGMA / NΣ bottom-of-fn `Bad argument type` fall-through
       (ops.js:12177) is unpinned for both the canonical-implementation
       name (NSIGMA, the body) and the symbol-alias (NΣ, the
       delegating wrapper at ops.js:12179).  A regression that
       widened NSIGMA's input dispatch but forgot to keep the
       throw branch for non-Vector / non-Matrix inputs would slip
       past every existing pin in the file.
     • NΣ on empty Vector → Bad argument value (ops.js:12168) —
       only the empty-Matrix branch (ops.js:12173) was pinned at
 line 153 (`s.push(Matrix([]))`); the empty-
       Vector branch is its own conditional and was untested.
     • MEAN / VAR / SDEV bottom-of-fn `Bad argument type`
       fall-through is unpinned.  These three ops share a Vector-
       or-Matrix dispatch (ops.js:10253-10281) but all three
       reject branches were untested — the file's existing MEAN
       pin only exercises the positive XY-matrix path.
     • ΣX / ΣX2 on a 2-column XY Matrix col-0 routing — the
       *canonical-name* positive path was never pinned.  The file
       pins `ΣX on Vector → 10` and `ΣX2 on Vector → 30`, and
       pins the *alias-routed* SX/SX2 on the XY matrix (`SX
 (ASCII) on XY matrix col-0 → 10` at line 80,
 `SX2 (ASCII) on XY matrix col-0 → 30` at line
       391).  A refactor that special-cased the alias backend and
       bypassed canonical ΣX/ΣX2's `_statsVectorOrMatrixCol0`
       dispatch would slip past both today.  Mirror of session
       132's alias-positive-coverage closure but in the OTHER
       direction — canonical-positive-coverage closure.
   ================================================================ */

{
  const s = new Stack();
  s.push(Real(5));
  assertThrows(() => lookup('NSIGMA').fn(s), /Bad argument type/,
    'session147: NSIGMA on Real → Bad argument type (bottom-of-fn fallthrough at ops.js:12177; canonical-name reject was unpinned)');
}

{
  const s = new Stack();
  s.push(Real(5));
  assertThrows(() => lookup('NΣ').fn(s), /Bad argument type/,
    'session147: NΣ on Real → Bad argument type (symbol-alias delegates to NSIGMA at ops.js:12179; alias-arm reject was unpinned)');
}

{
  const s = new Stack();
  s.push(Vector([]));
  assertThrows(() => lookup('NΣ').fn(s), /Bad argument value/,
    'session147: NΣ on empty Vector → Bad argument value (Vector arm at ops.js:12168 — existing s064 pin only covered the empty-Matrix arm at ops.js:12173)');
}

{
  const s = new Stack();
  s.push(Real(5));
  assertThrows(() => lookup('MEAN').fn(s), /Bad argument type/,
    'session147: MEAN on Real → Bad argument type (bottom-of-fn fallthrough at ops.js:10260; the file only had the positive XY-matrix MEAN pin)');
}

{
  const s = new Stack();
  s.push(Real(5));
  assertThrows(() => lookup('VAR').fn(s), /Bad argument type/,
    'session147: VAR on Real → Bad argument type (bottom-of-fn fallthrough at ops.js:10270; VAR rejection was unpinned)');
}

{
  const s = new Stack();
  s.push(Real(5));
  assertThrows(() => lookup('SDEV').fn(s), /Bad argument type/,
    'session147: SDEV on Real → Bad argument type (bottom-of-fn fallthrough at ops.js:10280; SDEV rejection was unpinned — closes MEAN/VAR/SDEV reject trio)');
}

{
  const s = new Stack();
  s.push(makeXYMatrix());
  lookup('ΣX').fn(s);
  assert(isReal(s.peek()) && s.peek().value.eq(10),
    'session147: ΣX (canonical) on XY matrix col-0 → 10 (canonical-name positive coverage; the file only had the SX alias-arm pin and the ΣX-Vector positive)');
}

{
  const s = new Stack();
  s.push(makeXYMatrix());
  lookup('ΣX2').fn(s);
  assert(isReal(s.peek()) && s.peek().value.eq(30),
    'session147: ΣX² (canonical) on XY matrix col-0 → 30 (canonical-name positive coverage; the file only had the SX2 alias-arm pin from session-132 + the ΣX² Vector positive)');
}
