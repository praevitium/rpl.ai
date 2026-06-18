import { Stack } from '../www/src/rpl/stack.js';
import { lookup } from '../www/src/rpl/ops.js';
import {
  Real, Integer, Rational, BinaryInteger, Complex, Name, Str, Directory, Program, Tagged,
  RList, Vector, Matrix, Symbolic, Unit,
  isReal, isInteger, isRational, isBinaryInteger, isComplex, isDirectory, isProgram, isName,
  isString,
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
import { assert, assertThrows } from './helpers.mjs';

/* Comparisons (==, ≠, <, >, ≤, ≥), logical ops (AND/OR/XOR/NOT), TRUE/FALSE. */

/* ================================================================
   Comparison + logical ops — HP50 booleans are Reals: 1. = true, 0.
   ================================================================ */

{
  const s = new Stack();
  s.push(Real(3)); s.push(Integer(3));
  lookup('==').fn(s);
  assert(s.peek().value.eq(1), '3.0 == 3 (int) is true');
  s.clear();
  s.push(Real(1)); s.push(Real(2));
  lookup('==').fn(s);
  assert(s.peek().value.eq(0), '1 == 2 is false');
}

{
  const s = new Stack();
  s.push(Real(1)); s.push(Real(2));
  lookup('<').fn(s);
  assert(s.peek().value.eq(1), '1 < 2');
  s.clear();
  s.push(Real(5)); s.push(Real(5));
  lookup('≤').fn(s);
  assert(s.peek().value.eq(1), '5 ≤ 5');
  s.clear();
  s.push(Real(5)); s.push(Real(6));
  lookup('>=').fn(s);
  assert(s.peek().value.eq(0), '5 >= 6 is false');
  s.clear();
  s.push(Real(3)); s.push(Real(4));
  lookup('<>').fn(s);
  assert(s.peek().value.eq(1), '3 <> 4 is true');
}

{
  const s = new Stack();
  s.push(Name('X')); s.push(Name('X'));
  lookup('==').fn(s);
  assert(s.peek().value.eq(1), "Name(`X`) == Name(`X`)");
  s.clear();
  s.push(Str('foo')); s.push(Str('bar'));
  lookup('==').fn(s);
  assert(s.peek().value.eq(0), "`foo` != `bar`");
}

{
  const s = new Stack();
  s.push(Real(1)); s.push(Real(0)); lookup('AND').fn(s);
  assert(s.peek().value.eq(0), '1 AND 0 = 0');
  s.clear();
  s.push(Real(1)); s.push(Real(0)); lookup('OR').fn(s);
  assert(s.peek().value.eq(1), '1 OR 0 = 1');
  s.clear();
  s.push(Real(1)); s.push(Real(1)); lookup('XOR').fn(s);
  assert(s.peek().value.eq(0), '1 XOR 1 = 0');
  s.clear();
  s.push(Real(0)); lookup('NOT').fn(s);
  assert(s.peek().value.eq(1), 'NOT 0 = 1');
  s.clear();
  s.push(Real(42)); lookup('NOT').fn(s);
  assert(s.peek().value.eq(0), 'NOT 42 = 0');
}

{
  const s = new Stack();
  lookup('TRUE').fn(s);  assert(s.peek().value.eq(1), 'TRUE pushes 1');
  lookup('FALSE').fn(s); assert(s.peek().value.eq(0), 'FALSE pushes 0');
}

/* ================================================================
   Comparisons expansion (HP50 AUR §4)

   Reference: HP50 AUR §4 "Real-number calculator commands", tables 4-1
   and 4-2 on the type matrix of comparison operators.  Quick summary:
     =     equation builder: always returns a Symbolic.
     ==    strict structural: numeric promotes; non-numerics compare
           by their "content" (names by id, strings by char-for-char,
           lists/vectors/matrices structurally, symbolics by AST).
     SAME  structural including types — does NOT lift to Symbolic;
           always returns a Real 1. / 0.
     ≠     negation of ==, also lifts to Symbolic when an operand is
           Symbolic/Name.
     < > ≤ ≥  numeric comparison; Symbolic/Name lift to a single
           Symbolic chain; Strings compare lexicographically by char
           codes (User Guide App-J).

   Tests that assert a current-day gap are guarded with a `.skip`-
   equivalent (commented-out `assert` + logged `KNOWN GAP`) so the
   suite stays green and the gap is visible.
   ================================================================ */

{
  const s = new Stack();
  s.push(Complex(3, 4)); s.push(Complex(3, 4));
  lookup('==').fn(s);
  assert(s.peek().value.eq(1), 'session068: (3,4) == (3,4) is true');
}
{
  const s = new Stack();
  s.push(Complex(1, 2)); s.push(Complex(1, 3));
  lookup('==').fn(s);
  assert(s.peek().value.eq(0), 'session068: (1,2) == (1,3) is false (im differs)');
}
{
  const s = new Stack();
  s.push(Complex(2, 0)); s.push(Complex(0, 2));
  lookup('==').fn(s);
  assert(s.peek().value.eq(0), 'session068: (2,0) == (0,2) is false (swap re/im)');
}
{
  const s = new Stack();
  s.push(Complex(5, 0)); s.push(Real(5));
  lookup('==').fn(s);
  assert(s.peek().value.eq(1),
    'session068: (5,0) == 5 is true (promotion folds to complex compare)');
}
{
  const s = new Stack();
  s.push(Complex(3, 4)); s.push(Real(3));
  lookup('==').fn(s);
  assert(s.peek().value.eq(0),
    'session068: (3,4) == 3 is false (imaginary part differs)');
}
{
  const s = new Stack();
  s.push(Complex(1, 2)); s.push(Complex(1, 2));
  lookup('≠').fn(s);
  assert(s.peek().value.eq(0), 'session068: (1,2) ≠ (1,2) is false');
}
{
  const s = new Stack();
  s.push(Complex(1, 2)); s.push(Complex(3, 4));
  lookup('≠').fn(s);
  assert(s.peek().value.eq(1), 'session068: (1,2) ≠ (3,4) is true');
}

{
  const s = new Stack();
  s.push(Complex(1, 2)); s.push(Complex(3, 4));
  assertThrows(() => lookup('<').fn(s), /Bad argument type/i,
    'session068: (1,2) < (3,4) rejects — no total order on ℂ when im≠0');
}

/* ---- session341: ordered ops (< > ≤ ≥) — comparePair kind-branch
   coercion arms with a positive ordered result --------------------------
   session068 covers the equality-cluster (`==`) Complex/Real fold and the
   Complex-im≠0 ordered *rejection*; session127/132 cover Q×R and Z×Q
   ordered. But two of comparePair's kind branches (ops.js ~5185) had no
   positive *ordered* pin:
     • the `p.kind === 'complex'` ZERO-im branch (`av = p.a.re; bv = p.b.re`)
       — only its im≠0 throw was pinned, never the real-part comparison that
       fires when both operands fold to Complex with zero imaginary part;
     • the `p.kind === 'real'` branch (`p.a.toNumber()`) reached by a MIXED
       Integer/Real pair — every prior `< > ≤ ≥` Real pin was both-Real.
   Probed all live first; no source change. Guards a refactor that drops the
   zero-im real-part extraction or narrows the mixed-pair real coercion. */
{
  const s = new Stack();
  s.push(Complex(2, 0)); s.push(Complex(5, 0));
  lookup('<').fn(s);
  assert(s.peek().value.eq(1),
    'session341: (2,0) < (5,0) → 1 (both fold to Complex, zero im → real-part compare)');
}
{
  const s = new Stack();
  s.push(Complex(5, 0)); s.push(Complex(2, 0));
  lookup('>').fn(s);
  assert(s.peek().value.eq(1), 'session341: (5,0) > (2,0) → 1');
}
{
  const s = new Stack();
  s.push(Complex(5, 0)); s.push(Complex(5, 0));
  lookup('≤').fn(s);
  assert(s.peek().value.eq(1), 'session341: (5,0) ≤ (5,0) → 1 (equal real parts)');
}
{
  const s = new Stack();
  s.push(Complex(5, 0)); s.push(Complex(6, 0));
  lookup('≥').fn(s);
  assert(s.peek().value.eq(0), 'session341: (5,0) ≥ (6,0) → 0');
}
{
  const s = new Stack();
  s.push(Complex(5, 0)); s.push(Real(5));
  lookup('≤').fn(s);
  assert(s.peek().value.eq(1),
    'session341: (5,0) ≤ 5 → 1 (Complex × Real folds to Complex, zero im, equal)');
}
{
  const s = new Stack();
  s.push(Real(3)); s.push(Complex(5, 0));
  lookup('<').fn(s);
  assert(s.peek().value.eq(1),
    'session341: 3 < (5,0) → 1 (Real × Complex direction, zero im)');
}
{
  const s = new Stack();
  s.push(Complex(5, 1)); s.push(Real(3));
  assertThrows(() => lookup('<').fn(s), /Bad argument type/i,
    'session341: (5,1) < 3 rejects — Complex × Real with non-zero im has no ordering');
}
{
  const s = new Stack();
  s.push(Integer(7n)); s.push(Real(7.5));
  lookup('<').fn(s);
  assert(s.peek().value.eq(1),
    'session341: Integer(7) < Real(7.5) → 1 (mixed Z/R folds to the real kind)');
}
{
  const s = new Stack();
  s.push(Real(7.5)); s.push(Integer(7n));
  lookup('>').fn(s);
  assert(s.peek().value.eq(1),
    'session341: Real(7.5) > Integer(7) → 1 (mixed R/Z direction)');
}
{
  const s = new Stack();
  s.push(Integer(7n)); s.push(Real(7));
  lookup('≤').fn(s);
  assert(s.peek().value.eq(1),
    'session341: Integer(7) ≤ Real(7) → 1 (mixed pair, equal value boundary)');
}
{
  const s = new Stack();
  s.push(Real(2.5)); s.push(Integer(3n));
  lookup('≥').fn(s);
  assert(s.peek().value.eq(0),
    'session341: Real(2.5) ≥ Integer(3) → 0 (mixed pair, strict ordering)');
}

{
  const s = new Stack();
  s.push(Name('X')); s.push(Name('X'));
  lookup('SAME').fn(s);
  assert(s.peek().value.eq(1), 'session068: SAME(X, X) on Names is true');
}
{
  const s = new Stack();
  s.push(Name('X')); s.push(Name('Y'));
  lookup('SAME').fn(s);
  assert(s.peek().value.eq(0),
    'session068: SAME(X, Y) on distinct Names is false');
}

/* ---- SAME never lifts to Symbolic (always Real 1./0.) ----
   HP50 AUR §4-7: SAME "is not defined for Algebraic and does not
   produce a symbolic result".  Our Name-vs-Name structural case above
   already produces a Real; here we just confirm Name-vs-different-Name
   doesn't sneak into a symbolic path. */
{
  const s = new Stack();
  s.push(Name('X')); s.push(Name('Y'));
  lookup('SAME').fn(s);
  const top = s.peek();
  assert(top.type === 'real',
    'session068: SAME returns a Real literal, not a Symbolic, on Name/Name mismatch');
}

/* ---- Symbolic chain lift on  <, >, ≤, ≥ ----
   Expected: two Names (or a Name and a number, or two Symbolics) on
   either side of a comparison op produce a single combined Symbolic
   with the op at the root.  Numbers on both sides fall through to the
   fast boolean path. */
{
  const s = new Stack();
  s.push(Name('X')); s.push(Name('Y'));
  lookup('<').fn(s);
  assert(s.peek().type === 'symbolic',
    'session068: Name < Name lifts to a Symbolic chain');
}
{
  const s = new Stack();
  s.push(Name('A')); s.push(Real(1));
  lookup('≤').fn(s);
  assert(s.peek().type === 'symbolic',
    'session068: Name ≤ Real lifts to Symbolic');
}
{
  const s = new Stack();
  s.push(Real(1)); s.push(Name('Z'));
  lookup('>').fn(s);
  assert(s.peek().type === 'symbolic',
    'session068: Real > Name lifts to Symbolic (symmetric lift)');
}
{
  const s = new Stack();
  s.push(Name('X')); s.push(Name('Y'));
  lookup('≥').fn(s);
  assert(s.peek().type === 'symbolic',
    'session068: Name ≥ Name lifts to Symbolic');
}

{
  const s = new Stack();
  s.push(Real(2)); s.push(Real(3));
  lookup('=').fn(s);
  assert(s.peek().type === 'symbolic',
    'session068: 2 3 = yields a Symbolic equation (not 0/1)');
}
{
  const s = new Stack();
  s.push(Name('X')); s.push(Name('X'));
  lookup('=').fn(s);
  assert(s.peek().type === 'symbolic',
    'session068: X X = yields a Symbolic equation even when both sides identical');
}

{
  const s = new Stack();
  s.push(Real(3)); s.push(Real(4));
  lookup('<=').fn(s);
  const ascii = s.peek().value;
  const t = new Stack();
  t.push(Real(3)); t.push(Real(4));
  lookup('≤').fn(t);
  const uni = t.peek().value;
  assert(ascii.eq(1) && uni.eq(1) && ascii.eq(uni),
    'session068: <= and ≤ agree on 3 4 (both 1)');
}

{
  const s = new Stack();
  s.push(Integer(7n)); s.push(Real(7));
  lookup('==').fn(s);
  assert(s.peek().value.eq(1), 'session068: Integer(7) == Real(7) is true');
}
{
  const s = new Stack();
  s.push(Integer(10n ** 30n)); s.push(Integer(10n ** 30n));
  lookup('==').fn(s);
  assert(s.peek().value.eq(1),
    'session068: 10^30 == 10^30 is true (arbitrary-precision BigInt)');
}
{
  // Real NaN-adjacent edge: HP50 rejects NaN at the Real constructor
  // so this case simply validates that the constructor guard exists —
  // a surprise NaN should never reach ==.  We do NOT test NaN == NaN.
  assertThrows(() => Real(NaN), /NaN/,
    'session068: Real(NaN) is rejected at construction (prevents NaN==NaN ambiguity)');
}

{
  const s = new Stack();
  s.push(Str('hello')); s.push(Str('hello'));
  lookup('==').fn(s);
  assert(s.peek().value.eq(1), 'session068: "hello" == "hello" is true');
}
{
  const s = new Stack();
  s.push(Str('hello')); s.push(Str('Hello'));
  lookup('==').fn(s);
  assert(s.peek().value.eq(0),
    'session068: "hello" == "Hello" is false (case-sensitive structural compare)');
}

/* ================================================================
   KNOWN GAPS — asserted via `assert(true, …)` comments only.
   These document HP50 behaviors our implementation does not yet meet.
   Each is filed in docs/TESTS.md under "Known gaps — assigned to
   <sibling lane>".  Flip to a real assertion once the sibling lane
   ships the fix.
   ---------------------------------------------------------------- */

/* ---- List / Vector structural equality via == ----
   HP50 AUR §4-2 lists Lists and Vectors as valid == operands, with
   structural semantics.  `eqValues()` in src/rpl/ops.js treats Lists
   and Vectors as structurally comparable.  See also the per-type
   sweep further down. */
{
  const s = new Stack();
  s.push(RList([Real(1), Real(2), Real(3)]));
  s.push(RList([Real(1), Real(2), Real(3)]));
  lookup('==').fn(s);
  assert(s.peek().value.eq(1),
    'session072: List == List is structural (1 for identical) — gap filed s070, fixed s072');
}
{
  const s = new Stack();
  s.push(Vector([Real(1), Real(2)]));
  s.push(Vector([Real(1), Real(2)]));
  lookup('==').fn(s);
  assert(s.peek().value.eq(1),
    'session072: Vector == Vector is structural — gap filed s070, fixed s072');
}

/* ---- String lexicographic < > ≤ ≥ ----
   HP50 User Guide App. J: string comparisons are char-code lex. */
{
  // "a" < "b" — basic ascending order
  {
    const s = new Stack();
    s.push(Str('a')); s.push(Str('b'));
    lookup('<').fn(s);
    assert(s.peek().value.eq(1),
      'session087: "a" < "b" = 1 (String lex <)');
  }
  // "b" > "a"
  {
    const s = new Stack();
    s.push(Str('b')); s.push(Str('a'));
    lookup('>').fn(s);
    assert(s.peek().value.eq(1),
      'session087: "b" > "a" = 1 (String lex >)');
  }
  // "abc" ≤ "abd"
  {
    const s = new Stack();
    s.push(Str('abc')); s.push(Str('abd'));
    lookup('≤').fn(s);
    assert(s.peek().value.eq(1),
      'session087: "abc" ≤ "abd" = 1 (String lex ≤, differ at last char)');
  }
  // "z" ≥ "z" (equal strings)
  {
    const s = new Stack();
    s.push(Str('z')); s.push(Str('z'));
    lookup('≥').fn(s);
    assert(s.peek().value.eq(1),
      'session087: "z" ≥ "z" = 1 (equal strings)');
  }
  // "b" < "a" = 0 (regression guard)
  {
    const s = new Stack();
    s.push(Str('b')); s.push(Str('a'));
    lookup('<').fn(s);
    assert(s.peek().value.eq(0),
      'session087: "b" < "a" = 0 (regression guard)');
  }
  // Mixed String + Real still rejected
  assertThrows(
    () => { const s = new Stack(); s.push(Str('x')); s.push(Real(1)); lookup('<').fn(s); },
    /Bad argument type/,
    'session087: String < Real throws Bad argument type (no cross-type lift for <)'
  );

  // -------- session102: String lex — edge cases --------
  // Prefix ordering (HP50 App. J: "shorter prefix is less").
  {
    const s = new Stack();
    s.push(Str('ab')); s.push(Str('abc'));
    lookup('<').fn(s);
    assert(s.peek().value.eq(1),
      'session102: "ab" < "abc" = 1 (shorter prefix is less; HP50 App. J)');
  }
  {
    const s = new Stack();
    s.push(Str('abc')); s.push(Str('ab'));
    lookup('<').fn(s);
    assert(s.peek().value.eq(0),
      'session102: "abc" < "ab" = 0 (longer-prefix regression guard)');
  }
  // Empty-string ordering — "" is less than any non-empty string.
  {
    const s = new Stack();
    s.push(Str('')); s.push(Str('a'));
    lookup('<').fn(s);
    assert(s.peek().value.eq(1),
      'session102: "" < "a" = 1 (empty string is less than any non-empty)');
  }
  {
    const s = new Stack();
    s.push(Str('a')); s.push(Str(''));
    lookup('>').fn(s);
    assert(s.peek().value.eq(1),
      'session102: "a" > "" = 1 (empty-string symmetric guard)');
  }
  // "" ≤ "" — degenerate equal-string boundary.
  {
    const s = new Stack();
    s.push(Str('')); s.push(Str(''));
    lookup('≤').fn(s);
    assert(s.peek().value.eq(1),
      'session102: "" ≤ "" = 1 (equal empty strings)');
  }
  // Case sensitivity — ASCII order has uppercase (65..90) before lowercase (97..122).
  {
    const s = new Stack();
    s.push(Str('A')); s.push(Str('a'));
    lookup('<').fn(s);
    assert(s.peek().value.eq(1),
      'session102: "A" < "a" = 1 (ASCII uppercase precedes lowercase; case-sensitive)');
  }
  // Non-ASCII char — use '~' (126) vs 'A' (65) — '~' > 'A' by code.
  {
    const s = new Stack();
    s.push(Str('~')); s.push(Str('A'));
    lookup('>').fn(s);
    assert(s.peek().value.eq(1),
      'session102: "~" > "A" = 1 (char-code lex on printable range)');
  }

  // -------- session287: ordered comparators are scalar-only --------
  // DATA_TYPES documents L/V/M/T/U as `✗` on `<`/`>`/`≤`/`≥`:
  // `comparePair` accepts only `isNumber` (+ BinInt-coerce, String-lex,
  // Sy-lift); List/Vector/Matrix/Tagged/Unit all reach the `!isNumber`
  // guard and throw.  Only String×Real (s087) and String-lex (s102) were
  // pinned; the collection/wrapper/Unit rejections were unguarded against
  // a refactor that widens `comparePair` past scalars.
  for (const op of ['<', '>', '≤', '≥']) {
    const cases = [
      [() => RList([Real(1)]),     'List'],
      [() => Vector([Real(1)]),    'Vector'],
      [() => Matrix([[Real(1)]]),  'Matrix'],
      [() => Tagged('x', Real(1)), 'Tagged'],
      [() => Unit(1, 'm'),         'Unit'],
    ];
    for (const [mk, label] of cases) {
      assertThrows(
        () => { const s = new Stack(); s.push(mk()); s.push(label === 'Unit' ? Unit(2, 'm') : Real(2)); lookup(op).fn(s); },
        /Bad argument type/,
        `session287: ${label} ${op} → Bad argument type (comparePair is scalar-only)`
      );
    }
  }
}

/* ---- SAME on structurally identical Symbolics ----
   HP50 AUR §4-7 documents SAME as strictly structural.  `eqValues()`
   has an `isSymbolic(a) && isSymbolic(b)` branch that calls a local
   `_astStructEqual` over the AST; uses a properly-shaped parser AST
   (via parseEntry — parser emits `{kind,...}`). */
{
  const [symA] = parseEntry("`A+B`");
  const [symB] = parseEntry("`A+B`");
  const s = new Stack();
  s.push(symA); s.push(symB);
  lookup('SAME').fn(s);
  assert(s.peek().value.eq(1),
    'session072: SAME on structurally identical Symbolics returns 1 — gap filed s070, fixed s072');
}

{
  // NOT on Real(0) = 1; NOT on any non-zero = 0.
  const s = new Stack();
  s.push(Real(-3));
  lookup('NOT').fn(s);
  assert(s.peek().value.eq(0),
    'session068: NOT(-3) = 0 (any non-zero is truthy, HP50 flag-style logic)');
}
{
  // AND / OR / XOR short-circuit truth table (Real operands).
  const truth = [
    ['AND', 0, 0, 0], ['AND', 1, 0, 0], ['AND', 0, 1, 0], ['AND', 1, 1, 1],
    ['OR',  0, 0, 0], ['OR',  1, 0, 1], ['OR',  0, 1, 1], ['OR',  1, 1, 1],
    ['XOR', 0, 0, 0], ['XOR', 1, 0, 1], ['XOR', 0, 1, 1], ['XOR', 1, 1, 0],
  ];
  let allOk = true;
  for (const [op, a, b, want] of truth) {
    const s = new Stack();
    s.push(Real(a)); s.push(Real(b));
    lookup(op).fn(s);
    if (!s.peek().value.eq(want)) allOk = false;
  }
  assert(allOk,
    'session068: Real AND/OR/XOR truth table (12 rows) all correct');
}
{
  // session432: AND/OR/XOR route non-BinInt operands through isTruthy
  // (ops.js ~5237: `const x = isTruthy(a), y = isTruthy(b)`), but every
  // prior pin fed only Real operands — so the Integer arm, the Complex arm,
  // and the reject arm of isTruthy were never exercised through the logical
  // ops.  A refactor narrowing binaryLogic to a Real-only coercion would pass
  // the session068 truth table yet break `Integer 5 Integer 0 AND` and a
  // pure-imaginary operand.  isTruthy's Integer arm is value !== 0n, its
  // Complex arm is re !== 0 || im !== 0, else `Bad argument type`.
  const I = (n) => Integer(BigInt(n));
  const apply = (op, a, b) => {
    const s = new Stack();
    s.push(a); s.push(b);
    lookup(op).fn(s);
    return s.peek();
  };
  // Integer arm — flag-style truthiness, not bitwise (that path needs BinInt).
  assert(apply('AND', I(5), I(0)).value.eq(0),
    'session432: Integer 5 AND 0 = 0 (0n is falsy)');
  assert(apply('AND', I(5), I(3)).value.eq(1),
    'session432: Integer 5 AND 3 = 1 (both non-zero are truthy)');
  assert(apply('OR', I(0), I(0)).value.eq(0),
    'session432: Integer 0 OR 0 = 0');
  assert(apply('OR', I(5), I(0)).value.eq(1),
    'session432: Integer 5 OR 0 = 1');
  assert(apply('XOR', I(5), I(3)).value.eq(0),
    'session432: Integer 5 XOR 3 = 0 (both truthy)');
  assert(apply('XOR', I(0), I(4)).value.eq(1),
    'session432: Integer 0 XOR 4 = 1 (exactly one truthy)');
  // Complex arm — truthy iff either component is non-zero.
  assert(apply('AND', Complex(0, 2), Complex(3, 4)).value.eq(1),
    'session432: Complex (0,2) AND (3,4) = 1 (both truthy)');
  assert(apply('AND', Complex(0, 0), Complex(3, 4)).value.eq(0),
    'session432: Complex (0,0) AND (3,4) = 0 (zero complex is falsy)');
  assert(apply('OR', Complex(0, 0), Complex(0, 0)).value.eq(0),
    'session432: Complex (0,0) OR (0,0) = 0');
  assert(apply('XOR', Complex(0, 2), Complex(0, 0)).value.eq(1),
    'session432: Complex (0,2) XOR (0,0) = 1 (exactly one truthy)');
  // Mixed non-Real / Real operands still route through isTruthy per slot.
  assert(apply('AND', I(5), Real(0)).value.eq(0),
    'session432: Integer 5 AND Real 0 = 0 (per-operand truthiness)');
  assert(apply('OR', Complex(0, 2), Real(0)).value.eq(1),
    'session432: Complex (0,2) OR Real 0 = 1');
  // Reject arm — a non-numeric operand in either slot hits isTruthy's throw.
  assertThrows(() => apply('AND', Str('x'), I(1)), 'Bad argument type',
    'session432: String AND Integer rejects (isTruthy else-throw, level 2)');
  assertThrows(() => apply('AND', I(1), Str('x')), 'Bad argument type',
    'session432: Integer AND String rejects (level 1)');
  assertThrows(() => apply('XOR', I(1), Str('x')), 'Bad argument type',
    'session432: Integer XOR String rejects');
  assertThrows(() => apply('OR', Complex(0, 2), Str('x')), 'Bad argument type',
    'session432: Complex OR String rejects');
}

/* ================================================================
   Structural equality on List / Vector / Matrix / Symbolic / Tagged /
   Unit via == and SAME — the full per-type sweep.  Covers positive +
   negative + length-mismatch + nested + cross-type-rejection for each.
   ================================================================ */
{
  const s = new Stack();
  s.push(RList([Real(1), Real(2), Real(3)]));
  s.push(RList([Real(1), Real(2), Real(3)]));
  lookup('SAME').fn(s);
  assert(s.peek().value.eq(1), 'session072: SAME {1,2,3} {1,2,3} = 1');
}
{
  const s = new Stack();
  s.push(RList([Real(1), Real(2)]));
  s.push(RList([Real(1), Real(2), Real(3)]));
  lookup('==').fn(s);
  assert(s.peek().value.eq(0), 'session072: {1,2} == {1,2,3} = 0 (length mismatch)');
}
{
  const s = new Stack();
  s.push(RList([Real(1), Real(2), Real(3)]));
  s.push(RList([Real(1), Real(2), Real(4)]));
  lookup('==').fn(s);
  assert(s.peek().value.eq(0), 'session072: {1,2,3} == {1,2,4} = 0');
}
{
  const s = new Stack();
  s.push(RList([RList([Real(1), Real(2)]), Real(3)]));
  s.push(RList([RList([Real(1), Real(2)]), Real(3)]));
  lookup('==').fn(s);
  assert(s.peek().value.eq(1), 'session072: { {1,2} 3 } == { {1,2} 3 } = 1');
}
{
  const s = new Stack();
  s.push(RList([Real(1), Real(2)]));
  s.push(RList([Integer(1n), Integer(2n)]));
  lookup('==').fn(s);
  assert(s.peek().value.eq(1),
    'session072: { 1. 2. } == { 1 2 } = 1 (numeric promotion inside list)');
}
{
  const s = new Stack();
  s.push(Vector([Real(3), Real(4)]));
  s.push(Vector([Real(3), Real(4)]));
  lookup('==').fn(s);
  assert(s.peek().value.eq(1), 'session072: [3 4] == [3 4] = 1');
}
{
  const s = new Stack();
  s.push(Vector([Real(3), Real(4)]));
  s.push(Vector([Real(4), Real(3)]));
  lookup('==').fn(s);
  assert(s.peek().value.eq(0), 'session072: [3 4] == [4 3] = 0 (order-sensitive)');
}
{
  const s = new Stack();
  s.push(Vector([Real(1), Real(2)]));
  s.push(RList([Real(1), Real(2)]));
  lookup('==').fn(s);
  assert(s.peek().value.eq(0),
    'session072: [1 2] == {1 2} = 0 (different container types are not equal)');
}
{
  const s = new Stack();
  s.push(Matrix([[Real(1), Real(2)], [Real(3), Real(4)]]));
  s.push(Matrix([[Real(1), Real(2)], [Real(3), Real(4)]]));
  lookup('==').fn(s);
  assert(s.peek().value.eq(1), 'session072: [[1 2][3 4]] == [[1 2][3 4]] = 1');
}
{
  const s = new Stack();
  s.push(Matrix([[Real(1), Real(2)]]));
  s.push(Matrix([[Real(1), Real(2)], [Real(3), Real(4)]]));
  lookup('==').fn(s);
  assert(s.peek().value.eq(0), 'session072: matrix row-count mismatch → 0');
}
{
  const s = new Stack();
  s.push(Matrix([[Real(1), Real(2)], [Real(3), Real(4)]]));
  s.push(Matrix([[Real(1), Real(2)], [Real(3), Real(5)]]));
  lookup('SAME').fn(s);
  assert(s.peek().value.eq(0), 'session072: SAME matrix cell mismatch → 0');
}
{
  const [a] = parseEntry("`X+Y`");
  const [b] = parseEntry("`X+Y`");
  const s = new Stack();
  s.push(a); s.push(b);
  lookup('==').fn(s);
  assert(s.peek().value.eq(1), "session072: `X+Y` == `X+Y` = 1");
}
{
  const [a] = parseEntry("`X+Y`");
  const [b] = parseEntry("`Y+X`");
  const s = new Stack();
  s.push(a); s.push(b);
  lookup('==').fn(s);
  assert(s.peek().value.eq(0),
    "session072: `X+Y` == `Y+X` = 0 (commutativity is a CAS concern, not ==)");
}
{
  const [a] = parseEntry("`SIN(X)`");
  const [b] = parseEntry("`SIN(X)`");
  const s = new Stack();
  s.push(a); s.push(b);
  lookup('SAME').fn(s);
  assert(s.peek().value.eq(1), "session072: SAME `SIN(X)` `SIN(X)` = 1");
}
{
  const [a] = parseEntry("`SIN(X)`");
  const [b] = parseEntry("`COS(X)`");
  const s = new Stack();
  s.push(a); s.push(b);
  lookup('==').fn(s);
  assert(s.peek().value.eq(0), "session072: `SIN(X)` == `COS(X)` = 0 (fn-name differs)");
}
{
  const [a] = parseEntry("`X^2+SIN(X)`");
  const [b] = parseEntry("`X^2+SIN(X)`");
  const s = new Stack();
  s.push(a); s.push(b);
  lookup('==').fn(s);
  assert(s.peek().value.eq(1), "session072: `X^2+SIN(X)` structural match");
}
{
  const s = new Stack();
  s.push(Tagged('price', Real(200)));
  s.push(Tagged('price', Real(200)));
  lookup('SAME').fn(s);
  assert(s.peek().value.eq(1),
    'session072: SAME price:200 price:200 = 1 (tag + value match)');
}
{
  const s = new Stack();
  s.push(Tagged('price', Real(200)));
  s.push(Tagged('cost',  Real(200)));
  lookup('==').fn(s);
  assert(s.peek().value.eq(0),
    'session072: price:200 == cost:200 = 0 (tag differs)');
}
{
  const s = new Stack();
  s.push(Tagged('x', Real(1)));
  s.push(Tagged('x', Real(2)));
  lookup('==').fn(s);
  assert(s.peek().value.eq(0), 'session072: x:1 == x:2 = 0 (value differs)');
}
{
  const [a] = parseEntry('1_m');
  const [b] = parseEntry('1_m');
  const s = new Stack();
  s.push(a); s.push(b);
  lookup('==').fn(s);
  assert(s.peek().value.eq(1), 'session072: 1_m == 1_m = 1');
}
{
  const [a] = parseEntry('1_m');
  const [b] = parseEntry('1_km');
  const s = new Stack();
  s.push(a); s.push(b);
  lookup('==').fn(s);
  assert(s.peek().value.eq(0),
    'session072: 1_m == 1_km = 0 (different uexpr even though both are lengths)');
}
{
  const [a] = parseEntry('1_m');
  const [b] = parseEntry('2_m');
  const s = new Stack();
  s.push(a); s.push(b);
  lookup('==').fn(s);
  assert(s.peek().value.eq(0), 'session072: 1_m == 2_m = 0 (value differs)');
}
/* ================================================================
   session362: SAME on Units.  The block header above promises "Unit via
   == AND SAME", but the session072 Unit pins only exercise `==` — `SAME`
   on a Unit was unpinned anywhere in the suite.  SAME routes through the
   same `eqValues` Unit branch (ops.js ~5003: value-equal AND structural
   uexpr-equal) as `==`, but SAME's contract differs by type: it does NOT
   cross-coerce (`SAME #10h Integer(16)` = 0) and Directory SAME is
   reference identity.  These pin that Unit SAME stays *structural* —
   two distinct allocations that match on value + uexpr are SAME, unlike
   Directory — so a refactor extending "SAME = identity" to Units fails.
   No source change.  Probed live first.
   ================================================================ */
{
  const [a] = parseEntry('1_m');
  const [b] = parseEntry('1_m');
  const s = new Stack();
  s.push(a); s.push(b);
  assert(a !== b, 'session362: parseEntry yields distinct Unit allocations');
  lookup('SAME').fn(s);
  assert(s.peek().value.eq(1),
    'session362: SAME 1_m 1_m = 1 (structural, not reference identity — contrast Directory)');
}
{
  const [a] = parseEntry('1_m');
  const [b] = parseEntry('1_km');
  const s = new Stack();
  s.push(a); s.push(b);
  lookup('SAME').fn(s);
  assert(s.peek().value.eq(0),
    'session362: SAME 1_m 1_km = 0 (same value, uexpr differs — no dim-equivalence coercion)');
}
{
  const [a] = parseEntry('1_m');
  const [b] = parseEntry('2_m');
  const s = new Stack();
  s.push(a); s.push(b);
  lookup('SAME').fn(s);
  assert(s.peek().value.eq(0), 'session362: SAME 1_m 2_m = 0 (value differs)');
}
{
  const [a] = parseEntry('1_m/s');
  const [b] = parseEntry('1_m/s');
  const s = new Stack();
  s.push(a); s.push(b);
  lookup('SAME').fn(s);
  assert(s.peek().value.eq(1), 'session362: SAME 1_m/s 1_m/s = 1 (compound uexpr matches)');
}
{
  const [a] = parseEntry('1_m/s');
  const [b] = parseEntry('1_m');
  const s = new Stack();
  s.push(a); s.push(b);
  lookup('SAME').fn(s);
  assert(s.peek().value.eq(0), 'session362: SAME 1_m/s 1_m = 0 (compound vs simple uexpr)');
}
/* ================================================================
   session363: SAME on Tagged.  The same gap session362 closed for Units,
   one type over.  The session072 Tagged pins exercise the `eqValues`
   Tagged branch (ops.js ~5000: `a.tag === b.tag && eqValues(a.value,
   b.value)`) via `==` (and one SAME tag+value-match), but never pinned
   SAME's distinguishing contract on a Tagged: that it is *structural*
   (two distinct allocations matching on tag + value are SAME, unlike a
   Directory, whose SAME is reference identity) and that it recurses into
   the wrapped value without type-coercion (the outer `==` BinInt widening
   in `_binIntCrossNormalize` does NOT reach inside a Tagged value, so a
   Tagged-of-#16h is never SAME — nor `==` — a Tagged-of-Integer(16)).
   No source change.  Probed live first.
   ================================================================ */
{
  const a = Tagged('price', Real(200));
  const b = Tagged('price', Real(200));
  const s = new Stack();
  s.push(a); s.push(b);
  assert(a !== b, 'session363: distinct Tagged allocations');
  lookup('SAME').fn(s);
  assert(s.peek().value.eq(1),
    'session363: SAME price:200 price:200 = 1 (structural — tag + value match, not reference identity like Directory)');
}
{
  const s = new Stack();
  s.push(Tagged('price', Real(200)));
  s.push(Tagged('cost', Real(200)));
  lookup('SAME').fn(s);
  assert(s.peek().value.eq(0), 'session363: SAME price:200 cost:200 = 0 (tag differs)');
}
{
  const s = new Stack();
  s.push(Tagged('x', Real(1)));
  s.push(Tagged('x', Real(2)));
  lookup('SAME').fn(s);
  assert(s.peek().value.eq(0), 'session363: SAME x:1 x:2 = 0 (value differs)');
}
{
  const s = new Stack();
  s.push(Tagged('v', RList([Real(1), Real(2)])));
  s.push(Tagged('v', RList([Real(1), Real(2)])));
  lookup('SAME').fn(s);
  assert(s.peek().value.eq(1), 'session363: SAME v:{1 2} v:{1 2} = 1 (recurses into nested value)');
}
{
  const s = new Stack();
  s.push(Tagged('v', RList([Real(1), Real(2)])));
  s.push(Tagged('v', RList([Real(1), Real(3)])));
  lookup('SAME').fn(s);
  assert(s.peek().value.eq(0), 'session363: SAME v:{1 2} v:{1 3} = 0 (nested value differs)');
}
{
  const s = new Stack();
  s.push(Tagged('h', BinaryInteger(16n)));
  s.push(Tagged('h', Integer(16)));
  lookup('SAME').fn(s);
  assert(s.peek().value.eq(0),
    'session363: SAME h:#16 h:16 = 0 (no type-coercion through the value — BinInt widening stays at the outer level)');
}

/* ----------------------------------------------------------------
   session375: SAME on List / Vector / Matrix — the structural arm.
   The same gap session362 (Unit) and session363 (Tagged) closed, one
   collection over.  `eqValues`' List/Vector/Matrix branches (`ops.js`
   ~4990) recurse via `_eqArr` → `eqValues`, so they are structural:
   two distinct allocations that match elementwise are SAME, unlike a
   Directory whose SAME is reference identity (~5018).  The session072
   collection pins are almost entirely `==` — the lone List SAME (above)
   does not assert distinct allocations, Vector has no SAME pin at all,
   and Matrix has only a negative cell-mismatch SAME — so a refactor
   extending "SAME = reference identity" to collections, dropping the
   `_eqArr` recursion, or letting the outer `_binIntCrossNormalize`
   widening leak inside a collection would pass green.  The BinInt arm
   is the collection analogue of session363's Tagged-of-#16h case: the
   widening is applied only at the top level (the operands here are
   List/Vector, not BinInt), so a collection-of-#16h is never SAME — nor
   `==` — a collection-of-Integer(16).  Probed all arms live first.
   ---------------------------------------------------------------- */
{
  const a = RList([Real(1), Real(2), Real(3)]);
  const b = RList([Real(1), Real(2), Real(3)]);
  assert(a !== b, 'session375: distinct List allocations');
  const s = new Stack();
  s.push(a); s.push(b);
  lookup('SAME').fn(s);
  assert(s.peek().value.eq(1),
    'session375: SAME {1 2 3} {1 2 3} = 1 (structural, not reference identity — contrast Directory)');
}
{
  const s = new Stack();
  s.push(RList([RList([Real(1), Real(2)]), Real(3)]));
  s.push(RList([RList([Real(1), Real(2)]), Real(3)]));
  lookup('SAME').fn(s);
  assert(s.peek().value.eq(1),
    'session375: SAME { {1 2} 3 } { {1 2} 3 } = 1 (recurses into nested List value)');
}
{
  const s = new Stack();
  s.push(RList([BinaryInteger(16n)]));
  s.push(RList([Integer(16)]));
  lookup('SAME').fn(s);
  assert(s.peek().value.eq(0),
    'session375: SAME {#16} {16} = 0 (no BinInt coercion through the collection)');
}
{
  const s = new Stack();
  s.push(RList([BinaryInteger(16n)]));
  s.push(RList([Integer(16)]));
  lookup('==').fn(s);
  assert(s.peek().value.eq(0),
    'session375: {#16} == {16} = 0 (cross-normalize stays at the outer level)');
}
{
  const a = Vector([Real(3), Real(4)]);
  const b = Vector([Real(3), Real(4)]);
  assert(a !== b, 'session375: distinct Vector allocations');
  const s = new Stack();
  s.push(a); s.push(b);
  lookup('SAME').fn(s);
  assert(s.peek().value.eq(1),
    'session375: SAME [3 4] [3 4] = 1 (structural, not reference identity)');
}
{
  const s = new Stack();
  s.push(Vector([Real(3), Real(4)]));
  s.push(Vector([Real(4), Real(3)]));
  lookup('SAME').fn(s);
  assert(s.peek().value.eq(0),
    'session375: SAME [3 4] [4 3] = 0 (order-sensitive)');
}
{
  const a = Matrix([[Real(1), Real(2)], [Real(3), Real(4)]]);
  const b = Matrix([[Real(1), Real(2)], [Real(3), Real(4)]]);
  assert(a !== b, 'session375: distinct Matrix allocations');
  const s = new Stack();
  s.push(a); s.push(b);
  lookup('SAME').fn(s);
  assert(s.peek().value.eq(1),
    'session375: SAME [[1 2][3 4]] [[1 2][3 4]] = 1 (structural, not reference identity)');
}

{
  const s = new Stack();
  s.push(RList([Real(1)])); s.push(Str('1'));
  lookup('==').fn(s);
  assert(s.peek().value.eq(0),
    'session072: {1} == "1" = 0 (cross-type: list ≠ string)');
}
{
  // Symbolic vs Real — cross-type is never equal via == (numeric Real would
  // need to be lifted to symbolic by `+`-family ops, not by ==).
  const [a] = parseEntry("`X`");
  const s = new Stack();
  s.push(a); s.push(Real(5));
  // Note: `==` does NOT call `_trySymCompare`; it goes straight to
  // `eqValues`, which returns false on Sy-vs-Real.  This is intentional
  // per the docstring on register('=='): "strict structural equality".
  lookup('==').fn(s);
  assert(s.peek().value.eq(0),
    "session072: `X` == 5 = 0 (== is strictly structural, no symbolic lift)");
}

/* ================================================================
   session107: Rational (Q) comparisons — promotion-lattice peer

   Q participates in Z ⊂ Q ⊂ R ⊂ C, so ==, <, ≤, >, ≥, <>, SAME all
   flow through promoteNumericPair.  Coverage for this type was
 absent from test-comparisons.mjs prior to (grep for
   `Rational` in this file returned zero matches at entry).  See
 docs/DATA_TYPES.md notes for the Rational rollout.
   ================================================================ */

{
  // Q is canonicalised at construction (sign on numerator, reduced by
  // gcd) so Rational(2,4) and Rational(1,2) are the SAME frozen shape
  // — eqValues' rational branch compares { n, d } by BigInt equality.
  const s = new Stack();
  s.push(Rational(1, 2));
  s.push(Rational(2, 4));
  lookup('==').fn(s);
  assert(s.peek().value.eq(1),
    'session107: 1/2 == 2/4 (canonicalised) → 1');
}
{
  const s = new Stack();
  s.push(Rational(-6, 9));
  s.push(Rational(-2, 3));
  lookup('==').fn(s);
  assert(s.peek().value.eq(1),
    'session107: -6/9 == -2/3 (canonical shape matches after gcd reduction)');
}
{
  const s = new Stack();
  s.push(Rational(1, 2));
  s.push(Rational(1, 3));
  lookup('==').fn(s);
  assert(s.peek().value.eq(0),
    'session107: 1/2 == 1/3 → 0');
}

{
  const s = new Stack();
  s.push(Rational(3, 1));
  s.push(Integer(3));
  lookup('==').fn(s);
  assert(s.peek().value.eq(1),
    'session107: Rational(3/1) == Integer(3) → 1 (Z promoted to Q)');
}
{
  const s = new Stack();
  s.push(Rational(1, 2));
  s.push(Integer(0));
  lookup('==').fn(s);
  assert(s.peek().value.eq(0),
    'session107: Rational(1/2) == Integer(0) → 0');
}

{
  const s = new Stack();
  s.push(Rational(1, 2));
  s.push(Real(0.5));
  lookup('==').fn(s);
  assert(s.peek().value.eq(1),
    'session107: Rational(1/2) == Real(0.5) → 1 (Q widened to R)');
}

{
  const s = new Stack();
  s.push(Rational(1, 3));
  s.push(Rational(1, 2));
  lookup('<').fn(s);
  assert(s.peek().value.eq(1), 'session107: 1/3 < 1/2 → 1');
}
{
  const s = new Stack();
  s.push(Rational(1, 2));
  s.push(Rational(1, 3));
  lookup('>').fn(s);
  assert(s.peek().value.eq(1), 'session107: 1/2 > 1/3 → 1');
}
{
  const s = new Stack();
  s.push(Rational(2, 3));
  s.push(Rational(2, 3));
  lookup('≤').fn(s);
  assert(s.peek().value.eq(1), 'session107: 2/3 ≤ 2/3 → 1 (equal accepted)');
}
{
  const s = new Stack();
  s.push(Rational(-1, 2));
  s.push(Rational(1, 2));
  lookup('<').fn(s);
  assert(s.peek().value.eq(1), 'session107: -1/2 < 1/2 → 1');
}
{
  const s = new Stack();
  s.push(Rational(3, 2));
  s.push(Integer(1));
  lookup('≥').fn(s);
  assert(s.peek().value.eq(1), 'session107: 3/2 ≥ 1 → 1 (cross-type Q × Z)');
}
{
  const s = new Stack();
  s.push(Integer(0));
  s.push(Rational(1, 2));
  lookup('<').fn(s);
  assert(s.peek().value.eq(1), 'session107: 0 < 1/2 → 1 (Z × Q direction)');
}

{
  const s = new Stack();
  s.push(Rational(1, 2));
  s.push(Rational(1, 3));
  lookup('<>').fn(s);
  assert(s.peek().value.eq(1), 'session107: 1/2 <> 1/3 → 1');
}

{
  // Unlike BinaryInteger (where SAME is strict on type), Rational goes
  // through `eqValues`'s `isNumber && isNumber` branch, which promotes
  // Z / Q / R / C pairwise.  So Rational(3/1) SAME Integer(3) = 1.
  // Pinning this so any future "Rational-strict SAME" refactor has a
  // regression guard.
  const s = new Stack();
  s.push(Rational(3, 1));
  s.push(Integer(3));
  lookup('SAME').fn(s);
  assert(s.peek().value.eq(1),
    'session107: Rational(3/1) SAME Integer(3) → 1 (numeric promotion, not type-strict)');
}
{
  const s = new Stack();
  s.push(Rational(1, 2));
  s.push(Rational(1, 2));
  lookup('SAME').fn(s);
  assert(s.peek().value.eq(1),
    'session107: Rational(1/2) SAME Rational(1/2) → 1');
}

/* ================================================================
   session127: Rational × Complex + Rational × Real cross-type
   comparison edges.  Closes a coverage gap around the Q corner of
 the promotion lattice — the block pinned Q × Q,
   Q × Z, and Q × R numerically-equal cases plus a single ordering
   pin sign-crossing.  This block adds:

     • Q < C is rejected as `Bad argument type` — same Complex-
       partial-order rejection that exists for Real < Complex
 and pinned here for Q to confirm
       the lattice rejection sits at the Complex side, not at a
       per-numeric-type wrap.
     • Q == C with non-zero im → 0 — Q lifts into the C corner
       and `eqValues` compares { re, im } pairs structurally.
     • Q == C with zero im and value-equal real part → 1 (the
       Q lifted into a {re, 0} Complex *is* equal to the existing
       Complex(re, 0) — Q widens cleanly into ℂ for ==).
     • Q <> C with non-zero im → 1 — the negation of the above.
     • Q SAME C with non-zero im → 0 (numeric-promotion SAME
       within ℂ degrades to value compare; pin the unequal case
 distinct from the Q SAME R equal-value case).
     • Q × R cross-type unequal: Q(1/3) == R(0.333) → 0 (1/3 ≠
       0.333 exactly — Q widens to its full Decimal at compare
       time, then `eqValues` numeric branch compares to R(0.333)
 and returns false). Companion to 's Q(1/2)
       == R(0.5) = 1 pin.
     • Q × R cross-type ordering: Q(1/4) < R(0.3) → 1 — pins the
 cross-type direction the block didn't cover
       (its sign-crossing test stayed in Q × Q).
   ================================================================ */

{
  const s = new Stack();
  s.push(Rational(1, 2));
  s.push(Complex(0, 1));
  assertThrows(() => { lookup('<').fn(s); },
               /Bad argument type/,
               'session127: Rational < Complex → Bad argument type (Complex partial-order rejection holds for Q too)');
}

{
  const s = new Stack();
  s.push(Rational(1, 2));
  s.push(Complex(0, 1));
  lookup('==').fn(s);
  assert(s.peek().value.eq(0),
    'session127: Rational(1/2) == Complex(0, 1) → 0 (Q lifted to {1/2, 0} ≠ {0, 1})');
}

/* ---- Q == C(im=0, value-equal) → 1 ---------------------------------- *
 * 1/2 widens to 0.5; Complex(0.5, 0) compares element-wise equal.  This
 * exercises the Q→C widening branch of `eqValues` numeric promotion. */
{
  const s = new Stack();
  s.push(Rational(1, 2));
  s.push(Complex(0.5, 0));
  lookup('==').fn(s);
  assert(s.peek().value.eq(1),
    'session127: Rational(1/2) == Complex(0.5, 0) → 1 (Q widens cleanly into ℂ for value-equal real-axis Complex)');
}

{
  const s = new Stack();
  s.push(Rational(1, 2));
  s.push(Complex(0.5, 1));
  lookup('<>').fn(s);
  assert(s.peek().value.eq(1),
    'session127: Rational(1/2) <> Complex(0.5, 1) → 1 (im≠0 makes the cross-type pair unequal)');
}

/* ---- Q SAME C(non-zero im) → 0 -------------------------------------- *
 * SAME on numeric pairs flows through promoteNumericPair (per the
 * docstring); Q lifts into ℂ as {1/2, 0}, which is not
 * SAME as {0, 1}.  Pinning the *unequal* case to balance the
 * Q SAME R equal-value pin. */
{
  const s = new Stack();
  s.push(Rational(1, 2));
  s.push(Complex(0, 1));
  lookup('SAME').fn(s);
  assert(s.peek().value.eq(0),
    'session127: Rational(1/2) SAME Complex(0, 1) → 0 (numeric promotion to ℂ, then unequal {re, im})');
}

/* ---- Q × R inequality at non-terminating decimal -------------------- *
 * 1/3 is not exactly representable in finite Decimal precision — the
 * block's Q(1/2) == R(0.5) pin used the exactly-
 * representable case.  This pin guards the *unequal* branch: 1/3
 * widens to its 15-digit Decimal (0.333333…), which is not equal to
 * R(0.333) (the 3-digit-truncated literal).  Anyone who later swaps
 * the Q→R widener for an exact-rational comparator would flip this
 * to 0 silently — this assertion catches that. */
{
  const s = new Stack();
  s.push(Rational(1, 3));
  s.push(Real(0.333));
  lookup('==').fn(s);
  assert(s.peek().value.eq(0),
    'session127: Rational(1/3) == Real(0.333) → 0 (Q widens to full-precision Decimal; 0.333… ≠ 0.333)');
}

/* ---- Q × R cross-type ordering -------------------------------------- *
 * The ordering pins all stayed in Q × Q (1/3 < 1/2,
 * 1/2 > 1/3, 2/3 ≤ 2/3, -1/2 < 1/2) plus one cross-type Q × Z
 * (3/2 ≥ 1) and one Z × Q (0 < 1/2).  Q × R direction was not pinned.
 * 1/4 = 0.25 < 0.3 — pin both directions (Q on level 2, R on level 1). */
{
  const s = new Stack();
  s.push(Rational(1, 4));
  s.push(Real(0.3));
  lookup('<').fn(s);
  assert(s.peek().value.eq(1),
    'session127: Rational(1/4) < Real(0.3) → 1 (Q × R direction)');
}
{
  const s = new Stack();
  s.push(Real(0.3));
  s.push(Rational(1, 4));
  lookup('>').fn(s);
  assert(s.peek().value.eq(1),
    'session127: Real(0.3) > Rational(1/4) → 1 (R × Q direction)');
}

/* ================================================================
   session132: Rational × Integer reverse-direction edges.

 The Q × Z block pinned Q-on-level-2 / Z-on-level-1
   for == (equal + unequal) plus a single ordering pin per
   direction (3/2 ≥ 1 in Q × Z; 0 < 1/2 in Z × Q).  The reverse
   direction for == / <> / SAME and the missing ordering ops
   (≤, < for Z × Q with sign-crossing; <> for Q × Z) were not
   pinned.  The cross-type comparator lifts both arms through
   `promoteNumericPair` so direction *should* be symmetric, but
   pinning the reverse direction per op guards against any future
   short-circuit that handles `Q on top` and `Z on top` differently
   (e.g., a fast path that only tries `_ratNumericEq(a, b)` when
   `isRational(a)`).

   Adds:
     • Z == Q equal: Integer(3) == Rational(3/1) → 1 (== direction
 symmetric to 's Q == Z = 1).
     • Z == Q unequal: Integer(0) == Rational(1/2) → 0 (companion).
     • Z <> Q cross-type: Integer(2) <> Rational(1/3) → 1.
     • Q <> Z cross-type: Rational(7/4) <> Integer(2) → 1.
     • Z SAME Q cross-type: Integer(3) SAME Rational(3/1) → 1
       (numeric promotion holds; reverse-direction companion to
 Q SAME Z = 1).
     • Z SAME Q cross-type unequal: Integer(2) SAME Rational(3/1)
       → 0 (pins the *unequal* SAME branch in Z × Q direction).
     • Z × Q sign-crossing < ordering: Integer(-1) < Rational(1/2)
 → 1 (the one Z × Q ordering pin in stayed
       within non-negative inputs).
     • Q × Z ≤ at equal cross-value: Rational(2/1) ≤ Integer(2)
       → 1 (≤ at the Q-promotes-to-Z boundary; pins the equal
       case where the underlying compare returns 0 not -1).
   ================================================================ */

{
  const s = new Stack();
  s.push(Integer(3));
  s.push(Rational(3, 1));
  lookup('==').fn(s);
  assert(s.peek().value.eq(1),
    'session132: Integer(3) == Rational(3/1) → 1 (Z × Q direction; symmetric to session-107 Q × Z)');
}
{
  const s = new Stack();
  s.push(Integer(0));
  s.push(Rational(1, 2));
  lookup('==').fn(s);
  assert(s.peek().value.eq(0),
    'session132: Integer(0) == Rational(1/2) → 0 (Z × Q unequal; reverse-direction companion)');
}

{
  const s = new Stack();
  s.push(Integer(2));
  s.push(Rational(1, 3));
  lookup('<>').fn(s);
  assert(s.peek().value.eq(1),
    'session132: Integer(2) <> Rational(1/3) → 1 (Z × Q <>)');
}
{
  const s = new Stack();
  s.push(Rational(7, 4));
  s.push(Integer(2));
  lookup('<>').fn(s);
  assert(s.peek().value.eq(1),
    'session132: Rational(7/4) <> Integer(2) → 1 (Q × Z <>)');
}

{
  const s = new Stack();
  s.push(Integer(3));
  s.push(Rational(3, 1));
  lookup('SAME').fn(s);
  assert(s.peek().value.eq(1),
    'session132: Integer(3) SAME Rational(3/1) → 1 (numeric promotion, Z × Q direction)');
}
{
  const s = new Stack();
  s.push(Integer(2));
  s.push(Rational(3, 1));
  lookup('SAME').fn(s);
  assert(s.peek().value.eq(0),
    'session132: Integer(2) SAME Rational(3/1) → 0 (Z × Q SAME unequal-value branch)');
}

/* ---- Z × Q sign-crossing ordering ----
 * pinned `0 < 1/2` (positive-only) and `-1/2 < 1/2`
 * (sign-crossing but Q×Q).  The Z × Q sign-crossing direction
 * (Integer negative on the left, positive Q on the right) wasn't
 * pinned. */
{
  const s = new Stack();
  s.push(Integer(-1));
  s.push(Rational(1, 2));
  lookup('<').fn(s);
  assert(s.peek().value.eq(1),
    'session132: Integer(-1) < Rational(1/2) → 1 (Z × Q sign-crossing ordering)');
}

/* ---- Q × Z ≤ at the equal-value cross boundary ----
 * 2/1 promotes to integer 2; ≤ on the equal-value pair must return
 * 1. covered `≥` at the equal-cross case (3/2 ≥ 1
 * was sign-crossing-different).  This is the symmetric ≤ at
 * exact equality. */
{
  const s = new Stack();
  s.push(Rational(2, 1));
  s.push(Integer(2));
  lookup('≤').fn(s);
  assert(s.peek().value.eq(1),
    'session132: Rational(2/1) ≤ Integer(2) → 1 (Q × Z equal-value boundary; ≤ accepts equal)');
}

/* ================================================================
   session355: Rational kind cross-multiply ordered branch —
   NEGATIVE-numerator pairs across < > ≤ ≥.

   comparePair's `rational` kind branch (ops.js ~5192) extracts the
   comparable scalars by cross-multiplying:
     av = p.a.n * p.b.d;  bv = p.b.n * p.a.d;
   This is correct only because `d` is always positive after Rational
   sign-normalization (the sign lives in `n`).  session127/132's Z × Q
   ordered pins reach this branch but only with positive Rational
   numerators (the lone negative came from an Integer-derived {n<0, d:1}
   pair — `Integer(-1) < Rational(1/2)`), so the sign handling on a
   genuine negative-numerator Rational with a NON-UNIT denominator was
   unguarded for the ordered comparators.  A refactor that dropped the
   sign-normalization invariant (letting `d` go negative) or formed a
   real first would flip these.  Probed all arms live first.
   ================================================================ */

{
  const s = new Stack();
  s.push(Rational(-3, 4));
  s.push(Rational(-1, 2));
  lookup('<').fn(s);
  assert(s.peek().value.eq(1),
    'session355: Rational(-3/4) < Rational(-1/2) → 1 (both negative numerators, non-unit denoms; -.75 < -.5)');
}
{
  const s = new Stack();
  s.push(Rational(-1, 2));
  s.push(Rational(-3, 4));
  lookup('>').fn(s);
  assert(s.peek().value.eq(1),
    'session355: Rational(-1/2) > Rational(-3/4) → 1 (reverse direction of the same negative pair)');
}
{
  const s = new Stack();
  s.push(Rational(-2, 3));
  s.push(Rational(-2, 3));
  lookup('≤').fn(s);
  assert(s.peek().value.eq(1),
    'session355: Rational(-2/3) ≤ Rational(-2/3) → 1 (equal negative-numerator boundary; cross-products tie)');
}
{
  const s = new Stack();
  s.push(Rational(-1, 4));
  s.push(Rational(-1, 2));
  lookup('≥').fn(s);
  assert(s.peek().value.eq(1),
    'session355: Rational(-1/4) ≥ Rational(-1/2) → 1 (-.25 ≥ -.5)');
}
{
  const s = new Stack();
  s.push(Rational(-1, 2));
  s.push(Rational(1, 3));
  lookup('<').fn(s);
  assert(s.peek().value.eq(1),
    'session355: Rational(-1/2) < Rational(1/3) → 1 (sign-crossing, negative numerator on level 2)');
}
{
  const s = new Stack();
  s.push(Rational(-1, 2));
  s.push(Rational(1, 3));
  lookup('>').fn(s);
  assert(s.peek().value.eq(0),
    'session355: Rational(-1/2) > Rational(1/3) → 0 (negative not greater than positive; guards a sign flip)');
}
{
  const s = new Stack();
  s.push(Rational(1, -2));
  s.push(Rational(1, 3));
  lookup('<').fn(s);
  assert(s.peek().value.eq(1),
    'session355: Rational(1/-2) < Rational(1/3) → 1 (denom-supplied sign normalizes to n<0, d>0)');
}
{
  const s = new Stack();
  s.push(Rational(-3, -4));
  s.push(Rational(1, 2));
  lookup('>').fn(s);
  assert(s.peek().value.eq(1),
    'session355: Rational(-3/-4) > Rational(1/2) → 1 (double negative normalizes to 3/4 > 1/2)');
}
{
  const s = new Stack();
  s.push(Rational(-5, 2));
  s.push(Integer(-2));
  lookup('<').fn(s);
  assert(s.peek().value.eq(1),
    'session355: Rational(-5/2) < Integer(-2) → 1 (Q × Z both negative; -2.5 < -2 via cross-multiply)');
}
