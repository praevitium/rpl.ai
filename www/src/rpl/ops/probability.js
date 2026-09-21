import { RPLError } from '../stack.js';
import { Symbolic, isInteger, isReal, Integer, Real } from '../types.js';
import { Fn as AstFn } from '../algebra.js';
import { register } from './registry.js';
import { _isSymOperand, _lngamma, _regGammaQ, _toAst, _withListBinary, _withTaggedBinary } from './internal.js';



/* ------------------------------------------------------------------
   Combinatorics + integer div-mod + normal-CDF cluster

   COMB / PERM / IDIV2 / UTPN.  Commonly-used HP50 ops (COMB and PERM
   live under the MTH-NUM menu; IDIV2 under MTH-NUM-INTEG; UTPN on the
   STAT-DIST menu).  Kept co-located with the binary-op wrappers so the
   Tagged/List wrappers in scope are easy to reuse.

   ─── COMB(n, m) and PERM(n, m) ─────────────────────────────────
   Stack signature: level 2 = n, level 1 = m.  Both must be
   non-negative integers with n ≥ m — "Bad argument value" otherwise.
   Complex / unit / other types raise "Bad argument type".  Name /
   Symbolic lift to Symbolic(AstFn(...)) so `'N' 'K' COMB` produces
   `'COMB(N,K)'` on the stack.  Integer-valued Reals are accepted;
   truly non-integer Real → "Bad argument value".  Tagged transparency
   and List distribution come in automatically via the wrappers.

   ─── IDIV2(a, b) ────────────────────────────────────────────────
   Stack signature: level 2 = dividend, level 1 = divisor.  Returns
   TWO results: level 2 = quotient, level 1 = remainder, with
   a = q·b + r and r having the sign of the dividend (truncated
   division — matches HP50 and JS BigInt convention).  Integer-valued
   only; 0 divisor → "Infinite result".  Not wrapped in List/Tagged —
   the two-output stack effect doesn't compose with those wrappers.

   ─── UTPN(μ, σ², x) ─────────────────────────────────────────────
   Upper-tail normal probability: P(X > x) for X ~ Normal(μ, σ²).
   Stack (top-down): level 3 = μ, level 2 = σ², level 1 = x.
   Computed as 0.5·erfc((x − μ) / (σ·√2)) where σ = √σ².  σ² must
   be strictly positive — "Bad argument value" otherwise.  Real /
   Integer arguments only ("Bad argument type" for Complex, Unit,
   Name/Symbolic — no symbolic lift yet for 3-arg stats ops).
   ------------------------------------------------------------------ */

/** Parse a (Real | Integer | Symbolic-operand) pair for COMB/PERM.
 *  Returns { kind: 'sym', expr } for the Name/Symbolic lift path or
 *  { kind: 'int', n, m } for the numeric path.  Throws on any other
 *  type or on a non-integer-valued Real. */
function _combPermArgs(a, b, opName) {
  if (_isSymOperand(a) || _isSymOperand(b)) {
    const l = _toAst(a), r = _toAst(b);
    if (!l || !r) throw new RPLError('Bad argument type');
    return { kind: 'sym', expr: Symbolic(AstFn(opName, [l, r])) };
  }
  // Type guard mirrors `_intQuotientArg` (used by IQUOT / IREMAINDER /
  // IDIV2 / DIVMOD / DIV2MOD): only Integer or Real survive.  Rational
  // is explicitly rejected even when integer-valued (`5/1`) — HP50 AUR
  // §3-29 worked example shows the firmware rejects fractional COMB /
  // PERM arguments rather than coercing them; we match that contract
  // uniformly.  Complex is subsumed by !isInteger && !isReal.  Rational
  // is excluded explicitly because its payload is `{n, d}` — no `.value`
  // — so allowing it through would cause a JavaScript TypeError rather
  // than a clean RPLError at the downstream `v.value.isFinite()` check.
  if (!isInteger(a) && !isReal(a)) throw new RPLError('Bad argument type');
  if (!isInteger(b) && !isReal(b)) throw new RPLError('Bad argument type');
  const toBig = (v) => {
    if (isInteger(v)) return v.value;
    // Real is only accepted if integer-valued — COMB/PERM are defined
    // on the integers; HP50 AUR rejects fractional arguments as "Bad
    // argument value" rather than coercing via gamma (that's FACT's
    // job, not COMB's).
    if (!v.value.isFinite() || !v.value.isInteger()) {
      throw new RPLError('Bad argument value');
    }
    return BigInt(v.value.toFixed(0));
  };
  return { kind: 'int', n: toBig(a), m: toBig(b) };
}


register('COMB', _withTaggedBinary(_withListBinary((s) => {
  const [a, b] = s.popN(2);
  const args = _combPermArgs(a, b, 'COMB');
  if (args.kind === 'sym') { s.push(args.expr); return; }
  const { n, m } = args;
  if (n < 0n || m < 0n) throw new RPLError('Bad argument value');
  if (m > n)             throw new RPLError('Bad argument value');
  // Compute via the falling-factorial form so intermediates stay
  // near the final magnitude instead of blowing up into n! first.
  //   C(n, m) = (n · (n−1) · … · (n−m+1)) / m!
  let num = 1n, den = 1n;
  for (let i = 1n; i <= m; i++) { num *= (n - m + i); den *= i; }
  s.push(Integer(num / den));
})), { category: 'Probability / combinatorics', categoryOrder: 0, label: "COMB" });


register('PERM', _withTaggedBinary(_withListBinary((s) => {
  const [a, b] = s.popN(2);
  const args = _combPermArgs(a, b, 'PERM');
  if (args.kind === 'sym') { s.push(args.expr); return; }
  const { n, m } = args;
  if (n < 0n || m < 0n) throw new RPLError('Bad argument value');
  if (m > n)             throw new RPLError('Bad argument value');
  // P(n, m) = n · (n−1) · … · (n−m+1) — m terms, no division needed.
  let out = 1n;
  for (let i = 0n; i < m; i++) out *= (n - i);
  s.push(Integer(out));
})), { category: 'Probability / combinatorics', categoryOrder: 1, label: "PERM" });


/* Hastings-style Chebyshev approximation for erfc.  Numerical Recipes
   (Press et al., §6.2) — relative error ≤ 1.2e-7 over the whole real
   line.  The HP50 STAT-DIST tables are traditionally quoted to 10
   digits; a tighter approximation (Cheb expansion, 28 coefficients)
   would match that but would 10× the code with no user-visible gain
   for the ops here — upgrade is straightforward if a later eval ever
   needs it. */
function _erfc(x) {
  if (!Number.isFinite(x)) return x > 0 ? 0 : 2;
  const z = Math.abs(x);
  const t = 2 / (2 + z);
  const ans = t * Math.exp(
    -z * z - 1.26551223 +
    t * (1.00002368 +
    t * (0.37409196 +
    t * (0.09678418 +
    t * (-0.18628806 +
    t * (0.27886807 +
    t * (-1.13520398 +
    t * (1.48851587 +
    t * (-0.82215223 +
    t * 0.17087277))))))))
  );
  return x >= 0 ? ans : 2 - ans;
}


register('UTPN', (s) => {
  if (s.depth < 3) throw new RPLError('Too few arguments');
  const [mu, var2, x] = s.popN(3);
  const asReal = (v) => {
    if (isInteger(v)) return Number(v.value);
    if (isReal(v))    return v.value.toNumber();
    throw new RPLError('Bad argument type');
  };
  const m = asReal(mu);
  const V = asReal(var2);
  const X = asReal(x);
  if (!(V > 0) || !Number.isFinite(V)) {
    // σ² ≤ 0 or non-finite — a variance must be strictly positive.
    throw new RPLError('Bad argument value');
  }
  const sigma = Math.sqrt(V);
  const zScore = (X - m) / (sigma * Math.SQRT2);
  s.push(Real(0.5 * _erfc(zScore)));
}, { category: 'Probability / combinatorics', categoryOrder: 2, label: "UTPN" });


/** Scalar dispatcher for UTPC.
 *  Accepts Integer or Real for both ν (degrees of freedom, must be a
 *  strictly positive integer value) and x (chi-square variate, must be
 *  finite).  Returns Real.  Throws RPLError on type or value errors so
 *  it composes cleanly through _withListBinary / _withTaggedBinary. */
function _utpcScalar(nu, x) {
  const asReal = (v) => {
    if (isInteger(v)) return Number(v.value);
    if (isReal(v))    return v.value.toNumber();
    throw new RPLError('Bad argument type');
  };
  const n = asReal(nu), X = asReal(x);
  // Degrees of freedom must be a strictly positive integer — HP50
  // AUR describes UTPC in terms of integer ν only, and non-integer
  // "degrees" don't correspond to any standard table.
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
    throw new RPLError('Bad argument value');
  }
  // x < 0 has no chi-square support; the tail is P(X > x) = 1.  We
  // accept it cleanly (matches how UTPN accepts any real x); only
  // non-finite x is rejected.
  if (!Number.isFinite(X)) throw new RPLError('Bad argument value');
  if (X <= 0) return Real(1);
  return Real(_regGammaQ(n / 2, X / 2));
}


register('UTPC', _withTaggedBinary(_withListBinary((s) => {
  const [nu, x] = s.popN(2);
  s.push(_utpcScalar(nu, x));
})), { category: 'Probability / combinatorics', categoryOrder: 3, label: "UTPC" });


/** Continued-fraction evaluation for I_x(a, b).  Numerical Recipes
 *  §6.4 Lentz form.  1000-iteration cap, 1e-16 convergence target,
 *  1e-300 denominator sentinel.  Precondition: 0 < x < 1.  */
function _betaCF(a, b, x) {
  const EPS = 1e-16;
  const FPMIN = 1e-300;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - qab * x / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 1000; m++) {
    const m2 = 2 * m;
    let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;
    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}


/** Regularised incomplete beta I_x(a, b) = B(x; a, b) / B(a, b).
 *  NR §6.4.  Uses the symmetry I_x(a,b) = 1 − I_{1-x}(b,a) to keep
 *  both sides in the fast-converging regime of the continued fraction.
 *  Precondition: a > 0, b > 0, 0 ≤ x ≤ 1.  */
function _regBetaI(a, b, x) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(
    _lngamma(a + b) - _lngamma(a) - _lngamma(b)
    + a * Math.log(x) + b * Math.log(1 - x));
  if (x < (a + 1) / (a + b + 2)) {
    return bt * _betaCF(a, b, x) / a;
  }
  return 1 - bt * _betaCF(b, a, 1 - x) / b;
}


/** UTPF(n, d, F) — F-distribution upper tail P(X > F) where X ~ F(n, d).
 *  Via the textbook relation UTPF = I_{d/(d+nF)}(d/2, n/2) — the
 *  incomplete-beta closed form from Abramowitz & Stegun 26.6.2.
 *  HP50 AUR requires n, d to be strictly positive integers.  F may be
 *  any real; F ≤ 0 short-circuits to 1 (the F distribution has support
 *  F ≥ 0, so the upper tail at non-positive F is trivially the whole
 *  distribution).  */
register('UTPF', (s) => {
  if (s.depth < 3) throw new RPLError('Too few arguments');
  const [n, d, F] = s.popN(3);
  const asReal = (v) => {
    if (isInteger(v)) return Number(v.value);
    if (isReal(v))    return v.value.toNumber();
    throw new RPLError('Bad argument type');
  };
  const nv = asReal(n), dv = asReal(d), Fv = asReal(F);
  if (!Number.isFinite(nv) || !Number.isInteger(nv) || nv <= 0) {
    throw new RPLError('Bad argument value');
  }
  if (!Number.isFinite(dv) || !Number.isInteger(dv) || dv <= 0) {
    throw new RPLError('Bad argument value');
  }
  if (!Number.isFinite(Fv)) throw new RPLError('Bad argument value');
  if (Fv <= 0) { s.push(Real(1)); return; }
  // A&S 26.6.2:  P(X > F) = I_w(d/2, n/2),  w = d / (d + nF).
  const w = dv / (dv + nv * Fv);
  s.push(Real(_regBetaI(dv / 2, nv / 2, w)));
}, { category: 'Probability / combinatorics', categoryOrder: 4, label: "UTPF" });


/** Scalar dispatcher for UTPT.
 *  Accepts Integer or Real for both ν (degrees of freedom, must be a
 *  strictly positive integer value) and t (t-statistic, must be finite).
 *  Returns Real.  Throws RPLError on type or value errors so it composes
 *  cleanly through _withListBinary / _withTaggedBinary.
 *
 *  Closed-form via incomplete beta (A&S 26.7.3):
 *      P(|T| > |t|) = I_{ν/(ν+t²)}(ν/2, 1/2)
 *  so P(T > t) = 1/2 · I_{ν/(ν+t²)}(ν/2, 1/2)           for t ≥ 0,
 *     P(T > t) = 1 − 1/2 · I_{ν/(ν+t²)}(ν/2, 1/2)       for t < 0.
 *  At t = 0 the tail is exactly 0.5 (the t distribution is symmetric
 *  about 0); we return Real(0.5) without going through the CF.
 *  HP50 requires ν a strictly positive integer — non-integer "degrees
 *  of freedom" don't match any standard Student-t table.  */
function _utptScalar(nu, t) {
  const asReal = (v) => {
    if (isInteger(v)) return Number(v.value);
    if (isReal(v))    return v.value.toNumber();
    throw new RPLError('Bad argument type');
  };
  const nv = asReal(nu), tv = asReal(t);
  if (!Number.isFinite(nv) || !Number.isInteger(nv) || nv <= 0) {
    throw new RPLError('Bad argument value');
  }
  if (!Number.isFinite(tv)) throw new RPLError('Bad argument value');
  if (tv === 0) return Real(0.5);
  const w = nv / (nv + tv * tv);
  const I = _regBetaI(nv / 2, 0.5, w);
  return Real(tv > 0 ? 0.5 * I : 1 - 0.5 * I);
}


register('UTPT', _withTaggedBinary(_withListBinary((s) => {
  const [nu, t] = s.popN(2);
  s.push(_utptScalar(nu, t));
})), { category: 'Probability / combinatorics', categoryOrder: 5, label: "UTPT" });
