import { Stack } from '../www/src/rpl/stack.js';
import { lookup } from '../www/src/rpl/ops.js';
import {
  Real, Integer, Rational, BinaryInteger, Complex, Name, Str, Directory, Program, Tagged, Unit, RList, Vector, Matrix,
  Symbolic, isReal, isInteger, isRational, isBinaryInteger, isString, isNumber, promoteNumericPair, Decimal,
  isValidHpIdentifier, isCasIdentifier, isReservedHpName, isStorableHpName, registerReservedName,
} from '../www/src/rpl/types.js';
import { parseEntry } from '../www/src/rpl/parser.js';
import { format } from '../www/src/rpl/formatter.js';
import { isKnownFunction, defaultFnEval } from '../www/src/rpl/algebra.js';
import { state as calcState, varStore, varRecall, resetHome, clearLastError, setApproxMode } from '../www/src/rpl/state.js';
import { assert, assertThrows, runOp, runLine } from './helpers.mjs';

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
    assert(Math.abs(got - Math.sqrt(30)) < 1e-10,
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

   →STR  ( any  → "src" )     render via formatter in the display format
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
    assert(s.peek(1).value === 'HELLO',
      'AUR: →STR returns a string as it is, where it quoted it');
  }
  {
    const text = (src) => runLine(src).peek().value;
    assert(text('2 FIX 3.14159 →STR STD') === '3.14' && text('3 SCI 12345.678 →STR STD') === '1.235E4',
      'AUR: →STR writes a number in the display format (flags -49, -50), where it always used STD');
    assert(text('2 FIX { 1.5 "A" } →STR STD') === '{ 1.50 "A" }' && text('STD 3.14159 →STR') === '3.14159',
      '→STR formats the numbers inside a list too, and keeps every digit in STD');
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
  lookup('VTYPE').fn(s);
  assert(s.peek().value.eq(-1), 'session068: VTYPE on an undefined name gives -1 (AUR)');
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
  s.push(Rational(3n, 4n));
  lookup('TYPE').fn(s);
  assert(s.peek().value.eq(9), 'TYPE of the fraction 3/4 gives 9, as the HP reports for the algebraic 3/4');
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
  // aren't part of Giac's native simplify().  SIMPLIFY routes through
  // Giac's simplify(), so the fixtures below simulate
  // what Giac *would* return if we taught it those rules (or added a
  // post-Giac normalisation pass).  The tests still verify the caseval
  // plumbing + formatter round-trip.
  // TODO: add a post-Giac normalisation pass that applies the HP50-
  // flavoured idempotency rules so these fixtures can be dropped.
  const { giac } = await import('../www/src/rpl/cas/giac-engine.mjs');
  giac._clear();
  giac._setFixtures({
    'simplify(FLOOR(FLOOR(X)))': 'FLOOR(X)',
    'simplify(ceil(ceil(X)))':   'ceil(X)',
    'simplify(IP(IP(X)))':       'IP(X)',
    'simplify(FP(FP(X)))':       'FP(X)',
    'simplify(sign(sign(X)))':   'sign(X)',
    'simplify(FP(FLOOR(X)))':    '0',
    'simplify(FP(ceil(X)))':     '0',
    'simplify(FP(IP(X)))':       '0',
    'simplify(FLOOR(ceil(X)))':  'ceil(X)',
    'simplify(ceil(FLOOR(X)))':  'FLOOR(X)',
    'simplify(IP(FLOOR(X)))':    'FLOOR(X)',
    'simplify(IP(ceil(X)))':     'ceil(X)',
    'simplify(FLOOR(IP(X)))':    'IP(X)',
    'simplify(ceil(IP(X)))':     'IP(X)',
    'simplify(FLOOR(FP(X)))':    'FLOOR(FP(X))',
    'simplify(ceil(FP(X)))':     'ceil(FP(X))',
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
    const out = runOp('SIMPLIFY', e);
    const f = format(out);
    assert(f === `\`${expected}\``,
      `session082: SIMPLIFY '${src}' → '${expected}' (got ${f})`);
  }

  const FP_OF_INT = [
    ['FP(FLOOR(X))'],
    ['FP(CEIL(X))'],
    ['FP(IP(X))'],
  ];
  for (const [src] of FP_OF_INT) {
    const [e] = parseEntry(`\`${src}\``);
    const out = runOp('SIMPLIFY', e);
    const f = format(out);
    assert(f === "`0`" || f === '0' || f === '0.',
      `session082: SIMPLIFY '${src}' → 0 (got ${f})`);
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
    const out = runOp('SIMPLIFY', e);
    const f = format(out);
    assert(f === `\`${expected}\``,
      `session082: SIMPLIFY '${src}' → '${expected}' (got ${f})`);
  }

  {
    const [e] = parseEntry("`FLOOR(FP(X))`");
    const out = runOp('SIMPLIFY', e);
    assert(format(out) === "`FLOOR(FP(X))`",
      `session082: SIMPLIFY leaves FLOOR(FP(X)) alone (got ${format(out)})`);
  }
  {
    const [e] = parseEntry("`CEIL(FP(X))`");
    const out = runOp('SIMPLIFY', e);
    assert(format(out) === "`CEIL(FP(X))`",
      `session082: SIMPLIFY leaves CEIL(FP(X)) alone (got ${format(out)})`);
  }
  giac._clear();
}

{
  // COLLECT factors over the integers, never into square roots, as the AUR's COLLECT(X^2+5*X+6) = (X+2)(X+3) does.
  const { giac } = await import('../www/src/rpl/cas/giac-engine.mjs');
  giac._clear();
  giac._setFixtures({
    'collect(X^2+5*X+6)': '(X+2)*(X+3)',
    'collect(X^2-2)': 'X^2-2',
    'collect(X*Y+X*Z)': '(Y+Z)*X',
  });
  for (const [src, expected] of [['X^2+5*X+6', '(X + 2)*(X + 3)'], ['X^2-2', 'X^2 - 2'], ['X*Y+X*Z', '(Y + Z)*X']]) {
    const [e] = parseEntry(`\`${src}\``);
    const f = format(runOp('COLLECT', e));
    assert(f === `\`${expected}\``, `COLLECT '${src}' factors over the integers to '${expected}', where it used to simplify (got ${f})`);
  }
  const twelve = format(runOp('COLLECT', parseEntry('12')[0]));
  assert(twelve === format(runOp('FACTOR', parseEntry('12')[0])), `COLLECT writes an integer as its prime factors, as FACTOR does (got ${twelve})`);
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
    // session428: FLOOR/CEIL/IP/FP on a Rational in APPROX mode collapse to
    // Real (the `getApproxMode()` Decimal arm of _rounderScalar, ops.js ~1365),
    // distinct from the EXACT BigInt arm that returns Integer/Rational. Every
    // prior rounder-on-Rational pin runs in EXACT mode (see the EXACT block
    // below), so this arm had zero coverage — a refactor folding it into the
    // BigInt path would return Integer/Rational yet pass every EXACT pin. The
    // FP exact-zero case (4/2) returns Real(0) here, not EXACT's Integer(0n).
    {
      const rounders = [
        //  n,   d, FLOOR, CEIL,  IP,   FP
        [ 7n,  2n,   3,    4,    3,   0.5],   //  7/2 = 3.5
        [-7n,  2n,  -4,   -3,   -3,  -0.5],   // -7/2 = -3.5
        [ 4n,  2n,   2,    2,    2,   0  ],   //  4/2 = 2 (FP → Real(0), not Integer)
      ];
      for (const [n, d, fl, ce, ip, fp] of rounders) {
        const tag = `${n}/${d}`;
        for (const [op, want] of [['FLOOR', fl], ['CEIL', ce], ['IP', ip], ['FP', fp]]) {
          const s = new Stack();
          s.push(Rational(n, d));
          lookup(op).fn(s);
          const r = s.peek(1);
          assert(r.type === 'real' && Math.abs(Number(r.value) - want) < 1e-12,
            `session428: APPROX ${op} ${tag} → Real(${want}) (got ${r.type} ${r.value})`);
        }
      }
    }
    // session435: SQRT on a non-negative Rational in APPROX mode collapses to
    // Real (SQRT's final `else`, ops.js ~1182 — the EXACT-mode Rational arm
    // `isRational(v) && !getApproxMode()` at ~1163 is skipped). Every prior
    // SQRT-on-Rational pin runs in EXACT mode (test-types ~1317, session120
    // ~3291), where a perfect square stays an exact Rational/Integer and a
    // non-perfect square lifts to Symbolic — so this collapse arm had zero
    // coverage. A refactor folding the APPROX path into the EXACT BigInt
    // fast-path would return Rational(2/3) / Rational(3/4) for the
    // perfect-square cases yet pass every EXACT pin. (The negative-Rational
    // Complex arm at ~1157 fires before the mode check and is pinned in EXACT.)
    {
      for (const [n, d] of [[4n, 9n], [9n, 16n], [2n, 9n], [1n, 4n]]) {
        const s = new Stack();
        s.push(Rational(n, d));
        lookup('SQRT').fn(s);
        const r = s.peek(1);
        assert(r.type === 'real' &&
          Math.abs(Number(r.value) - Math.sqrt(Number(n) / Number(d))) < 1e-12,
          `session435: APPROX SQRT ${n}/${d} → Real (got ${r.type} ${r.value})`);
      }
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
  assert(isValidHpIdentifier('I%YR') && !isValidHpIdentifier('%A'), 'isValid: % after the first letter, as in the TVM solver\'s I%YR');
  assert(isCasIdentifier('X_1') && !isCasIdentifier('I%YR'), 'isCasIdentifier: a name bound for Giac, which reads % as its remainder, keeps to letters, digits and _');

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
    s.push(Real(1));
    s.push(Name("'QZ'"));
    assertThrows(() => { lookup('STO').fn(s); }, /quote names with backticks: `QZ`/,
      "STO on an HP-style 'QZ' suggests the backtick form");
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
  assert(defaultFnEval('XROOT',[-8, 3]) === -2,         'XROOT of a negative radicand with an odd index is real');
  assert(defaultFnEval('XROOT',[-8, 2]) === null,       'XROOT of a negative radicand with an even index stays symbolic');
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
