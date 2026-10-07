import { RPLError } from '../stack.js';
import { Symbolic, isInteger, isReal, Integer, Real } from '../types.js';
import { Fn as AstFn } from '../algebra.js';
import { register } from './registry.js';
import { _isSymOperand, _lngamma, _regGammaQ, _toAst, _withListBinary, _withTaggedBinary } from './internal.js';



function _realArg(v) {
  if (isInteger(v)) return Number(v.value);
  if (isReal(v))    return v.value.toNumber();
  throw new RPLError('Bad argument type');
}

function _requireDegrees(n) {
  if (!Number.isInteger(n) || n <= 0) throw new RPLError('Bad argument value');
}

// An integral Real counts as an integer, but a Rational is refused even when
// integral: the HP50 rejects fractional COMB / PERM arguments (AUR §3-29).
function _combPermArgs(a, b, opName) {
  if (_isSymOperand(a) || _isSymOperand(b)) {
    const l = _toAst(a), r = _toAst(b);
    if (!l || !r) throw new RPLError('Bad argument type');
    return { kind: 'sym', expr: Symbolic(AstFn(opName, [l, r])) };
  }
  if (!isInteger(a) && !isReal(a)) throw new RPLError('Bad argument type');
  if (!isInteger(b) && !isReal(b)) throw new RPLError('Bad argument type');
  const toBig = (v) => {
    if (isInteger(v)) return v.value;
    if (!v.value.isFinite() || !v.value.isInteger()) {
      throw new RPLError('Bad argument value');
    }
    return BigInt(v.value.toFixed(0));
  };
  const n = toBig(a), m = toBig(b);
  if (n < 0n || m < 0n || m > n) throw new RPLError('Bad argument value');
  return { kind: 'int', n, m };
}


register('COMB', _withTaggedBinary(_withListBinary((s) => {
  const [a, b] = s.popN(2);
  const args = _combPermArgs(a, b, 'COMB');
  if (args.kind === 'sym') { s.push(args.expr); return; }
  const { n, m } = args;
  // The falling factorial over m! keeps intermediates near the result's size.
  let num = 1n, den = 1n;
  for (let i = 1n; i <= m; i++) { num *= (n - m + i); den *= i; }
  s.push(Integer(num / den));
})), { category: 'Probability / combinatorics', categoryOrder: 0, label: "COMB" });


register('PERM', _withTaggedBinary(_withListBinary((s) => {
  const [a, b] = s.popN(2);
  const args = _combPermArgs(a, b, 'PERM');
  if (args.kind === 'sym') { s.push(args.expr); return; }
  const { n, m } = args;
  let out = 1n;
  for (let i = 0n; i < m; i++) out *= (n - i);
  s.push(Integer(out));
})), { category: 'Probability / combinatorics', categoryOrder: 1, label: "PERM" });


// Numerical Recipes §6.2 Chebyshev fit: relative error below 1.2e-7, well
// short of the HP50's 12 digits.
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


// AUR: NDIST ( m v x → the normal density at x ) for the mean m and variance v.
register('NDIST', (s) => {
  const [mu, var2, x] = s.popN(3);
  const m = _realArg(mu);
  const V = _realArg(var2);
  const X = _realArg(x);
  if (!(V > 0) || !Number.isFinite(V)) throw new RPLError('Bad argument value');
  s.push(Real(Math.exp(-((X - m) ** 2) / (2 * V)) / Math.sqrt(2 * Math.PI * V)));
}, { category: 'Probability / combinatorics', categoryOrder: 2.5, label: "NDIST" });

// UTPN ( μ σ² x → P(X > x) ) for X ~ Normal(μ, σ²).
register('UTPN', (s) => {
  const [mu, var2, x] = s.popN(3);
  const m = _realArg(mu);
  const V = _realArg(var2);
  const X = _realArg(x);
  if (!(V > 0) || !Number.isFinite(V)) throw new RPLError('Bad argument value');
  const zScore = (X - m) / (Math.sqrt(V) * Math.SQRT2);
  s.push(Real(0.5 * _erfc(zScore)));
}, { category: 'Probability / combinatorics', categoryOrder: 2, label: "UTPN" });


function _utpcScalar(nu, x) {
  const n = _realArg(nu), X = _realArg(x);
  _requireDegrees(n);
  if (!Number.isFinite(X)) throw new RPLError('Bad argument value');
  if (X <= 0) return Real(1);
  return Real(_regGammaQ(n / 2, X / 2));
}


register('UTPC', _withTaggedBinary(_withListBinary((s) => {
  const [nu, x] = s.popN(2);
  s.push(_utpcScalar(nu, x));
})), { category: 'Probability / combinatorics', categoryOrder: 3, label: "UTPC" });


// Lentz continued fraction for I_x(a, b), Numerical Recipes §6.4.
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


// Regularized incomplete beta.  The symmetry I_x(a,b) = 1 − I_{1−x}(b,a)
// keeps the continued fraction where it converges fast.
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


// A&S 26.6.2: P(X > F) = I_w(d/2, n/2) with w = d / (d + n·F).
register('UTPF', (s) => {
  const [n, d, F] = s.popN(3);
  const nv = _realArg(n), dv = _realArg(d), Fv = _realArg(F);
  _requireDegrees(nv);
  _requireDegrees(dv);
  if (!Number.isFinite(Fv)) throw new RPLError('Bad argument value');
  if (Fv <= 0) { s.push(Real(1)); return; }
  const w = dv / (dv + nv * Fv);
  s.push(Real(_regBetaI(dv / 2, nv / 2, w)));
}, { category: 'Probability / combinatorics', categoryOrder: 4, label: "UTPF" });


// A&S 26.7.3: P(|T| > |t|) = I_w(ν/2, 1/2) with w = ν / (ν + t²).
function _utptScalar(nu, t) {
  const nv = _realArg(nu), tv = _realArg(t);
  _requireDegrees(nv);
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
