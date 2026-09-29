import { setAngle, state as _calcState, getApproxMode, getComplexMode, toRadians, fromRadians } from '../state.js';
import { Symbolic, toRealOrThrow, Real, isComplex, Complex, isInteger, isRational, isReal } from '../types.js';
import { Fn as AstFn } from '../algebra.js';
import { RPLError } from '../stack.js';
import Decimal from '../../../vendor/decimal.js/decimal.mjs';
import { register } from './registry.js';
import { _cx, _cxAdd, _cxDiv, _cxMul, _cxSub, _exactUnaryLift, _isSymOperand, _toAst, _withListUnary, _withTaggedUnary, _withVMUnary, unaryReal } from './internal.js';



register('DEG', () => setAngle('DEG'), { category: 'Trig / log / exp / hyperbolic', categoryOrder: 20, label: "DEG" });

register('RAD', () => setAngle('RAD'), { category: 'Trig / log / exp / hyperbolic', categoryOrder: 21, label: "RAD" });

register('GRD', () => setAngle('GRD'), { category: 'Trig / log / exp / hyperbolic', categoryOrder: 22, label: "GRD" });

// HP50 also accepts GRAD as an alias in some firmware versions.
register('GRAD', () => setAngle('GRD'), { category: 'Trig / log / exp / hyperbolic', categoryOrder: 23, label: "GRAD" });


register('R→D', unaryReal('R→D', r => r * 180 / Math.PI), { category: 'Trig / log / exp / hyperbolic', categoryOrder: 18, label: "R→D" });

register('D→R', unaryReal('D→R', d => d * Math.PI / 180), { category: 'Trig / log / exp / hyperbolic', categoryOrder: 19, label: "D→R" });


function _unaryOp(name, scalarFn) {
  return _withTaggedUnary(_withListUnary(_withVMUnary((s) => {
    const v = s.pop();
    s.push(_isSymOperand(v) ? Symbolic(AstFn(name, [_toAst(v)])) : scalarFn(v));
  })));
}

function _isExact(v) {
  return !getApproxMode() && (isInteger(v) || isRational(v));
}

function _toDecimal(v) {
  return isReal(v) ? v.value : new Decimal(toRealOrThrow(v));
}

function _complex(z) {
  return Complex(z.re, z.im);
}

function _complexAngle(z) {
  return Complex(fromRadians(z.re), fromRadians(z.im));
}


// Real-only: the HP50 has no complex LNP1 / EXPM.
register('LNP1', _unaryOp('LNP1', (v) => {
  const x = toRealOrThrow(v);
  if (x <= -1) throw new RPLError('Infinite result');
  return Real(Math.log1p(x));
}), { category: 'Trig / log / exp / hyperbolic', categoryOrder: 10, label: "LNP1" });

register('EXPM', _unaryOp('EXPM', (v) => Real(Math.expm1(toRealOrThrow(v)))), { category: 'Trig / log / exp / hyperbolic', categoryOrder: 11, label: "EXPM" });

function _cxExp(z) {
  const e = Math.exp(z.re);
  return { re: e * Math.cos(z.im), im: e * Math.sin(z.im) };
}

function _cxLn(z) {
  const r = Math.hypot(z.re, z.im);
  if (r === 0) throw new RPLError('Infinite result');
  return { re: Math.log(r), im: Math.atan2(z.im, z.re) };
}

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
  const a2 = 2 * z.re, b2 = 2 * z.im;
  const d = Math.cosh(a2) + Math.cos(b2);
  if (d === 0) throw new RPLError('Infinite result');
  return { re: Math.sinh(a2) / d, im: Math.sin(b2) / d };
}

function _cxSin(z) {
  return { re: Math.sin(z.re) * Math.cosh(z.im), im: Math.cos(z.re) * Math.sinh(z.im) };
}

function _cxCos(z) {
  return { re: Math.cos(z.re) * Math.cosh(z.im), im: -Math.sin(z.re) * Math.sinh(z.im) };
}

function _cxTan(z) {
  return _cxDiv(_cxSin(z), _cxCos(z));
}

function _cxAsinh(z) {
  const zsq = _cxMul(z, z);
  const s = _cxSqrt(_cxAdd(zsq, _cx(1, 0)));
  return _cxLn(_cxAdd(z, s));
}

function _cxAcosh(z) {
  // sqrt(z-1)·sqrt(z+1) rather than sqrt(z²-1) keeps the principal branch on the real cut.
  const a = _cxSqrt(_cxSub(z, _cx(1, 0)));
  const b = _cxSqrt(_cxAdd(z, _cx(1, 0)));
  return _cxLn(_cxAdd(z, _cxMul(a, b)));
}

function _cxAtanh(z) {
  const one = _cx(1, 0);
  const num = _cxAdd(one, z);
  const den = _cxSub(one, z);
  return _cxMul(_cx(0.5, 0), _cxLn(_cxDiv(num, den)));
}

function _cxAsin(z) {
  const i = _cx(0, 1);
  const minusI = _cx(0, -1);
  const zsq = _cxMul(z, z);
  const inside = _cxSqrt(_cxSub(_cx(1, 0), zsq));
  return _cxMul(minusI, _cxLn(_cxAdd(_cxMul(i, z), inside)));
}

function _cxAcos(z) {
  const as = _cxAsin(z);
  return _cxSub(_cx(Math.PI / 2, 0), as);
}

function _cxAtan(z) {
  const i = _cx(0, 1);
  const iz = _cxMul(i, z);
  const num = _cxLn(_cxSub(_cx(1, 0), iz));
  const den = _cxLn(_cxAdd(_cx(1, 0), iz));
  return _cxMul(_cx(0, 0.5), _cxSub(num, den));
}


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


// `realFn` only folds EXACT Integer / Rational inputs; Reals go through the
// Decimal `decimalFn`.  Out-of-domain Reals lift to complex only under CMPLX.
function _unaryCx(name, realFn, cxFn, decimalFn) {
  return _unaryOp(name, (v) => {
    if (isComplex(v)) return _complex(cxFn(v));
    if (_isExact(v)) return _exactUnaryLift(name, realFn(toRealOrThrow(v)), v);
    const d = _toDecimal(v);
    const result = decimalFn(d);
    if (result.isFinite()) return Real(result);
    if (getComplexMode()) return _complex(cxFn({ re: d.toNumber(), im: 0 }));
    throw new RPLError('Bad argument value');
  });
}


// Complex arguments are taken in radians whatever the angle mode.
function _trigFwdCx(name, realFn, cxFn, decimalFn) {
  return _unaryOp(name, (v) => {
    if (isComplex(v)) return _complex(cxFn(v));
    if (_isExact(v)) return _exactUnaryLift(name, realFn(toRadians(toRealOrThrow(v))), v);
    return Real(decimalFn(_toRadiansDecimal(_toDecimal(v))));
  });
}


// Unlike _unaryCx, an out-of-domain Real always lifts to complex, CMPLX or
// not.  Both parts of a complex result are scaled into the angle mode.
function _trigInvCx(name, realFn, cxFn, decimalFn) {
  return _unaryOp(name, (v) => {
    if (isComplex(v)) return _complexAngle(cxFn(v));
    if (_isExact(v)) {
      const y = realFn(toRealOrThrow(v));
      if (Number.isFinite(y)) return _exactUnaryLift(name, fromRadians(y), v);
    }
    const d = _toDecimal(v);
    const result = decimalFn(d);
    return result.isFinite()
      ? Real(_fromRadiansDecimal(result))
      : _complexAngle(cxFn({ re: d.toNumber(), im: 0 }));
  });
}


register('LN',   _unaryCx('LN',   Math.log,   _cxLn,   d => d.ln()), { category: 'Trig / log / exp / hyperbolic', categoryOrder: 6, label: "LN" });

register('LOG',  _unaryCx('LOG',  Math.log10, (z) => _cxDiv(_cxLn(z), _cx(Math.LN10, 0)),
                                              d => d.ln().div(new Decimal(Math.LN10))), { category: 'Trig / log / exp / hyperbolic', categoryOrder: 7, label: "LOG" });

register('EXP',  _unaryCx('EXP',  Math.exp,   _cxExp,  d => d.exp()), { category: 'Trig / log / exp / hyperbolic', categoryOrder: 8, label: "EXP" });

register('ALOG', _unaryCx('ALOG', (x) => Math.pow(10, x),
                                       (z) => _cxExp(_cxMul(z, _cx(Math.LN10, 0))),
                                       d => new Decimal(10).pow(d)), { category: 'Trig / log / exp / hyperbolic', categoryOrder: 9, label: "ALOG" });


// Decimal's own sinh/cosh/tanh are Taylor series that hang for |x| > ~1e5, so
// build them from exp (which overflows quickly); tanh is ±1 to 15 digits past 50.
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

// ACOSH / ATANH lift out-of-domain Reals to complex whatever the CMPLX mode.
register('ACOSH', _unaryOp('ACOSH', (v) => {
  if (isComplex(v)) return _complex(_cxAcosh(v));
  if (_isExact(v)) {
    const x = toRealOrThrow(v);
    if (x >= 1) return _exactUnaryLift('ACOSH', Math.acosh(x), v);
  }
  const d = _toDecimal(v);
  return d.gte(1) ? Real(d.acosh()) : _complex(_cxAcosh({ re: d.toNumber(), im: 0 }));
}), { category: 'Trig / log / exp / hyperbolic', categoryOrder: 16, label: "ACOSH" });

register('ATANH', _unaryOp('ATANH', (v) => {
  if (isComplex(v)) return _complex(_cxAtanh(v));
  if (_isExact(v)) {
    const x = toRealOrThrow(v);
    if (x > -1 && x < 1) return _exactUnaryLift('ATANH', Math.atanh(x), v);
  }
  const d = _toDecimal(v);
  if (d.abs().eq(1)) throw new RPLError('Infinite result');
  return d.abs().lt(1) ? Real(d.atanh()) : _complex(_cxAtanh({ re: d.toNumber(), im: 0 }));
}), { category: 'Trig / log / exp / hyperbolic', categoryOrder: 17, label: "ATANH" });


register('SIN', _trigFwdCx('SIN', Math.sin, _cxSin, d => d.sin()), { category: 'Trig / log / exp / hyperbolic', categoryOrder: 0, label: "SIN" });

register('COS', _trigFwdCx('COS', Math.cos, _cxCos, d => d.cos()), { category: 'Trig / log / exp / hyperbolic', categoryOrder: 1, label: "COS" });

register('TAN', _trigFwdCx('TAN', Math.tan, _cxTan, d => d.tan()), { category: 'Trig / log / exp / hyperbolic', categoryOrder: 2, label: "TAN" });


register('ASIN', _trigInvCx('ASIN', Math.asin, _cxAsin, d => d.asin()), { category: 'Trig / log / exp / hyperbolic', categoryOrder: 3, label: "ASIN" });

register('ACOS', _trigInvCx('ACOS', Math.acos, _cxAcos, d => d.acos()), { category: 'Trig / log / exp / hyperbolic', categoryOrder: 4, label: "ACOS" });

register('ATAN', _trigInvCx('ATAN', Math.atan, _cxAtan, d => d.atan()), { category: 'Trig / log / exp / hyperbolic', categoryOrder: 5, label: "ATAN" });
