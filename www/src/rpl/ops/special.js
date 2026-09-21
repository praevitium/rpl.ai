import { Symbolic, isInteger, isReal, Integer, Real, isVector, Vector, isMatrix, Matrix, isList, RList, isTagged, Tagged } from '../types.js';
import { Fn as AstFn, Num as AstNum } from '../algebra.js';
import { RPLError } from '../stack.js';
import { register } from './registry.js';
import { _bigFactorial, _gamma, _isSymOperand, _lngamma, _regGammaQ, _toAst, _withListBinary, _withListUnary, _withTaggedBinary, _withTaggedUnary } from './internal.js';



function _gammaScalar(v) {
  if (_isSymOperand(v)) return Symbolic(AstFn('GAMMA', [_toAst(v)]));
  const x = isInteger(v) ? Number(v.value) : isReal(v) ? v.value.toNumber() : null;
  if (x === null) throw new RPLError('Bad argument type');
  // Integer-valued inputs at the non-positive integers are poles.
  if (Number.isInteger(x) && x <= 0) throw new RPLError('Infinite result');
  // Non-negative integer — exact factorial via Γ(n) = (n-1)!.
  if (isInteger(v) && v.value > 0n) {
    return Integer(_bigFactorial(v.value - 1n));
  }
  return Real(_gamma(x));
}


function _lngammaScalar(v) {
  if (_isSymOperand(v)) return Symbolic(AstFn('LNGAMMA', [_toAst(v)]));
  const x = isInteger(v) ? Number(v.value) : isReal(v) ? v.value.toNumber() : null;
  if (x === null) throw new RPLError('Bad argument type');
  if (Number.isInteger(x) && x <= 0) throw new RPLError('Infinite result');
  return Real(_lngamma(x));
}


register('GAMMA', _withTaggedUnary(_withListUnary((s) => {
  const v = s.pop();
  if (isVector(v))      s.push(Vector(v.items.map(_gammaScalar)));
  else if (isMatrix(v)) s.push(Matrix(v.rows.map(r => r.map(_gammaScalar))));
  else                  s.push(_gammaScalar(v));
})), { category: 'Special functions', categoryOrder: 0, label: "GAMMA" });


register('LNGAMMA', _withTaggedUnary(_withListUnary((s) => {
  const v = s.pop();
  if (isVector(v))      s.push(Vector(v.items.map(_lngammaScalar)));
  else if (isMatrix(v)) s.push(Matrix(v.rows.map(r => r.map(_lngammaScalar))));
  else                  s.push(_lngammaScalar(v));
})), { category: 'Special functions', categoryOrder: 1, label: "LNGAMMA" });


/* ---- PSI — digamma + polygamma ----------------------
   HP50 AUR §2 (CAS-SPECIAL).  One- and two-argument forms.

     PSI  ( x → ψ(x) )             1-arg: digamma  ψ(x) = Γ'(x)/Γ(x)
     PSI  ( x n → ψ^(n)(x) )       2-arg: n-th polygamma (n ≥ 0 integer).
                                   n = 0 is equivalent to the 1-arg form.

   Dispatch: if the top-of-stack is a non-negative Integer (or integer-
   valued Real) AND there is a second argument below it, the op is the
   two-arg form.  Otherwise 1-arg.  This matches the HP50 firmware
   convention used by the same command.

   Domain: both forms throw `Infinite result` at non-positive integers
   (the poles of ψ and its derivatives) and `Bad argument value` on
   non-finite input.  Symbolic / Name inputs lift to `PSI(x)` or
   `PSI(x, n)` AST nodes so round-trip through the parser is exact.

   Numerical implementation (real x, real n):
     - Digamma: reflection for x < 0.5 (ψ(1−x) − π cot πx), then
       integer-shift recurrence ψ(x+1) = ψ(x) + 1/x up to x ≥ 8,
       then the Bernoulli asymptotic
           ψ(x) ≈ ln x − 1/(2x) − Σ_k B_{2k}/(2k · x^{2k})
       truncated at 2k = 12 (gives ~1e−13 error at x = 8).
     - Polygamma (n ≥ 1): shift x up via
           ψ^(n)(x) = ψ^(n)(x+1) + (−1)^(n+1) n! / x^(n+1)
       accumulated as a running tail sum, then the asymptotic
           ψ^(n)(y) ≈ (−1)^(n+1) [(n−1)!/y^n + n!/(2 y^{n+1})
                    + Σ_k B_{2k} (2k+n−1)!/(2k)! / y^{2k+n}]
       with the same 2k = 12 truncation.
*/

function _digamma(x) {
  if (!Number.isFinite(x)) throw new RPLError('Bad argument value');
  if (x <= 0 && Number.isInteger(x)) throw new RPLError('Infinite result');
  // Reflection: ψ(x) = ψ(1 − x) − π cot(πx).  Used for x < 0.5 so the
  // recurrence-and-asymptotic pair below always starts with x ≥ 0.5.
  if (x < 0.5) {
    return _digamma(1 - x) - Math.PI / Math.tan(Math.PI * x);
  }
  let r = 0;
  while (x < 8) { r -= 1 / x; x += 1; }
  const xi  = 1 / x;
  const xi2 = xi * xi;
  r += Math.log(x) - 0.5 * xi;
  // − Σ_k B_{2k}/(2k) · x^−2k   with  B_2..B_12 signs absorbed into
  // the factored Horner form below (alternating subtraction/addition).
  r -= xi2 * (1/12 - xi2 * (1/120 - xi2 * (1/252 - xi2 * (1/240
       - xi2 * (1/132 - xi2 * 691/32760)))));
  return r;
}


function _polygamma(n, x) {
  if (n === 0) return _digamma(x);
  if (!Number.isFinite(x)) throw new RPLError('Bad argument value');
  if (x <= 0 && Number.isInteger(x)) throw new RPLError('Infinite result');
  if (x < 0.5) {
    // Reflection for polygamma is messier than digamma (involves
    // d^n/dx^n cot πx).  For the expected use cases (integer n ≥ 1,
    // x not tiny-positive) we instead shift up from any positive-real
    // starting point using the recurrence tail sum; for x < 0.5 we
    // use the same recurrence but accept more shift iterations.
    let r = 0;
    const sgnShift = (n % 2 === 0) ? -1 : 1;   // (−1)^(n+1)
    let nf = 1;
    for (let i = 2; i <= n; i++) nf *= i;
    let y = x;
    while (y < 10) {
      r += sgnShift * nf * Math.pow(y, -(n + 1));
      y += 1;
    }
    return r + _polygammaAsymptotic(n, y);
  }
  const sgnShift = (n % 2 === 0) ? -1 : 1;   // (−1)^(n+1)
  let nf = 1;
  for (let i = 2; i <= n; i++) nf *= i;
  let y = x;
  let tail = 0;
  while (y < 10) {
    tail += Math.pow(y, -(n + 1));
    y += 1;
  }
  return sgnShift * nf * tail + _polygammaAsymptotic(n, y);
}


function _polygammaAsymptotic(n, y) {
  // (−1)^(n+1) · [(n−1)!/y^n + n!/(2 y^{n+1}) + Σ B_{2k} rf(2k)/y^{2k+n}]
  // where rf(2k) = (2k+1)(2k+2)…(2k+n−1) = (2k+n−1)!/(2k)! — evaluated
  // by a (n−1)-term running product.
  const sgn = (n % 2 === 0) ? -1 : 1;   // (−1)^(n+1)
  let nm1f = 1;
  for (let i = 2; i <= n - 1; i++) nm1f *= i;
  let nf = nm1f * n;
  let out = nm1f * Math.pow(y, -n) + (nf / 2) * Math.pow(y, -(n + 1));
  // B_{2k} for k = 1..6
  const B = [1/6, -1/30, 1/42, -1/30, 5/66, -691/2730];
  for (let k = 1; k <= B.length; k++) {
    const twoK = 2 * k;
    let rf = 1;
    for (let i = 1; i <= n - 1; i++) rf *= (twoK + i);
    out += B[k - 1] * rf * Math.pow(y, -(twoK + n));
  }
  return sgn * out;
}


function _psiScalar(v) {
  if (_isSymOperand(v)) return Symbolic(AstFn('PSI', [_toAst(v)]));
  const x = isInteger(v) ? Number(v.value) : isReal(v) ? v.value.toNumber() : null;
  if (x === null) throw new RPLError('Bad argument type');
  return Real(_digamma(x));
}


function _polygammaScalar(n, v) {
  if (_isSymOperand(v)) return Symbolic(AstFn('PSI', [_toAst(v), AstNum(n)]));
  const x = isInteger(v) ? Number(v.value) : isReal(v) ? v.value.toNumber() : null;
  if (x === null) throw new RPLError('Bad argument type');
  return Real(_polygamma(n, x));
}


register('PSI', (s) => {
  if (s.depth === 0) throw new RPLError('Too few arguments');
  // Two-arg dispatch: top is an Integer / integer-valued Real n ≥ 0,
  // and there is a second argument below.  Matches HP50 firmware.
  if (s.depth >= 2) {
    const top = s.peek(1);
    let n = null;
    if (isInteger(top)) {
      n = Number(top.value);
    } else if (isReal(top) && top.value.isFinite() &&
               top.value.isInteger()) {
      n = top.value.toNumber();
    }
    if (n !== null && n >= 0) {
      const [x] = s.popN(2).slice(0, 1);   // popN returns [x, n]
      // (n is discarded here — we already read it above)
      if (isList(x)) {
        s.push(RList(x.items.map(it => _polygammaScalar(n, it))));
      } else if (isTagged(x)) {
        s.push(Tagged(x.tag, _polygammaScalar(n, x.value)));
      } else {
        s.push(_polygammaScalar(n, x));
      }
      return;
    }
  }
  // 1-arg: digamma.  List / Tagged dispatch mirrors GAMMA / LNGAMMA.
  const v = s.pop();
  if (isList(v)) {
    s.push(RList(v.items.map(_psiScalar)));
  } else if (isTagged(v)) {
    s.push(Tagged(v.tag, _psiScalar(v.value)));
  } else if (isVector(v)) {
    s.push(Vector(v.items.map(_psiScalar)));
  } else if (isMatrix(v)) {
    s.push(Matrix(v.rows.map(r => r.map(_psiScalar))));
  } else {
    s.push(_psiScalar(v));
  }
}, { category: 'Special functions', categoryOrder: 2, label: "PSI" });


/* ============================================================
   Beta-family special functions + STAT-DIST UTPF / UTPT + erf /
   erfc.

   Builds on the UTPC machinery:
     - `_regGammaQ(a, x)` (upper-incomplete, already registered
       under UTPC) and its complement P(a, x) = 1 − Q(a, x)
       drive erf / erfc.
     - A new `_regBetaI(a, b, x)` regularised incomplete beta
       function (Numerical Recipes §6.4) drives both UTPF and
       UTPT.  Single implementation, two HP50 entry points.

   New functions in this block:
     - `_regGammaP(a, x)` — lower-incomplete, direct route (avoids
       the 1 − Q cancellation for small x).
     - `_betaCF(a, b, x)` — NR §6.4 Lentz continued fraction.
     - `_regBetaI(a, b, x)` — public regularised beta entry point.
     - `_betaScalar(a, b)` — scalar dispatcher for the Beta op.
     - `_erfScalar(v)` / `_erfcScalar(v)` — scalar dispatchers.
     - `_utpcScalar(nu, x)` / `_utptScalar(nu, t)` — scalar dispatchers
       for UTPC and UTPT; enable _withListBinary / _withTaggedBinary lift.

   New HP50 ops:
     - `Beta`   — Β(a, b) = Γ(a)Γ(b)/Γ(a+b).  Exact factorial path
                  for positive integers; Lanczos log form for general
                  reals.  Tagged + List + Sym lift.
     - `erf`    — ∫₀ˣ (2/√π) e^(−t²) dt via P(1/2, x²).  Tagged + List
                  + V/M + Sym lift.
     - `erfc`   — 1 − erf(x) via Q(1/2, x²) for |x| > 0 (no
                  cancellation).  Tagged + List + V/M + Sym lift.
     - `UTPF(n, d, F)` — F-distribution upper tail (bare handler;
                  L/V/M not supported — 3-arg; no _withListBinary shape).
     - `UTPT(ν, t)`    — Student-t upper tail. Tagged + List lift.
   ============================================================ */

/** Regularised lower incomplete gamma P(a, x) = γ(a, x) / Γ(a).
 *  Mirrors _regGammaQ but returns the direct lower-incomplete value.
 *  The series form (x < a+1) is numerically well-behaved for erf's
 *  small-x regime; for x ≥ a+1 we delegate to Q via 1 − Q (this is
 *  where the cancellation would bite, which is why erfc uses Q there
 *  rather than erfc = 1 − erf).  */
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


/** Scalar Beta(a, b).  Positive-integer args route to exact factorials
 *  so Β(5, 3) = 1/105 returns as a reduced rational (here — since the
 *  result fits a double — we return Real(1/105) = 0.00952...).  For
 *  general real args we use the log form exp(lnΓ(a)+lnΓ(b)-lnΓ(a+b))
 *  to avoid intermediate overflow in Γ.  */
function _betaScalar(a, b) {
  if (_isSymOperand(a) || _isSymOperand(b)) {
    return Symbolic(AstFn('Beta', [_toAst(a), _toAst(b)]));
  }
  const aNum = isInteger(a) ? Number(a.value) : isReal(a) ? a.value.toNumber() : null;
  const bNum = isInteger(b) ? Number(b.value) : isReal(b) ? b.value.toNumber() : null;
  if (aNum === null || bNum === null) throw new RPLError('Bad argument type');
  if (!Number.isFinite(aNum) || !Number.isFinite(bNum)) {
    throw new RPLError('Bad argument value');
  }
  // Poles: non-positive-integer a or b → Γ(a) or Γ(b) is infinite.
  if ((Number.isInteger(aNum) && aNum <= 0) ||
      (Number.isInteger(bNum) && bNum <= 0)) {
    throw new RPLError('Infinite result');
  }
  return Real(Math.exp(_lngamma(aNum) + _lngamma(bNum) - _lngamma(aNum + bNum)));
}


/** Scalar erf(x) = sign(x) · P(1/2, x²).  Avoids the cancellation of
 *  the raw series near 0 by routing through the regularised gamma
 *  helper already in the file.  Domain extends to all real x.  */
function _erfScalar(v) {
  if (_isSymOperand(v)) return Symbolic(AstFn('erf', [_toAst(v)]));
  const x = isInteger(v) ? Number(v.value) : isReal(v) ? v.value.toNumber() : null;
  if (x === null) throw new RPLError('Bad argument type');
  if (!Number.isFinite(x)) throw new RPLError('Bad argument value');
  if (x === 0) return Real(0);
  return Real((x < 0 ? -1 : 1) * _regGammaP(0.5, x * x));
}


/** Scalar erfc(x) = 1 − erf(x).  For x > 0 we use Q(1/2, x²) directly
 *  so the returned value never suffers from the 1 − erf(x) → 0
 *  cancellation when erf(x) is near 1 (e.g. erfc(5) ≈ 1.537e-12,
 *  which 1 − erf(5) cannot represent to any useful precision).  */
function _erfcScalar(v) {
  if (_isSymOperand(v)) return Symbolic(AstFn('erfc', [_toAst(v)]));
  const x = isInteger(v) ? Number(v.value) : isReal(v) ? v.value.toNumber() : null;
  if (x === null) throw new RPLError('Bad argument type');
  if (!Number.isFinite(x)) throw new RPLError('Bad argument value');
  if (x === 0) return Real(1);
  if (x > 0) return Real(_regGammaQ(0.5, x * x));
  // x < 0: erfc(x) = 2 − erfc(−x) = 1 + erf(|x|).
  return Real(1 + _regGammaP(0.5, x * x));
}


register('Beta', _withTaggedBinary(_withListBinary((s) => {
  const [a, b] = s.popN(2);
  s.push(_betaScalar(a, b));
})), { category: 'Special functions', categoryOrder: 3, label: "BETA" });


register('erf', _withTaggedUnary(_withListUnary((s) => {
  const v = s.pop();
  if (isVector(v))      s.push(Vector(v.items.map(_erfScalar)));
  else if (isMatrix(v)) s.push(Matrix(v.rows.map(r => r.map(_erfScalar))));
  else                  s.push(_erfScalar(v));
})), { category: 'Special functions', categoryOrder: 4, label: "ERF" });


register('erfc', _withTaggedUnary(_withListUnary((s) => {
  const v = s.pop();
  if (isVector(v))      s.push(Vector(v.items.map(_erfcScalar)));
  else if (isMatrix(v)) s.push(Matrix(v.rows.map(r => r.map(_erfcScalar))));
  else                  s.push(_erfcScalar(v));
})), { category: 'Special functions', categoryOrder: 5, label: "ERFC" });


/* ---- ZETA — Riemann zeta ---------------------------------------------
   HP50 AUR §2 (CAS-SPECIAL).  One-arg Riemann zeta function.

     ZETA  ( s → ζ(s) )       1-arg: real Riemann zeta.

   Domain handling:
     s = 1                    → Infinite result   (simple pole)
     s = even negative Integer → exact 0           (trivial zeros)
     s = 0                    → -1/2 (Real)
     s < 1/2 (and s ≠ 0)      → functional-equation reflection
                                 ζ(s) = 2ˢ π^(s-1) sin(πs/2) Γ(1-s) ζ(1-s)
     s ≥ 1/2 (and s ≠ 1)      → Euler-Maclaurin direct summation

   Euler-Maclaurin (NR §5.3):
     ζ(s) ≈ Σ_{k=1}^{N-1} k⁻ˢ + N^(1-s)/(s-1) + (1/2)N⁻ˢ
            + Σ_{j=1}^{M} (B_{2j}/(2j)!) (s)_{2j-1} N^(-s-2j+1)
   with N = 15 and M = 6 Bernoulli terms (B_2 … B_12 used).
   Accuracy ≲ 1e-13 over s ∈ [1/2, ∞)\{1} in double precision; plenty
   for the HP50 10-digit display.

   Symbolic / Name input lifts to `ZETA(x)`; Tagged transparent;
   List / Vector / Matrix distribute element-wise.
*/
const _ZETA_EM_N = 15;

const _ZETA_EM_B = Object.freeze([
  1/6,        // B_2
  -1/30,      // B_4
  1/42,       // B_6
  -1/30,      // B_8
  5/66,       // B_10
  -691/2730,  // B_12
]);

const _ZETA_EM_F = Object.freeze([
  2,          // 2!
  24,         // 4!
  720,        // 6!
  40320,      // 8!
  3628800,    // 10!
  479001600,  // 12!
]);


function _zetaEulerMaclaurin(s) {
  // Precondition: s >= 0.5 and s !== 1.  Direct summation with EM tail.
  let sum = 0;
  for (let k = 1; k < _ZETA_EM_N; k++) sum += Math.pow(k, -s);
  sum += Math.pow(_ZETA_EM_N, 1 - s) / (s - 1);
  sum += 0.5 * Math.pow(_ZETA_EM_N, -s);
  // EM correction — add Σ (B_{2j}/(2j)!) · (s)_{2j-1} · N^(-s-2j+1).
  // (Derived from Σ_{k≥N} f(k) ≈ ∫ + f(N)/2 − Σ B_{2m}/(2m)! f^(2m-1)(N);
  //  f^(2m-1)(N) = −(s)_{2m-1} N^(-s-2m+1), so the two minuses combine to +.)
  let poch = s;                              // (s)_1 at j = 1
  let Nexp = Math.pow(_ZETA_EM_N, -s - 1);   // N^(-s-2j+1) at j = 1
  const invNsq = 1 / (_ZETA_EM_N * _ZETA_EM_N);
  for (let j = 1; j <= _ZETA_EM_B.length; j++) {
    sum += (_ZETA_EM_B[j - 1] / _ZETA_EM_F[j - 1]) * poch * Nexp;
    // Step: Pochhammer picks up two more factors (s+2j-1)(s+2j);
    // exponent drops by 2 (multiply by 1/N²).
    poch *= (s + 2 * j - 1) * (s + 2 * j);
    Nexp *= invNsq;
  }
  return sum;
}


function _zeta(s) {
  if (!Number.isFinite(s)) throw new RPLError('Bad argument value');
  if (s === 1) throw new RPLError('Infinite result');
  if (s === 0) return -0.5;
  // Trivial zeros: ζ(-2k) = 0 for k ≥ 1.  Catch as exact 0 so the
  // reflection path doesn't multiply Γ(1-s) → finite by a computed
  // sin(πs/2) that's only near-zero.
  if (s < 0 && Number.isInteger(s) && (s % 2) === 0) return 0;
  if (s < 0.5) {
    // Reflection: ζ(s) = 2^s π^(s-1) sin(πs/2) Γ(1-s) ζ(1-s).
    // 1-s ≥ 0.5, so the recursive call lands in the EM branch.
    const sinPart = Math.sin(Math.PI * s / 2);
    const g = _gamma(1 - s);
    const z = _zeta(1 - s);
    return Math.pow(2, s) * Math.pow(Math.PI, s - 1) * sinPart * g * z;
  }
  return _zetaEulerMaclaurin(s);
}


function _zetaScalar(v) {
  if (_isSymOperand(v)) return Symbolic(AstFn('ZETA', [_toAst(v)]));
  const x = isInteger(v) ? Number(v.value) : isReal(v) ? v.value.toNumber() : null;
  if (x === null) throw new RPLError('Bad argument type');
  return Real(_zeta(x));
}


register('ZETA', _withTaggedUnary(_withListUnary((s) => {
  const v = s.pop();
  if (isVector(v))      s.push(Vector(v.items.map(_zetaScalar)));
  else if (isMatrix(v)) s.push(Matrix(v.rows.map(r => r.map(_zetaScalar))));
  else                  s.push(_zetaScalar(v));
})), { category: 'Special functions', categoryOrder: 9, label: "ZETA" });


function _lambertW0(x) {
  if (!Number.isFinite(x)) throw new RPLError('Bad argument value');
  // Guard the branch point via p² = 2(ex + 1) ≥ 0.  Using ep1 directly
  // tolerates the 1-ulp roundoff in a computed -1/e without an ad-hoc
  // fudge constant, and gives the Puiseux series a ready-made argument.
  const ep1 = Math.E * x + 1;
  if (ep1 < 0) {
    if (ep1 < -1e-13) throw new RPLError('Bad argument value');
    return -1;
  }
  if (x === 0) return 0;
  // Choose a starting guess that puts Halley in its monotone regime.
  let w;
  if (ep1 < 0.25) {
    // Puiseux series at the branch point (Corless et al. 1996, eq 4.22):
    //   W(x) = -1 + p − p²/3 + 11 p³/72 − 43 p⁴/540 + 769 p⁵/17280 − …
    // with p = √(2(ex+1)).  Gives f ≲ 1e-10 at the initial guess, so
    // Halley's cubic convergence then hits machine precision in ≤ 2
    // steps — fixes the linear-convergence stall at the branch point,
    // where f'(−1) = 0 would otherwise defeat Halley alone.
    const p = Math.sqrt(2 * ep1);
    w = -1 + p * (1 + p * (-1/3 + p * (11/72 + p * (-43/540 + p * (769/17280)))));
  } else if (x >= Math.E) {
    const ln1 = Math.log(x);
    w = ln1 - Math.log(ln1);
  } else if (Math.abs(x) <= 0.5) {
    // Taylor around 0: W(x) = x − x² + (3/2)x³ − …
    w = x * (1 - x + 1.5 * x * x);
  } else {
    const l = Math.log(1 + x);
    w = l / (1 + 0.5 * l);
  }
  // Halley: W ← W − f/(f' − f f''/(2 f'))
  //          f   = W eᵂ − x
  //          f'  = eᵂ (W + 1)
  //          f'' = eᵂ (W + 2)
  for (let i = 0; i < 32; i++) {
    const e = Math.exp(w);
    const wew = w * e;
    const f = wew - x;
    if (f === 0) return w;
    const fp = e * (w + 1);
    if (fp === 0) break;  // avoid singular update at the branch point
    const fpp = e * (w + 2);
    const delta = f / (fp - (f * fpp) / (2 * fp));
    const wNext = w - delta;
    if (Math.abs(wNext - w) <= 1e-15 * Math.max(1, Math.abs(wNext))) {
      return wNext;
    }
    w = wNext;
  }
  return w;
}


function _lambertScalar(v) {
  if (_isSymOperand(v)) return Symbolic(AstFn('LAMBERT', [_toAst(v)]));
  const x = isInteger(v) ? Number(v.value) : isReal(v) ? v.value.toNumber() : null;
  if (x === null) throw new RPLError('Bad argument type');
  return Real(_lambertW0(x));
}


register('LAMBERT', _withTaggedUnary(_withListUnary((s) => {
  const v = s.pop();
  if (isVector(v))      s.push(Vector(v.items.map(_lambertScalar)));
  else if (isMatrix(v)) s.push(Matrix(v.rows.map(r => r.map(_lambertScalar))));
  else                  s.push(_lambertScalar(v));
})), { category: 'Special functions', categoryOrder: 10, label: "LAMBERT" });


/* ---- Ei / Si / Ci — exponential, sine, cosine integrals ---------------
   HP50 AUR §2 (CAS-SPECIAL).  Three classical special-function integrals,
   defined by:
     Ei(x) = -∫_{-x}^{∞} e^{-t}/t dt         (Cauchy PV for x > 0)
     Si(x) = ∫_0^x sin(t)/t dt               (entire, odd)
     Ci(x) = γ + ln(x) + ∫_0^x (cos(t)-1)/t dt   (x > 0 in HP50 real mode)

   Native implementations — Giac has these but the RPL calling convention
   expects Real outputs on Real inputs (Giac would return numeric-string
   Symbolics).  Three algorithmic branches per function:

     Ei(x)
       x  = 0          → Infinite result
       x  > 0 && x < 40 → power series γ + ln(x) + Σ x^k/(k·k!)
       x  ≥ 40         → asymptotic (e^x/x)·Σ k!/x^k truncated at smallest
       x  < 0, |x|<1   → series for E1(-x), then Ei = -E1
       x  < 0, |x|≥1   → modified-Lentz continued fraction for E1

     Si(x)
       x = 0           → 0
       |x| ≤ 4         → odd power series
       |x| > 4         → complex Lentz CF for E1(i·|x|): Si = π/2 + Im(E1(i·|x|))·sgn

     Ci(x)
       x  = 0          → Infinite result
       x  < 0          → Bad argument value (HP50 real-mode convention)
       x  ≤ 4          → γ + ln(x) + Σ (-1)^k x^{2k}/((2k)·(2k)!)
       x  > 4          → Re(-E1(i·x)) via the same Lentz CF as Si

   Relative error verified against Abramowitz & Stegun Tables 5.1/5.3 at
   machine precision.

   Symbolic / Name input lifts to `Ei(x)` / `Si(x)` / `Ci(x)`.  Tagged
   transparent; List / Vector / Matrix distribute element-wise.
*/
const _EI_EULER = 0.5772156649015329;


function _eiE1ContinuedFraction(t) {
  // Modified Lentz for E1(t), t > 0:   E1(t) = e^{-t} · CF
  //   CF = 1/(t+1-) 1·1/(t+3-) 2·2/(t+5-) …
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


function _eiSeriesPositive(x) {
  // Ei(x) = γ + ln(x) + Σ_{k=1}^∞ x^k / (k · k!), x > 0
  const EPS = 1e-16, MAX = 1000;
  let term = 1;
  let sum = 0;
  for (let k = 1; k < MAX; k++) {
    term *= x / k;
    const inc = term / k;
    sum += inc;
    if (Math.abs(inc) < Math.abs(sum) * EPS) break;
  }
  return _EI_EULER + Math.log(x) + sum;
}


function _eiAsymptotic(x) {
  // Ei(x) ≈ (e^x/x) · Σ k!/x^k — divergent series, truncate at smallest term.
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
  // x < 0: Ei(x) = -E1(-x).  Use series for small |x|, CF otherwise.
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
    const e1 = -_EI_EULER - Math.log(t) - sum;
    return -e1;
  }
  return -_eiE1ContinuedFraction(t);
}


function _siSeries(x) {
  // Si(x) = Σ_{k=0}^∞ (-1)^k x^{2k+1} / ((2k+1)(2k+1)!)
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


function _ciSeries(x) {
  // Ci(x) = γ + ln(x) + Σ_{k=1}^∞ (-1)^k x^{2k} / ((2k)(2k)!)
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
  return _EI_EULER + Math.log(x) + s;
}


function _siCiLentz(x) {
  // Complex modified-Lentz CF for E1(i·x) on real x > 0:
  //   E1(i·x) = e^{-i·x} · h,  h converges via the same recursion as real CF
  //   but with complex b₀ = 1 + i·x.  Returned real parts satisfy
  //     Si(x) - π/2 = Im(E1(i·x))
  //     -Ci(x)     = Re(E1(i·x))
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
  // E1(i·x) = (cos x - i·sin x) · h
  const cx = Math.cos(x), sx = Math.sin(x);
  const eRe = cx * hRe + sx * hIm;
  const eIm = cx * hIm - sx * hRe;
  return { siMinusHalfPi: eIm, minusCi: eRe };
}


function _si(x) {
  if (x === 0) return 0;
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  if (ax <= 4) return sign * _siSeries(ax);
  const { siMinusHalfPi } = _siCiLentz(ax);
  return sign * (Math.PI / 2 + siMinusHalfPi);
}


function _ci(x) {
  if (x === 0) throw new RPLError('Infinite result');
  if (x < 0) throw new RPLError('Bad argument value');
  if (x <= 4) return _ciSeries(x);
  const { minusCi } = _siCiLentz(x);
  return -minusCi;
}


function _eiScalar(v) {
  if (_isSymOperand(v)) return Symbolic(AstFn('Ei', [_toAst(v)]));
  const x = isInteger(v) ? Number(v.value) : isReal(v) ? v.value.toNumber() : null;
  if (x === null) throw new RPLError('Bad argument type');
  if (!Number.isFinite(x)) throw new RPLError('Bad argument value');
  return Real(_ei(x));
}


function _siScalar(v) {
  if (_isSymOperand(v)) return Symbolic(AstFn('Si', [_toAst(v)]));
  const x = isInteger(v) ? Number(v.value) : isReal(v) ? v.value.toNumber() : null;
  if (x === null) throw new RPLError('Bad argument type');
  if (!Number.isFinite(x)) throw new RPLError('Bad argument value');
  return Real(_si(x));
}


function _ciScalar(v) {
  if (_isSymOperand(v)) return Symbolic(AstFn('Ci', [_toAst(v)]));
  const x = isInteger(v) ? Number(v.value) : isReal(v) ? v.value.toNumber() : null;
  if (x === null) throw new RPLError('Bad argument type');
  if (!Number.isFinite(x)) throw new RPLError('Bad argument value');
  return Real(_ci(x));
}


register('Ei', _withTaggedUnary(_withListUnary((s) => {
  const v = s.pop();
  if (isVector(v))      s.push(Vector(v.items.map(_eiScalar)));
  else if (isMatrix(v)) s.push(Matrix(v.rows.map(r => r.map(_eiScalar))));
  else                  s.push(_eiScalar(v));
})), { category: 'Special functions', categoryOrder: 6, label: "EI" });


register('Si', _withTaggedUnary(_withListUnary((s) => {
  const v = s.pop();
  if (isVector(v))      s.push(Vector(v.items.map(_siScalar)));
  else if (isMatrix(v)) s.push(Matrix(v.rows.map(r => r.map(_siScalar))));
  else                  s.push(_siScalar(v));
})), { category: 'Special functions', categoryOrder: 8, label: "SI" });


register('Ci', _withTaggedUnary(_withListUnary((s) => {
  const v = s.pop();
  if (isVector(v))      s.push(Vector(v.items.map(_ciScalar)));
  else if (isMatrix(v)) s.push(Matrix(v.rows.map(r => r.map(_ciScalar))));
  else                  s.push(_ciScalar(v));
})), { category: 'Special functions', categoryOrder: 7, label: "CI" });
