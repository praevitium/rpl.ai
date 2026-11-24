// Exact roots and square-root arithmetic, factorials, Γ, the incomplete gamma function and double-precision matrix and
// complex helpers. internal.js passes them on to the command files.
import Decimal from '../../../vendor/decimal.js/decimal.mjs';
import { Fraction } from '../../../vendor/fraction.js/fraction.mjs';
import { isInteger, isReal, isRational, isComplex, Integer, Real, Rational, Symbolic } from '../types.js';
import { RPLError, checkTimeLimit } from '../stack.js';
import { testUserFlag, getRealMaxExp } from '../state.js';
import { Num as AstNum, Bin as AstBin, Fn as AstFn, Neg as AstNeg, exactRational } from '../algebra.js';

// The HP holds an object in its memory, a few million digits or cells at most; a bigger one is not worth a frozen page.
export const MAX_INTEGER_DIGITS = 1_000_000;

// The HP's error list: 0/0 is an Undefined result, any other x/0 an Infinite result.
export const _divisionByZero = (dividendIsZero) => new RPLError(dividendIsZero ? 'Undefined result' : 'Infinite result');

const _fraction = (v) => (isInteger(v) ? new Fraction(v.value, 1n) : new Fraction(v.n, v.d));

export function _fractionValue(f) {
  return f.d === 1n ? Integer(f.s * f.n) : Rational(f.s * f.n, f.d);
}

// The integer k-th root of n ≥ 0 when n is a perfect k-th power, else null.
function _exactRoot(n, k) {
  if (n < 2n) return n;
  const bits = BigInt(n.toString(2).length);
  if (k >= bits) return null;
  let x = 1n << ((bits + k - 1n) / k);
  for (;;) {
    const next = ((k - 1n) * x + n / x ** (k - 1n)) / k;
    if (next >= x) break;
    x = next;
  }
  return x ** k === n ? x : null;
}

// f's exact k-th root, -2 for -8 and k = 3, or null.
function _fractionRoot(f, k) {
  if (f.s < 0n && k % 2n === 0n) return null;
  const rn = _exactRoot(f.n, k), rd = _exactRoot(f.d, k);
  return rn === null || rd === null ? null : new Fraction(f.s * rn, rd);
}

// n = a²·b, with the square factors that trial division up to 10^4 finds, and a square remainder, taken out.
function _squareFactor(n) {
  let a = 1n, b = 1n, m = n;
  for (let d = 2n; d * d <= m && d <= 10000n; d++) {
    let e = 0n;
    while (m % d === 0n) { m /= d; e++; }
    a *= d ** (e / 2n);
    b *= d ** (e % 2n);
  }
  const r = _exactRoot(m, 2n);
  return r === null ? { a, b: b * m } : { a: a * r, b };
}

// c·√b as the HP writes it: 2*√2, √2/2 or 2*√2/3.
function _radicalAst(c, b) {
  const root = AstFn('SQRT', [AstNum(b)]);
  const top = c.n === 1n ? root : AstBin('*', AstNum(c.n), root);
  return c.d === 1n ? top : AstBin('/', top, AstNum(c.d));
}

// x^e for a non-negative fraction x when the root is exact (4^(1/2) is 2) or a square root (8^(1/2) is 2*√2), else null.
export function _exactPower(x, e) {
  if (x.s < 0n) return null;
  const p = e.s * e.n;
  const root = _fractionRoot(x, e.d);
  if (root) {
    if (root.n === 0n && p < 0n) throw _divisionByZero(false);
    return _fractionValue(root.pow(new Fraction(p, 1n)));
  }
  if (e.d !== 2n) return null;
  const { a, b } = _squareFactor(x.n * x.d);
  return Symbolic(_radicalAst(x.pow(new Fraction((p - 1n) / 2n, 1n)).mul(new Fraction(a, x.d)), b));
}

// The HP's exact √ of a non-negative integer or fraction: 2, 1/2, 2*√2 or √2/3.
export function exactSqrt(v) {
  return _exactPower(_fraction(v), new Fraction(1n, 2n));
}

const _NEG_ONE = new Fraction(-1n, 1n);

// c·√b as [c, b], c an exact fraction and b a positive integer: a number, √b, c*√b, √b/d, c*√b/d or a negation.
function _radicalTerm(ast) {
  if (ast.kind === 'neg') {
    const t = _radicalTerm(ast.arg);
    return t && [t[0].mul(_NEG_ONE), t[1]];
  }
  const r = exactRational(ast);
  if (r) return [new Fraction(r[0], r[1]), 1n];
  if (ast.kind === 'fn' && ast.name === 'SQRT') {
    const b = exactRational(ast.args[0]);
    return b && b[1] === 1n && b[0] > 0n ? [new Fraction(1n, 1n), b[0]] : null;
  }
  if (ast.kind !== 'bin' || (ast.op !== '*' && ast.op !== '/')) return null;
  const x = _radicalTerm(ast.l), y = _radicalTerm(ast.r);
  if (!x || !y || (x[1] !== 1n && y[1] !== 1n)) return null;
  if (ast.op === '*') return [x[0].mul(y[0]), x[1] * y[1]];
  return y[1] === 1n && y[0].n !== 0n ? [x[0].div(y[0]), x[1]] : null;
}

function _radicalValue(c, b) {
  const { a, b: rest } = _squareFactor(b);
  const coef = c.mul(new Fraction(a, 1n));
  if (coef.n === 0n || rest === 1n) return _fractionValue(coef);
  const ast = _radicalAst(new Fraction(coef.n, coef.d), rest);
  return Symbolic(coef.s < 0n ? AstNeg(ast) : ast);
}

// (c·√b)^k = c^k·b^(k div 2)·√b when k is odd.
function _radicalPower(c, b, k) {
  const m = k < 0n ? -k : k;
  const coef = c.pow(new Fraction(m, 1n)).mul(new Fraction(b ** (m / 2n), 1n));
  const root = m % 2n === 1n ? b : 1n;
  if (k >= 0n) return _radicalValue(coef, root);
  return coef.n === 0n ? null : _radicalValue(new Fraction(1n, 1n).div(coef.mul(new Fraction(root, 1n))), root);
}

// Exact arithmetic on square roots, as the HP's exact mode does it: √2*√2 is 2, √8/√2 is 2, (2*√3)^2 is 12, √2+√2 is 2*√2.
export function _radicalBinary(op, l, r) {
  const x = _radicalTerm(l), y = _radicalTerm(r);
  if (!x || !y || (x[1] === 1n && y[1] === 1n)) return null;
  switch (op) {
    case '*': return _radicalValue(x[0].mul(y[0]), x[1] * y[1]);
    case '/': return y[0].n === 0n ? null : _radicalValue(x[0].div(y[0].mul(new Fraction(y[1], 1n))), x[1] * y[1]);
    case '+': case '-': return x[1] === y[1] ? _radicalValue(op === '+' ? x[0].add(y[0]) : x[0].sub(y[0]), x[1]) : null;
    case '^': return y[1] === 1n && y[0].d === 1n && y[0].n <= 64n ? _radicalPower(x[0], x[1], y[0].s * y[0].n) : null;
    default: return null;
  }
}

// The k-th root of an integer or fraction when it is exact, -2 for -8 and k = 3, else null.
export function exactXroot(v, k) {
  const root = _fractionRoot(_fraction(v), k);
  return root && _fractionValue(root);
}


// lo*(lo+1)*...*hi, halved so the big multiplications are between numbers of a size: 100000! takes 60 ms, not 4 s.
function _rangeProduct(lo, hi) {
  checkTimeLimit();
  if (hi - lo < 16n) {
    let acc = lo;
    for (let i = lo + 1n; i <= hi; i++) acc *= i;
    return acc;
  }
  const mid = (lo + hi) >> 1n;
  return _rangeProduct(lo, mid) * _rangeProduct(mid + 1n, hi);
}

export function _bigFactorial(n) {
  if (n < 0n) throw new RPLError('Bad argument value');
  if (!(_lngamma(Number(n) + 1) <= MAX_INTEGER_DIGITS * Math.LN10)) throw new RPLError('Insufficient memory');
  return n < 2n ? 1n : _rangeProduct(2n, n);
}

// Lanczos approximation (g = 7, n = 9), good to about 15 significant digits.
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

// Γ(x) passes the largest double just past this.
const _GAMMA_OVERFLOW = 171.625;

export function _gamma(x) {
  if (x < 0.5) {
    const s = Math.sin(Math.PI * x);
    if (s === 0) throw new RPLError('Infinite result');
    return Math.PI / (s * _gamma(1 - x));
  }
  if (x > _GAMMA_OVERFLOW) return Infinity;
  x -= 1;
  let a = _LANCZOS_P[0];
  for (let i = 1; i < _LANCZOS_P.length; i++) a += _LANCZOS_P[i] / (x + i);
  const t = x + _LANCZOS_G + 0.5;
  // Two half powers, each brought back by e^-t in turn: t^(x+1/2) alone overflows a double from x = 142, where Γ does not.
  const half = Math.pow(t, (x + 0.5) / 2);
  return Math.sqrt(2 * Math.PI) * half * Math.exp(-t) * half * a;
}


// ln|Γ(x)|, computed directly so it stays finite where Γ(x) overflows a double.
export function _lngamma(x) {
  if (x < 0.5) {
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


// Regularised upper incomplete gamma Q(a, x) for a > 0, x ≥ 0 (Numerical Recipes
// §6.2): the series for x < a + 1, Lentz's continued fraction otherwise.
export function _regGammaQ(a, x) {
  if (x === 0) return 1;
  if (x < a + 1) {
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

export function _numVal(v) {
  if (isReal(v))     return v.value.toNumber();
  if (isInteger(v))  return Number(v.value);
  if (isRational(v)) return Number(v.n) / Number(v.d);
  throw new RPLError('Bad argument type');
}

export function _decimalFrobeniusNorm(items) {
  let sum = new Decimal(0);
  for (const x of items) {
    if (isComplex(x)) { sum = sum.plus(new Decimal(x.re).pow(2)).plus(new Decimal(x.im).pow(2)); continue; }
    const d = isReal(x) ? x.value
      : isInteger(x) ? new Decimal(x.value.toString())
      : isRational(x) ? new Decimal(x.n.toString()).div(x.d.toString())
      : null;
    if (!d) throw new RPLError('Bad argument type');
    sum = sum.plus(d.times(d));
  }
  return sum.sqrt();
}

export function _invMatrixNumeric(rows) {
  const n = rows.length;
  for (const row of rows) {
    if (row.length !== n) throw new RPLError('Invalid dimension');
    for (const x of row) {
      if (!isReal(x) && !isInteger(x) && !isRational(x)) throw new RPLError('Bad argument type');
    }
  }
  const a = rows.map(row => row.map(_numVal));
  const I = [];
  for (let i = 0; i < n; i++) {
    const row = new Array(n).fill(0);
    row[i] = 1;
    I.push(row);
  }
  for (let k = 0; k < n; k++) {
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

// With flag -22 set, as the AUR has it, an infinite result is ±MAXR instead of an Infinite result error.
export function _infiniteResult(negative = false) {
  if (!testUserFlag(-22)) throw new RPLError('Infinite result');
  return Real(new Decimal(`${negative ? '-' : ''}9.99999999999e+${getRealMaxExp()}`));
}
