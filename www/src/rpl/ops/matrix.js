import { isVector, RList, Real, isMatrix, isString, Integer, isList, isProgram, Matrix, Vector, isInteger, isReal, isComplex, isSymbolic, Symbolic } from '../types.js';
import { RPLError } from '../stack.js';
import { nextPrngInt9, getCasVx } from '../state.js';
import { giac } from '../cas/giac-engine.mjs';
import { giacToAst, splitGiacList } from '../cas/giac-convert.mjs';
import { charSpaceList, eigenvalueArray, spacesFromJordan } from '../jordan-format.js';
import { register, OPS } from './registry.js';
import { _astToRplValue, _coefArrToSymbolicX, _colCompose, _colDecompose, _decimalFrobeniusNorm, _fromArrayOp, _fromVecOp, _indexAsInt, _invMatrixNumeric, _isScalarOperand, _isSymOperand, _matrixToGiacStr, _nFromIntegerArg, _popSquareMatrix, _rowCompose, _rowDecompose, _scalarBinary, _scalarSum, _toArrayOp, _toV2Op, _toV3Op } from './internal.js';



/* ================================================================
   Matrix / Vector ops — starter set

   SIZE and TRN are 1-arg ops that don't commit to a promotion rule
   for mixed scalar/matrix inputs.  Element-wise +/- on two Vectors
   of equal length is wired into the main `+` handler and
   `binaryMath('-')` dispatch — see the `_withTaggedBinary`-wrapped
   second-pass registrations near the end of this file (the authoritative
   sites; earlier arithmetic register() calls are left as historical
   no-ops, overridden by these later ones per Map semantics).

   HP50 SIZE/TRN semantics:
     SIZE  Vector([a b c])      → { 3 }            list of one integer
     SIZE  Matrix([[...][...]]) → { rows cols }    list of two integers
     TRN   Matrix m×n           → Matrix n×m       (pure transpose —
                                                    no complex conjugate
                                                    since we don't have
                                                    complex entries in
                                                    matrices yet)
   ================================================================ */

register('SIZE', (s) => {
  const [v] = s.popN(1);
  // HP50 Advanced Guide spec: SIZE on array-shaped values returns a
  // list of REAL numbers (not Integers).  Aligned so downstream ops
  // reading the list don't have to worry about Integer → Real
  // promotion at the boundary.
  if (isVector(v)) {
    s.push(RList([Real(v.items.length)]));
    return;
  }
  if (isMatrix(v)) {
    const rows = v.rows.length;
    const cols = rows > 0 ? v.rows[0].length : 0;
    s.push(RList([Real(rows), Real(cols)]));
    return;
  }
  // HP50 also defines SIZE on strings (returns count) and lists (same).
  // Provide those while we're here — they're trivial and the HP50
  // User Guide documents a single SIZE op that overloads across
  // sequence-like types.  String/List SIZE returns a scalar Integer,
  // not a list, on the real HP50 — we keep that shape.
  if (isString(v)) { s.push(Integer(BigInt(v.value.length))); return; }
  if (isList(v))   { s.push(Integer(BigInt(v.items.length))); return; }
  // HP50 AUR §5.3: SIZE on a Program returns an Integer count of the
  // objects (tokens) in the program body.  Matches the HP50's general
  // principle that SIZE reports the number of "elements" in a composite
  // object.  Empty program « » → 0; deeply nested programs count only
  // the top-level tokens (sub-programs count as 1 token each).
  if (isProgram(v)) { s.push(Integer(BigInt(v.tokens.length))); return; }
  throw new RPLError('Bad argument type');
}, { category: 'Vectors / matrices', categoryOrder: 0, label: "SIZE" });


register('TRN', (s) => {
  const [m] = s.popN(1);
  if (!isMatrix(m)) throw new RPLError('Bad argument type');
  const rows = m.rows.length;
  const cols = rows > 0 ? m.rows[0].length : 0;
  if (rows === 0 || cols === 0) { s.push(m); return; }
  // Build the transpose: new[j][i] = m.rows[i][j].
  const out = [];
  for (let j = 0; j < cols; j++) {
    const row = new Array(rows);
    for (let i = 0; i < rows; i++) {
      row[i] = m.rows[i][j];
    }
    out.push(row);
  }
  s.push(Matrix(out));
}, { category: 'Vectors / matrices', categoryOrder: 1, label: "TRN" });


/* ================================================================
   Matrix / Vector ops — MATRICES soft-menu slots

   Builds on the starter set (SIZE, TRN, element-wise +/-, dot-on-`*`,
   matmul) with the remaining MATRICES soft-menu ops:

     DOT    V V →  scalar       — explicit dot product (alias of `V V *`)
     CROSS  V V →  V            — 3-vector cross product
     IDN    n   →  Matrix(n×n)  — identity (n an Integer or square Matrix)
     NORM   V   →  Real         — Euclidean norm  (√(Σ xᵢ²))
     NORM   M   →  Real         — Frobenius norm  (√(Σ mᵢⱼ²))
     DET    M   →  scalar       — determinant (Laplace expansion; 1×1/2×2
                                  closed-form fast paths)
     INV    M   →  Matrix       — inverse (Gauss-Jordan with partial
                                  pivoting; only added to the existing
                                  scalar-INV registration, see the branch
                                  we add in-place below)

   Error surface:
     - Non-square input to DET/INV/IDN(Matrix) → 'Invalid dimension'
     - Length mismatch on DOT → 'Invalid dimension'
     - CROSS requires both operands length 3 → 'Invalid dimension'
     - Singular matrix to INV → 'Infinite result' (matches scalar INV)
     - Non-numeric entry reaching INV → 'Bad argument type' (symbolic
       matrix inverse is not supported; DET does tolerate symbolic
       entries because cofactor expansion routes through _scalarBinary
       which lifts Name/Symbolic to AST form).
   ================================================================ */

/** Cofactor-expansion determinant.  Works on any square row matrix
 *  whose entries are values `_scalarBinary` can add/subtract/multiply
 *  (so Real/Integer/Complex/Symbolic all compose — no Float coercion
 *  so Integer-only matrices stay Integer throughout). */
function _det(rows) {
  const n = rows.length;
  if (n === 1) return rows[0][0];
  if (n === 2) {
    const ad = _scalarBinary('*', rows[0][0], rows[1][1]);
    const bc = _scalarBinary('*', rows[0][1], rows[1][0]);
    return _scalarBinary('-', ad, bc);
  }
  // Laplace expansion along row 0.  O(n!), fine for HP50-sized inputs.
  let det = null;
  for (let j = 0; j < n; j++) {
    const minor = rows.slice(1).map(row => row.filter((_, k) => k !== j));
    const cof = _det(minor);
    let term = _scalarBinary('*', rows[0][j], cof);
    if ((j & 1) === 1) term = _scalarBinary('-', Real(0), term);
    det = (det === null) ? term : _scalarBinary('+', det, term);
  }
  return det;
}


register('DET', (s) => {
  const [m] = s.popN(1);
  if (!isMatrix(m)) throw new RPLError('Bad argument type');
  const n = m.rows.length;
  const cols = n > 0 ? m.rows[0].length : 0;
  if (n !== cols) throw new RPLError('Invalid dimension');
  if (n === 0) { s.push(Real(1)); return; }
  s.push(_det(m.rows));
}, { category: 'Vectors / matrices', categoryOrder: 2, label: "DET" });


register('DOT', (s) => {
  const [a, b] = s.popN(2);
  if (!isVector(a) || !isVector(b)) throw new RPLError('Bad argument type');
  if (a.items.length !== b.items.length) throw new RPLError('Invalid dimension');
  const parts = a.items.map((x, i) => _scalarBinary('*', x, b.items[i]));
  s.push(_scalarSum(parts));
}, { category: 'Vectors / matrices', categoryOrder: 9, label: "DOT" });


register('CROSS', (s) => {
  const [a, b] = s.popN(2);
  if (!isVector(a) || !isVector(b)) throw new RPLError('Bad argument type');
  if (a.items.length !== 3 || b.items.length !== 3) {
    throw new RPLError('Invalid dimension');
  }
  const [a0, a1, a2] = a.items;
  const [b0, b1, b2] = b.items;
  const c0 = _scalarBinary('-',
    _scalarBinary('*', a1, b2),
    _scalarBinary('*', a2, b1));
  const c1 = _scalarBinary('-',
    _scalarBinary('*', a2, b0),
    _scalarBinary('*', a0, b2));
  const c2 = _scalarBinary('-',
    _scalarBinary('*', a0, b1),
    _scalarBinary('*', a1, b0));
  s.push(Vector([c0, c1, c2]));
}, { category: 'Vectors / matrices', categoryOrder: 10, label: "CROSS" });


register('IDN', (s) => {
  const [v] = s.popN(1);
  let n;
  if (isInteger(v)) n = Number(v.value);
  else if (isReal(v)) {
    if (!v.value.isFinite() || !v.value.isInteger()) {
      throw new RPLError('Bad argument value');
    }
    n = v.value.toNumber();
  } else if (isMatrix(v)) {
    // HP50: IDN on a matrix uses its row count (must be square).
    n = v.rows.length;
    if (n > 0 && v.rows[0].length !== n) throw new RPLError('Invalid dimension');
  } else {
    throw new RPLError('Bad argument type');
  }
  if (n <= 0) throw new RPLError('Bad argument value');
  const rows = [];
  for (let i = 0; i < n; i++) {
    const row = new Array(n).fill(Real(0));
    row[i] = Real(1);
    rows.push(row);
  }
  s.push(Matrix(rows));
}, { category: 'Vectors / matrices', categoryOrder: 12, label: "IDN" });


register('NORM', (s) => {
  const [v] = s.popN(1);
  if (isVector(v)) {
    s.push(Real(_decimalFrobeniusNorm(v.items)));
    return;
  }
  if (isMatrix(v)) {
    // Frobenius norm = √(Σᵢⱼ mᵢⱼ²).
    s.push(Real(_decimalFrobeniusNorm(v.rows.flat())));
    return;
  }
  throw new RPLError('Bad argument type');
}, { category: 'Vectors / matrices', categoryOrder: 3, label: "NORM" });

register('→ARRY',  _toArrayOp, { category: 'Vectors / matrices', categoryOrder: 53, label: "→ARRY" });

register('ARRY→',  _fromArrayOp, { category: 'Vectors / matrices', categoryOrder: 54, label: "ARRY→" });

register('→V2',  _toV2Op, { category: 'Vectors / matrices', categoryOrder: 50, label: "→V2" });

register('→V3',  _toV3Op, { category: 'Vectors / matrices', categoryOrder: 51, label: "→V3" });

register('V→',  _fromVecOp, { category: 'Vectors / matrices', categoryOrder: 52, label: "V→" });


/* --------------- TRACE — matrix trace ---------------
   HP50 AUR §15.4.  Given a square Matrix, sum the main-diagonal
   entries and push the result as a scalar.  Uses `_scalarBinary('+', …)`
   (the same combiner DET uses) so mixed Integer / Real / Complex /
   Symbolic entries all compose — an integer-only matrix stays exactly
   integer.  Non-Matrix / non-square inputs throw.
   ----------------------------------------------------------------- */
register('TRACE', (s) => {
  const [m] = s.popN(1);
  if (!isMatrix(m)) throw new RPLError('Bad argument type');
  const rows = m.rows.length;
  const cols = rows > 0 ? m.rows[0].length : 0;
  if (rows !== cols) throw new RPLError('Invalid dimension');
  if (rows === 0) { s.push(Real(0)); return; }
  let acc = m.rows[0][0];
  for (let i = 1; i < rows; i++) {
    acc = _scalarBinary('+', acc, m.rows[i][i]);
  }
  s.push(acc);
}, { category: 'Vectors / matrices', categoryOrder: 6, label: "TRACE" });


/* --------------- RREF / RANK — row reduction and rank --------------
   HP50 AUR §15.4.  RREF produces the reduced-row-echelon form of its
   argument Matrix; RANK counts the non-zero rows of the RREF.

   Reuses the Gauss-Jordan machinery from `_invMatrixNumeric` but
   without the augmented-identity trick (since we only care about the
   left-hand side).  Handles rectangular (m×n with m ≠ n) matrices:
   the inversion path requires square but RREF does not.  Works on
   Real / Integer entries; Complex / Symbolic entries throw
   `Bad argument type` (same policy as INV).

   RANK counts the rows whose max |entry| exceeds a small tolerance
   (1e-10 times the row's 1-norm-scale).  This is the usual numerical
   rank definition — bit-exact zero tests are fragile after floating-
   point row ops.
   ----------------------------------------------------------------- */
function _rrefNumeric(rows) {
  const m = rows.length;
  if (m === 0) return [];
  const n = rows[0].length;
  for (const row of rows) {
    if (row.length !== n) throw new RPLError('Invalid dimension');
    for (const x of row) {
      if (!isReal(x) && !isInteger(x)) {
        throw new RPLError('Bad argument type');
      }
    }
  }
  // Convert to a mutable 2-D array of JS numbers.
  const a = rows.map(row => row.map(x => isInteger(x) ? Number(x.value) : x.value));
  // Standard Gauss-Jordan elimination with partial pivoting.
  let r = 0; // current pivot row
  for (let c = 0; c < n && r < m; c++) {
    // Find pivot in column c, rows >= r.
    let best = r, bestAbs = Math.abs(a[r][c]);
    for (let i = r + 1; i < m; i++) {
      const v = Math.abs(a[i][c]);
      if (v > bestAbs) { best = i; bestAbs = v; }
    }
    if (bestAbs < 1e-12) continue;           // column is already clean
    if (best !== r) {
      [a[r], a[best]] = [a[best], a[r]];
    }
    const piv = a[r][c];
    for (let j = 0; j < n; j++) a[r][j] /= piv;
    a[r][c] = 1;                             // kill residual FP noise
    for (let i = 0; i < m; i++) {
      if (i === r) continue;
      const f = a[i][c];
      if (Math.abs(f) < 1e-15) continue;
      for (let j = 0; j < n; j++) a[i][j] -= f * a[r][j];
      a[i][c] = 0;                           // kill residual FP noise
    }
    r++;
  }
  return a;
}


function _numericRank(rrefArr) {
  // Row is non-zero if any entry exceeds the tolerance.
  let k = 0;
  for (const row of rrefArr) {
    let maxAbs = 0;
    for (const x of row) {
      const v = Math.abs(x);
      if (v > maxAbs) maxAbs = v;
    }
    if (maxAbs > 1e-10) k++;
  }
  return k;
}


register('RREF', (s) => {
  const [v] = s.popN(1);
  if (!isMatrix(v)) throw new RPLError('Bad argument type');
  const out = _rrefNumeric(v.rows);
  s.push(Matrix(out.map(row => row.map(x => Real(x)))));
}, { category: 'Vectors / matrices', categoryOrder: 17, label: "RREF" });


register('RANK', (s) => {
  const [v] = s.popN(1);
  if (!isMatrix(v)) throw new RPLError('Bad argument type');
  const out = _rrefNumeric(v.rows);
  s.push(Integer(BigInt(_numericRank(out))));
}, { category: 'Vectors / matrices', categoryOrder: 8, label: "RANK" });


/* --------------- CON — constant-fill matrix / vector ------------------
   HP50 AUR §15.2.  Two stack signatures:

     n      value   →  Vector         (n-long vector filled with value)
     {n}    value   →  Vector
     {m n}  value   →  Matrix         (m×n matrix filled with value)
     M      value   →  Matrix'        (M's shape, every entry replaced)
     V      value   →  Vector'        (V's shape, every entry replaced)

   `value` is a scalar (Real / Integer / Complex / Symbolic) — no nested
   containers.  The count/shape element may be Integer or Real (any
   non-negative integer-valued Real).  Integer shape stays Integer when
   fed back via SIZE → CON round-trip; Real values stay Real.

   Error surface:
     - shape-list neither {n} nor {m n}  →  Invalid dimension
     - count <= 0 for a dimension        →  Bad argument value
     - scalar-wrapped non-scalar value   →  Bad argument type
   ----------------------------------------------------------------- */

function _conShapeFrom(v) {
  // Returns {m,n} where n===null means "vector of length m".  Accepts
  // Integer, Real (integer-valued), {n}, {m n}, Vector, Matrix.
  if (isInteger(v))           return { m: Number(v.value), n: null };
  if (isReal(v)) {
    if (!v.value.isInteger()) throw new RPLError('Bad argument value');
    return { m: v.value.toNumber(), n: null };
  }
  if (isList(v)) {
    if (v.items.length === 1) {
      const k = v.items[0];
      if (isInteger(k))       return { m: Number(k.value), n: null };
      if (isReal(k) && k.value.isInteger()) return { m: k.value.toNumber(), n: null };
      throw new RPLError('Bad argument type');
    }
    if (v.items.length === 2) {
      const [a, b] = v.items;
      const mm = isInteger(a) ? Number(a.value)
               : (isReal(a) && a.value.isInteger()) ? a.value.toNumber()
               : (() => { throw new RPLError('Bad argument type'); })();
      const nn = isInteger(b) ? Number(b.value)
               : (isReal(b) && b.value.isInteger()) ? b.value.toNumber()
               : (() => { throw new RPLError('Bad argument type'); })();
      return { m: mm, n: nn };
    }
    throw new RPLError('Invalid dimension');
  }
  if (isVector(v))  return { m: v.items.length, n: null };
  if (isMatrix(v))  {
    return { m: v.rows.length, n: v.rows.length > 0 ? v.rows[0].length : 0 };
  }
  throw new RPLError('Bad argument type');
}


register('CON', (s) => {
  const [shape, value] = s.popN(2);
  // The value must be a scalar-ish thing: Real, Integer, Complex, or Symbolic.
  // Reject nested containers / strings / etc. — HP50 CON is scalar-fill.
  if (!(isReal(value) || isInteger(value) || isComplex(value) || isSymbolic(value))) {
    throw new RPLError('Bad argument type');
  }
  const { m, n } = _conShapeFrom(shape);
  if (m <= 0) throw new RPLError('Bad argument value');
  if (n !== null && n <= 0) throw new RPLError('Bad argument value');
  if (n === null) {
    s.push(Vector(new Array(m).fill(value)));
  } else {
    const rows = [];
    for (let i = 0; i < m; i++) rows.push(new Array(n).fill(value));
    s.push(Matrix(rows));
  }
}, { category: 'Vectors / matrices', categoryOrder: 13, label: "CON" });



/* =================================================================
   REF, HADAMARD, RANM, LSQ.

   All items user-reachable from the typed catalog today.  No UI
   wiring changes.  Advanced Guide refs:
     §15.4  (REF — row echelon form, Gaussian elimination)
     §15.6  (HADAMARD — element-wise matrix product)
     §15.2  (RANM — random-integer matrix/vector of given shape)
     §15.4  (LSQ — minimum-norm least-squares solution of A x = b)
   ================================================================= */

/* --------------- REF — row echelon form (Gaussian elimination) -----
   HP50 AUR §15.4.  REF produces an upper-triangular row echelon form
   of its argument Matrix via Gaussian elimination with partial
   pivoting.  Unlike RREF, REF does NOT back-substitute to clear the
   entries above each pivot — so pivots stay 1 and entries above them
   can be any real.  For a 2×2 with row2 = 2·row1, REF → [[1 2][0 0]]
   is identical to RREF's output (same zero row); but for [[1 2][3 4]],
   REF → [[1 2][0 1]] (upper triangular), while RREF → [[1 0][0 1]].

   Shares the `_rrefNumeric` loop but with the above-pivot elimination
   step disabled via a `fullReduction` flag.
   ----------------------------------------------------------------- */
function _refNumeric(rows) {
  // Gaussian elimination WITHOUT back-substitution (REF, not RREF).
  // Structurally identical to `_rrefNumeric` but `i < r` rows are
  // left alone — only rows strictly below the pivot row get zeroed.
  const m = rows.length;
  if (m === 0) return [];
  const n = rows[0].length;
  for (const row of rows) {
    if (row.length !== n) throw new RPLError('Invalid dimension');
    for (const x of row) {
      if (!isReal(x) && !isInteger(x)) {
        throw new RPLError('Bad argument type');
      }
    }
  }
  const a = rows.map(row => row.map(x => isInteger(x) ? Number(x.value) : x.value));
  let r = 0;
  for (let c = 0; c < n && r < m; c++) {
    let best = r, bestAbs = Math.abs(a[r][c]);
    for (let i = r + 1; i < m; i++) {
      const v = Math.abs(a[i][c]);
      if (v > bestAbs) { best = i; bestAbs = v; }
    }
    if (bestAbs < 1e-12) continue;
    if (best !== r) [a[r], a[best]] = [a[best], a[r]];
    const piv = a[r][c];
    for (let j = 0; j < n; j++) a[r][j] /= piv;
    a[r][c] = 1;                           // kill residual FP noise on pivot
    // Eliminate BELOW the pivot only — that's the REF vs RREF difference.
    for (let i = r + 1; i < m; i++) {
      const f = a[i][c];
      if (Math.abs(f) < 1e-15) continue;
      for (let j = 0; j < n; j++) a[i][j] -= f * a[r][j];
      a[i][c] = 0;
    }
    r++;
  }
  return a;
}


register('REF', (s) => {
  const [v] = s.popN(1);
  if (!isMatrix(v)) throw new RPLError('Bad argument type');
  const out = _refNumeric(v.rows);
  s.push(Matrix(out.map(row => row.map(x => Real(x)))));
}, { category: 'Vectors / matrices', categoryOrder: 16, label: "REF" });


/* --------------- HADAMARD — element-wise matrix/vector product ------
   HP50 AUR §15.6.  HADAMARD takes two matrices (or two vectors) of
   the same shape and returns a result of the same shape whose (i,j)
   entry is the product of the two inputs' (i,j) entries.  Distinct
   from the default `*` which treats two matrices as matrix-multiply
   and two vectors as dot product.

   Dispatches through `_scalarBinary('*', a, b)` so Integer / Real /
   Complex / Symbolic entries compose naturally.
   ----------------------------------------------------------------- */
register('HADAMARD', (s) => {
  const [a, b] = s.popN(2);
  if (isVector(a) && isVector(b)) {
    if (a.items.length !== b.items.length) throw new RPLError('Invalid dimension');
    const out = a.items.map((x, i) => _scalarBinary('*', x, b.items[i]));
    s.push(Vector(out));
    return;
  }
  if (isMatrix(a) && isMatrix(b)) {
    const ma = a.rows.length, na = ma > 0 ? a.rows[0].length : 0;
    const mb = b.rows.length, nb = mb > 0 ? b.rows[0].length : 0;
    if (ma !== mb || na !== nb) throw new RPLError('Invalid dimension');
    const rows = [];
    for (let i = 0; i < ma; i++) {
      const row = [];
      for (let j = 0; j < na; j++) {
        row.push(_scalarBinary('*', a.rows[i][j], b.rows[i][j]));
      }
      rows.push(row);
    }
    s.push(Matrix(rows));
    return;
  }
  throw new RPLError('Bad argument type');
}, { category: 'Vectors / matrices', categoryOrder: 11, label: "HADAMARD" });


/* --------------- RANM — random-integer matrix/vector ----------------
   HP50 AUR §15.2.  RANM takes a shape specifier (same forms as CON)
   and returns a Matrix (or Vector) of random integers in the range
   [-9, 9] — matching the HP50 documented behaviour.

   Shape inputs accepted (mirrors `_conShapeFrom`):
     n       →  Vector of length n
     {n}     →  Vector of length n
     {m n}   →  m×n Matrix
     V       →  Vector of V's length
     M       →  Matrix of M's shape

   RNG: shared seeded LCG in state.js (`nextPrngInt9`).  RANM shares
   state with RAND and RDZ so `RDZ 12345 { 2 3 } RANM` produces a
   deterministic matrix — exactly matching HP50 semantics where the
   same seed always regenerates the same random matrix.  Tests pin the
   seed at session boot via resetPrng() so draws are reproducible.
   ----------------------------------------------------------------- */

register('RANM', (s) => {
  const [shape] = s.popN(1);
  const { m, n } = _conShapeFrom(shape);
  if (m <= 0) throw new RPLError('Bad argument value');
  if (n !== null && n <= 0) throw new RPLError('Bad argument value');
  if (n === null) {
    const v = [];
    for (let i = 0; i < m; i++) v.push(Real(nextPrngInt9()));
    s.push(Vector(v));
  } else {
    const rows = [];
    for (let i = 0; i < m; i++) {
      const row = [];
      for (let j = 0; j < n; j++) row.push(Real(nextPrngInt9()));
      rows.push(row);
    }
    s.push(Matrix(rows));
  }
}, { category: 'Vectors / matrices', categoryOrder: 14, label: "RANM" });


/* --------------- LSQ — least-squares solver -------------------------
   HP50 AUR §15.4.  LSQ solves A x = b in the least-squares sense.
   Stack layout: level 2 = b, level 1 = A.  Returns x.

   Three shape regimes (rows m, cols n of A):
     m = n (square):           x = A^-1 b   — direct solve via
                               Gauss-Jordan.  Singular → throws
                               `Infinite result` (inherits the
                               `_invMatrixNumeric` rejection).
     m > n (overdetermined):   normal equations (A^T A) x = A^T b.
                               Unique x whenever A has full column
                               rank.
     m < n (underdetermined):  minimum-norm solution via A^T (A A^T)^-1 b.
                               Unique x whenever A has full row rank.

   b may be a Vector of length m (single RHS → Vector x of length n)
   or a Matrix with m rows (multiple RHS → Matrix x with n rows).  The
   current implementation handles the Vector-b case directly; Matrix-b
   loops over its columns.

   Only numeric (Real / Integer) entries are accepted on both sides,
   matching the `_invMatrixNumeric` rejection policy.
   ----------------------------------------------------------------- */
function _asNumArray2D(rows) {
  // rows is Array<Array<RPLValue>>.  Returns Array<Array<number>>;
  // throws Bad argument type on any non-Real/non-Integer entry.
  return rows.map(row => row.map(x => {
    if (isInteger(x)) return Number(x.value);
    if (isReal(x)) return x.value.toNumber();
    throw new RPLError('Bad argument type');
  }));
}


function _asNumArray1D(items) {
  return items.map(x => {
    if (isInteger(x)) return Number(x.value);
    if (isReal(x)) return x.value.toNumber();
    throw new RPLError('Bad argument type');
  });
}


function _matMulNum(a, b) {
  // Plain 2-D number arrays; a is m×k, b is k×n → m×n.
  const m = a.length;
  const k = a[0].length;
  const n = b[0].length;
  const out = [];
  for (let i = 0; i < m; i++) {
    const row = new Array(n).fill(0);
    for (let p = 0; p < k; p++) {
      const aip = a[i][p];
      if (aip === 0) continue;
      for (let j = 0; j < n; j++) row[j] += aip * b[p][j];
    }
    out.push(row);
  }
  return out;
}


function _matVecNum(a, v) {
  // a is m×n, v is length n → length m.
  const m = a.length;
  const n = a[0].length;
  const out = new Array(m).fill(0);
  for (let i = 0; i < m; i++) {
    let acc = 0;
    for (let j = 0; j < n; j++) acc += a[i][j] * v[j];
    out[i] = acc;
  }
  return out;
}


function _transposeNum(a) {
  const m = a.length;
  const n = a[0].length;
  const out = [];
  for (let j = 0; j < n; j++) {
    const row = new Array(m);
    for (let i = 0; i < m; i++) row[i] = a[i][j];
    out.push(row);
  }
  return out;
}


function _invSquareNum(a) {
  // Plain-number Gauss-Jordan invert.  Throws Infinite result if
  // singular (mirrors `_invMatrixNumeric`).  Pure-number helper for
  // LSQ internals — doesn't box/unbox Real wrappers.
  const n = a.length;
  const ext = a.map(r => r.slice());
  const I = [];
  for (let i = 0; i < n; i++) {
    const row = new Array(n).fill(0);
    row[i] = 1;
    I.push(row);
  }
  for (let k = 0; k < n; k++) {
    let best = k, bestAbs = Math.abs(ext[k][k]);
    for (let i = k + 1; i < n; i++) {
      const v = Math.abs(ext[i][k]);
      if (v > bestAbs) { best = i; bestAbs = v; }
    }
    if (bestAbs < 1e-12) throw new RPLError('Infinite result');
    if (best !== k) {
      [ext[k], ext[best]] = [ext[best], ext[k]];
      [I[k], I[best]] = [I[best], I[k]];
    }
    const piv = ext[k][k];
    for (let j = 0; j < n; j++) { ext[k][j] /= piv; I[k][j] /= piv; }
    for (let i = 0; i < n; i++) {
      if (i === k) continue;
      const f = ext[i][k];
      if (f === 0) continue;
      for (let j = 0; j < n; j++) {
        ext[i][j] -= f * ext[k][j];
        I[i][j] -= f * I[k][j];
      }
    }
  }
  return I;
}


function _lsqSolveVec(Anum, bnum) {
  // Anum: m×n, bnum: length m.  Returns length-n solution vector.
  const m = Anum.length;
  const n = Anum[0].length;
  if (m === n) {
    const invA = _invSquareNum(Anum);
    return _matVecNum(invA, bnum);
  }
  if (m > n) {
    // Overdetermined: normal equations (A^T A) x = A^T b.
    const At = _transposeNum(Anum);
    const AtA = _matMulNum(At, Anum);           // n×n
    const Atb = _matVecNum(At, bnum);           // length n
    const invAtA = _invSquareNum(AtA);
    return _matVecNum(invAtA, Atb);
  }
  // Underdetermined: minimum-norm x = A^T (A A^T)^-1 b.
  const At = _transposeNum(Anum);
  const AAt = _matMulNum(Anum, At);            // m×m
  const invAAt = _invSquareNum(AAt);
  const y = _matVecNum(invAAt, bnum);          // length m
  return _matVecNum(At, y);                    // length n
}


register('LSQ', (s) => {
  const [b, A] = s.popN(2);
  if (!isMatrix(A)) throw new RPLError('Bad argument type');
  const Anum = _asNumArray2D(A.rows);
  const m = Anum.length;
  if (m === 0) throw new RPLError('Invalid dimension');
  const n = Anum[0].length;

  if (isVector(b)) {
    if (b.items.length !== m) throw new RPLError('Invalid dimension');
    const bnum = _asNumArray1D(b.items);
    const x = _lsqSolveVec(Anum, bnum);
    s.push(Vector(x.map(v => Real(v))));
    return;
  }
  if (isMatrix(b)) {
    if (b.rows.length !== m) throw new RPLError('Invalid dimension');
    const bnum = _asNumArray2D(b.rows);
    const k = b.rows[0].length;
    // Column-by-column: build X with n rows and k columns.
    const cols = [];
    for (let c = 0; c < k; c++) {
      const bc = new Array(m);
      for (let i = 0; i < m; i++) bc[i] = bnum[i][c];
      cols.push(_lsqSolveVec(Anum, bc));
    }
    const rowsOut = [];
    for (let i = 0; i < n; i++) {
      const row = new Array(k);
      for (let c = 0; c < k; c++) row[c] = Real(cols[c][i]);
      rowsOut.push(row);
    }
    s.push(Matrix(rowsOut));
    return;
  }
  throw new RPLError('Bad argument type');
}, { category: 'Vectors / matrices', categoryOrder: 15, label: "LSQ" });


register('ROW+', (s) => {
  const [M, vec, idx] = s.popN(3);
  if (!isMatrix(M)) throw new RPLError('Bad argument type');
  if (!isVector(vec)) throw new RPLError('Bad argument type');
  const n = _indexAsInt(idx, 'ROW+');
  const m = M.rows.length;
  const cols = m > 0 ? M.rows[0].length : 0;
  if (vec.items.length !== cols) throw new RPLError('Invalid dimension');
  if (n < 1 || n > m + 1) throw new RPLError('Invalid dimension');
  const newRow = vec.items.slice();
  const out = M.rows.map(r => r.slice());
  out.splice(n - 1, 0, newRow);
  s.push(Matrix(out));
}, { category: 'Vectors / matrices', categoryOrder: 20, label: "ROW+" });


register('ROW-', (s) => {
  const [M, idx] = s.popN(2);
  if (!isMatrix(M)) throw new RPLError('Bad argument type');
  const n = _indexAsInt(idx, 'ROW-');
  const m = M.rows.length;
  if (n < 1 || n > m) throw new RPLError('Invalid dimension');
  const rows = M.rows.map(r => r.slice());
  const removed = rows.splice(n - 1, 1)[0];
  s.push(Matrix(rows));
  s.push(Vector(removed));
}, { category: 'Vectors / matrices', categoryOrder: 21, label: "ROW-" });


register('COL+', (s) => {
  const [M, vec, idx] = s.popN(3);
  if (!isMatrix(M)) throw new RPLError('Bad argument type');
  if (!isVector(vec)) throw new RPLError('Bad argument type');
  const n = _indexAsInt(idx, 'COL+');
  const m = M.rows.length;
  const cols = m > 0 ? M.rows[0].length : 0;
  if (vec.items.length !== m) throw new RPLError('Invalid dimension');
  if (n < 1 || n > cols + 1) throw new RPLError('Invalid dimension');
  const out = [];
  for (let i = 0; i < m; i++) {
    const row = M.rows[i].slice();
    row.splice(n - 1, 0, vec.items[i]);
    out.push(row);
  }
  s.push(Matrix(out));
}, { category: 'Vectors / matrices', categoryOrder: 22, label: "COL+" });


register('COL-', (s) => {
  const [M, idx] = s.popN(2);
  if (!isMatrix(M)) throw new RPLError('Bad argument type');
  const n = _indexAsInt(idx, 'COL-');
  const m = M.rows.length;
  const cols = m > 0 ? M.rows[0].length : 0;
  if (n < 1 || n > cols) throw new RPLError('Invalid dimension');
  const rows = [];
  const removedCol = [];
  for (let i = 0; i < m; i++) {
    const row = M.rows[i].slice();
    removedCol.push(row[n - 1]);
    row.splice(n - 1, 1);
    rows.push(row);
  }
  s.push(Matrix(rows));
  s.push(Vector(removedCol));
}, { category: 'Vectors / matrices', categoryOrder: 23, label: "COL-" });


/* --------------- CNRM / RNRM — column / row max-sum norms -----------
   HP50 AUR §15.4.

   CNRM  (column norm): max over columns of the sum of absolute values
         of the column's entries.  Matrix input: max_j Σ_i |A[i][j]|.
         Vector input: sum of |entries| (equivalent to treating the
         Vector as a column matrix).  Standard "1-norm" of a matrix.

   RNRM  (row norm):   max over rows of the sum of absolute values of
         the row's entries.  Matrix input: max_i Σ_j |A[i][j]|.
         Vector input: max of |entries| (equivalent to treating the
         Vector as a row matrix).  Standard "∞-norm" of a matrix.

   Entry type policy: Real / Integer / Complex.  Symbolic entries
   throw Bad argument type (no magnitude function for arbitrary
   Symbolic expressions this cheap; lift is a CAS job).  Same policy
   as NORM.
   ----------------------------------------------------------------- */

function _magEntry(x) {
  // |x| for a numeric matrix/vector cell.  Throws Bad argument type
  // on Symbolic / other non-numeric.
  if (isReal(x)) return x.value.abs().toNumber();
  if (isInteger(x)) { const n = x.value; return Number(n < 0n ? -n : n); }
  if (isComplex(x)) return Math.hypot(x.re, x.im);
  throw new RPLError('Bad argument type');
}


register('CNRM', (s) => {
  const [v] = s.popN(1);
  if (isVector(v)) {
    // Sum of |entries| — treat vector as a column.
    let sum = 0;
    for (const x of v.items) sum += _magEntry(x);
    s.push(Real(sum));
    return;
  }
  if (isMatrix(v)) {
    const m = v.rows.length;
    if (m === 0) { s.push(Real(0)); return; }
    const cols = v.rows[0].length;
    let best = 0;
    for (let j = 0; j < cols; j++) {
      let sum = 0;
      for (let i = 0; i < m; i++) sum += _magEntry(v.rows[i][j]);
      if (sum > best) best = sum;
    }
    s.push(Real(best));
    return;
  }
  throw new RPLError('Bad argument type');
}, { category: 'Vectors / matrices', categoryOrder: 4, label: "CNRM" });


register('RNRM', (s) => {
  const [v] = s.popN(1);
  if (isVector(v)) {
    // Max of |entries| — treat vector as a row.
    let best = 0;
    for (const x of v.items) {
      const mag = _magEntry(x);
      if (mag > best) best = mag;
    }
    s.push(Real(best));
    return;
  }
  if (isMatrix(v)) {
    const m = v.rows.length;
    if (m === 0) { s.push(Real(0)); return; }
    let best = 0;
    for (const row of v.rows) {
      let sum = 0;
      for (const x of row) sum += _magEntry(x);
      if (sum > best) best = sum;
    }
    s.push(Real(best));
    return;
  }
  throw new RPLError('Bad argument type');
}, { category: 'Vectors / matrices', categoryOrder: 5, label: "RNRM" });


/* --------------- AUGMENT — horizontal concat ------------------------
   HP50 AUR §15.3.  Concatenate two matrices or a matrix + vector
   horizontally (along the column axis).

   Signatures:
     ( M_a M_b       →  M  )   Matrix + Matrix (same row count)
                                → m × (p_a + p_b) matrix
     ( M v           →  M  )   Matrix + Vector  (len v = row count)
                                → append v as a new column
     ( v M           →  M  )   Vector + Matrix  (HP50 symmetry)
                                → prepend v as a new column
     ( v_a v_b       →  v  )   Vector + Vector  — HP50 AUR also
                                documents this; concatenates entries.

   Mismatched row count → Invalid dimension.  Other type combos →
   Bad argument type.
   ----------------------------------------------------------------- */

register('AUGMENT', (s) => {
  const [a, b] = s.popN(2);
  // Matrix + Matrix: same row count → concat columns.
  if (isMatrix(a) && isMatrix(b)) {
    const ma = a.rows.length;
    const mb = b.rows.length;
    if (ma !== mb) throw new RPLError('Invalid dimension');
    const rows = [];
    for (let i = 0; i < ma; i++) {
      rows.push([...a.rows[i], ...b.rows[i]]);
    }
    s.push(Matrix(rows));
    return;
  }
  // Matrix + Vector: vector length = row count → append as column.
  if (isMatrix(a) && isVector(b)) {
    const ma = a.rows.length;
    if (b.items.length !== ma) throw new RPLError('Invalid dimension');
    const rows = [];
    for (let i = 0; i < ma; i++) {
      rows.push([...a.rows[i], b.items[i]]);
    }
    s.push(Matrix(rows));
    return;
  }
  // Vector + Matrix: vector length = row count → prepend as column.
  if (isVector(a) && isMatrix(b)) {
    const mb = b.rows.length;
    if (a.items.length !== mb) throw new RPLError('Invalid dimension');
    const rows = [];
    for (let i = 0; i < mb; i++) {
      rows.push([a.items[i], ...b.rows[i]]);
    }
    s.push(Matrix(rows));
    return;
  }
  // Vector + Vector: concat entries.
  if (isVector(a) && isVector(b)) {
    s.push(Vector([...a.items, ...b.items]));
    return;
  }
  throw new RPLError('Bad argument type');
}, { category: 'Vectors / matrices', categoryOrder: 18, label: "AUGMENT" });

register('ROW→',  _rowDecompose, { category: 'Vectors / matrices', categoryOrder: 24, label: "ROW→" });

register('→ROW',  _rowCompose, { category: 'Vectors / matrices', categoryOrder: 25, label: "→ROW" });

register('COL→',  _colDecompose, { category: 'Vectors / matrices', categoryOrder: 26, label: "COL→" });

register('→COL',  _colCompose, { category: 'Vectors / matrices', categoryOrder: 27, label: "→COL" });


/* --------------- RSWP / CSWP / RCI / RCIJ --------------------------
   HP50 AUR §15.3.  Elementary row / column operations.  These are the
   "Gauss-Jordan by hand" primitives: swap two rows, swap two columns,
   scale a row by a constant, or add a scalar multiple of one row to
   another.

   RSWP  ( M i j → M' )   Swap rows i and j (1-based).
   CSWP  ( M i j → M' )   Swap columns i and j.
   RCI   ( M c i → M' )   Replace row i with c * row i (scalar c).
   RCIJ  ( M c i j → M' ) Replace row j with row j + c * row i.

   Index ranges are validated against m (rows) or n (cols); out-of-range
   throws Invalid dimension.  Non-integer or non-numeric indices throw
   Bad argument type via `_indexAsInt`.  The scalar c in RCI / RCIJ can
   be any scalar operand (Real, Integer, Complex, BinaryInteger, or
   Symbolic / Name) — `_scalarBinary('*' / '+', ...)` handles the
   promotion / symbolic-lift uniformly, same as the existing arithmetic
   ops on Matrix entries do.
   ----------------------------------------------------------------- */

register('RSWP', (s) => {
  const [M, iv, jv] = s.popN(3);
  if (!isMatrix(M)) throw new RPLError('Bad argument type');
  const i = _indexAsInt(iv, 'RSWP');
  const j = _indexAsInt(jv, 'RSWP');
  const m = M.rows.length;
  if (i < 1 || i > m || j < 1 || j > m) {
    throw new RPLError('Invalid dimension');
  }
  const rows = M.rows.map(r => r.slice());
  if (i !== j) {
    const tmp = rows[i - 1]; rows[i - 1] = rows[j - 1]; rows[j - 1] = tmp;
  }
  s.push(Matrix(rows));
}, { category: 'Vectors / matrices', categoryOrder: 28, label: "RSWP" });


register('CSWP', (s) => {
  const [M, iv, jv] = s.popN(3);
  if (!isMatrix(M)) throw new RPLError('Bad argument type');
  const i = _indexAsInt(iv, 'CSWP');
  const j = _indexAsInt(jv, 'CSWP');
  const m = M.rows.length;
  const cols = m > 0 ? M.rows[0].length : 0;
  if (i < 1 || i > cols || j < 1 || j > cols) {
    throw new RPLError('Invalid dimension');
  }
  const rows = M.rows.map(r => r.slice());
  if (i !== j) {
    for (let k = 0; k < m; k++) {
      const t = rows[k][i - 1]; rows[k][i - 1] = rows[k][j - 1]; rows[k][j - 1] = t;
    }
  }
  s.push(Matrix(rows));
}, { category: 'Vectors / matrices', categoryOrder: 29, label: "CSWP" });


register('RCI', (s) => {
  const [M, c, iv] = s.popN(3);
  if (!isMatrix(M)) throw new RPLError('Bad argument type');
  if (!_isScalarOperand(c)) throw new RPLError('Bad argument type');
  const i = _indexAsInt(iv, 'RCI');
  const m = M.rows.length;
  if (i < 1 || i > m) throw new RPLError('Invalid dimension');
  const rows = M.rows.map(r => r.slice());
  const target = rows[i - 1];
  for (let k = 0; k < target.length; k++) {
    target[k] = _scalarBinary('*', c, target[k]);
  }
  s.push(Matrix(rows));
}, { category: 'Vectors / matrices', categoryOrder: 30, label: "RCI" });


register('RCIJ', (s) => {
  const [M, c, iv, jv] = s.popN(4);
  if (!isMatrix(M)) throw new RPLError('Bad argument type');
  if (!_isScalarOperand(c)) throw new RPLError('Bad argument type');
  const i = _indexAsInt(iv, 'RCIJ');
  const j = _indexAsInt(jv, 'RCIJ');
  const m = M.rows.length;
  if (i < 1 || i > m || j < 1 || j > m) {
    throw new RPLError('Invalid dimension');
  }
  // HP50 accepts i === j (becomes "scale row_i by (1+c)") — we follow
  // suit.  The copy below uses the ORIGINAL i-row values, so the self-
  // add case `row_i + c*row_i` still reads from the pre-update row
  // even though src and dst alias the same row.
  const origSrc = M.rows[i - 1].slice();
  const rows = M.rows.map(r => r.slice());
  const dst = rows[j - 1];
  for (let k = 0; k < dst.length; k++) {
    const scaled = _scalarBinary('*', c, origSrc[k]);
    dst[k] = _scalarBinary('+', dst[k], scaled);
  }
  s.push(Matrix(rows));
}, { category: 'Vectors / matrices', categoryOrder: 31, label: "RCIJ" });


/* --------------- VANDERMONDE / HILBERT — test matrices ---------------
   HP50 AUR §15.6.  Canonical constructors for classical test
   matrices — primarily used for polynomial-interpolation problems
   and as demonstrations of ill-conditioning.

     VANDERMONDE  ( L → M )   L = {v₁ v₂ … vₙ} of n numeric values.
                              Returns the n×n matrix whose (i, j)
                              entry is  vᵢ^(j-1)  (so column 1 is
                              all ones; column 2 is the values
                              themselves; column 3 is their squares;
                              etc.).  HP50 also accepts Vector input.
     HILBERT      ( n → M )   Integer n ≥ 1.  Returns the n×n Hilbert
                              matrix with H[i][j] = 1/(i+j-1)
                              (1-based indexing).  Notoriously
                              ill-conditioned beyond n ≈ 11; we
                              still accept arbitrary n but emit
                              IEEE-rounded entries past that point.

   Entry-type policy: VANDERMONDE tolerates Real / Integer / Complex /
   Symbolic values in the source list — powers are computed through
   `_scalarBinary('*')` so any type flows through (Symbolic inputs
   produce a Symbolic-entry matrix, e.g. `{ X Y Z } VANDERMONDE` →
   [[1 X X²][1 Y Y²][1 Z Z²]]).  HILBERT always produces Real
   entries — the inverse is expressed as decimal fractions rather
   than rationals.
   ----------------------------------------------------------------- */

register('VANDERMONDE', (s) => {
  const [v] = s.popN(1);
  let src;
  if (isList(v))        src = v.items;
  else if (isVector(v)) src = v.items;
  else throw new RPLError('Bad argument type');
  const n = src.length;
  if (n < 1) throw new RPLError('Bad argument value');
  for (const x of src) {
    // Sanity-check the type up front so a bad entry near the end
    // doesn't leave a half-built matrix on the stack.
    if (!isReal(x) && !isInteger(x) && !isComplex(x) && !_isSymOperand(x)) {
      throw new RPLError('Bad argument type');
    }
  }
  const rows = [];
  for (let i = 0; i < n; i++) {
    const vi = src[i];
    const row = new Array(n);
    // Column j has entry vi^(j-1).  Running multiplier avoids repeated
    // `^` ops and keeps Integer entries as Integers when possible
    // (since `_scalarBinary('*', Integer, Integer)` stays Integer).
    let acc = Integer(1n);
    for (let j = 0; j < n; j++) {
      row[j] = acc;
      if (j < n - 1) acc = _scalarBinary('*', acc, vi);
    }
    rows.push(row);
  }
  s.push(Matrix(rows));
}, { category: 'Vectors / matrices', categoryOrder: 42, label: "VANDERMONDE" });


register('HILBERT', (s) => {
  const [v] = s.popN(1);
  let n;
  if (isInteger(v)) n = Number(v.value);
  else if (isReal(v)) {
    if (!v.value.isFinite() || !v.value.isInteger()) {
      throw new RPLError('Bad argument value');
    }
    n = v.value.toNumber();
  } else throw new RPLError('Bad argument type');
  if (n < 1) throw new RPLError('Bad argument value');
  const rows = [];
  for (let i = 1; i <= n; i++) {
    const row = new Array(n);
    for (let j = 1; j <= n; j++) {
      row[j - 1] = Real(1 / (i + j - 1));
    }
    rows.push(row);
  }
  s.push(Matrix(rows));
}, { category: 'Vectors / matrices', categoryOrder: 43, label: "HILBERT" });


/* --------------- LU — LU decomposition with partial pivoting ---------
   HP50 AUR §15.3.

     LU  ( A → L U P )   A is an n×n Matrix; L is lower-triangular
                         with unit diagonal, U is upper-triangular,
                         P is the permutation matrix with P·A = L·U.
                         Real / Integer entries only (matching
                         `_invMatrixNumeric` / LSQ rejection policy).
                         Singular A → Infinite result.
                         Non-square A → Invalid dimension.

   Algorithm: Doolittle-style LU with partial pivoting (row
   interchanges).  We track the permutation as a 1-D index array
   `piv[i]` meaning "row i of P·A = row piv[i] of A", and materialize
   the full P matrix at the end.
   ----------------------------------------------------------------- */

register('LU', (s) => {
  const [A] = s.popN(1);
  if (!isMatrix(A)) throw new RPLError('Bad argument type');
  const n = A.rows.length;
  if (n === 0 || A.rows[0].length !== n) {
    throw new RPLError('Invalid dimension');
  }
  // Copy to plain-number working array; rejects non-numeric entries.
  const M = _asNumArray2D(A.rows).map(r => r.slice());
  const piv = new Array(n);
  for (let i = 0; i < n; i++) piv[i] = i;
  for (let k = 0; k < n; k++) {
    // Partial-pivot: largest |M[i][k]| over i = k..n-1.
    let best = k, bestAbs = Math.abs(M[k][k]);
    for (let i = k + 1; i < n; i++) {
      const v = Math.abs(M[i][k]);
      if (v > bestAbs) { best = i; bestAbs = v; }
    }
    if (bestAbs < 1e-14) throw new RPLError('Infinite result');
    if (best !== k) {
      [M[k], M[best]] = [M[best], M[k]];
      [piv[k], piv[best]] = [piv[best], piv[k]];
    }
    // Elimination: M[i][k] ← M[i][k]/M[k][k]; M[i][j] -= M[i][k]*M[k][j]
    const pivv = M[k][k];
    for (let i = k + 1; i < n; i++) {
      M[i][k] /= pivv;
      const mik = M[i][k];
      for (let j = k + 1; j < n; j++) {
        M[i][j] -= mik * M[k][j];
      }
    }
  }
  // Split M into L (unit-diagonal lower) and U (upper).
  const Lrows = [], Urows = [], Prows = [];
  for (let i = 0; i < n; i++) {
    const Lr = new Array(n), Ur = new Array(n), Pr = new Array(n);
    for (let j = 0; j < n; j++) {
      if (i === j) {
        Lr[j] = Real(1);
        Ur[j] = Real(M[i][j]);
      } else if (i > j) {
        Lr[j] = Real(M[i][j]);
        Ur[j] = Real(0);
      } else {
        Lr[j] = Real(0);
        Ur[j] = Real(M[i][j]);
      }
      Pr[j] = Real(piv[i] === j ? 1 : 0);
    }
    Lrows.push(Lr); Urows.push(Ur); Prows.push(Pr);
  }
  s.push(Matrix(Lrows));
  s.push(Matrix(Urows));
  s.push(Matrix(Prows));
}, { category: 'Vectors / matrices', categoryOrder: 33, label: "LU" });


/* --------------- GRAMSCHMIDT — orthogonalize columns -------------------
   HP50 AUR §15.3.

     GRAMSCHMIDT  ( A → Q )

   Returns the matrix Q whose columns form an orthonormal basis for the
   column space of A, produced by the modified-Gram-Schmidt process.
   For a full-column-rank A, Q has the same shape as A; if a column
   becomes linearly dependent during orthogonalization (near-zero norm),
   we throw Infinite result — matching the HP50 behavior on singular
   inputs.  Real / Integer entries only (same policy as LU / LSQ).

   Algorithm (modified Gram-Schmidt, numerically stabler than classical):
     for k in 0..n-1:
       v_k = A[:,k]
       for j in 0..k-1:
         v_k = v_k - (Q[:,j] · v_k) · Q[:,j]
       r = ||v_k||
       if r < tol: throw Infinite result
       Q[:,k] = v_k / r
   ----------------------------------------------------------------- */

function _gramSchmidtNum(A) {
  // A is a plain 2-D number array (m × n).  Returns Q (m × n) with
  // orthonormal columns.  Throws Infinite result on near-singular.
  const m = A.length;
  const n = A[0].length;
  if (n > m) throw new RPLError('Invalid dimension');
  // Work column-major for clarity.
  const cols = [];
  for (let j = 0; j < n; j++) {
    const col = new Array(m);
    for (let i = 0; i < m; i++) col[i] = A[i][j];
    cols.push(col);
  }
  const Q = [];
  for (let k = 0; k < n; k++) {
    let v = cols[k].slice();
    for (let j = 0; j < k; j++) {
      // proj = (Q[j] · v);  v -= proj · Q[j]
      let proj = 0;
      for (let i = 0; i < m; i++) proj += Q[j][i] * v[i];
      for (let i = 0; i < m; i++) v[i] -= proj * Q[j][i];
    }
    let norm = 0;
    for (let i = 0; i < m; i++) norm += v[i] * v[i];
    norm = Math.sqrt(norm);
    if (norm < 1e-12) throw new RPLError('Infinite result');
    for (let i = 0; i < m; i++) v[i] /= norm;
    Q.push(v);
  }
  // Rebuild as m × n row-major matrix from column slices.
  const rows = new Array(m);
  for (let i = 0; i < m; i++) {
    rows[i] = new Array(n);
    for (let j = 0; j < n; j++) rows[i][j] = Q[j][i];
  }
  return rows;
}


register('GRAMSCHMIDT', (s) => {
  const [A] = s.popN(1);
  if (!isMatrix(A)) throw new RPLError('Bad argument type');
  if (A.rows.length === 0) throw new RPLError('Invalid dimension');
  const Anum = _asNumArray2D(A.rows);
  const Q = _gramSchmidtNum(Anum);
  s.push(Matrix(Q.map(row => row.map(x => Real(x)))));
}, { category: 'Vectors / matrices', categoryOrder: 37, label: "GRAMSCHMIDT" });


/* --------------- QR — QR decomposition ---------------------------------
   HP50 AUR §15.3.

     QR  ( A → Q R P )   A is m×n with m ≥ n.
                         Q is m×n with orthonormal columns
                         (Q^T · Q = I_n).  R is n×n upper-triangular.
                         P is the n×n permutation matrix selected by
                         column-pivoted QR — for the no-pivot path used
                         here, P is simply the identity (left in place
                         so callers can do `A · P = Q · R` in either
                         regime).  A = Q · R when P = I; else
                         A · P = Q · R.

   Real / Integer entries only.  Singular column (rank deficient)
   throws Infinite result via the underlying GRAMSCHMIDT helper.
   ----------------------------------------------------------------- */

register('QR', (s) => {
  const [A] = s.popN(1);
  if (!isMatrix(A)) throw new RPLError('Bad argument type');
  const m = A.rows.length;
  if (m === 0) throw new RPLError('Invalid dimension');
  const n = A.rows[0].length;
  if (n === 0) throw new RPLError('Invalid dimension');
  if (m < n) throw new RPLError('Invalid dimension');
  const Anum = _asNumArray2D(A.rows);
  const Qnum = _gramSchmidtNum(Anum);   // m × n
  // R = Q^T · A, but only its upper-triangular (R[j][k] for j ≤ k).
  const R = [];
  for (let j = 0; j < n; j++) {
    const row = new Array(n).fill(0);
    for (let k = 0; k < n; k++) {
      if (k < j) { row[k] = 0; continue; }
      let acc = 0;
      for (let i = 0; i < m; i++) acc += Qnum[i][j] * Anum[i][k];
      row[k] = acc;
    }
    R.push(row);
  }
  // Identity permutation (no column pivoting in this path).
  const P = [];
  for (let i = 0; i < n; i++) {
    const pr = new Array(n).fill(0);
    pr[i] = 1;
    P.push(pr);
  }
  s.push(Matrix(Qnum.map(row => row.map(x => Real(x)))));
  s.push(Matrix(R.map(row => row.map(x => Real(x)))));
  s.push(Matrix(P.map(row => row.map(x => Real(x)))));
}, { category: 'Vectors / matrices', categoryOrder: 34, label: "QR" });


/* --------------- CHOLESKY — Cholesky decomposition ---------------------
   HP50 AUR §15.3.

     CHOLESKY  ( A → L )   A is an n×n symmetric positive-definite
                           Matrix.  L is the lower-triangular factor
                           with L·L^T = A.  Non-square → Invalid
                           dimension; non-symmetric → Bad argument
                           value; non-positive-definite (any pivot ≤ 0
                           inside the sqrt) → Infinite result.
                           Real / Integer entries only.

   Algorithm (standard Cholesky-Banachiewicz):
     for i = 0..n-1:
       for j = 0..i:
         s = A[i][j] - sum_{k=0..j-1} L[i][k] * L[j][k]
         L[i][j] = (i == j) ? sqrt(s) : s / L[j][j]
   ----------------------------------------------------------------- */

register('CHOLESKY', (s) => {
  const [A] = s.popN(1);
  if (!isMatrix(A)) throw new RPLError('Bad argument type');
  const n = A.rows.length;
  if (n === 0 || A.rows[0].length !== n) {
    throw new RPLError('Invalid dimension');
  }
  const M = _asNumArray2D(A.rows);
  // Symmetry check.
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < i; j++) {
      if (Math.abs(M[i][j] - M[j][i]) > 1e-10 * (1 + Math.abs(M[i][j]))) {
        throw new RPLError('Bad argument value');
      }
    }
  }
  const L = [];
  for (let i = 0; i < n; i++) L.push(new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let acc = M[i][j];
      for (let k = 0; k < j; k++) acc -= L[i][k] * L[j][k];
      if (i === j) {
        if (acc <= 0) throw new RPLError('Infinite result');
        L[i][j] = Math.sqrt(acc);
      } else {
        if (L[j][j] === 0) throw new RPLError('Infinite result');
        L[i][j] = acc / L[j][j];
      }
    }
  }
  s.push(Matrix(L.map(row => row.map(x => Real(x)))));
}, { category: 'Vectors / matrices', categoryOrder: 36, label: "CHOLESKY" });


/* --------------- RDM — redimension Vector / Matrix --------------------
   HP50 AUR §15.2.

     RDM  ( V {n}    → V' )     reshape Vector to length-n Vector
     RDM  ( V {m n}  → M )      reshape Vector to m×n Matrix
     RDM  ( M {n}    → V )      reshape Matrix to length-n Vector
     RDM  ( M {m n}  → M' )     reshape Matrix to m'×n' Matrix

   The total element count must match (m·n == |V| or m'·n' == m·n);
   otherwise throws Invalid dimension.  Reading / writing is row-major
   for Matrix shapes.  Entries are preserved as-is (no coercion); the
   shape list may be `{n}` or `{m n}`.  Negative / zero dimensions →
   Bad argument value.

   Source entries can be any type — we just shuffle them.  Unlike
   CON / IDN / RANM, RDM keeps heterogeneous entries too (Real and
   Integer mixed, Symbolic, Complex).
   ----------------------------------------------------------------- */

function _shapeFromList(L) {
  // Extract a shape from a list (either {n} or {m n}).  Returns
  // { rows, cols } with rows === null for 1-D (Vector) reshape.
  if (!isList(L)) throw new RPLError('Bad argument type');
  if (L.items.length === 1) {
    const n = L.items[0];
    if (!isInteger(n) && !(isReal(n) && n.value.isInteger())) {
      throw new RPLError('Bad argument type');
    }
    const nn = isInteger(n) ? Number(n.value) : n.value.toNumber();
    if (nn <= 0) throw new RPLError('Bad argument value');
    return { rows: null, cols: nn };
  }
  if (L.items.length === 2) {
    const m = L.items[0], n = L.items[1];
    if ((!isInteger(m) && !(isReal(m) && m.value.isInteger())) ||
        (!isInteger(n) && !(isReal(n) && n.value.isInteger()))) {
      throw new RPLError('Bad argument type');
    }
    const mm = isInteger(m) ? Number(m.value) : m.value.toNumber();
    const nn = isInteger(n) ? Number(n.value) : n.value.toNumber();
    if (mm <= 0 || nn <= 0) throw new RPLError('Bad argument value');
    return { rows: mm, cols: nn };
  }
  throw new RPLError('Bad argument value');
}


register('RDM', (s) => {
  const [src, shape] = s.popN(2);
  const { rows, cols } = _shapeFromList(shape);
  // Flatten source to a single array (row-major for Matrix).
  let flat;
  if (isVector(src)) {
    flat = src.items.slice();
  } else if (isMatrix(src)) {
    flat = [];
    for (const row of src.rows) for (const e of row) flat.push(e);
  } else {
    throw new RPLError('Bad argument type');
  }
  const want = rows === null ? cols : rows * cols;
  if (flat.length !== want) throw new RPLError('Invalid dimension');
  if (rows === null) {
    s.push(Vector(flat));
    return;
  }
  const out = [];
  for (let i = 0; i < rows; i++) {
    out.push(flat.slice(i * cols, (i + 1) * cols));
  }
  s.push(Matrix(out));
}, { category: 'Vectors / matrices', categoryOrder: 32, label: "RDM" });


/* =================================================================
   LQ, COND, HERMITE, LEGENDRE, TCHEBYCHEFF.

   HP50 AUR: §15.3 (LQ), §15.4 (COND), §12.5 (HERMITE / LEGENDRE /
   TCHEBYCHEFF orthogonal-polynomial generators).

   All ops below are user-reachable via the typed catalog today.  No
   UI work.  LQ is the row-analog of QR — same `_gramSchmidtNum` helper
   but applied to Aᵀ, so the result rows are orthonormal instead of
   the columns.  COND is the 1-norm condition number (`CNRM(A) ·
   CNRM(INV A)`), so its building blocks (CNRM + matrix INV) already
   ship.  The polynomial-generator trio return a Symbolic expression
   in `X` — the HP50 firmware form.  Construction goes through the
   `_coefArrToSymbolicX` helper so DISTRIB / EPSX0 / SUBST can be
   composed downstream.
   ================================================================= */

/* --------------- LQ — LQ decomposition --------------------------------
   HP50 AUR §15.3.

     LQ  ( A → L Q P )   A is m×n with m ≤ n.
                         L is m×m lower-triangular.
                         Q is m×n with orthonormal rows
                         (Q · Qᵀ = I_m).  P is the m×m row-permutation
                         matrix selected by row-pivoted LQ — for the
                         no-pivot path used here, P is the identity,
                         so `A = L · Q` directly.

   Real / Integer entries only.  Rank-deficient row (residual norm
   below 1e-12) throws Infinite result via `_gramSchmidtNum` on Aᵀ.

   Algorithm:  LQ(A) ≡ transpose of QR(Aᵀ).
     Let Aᵀ = Q₁ · R₁ via Gram-Schmidt on Aᵀ (columns of Aᵀ = rows of A).
     Then A = R₁ᵀ · Q₁ᵀ; set L = R₁ᵀ, Q = Q₁ᵀ.
   ----------------------------------------------------------------- */

register('LQ', (s) => {
  const [A] = s.popN(1);
  if (!isMatrix(A)) throw new RPLError('Bad argument type');
  const m = A.rows.length;
  if (m === 0) throw new RPLError('Invalid dimension');
  const n = A.rows[0].length;
  if (n === 0) throw new RPLError('Invalid dimension');
  if (m > n) throw new RPLError('Invalid dimension');
  // Build Aᵀ as a plain m×n-transposed (n×m) numeric array.
  const Anum = _asNumArray2D(A.rows);
  const AtNum = new Array(n);
  for (let i = 0; i < n; i++) {
    AtNum[i] = new Array(m);
    for (let j = 0; j < m; j++) AtNum[i][j] = Anum[j][i];
  }
  // Q₁ is n×m with orthonormal columns (Gram-Schmidt on columns of Aᵀ).
  const Q1 = _gramSchmidtNum(AtNum);
  // R₁ (m×m upper-tri) = Q₁ᵀ · Aᵀ; we only need R₁[j][k] for j ≤ k.
  const R1 = [];
  for (let j = 0; j < m; j++) {
    const row = new Array(m).fill(0);
    for (let k = j; k < m; k++) {
      let acc = 0;
      for (let i = 0; i < n; i++) acc += Q1[i][j] * AtNum[i][k];
      row[k] = acc;
    }
    R1.push(row);
  }
  // L = R₁ᵀ (m×m, lower-triangular).
  const L = [];
  for (let i = 0; i < m; i++) {
    const row = new Array(m).fill(0);
    for (let j = 0; j <= i; j++) row[j] = R1[j][i];
    L.push(row);
  }
  // Q = Q₁ᵀ (m×n with orthonormal rows).
  const Q = [];
  for (let j = 0; j < m; j++) {
    const row = new Array(n);
    for (let i = 0; i < n; i++) row[i] = Q1[i][j];
    Q.push(row);
  }
  // Identity row-permutation (no pivoting in this path).
  const P = [];
  for (let i = 0; i < m; i++) {
    const pr = new Array(m).fill(0);
    pr[i] = 1;
    P.push(pr);
  }
  s.push(Matrix(L.map(row => row.map(x => Real(x)))));
  s.push(Matrix(Q.map(row => row.map(x => Real(x)))));
  s.push(Matrix(P.map(row => row.map(x => Real(x)))));
}, { category: 'Vectors / matrices', categoryOrder: 35, label: "LQ" });


/* --------------- COND — 1-norm condition number -----------------------
   HP50 AUR §15.4.

     COND  ( A → κ )   A must be square.  κ = CNRM(A) · CNRM(INV A),
                       the 1-norm (max column absolute-sum) condition
                       number.  A singular (INV throws Infinite result)
                       → Infinite result.  Non-square → Invalid
                       dimension.  Real / Integer entries only.

   Uses the `CNRM` and `INV` paths already in place — the 1-norm of an
   m×m numeric matrix plus one explicit inverse.  For a perfectly-
   conditioned matrix the result is 1; for singular or near-singular
   inputs it blows up.  HP50 also documents `COND(I) = n` for the
   identity; we get `CNRM(I) = 1` and `CNRM(INV I) = CNRM(I) = 1`,
   so our value is 1 — matching what most linear-algebra texts call
   the 1-norm condition number.  The HP50's `COND(I) = n` is a
   documentation curiosity (it uses the row 1-norm on a different
   scaling); we follow the textbook definition, which is more useful.
   ----------------------------------------------------------------- */

register('COND', (s) => {
  const [A] = s.popN(1);
  if (!isMatrix(A)) throw new RPLError('Bad argument type');
  const m = A.rows.length;
  if (m === 0) throw new RPLError('Invalid dimension');
  const n = A.rows[0].length;
  if (m !== n) throw new RPLError('Invalid dimension');
  // Reject Symbolic entries up front (same policy as CNRM / NORM /
  // _invMatrixNumeric).  Complex is allowed: |z| magnitude is fine,
  // and INV handles complex matrices via _invMatrixNumeric.
  for (const row of A.rows) {
    for (const x of row) {
      if (!isReal(x) && !isInteger(x) && !isComplex(x)) {
        throw new RPLError('Bad argument type');
      }
    }
  }
  // CNRM(A).
  let normA = 0;
  for (let j = 0; j < n; j++) {
    let sum = 0;
    for (let i = 0; i < m; i++) sum += _magEntry(A.rows[i][j]);
    if (sum > normA) normA = sum;
  }
  // CNRM(INV A).  Propagates Infinite result on singular inputs.
  const Ainv = _invMatrixNumeric(A.rows);
  let normI = 0;
  for (let j = 0; j < n; j++) {
    let sum = 0;
    for (let i = 0; i < m; i++) sum += _magEntry(Ainv[i][j]);
    if (sum > normI) normI = sum;
  }
  s.push(Real(normA * normI));
}, { category: 'Vectors / matrices', categoryOrder: 7, label: "COND" });


function _polyScale(arr, k) {
  // arr (descending-degree); multiply every entry by k (plain number).
  return arr.map(c => c * k);
}


function _polyShiftUp(arr) {
  // Multiply poly (descending-degree) by X → append a trailing 0.
  return arr.concat([0]);
}


function _polyAdd(a, b) {
  // Add two descending-degree polys, aligning by trailing (constant)
  // end.  Returns a new descending-degree array whose length is
  // max(len(a), len(b)).
  const la = a.length, lb = b.length;
  const L = Math.max(la, lb);
  const out = new Array(L).fill(0);
  for (let i = 0; i < la; i++) out[L - la + i] += a[i];
  for (let i = 0; i < lb; i++) out[L - lb + i] += b[i];
  return out;
}


register('HERMITE', (s) => {
  const [v] = s.popN(1);
  const n = _nFromIntegerArg(v);
  // Recurrence on coefficient arrays (descending degree).
  //   H_0 = [1], H_1 = [2, 0],
  //   H_{k+1} = 2·X·H_k − 2k·H_{k-1}
  if (n === 0) { s.push(_coefArrToSymbolicX([1])); return; }
  if (n === 1) { s.push(_coefArrToSymbolicX([2, 0])); return; }
  let prev = [1];        // H_0
  let curr = [2, 0];     // H_1
  for (let k = 1; k < n; k++) {
    // 2·X·H_k  (shift up, scale by 2)
    const twoXHk = _polyScale(_polyShiftUp(curr), 2);
    // 2k·H_{k-1}
    const twoKPrev = _polyScale(prev, 2 * k);
    // H_{k+1} = 2·X·H_k − 2k·H_{k-1}
    const next = _polyAdd(twoXHk, _polyScale(twoKPrev, -1));
    prev = curr;
    curr = next;
  }
  s.push(_coefArrToSymbolicX(curr));
}, { category: 'Vectors / matrices', categoryOrder: 38, label: "HERMITE" });


register('LEGENDRE', (s) => {
  const [v] = s.popN(1);
  const n = _nFromIntegerArg(v);
  // Recurrence (Bonnet):
  //   P_0 = [1], P_1 = [1, 0],
  //   (k+1) P_{k+1} = (2k+1)·X·P_k − k·P_{k-1}
  if (n === 0) { s.push(_coefArrToSymbolicX([1])); return; }
  if (n === 1) { s.push(_coefArrToSymbolicX([1, 0])); return; }
  let prev = [1];        // P_0
  let curr = [1, 0];     // P_1
  for (let k = 1; k < n; k++) {
    const a = _polyScale(_polyShiftUp(curr), 2 * k + 1);
    const b = _polyScale(prev, k);
    const sumArr = _polyAdd(a, _polyScale(b, -1));
    const next = _polyScale(sumArr, 1 / (k + 1));
    prev = curr;
    curr = next;
  }
  s.push(_coefArrToSymbolicX(curr));
}, { category: 'Vectors / matrices', categoryOrder: 39, label: "LEGENDRE" });


function _tchebOp(s) {
  const [v] = s.popN(1);
  // TCHEBYCHEFF accepts Integer / integer-valued Real.  Non-negative
  // n selects the first-kind Chebyshev polynomial T_n(X); negative n
  // selects the second-kind U_{|n|-1}(X), matching HP50 AUR §12.5.
  // Non-integer or non-numeric throws.
  let n;
  if (isInteger(v)) {
    n = Number(v.value);
  } else if (isReal(v)) {
    if (!v.value.isFinite() || !v.value.isInteger()) {
      throw new RPLError('Bad argument value');
    }
    n = v.value.toNumber();
  } else {
    throw new RPLError('Bad argument type');
  }
  if (n >= 0) {
    // First-kind: T_0 = [1], T_1 = [1, 0],
    //             T_{k+1} = 2·X·T_k − T_{k-1}
    if (n === 0) { s.push(_coefArrToSymbolicX([1])); return; }
    if (n === 1) { s.push(_coefArrToSymbolicX([1, 0])); return; }
    let prev = [1];        // T_0
    let curr = [1, 0];     // T_1
    for (let k = 1; k < n; k++) {
      const twoXTk = _polyScale(_polyShiftUp(curr), 2);
      const next = _polyAdd(twoXTk, _polyScale(prev, -1));
      prev = curr;
      curr = next;
    }
    s.push(_coefArrToSymbolicX(curr));
    return;
  }
  // Second-kind U_{|n|-1}(X): U_0 = [1], U_1 = [2, 0],
  //                           U_{k+1} = 2·X·U_k − U_{k-1}
  const m = (-n) - 1;
  if (m === 0) { s.push(_coefArrToSymbolicX([1])); return; }
  if (m === 1) { s.push(_coefArrToSymbolicX([2, 0])); return; }
  let prev = [1];         // U_0
  let curr = [2, 0];      // U_1
  for (let k = 1; k < m; k++) {
    const twoXUk = _polyScale(_polyShiftUp(curr), 2);
    const next = _polyAdd(twoXUk, _polyScale(prev, -1));
    prev = curr;
    curr = next;
  }
  s.push(_coefArrToSymbolicX(curr));
}

register('TCHEBYCHEFF', _tchebOp, { category: 'Vectors / matrices', categoryOrder: 41, label: "TCHEBYCHEFF" });

register('TCHEB',       _tchebOp, { category: 'Vectors / matrices', categoryOrder: 40, label: "TCHEB" });


/* ---- AXL / AXM — List ↔ Vector / Matrix bridges ----------------------
   HP50 AUR §15.2.

     AXL   ( V → L )     Vector → flat List of its entries
           ( M → L )     Matrix → List of Lists (one sub-list per row)
           ( L → L )     List already; no-op (idempotent per HP50 spec)

     AXM   ( L → V )     flat-item List → Vector (no nested sub-lists)
           ( L → M )     List of same-length sub-lists → Matrix
                         (all sub-lists checked; mismatched length →
                          Invalid dimension)
           ( V → V )     Vector no-op
           ( M → M )     Matrix no-op

   Entry-type policy: we don't coerce — entries flow through unchanged,
   which matches the HP50's behaviour (AXL on a Matrix with a mix of
   Integer / Real / Complex / Symbolic entries emits a List of Lists
   with those same entries).  AXM with a List containing non-numeric
   (e.g. Symbolic) entries still builds the Vector / Matrix; the
   downstream ops are the ones that reject non-numeric entries.  HP50
   actually coerces some entry types during AXM — e.g. a plain Integer
   in a numeric column stays Integer — but the Vector/Matrix builders
   don't enforce any type uniformity so we match the HP50 surface.

   AXL and AXM are not exact inverses in all cases because AXL on a
   plain List is a no-op (HP50 idempotent rule): AXL(AXM({a b c})) ≡
   AXL([a b c]) ≡ {a b c}, so the round-trip is preserved for flat
   lists and rectangular-row lists; ragged lists throw on the AXM side.
   --------------------------------------------------------------------- */

register('AXL', (s) => {
  const [v] = s.popN(1);
  if (isVector(v)) {
    // Flat Vector → flat List of same entries.
    s.push(RList([...v.items]));
    return;
  }
  if (isMatrix(v)) {
    // Matrix → List of Lists (row-major).
    s.push(RList(v.rows.map(row => RList([...row]))));
    return;
  }
  if (isList(v)) {
    // Idempotent — already a list.
    s.push(v);
    return;
  }
  throw new RPLError('Bad argument type');
}, { category: 'Vectors / matrices', categoryOrder: 44, label: "AXL" });


register('AXM', (s) => {
  const [v] = s.popN(1);
  if (isVector(v) || isMatrix(v)) {
    // Already a matrix-ish form — no-op (HP50 idempotency).
    s.push(v);
    return;
  }
  if (!isList(v)) throw new RPLError('Bad argument type');
  const items = v.items;
  if (items.length === 0) throw new RPLError('Bad argument value');
  // If any item is itself a List, the result is a Matrix.  All sub-
  // lists must match in length (rectangular).  Otherwise the result
  // is a flat Vector of the item values.
  const nested = items.some(isList);
  if (!nested) {
    s.push(Vector([...items]));
    return;
  }
  // Every row must be a List; mixed-shape input is a user bug.
  if (!items.every(isList)) throw new RPLError('Bad argument type');
  const cols = items[0].items.length;
  if (cols === 0) throw new RPLError('Bad argument value');
  const rows = items.map(row => {
    if (row.items.length !== cols) throw new RPLError('Invalid dimension');
    return [...row.items];
  });
  s.push(Matrix(rows));
}, { category: 'Vectors / matrices', categoryOrder: 45, label: "AXM" });


register('PCAR', (s) => {
  const { matrix } = _popSquareMatrix(s);
  if (!giac.isReady()) throw new RPLError('CAS not ready');
  const vx = getCasVx();
  const matStr = _matrixToGiacStr(matrix);
  const cmd = `charpoly(${matStr},${vx})`;
  s.push(Symbolic(giacToAst(giac.caseval(cmd))));
}, { category: 'Vectors / matrices', categoryOrder: 46, label: "PCAR" });


/** `CHARPOL` — alias for PCAR.  Some HP-family codebases use the
 *  descriptive name; register as a thin wrapper so it picks up any
 *  future refinement of PCAR automatically (mirrors the XNUM / XQ
 *  alias pattern XNUM / XQ use). */
register('CHARPOL', (s) => { OPS.get('PCAR').fn(s); }, { category: 'Vectors / matrices', categoryOrder: 47, label: "CHARPOL" });


register('EGVL', (s) => {
  const { matrix } = _popSquareMatrix(s);
  if (!giac.isReady()) throw new RPLError('CAS not ready');
  const matStr = _matrixToGiacStr(matrix);
  const raw = giac.caseval(`eigenvals(${matStr})`);
  // `eigenvals` prints a flat `[λ1, λ2, …]` list per Xcas convention.
  // If Giac (or a future mock) returns something else, splitGiacList
  // yields null; surface that as `Bad argument value` so the user gets
  // a clean error instead of a garbled result.
  const parts = splitGiacList(raw);
  if (parts === null) throw new RPLError('Bad argument value');
  const items = parts.map((elt) => {
    const ast = giacToAst(elt);
    return _astToRplValue(ast);
  });
  s.push(Vector(items));
}, { category: 'Vectors / matrices', categoryOrder: 49, label: "EGVL" });


/* ------------------------------------------------------------------
   EGV   (HP50 AUR §3-73)
   Eigenvalues + right eigenvectors of a square matrix.

     Input :  level 1 = [[ M ]]   (n × n)
     Output:  level 2 = [[ EVec ]]  (n × n; columns = right eigenvectors)
              level 1 = [ EVal  ]   (n-vector of eigenvalues)

   HP50 fidelity:
     • EVec column i corresponds to EVal entry i.
     • For real input with a complex eigenpair, both EVec and EVal
       widen to complex — same as EGVL.

   Implementation:
     • Eigenvalue vector via Giac `eigenvals(M)` — same call EGVL
       uses, so the eigenvalue order matches EGVL exactly.
     • Eigenvector matrix via Giac `egv(M)`.  Xcas `egv(M)` returns
       the matrix P whose columns are right eigenvectors such that
       M·P = P·diag(eigenvals(M)) — the orientation HP50 asks for.
       (`egvl(M)`, by contrast, returns the diagonal eigenvalue
       matrix; the n_a_m_e similarity is treacherous.)
     • Both calls go through the same `_matrixToGiacStr` /
       `_astToRplValue` pipeline as EGVL/PCAR; if either Giac call
       returns a non-list shape, surface `Bad argument value` to keep
       the error wording identical to the EGVL no-list case.
     • No-fallback policy: `!giac.isReady()` ⇒ `CAS not ready`.
   ------------------------------------------------------------------ */
register('EGV', (s) => {
  const { matrix } = _popSquareMatrix(s);
  if (!giac.isReady()) throw new RPLError('CAS not ready');
  const matStr = _matrixToGiacStr(matrix);

  // --- eigenvector matrix ---
  const evecRaw = giac.caseval(`egv(${matStr})`);
  const evecRows = splitGiacList(evecRaw);
  if (evecRows === null) throw new RPLError('Bad argument value');
  const matrixRows = evecRows.map((rowStr) => {
    const cols = splitGiacList(rowStr);
    if (cols === null) throw new RPLError('Bad argument value');
    return cols.map((c) => _astToRplValue(giacToAst(c)));
  });

  // --- eigenvalue vector --- (same call EGVL uses → same ordering)
  const evalRaw = giac.caseval(`eigenvals(${matStr})`);
  const evalParts = splitGiacList(evalRaw);
  if (evalParts === null) throw new RPLError('Bad argument value');
  const evalItems = evalParts.map((elt) => _astToRplValue(giacToAst(elt)));

  // Push matrix first (it ends up at level 2), then the vector.
  s.push(Matrix(matrixRows));
  s.push(Vector(evalItems));
}, { category: 'Vectors / matrices', categoryOrder: 48, label: "EGV" });


function giacMatrixRows(raw) {
  const rows = splitGiacList(raw);
  if (!rows || rows.length === 0) return null;
  const out = [];
  for (const rowStr of rows) {
    const cols = splitGiacList(rowStr);
    if (!cols) return null;
    try {
      out.push(cols.map((cell) => _astToRplValue(giacToAst(cell))));
    } catch {
      return null;
    }
  }
  return out;
}

function topLevelParts(text) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') depth--;
    else if (c === ',' && depth === 0) {
      parts.push(text.slice(start, i).trim());
      start = i + 1;
    }
  }
  parts.push(text.slice(start).trim());
  return parts.filter((part) => part !== '');
}

function jordanFactors(raw) {
  const text = String(raw).trim();
  const sequence = topLevelParts(text);
  if (sequence.length === 2) {
    const transition = giacMatrixRows(sequence[0]);
    const form = giacMatrixRows(sequence[1]);
    if (transition && form) return { transition, form };
  }
  const listed = splitGiacList(text);
  if (!listed || listed.length !== 2) return null;
  const transition = giacMatrixRows(listed[0]);
  const form = giacMatrixRows(listed[1]);
  if (!transition || !form) return null;
  return { transition, form };
}

register('JORDAN', (s) => {
  const { matrix } = _popSquareMatrix(s);
  if (!giac.isReady()) throw new RPLError('CAS not ready');
  const vx = getCasVx();
  const matStr = _matrixToGiacStr(matrix);
  const pmin = Symbolic(giacToAst(giac.caseval(`pmin(${matStr},${vx})`)));
  const pcar = Symbolic(giacToAst(giac.caseval(`charpoly(${matStr},${vx})`)));
  const factors = jordanFactors(giac.caseval(`jordan(${matStr})`));
  if (!factors) throw new RPLError('Bad argument value');
  const built = spacesFromJordan(factors.transition, factors.form);
  if (!built) throw new RPLError('Bad argument value');
  s.push(pmin);
  s.push(pcar);
  s.push(charSpaceList(built.spaces));
  s.push(eigenvalueArray(built.values));
}, { category: 'Vectors / matrices', categoryOrder: 50, label: 'JORDAN' });


/* ------------------------------------------------------------------
   RSD   (HP50 AUR §3-213)
   Residual command — returns B − A·Z.

     Input :  level 3 = B  (vector or matrix)
              level 2 = A  (m × k matrix)
              level 1 = Z  (vector of length k, OR k × n matrix)
     Output:  level 1 = R = B − A·Z (same shape as B)

   Shape constraints (per AUR p.3-213):
     • A must be a matrix.
     • cols(A) must equal len(Z) (Z vector) or rows(Z) (Z matrix).
     • rows(A) must equal len(B) (B vector) or rows(B) (B matrix).
     • B and Z must both be vectors or both be matrices.
     • If both matrices, cols(B) must equal cols(Z).

   Numeric path only — entries must be Real or Integer.  Mirrors the
   LSQ rejection policy (`_asNumArray*`).  The result is a Real-typed
   Vector or Matrix (matching how LSQ / RREF return Real entries on
   the numeric branch).
   ------------------------------------------------------------------ */
register('RSD', (s) => {
  const [B, A, Z] = s.popN(3);
  if (!isMatrix(A)) throw new RPLError('Bad argument type');

  const m = A.rows.length;
  const k = m > 0 ? A.rows[0].length : 0;
  if (m === 0 || k === 0) throw new RPLError('Invalid dimension');

  // Promote A to plain numbers up-front; this also surfaces the
  // Real/Integer-only contract on A's entries before we look at B/Z.
  const aNum = _asNumArray2D(A.rows);

  // Vector branch — B and Z both vectors.
  if (isVector(B) && isVector(Z)) {
    if (Z.items.length !== k) throw new RPLError('Invalid dimension');
    if (B.items.length !== m) throw new RPLError('Invalid dimension');
    const bNum = _asNumArray1D(B.items);
    const zNum = _asNumArray1D(Z.items);
    const az = _matVecNum(aNum, zNum);
    const out = new Array(m);
    for (let i = 0; i < m; i++) out[i] = Real(bNum[i] - az[i]);
    s.push(Vector(out));
    return;
  }

  // Matrix branch — B and Z both matrices.
  if (isMatrix(B) && isMatrix(Z)) {
    const zRows = Z.rows.length;
    const zCols = zRows > 0 ? Z.rows[0].length : 0;
    if (zRows !== k) throw new RPLError('Invalid dimension');
    if (zCols === 0) throw new RPLError('Invalid dimension');
    const bRows = B.rows.length;
    const bCols = bRows > 0 ? B.rows[0].length : 0;
    if (bRows !== m) throw new RPLError('Invalid dimension');
    if (bCols !== zCols) throw new RPLError('Invalid dimension');
    const bNum = _asNumArray2D(B.rows);
    const zNum = _asNumArray2D(Z.rows);
    const az = _matMulNum(aNum, zNum);
    const rows = new Array(m);
    for (let i = 0; i < m; i++) {
      const row = new Array(zCols);
      for (let j = 0; j < zCols; j++) row[j] = Real(bNum[i][j] - az[i][j]);
      rows[i] = row;
    }
    s.push(Matrix(rows));
    return;
  }

  // Mixed shapes (vector + matrix) and any other combination → reject.
  throw new RPLError('Bad argument type');
}, { category: 'Vectors / matrices', categoryOrder: 19, label: "RSD" });
