import { Symbolic, isInteger, isReal, Integer, Real, isVector, Vector, isMatrix, Matrix, isList, RList, isTagged, Tagged } from '../types.js';
import { Fn as AstFn, Num as AstNum } from '../algebra.js';
import { RPLError, checkTimeLimit } from '../stack.js';
import { register } from './registry.js';
import { _bigFactorial, _gamma, _isSymOperand, _lngamma, _regGammaQ, _toAst, _withListBinary, _withListUnary, _withTaggedBinary, _withTaggedUnary } from './internal.js';



function _realArg(v) {
  if (isInteger(v)) return Number(v.value);
  if (isReal(v)) return v.value.toNumber();
  throw new RPLError('Bad argument type');
}

function _finiteArg(v) {
  const x = _realArg(v);
  if (!Number.isFinite(x)) throw new RPLError('Bad argument value');
  return x;
}

function _notPole(x) {
  if (Number.isInteger(x) && x <= 0) throw new RPLError('Infinite result');
  return x;
}

function _realFn(name, fn, arg = _realArg) {
  return (v) => (_isSymOperand(v) ? Symbolic(AstFn(name, [_toAst(v)])) : Real(fn(arg(v))));
}

function _unaryOp(scalar) {
  return _withTaggedUnary(_withListUnary((s) => {
    const v = s.pop();
    if (isVector(v))      s.push(Vector(v.items.map(scalar)));
    else if (isMatrix(v)) s.push(Matrix(v.rows.map((r) => r.map(scalar))));
    else                  s.push(scalar(v));
  }));
}

// B2 through B12.
const _BERNOULLI = Object.freeze([1/6, -1/30, 1/42, -1/30, 5/66, -691/2730]);


function _gammaScalar(v) {
  if (_isSymOperand(v)) return Symbolic(AstFn('GAMMA', [_toAst(v)]));
  const x = _notPole(_realArg(v));
  if (isInteger(v)) return Integer(_bigFactorial(v.value - 1n));
  return Real(_gamma(x));
}


register('GAMMA', _unaryOp(_gammaScalar), { category: 'Special functions', categoryOrder: 0, label: "GAMMA" });


register('LNGAMMA', _unaryOp(_realFn('LNGAMMA', (x) => _lngamma(_notPole(x)))), { category: 'Special functions', categoryOrder: 1, label: "LNGAMMA" });


function _digamma(x) {
  if (!Number.isFinite(x)) throw new RPLError('Bad argument value');
  if (x <= 0 && Number.isInteger(x)) throw new RPLError('Infinite result');
  // Reflection ψ(x) = ψ(1 - x) - π cot(πx) keeps the series below at x >= 0.5.
  if (x < 0.5) {
    return _digamma(1 - x) - Math.PI / Math.tan(Math.PI * x);
  }
  let r = 0;
  while (x < 8) { r -= 1 / x; x += 1; }
  const xi  = 1 / x;
  const xi2 = xi * xi;
  r += Math.log(x) - 0.5 * xi;
  // Asymptotic tail -Σ B2k/(2k x^2k) in Horner form.
  r -= xi2 * (1/12 - xi2 * (1/120 - xi2 * (1/252 - xi2 * (1/240
       - xi2 * (1/132 - xi2 * 691/32760)))));
  return r;
}


// Shifts x up past 10 with ψ⁽ⁿ⁾(x) = ψ⁽ⁿ⁾(x+1) + (-1)^(n+1) n!/x^(n+1),
// then applies the asymptotic series.  The factorial loops stop once the
// product overflows, so a huge order cannot stall the page.
function _polygamma(n, x) {
  if (n === 0) return _digamma(x);
  if (!Number.isFinite(x)) throw new RPLError('Bad argument value');
  if (x <= 0 && Number.isInteger(x)) throw new RPLError('Infinite result');
  const sgn = (n % 2 === 0) ? -1 : 1;
  let nf = 1;
  for (let i = 2; i <= n && nf < Infinity; i++) nf *= i;
  let y = x;
  let tail = 0;
  while (y < 10) {
    checkTimeLimit();
    tail += Math.pow(y, -(n + 1));
    y += 1;
  }
  return sgn * nf * tail + _polygammaAsymptotic(n, y);
}


// (-1)^(n+1) [(n-1)!/y^n + n!/(2y^(n+1)) + Σ B2k (2k+n-1)!/(2k)! / y^(2k+n)]
function _polygammaAsymptotic(n, y) {
  const sgn = (n % 2 === 0) ? -1 : 1;
  let nm1f = 1;
  for (let i = 2; i <= n - 1 && nm1f < Infinity; i++) nm1f *= i;
  const nf = nm1f * n;
  let out = nm1f * Math.pow(y, -n) + (nf / 2) * Math.pow(y, -(n + 1));
  for (let k = 1; k <= _BERNOULLI.length; k++) {
    let rf = 1;
    for (let i = 1; i <= n - 1 && rf < Infinity; i++) rf *= (2 * k + i);
    out += _BERNOULLI[k - 1] * rf * Math.pow(y, -(2 * k + n));
  }
  return sgn * out;
}


const _psiScalar = _realFn('PSI', _digamma);


function _polygammaScalar(n, v) {
  if (_isSymOperand(v)) return Symbolic(AstFn('PSI', [_toAst(v), AstNum(n)]));
  const y = _polygamma(n, _realArg(v));
  if (!Number.isFinite(y)) throw new RPLError('Infinite result');
  return Real(y);
}


function _mapArg(v, fn) {
  if (isList(v))   return RList(v.items.map(fn));
  if (isTagged(v)) return Tagged(v.tag, fn(v.value));
  if (isVector(v)) return Vector(v.items.map(fn));
  if (isMatrix(v)) return Matrix(v.rows.map((r) => r.map(fn)));
  return fn(v);
}


// A non-negative integer on level 1 with an argument below it selects
// the polygamma form ( x n → ψ⁽ⁿ⁾(x) ), as on the HP50.
register('PSI', (s) => {
  const top = s.peek();
  let n = null;
  if (isInteger(top)) n = Number(top.value);
  else if (isReal(top) && top.value.isInteger()) n = top.value.toNumber();
  if (s.depth >= 2 && n !== null && n >= 0) {
    const [x] = s.popN(2);
    s.push(_mapArg(x, (v) => _polygammaScalar(n, v)));
    return;
  }
  s.push(_mapArg(s.pop(), _psiScalar));
}, { category: 'Special functions', categoryOrder: 2, label: "PSI" });


// Lower regularized gamma P(a, x).  The direct series avoids the
// cancellation in 1 - Q for small x, which is where erf needs it.
function _regGammaP(a, x) {
  if (x === 0) return 0;
  if (x < a + 1) {
    let sum = 1 / a, term = 1 / a, n = 1;
    while (n < 1000) {
      term *= x / (a + n);
      sum += term;
      if (Math.abs(term) < Math.abs(sum) * 1e-16) break;
      n++;
    }
    return sum * Math.exp(-x + a * Math.log(x) - _lngamma(a));
  }
  return 1 - _regGammaQ(a, x);
}


// The log form avoids overflow in Γ for large arguments.
function _betaScalar(a, b) {
  if (_isSymOperand(a) || _isSymOperand(b)) {
    const l = _toAst(a), r = _toAst(b);
    if (!l || !r) throw new RPLError('Bad argument type');
    return Symbolic(AstFn('Beta', [l, r]));
  }
  const x = _realArg(a);
  const y = _realArg(b);
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw new RPLError('Bad argument value');
  _notPole(x);
  _notPole(y);
  return Real(Math.exp(_lngamma(x) + _lngamma(y) - _lngamma(x + y)));
}


register('Beta', _withTaggedBinary(_withListBinary((s) => {
  const [a, b] = s.popN(2);
  s.push(_betaScalar(a, b));
})), { category: 'Special functions', categoryOrder: 3, label: "BETA" });


register('erf', _unaryOp(_realFn('erf', (x) => {
  if (x === 0) return 0;
  return (x < 0 ? -1 : 1) * _regGammaP(0.5, x * x);
}, _finiteArg)), { category: 'Special functions', categoryOrder: 4, label: "ERF" });


// Q(1/2, x²) directly, since 1 - erf(x) loses everything once erf(x) ≈ 1
// (erfc(5) ≈ 1.5e-12).
register('erfc', _unaryOp(_realFn('erfc', (x) => {
  if (x === 0) return 1;
  if (x > 0) return _regGammaQ(0.5, x * x);
  return 1 + _regGammaP(0.5, x * x);
}, _finiteArg)), { category: 'Special functions', categoryOrder: 5, label: "ERFC" });


const _ZETA_EM_N = 15;

const _EVEN_FACTORIALS = Object.freeze([2, 24, 720, 40320, 3628800, 479001600]);


// Euler-Maclaurin with N = 15 and six Bernoulli terms, good to about
// 1e-13 for s >= 1/2.
function _zetaEulerMaclaurin(s) {
  let sum = 0;
  for (let k = 1; k < _ZETA_EM_N; k++) sum += Math.pow(k, -s);
  sum += Math.pow(_ZETA_EM_N, 1 - s) / (s - 1);
  sum += 0.5 * Math.pow(_ZETA_EM_N, -s);
  let poch = s;
  let Nexp = Math.pow(_ZETA_EM_N, -s - 1);
  const invNsq = 1 / (_ZETA_EM_N * _ZETA_EM_N);
  for (let j = 1; j <= _BERNOULLI.length; j++) {
    sum += (_BERNOULLI[j - 1] / _EVEN_FACTORIALS[j - 1]) * poch * Nexp;
    poch *= (s + 2 * j - 1) * (s + 2 * j);
    Nexp *= invNsq;
  }
  return sum;
}


function _zeta(s) {
  if (!Number.isFinite(s)) throw new RPLError('Bad argument value');
  if (s === 1) throw new RPLError('Infinite result');
  if (s === 0) return -0.5;
  // Trivial zeros are exact; the reflection below would only get near 0.
  if (s < 0 && Number.isInteger(s) && (s % 2) === 0) return 0;
  if (s < 0.5) {
    // ζ(s) = 2^s π^(s-1) sin(πs/2) Γ(1-s) ζ(1-s)
    const sinPart = Math.sin(Math.PI * s / 2);
    const g = _gamma(1 - s);
    const z = _zeta(1 - s);
    return Math.pow(2, s) * Math.pow(Math.PI, s - 1) * sinPart * g * z;
  }
  return _zetaEulerMaclaurin(s);
}


register('ZETA', _unaryOp(_realFn('ZETA', _zeta)), { category: 'Special functions', categoryOrder: 9, label: "ZETA" });


// Principal branch W₀ by Halley iteration on W·e^W - x.
function _lambertW0(x) {
  if (!Number.isFinite(x)) throw new RPLError('Bad argument value');
  // Testing e·x + 1 rather than x against -1/e tolerates the roundoff in a
  // computed -1/e, and it is the Puiseux series' argument anyway.
  const ep1 = Math.E * x + 1;
  if (ep1 < 0) {
    if (ep1 < -1e-13) throw new RPLError('Bad argument value');
    return -1;
  }
  if (x === 0) return 0;
  let w;
  if (ep1 < 0.25) {
    // Near the branch point f'(-1) = 0 stalls Halley, so start from the
    // Puiseux series (Corless et al. 1996, eq. 4.22) in p = √(2(ex+1)).
    const p = Math.sqrt(2 * ep1);
    w = -1 + p * (1 + p * (-1/3 + p * (11/72 + p * (-43/540 + p * (769/17280)))));
  } else if (x >= Math.E) {
    const ln1 = Math.log(x);
    w = ln1 - Math.log(ln1);
  } else if (Math.abs(x) <= 0.5) {
    w = x * (1 - x + 1.5 * x * x);
  } else {
    const l = Math.log(1 + x);
    w = l / (1 + 0.5 * l);
  }
  for (let i = 0; i < 32; i++) {
    const e = Math.exp(w);
    const f = w * e - x;
    if (f === 0) return w;
    const fp = e * (w + 1);
    if (fp === 0) break;
    const fpp = e * (w + 2);
    const wNext = w - f / (fp - (f * fpp) / (2 * fp));
    if (Math.abs(wNext - w) <= 1e-15 * Math.max(1, Math.abs(wNext))) return wNext;
    w = wNext;
  }
  return w;
}


register('LAMBERT', _unaryOp(_realFn('LAMBERT', _lambertW0)), { category: 'Special functions', categoryOrder: 10, label: "LAMBERT" });


const _EULER_GAMMA = 0.5772156649015329;


// E1(t) = e^-t / (t+1 - 1²/(t+3 - 2²/(t+5 - ...))) for t > 0, by modified Lentz.
function _eiE1ContinuedFraction(t) {
  const TINY = 1e-300, EPS = 1e-15, MAX = 2000;
  let b = t + 1;
  let c = 1 / TINY;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < MAX; i++) {
    const a = -i * i;
    b += 2;
    d = a * d + b; if (Math.abs(d) < TINY) d = TINY;
    c = b + a / c; if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    const delta = c * d;
    h *= delta;
    if (Math.abs(delta - 1) < EPS) break;
  }
  return h * Math.exp(-t);
}


// γ + ln x + Σ x^k/(k·k!) for x > 0.
function _eiSeriesPositive(x) {
  const EPS = 1e-16, MAX = 1000;
  let term = 1;
  let sum = 0;
  for (let k = 1; k < MAX; k++) {
    term *= x / k;
    const inc = term / k;
    sum += inc;
    if (Math.abs(inc) < Math.abs(sum) * EPS) break;
  }
  return _EULER_GAMMA + Math.log(x) + sum;
}


// (e^x/x) Σ k!/x^k, a divergent series cut at its smallest term.
function _eiAsymptotic(x) {
  const MAX = 200;
  let term = 1;
  let sum = 1;
  for (let k = 1; k < MAX; k++) {
    const next = term * k / x;
    if (!Number.isFinite(next)) break;
    if (Math.abs(next) >= Math.abs(term)) break;
    term = next;
    sum += term;
  }
  return Math.exp(x) / x * sum;
}


function _ei(x) {
  if (x === 0) throw new RPLError('Infinite result');
  if (x > 0) return x < 40 ? _eiSeriesPositive(x) : _eiAsymptotic(x);
  // Ei(x) = -E1(-x)
  const t = -x;
  if (t < 1) {
    const EPS = 1e-16, MAX = 1000;
    let term = 1, sum = 0;
    for (let k = 1; k < MAX; k++) {
      term *= -t / k;
      const inc = term / k;
      sum += inc;
      if (Math.abs(inc) < Math.abs(sum) * EPS) break;
    }
    return _EULER_GAMMA + Math.log(t) + sum;
  }
  return -_eiE1ContinuedFraction(t);
}


// Σ (-1)^k x^(2k+1) / ((2k+1)(2k+1)!)
function _siSeries(x) {
  const EPS = 1e-17, MAX = 1000;
  const x2 = x * x;
  let t = x;
  let s = x;
  for (let k = 1; k < MAX; k++) {
    t *= -x2 / ((2 * k) * (2 * k + 1));
    const entry = t / (2 * k + 1);
    s += entry;
    if (Math.abs(entry) < Math.abs(s) * EPS) break;
  }
  return s;
}


// γ + ln x + Σ (-1)^k x^(2k) / ((2k)(2k)!)
function _ciSeries(x) {
  const EPS = 1e-17, MAX = 1000;
  const x2 = x * x;
  let t = 1;
  let s = 0;
  for (let k = 1; k < MAX; k++) {
    t *= -x2 / ((2 * k - 1) * (2 * k));
    const entry = t / (2 * k);
    s += entry;
    if (Math.abs(entry) < Math.abs(s) * EPS) break;
  }
  return _EULER_GAMMA + Math.log(x) + s;
}


// The E1 continued fraction at i·x (x > 0), since Si(x) - π/2 = Im E1(ix)
// and -Ci(x) = Re E1(ix).
function _siCiLentz(x) {
  const TINY = 1e-300, EPS = 1e-16, MAX = 2000;
  let bRe = 1, bIm = x;
  let cRe = 1 / TINY, cIm = 0;
  const dDenom = bRe * bRe + bIm * bIm;
  let dRe = bRe / dDenom, dIm = -bIm / dDenom;
  let hRe = dRe, hIm = dIm;
  for (let i = 1; i < MAX; i++) {
    const a = -i * i;
    bRe += 2;
    let ndRe = a * dRe + bRe;
    let ndIm = a * dIm + bIm;
    if (Math.hypot(ndRe, ndIm) < TINY) { ndRe = TINY; ndIm = 0; }
    const cMag2 = cRe * cRe + cIm * cIm;
    let ncRe = bRe + (a * cRe) / cMag2;
    let ncIm = bIm + (a * -cIm) / cMag2;
    if (Math.hypot(ncRe, ncIm) < TINY) { ncRe = TINY; ncIm = 0; }
    const ndDenom = ndRe * ndRe + ndIm * ndIm;
    const dNewRe = ndRe / ndDenom;
    const dNewIm = -ndIm / ndDenom;
    const delRe = ncRe * dNewRe - ncIm * dNewIm;
    const delIm = ncRe * dNewIm + ncIm * dNewRe;
    const hNewRe = hRe * delRe - hIm * delIm;
    const hNewIm = hRe * delIm + hIm * delRe;
    cRe = ncRe; cIm = ncIm;
    dRe = dNewRe; dIm = dNewIm;
    hRe = hNewRe; hIm = hNewIm;
    if (Math.hypot(delRe - 1, delIm) < EPS) break;
  }
  // E1(ix) = (cos x - i sin x) · h
  const cx = Math.cos(x), sx = Math.sin(x);
  return { siMinusHalfPi: cx * hIm - sx * hRe, minusCi: cx * hRe + sx * hIm };
}


function _si(x) {
  if (x === 0) return 0;
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  if (ax <= 4) return sign * _siSeries(ax);
  return sign * (Math.PI / 2 + _siCiLentz(ax).siMinusHalfPi);
}


// HP50 real mode leaves Ci undefined for x < 0.
function _ci(x) {
  if (x === 0) throw new RPLError('Infinite result');
  if (x < 0) throw new RPLError('Bad argument value');
  if (x <= 4) return _ciSeries(x);
  return -_siCiLentz(x).minusCi;
}


register('Ei', _unaryOp(_realFn('Ei', _ei, _finiteArg)), { category: 'Special functions', categoryOrder: 6, label: "EI" });


register('Si', _unaryOp(_realFn('Si', _si, _finiteArg)), { category: 'Special functions', categoryOrder: 8, label: "SI" });


register('Ci', _unaryOp(_realFn('Ci', _ci, _finiteArg)), { category: 'Special functions', categoryOrder: 7, label: "CI" });
