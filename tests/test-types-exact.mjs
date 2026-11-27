import { Stack } from '../www/src/rpl/stack.js';
import { lookup } from '../www/src/rpl/ops.js';
import {
  Real, Integer, Rational, Complex, Name, Str, Tagged, RList, Vector, Matrix, Symbolic, isReal, isInteger, isRational,
  isComplex, isTagged, isList, isSymbolic, Decimal,
} from '../www/src/rpl/types.js';
import { defaultFnEval } from '../www/src/rpl/algebra.js';
import { state as calcState, setAngle, toRadians, fromRadians, setApproxMode } from '../www/src/rpl/state.js';
import { assert, assertThrows } from './helpers.mjs';

/* EXACT mode: Integers and Rationals kept exact through the transcendental lifts. */

/* ================================================================
 — Cluster 1: Inverse-trig + inverse-hyp family
   EXACT-mode `_exactUnaryLift` Integer-stay-exact path.

 Surfaced as a candidate at the end of 's log:

     "EXACT-mode `_exactUnaryLift` Integer-stay-exact path on the
      inverse-trig family — Cluster 1 pinned the SINH(Integer(0))
      → Integer(0) path through Tagged-V; the analog on
      ASIN/ACOS/ATAN is a separate code path (different
      `_exactUnaryLift` value mapping for inverse-trig clean folds
      — e.g. `ASIN(Integer(0)) → Integer(0)`?) and was not pinned."

   Inverse-trig dispatches through `_trigInvCx` (`ops.js:7929`) /
   ASIN/ACOS direct registration (`ops.js:8054` / `:8072`); the
   EXACT-mode Integer/Rational input branch routes through
   `_exactUnaryLift(name, fromRadians(Math.asin(x)), v)` (and the
   ACOS / ATAN analogs).  Inverse-hyp ASINH/ACOSH/ATANH
   (`ops.js:8002` / `:8023` / `:7960` etc.) likewise routes through
   `_exactUnaryLift` for clean integer folds.

   This cluster pins the bare-scalar (un-Tagged, un-V/M) Integer-
   stay-exact path on each of the six functions, plus the Rational
   input variant (Q stay-exact via `Number(n)/Number(d)` → Math.fn
   → fromRadians + integer-clean check), plus the stay-symbolic
 branch when the result is NOT integer-clean. The
   Cluster 1 SINH pin only covered the hyperbolic family (SINH /
   COSH / TANH / ASINH / ACOSH / ATANH all share `_unaryCx`-via-
   _exactUnaryLift) but only the SINH variant under Tagged-V — bare-
   scalar Integer-stay-exact for the inverse-hyp trio was unpinned. */
{
  const _prevAngle = calcState.angle;
  setAngle('RAD');
  try {
    // ASIN(Integer(0)) → Integer(0).  asin(0) = 0; the round-to-
    // integer tolerance in `_exactUnaryLift` (1e-12) folds the
    // Real to Integer.  Distinct from `ASIN(Real(0))` which produces
    // Real(0) — the Integer-stay-exact path requires Integer/Rational
    // input AND the result to round-to-integer.  Mirrors session
    // 140's SINH(Integer(0)) → Integer(0) pin on the inverse-trig
    // axis (different code path: _trigInvCx vs _unaryCx).
    {
      const s = new Stack();
      s.push(Integer(0n));
      lookup('ASIN').fn(s);
      const v = s.peek();
      assert(isInteger(v) && v.value === 0n,
        `session142: ASIN(Integer(0)) RAD → Integer(0) (EXACT-mode _exactUnaryLift fold; asin(0)=0 round-to-integer); got ${v?.type}(${v?.value?.toString?.()})`);
    }

    // ACOS(Integer(1)) → Integer(0).  acos(1) = 0; same fold path.
    // ACOS uses a distinct registration helper from ASIN — both
    // dispatch through `_exactUnaryLift` but the value mapping
    // differs (acos vs asin).
    {
      const s = new Stack();
      s.push(Integer(1n));
      lookup('ACOS').fn(s);
      const v = s.peek();
      assert(isInteger(v) && v.value === 0n,
        `session142: ACOS(Integer(1)) RAD → Integer(0) (acos(1)=0 round-to-integer fold); got ${v?.type}(${v?.value?.toString?.()})`);
    }

    // ATAN(Integer(0)) → Integer(0).  atan(0) = 0; ATAN routes
    // through `_trigInvCx` — distinct helper from ASIN/ACOS but
    // same `_exactUnaryLift` integer-clean check.
    {
      const s = new Stack();
      s.push(Integer(0n));
      lookup('ATAN').fn(s);
      const v = s.peek();
      assert(isInteger(v) && v.value === 0n,
        `session142: ATAN(Integer(0)) RAD → Integer(0) (atan(0)=0 round-to-integer fold via _trigInvCx); got ${v?.type}(${v?.value?.toString?.()})`);
    }

    // RAD-mode stay-symbolic: ATAN(Integer(1)) = π/4 ≈ 0.785… is
    // NOT integer-clean, so `_exactUnaryLift` returns
    // Symbolic(AstFn('ATAN', [Integer(1)])).  Pins the
    // negative side of the integer-clean branch — a future change
    // that loosened the tolerance would surface here.
    {
      const s = new Stack();
      s.push(Integer(2n));
      lookup('ATAN').fn(s);
      const v = s.peek();
      assert(v?.type === 'symbolic' && v.expr?.kind === 'fn' && v.expr.name === 'ATAN'
          && v.expr.args.length === 1 && v.expr.args[0]?.kind === 'num' && v.expr.args[0].value === 2,
        `session142: ATAN(Integer(2)) RAD → Symbolic ATAN(2) (atan(2) has no closed form — stay-symbolic via _exactUnaryLift); got ${v?.type} expr=${JSON.stringify(v?.expr)}`);
    }

    // DEG-mode integer-clean fold: ASIN(Integer(1)) under DEG = 90,
    // which IS integer-clean → Integer(90).  Pins that
    // `fromRadians` is applied INSIDE `_exactUnaryLift` (the value
    // converted to the active angle mode is what gets the integer-
    // clean check, not the radian value).
    setAngle('DEG');
    {
      const s = new Stack();
      s.push(Integer(1n));
      lookup('ASIN').fn(s);
      const v = s.peek();
      assert(isInteger(v) && v.value === 90n,
        `session142: ASIN(Integer(1)) DEG → Integer(90) (asin(1)=π/2; fromRadians(π/2)=90 integer-clean); got ${v?.type}(${v?.value?.toString?.()})`);
    }

    // DEG-mode integer-clean fold on Rational input:
    // ASIN(Rational(1,2)) DEG = 30 (asin(1/2) = π/6; fromRadians(π/6) = 30).
    // Pins the Rational arm of the EXACT-mode integer-stay-exact
    // path (the `isRational(v)` branch in `_unaryCx`-style ops
    // computes `Number(v.n) / Number(v.d)` before passing to the
    // numeric primitive).
    {
      const s = new Stack();
      s.push(Rational(1n, 2n));
      lookup('ASIN').fn(s);
      const v = s.peek();
      assert(isInteger(v) && v.value === 30n,
        `session142: ASIN(Rational(1,2)) DEG → Integer(30) (Q→double=0.5; asin(0.5)=π/6; fromRadians=30 integer-clean); got ${v?.type}(${v?.value?.toString?.()})`);
    }

    // DEG-mode stay-symbolic on Rational that doesn't fold cleanly:
    // ASIN(Rational(1,3)) DEG ≈ 19.47… is NOT integer-clean →
    // Symbolic ASIN(1/3).  Negative side of the Rational arm.
    {
      const s = new Stack();
      s.push(Rational(1n, 3n));
      lookup('ASIN').fn(s);
      const v = s.peek();
      assert(v?.type === 'symbolic' && v.expr?.kind === 'fn' && v.expr.name === 'ASIN',
        `session142: ASIN(Rational(1,3)) DEG → Symbolic ASIN(1/3) (asin(1/3)≈19.47°, not integer-clean); got ${v?.type} expr=${JSON.stringify(v?.expr)}`);
    }

    // ATAN(Integer(1)) DEG → Integer(45).  Different boundary on
    // ATAN — atan(1)=π/4; fromRadians(π/4)=45 integer-clean (in
    // RAD mode the same input stays-symbolic per the second pin
    // above).  Pins angle-mode dependence of the integer-clean
    // branch.
    {
      const s = new Stack();
      s.push(Integer(1n));
      lookup('ATAN').fn(s);
      const v = s.peek();
      assert(isInteger(v) && v.value === 45n,
        `session142: ATAN(Integer(1)) DEG → Integer(45) (atan(1)=π/4; fromRadians=45 integer-clean — angle-mode flips this branch from the RAD stay-symbolic case); got ${v?.type}(${v?.value?.toString?.()})`);
    }

    // ACOS(Integer(0)) DEG → Integer(90).  acos(0)=π/2; fromRadians=90
    // integer-clean.  Closes the ASIN/ACOS/ATAN trio under DEG mode.
    {
      const s = new Stack();
      s.push(Integer(0n));
      lookup('ACOS').fn(s);
      const v = s.peek();
      assert(isInteger(v) && v.value === 90n,
        `session142: ACOS(Integer(0)) DEG → Integer(90) (acos(0)=π/2; fromRadians=90 integer-clean); got ${v?.type}(${v?.value?.toString?.()})`);
    }

    setAngle('RAD');

    // Inverse-hyperbolic Integer-stay-exact: ASINH(Integer(0)) →
    // Integer(0).  asinh(0)=0; no angle-mode involvement on the
    // hyperbolic family — `_exactUnaryLift` directly applies to
    // the asinh result. Mirror of 's SINH
    // pin but on the inverse-hyp axis (which
    // explicitly only pinned on Tagged-V, not bare-scalar).
    {
      const s = new Stack();
      s.push(Integer(0n));
      lookup('ASINH').fn(s);
      const v = s.peek();
      assert(isInteger(v) && v.value === 0n,
        `session142: ASINH(Integer(0)) → Integer(0) (asinh(0)=0; no angle-mode on hyp; integer-clean fold); got ${v?.type}(${v?.value?.toString?.()})`);
    }

    // ACOSH(Integer(1)) → Integer(0).  acosh(1)=0; the boundary
    // of the acosh domain ([1, ∞)) — pins that the boundary value
    // does NOT throw and folds cleanly to Integer(0).
    {
      const s = new Stack();
      s.push(Integer(1n));
      lookup('ACOSH').fn(s);
      const v = s.peek();
      assert(isInteger(v) && v.value === 0n,
        `session142: ACOSH(Integer(1)) → Integer(0) (acosh(1)=0 boundary; integer-clean fold); got ${v?.type}(${v?.value?.toString?.()})`);
    }

    // ATANH(Integer(0)) → Integer(0).  atanh(0)=0; pins the
    // ASINH/ACOSH/ATANH trio.
    {
      const s = new Stack();
      s.push(Integer(0n));
      lookup('ATANH').fn(s);
      const v = s.peek();
      assert(isInteger(v) && v.value === 0n,
        `session142: ATANH(Integer(0)) → Integer(0) (atanh(0)=0; closes inverse-hyp ASINH/ACOSH/ATANH integer-clean trio); got ${v?.type}(${v?.value?.toString?.()})`);
    }
  } finally {
    setAngle(_prevAngle);
  }
}

/* ================================================================
 — Cluster 2: CONJ / RE / IM / ARG on Tagged-of-
   Symbolic — wrapper composition through the 2-deep
   `_withTaggedUnary(_withListUnary(handler))` shape on the Sy axis.

 Surfaced as a candidate at the end of 's log:

     "CONJ/RE/IM on Tagged-of-Symbolic — matrix lists `T ✓` and
      `Sy ✓` independently but the composition wasn't pinned."

 The matrix gives `T ✓` and `Sy ✓` per op since / 110
   landed Tagged transparency and Symbolic round-trip via
   `defaultFnEval` folds, but the COMPOSITION (Tagged-of-Symbolic)
 was not pinned. Distinct from, which
   pinned Tagged-of-V/M with bespoke V/M dispatch INSIDE the
   wrapper — Tagged-of-Symbolic exercises the `_isSymOperand`
   branch in the bespoke handler, which lifts to
   `Symbolic(AstFn('CONJ', [_toAst(v)]))` / RE / IM / ARG.

   Closes the Sy axis on the Tagged-of-X composition surface for
   the four-op cluster, completing the wrapper-composition pass on
   the bespoke V/M-handler family. */
{
  const _prevAngle = calcState.angle;
  setAngle('RAD');
  try {
    // CONJ on Tagged-of-Symbolic: `:v:Symbolic(X) CONJ` →
    // `:v:Symbolic(CONJ(X))`.  Outer Tagged preserved; inner
    // Symbolic gets wrapped in an AstFn('CONJ', [Name(X)]).
    {
      const s = new Stack();
      s.push(Tagged('v', Symbolic({ k: 'var', id: 'X' })));
      lookup('CONJ').fn(s);
      const v = s.peek();
      assert(isTagged(v) && v.tag === 'v' && v.value?.type === 'symbolic',
        `session142: CONJ :v:Symbolic(X) preserves outer Tagged + Symbolic kind`);
      const expr = v.value.expr;
      assert(expr?.kind === 'fn' && expr.name === 'CONJ' && expr.args?.length === 1
          && expr.args[0]?.k === 'var' && expr.args[0].id === 'X',
        `session142: CONJ :v:Symbolic(X) → :v:Symbolic(CONJ(X)) (inner Sy lifted via Symbolic(AstFn('CONJ', [...]))); got expr=${JSON.stringify(expr)}`);
    }

    // RE on Tagged-of-Symbolic: same wrapper shape as CONJ — pins
    // that RE's bespoke handler also routes through the
    // `_isSymOperand` branch under Tagged.
    {
      const s = new Stack();
      s.push(Tagged('v', Symbolic({ k: 'var', id: 'X' })));
      lookup('RE').fn(s);
      const v = s.peek();
      assert(isTagged(v) && v.tag === 'v' && v.value?.type === 'symbolic'
          && v.value.expr?.kind === 'fn' && v.value.expr.name === 'RE'
          && v.value.expr.args?.[0]?.id === 'X',
        `session142: RE :v:Symbolic(X) → :v:Symbolic(RE(X)) (Tagged-of-Sy composition through 2-deep wrapper); got tag=${v?.tag} expr=${JSON.stringify(v?.value?.expr)}`);
    }

    // IM on Tagged-of-Symbolic: closes the CONJ/RE/IM trio on the
    // Sy axis.  Note that IM(Real(x)) collapses to Real(0) on bare
    // input, but on a Symbolic name (where realness is
    // indeterminate) IM stays symbolic.
    {
      const s = new Stack();
      s.push(Tagged('v', Symbolic({ k: 'var', id: 'X' })));
      lookup('IM').fn(s);
      const v = s.peek();
      assert(isTagged(v) && v.tag === 'v' && v.value?.type === 'symbolic'
          && v.value.expr?.kind === 'fn' && v.value.expr.name === 'IM'
          && v.value.expr.args?.[0]?.id === 'X',
        `session142: IM :v:Symbolic(X) → :v:Symbolic(IM(X)) (closes CONJ/RE/IM Sy-axis trio under Tagged); got tag=${v?.tag} expr=${JSON.stringify(v?.value?.expr)}`);
    }

    // ARG on Tagged-of-Symbolic: extends to ARG; closes the four-op
    // bespoke V/M-handler family on Tagged-of-Sy.  Symbolic argument
    // means the angle is indeterminate — stay-symbolic.
    {
      const s = new Stack();
      s.push(Tagged('v', Symbolic({ k: 'var', id: 'X' })));
      lookup('ARG').fn(s);
      const v = s.peek();
      assert(isTagged(v) && v.tag === 'v' && v.value?.type === 'symbolic'
          && v.value.expr?.kind === 'fn' && v.value.expr.name === 'ARG'
          && v.value.expr.args?.[0]?.id === 'X',
        `session142: ARG :v:Symbolic(X) → :v:Symbolic(ARG(X)) (closes ARG / CONJ / RE / IM bespoke-V/M-handler family on Tagged-of-Sy); got tag=${v?.tag} expr=${JSON.stringify(v?.value?.expr)}`);
    }
  } finally {
    setAngle(_prevAngle);
  }
}

/* ================================================================
 — Cluster 3: Inner-Tagged-inside-Vector / Matrix
   rejection on bespoke V/M handlers (ARG / CONJ / RE / IM).

 Surfaced as a candidate at the end of 's log:

     "Inner-Tagged-inside-Vector rejection on bespoke V/M handlers
      (ARG/CONJ/RE/IM) — the Cluster 1 inner-Tagged-inside-Vector
      rejection on SINH was pinned but the analogous case on the
      bespoke-V/M family (`Vector(:x:Complex(3,4)) ARG`) wasn't
      pinned this session — the per-element handlers (`_argScalar`,
      `_conjScalar`, `_reScalar`, `_imScalar`) explicitly throw
      'Bad argument type' on Tagged inputs since they're not
      Tagged-aware."

   The bespoke V/M dispatch chain on ARG/CONJ/RE/IM is:
   `_withTaggedUnary(_withListUnary(s => { … per-element via
   `_argScalar`/`_conjScalar`/`_reScalar`/`_imScalar` … }))`.  The
   `_withTaggedUnary` wrapper sees a Vector at top-level (not a
   Tagged), so it doesn't unwrap.  The bespoke handler then iterates
   `v.items.map(_argScalar)`; the per-element handlers receive
   Tagged scalars and reject with 'Bad argument type' since they're
   not Tagged-aware (in contrast to the wrapper-VM handlers in
 Clusters 1 / 2 where `_withVMUnary` sat between the
   per-element handler and the wrapper-Tagged unwrap).

 Mirror of 's `Vec[:x:Real(0), :y:Real(0)]
   SINH` rejection but on the four bespoke-V/M ops, plus the
   Matrix-axis variant for completeness. */
{
  const _prevAngle = calcState.angle;
  setAngle('RAD');
  try {
    // ARG: Vector with inner Tagged element — bespoke per-element
    // `_argScalar` is not Tagged-aware, rejects with 'Bad argument
    // type'.
    {
      const s = new Stack();
      s.push(Vector([Tagged('x', Complex(3, 4))]));
      assertThrows(() => lookup('ARG').fn(s), /Bad argument type/i,
        `session142: Vector(:x:Complex(3,4)) ARG → 'Bad argument type' (bespoke _argScalar inside 2-deep wrapper is not Tagged-aware; mirror of session-140 Cluster 1 inner-Tagged-inside-Vector SINH rejection on the ARG axis)`);
    }

    // CONJ: same shape — `_conjScalar` rejects Tagged.
    {
      const s = new Stack();
      s.push(Vector([Tagged('x', Complex(3, 4))]));
      assertThrows(() => lookup('CONJ').fn(s), /Bad argument type/i,
        `session142: Vector(:x:Complex(3,4)) CONJ → 'Bad argument type' (bespoke _conjScalar not Tagged-aware)`);
    }

    // RE: same shape — `_reScalar` rejects Tagged.
    {
      const s = new Stack();
      s.push(Vector([Tagged('x', Complex(3, 4))]));
      assertThrows(() => lookup('RE').fn(s), /Bad argument type/i,
        `session142: Vector(:x:Complex(3,4)) RE → 'Bad argument type' (bespoke _reScalar not Tagged-aware)`);
    }

    // IM: closes the four-op rejection trio.
    {
      const s = new Stack();
      s.push(Vector([Tagged('x', Complex(3, 4))]));
      assertThrows(() => lookup('IM').fn(s), /Bad argument type/i,
        `session142: Vector(:x:Complex(3,4)) IM → 'Bad argument type' (bespoke _imScalar not Tagged-aware; closes ARG/CONJ/RE/IM inner-Tagged-V rejection)`);
    }

    // Matrix axis: the same rejection holds on the M-axis.  Matrix
    // dispatch is `v.rows.map(r => r.map(_argScalar))` — the same
    // per-element handler — so a single Matrix-axis pin per op
    // confirms the inner-Tagged-inside-Matrix rejection is
    // symmetric to the V-axis.
    {
      const s = new Stack();
      s.push(Matrix([[Tagged('x', Complex(3, 4))]]));
      assertThrows(() => lookup('ARG').fn(s), /Bad argument type/i,
        `session142: Matrix([[:x:Complex(3,4)]]) ARG → 'Bad argument type' (bespoke _argScalar in r.map(_argScalar) chain not Tagged-aware; M-axis mirror of V-axis inner-Tagged rejection)`);
    }

    {
      const s = new Stack();
      s.push(Matrix([[Tagged('x', Real(5))]]));
      assertThrows(() => lookup('CONJ').fn(s), /Bad argument type/i,
        `session142: Matrix([[:x:Real(5)]]) CONJ → 'Bad argument type' (M-axis CONJ inner-Tagged rejection; pins symmetry with V-axis)`);
    }
  } finally {
    setAngle(_prevAngle);
  }
}

/* ================================================================
 — Cluster 1: Forward trig SIN / COS / TAN EXACT-mode
   `_exactUnaryLift` Integer-stay-exact / Rational-stay-symbolic
   contract on bare scalars.

 Surfaced as a candidate at the end of 's log:

     "EXACT-mode Integer-stay-exact path for trig forward family
      (SIN/COS/TAN) on the bare-scalar axis — `SIN(Integer(0))` →
      `Integer(0)` is the trivial fold; `SIN(Integer(180))` DEG →
      `Integer(0)` (round-to-integer through the angle mode); both
      are already lightly exercised by the test-numerics block but
      not as a structured stay-exact cluster like Cluster 1 above."

   `_trigFwdCx` (`ops.js:8027`) routes Integer / Rational inputs in
   EXACT mode through `_exactUnaryLift(name, realFn(toRadians(x)),
   v)` — distinct from `_unaryCx` because the angle-mode conversion
   `toRadians` is applied to the Integer / Rational input BEFORE
   the numeric primitive (Math.sin / Math.cos / Math.tan), and the
   integer-clean check fires on the raw radian-domain result
   (since the forward trig family does not invert through
   `fromRadians`, unlike ASIN / ACOS / ATAN).

   `_exactUnaryLift` (`ops.js:1141`) rounds a finite numeric result
   to the nearest integer and folds to `Integer(rounded)` when the
   absolute difference is < 1e-12; otherwise it returns
   `Symbolic(AstFn(name, [_toAst(v)]))`.  Math.sin / Math.cos /
   Math.tan at exact integer multiples of π are typically off by
   IEEE-double drift on the order of 1e-16, which falls under the
   tolerance — so `SIN(Integer(180))` DEG folds to Integer(0)
   even though Math.sin(Math.PI) ≈ 1.22e-16.

   This cluster pins the integer-clean fold, the stay-symbolic
   fall-through, the angle-mode flip on the same operand, the
   APPROX-mode bypass (which routes through the Real-result path
   instead of `_exactUnaryLift`), and the Rational stay-symbolic
 contract. Mirror of 's inverse-trig +
   inverse-hyp pattern, extended to the forward-trig axis. */
{
  const _prevAngle = calcState.angle;
  setAngle('RAD');
  try {
    // RAD-mode integer-clean folds at the trivial zero argument.
    // sin(0)=0, cos(0)=1, tan(0)=0 — all exact in IEEE-double, so
    // `_exactUnaryLift`'s round-to-integer check fires trivially.
    {
      const s = new Stack();
      s.push(Integer(0n));
      lookup('SIN').fn(s);
      const v = s.peek();
      assert(isInteger(v) && v.value === 0n,
        `session145: SIN(Integer(0)) RAD → Integer(0) (sin(0)=0 trivial integer-clean fold via _exactUnaryLift); got ${v?.type}(${v?.value?.toString?.()})`);
    }
    {
      const s = new Stack();
      s.push(Integer(0n));
      lookup('COS').fn(s);
      const v = s.peek();
      assert(isInteger(v) && v.value === 1n,
        `session145: COS(Integer(0)) RAD → Integer(1) (cos(0)=1 integer-clean; non-zero Integer output pins the fold actually ran); got ${v?.type}(${v?.value?.toString?.()})`);
    }
    {
      const s = new Stack();
      s.push(Integer(0n));
      lookup('TAN').fn(s);
      const v = s.peek();
      assert(isInteger(v) && v.value === 0n,
        `session145: TAN(Integer(0)) RAD → Integer(0) (tan(0)=0 integer-clean; closes SIN/COS/TAN RAD-mode zero trio); got ${v?.type}(${v?.value?.toString?.()})`);
    }

    // RAD-mode stay-symbolic on a non-clean operand.  sin(1) ≈
    // 0.8414…, more than 1e-12 away from 0 or 1, so
    // `_exactUnaryLift` returns Symbolic(AstFn('SIN', [Num(1)])).
    {
      const s = new Stack();
      s.push(Integer(1n));
      lookup('SIN').fn(s);
      const v = s.peek();
      assert(v?.type === 'symbolic' && v.expr?.kind === 'fn' && v.expr.name === 'SIN'
          && v.expr.args.length === 1 && v.expr.args[0]?.kind === 'num' && v.expr.args[0].value === 1,
        `session145: SIN(Integer(1)) RAD → Symbolic SIN(1) (sin(1)≈0.841 not integer-clean — stay-symbolic via _exactUnaryLift); got ${v?.type} expr=${JSON.stringify(v?.expr)}`);
    }
    {
      const s = new Stack();
      s.push(Integer(1n));
      lookup('COS').fn(s);
      const v = s.peek();
      assert(v?.type === 'symbolic' && v.expr?.kind === 'fn' && v.expr.name === 'COS',
        `session145: COS(Integer(1)) RAD → Symbolic COS(1) (cos(1)≈0.540 not integer-clean); got ${v?.type} expr=${JSON.stringify(v?.expr)}`);
    }

    // Angle-mode flip — same Integer(180) operand, two angle modes,
    // the EXACT-mode lift falls on opposite sides of the integer-
    // clean check.  In RAD, sin(180 rad) ≈ -0.801, stay-symbolic.
    // In DEG, sin(180°) = sin(π) ≈ 1.22e-16 < 1e-12 → Integer(0).
    {
      const s = new Stack();
      s.push(Integer(180n));
      lookup('SIN').fn(s);
      const v = s.peek();
      assert(v?.type === 'symbolic' && v.expr?.kind === 'fn' && v.expr.name === 'SIN'
          && v.expr.args[0]?.kind === 'num' && v.expr.args[0].value === 180,
        `session145: SIN(Integer(180)) RAD → Symbolic SIN(180) (sin(180 rad)≈-0.801 not integer-clean — angle-mode flips this branch from the DEG integer-clean case below); got ${v?.type} expr=${JSON.stringify(v?.expr)}`);
    }

    setAngle('DEG');

    // DEG-mode integer-clean folds at multiples of 90°.  IEEE-double
    // drift on Math.sin(Math.PI) is ~1.22e-16, on Math.cos(Math.PI/2)
    // is ~6.12e-17 — both well under the 1e-12 tolerance, so they
    // all fold to Integer(0) / Integer(±1).  Pins the contract that
    // the angle-mode conversion happens INSIDE the EXACT lift's
    // numeric path (toRadians is applied before realFn).
    {
      const s = new Stack();
      s.push(Integer(180n));
      lookup('SIN').fn(s);
      const v = s.peek();
      assert(isInteger(v) && v.value === 0n,
        `session145: SIN(Integer(180)) DEG → Integer(0) (sin(π)≈1.22e-16 < 1e-12 → round-to-integer; same operand as RAD pin above flips integer-clean under DEG); got ${v?.type}(${v?.value?.toString?.()})`);
    }
    {
      const s = new Stack();
      s.push(Integer(90n));
      lookup('COS').fn(s);
      const v = s.peek();
      assert(isInteger(v) && v.value === 0n,
        `session145: COS(Integer(90)) DEG → Integer(0) (cos(π/2)≈6.12e-17 → round-to-integer; pins the cos-zero-multiple-of-90° fold); got ${v?.type}(${v?.value?.toString?.()})`);
    }
    {
      const s = new Stack();
      s.push(Integer(180n));
      lookup('COS').fn(s);
      const v = s.peek();
      assert(isInteger(v) && v.value === -1n,
        `session145: COS(Integer(180)) DEG → Integer(-1) (cos(π)=-1 exact in double; non-zero Integer output pins the fold actually ran on the cos arm); got ${v?.type}(${v?.value?.toString?.()})`);
    }
    {
      const s = new Stack();
      s.push(Integer(45n));
      lookup('TAN').fn(s);
      const v = s.peek();
      assert(isInteger(v) && v.value === 1n,
        `session145: TAN(Integer(45)) DEG → Integer(1) (tan(π/4)=1 integer-clean; closes SIN/COS/TAN DEG integer-clean trio); got ${v?.type}(${v?.value?.toString?.()})`);
    }

    // DEG-mode stay-symbolic on a fractional output.  sin(30°)=0.5
    // is the canonical "Integer-input but non-integer output" case
    // in DEG — the `_exactUnaryLift` integer-clean check fails on
    // 0.5 (Math.abs(0.5 - 0) = 0.5 ≫ 1e-12), so the symbolic-stay
    // path fires.  Pins the negative side of the fold contract on
    // the DEG axis.
    {
      const s = new Stack();
      s.push(Integer(20n));
      lookup('SIN').fn(s);
      const v = s.peek();
      assert(v?.type === 'symbolic' && v.expr?.kind === 'fn' && v.expr.name === 'SIN'
          && v.expr.args[0]?.kind === 'num' && v.expr.args[0].value === 20,
        `session145: SIN(Integer(20)) DEG → Symbolic SIN(20) (sin(20°) has no closed form; pins the stay-symbolic arm on the DEG axis, 30 SIN being 1/2); got ${v?.type} expr=${JSON.stringify(v?.expr)}`);
    }

    setAngle('RAD');

    // Rational stay-symbolic — the Rational arm of the EXACT-mode
    // path computes `Number(v.n) / Number(v.d)` to feed the
    // numeric primitive, but the SYMBOLIC payload built by
    // `_exactUnaryLift` carries the AST shape `Bin('/', Num(1),
    // Num(2))` so the rational survives in the symbolic result.
    // Mirror of 's `ASIN(Rational(1,3)) DEG`
    // pin but on the forward-trig axis where the rational stays
    // symbolic in RAD too (sin(0.5) ≈ 0.479 is not integer-clean).
    {
      const s = new Stack();
      s.push(Rational(1n, 2n));
      lookup('SIN').fn(s);
      const v = s.peek();
      assert(v?.type === 'symbolic' && v.expr?.kind === 'fn' && v.expr.name === 'SIN'
          && v.expr.args.length === 1
          && v.expr.args[0]?.kind === 'bin' && v.expr.args[0].op === '/'
          && v.expr.args[0].l?.value === 1 && v.expr.args[0].r?.value === 2,
        `session145: SIN(Rational(1,2)) RAD → Symbolic SIN(1/2) (Rational arm: numeric path uses 0.5; symbolic payload carries Bin('/', Num(1), Num(2))); got ${v?.type} expr=${JSON.stringify(v?.expr)}`);
    }

    // APPROX-mode bypass: `setApproxMode(true)` flips
    // `getApproxMode()` to true so the EXACT-mode Integer/Rational
    // branch in `_trigFwdCx` is skipped — Integer(0) routes
    // straight through `Real(realFn(toRadians(toRealOrThrow(v))))`
    // and emits Real(0), NOT Integer(0).  Pins the contract that
    // `_exactUnaryLift` is gated by the EXACT-mode check.
    setApproxMode(true);
    try {
      const s = new Stack();
      s.push(Integer(0n));
      lookup('SIN').fn(s);
      const v = s.peek();
      assert(isReal(v) && v.value.eq(0),
        `session145: SIN(Integer(0)) RAD APPROX → Real(0) (APPROX-mode bypass; _exactUnaryLift skipped — the same operand under EXACT folds to Integer(0)); got ${v?.type}(${v?.value?.toString?.()})`);
    } finally {
      setApproxMode(false);
    }
  } finally {
    setAngle(_prevAngle);
  }
}

/* ================================================================
 — Cluster 2: LN / LOG / EXP / ALOG EXACT-mode
   `_exactUnaryLift` Integer-stay-exact / Rational-stay-symbolic
   contract on bare scalars.

 Surfaced as a candidate at the end of 's log:

     "EXACT-mode Integer-stay-exact for `LN(Integer(1))` /
      `EXP(Integer(0))` / `ALOG(Integer(0))` / `LOG(Integer(1))`
      — these are mentioned in the `_exactUnaryLift` doc-comment
      (`ops.js:1130-1137`) as the canonical examples but have no
      direct stay-exact pin.  Would extend Cluster 1's pattern to
      the unary-real family."

   LN / LOG / EXP / ALOG dispatch through `_unaryCx`
   (`ops.js:7984`).  The EXACT-mode Integer / Rational arm calls
   `_exactUnaryLift(name, realFn(x), v)` where `realFn` is
   `Math.log` / `Math.log10` / `Math.exp` / `(x) => Math.pow(10, x)`.
   Distinct from forward trig (Cluster 1 above) — there is no angle-
   mode conversion: the fold operates directly on the Integer /
   Rational value.

   `_exactUnaryLift` is the same helper as Cluster 1 — it rounds a
   finite numeric result to integer if within 1e-12, else returns
   `Symbolic(AstFn(name, [_toAst(v)]))`.  The four ops in this
   cluster are the canonical examples called out in the
   `_exactUnaryLift` doc-comment.  This cluster pins the canonical
   integer-clean folds (LN(1)=0, LOG(10)=1, EXP(0)=1, ALOG(2)=100),
   the stay-symbolic fall-through, the APPROX-mode bypass, and the
   Rational stay-exact / stay-symbolic boundaries. */
{
  // LN / LOG / EXP / ALOG do not depend on angle mode — no
  // try/finally guard needed.  `setApproxMode` is restored
  // explicitly inside the APPROX block.

  // LN(Integer(1)) → Integer(0).  ln(1)=0 exact in double; the
  // canonical "trivial" example in the `_exactUnaryLift`
  // doc-comment.
  {
    const s = new Stack();
    s.push(Integer(1n));
    lookup('LN').fn(s);
    const v = s.peek();
    assert(isInteger(v) && v.value === 0n,
      `session145: LN(Integer(1)) → Integer(0) (ln(1)=0 trivial integer-clean fold via _exactUnaryLift; canonical doc-comment example); got ${v?.type}(${v?.value?.toString?.()})`);
  }

  // LN(Integer(2)) → Symbolic LN(2).  ln(2) ≈ 0.693… is not
  // integer-clean; pins the negative side of the LN fold.
  {
    const s = new Stack();
    s.push(Integer(2n));
    lookup('LN').fn(s);
    const v = s.peek();
    assert(v?.type === 'symbolic' && v.expr?.kind === 'fn' && v.expr.name === 'LN'
        && v.expr.args[0]?.kind === 'num' && v.expr.args[0].value === 2,
      `session145: LN(Integer(2)) → Symbolic LN(2) (ln(2)≈0.693 not integer-clean — stay-symbolic via _exactUnaryLift); got ${v?.type} expr=${JSON.stringify(v?.expr)}`);
  }

  // LOG(Integer(1)) → Integer(0); LOG(Integer(10)) → Integer(1);
  // LOG(Integer(100)) → Integer(2); LOG(Integer(1000)) → Integer(3).
  // Powers-of-ten fold cleanly (Math.log10 returns exact integers
  // for these inputs), pinning multiple non-zero-output integer-clean
  // results on the LOG arm.
  {
    const s = new Stack();
    s.push(Integer(1n));
    lookup('LOG').fn(s);
    const v = s.peek();
    assert(isInteger(v) && v.value === 0n,
      `session145: LOG(Integer(1)) → Integer(0) (log10(1)=0); got ${v?.type}(${v?.value?.toString?.()})`);
  }
  {
    const s = new Stack();
    s.push(Integer(10n));
    lookup('LOG').fn(s);
    const v = s.peek();
    assert(isInteger(v) && v.value === 1n,
      `session145: LOG(Integer(10)) → Integer(1) (log10(10)=1 exact); got ${v?.type}(${v?.value?.toString?.()})`);
  }
  {
    const s = new Stack();
    s.push(Integer(100n));
    lookup('LOG').fn(s);
    const v = s.peek();
    assert(isInteger(v) && v.value === 2n,
      `session145: LOG(Integer(100)) → Integer(2) (log10(100)=2 exact); got ${v?.type}(${v?.value?.toString?.()})`);
  }
  {
    const s = new Stack();
    s.push(Integer(1000n));
    lookup('LOG').fn(s);
    const v = s.peek();
    assert(isInteger(v) && v.value === 3n,
      `session145: LOG(Integer(1000)) → Integer(3) (log10(1000)=3 exact; closes the powers-of-ten LOG trio); got ${v?.type}(${v?.value?.toString?.()})`);
  }

  // LOG(Integer(2)) → Symbolic LOG(2).  log10(2) ≈ 0.301 is not
  // integer-clean; negative side of the LOG fold.
  {
    const s = new Stack();
    s.push(Integer(2n));
    lookup('LOG').fn(s);
    const v = s.peek();
    assert(v?.type === 'symbolic' && v.expr?.kind === 'fn' && v.expr.name === 'LOG'
        && v.expr.args[0]?.kind === 'num' && v.expr.args[0].value === 2,
      `session145: LOG(Integer(2)) → Symbolic LOG(2) (log10(2)≈0.301 not integer-clean); got ${v?.type} expr=${JSON.stringify(v?.expr)}`);
  }

  // EXP(Integer(0)) → Integer(1).  exp(0)=1 exact; canonical
  // doc-comment example.
  {
    const s = new Stack();
    s.push(Integer(0n));
    lookup('EXP').fn(s);
    const v = s.peek();
    assert(isInteger(v) && v.value === 1n,
      `session145: EXP(Integer(0)) → Integer(1) (exp(0)=1 trivial integer-clean fold; canonical doc-comment example); got ${v?.type}(${v?.value?.toString?.()})`);
  }

  // EXP(Integer(1)) → Symbolic EXP(1).  e ≈ 2.718… is not
  // integer-clean; negative side of the EXP fold.  Pins that
  // EXP(1)=e stays symbolic — a future change that pre-folded e
  // to a Real or Decimal constant would surface here.
  {
    const s = new Stack();
    s.push(Integer(1n));
    lookup('EXP').fn(s);
    const v = s.peek();
    assert(v?.type === 'symbolic' && v.expr?.kind === 'fn' && v.expr.name === 'EXP'
        && v.expr.args[0]?.kind === 'num' && v.expr.args[0].value === 1,
      `session145: EXP(Integer(1)) → Symbolic EXP(1) (e≈2.718 not integer-clean — stay-symbolic preserves the unevaluated e); got ${v?.type} expr=${JSON.stringify(v?.expr)}`);
  }

  // ALOG(Integer(0)) → Integer(1).  10^0 = 1 exact; canonical
  // doc-comment example.
  {
    const s = new Stack();
    s.push(Integer(0n));
    lookup('ALOG').fn(s);
    const v = s.peek();
    assert(isInteger(v) && v.value === 1n,
      `session145: ALOG(Integer(0)) → Integer(1) (10^0=1 canonical doc-comment example); got ${v?.type}(${v?.value?.toString?.()})`);
  }

  // ALOG(Integer(2)) → Integer(100); ALOG(Integer(3)) →
  // Integer(1000).  Larger non-zero integer outputs pin that
  // `_exactUnaryLift` rounds back to BigInt without precision
  // loss (Math.pow(10, 2) = 100 exact, Math.pow(10, 3) = 1000
  // exact in double).  Closes the ALOG arm with the LOG inverse
  // — LOG(100)=2 from above paired with ALOG(2)=100 here.
  {
    const s = new Stack();
    s.push(Integer(2n));
    lookup('ALOG').fn(s);
    const v = s.peek();
    assert(isInteger(v) && v.value === 100n,
      `session145: ALOG(Integer(2)) → Integer(100) (10^2=100 integer-clean — pins the LOG/ALOG inverse: ALOG(2) here mirrors LOG(100)=2 above); got ${v?.type}(${v?.value?.toString?.()})`);
  }
  {
    const s = new Stack();
    s.push(Integer(3n));
    lookup('ALOG').fn(s);
    const v = s.peek();
    assert(isInteger(v) && v.value === 1000n,
      `session145: ALOG(Integer(3)) → Integer(1000) (10^3=1000 integer-clean; closes ALOG positive-integer trio); got ${v?.type}(${v?.value?.toString?.()})`);
  }

  // ALOG(Integer(-1)) is the exact fraction 1/10, as on the HP 50g: a power of ten
  // stays exact instead of collapsing to a double.
  {
    const s = new Stack();
    s.push(Integer(-1n));
    lookup('ALOG').fn(s);
    const v = s.peek();
    assert(v?.type === 'rational' && v.n === 1n && v.d === 10n,
      `ALOG(Integer(-1)) → exact 1/10; got ${v?.type} ${v?.n}/${v?.d}`);
  }

  // Rational arm — Rational(1,1) → 1.0 (the numeric path divides
  // numerator by denominator), so LN(Rational(1,1)) → ln(1) = 0
  // → Integer(0).  Pins that the Rational arm of the EXACT-mode
  // path can produce an Integer result via `_exactUnaryLift` when
  // the underlying numeric value happens to be integer-clean.
  // Distinct from 's ASIN(Rational(1,2))=30
  // pin — there the angle-mode `fromRadians` produced the integer-
  // clean output; here it's the Rational value itself collapsing
  // to 1.0 before the numeric primitive runs.
  {
    const s = new Stack();
    s.push(Rational(1n, 1n));
    lookup('LN').fn(s);
    const v = s.peek();
    assert(isInteger(v) && v.value === 0n,
      `session145: LN(Rational(1,1)) → Integer(0) (Rational arm: 1/1=1.0 → ln(1)=0 → Integer-clean fold; pins that the Rational arm can produce Integer results when the numeric value is integer-clean); got ${v?.type}(${v?.value?.toString?.()})`);
  }

  // Rational stay-symbolic on a non-clean Rational value.
  // Rational(1,2) → 0.5; ln(0.5) ≈ -0.693, not integer-clean →
  // Symbolic.  The symbolic payload carries the AST shape
  // `Bin('/', Num(1), Num(2))` so the Rational survives.  Mirror
  // of Cluster 1's SIN(Rational(1,2)) RAD pin on the LN arm.
  {
    const s = new Stack();
    s.push(Rational(1n, 2n));
    lookup('LN').fn(s);
    const v = s.peek();
    assert(v?.type === 'symbolic' && v.expr?.kind === 'fn' && v.expr.name === 'LN'
        && v.expr.args.length === 1
        && v.expr.args[0]?.kind === 'bin' && v.expr.args[0].op === '/'
        && v.expr.args[0].l?.value === 1 && v.expr.args[0].r?.value === 2,
      `session145: LN(Rational(1,2)) → Symbolic LN(1/2) (ln(0.5)≈-0.693 not integer-clean; symbolic payload preserves Bin('/',1,2)); got ${v?.type} expr=${JSON.stringify(v?.expr)}`);
  }

  // APPROX-mode bypass: same operand that folded to Integer(0)
  // above now routes through the Real-result path and emits
  // Real(0) (NOT Integer).  Pins that `_exactUnaryLift` is gated
  // by the `!getApproxMode()` check in `_unaryCx`.
  setApproxMode(true);
  try {
    {
      const s = new Stack();
      s.push(Integer(1n));
      lookup('LN').fn(s);
      const v = s.peek();
      assert(isReal(v) && v.value.eq(0),
        `session145: LN(Integer(1)) APPROX → Real(0) (APPROX-mode bypass; _exactUnaryLift skipped — same operand under EXACT folds to Integer(0)); got ${v?.type}(${v?.value?.toString?.()})`);
    }
    {
      const s = new Stack();
      s.push(Integer(100n));
      lookup('LOG').fn(s);
      const v = s.peek();
      assert(isReal(v) && v.value.eq(2),
        `session145: LOG(Integer(100)) APPROX → Real(2) (APPROX bypass on LOG; the integer-clean output value 2 still emerges, but as Real not Integer — pins that APPROX-mode flips the result KIND not the result VALUE); got ${v?.type}(${v?.value?.toString?.()})`);
    }
    {
      const s = new Stack();
      s.push(Integer(0n));
      lookup('EXP').fn(s);
      const v = s.peek();
      assert(isReal(v) && v.value.eq(1),
        `session145: EXP(Integer(0)) APPROX → Real(1) (APPROX bypass on EXP; closes the LN/LOG/EXP APPROX trio); got ${v?.type}(${v?.value?.toString?.()})`);
    }
  } finally {
    setApproxMode(false);
  }
}

/* ================================================================
 — Cluster 3: SIN / COS / TAN EXACT-mode integer-
   stay-exact path under Tagged-V/M wrapper composition + RE / IM
   M-axis inner-Tagged rejection (closes the ARG/CONJ/RE/IM × V/M
 inner-Tagged-rejection grid that left
   half-open).

 Surfaced as a candidate at the end of 's log:

     "Inner-Tagged-inside-Vector rejection on the M-axis for RE
      and IM — Cluster 3 above pinned ARG and CONJ on the M-axis
      but not RE/IM (the V-axis was pinned on all four; the
      M-axis was pinned on ARG and CONJ since they exercise
      different per-element handlers).  Adding the RE/IM M-axis
      pins would close the 4-op × 2-axis grid completely."

   Two halves:

   (a) **Forward trig EXACT-mode integer-stay-exact under
       Tagged-V/M wrapper composition.**
       pinned `:v:Vector(0, 0) SIN` → `:v:Vector(0, 0)` (Real
 inputs, transcendental zero-fold) and
       extension also pinned the `_exactUnaryLift` Integer-stay-
       exact path under Tagged-V on SINH (`:h:Vector(Integer(0),
       Integer(0)) SINH` → `:h:Vector(Integer(0), Integer(0))`).
       The forward-trig (`SIN/COS/TAN`) EXACT-mode integer-stay-
       exact path under the same 3-deep wrapper was unpinned —
       Cluster 1 above closed the bare-scalar axis but not the
       Tagged-V/M composition where `_trigFwdCx` runs INSIDE
       `_withTaggedUnary(_withListUnary(_withVMUnary(...)))` on
       per-element Integer inputs.  The DEG-mode angle-flip
       (`SIN(Integer(180))` DEG → Integer(0)) under the wrapper
       chain pins that the angle-mode-aware integer-clean check
       composes element-wise across V/M under outer Tagged.

   (b) **RE / IM M-axis inner-Tagged-inside-Matrix rejection.**
       pinned ARG and CONJ on the M-axis;
       the per-element handlers `_reScalar` / `_imScalar` are
       distinct from `_argScalar` / `_conjScalar` so the V-axis
 pins from don't transitively cover the M-axis
       (the bespoke V/M handler for RE / IM dispatches via
       `v.rows.map(r => r.map(_reScalar))` / `_imScalar`, distinct
       from the `_argScalar` / `_conjScalar` chains in the ARG /
       CONJ M-axis pins).  Closes the 4-op × 2-axis grid. */
{
  const _prevAngle = calcState.angle;
  setAngle('RAD');
  try {
    // ---- (a) Forward trig EXACT-mode integer-stay-exact under
    // Tagged-V/M wrapper composition. ----

    // SIN :v:Vector(Integer(0), Integer(0)) RAD → :v:Vector(
    // Integer(0), Integer(0)).  The 3-deep wrapper unwraps the
    // outer Tagged, distributes the SIN over the Vector via
    // `_withVMUnary`, and at each Integer(0) leaf the EXACT-mode
    // arm of `_trigFwdCx` calls `_exactUnaryLift('SIN', 0, v)` →
    // Integer(0).  Outer tag preserved across the per-element
    // EXACT-mode integer-clean fold. Mirror of
    // Cluster 1's SINH(Integer(0)) Tagged-V pin on the forward-
    // trig axis.
    {
      const s = new Stack();
      s.push(Tagged('v', Vector([Integer(0n), Integer(0n)])));
      lookup('SIN').fn(s);
      const v = s.peek();
      assert(isTagged(v) && v.tag === 'v' && v.value?.type === 'vector'
          && v.value.items.length === 2
          && isInteger(v.value.items[0]) && v.value.items[0].value === 0n
          && isInteger(v.value.items[1]) && v.value.items[1].value === 0n,
        `session145: SIN :v:Vector(Integer(0), Integer(0)) RAD → :v:Vector(Integer(0), Integer(0)) (EXACT-mode _exactUnaryLift Integer-stay-exact composes through 3-deep wrapper-VM under Tagged on the forward-trig axis; mirror of session-140 Cluster 1's SINH Tagged-V Integer-stay-exact pin); got tag=${v?.tag} items=${v?.value?.items?.map(x => `${x.type}(${x.value?.toString?.()})`).join(',')}`);
    }

    // COS :v:Vector(Integer(0), Integer(0)) RAD → :v:Vector(
    // Integer(1), Integer(1)).  Non-identity output value pins
    // the inner handler actually ran (cos(0)=1, distinct from
    // sin(0)=0 which produces an identity-shaped output that
    // could be mistaken for a no-op).
    {
      const s = new Stack();
      s.push(Tagged('v', Vector([Integer(0n), Integer(0n)])));
      lookup('COS').fn(s);
      const v = s.peek();
      assert(isTagged(v) && v.tag === 'v' && v.value?.type === 'vector'
          && v.value.items.length === 2
          && isInteger(v.value.items[0]) && v.value.items[0].value === 1n
          && isInteger(v.value.items[1]) && v.value.items[1].value === 1n,
        `session145: COS :v:Vector(Integer(0), Integer(0)) RAD → :v:Vector(Integer(1), Integer(1)) (cos(0)=1; non-identity output value pins inner handler ran on COS arm); got tag=${v?.tag} items=${v?.value?.items?.map(x => `${x.type}(${x.value?.toString?.()})`).join(',')}`);
    }

    // TAN :v:Vector(Integer(0), Integer(0)) RAD → :v:Vector(
    // Integer(0), Integer(0)).  Closes the SIN/COS/TAN trio on
    // the forward-trig Tagged-V wrapper composition.
    {
      const s = new Stack();
      s.push(Tagged('v', Vector([Integer(0n), Integer(0n)])));
      lookup('TAN').fn(s);
      const v = s.peek();
      assert(isTagged(v) && v.tag === 'v' && v.value?.type === 'vector'
          && v.value.items.length === 2
          && isInteger(v.value.items[0]) && v.value.items[0].value === 0n
          && isInteger(v.value.items[1]) && v.value.items[1].value === 0n,
        `session145: TAN :v:Vector(Integer(0), Integer(0)) RAD → :v:Vector(Integer(0), Integer(0)) (closes SIN/COS/TAN forward-trig Tagged-V Integer-stay-exact trio); got tag=${v?.tag} items=${v?.value?.items?.map(x => `${x.type}(${x.value?.toString?.()})`).join(',')}`);
    }

    // DEG-mode angle-flip under Tagged-V wrapper composition: the
    // per-element handler still goes through `toRadians(v)` →
    // `Math.sin(...)` → `_exactUnaryLift`, but the angle-mode
    // shifts the integer-clean check onto a different operand
    // value.  `:v:Vector(Integer(0), Integer(180)) SIN` DEG →
    // `:v:Vector(Integer(0), Integer(0))` because sin(0°)=0 AND
    // sin(180°)≈1.22e-16 < 1e-12 both fold to Integer(0).  The
    // RAD pin above had Integer(180) stay-symbolic (sin(180 rad)
    // ≈-0.801 not integer-clean) — but in DEG it folds.  Pins
    // that the EXACT-mode angle-mode-aware fold composes element-
    // wise under outer Tagged-V — same angle-mode-flip contract
    // pinned in Cluster 1 on bare scalars, here extended to the
    // V-axis through the wrapper chain.
    setAngle('DEG');
    {
      const s = new Stack();
      s.push(Tagged('v', Vector([Integer(0n), Integer(180n)])));
      lookup('SIN').fn(s);
      const v = s.peek();
      assert(isTagged(v) && v.tag === 'v' && v.value?.type === 'vector'
          && v.value.items.length === 2
          && isInteger(v.value.items[0]) && v.value.items[0].value === 0n
          && isInteger(v.value.items[1]) && v.value.items[1].value === 0n,
        `session145: SIN :v:Vector(Integer(0), Integer(180)) DEG → :v:Vector(Integer(0), Integer(0)) (angle-mode-aware integer-clean fold composes element-wise; sin(180°) ≈ 1.22e-16 < 1e-12 folds to Integer(0) in DEG but stays symbolic in RAD — operand-position-1 flips between the two angle modes); got tag=${v?.tag} items=${v?.value?.items?.map(x => `${x.type}(${x.value?.toString?.()})`).join(',')}`);
    }

    // COS :v:Vector(Integer(0), Integer(90)) DEG → :v:Vector(
    // Integer(1), Integer(0)).  Mixed integer-clean output values
    // (cos(0°)=1, cos(90°)≈6.12e-17 → 0) pin that distinct
    // outputs at distinct positions all fold cleanly under the
    // wrapper chain.
    {
      const s = new Stack();
      s.push(Tagged('v', Vector([Integer(0n), Integer(90n)])));
      lookup('COS').fn(s);
      const v = s.peek();
      assert(isTagged(v) && v.tag === 'v' && v.value?.type === 'vector'
          && v.value.items.length === 2
          && isInteger(v.value.items[0]) && v.value.items[0].value === 1n
          && isInteger(v.value.items[1]) && v.value.items[1].value === 0n,
        `session145: COS :v:Vector(Integer(0), Integer(90)) DEG → :v:Vector(Integer(1), Integer(0)) (mixed integer-clean output values: cos(0°)=1 and cos(90°)≈6.12e-17→0; pins that distinct integer outputs at distinct V positions all fold under the wrapper chain); got tag=${v?.tag} items=${v?.value?.items?.map(x => `${x.type}(${x.value?.toString?.()})`).join(',')}`);
    }

    // SIN :m:Matrix([[Integer(0), Integer(180)], [Integer(0),
    // Integer(0)]]) DEG → :m:Matrix([[0,0],[0,0]]).  Matrix-axis
    // EXACT-mode integer-clean fold under Tagged composition.
    // Per-entry sin(0°)=0 and sin(180°)→1.22e-16→0 all fold to
    // Integer(0); outer tag preserved + Matrix kind preserved.
    // Mirror of 's SINH Tagged-Matrix pin
    // on the forward-trig axis.
    {
      const s = new Stack();
      s.push(Tagged('m', Matrix([[Integer(0n), Integer(180n)], [Integer(0n), Integer(0n)]])));
      lookup('SIN').fn(s);
      const v = s.peek();
      const okShape = isTagged(v) && v.tag === 'm' && v.value?.type === 'matrix'
          && v.value.rows.length === 2 && v.value.rows[0].length === 2;
      const okValues = okShape
          && isInteger(v.value.rows[0][0]) && v.value.rows[0][0].value === 0n
          && isInteger(v.value.rows[0][1]) && v.value.rows[0][1].value === 0n
          && isInteger(v.value.rows[1][0]) && v.value.rows[1][0].value === 0n
          && isInteger(v.value.rows[1][1]) && v.value.rows[1][1].value === 0n;
      assert(okShape && okValues,
        `session145: SIN :m:Matrix([[0,180],[0,0]]) DEG → :m:Matrix([[0,0],[0,0]]) (per-entry integer-clean fold under outer Tagged + M-axis wrapper-VM; closes forward-trig Tagged-M Integer-stay-exact path); got tag=${v?.tag} rows=${v?.value?.rows?.map(r => r.map(x => `${x.type}(${x.value?.toString?.()})`).join(',')).join('|')}`);
    }
    setAngle('RAD');

    // ---- (b) RE / IM M-axis inner-Tagged-inside-Matrix rejection.
    // Closes the 4-op × 2-axis grid that
    // half-opened. ----

    // RE on a Matrix containing a Tagged scalar inside an entry —
    // the bespoke handler iterates `v.rows.map(r => r.map(
    // _reScalar))`; `_reScalar` is not Tagged-aware and rejects
    // with 'Bad argument type'. M-axis mirror of
    // Cluster 3's V-axis RE pin and ARG / CONJ M-axis pins.
    {
      const s = new Stack();
      s.push(Matrix([[Tagged('x', Complex(3, 4))]]));
      assertThrows(() => lookup('RE').fn(s), /Bad argument type/i,
        `session145: Matrix([[:x:Complex(3,4)]]) RE → 'Bad argument type' (M-axis RE inner-Tagged rejection — bespoke _reScalar in r.map(_reScalar) chain not Tagged-aware; closes ARG/CONJ/RE/IM × V/M inner-Tagged-rejection grid alongside session-142 Cluster 3 ARG/CONJ M-axis pins)`);
    }

    // IM with same shape — `_imScalar` rejects Tagged.  Pins
    // that the rejection is not specific to the per-element
    // handler's value-extraction logic (RE returns the real
    // part, IM returns the imaginary part — distinct numeric
    // operations but the same Tagged-not-aware contract holds
    // on both).
    {
      const s = new Stack();
      s.push(Matrix([[Tagged('x', Complex(3, 4))]]));
      assertThrows(() => lookup('IM').fn(s), /Bad argument type/i,
        `session145: Matrix([[:x:Complex(3,4)]]) IM → 'Bad argument type' (M-axis IM inner-Tagged rejection; closes the 4-op × 2-axis inner-Tagged-rejection grid)`);
    }

    // RE on a Matrix where the Tagged element is at a NON-(0,0)
    // position — the rejection still fires.  Pins that
    // `_reScalar`'s rejection runs at every iteration of the
    // `.map(_reScalar)` chain, not only on the first element.
    // (Without this, a future change that bailed out early
    // before reaching the inner Tagged could pass the (0,0)-pin
    // above silently.)
    {
      const s = new Stack();
      s.push(Matrix([[Real(5), Tagged('x', Complex(3, 4))]]));
      assertThrows(() => lookup('RE').fn(s), /Bad argument type/i,
        `session145: Matrix([[Real(5), :x:Complex(3,4)]]) RE → 'Bad argument type' (Tagged at row[0][1] still rejects — rejection fires at every entry-position, not only (0,0); contrast pin against an early-bail-out implementation)`);
    }

    // IM with the Tagged element on a different row — pins
    // multi-row iteration also reaches the Tagged-rejection
    // path.  The two preceding pins covered the row[0] axis;
    // this pin covers the row[1] axis.  Together they pin that
    // the row-iteration AND column-iteration both reach the
    // per-element rejection.
    {
      const s = new Stack();
      s.push(Matrix([[Real(5)], [Tagged('x', Complex(3, 4))]]));
      assertThrows(() => lookup('IM').fn(s), /Bad argument type/i,
        `session145: Matrix([[Real(5)],[:x:Complex(3,4)]]) IM → 'Bad argument type' (Tagged at row[1][0] still rejects — pins multi-row iteration reaches the per-element rejection on the IM arm)`);
    }

    // session231: CONJ / RE / IM Q (Rational) widening.
    // session226 filed rejection pins for CONJ/RE/IM on Rational (Q ⊂ R).
    // session231 adds `isRational(v)` branches to all three scalars:
    //   _conjScalar: returns v unchanged (conjugate of a real is itself)
    //   _reScalar:   returns v unchanged (real part of a real is itself)
    //   _imScalar:   returns Integer(0n) (imaginary part of a real is 0)
    // Flips DATA_TYPES.md Q ✗ → ✓ for CONJ / RE / IM.
    {
      const s = new Stack();
      s.push(Rational(1n, 2n));
      lookup('CONJ').fn(s);
      const r = s.pop();
      assert(isRational(r) && r.n === 1n && r.d === 2n,
        `session231: CONJ Rational(1,2) → Rational(1,2) (conjugate of real rational is identity)`);
    }
    {
      const s = new Stack();
      s.push(Rational(-3n, 4n));
      lookup('CONJ').fn(s);
      const r = s.pop();
      assert(isRational(r) && r.n === -3n && r.d === 4n,
        `session231: CONJ Rational(-3,4) → Rational(-3,4) (negative rational: conjugate is identity)`);
    }
    {
      const s = new Stack();
      s.push(Rational(1n, 2n));
      lookup('RE').fn(s);
      const r = s.pop();
      assert(isRational(r) && r.n === 1n && r.d === 2n,
        `session231: RE Rational(1,2) → Rational(1,2) (real part of real rational is itself)`);
    }
    {
      const s = new Stack();
      s.push(Rational(1n, 2n));
      lookup('IM').fn(s);
      const r = s.pop();
      assert(isInteger(r) && r.value === 0n,
        `session231: IM Rational(1,2) → Integer(0) (imaginary part of real rational is 0)`);
    }
  } finally {
    setAngle(_prevAngle);
  }
}

/* ================================================================
 — Cluster 1: Inverse-trig (ASIN / ACOS / ATAN) DEG-
   mode `_exactUnaryLift` Integer-stay-exact / Rational-collapse-
   clean under Tagged-V/M wrapper composition.

   pinned the inverse-trig bare-scalar
   `_exactUnaryLift` axis under DEG (e.g. `ASIN(Integer(1))` DEG →
   `Integer(90)`, `ATAN(Integer(1))` DEG → `Integer(45)`,
   `ASIN(Rational(1,2))` DEG → `Integer(30)`).
   Cluster 2 pinned the inverse-trig Tagged-of-V/M wrapper-VM
   composition under RAD with non-integer-clean output values
   (`ASIN :a:V[0,1]` RAD → `:a:V[0, π/2]` — π/2 is a Real, not an
   Integer). Cluster 3a closed the parallel pin on
   the FORWARD-trig axis (`SIN/COS/TAN` DEG-mode integer-clean
   folds under Tagged-V/M).  This cluster closes the inverse-trig
   dual: DEG-mode `_exactUnaryLift` Integer-stay-exact composes
   element-wise through `_withTaggedUnary(_withListUnary(_with
   VMUnary(handler)))` so that a Tagged-Vector / Tagged-Matrix of
   integer-clean DEG-mode operands folds to a Tagged-Vector /
   Tagged-Matrix of Integer outputs (rather than the Real-output
   path that the RAD pins exercise).

   `_trigInvCx` (`ops.js:8246`) inverts through `fromRadians(y)`
   AFTER the numeric primitive — distinct from `_trigFwdCx`'s
   pre-primitive `toRadians` — so the integer-clean check fires
   on the angle-mode-converted output (e.g. `Math.asin(1) =
   π/2`, `fromRadians(π/2)` DEG ≈ 90.0 ± IEEE drift, which
   falls under `_exactUnaryLift`'s 1e-12 tolerance and folds to
   Integer(90)).  Under RAD the same operand produces π/2 ≈
   1.5708, which is NOT integer-clean — that's why the
 RAD pins observed `:a:V[0, Real(π/2)]` rather
   than `:a:V[Integer(0), Integer(?)]`.  The Tagged-V/M wrapper-
   VM composition therefore observably differs between angle
   modes on the same operand, and pinning the DEG-mode integer-
   clean composition closes the wrapper-composition × angle-mode
   matrix for the inverse-trig family.

 Mirror of Cluster 3a's `:m:Matrix([[0,180],[0,0]])
   SIN` DEG → `:m:Matrix([[0,0],[0,0]])` pin on the inverse-trig
 axis. Distinct from 's bare-scalar pin
   in that the wrapper composition is exercised here. */
{
  const _prevAngle = calcState.angle;
  setAngle('DEG');
  try {
    // ASIN :a:Vector(Integer(0), Integer(1)) DEG → :a:Vector(
    // Integer(0), Integer(90)).  asin(0)=0 exact, asin(1)=π/2;
    // fromRadians(π/2) DEG = 90 ± 1e-15 → integer-clean.  Mirror
    // of 's bare-scalar `ASIN(Integer(1))`
    // DEG → `Integer(90)` pin, lifted into the 3-deep Tagged-V
    // wrapper composition.  Pins that the angle-mode-aware
    // integer-clean fold runs per element AND that the outer
    // Tagged tag survives the kind-stable Vector wrapping.
    {
      const s = new Stack();
      s.push(Tagged('a', Vector([Integer(0n), Integer(1n)])));
      lookup('ASIN').fn(s);
      const v = s.peek();
      assert(isTagged(v) && v.tag === 'a' && v.value?.type === 'vector'
          && v.value.items.length === 2
          && isInteger(v.value.items[0]) && v.value.items[0].value === 0n
          && isInteger(v.value.items[1]) && v.value.items[1].value === 90n,
        `session150: ASIN :a:Vector(Integer(0), Integer(1)) DEG → :a:Vector(Integer(0), Integer(90)) (DEG-mode _exactUnaryLift Integer-stay-exact composes through 3-deep wrapper-VM under Tagged on the inverse-trig axis; mirror of session 142 Cluster 1's bare-scalar ASIN(Z(1)) DEG=Z(90) pin lifted into the wrapper composition); got tag=${v?.tag} items=${v?.value?.items?.map(x => `${x.type}(${x.value?.toString?.()})`).join(',')}`);
    }

    // ACOS :a:Vector(Integer(1), Integer(0)) DEG → :a:Vector(
    // Integer(0), Integer(90)).  Operand-symmetric to the ASIN
    // pin above (acos(1)=0, acos(0)=π/2 → 90° in DEG).  Pins
    // that ACOS shares the same `_trigInvCx` wrapper-composition
    // path as ASIN — mirror of 's
    // `ACOS(Integer(0))` DEG → `Integer(90)` pin.
    {
      const s = new Stack();
      s.push(Tagged('a', Vector([Integer(1n), Integer(0n)])));
      lookup('ACOS').fn(s);
      const v = s.peek();
      assert(isTagged(v) && v.tag === 'a' && v.value?.type === 'vector'
          && v.value.items.length === 2
          && isInteger(v.value.items[0]) && v.value.items[0].value === 0n
          && isInteger(v.value.items[1]) && v.value.items[1].value === 90n,
        `session150: ACOS :a:Vector(Integer(1), Integer(0)) DEG → :a:Vector(Integer(0), Integer(90)) (operand-symmetric to ASIN pin; closes the ASIN/ACOS pair on the DEG-mode integer-clean Tagged-V wrapper composition); got tag=${v?.tag} items=${v?.value?.items?.map(x => `${x.type}(${x.value?.toString?.()})`).join(',')}`);
    }

    // ATAN :t:Vector(Integer(0), Integer(1)) DEG → :t:Vector(
    // Integer(0), Integer(45)).  ATAN registers via the same
    // `_trigInvCx` factory as ASIN/ACOS but its primitive is
    // Math.atan (no domain check on the real branch).  atan(0)=0,
    // atan(1)=π/4; fromRadians(π/4) DEG = 45.0 ± IEEE drift →
    // integer-clean.  Closes the SIN/COS/TAN inverse trio
    // (ASIN / ACOS / ATAN) on the DEG-Tagged-V composition.
    {
      const s = new Stack();
      s.push(Tagged('t', Vector([Integer(0n), Integer(1n)])));
      lookup('ATAN').fn(s);
      const v = s.peek();
      assert(isTagged(v) && v.tag === 't' && v.value?.type === 'vector'
          && v.value.items.length === 2
          && isInteger(v.value.items[0]) && v.value.items[0].value === 0n
          && isInteger(v.value.items[1]) && v.value.items[1].value === 45n,
        `session150: ATAN :t:Vector(Integer(0), Integer(1)) DEG → :t:Vector(Integer(0), Integer(45)) (closes ASIN/ACOS/ATAN inverse-trig trio on DEG-Tagged-V wrapper composition; ATAN routes through _trigInvCx with Math.atan + fromRadians post-primitive — same wrapper composition as ASIN/ACOS, distinct primitive); got tag=${v?.tag} items=${v?.value?.items?.map(x => `${x.type}(${x.value?.toString?.()})`).join(',')}`);
    }

    // ASIN :m:Matrix([[Integer(1), Integer(0)], [Integer(0),
    // Integer(1)]]) DEG → :m:Matrix([[Integer(90), Integer(0)],
    // [Integer(0), Integer(90)]]).  Matrix-axis closure for the
    // inverse-trig DEG-mode integer-clean fold under Tagged
    // composition.  Per-entry asin(0)=0 / asin(1)=90° all fold
    // to Integer; outer tag preserved + Matrix kind preserved.
    // Mirror of Cluster 3a's SIN `:m:Matrix([[0,180]
    // ,[0,0]])` DEG → `:m:Matrix([[0,0],[0,0]])` pin on the
    // inverse-trig axis.  Pins that the wrapper-VM composition
    // dispatches `_trigInvCx`'s inner handler per Matrix entry
    // (rather than once over the whole array).
    {
      const s = new Stack();
      s.push(Tagged('m', Matrix([[Integer(1n), Integer(0n)], [Integer(0n), Integer(1n)]])));
      lookup('ASIN').fn(s);
      const v = s.peek();
      const okShape = isTagged(v) && v.tag === 'm' && v.value?.type === 'matrix'
          && v.value.rows.length === 2 && v.value.rows[0].length === 2;
      const okValues = okShape
          && isInteger(v.value.rows[0][0]) && v.value.rows[0][0].value === 90n
          && isInteger(v.value.rows[0][1]) && v.value.rows[0][1].value === 0n
          && isInteger(v.value.rows[1][0]) && v.value.rows[1][0].value === 0n
          && isInteger(v.value.rows[1][1]) && v.value.rows[1][1].value === 90n;
      assert(okShape && okValues,
        `session150: ASIN :m:Matrix([[1,0],[0,1]]) DEG → :m:Matrix([[90,0],[0,90]]) (Matrix-axis closure for inverse-trig DEG-mode integer-clean fold under Tagged composition; per-entry asin(1)=90° / asin(0)=0 all fold to Integer; mirror of session 145 Cluster 3a's forward-trig Matrix-axis pin); got tag=${v?.tag} rows=${v?.value?.rows?.map(r => r.map(x => `${x.type}(${x.value?.toString?.()})`).join(',')).join('|')}`);
    }

    // Rational arm under Tagged-V composition:  ASIN :a:Vector(
    // Rational(1,2), Integer(1)) DEG → :a:Vector(Integer(30),
    // Integer(90)).  Rational(1,2)=0.5; asin(0.5)=π/6;
    // fromRadians(π/6) DEG = 30.0 ± drift → integer-clean.
    // Distinct contract from forward-trig ( Cluster
    // 3a only exercised Integer operands within Vector / Matrix);
    // the inverse-trig Rational-arm CAN produce Integer outputs
    // when fromRadians turns the radian value into an integer
    // multiple of degrees. Mirror of 's
    // bare-scalar `ASIN(Rational(1,2))` DEG → `Integer(30)` pin
    // lifted into the wrapper composition.  Pins that the
    // Rational arm of `_trigInvCx` composes through the Tagged-V
    // wrapper too — not just the Integer arm.
    {
      const s = new Stack();
      s.push(Tagged('a', Vector([Rational(1n, 2n), Integer(1n)])));
      lookup('ASIN').fn(s);
      const v = s.peek();
      assert(isTagged(v) && v.tag === 'a' && v.value?.type === 'vector'
          && v.value.items.length === 2
          && isInteger(v.value.items[0]) && v.value.items[0].value === 30n
          && isInteger(v.value.items[1]) && v.value.items[1].value === 90n,
        `session150: ASIN :a:Vector(Rational(1,2), Integer(1)) DEG → :a:Vector(Integer(30), Integer(90)) (Rational arm of _trigInvCx composes through Tagged-V wrapper — Rational(1,2)=0.5 and asin(0.5)=π/6 → 30° integer-clean under DEG; mirror of session 142 Cluster 1's bare-scalar ASIN(Q(1/2)) DEG=Z(30) pin lifted into the wrapper); got tag=${v?.tag} items=${v?.value?.items?.map(x => `${x.type}(${x.value?.toString?.()})`).join(',')}`);
    }

    // RAD-mode contrast on the SAME Integer operand: ASIN
    // :a:Vector(Integer(0), Integer(1)) RAD → :a:Vector(
    // Integer(0), Symbolic ASIN(1)) — item[0] folds to
    // Integer(0) since asin(0)=0 is integer-clean in any
    // angle mode, but item[1] does NOT fold because asin(1)=
    // π/2 ≈ 1.5708 is NOT integer-clean under RAD; the EXACT-
    // mode integer-stay arm of `_trigInvCx` therefore returns
    // `Symbolic(AstFn('ASIN', [_toAst(Integer(1))]))` for that
    // element. Distinct from 's `:a:Vector(Real(0
    // ), Real(1)) ASIN` RAD → `:a:Vector(Real(0), Real(π/2))`
    // pin, which used Real operands and BYPASSED the EXACT-
    // mode integer-stay arm entirely (Real input is not
    // `isInteger || isRational`, so `_trigInvCx` falls
    // through to the standard Real-output path).  Pins:
    //   1. The angle-mode flip toggles integer-clean / stay-
    //      Symbolic per element under Tagged-V on the SAME
    //      Integer operands (DEG → :a:V[Z(0), Z(90)]; RAD →
    //      :a:V[Z(0), Sym(ASIN(1))]).
    //   2. The Real- vs Integer-operand contrast: same
    //      `_trigInvCx` wrapper composition, different output
    //      kinds (Real-input → Real-output; Integer-input →
    //      mixed Integer + Symbolic per element under EXACT
    //      mode).
    // Heterogeneous-kind output under wrapper composition —
    // mirror of 's `SIN(Integer(180))`
    // RAD/DEG operand-flip pin on the inverse-trig wrapper-
    // composition axis, with the additional contrast against
    // the Real-operand bypass path.
    setAngle('RAD');
    {
      const s = new Stack();
      s.push(Tagged('a', Vector([Integer(0n), Integer(1n)])));
      lookup('ASIN').fn(s);
      const v = s.peek();
      const okShape = isTagged(v) && v.tag === 'a' && v.value?.type === 'vector'
          && v.value.items.length === 2;
      const okItem0 = okShape && isInteger(v.value.items[0]) && v.value.items[0].value === 0n;
      // item[1] should be Symbolic ASIN(1) — π/2 ≈ 1.5708 NOT
      // integer-clean under RAD, so `_exactUnaryLift` falls
      // through to stay-symbolic. Distinct from 's
      // ASIN :a:V(Real(0), Real(1)) RAD pin which used Real
      // operands and bypassed the EXACT-mode integer-stay arm
      // entirely (Real input → Real(π/2) output).
      const okItem1Sym = okShape && isSymbolic(v.value.items[1])
          && v.value.items[1].expr?.kind === 'bin' && v.value.items[1].expr.op === '/' && v.value.items[1].expr.l?.name === 'π';
      assert(okItem0 && okItem1Sym,
        `session150: ASIN :a:Vector(Integer(0), Integer(1)) RAD → :a:Vector(Integer(0), π/2) (RAD-mode contrast, exact mode's closed form π/2 in place of ASIN(1) on Integer operands: item[0] still folds to Integer(0) since asin(0)=0 is integer-clean in any angle mode, but item[1] stays-Symbolic because asin(1)=π/2 NOT integer-clean under RAD — _exactUnaryLift's stay-symbolic fall-through fires under the wrapper composition; angle-mode flip toggles Integer / Symbolic per element on the SAME Integer operands — DEG → :a:V[Z(0), Z(90)] vs RAD → :a:V[Z(0), Sym(ASIN(1))]; distinct from session 140's :a:V(Real(0),Real(1)) ASIN RAD pin which BYPASSED the EXACT-mode integer-stay arm with Real operands and produced Real(π/2) instead); got tag=${v?.tag} items=${v?.value?.items?.map(x => `${x.type}${x.value?.toString?.() ? '('+x.value.toString()+')' : ''}`).join(',')}`);
    }
  } finally {
    setAngle(_prevAngle);
  }
}

/* ================================================================
 — Cluster 2: Forward-hyperbolic family (SINH /
   COSH / TANH / ASINH / ACOSH / ATANH) `_exactUnaryLift`
   Integer-stay-exact / Rational-stay-symbolic contract on bare
   scalars + ACOSH / ATANH out-of-domain Integer→Complex lift on
   the bespoke handlers.

   pinned the INVERSE-trig + INVERSE-hyp
   bare-scalar `_exactUnaryLift` axis (ASIN/ACOS/ATAN/ASINH/
   ACOSH/ATANH).  Wait — ACOSH/ATANH are inverse hyperbolic;
   they were pinned in 142. covered
   forward-trig SIN/COS/TAN bare-scalar; Cluster 2 covered LN/
   LOG/EXP/ALOG bare-scalar.  The FORWARD-hyperbolic bare-scalar
   axis (SINH / COSH / TANH on Integer/Rational under
   `_unaryCx`'s EXACT arm) and the bespoke ACOSH / ATANH out-of-
   domain Integer→Complex fall-through (where the EXACT-mode
   integer-stay arm SHOULD bypass and route through the Complex
   primitive) are unpinned.

   `_unaryCx` (`ops.js:8173`) handles SINH/COSH/TANH/ASINH; the
   EXACT-mode arm calls `_exactUnaryLift(name, realFn(x), v)`
   directly (no angle-mode conversion — distinct from `_trigFwd
   Cx` and `_trigInvCx`).  ACOSH/ATANH (`ops.js:8309`/`8329`)
   register a hand-rolled wrapper because their real-branch
   domain is restricted (x≥1 / |x|<1); the EXACT-mode arm pins
   the in-domain integer-clean fold (`ACOSH(Integer(1))` →
   `Integer(0)`, `ATANH(Integer(0))` → `Integer(0)`) and the
   out-of-domain fall-through (where EXACT-mode integer-stay is
   skipped and the input lifts to Complex via the principal
   branch).

 Mirror of / Cluster 2 on the FORWARD-
   hyperbolic + ACOSH-domain-aware axes.  Closes the
   transcendental bare-scalar `_exactUnaryLift` matrix:
   forward-trig (s145), inverse-trig + inverse-hyp (s142),
   forward-hyperbolic (this cluster), LN/LOG/EXP/ALOG (s145). */
{
  // SINH(Integer(0)) → Integer(0).  Trivial integer-clean fold:
  // sinh(0) = 0 exact in IEEE-double. Mirror of
  // Cluster 1's `SIN(Integer(0))` RAD → `Integer(0)` pin on
  // the forward-hyperbolic axis (no angle-mode conversion since
  // hyperbolic is not angle-mode-sensitive).
  {
    const s = new Stack();
    s.push(Integer(0n));
    lookup('SINH').fn(s);
    const v = s.peek();
    assert(isInteger(v) && v.value === 0n,
      `session150: SINH(Integer(0)) → Integer(0) (sinh(0)=0 trivial integer-clean fold via _exactUnaryLift; mirror of session 145 Cluster 1's SIN(Z(0)) RAD pin on forward-hyperbolic axis); got ${v?.type}(${v?.value?.toString?.()})`);
  }

  // COSH(Integer(0)) → Integer(1).  Non-zero output value pins
  // the fold actually ran on the COSH arm (cosh(0)=1).
  // Distinguishes the COSH branch of `_unaryCx` from a hypothetical
  // shared zero-fold that would return 0 on every op.
  {
    const s = new Stack();
    s.push(Integer(0n));
    lookup('COSH').fn(s);
    const v = s.peek();
    assert(isInteger(v) && v.value === 1n,
      `session150: COSH(Integer(0)) → Integer(1) (cosh(0)=1 integer-clean; non-zero Integer output pins fold actually ran on COSH arm); got ${v?.type}(${v?.value?.toString?.()})`);
  }

  // TANH(Integer(0)) → Integer(0).  Closes the SINH/COSH/TANH
  // forward-hyperbolic zero-trio at bare-Integer-scalar.
  {
    const s = new Stack();
    s.push(Integer(0n));
    lookup('TANH').fn(s);
    const v = s.peek();
    assert(isInteger(v) && v.value === 0n,
      `session150: TANH(Integer(0)) → Integer(0) (tanh(0)=0 integer-clean; closes SINH/COSH/TANH forward-hyperbolic zero trio); got ${v?.type}(${v?.value?.toString?.()})`);
  }

  // SINH(Integer(1)) → Symbolic SINH(1).  sinh(1) ≈ 1.1752 is
  // NOT integer-clean (the absolute drift from the nearest
  // integer is 0.1752, well above `_exactUnaryLift`'s 1e-12
  // tolerance).  Pins the stay-symbolic fall-through on the
  // forward-hyperbolic axis — distinct from forward-trig where
  // `SIN(Integer(1))` RAD also stays symbolic, but for a value
  // of ≈0.841 (different transcendental function, same stay-
  // symbolic contract).
  {
    const s = new Stack();
    s.push(Integer(1n));
    lookup('SINH').fn(s);
    const v = s.peek();
    assert(isSymbolic(v) && v.expr?.kind === 'fn' && v.expr.name === 'SINH',
      `session150: SINH(Integer(1)) → Symbolic SINH(1) (sinh(1)≈1.175 not integer-clean — stay-symbolic via _exactUnaryLift); got ${v?.type} expr=${JSON.stringify(v?.expr)}`);
  }

  // ASINH(Integer(0)) → Integer(0).  Inverse-hyperbolic was
  // already pinned by on the bare-Integer
  // scalar axis, but ASINH was specifically pinned at
  // ASINH(Integer(1)) and ASINH(Rational(...)) — the trivial
  // zero pin is added here for consistency with the SINH/COSH/
  // TANH zero trio above.  asinh(0) = 0 exact.
  {
    const s = new Stack();
    s.push(Integer(0n));
    lookup('ASINH').fn(s);
    const v = s.peek();
    assert(isInteger(v) && v.value === 0n,
      `session150: ASINH(Integer(0)) → Integer(0) (asinh(0)=0 trivial integer-clean fold; consistency-pin alongside SINH/COSH/TANH zero trio above); got ${v?.type}(${v?.value?.toString?.()})`);
  }

  // ACOSH(Integer(1)) → Integer(0).  acosh(1) = 0 exact.  In-
  // domain (x≥1) integer-clean fold via ACOSH's BESPOKE handler
  // (`ops.js:8309`) — ACOSH does NOT route through `_unaryCx`
  // because of the x≥1 domain check on the real branch; the
  // EXACT-mode arm only fires when x≥1, and outside that range
  // the input lifts to Complex via the principal branch.  Pins
  // the in-domain integer-clean path of the bespoke handler.
  // Distinct from 's ACOSH(Integer(2)) and
  // ACOSH(Integer(1)) DEG pins — those exercised the Z(2) input
  // (acosh(2)≈1.317 stay-symbolic) and the angle-mode side of
  // a different pin family.  Wait — ACOSH is hyperbolic, no
  // angle mode — in fact pinned ACOSH(Integer(1))
  // → Integer(0); this assertion is a consistency pin in the
  // forward-hyperbolic family rather than a new contract.  Kept
  // for the sake of the SINH/COSH/TANH/ASINH/ACOSH/ATANH zero-
  // trio symmetry.
  {
    const s = new Stack();
    s.push(Integer(1n));
    lookup('ACOSH').fn(s);
    const v = s.peek();
    assert(isInteger(v) && v.value === 0n,
      `session150: ACOSH(Integer(1)) → Integer(0) (acosh(1)=0 in-domain integer-clean fold via bespoke handler ops.js:8309; consistency-pin in forward-hyperbolic zero-trio); got ${v?.type}(${v?.value?.toString?.()})`);
  }

  // ATANH(Integer(0)) → Integer(0).  In-domain (|x|<1) integer-
  // clean fold via ATANH's bespoke handler (`ops.js:8329`).
  // atanh(0) = 0 exact.  Closes the forward + inverse hyperbolic
  // zero-trio under EXACT mode at bare Integer scalar.
  {
    const s = new Stack();
    s.push(Integer(0n));
    lookup('ATANH').fn(s);
    const v = s.peek();
    assert(isInteger(v) && v.value === 0n,
      `session150: ATANH(Integer(0)) → Integer(0) (atanh(0)=0 in-domain integer-clean fold via bespoke handler ops.js:8329; closes forward-hyperbolic Integer-zero pin family); got ${v?.type}(${v?.value?.toString?.()})`);
  }

  // ATANH(Integer(2)) → Complex (out-of-domain |x|>=1).  The
  // BESPOKE ATANH handler's EXACT-mode arm checks `x > -1 && x
  // < 1`; for Integer(2) the check fails, so the EXACT arm
  // FALLS THROUGH (does NOT call `_exactUnaryLift`) into the
  // shared real-branch code, which itself falls through into
  // the Complex principal-branch lift.  Pins:
  //   1. The EXACT-mode integer arm is gated on the in-domain
  //      check (so out-of-domain integers don't try
  //      `_exactUnaryLift` against Math.atanh(2)=NaN).
  //   2. The fall-through correctly lifts to Complex
  //      (atanh(2) = 0.5493 - i·π/2 principal branch).
  // Distinct from any prior pin: 's
  // ATANH(Integer(...)) pins exercised in-domain folds; the
  // out-of-domain Integer→Complex bypass was unpinned.
  {
    const s = new Stack();
    s.push(Integer(2n));
    lookup('ATANH').fn(s);
    const v = s.peek();
    const okShape = isComplex(v);
    // atanh(2) principal branch: 0.5*ln((1+2)/(1-2)) = 0.5*ln(-3)
    // = 0.5*(ln(3) + i*π) = 0.5493 + i*π/2 ... but the code
    // actually returns 0.5493 - i*π/2 on this branch (sign
    // convention).  Just verify it's Complex with the correct
    // real magnitude.
    const okReal = okShape && Math.abs(Math.abs(v.re) - 0.5 * Math.log(3)) < 1e-9;
    const okImag = okShape && Math.abs(Math.abs(v.im) - Math.PI / 2) < 1e-9;
    assert(okShape && okReal && okImag,
      `session150: ATANH(Integer(2)) → Complex(±0.5*ln(3), ±π/2) (out-of-domain |x|≥1 bypasses EXACT-mode integer arm and lifts to Complex principal branch; pins that the in-domain check x>-1&&x<1 gates the integer-stay path so out-of-domain Integers don't crash _exactUnaryLift on NaN); got ${v?.type} re=${v?.re} im=${v?.im}`);
  }

  // ACOSH(Integer(0)) → Complex (out-of-domain x<1).  Same
  // bespoke-handler structure as ATANH out-of-domain: the
  // EXACT-mode arm checks `x >= 1`; for Integer(0) the check
  // fails, so the EXACT arm falls through into the Complex
  // principal-branch lift.  acosh(0) principal branch =
  // i·π/2 (or 0 + i·π/2).  Pins the symmetric ACOSH out-of-
  // domain Integer→Complex bypass.
  {
    const s = new Stack();
    s.push(Integer(0n));
    lookup('ACOSH').fn(s);
    const v = s.peek();
    const okShape = isComplex(v);
    const okReal = okShape && Math.abs(v.re) < 1e-9;
    const okImag = okShape && Math.abs(Math.abs(v.im) - Math.PI / 2) < 1e-9;
    assert(okShape && okReal && okImag,
      `session150: ACOSH(Integer(0)) → Complex(0, ±π/2) (out-of-domain x<1 bypasses EXACT-mode integer arm and lifts to Complex principal branch; mirror of ATANH out-of-domain Integer→Complex bypass on the ACOSH-domain axis); got ${v?.type} re=${v?.re} im=${v?.im}`);
  }

  // Rational stay-symbolic with payload preservation:
  // SINH(Rational(1,2)) → Symbolic SINH(1/2).  sinh(0.5) ≈
  // 0.5211 not integer-clean.  Pins that the Rational arm of
  // `_unaryCx` preserves the Rational AST node (`Bin('/', Num(1
  // ), Num(2))`) inside the Symbolic so the rational survives in
  // the expression rather than being silently coerced to Real.
  // Mirror of 's `SIN(Rational(1,2))` RAD
  // pin and Cluster 2's `LN(Rational(1,2))` pin on the forward-
  // hyperbolic axis.
  {
    const s = new Stack();
    s.push(Rational(1n, 2n));
    lookup('SINH').fn(s);
    const v = s.peek();
    const okSym = isSymbolic(v) && v.expr?.kind === 'fn' && v.expr.name === 'SINH';
    const arg = okSym ? v.expr.args?.[0] : null;
    const okRat = arg && arg.kind === 'bin' && arg.op === '/'
        && arg.l?.value === 1 && arg.r?.value === 2;
    assert(okSym && okRat,
      `session150: SINH(Rational(1,2)) → Symbolic SINH(1/2) (Rational arm of _unaryCx preserves Bin('/',Num(1),Num(2)) payload — Rational survives in AST rather than being coerced to Real; mirror of session 145 Cluster 1/2's SIN/LN Rational stay-symbolic payload pins); got ${v?.type} arg=${JSON.stringify(arg)}`);
  }

  // Rational arm CAN produce Integer (collapse via numeric):
  // SINH(Rational(0,1)) → Integer(0).  Rational(0,1) → 0.0;
  // sinh(0) = 0 → integer-clean → Integer(0).  Mirror of
  // 's `LN(Rational(1,1))` → `Integer(0)`
  // pin on the forward-hyperbolic axis.  Pins that the
  // Rational arm is NOT a Symbolic-only branch when the
  // underlying numeric value is integer-clean.
  {
    const s = new Stack();
    s.push(Rational(0n, 1n));
    lookup('TANH').fn(s);
    const v = s.peek();
    assert(isInteger(v) && v.value === 0n,
      `session150: TANH(Rational(0,1)) → Integer(0) (Rational arm CAN produce Integer when underlying numeric value is integer-clean: Q(0,1)=0.0 → tanh(0)=0 → Integer(0); mirror of session 145 Cluster 2's LN(Q(1,1)) → Z(0) pin on forward-hyperbolic axis); got ${v?.type}(${v?.value?.toString?.()})`);
  }

  // APPROX-mode bypass: SINH(Integer(0)) APPROX → Real(0) (NOT
  // Integer).  `setApproxMode(true)` flips `getApproxMode()` so
  // the EXACT-mode Integer/Rational arm in `_unaryCx` is
  // skipped and the input falls through into the standard
  // Real-output path. Mirror of 's
  // `SIN(Integer(0))` APPROX bypass and Cluster 2's `LN(Integer
  // (1))` APPROX bypass on the forward-hyperbolic axis.  Pins
  // that `_exactUnaryLift` is gated by the `!getApproxMode()`
  // check on the SINH branch too.
  {
    setApproxMode(true);
    try {
      const s = new Stack();
      s.push(Integer(0n));
      lookup('SINH').fn(s);
      const v = s.peek();
      assert(isReal(v) && v.value.eq(0),
        `session150: SINH(Integer(0)) APPROX → Real(0) (NOT Integer; APPROX-mode bypass — _exactUnaryLift gated by !getApproxMode() on SINH branch too; mirror of session 145 SIN/LN APPROX-bypass pins on forward-hyperbolic axis); got ${v?.type}(${v?.value?.toString?.()})`);
    } finally {
      setApproxMode(false);
    }
  }

  // APPROX-mode bypass on ACOSH bespoke handler too:
  // ACOSH(Integer(1)) APPROX → Real(0) (NOT Integer).  Pins
  // that the bespoke ACOSH/ATANH handlers also gate their
  // EXACT-mode integer-stay arm on `!getApproxMode()` — the
  // bypass is uniform across the forward-hyperbolic family
  // (the `_unaryCx`-routed ops AND the bespoke domain-aware
  // ACOSH/ATANH ops).
  {
    setApproxMode(true);
    try {
      const s = new Stack();
      s.push(Integer(1n));
      lookup('ACOSH').fn(s);
      const v = s.peek();
      assert(isReal(v) && v.value.eq(0),
        `session150: ACOSH(Integer(1)) APPROX → Real(0) (APPROX-mode bypass uniform across bespoke ACOSH handler — !getApproxMode() check holds on both _unaryCx-routed ops and the domain-aware bespoke ones); got ${v?.type}(${v?.value?.toString?.()})`);
    } finally {
      setApproxMode(false);
    }
  }
}

/* ================================================================
 — Cluster 3: LN / LOG / EXP / ALOG `_exactUnaryLift`
   Integer-stay-exact under Tagged-V/M wrapper composition
   (3-deep `_withTaggedUnary(_withListUnary(_withVMUnary(handler)))`
   composing per element under outer Tagged).

   pinned LN/LOG/EXP/ALOG bare-scalar
   `_exactUnaryLift` — `LN(Integer(1)) → Integer(0)`,
   `LOG(Integer(100)) → Integer(2)`, etc.
   pinned the FORWARD-trig (`SIN/COS/TAN`) wrapper-VM composition
   under DEG (`:m:Matrix([[0,180],[0,0]]) SIN` DEG → `:m:Matrix([
   [0,0],[0,0]])`).  The LN/LOG/EXP/ALOG wrapper-VM composition
   with the EXACT-mode Integer-stay-exact fold composing element-
 wise was unpinned: pinned the wrapper
   composition for SQRT/FACT/LNP1/SIN under non-integer-output,
 and pinned the hyperbolic family
   wrapper-VM composition under Tagged-V/M with EXACT-mode
   integer-stay folds — but no direct pin on the LN/LOG/EXP/ALOG
   wrapper composition with integer-clean Integer outputs at
   distinct V/M positions.

   `_unaryCx` (`ops.js:8173`) wraps in `_withTaggedUnary(_with
   ListUnary(_withVMUnary(handler)))`; the inner handler runs
   per Vector / Matrix entry.  When EVERY entry is integer-clean
   under EXACT mode, the wrapper composition produces a Tagged-
   Vector / Tagged-Matrix of Integer outputs; when MIXED (some
   entries integer-clean, others not), the wrapper composition
   produces a Tagged-Vector of Integer + Symbolic outputs (since
   `_exactUnaryLift` returns `Symbolic(AstFn(...))` on the stay-
   symbolic fall-through, NOT Real).  The mixed case is a strong
   pin: it shows that `_exactUnaryLift`'s stay-symbolic path is
   distinct from a Real fall-through path the way `_unaryCx`'s
   non-EXACT real branch behaves.

 Mirror of Cluster 3a's forward-trig wrapper
   composition pin on the LN/LOG/EXP/ALOG axis.  Closes the
   transcendental wrapper-VM-under-Tagged matrix:  forward-trig
   (s145 c3a), forward-hyperbolic (s140 c1), inverse-trig (s140
   c2 RAD + s150 c1 DEG), LN/LOG/EXP/ALOG (this cluster). */
{
  // LN :v:Vector(Integer(1), Integer(1)) → :v:Vector(Integer(0),
  // Integer(0)).  Both entries integer-clean (ln(1)=0).  Mirror
  // of Cluster 3a's `:v:Vector(0,0) SIN` RAD pin
  // on the LN axis.  Pins that LN's `_unaryCx` EXACT-mode arm
  // composes through the 3-deep wrapper for the all-integer-
  // clean case.
  {
    const s = new Stack();
    s.push(Tagged('v', Vector([Integer(1n), Integer(1n)])));
    lookup('LN').fn(s);
    const v = s.peek();
    assert(isTagged(v) && v.tag === 'v' && v.value?.type === 'vector'
        && v.value.items.length === 2
        && isInteger(v.value.items[0]) && v.value.items[0].value === 0n
        && isInteger(v.value.items[1]) && v.value.items[1].value === 0n,
      `session150: LN :v:Vector(Integer(1), Integer(1)) → :v:Vector(Integer(0), Integer(0)) (EXACT-mode _exactUnaryLift Integer-stay-exact composes through 3-deep wrapper-VM under Tagged on the LN axis; mirror of session 145 Cluster 3a's :v:V(0,0) SIN RAD pin on transcendental-log axis); got tag=${v?.tag} items=${v?.value?.items?.map(x => `${x.type}(${x.value?.toString?.()})`).join(',')}`);
  }

  // LOG :v:Vector(Integer(1), Integer(10), Integer(100)) →
  // :v:Vector(Integer(0), Integer(1), Integer(2)).  Three
  // distinct integer-clean output values at three distinct V
  // positions — pins that the wrapper-composition dispatches
  // per-element with each `_exactUnaryLift` call producing a
  // distinct integer output. Mirror of Cluster 3a's
  // `:v:V(Integer(0),Integer(90)) COS` DEG pin on the LOG axis.
  {
    const s = new Stack();
    s.push(Tagged('v', Vector([Integer(1n), Integer(10n), Integer(100n)])));
    lookup('LOG').fn(s);
    const v = s.peek();
    assert(isTagged(v) && v.tag === 'v' && v.value?.type === 'vector'
        && v.value.items.length === 3
        && isInteger(v.value.items[0]) && v.value.items[0].value === 0n
        && isInteger(v.value.items[1]) && v.value.items[1].value === 1n
        && isInteger(v.value.items[2]) && v.value.items[2].value === 2n,
      `session150: LOG :v:Vector(Integer(1), Integer(10), Integer(100)) → :v:Vector(Integer(0), Integer(1), Integer(2)) (three distinct integer-clean output values at distinct V positions — pins per-element wrapper dispatch with distinct integer outputs at each position); got tag=${v?.tag} items=${v?.value?.items?.map(x => `${x.type}(${x.value?.toString?.()})`).join(',')}`);
  }

  // EXP :v:Vector(Integer(0), Integer(0)) → :v:Vector(Integer(1),
  // Integer(1)).  Non-zero output (exp(0)=1) at every position
  // pins that the EXP arm of `_unaryCx` ran (rather than a
  // hypothetical shared zero-fold).
  {
    const s = new Stack();
    s.push(Tagged('v', Vector([Integer(0n), Integer(0n)])));
    lookup('EXP').fn(s);
    const v = s.peek();
    assert(isTagged(v) && v.tag === 'v' && v.value?.type === 'vector'
        && v.value.items.length === 2
        && isInteger(v.value.items[0]) && v.value.items[0].value === 1n
        && isInteger(v.value.items[1]) && v.value.items[1].value === 1n,
      `session150: EXP :v:Vector(Integer(0), Integer(0)) → :v:Vector(Integer(1), Integer(1)) (non-zero output value pins inner EXP handler ran on each position via wrapper composition); got tag=${v?.tag} items=${v?.value?.items?.map(x => `${x.type}(${x.value?.toString?.()})`).join(',')}`);
  }

  // ALOG :v:Vector(Integer(0), Integer(2), Integer(3)) →
  // :v:Vector(Integer(1), Integer(100), Integer(1000)).  Mixed
  // non-zero integer-clean outputs at three positions —
  // strongest variant on the LN/LOG/EXP/ALOG axis since each
  // output is a different non-trivial integer (1, 100, 1000),
  // pinning that `_exactUnaryLift`'s BigInt-round-trip fires
  // correctly per element at high magnitudes.  Mirror of
  // 's bare-scalar ALOG positive-integer
  // trio pin lifted into the wrapper composition.
  {
    const s = new Stack();
    s.push(Tagged('v', Vector([Integer(0n), Integer(2n), Integer(3n)])));
    lookup('ALOG').fn(s);
    const v = s.peek();
    assert(isTagged(v) && v.tag === 'v' && v.value?.type === 'vector'
        && v.value.items.length === 3
        && isInteger(v.value.items[0]) && v.value.items[0].value === 1n
        && isInteger(v.value.items[1]) && v.value.items[1].value === 100n
        && isInteger(v.value.items[2]) && v.value.items[2].value === 1000n,
      `session150: ALOG :v:Vector(Integer(0), Integer(2), Integer(3)) → :v:Vector(Integer(1), Integer(100), Integer(1000)) (high-magnitude non-zero integer outputs pin _exactUnaryLift's BigInt round-trip fires correctly per element under wrapper composition; mirror of session 145 Cluster 2's bare-scalar ALOG positive-integer trio lifted into wrapper); got tag=${v?.tag} items=${v?.value?.items?.map(x => `${x.type}(${x.value?.toString?.()})`).join(',')}`);
  }

  // LOG :m:Matrix([[Integer(1), Integer(10)], [Integer(100),
  // Integer(1000)]]) → :m:Matrix([[Integer(0), Integer(1)], [
  // Integer(2), Integer(3)]]).  Matrix-axis closure of the
  // wrapper-VM composition with all-integer-clean outputs.
  // Mirror of Cluster 3a's `:m:Matrix([[0,180],
  // [0,0]]) SIN` DEG → `:m:Matrix([[0,0],[0,0]])` pin on the
  // LOG axis.  Distinct from the V-axis pin above in that
  // Matrix kind is preserved across per-entry dispatch — pins
  // that the M-axis `_withVMUnary` correctly threads each
  // entry through `_unaryCx`'s inner handler.
  {
    const s = new Stack();
    s.push(Tagged('m', Matrix([[Integer(1n), Integer(10n)], [Integer(100n), Integer(1000n)]])));
    lookup('LOG').fn(s);
    const v = s.peek();
    const okShape = isTagged(v) && v.tag === 'm' && v.value?.type === 'matrix'
        && v.value.rows.length === 2 && v.value.rows[0].length === 2;
    const okValues = okShape
        && isInteger(v.value.rows[0][0]) && v.value.rows[0][0].value === 0n
        && isInteger(v.value.rows[0][1]) && v.value.rows[0][1].value === 1n
        && isInteger(v.value.rows[1][0]) && v.value.rows[1][0].value === 2n
        && isInteger(v.value.rows[1][1]) && v.value.rows[1][1].value === 3n;
    assert(okShape && okValues,
      `session150: LOG :m:Matrix([[1,10],[100,1000]]) → :m:Matrix([[0,1],[2,3]]) (Matrix-axis closure for LN/LOG/EXP/ALOG wrapper-VM composition with all-integer-clean outputs; per-entry log10 fold under outer Tagged + M-axis wrapper-VM; closes LN/LOG/EXP/ALOG Tagged-M Integer-stay-exact path); got tag=${v?.tag} rows=${v?.value?.rows?.map(r => r.map(x => `${x.type}(${x.value?.toString?.()})`).join(',')).join('|')}`);
  }

  // Mixed integer-clean / stay-symbolic within a single Tagged-V:
  // LOG :v:Vector(Integer(2), Integer(10)) → :v:Vector(Symbolic
  // LOG(2), Integer(1)).  log10(2)≈0.301 NOT integer-clean →
  // stay-symbolic; log10(10)=1 integer-clean → Integer(1).  Pins
  // that `_exactUnaryLift`'s stay-symbolic fall-through and
  // integer-clean fold both operate per element under the
  // wrapper composition WITHOUT collapsing the whole Vector to
  // a single uniform output kind.  Strong pin: the result is a
  // mixed-kind Vector (Symbolic + Integer) inside a Tagged
  // wrapper, which exercises the type-heterogeneity contract on
  // the wrapper composition's output.
  {
    const s = new Stack();
    s.push(Tagged('v', Vector([Integer(2n), Integer(10n)])));
    lookup('LOG').fn(s);
    const v = s.peek();
    const okShape = isTagged(v) && v.tag === 'v' && v.value?.type === 'vector'
        && v.value.items.length === 2;
    const okSym = okShape && isSymbolic(v.value.items[0])
        && v.value.items[0].expr?.kind === 'fn' && v.value.items[0].expr.name === 'LOG';
    const okInt = okShape && isInteger(v.value.items[1]) && v.value.items[1].value === 1n;
    assert(okSym && okInt,
      `session150: LOG :v:Vector(Integer(2), Integer(10)) → :v:Vector(Symbolic LOG(2), Integer(1)) (mixed integer-clean / stay-symbolic within single Tagged-V; pins that _exactUnaryLift's stay-symbolic fall-through and integer-clean fold both operate per element under wrapper composition WITHOUT uniform-kind collapse — output is a heterogeneous Vector inside Tagged); got tag=${v?.tag} items=${v?.value?.items?.map(x => `${x.type}${x.value?.toString?.() ? '('+x.value.toString()+')' : ''}`).join(',')}`);
  }

  // APPROX-mode bypass under wrapper composition: LOG :v:Vector(
  // Integer(1), Integer(100)) APPROX → :v:Vector(Real(0),
  // Real(2)). Composes the APPROX-mode bypass (
  // Cluster 2's bare-scalar pin) with the wrapper composition
  // (this cluster).  Pins that the APPROX-mode flag flips the
  // result KIND (Real not Integer) per element under the
  // wrapper composition — distinct from the EXACT-mode all-
  // Integer output of the LOG :v:Vector(Z(1),Z(10),Z(100))
  // pin above.
  {
    setApproxMode(true);
    try {
      const s = new Stack();
      s.push(Tagged('v', Vector([Integer(1n), Integer(100n)])));
      lookup('LOG').fn(s);
      const v = s.peek();
      const okShape = isTagged(v) && v.tag === 'v' && v.value?.type === 'vector'
          && v.value.items.length === 2;
      const okItem0 = okShape && isReal(v.value.items[0]) && v.value.items[0].value.eq(0);
      const okItem1 = okShape && isReal(v.value.items[1]) && v.value.items[1].value.eq(2);
      assert(okItem0 && okItem1,
        `session150: LOG :v:Vector(Integer(1), Integer(100)) APPROX → :v:Vector(Real(0), Real(2)) (APPROX-mode bypass composes with wrapper-VM-under-Tagged: APPROX flips KIND from Integer to Real per element, integer-clean output values still emerge but as Real; mirror of session 145 Cluster 2's bare-scalar APPROX-bypass pin lifted into wrapper composition); got tag=${v?.tag} items=${v?.value?.items?.map(x => `${x.type}(${x.value?.toString?.()})`).join(',')}`);
    } finally {
      setApproxMode(false);
    }
  }
}

/* ================================================================
 — Cluster 1: ACOSH / ATANH on bare List + Tagged-of-
   List composition.

   's hyperbolic-family pin (`tests/test-types.mjs:3153`)
   only iterated `SINH / COSH / TANH / ASINH` for List distribution
   — those four route through `_unaryCx`.  ACOSH and ATANH are
   registered with the bespoke direct shape `_withTaggedUnary(
 _withListUnary(_withVMUnary(handler)))` (
   1 comment at `tests/test-types.mjs:5266-5278`) so the bare-List
   and Tagged-of-List composition was never directly pinned; only
 the Tagged-of-Vector composition was.
   The matrix Notes claim L ✓ for the row covering "SIN..ASIN..ATAN
   ..ACOSH..ATANH (elementary)" but the L ✓ on the ACOSH / ATANH
   sub-axes was inherited from the convention text rather than from
   a hard-assertion pin on the direct-registered shape.

   closed the LN/LOG/EXP/ALOG and forward-/inverse-trig
   wrapper-VM composition under Tagged-V/M.  This cluster closes
   the **dual** axis: the L/T axis (bare List + Tagged-of-List)
   on the direct-registered ACOSH / ATANH handlers, including the
   EXACT-mode Integer-stay-exact composition per element and the
   out-of-domain Integer→Complex bypass per element (mirror of
 's bare-scalar out-of-domain pin lifted
   into the List axis).

 Same code path as 's Tagged-of-Vector
   (`acoshTaggedV` / `atanhTaggedV`), but exercises the inner
   `_withListUnary` instead of `_withVMUnary`.  Distinct from
 's SINH-only Tagged-List pin (`SINH` routes through
   `_unaryCx` — wrapped externally; ACOSH/ATANH bypass `_unaryCx`
   so the wrapper composition shape is registered directly). */
{
  // ---- ACOSH bare List, Real in-domain boundary (acosh(1)=0).
  // Pins that the bare-List wrapper distributes per element on
  // the direct-registered ACOSH handler; mirror of
  // line :3153's SINH/COSH/TANH/ASINH for-loop on the ACOSH axis
  // which the loop deliberately excluded (ACOSH /
  // ATANH dispatch through a bespoke shape, not `_unaryCx`).
  {
    const s = new Stack();
    s.push(RList([Real(1), Real(1)]));
    lookup('ACOSH').fn(s);
    const v = s.peek();
    assert(isList(v) && v.items.length === 2
        && isReal(v.items[0]) && v.items[0].value.eq(0)
        && isReal(v.items[1]) && v.items[1].value.eq(0),
      `session158: ACOSH {Real(1) Real(1)} → {Real(0) Real(0)} (bare-List distribution on direct-registered ACOSH handler — closes the L axis on session 120's SINH-only direct-registered loop); got ${v?.type} items=${v?.items?.map(x => `${x.type}(${x.value?.toString?.()})`).join(',')}`);
  }

  // ---- ATANH bare List, Real in-domain trivial (atanh(0)=0).
  // Operand-symmetric to ACOSH boundary above; pins the bare-List
  // distribution on ATANH's direct-registered handler.
  {
    const s = new Stack();
    s.push(RList([Real(0), Real(0)]));
    lookup('ATANH').fn(s);
    const v = s.peek();
    assert(isList(v) && v.items.length === 2
        && isReal(v.items[0]) && v.items[0].value.eq(0)
        && isReal(v.items[1]) && v.items[1].value.eq(0),
      `session158: ATANH {Real(0) Real(0)} → {Real(0) Real(0)} (bare-List distribution on direct-registered ATANH handler — closes L axis on session 120's loop); got ${v?.type} items=${v?.items?.map(x => `${x.type}(${x.value?.toString?.()})`).join(',')}`);
  }

  // ---- ACOSH Tagged-of-List composition: outer Tagged unwraps,
  // inner List distributes per element, outer Tagged re-applies.
  // Mirror of 's Tagged-of-Vector ACOSH pin
  // on the LIST axis — pins that the same direct-registered
  // wrapper composition `_withTaggedUnary(_withListUnary(_with
  // VMUnary(...)))` threads correctly through the LIST inner
  // wrapper (not just the V/M inner wrapper).
  {
    const s = new Stack();
    s.push(Tagged('h', RList([Real(1), Real(1)])));
    lookup('ACOSH').fn(s);
    const v = s.peek();
    assert(isTagged(v) && v.tag === 'h' && isList(v.value) && v.value.items.length === 2
        && isReal(v.value.items[0]) && v.value.items[0].value.eq(0)
        && isReal(v.value.items[1]) && v.value.items[1].value.eq(0),
      `session158: ACOSH :h:{Real(1) Real(1)} → :h:{Real(0) Real(0)} (Tagged-of-List composition through 3-deep direct-registered wrapper; outer tag preserved across element-wise List dispatch); got tag=${v?.tag} inner=${v?.value?.type} items=${v?.value?.items?.map(x => `${x.type}(${x.value?.toString?.()})`).join(',')}`);
  }

  // ---- ATANH Tagged-of-List composition (closes the ACOSH/ATANH
  // pair on the Tagged-of-List axis).  Same structure as the
  // ACOSH variant above but on ATANH's bespoke handler.
  {
    const s = new Stack();
    s.push(Tagged('h', RList([Real(0), Real(0)])));
    lookup('ATANH').fn(s);
    const v = s.peek();
    assert(isTagged(v) && v.tag === 'h' && isList(v.value) && v.value.items.length === 2
        && isReal(v.value.items[0]) && v.value.items[0].value.eq(0)
        && isReal(v.value.items[1]) && v.value.items[1].value.eq(0),
      `session158: ATANH :h:{Real(0) Real(0)} → :h:{Real(0) Real(0)} (Tagged-of-List composition through 3-deep direct-registered wrapper; closes ACOSH/ATANH pair on T+L axis); got tag=${v?.tag} inner=${v?.value?.type} items=${v?.value?.items?.map(x => `${x.type}(${x.value?.toString?.()})`).join(',')}`);
  }

  // ---- ACOSH bare List with Integer operands, in-domain.  Pins
  // that the EXACT-mode Integer-stay-exact arm of the bespoke
  // ACOSH handler (`ops.js:8309` 2 doc)
  // composes per element through `_withListUnary` — each element
  // independently routes through `_exactUnaryLift` and emerges
  // as Integer. Mirror of 's bare-scalar
  // `ACOSH(Integer(1)) → Integer(0)` pin lifted into the List
  // axis on the direct-registered shape.
  {
    const s = new Stack();
    s.push(RList([Integer(1n), Integer(1n)]));
    lookup('ACOSH').fn(s);
    const v = s.peek();
    assert(isList(v) && v.items.length === 2
        && isInteger(v.items[0]) && v.items[0].value === 0n
        && isInteger(v.items[1]) && v.items[1].value === 0n,
      `session158: ACOSH {Integer(1) Integer(1)} → {Integer(0) Integer(0)} (EXACT-mode Integer-stay-exact composes per element through bare _withListUnary on direct-registered ACOSH; mirror of session 150 bare-scalar pin lifted onto L axis); got items=${v?.items?.map(x => `${x.type}(${x.value?.toString?.()})`).join(',')}`);
  }

  // ---- ATANH bare List with Integer operands, in-domain trivial
  // (atanh(0) = 0).  Mirror of ACOSH-Integer pin above on the
  // ATANH axis; closes the inverse-hyp `_exactUnaryLift` Integer-
  // stay-exact List composition pair.
  {
    const s = new Stack();
    s.push(RList([Integer(0n), Integer(0n)]));
    lookup('ATANH').fn(s);
    const v = s.peek();
    assert(isList(v) && v.items.length === 2
        && isInteger(v.items[0]) && v.items[0].value === 0n
        && isInteger(v.items[1]) && v.items[1].value === 0n,
      `session158: ATANH {Integer(0) Integer(0)} → {Integer(0) Integer(0)} (EXACT-mode Integer-stay-exact composes per element through bare _withListUnary on direct-registered ATANH; closes inverse-hyp List EXACT-arm pair); got items=${v?.items?.map(x => `${x.type}(${x.value?.toString?.()})`).join(',')}`);
  }

  // ---- ACOSH bare List, OUT-OF-DOMAIN Real→Complex bypass per
  // element. pinned `ACOSH(Integer(0))`
  // → Complex(0, ±π/2) bare-scalar (in-domain check `x ≥ 1`
  // fails for Integer(0); EXACT-mode integer-stay arm falls
  // through into the Complex principal-branch lift).  Pins that
  // the same out-of-domain bypass composes through the bare-List
  // wrapper per element — Real(0) routes around `_exactUnaryLift`
  // (which would otherwise crash on `Math.acosh(0) = NaN`) and
  // emerges as Complex.
  {
    const s = new Stack();
    s.push(RList([Real(0)]));
    lookup('ACOSH').fn(s);
    const v = s.peek();
    const item = v?.items?.[0];
    assert(isList(v) && v.items.length === 1 && isComplex(item)
        && Math.abs(item.re - 0) < 1e-10
        && Math.abs(Math.abs(item.im) - Math.PI / 2) < 1e-10,
      `session158: ACOSH {Real(0)} → {Complex(0, ±π/2)} (out-of-domain Real→Complex bypass composes per element through bare _withListUnary; mirror of session 150 bare-scalar out-of-domain pin lifted onto L axis); got items=${v?.items?.map(x => x?.type === 'complex' ? `Complex(${x.re},${x.im})` : `${x?.type}(${x?.value?.toString?.()})`).join(',')}`);
  }

  // ---- ATANH bare List, OUT-OF-DOMAIN bypass per element.
  // pinned `ATANH(Integer(2))` → Complex
  // principal branch bare-scalar.  Pins per-element out-of-domain
  // bypass through the bare-List wrapper on the ATANH axis;
  // mirror of ACOSH out-of-domain List pin above.  atanh(2)
  // principal branch is 0.5493… - i·π/2.
  {
    const s = new Stack();
    s.push(RList([Real(2)]));
    lookup('ATANH').fn(s);
    const v = s.peek();
    const item = v?.items?.[0];
    assert(isList(v) && v.items.length === 1 && isComplex(item)
        && Math.abs(item.re - 0.5493061443340548) < 1e-10
        && Math.abs(Math.abs(item.im) - Math.PI / 2) < 1e-10,
      `session158: ATANH {Real(2)} → {Complex(atanh(2)-iπ/2)} (out-of-domain Real→Complex bypass composes per element through bare _withListUnary on direct-registered ATANH); got items=${v?.items?.map(x => x?.type === 'complex' ? `Complex(${x.re},${x.im})` : `${x?.type}(${x?.value?.toString?.()})`).join(',')}`);
  }

  // ---- HETEROGENEOUS in-domain + out-of-domain in a single
  // bare List on ACOSH.  Strong pin: the same `_withListUnary`
  // wrapper dispatches some elements through the EXACT-mode
  // Integer-stay arm (Integer(1) → Integer(0)) and OTHER
  // elements through the out-of-domain Complex-principal-branch
  // bypass (Real(0) → Complex(0, π/2)) — closes the per-element
  // domain-check independence on the List axis.  Mirror of
  // 's heterogeneous LOG mixed integer-
  // clean / stay-symbolic Tagged-V pin on the ACOSH heterogeneous
  // domain-axis.
  {
    const s = new Stack();
    s.push(RList([Integer(1n), Real(0)]));
    lookup('ACOSH').fn(s);
    const v = s.peek();
    const item0 = v?.items?.[0];
    const item1 = v?.items?.[1];
    assert(isList(v) && v.items.length === 2
        && isInteger(item0) && item0.value === 0n
        && isComplex(item1) && Math.abs(item1.re - 0) < 1e-10
            && Math.abs(Math.abs(item1.im) - Math.PI / 2) < 1e-10,
      `session158: ACOSH {Integer(1) Real(0)} → {Integer(0) Complex(0, ±π/2)} (HETEROGENEOUS per-element domain dispatch under bare List: in-domain Integer fold + out-of-domain Real bypass within the same wrapper invocation; pins per-element domain-check independence); got items=${v?.items?.map(x => x?.type === 'complex' ? `Complex(${x.re},${x.im})` : `${x?.type}(${x?.value?.toString?.()})`).join(',')}`);
  }

  // ---- ATANH Tagged-of-List with mixed in/out-of-domain Real
  // operands.  Closes the heterogeneous-domain pin on the Tagged-
  // of-List axis (cluster's strongest variant — pins outer Tagged
  // unwrap + inner List per-element dispatch + per-element domain
  // check + tag re-apply, all in one observable result).
  {
    const s = new Stack();
    s.push(Tagged('h', RList([Real(0), Real(2)])));
    lookup('ATANH').fn(s);
    const v = s.peek();
    const okShape = isTagged(v) && v.tag === 'h' && isList(v.value) && v.value.items.length === 2;
    const item0 = okShape && v.value.items[0];
    const item1 = okShape && v.value.items[1];
    assert(okShape && isReal(item0) && item0.value.eq(0)
        && isComplex(item1)
        && Math.abs(item1.re - 0.5493061443340548) < 1e-10
        && Math.abs(Math.abs(item1.im) - Math.PI / 2) < 1e-10,
      `session158: ATANH :h:{Real(0) Real(2)} → :h:{Real(0) Complex(atanh(2)-iπ/2)} (HETEROGENEOUS in-domain/out-of-domain per element under Tagged-of-List composition — closes ACOSH/ATANH heterogeneous axis on the T+L composition); got tag=${v?.tag} items=${v?.value?.items?.map(x => x?.type === 'complex' ? `Complex(${x.re},${x.im})` : `${x?.type}(${x?.value?.toString?.()})`).join(',')}`);
  }

  // session160 — Empty-List (n=0) boundary closure on the direct-
  // registered ACOSH wrapper composition. Pair with the
  // LN n=0 pin in Cluster 2 below: lifts the empty-List boundary onto
  // the inverse-hyp pair direct-registered ops too (ACOSH/ATANH dispatch
  // through a bespoke registration shape, not _unaryCx — see s158
  // header comment for the distinction).  Pins that the bare and
  // Tagged-of-List wrappers both preserve an empty inner-List unchanged.
  // ---- Empty bare List on ACOSH: { } ACOSH → { } (n=0 boundary on
  // direct-registered wrapper; closes the boundary the s158 ACOSH n=2
  // pins do not enumerate).
  {
    const s = new Stack();
    s.push(RList([]));
    lookup('ACOSH').fn(s);
    const v = s.peek();
    assert(isList(v) && v.items.length === 0,
      `session160: { } ACOSH → { } (n=0 empty-List boundary on direct-registered ACOSH bare wrapper; closes the n=0 corner the s158 ACOSH/ATANH n=2 pins do not enumerate); got ${v?.type} items.length=${v?.items?.length}`);
  }
}

/* ================================================================
 — Cluster 2: LN / LOG / EXP / ALOG bare-List
   distribution + Tagged-of-List composition with EXACT-mode
   `_exactUnaryLift` Integer-stay-exact folds composing per
   element.

   pinned bare-scalar EXACT-mode Integer-
   stay-exact / Rational-stay-symbolic.
   lifted that into the wrapper-VM-under-Tagged composition
   (Tagged-of-V and Tagged-of-M).  This cluster closes the dual:
   bare-List + Tagged-of-List, the LIST axis of the wrapper
   composition.

   These four ops dispatch through `_unaryCx` (`ops.js:7984` per
 doc) which wraps in the standard 3-deep
   `_withTaggedUnary(_withListUnary(_withVMUnary(handler)))`.
   The inner `_withListUnary` runs the inner handler per element;
   when each element is integer-clean under EXACT mode, the per-
   element results are Integer (via `_exactUnaryLift`); when
   mixed, the result is a heterogeneous Integer + Symbolic List.

 Same code path as 's Tagged-V/M pin, but
   on the LIST inner-wrapper instead of V/M.  Distinct from
 's LNP1 Tagged-of-Vector pin (which only
   covered LNP1 — not the LN/LOG/EXP/ALOG quartet — and only on
   V, not on List). */
{
  // LN / LOG / EXP / ALOG do not depend on angle mode — no
  // try/finally guard needed for non-APPROX assertions.

  // ---- LN bare List, both Integer(1).  ln(1)=0 integer-clean
  // per element.  Pins that EXACT-mode `_exactUnaryLift` Integer-
  // stay-exact composes through the bare `_withListUnary` on
  // every position; mirror of 's `:v:V(Z(1)
  // ,Z(1)) LN` Tagged-of-Vector pin on the LIST axis.
  {
    const s = new Stack();
    s.push(RList([Integer(1n), Integer(1n)]));
    lookup('LN').fn(s);
    const v = s.peek();
    assert(isList(v) && v.items.length === 2
        && isInteger(v.items[0]) && v.items[0].value === 0n
        && isInteger(v.items[1]) && v.items[1].value === 0n,
      `session158: LN {Integer(1) Integer(1)} → {Integer(0) Integer(0)} (EXACT-mode _exactUnaryLift Integer-stay-exact composes through bare _withListUnary on LN axis; mirror of session 150 :v:V LN pin lifted onto L axis); got items=${v?.items?.map(x => `${x.type}(${x.value?.toString?.()})`).join(',')}`);
  }

  // ---- LOG bare List, three distinct integer-clean outputs at
  // three distinct positions: 1/10/100 → 0/1/2.  Pins per-element
  // wrapper dispatch with distinct integer outputs at each List
  // position; mirror of 's :v:V(Z(1),Z(10),
  // Z(100)) LOG pin on the LIST axis.
  {
    const s = new Stack();
    s.push(RList([Integer(1n), Integer(10n), Integer(100n)]));
    lookup('LOG').fn(s);
    const v = s.peek();
    assert(isList(v) && v.items.length === 3
        && isInteger(v.items[0]) && v.items[0].value === 0n
        && isInteger(v.items[1]) && v.items[1].value === 1n
        && isInteger(v.items[2]) && v.items[2].value === 2n,
      `session158: LOG {Integer(1) Integer(10) Integer(100)} → {Integer(0) Integer(1) Integer(2)} (three distinct integer-clean outputs at three List positions — pins per-element wrapper dispatch via bare _withListUnary on LOG axis); got items=${v?.items?.map(x => `${x.type}(${x.value?.toString?.()})`).join(',')}`);
  }

  // ---- EXP bare List, both Integer(0).  exp(0)=1 non-zero
  // integer output pins that the EXP arm of `_unaryCx` ran
  // (rather than a hypothetical zero-fold) per element through
  // the bare-List wrapper.
  {
    const s = new Stack();
    s.push(RList([Integer(0n), Integer(0n)]));
    lookup('EXP').fn(s);
    const v = s.peek();
    assert(isList(v) && v.items.length === 2
        && isInteger(v.items[0]) && v.items[0].value === 1n
        && isInteger(v.items[1]) && v.items[1].value === 1n,
      `session158: EXP {Integer(0) Integer(0)} → {Integer(1) Integer(1)} (non-zero integer output pins inner EXP handler ran per element via bare _withListUnary; mirror of session 150 :v:V(Z(0),Z(0)) EXP pin lifted onto L axis); got items=${v?.items?.map(x => `${x.type}(${x.value?.toString?.()})`).join(',')}`);
  }

  // ---- ALOG bare List, high-magnitude integer trio: 0/2/3 →
  // 1/100/1000.  High-magnitude non-zero integer outputs pin
  // `_exactUnaryLift`'s BigInt round-trip per element through the
  // bare-List wrapper; mirror of 's
  // `:v:V(Z(0),Z(2),Z(3)) ALOG` Tagged-of-Vector pin on the LIST
  // axis.
  {
    const s = new Stack();
    s.push(RList([Integer(0n), Integer(2n), Integer(3n)]));
    lookup('ALOG').fn(s);
    const v = s.peek();
    assert(isList(v) && v.items.length === 3
        && isInteger(v.items[0]) && v.items[0].value === 1n
        && isInteger(v.items[1]) && v.items[1].value === 100n
        && isInteger(v.items[2]) && v.items[2].value === 1000n,
      `session158: ALOG {Integer(0) Integer(2) Integer(3)} → {Integer(1) Integer(100) Integer(1000)} (high-magnitude non-zero integer outputs pin _exactUnaryLift's BigInt round-trip per element under bare _withListUnary on ALOG axis); got items=${v?.items?.map(x => `${x.type}(${x.value?.toString?.()})`).join(',')}`);
  }

  // ---- LN Tagged-of-List composition: outer Tagged unwraps,
  // inner List distributes per element, integer-clean fold per
  // element, outer Tagged re-applies.  Closes the LN axis on
  // the T+L composition; mirror of 's
  // :v:V LN pin on the LIST instead of the V wrapper.
  {
    const s = new Stack();
    s.push(Tagged('l', RList([Integer(1n), Integer(1n)])));
    lookup('LN').fn(s);
    const v = s.peek();
    assert(isTagged(v) && v.tag === 'l' && isList(v.value) && v.value.items.length === 2
        && isInteger(v.value.items[0]) && v.value.items[0].value === 0n
        && isInteger(v.value.items[1]) && v.value.items[1].value === 0n,
      `session158: LN :l:{Integer(1) Integer(1)} → :l:{Integer(0) Integer(0)} (Tagged-of-List composition through 3-deep wrapper on LN axis; outer tag preserved across element-wise List dispatch + per-element EXACT integer-stay fold); got tag=${v?.tag} items=${v?.value?.items?.map(x => `${x.type}(${x.value?.toString?.()})`).join(',')}`);
  }

  // ---- LOG Tagged-of-List with three distinct integer-clean
  // outputs.  Mirror of bare-List LOG pin above lifted into
  // Tagged-of-List composition; closes the LOG axis on T+L.
  {
    const s = new Stack();
    s.push(Tagged('l', RList([Integer(1n), Integer(10n), Integer(100n)])));
    lookup('LOG').fn(s);
    const v = s.peek();
    assert(isTagged(v) && v.tag === 'l' && isList(v.value) && v.value.items.length === 3
        && isInteger(v.value.items[0]) && v.value.items[0].value === 0n
        && isInteger(v.value.items[1]) && v.value.items[1].value === 1n
        && isInteger(v.value.items[2]) && v.value.items[2].value === 2n,
      `session158: LOG :l:{Integer(1) Integer(10) Integer(100)} → :l:{Integer(0) Integer(1) Integer(2)} (Tagged-of-List composition with three distinct integer-clean outputs at three List positions); got tag=${v?.tag} items=${v?.value?.items?.map(x => `${x.type}(${x.value?.toString?.()})`).join(',')}`);
  }

  // ---- HETEROGENEOUS integer-clean / stay-symbolic within a
  // single bare List on LOG.  log10(2)≈0.301 NOT integer-clean →
  // stay-symbolic per `_exactUnaryLift`'s fall-through;
  // log10(10)=1 integer-clean → Integer(1).  Strong pin: result
  // is a mixed-kind List (Symbolic + Integer) — pins that
  // `_exactUnaryLift`'s stay-symbolic fall-through and integer-
  // clean fold both operate per element under the BARE List
  // wrapper WITHOUT collapsing the whole List to a uniform
  // output kind. Mirror of 's mixed-kind
  // `:v:V(Z(2),Z(10)) LOG` pin on the bare-List axis.
  {
    const s = new Stack();
    s.push(RList([Integer(2n), Integer(10n)]));
    lookup('LOG').fn(s);
    const v = s.peek();
    const okShape = isList(v) && v.items.length === 2;
    const okSym = okShape && isSymbolic(v.items[0])
        && v.items[0].expr?.kind === 'fn' && v.items[0].expr.name === 'LOG';
    const okInt = okShape && isInteger(v.items[1]) && v.items[1].value === 1n;
    assert(okSym && okInt,
      `session158: LOG {Integer(2) Integer(10)} → {Symbolic LOG(2), Integer(1)} (HETEROGENEOUS per-element output: log10(2) not integer-clean → stay-symbolic, log10(10)=1 integer-clean → Integer; pins _exactUnaryLift's stay-symbolic fall-through and integer-clean fold both operate per element under BARE _withListUnary WITHOUT uniform-kind collapse); got items=${v?.items?.map(x => `${x.type}${x.value?.toString?.() ? '('+x.value.toString()+')' : ''}`).join(',')}`);
  }

  // ---- HETEROGENEOUS within Tagged-of-List on LOG.  Strongest
  // variant on the T+L axis — pins outer Tagged unwrap + inner
  // List per-element dispatch + per-element EXACT branch
  // (integer-clean OR stay-symbolic) + tag re-apply, all in one
  // observable result. Mirror of 's mixed-
  // kind Tagged-V LOG pin on the Tagged-of-List axis.
  {
    const s = new Stack();
    s.push(Tagged('l', RList([Integer(2n), Integer(10n)])));
    lookup('LOG').fn(s);
    const v = s.peek();
    const okShape = isTagged(v) && v.tag === 'l' && isList(v.value) && v.value.items.length === 2;
    const okSym = okShape && isSymbolic(v.value.items[0])
        && v.value.items[0].expr?.kind === 'fn' && v.value.items[0].expr.name === 'LOG';
    const okInt = okShape && isInteger(v.value.items[1]) && v.value.items[1].value === 1n;
    assert(okSym && okInt,
      `session158: LOG :l:{Integer(2) Integer(10)} → :l:{Symbolic LOG(2), Integer(1)} (HETEROGENEOUS within Tagged-of-List composition: outer tag preserved + per-element integer-clean OR stay-symbolic; closes mixed-kind axis on T+L composition); got tag=${v?.tag} items=${v?.value?.items?.map(x => `${x.type}${x.value?.toString?.() ? '('+x.value.toString()+')' : ''}`).join(',')}`);
  }

  // ---- APPROX-mode bypass under bare List composition: LOG
  // {Integer(1) Integer(100)} APPROX → {Real(0) Real(2)}.
  // Pins that the APPROX-mode flag flips the result KIND (Real
  // not Integer) per element under the bare-List wrapper —
  // distinct from the EXACT-mode all-Integer output of the LOG
  // {1, 10, 100} pin above on the same wrapper.  Mirror of
  // 's APPROX-bypass-under-Tagged-V pin
  // on the bare-List axis.
  {
    setApproxMode(true);
    try {
      const s = new Stack();
      s.push(RList([Integer(1n), Integer(100n)]));
      lookup('LOG').fn(s);
      const v = s.peek();
      const okShape = isList(v) && v.items.length === 2;
      const okItem0 = okShape && isReal(v.items[0]) && v.items[0].value.eq(0);
      const okItem1 = okShape && isReal(v.items[1]) && v.items[1].value.eq(2);
      assert(okItem0 && okItem1,
        `session158: LOG {Integer(1) Integer(100)} APPROX → {Real(0) Real(2)} (APPROX-mode bypass composes per element under bare _withListUnary: APPROX flips KIND from Integer to Real per element, integer-clean output values still emerge but as Real; mirror of session 150 Cluster 3's APPROX-under-Tagged-V pin on the L axis); got items=${v?.items?.map(x => `${x.type}(${x.value?.toString?.()})`).join(',')}`);
    } finally {
      setApproxMode(false);
    }
  }

  // session160 — Empty-List (n=0) boundary closures for the bare-List +
  // Tagged-of-List wrapper composition. Mirror of 's empty-
  // V/L/P n=0 boundary closures on AUR §3-149 OBJ→ rows; this lifts the
  // n=0 boundary onto the transcendental wrapper-LIST composition the
  // pins (n=2 / n=3) and the single-element
  // pins (n=1, below) bracket.  Pins that the inner `_withListUnary`
  // pass-through preserves an empty-List shell unchanged on every code
  // path, AND that the outer Tagged wrapper preserves the tag across the
  // empty inner composition.
  // ---- Empty bare List on LN: { } LN → { } (transcendental n=0 edge).
  {
    const s = new Stack();
    s.push(RList([]));
    lookup('LN').fn(s);
    const v = s.peek();
    assert(isList(v) && v.items.length === 0,
      `session160: { } LN → { } (n=0 empty-List boundary on bare _withListUnary — transcendental wrapper preserves empty shell unchanged; closes the boundary the s158 n=2/n=3 pins do not enumerate); got ${v?.type} items.length=${v?.items?.length}`);
  }

  // ---- Empty Tagged-of-List on LN: :l:{ } LN → :l:{ } (n=0 under
  // 3-deep wrapper composition; outer tag preserved across empty inner).
  {
    const s = new Stack();
    s.push(Tagged('l', RList([])));
    lookup('LN').fn(s);
    const v = s.peek();
    assert(isTagged(v) && v.tag === 'l'
        && isList(v.value) && v.value.items.length === 0,
      `session160: :l:{ } LN → :l:{ } (n=0 empty-List under Tagged composition: outer tag preserved across empty inner List dispatch through 3-deep wrapper; mirror of the bare empty-List pin lifted onto T+L); got tag=${v?.tag} inner=${v?.value?.type} items.length=${v?.value?.items?.length}`);
  }

  // ---- Single-element bare List (n=1) boundary on LN: { Integer(1) }
  // LN → { Integer(0) }. Distinct from 's n=2 pin (which is
  // homogeneous-zero output) — the n=1 case guards against a refactor
  // that special-cases n=1 to the bare-scalar code path and bypasses the
  // _withListUnary wrapper.  Closes the n=1 shoulder between the s160
  // n=0 and s158 n=2 pins.
  {
    const s = new Stack();
    s.push(RList([Integer(1n)]));
    lookup('LN').fn(s);
    const v = s.peek();
    assert(isList(v) && v.items.length === 1
        && isInteger(v.items[0]) && v.items[0].value === 0n,
      `session160: { Integer(1) } LN → { Integer(0) } (n=1 single-element boundary on bare _withListUnary; pins per-element EXACT-mode integer-clean fold runs through the wrapper for n=1 — guards against refactor that bypasses wrapper for singleton); got items=${v?.items?.map(x => `${x.type}(${x.value?.toString?.()})`).join(',')}`);
  }

  // session162 — LNP1 / EXPM bare-List + Tagged-of-List composition.
  // Cluster 1. pinned LNP1 Tagged-of-Vector
  // composition through the 3-deep wrapper `_withTaggedUnary(
  // _withListUnary(_withVMUnary(handler)))`.
  // pinned EXPM Tagged-of-Vector and Tagged-of-Matrix on the same
  // wrapper, closing the V/M axis on the LNP1/EXPM dual pair.
  // closed the bare-List + Tagged-of-List composition
  // axis on the LN / LOG / EXP / ALOG quartet.  But the LNP1/EXPM
  // L+T composition was not specifically pinned: the matrix carried
  // L ✓ T ✓ on both ops since / 130, but no direct
  // assertion on (a) per-element bare-List dispatch under
  // `_withListUnary`, (b) Tagged-of-List composition outer-tag
  // preservation, or (c) the n=0 / n=1 boundary closures (which
  // added for LN but not for the LNP1/EXPM duals).
  // CONTRAST with LN/LOG/EXP/ALOG L+T pins: those four
  // ops dispatch through `_unaryCx` which has an EXACT-mode
  // `_exactUnaryLift` Integer-stay-exact arm — Integer(1) input
  // lands as Integer output when the result is integer-clean.
  // LNP1/EXPM bypass `_unaryCx` entirely (registered directly at
  // ops.js:7702/7709 with bare `_withTaggedUnary(_withListUnary(
  // _withVMUnary(...)))` — no `_unaryCx`); the inner handler is
  // `Real(Math.log1p(toRealOrThrow(v)))` / `Real(Math.expm1(...))`,
  // so Integer input is silently coerced to Real per element.  The
  // Integer-stay-exact arm DOES NOT FIRE on LNP1/EXPM — every
  // numeric input lands as Real output.  This cluster pins that
  // contrast: bare-List Integer-input → Real-output per element on
  // LNP1/EXPM (vs. LN/LOG/EXP/ALOG's Integer-stay-Integer when
  // integer-clean).  Pins also: bare-List Real-input pass-through,
  // Tagged-of-List composition tag preservation, n=0 empty-List
  // boundary on both bare and Tagged-of-List, and n=1 single-
  // element boundary (mirror of 's LN n=0 / n=1 pins
  // lifted onto the LNP1/EXPM duals).
  // The mixed-input pin (LNP1 { Real(-0.5) Real(0) } → { Real(ln(
  // 0.5)) Real(0) }) closes a heterogeneous-output-value axis:
  // distinct Real values per List position pin per-element wrapper
  // dispatch (NOT a uniform-output-value short-circuit).

  // ---- LNP1 bare-List Real-element pass-through.  Pins per-element
  //      `Math.log1p` fold under bare `_withListUnary`: log1p(0)=0
  //      lands as Real(0) per element (NOT Integer-stay; LNP1 has
  // no `_exactUnaryLift` arm — distinct from LN's
  //      pin where Integer(1) → Integer(0) integer-stay).
  {
    const s = new Stack();
    s.push(RList([Real(0), Real(0)]));
    lookup('LNP1').fn(s);
    const v = s.peek();
    assert(isList(v) && v.items.length === 2
        && isReal(v.items[0]) && v.items[0].value.eq(0)
        && isReal(v.items[1]) && v.items[1].value.eq(0),
      `session162: LNP1 { Real(0) Real(0) } → { Real(0) Real(0) } (per-element Math.log1p fold under bare _withListUnary on LNP1 axis; closes bare-List axis on LNP1 — log1p(0)=0 boundary, pins wrapper composition fires); got items=${v?.items?.map(x => `${x.type}(${x.value?.toString?.()})`).join(',')}`);
  }

  // ---- LNP1 bare-List Integer-input → Real-output per element.
  // DISTINCT from LN { Integer(1) Integer(1) } →
  //      { Integer(0) Integer(0) } where the EXACT-mode integer-
  //      stay arm fires.  LNP1 routes directly through
  //      `Real(Math.log1p(toRealOrThrow(v)))` — Integer is silently
  //      coerced to Real per element.  Pins the absence of the
  //      `_exactUnaryLift` arm on LNP1 (which is correct — LNP1
  //      bypasses `_unaryCx`).
  {
    const s = new Stack();
    s.push(RList([Integer(0n), Integer(0n)]));
    lookup('LNP1').fn(s);
    const v = s.peek();
    assert(isList(v) && v.items.length === 2
        && isReal(v.items[0]) && v.items[0].value.eq(0)
        && isReal(v.items[1]) && v.items[1].value.eq(0),
      `session162: LNP1 { Integer(0) Integer(0) } → { Real(0) Real(0) } (Integer-input → Real-output per element under bare _withListUnary; LNP1 bypasses _unaryCx so no EXACT-mode Integer-stay-exact arm fires — DISTINCT from session 158 LN/LOG/EXP/ALOG L axis where Integer-stay-Integer holds); got items=${v?.items?.map(x => `${x.type}(${x.value?.toString?.()})`).join(',')}`);
  }

  // ---- LNP1 Tagged-of-List composition: outer tag preserved
  //      across element-wise List dispatch through 3-deep wrapper.
  {
    const s = new Stack();
    s.push(Tagged('n', RList([Real(0), Real(0)])));
    lookup('LNP1').fn(s);
    const v = s.peek();
    assert(isTagged(v) && v.tag === 'n'
        && isList(v.value) && v.value.items.length === 2
        && isReal(v.value.items[0]) && v.value.items[0].value.eq(0)
        && isReal(v.value.items[1]) && v.value.items[1].value.eq(0),
      `session162: LNP1 :n:{ Real(0) Real(0) } → :n:{ Real(0) Real(0) } (Tagged-of-List composition through 3-deep wrapper on LNP1 axis; outer tag preserved across element-wise List dispatch + per-element Math.log1p fold; closes T+L composition on LNP1 — mirror of session 158 LN/LOG/EXP/ALOG T+L pins on the LNP1 dual); got tag=${v?.tag} items=${v?.value?.items?.map(x => `${x.type}(${x.value?.toString?.()})`).join(',')}`);
  }

  // ---- LNP1 mixed-input bare-List: heterogeneous Real values per
  //      List position emerge as distinct Real outputs.  Pins per-
  //      element wrapper dispatch (NOT a uniform short-circuit) —
  //      log1p(-0.5) ≈ -0.6931 ≠ log1p(0) = 0.
  {
    const s = new Stack();
    s.push(RList([Real(-0.5), Real(0)]));
    lookup('LNP1').fn(s);
    const v = s.peek();
    const expected0 = Math.log1p(-0.5);
    assert(isList(v) && v.items.length === 2
        && isReal(v.items[0]) && Math.abs(v.items[0].value.toNumber() - expected0) < 1e-12
        && isReal(v.items[1]) && v.items[1].value.eq(0),
      `session162: LNP1 { Real(-0.5) Real(0) } → { Real(log1p(-0.5)) Real(0) } (heterogeneous-output-value pin under bare _withListUnary on LNP1 — distinct values per List position pin per-element wrapper dispatch); got items=${v?.items?.map(x => `${x.type}(${x.value?.toString?.()})`).join(',')}`);
  }

  // ---- LNP1 boundary throw under bare-List: Real(-1) is the
  //      vertical asymptote (log1p(-1) = ln(0) = -∞).  The inner
  //      handler throws `RPLError('Infinite result')`; pins that
  //      the throw propagates through the wrapper's `apply` loop
  //      (NOT swallowed, NOT replaced with NaN/null).  Sibling
  //      contract to LN/LOG/etc. throwing on out-of-domain input.
  {
    const s = new Stack();
    s.push(RList([Real(-1)]));
    assertThrows(
      () => lookup('LNP1').fn(s),
      /Infinite result/,
      `session162: LNP1 { Real(-1) } throws Infinite result (boundary log1p(-1) = -∞ propagates through bare _withListUnary's apply loop — wrapper does NOT swallow inner throw); got no throw`,
    );
  }

  // ---- EXPM bare-List Real-element pass-through.  Pins per-
  //      element `Math.expm1` fold under bare `_withListUnary`:
  //      expm1(0)=0 lands as Real(0) per element.
  {
    const s = new Stack();
    s.push(RList([Real(0), Real(0)]));
    lookup('EXPM').fn(s);
    const v = s.peek();
    assert(isList(v) && v.items.length === 2
        && isReal(v.items[0]) && v.items[0].value.eq(0)
        && isReal(v.items[1]) && v.items[1].value.eq(0),
      `session162: EXPM { Real(0) Real(0) } → { Real(0) Real(0) } (per-element Math.expm1 fold under bare _withListUnary on EXPM axis; closes bare-List axis on EXPM — expm1(0)=0 boundary, dual to LNP1's log1p(0)=0); got items=${v?.items?.map(x => `${x.type}(${x.value?.toString?.()})`).join(',')}`);
  }

  // ---- EXPM bare-List Integer-input → Real-output per element.
  //      Same `_exactUnaryLift`-bypass contract as LNP1 (Integer-
  //      stay-exact arm DOES NOT FIRE on EXPM — Integer is coerced
  //      to Real per element via `toRealOrThrow`).  DISTINCT from
  // EXP { Integer(0) Integer(0) } → { Integer(1)
  //      Integer(1) } where EXP routes through `_unaryCx`'s EXACT-
  //      mode arm.
  {
    const s = new Stack();
    s.push(RList([Integer(0n), Integer(0n)]));
    lookup('EXPM').fn(s);
    const v = s.peek();
    assert(isList(v) && v.items.length === 2
        && isReal(v.items[0]) && v.items[0].value.eq(0)
        && isReal(v.items[1]) && v.items[1].value.eq(0),
      `session162: EXPM { Integer(0) Integer(0) } → { Real(0) Real(0) } (Integer-input → Real-output per element under bare _withListUnary; EXPM bypasses _unaryCx so no EXACT Integer-stay arm fires — DISTINCT from session 158 EXP L axis Integer(0)→Integer(1)); got items=${v?.items?.map(x => `${x.type}(${x.value?.toString?.()})`).join(',')}`);
  }

  // ---- EXPM Tagged-of-List composition: outer tag preserved.
  // Closes T+L composition on EXPM — mirror of
  //      Cluster 2's EXPM Tagged-of-V/M pin lifted onto the L axis
  //      of the dual (LNP1 closed on T+L just above; this closes
  //      the dual pair on T+L).
  {
    const s = new Stack();
    s.push(Tagged('e', RList([Real(0), Real(0)])));
    lookup('EXPM').fn(s);
    const v = s.peek();
    assert(isTagged(v) && v.tag === 'e'
        && isList(v.value) && v.value.items.length === 2
        && isReal(v.value.items[0]) && v.value.items[0].value.eq(0)
        && isReal(v.value.items[1]) && v.value.items[1].value.eq(0),
      `session162: EXPM :e:{ Real(0) Real(0) } → :e:{ Real(0) Real(0) } (Tagged-of-List composition through 3-deep wrapper on EXPM axis; outer tag preserved across element-wise List dispatch — closes the LNP1/EXPM dual pair on the T+L composition axis); got tag=${v?.tag} items=${v?.value?.items?.map(x => `${x.type}(${x.value?.toString?.()})`).join(',')}`);
  }

  // ---- EXPM mixed-input bare-List: heterogeneous Real outputs at
  //      distinct positions.  expm1(1) = e - 1 ≈ 1.7183 ≠ expm1(0)
  //      = 0; pins per-element wrapper dispatch on EXPM.
  {
    const s = new Stack();
    s.push(RList([Real(1), Real(0)]));
    lookup('EXPM').fn(s);
    const v = s.peek();
    const expected0 = Math.expm1(1);
    assert(isList(v) && v.items.length === 2
        && isReal(v.items[0]) && Math.abs(v.items[0].value.toNumber() - expected0) < 1e-12
        && isReal(v.items[1]) && v.items[1].value.eq(0),
      `session162: EXPM { Real(1) Real(0) } → { Real(expm1(1)) Real(0) } (heterogeneous-output-value pin under bare _withListUnary on EXPM — distinct values per List position pin per-element wrapper dispatch); got items=${v?.items?.map(x => `${x.type}(${x.value?.toString?.()})`).join(',')}`);
  }

  // session162 — LNP1 / EXPM n=0 empty-List + n=1 single-element
  // boundary closures.
  // Cluster 2. added n=0 empty-List and n=1 single-
  // element boundary pins on the LN axis (`{ } LN → { }`,
  // `:l:{ } LN → :l:{ }`, `{ Integer(1) } LN → { Integer(0) }`).
  // The same boundary closures on the LNP1/EXPM dual pair were
  // not added (single-cluster scope). This
  // cluster lifts the n=0 / n=1 boundary closures onto LNP1 and
  // EXPM — pins that the inner `_withListUnary` `apply` loop
  // preserves an empty-List shell unchanged AND that the n=1
  // singleton pass goes through the wrapper (NOT special-cased
  // to bare-scalar).
  // The n=0 boundary is a distinct refactor-guard from the n=2
  // pin in Cluster 1 above: a future refactor that bypasses the
  // wrapper for an empty list (e.g. `if items.length === 0
  // return []` short-circuit) would still pass the n=2 pin but
  // would miss the wrapper's `RList(items.map(...))` shell-
  // preservation contract.  Pinning n=0 explicitly closes that
  // gap (mirror of 's reasoning for the LN axis).

  // ---- LNP1 n=0 empty-List boundary: { } LNP1 → { }.
  {
    const s = new Stack();
    s.push(RList([]));
    lookup('LNP1').fn(s);
    const v = s.peek();
    assert(isList(v) && v.items.length === 0,
      `session162: { } LNP1 → { } (n=0 empty-List boundary on bare _withListUnary — LNP1 wrapper preserves empty shell unchanged; closes n=0 corner the cluster-1 n=2 pin doesn't enumerate, mirror of session 160 LN n=0 pin); got ${v?.type} items.length=${v?.items?.length}`);
  }

  // ---- LNP1 n=0 empty Tagged-of-List: :l:{ } LNP1 → :l:{ }.
  {
    const s = new Stack();
    s.push(Tagged('l', RList([])));
    lookup('LNP1').fn(s);
    const v = s.peek();
    assert(isTagged(v) && v.tag === 'l'
        && isList(v.value) && v.value.items.length === 0,
      `session162: :l:{ } LNP1 → :l:{ } (n=0 empty-List under Tagged composition on LNP1: outer tag preserved across empty inner List dispatch through 3-deep wrapper; mirror of session 160 LN T+L n=0 pin lifted onto LNP1 dual); got tag=${v?.tag} inner=${v?.value?.type} items.length=${v?.value?.items?.length}`);
  }

  // ---- LNP1 n=1 single-element bare-List: { Real(0) } LNP1 →
  //      { Real(0) }.  Distinct from cluster-1 n=2 pin — the n=1
  //      case guards against a refactor that special-cases n=1 to
  //      the bare-scalar code path and bypasses the
  //      `_withListUnary` wrapper.  Closes the n=1 shoulder
  //      between this cluster's n=0 pin and cluster-1's n=2 pin.
  {
    const s = new Stack();
    s.push(RList([Real(0)]));
    lookup('LNP1').fn(s);
    const v = s.peek();
    assert(isList(v) && v.items.length === 1
        && isReal(v.items[0]) && v.items[0].value.eq(0),
      `session162: { Real(0) } LNP1 → { Real(0) } (n=1 single-element boundary on bare _withListUnary; pins per-element Math.log1p fold runs through the wrapper for n=1 — guards against refactor that bypasses wrapper for singleton on LNP1 axis); got items=${v?.items?.map(x => `${x.type}(${x.value?.toString?.()})`).join(',')}`);
  }

  // ---- EXPM n=0 empty-List boundary: { } EXPM → { }.
  {
    const s = new Stack();
    s.push(RList([]));
    lookup('EXPM').fn(s);
    const v = s.peek();
    assert(isList(v) && v.items.length === 0,
      `session162: { } EXPM → { } (n=0 empty-List boundary on bare _withListUnary — EXPM wrapper preserves empty shell unchanged; closes n=0 corner on EXPM dual, mirror of session 160 LN n=0 pin); got ${v?.type} items.length=${v?.items?.length}`);
  }

  // ---- EXPM n=0 empty Tagged-of-List: :l:{ } EXPM → :l:{ }.
  {
    const s = new Stack();
    s.push(Tagged('l', RList([])));
    lookup('EXPM').fn(s);
    const v = s.peek();
    assert(isTagged(v) && v.tag === 'l'
        && isList(v.value) && v.value.items.length === 0,
      `session162: :l:{ } EXPM → :l:{ } (n=0 empty-List under Tagged composition on EXPM: outer tag preserved across empty inner List dispatch through 3-deep wrapper — closes the LNP1/EXPM dual pair on the n=0 T+L boundary); got tag=${v?.tag} inner=${v?.value?.type} items.length=${v?.value?.items?.length}`);
  }

  // ---- EXPM n=1 single-element bare-List: { Real(0) } EXPM →
  //      { Real(0) }.  Pins n=1 shoulder on EXPM — closes the
  //      LNP1/EXPM dual pair on the n=1 boundary (LNP1 above).
  {
    const s = new Stack();
    s.push(RList([Real(0)]));
    lookup('EXPM').fn(s);
    const v = s.peek();
    assert(isList(v) && v.items.length === 1
        && isReal(v.items[0]) && v.items[0].value.eq(0),
      `session162: { Real(0) } EXPM → { Real(0) } (n=1 single-element boundary on bare _withListUnary; pins per-element Math.expm1 fold runs through the wrapper for n=1 — closes LNP1/EXPM dual pair on n=1 shoulder); got items=${v?.items?.map(x => `${x.type}(${x.value?.toString?.()})`).join(',')}`);
  }

  // session164 — LNP1 / EXPM follow-up edges that the
  // s162 cluster-1 pin-set did not enumerate.  Three pins:
  //   (1) LNP1 boundary-throw under Tagged-of-List composition —
  //       s162 pinned `{ Real(-1) } LNP1 → throws Infinite result`
  //       on bare-List but did NOT pin the same throw under the
  //       3-deep wrapper's Tagged peel.  This pin lifts the
  //       boundary-throw propagation contract onto the T+L
  //       composition (outer Tagged peel, then the inner bare-List
  //       wrapper's `apply` loop propagates the inner handler's
  //       `RPLError('Infinite result')` through both wrappers
  //       without swallowing).  Catches a refactor that special-
  //       cases a Tagged outer to swallow inner throws (e.g., a
  //       try/catch in `_withTaggedUnary` that re-tags an error
  //       value instead of re-throwing).
  //   (2) LNP1 heterogeneous-output mixed-input under Tagged-of-
  //       List — s162 pinned bare-List `{ Real(-0.5) Real(0) }
  //       LNP1 → { Real(log1p(-0.5)) Real(0) }` but the same
  //       heterogeneous pin under Tagged composition was unpinned.
  //       Lifts the per-element wrapper-dispatch evidence onto the
  //       T+L composition: outer tag preserved + per-element
  //       distinct-value output (NOT a uniform-output short-circuit
  //       under Tagged peel).
  //   (3) EXPM heterogeneous-output mixed-input under Tagged-of-
  //       List — companion to LNP1 pin (2); closes the LNP1/EXPM
  //       dual pair on the T+L heterogeneous-output axis.  s162
  //       only pinned EXPM bare-List heterogeneous; the Tagged-of-
  //       List heterogeneous case is the symmetric closure.

  // ---- LNP1 boundary-throw under Tagged-of-List: :l:{ Real(-1) }
  //      LNP1 → throws Infinite result.
  {
    const s = new Stack();
    s.push(Tagged('l', RList([Real(-1)])));
    let threw = null;
    try { lookup('LNP1').fn(s); } catch (e) { threw = e; }
    assert(threw && /Infinite result/.test(threw.message),
      `session164: :l:{ Real(-1) } LNP1 throws Infinite result (boundary log1p(-1) = -∞ propagates through Tagged peel + bare _withListUnary's apply loop — wrappers do NOT swallow inner throw under Tagged-of-List composition; mirror of s162 bare-List boundary pin lifted onto T+L); got ${threw?.message ?? 'no throw'}`);
  }

  // ---- LNP1 heterogeneous-output mixed-input under Tagged-of-List:
  //      :n:{ Real(-0.5) Real(0) } LNP1 → :n:{ Real(log1p(-0.5))
  //      Real(0) }.  Distinct values per List position pin per-
  //      element wrapper dispatch under Tagged composition.
  {
    const s = new Stack();
    s.push(Tagged('n', RList([Real(-0.5), Real(0)])));
    lookup('LNP1').fn(s);
    const v = s.peek();
    assert(isTagged(v) && v.tag === 'n'
        && isList(v.value) && v.value.items.length === 2
        && isReal(v.value.items[0])
        && Math.abs(v.value.items[0].value.toNumber() - Math.log1p(-0.5)) < 1e-12
        && isReal(v.value.items[1]) && v.value.items[1].value.eq(0),
      `session164: :n:{ Real(-0.5) Real(0) } LNP1 → :n:{ Real(log1p(-0.5)) Real(0) } (heterogeneous-output-value pin under Tagged-of-List composition on LNP1 — outer tag preserved + distinct values per List position via per-element wrapper dispatch; mirror of s162 bare-List heterogeneous pin lifted onto T+L); got tag=${v?.tag} items=${v?.value?.items?.map(x => `${x.type}(${x.value?.toString?.()})`).join(',')}`);
  }

  // ---- EXPM heterogeneous-output mixed-input under Tagged-of-List:
  //      :e:{ Real(1) Real(0) } EXPM → :e:{ Real(expm1(1))
  //      Real(0) }.  Companion to LNP1 pin above; closes the
  //      LNP1/EXPM dual pair on the T+L heterogeneous-output axis.
  {
    const s = new Stack();
    s.push(Tagged('e', RList([Real(1), Real(0)])));
    lookup('EXPM').fn(s);
    const v = s.peek();
    assert(isTagged(v) && v.tag === 'e'
        && isList(v.value) && v.value.items.length === 2
        && isReal(v.value.items[0])
        && Math.abs(v.value.items[0].value.toNumber() - Math.expm1(1)) < 1e-12
        && isReal(v.value.items[1]) && v.value.items[1].value.eq(0),
      `session164: :e:{ Real(1) Real(0) } EXPM → :e:{ Real(expm1(1)) Real(0) } (heterogeneous-output-value pin under Tagged-of-List composition on EXPM — closes LNP1/EXPM dual pair on the T+L heterogeneous-output axis; mirror of s162 bare-List heterogeneous pin lifted onto T+L); got tag=${v?.tag} items=${v?.value?.items?.map(x => `${x.type}(${x.value?.toString?.()})`).join(',')}`);
  }

  // session166 — Cluster 1: LOG / EXP / ALOG n=0 empty-List + n=1
  // single-element boundary closures on the bare-List + Tagged-of-List
  // wrapper composition.
  // added n=0 / n=1 boundary pins on the LN axis only —
  // explicit single-cluster scope. lifted those n=0 / n=1
  // boundary closures onto the LNP1 / EXPM dual pair (which bypasses
  // `_unaryCx` entirely — different code path).  But the LOG / EXP /
  // ALOG trio (the remaining three ops in the `_unaryCx`-
  // routed quartet) was never explicitly pinned for n=0 / n=1.  The
  // matrix has carried L ✓ T ✓ on these ops since /105's
  // wrapper-VM cleanup, but 's L+T pin set used n=2 / n=3
  // homogeneous + heterogeneous cases without enumerating the n=0
  // empty-List shoulder or the n=1 single-element shoulder.
  // This cluster closes the LOG / EXP / ALOG trio on the n=0 / n=1
  // boundary axes — same code path as the LN n=0 / n=1
  // pins, lifted onto the remaining three ops in the quartet that
  // routes through `_unaryCx` (`ops.js:7984`).  Pure pinning: no
  // source-side change. Mirror of 's structure.
  // Why these boundary pins matter: the n=2 / n=3 pins
  // can't catch a refactor that special-cases n=0 (e.g. early-return
  // an empty list to bypass the wrapper) or n=1 (e.g. unwrap to bare
  // scalar before dispatch).  The n=0 / n=1 pins guard those
  // shoulders explicitly.

  {
    const s = new Stack();
    s.push(RList([]));
    lookup('LOG').fn(s);
    const v = s.peek();
    assert(isList(v) && v.items.length === 0,
      `session166: { } LOG → { } (n=0 empty-List boundary on bare _withListUnary on LOG axis — wrapper preserves empty shell unchanged; closes the boundary the s158 n=2/n=3 pins do not enumerate; mirror of s160 LN n=0 pin lifted onto LOG); got ${v?.type} items.length=${v?.items?.length}`);
  }

  {
    const s = new Stack();
    s.push(Tagged('l', RList([])));
    lookup('LOG').fn(s);
    const v = s.peek();
    assert(isTagged(v) && v.tag === 'l'
        && isList(v.value) && v.value.items.length === 0,
      `session166: :l:{ } LOG → :l:{ } (n=0 empty-List under Tagged composition on LOG: outer tag preserved across empty inner List dispatch through 3-deep wrapper; mirror of s160 LN T+L n=0 pin lifted onto LOG); got tag=${v?.tag} inner=${v?.value?.type} items.length=${v?.value?.items?.length}`);
  }

  // Single-element boundary; pins per-element EXACT-mode integer-
  // clean fold runs through the wrapper for n=1 — guards against a
  // refactor that bypasses the wrapper for singletons.  log10(10)=1
  // integer-clean → Integer(1).
  {
    const s = new Stack();
    s.push(RList([Integer(10n)]));
    lookup('LOG').fn(s);
    const v = s.peek();
    assert(isList(v) && v.items.length === 1
        && isInteger(v.items[0]) && v.items[0].value === 1n,
      `session166: { Integer(10) } LOG → { Integer(1) } (n=1 single-element boundary on bare _withListUnary on LOG; pins per-element EXACT-mode integer-clean fold runs through the wrapper for n=1 — guards against refactor that bypasses wrapper for singleton); got items=${v?.items?.map(x => `${x.type}(${x.value?.toString?.()})`).join(',')}`);
  }

  // ---- LOG Tagged-of-List n=1: :l:{ Integer(10) } LOG
  //      → :l:{ Integer(1) } ----
  {
    const s = new Stack();
    s.push(Tagged('l', RList([Integer(10n)])));
    lookup('LOG').fn(s);
    const v = s.peek();
    assert(isTagged(v) && v.tag === 'l'
        && isList(v.value) && v.value.items.length === 1
        && isInteger(v.value.items[0]) && v.value.items[0].value === 1n,
      `session166: :l:{ Integer(10) } LOG → :l:{ Integer(1) } (n=1 single-element under Tagged-of-List composition on LOG; outer tag preserved + inner per-element EXACT integer-clean fold for the singleton); got tag=${v?.tag} items=${v?.value?.items?.map(x => `${x.type}(${x.value?.toString?.()})`).join(',')}`);
  }

  {
    const s = new Stack();
    s.push(RList([]));
    lookup('EXP').fn(s);
    const v = s.peek();
    assert(isList(v) && v.items.length === 0,
      `session166: { } EXP → { } (n=0 empty-List boundary on bare _withListUnary on EXP axis — wrapper preserves empty shell unchanged; closes EXP n=0 corner that s158 n=2 pin does not enumerate); got ${v?.type} items.length=${v?.items?.length}`);
  }

  {
    const s = new Stack();
    s.push(Tagged('l', RList([])));
    lookup('EXP').fn(s);
    const v = s.peek();
    assert(isTagged(v) && v.tag === 'l'
        && isList(v.value) && v.value.items.length === 0,
      `session166: :l:{ } EXP → :l:{ } (n=0 empty-List under Tagged composition on EXP: outer tag preserved across empty inner List dispatch); got tag=${v?.tag} inner=${v?.value?.type} items.length=${v?.value?.items?.length}`);
  }

  // exp(0)=1 integer-clean → Integer(1) per element under bare-List
  // wrapper for n=1.
  {
    const s = new Stack();
    s.push(RList([Integer(0n)]));
    lookup('EXP').fn(s);
    const v = s.peek();
    assert(isList(v) && v.items.length === 1
        && isInteger(v.items[0]) && v.items[0].value === 1n,
      `session166: { Integer(0) } EXP → { Integer(1) } (n=1 single-element boundary on bare _withListUnary on EXP; non-zero integer output pins inner EXP handler ran via the wrapper for n=1); got items=${v?.items?.map(x => `${x.type}(${x.value?.toString?.()})`).join(',')}`);
  }

  // ---- EXP Tagged-of-List n=1: :l:{ Integer(0) } EXP
  //      → :l:{ Integer(1) } ----
  {
    const s = new Stack();
    s.push(Tagged('l', RList([Integer(0n)])));
    lookup('EXP').fn(s);
    const v = s.peek();
    assert(isTagged(v) && v.tag === 'l'
        && isList(v.value) && v.value.items.length === 1
        && isInteger(v.value.items[0]) && v.value.items[0].value === 1n,
      `session166: :l:{ Integer(0) } EXP → :l:{ Integer(1) } (n=1 single-element under Tagged-of-List on EXP; outer tag preserved + per-element EXACT integer-clean fold); got tag=${v?.tag} items=${v?.value?.items?.map(x => `${x.type}(${x.value?.toString?.()})`).join(',')}`);
  }

  {
    const s = new Stack();
    s.push(RList([]));
    lookup('ALOG').fn(s);
    const v = s.peek();
    assert(isList(v) && v.items.length === 0,
      `session166: { } ALOG → { } (n=0 empty-List boundary on bare _withListUnary on ALOG axis — wrapper preserves empty shell unchanged; closes ALOG n=0 corner that s158 n=3 pin does not enumerate); got ${v?.type} items.length=${v?.items?.length}`);
  }

  {
    const s = new Stack();
    s.push(Tagged('l', RList([])));
    lookup('ALOG').fn(s);
    const v = s.peek();
    assert(isTagged(v) && v.tag === 'l'
        && isList(v.value) && v.value.items.length === 0,
      `session166: :l:{ } ALOG → :l:{ } (n=0 empty-List under Tagged composition on ALOG: outer tag preserved across empty inner List dispatch); got tag=${v?.tag} inner=${v?.value?.type} items.length=${v?.value?.items?.length}`);
  }

  // 10^2=100 integer-clean (high-magnitude relative to LN/EXP n=1
  // pin) — pins `_exactUnaryLift`'s BigInt round-trip per element
  // under bare-List wrapper for n=1.
  {
    const s = new Stack();
    s.push(RList([Integer(2n)]));
    lookup('ALOG').fn(s);
    const v = s.peek();
    assert(isList(v) && v.items.length === 1
        && isInteger(v.items[0]) && v.items[0].value === 100n,
      `session166: { Integer(2) } ALOG → { Integer(100) } (n=1 single-element boundary on bare _withListUnary on ALOG; high-magnitude integer output pins _exactUnaryLift's BigInt round-trip ran via the wrapper for n=1); got items=${v?.items?.map(x => `${x.type}(${x.value?.toString?.()})`).join(',')}`);
  }

  // ---- ALOG Tagged-of-List n=1: :l:{ Integer(2) } ALOG
  //      → :l:{ Integer(100) } ----
  {
    const s = new Stack();
    s.push(Tagged('l', RList([Integer(2n)])));
    lookup('ALOG').fn(s);
    const v = s.peek();
    assert(isTagged(v) && v.tag === 'l'
        && isList(v.value) && v.value.items.length === 1
        && isInteger(v.value.items[0]) && v.value.items[0].value === 100n,
      `session166: :l:{ Integer(2) } ALOG → :l:{ Integer(100) } (n=1 single-element under Tagged-of-List on ALOG; outer tag preserved + per-element high-magnitude integer-clean fold); got tag=${v?.tag} items=${v?.value?.items?.map(x => `${x.type}(${x.value?.toString?.()})`).join(',')}`);
  }

  // session166 — Cluster 2: ATANH n=0 + ACOSH/ATANH n=1 boundary
  // closures + ACOSH/ATANH Tagged-of-List n=0 closures on the
  // direct-registered (non-`_unaryCx`) wrapper shape.
  // added an n=0 boundary pin on ACOSH (`{ } ACOSH →
  // { }`) but did NOT pin (a) the symmetric ATANH n=0 case, (b)
  // either op's Tagged-of-List n=0 case (`:h:{ } ACOSH/ATANH`),
  // or (c) the n=1 single-element shoulder on either op.  These
  // ops dispatch through a bespoke direct-registered composition
  // shape (not `_unaryCx`), so the n=0 / n=1 boundary closures
  // need explicit pinning on this shape — they aren't covered by
  // the LN-axis pins or the LNP1/EXPM
  // pins, which run through different code paths.
  // This cluster mirrors the structure of
  // (the LNP1 / EXPM n=0 / n=1 closures on a different
  // direct-registered wrapper) onto the inverse-hyp pair —
  // closing the n=0 / n=1 boundary axes on ACOSH / ATANH.

  // Symmetric to 's ACOSH n=0 pin lifted onto ATANH.
  {
    const s = new Stack();
    s.push(RList([]));
    lookup('ATANH').fn(s);
    const v = s.peek();
    assert(isList(v) && v.items.length === 0,
      `session166: { } ATANH → { } (n=0 empty-List boundary on direct-registered ATANH bare wrapper; symmetric to s160 ACOSH n=0 pin lifted onto ATANH — closes ATANH n=0 corner that s158 n=2 pins do not enumerate); got ${v?.type} items.length=${v?.items?.length}`);
  }

  // Lifts 's bare-List ACOSH n=0 pin onto Tagged-of-
  // List composition on the direct-registered wrapper shape.
  {
    const s = new Stack();
    s.push(Tagged('h', RList([])));
    lookup('ACOSH').fn(s);
    const v = s.peek();
    assert(isTagged(v) && v.tag === 'h'
        && isList(v.value) && v.value.items.length === 0,
      `session166: :h:{ } ACOSH → :h:{ } (n=0 empty-List under Tagged-of-List composition on direct-registered ACOSH; outer tag preserved across empty inner List dispatch through 3-deep wrapper — closes ACOSH T+L n=0 corner that s158/s160 do not enumerate); got tag=${v?.tag} inner=${v?.value?.type} items.length=${v?.value?.items?.length}`);
  }

  {
    const s = new Stack();
    s.push(Tagged('h', RList([])));
    lookup('ATANH').fn(s);
    const v = s.peek();
    assert(isTagged(v) && v.tag === 'h'
        && isList(v.value) && v.value.items.length === 0,
      `session166: :h:{ } ATANH → :h:{ } (n=0 empty-List under Tagged-of-List composition on direct-registered ATANH; outer tag preserved across empty inner — closes ATANH T+L n=0 corner); got tag=${v?.tag} inner=${v?.value?.type} items.length=${v?.value?.items?.length}`);
  }

  // acosh(1)=0 boundary value — the same value 's bare-List
  // ACOSH pin uses but at the n=1 shoulder (singleton, distinct from
  // s158's n=2 pin).  Pins per-element wrapper dispatch fires for n=1
  // and does NOT bypass the wrapper to scalar handler.
  {
    const s = new Stack();
    s.push(RList([Real(1)]));
    lookup('ACOSH').fn(s);
    const v = s.peek();
    assert(isList(v) && v.items.length === 1
        && isReal(v.items[0]) && v.items[0].value.eq(0),
      `session166: { Real(1) } ACOSH → { Real(0) } (n=1 single-element boundary on bare _withListUnary on direct-registered ACOSH; pins per-element acosh(1)=0 fold runs through the wrapper for n=1 — guards against singleton bypass refactor); got items=${v?.items?.map(x => `${x.type}(${x.value?.toString?.()})`).join(',')}`);
  }

  // atanh(0)=0 trivial — n=1 shoulder for ATANH.
  {
    const s = new Stack();
    s.push(RList([Real(0)]));
    lookup('ATANH').fn(s);
    const v = s.peek();
    assert(isList(v) && v.items.length === 1
        && isReal(v.items[0]) && v.items[0].value.eq(0),
      `session166: { Real(0) } ATANH → { Real(0) } (n=1 single-element boundary on bare _withListUnary on direct-registered ATANH; pins per-element atanh(0)=0 fold runs through the wrapper for n=1); got items=${v?.items?.map(x => `${x.type}(${x.value?.toString?.()})`).join(',')}`);
  }

  // ---- ACOSH Tagged-of-List n=1: :h:{ Real(1) } ACOSH
  //      → :h:{ Real(0) } ----
  {
    const s = new Stack();
    s.push(Tagged('h', RList([Real(1)])));
    lookup('ACOSH').fn(s);
    const v = s.peek();
    assert(isTagged(v) && v.tag === 'h'
        && isList(v.value) && v.value.items.length === 1
        && isReal(v.value.items[0]) && v.value.items[0].value.eq(0),
      `session166: :h:{ Real(1) } ACOSH → :h:{ Real(0) } (n=1 single-element under Tagged-of-List composition on direct-registered ACOSH; outer tag preserved + per-element acosh(1)=0 fold for the singleton); got tag=${v?.tag} items=${v?.value?.items?.map(x => `${x.type}(${x.value?.toString?.()})`).join(',')}`);
  }

  // ---- ATANH Tagged-of-List n=1: :h:{ Real(0) } ATANH
  //      → :h:{ Real(0) } ----
  {
    const s = new Stack();
    s.push(Tagged('h', RList([Real(0)])));
    lookup('ATANH').fn(s);
    const v = s.peek();
    assert(isTagged(v) && v.tag === 'h'
        && isList(v.value) && v.value.items.length === 1
        && isReal(v.value.items[0]) && v.value.items[0].value.eq(0),
      `session166: :h:{ Real(0) } ATANH → :h:{ Real(0) } (n=1 single-element under Tagged-of-List composition on direct-registered ATANH; outer tag preserved + per-element atanh(0)=0 fold for the singleton — closes ACOSH/ATANH dual on the T+L n=1 boundary); got tag=${v?.tag} items=${v?.value?.items?.map(x => `${x.type}(${x.value?.toString?.()})`).join(',')}`);
  }

  // session168 — LOG / EXP / ALOG heterogeneous-output mixed-input
  // pinning under bare-List + Tagged-of-List composition.
  // closed the n=0 empty-List + n=1 single-element
  // boundary on LOG / EXP / ALOG. (LNP1 / EXPM dual
  // pair) and (LNP1 / EXPM Tagged-of-List heterogeneous
  // edges) closed the heterogeneous-output mixed-input axis on
  // their respective dual pair.  The same heterogeneous-output
  // axis on the LOG / EXP / ALOG trio was deliberately deferred
  // by (its scope was n=0 / n=1 boundary closures
  // only).
  // This cluster lifts 's bare-List heterogeneous
  // mixed-input pattern + 's Tagged-of-List
  // heterogeneous mixed-input pattern onto the LOG / EXP / ALOG
  // trio.  Each pin uses a 2-element input where the elements
  // have distinct values (NOT a uniform-output short-circuit) so
  // the per-element wrapper-dispatch path is exercised end-to-end.
  // Mixed boundary inputs include the natural identity points
  // (LOG(1)=0, EXP(0)=1, ALOG(0)=1) paired with a non-identity
  // value to surface per-position output divergence.

  // ---- LOG bare-List heterogeneous mixed-input:
  //      { Real(10) Real(1) } LOG → { Real(1) Real(0) }.
  //      LOG(10) = 1, LOG(1) = 0 — distinct values per List
  //      position.  Pins per-element wrapper dispatch under bare
  // _withListUnary on the LOG axis; mirror of 's
  //      EXPM heterogeneous-output bare-List pin lifted onto LOG.
  {
    const s = new Stack();
    s.push(RList([Real(10), Real(1)]));
    lookup('LOG').fn(s);
    const v = s.peek();
    assert(isList(v) && v.items.length === 2
        && isReal(v.items[0]) && v.items[0].value.eq(1)
        && isReal(v.items[1]) && v.items[1].value.eq(0),
      `session168: { Real(10) Real(1) } LOG → { Real(1) Real(0) } (heterogeneous-output-value pin under bare _withListUnary on LOG axis — distinct values per List position pin per-element wrapper dispatch; mirror of s162 EXPM bare-List heterogeneous pin lifted onto LOG); got items=${v?.items?.map(x => `${x.type}(${x.value?.toString?.()})`).join(',')}`);
  }

  // ---- LOG Tagged-of-List heterogeneous mixed-input:
  //      :l:{ Real(10) Real(1) } LOG → :l:{ Real(1) Real(0) }.
  //      Outer tag preserved + per-element distinct-value output
  //      via per-element wrapper dispatch under Tagged composition.
  // Mirror of 's LNP1 T+L heterogeneous pin onto LOG.
  {
    const s = new Stack();
    s.push(Tagged('l', RList([Real(10), Real(1)])));
    lookup('LOG').fn(s);
    const v = s.peek();
    assert(isTagged(v) && v.tag === 'l'
        && isList(v.value) && v.value.items.length === 2
        && isReal(v.value.items[0]) && v.value.items[0].value.eq(1)
        && isReal(v.value.items[1]) && v.value.items[1].value.eq(0),
      `session168: :l:{ Real(10) Real(1) } LOG → :l:{ Real(1) Real(0) } (heterogeneous-output-value pin under Tagged-of-List composition on LOG — outer tag preserved + distinct values per List position via per-element wrapper dispatch; mirror of s164 LNP1 T+L heterogeneous pin lifted onto LOG); got tag=${v?.tag} items=${v?.value?.items?.map(x => `${x.type}(${x.value?.toString?.()})`).join(',')}`);
  }

  // ---- EXP bare-List heterogeneous mixed-input:
  //      { Real(0) Real(1) } EXP → { Real(1) Real(e) }.
  //      EXP(0) = 1, EXP(1) = e — distinct values per List
  //      position pin per-element wrapper dispatch on EXP.
  {
    const s = new Stack();
    s.push(RList([Real(0), Real(1)]));
    lookup('EXP').fn(s);
    const v = s.peek();
    const expectedE = Math.E;
    assert(isList(v) && v.items.length === 2
        && isReal(v.items[0]) && v.items[0].value.eq(1)
        && isReal(v.items[1]) && Math.abs(v.items[1].value.toNumber() - expectedE) < 1e-12,
      `session168: { Real(0) Real(1) } EXP → { Real(1) Real(e) } (heterogeneous-output-value pin under bare _withListUnary on EXP axis — distinct values per List position pin per-element wrapper dispatch; mirror of s162 EXPM heterogeneous pin lifted onto EXP); got items=${v?.items?.map(x => `${x.type}(${x.value?.toString?.()})`).join(',')}`);
  }

  // ---- EXP Tagged-of-List heterogeneous mixed-input:
  //      :e:{ Real(0) Real(1) } EXP → :e:{ Real(1) Real(e) }.
  //      Outer tag preserved + per-element distinct-value output.
  {
    const s = new Stack();
    s.push(Tagged('e', RList([Real(0), Real(1)])));
    lookup('EXP').fn(s);
    const v = s.peek();
    const expectedE = Math.E;
    assert(isTagged(v) && v.tag === 'e'
        && isList(v.value) && v.value.items.length === 2
        && isReal(v.value.items[0]) && v.value.items[0].value.eq(1)
        && isReal(v.value.items[1]) && Math.abs(v.value.items[1].value.toNumber() - expectedE) < 1e-12,
      `session168: :e:{ Real(0) Real(1) } EXP → :e:{ Real(1) Real(e) } (heterogeneous-output-value pin under Tagged-of-List composition on EXP — outer tag preserved + distinct values per List position; mirror of s164 EXPM T+L heterogeneous pin lifted onto EXP); got tag=${v?.tag} items=${v?.value?.items?.map(x => `${x.type}(${x.value?.toString?.()})`).join(',')}`);
  }

  // ---- ALOG bare-List heterogeneous mixed-input:
  //      { Real(0) Real(1) } ALOG → { Real(1) Real(10) }.
  //      ALOG(0) = 1, ALOG(1) = 10 — distinct values per List
  //      position pin per-element wrapper dispatch on ALOG.
  {
    const s = new Stack();
    s.push(RList([Real(0), Real(1)]));
    lookup('ALOG').fn(s);
    const v = s.peek();
    assert(isList(v) && v.items.length === 2
        && isReal(v.items[0]) && v.items[0].value.eq(1)
        && isReal(v.items[1]) && v.items[1].value.eq(10),
      `session168: { Real(0) Real(1) } ALOG → { Real(1) Real(10) } (heterogeneous-output-value pin under bare _withListUnary on ALOG axis — distinct values per List position pin per-element wrapper dispatch; closes the LOG/EXP/ALOG trio on the heterogeneous bare-List axis); got items=${v?.items?.map(x => `${x.type}(${x.value?.toString?.()})`).join(',')}`);
  }

  // ---- ALOG Tagged-of-List heterogeneous mixed-input:
  //      :a:{ Real(0) Real(1) } ALOG → :a:{ Real(1) Real(10) }.
  //      Outer tag preserved + per-element distinct-value output —
  //      closes the LOG/EXP/ALOG trio on the heterogeneous T+L axis.
  {
    const s = new Stack();
    s.push(Tagged('a', RList([Real(0), Real(1)])));
    lookup('ALOG').fn(s);
    const v = s.peek();
    assert(isTagged(v) && v.tag === 'a'
        && isList(v.value) && v.value.items.length === 2
        && isReal(v.value.items[0]) && v.value.items[0].value.eq(1)
        && isReal(v.value.items[1]) && v.value.items[1].value.eq(10),
      `session168: :a:{ Real(0) Real(1) } ALOG → :a:{ Real(1) Real(10) } (heterogeneous-output-value pin under Tagged-of-List composition on ALOG — outer tag preserved + distinct values per List position; closes the LOG/EXP/ALOG trio on the heterogeneous T+L axis — completes the s166 cluster's deferred heterogeneous-output axis); got tag=${v?.tag} items=${v?.value?.items?.map(x => `${x.type}(${x.value?.toString?.()})`).join(',')}`);
  }

  // session171 — Cluster 1: forward-hyperbolic family
  //   (SINH / COSH / TANH / ASINH) n=0 empty-List + n=1 single-element
  //   boundary closures on bare-List + Tagged-of-List composition.
  // pinned SINH/COSH/TANH/ASINH bare-List dispatch on n=2
  // (`{Real(0) Real(1)} OP → 2-element Real list`), and additionally
  // pinned the SINH-only Tagged-of-List composition on n=2.  Sessions
  // 130/140/150 lifted the wrapper-VM composition onto the same family
  // under Tagged-of-Vector / Tagged-of-Matrix.  But the n=0 empty-List
  // and n=1 single-element shoulders on the bare-List + T+L axes — the
  // boundary axis that closed on LN, closed on
  // LNP1/EXPM, closed on LOG/EXP/ALOG and ACOSH/ATANH —
  // were never pinned on the forward-hyperbolic four-op family.  This
  // cluster mirrors 's structure (LOG/EXP/ALOG
  // n=0/n=1 closures on bare-List + T+L) onto the SINH/COSH/TANH/ASINH
  // forward-hyperbolic family, which routes through the same 3-deep
  // wrapper `_withTaggedUnary(_withListUnary(_withVMUnary(handler)))`
  // composition as the LN/LOG/EXP/ALOG quartet (via `_unaryCx`).  The
  // n=1 input Real(0) is chosen because every forward-hyperbolic op
  // has a clean numeric fold at 0 — sinh(0)=0, cosh(0)=1, tanh(0)=0,
  // asinh(0)=0 — so the n=1 pin produces a value-precise output that
  // exercises both the wrapper dispatch and the inner numeric primitive
  // ran for the singleton without any ambiguity.
  // 16 hard assertions (4 ops × 4 boundary cases = bare-n=0 + T+L-n=0
  // + bare-n=1 + T+L-n=1).

  for (const op of ['SINH', 'COSH', 'TANH', 'ASINH']) {
    const expectN1 = op === 'COSH' ? 1 : 0;

    // n=0 bare-List: `{ } OP → { }` (empty shell preserved).
    {
      const s = new Stack();
      s.push(RList([]));
      lookup(op).fn(s);
      const v = s.peek();
      assert(isList(v) && v.items.length === 0,
        `session171: { } ${op} → { } (n=0 empty-List boundary on bare _withListUnary on forward-hyperbolic ${op} axis — wrapper preserves empty shell unchanged; closes the n=0 corner the s120 n=2 pin does not enumerate; mirror of s166 LOG/EXP/ALOG n=0 pin lifted onto the forward-hyperbolic family); got ${v?.type} items.length=${v?.items?.length}`);
    }

    // n=0 Tagged-of-List: `:l:{ } OP → :l:{ }` (outer tag preserved
    // across empty inner List dispatch through 3-deep wrapper).
    {
      const s = new Stack();
      s.push(Tagged('l', RList([])));
      lookup(op).fn(s);
      const v = s.peek();
      assert(isTagged(v) && v.tag === 'l'
          && isList(v.value) && v.value.items.length === 0,
        `session171: :l:{ } ${op} → :l:{ } (n=0 empty-List under Tagged-of-List composition on forward-hyperbolic ${op}: outer tag preserved across empty inner List dispatch through 3-deep wrapper; mirror of s166 LOG/EXP/ALOG T+L n=0 pin lifted onto the forward-hyperbolic family); got tag=${v?.tag} inner=${v?.value?.type} items.length=${v?.value?.items?.length}`);
    }

    // n=1 bare-List: `{ Real(0) } OP → { Real(<expected>) }`
    //   sinh(0)=0, cosh(0)=1, tanh(0)=0, asinh(0)=0
    // Pins per-element fold runs through the wrapper for n=1 — guards
    // against a refactor that special-cases n=1 to bare-scalar dispatch
    // and bypasses `_withListUnary`.
    {
      const s = new Stack();
      s.push(RList([Real(0)]));
      lookup(op).fn(s);
      const v = s.peek();
      assert(isList(v) && v.items.length === 1
          && isReal(v.items[0]) && v.items[0].value.eq(expectN1),
        `session171: { Real(0) } ${op} → { Real(${expectN1}) } (n=1 single-element boundary on bare _withListUnary on forward-hyperbolic ${op}; pins per-element ${op.toLowerCase()}(0)=${expectN1} fold runs through the wrapper for n=1 — guards against singleton bypass refactor); got items=${v?.items?.map(x => `${x.type}(${x.value?.toString?.()})`).join(',')}`);
    }

    // n=1 Tagged-of-List: `:h:{ Real(0) } OP → :h:{ Real(<expected>) }`
    {
      const s = new Stack();
      s.push(Tagged('h', RList([Real(0)])));
      lookup(op).fn(s);
      const v = s.peek();
      assert(isTagged(v) && v.tag === 'h'
          && isList(v.value) && v.value.items.length === 1
          && isReal(v.value.items[0]) && v.value.items[0].value.eq(expectN1),
        `session171: :h:{ Real(0) } ${op} → :h:{ Real(${expectN1}) } (n=1 single-element under Tagged-of-List composition on forward-hyperbolic ${op}; outer tag preserved + per-element ${op.toLowerCase()}(0)=${expectN1} fold for the singleton — closes the forward-hyperbolic SINH/COSH/TANH/ASINH four-op family on the T+L n=1 boundary); got tag=${v?.tag} items=${v?.value?.items?.map(x => `${x.type}(${x.value?.toString?.()})`).join(',')}`);
    }
  }

  // session171 — Cluster 2: forward-hyperbolic family (COSH / TANH /
  //   ASINH) heterogeneous-output mixed-input value pins on bare-List
  //   + Tagged-of-List composition.
  // pinned SINH bare-List heterogeneous-output values
  // (`SINH({0 1}) → {0 sinh(1)}` with both values asserted, including
  // the Tagged-of-List `:lbl:{0 1} SINH → :lbl:{0 sinh(1)}` shape).
  // For COSH/TANH/ASINH the s120 sweep only pinned type+length
  // (both items are Real, list-length is 2) but did NOT pin the
  // distinct output values per List position.  The sibling
  // `LOG/EXP/ALOG` quartet got the heterogeneous-output value-pin
  // treatment ; the dual `LNP1/EXPM` got it in session
  // 162/164.  This cluster lifts that same heterogeneous-output value-
  // pin pattern onto COSH/TANH/ASINH on both bare-List and T+L
  // composition — the s120 pin's type+length-only structure left these
  // three ops without a value-precise pin on the mixed-input axis.
  // Per-op identity-then-non-identity input pair (matches s120's `{0 1}`
  // shape so the sibling-pin lineage is direct):
  //   COSH({0,1}) → {1, cosh(1)} where cosh(1) ≈ 1.5430806348152437
  //   TANH({0,1}) → {0, tanh(1)} where tanh(1) ≈ 0.7615941559557649
  //   ASINH({0,1}) → {0, asinh(1)} where asinh(1) ≈ 0.881373587019543
  // 6 hard assertions (3 ops × 2 axes = bare-List + Tagged-of-List).

  for (const op of ['COSH', 'TANH', 'ASINH']) {
    const expect0 = op === 'COSH' ? 1 : 0;
    const expect1 = op === 'COSH' ? Math.cosh(1)
                  : op === 'TANH' ? Math.tanh(1)
                  : Math.asinh(1);
    const opLower = op.toLowerCase();

    // bare-List heterogeneous-output value pin.
    {
      const s = new Stack();
      s.push(RList([Real(0), Real(1)]));
      lookup(op).fn(s);
      const v = s.peek();
      assert(isList(v) && v.items.length === 2
          && isReal(v.items[0]) && v.items[0].value.eq(expect0)
          && isReal(v.items[1])
          && Math.abs(v.items[1].value.toNumber() - expect1) < 1e-10,
        `session171: { Real(0) Real(1) } ${op} → { Real(${expect0}) Real(${opLower}(1)) } (heterogeneous-output-value pin under bare _withListUnary on forward-hyperbolic ${op} axis — distinct values per List position pin per-element wrapper dispatch; mirror of s120 SINH bare-List heterogeneous value pin lifted onto ${op}; type+length-only s120 sweep on ${op} did not pin distinct output values); got items=${v?.items?.map(x => `${x.type}(${x.value?.toString?.()})`).join(',')}`);
    }

    // Tagged-of-List heterogeneous-output value pin.
    {
      const s = new Stack();
      s.push(Tagged('h', RList([Real(0), Real(1)])));
      lookup(op).fn(s);
      const v = s.peek();
      assert(isTagged(v) && v.tag === 'h'
          && isList(v.value) && v.value.items.length === 2
          && isReal(v.value.items[0]) && v.value.items[0].value.eq(expect0)
          && isReal(v.value.items[1])
          && Math.abs(v.value.items[1].value.toNumber() - expect1) < 1e-10,
        `session171: :h:{ Real(0) Real(1) } ${op} → :h:{ Real(${expect0}) Real(${opLower}(1)) } (heterogeneous-output-value pin under Tagged-of-List composition on forward-hyperbolic ${op} — outer tag preserved + distinct values per List position; mirror of s120 SINH Tagged-of-List heterogeneous value pin lifted onto ${op}; closes the forward-hyperbolic SINH/COSH/TANH/ASINH four-op family on the T+L heterogeneous-output value-pin axis); got tag=${v?.tag} items=${v?.value?.items?.map(x => `${x.type}(${x.value?.toString?.()})`).join(',')}`);
    }
  }

  // session173 — Cluster 1: forward-trig family
  //   (SIN / COS / TAN) n=0 empty-List + n=1 single-element
  //   boundary closures on bare-List + Tagged-of-List composition.
  // 's "Open queue items" block flagged this gap
  // explicitly: "Forward-trig family (SIN / COS / TAN) bare-List +
  // T+L axes — only the wrapper-V/M composition (s145) and
  // Tagged-of-Vector (s130) pins exist on this family; the bare-
  // List + T+L axes are unpinned even on n=2."  This release-mode
  // wrap-up cluster lifts 's n=0/n=1 boundary
  // pin shape (forward-hyperbolic SINH/COSH/TANH/ASINH) onto the
  // forward-trig SIN/COS/TAN trio that routes through the same
  // 3-deep wrapper `_withTaggedUnary(_withListUnary(_withVMUnary(
  // handler)))` composition via the trig dispatch path.  Closes the
  // bare-List + T+L boundary corner the s120/s130/s145 sweeps did
  // not enumerate.
  // n=1 input Real(0) is angle-mode-independent for all three ops
  // (sin(0)=0, cos(0)=1, tan(0)=0 in RAD/DEG/GRD), so no
  // setAngle/restore guard is needed — the outputs are clean
  // integer-clean Reals across every mode.  COSH-style outlier
  // pattern: COS is the only forward-trig op with a non-identity
  // fold at zero (matching 's COSH n=1 outlier).
  // 12 hard assertions (3 ops × 4 boundary cases = bare-n=0 +
  // T+L-n=0 + bare-n=1 + T+L-n=1).

  for (const op of ['SIN', 'COS', 'TAN']) {
    const expectN1 = op === 'COS' ? 1 : 0;

    // n=0 bare-List: `{ } OP → { }` (empty shell preserved through
    // bare _withListUnary on the forward-trig wrapper composition).
    {
      const s = new Stack();
      s.push(RList([]));
      lookup(op).fn(s);
      const v = s.peek();
      assert(isList(v) && v.items.length === 0,
        `session173: { } ${op} → { } (n=0 empty-List boundary on bare _withListUnary on forward-trig ${op} axis — wrapper preserves empty shell unchanged; closes the n=0 corner the s120/s130/s145 sweeps do not enumerate; mirror of s171 SINH/COSH/TANH/ASINH n=0 pin lifted onto the forward-trig family); got ${v?.type} items.length=${v?.items?.length}`);
    }

    // n=0 Tagged-of-List: `:l:{ } OP → :l:{ }` (outer tag preserved
    // across empty inner List dispatch through 3-deep wrapper).
    {
      const s = new Stack();
      s.push(Tagged('l', RList([])));
      lookup(op).fn(s);
      const v = s.peek();
      assert(isTagged(v) && v.tag === 'l'
          && isList(v.value) && v.value.items.length === 0,
        `session173: :l:{ } ${op} → :l:{ } (n=0 empty-List under Tagged-of-List composition on forward-trig ${op}: outer tag preserved across empty inner List dispatch through 3-deep wrapper; mirror of s171 forward-hyperbolic T+L n=0 pin lifted onto the forward-trig family); got tag=${v?.tag} inner=${v?.value?.type} items.length=${v?.value?.items?.length}`);
    }

    // n=1 bare-List: `{ Real(0) } OP → { Real(<expected>) }`
    //   sin(0)=0, cos(0)=1, tan(0)=0  (angle-mode independent).
    // Pins per-element fold runs through the wrapper for n=1 —
    // guards against a refactor that special-cases n=1 to bare-
    // scalar dispatch and bypasses `_withListUnary`.
    {
      const s = new Stack();
      s.push(RList([Real(0)]));
      lookup(op).fn(s);
      const v = s.peek();
      assert(isList(v) && v.items.length === 1
          && isReal(v.items[0]) && v.items[0].value.eq(expectN1),
        `session173: { Real(0) } ${op} → { Real(${expectN1}) } (n=1 single-element boundary on bare _withListUnary on forward-trig ${op}; pins per-element ${op.toLowerCase()}(0)=${expectN1} fold runs through the wrapper for n=1 — guards against singleton bypass refactor; angle-mode-independent value); got items=${v?.items?.map(x => `${x.type}(${x.value?.toString?.()})`).join(',')}`);
    }

    // n=1 Tagged-of-List: `:t:{ Real(0) } OP → :t:{ Real(<expected>) }`
    {
      const s = new Stack();
      s.push(Tagged('t', RList([Real(0)])));
      lookup(op).fn(s);
      const v = s.peek();
      assert(isTagged(v) && v.tag === 't'
          && isList(v.value) && v.value.items.length === 1
          && isReal(v.value.items[0]) && v.value.items[0].value.eq(expectN1),
        `session173: :t:{ Real(0) } ${op} → :t:{ Real(${expectN1}) } (n=1 single-element under Tagged-of-List composition on forward-trig ${op}; outer tag preserved + per-element ${op.toLowerCase()}(0)=${expectN1} fold for the singleton — closes the forward-trig SIN/COS/TAN trio on the T+L n=1 boundary); got tag=${v?.tag} items=${v?.value?.items?.map(x => `${x.type}(${x.value?.toString?.()})`).join(',')}`);
    }
  }

  // session173 — Cluster 2: inverse-trig family
  //   (ASIN / ACOS / ATAN) n=0 empty-List + n=1 single-element
  //   boundary closures on bare-List + Tagged-of-List composition.
  // Companion to Cluster 1 — 's "Open queue items" block
  // flagged this gap as well: "Inverse-trig family (ASIN / ACOS /
  // ATAN) bare-List + T+L axes — same gap as SIN/COS/TAN."  Lifts
  // the same n=0/n=1 boundary pin shape onto the inverse-trig trio.
  // The inverse-trig family routes through `_unaryCx` plus the
  // `_exactUnaryLift` path, then the same 3-deep wrapper composition
  // as the forward-trig family for List/Tagged dispatch.  s142
  // pinned the bare-scalar Integer-stay-exact path
  // (ASIN/ACOS/ATAN(Integer(0)) RAD = Integer(0); ASIN/ACOS/ATAN(1)
  // DEG = 90/0/45) but the bare-List + T+L axes were unpinned.
  // n=1 input Real(0): asin(0)=0, acos(0)=π/2, atan(0)=0.
  // ACOS(0) = π/2 is angle-mode-DEPENDENT (RAD: ≈ 1.5707963…;
  // DEG: 90; GRD: 100), so this cluster sets RAD explicitly inside
  // a try/finally guard that restores the prior angle mode at
  // close — mirror of the s140/s142 ASIN/ACOS Tagged-of-V pin
  // pattern (see test-types.mjs:5350-5400 for the canonical guard).
  // The Decimal precision of π/2 is matched against `Math.PI / 2`
  // with a 1e-12 tolerance for the ACOS n=1 case; ASIN/ATAN are
  // exact-zero so `.eq(0)` suffices.
  // 12 hard assertions (3 ops × 4 boundary cases = bare-n=0 +
  // T+L-n=0 + bare-n=1 + T+L-n=1).
  {
    const _prevAngle = calcState.angle;
    setAngle('RAD');
    try {
      for (const op of ['ASIN', 'ACOS', 'ATAN']) {
        // n=0 bare-List: empty shell preserved.
        {
          const s = new Stack();
          s.push(RList([]));
          lookup(op).fn(s);
          const v = s.peek();
          assert(isList(v) && v.items.length === 0,
            `session173: { } ${op} → { } (n=0 empty-List boundary on bare _withListUnary on inverse-trig ${op} axis — wrapper preserves empty shell unchanged; closes the n=0 corner the s142 bare-scalar pin does not enumerate; mirror of s171 forward-hyperbolic n=0 pin lifted onto the inverse-trig family); got ${v?.type} items.length=${v?.items?.length}`);
        }

        // n=0 Tagged-of-List: outer tag preserved across empty inner.
        {
          const s = new Stack();
          s.push(Tagged('l', RList([])));
          lookup(op).fn(s);
          const v = s.peek();
          assert(isTagged(v) && v.tag === 'l'
              && isList(v.value) && v.value.items.length === 0,
            `session173: :l:{ } ${op} → :l:{ } (n=0 empty-List under Tagged-of-List composition on inverse-trig ${op}: outer tag preserved across empty inner List dispatch through 3-deep wrapper; mirror of s171 forward-hyperbolic T+L n=0 pin lifted onto the inverse-trig family); got tag=${v?.tag} inner=${v?.value?.type} items.length=${v?.value?.items?.length}`);
        }

        // n=1 bare-List: `{ Real(0) } OP → { Real(<expected>) }`
        //   asin(0)=0, acos(0)=π/2 in RAD, atan(0)=0.
        // ACOS is the only inverse-trig op with a non-identity
        // fold at zero (matching 's COSH outlier and
        // 's COS outlier).
        {
          const s = new Stack();
          s.push(RList([Real(0)]));
          lookup(op).fn(s);
          const v = s.peek();
          assert(isList(v) && v.items.length === 1 && isReal(v.items[0]),
            `session173: { Real(0) } ${op} → { Real(...) } shape (n=1 single-element boundary on bare _withListUnary on inverse-trig ${op}; pins per-element fold runs through the wrapper for n=1 — guards against singleton bypass refactor); got items=${v?.items?.map(x => `${x.type}(${x.value?.toString?.()})`).join(',')}`);
          if (op === 'ACOS') {
            // value-precise: π/2 RAD (set above).
            assert(Math.abs(v.items[0].value.toNumber() - Math.PI / 2) < 1e-10,
              `session173: { Real(0) } ACOS → { Real(π/2) } in RAD (n=1 single-element value-precise pin; acos(0)=π/2 — non-identity fold outlier in the inverse-trig family, mirror of session 171 COSH outlier and session 173 Cluster 1 COS outlier); got ${v.items[0].value?.toString?.()}`);
          } else {
            // value-precise: 0 (asin(0)=0, atan(0)=0; angle-mode-independent).
            assert(v.items[0].value.eq(0),
              `session173: { Real(0) } ${op} → { Real(0) } (n=1 single-element value-precise pin; ${op.toLowerCase()}(0)=0 angle-mode-independent fold); got ${v.items[0].value?.toString?.()}`);
          }
        }

        // n=1 Tagged-of-List: outer tag preserved + per-element fold.
        {
          const s = new Stack();
          s.push(Tagged('t', RList([Real(0)])));
          lookup(op).fn(s);
          const v = s.peek();
          assert(isTagged(v) && v.tag === 't'
              && isList(v.value) && v.value.items.length === 1
              && isReal(v.value.items[0]),
            `session173: :t:{ Real(0) } ${op} → :t:{ Real(...) } shape (n=1 single-element under Tagged-of-List composition on inverse-trig ${op}; outer tag preserved + inner per-element fold for the singleton — closes the inverse-trig ASIN/ACOS/ATAN trio on the T+L n=1 boundary); got tag=${v?.tag} items=${v?.value?.items?.map(x => `${x.type}(${x.value?.toString?.()})`).join(',')}`);
          if (op === 'ACOS') {
            assert(Math.abs(v.value.items[0].value.toNumber() - Math.PI / 2) < 1e-10,
              `session173: :t:{ Real(0) } ACOS → :t:{ Real(π/2) } in RAD (n=1 T+L value-precise pin; acos(0)=π/2 fold via per-element wrapper dispatch under Tagged peel); got ${v.value.items[0].value?.toString?.()}`);
          } else {
            assert(v.value.items[0].value.eq(0),
              `session173: :t:{ Real(0) } ${op} → :t:{ Real(0) } (n=1 T+L value-precise pin; ${op.toLowerCase()}(0)=0 angle-mode-independent fold via per-element wrapper dispatch under Tagged peel); got ${v.value.items[0].value?.toString?.()}`);
          }
        }
      }
    } finally {
      setAngle(_prevAngle);
    }
  }
}

// Originally authored (ship-day T-0 wrap-up); the write did not persist
// to the shared filesystem (T-003 in REVIEW.md). Re-landed verbatim
// using session175r: labels so the lineage is traceable without colliding with the
// lost session175: label namespace.
// pinned COSH/TANH/ASINH heterogeneous-output mixed-input values
// (bare-List + T+L). lifts that same pattern onto the forward-trig trio
// (SIN/COS/TAN) and the inverse-trig trio (ASIN/ACOS/ATAN).  All six ops were already
// covered on n=0/n=1 boundary by sessions 171/173; this adds the {0,1} heterogeneous-
// output value-precise axis that the boundary pins leave unexercised.
// Input pair {Real(0) Real(1)} in RAD is the canonical identity-then-non-identity
// shape matching s171's {0,1} choice:
//   SIN:  {0, sin(1)}  — sin(0)=0 (identity), sin(1)≈0.8414709848078965
//   COS:  {1, cos(1)}  — cos(0)=1 (OUTLIER, not 0), cos(1)≈0.5403023058681398
//   TAN:  {0, tan(1)}  — tan(0)=0 (identity), tan(1)≈1.5574077246549023
//   ASIN: {0, asin(1)} — asin(0)=0 (identity), asin(1)=π/2≈1.5707963267948966
//   ACOS: {π/2, 0}     — FLIPPED: acos(0)=π/2, acos(1)=0 (strongest pin — BOTH positions)
//   ATAN: {0, atan(1)} — atan(0)=0 (identity), atan(1)=π/4≈0.7853981633974483
// All six ops are angle-mode-dependent for non-zero inputs, so the entire block is
// wrapped in a try/finally that restores the prior angle mode (mirror of s173 Cluster 2).
// Tolerance 1e-12 for Decimal .toNumber() vs. Math.* double comparisons on π/2 and π/4.
// 12 hard assertions (6 ops × 2 axes = bare-List + Tagged-of-List).
{
  const _prevAngle = calcState.angle;
  setAngle('RAD');
  try {

    // -- Cluster 1: forward-trig SIN / COS / TAN --
    for (const op of ['SIN', 'COS', 'TAN']) {
      const expect0 = op === 'COS' ? 1 : 0;
      const expect1 = op === 'SIN' ? Math.sin(1)
                    : op === 'COS' ? Math.cos(1)
                    : Math.tan(1);
      const opLower = op.toLowerCase();

      // bare-List heterogeneous-output value pin.
      {
        const s = new Stack();
        s.push(RList([Real(0), Real(1)]));
        lookup(op).fn(s);
        const v = s.peek();
        assert(isList(v) && v.items.length === 2
            && isReal(v.items[0]) && v.items[0].value.eq(expect0)
            && isReal(v.items[1])
            && Math.abs(v.items[1].value.toNumber() - expect1) < 1e-10,
          `session175r: { Real(0) Real(1) } ${op} RAD → { Real(${expect0}) Real(${opLower}(1)) } (heterogeneous-output-value pin under bare _withListUnary on forward-trig ${op} — distinct values per List position; COS is the outlier with expect0=1 not 0; mirror of s171 COSH/TANH/ASINH pattern lifted onto the forward-trig trio; re-land of session175 pin that did not persist — T-003); got items=${v?.items?.map(x => `${x.type}(${x.value?.toString?.()})`).join(',')}`);
      }

      // Tagged-of-List heterogeneous-output value pin.
      {
        const s = new Stack();
        s.push(Tagged('h', RList([Real(0), Real(1)])));
        lookup(op).fn(s);
        const v = s.peek();
        assert(isTagged(v) && v.tag === 'h'
            && isList(v.value) && v.value.items.length === 2
            && isReal(v.value.items[0]) && v.value.items[0].value.eq(expect0)
            && isReal(v.value.items[1])
            && Math.abs(v.value.items[1].value.toNumber() - expect1) < 1e-10,
          `session175r: :h:{ Real(0) Real(1) } ${op} RAD → :h:{ Real(${expect0}) Real(${opLower}(1)) } (T+L heterogeneous-output-value pin — outer tag preserved + distinct values per List position via 3-deep wrapper; closes forward-trig ${op} on the T+L heterogeneous-output value-pin axis; re-land T-003); got tag=${v?.tag} items=${v?.value?.items?.map(x => `${x.type}(${x.value?.toString?.()})`).join(',')}`);
      }
    }

    // -- Cluster 2: inverse-trig ASIN / ACOS / ATAN --
    // ACOS is the strongest pin: item[0]=acos(0)=π/2, item[1]=acos(1)=0 — both
    // List positions carry non-trivial value-precise checks, and item order is FLIPPED
    // relative to the identity-then-non-identity pattern all other ops follow.
    for (const op of ['ASIN', 'ACOS', 'ATAN']) {
      const opLower = op.toLowerCase();
      // ACOS: expect0 = acos(0) = π/2, expect1 = acos(1) = 0 (FLIPPED).
      // ASIN/ATAN: expect0 = 0 (identity), expect1 = asin(1)/atan(1) = π/2 / π/4.
      const expect0 = op === 'ACOS' ? Math.PI / 2 : 0;
      const expect1 = op === 'ASIN' ? Math.PI / 2
                    : op === 'ACOS' ? 0
                    : Math.PI / 4;  // atan(1)

      // bare-List heterogeneous-output value pin.
      {
        const s = new Stack();
        s.push(RList([Real(0), Real(1)]));
        lookup(op).fn(s);
        const v = s.peek();
        assert(isList(v) && v.items.length === 2
            && isReal(v.items[0])
            && Math.abs(v.items[0].value.toNumber() - expect0) < 1e-10
            && isReal(v.items[1])
            && Math.abs(v.items[1].value.toNumber() - expect1) < 1e-10,
          `session175r: { Real(0) Real(1) } ${op} RAD → { Real(${opLower}(0)) Real(${opLower}(1)) } (heterogeneous-output-value pin under bare _withListUnary on inverse-trig ${op} — ACOS is FLIPPED: item[0]=π/2, item[1]=0; re-land of session175 pin that did not persist — T-003); got items=${v?.items?.map(x => `${x.type}(${x.value?.toString?.()})`).join(',')}`);
      }

      // Tagged-of-List heterogeneous-output value pin.
      {
        const s = new Stack();
        s.push(Tagged('i', RList([Real(0), Real(1)])));
        lookup(op).fn(s);
        const v = s.peek();
        assert(isTagged(v) && v.tag === 'i'
            && isList(v.value) && v.value.items.length === 2
            && isReal(v.value.items[0])
            && Math.abs(v.value.items[0].value.toNumber() - expect0) < 1e-10
            && isReal(v.value.items[1])
            && Math.abs(v.value.items[1].value.toNumber() - expect1) < 1e-10,
          `session175r: :i:{ Real(0) Real(1) } ${op} RAD → :i:{ Real(${opLower}(0)) Real(${opLower}(1)) } (T+L heterogeneous-output-value pin — outer tag preserved; ACOS FLIPPED pattern preserved under Tagged dispatch; closes inverse-trig ${op} on the T+L heterogeneous-output value-pin axis; re-land T-003); got tag=${v?.tag} items=${v?.value?.items?.map(x => `${x.type}(${x.value?.toString?.()})`).join(',')}`);
      }
    }

  } finally {
    setAngle(_prevAngle);
  }
}

// ops.js `comparePair` has a String branch (HP50 User Guide App. J: char-code
// lexicographic order) that predates this session.  The matrix shows ✓ on S for
// all four ordered-compare ops, but no hard assertions existed.  This cluster
// pins the contract: both-String lex path + cross-type rejection guard.
{
  // Strict less-than ------------------------------------------------------------
  {
    const s = new Stack();
    s.push(Str('abc')); s.push(Str('abd'));
    lookup('<').fn(s);
    const v = s.peek();
    assert(isReal(v) && v.value.eq(1),
      `session179: "abc" < "abd" → Real(1) (String lex: 'c'<'d' at position 2); got type=${v?.type} val=${v?.value?.toString?.()}`);
  }
  {
    const s = new Stack();
    s.push(Str('abd')); s.push(Str('abc'));
    lookup('<').fn(s);
    const v = s.peek();
    assert(isReal(v) && v.value.eq(0),
      `session179: "abd" < "abc" → Real(0) (reverse order — not less); got type=${v?.type} val=${v?.value?.toString?.()}`);
  }
  {
    // equality boundary: strict < returns false
    const s = new Stack();
    s.push(Str('abc')); s.push(Str('abc'));
    lookup('<').fn(s);
    const v = s.peek();
    assert(isReal(v) && v.value.eq(0),
      `session179: "abc" < "abc" → Real(0) (equal strings: strict less is false); got type=${v?.type} val=${v?.value?.toString?.()}`);
  }
  {
    // empty string is lex-less than any non-empty
    const s = new Stack();
    s.push(Str('')); s.push(Str('a'));
    lookup('<').fn(s);
    const v = s.peek();
    assert(isReal(v) && v.value.eq(1),
      `session179: "" < "a" → Real(1) (empty string is lex-less than any non-empty); got type=${v?.type} val=${v?.value?.toString?.()}`);
  }

  // Strict greater-than ---------------------------------------------------------
  {
    const s = new Stack();
    s.push(Str('b')); s.push(Str('a'));
    lookup('>').fn(s);
    const v = s.peek();
    assert(isReal(v) && v.value.eq(1),
      `session179: "b" > "a" → Real(1) (String lex: 'b'>'a'); got type=${v?.type} val=${v?.value?.toString?.()}`);
  }
  {
    const s = new Stack();
    s.push(Str('a')); s.push(Str('b'));
    lookup('>').fn(s);
    const v = s.peek();
    assert(isReal(v) && v.value.eq(0),
      `session179: "a" > "b" → Real(0) (reverse order — not greater); got type=${v?.type} val=${v?.value?.toString?.()}`);
  }

  // Less-or-equal ---------------------------------------------------------------
  {
    // equality boundary: ≤ returns true for equal strings
    const s = new Stack();
    s.push(Str('abc')); s.push(Str('abc'));
    lookup('≤').fn(s);
    const v = s.peek();
    assert(isReal(v) && v.value.eq(1),
      `session179: "abc" ≤ "abc" → Real(1) (equality boundary: ≤ is true for equal strings); got type=${v?.type} val=${v?.value?.toString?.()}`);
  }
  {
    const s = new Stack();
    s.push(Str('abc')); s.push(Str('abd'));
    lookup('≤').fn(s);
    const v = s.peek();
    assert(isReal(v) && v.value.eq(1),
      `session179: "abc" ≤ "abd" → Real(1) (lex less satisfies ≤); got type=${v?.type} val=${v?.value?.toString?.()}`);
  }

  // Greater-or-equal ------------------------------------------------------------
  {
    // equality boundary: ≥ returns true for equal strings
    const s = new Stack();
    s.push(Str('abc')); s.push(Str('abc'));
    lookup('≥').fn(s);
    const v = s.peek();
    assert(isReal(v) && v.value.eq(1),
      `session179: "abc" ≥ "abc" → Real(1) (equality boundary: ≥ is true for equal strings); got type=${v?.type} val=${v?.value?.toString?.()}`);
  }
  {
    const s = new Stack();
    s.push(Str('abd')); s.push(Str('abc'));
    lookup('≥').fn(s);
    const v = s.peek();
    assert(isReal(v) && v.value.eq(1),
      `session179: "abd" ≥ "abc" → Real(1) (lex greater satisfies ≥); got type=${v?.type} val=${v?.value?.toString?.()}`);
  }

  // Cross-type rejection --------------------------------------------------------
  // HP50 AUR App. J: mixing String with non-String on ordered compare → Bad argument type.
  assertThrows(
    () => { const s = new Stack(); s.push(Str('a')); s.push(Integer(5n)); lookup('<').fn(s); },
    'Bad argument type',
    'session179: Str < Integer → Bad argument type (cross-type String/numeric mix rejected)'
  );
  assertThrows(
    () => { const s = new Stack(); s.push(Integer(5n)); s.push(Str('a')); lookup('<').fn(s); },
    'Bad argument type',
    'session179: Integer < Str → Bad argument type (cross-type numeric/String mix rejected)'
  );
}

// ---- session273: String lex-compare symmetric closure (> ≤ ≥ cross-type reject +
// non-empty proper-prefix boundary) -------------------------------------------------
// session179 pinned the both-String lex path for < > ≤ ≥ but only pinned the cross-type
// String/numeric rejection on `<`.  All four ordered ops route through the same
// `comparePair` cross-type guard (ops.js:5143), so a refactor that special-cased one of
// > / ≤ / ≥ and bypassed that guard would slip past session179.  This closes the
// rejection arm on the remaining three ops (symmetric to session179's `<` pair), plus a
// non-empty proper-prefix lex pin on each op — session179 only exercised the empty-prefix
// corner ("" < "a"); "ab" is a proper prefix of "abc" so the shorter string is lex-less.
{
  // Cross-type String/numeric rejection on > / ≤ / ≥ (mirror of session179's < pair).
  assertThrows(
    () => { const s = new Stack(); s.push(Str('a')); s.push(Integer(5n)); lookup('>').fn(s); },
    'Bad argument type',
    'session273: Str > Integer → Bad argument type (cross-type guard fires on > as on <)'
  );
  assertThrows(
    () => { const s = new Stack(); s.push(Integer(5n)); s.push(Str('a')); lookup('>').fn(s); },
    'Bad argument type',
    'session273: Integer > Str → Bad argument type (reverse-order cross-type mix rejected on >)'
  );
  assertThrows(
    () => { const s = new Stack(); s.push(Str('a')); s.push(Integer(5n)); lookup('≤').fn(s); },
    'Bad argument type',
    'session273: Str ≤ Integer → Bad argument type (cross-type guard fires on ≤)'
  );
  assertThrows(
    () => { const s = new Stack(); s.push(Str('a')); s.push(Integer(5n)); lookup('≥').fn(s); },
    'Bad argument type',
    'session273: Str ≥ Integer → Bad argument type (cross-type guard fires on ≥)'
  );

  // Non-empty proper-prefix boundary: "ab" is a proper prefix of "abc", so the shorter
  // string sorts lex-less (char-code lex with end-of-string lowest).  session179 only
  // pinned the empty-prefix corner; this exercises the prefix path on all four ops.
  {
    const s = new Stack();
    s.push(Str('ab')); s.push(Str('abc'));
    lookup('<').fn(s);
    const v = s.peek();
    assert(isReal(v) && v.value.eq(1),
      `session273: "ab" < "abc" → Real(1) (proper prefix is lex-less than its extension); got type=${v?.type} val=${v?.value?.toString?.()}`);
  }
  {
    const s = new Stack();
    s.push(Str('abc')); s.push(Str('ab'));
    lookup('>').fn(s);
    const v = s.peek();
    assert(isReal(v) && v.value.eq(1),
      `session273: "abc" > "ab" → Real(1) (extension is lex-greater than its proper prefix); got type=${v?.type} val=${v?.value?.toString?.()}`);
  }
  {
    const s = new Stack();
    s.push(Str('ab')); s.push(Str('abc'));
    lookup('≤').fn(s);
    const v = s.peek();
    assert(isReal(v) && v.value.eq(1),
      `session273: "ab" ≤ "abc" → Real(1) (proper prefix satisfies ≤); got type=${v?.type} val=${v?.value?.toString?.()}`);
  }
  {
    const s = new Stack();
    s.push(Str('abc')); s.push(Str('ab'));
    lookup('≥').fn(s);
    const v = s.peek();
    assert(isReal(v) && v.value.eq(1),
      `session273: "abc" ≥ "ab" → Real(1) (extension satisfies ≥ against its proper prefix); got type=${v?.type} val=${v?.value?.toString?.()}`);
  }
}

// session068 pinned String value-equality on `==` ("hello"=="hello"→1, "Hello"→0) and
// session179/273 pinned the lex path on `< > ≤ ≥`, but no pin contrasts the two families
// on the SAME input pair — i.e. that `==` / `≠` / `SAME` are VALUE-based (a lex-ordered
// but unequal pair is "not equal") while `< > ≤ ≥` are lex-based.  A refactor that routed
// the equality ops through the lex comparator (returning <0/=0/>0 truthiness) would pass
// every existing String pin yet break this contrast.  Two pairs lock it down:
//   - lex-distinct "abc" vs "abd": ==→0, ≠→1, SAME→0 even though ≤→1 (lex-ordered).
//   - equal "abc" vs "abc": ==→1, ≠→0, SAME→1, and the lex family agrees at the boundary
//     (≤→1, ≥→1, strict <→0, >→0).
{
  // lex-distinct pair: equality family reports "not equal" while ≤ reports lex-ordered.
  {
    const s = new Stack();
    s.push(Str('abc')); s.push(Str('abd'));
    lookup('==').fn(s);
    const v = s.peek();
    assert(isReal(v) && v.value.eq(0),
      `session277: "abc" == "abd" → Real(0) (value-equality, not lex: distinct strings are not equal even though ≤ is true); got type=${v?.type} val=${v?.value?.toString?.()}`);
  }
  {
    const s = new Stack();
    s.push(Str('abc')); s.push(Str('abd'));
    lookup('≠').fn(s);
    const v = s.peek();
    assert(isReal(v) && v.value.eq(1),
      `session277: "abc" ≠ "abd" → Real(1) (≠ is the value-equality negation); got type=${v?.type} val=${v?.value?.toString?.()}`);
  }
  {
    const s = new Stack();
    s.push(Str('abc')); s.push(Str('abd'));
    lookup('SAME').fn(s);
    const v = s.peek();
    assert(isReal(v) && v.value.eq(0),
      `session277: "abc" SAME "abd" → Real(0) (SAME is value-based like ==, not lex); got type=${v?.type} val=${v?.value?.toString?.()}`);
  }
  {
    const s = new Stack();
    s.push(Str('abc')); s.push(Str('abd'));
    lookup('≤').fn(s);
    const v = s.peek();
    assert(isReal(v) && v.value.eq(1),
      `session277: "abc" ≤ "abd" → Real(1) (lex family DOES order this pair — the contrast to ==/SAME above); got type=${v?.type} val=${v?.value?.toString?.()}`);
  }

  // equal pair: equality family reports equal; lex family agrees at the boundary.
  {
    const s = new Stack();
    s.push(Str('abc')); s.push(Str('abc'));
    lookup('==').fn(s);
    const v = s.peek();
    assert(isReal(v) && v.value.eq(1),
      `session277: "abc" == "abc" → Real(1) (value-equal); got type=${v?.type} val=${v?.value?.toString?.()}`);
  }
  {
    const s = new Stack();
    s.push(Str('abc')); s.push(Str('abc'));
    lookup('≠').fn(s);
    const v = s.peek();
    assert(isReal(v) && v.value.eq(0),
      `session277: "abc" ≠ "abc" → Real(0) (not unequal); got type=${v?.type} val=${v?.value?.toString?.()}`);
  }
  {
    const s = new Stack();
    s.push(Str('abc')); s.push(Str('abc'));
    lookup('SAME').fn(s);
    const v = s.peek();
    assert(isReal(v) && v.value.eq(1),
      `session277: "abc" SAME "abc" → Real(1) (value-equal, no type/lex divergence); got type=${v?.type} val=${v?.value?.toString?.()}`);
  }
  {
    const s = new Stack();
    s.push(Str('abc')); s.push(Str('abc'));
    lookup('<').fn(s);
    const v = s.peek();
    assert(isReal(v) && v.value.eq(0),
      `session277: "abc" < "abc" → Real(0) (strict lex is false at the equality boundary); got type=${v?.type} val=${v?.value?.toString?.()}`);
  }
  {
    const s = new Stack();
    s.push(Str('abc')); s.push(Str('abc'));
    lookup('≥').fn(s);
    const v = s.peek();
    assert(isReal(v) && v.value.eq(1),
      `session277: "abc" ≥ "abc" → Real(1) (non-strict lex is true at the equality boundary, agreeing with ==); got type=${v?.type} val=${v?.value?.toString?.()}`);
  }
}

// ---- session185 (re-land of session177 Cluster 1): EXACT-mode Integer-stay-exact
// composition pins for forward-trig + inverse-trig on bare-List + Tagged-of-List axes.
// authored these 14 pins on ship-day but the write did not persist to the
// shared filesystem (T-003 in REVIEW.md).  Re-landed here verbatim using session185:
// labels so the lineage is traceable without colliding with the lost session177: namespace.
// Implementation path: all six ops route Integer/Rational input through
// `_exactUnaryLift` (ops.js). The lift applies `fromRadians` to the primitive result
// and then checks `Math.abs(result - Math.round(result)) < 1e-12`; if integer-clean it
// returns Integer(round), otherwise Symbolic(AstFn(name, [_toAst(v)])).
// Pin logic:
//   SIN(0)=0,  COS(0)=1 (the outlier — non-zero clean fold),  TAN(0)=0,
//   ASIN(0)=0, ATAN(0)=0 — all angle-mode-independent integer-clean folds.
//   ACOS(0)=π/2: in RAD mode fromRadians(π/2)≈1.5707 is NOT integer-clean → Symbolic;
//                in DEG mode fromRadians(π/2)=90 IS integer-clean → Integer(90n).
// 10 assertions: five ops × (bare-List + Tagged-of-List).
// 4 assertions: ACOS × 2 axes × 2 angle modes (RAD + DEG).
// Total: 14 hard assertions.
{
  const _prevAngle = calcState.angle;
  const _prevApprox = calcState.approxMode;
  setAngle('RAD');
  setApproxMode(false);
  try {
    // All five ops produce integer-clean results on Integer(0) input regardless of angle mode.
    // COS(0)=1 is the non-zero outlier; the others produce 0.
    for (const op of ['SIN', 'COS', 'TAN', 'ASIN', 'ATAN']) {
      const expectVal = op === 'COS' ? 1n : 0n;

      // bare-List axis
      {
        const s = new Stack();
        s.push(RList([Integer(0n)]));
        lookup(op).fn(s);
        const v = s.peek();
        const item = v?.items?.[0];
        assert(isList(v) && v.items.length === 1 && isInteger(item) && item.value === expectVal,
          `session185: { Integer(0) } ${op} RAD → { Integer(${expectVal}) } (EXACT-mode _exactUnaryLift integer-stay-exact fold through bare _withListUnary on ${op}; re-land T-003); got item type=${item?.type} val=${item?.value?.toString?.()}`);
      }

      // Tagged-of-List axis
      {
        const s = new Stack();
        s.push(Tagged('z', RList([Integer(0n)])));
        lookup(op).fn(s);
        const v = s.peek();
        const item = v?.value?.items?.[0];
        assert(isTagged(v) && v.tag === 'z' && isList(v.value) && v.value.items.length === 1
            && isInteger(item) && item.value === expectVal,
          `session185: :z:{ Integer(0) } ${op} RAD → :z:{ Integer(${expectVal}) } (EXACT-mode integer-stay-exact through 3-deep wrapper under Tagged peel; re-land T-003); got tag=${v?.tag} item type=${item?.type} val=${item?.value?.toString?.()}`);
      }
    }

    // ACOS(Integer(0)) RAD: acos(0)=π/2; fromRadians(π/2)≈1.5707, |1.5707-2|≈0.43 >> 1e-12
    //   → Symbolic arm of _exactUnaryLift.
    // ACOS(Integer(0)) DEG: acos(0)=π/2; fromRadians(π/2)=90 → integer-clean → Integer(90n).

    // RAD — bare-List axis
    {
      const s = new Stack();
      s.push(RList([Integer(0n)]));
      lookup('ACOS').fn(s);
      const v = s.peek();
      const item = v?.items?.[0];
      assert(isList(v) && v.items.length === 1 && isSymbolic(item)
          && item.expr?.kind === 'bin' && item.expr.l?.name === 'π',
        `session185: { Integer(0) } ACOS RAD → { π/2 } (exact mode's closed form of acos(0); re-land T-003); got item type=${item?.type} expr=${JSON.stringify(item?.expr)}`);
    }

    // DEG — bare-List axis
    setAngle('DEG');
    {
      const s = new Stack();
      s.push(RList([Integer(0n)]));
      lookup('ACOS').fn(s);
      const v = s.peek();
      const item = v?.items?.[0];
      assert(isList(v) && v.items.length === 1 && isInteger(item) && item.value === 90n,
        `session185: { Integer(0) } ACOS DEG → { Integer(90) } (acos(0)=π/2; fromRadians(π/2)=90 integer-clean under DEG; re-land T-003); got item type=${item?.type} val=${item?.value?.toString?.()}`);
    }
    setAngle('RAD');

    // RAD — Tagged-of-List axis
    {
      const s = new Stack();
      s.push(Tagged('z', RList([Integer(0n)])));
      lookup('ACOS').fn(s);
      const v = s.peek();
      const item = v?.value?.items?.[0];
      assert(isTagged(v) && v.tag === 'z' && isList(v.value) && v.value.items.length === 1
          && isSymbolic(item) && item.expr?.kind === 'bin' && item.expr.l?.name === 'π',
        `session185: :z:{ Integer(0) } ACOS RAD → :z:{ π/2 } (closed form preserved through Tagged peel/rewrap; re-land T-003); got tag=${v?.tag} item type=${item?.type} expr=${JSON.stringify(item?.expr)}`);
    }

    // DEG — Tagged-of-List axis
    setAngle('DEG');
    {
      const s = new Stack();
      s.push(Tagged('z', RList([Integer(0n)])));
      lookup('ACOS').fn(s);
      const v = s.peek();
      const item = v?.value?.items?.[0];
      assert(isTagged(v) && v.tag === 'z' && isList(v.value) && v.value.items.length === 1
          && isInteger(item) && item.value === 90n,
        `session185: :z:{ Integer(0) } ACOS DEG → :z:{ Integer(90) } (DEG integer-clean arm preserved through Tagged peel/rewrap; closes ACOS angle-mode × List+Tagged axes; re-land T-003); got tag=${v?.tag} item type=${item?.type} val=${item?.value?.toString?.()}`);
    }

  } finally {
    setAngle(_prevAngle);
    setApproxMode(_prevApprox);
  }
}
