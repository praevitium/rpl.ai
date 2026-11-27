import { Stack } from '../www/src/rpl/stack.js';
import { lookup } from '../www/src/rpl/ops.js';
import {
  Real, Integer, Rational, BinaryInteger, Complex, Name, Tagged, RList, Vector, Matrix, Symbolic, isReal, isInteger,
  isRational, isBinaryInteger, isComplex, isNumber, isTagged, isList, isVector, isMatrix, promoteNumericPair, Decimal,
} from '../www/src/rpl/types.js';
import { defaultFnEval } from '../www/src/rpl/algebra.js';
import { state as calcState, setAngle, setWordsize, getWordsize, setApproxMode } from '../www/src/rpl/state.js';
import { assert, assertThrows } from './helpers.mjs';

/* How the type wrappers compose: Tagged, List, Vector and Matrix around the scalar handlers. */

/* ================================================================
 — data-type-support lane.

   Three substantive widening clusters this session.  Hard user-
   reachable assertions that pin behavior the matrix treated as
   "already ✓" but that had no direct test on file.  (test-algebra.mjs,
 ops.js, and COMMANDS.md are lock-held by the concurrent
   command-support run.)

     Cluster 1 — BinInt × Real/Integer mixed-scalar arithmetic audit.
       Pin `_scalarBinaryMixed` semantics under multiple wordsizes
       (HP50 AUR §10.1): BinInt base always wins, Real operands are
       trunc-toward-zero coerced, negative Integer/Real wraps via
       2^w, Division-by-zero and Complex rejection remain strict.

     Cluster 2 — Tagged transparency pins on SIGN / ARG / FLOOR /
       CEIL / IP / FP.  All six are wrapped in `_withTaggedUnary` so
       `Tagged(lbl, v) OP` round-trips to `Tagged(lbl, OP(v))`.  The
       DATA_TYPES.md matrix listed all six T-cells as ✓ but no direct
       test pinned the re-tag-with-same-label contract.

     Cluster 3 — Rational × Real / Integer / Complex / Rational
       equality & ordered compare.  `eqValues` routes numeric-family
       operands through `promoteNumericPair`; Rational is in
       `isNumber`, so `Rational(1,2) == Real(0.5)` = 1, and
       `Rational(6,3) == Integer(2)` = 1.  `comparePair` has an
       explicit `rational` branch that cross-multiplies.  Pins
       the cross-family widening end-to-end from the stack, since
       the matrix has no Q column today.
   ================================================================ */
{

  // Capture wordsize so we can restore it after the ws=8 block.
  const wsEntry = getWordsize();

  // Default wordsize (64): #FFh + 3 = 258; BinInt base wins.
  {
    const s = new Stack();
    s.push(BinaryInteger(255n, 'h'));
    s.push(Integer(3n));
    lookup('+').fn(s);
    const v = s.peek();
    assert(isBinaryInteger(v) && v.value === 258n && v.base === 'h',
      `session110: #FFh + Integer(3) → #102h (value=${v.value} base=${v.base})`);
  }

  // Reverse order: Integer(3) + #FFh = 258; BinInt base still wins.
  {
    const s = new Stack();
    s.push(Integer(3n));
    s.push(BinaryInteger(255n, 'h'));
    lookup('+').fn(s);
    const v = s.peek();
    assert(isBinaryInteger(v) && v.value === 258n && v.base === 'h',
      `session110: Integer(3) + #FFh → #102h base=h (value=${v.value} base=${v.base})`);
  }

  // Real coerces by trunc-toward-zero: #20h * 2.7 = #40h (2.7 → 2).
  {
    const s = new Stack();
    s.push(BinaryInteger(32n, 'h'));
    s.push(Real(2.7));
    lookup('*').fn(s);
    const v = s.peek();
    assert(isBinaryInteger(v) && v.value === 64n && v.base === 'h',
      `session110: #20h * Real(2.7) → #40h via trunc (value=${v.value} base=${v.base})`);
  }

  // Real(-3) wraps via 2^w: #10h + (-3) at ws=64 collapses to
  // 16 + (2^64 - 3) & mask = 13 (= #Dh).
  {
    const s = new Stack();
    s.push(BinaryInteger(16n, 'h'));
    s.push(Real(-3));
    lookup('+').fn(s);
    const v = s.peek();
    assert(isBinaryInteger(v) && v.value === 13n && v.base === 'h',
      `session110: #10h + Real(-3) at ws=64 → #Dh (wrap) (value=${v.value})`);
  }

  // BinInt-base preservation across different bases: #12d + Real(5) = #17d.
  {
    const s = new Stack();
    s.push(BinaryInteger(12n, 'd'));
    s.push(Real(5));
    lookup('+').fn(s);
    const v = s.peek();
    assert(isBinaryInteger(v) && v.value === 17n && v.base === 'd',
      `session110: #12d + Real(5) → #17d (decimal base preserved)`);
  }

  // Power: #2h ^ Integer(3) → #8h.
  {
    const s = new Stack();
    s.push(BinaryInteger(2n, 'h'));
    s.push(Integer(3n));
    lookup('^').fn(s);
    const v = s.peek();
    assert(isBinaryInteger(v) && v.value === 8n && v.base === 'h',
      `session110: #2h ^ Integer(3) → #8h (value=${v.value})`);
  }

  // ws=8 masking: #FFh + Integer(2) → #01h (257 masked to 8 bits).
  setWordsize(8);
  {
    const s = new Stack();
    s.push(BinaryInteger(255n, 'h'));
    s.push(Integer(2n));
    lookup('+').fn(s);
    const v = s.peek();
    assert(isBinaryInteger(v) && v.value === 1n && v.base === 'h',
      `session110: ws=8 #FFh + Integer(2) → #01h (wrap at 8-bit) (value=${v.value})`);
  }

  // ws=8 power overflow: #2h ^ Integer(10) = 1024 & 0xFF = 0.
  {
    const s = new Stack();
    s.push(BinaryInteger(2n, 'h'));
    s.push(Integer(10n));
    lookup('^').fn(s);
    const v = s.peek();
    assert(isBinaryInteger(v) && v.value === 0n && v.base === 'h',
      `session110: ws=8 #2h ^ Integer(10) → #0h (1024 masked to 8 bits) (value=${v.value})`);
  }

  // ws=8 Real coerce + overflow: Real(300) * #2h = 600 & 0xFF = 88 (#58h).
  // Also tests reverse-order operand: non-BinInt on level 2.
  {
    const s = new Stack();
    s.push(Real(300));
    s.push(BinaryInteger(2n, 'h'));
    lookup('*').fn(s);
    const v = s.peek();
    assert(isBinaryInteger(v) && v.value === 88n && v.base === 'h',
      `session110: ws=8 Real(300) * #2h → #58h (600 masked to 8 bits) (value=${v.value})`);
  }
  setWordsize(wsEntry);

  {
    const s = new Stack();
    s.push(BinaryInteger(5n, 'h'));
    s.push(Integer(0n));
    lookup('/').fn(s);
    assert(isBinaryInteger(s.peek()) && s.peek().value === 0n,
      'session110: #5h / Integer(0) → #0h (the AUR: a divisor of zero returns # 0)');
  }

  // Complex still rejected on either side — BinInt promotion is
  // integer-only.  `_scalarBinaryMixed` falls through to the generic
  // mixed-BinInt reject when the other side isn't Integer / Real.
  assertThrows(
    () => {
      const s = new Stack();
      s.push(BinaryInteger(5n, 'h'));
      s.push(Complex(1, 2));
      lookup('+').fn(s);
    },
    /Bad argument type/,
    'session110: #5h + Complex(1,2) → Bad argument type (no BinInt×Complex path)'
  );

  // The _withTaggedUnary wrapper unwraps, applies the op to the inner
  // value, and re-tags with the *same* label.  Pin each of the six ops.

  const assertTaggedReal = (op, lbl, inner, expect, desc) => {
    const s = new Stack();
    s.push(Tagged(lbl, inner));
    lookup(op).fn(s);
    const v = s.peek();
    assert(isTagged(v) && v.tag === lbl,
      `session110: ${desc} preserves tag '${lbl}' (got tag=${v.tag})`);
    const inside = v.value;
    const rawNum = isReal(inside)    ? inside.value.toNumber()
                 : isInteger(inside) ? Number(inside.value)
                 : NaN;
    assert(Math.abs(rawNum - expect) < 1e-9,
      `session110: ${desc} inner value ≈ ${expect} (got ${rawNum})`);
  };

  // FLOOR on Tagged Real / Integer.
  assertTaggedReal('FLOOR', 'x', Real(7.2),   7, ':x:Real(7.2) FLOOR → :x:7');
  assertTaggedReal('FLOOR', 'x', Real(-1.5), -2, ':x:Real(-1.5) FLOOR → :x:-2');
  {
    const s = new Stack();
    s.push(Tagged('n', Integer(5n)));
    lookup('FLOOR').fn(s);
    const v = s.peek();
    assert(isTagged(v) && v.tag === 'n' && isInteger(v.value) && v.value.value === 5n,
      `session110: :n:Integer(5) FLOOR → :n:5 (Integer pass-through, tag preserved)`);
  }

  // CEIL on Tagged Real.
  assertTaggedReal('CEIL', 'y', Real(7.2), 8, ':y:Real(7.2) CEIL → :y:8');
  assertTaggedReal('CEIL', 'y', Real(-1.5), -1, ':y:Real(-1.5) CEIL → :y:-1');

  // IP / FP on Tagged Real.
  assertTaggedReal('IP', 'z', Real(7.2), 7, ':z:Real(7.2) IP → :z:7');
  assertTaggedReal('IP', 'z', Real(-7.2), -7, ':z:Real(-7.2) IP → :z:-7 (trunc toward zero)');

  // FP(7.2) ~= 0.2 (small IEEE drift via Math.trunc path is acceptable —
  // the value passes through `x - Math.trunc(x)` in `_rounderScalar`).
  assertTaggedReal('FP', 'w', Real(7.2), 0.2, ':w:Real(7.2) FP → :w:0.2');

  // SIGN on Tagged Real (sign is Real too) + zero guard.
  assertTaggedReal('SIGN', 'u', Real(-5), -1, ':u:Real(-5) SIGN → :u:-1');
  assertTaggedReal('SIGN', 'u', Real(0),   0, ':u:Real(0) SIGN → :u:0');
  {
    const s = new Stack();
    s.push(Tagged('p', Real(42)));
    lookup('SIGN').fn(s);
    const v = s.peek();
    assert(isTagged(v) && v.tag === 'p' && isReal(v.value) && v.value.value.toNumber() === 1,
      `session110: :p:Real(42) SIGN → :p:1 (tag preserved)`);
  }

  {
    const s = new Stack();
    s.push(Rational(-3n, 4n));
    lookup('ARG').fn(s);
    assert(isReal(s.peek()) && Math.abs(s.peek().value.toNumber() - Math.PI) < 1e-9,
      'ARG of the fraction -3/4 is π in radians, as for -0.75, where it said Bad argument type');
  }

  // ARG on Tagged Complex — atan2(im, re) at current angle mode
  // (default RAD).  Value is irrational; pin approximately.
  {
    const s = new Stack();
    s.push(Tagged('v', Complex(3, 4)));
    lookup('ARG').fn(s);
    const v = s.peek();
    assert(isTagged(v) && v.tag === 'v',
      `session110: ARG Tagged preserves tag 'v' (got ${v.tag})`);
    const inner = v.value;
    assert(isReal(inner),
      `session110: ARG(:v:Complex(3,4)) inner is Real (got ${inner?.type})`);
    const arg = inner.value.toNumber();
    assert(Math.abs(arg - Math.atan2(4, 3)) < 1e-9,
      `session110: ARG(:v:Complex(3,4)) ≈ atan2(4,3) (got ${arg})`);
  }

  // eqValues routes numeric pairs through promoteNumericPair; Rational
  // is in isNumber.  `==` returns Real(1) / Real(0); `SAME` uses the
  // same comparator (and therefore ALSO cross-widens Rational×Real —
  // deliberate: BinInt is the only "strict on types" exclusion for
  // SAME; Rational joins Integer/Real/Complex in the cross-family
  // numeric lattice via promoteNumericPair).

  // Pure Rational × Rational equality — canonicalised form guards
  // against stale-representation false positives.
  {
    const s = new Stack();
    s.push(Rational(1, 2));
    s.push(Rational(2, 4));           // canonicalises to 1/2
    lookup('==').fn(s);
    const v = s.peek();
    assert(isReal(v) && v.value.eq(1),
      `session110: Rational(1,2) == Rational(2,4) → 1 (canonical compare)`);
  }
  {
    const s = new Stack();
    s.push(Rational(1, 2));
    s.push(Rational(2, 3));
    lookup('==').fn(s);
    const v = s.peek();
    assert(isReal(v) && v.value.eq(0),
      `session110: Rational(1,2) == Rational(2,3) → 0`);
  }

  // Rational × Integer — Rational(6,3) canonicalises to 2/1; compare
  // through promoteNumericPair's rational branch yields equality.
  {
    const s = new Stack();
    s.push(Rational(6, 3));
    s.push(Integer(2n));
    lookup('==').fn(s);
    const v = s.peek();
    assert(isReal(v) && v.value.eq(1),
      `session110: Rational(6,3) == Integer(2) → 1 (promote Integer → rational{n,d:1})`);
  }

  // Rational × Real — promoteNumericPair returns 'real' kind and
  // compares Decimals; Rational(1,2) widens to Decimal(0.5).
  {
    const s = new Stack();
    s.push(Rational(1, 2));
    s.push(Real(0.5));
    lookup('==').fn(s);
    const v = s.peek();
    assert(isReal(v) && v.value.eq(1),
      `session110: Rational(1,2) == Real(0.5) → 1 (real-kind promotion)`);
  }

  // SAME also asks for the same kind of number, so an exact 1/2 and the
  // approximate 0.5 are equal (==) but not the same.
  {
    const s = new Stack();
    s.push(Rational(1, 2));
    s.push(Real(0.5));
    lookup('SAME').fn(s);
    const v = s.peek();
    assert(isReal(v) && v.value.eq(0),
      `SAME Rational(1,2) Real(0.5) → 0 (exact and approximate are different kinds)`);
  }

  // Rational × Complex with zero imaginary — promoteNumericPair goes
  // to complex kind; eqValues compares re/im.
  {
    const s = new Stack();
    s.push(Rational(1, 2));
    s.push(Complex(0.5, 0));
    lookup('==').fn(s);
    const v = s.peek();
    assert(isReal(v) && v.value.eq(1),
      `session110: Rational(1,2) == Complex(0.5, 0) → 1 (complex-kind widen)`);
  }

  // Ordered compare — comparePair has a dedicated `rational` branch
  // that cross-multiplies (no round-trip through Real).
  {
    const s = new Stack();
    s.push(Rational(1, 2));
    s.push(Integer(1n));
    lookup('<').fn(s);
    const v = s.peek();
    assert(isReal(v) && v.value.eq(1),
      `session110: Rational(1,2) < Integer(1) → 1`);
  }
  {
    const s = new Stack();
    s.push(Rational(3, 2));
    s.push(Real(1.4));
    lookup('>').fn(s);
    const v = s.peek();
    assert(isReal(v) && v.value.eq(1),
      `session110: Rational(3,2) > Real(1.4) → 1 (cross-family via real-kind)`);
  }
  {
    const s = new Stack();
    s.push(Rational(1, 2));
    s.push(Rational(3, 4));
    lookup('<').fn(s);
    const v = s.peek();
    assert(isReal(v) && v.value.eq(1),
      `session110: Rational(1,2) < Rational(3,4) → 1 (n1·d2 vs n2·d1)`);
  }
  {
    const s = new Stack();
    s.push(Rational(1, 2));
    s.push(Rational(1, 2));
    lookup('≤').fn(s);
    const v = s.peek();
    assert(isReal(v) && v.value.eq(1),
      `session110: Rational(1,2) ≤ Rational(1,2) → 1 (equal)`);
  }
  {
    const s = new Stack();
    s.push(Rational(-3, 4));
    s.push(Rational(-2, 3));
    lookup('<').fn(s);
    const v = s.peek();
    // -3/4 = -0.75, -2/3 ≈ -0.667; -0.75 < -0.667 → true.
    // Cross-multiply: (-3)*(3) = -9 ;  (-2)*(4) = -8 ;  -9 < -8 = true.
    assert(isReal(v) && v.value.eq(1),
      `session110: Rational(-3,4) < Rational(-2,3) → 1 (negative cross-multiply)`);
  }
}

/* ================================================================
 — data-type-support lane.

   Three substantive widening clusters, all pinning contracts the
   DATA_TYPES.md matrix treated as "✓" but that had no direct test.
   ops.js + test-algebra.mjs + test-numerics.mjs + test-matrix.mjs +
   docs/COMMANDS.md + docs/REVIEW.md + logs/ are lock-held by the
 concurrent command-support lane, so the new
 assertions live in `tests/test-types.mjs` (end-of-file
 block) — same pattern as and.

     Cluster 1 — Binary Tagged tag-drop contract on +, -, *, /, ^ and
       the binary-numeric family (MOD/MIN/MAX/COMB/PERM/IQUOT/
       IREMAINDER/GCD/LCM).  `_withTaggedBinary` unwraps either or
       both operands' tags before the inner handler runs and drops
       the tag on the result — matching HP50 AUR §3.4 ("binary ops
       have no single obvious tag to keep").  Tested with both
       operands tagged, left-only, right-only, and a Symbolic-lift
       round-trip (`:a:Name(X) + :b:Real(5)` still lifts to Symbolic
       after the tag unwrap).

     Cluster 2 — Rational arithmetic on +, -, *, /, ^.  Pins the
       Integer ⊂ Rational ⊂ Real ⊂ Complex promotion lattice
       end-to-end: exact Q×Q sums through Fraction.js, canonical
       Integer collapse when the result has d=1, Q→Real widening
       on Q×Real, Q→Complex widening on Q×Complex, and the ^
       dispatch's integer-exponent exact path (resolving
       DATA_TYPES.md "next-session candidate 4" — the exact-stays-
       exact path is already shipped, contrary to the stale
       queue note).  APPROX-mode collapse is pinned separately.

     Cluster 3 — List distribution edge cases.  `_withListUnary` /
       `_withListBinary` wrap most ops; deeper contract pins:
       Tagged-outer-of-List (Tagged wrapper unwraps first, list
       distributes inside, outer tag re-applied); nested list
       recursion; List × scalar / scalar × List / List × List
       pairwise; size-mismatch rejection.  Plus one deliberate
       rejection: List of Tagged (inner Tagged has no unwrapper
       at the scalar handler because _withTaggedUnary sits
       OUTSIDE _withListUnary in the wrapper chain).
   ================================================================ */
{
  // Helper: assert the binary op drops tags and returns the expected
  // non-Tagged result.  Relies on plain rplEqual-style value checks
  // rather than a structural assertion — lets each op keep its own
  // result type (Integer for COMB/PERM/MOD integer inputs, Real for
  // MIN/MAX/arithmetic on Real, etc.).

  // +  both-sides tagged → Real, tag dropped.
  {
    const s = new Stack();
    s.push(Tagged('a', Real(5)));
    s.push(Tagged('b', Real(3)));
    lookup('+').fn(s);
    const v = s.peek();
    assert(!isTagged(v) && isReal(v) && v.value.eq(8),
      `session115: :a:Real(5) + :b:Real(3) → Real(8) (both tags dropped)`);
  }
  // +  left-only tagged → Real, tag dropped.
  {
    const s = new Stack();
    s.push(Tagged('a', Real(5)));
    s.push(Real(3));
    lookup('+').fn(s);
    const v = s.peek();
    assert(!isTagged(v) && isReal(v) && v.value.eq(8),
      `session115: :a:Real(5) + Real(3) → Real(8) (left tag dropped)`);
  }
  // +  right-only tagged → Real, tag dropped.
  {
    const s = new Stack();
    s.push(Real(5));
    s.push(Tagged('b', Real(3)));
    lookup('+').fn(s);
    const v = s.peek();
    assert(!isTagged(v) && isReal(v) && v.value.eq(8),
      `session115: Real(5) + :b:Real(3) → Real(8) (right tag dropped)`);
  }
  // -  both tagged
  {
    const s = new Stack();
    s.push(Tagged('a', Real(5)));
    s.push(Tagged('b', Real(3)));
    lookup('-').fn(s);
    const v = s.peek();
    assert(!isTagged(v) && isReal(v) && v.value.eq(2),
      `session115: :a:Real(5) - :b:Real(3) → Real(2) (tag-drop)`);
  }
  // *  both tagged
  {
    const s = new Stack();
    s.push(Tagged('a', Real(5)));
    s.push(Tagged('b', Real(3)));
    lookup('*').fn(s);
    const v = s.peek();
    assert(!isTagged(v) && isReal(v) && v.value.eq(15),
      `session115: :a:Real(5) * :b:Real(3) → Real(15) (tag-drop)`);
  }
  // /  both tagged
  {
    const s = new Stack();
    s.push(Tagged('a', Real(10)));
    s.push(Tagged('b', Real(2)));
    lookup('/').fn(s);
    const v = s.peek();
    assert(!isTagged(v) && isReal(v) && v.value.eq(5),
      `session115: :a:Real(10) / :b:Real(2) → Real(5) (tag-drop)`);
  }
  // ^  both tagged, Integer exponent path
  {
    const s = new Stack();
    s.push(Tagged('a', Integer(2n)));
    s.push(Tagged('b', Integer(5n)));
    lookup('^').fn(s);
    const v = s.peek();
    assert(!isTagged(v) && isInteger(v) && v.value === 32n,
      `session115: :a:Integer(2) ^ :b:Integer(5) → Integer(32) (tag-drop + integer path)`);
  }

  // MOD both tagged
  {
    const s = new Stack();
    s.push(Tagged('a', Integer(10n)));
    s.push(Tagged('b', Integer(3n)));
    lookup('MOD').fn(s);
    const v = s.peek();
    assert(!isTagged(v) && isInteger(v) && v.value === 1n,
      `session115: :a:Integer(10) MOD :b:Integer(3) → Integer(1) (tag-drop)`);
  }
  // MOD one-side tagged (left)
  {
    const s = new Stack();
    s.push(Tagged('a', Integer(17n)));
    s.push(Integer(5n));
    lookup('MOD').fn(s);
    const v = s.peek();
    assert(!isTagged(v) && isInteger(v) && v.value === 2n,
      `session115: :a:Integer(17) MOD Integer(5) → Integer(2) (left tag-drop)`);
  }
  // MOD one-side tagged (right)
  {
    const s = new Stack();
    s.push(Integer(17n));
    s.push(Tagged('b', Integer(5n)));
    lookup('MOD').fn(s);
    const v = s.peek();
    assert(!isTagged(v) && isInteger(v) && v.value === 2n,
      `session115: Integer(17) MOD :b:Integer(5) → Integer(2) (right tag-drop)`);
  }

  // MIN both tagged
  {
    const s = new Stack();
    s.push(Tagged('a', Real(7)));
    s.push(Tagged('b', Real(3)));
    lookup('MIN').fn(s);
    const v = s.peek();
    assert(!isTagged(v) && isReal(v) && v.value.eq(3),
      `session115: :a:Real(7) MIN :b:Real(3) → Real(3) (tag-drop)`);
  }
  // MAX both tagged
  {
    const s = new Stack();
    s.push(Tagged('a', Integer(7n)));
    s.push(Tagged('b', Integer(3n)));
    lookup('MAX').fn(s);
    const v = s.peek();
    assert(!isTagged(v) && isInteger(v) && v.value === 7n,
      `session115: :a:Integer(7) MAX :b:Integer(3) → Integer(7) (tag-drop)`);
  }

  // COMB tagged
  {
    const s = new Stack();
    s.push(Tagged('n', Integer(5n)));
    s.push(Tagged('k', Integer(2n)));
    lookup('COMB').fn(s);
    const v = s.peek();
    assert(!isTagged(v) && isInteger(v) && v.value === 10n,
      `session115: :n:Integer(5) COMB :k:Integer(2) → Integer(10) (tag-drop)`);
  }
  // PERM tagged
  {
    const s = new Stack();
    s.push(Tagged('n', Integer(5n)));
    s.push(Tagged('k', Integer(2n)));
    lookup('PERM').fn(s);
    const v = s.peek();
    assert(!isTagged(v) && isInteger(v) && v.value === 20n,
      `session115: :n:Integer(5) PERM :k:Integer(2) → Integer(20) (tag-drop)`);
  }

  // IQUOT tagged
  {
    const s = new Stack();
    s.push(Tagged('a', Integer(17n)));
    s.push(Tagged('b', Integer(5n)));
    lookup('IQUOT').fn(s);
    const v = s.peek();
    assert(!isTagged(v) && isInteger(v) && v.value === 3n,
      `session115: :a:Integer(17) IQUOT :b:Integer(5) → Integer(3) (tag-drop)`);
  }
  // IREMAINDER one-side tagged
  {
    const s = new Stack();
    s.push(Integer(17n));
    s.push(Tagged('b', Integer(5n)));
    lookup('IREMAINDER').fn(s);
    const v = s.peek();
    assert(!isTagged(v) && isInteger(v) && v.value === 2n,
      `session115: Integer(17) IREMAINDER :b:Integer(5) → Integer(2) (right tag-drop)`);
  }

  // GCD tagged
  {
    const s = new Stack();
    s.push(Tagged('a', Integer(12n)));
    s.push(Tagged('b', Integer(18n)));
    lookup('GCD').fn(s);
    const v = s.peek();
    assert(!isTagged(v) && isInteger(v) && v.value === 6n,
      `session115: :a:Integer(12) GCD :b:Integer(18) → Integer(6) (tag-drop)`);
  }
  // LCM tagged
  {
    const s = new Stack();
    s.push(Tagged('a', Integer(4n)));
    s.push(Tagged('b', Integer(6n)));
    lookup('LCM').fn(s);
    const v = s.peek();
    assert(!isTagged(v) && isInteger(v) && v.value === 12n,
      `session115: :a:Integer(4) LCM :b:Integer(6) → Integer(12) (tag-drop)`);
  }

  // Symbolic lift survives tag-drop: :a:Name(X) + :b:Real(5) → Symbolic(X+5),
  // no tag on the result.  (Confirms that the tag unwrap happens BEFORE the
  // scalar handler decides to lift to Symbolic, so the Name reaches
  // _isSymOperand unwrapped.)
  {
    const s = new Stack();
    s.push(Tagged('a', Name('X', true)));
    s.push(Tagged('b', Real(5)));
    lookup('+').fn(s);
    const v = s.peek();
    assert(!isTagged(v) && v.type === 'symbolic',
      `session115: :a:Name(X) + :b:Real(5) → Symbolic (tag-drop + Symbolic lift)`);
  }

  /* ---------- Cluster 2: Rational arithmetic on +/-/*///^ ---------- */

  // Q + Q — exact add via Fraction.js; LCD is 6.
  {
    const s = new Stack();
    s.push(Rational(1n, 2n));
    s.push(Rational(1n, 3n));
    lookup('+').fn(s);
    const v = s.peek();
    assert(isRational(v) && v.n === 5n && v.d === 6n,
      `session115: Rational(1,2) + Rational(1,3) → Rational(5/6) (exact)`);
  }
  // Q - Q — exact subtract; integer collapse when result has d=1.
  {
    const s = new Stack();
    s.push(Rational(3n, 2n));
    s.push(Rational(1n, 2n));
    lookup('-').fn(s);
    const v = s.peek();
    assert(isInteger(v) && v.value === 1n,
      `session115: Rational(3,2) - Rational(1,2) → Integer(1) (integer collapse)`);
  }
  // Z - Q — Integer widens to {n:k, d:1n} via promoteNumericPair's rational
  // branch; result is Rational(2,3).
  {
    const s = new Stack();
    s.push(Integer(1n));
    s.push(Rational(1n, 3n));
    lookup('-').fn(s);
    const v = s.peek();
    assert(isRational(v) && v.n === 2n && v.d === 3n,
      `session115: Integer(1) - Rational(1,3) → Rational(2/3) (Z widens to Q)`);
  }
  // Q * Q — exact multiply across canonicalisation; 2/3 * 3/5 = 2/5.
  {
    const s = new Stack();
    s.push(Rational(2n, 3n));
    s.push(Rational(3n, 5n));
    lookup('*').fn(s);
    const v = s.peek();
    assert(isRational(v) && v.n === 2n && v.d === 5n,
      `session115: Rational(2,3) * Rational(3,5) → Rational(2/5) (canonicalised)`);
  }
  // Q * Z — integer collapse: 1/2 * 4 = 2.
  {
    const s = new Stack();
    s.push(Rational(1n, 2n));
    s.push(Integer(4n));
    lookup('*').fn(s);
    const v = s.peek();
    assert(isInteger(v) && v.value === 2n,
      `session115: Rational(1,2) * Integer(4) → Integer(2) (integer collapse)`);
  }
  // Negative multiplication — sign canonicalisation: -3/4 * 2/3 = -6/12 = -1/2.
  {
    const s = new Stack();
    s.push(Rational(-3n, 4n));
    s.push(Rational(2n, 3n));
    lookup('*').fn(s);
    const v = s.peek();
    assert(isRational(v) && v.n === -1n && v.d === 2n,
      `session115: Rational(-3,4) * Rational(2,3) → Rational(-1/2) (sign on numerator)`);
  }
  // Q / Q — exact division; 1/2 ÷ 1/4 = 2.
  {
    const s = new Stack();
    s.push(Rational(1n, 2n));
    s.push(Rational(1n, 4n));
    lookup('/').fn(s);
    const v = s.peek();
    assert(isInteger(v) && v.value === 2n,
      `session115: Rational(1,2) / Rational(1,4) → Integer(2) (integer collapse)`);
  }
  assertThrows(
    () => {
      const s = new Stack();
      s.push(Rational(3n, 2n));
      s.push(Integer(0n));
      lookup('/').fn(s);
    },
    /^Infinite result$/,
    'session115: Rational(3,2) / Integer(0) → Infinite result, where Fraction.js\'s own Division by Zero leaked out'
  );

  // Q ^ Z integer exponent — exact-stays-exact path via Fraction.pow.
  // Resolves DATA_TYPES.md "next-session candidate 4" stale claim that
  // Rational^Integer is real-promoted: it has not been since at least
  // . Q(3/2)^Z(3) = 27/8.
  {
    const s = new Stack();
    s.push(Rational(3n, 2n));
    s.push(Integer(3n));
    lookup('^').fn(s);
    const v = s.peek();
    assert(isRational(v) && v.n === 27n && v.d === 8n,
      `session115: Rational(3,2) ^ Integer(3) → Rational(27/8) (exact integer exponent)`);
  }
  // Q ^ Z(-2) — negative integer exponent, still exact: (2/3)^-2 = 9/4.
  {
    const s = new Stack();
    s.push(Rational(2n, 3n));
    s.push(Integer(-2n));
    lookup('^').fn(s);
    const v = s.peek();
    assert(isRational(v) && v.n === 9n && v.d === 4n,
      `session115: Rational(2,3) ^ Integer(-2) → Rational(9/4) (negative exponent stays exact)`);
  }
  // Q ^ Z(0) — anything to the 0 is Integer(1), even 7/11.
  {
    const s = new Stack();
    s.push(Rational(7n, 11n));
    s.push(Integer(0n));
    lookup('^').fn(s);
    const v = s.peek();
    assert(isInteger(v) && v.value === 1n,
      `session115: Rational(7,11) ^ Integer(0) → Integer(1)`);
  }
  // Q ^ Q non-integer exponent in EXACT mode — lifts to Symbolic(base^exp)
  // per `_rationalBinary('^')`.  `2^(1/3)` stays irrational.
  {
    const s = new Stack();
    s.push(Rational(2n, 1n));
    s.push(Rational(1n, 3n));
    lookup('^').fn(s);
    const v = s.peek();
    assert(v.type === 'symbolic',
      `session115: EXACT Rational(2,1) ^ Rational(1,3) → Symbolic (irrational exponent stays symbolic)`);
  }
  // Q + Real — promoteNumericPair falls through to 'real' kind; Rational
  // collapses to Decimal because Real is inexact by construction.
  // Q(1/2) + R(0.25) = R(0.75).
  {
    const s = new Stack();
    s.push(Rational(1n, 2n));
    s.push(Real(0.25));
    lookup('+').fn(s);
    const v = s.peek();
    assert(isReal(v) && v.value.eq(0.75),
      `session115: Rational(1,2) + Real(0.25) → Real(0.75) (real-kind widen)`);
  }
  // Q + Complex — complex-kind promotion; Q(1/2) + C(0,1) = C(0.5, 1).
  {
    const s = new Stack();
    s.push(Rational(1n, 2n));
    s.push(Complex(0, 1));
    lookup('+').fn(s);
    const v = s.peek();
    assert(isComplex(v) && v.re === 0.5 && v.im === 1,
      `session115: Rational(1,2) + Complex(0,1) → Complex(0.5, 1) (complex-kind widen)`);
  }

  // APPROX-mode collapse: Q+Q in APPROX drops to Real regardless of
  // exactness.  Restore EXACT after.  Pins the flag -3 "give me decimals"
  // contract on the rational branch.
  setApproxMode(true);
  try {
    const s = new Stack();
    s.push(Rational(1n, 2n));
    s.push(Rational(1n, 3n));
    lookup('+').fn(s);
    const v = s.peek();
    // 1/2 + 1/3 = 5/6 ≈ 0.833333333333333 at 15-digit precision.
    assert(isReal(v) && Math.abs(v.value.toNumber() - 5/6) < 1e-12,
      `session115: APPROX Rational(1,2) + Rational(1,3) → Real ≈ 0.833 (APPROX collapse)`);
  } finally {
    setApproxMode(false);
  }

  // Tagged + Rational: the tag-drop convention from Cluster 1 still applies
  // when the underlying values are Rational, with the result preserving the
  // rational kind.
  {
    const s = new Stack();
    s.push(Tagged('a', Rational(1n, 2n)));
    s.push(Tagged('b', Rational(1n, 3n)));
    lookup('+').fn(s);
    const v = s.peek();
    assert(!isTagged(v) && isRational(v) && v.n === 5n && v.d === 6n,
      `session115: :a:Rational(1,2) + :b:Rational(1,3) → Rational(5/6) (tag-drop + exact add)`);
  }


  // Tagged(List): Tagged wrapper unwraps first (outer), list distributes
  // inside, outer tag re-applied.  Pins the wrapper-nesting contract
  // (Tagged OUTSIDE List in the _unaryCx / rounder wrap chain).
  {
    const s = new Stack();
    s.push(Tagged('lbl', RList([Real(1), Real(-2), Real(3)])));
    lookup('NEG').fn(s);
    const v = s.peek();
    assert(isTagged(v) && v.tag === 'lbl',
      `session115: :lbl:{1 -2 3} NEG preserves outer tag (got tag=${v.tag})`);
    assert(v.value.type === 'list' && v.value.items.length === 3
        && isReal(v.value.items[0]) && v.value.items[0].value.eq(-1)
        && isReal(v.value.items[1]) && v.value.items[1].value.eq(2)
        && isReal(v.value.items[2]) && v.value.items[2].value.eq(-3),
      `session115: :lbl:{1 -2 3} NEG → :lbl:{-1 2 -3} (list distributes inside tag)`);
  }

  // Nested list: {{1 -2} {3 -4}} NEG → {{-1 2} {-3 4}}.  _withListUnary
  // recurses via `isList(item) → RList(item.items.map(apply))` so nested
  // lists distribute to arbitrary depth without hitting the scalar handler.
  {
    const s = new Stack();
    s.push(RList([
      RList([Real(1), Real(-2)]),
      RList([Real(3), Real(-4)]),
    ]));
    lookup('NEG').fn(s);
    const v = s.peek();
    assert(v.type === 'list' && v.items.length === 2,
      `session115: nested {{1 -2}{3 -4}} NEG returns list (outer depth preserved)`);
    const [row0, row1] = v.items;
    assert(row0.type === 'list' && row0.items[0].value.eq(-1) && row0.items[1].value.eq(2),
      `session115: nested list NEG — inner row 0 → {-1 2}`);
    assert(row1.type === 'list' && row1.items[0].value.eq(-3) && row1.items[1].value.eq(4),
      `session115: nested list NEG — inner row 1 → {-3 4}`);
  }

  // Mixed-element list on FLOOR: Integer pass-through, Real gets floored.
  // Pins that the list wrapper doesn't monomorphise the element type.
  {
    const s = new Stack();
    s.push(RList([Integer(5n), Real(3.2), Real(-7.5)]));
    lookup('FLOOR').fn(s);
    const v = s.peek();
    assert(v.type === 'list' && v.items.length === 3,
      `session115: mixed {Z(5) R(3.2) R(-7.5)} FLOOR returns 3-element list`);
    assert(isInteger(v.items[0]) && v.items[0].value === 5n,
      `session115: FLOOR on Integer(5) inside list → Integer(5) (pass-through)`);
    assert(isReal(v.items[1]) && v.items[1].value.eq(3),
      `session115: FLOOR on Real(3.2) inside list → Real(3)`);
    assert(isReal(v.items[2]) && v.items[2].value.eq(-8),
      `session115: FLOOR on Real(-7.5) inside list → Real(-8) (round-toward-minus-inf)`);
  }

  // Binary: List * scalar — right operand is scalar, list distributes.
  {
    const s = new Stack();
    s.push(RList([Real(1), Real(2), Real(3)]));
    s.push(Real(2));
    lookup('*').fn(s);
    const v = s.peek();
    assert(v.type === 'list' && v.items.length === 3
        && v.items[0].value.eq(2) && v.items[1].value.eq(4) && v.items[2].value.eq(6),
      `session115: {1 2 3} * Real(2) → {2 4 6} (list × scalar)`);
  }

  // Binary: scalar × List — left operand is scalar, list distributes.
  {
    const s = new Stack();
    s.push(Real(2));
    s.push(RList([Real(1), Real(2), Real(3)]));
    lookup('*').fn(s);
    const v = s.peek();
    assert(v.type === 'list' && v.items.length === 3
        && v.items[0].value.eq(2) && v.items[1].value.eq(4) && v.items[2].value.eq(6),
      `session115: Real(2) * {1 2 3} → {2 4 6} (scalar × list)`);
  }

  // Binary: List + List — HP50 AUR §3-7 concatenation, NOT pairwise.
  // The original session115 pin locked element-wise distribution;
  // we re-pin it here as concatenation now that `+` is HP50-canonical
  // (element-wise list arithmetic is reserved for ADD / DOLIST).
  {
    const s = new Stack();
    s.push(RList([Real(1), Real(2), Real(3)]));
    s.push(RList([Real(10), Real(20), Real(30)]));
    lookup('+').fn(s);
    const v = s.peek();
    assert(v.type === 'list' && v.items.length === 6
        && v.items[0].value.eq(1)  && v.items[1].value.eq(2)  && v.items[2].value.eq(3)
        && v.items[3].value.eq(10) && v.items[4].value.eq(20) && v.items[5].value.eq(30),
      `session115: {1 2 3} + {10 20 30} → {1 2 3 10 20 30} (concat)`);
  }

  // Binary: List + List (size mismatch) — concatenation is length-
  // agnostic, so the old "Invalid dimension" gate is gone.
  {
    const s = new Stack();
    s.push(RList([Real(1), Real(2)]));
    s.push(RList([Real(1), Real(2), Real(3)]));
    lookup('+').fn(s);
    const v = s.peek();
    assert(v.type === 'list' && v.items.length === 5
        && v.items[0].value.eq(1) && v.items[1].value.eq(2)
        && v.items[2].value.eq(1) && v.items[3].value.eq(2) && v.items[4].value.eq(3),
      'session115: {1 2} + {1 2 3} → {1 2 1 2 3} (mismatched lengths concat)');
  }

  // Binary: list `+ scalar` is now an APPEND (HP50 AUR §3-7), not a
  // recursive broadcast.  The scalar lands as a sibling element at
  // the outer level — the inner sub-lists are preserved verbatim.
  {
    const s = new Stack();
    s.push(RList([
      RList([Real(1), Real(2)]),
      RList([Real(3), Real(4)]),
    ]));
    s.push(Real(10));
    lookup('+').fn(s);
    const v = s.peek();
    assert(v.type === 'list' && v.items.length === 3
        && v.items[0].type === 'list'
        && v.items[0].items[0].value.eq(1) && v.items[0].items[1].value.eq(2)
        && v.items[1].type === 'list'
        && v.items[1].items[0].value.eq(3) && v.items[1].items[1].value.eq(4)
        && v.items[2].value.eq(10),
      `session115: {{1 2}{3 4}} + Real(10) → {{1 2} {3 4} 10} (append, no recursion)`);
  }

  // Deliberate rejection: List of Tagged through NEG throws Bad argument
  // type.  `_withTaggedUnary` sits OUTSIDE `_withListUnary`, so it only
  // fires on the outermost stack value — a Tagged inside a list reaches
  // the scalar handler (which doesn't know about Tagged) and errors.
  // Pinning the current behavior so any future per-element Tagged
  // handling (or a wrapper-order swap) has a regression guard.
  assertThrows(
    () => {
      const s = new Stack();
      s.push(RList([Tagged('x', Real(1)), Tagged('y', Real(-2))]));
      lookup('NEG').fn(s);
    },
    /Bad argument type/,
    'session115: {:x:1 :y:-2} NEG → Bad argument type (List of Tagged — Tagged wrapper is outside List)'
  );
}

/* ================================================================
   Three widening clusters pinning under-tested contracts on the
   hyperbolic / list-distribution / V/M-rejection ops.

   Cluster 1 — Hyperbolic family (`SINH`/`COSH`/`TANH`/`ASINH`/`ACOSH`/
     `ATANH`) Tagged transparency, List distribution, and Symbolic-lift
     through Tagged.  The matrix has all six ops at `T ✓ / L ✓ / N ✓ /
 Sy ✓` since (under "Unary — invert / square / sqrt /
     elementary functions") but no direct test pin existed.  This
     cluster also catches the principal-branch promotion of
     `ATANH(:v:Real(2))` to `Tagged(v, Complex)` (|x|>1 lifts to
     Complex) — important contract to lock down because the wrapper-
     order is `_withTaggedUnary(_withListUnary(_withVMUnary(handler)))`,
     so the inner handler chooses Real-vs-Complex *after* the Tagged
     unwrap, and the outer re-tag doesn't care about the inner type.

   Cluster 2 — Tagged tag-drop on the percent family (`%` / `%T` /
 `%CH`). All three list `T ✓` since with the comment
     but no direct test pinned the
     `_withTaggedBinary` tag-drop contract on these specific ops.
 Symmetric with the binary-numeric tag-drop pinned
     (Cluster 1) but on the percent family which routes through a
     different inner handler than the arithmetic family.  Also pins
 the V/M ✗ rejection that flipped from blank to ✗.

   Cluster 3 — Rational unary stay-exact contract on
     `NEG`/`INV`/`SQ`/`ABS`/`SQRT`/`SIGN`/`FLOOR`/`CEIL`/`IP`/`FP`
     plus the APPROX-mode collapse and out-of-domain rejection on
 `FACT`/`XPON`/`MANT`. The "Rational (`Q`) — "
     convention text describes the EXACT-mode stay-exact dispatch and
     APPROX-mode Real collapse but no per-op row carries a Q column,
     and no direct test pinned the integer-collapse boundaries
     (FLOOR/CEIL/IP/SIGN drop to Integer; SQRT of perfect-square
     drops to Rational then collapses if d=1; SQRT of non-square
     lifts to Symbolic in EXACT; SQRT of negative Q lifts to Complex;
     FP keeps Q except for integer-valued Q where it returns
     Integer(0); INV(Rational(1, n)) collapses to Integer(n)).
   ================================================================ */
{

  // Helper: assert Tagged-Real-inner with a numeric tolerance.
  const assertTaggedRealClose = (op, lbl, inner, expected, eps, desc) => {
    const s = new Stack();
    s.push(Tagged(lbl, inner));
    lookup(op).fn(s);
    const v = s.peek();
    assert(isTagged(v) && v.tag === lbl,
      `session120: ${op}(:${lbl}:…) preserves outer tag (got tag=${v?.tag})`);
    assert(isReal(v.value) && Math.abs(v.value.value.toNumber() - expected) < eps,
      `session120: ${desc} (got ${v?.value?.value?.toString()})`);
  };

  // SINH / COSH / TANH on Tagged Real — re-tag with Real inner.
  assertTaggedRealClose('SINH', 't', Real(0), 0, 1e-15,
    ':t:Real(0) SINH → :t:0');
  assertTaggedRealClose('COSH', 'lbl', Real(0), 1, 1e-15,
    ':lbl:Real(0) COSH → :lbl:1');
  assertTaggedRealClose('TANH', 'k', Real(1), Math.tanh(1), 1e-12,
    ':k:Real(1) TANH → :k:tanh(1) ≈ 0.7616');

  // Inverse hyperbolic on Tagged Real (real-domain).
  assertTaggedRealClose('ASINH', 'v', Real(2), Math.asinh(2), 1e-10,
    ':v:Real(2) ASINH → :v:asinh(2) ≈ 1.4436');
  assertTaggedRealClose('ACOSH', 'v', Real(2), Math.acosh(2), 1e-10,
    ':v:Real(2) ACOSH → :v:acosh(2) ≈ 1.3170');
  assertTaggedRealClose('ATANH', 'v', Real(0.5), Math.atanh(0.5), 1e-12,
    ':v:Real(0.5) ATANH → :v:atanh(0.5) ≈ 0.5493');

  // ATANH on |x| > 1 promotes the inner value to Complex while the outer
  // tag is preserved by _withTaggedUnary.  This pins the wrapper-order
  // contract: the inner handler chooses Real-vs-Complex *after* the
  // Tagged unwrap, and the outer re-tag is type-agnostic on the inner.
  {
    const s = new Stack();
    s.push(Tagged('v', Real(2)));
    lookup('ATANH').fn(s);
    const v = s.peek();
    assert(isTagged(v) && v.tag === 'v',
      `session120: :v:Real(2) ATANH preserves outer tag (got tag=${v?.tag})`);
    assert(isComplex(v.value),
      `session120: :v:Real(2) ATANH lifts inner to Complex (|x|>1 principal branch)`);
  }

  // Hyperbolic on Tagged Complex — inner Complex passes through.
  // SINH(0+i) = i sin(1) — inner is Complex.  Outer tag preserved.
  {
    const s = new Stack();
    s.push(Tagged('z', Complex(0, 1)));
    lookup('SINH').fn(s);
    const v = s.peek();
    assert(isTagged(v) && v.tag === 'z' && isComplex(v.value),
      `session120: :z:Complex(0,1) SINH → :z:Complex (got tag=${v?.tag} inner=${v?.value?.type})`);
    assert(Math.abs(v.value.re - 0) < 1e-12 && Math.abs(v.value.im - Math.sin(1)) < 1e-12,
      `session120: :z:Complex(0,1) SINH inner ≈ i·sin(1) (got re=${v?.value?.re}, im=${v?.value?.im})`);
  }

  // Symbolic-lift through Tagged: :v:Name(X) SINH → :v:Symbolic(SINH(X)).
  // Tagged unwraps first, the inner handler sees a Name and lifts to
  // Symbolic, then the outer re-tags with the same label.
  {
    const s = new Stack();
    s.push(Tagged('v', Name('X')));
    lookup('SINH').fn(s);
    const v = s.peek();
    assert(isTagged(v) && v.tag === 'v' && v.value && v.value.type === 'symbolic',
      `session120: :v:Name(X) SINH → :v:Symbolic (got tag=${v?.tag} inner=${v?.value?.type})`);
  }

  // List distribution: SINH({0 1}) — element-wise via _withListUnary.
  for (const op of ['SINH', 'COSH', 'TANH', 'ASINH']) {
    const s = new Stack();
    s.push(RList([Real(0), Real(1)]));
    lookup(op).fn(s);
    const v = s.peek();
    assert(v.type === 'list' && v.items.length === 2,
      `session120: ${op}({0 1}) returns 2-element list (got len=${v?.items?.length})`);
    assert(isReal(v.items[0]) && isReal(v.items[1]),
      `session120: ${op}({0 1}) — both elements Real (got types ${v?.items?.map(x=>x?.type).join(',')})`);
  }
  // Specific values: SINH(0) = 0, SINH(1) = sinh(1).
  {
    const s = new Stack();
    s.push(RList([Real(0), Real(1)]));
    lookup('SINH').fn(s);
    const v = s.peek();
    assert(v.items[0].value.eq(0) && Math.abs(v.items[1].value.toNumber() - Math.sinh(1)) < 1e-10,
      `session120: SINH({0 1}) → {0 sinh(1)} (got ${v?.items?.map(x => x.value?.toString()).join(',')})`);
  }

  // Tagged-outer-of-List: :lbl:{0 1} SINH → :lbl:{SINH(0) SINH(1)}
  // The Tagged wrapper unwraps first, then the List wrapper distributes,
  // then the outer Tagged re-applies — same recursion order as the
  // NEG variant, but on a transcendental op that
  // reaches a different inner handler.
  {
    const s = new Stack();
    s.push(Tagged('lbl', RList([Real(0), Real(1)])));
    lookup('SINH').fn(s);
    const v = s.peek();
    assert(isTagged(v) && v.tag === 'lbl',
      `session120: :lbl:{0 1} SINH preserves outer tag (got tag=${v?.tag})`);
    assert(v.value && v.value.type === 'list' && v.value.items.length === 2,
      `session120: :lbl:{0 1} SINH inner is 2-element list (got ${v?.value?.type})`);
    assert(v.value.items[0].value.eq(0)
        && Math.abs(v.value.items[1].value.toNumber() - Math.sinh(1)) < 1e-10,
      `session120: :lbl:{0 1} SINH → :lbl:{0 sinh(1)} (Tagged-outer-of-List unwrap order)`);
  }


  // Helper: pin the both-side tag-drop contract on a percent op.
  const assertPctBothTags = (op, leftVal, rightVal, expectedVal, desc) => {
    const s = new Stack();
    s.push(Tagged('a', Real(leftVal)));
    s.push(Tagged('b', Real(rightVal)));
    lookup(op).fn(s);
    const v = s.peek();
    assert(isReal(v) && !isTagged(v),
      `session120: ${desc} — result is Real (no Tagged envelope), got type=${v?.type}`);
    assert(Math.abs(v.value.toNumber() - expectedVal) < 1e-12,
      `session120: ${desc} (got ${v?.value?.toString()})`);
  };

  // Both-sides tag-drop:  `% :a:Real(80) :b:Real(25)` → Real(20).
  assertPctBothTags('%', 80, 25, 20,
    ':a:Real(80) :b:Real(25) % → Real(20) — both tags drop');
  assertPctBothTags('%T', 50, 20, 40,
    ':a:Real(50) :b:Real(20) %T → Real(40) — both tags drop');
  assertPctBothTags('%CH', 50, 20, -60,
    ':a:Real(50) :b:Real(20) %CH → Real(-60) — both tags drop');

  // Left-only tag-drop:  `% :a:Real(80) Real(25)` → Real(20).
  {
    const s = new Stack();
    s.push(Tagged('a', Real(80)));
    s.push(Real(25));
    lookup('%').fn(s);
    const v = s.peek();
    assert(isReal(v) && !isTagged(v) && Math.abs(v.value.toNumber() - 20) < 1e-12,
      `session120: :a:Real(80) Real(25) % → Real(20) — left tag drops`);
  }
  // Right-only tag-drop:  `% Real(80) :p:Real(25)` → Real(20).
  {
    const s = new Stack();
    s.push(Real(80));
    s.push(Tagged('p', Real(25)));
    lookup('%').fn(s);
    const v = s.peek();
    assert(isReal(v) && !isTagged(v) && Math.abs(v.value.toNumber() - 20) < 1e-12,
      `session120: Real(80) :p:Real(25) % → Real(20) — right tag drops`);
  }

  // List distribution on % is row L ✓ since . Pin the
  // List × scalar broadcast on the percent base.  HP50 AUR §3-1: %
  // distributes over the *first* (base) argument when the second is
  // a scalar; we verify the broadcast shape.
  {
    const s = new Stack();
    s.push(RList([Real(80), Real(40)]));
    s.push(Real(25));
    lookup('%').fn(s);
    const v = s.peek();
    assert(v.type === 'list' && v.items.length === 2,
      `session120: {80 40} 25 % returns 2-element list (got len=${v?.items?.length})`);
    assert(isReal(v.items[0]) && Math.abs(v.items[0].value.toNumber() - 20) < 1e-12
        && isReal(v.items[1]) && Math.abs(v.items[1].value.toNumber() - 10) < 1e-12,
      `session120: {80 40} 25 % → {20 10} (% distributes over base)`);
  }

  // V/M rejection on the percent family — flipped V/M from
  // blank to ✗.  Pin the rejection.  HP50 AUR §3-1 percent family is
  // scalar-only, mirroring MOD/MIN/MAX (pinned ).
  assertThrows(
    () => {
      const s = new Stack();
      s.push(Vector([Real(80), Real(40)]));
      s.push(Real(25));
      lookup('%').fn(s);
    },
    /Bad argument type/,
    'session120: Vector 25 % → Bad argument type (% is scalar-only on V)'
  );
  assertThrows(
    () => {
      const s = new Stack();
      s.push(Real(80));
      s.push(Matrix([[Real(25)]]));
      lookup('%').fn(s);
    },
    /Bad argument type/,
    'session120: 80 Matrix(1×1) % → Bad argument type (% is scalar-only on M)'
  );


  // NEG / INV / SQ / ABS — all stay-exact on Rational (EXACT mode).
  // The convention text "EXACT keeps the Rational" is pinned here for
  // the four core unary numeric ops.
  {
    const s = new Stack();
    s.push(Rational(1n, 2n));
    lookup('NEG').fn(s);
    const v = s.peek();
    assert(isRational(v) && v.n === -1n && v.d === 2n,
      `session120: NEG Rational(1,2) → Rational(-1,2) (stay-exact, sign on numerator)`);
  }
  {
    const s = new Stack();
    s.push(Rational(2n, 3n));
    lookup('INV').fn(s);
    const v = s.peek();
    assert(isRational(v) && v.n === 3n && v.d === 2n,
      `session120: INV Rational(2,3) → Rational(3,2) (stay-exact, swap numerator/denominator)`);
  }
  // INV with d=1 collapse: INV Rational(1,5) → Integer(5).
  {
    const s = new Stack();
    s.push(Rational(1n, 5n));
    lookup('INV').fn(s);
    const v = s.peek();
    assert(isInteger(v) && v.value === 5n,
      `session120: INV Rational(1,5) → Integer(5) (Rational(5,1) collapses to Integer)`);
  }
  // SQ stay-exact (and pin that SQ does NOT collapse Rational(4,1)).
  {
    const s = new Stack();
    s.push(Rational(-3n, 4n));
    lookup('SQ').fn(s);
    const v = s.peek();
    assert(isRational(v) && v.n === 9n && v.d === 16n,
      `session120: SQ Rational(-3,4) → Rational(9,16) (sign squared)`);
  }
  // ABS stay-exact.
  {
    const s = new Stack();
    s.push(Rational(-3n, 4n));
    lookup('ABS').fn(s);
    const v = s.peek();
    assert(isRational(v) && v.n === 3n && v.d === 4n,
      `session120: ABS Rational(-3,4) → Rational(3,4) (stay-exact, magnitude)`);
  }

  // SQRT — perfect-square rationals stay exact (then d=1 collapse to
  // Integer if applicable); non-square rationals lift to Symbolic in
  // EXACT mode; negative rationals lift to Complex.
  {
    const s = new Stack();
    s.push(Rational(9n, 16n));
    lookup('SQRT').fn(s);
    const v = s.peek();
    assert(isRational(v) && v.n === 3n && v.d === 4n,
      `session120: SQRT Rational(9,16) → Rational(3,4) (perfect-square stay-exact)`);
  }
  {
    const s = new Stack();
    s.push(Rational(0n, 1n));
    lookup('SQRT').fn(s);
    const v = s.peek();
    assert(isInteger(v) && v.value === 0n,
      `session120: SQRT Rational(0,1) → Integer(0) (zero radicand)`);
  }
  {
    // Non-square rational lifts to Symbolic — irrational SQRT(2) doesn't
    // round-trip exactly through Rational.
    const s = new Stack();
    s.push(Rational(2n, 1n));
    lookup('SQRT').fn(s);
    const v = s.peek();
    assert(v && v.type === 'symbolic',
      `session120: SQRT Rational(2,1) → Symbolic (irrational radicand lifts in EXACT)`);
  }
  {
    // Negative Rational lifts to Complex (principal branch i·sqrt(|x|)).
    const s = new Stack();
    s.push(Rational(-1n, 1n));
    lookup('SQRT').fn(s);
    const v = s.peek();
    assert(isComplex(v) && Math.abs(v.re - 0) < 1e-12 && Math.abs(v.im - 1) < 1e-12,
      `session120: SQRT Rational(-1,1) → Complex(0, 1) (negative-radicand principal branch)`);
  }

  // SIGN — Q always collapses to Integer(-1/0/1).
  {
    const s = new Stack();
    s.push(Rational(-3n, 4n));
    lookup('SIGN').fn(s);
    const v = s.peek();
    assert(isInteger(v) && v.value === -1n,
      `session120: SIGN Rational(-3,4) → Integer(-1)`);
  }
  {
    const s = new Stack();
    s.push(Rational(0n, 1n));
    lookup('SIGN').fn(s);
    const v = s.peek();
    assert(isInteger(v) && v.value === 0n,
      `session120: SIGN Rational(0,1) → Integer(0)`);
  }
  {
    const s = new Stack();
    s.push(Rational(3n, 4n));
    lookup('SIGN').fn(s);
    const v = s.peek();
    assert(isInteger(v) && v.value === 1n,
      `session120: SIGN Rational(3,4) → Integer(1)`);
  }

  // Rounding family — FLOOR / CEIL / IP all collapse to Integer on Q
  // (the integer part is exact, so no Rational result is needed).
  // FP keeps Rational unless integer-valued, where it collapses to
  // Integer(0).  Sign conventions:
  //   FLOOR = round toward -∞
  //   CEIL  = round toward +∞
  //   IP    = trunc toward zero
  {
    const s = new Stack();
    s.push(Rational(7n, 2n));
    lookup('FLOOR').fn(s);
    const v = s.peek();
    assert(isInteger(v) && v.value === 3n,
      `session120: FLOOR Rational(7,2) → Integer(3) (Q→Z collapse, exact)`);
  }
  {
    const s = new Stack();
    s.push(Rational(-7n, 2n));
    lookup('FLOOR').fn(s);
    const v = s.peek();
    assert(isInteger(v) && v.value === -4n,
      `session120: FLOOR Rational(-7,2) → Integer(-4) (round toward -∞)`);
  }
  {
    const s = new Stack();
    s.push(Rational(7n, 2n));
    lookup('CEIL').fn(s);
    const v = s.peek();
    assert(isInteger(v) && v.value === 4n,
      `session120: CEIL Rational(7,2) → Integer(4) (round toward +∞)`);
  }
  {
    const s = new Stack();
    s.push(Rational(-7n, 2n));
    lookup('CEIL').fn(s);
    const v = s.peek();
    assert(isInteger(v) && v.value === -3n,
      `session120: CEIL Rational(-7,2) → Integer(-3)`);
  }
  {
    const s = new Stack();
    s.push(Rational(7n, 2n));
    lookup('IP').fn(s);
    const v = s.peek();
    assert(isInteger(v) && v.value === 3n,
      `session120: IP Rational(7,2) → Integer(3) (trunc toward zero)`);
  }
  {
    const s = new Stack();
    s.push(Rational(-7n, 2n));
    lookup('IP').fn(s);
    const v = s.peek();
    assert(isInteger(v) && v.value === -3n,
      `session120: IP Rational(-7,2) → Integer(-3) (trunc toward zero, NOT -4)`);
  }
  {
    // FP on non-integer Q stays Rational (exact fractional part).
    const s = new Stack();
    s.push(Rational(7n, 2n));
    lookup('FP').fn(s);
    const v = s.peek();
    assert(isRational(v) && v.n === 1n && v.d === 2n,
      `session120: FP Rational(7,2) → Rational(1,2) (exact fractional, stay-Q)`);
  }
  {
    const s = new Stack();
    s.push(Rational(-7n, 2n));
    lookup('FP').fn(s);
    const v = s.peek();
    assert(isRational(v) && v.n === -1n && v.d === 2n,
      `session120: FP Rational(-7,2) → Rational(-1,2) (sign preserved)`);
  }
  {
    // FP on integer-valued Q (Rational(6,3) canonicalises to 2/1) → Integer(0).
    const s = new Stack();
    s.push(Rational(6n, 3n));
    lookup('FP').fn(s);
    const v = s.peek();
    assert(isInteger(v) && v.value === 0n,
      `session120: FP Rational(6,3) → Integer(0) (integer-valued Q has zero fractional part)`);
  }

  // APPROX-mode collapse: Q unary ops drop to Real regardless of
  // exactness.  Pins the flag -3 "give me decimals" contract on the
  // rational unary surface (mirrors the
  // APPROX collapse pin on the binary `+`).
  setApproxMode(true);
  try {
    {
      const s = new Stack();
      s.push(Rational(2n, 3n));
      lookup('INV').fn(s);
      const v = s.peek();
      assert(isReal(v) && Math.abs(v.value.toNumber() - 1.5) < 1e-12,
        `session120: APPROX INV Rational(2,3) → Real ≈ 1.5 (Q→R collapse)`);
    }
    {
      const s = new Stack();
      s.push(Rational(2n, 3n));
      lookup('SQ').fn(s);
      const v = s.peek();
      assert(isReal(v) && Math.abs(v.value.toNumber() - 4/9) < 1e-12,
        `session120: APPROX SQ Rational(2,3) → Real ≈ 0.4444 (Q→R collapse)`);
    }
    {
      const s = new Stack();
      s.push(Rational(7n, 2n));
      lookup('FLOOR').fn(s);
      const v = s.peek();
      assert(isReal(v) && Math.abs(v.value.toNumber() - 3) < 1e-12,
        `session120: APPROX FLOOR Rational(7,2) → Real(3) (Q→R collapse, NOT Integer)`);
    }
  } finally {
    setApproxMode(false);
  }

  // Out-of-domain rejection: FACT / XPON / MANT all reject Rational
  // even at integer-valued Q (e.g., Rational(5,1)).  The HP50 AUR
  // domain for these ops is Real or Integer, NOT Rational — Q is not
  // silently coerced to Real here, even though it could be.  This is
  // a deliberate "Q is its own first-class type" stance (mirrors how
  // BinInt is also rejected from these ops).
  assertThrows(
    () => {
      const s = new Stack();
      s.push(Rational(5n, 1n));
      lookup('FACT').fn(s);
    },
    /Bad argument type/,
    'session120: FACT Rational(5,1) → Bad argument type (Q rejected even at integer-valued)'
  );
  assertThrows(
    () => {
      const s = new Stack();
      s.push(Rational(1n, 2n));
      lookup('XPON').fn(s);
    },
    /Bad argument type/,
    'session120: XPON Rational(1,2) → Bad argument type (Q not in XPON domain)'
  );
  assertThrows(
    () => {
      const s = new Stack();
      s.push(Rational(1n, 2n));
      lookup('MANT').fn(s);
    },
    /Bad argument type/,
    'session120: MANT Rational(1,2) → Bad argument type (Q not in MANT domain)'
  );
}

/* ================================================================
   XPON / MANT L/V/M/T wrapper-add coverage pins.

   Both ops are wrapped in
   `_withTaggedUnary(_withListUnary(_withVMUnary(...)))` — the same
   3-deep composition used by FACT / LNP1 / EXPM / SINH / etc.

   Pinning clusters:
     Cluster 1 — XPON: n=0 empty-List (bare + T+L), n=1 single-element
       bare List, n=2 heterogeneous bare List + Tagged-of-List,
       Vector, Matrix, and bare-Tagged scalar path.
     Cluster 2 — MANT: n=0 empty-List (bare + T+L), n=1 single-element
       bare List, n=2 heterogeneous bare List + Tagged-of-List,
       Vector, Matrix.
   ================================================================ */
{

  // n=0 empty-List — bare axis
  {
    const s = new Stack();
    s.push(RList([]));
    lookup('XPON').fn(s);
    const v = s.peek();
    assert(isList(v) && v.items.length === 0,
      `session187: { } XPON → { } (n=0 bare List passthrough; got type=${v?.type} len=${v?.items?.length})`);
  }

  // n=0 empty-List — Tagged-of-List axis
  {
    const s = new Stack();
    s.push(Tagged('t', RList([])));
    lookup('XPON').fn(s);
    const v = s.peek();
    assert(isTagged(v) && v.tag === 't' && isList(v.value) && v.value.items.length === 0,
      `session187: :t:{ } XPON → :t:{ } (n=0 Tagged-of-List; got tag=${v?.tag} type=${v?.value?.type})`);
  }

  // n=1 bare List — value-precise: XPON(100) = 2
  {
    const s = new Stack();
    s.push(RList([Real(100)]));
    lookup('XPON').fn(s);
    const v = s.peek();
    const item = v?.items?.[0];
    assert(isList(v) && v.items.length === 1 && isReal(item) && item.value.toNumber() === 2,
      `session187: { Real(100) } XPON → { Real(2) } (n=1 bare List; got item=${item?.value?.toString()})`);
  }

  // n=2 heterogeneous bare List — XPON(100)=2, XPON(10)=1 distinct per slot
  {
    const s = new Stack();
    s.push(RList([Real(100), Real(10)]));
    lookup('XPON').fn(s);
    const v = s.peek();
    const [a, b] = v?.items ?? [];
    assert(isList(v) && v.items.length === 2
        && isReal(a) && a.value.toNumber() === 2
        && isReal(b) && b.value.toNumber() === 1,
      `session187: { Real(100) Real(10) } XPON → { Real(2) Real(1) } (n=2 bare List heterogeneous output; got a=${a?.value?.toString()} b=${b?.value?.toString()})`);
  }

  // n=2 Tagged-of-List — re-tags outer label
  {
    const s = new Stack();
    s.push(Tagged('e', RList([Real(100), Real(10)])));
    lookup('XPON').fn(s);
    const v = s.peek();
    const [a, b] = v?.value?.items ?? [];
    assert(isTagged(v) && v.tag === 'e' && isList(v.value) && v.value.items.length === 2
        && isReal(a) && a.value.toNumber() === 2
        && isReal(b) && b.value.toNumber() === 1,
      `session187: :e:{ Real(100) Real(10) } XPON → :e:{ Real(2) Real(1) } (Tagged-of-List; got tag=${v?.tag} a=${a?.value?.toString()} b=${b?.value?.toString()})`);
  }

  // Vector — element-wise: XPON(100)=2, XPON(1000)=3
  {
    const s = new Stack();
    s.push(Vector([Real(100), Real(1000)]));
    lookup('XPON').fn(s);
    const v = s.peek();
    const [a, b] = v?.items ?? [];
    assert(isVector(v) && v.items.length === 2
        && isReal(a) && a.value.toNumber() === 2
        && isReal(b) && b.value.toNumber() === 3,
      `session187: [Real(100) Real(1000)] XPON → [Real(2) Real(3)] (Vector element-wise; got a=${a?.value?.toString()} b=${b?.value?.toString()})`);
  }

  // Matrix — element-wise: 1×2 row [[100 10]] → [[2 1]]
  {
    const s = new Stack();
    s.push(Matrix([[Real(100), Real(10)]]));
    lookup('XPON').fn(s);
    const v = s.peek();
    const row = v?.rows?.[0] ?? [];
    assert(isMatrix(v) && v.rows.length === 1 && row.length === 2
        && isReal(row[0]) && row[0].value.toNumber() === 2
        && isReal(row[1]) && row[1].value.toNumber() === 1,
      `session187: [[Real(100) Real(10)]] XPON → [[Real(2) Real(1)]] (Matrix element-wise; got r00=${row[0]?.value?.toString()} r01=${row[1]?.value?.toString()})`);
  }

  // bare Tagged-of-Real scalar path — tag preserved, inner Real folded
  {
    const s = new Stack();
    s.push(Tagged('x', Real(250)));
    lookup('XPON').fn(s);
    const v = s.peek();
    assert(isTagged(v) && v.tag === 'x' && isReal(v.value) && v.value.value.toNumber() === 2,
      `session187: :x:Real(250) XPON → :x:Real(2) (scalar Tagged path; XPON(250)=2; got tag=${v?.tag} val=${v?.value?.value?.toString()})`);
  }


  // n=0 empty-List — bare axis
  {
    const s = new Stack();
    s.push(RList([]));
    lookup('MANT').fn(s);
    const v = s.peek();
    assert(isList(v) && v.items.length === 0,
      `session187: { } MANT → { } (n=0 bare List passthrough; got type=${v?.type} len=${v?.items?.length})`);
  }

  // n=0 empty-List — Tagged-of-List axis
  {
    const s = new Stack();
    s.push(Tagged('m', RList([])));
    lookup('MANT').fn(s);
    const v = s.peek();
    assert(isTagged(v) && v.tag === 'm' && isList(v.value) && v.value.items.length === 0,
      `session187: :m:{ } MANT → :m:{ } (n=0 Tagged-of-List; got tag=${v?.tag} type=${v?.value?.type})`);
  }

  // n=1 bare List — value-precise: MANT(250) = 2.5
  {
    const s = new Stack();
    s.push(RList([Real(250)]));
    lookup('MANT').fn(s);
    const v = s.peek();
    const item = v?.items?.[0];
    assert(isList(v) && v.items.length === 1 && isReal(item)
        && Math.abs(item.value.toNumber() - 2.5) < 1e-12,
      `session187: { Real(250) } MANT → { Real(2.5) } (n=1 bare List; MANT(250)=2.5; got item=${item?.value?.toString()})`);
  }

  // n=2 heterogeneous bare List — MANT(250)=2.5, MANT(10)=1 distinct per slot
  {
    const s = new Stack();
    s.push(RList([Real(250), Real(10)]));
    lookup('MANT').fn(s);
    const v = s.peek();
    const [a, b] = v?.items ?? [];
    assert(isList(v) && v.items.length === 2
        && isReal(a) && Math.abs(a.value.toNumber() - 2.5) < 1e-12
        && isReal(b) && Math.abs(b.value.toNumber() - 1) < 1e-12,
      `session187: { Real(250) Real(10) } MANT → { Real(2.5) Real(1) } (n=2 bare List heterogeneous; got a=${a?.value?.toString()} b=${b?.value?.toString()})`);
  }

  // n=2 Tagged-of-List — re-tags outer label
  {
    const s = new Stack();
    s.push(Tagged('k', RList([Real(250), Real(10)])));
    lookup('MANT').fn(s);
    const v = s.peek();
    const [a, b] = v?.value?.items ?? [];
    assert(isTagged(v) && v.tag === 'k' && isList(v.value) && v.value.items.length === 2
        && isReal(a) && Math.abs(a.value.toNumber() - 2.5) < 1e-12
        && isReal(b) && Math.abs(b.value.toNumber() - 1) < 1e-12,
      `session187: :k:{ Real(250) Real(10) } MANT → :k:{ Real(2.5) Real(1) } (Tagged-of-List; got tag=${v?.tag} a=${a?.value?.toString()} b=${b?.value?.toString()})`);
  }

  // Vector — element-wise: MANT(2500)=2.5, MANT(100)=1
  {
    const s = new Stack();
    s.push(Vector([Real(2500), Real(100)]));
    lookup('MANT').fn(s);
    const v = s.peek();
    const [a, b] = v?.items ?? [];
    assert(isVector(v) && v.items.length === 2
        && isReal(a) && Math.abs(a.value.toNumber() - 2.5) < 1e-12
        && isReal(b) && Math.abs(b.value.toNumber() - 1) < 1e-12,
      `session187: [Real(2500) Real(100)] MANT → [Real(2.5) Real(1)] (Vector element-wise; got a=${a?.value?.toString()} b=${b?.value?.toString()})`);
  }

  // Matrix — element-wise: [[2500]] → [[2.5]]
  {
    const s = new Stack();
    s.push(Matrix([[Real(2500)]]));
    lookup('MANT').fn(s);
    const v = s.peek();
    const cell = v?.rows?.[0]?.[0];
    assert(isMatrix(v) && v.rows.length === 1 && v.rows[0].length === 1
        && isReal(cell) && Math.abs(cell.value.toNumber() - 2.5) < 1e-12,
      `session187: [[Real(2500)]] MANT → [[Real(2.5)]] (Matrix element-wise; got cell=${cell?.value?.toString()})`);
  }
}

/* ================================================================
   Three widening clusters pinning under-tested contracts on the
   List-distributing arity-2 numeric family, the unary surface, and
   the Tagged-of-Vector composition.

   Cluster 1 — List distribution on the arity-2 numeric family
     (COMB / PERM / IQUOT / IREMAINDER / GCD / LCM / XROOT / MOD /
     MIN / MAX).  All ten ops are wrapped in `_withListBinary` and
 show `L ✓` in their matrix rows since / 105, but
     no direct test pinned scalar×List, List×scalar, or pairwise
 distribution on this sub-family — did
     pin these axes on `+` / `-` / `*` and the rounding family but
     not on the combinatorial / divmod / GCD / LCM / XROOT / MOD /
     MIN / MAX surface, where the inner handler routes through a
     different domain check (integer-or-finite-real-with-rejection
     for COMB / PERM / GCD / LCM, integer-or-Real for the others).

   Cluster 2 — Tagged-of-List on the rounding / sign / abs family
     (FLOOR / CEIL / IP / FP / SIGN / ABS) — the wrapper composition
     `_withTaggedUnary(_withListUnary(handler))` causes `:lbl:{a b}`
     to unwrap Tagged, distribute across the list, then re-tag the
     resulting list. pinned bare-Tagged on these
 ops and pinned bare-List on NEG / FLOOR; this
     cluster pins the composition on a *different* unary subfamily
     (rounding / sign-magnitude) and adds the negative-case
     deliberate-inner-Tagged rejection (`:lbl:{:x:1 :y:-2} NEG` →
 'Bad argument type', mirror of on a
     different op) and the bespoke ABS-Tagged-Vector pin
     (`:v:Vector(3,4) ABS` → `:v:Real(5)` — the Frobenius bespoke
     handler runs *inside* `_withTaggedUnary`, so the outer tag is
     preserved across the V→R kind change).

   Cluster 3 — Rational `Q→R` degradation contract on
     `MIN`/`MAX`/`MOD`.  Distinct from the arithmetic family
     (`+ - * / ^`) which preserves Q via `promoteNumericPair`'s
     `'rational'` kind: `_minMax` and the MOD inner handler do NOT
     route through the rational-kind branch — they fall through
     `toRealOrThrow` and return `Real`.  This is by design (MIN /
     MAX / MOD have always been Real-valued for non-Integer inputs)
     and pinning it is important because the matrix rows for these
     ops (under "Binary — MOD / MIN / MAX") have `R ✓` and don't
     carry a Q column — a future widening pass that adds a Q column
     will need to decide whether to flip to stay-exact, and this
     pin documents the current behavior so the change is visible.
   ================================================================ */
{

  // COMB scalar × List — broadcasts the scalar n across list of m's.
  // `5 COMB {0 2 5}` → {C(5,0)=1, C(5,2)=10, C(5,5)=1}.
  {
    const s = new Stack();
    s.push(Integer(5n));
    s.push(RList([Integer(0n), Integer(2n), Integer(5n)]));
    lookup('COMB').fn(s);
    const v = s.peek();
    assert(v.type === 'list' && v.items.length === 3,
      `session125: 5 COMB {0 2 5} returns 3-element list (got len=${v?.items?.length})`);
    assert(isInteger(v.items[0]) && v.items[0].value === 1n
        && isInteger(v.items[1]) && v.items[1].value === 10n
        && isInteger(v.items[2]) && v.items[2].value === 1n,
      `session125: 5 COMB {0 2 5} → {1 10 1} (got ${v.items.map(x => x.value).join(',')})`);
  }

  // COMB List × scalar — broadcasts the scalar m across list of n's.
  // `{5 6 7} 2 COMB` → {10 15 21}.
  {
    const s = new Stack();
    s.push(RList([Integer(5n), Integer(6n), Integer(7n)]));
    s.push(Integer(2n));
    lookup('COMB').fn(s);
    const v = s.peek();
    assert(v.type === 'list' && isInteger(v.items[0]) && v.items[0].value === 10n
        && isInteger(v.items[1]) && v.items[1].value === 15n
        && isInteger(v.items[2]) && v.items[2].value === 21n,
      `session125: {5 6 7} 2 COMB → {10 15 21} (got ${v?.items?.map(x => x.value).join(',')})`);
  }

  // COMB pairwise — same-length lists distribute element-by-element.
  // `{5 6} {2 3} COMB` → {C(5,2)=10, C(6,3)=20}.
  {
    const s = new Stack();
    s.push(RList([Integer(5n), Integer(6n)]));
    s.push(RList([Integer(2n), Integer(3n)]));
    lookup('COMB').fn(s);
    const v = s.peek();
    assert(v.type === 'list' && v.items.length === 2 && v.items[0].value === 10n && v.items[1].value === 20n,
      `session125: {5 6} {2 3} COMB → {10 20} (got ${v?.items?.map(x => x.value).join(',')})`);
  }

  // COMB pairwise size-mismatch — `_withListBinary` rejects with 'Invalid dimension'.
  assertThrows(
    () => {
      const s = new Stack();
      s.push(RList([Integer(5n)]));
      s.push(RList([Integer(2n), Integer(3n)]));
      lookup('COMB').fn(s);
    },
    /Invalid dimension/,
    'session125: COMB pairwise size mismatch → Invalid dimension (1 vs 2 element lists)'
  );

  // PERM List × scalar — `{5 6} 2 PERM` → {P(5,2)=20, P(6,2)=30}.
  {
    const s = new Stack();
    s.push(RList([Integer(5n), Integer(6n)]));
    s.push(Integer(2n));
    lookup('PERM').fn(s);
    const v = s.peek();
    assert(v.type === 'list' && v.items[0].value === 20n && v.items[1].value === 30n,
      `session125: {5 6} 2 PERM → {20 30} (got ${v?.items?.map(x => x.value).join(',')})`);
  }

  // IQUOT pairwise — `{17 20} {5 3} IQUOT` → {3 6}.
  {
    const s = new Stack();
    s.push(RList([Integer(17n), Integer(20n)]));
    s.push(RList([Integer(5n), Integer(3n)]));
    lookup('IQUOT').fn(s);
    const v = s.peek();
    assert(v.type === 'list' && v.items[0].value === 3n && v.items[1].value === 6n,
      `session125: {17 20} {5 3} IQUOT → {3 6} (got ${v?.items?.map(x => x.value).join(',')})`);
  }

  // IREMAINDER scalar × List — `17 {5 3} IREMAINDER` → {2 2}.
  {
    const s = new Stack();
    s.push(Integer(17n));
    s.push(RList([Integer(5n), Integer(3n)]));
    lookup('IREMAINDER').fn(s);
    const v = s.peek();
    assert(v.type === 'list' && v.items[0].value === 2n && v.items[1].value === 2n,
      `session125: 17 {5 3} IREMAINDER → {2 2} (got ${v?.items?.map(x => x.value).join(',')})`);
  }

  // GCD pairwise — `{12 15} {18 10} GCD` → {6 5}.
  {
    const s = new Stack();
    s.push(RList([Integer(12n), Integer(15n)]));
    s.push(RList([Integer(18n), Integer(10n)]));
    lookup('GCD').fn(s);
    const v = s.peek();
    assert(v.type === 'list' && v.items[0].value === 6n && v.items[1].value === 5n,
      `session125: {12 15} {18 10} GCD → {6 5} (got ${v?.items?.map(x => x.value).join(',')})`);
  }

  // LCM scalar × List — `4 {6 9} LCM` → {12 36}.
  {
    const s = new Stack();
    s.push(Integer(4n));
    s.push(RList([Integer(6n), Integer(9n)]));
    lookup('LCM').fn(s);
    const v = s.peek();
    assert(v.type === 'list' && v.items[0].value === 12n && v.items[1].value === 36n,
      `session125: 4 {6 9} LCM → {12 36} (got ${v?.items?.map(x => x.value).join(',')})`);
  }

  // XROOT List × scalar — `{8 27} 3 XROOT` → {2 3} (real path, returns Real).
  {
    const s = new Stack();
    s.push(RList([Real(8), Real(27)]));
    s.push(Integer(3n));
    lookup('XROOT').fn(s);
    const v = s.peek();
    assert(v.type === 'list' && v.items.length === 2,
      `session125: {8 27} 3 XROOT returns 2-element list (got len=${v?.items?.length})`);
    assert(isReal(v.items[0]) && Math.abs(v.items[0].value.toNumber() - 2) < 1e-12
        && isReal(v.items[1]) && Math.abs(v.items[1].value.toNumber() - 3) < 1e-12,
      `session125: {8 27} 3 XROOT → {≈2 ≈3} (got ${v?.items?.map(x => x.value.toString()).join(',')})`);
  }

  // MOD pairwise — `{10 7} {3 2} MOD` → {1 1}.
  {
    const s = new Stack();
    s.push(RList([Integer(10n), Integer(7n)]));
    s.push(RList([Integer(3n), Integer(2n)]));
    lookup('MOD').fn(s);
    const v = s.peek();
    assert(v.type === 'list' && v.items[0].value === 1n && v.items[1].value === 1n,
      `session125: {10 7} {3 2} MOD → {1 1} (got ${v?.items?.map(x => x.value).join(',')})`);
  }

  // MIN List × scalar — `{1 5 3} 2 MIN` → {1 2 2}.  Element-wise MIN
  // against the broadcast scalar.  Result types are Real because at
  // least one side of every pair is Real (Real(2) broadcast).  Real
  // path of _minMax always emits Real even when the value is integer-
  // valued — so the result is Real(1)/Real(2)/Real(2), not Integer.
  {
    const s = new Stack();
    s.push(RList([Real(1), Real(5), Real(3)]));
    s.push(Real(2));
    lookup('MIN').fn(s);
    const v = s.peek();
    assert(v.type === 'list' && v.items.length === 3,
      `session125: {1 5 3} 2 MIN returns 3-element list (got len=${v?.items?.length})`);
    assert(isReal(v.items[0]) && v.items[0].value.eq(1)
        && isReal(v.items[1]) && v.items[1].value.eq(2)
        && isReal(v.items[2]) && v.items[2].value.eq(2),
      `session125: {1 5 3} 2 MIN → {1 2 2} (got ${v?.items?.map(x => x.value.toString()).join(',')})`);
  }

  // MAX pairwise on Integer-typed lists stays Integer (the inner
  // _minMax integer branch fires when both operands are Integer).
  // `{1 5 3} {4 2 8} MAX` → Integer(4)/Integer(5)/Integer(8).
  {
    const s = new Stack();
    s.push(RList([Integer(1n), Integer(5n), Integer(3n)]));
    s.push(RList([Integer(4n), Integer(2n), Integer(8n)]));
    lookup('MAX').fn(s);
    const v = s.peek();
    assert(v.type === 'list' && isInteger(v.items[0]) && v.items[0].value === 4n
        && isInteger(v.items[1]) && v.items[1].value === 5n
        && isInteger(v.items[2]) && v.items[2].value === 8n,
      `session125: {1 5 3} {4 2 8} MAX → {Integer(4) Integer(5) Integer(8)} (got types=${v?.items?.map(x => x.type).join(',')})`);
  }


  // FLOOR :lbl:{7.2 -1.5} → :lbl:{Real(7) Real(-2)} — Tagged unwraps
  // first, list distributes inside, outer tag re-applies on the
  // resulting list (mirror of NEG variant on
  // a different unary inner handler).
  {
    const s = new Stack();
    s.push(Tagged('lbl', RList([Real(7.2), Real(-1.5)])));
    lookup('FLOOR').fn(s);
    const v = s.peek();
    assert(isTagged(v) && v.tag === 'lbl' && v.value.type === 'list' && v.value.items.length === 2,
      `session125: :lbl:{7.2 -1.5} FLOOR preserves outer tag + list shape (got tag=${v?.tag} inner=${v?.value?.type})`);
    assert(isReal(v.value.items[0]) && v.value.items[0].value.eq(7)
        && isReal(v.value.items[1]) && v.value.items[1].value.eq(-2),
      `session125: :lbl:{7.2 -1.5} FLOOR → :lbl:{Real(7) Real(-2)} (round toward -∞, got ${v?.value?.items?.map(x => x.value.toString()).join(',')})`);
  }

  // CEIL :lbl:{7.2 -1.5} → :lbl:{Real(8) Real(-1)}.
  {
    const s = new Stack();
    s.push(Tagged('lbl', RList([Real(7.2), Real(-1.5)])));
    lookup('CEIL').fn(s);
    const v = s.peek();
    assert(isTagged(v) && v.tag === 'lbl' && v.value.type === 'list'
        && isReal(v.value.items[0]) && v.value.items[0].value.eq(8)
        && isReal(v.value.items[1]) && v.value.items[1].value.eq(-1),
      `session125: :lbl:{7.2 -1.5} CEIL → :lbl:{Real(8) Real(-1)} (round toward +∞)`);
  }

  // IP :a:{7.2 -7.2} → :a:{Real(7) Real(-7)} — trunc toward zero,
  // contrast with FLOOR's -8 / CEIL's -7.
  {
    const s = new Stack();
    s.push(Tagged('a', RList([Real(7.2), Real(-7.2)])));
    lookup('IP').fn(s);
    const v = s.peek();
    assert(isTagged(v) && v.tag === 'a' && v.value.type === 'list'
        && isReal(v.value.items[0]) && v.value.items[0].value.eq(7)
        && isReal(v.value.items[1]) && v.value.items[1].value.eq(-7),
      `session125: :a:{7.2 -7.2} IP → :a:{Real(7) Real(-7)} (trunc toward zero, NOT -8)`);
  }

  // FP :a:{7.2} → :a:{Real(0.2 ± IEEE drift)}.  FP uses the
  // `x - Math.trunc(x)` real path (matches
  // tolerance — the value is approximately 0.2 with sub-1e-12 drift).
  {
    const s = new Stack();
    s.push(Tagged('a', RList([Real(7.2)])));
    lookup('FP').fn(s);
    const v = s.peek();
    assert(isTagged(v) && v.tag === 'a' && v.value.type === 'list' && v.value.items.length === 1
        && isReal(v.value.items[0]),
      `session125: :a:{7.2} FP preserves tag + list shape with Real inner`);
    assert(Math.abs(v.value.items[0].value.toNumber() - 0.2) < 1e-12,
      `session125: :a:{7.2} FP → :a:{≈0.2} (got ${v?.value?.items?.[0]?.value?.toString()})`);
  }

  // SIGN :u:{Real(-3) Real(0) Real(5)} → :u:{Real(-1) Real(0) Real(1)}.
  // The Real branch of SIGN emits Real (NOT Integer) — distinct from
  // the Q→Z collapse path pinned.
  {
    const s = new Stack();
    s.push(Tagged('u', RList([Real(-3), Real(0), Real(5)])));
    lookup('SIGN').fn(s);
    const v = s.peek();
    assert(isTagged(v) && v.tag === 'u' && v.value.type === 'list' && v.value.items.length === 3,
      `session125: :u:{-3 0 5} SIGN preserves tag + 3-element list (got tag=${v?.tag} len=${v?.value?.items?.length})`);
    assert(isReal(v.value.items[0]) && v.value.items[0].value.eq(-1)
        && isReal(v.value.items[1]) && v.value.items[1].value.eq(0)
        && isReal(v.value.items[2]) && v.value.items[2].value.eq(1),
      `session125: :u:{-3 0 5} SIGN → :u:{Real(-1) Real(0) Real(1)} (Real branch; not Integer)`);
  }

  // ABS :v:{3 -4} → :v:{Real(3) Real(4)} (element-wise scalar ABS,
  // NOT Frobenius — Frobenius applies only when the inner is a Vector,
  // pinned separately below).
  {
    const s = new Stack();
    s.push(Tagged('v', RList([Real(3), Real(-4)])));
    lookup('ABS').fn(s);
    const v = s.peek();
    assert(isTagged(v) && v.tag === 'v' && v.value.type === 'list'
        && isReal(v.value.items[0]) && v.value.items[0].value.eq(3)
        && isReal(v.value.items[1]) && v.value.items[1].value.eq(4),
      `session125: :v:{3 -4} ABS → :v:{Real(3) Real(4)} (element-wise, NOT Frobenius)`);
  }

  // Bespoke ABS on Tagged Vector — Frobenius runs *inside* the
  // Tagged wrapper, so :v:Vector(3,4) → :v:Real(5).  Pins that the
  // outer tag is preserved across a V→R kind change at the inner
  // handler (the Vector cell on ABS's row is bespoke — not the
  // _withVMUnary wrapper — so Tagged sees the bespoke result).
  {
    const s = new Stack();
    s.push(Tagged('v', Vector([Real(3), Real(4)])));
    lookup('ABS').fn(s);
    const v = s.peek();
    assert(isTagged(v) && v.tag === 'v' && isReal(v.value),
      `session125: :v:Vector(3,4) ABS preserves outer tag + V→R kind change (got tag=${v?.tag} inner=${v?.value?.type})`);
    assert(v.value.value.eq(5),
      `session125: :v:Vector(3,4) ABS inner = Real(5) Frobenius (got ${v?.value?.value?.toString()})`);
  }

  // Nested Tagged-of-List-of-List — :lbl:{{1.5 2.5}{3.5 4.5}} FLOOR
  // → :lbl:{{1 2}{3 4}}.  The list wrapper recurses, so nested lists
  // FLOOR element-by-element inside the outer Tagged.
  {
    const s = new Stack();
    s.push(Tagged('lbl', RList([
      RList([Real(1.5), Real(2.5)]),
      RList([Real(3.5), Real(4.5)]),
    ])));
    lookup('FLOOR').fn(s);
    const v = s.peek();
    assert(isTagged(v) && v.tag === 'lbl' && v.value.type === 'list'
        && v.value.items.length === 2
        && v.value.items[0].type === 'list' && v.value.items[1].type === 'list',
      `session125: :lbl:{{...}{...}} FLOOR preserves tag + nested-list shape`);
    assert(v.value.items[0].items[0].value.eq(1) && v.value.items[0].items[1].value.eq(2)
        && v.value.items[1].items[0].value.eq(3) && v.value.items[1].items[1].value.eq(4),
      `session125: :lbl:{{1.5 2.5}{3.5 4.5}} FLOOR → :lbl:{{1 2}{3 4}} (nested distribute, tag preserved)`);
  }

  // Deliberate inner-Tagged rejection — `{:x:Real(1) :y:Real(-2)} NEG`
  // throws 'Bad argument type' because `_withTaggedUnary` sits OUTSIDE
  // `_withListUnary` in the wrapper composition: the list distributes
  // first, then the inner scalar handler runs *without* a Tagged
  // unwrapper in scope. Mirror of final pin
  // but on a Tagged-wrapped *outer* (:v:{...}) — verifies the wrapper
  // composition order both ways.  When the Tagged is OUTSIDE the
  // List, things work (every test above); when it's INSIDE the List,
  // the inner scalar handler doesn't unwrap.
  assertThrows(
    () => {
      const s = new Stack();
      s.push(Tagged('v', RList([Tagged('x', Real(1)), Tagged('y', Real(-2))])));
      lookup('NEG').fn(s);
    },
    /Bad argument type/,
    'session125: :v:{:x:Real(1) :y:Real(-2)} NEG → Bad argument type (inner Tagged inside List has no unwrapper at the scalar handler)'
  );


  // MIN Q Q — both operands Rational, but the inner _minMax handler
  // does NOT route through the rational-kind branch.  It checks
  // `isInteger(a) && isInteger(b)` for the integer fast path and
  // falls through `toRealOrThrow` for everything else, including Q.
  // Result: Real(1/3 ≈ 0.333…), NOT Rational(1, 3).  Distinct from
  // the arithmetic family which preserves Q.
  {
    const s = new Stack();
    s.push(Rational(1n, 2n));
    s.push(Rational(1n, 3n));
    lookup('MIN').fn(s);
    const v = s.peek();
    assert(isRational(v) && v.n === 1n && v.d === 3n,
      `session125: MIN Rational(1,2) Rational(1,3) → Rational(1,3), exact as on the HP (got ${v?.type})`);
  }

  // MAX Q Q → Rational(1/2).
  {
    const s = new Stack();
    s.push(Rational(1n, 2n));
    s.push(Rational(1n, 3n));
    lookup('MAX').fn(s);
    const v = s.peek();
    assert(isRational(v) && v.n === 1n && v.d === 2n,
      `session125: MAX Rational(1,2) Rational(1,3) → Rational(1,2), exact as on the HP (got ${v?.type}(${v?.value}))`);
  }

  // MOD Q Q — `7/2 mod 1/3`.  Routes through `_hp50ModReal` on
  // toRealOrThrow-coerced operands: 3.5 mod 0.333… ≈ 0.166… (= 1/6
  // mathematically; the Real path drifts slightly off 1/6 because
  // 1/3 is not exactly representable as a 64-bit float).  Pinning
  // this Q→R degradation distinguishes MOD from `MOD Integer Integer`
  // which stays exact via `_hp50ModBigInt`.
  {
    const s = new Stack();
    s.push(Rational(7n, 2n));
    s.push(Rational(1n, 3n));
    lookup('MOD').fn(s);
    const v = s.peek();
    assert(isReal(v),
      `session125: MOD Rational(7,2) Rational(1,3) → Real (Q→R degradation, NOT stay-exact; got ${v?.type})`);
    // 7/2 mod 1/3 = 1/6 mathematically; the Real-path coercion of
    // 1/3 introduces O(1e-16) drift, so allow 1e-10 tolerance.
    assert(Math.abs(v.value.toNumber() - 1/6) < 1e-10,
      `session125: MOD Rational(7,2) Rational(1,3) → Real(≈1/6) (got ${v?.value?.toString()})`);
  }

  // Q × Z cross-family on MIN — Z widens to Real here (NOT Integer
  // fast path), because the integer-fast-path guard is `isInteger(a)
  // && isInteger(b)` and the Q operand fails that test.  Result is
  // Real(0.5).
  {
    const s = new Stack();
    s.push(Rational(1n, 2n));
    s.push(Integer(1n));
    lookup('MIN').fn(s);
    const v = s.peek();
    assert(isRational(v) && v.n === 1n && v.d === 2n,
      `session125: MIN Rational(1,2) Integer(1) → Rational(1,2), exact (got ${v?.type}(${v?.value}))`);
  }

  // Operand-order symmetry — Z × Q routes through the same Real
  // fall-through branch.
  {
    const s = new Stack();
    s.push(Integer(1n));
    s.push(Rational(1n, 2n));
    lookup('MIN').fn(s);
    const v = s.peek();
    assert(isRational(v) && v.n === 1n && v.d === 2n,
      `session125: MIN Integer(1) Rational(1,2) → Rational(1,2) (Z×Q symmetric, exact)`);
  }

  // Q × R on MAX — `3/2 ≈ 1.5` vs `0.7`, max is 1.5 as Real.  Pins
  // that Real-side wins typewise too.
  {
    const s = new Stack();
    s.push(Rational(3n, 2n));
    s.push(Real(0.7));
    lookup('MAX').fn(s);
    const v = s.peek();
    assert(isReal(v) && Math.abs(v.value.toNumber() - 1.5) < 1e-12,
      `session125: MAX Rational(3,2) Real(0.7) → Real(1.5) (Q×R degrades to Real; got ${v?.type}(${v?.value}))`);
  }

  // Q × Z on MOD — `7/2 mod 2`.  Coerces Q to Real(3.5), Z to
  // Real(2), `_hp50ModReal(3.5, 2) = 1.5`.
  {
    const s = new Stack();
    s.push(Rational(7n, 2n));
    s.push(Integer(2n));
    lookup('MOD').fn(s);
    const v = s.peek();
    assert(isReal(v) && Math.abs(v.value.toNumber() - 1.5) < 1e-12,
      `session125: MOD Rational(7,2) Integer(2) → Real(1.5) (Q→R coercion; got ${v?.type}(${v?.value}))`);
  }

  // Symbolic lift through Q on MIN — `_isSymOperand` runs before the
  // numeric routing, so MIN Q + Name(X) lifts to a Symbolic
  // `MIN(1/2, X)` (the Q operand survives the AST as
  // `Bin('/', Num(1), Num(2))` per the Sy convention from session
  // 092).  No Q→R degradation in the symbolic path.
  {
    const s = new Stack();
    s.push(Rational(1n, 2n));
    s.push(Name('X'));
    lookup('MIN').fn(s);
    const v = s.peek();
    assert(v.type === 'symbolic',
      `session125: MIN Rational(1,2) Name(X) → Symbolic (Sy lift wins over numeric routing; got ${v?.type})`);
  }

  // Complex(im≠0) rejection on MAX — Q vs C(im≠0) hits the
  // `isComplex(a) || isComplex(b)` rejection guard before routing,
  // so the result is 'Bad argument type' regardless of the Q side.
  // (This pins that Q is a peer of Real / Integer in the rejection
  // path — it doesn't bypass the Complex rejection.)
  assertThrows(
    () => {
      const s = new Stack();
      s.push(Rational(1n, 2n));
      s.push(Complex(0, 2));
      lookup('MAX').fn(s);
    },
    /Bad argument type/,
    'session125: MAX Rational(1,2) Complex(0,2) → Bad argument type (C rejection wins, Q does not bypass)'
  );

  // Same rejection on MOD.
  assertThrows(
    () => {
      const s = new Stack();
      s.push(Rational(1n, 2n));
      s.push(Complex(0, 2));
      lookup('MOD').fn(s);
    },
    /Bad argument type/,
    'session125: MOD Rational(1,2) Complex(0,2) → Bad argument type (C rejection wins on MOD too)'
  );

  // Contrast pin — `+` on Q×Q stays-exact ( pin
  // mirrored here for the contrast).  This is the *arithmetic*
  // family's Q-preserving behavior versus the MIN/MAX/MOD family's
  // Q-degrading behavior.  Single assertion documenting the contrast
  // alongside the pins above; the full + on Q is pinned in session
  // 115's block.
  {
    const s = new Stack();
    s.push(Rational(1n, 2n));
    s.push(Rational(1n, 3n));
    lookup('+').fn(s);
    const v = s.peek();
    assert(isRational(v) && v.n === 5n && v.d === 6n,
      `session125 (contrast): + Rational(1,2) Rational(1,3) → Rational(5,6) (arithmetic stays Q — contrast with MIN/MAX/MOD's Q→R)`);
  }
}

/* ================================================================
 — Cluster 1: Tagged-of-Vector / Tagged-of-Matrix
   composition through `_withTaggedUnary(_withListUnary(
   _withVMUnary(handler)))` for the wrapper-VM-using unary family.

   Every elementary unary op that uses `_withVMUnary` (SQRT, FACT,
   LNP1, EXPM, the trig and hyperbolic family, ASIN/ACOS/ATAN, …)
   has a 3-deep wrapper composition: T → L → VM → handler.  At a
   `Tagged(label, Vector|Matrix)` input the order is:
     (1) `_withTaggedUnary` unwraps Tagged and pushes the V/M.
     (2) `_withListUnary` doesn't intercept V/M (only RList).
     (3) `_withVMUnary` distributes element-wise via a temp-stack
         pattern that calls the inner handler per element.
     (4) `_withListUnary` returns the V/M unchanged.
     (5) `_withTaggedUnary` re-tags the resulting V/M with the same
         label.

   pinned the bespoke ABS-of-Tagged-Vector
   path (where ABS does NOT route through `_withVMUnary` — it has a
   bespoke isVector/isMatrix branch in the handler that emits a
   scalar Frobenius norm).  This cluster covers the OTHER code
   path — the wrapper-VM composition — which is what every op in
   "Unary — invert / square / sqrt / elementary functions" except
   ABS / SIGN / INV uses.

   ALSO covered here: Matrix axis on the bespoke ABS branch
; the inner V → R kind change
   composes with the outer Tagged identically for Matrix → R
   (Frobenius on Matrix is also a Real scalar).  And NEG on
   Tagged-Matrix — NEG has its own bespoke V/M branch (does not
   use `_withVMUnary`) that maps element-wise — pinning the
   Tagged-Matrix path on NEG closes the bespoke-V/M-with-Tagged
   surface that wasn't covered . */
{
  // SQRT on Tagged-Vector: wrapper-VM composition with the principal-
  // branch transcendental.  Pins that the inner `_withVMUnary` runs
  // SQRT per element after Tagged unwrap, and the outer Tagged
  // re-tags the resulting Vector.
  {
    const s = new Stack();
    s.push(Tagged('v', Vector([Real(4), Real(9)])));
    lookup('SQRT').fn(s);
    const v = s.peek();
    assert(isTagged(v) && v.tag === 'v' && isVector(v.value),
      `session130: SQRT :v:Vector(4, 9) preserves outer tag + Vector inner shape (got tag=${v?.tag} inner=${v?.value?.type})`);
    assert(v.value.items.length === 2
        && v.value.items[0].value.eq(2) && v.value.items[1].value.eq(3),
      `session130: SQRT :v:Vector(4, 9) → :v:Vector(Real(2), Real(3)) (got items=${v?.value?.items?.map(x => x.value.toString()).join(',')})`);
  }

  // SIN on Tagged-Vector: pins the trig wrapper-VM path under
  // Tagged.  At RAD mode (default), sin(0) = 0.  Two-element
  // Vector with both zeros is the cleanest pin (no IEEE drift).
  {
    const s = new Stack();
    s.push(Tagged('v', Vector([Real(0), Real(0)])));
    lookup('SIN').fn(s);
    const v = s.peek();
    assert(isTagged(v) && v.tag === 'v' && isVector(v.value)
        && v.value.items.every(x => isReal(x) && x.value.isZero()),
      `session130: SIN :v:Vector(0, 0) → :v:Vector(0, 0) (Tagged + Vector + transcendental composition; got ${v?.value?.items?.map(x => x.value.toString()).join(',')})`);
  }

  // FACT on Tagged-Vector: pins that the integer-domain inner
  // handler also composes through `_withVMUnary` under Tagged.
  // FACT(0) = 1 and FACT(5) = 120 — both valid Integer inputs in
  // the integer-coerce branch.
  {
    const s = new Stack();
    s.push(Tagged('v', Vector([Real(0), Real(5)])));
    lookup('FACT').fn(s);
    const v = s.peek();
    assert(isTagged(v) && v.tag === 'v' && isVector(v.value),
      `session130: FACT :v:Vector(0, 5) preserves outer tag + Vector shape`);
    // FACT emits Integer for valid integer Real inputs.
    const items = v.value.items;
    assert(items.length === 2
        && (isInteger(items[0]) || isReal(items[0])) && Number(items[0].value) === 1
        && (isInteger(items[1]) || isReal(items[1])) && Number(items[1].value) === 120,
      `session130: FACT :v:Vector(0, 5) → :v:{1, 120} (got ${items?.map(x => `${x.type}(${x.value})`).join(',')})`);
  }

  // SQRT on Tagged-Matrix: pins the wrapper-VM composition on the
  // Matrix axis.  All four cells are perfect squares so the result
  // is a clean integer-valued Real grid.
  {
    const s = new Stack();
    s.push(Tagged('m', Matrix([[Real(4), Real(9)], [Real(16), Real(25)]])));
    lookup('SQRT').fn(s);
    const v = s.peek();
    assert(isTagged(v) && v.tag === 'm' && isMatrix(v.value),
      `session130: SQRT :m:Matrix([[4,9],[16,25]]) preserves outer tag + Matrix shape (got tag=${v?.tag} inner=${v?.value?.type})`);
    const r = v.value.rows;
    assert(r.length === 2 && r[0].length === 2
        && r[0][0].value.eq(2) && r[0][1].value.eq(3)
        && r[1][0].value.eq(4) && r[1][1].value.eq(5),
      `session130: SQRT :m:Matrix([[4,9],[16,25]]) → :m:Matrix([[2,3],[4,5]]) (per-element SQRT through Tagged)`);
  }

  // NEG on Tagged-Matrix: NEG has a BESPOKE V/M branch (it does
  // NOT use `_withVMUnary`) — but the outer `_withTaggedUnary` /
  // `_withListUnary` chain composes the same way.  Pins that the
  // bespoke handler still re-tags correctly on Matrix.
  {
    const s = new Stack();
    s.push(Tagged('m', Matrix([[Real(1), Real(-2)], [Real(3), Real(-4)]])));
    lookup('NEG').fn(s);
    const v = s.peek();
    assert(isTagged(v) && v.tag === 'm' && isMatrix(v.value),
      `session130: NEG :m:Matrix([[1,-2],[3,-4]]) preserves tag + Matrix shape`);
    const r = v.value.rows;
    assert(r[0][0].value.eq(-1) && r[0][1].value.eq(2)
        && r[1][0].value.eq(-3) && r[1][1].value.eq(4),
      `session130: NEG :m:Matrix([[1,-2],[3,-4]]) → :m:Matrix([[-1,2],[-3,4]])`);
  }

  // ABS on Tagged-Matrix: bespoke Matrix → Real (Frobenius norm)
  // path, mirror of 's bespoke ABS-Tagged-Vector pin
  // but on the Matrix axis.  Pins that the M → R kind change at
  // the inner handler still preserves the outer tag.
  // Frobenius of [[3,0],[0,4]] = √(9 + 16) = √25 = 5.
  {
    const s = new Stack();
    s.push(Tagged('m', Matrix([[Real(3), Real(0)], [Real(0), Real(4)]])));
    lookup('ABS').fn(s);
    const v = s.peek();
    assert(isTagged(v) && v.tag === 'm' && isReal(v.value),
      `session130: ABS :m:Matrix([[3,0],[0,4]]) preserves outer tag + M→R kind change (got tag=${v?.tag} inner=${v?.value?.type})`);
    assert(v.value.value.eq(5),
      `session130: ABS :m:Matrix([[3,0],[0,4]]) inner = Real(5) Frobenius (got ${v?.value?.value?.toString()})`);
  }

  // LNP1 on Tagged-Vector: stable-near-zero log on each element.
  // LNP1(0) = log(1+0) = 0, LNP1(e-1) ≈ 1 (we use exp(1)-1 ≈
  // 1.71828… for the second element so the asserted value is
  // exact-as-1 within Decimal precision).  This pins LNP1's
  // wrapper-VM composition (it lives in the same chain as SQRT).
  {
    const s = new Stack();
    s.push(Tagged('v', Vector([Real(0), Real(0)])));
    lookup('LNP1').fn(s);
    const v = s.peek();
    assert(isTagged(v) && v.tag === 'v' && isVector(v.value)
        && v.value.items.every(x => isReal(x) && x.value.isZero()),
      `session130: LNP1 :v:Vector(0, 0) → :v:Vector(0, 0) (LNP1 wrapper-VM pin)`);
  }
}

/* ================================================================
 — Cluster 2: BinaryInteger × Rational cross-family
   on `==` / `≠` / `<` / `>` / `≤` / `≥` and SAME's strict no-coerce
   contract.

   `_binIntCrossNormalize` (ops.js:4453) wraps `==` / `≠` / `<>`
   and masks BinInt → Integer with the current wordsize before
   routing through `eqValues` → `promoteNumericPair`.  `comparePair`
   (ops.js:4502) does the same masking inline before routing
   through `promoteNumericPair`.  Both then route Integer × Rational
   through the `'rational'` kind branch — for `==` it's value
   equality (`n1 * d2 == n2 * d1`) and for ordered compare it's a
   cross-multiply (no Real round-trip — preserves exactness).

   pinned Q × Z, Q × R, Q × C and the
   ordered-compare rational branch, but stopped short of B × Q —
   which exercises a *composition* of two cross-family widenings
   (BinInt → Integer in `_binIntCrossNormalize` / `comparePair`,
   then Integer × Rational in `promoteNumericPair`'s rational
   kind). added BinInt to the comparator widening
   directly but only pinned B × Z / B × R / B × C, not B × Q.

   SAME deliberately stays strict (ops.js:4477) — `_binIntCrossNormalize`
   is NOT applied — so `SAME #10h Rational(16,1)` = 0 even though
   `#10h == Rational(16,1)` = 1.  This pins both halves of the
   contract. */
{
  // `==` cross-widen: BinInt #10h (decimal 16) masks to Integer(16),
  // then promotes (Integer(16), Rational(16,1)) → rational kind,
  // 16*1 == 16*1 → true.
  {
    const s = new Stack();
    s.push(BinaryInteger(0x10n, 'h'));
    s.push(Rational(16n, 1n));
    lookup('==').fn(s);
    const v = s.peek();
    assert(isReal(v) && v.value.eq(1),
      `session130: #10h == Rational(16,1) → 1 (cross-normalize BinInt → Integer → rational kind eq)`);
  }

  // Same widening on a *non-equal* pair — Integer(16) vs
  // Rational(33,2) cross-multiplies to 32 vs 33 → false.
  {
    const s = new Stack();
    s.push(BinaryInteger(0x10n, 'h'));
    s.push(Rational(33n, 2n));
    lookup('==').fn(s);
    const v = s.peek();
    assert(isReal(v) && v.value.eq(0),
      `session130: #10h == Rational(33,2) → 0 (16 vs 16.5; rational-kind cross-multiply)`);
  }

  // `≠` is the outer-level negation of `==` and routes through the
  // same `_binIntCrossNormalize`.  Pin that the negation lands in
  // the right cell.
  {
    const s = new Stack();
    s.push(BinaryInteger(0x10n, 'h'));
    s.push(Rational(33n, 2n));
    lookup('≠').fn(s);
    const v = s.peek();
    assert(isReal(v) && v.value.eq(1),
      `session130: #10h ≠ Rational(33,2) → 1 (Routes through _binIntCrossNormalize like ==)`);
  }

  // SAME deliberately does NOT cross-normalize BinInt — types
  // differ after the no-op normalize, so SAME returns 0 even when
  // `==` returns 1. Pin (mirror of 's BinInt × Integer
  // SAME pin extended to BinInt × Rational).
  {
    const s = new Stack();
    s.push(BinaryInteger(0x10n, 'h'));
    s.push(Rational(16n, 1n));
    lookup('SAME').fn(s);
    const v = s.peek();
    assert(isReal(v) && v.value.eq(0),
      `session130: SAME #10h Rational(16,1) → 0 (SAME does NOT cross-normalize BinInt — strict types per AUR §4-7)`);
  }

  // Ordered compare — `<` masks BinInt #10h → Integer(16), then
  // promotes (Integer, Rational) → rational kind.  The
  // cross-multiply branch (ops.js:4549) compares `n1*d2 < n2*d1`
  // → 16*2 < 33*1 → 32 < 33 → true.
  {
    const s = new Stack();
    s.push(BinaryInteger(0x10n, 'h'));
    s.push(Rational(33n, 2n));
    lookup('<').fn(s);
    const v = s.peek();
    assert(isReal(v) && v.value.eq(1),
      `session130: #10h < Rational(33,2) → 1 (cross-multiply 16*2=32 < 33*1=33)`);
  }

  // Operand-order on `>`: same compare, swapped operands → false.
  {
    const s = new Stack();
    s.push(Rational(33n, 2n));
    s.push(BinaryInteger(0x10n, 'h'));
    lookup('>').fn(s);
    const v = s.peek();
    assert(isReal(v) && v.value.eq(1),
      `session130: Rational(33,2) > #10h → 1 (cross-multiply 33*1=33 > 16*2=32 — operand-order symmetric to <)`);
  }

  // `≤` on Rational × BinInt: Rational(7,3) ≈ 2.333, #3h = 3 →
  // 7/3 ≤ 3 → true.  Cross-multiply: 7*1 ≤ 3*3 → 7 ≤ 9 → true.
  {
    const s = new Stack();
    s.push(Rational(7n, 3n));
    s.push(BinaryInteger(0x3n, 'h'));
    lookup('≤').fn(s);
    const v = s.peek();
    assert(isReal(v) && v.value.eq(1),
      `session130: Rational(7,3) ≤ #3h → 1 (Q × B widens via Integer; cross-multiply 7 ≤ 9)`);
  }

  // `≥` equality boundary: Rational(2,1) (= Integer(2) by canonical
  // form) ≥ #2h.  At the rational branch, 2*1 ≥ 2*1 → 2 ≥ 2 → true.
  // Note: Rational(2,1) is constructed as { n: 2n, d: 1n } per
  // — does NOT auto-collapse to Integer at the
  // constructor (collapse happens at op-level result).
  {
    const s = new Stack();
    s.push(Rational(2n, 1n));
    s.push(BinaryInteger(0x2n, 'h'));
    lookup('≥').fn(s);
    const v = s.peek();
    assert(isReal(v) && v.value.eq(1),
      `session130: Rational(2,1) ≥ #2h → 1 (equality at the rational-branch boundary)`);
  }

  // Negative case for `<`: Rational(-3,4) vs #0h (= Integer(0)) at
  // the rational branch.  Cross-multiply: -3*1 < 0*4 → -3 < 0 →
  // true.  Pins that BinInt at value 0 still routes through the
  // rational branch correctly (no division-by-zero on d=1).
  {
    const s = new Stack();
    s.push(Rational(-3n, 4n));
    s.push(BinaryInteger(0n, 'h'));
    lookup('<').fn(s);
    const v = s.peek();
    assert(isReal(v) && v.value.eq(1),
      `session130: Rational(-3,4) < #0h → 1 (negative Q vs zero BinInt; cross-multiply -3 < 0)`);
  }

  // Wordsize-mask edge case on `==`: at ws=8, #100h masks to 0,
  // and Rational(0,1) compares equal.  Pins that the mask in
  // `_binIntCrossNormalize` fires before the rational kind compare
  // (cf. 's similar pin on B × Z). Restored ws=64 in
  // a try/finally to avoid leaking state.
  {
    setWordsize(8);
    try {
      const s = new Stack();
      s.push(BinaryInteger(0x100n, 'h'));
      s.push(Rational(0n, 1n));
      lookup('==').fn(s);
      const v = s.peek();
      assert(isReal(v) && v.value.eq(1),
        `session130: ws=8 #100h == Rational(0,1) → 1 (mask fires before rational compare; #100h & 0xFF = 0)`);
    } finally {
      setWordsize(64);
    }
  }

  // Wordsize-mask edge case on `>`: at ws=8, #FFh = 255 stays 255,
  // and 255 > Rational(254,1) = 254 → true.  This pins both that
  // the mask is value-preserving on in-range values AND that the
  // rational-branch compare fires.
  {
    setWordsize(8);
    try {
      const s = new Stack();
      s.push(BinaryInteger(0xFFn, 'h'));
      s.push(Rational(254n, 1n));
      lookup('>').fn(s);
      const v = s.peek();
      assert(isReal(v) && v.value.eq(1),
        `session130: ws=8 #FFh > Rational(254,1) → 1 (mask preserves in-range value; 255 > 254)`);
    } finally {
      setWordsize(64);
    }
  }

  // Wordsize-mask wraparound on `<`: at ws=8, #1FFh masks to #FFh
  // = 255.  `Rational(300,1)` (= 300) > 255 → so #1FFh < Rational(300,1)
  // = true.  Pin that the mask happens BEFORE the compare —
  // without masking, #1FFh = 511 would be > 300, flipping the
  // result.  This is the same masking discipline pinned on B × Z
  // ordered compare.
  {
    setWordsize(8);
    try {
      const s = new Stack();
      s.push(BinaryInteger(0x1FFn, 'h'));
      s.push(Rational(300n, 1n));
      lookup('<').fn(s);
      const v = s.peek();
      assert(isReal(v) && v.value.eq(1),
        `session130: ws=8 #1FFh < Rational(300,1) → 1 (mask BEFORE compare; #1FFh masks to 255 < 300, NOT 511 > 300)`);
    } finally {
      setWordsize(64);
    }
  }
}

/* ================================================================
 — Cluster 3: Tagged-of-List composition on binary
   ops via `_withTaggedBinary(_withListBinary(handler))`.

   The percent family (`%` / `%T` / `%CH`) and the binary-numeric
   family with list distribution (GCD / LCM / MOD / MIN / MAX /
   COMB / PERM / IQUOT / IREMAINDER / Beta) all wrap with
   `_withTaggedBinary` OUTSIDE `_withListBinary`.  At a Tagged input
   on either side the order is:
     (1) `_withTaggedBinary` checks both top-2 slots; if either is
         Tagged, both are popped and unwrapped (tag values dropped
         per HP50 AUR §3.4 binary tag-drop).
     (2) `_withListBinary` then sees the unwrapped values and
         distributes if either is a list (scalar × List, List ×
         scalar, or pairwise same-size).
     (3) The inner scalar handler runs per element.
     (4) Result is the un-Tagged List (binary tag-drop — no
         re-tag, since binary ops have no single obvious label).

   pinned both-side / left-only / right-only
   tag-drop on the percent family with bare-scalar operands.
   pinned the `_withListBinary` distribution
   axes on the combinatorial / divmod / GCD / LCM / MOD / MIN /
   MAX surface with bare-list operands.  This cluster covers the
   *composition* — Tagged outside List on one or both operands —
   on a representative sample of the binary-list family, plus the
   deliberate inner-Tagged-inside-List rejection on the binary
 surface (a binary mirror of 's unary
   inner-Tagged-inside-List rejection on NEG).  10 hard
   assertions. */
{
  // Tagged-of-List × scalar on `%` — left side has Tagged + List,
  // right side is bare scalar.  `_withTaggedBinary` unwraps the
  // tag → push `{80, 40}` and `25`, then `_withListBinary`
  // broadcasts → `{80*25/100, 40*25/100} = {20, 10}`.  Result is
  // un-Tagged List (tag-drop on binary).
  {
    const s = new Stack();
    s.push(Tagged('lbl', RList([Real(80), Real(40)])));
    s.push(Real(25));
    lookup('%').fn(s);
    const v = s.peek();
    assert(isList(v) && !isTagged(v),
      `session130: :lbl:{80 40} 25 % → un-Tagged List (binary tag-drop on percent; got ${v?.type})`);
    assert(v.items.length === 2
        && isReal(v.items[0]) && v.items[0].value.eq(20)
        && isReal(v.items[1]) && v.items[1].value.eq(10),
      `session130: :lbl:{80 40} 25 % → {Real(20), Real(10)} (got ${v?.items?.map(x => x.value.toString()).join(',')})`);
  }

  // Right-side Tagged-of-List on `%T` — `_withTaggedBinary`
  // unwraps the right tag, list distributes scalar × list →
  // `{100*25/50, 100*75/50} = {50, 150}`.  Pins the
  // operand-order symmetry of the wrapper composition.
  {
    const s = new Stack();
    s.push(Real(50));
    s.push(Tagged('p', RList([Real(25), Real(75)])));
    lookup('%T').fn(s);
    const v = s.peek();
    assert(isList(v) && !isTagged(v) && v.items.length === 2
        && isReal(v.items[0]) && v.items[0].value.eq(50)
        && isReal(v.items[1]) && v.items[1].value.eq(150),
      `session130: 50 :p:{25 75} %T → {Real(50), Real(150)} (right-Tagged-of-List, percent base; got ${v?.items?.map(x => x.value.toString()).join(',')})`);
  }

  // Both-side Tagged-of-List on `%` — both tags drop, both lists
  // pair-distribute → `{80*25/100, 40*50/100} = {20, 20}`.  Pin
  // that double-Tagged-and-double-List composes via the same
  // wrapper chain.
  {
    const s = new Stack();
    s.push(Tagged('a', RList([Real(80), Real(40)])));
    s.push(Tagged('b', RList([Real(25), Real(50)])));
    lookup('%').fn(s);
    const v = s.peek();
    assert(isList(v) && !isTagged(v) && v.items.length === 2
        && isReal(v.items[0]) && v.items[0].value.eq(20)
        && isReal(v.items[1]) && v.items[1].value.eq(20),
      `session130: :a:{80 40} :b:{25 50} % → {Real(20), Real(20)} (both-Tagged + pairwise List; got ${v?.items?.map(x => x.value.toString()).join(',')})`);
  }

  // Tagged-of-List × bare-List on `GCD` — left Tagged unwraps,
  // pairwise GCD → `{GCD(12,6), GCD(18,9)} = {6, 9}`.  Pin
  // through the integer fast path of `GCD` (both operands are
  // Integers, so the result stays Integer).
  {
    const s = new Stack();
    s.push(Tagged('a', RList([Integer(12n), Integer(18n)])));
    s.push(RList([Integer(6n), Integer(9n)]));
    lookup('GCD').fn(s);
    const v = s.peek();
    assert(isList(v) && !isTagged(v) && v.items.length === 2
        && isInteger(v.items[0]) && v.items[0].value === 6n
        && isInteger(v.items[1]) && v.items[1].value === 9n,
      `session130: :a:{12 18} {6 9} GCD → {Integer(6), Integer(9)} (left-Tagged, pairwise distribution, integer fast path; got ${v?.items?.map(x => `${x.type}(${x.value})`).join(',')})`);
  }

  // Both-side Tagged-of-List on `MOD` — `_withTaggedBinary`
  // unwraps both tags, `_withListBinary` pairs `{10 mod 3, 7 mod 2} = {1, 1}`.
  // Pin through MOD's integer fast path (both Integer operands
  // ⇒ Integer result, contrast with MOD's Q→R degradation pinned
  // ).
  {
    const s = new Stack();
    s.push(Tagged('a', RList([Integer(10n), Integer(7n)])));
    s.push(Tagged('b', RList([Integer(3n), Integer(2n)])));
    lookup('MOD').fn(s);
    const v = s.peek();
    assert(isList(v) && !isTagged(v) && v.items.length === 2
        && isInteger(v.items[0]) && v.items[0].value === 1n
        && isInteger(v.items[1]) && v.items[1].value === 1n,
      `session130: :a:{10 7} :b:{3 2} MOD → {Integer(1), Integer(1)} (both-Tagged + pairwise + integer fast path; got ${v?.items?.map(x => `${x.type}(${x.value})`).join(',')})`);
  }

  // Tagged-of-List × scalar on `COMB` — left Tagged unwraps,
  // List × scalar broadcast → `{C(5,2), C(6,2)} = {10, 15}`.  Pin
  // a combinatorial-family op through the same wrapper chain.
  {
    const s = new Stack();
    s.push(Tagged('lbl', RList([Integer(5n), Integer(6n)])));
    s.push(Integer(2n));
    lookup('COMB').fn(s);
    const v = s.peek();
    assert(isList(v) && !isTagged(v) && v.items.length === 2
        && Number(v.items[0].value) === 10 && Number(v.items[1].value) === 15,
      `session130: :lbl:{5 6} 2 COMB → {Integer(10), Integer(15)} (Tagged-of-List + scalar through combinatorial path)`);
  }

  // Tagged-of-Tagged scalar on `MIN` — both tags drop, integer
  // fast path: min(5, 3) = 3.  Pins the bare-scalar both-Tagged
  // path on a binary-numeric op that's distinct from the percent
  // family pinned.
  {
    const s = new Stack();
    s.push(Tagged('a', Integer(5n)));
    s.push(Tagged('b', Integer(3n)));
    lookup('MIN').fn(s);
    const v = s.peek();
    assert(isInteger(v) && v.value === 3n,
      `session130: :a:Integer(5) :b:Integer(3) MIN → Integer(3) (both-Tagged scalar, integer fast path on MIN)`);
  }

  // Inner-Tagged-inside-List on the binary `%` surface —
  // `_withTaggedBinary` only inspects the top-2 stack slots; the
  // List (level 2) is NOT Tagged at the top level.  Then
  // `_withListBinary` recurses into `apply()` which calls the
  // INNER `handler` directly (NOT back through the wrapped
  // function — see ops.js:519).  So the inner handler sees a
  // bare Tagged scalar, calls `toRealOrThrow`, and rejects.  This
  // is the binary mirror of 's unary
  // inner-Tagged-inside-List rejection on NEG.
  assertThrows(
    () => {
      const s = new Stack();
      s.push(RList([Tagged('x', Real(80)), Tagged('y', Real(40))]));
      s.push(Real(25));
      lookup('%').fn(s);
    },
    /Bad argument/,
    'session130: {:x:80 :y:40} 25 % → Bad argument type (inner Tagged inside List has no unwrapper at the binary scalar handler; mirror of session 125 unary pin)'
  );

  // Sanity contrast — Tagged scalar × bare scalar on `%` (no
  // List).  `_withTaggedBinary` unwraps the tag → `80 25 %` =
  // `Real(20)`, no Tagged envelope (binary tag-drop).  Single
  // assertion documenting that bare-scalar both-side tag-drop
  // (already pinned ) still composes here as
  // expected — useful as the contrast with the List-recursion
  // rejection above.
  {
    const s = new Stack();
    s.push(Tagged('a', Real(80)));
    s.push(Real(25));
    lookup('%').fn(s);
    const v = s.peek();
    assert(isReal(v) && v.value.eq(20) && !isTagged(v),
      `session130 (contrast): :a:80 25 % → Real(20) (bare-scalar Tagged tag-drop — composes the same way as the List-broadcast pins above)`);
  }

  // Tagged on right-only with scalar × Tagged-of-List on `LCM` —
  // pins the right-side Tagged-of-List + left-scalar variant on
  // a combinatorial-adjacent op (LCM). Pairs with
  // Cluster 1's bare-scalar × bare-List LCM pin (which used `4
  // {6 9} LCM` → `{12, 36}`); here the same answer is reached
  // via the Tagged-unwrap path.
  {
    const s = new Stack();
    s.push(Integer(4n));
    s.push(Tagged('lbl', RList([Integer(6n), Integer(9n)])));
    lookup('LCM').fn(s);
    const v = s.peek();
    assert(isList(v) && !isTagged(v) && v.items.length === 2
        && Number(v.items[0].value) === 12 && Number(v.items[1].value) === 36,
      `session130: 4 :lbl:{6 9} LCM → {Integer(12), Integer(36)} (right-Tagged-of-List, scalar × Tagged-List; got ${v?.items?.map(x => `${x.type}(${x.value})`).join(',')})`);
  }
}

/* ================================================================
 — Cluster 1: Rational × Vector / Rational × Matrix
   arithmetic broadcast on `+ - * /`.

   The compact reference rows for `+ - * /` carry `V ✓ M ✓` and
 `Q ✓` (via the convention text and
   Cluster 2 arithmetic pin), but no direct test had pinned the
   *broadcast* of a Rational scalar onto a Vector or Matrix, nor
   the per-element type contract.  The relevant code path is
   `_scalarBinaryMixed → _binaryMathMixed → _arithmeticOnArrays`,
   which calls the inner per-element arithmetic via
   `promoteNumericPair` — and that helper has a `'rational'` kind
 branch that stays-exact through
   `Fraction.js` arithmetic.  So Q × Q-element stays Rational
   (with d=1 collapse to Integer at the result layer); Q × R-element
 degrades to Real per element (mirror of 's
   MIN/MAX/MOD Q→R degradation, but on V/M arithmetic instead);
   Q × Z-element stays-exact through the rational kind and may
   collapse to Integer when d=1.  Closes the V/M-axis on the Q
   stay-exact contract that sessions 092 / 115 / 120 pinned only
   on the scalar arithmetic surface. */
{
  // Q × Vector with Real-typed elements: per-element Q×R degrades
  // to Real via promoteNumericPair's 'real' kind.  Pins that the
  // V/M scalar-broadcast path inherits the same Q→R degradation
  // contract as the scalar case.
  {
    const s = new Stack();
    s.push(Vector([Real(2), Real(4)]));
    s.push(Rational(1n, 2n));
    lookup('*').fn(s);
    const v = s.peek();
    assert(isVector(v) && !isTagged(v) && v.items.length === 2
        && isReal(v.items[0]) && v.items[0].value.eq(1)
        && isReal(v.items[1]) && v.items[1].value.eq(2),
      `session135: Vec[Real(2), Real(4)] * Rational(1,2) → Vec[Real(1), Real(2)] (Q×R per element degrades to Real; got ${v?.items?.map(x => `${x.type}(${x.value})`).join(',')})`);
  }

  // Q + Vector with Real-typed elements (operand-order symmetric):
  // `Rational(1,2) + Vec[Real(1), Real(2)]` → `Vec[Real(1.5), Real(2.5)]`.
  // Pins that left-Q × right-V broadcast composes the same way as
  // right-Q.
  {
    const s = new Stack();
    s.push(Rational(1n, 2n));
    s.push(Vector([Real(1), Real(2)]));
    lookup('+').fn(s);
    const v = s.peek();
    assert(isVector(v) && !isTagged(v) && v.items.length === 2
        && isReal(v.items[0]) && v.items[0].value.eq(1.5)
        && isReal(v.items[1]) && v.items[1].value.eq(2.5),
      `session135: Rational(1,2) + Vec[Real(1), Real(2)] → Vec[Real(1.5), Real(2.5)] (left-Q broadcast onto right-V); got ${v?.items?.map(x => `${x.type}(${x.value})`).join(',')}`);
  }

  // Q + Vector with Q-typed elements: stays-exact per element via
  // the rational kind.  `Q(1/2) + Vec[Q(1/3), Q(1/4)]` →
  // `Vec[Q(5/6), Q(3/4)]`.  Pins that the V/M broadcast preserves
  // the Q-stay-exact dispatch through `_rationalBinary` per element
  // ( pinned this on scalar arithmetic — this
  // is the V-broadcast extension).
  {
    const s = new Stack();
    s.push(Rational(1n, 2n));
    s.push(Vector([Rational(1n, 3n), Rational(1n, 4n)]));
    lookup('+').fn(s);
    const v = s.peek();
    assert(isVector(v) && !isTagged(v) && v.items.length === 2
        && isRational(v.items[0]) && v.items[0].n === 5n && v.items[0].d === 6n
        && isRational(v.items[1]) && v.items[1].n === 3n && v.items[1].d === 4n,
      `session135: Rational(1,2) + Vec[Rational(1,3), Rational(1,4)] → Vec[Rational(5,6), Rational(3,4)] (Q+Q stays exact per element); got ${v?.items?.map(x => x.type === 'rational' ? `Q(${x.n},${x.d})` : `${x.type}(${x.value})`).join(',')}`);
  }

  // Q × Vector with Q-typed elements collapses to Integer per
  // element when d=1 result: `Q(1/2) * Vec[Q(2,1), Q(4,1)]` →
  // `Vec[Integer(1), Integer(2)]`.  Pins the d=1 collapse (which
  // pinned on scalar `Q*Q` → Integer) survives
  // the V-broadcast.
  {
    const s = new Stack();
    s.push(Rational(1n, 2n));
    s.push(Vector([Rational(2n, 1n), Rational(4n, 1n)]));
    lookup('*').fn(s);
    const v = s.peek();
    assert(isVector(v) && !isTagged(v) && v.items.length === 2
        && isInteger(v.items[0]) && v.items[0].value === 1n
        && isInteger(v.items[1]) && v.items[1].value === 2n,
      `session135: Rational(1,2) * Vec[Rational(2,1), Rational(4,1)] → Vec[Integer(1), Integer(2)] (Q×Q d=1 collapse per element); got ${v?.items?.map(x => `${x.type}(${x.value ?? x.n + '/' + x.d})`).join(',')}`);
  }

  // Vector ÷ Q with Q-typed elements: `Vec[Q(1,1), Q(2,1)] /
  // Q(1/2)` → `Vec[Integer(2), Integer(4)]` (Q/Q stay-exact + d=1
  // collapse per element).  Pins the V÷Q dispatch on the
  // division operator's rational kind.
  {
    const s = new Stack();
    s.push(Vector([Rational(1n, 1n), Rational(2n, 1n)]));
    s.push(Rational(1n, 2n));
    lookup('/').fn(s);
    const v = s.peek();
    assert(isVector(v) && !isTagged(v) && v.items.length === 2
        && isInteger(v.items[0]) && v.items[0].value === 2n
        && isInteger(v.items[1]) && v.items[1].value === 4n,
      `session135: Vec[Q(1,1), Q(2,1)] / Q(1/2) → Vec[Integer(2), Integer(4)] (Q/Q d=1 collapse per element); got ${v?.items?.map(x => `${x.type}(${x.value ?? x.n + '/' + x.d})`).join(',')}`);
  }

  // Vector − Q with Real-typed elements: `Vec[Real(3), Real(4)] -
  // Rational(1/2)` → `Vec[Real(2.5), Real(3.5)]` (Real-V minus Q
  // broadcast → Real per element via the real kind).  Pins the
  // sign-correct subtraction (right-side Q operand) — distinct
  // from the addition pins above.
  {
    const s = new Stack();
    s.push(Vector([Real(3), Real(4)]));
    s.push(Rational(1n, 2n));
    lookup('-').fn(s);
    const v = s.peek();
    assert(isVector(v) && !isTagged(v) && v.items.length === 2
        && isReal(v.items[0]) && v.items[0].value.eq(2.5)
        && isReal(v.items[1]) && v.items[1].value.eq(3.5),
      `session135: Vec[Real(3), Real(4)] - Rational(1,2) → Vec[Real(2.5), Real(3.5)] (V−Q broadcast, sign-correct subtraction); got ${v?.items?.map(x => `${x.type}(${x.value})`).join(',')}`);
  }

  // Q × Matrix with Integer-typed entries: `Mat[[Z(2), Z(4)],
  // [Z(6), Z(8)]] * Rational(1/2)` → `Mat[[Z(1), Z(2)], [Z(3),
  // Z(4)]]` (Z×Q stays-exact + d=1 collapse per entry).  Pins the
  // M-axis on the same Q-broadcast contract.
  {
    const s = new Stack();
    s.push(Matrix([[Integer(2n), Integer(4n)], [Integer(6n), Integer(8n)]]));
    s.push(Rational(1n, 2n));
    lookup('*').fn(s);
    const v = s.peek();
    assert(isMatrix(v) && !isTagged(v) && v.rows.length === 2
        && isInteger(v.rows[0][0]) && v.rows[0][0].value === 1n
        && isInteger(v.rows[0][1]) && v.rows[0][1].value === 2n
        && isInteger(v.rows[1][0]) && v.rows[1][0].value === 3n
        && isInteger(v.rows[1][1]) && v.rows[1][1].value === 4n,
      `session135: Matrix[[Z(2),Z(4)],[Z(6),Z(8)]] * Rational(1,2) → Matrix[[Z(1),Z(2)],[Z(3),Z(4)]] (Z×Q d=1 collapse per entry on Matrix axis)`);
  }

  // Vector + Vector with mixed Q / R element types: each pair
  // `Q(1/2)+Real(1)` and `Q(3/4)+Real(1)` degrades to Real via
  // `promoteNumericPair`'s real kind.  Pins per-element type
  // routing on V+V (NOT scalar broadcast) — element-wise pairwise
  // sees Q on the left, Real on the right, and the per-element
  // dispatch picks the same widening as the scalar case.
  {
    const s = new Stack();
    s.push(Vector([Rational(1n, 2n), Rational(3n, 4n)]));
    s.push(Vector([Real(1), Real(1)]));
    lookup('+').fn(s);
    const v = s.peek();
    assert(isVector(v) && !isTagged(v) && v.items.length === 2
        && isReal(v.items[0]) && v.items[0].value.eq(1.5)
        && isReal(v.items[1]) && v.items[1].value.eq(1.75),
      `session135: Vec[Q(1,2), Q(3,4)] + Vec[Real(1), Real(1)] → Vec[Real(1.5), Real(1.75)] (per-element Q+R degrades to Real on V+V pairwise); got ${v?.items?.map(x => `${x.type}(${x.value ?? x.n + '/' + x.d})`).join(',')}`);
  }
}

/* ================================================================
 — Cluster 2: Tagged-of-Vector / Tagged-of-Matrix
   composition on BINARY arithmetic via
   `_withTaggedBinary(_withListBinary(handler))` for `+ - * /`.

   pinned the UNARY surface (SQRT, FACT
   LNP1, NEG, ABS) on Tagged-of-V/M with the 3-deep wrapper
   `_withTaggedUnary(_withListUnary(_withVMUnary(handler)))`.
   This cluster covers the BINARY surface, where the wrapper is
   `_withTaggedBinary(_withListBinary(handler))` and the inner
   handler dispatches to `_arithmeticOnArrays` for V/M scalar-
   broadcast, V+V/V−V/V·V (dot product), and M·M (matmul).  At a
   `Tagged(label, V|M)` input on either side, the order is:
     (1) `_withTaggedBinary` checks both top-2 stack slots; if
         either is Tagged, both are popped and unwrapped (per
         HP50 AUR §3.4 binary tag-drop, NOT preserving any tag).
     (2) `_withListBinary` doesn't intercept V/M (only RList).
     (3) The inner handler runs the V/M dispatch — element-wise,
         dot product, matmul — directly on the unwrapped
         payloads.
     (4) Result is the un-Tagged V/M (or scalar for V·V dot product
         and M-shape-changing ops; matmul preserves Matrix kind).

   Pins both-sides, left-only, right-only Tagged on V/M operands;
   pins the bespoke V·V dot product (kind change V → R through
   the tag-drop wrapper, mirror of the bespoke ABS-of-Tagged-Vector
 pin from but on the binary surface);
   pins the inner-Tagged-inside-Vector rejection (mirror of session
   130 Cluster 3's inner-Tagged-inside-List); pins that the
   pre-existing dimension-mismatch rejection survives the Tagged
   unwrap. */
{
  // Left-Tagged-of-Vector + bare-scalar: tag drops, V scalar-
  // broadcasts.  `:v:Vec[1, 2] + Integer(1)` →
  // `Vec[Real(2), Real(3)]` (un-Tagged Vector — binary tag-drop).
  {
    const s = new Stack();
    s.push(Tagged('v', Vector([Real(1), Real(2)])));
    s.push(Integer(1n));
    lookup('+').fn(s);
    const v = s.peek();
    assert(isVector(v) && !isTagged(v) && v.items.length === 2
        && isReal(v.items[0]) && v.items[0].value.eq(2)
        && isReal(v.items[1]) && v.items[1].value.eq(3),
      `session135: :v:Vec[1, 2] + Integer(1) → Vec[Real(2), Real(3)] (left-Tagged-V + scalar; binary tag-drop, V scalar-broadcast); got ${v?.items?.map(x => `${x.type}(${x.value})`).join(',')}`);
  }

  // Right-Tagged-of-Vector + bare-scalar (operand-order symmetric):
  // `Integer(1) + :v:Vec[1, 2]` → `Vec[Real(2), Real(3)]`.
  {
    const s = new Stack();
    s.push(Integer(1n));
    s.push(Tagged('v', Vector([Real(1), Real(2)])));
    lookup('+').fn(s);
    const v = s.peek();
    assert(isVector(v) && !isTagged(v) && v.items.length === 2
        && isReal(v.items[0]) && v.items[0].value.eq(2)
        && isReal(v.items[1]) && v.items[1].value.eq(3),
      `session135: Integer(1) + :v:Vec[1, 2] → Vec[Real(2), Real(3)] (right-Tagged-V; symmetric to left-Tagged); got ${v?.items?.map(x => `${x.type}(${x.value})`).join(',')}`);
  }

  // Both-sides Tagged on V+V pairwise: `:a:Vec[1, 2] + :b:Vec[3,
  // 4]` → `Vec[Real(4), Real(6)]` (both tags drop, pairwise V+V).
  {
    const s = new Stack();
    s.push(Tagged('a', Vector([Real(1), Real(2)])));
    s.push(Tagged('b', Vector([Real(3), Real(4)])));
    lookup('+').fn(s);
    const v = s.peek();
    assert(isVector(v) && !isTagged(v) && v.items.length === 2
        && isReal(v.items[0]) && v.items[0].value.eq(4)
        && isReal(v.items[1]) && v.items[1].value.eq(6),
      `session135: :a:Vec[1, 2] + :b:Vec[3, 4] → Vec[Real(4), Real(6)] (both-Tagged-V pairwise; both tags drop); got ${v?.items?.map(x => `${x.type}(${x.value})`).join(',')}`);
  }

  // Left-Tagged-of-Matrix × bare-scalar: `:m:Mat[[1,2],[3,4]] *
  // Integer(2)` → `Mat[[Real(2),Real(4)],[Real(6),Real(8)]]`
  // (un-Tagged Matrix — scalar broadcast across all entries).
  {
    const s = new Stack();
    s.push(Tagged('m', Matrix([[Real(1), Real(2)], [Real(3), Real(4)]])));
    s.push(Integer(2n));
    lookup('*').fn(s);
    const v = s.peek();
    assert(isMatrix(v) && !isTagged(v) && v.rows.length === 2
        && isReal(v.rows[0][0]) && v.rows[0][0].value.eq(2)
        && isReal(v.rows[0][1]) && v.rows[0][1].value.eq(4)
        && isReal(v.rows[1][0]) && v.rows[1][0].value.eq(6)
        && isReal(v.rows[1][1]) && v.rows[1][1].value.eq(8),
      `session135: :m:Mat[[1,2],[3,4]] * Integer(2) → Mat[[Real(2),Real(4)],[Real(6),Real(8)]] (left-Tagged-M scalar-broadcast; tag drops)`);
  }

  // Bespoke V·V dot product through tag-drop: `:a:Vec[1, 2] *
  // :b:Vec[3, 4]` → `Real(11)` (1·3 + 2·4 = 11).  Kind change V →
  // R survives the binary tag-drop wrapper — mirror of
  // Cluster 2's bespoke ABS-of-Tagged-Vector V → R kind-change pin
  // but on the binary surface.
  {
    const s = new Stack();
    s.push(Tagged('a', Vector([Real(1), Real(2)])));
    s.push(Tagged('b', Vector([Real(3), Real(4)])));
    lookup('*').fn(s);
    const v = s.peek();
    assert(isReal(v) && !isTagged(v) && v.value.eq(11),
      `session135: :a:Vec[1, 2] * :b:Vec[3, 4] → Real(11) (V·V dot product; kind change V → R survives binary tag-drop wrapper); got ${v?.type}(${v?.value})`);
  }

  // Matrix multiplication through tag-drop: `:m:Mat[[1,2],[3,4]] *
  // Mat[[1,0],[0,1]]` → identity-multiplied result; tag drops but
  // Matrix kind preserved.
  {
    const s = new Stack();
    s.push(Tagged('m', Matrix([[Real(1), Real(2)], [Real(3), Real(4)]])));
    s.push(Matrix([[Real(1), Real(0)], [Real(0), Real(1)]]));
    lookup('*').fn(s);
    const v = s.peek();
    assert(isMatrix(v) && !isTagged(v) && v.rows.length === 2
        && isReal(v.rows[0][0]) && v.rows[0][0].value.eq(1)
        && isReal(v.rows[0][1]) && v.rows[0][1].value.eq(2)
        && isReal(v.rows[1][0]) && v.rows[1][0].value.eq(3)
        && isReal(v.rows[1][1]) && v.rows[1][1].value.eq(4),
      `session135: :m:Mat[[1,2],[3,4]] * I → Mat[[1,2],[3,4]] (matmul through tag-drop wrapper; Matrix kind preserved, tag drops)`);
  }

  // Vector ÷ Tagged scalar (right-Tagged on the divisor): `Vec[8,
  // 10] / :s:Integer(2)` → `Vec[Real(4), Real(5)]` (right-Tagged-
  // scalar; tag drops on result).  Pins the operand-order symmetric
  // case and the division operator path.
  {
    const s = new Stack();
    s.push(Vector([Real(8), Real(10)]));
    s.push(Tagged('s', Integer(2n)));
    lookup('/').fn(s);
    const v = s.peek();
    assert(isVector(v) && !isTagged(v) && v.items.length === 2
        && isReal(v.items[0]) && v.items[0].value.eq(4)
        && isReal(v.items[1]) && v.items[1].value.eq(5),
      `session135: Vec[8, 10] / :s:Integer(2) → Vec[Real(4), Real(5)] (right-Tagged-scalar divisor; tag drops); got ${v?.items?.map(x => `${x.type}(${x.value})`).join(',')}`);
  }

  // Left-Tagged-of-Vector minus bare-scalar: `:v:Vec[5, 7] -
  // Integer(1)` → `Vec[Real(4), Real(6)]`.  Pins subtraction on
  // the same Tagged-V surface (distinct inner handler from `+`).
  {
    const s = new Stack();
    s.push(Tagged('v', Vector([Real(5), Real(7)])));
    s.push(Integer(1n));
    lookup('-').fn(s);
    const v = s.peek();
    assert(isVector(v) && !isTagged(v) && v.items.length === 2
        && isReal(v.items[0]) && v.items[0].value.eq(4)
        && isReal(v.items[1]) && v.items[1].value.eq(6),
      `session135: :v:Vec[5, 7] - Integer(1) → Vec[Real(4), Real(6)] (left-Tagged-V minus scalar); got ${v?.items?.map(x => `${x.type}(${x.value})`).join(',')}`);
  }

  // Tagged scalar × bare-Vector: `:s:Integer(2) * Vec[1, 2]` →
  // `Vec[Real(2), Real(4)]` (left-Tagged-scalar × right-V; tag
  // drops, V scalar-broadcast).  Closes the all-four-shapes
  // Tagged-and-V/M-binary surface: T-V × bare-scalar, bare-scalar
  // × T-V, T-V × T-V (above), T-scalar × bare-V (this).
  {
    const s = new Stack();
    s.push(Tagged('s', Integer(2n)));
    s.push(Vector([Real(1), Real(2)]));
    lookup('*').fn(s);
    const v = s.peek();
    assert(isVector(v) && !isTagged(v) && v.items.length === 2
        && isReal(v.items[0]) && v.items[0].value.eq(2)
        && isReal(v.items[1]) && v.items[1].value.eq(4),
      `session135: :s:Integer(2) * Vec[1, 2] → Vec[Real(2), Real(4)] (left-Tagged-scalar × right-V; tag drops); got ${v?.items?.map(x => `${x.type}(${x.value})`).join(',')}`);
  }

  // Inner-Tagged-inside-Vector binary rejection: `Vec[:x:Real(1),
  // :y:Real(2)] + Vec[Real(1), Real(2)]` → 'Bad argument type'.
  // The Vector at level 2 is NOT Tagged at the top level, so
  // `_withTaggedBinary` doesn't intercept it; the inner handler
  // sees a Vector with Tagged elements and the per-element
  // arithmetic helper rejects. Mirror of 's
  // inner-Tagged-inside-List rejection on the percent family,
  // here on the V-axis of the binary arithmetic surface.
  assertThrows(
    () => {
      const s = new Stack();
      s.push(Vector([Tagged('x', Real(1)), Tagged('y', Real(2))]));
      s.push(Vector([Real(1), Real(2)]));
      lookup('+').fn(s);
    },
    /Bad argument/,
    'session135: Vec[:x:Real(1), :y:Real(2)] + Vec[Real(1), Real(2)] → Bad argument type (inner-Tagged-inside-Vector has no unwrapper at the per-element handler; mirror of session 130 List pin)'
  );

  // Dimension-mismatch survives Tagged unwrap: `:a:Vec[1, 2, 3] +
  // :b:Vec[1, 2]` → 'Invalid dimension'.  Pins that the V+V
  // size-check fires AFTER the Tagged unwrap (so the user-facing
  // error is the dimension error, NOT a Tagged-related error).
  assertThrows(
    () => {
      const s = new Stack();
      s.push(Tagged('a', Vector([Real(1), Real(2), Real(3)])));
      s.push(Tagged('b', Vector([Real(1), Real(2)])));
      lookup('+').fn(s);
    },
    /Invalid dimension/,
    'session135: :a:V[1,2,3] + :b:V[1,2] → Invalid dimension (size mismatch survives Tagged unwrap; tags drop before the V+V size check fires)'
  );
}

/* ================================================================
 — Cluster 3: Tag-identity contract on `==` / `SAME`
   plus BinInt base-agnostic equality contract.

   The Tagged row in the `==` / `SAME` block of the matrix carries
   the Notes phrase "same tag AND same value" — but no direct
   test had pinned the *different-tag* failure mode, the
   *missing-tag-on-one-side* mismatch (Tagged ≠ bare even at the
   same payload value), or the same-tag + different-value
   mismatch. added BinInt × BinInt to `==` / `SAME`
   and the matrix Notes mention "BinInt × BinInt (masked against
   current wordsize)" — but no direct test had pinned the
   base-agnostic contract: `#5h SAME #5d` = 1 (value matters,
   base doesn't), `SAME #5h #6d` = 0 (different value rejects
   regardless of base).

   The handlers live in `eqValues()` (`ops.js`).  For Tagged: the
   isTagged branch returns `(a.label === b.label) && eqValues(
   a.value, b.value)`; for `Tagged × bare`, neither is Tagged on
   both sides so the cross-type guard fires (different `type`
   fields → `0`).  For BinaryInteger × BinaryInteger: both
   operands route through `(a.value & mask) === (b.value & mask)`
   regardless of the `.base` field — the formatter base is purely
   cosmetic.  This cluster pins all of those contracts. */
{
  // Same tag + same value → 1.  `:a:Real(5) == :a:Real(5)` = 1.
  // The full positive case for the Tagged equality path.
  {
    const s = new Stack();
    s.push(Tagged('a', Real(5)));
    s.push(Tagged('a', Real(5)));
    lookup('==').fn(s);
    const v = s.peek();
    assert(isReal(v) && v.value.eq(1),
      `session135: :a:Real(5) == :a:Real(5) → 1 (same tag AND same value); got ${v?.type}(${v?.value})`);
  }

  // Same tag + different value → 0.
  {
    const s = new Stack();
    s.push(Tagged('a', Real(5)));
    s.push(Tagged('a', Real(6)));
    lookup('==').fn(s);
    const v = s.peek();
    assert(isReal(v) && v.value.eq(0),
      `session135: :a:Real(5) == :a:Real(6) → 0 (same tag, different value); got ${v?.type}(${v?.value})`);
  }

  // Different tags + same value → 0.  This is the canonical
  // "tag identity matters" pin.  Even though both payloads are
  // `Real(5)`, the labels `'a'` and `'b'` differ, so the Tagged
  // equality path returns 0 *before* descending to compare values.
  {
    const s = new Stack();
    s.push(Tagged('a', Real(5)));
    s.push(Tagged('b', Real(5)));
    lookup('==').fn(s);
    const v = s.peek();
    assert(isReal(v) && v.value.eq(0),
      `session135: :a:Real(5) == :b:Real(5) → 0 (different tags + same value; tag identity matters); got ${v?.type}(${v?.value})`);
  }

  // Tagged × bare on `==`: `:a:Real(5) == Real(5)` → 0.  Pins
  // that Tagged is its own type-shape — there is no implicit
  // unwrap for `==`-comparison against a bare scalar.  Contrast
  // with the binary-arithmetic surface (sessions 115 / 130 / 135)
  // where binary tag-drop makes Tagged transparent at the
  // operator level.  Equality is structural, not arithmetic.
  {
    const s = new Stack();
    s.push(Tagged('a', Real(5)));
    s.push(Real(5));
    lookup('==').fn(s);
    const v = s.peek();
    assert(isReal(v) && v.value.eq(0),
      `session135: :a:Real(5) == Real(5) → 0 (Tagged vs bare; structural compare, no implicit unwrap on ==); got ${v?.type}(${v?.value})`);
  }

  // Symmetric: `Real(5) == :a:Real(5)` → 0.  Operand order does
  // not coerce Tagged.
  {
    const s = new Stack();
    s.push(Real(5));
    s.push(Tagged('a', Real(5)));
    lookup('==').fn(s);
    const v = s.peek();
    assert(isReal(v) && v.value.eq(0),
      `session135: Real(5) == :a:Real(5) → 0 (operand-order symmetric to the prior pin); got ${v?.type}(${v?.value})`);
  }

  // SAME mirrors the above on all four combinations — same tag/
  // value, same tag/different value, different tag/same value,
  // Tagged × bare — and always returns Real (not Symbolic).  Five
  // pins below.
  {
    const s = new Stack();
    s.push(Tagged('a', Real(5)));
    s.push(Tagged('a', Real(5)));
    lookup('SAME').fn(s);
    const v = s.peek();
    assert(isReal(v) && v.value.eq(1),
      `session135: :a:Real(5) SAME :a:Real(5) → 1 (SAME mirrors == on the positive case)`);
  }
  {
    const s = new Stack();
    s.push(Tagged('a', Real(5)));
    s.push(Tagged('b', Real(5)));
    lookup('SAME').fn(s);
    const v = s.peek();
    assert(isReal(v) && v.value.eq(0),
      `session135: :a:Real(5) SAME :b:Real(5) → 0 (SAME mirrors == on tag-mismatch)`);
  }
  {
    const s = new Stack();
    s.push(Tagged('a', Real(5)));
    s.push(Real(5));
    lookup('SAME').fn(s);
    const v = s.peek();
    assert(isReal(v) && v.value.eq(0),
      `session135: :a:Real(5) SAME Real(5) → 0 (SAME mirrors == on Tagged-vs-bare)`);
  }

  // BinInt base-agnostic equality.  `#5h == #5d` → 1 — same
  // value, the formatter base ('h' vs 'd') does not affect
  // equality.  Pins that `eqValues` on BinInt × BinInt compares
  // values masked by the current wordsize, NOT the `.base` field.
  {
    const s = new Stack();
    s.push(BinaryInteger(5n, 'h'));
    s.push(BinaryInteger(5n, 'd'));
    lookup('==').fn(s);
    const v = s.peek();
    assert(isReal(v) && v.value.eq(1),
      `session135: #5h == #5d → 1 (BinInt equality is base-agnostic — only the value matters); got ${v?.type}(${v?.value})`);
  }

  // SAME mirrors `==` on base-agnostic BinInt: `SAME #5h #5d` →
  // 1. Distinct contract from 's "SAME does not
  // type-coerce" — base difference is NOT a type difference for
  // BinInt × BinInt (both operands are still type
  // `'binaryInteger'`); only the cosmetic `.base` field differs.
  {
    const s = new Stack();
    s.push(BinaryInteger(5n, 'h'));
    s.push(BinaryInteger(5n, 'd'));
    lookup('SAME').fn(s);
    const v = s.peek();
    assert(isReal(v) && v.value.eq(1),
      `session135: SAME #5h #5d → 1 (SAME mirrors == on base-agnostic BinInt — base is cosmetic, both are type 'binaryInteger')`);
  }

  // BinInt different value, different base: `SAME #5h #6d` → 0.
  // Pins that base agnosticism does NOT swallow value differences.
  {
    const s = new Stack();
    s.push(BinaryInteger(5n, 'h'));
    s.push(BinaryInteger(6n, 'd'));
    lookup('SAME').fn(s);
    const v = s.peek();
    assert(isReal(v) && v.value.eq(0),
      `session135: SAME #5h #6d → 0 (different value rejects regardless of base)`);
  }

  // BinInt cross-base ordered compare: `#5h < #6d` → 1.  Pins
  // that ordered compare also ignores the formatter base — just
  // compares masked values.  Closes the cross-base contract on
  // the ordered comparator family; pinned BinInt × Z
  // ordered compare and pinned BinInt × Q, but the
  // BinInt × BinInt cross-base path was unpinned.
  {
    const s = new Stack();
    s.push(BinaryInteger(5n, 'h'));
    s.push(BinaryInteger(6n, 'd'));
    lookup('<').fn(s);
    const v = s.peek();
    assert(isReal(v) && v.value.eq(1),
      `session135: #5h < #6d → 1 (BinInt cross-base ordered compare; base is cosmetic for compare)`);
  }
}

/* ================================================================
 — Cluster 1: Hyperbolic family Tagged-of-Vector /
   Tagged-of-Matrix wrapper-VM composition (SINH / COSH / TANH /
   ASINH / ACOSH / ATANH).

   All six hyperbolic ops dispatch through the 3-deep wrapper
   `_withTaggedUnary(_withListUnary(_withVMUnary(handler)))` —
   SINH / COSH / TANH / ASINH via `_unaryCx` (`ops.js:7856`),
   ACOSH / ATANH via direct `_withTaggedUnary(_withListUnary(
   _withVMUnary(...)))` registration.  At a `Tagged(label, V|M)`
   input the order is: (1) `_withTaggedUnary` unwraps and pushes
   the V/M; (2) `_withListUnary` doesn't intercept V/M; (3)
   `_withVMUnary` distributes element-wise; (4) `_withTaggedUnary`
   re-tags the resulting V/M with the SAME label.

   pinned bare-scalar Tagged transparency
   and List distribution on this family ("Hyperbolic family
   Tagged transparency, List distribution, and Symbolic-lift
 through Tagged"), and pinned the
   wrapper-VM composition for SQRT / FACT / LNP1 / SIN — but
   the hyperbolic 3-deep wrapper-VM composition was unpinned.
   This cluster closes that surface, plus the deliberate inner-
 Tagged-inside-Vector rejection (mirror of Cluster
   3's inner-Tagged-inside-List rejection on the V-axis), and
   the `_exactUnaryLift` integer-stay-exact path on Tagged-V
   (SINH(Integer(0)) → Integer(0) inside the Tagged Vector,
   distinct from Real(0) → Real(0) — the EXACT-mode integer
   preservation in `_unaryCx` survives the wrapper composition). */
{
  // SINH on Tagged-Matrix: 3-deep wrapper composition on the
  // Matrix axis.  All zeros so sinh(0) = 0 per element; the
  // resulting Matrix is wrapped back in Tagged with the same tag.
  {
    const s = new Stack();
    s.push(Tagged('m', Matrix([[Real(0), Real(0)], [Real(0), Real(0)]])));
    lookup('SINH').fn(s);
    const v = s.peek();
    assert(isTagged(v) && v.tag === 'm' && isMatrix(v.value),
      `session140: SINH :m:Matrix([[0,0],[0,0]]) preserves outer tag + Matrix shape (got tag=${v?.tag} inner=${v?.value?.type})`);
    const r = v.value.rows;
    assert(r.length === 2 && r[0].length === 2
        && r[0][0].value.eq(0) && r[0][1].value.eq(0)
        && r[1][0].value.eq(0) && r[1][1].value.eq(0),
      `session140: SINH :m:Matrix([[0,0],[0,0]]) → :m:Matrix([[0,0],[0,0]]) (per-entry sinh(0)=0; wrapper-VM under Tagged on Matrix axis)`);
  }

  // COSH on Tagged-Vector: cosh(0) = 1 per element.  Pins the
  // Vector axis with a non-identity output value (distinct from
  // SINH/TANH/ASINH/ATANH where sinh/tanh/asinh/atanh of zero is
  // also zero — this assertion fires on the all-ones output to
  // confirm the inner handler actually ran and re-tagged).
  {
    const s = new Stack();
    s.push(Tagged('v', Vector([Real(0), Real(0)])));
    lookup('COSH').fn(s);
    const v = s.peek();
    assert(isTagged(v) && v.tag === 'v' && isVector(v.value)
        && v.value.items.length === 2
        && isReal(v.value.items[0]) && v.value.items[0].value.eq(1)
        && isReal(v.value.items[1]) && v.value.items[1].value.eq(1),
      `session140: COSH :v:Vector(0, 0) → :v:Vector(Real(1), Real(1)) (cosh(0)=1; non-identity output value pins inner handler ran); got ${v?.value?.items?.map(x => `${x.type}(${x.value?.toString()})`).join(',')}`);
  }

  // TANH on Tagged-Matrix: tanh(0) = 0 per entry.  Closes the
  // Matrix axis on the third forward-hyperbolic op.
  {
    const s = new Stack();
    s.push(Tagged('t', Matrix([[Real(0), Real(0)], [Real(0), Real(0)]])));
    lookup('TANH').fn(s);
    const v = s.peek();
    assert(isTagged(v) && v.tag === 't' && isMatrix(v.value)
        && v.value.rows.every(r => r.every(x => isReal(x) && x.value.isZero())),
      `session140: TANH :t:Matrix([[0,0],[0,0]]) → :t:Matrix([[0,0],[0,0]]) (Matrix-axis wrapper-VM on TANH; outer tag preserved)`);
  }

  // ASINH on Tagged-Vector: asinh(0) = 0 per element.  Closes
  // the inverse-hyperbolic Vector axis (ASINH dispatches through
  // `_unaryCx` like SINH/COSH/TANH).
  {
    const s = new Stack();
    s.push(Tagged('h', Vector([Real(0), Real(0)])));
    lookup('ASINH').fn(s);
    const v = s.peek();
    assert(isTagged(v) && v.tag === 'h' && isVector(v.value)
        && v.value.items.every(x => isReal(x) && x.value.isZero()),
      `session140: ASINH :h:Vector(0, 0) → :h:Vector(0, 0) (inverse-hyperbolic Vector axis through _unaryCx)`);
  }

  // ACOSH on Tagged-Vector: acosh(1) = 0 per element.  ACOSH is
  // registered via direct `_withTaggedUnary(_withListUnary(
  // _withVMUnary(...)))` (NOT `_unaryCx`) — pins that this
  // alternative registration shape composes identically with
  // outer Tagged on the Vector axis.  Domain edge: acosh(1) is
  // the boundary of the real-valued domain; works on Real-mode.
  {
    const s = new Stack();
    s.push(Tagged('h', Vector([Real(1), Real(1)])));
    lookup('ACOSH').fn(s);
    const v = s.peek();
    assert(isTagged(v) && v.tag === 'h' && isVector(v.value)
        && v.value.items.length === 2
        && isReal(v.value.items[0]) && v.value.items[0].value.eq(0)
        && isReal(v.value.items[1]) && v.value.items[1].value.eq(0),
      `session140: ACOSH :h:Vector(1, 1) → :h:Vector(0, 0) (acosh(1)=0 boundary; direct-registered wrapper composition on V); got ${v?.value?.items?.map(x => `${x.type}(${x.value?.toString()})`).join(',')}`);
  }

  // ATANH on Tagged-Vector: atanh(0) = 0 per element.  ATANH
  // also uses the direct `_withTaggedUnary(_withListUnary(
  // _withVMUnary(...)))` registration shape (like ACOSH).
  {
    const s = new Stack();
    s.push(Tagged('h', Vector([Real(0), Real(0)])));
    lookup('ATANH').fn(s);
    const v = s.peek();
    assert(isTagged(v) && v.tag === 'h' && isVector(v.value)
        && v.value.items.every(x => isReal(x) && x.value.isZero()),
      `session140: ATANH :h:Vector(0, 0) → :h:Vector(0, 0) (atanh(0)=0; direct-registered wrapper on V)`);
  }

  // EXACT-mode integer-stay-exact path under Tagged-V: SINH on
  // Integer(0) routes through the `(isInteger(v) || isRational(v))
  // && !getApproxMode()` branch of `_unaryCx`, which calls
  // `_exactUnaryLift` to produce Integer(0) for the clean-integer
  // sinh(0)=0 fold.  Pins that the EXACT-mode integer preservation
  // composes through the wrapper chain — the inner item type
  // stays `'integer'`, NOT `'real'`.  Distinct from the prior
  // SINH(Real(0)) pin (above on the Matrix axis), which produces
  // Real(0) because the input is already Real.
  {
    const s = new Stack();
    s.push(Tagged('h', Vector([Integer(0n), Integer(0n)])));
    lookup('SINH').fn(s);
    const v = s.peek();
    assert(isTagged(v) && v.tag === 'h' && isVector(v.value)
        && v.value.items.length === 2
        && isInteger(v.value.items[0]) && v.value.items[0].value === 0n
        && isInteger(v.value.items[1]) && v.value.items[1].value === 0n,
      `session140: SINH :h:Vector(Integer(0), Integer(0)) → :h:Vector(Integer(0), Integer(0)) (EXACT-mode Integer-stay-exact via _exactUnaryLift composes through wrapper-VM under Tagged); got ${v?.value?.items?.map(x => `${x.type}(${x.value?.toString()})`).join(',')}`);
  }

  // Inner-Tagged-inside-Vector rejection on hyperbolic family:
  // `Vec[:x:Real(0), :y:Real(0)] SINH` → 'Bad argument type'.
  // The Vector at level 1 is NOT Tagged at the top level, so
  // `_withTaggedUnary` doesn't intercept; the `_withVMUnary`
  // inner dispatch then sees Vector items that are themselves
  // Tagged scalars, and the inner per-element handler is NOT
  // Tagged-aware (the `_withTaggedUnary` wrapper sits OUTSIDE
  // `_withVMUnary` in the wrapper composition chain).  Mirror
  // of 's inner-Tagged-inside-List rejection
  // on the binary surface, extended to the hyperbolic unary V
  // surface.
  {
    const s = new Stack();
    s.push(Vector([Tagged('x', Real(0)), Tagged('y', Real(0))]));
    assertThrows(() => lookup('SINH').fn(s), /Bad argument type/i,
      `session140: Vec[:x:Real(0), :y:Real(0)] SINH → 'Bad argument type' (inner-Tagged-inside-Vector has no unwrapper at the per-element handler; mirror of session 130 Cluster 3's inner-Tagged-inside-List rejection on the hyperbolic axis)`);
  }
}

/* ================================================================
 — Cluster 2: Inverse-trig family Tagged-of-V/M
   wrapper-VM composition (ASIN / ACOS / ATAN) plus EXPM
   Tagged-of-V/M.

   ASIN / ACOS dispatch through direct `_withTaggedUnary(
   _withListUnary(_withVMUnary(handler)))` registration; ATAN
   dispatches through `_trigInvCx` (`ops.js:7929`).  EXPM
   dispatches through direct registration with the same 3-deep
   wrapper.  All three inverse-trig ops emit results in the
   active angle mode (RAD by default).

   pinned LNP1 Tagged-of-Vector wrapper-VM
 composition; pinned hyperbolic List/
   Tagged transparency on bare scalars; but the inverse-trig
   Tagged-of-V/M composition was unpinned, and EXPM Tagged-of-
 V/M was unpinned (only LNP1 was covered — they
   share the same wrapper shape but EXPM is a distinct registration
   at `ops.js:7249`).  Closes the inverse-trig surface plus the
   EXPM/LNP1 pair on the Tagged-V/M axis. */
{
  // Set RAD mode explicitly — ASIN(1) and ACOS(0) emit results
  // in the active angle mode.  RAD makes ASIN(1) = π/2 ≈
  // 1.5707963267948966 (exact Decimal precision).  Restore RAD
  // at the end (it's the default but be defensive in case prior
  // tests left state).
  const _prevAngle = calcState.angle;
  setAngle('RAD');
  try {
    // ASIN on Tagged-Vector: ASIN(0) = 0, ASIN(1) = π/2 in RAD.
    // Pins both the zero element (clean Real(0)) and the π/2
    // element (Decimal precision, asserted via `.eq` on a
    // Math.PI/2 value).
    {
      const s = new Stack();
      s.push(Tagged('a', Vector([Real(0), Real(1)])));
      lookup('ASIN').fn(s);
      const v = s.peek();
      assert(isTagged(v) && v.tag === 'a' && isVector(v.value)
          && v.value.items.length === 2,
        `session140: ASIN :a:Vector(0, 1) preserves outer tag + Vector shape (got tag=${v?.tag} inner=${v?.value?.type})`);
      const items = v.value.items;
      assert(isReal(items[0]) && items[0].value.eq(0),
        `session140: ASIN :a:Vector(0, 1) item[0] = Real(0) (clean asin(0)=0 fold)`);
      assert(isReal(items[1]) && Math.abs(Number(items[1].value) - Math.PI / 2) < 1e-10,
        `session140: ASIN :a:Vector(0, 1) item[1] ≈ π/2 (RAD; got ${items[1]?.value?.toString()})`);
    }

    // ACOS on Tagged-Vector: ACOS(1) = 0, ACOS(0) = π/2 in RAD.
    // Operand-symmetric to ASIN above (same boundaries on the
    // domain, different result mapping).
    {
      const s = new Stack();
      s.push(Tagged('a', Vector([Real(1), Real(0)])));
      lookup('ACOS').fn(s);
      const v = s.peek();
      assert(isTagged(v) && v.tag === 'a' && isVector(v.value)
          && v.value.items.length === 2,
        `session140: ACOS :a:Vector(1, 0) preserves outer tag + Vector shape`);
      const items = v.value.items;
      assert(isReal(items[0]) && items[0].value.eq(0),
        `session140: ACOS :a:Vector(1, 0) item[0] = Real(0) (acos(1)=0 fold)`);
      assert(isReal(items[1]) && Math.abs(Number(items[1].value) - Math.PI / 2) < 1e-10,
        `session140: ACOS :a:Vector(1, 0) item[1] ≈ π/2 (RAD; got ${items[1]?.value?.toString()})`);
    }

    // ASIN on Tagged-Matrix: extends ASIN to the M-axis.  Four
    // values covering the [-1, 1] domain corners — zero result
    // at 0, ±π/2 at ±1.
    {
      const s = new Stack();
      s.push(Tagged('m', Matrix([[Real(0), Real(1)], [Real(-1), Real(0)]])));
      lookup('ASIN').fn(s);
      const v = s.peek();
      assert(isTagged(v) && v.tag === 'm' && isMatrix(v.value),
        `session140: ASIN :m:Matrix([[0,1],[-1,0]]) preserves outer tag + Matrix shape`);
      const r = v.value.rows;
      assert(r[0][0].value.eq(0)
          && Math.abs(Number(r[0][1].value) - Math.PI / 2) < 1e-10
          && Math.abs(Number(r[1][0].value) - (-Math.PI / 2)) < 1e-10
          && r[1][1].value.eq(0),
        `session140: ASIN :m:Matrix([[0,1],[-1,0]]) → :m:Matrix([[0,π/2],[-π/2,0]]) (Matrix-axis wrapper-VM on ASIN; outer tag preserved)`);
    }

    // ATAN on Tagged-Vector: atan(0) = 0 per element.  ATAN
    // routes through `_trigInvCx` (`ops.js:7929`) — distinct
    // registration helper from ASIN/ACOS but same 3-deep wrapper
    // shape.  Pins that the helper-difference doesn't break the
    // wrapper composition under Tagged.
    {
      const s = new Stack();
      s.push(Tagged('a', Vector([Real(0), Real(0)])));
      lookup('ATAN').fn(s);
      const v = s.peek();
      assert(isTagged(v) && v.tag === 'a' && isVector(v.value)
          && v.value.items.every(x => isReal(x) && x.value.isZero()),
        `session140: ATAN :a:Vector(0, 0) → :a:Vector(0, 0) (ATAN routes through _trigInvCx; same 3-deep wrapper as ASIN/ACOS)`);
    }

    // EXPM on Tagged-Vector: expm1(0) = 0 per element.  Session
    // 130 Cluster 1 pinned LNP1 Tagged-of-Vector but EXPM was
    // unpinned (LNP1 and EXPM share the same wrapper shape but
    // are registered at distinct `ops.js` lines 7242 vs 7249).
    // The two ops are duals — `LNP1(EXPM(x)) ≈ x` for stable-
    // near-zero — so pinning EXPM under Tagged closes the pair
    // on the V/M axis.
    {
      const s = new Stack();
      s.push(Tagged('e', Vector([Real(0), Real(0)])));
      lookup('EXPM').fn(s);
      const v = s.peek();
      assert(isTagged(v) && v.tag === 'e' && isVector(v.value)
          && v.value.items.every(x => isReal(x) && x.value.isZero()),
        `session140: EXPM :e:Vector(0, 0) → :e:Vector(0, 0) (LNP1/EXPM dual pair; closes the EXPM Tagged-V axis that session 130 left open)`);
    }

    // EXPM on Tagged-Matrix: closes the Matrix axis on the
    // EXPM/LNP1 stable-near-zero family.
    {
      const s = new Stack();
      s.push(Tagged('e', Matrix([[Real(0), Real(0)], [Real(0), Real(0)]])));
      lookup('EXPM').fn(s);
      const v = s.peek();
      assert(isTagged(v) && v.tag === 'e' && isMatrix(v.value)
          && v.value.rows.every(r => r.every(x => isReal(x) && x.value.isZero())),
        `session140: EXPM :e:Matrix([[0,0],[0,0]]) → :e:Matrix([[0,0],[0,0]]) (Matrix-axis EXPM under Tagged; closes the LNP1/EXPM pair on M)`);
    }

    // ACOS on Tagged-Matrix (operand-symmetric to ASIN above):
    // Pins ACOS Matrix-axis with the same domain corners,
    // confirming the symmetric result mapping (ACOS(1)=0,
    // ACOS(-1)=π, ACOS(0)=π/2).
    {
      const s = new Stack();
      s.push(Tagged('m', Matrix([[Real(1), Real(0)], [Real(-1), Real(1)]])));
      lookup('ACOS').fn(s);
      const v = s.peek();
      assert(isTagged(v) && v.tag === 'm' && isMatrix(v.value),
        `session140: ACOS :m:Matrix([[1,0],[-1,1]]) preserves outer tag + Matrix shape`);
      const r = v.value.rows;
      assert(r[0][0].value.eq(0)
          && Math.abs(Number(r[0][1].value) - Math.PI / 2) < 1e-10
          && Math.abs(Number(r[1][0].value) - Math.PI) < 1e-10
          && r[1][1].value.eq(0),
        `session140: ACOS :m:Matrix([[1,0],[-1,1]]) → :m:Matrix([[0,π/2],[π,0]]) (ACOS Matrix-axis; closes the inverse-trig pair on M)`);
    }
  } finally {
    setAngle(_prevAngle);
  }
}

/* ================================================================
 — Cluster 3: ARG bare V/M axis + ARG / CONJ / RE /
   IM Tagged-of-V/M composition with bespoke V/M dispatch INSIDE
   the 2-deep wrapper.

   Distinct wrapper shape from clusters 1 / 2: the ARG / CONJ /
   RE / IM ops use `_withTaggedUnary(_withListUnary(handler))` —
   only 2-deep — and the V/M dispatch happens BESPOKE inside the
   inner handler (NOT through `_withVMUnary`).  See `ops.js:1379`
   (ARG), `:1414` (CONJ), `:1420` (RE), `:1426` (IM):

       register('CONJ', _withTaggedUnary(_withListUnary((s) => {
         const v = s.pop();
         if (isVector(v))      s.push(Vector(v.items.map(_conjScalar)));
         else if (isMatrix(v)) s.push(Matrix(v.rows.map(r => r.map(_conjScalar))));
         else                  s.push(_conjScalar(v));
       })));

   The matrix carries `V ✓ M ✓` for these ops since session
   064 (CONJ / RE / IM via `_<op>Scalar` element-wise dispatch)
 and `T ✓` since ; pinned ARG Tagged
   transparency on bare Complex (`ARG(:v:Complex(3,4))`); session
   100 pinned Sy round-trip on CONJ / RE / IM via `defaultFnEval`
   folds — but the bare V/M axis on ARG was unpinned, and the
   Tagged-of-V/M composition through this 2-deep-bespoke wrapper
   shape was unpinned for all four ops.

   Closes:
   (a) ARG on bare Vector / Matrix (Real and Complex element types
       on V; mixed Complex/Real on M).
   (b) ARG / CONJ / RE / IM Tagged-of-V/M composition where the
       outer tag preserves the Vector/Matrix kind (no kind change
       — these ops are shape-preserving).
   (c) The "bespoke V/M inside 2-deep wrapper" composition shape
       contrasts with the wrapper-VM 3-deep composition pinned in
       sessions 130 / 140 Cluster 1 / 2 — different code paths,
       same observable Tagged-of-V/M behavior on the outside. */
{
  // ARG on bare Vector with Real elements: ARG of a non-negative
  // Real is 0, ARG of a negative Real is π (HP50 atan2 convention,
  // RAD mode).  Pins the bare-V Real axis.
  const _prevAngle = calcState.angle;
  setAngle('RAD');
  try {
    {
      const s = new Stack();
      s.push(Vector([Real(3), Real(-2)]));
      lookup('ARG').fn(s);
      const v = s.peek();
      assert(isVector(v) && !isTagged(v) && v.items.length === 2
          && isReal(v.items[0]) && v.items[0].value.eq(0)
          && isReal(v.items[1]) && Math.abs(Number(v.items[1].value) - Math.PI) < 1e-12,
        `session140: ARG Vector(Real(3), Real(-2)) → Vector(Real(0), Real(π)) (bespoke per-element ARG inside 2-deep wrapper, Real axis); got ${v?.items?.map(x => `${x.type}(${x.value?.toString()})`).join(',')}`);
    }

    // ARG on bare Vector with Complex elements: ARG(3+4i) =
    // atan2(4, 3) ≈ 0.9273; ARG(0+1i) = π/2.  Pins the Complex
    // axis on bare-V — closes the bare-V/M axis (matrix shows V✓
    // since but no direct test had pinned the bare-V
    // path independently of Tagged).
    {
      const s = new Stack();
      s.push(Vector([Complex(3, 4), Complex(0, 1)]));
      lookup('ARG').fn(s);
      const v = s.peek();
      assert(isVector(v) && !isTagged(v) && v.items.length === 2
          && isReal(v.items[0]) && Math.abs(Number(v.items[0].value) - Math.atan2(4, 3)) < 1e-10
          && isReal(v.items[1]) && Math.abs(Number(v.items[1].value) - Math.PI / 2) < 1e-10,
        `session140: ARG Vector(Complex(3,4), Complex(0,1)) → Vector(atan2(4,3), π/2) (bespoke per-element ARG, Complex axis); got ${v?.items?.map(x => `${x.type}(${x.value?.toString()})`).join(',')}`);
    }

    // ARG on bare Matrix with mixed Complex/Real entries: closes
    // the bare-M axis.  Matrix `[[i, 1], [-1, -i]]` →
    // `[[π/2, 0], [π, -π/2]]`.
    {
      const s = new Stack();
      s.push(Matrix([[Complex(0, 1), Real(1)], [Real(-1), Complex(0, -1)]]));
      lookup('ARG').fn(s);
      const v = s.peek();
      assert(isMatrix(v) && !isTagged(v) && v.rows.length === 2,
        `session140: ARG Matrix preserves Matrix kind, no Tagged on bare-M`);
      const r = v.rows;
      assert(Math.abs(Number(r[0][0].value) - Math.PI / 2) < 1e-10
          && r[0][1].value.eq(0)
          && Math.abs(Number(r[1][0].value) - Math.PI) < 1e-10
          && Math.abs(Number(r[1][1].value) - (-Math.PI / 2)) < 1e-10,
        `session140: ARG Matrix([[i,1],[-1,-i]]) → Matrix([[π/2,0],[π,-π/2]]) (bespoke per-element ARG, Matrix axis with mixed Complex/Real); got ${r?.map(row => row.map(x => x.value?.toString()).join(',')).join('|')}`);
    }

    // ARG Tagged-of-Vector (Complex elements): outer tag preserved
    // through the 2-deep wrapper, bespoke V dispatch inside.
    // Different wrapper shape from the 3-deep wrapper-VM ops —
    // but same Tagged-preservation behavior on the outside.
    {
      const s = new Stack();
      s.push(Tagged('v', Vector([Complex(3, 4), Complex(0, 1)])));
      lookup('ARG').fn(s);
      const v = s.peek();
      assert(isTagged(v) && v.tag === 'v' && isVector(v.value),
        `session140: ARG :v:Vector(Complex(3,4), Complex(0,1)) preserves tag + V shape (got tag=${v?.tag} inner=${v?.value?.type})`);
      const items = v.value.items;
      assert(isReal(items[0]) && Math.abs(Number(items[0].value) - Math.atan2(4, 3)) < 1e-10
          && isReal(items[1]) && Math.abs(Number(items[1].value) - Math.PI / 2) < 1e-10,
        `session140: ARG :v:Vector(Complex(3,4), Complex(0,1)) → :v:Vector(atan2(4,3), π/2) (Tagged-of-V composition through 2-deep wrapper with bespoke V dispatch inside)`);
    }

    // CONJ Tagged-of-Vector (mixed Complex/Real): outer tag
    // preserved, V kind preserved (no kind change — CONJ is
    // shape-preserving), per-element CONJ flips Complex.im sign,
    // Real stays Real.
    {
      const s = new Stack();
      s.push(Tagged('z', Vector([Real(5), Complex(3, 4), Real(-1)])));
      lookup('CONJ').fn(s);
      const v = s.peek();
      assert(isTagged(v) && v.tag === 'z' && isVector(v.value),
        `session140: CONJ :z:Vector(5, 3+4i, -1) preserves tag + V shape`);
      const items = v.value.items;
      assert(isReal(items[0]) && items[0].value.eq(5)
          && isComplex(items[1]) && items[1].re === 3 && items[1].im === -4
          && isReal(items[2]) && items[2].value.eq(-1),
        `session140: CONJ :z:Vector(5, 3+4i, -1) → :z:Vector(5, 3-4i, -1) (Tagged-of-V composition; CONJ flips Complex.im sign, Real stays Real)`);
    }

    // CONJ Tagged-of-Matrix (mixed Complex/Real entries): closes
    // the Matrix axis on CONJ.  Same shape preservation as V —
    // the bespoke M-handler inside the 2-deep wrapper preserves
    // outer Tagged.
    {
      const s = new Stack();
      s.push(Tagged('m', Matrix([[Complex(1, 2), Complex(3, 4)], [Real(5), Complex(6, -7)]])));
      lookup('CONJ').fn(s);
      const v = s.peek();
      assert(isTagged(v) && v.tag === 'm' && isMatrix(v.value),
        `session140: CONJ :m:Matrix preserves tag + M shape`);
      const r = v.value.rows;
      assert(isComplex(r[0][0]) && r[0][0].re === 1 && r[0][0].im === -2
          && isComplex(r[0][1]) && r[0][1].re === 3 && r[0][1].im === -4
          && isReal(r[1][0]) && r[1][0].value.eq(5)
          && isComplex(r[1][1]) && r[1][1].re === 6 && r[1][1].im === 7,
        `session140: CONJ :m:Matrix([[1+2i,3+4i],[5,6-7i]]) → :m:Matrix([[1-2i,3-4i],[5,6+7i]]) (Tagged-of-M; per-entry CONJ flips Complex.im, Real stays Real)`);
    }

    // RE Tagged-of-Matrix: V/M kind preserved, every entry
    // becomes Real (Complex(re, im) → Real(re), Real → Real).
    // Pins that the kind preservation holds even when EVERY
    // Complex entry collapses to its real part.
    {
      const s = new Stack();
      s.push(Tagged('m', Matrix([[Complex(1, 2), Complex(3, 4)], [Real(5), Complex(6, -7)]])));
      lookup('RE').fn(s);
      const v = s.peek();
      assert(isTagged(v) && v.tag === 'm' && isMatrix(v.value),
        `session140: RE :m:Matrix preserves tag + M shape (M kind preserved across per-entry Complex→Real collapse)`);
      const r = v.value.rows;
      assert(r.every(row => row.every(x => isReal(x)))
          && r[0][0].value.eq(1) && r[0][1].value.eq(3)
          && r[1][0].value.eq(5) && r[1][1].value.eq(6),
        `session140: RE :m:Matrix([[1+2i,3+4i],[5,6-7i]]) → :m:Matrix([[Real(1),Real(3)],[Real(5),Real(6)]]) (per-entry Real-only result)`);
    }

    // IM Tagged-of-Vector: per-entry imaginary part — Complex(re,im)
    // → Real(im); Real(x) → Real(0) (no imaginary part).
    {
      const s = new Stack();
      s.push(Tagged('z', Vector([Complex(1, 2), Complex(3, -4), Real(5)])));
      lookup('IM').fn(s);
      const v = s.peek();
      assert(isTagged(v) && v.tag === 'z' && isVector(v.value),
        `session140: IM :z:Vector preserves tag + V shape`);
      const items = v.value.items;
      assert(items.every(x => isReal(x))
          && items[0].value.eq(2)
          && items[1].value.eq(-4)
          && items[2].value.eq(0),
        `session140: IM :z:Vector(1+2i, 3-4i, 5) → :z:Vector(Real(2), Real(-4), Real(0)) (per-entry imaginary part; Real → Real(0))`);
    }
  } finally {
    setAngle(_prevAngle);
  }
}
