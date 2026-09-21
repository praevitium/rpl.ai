import { RPLError } from '../stack.js';
import { Integer, Matrix, isInteger, isReal, isVector, Vector, isMatrix, isSymbolic, Symbolic, isString, isBinaryInteger, isComplex, isName, Real, isRational, Rational, Complex, isUnit, Unit, toComplex, toRealOrThrow, BinaryInteger, isNumber, isList, RList, Str } from '../types.js';
import { Bin as AstBin, formatAlgebra, Neg as AstNeg, Num as AstNum, Fn as AstFn, Var as AstVar } from '../algebra.js';
import { formatReal, DEFAULT_DISPLAY, formatBinaryInteger } from '../formatter.js';
import { getApproxMode, varRecall, varStore, getRealMaxExp, getWordsize, nextPrngUnit, seedPrng } from '../state.js';
import Decimal from '../../../vendor/decimal.js/decimal.mjs';
import { inverseUexpr, powerUexpr } from '../units.js';
import { register, lookup, OPS } from './registry.js';
import { _coerceStorableName, _decimalFrobeniusNorm, _hmsToHours, _hmsUnary, _hoursToHms, _invMatrixNumeric, _isScalarOperand, _isSymOperand, _makeUnit, _scalarBinary, _scalarSum, _toAst, _withListBinary, _withListUnary, _withTaggedBinary, _withTaggedUnary, _withVMUnary, binIntBinary } from './internal.js';



/** Standard matrix product of two row-major operand grids (m×n · n×p).
 *  Shared by the M·M `*` branch and `_matrixPow`. */
function _matMul(aRows, bRows) {
  const ar = aRows.length, ac = aRows[0]?.length ?? 0;
  const br = bRows.length, bc = bRows[0]?.length ?? 0;
  if (ac !== br) throw new RPLError('Invalid dimension');
  const out = [];
  for (let i = 0; i < ar; i++) {
    const row = new Array(bc);
    for (let j = 0; j < bc; j++) {
      const parts = new Array(ac);
      for (let k = 0; k < ac; k++) parts[k] = _scalarBinary('*', aRows[i][k], bRows[k][j]);
      row[j] = _scalarSum(parts);
    }
    out.push(row);
  }
  return out;
}


/** Square matrix raised to a whole-number power (HP50 AUR `^`): repeated
 *  matmul, with `M^0` = identity.  `m` must be square; `n` a non-negative
 *  integer. */
function _matrixPow(m, n) {
  const dim = m.rows.length;
  if (dim === 0 || (m.rows[0]?.length ?? 0) !== dim) throw new RPLError('Invalid dimension');
  let acc = m.rows.map((_, i) => m.rows.map((__, j) => (i === j ? Integer(1n) : Integer(0n))));
  for (let k = 0; k < n; k++) acc = _matMul(acc, m.rows);
  return Matrix(acc);
}


/** A non-negative whole number as a JS integer, or null.  Accepts an
 *  Integer or an integer-valued Real (the two whole-number stack shapes a
 *  matrix exponent can arrive as). */
function _wholeNumberExp(v) {
  if (isInteger(v)) return v.value >= 0n ? Number(v.value) : null;
  if (isReal(v) && v.value.isInteger() && v.value.gte(0)) return v.value.toNumber();
  return null;
}


function binaryMath(op) {
  return _withListBinary((s) => {
    const [a, b] = s.popN(2);                   // level2, level1

    // Vector ∘ Vector: element-wise for +/- (same length), dot
    // product for * (matches HP50 `V V *`).
    if (isVector(a) && isVector(b)) {
      if (op === '+' || op === '-') {
        if (a.items.length !== b.items.length) throw new RPLError('Invalid dimension');
        s.push(Vector(a.items.map((x, i) => _scalarBinary(op, x, b.items[i]))));
        return;
      }
      if (op === '*') {
        if (a.items.length !== b.items.length) throw new RPLError('Invalid dimension');
        const parts = a.items.map((x, i) => _scalarBinary('*', x, b.items[i]));
        s.push(_scalarSum(parts));
        return;
      }
      throw new RPLError('Bad argument type');
    }

    // Matrix ∘ Matrix: element-wise +/-, standard * (m×n · n×p).
    if (isMatrix(a) && isMatrix(b)) {
      const ar = a.rows.length, ac = a.rows[0]?.length ?? 0;
      const br = b.rows.length, bc = b.rows[0]?.length ?? 0;
      if (op === '+' || op === '-') {
        if (ar !== br || ac !== bc) throw new RPLError('Invalid dimension');
        s.push(Matrix(a.rows.map((row, i) =>
          row.map((x, j) => _scalarBinary(op, x, b.rows[i][j])))));
        return;
      }
      if (op === '*') {
        s.push(Matrix(_matMul(a.rows, b.rows)));
        return;
      }
      throw new RPLError('Bad argument type');
    }

    // Matrix * Vector (column) and Vector * Matrix (row).
    if (isMatrix(a) && isVector(b) && op === '*') {
      const cols = a.rows[0]?.length ?? 0;
      if (cols !== b.items.length) throw new RPLError('Invalid dimension');
      s.push(Vector(a.rows.map(row => {
        const parts = row.map((x, k) => _scalarBinary('*', x, b.items[k]));
        return _scalarSum(parts);
      })));
      return;
    }
    if (isVector(a) && isMatrix(b) && op === '*') {
      const rows = b.rows.length, cols = b.rows[0]?.length ?? 0;
      if (a.items.length !== rows) throw new RPLError('Invalid dimension');
      const out = new Array(cols);
      for (let j = 0; j < cols; j++) {
        const parts = new Array(rows);
        for (let i = 0; i < rows; i++) {
          parts[i] = _scalarBinary('*', a.items[i], b.rows[i][j]);
        }
        out[j] = _scalarSum(parts);
      }
      s.push(Vector(out));
      return;
    }

    // Matrix ^ whole-number → matrix power (square M only), per HP50 AUR
    // (`^` "can also apply to a square matrix raised to a whole-number
    // power").  Must intercept before the generic scalar broadcast, which
    // would otherwise raise each element to the power individually.  A
    // Vector base (and a non-whole-number / negative exponent) has no
    // defined `^` and is rejected.
    if (op === '^' && (isMatrix(a) || isVector(a)) && _isScalarOperand(b)) {
      if (isVector(a)) throw new RPLError('Bad argument type');
      const n = _wholeNumberExp(b);
      if (n === null) throw new RPLError('Bad argument value');
      s.push(_matrixPow(a, n));
      return;
    }

    // Scalar ∘ Vector / Matrix: broadcast the op across every element.
    if (isVector(a) && _isScalarOperand(b)) {
      s.push(Vector(a.items.map(x => _scalarBinary(op, x, b))));
      return;
    }
    if (_isScalarOperand(a) && isVector(b)) {
      s.push(Vector(b.items.map(x => _scalarBinary(op, a, x))));
      return;
    }
    if (isMatrix(a) && _isScalarOperand(b)) {
      s.push(Matrix(a.rows.map(row => row.map(x => _scalarBinary(op, x, b)))));
      return;
    }
    if (_isScalarOperand(a) && isMatrix(b)) {
      s.push(Matrix(b.rows.map(row => row.map(x => _scalarBinary(op, a, x)))));
      return;
    }

    // Any remaining Vector/Matrix mix (e.g. Vector / Matrix) is an
    // unsupported shape pair — report clearly rather than falling
    // into the scalar path with the same generic error.
    if (isVector(a) || isVector(b) || isMatrix(a) || isMatrix(b)) {
      throw new RPLError('Bad argument type');
    }

    // Equation arithmetic: apply the op to both sides of the equation.
    //   equation ∘ non-equation → (L ∘ b) = (R ∘ b)
    //   non-equation ∘ equation → (a ∘ L) = (a ∘ R)
    //   equation ∘ equation     → (La ∘ Lb) = (Ra ∘ Rb)
    {
      const aIsEq = isSymbolic(a) && a.expr.kind === 'bin' && a.expr.op === '=';
      const bIsEq = isSymbolic(b) && b.expr.kind === 'bin' && b.expr.op === '=';
      if (aIsEq || bIsEq) {
        if (aIsEq && bIsEq) {
          s.push(Symbolic(AstBin('=',
            AstBin(op, a.expr.l, b.expr.l),
            AstBin(op, a.expr.r, b.expr.r)
          )));
        } else if (aIsEq) {
          const rhs = _toAst(b);
          if (!rhs) throw new RPLError('Bad argument type');
          s.push(Symbolic(AstBin('=',
            AstBin(op, a.expr.l, rhs),
            AstBin(op, a.expr.r, rhs)
          )));
        } else {
          const lhs = _toAst(a);
          if (!lhs) throw new RPLError('Bad argument type');
          s.push(Symbolic(AstBin('=',
            AstBin(op, lhs, b.expr.l),
            AstBin(op, lhs, b.expr.r)
          )));
        }
        return;
      }
    }

    s.push(_scalarBinary(op, a, b));
  });
}


/** When either operand of `+` is a String, the result is a concatenation
 *  of the two operands' display forms.  Matches HP50 behaviour:
 *    "ABC" "DEF" +  →  "ABCDEF"
 *    "ABC" 123   +  →  "ABC123"
 *    123   "ABC" +  →  "123ABC"
 *    "ABC" 'X'   +  →  "ABCX"        (Name renders without ticks here —
 *                                      in-string context)
 *  Non-string `+` keeps the numeric/symbolic dispatch in binaryMath. */
function _stringCoerce(v) {
  if (isString(v))  return v.value;
  if (isInteger(v)) return v.value.toString();
  if (isReal(v)) {
    // Use STD formatting so the representation matches what the user sees
    // on the stack — avoids surprise from JS default toString on floats.
    return formatReal(v.value, DEFAULT_DISPLAY);
  }
  if (isBinaryInteger(v)) return formatBinaryInteger(v);
  if (isComplex(v)) return `(${formatReal(v.re, DEFAULT_DISPLAY)}, ${formatReal(v.im, DEFAULT_DISPLAY)})`;
  if (isName(v))    return v.id;
  if (isSymbolic(v)) return formatAlgebra(v.expr);
  return null;
}

// Arithmetic +, -, *, /, ^ are registered later in this file via
// `_withTaggedBinary(_binaryMathMixed(op))` — that pass is the single
// source of truth for scalar arithmetic dispatch (Tagged, BinInt×Real
// mixing, String-concat on `+`).  The second-pass still calls
// `binaryMath('+')(s)` as the generic numeric fallback inside the `+`
// handler, so `binaryMath` itself is live.

/* -------------------- unary ops --------------------
   Each numeric unary op checks for a symbolic operand (Symbolic or
   Name) first and emits a Symbolic(AST) wrapping the operator; other-
   wise it dispatches on Real/Integer/Complex as before.
   ---------------------------------------------------------------- */
/* NEG has Tagged transparency.  The unary wrapper unwraps the tag,
   applies NEG, and re-tags with the same label ("reactive:-x" stays
   "reactive:-x"-shaped).  List and V/M branches in the inner handler
   run unchanged. */
register('NEG', _withTaggedUnary(_withListUnary((s) => {
  const v = s.pop();
  if (_isSymOperand(v))  { s.push(Symbolic(AstNeg(_toAst(v)))); return; }
  if (isReal(v))     s.push(Real(v.value.neg()));
  else if (isInteger(v)) s.push(Integer(-v.value));
  else if (isRational(v)) {
    // APPROX mode collapses to Real (flag says "decimals"); EXACT stays
    // exact — negate the numerator only.
    if (getApproxMode()) {
      const r = new Decimal(v.n.toString()).div(new Decimal(v.d.toString())).neg();
      s.push(Real(r));
    }
    else s.push(Rational(-v.n, v.d));
  }
  else if (isComplex(v)) s.push(Complex(-v.re, -v.im));
  else if (isUnit(v))    s.push(Unit(-v.value, v.uexpr));
  else if (isVector(v))  s.push(Vector(v.items.map(x => _scalarBinary('-', Real(0), x))));
  else if (isMatrix(v))  s.push(Matrix(v.rows.map(row => row.map(x => _scalarBinary('-', Real(0), x)))));
  else throw new RPLError('Bad argument type');
})), { category: 'Arithmetic', categoryOrder: 5, label: "NEG" });


/* INV has Tagged + List transparency.  V/M is NOT element-wise for
   INV — a Matrix here means "compute the matrix inverse", not "invert
   each element".  Tagged wraps outside List so `Tagged('M', RList(…))`
   and `Tagged('M', Matrix(…))` both retag the result. */
register('INV', _withTaggedUnary(_withListUnary((s) => {
  const v = s.pop();
  if (_isSymOperand(v))  {
    s.push(Symbolic(AstBin('/', AstNum(1), _toAst(v))));
    return;
  }
  if (isReal(v)) {
    if (v.value.isZero()) throw new RPLError('Infinite result');
    s.push(Real(new Decimal(1).div(v.value)));
  } else if (isInteger(v)) {
    if (v.value === 0n) throw new RPLError('Infinite result');
    // 1/n: exact Rational in EXACT mode, Real in APPROX mode.
    // Special case ±1 → ±1 (stay Integer); otherwise 1/n is a proper
    // fraction.
    if (getApproxMode()) s.push(Real(1 / Number(v.value)));
    else if (v.value === 1n || v.value === -1n) s.push(Integer(v.value));
    else s.push(Rational(1n, v.value));
  } else if (isRational(v)) {
    if (v.n === 0n) throw new RPLError('Infinite result');
    // (a/b)^-1 = b/a.  APPROX collapses to Real.  In EXACT, if |a|==1
    // the result is integer-valued (d=1) so we emit Integer instead of
    // Rational(k, 1) for display cleanliness.
    if (getApproxMode()) s.push(Real(Number(v.d) / Number(v.n)));
    else if (v.n === 1n)  s.push(Integer(v.d));
    else if (v.n === -1n) s.push(Integer(-v.d));
    else                  s.push(Rational(v.d, v.n));
  } else if (isComplex(v)) {
    const d = v.re * v.re + v.im * v.im;
    if (d === 0) throw new RPLError('Infinite result');
    s.push(Complex(v.re / d, -v.im / d));
  } else if (isUnit(v)) {
    if (v.value === 0) throw new RPLError('Infinite result');
    s.push(_makeUnit(1 / v.value, inverseUexpr(v.uexpr)));
  } else if (isMatrix(v)) {
    // Matrix inverse.  Requires square + numeric entries.
    // Non-square throws 'Invalid dimension'; singular throws 'Infinite
    // result' (matches scalar INV's division-by-zero error).  See
    // _invMatrixNumeric below.
    const n = v.rows.length;
    const cols = n > 0 ? v.rows[0].length : 0;
    if (n !== cols) throw new RPLError('Invalid dimension');
    if (n === 0) { s.push(v); return; }
    s.push(Matrix(_invMatrixNumeric(v.rows)));
  } else throw new RPLError('Bad argument type');
})), { category: 'Arithmetic', categoryOrder: 6, label: "INV" });


/* ABS has Tagged transparency.  The inner V/M branches compute the
   Frobenius norm (a scalar); the re-tag then wraps that scalar, e.g.
   `v:[3 4] ABS` → `v:5`. */
register('ABS', _withTaggedUnary(_withListUnary((s) => {
  const v = s.pop();
  if (_isSymOperand(v))  { s.push(Symbolic(AstFn('ABS', [_toAst(v)]))); return; }
  if (isReal(v))    s.push(Real(v.value.abs()));
  else if (isInteger(v)) s.push(Integer(v.value < 0n ? -v.value : v.value));
  else if (isRational(v)) {
    // |a/b| = |a|/b (d is always positive by Rational invariant).
    // APPROX collapses to Real.
    if (getApproxMode()) {
      const r = new Decimal(v.n.toString()).div(new Decimal(v.d.toString())).abs();
      s.push(Real(r));
    }
    else s.push(Rational(v.n < 0n ? -v.n : v.n, v.d));
  }
  else if (isComplex(v)) s.push(Real(Math.hypot(v.re, v.im)));
  else if (isUnit(v))    s.push(Unit(Math.abs(v.value), v.uexpr));
  else if (isVector(v)) {
    // HP50 Advanced Guide: ABS on an array returns the Frobenius
    // (Euclidean) norm — identical behavior to NORM.  Use Decimal
    // arithmetic so large-exponent components don't saturate to Infinity.
    s.push(Real(_decimalFrobeniusNorm(v.items)));
  } else if (isMatrix(v)) {
    s.push(Real(_decimalFrobeniusNorm(v.rows.flat())));
  } else throw new RPLError('Bad argument type');
})), { category: 'Arithmetic', categoryOrder: 7, label: "ABS" });


/* SQ has Tagged transparency.  V/M is NOT wrapped — HP50 SQ on a
   Vector is `V · V` (dot product, scalar) and on a Matrix is `M · M`
   (matmul), both handled by the `*` op; an element-wise wrapper here
   would silently break that semantic. */
register('SQ', _withTaggedUnary(_withListUnary((s) => {
  const v = s.pop();
  if (_isSymOperand(v))  { s.push(Symbolic(AstBin('^', _toAst(v), AstNum(2)))); return; }
  if (isReal(v))    s.push(Real(v.value.times(v.value)));
  else if (isInteger(v)) s.push(Integer(v.value * v.value));
  else if (isRational(v)) {
    // (a/b)^2 = a^2/b^2 — gcd is still 1 (squaring preserves coprime).
    // Collapse to Real in APPROX; otherwise keep exact.
    if (getApproxMode()) {
      const r = new Decimal(v.n.toString()).div(new Decimal(v.d.toString()));
      s.push(Real(r.times(r)));
    } else s.push(Rational(v.n * v.n, v.d * v.d));
  }
  else if (isComplex(v)) s.push(Complex(
    v.re * v.re - v.im * v.im,
    2 * v.re * v.im,
  ));
  else if (isUnit(v)) s.push(Unit(v.value * v.value, powerUexpr(v.uexpr, 2)));
  else throw new RPLError('Bad argument type');
})), { category: 'Arithmetic', categoryOrder: 8, label: "SQ" });


// SQRT has Tagged transparency and Vector/Matrix element-wise
// dispatch.  Element-wise on Vector/Matrix is the HP50 behavior —
// there's no whole-array SQRT (matrix square root is a SCHUR-style
// decomposition the calculator doesn't expose).
register('SQRT', _withTaggedUnary(_withListUnary(_withVMUnary((s) => {
  const v = s.pop();
  if (_isSymOperand(v))  { s.push(Symbolic(AstFn('SQRT', [_toAst(v)]))); return; }
  if (isComplex(v) || (isReal(v) && v.value.isNegative()) ||
      (isInteger(v) && v.value < 0n) ||
      (isRational(v) && v.n < 0n)) {
    const c = toComplex(v);
    const r = Math.hypot(c.re, c.im);
    const re = Math.sqrt((r + c.re) / 2);
    const im = Math.sign(c.im || 1) * Math.sqrt((r - c.re) / 2);
    s.push(Complex(re, im));
  } else if (isRational(v) && !getApproxMode()) {
    // EXACT mode, non-negative Rational: attempt exact square-root.
    // Both numerator and denominator must be perfect squares — then
    // SQRT(a/b) = √a/√b stays a Rational (collapse to Integer when
    // d=1).  Otherwise lift to Symbolic(SQRT(a/b)) to preserve
    // exactness — pressing →NUM later folds to the decimal.
    const sn = _bigIntIsqrt(v.n);
    const sd = _bigIntIsqrt(v.d);
    if (sn !== null && sd !== null) {
      if (sd === 1n) s.push(Integer(sn));
      else           s.push(Rational(sn, sd));
    } else s.push(Symbolic(AstFn('SQRT', [_toAst(v)])));
  } else if (isInteger(v) && !getApproxMode()) {
    // EXACT mode, non-negative Integer: exact sqrt if perfect square,
    // else lift to Symbolic(SQRT(n)) so the irrational stays symbolic
    // (HP50 flag -105 CLEAR semantics — press →NUM to decimate).
    const sn = _bigIntIsqrt(v.value);
    if (sn !== null) s.push(Integer(sn));
    else             s.push(Symbolic(AstFn('SQRT', [_toAst(v)])));
  } else {
    // Use Decimal.sqrt() so values with |exp| > 308 work correctly.
    const d = isReal(v) ? v.value : new Decimal(isInteger(v) ? v.value.toString() : toRealOrThrow(v));
    if (d.isNegative()) throw new RPLError('Bad argument value');
    s.push(Real(d.sqrt()));
  }
}))), { category: 'Arithmetic', categoryOrder: 9, label: "SQRT" });

/* Character picker and the HP50 heading both use `√`; without this,
   ENTER on an inserted glyph pushes Name('√') instead of running SQRT. */
register('√', (s) => { OPS.get('SQRT').fn(s); }, { category: 'Arithmetic', categoryOrder: 10, label: "√" });


/**
 * Integer square root for non-negative BigInt.  Returns the exact
 * BigInt sqrt if `n` is a perfect square, otherwise `null`.  Used by
 * SQRT's Rational fast-path to keep exactness when both numerator and
 * denominator are perfect squares (e.g. SQRT(4/9) → 2/3).
 *
 * Algorithm: Newton's method on BigInt.  Fast enough for any Rational
 * the user is realistically going to stack — we're not going to sqrt
 * a 10000-digit rational without a CAS anyway.
 */
function _bigIntIsqrt(n) {
  if (n < 0n) return null;
  if (n < 2n) return n;
  // Initial guess: 2^(ceil(bitlen/2))
  let x = 1n;
  const bits = n.toString(2).length;
  x <<= BigInt((bits + 1) >> 1);
  // Newton iteration.
  let prev;
  do {
    prev = x;
    x = (x + n / x) >> 1n;
  } while (x < prev);
  // prev is floor(sqrt(n)); check perfect-square.
  return prev * prev === n ? prev : null;
}


/* -------------------- trig (angle-mode aware) --------------------
   SIN/COS/TAN take an angle in the active mode (DEG/RAD/GRD) and
   convert to radians before calling the Math.* primitive.  Inverse
   trig returns an angle in the active mode.  Symbolic/Name operands
   are lifted to `SIN(X)` / `ACOS(X)` etc. with no angle-mode
   conversion — the AST carries intent, not units.

   In EXACT mode, an Integer/Rational input that would produce a
   non-integer result stays symbolic (see _exactUnaryLift).  This
   matches the HP50 behavior under flag -105 CLEAR: `30 SIN` leaves
   `SIN(30)` on the stack; pressing →NUM then folds to 0.5 (in DEG).
   ----------------------------------------------------------------- */
// Real-only SIN/COS/TAN/ASIN/ACOS/ATAN/LN/LOG/EXP/ALOG were registered
// here in the first pass via `trigFwd` / `trigInv` / `unaryReal`.
// The Complex-aware registrations near `_trigFwdCx` / `_unaryCx`
// (late in this file) are the authoritative entry points.
// `unaryReal` remains live — R→D / D→R still use it.

/* --------------------- hyperbolic ---------------------
   SINH/COSH/TANH/ASINH/ACOSH/ATANH live in KNOWN_FUNCTIONS for
   parseAlgebra (so they participate in symbolic odd/even identities)
   and are registered here as stack ops so the MTH->HYP soft-menu can
   dispatch to them directly.  ACOSH requires x >= 1 and ATANH requires
   |x| < 1 — we defer to Math.acosh / Math.atanh which already return
   NaN for out-of-domain inputs, and throw RPLError to match how other
   domain-violation ops report.
   -------------------------------------------------------------------- */
// Hyperbolic SINH/COSH/TANH/ASINH/ACOSH/ATANH — first-pass Real-only
// registrations lived here (unaryReal-based plus domain-checked ACOSH/
// ATANH bodies).  See the `_unaryCx`
// registrations late in this file for the complex-aware authoritative
// versions, and the `_withTaggedUnary(_withListUnary(_withVMUnary(...)))`
// wrapping for Tagged / List / V/M widening.

/* -------- XROOT — n-th root, `y x XROOT` = y^(1/x) ----
   HP50 behavior: xth root of y (two-arg op).  Delegates to the binary
   `^` machinery so it picks up the Real/Integer/Complex coercion
   already implemented there.  We push `1/x` and then `^`.  Pure
   plumbing — no new numeric code.
   -------------------------------------------------------------------- */
register('XROOT', _withListBinary((s) => {
  if (s.depth < 2) throw new RPLError('Too few arguments');
  const x = s.pop();
  const y = s.pop();
  // Symbolic/Name on either arg emits 'XROOT(y,x)' — the parser and
  // simplifier already treat XROOT as a two-arg function, so this
  // round-trips cleanly through print/parse.
  if (_isSymOperand(y) || _isSymOperand(x)) {
    const yAst = _toAst(y);
    const xAst = _toAst(x);
    if (yAst && xAst) { s.push(Symbolic(AstFn('XROOT', [yAst, xAst]))); return; }
    throw new RPLError('Bad argument type');
  }
  // Promote x to Decimal so 1/x stays in Decimal space (avoids JS Infinity
  // for large-exponent values).  Then y^(1/x) goes through the Decimal ^ path.
  const dx = isReal(x) ? x.value
           : new Decimal(isInteger(x) ? x.value.toString() : toRealOrThrow(x));
  if (dx.isZero()) throw new RPLError('Infinite result');
  s.push(y);
  s.push(Real(new Decimal(1).div(dx)));
  lookup('^').fn(s);
}), { category: 'Arithmetic', categoryOrder: 11, label: "XROOT" });


/* ------------------------------------------------------------------
   More HP50 real-unary commands.

     FLOOR   greatest integer ≤ x          -1.2 FLOOR → -2
     CEIL    least integer ≥ x             -1.2 CEIL  → -1
     IP      integer part (truncate to 0)  -1.8 IP    → -1
     FP      fractional part, same sign     1.8 FP    →  0.8
     SIGN    -1 / 0 / 1 for real input; for Complex, the unit
             vector e^(iθ) — pushes a Complex of magnitude 1.
             HP50 returns 0 for exactly 0 (any type).

   FLOOR/CEIL/IP/FP preserve Integer type when the input is an
   Integer (no-op for IP/FLOOR/CEIL, 0n for FP) — matches HP50's
   tidy type behavior.  On a Real, they yield a Real (matching
   `toFixed(0)`-adjacent semantics).
   ------------------------------------------------------------------ */

/* FLOOR/CEIL/IP/FP cover R/Z plus element-wise on Vector / Matrix,
   Symbolic lift via KNOWN_FUNCTIONS, Tagged transparency (tag is
   preserved across the unary op), and Unit carriers.  Complex is
   rejected — HP50 raises "Bad Argument Type" on these for Complex
   since there is no well-defined ordering on C.  The symbolic form
   round-trips through the entry parser because FLOOR/CEIL/IP/FP are
   registered in KNOWN_FUNCTIONS (algebra.js).

   Unit: HP50 applies FLOOR/CEIL/IP/FP to the numeric part of a unit
   object and preserves the unit expression — `1.5_m FLOOR` -> `1_m`,
   `1.8_m FP` -> `.8_m`.  This is the real-valued scalar case (FP's
   fallback intFn returning `Integer(0n)` is never reached — a Unit
   carries a Real-typed value by construction, per types.js §Unit). */
function _rounderScalar(name, realFn, intFn) {
  return (v) => {
    if (isInteger(v))        return intFn(v);
    /* Rational: exact rounding via BigInt trunc/mod.  APPROX mode
       collapses to Real (consistent with the rest of the Rational
       plumbing — flag -3 says "decimals").  In EXACT mode, FLOOR/
       CEIL/IP return Integer, FP returns Rational (or Integer 0
       when the fractional part is zero). */
    if (isRational(v)) {
      if (getApproxMode()) {
        // Use Decimal so the division doesn't lose precision before rounding.
        const dr = new Decimal(v.n.toString()).div(new Decimal(v.d.toString()));
        let d;
        if      (name === 'FLOOR') d = dr.floor();
        else if (name === 'CEIL')  d = dr.ceil();
        else if (name === 'IP')    d = dr.trunc();
        else /* FP */              d = dr.minus(dr.trunc());
        return Real(d);
      }
      const n = v.n, d = v.d;           // d > 0 by Rational invariant
      const q = n / d;                  // BigInt trunc-toward-zero
      const r = n % d;                  // remainder, sign follows n
      if (name === 'FP') {
        return r === 0n ? Integer(0n) : Rational(r, d);
      }
      if (r === 0n)          return Integer(q);
      if (name === 'IP')     return Integer(q);
      if (name === 'FLOOR')  return Integer(n < 0n ? q - 1n : q);
      if (name === 'CEIL')   return Integer(n > 0n ? q + 1n : q);
    }
    /* BinaryInteger: BinInts are always integer-valued, so rounding is
       a no-op.  HP50 AUR §3 accepts BinInt on FLOOR/CEIL/IP/FP.  FP of
       any integer = 0; preserve base. */
    if (isBinaryInteger(v))  return name === 'FP'
      ? BinaryInteger(0n, v.base)
      : v;
    if (isReal(v)) {
      // Use Decimal methods so values beyond IEEE-754 range round correctly.
      let d;
      if      (name === 'FLOOR') d = v.value.floor();
      else if (name === 'CEIL')  d = v.value.ceil();
      else if (name === 'IP')    d = v.value.trunc();
      else /* FP */              d = v.value.minus(v.value.trunc());
      return Real(d);
    }
    if (isUnit(v))           return Unit(realFn(v.value), v.uexpr);  // Unit.value is JS number
    if (_isSymOperand(v))    return Symbolic(AstFn(name, [_toAst(v)]));
    throw new RPLError('Bad argument type');
  };
}

const _floorScalar = _rounderScalar('FLOOR', Math.floor, v => v);

const _ceilScalar  = _rounderScalar('CEIL',  Math.ceil,  v => v);

const _ipScalar    = _rounderScalar('IP',    Math.trunc, v => v);

const _fpScalar    = _rounderScalar('FP',    (x) => x - Math.trunc(x), () => Integer(0n));


function _registerRounder(name, scalarFn, opts) {
  register(name, _withTaggedUnary(_withListUnary((s) => {
    const v = s.pop();
    if (isVector(v))      s.push(Vector(v.items.map(scalarFn)));
    else if (isMatrix(v)) s.push(Matrix(v.rows.map(r => r.map(scalarFn))));
    else                  s.push(scalarFn(v));
  })), opts);
}

_registerRounder('FLOOR', _floorScalar, { category: 'Arithmetic', categoryOrder: 12, label: 'FLOOR' });

_registerRounder('CEIL', _ceilScalar, { category: 'Arithmetic', categoryOrder: 13, label: 'CEIL' });

_registerRounder('IP', _ipScalar, { category: 'Arithmetic', categoryOrder: 14, label: 'IP' });

_registerRounder('FP', _fpScalar, { category: 'Arithmetic', categoryOrder: 15, label: 'FP' });


/* SIGN covers R/Z/C plus Vector (unit direction), Matrix element-wise
   (HP50's Matrix-SIGN is scalar-element-wise — a matrix has no single
   direction), Symbolic lift, and Tagged transparency. */
register('SIGN', _withTaggedUnary(_withListUnary((s) => {
  const v = s.pop();
  if (isReal(v)) {
    // Decimal.sign() returns -1, 0, or 1 without a .toNumber() round-trip.
    s.push(Real(new Decimal(v.value.isNegative() ? -1 : v.value.isZero() ? 0 : 1)));
  } else if (isInteger(v)) {
    if (v.value === 0n) s.push(Integer(0n));
    else s.push(Integer(v.value > 0n ? 1n : -1n));
  } else if (isRational(v)) {
    // d is always positive by invariant, so sign(n/d) = sign(n).
    // SIGN is already exact-valued (-1, 0, 1), so no APPROX branch.
    if (v.n === 0n)      s.push(Integer(0n));
    else                 s.push(Integer(v.n > 0n ? 1n : -1n));
  } else if (isComplex(v)) {
    // Unit vector e^(iθ) — zero input yields 0+0i.
    const mag = Math.hypot(v.re, v.im);
    if (mag === 0) s.push(Complex(0, 0));
    else s.push(Complex(v.re / mag, v.im / mag));
  } else if (isVector(v)) {
    // HP50 Advanced Guide defines SIGN on a vector as v / ||v||
    // (unit vector in the direction of v).  Zero vector stays zero —
    // matches the scalar-SIGN convention on 0.  Use Decimal so
    // large-exponent components don't saturate to Infinity.
    const mag = _decimalFrobeniusNorm(v.items);
    if (mag.isZero()) { s.push(v); return; }
    s.push(Vector(v.items.map(x => {
      const d = isReal(x) ? x.value : new Decimal(x.value.toString());
      return Real(d.div(mag));
    })));
  } else if (isMatrix(v)) {
    // Matrix: apply SIGN to each scalar entry.  Real/Integer/Complex
    // entries go through the scalar cases above via recursion.
    s.push(Matrix(v.rows.map(r => r.map(x => {
      if (isReal(x))    return Real(new Decimal(x.value.isNegative() ? -1 : x.value.isZero() ? 0 : 1));
      if (isInteger(x)) return x.value === 0n ? Integer(0n) : Integer(x.value > 0n ? 1n : -1n);
      if (isComplex(x)) {
        const m = Math.hypot(x.re, x.im);
        return m === 0 ? Complex(0, 0) : Complex(x.re / m, x.im / m);
      }
      if (_isSymOperand(x)) return Symbolic(AstFn('SIGN', [_toAst(x)]));
      throw new RPLError('Bad argument type');
    }))));
  } else if (_isSymOperand(v)) {
    s.push(Symbolic(AstFn('SIGN', [_toAst(v)])));
  } else {
    throw new RPLError('Bad argument type');
  }
})), { category: 'Arithmetic', categoryOrder: 16, label: "SIGN" });


/* ------------------------------------------------------------------
   Binary real ops — MOD, MIN, MAX.

     MOD     a MOD b : remainder of a/b, HP50 convention (result has
             the sign of the divisor b).  Note this differs from JS `%`
             (which takes the sign of the dividend).
     MIN/MAX straightforward min / max of two numeric values.

   Type handling: Integer/Integer stays Integer, anything with a Real
   becomes Real.  Complex arguments are rejected (HP50 likewise).
   ------------------------------------------------------------------ */

/** HP50 MOD: result has the sign of the divisor.  (a - b * floor(a/b)) */
/** HP50 MOD on Decimals — floor-div convention (result has sign of divisor). */
function _hp50ModDecimal(a, b) {
  if (b.isZero()) throw new RPLError('Infinite result');
  // a mod b = a - b * floor(a/b)
  return a.minus(b.times(a.div(b).floor()));
}


/** HP50 MOD on BigInts — floor-div convention matches _hp50ModReal. */
function _hp50ModBigInt(a, b) {
  if (b === 0n) throw new RPLError('Infinite result');
  let r = a % b;
  // JS % on BigInt takes sign of dividend; flip to divisor's sign when
  // they disagree.
  if (r !== 0n && ((r < 0n) !== (b < 0n))) r += b;
  return r;
}


/* MOD lifts to Symbolic when either operand is a Name / Symbolic
   (matches how +, -, * lift), and is transparent across Tagged
   wrappers.  Complex is rejected — HP50 has no complex-MOD definition
   (ordering & sign of divisor make no sense in C). */
register('MOD', _withTaggedBinary(_withListBinary((s) => {
  const [a, b] = s.popN(2);
  if (_isSymOperand(a) || _isSymOperand(b)) {
    const l = _toAst(a), r = _toAst(b);
    if (!l || !r) throw new RPLError('Bad argument type');
    s.push(Symbolic(AstFn('MOD', [l, r])));
    return;
  }
  if (!isNumber(a) || !isNumber(b)) throw new RPLError('Bad argument type');
  if (isComplex(a) || isComplex(b)) throw new RPLError('Bad argument type');
  if (isInteger(a) && isInteger(b)) {
    s.push(Integer(_hp50ModBigInt(a.value, b.value)));
  } else {
    // Promote both sides to Decimal so values beyond IEEE-754 range work.
    const da = isReal(a) ? a.value : new Decimal(isInteger(a) ? a.value.toString() : toRealOrThrow(a));
    const db = isReal(b) ? b.value : new Decimal(isInteger(b) ? b.value.toString() : toRealOrThrow(b));
    s.push(Real(_hp50ModDecimal(da, db)));
  }
})), { category: 'Arithmetic', categoryOrder: 17, label: "MOD" });


/* MIN/MAX have Symbolic lift (leaves MIN(X,3) un-evaluated when X is
   unbound) and Tagged transparency.  Complex is rejected — C has no
   total ordering. */
function _minMax(s, wantMin, name) {
  const [a, b] = s.popN(2);
  if (_isSymOperand(a) || _isSymOperand(b)) {
    const l = _toAst(a), r = _toAst(b);
    if (!l || !r) throw new RPLError('Bad argument type');
    s.push(Symbolic(AstFn(name, [l, r])));
    return;
  }
  if (!isNumber(a) || !isNumber(b)) throw new RPLError('Bad argument type');
  if (isComplex(a) || isComplex(b)) throw new RPLError('Bad argument type');
  if (isInteger(a) && isInteger(b)) {
    const aWins = wantMin ? (a.value <= b.value) : (a.value >= b.value);
    s.push(Integer(aWins ? a.value : b.value));
  } else {
    // Promote to Decimal so large-exponent values compare correctly.
    const da = isReal(a) ? a.value : new Decimal(isInteger(a) ? a.value.toString() : toRealOrThrow(a));
    const db = isReal(b) ? b.value : new Decimal(isInteger(b) ? b.value.toString() : toRealOrThrow(b));
    const cmp = da.comparedTo(db);
    const aWins = wantMin ? (cmp <= 0) : (cmp >= 0);
    s.push(Real(aWins ? da : db));
  }
}

register('MIN', _withTaggedBinary(_withListBinary((s) => _minMax(s, true,  'MIN'))), { category: 'Arithmetic', categoryOrder: 21, label: "MIN" });

register('MAX', _withTaggedBinary(_withListBinary((s) => _minMax(s, false, 'MAX'))), { category: 'Arithmetic', categoryOrder: 22, label: "MAX" });


/* ================================================================
   INCR / DECR
   →ARRY / ARRY→ (array compose / decompose)
   SORT / REVLIST (list combinators)
   SF / CF / FS? / FC? / FS?C / FC?C (user flags)
   CHR / NUM (string codepoint ops)

   Advanced Guide refs: §3 (INCR / DECR), §13 (→ARRY / ARRY→),
   §5 (SORT / REVLIST), §2 (flag ops), §14 (CHR / NUM).

   All 14 ops are user-reachable from the typed catalog.
   ================================================================ */

/* ----------------------------------------------------------------
   INCR / DECR — increment / decrement a stored variable by 1 and
   leave the NEW value on the stack.

   HP50 behavior (Advanced Guide §3):
     'X' INCR  →  X := X + 1 ;  pushes new X
     'X' DECR  →  X := X - 1 ;  pushes new X

   Accepts either a Name or a String as the level-1 argument (mirrors
   STO+ / STO-).  The stored value is the LEFT operand of the bin-op
   (so DECR on X=10 gives 9, not -9).  Missing variable → "Undefined
   name".  Stored value must be arithmetic-compatible with Real(1) —
   numeric types and Symbolic all pass through the same `+` / `-`
   dispatch that STO+ / STO- use, so this works for `Symbolic('X')`
   too.
   ---------------------------------------------------------------- */
function _incrDecrOp(opSymbol) {
  // Deferred lookup — see _stoArith for rationale.
  return (s) => {
    const binop = lookup(opSymbol);
    if (!binop) throw new RPLError('Bad argument value');
    const [nameVal] = s.popN(1);
    if (!isName(nameVal) && !isString(nameVal)) {
      throw new RPLError('Bad argument type');
    }
    // INCR / DECR writes through to `id`, so validate up-front.
    const id = _coerceStorableName(nameVal);
    const stored = varRecall(id);
    if (stored === undefined) throw new RPLError(`Undefined name: ${id}`);
    s.push(stored);
    s.push(Real(1));
    binop.fn(s);
    const [result] = s.popN(1);
    varStore(id, result);
    s.push(result);
  };
}


register('INCR', _incrDecrOp('+'), { category: 'Arithmetic', categoryOrder: 31, label: "INCR" });

register('DECR', _incrDecrOp('-'), { category: 'Arithmetic', categoryOrder: 30, label: "DECR" });


/* --------------- XPON / MANT — Real decomposition ---------------
   HP50 AUR p.3-6 / p.3-9.  Given a real `x`, the mantissa `m` and
   exponent `e` are such that `m * 10^e = x` with `|m| < 10` and
   `|m| >= 1` for x != 0.  XPON returns e (as a Real), MANT returns m
   (as a Real).  XPON(0) = 0 by HP50 convention; MANT(0) = 0.
   Integer inputs coerce to Real first.
   ---------------------------------------------------------------- */
function _xponOf(x) {
  if (x === 0) return 0;
  return Math.floor(Math.log10(Math.abs(x)));
}

register('XPON', _withTaggedUnary(_withListUnary(_withVMUnary((s) => {
  const v = s.pop();
  if (_isSymOperand(v)) { s.push(Symbolic(AstFn('XPON', [_toAst(v)]))); return; }
  if (!isReal(v) && !isInteger(v)) throw new RPLError('Bad argument type');
  const x = Number(isInteger(v) ? v.value : v.value);
  s.push(Real(_xponOf(x)));
}))), { category: 'Arithmetic', categoryOrder: 26, label: "XPON" });

register('MANT', _withTaggedUnary(_withListUnary(_withVMUnary((s) => {
  const v = s.pop();
  if (_isSymOperand(v)) { s.push(Symbolic(AstFn('MANT', [_toAst(v)]))); return; }
  if (!isReal(v) && !isInteger(v)) throw new RPLError('Bad argument type');
  const x = Number(isInteger(v) ? v.value : v.value);
  if (x === 0) { s.push(Real(0)); return; }
  const e = _xponOf(x);
  s.push(Real(x / Math.pow(10, e)));
}))), { category: 'Arithmetic', categoryOrder: 25, label: "MANT" });


/* --------------- RND / TRNC — rounding to n places ---------------
   HP50 AUR p.3-9.  Two stack args: value (Real/Complex), count.
   COUNT semantics:
     n >= 0       → round to n decimal places
     -1..-11      → round to (−n) significant figures  (rare; we accept
                    the range but clamp to the precision JS can offer)
   RND  ( x n → y )  nearest, half-away-from-zero (matches HP50 spec)
   TRNC ( x n → y )  toward zero
   Complex input rounds each component independently.  Integer input
   with n >= 0 rounds back to Integer-typed output; with significant
   figures it's returned as Real (consistent with HP50).
   ---------------------------------------------------------------- */
function _roundHalfAwayFromZero(x, n) {
  const p = Math.pow(10, n);
  return (x >= 0 ? Math.floor(x * p + 0.5) : -Math.floor(-x * p + 0.5)) / p;
}

function _truncTowardZero(x, n) {
  const p = Math.pow(10, n);
  return Math.trunc(x * p) / p;
}

function _applyRoundReal(x, n, fn) {
  // n >= 0 → decimal places.  n < 0 → significant figures (|n| digits).
  if (n >= 0) return fn(x, n);
  if (x === 0) return 0;
  const sig = -n;
  const xpon = _xponOf(x);
  // Round so the most significant digit is the `sig`-th digit.
  const places = (sig - 1) - xpon;
  return fn(x, places);
}

function _roundingOp(name, fn) {
  return (s) => {
    const nv = s.pop();
    const xv = s.pop();
    const n = Number(isInteger(nv) ? nv.value : toRealOrThrow(nv));
    if (!Number.isInteger(n) || n < -11 || n > 11) {
      throw new RPLError('Bad argument value');
    }
    if (isComplex(xv)) {
      s.push(Complex(_applyRoundReal(xv.re, n, fn),
                     _applyRoundReal(xv.im, n, fn)));
      return;
    }
    if (isInteger(xv) && n >= 0) {
      // Integer rounded to a non-negative decimal place is itself.
      s.push(xv);
      return;
    }
    if (!isReal(xv) && !isInteger(xv)) throw new RPLError('Bad argument type');
    const x = isInteger(xv) ? Number(xv.value) : xv.value;
    s.push(Real(_applyRoundReal(x, n, fn)));
  };
}

register('RND',  _roundingOp('RND',  _roundHalfAwayFromZero), { category: 'Arithmetic', categoryOrder: 18, label: "RND" });

register('TRNC', _roundingOp('TRNC', _truncTowardZero), { category: 'Arithmetic', categoryOrder: 19, label: "TRNC" });


/* --------------- TRUNC — CAS-form truncate ---------------
   HP50 AUR §3.1 lists TRUNC as a CAS sibling of TRNC with identical
   numeric semantics but an additional Symbolic lift: a Name / Symbolic
   value leaves an unevaluated `TRUNC(x, n)` node on the stack instead
   of erroring.  Same (x, n → y) stack shape as TRNC; same half-digit
   behaviour; same rejection error strings.  Reuses `_roundingOp` so
   any future precision fix on the rounding helpers lands on both ops.

   Symbolic lift applies when either argument is a Name or Symbolic:
   `'X' 3 TRUNC` → `'TRUNC(X,3)'`.  If `n` is symbolic, we keep the
   expression unevaluated (the CAS caller may substitute later).  The
   numeric rejection rules from `_roundingOp` still fire for plain
   numeric inputs — e.g. non-integer `n`, `n` outside [-11, 11].  */

function _truncOp() {
  const numeric = _roundingOp('TRUNC', _truncTowardZero);
  return (s) => {
    if (s.depth < 2) throw new RPLError('Too few arguments');
    const nv = s.peek(1);
    const xv = s.peek(2);
    if (_isSymOperand(xv) || _isSymOperand(nv)) {
      s.popN(2);
      const l = _toAst(xv), r = _toAst(nv);
      if (!l || !r) throw new RPLError('Bad argument type');
      s.push(Symbolic(AstFn('TRUNC', [l, r])));
      return;
    }
    numeric(s);
  };
}

// Tagged transparency + List distribution.  n (level 1) may also be a
// List (pairwise broadcast) or a scalar applied to every x in a List.
// Vector/Matrix are deliberately rejected — no _withVMBinary exists and
// TRUNC element-wise on V/M has no HP50 precedent (mirrors MOD/MIN/MAX).
register('TRUNC', _withTaggedBinary(_withListBinary(_truncOp())), { category: 'Arithmetic', categoryOrder: 20, label: "TRUNC" });


/* --------------- Percent family — %, %T, %CH ---------------
   HP50 AUR p.3-1.
     %   ( x y → x*y/100 )                 percent of a number
     %T  ( x y → 100*y/x )                 y is what percent of x
     %CH ( x y → 100*(y-x)/x )             percent change from x to y
   All three are numeric (Real/Integer).  Symbolic/Name input on
   either operand lifts to a Symbolic expression using the canonical
   AST fold — matches how +, *, / behave for symbolic inputs.
   ---------------------------------------------------------------- */
function _percentAst(kind, l, r) {
  // kind: 'PCT', 'PCTT', 'PCTCH'
  if (kind === 'PCT')  return AstBin('/', AstBin('*', l, r), AstNum(100));
  if (kind === 'PCTT') return AstBin('/', AstBin('*', AstNum(100), r), l);
  /* PCTCH */         return AstBin('/', AstBin('*', AstNum(100),
                          AstBin('-', r, l)), l);
}

/* The percent family picks up Tagged transparency and List distribution.
   V/M broadcast is intentionally NOT added — HP50 AUR describes
   %/%T/%CH only for scalar operands; making them broadcast element-wise
   over a vector would be a unilateral invention.  Complex is rejected
   (`toRealOrThrow` on Complex throws). */
function _percentOp(kind, computeNumeric, errorsOnZeroX) {
  return _withTaggedBinary(_withListBinary((s) => {
    const y = s.pop();
    const x = s.pop();
    if (_isSymOperand(x) || _isSymOperand(y)) {
      s.push(Symbolic(_percentAst(kind, _toAst(x), _toAst(y))));
      return;
    }
    const xn = toRealOrThrow(x);
    const yn = toRealOrThrow(y);
    if (errorsOnZeroX && xn === 0) throw new RPLError('Infinite result');
    s.push(Real(computeNumeric(xn, yn)));
  }));
}

register('%',   _percentOp('PCT',   (x, y) => x * y / 100,          false), { category: 'Arithmetic', categoryOrder: 27, label: "%" });

register('%T',  _percentOp('PCTT',  (x, y) => 100 * y / x,          true), { category: 'Arithmetic', categoryOrder: 29, label: "%T" });

register('%CH', _percentOp('PCTCH', (x, y) => 100 * (y - x) / x,    true), { category: 'Arithmetic', categoryOrder: 28, label: "%CH" });


/* =================================================================
   Real constants (MAXR / MINR),
   HMS family (→HMS / HMS→ / HMS+ / HMS-),
   BinInt shift / rotate (SL, SR, SLB, SRB, ASR,
                          RL, RR, RLB, RRB),
   List/Vector/Matrix combinator (MAP).

   Advanced Guide refs: §3.1 (MAXR/MINR), §3.3 (HMS family),
   §10.1 (shift/rotate), §15 (MAP).
   ================================================================= */

/* --------------- MAXR / MINR — real-limit constants ---------------
   HP50 AUR p. 3-1.  MAXR is the largest representable finite real and
   MINR is the smallest positive normal real.  These derive from the
   current `realMaxExp` setting (default 999, configurable via STMXE):
     MAXR = 9.99999999999e+<realMaxExp>
     MINR = 1e-<realMaxExp>
   decimal.js represents them exactly since its exponent range reaches
   9e15.  No arguments, no symbolic lift — literal pushes.
   ---------------------------------------------------------------- */
register('MAXR', (s) => {
  const e = getRealMaxExp();
  s.push(Real(new Decimal(`9.99999999999e+${e}`)));
}, { category: 'Arithmetic', categoryOrder: 24, label: "MAXR" });

register('MINR', (s) => {
  const e = getRealMaxExp();
  s.push(Real(new Decimal(`1e-${e}`)));
}, { category: 'Arithmetic', categoryOrder: 23, label: "MINR" });


function _hmsBinary(name, fn) {
  return (s) => {
    const b = s.pop();
    const a = s.pop();
    if (isComplex(a) || isComplex(b)) throw new RPLError('Bad argument type');
    const ah = _hmsToHours(toRealOrThrow(a));
    const bh = _hmsToHours(toRealOrThrow(b));
    s.push(Real(_hoursToHms(fn(ah, bh))));
  };
}


register('→HMS',  _hmsUnary('→HMS',  (h) => _hoursToHms(h)), { category: 'Arithmetic', categoryOrder: 34, label: "→HMS" });

register('HMS→',  _hmsUnary('HMS→',  (h) => _hmsToHours(h)), { category: 'Arithmetic', categoryOrder: 35, label: "HMS→" });

register('HMS+',  _hmsBinary('HMS+', (a, b) => a + b), { category: 'Arithmetic', categoryOrder: 32, label: "HMS+" });

register('HMS-',  _hmsBinary('HMS-', (a, b) => a - b), { category: 'Arithmetic', categoryOrder: 33, label: "HMS-" });


/* --------------- Mixed BinInt ↔ Real/Integer arithmetic ---------------
   HP50 AUR §10.1: when a BinaryInteger meets a Real or Integer in a
   numeric op, the Real/Integer is coerced to a BinInt by truncating
   toward zero and masking to the current wordsize.  The BinInt
   operand's display base wins.

       #FFh 3 +         → #102h          (3 is coerced to #3h)
       3 #FFh +         → #102h          (base is still 'h' — BinInt's)
       #20h 2.7 *       → #40h           (2.7 → #2h via trunc)
       #5h 0 *          → #0h            (kept as BinInt zero)

   Dividing by a coerced-zero throws the integer-family 'Division by
   zero'.  A Complex operand on either side is still 'Bad argument
   type' — BinInt promotion is integer-only.

   Implementation: patch `_scalarBinary`'s early reject of mixed-type
   BinInt operands into a coercion branch that routes through
   `binIntBinary` with the BinInt side's base preserved.  This change
   is deliberately minimal — no new pathway in `binaryMath`, since the
   Vector/Matrix/Unit branches never see BinInt arguments.
   ----------------------------------------------------------------- */

/** Coerce a Real/Integer value to a BinaryInteger by truncating toward
 *  zero.  Masking to wordsize happens inside binIntBinary already, so
 *  we hand over the raw BigInt payload.  Base is provided by the
 *  caller (the actual-BinInt operand's base). */
function _coerceToBinInt(v, base) {
  if (isBinaryInteger(v)) return v;
  if (isInteger(v)) {
    // Negative integers wrap via two's-complement at mask time; clamp
    // to non-negative in the constructor by adding 2^w.  Since the
    // mask happens inside binIntBinary, just hand over the raw BigInt.
    const raw = v.value;
    // BinaryInteger ctor clamps negative to 0, but we want wrap.  Do
    // the wrap here: add 2^w if negative.
    if (raw < 0n) {
      const w = BigInt(getWordsize());
      const mod = 1n << w;
      return BinaryInteger(((raw % mod) + mod) % mod, base);
    }
    return BinaryInteger(raw, base);
  }
  if (isReal(v)) {
    if (!v.value.isFinite()) throw new RPLError('Bad argument value');
    const bi = BigInt(v.value.trunc().toFixed(0));
    if (bi < 0n) {
      const w = BigInt(getWordsize());
      const mod = 1n << w;
      return BinaryInteger(((bi % mod) + mod) % mod, base);
    }
    return BinaryInteger(bi, base);
  }
  throw new RPLError('Bad argument type');
}


// Replace the original _scalarBinary entirely; last registration wins.
// We export the mutation by re-defining the op functions that capture
// _scalarBinary.  Since _scalarBinary is used internally (not exported)
// and referenced by `binaryMath` through closure, we patch those
// registrations rather than the helper.  Approach: add a new helper
// `_scalarBinaryMixed` that tries BinInt-mixed coercion first, then
// falls back to the original logic via a direct inline copy for the
// non-BinInt branches.
function _scalarBinaryMixed(op, a, b) {
  const aBin = isBinaryInteger(a);
  const bBin = isBinaryInteger(b);
  if (aBin && bBin) return binIntBinary(op, a, b);
  if (aBin && (isInteger(b) || isReal(b))) {
    const bb = _coerceToBinInt(b, a.base);
    return binIntBinary(op, a, bb);
  }
  if (bBin && (isInteger(a) || isReal(a))) {
    const aa = _coerceToBinInt(a, b.base);
    return binIntBinary(op, aa, b);
  }
  // Mixed BinInt with a non-numeric (Complex, Symbolic, Unit, String…)
  // falls through to the original _scalarBinary for its existing
  // error / symbolic / unit / string handling.  We can call it
  // directly — it throws 'Bad argument type' for the mixed case
  // because it is still gated on `aBin || bBin` at the top.  To avoid
  // that early reject, route non-BinInt pairs only.
  if (aBin || bBin) {
    // e.g. BinInt + Complex  or  BinInt + Symbolic
    if (_isSymOperand(a) || _isSymOperand(b)) {
      // Same fallback path as _scalarBinary's symbolic branch — lift
      // both to an AST.  BinInt doesn't have an AST representation,
      // so this will throw 'Bad argument type' via _toAst's null
      // return.  Keep as-is.
      const l = _toAst(a);
      const r = _toAst(b);
      if (l && r) return Symbolic(AstBin(op, l, r));
    }
    throw new RPLError('Bad argument type');
  }
  return _scalarBinary(op, a, b);
}


// Rewire +, -, *, /, ^ through the mixed-aware scalar combiner.  We
// don't touch binaryMath itself; instead we replace the registered
// fns with wrappers that try the mixed-BinInt path first and hand
// off to binaryMath when no BinInt is involved.
function _binaryMathMixed(op) {
  const orig = binaryMath(op);
  return (s) => {
    if (s.depth >= 2) {
      const a = s.peek(2);               // level2
      const b = s.peek(1);               // level1
      const aBin = isBinaryInteger(a);
      const bBin = isBinaryInteger(b);
      if ((aBin && !bBin && (isInteger(b) || isReal(b))) ||
          (bBin && !aBin && (isInteger(a) || isReal(a)))) {
        s.popN(2);
        s.push(_scalarBinaryMixed(op, a, b));
        return;
      }
    }
    orig(s);
  };
}


/* Tagged transparency wrapped around the arithmetic family.
   `_withTaggedBinary` drops the tag(s) before the handler sees either
   operand.  This plays correctly with every existing branch:
     - String concat inside `+` sees the untagged String (so
       `Tagged('note','hi') "!" +` → `"hi!"` rather than a type error).
     - BinInt + Real/Integer promotion operates on the untagged numeric
       sides.
     - The inner `binaryMath(op)` sees the untagged operands and runs
       its existing V/M, scalar, and _scalarBinary dispatch unchanged.
   Binary ops drop the tag (there is no single obvious tag to keep).
   */
register('+', _withTaggedBinary((s) => {
  // List ∘ anything (or anything ∘ List) → HP50 AUR §3-7 list addition:
  //   { a … } { b … } +   → { a … b … }   (concatenate)
  //   { a … }      x  +   → { a … x }     (append)
  //        x  { a … } +   → { x a … }     (prepend)
  // Lists take precedence over String concatenation and over the
  // generic numeric / element-wise binaryMath fallback — element-wise
  // list arithmetic is reserved for ADD / DOLIST.  Tagged operands are
  // unwrapped by `_withTaggedBinary` before this handler sees them, so
  // a Tagged-wrapped list still hits this branch.
  if (s.depth >= 2) {
    const a = s.peek(2), b = s.peek(1);
    const aL = isList(a), bL = isList(b);
    if (aL || bL) {
      s.popN(2);
      if (aL && bL)  s.push(RList([...a.items, ...b.items]));
      else if (aL)   s.push(RList([...a.items, b]));
      else           s.push(RList([a, ...b.items]));
      return;
    }
    if (isString(a) || isString(b)) {
      const [x, y] = s.popN(2);
      const l = _stringCoerce(x), r = _stringCoerce(y);
      if (l == null || r == null) throw new RPLError('Bad argument type');
      s.push(Str(l + r));
      return;
    }
    const aBin = isBinaryInteger(a);
    const bBin = isBinaryInteger(b);
    if ((aBin && !bBin && (isInteger(b) || isReal(b))) ||
        (bBin && !aBin && (isInteger(a) || isReal(a)))) {
      s.popN(2);
      s.push(_scalarBinaryMixed('+', a, b));
      return;
    }
  }
  binaryMath('+')(s);
}), { category: 'Arithmetic', categoryOrder: 0, label: "+" });

register('-',  _withTaggedBinary(_binaryMathMixed('-')), { category: 'Arithmetic', categoryOrder: 1, label: "-" });

register('*',  _withTaggedBinary(_binaryMathMixed('*')), { category: 'Arithmetic', categoryOrder: 2, label: "*" });

register('/',  _withTaggedBinary(_binaryMathMixed('/')), { category: 'Arithmetic', categoryOrder: 3, label: "/" });

register('^',  _withTaggedBinary(_binaryMathMixed('^')), { category: 'Arithmetic', categoryOrder: 4, label: "^" });


/* --------------- →Q — rationalize a Real to a fraction ---------------
   HP50 AUR §3.5.  Given a Real x, finds the best Integer/Integer
   fraction within a bounded denominator that equals x to double
   precision.  Output is a Symbolic AST of `a/b` (or just `a` when
   denom=1, or the value as a Num when x is already an exact integer).

   Algorithm: Stern-Brocot continued-fraction convergents — standard
   textbook approach.  Iterate until the convergent matches x to
   double precision OR the denominator passes a cap (1e10, well above
   any HP50-realistic "best rational").  The convergent's denominator
   is a canonical expression of the precision limit: x = 0.1 → `1/10`,
   x = 0.333333333333 → `1/3`, x = 3.14159265358979 → `245850922/78256779`.

   Integer input or integer-valued Real: returns `Num(n)` (no /1 form).
   Negative: wrap the numerator's sign so the `/` stays between
   positive integers (e.g. -0.5 → Neg(1/2)).  Complex / String etc.
   are rejected.
   ----------------------------------------------------------------- */
const _QMAX_DENOM = 1e10;

const _QMAX_ITERS = 64;


function _continuedFractionConvergent(x) {
  // Stern-Brocot mediant: track two convergents (h0/k0, h1/k1) and
  // advance via `a = floor(b)`; `h2 = a*h1 + h0`, `k2 = a*k1 + k0`.
  const sign = x < 0 ? -1 : 1;
  let b = Math.abs(x);
  let h0 = 0, h1 = 1;
  let k0 = 1, k1 = 0;
  for (let i = 0; i < _QMAX_ITERS; i++) {
    const a = Math.floor(b);
    const h2 = a * h1 + h0;
    const k2 = a * k1 + k0;
    if (k2 > _QMAX_DENOM) break;
    h0 = h1; h1 = h2;
    k0 = k1; k1 = k2;
    const frac = b - a;
    if (frac < 1e-15) break;    // converged within Real precision
    b = 1 / frac;
    if (!Number.isFinite(b)) break;
  }
  return { n: sign * h1, d: k1 };
}


register('→Q', (s) => {
  const [v] = s.popN(1);
  // Integer stays integer: represent as Symbolic(Num(n)) per HP50 spec
  // that →Q returns a Symbolic, but no /1 denominator.
  if (isInteger(v)) {
    s.push(Symbolic(AstNum(Number(v.value))));
    return;
  }
  if (!isReal(v)) throw new RPLError('Bad argument type');
  const x = v.value.toNumber();
  if (!Number.isFinite(x)) throw new RPLError('Bad argument value');
  if (x === 0) { s.push(Symbolic(AstNum(0))); return; }
  if (Number.isInteger(x)) { s.push(Symbolic(AstNum(x))); return; }
  const { n, d } = _continuedFractionConvergent(x);
  if (d === 1) { s.push(Symbolic(AstNum(n))); return; }
  // Compose a/b with sign carried by the numerator's sign.  For a
  // negative-numerator rational we wrap in Neg so the printed form
  // reads `-(3/4)` rather than `(-3)/4` — matches HP50 display.
  if (n < 0) {
    s.push(Symbolic(AstNeg(AstBin('/', AstNum(-n), AstNum(d)))));
  } else {
    s.push(Symbolic(AstBin('/', AstNum(n), AstNum(d))));
  }
}, { category: 'Arithmetic', categoryOrder: 40, label: "→Q" });



/* =================================================================
   Q→ decompose, D→HMS / HMS→D bridges,
   RREF / RANK (Gauss-Jordan), CON constant matrix/vector.

   All items user-reachable from the typed catalog today.  No UI
   wiring changes.  Advanced Guide refs:
     §3.5   (Q→ decompose the Symbolic n/d from →Q)
     §3.3   (D→HMS / HMS→D — degree aliases for →HMS / HMS→)
     §15.4  (RREF / RANK — Gauss-Jordan row reduction)
     §15.2  (CON — constant-fill matrix/vector builder)
   ================================================================= */

/* --------------- Q→ — decompose Symbolic n/d back to integer pair ------
   HP50 AUR §3.5.  Inverse of →Q.  Pops a Symbolic of the shape produced
   by →Q (an integer, `n/d`, or `-(n/d)`) and pushes two Integers: the
   (signed) numerator at level 2 and the denominator at level 1.  A bare
   integer Symbolic decomposes as `( n 1 )` — `d = 1` — matching the HP50
   convention that "every integer is an integer over one".

   Accepted shapes (all produced by →Q or commonly parseable):
     Symbolic(Num(n))                  →  ( n 1 )
     Symbolic(Bin('/', Num(n), Num(d)))→  ( n d )
     Symbolic(Neg(Bin('/', Num(n), Num(d))))  →  ( -n d )
     Symbolic(Neg(Num(n)))             →  ( -n 1 )
     Integer(n) / Real(n)              →  ( n 1 )  (convenience — HP50
                                                    also accepts bare
                                                    numerics on Q→)

   Non-integer numerator/denominator (e.g. 1/3.14) throws Bad argument
   value — Q→ is specifically about integer rationals.  Any other
   Symbolic shape (a*b, a+b, SIN(x), etc.) throws Bad argument type.
   ----------------------------------------------------------------- */

function _astIntOrThrow(n, msg = 'Bad argument value') {
  if (!n || n.kind !== 'num') throw new RPLError(msg);
  if (!Number.isFinite(n.value) || !Number.isInteger(n.value)) {
    throw new RPLError(msg);
  }
  return BigInt(n.value);
}


function _qDecompose(sym) {
  // Returns [num, den] as BigInts.
  if (sym.kind === 'num') {
    return [_astIntOrThrow(sym), 1n];
  }
  if (sym.kind === 'neg') {
    const [n, d] = _qDecompose(sym.arg);
    return [-n, d];
  }
  if (sym.kind === 'bin' && sym.op === '/') {
    const n = _astIntOrThrow(sym.l);
    const d = _astIntOrThrow(sym.r);
    if (d === 0n) throw new RPLError('Infinite result');
    return [n, d];
  }
  throw new RPLError('Bad argument type');
}


register('Q→', (s) => {
  const [v] = s.popN(1);
  // Bare numerics: convenience pass-through.  HP50's Q→ accepts these
  // too (the integer-over-one form) so programs that round-trip
  // `3 →Q Q→` see `3 1` on the stack.
  if (isInteger(v))  { s.push(Integer(v.value)); s.push(Integer(1n)); return; }
  if (isReal(v)) {
    if (!v.value.isInteger()) throw new RPLError('Bad argument value');
    s.push(Integer(BigInt(v.value.toFixed(0)))); s.push(Integer(1n)); return;
  }
  if (!isSymbolic(v)) throw new RPLError('Bad argument type');
  const [n, d] = _qDecompose(v.expr);
  s.push(Integer(n));
  s.push(Integer(d));
}, { category: 'Arithmetic', categoryOrder: 41, label: "Q→" });


/* --------------- D→HMS / HMS→D — degree aliases for →HMS / HMS→ -------
   HP50 AUR §3.3.  D→HMS converts a decimal-degree value into DD.MMSS
   form; HMS→D goes the other way.  The numeric format is identical to
   the H:M:S form used by →HMS / HMS→ (the leading integer is the whole
   unit, next two digits are minutes/arcminutes, remaining are
   seconds/arcseconds).  So these are registered as aliases of the
   existing `_hmsUnary` helpers.  ASCII aliases `D->HMS` / `HMS->D`
   register alongside the Unicode glyphs so users on keyboards without
   `→` can type them.
   ----------------------------------------------------------------- */
register('D→HMS',  _hmsUnary('D→HMS',  (h) => _hoursToHms(h)), { category: 'Arithmetic', categoryOrder: 36, label: "D→HMS" });

register('HMS→D',  _hmsUnary('HMS→D',  (h) => _hmsToHours(h)), { category: 'Arithmetic', categoryOrder: 37, label: "HMS→D" });


/* --------------- RAND / RDZ — seeded PRNG ---------------------------
   HP50 AUR §17.5.

   RAND  ( → r )   Push a uniform Real in [0, 1) drawn from the PRNG
                   (Park-Miller minimal-standard LCG; see state.js).

   RDZ   ( n → )   Re-seed the PRNG.  n = 0 → use the system clock
                   (Date.now()), otherwise use n as the seed (reduced
                   into the LCG's valid range).  Takes Integer or
                   Real (integer-valued).  Complex / Symbolic throws.

   The PRNG state is shared with RANM so `RDZ 12345 { 2 3 } RANM`
   produces a deterministic matrix every time the same seed is used —
   matching HP50 behaviour.
   ----------------------------------------------------------------- */

register('RAND', (s) => {
  s.push(Real(nextPrngUnit()));
}, { category: 'Arithmetic', categoryOrder: 38, label: "RAND" });


register('RDZ', (s) => {
  const [v] = s.popN(1);
  if (isInteger(v)) { seedPrng(v.value); return; }
  if (isReal(v)) {
    // HP50 accepts any Real; we require integer-valued to avoid
    // silently losing the fractional part.
    if (!v.value.isInteger()) throw new RPLError('Bad argument value');
    seedPrng(v.value.toNumber());
    return;
  }
  throw new RPLError('Bad argument type');
}, { category: 'Arithmetic', categoryOrder: 39, label: "RDZ" });


/* --------------- →Qπ — rationalize as rational multiple of π ---------
   HP50 AUR §12.4.  Extension of →Q that tries to recognize a π factor
   in the input before rationalizing.  The quotient `x / π` is run
   through the same continued-fraction convergent as →Q; if it
   rationalizes to a reasonable p/d, the result is wrapped in a
   Symbolic multiplication by PI.

   Representation:
     numerator n = ±1, denominator 1:  ±π    →  Symbolic Var('PI')
                                                (or Neg of it)
     n = ±1, d > 1:                    ±π/d  →  PI / d
     |n| > 1, d = 1:                   ±n·π  →  n * PI
     |n| > 1, d > 1:                   ±n·π/d → (n * PI) / d
     n = 0:                            0      →  Symbolic Num(0)

   If the quotient doesn't rationalize cleanly (i.e. the continued
   fraction runs out before converging), we still emit the best
   p/d * π form — convergents are always rational.  Input must be a
   Real / Integer; Complex / Symbolic throws Bad argument type.
   ----------------------------------------------------------------- */

function _piSymbolic(n, d) {
  // Build the Symbolic AST for the rational multiple n/d of π.
  // Caller guarantees d ≥ 1 and sign is NOT reflected in n (always
  // positive numerator).  Returns an AST node ready for Symbolic().
  const PI = AstVar('PI');
  let core;
  if (n === 1) core = PI;
  else core = AstBin('*', AstNum(n), PI);
  if (d === 1) return core;
  return AstBin('/', core, AstNum(d));
}


register('→Qπ', (s) => {
  const [v] = s.popN(1);
  let x;
  if (isInteger(v)) x = Number(v.value);
  else if (isReal(v)) x = v.value.toNumber();
  else throw new RPLError('Bad argument type');
  if (!Number.isFinite(x)) throw new RPLError('Bad argument value');
  if (x === 0) { s.push(Symbolic(AstNum(0))); return; }
  const sign = x < 0 ? -1 : 1;
  const q = Math.abs(x) / Math.PI;
  const { n, d } = _continuedFractionConvergent(q);
  if (n === 0) {
    // Couldn't find any rational multiple of π close enough — fall back
    // to →Q semantics on the Real input.
    if (Number.isInteger(x)) { s.push(Symbolic(AstNum(x))); return; }
    const r = _continuedFractionConvergent(x);
    if (r.d === 1) { s.push(Symbolic(AstNum(r.n))); return; }
    if (r.n < 0) {
      s.push(Symbolic(AstNeg(AstBin('/', AstNum(-r.n), AstNum(r.d)))));
    } else {
      s.push(Symbolic(AstBin('/', AstNum(r.n), AstNum(r.d))));
    }
    return;
  }
  const core = _piSymbolic(n, d);
  if (sign < 0) {
    s.push(Symbolic(AstNeg(core)));
  } else {
    s.push(Symbolic(core));
  }
}, { category: 'Arithmetic', categoryOrder: 42, label: "→QΠ" });
