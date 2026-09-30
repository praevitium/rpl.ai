import { RPLError, checkTimeLimit } from '../stack.js';
import { Integer, Matrix, isInteger, isReal, isVector, Vector, isMatrix, isSymbolic, Symbolic, isString, isBinaryInteger, isComplex, isName, Real, isRational, Rational, Complex, isUnit, Unit, toComplex, toRealOrThrow, toRealDecimal, BinaryInteger, isNumber, isList, RList, Str } from '../types.js';
import { Bin as AstBin, formatAlgebra, Neg as AstNeg, Num as AstNum, Fn as AstFn, Var as AstVar } from '../algebra.js';
import { formatReal, DEFAULT_DISPLAY, formatBinaryInteger } from '../formatter.js';
import { getApproxMode, getRealMaxExp, getWordsize, nextPrngUnit, seedPrng } from '../state.js';
import Decimal from '../../../vendor/decimal.js/decimal.mjs';
import { inverseUexpr, powerUexpr } from '../units.js';
import { register, lookup, OPS } from './registry.js';
import { _astToRplValue, _coerceStorableName, _decimalFrobeniusNorm, _hmsToHours, _hmsUnary, _hoursToHms, _invMatrixNumeric, _isScalarOperand, _isSymOperand, _makeUnit, _scalarBinary, _scalarSum, _toAst, _withListBinary, _withListUnary, _withTaggedBinary, _withTaggedUnary, _withVMUnary, binIntBinary, recallVar, storeVar } from './internal.js';



function _toDecimal(v) {
  return isReal(v) ? v.value : new Decimal(isInteger(v) ? v.value.toString() : toRealOrThrow(v));
}

function _astPair(a, b) {
  const l = _toAst(a), r = _toAst(b);
  if (!l || !r) throw new RPLError('Bad argument type');
  return [l, r];
}


function _matMul(aRows, bRows) {
  const ar = aRows.length, ac = aRows[0]?.length ?? 0;
  const br = bRows.length, bc = bRows[0]?.length ?? 0;
  if (ac !== br) throw new RPLError('Invalid dimension');
  const out = [];
  for (let i = 0; i < ar; i++) {
    const row = new Array(bc);
    for (let j = 0; j < bc; j++) {
      checkTimeLimit();
      const parts = new Array(ac);
      for (let k = 0; k < ac; k++) parts[k] = _scalarBinary('*', aRows[i][k], bRows[k][j]);
      row[j] = _scalarSum(parts);
    }
    out.push(row);
  }
  return out;
}


function _matrixPow(m, n) {
  const dim = m.rows.length;
  if (dim === 0 || (m.rows[0]?.length ?? 0) !== dim) throw new RPLError('Invalid dimension');
  if (!Number.isSafeInteger(n) || n < 0) throw new RPLError('Bad argument value');
  if (n === 0) {
    return Matrix(m.rows.map((_, i) => m.rows.map((__, j) => (i === j ? Integer(1n) : Integer(0n)))));
  }
  let base = m.rows;
  let exp = n;
  let result = null;
  while (exp > 0) {
    if (exp & 1) result = result ? _matMul(result, base) : base.map((row) => row.slice());
    exp = Math.floor(exp / 2);
    if (exp > 0) base = _matMul(base, base);
  }
  return Matrix(result);
}


function _wholeNumberExp(v) {
  if (isInteger(v)) return v.value >= 0n ? Number(v.value) : null;
  if (isReal(v) && v.value.isInteger() && v.value.gte(0)) return v.value.toNumber();
  return null;
}


function _isEquation(v) {
  return isSymbolic(v) && v.expr.kind === 'bin' && v.expr.op === '=';
}

function _equationSides(v) {
  if (_isEquation(v)) return [v.expr.l, v.expr.r];
  const ast = _toAst(v);
  if (!ast) throw new RPLError('Bad argument type');
  return [ast, ast];
}


function binaryMath(op) {
  return _withListBinary((s) => {
    const [a, b] = s.popN(2);

    if (isVector(a) && isVector(b)) {
      if (op !== '+' && op !== '-' && op !== '*') throw new RPLError('Bad argument type');
      if (a.items.length !== b.items.length) throw new RPLError('Invalid dimension');
      const parts = a.items.map((x, i) => _scalarBinary(op, x, b.items[i]));
      s.push(op === '*' ? _scalarSum(parts) : Vector(parts));
      return;
    }

    if (isMatrix(a) && isMatrix(b)) {
      const ar = a.rows.length, ac = a.rows[0]?.length ?? 0;
      const br = b.rows.length, bc = b.rows[0]?.length ?? 0;
      if (op === '+' || op === '-') {
        if (ar !== br || ac !== bc) throw new RPLError('Invalid dimension');
        s.push(Matrix(a.rows.map((row, i) =>
          row.map((x, j) => _scalarBinary(op, x, b.rows[i][j])))));
        return;
      }
      if (op === '*') {
        s.push(Matrix(_matMul(a.rows, b.rows)));
        return;
      }
      throw new RPLError('Bad argument type');
    }

    if (isMatrix(a) && isVector(b) && op === '*') {
      const cols = a.rows[0]?.length ?? 0;
      if (cols !== b.items.length) throw new RPLError('Invalid dimension');
      s.push(Vector(a.rows.map(row => {
        const parts = row.map((x, k) => _scalarBinary('*', x, b.items[k]));
        return _scalarSum(parts);
      })));
      return;
    }
    if (isVector(a) && isMatrix(b) && op === '*') {
      const rows = b.rows.length, cols = b.rows[0]?.length ?? 0;
      if (a.items.length !== rows) throw new RPLError('Invalid dimension');
      const out = new Array(cols);
      for (let j = 0; j < cols; j++) {
        const parts = new Array(rows);
        for (let i = 0; i < rows; i++) {
          parts[i] = _scalarBinary('*', a.items[i], b.rows[i][j]);
        }
        out[j] = _scalarSum(parts);
      }
      s.push(Vector(out));
      return;
    }

    // Must precede the scalar broadcast, which would raise each element instead.
    if (op === '^' && (isMatrix(a) || isVector(a)) && _isScalarOperand(b)) {
      if (isVector(a)) throw new RPLError('Bad argument type');
      const n = _wholeNumberExp(b);
      if (n === null) throw new RPLError('Bad argument value');
      s.push(_matrixPow(a, n));
      return;
    }

    if (isVector(a) && _isScalarOperand(b)) {
      s.push(Vector(a.items.map(x => _scalarBinary(op, x, b))));
      return;
    }
    if (_isScalarOperand(a) && isVector(b)) {
      s.push(Vector(b.items.map(x => _scalarBinary(op, a, x))));
      return;
    }
    if (isMatrix(a) && _isScalarOperand(b)) {
      s.push(Matrix(a.rows.map(row => row.map(x => _scalarBinary(op, x, b)))));
      return;
    }
    if (_isScalarOperand(a) && isMatrix(b)) {
      s.push(Matrix(b.rows.map(row => row.map(x => _scalarBinary(op, a, x)))));
      return;
    }

    if (isVector(a) || isVector(b) || isMatrix(a) || isMatrix(b)) {
      throw new RPLError('Bad argument type');
    }

    if (_isEquation(a) || _isEquation(b)) {
      const [al, ar] = _equationSides(a);
      const [bl, br] = _equationSides(b);
      s.push(Symbolic(AstBin('=', AstBin(op, al, bl), AstBin(op, ar, br))));
      return;
    }

    s.push(_scalarBinary(op, a, b));
  });
}


function _stringCoerce(v) {
  if (isString(v))  return v.value;
  if (isInteger(v)) return v.value.toString();
  if (isReal(v))    return formatReal(v.value, DEFAULT_DISPLAY);
  if (isBinaryInteger(v)) return formatBinaryInteger(v);
  if (isComplex(v)) return `(${formatReal(v.re, DEFAULT_DISPLAY)}, ${formatReal(v.im, DEFAULT_DISPLAY)})`;
  if (isName(v))    return v.id;
  if (isSymbolic(v)) return formatAlgebra(v.expr);
  return null;
}


register('NEG', _withTaggedUnary(_withListUnary(_withVMUnary((s) => {
  const v = s.pop();
  if (_isSymOperand(v))  { s.push(Symbolic(AstNeg(_toAst(v)))); return; }
  if (isReal(v))     s.push(Real(v.value.neg()));
  else if (isInteger(v)) s.push(Integer(-v.value));
  else if (isRational(v)) {
    if (getApproxMode()) s.push(Real(toRealDecimal(v).neg()));
    else s.push(Rational(-v.n, v.d));
  }
  else if (isComplex(v)) s.push(Complex(-v.re, -v.im));
  else if (isUnit(v))    s.push(Unit(-v.value, v.uexpr));
  else throw new RPLError('Bad argument type');
}))), { category: 'Arithmetic', categoryOrder: 5, label: "NEG" });


register('INV', _withTaggedUnary(_withListUnary((s) => {
  const v = s.pop();
  if (_isSymOperand(v))  {
    s.push(Symbolic(AstBin('/', AstNum(1), _toAst(v))));
    return;
  }
  if (isReal(v)) {
    if (v.value.isZero()) throw new RPLError('Infinite result');
    s.push(Real(new Decimal(1).div(v.value)));
  } else if (isInteger(v)) {
    if (v.value === 0n) throw new RPLError('Infinite result');
    if (getApproxMode()) s.push(Real(1 / Number(v.value)));
    else if (v.value === 1n || v.value === -1n) s.push(Integer(v.value));
    else s.push(Rational(1n, v.value));
  } else if (isRational(v)) {
    if (v.n === 0n) throw new RPLError('Infinite result');
    if (getApproxMode()) s.push(Real(Number(v.d) / Number(v.n)));
    else if (v.n === 1n)  s.push(Integer(v.d));
    else if (v.n === -1n) s.push(Integer(-v.d));
    else                  s.push(Rational(v.d, v.n));
  } else if (isComplex(v)) {
    const d = v.re * v.re + v.im * v.im;
    if (d === 0) throw new RPLError('Infinite result');
    s.push(Complex(v.re / d, -v.im / d));
  } else if (isUnit(v)) {
    if (v.value === 0) throw new RPLError('Infinite result');
    s.push(_makeUnit(1 / v.value, inverseUexpr(v.uexpr)));
  } else if (isMatrix(v)) {
    const n = v.rows.length;
    const cols = n > 0 ? v.rows[0].length : 0;
    if (n !== cols) throw new RPLError('Invalid dimension');
    if (n === 0) { s.push(v); return; }
    s.push(Matrix(_invMatrixNumeric(v.rows)));
  } else throw new RPLError('Bad argument type');
})), { category: 'Arithmetic', categoryOrder: 6, label: "INV" });


register('ABS', _withTaggedUnary(_withListUnary((s) => {
  const v = s.pop();
  if (_isSymOperand(v))  { s.push(Symbolic(AstFn('ABS', [_toAst(v)]))); return; }
  if (isReal(v))    s.push(Real(v.value.abs()));
  else if (isInteger(v)) s.push(Integer(v.value < 0n ? -v.value : v.value));
  else if (isRational(v)) {
    if (getApproxMode()) s.push(Real(toRealDecimal(v).abs()));
    else s.push(Rational(v.n < 0n ? -v.n : v.n, v.d));
  }
  else if (isComplex(v)) s.push(Real(Math.hypot(v.re, v.im)));
  else if (isUnit(v))    s.push(Unit(Math.abs(v.value), v.uexpr));
  else if (isVector(v))  s.push(Real(_decimalFrobeniusNorm(v.items)));
  else if (isMatrix(v))  s.push(Real(_decimalFrobeniusNorm(v.rows.flat())));
  else throw new RPLError('Bad argument type');
})), { category: 'Arithmetic', categoryOrder: 7, label: "ABS" });


register('SQ', _withTaggedUnary(_withListUnary((s) => {
  const v = s.pop();
  if (_isSymOperand(v))  { s.push(Symbolic(AstBin('^', _toAst(v), AstNum(2)))); return; }
  if (isReal(v))    s.push(Real(v.value.times(v.value)));
  else if (isInteger(v)) s.push(Integer(v.value * v.value));
  else if (isRational(v)) {
    if (getApproxMode()) {
      const r = toRealDecimal(v);
      s.push(Real(r.times(r)));
    } else s.push(Rational(v.n * v.n, v.d * v.d));
  }
  else if (isComplex(v)) s.push(Complex(
    v.re * v.re - v.im * v.im,
    2 * v.re * v.im,
  ));
  else if (isUnit(v)) s.push(Unit(v.value * v.value, powerUexpr(v.uexpr, 2)));
  else if (isMatrix(v)) s.push(Matrix(_matMul(v.rows, v.rows)));
  else throw new RPLError('Bad argument type');
})), { category: 'Arithmetic', categoryOrder: 8, label: "SQ" });


register('SQRT', _withTaggedUnary(_withListUnary(_withVMUnary((s) => {
  const v = s.pop();
  if (_isSymOperand(v))  { s.push(Symbolic(AstFn('SQRT', [_toAst(v)]))); return; }
  if (isComplex(v) || (isReal(v) && v.value.isNegative()) ||
      (isInteger(v) && v.value < 0n) ||
      (isRational(v) && v.n < 0n)) {
    const c = toComplex(v);
    const r = Math.hypot(c.re, c.im);
    const re = Math.sqrt((r + c.re) / 2);
    const im = Math.sign(c.im || 1) * Math.sqrt((r - c.re) / 2);
    s.push(Complex(re, im));
  } else if (isRational(v) && !getApproxMode()) {
    const sn = _exactSqrtBigInt(v.n);
    const sd = _exactSqrtBigInt(v.d);
    if (sn !== null && sd !== null) {
      if (sd === 1n) s.push(Integer(sn));
      else           s.push(Rational(sn, sd));
    } else s.push(Symbolic(AstFn('SQRT', [_toAst(v)])));
  } else if (isInteger(v) && !getApproxMode()) {
    const sn = _exactSqrtBigInt(v.value);
    if (sn !== null) s.push(Integer(sn));
    else             s.push(Symbolic(AstFn('SQRT', [_toAst(v)])));
  } else {
    s.push(Real(_toDecimal(v).sqrt()));
  }
}))), { category: 'Arithmetic', categoryOrder: 9, label: "SQRT" });

// The character picker inserts `√`; without this, ENTER on it pushes Name('√').
register('√', (s) => { OPS.get('SQRT').fn(s); }, { category: 'Arithmetic', categoryOrder: 10, label: "√" });


function _exactSqrtBigInt(n) {
  if (n < 0n) return null;
  if (n < 2n) return n;
  let x = 1n;
  const bits = n.toString(2).length;
  x <<= BigInt((bits + 1) >> 1);
  let prev;
  do {
    prev = x;
    x = (x + n / x) >> 1n;
  } while (x < prev);
  return prev * prev === n ? prev : null;
}


register('XROOT', _withTaggedBinary(_withListBinary((s) => {
  const [y, x] = s.popN(2);
  if (_isSymOperand(y) || _isSymOperand(x)) {
    s.push(Symbolic(AstFn('XROOT', _astPair(y, x))));
    return;
  }
  const dx = _toDecimal(x);
  if (dx.isZero()) throw new RPLError('Infinite result');
  const isOddRootOfNegative = ((isInteger(y) && y.value < 0n) || (isReal(y) && y.value.isNegative()))
    && dx.isInteger() && dx.mod(2).abs().eq(1);
  if (isOddRootOfNegative) {
    s.push(isInteger(y) ? Integer(-y.value) : Real(y.value.neg()));
    s.push(x);
    lookup('XROOT').fn(s);
    lookup('NEG').fn(s);
    return;
  }
  s.push(y);
  s.push(Real(new Decimal(1).div(dx)));
  lookup('^').fn(s);
})), { category: 'Arithmetic', categoryOrder: 11, label: "XROOT" });


function _roundDecimal(name, d) {
  if (name === 'FLOOR') return d.floor();
  if (name === 'CEIL')  return d.ceil();
  if (name === 'IP')    return d.trunc();
  return d.minus(d.trunc());
}

function _rounderScalar(name, realFn) {
  const round = (v) => {
    if (isInteger(v)) return name === 'FP' ? Integer(0n) : v;
    if (isRational(v)) {
      if (getApproxMode()) return Real(_roundDecimal(name, toRealDecimal(v)));
      // BigInt division truncates toward zero; d > 0.
      const n = v.n, d = v.d;
      const q = n / d;
      const r = n % d;
      if (name === 'FP')    return r === 0n ? Integer(0n) : Rational(r, d);
      if (r === 0n)         return Integer(q);
      if (name === 'IP')    return Integer(q);
      if (name === 'FLOOR') return Integer(n < 0n ? q - 1n : q);
      if (name === 'CEIL')  return Integer(n > 0n ? q + 1n : q);
    }
    if (isBinaryInteger(v)) return name === 'FP' ? BinaryInteger(0n, v.base) : v;
    if (isReal(v))          return Real(_roundDecimal(name, v.value));
    if (isUnit(v))          return Unit(realFn(v.value), v.uexpr);
    if (isSymbolic(v)) {
      const literal = _astToRplValue(v.expr);
      if (isReal(literal) || isInteger(literal)) return round(literal);
    }
    if (_isSymOperand(v))   return Symbolic(AstFn(name, [_toAst(v)]));
    throw new RPLError('Bad argument type');
  };
  return round;
}


function _registerRounder(name, realFn, opts) {
  const scalarFn = _rounderScalar(name, realFn);
  register(name, _withTaggedUnary(_withListUnary((s) => {
    const v = s.pop();
    if (isVector(v))      s.push(Vector(v.items.map(scalarFn)));
    else if (isMatrix(v)) s.push(Matrix(v.rows.map(r => r.map(scalarFn))));
    else                  s.push(scalarFn(v));
  })), opts);
}

_registerRounder('FLOOR', Math.floor, { category: 'Arithmetic', categoryOrder: 12, label: 'FLOOR' });

_registerRounder('CEIL', Math.ceil, { category: 'Arithmetic', categoryOrder: 13, label: 'CEIL' });

_registerRounder('IP', Math.trunc, { category: 'Arithmetic', categoryOrder: 14, label: 'IP' });

_registerRounder('FP', (x) => x - Math.trunc(x), { category: 'Arithmetic', categoryOrder: 15, label: 'FP' });


function _signScalar(v) {
  if (isReal(v))     return Real(v.value.isNegative() ? -1 : v.value.isZero() ? 0 : 1);
  if (isInteger(v))  return Integer(v.value === 0n ? 0n : v.value > 0n ? 1n : -1n);
  if (isRational(v)) return Integer(v.n === 0n ? 0n : v.n > 0n ? 1n : -1n);
  if (isComplex(v)) {
    const mag = Math.hypot(v.re, v.im);
    return mag === 0 ? Complex(0, 0) : Complex(v.re / mag, v.im / mag);
  }
  if (_isSymOperand(v)) return Symbolic(AstFn('SIGN', [_toAst(v)]));
  throw new RPLError('Bad argument type');
}

// A Vector's SIGN is its unit direction; a Matrix has none, so it goes element-wise.
register('SIGN', _withTaggedUnary(_withListUnary((s) => {
  const v = s.pop();
  if (isVector(v)) {
    const mag = _decimalFrobeniusNorm(v.items);
    if (mag.isZero()) { s.push(v); return; }
    s.push(Vector(v.items.map(x => Real(_toDecimal(x).div(mag)))));
  } else if (isMatrix(v)) {
    s.push(Matrix(v.rows.map(r => r.map(_signScalar))));
  } else {
    s.push(_signScalar(v));
  }
})), { category: 'Arithmetic', categoryOrder: 16, label: "SIGN" });


function _hp50ModDecimal(a, b) {
  if (b.isZero()) throw new RPLError('Infinite result');
  return a.minus(b.times(a.div(b).floor()));
}


// HP50 MOD takes the sign of the divisor; JS % takes the dividend's.
function _hp50ModBigInt(a, b) {
  if (b === 0n) throw new RPLError('Infinite result');
  let r = a % b;
  if (r !== 0n && ((r < 0n) !== (b < 0n))) r += b;
  return r;
}


register('MOD', _withTaggedBinary(_withListBinary((s) => {
  const [a, b] = s.popN(2);
  if (_isSymOperand(a) || _isSymOperand(b)) {
    s.push(Symbolic(AstFn('MOD', _astPair(a, b))));
    return;
  }
  if (!isNumber(a) || !isNumber(b)) throw new RPLError('Bad argument type');
  if (isComplex(a) || isComplex(b)) throw new RPLError('Bad argument type');
  if (isInteger(a) && isInteger(b)) {
    s.push(Integer(_hp50ModBigInt(a.value, b.value)));
  } else {
    s.push(Real(_hp50ModDecimal(_toDecimal(a), _toDecimal(b))));
  }
})), { category: 'Arithmetic', categoryOrder: 17, label: "MOD" });


function _minMax(s, wantMin, name) {
  const [a, b] = s.popN(2);
  if (_isSymOperand(a) || _isSymOperand(b)) {
    s.push(Symbolic(AstFn(name, _astPair(a, b))));
    return;
  }
  if (!isNumber(a) || !isNumber(b)) throw new RPLError('Bad argument type');
  if (isComplex(a) || isComplex(b)) throw new RPLError('Bad argument type');
  if (isInteger(a) && isInteger(b)) {
    const aWins = wantMin ? (a.value <= b.value) : (a.value >= b.value);
    s.push(Integer(aWins ? a.value : b.value));
  } else {
    const da = _toDecimal(a);
    const db = _toDecimal(b);
    const cmp = da.comparedTo(db);
    const aWins = wantMin ? (cmp <= 0) : (cmp >= 0);
    s.push(Real(aWins ? da : db));
  }
}

register('MIN', _withTaggedBinary(_withListBinary((s) => _minMax(s, true,  'MIN'))), { category: 'Arithmetic', categoryOrder: 21, label: "MIN" });

register('MAX', _withTaggedBinary(_withListBinary((s) => _minMax(s, false, 'MAX'))), { category: 'Arithmetic', categoryOrder: 22, label: "MAX" });


function _incrDecrOp(opSymbol) {
  return (s) => {
    const [nameVal] = s.popN(1);
    if (!isName(nameVal) && !isString(nameVal)) {
      throw new RPLError('Bad argument type');
    }
    const id = _coerceStorableName(nameVal);
    const stored = recallVar(id);
    if (stored === undefined) throw new RPLError(`Undefined name: ${id}`);
    s.push(stored);
    s.push(isInteger(stored) ? Integer(1n) : Real(1));
    // Looked up per call: + and - are registered further down this file.
    lookup(opSymbol).fn(s);
    const [result] = s.popN(1);
    storeVar(id, result);
    s.push(result);
  };
}


register('INCR', _incrDecrOp('+'), { category: 'Arithmetic', categoryOrder: 31, label: "INCR" });

register('DECR', _incrDecrOp('-'), { category: 'Arithmetic', categoryOrder: 30, label: "DECR" });


function _xponOf(x) {
  if (x === 0) return 0;
  return Math.floor(Math.log10(Math.abs(x)));
}

// Decimal, not a JS double: Reals reach exponents of ±999.
function _xponMantArg(v) {
  if (!isReal(v) && !isInteger(v)) throw new RPLError('Bad argument type');
  return _toDecimal(v);
}

register('XPON', _withTaggedUnary(_withListUnary(_withVMUnary((s) => {
  const v = s.pop();
  if (_isSymOperand(v)) { s.push(Symbolic(AstFn('XPON', [_toAst(v)]))); return; }
  const d = _xponMantArg(v);
  s.push(Real(d.isZero() ? 0 : d.e));
}))), { category: 'Arithmetic', categoryOrder: 26, label: "XPON" });

register('MANT', _withTaggedUnary(_withListUnary(_withVMUnary((s) => {
  const v = s.pop();
  if (_isSymOperand(v)) { s.push(Symbolic(AstFn('MANT', [_toAst(v)]))); return; }
  const d = _xponMantArg(v);
  s.push(Real(d.isZero() ? 0 : d.div(new Decimal(`1e${d.e}`))));
}))), { category: 'Arithmetic', categoryOrder: 25, label: "MANT" });


function _roundHalfAwayFromZero(x, n) {
  const p = Math.pow(10, n);
  return (x >= 0 ? Math.floor(x * p + 0.5) : -Math.floor(-x * p + 0.5)) / p;
}

function _truncTowardZero(x, n) {
  const p = Math.pow(10, n);
  return Math.trunc(x * p) / p;
}

// n >= 0 counts decimal places; n < 0 counts -n significant digits.
function _applyRoundReal(x, n, fn) {
  if (n >= 0) return fn(x, n);
  if (x === 0) return 0;
  return fn(x, -n - 1 - _xponOf(x));
}

function _roundingOp(fn) {
  return (s) => {
    const nv = s.pop();
    const xv = s.pop();
    const n = Number(isInteger(nv) ? nv.value : toRealOrThrow(nv));
    if (!Number.isInteger(n) || n < -11 || n > 11) {
      throw new RPLError('Bad argument value');
    }
    if (isComplex(xv)) {
      s.push(Complex(_applyRoundReal(xv.re, n, fn),
                     _applyRoundReal(xv.im, n, fn)));
      return;
    }
    if (isInteger(xv) && n >= 0) {
      s.push(xv);
      return;
    }
    if (!isReal(xv) && !isInteger(xv)) throw new RPLError('Bad argument type');
    const x = isInteger(xv) ? Number(xv.value) : xv.value.toNumber();
    s.push(Real(_applyRoundReal(x, n, fn)));
  };
}


function _unwrapNumericLiteral(v) {
  if (!isSymbolic(v)) return v;
  const literal = _astToRplValue(v.expr);
  return isReal(literal) || isInteger(literal) ? literal : v;
}

function _roundingCommand(name, fn) {
  const numeric = _roundingOp(fn);
  return _withTaggedBinary(_withListBinary((s) => {
    const [xv, nv] = s.popN(2).map(_unwrapNumericLiteral);
    if (_isSymOperand(xv) || _isSymOperand(nv)) {
      s.push(Symbolic(AstFn(name, _astPair(xv, nv))));
      return;
    }
    s.push(xv);
    s.push(nv);
    numeric(s);
  }));
}

register('RND',  _roundingCommand('RND',  _roundHalfAwayFromZero), { category: 'Arithmetic', categoryOrder: 18, label: "RND" });

register('TRNC', _roundingCommand('TRNC', _truncTowardZero), { category: 'Arithmetic', categoryOrder: 19, label: "TRNC" });

register('TRUNC', _roundingCommand('TRUNC', _truncTowardZero), { category: 'Arithmetic', categoryOrder: 20, label: "TRUNC" });


function _percentAst(kind, l, r) {
  if (kind === 'PCT')  return AstBin('/', AstBin('*', l, r), AstNum(100));
  if (kind === 'PCTT') return AstBin('/', AstBin('*', AstNum(100), r), l);
  /* PCTCH */         return AstBin('/', AstBin('*', AstNum(100),
                          AstBin('-', r, l)), l);
}

function _percentOp(kind, computeNumeric, errorsOnZeroX) {
  return _withTaggedBinary(_withListBinary((s) => {
    const y = s.pop();
    const x = s.pop();
    if (_isSymOperand(x) || _isSymOperand(y)) {
      const [l, r] = _astPair(x, y);
      s.push(Symbolic(_percentAst(kind, l, r)));
      return;
    }
    const xn = toRealOrThrow(x);
    const yn = toRealOrThrow(y);
    if (errorsOnZeroX && xn === 0) throw new RPLError('Infinite result');
    s.push(Real(computeNumeric(xn, yn)));
  }));
}

register('%',   _percentOp('PCT',   (x, y) => x * y / 100,          false), { category: 'Arithmetic', categoryOrder: 27, label: "%" });

register('%T',  _percentOp('PCTT',  (x, y) => 100 * y / x,          true), { category: 'Arithmetic', categoryOrder: 29, label: "%T" });

register('%CH', _percentOp('PCTCH', (x, y) => 100 * (y - x) / x,    true), { category: 'Arithmetic', categoryOrder: 28, label: "%CH" });


register('MAXR', (s) => {
  const e = getRealMaxExp();
  s.push(Real(new Decimal(`9.99999999999e+${e}`)));
}, { category: 'Arithmetic', categoryOrder: 24, label: "MAXR" });

register('MINR', (s) => {
  const e = getRealMaxExp();
  s.push(Real(new Decimal(`1e-${e}`)));
}, { category: 'Arithmetic', categoryOrder: 23, label: "MINR" });


function _hmsBinary(fn) {
  return (s) => {
    const b = s.pop();
    const a = s.pop();
    if (isComplex(a) || isComplex(b)) throw new RPLError('Bad argument type');
    const ah = _hmsToHours(toRealOrThrow(a));
    const bh = _hmsToHours(toRealOrThrow(b));
    s.push(Real(_hoursToHms(fn(ah, bh))));
  };
}


register('→HMS',  _hmsUnary('→HMS',  _hoursToHms), { category: 'Arithmetic', categoryOrder: 34, label: "→HMS" });

register('HMS→',  _hmsUnary('HMS→',  _hmsToHours), { category: 'Arithmetic', categoryOrder: 35, label: "HMS→" });

register('HMS+',  _hmsBinary((a, b) => a + b), { category: 'Arithmetic', categoryOrder: 32, label: "HMS+" });

register('HMS-',  _hmsBinary((a, b) => a - b), { category: 'Arithmetic', categoryOrder: 33, label: "HMS-" });


// HP50 AUR §10.1: a Real/Integer meeting a BinInt is truncated toward zero,
// wrapped to the wordsize, and takes the BinInt's base.
function _coerceToBinInt(v, base) {
  let raw;
  if (isInteger(v)) {
    raw = v.value;
  } else if (isReal(v)) {
    if (!v.value.isFinite()) throw new RPLError('Bad argument value');
    raw = BigInt(v.value.trunc().toFixed(0));
  } else {
    throw new RPLError('Bad argument type');
  }
  if (raw < 0n) {
    const mod = 1n << BigInt(getWordsize());
    raw = ((raw % mod) + mod) % mod;
  }
  return BinaryInteger(raw, base);
}


function _isMixedBinInt(a, b) {
  return (isBinaryInteger(a) && (isInteger(b) || isReal(b)))
      || (isBinaryInteger(b) && (isInteger(a) || isReal(a)));
}

function _binaryMathMixed(op) {
  const generic = binaryMath(op);
  return (s) => {
    if (s.depth >= 2 && _isMixedBinInt(s.peek(2), s.peek(1))) {
      const [a, b] = s.popN(2);
      s.push(isBinaryInteger(a)
        ? binIntBinary(op, a, _coerceToBinInt(b, a.base))
        : binIntBinary(op, _coerceToBinInt(a, b.base), b));
      return;
    }
    generic(s);
  };
}


const _addMixed = _binaryMathMixed('+');

register('+', _withTaggedBinary((s) => {
  if (s.depth >= 2) {
    const a = s.peek(2), b = s.peek(1);
    // HP50 AUR §3-7: `+` on a list concatenates / appends / prepends; ADD is element-wise.
    if (isList(a) || isList(b)) {
      s.popN(2);
      s.push(RList([...(isList(a) ? a.items : [a]), ...(isList(b) ? b.items : [b])]));
      return;
    }
    if (isString(a) || isString(b)) {
      s.popN(2);
      const l = _stringCoerce(a), r = _stringCoerce(b);
      if (l == null || r == null) throw new RPLError('Bad argument type');
      s.push(Str(l + r));
      return;
    }
  }
  _addMixed(s);
}), { category: 'Arithmetic', categoryOrder: 0, label: "+" });

register('-',  _withTaggedBinary(_binaryMathMixed('-')), { category: 'Arithmetic', categoryOrder: 1, label: "-" });

register('*',  _withTaggedBinary(_binaryMathMixed('*')), { category: 'Arithmetic', categoryOrder: 2, label: "*" });

register('/',  _withTaggedBinary(_binaryMathMixed('/')), { category: 'Arithmetic', categoryOrder: 3, label: "/" });

register('^',  _withTaggedBinary(_binaryMathMixed('^')), { category: 'Arithmetic', categoryOrder: 4, label: "^" });


const _QMAX_DENOM = 1e10;

const _QMAX_ITERS = 64;


function _continuedFractionConvergent(x) {
  const sign = x < 0 ? -1 : 1;
  let b = Math.abs(x);
  let h0 = 0, h1 = 1;
  let k0 = 1, k1 = 0;
  for (let i = 0; i < _QMAX_ITERS; i++) {
    const a = Math.floor(b);
    const h2 = a * h1 + h0;
    const k2 = a * k1 + k0;
    if (k2 > _QMAX_DENOM) break;
    h0 = h1; h1 = h2;
    k0 = k1; k1 = k2;
    const frac = b - a;
    if (frac < 1e-15) break;
    b = 1 / frac;
    if (!Number.isFinite(b)) break;
  }
  return { n: sign * h1, d: k1 };
}


// A negative fraction prints as -(3/4), not (-3)/4, as on the HP50.
function _rationalAst(x) {
  if (Number.isInteger(x)) return AstNum(x);
  const { n, d } = _continuedFractionConvergent(x);
  if (d === 1) return AstNum(n);
  const frac = AstBin('/', AstNum(Math.abs(n)), AstNum(d));
  return n < 0 ? AstNeg(frac) : frac;
}


register('→Q', (s) => {
  const [v] = s.popN(1);
  if (isInteger(v)) {
    s.push(Symbolic(AstNum(Number(v.value))));
    return;
  }
  if (!isReal(v)) throw new RPLError('Bad argument type');
  const x = v.value.toNumber();
  if (!Number.isFinite(x)) throw new RPLError('Bad argument value');
  if (x === 0) { s.push(Symbolic(AstNum(0))); return; }
  s.push(Symbolic(_rationalAst(x)));
}, { category: 'Arithmetic', categoryOrder: 40, label: "→Q" });


function _astIntOrThrow(n) {
  if (!n || n.kind !== 'num') throw new RPLError('Bad argument value');
  if (n.digits) return BigInt(n.digits);
  if (!Number.isFinite(n.value) || !Number.isInteger(n.value)) {
    throw new RPLError('Bad argument value');
  }
  return BigInt(n.value);
}


function _qDecompose(sym) {
  if (sym.kind === 'num') {
    return [_astIntOrThrow(sym), 1n];
  }
  if (sym.kind === 'neg') {
    const [n, d] = _qDecompose(sym.arg);
    return [-n, d];
  }
  if (sym.kind === 'bin' && sym.op === '/') {
    const n = _astIntOrThrow(sym.l);
    const d = _astIntOrThrow(sym.r);
    if (d === 0n) throw new RPLError('Infinite result');
    return [n, d];
  }
  throw new RPLError('Bad argument type');
}


register('Q→', (s) => {
  const [v] = s.popN(1);
  if (isInteger(v))  { s.push(Integer(v.value)); s.push(Integer(1n)); return; }
  if (isReal(v)) {
    if (!v.value.isInteger()) throw new RPLError('Bad argument value');
    s.push(Integer(BigInt(v.value.toFixed(0)))); s.push(Integer(1n)); return;
  }
  if (!isSymbolic(v)) throw new RPLError('Bad argument type');
  const [n, d] = _qDecompose(v.expr);
  s.push(Integer(n));
  s.push(Integer(d));
}, { category: 'Arithmetic', categoryOrder: 41, label: "Q→" });


register('D→HMS',  _hmsUnary('D→HMS',  _hoursToHms), { category: 'Arithmetic', categoryOrder: 36, label: "D→HMS" });

register('HMS→D',  _hmsUnary('HMS→D',  _hmsToHours), { category: 'Arithmetic', categoryOrder: 37, label: "HMS→D" });


register('RAND', (s) => {
  s.push(Real(nextPrngUnit()));
}, { category: 'Arithmetic', categoryOrder: 38, label: "RAND" });


register('RDZ', (s) => {
  const [v] = s.popN(1);
  if (isInteger(v)) { seedPrng(v.value); return; }
  if (isReal(v)) {
    // Stricter than the HP50: a fractional seed is rejected rather than truncated.
    if (!v.value.isInteger()) throw new RPLError('Bad argument value');
    seedPrng(v.value.toNumber());
    return;
  }
  throw new RPLError('Bad argument type');
}, { category: 'Arithmetic', categoryOrder: 39, label: "RDZ" });


function _piMultipleAst(n, d) {
  const PI = AstVar('PI');
  const core = n === 1 ? PI : AstBin('*', AstNum(n), PI);
  return d === 1 ? core : AstBin('/', core, AstNum(d));
}


register('→Qπ', (s) => {
  const [v] = s.popN(1);
  let x;
  if (isInteger(v)) x = Number(v.value);
  else if (isReal(v)) x = v.value.toNumber();
  else throw new RPLError('Bad argument type');
  if (!Number.isFinite(x)) throw new RPLError('Bad argument value');
  if (x === 0) { s.push(Symbolic(AstNum(0))); return; }
  const { n, d } = _continuedFractionConvergent(Math.abs(x) / Math.PI);
  if (n === 0) {
    s.push(Symbolic(_rationalAst(x)));
    return;
  }
  const core = _piMultipleAst(n, d);
  s.push(Symbolic(x < 0 ? AstNeg(core) : core));
}, { category: 'Arithmetic', categoryOrder: 42, label: "→QΠ" });
