import { isProgram, Str, isList, isReal, isInteger, isComplex, RList, Integer, Symbolic, Vector, Real, Complex, isSymbolic, isVector, isName } from '../types.js';
import { RPLError } from '../stack.js';
import { format as formatValue, DEFAULT_DISPLAY } from '../formatter.js';
import { Var as AstVar, Bin as AstBin, Num as AstNum, Neg as AstNeg, Fn as AstFn, isNum as astIsNum, freeVars as algebraFreeVars } from '../algebra.js';
import { giac } from '../cas/giac-engine.mjs';
import { giacToAst, splitGiacList } from '../cas/giac-convert.mjs';
import { register, lookup } from './registry.js';
import { _ONE, _ZERO, _astToRplValue, _coefArrToSymbolicX, _cx, _cxAdd, _cxDiv, _cxMul, _cxSub, _nFromIntegerArg, _scalarBinary, _scalarToGiacStr, _toAst } from './internal.js';



/* ----------------------------------------------------------------
   DECOMP — program → string source form.

   HP50 AUR p.1-12 defines DECOMP as the inverse of a Program's
   tokenization: it yields the program's source-code string.  In
   effect this is `→STR` specialised to the Program case with a
   guaranteed string whose `STR→` round-trip reproduces the Program.

   We enforce the "Program only" shape because DECOMP on non-Program
   values is ill-defined on real hardware (the equivalent user op for
   arbitrary objects is `→STR`).  Rejecting non-Program with
   `Bad argument type` matches the AUR error prefix.
   ---------------------------------------------------------------- */
register('DECOMP', (s) => {
  const [v] = s.popN(1);
  if (!isProgram(v)) throw new RPLError('Bad argument type');
  s.push(Str(formatValue(v, DEFAULT_DISPLAY)));
}, { category: 'Polynomials', categoryOrder: 10, label: "DECOMP" });


/* --------------- HORNER — synthetic division of polynomial -----------
   HP50 AUR §12.6.  Applied to a polynomial presented as a coefficient
   list in DESCENDING order of degree (same convention as PCOEF's
   output), HORNER synthetically divides by (x − a).

     HORNER  ( {c_n … c_1 c_0} a → {q_{n-1} … q_0} r a )

   Result: { c_n,  c_{n-1} + a·q_{n-1},  … } — i.e. the Horner-scheme
   quotient, plus the remainder (= value of the polynomial at x = a),
   and `a` itself re-pushed on top to match HP50's 3-level return.
   Empty coefficient list throws Bad argument value.  Coefficients and
   a are Real / Integer / Complex; Symbolic coefficients are rejected
   in this list-form (Symbolic-polynomial HORNER is the CAS-side op
   deferred with the polynomial-normalize pass).
   ----------------------------------------------------------------- */

register('HORNER', (s) => {
  const [poly, a] = s.popN(2);
  if (!isList(poly)) throw new RPLError('Bad argument type');
  if (poly.items.length === 0) throw new RPLError('Bad argument value');
  // Accept Real / Integer / Complex / BinaryInteger-less numerics only.
  for (const c of poly.items) {
    if (!isReal(c) && !isInteger(c) && !isComplex(c)) {
      throw new RPLError('Bad argument type');
    }
  }
  if (!isReal(a) && !isInteger(a) && !isComplex(a)) {
    throw new RPLError('Bad argument type');
  }
  const coefs = poly.items;
  const n = coefs.length;
  const q = new Array(n - 1);
  let r = coefs[0];
  for (let i = 1; i < n; i++) {
    q[i - 1] = r;
    // r = r * a + c_i  (via _scalarBinary for mixed numeric-type safety)
    r = _scalarBinary('+', _scalarBinary('*', r, a), coefs[i]);
  }
  s.push(RList(q));
  s.push(r);
  s.push(a);
}, { category: 'Polynomials', categoryOrder: 3, label: "HORNER" });


/* --------------- PCOEF / FCOEF — roots ↔ polynomial ------------------
   HP50 AUR §12.6.

     PCOEF   ( {r_1 … r_n} → {1 c_1 … c_n} )
              Given a list of roots, returns the coefficient list of
              the monic polynomial (x − r_1)(x − r_2)…(x − r_n).  Leading
              coefficient is always Integer(1) — suitable for feeding
              straight into HORNER.  Real / Integer / Complex roots all
              flow through.  Empty roots list returns {1}.

     FCOEF   ( {r_1 m_1 … r_k m_k} → Sy )
              Given (root, multiplicity) pairs, returns the Symbolic
              polynomial in VX.  Zero-multiplicity pairs are silently
              skipped (matches HP50).  Negative multiplicity throws
              Bad argument value.  Numeric roots become AstNum; Symbolic
              roots lift directly.  Output is always Symbolic.
   ----------------------------------------------------------------- */

register('PCOEF', (s) => {
  const [rootsList] = s.popN(1);
  if (!isList(rootsList)) throw new RPLError('Bad argument type');
  const roots = rootsList.items;
  // Accept Real / Integer / Complex roots.  Symbolic rejected — the
  // symbolic form needs the full CAS polynomial expander.
  for (const r of roots) {
    if (!isReal(r) && !isInteger(r) && !isComplex(r)) {
      throw new RPLError('Bad argument type');
    }
  }
  // Start with polynomial [1].  For each root r, multiply by (x − r):
  // new[0..n] = old[0..n-1] shifted up  −  r * old[0..n-1]
  let coefs = [Integer(_ONE)];
  for (const r of roots) {
    const m = coefs.length;
    const next = new Array(m + 1);
    next[0] = coefs[0];                             // shifted-up leading
    for (let i = 1; i < m; i++) {
      next[i] = _scalarBinary('-', coefs[i],
        _scalarBinary('*', r, coefs[i - 1]));
    }
    next[m] = _scalarBinary('-', Integer(_ZERO),
      _scalarBinary('*', r, coefs[m - 1]));
    coefs = next;
  }
  s.push(RList(coefs));
}, { category: 'Polynomials', categoryOrder: 1, label: "PCOEF" });


/** Build `(VX - root)` as an AST. */
function _vxMinusRoot(root) {
  const vx = AstVar('X');
  const ast = _toAst(root);
  if (!ast) throw new RPLError('Bad argument type');
  return AstBin('-', vx, ast);
}


register('FCOEF', (s) => {
  const [pairList] = s.popN(1);
  if (!isList(pairList)) throw new RPLError('Bad argument type');
  if (pairList.items.length % 2 !== 0) {
    throw new RPLError('Bad argument value');
  }
  let acc = null;      // null = polynomial "1"
  for (let i = 0; i < pairList.items.length; i += 2) {
    const root = pairList.items[i];
    const multV = pairList.items[i + 1];
    if (!isInteger(multV) &&
        !(isReal(multV) && multV.value.isInteger())) {
      throw new RPLError('Bad argument type');
    }
    const m = isInteger(multV) ? Number(multV.value) : multV.value.toNumber();
    if (m < 0) throw new RPLError('Bad argument value');
    for (let k = 0; k < m; k++) {
      const fac = _vxMinusRoot(root);
      acc = acc === null ? fac : AstBin('*', acc, fac);
    }
  }
  if (acc === null) acc = AstNum(1);       // empty product = 1
  s.push(Symbolic(acc));
}, { category: 'Polynomials', categoryOrder: 0, label: "FCOEF" });


/* ==================================================================
   Polynomial roots + division, LU, stats aggregates, regression
   family, CMPLX mode, MERGE directory op.

   HP50 AUR: §12.6 (PROOT), §12.5 (QUOT/REMAINDER), §15.3 (LU),
   §18.1 (stats aggregates, ΣX/ΣY/…), §18.1 (LINFIT/LOGFIT/EXPFIT/
   PWRFIT, BESTFIT), §4.2.4 (CMPLX system flag -103), §3.2 (MERGE).

   All ops below are user-reachable via the typed catalog today.  No
   UI touches.  PROOT rejects Symbolic coefficients (deferred until
   CAS polynomial-normalize lands).  Stats-aggregate family (NΣ, ΣX,
   ΣY, ΣXY, ΣX², ΣY², MAXΣ, MINΣ) takes a Matrix argument directly —
   matches the HP50 ΣDAT-bypass convention.  The regression family
   (LINFIT / LOGFIT / EXPFIT / PWRFIT / BESTFIT) follows the same
   convention: takes a 2-column Matrix, returns the fitted-model
   Symbolic (or the best-fit family label for BESTFIT).
   ================================================================= */

/* --------------- PROOT — polynomial root-finder ----------------------
   HP50 AUR §12.6.

     PROOT  ( {c_n … c_1 c_0} → [ z_1 … z_n ] )

   Returns a Vector of the n roots of the polynomial, in whatever
   order Durand-Kerner converges to.  Real / Integer / Complex
   coefficients accepted; Symbolic rejected (deferred until the CAS
   polynomial-normalize pass lands).  Empty list → Bad argument value.
   Leading-zero coefficients are trimmed before iteration (so
   { 0 1 -3 2 } PROOT works).  Zero polynomial throws Bad argument
   value.  Linear polynomial short-circuits to the closed form.

   Algorithm: Durand-Kerner / Weierstrass.  Start roots at evenly
   spaced points on a circle of radius 1 + max|c_i/c_n| (Cauchy's
   bound + 1 — places the initial approximants outside the disk that
   contains all roots), rotated off the real axis so no two initial
   points land on each other.  Iterate
        z_i  ←  z_i - p(z_i) / ∏_{j≠i} (z_i - z_j)
   to a max of 200 sweeps or until all deltas drop below 1e-12 · |z_i|
   (plus a floor of 1e-14 for roots near zero).
   ----------------------------------------------------------------- */

function _coefToCx(c) {
  if (isInteger(c)) return _cx(Number(c.value), 0);
  if (isReal(c))    return _cx(c.value.toNumber(), 0);
  if (isComplex(c)) return _cx(c.re, c.im);
  throw new RPLError('Bad argument type');
}


function _cxAbs(z) { return Math.hypot(z.re, z.im); }


function _polyEvalCx(coefs, z) {
  // coefs in descending degree order, already _cx.
  let r = coefs[0];
  for (let i = 1; i < coefs.length; i++) {
    r = _cxAdd(_cxMul(r, z), coefs[i]);
  }
  return r;
}


register('PROOT', (s) => {
  const [poly] = s.popN(1);
  if (!isList(poly)) throw new RPLError('Bad argument type');
  if (poly.items.length === 0) throw new RPLError('Bad argument value');
  // Convert coefficients and validate.
  const cxRaw = poly.items.map(_coefToCx);
  // Trim leading zeros — degenerate polynomial leading with 0 is
  // semantically lower-degree.  Zero polynomial → Bad argument value.
  let start = 0;
  while (start < cxRaw.length - 1
         && cxRaw[start].re === 0 && cxRaw[start].im === 0) {
    start++;
  }
  const cx = cxRaw.slice(start);
  if (cx.length === 1) {
    // Pure constant (post-trim): no roots.  HP50 returns a 0-length
    // result — but Vector with 0 entries is illegal.  Honour HP50:
    // zero constant → Bad argument value; non-zero constant → still
    // no roots, so return an empty List (HP50 actually produces
    // `[ ]`, which our Vector rejects — list is the safe compromise).
    if (cx[0].re === 0 && cx[0].im === 0) {
      throw new RPLError('Bad argument value');
    }
    s.push(RList([]));
    return;
  }
  const n = cx.length - 1;           // polynomial degree
  const a = cx[0];                    // leading coef
  // Normalize to monic (safer for the ∏ denominator); store monic in `p`.
  const p = cx.map((c) => _cxDiv(c, a));
  // Linear shortcut: x + p[1] = 0 → z = -p[1].
  if (n === 1) {
    const z0 = { re: -p[1].re, im: -p[1].im };
    // Real-coef polynomial with real root → return Real, else Complex
    // (mirrors the general-path polish at the bottom of this op).
    const polyIsReal1 = poly.items.every(
      (c) => isInteger(c) || isReal(c) || (isComplex(c) && c.im === 0));
    if (polyIsReal1 && Math.abs(z0.im) < 1e-12) {
      s.push(Vector([ Real(z0.re) ]));
    } else {
      s.push(Vector([ Complex(z0.re, z0.im) ]));
    }
    return;
  }
  // Cauchy bound: R = 1 + max |p[i]| for i = 1..n.
  let R = 0;
  for (let i = 1; i <= n; i++) {
    const m = _cxAbs(p[i]);
    if (m > R) R = m;
  }
  R = 1 + R;
  // Initial estimates on a circle of radius R, phase 2π(k + 0.25)/n.
  const roots = new Array(n);
  for (let k = 0; k < n; k++) {
    const ang = 2 * Math.PI * (k + 0.25) / n;
    roots[k] = { re: R * Math.cos(ang), im: R * Math.sin(ang) };
  }
  // Durand-Kerner iteration.
  const MAX_ITER = 400;
  const TOL = 1e-12;
  for (let iter = 0; iter < MAX_ITER; iter++) {
    let maxDelta = 0;
    const next = new Array(n);
    for (let i = 0; i < n; i++) {
      const zi = roots[i];
      // numerator: p(zi)
      const num = _polyEvalCx(p, zi);
      // denominator: ∏_{j≠i} (zi - roots[j])
      let den = _cx(1, 0);
      for (let j = 0; j < n; j++) {
        if (j === i) continue;
        den = _cxMul(den, _cxSub(zi, roots[j]));
      }
      // Guard against a coincident initial point (den == 0) — nudge.
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
  // Clean up near-zero imaginary parts (so real roots surface as Real).
  // HP50 actually always returns Complex for PROOT; we match that — but
  // if the polynomial is real and the root's |im| is tiny relative to
  // |re|, collapse to a clean real.
  const polyIsReal = poly.items.every(
    (c) => isInteger(c) || (isReal(c)) || (isComplex(c) && c.im === 0));
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    const z = roots[i];
    if (polyIsReal && Math.abs(z.im) < 1e-9 * Math.max(Math.abs(z.re), 1)) {
      out[i] = Real(z.re);
    } else {
      out[i] = Complex(z.re, z.im);
    }
  }
  s.push(Vector(out));
}, { category: 'Polynomials', categoryOrder: 5, label: "PROOT" });


/* --------------- QUOT / REMAINDER — polynomial division --------------
   HP50 AUR §12.5.

     QUOT       ( {a_n … a_0} {b_m … b_0} → {q_{n-m} … q_0} )
     REMAINDER  ( {a_n … a_0} {b_m … b_0} → {r_{m-1} … r_0} )

   Long division of coefficient lists in descending-degree order
   (matching HORNER / PCOEF convention).  Dividend-degree < divisor-
   degree → quotient {0}, remainder = dividend.  Divisor = {0}-only
   (or empty) → Infinite result.  Real / Integer / Complex entries
   accepted on both sides via `_scalarBinary`; Symbolic rejected
   (same deferral as HORNER / PCOEF).

   Leading zeros are trimmed from both inputs before dividing.  The
   remainder list is truncated to length (divisor-degree), padded with
   a leading zero if the cancellation drops the degree further; if
   the remainder is the zero polynomial, we return a one-element
   `{ 0 }` list so callers never see an empty list.
   ----------------------------------------------------------------- */

function _polyValidateList(items) {
  for (const c of items) {
    if (!isReal(c) && !isInteger(c) && !isComplex(c)) {
      throw new RPLError('Bad argument type');
    }
  }
}


function _polyTrimLeading(items) {
  let i = 0;
  while (i < items.length - 1 && _isNumericZero(items[i])) i++;
  return items.slice(i);
}


function _isNumericZero(x) {
  if (isInteger(x)) return x.value === 0n;
  if (isReal(x))    return x.value.isZero();
  if (isComplex(x)) return x.re === 0 && x.im === 0;
  return false;
}


function _polyDivide(A, B) {
  // A, B are arrays of RPL numerics in descending order (after trim).
  if (B.length === 0 || (B.length === 1 && _isNumericZero(B[0]))) {
    throw new RPLError('Infinite result');
  }
  const n = A.length - 1, m = B.length - 1;
  if (n < m) {
    return { q: [Integer(_ZERO)], r: A.slice() };
  }
  // Work on mutable arrays for the in-place subtract.
  const rem = A.slice();
  const q = new Array(n - m + 1);
  const leadB = B[0];
  for (let i = 0; i <= n - m; i++) {
    // Highest remaining term: rem[i] / leadB.
    const qi = _scalarBinary('/', rem[i], leadB);
    q[i] = qi;
    // rem[i+k] -= qi * B[k]  for k = 0..m.
    for (let k = 0; k <= m; k++) {
      rem[i + k] = _scalarBinary('-', rem[i + k],
        _scalarBinary('*', qi, B[k]));
    }
  }
  // Remainder occupies the last m entries of rem (one degree less than B).
  let r = rem.slice(n - m + 1);
  // Strip leading zeros; empty → {0}.
  r = _polyTrimLeading(r);
  if (r.length === 0) r = [Integer(_ZERO)];
  return { q, r };
}


register('QUOT', (s) => {
  const [A, B] = s.popN(2);
  if (!isList(A) || !isList(B)) throw new RPLError('Bad argument type');
  if (A.items.length === 0 || B.items.length === 0) {
    throw new RPLError('Bad argument value');
  }
  _polyValidateList(A.items);
  _polyValidateList(B.items);
  const At = _polyTrimLeading(A.items);
  const Bt = _polyTrimLeading(B.items);
  const { q } = _polyDivide(At, Bt);
  s.push(RList(q));
}, { category: 'Polynomials', categoryOrder: 7, label: "QUOT" });


register('REMAINDER', (s) => {
  const [A, B] = s.popN(2);
  if (!isList(A) || !isList(B)) throw new RPLError('Bad argument type');
  if (A.items.length === 0 || B.items.length === 0) {
    throw new RPLError('Bad argument value');
  }
  _polyValidateList(A.items);
  _polyValidateList(B.items);
  const At = _polyTrimLeading(A.items);
  const Bt = _polyTrimLeading(B.items);
  const { r } = _polyDivide(At, Bt);
  s.push(RList(r));
}, { category: 'Polynomials', categoryOrder: 8, label: "REMAINDER" });


/* ==================================================================
   PEVAL / PTAYL / GRAMSCHMIDT / QR / CHOLESKY /
   C→P / P→C / EPSX0 / DISTRIB / RDM.

   HP50 AUR: §12.6 (PEVAL / PTAYL), §15.3 (GRAMSCHMIDT / QR /
   CHOLESKY), §4.4 (C→P / P→C), §11.6 (EPSX0), §11.3 (DISTRIB),
   §15.2 (RDM).

   All ops below are user-reachable via the typed catalog today.  No
   UI work.  GRAMSCHMIDT / QR / CHOLESKY / RDM operate on numeric
   Real/Integer entries (matching the `_invMatrixNumeric` /
   LSQ/LU rejection policy); PEVAL / PTAYL take coefficient lists in
   descending-degree order (same convention as HORNER / PCOEF /
   PROOT / QUOT / REMAINDER).  C→P / P→C are angle-mode aware so a
   user can flip DEG/RAD and see the ARG coordinate change.  EPSX0
   walks a Symbolic AST zeroing |num| below a fixed 1e-10 threshold;
   DISTRIB performs a single-pass distributive-law rewrite
   (a*(b+c) → a*b+a*c).
   ================================================================= */

/* --------------- PEVAL — evaluate polynomial at a point ---------------
   HP50 AUR §12.6.

     PEVAL  ( {c_n … c_0} x → p(x) )

   Evaluates a polynomial whose coefficients are in the list (descending
   order, same convention as HORNER / PCOEF / PROOT) at the scalar `x`
   via Horner's scheme.  Real / Integer / Complex coefficients and `x`
   accepted; Symbolic deferred with the polynomial-normalize pass.
   Empty list throws Bad argument value.  Single-element (constant
   polynomial) returns that constant regardless of `x`.
   ----------------------------------------------------------------- */

register('PEVAL', (s) => {
  const [poly, x] = s.popN(2);
  if (!isList(poly)) throw new RPLError('Bad argument type');
  if (poly.items.length === 0) throw new RPLError('Bad argument value');
  for (const c of poly.items) {
    if (!isReal(c) && !isInteger(c) && !isComplex(c)) {
      throw new RPLError('Bad argument type');
    }
  }
  if (!isReal(x) && !isInteger(x) && !isComplex(x)) {
    throw new RPLError('Bad argument type');
  }
  let r = poly.items[0];
  for (let i = 1; i < poly.items.length; i++) {
    r = _scalarBinary('+', _scalarBinary('*', r, x), poly.items[i]);
  }
  s.push(r);
}, { category: 'Polynomials', categoryOrder: 2, label: "PEVAL" });


/* --------------- PTAYL — polynomial Taylor basis change ---------------
   HP50 AUR §12.6.

     PTAYL  ( {c_n … c_0} a → {b_n … b_0} )

   Given a polynomial `p(x) = c_n x^n + … + c_0` as a coefficient list
   in descending degree, returns the coefficient list (also descending)
   of the same polynomial expressed in the shifted basis (x − a):
       p(x) = b_n (x − a)^n + b_{n−1} (x − a)^{n−1} + … + b_0.

   Equivalently, `b_k = p^{(k)}(a) / k!`, but we compute via iterated
   synthetic division at `a` (Horner-scheme); that also sidesteps any
   factorial precision concerns for large n.  The algorithm is:

     remainders = []
     while poly.length > 1:
       (poly, r) = syntheticDivide(poly, a)
       remainders.push(r)
     remainders.push(poly[0])
     return remainders.reverse()  // descending order

   Real / Integer / Complex coefficients and `a` accepted; Symbolic
   deferred.  Empty list throws Bad argument value.
   ----------------------------------------------------------------- */

register('PTAYL', (s) => {
  const [poly, a] = s.popN(2);
  if (!isList(poly)) throw new RPLError('Bad argument type');
  if (poly.items.length === 0) throw new RPLError('Bad argument value');
  for (const c of poly.items) {
    if (!isReal(c) && !isInteger(c) && !isComplex(c)) {
      throw new RPLError('Bad argument type');
    }
  }
  if (!isReal(a) && !isInteger(a) && !isComplex(a)) {
    throw new RPLError('Bad argument type');
  }
  // Repeated synthetic-division by (x − a).  After each sweep, the
  // quotient is one degree lower and the remainder is one shifted
  // coefficient.  Collect them low-order first, then reverse.
  let coefs = poly.items.slice();
  const shifted = [];                     // low-order first (b_0, b_1, …)
  while (coefs.length > 1) {
    // One Horner sweep: b[0]=c[0]; b[i] = b[i-1]·a + c[i].  Last b is
    // the remainder (= p_current(a)); the rest are the new quotient.
    const next = new Array(coefs.length - 1);
    let r = coefs[0];
    for (let i = 1; i < coefs.length; i++) {
      next[i - 1] = r;
      r = _scalarBinary('+', _scalarBinary('*', r, a), coefs[i]);
    }
    shifted.push(r);                      // b_k for current pass
    coefs = next;
  }
  shifted.push(coefs[0]);                 // the final leading b_n
  // Reverse to descending order (b_n … b_0).
  shifted.reverse();
  s.push(RList(shifted));
}, { category: 'Polynomials', categoryOrder: 4, label: "PTAYL" });


/* --------------- CYCLOTOMIC — nth cyclotomic polynomial --------------
   HP50 AUR §12.6.  CYCLOTOMIC(n) returns Φ_n(X) as a Symbolic in X —
   the monic polynomial in Z[X] whose roots are exactly the primitive
   n-th roots of unity.  Degree is Euler's totient φ(n).

     CYCLOTOMIC  ( n → Sy )

   Computed recursively via the identity
       X^n − 1 = ∏_{d | n} Φ_d(X)
   rearranged to
       Φ_n(X) = (X^n − 1) / ∏_{d | n, d < n} Φ_d(X)
   Walking d = 1 upward and caching every Φ_d produces Φ_n in n exact
   polynomial divisions over Z[X].  BigInt coefficients internally
   because cyclotomic coefficients can explode in magnitude for
   composite n (Φ_105 has a −2, Φ_385 has a −22, and the family grows
   unboundedly).  Output rides through `_coefArrToSymbolicX` after
   converting BigInt→Number with a MAX_SAFE_INTEGER guard; n > 200
   rejects with `Bad argument value` because that's the practical
   boundary where coefficient magnitude can exceed 2^53 in rare cases
   and the in-tree Symbolic AST uses plain-Number literals.

   Rejections:
     n ≤ 0                 → Bad argument value
     non-integer Real      → Bad argument value (via _nFromIntegerArg)
     non-numeric           → Bad argument type (via _nFromIntegerArg)
     n > 200               → Bad argument value (precision cap).
*/

function _polyDivBig(p, q) {
  // p / q, both descending-degree BigInt arrays; assumes q divides p
  // exactly over Z[X] (cyclotomic invariant).  Returns the quotient.
  const pa = p.slice();
  const ql = q.length;
  const qLead = q[0];
  const quotLen = pa.length - ql + 1;
  const out = new Array(quotLen);
  for (let i = 0; i < quotLen; i++) {
    const factor = pa[i] / qLead;
    out[i] = factor;
    for (let j = 0; j < ql; j++) {
      pa[i + j] -= factor * q[j];
    }
  }
  return out;
}


function _cyclotomicCoefsBig(n) {
  // n ≥ 1.  Φ_n as a descending-degree BigInt coefficient array.
  if (n === 1) return [1n, -1n];
  const phi = new Map();
  phi.set(1, [1n, -1n]);
  for (let k = 2; k <= n; k++) {
    // Numerator X^k − 1  →  [1, 0, …, 0, −1]  (length k+1)
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
  // Convert BigInt descending-degree coef array to Symbolic(X), via
  // the same helper the Hermite/Legendre/Tcheb families use.  Throws
  // `Bad argument value` if any coefficient exceeds MAX_SAFE_INTEGER
  // (i.e. BigInt→Number loses precision).
  const asNums = coefs.map(c => {
    const asNum = Number(c);
    if (!Number.isFinite(asNum) || BigInt(asNum) !== c) {
      throw new RPLError('Bad argument value');
    }
    return asNum;
  });
  return _coefArrToSymbolicX(asNums);
}


register('CYCLOTOMIC', (s) => {
  const [v] = s.popN(1);
  const n = _nFromIntegerArg(v);
  if (n < 1) throw new RPLError('Bad argument value');
  if (n > 200) throw new RPLError('Bad argument value');
  s.push(_coefBigArrToSymbolicX(_cyclotomicCoefsBig(n)));
}, { category: 'Polynomials', categoryOrder: 9, label: "CYCLOTOMIC" });


/* ---- FROOTS — polynomial factoring (Symbolic direction) --------------
   HP50 AUR §12.5.  Takes a Symbolic polynomial in a single variable
   (main variable inferred via the algebra-module `freeVars` walk;
   we default to `X` when the expression is a constant in no variable
   — consistent with HERMITE / LEGENDRE / TCHEBYCHEFF).

     FROOTS  ( Sy → L )   L = { r1 m1 r2 m2 … }
                          alternating root / multiplicity pairs.  The
                          HP50 emits Real multiplicities; we emit
                          Integer to keep the cluster count exact.
                          Zero polynomial → Bad argument value.
                          Non-polynomial shape (non-integer exponent,
                          denominator containing the variable, etc.)
                          → Bad argument value.

   Implementation piggy-backs on the `PROOT` Durand-Kerner core:
   we expand the Symbolic with `algebraExpand`, walk the sum-of-
   monomials to build a descending-degree numeric coefficient array,
   wrap that array in an `RList`, push it onto a scratch stack, and
   invoke `PROOT` directly.  That returns a Vector of roots which we
   then cluster by proximity (tolerance `1e-6 · max(|r|, 1)`) to
   collapse repeated roots into `{root, multiplicity}` entries.

   Non-goals (deferred with the full `_polyNormalize` CAS work):
     - Rational / fractional inputs.  HP50's FROOTS also emits poles
       with negative multiplicities when given a Symbolic rational
       `p(X)/q(X)`; we reject those here.
     - Multi-variable polynomials.  A term like `A·X² + B` with more
       than one free variable is rejected.
     - Symbolic coefficients (e.g. `A·X² + 1` with `A` a free variable).
       A future CAS slice can substitute numeric values into the
       coefficient AST; for now they're rejected.
   --------------------------------------------------------------------- */

/* Extract a descending-degree numeric coefficient array from a
   polynomial AST in `varName`.  Returns `{ coefs, polyIsReal }` —
   `polyIsReal` is `true` iff every coefficient folded cleanly to a
   plain JS Real number (no Complex).  Throws `Bad argument value`
   on anything that isn't a polynomial with numeric coefficients. */
/* Distribute `*` over `+` / `-` / unary-Neg chains so FROOTS' walker
   sees a flat sum-of-monomials.  Does NOT combine like terms — the
   walker itself accumulates `coef · X^power` terms into a coefficient
   array, so `X·X·X` (three factors contributing 1 to the power) is
   fine without a `X^3` fold. */
function _frootsAdditiveTerms(ast) {
  const out = [];
  (function walk(n, sign) {
    if (!n) return;
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
  const aTerms = _frootsAdditiveTerms(a);
  const bTerms = _frootsAdditiveTerms(b);
  const parts = [];
  for (const ta of aTerms) {
    for (const tb of bTerms) {
      parts.push({ sign: ta.sign * tb.sign, term: AstBin('*', ta.term, tb.term) });
    }
  }
  return _frootsRebuildSum(parts);
}

function _frootsExpand(ast) {
  if (!ast) return ast;
  if (ast.kind === 'num' || ast.kind === 'var') return ast;
  if (ast.kind === 'neg') return AstNeg(_frootsExpand(ast.arg));
  if (ast.kind === 'fn') return AstFn(ast.name, ast.args.map(_frootsExpand));
  if (ast.kind === 'bin') {
    const l = _frootsExpand(ast.l);
    const r = _frootsExpand(ast.r);
    if (ast.op === '*') return _frootsExpandProduct(l, r);
    if (ast.op === '^' && r.kind === 'num' && Number.isInteger(r.value)
        && r.value >= 0 && r.value <= 16) {
      const n = r.value;
      if (n === 0) return AstNum(1);
      if (n === 1) return l;
      let acc = l;
      for (let i = 2; i <= n; i++) acc = _frootsExpandProduct(acc, l);
      return acc;
    }
    return AstBin(ast.op, l, r);
  }
  return ast;
}


function _symbolicPolyToNumCoefs(ast, varName) {
  const expanded = _frootsExpand(ast);
  // Walk the top-level +/- structure, emit terms with a ± sign.
  const terms = [];
  (function walk(node, sign) {
    if (!node) return;
    if (astIsNum(node)) { terms.push({ node, sign }); return; }
    if (node.kind === 'neg') { walk(node.arg, -sign); return; }
    if (node.kind === 'bin') {
      if (node.op === '+') { walk(node.l, sign); walk(node.r, sign); return; }
      if (node.op === '-') { walk(node.l, sign); walk(node.r, -sign); return; }
    }
    terms.push({ node, sign });
  })(expanded, 1);
  // For each term, collect the numeric coefficient and power of varName.
  // Real-only first-pass: Complex coefficients would need `_cx` threading
  // through both arms below.  The FROOTS op doesn't support Complex
  // coefficients today (see the op-level comment).
  const coefByPow = new Map();   // power → running Real
  for (const { node, sign } of terms) {
    let coef = sign;
    let power = 0;
    let failed = false;
    (function walk(n, mult) {
      if (failed) return;
      if (astIsNum(n)) { coef *= Math.pow(n.value, mult); return; }
      if (n.kind === 'neg') { coef *= -1; walk(n.arg, mult); return; }
      if (n.kind === 'bin' && n.op === '*') {
        walk(n.l, mult); walk(n.r, mult); return;
      }
      if (n.kind === 'bin' && n.op === '/') {
        // Only accept `A / num` — division by the variable (or any
        // sub-tree containing the variable) makes this a rational.
        walk(n.l, mult);
        if (astIsNum(n.r)) coef *= Math.pow(n.r.value, -mult);
        else failed = true;
        return;
      }
      if (n.kind === 'var' && n.name === varName) {
        power += mult;
        return;
      }
      if (n.kind === 'bin' && n.op === '^'
          && n.l.kind === 'var' && n.l.name === varName
          && astIsNum(n.r) && Number.isInteger(n.r.value) && n.r.value >= 0) {
        power += mult * n.r.value;
        return;
      }
      // Anything else is a non-numeric / non-polynomial shape.
      failed = true;
    })(node, 1);
    if (failed) throw new RPLError('Bad argument value');
    if (power < 0 || !Number.isInteger(power)) {
      throw new RPLError('Bad argument value');
    }
    coefByPow.set(power, (coefByPow.get(power) || 0) + coef);
  }
  const maxPow = [...coefByPow.keys()].reduce((a, b) => Math.max(a, b), 0);
  const out = new Array(maxPow + 1).fill(0);
  for (const [p, c] of coefByPow) out[maxPow - p] = c;
  // Zero polynomial after simplification ⇒ Bad argument value.
  if (out.every(c => c === 0)) throw new RPLError('Bad argument value');
  return { coefs: out, polyIsReal: true };
}


/* Cluster approximate roots by proximity, return { root, mult } pairs.
   Each entry stores the averaged representative plus a count.  Stable
   by first-seen order.

   Durand-Kerner (the PROOT inner loop) converges slowly near repeated
   roots — a degree-3 polynomial with a triple root typically lands
   with the three iterates spread across a disc of radius ~1e-5 around
   the true root, well above the default 1e-9 Real-vs-Complex
   collapse threshold used inside PROOT.  So we cluster with a
   tolerance of `max(1e-4 · scale, 1e-7)`, which is tight enough to
   keep distinct real roots separate (typical separation is ≥ 1) and
   loose enough to merge near-repeated ones.

   After clustering we collapse clusters with an imaginary part below
   the same tolerance back to a plain Real. */
function _clusterRoots(roots) {
  const out = [];
  const compOf = (r) => isReal(r)
    ? { re: r.value, im: 0 }
    : { re: r.re, im: r.im };
  for (const r of roots) {
    const { re, im } = compOf(r);
    let matched = false;
    for (const g of out) {
      const scale = Math.max(Math.abs(g.reSum / g.mult),
                             Math.abs(g.imSum / g.mult),
                             Math.abs(re), Math.abs(im), 1);
      const tol = Math.max(1e-4 * scale, 1e-7);
      if (Math.abs(re - g.reSum / g.mult) < tol &&
          Math.abs(im - g.imSum / g.mult) < tol) {
        g.reSum += re;
        g.imSum += im;
        g.mult += 1;
        matched = true;
        break;
      }
    }
    if (!matched) out.push({ reSum: re, imSum: im, mult: 1 });
  }
  return out.map(g => {
    const re = g.reSum / g.mult;
    const im = g.imSum / g.mult;
    const imTol = Math.max(1e-4 * Math.max(Math.abs(re), 1), 1e-7);
    const isRealClust = Math.abs(im) < imTol;
    return {
      root: isRealClust
        ? (Number.isInteger(re) ? Integer(BigInt(re)) : Real(re))
        : Complex(re, im),
      mult: g.mult,
    };
  });
}


/* ---- FROOTS rational-root pre-scan helper ----------------------------
   Before running Durand-Kerner, enumerate candidate rational roots
   `p / q` where `p | c_0` and `q | c_n` (Rational-Root Theorem).
   Test each candidate via Horner; when it evaluates exactly to zero,
   synthetically divide it out and recurse on the reduced polynomial
   until no more rational roots are found.  Returns
   `{ roots, residualCoefs }` — an array of rational roots (each with
   their multiplicity counted) and the coefficient array of the
   polynomial that remains after dividing them out.  The residual
   polynomial is then fed to PROOT to pick up any irrational /
   complex roots.

   Coefficients must be integers (or integer-valued Reals) for this
   path to apply; the caller falls through to plain Durand-Kerner
   otherwise.  The guard keeps `X^2 − 5X + 6` in Integer form but
   leaves `X^2 − 0.5X + 0.1` on the numeric path where it belongs. */

function _allIntegerCoefs(coefs) {
  for (const c of coefs) {
    if (!Number.isFinite(c)) return false;
    if (!Number.isInteger(c)) return false;
  }
  return true;
}


/** Positive integer divisors of |n| (n an integer).  For rational-root
 *  enumeration.  Returns [1] for n=0 (by convention — we only call
 *  this for non-zero coefficients). */
function _posDivisors(n) {
  const N = Math.abs(Math.trunc(n));
  if (N === 0) return [1];
  const out = [];
  for (let d = 1; d * d <= N; d++) {
    if (N % d === 0) {
      out.push(d);
      if (d * d !== N) out.push(N / d);
    }
  }
  out.sort((a, b) => a - b);
  return out;
}


/** Integer GCD of two non-negative integers. */
function _igcd(a, b) {
  a = Math.abs(Math.trunc(a));
  b = Math.abs(Math.trunc(b));
  while (b !== 0) { const t = a % b; a = b; b = t; }
  return a;
}


/** Evaluate `p(x)` at the rational `num/den` using Horner on
 *  homogenized coordinates — equivalent to `Σ coefs[i] · num^(n-i) · den^i`
 *  then dividing by den^n.  Returns 0 exactly when `num/den` is a
 *  root; non-zero otherwise.  All arithmetic in Number; fine for the
 *  bounded-denominator candidate list since |num| ≤ |c_0| and
 *  |den| ≤ |c_n| are small. */
function _evalRational(coefs, num, den) {
  // p(num/den) · den^n  =  Σ_{i=0..n} coefs[i] · num^(n-i) · den^i
  const n = coefs.length - 1;
  let sum = 0;
  for (let i = 0; i <= n; i++) {
    sum += coefs[i] * Math.pow(num, n - i) * Math.pow(den, i);
  }
  return sum;
}


/** Synthetic divide `coefs` (descending-degree) by `(x − num/den)`,
 *  returning a new descending-degree coefficient array of degree n-1
 *  with Number entries.  Does NOT assume coefs are integers — works
 *  on any Real coefficient array (so chained division by rational
 *  roots after the first pass still works; later quotients can pick
 *  up rational entries). */
function _syntheticDivRational(coefs, num, den) {
  const out = new Array(coefs.length - 1).fill(0);
  // Re-parameterize: p(x) = den·q(x)·(x − num/den) where q is what we
  // want.  Standard synthetic division at r = num/den: q[0] = c[0],
  // q[k] = c[k] + r · q[k-1].
  const r = num / den;
  out[0] = coefs[0];
  for (let k = 1; k < coefs.length - 1; k++) {
    out[k] = coefs[k] + r * out[k - 1];
  }
  // Remainder is coefs[n] + r · q[n-1]; should be ~0 for a true root.
  return out;
}


/** Peel off all rational roots of an integer-coefficient polynomial.
 *  Returns `{ rationalRoots, residualCoefs }`.  `rationalRoots` is an
 *  array of `{ num, den, mult }` in de-duplicated form (duplicates
 *  peeled again and their count accumulated).  The residual polynomial
 *  is Number-valued (may carry floating drift).  Leading coefficient
 *  of the residual equals `coefs[0]` (we do NOT renormalize). */
function _peelRationalRoots(coefs) {
  let current = coefs.slice();
  const out = [];
  // Root x = 0 is the easy case: c_n = 0 ⇒ x divides p ⇒ deflate.
  while (current.length > 1 && current[current.length - 1] === 0) {
    current = current.slice(0, -1);
    const hit = out.find(r => r.num === 0 && r.den === 1);
    if (hit) hit.mult += 1;
    else out.push({ num: 0, den: 1, mult: 1 });
  }
  // Outer loop: try all p/q candidates against the current polynomial.
  // Each successful hit deflates once; repeat until no candidate works.
  let progress = true;
  while (progress && current.length > 1) {
    progress = false;
    const leadInt = Math.round(current[0]);
    const tailInt = Math.round(current[current.length - 1]);
    // If either rounded to 0 or we've drifted off integer coefs (e.g.
    // after a previous rational-root deflate), stop the rational-root
    // search.  The caller will run Durand-Kerner on whatever remains.
    if (!_allIntegerCoefs(current)) break;
    if (tailInt === 0 || leadInt === 0) break;
    const pDivs = _posDivisors(tailInt);
    const qDivs = _posDivisors(leadInt);
    // Iterate smallest candidates first so repeated roots (p=q=±1 or
    // small integers) deflate before we dig into larger candidates.
    outer: for (const q of qDivs) {
      for (const p of pDivs) {
        if (_igcd(p, q) !== 1) continue;  // skip unreduced p/q
        for (const sign of [1, -1]) {
          const num = sign * p;
          const den = q;
          const val = _evalRational(current, num, den);
          if (val === 0) {
            current = _syntheticDivRational(current, num, den);
            const hit = out.find(r => r.num === num && r.den === den);
            if (hit) hit.mult += 1;
            else out.push({ num, den, mult: 1 });
            progress = true;
            break outer;
          }
        }
      }
    }
  }
  return { rationalRoots: out, residualCoefs: current };
}


/** Decompose `|n|` as `k² · m` with `m` squarefree, returning `{k, m}`.
 *  Building block for FROOTS' exact-irrational quadratic-residual
 *  pass: the radical `√|n|` simplifies to `k · √m`.  Uses trial
 *  division up to `√|n|` — fine for the discriminants encountered
 *  (bounded by the user-typed polynomial's coefficients). */
function _squareFactorDecompose(n) {
  n = Math.abs(Math.round(n));
  if (n === 0) return { k: 0, m: 0 };
  let k = 1;
  let m = n;
  for (let p = 2; p * p <= m; p++) {
    while (m % (p * p) === 0) {
      k *= p;
      m = m / (p * p);
    }
  }
  return { k, m };
}


/** Try to factor a degree-2 integer-coefficient residual into two exact
 *  symbolic roots via the quadratic formula.  Returns an array of
 *  `{ast, mult}` pairs or `null` when the case doesn't apply.  The
 *  null cases are:
 *    - D < 0  (complex conjugate roots — fall through to Durand-Kerner
 *              so the existing Complex path handles them)
 *    - D = 0  (double rational root — would've been peeled already)
 *    - `√D` exact integer (rational roots — would've been peeled)
 *  A non-null return always produces two entries with multiplicity 1
 *  (the roots are distinct under this branch). */
function _quadraticExactResidualRoots(coefs) {
  if (coefs.length !== 3) return null;
  if (!_allIntegerCoefs(coefs)) return null;
  const a = Math.round(coefs[0]);
  const b = Math.round(coefs[1]);
  const c = Math.round(coefs[2]);
  if (a === 0) return null;
  const D = b * b - 4 * a * c;
  if (D < 0) return null;             // complex path defers to Durand-Kerner
  if (D === 0) return null;           // double rational root
  const sqrtD = Math.sqrt(D);
  if (Number.isInteger(sqrtD)) return null;   // rational roots — peeled
  const { k, m } = _squareFactorDecompose(D);
  if (m === 1) return null;           // redundant (caught by isInteger test)
  // Reduce `-b ± k·√m` / `2a` by gcd(|b|, k, |2a|).
  const twoA = 2 * a;
  const g = _igcd(_igcd(Math.abs(b), k), Math.abs(twoA));
  const nb = -b / g;
  const nk = k / g;
  const nd = twoA / g;
  // Flip so denominator is positive.
  const signFlip = nd < 0 ? -1 : 1;
  const RB = nb * signFlip;    // real part numerator
  const K  = nk * signFlip;    // coefficient on √m for the '+' root
  const DEN = Math.abs(nd);
  const sqrtAst = AstFn('SQRT', [AstNum(m)]);
  function _build(sign) {
    const kSigned = sign * K;
    let numAst;
    if (RB === 0) {
      // numerator = kSigned · √m (no real part)
      if (kSigned === 1) numAst = sqrtAst;
      else if (kSigned === -1) numAst = AstNeg(sqrtAst);
      else if (kSigned > 0) numAst = AstBin('*', AstNum(kSigned), sqrtAst);
      else numAst = AstNeg(AstBin('*', AstNum(-kSigned), sqrtAst));
    } else if (kSigned > 0) {
      const kMag = kSigned === 1 ? sqrtAst : AstBin('*', AstNum(kSigned), sqrtAst);
      numAst = AstBin('+', AstNum(RB), kMag);
    } else {
      const absK = -kSigned;
      const kMag = absK === 1 ? sqrtAst : AstBin('*', AstNum(absK), sqrtAst);
      numAst = AstBin('-', AstNum(RB), kMag);
    }
    return DEN === 1 ? numAst : AstBin('/', numAst, AstNum(DEN));
  }
  return [
    { ast: _build(+1), mult: 1 },
    { ast: _build(-1), mult: 1 },
  ];
}


/** Convert a `{ num, den }` pair into a stack value: Integer when
 *  den=1, Symbolic(num/den) otherwise.  Symbolic rationals match the
 *  HP50 convention where `→Q` / `Q→` exchange `n/d` as a Symbolic —
 *  so FROOTS emits `Integer(2) 1 Integer(3) 1` for `X^2 − 5X + 6`
 *  and `Sym(1/2) 1 Sym(1/3) 1` for `6X^2 − 5X + 1`. */
function _rationalRootValue(num, den) {
  if (den === 1) return Integer(BigInt(num));
  // Construct the Symbolic fraction with a sign-bearing numerator.
  // `_pushSubstResult`-style collapse isn't needed — num/den is
  // already in lowest terms by the enumeration above.
  const sgn = num < 0 ? -1 : 1;
  const absN = Math.abs(num);
  const frac = AstBin('/', AstNum(absN), AstNum(den));
  return Symbolic(sgn < 0 ? AstNeg(frac) : frac);
}


register('FROOTS', (s) => {
  const [v] = s.popN(1);
  if (!isSymbolic(v)) throw new RPLError('Bad argument type');
  // Pick the main variable.  Exactly one free variable ⇒ that one.
  // Zero free variables ⇒ the polynomial is a pure constant; handle
  // here: non-zero constant has no roots, zero constant is a user
  // error (same policy as PROOT).
  const varsSet = algebraFreeVars(v.expr);
  if (varsSet.size > 1) throw new RPLError('Bad argument value');
  // Expand then simplify to a coefficient list.
  let varName;
  if (varsSet.size === 1) varName = [...varsSet][0];
  else                    varName = 'X';   // constant polynomial fallback
  const { coefs } = _symbolicPolyToNumCoefs(v.expr, varName);
  if (coefs.length === 1) {
    // Pure constant — non-zero ⇒ no roots ⇒ empty list.
    s.push(RList([]));
    return;
  }
  // Rational-root pre-scan.  Peel off every `p/q` root that evaluates
  // exactly to zero under Horner.  Keeps Integer roots Integer in the
  // output (a pure Durand-Kerner path would return e.g. `2.0000…`).
  const outItems = [];
  let residual = coefs;
  if (_allIntegerCoefs(coefs)) {
    const { rationalRoots, residualCoefs } = _peelRationalRoots(coefs);
    for (const rr of rationalRoots) {
      outItems.push(_rationalRootValue(rr.num, rr.den));
      outItems.push(Integer(BigInt(rr.mult)));
    }
    residual = residualCoefs;
  }
  // Exact-irrational quadratic-residual pass.  If what remains is a
  // degree-2 integer polynomial with non-square positive discriminant,
  // emit the two roots in closed form `(-b ± k·√m)/(2a)` as Symbolic
  // so `X² - 2 FROOTS` returns `√2` / `-√2` exactly instead of falling
  // through to Durand-Kerner floats.  D < 0 or D a perfect square
  // fall through to the standard path.
  if (residual.length === 3 && _allIntegerCoefs(residual)) {
    const quadRoots = _quadraticExactResidualRoots(residual);
    if (quadRoots) {
      for (const qr of quadRoots) {
        outItems.push(Symbolic(qr.ast));
        outItems.push(Integer(BigInt(qr.mult)));
      }
      residual = [residual[0]];   // degree-0 leftover ⇒ no further roots.
    }
  }
  // Biquadratic residual pass.  Degree-4 integer residual of the
  // shape `a·X⁴ + b·X² + c` (coef[1] = coef[3] = 0) with both
  // u = X² roots exact-irrational.  Emits ±√u₁, ±√u₂ as Symbolic so
  // `X⁴ - 10X² + 1 FROOTS` returns `√(5+2√6)`-family radicals
  // directly rather than deferring to Durand-Kerner floats.
  if (residual.length === 5 && _allIntegerCoefs(residual)) {
    const biqRoots = _biquadResidualRoots(residual);
    if (biqRoots) {
      for (const br of biqRoots) {
        outItems.push(Symbolic(br.ast));
        outItems.push(Integer(BigInt(br.mult)));
      }
      residual = [residual[0]];
    }
  }
  // Residual polynomial still has degree ≥ 1?  Hand to PROOT for the
  // irrational / complex roots.  Degree-0 residual ⇒ fully factored.
  if (residual.length > 1) {
    const coefList = RList(residual.map((c) =>
      Number.isInteger(c) ? Integer(BigInt(c)) : Real(c)));
    const scratch = new (s.constructor)();
    scratch.push(coefList);
    lookup('PROOT').fn(scratch);
    const rootsVec = scratch.pop();
    if (isVector(rootsVec)) {
      const groups = _clusterRoots([...rootsVec.items]);
      for (const g of groups) {
        outItems.push(g.root);
        outItems.push(Integer(BigInt(g.mult)));
      }
    }
  }
  s.push(RList(outItems));
}, { category: 'Polynomials', categoryOrder: 6, label: "FROOTS" });


/* ------------------------------------------------------------------
   GREDUCE   (HP50 AUR §3-99)
   Reduce a polynomial with respect to a Grœbner basis.

     Input :  level 3 = poly      (Symbolic / Name / numeric)
              level 2 = basis     (Vector of polynomials)
              level 1 = vars      (Vector of bare Names — variable list)
     Output:  level 1 = the input polynomial reduced modulo the basis

   Bridges to Giac `greduce(p, [b1,…,bN], [v1,…,vM])`.  The result is a
   single polynomial — push it back through the same `giacToAst →
   _astToRplValue` chain PCAR/EGVL use, so a numeric remainder lands
   as a Real / Integer and a polynomial remainder as a Symbolic.

   Argument shape rejections:
     • level 1 must be a Vector of bare Names (with isName predicate);
       a Vector of strings or Symbolics rejects with `Bad argument type`.
     • level 2 must be a Vector of polynomials — Symbolic / Name /
       Integer / Real / Rational entries OK (lifted via _scalarToGiacStr).
     • level 3 likewise.
     • Empty basis or empty var-list → `Invalid dimension`.

   No-fallback: `!giac.isReady()` ⇒ `CAS not ready`.

   Example (AUR p.3-99):
     GREDUCE( X^2*Y - X*Y - 1, [X, 2*Y^3 - 1], [X, Y] )  →  -1
   ------------------------------------------------------------------ */
register('GREDUCE', (s) => {
  const [poly, basisV, varsV] = s.popN(3);
  if (!isVector(varsV))  throw new RPLError('Bad argument type');
  if (!isVector(basisV)) throw new RPLError('Bad argument type');
  if (varsV.items.length === 0)  throw new RPLError('Invalid dimension');
  if (basisV.items.length === 0) throw new RPLError('Invalid dimension');

  // Variable list must be bare Names — anything else (Symbolic, String)
  // would produce nonsense Giac calls.
  for (const v of varsV.items) {
    if (!isName(v)) throw new RPLError('Bad argument type');
  }

  if (!giac.isReady()) throw new RPLError('CAS not ready');

  const polyStr = _scalarToGiacStr(poly);
  const basisParts = basisV.items.map(_scalarToGiacStr);
  const varsParts  = varsV.items.map((n) => n.id);
  const cmd = `greduce(${polyStr},[${basisParts.join(',')}],[${varsParts.join(',')}])`;
  const raw = giac.caseval(cmd);
  // greduce returns a single polynomial (or constant), not a list.
  // Hand it through the same lift PCAR uses — numerics unwrap, the
  // rest stay Symbolic.
  s.push(_astToRplValue(giacToAst(raw)));
}, { category: 'Polynomials', categoryOrder: 12, label: "GREDUCE" });


/* ------------------------------------------------------------------
   GBASIS    (HP50 AUR §3-95)
   Compute a Grœbner basis of the ideal generated by a vector of
   polynomials over a given variable list.

     Input :  level 2 = F     (Vector of polynomials)
              level 1 = vars  (Vector of bare Names)
     Output: level 1 = G      (Vector containing the basis polynomials)

   Bridges to Giac `gbasis([p1,…,pN], [v1,…,vM])`.  Giac's `gbasis`
   returns a bracketed list of polynomials — split with
   `splitGiacList`, lift each through `giacToAst → _astToRplValue` so
   numeric basis entries land as Real/Integer and non-trivial
   polynomial entries stay Symbolic (mirrors GREDUCE / EGVL).

   Argument shape rejections:
     • level 1 must be a Vector of bare Names; non-Name elements →
       `Bad argument type`.
     • level 2 must be a Vector of polynomials — Symbolic / Name /
       Integer / Real / Rational entries are accepted (`_scalarToGiacStr`).
     • Empty F or empty vars list → `Invalid dimension`.
     • Non-Vector level 1 / level 2 → `Bad argument type`.
     • Giac returning a non-list result → `Bad argument value`
       (defensive — should never happen for a well-formed gbasis call).

   No-fallback: `!giac.isReady()` ⇒ `CAS not ready`.

   Example (AUR p.3-95):
     GBASIS( [ X^2 + 2*X*Y^2, X*Y + 2*Y^3 - 1 ], [ X, Y ] )
       →  [ X, 2*Y^3 - 1 ]
   ------------------------------------------------------------------ */
register('GBASIS', (s) => {
  const [polysV, varsV] = s.popN(2);
  if (!isVector(varsV))  throw new RPLError('Bad argument type');
  if (!isVector(polysV)) throw new RPLError('Bad argument type');
  if (varsV.items.length === 0)  throw new RPLError('Invalid dimension');
  if (polysV.items.length === 0) throw new RPLError('Invalid dimension');

  for (const v of varsV.items) {
    if (!isName(v)) throw new RPLError('Bad argument type');
  }

  if (!giac.isReady()) throw new RPLError('CAS not ready');

  const polysParts = polysV.items.map(_scalarToGiacStr);
  const varsParts  = varsV.items.map((n) => n.id);
  const cmd = `gbasis([${polysParts.join(',')}],[${varsParts.join(',')}])`;
  const raw = giac.caseval(cmd);

  const parts = splitGiacList(raw);
  if (parts === null) throw new RPLError('Bad argument value');
  const items = parts.map((elt) => _astToRplValue(giacToAst(elt)));
  s.push(Vector(items));
}, { category: 'Polynomials', categoryOrder: 11, label: "GBASIS" });


/* ---- FROOTS biquadratic residual pass -------------------------------
   A natural follow-on to the exact-irrational quadratic residual.
   If after rational-root peeling the residual polynomial is
   degree 4 with `coef[1] = coef[3] = 0` (`X⁴ + bX² + c` with
   optional leading coefficient), treat it as the quadratic
   `u² + Bu + C` in `u = X²` where B = coefs[2]/coefs[0] and
   C = coefs[4]/coefs[0].  Find the two u-roots via the existing
   `_quadraticExactResidualRoots`, then emit the four roots
   ±√u₁, ±√u₂ as Symbolic radicals.

   Constraints:
     • All five coefficients must be integers (the underlying quadratic
       residual pass requires that).
     • The `u` roots must be exact-irrational (the quadratic residual
       pass returns null otherwise — complex u-roots or rational u-roots
       would have already been peeled or fall to Durand-Kerner).
     • The quadratic in u becomes `a·u² + b·u + c` with leading `a`;
       we pass `[a, b, c]` unchanged to the quadratic residual pass.

   Returns an array of four `{ast, mult}` items, or null on no-match.

   NOTE: we don't bother with the `u` root being rational — the
   rational-root peeler upstream would already have extracted those
   factors when the residual was degree-5+ or via the full-poly scan.
   For a pure `X⁴ + bX² + c` with rational `u` roots, the current
   peeler misses them (it scans X-linear roots only), so a future
   extension can add a `u`-rational path here. */

function _biquadResidualRoots(coefs) {
  if (coefs.length !== 5) return null;
  if (!_allIntegerCoefs(coefs)) return null;
  if (coefs[1] !== 0 || coefs[3] !== 0) return null;
  if (coefs[0] === 0) return null;
  // Pass [a, b, c] = [coefs[0], coefs[2], coefs[4]] to the quadratic
  // residual solver — it returns two exact-irrational u roots or null.
  const uRoots = _quadraticExactResidualRoots([coefs[0], coefs[2], coefs[4]]);
  if (!uRoots) return null;
  // For each u-root, emit ±√u as Symbolic.  We don't attempt to
  // simplify √(k·√m + RB/DEN)-style — the nested radical stays literal
  // in the AST.  Matches the HP50 behaviour on `X⁴ - 10X² + 1` which
  // returns the four nested-radical roots directly.
  const out = [];
  for (const ur of uRoots) {
    const sqrtU = AstFn('SQRT', [ur.ast]);
    out.push({ ast: sqrtU, mult: 1 });
    out.push({ ast: AstNeg(sqrtU), mult: 1 });
  }
  return out;
}
