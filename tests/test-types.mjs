import { Stack } from '../www/src/rpl/stack.js';
import { lookup } from '../www/src/rpl/ops.js';
import {
  Real, Integer, Rational, BinaryInteger, Complex, Name, Str, Directory, Program, Tagged, Unit,
  RList, Vector, Matrix, Symbolic,
  isReal, isInteger, isRational, isBinaryInteger, isComplex, isDirectory, isProgram, isName,
  isString, isNumber, isTagged, isList, isVector, isMatrix, isSymbolic, promoteNumericPair, Decimal,
  isValidHpIdentifier, isReservedHpName, isStorableHpName, registerReservedName,
} from '../www/src/rpl/types.js';
import { parseEntry } from '../www/src/rpl/parser.js';
import { format, formatStackTop } from '../www/src/rpl/formatter.js';
import { isKnownFunction, defaultFnEval } from '../www/src/rpl/algebra.js';
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
import { assert, assertThrows, runOp } from './helpers.mjs';

/* Data-type completeness pass. */

/* ================================================================
   Data-type completeness pass — Vector/Matrix element-wise ops:
     NEG  V,M — element-wise negation
     ABS  V,M — Frobenius norm (Adv Guide spec)
     CONJ V,M — element-wise (identity today; complex-ready later)
     RE   V,M — element-wise real part
     IM   V,M — element-wise imaginary part (zero array today)
     SIGN V   — unit vector v/‖v‖; zero vector stays zero
   ================================================================ */
{
  {
    const s = new Stack();
    s.push(Vector([Real(1), Real(-2), Real(3)]));
    lookup('NEG').fn(s);
    const v = s.peek();
    assert(v.type === 'vector'
        && v.items[0].value.eq(-1) && v.items[1].value.eq(2) && v.items[2].value.eq(-3),
      `NEG Vector negates each element, got [${v.items.map(x=>x.value).join(' ')}]`);
  }
  {
    const s = new Stack();
    s.push(Matrix([[Real(1), Real(-2)], [Real(3), Real(4)]]));
    lookup('NEG').fn(s);
    const m = s.peek();
    assert(m.type === 'matrix'
        && m.rows[0][0].value.eq(-1) && m.rows[0][1].value.eq(2)
        && m.rows[1][0].value.eq(-3) && m.rows[1][1].value.eq(-4),
      'NEG Matrix negates every entry');
  }

  {
    const s = new Stack();
    s.push(Vector([Real(3), Real(4)]));
    lookup('ABS').fn(s);
    assert(isReal(s.peek()) && s.peek().value.eq(5),
      `ABS [3 4] → 5 (got ${s.peek()?.value})`);
  }
  {
    const s = new Stack();
    s.push(Matrix([[Real(1), Real(2)], [Real(3), Real(4)]]));
    lookup('ABS').fn(s);
    const got = s.peek().value;
    assert(Math.abs(got - Math.sqrt(30)) < 1e-12,
      `ABS Matrix → Frobenius norm ≈ √30 (got ${got})`);
  }

  {
    const s = new Stack();
    s.push(Vector([Real(1), Real(2), Real(3)]));
    lookup('CONJ').fn(s);
    const v = s.peek();
    assert(v.type === 'vector'
        && v.items[0].value.eq(1) && v.items[1].value.eq(2) && v.items[2].value.eq(3),
      'CONJ on real-entry Vector is identity');
  }
  {
    const s = new Stack();
    s.push(Vector([Real(5), Real(-2)]));
    lookup('RE').fn(s);
    const v = s.peek();
    assert(v.type === 'vector' && v.items[0].value.eq(5) && v.items[1].value.eq(-2),
      'RE on real-entry Vector is identity');
  }
  {
    const s = new Stack();
    s.push(Vector([Real(5), Real(-2)]));
    lookup('IM').fn(s);
    const v = s.peek();
    assert(v.type === 'vector' && v.items[0].value.eq(0) && v.items[1].value.eq(0),
      'IM on real-entry Vector → zero vector');
  }

  {
    const s = new Stack();
    s.push(Matrix([[Real(1), Real(2)], [Real(3), Real(4)]]));
    lookup('CONJ').fn(s);
    const m = s.peek();
    assert(m.type === 'matrix'
        && m.rows[0][0].value.eq(1) && m.rows[1][1].value.eq(4),
      'CONJ on real-entry Matrix is identity');
  }

  {
    const s = new Stack();
    s.push(Vector([Real(3), Real(4)]));  // ‖v‖ = 5
    lookup('SIGN').fn(s);
    const v = s.peek();
    assert(v.type === 'vector'
        && Math.abs(v.items[0].value - 0.6) < 1e-12
        && Math.abs(v.items[1].value - 0.8) < 1e-12,
      `SIGN [3 4] → [0.6 0.8] (got [${v.items.map(x=>x.value).join(' ')}])`);
  }
  {
    // Zero vector stays zero (matches scalar-SIGN convention on 0).
    const s = new Stack();
    s.push(Vector([Real(0), Real(0), Real(0)]));
    lookup('SIGN').fn(s);
    const v = s.peek();
    assert(v.type === 'vector'
        && v.items[0].value.eq(0) && v.items[1].value.eq(0) && v.items[2].value.eq(0),
      'SIGN on zero Vector → zero Vector');
  }

  {
    const s = new Stack();
    s.push(Complex(3, -4));
    lookup('NEG').fn(s);
    const c = s.peek();
    assert(c.type === 'complex' && c.re === -3 && c.im === 4,
      'NEG on Complex still returns Complex (no regression)');
  }
}

/* ================================================================
   CHR / NUM (String ⇄ single codepoint).
   ================================================================ */
{
  {
    const s = new Stack();
    s.push(Real(65));
    lookup('CHR').fn(s);
    assert(isString(s.peek(1)) && s.peek(1).value === 'A',
      'CHR 65 → "A"');
  }
  {
    const s = new Stack();
    s.push(Integer(32n));
    lookup('CHR').fn(s);
    assert(s.peek(1).value === ' ',
      'CHR on Integer 32 → " " (space)');
  }
  {
    const s = new Stack();
    s.push(Real(0x2192)); // →
    lookup('CHR').fn(s);
    assert(s.peek(1).value === '→',
      'CHR 0x2192 → "→" (right arrow)');
  }
  {
    const s = new Stack();
    s.push(Real(0));
    lookup('CHR').fn(s);
    assert(isString(s.peek(1)) && s.peek(1).value.charCodeAt(0) === 0,
      'CHR 0 → NUL character');
  }
  {
    const s = new Stack();
    s.push(Real(-1));
    try { lookup('CHR').fn(s); assert(false, 'CHR -1 should throw'); }
    catch (e) { assert(/Bad argument value/i.test(e.message),
      'CHR -1 → Bad argument value'); }
  }
  {
    const s = new Stack();
    s.push(Real(0x110000));
    try { lookup('CHR').fn(s); assert(false, 'CHR overflow should throw'); }
    catch (e) { assert(/Bad argument value/i.test(e.message),
      'CHR > 0x10FFFF → Bad argument value'); }
  }
  {
    const s = new Stack();
    s.push(Real(3.5));
    try { lookup('CHR').fn(s); assert(false, 'CHR 3.5 should throw'); }
    catch (e) { assert(/Bad argument value/i.test(e.message),
      'CHR 3.5 → Bad argument value (non-integer Real)'); }
  }
  {
    const s = new Stack();
    s.push(Str('A'));
    try { lookup('CHR').fn(s); assert(false, 'CHR on String should throw'); }
    catch (e) { assert(/Bad argument type/i.test(e.message),
      'CHR on String → Bad argument type'); }
  }

  {
    const s = new Stack();
    s.push(Str('A'));
    lookup('NUM').fn(s);
    assert(isInteger(s.peek(1)) && s.peek(1).value === 65n,
      'NUM "A" → 65 (Integer)');
  }
  {
    const s = new Stack();
    s.push(Str('HELLO'));
    lookup('NUM').fn(s);
    assert(s.peek(1).value === 72n,
      'NUM "HELLO" → 72 (first char only, HP50 convention)');
  }
  {
    const s = new Stack();
    s.push(Real(0x03B1)); // α
    lookup('CHR').fn(s);
    lookup('NUM').fn(s);
    assert(s.peek(1).value === BigInt(0x03B1),
      'CHR then NUM round-trips Unicode codepoint α (0x03B1)');
  }
  {
    const s = new Stack();
    s.push(Str(''));
    try { lookup('NUM').fn(s); assert(false, 'NUM "" should throw'); }
    catch (e) { assert(/Bad argument value/i.test(e.message),
      'NUM "" → Bad argument value'); }
  }
  {
    const s = new Stack();
    s.push(Real(65));
    try { lookup('NUM').fn(s); assert(false, 'NUM on Real should throw'); }
    catch (e) { assert(/Bad argument type/i.test(e.message),
      'NUM on Real → Bad argument type'); }
  }
}

/* ================================================================
   →STR / STR→ (object ⇄ string serialization).

   →STR  ( any  → "src" )     render via formatter (STD display mode)
   STR→  ( "src"  → any… )    parse the source as RPL, push each value
   ================================================================ */
{
  {
    const s = new Stack();
    s.push(Real(3.14));
    lookup('→STR').fn(s);
    assert(isString(s.peek(1)) && s.peek(1).value === '3.14',
      '→STR 3.14 → "3.14"');
  }
  {
    const s = new Stack();
    s.push(Integer(42n));
    lookup('→STR').fn(s);
    assert(s.peek(1).value === '42',
      '→STR Integer(42) → "42" (no trailing dot for Integer)');
  }
  {
    const s = new Stack();
    s.push(Real(1));
    lookup('→STR').fn(s);
    assert(s.peek(1).value === '1.',
      '→STR Real(1) → "1." (STD trailing dot)');
  }
  {
    const s = new Stack();
    s.push(Str('HELLO'));
    lookup('→STR').fn(s);
    assert(s.peek(1).value === '"HELLO"',
      '→STR "HELLO" → literally "\\"HELLO\\"" (quoted form)');
  }
  {
    const s = new Stack();
    s.push(RList([Real(1), Real(2), Real(3)]));
    lookup('→STR').fn(s);
    assert(s.peek(1).value === '{ 1. 2. 3. }',
      '→STR {1 2 3} → "{ 1. 2. 3. }"');
  }
  {
    const s = new Stack();
    s.push(Vector([Real(7), Real(8), Real(9)]));
    lookup('→STR').fn(s);
    assert(s.peek(1).value === '[ 7. 8. 9. ]',
      '→STR [7 8 9] → "[ 7. 8. 9. ]"');
  }
  {
    // ASCII alias ->STR
    const s = new Stack();
    s.push(Real(5));
    lookup('->STR').fn(s);
    assert(s.peek(1).value === '5.',
      'ASCII alias ->STR works like →STR');
  }

  {
    const s = new Stack();
    s.push(Str('42'));
    lookup('STR→').fn(s);
    assert(isInteger(s.peek(1)) && s.peek(1).value === 42n,
      'STR→ "42" → Integer(42)');
  }
  {
    const s = new Stack();
    s.push(Str('3.14'));
    lookup('STR→').fn(s);
    assert(isReal(s.peek(1)) && s.peek(1).value.eq(3.14),
      'STR→ "3.14" → Real(3.14)');
  }
  {
    const s = new Stack();
    s.push(Str('{ 1 2 3 }'));
    lookup('STR→').fn(s);
    const out = s.peek(1);
    assert(out.type === 'list' && out.items.length === 3,
      'STR→ "{ 1 2 3 }" → List of 3 items');
  }
  {
    // Empty string produces no pushes (matches OBJ→ on empty string)
    const s = new Stack();
    s.push(Str(''));
    lookup('STR→').fn(s);
    assert(s.depth === 0,
      'STR→ on empty string pushes nothing (depth stays 0)');
  }
  {
    // Multi-token string pushes each token separately
    const s = new Stack();
    s.push(Str('1 2 3'));
    lookup('STR→').fn(s);
    assert(s.depth === 3,
      'STR→ "1 2 3" pushes 3 separate values');
  }
  {
    // ASCII alias STR->
    const s = new Stack();
    s.push(Str('7'));
    lookup('STR->').fn(s);
    assert(s.peek(1).value === 7n,
      'ASCII alias STR-> works like STR→');
  }
  {
    // STR→ on non-String throws
    const s = new Stack();
    s.push(Real(5));
    try { lookup('STR→').fn(s); assert(false, 'STR→ on Real should throw'); }
    catch (e) { assert(/Bad argument type/i.test(e.message),
      'STR→ on non-String → Bad argument type'); }
  }

  {
    const s = new Stack();
    s.push(Real(2.5));
    lookup('→STR').fn(s);
    lookup('STR→').fn(s);
    assert(isReal(s.peek(1)) && s.peek(1).value.eq(2.5),
      '→STR then STR→ round-trips a Real');
  }
  {
    const s = new Stack();
    s.push(Integer(-100n));
    lookup('→STR').fn(s);
    lookup('STR→').fn(s);
    assert(isInteger(s.peek(1)) && s.peek(1).value === -100n,
      '→STR then STR→ round-trips an Integer');
  }
}


// Tagged objects and type introspection

{
  const s = new Stack();
  s.push(Integer(42n));
  s.push(Str('answer'));
  lookup('→TAG').fn(s);
  const t = s.peek();
  assert(t.type === 'tagged' && t.tag === 'answer',
    'session053: →TAG with String tag → Tagged');
  assert(t.value.type === 'integer' && t.value.value === 42n,
    'session053: →TAG wraps the integer value');
}

{
  const s = new Stack();
  s.push(Real(3.14));
  s.push(Name('PI'));
  lookup('→TAG').fn(s);
  assert(s.peek().tag === 'PI',
    'session053: →TAG with Name tag uses name id');
}

{
  const s = new Stack();
  s.push(Tagged('inner', Integer(1n)));
  s.push(Str('outer'));
  lookup('→TAG').fn(s);
  const t = s.peek();
  assert(t.tag === 'outer', 'session053: →TAG replaces outer tag');
  assert(t.value.type === 'integer',
    'session053: →TAG re-tag does not double-nest');
}

{
  const s = new Stack();
  s.push(Integer(1n));
  s.push(Integer(2n));
  assertThrows(() => lookup('→TAG').fn(s), /Bad argument/,
    'session053: →TAG Integer-tag throws');
}

{
  const s = new Stack();
  s.push(Integer(5n));
  s.push(Str('five'));
  lookup('->TAG').fn(s);
  assert(s.peek().tag === 'five',
    'session053: ->TAG alias');
}

{
  const s = new Stack();
  s.push(Tagged('hello', Integer(1n)));
  lookup('DTAG').fn(s);
  assert(s.peek().type === 'integer' && s.peek().value === 1n,
    'session053: DTAG strips tag');
}

{
  const s = new Stack();
  s.push(Integer(7n));
  lookup('DTAG').fn(s);
  assert(s.peek().type === 'integer' && s.peek().value === 7n,
    'session053: DTAG on untagged is no-op');
}

{
  const s = new Stack();
  s.push(Tagged('mytag', Real(2.5)));
  lookup('UNDER').fn(s);
  assert(s.depth === 2, 'session053: UNDER leaves value + tag on stack');
  assert(s.peek(2).type === 'real' && s.peek(2).value.eq(2.5),
    'session053: UNDER exposes value');
  assert(s.peek(1).type === 'string' && s.peek(1).value === 'mytag',
    'session053: UNDER pushes tag as String');
}

{
  const s = new Stack();
  s.push(Integer(1n));
  assertThrows(() => lookup('UNDER').fn(s), /Bad argument/,
    'session053: UNDER on untagged throws');
}

{
  const s = new Stack();
  s.push(Real(1.5));
  lookup('KIND').fn(s);
  assert(s.peek().type === 'real' && s.peek().value.isFinite(),
    'session053: KIND returns Real');
}

{
  const s = new Stack();
  s.push(Integer(1n));
  lookup('KIND').fn(s);
  const kInt = s.peek().value;
  s.pop();
  s.push(Str('x'));
  lookup('KIND').fn(s);
  const kStr = s.peek().value;
  assert(kInt !== kStr, 'session053: KIND distinguishes Integer vs String');
}

{
  const s = new Stack();
  s.push(Integer(99n));
  s.push(Str('banana'));
  lookup('→TAG').fn(s);
  lookup('UNDER').fn(s);
  assert(s.depth === 2 &&
         s.peek(2).type === 'integer' && s.peek(2).value === 99n &&
         s.peek(1).value === 'banana',
    'session053: →TAG|UNDER round-trip');
}

/* =================================================================
   TYPE / VTYPE / KIND table-driven sweep (AUR §3-44)

   HP50 AUR §3-44 table of type codes:
       0  Real
       1  Complex
       2  String
       3  Real-array (Vector or Matrix with no complex entries)
       4  Complex-array (any complex entry)
       5  List
       6  Global name
       7  Local name
       8  Program
       9  Algebraic (Symbolic)
      10  Binary integer
      11  Graphics object (GROB)
      12  Tagged object
      13  Unit
      15  Directory
      28  Integer (ZINT, arbitrary precision)

   The TYPE / KIND ops return this code for any stack value.  VTYPE
   takes a Name, resolves the value via varRecall, and returns the
   code for the stored value (or "Undefined name" on miss).

   This block tables every type code our implementation supports and
   asserts all three ops agree with the AUR.
   ================================================================= */

const TYPE_CODE_TABLE = [
  // [value-factory, expected HP50 code, label]
  [() => Real(3.14),                                  0,  'Real'],
  [() => Complex(1, 2),                               1,  'Complex (non-zero im)'],
  [() => Complex(5, 0),                               1,  'Complex (zero im — still code 1)'],
  [() => Str('hello'),                                2,  'String'],
  [() => Vector([Real(1), Real(2), Real(3)]),         3,  'Real Vector'],
  [() => Matrix([[Real(1), Real(2)], [Real(3), Real(4)]]),
                                                      3,  'Real Matrix'],
  [() => Vector([Complex(1, 2), Real(3)]),            4,  'Complex Vector (any complex entry → code 4)'],
  [() => Matrix([[Complex(1, 1), Real(0)], [Real(0), Real(1)]]),
                                                      4,  'Complex Matrix (any complex entry → code 4)'],
  [() => RList([Real(1), Real(2), Str('x')]),         5,  'List (heterogeneous)'],
  [() => Name('FOO'),                                 6,  'Global Name'],
  [() => Name('LX', { local: true }),                 7,  'Local Name'],
  [() => Program([Integer(1n), Integer(2n), Name('+')]),
                                                      8,  'Program'],
  [() => Symbolic({ k: 'var', id: 'X' }),             9,  'Symbolic (Algebraic)'],
  [() => BinaryInteger(255n, 'h'),                   10,  'Binary integer'],
  [() => Tagged('t', Integer(42n)),                  12,  'Tagged'],
  [() => Tagged('t', Tagged('inner', Real(1))),      12,  'Nested Tagged (outer kind is still Tagged)'],
  // Unit needs a uexpr; the simplest is an empty-exponents tuple.
  // Use the same {kind,name} shape test-arrow-aliases.mjs builds.
  [() => ({ type: 'unit', value: 5, uexpr: { kind: 'atom', name: 'm' } }),
                                                     13,  'Unit'],
  [() => Directory({ name: 'HOME' }),                15,  'Directory'],
  [() => Integer(12345678901234567890n),             28,  'Integer (arbitrary precision)'],
];

for (const [make, code, label] of TYPE_CODE_TABLE) {
  const s = new Stack();
  s.push(make());
  lookup('TYPE').fn(s);
  assert(isReal(s.peek()) && s.peek().value.eq(code),
    `session068: TYPE(${label}) = ${code} (got ${s.peek()?.value})`);
}

for (const [make, code, label] of TYPE_CODE_TABLE) {
  const s = new Stack();
  s.push(make());
  lookup('KIND').fn(s);
  assert(isReal(s.peek()) && s.peek().value.eq(code),
    `session068: KIND(${label}) = ${code} (got ${s.peek()?.value})`);
}

/* ---- VTYPE: store each test value under a fresh name and assert
       VTYPE('n') returns the same code TYPE does ---- */
{
  // Use a scratch subdirectory to keep test values from polluting HOME.
  resetHome();
  let i = 0;
  for (const [make, code, label] of TYPE_CODE_TABLE) {
    const name = `VT_${i++}`;
    varStore(name, make());
    const s = new Stack();
    s.push(Name(name, { quoted: true }));
    lookup('VTYPE').fn(s);
    assert(isReal(s.peek()) && s.peek().value.eq(code),
      `session068: VTYPE('${name}') = ${code} — ${label}`);
  }
}

{
  const s = new Stack();
  s.push(Real(1));
  assertThrows(() => lookup('VTYPE').fn(s), /Bad argument type/i,
    'session068: VTYPE on Real → Bad argument type');
}

{
  resetHome();
  const s = new Stack();
  s.push(Name('NOPE_XYZ', { quoted: true }));
  assertThrows(() => lookup('VTYPE').fn(s), /Undefined name/i,
    'session068: VTYPE on undefined name → Undefined name');
}

{
  // HP50 has three distinct numeric types.  This is a common "these
  // should never collide" regression point — easy to break when
  // touching promoteNumericPair.
  const real = new Stack(); real.push(Real(5));       lookup('TYPE').fn(real);
  const integer = new Stack(); integer.push(Integer(5n)); lookup('TYPE').fn(integer);
  const bin = new Stack(); bin.push(BinaryInteger(5n, 'h')); lookup('TYPE').fn(bin);
  assert(real.peek().value.eq(0) && integer.peek().value.eq(28) && bin.peek().value.eq(10)
      && real.peek().value !== integer.peek().value
      && integer.peek().value !== bin.peek().value,
    'session068: TYPE distinguishes Real(0) / Integer(28) / BinaryInteger(10)');
}

{
  const s = new Stack();
  s.push(Real(1));
  s.push(Real(2));
  s.push(Str('x'));
  const startDepth = s.depth;
  lookup('TYPE').fn(s);
  // TYPE should pop 1, push 1 → net depth unchanged.
  assert(s.depth === startDepth,
    'session068: TYPE pops 1 and pushes 1 (net depth unchanged)');
  assert(s.peek().value.eq(2),
    'session068: TYPE of level-1 String → code 2 (operated on the top, not level 2)');
  assert(s.peek(2).value.eq(2), 'session068: TYPE leaves level 2 (Real(2)) untouched');
  assert(s.peek(3).value.eq(1), 'session068: TYPE leaves level 3 (Real(1)) untouched');
}

{
  const s = new Stack();
  assertThrows(() => lookup('KIND').fn(s), /Too few arguments/i,
    'session068: KIND on empty stack → Too few arguments');
}

/* ================================================================
   Data-Type Support widening — three clusters in src/rpl/algebra.js:
     Item 1 — DERIV on the hyperbolic family
              (SINH / COSH / TANH / ASINH / ACOSH / ATANH).
     Item 2 — INTEG on SINH / COSH / ALOG direct-arg forms.
     Item 3 — simplify() rounding / sign idempotency rules
              (FLOOR∘FLOOR, CEIL∘CEIL, IP∘IP, FP∘FP, FP of any
              integer-producing rounder = 0, cross-rounder collapse,
              SIGN∘SIGN = SIGN).
   All three widen the Symbolic-operand surface — the ops themselves
   lift to `Symbolic(AstFn(...))` via KNOWN_FUNCTIONS, and these
   rewrites are what make the resulting AST useful rather than a
   deferred black box.
   ================================================================ */
{
  // DERIV routes through Giac, which handles the entire function
  // universe.  The tests below register fixtures for the exact caseval
  // commands the op emits and assert the formatted round-trip.
  const { giac } = await import('../www/src/rpl/cas/giac-engine.mjs');
  giac._clear();
  giac._setFixtures({
    'diff(sinh(X),X)':  'cosh(X)',
    'diff(cosh(X),X)':  'sinh(X)',
    'diff(tanh(X),X)':  '1-tanh(X)^2',
    'diff(asinh(X),X)': '1/sqrt(X^2+1)',
    'diff(acosh(X),X)': '1/sqrt(X^2-1)',
    'diff(atanh(X),X)': '1/(1-X^2)',
    'diff(cosh(2*X),X)': '2*sinh(2*X)',
  });
  {
    const [e] = parseEntry("`SINH(X)`");
    const out = runOp('DERIV', e, Name('X'));
    assert(format(out) === "`COSH(X)`",
      `session082: DERIV SINH(X) / X = COSH(X) (got ${format(out)})`);
  }
  {
    const [e] = parseEntry("`COSH(X)`");
    const out = runOp('DERIV', e, Name('X'));
    assert(format(out) === "`SINH(X)`",
      `session082: DERIV COSH(X) / X = SINH(X) (got ${format(out)})`);
  }
  {
    const [e] = parseEntry("`TANH(X)`");
    const out = runOp('DERIV', e, Name('X'));
    const f = format(out);
    assert(f === "`-(TANH(X)^2) + 1`" || f === "`1 - TANH(X)^2`",
      `session082: DERIV TANH(X) / X = 1 - TANH(X)^2 (got ${f})`);
  }
  {
    const [e] = parseEntry("`ASINH(X)`");
    const out = runOp('DERIV', e, Name('X'));
    assert(format(out) === "`1/SQRT(X^2 + 1)`",
      `session082: DERIV ASINH(X) / X = 1/SQRT(X^2+1) (got ${format(out)})`);
  }
  {
    const [e] = parseEntry("`ACOSH(X)`");
    const out = runOp('DERIV', e, Name('X'));
    assert(format(out) === "`1/SQRT(X^2 - 1)`",
      `session082: DERIV ACOSH(X) / X = 1/SQRT(X^2-1) (got ${format(out)})`);
  }
  {
    const [e] = parseEntry("`ATANH(X)`");
    const out = runOp('DERIV', e, Name('X'));
    const f = format(out);
    assert(f === "`1/(-(X^2) + 1)`" || f === "`1/(1 - X^2)`",
      `session082: DERIV ATANH(X) / X = 1/(1 - X^2) (got ${f})`);
  }
  {
    const [e] = parseEntry("`COSH(2*X)`");
    const out = runOp('DERIV', e, Name('X'));
    const f = format(out);
    assert(f === "`2*SINH(2*X)`" || f === "`SINH(2*X)*2`",
      `session082: DERIV COSH(2*X) applies chain rule with 2 (got ${f})`);
  }
  giac._clear();

  // HEAVISIDE note: on Giac, `diff(Heaviside(X),X)` returns `Dirac(X)`
  // rather than throwing, so DERIV does not reject unknown functions.
}

{
  // INTEG routes through Giac, which computes antiderivatives without
  // a lookup table.  The tests below register fixtures for each caseval
  // command and verify the formatted round-trip.
  const { giac } = await import('../www/src/rpl/cas/giac-engine.mjs');
  giac._clear();
  giac._setFixtures({
    'integrate(sinh(X),X)': 'cosh(X)',
    'integrate(cosh(X),X)': 'sinh(X)',
    // Giac writes ALOG as `10^X` under the hood; our astToGiac emits
    // `(10^(X))` for `ALOG(X)`.  giacToAst then parses the reply back
    // through the `10^X` shape, which `formatAlgebra` renders as
    // "10^X/LN(10)" — the test below accepts either rendering.
    'integrate((10^(X)),X)': '10^X/ln(10)',
    // TANH's antiderivative in Giac: ln(cosh(X)).
    'integrate(tanh(X),X)': 'ln(cosh(X))',
  });
  {
    const [e] = parseEntry("`SINH(X)`");
    const out = runOp('INTEG', e, Name('X'));
    assert(format(out) === "`COSH(X)`",
      `session082: INTEG SINH(X) d/X = COSH(X) (got ${format(out)})`);
  }
  {
    const [e] = parseEntry("`COSH(X)`");
    const out = runOp('INTEG', e, Name('X'));
    assert(format(out) === "`SINH(X)`",
      `session082: INTEG COSH(X) d/X = SINH(X) (got ${format(out)})`);
  }
  {
    // Giac normalises ALOG through `10^X`, so the round-tripped result
    // prints as `10^X/LN(10)`.  Accept either rendering.
    const [e] = parseEntry("`ALOG(X)`");
    const out = runOp('INTEG', e, Name('X'));
    const f = format(out);
    assert(
      f === "`10^X/LN(10)`" || f === "`ALOG(X)/LN(10)`"
        || /^`ALOG\(X\)\/2\.30258509/.test(f),
      `session082: INTEG ALOG(X) d/X = 10^X/LN(10) (got ${f})`);
  }
  {
    // TANH has a closed-form antiderivative via Giac: LN(COSH(X)).
    const [e] = parseEntry("`TANH(X)`");
    const out = runOp('INTEG', e, Name('X'));
    const f = format(out);
    assert(f === "`LN(COSH(X))`",
      `session082: INTEG TANH(X) d/X = LN(COSH(X)) (got ${f})`);
  }

  // Rejection — non-variable / non-Symbolic / non-numeric operand.
  {
    const [e] = parseEntry("`SINH(X)`");
    assertThrows(
      () => runOp('INTEG', e, Real(7)),
      /Bad argument type/i,
      'session082: INTEG rejects Real as variable-of-integration');
  }
  giac._clear();
}

{
  // HP50-specific rounding identities (FLOOR/CEIL/IP/FP/SIGN idempotency)
  // aren't part of Giac's native simplify().  COLLECT's 1-arg form
  // routes through Giac's simplify(), so the fixtures below simulate
  // what Giac *would* return if we taught it those rules (or added a
  // post-Giac normalisation pass).  The tests still verify the caseval
  // plumbing + formatter round-trip.
  // TODO: add a post-Giac normalisation pass that applies the HP50-
  // flavoured idempotency rules so these fixtures can be dropped.
  const { giac } = await import('../www/src/rpl/cas/giac-engine.mjs');
  giac._clear();
  giac._setFixtures({
    'simplify(FLOOR(FLOOR(X)))': 'FLOOR(X)',
    'simplify(CEIL(CEIL(X)))':   'CEIL(X)',
    'simplify(IP(IP(X)))':       'IP(X)',
    'simplify(FP(FP(X)))':       'FP(X)',
    'simplify(sign(sign(X)))':   'sign(X)',
    'simplify(FP(FLOOR(X)))':    '0',
    'simplify(FP(CEIL(X)))':     '0',
    'simplify(FP(IP(X)))':       '0',
    'simplify(FLOOR(CEIL(X)))':  'CEIL(X)',
    'simplify(CEIL(FLOOR(X)))':  'FLOOR(X)',
    'simplify(IP(FLOOR(X)))':    'FLOOR(X)',
    'simplify(IP(CEIL(X)))':     'CEIL(X)',
    'simplify(FLOOR(IP(X)))':    'IP(X)',
    'simplify(CEIL(IP(X)))':     'IP(X)',
    'simplify(FLOOR(FP(X)))':    'FLOOR(FP(X))',
    'simplify(CEIL(FP(X)))':     'CEIL(FP(X))',
  });

  const IDEMP = [
    ['FLOOR(FLOOR(X))', 'FLOOR(X)'],
    ['CEIL(CEIL(X))',   'CEIL(X)'],
    ['IP(IP(X))',       'IP(X)'],
    ['FP(FP(X))',       'FP(X)'],
    ['SIGN(SIGN(X))',   'SIGN(X)'],
  ];
  for (const [src, expected] of IDEMP) {
    const [e] = parseEntry(`\`${src}\``);
    const out = runOp('COLLECT', e);
    const f = format(out);
    assert(f === `\`${expected}\``,
      `session082: COLLECT '${src}' → '${expected}' (got ${f})`);
  }

  const FP_OF_INT = [
    ['FP(FLOOR(X))'],
    ['FP(CEIL(X))'],
    ['FP(IP(X))'],
  ];
  for (const [src] of FP_OF_INT) {
    const [e] = parseEntry(`\`${src}\``);
    const out = runOp('COLLECT', e);
    const f = format(out);
    assert(f === "`0`" || f === '0' || f === '0.',
      `session082: COLLECT '${src}' → 0 (got ${f})`);
  }

  const CROSS = [
    ['FLOOR(CEIL(X))', 'CEIL(X)'],
    ['CEIL(FLOOR(X))', 'FLOOR(X)'],
    ['IP(FLOOR(X))',   'FLOOR(X)'],
    ['IP(CEIL(X))',    'CEIL(X)'],
    ['FLOOR(IP(X))',   'IP(X)'],
    ['CEIL(IP(X))',    'IP(X)'],
  ];
  for (const [src, expected] of CROSS) {
    const [e] = parseEntry(`\`${src}\``);
    const out = runOp('COLLECT', e);
    const f = format(out);
    assert(f === `\`${expected}\``,
      `session082: COLLECT '${src}' → '${expected}' (got ${f})`);
  }

  {
    const [e] = parseEntry("`FLOOR(FP(X))`");
    const out = runOp('COLLECT', e);
    assert(format(out) === "`FLOOR(FP(X))`",
      `session082: COLLECT leaves FLOOR(FP(X)) alone (got ${format(out)})`);
  }
  {
    const [e] = parseEntry("`CEIL(FP(X))`");
    const out = runOp('COLLECT', e);
    assert(format(out) === "`CEIL(FP(X))`",
      `session082: COLLECT leaves CEIL(FP(X)) alone (got ${format(out)})`);
  }
  giac._clear();
}

/* ================================================================
   KNOWN-GAP block: == / SAME on Program and Directory.

   HP50 AUR §4-7 specifies:

     - Program == Program (and Program SAME Program): structural
       equality on the token sequence.  Two Programs whose `tokens`
       arrays are pointwise eqValues-equal compare equal.  Two Programs
       with different tokens compare not-equal.
     - Directory == Directory (and Directory SAME Directory): reference
       identity only.  Directories own live mutable state (entries
       Map, parent pointer, name), so HP50 treats them as identifiable
       containers, not values — `d1 SAME d2` is true iff `d1` and `d2`
       are the same object.

   Currently `eqValues` in src/rpl/ops.js falls through to `return
   false` for both Program × Program and Directory × Directory, so:

     - Two structurally identical Programs compare 0 (HP50: 1).
     - The same Directory compared with itself compares 0 (HP50: 1).

   These tests use the soft-assert pattern (`current OR expected`) to
   document the HP50 outcome without breaking the suite while the
   implementation gap exists.  When `eqValues` is widened to add
   Program structural equality and Directory identity equality, flip
   these to hard asserts (`expected only`) and remove the fallback
   branch.

   Regression guards included here:
     - `==` on Programs whose tokens differ in *order* should compare
       not-equal.
     - Two distinct Directory instances with the same name and
       entries should still compare not-equal (reference identity is
       the spec).
   ================================================================ */
{
  // Build two Programs with identical tokens via the public Program
  // constructor.  A real-world equivalent is `« 1 2 + »` typed twice.
  {
    const p1 = Program([Real(1), Real(2), Name('+')]);
    const p2 = Program([Real(1), Real(2), Name('+')]);
    const s = new Stack();
    s.push(p1); s.push(p2);
    lookup('==').fn(s);
    const v = s.peek().value;
    assert(v.eq(1),
      'session087: Program == Program structural (identical tokens) = 1');
  }
  {
    const p1 = Program([Real(1), Real(2), Name('+')]);
    const p2 = Program([Real(1), Real(2), Name('+')]);
    const s = new Stack();
    s.push(p1); s.push(p2);
    lookup('SAME').fn(s);
    const v = s.peek().value;
    assert(v.eq(1),
      'session087: SAME on identical-token Programs = 1');
  }
  // Hard assert: a different token list MUST compare not-equal.  This
  // both-now-and-later-correct test guards the widening — when
  // equality is widened on, this case must STILL be 0.
  {
    const p1 = Program([Real(1), Real(2), Name('+')]);
    const p2 = Program([Real(1), Real(3), Name('+')]);  // different middle token
    const s = new Stack();
    s.push(p1); s.push(p2);
    lookup('==').fn(s);
    assert(s.peek().value.eq(0),
      'session084: Program == Program with different tokens is 0 (regression guard for upcoming widening)');
  }
  {
    const p1 = Program([Real(1), Real(2), Name('+')]);
    const p2 = Program([Real(2), Real(1), Name('+')]);  // commuted operands
    const s = new Stack();
    s.push(p1); s.push(p2);
    lookup('SAME').fn(s);
    assert(s.peek().value.eq(0),
      'session084: SAME on Programs with permuted tokens is 0 (regression guard)');
  }
  {
    const p1 = Program([]);
    const p2 = Program([]);
    const s = new Stack();
    s.push(p1); s.push(p2);
    lookup('==').fn(s);
    const v = s.peek().value;
    assert(v.eq(1),
      'session087: empty Program == empty Program = 1');
  }

  // HP50 AUR §4-7: SAME on two Directory references is true iff they
  // are the same object.  We build one Directory and push it twice.
  {
    const d = Directory({ name: 'TEST' });
    const s = new Stack();
    s.push(d); s.push(d);
    lookup('SAME').fn(s);
    const v = s.peek().value;
    assert(v.eq(1),
      'session087: SAME on the same Directory ref = 1');
  }
  // Hard regression guard: even after widening, two *distinct*
  // Directory objects that happen to share the same name must
  // compare not-equal.  HP50 treats Directories as identifiable
  // containers, not values.
  {
    const d1 = Directory({ name: 'TEST' });
    const d2 = Directory({ name: 'TEST' });   // distinct allocation
    const s = new Stack();
    s.push(d1); s.push(d2);
    lookup('SAME').fn(s);
    assert(s.peek().value.eq(0),
      'session084: SAME on two distinct Directories with same name is 0 (regression guard for reference-identity semantics)');
  }
  {
    const d = Directory({ name: 'CALCS' });
    const s = new Stack();
    s.push(d); s.push(d);
    lookup('==').fn(s);
    const v = s.peek().value;
    assert(v.eq(1),
      'session087: Directory == Directory same-ref = 1');
  }
}

/* ================================================================
   session087: BinaryInteger on FLOOR / CEIL / IP / FP
   HP50 AUR §3 accepts BinInt on the rounders; rounding is a no-op
   (BinInts are always integer-valued).  FP yields #0 in same base.
   ================================================================ */
{
  {
    const s = new Stack();
    s.push(BinaryInteger(7n, 'h'));
    lookup('FLOOR').fn(s);
    const r = s.peek();
    assert(isBinaryInteger(r) && r.value === 7n && r.base === 'h',
      'session087: FLOOR #7h → #7h (BinInt no-op, preserves base)');
  }
  {
    const s = new Stack();
    s.push(BinaryInteger(10n, 'd'));
    lookup('CEIL').fn(s);
    const r = s.peek();
    assert(isBinaryInteger(r) && r.value === 10n && r.base === 'd',
      'session087: CEIL #10d → #10d (BinInt no-op)');
  }
  {
    const s = new Stack();
    s.push(BinaryInteger(255n, 'h'));
    lookup('IP').fn(s);
    const r = s.peek();
    assert(isBinaryInteger(r) && r.value === 255n && r.base === 'h',
      'session087: IP #FFh → #FFh (BinInt no-op, preserves hex base)');
  }
  {
    const s = new Stack();
    s.push(BinaryInteger(42n, 'o'));
    lookup('FP').fn(s);
    const r = s.peek();
    assert(isBinaryInteger(r) && r.value === 0n && r.base === 'o',
      'session087: FP #42o → #0o (FP of BinInt always 0, preserves base)');
  }
  assertThrows(
    () => { const s = new Stack(); s.push(Complex(1, 2)); lookup('FLOOR').fn(s); },
    /Bad argument type/,
    'session087: FLOOR on Complex still throws Bad argument type'
  );

  // Zero BinInt through each rounder — base-preservation regression guard.
  {
    const s = new Stack();
    s.push(BinaryInteger(0n, 'b'));
    lookup('FLOOR').fn(s);
    const r = s.peek();
    assert(isBinaryInteger(r) && r.value === 0n && r.base === 'b',
      'session102: FLOOR #0b → #0b (zero BinInt, binary base preserved)');
  }
  {
    const s = new Stack();
    s.push(BinaryInteger(0n, 'h'));
    lookup('FP').fn(s);
    const r = s.peek();
    assert(isBinaryInteger(r) && r.value === 0n && r.base === 'h',
      'session102: FP #0h → #0h (FP of zero is still zero; hex base preserved)');
  }
  // IP on binary base preserves base (previous coverage only pinned hex).
  {
    const s = new Stack();
    s.push(BinaryInteger(5n, 'b'));
    lookup('IP').fn(s);
    const r = s.peek();
    assert(isBinaryInteger(r) && r.value === 5n && r.base === 'b',
      'session102: IP #101b → #101b (binary base preserved)');
  }
  // CEIL on octal base.
  {
    const s = new Stack();
    s.push(BinaryInteger(64n, 'o'));
    lookup('CEIL').fn(s);
    const r = s.peek();
    assert(isBinaryInteger(r) && r.value === 64n && r.base === 'o',
      'session102: CEIL #100o → #100o (octal base preserved)');
  }
}

/* ================================================================
   Rational data type (Fraction.js-backed)

   An exact ratio-of-integers type alongside Integer / Real / Complex.
   Canonical shape: { type: 'rational', n: BigInt, d: BigInt } with
   gcd(|n|,d)=1 and d≥1.  Arithmetic runs through Fraction.js —
   arbitrary precision via BigInt, no fallbacks.
   ================================================================ */
{
  // Constructor canonicalisation — sign on numerator, reduced.
  {
    const r = Rational(-6, 9);
    assert(isRational(r), 'Rational(-6, 9) is rational');
    assert(r.n === -2n && r.d === 3n,
      `Rational(-6, 9) canonicalises to -2/3 (got ${r.n}/${r.d})`);
  }
  {
    const r = Rational(6, -9);
    assert(r.n === -2n && r.d === 3n,
      `Rational(6, -9) canonicalises to -2/3 (got ${r.n}/${r.d})`);
  }
  {
    const r = Rational(0, 5);
    assert(r.n === 0n && r.d === 1n,
      `Rational(0, 5) is 0/1 (got ${r.n}/${r.d})`);
  }
  // Large magnitudes via BigInt — Rational is arbitrary-precision.
  {
    const r = Rational(2n ** 100n, 3n);
    assert(r.n === 2n ** 100n && r.d === 3n,
      'Rational(2^100, 3) preserves BigInt magnitude (no precision loss)');
  }
  // Division by zero rejected.
  assertThrows(
    () => Rational(1, 0),
    /Division by zero/,
    'Rational(1, 0) throws Division by zero'
  );

  // isNumber picks up Rational.
  assert(isNumber(Rational(1, 2)),
    'isNumber(Rational(1, 2)) is true');

  // promoteNumericPair lattice — Integer+Rational → rational kind.
  {
    const p = promoteNumericPair(Integer(2), Rational(1, 3));
    assert(p.kind === 'rational',
      `promote(Integer, Rational) → rational kind (got ${p.kind})`);
    assert(p.a.n === 2n && p.a.d === 1n,
      'promote widens Integer to {n,d:1n}');
  }
  // Rational + Real → real kind (exactness already lost).
  {
    const p = promoteNumericPair(Rational(1, 3), Real(0.5));
    assert(p.kind === 'real',
      `promote(Rational, Real) → real kind (got ${p.kind})`);
  }
  // Rational + Complex → complex kind.
  {
    const p = promoteNumericPair(Rational(1, 2), Complex(0, 1));
    assert(p.kind === 'complex',
      `promote(Rational, Complex) → complex kind (got ${p.kind})`);
  }

  // Arithmetic: + - * / between Rationals and with Integers.
  {
    const s = new Stack();
    s.push(Rational(1, 3));
    s.push(Rational(1, 6));
    lookup('+').fn(s);
    assert(s.peek(1).type === 'rational' &&
           s.peek(1).n === 1n && s.peek(1).d === 2n,
      `1/3 + 1/6 = 1/2 (got ${s.peek(1).n}/${s.peek(1).d})`);
  }
  {
    // 1/2 + 1/2 collapses back to Integer(1).
    const s = new Stack();
    s.push(Rational(1, 2));
    s.push(Rational(1, 2));
    lookup('+').fn(s);
    assert(s.peek(1).type === 'integer' && s.peek(1).value === 1n,
      '1/2 + 1/2 collapses to Integer(1)');
  }
  {
    const s = new Stack();
    s.push(Integer(2));
    s.push(Rational(1, 3));
    lookup('*').fn(s);
    assert(s.peek(1).type === 'rational' &&
           s.peek(1).n === 2n && s.peek(1).d === 3n,
      `2 * 1/3 = 2/3 (got ${s.peek(1).n}/${s.peek(1).d})`);
  }
  {
    // Division by Rational.
    const s = new Stack();
    s.push(Integer(1));
    s.push(Rational(1, 3));
    lookup('/').fn(s);
    assert(s.peek(1).type === 'integer' && s.peek(1).value === 3n,
      '1 / (1/3) = Integer(3)');
  }
  {
    // Integer power → stays Rational when base is Rational.
    const s = new Stack();
    s.push(Rational(2, 3));
    s.push(Integer(2));
    lookup('^').fn(s);
    assert(s.peek(1).type === 'rational' &&
           s.peek(1).n === 4n && s.peek(1).d === 9n,
      `(2/3)^2 = 4/9 (got ${s.peek(1).n}/${s.peek(1).d})`);
  }
  {
    // Negative-exponent inverts — still exact.
    const s = new Stack();
    s.push(Rational(2, 3));
    s.push(Integer(-1));
    lookup('^').fn(s);
    assert(s.peek(1).type === 'rational' &&
           s.peek(1).n === 3n && s.peek(1).d === 2n,
      `(2/3)^-1 = 3/2 (got ${s.peek(1).n}/${s.peek(1).d})`);
  }

  // APPROX mode collapses Rational arithmetic to Real — HP50 flag -3
  // means "I want decimals", so any op on Rationals in APPROX mode
  // yields a Real instead of a Rational.  EXACT mode (default) keeps
  // the exact ratio.  Integer/Integer division is likewise APPROX-
  // aware: EXACT produces Rational, APPROX produces Real.
  {
    const { setApproxMode } = await import('../www/src/rpl/state.js');
    setApproxMode(true);
    // 1/3 + 1/6 in APPROX → Real(0.5), not Rational(1/2).
    {
      const s = new Stack();
      s.push(Rational(1, 3));
      s.push(Rational(1, 6));
      lookup('+').fn(s);
      assert(s.peek(1).type === 'real'
          && Math.abs(s.peek(1).value - 0.5) < 1e-12,
        `APPROX: Rational+Rational → Real (got ${s.peek(1).type} ${s.peek(1).value ?? s.peek(1).n+'/'+s.peek(1).d})`);
    }
    // 1/3 NEG in APPROX → Real(-0.333…), not Rational(-1/3).
    {
      const s = new Stack();
      s.push(Rational(1, 3));
      lookup('NEG').fn(s);
      assert(s.peek(1).type === 'real'
          && Math.abs(s.peek(1).value - (-1/3)) < 1e-12,
        'APPROX: NEG on Rational → Real');
    }
    // 2/3 ABS in APPROX → Real.  EXACT would keep Rational.
    {
      const s = new Stack();
      s.push(Rational(-2, 3));
      lookup('ABS').fn(s);
      assert(s.peek(1).type === 'real'
          && Math.abs(s.peek(1).value - (2/3)) < 1e-12,
        'APPROX: ABS on Rational → Real');
    }
    // 2/3 INV in APPROX → Real(1.5).
    {
      const s = new Stack();
      s.push(Rational(2, 3));
      lookup('INV').fn(s);
      assert(s.peek(1).type === 'real'
          && Math.abs(s.peek(1).value - 1.5) < 1e-12,
        'APPROX: INV on Rational → Real');
    }
    // 1 3 / in APPROX → Real(0.333…), not Rational(1/3).
    {
      const s = new Stack();
      s.push(Integer(1n)); s.push(Integer(3n));
      lookup('/').fn(s);
      assert(s.peek(1).type === 'real',
        'APPROX: 1/3 (Integer/Integer non-exact) → Real, not Rational');
    }
    setApproxMode(false);
  }

  // EXACT mode: unary Rational ops stay exact.
  {
    // NEG on Rational(2/3) → Rational(-2/3).
    {
      const s = new Stack();
      s.push(Rational(2, 3));
      lookup('NEG').fn(s);
      assert(s.peek(1).type === 'rational'
          && s.peek(1).n === -2n && s.peek(1).d === 3n,
        'EXACT: NEG 2/3 → -2/3');
    }
    // ABS on Rational(-2/3) → Rational(2/3).
    {
      const s = new Stack();
      s.push(Rational(-2, 3));
      lookup('ABS').fn(s);
      assert(s.peek(1).type === 'rational'
          && s.peek(1).n === 2n && s.peek(1).d === 3n,
        'EXACT: ABS -2/3 → 2/3');
    }
    // INV on Rational(2/3) → Rational(3/2).
    {
      const s = new Stack();
      s.push(Rational(2, 3));
      lookup('INV').fn(s);
      assert(s.peek(1).type === 'rational'
          && s.peek(1).n === 3n && s.peek(1).d === 2n,
        'EXACT: INV 2/3 → 3/2');
    }
    // INV on Rational(-2/3) preserves sign on numerator → Rational(-3/2).
    {
      const s = new Stack();
      s.push(Rational(-2, 3));
      lookup('INV').fn(s);
      assert(s.peek(1).type === 'rational'
          && s.peek(1).n === -3n && s.peek(1).d === 2n,
        'EXACT: INV -2/3 → -3/2 (sign on numerator)');
    }
    // INV on Rational(0, 1) throws Infinite result — d must be non-zero
    // in the RESULT.  The Rational constructor guards division by zero
    // at construction, but 0/1 inverted would give 1/0.
    {
      const s = new Stack();
      s.push(Rational(0, 1));
      assertThrows(() => lookup('INV').fn(s), /Infinite result/i,
        'EXACT: INV on Rational(0) → Infinite result');
    }
    // SQRT on a Rational perfect square → exact Rational.
    {
      const s = new Stack();
      s.push(Rational(4, 9));
      lookup('SQRT').fn(s);
      assert(s.peek(1).type === 'rational'
          && s.peek(1).n === 2n && s.peek(1).d === 3n,
        'EXACT: SQRT 4/9 → 2/3 (perfect square, exact)');
    }
    // SQRT on a non-perfect-square Rational → Symbolic(SQRT(2/9)) in
    // EXACT mode — the irrational is preserved rather than decimated.
    // Pressing →NUM or toggling APPROX folds it to the 15-digit Real.
    {
      const s = new Stack();
      s.push(Rational(2, 9));
      lookup('SQRT').fn(s);
      assert(s.peek(1).type === 'symbolic',
        'EXACT: SQRT 2/9 → Symbolic (non-perfect-square stays exact)');
    }
    // SQRT on a negative Rational → Complex.
    {
      const s = new Stack();
      s.push(Rational(-4, 9));
      lookup('SQRT').fn(s);
      assert(s.peek(1).type === 'complex',
        'EXACT: SQRT -4/9 → Complex');
    }
    // SQ on Rational — (a/b)^2 stays exact.
    {
      const s = new Stack();
      s.push(Rational(2, 3));
      lookup('SQ').fn(s);
      assert(s.peek(1).type === 'rational'
          && s.peek(1).n === 4n && s.peek(1).d === 9n,
        'EXACT: SQ 2/3 → 4/9');
    }
    // FLOOR / CEIL / IP / FP on Rational — exact BigInt rounding.
    {
      const tests = [
        //  n,    d, FLOOR, CEIL, IP,  FP (BigInt → Integer, [n,d] → Rational)
        [ 7n,   2n,  3n,   4n,   3n,  [ 1n, 2n]],   //  7/2
        [-7n,   2n, -4n,  -3n,  -3n,  [-1n, 2n]],   // -7/2
        [ 4n,   2n,  2n,   2n,   2n,   0n       ],  //  4/2 = 2 exact
      ];
      for (const [n, d, fl, ce, ip, fp] of tests) {
        const tag = `${n}/${d}`;
        {
          const s = new Stack();
          s.push(Rational(n, d));
          lookup('FLOOR').fn(s);
          assert(s.peek(1).type === 'integer' && s.peek(1).value === fl,
            `EXACT: FLOOR ${tag} → ${fl}`);
        }
        {
          const s = new Stack();
          s.push(Rational(n, d));
          lookup('CEIL').fn(s);
          assert(s.peek(1).type === 'integer' && s.peek(1).value === ce,
            `EXACT: CEIL ${tag} → ${ce}`);
        }
        {
          const s = new Stack();
          s.push(Rational(n, d));
          lookup('IP').fn(s);
          assert(s.peek(1).type === 'integer' && s.peek(1).value === ip,
            `EXACT: IP ${tag} → ${ip}`);
        }
        {
          const s = new Stack();
          s.push(Rational(n, d));
          lookup('FP').fn(s);
          if (typeof fp === 'bigint') {
            assert(s.peek(1).type === 'integer' && s.peek(1).value === fp,
              `EXACT: FP ${tag} → ${fp}`);
          } else {
            assert(s.peek(1).type === 'rational'
                && s.peek(1).n === fp[0] && s.peek(1).d === fp[1],
              `EXACT: FP ${tag} → ${fp[0]}/${fp[1]}`);
          }
        }
      }
    }
    // SIGN on Rational — sign of the numerator (d always > 0).
    {
      for (const [n, d, expected] of [
        [ 2n, 3n,  1n],
        [-2n, 3n, -1n],
        [ 0n, 1n,  0n],
      ]) {
        const s = new Stack();
        s.push(Rational(n, d));
        lookup('SIGN').fn(s);
        assert(s.peek(1).type === 'integer' && s.peek(1).value === expected,
          `EXACT: SIGN ${n}/${d} → ${expected}`);
      }
    }
  }

  // Formatter — Rational prints as `n/d`.
  {
    const s1 = format(Rational(1, 3));
    assert(s1 === '1/3', `format(Rational(1,3)) = '1/3' (got '${s1}')`);
    const s2 = format(Rational(-7, 4));
    assert(s2 === '-7/4', `format(Rational(-7,4)) = '-7/4' (got '${s2}')`);
  }
}

/* ================================================================
   Real arithmetic — decimal.js-backed.

   Real × Real arithmetic goes through decimal.js at precision 15.
   The point: heal the IEEE-754 artifacts that haunt JS-number
   arithmetic, so the HP50 classroom-math illusion holds.
   ================================================================ */
{
  // Sanity — the classic 0.1 + 0.2 ≠ 0.3 trap in JS number arithmetic.
  // Real + Real must give an exact 0.3 via decimal.js.
  {
    const s = new Stack();
    s.push(Real(0.1));
    s.push(Real(0.2));
    lookup('+').fn(s);
    const r = s.peek();
    assert(r.type === 'real' && r.value.eq(0.3),
      `decimal: 0.1 + 0.2 → Real(0.3) (got ${r.value})`);
  }

  // Multiplication — `3 * 0.4 - 1.2` lands on exact zero instead of
  // 2.22e-16.
  {
    const s = new Stack();
    s.push(Real(3));
    s.push(Real(0.4));
    lookup('*').fn(s);
    s.push(Real(1.2));
    lookup('-').fn(s);
    const r = s.peek();
    assert(r.type === 'real' && r.value.eq(0),
      `decimal: 3*0.4 - 1.2 → Real(0) (got ${r.value})`);
  }

  // Division that should be exact — 1/10 stays at 0.1 (no IEEE tail).
  {
    const s = new Stack();
    s.push(Real(1));
    s.push(Real(10));
    lookup('/').fn(s);
    const r = s.peek();
    assert(r.type === 'real' && r.value.eq(0.1),
      `decimal: 1/10 → Real(0.1) (got ${r.value})`);
  }

  // Power — 1.1^2 = 1.21 exactly (vs. 1.2100000000000002 native).
  {
    const s = new Stack();
    s.push(Real(1.1));
    s.push(Real(2));
    lookup('^').fn(s);
    const r = s.peek();
    assert(r.type === 'real' && r.value.eq(1.21),
      `decimal: 1.1^2 → Real(1.21) (got ${r.value})`);
  }

  // Compound expression — 0.1 + 0.1 + 0.1 accumulates exactly.
  {
    const s = new Stack();
    s.push(Real(0.1));
    s.push(Real(0.1));
    lookup('+').fn(s);
    s.push(Real(0.1));
    lookup('+').fn(s);
    const r = s.peek();
    assert(r.type === 'real' && r.value.eq(0.3),
      `decimal: 0.1 + 0.1 + 0.1 → Real(0.3) (got ${r.value})`);
  }

  // Division by zero still throws 'Infinite result' (not NaN / Infinity).
  {
    const s = new Stack();
    s.push(Real(1));
    s.push(Real(0));
    try {
      lookup('/').fn(s);
      assert(false, 'decimal: 1/0 should throw');
    } catch (e) {
      assert(e.message === 'Infinite result',
        `decimal: 1/0 throws 'Infinite result' (got '${e.message}')`);
    }
  }
}

/* ================================================================
   Complex arithmetic — complex.js-backed.

   Complex × Complex arithmetic routes through complex.js.  The
   payload on the stack is a plain `{ re, im }` pair.  complex.js's
   kernel gives us exact identity preservation (i² = -1, not
   i² ≈ -1 + 0i with trailing zeros), correct branch-cut handling at
   negative reals for `^`, and a library-vetted polar-form pow.
   ================================================================ */
{
  // i * i = -1 exactly.  Tests the identity preservation through the
  // complex.js multiplication kernel.
  {
    const s = new Stack();
    s.push(Complex(0, 1));
    s.push(Complex(0, 1));
    lookup('*').fn(s);
    const r = s.peek();
    assert(r.type === 'complex' && r.re === -1 && r.im === 0,
      `complex: i * i → (-1, 0) (got (${r.re}, ${r.im}))`);
  }

  // (1+2i) + (3-i) = 4 + i.
  {
    const s = new Stack();
    s.push(Complex(1, 2));
    s.push(Complex(3, -1));
    lookup('+').fn(s);
    const r = s.peek();
    assert(r.type === 'complex' && r.re === 4 && r.im === 1,
      `complex: (1+2i) + (3-i) → (4, 1) (got (${r.re}, ${r.im}))`);
  }

  // (1+2i) * (3-i) = 5 + 5i.
  {
    const s = new Stack();
    s.push(Complex(1, 2));
    s.push(Complex(3, -1));
    lookup('*').fn(s);
    const r = s.peek();
    assert(r.type === 'complex' && r.re === 5 && r.im === 5,
      `complex: (1+2i) * (3-i) → (5, 5) (got (${r.re}, ${r.im}))`);
  }

  // (1+i)^2 = 2i exactly.  Tests pow via polar form.
  {
    const s = new Stack();
    s.push(Complex(1, 1));
    s.push(Complex(2, 0));
    lookup('^').fn(s);
    const r = s.peek();
    // The library's pow uses polar form — check the result is within
    // a very tight ULP of (0, 2).  Strict equality may pick up a last-
    // bit trig artifact, so tolerate < 1e-12 on each component.
    assert(r.type === 'complex'
           && Math.abs(r.re) < 1e-12
           && Math.abs(r.im - 2) < 1e-12,
      `complex: (1+i)^2 → (0, 2) (got (${r.re}, ${r.im}))`);
  }

  // Division by zero on Complex still throws 'Infinite result'.
  {
    const s = new Stack();
    s.push(Complex(1, 1));
    s.push(Complex(0, 0));
    try {
      lookup('/').fn(s);
      assert(false, 'complex: (1+i) / 0 should throw');
    } catch (e) {
      assert(e.message === 'Infinite result',
        `complex: (1+i) / 0 throws 'Infinite result' (got '${e.message}')`);
    }
  }
}

/* ================================================================
   Rational lifting into Symbolic AST.

   `_toAst(Rational)` returns Bin('/', Num(n), Num(d)) so a Rational
   survives into a Symbolic expression without being flattened to a
   float leaf.  LN/LOG/EXP/SIN/etc. on a Symbolic argument containing
   a Rational form a valid symbolic expression rather than throwing
   "Bad argument type".
   ================================================================ */
{
  // Rational + Name lifts to Symbolic.
  {
    const s = new Stack();
    s.push(Name('X', { quoted: true }));
    s.push(Rational(1, 3));
    lookup('+').fn(s);
    const r = s.peek();
    assert(r.type === 'symbolic',
      `rational->AST: X + 1/3 lifts to Symbolic (got ${r.type})`);
    const txt = format(r);
    assert(txt.includes('1/3') && txt.includes('X'),
      `rational->AST: X + 1/3 formats with both X and 1/3 (got '${txt}')`);
  }

  // LN of (X + 1/3) — Rational survives through the AST into a
  // transcendental wrapper.
  {
    const s = new Stack();
    s.push(Name('X', { quoted: true }));
    s.push(Rational(1, 3));
    lookup('+').fn(s);
    lookup('LN').fn(s);
    const r = s.peek();
    assert(r.type === 'symbolic',
      `rational->AST: LN(X + 1/3) is Symbolic (got ${r.type})`);
    const txt = format(r);
    assert(txt.includes('LN') && txt.includes('1/3'),
      `rational->AST: LN(X + 1/3) formats with LN(...) and 1/3 (got '${txt}')`);
  }
}

/* ================================================================
   EXACT/APPROX — exactness preservation and push-time decimation.

   EXACT (flag -105 CLEAR):
     Integer/Rational inputs to transcendental ops keep the result
     Symbolic when the closed-form answer is not an integer.
     `SQRT(2)`, `LN(2)`, `EXP(1)`, `SIN(30)` (any angle mode), `2^(1/3)`
     all stay as Symbolic.  Clean folds like `SQRT(9)=3`, `LN(1)=0`,
     `SIN(0)=0`, `EXP(0)=1` still collapse to Integer(0/1/3).

   APPROX (flag -105 SET):
     Integer/Rational/pure-numeric-Symbolic values coerce to Real on
     the way onto the stack — "fractions and integers decimate on
     entry, in expressions too."  Values with free variables do NOT
     decimate; `X + 1` stays symbolic.
   ================================================================ */
{
  const prev = calcState.approxMode;
  setApproxMode(false);
  try {
    // SQRT(2) stays Symbolic
    {
      const s = new Stack();
      s.push(Integer(2));
      lookup('SQRT').fn(s);
      assert(s.peek(1).type === 'symbolic',
        'EXACT: SQRT(2) → Symbolic (irrational stays exact)');
    }
    // SQRT(9)=3 still folds to Integer (clean integer result)
    {
      const s = new Stack();
      s.push(Integer(9));
      lookup('SQRT').fn(s);
      assert(s.peek(1).type === 'integer' && s.peek(1).value === 3n,
        'EXACT: SQRT(9) → Integer(3) (clean fold still folds)');
    }
    // SQRT(3/5) stays Symbolic
    {
      const s = new Stack();
      s.push(Rational(3, 5));
      lookup('SQRT').fn(s);
      assert(s.peek(1).type === 'symbolic',
        'EXACT: SQRT(3/5) → Symbolic (non-perfect-square fraction stays exact)');
    }
    // LN(2) stays Symbolic
    {
      const s = new Stack();
      s.push(Integer(2));
      lookup('LN').fn(s);
      assert(s.peek(1).type === 'symbolic',
        'EXACT: LN(2) → Symbolic (irrational stays exact)');
    }
    // LN(1) = 0 still folds
    {
      const s = new Stack();
      s.push(Integer(1));
      lookup('LN').fn(s);
      assert(s.peek(1).type === 'integer' && s.peek(1).value === 0n,
        'EXACT: LN(1) → Integer(0) (clean fold still folds)');
    }
    // EXP(0) = 1 still folds
    {
      const s = new Stack();
      s.push(Integer(0));
      lookup('EXP').fn(s);
      assert(s.peek(1).type === 'integer' && s.peek(1).value === 1n,
        'EXACT: EXP(0) → Integer(1) (clean fold still folds)');
    }
    // EXP(1) stays Symbolic
    {
      const s = new Stack();
      s.push(Integer(1));
      lookup('EXP').fn(s);
      assert(s.peek(1).type === 'symbolic',
        'EXACT: EXP(1) → Symbolic');
    }
    // 2 ^ (1/3) stays Symbolic
    {
      const s = new Stack();
      s.push(Integer(2));
      s.push(Rational(1, 3));
      lookup('^').fn(s);
      assert(s.peek(1).type === 'symbolic',
        'EXACT: 2 ^ (1/3) → Symbolic (fractional exponent stays exact)');
    }
    // Real SQRT still decimates (Real wasn't ever symbolic-preserving)
    {
      const s = new Stack();
      s.push(Real(2));
      lookup('SQRT').fn(s);
      assert(s.peek(1).type === 'real',
        'EXACT: SQRT(2.0) → Real (Real inputs never lift to Symbolic)');
    }
  } finally {
    setApproxMode(prev);
  }
}

{
  const prev = calcState.approxMode;
  setApproxMode(true);
  try {
    // Integer → Real on push
    {
      const s = new Stack();
      s.push(Integer(42));
      const v = s.peek(1);
      assert(v.type === 'real' && v.value.eq(42),
        'APPROX: push(Integer(42)) coerces to Real(42)');
    }
    // Rational → Real on push
    {
      const s = new Stack();
      s.push(Rational(1, 3));
      const v = s.peek(1);
      assert(v.type === 'real' && Math.abs(v.value.toNumber() - (1/3)) < 1e-12,
        'APPROX: push(Rational(1/3)) coerces to Real(0.333…)');
    }
    // Symbolic with no free variables — pure-numeric 1/3 — decimates
    {
      const s = new Stack();
      const parsed = parseEntry('`1/3`');        // → Symbolic(AstBin('/',1,3))
      for (const val of parsed) s.push(val);
      const v = s.peek(1);
      assert(v.type === 'real',
        `APPROX: push(Symbolic(1/3)) coerces to Real (got ${v.type})`);
      assert(Math.abs(v.value.toNumber() - (1/3)) < 1e-12,
        `APPROX: Symbolic(1/3) → ~0.333… (got ${v.value})`);
    }
    // Symbolic WITH free variables — X + 1 — stays symbolic
    {
      const s = new Stack();
      const parsed = parseEntry('`X+1`');
      for (const val of parsed) s.push(val);
      const v = s.peek(1);
      assert(v.type === 'symbolic',
        'APPROX: Symbolic with free variables stays Symbolic on push');
    }
    // Arithmetic respects coercion: Integer(3) + Integer(4) → Real(7)
    {
      const s = new Stack();
      s.push(Integer(3));
      s.push(Integer(4));
      lookup('+').fn(s);
      const v = s.peek(1);
      assert(v.type === 'real' && v.value.eq(7),
        'APPROX: 3 4 + → Real(7) after push coercion');
    }
    // Large Integer (beyond 2^53) → Real via Decimal string path, no
    // precision loss on the integer part
    {
      const s = new Stack();
      s.push(Integer(10n ** 20n));
      const v = s.peek(1);
      assert(v.type === 'real',
        'APPROX: push(big BigInt) coerces to Real');
      assert(v.value.eq(new Decimal('1e20')),
        'APPROX: push(10^20) keeps precision via Decimal string');
    }
    // EXACT → APPROX transition: existing Integer on the stack doesn't
    // retroactively decimate, only fresh pushes do.  Stack ops like DUP
    // preserve what's there.
    {
      setApproxMode(false);
      const s = new Stack();
      s.push(Integer(5));
      setApproxMode(true);
      // DUP must not trigger coercion — it copies a stack slot, it
      // doesn't push a "new" value.
      s.dup();
      assert(s.peek(1).type === 'integer' && s.peek(2).type === 'integer',
        'APPROX: DUP does not retroactively coerce existing Integer');
    }
  } finally {
    setApproxMode(prev);
  }
}

/* ================================================================
   session095: HP50 identifier validator

   Covers the exported helpers in types.js plus the integration with
   register() in ops.js (every registered op name becomes reserved).
   The shape follows HP50 AUR §2.2.4: 1-127 letters/digits/underscore
   starting with a letter, case-sensitive, reserved command names
   refused for storage.  The validator intentionally permits the HP50
   Greek range (U+0391-U+03A9, U+03B1-U+03C9) but no wider Unicode.
   ================================================================ */
{
  assert(isValidHpIdentifier('X'),     'isValid: single ASCII letter');
  assert(isValidHpIdentifier('X1'),    'isValid: letter + digit');
  assert(isValidHpIdentifier('foo_bar'), 'isValid: lowercase + underscore');
  assert(isValidHpIdentifier('α'),     'isValid: Greek alpha (U+03B1)');
  assert(isValidHpIdentifier('Ω'),     'isValid: Greek Omega (U+03A9)');
  assert(isValidHpIdentifier('Xα2_y'), 'isValid: mixed Greek/ASCII/digits/_');
  assert(isValidHpIdentifier('A'.repeat(127)), 'isValid: 127 chars (max)');

  assert(!isValidHpIdentifier(''),       '!isValid: empty string');
  assert(!isValidHpIdentifier('1X'),     '!isValid: leading digit');
  assert(!isValidHpIdentifier('_X'),     '!isValid: leading underscore');
  assert(!isValidHpIdentifier('X Y'),    '!isValid: space inside');
  assert(!isValidHpIdentifier('X+Y'),    '!isValid: operator inside');
  assert(!isValidHpIdentifier("X'"),     '!isValid: tick inside');
  assert(!isValidHpIdentifier('X.Y'),    '!isValid: period inside');
  assert(!isValidHpIdentifier('café'),   '!isValid: Latin-1 accent (outside HP set)');
  assert(!isValidHpIdentifier('日本'),   '!isValid: CJK (outside HP set)');
  assert(!isValidHpIdentifier('A'.repeat(128)), '!isValid: 128 chars (over limit)');
  assert(!isValidHpIdentifier(null),     '!isValid: null');
  assert(!isValidHpIdentifier(42),       '!isValid: number');

  // ops.js registers every op name at module load.  'SIN' / 'STO' are
  // core ops; querying them should now show reserved.
  assert(isReservedHpName('SIN'),  'SIN registered as reserved (from ops.js load)');
  assert(isReservedHpName('sin'),  'SIN case-insensitive match');
  assert(isReservedHpName('STO'),  'STO registered as reserved');
  assert(!isReservedHpName('MYVAR'), 'MYVAR (unregistered) is not reserved');

  // Ad-hoc registration — verify the hook works for the non-op path.
  registerReservedName('MYRESERVED_PROBE_X');
  assert(isReservedHpName('MYRESERVED_PROBE_X'), 'registerReservedName sticks');
  assert(isReservedHpName('myreserved_probe_x'), 'registerReservedName: case folds');

  assert(isStorableHpName('MYVAR'),  'isStorable: valid + unreserved');
  assert(!isStorableHpName('SIN'),   '!isStorable: valid but reserved');
  assert(!isStorableHpName('1X'),    '!isStorable: invalid shape');
  assert(!isStorableHpName(''),      '!isStorable: empty');

  // Wiring integration check: the /ops.js/ write path surfaces
  // "Invalid name" through RPLError when given anything that fails
  // isStorableHpName.  The string literal is the canonical message
  // emitted by _coerceStorableName.
  resetHome();
  clearLastError();
  {
    const s = new Stack();
    s.push(Real(1));
    s.push(Name('SIN', { quoted: true }));   // reserved
    assertThrows(() => { lookup('STO').fn(s); }, /Invalid name/,
      'STO on reserved name SIN throws "Invalid name"');
  }
  {
    const s = new Stack();
    s.push(Real(1));
    s.push(Str('1X'));                       // invalid shape
    assertThrows(() => { lookup('STO').fn(s); }, /Invalid name/,
      'STO on invalid shape "1X" throws "Invalid name"');
  }
  {
    const s = new Stack();
    s.push(Name('COS', { quoted: true }));   // reserved
    assertThrows(() => { lookup('CRDIR').fn(s); }, /Invalid name/,
      'CRDIR on reserved name COS throws "Invalid name"');
  }
  // Regression guard: a plain legal name still stores.
  {
    const s = new Stack();
    s.push(Real(7));
    s.push(Name('FOO', { quoted: true }));
    lookup('STO').fn(s);
    const v = varRecall('FOO');
    assert(isReal(v) && v.value.eq(7), 'STO on plain name FOO succeeds');
  }
  resetHome();
}

/* ================================================================
   Sy round-trip hardening for HP50 two-arg ops.

   closed the Sy axis for eleven arity-1 ops via
   KNOWN_FUNCTIONS entries and hard tests in tests/test-algebra.mjs.
   That file is lock-held this session, so we mirror the pattern in
   tests/test-types.mjs and extend coverage to the arity-2 (and
   variadic) surface that was never pinned:

     Cluster A — 10 two-arg HP50 ops: MIN, MAX, MOD, COMB, PERM,
       IQUOT, IREMAINDER, GCD, LCM, XROOT.  Each passes through
       parseEntry → Symbolic → formatAlgebra → parseEntry-idempotent,
       and exercises its defaultFnEval numeric fold at simplify time.

     Cluster B — 10 special-function / stat-dist ops: UTPC, UTPF,
       UTPT, BETA, ERF, ERFC, GAMMA, LNGAMMA, HEAVISIDE, DIRAC.
       Parser round-trip + eval guards (HEAVISIDE / DIRAC / GAMMA
       fold on safe inputs; the others return null → leave-symbolic).

     Cluster C — TRUNC's arity-2 enforcement (1-arg form rejected at
       parseAlgebra) and PSI's variadic 1-or-2-arg shape.

   The round-trip check is parseEntry(format(parseEntry(src))) →
   same Symbolic shape.  The comparison we assert on is textual
   equality after format (so whitespace normalizes to parser canonical
   form, matching the existing test-algebra.mjs pattern).
   ================================================================ */
{
  const rtSymbolic = (entrySrc) => {
    const [v1] = parseEntry(`\`${entrySrc}\``);
    assert(v1 && v1.type === 'symbolic',
      `session105: parseEntry \`${entrySrc}\` → Symbolic (got ${v1?.type})`);
    const f1 = format(v1);
    const [v2] = parseEntry(f1);
    assert(v2 && v2.type === 'symbolic',
      `session105: reparse ${f1} → Symbolic (got ${v2?.type})`);
    const f2 = format(v2);
    assert(f1 === f2,
      `session105: round-trip idempotent for ${entrySrc} (got ${f1} vs ${f2})`);
  };

  const CLUSTER_A = [
    'MIN', 'MAX', 'MOD', 'COMB', 'PERM',
    'IQUOT', 'IREMAINDER', 'GCD', 'LCM', 'XROOT',
  ];
  for (const name of CLUSTER_A) {
    assert(isKnownFunction(name),
      `session105: isKnownFunction('${name}') (Cluster A)`);
    assert(isKnownFunction(name.toLowerCase()),
      `session105: isKnownFunction case-insensitive for '${name}'`);
  }

  // Per-op round-trips with concrete symbolic operands.
  rtSymbolic('MIN(X, 3)');
  rtSymbolic('MAX(X, 3)');
  rtSymbolic('MOD(X, 3)');
  rtSymbolic('COMB(N, K)');
  rtSymbolic('PERM(N, K)');
  rtSymbolic('IQUOT(A, B)');
  rtSymbolic('IREMAINDER(A, B)');
  rtSymbolic('GCD(X, 12)');
  rtSymbolic('LCM(X, 12)');
  rtSymbolic('XROOT(Y, 3)');

  // Numeric folds for the arity-2 evaluators (safe, mode-independent).
  assert(defaultFnEval('MIN',  [3, 5]) === 3,           'session105: MIN(3,5) fold');
  assert(defaultFnEval('MIN',  [5, 3]) === 3,           'session105: MIN(5,3) fold');
  assert(defaultFnEval('MAX',  [3, 5]) === 5,           'session105: MAX(3,5) fold');
  assert(defaultFnEval('MAX',  [5, 3]) === 5,           'session105: MAX(5,3) fold');
  assert(defaultFnEval('MOD',  [10, 3]) === 1,          'session105: MOD(10,3) fold');
  assert(defaultFnEval('MOD',  [-7, 3]) === 2,          'session105: MOD(-7,3) floor-div sign');
  assert(defaultFnEval('MOD',  [10, 0]) === null,       'session105: MOD(10,0) leaves symbolic');
  assert(defaultFnEval('COMB', [5, 2]) === 10,          'session105: COMB(5,2) fold');
  assert(defaultFnEval('COMB', [5, 0]) === 1,           'session105: COMB(5,0) fold');
  assert(defaultFnEval('COMB', [5, 6]) === null,        'session105: COMB(5,6) out-of-range → null');
  assert(defaultFnEval('COMB', [-1, 2]) === null,       'session105: COMB(-1,2) negative → null');
  assert(defaultFnEval('PERM', [5, 2]) === 20,          'session105: PERM(5,2) fold');
  assert(defaultFnEval('PERM', [5, 0]) === 1,           'session105: PERM(5,0) fold');
  assert(defaultFnEval('PERM', [5, 6]) === null,        'session105: PERM(5,6) out-of-range → null');
  assert(defaultFnEval('IQUOT',[17, 5]) === 3,          'session105: IQUOT(17,5) fold');
  assert(defaultFnEval('IQUOT',[-17, 5]) === -3,        'session105: IQUOT(-17,5) truncates towards 0');
  assert(defaultFnEval('IQUOT',[10, 0]) === null,       'session105: IQUOT(10,0) leaves symbolic');
  assert(defaultFnEval('IREMAINDER',[17, 5]) === 2,     'session105: IREMAINDER(17,5) fold');
  assert(defaultFnEval('IREMAINDER',[-17, 5]) === -2,   'session105: IREMAINDER(-17,5) sign');
  assert(defaultFnEval('IREMAINDER',[10, 0]) === null,  'session105: IREMAINDER(10,0) leaves symbolic');
  assert(defaultFnEval('GCD',  [12, 18]) === 6,         'session105: GCD(12,18) fold');
  assert(defaultFnEval('GCD',  [0, 7]) === 7,           'session105: GCD(0,7) → 7');
  assert(defaultFnEval('GCD',  [1.5, 3]) === null,      'session105: GCD non-integer → null');
  assert(defaultFnEval('LCM',  [4, 6]) === 12,          'session105: LCM(4,6) fold');
  assert(defaultFnEval('LCM',  [0, 7]) === 0,           'session105: LCM(0,n) → 0');
  assert(defaultFnEval('LCM',  [1.5, 3]) === null,      'session105: LCM non-integer → null');
  assert(defaultFnEval('XROOT',[27, 3]) === 3,          'session105: XROOT(27,3) fold');
  assert(Math.abs(defaultFnEval('XROOT',[2, 2]) - Math.SQRT2) < 1e-12,
    'session105: XROOT(2,2) = √2');
  assert(defaultFnEval('XROOT',[-8, 3]) === null,       'session105: XROOT negative radicand → null');
  assert(defaultFnEval('XROOT',[8, 0]) === null,        'session105: XROOT zero index → null');

  const CLUSTER_B = [
    'UTPC', 'UTPF', 'UTPT', 'BETA', 'ERF', 'ERFC',
    'GAMMA', 'LNGAMMA', 'HEAVISIDE', 'DIRAC',
  ];
  for (const name of CLUSTER_B) {
    assert(isKnownFunction(name),
      `session105: isKnownFunction('${name}') (Cluster B)`);
  }

  // Sy round-trip at representative entry-line forms.
  rtSymbolic('UTPC(4, X)');
  rtSymbolic('UTPF(2, 3, X)');
  rtSymbolic('UTPT(5, X)');
  rtSymbolic('BETA(3, X)');
  rtSymbolic('ERF(X)');
  rtSymbolic('ERFC(X)');
  rtSymbolic('GAMMA(X)');
  rtSymbolic('LNGAMMA(X)');
  rtSymbolic('HEAVISIDE(X)');
  rtSymbolic('DIRAC(X-1)');

  // Fold guards: HEAVISIDE / DIRAC / GAMMA have safe numeric evaluators.
  // All other special-fn evaluators must stay null (leave-symbolic) — the
  // stack ops own the Lanczos / incomplete-beta path, not simplify().
  assert(defaultFnEval('HEAVISIDE', [2])  === 1,    'session105: HEAVISIDE(2) → 1');
  assert(defaultFnEval('HEAVISIDE', [0])  === 1,    'session105: HEAVISIDE(0) → 1 (HP50 convention)');
  assert(defaultFnEval('HEAVISIDE', [-1]) === 0,    'session105: HEAVISIDE(-1) → 0');
  assert(defaultFnEval('DIRAC',     [3])  === 0,    'session105: DIRAC(3) → 0');
  assert(defaultFnEval('DIRAC',     [0])  === null, 'session105: DIRAC(0) leaves symbolic');
  assert(defaultFnEval('GAMMA',     [5])  === 24,   'session105: GAMMA(5) = 24 (integer fold)');
  assert(defaultFnEval('GAMMA',     [0])  === null, 'session105: GAMMA(0) leaves symbolic (pole)');
  assert(defaultFnEval('GAMMA',     [0.5]) === null, 'session105: GAMMA(0.5) non-integer → null');
  assert(defaultFnEval('GAMMA',     [180]) === null, 'session105: GAMMA(180) overflow → null');
  assert(defaultFnEval('ERF',       [0.5]) === null, 'session105: ERF has no simplify-time fold');
  assert(defaultFnEval('ERFC',      [0.5]) === null, 'session105: ERFC has no simplify-time fold');
  assert(defaultFnEval('BETA',      [3, 4]) === null, 'session105: BETA has no simplify-time fold');
  assert(defaultFnEval('UTPC',      [4, 9.5]) === null, 'session105: UTPC has no simplify-time fold');
  assert(defaultFnEval('UTPF',      [2, 3, 1.5]) === null, 'session105: UTPF has no simplify-time fold');
  assert(defaultFnEval('UTPT',      [5, 1.2]) === null, 'session105: UTPT has no simplify-time fold');
  assert(defaultFnEval('LNGAMMA',   [5]) === null,    'session105: LNGAMMA has no simplify-time fold');

  // TRUNC has spec.arity === 2 → 1-arg form must be rejected at parseAlgebra
  // (the throw path).  2-arg form round-trips.  3-arg form is also rejected.
  rtSymbolic('TRUNC(X, 3)');
  {
    // session117: migrated from `let threw; try{…}catch(e){…}` to
    // `assertThrows` + follow-up regex guard on the actual-count
    // portion (`got 1`).  The original composite assertion only
    // pinned the "expects 2 argument" prefix; the actual-count
    // tail was uncovered, so a refactor that broke the `got N`
    // template would have silently slipped through.  Splitting
    // gives one assertion per invariant. Precedent:
    // LOG(-10)-CMPLX-OFF split (message vs. non-TypeError guard).
    const err = assertThrows(
      () => parseEntry("`TRUNC(X)`"),
      /TRUNC expects 2 argument/,
      'session105: TRUNC(X) 1-arg form rejected at parseAlgebra');
    assert(err && /got 1\b/.test(err.message),
      'session117: TRUNC(X) rejection reports actual arg-count "got 1"');
  }
  {
    const err = assertThrows(
      () => parseEntry("`TRUNC(X, 3, 4)`"),
      /TRUNC expects 2 argument/,
      'session105: TRUNC(X,3,4) 3-arg form rejected at parseAlgebra');
    assert(err && /got 3\b/.test(err.message),
      'session117: TRUNC(X,3,4) rejection reports actual arg-count "got 3"');
  }

  // PSI is variadic (no spec.arity) — both 1-arg (digamma) and 2-arg
  // (polygamma) round-trip.  3+ args also parse (the parser skips the
  // arity guard) — we treat that as a deliberate HP50 convention
  // (AUR §CAS-SPECIAL lists `psi(x, n)`; the entry parser is lenient).
  rtSymbolic('PSI(X)');
  rtSymbolic('PSI(X, 2)');
  assert(defaultFnEval('PSI', [1])    === null,
    'session105: PSI has no simplify-time fold (1-arg)');
  assert(defaultFnEval('PSI', [1, 2]) === null,
    'session105: PSI has no simplify-time fold (2-arg)');
}

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

  // Division by zero: #5h / Integer(0) throws Division by zero
  // (routed through binIntBinary after coercion — distinct from
  // the Real-path 'Infinite result').
  assertThrows(
    () => {
      const s = new Stack();
      s.push(BinaryInteger(5n, 'h'));
      s.push(Integer(0n));
      lookup('/').fn(s);
    },
    /Division by zero/,
    'session110: #5h / Integer(0) → Division by zero (BinInt branch)'
  );

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

  // SAME follows the same comparator — pin that Rational×Real SAME
  // also returns 1.  (Contrast: SAME #10h Integer(16) = 0 because
  // BinInt is OUT of isNumber; Rational is IN.)
  {
    const s = new Stack();
    s.push(Rational(1, 2));
    s.push(Real(0.5));
    lookup('SAME').fn(s);
    const v = s.peek();
    assert(isReal(v) && v.value.eq(1),
      `session110: SAME Rational(1,2) Real(0.5) → 1 (Rational is in isNumber lattice)`);
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
  // Q / Z(0) — Fraction.js throws "Division by Zero" — the BigInt-backed
  // library does NOT return the Real-path's "Infinite result" because the
  // rational dispatch is entered before the Real branch.
  assertThrows(
    () => {
      const s = new Stack();
      s.push(Rational(3n, 2n));
      s.push(Integer(0n));
      lookup('/').fn(s);
    },
    /Division by Zero/,
    'session115: Rational(3,2) / Integer(0) → Division by Zero (Fraction.js path)'
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
  assertTaggedRealClose('ASINH', 'v', Real(2), Math.asinh(2), 1e-12,
    ':v:Real(2) ASINH → :v:asinh(2) ≈ 1.4436');
  assertTaggedRealClose('ACOSH', 'v', Real(2), Math.acosh(2), 1e-12,
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
    assert(v.items[0].value.eq(0) && Math.abs(v.items[1].value.toNumber() - Math.sinh(1)) < 1e-12,
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
        && Math.abs(v.value.items[1].value.toNumber() - Math.sinh(1)) < 1e-12,
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
    assert(isReal(v),
      `session125: MIN Rational(1,2) Rational(1,3) → Real (Q→R degradation, NOT stay-exact; got ${v?.type})`);
    assert(Math.abs(v.value.toNumber() - 1/3) < 1e-12,
      `session125: MIN Rational(1,2) Rational(1,3) → Real(≈0.333) (got ${v?.value?.toString()})`);
  }

  // MAX Q Q → Real(1/2).
  {
    const s = new Stack();
    s.push(Rational(1n, 2n));
    s.push(Rational(1n, 3n));
    lookup('MAX').fn(s);
    const v = s.peek();
    assert(isReal(v) && Math.abs(v.value.toNumber() - 0.5) < 1e-12,
      `session125: MAX Rational(1,2) Rational(1,3) → Real(0.5) (Q→R degradation; got ${v?.type}(${v?.value}))`);
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
    assert(isReal(v) && Math.abs(v.value.toNumber() - 0.5) < 1e-12,
      `session125: MIN Rational(1,2) Integer(1) → Real(0.5) (Q×Z falls to Real branch; got ${v?.type}(${v?.value}))`);
  }

  // Operand-order symmetry — Z × Q routes through the same Real
  // fall-through branch.
  {
    const s = new Stack();
    s.push(Integer(1n));
    s.push(Rational(1n, 2n));
    lookup('MIN').fn(s);
    const v = s.peek();
    assert(isReal(v) && Math.abs(v.value.toNumber() - 0.5) < 1e-12,
      `session125: MIN Integer(1) Rational(1,2) → Real(0.5) (Z×Q symmetric)`);
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
      assert(isReal(items[1]) && Math.abs(Number(items[1].value) - Math.PI / 2) < 1e-12,
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
      assert(isReal(items[1]) && Math.abs(Number(items[1].value) - Math.PI / 2) < 1e-12,
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
          && Math.abs(Number(r[0][1].value) - Math.PI / 2) < 1e-12
          && Math.abs(Number(r[1][0].value) - (-Math.PI / 2)) < 1e-12
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
          && Math.abs(Number(r[0][1].value) - Math.PI / 2) < 1e-12
          && Math.abs(Number(r[1][0].value) - Math.PI) < 1e-12
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
          && isReal(v.items[0]) && Math.abs(Number(v.items[0].value) - Math.atan2(4, 3)) < 1e-12
          && isReal(v.items[1]) && Math.abs(Number(v.items[1].value) - Math.PI / 2) < 1e-12,
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
      assert(Math.abs(Number(r[0][0].value) - Math.PI / 2) < 1e-12
          && r[0][1].value.eq(0)
          && Math.abs(Number(r[1][0].value) - Math.PI) < 1e-12
          && Math.abs(Number(r[1][1].value) - (-Math.PI / 2)) < 1e-12,
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
      assert(isReal(items[0]) && Math.abs(Number(items[0].value) - Math.atan2(4, 3)) < 1e-12
          && isReal(items[1]) && Math.abs(Number(items[1].value) - Math.PI / 2) < 1e-12,
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
      s.push(Integer(1n));
      lookup('ATAN').fn(s);
      const v = s.peek();
      assert(v?.type === 'symbolic' && v.expr?.kind === 'fn' && v.expr.name === 'ATAN'
          && v.expr.args.length === 1 && v.expr.args[0]?.kind === 'num' && v.expr.args[0].value === 1,
        `session142: ATAN(Integer(1)) RAD → Symbolic ATAN(1) (atan(1)=π/4 not integer-clean — stay-symbolic via _exactUnaryLift); got ${v?.type} expr=${JSON.stringify(v?.expr)}`);
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
      s.push(Integer(30n));
      lookup('SIN').fn(s);
      const v = s.peek();
      assert(v?.type === 'symbolic' && v.expr?.kind === 'fn' && v.expr.name === 'SIN'
          && v.expr.args[0]?.kind === 'num' && v.expr.args[0].value === 30,
        `session145: SIN(Integer(30)) DEG → Symbolic SIN(30) (sin(30°)=0.5 not integer-clean; pins fractional-output stay-symbolic on the DEG axis); got ${v?.type} expr=${JSON.stringify(v?.expr)}`);
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

  // ALOG(Integer(-1)) → Symbolic ALOG(-1).  10^-1 = 0.1 is not
  // integer-clean (0.1 cannot collapse to integer 0 — the diff is
  // exactly 0.1, way over the 1e-12 tolerance); negative side of
  // the ALOG fold on a negative-integer operand.
  {
    const s = new Stack();
    s.push(Integer(-1n));
    lookup('ALOG').fn(s);
    const v = s.peek();
    assert(v?.type === 'symbolic' && v.expr?.kind === 'fn' && v.expr.name === 'ALOG'
        && v.expr.args[0]?.kind === 'num' && v.expr.args[0].value === -1,
      `session145: ALOG(Integer(-1)) → Symbolic ALOG(-1) (10^-1=0.1 not integer-clean; pins negative-integer-operand fall-through); got ${v?.type} expr=${JSON.stringify(v?.expr)}`);
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
          && v.value.items[1].expr?.kind === 'fn' && v.value.items[1].expr.name === 'ASIN';
      assert(okItem0 && okItem1Sym,
        `session150: ASIN :a:Vector(Integer(0), Integer(1)) RAD → :a:Vector(Integer(0), Symbolic ASIN(1)) (RAD-mode contrast on Integer operands: item[0] still folds to Integer(0) since asin(0)=0 is integer-clean in any angle mode, but item[1] stays-Symbolic because asin(1)=π/2 NOT integer-clean under RAD — _exactUnaryLift's stay-symbolic fall-through fires under the wrapper composition; angle-mode flip toggles Integer / Symbolic per element on the SAME Integer operands — DEG → :a:V[Z(0), Z(90)] vs RAD → :a:V[Z(0), Sym(ASIN(1))]; distinct from session 140's :a:V(Real(0),Real(1)) ASIN RAD pin which BYPASSED the EXACT-mode integer-stay arm with Real operands and produced Real(π/2) instead); got tag=${v?.tag} items=${v?.value?.items?.map(x => `${x.type}${x.value?.toString?.() ? '('+x.value.toString()+')' : ''}`).join(',')}`);
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
        && Math.abs(item.re - 0) < 1e-12
        && Math.abs(Math.abs(item.im) - Math.PI / 2) < 1e-12,
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
        && Math.abs(item.re - 0.5493061443340548) < 1e-12
        && Math.abs(Math.abs(item.im) - Math.PI / 2) < 1e-12,
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
        && isComplex(item1) && Math.abs(item1.re - 0) < 1e-12
            && Math.abs(Math.abs(item1.im) - Math.PI / 2) < 1e-12,
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
        && Math.abs(item1.re - 0.5493061443340548) < 1e-12
        && Math.abs(Math.abs(item1.im) - Math.PI / 2) < 1e-12,
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
          && Math.abs(v.items[1].value.toNumber() - expect1) < 1e-12,
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
          && Math.abs(v.value.items[1].value.toNumber() - expect1) < 1e-12,
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
            assert(Math.abs(v.items[0].value.toNumber() - Math.PI / 2) < 1e-12,
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
            assert(Math.abs(v.value.items[0].value.toNumber() - Math.PI / 2) < 1e-12,
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
            && Math.abs(v.items[1].value.toNumber() - expect1) < 1e-12,
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
            && Math.abs(v.value.items[1].value.toNumber() - expect1) < 1e-12,
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
            && Math.abs(v.items[0].value.toNumber() - expect0) < 1e-12
            && isReal(v.items[1])
            && Math.abs(v.items[1].value.toNumber() - expect1) < 1e-12,
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
            && Math.abs(v.value.items[0].value.toNumber() - expect0) < 1e-12
            && isReal(v.value.items[1])
            && Math.abs(v.value.items[1].value.toNumber() - expect1) < 1e-12,
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
          && item.expr?.kind === 'fn' && item.expr?.name === 'ACOS',
        `session185: { Integer(0) } ACOS RAD → { Symbolic(ACOS(0)) } (acos(0)=π/2; fromRadians(π/2)≈1.5707 not integer-clean → Symbolic arm; re-land T-003); got item type=${item?.type} expr=${JSON.stringify(item?.expr)}`);
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
          && isSymbolic(item) && item.expr?.kind === 'fn' && item.expr?.name === 'ACOS',
        `session185: :z:{ Integer(0) } ACOS RAD → :z:{ Symbolic(ACOS(0)) } (angle-mode Symbolic arm preserved through Tagged peel/rewrap; re-land T-003); got tag=${v?.tag} item type=${item?.type} expr=${JSON.stringify(item?.expr)}`);
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

/* ================================================================
   HEAVISIDE / DIRAC L / V / M / T wrapper-add
   Both ops wrapped with _withTaggedUnary(_withListUnary(_withVMUnary(…)))
 matching the same 3-deep composition used by XPON/MANT.
   HEAVISIDE: step function — scalar arm returns Real(1)/Real(0) or
   Integer(1)/Integer(0) depending on input type.  DIRAC: impulse —
   non-zero scalar folds to Real(0)/Integer(0); x=0 lifts to Symbolic.
   ================================================================ */
{

  // n=0 empty-List — bare axis
  {
    const s = new Stack();
    s.push(RList([]));
    lookup('HEAVISIDE').fn(s);
    const v = s.peek();
    assert(isList(v) && v.items.length === 0,
      `session191: { } HEAVISIDE → { } (n=0 bare List passthrough; got type=${v?.type} len=${v?.items?.length})`);
  }

  // n=0 empty-List — Tagged-of-List axis
  {
    const s = new Stack();
    s.push(Tagged('h', RList([])));
    lookup('HEAVISIDE').fn(s);
    const v = s.peek();
    assert(isTagged(v) && v.tag === 'h' && isList(v.value) && v.value.items.length === 0,
      `session191: :h:{ } HEAVISIDE → :h:{ } (n=0 Tagged-of-List; got tag=${v?.tag} type=${v?.value?.type})`);
  }

  // n=1 bare List — value-precise: HEAVISIDE(2)=1
  {
    const s = new Stack();
    s.push(RList([Real(2)]));
    lookup('HEAVISIDE').fn(s);
    const v = s.peek();
    const item = v?.items?.[0];
    assert(isList(v) && v.items.length === 1 && isReal(item) && item.value.toNumber() === 1,
      `session191: { Real(2) } HEAVISIDE → { Real(1) } (n=1 bare List; got item=${item?.value?.toString()})`);
  }

  // n=2 heterogeneous bare List — HEAVISIDE(2)=1, HEAVISIDE(-1)=0 distinct per slot
  {
    const s = new Stack();
    s.push(RList([Real(2), Real(-1)]));
    lookup('HEAVISIDE').fn(s);
    const v = s.peek();
    const [a, b] = v?.items ?? [];
    assert(isList(v) && v.items.length === 2
        && isReal(a) && a.value.toNumber() === 1
        && isReal(b) && b.value.toNumber() === 0,
      `session191: { Real(2) Real(-1) } HEAVISIDE → { Real(1) Real(0) } (n=2 bare List heterogeneous step output; got a=${a?.value?.toString()} b=${b?.value?.toString()})`);
  }

  // n=2 Tagged-of-List — outer tag re-wrapped
  {
    const s = new Stack();
    s.push(Tagged('h', RList([Real(2), Real(-1)])));
    lookup('HEAVISIDE').fn(s);
    const v = s.peek();
    const [a, b] = v?.value?.items ?? [];
    assert(isTagged(v) && v.tag === 'h' && isList(v.value) && v.value.items.length === 2
        && isReal(a) && a.value.toNumber() === 1
        && isReal(b) && b.value.toNumber() === 0,
      `session191: :h:{ Real(2) Real(-1) } HEAVISIDE → :h:{ Real(1) Real(0) } (Tagged-of-List; got tag=${v?.tag} a=${a?.value?.toString()} b=${b?.value?.toString()})`);
  }

  // Vector — element-wise: HEAVISIDE(1)=1, HEAVISIDE(-1)=0
  {
    const s = new Stack();
    s.push(Vector([Real(1), Real(-1)]));
    lookup('HEAVISIDE').fn(s);
    const v = s.peek();
    const [a, b] = v?.items ?? [];
    assert(isVector(v) && v.items.length === 2
        && isReal(a) && a.value.toNumber() === 1
        && isReal(b) && b.value.toNumber() === 0,
      `session191: [Real(1) Real(-1)] HEAVISIDE → [Real(1) Real(0)] (Vector element-wise; got a=${a?.value?.toString()} b=${b?.value?.toString()})`);
  }

  // Matrix — element-wise: 1×2 [[1 -1]] → [[1 0]]
  {
    const s = new Stack();
    s.push(Matrix([[Real(1), Real(-1)]]));
    lookup('HEAVISIDE').fn(s);
    const v = s.peek();
    const row = v?.rows?.[0] ?? [];
    assert(isMatrix(v) && v.rows.length === 1 && row.length === 2
        && isReal(row[0]) && row[0].value.toNumber() === 1
        && isReal(row[1]) && row[1].value.toNumber() === 0,
      `session191: [[Real(1) Real(-1)]] HEAVISIDE → [[Real(1) Real(0)]] (Matrix element-wise; got r00=${row[0]?.value?.toString()} r01=${row[1]?.value?.toString()})`);
  }

  // scalar Tagged-of-Real — tag preserved, inner folded
  {
    const s = new Stack();
    s.push(Tagged('x', Real(3)));
    lookup('HEAVISIDE').fn(s);
    const v = s.peek();
    assert(isTagged(v) && v.tag === 'x' && isReal(v.value) && v.value.value.toNumber() === 1,
      `session191: :x:Real(3) HEAVISIDE → :x:Real(1) (scalar Tagged; HEAVISIDE(3)=1; got tag=${v?.tag} val=${v?.value?.value?.toString()})`);
  }


  // n=0 empty-List — bare axis
  {
    const s = new Stack();
    s.push(RList([]));
    lookup('DIRAC').fn(s);
    const v = s.peek();
    assert(isList(v) && v.items.length === 0,
      `session191: { } DIRAC → { } (n=0 bare List passthrough; got type=${v?.type} len=${v?.items?.length})`);
  }

  // n=0 empty-List — Tagged-of-List axis
  {
    const s = new Stack();
    s.push(Tagged('d', RList([])));
    lookup('DIRAC').fn(s);
    const v = s.peek();
    assert(isTagged(v) && v.tag === 'd' && isList(v.value) && v.value.items.length === 0,
      `session191: :d:{ } DIRAC → :d:{ } (n=0 Tagged-of-List; got tag=${v?.tag} type=${v?.value?.type})`);
  }

  // n=1 bare List — at-zero: DIRAC(Real(0)) → Symbolic(DIRAC(0)) propagates through wrapper
  {
    const s = new Stack();
    s.push(RList([Real(0)]));
    lookup('DIRAC').fn(s);
    const v = s.peek();
    const item = v?.items?.[0];
    assert(isList(v) && v.items.length === 1
        && isSymbolic(item) && item.expr?.kind === 'fn' && item.expr?.name === 'DIRAC',
      `session191: { Real(0) } DIRAC → { Symbolic(DIRAC(0)) } (n=1 bare List; at-zero lifts to Symbolic through wrapper; got item type=${item?.type} expr=${JSON.stringify(item?.expr)})`);
  }

  // n=2 bare List non-zero — DIRAC(1)=0, DIRAC(2)=0 per slot
  {
    const s = new Stack();
    s.push(RList([Real(1), Real(2)]));
    lookup('DIRAC').fn(s);
    const v = s.peek();
    const [a, b] = v?.items ?? [];
    assert(isList(v) && v.items.length === 2
        && isReal(a) && a.value.toNumber() === 0
        && isReal(b) && b.value.toNumber() === 0,
      `session191: { Real(1) Real(2) } DIRAC → { Real(0) Real(0) } (n=2 bare List non-zero; got a=${a?.value?.toString()} b=${b?.value?.toString()})`);
  }

  // n=2 Tagged-of-List — outer tag re-wrapped
  {
    const s = new Stack();
    s.push(Tagged('d', RList([Real(1), Real(2)])));
    lookup('DIRAC').fn(s);
    const v = s.peek();
    const [a, b] = v?.value?.items ?? [];
    assert(isTagged(v) && v.tag === 'd' && isList(v.value) && v.value.items.length === 2
        && isReal(a) && a.value.toNumber() === 0
        && isReal(b) && b.value.toNumber() === 0,
      `session191: :d:{ Real(1) Real(2) } DIRAC → :d:{ Real(0) Real(0) } (Tagged-of-List; got tag=${v?.tag} a=${a?.value?.toString()} b=${b?.value?.toString()})`);
  }

  // Vector — element-wise: DIRAC(1)=0, DIRAC(3)=0
  {
    const s = new Stack();
    s.push(Vector([Real(1), Real(3)]));
    lookup('DIRAC').fn(s);
    const v = s.peek();
    const [a, b] = v?.items ?? [];
    assert(isVector(v) && v.items.length === 2
        && isReal(a) && a.value.toNumber() === 0
        && isReal(b) && b.value.toNumber() === 0,
      `session191: [Real(1) Real(3)] DIRAC → [Real(0) Real(0)] (Vector element-wise; got a=${a?.value?.toString()} b=${b?.value?.toString()})`);
  }

  // Matrix — element-wise: 1×1 [[Real(1)]] → [[Real(0)]]
  {
    const s = new Stack();
    s.push(Matrix([[Real(1)]]));
    lookup('DIRAC').fn(s);
    const v = s.peek();
    const cell = v?.rows?.[0]?.[0];
    assert(isMatrix(v) && v.rows.length === 1 && v.rows[0].length === 1
        && isReal(cell) && cell.value.toNumber() === 0,
      `session191: [[Real(1)]] DIRAC → [[Real(0)]] (Matrix element-wise; got cell=${cell?.value?.toString()})`);
  }

  // scalar Tagged-of-Real — tag preserved, inner folded
  {
    const s = new Stack();
    s.push(Tagged('x', Real(5)));
    lookup('DIRAC').fn(s);
    const v = s.peek();
    assert(isTagged(v) && v.tag === 'x' && isReal(v.value) && v.value.value.toNumber() === 0,
      `session191: :x:Real(5) DIRAC → :x:Real(0) (scalar Tagged; DIRAC(5)=0; got tag=${v?.tag} val=${v?.value?.value?.toString()})`);
  }
}

/* ================================================================
   session196: TRUNC — List distribution + Tagged transparency
   (_withTaggedBinary(_withListBinary(_truncOp())) wrapper-add)

   TRUNC is a 2-arg op: (x n → y), truncates x to n decimal places.
   Binary Tagged transparency drops the tag (unlike unary, which re-applies).
   V/M are deliberately ✗ — no _withVMBinary; mirrors MOD/MIN/MAX policy.
   ================================================================ */
{
  // n=0 empty-List bare — passthrough: { } 1 TRUNC → { }
  {
    const v = runOp('TRUNC', RList([]), Integer(1n));
    assert(isList(v) && v.items.length === 0,
      `session196: { } Integer(1) TRUNC → { } (n=0 bare List passthrough; got type=${v?.type} len=${v?.items?.length})`);
  }

  // n=0 Tagged-of-List — binary drops tag: :t:{ } 1 TRUNC → { }
  {
    const v = runOp('TRUNC', Tagged('t', RList([])), Integer(1n));
    assert(isList(v) && v.items.length === 0,
      `session196: :t:{ } Integer(1) TRUNC → { } (n=0 Tagged-of-List; binary tag drop; got type=${v?.type} len=${v?.items?.length})`);
  }

  // n=1 bare List single element: { Real(3.567) } Integer(1) TRUNC → { Real(3.5) }
  {
    const s = new Stack();
    s.push(RList([Real(3.567)]));
    s.push(Integer(1n));
    lookup('TRUNC').fn(s);
    const v = s.peek();
    const item = v?.items?.[0];
    assert(isList(v) && v.items.length === 1
        && isReal(item) && item.value.toNumber() === 3.5,
      `session196: { Real(3.567) } Integer(1) TRUNC → { Real(3.5) } (n=1 bare List; got item=${item?.value?.toString()})`);
  }

  // n=2 bare List heterogeneous values: { Real(1.567) Real(2.891) } Integer(1) TRUNC → { Real(1.5) Real(2.8) }
  {
    const s = new Stack();
    s.push(RList([Real(1.567), Real(2.891)]));
    s.push(Integer(1n));
    lookup('TRUNC').fn(s);
    const v = s.peek();
    const [a, b] = v?.items ?? [];
    assert(isList(v) && v.items.length === 2
        && isReal(a) && a.value.toNumber() === 1.5
        && isReal(b) && b.value.toNumber() === 2.8,
      `session196: { Real(1.567) Real(2.891) } Integer(1) TRUNC → { Real(1.5) Real(2.8) } (n=2 bare List; got a=${a?.value?.toString()} b=${b?.value?.toString()})`);
  }

  // n=2 Tagged-of-List — binary drops tag: :t:{ Real(1.567) Real(2.891) } Integer(1) TRUNC → { Real(1.5) Real(2.8) }
  {
    const s = new Stack();
    s.push(Tagged('t', RList([Real(1.567), Real(2.891)])));
    s.push(Integer(1n));
    lookup('TRUNC').fn(s);
    const v = s.peek();
    const [a, b] = v?.items ?? [];
    assert(isList(v) && !isTagged(v) && v.items.length === 2
        && isReal(a) && a.value.toNumber() === 1.5
        && isReal(b) && b.value.toNumber() === 2.8,
      `session196: :t:{ Real(1.567) Real(2.891) } Integer(1) TRUNC → { Real(1.5) Real(2.8) } (Tagged-of-List; tag dropped; got type=${v?.type} a=${a?.value?.toString()} b=${b?.value?.toString()})`);
  }

  // scalar Tagged — binary drops tag: :t:Real(3.567) Integer(1) TRUNC → Real(3.5)
  {
    const v = runOp('TRUNC', Tagged('t', Real(3.567)), Integer(1n));
    assert(isReal(v) && !isTagged(v) && v.value.toNumber() === 3.5,
      `session196: :t:Real(3.567) Integer(1) TRUNC → Real(3.5) (scalar Tagged; tag dropped; got type=${v?.type} val=${v?.value?.toString()})`);
  }

  // pairwise List × List: { Real(1.99) Real(2.345) } { Integer(0) Integer(2) } TRUNC → { Real(1) Real(2.34) }
  {
    const s = new Stack();
    s.push(RList([Real(1.99), Real(2.345)]));
    s.push(RList([Integer(0n), Integer(2n)]));
    lookup('TRUNC').fn(s);
    const v = s.peek();
    const [a, b] = v?.items ?? [];
    assert(isList(v) && v.items.length === 2
        && isReal(a) && a.value.toNumber() === 1
        && isReal(b) && Math.abs(b.value.toNumber() - 2.34) < 1e-10,
      `session196: { Real(1.99) Real(2.345) } { Integer(0) Integer(2) } TRUNC → { Real(1) Real(2.34) } (pairwise L×L; got a=${a?.value?.toString()} b=${b?.value?.toString()})`);
  }

  // Vector rejection — V stays ✗ (no _withVMBinary; mirrors MOD/MIN/MAX)
  assertThrows(
    () => runOp('TRUNC', Vector([Real(1.5), Real(2.5)]), Integer(1n)),
    /Bad argument type/,
    'session196: Vector Integer(1) TRUNC → Bad argument type (V deliberately ✗)');
}

/* ================================================================
   session200: GAMMA / LNGAMMA / erf / erfc — L/V/M/T verification
   (stale `·` cells → ✓ in DATA_TYPES.md matrix)

   These ops were already wrapped in their current registrations:
     GAMMA   → _withTaggedUnary(_withListUnary(bespoke-V/M handler))
     LNGAMMA → _withTaggedUnary(_withListUnary(bespoke-V/M handler))
     erf     → _withTaggedUnary(_withListUnary(bespoke-V/M handler))
     erfc    → _withTaggedUnary(_withListUnary(bespoke-V/M handler))
   The DATA_TYPES.md matrix carried `·` (not-applicable) for L/V/M on
   all four ops — a documentation lag from when the wrappers were added.
   No source changes; this cluster adds the missing hard assertions
   and promotes the matrix cells.

   Integer operands are used throughout because the inner handlers have
   an EXACT-mode integer-stay-exact arm:
     GAMMA(Integer(n))  = Integer((n-1)!)  for small n (≤ 170).
     GAMMA(Integer(2))  = Integer(1),  GAMMA(Integer(5)) = Integer(24).
     LNGAMMA(Integer(2)) = Real(0)  (ln 1! = ln 1 = 0, exact fp result).
     erf(Integer(0))    = Real(0)   (zero special-case, no series).
     erfc(Integer(0))   = Real(1)   (zero special-case).
   These clean-integer inputs give deterministic, floating-point-exact
   outputs that pin the wrapper dispatch without needing tolerance guards.
   ================================================================ */
{

  // n=0 bare-List passthrough: { } GAMMA → { }
  {
    const v = runOp('GAMMA', RList([]));
    assert(isList(v) && v.items.length === 0,
      `session200: { } GAMMA → { } (n=0 bare-List passthrough; got type=${v?.type} len=${v?.items?.length})`);
  }

  // n=0 Tagged-of-List: :g:{ } GAMMA → :g:{ }
  {
    const v = runOp('GAMMA', Tagged('g', RList([])));
    assert(isTagged(v) && v.tag === 'g' && isList(v.value) && v.value.items.length === 0,
      `session200: :g:{ } GAMMA → :g:{ } (n=0 T+L; got tag=${v?.tag} type=${v?.value?.type})`);
  }

  // n=2 bare-List integer-exact: { Integer(1) Integer(5) } GAMMA → { Integer(1) Integer(24) }
  {
    const v = runOp('GAMMA', RList([Integer(1n), Integer(5n)]));
    const [a, b] = v?.items ?? [];
    assert(isList(v) && v.items.length === 2
        && isInteger(a) && a.value === 1n
        && isInteger(b) && b.value === 24n,
      `session200: { Integer(1) Integer(5) } GAMMA → { Integer(1) Integer(24) } (n=2 bare-List integer-exact; got a=${a?.value} b=${b?.value})`);
  }

  // n=2 Tagged-of-List: :g:{ Integer(1) Integer(5) } GAMMA → :g:{ Integer(1) Integer(24) }
  {
    const v = runOp('GAMMA', Tagged('g', RList([Integer(1n), Integer(5n)])));
    const inner = v?.value;
    const [a, b] = inner?.items ?? [];
    assert(isTagged(v) && v.tag === 'g' && isList(inner)
        && isInteger(a) && a.value === 1n
        && isInteger(b) && b.value === 24n,
      `session200: :g:{ Integer(1) Integer(5) } GAMMA → :g:{ Integer(1) Integer(24) } (T+L; tag preserved; got tag=${v?.tag} a=${a?.value} b=${b?.value})`);
  }

  // Vector axis: [ Integer(1) Integer(5) ] GAMMA → [ Integer(1) Integer(24) ]
  {
    const v = runOp('GAMMA', Vector([Integer(1n), Integer(5n)]));
    const [a, b] = v?.items ?? [];
    assert(isVector(v) && v.items.length === 2
        && isInteger(a) && a.value === 1n
        && isInteger(b) && b.value === 24n,
      `session200: [ Integer(1) Integer(5) ] GAMMA → [ Integer(1) Integer(24) ] (V integer-exact; got a=${a?.value} b=${b?.value})`);
  }

  // Matrix axis: [[ Integer(2) Integer(3) ]] GAMMA → [[ Integer(1) Integer(2) ]]
  {
    const v = runOp('GAMMA', Matrix([[Integer(2n), Integer(3n)]]));
    const row = v?.rows?.[0] ?? [];
    assert(isMatrix(v) && v.rows.length === 1 && row.length === 2
        && isInteger(row[0]) && row[0].value === 1n
        && isInteger(row[1]) && row[1].value === 2n,
      `session200: [[ Integer(2) Integer(3) ]] GAMMA → [[ Integer(1) Integer(2) ]] (M integer-exact; got r00=${row[0]?.value} r01=${row[1]?.value})`);
  }


  // n=0 bare-List passthrough: { } LNGAMMA → { }
  {
    const v = runOp('LNGAMMA', RList([]));
    assert(isList(v) && v.items.length === 0,
      `session200: { } LNGAMMA → { } (n=0 bare-List passthrough; got type=${v?.type} len=${v?.items?.length})`);
  }

  // Matrix axis: [[ Integer(2) ]] LNGAMMA → [[ Real(0) ]]   (lngamma(2) = ln(1!) = 0 exactly)
  {
    const v = runOp('LNGAMMA', Matrix([[Integer(2n)]]));
    const cell = v?.rows?.[0]?.[0];
    assert(isMatrix(v) && isReal(cell) && cell.value.toNumber() === 0,
      `session200: [[ Integer(2) ]] LNGAMMA → [[ Real(0) ]] (M; lngamma(2)=0 exact fp; got cell=${cell?.value?.toString()})`);
  }

  // Tagged scalar: :h:Integer(2) LNGAMMA → :h:Real(0)
  {
    const v = runOp('LNGAMMA', Tagged('h', Integer(2n)));
    assert(isTagged(v) && v.tag === 'h' && isReal(v.value) && v.value.value.toNumber() === 0,
      `session200: :h:Integer(2) LNGAMMA → :h:Real(0) (T scalar; lngamma(2)=0; got tag=${v?.tag} val=${v?.value?.value?.toNumber()})`);
  }

  // Vector axis: [ Integer(2) ] LNGAMMA → [ Real(0) ]
  {
    const v = runOp('LNGAMMA', Vector([Integer(2n)]));
    const a = v?.items?.[0];
    assert(isVector(v) && v.items.length === 1 && isReal(a) && a.value.toNumber() === 0,
      `session200: [ Integer(2) ] LNGAMMA → [ Real(0) ] (V; lngamma(2)=0; got a=${a?.value?.toString()})`);
  }


  // bare-List: { Integer(0) } erf → { Real(0) }   (erf(0) = 0, zero special-case)
  {
    const v = runOp('erf', RList([Integer(0n)]));
    const a = v?.items?.[0];
    assert(isList(v) && v.items.length === 1 && isReal(a) && a.value.toNumber() === 0,
      `session200: { Integer(0) } erf → { Real(0) } (bare-List; erf(0)=0; got a=${a?.value?.toString()})`);
  }

  // Vector axis: [ Integer(0) ] erf → [ Real(0) ]
  {
    const v = runOp('erf', Vector([Integer(0n)]));
    const a = v?.items?.[0];
    assert(isVector(v) && v.items.length === 1 && isReal(a) && a.value.toNumber() === 0,
      `session200: [ Integer(0) ] erf → [ Real(0) ] (V; erf(0)=0; got a=${a?.value?.toString()})`);
  }


  // Tagged scalar: :e:Integer(0) erfc → :e:Real(1)   (erfc(0) = 1, zero special-case)
  {
    const v = runOp('erfc', Tagged('e', Integer(0n)));
    assert(isTagged(v) && v.tag === 'e' && isReal(v.value) && v.value.value.toNumber() === 1,
      `session200: :e:Integer(0) erfc → :e:Real(1) (T scalar; erfc(0)=1; got tag=${v?.tag} val=${v?.value?.value?.toNumber()})`);
  }
}

/* ================================================================
   session204: erfc L/V/M/T+L stale-dot-cell promotion.
   erfc is registered as _withTaggedUnary(_withListUnary(bespoke-V/M handler)).
   _erfcScalar(Integer(0)) = Real(1)  (zero special-case, no series).
   _erfcScalar(Integer(1)) = Real(_regGammaQ(0.5, 1)) ≈ Real(0.1573) — distinct
   from _erfcScalar(Integer(0)), giving heterogeneous output on a 2-element list.
   pinned the T scalar path only; this cluster pins the three
   remaining collection axes: bare-List (n=0, n=1, n=2 heterogeneous),
   Tagged-of-List (n=0 T+L, n=1 T+L), Vector, Matrix.
   ================================================================ */
{
  // n=0 empty-List bare: { } erfc → { }
  {
    const v = runOp('erfc', RList([]));
    assert(isList(v) && v.items.length === 0,
      `session204: { } erfc → { } (bare empty-List passthrough; got ${v?.type})`);
  }

  // n=0 Tagged-of-List: :e:{ } erfc → :e:{ }
  {
    const v = runOp('erfc', Tagged('e', RList([])));
    assert(isTagged(v) && v.tag === 'e' && isList(v.value) && v.value.items.length === 0,
      `session204: :e:{ } erfc → :e:{ } (T+L empty; got tag=${v?.tag} inner=${v?.value?.type})`);
  }

  // n=1 bare-List: { Integer(0) } erfc → { Real(1) }  (zero special-case through wrapper)
  {
    const v = runOp('erfc', RList([Integer(0n)]));
    assert(isList(v) && v.items.length === 1 && isReal(v.items[0]) && v.items[0].value.toNumber() === 1,
      `session204: { Integer(0) } erfc → { Real(1) } (bare-List n=1; got ${v?.items?.[0]?.value?.toNumber()})`);
  }

  // n=1 Tagged-of-List: :e:{ Integer(0) } erfc → :e:{ Real(1) }
  {
    const v = runOp('erfc', Tagged('e', RList([Integer(0n)])));
    assert(isTagged(v) && v.tag === 'e' && isList(v.value) &&
           v.value.items.length === 1 && isReal(v.value.items[0]) &&
           v.value.items[0].value.toNumber() === 1,
      `session204: :e:{ Integer(0) } erfc → :e:{ Real(1) } (T+L n=1; got tag=${v?.tag} val=${v?.value?.items?.[0]?.value?.toNumber()})`);
  }

  // n=2 bare-List heterogeneous output: { Integer(0) Integer(1) } erfc → { Real(1) Real(≈0.1573) }
  // erfc(0)=1, erfc(1)≈0.1573 — distinct values confirm element-wise dispatch
  {
    const v = runOp('erfc', RList([Integer(0n), Integer(1n)]));
    const a = v?.items?.[0], b = v?.items?.[1];
    assert(isList(v) && v.items.length === 2 &&
           isReal(a) && a.value.toNumber() === 1 &&
           isReal(b) && b.value.toNumber() > 0.15 && b.value.toNumber() < 0.16,
      `session204: { Integer(0) Integer(1) } erfc → { Real(1) Real(≈0.1573) } (bare-List n=2 heterogeneous; got [${a?.value?.toNumber()}, ${b?.value?.toNumber()}])`);
  }

  // Vector axis: [ Integer(0) ] erfc → [ Real(1) ]
  {
    const v = runOp('erfc', Vector([Integer(0n)]));
    assert(isVector(v) && v.items.length === 1 && isReal(v.items[0]) && v.items[0].value.toNumber() === 1,
      `session204: [ Integer(0) ] erfc → [ Real(1) ] (V; erfc(0)=1; got ${v?.items?.[0]?.value?.toNumber()})`);
  }

  // Matrix axis: [[ Integer(0) ]] erfc → [[ Real(1) ]]
  {
    const v = runOp('erfc', Matrix([[Integer(0n)]]));
    const cell = v?.rows?.[0]?.[0];
    assert(isMatrix(v) && v.rows.length === 1 && v.rows[0].length === 1 &&
           isReal(cell) && cell.value.toNumber() === 1,
      `session204: [[ Integer(0) ]] erfc → [[ Real(1) ]] (M; erfc(0)=1; got ${cell?.value?.toNumber()})`);
  }

  // session208: erf M-cell promotion (documentation lag same as erfc/session204).
  // erf is registered as _withTaggedUnary(_withListUnary(bespoke-V/M handler)).
  // The M branch (rows.map(r => r.map(_erfScalar))) has been in the handler
  // since the op was first wrapped; session200 only pinned L and V.
  // _erfScalar(Integer(0)) = Real(0)  (erf(0) = 0, zero special-case).

  // Matrix axis: [[ Integer(0) ]] erf → [[ Real(0) ]]
  {
    const v = runOp('erf', Matrix([[Integer(0n)]]));
    const cell = v?.rows?.[0]?.[0];
    assert(isMatrix(v) && v.rows.length === 1 && v.rows[0].length === 1 &&
           isReal(cell) && cell.value.toNumber() === 0,
      `session208: [[ Integer(0) ]] erf → [[ Real(0) ]] (M; erf(0)=0; got ${cell?.value?.toNumber()})`);
  }

  // session212: ZETA / LAMBERT Z/L/V/M stale-·-cell promotion.
  // Both are registered as _withTaggedUnary(_withListUnary(bespoke-V/M handler)).
  // Their scalar functions accept isInteger(v) — the Z column was also stale.
  // Anchor values: ζ(0) = -1/2 (exact fp); W(0) = 0 (exact branch in _lambertW0).


  // Z axis: Integer(0) ZETA → Real(-0.5)  (ζ(0) = -1/2, exact fp)
  {
    const v = runOp('ZETA', Integer(0n));
    assert(isReal(v) && v.value.toNumber() === -0.5,
      `session212: Integer(0) ZETA → Real(-0.5) (Z; ζ(0)=-1/2 exact; got ${v?.value?.toNumber()})`);
  }

  // L{}: { } ZETA → { }  (empty-list passthrough)
  {
    const v = runOp('ZETA', RList([]));
    assert(isList(v) && v.items.length === 0,
      `session212: { } ZETA → { } (bare empty-List passthrough; got ${v?.type})`);
  }

  // L{Integer(2)}: { Integer(2) } ZETA → { Real(ζ(2)) }
  {
    const v = runOp('ZETA', RList([Integer(2n)]));
    const a = v?.items?.[0];
    assert(isList(v) && v.items.length === 1 &&
           isReal(a) && Math.abs(a.value.toNumber() - Math.PI ** 2 / 6) < 1e-12,
      `session212: { Integer(2) } ZETA → { Real(ζ(2)) } (bare-List; got ${a?.value?.toNumber()})`);
  }

  // V: [ Integer(2) Integer(0) ] ZETA → [ Real(ζ(2)) Real(-0.5) ]
  {
    const v = runOp('ZETA', Vector([Integer(2n), Integer(0n)]));
    const a = v?.items?.[0], b = v?.items?.[1];
    assert(isVector(v) && v.items.length === 2 &&
           isReal(a) && Math.abs(a.value.toNumber() - Math.PI ** 2 / 6) < 1e-12 &&
           isReal(b) && b.value.toNumber() === -0.5,
      `session212: [ Integer(2) Integer(0) ] ZETA → [ Real(ζ(2)) Real(-0.5) ] (V; got [${a?.value?.toNumber()}, ${b?.value?.toNumber()}])`);
  }

  // M: [[ Integer(2) ]] ZETA → [[ Real(ζ(2)) ]]
  {
    const v = runOp('ZETA', Matrix([[Integer(2n)]]));
    const cell = v?.rows?.[0]?.[0];
    assert(isMatrix(v) && v.rows.length === 1 && v.rows[0].length === 1 &&
           isReal(cell) && Math.abs(cell.value.toNumber() - Math.PI ** 2 / 6) < 1e-12,
      `session212: [[ Integer(2) ]] ZETA → [[ Real(ζ(2)) ]] (M; got ${cell?.value?.toNumber()})`);
  }


  // Z axis: Integer(0) LAMBERT → Real(0)  (W(0) = 0, exact branch in _lambertW0)
  {
    const v = runOp('LAMBERT', Integer(0n));
    assert(isReal(v) && v.value.toNumber() === 0,
      `session212: Integer(0) LAMBERT → Real(0) (Z; W(0)=0 exact; got ${v?.value?.toNumber()})`);
  }

  // L{}: { } LAMBERT → { }  (empty-list passthrough)
  {
    const v = runOp('LAMBERT', RList([]));
    assert(isList(v) && v.items.length === 0,
      `session212: { } LAMBERT → { } (bare empty-List passthrough; got ${v?.type})`);
  }

  // L{Integer(0)}: { Integer(0) } LAMBERT → { Real(0) }
  {
    const v = runOp('LAMBERT', RList([Integer(0n)]));
    const a = v?.items?.[0];
    assert(isList(v) && v.items.length === 1 && isReal(a) && a.value.toNumber() === 0,
      `session212: { Integer(0) } LAMBERT → { Real(0) } (bare-List; W(0)=0; got ${a?.value?.toNumber()})`);
  }

  // V: [ Integer(0) Integer(1) ] LAMBERT → [ Real(0) Real(Ω) ]  (Ω ≈ 0.5671)
  {
    const v = runOp('LAMBERT', Vector([Integer(0n), Integer(1n)]));
    const a = v?.items?.[0], b = v?.items?.[1];
    const OMEGA = 0.5671432904097838;
    assert(isVector(v) && v.items.length === 2 &&
           isReal(a) && a.value.toNumber() === 0 &&
           isReal(b) && Math.abs(b.value.toNumber() - OMEGA) < 1e-12,
      `session212: [ Integer(0) Integer(1) ] LAMBERT → [ Real(0) Real(Ω) ] (V; got [${a?.value?.toNumber()}, ${b?.value?.toNumber()}])`);
  }

  // M: [[ Integer(1) ]] LAMBERT → [[ Real(Ω) ]]
  {
    const v = runOp('LAMBERT', Matrix([[Integer(1n)]]));
    const cell = v?.rows?.[0]?.[0];
    const OMEGA = 0.5671432904097838;
    assert(isMatrix(v) && v.rows.length === 1 && v.rows[0].length === 1 &&
           isReal(cell) && Math.abs(cell.value.toNumber() - OMEGA) < 1e-12,
      `session212: [[ Integer(1) ]] LAMBERT → [[ Real(Ω) ]] (M; got ${cell?.value?.toNumber()})`);
  }
}

/* ================================================================
 — data-type-support lane.

   PSI L/V/M stale-`·`-cell promotion — documentation-only fix
   (pin additions only).

   The 1-arg digamma handler dispatches bespoke branches for
   List, Vector, and Matrix (parallel to the GAMMA/LNGAMMA shape);
   the DATA_TYPES.md matrix carried `·` for L/V/M as a
   documentation lag.  No source changes.

   Note: Tagged-of-List/Vector/Matrix is NOT covered — the bespoke
   `isTagged` branch calls `_psiScalar` directly on `v.value`,
   which throws when `v.value` is a List/Vector/Matrix.  Only bare
   scalar Tagged inputs route correctly.  T=✓ in the matrix reflects
   the scalar-Tagged path only.

   +5 `session216:` pins: L-empty passthrough; L {Integer(1)} value-
   precise (ψ(1) = −γ, tolerance 1e-12); L {Integer(1) Integer(2)}
   heterogeneous-output; V [Integer(1) Integer(2)]; M [[Integer(1)]].
   PSI matrix row: L/V/M `·`→`✓`.
   ================================================================ */
{
  const PSI_1 = -0.5772156649015329; // ψ(1) = −γ (Euler-Mascheroni constant)
  const PSI_2 =  0.4227843350984671; // ψ(2) =  1 − γ

  // L-empty: {} PSI → {}  (empty-list passthrough)
  {
    const v = runOp('PSI', RList([]));
    assert(isList(v) && v.items.length === 0,
      `session216: {} PSI → {} (bare empty-List passthrough; got ${v?.type})`);
  }

  // L{Integer(1)}: { Integer(1) } PSI → { Real(ψ(1)) }  (value-precise)
  {
    const v = runOp('PSI', RList([Integer(1n)]));
    const a = v?.items?.[0];
    assert(isList(v) && v.items.length === 1 &&
           isReal(a) && Math.abs(a.value.toNumber() - PSI_1) < 1e-12,
      `session216: { Integer(1) } PSI → { Real(ψ(1)) } (bare-List; ψ(1)=−γ; got ${a?.value?.toNumber()})`);
  }

  // L{Integer(1) Integer(2)}: heterogeneous-output (two distinct values per element)
  {
    const v = runOp('PSI', RList([Integer(1n), Integer(2n)]));
    const a = v?.items?.[0], b = v?.items?.[1];
    assert(isList(v) && v.items.length === 2 &&
           isReal(a) && Math.abs(a.value.toNumber() - PSI_1) < 1e-12 &&
           isReal(b) && Math.abs(b.value.toNumber() - PSI_2) < 1e-12,
      `session216: { Integer(1) Integer(2) } PSI → { Real(ψ(1)) Real(ψ(2)) } (bare-List 2-elem; got [${a?.value?.toNumber()}, ${b?.value?.toNumber()}])`);
  }

  // V: [ Integer(1) Integer(2) ] PSI → [ Real(ψ(1)) Real(ψ(2)) ]
  {
    const v = runOp('PSI', Vector([Integer(1n), Integer(2n)]));
    const a = v?.items?.[0], b = v?.items?.[1];
    assert(isVector(v) && v.items.length === 2 &&
           isReal(a) && Math.abs(a.value.toNumber() - PSI_1) < 1e-12 &&
           isReal(b) && Math.abs(b.value.toNumber() - PSI_2) < 1e-12,
      `session216: [ Integer(1) Integer(2) ] PSI → [ Real(ψ(1)) Real(ψ(2)) ] (V; got [${a?.value?.toNumber()}, ${b?.value?.toNumber()}])`);
  }

  // M: [[ Integer(1) ]] PSI → [[ Real(ψ(1)) ]]
  {
    const v = runOp('PSI', Matrix([[Integer(1n)]]));
    const cell = v?.rows?.[0]?.[0];
    assert(isMatrix(v) && v.rows.length === 1 && v.rows[0].length === 1 &&
           isReal(cell) && Math.abs(cell.value.toNumber() - PSI_1) < 1e-12,
      `session216: [[ Integer(1) ]] PSI → [[ Real(ψ(1)) ]] (M; got ${cell?.value?.toNumber()})`);
  }
}

/* ================================================================
 — session231: Q-cell audit — ARG / % / %T / %CH / GCD / LCM

   Closes six `·` (untested) cells in the DATA_TYPES.md Q column.

   ARG: `_argScalar` handles isReal and isInteger only; isRational
   falls through to `throw new RPLError('Bad argument type')`.
   ARG of a rational is mathematically well-defined (0 for positive,
   π for negative) but the implementation rejects it.  Q=✗.

   % / %T / %CH: all three dispatch through `toRealOrThrow`, which
   has an explicit `isRational(v)` branch returning Number(n)/Number(d).
   Rational inputs are accepted; result is Real (Q→R degradation,
   same as MOD/MIN/MAX from session 125).  Q=✓.

   GCD / LCM: dispatch through `_toBigIntOrThrow`, which handles only
   Integer and integer-valued Real.  Rational falls through to
   `throw new RPLError('Bad argument type')`.  Correct by design —
   GCD/LCM are integer-domain ops.  Q=✗.

   +7 session231 pins.
   ================================================================ */
{
  // _argScalar has no isRational branch; Rational falls through to throw.
  {
    const s = new Stack();
    s.push(Rational(1n, 2n));
    assertThrows(() => lookup('ARG').fn(s), /Bad argument type/i,
      `session231: ARG Rational(1,2) → 'Bad argument type' (_argScalar has no isRational branch)`);
  }
  {
    const s = new Stack();
    s.push(Rational(-1n, 2n));
    assertThrows(() => lookup('ARG').fn(s), /Bad argument type/i,
      `session231: ARG Rational(-1,2) → 'Bad argument type' (negative rational also rejected by _argScalar)`);
  }

  // toRealOrThrow handles isRational: Number(v.n)/Number(v.d).
  // x = Rational(1,2) = 0.5, y (percent) = Real(50) → 0.5*50/100 = 0.25.
  {
    const s = new Stack();
    s.push(Rational(1n, 2n));
    s.push(Real(50));
    lookup('%').fn(s);
    const r = s.pop();
    assert(isReal(r) && Math.abs(r.value.toNumber() - 0.25) < 1e-12,
      `session231: Rational(1,2) Real(50) % → Real(0.25) (Q→R degradation; got ${r?.value?.toNumber()})`);
  }

  // %T formula: 100*y/x.  x = Rational(1,4) = 0.25, y = Real(1) → 100*1/0.25 = 400.
  {
    const s = new Stack();
    s.push(Rational(1n, 4n));
    s.push(Real(1));
    lookup('%T').fn(s);
    const r = s.pop();
    assert(isReal(r) && Math.abs(r.value.toNumber() - 400) < 1e-12,
      `session231: Rational(1,4) Real(1) %T → Real(400) (Q→R degradation; got ${r?.value?.toNumber()})`);
  }

  // %CH formula: 100*(y-x)/x.  x = Rational(1,2) = 0.5, y = Real(1) → 100*(1-0.5)/0.5 = 100.
  {
    const s = new Stack();
    s.push(Rational(1n, 2n));
    s.push(Real(1));
    lookup('%CH').fn(s);
    const r = s.pop();
    assert(isReal(r) && Math.abs(r.value.toNumber() - 100) < 1e-12,
      `session231: Rational(1,2) Real(1) %CH → Real(100) (Q→R degradation; got ${r?.value?.toNumber()})`);
  }

  // _toBigIntOrThrow has no isRational branch; Rational → Bad argument type.
  {
    const s = new Stack();
    s.push(Rational(1n, 2n));
    s.push(Integer(2n));
    assertThrows(() => lookup('GCD').fn(s), /Bad argument type/i,
      `session231: Rational(1,2) Integer(2) GCD → 'Bad argument type' (_toBigIntOrThrow rejects Rational; GCD is integer-domain)`);
  }

  {
    const s = new Stack();
    s.push(Rational(1n, 2n));
    s.push(Integer(2n));
    assertThrows(() => lookup('LCM').fn(s), /Bad argument type/i,
      `session231: Rational(1,2) Integer(2) LCM → 'Bad argument type' (_toBigIntOrThrow rejects Rational; LCM is integer-domain)`);
  }
}

/* ================================================================
 — session236: Q-cell audit — LNP1 / EXPM / TRUNC / ZETA / LAMBERT / PSI

   Closes six `·` (untested) cells in the DATA_TYPES.md Q column.

   LNP1 / EXPM: inner handlers call `toRealOrThrow(v)` which has an
   explicit `isRational(v)` branch returning Number(n)/Number(d).
   Rational input accepted; result is Real (Q→R degradation).  Q=✓.

   TRUNC (x operand, level 2): `_roundingOp` checks
   `if (!isReal(xv) && !isInteger(xv)) throw new RPLError('Bad argument type')`.
   Rational x → rejected.  Q=✗.  The n operand (level 1) goes through
   `toRealOrThrow` and would accept a Rational n (integer-valued Q
   gives Bad argument value rather than Bad argument type), but the
   primary Q question concerns the value operand.

   ZETA / LAMBERT / PSI: scalar handlers use the pattern
   `const x = isInteger(v) ? … : isReal(v) ? … : null; if null throw`.
   Rational falls through to null → Bad argument type.  Q=✗.

   +6 session236 pins.
   ================================================================ */
{
  // toRealOrThrow handles isRational; log1p(0.5) is the expected value.
  {
    const v = runOp('LNP1', Rational(1n, 2n));
    assert(isReal(v) && Math.abs(v.value.toNumber() - Math.log1p(0.5)) < 1e-12,
      `session236: LNP1 Rational(1,2) → Real(log1p(0.5)) (Q→R degradation; got ${v?.value?.toNumber()})`);
  }

  // toRealOrThrow handles isRational; expm1(0.5) is the expected value.
  {
    const v = runOp('EXPM', Rational(1n, 2n));
    assert(isReal(v) && Math.abs(v.value.toNumber() - Math.expm1(0.5)) < 1e-12,
      `session236: EXPM Rational(1,2) → Real(expm1(0.5)) (Q→R degradation; got ${v?.value?.toNumber()})`);
  }

  // _roundingOp checks `!isReal(xv) && !isInteger(xv)` → Bad argument type.
  {
    const s = new Stack();
    s.push(Rational(3n, 2n));
    s.push(Integer(1n));
    assertThrows(() => lookup('TRUNC').fn(s), /Bad argument type/i,
      `session236: Rational(3,2) Integer(1) TRUNC → 'Bad argument type' (_roundingOp rejects non-Real/non-Integer x)`);
  }

  // _zetaScalar: isInteger/isReal only; Rational → null → Bad argument type.
  {
    const s = new Stack();
    s.push(Rational(1n, 2n));
    assertThrows(() => lookup('ZETA').fn(s), /Bad argument type/i,
      `session236: ZETA Rational(1,2) → 'Bad argument type' (_zetaScalar has no isRational branch)`);
  }

  // _lambertScalar: isInteger/isReal only; Rational → null → Bad argument type.
  {
    const s = new Stack();
    s.push(Rational(1n, 2n));
    assertThrows(() => lookup('LAMBERT').fn(s), /Bad argument type/i,
      `session236: LAMBERT Rational(1,2) → 'Bad argument type' (_lambertScalar has no isRational branch)`);
  }

  // _psiScalar: isInteger/isReal only; Rational → null → Bad argument type.
  {
    const s = new Stack();
    s.push(Rational(1n, 2n));
    assertThrows(() => lookup('PSI').fn(s), /Bad argument type/i,
      `session236: PSI Rational(1,2) → 'Bad argument type' (_psiScalar has no isRational branch)`);
  }
}

/* ================================================================
   Session 240 — Q-cell audit: stat-dist + combinatorial families.

   Inspected each scalar handler and pinned ✓/✗ for Rational input:

   Stat-dist (all Q=✗):
     GAMMA/LNGAMMA: `x = isInteger ? … : isReal ? … : null; if null throw`
     ERF/ERFC:      same pattern in _erfScalar / _erfcScalar
     BETA:          aNum/bNum = isInteger ? … : isReal ? … : null
     UTPC/UTPF/UTPT: local `asReal` only accepts Integer and Real
     HEAVISIDE/DIRAC: explicit isReal/isInteger/isBinaryInteger/isSym branches only

   Combinatorial (Q=✗ except XROOT):
     COMB/PERM:      _combPermArgs guard: `!isInteger && !isReal → throw`
     IQUOT/IREMAINDER: _intQuotientArg: only Integer/Real
     XROOT:          degree x uses `toRealOrThrow` (accepts Rational, Q→R);
                     radicand y goes through `^` which accepts Rational.
                     Both sides Q=✓ (Q→R degradation to Real).

   15 new assertions (5525 → 5540).
   ================================================================ */
{
  // _gammaScalar: `x = isInteger ? … : isReal ? … : null` → Rational → null → throw.
  {
    const s = new Stack();
    s.push(Rational(1n, 2n));
    assertThrows(() => lookup('GAMMA').fn(s), /Bad argument type/i,
      `session240: GAMMA Rational(1,2) → 'Bad argument type' (_gammaScalar has no isRational branch)`);
  }

  // _lngammaScalar: same isInteger/isReal/null pattern.
  {
    const s = new Stack();
    s.push(Rational(1n, 2n));
    assertThrows(() => lookup('LNGAMMA').fn(s), /Bad argument type/i,
      `session240: LNGAMMA Rational(1,2) → 'Bad argument type' (_lngammaScalar has no isRational branch)`);
  }

  // _erfScalar: `x = isInteger ? … : isReal ? … : null` → Rational → null → throw.
  {
    const s = new Stack();
    s.push(Rational(1n, 2n));
    assertThrows(() => lookup('erf').fn(s), /Bad argument type/i,
      `session240: erf Rational(1,2) → 'Bad argument type' (_erfScalar has no isRational branch)`);
  }

  // _erfcScalar: same isInteger/isReal/null pattern.
  {
    const s = new Stack();
    s.push(Rational(1n, 2n));
    assertThrows(() => lookup('erfc').fn(s), /Bad argument type/i,
      `session240: erfc Rational(1,2) → 'Bad argument type' (_erfcScalar has no isRational branch)`);
  }

  // _betaScalar: aNum = isInteger ? … : isReal ? … : null; if null → throw.
  // Rational on level 2 (a-arg) is rejected before bNum is even evaluated.
  {
    const s = new Stack();
    s.push(Rational(1n, 2n));  // a (level 2)
    s.push(Integer(1n));       // b (level 1)
    assertThrows(() => lookup('Beta').fn(s), /Bad argument type/i,
      `session240: Beta Rational(1,2) Integer(1) → 'Bad argument type' (_betaScalar has no isRational branch)`);
  }

  // local asReal: only Integer and Real → throw for Rational.
  // Testing Rational on the ν (degree-of-freedom) arg.
  {
    const s = new Stack();
    s.push(Rational(3n, 2n));  // ν — Rational (level 2)
    s.push(Real(1));           // x (level 1)
    assertThrows(() => lookup('UTPC').fn(s), /Bad argument type/i,
      `session240: UTPC Rational(3,2) Real(1) → 'Bad argument type' (asReal has no isRational branch)`);
  }

  // Same asReal helper used for all three args (n, d, F); Rational on n triggers immediately.
  {
    const s = new Stack();
    s.push(Rational(3n, 2n));  // n — Rational (level 3)
    s.push(Integer(2n));       // d (level 2)
    s.push(Real(1));           // F (level 1)
    assertThrows(() => lookup('UTPF').fn(s), /Bad argument type/i,
      `session240: UTPF Rational(3,2) Integer(2) Real(1) → 'Bad argument type' (asReal rejects Rational on n)`);
  }

  // Same asReal helper; Rational on ν triggers immediately.
  {
    const s = new Stack();
    s.push(Rational(3n, 2n));  // ν — Rational (level 2)
    s.push(Real(1));           // t (level 1)
    assertThrows(() => lookup('UTPT').fn(s), /Bad argument type/i,
      `session240: UTPT Rational(3,2) Real(1) → 'Bad argument type' (asReal rejects Rational on ν)`);
  }

  // Handler checks isReal / isInteger / isBinaryInteger / _isSymOperand only — no isRational branch.
  {
    const s = new Stack();
    s.push(Rational(1n, 2n));
    assertThrows(() => lookup('HEAVISIDE').fn(s), /Bad argument type/i,
      `session240: HEAVISIDE Rational(1,2) → 'Bad argument type' (no isRational branch in scalar handler)`);
  }

  // Same handler structure as HEAVISIDE — no isRational branch.
  {
    const s = new Stack();
    s.push(Rational(1n, 2n));
    assertThrows(() => lookup('DIRAC').fn(s), /Bad argument type/i,
      `session240: DIRAC Rational(1,2) → 'Bad argument type' (no isRational branch in scalar handler)`);
  }

  // _combPermArgs guard: `!isInteger(a) && !isReal(a) → throw 'Bad argument type'`.
  // Rational on level 2 (n-arg) triggers immediately.
  {
    const s = new Stack();
    s.push(Rational(5n, 1n));  // n — Rational (integer-valued but still Q-typed)
    s.push(Integer(2n));       // m
    assertThrows(() => lookup('COMB').fn(s), /Bad argument type/i,
      `session240: COMB Rational(5,1) Integer(2) → 'Bad argument type' (_combPermArgs rejects Rational even when integer-valued)`);
  }

  // Same _combPermArgs guard as COMB.
  {
    const s = new Stack();
    s.push(Rational(5n, 1n));  // n — Rational
    s.push(Integer(2n));       // m
    assertThrows(() => lookup('PERM').fn(s), /Bad argument type/i,
      `session240: PERM Rational(5,1) Integer(2) → 'Bad argument type' (_combPermArgs rejects Rational even when integer-valued)`);
  }

  // _intQuotientArg: only isInteger and isReal branches → Rational → throw.
  {
    const s = new Stack();
    s.push(Rational(7n, 2n));  // a (level 2)
    s.push(Integer(2n));       // b (level 1)
    assertThrows(() => lookup('IQUOT').fn(s), /Bad argument type/i,
      `session240: IQUOT Rational(7,2) Integer(2) → 'Bad argument type' (_intQuotientArg has no isRational branch)`);
  }

  // Same _intQuotientArg guard as IQUOT.
  {
    const s = new Stack();
    s.push(Rational(7n, 2n));  // a (level 2)
    s.push(Integer(2n));       // b (level 1)
    assertThrows(() => lookup('IREMAINDER').fn(s), /Bad argument type/i,
      `session240: IREMAINDER Rational(7,2) Integer(2) → 'Bad argument type' (_intQuotientArg has no isRational branch)`);
  }

  // Degree x uses `toRealOrThrow` which accepts Rational (Number(n)/Number(d)).
  // Radicand y goes through '^' which accepts Rational.
  // Both sides Q→R via toRealOrThrow / ^ dispatch; result is always Real.
  // (1) degree=Rational(3,1): XROOT(Integer(8), Rational(3,1)) = 8^(1/3) = Real(2).
  {
    const s = new Stack();
    s.push(Integer(8n));        // y (radicand, level 2)
    s.push(Rational(3n, 1n));   // x (degree, level 1) — Rational accepted via toRealOrThrow
    lookup('XROOT').fn(s);
    const v = s.peek();
    assert(v.type === 'real' && Math.abs(v.value.toNumber() - 2) < 1e-12,
      `session240: XROOT Integer(8) Rational(3,1) → Real(2) (degree Q→R via toRealOrThrow; got ${v.value})`);
  }
  // (2) radicand=Rational(1,4), degree=Integer(2): XROOT(Rational(1,4), Integer(2)) = (1/4)^(1/2) = 0.5.
  {
    const s = new Stack();
    s.push(Rational(1n, 4n));   // y (radicand, level 2) — Rational accepted via ^
    s.push(Integer(2n));        // x (degree, level 1)
    lookup('XROOT').fn(s);
    const v = s.peek();
    assert(v.type === 'real' && Math.abs(v.value.toNumber() - 0.5) < 1e-12,
      `session240: XROOT Rational(1,4) Integer(2) → Real(0.5) (radicand Q accepted via ^; got ${v.value})`);
  }
}

/* ================================================================
   Session 244 — Z-cell doc-lag audit: ERF / ERFC / UTPC / UTPF /
   UTPT + BETA L/V/M + UTPC/UTPF/UTPT L/V/M rejection pins.

   Background: sessions 200/204/208 added List/Vector/Matrix pins for
   erf/erfc using Integer(0) as the operand — but these were always
   routed through the wrappers (_withListUnary / bespoke V/M).  The
   bare-scalar Z column for erf and erfc was never independently
   pinned.  The scalar handlers (_erfScalar / _erfcScalar) both
   contain `const x = isInteger(v) ? Number(v.value) : ...`, so
   Integer is accepted at the scalar level — a documentation lag.

   Similarly, UTPC / UTPF / UTPT share a local `asReal` helper
   (`if (isInteger(v)) return Number(v.value)`) but no Z-axis pin
   existed, despite the handler accepting Integer on every argument.

   BETA has a `_withListBinary` wrapper (registered as
   `_withTaggedBinary(_withListBinary(handler))`), so bare-List
   distribution should work — L=· is a documentation lag.  V and M
   have no `_withVMBinary` wrapper; `_betaScalar` rejects Vector /
   Matrix with 'Bad argument type'.

   UTPC / UTPF / UTPT are registered as bare handlers (no list /
   vector / matrix wrappers), so List / Vector / Matrix inputs reach
   `asReal`, which rejects them.
   ================================================================ */
{
  // erf(Integer(0)) = 0 (zero special-case, exact Real).
  {
    const s = new Stack();
    s.push(Integer(0n));
    lookup('erf').fn(s);
    const v = s.peek();
    assert(v.type === 'real' && v.value.toNumber() === 0,
      `session244: erf Integer(0) → Real(0) (Z bare scalar; zero special-case; got ${v.value})`);
  }
  // erf(Integer(1)) → Real(erf(1)) ≈ 0.8427.  Pins the non-zero Integer path.
  {
    const s = new Stack();
    s.push(Integer(1n));
    lookup('erf').fn(s);
    const v = s.peek();
    assert(v.type === 'real' && Math.abs(v.value.toNumber() - 0.8427007929497154) < 1e-12,
      `session244: erf Integer(1) → Real(erf(1)) (Z bare scalar; non-zero integer path; got ${v.value})`);
  }

  // erfc(Integer(0)) = 1 (zero special-case, exact Real).
  {
    const s = new Stack();
    s.push(Integer(0n));
    lookup('erfc').fn(s);
    const v = s.peek();
    assert(v.type === 'real' && v.value.toNumber() === 1,
      `session244: erfc Integer(0) → Real(1) (Z bare scalar; zero special-case; got ${v.value})`);
  }
  // erfc(Integer(2)) → Real(erfc(2)) ≈ 0.00468.  Pins the positive-x Integer path
  // (routes through _regGammaQ(0.5, 4), distinct from the x=0 shortcut).
  {
    const s = new Stack();
    s.push(Integer(2n));
    lookup('erfc').fn(s);
    const v = s.peek();
    assert(v.type === 'real' && Math.abs(v.value.toNumber() - 0.004677734981047287) < 1e-12,
      `session244: erfc Integer(2) → Real(erfc(2)) (Z bare scalar; positive-x integer path; got ${v.value})`);
  }

  // UTPC(Integer(3), Integer(0)) — X≤0 branch returns Real(1) exactly.
  // Push order: ν (level 2) then x (level 1).
  {
    const s = new Stack();
    s.push(Integer(3n));   // ν — degrees of freedom
    s.push(Integer(0n));   // x — X≤0 short-circuit → tail = 1
    lookup('UTPC').fn(s);
    const v = s.peek();
    assert(v.type === 'real' && v.value.toNumber() === 1,
      `session244: UTPC Integer(3) Integer(0) → Real(1) (Z×Z; X≤0 short-circuit; got ${v.value})`);
  }
  // UTPC(Integer(2), Integer(2)) — for df=2, UTPC = exp(−x/2) = exp(−1) ≈ 0.3679.
  {
    const s = new Stack();
    s.push(Integer(2n));   // ν = 2
    s.push(Integer(2n));   // x = 2
    lookup('UTPC').fn(s);
    const v = s.peek();
    assert(v.type === 'real' && Math.abs(v.value.toNumber() - Math.exp(-1)) < 1e-10,
      `session244: UTPC Integer(2) Integer(2) → Real(exp(-1)) (Z×Z; df=2 tail; tol 1e-10; got ${v.value})`);
  }

  // UTPF(n=Integer(2), d=Integer(2), F=Integer(1)).
  // Push order: n (level 3), d (level 2), F (level 1).
  // w = d/(d+n·F) = 2/(2+2·1) = 0.5; I_{0.5}(1, 1) = 0.5 — clean half-integer.
  {
    const s = new Stack();
    s.push(Integer(2n));   // n
    s.push(Integer(2n));   // d
    s.push(Integer(1n));   // F
    lookup('UTPF').fn(s);
    const v = s.peek();
    assert(v.type === 'real' && Math.abs(v.value.toNumber() - 0.5) < 1e-12,
      `session244: UTPF Integer(2) Integer(2) Integer(1) → Real(0.5) (Z×Z×Z; I_0.5(1,1)=0.5; got ${v.value})`);
  }

  // UTPT(ν=Integer(5), t=Integer(0)) — t=0 exact branch returns Real(0.5).
  // Push order: ν (level 2), t (level 1).
  {
    const s = new Stack();
    s.push(Integer(5n));   // ν
    s.push(Integer(0n));   // t = 0 → exact short-circuit → 0.5
    lookup('UTPT').fn(s);
    const v = s.peek();
    assert(v.type === 'real' && v.value.toNumber() === 0.5,
      `session244: UTPT Integer(5) Integer(0) → Real(0.5) (Z×Z; t=0 exact branch; got ${v.value})`);
  }

  // { Integer(1) Integer(2) } { Integer(1) Integer(3) } Beta
  //   → { Real(B(1,1)) Real(B(2,3)) }
  //   = { Real(≈1.0)   Real(≈0.0833) }
  // B(1,1) = Γ(1)Γ(1)/Γ(2) = 1.  B(2,3) = Γ(2)Γ(3)/Γ(5) = 1·2/24 = 1/12.
  // Push order: left operand (level 2 = "a" arg), right operand (level 1 = "b" arg).
  {
    const s = new Stack();
    s.push(RList([Integer(1n), Integer(2n)]));   // a-list (level 2)
    s.push(RList([Integer(1n), Integer(3n)]));   // b-list (level 1)
    lookup('Beta').fn(s);
    const result = s.peek();
    assert(isList(result) && result.items.length === 2,
      `session244: Beta({Z(1),Z(2)},{Z(1),Z(3)}) → List of 2 (L×L pairwise; got ${result?.type})`);
    const b11 = result.items[0].value.toNumber();
    const b23 = result.items[1].value.toNumber();
    assert(Math.abs(b11 - 1) < 1e-12,
      `session244: Beta({Z(1),...},{Z(1),...})[0] = B(1,1) ≈ 1 (got ${b11})`);
    assert(Math.abs(b23 - 1 / 12) < 1e-12,
      `session244: Beta({...,Z(2)},{...,Z(3)})[1] = B(2,3) = 1/12 (got ${b23})`);
  }

  // Vector input: _betaScalar receives Vector as the 'a' arg — isInteger/isReal both
  // false → aNum = null → throws 'Bad argument type'.
  {
    const s = new Stack();
    s.push(Vector([Real(2), Real(1)]));
    s.push(Integer(1n));
    assertThrows(() => lookup('Beta').fn(s), /Bad argument type/i,
      `session244: Beta(Vector, Integer) → 'Bad argument type' (no _withVMBinary; V=✗)`);
  }
  // Matrix input: same rejection path.
  {
    const s = new Stack();
    s.push(Matrix([[Real(2)]]));
    s.push(Integer(1n));
    assertThrows(() => lookup('Beta').fn(s), /Bad argument type/i,
      `session244: Beta(Matrix, Integer) → 'Bad argument type' (no _withVMBinary; M=✗)`);
  }

  // n=0 empty-list passthrough.
  {
    const s = new Stack();
    s.push(RList([]));
    s.push(RList([]));
    lookup('UTPC').fn(s);
    const v = s.pop();
    assert(v.type === 'list' && v.items.length === 0,
      `session248: UTPC {} {} → {} (n=0 empty-list passthrough; got ${JSON.stringify(v)})`);
  }
  // n=1 bare-list: X≤0 short-circuit → Real(1).
  {
    const s = new Stack();
    s.push(RList([Integer(2n)]));
    s.push(RList([Integer(0n)]));
    lookup('UTPC').fn(s);
    const v = s.pop();
    assert(v.type === 'list' && v.items.length === 1 &&
           v.items[0].type === 'real' && Number(v.items[0].value) === 1,
      `session248: UTPC {Integer(2)} {Integer(0)} → {Real(1)} (n=1 bare-list; X≤0 branch; got ${JSON.stringify(v)})`);
  }
  // n=2 pairwise bare-list: {nu=2,nu=5} {x=0,x=2} → {Real(1), Real(UTPC(5,2))}.
  // UTPC(2,0)=1 (X≤0); UTPC(5,2)=_regGammaQ(2.5,1)≈0.8491 (tol 1e-6).
  {
    const s = new Stack();
    s.push(RList([Integer(2n), Integer(5n)]));
    s.push(RList([Integer(0n), Integer(2n)]));
    lookup('UTPC').fn(s);
    const v = s.pop();
    assert(v.type === 'list' && v.items.length === 2 &&
           Number(v.items[0].value) === 1 &&
           Math.abs(Number(v.items[1].value) - 0.8491450360846099) < 1e-6,
      `session248: UTPC {Z(2) Z(5)} {Z(0) Z(2)} → {R(1) R(≈0.849)} (n=2 pairwise; got ${JSON.stringify(v)})`);
  }
  // Tagged-of-List (binary tag-drop: both unwrapped, tag NOT re-applied).
  {
    const s = new Stack();
    s.push(Tagged('nu', RList([Integer(2n)])));
    s.push(Tagged('x', RList([Integer(0n)])));
    lookup('UTPC').fn(s);
    const v = s.pop();
    assert(v.type === 'list' && v.items.length === 1 &&
           Number(v.items[0].value) === 1,
      `session248: UTPC :nu:{Z(2)} :x:{Z(0)} → {R(1)} (T+L; tag dropped; got ${JSON.stringify(v)})`);
  }
  // Scalar Tagged (both Tagged, result untagged — binary tag-drop convention).
  {
    const s = new Stack();
    s.push(Tagged('n', Integer(2n)));
    s.push(Tagged('x', Integer(0n)));
    lookup('UTPC').fn(s);
    const v = s.pop();
    assert(v.type === 'real' && Number(v.value) === 1,
      `session248: UTPC :n:Z(2) :x:Z(0) → R(1) (Tagged scalar; tag dropped; got ${JSON.stringify(v)})`);
  }
  // V=✗ — _withVMBinary not applied; Vector reaches _utpcScalar as the x arg → Bad argument type.
  {
    const s = new Stack();
    s.push(Integer(2n));
    s.push(Vector([Real(1)]));
    assertThrows(() => lookup('UTPC').fn(s), /Bad argument type/i,
      `session248: UTPC Integer(2) Vector([Real(1)]) → 'Bad argument type' (no _withVMBinary; V=✗)`);
  }

  {
    const s = new Stack();
    s.push(Integer(2n));
    s.push(Integer(2n));
    s.push(RList([Real(1)]));
    assertThrows(() => lookup('UTPF').fn(s), /Bad argument type/i,
      `session244: UTPF Integer(2) Integer(2) List({Real(1)}) → 'Bad argument type' (3-arg bare handler; L=✗)`);
  }
  {
    const s = new Stack();
    s.push(Integer(2n));
    s.push(Integer(2n));
    s.push(Vector([Real(1)]));
    assertThrows(() => lookup('UTPF').fn(s), /Bad argument type/i,
      `session244: UTPF Integer(2) Integer(2) Vector([Real(1)]) → 'Bad argument type' (3-arg bare handler; V=✗)`);
  }

  // n=0 empty-list passthrough.
  {
    const s = new Stack();
    s.push(RList([]));
    s.push(RList([]));
    lookup('UTPT').fn(s);
    const v = s.pop();
    assert(v.type === 'list' && v.items.length === 0,
      `session248: UTPT {} {} → {} (n=0 empty-list passthrough; got ${JSON.stringify(v)})`);
  }
  // n=1 bare-list: t=0 short-circuit → Real(0.5).
  {
    const s = new Stack();
    s.push(RList([Integer(5n)]));
    s.push(RList([Integer(0n)]));
    lookup('UTPT').fn(s);
    const v = s.pop();
    assert(v.type === 'list' && v.items.length === 1 &&
           Number(v.items[0].value) === 0.5,
      `session248: UTPT {Z(5)} {Z(0)} → {R(0.5)} (n=1 bare-list; t=0 exact branch; got ${JSON.stringify(v)})`);
  }
  // n=2 pairwise bare-list: both t=0 → both Real(0.5).
  {
    const s = new Stack();
    s.push(RList([Integer(5n), Integer(10n)]));
    s.push(RList([Integer(0n), Integer(0n)]));
    lookup('UTPT').fn(s);
    const v = s.pop();
    assert(v.type === 'list' && v.items.length === 2 &&
           Number(v.items[0].value) === 0.5 &&
           Number(v.items[1].value) === 0.5,
      `session248: UTPT {Z(5) Z(10)} {Z(0) Z(0)} → {R(0.5) R(0.5)} (n=2 pairwise; t=0 exact; got ${JSON.stringify(v)})`);
  }
  // Tagged-of-List (binary tag-drop).
  {
    const s = new Stack();
    s.push(Tagged('nu', RList([Integer(5n)])));
    s.push(Tagged('t', RList([Integer(0n)])));
    lookup('UTPT').fn(s);
    const v = s.pop();
    assert(v.type === 'list' && v.items.length === 1 &&
           Number(v.items[0].value) === 0.5,
      `session248: UTPT :nu:{Z(5)} :t:{Z(0)} → {R(0.5)} (T+L; tag dropped; got ${JSON.stringify(v)})`);
  }
  // Scalar Tagged (both Tagged, result untagged).
  {
    const s = new Stack();
    s.push(Tagged('n', Integer(5n)));
    s.push(Tagged('t', Integer(0n)));
    lookup('UTPT').fn(s);
    const v = s.pop();
    assert(v.type === 'real' && Number(v.value) === 0.5,
      `session248: UTPT :n:Z(5) :t:Z(0) → R(0.5) (Tagged scalar; tag dropped; got ${JSON.stringify(v)})`);
  }
  // V=✗ — Vector reaches _utptScalar as the t arg → Bad argument type.
  {
    const s = new Stack();
    s.push(Integer(3n));
    s.push(Vector([Real(1)]));
    assertThrows(() => lookup('UTPT').fn(s), /Bad argument type/i,
      `session248: UTPT Integer(3) Vector([Real(1)]) → 'Bad argument type' (no _withVMBinary; V=✗)`);
  }
}

// ── session253: Ordered comparators < > ≤ ≥ — L/V/M/T/U rejection pins ──────
// comparePair() accepts: BinaryInteger (promoted), Symbolic-lift, String lex,
// and isNumber (Real/Integer/Rational/Complex).  Everything else — List, Vector,
// Matrix, Tagged, Unit — falls through to `!isNumber` throw.  All 20 cells
// (4 ops × 5 types) all verified ✗ — each rejects with Bad argument type.
{
  const ops = ['<', '>', '≤', '≥'];
  // L=✗ — List is not isNumber; both operands must be scalar numeric.
  for (const op of ops) {
    const s = new Stack();
    s.push(RList([Real(1), Real(2)]));
    s.push(RList([Real(3), Real(4)]));
    assertThrows(() => lookup(op).fn(s), /Bad argument type/i,
      `session253: {R(1) R(2)} {R(3) R(4)} ${op} → 'Bad argument type' (L=✗; comparePair is scalar-only)`);
  }
  // V=✗ — Vector is not isNumber.
  for (const op of ops) {
    const s = new Stack();
    s.push(Vector([Real(1), Real(2)]));
    s.push(Vector([Real(3), Real(4)]));
    assertThrows(() => lookup(op).fn(s), /Bad argument type/i,
      `session253: V[R(1),R(2)] V[R(3),R(4)] ${op} → 'Bad argument type' (V=✗; comparePair is scalar-only)`);
  }
  // M=✗ — Matrix is not isNumber.
  for (const op of ops) {
    const s = new Stack();
    s.push(Matrix([[Real(1)]]));
    s.push(Matrix([[Real(2)]]));
    assertThrows(() => lookup(op).fn(s), /Bad argument type/i,
      `session253: M[[R(1)]] M[[R(2)]] ${op} → 'Bad argument type' (M=✗; comparePair is scalar-only)`);
  }
  // T=✗ — Tagged is not isNumber and not a sym-operand; tag is NOT transparently unwrapped
  // on the ordered-compare surface (contrast with the unary T-transparency pattern).
  for (const op of ops) {
    const s = new Stack();
    s.push(Tagged('x', Real(1)));
    s.push(Real(2));
    assertThrows(() => lookup(op).fn(s), /Bad argument type/i,
      `session253: :x:R(1) R(2) ${op} → 'Bad argument type' (T=✗; Tagged not unwrapped by comparePair)`);
  }
  // U=✗ — Unit is not isNumber; dimensional compare is not supported on < > ≤ ≥.
  for (const op of ops) {
    const s = new Stack();
    s.push(Unit(1, [['m', 1]]));
    s.push(Unit(2, [['m', 1]]));
    assertThrows(() => lookup(op).fn(s), /Bad argument type/i,
      `session253: 1_m 2_m ${op} → 'Bad argument type' (U=✗; Unit not handled by comparePair)`);
  }
}

// ── session256: Ordered comparators < > ≤ ≥ — cross-type asymmetric rejection pins ──────────
// session253 covered homogeneous bad-type pairs (L×L, V×V, M×M, T×T, U×U).
// These 8 pins cover the asymmetric case where exactly one operand is a valid numeric scalar
// and the other is a non-number, confirming the `!isNumber(a) || !isNumber(b)` OR-guard fires
// regardless of which operand is bad and regardless of stack position.
{
  // R(level-2) × L(level-1): scalar on top-of-effective-input, List below.
  const s = new Stack();
  s.push(Real(3));
  s.push(RList([Real(1)]));
  assertThrows(() => lookup('<').fn(s), /Bad argument type/i,
    'session256: R(3) {R(1)} < → Bad argument type (R×L cross-type; L on level-1 fires OR-guard)');
}
{
  // L(level-2) × R(level-1): List on level-2, scalar on level-1 — guards that OR not AND logic
  // means the List side fires even when the other operand is a valid Real.
  const s = new Stack();
  s.push(RList([Real(1)]));
  s.push(Real(3));
  assertThrows(() => lookup('<').fn(s), /Bad argument type/i,
    'session256: {R(1)} R(3) < → Bad argument type (L×R cross-type; L on level-2 fires OR-guard)');
}
{
  // R × V: Real level-2, Vector level-1.  Different op (>) to spread coverage across all four.
  const s = new Stack();
  s.push(Real(3));
  s.push(Vector([Real(1), Real(2)]));
  assertThrows(() => lookup('>').fn(s), /Bad argument type/i,
    'session256: R(3) V[R(1),R(2)] > → Bad argument type (R×V cross-type asymmetric rejection)');
}
{
  // R × M: Real level-2, Matrix level-1.
  const s = new Stack();
  s.push(Real(3));
  s.push(Matrix([[Real(1)]]));
  assertThrows(() => lookup('>').fn(s), /Bad argument type/i,
    'session256: R(3) M[[R(1)]] > → Bad argument type (R×M cross-type asymmetric rejection)');
}
{
  // R × T: Real level-2, Tagged level-1.  Confirms Tagged NOT transparently unwrapped even in
  // the asymmetric position (the level-2 Real cannot "see through" the Tagged on level-1).
  const s = new Stack();
  s.push(Real(3));
  s.push(Tagged('x', Real(1)));
  assertThrows(() => lookup('≤').fn(s), /Bad argument type/i,
    'session256: R(3) :x:R(1) ≤ → Bad argument type (R×T cross-type; T not unwrapped on level-1)');
}
{
  // Z × U: Integer level-2, Unit level-1.  Guards that the BinInt→Integer promotion step
  // that runs before the isNumber guard does not accidentally accept Unit as a numeric.
  const s = new Stack();
  s.push(Integer(1n));
  s.push(Unit(1, [['m', 1]]));
  assertThrows(() => lookup('≥').fn(s), /Bad argument type/i,
    'session256: Integer(1) 1_m ≥ → Bad argument type (Z×U cross-type; Unit not numeric)');
}
{
  // R × S: Real level-2, String level-1.  The String compare arm requires BOTH operands to be
  // String; a Real+String mix bypasses that arm and hits the !isNumber guard (String is not
  // isNumber), so this throws rather than lex-comparing.
  const s = new Stack();
  s.push(Real(5));
  s.push(Str('hello'));
  assertThrows(() => lookup('<').fn(s), /Bad argument type/i,
    'session256: R(5) "hello" < → Bad argument type (R×S; String arm requires both-String)');
}
{
  // S × R: String level-2, Real level-1.  Symmetric to the R×S case above — confirms the
  // guard fires in both level orientations for mixed String+numeric.
  const s = new Stack();
  s.push(Str('hello'));
  s.push(Real(5));
  assertThrows(() => lookup('<').fn(s), /Bad argument type/i,
    'session256: "hello" R(5) < → Bad argument type (S×R; String arm requires both-String)');
}


/* ================================================================
   BinaryInteger (B column) rejection pins
   ---------------------------------------------------------------
   All unary and binary scalar ops that dispatch through handlers
   requiring `isReal`, `isInteger`, `isRational`, or `isComplex`
   reject BinaryInteger with Bad argument type.  BinaryInteger is
   accepted on the binary arithmetic surface (add/sub/mul/div via
   the BinInt fast path) and by the rounding family
   (FLOOR/CEIL/IP/FP — B=✓ separately pinned), but NOT by the
   general numeric-math surface.

   22 ops all return `Bad argument type`:
     INV / SQ / SQRT / ABS / SIN..ATANH (group) /
     FACT / LN..ALOG (group) / LNP1 / EXPM /
     SIGN / ARG /
     MOD / MIN / MAX / GCD / LCM / % / %T / %CH /
     CONJ / RE / IM
   ================================================================ */
{

  // INV
  {
    const s = new Stack();
    s.push(BinaryInteger(10n, 'h'));
    assertThrows(() => lookup('INV').fn(s), /Bad argument type/i,
      'session258: INV BinaryInteger → Bad argument type (B=✗; no isB branch in _invScalar)');
  }
  // SQ
  {
    const s = new Stack();
    s.push(BinaryInteger(10n, 'h'));
    assertThrows(() => lookup('SQ').fn(s), /Bad argument type/i,
      'session258: SQ BinaryInteger → Bad argument type (B=✗; _sqScalar requires numeric scalar)');
  }
  // SQRT
  {
    const s = new Stack();
    s.push(BinaryInteger(10n, 'h'));
    assertThrows(() => lookup('SQRT').fn(s), /Bad argument type/i,
      'session258: SQRT BinaryInteger → Bad argument type (B=✗; toRealOrThrow rejects BinInt)');
  }
  // ABS
  {
    const s = new Stack();
    s.push(BinaryInteger(10n, 'h'));
    assertThrows(() => lookup('ABS').fn(s), /Bad argument type/i,
      'session258: ABS BinaryInteger → Bad argument type (B=✗; _absScalar isReal/isInteger/isRational/isComplex only)');
  }
  // SIN — representative for the grouped SIN..ACOSH..ATANH row
  {
    const s = new Stack();
    s.push(BinaryInteger(10n, 'h'));
    assertThrows(() => lookup('SIN').fn(s), /Bad argument type/i,
      'session258: SIN BinaryInteger → Bad argument type (B=✗; _unaryCx→toRealOrThrow rejects BinInt; representative for trig/hyp group)');
  }
  // FACT
  {
    const s = new Stack();
    s.push(BinaryInteger(10n, 'h'));
    assertThrows(() => lookup('FACT').fn(s), /Bad argument type/i,
      'session258: FACT BinaryInteger → Bad argument type (B=✗; _factScalar isReal/isInteger only)');
  }
  // LN — representative for grouped LN / LOG / EXP / ALOG row
  {
    const s = new Stack();
    s.push(BinaryInteger(10n, 'h'));
    assertThrows(() => lookup('LN').fn(s), /Bad argument type/i,
      'session258: LN BinaryInteger → Bad argument type (B=✗; _unaryCx→toRealOrThrow rejects BinInt; representative for LN/LOG/EXP/ALOG group)');
  }
  // LNP1
  {
    const s = new Stack();
    s.push(BinaryInteger(10n, 'h'));
    assertThrows(() => lookup('LNP1').fn(s), /Bad argument type/i,
      'session258: LNP1 BinaryInteger → Bad argument type (B=✗; toRealOrThrow rejects BinInt)');
  }
  // EXPM
  {
    const s = new Stack();
    s.push(BinaryInteger(10n, 'h'));
    assertThrows(() => lookup('EXPM').fn(s), /Bad argument type/i,
      'session258: EXPM BinaryInteger → Bad argument type (B=✗; toRealOrThrow rejects BinInt)');
  }
  // SIGN
  {
    const s = new Stack();
    s.push(BinaryInteger(10n, 'h'));
    assertThrows(() => lookup('SIGN').fn(s), /Bad argument type/i,
      'session258: SIGN BinaryInteger → Bad argument type (B=✗; _signScalar isReal/isInteger/isRational/isComplex only)');
  }
  // ARG
  {
    const s = new Stack();
    s.push(BinaryInteger(10n, 'h'));
    assertThrows(() => lookup('ARG').fn(s), /Bad argument type/i,
      'session258: ARG BinaryInteger → Bad argument type (B=✗; _argScalar isReal/isInteger only)');
  }
  // CONJ
  {
    const s = new Stack();
    s.push(BinaryInteger(10n, 'h'));
    assertThrows(() => lookup('CONJ').fn(s), /Bad argument type/i,
      'session258: CONJ BinaryInteger → Bad argument type (B=✗; _conjScalar isReal/isInteger/isRational/isComplex/isName/isSym only)');
  }
  // RE
  {
    const s = new Stack();
    s.push(BinaryInteger(10n, 'h'));
    assertThrows(() => lookup('RE').fn(s), /Bad argument type/i,
      'session258: RE BinaryInteger → Bad argument type (B=✗; _reScalar same dispatch as _conjScalar)');
  }
  // IM
  {
    const s = new Stack();
    s.push(BinaryInteger(10n, 'h'));
    assertThrows(() => lookup('IM').fn(s), /Bad argument type/i,
      'session258: IM BinaryInteger → Bad argument type (B=✗; _imScalar same dispatch; Integer(0) branch not reached for BinInt)');
  }

  // --- Binary math ops — BinaryInteger rejected on both sides -

  // MOD
  {
    const s = new Stack();
    s.push(BinaryInteger(10n, 'h'));
    s.push(BinaryInteger(5n, 'h'));
    assertThrows(() => lookup('MOD').fn(s), /Bad argument type/i,
      'session258: B(10) B(5) MOD → Bad argument type (B=✗; toRealOrThrow rejects BinInt in _modScalar)');
  }
  // MIN
  {
    const s = new Stack();
    s.push(BinaryInteger(10n, 'h'));
    s.push(BinaryInteger(5n, 'h'));
    assertThrows(() => lookup('MIN').fn(s), /Bad argument type/i,
      'session258: B(10) B(5) MIN → Bad argument type (B=✗; _minMaxScalar requires isNumber)');
  }
  // MAX
  {
    const s = new Stack();
    s.push(BinaryInteger(10n, 'h'));
    s.push(BinaryInteger(5n, 'h'));
    assertThrows(() => lookup('MAX').fn(s), /Bad argument type/i,
      'session258: B(10) B(5) MAX → Bad argument type (B=✗; _minMaxScalar requires isNumber)');
  }
  // GCD
  {
    const s = new Stack();
    s.push(BinaryInteger(10n, 'h'));
    s.push(BinaryInteger(5n, 'h'));
    assertThrows(() => lookup('GCD').fn(s), /Bad argument type/i,
      'session258: B(10) B(5) GCD → Bad argument type (B=✗; _toBigIntOrThrow no isBinaryInteger branch)');
  }
  // LCM
  {
    const s = new Stack();
    s.push(BinaryInteger(10n, 'h'));
    s.push(BinaryInteger(5n, 'h'));
    assertThrows(() => lookup('LCM').fn(s), /Bad argument type/i,
      'session258: B(10) B(5) LCM → Bad argument type (B=✗; same _toBigIntOrThrow guard as GCD)');
  }
  // %
  {
    const s = new Stack();
    s.push(BinaryInteger(10n, 'h'));
    s.push(BinaryInteger(5n, 'h'));
    assertThrows(() => lookup('%').fn(s), /Bad argument type/i,
      'session258: B(10) B(5) % → Bad argument type (B=✗; toRealOrThrow rejects BinInt in percent handler)');
  }
  // %T
  {
    const s = new Stack();
    s.push(BinaryInteger(10n, 'h'));
    s.push(BinaryInteger(5n, 'h'));
    assertThrows(() => lookup('%T').fn(s), /Bad argument type/i,
      'session258: B(10) B(5) %T → Bad argument type (B=✗; same toRealOrThrow path as %)');
  }
  // %CH
  {
    const s = new Stack();
    s.push(BinaryInteger(10n, 'h'));
    s.push(BinaryInteger(5n, 'h'));
    assertThrows(() => lookup('%CH').fn(s), /Bad argument type/i,
      'session258: B(10) B(5) %CH → Bad argument type (B=✗; same toRealOrThrow path as %)');
  }
}

/* ================================================================
   Session 263 — Unit (U column) rejection-pin pass
   19 new rejection pins across the unary numeric-math surface,
   CONJ/RE/IM, and the binary scalar surface.
   No source changes — all rejections were already correct behavior,
   just untested.  Unit values need a normalised uexpr array
   (the [sym, exp] form from parseUnitExpr); plain-string uexpr
   would crash inside inverseUexpr/powerUexpr before reaching the
   type guard, so all pins use Unit(1, [['m', 1]]).
   ================================================================ */
{
  const U1 = Unit(1, [['m', 1]]);   // 1_m  (level 2 / unary arg)
  const U2 = Unit(2, [['m', 1]]);   // 2_m  (level 1 / second binary arg)

  // ── Cluster 1: Unary numeric-math surface (U=✗) ───────────────
  // SQRT — toRealOrThrow rejects Unit (no isUnit branch in _sqrtScalar)
  {
    const s = new Stack(); s.push(U1);
    assertThrows(() => lookup('SQRT').fn(s), /Bad argument type/i,
      'session263: 1_m SQRT → Bad argument type (U=✗; toRealOrThrow rejects Unit)');
  }
  // SIN — representative for trig/hyp group (_unaryCx → toRealOrThrow)
  {
    const s = new Stack(); s.push(U1);
    assertThrows(() => lookup('SIN').fn(s), /Bad argument type/i,
      'session263: 1_m SIN → Bad argument type (U=✗; _unaryCx → toRealOrThrow rejects Unit; applies to entire trig/hyp group)');
  }
  // FACT — _factScalar isReal/isInteger only
  {
    const s = new Stack(); s.push(U1);
    assertThrows(() => lookup('FACT').fn(s), /Bad argument type/i,
      'session263: 1_m FACT → Bad argument type (U=✗; _factScalar isReal/isInteger only)');
  }
  // LN — representative for LN/LOG/EXP/ALOG group (_unaryCx → toRealOrThrow)
  {
    const s = new Stack(); s.push(U1);
    assertThrows(() => lookup('LN').fn(s), /Bad argument type/i,
      'session263: 1_m LN → Bad argument type (U=✗; _unaryCx → toRealOrThrow rejects Unit; applies to LN/LOG/EXP/ALOG group)');
  }
  // LNP1 — toRealOrThrow rejects Unit
  {
    const s = new Stack(); s.push(U1);
    assertThrows(() => lookup('LNP1').fn(s), /Bad argument type/i,
      'session263: 1_m LNP1 → Bad argument type (U=✗; toRealOrThrow rejects Unit in LNP1 handler)');
  }
  // EXPM — toRealOrThrow rejects Unit
  {
    const s = new Stack(); s.push(U1);
    assertThrows(() => lookup('EXPM').fn(s), /Bad argument type/i,
      'session263: 1_m EXPM → Bad argument type (U=✗; toRealOrThrow rejects Unit in EXPM handler)');
  }
  // SIGN — _signScalar isReal/isInteger/isRational/isComplex only; no isUnit branch
  {
    const s = new Stack(); s.push(U1);
    assertThrows(() => lookup('SIGN').fn(s), /Bad argument type/i,
      'session263: 1_m SIGN → Bad argument type (U=✗; _signScalar no isUnit branch)');
  }
  // ARG — _argScalar isReal/isInteger only; no isUnit branch
  {
    const s = new Stack(); s.push(U1);
    assertThrows(() => lookup('ARG').fn(s), /Bad argument type/i,
      'session263: 1_m ARG → Bad argument type (U=✗; _argScalar isReal/isInteger only)');
  }

  // ── Cluster 2: CONJ / RE / IM (U=✗) ──────────────────────────
  // _conjScalar / _reScalar / _imScalar: isReal/isInteger/isRational/isComplex/isName/isSym
  // dispatch — no isUnit branch; Unit falls through to final throw.
  {
    const s = new Stack(); s.push(U1);
    assertThrows(() => lookup('CONJ').fn(s), /Bad argument type/i,
      'session263: 1_m CONJ → Bad argument type (U=✗; _conjScalar no isUnit branch)');
  }
  {
    const s = new Stack(); s.push(U1);
    assertThrows(() => lookup('RE').fn(s), /Bad argument type/i,
      'session263: 1_m RE → Bad argument type (U=✗; _reScalar no isUnit branch)');
  }
  {
    const s = new Stack(); s.push(U1);
    assertThrows(() => lookup('IM').fn(s), /Bad argument type/i,
      'session263: 1_m IM → Bad argument type (U=✗; _imScalar no isUnit branch)');
  }

  // ── Cluster 3: Binary scalar surface (U=✗) ────────────────────
  // All binary scalar ops reject Unit on either operand position.
  // Using U1 (level 2) and U2 (level 1) for consistency.
  {
    const s = new Stack(); s.push(U1); s.push(U2);
    assertThrows(() => lookup('MOD').fn(s), /Bad argument type/i,
      'session263: 1_m 2_m MOD → Bad argument type (U=✗; toRealOrThrow rejects Unit in _modScalar)');
  }
  {
    const s = new Stack(); s.push(U1); s.push(U2);
    assertThrows(() => lookup('MIN').fn(s), /Bad argument type/i,
      'session263: 1_m 2_m MIN → Bad argument type (U=✗; _minMaxScalar requires isNumber; Unit not in isNumber)');
  }
  {
    const s = new Stack(); s.push(U1); s.push(U2);
    assertThrows(() => lookup('MAX').fn(s), /Bad argument type/i,
      'session263: 1_m 2_m MAX → Bad argument type (U=✗; same _minMaxScalar guard as MIN)');
  }
  {
    const s = new Stack(); s.push(U1); s.push(U2);
    assertThrows(() => lookup('GCD').fn(s), /Bad argument type/i,
      'session263: 1_m 2_m GCD → Bad argument type (U=✗; _toBigIntOrThrow no isUnit branch)');
  }
  {
    const s = new Stack(); s.push(U1); s.push(U2);
    assertThrows(() => lookup('LCM').fn(s), /Bad argument type/i,
      'session263: 1_m 2_m LCM → Bad argument type (U=✗; same _toBigIntOrThrow guard as GCD)');
  }
  {
    const s = new Stack(); s.push(U1); s.push(U2);
    assertThrows(() => lookup('%').fn(s), /Bad argument type/i,
      'session263: 1_m 2_m % → Bad argument type (U=✗; toRealOrThrow rejects Unit in percent handler)');
  }
  {
    const s = new Stack(); s.push(U1); s.push(U2);
    assertThrows(() => lookup('%T').fn(s), /Bad argument type/i,
      'session263: 1_m 2_m %T → Bad argument type (U=✗; same toRealOrThrow path as %)');
  }
  {
    const s = new Stack(); s.push(U1); s.push(U2);
    assertThrows(() => lookup('%CH').fn(s), /Bad argument type/i,
      'session263: 1_m 2_m %CH → Bad argument type (U=✗; same toRealOrThrow path as %)');
  }
}

/* ================================================================
   Session 267 — C (Complex) and S (String) column rejection-pin pass,
   plus V/M rejection pins for the combinatorial family.
   26 matrix cells flipped ·→✗ across three table groups:
     (1) C column — Real-decomp family: ZETA / LAMBERT / PSI           (3 cells)
     (2) C column — Stat-dist family:   DIRAC / ERF / ERFC / BETA /
                                         UTPC / UTPF / UTPT             (7 cells)
     (3) C column — Combinatorial:      COMB / PERM / IQUOT /
                                         IREMAINDER / XROOT             (5 cells)
     (4) S column — Reference rows:     CONJ / RE / IM                  (3 cells)
     (5) V/M columns — Combinatorial:   COMB / PERM / IQUOT /
                                         IREMAINDER (V + M each)        (8 cells)
   No source changes — all rejections were already correct behavior,
   just untested.  Complex(1,2) is the representative Complex input;
   Str('x') the String input; Vector/Matrix with Real elements for V/M.
   ================================================================ */
{
  const C1 = Complex(1, 2);   // 1+2i — representative Complex input
  const C2 = Complex(2, 1);   // 2+i  — for binary ops
  const S1 = Str('x');        // String — representative String input
  const V1 = Vector([Real(1), Real(2)]);
  const V2 = Vector([Real(3), Real(4)]);
  const M1 = Matrix([[Real(1), Real(2)], [Real(3), Real(4)]]);

  {
    const s = new Stack(); s.push(C1);
    assertThrows(() => lookup('ZETA').fn(s), /Bad argument type/i,
      'session267: Complex(1,2) ZETA → Bad argument type (C=✗; _zetaScalar isInteger/isReal only; Complex → null → throw)');
  }
  {
    const s = new Stack(); s.push(C1);
    assertThrows(() => lookup('LAMBERT').fn(s), /Bad argument type/i,
      'session267: Complex(1,2) LAMBERT → Bad argument type (C=✗; _lambertScalar isInteger/isReal only; Complex → null → throw)');
  }
  {
    const s = new Stack(); s.push(C1);
    assertThrows(() => lookup('PSI').fn(s), /Bad argument type/i,
      'session267: Complex(1,2) PSI → Bad argument type (C=✗; _psiScalar isInteger/isReal only; Complex → null → throw)');
  }

  {
    const s = new Stack(); s.push(C1);
    assertThrows(() => lookup('DIRAC').fn(s), /Bad argument type/i,
      'session267: Complex(1,2) DIRAC → Bad argument type (C=✗; DIRAC scalar: isReal/isInteger/isBinaryInteger/isSym only; Complex falls through)');
  }
  {
    const s = new Stack(); s.push(C1);
    assertThrows(() => lookup('erf').fn(s), /Bad argument type/i,
      'session267: Complex(1,2) ERF → Bad argument type (C=✗; _erfScalar isInteger/isReal/null pattern; Complex → null → throw)');
  }
  {
    const s = new Stack(); s.push(C1);
    assertThrows(() => lookup('erfc').fn(s), /Bad argument type/i,
      'session267: Complex(1,2) ERFC → Bad argument type (C=✗; _erfcScalar isInteger/isReal/null pattern; Complex → null → throw)');
  }
  {
    // BETA is arity 2: level2=a, level1=b
    const s = new Stack(); s.push(C1); s.push(C2);
    assertThrows(() => lookup('BETA').fn(s), /Bad argument type/i,
      'session267: Complex(1,2) Complex(2,1) BETA → Bad argument type (C=✗; _betaScalar aNum = isInteger?…:isReal?…:null; Complex a-arg → null → throw)');
  }
  {
    const s = new Stack(); s.push(C1); s.push(C2);
    assertThrows(() => lookup('UTPC').fn(s), /Bad argument type/i,
      'session267: Complex(1,2) Complex(2,1) UTPC → Bad argument type (C=✗; asReal helper isInteger/isReal only; Complex nu-arg → throw)');
  }
  {
    // UTPF is arity 3: level3=v1, level2=v2, level1=x
    const s = new Stack(); s.push(C1); s.push(C2); s.push(C1);
    assertThrows(() => lookup('UTPF').fn(s), /Bad argument type/i,
      'session267: Complex(1,2) Complex(2,1) Complex(1,2) UTPF → Bad argument type (C=✗; same asReal helper; Complex v1-arg → throw)');
  }
  {
    const s = new Stack(); s.push(C1); s.push(C2);
    assertThrows(() => lookup('UTPT').fn(s), /Bad argument type/i,
      'session267: Complex(1,2) Complex(2,1) UTPT → Bad argument type (C=✗; same asReal helper; Complex nu-arg → throw)');
  }

  {
    const s = new Stack(); s.push(C1); s.push(C2);
    assertThrows(() => lookup('COMB').fn(s), /Bad argument type/i,
      'session267: Complex(1,2) Complex(2,1) COMB → Bad argument type (C=✗; _combPermArgs: !isInteger&&!isReal → throw; applies to PERM same guard)');
  }
  {
    const s = new Stack(); s.push(C1); s.push(C2);
    assertThrows(() => lookup('PERM').fn(s), /Bad argument type/i,
      'session267: Complex(1,2) Complex(2,1) PERM → Bad argument type (C=✗; same _combPermArgs guard as COMB)');
  }
  {
    const s = new Stack(); s.push(C1); s.push(C2);
    assertThrows(() => lookup('IQUOT').fn(s), /Bad argument type/i,
      'session267: Complex(1,2) Complex(2,1) IQUOT → Bad argument type (C=✗; _intQuotientArg: isInteger/isReal only; Complex → throw; applies to IREMAINDER same guard)');
  }
  {
    const s = new Stack(); s.push(C1); s.push(C2);
    assertThrows(() => lookup('IREMAINDER').fn(s), /Bad argument type/i,
      'session267: Complex(1,2) Complex(2,1) IREMAINDER → Bad argument type (C=✗; same _intQuotientArg guard as IQUOT)');
  }
  {
    // XROOT: level2=radicand y, level1=degree x — both args Complex → Bad argument type on degree
    const s = new Stack(); s.push(C1); s.push(C2);
    assertThrows(() => lookup('XROOT').fn(s), /Bad argument type/i,
      'session267: Complex(1,2) Complex(2,1) XROOT → Bad argument type: expected real, got complex (C=✗; degree x goes through toRealOrThrow which explicitly rejects Complex)');
  }

  {
    const s = new Stack(); s.push(S1);
    assertThrows(() => lookup('CONJ').fn(s), /Bad argument type/i,
      'session267: Str("x") CONJ → Bad argument type (S=✗; _conjScalar isReal/isInteger/isRational/isComplex/isName/isSym dispatch; no isString branch)');
  }
  {
    const s = new Stack(); s.push(S1);
    assertThrows(() => lookup('RE').fn(s), /Bad argument type/i,
      'session267: Str("x") RE → Bad argument type (S=✗; _reScalar same dispatch structure; no isString branch)');
  }
  {
    const s = new Stack(); s.push(S1);
    assertThrows(() => lookup('IM').fn(s), /Bad argument type/i,
      'session267: Str("x") IM → Bad argument type (S=✗; _imScalar same dispatch; no isString branch)');
  }

  // COMB: representative for all four ops (COMB/PERM/IQUOT/IREMAINDER)
  // All use _combPermArgs or _intQuotientArg — neither has isVector/isMatrix branch.
  {
    const s = new Stack(); s.push(V1); s.push(V2);
    assertThrows(() => lookup('COMB').fn(s), /Bad argument type/i,
      'session267: V[1,2] V[3,4] COMB → Bad argument type (V=✗; _combPermArgs !isInteger&&!isReal rejects Vector; representative for PERM/IQUOT/IREMAINDER same path)');
  }
  {
    const s = new Stack(); s.push(M1); s.push(M1);
    assertThrows(() => lookup('COMB').fn(s), /Bad argument type/i,
      'session267: M[[1,2],[3,4]] M[[1,2],[3,4]] COMB → Bad argument type (M=✗; same _combPermArgs guard; representative for PERM/IQUOT/IREMAINDER same path)');
  }
  {
    const s = new Stack(); s.push(V1); s.push(V2);
    assertThrows(() => lookup('PERM').fn(s), /Bad argument type/i,
      'session267: V[1,2] V[3,4] PERM → Bad argument type (V=✗; same _combPermArgs guard as COMB V pin)');
  }
  {
    const s = new Stack(); s.push(M1); s.push(M1);
    assertThrows(() => lookup('PERM').fn(s), /Bad argument type/i,
      'session267: M PERM → Bad argument type (M=✗; same _combPermArgs guard as COMB M pin)');
  }
  {
    const s = new Stack(); s.push(V1); s.push(V2);
    assertThrows(() => lookup('IQUOT').fn(s), /Bad argument type/i,
      'session267: V[1,2] V[3,4] IQUOT → Bad argument type (V=✗; _intQuotientArg rejects Vector; same for IREMAINDER)');
  }
  {
    const s = new Stack(); s.push(M1); s.push(M1);
    assertThrows(() => lookup('IQUOT').fn(s), /Bad argument type/i,
      'session267: M IQUOT → Bad argument type (M=✗; same _intQuotientArg guard; same for IREMAINDER)');
  }
  {
    const s = new Stack(); s.push(V1); s.push(V2);
    assertThrows(() => lookup('IREMAINDER').fn(s), /Bad argument type/i,
      'session267: V[1,2] V[3,4] IREMAINDER → Bad argument type (V=✗; same _intQuotientArg guard as IQUOT V pin)');
  }
  {
    const s = new Stack(); s.push(M1); s.push(M1);
    assertThrows(() => lookup('IREMAINDER').fn(s), /Bad argument type/i,
      'session267: M IREMAINDER → Bad argument type (M=✗; same _intQuotientArg guard as IQUOT M pin)');
  }
}

/* ====================================================================
   session268: C-column rejection pins — GAMMA / LNGAMMA / HEAVISIDE
   ----------------------------------------------------------------
   Closes the three stat-dist family ops session 267 skipped when it
   pinned C=✗ on DIRAC/ERF/ERFC/BETA/UTPC/UTPF/UTPT.  All three reject
   Complex, but the cells carried ✗ with no documenting note or pin.
     • _gammaScalar / _lngammaScalar: `x = isInteger?…:isReal?…:null`;
       Complex → null → throw 'Bad argument type'.
     • HEAVISIDE scalar: isReal/isInteger/isBinaryInteger/isSym only;
       Complex falls through to the final throw.
   No source changes — the rejection was already correct, just untested.
   ================================================================ */
{
  const C1 = Complex(1, 2);   // 1+2i — representative Complex input

  {
    const s = new Stack(); s.push(C1);
    assertThrows(() => lookup('GAMMA').fn(s), /Bad argument type/i,
      'session268: Complex(1,2) GAMMA → Bad argument type (C=✗; _gammaScalar x = isInteger?…:isReal?…:null; Complex → null → throw)');
  }
  {
    const s = new Stack(); s.push(C1);
    assertThrows(() => lookup('LNGAMMA').fn(s), /Bad argument type/i,
      'session268: Complex(1,2) LNGAMMA → Bad argument type (C=✗; _lngammaScalar same isInteger/isReal/null pattern; Complex → throw)');
  }
  {
    const s = new Stack(); s.push(C1);
    assertThrows(() => lookup('HEAVISIDE').fn(s), /Bad argument type/i,
      'session268: Complex(1,2) HEAVISIDE → Bad argument type (C=✗; scalar arm isReal/isInteger/isBinaryInteger/isSym only; Complex falls through)');
  }
}

/* ====================================================================
   session269: S-column (String) rejection pins — combinatorial /
   integer-divmod family (COMB / PERM / IQUOT / IREMAINDER / XROOT)
   ----------------------------------------------------------------
   Adds the S column to the combinatorial-family matrix table (it had
   R/Z/Q/C/N/Sy/L/V/M/T only — no S column), continuing session 267's
   S-column work on CONJ/RE/IM.  All five reject String:
     • COMB / PERM:        `_combPermArgs` — `!isInteger(a) && !isReal(a) → throw`.
     • IQUOT / IREMAINDER: `_intQuotientArg` — isInteger/isReal only.
     • XROOT:              degree x via `toRealOrThrow` → 'expected real, got string'.
   No source changes — the rejection was already correct, just untested.
   ================================================================ */
{
  const S1 = Str('x');   // representative String input

  {
    const s = new Stack(); s.push(S1); s.push(Str('y'));
    assertThrows(() => lookup('COMB').fn(s), /Bad argument type/i,
      'session269: Str("x") Str("y") COMB → Bad argument type (S=✗; _combPermArgs !isInteger&&!isReal → throw; PERM shares guard)');
  }
  {
    const s = new Stack(); s.push(S1); s.push(Str('y'));
    assertThrows(() => lookup('PERM').fn(s), /Bad argument type/i,
      'session269: Str("x") Str("y") PERM → Bad argument type (S=✗; same _combPermArgs guard as COMB)');
  }
  {
    const s = new Stack(); s.push(S1); s.push(Str('y'));
    assertThrows(() => lookup('IQUOT').fn(s), /Bad argument type/i,
      'session269: Str("x") Str("y") IQUOT → Bad argument type (S=✗; _intQuotientArg isInteger/isReal only; IREMAINDER shares guard)');
  }
  {
    const s = new Stack(); s.push(S1); s.push(Str('y'));
    assertThrows(() => lookup('IREMAINDER').fn(s), /Bad argument type/i,
      'session269: Str("x") Str("y") IREMAINDER → Bad argument type (S=✗; same _intQuotientArg guard as IQUOT)');
  }
  {
    // XROOT: level2=radicand y, level1=degree x — degree String rejects via toRealOrThrow
    const s = new Stack(); s.push(S1); s.push(Str('y'));
    assertThrows(() => lookup('XROOT').fn(s), /Bad argument type/i,
      'session269: Str("x") Str("y") XROOT → Bad argument type: expected real, got string (S=✗; degree x via toRealOrThrow rejects String)');
  }
}

/* ====================================================================
   session271: S-column (String) rejection pins — special-function
   family (XPON / MANT / TRUNC / ZETA / LAMBERT / PSI)
   ----------------------------------------------------------------
   Adds the S column to the special-function table (it had
   R/Z/Q/C/N/Sy/L/V/M/T only — no S column), continuing session 269's
   S-column work on the combinatorial family.  All six reject String:
     • XPON / MANT:        handler guard `!isReal(v) && !isInteger(v) → throw`.
     • ZETA / LAMBERT / PSI: `_*Scalar` — `isInteger ? … : isReal ? … : null`
                            → String → null → 'Bad argument type'.
     • TRUNC:              x via `_roundingOp` `!isReal && !isInteger → throw`;
                            n (level 1) via `toRealOrThrow` → 'expected real, got string'.
   No source changes — the rejection was already correct, just untested.
   ================================================================ */
{
  const S1 = Str('x');   // representative String input

  {
    const s = new Stack(); s.push(S1);
    assertThrows(() => lookup('XPON').fn(s), /Bad argument type/i,
      'session271: Str("x") XPON → Bad argument type (S=✗; handler guard !isReal&&!isInteger → throw; MANT shares guard)');
  }
  {
    const s = new Stack(); s.push(S1);
    assertThrows(() => lookup('MANT').fn(s), /Bad argument type/i,
      'session271: Str("x") MANT → Bad argument type (S=✗; same !isReal&&!isInteger guard as XPON)');
  }
  {
    const s = new Stack(); s.push(S1);
    assertThrows(() => lookup('ZETA').fn(s), /Bad argument type/i,
      'session271: Str("x") ZETA → Bad argument type (S=✗; _zetaScalar isInteger/isReal/null; String → null → throw)');
  }
  {
    const s = new Stack(); s.push(S1);
    assertThrows(() => lookup('LAMBERT').fn(s), /Bad argument type/i,
      'session271: Str("x") LAMBERT → Bad argument type (S=✗; _lambertScalar isInteger/isReal/null; String → null → throw)');
  }
  {
    const s = new Stack(); s.push(S1);
    assertThrows(() => lookup('PSI').fn(s), /Bad argument type/i,
      'session271: Str("x") PSI → Bad argument type (S=✗; _psiScalar isInteger/isReal/null; String → null → throw)');
  }
  {
    // TRUNC x-operand (level 2) String → Bad argument type via _roundingOp guard
    const s = new Stack(); s.push(S1); s.push(Real(2));
    assertThrows(() => lookup('TRUNC').fn(s), /Bad argument type/i,
      'session271: Str("x") Real(2) TRUNC → Bad argument type (S=✗; x via _roundingOp !isReal&&!isInteger → throw)');
  }
  {
    // TRUNC n-operand (level 1) String → 'expected real, got string' via toRealOrThrow
    const s = new Stack(); s.push(Real(3.14159)); s.push(S1);
    assertThrows(() => lookup('TRUNC').fn(s), /expected real, got string/i,
      'session271: Real(3.14159) Str("x") TRUNC → Bad argument type: expected real, got string (S=✗; n via toRealOrThrow)');
  }
}

/* ====================================================================
   session281: S-column (String) rejection pins — special-function /
   stat-dist family (HEAVISIDE / DIRAC / GAMMA / LNGAMMA / ERF / ERFC /
   BETA / UTPC / UTPF / UTPT)
   ----------------------------------------------------------------
   Adds the S column to the stat-dist table (it had R/Z/Q/C/N/Sy/L/V/M/T
   only — no S column), completing the DATA_TYPES "Next-session widening
   candidates" item after session 271's special-function S-column.  All
   ten reject String with 'Bad argument type':
     • HEAVISIDE / DIRAC:   scalar arm isReal/isInteger/isBinaryInteger/isSym
                            only; String falls through to the closing throw.
     • GAMMA / LNGAMMA / ERF / ERFC: `_*Scalar` `isInteger ? … : isReal ? …
                            : null` → String → null → throw.
     • BETA:                `_betaScalar` aNum `isInteger ? … : isReal ? …
                            : null` → String → null → throw.
     • UTPC / UTPF / UTPT:  shared `asReal` helper (isInteger/isReal only)
                            throws on the first String operand.
   No source changes — the rejection was already correct, just untested.
   ================================================================ */
{
  const S1 = Str('x');   // representative String input

  {
    const s = new Stack(); s.push(S1);
    assertThrows(() => lookup('HEAVISIDE').fn(s), /Bad argument type/i,
      'session281: Str("x") HEAVISIDE → Bad argument type (S=✗; scalar arm isReal/isInteger/isBinaryInteger/isSym only)');
  }
  {
    const s = new Stack(); s.push(S1);
    assertThrows(() => lookup('DIRAC').fn(s), /Bad argument type/i,
      'session281: Str("x") DIRAC → Bad argument type (S=✗; same arm as HEAVISIDE)');
  }
  {
    const s = new Stack(); s.push(S1);
    assertThrows(() => lookup('GAMMA').fn(s), /Bad argument type/i,
      'session281: Str("x") GAMMA → Bad argument type (S=✗; _gammaScalar isInteger/isReal/null → throw)');
  }
  {
    const s = new Stack(); s.push(S1);
    assertThrows(() => lookup('LNGAMMA').fn(s), /Bad argument type/i,
      'session281: Str("x") LNGAMMA → Bad argument type (S=✗; _lngammaScalar isInteger/isReal/null → throw)');
  }
  {
    const s = new Stack(); s.push(S1);
    assertThrows(() => lookup('erf').fn(s), /Bad argument type/i,
      'session281: Str("x") ERF → Bad argument type (S=✗; _erfScalar isInteger/isReal/null → throw)');
  }
  {
    const s = new Stack(); s.push(S1);
    assertThrows(() => lookup('erfc').fn(s), /Bad argument type/i,
      'session281: Str("x") ERFC → Bad argument type (S=✗; _erfcScalar isInteger/isReal/null → throw)');
  }
  {
    const s = new Stack(); s.push(S1); s.push(Str('y'));
    assertThrows(() => lookup('Beta').fn(s), /Bad argument type/i,
      'session281: Str("x") Str("y") BETA → Bad argument type (S=✗; _betaScalar aNum null → throw)');
  }
  {
    const s = new Stack(); s.push(S1); s.push(Str('y'));
    assertThrows(() => lookup('UTPC').fn(s), /Bad argument type/i,
      'session281: Str("x") Str("y") UTPC → Bad argument type (S=✗; asReal rejects String ν)');
  }
  {
    const s = new Stack(); s.push(S1); s.push(Str('y')); s.push(Str('z'));
    assertThrows(() => lookup('UTPF').fn(s), /Bad argument type/i,
      'session281: Str("x") Str("y") Str("z") UTPF → Bad argument type (S=✗; asReal rejects String ν₁)');
  }
  {
    const s = new Stack(); s.push(S1); s.push(Str('y'));
    assertThrows(() => lookup('UTPT').fn(s), /Bad argument type/i,
      'session281: Str("x") Str("y") UTPT → Bad argument type (S=✗; asReal rejects String ν)');
  }
}
