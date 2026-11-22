// Factorials, Γ and the incomplete gamma function, on plain numbers. internal.js passes them on to the command files.
import { RPLError, checkTimeLimit } from '../stack.js';

// The HP holds an object in its memory, a few million digits or cells at most; a bigger one is not worth a frozen page.
export const MAX_INTEGER_DIGITS = 1_000_000;

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
