import { isReal, isInteger, isComplex, Complex, Real, Vector, isVector, isMatrix, Matrix, Symbolic, isBinaryInteger, isList, RList, isName, isString, Name, Tagged } from '../types.js';
import { RPLError } from '../stack.js';
import { Var as AstVar, Bin as AstBin, Num as AstNum, Fn as AstFn } from '../algebra.js';
import { setLastFitModel, FIT_KINDS, evalFitModel, getLastFitModel, varRecall, varStore, varPurge } from '../state.js';
import { register, lookup } from './registry.js';

// These ops take the data from level 1 when an array is there, and read the
// reserved variable ΣDAT otherwise, as on the HP.  In a Matrix each column is
// a variable and each row an observation; a Vector is a single variable.

function _statsNumericEntry(x) {
  if (isReal(x))    return x.value.toNumber();
  if (isInteger(x)) return Number(x.value);
  throw new RPLError('Bad argument type');
}

function _statsNumbers(items) {
  if (items.length === 0) throw new RPLError('Bad argument value');
  return items.map(_statsNumericEntry);
}

function _sigmaData() {
  const data = varRecall('ΣDAT');
  if (data === undefined) throw new RPLError('Nonexistent ΣDAT');
  if (!isMatrix(data) && !isVector(data)) throw new RPLError('Invalid ΣDATA');
  return data;
}

function _popData(s) {
  const top = s.depth ? s.peek(1) : null;
  return isVector(top) || isMatrix(top) ? s.pop() : _sigmaData();
}

// ΣPAR holds { xcol ycol intercept slope model }, as on the HP; XCOL, YCOL,
// the fits and LR each set their part of it.
const _sigmaParDefault = () => [Real(1), Real(2), Real(0), Real(0), Name('LINFIT')];

function _sigmaPar() {
  const par = varRecall('ΣPAR');
  const items = isList(par) ? par.items : [];
  return _sigmaParDefault().map((v, i) => items[i] ?? v);
}

function _setSigmaPar(changes) {
  const items = _sigmaPar();
  for (const [i, v] of Object.entries(changes)) items[i] = v;
  varStore('ΣPAR', RList(items));
}

function _columnIndex(v) {
  const n = isReal(v) || isInteger(v) ? Number(v.value.toString()) : NaN;
  if (!Number.isInteger(n) || n < 1) throw new RPLError('Invalid ΣPAR');
  return n - 1;
}

// The independent and dependent columns, 0-based, from XCOL and YCOL.
function _dataColumns() {
  const [x, y] = _sigmaPar();
  return [_columnIndex(x), _columnIndex(y)];
}

const FIT_NAMES = { LINFIT: 'LIN', LOGFIT: 'LOG', EXPFIT: 'EXP', PWRFIT: 'PWR' };

function _parModelKind() {
  const model = _sigmaPar()[4];
  const kind = FIT_NAMES[isName(model) ? model.id : isString(model) ? model.value : ''];
  if (!kind) throw new RPLError('Invalid ΣPAR');
  return kind;
}

function _rememberFit(kind, a, b) {
  setLastFitModel(kind, a, b);
  _setSigmaPar({ 2: Real(a), 3: Real(b), 4: Name(`${kind}FIT`) });
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

// AUR: one result per column as a vector, or the result itself for a single column.
function _perColumn(M, reduce) {
  if (M.rows.length === 0) throw new RPLError('Bad argument value');
  const n = M.rows[0].length;
  const out = new Array(n);
  for (let j = 0; j < n; j++) out[j] = reduce(M.rows.map((row) => row[j]));
  return n === 1 ? out[0] : Vector(out);
}

// A Vector gives one result, a Matrix a Vector of per-column results.
function _columnStat(reduce, wrapVectorResult = (r) => r) {
  return (s) => {
    const v = _popData(s);
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

// The population forms divide by n where VAR, SDEV and COV divide by n - 1.
const _populationItems = (items) => {
  const xs = _statsNumbers(items);
  return xs.length === 1 ? 0 : _varArr(xs) * (xs.length - 1) / xs.length;
};

register('PVAR', _columnStat(_asReal(_populationItems)), { category: 'Statistics', categoryOrder: 2.5, label: "PVAR" });

register('PSDEV', _columnStat(_asReal((items) => Math.sqrt(_populationItems(items)))), { category: 'Statistics', categoryOrder: 3.5, label: "PSDEV" });

register('MEDIAN', _columnStat(_asReal(_medianItems)), { category: 'Statistics', categoryOrder: 1, label: "MEDIAN" });

// A Matrix with at least two rows: the XCOL column is X, the YCOL column is Y.
function _twoColsOrThrow(M) {
  _requireXY(M);
  if (M.rows.length < 2) throw new RPLError('Bad argument value');
  const [xcol, ycol] = _dataColumns();
  return { X: _matStatsCol(M, xcol), Y: _matStatsCol(M, ycol) };
}

register('COV', (s) => {
  const M = _popData(s);
  const { X, Y } = _twoColsOrThrow(M);
  s.push(Real(_covArr(X, Y)));
}, { category: 'Statistics', categoryOrder: 23, label: "COV" });

register('PCOV', (s) => {
  const M = _popData(s);
  const { X, Y } = _twoColsOrThrow(M);
  s.push(Real(_covArr(X, Y) * (X.length - 1) / X.length));
}, { category: 'Statistics', categoryOrder: 23.5, label: "PCOV" });

register('CORR', (s) => {
  const M = _popData(s);
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
// with the XCOL and YCOL columns in it.
function _xColumn(v) {
  if (isVector(v)) return _statsNumbers(v.items);
  if (!isMatrix(v)) throw new RPLError('Bad argument type');
  if (v.rows.length === 0) throw new RPLError('Bad argument value');
  const [xcol] = _dataColumns();
  if (xcol >= v.rows[0].length) throw new RPLError('Invalid dimension');
  return _matStatsCol(v, xcol);
}

function _requireXY(M) {
  if (!isMatrix(M)) throw new RPLError('Bad argument type');
  if (M.rows.length === 0) throw new RPLError('Bad argument value');
  if (Math.max(..._dataColumns()) >= M.rows[0].length) throw new RPLError('Invalid dimension');
}

const _yColumn = (M) => _matStatsCol(M, _dataColumns()[1]);

function _countOp(s) {
  const M = _popData(s);
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
  const v = _popData(s);
  s.push(Real(_sumOfArr(_xColumn(v))));
}

register('ΣX', _sumXOp, { category: 'Statistics', categoryOrder: 14, label: "ΣX" });

register('SX', _sumXOp, { category: 'Statistics', categoryOrder: 9, label: "SX" });

function _sumX2Op(s) {
  const v = _popData(s);
  const X = _xColumn(v);
  s.push(Real(_sumOfProd(X, X)));
}

register('ΣX2', _sumX2Op, { category: 'Statistics', categoryOrder: 15, label: "ΣX2" });

register('SX2', _sumX2Op, { category: 'Statistics', categoryOrder: 10, label: "SX2" });

function _sumYOp(s) {
  const M = _popData(s);
  _requireXY(M);
  s.push(Real(_sumOfArr(_yColumn(M))));
}

register('ΣY', _sumYOp, { category: 'Statistics', categoryOrder: 16, label: "ΣY" });

register('SY', _sumYOp, { category: 'Statistics', categoryOrder: 11, label: "SY" });

function _sumY2Op(s) {
  const M = _popData(s);
  _requireXY(M);
  const Y = _yColumn(M);
  s.push(Real(_sumOfProd(Y, Y)));
}

register('ΣY2', _sumY2Op, { category: 'Statistics', categoryOrder: 17, label: "ΣY2" });

register('SY2', _sumY2Op, { category: 'Statistics', categoryOrder: 12, label: "SY2" });

function _sumXYOp(s) {
  const M = _popData(s);
  _requireXY(M);
  s.push(Real(_sumOfProd(_xColumn(M), _yColumn(M))));
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
  const X = AstVar('X'), A = AstNum(Number(a.toPrecision(12))), B = AstNum(Number(b.toPrecision(12)));
  switch (kind) {
    case 'LIN': return Symbolic(AstBin('+', A, AstBin('*', B, X)));
    case 'LOG': return Symbolic(AstBin('+', A, AstBin('*', B, AstFn('LN', [X]))));
    case 'EXP': return Symbolic(AstBin('*', A, AstFn('EXP', [AstBin('*', B, X)])));
    case 'PWR': return Symbolic(AstBin('*', A, AstBin('^', X, B)));
  }
}

function _fitOp(kind) {
  return (s) => {
    const M = _popData(s);
    const { a, b, r } = _fit(kind, M);
    if (!Number.isFinite(a) || !Number.isFinite(b)) throw new RPLError('Infinite result');
    _rememberFit(kind, a, b);
    s.push(_modelToSym(kind, a, b));
    s.push(Real(r));
  };
}

register('LINFIT', _fitOp('LIN'), { category: 'Statistics', categoryOrder: 24, label: "LINFIT" });

register('LOGFIT', _fitOp('LOG'), { category: 'Statistics', categoryOrder: 25, label: "LOGFIT" });

register('EXPFIT', _fitOp('EXP'), { category: 'Statistics', categoryOrder: 26, label: "EXPFIT" });

register('PWRFIT', _fitOp('PWR'), { category: 'Statistics', categoryOrder: 27, label: "PWRFIT" });

// AUR: BESTFIT picks the family with the largest |r| (ties go to the earlier
// one) and makes it the model PREDV, PREDX and ΣLINE use, pushing the fit as LINFIT would.
register('BESTFIT', (s) => {
  const M = _popData(s);
  let best = null;
  for (const kind of FIT_KINDS) {
    let fit;
    try { fit = _fit(kind, M); } catch (_) { continue; }
    if (!best || Math.abs(fit.r) > Math.abs(best.r)) best = { kind, ...fit };
  }
  if (!best) {
    _fit('LIN', M);   // rethrows the underlying error
    throw new RPLError('Bad argument value');
  }
  _rememberFit(best.kind, best.a, best.b);
  s.push(_modelToSym(best.kind, best.a, best.b));
  s.push(Real(best.r));
}, { category: 'Statistics', categoryOrder: 28, label: "BESTFIT" });

register('MAD', _columnStat(_asReal(_madItems)), { category: 'Statistics', categoryOrder: 4, label: "MAD" });

function _fitScalar(v) {
  if (isReal(v))    return v.value.toNumber();
  if (isInteger(v)) return Number(v.value);
  if (isBinaryInteger(v)) return Number(v.value);
  throw new RPLError('Bad argument type');
}

// The last fit, or the coefficients and model ΣPAR holds, which a program may have stored itself.
function _lastFitModel() {
  const model = getLastFitModel();
  if (model) return model;
  if (varRecall('ΣPAR') === undefined) throw new RPLError('Undefined name');
  const [, , a, b] = _sigmaPar();
  return { kind: _parModelKind(), a: _statsNumericEntry(a), b: _statsNumericEntry(b) };
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

register('PREDY', lookup('PREDV').fn, { category: 'Statistics', categoryOrder: 31, label: "PREDY" });

// AUR: LR fits the model ΣPAR names and gives its intercept and slope, tagged.
register('LR', (s) => {
  const M = _popData(s);
  const kind = _parModelKind();
  const { a, b } = _fit(kind, M);
  if (!Number.isFinite(a) || !Number.isFinite(b)) throw new RPLError('Infinite result');
  _rememberFit(kind, a, b);
  s.push(Tagged('Intercept', Real(a)));
  s.push(Tagged('Slope', Real(b)));
}, { category: 'Statistics', categoryOrder: 32, label: "LR" });

register('ΣLINE', (s) => {
  const [, , a, b] = _sigmaPar();
  s.push(_modelToSym(_parModelKind(), _statsNumericEntry(a), _statsNumericEntry(b)));
}, { category: 'Statistics', categoryOrder: 33, label: "ΣLINE" });

// ΣDAT keeps n data points of m coordinates as an n×m matrix of reals.
function _sigmaRows() {
  const data = varRecall('ΣDAT');
  if (data === undefined) return null;
  if (!isMatrix(data) || !data.rows.every((row) => row.every((x) => isReal(x) || isInteger(x)))) throw new RPLError('Invalid ΣDATA');
  return data.rows;
}

const _realRow = (row) => row.every((x) => isReal(x) || isInteger(x));

// AUR: a real, a vector or a matrix of rows adds data points; once ΣDAT has m
// columns a point can also be m separate reals, the last one on level 1.
register('Σ+', (s) => {
  const existing = _sigmaRows();
  const m = existing?.[0]?.length ?? 0;
  const v = s.pop();
  let rows;
  if (isMatrix(v)) rows = v.rows;
  else if (isVector(v)) rows = [v.items];
  else if (isReal(v) || isInteger(v)) rows = [m > 1 ? [...s.popN(m - 1), v] : [v]];
  else throw new RPLError('Bad argument type');
  if (!rows.every(_realRow)) throw new RPLError('Bad argument type');
  const width = existing ? m : rows[0].length;
  if (!rows.every((row) => row.length === width)) throw new RPLError('Invalid dimension');
  varStore('ΣDAT', Matrix([...(existing ?? []), ...rows]));
}, { category: 'Statistics', categoryOrder: 34, label: "Σ+" });

register('Σ-', (s) => {
  const rows = _sigmaRows();
  if (!rows?.length) throw new RPLError('Nonexistent ΣDAT');
  const last = rows[rows.length - 1];
  if (rows.length > 1) varStore('ΣDAT', Matrix(rows.slice(0, -1)));
  else varPurge('ΣDAT');
  s.push(last.length === 1 ? last[0] : Vector(last));
}, { category: 'Statistics', categoryOrder: 35, label: "Σ-" });

register('CLΣ', () => { varPurge('ΣDAT'); }, { category: 'Statistics', categoryOrder: 36, label: "CLΣ" });

register('RCLΣ', (s) => {
  const data = varRecall('ΣDAT');
  if (data === undefined) throw new RPLError('Nonexistent ΣDAT');
  s.push(data);
}, { category: 'Statistics', categoryOrder: 37, label: "RCLΣ" });

register('STOΣ', (s) => { varStore('ΣDAT', s.pop()); }, { category: 'Statistics', categoryOrder: 38, label: "STOΣ" });

register('XCOL', (s) => { _setSigmaPar({ 0: Real(_columnIndex(s.pop()) + 1) }); }, { category: 'Statistics', categoryOrder: 39, label: "XCOL" });

register('YCOL', (s) => { _setSigmaPar({ 1: Real(_columnIndex(s.pop()) + 1) }); }, { category: 'Statistics', categoryOrder: 40, label: "YCOL" });

// AUR: xmin xwidth nbins BINS sorts the XCOL column of ΣDAT into nbins bins of
// width xwidth from xmin, as a one-column matrix of counts, plus the counts below and above.
register('BINS', (s) => {
  const [xminArg, widthArg, nbinsArg] = s.popN(3);
  const xmin = _statsNumericEntry(xminArg);
  const width = _statsNumericEntry(widthArg);
  const nbins = _statsNumericEntry(nbinsArg);
  if (!(width > 0) || !Number.isInteger(nbins) || nbins < 1) throw new RPLError('Bad argument value');
  const counts = new Array(nbins).fill(0);
  let below = 0, above = 0;
  for (const x of _xColumn(_sigmaData())) {
    const bin = Math.floor((x - xmin) / width);
    if (x < xmin) below++;
    else if (bin >= nbins) above++;
    else counts[bin]++;
  }
  s.push(Matrix(counts.map((c) => [Real(c)])));
  s.push(Vector([Real(below), Real(above)]));
}, { category: 'Statistics', categoryOrder: 42, label: "BINS" });

register('COLΣ', (s) => {
  const [x, y] = s.popN(2);
  _setSigmaPar({ 0: Real(_columnIndex(x) + 1), 1: Real(_columnIndex(y) + 1) });
}, { category: 'Statistics', categoryOrder: 41, label: "COLΣ" });
