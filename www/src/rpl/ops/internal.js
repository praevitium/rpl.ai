import Decimal from '../../../vendor/decimal.js/decimal.mjs';
import { isReal, isInteger, isComplex, Real, isSymbolic, isName, isRational, Name, Symbolic, Integer, Unit, isUnit, isBinaryInteger, isNumber, promoteNumericPair, Complex, Rational, isList, RList, isTagged, Tagged, isVector, Vector, isMatrix, Matrix, BinaryInteger, toRealOrThrow, isString, isValidHpIdentifier, isStorableHpName, isProgram, isDirectory, Str } from '../types.js';
import { RPLError, setPushCoerce } from '../stack.js';
import { Var as AstVar, Num as AstNum, Bin as AstBin, Fn as AstFn, evalAst as algebraEvalAst, defaultFnEval as algebraDefaultFnEval, Neg as AstNeg, freeVars as algebraFreeVars } from '../algebra.js';
import { sameDims, scaleOf, multiplyUexpr, divideUexpr, inverseUexpr, powerUexpr } from '../units.js';
import { getApproxMode, getWordsizeMask, setPromptMessage, varRecall, getLastError, setLastError, restoreLastError, varPurge, varStore, getRealMaxExp, enterDirectory, toRadians, fromRadians, getHalted, clearPromptMessage, takeHalted, setHalted } from '../state.js';
import { Fraction } from '../../../vendor/fraction.js/fraction.mjs';
import Complex$ from '../../../vendor/complex.js/complex.mjs';
import { format as formatValue, DEFAULT_DISPLAY } from '../formatter.js';
import { parseEntry as _parseEntryForObjTo } from '../parser.js';
import { astToGiac } from '../cas/giac-convert.mjs';
import { register, lookup, OPS } from './registry.js';



/* -------------------------------------------------------------
   Decimal.js — precision and rounding configured once at module load.
   MAX_EXP / MIN_EXP are set by state.js (it imports Decimal from
   types.js and calls Decimal.set there at boot) and kept in sync by
   setRealMaxExp().  This call only sets precision + rounding so it
   cannot reset the exponent limits state.js already established.

   Rounding mode 4 = ROUND_HALF_UP (HP50 rounds .5 away from zero).
   No-fallback rule: if Decimal throws, we let it through.
   ------------------------------------------------------------- */
Decimal.set({ precision: 15, rounding: Decimal.ROUND_HALF_UP });


/* ------------------------------------------------------------------
   Truthiness for conditionals.

   HP50 booleans are Reals: 0. is false, anything else is true.  We
   accept Integer and Complex as well (non-zero / non-origin is true).
   Any other type passed as a test is a user bug — throw.
   ------------------------------------------------------------------ */
export function isTruthy(v) {
  if (isReal(v))    return !v.value.isZero();
  if (isInteger(v)) return v.value !== 0n;
  if (isComplex(v)) return v.re !== 0 || v.im !== 0;
  throw new RPLError('Bad argument type');
}


/** HP50 boolean literal: TRUE is Real(1), FALSE is Real(0). */
export const TRUE  = Real(1);

export const FALSE = Real(0);


/* ------------------------------------------------------------------
   Arithmetic — real + complex + integer promotion

   Every binary / unary numeric op lifts into the symbolic domain when
   a Symbolic or Name operand is present, producing a Symbolic result
   whose AST is assembled from the operator plus coerced operands.
   HP50 behavior: any op on at least one symbolic/name operand returns
   the symbolic form, e.g. `'X' 'Y' +` → `'X+Y'` and `'X' SIN` →
   `'SIN(X)'`.  Constants on the other side coerce to Num:
   `5 'X' +` → `'5+X'`.  This is what makes the keypad usable for
   algebra entry at all — without it every operator key would throw
   "Bad argument type" the instant a Name landed on the stack.
   ------------------------------------------------------------------ */

/** Return true if `v` is a value that forces the symbolic code path.
 *  Names (quoted or bare — a bare name only reaches an op when
 *  recalled without evaluation) and Symbolics count.  Numbers do NOT
 *  — they'd rather take the fast Real/Integer/Complex path, and are
 *  coerced to AST only when they land on the OTHER side of a symbolic
 *  operand. */
export function _isSymOperand(v) {
  return isSymbolic(v) || isName(v);
}


/** Coerce an RPL value to an algebra-AST node.  Used to build the
 *  symbolic result when at least one operand forces the symbolic path
 *  (see _isSymOperand).  Complex is rejected — the algebra AST has
 *  no Complex kind yet, so `'X' (2,3) +` would need extension of the
 *  AST before it can work.  Returns null on unsupported types and the
 *  caller translates to "Bad argument type". */
export function _toAst(v) {
  if (isSymbolic(v))   return v.expr;
  if (isName(v))       return AstVar(v.id);
  if (isInteger(v))    return AstNum(Number(v.value));
  if (isReal(v))       return AstNum(v.value.toNumber());
  // Rational lifts to Bin('/', Num(n), Num(d)) so the ratio survives
  // into the symbolic expression exactly (rather than being coerced
  // to a float leaf via Number(n)/Number(d)).  The algebra AST has
  // no num-ratio leaf today; the Bin form prints as `n/d`, routes
  // through the normal simplifier, and preserves exactness for
  // downstream ops like FACTOR/EXPAND/INTEG via Giac.  BigInts above
  // 2^53 lose precision through Number() — acceptable for classroom
  // inputs; a dedicated 'ratio' AST kind is future work.
  if (isRational(v)) {
    return AstBin('/', AstNum(Number(v.n)), AstNum(Number(v.d)));
  }
  return null;
}


/** Convert an AST subtree to a pushable RPL value.  Leaves unwrap
 *  (Num → Real, Var → quoted Name); everything else is rewrapped as
 *  a Symbolic so the call site can push it onto the stack like any
 *  other value. */
export function _astToRplValue(ast) {
  if (!ast) return Name('', { quoted: true });
  if (ast.kind === 'num') return Real(ast.value);
  if (ast.kind === 'var') return Name(ast.name, { quoted: true });
  // `Neg(Num(v))` is the AST shape parseAlgebra emits for any negative
  // numeric literal — Giac's `caseval` returns negative integers and
  // negative decimals as `"-1"`, `"-3.14"`, etc., which round-trip
  // through `giacToAst` as a Neg-wrapped Num.  Unwrap so EGVL / EGV /
  // GREDUCE / FACTOR present a negative numeric eigenvalue or
  // remainder as a plain Real(-v) instead of a Symbolic with a
  // single-leaf negation node.  (Surfaced by GREDUCE's AUR worked
  // example which returns `-1`.)
  if (ast.kind === 'neg' && ast.arg && ast.arg.kind === 'num') {
    return Real(-ast.arg.value);
  }
  return Symbolic(ast);
}


/** Decompose a Symbolic value one level: return the sequence of
 *  values OBJ→ should push, with a trailing Integer count.
 *
 *  Layout (matches the OBJ→-on-Program shape: args then count):
 *    Num(v)          → [Real(v), 1]
 *    Var(n)          → [Name(n, quoted), 1]
 *    Neg(a)          → [<a>, Name('NEG', quoted), 2]
 *    Bin(op, l, r)   → [<l>, <r>, Name(op, quoted), 3]
 *    Fn(name, args)  → [<a1> … <aN>, Name(name, quoted), N+1]
 *
 *  Where `<x>` = `_astToRplValue(x)` — Num/Var leaves unwrap to
 *  Real/Name; non-leaf subtrees stay Symbolic so callers can recurse
 *  with OBJ→ again.  The leading count tells generic rebuild loops
 *  (→PRG-style) how many items to gather. */
export function _symbolicDecompose(v) {
  const ast = v.expr;
  if (!ast) return [Integer(0n)];
  if (ast.kind === 'num') {
    return [Real(ast.value), Integer(1n)];
  }
  if (ast.kind === 'var') {
    return [Name(ast.name, { quoted: true }), Integer(1n)];
  }
  if (ast.kind === 'neg') {
    return [_astToRplValue(ast.arg), Name('NEG', { quoted: true }), Integer(2n)];
  }
  if (ast.kind === 'bin') {
    return [
      _astToRplValue(ast.l),
      _astToRplValue(ast.r),
      Name(ast.op, { quoted: true }),
      Integer(3n),
    ];
  }
  if (ast.kind === 'fn') {
    const out = ast.args.map(_astToRplValue);
    out.push(Name(ast.name, { quoted: true }));
    out.push(Integer(BigInt(ast.args.length + 1)));
    return out;
  }
  // Unknown AST node — preserve the original Symbolic and emit a
  // count of 1 so callers don't lose the value.
  return [v, Integer(1n)];
}


/** Scalar ∘ Scalar: returns the result value directly.  Extracted
 *  from binaryMath so Vector/Matrix branches can apply the op
 *  element-wise without going through a temp stack. */
/** Coerce a numeric (Real or Integer) to a plain JS number.
 *  Throws if `v` isn't a plain numeric — the unit paths never mix Complex
 *  operands (HP50 doesn't allow complex-valued units either). */
export function _numVal(v) {
  if (isReal(v))    return v.value.toNumber();
  if (isInteger(v)) return Number(v.value);
  throw new RPLError('Bad argument type');
}


/** Wrap a Unit result: if the accumulated uexpr is empty (dimensionless),
 *  unwrap to a plain Real — matches how `_m / _m` simplifies to a number. */
export function _makeUnit(value, uexpr) {
  return uexpr.length === 0 ? Real(value) : Unit(value, uexpr);
}


/** Binary arithmetic when at least one side is a Unit.
 *  +/-: dims must match; result inherits the left operand's uexpr
 *       (its scale too, so `1_km + 500_m` stays in km).
 *  *, /: combine uexprs; a plain number broadcasts as dimensionless.
 *  ^:   exponent must be a plain integer; scales each factor's exponent. */
function _unitBinary(op, a, b) {
  if (op === '+' || op === '-') {
    if (!isUnit(a) || !isUnit(b)) throw new RPLError('Bad argument type');
    if (!sameDims(a.uexpr, b.uexpr)) throw new RPLError('Inconsistent units');
    const inA = b.value * scaleOf(b.uexpr) / scaleOf(a.uexpr);
    const val = op === '+' ? a.value + inA : a.value - inA;
    return _makeUnit(val, a.uexpr);
  }
  if (op === '*') {
    if (isUnit(a) && isUnit(b)) return _makeUnit(a.value * b.value, multiplyUexpr(a.uexpr, b.uexpr));
    if (isUnit(a)) return _makeUnit(a.value * _numVal(b), a.uexpr);
    return _makeUnit(_numVal(a) * b.value, b.uexpr);
  }
  if (op === '/') {
    if (isUnit(a) && isUnit(b)) {
      if (b.value === 0) throw new RPLError('Infinite result');
      return _makeUnit(a.value / b.value, divideUexpr(a.uexpr, b.uexpr));
    }
    if (isUnit(a)) {
      const bv = _numVal(b);
      if (bv === 0) throw new RPLError('Infinite result');
      return _makeUnit(a.value / bv, a.uexpr);
    }
    if (b.value === 0) throw new RPLError('Infinite result');
    return _makeUnit(_numVal(a) / b.value, inverseUexpr(b.uexpr));
  }
  if (op === '^') {
    if (!isUnit(a)) throw new RPLError('Bad argument type');
    // Exponent must be an integer — fractional powers would introduce
    // non-integer exponents in the uexpr, which the catalog-backed
    // dimensional algebra doesn't model.
    const n = isInteger(b) ? Number(b.value)
            : isReal(b)    ? b.value.toNumber()
            : NaN;
    if (!Number.isFinite(n) || !Number.isInteger(n)) {
      throw new RPLError('Bad argument value');
    }
    return _makeUnit(Math.pow(a.value, n), powerUexpr(a.uexpr, n));
  }
  throw new RPLError('Bad argument type');
}


export function _scalarBinary(op, a, b) {
  if (isBinaryInteger(a) && isBinaryInteger(b)) return binIntBinary(op, a, b);
  if (isBinaryInteger(a) || isBinaryInteger(b)) {
    throw new RPLError('Bad argument type');
  }
  if (isUnit(a) || isUnit(b)) return _unitBinary(op, a, b);
  if (_isSymOperand(a) || _isSymOperand(b)) {
    const l = _toAst(a);
    const r = _toAst(b);
    if (l && r) return Symbolic(AstBin(op, l, r));
    throw new RPLError('Bad argument type');
  }
  if (!isNumber(a) || !isNumber(b)) throw new RPLError('Bad argument type');
  const p = promoteNumericPair(a, b);
  if (p.kind === 'complex') {
    const r = complexBinary(op, p.a, p.b);
    return Complex(r.re, r.im);
  }
  if (p.kind === 'integer') {
    // Integer / Integer that doesn't divide evenly promotes to Rational
    // in EXACT mode, or to Real in APPROX.  Integer division that IS
    // exact stays Integer.  All other ops stay on the BigInt path.
    if (op === '/' && p.b !== 0n && p.a % p.b !== 0n) {
      if (getApproxMode()) {
        // Big integer → Decimal via string so precision isn't capped by
        // IEEE-754's 53-bit mantissa.  Division then rounds at 15 digits.
        const da = new Decimal(p.a.toString());
        const db = new Decimal(p.b.toString());
        return Real(da.div(db));
      }
      return Rational(p.a, p.b);
    }
    const r = integerBinary(op, p.a, p.b);
    return (typeof r === 'bigint') ? Integer(r) : Real(r);
  }
  if (p.kind === 'rational') {
    // In APPROX mode, collapse both operands to Real before arithmetic —
    // the flag says "give me decimals", and a Rational result would
    // contradict that.  In EXACT mode, arithmetic stays exact.
    if (getApproxMode()) {
      // Route through Decimal rather than Number() to keep 15-digit
      // precision across the rational → decimal collapse.  A
      // "big-numerator / big-denominator" Rational that can't round-
      // trip through IEEE-754 (e.g. a factorial ratio) still lands
      // cleanly in Decimal space.
      const ra = new Decimal(p.a.n.toString()).div(new Decimal(p.a.d.toString()));
      const rb = new Decimal(p.b.n.toString()).div(new Decimal(p.b.d.toString()));
      return Real(realBinary(op, ra, rb));
    }
    return _rationalBinary(op, p.a, p.b);
  }
  return Real(realBinary(op, p.a, p.b));
}


/* -------------------------------------------------------------
   Rational arithmetic via Fraction.js.

   Inputs `a` and `b` are { n: BigInt, d: BigInt } pairs produced by
   `toRationalPair` (Integers widen to { n, d:1n } before we get here).
   We hand them straight to Fraction.js and let it do the heavy lifting
   — GCD reduction, sign canonicalisation, arbitrary-precision
   arithmetic.  No fallback path: a Fraction.js runtime error
   (division by zero, bad input) propagates untouched.

   Result shaping:
     • a/b with b.d === 1n → emit Integer when the answer is integral,
       Rational otherwise.  Matches HP50 stack aesthetics: `4 2 /` →
       Integer(2), `1 3 /` → Rational(1/3).
     • `^` with non-integer exponent drops to Real (Fraction.js pow
       rejects irrational exponents, so we convert eagerly).
   ------------------------------------------------------------- */
function _rationalBinary(op, a, b) {
  const fa = new Fraction(a.n, a.d);
  const fb = new Fraction(b.n, b.d);
  let r;
  switch (op) {
    case '+': r = fa.add(fb); break;
    case '-': r = fa.sub(fb); break;
    case '*': r = fa.mul(fb); break;
    case '/': r = fa.div(fb); break;
    case '^': {
      // Fraction.pow only supports rational exponents whose denominator
      // is 1 (integer exponent) or whose result is representable as a
      // fraction.  For non-integer exponents: in APPROX mode we drop
      // to Real; in EXACT mode we lift to a Symbolic(base ^ exp) so the
      // irrational stays exact — `2 ^ (1/3)` leaves `2^(1/3)` on the
      // stack rather than 1.2599….  Integer exponents always stay exact.
      if (fb.d === 1n) { r = fa.pow(fb); break; }
      if (!getApproxMode()) {
        const signedBaseN = fa.s * fa.n;
        const signedExpN = fb.s * fb.n;
        const baseAst = a.d === 1n
          ? AstNum(Number(signedBaseN))
          : AstBin('/', AstNum(Number(signedBaseN)), AstNum(Number(fa.d)));
        const expAst = AstBin('/', AstNum(Number(signedExpN)), AstNum(Number(fb.d)));
        return Symbolic(AstBin('^', baseAst, expAst));
      }
      return Real(Math.pow(Number(fa.s * fa.n) / Number(fa.d),
                           Number(fb.s * fb.n) / Number(fb.d)));
    }
    default: throw new RPLError('Bad argument type');
  }
  const signedN = r.s * r.n;
  if (r.d === 1n) return Integer(signedN);
  return Rational(signedN, r.d);
}


/** Types that broadcast as a scalar across a Vector/Matrix. */
export function _isScalarOperand(v) {
  return isNumber(v) || isBinaryInteger(v) || _isSymOperand(v);
}


/* ---- List distribution (HP50 AUR §12.3) ----
   Most scalar-domain commands distribute element-wise when given a
   List.  Rules:
     Unary:          {1 4 9} SQRT            → {1 2 3}
     List ∘ scalar:  {1 2 3} 2 *             → {2 4 6}
     Scalar ∘ list:  2 {1 2 3} *             → {2 4 6}
     List ∘ list:    {1 2 3} {10 20 30} *    → {10 40 90}  (same len)
     Nested:         {1 {2 3}} SIN           → {SIN(1) {SIN(2) SIN(3)}}

   `+` is the canonical exception: HP50 AUR §3-7 specifies *concatenation*
   semantics for list addition — `{1 2 3} 4 +` → `{1 2 3 4}`, `{1 2}
   {3 4} +` → `{1 2 3 4}` — and the bare `+` registration short-circuits
   list operands to that path before the generic `binaryMath` distributor
   ever runs.  Element-wise list addition is reserved for ADD / DOLIST.

   Wrapping a handler with `_withListUnary` / `_withListBinary` is the
   one integration point — at the leaves, the original handler sees a
   non-list operand and does its full scalar/vector/matrix dispatch.
   List-aware commands that treat the list as a whole (SIZE, HEAD,
   STO, PURGE, aggregate reducers) are wired directly and NOT wrapped.
   -------------------------------------------------------------------- */
export function _withListUnary(handler) {
  const apply = (s, item) => {
    if (isList(item)) return RList(item.items.map(e => apply(s, e)));
    s.push(item);
    handler(s);
    return s.pop();
  };
  return (s) => {
    if (s.depth >= 1 && isList(s.peek())) {
      const v = s.pop();
      s.push(apply(s, v));
      return;
    }
    // Equation dispatch: apply the op to both sides independently.
    //   f('X=Y') → 'f(X)=f(Y)'
    if (s.depth >= 1) {
      const top = s.peek();
      if (isSymbolic(top) && top.expr.kind === 'bin' && top.expr.op === '=') {
        s.pop();
        s.push(Symbolic(top.expr.l));
        handler(s);
        const lResult = s.pop();
        s.push(Symbolic(top.expr.r));
        handler(s);
        const rResult = s.pop();
        const lAst = _toAst(lResult);
        const rAst = _toAst(rResult);
        if (!lAst || !rAst) throw new RPLError('Bad argument type');
        s.push(Symbolic(AstBin('=', lAst, rAst)));
        return;
      }
    }
    handler(s);
  };
}


export function _withListBinary(handler) {
  const apply = (s, a, b) => {
    if (isList(a) && isList(b)) {
      if (a.items.length !== b.items.length) throw new RPLError('Invalid dimension');
      return RList(a.items.map((x, i) => apply(s, x, b.items[i])));
    }
    if (isList(a)) return RList(a.items.map(x => apply(s, x, b)));
    if (isList(b)) return RList(b.items.map(x => apply(s, a, x)));
    s.push(a); s.push(b);
    handler(s);
    return s.pop();
  };
  return (s) => {
    if (s.depth >= 2 && (isList(s.peek(1)) || isList(s.peek(2)))) {
      const [a, b] = s.popN(2);
      s.push(apply(s, a, b));
      return;
    }
    handler(s);
  };
}


/* ---- Tagged transparency (HP50 AUR §3.4) ----
   A Tagged object (e.g. `Price:42.50`) is a label + value pair.  For
   numeric / symbolic operations HP50 unwraps the tag, applies the op
   to the underlying value, and in the unary case re-tags the result
   with the same label.  For binary ops the tag is dropped — when both
   sides carry tags there isn't a single obvious label to keep.

   Wrapping a handler with `_withTaggedUnary` / `_withTaggedBinary` is
   the one integration point — the inner handler sees a plain value on
   the stack and does its normal scalar/vector/matrix dispatch. */
export function _withTaggedUnary(handler) {
  return (s) => {
    if (s.depth >= 1 && isTagged(s.peek())) {
      const t = s.pop();
      s.push(t.value);
      handler(s);
      const r = s.pop();
      s.push(Tagged(t.tag, r));
      return;
    }
    handler(s);
  };
}


export function _withTaggedBinary(handler) {
  return (s) => {
    if (s.depth >= 2 && (isTagged(s.peek(1)) || isTagged(s.peek(2)))) {
      const [a, b] = s.popN(2);
      s.push(isTagged(a) ? a.value : a);
      s.push(isTagged(b) ? b.value : b);
      handler(s);
      return;  // binary drops the tag
    }
    handler(s);
  };
}


/* ---- Vector / Matrix element-wise unary dispatch ----
   For unary numeric ops whose Vector/Matrix semantics are simply
   "apply f to every element", wrapping with `_withVMUnary` adds that
   coverage with no per-op duplication.  At a leaf scalar the inner
   handler runs unchanged (it does its own R/Z/C/Sy dispatch).

   Ops with bespoke V/M semantics (ABS = Frobenius, SIGN/V = unit
   direction, INV/M = matrix inverse, SQ/M = M·M, …) bypass this
   wrapper and keep their hand-written branch — the wrapper only
   activates when the top is a Vector or Matrix value.

   Implementation note: we re-use the temp-stack pattern from
   `_withListUnary`, so the inner handler can throw and the wrapper
   propagates the error untouched (matches list / tagged behavior).
   */
export function _withVMUnary(handler) {
  const apply = (s, item) => {
    s.push(item);
    handler(s);
    return s.pop();
  };
  return (s) => {
    if (s.depth >= 1) {
      const top = s.peek();
      if (isVector(top)) {
        const v = s.pop();
        s.push(Vector(v.items.map(x => apply(s, x))));
        return;
      }
      if (isMatrix(top)) {
        const m = s.pop();
        s.push(Matrix(m.rows.map(row => row.map(x => apply(s, x)))));
        return;
      }
    }
    handler(s);
  };
}


/** Sum scalars with `+`.  Empty → Real(0). */
export function _scalarSum(parts) {
  if (parts.length === 0) return Real(0);
  let acc = parts[0];
  for (let i = 1; i < parts.length; i++) acc = _scalarBinary('+', acc, parts[i]);
  return acc;
}


/* ------------------------------------------------------------------
   Binary integer arithmetic.

   HP50 rules:
     * Both operands must be BinaryIntegers (no implicit coercion from
       Real/Integer) — mixed arguments give "Bad argument type".
     * The LEFT operand's base wins.  `#FFh #1d +` → `#100h`, not `#256d`.
     * Every result is masked to the current wordsize (STWS).  With
       ws=16, `#FFFFh #1h +` → `#0h` (wrap), and `#10000h` can't even
       exist as a literal — it truncates.
     * Division is BigInt truncated division.  `#7h #2h /` → `#3h`.
     * Division by zero throws 'Division by zero' — the integer-family
       error (HP50 0x303), distinct from 'Infinite result' (0x305) that
       fires for Real /0 (where IEEE-754 would yield ±Infinity).
       BinInts follow the integer/BinInt error family; Reals follow
       the floating-point family.
     * Pow (^) is wordsize-masked modular exponentiation.

   Also used by the AND/OR/XOR bitwise path; those have their own
   register-site below but share this module's helpers.
   ------------------------------------------------------------------ */

/** Mask a BigInt to the current wordsize's low bits. */
export function _mask() { return getWordsizeMask(); }


export function binIntBinary(op, a, b) {
  const m = _mask();
  const av = a.value & m;
  const bv = b.value & m;
  let r;
  switch (op) {
    case '+': r = av + bv; break;
    case '-': r = av - bv; break;
    case '*': r = av * bv; break;
    case '/':
      if (bv === 0n) throw new RPLError('Division by zero');
      r = av / bv;
      break;
    case '^':
      // Modular exponentiation, ws-wide.  Negative exponents aren't a
      // thing for BinInts (unsigned) — treat as 0 to match HP50.
      r = _modPow(av, bv, m + 1n);
      break;
    default:
      throw new RPLError('Unknown op ' + op);
  }
  return BinaryInteger(r & m, a.base);
}


/** x^e mod n via square-and-multiply (BigInt).  n must be > 0.  Used
 *  only by binIntBinary('^') — keeps exponentiation O(log e) bits and
 *  never builds an intermediate 2^64-bit number. */
function _modPow(x, e, n) {
  if (n === 1n) return 0n;
  let result = 1n;
  let base = x % n;
  let exp = e;
  while (exp > 0n) {
    if (exp & 1n) result = (result * base) % n;
    exp >>= 1n;
    base = (base * base) % n;
  }
  return result;
}


/* -------------------------------------------------------------
   Real × Real arithmetic via decimal.js.

   The Real stack payload is a Decimal instance (see types.js).
   `realBinary` takes the two Decimal payloads straight from
   `promoteNumericPair` and returns a Decimal; the caller wraps it
   with `Real(...)` which stores the Decimal directly.

   Why keep it in Decimal end-to-end?  A chain like `1 3 / 3 *` rounds
   to 12 digits on the HP50 (`0.999999999999`) — storing the Decimal
   lets us reproduce that exactly.  Round-tripping through `.toNumber()`
   at every op injects the IEEE-754 representation of the intermediate
   (`0.333333333333333148…`), which then compounds across further ops.

   Division-by-zero stays explicit: throw 'Infinite result'.  Decimal
   would otherwise return `Infinity`; the explicit throw gives callers
   and tests a stable error message instead of a sentinel value.

   No fallback: any other Decimal error propagates untouched.
   ------------------------------------------------------------- */
function realBinary(op, a, b) {
  if (op === '/' && b.isZero()) throw new RPLError('Infinite result');
  switch (op) {
    case '+': return a.plus(b);
    case '-': return a.minus(b);
    case '*': return a.times(b);
    case '/': return a.div(b);
    case '^': return Decimal.pow(a, b);
  }
  throw new RPLError('Unknown op ' + op);
}


function integerBinary(op, a, b) {
  switch (op) {
    case '+': return a + b;
    case '-': return a - b;
    case '*': return a * b;
    case '/':
      if (b === 0n) throw new RPLError('Infinite result');
      // If it divides evenly, keep Integer; else return a float.
      if (a % b === 0n) return a / b;
      return Number(a) / Number(b);
    case '^':
      if (b < 0n) return Math.pow(Number(a), Number(b));
      return a ** b;
  }
  throw new RPLError('Unknown op ' + op);
}


/* -------------------------------------------------------------
   Complex × Complex arithmetic via complex.js.

   Inputs `a` and `b` are plain `{ re, im }` pairs (our internal
   shape matches complex.js's expected input exactly — `new Complex$(a)`
   parses the object directly).  We marshal into Complex$ instances,
   dispatch the op, then extract `.re` / `.im` back out.

   What complex.js buys over the hand-rolled version:
     • `i * i === -1` stays exactly -1 (identity preserved through
       the library's multiplication kernel rather than surviving as
       a floating-point accident).
     • `^` uses complex.js's polar-form pow, which handles both
       integer and fractional exponents correctly and applies the
       principal branch at negative reals.
     • Division-by-zero is caught explicitly so we keep our
       existing 'Infinite result' RPLError instead of complex.js's
       returned `Infinity + Infinity·i`.

   No fallback: a complex.js error propagates.  Per the
   no-fallback-for-numeric-libs rule.
   ------------------------------------------------------------- */
function complexBinary(op, a, b) {
  // Division-by-zero guard stays explicit: complex.js would return
  // Complex.INFINITY, but we raise an RPLError to match the numeric
  // binary path's `'Infinite result'` message.
  if (op === '/' && b.re === 0 && b.im === 0) {
    throw new RPLError('Infinite result');
  }
  const ca = new Complex$(a);
  const cb = new Complex$(b);
  let r;
  switch (op) {
    case '+': r = ca.add(cb); break;
    case '-': r = ca.sub(cb); break;
    case '*': r = ca.mul(cb); break;
    case '/': r = ca.div(cb); break;
    case '^': r = ca.pow(cb); break;
    default: throw new RPLError('Unknown op ' + op);
  }
  return { re: r.re, im: r.im };
}


/** Frobenius norm of a flat iterable of RPL numeric values (Real or Integer)
 *  using Decimal arithmetic throughout so large-exponent vectors work. */
export function _decimalFrobeniusNorm(items) {
  let sum = new Decimal(0);
  for (const x of items) {
    const d = isReal(x) ? x.value : new Decimal(x.value.toString());
    sum = sum.plus(d.times(d));
  }
  return sum.sqrt();
}


/* -------------------- unary real helpers --------------------
   `unaryReal(name, fn)` builds an op that evaluates fn(x) on a
   Real/Integer operand.  With a Symbolic/Name operand it emits
   `Symbolic(Fn(NAME, [ast]))` instead — this is what keeps LN/EXP/
   LOG/ALOG/SINH/… usable inside symbolic workflows.  The first
   argument is the canonical op NAME used in the AST (and thus shown
   on the LCD); old call sites that passed a bare fn still work —
   they get UPPER-cased `fn.name` or a fallback of 'FN'.
   ---------------------------------------------------------------- */
/* EXACT-mode lift for unary transcendentals.
   `LN(2)` / `SIN(30)` / `EXP(1)` with an Integer or Rational input in
   EXACT mode stays symbolic — the HP50 rule is "don't throw away
   exactness for a 15-digit decimal."  If the naive numeric evaluation
   happens to collapse to an integer (e.g. `LN(1)=0`, `SIN(0)=0`,
   `EXP(0)=1`), we DO fold so those common-case results don't stay
   wrapped as `LN(1)`.  The round-to-integer tolerance (1e-12) mirrors
   _approxGate in the Symbolic EVAL path so the two entry points agree.
   Returns a pushable RPL value. */
export function _exactUnaryLift(fnName, yScalar, v) {
  if (Number.isFinite(yScalar)) {
    const rounded = Math.round(yScalar);
    if (Math.abs(yScalar - rounded) < 1e-12) {
      return Integer(BigInt(rounded));
    }
  }
  return Symbolic(AstFn(fnName, [_toAst(v)]));
}


export function unaryReal(name, fn) {
  if (typeof name === 'function') { fn = name; name = null; }
  const fnName = (name || (fn && fn.name) || 'FN').toUpperCase();
  return _withListUnary((s) => {
    const v = s.pop();
    if (_isSymOperand(v)) {
      s.push(Symbolic(AstFn(fnName, [_toAst(v)])));
      return;
    }
    if (!getApproxMode() && (isInteger(v) || isRational(v))) {
      const x = isRational(v) ? Number(v.n) / Number(v.d) : Number(v.value);
      s.push(_exactUnaryLift(fnName, fn(x), v));
      return;
    }
    s.push(Real(fn(toRealOrThrow(v))));
  });
}


/* ------------------- factorial ------------------------
   `n FACT` → n!.  Non-negative Integer input stays exact (BigInt).
   Non-negative Real input uses a Lanczos gamma approximation and
   returns `Γ(n+1)` as a Real — HP50 FACT accepts non-integer real
   arguments and returns the gamma-based factorial.
   Negative integers and negative integer-valued Reals throw since
   Γ has poles at the non-positive integers.
   -------------------------------------------------------------------- */
export function _bigFactorial(n) {
  if (n < 0n) throw new RPLError('Bad argument value');
  let acc = 1n;
  for (let i = 2n; i <= n; i++) acc *= i;
  return acc;
}

/* Lanczos g=7, n=9 coefficients — standard public-domain set.
   Good to ~15 significant digits, which matches our Real precision. */
const _LANCZOS_G = 7;

const _LANCZOS_P = [
  0.99999999999980993,
  676.5203681218851,
  -1259.1392167224028,
  771.32342877765313,
  -176.61502916214059,
  12.507343278686905,
  -0.13857109526572012,
  9.9843695780195716e-6,
  1.5056327351493116e-7,
];

export function _gamma(x) {
  // Reflection: Γ(x) = π / (sin(πx) · Γ(1 − x))  for x < 0.5
  if (x < 0.5) {
    const s = Math.sin(Math.PI * x);
    if (s === 0) throw new RPLError('Infinite result'); // pole
    return Math.PI / (s * _gamma(1 - x));
  }
  x -= 1;
  let a = _LANCZOS_P[0];
  for (let i = 1; i < _LANCZOS_P.length; i++) a += _LANCZOS_P[i] / (x + i);
  const t = x + _LANCZOS_G + 0.5;
  return Math.sqrt(2 * Math.PI) * Math.pow(t, x + 0.5) * Math.exp(-t) * a;
}


function _hp50ModReal(a, b) {
  if (b === 0) throw new RPLError('Infinite result');
  return a - b * Math.floor(a / b);
}


/** Log-gamma via the same Lanczos coefficients as _gamma.  Implemented
 *  directly rather than as Math.log(_gamma(x)) so we stay finite for
 *  large x — Γ(200) overflows IEEE double, but ln Γ(200) ≈ 857.9 is
 *  well within range.  Uses the reflection formula for x < 0.5 so the
 *  domain is all real x except the non-positive integers (poles — the
 *  caller handles those).  Returns the natural log of |Γ(x)|; for
 *  negative non-integer x the true LNGAMMA has an imaginary part of
 *  k·πi depending on which reflection we cross.  HP50 LNGAMMA is
 *  real-valued (AUR §3-CAS), so we track |Γ| only.  */
export function _lngamma(x) {
  if (x < 0.5) {
    // ln Γ(x) = ln π − ln|sin πx| − ln Γ(1 − x)
    const sinPx = Math.sin(Math.PI * x);
    if (sinPx === 0) throw new RPLError('Infinite result');
    return Math.log(Math.PI) - Math.log(Math.abs(sinPx)) - _lngamma(1 - x);
  }
  const y = x - 1;
  let a = _LANCZOS_P[0];
  for (let i = 1; i < _LANCZOS_P.length; i++) a += _LANCZOS_P[i] / (y + i);
  const t = y + _LANCZOS_G + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (y + 0.5) * Math.log(t) - t + Math.log(a);
}


/** Regularised upper incomplete gamma Q(a, x) = Γ(a, x) / Γ(a).
 *  Implementation follows Numerical Recipes (Press et al.) §6.2:
 *
 *    - For x < a + 1 use the lower-incomplete series  P(a, x)
 *      (converges quickly in this regime) and return 1 − P.
 *    - For x ≥ a + 1 use the upper-incomplete continued fraction
 *      (converges quickly in this regime) and return directly.
 *
 *  Precondition: a > 0, x ≥ 0.  The UTPC op enforces both.
 *  Precision: ≲ 1e-12 over the whole domain in double precision —
 *  comfortably inside the HP50 STAT-DIST 10-digit display.  */
export function _regGammaQ(a, x) {
  if (x === 0) return 1;
  if (x < a + 1) {
    // Series for the lower-incomplete.  P(a,x) = γ(a,x) / Γ(a).
    let sum = 1 / a, term = 1 / a, n = 1;
    while (n < 1000) {
      term *= x / (a + n);
      sum += term;
      if (Math.abs(term) < Math.abs(sum) * 1e-16) break;
      n++;
    }
    const P = sum * Math.exp(-x + a * Math.log(x) - _lngamma(a));
    return 1 - P;
  }
  // Continued fraction for the upper-incomplete.  Γ(a,x) / Γ(a).
  // Lentz's algorithm with a sentinel to avoid division by zero.
  const TINY = 1e-300;
  let b = x + 1 - a;
  let c = 1 / TINY;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < 1000; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b; if (Math.abs(d) < TINY) d = TINY;
    c = b + an / c; if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < 1e-16) break;
  }
  return h * Math.exp(-x + a * Math.log(x) - _lngamma(a));
}


/* ------------------------------------------------------------------
   Variables — STO / RCL / PURGE / VARS

   HP50 stack order for STO:
     level 2: value
     level 1: name (a Name object — typed as 'X' on the command line)
   STO consumes both and writes the value to the current directory.

   RCL, PURGE each take a name on level 1.  VARS takes no input and
   pushes a list of the current directory's variable names.

   We accept either a Name or a String for the name argument — the HP50
   accepts both, and entering plain text like "X" at the cmdline
   already parses to a Name.
   ------------------------------------------------------------------ */

function popNameId(s) {
  const v = s.pop();
  if (isName(v))   return v.id;
  if (isString(v)) return v.value;
  throw new RPLError('Bad argument type');
}


/* ------------------------------------------------------------------
   Directory navigation — CRDIR / UPDIR / HOME / PATH.

   CRDIR  ( name  --  )    create an empty subdirectory of the current
                           dir, name supplied as a Name or String.
                           A List of names creates each in order.
                           HP50 does NOT descend into the new dir.

   UPDIR  ( -- )           cd to the current directory's parent.
                           No-op at HOME (matches HP50 silent behavior).

   HOME   ( -- )           cd to the root HOME directory.  Distinct
                           from the variable name 'HOME' — when typed
                           as a bare identifier at the cmdline, it
                           resolves to this op (ops beat variables in
                           the evalToken lookup order).

   PATH   ( -- list )      push a List of Names from HOME down to the
                           current directory.  Always starts with
                           Name('HOME').  `{ HOME }` at the root;
                           `{ HOME A B }` three levels deep.

   Name-argument handling matches STO/RCL/PURGE: either a Name or a
   String is accepted on level 1.  A List of Names (or Strings) is
   accepted by CRDIR for the "make several at once" shorthand that the
   HP50 UI exposes.
   ------------------------------------------------------------------ */

export function _coerceDirName(v) {
  if (isName(v))   return v.id;
  if (isString(v)) return v.value;
  throw new RPLError('Bad argument type');
}


/**
 * Write-path name coercion.  Same shape as `_coerceDirName` but also
 * enforces HP50 §2.2.4 identifier rules (letters + digits + underscore,
 * ≤127 chars, starts with letter, not a reserved command name).  Used
 * by STO / STO+- etc. / CRDIR / SVX / STOF — anywhere a *new or
 * overwritten* variable binding is created.  Read-only paths (RCL,
 * PURGE, VARS) keep using `_coerceDirName` so they stay permissive and
 * can still address any name that already exists in a directory.  The
 * HP50 itself raises "Invalid name" for these cases; we use the same
 * wording so ERRN picks up a recognisable code.
 */
export function _coerceStorableName(v) {
  const id = _coerceDirName(v);
  if (!isValidHpIdentifier(id)) {
    throw new RPLError(`Invalid name: ${id}`);
  }
  if (!isStorableHpName(id)) {
    // Syntactically valid but reserved (e.g. 'SIN', 'STO').
    throw new RPLError(`Invalid name: ${id}`);
  }
  return id;
}


/* ------------------------------------------------------------------
   EVAL — the central evaluation primitive.

   Pops level 1 and dispatches by type:

     Program  → walk `.tokens` with a pointer (index-based).  At each
                token:
                  - If it's a bare Name whose uppercased id is a
                    control-flow opener (IF, WHILE, DO, START, FOR),
                    the control-flow handler takes over: it scans
                    forward through the token stream to find the
                    matching inner keywords (THEN/ELSE/REPEAT/UNTIL)
                    and closer (END/NEXT/STEP), honoring nested blocks,
                    and executes the appropriate sub-ranges.
                  - Bare closer/inner keywords found at the top of a
                    Program (no matching opener) are simply skipped —
                    HP50 ignores them in this context too.
                  - Otherwise the token is evaluated normally: op
                    lookup for bare Names, RCL-and-EVAL for bound
                    names, push-back for everything else.

     Name     → if bound, push the binding and EVAL it; else push.
     Tagged   → strip the tag and EVAL the inner value.
     Numeric / String / List / Vector / Matrix / Symbolic / Directory
              → push back unchanged (EVAL is idempotent for these).

   Atomicity: the full stack array is snapshotted at entry; if any
   inner op or sub-EVAL throws an RPLError, the stack is rolled back
   to its pre-EVAL state and the error is re-thrown.  This matches
   what users expect from `<< ... >>` EVAL — the program either
   completes cleanly or the stack is unchanged.

   Recursion depth is bounded so a runaway recursive program can't
   blow the JS call stack and brick the page.
   ------------------------------------------------------------------ */

const MAX_EVAL_DEPTH = 256;


/* Control-flow keyword sets.  Openers begin a block that must be
   matched by a closer at the same nesting level.  Inner keywords
   (THEN/ELSE/REPEAT/UNTIL) are block-internal separators.  These
   are NOT registered as ops — they're only meaningful while walking
   a Program's token stream, and are recognized here by name.
   CASE has an inner grammar of clauses of the shape
   `test THEN action END`, each clause self-delimited by its own END,
   with one extra outer END closing the CASE itself; handled by
   runCase.  CASE is still a CF_OPENER for the purposes of scanAtDepth0
   so a CASE nested inside another block counts toward that block's
   depth — but runCase never delegates to scanAtDepth0 across an
   OUTER boundary; it walks its own token range clause by clause. */
const CF_OPENERS = new Set(['IF', 'IFERR', 'WHILE', 'DO', 'START', 'FOR', 'CASE']);

const CF_CLOSERS = new Set(['END', 'NEXT', 'STEP']);

const CF_INNERS  = new Set(['THEN', 'ELSE', 'REPEAT', 'UNTIL']);


/** If tok is a bare (unquoted) Name, return its uppercased id; else null. */
function bareNameId(tok) {
  if (!isName(tok) || tok.quoted) return null;
  return tok.id.toUpperCase();
}


/** Scan `toks` starting at `from`, at the current block's depth 0,
 *  returning the first index whose bare-name id appears in `wanted`
 *  OR is a block closer.  Nested opener/closer pairs are skipped.
 *
 *  CASE is special: unlike IF/WHILE/DO/START/FOR/IFERR which each have
 *  a single closer, a CASE block contains N+1 depth-0 ENDs (one per
 *  inner THEN clause plus one outer END closing the CASE itself).  If
 *  scanAtDepth0 naively incremented/decremented `depth` on CASE, the
 *  very first inner END would appear to close the CASE — and any
 *  outer block containing that CASE would then mistake that inner END
 *  for its OWN closer.  To avoid that, when we encounter CASE we skip
 *  past the entire CASE (up to and including its outer END) in one
 *  step via `_skipPastCaseEnd`.
 *
 *  Returns { idx, kind } or null if we fall off the end. */
function scanAtDepth0(toks, from, wanted) {
  let depth = 0;
  let i = from;
  while (i < toks.length) {
    const id = bareNameId(toks[i]);
    if (!id) { i++; continue; }
    if (id === 'CASE') {
      i = _skipPastCaseEnd(toks, i);
      continue;
    }
    if (CF_OPENERS.has(id)) { depth++; i++; continue; }
    if (CF_CLOSERS.has(id)) {
      if (depth === 0) return { idx: i, kind: id };
      depth--;
      i++;
      continue;
    }
    if (depth === 0 && wanted && wanted.has(id)) {
      return { idx: i, kind: id };
    }
    i++;
  }
  return null;
}


/** Return the index immediately AFTER a CASE's outer END, given the
 *  index of the `CASE` opener.  Balancing rule:
 *    - start with pending = 1 (the CASE's own outer END)
 *    - each depth-0 THEN adds 1 to pending (another inner END coming)
 *    - each depth-0 END pays off one pending; pending = 0 → outer END
 *    - other CF openers increment a `nest` counter that is balanced
 *      by their own closers (and hides their internals from our count)
 *    - a nested CASE is handled by a recursive call so its own inner
 *      ENDs don't mistakenly decrement our pending count
 *  If the token stream ends before pending hits zero, return the end
 *  of the array so callers can report "CASE without END" cleanly. */
function _skipPastCaseEnd(toks, caseIdx) {
  let pending = 1;
  let nest = 0;
  let i = caseIdx + 1;
  while (i < toks.length) {
    const id = bareNameId(toks[i]);
    if (id) {
      if (id === 'CASE') {
        i = _skipPastCaseEnd(toks, i);
        continue;
      }
      if (CF_OPENERS.has(id)) {
        nest++;
      } else if (CF_CLOSERS.has(id)) {
        if (nest > 0) nest--;
        else if (id === 'END') {
          pending--;
          if (pending === 0) return i + 1;
        }
        // NEXT / STEP at nest=0 inside a CASE is a malformed program.
        // We leave them as a no-op here; runCase's own dispatch will
        // fall through to the final `CASE without END` if they outnumber
        // their openers.
      } else if (nest === 0 && id === 'THEN') {
        pending++;
      }
    }
    i++;
  }
  return toks.length;
}


/* ------------------------------------------------------------------
   Compiled local environments — `→ a b … body` (ASCII `->` is the same form).

   HP50 AUR §21.1 defines a short-lived binding form that pops N values
   off the stack into lexically scoped locals for the duration of a
   single body evaluation.  Two body forms are accepted:

     → a b « … a + b … »      (program body; body is run)
     → a b 'a + b'            (algebraic body; body is EVAL'd)

   Frames are a LIFO stack owned by this module.  Name lookup in
   `evalToken` and the Name branch of `_evalValue` now consults
   `_localLookup` before the op table and the global variable store, so
   a local binding shadows both.  The frame is popped in a `finally`
   block so that an error or RPLAbort inside the body still unwinds the
   binding — leaks here would leave phantom vars visible to later code.

   The names themselves are captured as plain bare-name strings (not
   Name objects) and the frame is a `Map<string, Value>`.  Popping from
   the user's stack preserves HP50 convention: rightmost name → level 1.
   ------------------------------------------------------------------ */
export const _localFrames = [];


function _localLookup(id) {
  for (let i = _localFrames.length - 1; i >= 0; i--) {
    const f = _localFrames[i];
    if (f.has(id)) return f.get(id);
  }
  return undefined;
}


function _pushLocalFrame(names, values) {
  const f = new Map();
  for (let i = 0; i < names.length; i++) f.set(names[i], values[i]);
  _localFrames.push(f);
  return f;
}


function _popLocalFrame() { _localFrames.pop(); }


/** Single-step debugger flag.  When `true`, `evalRange` yields after
 *  every token (in addition to the HALT-yield).  The SST / SST↓ /
 *  DBUG handlers manage this flag together with the haltedStack:
 *    - DBUG <prog>  : sets the flag, then EVALs the program — which
 *                     immediately yields before the first token,
 *                     suspending the program on the haltedStack so the
 *                     user can inspect the stack and step through it.
 *    - SST          : while a halted generator exists, drives gen.next()
 *                     exactly once.  Sets the flag, calls next() (which
 *                     causes evalRange to yield after one token), then
 *                     re-pushes the still-live generator onto the stack
 *                     so the next SST can resume from the next token.
 *                     Clears the flag if the generator finishes.
 *    - SST↓         : step-into.  Same drive mechanism as
 *                     SST but also sets `_stepInto = true` across the
 *                     gen.next() call.  `_evalValueGen` reads the flag
 *                     in its Program branch: with step-into active, it
 *                     leaves `_singleStepMode` set while running the
 *                     sub-program body, so the post-token yield inside
 *                     evalRange fires on each of the sub-program's
 *                     tokens.  Step-over (SST) temporarily clears the
 *                     flag around the body so the call completes in
 *                     one logical step.
 *  Module-private; tests reach it via the SST op or the public
 *  haltedDepth() / state.halted observers. */
let _singleStepMode = false;


/** `_stepInto` modulates whether single-stepping descends
 *  into sub-program calls reached via `evalToken` Name lookup.  SST
 *  leaves this `false` (step-over — the sub-program runs at full speed
 *  and we yield once after the call); SST↓ sets it `true` (step-into —
 *  the sub-program's own post-token yield fires on every inner token).
 *  The distinction only matters when a Name token resolves to a stored
 *  Program; for structural control-flow and ops that take a Program
 *  argument (IFT / IFTE / MAP / …) step-in is a no-op because those
 *  paths don't go through `_evalValueGen`. */
let _stepInto = false;


/** True while `evalRange` is running on a Program body reached via
 *  `evalToken` Name lookup (i.e. inside `_evalValueGen`'s Program
 *  branch).  Post-token yields check `(!_insideSubProgram ||
 *  _stepInto)` — in step-over mode this suppresses yielding inside the
 *  sub-program so one SST advances past the whole call; in step-into
 *  mode the check passes and the user stops on each inner token.  A
 *  module-private depth counter would also work; boolean is enough
 *  because yield conditions only care "are we inside a named sub-call
 *  right now", not how deeply nested the call chain is (step-into
 *  applies uniformly to every level once the user chose SST↓). */
let _insideSubProgram = false;


/** For tests: snapshot the current single-step flag without exposing
 *  the mutable binding.  Tests use this to pin the SST cleanup
 *  invariant (flag must be back to false once a stepped program
 *  finishes).  Also referenced from SST itself for the recursive
 *  drive — the local snapshot is what tells the post-yield code
 *  whether to re-push the generator. */
export function singleStepMode() { return _singleStepMode; }


/** For tests: snapshot the current step-into flag (SST vs SST↓).
 *  See the `_stepInto` docstring above for the distinction. */
export function stepIntoMode() { return _stepInto; }


/** Restore `_localFrames` to an earlier captured length.  Pops any
 *  extra entries that accumulated on top.  Used by `register('EVAL')`
 *  / `register('CONT')` in a top-level `finally` so that an abnormal
 *  unwind (non-RPLError throw, JS TypeError from a broken op, or an
 *  unanticipated path) can't leak a half-popped frame and poison the
 *  HALT pilot check that runs inside `evalRange`.  The normal path
 *  through `runArrow`'s own `finally` restores the length itself, so
 *  this is a no-op in the common case.  Kept internal to the module —
 *  no export needed. */
export function _truncateLocalFrames(toLength) {
  while (_localFrames.length > toLength) _localFrames.pop();
}


/** Read-only view of the current local-frame depth.  Exposed so tests
 *  can assert the post-EVAL invariant `localFramesDepth() === 0` after
 *  a resetHome / resetState call. */
export function localFramesDepth() { return _localFrames.length; }


/** Execute a `→ n1 n2 … body` form starting at `toks[arrowIdx]`.
 *  Returns the index immediately past the body token.  Throws
 *  `RPLError` on malformed syntax or too-few stack values.  */
function* runArrow(s, toks, arrowIdx, to, depth) {
  // Collect consecutive bare (unquoted) Name tokens as local names.
  // Stop at the first non-Name / quoted-Name — that must be the body.
  const names = [];
  let i = arrowIdx + 1;
  while (i < to) {
    const t = toks[i];
    if (isName(t) && !t.quoted) {
      names.push(t.id);
      i++;
    } else {
      break;
    }
  }
  if (names.length === 0) {
    throw new RPLError('→: no local variable names');
  }
  if (i >= to) {
    throw new RPLError('→: missing body');
  }
  const body = toks[i];
  if (!isProgram(body) && !isSymbolic(body)) {
    throw new RPLError('→: body must be a program or algebraic');
  }
  if (s.depth < names.length) {
    throw new RPLError('Too few arguments');
  }
  // popN returns `[levelN, …, level1]`, which pairs with `names` by
  // index such that the rightmost name binds to stack level 1 — the
  // HP50 convention for the arrow form.
  const values = s.popN(names.length);
  _pushLocalFrame(names, values);
  try {
    if (isProgram(body)) {
      yield* evalRange(s, body.tokens, 0, body.tokens.length, depth + 1);
    } else {
      // Symbolic body — EVAL leaves the (possibly partially reduced)
      // value on the stack, matching HP50 behaviour.  Symbolic eval is
      // synchronous (no HALT path), so no yield* needed.
      // Pass an explicit caller label.  A pure-algebraic
      // body cannot reach a Program node (the AST has no embedding for
      // it), so this label is defensive — the only way to surface it
      // would be a future extension that lets a Symbolic carry a Program
      // sub-expression.  Keeping the label aligned with sibling sync-
      // path call sites (IFT / IFTE / MAP / SEQ / DOLIST / DOSUBS /
      // STREAM) means a hypothetical future HALT rejection here would
      // already say `→ algebraic body` instead of the bare default.
      _evalValueSync(s, body, depth + 1, '→ algebraic body');
    }
  } finally {
    _popLocalFrame();
  }
  return i + 1;
}


/** Evaluate tokens in [from, to) as a flat sequence, respecting any
 *  nested control-flow structures.  `s` is the stack, `depth` tracks
 *  recursion.  Generator function: yields at every HALT encountered
 *  anywhere in the token stream — including inside control structures
 *  and `→` bodies — so the calling handler (EVAL/CONT) can store the
 *  live generator as the halted continuation.  Mutates the stack. */
function* evalRange(s, toks, from, to, depth) {
  if (depth > MAX_EVAL_DEPTH) {
    throw new RPLError('EVAL recursion too deep');
  }
  let i = from;
  while (i < to) {
    const tok = toks[i];
    const id = bareNameId(tok);
    if (id && CF_OPENERS.has(id)) {
      i = yield* runControl(s, toks, i, to, depth);
      yield* _stepYield(toks, i);
      continue;
    }
    // Compiled local environment: `→ n1 n2 … body`.  `runArrow` collects
    // the local names, pops that many values from the stack, pushes a
    // binding frame, runs the body (Program or Symbolic), and pops the
    // frame.  ASCII `->` is the same form — commands already have
    // `->NUM`/`->LIST` aliases, but the arrow itself was glyph-only.
    if (id === '→' || id === '->') {
      i = yield* runArrow(s, toks, i, to, depth);
      yield* _stepYield(toks, i);
      continue;
    }
    // HALT — generator-based suspension.  `yield` here propagates up
    // through all `yield*` delegations to the top-level EVAL/CONT
    // handler, which stores this generator in state.haltedStack.  On
    // CONT, gen.next() resumes exactly here; we then advance past the
    // HALT token and continue the loop — matching the HP50's "resume
    // at the instruction after HALT" semantics.  Because the generator
    // preserves every call-frame on the JS engine's stack, HALT works
    // correctly at any structural depth (inside FOR, IF, →, etc.).
    if (id === 'HALT') {
      _markSuspend(toks, i + 1, 'halt');
      yield;
      i++;          // resume: advance past HALT
      continue;
    }
    // PROMPT.  HP50 AUR p.2-160: pop level 1, stash it
    // as the active prompt banner (state.promptMessage), then halt the
    // program.  Mechanically PROMPT is HALT-with-message: we use the
    // same `yield` channel so CONT/SST/KILL all just work.  Outside a
    // running program (the Name reaches `_dispatchOp` via the
    // registered handler below) PROMPT throws — matches our HALT-
    // outside-program behavior.
    //
    // The pop happens BEFORE the yield so the message is observable as
    // soon as the program suspends.  If the stack is empty, we throw
    // before yielding — the caller's `_truncateLocalFrames` safety net
    // still runs in EVAL/CONT's `finally`.
    if (id === 'PROMPT') {
      if (s.depth < 1) throw new RPLError('PROMPT: Too few arguments');
      const msg = s.pop();
      setPromptMessage(msg);
      _markSuspend(toks, i + 1, 'prompt');
      yield;
      i++;          // resume: advance past PROMPT
      continue;
    }
    // IFT — stack-based conditional.  The action is EVAL'd via
    // `_evalValueGen` (yieldable) so a HALT/PROMPT inside it suspends
    // cleanly through this same evalRange chain.  The
    // `register('IFT', ...)` handler below stays as a sync fallback
    // for the rare path where IFT is reached via `evalToken` Name
    // dispatch (`'IFT' EVAL`, Tagged-wrapped Name(IFT) on stack);
    // those reject HALT through `_driveGen` with the
    // `IFT action` caller label.
    if (id === 'IFT') {
      yield* runIft(s, depth);
      i++;
      yield* _stepYield(toks, i);
      continue;
    }
    // IFTE — same pattern as IFT, with three pops
    // (test, t-action, f-action) and the chosen action EVAL'd via
    // `_evalValueGen`.  Sync fallback in `register('IFTE', ...)` below.
    if (id === 'IFTE') {
      yield* runIfte(s, depth);
      i++;
      yield* _stepYield(toks, i);
      continue;
    }
    // SEQ / MAP — list combinators whose body is EVAL'd once per
    // iteration (per-element).  The generator-flavor helpers below
    // (`runSeq` / `runMap`) drive each iteration through
    // `_evalValueGen` so a HALT/PROMPT inside an iteration's body lifts
    // cleanly through `yield*` up to the EVAL/CONT driver.  CONT
    // resumes inside the same iteration that suspended; the loop's
    // local accumulator (`out` array, current `i` for SEQ, the
    // already-mapped row prefix for MAP) survives across the suspension
    // because it lives in the generator's stack frame.  The
    // `register('SEQ', ...)` / `register('MAP', ...)` handlers below
    // stay as sync fallbacks (Name-dispatch, Tagged-wrapped Name, etc.)
    // and reject HALT through `_driveGen` with the caller labels
    // (`'SEQ expression'` / `'MAP program'`).
    if (id === 'SEQ') {
      yield* runSeq(s, depth);
      i++;
      yield* _stepYield(toks, i);
      continue;
    }
    if (id === 'MAP') {
      yield* runMap(s, depth);
      i++;
      yield* _stepYield(toks, i);
      continue;
    }
    // DOLIST / DOSUBS / STREAM — same generator-flavor pattern as
    // MAP / SEQ / IFT / IFTE: each iteration drives `prog` through
    // `_evalValueGen` so HALT/PROMPT suspends through `yield*`.
    // Per-iteration state (`out` accumulator, current `i`, DOSUBS
    // NSUB/ENDSUB frame) lives in the helper's stack frame, so CONT
    // resumes mid-iteration with all state intact.  Sync fallbacks in
    // `register('DOLIST', ...)` / `register('DOSUBS', ...)` /
    // `register('STREAM', ...)` keep the caller labels for the rare
    // Name-dispatch path.
    if (id === 'DOLIST') {
      yield* runDoList(s, depth);
      i++;
      yield* _stepYield(toks, i);
      continue;
    }
    if (id === 'DOSUBS') {
      yield* runDoSubs(s, depth);
      i++;
      yield* _stepYield(toks, i);
      continue;
    }
    if (id === 'STREAM') {
      yield* runStream(s, depth);
      i++;
      yield* _stepYield(toks, i);
      continue;
    }
    if (id && (CF_CLOSERS.has(id) || CF_INNERS.has(id))) {
      // Orphan control keyword at depth 0 — skip silently (matches HP50
      // behavior where a stray END in a program body is a no-op; it
      // wouldn't have parsed successfully anyway on a real unit).
      i++;
      continue;
    }
    yield* evalToken(s, tok, depth);
    i++;
    // SST / SST↓ single-step debugger — when stepping is active, yield
    // after every token so the calling EVAL/CONT/SST handler suspends
    // the generator on the haltedStack.  `_shouldStepYield()` combines
    // `_singleStepMode` with `_stepInto` / `_insideSubProgram` so that
    // step-over (SST) doesn't yield on tokens inside a Name-reached
    // sub-program body, while step-into (SST↓) does.  Generator
    // semantics mean every structural-context frame (FOR counter, IF
    // branch, → local frame) is preserved across single-step
    // suspensions for free.
    yield* _stepYield(toks, i);
  }
}


function _shouldStepYield() {
  return _singleStepMode && (!_insideSubProgram || _stepInto);
}

let _pendingSuspend = null;

function _markSuspend(tokens, index, kind) {
  _pendingSuspend = { tokens, index, kind };
}

export function clearPendingSuspend() {
  _pendingSuspend = null;
}

export function pushSuspendedGenerator(generator) {
  const view = _pendingSuspend;
  _pendingSuspend = null;
  setHalted({
    generator,
    tokens: view ? view.tokens : null,
    index: view ? view.index : null,
    kind: view ? view.kind : null,
  });
}

function* _stepYield(tokens, index) {
  if (!_shouldStepYield()) return;
  _markSuspend(tokens, index, 'step');
  yield;
}


/** Evaluate a single non-control token.  Semantics mirror the pre-
 *  control-flow Program loop.
 *
 *  Generator function.  Any Name whose binding resolves
 *  to a Program is evaluated through `_evalValueGen`, which delegates
 *  to `evalRange` via `yield*` — so HALT inside a named sub-program
 *  (reached by variable lookup) now yields cleanly up to the top-level
 *  EVAL/CONT handler instead of rejecting through `_driveGen`.  Other
 *  value types (number, string, tagged-value, symbolic) are purely
 *  synchronous and never yield, so the generator just returns. */
function* evalToken(s, tok, depth) {
  if (isName(tok)) {
    if (tok.quoted) { s.push(tok); return; }
    // Compiled-local bindings shadow both ops and globals.
    const localVal = _localLookup(tok.id);
    if (localVal !== undefined) {
      yield* _evalValueGen(s, localVal, depth + 1);
      return;
    }
    const op = lookup(tok.id);
    if (op) { _dispatchOp(op, s, tok.id); return; }
    const bound = varRecall(tok.id);
    if (bound !== undefined) {
      yield* _evalValueGen(s, bound, depth + 1);
    } else {
      s.push(tok);
    }
    return;
  }
  s.push(tok);
}


// Invoke an op and, if it throws an RPLError, rewrap the message with
// the command name so the user sees `+: Too few arguments` instead of
// bare `Too few arguments`.  Messages that already carry a `WORD: `
// prefix are left alone (some helpers self-prefix — see _popOneReturn).
function _dispatchOp(op, s, name) {
  try {
    op.fn(s);
  } catch (e) {
    if (e instanceof RPLError && !/^[^\s:]+:\s/.test(e.message)) {
      throw new RPLError(`${name}: ${e.message}`);
    }
    throw e;
  }
}


/** Dispatch a control-flow structure starting at `toks[i]` (an opener).
 *  Generator: delegates to the appropriate run* generator so that a
 *  HALT inside any branch propagates yield up to the EVAL/CONT handler.
 *  Returns (via the generator return value) the index past the closer. */
function* runControl(s, toks, i, bound, depth) {
  const opener = bareNameId(toks[i]);

  switch (opener) {
    case 'IF':    return yield* runIf(s, toks, i, depth);
    case 'IFERR': return yield* runIfErr(s, toks, i, depth);
    case 'WHILE': return yield* runWhile(s, toks, i, depth);
    case 'DO':    return yield* runDo(s, toks, i, depth);
    case 'START': return yield* runStart(s, toks, i, depth);
    case 'FOR':   return yield* runFor(s, toks, i, depth);
    case 'CASE':  return yield* runCase(s, toks, i, depth);
  }
  throw new RPLError(`Bad opener: ${opener}`);
}


/** CASE dispatch:
 *    CASE
 *      test1 THEN action1 END
 *      test2 THEN action2 END
 *      ...
 *      [default-action]
 *    END
 *
 *  Semantics (HP50 AUR §21.3):
 *    - Evaluate each clause's test in turn.
 *    - The first truthy test runs its action and short-circuits to
 *      the outer END — remaining clauses are neither tested nor run.
 *    - If no clause matches, the tokens between the last inner END
 *      and the outer END form an optional default action and are run.
 *
 *  Layout note: CASE is a `CF_OPENER` so `scanAtDepth0` properly
 *  skips a nested CASE; but runCase's own forward scan must count
 *  THENs to identify which END is the OUTER one.  The key invariant
 *  is that each THEN clause is closed by the first END at depth 0,
 *  and the CASE itself is closed by the END that follows the last
 *  clause (or the only END when there are no clauses).
 *
 *  Our implementation walks clauses linearly:
 *    - `scanAtDepth0(toks, i, {THEN})` returns either the next THEN
 *       (a new clause starts here) or the next END at depth 0.  If
 *       it's END, we're past all clauses — the range [i, endIdx) is
 *       the default action.  Evaluate it and return `endIdx + 1`.
 *    - Otherwise we have a THEN; tokens in [i, thenIdx) are the test.
 *       Evaluate it and pop.  The matching END for this clause is the
 *       next depth-0 closer.  If the test is truthy, evaluate the
 *       action range and then scan forward for the OUTER CASE END
 *       (counting remaining THENs as "pending ENDs").  If false,
 *       advance past the clause's inner END and loop to the next
 *       clause. */
function* runCase(s, toks, openIdx, depth) {
  // Auto-close policy.  Any forward scan that falls off the end of the
  // token list is treated as an implicit END — matching the parser's
  // existing convenience on `«`, `}`, `]` (parser.js auto-closes when
  // the source runs out before the closing delimiter).  A Program built
  // from user input like `« CASE X THEN 1 END X>0 THEN 2` (missing the
  // trailing `END`) evaluates cleanly instead of raising "CASE without
  // END".
  const bound = toks.length;
  let i = openIdx + 1;

  while (i < bound) {
    const scan = scanAtDepth0(toks, i, new Set(['THEN']));
    if (!scan) {
      // Auto-close: no END found — [i, bound) is the default clause.
      yield* evalRange(s, toks, i, bound, depth + 1);
      return bound;
    }

    if (scan.kind === 'END') {
      // No THEN found — the range [i, scan.idx) is the default clause.
      yield* evalRange(s, toks, i, scan.idx, depth + 1);
      return scan.idx + 1;
    }

    if (scan.kind !== 'THEN') {
      throw new RPLError(`CASE: unexpected ${scan.kind}`);
    }

    const thenIdx = scan.idx;
    yield* evalRange(s, toks, i, thenIdx, depth + 1);
    const test = s.pop();

    const innerEnd = scanAtDepth0(toks, thenIdx + 1, null);
    // Auto-close when no inner END: treat the rest of the token list as
    // the action body for this clause.
    const innerEndIdx = (innerEnd && innerEnd.kind === 'END') ? innerEnd.idx : bound;
    const innerAutoClosed = (innerEndIdx === bound);

    if (isTruthy(test)) {
      yield* evalRange(s, toks, thenIdx + 1, innerEndIdx, depth + 1);
      if (innerAutoClosed) return bound;
      // Short-circuit to the outer CASE END.  After the inner END
      // we've matched one of N+1 depth-0 ENDs (one per clause plus
      // one for CASE).  `pending` tracks how many depth-0 ENDs we
      // still need to pass — starts at 1 (the CASE's own END).  Each
      // remaining THEN we skip adds one pending END (because it
      // opens a clause that will close with its own END).  Nested
      // openers (IF, WHILE, ...) are balanced by their own closers
      // and don't contribute to the pending count.  A nested CASE is
      // handled by `_skipPastCaseEnd` so its own inner ENDs don't
      // confuse our counter.
      let pending = 1;
      let nest = 0;
      let j = innerEndIdx + 1;
      while (j < bound) {
        const id = bareNameId(toks[j]);
        if (id) {
          if (id === 'CASE') {
            j = _skipPastCaseEnd(toks, j);
            continue;
          }
          if (CF_OPENERS.has(id)) {
            nest++;
          } else if (CF_CLOSERS.has(id)) {
            if (nest > 0) nest--;
            else if (id === 'END') {
              pending--;
              if (pending === 0) return j + 1;
            }
          } else if (nest === 0 && id === 'THEN') {
            pending++;
          }
        }
        j++;
      }
      // Auto-close the outer CASE too.
      return bound;
    }

    // Test was false: skip this clause's action and try the next.
    if (innerAutoClosed) return bound;
    i = innerEndIdx + 1;
  }
  return bound;
}


function* runIf(s, toks, openIdx, depth) {
  // IF <test> THEN <true-branch> [ELSE <false-branch>] END
  //
  // Auto-close policy (mirrors CASE and IFERR): a forward scan that
  // falls off the end of the token list is treated as an implicit END.
  // So
  //   « IF test THEN … »           runs the true-branch on truthy test
  //                                 and is otherwise a no-op — identical
  //                                 to the fully-closed « IF test THEN … END ».
  //   « IF test THEN … ELSE … »    also auto-closes the else-branch.
  // A missing THEN stays a hard error — we have no sensible default
  // clause for IF (unlike CASE where the whole body becomes the
  // default).  Motivating case: a CASE nested inside an IF whose own
  // END is missing would throw "IF without END" because
  // _skipPastCaseEnd returned toks.length and the outer scanAtDepth0
  // fell off the end.  With this auto-close the whole thing is
  // well-formed — same convenience as the parser's `« `/`{`/`[`
  // auto-close on unterminated openers.
  const bound = toks.length;
  const thenScan = scanAtDepth0(toks, openIdx + 1, new Set(['THEN']));
  if (!thenScan || thenScan.kind !== 'THEN') {
    throw new RPLError("IF without THEN");
  }
  const thenIdx = thenScan.idx;
  yield* evalRange(s, toks, openIdx + 1, thenIdx, depth + 1);
  const test = s.pop();
  const branchScan = scanAtDepth0(toks, thenIdx + 1, new Set(['ELSE']));

  let endIdx;
  let autoClosed = false;
  if (!branchScan) {
    // No ELSE or END found — auto-close at the end of the token list.
    // [thenIdx+1, bound) is the true-branch; no else-branch.
    endIdx = bound;
    autoClosed = true;
    if (isTruthy(test)) {
      yield* evalRange(s, toks, thenIdx + 1, endIdx, depth + 1);
    }
  } else if (branchScan.kind === 'ELSE') {
    const endScan = scanAtDepth0(toks, branchScan.idx + 1, null);
    if (!endScan || endScan.kind !== 'END') {
      // ELSE present but no END — auto-close at the end of the token
      // list.  [branchScan.idx+1, bound) is the else-branch.
      endIdx = bound;
      autoClosed = true;
    } else {
      endIdx = endScan.idx;
    }
    if (isTruthy(test)) {
      yield* evalRange(s, toks, thenIdx + 1, branchScan.idx, depth + 1);
    } else {
      yield* evalRange(s, toks, branchScan.idx + 1, endIdx, depth + 1);
    }
  } else if (branchScan.kind === 'END') {
    endIdx = branchScan.idx;
    if (isTruthy(test)) {
      yield* evalRange(s, toks, thenIdx + 1, endIdx, depth + 1);
    }
  } else {
    throw new RPLError(`IF/THEN: unexpected ${branchScan.kind}`);
  }
  // Auto-close returns `bound` (same as IFERR / CASE) so the outer
  // evalRange's `while (i < to)` terminates immediately on the next
  // iteration without a spurious off-by-one.
  return autoClosed ? bound : endIdx + 1;
}


/** IFERR <trap> THEN <error clause> [ELSE <normal clause>] END
 *
 *  HP50 semantics:
 *    1. Snapshot the full stack.
 *    2. Evaluate the trap range.
 *    3. If the trap throws an RPLError:
 *         - Restore the stack to the snapshot (matching the HP50
 *           rule that the error clause starts with whatever was on
 *           the stack before IFERR).
 *         - Write the caught error to the last-error slot in state,
 *           so ERRM / ERRN / ERR0 inside the error clause can read
 *           or clear it.
 *         - Evaluate the error clause.
 *    4. If the trap completes normally and an ELSE branch is
 *       present, evaluate the ELSE branch.  (The stack is NOT
 *       rolled back in the success path — whatever the trap
 *       produced is what the ELSE branch sees.)
 *
 *  Non-RPLError exceptions (programmer bugs, TypeError, etc.) are
 *  intentionally NOT caught — those indicate a broken op or test,
 *  not a user-visible HP50 error, and shouldn't silently disappear.
 *
 *  Nesting: the last-error slot is saved on entry and restored on
 *  exit so an outer IFERR still sees its own caught error if an
 *  inner IFERR runs between catch and outer reference.  (A rare
 *  case, but the alternative is subtle action-at-a-distance.) */
function* runIfErr(s, toks, openIdx, depth) {
  // Auto-close policy (mirrors CASE and the parser's "forgot the `»`"
  // / "forgot the `}`" convenience): a forward scan that falls off the
  // end of the token list is treated as an implicit END.  So
  //   `« IFERR … THEN … »`     runs the error handler on throw and is
  //                            otherwise a no-op — identical to the
  //                            fully-terminated `« IFERR … THEN … END »`.
  //   `« IFERR … THEN … ELSE … »`   also auto-closes the ELSE clause.
  // A missing THEN *inside the source* still raises "IFERR without
  // THEN" because without a THEN we cannot locate the trap body's end
  // — there is no sensible default clause for IFERR, unlike CASE where
  // the whole body is a valid default.
  const bound = toks.length;

  const thenScan = scanAtDepth0(toks, openIdx + 1, new Set(['THEN']));
  if (!thenScan || thenScan.kind !== 'THEN') {
    throw new RPLError('IFERR without THEN');
  }
  const thenIdx = thenScan.idx;
  const branchScan = scanAtDepth0(toks, thenIdx + 1, new Set(['ELSE']));

  let elseIdx = -1;
  let endIdx;
  let autoClosed = false;
  if (!branchScan) {
    // No ELSE or END found — auto-close at the end of the token list.
    // The whole [thenIdx+1, bound) span is the error-handler clause.
    endIdx = bound;
    autoClosed = true;
  } else if (branchScan.kind === 'ELSE') {
    elseIdx = branchScan.idx;
    const endScan = scanAtDepth0(toks, elseIdx + 1, null);
    if (!endScan || endScan.kind !== 'END') {
      // ELSE present but no END — auto-close at the end of the token
      // list.  [elseIdx+1, bound) is the success-branch clause.
      endIdx = bound;
      autoClosed = true;
    } else {
      endIdx = endScan.idx;
    }
  } else if (branchScan.kind === 'END') {
    endIdx = branchScan.idx;
  } else {
    throw new RPLError(`IFERR/THEN: unexpected ${branchScan.kind}`);
  }

  const snap = s.save();
  const savedOuterError = getLastError();
  let caught = null;
  try {
    yield* evalRange(s, toks, openIdx + 1, thenIdx, depth + 1);
  } catch (e) {
    if (!(e instanceof RPLError)) throw e;    // let non-HP50 bugs bubble
    caught = e;
  }

  if (caught) {
    s.restore(snap);
    setLastError(caught);
    try {
      yield* evalRange(s, toks, thenIdx + 1, (elseIdx >= 0 ? elseIdx : endIdx), depth + 1);
    } finally {
      // Restore whatever last-error was visible to the outer scope once
      // the trap's THEN clause has had a chance to read it.  This keeps
      // nested IFERRs from clobbering an outer ERRM/ERRN reference.
      restoreLastError(savedOuterError);
    }
  } else if (elseIdx >= 0) {
    yield* evalRange(s, toks, elseIdx + 1, endIdx, depth + 1);
  }
  // When we auto-closed at the program boundary, return `bound` (same
  // index, not `bound + 1`) so the outer evalRange's `while (i < to)`
  // terminates immediately on the next iteration.  The exact same shape
  // runCase uses for its auto-close return.
  return autoClosed ? bound : endIdx + 1;
}


/* Stack-based conditionals — generator flavor.
 *
 * IFT and IFTE evaluate a Program off the stack as their action.
 * `evalRange` intercepts the IFT/IFTE Name tokens and delegates here;
 * the action is EVAL'd through `_evalValueGen` (yieldable), so a
 * HALT/PROMPT inside the action lifts cleanly through `yield*` up to
 * the top-level EVAL/CONT driver — same path used for `→` bodies and
 * named sub-program calls.
 *
 * The snap-and-restore wrapper preserves the "if the action errors,
 * restore the test+action operands" semantic of the
 * `register('IFT')` / `register('IFTE')` sync handlers.  catch fires
 * on RPLError thrown from inside the action; HALT yields don't trigger
 * catch (no exception), so a successful HALT-and-CONT cycle leaves the
 * stack in whatever state the action produced — matching HP50 behavior
 * where the suspended-stack contents are exactly what the program
 * built before suspending.
 *
 * The `register('IFT', ...)` / `register('IFTE', ...)` handlers stay
 * as a sync fallback for the rare path where IFT/IFTE is reached via
 * `evalToken` Name dispatch (`'IFT' EVAL`, Tagged-wrapped Name(IFT),
 * etc.).  Those drive these same generators through `_driveGen`, which
 * rejects HALT with the IFT/IFTE caller labels.
 */
export function* runIft(s, depth) {
  const snap = s.save();
  try {
    const [test, action] = s.popN(2);
    if (isTruthy(test)) yield* _evalValueGen(s, action, depth + 1);
  } catch (e) {
    s.restore(snap);
    throw e;
  }
}


export function* runIfte(s, depth) {
  const snap = s.save();
  try {
    const [test, tAction, fAction] = s.popN(3);
    yield* _evalValueGen(s, isTruthy(test) ? tAction : fAction, depth + 1);
  } catch (e) {
    s.restore(snap);
    throw e;
  }
}


function* runWhile(s, toks, openIdx, depth) {
  // WHILE <test> REPEAT <body> END
  //
  // Auto-close policy (mirrors IF / IFERR / CASE / parser): a forward
  // scan that falls off the end of the token list is treated as an
  // implicit END.  So
  //   « WHILE test REPEAT body »   runs as if the user had written
  //                                « WHILE test REPEAT body END » —
  //                                same convenience the parser already
  //                                gives for unterminated `«`.
  // A missing REPEAT stays a hard error: WHILE has no sensible default
  // body separator.  A spurious NEXT / STEP at depth 0 (in the END
  // slot) is also still a hard error — those are counter-loop closers
  // and don't belong here.
  const bound = toks.length;
  const repeatScan = scanAtDepth0(toks, openIdx + 1, new Set(['REPEAT']));
  if (!repeatScan || repeatScan.kind !== 'REPEAT') {
    throw new RPLError("WHILE without REPEAT");
  }
  const endScan = scanAtDepth0(toks, repeatScan.idx + 1, null);
  let endIdx;
  let autoClosed = false;
  if (!endScan) {
    endIdx = bound;
    autoClosed = true;
  } else if (endScan.kind === 'END') {
    endIdx = endScan.idx;
  } else {
    throw new RPLError("WHILE/REPEAT without END");
  }
  let iterations = 0;
  while (true) {
    if (++iterations > MAX_LOOP_ITERATIONS) {
      throw new RPLError('WHILE loop iteration limit');
    }
    yield* evalRange(s, toks, openIdx + 1, repeatScan.idx, depth + 1);
    const test = s.pop();
    if (!isTruthy(test)) break;
    yield* evalRange(s, toks, repeatScan.idx + 1, endIdx, depth + 1);
  }
  return autoClosed ? bound : endIdx + 1;
}


function* runDo(s, toks, openIdx, depth) {
  // DO <body> UNTIL <test> END
  //
  // Auto-close policy (mirrors WHILE / IF / IFERR / CASE): a forward
  // scan that falls off the end of the token list is treated as an
  // implicit END, so
  //   « DO body UNTIL test »      runs as if the user had written
  //                               « DO body UNTIL test END ».
  // A missing UNTIL stays a hard error: DO has no sensible default
  // test separator.  A spurious NEXT / STEP at depth 0 in the END slot
  // is still a hard error — those are counter-loop closers.
  const bound = toks.length;
  const untilScan = scanAtDepth0(toks, openIdx + 1, new Set(['UNTIL']));
  if (!untilScan || untilScan.kind !== 'UNTIL') {
    throw new RPLError("DO without UNTIL");
  }
  const endScan = scanAtDepth0(toks, untilScan.idx + 1, null);
  let endIdx;
  let autoClosed = false;
  if (!endScan) {
    endIdx = bound;
    autoClosed = true;
  } else if (endScan.kind === 'END') {
    endIdx = endScan.idx;
  } else {
    throw new RPLError("DO/UNTIL without END");
  }
  let iterations = 0;
  while (true) {
    if (++iterations > MAX_LOOP_ITERATIONS) {
      throw new RPLError('DO loop iteration limit');
    }
    yield* evalRange(s, toks, openIdx + 1, untilScan.idx, depth + 1);
    yield* evalRange(s, toks, untilScan.idx + 1, endIdx, depth + 1);
    const test = s.pop();
    if (isTruthy(test)) break;
  }
  return autoClosed ? bound : endIdx + 1;
}


function* runStart(s, toks, openIdx, depth) {
  // <start> <end> START <body> NEXT | STEP
  //
  // Auto-close policy (mirrors IF / IFERR / CASE / WHILE / DO): a
  // forward scan that falls off the end of the token list is treated
  // as an implicit NEXT (step = 1).  So
  //   « 1 5 START body »          runs as if the user had written
  //                               « 1 5 START body NEXT ».
  // A spurious END at depth 0 in the closer slot is still a hard
  // error: START has no END closer in HP50, only NEXT / STEP.
  const bound = toks.length;
  const [startVal, endVal] = s.popN(2);
  // Integer-preserving: if both bounds are Integers, keep the counter
  // as BigInt for the duration of the loop.  Otherwise coerce to Real.
  const intMode = isInteger(startVal) && isInteger(endVal);
  const a = intMode ? startVal.value : Number(isInteger(startVal) ? startVal.value : toRealOrThrow(startVal));
  const b = intMode ? endVal.value   : Number(isInteger(endVal)   ? endVal.value   : toRealOrThrow(endVal));
  const closeScan = scanAtDepth0(toks, openIdx + 1, null);
  let closer;
  let closerIdx;
  let autoClosed = false;
  if (!closeScan) {
    closer = 'NEXT';
    closerIdx = bound;
    autoClosed = true;
  } else if (closeScan.kind === 'NEXT' || closeScan.kind === 'STEP') {
    closer = closeScan.kind;
    closerIdx = closeScan.idx;
  } else {
    throw new RPLError("START without NEXT/STEP");
  }
  yield* runLoopBody(s, toks, openIdx + 1, closerIdx, closer, a, b, null, intMode, depth);
  return autoClosed ? bound : closerIdx + 1;
}


function* runFor(s, toks, openIdx, depth) {
  // <start> <end> FOR <var> <body> NEXT | STEP
  //
  // Auto-close policy (mirrors START / IF / IFERR / CASE / WHILE / DO):
  // a forward scan that falls off the end of the token list is treated
  // as an implicit NEXT (step = 1).  So
  //   « 1 5 FOR i body »          runs as if the user had written
  //                               « 1 5 FOR i body NEXT ».
  // A spurious END at depth 0 in the closer slot is still a hard error.
  // A missing FOR variable is still a hard error: there is no sensible
  // default name to bind the counter to.
  const bound = toks.length;
  const [startVal, endVal] = s.popN(2);
  const intMode = isInteger(startVal) && isInteger(endVal);
  const a = intMode ? startVal.value : Number(isInteger(startVal) ? startVal.value : toRealOrThrow(startVal));
  const b = intMode ? endVal.value   : Number(isInteger(endVal)   ? endVal.value   : toRealOrThrow(endVal));
  const varTok = toks[openIdx + 1];
  if (!isName(varTok)) throw new RPLError('FOR needs a name');
  const varName = varTok.id;
  const closeScan = scanAtDepth0(toks, openIdx + 2, null);
  let closer;
  let closerIdx;
  let autoClosed = false;
  if (!closeScan) {
    closer = 'NEXT';
    closerIdx = bound;
    autoClosed = true;
  } else if (closeScan.kind === 'NEXT' || closeScan.kind === 'STEP') {
    closer = closeScan.kind;
    closerIdx = closeScan.idx;
  } else {
    throw new RPLError("FOR without NEXT/STEP");
  }
  // Save any prior binding for this name so we can restore it after the loop.
  const saved = varRecall(varName);
  try {
    yield* runLoopBody(s, toks, openIdx + 2, closerIdx, closer, a, b, varName, intMode, depth);
  } finally {
    if (saved === undefined) varPurge(varName);
    else varStore(varName, saved);
  }
  return autoClosed ? bound : closerIdx + 1;
}


/* Safety net: HP50 has no hard iteration cap, but we do — a runaway
   loop inside a scheduled run would hang the shell.  1_000_000 is
   far higher than any sane user program and low enough to recover. */
const MAX_LOOP_ITERATIONS = 1_000_000;


/** Run the body of a counter-based loop (START or FOR).
 *
 *    bodyFrom, bodyTo: token range [from, to) to re-run each iteration.
 *    closer:           'NEXT' (step == 1) or 'STEP' (pop step each iter).
 *    startVal, endVal: numeric start and inclusive end of the counter.
 *                      In `intMode`, both are BigInts; otherwise Numbers.
 *    varName:          loop variable name, or null for START (no var).
 *    intMode:          true when both bounds came in as Integers and the
 *                      counter should stay a BigInt for the loop body.
 *                      A Real step at that point demotes the loop to
 *                      real-mode on the fly (matches how HP50 promotes
 *                      the counter when a Real STEP is popped).
 *
 *  HP50 STEP loops terminate when the counter has moved past endVal in
 *  the step's direction; a positive step stops at counter > endVal,
 *  a negative step stops at counter < endVal.  A zero step, as on the
 *  real machine, is an infinite loop — we throw instead. */
function* runLoopBody(s, toks, bodyFrom, bodyTo, closer, startVal, endVal, varName, intMode, depth) {
  let counter = startVal;
  let bound   = endVal;
  let mode    = intMode;            // may flip to false if a Real STEP arrives
  const ZERO  = 0n;
  let iterations = 0;
  while (true) {
    if (++iterations > MAX_LOOP_ITERATIONS) {
      throw new RPLError('Loop iteration limit');
    }
    if (varName !== null) {
      varStore(varName, mode ? Integer(counter) : Real(counter));
    }
    yield* evalRange(s, toks, bodyFrom, bodyTo, depth + 1);
    let step;
    if (closer === 'STEP') {
      const stepVal = s.pop();
      if (mode && isInteger(stepVal)) {
        step = stepVal.value;                 // BigInt step, stay in int-mode
      } else {
        // Any non-Integer step demotes the whole loop to real-mode for the
        // rest of its life, matching HP50's Real/Integer blending.
        if (mode) {
          counter = Number(counter);
          bound   = Number(bound);
          mode    = false;
        }
        step = Number(isInteger(stepVal) ? stepVal.value : toRealOrThrow(stepVal));
      }
      if (mode ? step === ZERO : step === 0) throw new RPLError('STEP of 0');
    } else {
      step = mode ? 1n : 1;
    }
    counter = mode ? (counter + step) : (counter + step);
    const over = mode
      ? (step > ZERO ? counter > bound : counter < bound)
      : (step > 0     ? counter > bound : counter < bound);
    if (over) break;
  }
}


/** Built-in numeric constants — only folded in APPROX mode.  PI and E
 *  live here rather than as ordinary variable bindings because they are
 *  not user-owned and should stay symbolic under EXACT. */
/** Built-in symbolic constants.  The keys are spellings the user may
 *  type (parser and keypad both emit Name tokens with these ids) and
 *  the values are the RPL objects they fold to under APPROX / →NUM.
 *
 *  Case handling: we try the literal key first so we can distinguish
 *  Greek `π` from Latin `PI`, then fall back to the uppercased key so
 *  'pi', 'Pi', 'PI' all resolve.
 *
 *  The AST-level partial evaluator (algebraEvalAst) can only inline
 *  Real numbers, so `I`/`i` won't fold inside a larger symbolic
 *  expression — they stay as Names there.  The top-level EVAL path
 *  pushes the Complex directly, which is what the user sees when they
 *  type `'i' →NUM`. */
const SYM_CONSTANTS = Object.freeze({
  // --- Math constants --------------------------------------------
  PI:   Real(Math.PI),
  'π':  Real(Math.PI),
  'Π':  Real(Math.PI),
  E:    Real(Math.E),
  I:    Complex(0, 1),
  i:    Complex(0, 1),
  // MAXR / MINR are NOT here — they depend on the runtime realMaxExp
  // setting and are resolved dynamically in _symConstantRpl() below.
  // --- HP50 CONSTANTS-library physical constants -----------------
  // CODATA-2018 / SI-redefinition-2019 values; no units attached —
  // the fold produces a plain Real, matching how `e` behaves.  If
  // you need dimensional arithmetic, reach for the →UNIT/CONVERT
  // family after folding.  A user who wants one of these names as
  // a free symbolic variable can flip to EXACT mode (flag -105
  // CLEAR) and constants stop folding.
  c:    Real(299792458),              // speed of light, m/s (exact)
  h:    Real(6.62607015e-34),         // Planck constant, J·s (exact)
  'ħ':  Real(1.054571817e-34),        // reduced Planck (h / 2π)
  G:    Real(6.67430e-11),            // gravitational constant, m³/(kg·s²)
  g:    Real(9.80665),                // standard gravity, m/s² (exact)
  NA:   Real(6.02214076e23),          // Avogadro, /mol (exact)
  k:    Real(1.380649e-23),           // Boltzmann, J/K (exact)
  R:    Real(8.314462618),            // universal gas constant, J/(mol·K)
  Vm:   Real(0.02271095464),          // molar volume (STP), m³/mol
  'σ':  Real(5.670374419e-8),         // Stefan-Boltzmann, W/(m²·K⁴)
  'ε0': Real(8.8541878128e-12),       // vacuum permittivity, F/m
  'μ0': Real(1.25663706212e-6),       // vacuum permeability, N/A²
  q:    Real(1.602176634e-19),        // elementary charge, C (exact)
  me:   Real(9.1093837015e-31),       // electron rest mass, kg
  mp:   Real(1.67262192369e-27),      // proton rest mass, kg
  mn:   Real(1.67492749804e-27),      // neutron rest mass, kg
  F:    Real(96485.33212),            // Faraday, C/mol (= NA·q)
  'α':  Real(7.2973525693e-3),        // fine-structure, dimensionless
  // `re` (classical electron radius) deliberately omitted: name
  // uppercases to RE, which is the registered complex-real-part op.
  // Entry's bare-name dispatch runs the op before EVAL / →NUM ever
  // gets to fold the constant, so keeping both meanings would just
  // silently shadow RE.  Users who want the value can type it.
  a0:   Real(5.29177210903e-11),      // Bohr radius, m
  'μB': Real(9.2740100783e-24),       // Bohr magneton, J/T
  'μN': Real(5.0507837461e-27),       // nuclear magneton, J/T
  Rinf: Real(10973731.568160),        // Rydberg, /m (exact)
  'λc': Real(2.42631023867e-12),      // Compton wavelength, m
  'γe': Real(1.76085963023e11),       // electron gyromagnetic ratio, /(s·T)
  Z0:   Real(376.730313668),          // impedance of free space, Ω
  atm:  Real(101325),                 // standard atmosphere, Pa (exact)
  T0:   Real(273.15),                 // standard temperature, K (exact)
});

function _symConstantRpl(name) {
  if (!name) return undefined;
  // MAXR / MINR are dynamic — they derive from the current realMaxExp
  // setting so they can't live in the frozen SYM_CONSTANTS map.
  const upper = String(name).toUpperCase();
  if (upper === 'MAXR') {
    const e = getRealMaxExp();
    return Real(new Decimal(`9.99999999999e+${e}`));
  }
  if (upper === 'MINR') {
    const e = getRealMaxExp();
    return Real(new Decimal(`1e-${e}`));
  }
  if (Object.prototype.hasOwnProperty.call(SYM_CONSTANTS, name)) {
    return SYM_CONSTANTS[name];
  }
  if (Object.prototype.hasOwnProperty.call(SYM_CONSTANTS, upper)) {
    return SYM_CONSTANTS[upper];
  }
  return undefined;
}

/** Narrow helper for the AST evaluator — only returns a finite Number
 *  (i.e. a Real constant).  Complex constants can't be represented in
 *  an AstNum, so they stay symbolic during partial evaluation. */
function _symConstantValue(name) {
  const v = _symConstantRpl(name);
  if (v && v.type === 'real' && v.value.isFinite()) return v.value.toNumber();
  return undefined;
}


/** Drive an evalRange generator to completion synchronously.
 *  If the generator yields — meaning a HALT was encountered inside a
 *  sub-program reached through a sync-path caller (IFT / IFTE / MAP /
 *  SEQ body / DOLIST / DOSUBS / STREAM / → algebraic body / the
 *  `_evalValueSync` Name-and-Tagged recursion that those ops trigger)
 *  rather than through the lift-enabled `_evalValueGen` path — close
 *  the generator (so its `finally` blocks run, including any
 *  `_popLocalFrame()` from an enclosing `runArrow`) and then throw.
 *  Program-in-variable calls reached via `evalToken`'s Name-binding
 *  branch do NOT come through this path — that path runs through
 *  `_evalValueGen`, which `yield*`s the nested evalRange up to the
 *  top-level EVAL/CONT driver so HALT suspends cleanly.  Everything
 *  reached via `_evalValueSync` still rejects here.
 *
 *  `caller`, when supplied, is baked into the error message so the
 *  user learns which op blocked the HALT (e.g. "IFT action", "MAP
 *  program") rather than just "a sub-program call".  Callers with no
 *  useful label (the recursive Name/Tagged path inside
 *  `_evalValueSync`) pass `caller` through unchanged so the outermost
 *  originator's label sticks.
 *
 *  We close the generator (`gen.return()`) before throwing so its
 *  `finally` blocks run and the generator object is reclaimed promptly
 *  rather than waiting on GC.  The outer EVAL handler's
 *  `finally { _truncateLocalFrames(framesAtEntry) }` is the backstop
 *  that restores the compiled-local frame depth in any abnormal
 *  unwind. */
export function _driveGen(gen, caller) {
  const result = gen.next();
  if (!result.done) {
    try { gen.return(); } catch (_) { /* ignore */ }
    const where = caller ? caller : 'a sub-program call';
    throw new RPLError(`HALT: cannot suspend inside ${where}`);
  }
}


/** Generator-flavored evaluator for Name-lookup-reached values.
 *  Reachable via `evalToken`'s Name-binding path (and its own recursion
 *  on nested Names / Tagged wrappers), and driven directly by the
 *  top-level EVAL handler so HALT lifts through Tagged-wrapped Programs
 *  and through Name values EVAL'd off the stack.  Other ops that take
 *  a Program argument (IFT / IFTE / MAP / SEQ / …) still use
 *  `_evalValueSync`, which rejects HALT via `_driveGen`.
 *
 *  For Program values this delegates to `evalRange` with `yield*`,
 *  propagating any HALT up through `evalToken` → `evalRange` (the outer
 *  one) → the EVAL/CONT driver that stores the live generator on
 *  `haltedStack`.  Non-program cases fall back to `_evalValueSync`
 *  (they cannot yield, so the sync call is exactly equivalent).
 *
 *  `isSubProgram` (default true) controls whether the Program branch
 *  flips `_insideSubProgram` for the duration of the body.  Sub-program
 *  callers (evalToken Name lookup, recursive Tagged/Name unwraps reached
 *  from within a token stream) keep the default — SST-step-over should
 *  run the body in one step.  The top-level EVAL handler passes false:
 *  the body is the *outer* program from the SST/DBUG point of view, so
 *  it must yield per token regardless of `_stepInto`.  Tagged unwraps
 *  and Name recursions preserve the parameter so a Name on the stack
 *  pointing at a Tagged-wrapped Program still respects the entry-point
 *  classification. */
export function* _evalValueGen(s, v, depth, isSubProgram = true) {
  if (depth > MAX_EVAL_DEPTH) {
    throw new RPLError('EVAL recursion too deep');
  }

  if (isProgram(v)) {
    if (isSubProgram) {
      // Track that we're now inside a sub-program call so the body's own
      // post-token yields can consult `_stepInto` (see `_shouldStepYield`
      // in evalRange / runControl / runArrow tails).  We don't mutate
      // `_singleStepMode` itself — a stale `gen.return()` (e.g. KILL during
      // step-into) would otherwise run the finally and clobber the outer
      // flag.  Flipping `_insideSubProgram` instead keeps the sub-program
      // boundary a pure read-only predicate from the outer caller's side.
      const priorInside = _insideSubProgram;
      _insideSubProgram = true;
      try {
        yield* evalRange(s, v.tokens, 0, v.tokens.length, depth);
      } finally {
        _insideSubProgram = priorInside;
      }
    } else {
      // Top-level entry — `_insideSubProgram` stays whatever the caller
      // set it to (typically false).  evalRange's per-token yield is
      // controlled solely by `_singleStepMode` here.
      yield* evalRange(s, v.tokens, 0, v.tokens.length, depth);
    }
    return;
  }

  if (isName(v)) {
    if (getApproxMode()) {
      const crpl = _symConstantRpl(v.id);
      if (crpl !== undefined) { s.push(crpl); return; }
    }
    if (v.quoted) { s.push(v); return; }
    const localVal = _localLookup(v.id);
    if (localVal !== undefined) {
      yield* _evalValueGen(s, localVal, depth + 1, isSubProgram);
      return;
    }
    const bound = varRecall(v.id);
    if (bound !== undefined) {
      yield* _evalValueGen(s, bound, depth + 1, isSubProgram);
    } else {
      s.push(v);
    }
    return;
  }

  if (isTagged(v)) {
    // Deliberate deviation from HP50 AUR §3-77: HP50 EVAL on a
    // (non-port) Tagged value just pushes the untagged inner value
    // without further evaluation.  rpl5050 recurse-EVALs the inner
    // value so HALT/PROMPT inside a Tagged-wrapped Program suspends
    // cleanly through both the wrapper and the program body.
    // See test-control-flow.mjs HALT-through-Tagged tests for the
    // contract this branch upholds.
    yield* _evalValueGen(s, v.value, depth + 1, isSubProgram);
    return;
  }

  if (isList(v)) {
    // HP50 AUR §3-77: EVAL on a List enters each object — names
    // evaluated, commands evaluated, programs evaluated, other
    // objects pushed.  Note this differs from Program EVAL (where
    // an embedded Program is pushed as a literal): List EVAL
    // explicitly RUNS embedded Programs.
    //
    // Implementation: walk each item.  Names go through evalToken
    // (built-in op dispatch + local/global var lookup, matching
    // program-body semantics).  Programs and Tagged values recurse
    // through _evalValueGen (Tagged honors the HALT-through-wrappers
    // deviation noted above).  Everything else pushes literally.
    // HALT/PROMPT inside a list item lifts cleanly via `yield*`.
    for (const item of v.items) {
      if (isName(item)) {
        yield* evalToken(s, item, depth);
      } else if (isProgram(item) || isTagged(item)) {
        yield* _evalValueGen(s, item, depth + 1, isSubProgram);
      } else {
        s.push(item);
      }
    }
    return;
  }

  // Symbolic / numeric / string / container / …: synchronous, cannot
  // HALT.  Delegate to `_evalValueSync` for value-type-specific
  // semantics (AST reduction, unit pass-through, etc.) — it won't
  // reach the Program branch (we've already handled that above) so
  // `_driveGen` is not invoked.
  _evalValueSync(s, v, depth);
}


/** Evaluate an arbitrary value synchronously.  Used by all callers
 *  OTHER than the top-level EVAL/CONT handlers; those use the generator
 *  path directly so that HALT can yield through structural control flow.
 *  Delegates Program evaluation to evalRange via _driveGen (which
 *  rejects a HALT with a clear error rather than leaving the caller
 *  in an undefined state).
 *
 *  `caller` is an optional label passed through to `_driveGen` so a
 *  rejected HALT names the op at the boundary (e.g. "IFT action",
 *  "MAP program").  Internal recursion on Name/Tagged wrappers
 *  forwards the original label unchanged so the outermost originator's
 *  name reaches the error message. */
function _evalValueSync(s, v, depth, caller) {
  if (depth > MAX_EVAL_DEPTH) {
    throw new RPLError('EVAL recursion too deep');
  }

  if (isProgram(v)) {
    _driveGen(evalRange(s, v.tokens, 0, v.tokens.length, depth), caller);
    return;
  }

  if (isName(v)) {
    // In APPROX mode (incl. the →NUM span), built-in constants like PI
    // and E resolve to their numeric value even when tick-quoted —
    // `'PI' →NUM` should give 3.14159….  EXACT keeps them symbolic so
    // `'PI' EVAL` round-trips.
    if (getApproxMode()) {
      const crpl = _symConstantRpl(v.id);
      if (crpl !== undefined) { s.push(crpl); return; }
    }
    // A quoted Name stays a Name — EVAL on `'X'` is a no-op, same as on
    // a number or string.  This is what lets `'X' EVAL` round-trip.
    if (v.quoted) { s.push(v); return; }
    // Compiled-local bindings shadow globals.
    const localVal = _localLookup(v.id);
    if (localVal !== undefined) {
      _evalValueSync(s, localVal, depth + 1, caller);
      return;
    }
    const bound = varRecall(v.id);
    if (bound !== undefined) {
      _evalValueSync(s, bound, depth + 1, caller);
    } else {
      s.push(v);
    }
    return;
  }

  if (isTagged(v)) {
    // See _evalValueGen's Tagged comment — deliberate deviation from
    // HP50 AUR §3-77 to support HALT-through-Tagged.
    _evalValueSync(s, v.value, depth + 1, caller);
    return;
  }

  if (isList(v)) {
    // HP50 AUR §3-77: EVAL on a List enters each object — names
    // evaluated, commands evaluated, programs evaluated, others
    // pushed.  Sync path: same dispatch as the generator version
    // above, but Names go through `_driveGen(evalToken(...))` so a
    // HALT/PROMPT inside a list item is rejected with a clear error
    // (matching the Program sync-fallback behavior at the top of
    // this function).  Programs and Tagged values recurse through
    // `_evalValueSync` (which itself drives evalRange via _driveGen
    // for Programs).
    for (const item of v.items) {
      if (isName(item)) {
        _driveGen(evalToken(s, item, depth), caller);
      } else if (isProgram(item) || isTagged(item)) {
        _evalValueSync(s, item, depth + 1, caller);
      } else {
        s.push(item);
      }
    }
    return;
  }

  // Symbolic: EVAL attempts to numerically reduce the AST by
  // substituting any bound variables in the active directory and
  // evaluating function calls in the active angle mode.
  //
  //   1. Walk the AST with algebraEvalAst:
  //      - Var(X) → Num(lookup(X)) when X resolves to a real-valued
  //                 binding (Real or Integer); else left symbolic.
  //      - Fn(SIN, [u]) → SIN evaluated in the current angle mode,
  //        provided u evaluates to a Num.  LN/EXP/LOG/SQRT/ABS go
  //        through the mode-independent eval in KNOWN_FUNCTIONS.
  //      - Bin nodes fold when both children are Num.
  //   2. If the result is a lone Num AST, push a Real.
  //   3. Otherwise wrap the (possibly partially-reduced) AST back in
  //      a Symbolic and push that — EVAL is best-effort, not all-or-
  //      nothing.
  //
  // This matches HP50 behavior: `'X^2+1' EVAL` with X stored leaves a
  // number; `'X+Y' EVAL` with only X stored leaves `'5 + Y'` (or the
  // like) on the stack.
  if (isSymbolic(v)) {
    const approx = getApproxMode();
    const lookup = (name) => {
      // Compiled-local bindings shadow globals so that an algebraic
      // body under `→ a b 'a+b'` resolves a/b against the frame
      // pushed by runArrow.
      const localVal = _localLookup(name);
      if (localVal !== undefined) {
        if (isReal(localVal)) return localVal.value.toNumber();
        if (isInteger(localVal)) return Number(localVal.value);
        return null;
      }
      const bound = varRecall(name);
      if (bound !== undefined) {
        if (isReal(bound)) return bound.value.toNumber();
        if (isInteger(bound)) return Number(bound.value);
        return null;
      }
      // Built-in constants resolve only in APPROX mode — EXACT keeps
      // them symbolic so `'SIN(PI/4)' EVAL` stays as a Symbolic.
      if (approx) {
        const cval = _symConstantValue(name);
        if (cval !== undefined) return cval;
      }
      return null;
    };
    // In EXACT mode, thread the approx gate through so pure-numeric
    // Bin folds that produce a non-integer result are left symbolic
    // (`'1/3'` stays as '1/3', not 0.333…).  In APPROX, no gate → fold
    // everything.
    const binGate = approx
      ? null
      : (_op, args, result) => _approxGate(result, args);
    const reduced = algebraEvalAst(v.expr, lookup, _angleAwareFnEval, binGate);
    if (reduced && reduced.kind === 'num') {
      s.push(Real(reduced.value));
    } else {
      s.push(Symbolic(reduced));
    }
    return;
  }

  // EVAL on a Directory navigates into it (same semantics as pressing
  // the VARS soft-key for that directory).  Applies both when the user
  // evaluates a Name bound to a directory (varRecall resolves, then
  // this recurses with the Directory value) and when a raw directory
  // value is already on the stack.
  if (isDirectory(v)) {
    enterDirectory(v);
    return;
  }

  // Numeric / String / Vector / Matrix — EVAL is a no-op push per
  // AUR §3-77's "Other Objects" rule (List has its own branch above
  // that evaluates each item HP50-style).
  s.push(v);
}


/** Angle-mode-aware numeric evaluator for Fn nodes used by Symbolic
 *  EVAL.  Applies SIN/COS/TAN in the active angle mode via toRadians;
 *  ASIN/ACOS/ATAN return their answers in the active mode via
 *  fromRadians.  Everything else falls back to the mode-independent
 *  table in algebra.js.
 *
 *  Honors the EXACT/APPROX flag.  APPROX returns whatever JS Math
 *  produces; EXACT returns null (→ leave symbolic) unless the
 *  computation stays entirely in integer-land — every arg is integer,
 *  and the result is integer within 1e-12.  So `SQRT(9) → 3` folds
 *  under EXACT but `SQRT(2)` stays as `'SQRT(2)'`.  Rationale: HP50
 *  EXACT mode avoids lossy decimal folding; we approximate that by
 *  only allowing folds whose result is exact in `double`. */
function _approxGate(result, args) {
  if (getApproxMode()) return result;                 // APPROX — fold freely
  if (result === null || result === undefined) return result;
  if (!Number.isFinite(result)) return result;
  // EXACT: fold only if every input is integer AND the result is
  // (numerically) integer — captures SQRT(9)=3, LN(1)=0, EXP(0)=1,
  // SIN(0)=0, etc. while keeping SQRT(2), LN(2), PI(), SIN(30)-in-DEG
  // symbolic.
  const allIntArgs = args.every(a => Number.isFinite(a) && Math.abs(a - Math.round(a)) < 1e-12);
  if (!allIntArgs) return null;
  const rounded = Math.round(result);
  if (Math.abs(result - rounded) < 1e-12) return rounded;
  return null;
}

function _angleAwareFnEval(name, args) {
  if (args.length === 1) {
    const x = args[0];
    let result;
    switch (String(name).toUpperCase()) {
      case 'SIN':  result = Math.sin(toRadians(x)); return _approxGate(result, args);
      case 'COS':  result = Math.cos(toRadians(x)); return _approxGate(result, args);
      case 'TAN':  result = Math.tan(toRadians(x)); return _approxGate(result, args);
      case 'ASIN': result = fromRadians(Math.asin(x)); return _approxGate(result, args);
      case 'ACOS': result = fromRadians(Math.acos(x)); return _approxGate(result, args);
      case 'ATAN': result = fromRadians(Math.atan(x)); return _approxGate(result, args);
    }
  }
  const raw = algebraDefaultFnEval(name, args);
  return _approxGate(raw, args);
}


/* ------------------------------------------------------------------
   Comparison + logic ops.

   Booleans are HP50-style Reals: 0. / 1.  Comparison ops accept any
   two numeric operands (Real, Integer, Complex with both imaginary
   parts zero).  AND/OR/XOR/NOT treat any non-zero as true; NOT of 0
   is 1, NOT of anything else is 0.

   Registered canonical names + ASCII aliases so a user typing on a
   physical keyboard (no ≠ / ≤ / ≥ glyphs) can still reach them.
   ------------------------------------------------------------------ */

function popNumericPair(s) {
  const [a, b] = s.popN(2);
  if (!isNumber(a) || !isNumber(b)) throw new RPLError('Bad argument type');
  return promoteNumericPair(a, b);
}


/** Numeric-only matrix inverse via Gauss-Jordan with partial pivoting.
 *  Returns a new array-of-arrays of Real values.  Throws on singular
 *  and on non-numeric entries (symbolic matrix inverse is beyond the
 *  scope of this pass — we document the limitation in the ops.js
 *  block comment above). */
export function _invMatrixNumeric(rows) {
  const n = rows.length;
  for (const row of rows) {
    if (row.length !== n) throw new RPLError('Invalid dimension');
    for (const x of row) {
      if (!isReal(x) && !isInteger(x)) throw new RPLError('Bad argument type');
    }
  }
  // Convert to plain JS numbers and build augmented [A | I].
  const a = rows.map(row => row.map(x => isInteger(x) ? Number(x.value) : x.value));
  const I = [];
  for (let i = 0; i < n; i++) {
    const row = new Array(n).fill(0);
    row[i] = 1;
    I.push(row);
  }
  for (let k = 0; k < n; k++) {
    // Partial pivot: find max |a[i][k]| for i >= k.
    let best = k, bestAbs = Math.abs(a[k][k]);
    for (let i = k + 1; i < n; i++) {
      const v = Math.abs(a[i][k]);
      if (v > bestAbs) { best = i; bestAbs = v; }
    }
    if (bestAbs === 0) throw new RPLError('Infinite result');
    if (best !== k) {
      [a[k], a[best]] = [a[best], a[k]];
      [I[k], I[best]] = [I[best], I[k]];
    }
    const piv = a[k][k];
    for (let j = 0; j < n; j++) { a[k][j] /= piv; I[k][j] /= piv; }
    // Eliminate all other rows.
    for (let i = 0; i < n; i++) {
      if (i === k) continue;
      const f = a[i][k];
      if (f === 0) continue;
      for (let j = 0; j < n; j++) {
        a[i][j] -= f * a[k][j];
        I[i][j] -= f * I[k][j];
      }
    }
  }
  return I.map(row => row.map(x => Real(x)));
}


/* ================================================================
   List ops: GET / PUT / HEAD / TAIL / SUB
             →LIST / LIST→ / POS
   Stored-var arithmetic: STO+ / STO- / STO* / STO/
   Reflection: TYPE / OBJ→

   User Guide refs: §3 (Lists) and §2 (Types / OBJ→).

   List-ops design notes
   ---------------------
   All indices are 1-based to match HP50 convention.  Invalid indices
   throw `Bad argument value` (matches HP50 "Invalid Dimension").

   GET / PUT overload:
     list      n          →  element              (GET)
     vector    n          →  element
     matrix    {row col}  →  element              (row col = 2-element list)
     string    n          →  1-char string

     list      n val      →  list'                (PUT)
     vector    n val      →  vector'
     matrix    {r c} val  →  matrix'

   HEAD / TAIL take a list or string.  TAIL of a length-1 list is
   the empty list (HP50 behavior).

   SUB is inclusive; m > len and n > len clamp to len.  m > n yields
   an empty slice.

   →LIST / LIST→ accept / produce a Real or Integer count marker.
   Both ASCII (`->LIST` / `LIST->`) and Unicode aliases register.

   POS returns an Integer index, 0 when not found.  String-in-string
   POS uses JS `indexOf` for substring match; list POS compares items
   structurally via a recursive `_rplEqual` that matches HP50's SAME.
   ================================================================ */

// Coerce a Real/Integer/BinaryInteger to a 1-based integer index.
// Rejects non-ints, negatives, and zero — matches HP50 "Bad Argument
// Type" for anything that isn't a plain non-negative whole number.
//
// BinaryInteger branch matches the BinInt widening that
// `_toCountIdx` (→PRG, →STREAM, etc.) has.  `→LIST 3 ENTER #3h ENTER`
// behaves identically to `→LIST 3 ENTER 3 ENTER` — BinInt is a
// first-class integer type throughout the stack.
export function _toIntIdx(v) {
  if (isInteger(v)) {
    const n = Number(v.value);
    if (n < 1 || !Number.isFinite(n)) throw new RPLError('Bad argument value');
    return n;
  }
  if (isReal(v)) {
    if (!v.value.isInteger()) throw new RPLError('Bad argument value');
    const n = v.value.toNumber();
    if (n < 1) throw new RPLError('Bad argument value');
    return n;
  }
  if (isBinaryInteger(v)) {
    const n = Number(v.value);
    if (n < 1 || !Number.isFinite(n)) throw new RPLError('Bad argument value');
    return n;
  }
  throw new RPLError('Bad argument type');
}


// Same as _toIntIdx but permits 0 (used by counts like →LIST N).
// BinaryInteger branch added for parity with →PRG.
export function _toCountN(v) {
  if (isInteger(v)) {
    const n = Number(v.value);
    if (n < 0 || !Number.isFinite(n)) throw new RPLError('Bad argument value');
    return n;
  }
  if (isReal(v)) {
    if (!v.value.isInteger()) throw new RPLError('Bad argument value');
    const n = v.value.toNumber();
    if (n < 0) throw new RPLError('Bad argument value');
    return n;
  }
  if (isBinaryInteger(v)) {
    const n = Number(v.value);
    if (n < 0 || !Number.isFinite(n)) throw new RPLError('Bad argument value');
    return n;
  }
  throw new RPLError('Bad argument type');
}


// →LIST (and ASCII ->LIST alias): `x1 x2 … xn n → { x1 x2 … xn }`.
export const _toListOp = (s) => {
  const nVal = s.pop();
  const n = _toCountN(nVal);
  if (n === 0) { s.push(RList([])); return; }
  const items = s.popN(n);
  s.push(RList(items));
};


// LIST→ (and ASCII LIST-> alias): `{ x1 … xn } → x1 … xn n`.
export const _fromListOp = (s) => {
  const [l] = s.popN(1);
  if (!isList(l)) throw new RPLError('Bad argument type');
  for (const item of l.items) s.push(item);
  s.push(Integer(BigInt(l.items.length)));
};


/* ----------------------------------------------------------------
   TYPE — returns the HP50 type code of the object on level 1.

   Our internal type set doesn't line up perfectly with the HP50's
   numeric catalogue (we don't distinguish real arrays from complex
   arrays, we merge Vector/Matrix into "array" = 3, and our arbitrary-
   precision Integer maps to HP50's ZINT = 28).  The mapping below
   favors the most commonly-used User-RPL numbers and matches what
   programs typically branch on.

   Codes follow HP50 User Guide §2 (Object types):
      0  Real
      1  Complex
      2  String
      3  Real array
      4  Complex array
      5  List
      6  Global name
      7  Local name
      8  Program
      9  Algebraic
     10  Binary integer
     11  Graphics object (grob)
     12  Tagged object
     13  Unit
     15  Directory
     28  Integer (ZINT)
   ---------------------------------------------------------------- */
export function _hp50TypeCode(v) {
  if (isReal(v))          return 0;
  if (isComplex(v))       return 1;
  if (isString(v))        return 2;
  if (isVector(v)) {
    // complex array = 4, real array = 3
    return v.items.some(isComplex) ? 4 : 3;
  }
  if (isMatrix(v)) {
    for (const row of v.rows) {
      for (const x of row) if (isComplex(x)) return 4;
    }
    return 3;
  }
  if (isList(v))          return 5;
  if (isName(v))          return v.local ? 7 : 6;
  if (isProgram(v))       return 8;
  if (isSymbolic(v))      return 9;
  if (isBinaryInteger(v)) return 10;
  if (isTagged(v))        return 12;
  if (isUnit(v))          return 13;
  if (isDirectory(v))     return 15;
  if (isInteger(v))       return 28;
  // Grob (not fully wired yet) falls through; return -1 so programs can
  // still test.  HP50 never returns a negative code, but we've got no
  // better answer and this is a cleaner signal than throwing.
  return -1;
}


/* ----------------------------------------------------------------
   →ARRY / ARRY→ — compose and decompose Vector / Matrix on the stack.

   →ARRY (Advanced Guide §13):
     x1 … xn  n        → [ x1 … xn ]            (Integer / Real count → Vector)
     x1 … xn  { n }    → [ x1 … xn ]            (size-list → Vector)
     x1 … xmn {m n}    → [[ x1 … xn ] … ]       (2-elem size-list → Matrix,
                                                 elements row-major)

   The HP50 accepts a bare count on level 1 for vectors; the more
   common form (matching OBJ→'s output) is a 1- or 2-element list.
   Both are accepted here.

   ARRY→ is the inverse.  Identical in behavior to OBJ→ on a Vector /
   Matrix, but registered under its canonical name for programs that
   call it explicitly.  Both Unicode (→ARRY / ARRY→) and ASCII
   (->ARRY / ARRY->) aliases register.
   ---------------------------------------------------------------- */

// Convert a level-1 "dimension spec" to either a 1-elem [n] or
// 2-elem [m,n] integer array.  A bare Real / Integer / BinaryInteger
// → [n].  A List → each item is a positive integer index.
//
// BinaryInteger is accepted as a bare count to match →PRG / →LIST.
// Inside a size-list the branch is `_toIntIdx` which also accepts
// BinInt.
function _toDimSpec(v) {
  if (isInteger(v) || isReal(v) || isBinaryInteger(v)) {
    return [_toIntIdx(v)];
  }
  if (isList(v)) {
    if (v.items.length < 1 || v.items.length > 2) {
      throw new RPLError('Bad argument value');
    }
    return v.items.map(_toIntIdx);
  }
  throw new RPLError('Bad argument type');
}


export const _toArrayOp = (s) => {
  const dimVal = s.pop();
  const dims = _toDimSpec(dimVal);
  if (dims.length === 1) {
    const n = dims[0];
    if (n === 0) { s.push(Vector([])); return; }
    const items = s.popN(n);
    s.push(Vector(items));
    return;
  }
  // 2-D Matrix — m rows, n cols, elements row-major.
  const [m, n] = dims;
  const total = m * n;
  const items = s.popN(total);
  const rows = [];
  for (let r = 0; r < m; r++) {
    rows.push(items.slice(r * n, r * n + n));
  }
  s.push(Matrix(rows));
};


export const _fromArrayOp = (s) => {
  const [v] = s.popN(1);
  if (isVector(v)) {
    for (const item of v.items) s.push(item);
    s.push(RList([Real(v.items.length)]));
    return;
  }
  if (isMatrix(v)) {
    const rows = v.rows.length;
    const cols = rows > 0 ? v.rows[0].length : 0;
    for (const row of v.rows) for (const x of row) s.push(x);
    s.push(RList([Real(rows), Real(cols)]));
    return;
  }
  throw new RPLError('Bad argument type');
};


/* ----------------------------------------------------------------
   →STR / STR→ — object to/from string form.

   HP50 Advanced Guide §4:
     →STR  ( any  →  "text" )  serialise level-1 value to its display form
     STR→  ( "src"  → any… )   parse the source and push each produced value

   →STR uses the shared `format(v)` utility so the resulting string is
   exactly what the formatter would render in STD mode on a non-stack
   context (bare Name stays bare, Symbolic is ticked, etc.).  A Real
   like `3.14` → `"3.14"`, a Name `X` → `"X"`, a Symbolic `'X+1'` →
   `"'X+1'"`.  This matches the HP50 convention of "what you'd see if
   you disassembled the object back to characters".

   STR→ is the inverse: we reuse parseEntry (same path OBJ→ on a
   String uses) and push each parsed value.  Empty string pushes
   nothing (matches OBJ→ convention — and HP50 semantics).  Parse
   errors bubble up as RPLError so IFERR traps work.

   ASCII aliases `->STR` / `STR->` register alongside the Unicode glyphs.
   ---------------------------------------------------------------- */

export const _toStrOp = (s) => {
  const [v] = s.popN(1);
  // Use STD display mode explicitly so the serialized form is stable
  // (independent of any future FIX/SCI/ENG state).  context is left
  // as non-'stack' so Names come out bare unless they were quoted,
  // matching what an OBJ→-then-STR→ round-trip would expect.
  s.push(Str(formatValue(v, DEFAULT_DISPLAY)));
};


export const _fromStrOp = (s) => {
  const [v] = s.popN(1);
  if (!isString(v)) throw new RPLError('Bad argument type');
  const parsed = _parseEntryForObjTo(v.value);
  for (const item of parsed) s.push(item);
};


/* ----------------------------------------------------------------
   V→ / →V2 / →V3 — simple vector compose/decompose companions
   to the →ARRY / ARRY→ family.

   →V2 ( x y → [x y] )        — build 2-vector from two stack scalars
   →V3 ( x y z → [x y z] )    — build 3-vector from three stack scalars
   V→  ( [x1 … xn] → x1 … xn) — decompose vector WITHOUT pushing a
                                size-list (the difference from ARRY→)

   →V2 / →V3 do NOT accept a size-spec and are NOT variadic; they are
   the specialized "two" and "three" forms HP50 exposes on the keypad.
   V→ is the plain decompose — handy when the caller will push a new
   size-list themselves or knows the arity ahead of time.

   ASCII aliases `->V2` / `->V3` / `V->` also register.
   ---------------------------------------------------------------- */

export const _toV2Op = (s) => {
  const [x, y] = s.popN(2);
  s.push(Vector([x, y]));
};


export const _toV3Op = (s) => {
  const [x, y, z] = s.popN(3);
  s.push(Vector([x, y, z]));
};


export const _fromVecOp = (s) => {
  const [v] = s.popN(1);
  if (!isVector(v)) throw new RPLError('Bad argument type');
  for (const item of v.items) s.push(item);
};


/* --------------- Complex decomposition / construction ---------------
   R→C ( x y → (x, y) )
     Build a Complex from two Reals.  Integer input coerces to Real.
     HP50 AUR: "REAL, REAL → COMPLEX".
   C→R ( (x, y) → x y )
     Decompose a Complex into its two Real components (Re on L2, Im on L1).
   Vector branch (HP50 docs §13.6 note): R→C on two real N-vectors
     returns a single N-vector of Complex components; C→R on a complex
     vector returns the two component real vectors.  Implemented so the
     common "assemble a complex vector" workflow works end-to-end.
   ASCII aliases: R->C, C->R  (HP50 user programs without Unicode in
     source).  Real→Real on a real-valued Complex round-trip:
     `(3,4) C→R R→C` gives `(3,4)` back.
   -------------------------------------------------------------- */
function _coerceRealComponent(v) {
  if (isReal(v)) return v.value.toNumber();
  if (isInteger(v)) return Number(v.value);
  throw new RPLError('Bad argument type');
}


export function _rToCOp(s) {
  const im = s.pop();
  const re = s.pop();
  // Vector branch: two real vectors → complex vector of same length.
  if (isVector(re) && isVector(im)) {
    const a = re.items, b = im.items;
    if (a.length !== b.length) throw new RPLError('Invalid dimension');
    const out = [];
    for (let i = 0; i < a.length; i++) {
      out.push(Complex(_coerceRealComponent(a[i]), _coerceRealComponent(b[i])));
    }
    s.push(Vector(out));
    return;
  }
  s.push(Complex(_coerceRealComponent(re), _coerceRealComponent(im)));
}


export function _cToROp(s) {
  const v = s.pop();
  if (isComplex(v)) {
    s.push(Real(v.re));
    s.push(Real(v.im));
    return;
  }
  if (isReal(v) || isInteger(v)) {
    // HP50 permits real input — pushes the value and 0.
    s.push(Real(_coerceRealComponent(v)));
    s.push(Real(0));
    return;
  }
  if (isVector(v)) {
    // Vector of Complex → two vectors of the component reals.
    const re = [], im = [];
    for (const e of v.items) {
      if (isComplex(e))       { re.push(Real(e.re));                    im.push(Real(e.im)); }
      else if (isReal(e))     { re.push(e);                             im.push(Real(0));     }
      else if (isInteger(e))  { re.push(Real(Number(e.value)));         im.push(Real(0));     }
      else throw new RPLError('Bad argument type');
    }
    s.push(Vector(re));
    s.push(Vector(im));
    return;
  }
  throw new RPLError('Bad argument type');
}


/* --------------- HMS family — hours/minutes/seconds ---------------
   HP50 represents a time-of-day / duration value as a decimal number
   formatted HH.MMSSsss — hours in the integer part, minutes (00..59)
   in the first two digits after the decimal, seconds (00..59) in the
   next two, and fractional seconds continuing after that.  So:

       2.3000   → 2h 30m 00s      =  2.5     decimal hours
       1.4530   → 1h 45m 30s      =  1.7583…
       0.0059   → 0h 0m 59s       =  0.01638…

   Sign applies to the whole value; `-1.3000` is "−1h 30m".

     →HMS  ( h      → hms )    decimal hours → HH.MMSS form
     HMS→  ( hms    → h   )    HH.MMSS form → decimal hours
     HMS+  ( a  b   → hms )    add two HMS values (a + b, result HMS)
     HMS-  ( a  b   → hms )    subtract two HMS values (a - b, HMS)

   HP50 AUR p. 3-10.  We reject Complex inputs (Bad argument type) but
   accept Integer (coerces via `toRealOrThrow`).  Fractional seconds
   are preserved out to double precision on the HMS side and
   round-tripped via the decimal-hours form in +/-.

   ASCII aliases registered alongside the Unicode glyph (`->HMS`,
   `HMS->`) to match ops like `→STR`/`->STR` for keyboards without
   direct Unicode entry.
   ----------------------------------------------------------------- */

// Parse HH.MMSS decimal into decimal-hours.  `h` may be negative; we
// work on the absolute value and re-apply the sign at the end.
export function _hmsToHours(h) {
  if (!Number.isFinite(h)) throw new RPLError('Bad argument value');
  const sign = h < 0 ? -1 : 1;
  const x = Math.abs(h);
  const hh = Math.floor(x);
  // The next two digits (minutes) are the integer part of (x - hh) * 100.
  // We intentionally scale with a small epsilon to avoid `1.45` being
  // read as "1h 44m 59.9999…s" due to float noise; this matches HP50's
  // 12-BCD behavior.
  const afterPoint = (x - hh) * 100;
  const mm = Math.floor(afterPoint + 1e-9);
  const ss = (afterPoint - mm) * 100;
  if (mm >= 60) throw new RPLError('Bad argument value');
  if (ss >= 60) throw new RPLError('Bad argument value');
  return sign * (hh + mm / 60 + ss / 3600);
}


// Format a decimal-hours value as HH.MMSSsss.  Keeps fractional seconds
// beyond 4 decimal places by preserving the ss as a true JS number.
export function _hoursToHms(hours) {
  if (!Number.isFinite(hours)) throw new RPLError('Bad argument value');
  const sign = hours < 0 ? -1 : 1;
  const x = Math.abs(hours);
  const hh = Math.floor(x);
  const minsPart = (x - hh) * 60;
  const mm = Math.floor(minsPart + 1e-12);
  const ss = (minsPart - mm) * 60;
  // Assemble HH.MMSSsss.  Use string assembly for the integer minutes
  // part so leading zeros stay in the right position (`2.0530` not
  // `2.0053`).
  const mmStr = String(mm).padStart(2, '0');
  // Seconds: need two integer digits + fractional tail.  Compute
  // numerically then format: HH + (mm*100 + ss) / 10000.
  const combined = hh + (mm * 100 + ss) / 10000;
  return sign * combined;
}


export function _hmsUnary(name, fn) {
  return (s) => {
    const v = s.pop();
    if (isComplex(v)) throw new RPLError('Bad argument type');
    const x = toRealOrThrow(v);
    s.push(Real(fn(x)));
  };
}


/* --------------- MAP — list/vector/matrix combinator ---------------
   HP50 AUR §15.  `MAP` applies a program (or quoted name) to each
   element of a list, vector or matrix, returning a new container of
   the same kind and shape with the result of each application.

     MAP  ( { a1 a2 … } prog → { prog(a1) prog(a2) … } )
     MAP  ( [ a1 a2 … ] prog → [ prog(a1) prog(a2) … ] )
     MAP  ( [[ a b ] [ c d ]] prog → [[ prog(a) prog(b) ] …] )

   `prog` may be a Program, a Symbolic expression, or a Name (whose
   binding must itself be a Program).  Each invocation must leave
   exactly one net result on top of the stack — a delta other than +1
   throws 'MAP: bad program'.

   Errors inside `prog` propagate unchanged (the stack is left with
   whatever partial work had completed — matches HP50 behavior; MAP is
   not transactional on real firmware either).  Non-container top-of-
   stack throws 'Bad argument type'.
   ---------------------------------------------------------------- */
// Generator flavor — yieldable per-iteration evaluation so a
// HALT/PROMPT inside `prog` lifts cleanly through the `evalRange`
// body intercept.  Mirrors the IFT/IFTE pattern.  The sync
// `_mapOneValue` helper below stays on as a sync analogue for any
// future op that wants the same shape without committing to a
// generator caller.
function* _mapOneValueGen(s, prog, e, depth) {
  const before = s.depth;
  s.push(e);
  yield* _evalValueGen(s, prog, depth + 1);
  const delta = s.depth - before;
  if (delta !== 1) {
    // Match the sync helper's error: a non-+1 delta is a programming
    // bug in `prog`, not a recoverable runtime condition.  See the
    // comment in `_mapOneValue` below for why we don't try to undo
    // the partial effect.
    throw new RPLError('MAP: bad program');
  }
  return s.pop();
}


function _mapOneValue(s, prog, e) {
  const before = s.depth;
  s.push(e);
  _evalValueSync(s, prog, 0, 'MAP program');
  const delta = s.depth - before;
  if (delta !== 1) {
    // Undo any partial effect so the error message is actionable.
    // We can't really roll back the user's data, but we can pop any
    // surplus so the stack is well-formed for the caller.
    throw new RPLError('MAP: bad program');
  }
  return s.pop();
}


/* MAP — generator flavor.
 *
 * `evalRange` intercepts the MAP token and delegates here so a HALT or
 * PROMPT inside the per-element `prog` body suspends through the same
 * `yield` channel HALT itself uses.  The accumulator (`out`, `rows`,
 * `newRow`) lives in this generator's stack frame, so a CONT after a
 * mid-iteration HALT resumes inside the same iteration with the
 * already-mapped prefix intact.  When the generator finally returns,
 * the resulting container is pushed onto the stack.
 *
 * Iteration order: list → left-to-right; vector → left-to-right;
 * matrix → row-major (whole row 0 before row 1).  An iteration that
 * yields mid-element preserves the *partial-row* state too — `newRow`
 * is closed over by the inner for-loop, so CONT picks up at element K
 * of the row in flight.
 *
 * The `register('MAP', ...)` handler below stays as a sync fallback
 * for the rare path where MAP is reached via Name dispatch
 * (`'MAP' EVAL`, Tagged-wrapped `Name('MAP')`).  Sync drives this same
 * generator through `_driveGen`, which rejects a HALT with
 * `HALT: cannot suspend inside MAP program`.
 */
export function* runMap(s, depth) {
  if (s.depth < 2) throw new RPLError('Too few arguments');
  const prog = s.pop();
  const obj  = s.pop();
  if (!isProgram(prog) && !isName(prog) && !isSymbolic(prog)) {
    throw new RPLError('Bad argument type');
  }
  if (isList(obj)) {
    const out = [];
    for (const e of obj.items) out.push(yield* _mapOneValueGen(s, prog, e, depth));
    s.push(RList(out));
    return;
  }
  if (isVector(obj)) {
    const out = [];
    for (const e of obj.items) out.push(yield* _mapOneValueGen(s, prog, e, depth));
    s.push(Vector(out));
    return;
  }
  if (isMatrix(obj)) {
    const rows = [];
    for (const row of obj.rows) {
      const newRow = [];
      for (const e of row) newRow.push(yield* _mapOneValueGen(s, prog, e, depth));
      rows.push(newRow);
    }
    s.push(Matrix(rows));
    return;
  }
  throw new RPLError('Bad argument type');
}


/* =================================================================
   List combinators (SEQ, DOLIST, DOSUBS, STREAM),
   Complex-aware unary math (LN / LOG / EXP / ALOG /
     SIN / COS / TAN / ASIN / ACOS / ATAN /
     SINH / COSH / TANH / ASINH / ACOSH / ATANH),
   Mixed BinInt ↔ Real/Integer arithmetic promotion.

   Advanced Guide refs: §15 (list combinators), §11 (complex
     elementary functions), §10.1 (BinInt arithmetic w/ mixed types).

   Every op below is user-reachable via the typed catalog today; no
   keypad wiring changes are needed.  The Complex-aware unaries
   accept Complex inputs on the principal branch; Real inputs still
   go through the existing real-only paths.
   ================================================================= */

/* ------------------- Complex arithmetic primitives ------------------- */
export function _cx(re, im) { return { re, im }; }

export function _cxAdd(a, b) { return { re: a.re + b.re, im: a.im + b.im }; }

export function _cxSub(a, b) { return { re: a.re - b.re, im: a.im - b.im }; }

export function _cxMul(a, b) {
  return { re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re };
}

export function _cxDiv(a, b) {
  const d = b.re * b.re + b.im * b.im;
  if (d === 0) throw new RPLError('Infinite result');
  return {
    re: (a.re * b.re + a.im * b.im) / d,
    im: (a.im * b.re - a.re * b.im) / d,
  };
}


/* --------------- List combinators — SEQ, DOLIST, DOSUBS, STREAM ---------------
   HP50 AUR §15 "Lists and sequences".  MAP covers the 1-in/1-out
   elementwise case; this batch adds the four remaining combinators
   users actually reach for.

     SEQ     ( expr name start end step → list )
       Evaluate `expr` with `name` bound to start, start+step, … while
       the counter hasn't passed `end` in step's direction.  Returns a
       list of the results.  Zero step → Loop iteration limit (infinite
       loop).  Sign of `step` decides direction.
     DOLIST  ( list_1 … list_n n prog → list )
       Apply `prog` to the i-th element of each of the n lists; collect
       results.  Length of result = min(len(list_1), …, len(list_n)).
       Two-arg form `list prog DOLIST` defaults n=1.
     DOSUBS  ( list n prog → list )
       Sliding window of size n.  For each window, push its n elements
       and call `prog`; collect results.  Len(result) = len(list) - n + 1.
       n = 0 or n > len(list) → empty list.
     STREAM  ( list prog → value )
       Binary reduction.  Push first element, then for each subsequent
       element push it and call `prog`.  Single-element list → that
       element; empty list throws 'Invalid dimension' (HP50 error).

   All four combinators delegate per-call evaluation to `_evalValue`
   (the same entry point MAP / EVAL / IFT use), so Program / Name /
   Symbolic pass-through works for free and recursion depth is enforced.
   The `prog` slot accepts Program, Name, or Symbolic — same as MAP.
   ----------------------------------------------------------------- */

function _combinatorProgCheck(prog) {
  if (!isProgram(prog) && !isName(prog) && !isSymbolic(prog)) {
    throw new RPLError('Bad argument type');
  }
}


// Pop one return value after evaluating prog; guard against non-1 delta.
// `errLabel` ("DOLIST" / "DOSUBS" / …) does double-duty: stitched into
// the bad-program error AND into the caller-label passed to `_driveGen`
// so a rejected HALT names the right op.
function _popOneReturn(s, prog, baseDepth, errLabel) {
  _evalValueSync(s, prog, 0, errLabel + ' program');
  const delta = s.depth - baseDepth;
  if (delta !== 1) throw new RPLError(errLabel + ': bad program');
  return s.pop();
}


// Coerce an Integer / Real value to a plain JS number, accepting
// integer-valued Reals as integer counts.  Used by SEQ/DOLIST/DOSUBS.
function _toIntCount(v, errLabel) {
  if (isInteger(v)) return Number(v.value);
  if (isReal(v) && v.value.isFinite() && v.value.isInteger()) {
    return v.value.toNumber();
  }
  throw new RPLError(errLabel);
}


/* SEQ — generator flavor.
 *
 * `evalRange` intercepts the SEQ token and delegates here so a HALT or
 * PROMPT inside the per-iteration `expr` body suspends through the
 * same `yield` channel HALT itself uses.  All loop state — the `out`
 * accumulator, the current loop counter `i`, the `iterations` cap
 * counter, the saved binding of the loop variable — lives in this
 * generator's stack frame, so a CONT after a mid-iteration HALT
 * resumes inside the same iteration with the partial accumulator
 * intact.  The loop variable is also saved/restored in `finally`, so
 * a KILL during a halted SEQ tears down the binding cleanly via
 * `gen.return()`.
 *
 * The `register('SEQ', ...)` handler below stays as a sync fallback
 * for the rare path where SEQ is reached via Name dispatch
 * (`'SEQ' EVAL`, Tagged-wrapped `Name('SEQ')`).  Sync drives this
 * same generator through `_driveGen`, which rejects a HALT with
 * `HALT: cannot suspend inside SEQ expression`.
 */
export function* runSeq(s, depth) {
  if (s.depth < 5) throw new RPLError('Too few arguments');
  const step  = s.pop();
  const end   = s.pop();
  const start = s.pop();
  const name  = s.pop();
  const expr  = s.pop();
  if (!isName(name)) throw new RPLError('Bad argument type');
  _combinatorProgCheck(expr);          // expr can be a Program/Name/Symbolic
  const a = toRealOrThrow(start);
  const b = toRealOrThrow(end);
  const st = toRealOrThrow(step);
  if (st === 0) throw new RPLError('Bad argument value');
  const varName = name.id;
  const saved = varRecall(varName);
  const out = [];
  let iterations = 0;
  try {
    let i = a;
    while ((st > 0 && i <= b) || (st < 0 && i >= b)) {
      if (++iterations > MAX_LOOP_ITERATIONS) throw new RPLError('Loop iteration limit');
      varStore(varName, Real(i));
      const baseDepth = s.depth;
      yield* _evalValueGen(s, expr, depth + 1);
      const delta = s.depth - baseDepth;
      if (delta !== 1) throw new RPLError('SEQ: bad program');
      out.push(s.pop());
      i += st;
    }
  } finally {
    if (saved === undefined) varPurge(varName);
    else varStore(varName, saved);
  }
  s.push(RList(out));
}


/* DOLIST — generator flavor.
 *
 * `evalRange` intercepts the DOLIST token and delegates here so a HALT
 * or PROMPT inside the per-iteration `prog` body suspends through the
 * same `yield` channel HALT itself uses.  Loop state — the `out`
 * accumulator, the `lists` array, the current `i` — lives in this
 * generator's stack frame, so a CONT after a mid-iteration HALT
 * resumes inside the same iteration with the partial accumulator
 * intact.
 *
 * The `register('DOLIST', ...)` handler below stays as a sync fallback
 * for the rare path where DOLIST is reached via Name dispatch
 * (`'DOLIST' EVAL`, Tagged-wrapped `Name('DOLIST')`).  Sync drives this
 * same generator through `_driveGen`, which rejects a HALT with
 * `HALT: cannot suspend inside DOLIST program`.
 */
export function* runDoList(s, depth) {
  if (s.depth < 2) throw new RPLError('Too few arguments');
  const prog = s.pop();
  _combinatorProgCheck(prog);
  // Decide whether the next value is a count (Integer/integer-Real)
  // or the single-list form (list).
  const top = s.peek();
  let n;
  if (isList(top)) {
    n = 1;                               // implicit-n form
  } else {
    const nVal = s.pop();
    n = _toIntCount(nVal, 'Bad argument type');
    if (n < 1) throw new RPLError('Bad argument value');
  }
  if (s.depth < n) throw new RPLError('Too few arguments');
  const lists = [];
  for (let i = 0; i < n; i++) lists.push(s.pop());   // in reverse order
  lists.reverse();
  for (const L of lists) if (!isList(L)) throw new RPLError('Bad argument type');
  const minLen = lists.reduce((m, L) => Math.min(m, L.items.length), Infinity);
  const len = Number.isFinite(minLen) ? minLen : 0;
  const out = [];
  for (let i = 0; i < len; i++) {
    const baseDepth = s.depth;
    for (const L of lists) s.push(L.items[i]);
    yield* _evalValueGen(s, prog, depth + 1);
    const delta = s.depth - baseDepth;
    if (delta !== 1) throw new RPLError('DOLIST: bad program');
    out.push(s.pop());
  }
  s.push(RList(out));
}


/* DOSUBS context stack: a per-call frame pushed while DOSUBS iterates,
   so NSUB / ENDSUB called inside the window-program can read the
   current window index and the total number of windows.  A JS array
   is used as a stack so nested DOSUBS calls nest the context naturally
   — NSUB/ENDSUB always read the innermost frame.  The frame is
   pushed/popped inside `runDoSubs`'s `try/finally`, so a KILL of a
   halted DOSUBS closes the generator via `gen.return()` and the
   `finally` tears down the frame. */
export const _DOSUBS_STACK = [];

// Test-side observer — pins that the DOSUBS frame stack is empty
// after a halted-DOSUBS KILL.
export function dosubsStackDepth() { return _DOSUBS_STACK.length; }


/* DOSUBS — generator flavor.
 *
 * Window-iteration combinator (HP50 AUR §13.5).  Same generator-flavor
 * pattern as runMap / runSeq / runDoList: pop the three operands, push
 * the NSUB/ENDSUB frame, then iterate windows; each window pushes `n`
 * elements and EVAL's `prog` through `_evalValueGen` so a HALT/PROMPT
 * inside the body suspends through the `yield` channel.  The
 * `_DOSUBS_STACK.pop()` call is in the `finally` so KILL of a halted
 * DOSUBS tears down the frame — `gen.return()` runs the finally
 * synchronously and NSUB/ENDSUB called outside DOSUBS afterwards
 * correctly throw `Undefined local name`.
 *
 * The `register('DOSUBS', ...)` handler below stays as a sync fallback
 * (Name dispatch).  Sync drives this same generator through
 * `_driveGen`, which rejects a HALT with `HALT: cannot suspend inside
 * DOSUBS program`.
 */
export function* runDoSubs(s, depth) {
  if (s.depth < 3) throw new RPLError('Too few arguments');
  const prog = s.pop();
  _combinatorProgCheck(prog);
  const nVal = s.pop();
  const n = _toIntCount(nVal, 'Bad argument type');
  const list = s.pop();
  if (!isList(list)) throw new RPLError('Bad argument type');
  if (n < 0) throw new RPLError('Bad argument value');
  const items = list.items;
  if (n === 0 || n > items.length) { s.push(RList([])); return; }
  const totalWindows = items.length - n + 1;
  const frame = { index: 1, total: totalWindows };
  _DOSUBS_STACK.push(frame);
  const out = [];
  try {
    for (let i = 0; i + n <= items.length; i++) {
      frame.index = i + 1;                       // 1-based per HP50
      const baseDepth = s.depth;
      for (let k = 0; k < n; k++) s.push(items[i + k]);
      yield* _evalValueGen(s, prog, depth + 1);
      const delta = s.depth - baseDepth;
      if (delta !== 1) throw new RPLError('DOSUBS: bad program');
      out.push(s.pop());
    }
  } finally {
    _DOSUBS_STACK.pop();
  }
  s.push(RList(out));
}


/* STREAM — generator flavor.
 *
 * Reduce-over-list combinator (HP50 AUR §13.5).  Pops a list and a
 * binary `prog`, and folds `prog` over the list left-to-right: with
 * items `{a b c d}` the sequence is `a b prog → r1; r1 c prog → r2;
 * r2 d prog → r3` and `r3` is pushed.  Same generator-flavor pattern:
 * the accumulator lives on the *RPL* stack between iterations, and
 * each `prog` invocation goes through `_evalValueGen` so HALT/PROMPT
 * inside the body suspends through the `yield` channel.  CONT resumes
 * inside the same fold step; the in-progress accumulator is *already
 * on the RPL stack* at suspension time, so the user sees it on the
 * halted-stack display during the suspension — same observability as
 * a HALT inside any other structural op.
 *
 * One-element list short-circuits before any HALT can fire.  Empty
 * list throws `Invalid dimension` (HP50's own STREAM-on-empty error).
 *
 * The `register('STREAM', ...)` handler below stays as a sync fallback
 * (Name dispatch).  Sync drives this generator through `_driveGen`,
 * which rejects HALT with `HALT: cannot suspend inside STREAM
 * program`.
 */
export function* runStream(s, depth) {
  if (s.depth < 2) throw new RPLError('Too few arguments');
  const prog = s.pop();
  _combinatorProgCheck(prog);
  const list = s.pop();
  if (!isList(list)) throw new RPLError('Bad argument type');
  const items = list.items;
  if (items.length === 0) throw new RPLError('Invalid dimension');
  if (items.length === 1) { s.push(items[0]); return; }
  s.push(items[0]);
  for (let i = 1; i < items.length; i++) {
    const baseDepth = s.depth - 1;       // the accumulator is already on top
    s.push(items[i]);
    yield* _evalValueGen(s, prog, depth + 1);
    const delta = s.depth - baseDepth;
    if (delta !== 1) throw new RPLError('STREAM: bad program');
  }
}


/* =================================================================
   ROW+ / ROW- / COL+ / COL- (matrix row/col edit),
   CNRM / RNRM (column / row max-sum norms), AUGMENT (horizontal
   concatenate), RAND / RDZ (seeded PRNG; shared with RANM above).

   All items user-reachable from the typed catalog today.  No UI
   wiring changes.  Advanced Guide refs:
     §15.3  (ROW+, ROW-, COL+, COL- — matrix row/column insert/delete)
     §15.4  (CNRM — column norm, RNRM — row norm)
     §15.3  (AUGMENT — horizontal concat of matrix/vector)
     §17.5  (RAND — uniform Real in [0,1), RDZ — seed the PRNG)
   ================================================================= */

/* --------------- ROW+ / ROW- / COL+ / COL- --------------------------
   HP50 AUR §15.3.  Matrix row/column insert/delete.

   ROW+  ( M v n → M' )
         Insert Vector v as new row n (1-based) of Matrix M.  After
         the insert, the new matrix has m+1 rows; the former row-n
         and everything below it shift down one.  v must be a Vector
         of length = n-cols of M.  n must be in [1, m+1] (inserting
         at m+1 appends at the bottom).

   ROW-  ( M n → M' v )
         Remove row n of M.  Pushes the reduced matrix on level 2
         and the removed row (as a Vector) on level 1.  n must be in
         [1, m].

   COL+  ( M v n → M' )
         Insert Vector v as new column n (1-based) of M.  v must be
         a Vector of length = n-rows of M.  n must be in [1, p+1].

   COL-  ( M n → M' v )
         Remove column n.  Pushes reduced matrix on level 2 and the
         removed column (as a Vector) on level 1.

   Element polymorphism: since these are pure array manipulations
   (no arithmetic on entries), the matrix/vector entries can be any
   type the Matrix constructor already accepts — Real, Integer,
   Complex, Symbolic.  No coercion; the inserted/extracted values
   are pushed through unchanged.
   ----------------------------------------------------------------- */

export function _indexAsInt(v, op) {
  // Accepts Integer or integer-valued Real; returns a JS number index.
  if (isInteger(v)) return Number(v.value);
  if (isReal(v) && v.value.isInteger()) return v.value.toNumber();
  throw new RPLError('Bad argument type');
}


/* =================================================================
   ROW→ / →ROW / COL→ / →COL (matrix decompose / compose by row or by
   column), RSWP / CSWP (swap rows / columns), RCI / RCIJ (elementary
   row ops — multiply a row by a constant; add c*row_i to row_j).
   All items user-reachable from the typed catalog today.  No UI
   wiring changes.

   Advanced Guide refs:
     §15.3  (ROW→ / →ROW / COL→ / →COL — matrix explode / assemble by
             row / column vectors)
     §15.3  (RSWP / CSWP / RCI / RCIJ — elementary row/column ops —
             complement to ROW+ / ROW- / COL+ / COL-)

   Shape and index conventions reuse the `_indexAsInt` helper (accepts
   Integer or integer-valued Real; throws Bad argument type on anything
   else).  The ROW+ / ROW- family always represents matrix rows/cols as
   a Vector when pushed to the stack — these ops follow the same
   convention so `ROW+ ROW→` and `ROW→ →ROW` round-trip exactly.
   ================================================================= */

/* --------------- ROW→ / →ROW / COL→ / →COL --------------------------
   HP50 AUR §15.3.  Decompose / compose a Matrix into / from its rows
   or columns as Vectors.

   ROW→  ( M → v_1 v_2 ... v_m m )
         Explodes M into m row Vectors pushed deepest-row-first,
         followed by the row count m as a Real on top (matches the
         trailing-count pattern ARRY→ uses).

   →ROW  ( v_1 v_2 ... v_m m → M )
         Inverse: pops m, then pops m Vectors (all same length),
         assembles them as the rows of M.  ASCII alias `->ROW`.

   COL→  ( M → v_1 v_2 ... v_n n )
         Explodes M into n column Vectors, count on top.

   →COL  ( v_1 v_2 ... v_n n → M )
         Inverse: pops n, then pops n Vectors (all same length),
         treats each Vector as a column of M.

   Unicode + ASCII aliases register side-by-side (ROW→ / ROW->, etc.).
   Element polymorphism: these are pure container manipulations — no
   arithmetic on entries, so Real / Integer / Complex / Symbolic cell
   values pass through unchanged.
   ----------------------------------------------------------------- */

export const _rowDecompose = (s) => {
  const [M] = s.popN(1);
  if (!isMatrix(M)) throw new RPLError('Bad argument type');
  for (const row of M.rows) s.push(Vector(row.slice()));
  s.push(Real(M.rows.length));
};


export const _rowCompose = (s) => {
  const [countVal] = s.popN(1);
  const m = _indexAsInt(countVal, '→ROW');
  if (m < 1) throw new RPLError('Bad argument value');
  const vecs = s.popN(m);
  for (const v of vecs) {
    if (!isVector(v)) throw new RPLError('Bad argument type');
  }
  const cols = vecs[0].items.length;
  for (const v of vecs) {
    if (v.items.length !== cols) throw new RPLError('Invalid dimension');
  }
  const rows = vecs.map(v => v.items.slice());
  s.push(Matrix(rows));
};


export const _colDecompose = (s) => {
  const [M] = s.popN(1);
  if (!isMatrix(M)) throw new RPLError('Bad argument type');
  const m = M.rows.length;
  const cols = m > 0 ? M.rows[0].length : 0;
  for (let j = 0; j < cols; j++) {
    const col = new Array(m);
    for (let i = 0; i < m; i++) col[i] = M.rows[i][j];
    s.push(Vector(col));
  }
  s.push(Real(cols));
};


export const _colCompose = (s) => {
  const [countVal] = s.popN(1);
  const n = _indexAsInt(countVal, '→COL');
  if (n < 1) throw new RPLError('Bad argument value');
  const vecs = s.popN(n);
  for (const v of vecs) {
    if (!isVector(v)) throw new RPLError('Bad argument type');
  }
  const rows = vecs[0].items.length;
  for (const v of vecs) {
    if (v.items.length !== rows) throw new RPLError('Invalid dimension');
  }
  // Build m×n matrix whose column j is vecs[j].
  const out = [];
  for (let i = 0; i < rows; i++) {
    const row = new Array(n);
    for (let j = 0; j < n; j++) row[j] = vecs[j].items[i];
    out.push(row);
  }
  s.push(Matrix(out));
};


/* =================================================================
   Mixed cluster drawn from §11 (CAS number-theory), §13 (List),
   §16 (Types & Tags), §19 (Statistics), §9 (Display), and §8
   (Error/Debug):

     §11 CAS: ISPRIME? / NEXTPRIME / PREVPRIME; EULER; DIVIS / FACTORS;
              IBERNOULLI; IEGCD; ICHINREM / IABCUV;
              HORNER; PCOEF / FCOEF.
     §13 Lists: APPEND.
     §16 Types: →TAG / DTAG / VTYPE / KIND / UNDER.
     §19 Stats: MEDIAN; CORR / COV.
     §9  Display: STD / FIX / SCI / ENG.
     §8  Errors: DOERR.

   All ops are user-reachable from the typed catalog today.  The
   display-mode quartet (STD/FIX/SCI/ENG) updates `state.display*`
   fields that tests assert on via `→STR`; wiring them into the live
   LCD render is a future UI task.
   ================================================================= */

/* --------------- Number-theoretic helpers (integer land) -----------
   All the primality / totient / divisor ops work over BigInt so
   HP50-size integers (64+ bits) round-trip cleanly.  Small-n paths
   use BigInt math anyway — the constants below avoid a Number
   coercion for readability. */

export const _ZERO = 0n;

export const _ONE  = 1n;


/* RUN — AUR p.2-177.  Resumes the most-recently-halted program at full
 * speed regardless of any single-step state that was active when the
 * program was suspended.  AUR p.2-177 specifies "no more single steps
 * are permitted" after RUN; the explicit zeroing of _singleStepMode /
 * _stepInto before handing off to CONT enforces that guarantee
 * defensively, even if a future code path leaves either flag set when
 * RUN is called.  The save/restore in the finally block is a safety
 * net: in normal use both flags are already false when RUN is entered
 * (SST/DBUG each reset them in their own finally blocks), so the
 * restore is a no-op; in an abnormal path it prevents the caller from
 * inheriting a zeroed step state it didn't expect. */
register('RUN', (s) => {
  const wasStepping = _singleStepMode;
  const wasInto     = _stepInto;
  _singleStepMode = false;
  _stepInto       = false;
  try {
    OPS.get('CONT').fn(s);
  } finally {
    _singleStepMode = wasStepping;
    _stepInto       = wasInto;
  }
}, { category: 'Control flow / debug', categoryOrder: 5, label: "RUN" });


/* ---------------- SST / SST↓ — single-step debugger ----------------
 * Single-step substrate built on the generator-based evalRange.  The
 * implementation is a thin wrapper around CONT plus a module-level
 * `_singleStepMode` flag that `evalRange` consults after every token
 * (see the post-token `if (_singleStepMode) yield;` line in evalRange
 * and runControl / runArrow tails).
 *
 * SST drives the top of the haltedStack forward by exactly one
 * token.  Implementation is symmetrical with CONT:
 *   1. takeHalted() to peel the live generator off the stack
 *      (without closing it — clearHalted closes; takeHalted leaves
 *      the generator live so we can call gen.next() on it).
 *   2. Set `_singleStepMode = true` so the next post-token yield
 *      in evalRange causes the generator to suspend after exactly
 *      one token.
 *   3. gen.next() — runs one token, then either (a) yields again
 *      (single-step suspension), (b) finishes (program done), or
 *      (c) throws (program errored).  In case (a) we re-push the
 *      generator on the haltedStack via setHalted so the next SST
 *      can drive it forward another step; in cases (b) and (c) the
 *      flag is cleared in `finally` and the generator is gone.
 *   4. Clear the flag in `finally` so subsequent CONT/RUN/EVAL
 *      calls don't single-step.  (If the user wants more steps,
 *      they call SST again — which sets the flag, runs one token,
 *      and clears it.)
 *
 * SST↓ adds step-into.  `_evalValueGen` (the generator flavor of
 * `_evalValueSync`, reached only via `evalToken` Name lookup)
 * consults `_stepInto` around a sub-program body: SST
 * (`_stepInto === false`) clears `_singleStepMode` while the body
 * runs so it completes in one step; SST↓ (`_stepInto === true`)
 * leaves the flag set so the body's own evalRange also yields
 * after each token, letting the user descend.  Op-argument paths
 * (IFT / IFTE / MAP / …) go through `_evalValueSync` and retain
 * the reject-on-HALT behavior.
 *
 * Errors:
 *   - SST with no halted program → `No halted program` (same as
 *     CONT).  This is intentional — SST is a step within an
 *     already-suspended program, not a "step the next op on the
 *     current input" op.  To start single-stepping a fresh
 *     program, use DBUG.
 * --------------------------------------------------------------- */

export function _stepOnce(s, into = false) {
  if (!getHalted()) throw new RPLError('No halted program');
  // SST/SST↓ resume the program by one token, which is enough to
  // advance past a PROMPT.  The prompt banner is consumed by any form
  // of resumption — same rationale as CONT above.  If the single step
  // lands on a fresh PROMPT, that intercept will set the banner anew
  // before the post-step re-suspend.
  clearPromptMessage();
  const h = takeHalted();
  const framesAtEntry = _localFrames.length;
  let halted = false;
  const wasStepping = _singleStepMode;
  const wasInto = _stepInto;
  _singleStepMode = true;
  _stepInto = into;
  try {
    const result = h.generator.next();
    if (!result.done) {
      // Generator yielded again (the post-token single-step yield, OR
      // a fresh HALT inside the program).  Re-push it so the next
      // SST/CONT/RUN can resume.
      halted = true;
      pushSuspendedGenerator(h.generator);
    }
  } finally {
    _singleStepMode = wasStepping;     // typically false
    _stepInto = wasInto;               // typically false
    if (!halted) {
      clearPendingSuspend();
      _truncateLocalFrames(framesAtEntry);
    }
  }
}


/* ---------------- DBUG — start a program in single-step mode --------
 * HP50 AUR p.2-95: DBUG pops a Program off level 1 and begins
 * executing it under the single-step debugger.  The program is not
 * pre-evaluated — it's halted before its first token, so the user
 * can SST through it from the very start.
 *
 * Implementation: pop the Program, set `_singleStepMode = true`,
 * delegate to EVAL.  evalRange yields after the first token (which
 * may be a no-op — the body of `« 1 2 + »` yields after pushing 1,
 * leaving the stack with [..., 1] and the generator suspended); EVAL
 * captures that yield exactly the same way it captures a HALT.  The
 * flag is cleared in `finally` so a downstream CONT/RUN won't
 * single-step.  The user drives subsequent steps with SST.
 *
 * Tagged wrappers are peeked through for the type check — Tagged
 * values are transparent to EVAL, and DBUG is EVAL-with-stepping.
 * The actual peel happens inside EVAL via _evalValueGen's Tagged
 * recursion.
 *
 * Errors:
 *   - DBUG on a non-Program (after peeling Tagged) → `Bad argument type`.
 * --------------------------------------------------------------- */
register('DBUG', (s) => {
  // Peel Tagged wrappers for the type check.  Tagged values are
  // transparent for EVAL purposes; DBUG must accept the same set of
  // arguments.  This is a pure read-through — the actual peel happens
  // inside EVAL via _evalValueGen's Tagged recursion.
  let probe = s.peek();
  while (probe && isTagged(probe)) probe = probe.value;
  if (!isProgram(probe)) throw new RPLError('Bad argument type');
  // EVAL handler does its own pop; we just toggle the flag around it.
  // wasStepping is virtually always false here, but guard against the
  // pathological "DBUG inside a halted single-step program" case.
  // _stepInto is reset to false — a fresh DBUG session starts in
  // step-over mode.  Users choose step-into per-step by driving with
  // SST↓ instead of SST.
  const wasStepping = _singleStepMode;
  const wasInto = _stepInto;
  _singleStepMode = true;
  _stepInto = false;
  try {
    OPS.get('EVAL').fn(s);
  } finally {
    _singleStepMode = wasStepping;
    _stepInto = wasInto;
  }
}, { category: 'Control flow / debug', categoryOrder: 6, label: "DBUG" });


/* --------------- C→P / P→C — complex cartesian ↔ polar ---------------
   HP50 AUR §4.4.  Converts between rectangular (x, y) and polar
   (r, θ) representations of a Complex value.  θ is expressed in the
   current angle mode via `fromRadians` / `toRadians` so the same op
   round-trips across DEG / RAD / GRAD.

     C→P  ( (x, y) → (r, θ) )
              where r = √(x²+y²), θ = atan2(y, x) converted from
              radians.  Real input promotes to (x, 0), then r = |x|,
              θ = 0 (positive) or π (negative).  Zero → (0, 0).
     P→C  ( (r, θ) → (x, θ)_x,y )
              Inverse: x = r·cos θ, y = r·sin θ with θ interpreted in
              the current angle mode.  r may be negative: HP50 treats
              that as flipping 180°, so the result is still a valid
              Cartesian pair.

   Both come in ASCII-alias forms `C->P` / `P->C` too.  Vector / Matrix
   and Symbolic inputs rejected — the op is strictly scalar-complex.
   ----------------------------------------------------------------- */

export function _cToPOp(s) {
  const v = s.pop();
  let re, im;
  if (isComplex(v))       { re = v.re;                im = v.im; }
  else if (isReal(v))     { re = v.value.toNumber();  im = 0;    }
  else if (isInteger(v))  { re = Number(v.value);     im = 0;    }
  else throw new RPLError('Bad argument type');
  const r = Math.hypot(re, im);
  const th = Math.atan2(im, re);
  s.push(Complex(r, fromRadians(th)));
}


export function _pToCOp(s) {
  const v = s.pop();
  let r, thUser;
  if (isComplex(v))       { r = v.re;                thUser = v.im; }
  else if (isReal(v))     { r = v.value.toNumber();  thUser = 0;    }
  else if (isInteger(v))  { r = Number(v.value);     thUser = 0;    }
  else throw new RPLError('Bad argument type');
  const th = toRadians(thUser);
  s.push(Complex(r * Math.cos(th), r * Math.sin(th)));
}


/* --------------- HERMITE / LEGENDRE / TCHEBYCHEFF ----------------------
   HP50 AUR §12.5.  Orthogonal-polynomial generators.  Each takes a
   non-negative Integer / Real-integer `n` and returns the order-n
   polynomial as a Symbolic expression in `X`.

     HERMITE      (n → H_n(X))    physicist's Hermite:
                  H_0 = 1, H_1 = 2X,
                  H_{k+1} = 2·X·H_k - 2·k·H_{k-1}
     LEGENDRE     (n → P_n(X))    P_0 = 1, P_1 = X,
                  (k+1) P_{k+1} = (2k+1)·X·P_k - k·P_{k-1}
     TCHEBYCHEFF  (n → T_n(X))    first-kind Chebyshev:
                  T_0 = 1, T_1 = X,
                  T_{k+1} = 2·X·T_k - T_{k-1}
                  HP50 also accepts negative n for the second-kind
                  variant U_{|n|-1} — not implemented here (returns
                  Bad argument value); deferred until the full
                  TCHEBYCHEFF suite is needed.

   ASCII aliases: `TCHEB` (the HP50 catalog spelling uses two forms;
   the web UI already auto-completes the full spelling).

   The work happens on a plain JS coefficient array (descending
   degree) via the standard three-term recurrences.  Once the array
   is built, `_coefArrToSymbolicX` converts it into an expanded
   Symbolic AST (no fancy collection — the recurrences already keep
   each polynomial in normal form).
   ----------------------------------------------------------------- */

export function _coefArrToSymbolicX(coefs) {
  // coefs: descending-degree plain-number array.  Builds a Symbolic
  // AST in `X`.  Zero entries are skipped; the leading sign is
  // absorbed into the first non-zero term so the output looks
  // textbook-like (e.g. "2·X^3 - X" not "2·X^3 + -1·X").
  const X = AstVar('X');
  const deg = coefs.length - 1;
  let ast = null;
  for (let i = 0; i < coefs.length; i++) {
    const c = coefs[i];
    if (c === 0) continue;
    const pow = deg - i;
    // Build the |c|·X^pow term (without sign), then attach with + or -.
    const ac = Math.abs(c);
    let factor;
    if (pow === 0) {
      factor = AstNum(ac);
    } else {
      const Xpow = (pow === 1) ? X : AstBin('^', X, AstNum(pow));
      factor = (ac === 1) ? Xpow : AstBin('*', AstNum(ac), Xpow);
    }
    if (ast === null) {
      ast = c < 0 ? AstNeg(factor) : factor;
    } else {
      ast = AstBin(c < 0 ? '-' : '+', ast, factor);
    }
  }
  if (ast === null) ast = AstNum(0);
  return Symbolic(ast);
}


export function _nFromIntegerArg(v) {
  // Accept Integer or integer-valued Real.  Return a non-negative
  // plain JS number; negative or non-integer throws the usual errors.
  let n;
  if (isInteger(v)) {
    n = Number(v.value);
  } else if (isReal(v)) {
    if (!v.value.isFinite() || !v.value.isInteger()) {
      throw new RPLError('Bad argument value');
    }
    n = v.value.toNumber();
  } else {
    throw new RPLError('Bad argument type');
  }
  if (n < 0) throw new RPLError('Bad argument value');
  return n;
}


/* ---- LAMBERT — principal-branch Lambert W₀ ---------------------------
   HP50 AUR §2 (CAS-SPECIAL).  One-arg Lambert W function, principal
   branch W₀.  Solves  W · e^W = x  for W ∈ ℝ given real x ≥ -1/e.

     LAMBERT  ( x → W₀(x) )

   Domain:
     x < -1/e              → Bad argument value (no real solution)
     x = -1/e              → W₀(-1/e) = -1  (branch point)
     x = 0                 → 0
     x > 0                 → unique positive W
     -1/e < x < 0          → unique W in (-1, 0)

   Numerical method: Halley iteration on f(W) = W eᵂ − x.  Halley's
   correction vs. plain Newton kills the quadratic-convergence edge
   cases near the branch point (where f' → 0) by factoring in f''.
   Starting guess:
     x ≥ e         : W₀ ≈ ln x − ln ln x          (asymptotic)
     |x| ≤ 0.5     : W₀ ≈ x − x² + (3/2)x³        (Taylor)
     elsewhere     : W₀ ≈ log(1 + x) / (1 + 0.5·log(1+x))

   Converges in ≲ 8 iterations to machine precision for all x.

   Symbolic / Name input lifts to `LAMBERT(x)`; Tagged transparent;
   List / Vector / Matrix distribute element-wise.
*/
const _INV_E = -1 / Math.E;


/* ------------------------------------------------------------------
   Matrix-symbolic ops — PCAR / CHARPOL / EGVL

   Three CAS-backed matrix ops that take an n×n Matrix and route
   through Giac.  Matrix is serialized to Giac's `[[a,b],[c,d]]`
   bracket literal via `_matrixToGiacStr`; scalar entries use
   `_scalarToGiacStr` (Integer / Real / Rational / Complex /
   Symbolic / Name → Giac-valid string).

   PCAR     (HP50 AUR §3-196)
     Characteristic polynomial det(X·I − A) of a square matrix A.
     HP50 name is PCAR.  Giac equivalent: `charpoly(M, X)`.  Returns
     a Symbolic in the current CAS variable (VX — default `X`).
     The listed `CHARPOL` alias is registered as a thin wrapper so
     code imported from other HP-family calculators still resolves.

   EGVL     (HP50 AUR §3-90)
     Eigenvalues of a square matrix, returned as a Vector.  Giac
     equivalent: `eigenvals(M)` (the list form — note `egvl(M)` in
     Xcas prints the Jordan-form diagonal matrix instead, which isn't
     what HP50 EGVL wants; eigenvals is the bracket-list companion).
     Each element is lifted back through `giacToAst` and unwrapped to
     a Real / Integer / Symbolic / Complex value via `_astToRplValue`.

   Shared shape:
     • Input must be a square (n×n) Matrix.  Empty matrix ⇒
       `Invalid dimension`; rectangular ⇒ `Invalid dimension`.
     • Non-Matrix input ⇒ `Bad argument type`.
     • `!giac.isReady()` ⇒ `CAS not ready` (no-fallback policy).
   ------------------------------------------------------------------ */

/** Serialize one scalar Matrix/Vector entry as a Giac-parseable token.
 *  Handles the numeric family (Integer / Real / Rational / Complex),
 *  plus Symbolic (recurse via astToGiac) and bare Name.  Anything else
 *  throws — callers propagate as `Bad argument type`. */
export function _scalarToGiacStr(v) {
  if (isInteger(v))  return v.value.toString();                 // BigInt → "n"
  if (isReal(v))     return v.value.toString();                 // Decimal → "3.14"
  if (isRational(v)) return `(${v.n.toString()}/${v.d.toString()})`;
  if (isComplex(v))  return `(${v.re}+(${v.im})*i)`;
  if (isSymbolic(v)) return `(${astToGiac(v.expr)})`;
  if (isName(v))     return v.id;
  throw new RPLError('Bad argument type');
}


/** Serialize a Matrix as a Giac `[[r1c1,r1c2,…],[r2c1,…]]` literal. */
export function _matrixToGiacStr(m) {
  const rows = m.rows.map((row) => {
    const elts = row.map(_scalarToGiacStr);
    return `[${elts.join(',')}]`;
  });
  return `[${rows.join(',')}]`;
}


/** Shared validator for PCAR / EGVL-style matrix ops.  Returns the
 *  square n; throws `Invalid dimension` for non-square / empty,
 *  `Bad argument type` for non-Matrix. */
export function _popSquareMatrix(s) {
  const m = s.pop();
  if (!isMatrix(m)) throw new RPLError('Bad argument type');
  const n = m.rows.length;
  const cols = n > 0 ? m.rows[0].length : 0;
  if (n === 0 || n !== cols) throw new RPLError('Invalid dimension');
  return { matrix: m, n };
}


/* ------------------------------------------------------------------
   APPROX-mode push-time coercion.

   When flag -105 is SET ("_approx_"), values that land on the stack
   fresh get collapsed to Real on the way in — this is the user-facing
   rule "in APPROX mode, fractions and integers are converted to
   decimal upon entry, in expressions too."  Scope:

     Integer   → Real (BigInt → Decimal via string so precision holds
                 above 2^53 — a 30-digit factorial decimates cleanly).
     Rational  → Real via Decimal(n).div(Decimal(d)).
     Symbolic  → Real when the AST has no free variables AND the
                 numeric evaluator (algebraEvalAst) reduces it to a
                 Num node.  `X+1` stays symbolic; `1/3` folds to
                 0.333…; `2^(1/3)` folds to 1.2599… .

   Types we DON'T touch: Real (already decimal), Complex, BinaryInteger
   (integer arithmetic domain), Unit (carries a Real value already),
   Vector/Matrix (their numeric entries are Real-typed by construction
   on entry), List, Program, Tagged, Name, Directory, String, Grob.

   The coercion consults getApproxMode() on every call — so a flag
   flip takes effect immediately for the next push, no re-registration
   needed.  EXACT mode makes this a true no-op.

   Install-time placement: bottom of ops.js, after every helper the
   coercion might touch (algebraEvalAst) and every type predicate is
   already in scope from the module imports.
   ------------------------------------------------------------------ */
setPushCoerce((v) => {
  if (!getApproxMode()) return v;
  if (v == null) return v;
  if (isInteger(v)) {
    return Real(new Decimal(v.value.toString()));
  }
  if (isRational(v)) {
    const n = new Decimal(v.n.toString());
    const d = new Decimal(v.d.toString());
    return Real(n.div(d));
  }
  if (isSymbolic(v)) {
    // Only fold if there are no free variables to look up — otherwise
    // the expression is load-bearing (`X+1`) and must stay symbolic.
    const vars = algebraFreeVars(v.expr);
    if (vars.size === 0) {
      // No lookup; no angle-mode (a pure-numeric Symbolic without
      // trig args doesn't care).  A `num` result folds to Real;
      // anything else (partial fold, function we can't evaluate) stays
      // Symbolic so the user sees exactly what they entered.
      const reduced = algebraEvalAst(v.expr, () => null, _angleAwareFnEval, null);
      if (reduced && reduced.kind === 'num' && Number.isFinite(reduced.value)) {
        return Real(reduced.value);
      }
    }
  }
  return v;
});


export let _graphicsHook = null;

export function setGraphicsHook(fn) {
  _graphicsHook = typeof fn === 'function' ? fn : null;
}

