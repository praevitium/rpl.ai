import { isReal, isInteger, isComplex, Complex, Real, Vector, isVector, isMatrix, Symbolic, Str, isBinaryInteger } from '../types.js';
import { RPLError } from '../stack.js';
import { Var as AstVar, Bin as AstBin, Num as AstNum, Fn as AstFn } from '../algebra.js';
import { setLastFitModel, FIT_KINDS, evalFitModel, getLastFitModel } from '../state.js';
import { register, lookup } from './registry.js';



/* =================================================================
   Stats (MEAN / SDEV / VAR / TOT), test-matrix constructors
   (VANDERMONDE / HILBERT), π-rationalization (→Qπ), list iterators
   (GETI / PUTI).  All user-reachable today from the typed catalog;
   no UI wiring needed.

   Advanced Guide refs:
     §18    (MEAN / SDEV / VAR / TOT — stat reductions on a
             Vector / Matrix that stands in for ΣDAT.  Matrix input
             reduces COLUMN-WISE — each column is one variable,
             each row is one observation — and the result is a
             Vector of per-column stats.  Vector input is the
             single-variable special case: the result is a scalar.)
     §15.6  (VANDERMONDE / HILBERT — canonical "test matrices" used
             for interpolation and ill-conditioning demos.)
     §12.4  (→Qπ — rationalize a Real as a rational multiple of π.
             Mirror of →Q, but tries to detect the π factor first.)
     §13.2  (GETI / PUTI — GET / PUT with auto-increment.  The
             index advances and wraps to 1 when the end is reached —
             the classic HP "each consecutive call walks through the
             container" idiom that makes DOSUBS-style loops trivial.)
   ================================================================= */

/* --------------- MEAN / SDEV / VAR / TOT — stat reductions -----------
   HP50 AUR §18.  Scalar statistics over a Vector (single-variable
   sample) or Matrix (each column is a variable, rows are
   observations → per-column Vector of stats).

     TOT   ( V → s )     sum of elements
     MEAN  ( V → s )     arithmetic mean
     VAR   ( V → s )     sample variance (Bessel n-1 denominator)
     SDEV  ( V → s )     sqrt(VAR)

     TOT   ( M → v )     column sums  (1×n Vector)
     MEAN  ( M → v )     per-column means
     VAR   ( M → v )     per-column sample variances
     SDEV  ( M → v )     per-column sample SDs

   Type policy:
     - TOT / MEAN accept Real / Integer / Complex entries.  Vector of
       Complex returns a Complex scalar (sum / mean of imaginary and
       real parts independently).
     - VAR / SDEV accept Real / Integer entries only.  Complex raises
       Bad argument type (HP50 SDEV-on-complex is not meaningfully
       defined without choosing a conjugate-pair convention, so we
       punt until the CAS side wants it).
     - Symbolic / Name / BinaryInteger entries in any path throw
       Bad argument type (same policy as CNRM / RNRM / NORM).
     - Empty Vector ⇒ Bad argument value (no data to reduce).

   Single-observation samples: VAR / SDEV on a length-1 Vector return
   0 (matches HP50 AUR §18.1, which defines SDEV of a 1-row ΣDAT as
   zero rather than "undefined").
   ----------------------------------------------------------------- */

function _statsNumericEntry(x) {
  if (isReal(x))    return x.value.toNumber();
  if (isInteger(x)) return Number(x.value);
  throw new RPLError('Bad argument type');
}


function _statsNumOrComplexEntry(x) {
  if (isReal(x))    return { re: x.value.toNumber(), im: 0, complex: false };
  if (isInteger(x)) return { re: Number(x.value), im: 0, complex: false };
  if (isComplex(x)) return { re: x.re, im: x.im, complex: true };
  throw new RPLError('Bad argument type');
}


function _wrapComplexOrReal(re, im, sawComplex) {
  if (sawComplex && im !== 0) return Complex(re, im);
  if (sawComplex) return Complex(re, 0);
  return Real(re);
}


/** Sum of a 1-D numeric array (Vector entries).  Returns Real or
 *  Complex as appropriate.  Throws Bad argument type on non-numeric. */
function _sumItems(items) {
  if (items.length === 0) throw new RPLError('Bad argument value');
  let re = 0, im = 0, sawComplex = false;
  for (const x of items) {
    const p = _statsNumOrComplexEntry(x);
    re += p.re; im += p.im;
    if (p.complex) sawComplex = true;
  }
  return _wrapComplexOrReal(re, im, sawComplex);
}


/** Arithmetic mean over items.  Returns Real / Complex. */
function _meanItems(items) {
  if (items.length === 0) throw new RPLError('Bad argument value');
  let re = 0, im = 0, sawComplex = false;
  for (const x of items) {
    const p = _statsNumOrComplexEntry(x);
    re += p.re; im += p.im;
    if (p.complex) sawComplex = true;
  }
  const n = items.length;
  return _wrapComplexOrReal(re / n, im / n, sawComplex);
}


/** Sample variance over items.  Bessel correction: divide by n-1.
 *  n==1 returns 0.  Real / Integer entries only. */
function _varItems(items) {
  if (items.length === 0) throw new RPLError('Bad argument value');
  if (items.length === 1) {
    // Validate the entry still — a single Complex would otherwise
    // pass silently.
    _statsNumericEntry(items[0]);
    return 0;
  }
  let sum = 0;
  const vals = new Array(items.length);
  for (let i = 0; i < items.length; i++) {
    const x = _statsNumericEntry(items[i]);
    vals[i] = x; sum += x;
  }
  const mean = sum / items.length;
  let ss = 0;
  for (const x of vals) {
    const d = x - mean;
    ss += d * d;
  }
  return ss / (items.length - 1);
}


function _sdevItems(items) {
  return Math.sqrt(_varItems(items));
}


/** Apply a per-column reducer to a Matrix.  `reduce(entries)` returns
 *  a plain scalar or RPL value.  If `wrap` is given, it wraps each
 *  reducer output (so Real-only reducers stay Real).  Result is a
 *  Vector of length n (one entry per column). */
function _perColumn(M, reduceItems, wrap) {
  const m = M.rows.length;
  if (m === 0) throw new RPLError('Bad argument value');
  const n = M.rows[0].length;
  const out = new Array(n);
  for (let j = 0; j < n; j++) {
    const col = new Array(m);
    for (let i = 0; i < m; i++) col[i] = M.rows[i][j];
    const r = reduceItems(col);
    out[j] = wrap ? wrap(r) : r;
  }
  return Vector(out);
}


register('TOT', (s) => {
  const [v] = s.popN(1);
  if (isVector(v)) { s.push(_sumItems(v.items)); return; }
  if (isMatrix(v)) {
    // Column sums — reducer returns an RPL value already.
    s.push(_perColumn(v, (col) => _sumItems(col)));
    return;
  }
  throw new RPLError('Bad argument type');
}, { category: 'Statistics', categoryOrder: 6, label: "TOT" });


register('MEAN', (s) => {
  const [v] = s.popN(1);
  if (isVector(v)) { s.push(_meanItems(v.items)); return; }
  if (isMatrix(v)) {
    s.push(_perColumn(v, (col) => _meanItems(col)));
    return;
  }
  throw new RPLError('Bad argument type');
}, { category: 'Statistics', categoryOrder: 0, label: "MEAN" });


register('VAR', (s) => {
  const [v] = s.popN(1);
  if (isVector(v)) { s.push(Real(_varItems(v.items))); return; }
  if (isMatrix(v)) {
    s.push(_perColumn(v, (col) => _varItems(col), (x) => Real(x)));
    return;
  }
  throw new RPLError('Bad argument type');
}, { category: 'Statistics', categoryOrder: 2, label: "VAR" });


register('SDEV', (s) => {
  const [v] = s.popN(1);
  if (isVector(v)) { s.push(Real(_sdevItems(v.items))); return; }
  if (isMatrix(v)) {
    s.push(_perColumn(v, (col) => _sdevItems(col), (x) => Real(x)));
    return;
  }
  throw new RPLError('Bad argument type');
}, { category: 'Statistics', categoryOrder: 3, label: "SDEV" });


/* --------------- MEDIAN — order-statistic over a Vector --------------
   HP50 AUR §18.  Standard odd/even convention: middle entry when n is
   odd, arithmetic mean of the two middle entries when n is even.

     MEDIAN  ( V → m )     Vector V; Real / Integer entries only.
     MEDIAN  ( M → v )     Matrix M; per-column median as Vector.

   Rejects Complex / Symbolic / BinInt entries (same policy as VAR /
   SDEV).  Empty Vector throws Bad argument value.  Ties on the
   ordering go stable — two equal values side-by-side sort to their
   input order; doesn't affect the median value.
   ----------------------------------------------------------------- */

function _medianItems(items) {
  if (items.length === 0) throw new RPLError('Bad argument value');
  const arr = items.map(_statsNumericEntry).slice().sort((a, b) => a - b);
  const n = arr.length;
  if ((n & 1) === 1) return arr[(n - 1) >> 1];
  return (arr[n / 2 - 1] + arr[n / 2]) / 2;
}


register('MEDIAN', (s) => {
  const [v] = s.popN(1);
  if (isVector(v)) { s.push(Real(_medianItems(v.items))); return; }
  if (isMatrix(v)) {
    s.push(_perColumn(v, (col) => _medianItems(col), (x) => Real(x)));
    return;
  }
  throw new RPLError('Bad argument type');
}, { category: 'Statistics', categoryOrder: 1, label: "MEDIAN" });


/* --------------- CORR / COV — paired-sample correlation / covariance -
   HP50 AUR §18.4.  The HP50 operates on columns of ΣDAT (two
   independent variables); we accept an m×2 Matrix directly — no
   sidecar slot required.  Column 1 is X, column 2 is Y.

     CORR  ( M → r )   Pearson product-moment correlation
                       r = cov(X,Y) / (sdev(X) * sdev(Y))
                       -1 ≤ r ≤ 1.  Zero-variance columns throw
                       Infinite result (division by zero in the
                       denominator).
     COV   ( M → s )   Sample covariance (Bessel n-1 denominator)
                       s = Σ (xᵢ - μX)(yᵢ - μY) / (n − 1)

   Input M must be m×2 with m ≥ 2; fewer rows throws Bad argument
   value (can't form a sample variance).  Real/Integer entries
   only.  A Vector input is explicitly rejected — the paired-sample
   ops need two parallel columns.
   ----------------------------------------------------------------- */

function _twoColsOrThrow(M) {
  if (!isMatrix(M)) throw new RPLError('Bad argument type');
  const m = M.rows.length;
  if (m < 2) throw new RPLError('Bad argument value');
  if (M.rows[0].length !== 2) throw new RPLError('Invalid dimension');
  const X = new Array(m), Y = new Array(m);
  for (let i = 0; i < m; i++) {
    X[i] = _statsNumericEntry(M.rows[i][0]);
    Y[i] = _statsNumericEntry(M.rows[i][1]);
  }
  return { X, Y, m };
}


function _meanArr(a) {
  let s = 0; for (const x of a) s += x; return s / a.length;
}


function _covArr(X, Y) {
  const mX = _meanArr(X), mY = _meanArr(Y);
  let s = 0;
  for (let i = 0; i < X.length; i++) s += (X[i] - mX) * (Y[i] - mY);
  return s / (X.length - 1);
}


function _varArr(A) {
  const m = _meanArr(A);
  let s = 0;
  for (const x of A) { const d = x - m; s += d * d; }
  return s / (A.length - 1);
}


register('COV', (s) => {
  const [M] = s.popN(1);
  const { X, Y } = _twoColsOrThrow(M);
  s.push(Real(_covArr(X, Y)));
}, { category: 'Statistics', categoryOrder: 23, label: "COV" });


register('CORR', (s) => {
  const [M] = s.popN(1);
  const { X, Y } = _twoColsOrThrow(M);
  const vX = _varArr(X), vY = _varArr(Y);
  if (vX === 0 || vY === 0) throw new RPLError('Infinite result');
  s.push(Real(_covArr(X, Y) / Math.sqrt(vX * vY)));
});


/* --------------- Stats aggregates: NΣ / ΣX / ΣY / ΣXY / ΣX² / ΣY² ----
   HP50 AUR §18.1.  The full row of column-wise statistics that feeds
   the regression family.  Per the ΣDAT-bypass convention, these take
   the Matrix argument directly rather than reading it from the hidden
   ΣDAT variable — so they accept Integer / Real entries via
   `_statsNumericEntry`.

     NΣ    ( M → N )      Row count (Real).
     ΣX    ( M → Σx )     Sum of column 1.
     ΣY    ( M → Σy )     Sum of column 2.  Needs ≥ 2 columns.
     ΣXY   ( M → Σxy )    Sum of column-1 * column-2.  ≥ 2 columns.
     ΣX²   ( M → Σx² )    Sum of column-1 squared.
     ΣY²   ( M → Σy² )    Sum of column-2 squared.  ≥ 2 columns.
     MAXΣ  ( M → V )      Per-column maximum.  Vector of length n.
     MINΣ  ( M → V )      Per-column minimum.  Vector of length n.

   All return Real (scalar) or Vector (per-column).  Empty Matrix →
   Bad argument value.  HP50 also accepts Vector input for ΣX, NΣ,
   ΣX²; we mirror that on the one-column ops but require ≥ 2-column
   Matrix for the paired ones.  Both MAXΣ / MINΣ accept Vector too
   (returning a 1-vector).
   ----------------------------------------------------------------- */

function _matStatsCol(M, j) {
  // Extract column j of Matrix M as numeric array.  Caller validates
  // that j < M.rows[0].length.
  const m = M.rows.length;
  if (m === 0) throw new RPLError('Bad argument value');
  const out = new Array(m);
  for (let i = 0; i < m; i++) out[i] = _statsNumericEntry(M.rows[i][j]);
  return out;
}


function _sumOfArr(a)  { let s = 0; for (const x of a) s += x; return s; }

function _sumOfSq(a)   { let s = 0; for (const x of a) s += x*x; return s; }

function _sumOfProd(a, b) {
  let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}


function _statsVectorOrMatrixCol0(v) {
  // For ΣX / ΣX² / NΣ — accept Vector (whole items) or Matrix (column 0).
  if (isVector(v)) {
    const n = v.items.length;
    if (n === 0) throw new RPLError('Bad argument value');
    return v.items.map(_statsNumericEntry);
  }
  if (isMatrix(v)) {
    return _matStatsCol(v, 0);
  }
  throw new RPLError('Bad argument type');
}


register('NSIGMA', (s) => {
  // Canonical name NΣ.  We register both the Unicode symbol NΣ and
  // this ASCII form so programs that type `NSIGMA` still work.
  const [M] = s.popN(1);
  if (isVector(M)) {
    if (M.items.length === 0) throw new RPLError('Bad argument value');
    s.push(Real(M.items.length));
    return;
  }
  if (isMatrix(M)) {
    if (M.rows.length === 0) throw new RPLError('Bad argument value');
    s.push(Real(M.rows.length));
    return;
  }
  throw new RPLError('Bad argument type');
}, { category: 'Statistics', categoryOrder: 5, label: "NSIGMA" });

register('NΣ', (s) => { lookup('NSIGMA').fn(s); }, { category: 'Statistics', categoryOrder: 19, label: "NΣ" });


register('ΣX', (s) => {
  const [v] = s.popN(1);
  const X = _statsVectorOrMatrixCol0(v);
  s.push(Real(_sumOfArr(X)));
}, { category: 'Statistics', categoryOrder: 14, label: "ΣX" });

register('SX', (s) => { lookup('ΣX').fn(s); }, { category: 'Statistics', categoryOrder: 9, label: "SX" });
       // ASCII alias

register('ΣX2', (s) => {
  const [v] = s.popN(1);
  const X = _statsVectorOrMatrixCol0(v);
  s.push(Real(_sumOfSq(X)));
}, { category: 'Statistics', categoryOrder: 15, label: "ΣX2" });

register('SX2', (s) => { lookup('ΣX2').fn(s); }, { category: 'Statistics', categoryOrder: 10, label: "SX2" });


register('ΣY', (s) => {
  const [M] = s.popN(1);
  if (!isMatrix(M)) throw new RPLError('Bad argument type');
  if (M.rows.length === 0) throw new RPLError('Bad argument value');
  if (M.rows[0].length < 2) throw new RPLError('Invalid dimension');
  s.push(Real(_sumOfArr(_matStatsCol(M, 1))));
}, { category: 'Statistics', categoryOrder: 16, label: "ΣY" });

register('SY', (s) => { lookup('ΣY').fn(s); }, { category: 'Statistics', categoryOrder: 11, label: "SY" });


register('ΣY2', (s) => {
  const [M] = s.popN(1);
  if (!isMatrix(M)) throw new RPLError('Bad argument type');
  if (M.rows.length === 0) throw new RPLError('Bad argument value');
  if (M.rows[0].length < 2) throw new RPLError('Invalid dimension');
  s.push(Real(_sumOfSq(_matStatsCol(M, 1))));
}, { category: 'Statistics', categoryOrder: 17, label: "ΣY2" });

register('SY2', (s) => { lookup('ΣY2').fn(s); }, { category: 'Statistics', categoryOrder: 12, label: "SY2" });


register('ΣXY', (s) => {
  const [M] = s.popN(1);
  if (!isMatrix(M)) throw new RPLError('Bad argument type');
  if (M.rows.length === 0) throw new RPLError('Bad argument value');
  if (M.rows[0].length < 2) throw new RPLError('Invalid dimension');
  const X = _matStatsCol(M, 0);
  const Y = _matStatsCol(M, 1);
  s.push(Real(_sumOfProd(X, Y)));
}, { category: 'Statistics', categoryOrder: 18, label: "ΣXY" });

register('SXY', (s) => { lookup('ΣXY').fn(s); }, { category: 'Statistics', categoryOrder: 13, label: "SXY" });


/* MAXΣ / MINΣ — per-column max / min. */
register('MAXΣ', (s) => {
  const [v] = s.popN(1);
  if (isVector(v)) {
    if (v.items.length === 0) throw new RPLError('Bad argument value');
    const a = v.items.map(_statsNumericEntry);
    s.push(Vector([Real(Math.max(...a))]));
    return;
  }
  if (isMatrix(v)) {
    if (v.rows.length === 0) throw new RPLError('Bad argument value');
    const n = v.rows[0].length;
    const out = new Array(n);
    for (let j = 0; j < n; j++) {
      const col = _matStatsCol(v, j);
      out[j] = Real(Math.max(...col));
    }
    s.push(Vector(out));
    return;
  }
  throw new RPLError('Bad argument type');
}, { category: 'Statistics', categoryOrder: 20, label: "MAXΣ" });

register('MAXS', (s) => { lookup('MAXΣ').fn(s); }, { category: 'Statistics', categoryOrder: 7, label: "MAXS" });


register('MINΣ', (s) => {
  const [v] = s.popN(1);
  if (isVector(v)) {
    if (v.items.length === 0) throw new RPLError('Bad argument value');
    const a = v.items.map(_statsNumericEntry);
    s.push(Vector([Real(Math.min(...a))]));
    return;
  }
  if (isMatrix(v)) {
    if (v.rows.length === 0) throw new RPLError('Bad argument value');
    const n = v.rows[0].length;
    const out = new Array(n);
    for (let j = 0; j < n; j++) {
      const col = _matStatsCol(v, j);
      out[j] = Real(Math.min(...col));
    }
    s.push(Vector(out));
    return;
  }
  throw new RPLError('Bad argument type');
}, { category: 'Statistics', categoryOrder: 21, label: "MINΣ" });

register('MINS', (s) => { lookup('MINΣ').fn(s); }, { category: 'Statistics', categoryOrder: 8, label: "MINS" });


/* --------------- LINFIT / LOGFIT / EXPFIT / PWRFIT / BESTFIT ----------
   HP50 AUR §18.1.  Regression family: fit the column-1 / column-2
   data in `M` (a 2-column Matrix) to one of four models:

     LINFIT : y = a + b·x            (linear)
     LOGFIT : y = a + b·ln x         (logarithmic)
     EXPFIT : y = a · e^(b·x)        (exponential)
     PWRFIT : y = a · x^b            (power)

   Each fit op returns two values on the stack:
     - the fitted-model Symbolic (a closed-form expression in `X`)
     - the correlation coefficient r (Real in [-1, 1])
   This matches HP50's `ΣLINE`-plus-`CORR` two-output convention so
   the user can see the quality of the fit alongside the model.

   BESTFIT selects the model with the largest |r| by trying all four
   and pushes the model name (String) — NOT the expression — on the
   stack.  This is the HP50 behavior: BESTFIT is diagnostic (which
   family is the best match?) rather than computational; the user
   then runs the chosen fit op to get the equation.

   Transformations that require positive values (log X, log Y, etc.)
   throw Bad argument value if a data point violates the domain.
   Real / Integer entries only; Complex is rejected by
   `_statsNumericEntry`.  Rows < 2 → Bad argument value.
   ----------------------------------------------------------------- */

function _linearFit(X, Y) {
  // Compute a + b·X fit; returns {a, b, r}.
  const n = X.length;
  const mX = _meanArr(X), mY = _meanArr(Y);
  let sxx = 0, syy = 0, sxy = 0;
  for (let i = 0; i < n; i++) {
    const dx = X[i] - mX, dy = Y[i] - mY;
    sxx += dx * dx; syy += dy * dy; sxy += dx * dy;
  }
  if (sxx === 0) throw new RPLError('Infinite result');
  const b = sxy / sxx;
  const a = mY - b * mX;
  const r = (syy === 0) ? (sxy === 0 ? 1 : 0) : sxy / Math.sqrt(sxx * syy);
  return { a, b, r };
}


function _modelToSym(model, a, b) {
  // Build the AST for the fitted model.  `a`, `b` are plain numbers.
  const X = AstVar('X');
  if (model === 'LIN') {
    // a + b*X
    return Symbolic(AstBin('+', AstNum(a), AstBin('*', AstNum(b), X)));
  }
  if (model === 'LOG') {
    // a + b*ln(X)
    return Symbolic(AstBin('+', AstNum(a),
      AstBin('*', AstNum(b), AstFn('LN', [X]))));
  }
  if (model === 'EXP') {
    // a * exp(b*X)
    return Symbolic(AstBin('*', AstNum(a),
      AstFn('EXP', [AstBin('*', AstNum(b), X)])));
  }
  if (model === 'PWR') {
    // a * X^b
    return Symbolic(AstBin('*', AstNum(a), AstBin('^', X, AstNum(b))));
  }
  throw new RPLError('Bad argument value');
}


function _fitLINFIT(M) {
  const { X, Y } = _twoColsOrThrow(M);
  const { a, b, r } = _linearFit(X, Y);
  return { sym: _modelToSym('LIN', a, b), r, a, b };
}

function _fitLOGFIT(M) {
  const { X, Y } = _twoColsOrThrow(M);
  for (const x of X) if (x <= 0) throw new RPLError('Bad argument value');
  const lnX = X.map(Math.log);
  const { a, b, r } = _linearFit(lnX, Y);
  return { sym: _modelToSym('LOG', a, b), r, a, b };
}

function _fitEXPFIT(M) {
  const { X, Y } = _twoColsOrThrow(M);
  for (const y of Y) if (y <= 0) throw new RPLError('Bad argument value');
  const lnY = Y.map(Math.log);
  const { a: A, b, r } = _linearFit(X, lnY);
  // Model: y = e^A · e^(b·x);  so a = e^A.
  const a = Math.exp(A);
  return { sym: _modelToSym('EXP', a, b), r, a, b };
}

function _fitPWRFIT(M) {
  const { X, Y } = _twoColsOrThrow(M);
  for (const x of X) if (x <= 0) throw new RPLError('Bad argument value');
  for (const y of Y) if (y <= 0) throw new RPLError('Bad argument value');
  const lnX = X.map(Math.log);
  const lnY = Y.map(Math.log);
  const { a: A, b, r } = _linearFit(lnX, lnY);
  const a = Math.exp(A);
  return { sym: _modelToSym('PWR', a, b), r, a, b };
}


register('LINFIT', (s) => {
  const [M] = s.popN(1);
  const { sym, r, a, b } = _fitLINFIT(M);
  setLastFitModel('LIN', a, b);
  s.push(sym); s.push(Real(r));
}, { category: 'Statistics', categoryOrder: 24, label: "LINFIT" });


register('LOGFIT', (s) => {
  const [M] = s.popN(1);
  const { sym, r, a, b } = _fitLOGFIT(M);
  setLastFitModel('LOG', a, b);
  s.push(sym); s.push(Real(r));
}, { category: 'Statistics', categoryOrder: 25, label: "LOGFIT" });


register('EXPFIT', (s) => {
  const [M] = s.popN(1);
  const { sym, r, a, b } = _fitEXPFIT(M);
  setLastFitModel('EXP', a, b);
  s.push(sym); s.push(Real(r));
}, { category: 'Statistics', categoryOrder: 26, label: "EXPFIT" });


register('PWRFIT', (s) => {
  const [M] = s.popN(1);
  const { sym, r, a, b } = _fitPWRFIT(M);
  setLastFitModel('PWR', a, b);
  s.push(sym); s.push(Real(r));
}, { category: 'Statistics', categoryOrder: 27, label: "PWRFIT" });


register('BESTFIT', (s) => {
  const [M] = s.popN(1);
  // Try each fit; catch domain errors so negative-X data doesn't kill
  // the whole op when at least one fit succeeds.
  const candidates = [];
  try { const { r } = _fitLINFIT(M); candidates.push({ name: 'LIN', r }); } catch (_) {}
  try { const { r } = _fitLOGFIT(M); candidates.push({ name: 'LOG', r }); } catch (_) {}
  try { const { r } = _fitEXPFIT(M); candidates.push({ name: 'EXP', r }); } catch (_) {}
  try { const { r } = _fitPWRFIT(M); candidates.push({ name: 'PWR', r }); } catch (_) {}
  if (candidates.length === 0) {
    // Data violates every fit's domain — re-run LINFIT to surface the
    // underlying error message (typically Bad argument value / type).
    _fitLINFIT(M);
    // If the re-run didn't throw, bail generically.
    throw new RPLError('Bad argument value');
  }
  let best = candidates[0];
  for (const c of candidates) {
    if (Math.abs(c.r) > Math.abs(best.r)) best = c;
  }
  s.push(Str(best.name));
}, { category: 'Statistics', categoryOrder: 28, label: "BESTFIT" });



/* ========================================================================
   MAD, AXL / AXM, FROOTS, TCHEBYCHEFF second-kind.

   HP50 AUR references:
     §18.1 (MAD)            column-wise Mean Absolute Deviation
     §15.2 (AXL / AXM)      List ↔ Matrix / Vector bridges
     §12.5 (FROOTS)         polynomial factoring — from a Symbolic
                            polynomial in X, returns roots w/
                            multiplicities as an RList `{r1 m1 r2 m2 …}`.

   TCHEBYCHEFF negative-n (second-kind U_{|n|-1}) is handled inside
   `_tchebOp` directly (immediately above): the argument-sign branch
   distinguishes first- from second-kind.
   ==================================================================== */

/* ---- MAD — Mean Absolute Deviation -----------------------------------
   HP50 AUR §18.1.  `MAD(v) = mean(|v_i − mean(v)|)` for a Vector;
   column-wise for a Matrix (matches MEAN / VAR / SDEV / MEDIAN).
   Real / Integer entries only (same policy as VAR / SDEV — Complex
   entries make "absolute deviation" ambiguous: do you use magnitude
   or complex-valued deviation?  HP50 firmware rejects Complex here,
   so we do too).
   --------------------------------------------------------------------- */
function _madItems(items) {
  if (items.length === 0) throw new RPLError('Bad argument value');
  // Single-observation samples: mean absolute deviation is zero.
  if (items.length === 1) {
    _statsNumericEntry(items[0]);   // validate type even in the degenerate case
    return 0;
  }
  // Two-pass: compute mean, then mean of |x - mean|.  One-pass online
  // algorithms don't exist for MAD (unlike VAR), but two passes over
  // numeric arrays is cheap.
  const vals = new Array(items.length);
  let sum = 0;
  for (let i = 0; i < items.length; i++) {
    const x = _statsNumericEntry(items[i]);
    vals[i] = x; sum += x;
  }
  const mean = sum / items.length;
  let absSum = 0;
  for (const x of vals) absSum += Math.abs(x - mean);
  return absSum / items.length;
}


register('MAD', (s) => {
  const [v] = s.popN(1);
  if (isVector(v)) { s.push(Real(_madItems(v.items))); return; }
  if (isMatrix(v)) {
    s.push(_perColumn(v, (col) => _madItems(col), (x) => Real(x)));
    return;
  }
  throw new RPLError('Bad argument type');
}, { category: 'Statistics', categoryOrder: 4, label: "MAD" });


/* ====================================================================
   PREDV / PREDX / PREVAL / TAN2SC / LAPLACE / ILAP.
   ====================================================================

   Each op below slots into the CAS / stats family.  Cross-cutting
   state reuse: PREDV / PREDX read the `lastFitModel` slot published
   by LINFIT / LOGFIT / EXPFIT / PWRFIT; the other four ops are pure
   AST rewrites on their input.  See the per-op comment for the
   user-reachable demo keypress sequence.
   ==================================================================== */

/* ---- PREDV — evaluate last fit at a scalar x -----------------------
   HP50 AUR §18.1.  After running one of LINFIT / LOGFIT / EXPFIT /
   PWRFIT the calculator remembers the fit model; PREDV takes an x
   value and returns the predicted y for that model.

     x PREDV  ( R → R )   y-prediction at x using the last-run fit.

   No fit run yet ⇒ Undefined name.  Non-Real/Integer x rejected with
   Bad argument type.  Domain violations (LOG of x≤0, PWR of x≤0)
   surface as Infinite result, not silent NaN — mirrors the ops'
   domain-error surface. */

function _evalFitModel(model, x) {
  if (!FIT_KINDS.includes(model.kind)) throw new RPLError('Bad argument value');
  const y = evalFitModel(model, x);
  if (!Number.isFinite(y)) throw new RPLError('Infinite result');
  return y;
}


/* Inverse of the fit model: solve `y = f(x)` for x.  Real only — no
   multi-valued / Complex branch picking.  Returns `null` when the
   inverse is undefined (e.g. b=0 in a LIN fit, or log of a non-
   positive argument). */
function _invertFitModel(model, y) {
  const { kind, a, b } = model;
  switch (kind) {
    case 'LIN':
      if (b === 0) return null;
      return (y - a) / b;
    case 'LOG':
      // y = a + b·ln(x)  ⇒  x = exp((y-a)/b)
      if (b === 0) return null;
      return Math.exp((y - a) / b);
    case 'EXP':
      // y = a·e^(b·x)  ⇒  x = ln(y/a) / b
      if (a === 0 || b === 0) return null;
      const r = y / a;
      if (r <= 0) return null;
      return Math.log(r) / b;
    case 'PWR':
      // y = a·x^b  ⇒  x = (y/a)^(1/b)
      if (a === 0 || b === 0) return null;
      const q = y / a;
      if (q <= 0) return null;
      return Math.pow(q, 1 / b);
    default: return null;
  }
}


/** Accept Real / Integer / (integer-valued BinInt) as the scalar arg
 *  for PREDV / PREDX.  Complex is rejected — the fit models are
 *  real-valued and the inverse is real-to-real. */
function _fitScalar(v) {
  if (isReal(v))    return v.value.toNumber();
  if (isInteger(v)) return Number(v.value);
  if (isBinaryInteger(v)) return Number(v.value);
  throw new RPLError('Bad argument type');
}


register('PREDV', (s) => {
  const [xv] = s.popN(1);
  const model = getLastFitModel();
  if (!model) throw new RPLError('Undefined name');
  const x = _fitScalar(xv);
  const y = _evalFitModel(model, x);
  if (!Number.isFinite(y)) throw new RPLError('Infinite result');
  s.push(Real(y));
}, { category: 'Statistics', categoryOrder: 29, label: "PREDV" });


/* ---- PREDX — evaluate inverse fit at a scalar y --------------------
   Inverse of PREDV: given a predicted y, back out the x that would
   have produced it under the last-run fit.

     y PREDX  ( R → R )   x such that f(x) = y under last-run fit.

   No fit ⇒ Undefined name.  Non-invertible model (b=0 in LIN/LOG,
   a=0 in EXP/PWR) ⇒ Infinite result.  Domain violation of the
   inverse (e.g. y ≤ 0 for EXP/PWR when a > 0) ⇒ Infinite result. */

register('PREDX', (s) => {
  const [yv] = s.popN(1);
  const model = getLastFitModel();
  if (!model) throw new RPLError('Undefined name');
  const y = _fitScalar(yv);
  const x = _invertFitModel(model, y);
  if (x === null || !Number.isFinite(x)) throw new RPLError('Infinite result');
  s.push(Real(x));
}, { category: 'Statistics', categoryOrder: 30, label: "PREDX" });
