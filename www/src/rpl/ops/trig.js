import { setAngle, state as _calcState, getApproxMode, getComplexMode, toRadians, fromRadians } from '../state.js';
import { Symbolic, toRealOrThrow, Real, isComplex, Complex, isInteger, isRational, isReal } from '../types.js';
import { Fn as AstFn } from '../algebra.js';
import { RPLError } from '../stack.js';
import Decimal from '../../../vendor/decimal.js/decimal.mjs';
import { register } from './registry.js';
import { _cx, _cxAdd, _cxDiv, _cxMul, _cxSub, _exactUnaryLift, _isSymOperand, _toAst, _withListUnary, _withTaggedUnary, _withVMUnary, unaryReal } from './internal.js';



/* ------------------- angle-mode commands ------------------- */
register('DEG', () => setAngle('DEG'), { category: 'Trig / log / exp / hyperbolic', categoryOrder: 20, label: "DEG" });

register('RAD', () => setAngle('RAD'), { category: 'Trig / log / exp / hyperbolic', categoryOrder: 21, label: "RAD" });

register('GRD', () => setAngle('GRD'), { category: 'Trig / log / exp / hyperbolic', categoryOrder: 22, label: "GRD" });

// HP50 also accepts GRAD as an alias in some firmware versions.
register('GRAD', () => setAngle('GRD'), { category: 'Trig / log / exp / hyperbolic', categoryOrder: 23, label: "GRAD" });


/* -------------------- angle conversion helpers --------------------
   R→D (radians to degrees) and D→R (degrees to radians) operate on
   level 1 regardless of the active mode — they're explicit converters.
   ----------------------------------------------------------------- */
register('R→D', unaryReal(r => r * 180 / Math.PI), { category: 'Trig / log / exp / hyperbolic', categoryOrder: 18, label: "R→D" });

register('D→R', unaryReal(d => d * Math.PI / 180), { category: 'Trig / log / exp / hyperbolic', categoryOrder: 19, label: "D→R" });


/* --------------- LNP1 / EXPM — stable near zero ---------------
   LNP1(x) = ln(1 + x), evaluated without catastrophic cancellation
   when |x| << 1.  EXPM(x) = exp(x) - 1, same story.  Both delegate to
   JS's Math.log1p / Math.expm1, which implement the standard IEEE
   fused operations.  Symbolic inputs lift to LNP1(X) / EXPM(X) AST
   nodes so they round-trip through the parser.
   ---------------------------------------------------------------- */
// LNP1 / EXPM support Tagged + Vector / Matrix element-wise dispatch,
// matching the broader log / exp family.  Complex is *not* included —
// the stable-near-zero formulations are real-only on the HP50 (no
// Complex log1p / expm1 in the Advanced Reference).
register('LNP1', _withTaggedUnary(_withListUnary(_withVMUnary((s) => {
  const v = s.pop();
  if (_isSymOperand(v)) { s.push(Symbolic(AstFn('LNP1', [_toAst(v)]))); return; }
  const x = toRealOrThrow(v);
  if (x <= -1) throw new RPLError('Infinite result');
  s.push(Real(Math.log1p(x)));
}))), { category: 'Trig / log / exp / hyperbolic', categoryOrder: 10, label: "LNP1" });

register('EXPM', _withTaggedUnary(_withListUnary(_withVMUnary((s) => {
  const v = s.pop();
  if (_isSymOperand(v)) { s.push(Symbolic(AstFn('EXPM', [_toAst(v)]))); return; }
  const x = toRealOrThrow(v);
  s.push(Real(Math.expm1(x)));
}))), { category: 'Trig / log / exp / hyperbolic', categoryOrder: 11, label: "EXPM" });

function _cxExp(z) {
  const e = Math.exp(z.re);
  return { re: e * Math.cos(z.im), im: e * Math.sin(z.im) };
}

// Principal-branch natural log: ln r + i*θ, θ ∈ (-π, π].
function _cxLn(z) {
  const r = Math.hypot(z.re, z.im);
  if (r === 0) throw new RPLError('Infinite result');
  return { re: Math.log(r), im: Math.atan2(z.im, z.re) };
}

// Principal square root.
function _cxSqrt(z) {
  if (z.im === 0) {
    if (z.re >= 0) return { re: Math.sqrt(z.re), im: 0 };
    return { re: 0, im: Math.sqrt(-z.re) };
  }
  const r = Math.hypot(z.re, z.im);
  const re = Math.sqrt((r + z.re) / 2);
  const im = (z.im >= 0 ? 1 : -1) * Math.sqrt((r - z.re) / 2);
  return { re, im };
}

// Hyperbolic via exp: sinh(z) = (e^z - e^-z)/2, cosh(z) = (e^z + e^-z)/2.
function _cxSinh(z) {
  const ea = Math.exp(z.re), eb = Math.exp(-z.re);
  return {
    re: 0.5 * (ea - eb) * Math.cos(z.im),
    im: 0.5 * (ea + eb) * Math.sin(z.im),
  };
}

function _cxCosh(z) {
  const ea = Math.exp(z.re), eb = Math.exp(-z.re);
  return {
    re: 0.5 * (ea + eb) * Math.cos(z.im),
    im: 0.5 * (ea - eb) * Math.sin(z.im),
  };
}

function _cxTanh(z) {
  // tanh(a + bi) = (sinh(2a) + i sin(2b)) / (cosh(2a) + cos(2b))
  const a2 = 2 * z.re, b2 = 2 * z.im;
  const d = Math.cosh(a2) + Math.cos(b2);
  if (d === 0) throw new RPLError('Infinite result');
  return { re: Math.sinh(a2) / d, im: Math.sin(b2) / d };
}

// Trig via Euler: sin(z) = (e^iz - e^-iz)/(2i), cos(z) = (e^iz + e^-iz)/2.
function _cxSin(z) {
  // sin(a+bi) = sin a cosh b + i cos a sinh b
  return { re: Math.sin(z.re) * Math.cosh(z.im), im: Math.cos(z.re) * Math.sinh(z.im) };
}

function _cxCos(z) {
  // cos(a+bi) = cos a cosh b - i sin a sinh b
  return { re: Math.cos(z.re) * Math.cosh(z.im), im: -Math.sin(z.re) * Math.sinh(z.im) };
}

function _cxTan(z) {
  return _cxDiv(_cxSin(z), _cxCos(z));
}

// Inverse hyperbolic.
function _cxAsinh(z) {
  // asinh(z) = ln(z + sqrt(z^2 + 1))
  const zsq = _cxMul(z, z);
  const s = _cxSqrt(_cxAdd(zsq, _cx(1, 0)));
  return _cxLn(_cxAdd(z, s));
}

function _cxAcosh(z) {
  // acosh(z) = ln(z + sqrt(z-1)*sqrt(z+1))  — keeps the right branch
  // along the real-axis cut (principal: Re ≥ 0).
  const a = _cxSqrt(_cxSub(z, _cx(1, 0)));
  const b = _cxSqrt(_cxAdd(z, _cx(1, 0)));
  return _cxLn(_cxAdd(z, _cxMul(a, b)));
}

function _cxAtanh(z) {
  // atanh(z) = (ln(1+z) - ln(1-z)) / 2
  const one = _cx(1, 0);
  const num = _cxAdd(one, z);
  const den = _cxSub(one, z);
  return _cxMul(_cx(0.5, 0), _cxLn(_cxDiv(num, den)));
}

// Inverse trig.
function _cxAsin(z) {
  // asin(z) = -i * ln(iz + sqrt(1 - z^2))
  const i = _cx(0, 1);
  const minusI = _cx(0, -1);
  const zsq = _cxMul(z, z);
  const inside = _cxSqrt(_cxSub(_cx(1, 0), zsq));
  return _cxMul(minusI, _cxLn(_cxAdd(_cxMul(i, z), inside)));
}

function _cxAcos(z) {
  // acos(z) = π/2 - asin(z)
  const as = _cxAsin(z);
  return _cxSub(_cx(Math.PI / 2, 0), as);
}

function _cxAtan(z) {
  // atan(z) = (i/2) * (ln(1-iz) - ln(1+iz))
  const i = _cx(0, 1);
  const iz = _cxMul(i, z);
  const num = _cxLn(_cxSub(_cx(1, 0), iz));
  const den = _cxLn(_cxAdd(_cx(1, 0), iz));
  return _cxMul(_cx(0, 0.5), _cxSub(num, den));
}


/* ------------------- Complex-aware op builders ------------------- */

// Decimal-aware angle conversion helpers.  toRadians / fromRadians in
// state.js operate on JS numbers; these operate on Decimal instances so
// large or high-precision angles don't lose digits in conversion.
// π is cached at module-load precision (15 sig figs matches Decimal.set).
const _PI_D = new Decimal(Math.PI);

function _toRadiansDecimal(d) {
  switch (_calcState.angle) {
    case 'DEG': return d.times(_PI_D).div(180);
    case 'GRD': return d.times(_PI_D).div(200);
    default:    return d;
  }
}

function _fromRadiansDecimal(d) {
  switch (_calcState.angle) {
    case 'DEG': return d.times(180).div(_PI_D);
    case 'GRD': return d.times(200).div(_PI_D);
    default:    return d;
  }
}


// Build a unary op that accepts Real/Integer or Complex, falling through
// to a Symbolic lift for Name/Symbolic operands.
//
// Every Cx-aware builder also picks up Vector/Matrix element-wise
// dispatch (`_withVMUnary`) and Tagged transparency (`_withTaggedUnary`).
// Wrapper order — Tagged → List → V/M → scalar — matches the convention
// used by FLOOR / CEIL / IP / FP / SIGN / ARG: Tagged outermost so a
// tagged-of-list or tagged-of-matrix unwraps before dispatch and
// re-tags the container; List inside Tagged so list distribution
// re-enters the scalar handler at each leaf; V/M innermost so a bare
// Vector/Matrix distributes to per-element scalar handling.
//
// `decimalFn` — a (Decimal) => Decimal function used for Real operands.
// `realFn`    — kept for the EXACT-mode Integer/Rational fold check only
//               (those inputs are always small, so JS Math is fine there).
function _unaryCx(name, realFn, cxFn, decimalFn) {
  return _withTaggedUnary(_withListUnary(_withVMUnary((s) => {
    const v = s.pop();
    if (_isSymOperand(v)) {
      s.push(Symbolic(AstFn(name, [_toAst(v)])));
      return;
    }
    if (isComplex(v)) {
      const r = cxFn({ re: v.re, im: v.im });
      s.push(Complex(r.re, r.im));
      return;
    }
    // EXACT-mode transcendental preservation: Integer/Rational inputs to
    // LN/EXP/LOG/ALOG/SINH/COSH/TANH/ASINH stay symbolic unless the fold
    // produces a clean integer (LN(1)=0, EXP(0)=1, etc.).
    // These inputs are always small so JS Math is safe.
    if (!getApproxMode() && (isInteger(v) || isRational(v))) {
      const x = toRealOrThrow(v);
      const y = realFn(x);
      s.push(_exactUnaryLift(name, y, v));
      return;
    }
    // Real branch: promote to Decimal and apply decimalFn.
    const d = isReal(v) ? v.value : new Decimal(toRealOrThrow(v));
    const result = decimalFn(d);
    if (!result.isFinite()) {
      // Out-of-domain or overflow.  Under CMPLX mode lift to the
      // principal complex branch; otherwise raise a clean RPL error.
      if (getComplexMode() && cxFn) {
        const x = d.toNumber();
        const r = cxFn({ re: x, im: 0 });
        s.push(Complex(r.re, r.im));
        return;
      }
      throw new RPLError('Bad argument value');
    }
    s.push(Real(result));
  })));
}


// Trig forward (SIN/COS/TAN): angle in active mode on reals; Complex
// inputs are treated as radians (the only mathematically well-defined
// convention) and return a Complex.  Same Tagged / List / V/M wrapping
// as `_unaryCx`.
//
// `decimalFn` — (Decimal radians) => Decimal; applied after angle conversion.
function _trigFwdCx(name, realFn, cxFn, decimalFn) {
  return _withTaggedUnary(_withListUnary(_withVMUnary((s) => {
    const v = s.pop();
    if (_isSymOperand(v)) {
      s.push(Symbolic(AstFn(name, [_toAst(v)])));
      return;
    }
    if (isComplex(v)) {
      const r = cxFn({ re: v.re, im: v.im });
      s.push(Complex(r.re, r.im));
      return;
    }
    // EXACT-mode: Integer/Rational inputs stay symbolic unless the fold
    // produces a clean integer (e.g. SIN(0)=0 in RAD).  These inputs
    // are always small so JS Math is safe.
    if (!getApproxMode() && (isInteger(v) || isRational(v))) {
      const y = realFn(toRadians(toRealOrThrow(v)));
      s.push(_exactUnaryLift(name, y, v));
      return;
    }
    const d = isReal(v) ? v.value : new Decimal(toRealOrThrow(v));
    s.push(Real(decimalFn(_toRadiansDecimal(d))));
  })));
}


// Inverse trig (ASIN/ACOS/ATAN): result in active angle mode for reals;
// for Complex inputs, the real and imaginary parts of the computed
// radian value are both scaled through fromRadians (a no-op in RAD,
// the standard HP50-style behavior in DEG/GRD — the real part becomes
// degrees, the imaginary part is scaled the same so angle-mode
// round-trips through SIN/COS/TAN).  Same Tagged / List / V/M wrapping
// as `_unaryCx`.
//
// `decimalFn` — (Decimal) => Decimal returning radians; domain errors
//               return a non-finite Decimal.
function _trigInvCx(name, realFn, cxFn, decimalFn) {
  return _withTaggedUnary(_withListUnary(_withVMUnary((s) => {
    const v = s.pop();
    if (_isSymOperand(v)) {
      s.push(Symbolic(AstFn(name, [_toAst(v)])));
      return;
    }
    if (isComplex(v)) {
      const r = cxFn({ re: v.re, im: v.im });
      s.push(Complex(fromRadians(r.re), fromRadians(r.im)));
      return;
    }
    // EXACT-mode: Integer/Rational inputs stay symbolic unless the fold
    // produces a clean integer in the active angle mode (e.g. ASIN(0)=0).
    // These inputs are always small so JS Math is safe.
    if (!getApproxMode() && (isInteger(v) || isRational(v))) {
      const x = toRealOrThrow(v);
      const y = realFn(x);
      if (Number.isFinite(y)) {
        s.push(_exactUnaryLift(name, fromRadians(y), v));
        return;
      }
      // Out-of-domain: fall through so CMPLX-mode or error handling below
      // still applies.
    }
    const d = isReal(v) ? v.value : new Decimal(toRealOrThrow(v));
    const result = decimalFn(d);
    if (!result.isFinite()) {
      // |x| > 1 for ASIN/ACOS (or other out-of-domain input) lifts to
      // Complex under CMPLX mode, throws "Bad argument value" otherwise.
      if (getComplexMode() && cxFn) {
        const x = d.toNumber();
        const r = cxFn({ re: x, im: 0 });
        s.push(Complex(fromRadians(r.re), fromRadians(r.im)));
        return;
      }
      throw new RPLError('Bad argument value');
    }
    s.push(Real(_fromRadiansDecimal(result)));
  })));
}


/* ------------------ Re-register elementary functions ------------------
   Replaces the earlier (real-only) registrations at the top of ops.js.
   `register()` uses Map.set under the hood — last registration wins —
   so every earlier call site (EVAL, parser, catalog lookup) now goes
   through the Complex-aware path automatically.

   The fourth argument to _unaryCx / _trigFwdCx / _trigInvCx is the
   Decimal-native implementation used for Real operands.  The third
   argument (realFn / JS Math) is kept only for the EXACT-mode
   Integer/Rational fold check where inputs are always small.
   ----------------------------------------------------------------- */
register('LN',   _unaryCx('LN',   Math.log,   _cxLn,   d => d.ln()), { category: 'Trig / log / exp / hyperbolic', categoryOrder: 6, label: "LN" });

register('LOG',  _unaryCx('LOG',  Math.log10, (z) => _cxDiv(_cxLn(z), _cx(Math.LN10, 0)),
                                              d => d.ln().div(new Decimal(Math.LN10))), { category: 'Trig / log / exp / hyperbolic', categoryOrder: 7, label: "LOG" });

register('EXP',  _unaryCx('EXP',  Math.exp,   _cxExp,  d => d.exp()), { category: 'Trig / log / exp / hyperbolic', categoryOrder: 8, label: "EXP" });

register('ALOG', _unaryCx('ALOG', (x) => Math.pow(10, x),
                                       (z) => _cxExp(_cxMul(z, _cx(Math.LN10, 0))),
                                       d => new Decimal(10).pow(d)), { category: 'Trig / log / exp / hyperbolic', categoryOrder: 9, label: "ALOG" });


// SINH/COSH/TANH: Decimal.js's native Taylor-series methods hang for
// large arguments (|x| > ~100,000) because the series converges too
// slowly.  Replace with exp-based identities that are O(1) in the
// magnitude of the argument:
//   sinh(x) = (eˣ − e⁻ˣ) / 2
//   cosh(x) = (eˣ + e⁻ˣ) / 2
//   tanh(x) = (eˣ − e⁻ˣ) / (eˣ + e⁻ˣ)
// For very large |x|, d.exp() overflows to Infinity immediately (fast),
// which _unaryCx already handles by throwing RPLError / lifting to Complex.
// For TANH specifically, |tanh(x)| ≥ 1 − 2e⁻⁴³ for |x| > 50 so the
// Taylor series would converge anyway (just slowly); we short-circuit to
// ±1 directly — exact to 15 significant digits.
register('SINH',  _unaryCx('SINH',  Math.sinh,  _cxSinh,
  d => { const ex = d.exp(), enx = d.negated().exp(); return ex.minus(enx).div(2); }), { category: 'Trig / log / exp / hyperbolic', categoryOrder: 12, label: "SINH" });

register('COSH',  _unaryCx('COSH',  Math.cosh,  _cxCosh,
  d => { const ex = d.exp(), enx = d.negated().exp(); return ex.plus(enx).div(2); }), { category: 'Trig / log / exp / hyperbolic', categoryOrder: 13, label: "COSH" });

register('TANH',  _unaryCx('TANH',  Math.tanh,  _cxTanh,
  d => {
    if (d.abs().gt(50)) return new Decimal(d.isNegative() ? -1 : 1);
    return d.tanh();
  }), { category: 'Trig / log / exp / hyperbolic', categoryOrder: 14, label: "TANH" });

register('ASINH', _unaryCx('ASINH', Math.asinh, _cxAsinh, d => d.asinh()), { category: 'Trig / log / exp / hyperbolic', categoryOrder: 15, label: "ASINH" });

// ACOSH and ATANH preserve their domain checks on the real branch
// (x ≥ 1 for ACOSH, |x| < 1 for ATANH); Complex input goes to the
// principal-branch formula without a domain check.
// Same Tagged / List / V/M wrapping as the rest of the hyperbolic
// family.  ACOSH and ATANH have hand-written domain logic (ACOSH lifts
// x<1 to Complex; ATANH throws on x=±1) so they can't be expressed as
// plain `_unaryCx` calls — but the wrapper layers below are identical.
register('ACOSH', _withTaggedUnary(_withListUnary(_withVMUnary((s) => {
  const v = s.pop();
  if (_isSymOperand(v)) { s.push(Symbolic(AstFn('ACOSH', [_toAst(v)]))); return; }
  if (isComplex(v)) {
    const r = _cxAcosh({ re: v.re, im: v.im });
    s.push(Complex(r.re, r.im));
    return;
  }
  // EXACT Integer/Rational: small inputs, JS Math is fine.
  if (!getApproxMode() && (isInteger(v) || isRational(v))) {
    const x = toRealOrThrow(v);
    if (x >= 1) { s.push(_exactUnaryLift('ACOSH', Math.acosh(x), v)); return; }
    // x < 1: fall through to Complex lift below.
  }
  const d = isReal(v) ? v.value : new Decimal(toRealOrThrow(v));
  if (d.gte(1)) { s.push(Real(d.acosh())); return; }
  // Real x < 1 lifts to Complex (principal branch).
  const r = _cxAcosh({ re: d.toNumber(), im: 0 });
  s.push(Complex(r.re, r.im));
}))), { category: 'Trig / log / exp / hyperbolic', categoryOrder: 16, label: "ACOSH" });

register('ATANH', _withTaggedUnary(_withListUnary(_withVMUnary((s) => {
  const v = s.pop();
  if (_isSymOperand(v)) { s.push(Symbolic(AstFn('ATANH', [_toAst(v)]))); return; }
  if (isComplex(v)) {
    const r = _cxAtanh({ re: v.re, im: v.im });
    s.push(Complex(r.re, r.im));
    return;
  }
  // EXACT Integer/Rational: small inputs, JS Math is fine.
  if (!getApproxMode() && (isInteger(v) || isRational(v))) {
    const x = toRealOrThrow(v);
    if (x === 1 || x === -1) throw new RPLError('Infinite result');
    if (x > -1 && x < 1) { s.push(_exactUnaryLift('ATANH', Math.atanh(x), v)); return; }
    // |x| > 1: fall through to Complex lift below.
  }
  const d = isReal(v) ? v.value : new Decimal(toRealOrThrow(v));
  const one = new Decimal(1);
  if (d.abs().eq(one)) throw new RPLError('Infinite result');
  if (d.abs().lt(one)) { s.push(Real(d.atanh())); return; }
  // |x| > 1 lifts to Complex.
  const r = _cxAtanh({ re: d.toNumber(), im: 0 });
  s.push(Complex(r.re, r.im));
}))), { category: 'Trig / log / exp / hyperbolic', categoryOrder: 17, label: "ATANH" });


// SIN/COS/TAN: Decimal handles angle conversion and trig in full precision.
register('SIN', _trigFwdCx('SIN', Math.sin, _cxSin, d => d.sin()), { category: 'Trig / log / exp / hyperbolic', categoryOrder: 0, label: "SIN" });

register('COS', _trigFwdCx('COS', Math.cos, _cxCos, d => d.cos()), { category: 'Trig / log / exp / hyperbolic', categoryOrder: 1, label: "COS" });

register('TAN', _trigFwdCx('TAN', Math.tan, _cxTan, d => d.tan()), { category: 'Trig / log / exp / hyperbolic', categoryOrder: 2, label: "TAN" });


// ASIN/ACOS/ATAN: now use Decimal for real branch; domain handling and
// Complex lift are identical to before.
register('ASIN', _withTaggedUnary(_withListUnary(_withVMUnary((s) => {
  const v = s.pop();
  if (_isSymOperand(v)) { s.push(Symbolic(AstFn('ASIN', [_toAst(v)]))); return; }
  if (isComplex(v)) {
    const r = _cxAsin({ re: v.re, im: v.im });
    s.push(Complex(fromRadians(r.re), fromRadians(r.im)));
    return;
  }
  // EXACT Integer/Rational: small inputs, JS Math is fine.
  if (!getApproxMode() && (isInteger(v) || isRational(v))) {
    const x = toRealOrThrow(v);
    if (x >= -1 && x <= 1) { s.push(_exactUnaryLift('ASIN', fromRadians(Math.asin(x)), v)); return; }
  }
  const d = isReal(v) ? v.value : new Decimal(toRealOrThrow(v));
  const result = d.asin();
  if (!result.isFinite()) {
    const r = _cxAsin({ re: d.toNumber(), im: 0 });
    s.push(Complex(fromRadians(r.re), fromRadians(r.im)));
    return;
  }
  s.push(Real(_fromRadiansDecimal(result)));
}))), { category: 'Trig / log / exp / hyperbolic', categoryOrder: 3, label: "ASIN" });

register('ACOS', _withTaggedUnary(_withListUnary(_withVMUnary((s) => {
  const v = s.pop();
  if (_isSymOperand(v)) { s.push(Symbolic(AstFn('ACOS', [_toAst(v)]))); return; }
  if (isComplex(v)) {
    const r = _cxAcos({ re: v.re, im: v.im });
    s.push(Complex(fromRadians(r.re), fromRadians(r.im)));
    return;
  }
  // EXACT Integer/Rational: small inputs, JS Math is fine.
  if (!getApproxMode() && (isInteger(v) || isRational(v))) {
    const x = toRealOrThrow(v);
    if (x >= -1 && x <= 1) { s.push(_exactUnaryLift('ACOS', fromRadians(Math.acos(x)), v)); return; }
  }
  const d = isReal(v) ? v.value : new Decimal(toRealOrThrow(v));
  const result = d.acos();
  if (!result.isFinite()) {
    const r = _cxAcos({ re: d.toNumber(), im: 0 });
    s.push(Complex(fromRadians(r.re), fromRadians(r.im)));
    return;
  }
  s.push(Real(_fromRadiansDecimal(result)));
}))), { category: 'Trig / log / exp / hyperbolic', categoryOrder: 4, label: "ACOS" });

register('ATAN', _trigInvCx('ATAN', Math.atan, _cxAtan, d => d.atan()), { category: 'Trig / log / exp / hyperbolic', categoryOrder: 5, label: "ATAN" });
