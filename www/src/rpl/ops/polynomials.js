import { isProgram, Str, isList, isReal, isInteger, isComplex, RList, Integer, Symbolic, Vector, Real, Complex, isSymbolic, isVector, isName } from '../types.js';
import { RPLError, checkTimeLimit } from '../stack.js';
import { format as formatValue, DEFAULT_DISPLAY } from '../formatter.js';
import { Var as AstVar, Bin as AstBin, Num as AstNum, Neg as AstNeg, Fn as AstFn, isNum as astIsNum, freeVars as algebraFreeVars } from '../algebra.js';
import { giac } from '../cas/giac-engine.mjs';
import { giacToAst, splitGiacList } from '../cas/giac-convert.mjs';
import { register } from './registry.js';
import { _astToRplValue, _coefArrToSymbolicX, _cx, _cxAdd, _cxDiv, _cxMul, _cxSub, _nFromIntegerArg, _scalarBinary, _scalarToGiacStr, _toAst } from './internal.js';



register('DECOMP', (s) => {
  const [v] = s.popN(1);
  if (!isProgram(v)) throw new RPLError('Bad argument type');
  s.push(Str(formatValue(v, DEFAULT_DISPLAY)));
}, { category: 'Polynomials', categoryOrder: 10, label: "DECOMP" });


// Coefficient lists run from the highest degree down, as on the HP50.
const _isCoef = (v) => isReal(v) || isInteger(v) || isComplex(v);

function _popPolyAndPoint(s) {
  const [poly, a] = s.popN(2);
  if (!isList(poly)) throw new RPLError('Bad argument type');
  if (poly.items.length === 0) throw new RPLError('Bad argument value');
  if (!poly.items.every(_isCoef) || !_isCoef(a)) throw new RPLError('Bad argument type');
  return [poly.items, a];
}

// Synthetic division by (x - a): the quotient and the remainder p(a).
function _hornerDivide(coefs, a) {
  const q = [];
  let r = coefs[0];
  for (let i = 1; i < coefs.length; i++) {
    q.push(r);
    r = _scalarBinary('+', _scalarBinary('*', r, a), coefs[i]);
  }
  return { q, r };
}


register('HORNER', (s) => {
  const [coefs, a] = _popPolyAndPoint(s);
  const { q, r } = _hornerDivide(coefs, a);
  s.push(RList(q));
  s.push(r);
  s.push(a);
}, { category: 'Polynomials', categoryOrder: 3, label: "HORNER" });


register('PCOEF', (s) => {
  const [rootsList] = s.popN(1);
  if (!isList(rootsList) || !rootsList.items.every(_isCoef)) throw new RPLError('Bad argument type');
  let coefs = [Integer(1n)];
  for (const r of rootsList.items) {
    const next = [coefs[0]];
    for (let i = 1; i < coefs.length; i++) {
      next.push(_scalarBinary('-', coefs[i], _scalarBinary('*', r, coefs[i - 1])));
    }
    next.push(_scalarBinary('-', Integer(0n), _scalarBinary('*', r, coefs[coefs.length - 1])));
    coefs = next;
  }
  s.push(RList(coefs));
}, { category: 'Polynomials', categoryOrder: 1, label: "PCOEF" });


register('FCOEF', (s) => {
  const [pairList] = s.popN(1);
  if (!isList(pairList)) throw new RPLError('Bad argument type');
  const items = pairList.items;
  if (items.length % 2 !== 0) throw new RPLError('Bad argument value');
  let acc = null;
  for (let i = 0; i < items.length; i += 2) {
    const multV = items[i + 1];
    if (!isInteger(multV) && !(isReal(multV) && multV.value.isInteger())) {
      throw new RPLError('Bad argument type');
    }
    const m = isInteger(multV) ? Number(multV.value) : multV.value.toNumber();
    if (m < 0 || !Number.isSafeInteger(m)) throw new RPLError('Bad argument value');
    for (let k = 0; k < m; k++) {
      checkTimeLimit();
      const root = _toAst(items[i]);
      if (!root) throw new RPLError('Bad argument type');
      const fac = AstBin('-', AstVar('X'), root);
      acc = acc === null ? fac : AstBin('*', acc, fac);
    }
  }
  s.push(Symbolic(acc ?? AstNum(1)));
}, { category: 'Polynomials', categoryOrder: 0, label: "FCOEF" });


function _coefToCx(c) {
  if (isInteger(c)) return _cx(Number(c.value), 0);
  if (isReal(c))    return _cx(c.value.toNumber(), 0);
  if (isComplex(c)) return _cx(c.re, c.im);
  throw new RPLError('Bad argument type');
}


function _cxAbs(z) { return Math.hypot(z.re, z.im); }


function _polyEvalCx(coefs, z) {
  let r = coefs[0];
  for (let i = 1; i < coefs.length; i++) {
    r = _cxAdd(_cxMul(r, z), coefs[i]);
  }
  return r;
}


// Durand-Kerner roots of complex coefficients (highest degree first).
// A real polynomial reports roots with a negligible imaginary part as Real.
// Returns [] for a non-zero constant.
function _proot(cxRaw, polyIsReal) {
  let start = 0;
  while (start < cxRaw.length - 1 && cxRaw[start].re === 0 && cxRaw[start].im === 0) start++;
  const cx = cxRaw.slice(start);
  if (cx.length === 1) {
    if (cx[0].re === 0 && cx[0].im === 0) throw new RPLError('Bad argument value');
    return [];
  }
  const toValue = (z) => (polyIsReal && Math.abs(z.im) < 1e-9 * Math.max(Math.abs(z.re), 1)
    ? Real(z.re)
    : Complex(z.re, z.im));
  const n = cx.length - 1;
  const p = cx.map((c) => _cxDiv(c, cx[0]));
  if (n === 1) return [toValue({ re: -p[1].re, im: -p[1].im })];
  // Start on a circle outside Cauchy's bound, rotated off the real axis.
  let R = 0;
  for (let i = 1; i <= n; i++) {
    const m = _cxAbs(p[i]);
    if (m > R) R = m;
  }
  R = 1 + R;
  const roots = new Array(n);
  for (let k = 0; k < n; k++) {
    const ang = 2 * Math.PI * (k + 0.25) / n;
    roots[k] = { re: R * Math.cos(ang), im: R * Math.sin(ang) };
  }
  const MAX_ITER = 400;
  const TOL = 1e-12;
  for (let iter = 0; iter < MAX_ITER; iter++) {
    checkTimeLimit();
    let maxDelta = 0;
    const next = new Array(n);
    for (let i = 0; i < n; i++) {
      const zi = roots[i];
      const num = _polyEvalCx(p, zi);
      let den = _cx(1, 0);
      for (let j = 0; j < n; j++) {
        if (j === i) continue;
        den = _cxMul(den, _cxSub(zi, roots[j]));
      }
      if (den.re === 0 && den.im === 0) {
        next[i] = { re: zi.re + 1e-8, im: zi.im + 1e-8 };
        continue;
      }
      const delta = _cxDiv(num, den);
      next[i] = _cxSub(zi, delta);
      const dmag = _cxAbs(delta);
      const scale = Math.max(_cxAbs(zi), 1);
      if (dmag / scale > maxDelta) maxDelta = dmag / scale;
    }
    for (let i = 0; i < n; i++) roots[i] = next[i];
    if (maxDelta < TOL) break;
  }
  return roots.map(toValue);
}


register('PROOT', (s) => {
  const [poly] = s.popN(1);
  if (!isList(poly)) throw new RPLError('Bad argument type');
  if (poly.items.length === 0) throw new RPLError('Bad argument value');
  const roots = _proot(poly.items.map(_coefToCx), poly.items.every((c) => !isComplex(c) || c.im === 0));
  // An empty Vector cannot exist, so a constant yields an empty list.
  s.push(roots.length ? Vector(roots) : RList([]));
}, { category: 'Polynomials', categoryOrder: 5, label: "PROOT" });


function _isNumericZero(x) {
  if (isInteger(x)) return x.value === 0n;
  if (isReal(x))    return x.value.isZero();
  if (isComplex(x)) return x.re === 0 && x.im === 0;
  return false;
}


function _polyTrimLeading(items) {
  let i = 0;
  while (i < items.length - 1 && _isNumericZero(items[i])) i++;
  return items.slice(i);
}


function _polyDivide(A, B) {
  if (B.length === 1 && _isNumericZero(B[0])) throw new RPLError('Infinite result');
  const n = A.length - 1, m = B.length - 1;
  if (n < m) return { q: [Integer(0n)], r: A };
  const rem = A.slice();
  const q = [];
  for (let i = 0; i <= n - m; i++) {
    const qi = _scalarBinary('/', rem[i], B[0]);
    q.push(qi);
    for (let k = 0; k <= m; k++) {
      rem[i + k] = _scalarBinary('-', rem[i + k], _scalarBinary('*', qi, B[k]));
    }
  }
  const r = _polyTrimLeading(rem.slice(n - m + 1));
  return { q, r: r.length ? r : [Integer(0n)] };
}


function _popPolyDivision(s) {
  const [A, B] = s.popN(2);
  if (!isList(A) || !isList(B)) throw new RPLError('Bad argument type');
  if (A.items.length === 0 || B.items.length === 0) throw new RPLError('Bad argument value');
  if (!A.items.every(_isCoef) || !B.items.every(_isCoef)) throw new RPLError('Bad argument type');
  return _polyDivide(_polyTrimLeading(A.items), _polyTrimLeading(B.items));
}


register('QUOT', (s) => {
  s.push(RList(_popPolyDivision(s).q));
}, { category: 'Polynomials', categoryOrder: 7, label: "QUOT" });


register('REMAINDER', (s) => {
  s.push(RList(_popPolyDivision(s).r));
}, { category: 'Polynomials', categoryOrder: 8, label: "REMAINDER" });


register('PEVAL', (s) => {
  const [coefs, x] = _popPolyAndPoint(s);
  s.push(_hornerDivide(coefs, x).r);
}, { category: 'Polynomials', categoryOrder: 2, label: "PEVAL" });


// Repeated synthetic division by (x - a) yields the coefficients of the
// same polynomial in powers of (x - a), lowest first.
register('PTAYL', (s) => {
  const [items, a] = _popPolyAndPoint(s);
  let coefs = items;
  const shifted = [];
  while (coefs.length > 1) {
    const { q, r } = _hornerDivide(coefs, a);
    shifted.push(r);
    coefs = q;
  }
  shifted.push(coefs[0]);
  s.push(RList(shifted.reverse()));
}, { category: 'Polynomials', categoryOrder: 4, label: "PTAYL" });


// Exact quotient over Z[X]; q must divide p.
function _polyDivBig(p, q) {
  const pa = p.slice();
  const quotLen = pa.length - q.length + 1;
  const out = new Array(quotLen);
  for (let i = 0; i < quotLen; i++) {
    const factor = pa[i] / q[0];
    out[i] = factor;
    for (let j = 0; j < q.length; j++) pa[i + j] -= factor * q[j];
  }
  return out;
}


// Φ_n from X^n - 1 = ∏ Φ_d over the divisors d of n.
function _cyclotomicCoefsBig(n) {
  const phi = new Map([[1, [1n, -1n]]]);
  for (let k = 2; k <= n; k++) {
    let num = new Array(k + 1).fill(0n);
    num[0] = 1n;
    num[k] = -1n;
    for (let d = 1; d < k; d++) {
      if (k % d === 0) num = _polyDivBig(num, phi.get(d));
    }
    phi.set(k, num);
  }
  return phi.get(n);
}


function _coefBigArrToSymbolicX(coefs) {
  return _coefArrToSymbolicX(coefs.map((c) => {
    const n = Number(c);
    if (!Number.isFinite(n) || BigInt(n) !== c) throw new RPLError('Bad argument value');
    return n;
  }));
}


register('CYCLOTOMIC', (s) => {
  const [v] = s.popN(1);
  const n = _nFromIntegerArg(v);
  if (n < 1 || n > 200) throw new RPLError('Bad argument value');
  s.push(_coefBigArrToSymbolicX(_cyclotomicCoefsBig(n)));
}, { category: 'Polynomials', categoryOrder: 9, label: "CYCLOTOMIC" });


function _frootsAdditiveTerms(ast) {
  const out = [];
  (function walk(n, sign) {
    if (n.kind === 'bin' && (n.op === '+' || n.op === '-')) {
      walk(n.l, sign);
      walk(n.r, n.op === '+' ? sign : -sign);
    } else if (n.kind === 'neg') {
      walk(n.arg, -sign);
    } else {
      out.push({ sign, term: n });
    }
  })(ast, 1);
  return out;
}

function _frootsRebuildSum(parts) {
  if (parts.length === 0) return AstNum(0);
  let result = parts[0].sign < 0 ? AstNeg(parts[0].term) : parts[0].term;
  for (let i = 1; i < parts.length; i++) {
    const p = parts[i];
    result = AstBin(p.sign < 0 ? '-' : '+', result, p.term);
  }
  return result;
}

function _frootsExpandProduct(a, b) {
  const parts = [];
  for (const ta of _frootsAdditiveTerms(a)) {
    for (const tb of _frootsAdditiveTerms(b)) {
      checkTimeLimit();
      parts.push({ sign: ta.sign * tb.sign, term: AstBin('*', ta.term, tb.term) });
    }
  }
  return _frootsRebuildSum(parts);
}

// Distributes products and small powers into a flat sum of monomials;
// like terms are combined later, by power.
function _frootsExpand(ast) {
  if (ast.kind === 'neg') return AstNeg(_frootsExpand(ast.arg));
  if (ast.kind === 'fn') return AstFn(ast.name, ast.args.map(_frootsExpand));
  if (ast.kind !== 'bin') return ast;
  const l = _frootsExpand(ast.l);
  const r = _frootsExpand(ast.r);
  if (ast.op === '*') return _frootsExpandProduct(l, r);
  if (ast.op === '^' && r.kind === 'num' && Number.isInteger(r.value) && r.value >= 0 && r.value <= 16) {
    if (r.value === 0) return AstNum(1);
    let acc = l;
    for (let i = 2; i <= r.value; i++) acc = _frootsExpandProduct(acc, l);
    return acc;
  }
  return AstBin(ast.op, l, r);
}


// Real coefficients of a polynomial in `varName`, highest degree first
// and with no leading zero.
function _symbolicPolyToNumCoefs(ast, varName) {
  const coefByPow = new Map();
  for (const { sign, term } of _frootsAdditiveTerms(_frootsExpand(ast))) {
    let coef = sign;
    let power = 0;
    (function walk(n) {
      if (astIsNum(n)) {
        coef *= n.value;
      } else if (n.kind === 'neg') {
        coef *= -1;
        walk(n.arg);
      } else if (n.kind === 'bin' && n.op === '*') {
        walk(n.l);
        walk(n.r);
      } else if (n.kind === 'bin' && n.op === '/' && astIsNum(n.r)) {
        walk(n.l);
        coef *= 1 / n.r.value;
      } else if (n.kind === 'var' && n.name === varName) {
        power += 1;
      } else if (n.kind === 'bin' && n.op === '^' && n.l.kind === 'var' && n.l.name === varName
          && astIsNum(n.r) && Number.isInteger(n.r.value) && n.r.value >= 0) {
        power += n.r.value;
      } else {
        throw new RPLError('Bad argument value');
      }
    })(term);
    coefByPow.set(power, (coefByPow.get(power) || 0) + coef);
  }
  const pows = [...coefByPow.keys()].filter((p) => coefByPow.get(p) !== 0);
  if (pows.length === 0) throw new RPLError('Bad argument value');
  const maxPow = Math.max(...pows);
  const out = new Array(maxPow + 1).fill(0);
  for (const p of pows) out[maxPow - p] = coefByPow.get(p);
  if (!out.every(Number.isFinite)) throw new RPLError('Bad argument value');
  return out;
}


// Durand-Kerner leaves the copies of a repeated root spread over ~1e-5,
// far wider than PROOT's Real cut-off, so roots are merged with a looser
// tolerance that still keeps distinct roots apart.
function _clusterRoots(roots) {
  const groups = [];
  for (const r of roots) {
    const re = isReal(r) ? r.value.toNumber() : r.re;
    const im = isReal(r) ? 0 : r.im;
    const g = groups.find((g) => {
      const gre = g.reSum / g.mult;
      const gim = g.imSum / g.mult;
      const scale = Math.max(Math.abs(gre), Math.abs(gim), Math.abs(re), Math.abs(im), 1);
      const tol = Math.max(1e-4 * scale, 1e-7);
      return Math.abs(re - gre) < tol && Math.abs(im - gim) < tol;
    });
    if (g) {
      g.reSum += re;
      g.imSum += im;
      g.mult += 1;
    } else {
      groups.push({ reSum: re, imSum: im, mult: 1 });
    }
  }
  return groups.map((g) => {
    const re = g.reSum / g.mult;
    const im = g.imSum / g.mult;
    const imTol = Math.max(1e-4 * Math.max(Math.abs(re), 1), 1e-7);
    const root = Math.abs(im) < imTol
      ? (Number.isInteger(re) ? Integer(BigInt(re)) : Real(re))
      : Complex(re, im);
    return { root, mult: g.mult };
  });
}


// Past 2^53 a double no longer holds an exact integer, and the divisor
// search would run for ever.
const _allIntegerCoefs = (coefs) => coefs.every(Number.isSafeInteger);


function _posDivisors(n) {
  const N = Math.abs(n);
  const out = [];
  for (let d = 1; d * d <= N; d++) {
    checkTimeLimit();
    if (N % d === 0) {
      out.push(d);
      if (d * d !== N) out.push(N / d);
    }
  }
  return out.sort((a, b) => a - b);
}


function _igcd(a, b) {
  while (b !== 0) [a, b] = [b, a % b];
  return a;
}


// den^n · p(num/den), which vanishes when num/den is a root.
function _evalRational(coefs, num, den) {
  const n = coefs.length - 1;
  let sum = 0;
  for (let i = 0; i <= n; i++) {
    sum += coefs[i] * Math.pow(num, n - i) * Math.pow(den, i);
  }
  return sum;
}


function _syntheticDivRational(coefs, num, den) {
  const r = num / den;
  const out = new Array(coefs.length - 1).fill(0);
  out[0] = coefs[0];
  for (let k = 1; k < coefs.length - 1; k++) out[k] = coefs[k] + r * out[k - 1];
  return out;
}


// Divides out the rational roots p/q (p divides the constant term, q the
// leading coefficient) of an integer polynomial so they stay exact instead
// of going through Durand-Kerner.  Stops once a division leaves
// non-integer coefficients.
function _peelRationalRoots(coefs) {
  let current = coefs.slice();
  const roots = [];
  const addRoot = (num, den) => {
    const hit = roots.find((r) => r.num === num && r.den === den);
    if (hit) hit.mult += 1;
    else roots.push({ num, den, mult: 1 });
  };
  while (current.length > 1 && current[current.length - 1] === 0) {
    current = current.slice(0, -1);
    addRoot(0, 1);
  }
  let progress = true;
  while (progress && current.length > 1 && _allIntegerCoefs(current)) {
    progress = false;
    const lead = current[0];
    const tail = current[current.length - 1];
    if (lead === 0 || tail === 0) break;
    const pDivs = _posDivisors(tail);
    outer: for (const q of _posDivisors(lead)) {
      for (const p of pDivs) {
        if (_igcd(p, q) !== 1) continue;
        for (const num of [p, -p]) {
          if (_evalRational(current, num, q) !== 0) continue;
          current = _syntheticDivRational(current, num, q);
          addRoot(num, q);
          progress = true;
          break outer;
        }
      }
    }
  }
  return { rationalRoots: roots, residualCoefs: current };
}


// |n| = k² · m with m squarefree.
function _squareFactorDecompose(n) {
  let k = 1;
  let m = n;
  for (let p = 2; p * p <= m; p++) {
    checkTimeLimit();
    while (m % (p * p) === 0) {
      k *= p;
      m = m / (p * p);
    }
  }
  return { k, m };
}


// The two roots (-b ± k√m)/2a of an integer quadratic with a positive,
// non-square discriminant, in lowest terms; null for any other case.
function _quadraticExactRoots(coefs) {
  if (coefs.length !== 3 || !_allIntegerCoefs(coefs)) return null;
  const [a, b, c] = coefs;
  if (a === 0) return null;
  // A discriminant past 2^53 would be rounded, making the radical wrong.
  const bigD = BigInt(b) * BigInt(b) - 4n * BigInt(a) * BigInt(c);
  if (bigD <= 0n || bigD > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  const D = Number(bigD);
  if (Number.isInteger(Math.sqrt(D))) return null;
  const { k, m } = _squareFactorDecompose(D);
  const twoA = 2 * a;
  const g = _igcd(_igcd(Math.abs(b), k), Math.abs(twoA));
  const nd = twoA / g;
  const signFlip = nd < 0 ? -1 : 1;
  const RB = -b / g * signFlip;
  const K = k / g * signFlip;
  const DEN = Math.abs(nd);
  const sqrtM = AstFn('SQRT', [AstNum(m)]);
  const times = (j) => (j === 1 ? sqrtM : AstBin('*', AstNum(j), sqrtM));
  const build = (sign) => {
    const j = sign * K;
    let num;
    if (RB === 0) num = j > 0 ? times(j) : AstNeg(times(-j));
    else num = AstBin(j > 0 ? '+' : '-', AstNum(RB), times(Math.abs(j)));
    return DEN === 1 ? num : AstBin('/', num, AstNum(DEN));
  };
  return [build(1), build(-1)];
}


// a·X⁴ + b·X² + c solved as a quadratic in X², giving ±√u for each root u.
function _biquadExactRoots(coefs) {
  if (coefs.length !== 5 || coefs[1] !== 0 || coefs[3] !== 0) return null;
  const uRoots = _quadraticExactRoots([coefs[0], coefs[2], coefs[4]]);
  return uRoots && uRoots.flatMap((u) => [AstFn('SQRT', [u]), AstNeg(AstFn('SQRT', [u]))]);
}


function _rationalRootValue(num, den) {
  if (den === 1) return Integer(BigInt(num));
  const frac = AstBin('/', AstNum(Math.abs(num)), AstNum(den));
  return Symbolic(num < 0 ? AstNeg(frac) : frac);
}


// Exact rational and radical roots are found first; whatever is left goes
// to PROOT's Durand-Kerner.  Multiplicities are Integers, where the HP50
// gives Reals.
register('FROOTS', (s) => {
  const [v] = s.popN(1);
  if (!isSymbolic(v)) throw new RPLError('Bad argument type');
  const vars = algebraFreeVars(v.expr);
  if (vars.size > 1) throw new RPLError('Bad argument value');
  const coefs = _symbolicPolyToNumCoefs(v.expr, vars.size === 1 ? [...vars][0] : 'X');
  const out = [];
  const add = (root, mult) => out.push(root, Integer(BigInt(mult)));
  let residual = coefs;
  if (_allIntegerCoefs(coefs)) {
    const { rationalRoots, residualCoefs } = _peelRationalRoots(coefs);
    for (const r of rationalRoots) add(_rationalRootValue(r.num, r.den), r.mult);
    residual = residualCoefs;
  }
  const exact = _quadraticExactRoots(residual) ?? _biquadExactRoots(residual);
  if (exact) {
    for (const ast of exact) add(Symbolic(ast), 1);
    residual = [residual[0]];
  }
  if (residual.length > 1) {
    for (const g of _clusterRoots(_proot(residual.map((c) => _cx(c, 0)), true))) add(g.root, g.mult);
  }
  s.push(RList(out));
}, { category: 'Polynomials', categoryOrder: 6, label: "FROOTS" });


function _giacPolysAndVars(polysV, varsV) {
  if (!isVector(varsV) || !isVector(polysV)) throw new RPLError('Bad argument type');
  if (varsV.items.length === 0 || polysV.items.length === 0) throw new RPLError('Invalid dimension');
  if (!varsV.items.every(isName)) throw new RPLError('Bad argument type');
  if (!giac.isReady()) throw new RPLError('CAS not ready');
  const polys = polysV.items.map(_scalarToGiacStr).join(',');
  const vars = varsV.items.map((n) => n.id).join(',');
  return `[${polys}],[${vars}]`;
}


register('GREDUCE', (s) => {
  const [poly, basisV, varsV] = s.popN(3);
  const args = _giacPolysAndVars(basisV, varsV);
  const raw = giac.caseval(`greduce(${_scalarToGiacStr(poly)},${args})`);
  s.push(_astToRplValue(giacToAst(raw)));
}, { category: 'Polynomials', categoryOrder: 12, label: "GREDUCE" });


register('GBASIS', (s) => {
  const [polysV, varsV] = s.popN(2);
  const parts = splitGiacList(giac.caseval(`gbasis(${_giacPolysAndVars(polysV, varsV)})`));
  if (parts === null) throw new RPLError('Bad argument value');
  s.push(Vector(parts.map((elt) => _astToRplValue(giacToAst(elt)))));
}, { category: 'Polynomials', categoryOrder: 11, label: "GBASIS" });
