import Decimal from '../../../vendor/decimal.js/decimal.mjs';
import { isReal, isInteger, isComplex, Real, isSymbolic, isName, isRational, Name, Symbolic, Integer, Unit, isUnit, isBinaryInteger, isNumber, promoteNumericPair, Complex, Rational, isList, RList, isTagged, Tagged, isVector, Vector, isMatrix, Matrix, BinaryInteger, toRealOrThrow, toRealDecimal, isString, isValidHpIdentifier, isStorableHpName, isProgram, isDirectory, isGrob, Str, Program } from '../types.js';
import { RPLAbort, RPLError, Stack, setPushCoerce, checkTimeLimit, startSlice, sliceDue } from '../stack.js';
import { exactTrigRewrite } from '../exact-trig.js';
import { gatherLike } from '../tidy.js';
import { Var as AstVar, Num as AstNum, Bin as AstBin, Fn as AstFn, UnitNode as AstUnit, evalAst as algebraEvalAst, defaultFnEval as algebraDefaultFnEval, Neg as AstNeg, freeVars as algebraFreeVars, hasUnits, exactRational, isRealNum, isKnownFunction, isArrayLiteral } from '../algebra.js';
import { sameDims, convertValue, temperaturesAdd, uexprEqual, multiplyUexpr, divideUexpr, inverseUexpr, powerUexpr } from '../units.js';
import { state as _calcState, getApproxMode, getComplexMode, getWordsizeMask, varRecall, getLastError, setLastError, restoreLastError, varStore, getRealMaxExp, testUserFlag, enterDirectory, toRadians, fromRadians, angleTrig, setHalted, HALT_KIND, settleLcd, withScratchState, inScratchState, notify } from '../state.js';
import { Fraction } from '../../../vendor/fraction.js/fraction.mjs';
import Complex$ from '../../../vendor/complex.js/complex.mjs';
import { formatSource, currentDisplay, withFractionMark } from '../formatter.js';
import { parseEntry as _parseEntryForObjTo, polarVector, fromTyped } from '../parser.js';
import { astToGiac, buildGiacCmd, giacToAst, splitGiacList } from '../cas/giac-convert.mjs';
import { giac, requireCas, casRun } from '../cas/giac-engine.mjs';
import { lookup } from './registry.js';
import {
  inputSpec, chooseSpec, waitSpec, informSpec, CF_OPENERS, CF_CLOSERS, CF_INNERS, bareNameId, scanAtDepth0, _pastCaseEnd, _pastBlock, _scanRequired,
  _scanEnd, _scanElseEnd, _scanCounterCloser, _localFrames, _boundFrames, _localFrame, _localLookup,
} from './interp.js';
export { bindLocals, unbindLocals, withLocalVariable, localFramesDepth } from './interp.js';
import { _complexLnRewrite, _checkInfinite, _toAst, _numToRpl, _astToRplValue, _foldImaginary, _casSpecialValues, _casCalculus, _substitute, _infiniteTop, _foldUnits, _evalCommandCalls, _isArrayLiteral, _LAZY_FUNCTIONS, _symConstantRpl, _symConstantValue } from './sym-eval.js';
import { MAX_INTEGER_DIGITS, _divisionByZero, _fractionValue, _exactPower, _radicalBinary, exactSqrt, _numVal, _infiniteResult } from './numeric.js';

export { MAX_INTEGER_DIGITS, _bigFactorial, _gamma, _lngamma, _regGammaQ, _radicalBinary, exactSqrt, exactXroot, _numVal, _decimalFrobeniusNorm, _invMatrixNumeric, _cx, _cxAdd, _cxSub, _cxMul, _cxDiv, _infiniteResult, _hmsToHours, _hoursToHms, _hmsUnary } from './numeric.js';
export { _exactLnNegative, _toAst, _astToRplValue, _substitute } from './sym-eval.js';



// state.js owns MAX_EXP / MIN_EXP (setRealMaxExp); only precision and rounding are set here.
Decimal.set({ precision: 15, rounding: Decimal.ROUND_HALF_UP });


export function isTruthy(v) {
  if (isReal(v))    return !v.value.isZero();
  if (isInteger(v)) return v.value !== 0n;
  if (isComplex(v)) return v.re !== 0 || v.im !== 0;
  throw new RPLError('Bad argument type');
}


export const TRUE  = Real(1);

export const FALSE = Real(0);


export function _isSymOperand(v) {
  return isSymbolic(v) || isName(v);
}


export function _pushCasResult(s, ast) {
  const leaf = ast?.kind === 'neg' ? ast.arg : ast;
  s.push(leaf?.kind === 'num' ? _astToRplValue(ast) : Symbolic(ast));
}

export function _symbolicDecompose(v) {
  const ast = v.expr;
  if (!ast) return [Integer(0n)];
  if (ast.kind === 'num' || ast.kind === 'var') {
    return [_astToRplValue(ast), Integer(1n)];
  }
  // The AUR's `symb` → arg1 … argn n `function`: the count of arguments, then the function on level 1.
  const parts = (args, fn) => [...args.map(_astToRplValue), Integer(BigInt(args.length)), Name(fn, { quoted: true })];
  if (ast.kind === 'neg') return parts([ast.arg], 'NEG');
  if (ast.kind === 'bin') return parts([ast.l, ast.r], ast.op);
  if (ast.kind === 'fn') return parts(ast.args, ast.name);
  return [v, Integer(1n)];
}



export function _makeUnit(value, uexpr) {
  if (!Number.isFinite(value)) throw new RPLError('Infinite result');
  return uexpr.length === 0 ? Real(value) : Unit(value, uexpr);
}



// u's magnitude in the units `to`, rounded to 12 digits like every other
// number so that 12_in and 1_ft agree.
export function _inUnit(u, to, options) {
  return uexprEqual(u.uexpr, to) ? u.value : Unit(convertValue(u.value, u.uexpr, to, options), to).value;
}


// Unlike the quantities of its operands, the sum of two units is in level 1's:
// 5_ft 9_in + is 69_in.
function _unitBinary(op, a, b) {
  if (op === '+' || op === '-') {
    if (!isUnit(a) || !isUnit(b)) throw new RPLError('Bad argument type');
    if (!sameDims(a.uexpr, b.uexpr) || !temperaturesAdd(a.uexpr, b.uexpr)) throw new RPLError('Inconsistent units');
    const inB = _inUnit(a, b.uexpr, { difference: true });
    return _makeUnit(op === '+' ? inB + b.value : inB - b.value, b.uexpr);
  }
  if (op === '*') {
    if (isUnit(a) && isUnit(b)) return _makeUnit(a.value * b.value, multiplyUexpr(a.uexpr, b.uexpr));
    if (isUnit(a)) return _makeUnit(a.value * _numVal(b), a.uexpr);
    return _makeUnit(_numVal(a) * b.value, b.uexpr);
  }
  if (op === '/') {
    if (isUnit(a) && isUnit(b)) {
      if (b.value === 0) throw _divisionByZero(a.value === 0);
      return _makeUnit(a.value / b.value, divideUexpr(a.uexpr, b.uexpr));
    }
    if (isUnit(a)) {
      const bv = _numVal(b);
      if (bv === 0) throw _divisionByZero(a.value === 0);
      return _makeUnit(a.value / bv, a.uexpr);
    }
    if (b.value === 0) throw _divisionByZero(_numVal(a) === 0);
    return _makeUnit(_numVal(a) / b.value, inverseUexpr(b.uexpr));
  }
  if (op === '^') {
    if (!isUnit(a)) throw new RPLError('Bad argument type');
    const n = _numVal(b);
    const value = Math.pow(a.value, n);
    if (Number.isNaN(value)) throw new RPLError('Bad argument value');
    return _makeUnit(value, powerUexpr(a.uexpr, n));
  }
  throw new RPLError('Bad argument type');
}


export function _scalarBinary(op, a, b) {
  if (isBinaryInteger(a) && isBinaryInteger(b)) return binIntBinary(op, a, b);
  if (isBinaryInteger(a) || isBinaryInteger(b)) {
    throw new RPLError('Bad argument type');
  }
  if (_isSymOperand(a) || _isSymOperand(b)) {
    const l = _toAst(a);
    const r = _toAst(b);
    if (!l || !r) throw new RPLError('Bad argument type');
    return (getApproxMode() ? null : _radicalBinary(op, l, r)) ?? Symbolic(AstBin(op, l, r));
  }
  if (isUnit(a) || isUnit(b)) return _unitBinary(op, a, b);
  if (!isNumber(a) || !isNumber(b)) throw new RPLError('Bad argument type');
  if (op === '/' && !isComplex(a) && !isComplex(b) && _numVal(b) === 0 && _numVal(a) !== 0) return _infiniteResult(_numVal(a) < 0);
  const p = promoteNumericPair(a, b);
  if (p.kind === 'complex') {
    const r = complexBinary(op, p.a, p.b);
    return Complex(r.re, r.im);
  }
  if (p.kind === 'integer') {
    if (op === '/' && p.b !== 0n && p.a % p.b !== 0n) {
      if (getApproxMode()) {
        // Through strings so big integers keep their digits.
        const da = new Decimal(p.a.toString());
        const db = new Decimal(p.b.toString());
        return Real(da.div(db));
      }
      return Rational(p.a, p.b);
    }
    if (op === '^' && p.b < 0n) return _integerReciprocalPower(p.a, p.b);
    return Integer(integerBinary(op, p.a, p.b));
  }
  if (p.kind === 'rational') {
    if (getApproxMode()) {
      const ra = new Decimal(p.a.n.toString()).div(new Decimal(p.a.d.toString()));
      const rb = new Decimal(p.b.n.toString()).div(new Decimal(p.b.d.toString()));
      return Real(realBinary(op, ra, rb));
    }
    return _rationalBinary(op, p.a, p.b);
  }
  if (op === '^' && p.a.isNegative() && !p.b.isInteger()) {
    const modulus = Decimal.pow(p.a.neg(), p.b).toNumber();
    const angle = Math.PI * p.b.toNumber();
    const snap = (x) => (Math.abs(x) < modulus * 1e-15 ? 0 : x);
    return Complex(snap(modulus * Math.cos(angle)), snap(modulus * Math.sin(angle)));
  }
  return Real(realBinary(op, p.a, p.b));
}


// EVAL's exact rewrites: √12 is 2*√3, 4^(1/2) is 2, products, quotients and powers of roots work out, and like terms gather.
function _radicalRewrite(ast, gather) {
  if (ast.kind === 'neg') {
    const arg = _radicalRewrite(ast.arg, gather);
    if (gather && arg.kind === 'neg') return arg.arg;
    return arg === ast.arg ? ast : AstNeg(arg);
  }
  if (ast.kind === 'fn') {
    const args = ast.args.map((a) => _radicalRewrite(a, gather));
    const x = ast.name === 'SQRT' && args.length === 1 ? exactRational(args[0]) : null;
    if (x && x[0] >= 0n) return _toAst(exactSqrt(x[1] === 1n ? Integer(x[0]) : Rational(x[0], x[1])));
    return args.every((a, i) => a === ast.args[i]) ? ast : AstFn(ast.name, args);
  }
  if (ast.kind !== 'bin') return ast;
  const l = _radicalRewrite(ast.l, gather), r = _radicalRewrite(ast.r, gather);
  const gathered = gather && gatherLike(AstBin(ast.op, l, r));
  if (gathered) return gathered;
  const base = ast.op === '^' ? exactRational(l) : null, exp = base && exactRational(r);
  const power = exp && exp[1] !== 1n && base[0] >= 0n ? _exactPower(new Fraction(base[0], base[1]), new Fraction(exp[0], exp[1])) : null;
  const value = power ?? _radicalBinary(ast.op, l, r);
  if (value) return _toAst(value);
  return l === ast.l && r === ast.r ? ast : AstBin(ast.op, l, r);
}

function _rationalBinary(op, a, b) {
  const fa = new Fraction(a.n, a.d);
  const fb = new Fraction(b.n, b.d);
  let r;
  switch (op) {
    case '+': r = fa.add(fb); break;
    case '-': r = fa.sub(fb); break;
    case '*': r = fa.mul(fb); break;
    case '/':
      if (fb.n === 0n) throw _divisionByZero(fa.n === 0n);
      r = fa.div(fb);
      break;
    case '^': {
      if (fb.d === 1n) { _checkBigPower(fa.n > fa.d ? fa.n : fa.d, fb.n); r = fa.pow(fb); break; }
      // A fractional exponent stays symbolic in EXACT mode so 2^(1/3) remains exact, unless the root comes out.
      if (!getApproxMode()) {
        const exact = _exactPower(fa, fb);
        if (exact) return exact;
        const signedBaseN = fa.s * fa.n;
        const signedExpN = fb.s * fb.n;
        const baseAst = a.d === 1n
          ? AstNum(Number(signedBaseN))
          : AstBin('/', AstNum(Number(signedBaseN)), AstNum(Number(fa.d)));
        const expAst = AstBin('/', AstNum(Number(signedExpN)), AstNum(Number(fb.d)));
        return Symbolic(AstBin('^', baseAst, expAst));
      }
      return Real(Math.pow(Number(fa.s * fa.n) / Number(fa.d),
                           Number(fb.s * fb.n) / Number(fb.d)));
    }
    default: throw new RPLError('Bad argument type');
  }
  return _fractionValue(r);
}


export function _isScalarOperand(v) {
  return isNumber(v) || isBinaryInteger(v) || _isSymOperand(v);
}


export function _withListUnary(handler) {
  const apply = (s, item) => {
    if (isList(item)) return RList(item.items.map(e => apply(s, e)));
    s.push(item);
    handler(s);
    return s.pop();
  };
  return (s) => {
    if (s.depth >= 1 && isList(s.peek())) {
      const v = s.pop();
      s.push(apply(s, v));
      return;
    }
    // An equation maps over both sides: f('X=Y') → 'f(X)=f(Y)'.
    if (s.depth >= 1) {
      const top = s.peek();
      if (isSymbolic(top) && top.expr.kind === 'bin' && top.expr.op === '=') {
        s.pop();
        s.push(Symbolic(top.expr.l));
        handler(s);
        const lResult = s.pop();
        s.push(Symbolic(top.expr.r));
        handler(s);
        const rResult = s.pop();
        const lAst = _toAst(lResult);
        const rAst = _toAst(rResult);
        if (!lAst || !rAst) throw new RPLError('Bad argument type');
        s.push(Symbolic(AstBin('=', lAst, rAst)));
        return;
      }
    }
    handler(s);
  };
}


export function _withListBinary(handler) {
  const apply = (s, a, b) => {
    if (isList(a) && isList(b)) {
      if (a.items.length !== b.items.length) throw new RPLError('Invalid dimension');
      return RList(a.items.map((x, i) => apply(s, x, b.items[i])));
    }
    if (isList(a)) return RList(a.items.map(x => apply(s, x, b)));
    if (isList(b)) return RList(b.items.map(x => apply(s, a, x)));
    s.push(a); s.push(b);
    handler(s);
    return s.pop();
  };
  return (s) => {
    if (s.depth >= 2 && (isList(s.peek(1)) || isList(s.peek(2)))) {
      const [a, b] = s.popN(2);
      s.push(apply(s, a, b));
      return;
    }
    handler(s);
  };
}


// Tagged arguments are unwrapped; unary ops re-tag the result, binary ops drop
// the tags (AUR §3.4).
export function _withTaggedUnary(handler) {
  return (s) => {
    if (s.depth >= 1 && isTagged(s.peek())) {
      const t = s.pop();
      s.push(t.value);
      handler(s);
      const r = s.pop();
      s.push(Tagged(t.tag, r));
      return;
    }
    handler(s);
  };
}


export function _withTaggedBinary(handler) {
  return (s) => {
    if (s.depth >= 2 && (isTagged(s.peek(1)) || isTagged(s.peek(2)))) {
      const [a, b] = s.popN(2);
      s.push(isTagged(a) ? a.value : a);
      s.push(isTagged(b) ? b.value : b);
      handler(s);
      return;
    }
    handler(s);
  };
}


export function _withVMUnary(handler) {
  const apply = (s, item) => {
    s.push(item);
    handler(s);
    return s.pop();
  };
  return (s) => {
    if (s.depth >= 1) {
      const top = s.peek();
      if (isVector(top)) {
        const v = s.pop();
        s.push(Vector(v.items.map(x => apply(s, x))));
        return;
      }
      if (isMatrix(top)) {
        const m = s.pop();
        s.push(Matrix(m.rows.map(row => row.map(x => apply(s, x)))));
        return;
      }
    }
    handler(s);
  };
}


// A CAS command takes an array or a list of expressions entry by entry, as EXPAND's AUR entry says: of argc
// arguments, the one `at` levels down may be an array or a list, and the command runs on each entry with the
// others; entries that fail `only` pass through as they are, and a list inside a list is taken the same way.
// A vector whose entries all give equal-length vectors comes back a matrix, so DERIV of [ f g ] by [ X Y ] is the Jacobian.
export function _entryWise(handler, { argc = 1, at = null, only = null } = {}) {
  const wrapped = (s) => {
    const n = typeof argc === 'function' ? argc(s) : argc;
    const level = at ?? n;
    const v = s.depth >= n ? s.peek(level) : null;
    if (!isVector(v) && !isMatrix(v) && !isList(v)) { handler(s); return; }
    const args = s.popN(n);
    const k = n - level;
    const apply = (x) => {
      if (only && !only(x) && !isList(x)) return x;
      const base = s.depth;
      args.forEach((a, i) => s.push(i === k ? x : a));
      (isList(x) ? wrapped : handler)(s);
      if (s.depth !== base + 1) throw new RPLError('Bad argument value');
      return s.pop();
    };
    if (isList(v)) {
      s.push(RList(v.items.map(apply)));
      return;
    }
    if (isMatrix(v)) {
      const rows = v.rows.map((row) => row.map(apply));
      if (rows.flat().some((x) => isVector(x) || isMatrix(x))) throw new RPLError('Invalid dimension');
      s.push(Matrix(rows));
      return;
    }
    const items = v.items.map(apply);
    const jacobian = items.length > 0 && items.every((x) => isVector(x) && x.items.length === items[0].items.length);
    s.push(jacobian ? Matrix(items.map((x) => x.items)) : Vector(items));
  };
  return wrapped;
}


// The AUR's `name` forms of TRN, RDM and CON: the argument that is a name stands for the vector or matrix the variable holds,
// and the result is stored back in it, leaving nothing. `at` levels down is where the name sits among `argc` arguments.
export function _withNamedArray(handler, { argc = 1, at = argc } = {}) {
  return (s) => {
    const target = s.depth >= argc ? s.peek(at) : null;
    if (!isName(target)) { handler(s); return; }
    const bound = recallVar(target.id);
    if (bound === undefined) throw new RPLError(`Undefined name: ${target.id}`);
    if (!isVector(bound) && !isMatrix(bound)) throw new RPLError('Bad argument type');
    const args = s.popN(argc);
    args[argc - at] = bound;
    for (const a of args) s.push(a);
    handler(s);
    storeVar(target.id, s.pop());
  };
}


export function _scalarSum(parts) {
  if (parts.length === 0) return Real(0);
  let acc = parts[0];
  for (let i = 1; i < parts.length; i++) acc = _tidyBinary('+', acc, parts[i]);
  return acc;
}

const _isExactly = (v, n) => (isInteger(v) && v.value === BigInt(n)) || (isReal(v) && v.value.eq(n));

// Array arithmetic writes X, not 1*X or X+0, beside a symbolic entry.
export function _tidyBinary(op, a, b) {
  if (_isSymOperand(a) || _isSymOperand(b)) {
    if (op === '*') {
      if (_isExactly(a, 1)) return b;
      if (_isExactly(b, 1)) return a;
      if (_isExactly(a, 0)) return a;
      if (_isExactly(b, 0)) return b;
      if (_isExactly(a, -1)) return Symbolic(AstNeg(_toAst(b)));
    } else if (op === '+' || op === '-') {
      if (_isExactly(b, 0)) return a;
      if (_isExactly(a, 0)) return op === '+' ? b : Symbolic(AstNeg(_toAst(b)));
    }
  }
  return _scalarBinary(op, a, b);
}

export const _hasSymEntry = (values) => values.some(_isSymOperand);


export function binIntBinary(op, a, b) {
  const m = getWordsizeMask();
  const av = a.value & m;
  const bv = b.value & m;
  let r;
  switch (op) {
    case '+': r = av + bv; break;
    case '-': r = av - bv; break;
    case '*': r = av * bv; break;
    case '/':
      // The AUR: "A divisor of zero returns # 0."
      r = bv === 0n ? 0n : av / bv;
      break;
    case '^':
      r = _modPow(av, bv, m + 1n);
      break;
    default:
      throw new RPLError('Unknown op ' + op);
  }
  return BinaryInteger(r & m, a.base);
}


function _modPow(x, e, n) {
  if (n === 1n) return 0n;
  let result = 1n;
  let base = x % n;
  let exp = e;
  while (exp > 0n) {
    if (exp & 1n) result = (result * base) % n;
    exp >>= 1n;
    base = (base * base) % n;
  }
  return result;
}


function realBinary(op, a, b) {
  if (op === '/' && b.isZero()) throw _divisionByZero(a.isZero());
  switch (op) {
    case '+': return a.plus(b);
    case '-': return a.minus(b);
    case '*': return a.times(b);
    case '/': return a.div(b);
    case '^':
      if (a.isZero() && b.isNegative()) throw new RPLError('Infinite result');
      return Decimal.pow(a, b);
  }
  throw new RPLError('Unknown op ' + op);
}


// `_scalarBinary` handles inexact quotients before calling this.
function integerBinary(op, a, b) {
  switch (op) {
    case '+': return a + b;
    case '-': return a - b;
    case '*': return a * b;
    case '/':
      if (b === 0n) throw _divisionByZero(a === 0n);
      return a / b;
    case '^':
      return _bigPower(a, b);
  }
  throw new RPLError('Unknown op ' + op);
}

// As MAX_INTEGER_DIGITS does for numbers, this bounds an array or list to what the HP's memory could hold.
export const MAX_CELLS = 1_000_000;

function _checkBigPower(a, b) {
  const mag = a < 0n ? -a : a;
  const log10 = Number.isFinite(Number(mag)) ? Math.log10(Number(mag)) : mag.toString().length - 1;
  if (mag > 1n && Number(b) * log10 > MAX_INTEGER_DIGITS) throw new RPLError('Insufficient memory');
}

function _bigPower(a, b) {
  _checkBigPower(a, b);
  return a ** b;
}

// A negative integer exponent gives an exact fraction, or a Real in APPROX mode.
function _integerReciprocalPower(a, b) {
  if (a === 0n) throw new RPLError('Infinite result');
  if (getApproxMode()) return Real(Decimal.pow(new Decimal(a.toString()), new Decimal(b.toString())));
  const denominator = _bigPower(a, -b);
  return denominator === 1n || denominator === -1n ? Integer(denominator) : Rational(1n, denominator);
}


function complexBinary(op, a, b) {
  if (op === '/' && b.re === 0 && b.im === 0) {
    throw _divisionByZero(a.re === 0 && a.im === 0);
  }
  const ca = new Complex$(a);
  const cb = new Complex$(b);
  let r;
  switch (op) {
    case '+': r = ca.add(cb); break;
    case '-': r = ca.sub(cb); break;
    case '*': r = ca.mul(cb); break;
    case '/': r = ca.div(cb); break;
    case '^': r = cb.im === 0 && Number.isSafeInteger(cb.re) ? _complexIntPow(ca, cb.re) : ca.pow(cb); break;
    default: throw new RPLError('Unknown op ' + op);
  }
  return { re: r.re, im: r.im };
}

// By squaring, as SQ and * do: the polar form leaves noise such as (1,1)^2 = (1.2E-16, 2).
function _complexIntPow(z, n) {
  let result = new Complex$(1, 0), base = z;
  for (let k = Math.abs(n); k > 0; k = Math.floor(k / 2)) {
    if (k % 2) result = result.mul(base);
    base = base.mul(base);
  }
  return n < 0 ? result.inverse() : result;
}



const _isPowerOfTen = (n, d) => (n === 1n ? /^10*$/.test(d.toString()) : d === 1n && n > 0n && /^10*$/.test(n.toString()));

// The arguments n/d at which a function gives an integer in EXACT mode.  A
// double near an integer proves nothing: EXP(100) is an integer-valued double
// and EXP(-30) is within 1e-12 of 0, yet neither is an integer.  Angles are
// in the current angle mode.
function _integerPoint(fnName, n, d) {
  const at = (a, b = 1n) => n * b === a * d;
  switch (fnName) {
    case 'EXP': case 'SINH': case 'COSH': case 'TANH': case 'ASINH': case 'ATANH': case 'R→D': case 'D→R':
      return n === 0n;
    case 'LN': case 'ACOSH': return at(1n);
    case 'LOG': return _isPowerOfTen(n, d);
    case 'SIN': case 'COS': case 'TAN': {
      const unit = { DEG: 45n, GRD: 50n }[_calcState.angle];
      return n === 0n || (unit !== undefined && n % (unit * d) === 0n);
    }
    case 'ASIN': case 'ACOS': return n === 0n || at(1n) || at(-1n) || at(1n, 2n) || at(-1n, 2n);
    case 'ATAN': return n === 0n || at(1n) || at(-1n);
    default: return true;
  }
}

// Beyond this a double cannot tell an integer from a near miss, and TAN at an odd multiple of 90 degrees is a huge finite number.
const EXACT_FOLD_LIMIT = 1e6;

const EXACT_POWER_MAX = 1000n;

// EXACT mode keeps LN(2)-style results symbolic but folds integer results such
// as LN(1) = 0.
export function _exactUnaryLift(fnName, yScalar, v) {
  if (fnName === 'ALOG' && isInteger(v) && v.value >= -EXACT_POWER_MAX && v.value <= EXACT_POWER_MAX) {
    return v.value >= 0n ? Integer(10n ** v.value) : Rational(1n, 10n ** -v.value);
  }
  if (Number.isFinite(yScalar) && Math.abs(yScalar) <= EXACT_FOLD_LIMIT) {
    const rounded = Math.round(yScalar);
    const [n, d] = isRational(v) ? [v.n, v.d] : [v.value, 1n];
    if (Math.abs(yScalar - rounded) < 1e-12 && _integerPoint(fnName, n, d)) return Integer(BigInt(rounded));
  }
  return Symbolic(AstFn(fnName, [_toAst(v)]));
}


export function unaryReal(name, fn) {
  const fnName = name.toUpperCase();
  return _withListUnary((s) => {
    const v = s.pop();
    if (_isSymOperand(v)) {
      s.push(Symbolic(AstFn(fnName, [_toAst(v)])));
      return;
    }
    if (!getApproxMode() && (isInteger(v) || isRational(v))) {
      const x = isRational(v) ? Number(v.n) / Number(v.d) : Number(v.value);
      s.push(_exactUnaryLift(fnName, fn(x), v));
      return;
    }
    s.push(Real(fn(toRealOrThrow(v))));
  });
}


export function _coerceDirName(v) {
  if (isName(v))   return v.id;
  if (isString(v)) return v.value;
  throw new RPLError('Bad argument type');
}


// Names that create or overwrite a binding must be valid, non-reserved HP50
// identifiers; read paths use _coerceDirName so any existing name stays reachable.
export function _coerceStorableName(v) {
  const id = _coerceDirName(v);
  if (!isValidHpIdentifier(id)) {
    const inner = /^'(.+)'$/.exec(id)?.[1];
    const hint = inner && isValidHpIdentifier(inner) ? ` (quote names with backticks: \`${inner}\`)` : '';
    throw new RPLError(`Invalid name: ${id}${hint}`);
  }
  if (!isStorableHpName(id)) {
    throw new RPLError(`Invalid name: ${id}`);
  }
  return id;
}


// Programs called by name run on a driver stack (see _drive), so this bounds memory, not the JS call stack: a few thousand
// calls, as the HP manages.  A program called inside an algebraic still nests on the call stack, so it keeps the small limit.
const MAX_EVAL_DEPTH = 12000;
const MAX_USER_CALL_DEPTH = 256;

// HP50 loops have no iteration cap; this one keeps a runaway loop recoverable. A loop that pauses, as one polling KEY
// does, can be stopped from its banner, so its count starts again after each pause.
const MAX_LOOP_ITERATIONS = 1_000_000;

function _loopLimit(message) {
  let run = _resumedAt;
  let count = 0;
  return () => {
    if (run !== _resumedAt) { run = _resumedAt; count = 0; }
    if (++count > MAX_LOOP_ITERATIONS) throw new RPLError(message);
  };
}


// The HP runs its command line as a program, so these open their dialog there too. HALT and PROMPT
// stay errors on the line: they would leave it suspended with nothing after them.
const LINE_DIALOGS = new Set(['MSGBOX', 'CHOOSE', 'INPUT', 'INFORM', 'WAIT']);

// A command line holding a program structure or → runs as one program, as on
// the HP50, instead of pushing FOR, NEXT and the rest as names.
export function isProgramLine(values) {
  return values.some((v) => {
    const id = bareNameId(v);
    return id !== null && (CF_OPENERS.has(id) || LINE_DIALOGS.has(id) || id === '→' || id === '->');
  });
}

export function runProgramLine(s, values) {
  pausableRun(() => runSuspendable(_evalValueGen(s, Program(values), 0, false)));
}


// STO, RCL and the other commands that take a variable's name reach a local
// variable first, as on the HP50.
export function recallVar(id) {
  const frame = _localFrame(id);
  return frame ? frame.get(id) : varRecall(id);
}

export function storeVar(id, value) {
  const frame = _localFrame(id);
  if (!frame) { varStore(id, value); return; }
  frame.set(id, value);
  if (_calcState.halted && _runDepth === 0) notify();
}


// Single-step debugger state.  With _singleStepMode set, evalRange yields after
// every token, except inside a named sub-program (_insideSubProgram) unless SST↓
// also set _stepInto.
let _singleStepMode = false;

let _stepInto = false;

let _insideSubProgram = false;


export function singleStepMode() { return _singleStepMode; }

export function stepIntoMode() { return _stepInto; }


// What a halted program can still see of its local variables: each name once, as the program would resolve it, innermost first.
export function haltedLocals() {
  if (!_calcState.halted) return [];
  const seen = new Set();
  const found = [];
  for (let i = _localFrames.length - 1; i >= 0; i--) {
    for (const [id, value] of _localFrames[i]) {
      if (value != null && !seen.has(id)) { seen.add(id); found.push([id, value]); }
    }
  }
  return found;
}


export function withStepMode(single, into, fn) {
  const saved = [_singleStepMode, _stepInto];
  _singleStepMode = single;
  _stepInto = into;
  try {
    fn();
  } finally {
    [_singleStepMode, _stepInto] = saved;
  }
}


// `→ n1 n2 … body` binds locals from the stack for one Program or algebraic body.
// A structure that finds too few values names itself, as a failing command does, so its banner counts the stack the
// structure saw and does not blame the EVAL that was running it.
function takeValues(s, structure, n) {
  if (s.depth < n) throw Object.assign(new RPLError(`${structure}: Too few arguments`), { depth: s.depth, missing: n - s.depth, argsReturned: true });
  return s.popN(n);
}


// A control structure that refuses its own arguments gives them back, as a command
// does, so the EVAL running it leaves the stack where the program got to.
function _giveBack(s, values, e) {
  if (e instanceof RPLError && !e.argsReturned) {
    for (const v of values) s.push(v);
    e.argsReturned = true;
  }
  return e;
}


function* runArrow(s, toks, arrowIdx, to, depth) {
  const names = [];
  let i = arrowIdx + 1;
  while (i < to && isName(toks[i]) && !toks[i].quoted) {
    names.push(toks[i].id);
    i++;
  }
  if (names.length === 0) {
    throw new RPLError('→: no local variable names');
  }
  if (i >= to) {
    throw new RPLError('→: missing body');
  }
  const body = toks[i];
  if (!isProgram(body) && !isSymbolic(body)) {
    throw new RPLError('→: body must be a program or algebraic');
  }
  // popN returns [level n … level 1], so the rightmost name binds level 1.
  const values = takeValues(s, '→', names.length);
  const frame = new Map(names.map((name, k) => [name, values[k]]));
  _localFrames.push(frame);
  try {
    if (isProgram(body)) {
      yield* evalRange(s, body.tokens, 0, body.tokens.length, depth + 1);
    } else {
      yield* _evalValueGen(s, body, depth + 1);
    }
  } finally {
    _localFrames.splice(_localFrames.lastIndexOf(frame), 1);
  }
  return i + 1;
}


// Ops that evaluate a program argument run inline, so a HALT inside that
// program suspends the enclosing one.
const SUSPENDABLE_OPS = new Map([
  ['IFT', runIft], ['IFTE', runIfte], ['SEQ', runSeq], ['MAP', runMap],
  ['DOLIST', runDoList], ['DOSUBS', runDoSubs], ['STREAM', runStream], ['PROMPTSTO', runPromptSto], ['RULES', runRules],
]);


// Evaluates toks[from, to).  A generator: it yields at HALT, PROMPT and single
// steps so the caller can park the live program on the halted stack.
function* evalRange(s, toks, from, to, depth) {
  if (depth > MAX_EVAL_DEPTH) {
    throw new RPLError('EVAL recursion too deep');
  }
  let i = from;
  while (i < to) {
    checkTimeLimit();
    if (_sliceNow()) {
      _markSuspend(toks, i, HALT_KIND.SLICE);
      yield;
    }
    const tok = toks[i];
    const id = bareNameId(tok);
    if (id && CF_OPENERS.has(id)) {
      i = yield* runControl(s, toks, i, depth);
      yield* _stepYield(toks, i);
      continue;
    }
    if (id === '→' || id === '->') {
      i = yield* runArrow(s, toks, i, to, depth);
      yield* _stepYield(toks, i);
      continue;
    }
    if (id === 'HALT') {
      _markSuspend(toks, i + 1, HALT_KIND.HALT);
      yield;
      i++;
      continue;
    }
    if (id === 'PROMPT' || id === 'MSGBOX') {
      if (s.depth < 1) throw new RPLError(`${id}: Too few arguments`);
      _markSuspend(toks, i + 1, id === 'PROMPT' ? HALT_KIND.PROMPT : HALT_KIND.MSGBOX, null, s.pop());
      yield;
      i++;
      continue;
    }
    if (id === 'INPUT') {
      if (s.depth < 2) throw new RPLError('INPUT: Too few arguments');
      const input = inputSpec(s.peek());
      s.pop();
      _markSuspend(toks, i + 1, HALT_KIND.INPUT, input, s.pop());
      yield;
      i++;
      continue;
    }
    if (id === 'CHOOSE') {
      if (s.depth < 3) throw new RPLError('CHOOSE: Too few arguments');
      const choose = chooseSpec(s.peek(2), s.peek());
      s.pop();
      s.pop();
      _markSuspend(toks, i + 1, HALT_KIND.CHOOSE, choose, s.pop());
      yield;
      i++;
      continue;
    }
    if (id === 'WAIT') {
      if (s.depth < 1) throw new RPLError('WAIT: Too few arguments');
      const wait = waitSpec(s.peek());
      s.pop();
      _markSuspend(toks, i + 1, HALT_KIND.WAIT, wait);
      yield;
      i++;
      continue;
    }
    if (id === 'KEY' && _keyCanPause()) {
      _markSuspend(toks, i + 1, HALT_KIND.WAIT, KEY_POLL);
      yield;
      i++;
      continue;
    }
    if (id === 'INFORM') {
      if (s.depth < 5) throw new RPLError('INFORM: Too few arguments');
      const inform = informSpec(s.peek(5), s.peek(4), s.peek(3), s.peek(2), s.peek());
      const title = s.peek(5);
      s.popN(5);
      _markSuspend(toks, i + 1, HALT_KIND.INFORM, inform, title);
      yield;
      i++;
      continue;
    }
    const runner = id && SUSPENDABLE_OPS.get(id);
    if (runner) {
      yield* runner(s, depth);
      i++;
      yield* _stepYield(toks, i);
      continue;
    }
    if (id && (CF_CLOSERS.has(id) || CF_INNERS.has(id))) {
      i++;
      continue;
    }
    yield* evalToken(s, tok, depth);
    i++;
    yield* _stepYield(toks, i);
  }
}


// Where the program stopped, recorded just before each yield for the halted view; a dialog's details ride along, and
// whether the program was being stepped, so that its answer steps on rather than running free.
let _pendingSuspend = null;

// KEY finds a key only when the program pauses for one, so it pauses after each 50 ms of running, where the page can
// take a press; a part that can't pause and a stepped program find none, as KEY at the command line does.
const KEY_SLICE_MS = 50;
const KEY_POLL = Object.freeze({ key: true, poll: true });
let _resumedAt = 0;
let _unpausable = 0;

// The page can't take a press while a program runs, so a program that has run for _sliceMs pauses (a halt of kind slice that
// the app resumes at once), which is also where its Stop key is heard.  Only the app asks for it; 0 never pauses.  Only a
// program the user starts (a line, EVAL, CONT) may pause: an op that evaluates a program in the middle of its own work needs
// the answer at once.
let _sliceMs = 0;
let _sliceOk = false;
let _runDepth = 0;

export function setRunSlice(ms) { _sliceMs = ms; }

export function withoutRunSlices(fn) {
  const saved = _sliceMs;
  _sliceMs = 0;
  try { return fn(); } finally { _sliceMs = saved; }
}

export function pausableRun(fn) {
  const saved = _sliceOk;
  _sliceOk = true;
  try { return fn(); } finally { _sliceOk = saved; }
}

function _sliceNow() {
  return _sliceOk && sliceDue() && _sliceMs > 0 && _runDepth === 1 && !_unpausable && !_singleStepMode && !inScratchState();
}

function _keyCanPause() {
  return !_singleStepMode && !_unpausable && Date.now() - _resumedAt >= KEY_SLICE_MS;
}

function _markSuspend(tokens, index, kind, dialog = null, prompt = null) {
  const stepping = _singleStepMode ? (_stepInto ? 'into' : 'over') : null;
  _pendingSuspend = { tokens, index, kind, dialog, stepping, prompt };
}

function* _stepYield(tokens, index) {
  if (!_singleStepMode || (_insideSubProgram && !_stepInto)) return;
  _markSuspend(tokens, index, HALT_KIND.STEP);
  yield;
}


// Runs a program generator until it yields or finishes.  A yield parks the live
// generator on the halted stack; any other exit unwinds leftover local frames.
// Either way an unfrozen DISP display goes, as the HP's does when the keyboard is ready, except at a WAIT, whose
// message the pause is for.
export function runSuspendable(program) {
  const gen = _driven(program);
  const framesAtEntry = _localFrames.length;
  let halted = false;
  let waiting = false;
  _resumedAt = Date.now();
  if (_runDepth === 0) startSlice(_sliceMs);
  _runDepth++;
  try {
    if (!gen.next().done) {
      halted = true;
      const { tokens = null, index = null, kind = null, dialog = null, stepping = null, prompt = null } = _pendingSuspend ?? {};
      _pendingSuspend = null;
      waiting = kind === HALT_KIND.WAIT || kind === HALT_KIND.SLICE;
      setHalted({ generator: gen, tokens, index, kind, dialog, stepping, prompt });
    }
  } finally {
    _runDepth--;
    if (!waiting) settleLcd();
    if (!halted) {
      _pendingSuspend = null;
      for (let i = _localFrames.length - 1; i >= framesAtEntry; i--) {
        if (!_boundFrames.includes(_localFrames[i])) _localFrames.splice(i, 1);
      }
    }
  }
}


// A generator that delegates with yield* adds to the JS call stack for every level it nests, so a program that calls itself
// a few hundred times overflowed it.  A call by name instead yields its callee to this loop, which runs the generators from
// a flat stack of its own.  A yield of anything else is a real pause (HALT, a dialog, a step) and goes on up.
const CALL = Symbol('call');
const _drivers = new WeakSet();

function* _onDriver(callee) {
  return yield { [CALL]: callee };
}

function* _drive(root) {
  const frames = [root];
  let value;
  let error = null;
  try {
    while (frames.length) {
      const top = frames[frames.length - 1];
      let step;
      try {
        step = error ? top.throw(error.thrown) : top.next(value);
      } catch (e) {
        frames.pop();
        if (!frames.length) throw e;
        error = { thrown: e };
        value = undefined;
        continue;
      }
      error = null;
      if (step.done) { frames.pop(); value = step.value; continue; }
      if (step.value?.[CALL]) { frames.push(step.value[CALL]); value = undefined; continue; }
      value = yield step.value;
    }
  } finally {
    for (let i = frames.length - 1; i >= 0; i--) {
      try { frames[i].return(); } catch { /* a frame that has already finished */ }
    }
  }
}

function _driven(program) {
  if (_drivers.has(program)) return program;
  const driver = _drive(program);
  _drivers.add(driver);
  return driver;
}


function* evalToken(s, tok, depth) {
  if (isName(tok)) {
    if (tok.quoted) { s.push(tok); return; }
    const localVal = _localLookup(tok.id);
    if (localVal !== undefined) { s.push(localVal); return; }
    const op = lookup(tok.id);
    if (op) { _dispatchOp(op, s, op.name); return; }
    const bound = varRecall(tok.id);
    if (bound !== undefined) yield* _callGlobal(s, bound, depth + 1);
    else s.push(tok);
    return;
  }
  s.push(tok);
}


// AUR EVAL table: a global's name, program or directory is evaluated; any
// other content, an algebraic included, is put on the stack as it is.
function* _callGlobal(s, bound, depth, isSubProgram = true) {
  if (isName(bound) || isProgram(bound) || isDirectory(bound)) {
    yield* _onDriver(_evalValueGen(s, bound, depth, isSubProgram));
  } else {
    s.push(bound);
  }
}


// Prefixes op errors with the command name (`+: Too few arguments`) and the
// stack depth the command saw, unless the message already carries a name.  As on
// the HP, the command that fails gives its arguments back and what ran before it
// stays; the error is then marked settled (keepsFailureStack), so an EVAL, IFT or
// IFERR running it leaves the stack there.
function _dispatchOp(op, s, name) {
  const args = s.beginArgs();
  const before = args.prior;
  const depth = before.length;
  let ok = false;
  try {
    op.fn(s);
    ok = true;
  } catch (e) {
    if (e instanceof RPLError && !e.argsReturned) {
      s.restore(before);
      e.argsReturned = true;
    }
    if (e instanceof RPLError && !/^[^\s:]+:\s/.test(e.message)) {
      const named = new RPLError(`${name}: ${e.message}`);
      named.argsReturned = e.argsReturned;
      named.errorNumber = e.errorNumber;
      named.depth = depth;
      named.missing = e.missing;
      throw named;
    }
    throw e;
  } finally {
    s.endArgs(args, ok);
  }
}

// Any other error puts the stack back as the EVAL or IFT found it.
export const keepsFailureStack = (e) => e instanceof RPLAbort || e.argsReturned === true;


function* runControl(s, toks, i, depth) {
  const opener = bareNameId(toks[i]);

  switch (opener) {
    case 'IF':    return yield* runIf(s, toks, i, depth);
    case 'IFERR': return yield* runIfErr(s, toks, i, depth);
    case 'WHILE': return yield* runWhile(s, toks, i, depth);
    case 'DO':    return yield* runDo(s, toks, i, depth);
    case 'START': return yield* runStart(s, toks, i, depth);
    case 'FOR':   return yield* runFor(s, toks, i, depth);
    case 'CASE':  return yield* runCase(s, toks, i, depth);
  }
  throw new RPLError(`Bad opener: ${opener}`);
}


// CASE test THEN action END … [default] END: the first true test runs its action
// and skips the remaining clauses (AUR §21.3).
function* runCase(s, toks, openIdx, depth) {
  const bound = toks.length;
  let i = openIdx + 1;
  while (i < bound) {
    const scan = scanAtDepth0(toks, i, 'THEN');
    if (!scan || scan.kind === 'END') {
      const endIdx = scan ? scan.idx : bound;
      yield* evalRange(s, toks, i, endIdx, depth + 1);
      return _pastBlock(toks, endIdx);
    }
    if (scan.kind !== 'THEN') {
      throw new RPLError(`CASE: unexpected ${scan.kind}`);
    }
    const thenIdx = scan.idx;
    yield* evalRange(s, toks, i, thenIdx, depth + 1);
    const truthy = _takeTest(s, 'CASE');
    const innerEnd = scanAtDepth0(toks, thenIdx + 1, null);
    const innerEndIdx = (innerEnd && innerEnd.kind === 'END') ? innerEnd.idx : bound;
    if (truthy) {
      yield* evalRange(s, toks, thenIdx + 1, innerEndIdx, depth + 1);
      return _pastCaseEnd(toks, innerEndIdx + 1);
    }
    i = innerEndIdx + 1;
  }
  return bound;
}


// A test that is an algebraic is evaluated to a number first, as the AUR describes
// for IF: IF `X>0` THEN needs no EVAL.
function _testValue(v) {
  if (!isSymbolic(v)) return v;
  const value = _evalSymbolic(v);
  if (!isSymbolic(value)) return value;
  const free = [...algebraFreeVars(v.expr)][0];
  throw new RPLError(free ? `Undefined name: ${free}` : 'Bad argument type');
}


function _takeTest(s, structure) {
  const [test] = takeValues(s, structure, 1);
  try {
    return isTruthy(_testValue(test));
  } catch (e) {
    throw _giveBack(s, [test], e);
  }
}


function* runIf(s, toks, openIdx, depth) {
  const thenIdx = _scanRequired(toks, openIdx + 1, 'THEN', 'IF without THEN');
  yield* evalRange(s, toks, openIdx + 1, thenIdx, depth + 1);
  const truthy = _takeTest(s, 'IF');
  const { elseIdx, endIdx } = _scanElseEnd(toks, thenIdx, 'IF');
  if (truthy) {
    yield* evalRange(s, toks, thenIdx + 1, elseIdx >= 0 ? elseIdx : endIdx, depth + 1);
  } else if (elseIdx >= 0) {
    yield* evalRange(s, toks, elseIdx + 1, endIdx, depth + 1);
  }
  return _pastBlock(toks, endIdx);
}


// IFERR trap THEN handler [ELSE normal] END.  A caught RPLError leaves the stack
// as the failing command found it, with that command's arguments back on it, and
// is visible to ERRM / ERRN only inside the handler, so an outer trap keeps its
// own error.  ABORT and internal errors pass through.
function* runIfErr(s, toks, openIdx, depth) {
  const thenIdx = _scanRequired(toks, openIdx + 1, 'THEN', 'IFERR without THEN');
  const { elseIdx, endIdx } = _scanElseEnd(toks, thenIdx, 'IFERR');
  const savedOuterError = getLastError();
  let caught = null;
  try {
    yield* evalRange(s, toks, openIdx + 1, thenIdx, depth + 1);
  } catch (e) {
    if (!(e instanceof RPLError)) throw e;
    caught = e;
  }

  if (caught) {
    setLastError(caught);
    try {
      yield* evalRange(s, toks, thenIdx + 1, (elseIdx >= 0 ? elseIdx : endIdx), depth + 1);
    } finally {
      restoreLastError(savedOuterError);
    }
  } else if (elseIdx >= 0) {
    yield* evalRange(s, toks, elseIdx + 1, endIdx, depth + 1);
  }
  return _pastBlock(toks, endIdx);
}


// An error in the action restores the IFT / IFTE operands; ABORT keeps the stack
// as it was at the abort, as it does everywhere else.
export function* runIft(s, depth) {
  const snap = s.save();
  try {
    const [test, action] = s.popN(2);
    if (isTruthy(test)) yield* _evalValueGen(s, action, depth + 1);
  } catch (e) {
    if (!keepsFailureStack(e)) s.restore(snap);
    throw e;
  }
}


export function* runIfte(s, depth) {
  const snap = s.save();
  try {
    const [test, tAction, fAction] = s.popN(3);
    yield* _evalValueGen(s, isTruthy(test) ? tAction : fAction, depth + 1);
  } catch (e) {
    if (!keepsFailureStack(e)) s.restore(snap);
    throw e;
  }
}


// PROMPTSTO asks for a value under the name with a ?, as INPUT does, and stores what the answer reads as.
export function promptStoProgram(v) {
  if (!isName(v)) throw new RPLError('Bad argument type');
  return Program([Str(`${v.id}?`), Str(''), Name('INPUT'), Name('STR→'), Name(v.id, { quoted: true }), Name('STO')]);
}

export function* runPromptSto(s, depth) {
  const [name] = s.popN(1);
  yield* _evalValueGen(s, promptStoProgram(name), depth + 1);
}

const CREDITS = [
  'rpl.ai: praevitium and contributors',
  'Giac: Bernard Parisse, Renée De Graeve',
  'With thanks to Eric Rechlin, Joseph K. Horn, Jean-Yves Avenard, Cyrille de Brébisson, Claudio Lapilli and William C. Wickes',
].join('\n');

export const rulesProgram = () => Program([Str(CREDITS), Name('MSGBOX')]);

function* runRules(s, depth) {
  yield* _evalValueGen(s, rulesProgram(), depth + 1);
}


function* runWhile(s, toks, openIdx, depth) {
  const repeatIdx = _scanRequired(toks, openIdx + 1, 'REPEAT', 'WHILE without REPEAT');
  const endIdx = _scanEnd(toks, repeatIdx + 1, 'WHILE/REPEAT without END');
  const limit = _loopLimit('WHILE loop iteration limit');
  while (true) {
    limit();
    checkTimeLimit();
    yield* evalRange(s, toks, openIdx + 1, repeatIdx, depth + 1);
    if (!_takeTest(s, 'WHILE')) break;
    yield* evalRange(s, toks, repeatIdx + 1, endIdx, depth + 1);
  }
  return _pastBlock(toks, endIdx);
}


function* runDo(s, toks, openIdx, depth) {
  const untilIdx = _scanRequired(toks, openIdx + 1, 'UNTIL', 'DO without UNTIL');
  const endIdx = _scanEnd(toks, untilIdx + 1, 'DO/UNTIL without END');
  const limit = _loopLimit('DO loop iteration limit');
  while (true) {
    limit();
    checkTimeLimit();
    yield* evalRange(s, toks, openIdx + 1, untilIdx, depth + 1);
    yield* evalRange(s, toks, untilIdx + 1, endIdx, depth + 1);
    if (_takeTest(s, 'DO')) break;
  }
  return _pastBlock(toks, endIdx);
}


// Integer bounds keep the loop counter a BigInt; anything else counts in Decimal,
// so 0 0.3 FOR with a 0.1 step reaches 0.3.
function _popLoopBounds(s, structure) {
  const values = takeValues(s, structure, 2);
  const [startVal, endVal] = values;
  const intMode = isInteger(startVal) && isInteger(endVal);
  const toBound = (v) => intMode ? v.value : toRealDecimal(v);
  try {
    return { a: toBound(startVal), b: toBound(endVal), intMode };
  } catch (e) {
    throw _giveBack(s, values, e);
  }
}


function* runStart(s, toks, openIdx, depth) {
  const { a, b, intMode } = _popLoopBounds(s, 'START');
  const { closer, closerIdx } = _scanCounterCloser(toks, openIdx + 1, 'START');
  yield* runLoopBody(s, toks, openIdx + 1, closerIdx, closer, a, b, null, intMode, depth);
  return _pastBlock(toks, closerIdx);
}


// The counter is a local variable, so it never touches a global of the same
// name, and storing into it inside the loop moves the loop on.
function* runFor(s, toks, openIdx, depth) {
  const { a, b, intMode } = _popLoopBounds(s, 'FOR');
  const varTok = toks[openIdx + 1];
  if (!isName(varTok)) throw new RPLError('FOR needs a name');
  const { closer, closerIdx } = _scanCounterCloser(toks, openIdx + 2, 'FOR');
  const frame = new Map([[varTok.id, null]]);
  _localFrames.push(frame);
  try {
    yield* runLoopBody(s, toks, openIdx + 2, closerIdx, closer, a, b, { frame, name: varTok.id }, intMode, depth);
  } finally {
    _localFrames.splice(_localFrames.lastIndexOf(frame), 1);
  }
  return _pastBlock(toks, closerIdx);
}


// STEP pops the increment after each pass; a non-Integer step switches an Integer
// loop to Real counting.  The loop ends once the counter passes the end value in
// the step's direction; a zero step throws instead of looping forever.
function* runLoopBody(s, toks, bodyFrom, bodyTo, closer, startVal, endVal, local, intMode, depth) {
  let counter = startVal;
  let bound   = endVal;
  let mode    = intMode;
  const limit = _loopLimit('Loop iteration limit');
  while (true) {
    limit();
    checkTimeLimit();
    let written = null;
    if (local) {
      written = mode ? Integer(counter) : Real(counter);
      local.frame.set(local.name, written);
    }
    yield* evalRange(s, toks, bodyFrom, bodyTo, depth + 1);
    const stored = local?.frame.get(local.name);
    if (local && stored !== written) {
      if (mode && isInteger(stored)) counter = stored.value;
      else {
        if (mode) { bound = new Decimal(bound.toString()); mode = false; }
        counter = toRealDecimal(stored);
      }
    }
    let step;
    if (closer === 'STEP') {
      const [stepVal] = takeValues(s, 'STEP', 1);
      if (mode && isInteger(stepVal)) {
        step = stepVal.value;
      } else {
        if (mode) {
          counter = new Decimal(counter.toString());
          bound   = new Decimal(bound.toString());
          mode    = false;
        }
        step = toRealDecimal(stepVal);
      }
      if (mode ? step === 0n : step.isZero()) throw new RPLError('STEP of 0');
    } else {
      step = mode ? 1n : new Decimal(1);
    }
    if (mode) {
      counter += step;
      if (step > 0n ? counter > bound : counter < bound) break;
    } else {
      counter = counter.plus(step);
      if (step.isPositive() ? counter.gt(bound) : counter.lt(bound)) break;
    }
  }
}


// Runs a program generator that must not suspend; a HALT or PROMPT inside it is
// reported as an error naming `caller` (e.g. 'IFT action').
export function _driveGen(program, caller) {
  const gen = _driven(program);
  _unpausable++;
  let result;
  try { result = gen.next(); } finally { _unpausable--; }
  if (!result.done) {
    try { gen.return(); } catch { /* the HALT error below wins */ }
    throw new RPLError(`HALT: cannot suspend inside ${caller}`);
  }
}


// Evaluates a value as EVAL does.  `isSubProgram` is false only for EVAL's own
// argument, which the debugger treats as the outer program.
export function* _evalValueGen(s, v, depth, isSubProgram = true) {
  if (depth > MAX_EVAL_DEPTH) {
    throw new RPLError('EVAL recursion too deep');
  }

  if (isProgram(v)) {
    if (isSubProgram) {
      const priorInside = _insideSubProgram;
      _insideSubProgram = true;
      try {
        yield* evalRange(s, v.tokens, 0, v.tokens.length, depth);
      } finally {
        _insideSubProgram = priorInside;
      }
    } else {
      yield* evalRange(s, v.tokens, 0, v.tokens.length, depth);
    }
    return;
  }

  if (isName(v)) {
    const local = _localLookup(v.id);
    if (local !== undefined) { s.push(local); return; }
    const bound = varRecall(v.id);
    if (bound !== undefined) {
      yield* _callGlobal(s, bound, depth + 1, isSubProgram);
      return;
    }
    // Under APPROX a constant folds even when quoted, so `PI` →NUM gives 3.14159….
    const constant = getApproxMode() ? _symConstantRpl(v.id) : undefined;
    s.push(constant ?? v);
    return;
  }

  if (isTagged(v)) {
    // AUR §3-77 pushes the untagged value unevaluated; evaluating it lets HALT
    // suspend through the tag.
    yield* _evalValueGen(s, v.value, depth + 1, isSubProgram);
    return;
  }

  if (isList(v)) {
    // AUR §3-77: EVAL on a List runs each item, embedded Programs included.
    for (const item of v.items) {
      if (isName(item)) {
        yield* evalToken(s, item, depth);
      } else if (isProgram(item) || isTagged(item)) {
        yield* _evalValueGen(s, item, depth + 1, isSubProgram);
      } else {
        s.push(item);
      }
    }
    return;
  }

  if (isSymbolic(v)) {
    s.push(_evalSymbolic(v));
    return;
  }

  // Evaluating a Directory enters it, like pressing its VARS key.
  if (isDirectory(v)) {
    enterDirectory(v);
    return;
  }

  s.push(v);
}


// Substitutes real-valued variables (locals first) and folds what it can.
// Constants fold only under APPROX, and EXACT keeps non-integer folds symbolic
// ('1/3' stays '1/3'). A name `keeps` says yes to stays as it is. Like terms gather unless `gather` is false.
export function _evalSymbolic(v, keeps = () => false, gather = true) {
  const approx = getApproxMode();
  // A variable holding an algebraic or a name is substituted and evaluated in
  // turn, as on the HP; one that refers back to itself stays a name.
  const resolving = new Set();
  const resolve = (name) => {
    if (keeps(name)) return null;
    const bound = _localLookup(name) ?? varRecall(name);
    if (bound === undefined) return approx ? _symConstantValue(name) : undefined;
    if (isReal(bound) || isInteger(bound) || isUnit(bound) || isRational(bound)) return _toAst(bound);
    if (!isSymbolic(bound) && !isName(bound)) return null;
    if (resolving.has(name)) return null;
    resolving.add(name);
    try { return evalNode(_expandUserCalls(_toAst(bound))); } finally { resolving.delete(name); }
  };
  const binGate = approx
    ? null
    : (_op, args, result) => _approxGate(result, args);
  const evalNode = (ast) => algebraEvalAst(ast, resolve, _angleAwareFnEval, binGate);
  const element = _indexedValue(v.expr, evalNode);
  if (element !== undefined) return approx && isInteger(element) ? Real(element.value.toString()) : element;
  const objects = _evalObjects(_expandUserCalls(v.expr), keeps);
  if (objects) return objects;
  const evaluated = _foldUnits(evalNode(_expandUserCalls(v.expr)), evalNode);
  const called = _evalCommandCalls(evaluated);
  if (called) return called;
  const trig = approx ? evaluated : _radicalRewrite(exactTrigRewrite(_complexLnRewrite(evaluated), _calcState.angle), gather);
  const folded = trig === evaluated ? evaluated : evalNode(trig);
  const integrated = _casCalculus(folded);
  const calculated = integrated === folded ? folded : evalNode(integrated);
  const settled = _casSpecialValues(calculated);
  const reduced = settled === calculated ? calculated : evalNode(settled);
  const infinite = testUserFlag(-22) && _infiniteTop(reduced);
  if (infinite) return infinite;
  _checkInfinite(reduced);
  const value = (approx && _foldImaginary(reduced)) || _astToRplValue(reduced);
  return approx && isInteger(value) ? Real(value.value.toString()) : value;
}


// The algebra evaluator holds real numbers only, so an expression whose variables hold a complex number, a list, a vector or a
// matrix is worked out with the commands themselves, as the HP runs an algebraic: 'A*B' with two stored matrices is their product.
// Null when no variable holds one, or a name has no value to work with, and the expression goes on as it was.
const _OBJECT_OPS = new Set(['+', '-', '*', '/', '^']);
const _OBJECT_FUNCTIONS = new Set(['DET', 'INV', 'TRN', 'SQ', 'TRACE', 'CNRM', 'RNRM', 'DOT', 'CROSS', 'RANK']);
const _isObjectValue = (v) => isComplex(v) || isList(v) || isVector(v) || isMatrix(v);

function _evalObjects(ast, keeps) {
  const bound = new Map([...algebraFreeVars(ast)].map((name) => [name, keeps(name) ? undefined : _localLookup(name) ?? varRecall(name)]));
  if (![...bound.values()].some(_isObjectValue)) return null;
  const approx = getApproxMode();
  const walk = (node) => {
    if (node.kind === 'num') return _numToRpl(node);
    if (_isArrayLiteral(node)) return _astToRplValue(node);
    if (node.kind === 'var') {
      const value = bound.get(node.name) ?? (approx && !keeps(node.name) ? _symConstantRpl(node.name) : undefined);
      return _isObjectValue(value) || isReal(value) || isInteger(value) || isRational(value) ? value : undefined;
    }
    const name = node.kind === 'fn' ? node.name.toUpperCase() : '';
    const call = node.kind === 'neg' ? ['NEG', [node.arg]]
      : node.kind === 'bin' && _OBJECT_OPS.has(node.op) ? [node.op, [node.l, node.r]]
        : (_OBJECT_FUNCTIONS.has(name) || (isKnownFunction(name) && !_LAZY_FUNCTIONS.has(name))) && lookup(name) ? [name, node.args] : null;
    if (!call) return undefined;
    const args = call[1].map(walk);
    if (args.includes(undefined)) return undefined;
    const s = new Stack();
    args.forEach((arg) => s.push(arg));
    lookup(call[0]).fn(s);
    return s.depth === 1 ? s.pop() : undefined;
  };
  return walk(ast) ?? null;
}


// A function DEFINE made, « → X Y `body` », taking `arity` arguments: its names and body.
function _definedFunction(name, arity) {
  if (isKnownFunction(name)) return null;
  const bound = _localLookup(name) ?? varRecall(name);
  if (!isProgram(bound)) return null;
  const [arrow, ...rest] = bound.tokens;
  const names = rest.slice(0, -1);
  const body = rest[rest.length - 1];
  const shaped = isName(arrow) && (arrow.id === '→' || arrow.id === '->') && isSymbolic(body) && typeof body.expr === 'object'
    && names.length === arity && names.every((n) => isName(n) && !n.quoted);
  return shaped ? { names: names.map((n) => n.id), expr: body.expr } : null;
}


// F(A+1) becomes F's body with A+1 in place of its argument, as EVAL does on
// the HP 50g.  A call back into a function being expanded is left for the
// numeric call below, so a recursive definition doesn't unfold forever.
export function _expandUserCalls(ast, open = new Set()) {
  switch (ast.kind) {
    case 'neg': return AstNeg(_expandUserCalls(ast.arg, open));
    case 'bin': return AstBin(ast.op, _expandUserCalls(ast.l, open), _expandUserCalls(ast.r, open));
    case 'fn': {
      const args = ast.args.map((a) => _expandUserCalls(a, open));
      if (open.has(ast.name)) return AstFn(ast.name, args);
      const fn = _definedFunction(ast.name, args.length);
      if (fn) {
        const body = _substitute(fn.expr, new Map(fn.names.map((name, k) => [name, args[k]])));
        return _expandUserCalls(body, new Set([...open, ast.name]));
      }
      if (args.every((a) => a.kind === 'num')) return AstFn(ast.name, args);
      let result = null;
      try { result = _callUserProgram(ast.name, args.map(_astToRplValue)); }
      catch (e) { if (!(e instanceof RPLError) || /recursion/.test(e.message)) throw e; }
      return result ?? AstFn(ast.name, args);
    }
    default: return ast;
  }
}

let _userCallDepth = 0;

// A program stored in a variable and called in an algebraic, F(3), runs on its
// own stack with the arguments on it and must leave one result.
function _callUserProgram(name, values) {
  if (isKnownFunction(name)) return null;
  const program = _localLookup(name) ?? varRecall(name);
  if (!isProgram(program)) return null;
  if (_userCallDepth >= MAX_USER_CALL_DEPTH) throw new RPLError('EVAL recursion too deep');
  const s = new Stack();
  for (const v of values) s.push(v);
  _userCallDepth++;
  try {
    _driveGen(_evalValueGen(s, program, 1), `${name}()`);
  } finally {
    _userCallDepth--;
  }
  if (s.depth !== 1) throw new RPLError(`${name} must leave one result`);
  const result = s.pop();
  if (isInteger(result)) return AstNum(result.value);
  if (isReal(result)) return AstNum(result.value.toNumber(), true);
  if (isName(result)) return AstVar(result.id);
  return isSymbolic(result) && typeof result.expr === 'object' ? result.expr : null;
}

// The AUR's name(index): a list or vector variable called like a user function gives the element at n, a matrix the one at
// n,m. A variable of another kind, or an index that is not a whole number, leaves the call as it is.
function _indexedTarget(name) {
  if (isKnownFunction(name)) return null;
  const bound = _localLookup(name) ?? varRecall(name);
  const arity = isList(bound) || isVector(bound) ? 1 : isMatrix(bound) ? 2 : 0;
  return arity ? { bound, arity } : null;
}

const _indexObject = (indexes) => (indexes.length === 1 ? Integer(BigInt(indexes[0])) : RList(indexes.map((i) => Integer(BigInt(i)))));

function _indexedElement(name, indexes) {
  const target = _indexedTarget(name);
  if (!target || indexes.length !== target.arity || !indexes.every(Number.isSafeInteger)) return undefined;
  const s = new Stack();
  s.push(target.bound);
  s.push(_indexObject(indexes));
  lookup('GET').fn(s);
  return s.pop();
}

// Inside a larger algebraic the element has to be a number to fold, as F(3) does.
function _indexedNumber(name, indexes) {
  const element = _indexedElement(name, indexes);
  return isReal(element) || isInteger(element) || isRational(element) ? _toAst(element) : null;
}

// 'A(3)' on its own gives the element whatever it is, a string or a list as well as a number.
function _indexedValue(ast, evalNode) {
  if (ast.kind !== 'fn' || !_indexedTarget(ast.name)) return undefined;
  const indexes = ast.args.map((a) => evalNode(_expandUserCalls(a)));
  return indexes.every((n) => n.kind === 'num') ? _indexedElement(ast.name, indexes.map((n) => Number(n.value))) : undefined;
}

// obj 'A(3)' STO and obj 'M(2,3)' STO replace an element, as PUT does. False when the name holds no such array.
export function _storeIndexed(symbolic, value) {
  const call = symbolic.expr;
  if (call?.kind !== 'fn' || !_indexedTarget(call.name)) return false;
  const indexes = call.args.map((a) => {
    const n = _evalSymbolic(Symbolic(a), undefined, false);
    if (isInteger(n)) return Number(n.value);
    if (isReal(n)) return n.value.toNumber();
    throw new RPLError('Bad argument type');
  });
  if (_indexedElement(call.name, indexes) === undefined) return false;
  const s = new Stack();
  s.push(Name(call.name));
  s.push(_indexObject(indexes));
  s.push(value);
  lookup('PUT').fn(s);
  return true;
}

const _numberValue = (x, real) => (!real && Number.isSafeInteger(x) ? Integer(BigInt(x)) : Real(x));


// EXACT mode keeps a numeric fold only when every argument and the result are
// integers a double holds exactly: SQRT(9) folds to 3, SQRT(2) stays symbolic.
function _approxGate(result, args) {
  if (getApproxMode()) return result;
  if (result === null || result === undefined) return result;
  if (!Number.isFinite(result)) return result;
  const allIntArgs = args.every(a => Number.isSafeInteger(Math.round(a)) && Math.abs(a - Math.round(a)) < 1e-12);
  if (!allIntArgs || Math.abs(result) > Number.MAX_SAFE_INTEGER) return null;
  const rounded = Math.round(result);
  if (Math.abs(result - rounded) < 1e-12) return rounded;
  return null;
}

const _fallingFactorial = (n, m) => {
  let out = 1n;
  for (let i = 0n; i < m; i++) out *= n - i;
  return out;
};

// A double loses digits past 2^53, so these integer functions are worked out in BigInt.
function _exactIntegerFn(name, args) {
  if (!args.every(Number.isSafeInteger)) return null;
  const [a, b] = args.map(BigInt);
  const inRange = (n) => n >= 0n && n <= EXACT_POWER_MAX;
  switch (name) {
    case 'FACT': return args.length === 1 && inRange(a) ? _fallingFactorial(a, a) : null;
    case 'PERM': return args.length === 2 && inRange(a) && b >= 0n && b <= a ? _fallingFactorial(a, b) : null;
    case 'COMB': return args.length === 2 && inRange(a) && b >= 0n && b <= a ? _fallingFactorial(a, b) / _fallingFactorial(b, b) : null;
    case 'ALOG': return args.length === 1 && inRange(a) ? 10n ** a : null;
    default: return null;
  }
}

// A command named in an algebraic, NDIST(0,1,0) or TRNC(1.27,1), runs on a stack of its own when nothing above folds
// it. One the algebra doesn't know as a function runs in scratch state, so a command such as SF changes nothing.
function _commandCall(name, args, real) {
  const op = lookup(name);
  if (!op) return null;
  const run = () => {
    const s = new Stack();
    args.forEach((a) => s.push(_numberValue(a, real)));
    try {
      op.fn(s);
    } catch (e) {
      if (e instanceof RPLError || e instanceof RPLAbort) return null;
      throw e;
    }
    const v = s.depth === 1 ? s.pop() : null;
    if (isReal(v)) return v.value.toNumber();
    return isInteger(v) && v.value <= BigInt(Number.MAX_SAFE_INTEGER) && v.value >= -BigInt(Number.MAX_SAFE_INTEGER) ? Number(v.value) : null;
  };
  return isKnownFunction(name) ? run() : withScratchState(run);
}

function _angleAwareFnEval(name, args, real = false) {
  const x = args[0];
  const exact = real ? null : _exactIntegerFn(String(name).toUpperCase(), args);
  if (exact !== null) return AstNum(exact);
  let result;
  switch (args.length === 1 ? String(name).toUpperCase() : '') {
    case 'SIN':  result = angleTrig('sin', x); break;
    case 'COS':  result = angleTrig('cos', x); break;
    case 'TAN':  result = angleTrig('tan', x); break;
    case 'ASIN': result = fromRadians(Math.asin(x)); break;
    case 'ACOS': result = fromRadians(Math.acos(x)); break;
    case 'ATAN': result = fromRadians(Math.atan(x)); break;
    default: {
      const element = _indexedNumber(name, args);
      if (element) return element;
      const call = _callUserProgram(name, args.map((a) => _numberValue(a, real)));
      if (call) return call;
      result = algebraDefaultFnEval(name, args) ?? _commandCall(name, args, real);
    }
  }
  if (real) return result;
  if (!getApproxMode() && args.length === 1 && Number.isSafeInteger(x) && !_integerPoint(String(name).toUpperCase(), BigInt(x), 1n)) return null;
  return _approxGate(result, args);
}


const _isExactZero = (x) => isInteger(x) && x.value === 0n;

const _isExactArray = (entries) => !getApproxMode() && entries.every((x) => isInteger(x) || isRational(x));

// Exact matrices keep their fractions and complex ones their complex entries, which the float reduction refuses.
export const _reducesByScalars = (entries) => _isExactArray(entries) || entries.some(isComplex);

const _toPair = (x) => (isComplex(x) ? [x.re, x.im] : [_numVal(x), 0]);
const _pairSize = ([re, im]) => Math.hypot(re, im);
const _pairDiv = ([a, b], [c, d]) => { const n = c * c + d * d; return [(a * c + b * d) / n, (b * c - a * d) / n]; };
const _pairSubMul = ([a, b], [f, g], [c, d]) => [a - (f * c - g * d), b - (f * d + g * c)];

// Complex entries reduce in doubles and round once at the end, pinning pivots and cleared entries as the real RREF does.
function _rrefComplex(rows, cols) {
  const a = rows.map((row) => row.map(_toPair));
  let r = 0;
  for (let c = 0; c < cols && r < a.length; c++) {
    let p = r;
    for (let i = r + 1; i < a.length; i++) if (_pairSize(a[i][c]) > _pairSize(a[p][c])) p = i;
    if (_pairSize(a[p][c]) < 1e-12) continue;
    [a[r], a[p]] = [a[p], a[r]];
    const piv = a[r][c];
    a[r] = a[r].map((x) => _pairDiv(x, piv));
    a[r][c] = [1, 0];
    for (let i = 0; i < a.length; i++) {
      if (i === r) continue;
      const f = a[i][c];
      a[i] = a[i].map((x, j) => _pairSubMul(x, f, a[r][j]));
      a[i][c] = [0, 0];
    }
    r++;
  }
  return { rows: a.map((row) => row.map(([re, im]) => Complex(re + 0, im + 0))), rank: r };
}

// Gauss-Jordan over the first `cols` columns. Exact entries pivot on the first nonzero and stay exact, as on the HP.
export function _rrefScalar(rows, cols = rows[0]?.length ?? 0) {
  if (rows.flat().some(isComplex)) return _rrefComplex(rows, cols);
  const a = rows.map((row) => [...row]);
  let r = 0;
  for (let c = 0; c < cols && r < a.length; c++) {
    const p = a.findIndex((row, i) => i >= r && !_isExactZero(row[c]));
    if (p < 0) continue;
    [a[r], a[p]] = [a[p], a[r]];
    const piv = a[r][c];
    a[r] = a[r].map((x) => _scalarBinary('/', x, piv));
    for (let i = 0; i < a.length; i++) {
      const f = a[i][c];
      if (i !== r && !_isExactZero(f)) a[i] = a[i].map((x, j) => _scalarBinary('-', x, _scalarBinary('*', f, a[r][j])));
    }
    r++;
  }
  return { rows: a, rank: r };
}

export function _invMatrixScalar(rows) {
  const n = rows.length;
  const { rows: reduced, rank } = _rrefScalar(rows.map((row, i) => [...row, ...rows.map((_, j) => Integer(i === j ? 1n : 0n))]), n);
  if (rank < n) throw new RPLError('Infinite result');
  return reduced.map((row) => row.slice(n));
}


function _wholeNumber(v, min) {
  let n;
  if (isInteger(v) || isBinaryInteger(v)) {
    n = Number(v.value);
    if (!Number.isFinite(n)) throw new RPLError('Bad argument value');
  } else if (isReal(v)) {
    if (!v.value.isInteger()) throw new RPLError('Bad argument value');
    n = v.value.toNumber();
  } else {
    throw new RPLError('Bad argument type');
  }
  if (n < min) throw new RPLError('Bad argument value');
  return n;
}


export function _toIntIdx(v) {
  return _wholeNumber(v, 1);
}


export function _toCountN(v) {
  return _wholeNumber(v, 0);
}


export const _toListOp = (s) => {
  const nVal = s.pop();
  const n = _toCountN(nVal);
  if (n === 0) { s.push(RList([])); return; }
  const items = s.popN(n);
  s.push(RList(items));
};


export const _fromListOp = (s) => {
  const [l] = s.popN(1);
  if (!isList(l)) throw new RPLError('Bad argument type');
  for (const item of l.items) s.push(item);
  s.push(Integer(BigInt(l.items.length)));
};


// HP50 TYPE codes.  Vectors and matrices share the array codes 3 / 4, and the
// arbitrary-precision Integer reports ZINT (28).  A fraction is the algebraic 3/4 on the HP, so it reports 9.
export function _hp50TypeCode(v) {
  if (isReal(v))          return 0;
  if (isComplex(v))       return 1;
  if (isString(v))        return 2;
  if (isVector(v)) {
    return v.items.some(isComplex) ? 4 : 3;
  }
  if (isMatrix(v)) {
    for (const row of v.rows) {
      for (const x of row) if (isComplex(x)) return 4;
    }
    return 3;
  }
  if (isList(v))          return 5;
  if (isName(v))          return v.local ? 7 : 6;
  if (isProgram(v))       return 8;
  if (isSymbolic(v) || isRational(v)) return 9;
  if (isBinaryInteger(v)) return 10;
  if (isGrob(v))          return 11;
  if (isTagged(v))        return 12;
  if (isUnit(v))          return 13;
  if (isDirectory(v))     return 15;
  if (isInteger(v))       return 28;
  return -1;
}


// A bare count gives a vector; a { n } or { m n } size list gives a vector or matrix.
function _toDimSpec(v) {
  if (isInteger(v) || isReal(v) || isBinaryInteger(v)) {
    return [_toIntIdx(v)];
  }
  if (isList(v)) {
    if (v.items.length < 1 || v.items.length > 2) {
      throw new RPLError('Bad argument value');
    }
    return v.items.map(_toIntIdx);
  }
  throw new RPLError('Bad argument type');
}


export const _toArrayOp = (s) => {
  const dimVal = s.pop();
  const dims = _toDimSpec(dimVal);
  if (dims.length === 1) {
    const n = dims[0];
    if (n === 0) { s.push(Vector([])); return; }
    const items = s.popN(n);
    s.push(Vector(items));
    return;
  }
  const [m, n] = dims;
  const total = m * n;
  const items = s.popN(total);
  const rows = [];
  for (let r = 0; r < m; r++) {
    rows.push(items.slice(r * n, r * n + n));
  }
  s.push(Matrix(rows));
};


export const _fromArrayOp = (s) => {
  const [v] = s.popN(1);
  if (isVector(v)) {
    for (const item of v.items) s.push(item);
    s.push(RList([Real(v.items.length)]));
    return;
  }
  if (isMatrix(v)) {
    const rows = v.rows.length;
    const cols = rows > 0 ? v.rows[0].length : 0;
    for (const row of v.rows) for (const x of row) s.push(x);
    s.push(RList([Real(rows), Real(cols)]));
    return;
  }
  throw new RPLError('Bad argument type');
};


export const _toStrOp = (s) => {
  const [v] = s.popN(1);
  // The AUR: numbers come out in the display format (flags -49, -50, and -51's fraction mark), and a string comes back as it is.
  s.push(isString(v) ? v : Str(withFractionMark(formatSource(v, currentDisplay()))));
};


export const _fromStrOp = (s) => {
  const [v] = s.popN(1);
  if (!isString(v)) throw new RPLError('Bad argument type');
  const parsed = _parseEntryForObjTo(fromTyped(v.value));
  if (isProgramLine(parsed)) { runProgramLine(s, parsed); return; }
  for (const item of parsed) {
    if (!isName(item) || item.quoted) { s.push(item); continue; }
    const op = lookup(item.id);
    if (!op) s.push(item);
    const run = op ?? lookup('EVAL');
    _dispatchOp(run, s, run.name);
  }
};


// In CYLIN or SPHERE mode →V2, →V3 and V→ take and give a vector's polar parts, as the AUR says.
const _polarMode = () => _calcState.coordMode !== 'RECT';
const _allReal = (vs) => vs.every((v) => isReal(v) || isInteger(v));

export const _toV2Op = (s) => {
  const [x, y] = s.popN(2);
  s.push(_polarMode() && _allReal([x, y]) ? polarVector(_coerceRealComponent(x), _coerceRealComponent(y)) : Vector([x, y]));
};


export const _toV3Op = (s) => {
  const parts = s.popN(3);
  if (!_polarMode() || !_allReal(parts)) { s.push(Vector(parts)); return; }
  const [r, theta, third] = parts.map(_coerceRealComponent);
  s.push(polarVector(r, theta, third, _calcState.coordMode === 'SPHERE'));
};


export const _fromVecOp = (s) => {
  const [v] = s.popN(1);
  if (isComplex(v)) {
    for (const part of _polarMode() ? _polarParts([v.re, v.im]) : [v.re, v.im]) s.push(Real(part));
    return;
  }
  if (!isVector(v)) throw new RPLError('Bad argument type');
  const n = v.items.length;
  if (_polarMode() && (n === 2 || n === 3) && _allReal(v.items)) {
    for (const part of _polarParts(v.items.map(_coerceRealComponent))) s.push(Real(part));
    return;
  }
  for (const item of v.items) s.push(item);
};


function _polarParts([x, y, z]) {
  const theta = fromRadians(Math.atan2(y, x));
  if (z === undefined) return [Math.hypot(x, y), theta];
  if (_calcState.coordMode === 'CYLIN') return [Math.hypot(x, y), theta, z];
  const rho = Math.hypot(x, y, z);
  return [rho, theta, rho === 0 ? 0 : fromRadians(Math.acos(z / rho))];
}


function _coerceRealComponent(v) {
  if (isReal(v)) return v.value.toNumber();
  if (isInteger(v)) return Number(v.value);
  throw new RPLError('Bad argument type');
}


export function _rToCOp(s) {
  const im = s.pop();
  const re = s.pop();
  if (isVector(re) && isVector(im)) {
    const a = re.items, b = im.items;
    if (a.length !== b.length) throw new RPLError('Invalid dimension');
    const out = [];
    for (let i = 0; i < a.length; i++) {
      out.push(Complex(_coerceRealComponent(a[i]), _coerceRealComponent(b[i])));
    }
    s.push(Vector(out));
    return;
  }
  s.push(Complex(_coerceRealComponent(re), _coerceRealComponent(im)));
}


export function _cToROp(s) {
  const v = s.pop();
  if (isComplex(v)) {
    s.push(Real(v.re));
    s.push(Real(v.im));
    return;
  }
  if (isReal(v) || isInteger(v)) {
    s.push(Real(_coerceRealComponent(v)));
    s.push(Real(0));
    return;
  }
  if (isVector(v)) {
    const re = [], im = [];
    for (const e of v.items) {
      if (isComplex(e))       { re.push(Real(e.re));                    im.push(Real(e.im)); }
      else if (isReal(e))     { re.push(e);                             im.push(Real(0));     }
      else if (isInteger(e))  { re.push(Real(Number(e.value)));         im.push(Real(0));     }
      else throw new RPLError('Bad argument type');
    }
    s.push(Vector(re));
    s.push(Vector(im));
    return;
  }
  throw new RPLError('Bad argument type');
}


// The run* generators below are the list combinators and IFT / IFTE as evalRange
// runs them inline; the registered ops drive the same generators via _driveGen.
function* _mapOneValueGen(s, prog, e, depth) {
  const before = s.depth;
  s.push(e);
  yield* _evalValueGen(s, prog, depth + 1);
  const delta = s.depth - before;
  if (delta !== 1) {
    throw new RPLError('MAP: bad program');
  }
  return s.pop();
}


// A list inside the list is mapped item by item, as the AUR's MAP says.
function* _mapListGen(s, prog, list, depth) {
  const out = [];
  for (const e of list.items) out.push(isList(e) ? yield* _mapListGen(s, prog, e, depth) : yield* _mapOneValueGen(s, prog, e, depth));
  return RList(out);
}


export function* runMap(s, depth) {
  s.need(2);
  const prog = s.pop();
  const obj  = s.pop();
  _combinatorProgCheck(prog);
  if (isList(obj)) {
    s.push(yield* _mapListGen(s, prog, obj, depth));
    return;
  }
  if (isVector(obj)) {
    const out = [];
    for (const e of obj.items) out.push(yield* _mapOneValueGen(s, prog, e, depth));
    s.push(Vector(out));
    return;
  }
  if (isMatrix(obj)) {
    const rows = [];
    for (const row of obj.rows) {
      const newRow = [];
      for (const e of row) newRow.push(yield* _mapOneValueGen(s, prog, e, depth));
      rows.push(newRow);
    }
    s.push(Matrix(rows));
    return;
  }
  throw new RPLError('Bad argument type');
}



function _combinatorProgCheck(prog) {
  if (!isProgram(prog) && !isName(prog) && !isSymbolic(prog)) {
    throw new RPLError('Bad argument type');
  }
}


function _toIntCount(v) {
  if (isInteger(v)) return Number(v.value);
  if (isReal(v) && v.value.isFinite() && v.value.isInteger()) {
    return v.value.toNumber();
  }
  throw new RPLError('Bad argument type');
}


export function* runSeq(s, depth) {
  s.need(5);
  const step  = s.pop();
  const end   = s.pop();
  const start = s.pop();
  const name  = s.pop();
  const expr  = s.pop();
  if (!isName(name)) throw new RPLError('Bad argument type');
  _combinatorProgCheck(expr);
  const a = toRealOrThrow(start);
  const b = toRealOrThrow(end);
  const st = toRealOrThrow(step);
  if (st === 0) throw new RPLError('Bad argument value');
  const frame = new Map([[name.id, null]]);
  const out = [];
  let iterations = 0;
  _localFrames.push(frame);
  try {
    let i = a;
    while ((st > 0 && i <= b) || (st < 0 && i >= b)) {
      if (++iterations > MAX_LOOP_ITERATIONS) throw new RPLError('Loop iteration limit');
      frame.set(name.id, Real(i));
      const baseDepth = s.depth;
      yield* _evalValueGen(s, expr, depth + 1);
      const delta = s.depth - baseDepth;
      if (delta !== 1) throw new RPLError('SEQ: bad program');
      out.push(s.pop());
      i += st;
    }
  } finally {
    _localFrames.splice(_localFrames.lastIndexOf(frame), 1);
  }
  s.push(RList(out));
}


export function* runDoList(s, depth) {
  s.need(2);
  const prog = s.pop();
  _combinatorProgCheck(prog);
  let n = 1;                             // `list prog DOLIST` takes no count
  if (!isList(s.peek())) {
    n = _toIntCount(s.pop());
    if (n < 1) throw new RPLError('Bad argument value');
  }
  const lists = s.popN(n);
  for (const L of lists) if (!isList(L)) throw new RPLError('Bad argument type');
  const minLen = lists.reduce((m, L) => Math.min(m, L.items.length), Infinity);
  const len = Number.isFinite(minLen) ? minLen : 0;
  const out = [];
  for (let i = 0; i < len; i++) {
    const baseDepth = s.depth;
    for (const L of lists) s.push(L.items[i]);
    yield* _evalValueGen(s, prog, depth + 1);
    const delta = s.depth - baseDepth;
    if (delta !== 1) throw new RPLError('DOLIST: bad program');
    out.push(s.pop());
  }
  s.push(RList(out));
}


// NSUB / ENDSUB read the innermost DOSUBS frame.
export const _DOSUBS_STACK = [];

export function dosubsStackDepth() { return _DOSUBS_STACK.length; }


export function* runDoSubs(s, depth) {
  s.need(3);
  const prog = s.pop();
  _combinatorProgCheck(prog);
  const nVal = s.pop();
  const n = _toIntCount(nVal);
  const list = s.pop();
  if (!isList(list)) throw new RPLError('Bad argument type');
  if (n < 0) throw new RPLError('Bad argument value');
  const items = list.items;
  if (n === 0 || n > items.length) { s.push(RList([])); return; }
  const totalWindows = items.length - n + 1;
  const frame = { index: 1, total: totalWindows };
  _DOSUBS_STACK.push(frame);
  const out = [];
  try {
    for (let i = 0; i + n <= items.length; i++) {
      frame.index = i + 1;
      const baseDepth = s.depth;
      for (let k = 0; k < n; k++) s.push(items[i + k]);
      yield* _evalValueGen(s, prog, depth + 1);
      const delta = s.depth - baseDepth;
      if (delta !== 1) throw new RPLError('DOSUBS: bad program');
      out.push(s.pop());
    }
  } finally {
    _DOSUBS_STACK.pop();
  }
  s.push(RList(out));
}


export function* runStream(s, depth) {
  s.need(2);
  const prog = s.pop();
  _combinatorProgCheck(prog);
  const list = s.pop();
  if (!isList(list)) throw new RPLError('Bad argument type');
  const items = list.items;
  if (items.length === 0) throw new RPLError('Invalid dimension');
  if (items.length === 1) { s.push(items[0]); return; }
  s.push(items[0]);
  for (let i = 1; i < items.length; i++) {
    const baseDepth = s.depth - 1;       // the accumulator is already on the stack
    s.push(items[i]);
    yield* _evalValueGen(s, prog, depth + 1);
    const delta = s.depth - baseDepth;
    if (delta !== 1) throw new RPLError('STREAM: bad program');
  }
}


export function _indexAsInt(v) {
  if (isInteger(v)) return Number(v.value);
  if (isReal(v) && v.value.isInteger()) return v.value.toNumber();
  throw new RPLError('Bad argument type');
}


// AUR: →ROW and →COL take a vector apart into its elements and a count, and ROW→ and COL→ put numbers and a count back into one.
function _vectorDecompose(s, v) {
  for (const item of v.items) s.push(item);
  s.push(Real(v.items.length));
}

function _composeElements(s, items) {
  if (items.some(isVector)) return false;
  if (!items.every(_isScalarOperand)) throw new RPLError('Bad argument type');
  s.push(Vector(items));
  return true;
}

export const _rowDecompose = (s) => {
  const [M] = s.popN(1);
  if (isVector(M)) return _vectorDecompose(s, M);
  if (!isMatrix(M)) throw new RPLError('Bad argument type');
  for (const row of M.rows) s.push(Vector(row.slice()));
  s.push(Real(M.rows.length));
};


export const _rowCompose = (s) => {
  const [countVal] = s.popN(1);
  const m = _indexAsInt(countVal);
  if (m < 1) throw new RPLError('Bad argument value');
  const vecs = s.popN(m);
  if (_composeElements(s, vecs)) return;
  for (const v of vecs) {
    if (!isVector(v)) throw new RPLError('Bad argument type');
  }
  const cols = vecs[0].items.length;
  for (const v of vecs) {
    if (v.items.length !== cols) throw new RPLError('Invalid dimension');
  }
  const rows = vecs.map(v => v.items.slice());
  s.push(Matrix(rows));
};


export const _colDecompose = (s) => {
  const [M] = s.popN(1);
  if (isVector(M)) return _vectorDecompose(s, M);
  if (!isMatrix(M)) throw new RPLError('Bad argument type');
  const m = M.rows.length;
  const cols = m > 0 ? M.rows[0].length : 0;
  for (let j = 0; j < cols; j++) {
    const col = new Array(m);
    for (let i = 0; i < m; i++) col[i] = M.rows[i][j];
    s.push(Vector(col));
  }
  s.push(Real(cols));
};


export const _colCompose = (s) => {
  const [countVal] = s.popN(1);
  const n = _indexAsInt(countVal);
  if (n < 1) throw new RPLError('Bad argument value');
  const vecs = s.popN(n);
  if (_composeElements(s, vecs)) return;
  for (const v of vecs) {
    if (!isVector(v)) throw new RPLError('Bad argument type');
  }
  const rows = vecs[0].items.length;
  for (const v of vecs) {
    if (v.items.length !== rows) throw new RPLError('Invalid dimension');
  }
  const out = [];
  for (let i = 0; i < rows; i++) {
    const row = new Array(n);
    for (let j = 0; j < n; j++) row[j] = vecs[j].items[i];
    out.push(row);
  }
  s.push(Matrix(out));
};


export function _cToPOp(s) {
  const v = s.pop();
  let re, im;
  if (isComplex(v))       { re = v.re;                im = v.im; }
  else if (isReal(v))     { re = v.value.toNumber();  im = 0;    }
  else if (isInteger(v))  { re = Number(v.value);     im = 0;    }
  else throw new RPLError('Bad argument type');
  const r = Math.hypot(re, im);
  const th = Math.atan2(im, re);
  s.push(Complex(r, fromRadians(th)));
}


export function _pToCOp(s) {
  const v = s.pop();
  let r, thUser;
  if (isComplex(v))       { r = v.re;                thUser = v.im; }
  else if (isReal(v))     { r = v.value.toNumber();  thUser = 0;    }
  else if (isInteger(v))  { r = Number(v.value);     thUser = 0;    }
  else throw new RPLError('Bad argument type');
  const th = toRadians(thUser);
  s.push(Complex(r * Math.cos(th), r * Math.sin(th)));
}


// Descending-degree coefficients (Numbers or BigInts) → an expanded polynomial in X, with signs folded
// into the operators (2*X^3-X rather than 2*X^3+-1*X); a denominator above 1 divides the whole polynomial.
export function _coefArrToSymbolicX(coefs, den = 1n) {
  const X = AstVar('X');
  const deg = coefs.length - 1;
  let ast = null;
  for (let i = 0; i < coefs.length; i++) {
    const c = coefs[i];
    if (c === 0 || c === 0n) continue;
    const pow = deg - i;
    const ac = c < 0 ? -c : c;
    let factor;
    if (pow === 0) {
      factor = AstNum(ac);
    } else {
      const Xpow = (pow === 1) ? X : AstBin('^', X, AstNum(pow));
      factor = (ac === 1 || ac === 1n) ? Xpow : AstBin('*', AstNum(ac), Xpow);
    }
    if (ast === null) {
      ast = c < 0 ? AstNeg(factor) : factor;
    } else {
      ast = AstBin(c < 0 ? '-' : '+', ast, factor);
    }
  }
  if (ast === null) ast = AstNum(0);
  return Symbolic(den === 1n ? ast : AstBin('/', ast, AstNum(den)));
}


export function _nFromIntegerArg(v) {
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
  if (n < 0 || !Number.isSafeInteger(n)) throw new RPLError('Bad argument value');
  return n;
}


export function _scalarToGiacStr(v) {
  if (isInteger(v))  return v.value.toString();
  if (isReal(v))     return v.value.toString();
  if (isRational(v)) return `(${v.n.toString()}/${v.d.toString()})`;
  if (isComplex(v))  return `(${v.re}+(${v.im})*i)`;
  if (isSymbolic(v)) return `(${astToGiac(v.expr)})`;
  if (isName(v))     return v.id;
  throw new RPLError('Bad argument type');
}


export function _matrixToGiacStr(m) {
  const rows = m.rows.map((row) => {
    const elts = row.map(_scalarToGiacStr);
    return `[${elts.join(',')}]`;
  });
  return `[${rows.join(',')}]`;
}


export function _arrayToGiacStr(v) {
  return isVector(v) ? `[${v.items.map(_scalarToGiacStr).join(',')}]` : _matrixToGiacStr(v);
}

// Giac's answer for an array with symbolic entries, as a vector or matrix; singular is Infinite result, as numerically.
export function _casArray(cmd) {
  requireCas();
  const raw = casRun(cmd);
  if (/not invertible/i.test(raw)) throw new RPLError('Infinite result');
  const items = splitGiacList(raw);
  if (!items) throw new RPLError('Bad argument value');
  const cell = (text) => _astToRplValue(giacToAst(text));
  const rows = items.map(splitGiacList);
  return rows.every(Boolean) ? Matrix(rows.map((row) => row.map(cell))) : Vector(items.map(cell));
}


export function _popSquareMatrix(s) {
  const m = s.pop();
  if (!isMatrix(m)) throw new RPLError('Bad argument type');
  const n = m.rows.length;
  const cols = n > 0 ? m.rows[0].length : 0;
  if (n === 0 || n !== cols) throw new RPLError('Invalid dimension');
  return { matrix: m, n };
}


// In APPROX mode, Integers, Rationals and closed numeric algebraics become Reals
// as they are pushed; values already on the stack are not touched.
setPushCoerce((v) => {
  if (!getApproxMode()) return v;
  if (v == null) return v;
  if (isInteger(v)) {
    return Real(new Decimal(v.value.toString()));
  }
  if (isRational(v)) {
    const n = new Decimal(v.n.toString());
    const d = new Decimal(v.d.toString());
    return Real(n.div(d));
  }
  if (isSymbolic(v)) {
    const vars = algebraFreeVars(v.expr);
    if (vars.size === 0) {
      let reduced = null;
      try {
        reduced = algebraEvalAst(v.expr, () => null, _angleAwareFnEval, null);
      } catch (e) {
        if (!(e instanceof RPLError)) throw e;
      }
      if (reduced && reduced.kind === 'num' && Number.isFinite(reduced.value)) {
        return Real(reduced.value);
      }
    }
  }
  return v;
});
