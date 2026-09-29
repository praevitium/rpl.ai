import { isReal, isInteger, isComplex, Complex, Real, Vector, isVector, isMatrix, Symbolic, Str, isBinaryInteger } from '../types.js';
import { RPLError } from '../stack.js';
import { Var as AstVar, Bin as AstBin, Num as AstNum, Fn as AstFn } from '../algebra.js';
import { setLastFitModel, FIT_KINDS, evalFitModel, getLastFitModel } from '../state.js';
import { register } from './registry.js';

// These ops take the data as an argument instead of reading ΣDAT.  In a
// Matrix each column is a variable and each row an observation; a Vector is
// a single variable.

function _statsNumericEntry(x) {
  if (isReal(x))    return x.value.toNumber();
  if (isInteger(x)) return Number(x.value);
  throw new RPLError('Bad argument type');
}

function _statsNumbers(items) {
  if (items.length === 0) throw new RPLError('Bad argument value');
  return items.map(_statsNumericEntry);
}

function _sumOfArr(a) { let s = 0; for (const x of a) s += x; return s; }

function _meanArr(a) { return _sumOfArr(a) / a.length; }

function _sumOfProd(a, b) {
  let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

// Sample variance, n - 1 denominator.
function _varArr(A) {
  const m = _meanArr(A);
  let s = 0;
  for (const x of A) { const d = x - m; s += d * d; }
  return s / (A.length - 1);
}

function _covArr(X, Y) {
  const mX = _meanArr(X), mY = _meanArr(Y);
  let s = 0;
  for (let i = 0; i < X.length; i++) s += (X[i] - mX) * (Y[i] - mY);
  return s / (X.length - 1);
}

// TOT and MEAN also accept Complex entries; any Complex makes the result Complex.
function _complexSum(items) {
  if (items.length === 0) throw new RPLError('Bad argument value');
  let re = 0, im = 0, complex = false;
  for (const x of items) {
    if (isComplex(x)) { re += x.re; im += x.im; complex = true; }
    else re += _statsNumericEntry(x);
  }
  return { re, im, complex };
}

function _sumItems(items) {
  const { re, im, complex } = _complexSum(items);
  return complex ? Complex(re, im) : Real(re);
}

function _meanItems(items) {
  const { re, im, complex } = _complexSum(items);
  const n = items.length;
  return complex ? Complex(re / n, im / n) : Real(re / n);
}

// A single observation has zero spread (HP50 AUR §18.1).
function _varItems(items) {
  const xs = _statsNumbers(items);
  return xs.length === 1 ? 0 : _varArr(xs);
}

function _medianItems(items) {
  const arr = _statsNumbers(items).sort((a, b) => a - b);
  const n = arr.length;
  if ((n & 1) === 1) return arr[(n - 1) >> 1];
  return (arr[n / 2 - 1] + arr[n / 2]) / 2;
}

function _madItems(items) {
  const xs = _statsNumbers(items);
  if (xs.length === 1) return 0;
  const mean = _meanArr(xs);
  return _meanArr(xs.map((x) => Math.abs(x - mean)));
}

function _perColumn(M, reduce) {
  if (M.rows.length === 0) throw new RPLError('Bad argument value');
  const n = M.rows[0].length;
  const out = new Array(n);
  for (let j = 0; j < n; j++) out[j] = reduce(M.rows.map((row) => row[j]));
  return Vector(out);
}

// A Vector gives one result, a Matrix a Vector of per-column results.
function _columnStat(reduce, wrapVectorResult = (r) => r) {
  return (s) => {
    const [v] = s.popN(1);
    if (isVector(v)) s.push(wrapVectorResult(reduce(v.items)));
    else if (isMatrix(v)) s.push(_perColumn(v, reduce));
    else throw new RPLError('Bad argument type');
  };
}

const _asReal = (reduce) => (items) => Real(reduce(items));

register('TOT', _columnStat(_sumItems), { category: 'Statistics', categoryOrder: 6, label: "TOT" });

register('MEAN', _columnStat(_meanItems), { category: 'Statistics', categoryOrder: 0, label: "MEAN" });

register('VAR', _columnStat(_asReal(_varItems)), { category: 'Statistics', categoryOrder: 2, label: "VAR" });

register('SDEV', _columnStat(_asReal((items) => Math.sqrt(_varItems(items)))), { category: 'Statistics', categoryOrder: 3, label: "SDEV" });

register('MEDIAN', _columnStat(_asReal(_medianItems)), { category: 'Statistics', categoryOrder: 1, label: "MEDIAN" });

// m×2 Matrix with m >= 2: column 1 is X, column 2 is Y.
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
  return { X, Y };
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
}, { category: 'Statistics', categoryOrder: 22, label: "CORR" });

function _matStatsCol(M, j) {
  if (M.rows.length === 0) throw new RPLError('Bad argument value');
  return M.rows.map((row) => _statsNumericEntry(row[j]));
}

// ΣX, ΣX2 and NΣ also take a Vector; the sums involving Y need a Matrix
// with at least two columns.
function _xColumn(v) {
  if (isVector(v)) return _statsNumbers(v.items);
  if (isMatrix(v)) return _matStatsCol(v, 0);
  throw new RPLError('Bad argument type');
}

function _requireXY(M) {
  if (!isMatrix(M)) throw new RPLError('Bad argument type');
  if (M.rows.length === 0) throw new RPLError('Bad argument value');
  if (M.rows[0].length < 2) throw new RPLError('Invalid dimension');
}

function _countOp(s) {
  const [M] = s.popN(1);
  let n;
  if (isVector(M)) n = M.items.length;
  else if (isMatrix(M)) n = M.rows.length;
  else throw new RPLError('Bad argument type');
  if (n === 0) throw new RPLError('Bad argument value');
  s.push(Real(n));
}

register('NSIGMA', _countOp, { category: 'Statistics', categoryOrder: 5, label: "NSIGMA" });

register('NΣ', _countOp, { category: 'Statistics', categoryOrder: 19, label: "NΣ" });

function _sumXOp(s) {
  const [v] = s.popN(1);
  s.push(Real(_sumOfArr(_xColumn(v))));
}

register('ΣX', _sumXOp, { category: 'Statistics', categoryOrder: 14, label: "ΣX" });

register('SX', _sumXOp, { category: 'Statistics', categoryOrder: 9, label: "SX" });

function _sumX2Op(s) {
  const [v] = s.popN(1);
  const X = _xColumn(v);
  s.push(Real(_sumOfProd(X, X)));
}

register('ΣX2', _sumX2Op, { category: 'Statistics', categoryOrder: 15, label: "ΣX2" });

register('SX2', _sumX2Op, { category: 'Statistics', categoryOrder: 10, label: "SX2" });

function _sumYOp(s) {
  const [M] = s.popN(1);
  _requireXY(M);
  s.push(Real(_sumOfArr(_matStatsCol(M, 1))));
}

register('ΣY', _sumYOp, { category: 'Statistics', categoryOrder: 16, label: "ΣY" });

register('SY', _sumYOp, { category: 'Statistics', categoryOrder: 11, label: "SY" });

function _sumY2Op(s) {
  const [M] = s.popN(1);
  _requireXY(M);
  const Y = _matStatsCol(M, 1);
  s.push(Real(_sumOfProd(Y, Y)));
}

register('ΣY2', _sumY2Op, { category: 'Statistics', categoryOrder: 17, label: "ΣY2" });

register('SY2', _sumY2Op, { category: 'Statistics', categoryOrder: 12, label: "SY2" });

function _sumXYOp(s) {
  const [M] = s.popN(1);
  _requireXY(M);
  s.push(Real(_sumOfProd(_matStatsCol(M, 0), _matStatsCol(M, 1))));
}

register('ΣXY', _sumXYOp, { category: 'Statistics', categoryOrder: 18, label: "ΣXY" });

register('SXY', _sumXYOp, { category: 'Statistics', categoryOrder: 13, label: "SXY" });

// For Vector input MAXΣ / MINΣ return a 1-element Vector, not a scalar.
const _maxOp = _columnStat(_asReal((items) => Math.max(..._statsNumbers(items))), (r) => Vector([r]));
const _minOp = _columnStat(_asReal((items) => Math.min(..._statsNumbers(items))), (r) => Vector([r]));

register('MAXΣ', _maxOp, { category: 'Statistics', categoryOrder: 20, label: "MAXΣ" });

register('MAXS', _maxOp, { category: 'Statistics', categoryOrder: 7, label: "MAXS" });

register('MINΣ', _minOp, { category: 'Statistics', categoryOrder: 21, label: "MINΣ" });

register('MINS', _minOp, { category: 'Statistics', categoryOrder: 8, label: "MINS" });

function _linearFit(X, Y) {
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

function _requirePositive(values) {
  for (const x of values) if (x <= 0) throw new RPLError('Bad argument value');
}

// Each model is a linear fit of transformed data: y = a + b·x,
// y = a + b·ln x, y = a·e^(b·x) and y = a·x^b.
const FITS = {
  LIN: (X, Y) => _linearFit(X, Y),
  LOG: (X, Y) => {
    _requirePositive(X);
    return _linearFit(X.map(Math.log), Y);
  },
  EXP: (X, Y) => {
    _requirePositive(Y);
    const fit = _linearFit(X, Y.map(Math.log));
    return { ...fit, a: Math.exp(fit.a) };
  },
  PWR: (X, Y) => {
    _requirePositive(X);
    _requirePositive(Y);
    const fit = _linearFit(X.map(Math.log), Y.map(Math.log));
    return { ...fit, a: Math.exp(fit.a) };
  },
};

function _fit(kind, M) {
  const { X, Y } = _twoColsOrThrow(M);
  return FITS[kind](X, Y);
}

function _modelToSym(kind, a, b) {
  const X = AstVar('X'), A = AstNum(a), B = AstNum(b);
  switch (kind) {
    case 'LIN': return Symbolic(AstBin('+', A, AstBin('*', B, X)));
    case 'LOG': return Symbolic(AstBin('+', A, AstBin('*', B, AstFn('LN', [X]))));
    case 'EXP': return Symbolic(AstBin('*', A, AstFn('EXP', [AstBin('*', B, X)])));
    case 'PWR': return Symbolic(AstBin('*', A, AstBin('^', X, B)));
  }
}

function _fitOp(kind) {
  return (s) => {
    const [M] = s.popN(1);
    const { a, b, r } = _fit(kind, M);
    if (!Number.isFinite(a) || !Number.isFinite(b)) throw new RPLError('Infinite result');
    setLastFitModel(kind, a, b);
    s.push(_modelToSym(kind, a, b));
    s.push(Real(r));
  };
}

register('LINFIT', _fitOp('LIN'), { category: 'Statistics', categoryOrder: 24, label: "LINFIT" });

register('LOGFIT', _fitOp('LOG'), { category: 'Statistics', categoryOrder: 25, label: "LOGFIT" });

register('EXPFIT', _fitOp('EXP'), { category: 'Statistics', categoryOrder: 26, label: "EXPFIT" });

register('PWRFIT', _fitOp('PWR'), { category: 'Statistics', categoryOrder: 27, label: "PWRFIT" });

// BESTFIT names the family with the largest |r| (ties go to the earlier one)
// and leaves the model PREDV / PREDX use unchanged.
register('BESTFIT', (s) => {
  const [M] = s.popN(1);
  let best = null;
  for (const kind of FIT_KINDS) {
    let r;
    try { ({ r } = _fit(kind, M)); } catch (_) { continue; }
    if (!best || Math.abs(r) > Math.abs(best.r)) best = { kind, r };
  }
  if (!best) {
    _fit('LIN', M);   // rethrows the underlying error
    throw new RPLError('Bad argument value');
  }
  s.push(Str(best.kind));
}, { category: 'Statistics', categoryOrder: 28, label: "BESTFIT" });

register('MAD', _columnStat(_asReal(_madItems)), { category: 'Statistics', categoryOrder: 4, label: "MAD" });

function _fitScalar(v) {
  if (isReal(v))    return v.value.toNumber();
  if (isInteger(v)) return Number(v.value);
  if (isBinaryInteger(v)) return Number(v.value);
  throw new RPLError('Bad argument type');
}

function _lastFitModel() {
  const model = getLastFitModel();
  if (!model) throw new RPLError('Undefined name');
  return model;
}

// Solves y = f(x) for x; null where the model has no real inverse.
function _invertFitModel({ kind, a, b }, y) {
  if (b === 0) return null;
  switch (kind) {
    case 'LIN': return (y - a) / b;
    case 'LOG': return Math.exp((y - a) / b);
    case 'EXP': return a !== 0 && y / a > 0 ? Math.log(y / a) / b : null;
    case 'PWR': return a !== 0 && y / a > 0 ? Math.pow(y / a, 1 / b) : null;
    default: return null;
  }
}

register('PREDV', (s) => {
  const [xv] = s.popN(1);
  const model = _lastFitModel();
  const y = evalFitModel(model, _fitScalar(xv));
  if (!Number.isFinite(y)) throw new RPLError('Infinite result');
  s.push(Real(y));
}, { category: 'Statistics', categoryOrder: 29, label: "PREDV" });

register('PREDX', (s) => {
  const [yv] = s.popN(1);
  const model = _lastFitModel();
  const x = _invertFitModel(model, _fitScalar(yv));
  if (x === null || !Number.isFinite(x)) throw new RPLError('Infinite result');
  s.push(Real(x));
}, { category: 'Statistics', categoryOrder: 30, label: "PREDX" });
