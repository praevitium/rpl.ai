import { isVector, RList, Real, isMatrix, isString, Integer, isList, isProgram, Matrix, Vector, isInteger, isReal, isComplex, Complex, isRational, isSymbolic, isUnit, Symbolic } from '../types.js';
import { RPLError, checkTimeLimit } from '../stack.js';
import { astSize } from '../algebra.js';
import { unitSize } from '../units.js';
import { nextPrngInt9, getCasVx } from '../state.js';
import { giac } from '../cas/giac-engine.mjs';
import { giacToAst, splitGiacList } from '../cas/giac-convert.mjs';
import { charSpaceList, eigenvalueArray, spacesFromJordan } from '../jordan-format.js';
import { register, OPS } from './registry.js';
import { _astToRplValue, _coefArrToSymbolicX, _colCompose, _colDecompose, _decimalFrobeniusNorm, _fromArrayOp, _fromVecOp, _indexAsInt, _invMatrixNumeric, _isScalarOperand, _isSymOperand, _matrixToGiacStr, _nFromIntegerArg, _popSquareMatrix, _rowCompose, _rowDecompose, _scalarBinary, _scalarSum, _toArrayOp, _toV2Op, _toV3Op } from './internal.js';



function _transpose(rows, width = rows[0]?.length ?? 0) {
  return Array.from({ length: width }, (_, j) => rows.map(row => row[j]));
}

const MAX_CELLS = 1_000_000;

function _checkCells(m, n = 1) {
  if (m * n > MAX_CELLS) throw new RPLError('Insufficient memory');
}

function _identity(n) {
  _checkCells(n, n);
  const rows = new Array(n);
  for (let i = 0; i < n; i++) {
    checkTimeLimit();
    rows[i] = new Array(n).fill(0);
    rows[i][i] = 1;
  }
  return rows;
}

function _realMatrix(rows) {
  return Matrix(rows.map(row => row.map(x => Real(x))));
}

function _wholeArg(v) {
  if (!isInteger(v) && !isReal(v)) throw new RPLError('Bad argument type');
  const n = isInteger(v) ? Number(v.value) : v.value.toNumber();
  if (!Number.isSafeInteger(n)) throw new RPLError('Bad argument value');
  return n;
}


register('SIZE', (s) => {
  const [v] = s.popN(1);
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
  if (isString(v)) { s.push(Integer(BigInt(v.value.length))); return; }
  if (isList(v))   { s.push(Integer(BigInt(v.items.length))); return; }
  if (isProgram(v)) { s.push(Integer(BigInt(v.tokens.length))); return; }
  if (isInteger(v)) { s.push(Integer(BigInt((v.value < 0n ? -v.value : v.value).toString().length))); return; }
  if (isSymbolic(v) && typeof v.expr === 'object') { s.push(Integer(BigInt(astSize(v.expr)))); return; }
  if (isUnit(v)) { s.push(Integer(BigInt(unitSize(v.uexpr)))); return; }
  s.push(Integer(1n));
}, { category: 'Vectors / matrices', categoryOrder: 0, label: "SIZE" });


// AUR: TRN is the conjugate transpose, TRAN the plain one.
function _transposeOp(conjugate) {
  return (s) => {
    const [m] = s.popN(1);
    if (!isMatrix(m)) throw new RPLError('Bad argument type');
    const rows = m.rows.length;
    const cols = rows > 0 ? m.rows[0].length : 0;
    if (rows === 0 || cols === 0) { s.push(m); return; }
    const entry = (x) => (conjugate && isComplex(x) ? Complex(x.re, -x.im) : x);
    s.push(Matrix(_transpose(m.rows).map((row) => row.map(entry))));
  };
}

register('TRN', _transposeOp(true), { category: 'Vectors / matrices', categoryOrder: 1, label: "TRN" });

register('TRAN', _transposeOp(false), { category: 'Vectors / matrices', categoryOrder: 1.5, label: "TRAN" });


// Cofactor expansion through _scalarBinary, so Integer and Symbolic entries stay exact.
function _detCofactor(rows) {
  checkTimeLimit();
  const n = rows.length;
  if (n === 1) return rows[0][0];
  if (n === 2) {
    const ad = _scalarBinary('*', rows[0][0], rows[1][1]);
    const bc = _scalarBinary('*', rows[0][1], rows[1][0]);
    return _scalarBinary('-', ad, bc);
  }
  let det = null;
  for (let j = 0; j < n; j++) {
    const minor = rows.slice(1).map(row => row.filter((_, k) => k !== j));
    const cof = _detCofactor(minor);
    const term = _scalarBinary('*', rows[0][j], cof);
    det = (det === null) ? term : _scalarBinary((j & 1) === 1 ? '-' : '+', det, term);
  }
  return det;
}

// Cofactor expansion is O(n!), so bigger numeric matrices are eliminated instead.
const ELIMINATION_MIN = 6;

// Fraction-free (Bareiss) elimination: every division is exact, so an integer matrix gives an integer.
function _detBareiss(rows) {
  const n = rows.length;
  const a = rows.map((row) => row.map((x) => x.value));
  let sign = 1n;
  let prev = 1n;
  for (let k = 0; k < n - 1; k++) {
    if (a[k][k] === 0n) {
      const p = a.findIndex((row, i) => i > k && row[k] !== 0n);
      if (p < 0) return 0n;
      [a[k], a[p]] = [a[p], a[k]];
      sign = -sign;
    }
    for (let i = k + 1; i < n; i++) {
      checkTimeLimit();
      for (let j = k + 1; j < n; j++) a[i][j] = (a[i][j] * a[k][k] - a[i][k] * a[k][j]) / prev;
    }
    prev = a[k][k];
  }
  return sign * a[n - 1][n - 1];
}

function _entryMagnitude(x) {
  if (isRational(x)) return Math.abs(Number(x.n) / Number(x.d));
  return _magEntry(x);
}

// Gaussian elimination with partial pivoting; entries are combined by _scalarBinary.
function _detGauss(rows) {
  const n = rows.length;
  const a = rows.map((row) => [...row]);
  const zero = rows.some((row) => row.some((x) => isReal(x) || isComplex(x))) ? Real(0) : Integer(0n);
  let det = Integer(1n);
  for (let k = 0; k < n; k++) {
    let p = k;
    for (let i = k + 1; i < n; i++) if (_entryMagnitude(a[i][k]) > _entryMagnitude(a[p][k])) p = i;
    if (_entryMagnitude(a[p][k]) === 0) return zero;
    if (p !== k) {
      [a[k], a[p]] = [a[p], a[k]];
      det = _scalarBinary('*', det, Integer(-1n));
    }
    det = _scalarBinary('*', det, a[k][k]);
    for (let i = k + 1; i < n; i++) {
      checkTimeLimit();
      const factor = _scalarBinary('/', a[i][k], a[k][k]);
      for (let j = k + 1; j < n; j++) a[i][j] = _scalarBinary('-', a[i][j], _scalarBinary('*', factor, a[k][j]));
    }
  }
  return det;
}

const _isNumericEntry = (x) => isInteger(x) || isReal(x) || isRational(x) || isComplex(x);

function _det(rows) {
  if (rows.length >= ELIMINATION_MIN && rows.every((row) => row.every(_isNumericEntry))) {
    return rows.every((row) => row.every(isInteger)) ? Integer(_detBareiss(rows)) : _detGauss(rows);
  }
  return _detCofactor(rows);
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
  if (isMatrix(v)) {
    n = v.rows.length;
    if (n > 0 && v.rows[0].length !== n) throw new RPLError('Invalid dimension');
  } else {
    n = _wholeArg(v);
  }
  if (n <= 0) throw new RPLError('Bad argument value');
  s.push(_realMatrix(_identity(n)));
}, { category: 'Vectors / matrices', categoryOrder: 12, label: "IDN" });


register('NORM', (s) => {
  const [v] = s.popN(1);
  if (isVector(v)) {
    s.push(Real(_decimalFrobeniusNorm(v.items)));
    return;
  }
  if (isMatrix(v)) {
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


register('TRACE', (s) => {
  const [m] = s.popN(1);
  if (!isMatrix(m)) throw new RPLError('Bad argument type');
  const rows = m.rows.length;
  const cols = rows > 0 ? m.rows[0].length : 0;
  if (rows !== cols) throw new RPLError('Invalid dimension');
  s.push(_scalarSum(m.rows.map((row, i) => row[i])));
}, { category: 'Vectors / matrices', categoryOrder: 6, label: "TRACE" });


function _rowEchelon(rows, clearAbove) {
  const m = rows.length;
  if (m === 0) return [];
  const n = rows[0].length;
  if (rows.some(row => row.length !== n)) throw new RPLError('Invalid dimension');
  const a = _asNumArray2D(rows);
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
    // Pivots and eliminated entries are pinned exactly to drop floating-point residue.
    a[r][c] = 1;
    for (let i = clearAbove ? 0 : r + 1; i < m; i++) {
      if (i === r) continue;
      const f = a[i][c];
      if (Math.abs(f) < 1e-15) continue;
      for (let j = 0; j < n; j++) a[i][j] -= f * a[r][j];
      a[i][c] = 0;
    }
    r++;
  }
  return a;
}


register('RREF', (s) => {
  const [v] = s.popN(1);
  if (!isMatrix(v)) throw new RPLError('Bad argument type');
  s.push(_realMatrix(_rowEchelon(v.rows, true)));
}, { category: 'Vectors / matrices', categoryOrder: 17, label: "RREF" });


// A tolerance rather than exact zero: row operations leave floating-point residue.
register('RANK', (s) => {
  const [v] = s.popN(1);
  if (!isMatrix(v)) throw new RPLError('Bad argument type');
  const rank = _rowEchelon(v.rows, true).filter(row => row.some(x => Math.abs(x) > 1e-10)).length;
  s.push(Integer(BigInt(rank)));
}, { category: 'Vectors / matrices', categoryOrder: 8, label: "RANK" });


function _conShapeFrom(v) {
  if (isInteger(v) || isReal(v)) return { m: _wholeArg(v), n: null };
  if (isList(v)) {
    if (v.items.length === 1) return { m: _indexAsInt(v.items[0]), n: null };
    if (v.items.length === 2) return { m: _indexAsInt(v.items[0]), n: _indexAsInt(v.items[1]) };
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
  if (!(isReal(value) || isInteger(value) || isComplex(value) || isSymbolic(value))) {
    throw new RPLError('Bad argument type');
  }
  const { m, n } = _conShapeFrom(shape);
  if (m <= 0) throw new RPLError('Bad argument value');
  if (n !== null && n <= 0) throw new RPLError('Bad argument value');
  _checkCells(m, n ?? 1);
  if (n === null) {
    s.push(Vector(new Array(m).fill(value)));
  } else {
    const rows = [];
    for (let i = 0; i < m; i++) rows.push(new Array(n).fill(value));
    s.push(Matrix(rows));
  }
}, { category: 'Vectors / matrices', categoryOrder: 13, label: "CON" });


register('REF', (s) => {
  const [v] = s.popN(1);
  if (!isMatrix(v)) throw new RPLError('Bad argument type');
  s.push(_realMatrix(_rowEchelon(v.rows, false)));
}, { category: 'Vectors / matrices', categoryOrder: 16, label: "REF" });


register('HADAMARD', (s) => {
  const [a, b] = s.popN(2);
  if (isVector(a) && isVector(b)) {
    if (a.items.length !== b.items.length) throw new RPLError('Invalid dimension');
    s.push(Vector(a.items.map((x, i) => _scalarBinary('*', x, b.items[i]))));
    return;
  }
  if (isMatrix(a) && isMatrix(b)) {
    const ma = a.rows.length, na = ma > 0 ? a.rows[0].length : 0;
    const mb = b.rows.length, nb = mb > 0 ? b.rows[0].length : 0;
    if (ma !== mb || na !== nb) throw new RPLError('Invalid dimension');
    s.push(Matrix(a.rows.map((row, i) => row.map((x, j) => _scalarBinary('*', x, b.rows[i][j])))));
    return;
  }
  throw new RPLError('Bad argument type');
}, { category: 'Vectors / matrices', categoryOrder: 11, label: "HADAMARD" });


register('RANM', (s) => {
  const [shape] = s.popN(1);
  const { m, n } = _conShapeFrom(shape);
  if (m <= 0) throw new RPLError('Bad argument value');
  if (n !== null && n <= 0) throw new RPLError('Bad argument value');
  _checkCells(m, n ?? 1);
  if (n === null) {
    const v = [];
    for (let i = 0; i < m; i++) v.push(Real(nextPrngInt9()));
    s.push(Vector(v));
  } else {
    const rows = [];
    for (let i = 0; i < m; i++) {
      checkTimeLimit();
      const row = [];
      for (let j = 0; j < n; j++) row.push(Real(nextPrngInt9()));
      rows.push(row);
    }
    s.push(Matrix(rows));
  }
}, { category: 'Vectors / matrices', categoryOrder: 14, label: "RANM" });


function _asNum(x) {
  if (isInteger(x)) return Number(x.value);
  if (isReal(x)) return x.value.toNumber();
  throw new RPLError('Bad argument type');
}

function _asNumArray2D(rows) {
  return rows.map(row => row.map(_asNum));
}


function _matMulNum(a, b) {
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


function _invSquareNum(a) {
  const n = a.length;
  const ext = a.map(r => r.slice());
  const I = _identity(n);
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


// Overdetermined systems use the normal equations; underdetermined ones get the minimum-norm solution.
function _lsqSolveVec(Anum, bnum) {
  const m = Anum.length;
  const n = Anum[0].length;
  if (m === n) {
    const invA = _invSquareNum(Anum);
    return _matVecNum(invA, bnum);
  }
  const At = _transpose(Anum);
  if (m > n) {
    const AtA = _matMulNum(At, Anum);
    const Atb = _matVecNum(At, bnum);
    return _matVecNum(_invSquareNum(AtA), Atb);
  }
  const AAt = _matMulNum(Anum, At);
  const y = _matVecNum(_invSquareNum(AAt), bnum);
  return _matVecNum(At, y);
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
    const x = _lsqSolveVec(Anum, b.items.map(_asNum));
    s.push(Vector(x.map(v => Real(v))));
    return;
  }
  if (isMatrix(b)) {
    if (b.rows.length !== m) throw new RPLError('Invalid dimension');
    const bnum = _asNumArray2D(b.rows);
    const k = b.rows[0].length;
    const cols = [];
    for (let c = 0; c < k; c++) {
      cols.push(_lsqSolveVec(Anum, bnum.map(row => row[c])));
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
  const n = _indexAsInt(idx);
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
  const n = _indexAsInt(idx);
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
  const n = _indexAsInt(idx);
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
  const n = _indexAsInt(idx);
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


function _magEntry(x) {
  if (isReal(x)) return x.value.abs().toNumber();
  if (isInteger(x)) { const n = x.value; return Number(n < 0n ? -n : n); }
  if (isComplex(x)) return Math.hypot(x.re, x.im);
  throw new RPLError('Bad argument type');
}

function _colNorm(rows) {
  let best = 0;
  for (let j = 0; j < (rows[0]?.length ?? 0); j++) {
    let sum = 0;
    for (const row of rows) sum += _magEntry(row[j]);
    if (sum > best) best = sum;
  }
  return best;
}

function _rowNorm(rows) {
  let best = 0;
  for (const row of rows) {
    let sum = 0;
    for (const x of row) sum += _magEntry(x);
    if (sum > best) best = sum;
  }
  return best;
}

// A Vector counts as a column: CNRM sums its magnitudes, RNRM takes the largest.
function _normOp(norm) {
  return (s) => {
    const [v] = s.popN(1);
    if (isVector(v)) s.push(Real(norm(v.items.map(x => [x]))));
    else if (isMatrix(v)) s.push(Real(norm(v.rows)));
    else throw new RPLError('Bad argument type');
  };
}

register('CNRM', _normOp(_colNorm), { category: 'Vectors / matrices', categoryOrder: 4, label: "CNRM" });

register('RNRM', _normOp(_rowNorm), { category: 'Vectors / matrices', categoryOrder: 5, label: "RNRM" });


register('AUGMENT', (s) => {
  const [a, b] = s.popN(2);
  if (isMatrix(a) && isMatrix(b)) {
    if (a.rows.length !== b.rows.length) throw new RPLError('Invalid dimension');
    s.push(Matrix(a.rows.map((row, i) => [...row, ...b.rows[i]])));
    return;
  }
  if (isMatrix(a) && isVector(b)) {
    if (b.items.length !== a.rows.length) throw new RPLError('Invalid dimension');
    s.push(Matrix(a.rows.map((row, i) => [...row, b.items[i]])));
    return;
  }
  if (isVector(a) && isMatrix(b)) {
    if (a.items.length !== b.rows.length) throw new RPLError('Invalid dimension');
    s.push(Matrix(b.rows.map((row, i) => [a.items[i], ...row])));
    return;
  }
  if (isVector(a) && isVector(b)) {
    s.push(Vector([...a.items, ...b.items]));
    return;
  }
  throw new RPLError('Bad argument type');
}, { category: 'Vectors / matrices', categoryOrder: 18, label: "AUGMENT" });

// AUR: →ROW takes a matrix apart into its rows and ROW→ puts rows back together, as →COL and COL→ do with columns.
register('→ROW',  _rowDecompose, { category: 'Vectors / matrices', categoryOrder: 24, label: "→ROW" });

register('ROW→',  _rowCompose, { category: 'Vectors / matrices', categoryOrder: 25, label: "ROW→" });

register('→COL',  _colDecompose, { category: 'Vectors / matrices', categoryOrder: 26, label: "→COL" });

register('COL→',  _colCompose, { category: 'Vectors / matrices', categoryOrder: 27, label: "COL→" });


register('RSWP', (s) => {
  const [M, iv, jv] = s.popN(3);
  if (!isMatrix(M)) throw new RPLError('Bad argument type');
  const i = _indexAsInt(iv);
  const j = _indexAsInt(jv);
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
  const i = _indexAsInt(iv);
  const j = _indexAsInt(jv);
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
  const i = _indexAsInt(iv);
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
  const i = _indexAsInt(iv);
  const j = _indexAsInt(jv);
  const m = M.rows.length;
  if (i < 1 || i > m || j < 1 || j > m) {
    throw new RPLError('Invalid dimension');
  }
  // Read row i from the original so that i === j scales the row by (1 + c).
  const origSrc = M.rows[i - 1].slice();
  const rows = M.rows.map(r => r.slice());
  const dst = rows[j - 1];
  for (let k = 0; k < dst.length; k++) {
    const scaled = _scalarBinary('*', c, origSrc[k]);
    dst[k] = _scalarBinary('+', dst[k], scaled);
  }
  s.push(Matrix(rows));
}, { category: 'Vectors / matrices', categoryOrder: 31, label: "RCIJ" });


register('VANDERMONDE', (s) => {
  const [v] = s.popN(1);
  if (!isList(v) && !isVector(v)) throw new RPLError('Bad argument type');
  const src = v.items;
  const n = src.length;
  if (n < 1) throw new RPLError('Bad argument value');
  for (const x of src) {
    if (!isReal(x) && !isInteger(x) && !isComplex(x) && !_isSymOperand(x)) {
      throw new RPLError('Bad argument type');
    }
  }
  const rows = [];
  for (let i = 0; i < n; i++) {
    const vi = src[i];
    const row = new Array(n);
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
  const n = _wholeArg(v);
  if (n < 1) throw new RPLError('Bad argument value');
  _checkCells(n, n);
  const rows = [];
  for (let i = 1; i <= n; i++) {
    checkTimeLimit();
    const row = new Array(n);
    for (let j = 1; j <= n; j++) {
      row[j - 1] = Real(1 / (i + j - 1));
    }
    rows.push(row);
  }
  s.push(Matrix(rows));
}, { category: 'Vectors / matrices', categoryOrder: 43, label: "HILBERT" });


// piv[i] is the row of A that lands in row i of P·A.
register('LU', (s) => {
  const [A] = s.popN(1);
  if (!isMatrix(A)) throw new RPLError('Bad argument type');
  const n = A.rows.length;
  if (n === 0 || A.rows[0].length !== n) {
    throw new RPLError('Invalid dimension');
  }
  const M = _asNumArray2D(A.rows);
  const piv = new Array(n);
  for (let i = 0; i < n; i++) piv[i] = i;
  for (let k = 0; k < n; k++) {
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
    const pivv = M[k][k];
    for (let i = k + 1; i < n; i++) {
      M[i][k] /= pivv;
      const mik = M[i][k];
      for (let j = k + 1; j < n; j++) {
        M[i][j] -= mik * M[k][j];
      }
    }
  }
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


// Modified Gram-Schmidt on the columns of an m×n A (n ≤ m).
function _gramSchmidtNum(A) {
  const m = A.length;
  const n = A[0].length;
  if (n > m) throw new RPLError('Invalid dimension');
  const cols = _transpose(A);
  const Q = [];
  for (let k = 0; k < n; k++) {
    let v = cols[k].slice();
    for (let j = 0; j < k; j++) {
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
  return _transpose(Q, m);
}


register('GRAMSCHMIDT', (s) => {
  const [A] = s.popN(1);
  if (!isMatrix(A)) throw new RPLError('Bad argument type');
  if (A.rows.length === 0) throw new RPLError('Invalid dimension');
  s.push(_realMatrix(_gramSchmidtNum(_asNumArray2D(A.rows))));
}, { category: 'Vectors / matrices', categoryOrder: 37, label: "GRAMSCHMIDT" });


// No column pivoting, so P is always the identity.
register('QR', (s) => {
  const [A] = s.popN(1);
  if (!isMatrix(A)) throw new RPLError('Bad argument type');
  const m = A.rows.length;
  const n = m > 0 ? A.rows[0].length : 0;
  if (n === 0 || m < n) throw new RPLError('Invalid dimension');
  const Anum = _asNumArray2D(A.rows);
  const Qnum = _gramSchmidtNum(Anum);
  const R = [];
  for (let j = 0; j < n; j++) {
    const row = new Array(n).fill(0);
    for (let k = j; k < n; k++) {
      let acc = 0;
      for (let i = 0; i < m; i++) acc += Qnum[i][j] * Anum[i][k];
      row[k] = acc;
    }
    R.push(row);
  }
  s.push(_realMatrix(Qnum));
  s.push(_realMatrix(R));
  s.push(_realMatrix(_identity(n)));
}, { category: 'Vectors / matrices', categoryOrder: 34, label: "QR" });


register('CHOLESKY', (s) => {
  const [A] = s.popN(1);
  if (!isMatrix(A)) throw new RPLError('Bad argument type');
  const n = A.rows.length;
  if (n === 0 || A.rows[0].length !== n) {
    throw new RPLError('Invalid dimension');
  }
  const M = _asNumArray2D(A.rows);
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
  s.push(_realMatrix(L));
}, { category: 'Vectors / matrices', categoryOrder: 36, label: "CHOLESKY" });


function _shapeFromList(L) {
  if (!isList(L)) throw new RPLError('Bad argument type');
  if (L.items.length !== 1 && L.items.length !== 2) throw new RPLError('Bad argument value');
  const dims = L.items.map(x => _indexAsInt(x));
  if (dims.some(d => d <= 0)) throw new RPLError('Bad argument value');
  return dims.length === 1 ? { rows: null, cols: dims[0] } : { rows: dims[0], cols: dims[1] };
}


register('RDM', (s) => {
  const [src, shape] = s.popN(2);
  const { rows, cols } = _shapeFromList(shape);
  let flat;
  if (isVector(src)) {
    flat = src.items.slice();
  } else if (isMatrix(src)) {
    flat = src.rows.flat();
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


// LQ(A) is the transpose of QR(Aᵀ): with Aᵀ = Q₁R₁, L = R₁ᵀ and Q = Q₁ᵀ.
register('LQ', (s) => {
  const [A] = s.popN(1);
  if (!isMatrix(A)) throw new RPLError('Bad argument type');
  const m = A.rows.length;
  const n = m > 0 ? A.rows[0].length : 0;
  if (n === 0 || m > n) throw new RPLError('Invalid dimension');
  const AtNum = _transpose(_asNumArray2D(A.rows));
  const Q1 = _gramSchmidtNum(AtNum);
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
  s.push(_realMatrix(_transpose(R1)));
  s.push(_realMatrix(_transpose(Q1)));
  s.push(_realMatrix(_identity(m)));
}, { category: 'Vectors / matrices', categoryOrder: 35, label: "LQ" });


register('COND', (s) => {
  const [A] = s.popN(1);
  if (!isMatrix(A)) throw new RPLError('Bad argument type');
  const m = A.rows.length;
  if (m === 0) throw new RPLError('Invalid dimension');
  const n = A.rows[0].length;
  if (m !== n) throw new RPLError('Invalid dimension');
  s.push(Real(_colNorm(A.rows) * _colNorm(_invMatrixNumeric(A.rows))));
}, { category: 'Vectors / matrices', categoryOrder: 7, label: "COND" });


function _polyScale(arr, k) {
  return arr.map(c => c * k);
}


function _polyShiftUp(arr) {
  return arr.concat([0]);
}


function _polyAdd(a, b) {
  const la = a.length, lb = b.length;
  const L = Math.max(la, lb);
  const out = new Array(L).fill(0);
  for (let i = 0; i < la; i++) out[L - la + i] += a[i];
  for (let i = 0; i < lb; i++) out[L - lb + i] += b[i];
  return out;
}


// p₀ = 1, p₁ given, p_{k+1} = step(p_k, p_{k-1}, k); coefficients in descending degree.
function _recurrencePoly(n, p1, step) {
  if (n === 0) return [1];
  let prev = [1];
  let curr = p1;
  for (let k = 1; k < n; k++) {
    checkTimeLimit();
    [prev, curr] = [curr, step(curr, prev, k)];
  }
  return curr;
}

const _chebyshevStep = (p, prev) => _polyAdd(_polyScale(_polyShiftUp(p), 2), _polyScale(prev, -1));


register('HERMITE', (s) => {
  const [v] = s.popN(1);
  const n = _nFromIntegerArg(v);
  s.push(_coefArrToSymbolicX(_recurrencePoly(n, [2, 0],
    (p, prev, k) => _polyAdd(_polyScale(_polyShiftUp(p), 2), _polyScale(prev, -2 * k)))));
}, { category: 'Vectors / matrices', categoryOrder: 38, label: "HERMITE" });


register('LEGENDRE', (s) => {
  const [v] = s.popN(1);
  const n = _nFromIntegerArg(v);
  s.push(_coefArrToSymbolicX(_recurrencePoly(n, [1, 0],
    (p, prev, k) => _polyScale(_polyAdd(_polyScale(_polyShiftUp(p), 2 * k + 1), _polyScale(prev, -k)), 1 / (k + 1)))));
}, { category: 'Vectors / matrices', categoryOrder: 39, label: "LEGENDRE" });


// n ≥ 0 gives the first-kind T_n; a negative n gives the second-kind U_{|n|-1} (AUR §12.5).
function _tchebOp(s) {
  const [v] = s.popN(1);
  const n = _wholeArg(v);
  const poly = n >= 0
    ? _recurrencePoly(n, [1, 0], _chebyshevStep)
    : _recurrencePoly(-n - 1, [2, 0], _chebyshevStep);
  s.push(_coefArrToSymbolicX(poly));
}

register('TCHEBYCHEFF', _tchebOp, { category: 'Vectors / matrices', categoryOrder: 41, label: "TCHEBYCHEFF" });

register('TCHEB',       _tchebOp, { category: 'Vectors / matrices', categoryOrder: 40, label: "TCHEB" });


register('AXL', (s) => {
  const [v] = s.popN(1);
  if (isVector(v)) {
    s.push(RList([...v.items]));
    return;
  }
  if (isMatrix(v)) {
    s.push(RList(v.rows.map(row => RList([...row]))));
    return;
  }
  if (isList(v)) {
    s.push(v);
    return;
  }
  throw new RPLError('Bad argument type');
}, { category: 'Vectors / matrices', categoryOrder: 44, label: "AXL" });


register('AXM', (s) => {
  const [v] = s.popN(1);
  if (isVector(v) || isMatrix(v)) {
    s.push(v);
    return;
  }
  if (!isList(v)) throw new RPLError('Bad argument type');
  const items = v.items;
  if (items.length === 0) throw new RPLError('Bad argument value');
  if (!items.some(isList)) {
    s.push(Vector([...items]));
    return;
  }
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


register('CHARPOL', (s) => { OPS.get('PCAR').fn(s); }, { category: 'Vectors / matrices', categoryOrder: 47, label: "CHARPOL" });


function _eigenvalues(matStr) {
  const raw = giac.caseval(`eigenvals(${matStr})`);
  const parts = splitGiacList(/^[[a-z]/.test(raw) ? raw : `[${raw}]`);
  if (parts === null) throw new RPLError('Bad argument value');
  return parts.map((elt) => _astToRplValue(giacToAst(elt)));
}

register('EGVL', (s) => {
  const { matrix } = _popSquareMatrix(s);
  if (!giac.isReady()) throw new RPLError('CAS not ready');
  s.push(Vector(_eigenvalues(_matrixToGiacStr(matrix))));
}, { category: 'Vectors / matrices', categoryOrder: 49, label: "EGVL" });


// Xcas egv(M) is the eigenvector matrix (columns match eigenvals order);
// egvl(M), despite the name, is the diagonal eigenvalue matrix.
register('EGV', (s) => {
  const { matrix } = _popSquareMatrix(s);
  if (!giac.isReady()) throw new RPLError('CAS not ready');
  const matStr = _matrixToGiacStr(matrix);

  const evecRaw = giac.caseval(`egv(${matStr})`);
  const evecRows = splitGiacList(evecRaw);
  if (evecRows === null) throw new RPLError('Bad argument value');
  const matrixRows = evecRows.map((rowStr) => {
    const cols = splitGiacList(rowStr);
    if (cols === null) throw new RPLError('Bad argument value');
    return cols.map((c) => _astToRplValue(giacToAst(c)));
  });

  const evalItems = _eigenvalues(matStr);

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


register('RSD', (s) => {
  const [B, A, Z] = s.popN(3);
  if (!isMatrix(A)) throw new RPLError('Bad argument type');

  const m = A.rows.length;
  const k = m > 0 ? A.rows[0].length : 0;
  if (m === 0 || k === 0) throw new RPLError('Invalid dimension');

  const aNum = _asNumArray2D(A.rows);

  if (isVector(B) && isVector(Z)) {
    if (Z.items.length !== k) throw new RPLError('Invalid dimension');
    if (B.items.length !== m) throw new RPLError('Invalid dimension');
    const bNum = B.items.map(_asNum);
    const az = _matVecNum(aNum, Z.items.map(_asNum));
    s.push(Vector(bNum.map((b, i) => Real(b - az[i]))));
    return;
  }

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
    const az = _matMulNum(aNum, _asNumArray2D(Z.rows));
    s.push(_realMatrix(bNum.map((row, i) => row.map((b, j) => b - az[i][j]))));
    return;
  }

  throw new RPLError('Bad argument type');
}, { category: 'Vectors / matrices', categoryOrder: 19, label: "RSD" });
