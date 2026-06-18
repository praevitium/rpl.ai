import { Stack } from '../www/src/rpl/stack.js';
import { lookup } from '../www/src/rpl/ops.js';
import {
  Real, Integer, BinaryInteger, Rational, Complex, Name, Str, Directory, Program, Tagged,
  RList, Vector, Matrix, Symbolic, Unit,
  isReal, isInteger, isBinaryInteger, isRational, isComplex, isDirectory, isProgram, isName,
  isString, isUnit,
} from '../www/src/rpl/types.js';
import { parseEntry } from '../www/src/rpl/parser.js';
import { format, formatStackTop } from '../www/src/rpl/formatter.js';
import {
  state as calcState, setAngle, cycleAngle, toRadians, fromRadians,
  varStore, varRecall, varList, varPurge, resetHome, currentPath,
  setLastError, clearLastError, getLastError,
  goHome, goUp, goInto, makeSubdir,
  setWordsize, getWordsize, getWordsizeMask,
  setBinaryBase, getBinaryBase, resetBinaryState,
  setApproxMode,
} from '../www/src/rpl/state.js';
import { clampStackScroll, computeMenuPage } from '../www/src/ui/paging.js';
import { assert } from './helpers.mjs';

/* Reflection ops — TYPE, OBJ→. */

  {
    const s = new Stack();
    s.push(Real(3.14));
    lookup('TYPE').fn(s);
    assert(isReal(s.peek()) && s.peek().value.eq(0), 'TYPE Real → 0');
  }
  {
    const s = new Stack();
    s.push(Complex(1, 2));
    lookup('TYPE').fn(s);
    assert(s.peek().value.eq(1), 'TYPE Complex → 1');
  }
  {
    const s = new Stack();
    s.push(Str('hi'));
    lookup('TYPE').fn(s);
    assert(s.peek().value.eq(2), 'TYPE String → 2');
  }
  {
    const s = new Stack();
    s.push(Vector([Real(1), Real(2)]));
    lookup('TYPE').fn(s);
    assert(s.peek().value.eq(3), 'TYPE real Vector → 3');
  }
  {
    const s = new Stack();
    s.push(Vector([Real(1), Complex(0, 1)]));
    lookup('TYPE').fn(s);
    assert(s.peek().value.eq(4), 'TYPE complex Vector → 4');
  }
  {
    const s = new Stack();
    s.push(RList([Real(1)]));
    lookup('TYPE').fn(s);
    assert(s.peek().value.eq(5), 'TYPE List → 5');
  }
  {
    const s = new Stack();
    s.push(Name('X'));
    lookup('TYPE').fn(s);
    assert(s.peek().value.eq(6), 'TYPE Name → 6');
  }
  {
    const s = new Stack();
    s.push(Program([Real(1)]));
    lookup('TYPE').fn(s);
    assert(s.peek().value.eq(8), 'TYPE Program → 8');
  }
  {
    const s = new Stack();
    s.push(BinaryInteger(15n, 'h'));
    lookup('TYPE').fn(s);
    assert(s.peek().value.eq(10), 'TYPE BinaryInteger → 10');
  }
  {
    const s = new Stack();
    s.push(Tagged('lbl', Real(1)));
    lookup('TYPE').fn(s);
    assert(s.peek().value.eq(12), 'TYPE Tagged → 12');
  }
  {
    const s = new Stack();
    s.push(Integer(42));
    lookup('TYPE').fn(s);
    assert(s.peek().value.eq(28), 'TYPE Integer (ZINT) → 28');
  }

  {
    const s = new Stack();
    s.push(Complex(3, 4));
    lookup('OBJ→').fn(s);
    assert(s.depth === 2 && isReal(s.peek(1)) && s.peek(1).value.eq(4)
        && isReal(s.peek(2)) && s.peek(2).value.eq(3),
      'OBJ→ Complex(3,4) → 3 4');
  }
  {
    const s = new Stack();
    s.push(Tagged('lbl', Real(7)));
    lookup('OBJ→').fn(s);
    assert(s.depth === 2 && isString(s.peek(1)) && s.peek(1).value === 'lbl'
        && isReal(s.peek(2)) && s.peek(2).value.eq(7),
      'OBJ→ :lbl:7 → 7 "lbl"');
  }
  {
    const s = new Stack();
    s.push(RList([Real(10), Real(20), Real(30)]));
    lookup('OBJ→').fn(s);
    assert(s.depth === 4
        && isInteger(s.peek(1)) && s.peek(1).value === 3n
        && isReal(s.peek(2)) && s.peek(2).value.eq(30)
        && isReal(s.peek(4)) && s.peek(4).value.eq(10),
      'OBJ→ { 10 20 30 } → 10 20 30 3');
  }
  {
    const s = new Stack();
    s.push(Vector([Real(1), Real(2), Real(3)]));
    lookup('OBJ→').fn(s);
    // Vector OBJ→ leaves a { size } marker, not a bare count, so the
    // data can be reassembled with →ARRY later.
    assert(s.depth === 4
        && s.peek(1).type === 'list' && s.peek(1).items[0].value.eq(3)
        && isReal(s.peek(2)) && s.peek(2).value.eq(3),
      'OBJ→ [1 2 3] → 1 2 3 { 3 }');
  }
  {
    const s = new Stack();
    s.push(Matrix([[Real(1), Real(2)], [Real(3), Real(4)]]));
    lookup('OBJ→').fn(s);
    assert(s.depth === 5
        && s.peek(1).type === 'list'
        && s.peek(1).items[0].value.eq(2) && s.peek(1).items[1].value.eq(2)
        && isReal(s.peek(2)) && s.peek(2).value.eq(4)
        && isReal(s.peek(5)) && s.peek(5).value.eq(1),
      'OBJ→ [[1 2][3 4]] → 1 2 3 4 { 2 2 }');
  }
  {
    const s = new Stack();
    s.push(Str('1 2 +'));
    lookup('OBJ→').fn(s);
    // Parsed as three values: Integer(1), Integer(2), Name('+')
    assert(s.depth === 3, 'OBJ→ "1 2 +" parses 3 tokens');
  }
  /* HP50 AUR §3-149 — OBJ→ on a Real returns the Real unchanged.
     Prior versions did a mantissa/exponent split here, but the AUR
     §3-149 Input/Output table lists no numeric-scalar entry; the
     mantissa/exponent split is the job of MANT (AUR p.3-6) and XPON
     (AUR p.3-9), which are wired separately.  R-008 closed by
     . */
  {
    const s = new Stack();
    s.push(Real(3.14));
    lookup('OBJ→').fn(s);
    assert(s.depth === 1
        && isReal(s.peek(1)) && s.peek(1).value.eq(3.14),
      'session155: OBJ→ Real 3.14 → 3.14 (1-in / 1-out, no decomposition)');
  }
  {
    const s = new Stack();
    s.push(Real(1500));
    lookup('OBJ→').fn(s);
    assert(s.depth === 1
        && isReal(s.peek(1)) && s.peek(1).value.eq(1500),
      'session155: OBJ→ Real 1500 → 1500 (no mantissa/exponent split)');
  }
  {
    /* OBJ→ on Integer is also a no-op repush — symmetric with Real. */
    const s = new Stack();
    s.push(Integer(42n));
    lookup('OBJ→').fn(s);
    assert(s.depth === 1
        && isInteger(s.peek(1)) && s.peek(1).value === 42n,
      'session155: OBJ→ Integer 42 → 42 (1-in / 1-out)');
  }
  {
    /* OBJ→ on zero Real returns zero Real (no special-case decomp). */
    const s = new Stack();
    s.push(Real(0));
    lookup('OBJ→').fn(s);
    assert(s.depth === 1
        && isReal(s.peek(1)) && s.peek(1).value.isZero(),
      'session155: OBJ→ Real 0 → 0 (no zero-special-case)');
  }
  {
    /* MANT and XPON still operate on Real to provide the
       mantissa / exponent split that OBJ→ no longer does. */
    const s = new Stack();
    s.push(Real(1500));
    lookup('MANT').fn(s);
    assert(s.depth === 1
        && isReal(s.peek(1)) && Math.abs(s.peek(1).value.toNumber() - 1.5) < 1e-12,
      'session155: MANT 1500 → 1.5 (split lives at MANT, not OBJ→)');
    s.push(Real(1500));
    lookup('XPON').fn(s);
    assert(s.depth === 2
        && isReal(s.peek(1)) && s.peek(1).value.eq(3),
      'session155: XPON 1500 → 3 (split lives at XPON, not OBJ→)');
  }
  {
    /* Tagged OBJ→: AUR §3-149 shows tag as `"tag"` (String), not Name.
       Pinned here so any future "fix" to switch to Name(tag) is
       caught by the test suite as a regression. */
    const s = new Stack();
    s.push(Tagged('lbl', Real(7)));
    lookup('OBJ→').fn(s);
    assert(s.depth === 2
        && isString(s.peek(1)) && s.peek(1).value === 'lbl'
        && !isName(s.peek(1))
        && isReal(s.peek(2)) && s.peek(2).value.eq(7),
      'session155: OBJ→ :lbl:7 → 7 "lbl" — tag is a String per AUR §3-149');
  }
  {
    // ASCII alias OBJ-> produces the same result
    const s = new Stack();
    s.push(RList([Real(9)]));
    lookup('OBJ->').fn(s);
    assert(s.depth === 2
        && isInteger(s.peek(1)) && s.peek(1).value === 1n,
      'ASCII alias OBJ-> behaves the same as OBJ→');
  }

 /* — OBJ→ edge / composition pins extending the
 Real/Tagged/Integer audit. Five new pins covering
     the empty-container shapes (Vector / List / Program), the
     Tagged-of-Tagged composition, and the negative-Real branch.
 None of these were exercised by 's pin set; each
     guards a distinct branch of the OBJ→ dispatch in
     `www/src/rpl/ops.js:6642-6720`. */
  {
    /* Empty Vector → just the {0} size-list (no items pushed).
       Mirrors AUR §3-149's `[ x1, ... ,xn ] → x1 … xn  {n}` row
       at the n=0 boundary — pins that the size-list is emitted as
       an RList containing a single Real(0), not omitted entirely
       (which would collapse the depth to 0 and break the inverse
       round-trip via →ARRY). */
    const s = new Stack();
    s.push(Vector([]));
    lookup('OBJ→').fn(s);
    assert(s.depth === 1
        && s.peek(1).type === 'list'
        && s.peek(1).items.length === 1
        && isReal(s.peek(1).items[0])
        && s.peek(1).items[0].value.eq(0),
      'session156: OBJ→ empty Vector → just {0} size-list (no items, list with single Real(0))');
  }
  {
    /* Empty List → just the Integer(0) count (no items pushed).
       Mirrors AUR §3-149's `{ obj1, ... ,objn } → obj1 … objn  n`
       row at the n=0 boundary — pins that the trailing count is
       still emitted as Integer(0) so a generic
       `OBJ→ … N→PRG`-style metaprogramming loop sees a uniform
       (args, count) shape regardless of list size. */
    const s = new Stack();
    s.push(RList([]));
    lookup('OBJ→').fn(s);
    assert(s.depth === 1
        && isInteger(s.peek(1)) && s.peek(1).value === 0n,
      'session156: OBJ→ empty List → just Integer(0) count (no items, count present)');
  }
  {
    /* Empty Program → just the Integer(0) count.  Symmetric to
       the empty-List case above; pins that the Program branch
       (ops.js:6685-6691) does NOT special-case empty so the
       count is unconditional and a `« » OBJ→ →PRG` round-trip
       closes through the Integer(0) bridge. */
    const s = new Stack();
    s.push(Program([]));
    lookup('OBJ→').fn(s);
    assert(s.depth === 1
        && isInteger(s.peek(1)) && s.peek(1).value === 0n,
      'session156: OBJ→ empty Program → just Integer(0) count');
  }
  {
    /* Negative Real → unchanged (no sign decomposition).
       pinned the zero-Real and positive-Real
       no-decomposition path; this closes the negative-sign
       branch, guarding against a future "fix" that special-cases
       sign extraction (some HP48-era RPL variants pushed
       sign + magnitude separately — AUR §3-149 explicitly does
       not). */
    const s = new Stack();
    s.push(Real(-1500));
    lookup('OBJ→').fn(s);
    assert(s.depth === 1
        && isReal(s.peek(1)) && s.peek(1).value.eq(-1500),
      'session156: OBJ→ Real(-1500) → -1500 (no sign decomposition; symmetric to session-155 positive/zero pins)');
  }
  {
    /* Tagged-of-Tagged: only the outermost layer peels.  The
       inner Tagged value is preserved as the level-2 push, and
       the outer tag becomes the level-1 String per AUR §3-149.
       pinned the Real-inside-Tagged shape; this is
       the recursive-Tagged composition pin — guards against a
       refactor that flattens nested tags or recursively peels
       (the AUR is explicit that OBJ→ is one-layer-deep). */
    const s = new Stack();
    s.push(Tagged('outer', Tagged('inner', Real(7))));
    lookup('OBJ→').fn(s);
    assert(s.depth === 2,
      'session156: OBJ→ Tagged-of-Tagged → 2 stack items (one-layer peel, not recursive)');
    assert(isString(s.peek(1)) && s.peek(1).value === 'outer',
      'session156: OBJ→ Tagged-of-Tagged level-1 = "outer" (outer tag as String per AUR §3-149)');
    const inner = s.peek(2);
    assert(inner.type === 'tagged' && inner.tag === 'inner'
        && isReal(inner.value) && inner.value.value.eq(7),
      'session156: OBJ→ Tagged-of-Tagged level-2 = :inner:7 (inner Tagged preserved, NOT recursively peeled)');
  }

 /* — OBJ→ on Unit (HP50 AUR §3-149: `x_unit → x 1_unit`).
     OBJ→ on a Unit value pushes the bare numeric value to level 2
     and the unit prototype `1_unit` to level 1.  Pins cover the
     basic decomposition, multi-symbol uexpr, the round-trip-via-*
     contract, the negative-value branch, the inverse-style uexpr
     (`m/s`), Tagged-of-Unit composition, and a regression guard
     against a "fix" that flips the level-1 push to a Name. */
  {
    /* Basic Unit decomposition: 5_m → 5  1_m. */
    const s = new Stack();
    s.push(Unit(5, [['m', 1]]));
    lookup('OBJ→').fn(s);
    assert(s.depth === 2,
      'session159: OBJ→ 5_m → 2 stack items (Real on level 2, Unit prototype on level 1)');
    assert(isReal(s.peek(2)) && s.peek(2).value.eq(5),
      'session159: OBJ→ 5_m level-2 = Real(5) (the bare numeric value per AUR §3-149)');
    assert(isUnit(s.peek(1)) && s.peek(1).value === 1
        && s.peek(1).uexpr.length === 1
        && s.peek(1).uexpr[0][0] === 'm' && s.peek(1).uexpr[0][1] === 1,
      'session159: OBJ→ 5_m level-1 = Unit(1, [[m,1]]) — the `1_m` prototype per AUR §3-149');
  }
  {
    /* Round-trip via *: x_unit OBJ→ * → x_unit (lossless reconstruction). */
    const s = new Stack();
    s.push(Unit(5, [['m', 1]]));
    lookup('OBJ→').fn(s);
    lookup('*').fn(s);
    assert(s.depth === 1 && isUnit(s.peek(1))
        && s.peek(1).value === 5
        && s.peek(1).uexpr.length === 1
        && s.peek(1).uexpr[0][0] === 'm' && s.peek(1).uexpr[0][1] === 1,
      'session159: 5_m OBJ→ * → 5_m (lossless round-trip via Real*Unit fold)');
  }
  {
    /* Multi-symbol inverse uexpr (m/s) preserved through OBJ→. */
    const s = new Stack();
    s.push(Unit(5, [['m', 1], ['s', -1]]));
    lookup('OBJ→').fn(s);
    assert(s.depth === 2 && isReal(s.peek(2)) && s.peek(2).value.eq(5),
      'session159: OBJ→ 5_m/s level-2 = Real(5)');
    const proto = s.peek(1);
    assert(isUnit(proto) && proto.value === 1
        && proto.uexpr.length === 2
        && proto.uexpr[0][0] === 'm' && proto.uexpr[0][1] === 1
        && proto.uexpr[1][0] === 's' && proto.uexpr[1][1] === -1,
      'session159: OBJ→ 5_m/s level-1 = Unit(1, [[m,1],[s,-1]]) — multi-symbol uexpr preserved');
  }
  {
    /* Negative-value Unit: -3_kg → -3  1_kg.  Sign rides the level-2
       Real, NOT the level-1 prototype (which always carries value=1). */
    const s = new Stack();
    s.push(Unit(-3, [['kg', 1]]));
    lookup('OBJ→').fn(s);
    assert(isReal(s.peek(2)) && s.peek(2).value.eq(-3),
      'session159: OBJ→ -3_kg level-2 = Real(-3) (sign on the value, NOT the prototype)');
    assert(isUnit(s.peek(1)) && s.peek(1).value === 1,
      'session159: OBJ→ -3_kg level-1 prototype value = 1 (positive, regardless of input sign)');
    /* And round-trip: -3_kg OBJ→ * → -3_kg. */
    lookup('*').fn(s);
    assert(s.depth === 1 && isUnit(s.peek(1))
        && s.peek(1).value === -3
        && s.peek(1).uexpr[0][0] === 'kg',
      'session159: -3_kg OBJ→ * → -3_kg (sign survives the round-trip)');
  }
  {
    /* Regression guard against a future "fix" that flips the level-1
       push to a Name.  AUR §3-149 unambiguously specifies a Unit
       prototype, not a Name — Don't switch to Name(uexpr-as-string). */
    const s = new Stack();
    s.push(Unit(7, [['m', 1]]));
    lookup('OBJ→').fn(s);
    assert(isUnit(s.peek(1)) && !isName(s.peek(1)) && !isString(s.peek(1)),
      'session159: OBJ→ Unit level-1 is a Unit value (NOT a Name, NOT a String) per AUR §3-149');
  }
  {
    /* Tagged-of-Unit composition: only the outermost layer peels.
       The inner Unit value is preserved as the level-2 push, NOT
 further decomposed — symmetric with the
       Tagged-of-Tagged pin.  Guards against a refactor that
       recursively decomposes through composite types. */
    const s = new Stack();
    s.push(Tagged('len', Unit(5, [['m', 1]])));
    lookup('OBJ→').fn(s);
    assert(s.depth === 2,
      'session159: OBJ→ :len:5_m → 2 stack items (one-layer Tagged peel)');
    assert(isString(s.peek(1)) && s.peek(1).value === 'len',
      'session159: OBJ→ :len:5_m level-1 = "len" (tag as String per AUR §3-149)');
    const inner = s.peek(2);
    assert(isUnit(inner) && inner.value === 5 && inner.uexpr[0][0] === 'm',
      'session159: OBJ→ :len:5_m level-2 = 5_m (inner Unit preserved, NOT recursively decomposed)');
  }
  {
 /* ASCII alias OBJ-> works on Unit too (parity with
       OBJ-> alias pin on List). */
    const s = new Stack();
    s.push(Unit(2, [['kg', 1]]));
    lookup('OBJ->').fn(s);
    assert(s.depth === 2
        && isReal(s.peek(2)) && s.peek(2).value.eq(2)
        && isUnit(s.peek(1)) && s.peek(1).value === 1,
      'session159: ASCII alias OBJ-> on Unit behaves the same as OBJ→');
  }
  {
    /* Reverse-uexpr-shape (1/m): pins that the prototype carries the
       same uexpr shape regardless of whether exponents are positive
       or negative — guards against a future refactor that strips
       negative exponents on the prototype. */
    const s = new Stack();
    s.push(Unit(2, [['m', -1]]));
    lookup('OBJ→').fn(s);
    const proto = s.peek(1);
    assert(isUnit(proto) && proto.value === 1
        && proto.uexpr.length === 1
        && proto.uexpr[0][0] === 'm' && proto.uexpr[0][1] === -1,
      'session159: OBJ→ 2_(1/m) level-1 prototype preserves the [m,-1] negative-exponent uexpr');
  }

  /* session160: OBJ→ Unit follow-up edges — boundary cases (zero / fractional
 value, exponent != ±1 on uexpr) and round-trip closures that 's
     R-012 close pin-set did not enumerate.  Five pins covering the value-side
     edges (zero, fractional) and the uexpr-side edges (exponent ≠ 1, multi-
     symbol round-trip, higher-power round-trip).  All five exercise the same
 Unit branch in OBJ→'s dispatch; mirror of 's empty-V/L/P
     boundary closures applied to the Unit row of AUR §3-149.  No source
     change — the branch has been live since . */
  {
    /* Zero-value Unit boundary: 0_m OBJ→ → 0  1_m.  Sign-rule edge: zero
       has no sign so the Real(0) push and the level-1 prototype both have
       value=1 — closes the value=0 corner that the s159 negative -3_kg
       pin and positive 5_m pin straddle. */
    const s = new Stack();
    s.push(Unit(0, [['m', 1]]));
    lookup('OBJ→').fn(s);
    assert(s.depth === 2 && isReal(s.peek(2)) && s.peek(2).value.eq(0),
      'session160: OBJ→ 0_m level-2 = Real(0) (zero-value boundary; closes value=0 corner between s159 5_m positive and -3_kg negative pins)');
    assert(isUnit(s.peek(1)) && s.peek(1).value === 1
        && s.peek(1).uexpr.length === 1 && s.peek(1).uexpr[0][0] === 'm'
        && s.peek(1).uexpr[0][1] === 1,
      'session160: OBJ→ 0_m level-1 = Unit(1, [[m,1]]) (prototype shape unchanged at value=0; the prototype always carries value=1 regardless of input value)');
  }
  {
    /* Fractional-value Unit: 2.5_m OBJ→ → 2.5  1_m.  Pins that non-integer
       Real values pass through OBJ→'s value-extraction unchanged — guards
       against a refactor that would round/truncate the level-2 push. */
    const s = new Stack();
    s.push(Unit(2.5, [['m', 1]]));
    lookup('OBJ→').fn(s);
    assert(s.depth === 2 && isReal(s.peek(2)) && s.peek(2).value.eq(2.5),
      'session160: OBJ→ 2.5_m level-2 = Real(2.5) (fractional value passed through OBJ→ unchanged; complements s159 integer-value pins)');
  }
  {
    /* Higher-power uexpr: 3_m^2 OBJ→ → 3  1_m^2.  Exponent ≠ ±1 on the
       prototype.  Distinct from s159's 5_m (exponent +1) and 2_(1/m)
       (exponent -1) pins — pins that arbitrary integer exponents survive
       the prototype construction. */
    const s = new Stack();
    s.push(Unit(3, [['m', 2]]));
    lookup('OBJ→').fn(s);
    const proto = s.peek(1);
    assert(s.depth === 2 && isReal(s.peek(2)) && s.peek(2).value.eq(3)
        && isUnit(proto) && proto.value === 1
        && proto.uexpr.length === 1
        && proto.uexpr[0][0] === 'm' && proto.uexpr[0][1] === 2,
      'session160: OBJ→ 3_m^2 → Real(3) + Unit(1, [[m,2]]) (exponent ≠ ±1 preserved on prototype; closes the integer-exponent shoulder between s159 +1 and -1 pins)');
  }
  {
    /* Multi-symbol round-trip: 5_m/s OBJ→ * → 5_m/s.  Mirror of s159's
       single-symbol round-trip pin lifted onto the multi-symbol uexpr —
       guards against a refactor that re-orders or normalizes the uexpr
       differently in the *-fold path versus the OBJ→ build path. */
    const s = new Stack();
    s.push(Unit(5, [['m', 1], ['s', -1]]));
    lookup('OBJ→').fn(s);
    lookup('*').fn(s);
    assert(s.depth === 1 && isUnit(s.peek(1))
        && s.peek(1).value === 5
        && s.peek(1).uexpr.length === 2
        && s.peek(1).uexpr[0][0] === 'm' && s.peek(1).uexpr[0][1] === 1
        && s.peek(1).uexpr[1][0] === 's' && s.peek(1).uexpr[1][1] === -1,
      'session160: 5_m/s OBJ→ * → 5_m/s (multi-symbol uexpr round-trip closes via Real*Unit fold; uexpr ordering preserved [m,1][s,-1])');
  }
  {
    /* Higher-power round-trip: 3_m^2 OBJ→ * → 3_m^2.  Mirror of s159's
       single-symbol +1-exponent round-trip onto exponent ≠ ±1 — pins that
       Real*Unit fold reconstructs the higher-power uexpr exactly. */
    const s = new Stack();
    s.push(Unit(3, [['m', 2]]));
    lookup('OBJ→').fn(s);
    lookup('*').fn(s);
    assert(s.depth === 1 && isUnit(s.peek(1))
        && s.peek(1).value === 3
        && s.peek(1).uexpr.length === 1
        && s.peek(1).uexpr[0][0] === 'm' && s.peek(1).uexpr[0][1] === 2,
      'session160: 3_m^2 OBJ→ * → 3_m^2 (higher-power uexpr round-trip via Real*Unit fold; exponent=2 reconstructed exactly)');
  }

  /* session163 — OBJ→ on the remaining numeric-scalar shapes
     (BinaryInteger / Rational).  AUR §3-149 lists no row for any
 numeric scalar, so the same fidelity choice the
     close made for Real / Integer extends symmetrically to the
     other two scalar kinds: push the value back unchanged
 (1-in / 1-out). Prior to these shapes fell
     through the OBJ→ dispatch and threw `Bad argument type` —
     a divergence from the choice already documented for
     Real / Integer.  Closes the AUR-fidelity audit of OBJ→'s
     numeric-scalar dispatch.  Eight new pins covering both
     direct-OBJ→ and EVAL-as-literal-push behavior, plus the
     ASCII-alias `OBJ->` parity check.  Companion to s155 (Real /
     Integer / Tagged) and s159/s160 (Unit) — leaves OBJ→'s
     dispatch table fully covered for every value type the
     evaluator can produce. */
  {
    /* BinaryInteger OBJ→ pushes back unchanged.  Hex base #15h is
       the most common entry-line shape; pin it explicitly so the
       branch type-asserts the BinaryInteger payload survives the
       round-trip (no implicit B→R coercion). */
    const s = new Stack();
    s.push(BinaryInteger(15n, 'h'));
    lookup('OBJ→').fn(s);
    assert(s.depth === 1
        && isBinaryInteger(s.peek(1))
        && s.peek(1).value === 15n
        && s.peek(1).base === 'h',
      'session163: OBJ→ #15h → #15h (BinaryInteger pushed back unchanged; matches the s155 Real/Integer choice)');
  }
  {
    /* BinaryInteger in decimal base — pin that base preservation
       survives OBJ→.  Distinct from the hex pin so the prototype
       isn't accidentally normalising base on the round-trip. */
    const s = new Stack();
    s.push(BinaryInteger(255n, 'd'));
    lookup('OBJ→').fn(s);
    assert(s.depth === 1
        && isBinaryInteger(s.peek(1))
        && s.peek(1).value === 255n
        && s.peek(1).base === 'd',
      'session163: OBJ→ #255d → #255d (BinInt base preserved across OBJ→; no hex/decimal normalization)');
  }
  {
    /* BinaryInteger zero — value=0n is the natural boundary
       case; pin it so a future refactor that special-cases zero
       (e.g. via Number coercion) is caught. */
    const s = new Stack();
    s.push(BinaryInteger(0n, 'b'));
    lookup('OBJ→').fn(s);
    assert(s.depth === 1
        && isBinaryInteger(s.peek(1))
        && s.peek(1).value === 0n
        && s.peek(1).base === 'b',
      'session163: OBJ→ #0b → #0b (BinInt zero-value boundary preserved)');
  }
  {
    /* Rational OBJ→ pushes back unchanged.  Pin both n and d
       so a refactor that flips to Decimal/Real coercion (the
       implicit conversion most rationals undergo) is caught. */
    const s = new Stack();
    s.push(Rational(3n, 4n));
    lookup('OBJ→').fn(s);
    assert(s.depth === 1
        && isRational(s.peek(1))
        && s.peek(1).n === 3n
        && s.peek(1).d === 4n,
      'session163: OBJ→ 3/4 → 3/4 (Rational pushed back unchanged; no coercion to Real)');
  }
  {
    /* Rational with negative numerator — pin that the sign rides
       the numerator, not flipped onto the denominator, after
       OBJ→'s push-back. */
    const s = new Stack();
    s.push(Rational(-7n, 2n));
    lookup('OBJ→').fn(s);
    assert(s.depth === 1
        && isRational(s.peek(1))
        && s.peek(1).n === -7n
        && s.peek(1).d === 2n,
      'session163: OBJ→ -7/2 → -7/2 (Rational sign convention preserved)');
  }
  {
    /* ASCII alias OBJ-> on BinaryInteger — parity with the s155
       OBJ-> pin on List and the s159 OBJ-> pin on Unit. */
    const s = new Stack();
    s.push(BinaryInteger(7n, 'h'));
    lookup('OBJ->').fn(s);
    assert(s.depth === 1
        && isBinaryInteger(s.peek(1))
        && s.peek(1).value === 7n,
      'session163: ASCII alias OBJ-> on BinaryInteger behaves the same as OBJ→');
  }
  {
    /* EVAL on a BinaryInteger pushed onto level 1 should be a
       literal push (no decomposition, no coercion to Real).
       Symmetric with EVAL on Real / Integer — pinning the
       evaluator side complements the OBJ→ branch above so a
       future refactor that re-routes BinInt through B→R during
       EVAL is caught immediately. */
    const s = new Stack();
    s.push(BinaryInteger(15n, 'h'));
    const gen = lookup('EVAL').fn(s);
    if (gen && typeof gen.next === 'function') {
      let r;
      while (!(r = gen.next()).done) { /* drain */ }
    }
    assert(s.depth === 1
        && isBinaryInteger(s.peek(1))
        && s.peek(1).value === 15n
        && s.peek(1).base === 'h',
      'session163: EVAL #15h → #15h (BinInt evaluates to itself; literal-push semantics)');
  }
  {
    /* EVAL on a Rational pushed onto level 1 — same literal-push
       contract as BinaryInteger above; pin so EVAL stays
       parallel with OBJ→ for every numeric-scalar shape. */
    const s = new Stack();
    s.push(Rational(3n, 4n));
    const gen = lookup('EVAL').fn(s);
    if (gen && typeof gen.next === 'function') {
      let r;
      while (!(r = gen.next()).done) { /* drain */ }
    }
    assert(s.depth === 1
        && isRational(s.peek(1))
        && s.peek(1).n === 3n
        && s.peek(1).d === 4n,
      'session163: EVAL 3/4 → 3/4 (Rational evaluates to itself; literal-push semantics)');
  }

 /* session164 — OBJ→ follow-up edges that the s163 pin-set
     did not enumerate.  Six pins covering: Tagged-of-BinInt and
     Tagged-of-Rational composition (one-layer Tagged peel applied to
     the new BinInt/Rational push-back branch — mirror of session
     159's Tagged-of-Unit pin extended to the remaining numeric-scalar
     shapes), the missing OBJ-> ASCII alias parity on Rational
     (s163 only pinned the alias on BinInt), the missing octal-base
     pin on BinInt (s163 covered 'h'/'d'/'b' but not 'o' — the fourth
     and final valid base per types.js BIN_BASES), the Rational(0/1)
     zero-value boundary (mirror of s163's BinInt #0b zero-value pin
     onto the Rational sibling — closes the value=0 corner on the
     Rational arm of the s163 cluster), and a Rational with
     denominator=1 (e.g. 5/1) which pins the OBJ→ branch does NOT
     normalize n/1 to Integer — distinct from the s163 -7/2
     negative-numerator pin which has d>1.  All six exercise the
     widened `isReal(v) || isInteger(v) || isBinaryInteger(v) ||
 isRational(v)` branch added at ops.js:6746 plus
     the existing Tagged peel at ops.js:6690-6696.  No source
     change. */
  {
    /* Tagged-of-BinInt OBJ→ — one-layer Tagged peel: outer Tagged
       drops to the existing isTagged branch, which pushes the
       inner BinInt on level 2 and the tag as a String on level 1.
 Mirror of 's Tagged-of-Unit pin lifted onto the
       BinInt arm of the s163 cluster.  Guards against a future
       refactor that recurse-evaluates the Tagged inner value
       through OBJ→ a second time (would push the BinInt back
       unchanged via the s163 branch — same observable, but the
       intermediate Str("tag") would be missing). */
    const s = new Stack();
    s.push(Tagged('bn', BinaryInteger(15n, 'h')));
    lookup('OBJ→').fn(s);
    assert(s.depth === 2,
      'session164: OBJ→ :bn:#15h → 2 stack items (one-layer Tagged peel; mirror of session 159 Tagged-of-Unit pin onto BinInt)');
    assert(isString(s.peek(1)) && s.peek(1).value === 'bn',
      'session164: OBJ→ :bn:#15h level-1 = "bn" (tag as String per AUR §3-149)');
    assert(isBinaryInteger(s.peek(2)) && s.peek(2).value === 15n && s.peek(2).base === 'h',
      'session164: OBJ→ :bn:#15h level-2 = #15h (inner BinInt preserved with base, NOT recursively decomposed via the s163 push-back branch)');
  }
  {
    /* Tagged-of-Rational OBJ→ — same one-layer Tagged peel applied
       to the Rational arm; closes the s163 cluster on the Tagged
       composition axis for both numeric-scalar shapes the run
       added.  Distinct from the BinInt pin above by inner-value
       payload shape (n/d struct vs. BigInt+base) — pins both
       payload shapes survive the Tagged peel intact. */
    const s = new Stack();
    s.push(Tagged('rat', Rational(3n, 4n)));
    lookup('OBJ→').fn(s);
    assert(s.depth === 2
        && isString(s.peek(1)) && s.peek(1).value === 'rat'
        && isRational(s.peek(2)) && s.peek(2).n === 3n && s.peek(2).d === 4n,
      'session164: OBJ→ :rat:3/4 → 3/4 + "rat" (one-layer Tagged peel onto the Rational arm of the s163 cluster; closes Tagged composition for both numeric-scalar shapes)');
  }
  {
 /* ASCII alias OBJ-> on Rational — pinned the
       alias on BinInt but not on Rational.  Closes the s163
       alias-parity coverage for the second numeric-scalar shape
       added that run.  Pins OPS.get('OBJ→').fn dispatches
       identically through both glyphs on the Rational branch. */
    const s = new Stack();
    s.push(Rational(3n, 4n));
    lookup('OBJ->').fn(s);
    assert(s.depth === 1
        && isRational(s.peek(1))
        && s.peek(1).n === 3n
        && s.peek(1).d === 4n,
      'session164: ASCII alias OBJ-> on Rational behaves the same as OBJ→ (closes the s163 alias-parity coverage on the Rational arm)');
  }
  {
    /* BinaryInteger at octal base — types.js BIN_BASES lists
       'h' / 'd' / 'o' / 'b'.  This pin covers the 'o' base,
       completing BinInt display-base coverage for all four valid
       bases.  Catches a refactor that special-cases base=='o'
       (e.g., a digit-grouping rendering tweak that accidentally
       reformats the value through OBJ→). */
    const s = new Stack();
    s.push(BinaryInteger(7n, 'o'));
    lookup('OBJ→').fn(s);
    assert(s.depth === 1
        && isBinaryInteger(s.peek(1))
        && s.peek(1).value === 7n
        && s.peek(1).base === 'o',
      'session164: OBJ→ #7o → #7o (octal-base preservation; closes the BIN_BASES quartet — s163 covered h/d/b only)');
  }
  {
    /* Rational zero-value boundary — Rational(0n, 1n) is the
       canonical zero (GCD reduces 0/anything to 0/1).  Mirror of
       s163's BinInt #0b zero-value pin onto the Rational arm;
       closes the value=0 corner on the second numeric-scalar
       shape s163 added.  Guards against a refactor that
       short-circuits zero through Integer(0) (e.g., a fast-path
       optimization in the OBJ→ branch). */
    const s = new Stack();
    s.push(Rational(0n, 1n));
    lookup('OBJ→').fn(s);
    assert(s.depth === 1
        && isRational(s.peek(1))
        && s.peek(1).n === 0n
        && s.peek(1).d === 1n,
      'session164: OBJ→ Rational(0/1) → 0/1 (zero-value boundary on the Rational arm; mirror of s163 BinInt #0b zero pin)');
  }
  {
    /* Rational with denominator=1 — Rational(5n, 1n) is the
       n/1 boundary the Rational normalizer keeps as a Rational
       (does NOT auto-collapse to Integer).  Distinct from the
       s163 -7/2 pin which has d>1; this one pins the OBJ→
       push-back branch leaves the n/1 shape unchanged.  Catches
       a refactor that tries to canonicalise n/1 to Integer at
       the OBJ→ boundary (a tempting "simplification" that would
       break programs relying on type stability across OBJ→). */
    const s = new Stack();
    s.push(Rational(5n, 1n));
    lookup('OBJ→').fn(s);
    assert(s.depth === 1
        && isRational(s.peek(1))
        && s.peek(1).n === 5n
        && s.peek(1).d === 1n,
      'session164: OBJ→ Rational(5/1) → 5/1 (n/1 shape NOT normalised to Integer through OBJ→; pins type stability across the push-back branch)');
  }

  /* session359 — OBJ→ unhandled-type rejection (the dispatch's final
     `throw new RPLError('Bad argument type')` fall-through).  s155/s159/
     s160/s163/s164 pinned every type with an OBJ→ branch (Complex /
     Tagged / List / Vector / Matrix / String / Program / Symbolic /
     Real / Integer / BinaryInteger / Rational / Unit), but the
     fall-through itself — reached by the value types with NO row in the
     AUR §3-149 Input/Output table — had ZERO rejection pins, so a
     refactor that reorders the dispatch or replaces the throw with a
     silent no-op would pass green.  Name and Directory are the live
     reachable fall-through types: a bare Name on the stack and a
     Directory value both decompose to nothing on the real machine, so
     OBJ→ rejects.  Probed all four live first (bare Name, quoted Name,
     Directory, and the ASCII-alias parity → all `Bad argument type`).
     No source change — guards the dispatch's reject tail. */
  {
    /* Bare Name → Bad argument type (no OBJ→ branch; falls through the
       whole dispatch to the reject tail). */
    const s = new Stack();
    s.push(Name('X'));
    let caught = null;
    try { lookup('OBJ→').fn(s); } catch (e) { caught = e; }
    assert(caught && /Bad argument type/.test(caught.message),
      'session359: OBJ→ on a bare Name rejects with Bad argument type (no AUR §3-149 row; reaches the dispatch fall-through)');
  }
  {
    /* Quoted Name → same reject path; the quoted flag does not route
       it to a different branch. */
    const s = new Stack();
    s.push(Name('X', { quoted: true }));
    let caught = null;
    try { lookup('OBJ→').fn(s); } catch (e) { caught = e; }
    assert(caught && /Bad argument type/.test(caught.message),
      'session359: OBJ→ on a quoted Name rejects with Bad argument type (quoted flag does not bypass the fall-through)');
  }
  {
    /* Directory → Bad argument type.  A Directory is a live mutable
       container with no OBJ→ decomposition (NEWOB falls through to
       identity for the same reason); OBJ→ rejects rather than
       enumerating its entries. */
    const s = new Stack();
    s.push(Directory({ name: 'D', entries: new Map() }));
    let caught = null;
    try { lookup('OBJ→').fn(s); } catch (e) { caught = e; }
    assert(caught && /Bad argument type/.test(caught.message),
      'session359: OBJ→ on a Directory rejects with Bad argument type (live container, no decomposition; symmetric with NEWOB identity fall-through)');
  }
  {
    /* ASCII alias OBJ-> rejects identically — the alias is a thin
       `OPS.get('OBJ→').fn(s)` delegation, so the reject tail must fire
       through both glyphs. */
    const s = new Stack();
    s.push(Name('X'));
    let caught = null;
    try { lookup('OBJ->').fn(s); } catch (e) { caught = e; }
    assert(caught && /Bad argument type/.test(caught.message),
      'session359: ASCII alias OBJ-> on a Name rejects with Bad argument type (delegation preserves the reject tail)');
  }

/* ================================================================
   →ARRY / ARRY→ (array compose / decompose).
   ================================================================ */

{
  const s = new Stack();
  s.push(Real(1)); s.push(Real(2)); s.push(Real(3));
  s.push(Real(3));
  lookup('→ARRY').fn(s);
  assert(s.depth === 1, '→ARRY consumed n + n elements');
  const v = s.peek(1);
  assert(v.type === 'vector' && v.items.length === 3,
    '→ARRY 1 2 3 3 → Vector of 3 items');
  assert(v.items[0].value.eq(1) && v.items[2].value.eq(3),
    '→ARRY preserves element order');
}
{
  const s = new Stack();
  s.push(Real(10)); s.push(Real(20));
  s.push(RList([Real(2)]));
  lookup('→ARRY').fn(s);
  const v = s.peek(1);
  assert(v.type === 'vector' && v.items.length === 2
      && v.items[0].value.eq(10) && v.items[1].value.eq(20),
    '→ARRY with {2} size-list → Vector[10 20]');
}
{
  const s = new Stack();
  for (let i = 1; i <= 6; i++) s.push(Real(i));
  s.push(RList([Real(2), Real(3)]));
  lookup('→ARRY').fn(s);
  assert(s.depth === 1 && s.peek(1).type === 'matrix',
    '→ARRY with {2 3} builds a 2×3 Matrix');
  const m = s.peek(1);
  assert(m.rows.length === 2 && m.rows[0].length === 3,
    '→ARRY shape is 2 rows × 3 cols');
  assert(m.rows[0][0].value.eq(1) && m.rows[0][2].value.eq(3)
      && m.rows[1][0].value.eq(4) && m.rows[1][2].value.eq(6),
    '→ARRY matrix elements row-major: [[1 2 3][4 5 6]]');
}
{
  const s = new Stack();
  s.push(Real(7)); s.push(Real(8));
  s.push(Real(2));
  lookup('->ARRY').fn(s);
  assert(s.peek(1).type === 'vector' && s.peek(1).items.length === 2,
    'ASCII alias ->ARRY behaves the same as →ARRY');
}
{
  const s = new Stack();
  s.push(Real(1));
  s.push(Str('oops'));
  try { lookup('→ARRY').fn(s); assert(false, 'should throw'); }
  catch (e) { assert(/Bad argument type/i.test(e.message),
    '→ARRY with String dim-spec → Bad argument type'); }
}
{
  const s = new Stack();
  s.push(Real(1)); s.push(Real(2));
  s.push(RList([Real(1), Real(2), Real(3)]));
  try { lookup('→ARRY').fn(s); assert(false, 'should throw'); }
  catch (e) { assert(/Bad argument value/i.test(e.message),
    '→ARRY with 3-element size list → Bad argument value'); }
}

/* session372: the remaining unpinned _toDimSpec reject arms. The
   String-typed dim-spec (final `throw 'Bad argument type'`) and the
   `length > 2` size-list arm are pinned above; this block closes the
   complementary arms reached by the same `_toDimSpec` / `_toIntIdx`
   path so a refactor narrowing either guard can't pass green.
   All probed live first (CAS-free). */
{
  // The `length < 1` side of the size-list length check — distinct
  // boundary from the already-pinned `> 2` (3-element) arm.
  const s = new Stack();
  s.push(Real(1));
  s.push(RList([]));
  try { lookup('→ARRY').fn(s); assert(false, 'should throw'); }
  catch (e) { assert(/Bad argument value/i.test(e.message),
    'session372: →ARRY with empty {} size list → Bad argument value'); }
}
{
  // A non-integer Real inside an otherwise valid-length size-list trips
  // `_toIntIdx`'s integrality check (a different path from the bare
  // non-integer count, which never reaches the List branch).
  const s = new Stack();
  s.push(Real(1)); s.push(Real(2));
  s.push(RList([Real(2.5)]));
  try { lookup('→ARRY').fn(s); assert(false, 'should throw'); }
  catch (e) { assert(/Bad argument value/i.test(e.message),
    'session372: →ARRY size-list item 2.5 → Bad argument value'); }
}
{
  // A String size-list item trips `_toIntIdx`'s type check — the type
  // error is reached *inside* the list map, not by the outer dim-spec
  // type guard (which only sees the List as a whole).
  const s = new Stack();
  s.push(Real(1));
  s.push(RList([Str('x')]));
  try { lookup('→ARRY').fn(s); assert(false, 'should throw'); }
  catch (e) { assert(/Bad argument type/i.test(e.message),
    'session372: →ARRY size-list item "x" → Bad argument type'); }
}
{
  // A negative size-list item trips `_toIntIdx`'s non-negative check.
  const s = new Stack();
  s.push(Real(1));
  s.push(RList([Real(-1)]));
  try { lookup('→ARRY').fn(s); assert(false, 'should throw'); }
  catch (e) { assert(/Bad argument value/i.test(e.message),
    'session372: →ARRY size-list item -1 → Bad argument value'); }
}
{
  // 2-D matrix path: `{2 3}` needs m*n = 6 elements; with fewer the
  // matrix-branch `popN(total)` underflows — pins the row-major
  // assembly's stack-depth requirement (the bare-vector underflow is a
  // separate popN(n) site).
  const s = new Stack();
  s.push(Real(1)); s.push(Real(2));
  s.push(RList([Real(2), Real(3)]));
  try { lookup('→ARRY').fn(s); assert(false, 'should throw'); }
  catch (e) { assert(/Too few arguments/i.test(e.message),
    'session372: →ARRY {2 3} with only 2 stack elements → Too few arguments'); }
}

/* session405: the positive BinaryInteger arm of `_toIntIdx` reached
   through `_toDimSpec`'s size-list map (`v.items.map(_toIntIdx)`). The
   bare BinInt count is pinned (session077) and the size-list reject arms
   are pinned (session372), but a BinInt *inside* a size-list was never
   positively exercised — so a refactor swapping the list-map's
   `_toIntIdx` for an Integer/Real-only coercion would pass green. This
   is a distinct caller from GET/PUT/GETI's `_toIntIdx` BinInt arm
   (session392). All probed live first (CAS-free). */
{
  // {#2h} size-list → a 2-vector, same shape as the {Real(2)} form.
  const s = new Stack();
  s.push(Real(10)); s.push(Real(20));
  s.push(RList([BinaryInteger(2n, 'h')]));
  lookup('→ARRY').fn(s);
  const v = s.peek(1);
  assert(v.type === 'vector' && v.items.length === 2
      && v.items[0].value.eq(10) && v.items[1].value.eq(20),
    'session405: →ARRY with {#2h} BinInt size-list → Vector[10 20]');
}
{
  // {#2h #3h} size-list → a 2×3 Matrix, row-major (both dims via BinInt).
  const s = new Stack();
  for (let i = 1; i <= 6; i++) s.push(Real(i));
  s.push(RList([BinaryInteger(2n, 'h'), BinaryInteger(3n, 'h')]));
  lookup('→ARRY').fn(s);
  const m = s.peek(1);
  assert(m.type === 'matrix' && m.rows.length === 2 && m.rows[0].length === 3
      && m.rows[0][0].value.eq(1) && m.rows[0][2].value.eq(3)
      && m.rows[1][0].value.eq(4) && m.rows[1][2].value.eq(6),
    'session405: →ARRY with {#2h #3h} BinInt size-list → 2×3 Matrix row-major');
}
{
  // Mixed {#2h 3}: a BinInt and an Integer in the same size-list both
  // resolve through the per-item _toIntIdx map → 2×3 Matrix.
  const s = new Stack();
  for (let i = 1; i <= 6; i++) s.push(Real(i));
  s.push(RList([BinaryInteger(2n, 'h'), Integer(3n)]));
  lookup('→ARRY').fn(s);
  const m = s.peek(1);
  assert(m.type === 'matrix' && m.rows.length === 2 && m.rows[0].length === 3,
    'session405: →ARRY with mixed {#2h 3} size-list → 2×3 Matrix');
}
{
  // Base is cosmetic in the size-list index: #10b (binary 2) → 2-vector.
  const s = new Stack();
  s.push(Real(10)); s.push(Real(20));
  s.push(RList([BinaryInteger(2n, 'b')]));
  lookup('→ARRY').fn(s);
  const v = s.peek(1);
  assert(v.type === 'vector' && v.items.length === 2,
    'session405: →ARRY with base-cosmetic {#10b} size-list → Vector[2]');
}

{
  const s = new Stack();
  s.push(Vector([Real(11), Real(22), Real(33)]));
  lookup('ARRY→').fn(s);
  assert(s.depth === 4, 'ARRY→ on Vector[3] → 3 elements + size-list');
  const size = s.peek(1);
  assert(size.type === 'list' && size.items.length === 1
      && size.items[0].value.eq(3),
    'ARRY→ pushes {3} as size spec');
  assert(s.peek(2).value.eq(33) && s.peek(4).value.eq(11),
    'ARRY→ Vector elements in HP50 order (L2=last, L4=first)');
}
{
  const s = new Stack();
  s.push(Matrix([[Real(1), Real(2)], [Real(3), Real(4)]]));
  lookup('ARRY→').fn(s);
  assert(s.depth === 5, 'ARRY→ on 2×2 Matrix → 4 elements + size-list');
  const size = s.peek(1);
  assert(size.type === 'list' && size.items.length === 2
      && size.items[0].value.eq(2) && size.items[1].value.eq(2),
    'ARRY→ on Matrix pushes {2 2} size spec');
  assert(s.peek(2).value.eq(4) && s.peek(5).value.eq(1),
    'ARRY→ on Matrix: elements in row-major order, L2=last, L5=first');
}
{
  const s = new Stack();
  s.push(Vector([Real(1), Real(2), Real(3), Real(4)]));
  lookup('ARRY→').fn(s);
  lookup('→ARRY').fn(s);
  const round = s.peek(1);
  assert(round.type === 'vector' && round.items.length === 4
      && round.items[0].value.eq(1) && round.items[3].value.eq(4),
    'ARRY→ then →ARRY round-trips a Vector');
}
{
  const s = new Stack();
  s.push(Matrix([[Real(1), Real(2), Real(3)], [Real(4), Real(5), Real(6)]]));
  lookup('ARRY→').fn(s);
  lookup('→ARRY').fn(s);
  const round = s.peek(1);
  assert(round.type === 'matrix'
      && round.rows.length === 2 && round.rows[0].length === 3
      && round.rows[0][0].value.eq(1) && round.rows[1][2].value.eq(6),
    'ARRY→ then →ARRY round-trips a Matrix (row-major preserved)');
}
{
  const s = new Stack();
  s.push(Vector([Real(9)]));
  lookup('ARRY->').fn(s);
  assert(s.depth === 2
      && s.peek(1).type === 'list' && s.peek(1).items[0].value.eq(1),
    'ASCII alias ARRY-> behaves the same as ARRY→');
}
{
  const s = new Stack();
  s.push(Real(3));
  try { lookup('ARRY→').fn(s); assert(false, 'should throw'); }
  catch (e) { assert(/Bad argument type/i.test(e.message),
    'ARRY→ on Real → Bad argument type'); }
}

// session437: →ARRY/ARRY→ carried their own rejection pins (session372/405
// compose path, the ARRY→-on-Real decompose reject above), but the
// `->ARRY`/`ARRY->` ASCII aliases had happy-path coverage only. Each alias
// is registered with the SAME fn instance as its canonical (`_toArrayOp` /
// `_fromArrayOp`), so it rejects identically — pin the shared-instance
// identity plus a reject through each alias so a refactor that splits the
// alias into its own implementation and drops a guard is caught (the
// session391 row/col and session417 vector alias precedent).
{
  assert(lookup('->ARRY').fn === lookup('→ARRY').fn
      && lookup('ARRY->').fn === lookup('ARRY→').fn,
    'session437: ARRY ASCII aliases share the canonical fn instance');

  // ->ARRY mirrors →ARRY's compose-path rejects.
  {
    const s = new Stack();
    s.push(Real(10));
    s.push(Real(20));
    s.push(Str('x'));
    try { lookup('->ARRY').fn(s); assert(false, 'should throw'); }
    catch (e) { assert(/Bad argument type/i.test(e.message),
      'session437: ->ARRY String dim-spec → Bad argument type'); }
  }
  {
    const s = new Stack();
    for (let i = 0; i < 6; i++) s.push(Real(i + 1));
    s.push(RList([Integer(2), Integer(2), Integer(2)]));
    try { lookup('->ARRY').fn(s); assert(false, 'should throw'); }
    catch (e) { assert(/Bad argument value/i.test(e.message),
      'session437: ->ARRY 3-element size list → Bad argument value'); }
  }
  {
    const s = new Stack();
    s.push(Real(1));
    s.push(RList([Integer(-1)]));
    try { lookup('->ARRY').fn(s); assert(false, 'should throw'); }
    catch (e) { assert(/Bad argument value/i.test(e.message),
      'session437: ->ARRY size-list item -1 → Bad argument value'); }
  }
  // ->ARRY positive path flows through the shared instance.
  {
    const s = new Stack();
    s.push(Real(10));
    s.push(Real(20));
    s.push(RList([Integer(2)]));
    lookup('->ARRY').fn(s);
    assert(s.peek().type === 'vector' && s.peek().items.length === 2
        && s.peek().items[0].value.eq(10) && s.peek().items[1].value.eq(20),
      'session437: ->ARRY {2} size-list → Vector[10 20]');
  }
  // ARRY-> mirrors ARRY→'s non-array decompose rejects.
  {
    const s = new Stack();
    s.push(Real(3));
    try { lookup('ARRY->').fn(s); assert(false, 'should throw'); }
    catch (e) { assert(/Bad argument type/i.test(e.message),
      'session437: ARRY-> on Real → Bad argument type'); }
  }
  {
    const s = new Stack();
    s.push(Str('x'));
    try { lookup('ARRY->').fn(s); assert(false, 'should throw'); }
    catch (e) { assert(/Bad argument type/i.test(e.message),
      'session437: ARRY-> on String → Bad argument type'); }
  }
}

/* ================================================================
   V→ / →V2 / →V3 (simple vector compose/decompose).

   →V2 ( x y    → [ x y ]    )
   →V3 ( x y z  → [ x y z ]  )
   V→  ( [x1…xn] → x1 … xn   )   decompose WITHOUT pushing a size list
   ================================================================ */

{
  const s = new Stack();
  s.push(Real(3));
  s.push(Real(4));
  lookup('→V2').fn(s);
  const v = s.peek(1);
  assert(v.type === 'vector' && v.items.length === 2
      && v.items[0].value.eq(3) && v.items[1].value.eq(4),
    '→V2 3 4 → [3 4]');
}
{
  // ASCII alias
  const s = new Stack();
  s.push(Real(1)); s.push(Real(2));
  lookup('->V2').fn(s);
  assert(s.peek(1).type === 'vector' && s.peek(1).items.length === 2,
    'ASCII alias ->V2 works like →V2');
}
{
  // Stack underflow
  const s = new Stack();
  s.push(Real(1));
  try { lookup('→V2').fn(s); assert(false, '→V2 with 1 arg should throw'); }
  catch (e) { assert(/Too few/i.test(e.message) || /argument/i.test(e.message),
    '→V2 with one stack item → Too few arguments'); }
}

{
  const s = new Stack();
  s.push(Real(1));
  s.push(Real(2));
  s.push(Real(3));
  lookup('→V3').fn(s);
  const v = s.peek(1);
  assert(v.type === 'vector' && v.items.length === 3
      && v.items[0].value.eq(1) && v.items[2].value.eq(3),
    '→V3 1 2 3 → [1 2 3]');
}
{
  // ASCII alias
  const s = new Stack();
  s.push(Real(7)); s.push(Real(8)); s.push(Real(9));
  lookup('->V3').fn(s);
  assert(s.peek(1).items.length === 3,
    'ASCII alias ->V3 works like →V3');
}

{
  // session384: →V3 / ->V3 underflow — sibling →V2's underflow is pinned
  // above (1 arg → Too few arguments) but →V3's was not. →V3 popN(3) needs
  // three operands; 2 or 1 on the stack must trip the same guard, and the
  // ASCII alias shares the fn instance so it rejects identically. Also pins
  // →V2's 0-arg boundary, completing the pair.
  const u2 = new Stack();
  u2.push(Real(1)); u2.push(Real(2));
  try { lookup('→V3').fn(u2); assert(false, '→V3 with 2 args should throw'); }
  catch (e) { assert(/Too few/i.test(e.message),
    'session384: →V3 with two stack items → Too few arguments'); }

  const u1 = new Stack();
  u1.push(Real(1));
  try { lookup('→V3').fn(u1); assert(false, '→V3 with 1 arg should throw'); }
  catch (e) { assert(/Too few/i.test(e.message),
    'session384: →V3 with one stack item → Too few arguments'); }

  const ua = new Stack();
  ua.push(Real(1)); ua.push(Real(2));
  try { lookup('->V3').fn(ua); assert(false, '->V3 with 2 args should throw'); }
  catch (e) { assert(/Too few/i.test(e.message),
    'session384: ->V3 alias underflow rejects identically → Too few arguments'); }

  const u0 = new Stack();
  try { lookup('→V2').fn(u0); assert(false, '→V2 with 0 args should throw'); }
  catch (e) { assert(/Too few/i.test(e.message),
    'session384: →V2 with empty stack → Too few arguments'); }
}

{
  const s = new Stack();
  s.push(Vector([Real(11), Real(22), Real(33)]));
  lookup('V→').fn(s);
  assert(s.depth === 3,
    'V→ on 3-vector pushes 3 scalars (NO size list, differs from ARRY→)');
  assert(s.peek(3).value.eq(11) && s.peek(2).value.eq(22) && s.peek(1).value.eq(33),
    'V→ preserves element order (L3=first, L1=last)');
}
{
  // Empty vector → nothing
  const s = new Stack();
  s.push(Vector([]));
  lookup('V→').fn(s);
  assert(s.depth === 0,
    'V→ on empty vector pushes nothing');
}
{
  // ASCII alias V->
  const s = new Stack();
  s.push(Vector([Real(5), Real(6)]));
  lookup('V->').fn(s);
  assert(s.depth === 2 && s.peek(1).value.eq(6),
    'ASCII alias V-> works like V→');
}
{
  // Non-vector
  const s = new Stack();
  s.push(Real(3));
  try { lookup('V→').fn(s); assert(false, 'V→ on Real should throw'); }
  catch (e) { assert(/Bad argument type/i.test(e.message),
    'V→ on Real → Bad argument type'); }
}
{
  // Matrix is NOT a vector for V→ — that's ARRY→'s job
  const s = new Stack();
  s.push(Matrix([[Real(1), Real(2)]]));
  try { lookup('V→').fn(s); assert(false, 'V→ on Matrix should throw'); }
  catch (e) { assert(/Bad argument type/i.test(e.message),
    'V→ on Matrix → Bad argument type (use ARRY→ for matrices)'); }
}

{
  const s = new Stack();
  s.push(Real(1)); s.push(Real(2)); s.push(Real(3));
  lookup('→V3').fn(s);
  lookup('V→').fn(s);
  assert(s.depth === 3
      && s.peek(3).value.eq(1) && s.peek(1).value.eq(3),
    '→V3 then V→ round-trips three scalars');
}

// session417: each ASCII alias (->V2 / ->V3 / V->) is registered with the
// SAME fn instance as its Unicode canonical, so it rejects identically. The
// canonical V→ carries non-vector reject pins (Real, Matrix above) but its
// alias V-> had happy-path-only coverage — a refactor splitting an alias into
// its own implementation and dropping the isVector guard would pass green.
{
  assert(lookup('->V2').fn === lookup('→V2').fn,
    'session417: ->V2 shares the →V2 fn instance');
  assert(lookup('->V3').fn === lookup('→V3').fn,
    'session417: ->V3 shares the →V3 fn instance');
  assert(lookup('V->').fn === lookup('V→').fn,
    'session417: V-> shares the V→ fn instance');

  const sR = new Stack();
  sR.push(Real(3));
  try { lookup('V->').fn(sR); assert(false, 'V-> on Real should throw'); }
  catch (e) { assert(/Bad argument type/i.test(e.message),
    'session417: V-> on Real → Bad argument type'); }

  const sM = new Stack();
  sM.push(Matrix([[Real(1), Real(2)]]));
  try { lookup('V->').fn(sM); assert(false, 'V-> on Matrix should throw'); }
  catch (e) { assert(/Bad argument type/i.test(e.message),
    'session417: V-> on Matrix → Bad argument type (use ARRY→)'); }

  const sS = new Stack();
  sS.push(Str('x'));
  try { lookup('V->').fn(sS); assert(false, 'V-> on String should throw'); }
  catch (e) { assert(/Bad argument type/i.test(e.message),
    'session417: V-> on String → Bad argument type'); }
}


{
  const s = new Stack();
  s.push(Real(3));
  s.push(Real(4));
  // Explicit runOp wrap so LASTARG sees the `+`'s consumed arguments.
  s.runOp(() => lookup('+').fn(s));
  assert(s.depth === 1 && isReal(s.peek()) && s.peek().value.eq(7),
    'session046: 3 4 + → 7');
  lookup('LASTARG').fn(s);
  assert(s.depth === 3
      && isReal(s.peek(2)) && s.peek(2).value.eq(3)
      && isReal(s.peek(1)) && s.peek(1).value.eq(4),
    'session046: LASTARG after 3 4 + pushes 3 4');
}

{
  const s = new Stack();
  s.push(Real(10));
  s.push(Real(2));
  s.runOp(() => lookup('-').fn(s));
  lookup('LAST').fn(s);
  assert(s.depth === 3
      && s.peek(2).value.eq(10) && s.peek(1).value.eq(2),
    'session046: LAST (synonym) after 10 2 - pushes 10 2');
}

{
  const s = new Stack();
  s.push(Real(5));
  s.runOp(() => lookup('NEG').fn(s));
  assert(s.peek().value.eq(-5), 'session046: 5 NEG → -5 (setup)');
  lookup('LASTARG').fn(s);
  assert(s.depth === 2 && s.peek(2).value.eq(-5) && s.peek(1).value.eq(5),
    'session046: LASTARG after NEG pushes the pre-NEG value');
}

{
  const s = new Stack();
  try { lookup('LASTARG').fn(s); assert(false, 'LASTARG on empty history should throw'); }
  catch (e) { assert(/No last arguments/i.test(e.message),
    'session046: LASTARG with no prior op → No last arguments'); }
}

{
  const s = new Stack();
  s.push(Real(7));
  s.runOp(() => lookup('DUP').fn(s));   // prior=[7], cur=[7,7]; diff = []
  try { lookup('LASTARG').fn(s); assert(false, 'DUP consumed 0 → LASTARG empty'); }
  catch (e) { assert(/No last arguments/i.test(e.message),
    'session046: LASTARG after DUP (no consumed args) → No last arguments'); }
}

{
  const s = new Stack();
  s.push(RList([Real(1), Real(2), Real(3)]));
  s.push(Integer(2));
  s.push(Real(99));
  s.runOp(() => lookup('PUT').fn(s));
  lookup('LASTARG').fn(s);
  // After PUT the stack has 1 item; LASTARG adds 3 → total 4
  assert(s.depth === 4, 'session046: LASTARG after PUT pushes the 3 args');
  assert(s.peek(1).value.eq(99),  'session046: LASTARG PUT arg3 = value');
  assert(s.peek(2).value === 2n,  'session046: LASTARG PUT arg2 = index');
  assert(s.peek(3).items.length === 3, 'session046: LASTARG PUT arg1 = original list');
}

/* ---- LASTARG chain: LASTARG is idempotent under runOp.  runOp only
       overwrites _lastArgs when the wrapped op actually consumed
       something; LASTARG itself consumes nothing (pure growth), so the
       _lastArgs slot from the earlier `*` survives across repeated
       LASTARG calls.  Matches HP50 behaviour (user can press LASTARG
       again to re-push the same argument list). ---- */
{
  const s = new Stack();
  s.push(Real(8));
  s.push(Real(3));
  s.runOp(() => lookup('*').fn(s));
  s.runOp(() => lookup('LASTARG').fn(s));
  // prior=[24], cur=[24,8,3]. LCP=1, consumed=[].
  // consumed.length === 0 → runOp preserves the previous _lastArgs.
  s.runOp(() => lookup('LASTARG').fn(s));
  // Stack now [24, 8, 3, 8, 3] — LASTARG pushed the args again.
  assert(s.depth === 5,
    'session048: LASTARG is idempotent — chaining re-pushes the same args');
  assert(s.peek(1).value.eq(3) && s.peek(2).value.eq(8)
      && s.peek(3).value.eq(3) && s.peek(4).value.eq(8),
    'session048: chained LASTARG pushes [8,3] twice on top of [24]');
}

/* ---- Manual LASTARG doesn't use runOp → _lastArgs survives chained
       LASTARG calls (test-shape convenience) ---- */
{
  const s = new Stack();
  s.push(Real(2)); s.push(Real(9));
  s.runOp(() => lookup('+').fn(s));
  lookup('LASTARG').fn(s);              // no runOp
  // _lastArgs still [2, 9] from the `+`
  lookup('LASTARG').fn(s);              // pushes again
  assert(s.depth === 5
      && s.peek(4).value.eq(2) && s.peek(3).value.eq(9)
      && s.peek(2).value.eq(2) && s.peek(1).value.eq(9),
    'session046: direct LASTARG doesn\'t overwrite _lastArgs (test-only path)');
}

/* ================================================================
   OBJ→ on Program + →PRG (composer)
   ================================================================

   Covers the new "program-as-data" hook and its inverse:
     « t1 … tn » OBJ→  →  t1 … tn n
     t1 … tn n  →PRG  →  « t1 … tn »
   See src/rpl/ops.js for the implementation and comments. */

{
  const s = new Stack();
  // << 3 4 + >> — three tokens
  s.push(Program([Integer(3n), Integer(4n), Name('+')]));
  lookup('OBJ→').fn(s);
  assert(s.depth === 4,
    'session067: OBJ→ on 3-token Program pushes 3 tokens + count');
  assert(s.peek(1).type === 'integer' && s.peek(1).value === 3n,
    'session067: OBJ→ Program level 1 = token count as Integer');
  assert(s.peek(2).type === 'name' && s.peek(2).id === '+',
    'session067: OBJ→ Program level 2 = last token (+)');
  assert(s.peek(4).type === 'integer' && s.peek(4).value === 3n,
    'session067: OBJ→ Program level 4 = first token (3)');
}

{
  const s = new Stack();
  s.push(Program([]));
  lookup('OBJ→').fn(s);
  assert(s.depth === 1 && s.peek().type === 'integer' && s.peek().value === 0n,
    'session067: OBJ→ on empty Program leaves just 0');
}

{
  const s = new Stack();
  s.push(Integer(3n));
  s.push(Integer(4n));
  s.push(Name('+'));
  s.push(Integer(3n));                 // count
  lookup('→PRG').fn(s);
  assert(s.depth === 1 && isProgram(s.peek()),
    'session067: →PRG pops 3 tokens + count, pushes Program');
  assert(s.peek().tokens.length === 3,
    'session067: →PRG preserves token count (3)');
  assert(s.peek().tokens[2].type === 'name' && s.peek().tokens[2].id === '+',
    'session067: →PRG preserves token order (+ is last)');
}

{
  const s = new Stack();
  s.push(Integer(0n));
  lookup('→PRG').fn(s);
  assert(s.depth === 1 && isProgram(s.peek()) && s.peek().tokens.length === 0,
    'session067: →PRG with 0 count → empty program');
}

{
  const s = new Stack();
  // « 2 'X' * 1 + » — five tokens
  const orig = Program([
    Integer(2n), Name('X', { quoted: true }), Name('*'),
    Integer(1n), Name('+'),
  ]);
  s.push(orig);
  lookup('OBJ→').fn(s);
  lookup('→PRG').fn(s);
  assert(s.depth === 1 && isProgram(s.peek()),
    'session067: OBJ→ ⟶ →PRG round-trip still a Program');
  assert(s.peek().tokens.length === 5,
    'session067: round-trip preserves token count');
  // Structural check per-token
  const after = s.peek().tokens;
  let allMatch = true;
  for (let k = 0; k < orig.tokens.length; k++) {
    const a = orig.tokens[k], b = after[k];
    if (a.type !== b.type) { allMatch = false; break; }
    if (a.type === 'integer' && a.value !== b.value) { allMatch = false; break; }
    if (a.type === 'name' && (a.id !== b.id || !!a.quoted !== !!b.quoted)) {
      allMatch = false; break;
    }
  }
  assert(allMatch, 'session067: round-trip preserves every token identity');
}

{
  const s = new Stack();
  s.push(Integer(42n));
  s.push(Integer(1n));
  lookup('->PRG').fn(s);
  assert(s.depth === 1 && isProgram(s.peek()) && s.peek().tokens.length === 1
      && s.peek().tokens[0].value === 42n,
    'session067: ->PRG ASCII alias produces the same Program shape');
}

{
  const s = new Stack();
  s.push(Integer(-1n));
  let caught = null;
  try { lookup('→PRG').fn(s); } catch (e) { caught = e.message; }
  assert(caught && /Bad argument value/.test(caught),
    'session067: →PRG negative count raises Bad argument value');
}

{
  const s = new Stack();
  s.push(Name('foo'));
  let caught = null;
  try { lookup('→PRG').fn(s); } catch (e) { caught = e.message; }
  assert(caught && /Bad argument type/.test(caught),
    'session067: →PRG non-numeric count raises Bad argument type');
}

{
  const s = new Stack();
  const inner = Program([Name('+')]);
  const outer = Program([Integer(1n), Integer(2n), inner, Name('EVAL')]);
  s.push(outer);
  lookup('OBJ→').fn(s);
  lookup('→PRG').fn(s);
  assert(s.depth === 1 && isProgram(s.peek()) && s.peek().tokens.length === 4,
    'session067: nested Program tokens survive round-trip');
  assert(isProgram(s.peek().tokens[2]) && s.peek().tokens[2].tokens.length === 1,
    'session067: nested Program token is still a Program after round-trip');
}

/* ================================================================
   DECOMP — Program → String source form.
   ================================================================ */

// Basic: DECOMP produces a String whose value starts with « and ends with ».
{
  const s = new Stack();
  s.push(Program([Integer(3n), Integer(4n), Name('+')]));
  lookup('DECOMP').fn(s);
  assert(s.depth === 1 && s.peek().type === 'string',
    'session068: DECOMP on Program pushes a String');
  const src = s.peek().value;
  assert(src.startsWith('«') && src.endsWith('»'),
    'session068: DECOMP output carries the « … » program delimiters');
  assert(src.includes('3') && src.includes('4') && src.includes('+'),
    'session068: DECOMP output contains every original token (3 4 +)');
}

// Empty program.
{
  const s = new Stack();
  s.push(Program([]));
  lookup('DECOMP').fn(s);
  assert(s.peek().type === 'string',
    'session068: DECOMP on empty Program still pushes a String');
  assert(/^«\s*»$/.test(s.peek().value),
    'session068: DECOMP of empty Program is roughly «  »');
}

// DECOMP + STR→ round-trip: the restored Program runs to the same result.
{
  resetHome();
  const prevApprox = calcState.approxMode;
  setApproxMode(true);
  try {
    const s = new Stack();
    s.push(Program([Integer(3n), Integer(4n), Name('+')]));
    lookup('DECOMP').fn(s);                 // Program → String
    lookup('STR→').fn(s);                   // String → value(s)
    // STR→ may emit one or more values; for a program source string we
    // expect exactly one: the reconstructed Program.
    assert(s.depth >= 1,
      'session068: DECOMP→STR→ leaves at least one value on the stack');
    const reconstituted = s._items[s._items.length - 1];
    assert(isProgram(reconstituted),
      'session068: DECOMP→STR→ yields a Program (round-trip preserves type)');
    assert(reconstituted.tokens.length === 3,
      'session068: DECOMP→STR→ preserves token count');
    // Running it should produce 7.  Under APPROX the push-time
    // coercion makes the result a Real (Decimal); under EXACT the
    // integer path keeps it as Integer.  Handle both.
    lookup('EVAL').fn(s);
    const top = s.peek();
    const topVal = top.type === 'integer' ? Number(top.value)
                : top.type === 'real'    ? top.value.toNumber() : null;
    assert(topVal === 7,
      'session068: DECOMP→STR→→EVAL reproduces the original result (3 4 + → 7)');
  } finally {
    setApproxMode(prevApprox);
  }
}

// DECOMP on non-Program raises Bad argument type.
{
  const s = new Stack();
  s.push(Integer(42n));
  let caught = null;
  try { lookup('DECOMP').fn(s); } catch (e) { caught = e.message; }
  assert(caught && /Bad argument type/.test(caught),
    'session068: DECOMP on Integer raises Bad argument type');
}

{
  const s = new Stack();
  s.push(Str('hi'));
  let caught = null;
  try { lookup('DECOMP').fn(s); } catch (e) { caught = e.message; }
  assert(caught && /Bad argument type/.test(caught),
    'session068: DECOMP on String raises Bad argument type');
}

/* ================================================================
   OBJ→ on Symbolic — peel one AST layer onto the stack.
   ================================================================ */

// `'A+B' OBJ→`  →  'A'  'B'  '+'  3
{
  const s = new Stack();
  s.push(parseEntry("`A+B`")[0]);
  lookup('OBJ→').fn(s);
  assert(s.depth === 4,
    'session068: OBJ→ on 2-arg Bin leaves 4 items (l, r, op, count)');
  const [l, r, op, cnt] = s._items;
  assert(l.type === 'name' && l.id === 'A' && l.quoted,
    'session068: OBJ→ symbolic arg l is quoted Name(A)');
  assert(r.type === 'name' && r.id === 'B' && r.quoted,
    'session068: OBJ→ symbolic arg r is quoted Name(B)');
  assert(op.type === 'name' && op.id === '+' && op.quoted,
    'session068: OBJ→ symbolic head is quoted Name(+)');
  assert(cnt.type === 'integer' && cnt.value === 3n,
    'session068: OBJ→ symbolic count is Integer(3) for a binary head');
}

// `'3+X' OBJ→`  →  Real(3)  'X'  '+'  3
{
  const s = new Stack();
  s.push(parseEntry("`3+X`")[0]);
  lookup('OBJ→').fn(s);
  assert(s.depth === 4,
    'session068: OBJ→ on 3+X leaves 4 items');
  assert(s._items[0].type === 'real' && s._items[0].value.eq(3),
    'session068: OBJ→ 3+X left-arg unwraps to Real(3)');
  assert(s._items[1].type === 'name' && s._items[1].id === 'X',
    'session068: OBJ→ 3+X right-arg is Name(X)');
  assert(s._items[3].type === 'integer' && s._items[3].value === 3n,
    'session068: OBJ→ 3+X count is 3');
}

// `'SIN(X+1)' OBJ→`  →  Symbolic('X+1')  'SIN'  2
{
  const s = new Stack();
  s.push(parseEntry("`SIN(X+1)`")[0]);
  lookup('OBJ→').fn(s);
  assert(s.depth === 3,
    'session068: OBJ→ on a unary Fn leaves 3 items (arg, fn, count)');
  const [arg, fn, cnt] = s._items;
  assert(arg.type === 'symbolic' && arg.expr.kind === 'bin' && arg.expr.op === '+',
    'session068: OBJ→ SIN(X+1): non-leaf argument stays Symbolic');
  assert(fn.type === 'name' && fn.id === 'SIN' && fn.quoted,
    'session068: OBJ→ SIN(X+1) head is quoted Name(SIN)');
  assert(cnt.type === 'integer' && cnt.value === 2n,
    'session068: OBJ→ SIN(X+1) count is 2 (arg + head)');
}

// Leaf Var: 'X' OBJ→  →  'X'  1  (single-layer)
{
  const s = new Stack();
  // Parser emits Name(X) for a plain 'X', not a Symbolic.  To exercise
  // the Symbolic-Var leaf path, wrap via Symbolic(Var(X)) directly.
  s.push(Symbolic({ kind: 'var', name: 'X' }));
  lookup('OBJ→').fn(s);
  assert(s.depth === 2,
    'session068: OBJ→ on leaf Symbolic(Var) leaves 2 items (name, count)');
  assert(s._items[0].type === 'name' && s._items[0].id === 'X' && s._items[0].quoted,
    'session068: OBJ→ leaf Var unwraps to quoted Name');
  assert(s._items[1].type === 'integer' && s._items[1].value === 1n,
    'session068: OBJ→ leaf Var count is 1');
}

// Leaf Num: Symbolic(Num) OBJ→  →  Real, 1
{
  const s = new Stack();
  s.push(Symbolic({ kind: 'num', value: 7 }));
  lookup('OBJ→').fn(s);
  assert(s.depth === 2,
    'session068: OBJ→ on leaf Symbolic(Num) leaves 2 items');
  assert(s._items[0].type === 'real' && s._items[0].value.eq(7),
    'session068: OBJ→ leaf Num unwraps to Real(7)');
  assert(s._items[1].type === 'integer' && s._items[1].value === 1n,
    'session068: OBJ→ leaf Num count is 1');
}

// Neg: '-X' OBJ→  →  'X'  'NEG'  2
{
  const s = new Stack();
  s.push(parseEntry("`-X`")[0]);
  lookup('OBJ→').fn(s);
  assert(s.depth === 3,
    'session068: OBJ→ on Neg leaves 3 items');
  assert(s._items[1].type === 'name' && s._items[1].id === 'NEG',
    'session068: OBJ→ Neg head is Name(NEG)');
  assert(s._items[2].type === 'integer' && s._items[2].value === 2n,
    'session068: OBJ→ Neg count is 2');
}

// Multi-arg function: lift a fake Fn with two args and verify the shape.
{
  const s = new Stack();
  s.push(Symbolic({
    kind: 'fn', name: 'GCD',
    args: [ { kind: 'var', name: 'A' }, { kind: 'var', name: 'B' } ],
  }));
  lookup('OBJ→').fn(s);
  assert(s.depth === 4,
    'session068: OBJ→ on 2-arg Fn leaves 4 items (a1, a2, fn, count)');
  assert(s._items[2].type === 'name' && s._items[2].id === 'GCD',
    'session068: OBJ→ 2-arg Fn head is Name(GCD)');
  assert(s._items[3].type === 'integer' && s._items[3].value === 3n,
    'session068: OBJ→ 2-arg Fn count is N+1 = 3');
}

/* session345: the two defensive arms of _symbolicDecompose (ops.js ~269)
   that the session068 sweep left unpinned — every real AST kind
   (num/var/neg/bin/fn) is covered above, but the `!ast` empty guard and
   the unknown-kind fall-through were not. Both are reachable because the
   Symbolic() constructor stores its `expr` verbatim.
     - `!ast`: a Symbolic carrying no expr pushes just Integer(0) — the
       empty-count shape, symmetric with OBJ→ on the empty Program / List
       (session156). Both null and undefined exprs hit it.
     - unknown kind: an AST node whose `kind` matches none of the
       enumerated branches preserves the original Symbolic by reference and
       emits a count of 1, so a generic →PRG-style rebuild loop never loses
       the value. Guards a refactor that drops either defensive arm. */
{
  for (const expr of [null, undefined]) {
    const s = new Stack();
    s.push(Symbolic(expr));
    lookup('OBJ→').fn(s);
    assert(s.depth === 1,
      'session345: OBJ→ on a Symbolic with no expr leaves just the count');
    assert(s._items[0].type === 'integer' && s._items[0].value === 0n,
      'session345: OBJ→ empty Symbolic count is Integer(0)');
  }

  const v = Symbolic({ kind: 'mystery', foo: 1 });
  const s = new Stack();
  s.push(v);
  lookup('OBJ→').fn(s);
  assert(s.depth === 2,
    'session345: OBJ→ on an unknown AST kind leaves 2 items (value, count)');
  assert(s._items[0] === v,
    'session345: OBJ→ unknown-kind preserves the original Symbolic by reference');
  assert(s._items[1].type === 'integer' && s._items[1].value === 1n,
    'session345: OBJ→ unknown-kind count is Integer(1)');
}

/* ================================================================
   DECOMP → STR→ round-trip invariants

   Pins the canonical "program source-string round-trips to an
   equivalent program" invariant for a spread of program shapes.
   HP50 AUR p.1-12 documents this as the defining property of
   DECOMP: the emitted string must reparse into an object that's
   semantically equivalent to the input.

   Helper: decompThenStrTo(v) returns the Program re-assembled by
   DECOMP-then-STR→ on value v.
   ================================================================ */

function _roundTripProgram(prog) {
  const s = new Stack();
  s.push(prog);
  lookup('DECOMP').fn(s);
  lookup('STR→').fn(s);
  // STR→ yields one Program for any program-shape source string.
  assert(s.depth === 1,
    'session073: DECOMP→STR→ round-trip leaves exactly one value');
  const back = s.peek();
  assert(isProgram(back),
    'session073: DECOMP→STR→ round-trip yields a Program');
  return back;
}

{
  const back = _roundTripProgram(Program([]));
  assert(back.tokens.length === 0,
    'session073: DECOMP→STR→ preserves empty Program');
}

{
  const src = Program([Integer(3n), Integer(4n), Name('+'), Integer(5n), Name('*')]);
  const back = _roundTripProgram(src);
  assert(back.tokens.length === src.tokens.length,
    'session073: DECOMP→STR→ preserves token count for arithmetic program');
}

{
  resetHome();
  const prev = calcState.approxMode;
  setApproxMode(true);
  try {
    const src = Program([Integer(6n), Integer(7n), Name('*'), Integer(2n), Name('-')]);
    // Original EVAL: 6 7 * 2 - = 40.  Under APPROX the push-time
    // coercion makes the top-of-stack a Real (Decimal); unwrap with
    // .toNumber() so the numeric equality test is mode-agnostic.
    const s0 = new Stack();
    s0.push(src);
    lookup('EVAL').fn(s0);
    const origTop = s0.peek();
    const origVal = origTop.type === 'integer' ? Number(origTop.value)
                  : origTop.type === 'real'    ? origTop.value.toNumber()
                  : origTop.value;

    const back = _roundTripProgram(src);
    const s1 = new Stack();
    s1.push(back);
    lookup('EVAL').fn(s1);
    const backTop = s1.peek();
    const backVal = backTop.type === 'integer' ? Number(backTop.value)
                  : backTop.type === 'real'    ? backTop.value.toNumber()
                  : backTop.value;
    assert(origVal === backVal && origVal === 40,
      'session073: DECOMP→STR→ round-trip preserves EVAL semantics (arith)');
  } finally {
    setApproxMode(prev);
  }
}

{
  // outer Program whose single token is an inner Program.
  const inner = Program([Integer(1n), Integer(2n), Name('+')]);
  const src = Program([inner]);
  const back = _roundTripProgram(src);
  assert(back.tokens.length === 1,
    'session073: DECOMP→STR→ on {nested prog} preserves outer length');
  assert(isProgram(back.tokens[0]),
    'session073: DECOMP→STR→ nested token is still a Program');
  assert(back.tokens[0].tokens.length === 3,
    'session073: DECOMP→STR→ nested Program token count survives');
}

{
  // The quoted string with spaces must survive lexing intact via the
  // `" … "` delimiters the formatter emits.
  const src = Program([Str('hello world'), Integer(5n)]);
  const back = _roundTripProgram(src);
  assert(back.tokens.length === 2,
    'session073: DECOMP→STR→ on [String, Integer] preserves token count');
  assert(back.tokens[0].type === 'string' &&
         back.tokens[0].value === 'hello world',
    'session073: DECOMP→STR→ preserves String token with embedded space');
}

/* ---- Program containing an IF/THEN/ELSE/END structure round-trips
       and re-evaluates to the same result ---- */
{
  resetHome();
  const prev = calcState.approxMode;
  setApproxMode(true);
  try {
    const src = Program([
      Integer(5n),
      Name('IF'), Name('DUP'), Integer(0n), Name('>'),
      Name('THEN'), Integer(100n), Name('+'),
      Name('ELSE'), Name('NEG'),
      Name('END'),
    ]);
    const back = _roundTripProgram(src);
    // Re-run the round-tripped program.  Top-of-stack may be Integer
    // (EXACT) or Real/Decimal (APPROX after push coercion).
    const s = new Stack();
    s.push(back);
    lookup('EVAL').fn(s);
    const top = s.peek();
    const v = top.type === 'integer' ? Number(top.value)
            : top.type === 'real'    ? top.value.toNumber()
            : top.value;
    assert(v === 105,
      'session073: DECOMP→STR→ round-trip preserves IF/THEN/ELSE/END (5>0 → 5+100)');
  } finally {
    setApproxMode(prev);
  }
}

{
  // Quoted-Name tokens in a Program body come from source like `'X'`.
  const q = Name('X', { quoted: true });
  const src = Program([q, Name('STO')]);
  const back = _roundTripProgram(src);
  assert(back.tokens.length === 2,
    'session073: DECOMP→STR→ preserves {quoted-Name, Name} token count');
  const first = back.tokens[0];
  assert(isName(first) && first.id === 'X' && first.quoted === true,
    'session073: DECOMP→STR→ quoted-Name round-trips as quoted');
}

{
  const src = Program([Real(3.25), Real(2.5), Name('+')]);
  const back = _roundTripProgram(src);
  assert(back.tokens.length === 3,
    'session073: DECOMP→STR→ preserves token count for Real-bearing program');
  assert(back.tokens[0].type === 'real' &&
         Math.abs(back.tokens[0].value - 3.25) < 1e-12,
    'session073: DECOMP→STR→ preserves Real value 3.25');
}

{
  // Second round yields the identical source — this is the
  // "canonical form" check.  If the formatter ever introduced
  // nondeterministic whitespace, this assertion would catch it.
  const src = Program([
    Integer(1n),
    Name('FOR'), Name('i'), Integer(10n),
    Name('i'), Name('*'),
    Name('NEXT'),
  ]);
  const s = new Stack();
  s.push(src);
  lookup('DECOMP').fn(s);
  const str1 = s.peek().value;
  lookup('STR→').fn(s);       // back to Program
  lookup('DECOMP').fn(s);     // Program → string again
  const str2 = s.peek().value;
  assert(str1 === str2,
    'session073: DECOMP→STR→→DECOMP is a canonical-form fixed point');
}

/* ================================================================
   →PRG / OBJ→(Program) parity audit with →LIST /
                 LIST→ / →ARRY

   The cluster of decompose/compose ops presents a uniform surface
   for the meta-programmer.  Invariants pinned here:

     - →PRG, →LIST, →ARRY all accept Integer / Real / BinaryInteger
       counts (parity handled by `_toCountN` / `_toIntIdx`).
     - Negative counts reject with "Bad argument value" (not "type").
     - Zero counts produce the empty form: « », { }, [ ].
     - OBJ→ on Program pushes tokens then an Integer count (matching
       LIST→).  OBJ→ on List does the same.  ARRY→ still uses the
       size-list convention — documented here so the contrast is
       visible.
     - Round-trip: OBJ→ ; →PRG reproduces the input program.  Same
       shape LIST→ ; →LIST has.
   ================================================================ */

{
  const s = new Stack();
  s.push(Integer(10n)); s.push(Integer(20n));
  s.push(BinaryInteger(2n, 'd'));
  lookup('→LIST').fn(s);
  assert(s.depth === 1 && s.peek().type === 'list' &&
         s.peek().items.length === 2,
    'session077: →LIST accepts BinaryInteger count (parity with →PRG)');
}
{
  const s = new Stack();
  s.push(Name('A')); s.push(Name('B'));
  s.push(BinaryInteger(2n, 'h'));
  lookup('→PRG').fn(s);
  assert(s.depth === 1 && s.peek().type === 'program' &&
         s.peek().tokens.length === 2,
    'session077: →PRG accepts BinaryInteger count');
}
{
  const s = new Stack();
  s.push(Integer(1n)); s.push(Integer(2n)); s.push(Integer(3n));
  s.push(BinaryInteger(3n, 'b'));
  lookup('→ARRY').fn(s);
  assert(s.depth === 1 && s.peek().type === 'vector' &&
         s.peek().items.length === 3,
    'session077: →ARRY accepts BinaryInteger bare count (parity widening)');
}

{
  const s = new Stack();
  s.push(Integer(1n));
  s.push(Integer(-1n));
  let caught = null;
  try { lookup('→LIST').fn(s); } catch (e) { caught = e; }
  assert(caught && /Bad argument value/.test(caught.message),
    'session077: →LIST with negative count raises Bad argument value');
}
{
  const s = new Stack();
  s.push(Integer(1n));
  s.push(Integer(-1n));
  let caught = null;
  try { lookup('→PRG').fn(s); } catch (e) { caught = e; }
  assert(caught && /Bad argument value/.test(caught.message),
    'session077: →PRG with negative count raises Bad argument value (parity)');
}
{
  const s = new Stack();
  s.push(Integer(1n));
  s.push(Integer(-1n));
  let caught = null;
  try { lookup('→ARRY').fn(s); } catch (e) { caught = e; }
  assert(caught && /Bad argument value/.test(caught.message),
    'session077: →ARRY with negative bare count raises Bad argument value');
}

{
  const s = new Stack();
  s.push(Integer(1n));
  s.push(Str('oops'));
  let caught = null;
  try { lookup('→PRG').fn(s); } catch (e) { caught = e; }
  assert(caught && /Bad argument type/.test(caught.message),
    'session077: →PRG rejects String count with Bad argument type');
}
{
  const s = new Stack();
  s.push(Integer(1n));
  s.push(Str('oops'));
  let caught = null;
  try { lookup('→LIST').fn(s); } catch (e) { caught = e; }
  assert(caught && /Bad argument type/.test(caught.message),
    'session077: →LIST rejects String count with Bad argument type');
}
{
  const s = new Stack();
  s.push(Integer(1n));
  s.push(Str('oops'));
  let caught = null;
  try { lookup('→ARRY').fn(s); } catch (e) { caught = e; }
  assert(caught && /Bad argument type/.test(caught.message),
    'session077: →ARRY rejects String bare count with Bad argument type');
}

{
  const s = new Stack();
  s.push(Integer(0n));
  lookup('→LIST').fn(s);
  assert(s.depth === 1 && s.peek().type === 'list' &&
         s.peek().items.length === 0,
    'session077: →LIST 0 → empty list {}');
}
{
  const s = new Stack();
  s.push(Integer(0n));
  lookup('→PRG').fn(s);
  assert(s.depth === 1 && s.peek().type === 'program' &&
         s.peek().tokens.length === 0,
    'session077: →PRG 0 → empty program « »');
}
{
  // →ARRY's bare-count form rejects 0 at the `_toIntIdx` layer —
  // the internal `if (n === 0) { push Vector([]); }` check inside
  // `_toArrayOp` is unreachable because `_toIntIdx` refuses zero.
  // Flipping that would be a new behaviour and needs a downstream
  // audit (matrix shape validation, ARRY→ round-trip, etc.); the
  // current rejection shape is pinned here so a future cleanup sees
  // the deliberate asymmetry.  Tracked in RPL.md.
  const s = new Stack();
  s.push(Integer(0n));
  let caught = null;
  try { lookup('→ARRY').fn(s); } catch (e) { caught = e; }
  assert(caught && /Bad argument value/.test(caught.message),
    'session077: →ARRY 0 rejects Bad argument value (documented asymmetry ' +
    'with →LIST 0 / →PRG 0 — follow-up in RPL.md)');
}

{
  const s = new Stack();
  s.push(RList([Integer(1n), Integer(2n), Integer(3n)]));
  lookup('OBJ→').fn(s);
  assert(s.depth === 4 && s.peek().type === 'integer' &&
         s.peek().value === 3n,
    'session077: OBJ→ on List pushes Integer count (=3)');
}
{
  const s = new Stack();
  s.push(Program([Integer(1n), Integer(2n), Integer(3n)]));
  lookup('OBJ→').fn(s);
  assert(s.depth === 4 && s.peek().type === 'integer' &&
         s.peek().value === 3n,
    'session077: OBJ→ on Program pushes Integer count (=3, matches LIST→ shape)');
}
{
  const s = new Stack();
  // LIST→ equivalent — pushes Integer count too.
  s.push(RList([Integer(1n), Integer(2n), Integer(3n)]));
  lookup('LIST→').fn(s);
  assert(s.peek().type === 'integer' && s.peek().value === 3n,
    'session077: LIST→ pushes Integer count (baseline)');
}

{
  const s = new Stack();
  const prog = Program([
    Integer(2n), Integer(3n), Name('+'),
    Name('SWAP'), Name('DUP'),
  ]);
  s.push(prog);
  lookup('OBJ→').fn(s);
  lookup('→PRG').fn(s);
  assert(s.depth === 1 && s.peek().type === 'program' &&
         s.peek().tokens.length === prog.tokens.length,
    'session077: Program OBJ→ ; →PRG round-trips token count');
  // Spot-check content.
  const rt = s.peek();
  for (let i = 0; i < prog.tokens.length; i++) {
    const a = prog.tokens[i], b = rt.tokens[i];
    const same = (a.type === b.type) && (
      (a.type === 'integer' && a.value === b.value) ||
      (a.type === 'name' && a.id === b.id)
    );
    assert(same,
      `session077: round-trip token[${i}] preserved (${a.type})`);
  }
}

/* ---- session366: →PRG count via _toCountIdx — the Real arms + the
       too-few-items underflow.  session067/077 pinned the Integer and
       BinaryInteger accepts, the Integer-negative and non-numeric (Name/
       String) rejects, and the 0 case, but `_toCountIdx`'s Real branch
       (ops.js ~6996) was only ever reached implicitly.  Its `!isInteger()`
       guard (whole-Real accepted, fractional-Real → Bad argument value) and
       the handler's own `n < 0` reject on a negative WHOLE Real (which passes
       the isInteger gate, a distinct path from the Integer-negative pin) had
       no direct pin, nor did the popN underflow when the count exceeds the
       stack depth.  Probed live first (Real(2)→2-token Program; Real(2.5),
       Real(-1), Real(-2.5) → Bad argument value; count 5 over 2 items → Too
       few arguments).  No source change — guards a refactor that drops the
       Real integrality check or the underflow guard. */
{
  const s = new Stack();
  s.push(Integer(10n)); s.push(Integer(20n)); s.push(Real(2));
  lookup('→PRG').fn(s);
  assert(s.depth === 1 && isProgram(s.peek()) && s.peek().tokens.length === 2,
    'session366: →PRG accepts a whole Real count (Real(2) → 2-token program)');
}
{
  const s = new Stack();
  s.push(Integer(10n)); s.push(Integer(20n)); s.push(Real(2.5));
  let caught = null;
  try { lookup('→PRG').fn(s); } catch (e) { caught = e.message; }
  assert(caught && /Bad argument value/.test(caught),
    'session366: →PRG fractional Real count → Bad argument value');
}
{
  const s = new Stack();
  s.push(Real(-1));
  let caught = null;
  try { lookup('→PRG').fn(s); } catch (e) { caught = e.message; }
  assert(caught && /Bad argument value/.test(caught),
    'session366: →PRG negative whole Real count → Bad argument value (passes the isInteger gate, rejected by n < 0)');
}
{
  const s = new Stack();
  s.push(Real(-2.5));
  let caught = null;
  try { lookup('→PRG').fn(s); } catch (e) { caught = e.message; }
  assert(caught && /Bad argument value/.test(caught),
    'session366: →PRG negative fractional Real count → Bad argument value');
}
{
  const s = new Stack();
  s.push(Integer(10n)); s.push(Integer(20n)); s.push(Integer(5n));
  let caught = null;
  try { lookup('→PRG').fn(s); } catch (e) { caught = e.message; }
  assert(caught && /Too few arguments/.test(caught),
    'session366: →PRG count exceeding stack depth → Too few arguments (popN underflow)');
}

{
  const s = new Stack();
  const src = RList([Integer(10n), Integer(20n), Integer(30n)]);
  s.push(src);
  lookup('LIST→').fn(s);
  lookup('→LIST').fn(s);
  assert(s.depth === 1 && s.peek().type === 'list' &&
         s.peek().items.length === 3 &&
         s.peek().items[0].value === 10n &&
         s.peek().items[2].value === 30n,
    'session077: LIST→ ; →LIST round-trips the source list');
}

/* ---- ARRY→ is documented-different: it pushes a size-LIST, not a
       bare count.  This is the one known asymmetry in the cluster —
       left as-is because OBJ→ on Matrix has the same shape and the
       2-D form genuinely needs 2 numbers (rows + cols).  Pin the
       shape explicitly so a future cleanup pass doesn't silently
       flip it to bare Integer and break existing callers. ---- */
{
  const s = new Stack();
  const v = Vector([Real(1), Real(2), Real(3)]);
  s.push(v);
  lookup('ARRY→').fn(s);
  // Stack: 1  2  3  { 3 }   (bottom→top)
  assert(s.depth === 4, 'session077: ARRY→ pushes elements + 1-elem size-list');
  const top = s.peek();
  assert(top.type === 'list' && top.items.length === 1 &&
         top.items[0].type === 'real' && top.items[0].value.eq(3),
    'session077: ARRY→ size-spec is a LIST wrapping Real — asymmetric with '
    + 'LIST→/OBJ→(Program) by design (matches →ARRY input shape)');
}

{
  resetHome();
  const s = new Stack();

  // Empty program « » → SIZE = 0
  s.push(Program([]));
  lookup('SIZE').fn(s);
  assert(s.depth === 1 && s.peek().type === 'integer' && s.peek().value === 0n,
    'session088: SIZE on empty program returns 0');

  // « 1 2 + » → 3 tokens
  s.push(Program([ Integer(1n), Integer(2n), Name('+') ]));
  lookup('SIZE').fn(s);
  assert(s.peek().type === 'integer' && s.peek().value === 3n,
    'session088: SIZE on « 1 2 + » returns 3');

  // Nested program counts as one token at the outer level
  // « « 1 2 » 3 + » has 3 tokens: [Program([1,2]), Integer(3), Name('+')]
  const inner = Program([ Integer(1n), Integer(2n) ]);
  s.push(Program([ inner, Integer(3n), Name('+') ]));
  lookup('SIZE').fn(s);
  assert(s.peek().type === 'integer' && s.peek().value === 3n,
    'session088: SIZE on program with nested sub-program counts sub-program as 1 token');

  // Single-token program
  s.push(Program([ Name('DUP') ]));
  lookup('SIZE').fn(s);
  assert(s.peek().type === 'integer' && s.peek().value === 1n,
    'session088: SIZE on single-token program returns 1');

  // Error on non-program type (regression guard: Real still bad-arg)
  let caught = null;
  s.push(Real(1.0));
  try { lookup('SIZE').fn(s); } catch (e) { caught = e; }
  assert(caught && /Bad argument type/.test(caught.message),
    'session088: SIZE on Real still throws Bad argument type');
}

{
  resetHome();

  // Seed a variety of types in the current dir.
  varStore('AR',  Real(3.14));                      // type 0
  varStore('AC',  Complex(1, 2));                   // type 1
  varStore('AS',  Str('hi'));                       // type 2
  varStore('AL',  RList([Real(1)]));                // type 5
  varStore('AP',  Program([ Integer(1n) ]));        // type 8
  varStore('AZ',  Integer(42n));                    // type 28
  varStore('AR2', Real(2.71));                      // type 0 (second Real)

  {
    const s = new Stack();
    s.push(Integer(0n));
    lookup('TVARS').fn(s);
    const r = s.peek();
    assert(r.type === 'list' && r.items.length === 2,
      'session099: TVARS 0 returns both Reals');
    const ids = r.items.map(n => n.id).sort();
    assert(ids[0] === 'AR' && ids[1] === 'AR2',
      'session099: TVARS 0 picks AR and AR2');
  }

  {
    const s = new Stack();
    s.push(Real(28));
    lookup('TVARS').fn(s);
    const r = s.peek();
    assert(r.type === 'list' && r.items.length === 1 && r.items[0].id === 'AZ',
      'session099: TVARS 28. (Real) picks Integer var AZ');
  }

  {
    const s = new Stack();
    s.push(Integer(9n));  // Algebraic / Symbolic — none stored
    lookup('TVARS').fn(s);
    const r = s.peek();
    assert(r.type === 'list' && r.items.length === 0,
      'session099: TVARS 9 with no Symbolics returns {}');
  }

  {
    const s = new Stack();
    s.push(Integer(-0n));  // -0n === 0n in BigInt semantics — use Integer(-1) route instead
    lookup('TVARS').fn(s);
    const r = s.peek();
    // -0 behaves as 0 — just a single-type positive filter.  Sanity, not the real negative test.
    assert(r.type === 'list' && r.items.length === 2,
      'session099: TVARS -0 equivalent to TVARS 0');
  }
  {
    const s = new Stack();
    s.push(Integer(-2n));
    lookup('TVARS').fn(s);
    const r = s.peek();
    // All stored types EXCEPT 2 (String): AR, AC, AL, AP, AZ, AR2 — 6 names.
    assert(r.type === 'list' && r.items.length === 6,
      'session099: TVARS -2 excludes Strings (6 remaining)');
    const ids = new Set(r.items.map(n => n.id));
    assert(!ids.has('AS'), 'session099: TVARS -2 does not include AS');
    assert(ids.has('AR') && ids.has('AC') && ids.has('AL') && ids.has('AP') && ids.has('AZ') && ids.has('AR2'),
      'session099: TVARS -2 returns every non-String var');
  }

  {
    const s = new Stack();
    s.push(RList([ Integer(0n), Integer(2n) ]));
    lookup('TVARS').fn(s);
    const r = s.peek();
    // Reals (2) + String (1) = 3 names.
    assert(r.type === 'list' && r.items.length === 3,
      'session099: TVARS {0 2} unions Reals + String');
    const ids = new Set(r.items.map(n => n.id));
    assert(ids.has('AR') && ids.has('AR2') && ids.has('AS'),
      'session099: TVARS {0 2} includes AR, AR2, AS');
  }

  {
    const s = new Stack();
    s.push(RList([ Integer(0n), Integer(2n), Integer(-2n) ]));
    lookup('TVARS').fn(s);
    const r = s.peek();
    // include = {0,2}; exclude = {2}; net = {0} → 2 Reals.
    assert(r.type === 'list' && r.items.length === 2,
      'session099: TVARS {0 2 -2} nets to just Reals after exclusion');
    const ids = new Set(r.items.map(n => n.id));
    assert(ids.has('AR') && ids.has('AR2'),
      'session099: TVARS {0 2 -2} returns only Reals');
  }

  {
    const s = new Stack();
    s.push(RList([]));
    lookup('TVARS').fn(s);
    const r = s.peek();
    assert(r.type === 'list' && r.items.length === 7,
      'session099: TVARS {} returns every var (empty include == no filter)');
  }

  {
    const s = new Stack();
    s.push(Real(3.14));
    let caught = null;
    try { lookup('TVARS').fn(s); } catch (e) { caught = e; }
    assert(caught && /Bad argument type/.test(caught.message),
      'session099: TVARS 3.14 rejects non-integer Real');
  }

  {
    const s = new Stack();
    s.push(Name('foo'));
    let caught = null;
    try { lookup('TVARS').fn(s); } catch (e) { caught = e; }
    assert(caught && /Bad argument type/.test(caught.message),
      'session099: TVARS with Name arg rejects');
  }
  {
    const s = new Stack();
    s.push(Str('bar'));
    let caught = null;
    try { lookup('TVARS').fn(s); } catch (e) { caught = e; }
    assert(caught && /Bad argument type/.test(caught.message),
      'session099: TVARS with String arg rejects');
  }

  {
    const s = new Stack();
    s.push(RList([ Integer(0n), Str('x') ]));
    let caught = null;
    try { lookup('TVARS').fn(s); } catch (e) { caught = e; }
    assert(caught && /Bad argument type/.test(caught.message),
      'session099: TVARS { 0 "x" } rejects non-integer list element');
  }

  {
    resetHome();
    const s = new Stack();
    s.push(Integer(0n));
    lookup('TVARS').fn(s);
    assert(s.peek().type === 'list' && s.peek().items.length === 0,
      'session099: TVARS on empty dir returns {}');
  }
}

/* ================================================================
   NEWOB on a Program.

   NEWOB ( obj → obj' ) is the HP50 "force a fresh copy" op.  On the
   real unit it materialises a value that was recalled by reference
   into a freshly-allocated copy.  Our implementation rebuilds every
   composite container (List / Vector / Matrix / Program) so that
   `===` against the original is false but the structural content
   round-trips.

   Sessions 047 / 047b pinned NEWOB on Real, List, Matrix.  Program
 NEWOB has been live since (the same change that
   added OBJ→ / →PRG) but no test has pinned the round-trip
   invariants for it: distinct-object identity, distinct-tokens-
   array identity, structural equality, EVAL semantics agreement,
   and structural-program (IF/THEN/ELSE/END) survival.  This
   block closes that gap.

   The lane-scope rationale for filing these under the rpl-
   programming lane (vs. the data-types lane that owns the rest of
   the NEWOB family): Program is the User-RPL programming-lane
   value type — its tokens carry the structural-keyword vocabulary
   the lane owns — and the round-trip needs to round-trip that
   vocabulary correctly.
   ================================================================ */

{
  const s = new Stack();
  const orig = Program([]);
  s.push(orig);
  lookup('NEWOB').fn(s);
  assert(s.depth === 1 && isProgram(s.peek()),
    'session146: NEWOB on empty Program leaves a Program');
  assert(s.peek() !== orig,
    'session146: NEWOB on empty Program returns a distinct object');
  assert(s.peek().tokens.length === 0,
    'session146: NEWOB on empty Program preserves zero-token shape');
}

/* ---- NEWOB on a non-empty Program returns a distinct Program with
        equal token count, distinct tokens-array, equal token shape ---- */
{
  const s = new Stack();
  const orig = Program([Integer(3n), Integer(4n), Name('+')]);
  s.push(orig);
  lookup('NEWOB').fn(s);
  const copy = s.peek();
  assert(isProgram(copy),
    'session146: NEWOB on non-empty Program leaves a Program');
  assert(copy !== orig,
    'session146: NEWOB on non-empty Program returns a distinct object');
  assert(copy.tokens !== orig.tokens,
    'session146: NEWOB on Program returns a distinct tokens array (not === to orig.tokens)');
  assert(copy.tokens.length === orig.tokens.length,
    'session146: NEWOB on Program preserves token count');
  assert(copy.tokens[0].type === 'integer' && copy.tokens[0].value === 3n,
    'session146: NEWOB Program token 0 preserves Integer(3)');
  assert(copy.tokens[1].type === 'integer' && copy.tokens[1].value === 4n,
    'session146: NEWOB Program token 1 preserves Integer(4)');
  assert(copy.tokens[2].type === 'name' && copy.tokens[2].id === '+',
    'session146: NEWOB Program token 2 preserves Name(+)');
}

{
  const s = new Stack();
  s.push(Program([Integer(1n), Integer(2n)]));
  lookup('NEWOB').fn(s);
  const copy = s.peek();
  assert(Object.isFrozen(copy.tokens),
    'session146: NEWOB on Program returns a frozen tokens array (matches Program() invariant)');
}

{
  const s = new Stack();
  const inner = Program([Name('+')]);
  const orig = Program([Integer(10n), Integer(20n), inner, Name('EVAL')]);
  s.push(orig);
  lookup('NEWOB').fn(s);
  const copy = s.peek();
  assert(isProgram(copy) && copy !== orig,
    'session146: NEWOB on nested Program returns a distinct outer Program');
  assert(copy.tokens.length === 4,
    'session146: NEWOB nested Program preserves outer token count');
  assert(isProgram(copy.tokens[2]) && copy.tokens[2].tokens.length === 1,
    'session146: NEWOB nested Program inner token is still a 1-token Program');
  // The shallow rebuild policy in `_newObCopy` re-wraps the outer
  // tokens array but does NOT recurse into nested Programs — the
  // inner Program shares identity with the original.  HP50 NEWOB
  // is one-level "decouple", so this is the contract.
  assert(copy.tokens[2] === inner,
    'session146: NEWOB on Program is a shallow copy — nested Program object identity preserved');
}

/* ---- NEWOB on a Program containing a structural-keyword body
        (IF/THEN/ELSE/END) preserves every keyword token ---- */
{
  const s = new Stack();
  const orig = Program([
    Integer(5n),
    Name('IF'), Name('DUP'), Integer(0n), Name('>'),
    Name('THEN'), Integer(100n), Name('+'),
    Name('ELSE'), Name('NEG'),
    Name('END'),
  ]);
  s.push(orig);
  lookup('NEWOB').fn(s);
  const copy = s.peek();
  assert(isProgram(copy) && copy !== orig,
    'session146: NEWOB on IF/THEN/ELSE/END Program returns distinct Program');
  assert(copy.tokens.length === orig.tokens.length,
    'session146: NEWOB on IF/THEN/ELSE/END Program preserves token count');
  // Spot-check every structural keyword survives byte-for-byte.
  const tokIds = copy.tokens.filter(t => t.type === 'name').map(t => t.id);
  const want = ['IF', 'DUP', '>', 'THEN', '+', 'ELSE', 'NEG', 'END'];
  let allHave = true;
  for (const w of want) if (!tokIds.includes(w)) { allHave = false; break; }
  assert(allHave,
    'session146: NEWOB preserves IF/THEN/ELSE/END structural keywords');
}

{
  resetHome();
  const prevApprox = calcState.approxMode;
  setApproxMode(true);
  try {
    const orig = Program([Integer(6n), Integer(7n), Name('*'), Integer(2n), Name('-')]);
    // Evaluate the original.
    const s0 = new Stack();
    s0.push(orig);
    lookup('EVAL').fn(s0);
    const t0 = s0.peek();
    const v0 = t0.type === 'integer' ? Number(t0.value)
             : t0.type === 'real'    ? t0.value.toNumber() : null;

    // Evaluate the NEWOB copy.
    const s1 = new Stack();
    s1.push(orig);
    lookup('NEWOB').fn(s1);
    const copy = s1.peek();
    assert(copy !== orig,
      'session146: NEWOB precondition — copy is a distinct Program object');
    lookup('EVAL').fn(s1);
    const t1 = s1.peek();
    const v1 = t1.type === 'integer' ? Number(t1.value)
             : t1.type === 'real'    ? t1.value.toNumber() : null;

    assert(v0 === 40 && v1 === 40 && v0 === v1,
      'session146: NEWOB-then-EVAL agrees with original-EVAL (6 7 * 2 - = 40)');
  } finally {
    setApproxMode(prevApprox);
  }
}

{
  const s = new Stack();
  const orig = Program([Integer(2n), Name('X', { quoted: true }), Name('*')]);
  s.push(orig);
  lookup('NEWOB').fn(s);
  // Now run DECOMP→STR→ on the NEWOB copy.
  lookup('DECOMP').fn(s);
  lookup('STR→').fn(s);
  const back = s.peek();
  assert(isProgram(back) && back.tokens.length === 3,
    'session146: NEWOB→DECOMP→STR→ on Program preserves shape');
  assert(back.tokens[1].type === 'name' && back.tokens[1].id === 'X' && back.tokens[1].quoted,
    'session146: NEWOB→DECOMP→STR→ preserves quoted Name token');
}

/* ================================================================
   NEWOB on Rational (audit-driven asymmetry close).

   `_newObCopy` in `www/src/rpl/ops.js` enumerated every numeric-scalar
   shape (Real / Integer / BinaryInteger / Complex) and every composite
   container (List / Vector / Matrix / Program), but Rational fell
   through the unenumerated tail and returned identity (`v`).  That
   left NEWOB on a Rational as the lone outlier vs. every sibling
   numeric-scalar shape — the same kind of audit-driven asymmetry
 closed on the OBJ→ side (BinInt and Rational fell
   through OBJ→'s dispatch and threw `Bad argument type`).

   The fix is a one-line `_newObCopy` widening:
     `if (isRational(v)) return Rational(v.n, v.d);`
   placed alongside the existing Real / Integer / BinaryInteger
   branches.  Rational's constructor performs sign-on-numerator
   normalisation + GCD reduction, so reconstructing from `(v.n, v.d)`
   is observably idempotent — the n / d payload of a Rational is
   already canonicalised at first construction.

   These pins lock in the distinct-object identity contract for
   every numeric-scalar shape NEWOB enumerates.  Companion to
 's NEWOB-on-Program cluster above.

   Why under the rpl-programming lane:  NEWOB lives in the same
   reflection / metaprogramming family as OBJ→ / →PRG / DECOMP /
   STR→ — all programming-lane scope per RPL.md's lane charter.
 The OBJ→ widening was filed here for the same
   reason; closing the matching NEWOB asymmetry is the natural
   follow-on.
   ================================================================ */

{
  const s = new Stack();
  const orig = Rational(3n, 4n);
  s.push(orig);
  lookup('NEWOB').fn(s);
  const copy = s.peek();
  assert(isRational(copy),
    'session167: NEWOB on Rational leaves a Rational on the stack');
  assert(copy !== orig,
    'session167: NEWOB on Rational returns a distinct object (not === to input; closes the audit-driven asymmetry vs. Real/Integer/BinInt which were already enumerated)');
  assert(copy.n === 3n && copy.d === 4n,
    'session167: NEWOB on Rational preserves n / d payload (3/4)');
  assert(Object.isFrozen(copy),
    'session167: NEWOB on Rational returns a frozen instance (matches Rational() constructor invariant)');
}

{
  const s = new Stack();
  const orig = Rational(-7n, 2n);
  s.push(orig);
  lookup('NEWOB').fn(s);
  const copy = s.peek();
  assert(isRational(copy) && copy !== orig,
    'session167: NEWOB on Rational(-7/2) returns a distinct Rational');
  assert(copy.n === -7n && copy.d === 2n,
    'session167: NEWOB on Rational(-7/2) preserves sign-on-numerator convention (sign rides n, denominator stays positive)');
}

{
  // Mirror of session164's OBJ→ Rational(5/1) pin — pin that NEWOB
  // does NOT auto-collapse n/1 to Integer.  A refactor that
  // canonicalises Rational(n, 1n) → Integer(n) at the NEWOB
  // boundary would break programs relying on type stability across
  // the reflection ops.
  const s = new Stack();
  const orig = Rational(5n, 1n);
  s.push(orig);
  lookup('NEWOB').fn(s);
  const copy = s.peek();
  assert(isRational(copy) && copy !== orig,
    'session167: NEWOB on Rational(5/1) returns a distinct Rational');
  assert(copy.n === 5n && copy.d === 1n,
    'session167: NEWOB on Rational(5/1) preserves n/1 shape (no auto-collapse to Integer)');
}

{
  // Rational's GCD-reduce normalises 0/anything to 0/1.  Pin that
  // NEWOB's reconstruction round-trips this canonical form.
  const s = new Stack();
  const orig = Rational(0n, 1n);
  s.push(orig);
  lookup('NEWOB').fn(s);
  const copy = s.peek();
  assert(isRational(copy) && copy !== orig,
    'session167: NEWOB on Rational(0/1) returns a distinct Rational');
  assert(copy.n === 0n && copy.d === 1n,
    'session167: NEWOB on Rational(0/1) preserves canonical zero shape');
}

/* ---- NEWOB on a List containing a Rational rebuilds the outer
        List but keeps the inner Rational identity (shallow-copy
        contract per the nested-Program pin) ---- */
{
  const s = new Stack();
  const innerRat = Rational(3n, 4n);
  const orig = RList([Integer(1n), innerRat, Real(2.5)]);
  s.push(orig);
  lookup('NEWOB').fn(s);
  const copy = s.peek();
  assert(copy !== orig,
    'session167: NEWOB on List rebuilds the outer List object');
  assert(copy.items.length === 3,
    'session167: NEWOB on List preserves item count');
  // The shallow-copy contract per : the outer container
  // is rebuilt but inner immutable values keep identity.
  assert(copy.items[1] === innerRat,
    'session167: NEWOB on List preserves nested Rational identity (shallow-copy contract — outer rebuilt, immutable inner shared)');
  assert(isRational(copy.items[1]) && copy.items[1].n === 3n && copy.items[1].d === 4n,
    'session167: NEWOB on List nested Rational payload survives by reference');
}

/* ---- NEWOB on a Tagged-of-Rational rebuilds the Tagged shell
        and preserves the inner Rational by reference ---- */
{
  const s = new Stack();
  const innerRat = Rational(3n, 4n);
  const orig = Tagged('rat', innerRat);
  s.push(orig);
  lookup('NEWOB').fn(s);
  const copy = s.peek();
  assert(copy !== orig,
    'session167: NEWOB on Tagged-of-Rational rebuilds the Tagged outer');
  assert(copy.tag === 'rat' && copy.value === innerRat,
    'session167: NEWOB on Tagged-of-Rational preserves tag + inner Rational identity (shallow-copy contract)');
}

/* ---- NEWOB on Rational composes correctly with the OBJ→ Rational
 push-back branch added — a NEWOB-then-OBJ→
        round-trip leaves an equal Rational on the stack with
        distinct-object identity from the original ---- */
{
  const s = new Stack();
  const orig = Rational(3n, 4n);
  s.push(orig);
  lookup('NEWOB').fn(s);
  const afterNewob = s.peek();
  lookup('OBJ→').fn(s);
  const afterObjTo = s.peek();
  assert(isRational(afterObjTo),
    'session167: NEWOB-then-OBJ→ on Rational leaves a Rational on stack');
  assert(afterObjTo === afterNewob,
    'session167: OBJ→ on a Rational push-back is identity (per s163 branch — same instance, no further re-wrap)');
  assert(afterObjTo !== orig,
    'session167: NEWOB-then-OBJ→ on Rational is distinct from the original input (NEWOB rebuild survives the OBJ→ push-back)');
  assert(afterObjTo.n === 3n && afterObjTo.d === 4n,
    'session167: NEWOB-then-OBJ→ on Rational preserves the 3/4 payload');
}

/* ================================================================
 NEWOB follow-up edges.

 The NEWOB widening enumerated every numeric-scalar
   shape (Real / Integer / BinaryInteger / Rational / Complex) in
   _newObCopy at www/src/rpl/ops.js:9309-9314, but only the
 Rational arm got hard-assertion pin coverage above (
 covered Real / List / Matrix; covered Program;
 covered Rational + List-of-Rational + Tagged-of-
   Rational + NEWOB→OBJ→ composition on Rational).

   The other three numeric-scalar arms (Integer / BinaryInteger /
   Complex) and their Tagged-of-X composition shapes have been
 live since but have no hard-assertion pin set. A
   refactor that drops one of those branches from _newObCopy
   would silently regress the distinct-object identity contract
   without surfacing a test failure.  These pins close that
 shoulder by mirroring 's pin pattern onto the three
   remaining numeric-scalar arms + extending the container
 composition coverage to Vector ( covered List +
   Tagged of Rational; this run adds Vector-of-Real shallow-copy
   contract + List-of-Tagged-of-Real nested composition + the
 empty-List boundary that 's pin set did not
   enumerate).

   Why under the unit-tests lane (not rpl-programming):  this is
   pure coverage closure of an already-shipped enumeration; no
   source-side widening, no behaviour change. 's own
   widening (the Rational branch) was rpl-programming-lane scope
   because it edited www/src/rpl/ops.js; this follow-up only
   touches tests/.
   ================================================================ */

{
  const s = new Stack();
  const orig = Integer(42n);
  s.push(orig);
  lookup('NEWOB').fn(s);
  const copy = s.peek();
  assert(isInteger(copy),
    'session168: NEWOB on Integer leaves an Integer on the stack');
  assert(copy !== orig,
    'session168: NEWOB on Integer returns a distinct object (mirror of s167 Rational distinct-object pin onto the Integer arm of the s163/s167 numeric-scalar enumeration; pins _newObCopy:9311 isInteger branch fired)');
  assert(copy.value === 42n,
    'session168: NEWOB on Integer preserves BigInt value (42n)');
}

{
  const s = new Stack();
  const orig = Integer(-7n);
  s.push(orig);
  lookup('NEWOB').fn(s);
  const copy = s.peek();
  assert(isInteger(copy) && copy !== orig,
    'session168: NEWOB on Integer(-7) returns a distinct Integer');
  assert(copy.value === -7n,
    'session168: NEWOB on Integer(-7) preserves negative sign on BigInt value');
}

{
  const s = new Stack();
  const orig = BinaryInteger(0x15n, 'h');
  s.push(orig);
  lookup('NEWOB').fn(s);
  const copy = s.peek();
  assert(isBinaryInteger(copy),
    'session168: NEWOB on BinaryInteger leaves a BinaryInteger on the stack');
  assert(copy !== orig,
    'session168: NEWOB on BinaryInteger returns a distinct object (pins _newObCopy:9312 isBinaryInteger branch — mirror of s167 Rational identity-decoupling pin onto BinInt)');
  assert(copy.value === 0x15n,
    'session168: NEWOB on BinaryInteger preserves BigInt value (#15h = 21)');
  assert(copy.base === 'h',
    'session168: NEWOB on BinaryInteger preserves base ("h" not normalised to "d") — pins the second BinInt() constructor argument is threaded through');
}

{
  // Mirror of 's OBJ→ #7o octal-base preservation pin
  // applied to the NEWOB sibling op.  Closes the BIN_BASES quartet
  // (h / d / b / o) on NEWOB; the .h pin above + this .o pin
  // demonstrate base-string is preserved across reconstruction.
  const s = new Stack();
  const orig = BinaryInteger(7n, 'o');
  s.push(orig);
  lookup('NEWOB').fn(s);
  const copy = s.peek();
  assert(isBinaryInteger(copy) && copy !== orig,
    'session168: NEWOB on BinaryInteger(#7o) returns a distinct BinaryInteger');
  assert(copy.base === 'o',
    'session168: NEWOB on BinaryInteger(#7o) preserves octal base');
}

{
  const s = new Stack();
  const orig = Complex(3, 4);
  s.push(orig);
  lookup('NEWOB').fn(s);
  const copy = s.peek();
  assert(isComplex(copy),
    'session168: NEWOB on Complex leaves a Complex on the stack');
  assert(copy !== orig,
    'session168: NEWOB on Complex returns a distinct object (pins _newObCopy:9314 isComplex branch — closes the numeric-scalar enumeration follow-up cluster started by s167 Rational)');
  assert(copy.re === 3 && copy.im === 4,
    'session168: NEWOB on Complex preserves re / im components (3+4i)');
}

/* ---- NEWOB on a Tagged-of-Integer rebuilds the Tagged shell
        and preserves the inner Integer by reference ---- */
{
  // Mirror of Tagged-of-Rational shallow-copy pin onto
  // the Integer arm.  Since Integer is also frozen / immutable, the
  // shallow-copy contract preserves the inner by reference.
  const s = new Stack();
  const innerInt = Integer(42n);
  const orig = Tagged('n', innerInt);
  s.push(orig);
  lookup('NEWOB').fn(s);
  const copy = s.peek();
  assert(copy !== orig,
    'session168: NEWOB on Tagged-of-Integer rebuilds the Tagged outer (mirror of s167 Tagged-of-Rational pin onto Integer arm)');
  assert(copy.tag === 'n' && copy.value === innerInt,
    'session168: NEWOB on Tagged-of-Integer preserves tag + inner Integer identity (shallow-copy contract — outer rebuilt, immutable inner shared by ref)');
}

{
  const s = new Stack();
  const innerBI = BinaryInteger(0x15n, 'h');
  const orig = Tagged('bn', innerBI);
  s.push(orig);
  lookup('NEWOB').fn(s);
  const copy = s.peek();
  assert(copy !== orig,
    'session168: NEWOB on Tagged-of-BinaryInteger rebuilds the Tagged outer');
  assert(copy.tag === 'bn' && copy.value === innerBI,
    'session168: NEWOB on Tagged-of-BinaryInteger preserves tag + inner BinInt identity (shallow-copy: inner is BinInt, base=h preserved by-ref through the outer rebuild — mirror of s164 OBJ→ Tagged-of-BinInt pin onto NEWOB)');
}

{
  const s = new Stack();
  const innerCx = Complex(1, 2);
  const orig = Tagged('cx', innerCx);
  s.push(orig);
  lookup('NEWOB').fn(s);
  const copy = s.peek();
  assert(copy !== orig,
    'session168: NEWOB on Tagged-of-Complex rebuilds the Tagged outer');
  assert(copy.tag === 'cx' && copy.value === innerCx,
    'session168: NEWOB on Tagged-of-Complex preserves tag + inner Complex identity (shallow-copy contract — closes Tagged composition for all five enumerated numeric-scalar shapes Real/Integer/BinInt/Rational/Complex; s167 covered Rational, this run covers Integer/BinInt/Complex)');
}

{
  // Closes the Tagged-of-X composition row for the Real arm.
  // only pinned Tagged-of-Rational; didn't
  // touch Tagged composition at all.  This pin completes the
  // shallow-copy composition row across all five enumerated
  // numeric-scalar shapes.
  const s = new Stack();
  const innerR = Real(2.5);
  const orig = Tagged('r', innerR);
  s.push(orig);
  lookup('NEWOB').fn(s);
  const copy = s.peek();
  assert(copy !== orig,
    'session168: NEWOB on Tagged-of-Real rebuilds the Tagged outer');
  assert(copy.tag === 'r' && copy.value === innerR,
    'session168: NEWOB on Tagged-of-Real preserves tag + inner Real identity (shallow-copy contract — closes the Tagged composition row across all five numeric-scalar shapes)');
}

/* ---- NEWOB on a Vector containing Real items rebuilds the
        outer Vector but keeps inner Real items by reference ---- */
{
  // Mirror of 's List-of-Rational shallow-copy pin onto
  // the Vector container.  Vector is the next-most-common composite
  // after List for User-RPL programs; pinned NEWOB on
  // an empty Matrix only (distinct-object) but did not pin the
  // shallow-copy contract on Vector items.  Vector items are
  // typed as Real per the constructor invariant; pin that
  // _newObCopy:9319 Vector branch's slice() rebuilds the items
  // array but preserves inner Real identity.
  const s = new Stack();
  const innerR = Real(2.5);
  const orig = Vector([Real(1), innerR, Real(3)]);
  s.push(orig);
  lookup('NEWOB').fn(s);
  const copy = s.peek();
  assert(copy !== orig,
    'session168: NEWOB on Vector rebuilds the outer Vector object (pins _newObCopy:9319 Vector branch ran)');
  assert(copy.items.length === 3,
    'session168: NEWOB on Vector preserves item count');
  assert(copy.items !== orig.items,
    'session168: NEWOB on Vector produces a distinct items array (slice() makes a fresh array, not === to orig.items)');
  assert(copy.items[1] === innerR,
    'session168: NEWOB on Vector preserves inner Real identity (shallow-copy contract — outer items array is fresh but immutable inner Real is shared by reference; mirror of s167 List-of-Rational shallow-copy pin onto the Vector container)');
}

{
  // Closes the n=0 List boundary on NEWOB. 's empty-
  // Matrix pin established the empty-container distinct-object
  // contract on Matrix; this pin extends it to the List shape.
  // Without this pin, a refactor that special-cases empty containers
  // (e.g. returning the same frozen empty literal) could silently
  // share identity between input and output.
  const s = new Stack();
  const orig = RList([]);
  s.push(orig);
  lookup('NEWOB').fn(s);
  const copy = s.peek();
  assert(copy !== orig,
    'session168: NEWOB on empty List rebuilds the outer List even at n=0 (pins no special-case empty-container short-circuit; mirror of s047 empty-Matrix distinct-object pin lifted onto List)');
  assert(copy.items.length === 0,
    'session168: NEWOB on empty List preserves zero-item count');
}

/* ---- NEWOB on a List containing a Tagged value preserves the
        inner Tagged by reference (nested composition) ---- */
{
  // Mirror of 's nested-Program inside-Program shallow-
  // copy pin, lifted onto a Tagged inner value. pinned
  // List-of-Rational (immutable inner) and List-of-Real implicit
  // via ; this pin extends to List-of-Tagged so that
  // nested composite shapes are also covered.  Tagged is itself
  // immutable, so inner identity is preserved by-ref.
  const s = new Stack();
  const innerTagged = Tagged('t', Real(7));
  const orig = RList([Integer(1n), innerTagged, Real(3)]);
  s.push(orig);
  lookup('NEWOB').fn(s);
  const copy = s.peek();
  assert(copy !== orig,
    'session168: NEWOB on List-of-Tagged rebuilds the outer List');
  assert(copy.items[1] === innerTagged,
    'session168: NEWOB on List-of-Tagged preserves nested Tagged identity (shallow-copy contract through nested composition — outer List rebuilt, immutable inner Tagged preserved by-ref; closes the s167 List-of-Rational shallow-copy pin on the Tagged inner-value composition)');
}

{
  // Companion to 's NEWOB-then-OBJ→ on Rational composition
  // pin, lifted onto the BinaryInteger arm of the s163 push-back
  // branch. The OBJ→ widening brought BinInt into the
  // push-back branch; pin that NEWOB-then-OBJ→ round-trip on BinInt
  // is identity at the OBJ→ stage (the BinInt rebuilt by NEWOB is
  // pushed back unchanged by OBJ→) and distinct from the original.
  const s = new Stack();
  const orig = BinaryInteger(0x15n, 'h');
  s.push(orig);
  lookup('NEWOB').fn(s);
  const afterNewob = s.peek();
  lookup('OBJ→').fn(s);
  const afterObjTo = s.peek();
  assert(isBinaryInteger(afterObjTo),
    'session168: NEWOB-then-OBJ→ on BinaryInteger leaves a BinaryInteger on stack');
  assert(afterObjTo === afterNewob,
    'session168: OBJ→ on a BinaryInteger push-back is identity (per s163 branch — same instance, no further re-wrap; mirror of s167 NEWOB-then-OBJ→ Rational composition pin onto BinInt)');
  assert(afterObjTo !== orig,
    'session168: NEWOB-then-OBJ→ on BinaryInteger is distinct from the original input (NEWOB rebuild survives the OBJ→ push-back; pins identity-decoupling holds across the composition)');
  assert(afterObjTo.value === 0x15n && afterObjTo.base === 'h',
    'session168: NEWOB-then-OBJ→ on BinaryInteger preserves value AND base across the round-trip (#15h survives both reflection ops intact)');
}

/* ================================================================
   NEWOB freeze-parity sweep across every enumerated
   shape.

 Audit-driven asymmetry close, sibling to 's Rational
   distinct-object widening.  Pre-172, `_newObCopy`'s Program branch
   constructed an inline object literal:

     return { type: 'program', tokens: Object.freeze([...v.tokens]) };

   The inner tokens array was frozen but the *outer* object wrapper
   was NOT — `Object.isFrozen(result)` returned `false`.  Every other
   enumerated shape goes through its factory (`Program` / `RList` /
   `Vector` / `Matrix` / `Tagged` / `Unit` / `Real` / `Integer` /
   `BinaryInteger` / `Rational` / `Complex` / `Str` / `Name` /
   `Symbolic`), each of which `Object.freeze`s the outer wrapper.
   Program alone violated `Object.isFrozen(copy) === true`.

   / 168's NEWOB pin sets covered distinct-object
   identity and inner-content shape but did not assert
 `Object.isFrozen()` on the OUTER NEWOB result. The
 Rational and follow-up pins did include
   `Object.isFrozen(copy)` for the Rational atom (line 2268) but
   only for that one shape — every other shape's outer-freeze
   property was implicitly trusted via the factory path, while the
   Program branch silently bypassed it.

   The s172 fix replaces the inline literal with `Program(v.tokens)`,
   bringing the Program branch into the same factory-mediated freeze
   contract as every sibling shape.  The pin set below exercises
   `Object.isFrozen(copy) === true` on every NEWOB-handled shape so
   any future inline-literal bypass (or a shape factory that drops
   the outer freeze) surfaces as a hard test failure rather than a
   silent identity-decoupling regression.
   ================================================================ */

{
  // Direct pin of the s172 fix: Program's outer Object.isFrozen()
  // contract.  Pre-fix this assertion failed; the inner tokens array
  // freeze (already pinned at session146:2120) was not enough to make
  // the *outer* wrapper frozen.
  const s = new Stack();
  const orig = Program([Integer(3n), Integer(4n), Name('+')]);
  s.push(orig);
  lookup('NEWOB').fn(s);
  const copy = s.peek();
  assert(isProgram(copy) && copy !== orig,
    'session172: NEWOB on Program returns a distinct Program (precondition for freeze pin)');
  assert(Object.isFrozen(copy),
    'session172: NEWOB on Program returns a FROZEN outer wrapper (closes the audit-driven asymmetry vs. every other shape\'s factory-mediated freeze; pre-172 the inline `{ type: \'program\', tokens: ... }` literal was unfrozen)');
}

{
  // Boundary case — empty token array.  Pre-fix this also produced an
  // unfrozen outer wrapper since the bypass was unconditional.
  const s = new Stack();
  const orig = Program([]);
  s.push(orig);
  lookup('NEWOB').fn(s);
  const copy = s.peek();
  assert(isProgram(copy) && copy !== orig && copy.tokens.length === 0,
    'session172: NEWOB on empty Program returns distinct empty Program (precondition)');
  assert(Object.isFrozen(copy),
    'session172: NEWOB on empty Program returns a FROZEN outer wrapper (the s172 fix is shape-uniform — empty body does not skip the factory path)');
}

/* ---- NEWOB freeze parity across every enumerated shape ----
   Composite containers (List / Vector / Matrix), every numeric-
   scalar shape (Real / Integer / BinaryInteger / Rational /
   Complex), and the Tagged / Unit / String / Name / Symbolic
   wrappers all produce a frozen outer wrapper.  Defensive sweep:
   any future shape factory that drops the outer freeze, or any
   future _newObCopy branch that bypasses the factory, surfaces
   here as a hard failure. */
{
  const cases = [
    ['Real',     Real(3.14)],
    ['Integer',  Integer(42n)],
    ['BinInt',   BinaryInteger(0x15n, 'h')],
    ['Rational', Rational(7n, 2n)],
    ['Complex',  Complex(1, 2)],
    ['String',   Str('hello')],
    ['Name',     Name('X')],
    ['Symbolic', Symbolic({ kind: 'Var', name: 'X' })],
    ['List',     RList([Real(1), Real(2)])],
    ['Vector',   Vector([Real(1), Real(2)])],
    ['Matrix',   Matrix([[Real(1), Real(2)], [Real(3), Real(4)]])],
    ['Tagged',   Tagged('x', Real(7))],
    ['Unit',     Unit(2.5, [['m', 1]])],
  ];
  for (const [name, orig] of cases) {
    const s = new Stack();
    s.push(orig);
    lookup('NEWOB').fn(s);
    const copy = s.peek();
    assert(copy !== orig,
      `session172: NEWOB on ${name} returns a distinct outer object (sweep precondition)`);
    assert(Object.isFrozen(copy),
      `session172: NEWOB on ${name} returns a FROZEN outer wrapper (factory-mediated freeze contract — closes any future inline-literal bypass like the pre-172 Program branch)`);
  }
}

/* ---- Programs constructed via NEWOB resist outer-property mutation
        (sentinel that `Object.isFrozen()` is enforced by the JS
        runtime, not just claimed by the type system) ---- */
{
  // Hard sentinel: writing to a frozen outer property in non-strict
  // mode is silently ignored; in strict mode it throws.  Either way,
  // a successful mutation would leave a different value visible on
  // the field.  Test that NEWOB's Program output rejects an attempted
  // outer-field overwrite.  (The test file's modules are ESM, which
  // run in implicit-strict mode, so the assignment will throw and the
  // try/catch confirms the freeze.)
  const s = new Stack();
  const orig = Program([Integer(1n), Integer(2n)]);
  s.push(orig);
  lookup('NEWOB').fn(s);
  const copy = s.peek();
  let threwOnMutation = false;
  try {
    copy.tokens = ['mutated'];
  } catch (_e) {
    threwOnMutation = true;
  }
  assert(threwOnMutation,
    'session172: NEWOB on Program produces an outer wrapper that rejects field reassignment under strict-mode (Object.isFrozen contract is RUNTIME-enforced; pre-172 this assignment silently succeeded because the outer literal was unfrozen)');
  // Even if the strict-mode throw didn't fire, the field must still
  // hold the original tokens array — a belt-and-suspenders pin.
  assert(Array.isArray(copy.tokens) && copy.tokens.length === 2,
    'session172: NEWOB Program outer field still holds the original tokens array after the failed mutation attempt');
}

/* ---- NEWOB-then-DECOMP-then-STR→ round-trip on a Program is
        invariant after the freeze fix (smoke test that the factory
        switch did not change observable Program semantics) ---- */
{
  // The NEWOB-then-EVAL pin already covered behavioural
  // equivalence; this pin closes the formatter side — DECOMP on a
  // NEWOB-copied Program produces the same source string as DECOMP
  // on the original.  Any divergence here would indicate the factory
  // path produced a Program with a different internal shape.
  const orig = Program([Integer(6n), Integer(7n), Name('*')]);

  const sA = new Stack();
  sA.push(orig);
  lookup('DECOMP').fn(sA);
  const decompOrig = sA.peek().value;

  const sB = new Stack();
  sB.push(orig);
  lookup('NEWOB').fn(sB);
  lookup('DECOMP').fn(sB);
  const decompCopy = sB.peek().value;

  assert(decompOrig === decompCopy,
    'session172: NEWOB-then-DECOMP on Program produces the same source-form string as DECOMP on the original (factory switch preserves observable Program shape end-to-end)');
}

/* ---- NEWOB on a Directory is the documented exception: identity
        fall-through, NOT a decoupled frozen copy ----
   Every enumerated shape in _newObCopy (Real/Integer/BinInt/Rational/
   Complex/String/Name/Symbolic/List/Vector/Matrix/Program/Tagged/Unit)
   is rebuilt into a distinct FROZEN outer wrapper — the session172
   sweep pins that for all 14.  Directory deliberately falls past every
   branch and returns the input unchanged: a Directory is a live mutable
   container (STO writes into it, PURGE removes from it), so handing back
   a frozen snapshot would be wrong.  The constructor leaves it unfrozen
   on purpose (types.js ~359).  This block pins the inverse contract —
   `copy === orig`, NOT frozen, live `entries` Map shared by reference —
   so a future _newObCopy that adds an over-eager Directory branch (or a
   universal freeze of all NEWOB outputs) surfaces here rather than
   silently breaking directory mutation. */
{
  const s = new Stack();
  const entries = new Map([['A', Integer(1n)]]);
  const orig = Directory({ name: 'MYDIR', entries });
  s.push(orig);
  lookup('NEWOB').fn(s);
  const copy = s.peek();
  assert(isDirectory(copy),
    'session338: NEWOB on a Directory leaves a Directory on the stack');
  assert(copy === orig,
    'session338: NEWOB on a Directory returns the SAME object — identity fall-through, the documented exception to the decoupling contract every enumerated shape obeys (a live mutable container must not be snapshotted)');
  assert(!Object.isFrozen(copy),
    'session338: NEWOB on a Directory stays unfrozen — deliberately mutable (the opposite of the session172 freeze-parity sweep across the 14 enumerated shapes)');
  assert(copy.entries === entries,
    'session338: NEWOB on a Directory preserves the live entries Map by reference (no shallow rebuild — STO/PURGE keep writing into the same store)');
  assert(copy.name === 'MYDIR',
    'session338: NEWOB on a Directory preserves the directory name');
}

/* ================================================================
   DECOMP → STR→ round-trip for the structural-keyword family
   (CASE, IFERR, IF, WHILE, DO, START, FOR + auto-close variants).
   Pins that the formatter's canonical keyword form parses back
   through DECOMP→STR→.  A regression in either the formatter
   (mis-spelled keyword, dropped delimiter) or the parser (missing
   tokenisation rule) for any one of these constructs would surface
   here.
   ================================================================ */

{
  resetHome();
  const prevApprox = calcState.approxMode;
  setApproxMode(true);
  try {
    // « IFERR 1 0 / THEN 99 ELSE 7 END »  — divide-by-zero trapped,
    // THEN clause runs and pushes 99.
    const src = Program([
      Name('IFERR'), Integer(1n), Integer(0n), Name('/'),
      Name('THEN'), Integer(99n),
      Name('ELSE'), Integer(7n),
      Name('END'),
    ]);
    const back = _roundTripProgram(src);
    assert(back.tokens.length === src.tokens.length,
      'session146: DECOMP→STR→ preserves IFERR/THEN/ELSE/END token count');
    const s = new Stack();
    s.push(back);
    lookup('EVAL').fn(s);
    const top = s.peek();
    const v = top.type === 'integer' ? Number(top.value)
            : top.type === 'real'    ? top.value.toNumber() : null;
    assert(v === 99,
      'session146: DECOMP→STR→ on IFERR program preserves trap-then-THEN semantics');
  } finally {
    setApproxMode(prevApprox);
  }
}

{
  resetHome();
  const prevApprox = calcState.approxMode;
  setApproxMode(true);
  try {
    // « 0 1 WHILE DUP 5 < REPEAT 1 + END SWAP DROP »
    //   loop var stays on top of stack, increments until ≥ 5,
    //   then SWAP DROP cleans up the initial 0.  Final: 5.
    const src = Program([
      Integer(0n), Integer(1n),
      Name('WHILE'), Name('DUP'), Integer(5n), Name('<'),
      Name('REPEAT'), Integer(1n), Name('+'),
      Name('END'),
      Name('SWAP'), Name('DROP'),
    ]);
    const back = _roundTripProgram(src);
    assert(back.tokens.length === src.tokens.length,
      'session146: DECOMP→STR→ preserves WHILE/REPEAT/END token count');
    const s = new Stack();
    s.push(back);
    lookup('EVAL').fn(s);
    const top = s.peek();
    const v = top.type === 'integer' ? Number(top.value)
            : top.type === 'real'    ? top.value.toNumber() : null;
    assert(v === 5,
      'session146: DECOMP→STR→ on WHILE program preserves loop semantics (1 → 5)');
  } finally {
    setApproxMode(prevApprox);
  }
}

{
  resetHome();
  const prevApprox = calcState.approxMode;
  setApproxMode(true);
  try {
    // « 1 DO 2 * DUP 16 ≥ UNTIL END »  — doubles starting from 1
    // until value ≥ 16.  Trace: 1→2→4→8→16, stop.  Final: 16.
    const src = Program([
      Integer(1n),
      Name('DO'), Integer(2n), Name('*'), Name('DUP'), Integer(16n), Name('≥'),
      Name('UNTIL'),
      Name('END'),
    ]);
    const back = _roundTripProgram(src);
    assert(back.tokens.length === src.tokens.length,
      'session146: DECOMP→STR→ preserves DO/UNTIL/END token count');
    const s = new Stack();
    s.push(back);
    lookup('EVAL').fn(s);
    const top = s.peek();
    const v = top.type === 'integer' ? Number(top.value)
            : top.type === 'real'    ? top.value.toNumber() : null;
    assert(v === 16,
      'session146: DECOMP→STR→ on DO/UNTIL program preserves loop semantics (1 → 16)');
  } finally {
    setApproxMode(prevApprox);
  }
}

{
  resetHome();
  const prevApprox = calcState.approxMode;
  setApproxMode(true);
  try {
    // « 0 1 4 START 1 + NEXT »  — counted loop 1..4, body increments
    // accumulator each iteration.  Final: 4.
    const src = Program([
      Integer(0n),
      Integer(1n), Integer(4n),
      Name('START'), Integer(1n), Name('+'),
      Name('NEXT'),
    ]);
    const back = _roundTripProgram(src);
    assert(back.tokens.length === src.tokens.length,
      'session146: DECOMP→STR→ preserves START/NEXT token count');
    const s = new Stack();
    s.push(back);
    lookup('EVAL').fn(s);
    const top = s.peek();
    const v = top.type === 'integer' ? Number(top.value)
            : top.type === 'real'    ? top.value.toNumber() : null;
    assert(v === 4,
      'session146: DECOMP→STR→ on START/NEXT program preserves loop semantics (4 iters → 4)');
  } finally {
    setApproxMode(prevApprox);
  }
}

{
  resetHome();
  const prevApprox = calcState.approxMode;
  setApproxMode(true);
  try {
    // « 0 1 4 FOR i i + NEXT »  — sum 1+2+3+4 = 10.
    const src = Program([
      Integer(0n),
      Integer(1n), Integer(4n),
      Name('FOR'), Name('i'), Name('i'), Name('+'),
      Name('NEXT'),
    ]);
    const back = _roundTripProgram(src);
    assert(back.tokens.length === src.tokens.length,
      'session146: DECOMP→STR→ preserves FOR/NEXT token count');
    const s = new Stack();
    s.push(back);
    lookup('EVAL').fn(s);
    const top = s.peek();
    const v = top.type === 'integer' ? Number(top.value)
            : top.type === 'real'    ? top.value.toNumber() : null;
    assert(v === 10,
      'session146: DECOMP→STR→ on FOR/NEXT program preserves loop semantics (sum 1..4 = 10)');
  } finally {
    setApproxMode(prevApprox);
  }
}

{
  resetHome();
  const prevApprox = calcState.approxMode;
  setApproxMode(true);
  try {
    // « 2 CASE DUP 1 == THEN "one" END DUP 2 == THEN "two" END "other" END »
    //   Test value 2 → "two" branch fires, picks the matching string.
    const src = Program([
      Integer(2n),
      Name('CASE'),
        Name('DUP'), Integer(1n), Name('=='), Name('THEN'), Str('one'), Name('END'),
        Name('DUP'), Integer(2n), Name('=='), Name('THEN'), Str('two'), Name('END'),
        Str('other'),
      Name('END'),
    ]);
    const back = _roundTripProgram(src);
    assert(back.tokens.length === src.tokens.length,
      'session146: DECOMP→STR→ preserves CASE token count');
    const s = new Stack();
    s.push(back);
    lookup('EVAL').fn(s);
    const top = s.peek();
    assert(top.type === 'string' && top.value === 'two',
      'session146: DECOMP→STR→ on CASE program preserves dispatch (2 → "two")');
  } finally {
    setApproxMode(prevApprox);
  }
}

{
  resetHome();
  const prevApprox = calcState.approxMode;
  setApproxMode(true);
  try {
    // « 3 4 → a b « a b * » »  — multiply locals → 12.
    const inner = Program([Name('a'), Name('b'), Name('*')]);
    const src = Program([
      Integer(3n), Integer(4n),
      Name('→'), Name('a'), Name('b'),
      inner,
    ]);
    const back = _roundTripProgram(src);
    assert(back.tokens.length === src.tokens.length,
      'session146: DECOMP→STR→ preserves → (compiled-local) token count');
    const s = new Stack();
    s.push(back);
    lookup('EVAL').fn(s);
    const top = s.peek();
    const v = top.type === 'integer' ? Number(top.value)
            : top.type === 'real'    ? top.value.toNumber() : null;
    assert(v === 12,
      'session146: DECOMP→STR→ on → program preserves local-binding semantics (3 4 → a b → 12)');
  } finally {
    setApproxMode(prevApprox);
  }
}
