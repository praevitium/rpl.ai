import Decimal from '../www/src/vendor/decimal.js/decimal.mjs';
import { Stack } from '../www/src/rpl/stack.js';
import { lookup } from '../www/src/rpl/ops.js';
import {
  Real, Integer, BinaryInteger, Complex, Name, Str, Directory, Program, Tagged,
  RList, Vector, Matrix, Rational,
  isReal, isInteger, isBinaryInteger, isComplex, isDirectory, isProgram, isName,
  isString,
} from '../www/src/rpl/types.js';
import { parseEntry } from '../www/src/rpl/parser.js';
import { format, formatStackTop } from '../www/src/rpl/formatter.js';
import {
  state as calcState, setAngle, cycleAngle, toRadians, fromRadians, ANGLE_MODES,
  setCoordMode, cycleCoordMode, COORD_MODES,
  varStore, varRecall, varList, varPurge, resetHome, currentPath,
  setLastError, clearLastError, getLastError,
  goHome, goUp, goInto, makeSubdir,
  setWordsize, getWordsize, getWordsizeMask,
  setBinaryBase, getBinaryBase, resetBinaryState,
  setApproxMode,
  setComplexMode, getComplexMode, toggleComplexMode,
  getRealMaxExp, setRealMaxExp, resetRealMaxExp,
  REAL_MAX_EXP_DEFAULT, REAL_MAX_EXP_MIN, REAL_MAX_EXP_MAX,
} from '../www/src/rpl/state.js';
import { clampStackScroll, computeMenuPage } from '../www/src/ui/paging.js';
import { assert, assertThrows } from './helpers.mjs';

/* Numerics: basic arithmetic, complex, SQRT, stack ops, parser+format basics,
   trig, angle modes, R↔D, div-by-zero, FLOOR/CEIL/IP/FP/SIGN/MOD/MIN/MAX. */

// Basic push + arithmetic
{
  const s = new Stack();
  s.push(Real(2));
  s.push(Real(3));
  lookup('+').fn(s);
  assert(s.depth === 1 && isReal(s.peek()) && s.peek().value.eq(5), '2 3 + = 5');
}

// Integer arithmetic stays integer until forced
{
  const s = new Stack();
  s.push(Integer(10));
  s.push(Integer(3));
  lookup('*').fn(s);
  assert(s.depth === 1 && isInteger(s.peek()) && s.peek().value === 30n, '10 3 * = 30 (int)');
}

// Integer div that doesn't divide evenly -> Real (under APPROX mode).
// The default boot mode is EXACT, under which 10 3 / becomes
// Symbolic('10/3').  This test explicitly opts into APPROX to exercise
// the Integer → Real fall-through for non-clean division.
{
  setApproxMode(true);
  const s = new Stack();
  s.push(Integer(10));
  s.push(Integer(3));
  lookup('/').fn(s);
  assert(s.depth === 1 && isReal(s.peek()), '10 3 / -> Real (APPROX)');
  setApproxMode(false);
}

// Complex arithmetic
{
  const s = new Stack();
  s.push(Complex(1, 2));
  s.push(Complex(3, 4));
  lookup('*').fn(s);
  const v = s.peek();
  assert(isComplex(v) && v.re === -5 && v.im === 10, '(1,2)*(3,4) = (-5,10)');
}

// SQRT of negative -> complex
{
  const s = new Stack();
  s.push(Real(-4));
  lookup('SQRT').fn(s);
  const v = s.peek();
  assert(isComplex(v) && Math.abs(v.re) < 1e-10 && Math.abs(v.im - 2) < 1e-10,
         'SQRT(-4) = (0, 2)');
}

// Stack ops
{
  const s = new Stack();
  s.pushMany([Real(1), Real(2), Real(3)]);
  lookup('SWAP').fn(s);
  assert(s.peek(1).value.eq(2) && s.peek(2).value.eq(3), 'SWAP');
  lookup('DROP').fn(s);
  assert(s.peek(1).value.eq(3), 'DROP');
  lookup('DUP').fn(s);
  assert(s.depth === 3 && s.peek(1).value.eq(3) && s.peek(2).value.eq(3), 'DUP');
}

// Parser: integer, real, complex, list
{
  const vs = parseEntry('42 3.14 (1,2) { 10 20 }');
  assert(vs.length === 4, 'parse 4 items');
  assert(isInteger(vs[0]) && vs[0].value === 42n, 'integer token');
  assert(isReal(vs[1]) && Math.abs(vs[1].value - 3.14) < 1e-12, 'real token');
  assert(isComplex(vs[2]) && vs[2].re === 1 && vs[2].im === 2, 'complex token');
  assert(vs[3].type === 'list' && vs[3].items.length === 2, 'list tokens');
}

// Format a few values
{
  assert(format(Real(3.14)) === '3.14', 'format real');
  assert(format(Integer(42)) === '42', 'format int');
  // In EXACT + STD, integer-valued Complex components drop the trailing
  // dot so `(1, 2)` displays as `(1, 2)` rather than `(1., 2.)`.
  // Non-integer components still show the real form.
  assert(format(Complex(1, 2)) === '(1, 2)', 'format complex — integer components (EXACT/STD)');
  assert(format(Complex(1.5, 2)) === '(1.5, 2)', 'format complex — mixed components');
  assert(format(Complex(1.5, 2.5)) === '(1.5, 2.5)', 'format complex — real components');
}

// Trig — default mode is RAD
{
  setAngle('RAD');
  const s = new Stack();
  s.push(Real(0));
  lookup('SIN').fn(s);
  assert(Math.abs(s.peek().value) < 1e-15, 'SIN(0) = 0');
}

// Angle-mode: DEG
{
  setAngle('DEG');
  assert(calcState.angle === 'DEG', 'setAngle(DEG) writes state');
  const s = new Stack();
  s.push(Real(90));
  lookup('SIN').fn(s);
  assert(Math.abs(s.peek().value - 1) < 1e-12, 'SIN(90) in DEG = 1');
}

// Angle-mode: RAD
{
  setAngle('RAD');
  const s = new Stack();
  s.push(Real(Math.PI / 2));
  lookup('SIN').fn(s);
  assert(Math.abs(s.peek().value - 1) < 1e-12, 'SIN(pi/2) in RAD = 1');
}

// Angle-mode: GRD (400 grad per full turn; 100 grad == 90°)
{
  setAngle('GRD');
  const s = new Stack();
  s.push(Real(100));
  lookup('SIN').fn(s);
  assert(Math.abs(s.peek().value - 1) < 1e-12, 'SIN(100) in GRD = 1');
}

// Inverse trig returns angle in current mode
{
  setAngle('DEG');
  const s = new Stack();
  s.push(Real(1));
  lookup('ASIN').fn(s);
  assert(Math.abs(s.peek().value - 90) < 1e-12, 'ASIN(1) in DEG = 90');
}
{
  setAngle('RAD');
  const s = new Stack();
  s.push(Real(1));
  lookup('ASIN').fn(s);
  assert(Math.abs(s.peek().value - Math.PI / 2) < 1e-12, 'ASIN(1) in RAD = pi/2');
}

// DEG/RAD/GRD ops set the mode from RPL code
{
  setAngle('RAD');
  const s = new Stack();
  lookup('DEG').fn(s);
  assert(calcState.angle === 'DEG', 'DEG op sets angle to DEG');
  lookup('GRD').fn(s);
  assert(calcState.angle === 'GRD', 'GRD op sets angle to GRD');
  lookup('GRAD').fn(s);           // alias
  assert(calcState.angle === 'GRD', 'GRAD alias sets angle to GRD');
  lookup('RAD').fn(s);
  assert(calcState.angle === 'RAD', 'RAD op sets angle back to RAD');
}

// cycleAngle: RAD -> DEG -> GRD -> RAD
{
  setAngle('RAD');
  cycleAngle(); assert(calcState.angle === 'DEG', 'cycle RAD -> DEG');
  cycleAngle(); assert(calcState.angle === 'GRD', 'cycle DEG -> GRD');
  cycleAngle(); assert(calcState.angle === 'RAD', 'cycle GRD -> RAD');
}

// session397: the ANGLE_MODES frozen list + setAngle's normalize/reject/no-op
// arms were unpinned, while the sibling COORD_MODES got that via session349
// just below. cycleAngle's order is pinned above, but nothing tied it to the
// constant, showed the list frozen, or exercised setAngle's uppercase
// normalization and unknown-mode reject. Guards a refactor that reorders
// ANGLE_MODES, drops the freeze, or changes setAngle's normalize/reject guard.
{
  assert(JSON.stringify(ANGLE_MODES) === '["RAD","DEG","GRD"]',
    'ANGLE_MODES order is RAD, DEG, GRD');
  assert(Object.isFrozen(ANGLE_MODES), 'ANGLE_MODES is frozen');
  setAngle('deg');
  assert(calcState.angle === 'DEG', 'setAngle upper-cases its argument');
  let threw = false;
  try { setAngle('BOGUS'); } catch (e) { threw = e.message; }
  assert(threw === 'Unknown angle mode: BOGUS', 'setAngle rejects an unknown mode');
  assert(calcState.angle === 'DEG', 'rejected setAngle leaves angle unchanged');
  setAngle('RAD');
}

// session349: cycleCoordMode's JSDoc-documented RECT -> CYLIN -> SPHERE -> RECT
// cycle (state.js ~254) was unpinned, while its sibling cycleAngle's order is
// pinned just above. Also pin setCoordMode's normalize/reject/no-op arms,
// symmetric with setAngle. Guards a refactor that reorders COORD_MODES or
// drops the modulo wrap / uppercase normalization / unknown-mode guard.
{
  assert(JSON.stringify(COORD_MODES) === '["RECT","CYLIN","SPHERE"]',
    'COORD_MODES order is RECT, CYLIN, SPHERE');
  assert(Object.isFrozen(COORD_MODES), 'COORD_MODES is frozen');
  setCoordMode('RECT');
  cycleCoordMode(); assert(calcState.coordMode === 'CYLIN', 'cycle RECT -> CYLIN');
  cycleCoordMode(); assert(calcState.coordMode === 'SPHERE', 'cycle CYLIN -> SPHERE');
  cycleCoordMode(); assert(calcState.coordMode === 'RECT', 'cycle SPHERE -> RECT (wrap)');
  setCoordMode('cylin');
  assert(calcState.coordMode === 'CYLIN', 'setCoordMode upper-cases its argument');
  let threw = false;
  try { setCoordMode('BOGUS'); } catch (e) { threw = e.message; }
  assert(threw === 'Unknown coordinate mode: BOGUS', 'setCoordMode rejects an unknown mode');
  assert(calcState.coordMode === 'CYLIN', 'rejected setCoordMode leaves coordMode unchanged');
  setCoordMode('RECT');
}

// toRadians / fromRadians honor current state
{
  setAngle('DEG');
  assert(Math.abs(toRadians(180) - Math.PI) < 1e-12, 'toRadians(180 DEG) = pi');
  assert(Math.abs(fromRadians(Math.PI) - 180) < 1e-12, 'fromRadians(pi) = 180 DEG');
  setAngle('GRD');
  assert(Math.abs(toRadians(200) - Math.PI) < 1e-12, 'toRadians(200 GRD) = pi');
  setAngle('RAD');
  assert(toRadians(1.25) === 1.25, 'toRadians passthrough in RAD');
}

// Explicit converters R->D and D->R ignore current mode
{
  setAngle('GRD');        // make sure these ops do not use the mode
  const s = new Stack();
  s.push(Real(Math.PI));
  lookup('R->D').fn(s);
  assert(Math.abs(s.peek().value - 180) < 1e-12, 'R->D converts regardless of mode');
  s.clear();
  s.push(Real(180));
  lookup('D->R').fn(s);
  assert(Math.abs(s.peek().value - Math.PI) < 1e-12, 'D->R converts regardless of mode');
  setAngle('RAD');        // leave tests in a clean state
}

// Division by zero
{
  const s = new Stack();
  s.push(Real(1));
  s.push(Real(0));
  assertThrows(() => { lookup('/').fn(s); }, null, '1/0 throws');
}


// FLOOR / CEIL / IP / FP / SIGN / MOD / MIN / MAX

// FLOOR / CEIL / IP / FP on reals
{
  const s = new Stack();
  s.push(Real(-1.2));
  lookup('FLOOR').fn(s);
  assert(isReal(s.peek()) && s.peek().value.eq(-2), 'FLOOR(-1.2) = -2');
  s.clear();
  s.push(Real(-1.2));
  lookup('CEIL').fn(s);
  assert(isReal(s.peek()) && s.peek().value.eq(-1), 'CEIL(-1.2) = -1');
  s.clear();
  s.push(Real(-1.8));
  lookup('IP').fn(s);
  assert(isReal(s.peek()) && s.peek().value.eq(-1), 'IP(-1.8) = -1 (truncate toward 0)');
  s.clear();
  s.push(Real(1.8));
  lookup('FP').fn(s);
  assert(isReal(s.peek()) && Math.abs(s.peek().value - 0.8) < 1e-12, 'FP(1.8) ≈ 0.8');
  s.clear();
  s.push(Real(-1.8));
  lookup('FP').fn(s);
  assert(isReal(s.peek()) && Math.abs(s.peek().value - (-0.8)) < 1e-12,
         'FP(-1.8) ≈ -0.8 (matches sign of input)');
}

// FLOOR / CEIL on integers are identity; FP on integer is 0n.
{
  const s = new Stack();
  s.push(Integer(42));
  lookup('FLOOR').fn(s);
  assert(isInteger(s.peek()) && s.peek().value === 42n,
         'FLOOR(Integer(42)) = Integer(42) (identity)');
  s.clear();
  s.push(Integer(42));
  lookup('FP').fn(s);
  assert(isInteger(s.peek()) && s.peek().value === 0n,
         'FP(Integer(42)) = Integer(0n)');
}

// SIGN — real, integer, complex, zero
{
  const s = new Stack();
  s.push(Real(-7.5));
  lookup('SIGN').fn(s);
  assert(isReal(s.peek()) && s.peek().value.eq(-1), 'SIGN(-7.5) = -1');
  s.clear();
  s.push(Real(0));
  lookup('SIGN').fn(s);
  assert(isReal(s.peek()) && s.peek().value.eq(0), 'SIGN(0) = 0');
  s.clear();
  s.push(Integer(42));
  lookup('SIGN').fn(s);
  assert(isInteger(s.peek()) && s.peek().value === 1n, 'SIGN(Integer(42)) = 1');
  s.clear();
  s.push(Complex(3, 4));
  lookup('SIGN').fn(s);
  const v = s.peek();
  assert(isComplex(v) && Math.abs(v.re - 0.6) < 1e-12 && Math.abs(v.im - 0.8) < 1e-12,
         'SIGN(3+4i) = (0.6, 0.8) unit vector');
}

// MOD — HP50 convention: sign of divisor
{
  const s = new Stack();
  s.pushMany([Real(-7), Real(3)]);
  lookup('MOD').fn(s);
  assert(isReal(s.peek()) && s.peek().value.eq(2), '-7 3 MOD = 2 (sign of divisor)');
  s.clear();
  s.pushMany([Real(7), Real(-3)]);
  lookup('MOD').fn(s);
  assert(isReal(s.peek()) && s.peek().value.eq(-2), '7 -3 MOD = -2 (sign of divisor)');
  s.clear();
  s.pushMany([Integer(-7), Integer(3)]);
  lookup('MOD').fn(s);
  assert(isInteger(s.peek()) && s.peek().value === 2n,
         'Integer -7 3 MOD = Integer 2 (integer-preserving)');
  s.clear();
  s.pushMany([Real(10), Real(0)]);
  assertThrows(() => { lookup('MOD').fn(s); }, null, 'MOD by 0 throws "Infinite result"');
}

// MIN / MAX
{
  const s = new Stack();
  s.pushMany([Real(5), Real(9)]);
  lookup('MIN').fn(s);
  assert(s.peek().value.eq(5), 'MIN(5, 9) = 5');
  s.clear();
  s.pushMany([Real(5), Real(9)]);
  lookup('MAX').fn(s);
  assert(s.peek().value.eq(9), 'MAX(5, 9) = 9');
  s.clear();
  s.pushMany([Integer(5), Integer(9)]);
  lookup('MIN').fn(s);
  assert(isInteger(s.peek()) && s.peek().value === 5n,
         'MIN preserves Integer type when both are Integer');
  s.clear();
  s.pushMany([Integer(5), Real(9.5)]);
  lookup('MAX').fn(s);
  assert(isReal(s.peek()) && s.peek().value.eq(9.5),
         'MAX mixed Integer+Real promotes to Real');
}

// session320: mixed Integer/Real operands exercise the else-branch
// Decimal-from-Integer coercion arm of MOD and MIN/MAX. The both-Integer
// case takes the dedicated Integer×Integer branch and the both-Real case
// the isReal arm; only a mixed pair routes one operand through
// `new Decimal(isInteger(v) ? v.value.toString() : …)`. MOD's mixed cases
// had no positive pin (every MOD test was both-Real or both-Integer), and
// MIN/MAX only pinned the left-operand (da) Integer arm via
// MAX(Integer 5, Real 9.5) — the right-operand (db) Integer arm was
// untested. Guards a refactor that drops or narrows that coercion arm.
{
  const s = new Stack();
  s.pushMany([Integer(7), Real(3)]);
  lookup('MOD').fn(s);
  assert(isReal(s.peek()) && s.peek().value.eq(1),
         'session320: Integer 7 Real 3 MOD = Real 1 (db Real, da Integer arm)');
  s.clear();
  s.pushMany([Real(7), Integer(3)]);
  lookup('MOD').fn(s);
  assert(isReal(s.peek()) && s.peek().value.eq(1),
         'session320: Real 7 Integer 3 MOD = Real 1 (db Integer arm)');
  s.clear();
  s.pushMany([Integer(-7), Real(3)]);
  lookup('MOD').fn(s);
  assert(isReal(s.peek()) && s.peek().value.eq(2),
         'session320: Integer -7 Real 3 MOD = Real 2 (sign of divisor, da Integer arm)');
  s.clear();
  s.pushMany([Real(-7), Integer(3)]);
  lookup('MOD').fn(s);
  assert(isReal(s.peek()) && s.peek().value.eq(2),
         'session320: Real -7 Integer 3 MOD = Real 2 (sign of divisor, db Integer arm)');
  s.clear();
  s.pushMany([Real(9.5), Integer(5)]);
  lookup('MIN').fn(s);
  assert(isReal(s.peek()) && s.peek().value.eq(5),
         'session320: Real 9.5 Integer 5 MIN = Real 5 (db Integer arm)');
  s.clear();
  s.pushMany([Real(9.5), Integer(5)]);
  lookup('MAX').fn(s);
  assert(isReal(s.peek()) && s.peek().value.eq(9.5),
         'session320: Real 9.5 Integer 5 MAX = Real 9.5 (db Integer arm, da Real)');
  s.clear();
  s.pushMany([Integer(5), Real(9.5)]);
  lookup('MIN').fn(s);
  assert(isReal(s.peek()) && s.peek().value.eq(5),
         'session320: Integer 5 Real 9.5 MIN = Real 5 (da Integer arm)');
}

// session327: core binary arithmetic (+ - * /) mixed Integer/Real coercion
// arm. A both-Integer pair takes promoteNumericPair's 'integer' kind
// (Integer-preserving) and a both-Real pair its 'real' kind via
// toRealDecimal's isReal arm on both sides — so toRealDecimal's *isInteger*
// arm (`new Decimal(v.value.toString())`) is only exercised when ONE operand
// is Integer and the other Real. Every existing +/-/*// pin was both-Integer,
// both-Real, or Tagged-of-Real; the bare mixed pair (each operand position
// independently) had no positive pin, so the Integer-side coercion arm was
// untested. These guard a refactor that drops or narrows that arm. The result
// is always Real (the mixed pair never returns Integer or Rational).
{
  const s = new Stack();
  s.pushMany([Integer(7), Real(2.5)]);
  lookup('+').fn(s);
  let v = s.peek();
  assert(isReal(v) && v.value.eq(9.5),
         'session327: Integer 7 + Real 2.5 = Real 9.5 (a Integer arm)');

  s.clear();
  s.pushMany([Real(7.5), Integer(2)]);
  lookup('+').fn(s);
  v = s.peek();
  assert(isReal(v) && v.value.eq(9.5),
         'session327: Real 7.5 + Integer 2 = Real 9.5 (b Integer arm)');

  s.clear();
  s.pushMany([Integer(7), Real(2.5)]);
  lookup('-').fn(s);
  v = s.peek();
  assert(isReal(v) && v.value.eq(4.5),
         'session327: Integer 7 - Real 2.5 = Real 4.5 (a Integer arm)');

  s.clear();
  s.pushMany([Real(7.5), Integer(2)]);
  lookup('-').fn(s);
  v = s.peek();
  assert(isReal(v) && v.value.eq(5.5),
         'session327: Real 7.5 - Integer 2 = Real 5.5 (b Integer arm)');

  s.clear();
  s.pushMany([Integer(7), Real(2.5)]);
  lookup('*').fn(s);
  v = s.peek();
  assert(isReal(v) && v.value.eq(17.5),
         'session327: Integer 7 * Real 2.5 = Real 17.5 (a Integer arm)');

  s.clear();
  s.pushMany([Real(7.5), Integer(2)]);
  lookup('*').fn(s);
  v = s.peek();
  assert(isReal(v) && v.value.eq(15),
         'session327: Real 7.5 * Integer 2 = Real 15 (b Integer arm)');

  s.clear();
  s.pushMany([Integer(7), Real(2.5)]);
  lookup('/').fn(s);
  v = s.peek();
  assert(isReal(v) && v.value.eq(2.8),
         'session327: Integer 7 / Real 2.5 = Real 2.8 (a Integer arm)');

  s.clear();
  s.pushMany([Real(7.5), Integer(2)]);
  lookup('/').fn(s);
  v = s.peek();
  assert(isReal(v) && v.value.eq(3.75),
         'session327: Real 7.5 / Integer 2 = Real 3.75 (b Integer arm)');
}

// session334: core binary arithmetic (+ - * /) Complex-promotion arm. When
// either operand is Complex, promoteNumericPair takes its 'complex' branch and
// runs BOTH operands through toComplex — so the non-Complex operand exercises
// toComplex's per-type arms: isInteger (re = Number(value)), isReal
// (re = value.toNumber()), isRational (re = n/d). The only existing scalar
// complex-arithmetic pin (line ~64) is Complex × Complex, which takes
// toComplex's isComplex arm on both sides; the mixed Integer/Real/Rational ∘
// Complex pairs had no positive pin, so those three coercion arms were
// untested for arithmetic. The result is always Complex (the lattice tops out
// at Complex). These guard a refactor that drops or narrows a toComplex arm.
{
  const s = new Stack();
  // Integer ∘ Complex — both operand positions (toComplex isInteger arm).
  s.pushMany([Integer(2), Complex(3, 4)]);
  lookup('+').fn(s);
  let v = s.peek();
  assert(isComplex(v) && v.re === 5 && v.im === 4,
         'session334: Integer 2 + (3,4) = (5,4) (a isInteger arm → complex)');

  s.clear();
  s.pushMany([Complex(3, 4), Integer(2)]);
  lookup('-').fn(s);
  v = s.peek();
  assert(isComplex(v) && v.re === 1 && v.im === 4,
         'session334: (3,4) - Integer 2 = (1,4) (b isInteger arm → complex)');

  s.clear();
  s.pushMany([Integer(2), Complex(3, 4)]);
  lookup('*').fn(s);
  v = s.peek();
  assert(isComplex(v) && v.re === 6 && v.im === 8,
         'session334: Integer 2 * (3,4) = (6,8) (a isInteger arm → complex)');

  s.clear();
  s.pushMany([Integer(2), Complex(1, 1)]);
  lookup('/').fn(s);
  v = s.peek();
  assert(isComplex(v) && Math.abs(v.re - 1) < 1e-12 && Math.abs(v.im + 1) < 1e-12,
         'session334: Integer 2 / (1,1) = (1,-1) (a isInteger arm → complex)');

  // Real ∘ Complex — both operand positions (toComplex isReal arm).
  s.clear();
  s.pushMany([Real(2.5), Complex(3, 4)]);
  lookup('+').fn(s);
  v = s.peek();
  assert(isComplex(v) && v.re === 5.5 && v.im === 4,
         'session334: Real 2.5 + (3,4) = (5.5,4) (a isReal arm → complex)');

  s.clear();
  s.pushMany([Complex(3, 4), Real(0.5)]);
  lookup('*').fn(s);
  v = s.peek();
  assert(isComplex(v) && v.re === 1.5 && v.im === 2,
         'session334: (3,4) * Real 0.5 = (1.5,2) (b isReal arm → complex)');

  // Rational ∘ Complex — both operand positions (toComplex isRational arm).
  s.clear();
  s.pushMany([Rational(1n, 2n), Complex(3, 4)]);
  lookup('+').fn(s);
  v = s.peek();
  assert(isComplex(v) && v.re === 3.5 && v.im === 4,
         'session334: Rational 1/2 + (3,4) = (3.5,4) (a isRational arm → complex)');

  s.clear();
  s.pushMany([Complex(3, 4), Rational(1n, 2n)]);
  lookup('*').fn(s);
  v = s.peek();
  assert(isComplex(v) && v.re === 1.5 && v.im === 2,
         'session334: (3,4) * Rational 1/2 = (1.5,2) (b isRational arm → complex)');
}

// Complex rejected by MOD / MIN / MAX
{
  const s = new Stack();
  s.pushMany([Complex(1, 1), Complex(2, 2)]);
  assertThrows(() => { lookup('MOD').fn(s); }, null, 'MOD rejects complex arguments');
  s.clear();
  s.pushMany([Complex(1, 1), Complex(2, 2)]);
  assertThrows(() => { lookup('MIN').fn(s); }, null, 'MIN rejects complex arguments');
}

/* ==================================================================
   Additional stack ops, complex decomposition, real decomposition
   (XPON/MANT), stable log/exp (LNP1/EXPM), rounding (RND/TRNC),
   percent family (%/%T/%CH).
   ================================================================== */

{
  const s = new Stack();
  s.push(Real(1)); s.push(Real(2)); s.push(Real(3));
  s.push(Integer(2));
  lookup('DUPN').fn(s);
  assert(s.depth === 5
      && s.peek(5).value.eq(1) && s.peek(4).value.eq(2) && s.peek(3).value.eq(3)
      && s.peek(2).value.eq(2) && s.peek(1).value.eq(3),
    'session043: 1 2 3 2 DUPN → 1 2 3 2 3');
}
{
  // 0 DUPN is a no-op
  const s = new Stack();
  s.push(Real(7)); s.push(Integer(0));
  lookup('DUPN').fn(s);
  assert(s.depth === 1 && s.peek(1).value.eq(7),
    'session043: 0 DUPN is a no-op (count consumed, nothing duplicated)');
}
{
  // Negative count rejected
  const s = new Stack();
  s.push(Real(1)); s.push(Integer(-1));
  assertThrows(() => { lookup('DUPN').fn(s); }, /Bad argument value/, 'session043: DUPN with negative count → Bad argument value');
}
{
  // Not enough items for requested count
  const s = new Stack();
  s.push(Real(1)); s.push(Integer(5));
  assertThrows(() => { lookup('DUPN').fn(s); }, /Too few/, 'session043: DUPN where depth < count → Too few arguments');
}

{
  const s = new Stack();
  s.push(Real(42));
  lookup('DUPDUP').fn(s);
  assert(s.depth === 3 && s.peek(1).value.eq(42) && s.peek(2).value.eq(42) && s.peek(3).value.eq(42),
    'session043: DUPDUP 42 → 42 42 42');
}
{
  const s = new Stack();
  assertThrows(() => { lookup('DUPDUP').fn(s); }, /Too few/, 'session043: DUPDUP on empty stack → Too few arguments');
}

{
  const s = new Stack();
  s.push(Real(1)); s.push(Real(2)); s.push(Real(3));
  lookup('NIP').fn(s);
  assert(s.depth === 2 && s.peek(1).value.eq(3) && s.peek(2).value.eq(1),
    'session043: 1 2 3 NIP → 1 3 (drops former level 2)');
}
{
  const s = new Stack();
  s.push(Real(1));
  assertThrows(() => { lookup('NIP').fn(s); }, /Too few/, 'session043: NIP with depth 1 → Too few arguments');
}

{
  const s = new Stack();
  s.push(Real(10)); s.push(Real(20)); s.push(Real(30));
  lookup('PICK3').fn(s);
  assert(s.depth === 4 && s.peek(1).value.eq(10),
    'session043: PICK3 ≡ 3 PICK (no explicit arg)');
}

{
  const s = new Stack();
  s.push(Real(1)); s.push(Real(2)); s.push(Real(3));
  s.push(Integer(3));
  lookup('ROLL').fn(s);
  assert(s.peek(3).value.eq(2) && s.peek(2).value.eq(3) && s.peek(1).value.eq(1),
    'session043: 1 2 3 3 ROLL → 2 3 1');
}
{
  // 1 ROLL is a no-op
  const s = new Stack();
  s.push(Real(1)); s.push(Real(2)); s.push(Integer(1));
  lookup('ROLL').fn(s);
  assert(s.depth === 2 && s.peek(1).value.eq(2) && s.peek(2).value.eq(1),
    'session043: 1 ROLL is a no-op');
}
{
  // 0 ROLL is a no-op (count consumed)
  const s = new Stack();
  s.push(Real(1)); s.push(Real(2)); s.push(Integer(0));
  lookup('ROLL').fn(s);
  assert(s.depth === 2 && s.peek(1).value.eq(2),
    'session043: 0 ROLL is a no-op');
}
{
  // Too few
  const s = new Stack();
  s.push(Real(1)); s.push(Integer(5));
  assertThrows(() => { lookup('ROLL').fn(s); }, /Too few/, 'session043: ROLL with depth < count → Too few arguments');
}

{
  const s = new Stack();
  s.push(Real(1)); s.push(Real(2)); s.push(Real(3));
  s.push(Integer(3));
  lookup('ROLLD').fn(s);
  // Inverse of ROLL: 3 1 2
  assert(s.peek(3).value.eq(3) && s.peek(2).value.eq(1) && s.peek(1).value.eq(2),
    'session043: 1 2 3 3 ROLLD → 3 1 2');
}
{
  // ROLL then ROLLD round-trip
  const s = new Stack();
  s.push(Real(1)); s.push(Real(2)); s.push(Real(3)); s.push(Real(4));
  s.push(Integer(4));
  lookup('ROLL').fn(s);
  s.push(Integer(4));
  lookup('ROLLD').fn(s);
  assert(s.depth === 4 && s.peek(4).value.eq(1) && s.peek(3).value.eq(2)
      && s.peek(2).value.eq(3) && s.peek(1).value.eq(4),
    'session043: n ROLL then n ROLLD round-trips');
}

{
  const s = new Stack();
  s.push(Real(1)); s.push(Real(2)); s.push(Real(3));
  s.push(Real(99)); s.push(Integer(3));
  lookup('UNPICK').fn(s);
  // Writes 99 at level 3 of remaining stack (1 2 3): now 99 2 3
  assert(s.depth === 3 && s.peek(3).value.eq(99) && s.peek(2).value.eq(2) && s.peek(1).value.eq(3),
    'session043: 1 2 3 99 3 UNPICK → 99 2 3');
}
{
  // UNPICK pairs with PICK
  const s = new Stack();
  s.push(Real(10)); s.push(Real(20)); s.push(Real(30));
  s.push(Integer(2));
  lookup('PICK').fn(s);
  assert(s.peek(1).value.eq(20), 'session043: PICK setup');
  // Now: 10 20 30 20 — write back at level 3 (level 2 after the PICK consume)
  s.push(Integer(3));
  lookup('UNPICK').fn(s);
  assert(s.depth === 3 && s.peek(3).value.eq(20) && s.peek(2).value.eq(20) && s.peek(1).value.eq(30),
    'session043: PICK then UNPICK writes the value back');
}
{
  // Bad index
  const s = new Stack();
  s.push(Real(1)); s.push(Real(99)); s.push(Integer(0));
  assertThrows(() => { lookup('UNPICK').fn(s); }, /Bad argument value/, 'session043: UNPICK with level 0 → Bad argument value');
}

{
  const s = new Stack();
  s.push(Real(7)); s.push(Integer(3));
  lookup('NDUPN').fn(s);
  assert(s.depth === 4
      && s.peek(4).value.eq(7) && s.peek(3).value.eq(7) && s.peek(2).value.eq(7)
      && s.peek(1).value === 3n,
    'session043: 7 3 NDUPN → 7 7 7 3');
}
{
  const s = new Stack();
  s.push(Real(42)); s.push(Integer(0));
  lookup('NDUPN').fn(s);
  // x 0 NDUPN → 0  (x consumed, 0 pushed back)
  assert(s.depth === 1 && s.peek(1).value === 0n,
    'session043: x 0 NDUPN consumes x and pushes 0');
}

/* ==================================================================
   Complex decomposition: C→R and R→C (and ASCII aliases C->R / R->C)
   ================================================================== */
{
  const s = new Stack();
  s.push(Real(3)); s.push(Real(4));
  lookup('R→C').fn(s);
  assert(s.depth === 1 && isComplex(s.peek(1)) && s.peek(1).re === 3 && s.peek(1).im === 4,
    'session043: 3 4 R→C → (3,4)');
}
{
  // ASCII alias
  const s = new Stack();
  s.push(Integer(5)); s.push(Integer(6));
  lookup('R->C').fn(s);
  assert(isComplex(s.peek(1)) && s.peek(1).re === 5 && s.peek(1).im === 6,
    'session043: ASCII R->C accepts integer components');
}
{
  const s = new Stack();
  s.push(Complex(3, 4));
  lookup('C→R').fn(s);
  assert(s.depth === 2 && isReal(s.peek(2)) && isReal(s.peek(1))
      && s.peek(2).value.eq(3) && s.peek(1).value.eq(4),
    'session043: (3,4) C→R → 3 4 (re on L2, im on L1)');
}
{
  // Round-trip
  const s = new Stack();
  s.push(Complex(2.5, -1.5));
  lookup('C→R').fn(s);
  lookup('R→C').fn(s);
  assert(isComplex(s.peek(1)) && s.peek(1).re === 2.5 && s.peek(1).im === -1.5,
    'session043: C→R then R→C round-trip preserves components');
}
{
  // C→R on Real: HP50 permits — pushes value and 0
  const s = new Stack();
  s.push(Real(7));
  lookup('C→R').fn(s);
  assert(s.depth === 2 && s.peek(2).value.eq(7) && s.peek(1).value.eq(0),
    'session043: C→R on Real x → x 0');
}
{
  // R→C with bad types
  const s = new Stack();
  s.push(Str('bad')); s.push(Real(3));
  assertThrows(() => { lookup('R→C').fn(s); }, /Bad argument type/, 'session043: R→C with String operand → Bad argument type');
}
{
  // Vector branch: two real vectors → complex vector
  const s = new Stack();
  s.push(Vector([Real(1), Real(2)]));
  s.push(Vector([Real(3), Real(4)]));
  lookup('R→C').fn(s);
  const v = s.peek(1);
  assert(v.type === 'vector' && v.items.length === 2
      && v.items[0].type === 'complex' && v.items[0].re === 1 && v.items[0].im === 3
      && v.items[1].type === 'complex' && v.items[1].re === 2 && v.items[1].im === 4,
    'session043: R→C on two real vectors → complex vector');
}
{
  // Mismatched vector lengths → Invalid dimension
  const s = new Stack();
  s.push(Vector([Real(1), Real(2)]));
  s.push(Vector([Real(3)]));
  assertThrows(() => { lookup('R→C').fn(s); }, /Invalid dimension/, 'session043: R→C on mismatched vectors → Invalid dimension');
}
{
  // C→R on vector of complex → two real vectors
  const s = new Stack();
  s.push(Vector([Complex(1, 2), Complex(3, 4)]));
  lookup('C→R').fn(s);
  assert(s.depth === 2
      && s.peek(2).items[0].value.eq(1) && s.peek(2).items[1].value.eq(3)
      && s.peek(1).items[0].value.eq(2) && s.peek(1).items[1].value.eq(4),
    'session043: C→R on complex vector → real-part vector, imag-part vector');
}
{
  // session404: close the C→R/R→C rejection-symmetry gap.  session043 pinned
  // only R→C's String reject; C→R's canonical Bad-argument-type throw was
  // unpinned, and the ASCII aliases C->R / R->C had happy-path-only coverage.
  // Both alias pairs share the canonical fn instance, so they reject identically.
  assert(lookup('R->C').fn === lookup('R→C').fn, 'session404: R->C shares the R→C fn instance');
  assert(lookup('C->R').fn === lookup('C→R').fn, 'session404: C->R shares the C→R fn instance');

  // C→R: the missing canonical sibling reject (non-Complex/Real/Integer/Vector).
  const s1 = new Stack();
  s1.push(Str('x'));
  assertThrows(() => { lookup('C→R').fn(s1); }, /Bad argument type/, 'session404: C→R on String → Bad argument type');

  // C→R vector branch: a non-Complex/Real/Integer element trips the inner guard.
  const s2 = new Stack();
  s2.push(Vector([Str('x')]));
  assertThrows(() => { lookup('C→R').fn(s2); }, /Bad argument type/, 'session404: C→R on vector of String → Bad argument type');

  // ASCII alias C->R rejects identically.
  const s3 = new Stack();
  s3.push(Str('x'));
  assertThrows(() => { lookup('C->R').fn(s3); }, /Bad argument type/, 'session404: ASCII C->R on String → Bad argument type');

  // ASCII alias R->C rejects a String operand (mirrors R→C's session043 pin).
  const s4 = new Stack();
  s4.push(Str('x')); s4.push(Real(3));
  assertThrows(() => { lookup('R->C').fn(s4); }, /Bad argument type/, 'session404: ASCII R->C with String operand → Bad argument type');
}

/* ==================================================================
   XPON / MANT — mantissa/exponent decomposition of Reals
   ================================================================== */
{
  const s = new Stack();
  s.push(Real(1234.5));
  lookup('XPON').fn(s);
  assert(isReal(s.peek(1)) && s.peek(1).value.eq(3),
    'session043: XPON 1234.5 → 3');
}
{
  const s = new Stack();
  s.push(Real(1234.5));
  lookup('MANT').fn(s);
  assert(Math.abs(s.peek(1).value - 1.2345) < 1e-12,
    'session043: MANT 1234.5 → 1.2345');
}
{
  const s = new Stack();
  s.push(Real(0));
  lookup('XPON').fn(s);
  assert(s.peek(1).value.eq(0), 'session043: XPON 0 → 0');
  s.clear();
  s.push(Real(0));
  lookup('MANT').fn(s);
  assert(s.peek(1).value.eq(0), 'session043: MANT 0 → 0');
}
{
  const s = new Stack();
  s.push(Real(-0.05));
  lookup('XPON').fn(s);
  assert(s.peek(1).value.eq(-2), 'session043: XPON -0.05 → -2');
  s.clear();
  s.push(Real(-0.05));
  lookup('MANT').fn(s);
  assert(Math.abs(s.peek(1).value - (-5)) < 1e-12,
    'session043: MANT -0.05 → -5 (negative mantissa for negative input)');
}
{
  // Integer input → coerces to real
  const s = new Stack();
  s.push(Integer(500n));
  lookup('XPON').fn(s);
  assert(s.peek(1).value.eq(2), 'session043: XPON Integer 500 → 2');
}
{
  // session285: MANT Z-column ✓ cell was backed only by Real operands —
  // XPON had a bare-Integer pin (above) but MANT did not. Pin the integer
  // arm directly so a refactor degrading Z→Real-only on MANT is caught.
  const s = new Stack();
  s.push(Integer(500n));
  lookup('MANT').fn(s);
  assert(isReal(s.peek(1)) && s.peek(1).value.eq(5),
    'session285: MANT Integer 500 → 5');
  s.clear();
  s.push(Integer(86000n));
  lookup('MANT').fn(s);
  assert(isReal(s.peek(1)) && Math.abs(s.peek(1).value - 8.6) < 1e-12,
    'session285: MANT Integer 86000 → 8.6 (non-trivial mantissa)');
  s.clear();
  s.push(Integer(86000n));
  lookup('XPON').fn(s);
  assert(isReal(s.peek(1)) && s.peek(1).value.eq(4),
    'session285: XPON Integer 86000 → 4 (>1-digit exponent on Integer)');
}
{
  // Bad type
  const s = new Stack();
  s.push(Str('nope'));
  assertThrows(() => { lookup('XPON').fn(s); }, /Bad argument type/, 'session043: XPON on String → Bad argument type');
}

/* ==================================================================
   LNP1 / EXPM — numerically stable log1p / expm1
   ================================================================== */
{
  const s = new Stack();
  s.push(Real(1e-20));
  lookup('LNP1').fn(s);
  // Plain LN(1+1e-20) loses all digits; log1p gives the true value.
  assert(Math.abs(s.peek(1).value - 1e-20) < 1e-30,
    'session043: LNP1 1e-20 is exact (log1p precision)');
}
{
  const s = new Stack();
  s.push(Real(0));
  lookup('LNP1').fn(s);
  assert(s.peek(1).value.eq(0), 'session043: LNP1 0 → 0');
}
{
  // Domain boundary x <= -1 → Infinite result
  const s = new Stack();
  s.push(Real(-1));
  assertThrows(() => { lookup('LNP1').fn(s); }, /Infinite result/, 'session043: LNP1 -1 → Infinite result');
}
{
  const s = new Stack();
  s.push(Real(1e-20));
  lookup('EXPM').fn(s);
  assert(Math.abs(s.peek(1).value - 1e-20) < 1e-30,
    'session043: EXPM 1e-20 is exact (expm1 precision)');
}
{
  const s = new Stack();
  s.push(Real(0));
  lookup('EXPM').fn(s);
  assert(s.peek(1).value.eq(0), 'session043: EXPM 0 → 0');
}
{
  // Inverse pairing: LNP1 ∘ EXPM ≈ identity near 0
  const s = new Stack();
  s.push(Real(0.25));
  lookup('EXPM').fn(s);
  lookup('LNP1').fn(s);
  assert(Math.abs(s.peek(1).value - 0.25) < 1e-15,
    'session043: EXPM then LNP1 round-trips 0.25');
}

/* ==================================================================
   RND / TRNC — round and truncate
   ================================================================== */
{
  const s = new Stack();
  s.push(Real(3.14159)); s.push(Integer(2));
  lookup('RND').fn(s);
  assert(Math.abs(s.peek(1).value - 3.14) < 1e-12,
    'session043: 3.14159 2 RND → 3.14');
}
{
  // Half-away-from-zero
  const s = new Stack();
  s.push(Real(2.5)); s.push(Integer(0));
  lookup('RND').fn(s);
  assert(s.peek(1).value.eq(3), 'session043: 2.5 0 RND → 3 (half-away-from-zero)');
  s.clear();
  s.push(Real(-2.5)); s.push(Integer(0));
  lookup('RND').fn(s);
  assert(s.peek(1).value.eq(-3), 'session043: -2.5 0 RND → -3');
}
{
  const s = new Stack();
  s.push(Real(3.19)); s.push(Integer(1));
  lookup('TRNC').fn(s);
  assert(Math.abs(s.peek(1).value - 3.1) < 1e-12,
    'session043: 3.19 1 TRNC → 3.1');
  s.clear();
  s.push(Real(-3.19)); s.push(Integer(1));
  lookup('TRNC').fn(s);
  assert(Math.abs(s.peek(1).value - (-3.1)) < 1e-12,
    'session043: -3.19 1 TRNC → -3.1 (toward zero)');
}
{
  // Significant-figure rounding (negative count)
  const s = new Stack();
  s.push(Real(12345)); s.push(Integer(-3));
  lookup('RND').fn(s);
  // 3 sig figs of 12345 → 12300
  assert(s.peek(1).value.eq(12300), 'session043: 12345 -3 RND → 12300 (3 sig figs)');
}
{
  // Complex input rounds each component
  const s = new Stack();
  s.push(Complex(3.14159, 2.71828)); s.push(Integer(2));
  lookup('RND').fn(s);
  const v = s.peek(1);
  assert(isComplex(v) && Math.abs(v.re - 3.14) < 1e-12 && Math.abs(v.im - 2.72) < 1e-12,
    'session043: RND on Complex rounds each component');
}
{
  // Out-of-range precision throws
  const s = new Stack();
  s.push(Real(3.14)); s.push(Integer(20));
  assertThrows(() => { lookup('RND').fn(s); }, /Bad argument value/, 'session043: RND with precision > 11 → Bad argument value');
}
{
  // Integer input with non-negative places returns the Integer unchanged
  const s = new Stack();
  s.push(Integer(42n)); s.push(Integer(3));
  lookup('RND').fn(s);
  assert(isInteger(s.peek(1)) && s.peek(1).value === 42n,
    'session043: Integer 42 3 RND → Integer 42 (no change)');
}

/* ==================================================================
   %, %T, %CH — percent family
   ================================================================== */
{
  const s = new Stack();
  s.push(Real(200)); s.push(Real(10));
  lookup('%').fn(s);
  assert(s.peek(1).value.eq(20), 'session043: 200 10 % → 20 (10% of 200)');
}
{
  // Integer/Real mix still works
  const s = new Stack();
  s.push(Integer(50)); s.push(Real(25));
  lookup('%').fn(s);
  assert(s.peek(1).value.eq(12.5), 'session043: 50 25 % → 12.5 (mixed)');
}
{
  const s = new Stack();
  s.push(Real(50)); s.push(Real(20));
  lookup('%T').fn(s);
  assert(s.peek(1).value.eq(40), 'session043: 50 20 %T → 40 (20 is 40% of 50)');
}
{
  const s = new Stack();
  s.push(Real(100)); s.push(Real(125));
  lookup('%CH').fn(s);
  assert(s.peek(1).value.eq(25), 'session043: 100 125 %CH → 25 (25% increase)');
}
{
  // Decrease
  const s = new Stack();
  s.push(Real(100)); s.push(Real(75));
  lookup('%CH').fn(s);
  assert(s.peek(1).value.eq(-25), 'session043: 100 75 %CH → -25 (25% decrease)');
}
{
  // Division by zero in %T
  const s = new Stack();
  s.push(Real(0)); s.push(Real(10));
  assertThrows(() => { lookup('%T').fn(s); }, /Infinite result/, 'session043: 0 10 %T → Infinite result');
}
{
  // Division by zero in %CH
  const s = new Stack();
  s.push(Real(0)); s.push(Real(10));
  assertThrows(() => { lookup('%CH').fn(s); }, /Infinite result/, 'session043: 0 10 %CH → Infinite result');
}
{
  // Symbolic operand lifts
  const s = new Stack();
  s.push(Real(100)); s.push(Name('x', { quoted: true }));
  lookup('%').fn(s);
  assert(s.peek(1).type === 'symbolic', 'session043: 100 \'x\' % → Symbolic');
}

// MAXR / MINR constants and HMS family

// MAXR: largest finite Real — derived from current realMaxExp (default 999)
{
  const s = new Stack();
  lookup('MAXR').fn(s);
  const e = getRealMaxExp();
  assert(isReal(s.peek()) && s.peek().value.eq(new Decimal(`9.99999999999e+${e}`)),
         `session044: MAXR pushes 9.99999999999e+${e}`);
}

// MINR: smallest positive Real — derived from current realMaxExp
{
  const s = new Stack();
  lookup('MINR').fn(s);
  const e = getRealMaxExp();
  assert(isReal(s.peek()) && s.peek().value.eq(new Decimal(`1e-${e}`)),
         `session044: MINR pushes 1e-${e}`);
}

// Default realMaxExp is REAL_MAX_EXP_DEFAULT (999)
assert(getRealMaxExp() === REAL_MAX_EXP_DEFAULT,
       'session044: default realMaxExp is REAL_MAX_EXP_DEFAULT');

// RCMXE pushes current realMaxExp as Integer
{
  const s = new Stack();
  lookup('RCMXE').fn(s);
  assert(s.peek().value === BigInt(REAL_MAX_EXP_DEFAULT),
         'session044: RCMXE pushes REAL_MAX_EXP_DEFAULT');
}

// STMXE stores a new max exponent; MAXR/MINR then reflect it
{
  const s = new Stack();
  s.push(Integer(1234n));
  lookup('STMXE').fn(s);
  assert(getRealMaxExp() === 1234, 'session044: STMXE sets realMaxExp to 1234');
  const s2 = new Stack();
  lookup('MAXR').fn(s2);
  assert(s2.peek().value.eq(new Decimal('9.99999999999e+1234')),
         'session044: MAXR reflects new realMaxExp after STMXE');
  resetRealMaxExp(); // restore default so later tests aren't affected
}

// STMXE with a Real value (e.g. typed as a decimal on the stack)
{
  const s = new Stack();
  s.push(Real(new Decimal('500')));
  lookup('STMXE').fn(s);
  assert(getRealMaxExp() === 500, 'session044: STMXE accepts Real integer value');
  resetRealMaxExp();
}

// STMXE rejects out-of-range value
{
  const s = new Stack();
  s.push(Integer(BigInt(REAL_MAX_EXP_MIN - 1)));
  let threw = false;
  try { lookup('STMXE').fn(s); } catch (e) { threw = true; }
  assert(threw, 'session044: STMXE rejects value below REAL_MAX_EXP_MIN');
  resetRealMaxExp();
}

// session390: REAL_MAX_EXP_* bounds + STMXE/setRealMaxExp reject arms.
// session044 pins only the below-MIN reject (and only that it threw), so the
// constants' values, the *inclusive* MIN/MAX boundaries, the above-MAX reject,
// the non-integer-Real and non-numeric rejects (distinct messages), and
// setRealMaxExp's own range throw were unpinned — the R-022 WORDSIZE pattern
// one constant family over. REAL_MAX_EXP_MAX had zero test callers.
{
  // constants + relationships (REAL_MAX_EXP_MAX was previously unimported)
  assert(REAL_MAX_EXP_MIN === 10, 'session390: REAL_MAX_EXP_MIN is 10');
  assert(REAL_MAX_EXP_MAX === 9e15, 'session390: REAL_MAX_EXP_MAX is 9e15 (decimal.js cap)');
  assert(REAL_MAX_EXP_DEFAULT === 999, 'session390: REAL_MAX_EXP_DEFAULT is 999');
  assert(REAL_MAX_EXP_MIN < REAL_MAX_EXP_DEFAULT && REAL_MAX_EXP_DEFAULT < REAL_MAX_EXP_MAX,
         'session390: MIN < DEFAULT < MAX');

  const stmxe = (v) => { const s = new Stack(); s.push(v); lookup('STMXE').fn(s); };

  // MIN boundary accepted (inclusive), tied to the constant not a literal
  stmxe(Integer(BigInt(REAL_MAX_EXP_MIN)));
  assert(getRealMaxExp() === REAL_MAX_EXP_MIN, 'session390: STMXE accepts REAL_MAX_EXP_MIN unclamped');
  resetRealMaxExp();

  // MAX boundary accepted (inclusive)
  stmxe(Integer(BigInt(REAL_MAX_EXP_MAX)));
  assert(getRealMaxExp() === REAL_MAX_EXP_MAX, 'session390: STMXE accepts REAL_MAX_EXP_MAX unclamped');
  resetRealMaxExp();

  // above MAX rejected — MAX+1 is still a safe integer, so it reaches the
  // range check rather than the integrality check (distinct from MIN-1)
  assert(Number.isInteger(REAL_MAX_EXP_MAX + 1), 'session390: REAL_MAX_EXP_MAX+1 is a safe integer');
  assertThrows(() => stmxe(Integer(BigInt(REAL_MAX_EXP_MAX) + 1n)), 'Bad argument value',
               'session390: STMXE rejects above REAL_MAX_EXP_MAX with Bad argument value');
  resetRealMaxExp();

  // below MIN rejected — pin the message session044 left as a bare threw
  assertThrows(() => stmxe(Integer(BigInt(REAL_MAX_EXP_MIN - 1))), 'Bad argument value',
               'session390: STMXE rejects below REAL_MAX_EXP_MIN with Bad argument value');
  resetRealMaxExp();

  // non-integer Real rejected via the integrality arm (distinct path from range)
  assertThrows(() => stmxe(Real(new Decimal('500.5'))), 'Bad argument value',
               'session390: STMXE rejects non-integer Real with Bad argument value');
  resetRealMaxExp();

  // non-numeric type rejected before the range check — distinct message
  assertThrows(() => stmxe(Str('x')), 'Bad argument type',
               'session390: STMXE rejects non-numeric type with Bad argument type');
  resetRealMaxExp();

  // setRealMaxExp's own range throw — the state.js function-level guard had no
  // direct caller exercising its (distinct) message; reachable past STMXE,
  // which pre-validates and throws its own RPLError first
  assertThrows(() => setRealMaxExp(5),
               /realMaxExp must be an integer in \[10, 9000000000000000\], got 5/,
               'session390: setRealMaxExp rejects below MIN with its range message');
  resetRealMaxExp();
  assertThrows(() => setRealMaxExp(500.5),
               /realMaxExp must be an integer in \[10, 9000000000000000\], got 500.5/,
               'session390: setRealMaxExp rejects non-integer with its range message');
  resetRealMaxExp();
}

// Large-exponent formatting: values beyond IEEE-754 range display correctly
{
  const big = Real(new Decimal('1.23456789012e+500'));
  const str = format(big);
  assert(str === '1.23456789012E500',
         `session044: format 1.23456789012e+500 → '${str}'`);
}
{
  const tiny = Real(new Decimal('1e-500'));
  const str = format(tiny);
  assert(str === '1E-500',
         `session044: format 1e-500 → '${str}'`);
}

// MAXR takes no arguments — depth grows by 1
{
  const s = new Stack();
  s.push(Real(42));
  lookup('MAXR').fn(s);
  assert(s.depth === 2, 'session044: MAXR does not pop');
}


// →HMS of 2.5 hours is 2 h 30 min 0 s → 2.3 exactly
{
  const s = new Stack();
  s.push(Real(2.5));
  lookup('→HMS').fn(s);
  const r = s.peek().value;
  assert(Math.abs(r - 2.3) < 1e-12,
         `session044: 2.5 →HMS → 2.3 (got ${r})`);
}

// →HMS of 1.75 hours is 1 h 45 min 0 s → 1.45
{
  const s = new Stack();
  s.push(Real(1.75));
  lookup('→HMS').fn(s);
  const r = s.peek().value;
  assert(Math.abs(r - 1.45) < 1e-12,
         `session044: 1.75 →HMS → 1.45 (got ${r})`);
}

// HMS→ of 2.3 → 2.5
{
  const s = new Stack();
  s.push(Real(2.3));
  lookup('HMS→').fn(s);
  const r = s.peek().value;
  assert(Math.abs(r - 2.5) < 1e-9,
         `session044: 2.3 HMS→ → 2.5 (got ${r})`);
}

// Round-trip: x →HMS HMS→ ≈ x
{
  const s = new Stack();
  s.push(Real(3.14159265));
  lookup('→HMS').fn(s);
  lookup('HMS→').fn(s);
  const r = s.peek().value;
  assert(Math.abs(r - 3.14159265) < 1e-9,
         `session044: 3.14159265 →HMS HMS→ round-trip (got ${r})`);
}

// Negative hours: sign applies to the whole value
{
  const s = new Stack();
  s.push(Real(-1.5));
  lookup('→HMS').fn(s);
  const r = s.peek().value;
  assert(Math.abs(r - (-1.30)) < 1e-10,
         `session044: -1.5 →HMS → -1.30 (got ${r})`);
}

// HMS+: 1h 45m + 1h 30m = 3h 15m → 3.15 exactly
{
  const s = new Stack();
  s.push(Real(1.45));
  s.push(Real(1.30));
  lookup('HMS+').fn(s);
  const r = s.peek().value;
  assert(Math.abs(r - 3.15) < 1e-9,
         `session044: 1.45 1.30 HMS+ → 3.15 (got ${r})`);
}

// HMS-: 3h 15m - 1h 30m = 1h 45m → 1.45 exactly
{
  const s = new Stack();
  s.push(Real(3.15));
  s.push(Real(1.30));
  lookup('HMS-').fn(s);
  const r = s.peek().value;
  assert(Math.abs(r - 1.45) < 1e-9,
         `session044: 3.15 1.30 HMS- → 1.45 (got ${r})`);
}

// HMS+ carries minutes and seconds correctly: 0.3030 + 0.3030 = 1.0100
{
  const s = new Stack();
  s.push(Real(0.3030));
  s.push(Real(0.3030));
  lookup('HMS+').fn(s);
  const r = s.peek().value;
  assert(Math.abs(r - 1.0100) < 1e-9,
         `session044: 0.3030 0.3030 HMS+ → 1.01 (got ${r})`);
}

// HMS→ rejects minutes ≥ 60 as bad argument value
{
  const s = new Stack();
  s.push(Real(1.60));   // not a valid HMS (60 minutes)
  assertThrows(() => { lookup('HMS→').fn(s); }, /Bad argument value/, 'session044: 1.60 HMS→ throws Bad argument value');
}

// ASCII aliases work
{
  const s = new Stack();
  s.push(Real(2.5));
  lookup('->HMS').fn(s);
  assert(Math.abs(s.peek().value - 2.3) < 1e-12,
         'session044: ->HMS ASCII alias of →HMS');
}
{
  const s = new Stack();
  s.push(Real(2.3));
  lookup('HMS->').fn(s);
  assert(Math.abs(s.peek().value - 2.5) < 1e-9,
         'session044: HMS-> ASCII alias of HMS→');
}

// Integer input coerces through toRealOrThrow
{
  const s = new Stack();
  s.push(Integer(3n));
  lookup('→HMS').fn(s);
  assert(Math.abs(s.peek().value - 3.0) < 1e-12,
         'session044: 3 (Integer) →HMS → 3.0');
}

// Complex input rejected
{
  const s = new Stack();
  s.push(Complex(1, 2));
  assertThrows(() => { lookup('→HMS').fn(s); }, /Bad argument type/, 'session044: (1,2) →HMS throws Bad argument type');
}

// session410: HMS+ / HMS- (the binary closures) carried zero rejection
// coverage — only happy paths (session044).  _hmsBinary rejects a Complex
// in either slot up front (Bad argument type), routes both operands through
// toRealOrThrow (non-numeric → Bad argument type), then _hmsToHours (an
// invalid HH.MMSS value with minutes ≥ 60 → Bad argument value) in either
// slot.  And the four ASCII aliases (->HMS / HMS-> / D->HMS / HMS->D) are
// DISTINCT _hmsUnary closures, not the canonical fn instance, so their guard
// arms were never exercised — only happy-path equivalence.  Pin both, so a
// refactor that drops a guard from one closure can't pass green.
{
  // HMS+ / HMS- Complex reject — both operand positions.
  const mk = (a, b) => { const s = new Stack(); s.push(a); s.push(b); return s; };
  assertThrows(() => { lookup('HMS+').fn(mk(Complex(1, 2), Real(1.30))); },
    /Bad argument type/, 'session410: Complex 1.30 HMS+ → Bad argument type');
  assertThrows(() => { lookup('HMS+').fn(mk(Real(1.30), Complex(1, 2))); },
    /Bad argument type/, 'session410: 1.30 Complex HMS+ → Bad argument type');
  assertThrows(() => { lookup('HMS-').fn(mk(Complex(1, 2), Real(1.30))); },
    /Bad argument type/, 'session410: Complex 1.30 HMS- → Bad argument type');
  // HMS+ / HMS- non-numeric (String) reject via toRealOrThrow — either slot.
  assertThrows(() => { lookup('HMS+').fn(mk(Str('x'), Real(1.30))); },
    /Bad argument type/, 'session410: "x" 1.30 HMS+ → Bad argument type');
  assertThrows(() => { lookup('HMS-').fn(mk(Real(1.30), Str('x'))); },
    /Bad argument type/, 'session410: 1.30 "x" HMS- → Bad argument type');
  // HMS+ / HMS- invalid HH.MMSS (minutes ≥ 60) reject — either slot.
  assertThrows(() => { lookup('HMS+').fn(mk(Real(1.60), Real(1.30))); },
    /Bad argument value/, 'session410: 1.60 1.30 HMS+ → Bad argument value');
  assertThrows(() => { lookup('HMS-').fn(mk(Real(1.30), Real(1.70))); },
    /Bad argument value/, 'session410: 1.30 1.70 HMS- → Bad argument value');
}
{
  // ASCII unary aliases reject like their canonicals (distinct closures).
  const mk1 = (v) => { const s = new Stack(); s.push(v); return s; };
  assertThrows(() => { lookup('->HMS').fn(mk1(Complex(1, 2))); },
    /Bad argument type/, 'session410: Complex ->HMS → Bad argument type');
  assertThrows(() => { lookup('->HMS').fn(mk1(Str('x'))); },
    /Bad argument type/, 'session410: "x" ->HMS → Bad argument type');
  assertThrows(() => { lookup('HMS->').fn(mk1(Real(1.60))); },
    /Bad argument value/, 'session410: 1.60 HMS-> → Bad argument value');
}

// EXP / LN / LOG / ALOG / SIN / COS / TAN / ASIN / ACOS / ATAN /
// SINH / COSH / TANH / ASINH / ACOSH / ATANH accept Complex inputs
// via principal-branch formulas so HP50-style complex workflows work.
// Real inputs still go through the real-only paths.

const _CX_EPS = 1e-10;
function _cxApprox(got, re, im, label) {
  const ok = got && got.type === 'complex' &&
    Math.abs(got.re - re) < _CX_EPS && Math.abs(got.im - im) < _CX_EPS;
  assert(ok, `${label} (got re=${got?.re} im=${got?.im})`);
}

// EXP on Complex: exp(iπ) = -1 + 0i (Euler's identity)
{
  const s = new Stack();
  s.push(Complex(0, Math.PI));
  lookup('EXP').fn(s);
  _cxApprox(s.peek(), -1, 0, 'session045: EXP(iπ) = -1 + 0i');
}

// EXP on Complex: exp(iπ/2) = 0 + 1i
{
  const s = new Stack();
  s.push(Complex(0, Math.PI / 2));
  lookup('EXP').fn(s);
  _cxApprox(s.peek(), 0, 1, 'session045: EXP(iπ/2) = 0 + 1i');
}

// LN on Complex: ln(-1) = 0 + iπ (principal branch)
{
  const s = new Stack();
  s.push(Complex(-1, 0));
  lookup('LN').fn(s);
  _cxApprox(s.peek(), 0, Math.PI, 'session045: LN(-1) = 0 + iπ');
}

// LN round-trip: ln(exp(z)) = z for small z
{
  const s = new Stack();
  s.push(Complex(0.5, 0.7));
  lookup('EXP').fn(s);
  lookup('LN').fn(s);
  _cxApprox(s.peek(), 0.5, 0.7, 'session045: LN(EXP((0.5, 0.7))) round-trips');
}

// LOG on Complex: log10(100) on Complex input = 2 + 0i
{
  const s = new Stack();
  s.push(Complex(100, 0));
  lookup('LOG').fn(s);
  _cxApprox(s.peek(), 2, 0, 'session045: LOG((100, 0)) = 2 + 0i');
}

// ALOG on Complex: alog(z) = 10^z; ALOG(0, 0) = 1 + 0i
{
  const s = new Stack();
  s.push(Complex(0, 0));
  lookup('ALOG').fn(s);
  _cxApprox(s.peek(), 1, 0, 'session045: ALOG((0, 0)) = 1 + 0i');
}

// ALOG on Complex: ALOG(2, 0) = 100 + 0i
{
  const s = new Stack();
  s.push(Complex(2, 0));
  lookup('ALOG').fn(s);
  _cxApprox(s.peek(), 100, 0, 'session045: ALOG((2, 0)) = 100 + 0i');
}

// SINH on Complex: sinh(iπ/2) = 0 + 1i (identity: sinh(ix) = i sin(x))
{
  const s = new Stack();
  s.push(Complex(0, Math.PI / 2));
  lookup('SINH').fn(s);
  _cxApprox(s.peek(), 0, 1, 'session045: SINH(iπ/2) = 0 + 1i');
}

// COSH on Complex: cosh(iπ) = -1 + 0i
{
  const s = new Stack();
  s.push(Complex(0, Math.PI));
  lookup('COSH').fn(s);
  _cxApprox(s.peek(), -1, 0, 'session045: COSH(iπ) = -1 + 0i');
}

// TANH on Complex: tanh(0 + iπ/4) = 0 + 1i
{
  const s = new Stack();
  s.push(Complex(0, Math.PI / 4));
  lookup('TANH').fn(s);
  _cxApprox(s.peek(), 0, 1, 'session045: TANH(iπ/4) = 0 + 1i');
}

// SIN on Complex (rad): sin(0 + 1i) = 0 + sinh(1)i
{
  setAngle('rad');
  const s = new Stack();
  s.push(Complex(0, 1));
  lookup('SIN').fn(s);
  _cxApprox(s.peek(), 0, Math.sinh(1), 'session045: SIN(0 + i) = 0 + sinh(1)i');
}

// COS on Complex (rad): cos(0 + 1i) = cosh(1) + 0i
{
  setAngle('rad');
  const s = new Stack();
  s.push(Complex(0, 1));
  lookup('COS').fn(s);
  _cxApprox(s.peek(), Math.cosh(1), 0, 'session045: COS(0 + i) = cosh(1) + 0i');
}

// TAN on Complex: tan(π/4 + 0i) = 1 + 0i (identity: tan(x) for real x
// embedded as Complex should match the real result).  In rad mode.
{
  setAngle('rad');
  const s = new Stack();
  s.push(Complex(Math.PI / 4, 0));
  lookup('TAN').fn(s);
  _cxApprox(s.peek(), 1, 0, 'session045: TAN(π/4 + 0i) = 1 + 0i');
}

// ASIN on Complex: asin(0, 1) = 0 + ln(1 + sqrt(2))i ≈ (0, 0.8814…)
{
  setAngle('rad');
  const s = new Stack();
  s.push(Complex(0, 1));
  lookup('ASIN').fn(s);
  _cxApprox(s.peek(), 0, Math.log(1 + Math.sqrt(2)),
    'session045: ASIN(0 + i) = 0 + ln(1+√2)i');
}

// ACOS on Complex: acos(0, 0) = π/2 + 0i
{
  setAngle('rad');
  const s = new Stack();
  s.push(Complex(0, 0));
  lookup('ACOS').fn(s);
  _cxApprox(s.peek(), Math.PI / 2, 0,
    'session045: ACOS((0, 0)) = π/2 + 0i');
}

// ATAN on Complex: atan(1, 0) = π/4 + 0i  (rad)
{
  setAngle('rad');
  const s = new Stack();
  s.push(Complex(1, 0));
  lookup('ATAN').fn(s);
  _cxApprox(s.peek(), Math.PI / 4, 0,
    'session045: ATAN(1 + 0i) = π/4 + 0i');
}

// ATANH on Complex: atanh(0, 1) = 0 + π/4 i  (standard identity)
{
  const s = new Stack();
  s.push(Complex(0, 1));
  lookup('ATANH').fn(s);
  _cxApprox(s.peek(), 0, Math.PI / 4,
    'session045: ATANH(0 + i) = 0 + π/4 i');
}

// ASINH on Complex: asinh(0, 1) = 0 + π/2 i
{
  const s = new Stack();
  s.push(Complex(0, 1));
  lookup('ASINH').fn(s);
  _cxApprox(s.peek(), 0, Math.PI / 2,
    'session045: ASINH(0 + i) = 0 + π/2 i');
}

// ACOSH of real x < 1 lifts to Complex (covered in test-entry.mjs
// too — keep one assertion here for locality): ACOSH(-1) = 0 + πi
{
  const s = new Stack();
  s.push(Real(-1));
  lookup('ACOSH').fn(s);
  _cxApprox(s.peek(), 0, Math.PI,
    'session045: ACOSH(-1) = 0 + πi (real < 1 lifts to Complex)');
}

// ATANH of real |x| > 1 lifts to Complex: ATANH(2) = ln(3)/2 + i*(-π/2)
// (the principal branch lands on the negative-imaginary side via atan2 for
// the (1-z)=(-1, 0) piece)
{
  const s = new Stack();
  s.push(Real(2));
  lookup('ATANH').fn(s);
  const r = s.peek();
  assert(r && r.type === 'complex' &&
         Math.abs(r.re - 0.5 * Math.log(3)) < _CX_EPS &&
         Math.abs(Math.abs(r.im) - Math.PI / 2) < _CX_EPS,
         'session045: ATANH(2) principal → (ln(3)/2, ±π/2)');
}

// LN of (0, 0) throws (Infinite result)
{
  const s = new Stack();
  s.push(Complex(0, 0));
  assertThrows(() => { lookup('LN').fn(s); }, /Infinite result/, 'session045: LN((0, 0)) throws Infinite result');
}

// Symbolic operand still lifts (not touched by Complex branch)
{
  const s = new Stack();
  s.push(Name('X', { quoted: true }));
  lookup('EXP').fn(s);
  assert(s.peek().type === 'symbolic',
         'session045: EXP on quoted Name still lifts to Symbolic');
}

// Reset angle mode to default
setAngle('rad');


{
  const s = new Stack();
  s.push(Integer(5));
  lookup('!').fn(s);
  assert(s.peek().value === 120n,
    'session047: 5 ! → Integer(120) (FACT alias)');
}

{
  const s = new Stack();
  s.push(Integer(0));
  lookup('!').fn(s);
  assert(s.peek().value === 1n,
    'session047: 0 ! → 1 (0! definition)');
}

{
  const s = new Stack();
  s.push(Real(0.5));
  lookup('!').fn(s);
  const v = s.peek();
  // Γ(1.5) = (√π)/2 ≈ 0.886226925
  assert(isReal(v) && Math.abs(v.value - 0.8862269254527) < 1e-10,
    'session047: 0.5 ! → Γ(1.5) ≈ √π/2');
}

{
  const s = new Stack();
  s.push(Integer(-3));
  assertThrows(() => { lookup('!').fn(s); }, null, 'session047: -3 ! throws Bad argument value');
}

/* ================================================================
   session421: FACT on an integer-valued Real.
   Every prior FACT/! pin fed an Integer (the exact-factorial path)
   or a *non-integer* Real (0.5, the Γ(x+1) path).  The arm that
   collapses a non-negative integer-valued Real to an exact Integer
   (ops.js ~1672) and the pole arm that throws 'Infinite result' on a
   *negative* integer-valued Real (~1671) were never exercised — a
   refactor folding the integer-valued-Real check into the Γ branch
   would return a Real(120) (or NaN at the pole) yet pass every prior
   pin.  Note the Real pole error ('Infinite result') is distinct from
   the Integer reject ('Bad argument value', session047).
   ================================================================ */
{
  {
    const s = new Stack();
    s.push(Real(5));
    lookup('FACT').fn(s);
    const r = s.peek();
    assert(isInteger(r) && !isReal(r) && r.value === 120n,
      'session421: FACT Real(5) → Integer(120) (integer-valued Real collapses to exact Integer, not Real)');
  }
  {
    const s = new Stack();
    s.push(Real(0));
    lookup('FACT').fn(s);
    const r = s.peek();
    assert(isInteger(r) && r.value === 1n,
      'session421: FACT Real(0) → Integer(1) (0! through the integer-valued-Real arm)');
  }
  {
    const s = new Stack();
    s.push(Real(6));
    lookup('!').fn(s);
    const r = s.peek();
    assert(isInteger(r) && r.value === 720n,
      'session421: 6.0 ! → Integer(720) (alias, same integer-valued-Real arm)');
  }
  {
    const s = new Stack();
    s.push(Real(-3));
    assertThrows(() => { lookup('FACT').fn(s); }, /Infinite result/,
      'session421: FACT Real(-3) → Infinite result (gamma pole, distinct from Integer(-3) → Bad argument value)');
  }
}

{
  const vals = parseEntry('5 !');
  const s = new Stack();
  for (const v of vals) {
    if (v?.type === 'name' && !v.quoted) {
      const op = lookup(v.id);
      if (op) { op.fn(s); continue; }
    }
    s.push(v);
  }
  assert(s.peek().value === 120n,
    'session047: "5 !" via parseEntry → 120 (tokeniser splits 5 and !)');
}

{
  const s = new Stack();
  s.push(Real(0.5));
  lookup('→Q').fn(s);
  const sym = s.peek();
  assert(sym && sym.type === 'symbolic', '→Q produces Symbolic');
  const ast = sym.expr;
  assert(ast.kind === 'bin' && ast.op === '/'
      && ast.l.kind === 'num' && ast.l.value === 1
      && ast.r.kind === 'num' && ast.r.value === 2,
    'session047: 0.5 →Q → Sym(1/2)');
}

{
  const s = new Stack();
  s.push(Real(1 / 3));
  lookup('→Q').fn(s);
  const ast = s.peek().expr;
  assert(ast.kind === 'bin' && ast.op === '/'
      && ast.l.value === 1 && ast.r.value === 3,
    'session047: (1/3 as Real) →Q → Sym(1/3) via continued fraction');
}

{
  const s = new Stack();
  s.push(Real(-0.75));
  lookup('→Q').fn(s);
  const ast = s.peek().expr;
  assert(ast.kind === 'neg' && ast.arg.kind === 'bin' && ast.arg.op === '/'
      && ast.arg.l.value === 3 && ast.arg.r.value === 4,
    'session047: -0.75 →Q → Neg(3/4)');
}

{
  const s = new Stack();
  s.push(Real(5));
  lookup('→Q').fn(s);
  const ast = s.peek().expr;
  assert(ast.kind === 'num' && ast.value === 5,
    'session047: 5.0 →Q → Sym(5)  (no /1 denominator)');
}

{
  const s = new Stack();
  s.push(Real(0));
  lookup('→Q').fn(s);
  const ast = s.peek().expr;
  assert(ast.kind === 'num' && ast.value === 0,
    'session047: 0 →Q → Sym(0)');
}

{
  const s = new Stack();
  s.push(Integer(42));
  lookup('→Q').fn(s);
  const ast = s.peek().expr;
  assert(ast.kind === 'num' && ast.value === 42,
    'session047: Integer 42 →Q → Sym(42)');
}

{
  const s = new Stack();
  s.push(Complex(1, 2));
  assertThrows(() => { lookup('→Q').fn(s); }, null, 'session047: Complex →Q throws Bad argument type');
}

{
  const s = new Stack();
  s.push(Real(0.25));
  lookup('->Q').fn(s);
  const ast = s.peek().expr;
  assert(ast.kind === 'bin' && ast.l.value === 1 && ast.r.value === 4,
    'session047: ->Q ASCII alias works (0.25 → 1/4)');
}

// Q→ decompose, D→HMS / HMS→D bridges

{
  const s = new Stack();
  s.push(Real(0.5));
  lookup('→Q').fn(s);      // push Sym(1/2)
  lookup('Q→').fn(s);      // decompose
  assert(s.depth === 2, 'session048: Q→ of Sym(1/2) pushes 2 items');
  const d = s.pop();
  const n = s.pop();
  assert(isInteger(n) && n.value === 1n, 'session048: Q→ of 1/2 numerator=1');
  assert(isInteger(d) && d.value === 2n, 'session048: Q→ of 1/2 denom=2');
}

{
  const s = new Stack();
  s.push(Real(0.75));
  lookup('→Q').fn(s);      // push Sym(3/4)
  lookup('Q→').fn(s);
  const d = s.pop();
  const n = s.pop();
  assert(isInteger(n) && n.value === 3n && isInteger(d) && d.value === 4n,
    'session048: Q→ of 3/4 → ( 3 4 )');
}

{
  const s = new Stack();
  s.push(Real(-0.75));
  lookup('→Q').fn(s);      // push Sym(Neg(3/4))
  lookup('Q→').fn(s);
  const d = s.pop();
  const n = s.pop();
  assert(isInteger(n) && n.value === -3n && isInteger(d) && d.value === 4n,
    'session048: Q→ of Neg(3/4) → ( -3 4 )');
}

{
  const s = new Stack();
  s.push(Real(5));
  lookup('→Q').fn(s);      // push Sym(5)
  lookup('Q→').fn(s);
  const d = s.pop();
  const n = s.pop();
  assert(isInteger(n) && n.value === 5n && isInteger(d) && d.value === 1n,
    'session048: Q→ of Sym(5) → ( 5 1 ) (integer-over-one convention)');
}

{
  const s = new Stack();
  s.push(Real(0));
  lookup('→Q').fn(s);
  lookup('Q→').fn(s);
  const d = s.pop();
  const n = s.pop();
  assert(isInteger(n) && n.value === 0n && isInteger(d) && d.value === 1n,
    'session048: Q→ of Sym(0) → ( 0 1 )');
}

{
  const s = new Stack();
  s.push(Integer(42));
  lookup('Q→').fn(s);
  const d = s.pop();
  const n = s.pop();
  assert(isInteger(n) && n.value === 42n && isInteger(d) && d.value === 1n,
    'session048: Q→ of Integer(42) → ( 42 1 )');
}

{
  const s = new Stack();
  s.push(Real(7));
  lookup('Q→').fn(s);
  const d = s.pop();
  const n = s.pop();
  assert(isInteger(n) && n.value === 7n && isInteger(d) && d.value === 1n,
    'session048: Q→ of Real(7) → ( 7 1 )');
}

{
  const s = new Stack();
  s.push(Real(3.14));
  assertThrows(() => { lookup('Q→').fn(s); }, null, 'session048: Q→ of non-integer Real throws Bad argument value');
}

{
  const s = new Stack();
  // Manually build a Symbolic that's not a rational.
  // Import AST ctors via algebra.js
}
{
  // Import and test via a wrong-shape path:
  const { Fn } = await import('../www/src/rpl/algebra.js');
  const { Symbolic } = await import('../www/src/rpl/types.js');
  const s = new Stack();
  s.push(Symbolic(Fn('SIN', [{ kind: 'var', name: 'X' }])));
  assertThrows(() => { lookup('Q→').fn(s); }, null, 'session048: Q→ of SIN(X) throws Bad argument type');
}

{
  const s = new Stack();
  s.push(Complex(1, 2));
  assertThrows(() => { lookup('Q→').fn(s); }, null, 'session048: Q→ of Complex throws Bad argument type');
}

{
  const s = new Stack();
  s.push(Real(0.25));
  lookup('→Q').fn(s);
  lookup('Q->').fn(s);
  const d = s.pop();
  const n = s.pop();
  assert(isInteger(n) && n.value === 1n && isInteger(d) && d.value === 4n,
    'session048: Q-> ASCII alias works (0.25 round-trip → 1 4)');
}

{
  const s = new Stack();
  s.push(Real(0.125));
  lookup('→Q').fn(s);
  lookup('Q→').fn(s);
  const d = Number(s.pop().value);
  const n = Number(s.pop().value);
  assert(n === 1 && d === 8, 'session048: 0.125 →Q Q→ → ( 1 8 )');
}

{
  const s = new Stack();
  s.push(Real(1.5));         // 1°30'00"
  lookup('D→HMS').fn(s);
  const v = s.peek();
  assert(isReal(v) && Math.abs(v.value - 1.3) < 1e-9,
    'session048: D→HMS 1.5 → 1.3 (1°30\')');
}

{
  const s = new Stack();
  s.push(Real(1.3));         // 1°30'00"
  lookup('HMS→D').fn(s);
  const v = s.peek();
  assert(isReal(v) && Math.abs(v.value - 1.5) < 1e-9,
    'session048: HMS→D 1.3 → 1.5');
}

{
  const s = new Stack();
  s.push(Real(10.25));       // 10°15'00"
  lookup('D→HMS').fn(s);
  const v = s.peek();
  assert(isReal(v) && Math.abs(v.value - 10.15) < 1e-9,
    'session048: D→HMS 10.25 → 10.15');
}

{
  const s = new Stack();
  s.push(Real(10.3015));     // 10°30'15"
  lookup('HMS→D').fn(s);
  const v = s.peek();
  const expected = 10 + 30 / 60 + 15 / 3600;
  assert(isReal(v) && Math.abs(v.value - expected) < 1e-9,
    'session048: HMS→D 10.3015 → 10°30\'15" decimal');
}

{
  const s = new Stack();
  s.push(Real(5.375));
  lookup('D→HMS').fn(s);
  lookup('HMS→D').fn(s);
  const v = s.peek();
  assert(isReal(v) && Math.abs(v.value - 5.375) < 1e-9,
    'session048: D→HMS HMS→D round-trip preserves value');
}

{
  const s = new Stack();
  s.push(Real(1.5));
  lookup('D->HMS').fn(s);
  assert(Math.abs(s.peek().value - 1.3) < 1e-9,
    'session048: D->HMS ASCII alias');
}
{
  const s = new Stack();
  s.push(Real(1.3));
  lookup('HMS->D').fn(s);
  assert(Math.abs(s.peek().value - 1.5) < 1e-9,
    'session048: HMS->D ASCII alias');
}

{
  const s = new Stack();
  s.push(Complex(1, 2));
  assertThrows(() => { lookup('D→HMS').fn(s); }, /Bad argument type/, 'session048: D→HMS on Complex throws Bad argument type');
}

// session410: the degree siblings D→HMS / HMS→D and their ASCII aliases
// (D->HMS / HMS->D) are also distinct _hmsUnary closures sharing the same
// guard arms, but only happy paths (session048) plus the now-tightened
// D→HMS Complex reject above were covered.  Pin the reject siblings: HMS→D
// rejects an invalid HH.MMSS value (minutes ≥ 60 → Bad argument value, the
// canonical HMS→ pin's degree mirror), D->HMS rejects Complex, and HMS->D
// rejects the same invalid value through the ASCII alias closure.
{
  const mk1 = (v) => { const s = new Stack(); s.push(v); return s; };
  assertThrows(() => { lookup('HMS→D').fn(mk1(Real(1.60))); },
    /Bad argument value/, 'session410: 1.60 HMS→D → Bad argument value');
  assertThrows(() => { lookup('D->HMS').fn(mk1(Complex(1, 2))); },
    /Bad argument type/, 'session410: Complex D->HMS → Bad argument type');
  assertThrows(() => { lookup('HMS->D').fn(mk1(Real(1.60))); },
    /Bad argument value/, 'session410: 1.60 HMS->D → Bad argument value');
}



{
  const s = new Stack();
  s.push(Real(Math.PI));
  lookup('→Qπ').fn(s);
  const sym = s.peek();
  assert(sym && sym.type === 'symbolic',
    'session052: →Qπ produces Symbolic');
  assert(sym.expr.kind === 'var' && sym.expr.name === 'PI',
    'session052: π →Qπ → Sym(PI)');
}

{
  const s = new Stack();
  s.push(Real(Math.PI / 2));
  lookup('→Qπ').fn(s);
  const ast = s.peek().expr;
  // Expect: PI / 2
  assert(ast.kind === 'bin' && ast.op === '/'
      && ast.l.kind === 'var' && ast.l.name === 'PI'
      && ast.r.kind === 'num' && ast.r.value === 2,
    'session052: π/2 →Qπ → Sym(PI / 2)');
}

{
  const s = new Stack();
  s.push(Real(3 * Math.PI / 4));
  lookup('→Qπ').fn(s);
  const ast = s.peek().expr;
  assert(ast.kind === 'bin' && ast.op === '/'
      && ast.r.kind === 'num' && ast.r.value === 4,
    'session052: 3π/4 →Qπ denominator is 4');
  assert(ast.l.kind === 'bin' && ast.l.op === '*'
      && ast.l.l.kind === 'num' && ast.l.l.value === 3
      && ast.l.r.kind === 'var' && ast.l.r.name === 'PI',
    'session052: 3π/4 →Qπ numerator is 3 * PI');
}

{
  const s = new Stack();
  s.push(Real(2 * Math.PI));
  lookup('→Qπ').fn(s);
  const ast = s.peek().expr;
  assert(ast.kind === 'bin' && ast.op === '*'
      && ast.l.kind === 'num' && ast.l.value === 2
      && ast.r.kind === 'var' && ast.r.name === 'PI',
    'session052: 2π →Qπ → Sym(2 * PI)  (no /1 denom)');
}

{
  const s = new Stack();
  s.push(Real(-Math.PI / 3));
  lookup('→Qπ').fn(s);
  const ast = s.peek().expr;
  assert(ast.kind === 'neg',
    'session052: -π/3 →Qπ produces a Neg at the top');
  const inner = ast.arg;
  assert(inner.kind === 'bin' && inner.op === '/'
      && inner.l.kind === 'var' && inner.l.name === 'PI'
      && inner.r.kind === 'num' && inner.r.value === 3,
    'session052: -π/3 →Qπ → Neg(PI / 3)');
}

{
  const s = new Stack();
  s.push(Real(0));
  lookup('→Qπ').fn(s);
  const ast = s.peek().expr;
  assert(ast.kind === 'num' && ast.value === 0,
    'session052: 0 →Qπ → Sym(0)');
}

/* ---- →Qπ on an Integer (Integer 0 passthrough is separately covered;
        test an Integer multiple of π via coercion path) ---- */
{
  const s = new Stack();
  s.push(Integer(0));
  lookup('→Qπ').fn(s);
  const ast = s.peek().expr;
  assert(ast.kind === 'num' && ast.value === 0,
    'session052: Integer 0 →Qπ → Sym(0)');
}

{
  const s = new Stack();
  s.push(Complex(1, 2));
  assertThrows(() => { lookup('→Qπ').fn(s); }, /Bad argument/, 'session052: Complex →Qπ throws');
}

{
  const s = new Stack();
  s.push(Real(Math.PI));
  lookup('->Qπ').fn(s);
  assert(s.peek().expr.kind === 'var' && s.peek().expr.name === 'PI',
    'session052: ->Qπ ASCII alias matches →Qπ');
}



// number-theoretic ops (CAS §11, integer subset)

{
  const s = new Stack();
  for (const [n, expected] of [[2n,1],[3n,1],[4n,0],[5n,1],[9n,0],[11n,1],[12n,0],[13n,1],[1n,0],[0n,0]]) {
    s.push(Integer(n));
    lookup('ISPRIME?').fn(s);
    assert(isReal(s.peek()) && s.peek().value.eq(expected),
      `session053: ISPRIME? ${n} → ${expected}`);
    s.pop();
  }
}

{
  const s = new Stack();
  s.push(Real(17));
  lookup('ISPRIME?').fn(s);
  assert(s.peek().value.eq(1), 'session053: ISPRIME? Real(17) → true');
}

{
  const s = new Stack();
  s.push(Real(2.5));
  assertThrows(() => { lookup('ISPRIME?').fn(s); }, /Bad argument/, 'session053: ISPRIME? 2.5 throws');
}

{
  const s = new Stack();
  s.push(Integer(7919n));   // 1000th prime
  lookup('ISPRIME?').fn(s);
  assert(s.peek().value.eq(1), 'session053: ISPRIME? 7919 → true');
  s.pop();
  s.push(Integer(7920n));
  lookup('ISPRIME?').fn(s);
  assert(s.peek().value.eq(0), 'session053: ISPRIME? 7920 → false');
}

{
  const s = new Stack();
  s.push(Integer(10n));
  lookup('NEXTPRIME').fn(s);
  assert(isInteger(s.peek()) && s.peek().value === 11n,
    'session053: NEXTPRIME 10 → 11');

  s.pop();
  s.push(Integer(10n));
  lookup('PREVPRIME').fn(s);
  assert(isInteger(s.peek()) && s.peek().value === 7n,
    'session053: PREVPRIME 10 → 7');

  s.pop();
  s.push(Integer(13n));
  lookup('NEXTPRIME').fn(s);
  assert(s.peek().value === 17n, 'session053: NEXTPRIME 13 → 17 (skips 13)');

  s.pop();
  s.push(Integer(13n));
  lookup('PREVPRIME').fn(s);
  assert(s.peek().value === 11n, 'session053: PREVPRIME 13 → 11 (skips 13)');
}

{
  const s = new Stack();
  s.push(Integer(2n));
  assertThrows(() => { lookup('PREVPRIME').fn(s); }, /Bad argument/, 'session053: PREVPRIME 2 throws (no prime < 2)');
}

{
  const s = new Stack();
  for (const [n, phi] of [[1n,1n],[2n,1n],[3n,2n],[4n,2n],[6n,2n],[9n,6n],[12n,4n],[36n,12n]]) {
    s.push(Integer(n));
    lookup('EULER').fn(s);
    assert(isInteger(s.peek()) && s.peek().value === phi,
      `session053: EULER ${n} → ${phi}`);
    s.pop();
  }
}

{
  const s = new Stack();
  s.push(Integer(0n));
  assertThrows(() => { lookup('EULER').fn(s); }, /Bad argument/, 'session053: EULER 0 throws');

  s.push(Integer(-5n));
  assertThrows(() => { lookup('EULER').fn(s); }, /Bad argument/, 'session053: EULER -5 throws');
}

{
  const s = new Stack();
  s.push(Integer(12n));
  lookup('DIVIS').fn(s);
  const d = s.peek();
  assert(d.type === 'list' && d.items.length === 6, 'session053: DIVIS 12 size=6');
  assert(d.items.map(i => i.value).join(',') === '1,2,3,4,6,12',
    'session053: DIVIS 12 → {1 2 3 4 6 12}');

  s.pop();
  s.push(Integer(1n));
  lookup('DIVIS').fn(s);
  assert(s.peek().items.length === 1 && s.peek().items[0].value === 1n,
    'session053: DIVIS 1 → {1}');

  // Negative input uses absolute value
  s.pop();
  s.push(Integer(-6n));
  lookup('DIVIS').fn(s);
  assert(s.peek().items.map(i => i.value).join(',') === '1,2,3,6',
    'session053: DIVIS -6 uses |n|');
}

{
  const s = new Stack();
  s.push(Integer(0n));
  assertThrows(() => { lookup('DIVIS').fn(s); }, /Bad argument/, 'session053: DIVIS 0 throws');
}

{
  const s = new Stack();
  s.push(Integer(12n));
  lookup('FACTORS').fn(s);
  assert(s.peek().items.map(i => i.value).join(',') === '2,2,3,1',
    'session053: FACTORS 12 → {2 2 3 1}');

  s.pop();
  s.push(Integer(100n));
  lookup('FACTORS').fn(s);
  assert(s.peek().items.map(i => i.value).join(',') === '2,2,5,2',
    'session053: FACTORS 100 → {2 2 5 2}');

  s.pop();
  s.push(Integer(7n));
  lookup('FACTORS').fn(s);
  assert(s.peek().items.map(i => i.value).join(',') === '7,1',
    'session053: FACTORS 7 → {7 1}');

  s.pop();
  s.push(Integer(1n));
  lookup('FACTORS').fn(s);
  assert(s.peek().items.length === 0, 'session053: FACTORS 1 → {}');
}

{
  const s = new Stack();
  // B_0 = 1
  s.push(Integer(0n));
  lookup('IBERNOULLI').fn(s);
  assert(s.peek().type === 'symbolic' && s.peek().expr.kind === 'num' && s.peek().expr.value === 1,
    'session053: IBERNOULLI 0 → 1');
  s.pop();

  // B_1 = -1/2
  s.push(Integer(1n));
  lookup('IBERNOULLI').fn(s);
  {
    const e = s.peek().expr;
    assert(e.kind === 'neg' && e.arg.kind === 'bin' && e.arg.op === '/' &&
           e.arg.l.value === 1 && e.arg.r.value === 2,
      'session053: IBERNOULLI 1 → -1/2');
  }
  s.pop();

  // B_2 = 1/6
  s.push(Integer(2n));
  lookup('IBERNOULLI').fn(s);
  {
    const e = s.peek().expr;
    assert(e.kind === 'bin' && e.op === '/' && e.l.value === 1 && e.r.value === 6,
      'session053: IBERNOULLI 2 → 1/6');
  }
  s.pop();

  // B_3 = 0 (odd > 1)
  s.push(Integer(3n));
  lookup('IBERNOULLI').fn(s);
  assert(s.peek().expr.kind === 'num' && s.peek().expr.value === 0,
    'session053: IBERNOULLI 3 → 0');
  s.pop();

  // B_4 = -1/30
  s.push(Integer(4n));
  lookup('IBERNOULLI').fn(s);
  {
    const e = s.peek().expr;
    assert(e.kind === 'neg' && e.arg.kind === 'bin' &&
           e.arg.l.value === 1 && e.arg.r.value === 30,
      'session053: IBERNOULLI 4 → -1/30');
  }
  s.pop();

  // B_6 = 1/42
  s.push(Integer(6n));
  lookup('IBERNOULLI').fn(s);
  {
    const e = s.peek().expr;
    assert(e.kind === 'bin' && e.op === '/' && e.l.value === 1 && e.r.value === 42,
      'session053: IBERNOULLI 6 → 1/42');
  }
}

{
  const s = new Stack();
  s.push(Integer(-1n));
  assertThrows(() => { lookup('IBERNOULLI').fn(s); }, /Bad argument/, 'session053: IBERNOULLI -1 throws');
}

{
  const s = new Stack();
  s.push(Integer(1000n));
  assertThrows(() => { lookup('IBERNOULLI').fn(s); }, /Bad argument/, 'session053: IBERNOULLI 1000 throws (cap)');
}

{
  const s = new Stack();
  s.push(Integer(12n));
  s.push(Integer(18n));
  lookup('IEGCD').fn(s);
  assert(s.depth === 3, 'session053: IEGCD pushes u v g');
  const g = s.peek(1).value;
  const v = s.peek(2).value;
  const u = s.peek(3).value;
  assert(g === 6n, 'session053: IEGCD 12 18 g = 6');
  assert(u * 12n + v * 18n === 6n, 'session053: IEGCD 12 18 u v satisfies u*a + v*b = g');
}

{
  const s = new Stack();
  s.push(Integer(0n));
  s.push(Integer(0n));
  lookup('IEGCD').fn(s);
  assert(s.peek(1).value === 0n,
    'session053: IEGCD 0 0 → g = 0');
}

{
  const s = new Stack();
  s.push(Integer(-12n));
  s.push(Integer(18n));
  lookup('IEGCD').fn(s);
  const g = s.peek(1).value;
  const v = s.peek(2).value;
  const u = s.peek(3).value;
  assert(g === 6n && u * -12n + v * 18n === 6n,
    'session053: IEGCD -12 18 satisfies u*(-12) + v*18 = 6');
}

{
  // x ≡ 2 (mod 3), x ≡ 3 (mod 5) → x = 8 (mod 15)
  const s = new Stack();
  s.push(RList([Integer(2n), Integer(3n)]));
  s.push(RList([Integer(3n), Integer(5n)]));
  lookup('ICHINREM').fn(s);
  const r = s.peek();
  assert(r.type === 'list' && r.items.length === 2 &&
         r.items[0].value === 8n && r.items[1].value === 15n,
    'session053: ICHINREM {2,3} {3,5} → {8 15}');
}

{
  // x ≡ 1 (mod 2), x ≡ 0 (mod 4) — inconsistent
  const s = new Stack();
  s.push(RList([Integer(1n), Integer(2n)]));
  s.push(RList([Integer(0n), Integer(4n)]));
  assertThrows(() => { lookup('ICHINREM').fn(s); }, /Bad argument/, 'session053: ICHINREM inconsistent throws');
}

{
  // 12 u + 18 v = 30 ; gcd(12,18) = 6, 30/6 = 5, bezout(12,18) has u=-1,v=1 so u=-5,v=5
  const s = new Stack();
  s.push(Integer(12n));
  s.push(Integer(18n));
  s.push(Integer(30n));
  lookup('IABCUV').fn(s);
  const v = s.peek(1).value;
  const u = s.peek(2).value;
  assert(12n * u + 18n * v === 30n,
    'session053: IABCUV 12 18 30 satisfies 12u + 18v = 30');
}

{
  const s = new Stack();
  s.push(Integer(6n));
  s.push(Integer(9n));
  s.push(Integer(5n));     // gcd(6,9) = 3, 5 not divisible by 3
  assertThrows(() => { lookup('IABCUV').fn(s); }, /Bad argument/, 'session053: IABCUV 6 9 5 (no solution) throws');
}


{
  const s = new Stack();
  s.push(Integer(4n));
  lookup('FIX').fn(s);
  assert(calcState.displayMode === 'FIX',
    'session053: FIX sets displayMode = FIX');
  assert(calcState.displayDigits === 4,
    'session053: FIX 4 sets displayDigits = 4');
}

{
  const s = new Stack();
  s.push(Integer(3n));
  lookup('SCI').fn(s);
  assert(calcState.displayMode === 'SCI' && calcState.displayDigits === 3,
    'session053: SCI 3 → mode=SCI, digits=3');
}

{
  const s = new Stack();
  s.push(Integer(2n));
  lookup('ENG').fn(s);
  assert(calcState.displayMode === 'ENG' && calcState.displayDigits === 2,
    'session053: ENG 2 → mode=ENG, digits=2');
}

{
  // First set SCI 5
  const s = new Stack();
  s.push(Integer(5n));
  lookup('SCI').fn(s);
  const digitsBefore = calcState.displayDigits;
  lookup('STD').fn(s);
  assert(calcState.displayMode === 'STD',
    'session053: STD sets mode=STD');
  assert(calcState.displayDigits === digitsBefore,
    'session053: STD does not overwrite displayDigits');
}

{
  const s = new Stack();
  s.push(Integer(20n));
  lookup('FIX').fn(s);
  assert(calcState.displayDigits === 11,
    'session053: FIX 20 clamps to 11');
}

{
  const s = new Stack();
  s.push(Integer(-1n));
  assertThrows(() => { lookup('FIX').fn(s); }, /Bad argument/, 'session053: FIX -1 throws');
}

{
  const s = new Stack();
  s.push(Real(3.5));
  assertThrows(() => { lookup('FIX').fn(s); }, /Bad argument/, 'session053: FIX 3.5 throws');
}

{
  const s = new Stack();
  s.push(Name('X'));
  assertThrows(() => { lookup('FIX').fn(s); }, /Bad argument/, 'session053: FIX Name throws');
}

/* =================================================================
   CMPLX / CMPLX? mode toggle.
   ================================================================= */

{
  setComplexMode(false);
  const s = new Stack();
  lookup('CMPLX').fn(s);
  assert(getComplexMode() === true, 'session054: CMPLX op sets mode on');
  lookup('CMPLX').fn(s);
  assert(getComplexMode() === false, 'session054: CMPLX op toggles back off');
}

{
  setComplexMode(true);
  const s = new Stack();
  lookup('CMPLX?').fn(s);
  assert(s.pop().value.eq(1), 'session054: CMPLX? ON → 1');
  setComplexMode(false);
  lookup('CMPLX?').fn(s);
  assert(s.pop().value.eq(0), 'session054: CMPLX? OFF → 0');
}

{
  setComplexMode(false);
  const s = new Stack();
  s.push(Real(-1));
  assertThrows(() => { lookup('LN').fn(s); }, /Bad argument value/, 'session054: LN(-1) throws under CMPLX OFF');
}

{
  setComplexMode(true);
  const s = new Stack();
  s.push(Real(-1));
  lookup('LN').fn(s);
  const r = s.pop();
  assert(isComplex(r) && Math.abs(r.re) < 1e-12 && Math.abs(r.im - Math.PI) < 1e-12,
    'session054: LN(-1) under CMPLX ON → (0, π)');
  setComplexMode(false);
}

/* ---- ACOS(2) always lifts to Complex; CMPLX doesn't gate that path.
 *      This test pins the behavior so a future change doesn't
 *      accidentally tie ACOS to CMPLX without a conscious decision. ---- */
{
  setComplexMode(true);
  setAngle('RAD');
  const s = new Stack();
  s.push(Real(2));
  lookup('ACOS').fn(s);
  assert(isComplex(s.pop()), 'session054: ACOS(2) returns Complex (CMPLX ON)');
  setComplexMode(false);
  const s2 = new Stack();
  s2.push(Real(2));
  lookup('ACOS').fn(s2);
  assert(isComplex(s2.pop()), 'session054: ACOS(2) returns Complex (CMPLX OFF)');
}

/* ---- LOG(-10) under CMPLX ON → (1, π/ln10) principal-branch
 *      (re=log10(10)=1, im = Arg(-10)/ln10 = π/ln10) ---- */
{
  setComplexMode(true);
  const s = new Stack();
  s.push(Real(-10));
  lookup('LOG').fn(s);
  const r = s.pop();
  assert(isComplex(r) && Math.abs(r.re - 1) < 1e-9
         && Math.abs(r.im - Math.PI / Math.LN10) < 1e-9,
    'session054: LOG(-10) under CMPLX ON principal-branch');
  setComplexMode(false);
}

{
  setComplexMode(false);
  const s = new Stack();
  s.push(Real(-10));
  const logErr = assertThrows(() => lookup('LOG').fn(s), /Bad argument value/,
    'session054: LOG(-10) CMPLX OFF throws clean RPL error');
  assert(logErr && logErr.name !== 'TypeError',
    'session054: LOG(-10) CMPLX OFF error is an RPL error, not a native TypeError');
}

/* ================================================================
   C→P / P→C complex cartesian ↔ polar.

   Angle-mode aware: `fromRadians` writes the θ coordinate out of
   C→P in the current angle mode, and P→C reads it back via
   `toRadians` so the round-trip is an identity in any angle mode.
   ================================================================ */

{
  setAngle('RAD');
  const s = new Stack();
  s.push(Complex(3, 4));
  lookup('C→P').fn(s);
  const r = s.pop();
  assert(isComplex(r)
         && Math.abs(r.re - 5) < 1e-12
         && Math.abs(r.im - Math.atan2(4, 3)) < 1e-12,
    'session055: C→P(3+4i) = (5, atan2(4,3)) in RAD');
}

{
  setAngle('DEG');
  const s = new Stack();
  s.push(Complex(0, 1));                  // straight up
  lookup('C→P').fn(s);
  const r = s.pop();
  assert(isComplex(r)
         && Math.abs(r.re - 1) < 1e-12
         && Math.abs(r.im - 90) < 1e-9,
    'session055: C→P(i) = (1, 90°) in DEG');
  setAngle('RAD');
}

{
  setAngle('RAD');
  const s = new Stack();
  s.push(Complex(2, Math.PI / 2));
  lookup('P→C').fn(s);
  const r = s.pop();
  assert(isComplex(r)
         && Math.abs(r.re) < 1e-12
         && Math.abs(r.im - 2) < 1e-12,
    'session055: P→C(2, π/2) = 2i in RAD');
}

{
  setAngle('DEG');
  const s = new Stack();
  s.push(Complex(1, 180));
  lookup('P→C').fn(s);
  const r = s.pop();
  assert(isComplex(r)
         && Math.abs(r.re + 1) < 1e-12
         && Math.abs(r.im) < 1e-12,
    'session055: P→C(1, 180°) = -1 in DEG');
  setAngle('RAD');
}

{
  setAngle('RAD');
  const s = new Stack();
  s.push(Complex(-2, 5));
  lookup('C→P').fn(s);
  lookup('P→C').fn(s);
  const r = s.pop();
  assert(isComplex(r)
         && Math.abs(r.re + 2) < 1e-10
         && Math.abs(r.im - 5) < 1e-10,
    'session055: C→P / P→C round-trips in RAD');
}

{
  setAngle('RAD');
  const s = new Stack();
  s.push(Real(7));
  lookup('C→P').fn(s);
  const r = s.pop();
  assert(isComplex(r) && Math.abs(r.re - 7) < 1e-12 && Math.abs(r.im) < 1e-12,
    'session055: C→P(7) = (7, 0)');
}

{
  setAngle('RAD');
  const s = new Stack();
  s.push(Complex(1, 0));
  lookup('C->P').fn(s);
  const r = s.pop();
  assert(isComplex(r) && Math.abs(r.re - 1) < 1e-12 && Math.abs(r.im) < 1e-12,
    'session055: C->P ASCII alias');
}

{
  setAngle('RAD');
  const s = new Stack();
  s.push(Complex(3, 0));
  lookup('P->C').fn(s);
  const r = s.pop();
  assert(isComplex(r) && Math.abs(r.re - 3) < 1e-12 && Math.abs(r.im) < 1e-12,
    'session055: P->C ASCII alias');
}

{
  const s = new Stack();
  s.push(Vector([Real(1), Real(2)]));
  assertThrows(() => { lookup('C→P').fn(s); }, /Bad argument type/, 'session055: C→P rejects Vector');
}

/* session398: C→P/P→C rejection symmetry.  session055 pinned only C→P's
   Vector reject and the C->P/P->C ASCII aliases' happy paths.  Both _cToPOp
   and _pToCOp accept Complex/Real/Integer and reject everything else with
   'Bad argument type'; the ASCII aliases share the canonical fn instance, so
   they reject identically.  This pins the missing P→C canonical reject and
   the two aliases' reject paths, guarding a refactor that splits an alias
   into its own impl and drops a guard. */
{
  assert(lookup('C->P').fn === lookup('C→P').fn,
    'session398: C->P shares the canonical C→P fn instance');
  assert(lookup('P->C').fn === lookup('P→C').fn,
    'session398: P->C shares the canonical P→C fn instance');

  const sv = new Stack(); sv.push(Vector([Real(1), Real(2)]));
  assertThrows(() => { lookup('P→C').fn(sv); }, /Bad argument type/,
    'session398: P→C rejects Vector (sibling of the session055 C→P pin)');

  const ss = new Stack(); ss.push(Str('x'));
  assertThrows(() => { lookup('P→C').fn(ss); }, /Bad argument type/,
    'session398: P→C rejects String');

  const sa1 = new Stack(); sa1.push(Vector([Real(1), Real(2)]));
  assertThrows(() => { lookup('C->P').fn(sa1); }, /Bad argument type/,
    'session398: ASCII C->P rejects Vector');
  const sa2 = new Stack(); sa2.push(Vector([Real(1), Real(2)]));
  assertThrows(() => { lookup('P->C').fn(sa2); }, /Bad argument type/,
    'session398: ASCII P->C rejects Vector');
}

/* ======================================================================
   Type-support widening.

   FLOOR / CEIL / IP / FP / SIGN / ARG / MOD / MIN / MAX widen with:
     - Symbolic lift on Name/Symbolic operands
     - Vector/Matrix element-wise on FLOOR/CEIL/IP/FP/SIGN/ARG
     - Tagged transparency (unary: re-tags result; binary: drops tag)
   Complex is rejected on FLOOR/CEIL/IP/FP/MOD/MIN/MAX — ℂ has no
   total ordering or well-defined integer-part, matching HP50 behavior.
   SIGN/ARG handle Complex + Vector natively for SIGN.
   ====================================================================== */

{
  const s = new Stack();
  s.push(Name('X'));
  lookup('FLOOR').fn(s);
  const sym = s.peek();
  assert(sym && sym.type === 'symbolic' && sym.expr.kind === 'fn'
      && sym.expr.name === 'FLOOR' && sym.expr.args[0].kind === 'var'
      && sym.expr.args[0].name === 'X',
    'session062: FLOOR on Name lifts to Symbolic(FLOOR(X))');
}
{
  const s = new Stack();
  s.push(Name('Y'));
  lookup('CEIL').fn(s);
  const sym = s.peek();
  assert(sym && sym.type === 'symbolic' && sym.expr.kind === 'fn'
      && sym.expr.name === 'CEIL',
    'session062: CEIL on Name lifts to Symbolic');
}
{
  const s = new Stack();
  s.push(Name('Z'));
  lookup('IP').fn(s);
  assert(s.peek().type === 'symbolic' && s.peek().expr.name === 'IP',
    'session062: IP on Name lifts to Symbolic');
}
{
  const s = new Stack();
  s.push(Name('W'));
  lookup('FP').fn(s);
  assert(s.peek().type === 'symbolic' && s.peek().expr.name === 'FP',
    'session062: FP on Name lifts to Symbolic');
}

{
  const parsed = parseEntry("`FLOOR(X+1)`");
  const s = new Stack();
  // parseEntry returns an array of stack-push items.
  for (const item of parsed) s.push(item);
  const v = s.peek();
  assert(v && v.type === 'symbolic' && v.expr.kind === 'fn' && v.expr.name === 'FLOOR',
    'session062: FLOOR(X+1) parses as Symbolic(FLOOR(…))');
}

{
  const s = new Stack();
  s.push(Vector([Real(1.7), Real(-2.3), Real(3)]));
  lookup('FLOOR').fn(s);
  const v = s.peek();
  assert(v.type === 'vector'
      && isReal(v.items[0]) && v.items[0].value.eq(1)
      && isReal(v.items[1]) && v.items[1].value.eq(-3)
      && isReal(v.items[2]) && v.items[2].value.eq(3),
    'session062: FLOOR on Vector element-wise');
}
{
  const s = new Stack();
  s.push(Vector([Real(1.2), Real(-1.2)]));
  lookup('CEIL').fn(s);
  const v = s.peek();
  assert(v.type === 'vector'
      && v.items[0].value.eq(2) && v.items[1].value.eq(-1),
    'session062: CEIL on Vector element-wise');
}
{
  const s = new Stack();
  s.push(Vector([Real(1.7), Real(-2.3)]));
  lookup('IP').fn(s);
  const v = s.peek();
  assert(v.items[0].value.eq(1) && v.items[1].value.eq(-2),
    'session062: IP on Vector element-wise');
}
{
  const s = new Stack();
  s.push(Vector([Real(1.25), Real(-0.5)]));
  lookup('FP').fn(s);
  const v = s.peek();
  assert(Math.abs(v.items[0].value - 0.25) < 1e-12
      && Math.abs(v.items[1].value - (-0.5)) < 1e-12,
    'session062: FP on Vector element-wise');
}

{
  const s = new Stack();
  s.push(Matrix([[Real(1.7), Real(-2.3)], [Real(0.5), Real(4.9)]]));
  lookup('FLOOR').fn(s);
  const m = s.peek();
  assert(m.type === 'matrix'
      && m.rows[0][0].value.eq(1) && m.rows[0][1].value.eq(-3)
      && m.rows[1][0].value.eq(0) && m.rows[1][1].value.eq(4),
    'session062: FLOOR on Matrix element-wise');
}

{
  const s = new Stack();
  s.push(Tagged('Price', Real(4.7)));
  lookup('FLOOR').fn(s);
  const t = s.peek();
  assert(t.type === 'tagged' && t.tag === 'Price'
      && isReal(t.value) && t.value.value.eq(4),
    'session062: FLOOR on Tagged preserves tag and floors the value');
}

{
  const s = new Stack();
  s.push(Tagged('N', Integer(42n)));
  lookup('IP').fn(s);
  const t = s.peek();
  assert(t.type === 'tagged' && t.tag === 'N'
      && isInteger(t.value) && t.value.value === 42n,
    'session062: IP on Tagged(Integer) preserves tag, integer identity');
}

{
  const s = new Stack();
  s.push(Complex(1.5, 2.5));
  assertThrows(() => { lookup('FLOOR').fn(s); }, /Bad argument type/, 'session062: FLOOR rejects Complex');
}
{
  const s = new Stack();
  s.push(Complex(1.5, 2.5));
  assertThrows(() => { lookup('FP').fn(s); }, /Bad argument type/, 'session062: FP rejects Complex');
}

{
  const s = new Stack();
  s.push(Name('X'));
  lookup('SIGN').fn(s);
  const sym = s.peek();
  assert(sym.type === 'symbolic' && sym.expr.name === 'SIGN',
    'session062: SIGN on Name lifts to Symbolic');
}
{
  // SIGN already handled Vector as a unit-direction op.  The Matrix
  // branch (new) is element-wise scalar-SIGN.
  const s = new Stack();
  s.push(Matrix([[Real(-3), Real(0)], [Real(2.5), Real(-1)]]));
  lookup('SIGN').fn(s);
  const m = s.peek();
  assert(m.type === 'matrix'
      && m.rows[0][0].value.eq(-1) && m.rows[0][1].value.eq(0)
      && m.rows[1][0].value.eq(1)  && m.rows[1][1].value.eq(-1),
    'session062: SIGN on Matrix element-wise');
}
{
  const s = new Stack();
  s.push(Tagged('Profit', Real(-2.5)));
  lookup('SIGN').fn(s);
  const t = s.peek();
  assert(t.type === 'tagged' && t.tag === 'Profit'
      && isReal(t.value) && t.value.value.eq(-1),
    'session062: SIGN on Tagged preserves tag');
}

{
  const s = new Stack();
  s.push(Name('Z'));
  lookup('ARG').fn(s);
  assert(s.peek().type === 'symbolic' && s.peek().expr.name === 'ARG',
    'session062: ARG on Name lifts to Symbolic');
}
{
  setAngle('RAD');
  const s = new Stack();
  s.push(Vector([Real(1), Real(-1), Complex(0, 1)]));
  lookup('ARG').fn(s);
  const v = s.peek();
  assert(v.type === 'vector'
      && Math.abs(v.items[0].value - 0) < 1e-12
      && Math.abs(v.items[1].value - Math.PI) < 1e-12
      && Math.abs(v.items[2].value - Math.PI / 2) < 1e-12,
    'session062: ARG on Vector element-wise in RAD mode');
}
{
  setAngle('RAD');
  const s = new Stack();
  s.push(Matrix([[Real(2), Real(-3)], [Complex(0, 1), Real(0)]]));
  lookup('ARG').fn(s);
  const m = s.peek();
  assert(m.type === 'matrix'
      && Math.abs(m.rows[0][0].value - 0) < 1e-12
      && Math.abs(m.rows[0][1].value - Math.PI) < 1e-12
      && Math.abs(m.rows[1][0].value - Math.PI / 2) < 1e-12
      && Math.abs(m.rows[1][1].value - 0) < 1e-12,
    'session062: ARG on Matrix element-wise');
}
{
  setAngle('RAD');
  const s = new Stack();
  s.push(Tagged('phase', Complex(0, 1)));
  lookup('ARG').fn(s);
  const t = s.peek();
  assert(t.type === 'tagged' && t.tag === 'phase'
      && isReal(t.value) && Math.abs(t.value.value - Math.PI / 2) < 1e-12,
    'session062: ARG on Tagged preserves tag');
}

{
  const s = new Stack();
  s.push(Name('X'));
  s.push(Real(3));
  lookup('MOD').fn(s);
  const sym = s.peek();
  assert(sym.type === 'symbolic' && sym.expr.kind === 'fn'
      && sym.expr.name === 'MOD' && sym.expr.args.length === 2,
    'session062: MOD with Name left operand lifts to Symbolic(MOD(X,3))');
}
{
  const s = new Stack();
  s.push(Real(10));
  s.push(Name('Y'));
  lookup('MOD').fn(s);
  assert(s.peek().type === 'symbolic' && s.peek().expr.name === 'MOD',
    'session062: MOD with Name right operand lifts to Symbolic');
}
{
  // Tagged binary — result is untagged (we drop the tag on binaries).
  const s = new Stack();
  s.push(Tagged('A', Real(7)));
  s.push(Real(3));
  lookup('MOD').fn(s);
  const v = s.peek();
  assert(isReal(v) && v.value.eq(1),
    'session062: MOD on Tagged L drops tag, computes 7 mod 3 = 1');
}
{
  const s = new Stack();
  s.push(Real(-7));
  s.push(Tagged('D', Real(3)));
  lookup('MOD').fn(s);
  const v = s.peek();
  assert(isReal(v) && v.value.eq(2),
    'session062: MOD on Tagged R drops tag, computes -7 mod 3 = 2 (sign of divisor)');
}
{
  // Complex remains rejected.
  const s = new Stack();
  s.push(Complex(1, 1));
  s.push(Real(3));
  assertThrows(() => { lookup('MOD').fn(s); }, /Bad argument type/, 'session062: MOD still rejects Complex (no total order in ℂ)');
}

{
  const s = new Stack();
  s.push(Name('X'));
  s.push(Real(3));
  lookup('MIN').fn(s);
  const sym = s.peek();
  assert(sym.type === 'symbolic' && sym.expr.name === 'MIN'
      && sym.expr.args.length === 2,
    'session062: MIN(X, 3) lifts to Symbolic');
}
{
  const s = new Stack();
  s.push(Real(5));
  s.push(Name('Y'));
  lookup('MAX').fn(s);
  assert(s.peek().type === 'symbolic' && s.peek().expr.name === 'MAX',
    'session062: MAX(5, Y) lifts to Symbolic');
}
{
  const s = new Stack();
  s.push(Tagged('Lo', Real(2)));
  s.push(Tagged('Hi', Real(9)));
  lookup('MIN').fn(s);
  const v = s.peek();
  assert(isReal(v) && v.value.eq(2),
    'session062: MIN on two Tagged drops tags, returns min');
}
{
  const s = new Stack();
  s.push(Tagged('Lo', Real(2)));
  s.push(Tagged('Hi', Real(9)));
  lookup('MAX').fn(s);
  const v = s.peek();
  assert(isReal(v) && v.value.eq(9),
    'session062: MAX on two Tagged drops tags, returns max');
}
{
  // Complex still rejected (no total order on ℂ).
  const s = new Stack();
  s.push(Complex(1, 1));
  s.push(Real(3));
  assertThrows(() => { lookup('MIN').fn(s); }, /Bad argument type/, 'session062: MIN still rejects Complex');
}

{
  const parsed = parseEntry("`MIN(X,3)`");
  const s = new Stack();
  for (const item of parsed) s.push(item);
  const v = s.peek();
  assert(v && v.type === 'symbolic' && v.expr.kind === 'fn' && v.expr.name === 'MIN',
    'session062: MIN(X,3) parses as Symbolic(MIN(…))');
}
{
  const parsed = parseEntry("`MOD(X,2)`");
  const s = new Stack();
  for (const item of parsed) s.push(item);
  const v = s.peek();
  assert(v && v.type === 'symbolic' && v.expr.kind === 'fn' && v.expr.name === 'MOD',
    'session062: MOD(X,2) parses as Symbolic(MOD(…))');
}
{
  const parsed = parseEntry("`SIGN(X)`");
  const s = new Stack();
  for (const item of parsed) s.push(item);
  const v = s.peek();
  assert(v && v.type === 'symbolic' && v.expr.kind === 'fn' && v.expr.name === 'SIGN',
    'session062: SIGN(X) parses as Symbolic(SIGN(…))');
}

/* ============================================================
 * Vector / Matrix element-wise + Tagged
 *   for the trig, hyperbolic, log, sqrt, fact families.
 *
 * Every widened op picks up three new axes:
 *   - Vector (apply f to each element, return a Vector)
 *   - Matrix (apply f to each entry, return a Matrix)
 *   - Tagged (unwrap, apply, re-tag with same label)
 *
 * FACT additionally gets Symbolic / Name lift and List distribution.
 * ============================================================ */

const _approx = (got, want, tol = 1e-9) => {
  // `got` may be a Decimal (from a Real's .value) or a plain JS number.
  const g = (typeof got === 'object' && got && typeof got.toNumber === 'function')
    ? got.toNumber() : Number(got);
  return Math.abs(g - want) < tol;
};

setAngle('RAD');

{
  const s = new Stack();
  s.push(Vector([Real(0), Real(Math.PI / 2), Real(Math.PI)]));
  lookup('SIN').fn(s);
  const v = s.peek();
  assert(v.type === 'vector'
      && _approx(v.items[0].value, 0)
      && _approx(v.items[1].value, 1)
      && _approx(v.items[2].value, 0),
    'session063: SIN dispatches element-wise on Vector');
}
{
  const s = new Stack();
  s.push(Matrix([
    [Real(0),         Real(Math.PI)],
    [Real(Math.PI/2), Real(-Math.PI/2)],
  ]));
  lookup('COS').fn(s);
  const v = s.peek();
  assert(v.type === 'matrix'
      && _approx(v.rows[0][0].value, 1)
      && _approx(v.rows[0][1].value, -1)
      && _approx(v.rows[1][0].value, 0)
      && _approx(v.rows[1][1].value, 0),
    'session063: COS dispatches element-wise on Matrix');
}
{
  const s = new Stack();
  s.push(Tagged('θ', Real(Math.PI / 4)));
  lookup('TAN').fn(s);
  const v = s.peek();
  assert(v.type === 'tagged' && v.tag === 'θ' && _approx(v.value.value, 1),
    'session063: TAN on Tagged Real preserves the tag');
}

{
  const s = new Stack();
  s.push(Vector([Real(0), Real(1)]));
  lookup('ASIN').fn(s);
  const v = s.peek();
  assert(v.type === 'vector'
      && _approx(v.items[0].value, 0)
      && _approx(v.items[1].value, Math.PI / 2),
    'session063: ASIN dispatches element-wise on Vector');
}
{
  const s = new Stack();
  s.push(Matrix([[Real(1), Real(-1)]]));
  lookup('ACOS').fn(s);
  const v = s.peek();
  assert(v.type === 'matrix'
      && _approx(v.rows[0][0].value, 0)
      && _approx(v.rows[0][1].value, Math.PI),
    'session063: ACOS dispatches element-wise on Matrix');
}
{
  const s = new Stack();
  s.push(Tagged('slope', Real(1)));
  lookup('ATAN').fn(s);
  const v = s.peek();
  assert(v.type === 'tagged' && v.tag === 'slope'
      && _approx(v.value.value, Math.PI / 4),
    'session063: ATAN on Tagged Real preserves the tag');
}

{
  const s = new Stack();
  s.push(Vector([Real(0), Real(1)]));
  lookup('SINH').fn(s);
  const v = s.peek();
  assert(v.type === 'vector'
      && _approx(v.items[0].value, 0)
      && _approx(v.items[1].value, Math.sinh(1)),
    'session063: SINH dispatches element-wise on Vector');
}
{
  const s = new Stack();
  s.push(Matrix([[Real(0), Real(1)], [Real(2), Real(-1)]]));
  lookup('COSH').fn(s);
  const v = s.peek();
  assert(v.type === 'matrix'
      && _approx(v.rows[0][0].value, 1)
      && _approx(v.rows[0][1].value, Math.cosh(1))
      && _approx(v.rows[1][0].value, Math.cosh(2))
      && _approx(v.rows[1][1].value, Math.cosh(1)),
    'session063: COSH dispatches element-wise on Matrix');
}
{
  const s = new Stack();
  s.push(Tagged('h', Real(0)));
  lookup('TANH').fn(s);
  const v = s.peek();
  assert(v.type === 'tagged' && v.tag === 'h' && _approx(v.value.value, 0),
    'session063: TANH on Tagged Real preserves the tag');
}
{
  const s = new Stack();
  s.push(Vector([Real(0), Real(1)]));
  lookup('ASINH').fn(s);
  const v = s.peek();
  assert(v.type === 'vector'
      && _approx(v.items[0].value, 0)
      && _approx(v.items[1].value, Math.asinh(1)),
    'session063: ASINH dispatches element-wise on Vector');
}
{
  // ACOSH on Vector — domain is x>=1; test the in-domain branch
  const s = new Stack();
  s.push(Vector([Real(1), Real(2)]));
  lookup('ACOSH').fn(s);
  const v = s.peek();
  assert(v.type === 'vector'
      && _approx(v.items[0].value, 0)
      && _approx(v.items[1].value, Math.acosh(2)),
    'session063: ACOSH dispatches element-wise on Vector');
}
{
  const s = new Stack();
  s.push(Tagged('z', Real(0)));
  lookup('ATANH').fn(s);
  const v = s.peek();
  assert(v.type === 'tagged' && v.tag === 'z' && _approx(v.value.value, 0),
    'session063: ATANH on Tagged Real preserves the tag');
}

{
  const s = new Stack();
  s.push(Vector([Real(1), Real(Math.E), Real(Math.E * Math.E)]));
  lookup('LN').fn(s);
  const v = s.peek();
  assert(v.type === 'vector'
      && _approx(v.items[0].value, 0)
      && _approx(v.items[1].value, 1)
      && _approx(v.items[2].value, 2),
    'session063: LN dispatches element-wise on Vector');
}
{
  const s = new Stack();
  s.push(Matrix([[Real(1), Real(10)], [Real(100), Real(1000)]]));
  lookup('LOG').fn(s);
  const v = s.peek();
  assert(v.type === 'matrix'
      && _approx(v.rows[0][0].value, 0)
      && _approx(v.rows[0][1].value, 1)
      && _approx(v.rows[1][0].value, 2)
      && _approx(v.rows[1][1].value, 3),
    'session063: LOG dispatches element-wise on Matrix');
}
{
  const s = new Stack();
  s.push(Vector([Real(0), Real(1)]));
  lookup('EXP').fn(s);
  const v = s.peek();
  assert(v.type === 'vector'
      && _approx(v.items[0].value, 1)
      && _approx(v.items[1].value, Math.E),
    'session063: EXP dispatches element-wise on Vector');
}
{
  const s = new Stack();
  s.push(Tagged('mag', Real(2)));
  lookup('ALOG').fn(s);
  const v = s.peek();
  assert(v.type === 'tagged' && v.tag === 'mag'
      && _approx(v.value.value, 100),
    'session063: ALOG on Tagged Real preserves the tag (10^2 = 100)');
}

{
  const s = new Stack();
  s.push(Vector([Real(1), Real(4), Real(9), Real(16)]));
  lookup('SQRT').fn(s);
  const v = s.peek();
  assert(v.type === 'vector'
      && _approx(v.items[0].value, 1)
      && _approx(v.items[1].value, 2)
      && _approx(v.items[2].value, 3)
      && _approx(v.items[3].value, 4),
    'session063: SQRT dispatches element-wise on Vector');
}
{
  const s = new Stack();
  s.push(Matrix([[Real(0), Real(0.25)], [Real(2.25), Real(6.25)]]));
  lookup('SQRT').fn(s);
  const v = s.peek();
  assert(v.type === 'matrix'
      && _approx(v.rows[0][0].value, 0)
      && _approx(v.rows[0][1].value, 0.5)
      && _approx(v.rows[1][0].value, 1.5)
      && _approx(v.rows[1][1].value, 2.5),
    'session063: SQRT dispatches element-wise on Matrix');
}
{
  const s = new Stack();
  s.push(Tagged('area', Real(81)));
  lookup('SQRT').fn(s);
  const v = s.peek();
  assert(v.type === 'tagged' && v.tag === 'area' && _approx(v.value.value, 9),
    'session063: SQRT on Tagged Real preserves the tag');
}
{
  // SQRT on Vector with a negative entry → Complex element (tagged of vector)
  const s = new Stack();
  s.push(Vector([Real(-4), Real(9)]));
  lookup('SQRT').fn(s);
  const v = s.peek();
  assert(v.type === 'vector'
      && v.items[0].type === 'complex'
      && _approx(v.items[0].im, 2)
      && _approx(v.items[1].value, 3),
    'session063: SQRT on Vector promotes negative entries to Complex');
}

{
  const s = new Stack();
  s.push(Name('N'));
  lookup('FACT').fn(s);
  const v = s.peek();
  assert(v.type === 'symbolic' && v.expr.kind === 'fn'
      && v.expr.name === 'FACT'
      && v.expr.args.length === 1 && v.expr.args[0].kind === 'var',
    'session063: FACT on Name lifts to Symbolic FACT(N)');
}
{
  const s = new Stack();
  s.push(RList([Integer(3n), Integer(4n), Integer(5n)]));
  lookup('FACT').fn(s);
  const v = s.peek();
  assert(v.type === 'list'
      && v.items[0].type === 'integer' && v.items[0].value === 6n
      && v.items[1].type === 'integer' && v.items[1].value === 24n
      && v.items[2].type === 'integer' && v.items[2].value === 120n,
    'session063: FACT distributes over List ({3 4 5} → {6 24 120})');
}
{
  const s = new Stack();
  s.push(Vector([Integer(3n), Integer(4n), Integer(5n)]));
  lookup('FACT').fn(s);
  const v = s.peek();
  assert(v.type === 'vector'
      && v.items[0].value === 6n
      && v.items[1].value === 24n
      && v.items[2].value === 120n,
    'session063: FACT dispatches element-wise on Vector');
}
{
  const s = new Stack();
  s.push(Matrix([[Integer(0n), Integer(1n)], [Integer(5n), Integer(6n)]]));
  lookup('FACT').fn(s);
  const v = s.peek();
  assert(v.type === 'matrix'
      && v.rows[0][0].value === 1n
      && v.rows[0][1].value === 1n
      && v.rows[1][0].value === 120n
      && v.rows[1][1].value === 720n,
    'session063: FACT dispatches element-wise on Matrix');
}
{
  const s = new Stack();
  s.push(Tagged('n', Integer(6n)));
  lookup('FACT').fn(s);
  const v = s.peek();
  assert(v.type === 'tagged' && v.tag === 'n'
      && v.value.type === 'integer' && v.value.value === 720n,
    'session063: FACT on Tagged Integer preserves the tag');
}

{
  const s = new Stack();
  s.push(Vector([Real(0), Real(1)]));
  lookup('LNP1').fn(s);
  const v = s.peek();
  assert(v.type === 'vector'
      && _approx(v.items[0].value, 0)
      && _approx(v.items[1].value, Math.log(2)),
    'session063: LNP1 dispatches element-wise on Vector');
}
{
  const s = new Stack();
  s.push(Tagged('dx', Real(0)));
  lookup('EXPM').fn(s);
  const v = s.peek();
  assert(v.type === 'tagged' && v.tag === 'dx' && _approx(v.value.value, 0),
    'session063: EXPM on Tagged Real preserves the tag');
}

{
  const s = new Stack();
  s.push(Program([Real(1)]));
  assertThrows(() => { lookup('SIN').fn(s); }, /Bad argument/, 'session063: SIN still rejects Program (no Bad argument bypass)');
}
{
  const s = new Stack();
  s.push(Program([Real(1)]));
  assertThrows(() => { lookup('LN').fn(s); }, /Bad argument/, 'session063: LN still rejects Program');
}
{
  // FACT on Complex still rejects (HP50 gamma is real-only).
  const s = new Stack();
  s.push(Complex(2, 1));
  assertThrows(() => { lookup('FACT').fn(s); }, /Bad argument type/, 'session063: FACT still rejects Complex (no complex-Γ)');
}
{
  // FACT on negative integer → Bad argument value.
  const s = new Stack();
  s.push(Integer(-3n));
  assertThrows(() => { lookup('FACT').fn(s); }, /Bad argument value/, 'session063: FACT(-3) still throws Bad argument value');
}

{
  const s = new Stack();
  s.push(Tagged('temps', Vector([Real(0), Real(1)])));
  lookup('SINH').fn(s);
  const v = s.peek();
  assert(v.type === 'tagged' && v.tag === 'temps'
      && v.value.type === 'vector'
      && _approx(v.value.items[0].value, 0)
      && _approx(v.value.items[1].value, Math.sinh(1)),
    'session063: SINH on Tagged-of-Vector preserves tag and dispatches inside');
}

{
  const parsed = parseEntry("`FACT(X)`");
  const s = new Stack();
  for (const item of parsed) s.push(item);
  const v = s.peek();
  assert(v && v.type === 'symbolic' && v.expr.kind === 'fn' && v.expr.name === 'FACT',
    'session063: FACT(X) parses as Symbolic(FACT(…))');
}

/* ============================================================
 * type-widening assertions
 *
 * Three clusters:
 *   (a) GCD / LCM — gain Tagged + List + Symbolic/Name.
 *   (b) % / %T / %CH — gain Tagged + List.
 *   (c) INV / SQ — gain Tagged (List was already present).
 *
 * Every widened cell earns ≥1 positive test.  Rejection tests
 * pin the HP50 boundaries: GCD still refuses a non-integer
 * Real, %/%T/%CH still refuse a Complex, INV/SQ still refuse a
 * String or Program.
 * ============================================================ */

{
  // Tagged × Real on GCD: unwrap both, drop tag (binary convention).
  const s = new Stack();
  s.push(Tagged('num', Integer(12n)));
  s.push(Integer(18n));
  lookup('GCD').fn(s);
  const v = s.peek();
  assert(v.type === 'integer' && v.value === 6n,
    'session064: GCD on Tagged × Integer unwraps and drops tag');
}
{
  // List × scalar on GCD distributes element-wise.
  const s = new Stack();
  s.push(RList([Integer(12n), Integer(18n), Integer(30n)]));
  s.push(Integer(6n));
  lookup('GCD').fn(s);
  const v = s.peek();
  assert(v.type === 'list'
      && v.items.length === 3
      && v.items[0].value === 6n
      && v.items[1].value === 6n
      && v.items[2].value === 6n,
    'session064: GCD distributes across List × scalar');
}
{
  // List × List on LCM pairs element-wise (same length).
  const s = new Stack();
  s.push(RList([Integer(4n), Integer(6n)]));
  s.push(RList([Integer(6n), Integer(8n)]));
  lookup('LCM').fn(s);
  const v = s.peek();
  assert(v.type === 'list'
      && v.items.length === 2
      && v.items[0].value === 12n
      && v.items[1].value === 24n,
    'session064: LCM pairs element-wise on List × List');
}
{
  // Name × Name lifts to Symbolic(GCD(M, N)).
  const s = new Stack();
  s.push(Name('M', { quoted: true }));
  s.push(Name('N', { quoted: true }));
  lookup('GCD').fn(s);
  const v = s.peek();
  assert(v && v.type === 'symbolic'
      && v.expr.kind === 'fn'
      && v.expr.name === 'GCD',
    'session064: GCD lifts Name × Name to Symbolic(GCD(…))');
}
{
  // Name × Integer lifts to Symbolic(LCM(X, 6)).
  const s = new Stack();
  s.push(Name('X', { quoted: true }));
  s.push(Integer(6n));
  lookup('LCM').fn(s);
  const v = s.peek();
  assert(v && v.type === 'symbolic'
      && v.expr.kind === 'fn'
      && v.expr.name === 'LCM'
      && v.expr.args.length === 2,
    'session064: LCM lifts Name × Integer to Symbolic(LCM(X, 6))');
}
{
  // Tagged on both sides on LCM: unwrap both, drop tag.
  const s = new Stack();
  s.push(Tagged('p', Integer(4n)));
  s.push(Tagged('q', Integer(6n)));
  lookup('LCM').fn(s);
  const v = s.peek();
  assert(v.type === 'integer' && v.value === 12n,
    'session064: LCM on Tagged × Tagged drops both tags');
}
{
  // GCD symbolic round-trip through the entry parser.
  const parsed = parseEntry("`GCD(M,N)`");
  const s = new Stack();
  for (const item of parsed) s.push(item);
  const v = s.peek();
  assert(v && v.type === 'symbolic'
      && v.expr.kind === 'fn'
      && v.expr.name === 'GCD',
    'session064: GCD(M,N) parses as Symbolic(GCD(…)) (KNOWN_FUNCTIONS)');
}
{
  // Rejection: non-integer Real still throws even with Tagged wrapper.
  const s = new Stack();
  s.push(Tagged('x', Real(1.5)));
  s.push(Integer(3n));
  assertThrows(() => { lookup('GCD').fn(s); }, /Bad argument/,
    'session064: GCD still rejects non-integer Real inside a Tagged');
}
{
  // Rejection: Complex still rejected even via a List.
  const s = new Stack();
  s.push(RList([Complex(1, 2)]));
  s.push(Integer(3n));
  assertThrows(() => { lookup('GCD').fn(s); }, /Bad argument/,
    'session064: GCD still rejects Complex element inside a List');
}

/* ============================================================
 * session314: GCD / LCM integer-valued-Real acceptance arm
 *
 * The DATA_TYPES R* (`~`) cell — "R accepted only when
 * integer-valued" — is `_toBigIntOrThrow`'s `isReal(v) &&
 * v.value.isInteger()` branch (ops.js ~1561), distinct from the
 * `isInteger(v)` branch every Integer-operand pin already hits.
 * session064 pins only the NEGATIVE side (non-integer Real 1.5
 * rejected); every positive GCD/LCM pin pushes Integer, so the
 * integer-valued-Real ACCEPTANCE arm was never exercised. These
 * guard a refactor narrowing GCD/LCM to Integer-only (dropping the
 * isReal arm), which would silently break `Real(12) Real(18) GCD`.
 * Probed live first; no source change.
 * ============================================================ */
{
  // Both operands integer-valued Real → accepted, Integer result.
  const s = new Stack();
  s.push(Real(12));
  s.push(Real(18));
  lookup('GCD').fn(s);
  const v = s.peek();
  assert(v.type === 'integer' && v.value === 6n,
    'session314: GCD Real(12) Real(18) → Integer(6) (integer-valued Real arm)');
}
{
  // Mixed Real × Integer → integer-valued Real coerces.
  const s = new Stack();
  s.push(Real(12));
  s.push(Integer(18n));
  lookup('GCD').fn(s);
  const v = s.peek();
  assert(v.type === 'integer' && v.value === 6n,
    'session314: GCD Real(12) Integer(18) → Integer(6) (left Real arm)');
}
{
  // Mixed Integer × Real → right operand exercises the Real arm.
  const s = new Stack();
  s.push(Integer(12n));
  s.push(Real(18));
  lookup('GCD').fn(s);
  const v = s.peek();
  assert(v.type === 'integer' && v.value === 6n,
    'session314: GCD Integer(12) Real(18) → Integer(6) (right Real arm)');
}
{
  // GCD(0, n) = |n| boundary through the Real arm.
  const s = new Stack();
  s.push(Real(0));
  s.push(Real(7));
  lookup('GCD').fn(s);
  const v = s.peek();
  assert(v.type === 'integer' && v.value === 7n,
    'session314: GCD Real(0) Real(7) → Integer(7) (zero boundary, Real arm)');
}
{
  // LCM with integer-valued Real operands.
  const s = new Stack();
  s.push(Real(4));
  s.push(Real(6));
  lookup('LCM').fn(s);
  const v = s.peek();
  assert(v.type === 'integer' && v.value === 12n,
    'session314: LCM Real(4) Real(6) → Integer(12) (integer-valued Real arm)');
}
{
  // LCM mixed Real × Integer.
  const s = new Stack();
  s.push(Real(4));
  s.push(Integer(6n));
  lookup('LCM').fn(s);
  const v = s.peek();
  assert(v.type === 'integer' && v.value === 12n,
    'session314: LCM Real(4) Integer(6) → Integer(12) (left Real arm)');
}
{
  // Rejection: bare non-integer Real (not Tagged) on LCM → Bad argument value.
  const s = new Stack();
  s.push(Real(4.2));
  s.push(Integer(6n));
  assertThrows(() => { lookup('LCM').fn(s); }, /Bad argument value/,
    'session314: LCM rejects bare non-integer Real (value, not type)');
}

{
  // Tagged × Real on %: unwrap the tag, compute, drop tag.
  const s = new Stack();
  s.push(Tagged('base', Real(200)));
  s.push(Real(10));
  lookup('%').fn(s);
  const v = s.peek();
  assert(v.type === 'real' && v.value.eq(20),
    'session064: % on Tagged × Real unwraps and drops tag');
}
{
  // List × scalar on %T: distribute element-wise.
  const s = new Stack();
  s.push(RList([Real(50), Real(100), Real(200)]));
  s.push(Real(40));
  lookup('%T').fn(s);
  const v = s.peek();
  assert(v.type === 'list'
      && v.items.length === 3
      && v.items[0].value.eq(80)
      && v.items[1].value.eq(40)
      && v.items[2].value.eq(20),
    'session064: %T distributes across List × scalar');
}
{
  // List × List on %CH: element-wise percent change.
  const s = new Stack();
  s.push(RList([Real(100), Real(200)]));
  s.push(RList([Real(125), Real(150)]));
  lookup('%CH').fn(s);
  const v = s.peek();
  assert(v.type === 'list'
      && v.items.length === 2
      && v.items[0].value.eq(25)
      && v.items[1].value.eq(-25),
    'session064: %CH pairs element-wise on List × List');
}
{
  // Rejection: Complex still thrown for %.
  const s = new Stack();
  s.push(Complex(1, 1));
  s.push(Real(10));
  assertThrows(() => { lookup('%').fn(s); }, /Bad argument/,
    'session064: % still rejects Complex (scalar-only, no C path)');
}
{
  // Rejection: %T with 0 base still throws Infinite result, even
  // when the 0 is inside a Tagged wrapper.
  const s = new Stack();
  s.push(Tagged('base', Real(0)));
  s.push(Real(10));
  assertThrows(() => { lookup('%T').fn(s); }, /Infinite result/,
    'session064: %T on Tagged(0) × Real still throws Infinite result');
}

{
  // Tagged Real on INV: unwrap, invert, re-tag.
  const s = new Stack();
  s.push(Tagged('r', Real(4)));
  lookup('INV').fn(s);
  const v = s.peek();
  assert(v.type === 'tagged' && v.tag === 'r'
      && v.value.type === 'real' && v.value.value.eq(0.25),
    'session064: INV on Tagged Real preserves the tag');
}
{
  // Tagged Matrix on INV: matrix inverse inside, tag preserved.
  const s = new Stack();
  s.push(Tagged('A', Matrix([
    [Real(1), Real(0)],
    [Real(0), Real(2)],
  ])));
  lookup('INV').fn(s);
  const v = s.peek();
  assert(v.type === 'tagged' && v.tag === 'A'
      && v.value.type === 'matrix'
      && _approx(v.value.rows[0][0].value, 1)
      && _approx(v.value.rows[1][1].value, 0.5),
    'session064: INV on Tagged Matrix preserves tag, computes inverse');
}
{
  // Tagged Real on SQ.
  const s = new Stack();
  s.push(Tagged('a', Real(3)));
  lookup('SQ').fn(s);
  const v = s.peek();
  assert(v.type === 'tagged' && v.tag === 'a'
      && v.value.type === 'real' && v.value.value.eq(9),
    'session064: SQ on Tagged Real preserves the tag');
}
{
  // Tagged Complex on SQ.
  const s = new Stack();
  s.push(Tagged('z', Complex(1, 2)));
  lookup('SQ').fn(s);
  const v = s.peek();
  assert(v.type === 'tagged' && v.tag === 'z'
      && v.value.type === 'complex'
      && v.value.re === -3 && v.value.im === 4,
    'session064: SQ on Tagged Complex preserves the tag');
}
{
  // Rejection: INV on a String still throws (Tagged wrapper doesn't
  // invent an inversion rule for non-numeric values).
  const s = new Stack();
  s.push(Tagged('note', Str('hi')));
  assertThrows(() => { lookup('INV').fn(s); }, /Bad argument type/,
    'session064: INV on Tagged-of-String still rejects');
}
{
  // Rejection: SQ on a Program still throws.
  const s = new Stack();
  s.push(Program([Real(1)]));
  assertThrows(() => { lookup('SQ').fn(s); }, /Bad argument type/,
    'session064: SQ on Program still rejects');
}

/* ==================================================================
 * new ops: COMB / PERM / IDIV2 / UTPN
 *
 * Each op gets at least one positive test and one rejection path.
 * Tagged / List wrappers are exercised where they apply to confirm
 * the wrapper plumbing composes with the new handler.
 * ================================================================== */

{
  const s = new Stack();
  s.push(Integer(7n));
  s.push(Integer(3n));
  lookup('COMB').fn(s);
  assert(s.depth === 1 && isInteger(s.peek()) && s.peek().value === 35n,
    'session065: COMB(7, 3) = 35');
}
{
  // Boundary: C(n, 0) = 1, C(n, n) = 1.
  const s = new Stack();
  s.push(Integer(100n));
  s.push(Integer(0n));
  lookup('COMB').fn(s);
  const r = s.pop();
  assert(isInteger(r) && r.value === 1n, 'session065: COMB(100, 0) = 1');

  s.push(Integer(100n));
  s.push(Integer(100n));
  lookup('COMB').fn(s);
  const r2 = s.pop();
  assert(isInteger(r2) && r2.value === 1n, 'session065: COMB(100, 100) = 1');
}
{
  // Big: C(40, 20) = 137846528820 — BigInt prevents overflow.
  const s = new Stack();
  s.push(Integer(40n));
  s.push(Integer(20n));
  lookup('COMB').fn(s);
  assert(isInteger(s.peek()) && s.peek().value === 137846528820n,
    'session065: COMB(40, 20) exact BigInt (no Number overflow)');
}
{
  // Integer-valued Reals are accepted.
  const s = new Stack();
  s.push(Real(6));
  s.push(Real(2));
  lookup('COMB').fn(s);
  assert(isInteger(s.peek()) && s.peek().value === 15n,
    'session065: COMB(6.0, 2.0) = 15 (integer-valued Reals coerce)');
}
{
  // Name × Name lifts to Symbolic.
  const s = new Stack();
  s.push(Name('N'));
  s.push(Name('K'));
  lookup('COMB').fn(s);
  const v = s.peek();
  assert(v && v.type === 'symbolic' && v.expr.kind === 'fn' && v.expr.name === 'COMB',
    'session065: COMB(N, K) lifts to Symbolic');
}
{
  // Tagged-transparent: binary ops drop the tag on the result.
  const s = new Stack();
  s.push(Tagged('n', Integer(5n)));
  s.push(Integer(2n));
  lookup('COMB').fn(s);
  const v = s.peek();
  assert(isInteger(v) && v.value === 10n,
    'session065: COMB on Tagged integer unwraps and drops tag');
}
{
  // List × scalar distributes.
  const s = new Stack();
  s.push(RList([Integer(4n), Integer(5n), Integer(6n)]));
  s.push(Integer(2n));
  lookup('COMB').fn(s);
  const v = s.peek();
  assert(v && v.type === 'list' && v.items.length === 3
      && v.items[0].value === 6n
      && v.items[1].value === 10n
      && v.items[2].value === 15n,
    'session065: COMB distributes over List × scalar');
}
{
  // Symbolic round-trip through parseEntry.
  const parsed = parseEntry("`COMB(N,K)`");
  const s = new Stack();
  for (const item of parsed) s.push(item);
  const v = s.peek();
  assert(v && v.type === 'symbolic' && v.expr.kind === 'fn' && v.expr.name === 'COMB'
      && v.expr.args.length === 2,
    'session065: COMB(N,K) parses via KNOWN_FUNCTIONS');
}
{
  // Rejection: m > n.
  const s = new Stack();
  s.push(Integer(3n));
  s.push(Integer(5n));
  assertThrows(() => { lookup('COMB').fn(s); }, /Bad argument value/, 'session065: COMB(3, 5) throws Bad argument value (m > n)');
}
{
  // Rejection: negative argument.
  const s = new Stack();
  s.push(Integer(-3n));
  s.push(Integer(2n));
  assertThrows(() => { lookup('COMB').fn(s); }, /Bad argument value/, 'session065: COMB(-3, 2) throws Bad argument value');
}
{
  // Rejection: non-integer Real.
  const s = new Stack();
  s.push(Real(5.5));
  s.push(Integer(2n));
  assertThrows(() => { lookup('COMB').fn(s); }, /Bad argument value/, 'session065: COMB(5.5, 2) throws Bad argument value');
}
{
  // Rejection: complex argument → Bad argument type.
  const s = new Stack();
  s.push(Complex(2, 1));
  s.push(Integer(1n));
  assertThrows(() => { lookup('COMB').fn(s); }, /Bad argument type/, 'session065: COMB((2,1), 1) throws Bad argument type');
}

{
  const s = new Stack();
  s.push(Integer(7n));
  s.push(Integer(3n));
  lookup('PERM').fn(s);
  // P(7, 3) = 7·6·5 = 210.
  assert(isInteger(s.peek()) && s.peek().value === 210n,
    'session065: PERM(7, 3) = 210');
}
{
  // P(n, 0) = 1 (empty product).
  const s = new Stack();
  s.push(Integer(10n));
  s.push(Integer(0n));
  lookup('PERM').fn(s);
  assert(isInteger(s.peek()) && s.peek().value === 1n,
    'session065: PERM(10, 0) = 1');
}
{
  // P(n, n) = n!
  const s = new Stack();
  s.push(Integer(6n));
  s.push(Integer(6n));
  lookup('PERM').fn(s);
  assert(isInteger(s.peek()) && s.peek().value === 720n,
    'session065: PERM(6, 6) = 720 = 6!');
}
{
  // Name × Integer lift.
  const s = new Stack();
  s.push(Name('N'));
  s.push(Integer(2n));
  lookup('PERM').fn(s);
  const v = s.peek();
  assert(v && v.type === 'symbolic' && v.expr.name === 'PERM'
      && v.expr.args.length === 2,
    'session065: PERM(N, 2) lifts to Symbolic');
}
{
  // Rejection: m > n.
  const s = new Stack();
  s.push(Integer(2n));
  s.push(Integer(5n));
  assertThrows(() => { lookup('PERM').fn(s); }, /Bad argument value/, 'session065: PERM(2, 5) throws Bad argument value (m > n)');
}
{
  // Rejection: non-numeric type.
  const s = new Stack();
  s.push(Str('five'));
  s.push(Integer(2n));
  assertThrows(() => { lookup('PERM').fn(s); }, /Bad argument type/, 'session065: PERM(String, 2) throws Bad argument type');
}

/* ---- C-011 close: COMB / PERM reject Rational with `Bad argument
   type` (was leaking a JavaScript TypeError because the legacy
   `_combPermArgs` guard accepted any `isNumber` value and the
   downstream `toBig` closure read `.value.isFinite()` on a Rational
   payload that has only `{n, d}`).  HP50 AUR §3-29 worked example
   shows the firmware rejects fractional COMB / PERM arguments
   uniformly — even integer-valued Rationals like `5/1` are rejected
   rather than silently coerced.  Six failure-mode pins below: COMB
   and PERM × {Rat on level 2, Rat on level 1, both Rat}. */
{
  const s = new Stack();
  s.push(Rational(5n, 1n));
  s.push(Integer(2n));
  assertThrows(() => { lookup('COMB').fn(s); }, /Bad argument type/, 'session153: COMB(Rat 5/1, Int 2) throws Bad argument type (C-011)');
}
{
  const s = new Stack();
  s.push(Integer(5n));
  s.push(Rational(2n, 1n));
  assertThrows(() => { lookup('COMB').fn(s); }, /Bad argument type/, 'session153: COMB(Int 5, Rat 2/1) throws Bad argument type (C-011)');
}
{
  const s = new Stack();
  s.push(Rational(5n, 1n));
  s.push(Rational(2n, 1n));
  assertThrows(() => { lookup('COMB').fn(s); }, /Bad argument type/, 'session153: COMB(Rat 5/1, Rat 2/1) throws Bad argument type (C-011)');
}
{
  const s = new Stack();
  s.push(Rational(5n, 1n));
  s.push(Integer(2n));
  assertThrows(() => { lookup('PERM').fn(s); }, /Bad argument type/, 'session153: PERM(Rat 5/1, Int 2) throws Bad argument type (C-011)');
}
{
  const s = new Stack();
  s.push(Integer(5n));
  s.push(Rational(2n, 1n));
  assertThrows(() => { lookup('PERM').fn(s); }, /Bad argument type/, 'session153: PERM(Int 5, Rat 2/1) throws Bad argument type (C-011)');
}
{
  const s = new Stack();
  s.push(Rational(5n, 1n));
  s.push(Rational(2n, 1n));
  assertThrows(() => { lookup('PERM').fn(s); }, /Bad argument type/, 'session153: PERM(Rat 5/1, Rat 2/1) throws Bad argument type (C-011)');
}
// Genuinely-fractional Rational also rejected — same `Bad argument
// type` (the type-narrowing happens before the integer-valued check
// in the `toBig` closure, which is what governs Real fractional
// rejection with `Bad argument value`).
{
  const s = new Stack();
  s.push(Rational(5n, 2n));
  s.push(Integer(1n));
  assertThrows(() => { lookup('COMB').fn(s); }, /Bad argument type/, 'session153: COMB(Rat 5/2, Int 1) throws Bad argument type (C-011)');
}
{
  const s = new Stack();
  s.push(Integer(7n));
  s.push(Rational(3n, 2n));
  assertThrows(() => { lookup('PERM').fn(s); }, /Bad argument type/, 'session153: PERM(Int 7, Rat 3/2) throws Bad argument type (C-011)');
}

/* ---- — C-011 follow-up: COMB / PERM rejection-arm
   composition pins. closed the bare-Rational arm
   (positive integer-valued + genuinely-fractional × COMB/PERM ×
   level-2/level-1/both).  This block closes:
     (a) Tagged-of-Rational composition — Tagged transparency
         unwraps to Rational, then the C-011 narrow guard rejects.
         Pin guards against a future "Tagged-of-Rational lift"
         that would silently coerce the Rational into a Real and
         bypass the type narrowing.
     (b) BinaryInteger arm — BinInt does not satisfy isInteger or
         isReal, so the new guard rejects. widened
         FLOOR/CEIL/IP/FP for BinInt; this pin guards against a
         well-meaning future widening that would do the same for
         COMB/PERM (HP50 AUR §3-29 is explicit that COMB / PERM
         take real-number arguments only — BinInt is out of scope).
     (c) Vector arm — there is no V/M distribution defined for
         COMB / PERM (the existing s065 pin covers List × scalar
         distribution only).  Vector should reject with Bad arg
         type.
     (d) Negative integer-valued Rational — symmetric to s153's
         positive Rat(5,1) pin; pins the negative-integer-valued
         arm of the type-narrowing.
*/
{
  /* (a) Tagged(Rational(5,1)) on level 2 — Tagged transparency
 unwraps the tag, the
     inner Rational then fails the C-011 narrow guard. */
  const s = new Stack();
  s.push(Tagged('a', Rational(5n, 1n)));
  s.push(Integer(2n));
  assertThrows(() => { lookup('COMB').fn(s); }, /Bad argument type/,
               'session156: COMB(Tagged(Rat 5/1), Int 2) throws Bad argument type (Tagged-transparency unwraps then C-011 guard fires; composition arm session 153 left unpinned)');
}
{
  /* (a cont) symmetric: Tagged(Rational) on level 1. */
  const s = new Stack();
  s.push(Integer(5n));
  s.push(Tagged('a', Rational(2n, 1n)));
  assertThrows(() => { lookup('PERM').fn(s); }, /Bad argument type/,
               'session156: PERM(Int 5, Tagged(Rat 2/1)) throws Bad argument type (Tagged-of-Rat composition arm; mirror of (a) but for PERM and level-1)');
}
{
  /* (b) BinaryInteger COMB — guard against the FLOOR/CEIL/IP/FP
     widening pattern landing on COMB. */
  const s = new Stack();
  s.push(BinaryInteger(5n, 'h'));
  s.push(Integer(2n));
  assertThrows(() => { lookup('COMB').fn(s); }, /Bad argument type/,
               'session156: COMB(BinInt 5h, Int 2) throws Bad argument type (BinInt out of scope per AUR §3-29 — guards against well-meaning widening pattern)');
}
{
  /* (b cont) BinaryInteger PERM — symmetric. */
  const s = new Stack();
  s.push(BinaryInteger(5n, 'h'));
  s.push(Integer(2n));
  assertThrows(() => { lookup('PERM').fn(s); }, /Bad argument type/,
               'session156: PERM(BinInt 5h, Int 2) throws Bad argument type (BinInt out of scope per AUR §3-29 — symmetric to COMB pin)');
}
{
  /* (c) Vector arm — no V/M distribution for COMB; only List ×
 scalar Pin Vector rejection so a
     future "uniform broadcast" refactor doesn't silently extend
     this surface. */
  const s = new Stack();
  s.push(Vector([Real(5), Real(7)]));
  s.push(Integer(2n));
  assertThrows(() => { lookup('COMB').fn(s); }, /Bad argument type/,
               'session156: COMB(Vector, Int) throws Bad argument type (no V/M distribution; only List × scalar broadcast is defined per session-065 pin)');
}
{
  /* (d) Negative integer-valued Rational — symmetric to s153's
     positive Rat(5,1) pin.  Pins the negative-int-valued arm of
     the type-narrowing rather than the value-domain check that
     COMB(-3, 2) hits at the next layer. */
  const s = new Stack();
  s.push(Rational(-5n, 1n));
  s.push(Integer(2n));
  assertThrows(() => { lookup('COMB').fn(s); }, /Bad argument type/,
               'session156: COMB(Rat -5/1, Int 2) throws Bad argument type (negative-int-valued Rat reject; type-narrowing fires before the negative-arg value-domain check would)');
}

{
  const s = new Stack();
  s.push(Integer(17n));
  s.push(Integer(5n));
  lookup('IDIV2').fn(s);
  assert(s.depth === 2,
    'session065: IDIV2 leaves two results on the stack');
  const r = s.pop(), q = s.pop();
  assert(isInteger(q) && q.value === 3n, 'session065: IDIV2(17, 5) quotient = 3');
  assert(isInteger(r) && r.value === 2n, 'session065: IDIV2(17, 5) remainder = 2');
}
{
  // Negative dividend: truncated division, remainder has sign of dividend.
  // -17 = (-3) * 5 + (-2).  Not -4 * 5 + 3 (that would be floor-div MOD).
  const s = new Stack();
  s.push(Integer(-17n));
  s.push(Integer(5n));
  lookup('IDIV2').fn(s);
  const r = s.pop(), q = s.pop();
  assert(q.value === -3n, 'session065: IDIV2(-17, 5) quotient = -3 (trunc)');
  assert(r.value === -2n, 'session065: IDIV2(-17, 5) remainder = -2 (sign of dividend)');
}
{
  // Even division: r = 0, q = a/b.
  const s = new Stack();
  s.push(Integer(100n));
  s.push(Integer(25n));
  lookup('IDIV2').fn(s);
  const r = s.pop(), q = s.pop();
  assert(q.value === 4n && r.value === 0n, 'session065: IDIV2(100, 25) = 4, 0');
}
{
  // Integer-valued Reals accepted.
  const s = new Stack();
  s.push(Real(23));
  s.push(Real(4));
  lookup('IDIV2').fn(s);
  const r = s.pop(), q = s.pop();
  assert(isInteger(q) && q.value === 5n && isInteger(r) && r.value === 3n,
    'session065: IDIV2(23.0, 4.0) accepts integer-valued Reals');
}
{
  // Rejection: zero divisor → Infinite result.
  const s = new Stack();
  s.push(Integer(10n));
  s.push(Integer(0n));
  assertThrows(() => { lookup('IDIV2').fn(s); }, /Infinite result/, 'session065: IDIV2(10, 0) throws Infinite result');
}
{
  // Rejection: non-integer Real → Bad argument value.
  const s = new Stack();
  s.push(Real(7.5));
  s.push(Integer(2n));
  assertThrows(() => { lookup('IDIV2').fn(s); }, /Bad argument value/, 'session065: IDIV2(7.5, 2) throws Bad argument value');
}
{
  // Rejection: complex operand → Bad argument type.
  const s = new Stack();
  s.push(Complex(3, 2));
  s.push(Integer(2n));
  assertThrows(() => { lookup('IDIV2').fn(s); }, /Bad argument type/, 'session065: IDIV2((3,2), 2) throws Bad argument type');
}

{
  // Symmetry: P(X > μ) = 0.5 at the mean.
  const s = new Stack();
  s.push(Real(0));       // μ
  s.push(Real(1));       // σ²
  s.push(Real(0));       // x
  lookup('UTPN').fn(s);
  const v = s.peek();
  assert(isReal(v) && _approx(v.value, 0.5, 1e-7),
    'session065: UTPN(0, 1, 0) = 0.5 at the mean');
}
{
  // Standard normal 1-σ tail: P(Z > 1) ≈ 0.158655.
  const s = new Stack();
  s.push(Real(0));
  s.push(Real(1));
  s.push(Real(1));
  lookup('UTPN').fn(s);
  const v = s.peek();
  assert(_approx(v.value, 0.15865525393145707, 5e-7),
    'session065: UTPN(0, 1, 1) ≈ 0.158655 (1-σ upper tail)');
}
{
  // Shifted / scaled: N(μ=5, σ²=4), x=9 is 2σ above mean — same as Z=2.
  // P(Z > 2) ≈ 0.02275.
  const s = new Stack();
  s.push(Real(5));
  s.push(Real(4));
  s.push(Real(9));
  lookup('UTPN').fn(s);
  const v = s.peek();
  assert(_approx(v.value, 0.02275013194817921, 5e-7),
    'session065: UTPN(5, 4, 9) ≈ 0.02275 (2-σ upper tail on shifted normal)');
}
{
  // Symmetric lower tail: P(X > −1) = 1 − P(X > 1) = 0.841345.
  const s = new Stack();
  s.push(Real(0));
  s.push(Real(1));
  s.push(Real(-1));
  lookup('UTPN').fn(s);
  const v = s.peek();
  assert(_approx(v.value, 0.8413447460685429, 5e-7),
    'session065: UTPN(0, 1, -1) ≈ 0.841345');
}
{
  // Integer arguments accepted on all three slots.
  const s = new Stack();
  s.push(Integer(0n));
  s.push(Integer(1n));
  s.push(Integer(0n));
  lookup('UTPN').fn(s);
  const v = s.peek();
  assert(isReal(v) && _approx(v.value, 0.5, 1e-7),
    'session065: UTPN accepts all-Integer args, returns Real');
}
{
  // Rejection: σ² ≤ 0 → Bad argument value (variance must be positive).
  const s = new Stack();
  s.push(Real(0));
  s.push(Real(0));
  s.push(Real(0));
  assertThrows(() => { lookup('UTPN').fn(s); }, /Bad argument value/, 'session065: UTPN with σ²=0 throws Bad argument value');
}
{
  // Rejection: σ² < 0.
  const s = new Stack();
  s.push(Real(0));
  s.push(Real(-1));
  s.push(Real(0));
  assertThrows(() => { lookup('UTPN').fn(s); }, /Bad argument value/, 'session065: UTPN with σ²<0 throws Bad argument value');
}
{
  // Rejection: complex argument → Bad argument type.
  const s = new Stack();
  s.push(Real(0));
  s.push(Real(1));
  s.push(Complex(1, 1));
  assertThrows(() => { lookup('UTPN').fn(s); }, /Bad argument type/, 'session065: UTPN with Complex x throws Bad argument type');
}

/* ============================================================
   Type-widening: Tagged transparency on the
   arithmetic family (+, -, *, /, ^) and on the complex / sign
   family (NEG, ABS, CONJ, RE, IM).  Plus MOD / MIN / MAX V/M
   rejection verification (matches HP50 AUR §3 scalar-only spec).

   Design notes:

   - Binary Tagged:   the tag drops on binary ops (no single label
                      to keep).  We verify the result is NOT a
                      Tagged node.
   - Unary Tagged:    the same label is carried through onto the
                      result, wrapping whatever the inner handler
                      produced (scalar, Vector, Matrix, Complex).
   - List-in-Tag:     `Tagged(lbl, List)` drops the tag, then the
                      list distributes.  The reverse is also
                      verified: `List of Tagged` distributes per
                      element leaving plain (tag-dropped) results.
   - Rejection:       tests that still-rejected types (String on
                      NEG, Program on `*`, etc.) continue to throw
                      the same errors even through the new Tagged
                      wrapper.  Guards against wrapper bugs that
                      might swallow errors or rewrite them.
   - MOD/MIN/MAX V/M: HP50 AUR §3 defines these as scalar-only.
                      Verifying rejection holds for Vector and
                      Matrix operands (both sides, and scalar ∘ V).
   ============================================================ */

{
  // `+` with both sides Tagged — tag drops, numeric value surfaces.
  const s = new Stack();
  s.push(Tagged('a', Real(2)));
  s.push(Tagged('b', Real(3)));
  lookup('+').fn(s);
  const v = s.peek();
  assert(v.type === 'real' && v.value.eq(5),
    'session068: Tagged + Tagged → numeric (tag drops)');
}
{
  // `+` with Tagged(Real) and Real — tag drops.
  const s = new Stack();
  s.push(Tagged('price', Real(200)));
  s.push(Real(50));
  lookup('+').fn(s);
  const v = s.peek();
  assert(v.type === 'real' && v.value.eq(250),
    'session068: Tagged(Real) + Real → plain Real');
}
{
  // `-` with Tagged on level 1 (right side) only.
  const s = new Stack();
  s.push(Real(20));
  s.push(Tagged('delta', Real(7)));
  lookup('-').fn(s);
  const v = s.peek();
  assert(v.type === 'real' && v.value.eq(13),
    'session068: Real - Tagged(Real) → plain Real (tag drops)');
}
{
  // `*` with both sides Tagged.
  const s = new Stack();
  s.push(Tagged('u', Integer(4n)));
  s.push(Tagged('v', Integer(5n)));
  lookup('*').fn(s);
  const v = s.peek();
  assert(v.type === 'integer' && v.value === 20n,
    'session068: Tagged(Int) * Tagged(Int) → Integer 20');
}
{
  // `/` with Tagged Integer / Tagged Integer, exact.
  const s = new Stack();
  s.push(Tagged('num', Integer(12n)));
  s.push(Tagged('den', Integer(3n)));
  lookup('/').fn(s);
  const v = s.peek();
  assert(v.type === 'integer' && v.value === 4n,
    'session068: Tagged(Int) / Tagged(Int) exact → Integer');
}
{
  // `^` with Tagged Real ^ Int.
  const s = new Stack();
  s.push(Tagged('base', Real(2)));
  s.push(Integer(10n));
  lookup('^').fn(s);
  const v = s.peek();
  assert(v.type === 'real' && v.value.eq(1024),
    'session068: Tagged(Real) ^ Int → 1024');
}
{
  // `+` on Tagged(String) with a String — string concat survives the
  // Tagged unwrap.
  const s = new Stack();
  s.push(Tagged('note', Str('hi')));
  s.push(Str('!'));
  lookup('+').fn(s);
  const v = s.peek();
  assert(v.type === 'string' && v.value === 'hi!',
    'session068: Tagged(String) + String → string concat (tag drops)');
}
{
  // `*` on Tagged(List) distributes under the list wrapper.
  // Tagged drops first, then the list takes over.
  const s = new Stack();
  s.push(Tagged('ks', RList([Real(1), Real(2), Real(3)])));
  s.push(Real(10));
  lookup('*').fn(s);
  const v = s.peek();
  assert(v.type === 'list' && v.items.length === 3
      && v.items[0].value.eq(10) && v.items[2].value.eq(30),
    'session068: Tagged(List) * scalar → List (tag drops first)');
}
{
  // `+` Tagged + Complex — the Tagged drops, the Complex surfaces.
  const s = new Stack();
  s.push(Tagged('z', Complex(1, 2)));
  s.push(Complex(3, 4));
  lookup('+').fn(s);
  const v = s.peek();
  assert(v.type === 'complex' && v.re === 4 && v.im === 6,
    'session068: Tagged(Complex) + Complex → plain Complex');
}
{
  // Rejection: + on Tagged(Program) + Real still throws.
  const s = new Stack();
  s.push(Tagged('p', Program([Real(1)])));
  s.push(Real(2));
  assertThrows(() => { lookup('+').fn(s); }, /Bad argument type/,
    'session068: + rejects Tagged(Program) + Real with Bad argument type');
}
{
  // Rejection: / with Tagged dividing by 0 still reports Infinite result.
  const s = new Stack();
  s.push(Tagged('n', Real(5)));
  s.push(Tagged('d', Real(0)));
  assertThrows(() => { lookup('/').fn(s); }, /(Infinite result|Undefined)/,
    'session068: Tagged / Tagged(0) → Infinite result (tag does not mask)');
}

{
  // NEG on Tagged Real — retag with same label.
  const s = new Stack();
  s.push(Tagged('x', Real(5)));
  lookup('NEG').fn(s);
  const v = s.peek();
  assert(v.type === 'tagged' && v.tag === 'x'
      && v.value.type === 'real' && v.value.value.eq(-5),
    'session068: NEG on Tagged(Real) preserves tag, negates value');
}
{
  // NEG on Tagged Complex preserves tag.
  const s = new Stack();
  s.push(Tagged('z', Complex(1, -2)));
  lookup('NEG').fn(s);
  const v = s.peek();
  assert(v.type === 'tagged' && v.tag === 'z'
      && v.value.type === 'complex'
      && v.value.re === -1 && v.value.im === 2,
    'session068: NEG on Tagged(Complex) preserves tag, negates both parts');
}
{
  // NEG on Tagged(Vector) preserves tag, returns Tagged(Vector).
  const s = new Stack();
  s.push(Tagged('v', Vector([Real(1), Real(-2), Real(3)])));
  lookup('NEG').fn(s);
  const v = s.peek();
  assert(v.type === 'tagged' && v.tag === 'v'
      && v.value.type === 'vector'
      && v.value.items[0].value.eq(-1)
      && v.value.items[1].value.eq(2)
      && v.value.items[2].value.eq(-3),
    'session068: NEG on Tagged(Vector) preserves tag, element-wise negation');
}
{
  // ABS on Tagged Real keeps the tag.
  const s = new Stack();
  s.push(Tagged('err', Real(-7.25)));
  lookup('ABS').fn(s);
  const v = s.peek();
  assert(v.type === 'tagged' && v.tag === 'err'
      && v.value.type === 'real' && v.value.value.eq(7.25),
    'session068: ABS on Tagged(Real) preserves tag, takes abs');
}
{
  // ABS on Tagged(Complex) — returns Tagged(Real) = |z|.
  const s = new Stack();
  s.push(Tagged('z', Complex(3, 4)));
  lookup('ABS').fn(s);
  const v = s.peek();
  assert(v.type === 'tagged' && v.tag === 'z'
      && v.value.type === 'real' && v.value.value.eq(5),
    'session068: ABS on Tagged(Complex) preserves tag, |3+4i| = 5');
}
{
  // ABS on Tagged(Vector) — Frobenius norm, scalar re-tagged.
  const s = new Stack();
  s.push(Tagged('v', Vector([Real(3), Real(4)])));
  lookup('ABS').fn(s);
  const v = s.peek();
  assert(v.type === 'tagged' && v.tag === 'v'
      && v.value.type === 'real' && v.value.value.eq(5),
    'session068: ABS on Tagged(Vector) preserves tag, Frobenius = 5');
}
{
  // CONJ on Tagged(Complex) — conjugate, retag.
  const s = new Stack();
  s.push(Tagged('z', Complex(2, 3)));
  lookup('CONJ').fn(s);
  const v = s.peek();
  assert(v.type === 'tagged' && v.tag === 'z'
      && v.value.type === 'complex'
      && v.value.re === 2 && v.value.im === -3,
    'session068: CONJ on Tagged(Complex) preserves tag, conjugates');
}
{
  // RE on Tagged(Complex) — extracts real, retag.
  const s = new Stack();
  s.push(Tagged('z', Complex(7, 11)));
  lookup('RE').fn(s);
  const v = s.peek();
  assert(v.type === 'tagged' && v.tag === 'z'
      && v.value.type === 'real' && v.value.value.eq(7),
    'session068: RE on Tagged(Complex) preserves tag, extracts real part');
}
{
  // IM on Tagged(Complex) — extracts imag, retag.
  const s = new Stack();
  s.push(Tagged('z', Complex(7, 11)));
  lookup('IM').fn(s);
  const v = s.peek();
  assert(v.type === 'tagged' && v.tag === 'z'
      && v.value.type === 'real' && v.value.value.eq(11),
    'session068: IM on Tagged(Complex) preserves tag, extracts imag part');
}
{
  // Rejection: NEG on Tagged(String) still throws.
  const s = new Stack();
  s.push(Tagged('msg', Str('hello')));
  assertThrows(() => { lookup('NEG').fn(s); }, /Bad argument type/,
    'session068: NEG on Tagged(String) still rejects with Bad argument type');
}
{
  // Rejection: ABS on Tagged(Program) still throws.
  const s = new Stack();
  s.push(Tagged('p', Program([Real(1)])));
  assertThrows(() => { lookup('ABS').fn(s); }, /Bad argument type/,
    'session068: ABS on Tagged(Program) still rejects');
}

/* ---- MOD / MIN / MAX V/M rejection (HP50 AUR §3 scalar-only) ----
   Verifies that Vector and Matrix operands are deliberately rejected,
   matching the published HP50 specification.  The scalar-only rule is
   not accidental — we want `[1 2 3] 2 MOD` to fail cleanly rather
   than silently invent an element-wise broadcast.  Cell flip in
   DATA_TYPES.md: V/M blank → ✗ (rejection verified).
*/
{
  const s = new Stack();
  s.push(Vector([Real(7), Real(10)]));
  s.push(Real(3));
  assertThrows(() => { lookup('MOD').fn(s); }, /Bad argument type/, 'session068: MOD rejects Vector on level 2 (AUR scalar-only)');
}
{
  const s = new Stack();
  s.push(Real(17));
  s.push(Vector([Real(5), Real(3)]));
  assertThrows(() => { lookup('MOD').fn(s); }, /Bad argument type/, 'session068: MOD rejects Vector on level 1');
}
{
  const s = new Stack();
  s.push(Matrix([[Real(1), Real(2)], [Real(3), Real(4)]]));
  s.push(Real(3));
  assertThrows(() => { lookup('MOD').fn(s); }, /Bad argument type/, 'session068: MOD rejects Matrix operand');
}
{
  const s = new Stack();
  s.push(Vector([Real(1), Real(2)]));
  s.push(Vector([Real(3), Real(4)]));
  assertThrows(() => { lookup('MIN').fn(s); }, /Bad argument type/, 'session068: MIN rejects Vector ∘ Vector (no element-wise)');
}
{
  const s = new Stack();
  s.push(Real(5));
  s.push(Matrix([[Real(1), Real(9)], [Real(3), Real(7)]]));
  assertThrows(() => { lookup('MAX').fn(s); }, /Bad argument type/, 'session068: MAX rejects scalar ∘ Matrix (no broadcast)');
}

/* ---- session344: MIN/MAX V/M rejection — complementary operand slots ----
   session068 pinned MIN only as Vector ∘ Vector (which trips the FIRST
   `!isNumber(a)` arm) and MAX only as scalar ∘ Matrix (the b-slot M arm).
   But `_minMax` checks `!isNumber(a) || !isNumber(b)`, so each op rejects a
   V/M in EITHER position; `_withListBinary` distributes Lists only, so a
   Vector/Matrix in either slot reaches the inner scalar handler.  The
   un-pinned arms are MIN with a valid scalar `a` and a V/M `b`, MIN with a
   V/M `a` and a valid scalar `b`, and MAX with a V/M `a` and a valid scalar
   `b` (plus MAX's b-slot Vector).  Pin them so both operand positions are
   guarded symmetrically (mirrors the combinatorial-family session330 and
   GCD/LCM session337 b-slot sweeps).  Test-only — guards a refactor that
   drops the second-operand `isNumber` check. */
{
  const s = new Stack();
  s.push(Real(5));
  s.push(Vector([Real(1), Real(2)]));
  assertThrows(() => { lookup('MIN').fn(s); }, /Bad argument type/, 'session344: MIN rejects scalar ∘ Vector (b-slot V)');
}
{
  const s = new Stack();
  s.push(Real(5));
  s.push(Matrix([[Real(1), Real(9)], [Real(3), Real(7)]]));
  assertThrows(() => { lookup('MIN').fn(s); }, /Bad argument type/, 'session344: MIN rejects scalar ∘ Matrix (b-slot M)');
}
{
  const s = new Stack();
  s.push(Vector([Real(1), Real(2)]));
  s.push(Real(5));
  assertThrows(() => { lookup('MIN').fn(s); }, /Bad argument type/, 'session344: MIN rejects Vector ∘ scalar (a-slot V)');
}
{
  const s = new Stack();
  s.push(Matrix([[Real(1), Real(9)], [Real(3), Real(7)]]));
  s.push(Real(5));
  assertThrows(() => { lookup('MIN').fn(s); }, /Bad argument type/, 'session344: MIN rejects Matrix ∘ scalar (a-slot M)');
}
{
  const s = new Stack();
  s.push(Vector([Real(1), Real(2)]));
  s.push(Real(5));
  assertThrows(() => { lookup('MAX').fn(s); }, /Bad argument type/, 'session344: MAX rejects Vector ∘ scalar (a-slot V)');
}
{
  const s = new Stack();
  s.push(Matrix([[Real(1), Real(9)], [Real(3), Real(7)]]));
  s.push(Real(5));
  assertThrows(() => { lookup('MAX').fn(s); }, /Bad argument type/, 'session344: MAX rejects Matrix ∘ scalar (a-slot M)');
}
{
  const s = new Stack();
  s.push(Real(5));
  s.push(Vector([Real(1), Real(2)]));
  assertThrows(() => { lookup('MAX').fn(s); }, /Bad argument type/, 'session344: MAX rejects scalar ∘ Vector (b-slot V)');
}

/* ---- session365: MOD V/M rejection — the un-pinned y-slot Matrix arm ----
   MOD shares MIN/MAX's `!isNumber(a) || !isNumber(b)` guard, so it rejects a
   V/M in EITHER operand position; `_withListBinary` distributes Lists only, so
   a V/M in either slot reaches the inner scalar handler.  session068 pinned
   MOD's x-slot Vector, y-slot Vector, and x-slot Matrix — but never the y-slot
   Matrix (valid Real `a`, Matrix `b`), the lone unpinned V/M arm.  Pin it so
   MOD's V/M rejection is symmetric across both operand positions and both kinds
   (mirrors the MIN/MAX session344 sweep one op over).  Test-only — guards a
   refactor that drops the second-operand `isNumber` check. */
{
  const s = new Stack();
  s.push(Real(17));
  s.push(Matrix([[Real(1), Real(2)], [Real(3), Real(4)]]));
  assertThrows(() => { lookup('MOD').fn(s); }, /Bad argument type/, 'session365: MOD rejects scalar ∘ Matrix (b-slot M)');
}

/* ---- MOD / MIN / MAX symbolic-lift still works for Name operands ----
   Spot-check that related widening did not regress the symbolic-lift path. */
{
  const s = new Stack();
  s.push(Name('X'));
  s.push(Integer(3n));
  lookup('MIN').fn(s);
  const v = s.peek();
  assert(v.type === 'symbolic',
    'session068: MIN(X, 3) still lifts to Symbolic (regression guard)');
}

/* ============================================================
 * new ops: IQUOT / IREMAINDER / GAMMA / LNGAMMA / UTPC
 *
 * IQUOT / IREMAINDER are single-result siblings of IDIV2 (session
 * 065).  GAMMA / LNGAMMA wrap the Lanczos helper already in ops.js.
 * UTPC (chi-square upper tail) is the next STAT-DIST op after UTPN.
 * Coverage is ≥1 positive + ≥1 rejection per op.
 * ============================================================ */

{
  const s = new Stack();
  s.push(Integer(17n));
  s.push(Integer(5n));
  lookup('IQUOT').fn(s);
  assert(s.depth === 1 && isInteger(s.peek()) && s.peek().value === 3n,
    'session068: IQUOT(17, 5) = 3 (truncated quotient)');
}
{
  // sign-of-dividend: IQUOT(-17, 5) = -3 (truncation toward zero,
  // not floor).  Matches IDIV2 and contrasts with MOD's floor-div.
  const s = new Stack();
  s.push(Integer(-17n));
  s.push(Integer(5n));
  lookup('IQUOT').fn(s);
  assert(isInteger(s.peek()) && s.peek().value === -3n,
    'session068: IQUOT(-17, 5) = -3 (truncation toward zero)');
}
{
  // Exact division → exact quotient, no fractional leak.
  const s = new Stack();
  s.push(Integer(100n));
  s.push(Integer(25n));
  lookup('IQUOT').fn(s);
  assert(isInteger(s.peek()) && s.peek().value === 4n,
    'session068: IQUOT(100, 25) = 4');
}
{
  // Integer-valued Real coerces cleanly.
  const s = new Stack();
  s.push(Real(20));
  s.push(Real(6));
  lookup('IQUOT').fn(s);
  assert(isInteger(s.peek()) && s.peek().value === 3n,
    'session068: IQUOT accepts integer-valued Real args');
}
{
  // Name × Integer → Symbolic lift (matches MOD's behavior).
  const s = new Stack();
  s.push(Name('A'));
  s.push(Integer(5n));
  lookup('IQUOT').fn(s);
  const v = s.peek();
  assert(v.type === 'symbolic' && v.expr.kind === 'fn' && v.expr.name === 'IQUOT',
    'session068: IQUOT(Name, Integer) lifts to Symbolic');
}
{
  // Tagged transparency: drops tag, reports integer quotient.
  const s = new Stack();
  s.push(Tagged('a', Integer(23n)));
  s.push(Integer(7n));
  lookup('IQUOT').fn(s);
  assert(isInteger(s.peek()) && s.peek().value === 3n,
    'session068: IQUOT on Tagged dividend drops tag, returns 3');
}
{
  // List broadcast: element-wise IQUOT against scalar divisor.
  const s = new Stack();
  s.push(RList([Integer(17n), Integer(100n), Integer(-17n)]));
  s.push(Integer(5n));
  lookup('IQUOT').fn(s);
  const v = s.peek();
  assert(v.type === 'list' && v.items.length === 3
    && v.items[0].value === 3n && v.items[1].value === 20n
    && v.items[2].value === -3n,
    'session068: IQUOT distributes over List (scalar broadcasts)');
}
{
  // Zero divisor → Infinite result.
  const s = new Stack();
  s.push(Integer(17n));
  s.push(Integer(0n));
  assertThrows(() => { lookup('IQUOT').fn(s); }, /Infinite result/, 'session068: IQUOT(17, 0) throws Infinite result');
}
{
  // Non-integer Real → Bad argument value.
  const s = new Stack();
  s.push(Real(1.5));
  s.push(Integer(3n));
  assertThrows(() => { lookup('IQUOT').fn(s); }, /Bad argument value/, 'session068: IQUOT(1.5, 3) throws Bad argument value');
}
{
  // Complex → Bad argument type.
  const s = new Stack();
  s.push(Complex(3, 2));
  s.push(Integer(2n));
  assertThrows(() => { lookup('IQUOT').fn(s); }, /Bad argument type/, 'session068: IQUOT((3,2), 2) throws Bad argument type');
}

{
  const s = new Stack();
  s.push(Integer(17n));
  s.push(Integer(5n));
  lookup('IREMAINDER').fn(s);
  assert(isInteger(s.peek()) && s.peek().value === 2n,
    'session068: IREMAINDER(17, 5) = 2');
}
{
  // Sign-of-dividend: IREMAINDER(-17, 5) = -2.  Contrast with
  // MOD(-17, 5) = 3 (floor-div, sign-of-divisor).
  const s = new Stack();
  s.push(Integer(-17n));
  s.push(Integer(5n));
  lookup('IREMAINDER').fn(s);
  assert(isInteger(s.peek()) && s.peek().value === -2n,
    'session068: IREMAINDER(-17, 5) = -2 (sign of dividend — contrast MOD=3)');
}
{
  // Exact division → remainder 0.
  const s = new Stack();
  s.push(Integer(100n));
  s.push(Integer(25n));
  lookup('IREMAINDER').fn(s);
  assert(isInteger(s.peek()) && s.peek().value === 0n,
    'session068: IREMAINDER(100, 25) = 0');
}
{
  // q·b + r = a round-trip against IDIV2.  Pick a big-ish dividend
  // and confirm the two single-result siblings reconstruct exactly.
  const s = new Stack();
  s.push(Integer(12345678901234567890n));
  s.push(Integer(987654321n));
  lookup('IQUOT').fn(s);
  const q = s.peek().value;
  s.clear();
  s.push(Integer(12345678901234567890n));
  s.push(Integer(987654321n));
  lookup('IREMAINDER').fn(s);
  const r = s.peek().value;
  assert(q * 987654321n + r === 12345678901234567890n,
    'session068: IQUOT + IREMAINDER satisfy q·b + r = a on big BigInt');
}
{
  // List × List element-wise (both lists same length).
  const s = new Stack();
  s.push(RList([Integer(17n), Integer(20n), Integer(-17n)]));
  s.push(RList([Integer(5n), Integer(6n), Integer(5n)]));
  lookup('IREMAINDER').fn(s);
  const v = s.peek();
  assert(v.type === 'list' && v.items.length === 3
    && v.items[0].value === 2n && v.items[1].value === 2n
    && v.items[2].value === -2n,
    'session068: IREMAINDER distributes List × List element-wise');
}
{
  // Name × Name → Symbolic.
  const s = new Stack();
  s.push(Name('A'));
  s.push(Name('B'));
  lookup('IREMAINDER').fn(s);
  const v = s.peek();
  assert(v.type === 'symbolic' && v.expr.kind === 'fn'
    && v.expr.name === 'IREMAINDER',
    'session068: IREMAINDER(Name, Name) lifts to Symbolic');
}
{
  // Zero divisor → Infinite result.
  const s = new Stack();
  s.push(Integer(17n));
  s.push(Integer(0n));
  assertThrows(() => { lookup('IREMAINDER').fn(s); }, /Infinite result/, 'session068: IREMAINDER(17, 0) throws Infinite result');
}
{
  // String → Bad argument type.
  const s = new Stack();
  s.push(Str('17'));
  s.push(Integer(5n));
  assertThrows(() => { lookup('IREMAINDER').fn(s); }, /Bad argument type/, 'session068: IREMAINDER on String dividend throws Bad argument type');
}

{
  // Γ(n) = (n-1)!.  Γ(5) = 24, exact Integer (via _bigFactorial).
  const s = new Stack();
  s.push(Integer(5n));
  lookup('GAMMA').fn(s);
  assert(isInteger(s.peek()) && s.peek().value === 24n,
    'session068: GAMMA(5) = 24 (exact Integer = 4!)');
}
{
  // Γ(1) = 1, Γ(2) = 1 — classic unit boundary.
  const s = new Stack();
  s.push(Integer(1n));
  lookup('GAMMA').fn(s);
  assert(isInteger(s.peek()) && s.peek().value === 1n,
    'session068: GAMMA(1) = 1');
}
{
  // Γ(0.5) = √π — reflection-formula corner case.
  const s = new Stack();
  s.push(Real(0.5));
  lookup('GAMMA').fn(s);
  assert(isReal(s.peek()) && _approx(s.peek().value, Math.sqrt(Math.PI), 1e-12),
    'session068: GAMMA(0.5) = √π');
}
{
  // Γ(1.5) = 0.5·√π.
  const s = new Stack();
  s.push(Real(1.5));
  lookup('GAMMA').fn(s);
  assert(_approx(s.peek().value, 0.5 * Math.sqrt(Math.PI), 1e-12),
    'session068: GAMMA(1.5) = 0.5·√π');
}
{
  // Large Integer exact — Γ(21) = 20! = 2432902008176640000.
  const s = new Stack();
  s.push(Integer(21n));
  lookup('GAMMA').fn(s);
  assert(isInteger(s.peek()) && s.peek().value === 2432902008176640000n,
    'session068: GAMMA(21) = 20! (exact BigInt)');
}
{
  // Tagged transparency — `weight:4 GAMMA` → `weight:6` (=3!).
  const s = new Stack();
  s.push(Tagged('weight', Integer(4n)));
  lookup('GAMMA').fn(s);
  const v = s.peek();
  assert(v.type === 'tagged' && v.tag === 'weight'
    && isInteger(v.value) && v.value.value === 6n,
    'session068: GAMMA preserves Tagged label');
}
{
  // List distribution — element-wise.
  const s = new Stack();
  s.push(RList([Integer(3n), Integer(4n), Integer(5n)]));
  lookup('GAMMA').fn(s);
  const v = s.peek();
  assert(v.type === 'list' && v.items.length === 3
    && v.items[0].value === 2n && v.items[1].value === 6n
    && v.items[2].value === 24n,
    'session068: GAMMA distributes over List');
}
{
  // Name → Symbolic lift round-trips to `'GAMMA(X)'`.
  const s = new Stack();
  s.push(Name('X'));
  lookup('GAMMA').fn(s);
  const v = s.peek();
  assert(v.type === 'symbolic' && v.expr.kind === 'fn' && v.expr.name === 'GAMMA',
    'session068: GAMMA(X) lifts to Symbolic');
}
{
  // Parser round-trip: `'GAMMA(X)'` parses to Symbolic.
  const parsed = parseEntry("`GAMMA(X)`");
  const s = new Stack();
  for (const item of parsed) s.push(item);
  const v = s.peek();
  assert(v && v.type === 'symbolic' && v.expr.kind === 'fn'
    && v.expr.name === 'GAMMA' && v.expr.args.length === 1,
    'session068: parser round-trips GAMMA(X)');
}
{
  // Pole at 0 → Infinite result.
  const s = new Stack();
  s.push(Integer(0n));
  assertThrows(() => { lookup('GAMMA').fn(s); }, /Infinite result/, 'session068: GAMMA(0) throws Infinite result (pole)');
}
{
  // Pole at negative integer.
  const s = new Stack();
  s.push(Integer(-3n));
  assertThrows(() => { lookup('GAMMA').fn(s); }, /Infinite result/, 'session068: GAMMA(-3) throws Infinite result (pole)');
}
{
  // Complex → Bad argument type.  HP50 Γ is real-valued only.
  const s = new Stack();
  s.push(Complex(1, 1));
  assertThrows(() => { lookup('GAMMA').fn(s); }, /Bad argument type/, 'session068: GAMMA((1,1)) throws Bad argument type');
}
{
  // Real-valued non-positive integers hit the same pole guard
  // (`Number.isInteger(x) && x <= 0`) as the Integer operands above —
  // the existing pole pins only use Integer, so a refactor narrowing
  // the guard to isInteger(v) would let GAMMA(Real(-2)) return garbage.
  for (const x of [0, -2, -3]) {
    const s = new Stack();
    s.push(Real(x));
    assertThrows(() => { lookup('GAMMA').fn(s); }, /Infinite result/,
      `session290: GAMMA(Real(${x})) throws Infinite result (pole via Number.isInteger guard)`);
  }
}

{
  // ln Γ(5) = ln(24).
  const s = new Stack();
  s.push(Integer(5n));
  lookup('LNGAMMA').fn(s);
  assert(_approx(s.peek().value, Math.log(24), 1e-12),
    'session068: LNGAMMA(5) = ln(24)');
}
{
  // LNGAMMA works at large n where GAMMA overflows.  ln Γ(200)
  // ≈ 857.933669825.  Direct confirmation that the Lanczos-log
  // path stays finite where Math.log(_gamma(200)) would give Inf.
  const s = new Stack();
  s.push(Integer(200n));
  lookup('LNGAMMA').fn(s);
  assert(s.peek().value.isFinite()
    && _approx(s.peek().value, 857.9336698258574, 1e-8),
    'session068: LNGAMMA(200) stays finite (~857.93)');
}
{
  // ln Γ(0.5) = 0.5·ln π.
  const s = new Stack();
  s.push(Real(0.5));
  lookup('LNGAMMA').fn(s);
  assert(_approx(s.peek().value, 0.5 * Math.log(Math.PI), 1e-12),
    'session068: LNGAMMA(0.5) = 0.5·ln π');
}
{
  // Tagged transparency.
  const s = new Stack();
  s.push(Tagged('logΓ', Real(10)));
  lookup('LNGAMMA').fn(s);
  const v = s.peek();
  assert(v.type === 'tagged' && v.tag === 'logΓ'
    && _approx(v.value.value, Math.log(362880), 1e-12),
    'session068: LNGAMMA preserves Tagged label');
}
{
  // Pole at 0.
  const s = new Stack();
  s.push(Integer(0n));
  assertThrows(() => { lookup('LNGAMMA').fn(s); }, /Infinite result/, 'session068: LNGAMMA(0) throws Infinite result');
}
{
  // Same Real-operand pole guard as GAMMA above (session290) — LNGAMMA's
  // `Number.isInteger(x) && x <= 0` throw must fire for Real non-positive
  // integers, not just Integer operands.
  for (const x of [0, -1, -4]) {
    const s = new Stack();
    s.push(Real(x));
    assertThrows(() => { lookup('LNGAMMA').fn(s); }, /Infinite result/,
      `session290: LNGAMMA(Real(${x})) throws Infinite result (pole via Number.isInteger guard)`);
  }
}
{
  // String → Bad argument type.
  const s = new Stack();
  s.push(Str('hi'));
  assertThrows(() => { lookup('LNGAMMA').fn(s); }, /Bad argument type/, 'session068: LNGAMMA on String throws Bad argument type');
}

{
  // x = 0 → P(X > 0) = 1 (trivial boundary).
  const s = new Stack();
  s.push(Integer(4n));
  s.push(Real(0));
  lookup('UTPC').fn(s);
  assert(isReal(s.peek()) && s.peek().value.eq(1),
    'session068: UTPC(4, 0) = 1');
}
{
  // Classic chi-square critical value: χ²(1) at α=0.05 is 3.841459.
  // UTPC(1, 3.841459) ≈ 0.05.
  const s = new Stack();
  s.push(Integer(1n));
  s.push(Real(3.841459));
  lookup('UTPC').fn(s);
  assert(_approx(s.peek().value, 0.05, 1e-6),
    'session068: UTPC(1, 3.841459) ≈ 0.05 (χ²₁ α=0.05 critical)');
}
{
  // χ²(4) at α=0.05 is 9.48773.  Series-regime test (x < a+1 = 3).
  const s = new Stack();
  s.push(Integer(4n));
  s.push(Real(9.48773));
  lookup('UTPC').fn(s);
  assert(_approx(s.peek().value, 0.05, 1e-5),
    'session068: UTPC(4, 9.48773) ≈ 0.05 (χ²₄ α=0.05 critical)');
}
{
  // χ²(10) at α=0.05 is 18.307.  Continued-fraction regime test.
  const s = new Stack();
  s.push(Integer(10n));
  s.push(Real(18.307));
  lookup('UTPC').fn(s);
  assert(_approx(s.peek().value, 0.05, 1e-4),
    'session068: UTPC(10, 18.307) ≈ 0.05 (χ²₁₀ α=0.05 critical)');
}
{
  // Large x → tail → 0.
  const s = new Stack();
  s.push(Integer(2n));
  s.push(Real(50));
  lookup('UTPC').fn(s);
  assert(s.peek().value > 0 && s.peek().value < 1e-10,
    'session068: UTPC(2, 50) → tiny (far tail)');
}
{
  // Integer x accepted.  UTPC(2, 6) → e^(-3) ≈ 0.049787.  (For
  // ν=2 the χ² CDF has a closed form: Q(1, x/2) = e^(-x/2).)
  const s = new Stack();
  s.push(Integer(2n));
  s.push(Integer(6n));
  lookup('UTPC').fn(s);
  assert(_approx(s.peek().value, Math.exp(-3), 1e-10),
    'session068: UTPC(2, 6) = e^-3 (ν=2 closed form)');
}
{
  // Parser round-trip for the name form.
  const parsed = parseEntry("`UTPC(4, 9.49)`");
  const s = new Stack();
  for (const item of parsed) s.push(item);
  const v = s.peek();
  assert(v && v.type === 'symbolic' && v.expr.kind === 'fn'
    && v.expr.name === 'UTPC' && v.expr.args.length === 2,
    'session068: parser round-trips UTPC(ν, x) as Symbolic');
}
{
  // ν must be a positive integer → ν=0 rejection.
  const s = new Stack();
  s.push(Integer(0n));
  s.push(Real(1));
  assertThrows(() => { lookup('UTPC').fn(s); }, /Bad argument value/, 'session068: UTPC(0, x) throws Bad argument value (need ν ≥ 1)');
}
{
  // Non-integer ν → rejection.
  const s = new Stack();
  s.push(Real(2.5));
  s.push(Real(1));
  assertThrows(() => { lookup('UTPC').fn(s); }, /Bad argument value/, 'session068: UTPC(2.5, x) throws Bad argument value (ν must be integer)');
}
{
  // Complex rejection.
  const s = new Stack();
  s.push(Complex(2, 1));
  s.push(Real(1));
  assertThrows(() => { lookup('UTPC').fn(s); }, /Bad argument type/, 'session068: UTPC with Complex ν throws Bad argument type');
}

/* ==================================================================
   Beta / erf / erfc / UTPF / UTPT.
   Each op: ≥1 positive + ≥1 rejection.  Textbook critical values /
   closed-form cross-checks cited per assertion.
   ================================================================= */

{
  // Β(3, 4) = Γ(3)Γ(4)/Γ(7) = 2! 3! / 6! = 12 / 720 = 1/60.
  const s = new Stack();
  s.push(Real(3)); s.push(Real(4));
  lookup('Beta').fn(s);
  assert(_approx(s.peek().value, 1/60, 1e-12),
    'session069: Beta(3, 4) = 1/60');
}
{
  // Β(1, n) = 1/n is the reciprocal-of-second-arg identity.
  const s = new Stack();
  s.push(Real(1)); s.push(Real(7));
  lookup('Beta').fn(s);
  assert(_approx(s.peek().value, 1/7, 1e-12),
    'session069: Beta(1, 7) = 1/7');
}
{
  // Β(1/2, 1/2) = π — the classic half-integer case.
  const s = new Stack();
  s.push(Real(0.5)); s.push(Real(0.5));
  lookup('Beta').fn(s);
  assert(_approx(s.peek().value, Math.PI, 1e-12),
    'session069: Beta(1/2, 1/2) = π');
}
{
  // Β(a, b) = Β(b, a) — symmetry.
  const s1 = new Stack();
  s1.push(Real(2.5)); s1.push(Real(3.7));
  lookup('Beta').fn(s1);
  const ab = s1.peek().value;
  const s2 = new Stack();
  s2.push(Real(3.7)); s2.push(Real(2.5));
  lookup('Beta').fn(s2);
  const ba = s2.peek().value;
  assert(_approx(ab, ba, 1e-12),
    `session069: Beta(a, b) = Beta(b, a) (got ${ab} vs ${ba})`);
}
{
  // Name argument lifts to Symbolic Beta.
  const s = new Stack();
  s.push(Name('N', true)); s.push(Integer(2n));
  lookup('Beta').fn(s);
  const v = s.peek();
  assert(v && v.type === 'symbolic' && v.expr.kind === 'fn'
    && v.expr.name === 'BETA' && v.expr.args.length === 2,
    'session069: Beta(N, 2) lifts to Symbolic(BETA)');
}
{
  // Parser round-trip for Beta with numeric args — goes through the
  // entry-line parser, lands as a Symbolic.
  const parsed = parseEntry("`Beta(3, 4)`");
  const s = new Stack();
  for (const item of parsed) s.push(item);
  const v = s.peek();
  assert(v && v.type === 'symbolic' && v.expr.kind === 'fn'
    && v.expr.name === 'BETA' && v.expr.args.length === 2,
    'session069: parser round-trips Beta(a, b) as Symbolic');
}
{
  // Non-positive integer arg → Infinite result (Γ pole).
  const s = new Stack();
  s.push(Integer(0n)); s.push(Integer(3n));
  assertThrows(() => { lookup('Beta').fn(s); }, /Infinite result/, 'session069: Beta(0, 3) throws Infinite result');
}
{
  // Negative integer arg → Infinite result.
  const s = new Stack();
  s.push(Integer(-2n)); s.push(Integer(3n));
  assertThrows(() => { lookup('Beta').fn(s); }, /Infinite result/, 'session069: Beta(-2, 3) throws Infinite result');
}
{
  // String argument → Bad argument type (neither Real nor Integer).
  const s = new Stack();
  s.push(Str('a')); s.push(Real(1));
  assertThrows(() => { lookup('Beta').fn(s); }, /Bad argument type/, 'session069: Beta("a", 1) throws Bad argument type');
}

{
  // session396: _betaScalar's Integer Z-arm (aNum/bNum =
  // isInteger ? Number(.value) : isReal ? .value.toNumber() : null) was
  // positively exercised only by the pole-throw cases (Beta(0,3)/Beta(-2,3) →
  // Infinite result); every finite closed-form pin above pushes Real operands.
  // A refactor folding the isInteger arm into the Real guard (or dropping it)
  // would still pass those — the pole throws before computing, the Real pins
  // never touch the Integer arm. Pin a finite value through the Integer arm on
  // both operands and the two mixed slots; the result must match the Real path
  // bit-for-bit and stay Real.  Probed live (repo-rooted, CAS-free): all four
  // forms = 1/60, exactly equal to Beta(Real(3),Real(4)).
  const ref = (() => {
    const s = new Stack();
    s.push(Real(3)); s.push(Real(4));
    lookup('Beta').fn(s);
    return s.peek().value;
  })();
  function betaVal(a, b) {
    const s = new Stack();
    s.push(a); s.push(b);
    lookup('Beta').fn(s);
    return s.peek();
  }
  const ii = betaVal(Integer(3n), Integer(4n));
  assert(isReal(ii) && ii.value.eq(ref),
    'session396: Beta(Integer 3, Integer 4) = Beta(Real 3, Real 4) = 1/60, stays Real');
  const i17 = betaVal(Integer(1n), Integer(7n));
  assert(isReal(i17) && _approx(i17.value, 1/7, 1e-12),
    'session396: Beta(Integer 1, Integer 7) = 1/7 via the Integer arm');
  const ir = betaVal(Integer(3n), Real(4));
  assert(isReal(ir) && ir.value.eq(ref),
    'session396: Beta(Integer 3, Real 4) = 1/60 (a-slot Integer arm, b-slot Real arm)');
  const ri = betaVal(Real(3), Integer(4n));
  assert(isReal(ri) && ri.value.eq(ref),
    'session396: Beta(Real 3, Integer 4) = 1/60 (b-slot Integer arm)');
}

{
  // erf(0) = 0 exactly.
  const s = new Stack();
  s.push(Real(0));
  lookup('erf').fn(s);
  assert(s.peek().value.eq(0), 'session069: erf(0) = 0');
}
{
  // erf(1) ≈ 0.8427007929 — Abramowitz & Stegun Table 7.1.
  const s = new Stack();
  s.push(Real(1));
  lookup('erf').fn(s);
  assert(_approx(s.peek().value, 0.8427007929497149, 1e-12),
    'session069: erf(1) ≈ 0.8427007929 (AS 7.1)');
}
{
  // erf(2) ≈ 0.9953222650 — AS 7.1.
  const s = new Stack();
  s.push(Real(2));
  lookup('erf').fn(s);
  assert(_approx(s.peek().value, 0.9953222650189527, 1e-12),
    'session069: erf(2) ≈ 0.9953222650 (AS 7.1)');
}
{
  // erf is odd: erf(−x) = −erf(x).
  const s = new Stack();
  s.push(Real(-1.5));
  lookup('erf').fn(s);
  const neg = s.peek().value;
  const s2 = new Stack();
  s2.push(Real(1.5));
  lookup('erf').fn(s2);
  const pos = s2.peek().value;
  assert(_approx(neg, -pos, 1e-14),
    'session069: erf(-x) = -erf(x) (odd)');
}
{
  // Symbolic lift.
  const s = new Stack();
  s.push(Name('Z', true));
  lookup('erf').fn(s);
  const v = s.peek();
  assert(v && v.type === 'symbolic' && v.expr.kind === 'fn'
    && v.expr.name === 'ERF',
    'session069: erf(Z) lifts to Symbolic(ERF)');
}
{
  // Parser round-trip.
  const parsed = parseEntry("`erf(X)`");
  const s = new Stack();
  for (const item of parsed) s.push(item);
  const v = s.peek();
  assert(v && v.type === 'symbolic' && v.expr.kind === 'fn'
    && v.expr.name === 'ERF',
    'session069: parser round-trips erf(X) as Symbolic');
}
{
  // Tagged transparency — result re-tagged with the same label.
  const s = new Stack();
  s.push(Tagged('P', Real(1)));
  lookup('erf').fn(s);
  const v = s.peek();
  assert(v && v.type === 'tagged' && v.tag === 'P'
    && _approx(v.value.value, 0.8427007929497149, 1e-12),
    'session069: erf(P:1) = P:erf(1) (Tagged transparency)');
}
{
  // List broadcast.
  const s = new Stack();
  s.push(RList([Real(0), Real(1), Real(-1)]));
  lookup('erf').fn(s);
  const v = s.peek();
  assert(v && v.type === 'list' && v.items.length === 3
    && v.items[0].value.eq(0)
    && _approx(v.items[1].value, 0.8427007929497149, 1e-12)
    && _approx(v.items[2].value, -0.8427007929497149, 1e-12),
    'session069: erf broadcasts element-wise over a List');
}
{
  // Complex rejected — erf on complex is not in the HP50 AUR (it is
  // a separate CAS-only extension that we haven't shipped).
  const s = new Stack();
  s.push(Complex(1, 2));
  assertThrows(() => { lookup('erf').fn(s); }, /Bad argument type/, 'session069: erf(Complex) throws Bad argument type');
}

{
  // erfc(0) = 1 exactly.
  const s = new Stack();
  s.push(Real(0));
  lookup('erfc').fn(s);
  assert(s.peek().value.eq(1), 'session069: erfc(0) = 1');
}
{
  // erfc(1) ≈ 0.1572992070 — AS 7.1, complement of erf(1).
  const s = new Stack();
  s.push(Real(1));
  lookup('erfc').fn(s);
  assert(_approx(s.peek().value, 0.15729920705028513, 1e-12),
    'session069: erfc(1) ≈ 0.1572992070 (AS 7.1)');
}
{
  // Large-x regime: erfc(5) ≈ 1.5375e-12 — this is the whole reason
  // we don't compute erfc as (1 − erf).  1 − 0.99999999999846 loses
  // all the significant digits.  Q(1/2, x²) preserves them.
  const s = new Stack();
  s.push(Real(5));
  lookup('erfc').fn(s);
  const v = s.peek().value;
  assert(v > 1e-13 && v < 1e-11,
    `session069: erfc(5) is ~1.5e-12 (got ${v}) — no cancellation`);
}
{
  // Larger still: erfc(10) ≈ 2.088e-45 — an IEEE 1 − erf(10) would be
  // exactly 0.  We should stay non-zero and in the right order.
  const s = new Stack();
  s.push(Real(10));
  lookup('erfc').fn(s);
  const v = s.peek().value;
  assert(v > 1e-46 && v < 1e-44,
    `session069: erfc(10) ≈ 2e-45 (got ${v}) — survives where 1-erf fails`);
}
{
  // erfc(−x) = 2 − erfc(x) — reflection identity.
  const s = new Stack();
  s.push(Real(-1));
  lookup('erfc').fn(s);
  const neg = s.peek().value;
  const s2 = new Stack();
  s2.push(Real(1));
  lookup('erfc').fn(s2);
  const pos = s2.peek().value;
  assert(_approx(neg, 2 - pos, 1e-12),
    'session069: erfc(-x) = 2 - erfc(x)');
}
{
  // erfc(∞)-direction rejection — non-finite input.
  const s = new Stack();
  s.push(Real(Infinity));
  assertThrows(() => { lookup('erfc').fn(s); }, /Bad argument value/, 'session069: erfc(∞) throws Bad argument value');
}
{
  // String rejection.
  const s = new Stack();
  s.push(Str('hello'));
  assertThrows(() => { lookup('erfc').fn(s); }, /Bad argument type/, 'session069: erfc("hello") throws Bad argument type');
}
{
  // Z ✓ — erf/erfc accept a bare Integer operand (the _erfScalar /
  // _erfcScalar isInteger branch), not just Real.  Pins the DATA_TYPES
  // Z column, which prior coverage only exercised with Real(n).
  const s = new Stack();
  s.push(Integer(1n));
  lookup('erf').fn(s);
  const v = s.peek();
  assert(isReal(v) && _approx(v.value, 0.8427007929497149, 1e-12),
    'session280: erf(Integer(1)) = Real(≈0.8427) (Z operand, not Real)');
}
{
  const s = new Stack();
  s.push(Integer(2n));
  lookup('erfc').fn(s);
  const v = s.peek();
  assert(isReal(v) && _approx(v.value, 0.004677734981047266, 1e-12),
    'session280: erfc(Integer(2)) = Real(≈0.00468) (Z operand, not Real)');
}

{
  // F(5, 10) α=0.05 critical value 3.326 — AS Table 26.9 / any
  // standard F-distribution table.  UTPF(5, 10, 3.326) ≈ 0.05.
  const s = new Stack();
  s.push(Integer(5n));
  s.push(Integer(10n));
  s.push(Real(3.326));
  lookup('UTPF').fn(s);
  assert(_approx(s.peek().value, 0.05, 1e-4),
    'session069: UTPF(5, 10, 3.326) ≈ 0.05 (F-table)');
}
{
  // F(1, 1) α=0.05 critical value 161.45 — famously large.
  const s = new Stack();
  s.push(Integer(1n));
  s.push(Integer(1n));
  s.push(Real(161.45));
  lookup('UTPF').fn(s);
  assert(_approx(s.peek().value, 0.05, 1e-4),
    'session069: UTPF(1, 1, 161.45) ≈ 0.05 (F-table)');
}
{
  // F(10, 20) α=0.01 critical value 3.368.
  const s = new Stack();
  s.push(Integer(10n));
  s.push(Integer(20n));
  s.push(Real(3.368));
  lookup('UTPF').fn(s);
  assert(_approx(s.peek().value, 0.01, 1e-3),
    'session069: UTPF(10, 20, 3.368) ≈ 0.01 (F-table)');
}
{
  // F ≤ 0: tail is 1 (F distribution support is F > 0).
  const s = new Stack();
  s.push(Integer(5n));
  s.push(Integer(10n));
  s.push(Real(0));
  lookup('UTPF').fn(s);
  assert(s.peek().value.eq(1),
    'session069: UTPF(5, 10, 0) = 1 (short-circuit)');
}
{
  // Parser round-trip.
  const parsed = parseEntry("`UTPF(5, 10, 3.326)`");
  const s = new Stack();
  for (const item of parsed) s.push(item);
  const v = s.peek();
  assert(v && v.type === 'symbolic' && v.expr.kind === 'fn'
    && v.expr.name === 'UTPF' && v.expr.args.length === 3,
    'session069: parser round-trips UTPF(n, d, F) as Symbolic');
}
{
  // ν = 0 rejection.
  const s = new Stack();
  s.push(Integer(0n));
  s.push(Integer(5n));
  s.push(Real(1));
  assertThrows(() => { lookup('UTPF').fn(s); }, /Bad argument value/, 'session069: UTPF(0, d, F) throws Bad argument value');
}
{
  // Non-integer n rejection.
  const s = new Stack();
  s.push(Real(1.5));
  s.push(Integer(5n));
  s.push(Real(1));
  assertThrows(() => { lookup('UTPF').fn(s); }, /Bad argument value/, 'session069: UTPF(1.5, d, F) throws Bad argument value');
}
{
  // Too few arguments.
  const s = new Stack();
  s.push(Integer(5n));
  s.push(Integer(10n));
  assertThrows(() => { lookup('UTPF').fn(s); }, /Too few arguments/, 'session069: UTPF(n, d) with no F throws Too few arguments');
}
{
  // Complex F rejection.
  const s = new Stack();
  s.push(Integer(5n));
  s.push(Integer(10n));
  s.push(Complex(1, 2));
  assertThrows(() => { lookup('UTPF').fn(s); }, /Bad argument type/, 'session069: UTPF(5, 10, Complex) throws Bad argument type');
}

{
  // UTPT(1, t) is the Cauchy upper tail: 1 - (0.5 + atan(t)/π).
  // At t=1: F(1) = 0.75, so UTPT = 0.25.
  const s = new Stack();
  s.push(Integer(1n));
  s.push(Real(1));
  lookup('UTPT').fn(s);
  assert(_approx(s.peek().value, 0.25, 1e-10),
    'session069: UTPT(1, 1) = 0.25 (Cauchy closed form)');
}
{
  // UTPT(1, 0) = 0.5 exactly (t-distribution is symmetric).
  const s = new Stack();
  s.push(Integer(1n));
  s.push(Real(0));
  lookup('UTPT').fn(s);
  assert(s.peek().value.eq(0.5),
    'session069: UTPT(ν, 0) = 0.5 exactly');
}
{
  // UTPT(1, -1) = 1 - UTPT(1, 1) = 0.75 — symmetry.
  const s = new Stack();
  s.push(Integer(1n));
  s.push(Real(-1));
  lookup('UTPT').fn(s);
  assert(_approx(s.peek().value, 0.75, 1e-10),
    'session069: UTPT(1, -1) = 0.75 (t-symmetry)');
}
{
  // t(30) α=0.05 one-tailed critical value 1.697 — standard t-table.
  const s = new Stack();
  s.push(Integer(30n));
  s.push(Real(1.697));
  lookup('UTPT').fn(s);
  assert(_approx(s.peek().value, 0.05, 1e-4),
    'session069: UTPT(30, 1.697) ≈ 0.05 (t-table)');
}
{
  // Large-ν limit approaches the normal: UTPT(1000, 1.96) ≈ 0.025.
  const s = new Stack();
  s.push(Integer(1000n));
  s.push(Real(1.96));
  lookup('UTPT').fn(s);
  assert(_approx(s.peek().value, 0.025, 1e-3),
    'session069: UTPT(1000, 1.96) ≈ 0.025 (t→normal limit)');
}
{
  // Parser round-trip.
  const parsed = parseEntry("`UTPT(10, 2.228)`");
  const s = new Stack();
  for (const item of parsed) s.push(item);
  const v = s.peek();
  assert(v && v.type === 'symbolic' && v.expr.kind === 'fn'
    && v.expr.name === 'UTPT' && v.expr.args.length === 2,
    'session069: parser round-trips UTPT(ν, t) as Symbolic');
}
{
  // ν = 0 rejection.
  const s = new Stack();
  s.push(Integer(0n));
  s.push(Real(1));
  assertThrows(() => { lookup('UTPT').fn(s); }, /Bad argument value/, 'session069: UTPT(0, t) throws Bad argument value');
}
{
  // Non-integer ν rejection.
  const s = new Stack();
  s.push(Real(2.5));
  s.push(Real(1));
  assertThrows(() => { lookup('UTPT').fn(s); }, /Bad argument value/, 'session069: UTPT(2.5, t) throws Bad argument value (ν must be integer)');
}
{
  // Too few arguments.
  const s = new Stack();
  s.push(Integer(5n));
  assertThrows(() => { lookup('UTPT').fn(s); }, /Too few arguments/, 'session069: UTPT(ν) with no t throws Too few arguments');
}
{
  // Complex rejection.
  const s = new Stack();
  s.push(Integer(5n));
  s.push(Complex(1, 2));
  assertThrows(() => { lookup('UTPT').fn(s); }, /Bad argument type/, 'session069: UTPT(5, Complex) throws Bad argument type');
}

/* ================================================================
   session308: UTPF / UTPT value-operand Z `✓` fold.
   The asReal integer arm (`isInteger(v) ? Number(v.value)`) for the
   distribution-variate operand was never positively pinned: every
   UTPF F-operand and UTPT t-operand in session069 was pushed as Real
   (n/d/ν always Integer, so only the degrees-of-freedom integer arm
   was exercised). UTPC's x integer arm is already covered by
   session068's UTPC(2, 6). Guards a refactor that drops or narrows the
   Integer coercion of the variate, which would degrade the Z column to
   Real-only there. Probed live first; no source change.
   ================================================================ */
{
  // F(2, 4) has the closed-form survival S(F) = (1 + (n/d)F)^(-d/2);
  // at F=3: (1 + 0.5·3)^(-2) = 2.5^(-2) = 0.16 exactly. Integer F.
  const s = new Stack();
  s.push(Integer(2n));
  s.push(Integer(4n));
  s.push(Integer(3n));
  lookup('UTPF').fn(s);
  assert(_approx(s.peek().value, 0.16, 1e-12),
    'session308: UTPF(2, 4, Integer 3) = 0.16 (integer F arm, n=2 closed form)');
}
{
  // Integer F matches the Real F path exactly (coercion guard).
  const si = new Stack();
  si.push(Integer(2n)); si.push(Integer(4n)); si.push(Integer(3n));
  lookup('UTPF').fn(si);
  const sr = new Stack();
  sr.push(Integer(2n)); sr.push(Integer(4n)); sr.push(Real(3));
  lookup('UTPF').fn(sr);
  assert(si.peek().value.eq(sr.peek().value),
    'session308: UTPF Integer F == Real F (asReal integer arm coerces identically)');
}
{
  // Integer F ≤ 0 short-circuits to 1 through the integer arm.
  const s = new Stack();
  s.push(Integer(5n));
  s.push(Integer(10n));
  s.push(Integer(0n));
  lookup('UTPF').fn(s);
  assert(s.peek().value.eq(1),
    'session308: UTPF(5, 10, Integer 0) = 1 (integer F short-circuit)');
}
{
  // UTPT(1, t) is the Cauchy upper tail; at t=1 → 0.25. Integer t.
  const s = new Stack();
  s.push(Integer(1n));
  s.push(Integer(1n));
  lookup('UTPT').fn(s);
  assert(_approx(s.peek().value, 0.25, 1e-12),
    'session308: UTPT(1, Integer 1) = 0.25 (integer t arm, Cauchy closed form)');
}
{
  // t-symmetry: UTPT(1, -1) = 1 - UTPT(1, 1) = 0.75. Integer t.
  const s = new Stack();
  s.push(Integer(1n));
  s.push(Integer(-1n));
  lookup('UTPT').fn(s);
  assert(_approx(s.peek().value, 0.75, 1e-12),
    'session308: UTPT(1, Integer -1) = 0.75 (integer t arm, t-symmetry)');
}
{
  // Integer t = 0 short-circuits to exactly 0.5 through the integer arm.
  const s = new Stack();
  s.push(Integer(5n));
  s.push(Integer(0n));
  lookup('UTPT').fn(s);
  assert(s.peek().value.eq(0.5),
    'session308: UTPT(5, Integer 0) = 0.5 (integer t short-circuit)');
}

/* ================================================================
   session310: UTPF collection-operand rejection (L / V / M ✗).
   UTPF is the asymmetric stat-dist op — its bare 3-arg handler has
   NO `_withListBinary` wrapper (unlike UTPC/UTPT), so a List in the
   variate position rejects rather than distributing.  `asReal` runs
   on every popped operand before any value check, accepting only
   Integer/Real, so a List/Vector/Matrix in ANY of the three slots
   throws 'Bad argument type'.  DATA_TYPES documents L/V/M `✗` for
   UTPF but only Complex was pinned (session069); this guards a
   refactor that adds `_withListBinary` to UTPF or widens `asReal`.
   ================================================================ */
{
  // Variate (F) position: the slot UTPC/UTPT distribute over, UTPF does not.
  for (const [label, mk] of [
    ['List', () => RList([Integer(2n), Integer(3n)])],
    ['Vector', () => Vector([Real(1), Real(2)])],
    ['Matrix', () => Matrix([[Real(1), Real(2)]])],
  ]) {
    const s = new Stack();
    s.push(Integer(5n));
    s.push(Integer(10n));
    s.push(mk());
    assertThrows(() => { lookup('UTPF').fn(s); }, /Bad argument type/,
      `session310: UTPF(5, 10, ${label}) throws Bad argument type (no list-distribute)`);
  }
  // n (degrees-of-freedom) position rejects the same way — not position-specific.
  for (const [label, mk] of [
    ['List', () => RList([Integer(2n), Integer(3n)])],
    ['Vector', () => Vector([Real(1), Real(2)])],
    ['Matrix', () => Matrix([[Real(1), Real(2)]])],
  ]) {
    const s = new Stack();
    s.push(mk());
    s.push(Integer(10n));
    s.push(Integer(3n));
    assertThrows(() => { lookup('UTPF').fn(s); }, /Bad argument type/,
      `session310: UTPF(${label}, 10, 3) throws Bad argument type`);
  }
}

/* ================================================================
   session378: UTPF middle (ν₂ / d) operand-slot rejection.
   session310 pinned UTPF's first (ν₁) and third (variate F) slots
   for L/V/M, but the MIDDLE d slot was never pinned.  `asReal` runs
   on `n` then `d` then `F` (ops.js ~2905), so a valid Integer n
   reaches the `asReal(d)` check — a List/Vector/Matrix there throws
   'Bad argument type' before any value gate.  Guards a refactor that
   special-cases the d slot or widens `asReal` for that operand only.
   ================================================================ */
{
  for (const [label, mk] of [
    ['List', () => RList([Integer(2n), Integer(3n)])],
    ['Vector', () => Vector([Real(1), Real(2)])],
    ['Matrix', () => Matrix([[Real(1), Real(2)]])],
  ]) {
    const s = new Stack();
    s.push(Integer(5n));
    s.push(mk());
    s.push(Integer(3n));
    assertThrows(() => { lookup('UTPF').fn(s); }, /Bad argument type/,
      `session378: UTPF(5, ${label}, 3) throws Bad argument type (middle ν₂ slot; no list-distribute)`);
  }
}

/* ================================================================
   Widening cluster #1:
     FLOOR / CEIL / IP / FP on Unit operand.
   HP50 AUR §3-65 / §3-66 / §3-108: these rounders apply to the
   scalar part of a Unit and preserve the unit expression intact,
   so `1.5_m FLOOR` → `1_m`, `1.8_m FP` → `0.8_m`, etc.
   ================================================================ */
{
  // FLOOR on a positive-fractional unit drops fractional part; unit kept.
  const [u] = parseEntry('1.5_m');
  const s = new Stack();
  s.push(u);
  lookup('FLOOR').fn(s);
  const t = s.peek();
  assert(t.type === 'unit' && t.value === 1,
    `session072: FLOOR(1.5_m) numeric = 1 (got ${t.value})`);
  assert(JSON.stringify(t.uexpr) === JSON.stringify(u.uexpr),
    'session072: FLOOR(1.5_m) preserves uexpr');
}
{
  // FLOOR on a negative-fractional unit floors toward -infinity.
  const [u] = parseEntry('1.5_m');
  const s = new Stack();
  s.push({ ...u, value: -1.5 });                  // -1.5_m (hand-built)
  lookup('FLOOR').fn(s);
  assert(s.peek().value === -2,
    `session072: FLOOR(-1.5_m) = -2_m (got ${s.peek().value})`);
}
{
  // CEIL on a positive-fractional unit rounds up.
  const [u] = parseEntry('1.5_m');
  const s = new Stack();
  s.push(u);
  lookup('CEIL').fn(s);
  const t = s.peek();
  assert(t.type === 'unit' && t.value === 2,
    `session072: CEIL(1.5_m) = 2_m (got ${t.value})`);
  assert(JSON.stringify(t.uexpr) === JSON.stringify(u.uexpr),
    'session072: CEIL(1.5_m) preserves uexpr');
}
{
  // IP truncates toward zero.  Compound unit (m/s^2) must round-trip.
  const [u] = parseEntry('9.81_m/s^2');
  const s = new Stack();
  s.push(u);
  lookup('IP').fn(s);
  const t = s.peek();
  assert(t.type === 'unit' && t.value === 9,
    `session072: IP(9.81_m/s^2) = 9_m/s^2 (got ${t.value})`);
  assert(JSON.stringify(t.uexpr) === JSON.stringify(u.uexpr),
    'session072: IP preserves compound unit expression');
}
{
  // IP on a negative-fractional unit truncates toward zero (not toward -inf).
  const [u] = parseEntry('1.5_m');
  const s = new Stack();
  s.push({ ...u, value: -1.8 });
  lookup('IP').fn(s);
  assert(s.peek().value === -1,
    `session072: IP(-1.8_m) = -1_m (truncation toward 0; got ${s.peek().value})`);
}
{
  // FP extracts the fractional part and keeps the unit.
  const [u] = parseEntry('1.8_m');
  const s = new Stack();
  s.push(u);
  lookup('FP').fn(s);
  const t = s.peek();
  // Floating-point: accept |got - 0.8| < 1e-9
  assert(t.type === 'unit' && Math.abs(t.value - 0.8) < 1e-9,
    `session072: FP(1.8_m) = 0.8_m (got ${t.value})`);
  assert(JSON.stringify(t.uexpr) === JSON.stringify(u.uexpr),
    'session072: FP preserves uexpr');
}
{
  // FP on a negative unit yields a negative fractional part (same sign).
  const [u] = parseEntry('1.5_m');
  const s = new Stack();
  s.push({ ...u, value: -1.8 });
  lookup('FP').fn(s);
  assert(Math.abs(s.peek().value - (-0.8)) < 1e-9,
    `session072: FP(-1.8_m) = -0.8_m (got ${s.peek().value})`);
}
{
  // Tagged(Unit) must still round via the Tagged-unary transparent path.
  const [u] = parseEntry('1.5_m');
  const s = new Stack();
  s.push(Tagged('len', u));
  lookup('FLOOR').fn(s);
  const t = s.peek();
  assert(t.type === 'tagged' && t.tag === 'len' && t.value.type === 'unit'
    && t.value.value === 1,
    'session072: FLOOR preserves Tagged wrapper around Unit');
}
{
  // List of Units distributes: Unit-valued FLOOR inside the element-wise
  // wrapper.  `{ 1.5_m 2.7_m } FLOOR` → `{ 1_m 2_m }`.
  const [u1] = parseEntry('1.5_m');
  const [u2] = parseEntry('2.7_m');
  const s = new Stack();
  s.push(RList([u1, u2]));
  lookup('FLOOR').fn(s);
  const t = s.peek();
  assert(t.type === 'list' && t.items.length === 2
    && t.items[0].type === 'unit' && t.items[0].value === 1
    && t.items[1].type === 'unit' && t.items[1].value === 2,
    'session072: FLOOR distributes over a list of Units');
}

/* ================================================================
   Widening cluster #2:
     % / %T / %CH V/M rejection audit.  HP50 AUR §3-1 specifies the
     percent family as scalar-only — Real on both operands.
     `_percentOp` rejects V/M via `toRealOrThrow`; this block pins
     that behaviour with tests (parallel to the MOD/MIN/MAX V/M
     rejection audit).
   ================================================================ */
{
  // % with Vector on level-2.
  const s = new Stack();
  s.push(Vector([Real(1), Real(2)])); s.push(Real(10));
  assertThrows(() => { lookup('%').fn(s); }, /Bad argument type/i, 'session072: %(Vec, Real) → Bad argument type');
}
{
  // % with Vector on level-1 (y operand).
  const s = new Stack();
  s.push(Real(100)); s.push(Vector([Real(1), Real(2)]));
  assertThrows(() => { lookup('%').fn(s); }, /Bad argument type/i, 'session072: %(Real, Vec) → Bad argument type (y-Vec branch)');
}
{
  // %T with Matrix on either side.
  const s = new Stack();
  s.push(Matrix([[Real(1), Real(2)], [Real(3), Real(4)]]));
  s.push(Real(10));
  assertThrows(() => { lookup('%T').fn(s); }, /Bad argument type/i, 'session072: %T(Matrix, Real) → Bad argument type');
}
{
  // %CH on two Vectors — no element-wise broadcast.
  const s = new Stack();
  s.push(Vector([Real(1), Real(2)])); s.push(Vector([Real(3), Real(4)]));
  assertThrows(() => { lookup('%CH').fn(s); }, /Bad argument type/i, 'session072: %CH(Vec, Vec) → Bad argument type (no broadcast)');
}
{
  // %CH on two Matrices — no broadcast.
  const s = new Stack();
  s.push(Matrix([[Real(1)]])); s.push(Matrix([[Real(2)]]));
  assertThrows(() => { lookup('%CH').fn(s); }, /Bad argument type/i, 'session072: %CH(Mat, Mat) → Bad argument type');
}
{
  // Regression guard: scalar %/%T/%CH still works after the audit.
  const s = new Stack();
  s.push(Real(200)); s.push(Real(10));
  lookup('%').fn(s);
  assert(s.peek().value.eq(20),
    `session072: regression guard — %(200, 10) = 20 (got ${s.peek().value})`);
}
{
  // Symbolic lift still fires when either operand is symbolic.
  const s = new Stack();
  const [x] = parseEntry("`X`");
  s.push(x); s.push(Real(10));
  lookup('%').fn(s);
  assert(s.peek().type === 'symbolic',
    'session072: regression guard — %(Sy, Real) lifts to Symbolic');
}

/* ================================================================
   session358: percent-family V/M rejection — complementary
     operand-position × kind arms.  session072 pinned only %'s x-Vec
     and y-Vec, %T's x-Mat, and %CH's both-V/both-M (which trip the
     x-slot).  `_percentOp` runs `toRealOrThrow(x)` then
     `toRealOrThrow(y)`, so the y-slot is a distinct reject path reached
     only with a valid Real x — untested for %T and %CH (and for %'s
     y-Mat).  This closes the gap so each of % / %T / %CH rejects a
     Vector OR Matrix in EITHER operand position, mirroring the
     MOD/MIN/MAX symmetric-slot audit (session344).
   ================================================================ */
{
  const V = () => Vector([Real(1), Real(2)]);
  const M = () => Matrix([[Real(1), Real(2)], [Real(3), Real(4)]]);
  const rej = (op, a, b, label) => {
    const s = new Stack();
    s.push(a); s.push(b);
    assertThrows(() => { lookup(op).fn(s); }, /Bad argument type/i, label);
  };
  // % — complementary kinds (x-Vec / y-Vec already in session072).
  rej('%',   M(),       Real(10), 'session358: %(Mat, Real) → Bad argument type (x-Mat)');
  rej('%',   Real(100), M(),      'session358: %(Real, Mat) → Bad argument type (y-Mat slot)');
  // %T — y-slot V/M (reached past a valid Real x) + x-Vec.
  rej('%T',  V(),       Real(10), 'session358: %T(Vec, Real) → Bad argument type (x-Vec)');
  rej('%T',  Real(100), V(),      'session358: %T(Real, Vec) → Bad argument type (y-Vec slot)');
  rej('%T',  Real(100), M(),      'session358: %T(Real, Mat) → Bad argument type (y-Mat slot)');
  // %CH — y-slot V/M (its session072 both-V/both-M pins trip the x-arm).
  rej('%CH', Real(100), V(),      'session358: %CH(Real, Vec) → Bad argument type (y-Vec slot)');
  rej('%CH', Real(100), M(),      'session358: %CH(Real, Mat) → Bad argument type (y-Mat slot)');
}

/* ================================================================
   EUCLID (Bezout) + INVMOD (modular inverse).
   ================================================================ */

{
  const s = new Stack();
  s.push(Integer(3n));
  s.push(Integer(5n));
  lookup('EUCLID').fn(s);
  const out = s.pop();
  assert(out && Array.isArray(out.items) && out.items.length === 3,
    'session076: EUCLID pushes a 3-element list');
  const [u, v, g] = out.items;
  assert(isInteger(u) && isInteger(v) && isInteger(g),
    'session076: EUCLID list elements are Integers');
  // u*3 + v*5 = g, and g = 1.
  assert(g.value === 1n,
    `session076: EUCLID(3, 5) gcd = 1 (got ${g.value})`);
  assert(u.value * 3n + v.value * 5n === 1n,
    `session076: EUCLID(3, 5) Bezout identity holds (got ${u.value}·3 + ${v.value}·5)`);
}

{
  const s = new Stack();
  s.push(Integer(12n));
  s.push(Integer(18n));
  lookup('EUCLID').fn(s);
  const out = s.pop();
  const [u, v, g] = out.items;
  assert(g.value === 6n,
    `session076: EUCLID(12, 18) gcd = 6 (got ${g.value})`);
  assert(u.value * 12n + v.value * 18n === 6n,
    `session076: EUCLID(12, 18) Bezout identity holds`);
}

{
  const s = new Stack();
  s.push(Integer(-15n));
  s.push(Integer(6n));
  lookup('EUCLID').fn(s);
  const out = s.pop();
  const [u, v, g] = out.items;
  // gcd(|-15|, 6) = 3; verify u·(-15) + v·6 = 3.
  assert(g.value === 3n,
    `session076: EUCLID(-15, 6) gcd = 3 (got ${g.value})`);
  assert(u.value * (-15n) + v.value * 6n === 3n,
    `session076: EUCLID(-15, 6) Bezout identity holds on signed operand`);
}

{
  const s = new Stack();
  s.push(Integer(0n));
  s.push(Integer(7n));
  lookup('EUCLID').fn(s);
  const out = s.pop();
  const [u, v, g] = out.items;
  // gcd(0, 7) = 7; 0·u + 7·v = 7  ⇒ v = 1 (u unconstrained by identity).
  assert(g.value === 7n, 'session076: EUCLID(0, 7) gcd = 7');
  assert(u.value * 0n + v.value * 7n === 7n,
    'session076: EUCLID(0, 7) Bezout identity holds');
}

{
  const s = new Stack();
  s.push(Integer(0n));
  s.push(Integer(0n));
  assertThrows(() => { lookup('EUCLID').fn(s); }, /Bad argument value/, 'session076: EUCLID(0, 0) rejects with Bad argument value');
}

{
  const s = new Stack();
  s.push(Real(3.5));
  s.push(Integer(5n));
  assertThrows(() => { lookup('EUCLID').fn(s); }, /Bad argument value/, 'session076: EUCLID rejects non-integer-valued Real');
}

{
  const s = new Stack();
  s.push(Str('x'));
  s.push(Integer(5n));
  assertThrows(() => { lookup('EUCLID').fn(s); }, /Bad argument type/, 'session076: EUCLID on String rejects with Bad argument type');
}

{
  const s = new Stack();
  s.push(Integer(3n));
  s.push(Integer(11n));
  lookup('INVMOD').fn(s);
  const out = s.pop();
  assert(isInteger(out) && out.value === 4n,
    `session076: INVMOD(3, 11) = 4 (got ${out.value})`);
}

{
  // A textbook RSA-style case.  17 · 2753 = 46801 = 15·3120 + 1.
  const s = new Stack();
  s.push(Integer(17n));
  s.push(Integer(3120n));
  lookup('INVMOD').fn(s);
  const out = s.pop();
  assert(out.value === 2753n,
    `session076: INVMOD(17, 3120) = 2753 (got ${out.value})`);
  assert((17n * out.value) % 3120n === 1n,
    'session076: INVMOD(17, 3120) satisfies 17·r ≡ 1 (mod 3120)');
}

{
  // -3 ≡ 8 (mod 11); so INVMOD(-3, 11) = INVMOD(8, 11).  8·7 = 56 = 5·11+1.
  const s = new Stack();
  s.push(Integer(-3n));
  s.push(Integer(11n));
  lookup('INVMOD').fn(s);
  const out = s.pop();
  assert(out.value === 7n,
    `session076: INVMOD(-3, 11) = 7 (reduces -3 to 8 first) (got ${out.value})`);
}

{
  const s = new Stack();
  s.push(Integer(5n));
  s.push(Integer(13n));
  lookup('INVMOD').fn(s);
  const out = s.pop();
  assert(out.value >= 0n && out.value < 13n,
    `session076: INVMOD result reduced into [0, n) (got ${out.value})`);
  assert((5n * out.value) % 13n === 1n,
    'session076: INVMOD(5, 13) satisfies the inverse equation');
}

{
  const s = new Stack();
  s.push(Integer(4n));
  s.push(Integer(6n));         // gcd(4, 6) = 2 → no inverse
  assertThrows(() => { lookup('INVMOD').fn(s); }, /Bad argument value/, 'session076: INVMOD(4, 6) rejects — no inverse (gcd = 2)');
}

{
  const s = new Stack();
  s.push(Integer(3n));
  s.push(Integer(1n));
  assertThrows(() => { lookup('INVMOD').fn(s); }, /Bad argument value/, 'session076: INVMOD rejects modulus = 1');
}

{
  const s = new Stack();
  s.push(Integer(6n));
  s.push(Integer(3n));
  assertThrows(() => { lookup('INVMOD').fn(s); }, /Bad argument value/, 'session076: INVMOD(6, 3) rejects — 6 ≡ 0 (mod 3)');
}

{
  const s = new Stack();
  s.push(Real(3.5));
  s.push(Integer(11n));
  assertThrows(() => { lookup('INVMOD').fn(s); }, /Bad argument value/, 'session076: INVMOD rejects non-integer-valued Real');
}

{
  const s = new Stack();
  s.push(Str('3'));
  s.push(Integer(11n));
  assertThrows(() => { lookup('INVMOD').fn(s); }, /Bad argument type/, 'session076: INVMOD on String rejects with Bad argument type');
}

/* ================================================================
   DATA_TYPES ✗ rejection sweep.

   Charter rule (TESTS.md): "ops marked ✗ in docs/DATA_TYPES.md should
   have a matching rejection assertion in the tree."  This block
   carries the explicit rejection tests for bare (unwrapped) ✗ cells
   so the matrix is 1:1 with the test tree.

   All assertions are hard-asserted — these cells reject by contract.
   ================================================================ */

{
  // GCD(Complex, Integer) — bare Complex, not wrapped in List or Tagged.
  // AUR §3 says GCD is integer-only.  `_gcdScalar` rejects Complex
  // unconditionally — List/Tagged wrappers unwrap first, so this bare
  // path is pinned separately.
  const s = new Stack();
  s.push(Complex(3, 4));
  s.push(Integer(6n));
  assertThrows(() => lookup('GCD').fn(s), /Bad argument/,
    'session075: GCD(Complex, Integer) rejects (integer-only)');
}
{
  // GCD(Integer, Complex) — argument-order variant.
  const s = new Stack();
  s.push(Integer(6n));
  s.push(Complex(3, 4));
  assertThrows(() => lookup('GCD').fn(s), /Bad argument/,
    'session075: GCD(Integer, Complex) rejects (integer-only, level-1 Complex)');
}
{
  // GCD(Vector, Integer) — no element-wise broadcast (AUR §3 scalar-only).
  const s = new Stack();
  s.push(Vector([Integer(6n), Integer(9n)]));
  s.push(Integer(12n));
  assertThrows(() => lookup('GCD').fn(s), /Bad argument/,
    'session075: GCD(Vector, Integer) rejects (no broadcast on V)');
}
{
  // GCD(Matrix, Integer) — mirror.
  const s = new Stack();
  s.push(Matrix([[Integer(6n), Integer(9n)]]));
  s.push(Integer(12n));
  assertThrows(() => lookup('GCD').fn(s), /Bad argument/,
    'session075: GCD(Matrix, Integer) rejects (no broadcast on M)');
}
{
  // LCM(Complex, Integer) — mirror the GCD case.
  const s = new Stack();
  s.push(Complex(3, 4));
  s.push(Integer(6n));
  assertThrows(() => lookup('LCM').fn(s), /Bad argument/,
    'session075: LCM(Complex, Integer) rejects (integer-only)');
}
{
  // LCM(Vector, Integer).
  const s = new Stack();
  s.push(Vector([Integer(6n), Integer(9n)]));
  s.push(Integer(12n));
  assertThrows(() => lookup('LCM').fn(s), /Bad argument/,
    'session075: LCM(Vector, Integer) rejects (no broadcast on V)');
}
{
  // LCM(Matrix, Integer).
  const s = new Stack();
  s.push(Matrix([[Integer(6n), Integer(9n)]]));
  s.push(Integer(12n));
  assertThrows(() => lookup('LCM').fn(s), /Bad argument/,
    'session075: LCM(Matrix, Integer) rejects (no broadcast on M)');
}

{
  // MOD and MIN on Complex are pinned elsewhere; MAX mirrors them.
  // No total order on ℂ → Bad argument.
  const s = new Stack();
  s.push(Complex(1, 1));
  s.push(Complex(2, 2));
  assertThrows(() => lookup('MAX').fn(s), null,
    'session075: MAX(Complex, Complex) rejects (no total order on ℂ)');
}

{
  // %T(Complex, Real) — percent family is scalar-only (AUR §3-1).
  // %/%T/%CH refuse Complex; this pins the %T variant explicitly.
  const s = new Stack();
  s.push(Complex(1, 1));
  s.push(Real(10));
  assertThrows(() => lookup('%T').fn(s), /Bad argument/,
    'session075: %T(Complex, Real) rejects (percent-family scalar-only)');
}
{
  // %CH(Complex, Real) — mirror.
  const s = new Stack();
  s.push(Complex(1, 1));
  s.push(Real(10));
  assertThrows(() => lookup('%CH').fn(s), /Bad argument/,
    'session075: %CH(Complex, Real) rejects (percent-family scalar-only)');
}

{
  // FLOOR and FP on Complex are pinned elsewhere; CEIL and IP mirror
  // them.  Fill these so the matrix is 1:1.
  const s = new Stack();
  s.push(Complex(1.5, 2.5));
  assertThrows(() => lookup('CEIL').fn(s), /Bad argument type/,
    'session075: CEIL(Complex) rejects (no floor/ceil on ℂ)');
}
{
  const s = new Stack();
  s.push(Complex(1.5, 2.5));
  assertThrows(() => lookup('IP').fn(s), /Bad argument type/,
    'session075: IP(Complex) rejects (no integer-part on ℂ)');
}

/* DATA_TYPES marks FACT V/M as ✓ via `_withVMUnary` (element-wise).
 * This is a DOUBLE-CHECK positive — if someone reverts the widening
 * this assertion fails loudly and the regression is attributed here
 * rather than showing up as a mystery count delta. */
{
  const s = new Stack();
  s.push(Vector([Integer(3n), Integer(4n)]));
  lookup('FACT').fn(s);
  const v = s.peek();
  assert(v.type === 'vector'
      && v.items[0].value === 6n
      && v.items[1].value === 24n,
    'session075: FACT(Vector) distributes element-wise → [6, 24] (regression guard)');
}

/* =====================================================================
   TRUNC (two-arg CAS form), PSI (digamma + polygamma)
   =====================================================================

   TRUNC is the CAS-form sibling of TRNC: identical numeric behaviour
   `(x, n → y)`, plus a Symbolic lift when either operand is a Name or
   Symbolic.  PSI is digamma + polygamma — one-arg `(x → ψ(x))` and
   two-arg `(x, n → ψ^(n)(x))`.  Two-arg dispatch kicks in when the top
   is a non-negative Integer / integer-valued Real and there's a
   second argument below.
*/

{
  // TRUNC(3.14159, 2) → 3.14  (toward-zero truncation at 2 decimals).
  const s = new Stack();
  s.push(Real(3.14159));
  s.push(Integer(2n));
  lookup('TRUNC').fn(s);
  assert(Math.abs(s.peek().value - 3.14) < 1e-12,
    'session081: TRUNC(3.14159, 2) → 3.14');
}
{
  // Negative x: truncation is toward zero.  TRUNC(-1.999, 1) → -1.9.
  const s = new Stack();
  s.push(Real(-1.999));
  s.push(Integer(1n));
  lookup('TRUNC').fn(s);
  assert(Math.abs(s.peek().value - (-1.9)) < 1e-12,
    'session081: TRUNC(-1.999, 1) → -1.9 (toward-zero, matches TRNC)');
}
{
  // Integer input with n ≥ 0 returns the Integer untouched.
  const s = new Stack();
  s.push(Integer(42n));
  s.push(Integer(3n));
  lookup('TRUNC').fn(s);
  assert(s.peek().type === 'integer' && s.peek().value === 42n,
    'session081: TRUNC(Integer(42), 3) → Integer(42) (integer passthrough)');
}

{
  // Either-side Symbolic → AST wraps with TRUNC(x, n).
  const s = new Stack();
  s.push(Name('X', { quoted: true }));
  s.push(Integer(3n));
  lookup('TRUNC').fn(s);
  const v = s.peek();
  assert(v.type === 'symbolic' && v.expr.kind === 'fn' && v.expr.name === 'TRUNC'
      && v.expr.args.length === 2
      && v.expr.args[0].kind === 'var' && v.expr.args[0].name === 'X'
      && v.expr.args[1].kind === 'num' && v.expr.args[1].value === 3,
    'session081: TRUNC(\'X\', 3) lifts to Symbolic TRUNC(X, 3)');
}
{
  // Symbolic on both sides works too.
  const s = new Stack();
  s.push(Name('X', { quoted: true }));
  s.push(Name('N', { quoted: true }));
  lookup('TRUNC').fn(s);
  const v = s.peek();
  assert(v.type === 'symbolic' && v.expr.kind === 'fn' && v.expr.name === 'TRUNC',
    'session081: TRUNC(\'X\', \'N\') lifts to Symbolic TRUNC(X, N)');
}

{
  // Non-integer n → Bad argument value (inherits from _roundingOp).
  const s = new Stack();
  s.push(Real(3.14));
  s.push(Real(1.5));
  assertThrows(() => lookup('TRUNC').fn(s), /Bad argument value/,
    'session081: TRUNC(x, 1.5) rejects non-integer count');
}
{
  // String argument rejects.
  const s = new Stack();
  s.push(Str('foo'));
  s.push(Integer(2n));
  assertThrows(() => lookup('TRUNC').fn(s), /Bad argument/,
    'session081: TRUNC(String, 2) rejects non-numeric x');
}
{
  // Too few arguments.
  const s = new Stack();
  s.push(Real(3.14));
  assertThrows(() => lookup('TRUNC').fn(s), /Too few arguments/,
    'session081: TRUNC with depth < 2 → Too few arguments');
}

{
  // session302: Z-column fold for the rounding family — an Integer operand
  // rounded/truncated to a NEGATIVE decimal place. _roundingOp's integer
  // passthrough only fires for n >= 0 (session081 pins TRUNC(Integer(42),3));
  // a negative n routes the Integer through the same Real-rounding path as a
  // Real operand, so the result is a Real, not an Integer. Every prior pin on
  // this branch used a Real x — this exercises the `isInteger(xv)` arm.
  for (const op of ['TRNC', 'TRUNC']) {
    {
      const s = new Stack();
      s.push(Integer(123n));
      s.push(Integer(-1n));
      lookup(op).fn(s);
      const v = s.peek();
      assert(v.type === 'real' && Math.abs(v.value - 100) < 1e-9,
        `session302: ${op}(Integer(123), -1) → Real(100) (toward-zero on integer arm)`);
    }
    {
      const s = new Stack();
      s.push(Integer(1250n));
      s.push(Integer(-2n));
      lookup(op).fn(s);
      const v = s.peek();
      assert(v.type === 'real' && Math.abs(v.value - 1200) < 1e-9,
        `session302: ${op}(Integer(1250), -2) → Real(1200)`);
    }
    {
      // 7 sits below the -1 decimal place, so toward-zero leaves it at 7 —
      // but still returned as a Real, since the integer arm only passes
      // through unchanged for n >= 0.
      const s = new Stack();
      s.push(Integer(7n));
      s.push(Integer(-1n));
      lookup(op).fn(s);
      const v = s.peek();
      assert(v.type === 'real' && Math.abs(v.value - 7) < 1e-9,
        `session302: ${op}(Integer(7), -1) → Real(7)`);
    }
  }
  // RND shares _roundingOp but rounds half-away-from-zero, so it diverges from
  // TRNC/TRUNC's toward-zero on the same integer arm: RND(1250,-2) → 1300.
  {
    const s = new Stack();
    s.push(Integer(1250n));
    s.push(Integer(-2n));
    lookup('RND').fn(s);
    const v = s.peek();
    assert(v.type === 'real' && Math.abs(v.value - 1300) < 1e-9,
      'session302: RND(Integer(1250), -2) → Real(1300) (half-away contrasts toward-zero)');
  }
  {
    const s = new Stack();
    s.push(Integer(123n));
    s.push(Integer(-1n));
    lookup('RND').fn(s);
    const v = s.peek();
    assert(v.type === 'real' && Math.abs(v.value - 100) < 1e-9,
      'session302: RND(Integer(123), -1) → Real(100)');
  }
}

{
  // ψ(1) = -γ ≈ -0.5772156649015329.  Accept ~1e-10 rel error.
  const s = new Stack();
  s.push(Real(1));
  lookup('PSI').fn(s);
  assert(Math.abs(s.peek().value - (-0.5772156649015329)) < 1e-10,
    'session081: PSI(1) ≈ -γ');
}
{
  // ψ(1/2) = -γ - 2 ln 2 ≈ -1.9635100260214235.
  const s = new Stack();
  s.push(Real(0.5));
  lookup('PSI').fn(s);
  assert(Math.abs(s.peek().value - (-1.9635100260214235)) < 1e-10,
    'session081: PSI(1/2) ≈ -γ - 2ln2');
}
{
  // ψ(10) = H_9 - γ ≈ 2.2517525890667215.
  const s = new Stack();
  s.push(Real(10));
  lookup('PSI').fn(s);
  assert(Math.abs(s.peek().value - 2.2517525890667215) < 1e-10,
    'session081: PSI(10) ≈ H_9 - γ');
}
{
  // Integer input accepted; same result as the integer-valued Real.
  const s = new Stack();
  s.push(Integer(5n));
  lookup('PSI').fn(s);
  assert(Math.abs(s.peek().value - (1 + 0.5 + 1/3 + 0.25 - 0.5772156649015329)) < 1e-10,
    'session081: PSI(Integer(5)) ≈ H_4 - γ');
}
{
  // Reflection path (x < 0.5): PSI(0.1) ≈ -10.423754940411078.
  const s = new Stack();
  s.push(Real(0.1));
  lookup('PSI').fn(s);
  assert(Math.abs(s.peek().value - (-10.423754940411078)) < 1e-10,
    'session081: PSI(0.1) exercises reflection path');
}

{
  // ψ_1(1) = ζ(2) = π²/6 ≈ 1.6449340668482264.
  const s = new Stack();
  s.push(Real(1));
  s.push(Integer(1n));
  lookup('PSI').fn(s);
  assert(Math.abs(s.peek().value - (Math.PI * Math.PI / 6)) < 1e-10,
    'session081: PSI(1, 1) = ψ_1(1) ≈ π²/6');
}
{
  // ψ_2(1) = -2 ζ(3) ≈ -2.404113806319188.
  const s = new Stack();
  s.push(Real(1));
  s.push(Integer(2n));
  lookup('PSI').fn(s);
  assert(Math.abs(s.peek().value - (-2.4041138063191885)) < 1e-10,
    'session081: PSI(1, 2) = ψ_2(1) ≈ -2ζ(3)');
}
{
  // ψ_1(2) = ζ(2) - 1.  Checks the shift recurrence.
  const s = new Stack();
  s.push(Real(2));
  s.push(Integer(1n));
  lookup('PSI').fn(s);
  assert(Math.abs(s.peek().value - (Math.PI * Math.PI / 6 - 1)) < 1e-10,
    'session081: PSI(2, 1) = ψ_1(2) ≈ π²/6 - 1');
}
{
  // Two-arg with n = 0 must collapse to one-arg digamma.
  const s = new Stack();
  s.push(Real(1));
  s.push(Integer(0n));
  lookup('PSI').fn(s);
  assert(Math.abs(s.peek().value - (-0.5772156649015329)) < 1e-10,
    'session081: PSI(1, 0) = ψ_0(1) = digamma(1) = -γ');
}

{
  // session389: _polygammaScalar's x-operand integer arm (ops.js ~2595,
  // `isInteger(v) ? Number(v.value) : isReal(v) ? v.value.toNumber()`).
  // Every session081 two-arg pin pushed a Real x, so the isInteger arm was
  // never positively exercised — only the String reject (1-arg path) touched a
  // non-Real type. Same Real-only Z gap as Ei/Si/Ci (session382), erf/erfc
  // (session280), MANT (session285), LAMBERT (session296). Probed live: an
  // Integer x yields the Real-x result bit-for-bit and stays Real.
  const psi2 = (xMaker, n) => {
    const s = new Stack();
    s.push(xMaker());
    s.push(Integer(BigInt(n)));
    lookup('PSI').fn(s);
    return s.peek();
  };
  for (const [x, n, label] of [
    [1, 1, 'ψ_1(1)'], [1, 2, 'ψ_2(1)'], [2, 1, 'ψ_1(2)'],
    [5, 1, 'ψ_1(5)'], [1, 0, 'ψ_0(1)'],
  ]) {
    const ri = psi2(() => Integer(BigInt(x)), n);
    const rr = psi2(() => Real(x), n);
    assert(isReal(ri), `session389: PSI(Integer ${x}, ${n}) = ${label} stays Real`);
    assert(Number(ri.value) === Number(rr.value),
      `session389: PSI(Integer ${x}, ${n}) = ${label} matches Real-operand result`);
  }
  // Closed-form anchors on the integer arm (mirrors the session081 Real pins).
  assert(Math.abs(Number(psi2(() => Integer(1n), 1).value) - (Math.PI * Math.PI / 6)) < 1e-10,
    'session389: PSI(Integer 1, 1) = ψ_1(1) ≈ π²/6');
  assert(Math.abs(Number(psi2(() => Integer(1n), 0).value) - (-0.5772156649015329)) < 1e-10,
    'session389: PSI(Integer 1, 0) = ψ_0(1) = -γ (n=0 collapses to digamma)');
}

{
  // 1-arg Symbolic → PSI(X) AST node.
  const s = new Stack();
  s.push(Name('X', { quoted: true }));
  lookup('PSI').fn(s);
  const v = s.peek();
  assert(v.type === 'symbolic' && v.expr.kind === 'fn'
      && v.expr.name === 'PSI' && v.expr.args.length === 1,
    'session081: PSI(\'X\') lifts to Symbolic PSI(X)');
}
{
  // 2-arg Symbolic (x is a Name, n is Integer) → PSI(X, 2) AST node.
  const s = new Stack();
  s.push(Name('X', { quoted: true }));
  s.push(Integer(2n));
  lookup('PSI').fn(s);
  const v = s.peek();
  assert(v.type === 'symbolic' && v.expr.kind === 'fn'
      && v.expr.name === 'PSI' && v.expr.args.length === 2
      && v.expr.args[1].kind === 'num' && v.expr.args[1].value === 2,
    'session081: PSI(\'X\', 2) lifts to Symbolic PSI(X, 2)');
}

{
  // Pole at non-positive integer.
  const s = new Stack();
  s.push(Real(0));
  assertThrows(() => lookup('PSI').fn(s), /Infinite result/,
    'session081: PSI(0) throws Infinite result (simple pole)');
}
{
  // Pole at -1.
  const s = new Stack();
  s.push(Integer(-1n));
  assertThrows(() => lookup('PSI').fn(s), /Infinite result/,
    'session081: PSI(Integer(-1)) throws Infinite result (simple pole)');
}
{
  // String argument rejects with Bad argument type (no viable numeric
  // or Symbolic interpretation).
  const s = new Stack();
  s.push(Str('foo'));
  assertThrows(() => lookup('PSI').fn(s), /Bad argument type/,
    'session081: PSI(String) rejects Bad argument type');
}
{
  // Empty stack.
  const s = new Stack();
  assertThrows(() => lookup('PSI').fn(s), /Too few arguments/,
    'session081: PSI with empty stack → Too few arguments');
}
{
  // Two-arg with negative n falls back to 1-arg (n is not a valid
  // polygamma order).  Top -1 is an Integer but n < 0 means the
  // 2-arg branch doesn't fire — PSI then treats -1 as the 1-arg x
  // and throws Infinite result (pole).
  const s = new Stack();
  s.push(Real(2));
  s.push(Integer(-1n));
  assertThrows(() => lookup('PSI').fn(s), /Infinite result/,
    'session081: PSI(x, -1) — negative order falls back to 1-arg on -1, which is a pole');
}

{
  // 1-arg PSI distributes over a List: PSI({1 2}) → {ψ(1) ψ(2)}.
  const s = new Stack();
  s.push(RList([Real(1), Real(2)]));
  lookup('PSI').fn(s);
  const out = s.peek();
  assert(out.type === 'list' && out.items.length === 2
      && Math.abs(out.items[0].value - (-0.5772156649015329)) < 1e-10
      && Math.abs(out.items[1].value - (1 - 0.5772156649015329)) < 1e-10,
    'session081: PSI({1, 2}) distributes element-wise');
}
{
  // 1-arg PSI distributes over a Vector.
  const s = new Stack();
  s.push(Vector([Real(1), Real(2)]));
  lookup('PSI').fn(s);
  const out = s.peek();
  assert(out.type === 'vector' && out.items.length === 2
      && Math.abs(out.items[0].value - (-0.5772156649015329)) < 1e-10,
    'session081: PSI(Vector) distributes element-wise');
}
{
  // Tagged: PSI unwraps, computes, re-tags.
  const s = new Stack();
  s.push(Tagged('arg', Real(1)));
  lookup('PSI').fn(s);
  const out = s.peek();
  assert(out.type === 'tagged' && out.tag === 'arg'
      && Math.abs(out.value.value - (-0.5772156649015329)) < 1e-10,
    'session081: PSI(:arg:Real) preserves tag and computes underneath');
}

/* =====================================================================
   CYCLOTOMIC (n-th cyclotomic polynomial)
   =====================================================================

   CYCLOTOMIC returns Φ_n(X), the monic polynomial in Z[X] whose roots
   are exactly the primitive n-th roots of unity.  Verified against
   known small-n values and the famous Φ_105 coefficient of −2.
*/

// Helper: compare a Symbolic result against an expected descending-
// degree integer coefficient array in X (0 entries skipped, leading
// sign absorbed) by parsing the Symbolic into ops.js's AST form.
function _coefArrayOfSymbolic(sym) {
  // Flatten a + / − / neg / * / ^ / X / Num AST into a descending-
  // degree coefficient map.  Rough-and-ready — only meant for the
  // shapes `_coefArrToSymbolicX` actually emits.
  const map = new Map();            // degree → coefficient
  function walk(ast, sign) {
    if (ast.kind === 'num') {
      map.set(0, (map.get(0) || 0) + sign * ast.value);
      return;
    }
    if (ast.kind === 'var') {
      map.set(1, (map.get(1) || 0) + sign * 1);
      return;
    }
    if (ast.kind === 'neg') { walk(ast.arg, -sign); return; }
    if (ast.kind === 'bin') {
      if (ast.op === '+') { walk(ast.l, sign); walk(ast.r, sign); return; }
      if (ast.op === '-') { walk(ast.l, sign); walk(ast.r, -sign); return; }
      if (ast.op === '*') {
        // coef * X^n  OR  coef * X
        const c = ast.l.kind === 'num' ? ast.l.value : null;
        if (c === null) throw new Error('unexpected * shape');
        let deg = 0;
        if (ast.r.kind === 'var') deg = 1;
        else if (ast.r.kind === 'bin' && ast.r.op === '^'
              && ast.r.l.kind === 'var' && ast.r.r.kind === 'num') {
          deg = ast.r.r.value;
        } else throw new Error('unexpected * RHS');
        map.set(deg, (map.get(deg) || 0) + sign * c);
        return;
      }
      if (ast.op === '^' && ast.l.kind === 'var' && ast.r.kind === 'num') {
        map.set(ast.r.value, (map.get(ast.r.value) || 0) + sign * 1);
        return;
      }
    }
    throw new Error('unexpected AST shape: ' + ast.kind);
  }
  walk(sym.expr, 1);
  const deg = Math.max(...map.keys());
  const out = new Array(deg + 1).fill(0);
  for (const [k, v] of map) out[deg - k] = v;
  return out;
}

function _arrayEq(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

{
  // Φ_1 = x - 1
  const s = new Stack();
  s.push(Integer(1n));
  lookup('CYCLOTOMIC').fn(s);
  assert(_arrayEq(_coefArrayOfSymbolic(s.peek()), [1, -1]),
    'session081: CYCLOTOMIC(1) = Φ_1 = X - 1');
}
{
  // Φ_2 = x + 1
  const s = new Stack();
  s.push(Integer(2n));
  lookup('CYCLOTOMIC').fn(s);
  assert(_arrayEq(_coefArrayOfSymbolic(s.peek()), [1, 1]),
    'session081: CYCLOTOMIC(2) = Φ_2 = X + 1');
}
{
  // Φ_3 = x² + x + 1
  const s = new Stack();
  s.push(Integer(3n));
  lookup('CYCLOTOMIC').fn(s);
  assert(_arrayEq(_coefArrayOfSymbolic(s.peek()), [1, 1, 1]),
    'session081: CYCLOTOMIC(3) = Φ_3 = X² + X + 1');
}
{
  // Φ_4 = x² + 1
  const s = new Stack();
  s.push(Integer(4n));
  lookup('CYCLOTOMIC').fn(s);
  assert(_arrayEq(_coefArrayOfSymbolic(s.peek()), [1, 0, 1]),
    'session081: CYCLOTOMIC(4) = Φ_4 = X² + 1');
}
{
  // Φ_6 = x² - x + 1
  const s = new Stack();
  s.push(Integer(6n));
  lookup('CYCLOTOMIC').fn(s);
  assert(_arrayEq(_coefArrayOfSymbolic(s.peek()), [1, -1, 1]),
    'session081: CYCLOTOMIC(6) = Φ_6 = X² - X + 1');
}
{
  // Φ_12 = x⁴ - x² + 1
  const s = new Stack();
  s.push(Integer(12n));
  lookup('CYCLOTOMIC').fn(s);
  assert(_arrayEq(_coefArrayOfSymbolic(s.peek()), [1, 0, -1, 0, 1]),
    'session081: CYCLOTOMIC(12) = Φ_12 = X⁴ - X² + 1');
}
{
  // Φ_105 famously has a −2 coefficient — the first cyclotomic whose
  // coefficients leave {−1, 0, 1}.  Verify the degree is φ(105) = 48
  // and that a −2 appears.
  const s = new Stack();
  s.push(Integer(105n));
  lookup('CYCLOTOMIC').fn(s);
  const coefs = _coefArrayOfSymbolic(s.peek());
  assert(coefs.length === 49, 'session081: CYCLOTOMIC(105) degree = 48');
  assert(coefs.includes(-2), 'session081: CYCLOTOMIC(105) contains the −2 coefficient');
}
{
  // Integer-valued Real accepted.
  const s = new Stack();
  s.push(Real(5));
  lookup('CYCLOTOMIC').fn(s);
  const coefs = _coefArrayOfSymbolic(s.peek());
  assert(_arrayEq(coefs, [1, 1, 1, 1, 1]),
    'session081: CYCLOTOMIC(Real(5)) = Φ_5 = X⁴ + X³ + X² + X + 1 (integer-Real accepted)');
}

{
  // n = 0 throws.
  const s = new Stack();
  s.push(Integer(0n));
  assertThrows(() => lookup('CYCLOTOMIC').fn(s), /Bad argument value/,
    'session081: CYCLOTOMIC(0) rejects (n must be ≥ 1)');
}
{
  // Negative n throws via _nFromIntegerArg.
  const s = new Stack();
  s.push(Integer(-3n));
  assertThrows(() => lookup('CYCLOTOMIC').fn(s), /Bad argument value/,
    'session081: CYCLOTOMIC(-3) rejects (n < 0)');
}
{
  // Non-integer Real rejects via _nFromIntegerArg.
  const s = new Stack();
  s.push(Real(3.5));
  assertThrows(() => lookup('CYCLOTOMIC').fn(s), /Bad argument value/,
    'session081: CYCLOTOMIC(3.5) rejects (non-integer Real)');
}
{
  // Non-numeric rejects with Bad argument type.
  const s = new Stack();
  s.push(Str('foo'));
  assertThrows(() => lookup('CYCLOTOMIC').fn(s), /Bad argument type/,
    'session081: CYCLOTOMIC(String) rejects Bad argument type');
}
{
  // Precision cap at n > 200.
  const s = new Stack();
  s.push(Integer(201n));
  assertThrows(() => lookup('CYCLOTOMIC').fn(s), /Bad argument value/,
    'session081: CYCLOTOMIC(201) rejects (precision cap — MAX_SAFE_INTEGER guard)');
}

/* =====================================================================
   ZETA (Riemann zeta), LAMBERT (Lambert W₀), XNUM / XQ

   ZETA      HP50 AUR §2 (CAS-SPECIAL).  Real one-arg Riemann zeta.
             Euler-Maclaurin on s ≥ 1/2, functional-equation reflection
             below.  Accurate to double precision except at s=1 (pole).

   LAMBERT   HP50 AUR §2 (CAS-SPECIAL).  Principal branch W₀.  Halley
             iteration seeded with a Puiseux expansion near the branch
             point so W(-1/e) = -1 exactly in double precision.

   XNUM/XQ   HP50 AUR p.2-211.  ASCII aliases for →NUM / →Q.
   ===================================================================== */

// ZETA — closed-form exact match against known series values
{
  const s = new Stack();
  s.push(Real(2));
  lookup('ZETA').fn(s);
  // ζ(2) = π²/6 to double precision.
  assert(isReal(s.peek()) && Math.abs(s.peek().value - Math.PI * Math.PI / 6) < 1e-12,
    'session086: ZETA(2) = π²/6');
}
{
  const s = new Stack();
  s.push(Real(4));
  lookup('ZETA').fn(s);
  // ζ(4) = π⁴/90.
  assert(Math.abs(s.peek().value - Math.pow(Math.PI, 4) / 90) < 1e-12,
    'session086: ZETA(4) = π⁴/90');
}
{
  const s = new Stack();
  s.push(Real(3));
  lookup('ZETA').fn(s);
  // Apéry's constant ζ(3) ≈ 1.2020569031595942853997…
  assert(Math.abs(s.peek().value - 1.2020569031595942) < 1e-12,
    "session086: ZETA(3) = Apéry's constant");
}
{
  const s = new Stack();
  s.push(Integer(0n));
  lookup('ZETA').fn(s);
  // ζ(0) = -1/2 — falls straight out of the code, not iteration.
  assert(isReal(s.peek()) && s.peek().value.eq(-0.5),
    'session086: ZETA(0) = -1/2');
}
{
  const s = new Stack();
  s.push(Integer(-1n));
  lookup('ZETA').fn(s);
  // ζ(-1) = -1/12 via functional-equation reflection.
  assert(Math.abs(s.peek().value - (-1/12)) < 1e-13,
    'session086: ZETA(-1) = -1/12 via reflection');
}
{
  const s = new Stack();
  s.push(Integer(-2n));
  lookup('ZETA').fn(s);
  // Trivial zero at a negative even integer — returned as exact 0, not
  // a computed near-zero from sin(πs/2).
  assert(s.peek().value.eq(0),
    'session086: ZETA(-2) = 0 (trivial zero, exact)');
}
{
  const s = new Stack();
  s.push(Real(0.5));
  lookup('ZETA').fn(s);
  // ζ(1/2) ≈ -1.4603545088095868 — right at the EM branch cutover.
  assert(Math.abs(s.peek().value - (-1.4603545088095868)) < 1e-11,
    'session086: ZETA(0.5) ≈ -1.460354508…');
}

// ZETA — domain & type rejections
{
  const s = new Stack();
  s.push(Integer(1n));
  assertThrows(() => lookup('ZETA').fn(s), /Infinite result/,
    'session086: ZETA(1) rejects with Infinite result (simple pole)');
}
{
  const s = new Stack();
  s.push(Str('foo'));
  assertThrows(() => lookup('ZETA').fn(s), /Bad argument type/,
    'session086: ZETA(String) rejects Bad argument type');
}
{
  // Symbolic lift — ZETA(X) stays symbolic.
  const s = new Stack();
  s.push(Name('X', { quoted: true }));
  lookup('ZETA').fn(s);
  const v = s.peek();
  assert(v.type === 'symbolic' && v.expr.kind === 'fn' && v.expr.name === 'ZETA',
    'session086: ZETA(Name X) lifts to Symbolic ZETA(X)');
}
{
  // List distribution.
  const s = new Stack();
  s.push(RList([Real(2), Real(4)]));
  lookup('ZETA').fn(s);
  const items = s.peek().items;
  assert(items.length === 2
      && Math.abs(items[0].value - Math.PI * Math.PI / 6) < 1e-12
      && Math.abs(items[1].value - Math.pow(Math.PI, 4) / 90) < 1e-12,
    'session086: ZETA distributes over RList');
}
{
  // Tagged transparency.
  const s = new Stack();
  s.push(Tagged('Z', Real(4)));
  lookup('ZETA').fn(s);
  const v = s.peek();
  assert(v.type === 'tagged' && v.tag === 'Z'
      && Math.abs(v.value.value - Math.pow(Math.PI, 4) / 90) < 1e-12,
    'session086: ZETA preserves tag wrapper');
}

// LAMBERT — closed-form values.
{
  const s = new Stack();
  s.push(Real(0));
  lookup('LAMBERT').fn(s);
  assert(s.peek().value.eq(0), 'session086: LAMBERT(0) = 0');
}
{
  const s = new Stack();
  s.push(Real(1));
  lookup('LAMBERT').fn(s);
  // Ω constant — W(1) = 0.5671432904097838729999686622…
  assert(Math.abs(s.peek().value - 0.5671432904097838) < 1e-14,
    'session086: LAMBERT(1) = Ω (omega constant)');
}
{
  const s = new Stack();
  s.push(Real(Math.E));
  lookup('LAMBERT').fn(s);
  // W(e) = 1 — the defining identity (1 * e^1 = e).
  assert(Math.abs(s.peek().value - 1) < 1e-14,
    'session086: LAMBERT(e) = 1');
}
{
  const s = new Stack();
  s.push(Real(-1 / Math.E));
  lookup('LAMBERT').fn(s);
  // Branch point — Puiseux seeding lets Halley hit -1 exactly.
  assert(s.peek().value.eq(-1),
    'session086: LAMBERT(-1/e) = -1 exactly (branch point)');
}

// LAMBERT — bare-Integer operands exercise the `isInteger` arm of
// `_lambertScalar` directly (every other positive pin pushes Real, so the
// Z `✓` cell was Real-only). Guards a refactor degrading Z to Real-only.
{
  const s = new Stack();
  s.push(Integer(0n));
  lookup('LAMBERT').fn(s);
  assert(isReal(s.peek()) && s.peek().value.eq(0),
    'session296: LAMBERT(Integer(0)) = 0');
}
{
  const s = new Stack();
  s.push(Integer(1n));
  lookup('LAMBERT').fn(s);
  // Ω constant via the integer arm.
  assert(isReal(s.peek()) && Math.abs(s.peek().value - 0.5671432904097838) < 1e-14,
    'session296: LAMBERT(Integer(1)) = Ω (omega constant)');
}
{
  const s = new Stack();
  s.push(Integer(3n));
  lookup('LAMBERT').fn(s);
  const w = s.peek().value;
  assert(isReal(s.peek()) && Math.abs(w * Math.exp(w) - 3) < 1e-12,
    'session296: LAMBERT(Integer(3)) inverse property W·e^W = 3');
}

// LAMBERT — inverse property W(x)·e^W(x) = x over a wide x range.
{
  for (const x of [5, 10, 100, -0.1, -0.3, 0.5, -0.35]) {
    const s = new Stack();
    s.push(Real(x));
    lookup('LAMBERT').fn(s);
    const w = s.peek().value;
    assert(Math.abs(w * Math.exp(w) - x) < 1e-12 * Math.max(1, Math.abs(x)),
      `session086: LAMBERT inverse property W·e^W = x for x=${x}`);
  }
}

// LAMBERT — rejections.
{
  const s = new Stack();
  s.push(Real(-1));
  assertThrows(() => lookup('LAMBERT').fn(s), /Bad argument value/,
    'session086: LAMBERT(-1) rejects (below -1/e, no real solution)');
}
{
  const s = new Stack();
  s.push(Str('foo'));
  assertThrows(() => lookup('LAMBERT').fn(s), /Bad argument type/,
    'session086: LAMBERT(String) rejects Bad argument type');
}
{
  // Symbolic lift.
  const s = new Stack();
  s.push(Name('X', { quoted: true }));
  lookup('LAMBERT').fn(s);
  const v = s.peek();
  assert(v.type === 'symbolic' && v.expr.kind === 'fn' && v.expr.name === 'LAMBERT',
    'session086: LAMBERT(Name X) lifts to Symbolic LAMBERT(X)');
}

// XNUM / XQ — ASCII aliases delegate to →NUM / →Q.
{
  assert(lookup('XNUM') !== undefined && lookup('XQ') !== undefined,
    'session086: XNUM and XQ are registered');
}
{
  // XQ 0.5 → Symbolic 1/2.  Mirrors the known →Q behaviour.
  const s = new Stack();
  s.push(Real(0.5));
  lookup('XQ').fn(s);
  const v = s.peek();
  assert(v.type === 'symbolic' && v.expr.kind === 'bin' && v.expr.op === '/'
      && v.expr.l.value === 1 && v.expr.r.value === 2,
    'session086: XQ 0.5 → Symbolic 1/2 (delegates to →Q)');
}
{
  // XNUM of a Symbolic evaluates numerically — same contract as →NUM.
  // Use a simple rational to keep this locked to the delegation check,
  // not to the specifics of →NUM's evaluator.
  const s = new Stack();
  s.push(Real(0.25));
  lookup('XQ').fn(s);              // Real(0.25) → Symbolic 1/4
  lookup('XNUM').fn(s);            // Symbolic 1/4 → Real 0.25
  const v = s.peek();
  assert(isReal(v) && Math.abs(v.value - 0.25) < 1e-15,
    'session086: XNUM evaluates Symbolic numerically (→NUM delegate)');
}

// XNUM / XQ — alias delegation must propagate the target's guards, not
// just the happy path (the COMMANDS.md ✓ criterion wants a rejection
// pin per op).  These lock the alias to →Q / →NUM so a future inline
// reimplementation that drops a guard is caught.
{
  // XQ inherits →Q's Integer-passthrough branch: Integer → Symbolic Num,
  // no /1 denominator (distinct from the Real → continued-fraction path).
  const s = new Stack();
  s.push(Integer(5n));
  lookup('XQ').fn(s);
  const v = s.peek();
  assert(v.type === 'symbolic' && v.expr.kind === 'num' && v.expr.value === 5,
    'session200: XQ Integer(5) → Symbolic Num(5) (→Q integer passthrough)');
}
{
  // XQ inherits →Q's type guard.
  const s = new Stack();
  s.push(Str('foo'));
  assertThrows(() => lookup('XQ').fn(s), /Bad argument type/,
    'session200: XQ String rejects Bad argument type (→Q type guard)');
}
{
  // XQ inherits →Q's finiteness guard.
  const s = new Stack();
  s.push(Real(Infinity));
  assertThrows(() => lookup('XQ').fn(s), /Bad argument value/,
    'session200: XQ non-finite Real rejects Bad argument value (→Q finiteness guard)');
}
{
  // XNUM delegates to →NUM → EVAL, so it has no scalar type guard; its
  // rejection path is the empty-stack underflow the pop raises.
  const s = new Stack();
  assertThrows(() => lookup('XNUM').fn(s), /Too few arguments/,
    'session200: XNUM on empty stack rejects Too few arguments (→NUM/EVAL pop)');
}

/* =====================================================================
 — Ei / Si / Ci — exponential / sine / cosine integrals

   HP50 AUR §2 (CAS-SPECIAL).  Native numeric evaluators:
     Ei   power series for 0 < x < 40; asymptotic for x ≥ 40;
          E1 series/CF for x < 0.
     Si   odd power series for |x| ≤ 4; complex-Lentz CF for |x| > 4.
     Ci   power series for 0 < x ≤ 4; complex-Lentz CF for x > 4.
          Ci(x < 0) rejected in HP50 real mode (Bad argument value).

   Reference values sourced from Abramowitz & Stegun Tables 5.1 / 5.3;
   all 30 cases verified at machine precision.
   ===================================================================== */

// ---- Ei — representative values spanning series, near-cutover, asymptotic.
{
  const s = new Stack();
  s.push(Real(1));
  lookup('Ei').fn(s);
  // Ei(1) = 1.8951178163559368…  (A&S Table 5.1)
  assert(isReal(s.peek()) && Math.abs(s.peek().value - 1.8951178163559368) < 1e-12,
    'session109: Ei(1) = 1.89511781635…');
}
{
  const s = new Stack();
  s.push(Real(5));
  lookup('Ei').fn(s);
  // Ei(5) = 40.18527535580318…  (series branch still)
  assert(Math.abs(s.peek().value - 40.18527535580318) < 1e-10,
    'session109: Ei(5) = 40.18527535…');
}
{
  const s = new Stack();
  s.push(Real(-1));
  lookup('Ei').fn(s);
  // Ei(-1) = -0.21938393439552029…  (E1 small-|x| series branch)
  assert(Math.abs(s.peek().value - (-0.21938393439552029)) < 1e-13,
    'session109: Ei(-1) = -0.219383934…');
}
{
  const s = new Stack();
  s.push(Real(-5));
  lookup('Ei').fn(s);
  // Ei(-5) = -0.00114829559127532…  (E1 Lentz CF branch)
  assert(Math.abs(s.peek().value - (-0.00114829559127532)) < 1e-14,
    'session109: Ei(-5) = -0.00114829559…');
}
{
  const s = new Stack();
  s.push(Real(40));
  lookup('Ei').fn(s);
  // Ei(40) ≈ 6.039718263611247e15 — right at the asymptotic cutover.
  assert(Math.abs(s.peek().value / 6.039718263611247e15 - 1) < 1e-12,
    'session109: Ei(40) ≈ 6.04e15 (asymptotic branch)');
}
// Ei — domain & type rejections.
{
  const s = new Stack();
  s.push(Real(0));
  assertThrows(() => lookup('Ei').fn(s), /Infinite result/,
    'session109: Ei(0) rejects with Infinite result');
}
{
  const s = new Stack();
  s.push(Str('foo'));
  assertThrows(() => lookup('Ei').fn(s), /Bad argument type/,
    'session109: Ei(String) rejects Bad argument type');
}
{
  // Symbolic lift — Ei(X) stays symbolic.
  const s = new Stack();
  s.push(Name('X', { quoted: true }));
  lookup('Ei').fn(s);
  const v = s.peek();
  assert(v.type === 'symbolic' && v.expr.kind === 'fn' && v.expr.name === 'EI',
    'session109: Ei(Name X) lifts to Symbolic EI(X)');
}
{
  // Tagged transparency.
  const s = new Stack();
  s.push(Tagged('E', Real(1)));
  lookup('Ei').fn(s);
  const v = s.peek();
  assert(v.type === 'tagged' && v.tag === 'E'
      && Math.abs(v.value.value - 1.8951178163559368) < 1e-12,
    'session109: Ei preserves tag wrapper');
}
{
  // RList distribution.
  const s = new Stack();
  s.push(RList([Real(1), Real(-1)]));
  lookup('Ei').fn(s);
  const items = s.peek().items;
  assert(items.length === 2
      && Math.abs(items[0].value - 1.8951178163559368) < 1e-12
      && Math.abs(items[1].value - (-0.21938393439552029)) < 1e-13,
    'session109: Ei distributes over RList');
}

// ---- Si — odd, entire; series + Lentz-CF branches.
{
  const s = new Stack();
  s.push(Real(0));
  lookup('Si').fn(s);
  assert(isReal(s.peek()) && s.peek().value.eq(0),
    'session109: Si(0) = 0 exactly');
}
{
  const s = new Stack();
  s.push(Real(1));
  lookup('Si').fn(s);
  // Si(1) = 0.9460830703671831…  (A&S Table 5.3)
  assert(Math.abs(s.peek().value - 0.9460830703671831) < 1e-13,
    'session109: Si(1) = 0.946083070…');
}
{
  const s = new Stack();
  s.push(Real(4));
  lookup('Si').fn(s);
  // Si(4) = 1.7582031389490532…  (series-branch boundary).
  assert(Math.abs(s.peek().value - 1.7582031389490532) < 1e-12,
    'session109: Si(4) = 1.758203138…');
}
{
  const s = new Stack();
  s.push(Real(10));
  lookup('Si').fn(s);
  // Si(10) = 1.6583475942188738…  (CF branch)
  assert(Math.abs(s.peek().value - 1.6583475942188738) < 1e-12,
    'session109: Si(10) = 1.658347594…');
}
{
  // Odd parity: Si(-x) = -Si(x).
  const s = new Stack();
  s.push(Real(-5));
  lookup('Si').fn(s);
  // Si(5) = 1.5499312449446743…
  assert(Math.abs(s.peek().value - (-1.5499312449446743)) < 1e-12,
    'session109: Si(-5) = -Si(5) (odd parity across CF branch)');
}
{
  const s = new Stack();
  s.push(Str('foo'));
  assertThrows(() => lookup('Si').fn(s), /Bad argument type/,
    'session109: Si(String) rejects Bad argument type');
}
{
  // Symbolic lift.
  const s = new Stack();
  s.push(Name('X', { quoted: true }));
  lookup('Si').fn(s);
  const v = s.peek();
  assert(v.type === 'symbolic' && v.expr.kind === 'fn' && v.expr.name === 'SI',
    'session109: Si(Name X) lifts to Symbolic SI(X)');
}
{
  // Tagged transparency.
  const s = new Stack();
  s.push(Tagged('T', Real(1)));
  lookup('Si').fn(s);
  const v = s.peek();
  assert(v.type === 'tagged' && v.tag === 'T'
      && Math.abs(v.value.value - 0.9460830703671831) < 1e-13,
    'session109: Si preserves tag wrapper');
}

// ---- Ci — x > 0 only; series + Lentz-CF branches.
{
  const s = new Stack();
  s.push(Real(1));
  lookup('Ci').fn(s);
  // Ci(1) = 0.3374039229009681…  (A&S Table 5.3)
  assert(isReal(s.peek()) && Math.abs(s.peek().value - 0.3374039229009681) < 1e-13,
    'session109: Ci(1) = 0.337403922…');
}
{
  const s = new Stack();
  s.push(Real(4));
  lookup('Ci').fn(s);
  // Ci(4) = -0.140981697886930…  (series-branch boundary).
  assert(Math.abs(s.peek().value - (-0.140981697886930)) < 1e-13,
    'session109: Ci(4) = -0.140981697886…');
}
{
  const s = new Stack();
  s.push(Real(10));
  lookup('Ci').fn(s);
  // Ci(10) = -0.045456433004455381…  (CF branch)
  assert(Math.abs(s.peek().value - (-0.045456433004455381)) < 1e-13,
    'session109: Ci(10) = -0.045456433…');
}
// Ci — domain & type rejections.
{
  const s = new Stack();
  s.push(Real(0));
  assertThrows(() => lookup('Ci').fn(s), /Infinite result/,
    'session109: Ci(0) rejects with Infinite result');
}
{
  const s = new Stack();
  s.push(Real(-1));
  assertThrows(() => lookup('Ci').fn(s), /Bad argument value/,
    'session109: Ci(-1) rejects (HP50 real-mode — complex result)');
}
{
  const s = new Stack();
  s.push(Str('foo'));
  assertThrows(() => lookup('Ci').fn(s), /Bad argument type/,
    'session109: Ci(String) rejects Bad argument type');
}
{
  // Symbolic lift.
  const s = new Stack();
  s.push(Name('X', { quoted: true }));
  lookup('Ci').fn(s);
  const v = s.peek();
  assert(v.type === 'symbolic' && v.expr.kind === 'fn' && v.expr.name === 'CI',
    'session109: Ci(Name X) lifts to Symbolic CI(X)');
}
{
  // RList distribution (series branch × CF branch).
  const s = new Stack();
  s.push(RList([Real(1), Real(10)]));
  lookup('Ci').fn(s);
  const items = s.peek().items;
  assert(items.length === 2
      && Math.abs(items[0].value - 0.3374039229009681) < 1e-13
      && Math.abs(items[1].value - (-0.045456433004455381)) < 1e-13,
    'session109: Ci distributes over RList');
}

/* session382: Ei / Si / Ci Z column — the integral-function `isInteger(v) ?
   Number(v.value)` coercion arm (`_eiScalar`/`_siScalar`/`_ciScalar`,
   ops.js ~14561/14569/14577). Every session109 positive pin pushes Real, so
   the Integer arm — distinct from the `isReal(v) ? v.value.toNumber()` arm —
   was never positively exercised; only the String reject touched a non-Real
   type. Same audit class as erf/erfc (session280), MANT (session285), and
   LAMBERT (session296). Probed live first: Integer operands match the Real
   result bit-for-bit and return Real. Guards a refactor degrading the Z
   column there to Real-only. */
{
  const s = new Stack();
  s.push(Integer(1n));
  lookup('Ei').fn(s);
  assert(isReal(s.peek()) && Math.abs(s.peek().value - 1.8951178163559368) < 1e-12,
    'session382: Ei(Integer 1) = 1.89511781635… via the integer arm');
}
{
  const s = new Stack();
  s.push(Integer(5n));
  lookup('Ei').fn(s);
  assert(isReal(s.peek()) && Math.abs(s.peek().value - 40.18527535580318) < 1e-10,
    'session382: Ei(Integer 5) = 40.18527535… (Z arm == R arm)');
}
{
  const s = new Stack();
  s.push(Integer(-1n));
  lookup('Ei').fn(s);
  assert(isReal(s.peek()) && Math.abs(s.peek().value - (-0.21938393439552029)) < 1e-12,
    'session382: Ei(Integer -1) = -0.219383934… (negative integer through E1 branch)');
}
{
  const s = new Stack();
  s.push(Integer(1n));
  lookup('Si').fn(s);
  assert(isReal(s.peek()) && Math.abs(s.peek().value - 0.9460830703671831) < 1e-12,
    'session382: Si(Integer 1) = 0.946083070… via the integer arm');
}
{
  const s = new Stack();
  s.push(Integer(-5n));
  lookup('Si').fn(s);
  assert(isReal(s.peek()) && Math.abs(s.peek().value - (-1.5499312449446743)) < 1e-12,
    'session382: Si(Integer -5) = -Si(5) (odd parity, integer arm across CF branch)');
}
{
  const s = new Stack();
  s.push(Integer(1n));
  lookup('Ci').fn(s);
  assert(isReal(s.peek()) && Math.abs(s.peek().value - 0.3374039229009681) < 1e-12,
    'session382: Ci(Integer 1) = 0.337403922… via the integer arm');
}
{
  const s = new Stack();
  s.push(Integer(4n));
  lookup('Ci').fn(s);
  assert(isReal(s.peek()) && Math.abs(s.peek().value - (-0.140981697886930)) < 1e-12,
    'session382: Ci(Integer 4) = -0.140981697886… (Z arm == R arm, series boundary)');
}
