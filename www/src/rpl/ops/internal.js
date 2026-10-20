import Decimal from '../../../vendor/decimal.js/decimal.mjs';
import { isReal, isInteger, isComplex, Real, isSymbolic, isName, isRational, Name, Symbolic, Integer, Unit, isUnit, isBinaryInteger, isNumber, promoteNumericPair, Complex, Rational, isList, RList, isTagged, Tagged, isVector, Vector, isMatrix, Matrix, BinaryInteger, toRealOrThrow, toRealDecimal, isString, isValidHpIdentifier, isStorableHpName, isProgram, isDirectory, isGrob, Str, Program } from '../types.js';
import { RPLAbort, RPLError, Stack, setPushCoerce, checkTimeLimit } from '../stack.js';
import { Var as AstVar, Num as AstNum, Bin as AstBin, Fn as AstFn, UnitNode as AstUnit, evalAst as algebraEvalAst, defaultFnEval as algebraDefaultFnEval, Neg as AstNeg, freeVars as algebraFreeVars, hasUnits, exactRational, isRealNum, isKnownFunction } from '../algebra.js';
import { sameDims, convertValue, temperaturesAdd, uexprEqual, multiplyUexpr, divideUexpr, inverseUexpr, powerUexpr } from '../units.js';
import { state as _calcState, getApproxMode, getWordsizeMask, varRecall, getLastError, setLastError, restoreLastError, varStore, getRealMaxExp, enterDirectory, toRadians, fromRadians, angleTrig, setHalted, settleLcd, withScratchState } from '../state.js';
import { Fraction } from '../../../vendor/fraction.js/fraction.mjs';
import Complex$ from '../../../vendor/complex.js/complex.mjs';
import { formatSource, currentDisplay, withFractionMark } from '../formatter.js';
import { parseEntry as _parseEntryForObjTo, polarVector, fromTyped } from '../parser.js';
import { astToGiac, buildGiacCmd, giacToAst, splitGiacList } from '../cas/giac-convert.mjs';
import { giac } from '../cas/giac-engine.mjs';
import { lookup } from './registry.js';



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


// null for values the algebra AST cannot hold, such as Complex.
export function _toAst(v) {
  if (isSymbolic(v))   return v.expr;
  if (isName(v))       return AstVar(v.id);
  if (isInteger(v))    return AstNum(v.value);
  if (isReal(v))       return AstNum(v.value.toNumber(), true);
  if (isRational(v)) {
    return AstBin('/', AstNum(v.n), AstNum(v.d));
  }
  if (isUnit(v))       return AstUnit(v.value, v.uexpr);
  return null;
}


function _numToRpl(n, sign = 1) {
  if (n.digits) return Integer(BigInt(sign) * BigInt(n.digits));
  return isRealNum(n) ? Real(sign * n.value) : Integer(BigInt(sign * n.value));
}

export function _astToRplValue(ast) {
  if (!ast) return Name('', { quoted: true });
  if (ast.kind === 'num') return _numToRpl(ast);
  if (ast.kind === 'unit') return Unit(ast.value, ast.uexpr);
  if (ast.kind === 'var') return Name(ast.name, { quoted: true });
  // Giac returns negative literals as Neg(Num); land them as plain numbers.
  if (ast.kind === 'neg' && ast.arg && ast.arg.kind === 'num') return _numToRpl(ast.arg, -1);
  const fraction = exactRational(ast);
  if (fraction && fraction[1] !== 1n) return Rational(fraction[0], fraction[1]);
  return Symbolic(ast);
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
  if (ast.kind === 'neg') {
    return [_astToRplValue(ast.arg), Name('NEG', { quoted: true }), Integer(2n)];
  }
  if (ast.kind === 'bin') {
    return [
      _astToRplValue(ast.l),
      _astToRplValue(ast.r),
      Name(ast.op, { quoted: true }),
      Integer(3n),
    ];
  }
  if (ast.kind === 'fn') {
    const out = ast.args.map(_astToRplValue);
    out.push(Name(ast.name, { quoted: true }));
    out.push(Integer(BigInt(ast.args.length + 1)));
    return out;
  }
  return [v, Integer(1n)];
}


export function _numVal(v) {
  if (isReal(v))     return v.value.toNumber();
  if (isInteger(v))  return Number(v.value);
  if (isRational(v)) return Number(v.n) / Number(v.d);
  throw new RPLError('Bad argument type');
}


export function _makeUnit(value, uexpr) {
  if (!Number.isFinite(value)) throw new RPLError('Infinite result');
  return uexpr.length === 0 ? Real(value) : Unit(value, uexpr);
}

// The HP's error list: 0/0 is an Undefined result, any other x/0 an Infinite result.
const _divisionByZero = (dividendIsZero) => new RPLError(dividendIsZero ? 'Undefined result' : 'Infinite result');


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
    if (l && r) return Symbolic(AstBin(op, l, r));
    throw new RPLError('Bad argument type');
  }
  if (isUnit(a) || isUnit(b)) return _unitBinary(op, a, b);
  if (!isNumber(a) || !isNumber(b)) throw new RPLError('Bad argument type');
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


const _fraction = (v) => (isInteger(v) ? new Fraction(v.value, 1n) : new Fraction(v.n, v.d));

function _fractionValue(f) {
  return f.d === 1n ? Integer(f.s * f.n) : Rational(f.s * f.n, f.d);
}

// The integer k-th root of n ≥ 0 when n is a perfect k-th power, else null.
function _exactRoot(n, k) {
  if (n < 2n) return n;
  const bits = BigInt(n.toString(2).length);
  if (k >= bits) return null;
  let x = 1n << ((bits + k - 1n) / k);
  for (;;) {
    const next = ((k - 1n) * x + n / x ** (k - 1n)) / k;
    if (next >= x) break;
    x = next;
  }
  return x ** k === n ? x : null;
}

// f's exact k-th root, -2 for -8 and k = 3, or null.
function _fractionRoot(f, k) {
  if (f.s < 0n && k % 2n === 0n) return null;
  const rn = _exactRoot(f.n, k), rd = _exactRoot(f.d, k);
  return rn === null || rd === null ? null : new Fraction(f.s * rn, rd);
}

// n = a²·b, with the square factors that trial division up to 10^4 finds, and a square remainder, taken out.
function _squareFactor(n) {
  let a = 1n, b = 1n, m = n;
  for (let d = 2n; d * d <= m && d <= 10000n; d++) {
    let e = 0n;
    while (m % d === 0n) { m /= d; e++; }
    a *= d ** (e / 2n);
    b *= d ** (e % 2n);
  }
  const r = _exactRoot(m, 2n);
  return r === null ? { a, b: b * m } : { a: a * r, b };
}

// c·√b as the HP writes it: 2*√2, √2/2 or 2*√2/3.
function _radicalAst(c, b) {
  const root = AstFn('SQRT', [AstNum(b)]);
  const top = c.n === 1n ? root : AstBin('*', AstNum(c.n), root);
  return c.d === 1n ? top : AstBin('/', top, AstNum(c.d));
}

// x^e for a non-negative fraction x when the root is exact (4^(1/2) is 2) or a square root (8^(1/2) is 2*√2), else null.
function _exactPower(x, e) {
  if (x.s < 0n) return null;
  const p = e.s * e.n;
  const root = _fractionRoot(x, e.d);
  if (root) {
    if (root.n === 0n && p < 0n) throw _divisionByZero(false);
    return _fractionValue(root.pow(new Fraction(p, 1n)));
  }
  if (e.d !== 2n) return null;
  const { a, b } = _squareFactor(x.n * x.d);
  return Symbolic(_radicalAst(x.pow(new Fraction((p - 1n) / 2n, 1n)).mul(new Fraction(a, x.d)), b));
}

// The HP's exact √ of a non-negative integer or fraction: 2, 1/2, 2*√2 or √2/3.
export function exactSqrt(v) {
  return _exactPower(_fraction(v), new Fraction(1n, 2n));
}

// The k-th root of an integer or fraction when it is exact, -2 for -8 and k = 3, else null.
export function exactXroot(v, k) {
  const root = _fractionRoot(_fraction(v), k);
  return root && _fractionValue(root);
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
      if (fb.d === 1n) { r = fa.pow(fb); break; }
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


// A CAS command takes an array of expressions entry by entry, as EXPAND's AUR entry says: of argc arguments, the
// one `at` levels down may be an array, and the command runs on each entry with the others; entries that fail
// `only` pass through as they are. A vector whose entries all give equal-length vectors comes back a matrix,
// so DERIV of [ f g ] by [ X Y ] is the Jacobian.
export function _entryWise(handler, { argc = 1, at = null, only = null } = {}) {
  return (s) => {
    const n = typeof argc === 'function' ? argc(s) : argc;
    const level = at ?? n;
    const v = s.depth >= n ? s.peek(level) : null;
    if (!isVector(v) && !isMatrix(v)) { handler(s); return; }
    const args = s.popN(n);
    const k = n - level;
    const apply = (x) => {
      if (only && !only(x)) return x;
      const base = s.depth;
      args.forEach((a, i) => s.push(i === k ? x : a));
      handler(s);
      if (s.depth !== base + 1) throw new RPLError('Bad argument value');
      return s.pop();
    };
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
      return a ** b;
  }
  throw new RPLError('Unknown op ' + op);
}

// A negative integer exponent gives an exact fraction, or a Real in APPROX mode.
function _integerReciprocalPower(a, b) {
  if (a === 0n) throw new RPLError('Infinite result');
  if (getApproxMode()) return Real(Decimal.pow(new Decimal(a.toString()), new Decimal(b.toString())));
  const denominator = a ** -b;
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


export function _decimalFrobeniusNorm(items) {
  let sum = new Decimal(0);
  for (const x of items) {
    if (isComplex(x)) { sum = sum.plus(new Decimal(x.re).pow(2)).plus(new Decimal(x.im).pow(2)); continue; }
    const d = isReal(x) ? x.value
      : isInteger(x) ? new Decimal(x.value.toString())
      : isRational(x) ? new Decimal(x.n.toString()).div(x.d.toString())
      : null;
    if (!d) throw new RPLError('Bad argument type');
    sum = sum.plus(d.times(d));
  }
  return sum.sqrt();
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


export function _bigFactorial(n) {
  if (n < 0n) throw new RPLError('Bad argument value');
  let acc = 1n;
  for (let i = 2n; i <= n; i++) {
    checkTimeLimit();
    acc *= i;
  }
  return acc;
}

// Lanczos approximation (g = 7, n = 9), good to about 15 significant digits.
const _LANCZOS_G = 7;

const _LANCZOS_P = [
  0.99999999999980993,
  676.5203681218851,
  -1259.1392167224028,
  771.32342877765313,
  -176.61502916214059,
  12.507343278686905,
  -0.13857109526572012,
  9.9843695780195716e-6,
  1.5056327351493116e-7,
];

export function _gamma(x) {
  if (x < 0.5) {
    const s = Math.sin(Math.PI * x);
    if (s === 0) throw new RPLError('Infinite result');
    return Math.PI / (s * _gamma(1 - x));
  }
  x -= 1;
  let a = _LANCZOS_P[0];
  for (let i = 1; i < _LANCZOS_P.length; i++) a += _LANCZOS_P[i] / (x + i);
  const t = x + _LANCZOS_G + 0.5;
  return Math.sqrt(2 * Math.PI) * Math.pow(t, x + 0.5) * Math.exp(-t) * a;
}


// ln|Γ(x)|, computed directly so it stays finite where Γ(x) overflows a double.
export function _lngamma(x) {
  if (x < 0.5) {
    const sinPx = Math.sin(Math.PI * x);
    if (sinPx === 0) throw new RPLError('Infinite result');
    return Math.log(Math.PI) - Math.log(Math.abs(sinPx)) - _lngamma(1 - x);
  }
  const y = x - 1;
  let a = _LANCZOS_P[0];
  for (let i = 1; i < _LANCZOS_P.length; i++) a += _LANCZOS_P[i] / (y + i);
  const t = y + _LANCZOS_G + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (y + 0.5) * Math.log(t) - t + Math.log(a);
}


// Regularised upper incomplete gamma Q(a, x) for a > 0, x ≥ 0 (Numerical Recipes
// §6.2): the series for x < a + 1, Lentz's continued fraction otherwise.
export function _regGammaQ(a, x) {
  if (x === 0) return 1;
  if (x < a + 1) {
    let sum = 1 / a, term = 1 / a, n = 1;
    while (n < 1000) {
      term *= x / (a + n);
      sum += term;
      if (Math.abs(term) < Math.abs(sum) * 1e-16) break;
      n++;
    }
    const P = sum * Math.exp(-x + a * Math.log(x) - _lngamma(a));
    return 1 - P;
  }
  const TINY = 1e-300;
  let b = x + 1 - a;
  let c = 1 / TINY;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < 1000; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b; if (Math.abs(d) < TINY) d = TINY;
    c = b + an / c; if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < 1e-16) break;
  }
  return h * Math.exp(-x + a * Math.log(x) - _lngamma(a));
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


const MAX_EVAL_DEPTH = 256;

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


// Control-flow keywords are recognised by name while walking a Program; they are
// not registered ops.
const CF_OPENERS = new Set(['IF', 'IFERR', 'WHILE', 'DO', 'START', 'FOR', 'CASE']);

const CF_CLOSERS = new Set(['END', 'NEXT', 'STEP']);

const CF_INNERS  = new Set(['THEN', 'ELSE', 'REPEAT', 'UNTIL']);


function bareNameId(tok) {
  if (!isName(tok) || tok.quoted) return null;
  return tok.id.toUpperCase();
}


// A command line holding a program structure or → runs as one program, as on
// the HP50, instead of pushing FOR, NEXT and the rest as names.
export function isProgramLine(values) {
  return values.some((v) => {
    const id = bareNameId(v);
    return id !== null && (CF_OPENERS.has(id) || id === '→' || id === '->');
  });
}

export function runProgramLine(s, values) {
  runSuspendable(_evalValueGen(s, Program(values), 0, false));
}


// First index at nesting depth 0 holding the keyword `wanted` or a closer, as
// { idx, kind }; null if none.  A CASE holds one END per clause plus its own, so
// it is skipped whole.
function scanAtDepth0(toks, from, wanted) {
  let depth = 0;
  let i = from;
  while (i < toks.length) {
    const id = bareNameId(toks[i]);
    if (!id) { i++; continue; }
    if (id === 'CASE') {
      i = _pastCaseEnd(toks, i + 1);
      continue;
    }
    if (CF_OPENERS.has(id)) { depth++; i++; continue; }
    if (CF_CLOSERS.has(id)) {
      if (depth === 0) return { idx: i, kind: id };
      depth--;
      i++;
      continue;
    }
    if (depth === 0 && id === wanted) {
      return { idx: i, kind: id };
    }
    i++;
  }
  return null;
}


// Index just past the END closing a CASE whose remaining body starts at `from`.
// Each depth-0 THEN opens a clause that owes its own END.
function _pastCaseEnd(toks, from) {
  let pending = 1;
  let nest = 0;
  let i = from;
  while (i < toks.length) {
    const id = bareNameId(toks[i]);
    if (id) {
      if (id === 'CASE') {
        i = _pastCaseEnd(toks, i + 1);
        continue;
      }
      if (CF_OPENERS.has(id)) {
        nest++;
      } else if (CF_CLOSERS.has(id)) {
        if (nest > 0) nest--;
        else if (id === 'END') {
          pending--;
          if (pending === 0) return i + 1;
        }
      } else if (nest === 0 && id === 'THEN') {
        pending++;
      }
    }
    i++;
  }
  return toks.length;
}


const _localFrames = [];

// LOCAL's frames, oldest first; they stay in _localFrames after the run that made them, until UNBIND.
const _boundFrames = [];

export function bindLocals(pairs) {
  const frame = new Map(pairs);
  _localFrames.push(frame);
  _boundFrames.push(frame);
}

// Every variable LOCAL made, newest first, as [name, value].
export function unbindLocals() {
  const frames = _boundFrames.splice(0).filter((f) => _localFrames.includes(f));
  frames.forEach((f) => _localFrames.splice(_localFrames.lastIndexOf(f), 1));
  return frames.reverse().flatMap((f) => [...f].reverse());
}


function _localFrame(id) {
  for (let i = _localFrames.length - 1; i >= 0; i--) {
    if (_localFrames[i].has(id)) return _localFrames[i];
  }
  return undefined;
}

function _localLookup(id) {
  return _localFrame(id)?.get(id);
}

// STO, RCL and the other commands that take a variable's name reach a local
// variable first, as on the HP50.
export function recallVar(id) {
  const frame = _localFrame(id);
  return frame ? frame.get(id) : varRecall(id);
}

export function storeVar(id, value) {
  const frame = _localFrame(id);
  if (frame) frame.set(id, value);
  else varStore(id, value);
}

// fn runs with the name bound as a local variable, set through the function it is given, as a plot binds its variable.
export function withLocalVariable(name, fn) {
  const frame = new Map([[name, null]]);
  _localFrames.push(frame);
  try {
    return fn((value) => frame.set(name, value));
  } finally {
    _localFrames.splice(_localFrames.lastIndexOf(frame), 1);
  }
}


// Single-step debugger state.  With _singleStepMode set, evalRange yields after
// every token, except inside a named sub-program (_insideSubProgram) unless SST↓
// also set _stepInto.
let _singleStepMode = false;

let _stepInto = false;

let _insideSubProgram = false;


export function singleStepMode() { return _singleStepMode; }

export function stepIntoMode() { return _stepInto; }

export function localFramesDepth() { return _localFrames.length; }


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
  const values = s.popN(names.length);
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
      _markSuspend(toks, i + 1, 'halt');
      yield;
      i++;
      continue;
    }
    if (id === 'PROMPT' || id === 'MSGBOX') {
      if (s.depth < 1) throw new RPLError(`${id}: Too few arguments`);
      _markSuspend(toks, i + 1, id === 'PROMPT' ? 'prompt' : 'msgbox', null, s.pop());
      yield;
      i++;
      continue;
    }
    if (id === 'INPUT') {
      if (s.depth < 2) throw new RPLError('INPUT: Too few arguments');
      const input = inputSpec(s.peek());
      s.pop();
      _markSuspend(toks, i + 1, 'input', input, s.pop());
      yield;
      i++;
      continue;
    }
    if (id === 'CHOOSE') {
      if (s.depth < 3) throw new RPLError('CHOOSE: Too few arguments');
      const choose = chooseSpec(s.peek(2), s.peek());
      s.pop();
      s.pop();
      _markSuspend(toks, i + 1, 'choose', choose, s.pop());
      yield;
      i++;
      continue;
    }
    if (id === 'WAIT') {
      if (s.depth < 1) throw new RPLError('WAIT: Too few arguments');
      const wait = waitSpec(s.peek());
      s.pop();
      _markSuspend(toks, i + 1, 'wait', wait);
      yield;
      i++;
      continue;
    }
    if (id === 'KEY' && _keyCanPause()) {
      _markSuspend(toks, i + 1, 'wait', KEY_POLL);
      yield;
      i++;
      continue;
    }
    if (id === 'INFORM') {
      if (s.depth < 5) throw new RPLError('INFORM: Too few arguments');
      const inform = informSpec(s.peek(5), s.peek(4), s.peek(3), s.peek(2), s.peek());
      const title = s.peek(5);
      s.popN(5);
      _markSuspend(toks, i + 1, 'inform', inform, title);
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


// INPUT's level 1 is the text to offer on the command line, alone or in a list that may add the HP's cursor position
// and entry modes; of those only V, which asks that the answer parse, means anything here.
// INPUT's command-line list: its string, a cursor position (n counts characters from the left of the first row,
// { row col } names the row; 0 is the end of the row, and a negative number asks for the HP's replace cursor,
// which the line has not), and the names V (verify), α (alpha lock) and ALG, which has no entry mode to set here.
function inputSpec(v) {
  if (isString(v)) return { text: v.value, verify: false, cursor: null, alpha: false };
  if (!isList(v)) throw new RPLError('INPUT: Bad argument type');
  const text = v.items.find(isString)?.value ?? '';
  const pos = v.items.find((item) => isReal(item) || isInteger(item) || (isList(item) && item.items.length === 2));
  const named = (id) => v.items.some((item) => isName(item) && item.id === id);
  return { text, verify: named('V'), cursor: pos ? inputCursor(text, pos) : null, alpha: named('α') };
}

function inputCursor(text, pos) {
  const nums = isList(pos) ? pos.items : [Real(1), pos];
  if (!nums.every((n) => isReal(n) || isInteger(n))) throw new RPLError('INPUT: Bad argument type');
  const [row, col] = nums.map((n) => Math.abs(Math.trunc(Number(n.value))));
  const rows = text.split('\n');
  const r = Math.min(Math.max(row, 1), rows.length);
  const start = rows.slice(0, r - 1).reduce((n, line) => n + line.length + 1, 0);
  return start + (col === 0 ? rows[r - 1].length : Math.min(col - 1, rows[r - 1].length));
}


// CHOOSE's choices, each an object or { display result }, and the position of the one highlighted (0: none, and the
// box only shows the choices).
function chooseSpec(list, pos) {
  if (!isList(list) || !(isReal(pos) || isInteger(pos))) throw new RPLError('CHOOSE: Bad argument type');
  const n = Number(pos.value);
  if (!Number.isInteger(n) || n < 0 || n > list.items.length) throw new RPLError('CHOOSE: Bad argument value');
  return { items: list.items, pos: n };
}


// WAIT's argument: seconds to pause for (as many as a timer can take), 0 to wait for a key, or -1 to do so with
// the menu shown.
const WAIT_MAX_SECONDS = 2147483;

function waitSpec(v) {
  if (!(isReal(v) || isInteger(v))) throw new RPLError('WAIT: Bad argument type');
  const n = Number(v.value);
  if (n > 0) return { seconds: Math.min(n, WAIT_MAX_SECONDS) };
  if (n === 0 || n === -1) return { key: true, menu: n === -1 };
  throw new RPLError('WAIT: Bad argument value');
}


// INFORM's form: a title, fields that are a label or { "label" "help" types... } (an empty list a blank), the column
// count alone or in { columns tabs }, and the reset and initial values, which NOVAL stands in for.
function informSpec(title, fields, format, resets, init) {
  if (!isString(title) || !isList(fields) || !isList(resets) || !isList(init)) throw new RPLError('INFORM: Bad argument type');
  const columns = isList(format) ? format.items[0] : format;
  if (columns !== undefined && !(isReal(columns) || isInteger(columns))) throw new RPLError('INFORM: Bad argument type');
  const spec = fields.items.map((f) => {
    if (isString(f)) return { label: f.value, help: '', types: [] };
    if (!isList(f)) throw new RPLError('INFORM: Bad argument type');
    if (f.items.length === 0) return null;
    const [label, ...rest] = f.items;
    const help = isString(rest[0]) ? rest.shift().value : '';
    if (!isString(label) || !rest.every((t) => isReal(t) || isInteger(t))) throw new RPLError('INFORM: Bad argument type');
    return { label: label.value, help, types: rest.map((t) => Number(t.value)) };
  });
  return { title: title.value, fields: spec, columns: columns === undefined ? 1 : Math.max(1, Math.trunc(Number(columns.value))), resets: resets.items, init: init.items };
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

function _keyCanPause() {
  return !_singleStepMode && !_unpausable && Date.now() - _resumedAt >= KEY_SLICE_MS;
}

function _markSuspend(tokens, index, kind, dialog = null, prompt = null) {
  const stepping = _singleStepMode ? (_stepInto ? 'into' : 'over') : null;
  _pendingSuspend = { tokens, index, kind, dialog, stepping, prompt };
}

function* _stepYield(tokens, index) {
  if (!_singleStepMode || (_insideSubProgram && !_stepInto)) return;
  _markSuspend(tokens, index, 'step');
  yield;
}


// Runs a program generator until it yields or finishes.  A yield parks the live
// generator on the halted stack; any other exit unwinds leftover local frames.
// Either way an unfrozen DISP display goes, as the HP's does when the keyboard is ready, except at a WAIT, whose
// message the pause is for.
export function runSuspendable(gen) {
  const framesAtEntry = _localFrames.length;
  let halted = false;
  let waiting = false;
  _resumedAt = Date.now();
  try {
    if (!gen.next().done) {
      halted = true;
      const { tokens = null, index = null, kind = null, dialog = null, stepping = null, prompt = null } = _pendingSuspend ?? {};
      _pendingSuspend = null;
      waiting = kind === 'wait';
      setHalted({ generator: gen, tokens, index, kind, dialog, stepping, prompt });
    }
  } finally {
    if (!waiting) settleLcd();
    if (!halted) {
      _pendingSuspend = null;
      for (let i = _localFrames.length - 1; i >= framesAtEntry; i--) {
        if (!_boundFrames.includes(_localFrames[i])) _localFrames.splice(i, 1);
      }
    }
  }
}


function* evalToken(s, tok, depth) {
  if (isName(tok)) {
    if (tok.quoted) { s.push(tok); return; }
    const localVal = _localLookup(tok.id);
    if (localVal !== undefined) { s.push(localVal); return; }
    const op = lookup(tok.id);
    if (op) { _dispatchOp(op, s, tok.id); return; }
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
    yield* _evalValueGen(s, bound, depth, isSubProgram);
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


// A block whose closer is missing auto-closes at the end of the program, like
// the parser's unterminated « { [.  Returns the index just past the block.
function _pastBlock(toks, endIdx) {
  return Math.min(endIdx + 1, toks.length);
}


function _scanRequired(toks, from, keyword, message) {
  const scan = scanAtDepth0(toks, from, keyword);
  if (!scan || scan.kind !== keyword) throw new RPLError(message);
  return scan.idx;
}


function _scanEnd(toks, from, message) {
  const scan = scanAtDepth0(toks, from, null);
  if (!scan) return toks.length;
  if (scan.kind !== 'END') throw new RPLError(message);
  return scan.idx;
}


function _scanElseEnd(toks, thenIdx, label) {
  const branch = scanAtDepth0(toks, thenIdx + 1, 'ELSE');
  if (!branch) return { elseIdx: -1, endIdx: toks.length };
  if (branch.kind === 'END') return { elseIdx: -1, endIdx: branch.idx };
  if (branch.kind !== 'ELSE') throw new RPLError(`${label}/THEN: unexpected ${branch.kind}`);
  const end = scanAtDepth0(toks, branch.idx + 1, null);
  return { elseIdx: branch.idx, endIdx: end && end.kind === 'END' ? end.idx : toks.length };
}


function _scanCounterCloser(toks, from, label) {
  const scan = scanAtDepth0(toks, from, null);
  if (!scan) return { closer: 'NEXT', closerIdx: toks.length };
  if (scan.kind === 'END') throw new RPLError(`${label} without NEXT/STEP`);
  return { closer: scan.kind, closerIdx: scan.idx };
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
    const test = s.pop();
    const innerEnd = scanAtDepth0(toks, thenIdx + 1, null);
    const innerEndIdx = (innerEnd && innerEnd.kind === 'END') ? innerEnd.idx : bound;
    if (isTruthy(_testValue(test))) {
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


function* runIf(s, toks, openIdx, depth) {
  const thenIdx = _scanRequired(toks, openIdx + 1, 'THEN', 'IF without THEN');
  yield* evalRange(s, toks, openIdx + 1, thenIdx, depth + 1);
  const test = s.pop();
  const { elseIdx, endIdx } = _scanElseEnd(toks, thenIdx, 'IF');
  if (isTruthy(_testValue(test))) {
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
    const test = s.pop();
    if (!isTruthy(_testValue(test))) break;
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
    const test = s.pop();
    if (isTruthy(_testValue(test))) break;
  }
  return _pastBlock(toks, endIdx);
}


// Integer bounds keep the loop counter a BigInt; anything else counts in Decimal,
// so 0 0.3 FOR with a 0.1 step reaches 0.3.
function _popLoopBounds(s) {
  const [startVal, endVal] = s.popN(2);
  const intMode = isInteger(startVal) && isInteger(endVal);
  const toBound = (v) => intMode ? v.value : toRealDecimal(v);
  return { a: toBound(startVal), b: toBound(endVal), intMode };
}


function* runStart(s, toks, openIdx, depth) {
  const { a, b, intMode } = _popLoopBounds(s);
  const { closer, closerIdx } = _scanCounterCloser(toks, openIdx + 1, 'START');
  yield* runLoopBody(s, toks, openIdx + 1, closerIdx, closer, a, b, null, intMode, depth);
  return _pastBlock(toks, closerIdx);
}


// The counter is a local variable, so it never touches a global of the same
// name, and storing into it inside the loop moves the loop on.
function* runFor(s, toks, openIdx, depth) {
  const { a, b, intMode } = _popLoopBounds(s);
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
      const stepVal = s.pop();
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


// Built-in constants, folded to numbers only under APPROX / →NUM.  Names are
// case-sensitive, as on the HP50: e is Euler's number and E an ordinary name.
const SYM_CONSTANTS = Object.freeze({
  PI:   Real(Math.PI),
  'π':  Real(Math.PI),
  'Π':  Real(Math.PI),
  e:    Real(Math.E),
  i:    Complex(0, 1),
  // CODATA 2018 values, without units.
  c:    Real(299792458),              // speed of light, m/s (exact)
  h:    Real(6.62607015e-34),         // Planck constant, J·s (exact)
  'ħ':  Real(1.054571817e-34),        // reduced Planck (h / 2π)
  G:    Real(6.67430e-11),            // gravitational constant, m³/(kg·s²)
  g:    Real(9.80665),                // standard gravity, m/s² (exact)
  NA:   Real(6.02214076e23),          // Avogadro, /mol (exact)
  k:    Real(1.380649e-23),           // Boltzmann, J/K (exact)
  R:    Real(8.314462618),            // universal gas constant, J/(mol·K)
  Vm:   Real(0.02241396954),          // molar volume at 0 °C and 1 atm, m³/mol
  'σ':  Real(5.670374419e-8),         // Stefan-Boltzmann, W/(m²·K⁴)
  'ε0': Real(8.8541878128e-12),       // vacuum permittivity, F/m
  'μ0': Real(1.25663706212e-6),       // vacuum permeability, N/A²
  q:    Real(1.602176634e-19),        // elementary charge, C (exact)
  me:   Real(9.1093837015e-31),       // electron rest mass, kg
  mp:   Real(1.67262192369e-27),      // proton rest mass, kg
  mn:   Real(1.67492749804e-27),      // neutron rest mass, kg
  F:    Real(96485.33212),            // Faraday, C/mol (= NA·q)
  'α':  Real(7.2973525693e-3),        // fine-structure, dimensionless
  // No `re` (classical electron radius): it would shadow the RE command.
  a0:   Real(5.29177210903e-11),      // Bohr radius, m
  'μB': Real(9.2740100783e-24),       // Bohr magneton, J/T
  'μN': Real(5.0507837461e-27),       // nuclear magneton, J/T
  Rinf: Real(10973731.568160),        // Rydberg, /m (exact)
  'λc': Real(2.42631023867e-12),      // Compton wavelength, m
  'γe': Real(1.76085963023e11),       // electron gyromagnetic ratio, /(s·T)
  Z0:   Real(376.730313668),          // impedance of free space, Ω
  atm:  Real(101325),                 // standard atmosphere, Pa (exact)
  T0:   Real(273.15),                 // standard temperature, K (exact)
});

function _symConstantRpl(name) {
  if (!name) return undefined;
  // MAXR / MINR follow the current exponent limit (STMXE).
  const upper = String(name).toUpperCase();
  if (upper === 'MAXR') {
    const e = getRealMaxExp();
    return Real(new Decimal(`9.99999999999e+${e}`));
  }
  if (upper === 'MINR') {
    const e = getRealMaxExp();
    return Real(new Decimal(`1e-${e}`));
  }
  if (Object.prototype.hasOwnProperty.call(SYM_CONSTANTS, name)) {
    return SYM_CONSTANTS[name];
  }
  return upper === 'PI' ? SYM_CONSTANTS.PI : undefined;
}

// The AST evaluator can only inline real numbers, so `i` stays symbolic there.
function _symConstantValue(name) {
  const v = _symConstantRpl(name);
  if (v && v.type === 'real' && v.value.isFinite()) return AstNum(v.value.toSignificantDigits(12).toNumber(), true);
  return undefined;
}


// Runs a program generator that must not suspend; a HALT or PROMPT inside it is
// reported as an error naming `caller` (e.g. 'IFT action').
export function _driveGen(gen, caller) {
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
// ('1/3' stays '1/3'). A name `keeps` says yes to stays as it is.
export function _evalSymbolic(v, keeps = () => false) {
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
  const folded = _foldUnits(evalNode(_expandUserCalls(v.expr)), evalNode);
  const integrated = _casCalculus(folded);
  const calculated = integrated === folded ? folded : evalNode(integrated);
  const settled = _casSpecialValues(calculated);
  const reduced = settled === calculated ? calculated : evalNode(settled);
  _checkInfinite(reduced);
  const value = _astToRplValue(reduced);
  return approx && isInteger(value) ? Real(value.value.toString()) : value;
}


// EVAL hands an expression still holding ∞ or ? to the CAS, which knows the AUR's ATAN(-∞) is -π/2 and 1/∞ is 0;
// an undefined answer, such as ∞-∞ or anything worked out from ?, is ?.
function _casSpecialValues(ast) {
  const bare = ast.kind === 'neg' ? ast.arg : ast;
  const names = algebraFreeVars(ast);
  if (bare.kind === 'var' || (!names.has('∞') && !names.has('?')) || !giac.isReady()) return ast;
  let raw;
  try {
    raw = giac.caseval(buildGiacCmd(ast, (e) => e));
  } catch (e) {
    if (e instanceof RPLError) return ast;
    throw e;
  }
  if (raw.trim() === 'undef') return AstVar('?');
  return /\bundef\b/.test(raw) ? ast : giacToAst(raw);
}

// EVAL hands a derivative or integral it still holds to the CAS, as the HP does; one the CAS cannot work out stays as it is.
const CAS_CALCULUS = { DERIV: { arity: 2, op: 'DERIV' }, INTEG: { arity: 2, op: 'INTEG' } };

function _casCalculus(ast) {
  if (ast.kind === 'neg') {
    const arg = _casCalculus(ast.arg);
    return arg === ast.arg ? ast : AstNeg(arg);
  }
  if (ast.kind === 'bin') {
    const l = _casCalculus(ast.l), r = _casCalculus(ast.r);
    return l === ast.l && r === ast.r ? ast : AstBin(ast.op, l, r);
  }
  if (ast.kind !== 'fn') return ast;
  const args = ast.args.map(_casCalculus);
  const rebuilt = args.every((a, i) => a === ast.args[i]) ? ast : AstFn(ast.name, args);
  const dn = _DN_FUNCTION.exec(ast.name);
  if (dn && isKnownFunction(dn[2])) return _dnDerivative(dn[1].match(/\d+/g).map(Number), dn[2], args) ?? rebuilt;
  const definite = ast.name === 'INTEG' && args.length === 4;
  const form = definite ? { arity: 4, op: '∫' } : CAS_CALCULUS[ast.name];
  if (!form || args.length !== form.arity || args[1].kind !== 'var') return rebuilt;
  const s = new Stack();
  try {
    if (definite) for (const a of [args[2], args[3]]) s.push(_astToRplValue(a));
    s.push(Symbolic(args[0]));
    s.push(Name(args[1].name));
    lookup(form.op).fn(s);
    return _toAst(s.pop());
  } catch {
    return rebuilt;
  }
}

// The HP's dn: d1SIN(2*X) is SIN differentiated in its first argument, COS(2*X), and d1d1 differentiates twice.
const _DN_FUNCTION = /^((?:d\d+)+)([A-Za-z].*)$/;

function _dnDerivative(orders, name, args) {
  if (orders.some((n) => n > args.length)) return null;
  const slots = args.map((_, i) => `rplD${i + 1}`);
  const s = new Stack();
  try {
    let expr = AstFn(name, slots.map((slot) => AstVar(slot)));
    for (const n of orders) {
      s.push(Symbolic(expr));
      s.push(Name(slots[n - 1]));
      lookup('DERIV').fn(s);
      expr = _toAst(s.pop());
    }
    return _substitute(expr, new Map(slots.map((slot, i) => [slot, args[i]])));
  } catch {
    return null;
  }
}

// A division by zero left in the result raises the HP's error, not a 1/0 to keep.
function _checkInfinite(ast) {
  if (ast.kind === 'neg') return _checkInfinite(ast.arg);
  if (ast.kind === 'fn') return ast.args.forEach(_checkInfinite);
  if (ast.kind !== 'bin') return;
  _checkInfinite(ast.l);
  _checkInfinite(ast.r);
  const zero = (a) => a.kind === 'num' && a.value === 0;
  const negative = (a) => (a.kind === 'num' && a.value < 0) || (a.kind === 'neg' && a.arg.kind === 'num');
  if (ast.op === '/' && _isLeaf(ast.l) && zero(ast.r)) throw _divisionByZero(zero(ast.l));
  if (ast.op === '^' && zero(ast.l) && negative(ast.r)) throw new RPLError('Infinite result');
}

const _isLeaf = (a) => a.kind === 'num' || a.kind === 'unit';

// What the commands make of numbers and units, worked on a stack of their own: 2_m*3 is 6_m.
function _applyToLeaves(name, args) {
  const s = new Stack();
  for (const a of args) s.push(_astToRplValue(a));
  lookup(name).fn(s);
  return _toAst(s.pop());
}

// Unit arithmetic inside an algebraic is left to the commands, so it converts
// and checks units exactly as they do on the stack; Inconsistent units stops EVAL.
// A part whose units cancel, or an IFTE test they decide, goes back to evalNode.
function _foldUnits(ast, evalNode) {
  if (ast.kind === 'unit' || !hasUnits(ast)) return ast;
  if (ast.kind === 'fn' && ast.name === 'IFTE' && ast.args.length === 3) {
    const test = _foldUnits(ast.args[0], evalNode);
    if (test.kind === 'num') return _foldUnits(evalNode(test.value !== 0 ? ast.args[1] : ast.args[2]), evalNode);
  }
  const fold = (a) => _foldUnits(a, evalNode);
  const args = ast.kind === 'bin' ? [fold(ast.l), fold(ast.r)] : ast.kind === 'neg' ? [fold(ast.arg)] : ast.args.map(fold);
  const rebuilt = ast.kind === 'bin' ? AstBin(ast.op, ...args) : ast.kind === 'neg' ? AstNeg(args[0]) : AstFn(ast.name, args);
  if (!args.some((a) => a.kind === 'unit')) return args.some(hasUnits) ? rebuilt : evalNode(rebuilt);
  const name = ast.kind === 'bin' ? ast.op : ast.kind === 'neg' ? 'NEG' : ast.name;
  if (!args.every(_isLeaf) || name === '=' || !lookup(name)) return rebuilt;
  return _applyToLeaves(name, args) ?? rebuilt;
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

export function _substitute(ast, bindings) {
  switch (ast.kind) {
    case 'var': return bindings.get(ast.name) ?? ast;
    case 'neg': return AstNeg(_substitute(ast.arg, bindings));
    case 'bin': return AstBin(ast.op, _substitute(ast.l, bindings), _substitute(ast.r, bindings));
    case 'fn': return AstFn(ast.name, ast.args.map((a) => _substitute(a, bindings)));
    default: return ast;
  }
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
  if (_userCallDepth >= MAX_EVAL_DEPTH) throw new RPLError('EVAL recursion too deep');
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
      const call = _callUserProgram(name, args.map((a) => _numberValue(a, real)));
      if (call) return call;
      result = algebraDefaultFnEval(name, args) ?? _commandCall(name, args, real);
    }
  }
  if (real) return result;
  if (!getApproxMode() && args.length === 1 && Number.isSafeInteger(x) && !_integerPoint(String(name).toUpperCase(), BigInt(x), 1n)) return null;
  return _approxGate(result, args);
}


export function _invMatrixNumeric(rows) {
  const n = rows.length;
  for (const row of rows) {
    if (row.length !== n) throw new RPLError('Invalid dimension');
    for (const x of row) {
      if (!isReal(x) && !isInteger(x)) throw new RPLError('Bad argument type');
    }
  }
  const a = rows.map(row => row.map(x => isInteger(x) ? Number(x.value) : x.value.toNumber()));
  const I = [];
  for (let i = 0; i < n; i++) {
    const row = new Array(n).fill(0);
    row[i] = 1;
    I.push(row);
  }
  for (let k = 0; k < n; k++) {
    let best = k, bestAbs = Math.abs(a[k][k]);
    for (let i = k + 1; i < n; i++) {
      const v = Math.abs(a[i][k]);
      if (v > bestAbs) { best = i; bestAbs = v; }
    }
    if (bestAbs === 0) throw new RPLError('Infinite result');
    if (best !== k) {
      [a[k], a[best]] = [a[best], a[k]];
      [I[k], I[best]] = [I[best], I[k]];
    }
    const piv = a[k][k];
    for (let j = 0; j < n; j++) { a[k][j] /= piv; I[k][j] /= piv; }
    for (let i = 0; i < n; i++) {
      if (i === k) continue;
      const f = a[i][k];
      if (f === 0) continue;
      for (let j = 0; j < n; j++) {
        a[i][j] -= f * a[k][j];
        I[i][j] -= f * I[k][j];
      }
    }
  }
  return I.map(row => row.map(x => Real(x)));
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
// arbitrary-precision Integer reports ZINT (28).
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
  if (isSymbolic(v))      return 9;
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
    (op ?? lookup('EVAL')).fn(s);
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


// HMS values are HH.MMSSss decimals: 2.3000 is 2 h 30 min, 1.4530 is 1 h 45 min 30 s.
export function _hmsToHours(h) {
  if (!Number.isFinite(h)) throw new RPLError('Bad argument value');
  const sign = h < 0 ? -1 : 1;
  const x = Math.abs(h);
  const hh = Math.floor(x);
  const afterPoint = (x - hh) * 100;
  // The epsilon keeps float noise from reading 1.45 as 1 h 44 min 59.99… s.
  const mm = Math.floor(afterPoint + 1e-9);
  const ss = (afterPoint - mm) * 100;
  if (mm >= 60) throw new RPLError('Bad argument value');
  if (ss >= 60) throw new RPLError('Bad argument value');
  return sign * (hh + mm / 60 + ss / 3600);
}


export function _hoursToHms(hours) {
  if (!Number.isFinite(hours)) throw new RPLError('Bad argument value');
  const sign = hours < 0 ? -1 : 1;
  const x = Math.abs(hours);
  const hh = Math.floor(x);
  const minsPart = (x - hh) * 60;
  const mm = Math.floor(minsPart + 1e-12);
  const ss = (minsPart - mm) * 60;
  const combined = hh + (mm * 100 + ss) / 10000;
  return sign * combined;
}


export function _hmsUnary(name, fn) {
  return (s) => {
    const v = s.pop();
    if (isComplex(v)) throw new RPLError('Bad argument type');
    const x = toRealOrThrow(v);
    s.push(Real(fn(x)));
  };
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


export function* runMap(s, depth) {
  if (s.depth < 2) throw new RPLError('Too few arguments');
  const prog = s.pop();
  const obj  = s.pop();
  _combinatorProgCheck(prog);
  if (isList(obj)) {
    const out = [];
    for (const e of obj.items) out.push(yield* _mapOneValueGen(s, prog, e, depth));
    s.push(RList(out));
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


export function _cx(re, im) { return { re, im }; }

export function _cxAdd(a, b) { return { re: a.re + b.re, im: a.im + b.im }; }

export function _cxSub(a, b) { return { re: a.re - b.re, im: a.im - b.im }; }

export function _cxMul(a, b) {
  return { re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re };
}

export function _cxDiv(a, b) {
  const d = b.re * b.re + b.im * b.im;
  if (d === 0) throw new RPLError('Infinite result');
  return {
    re: (a.re * b.re + a.im * b.im) / d,
    im: (a.im * b.re - a.re * b.im) / d,
  };
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
  if (s.depth < 5) throw new RPLError('Too few arguments');
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
  if (s.depth < 2) throw new RPLError('Too few arguments');
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
  if (s.depth < 3) throw new RPLError('Too few arguments');
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
  if (s.depth < 2) throw new RPLError('Too few arguments');
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


export const _rowDecompose = (s) => {
  const [M] = s.popN(1);
  if (!isMatrix(M)) throw new RPLError('Bad argument type');
  for (const row of M.rows) s.push(Vector(row.slice()));
  s.push(Real(M.rows.length));
};


export const _rowCompose = (s) => {
  const [countVal] = s.popN(1);
  const m = _indexAsInt(countVal);
  if (m < 1) throw new RPLError('Bad argument value');
  const vecs = s.popN(m);
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


// Descending-degree coefficients → an expanded polynomial in X, with signs folded
// into the operators (2*X^3-X rather than 2*X^3+-1*X).
export function _coefArrToSymbolicX(coefs) {
  const X = AstVar('X');
  const deg = coefs.length - 1;
  let ast = null;
  for (let i = 0; i < coefs.length; i++) {
    const c = coefs[i];
    if (c === 0) continue;
    const pow = deg - i;
    const ac = Math.abs(c);
    let factor;
    if (pow === 0) {
      factor = AstNum(ac);
    } else {
      const Xpow = (pow === 1) ? X : AstBin('^', X, AstNum(pow));
      factor = (ac === 1) ? Xpow : AstBin('*', AstNum(ac), Xpow);
    }
    if (ast === null) {
      ast = c < 0 ? AstNeg(factor) : factor;
    } else {
      ast = AstBin(c < 0 ? '-' : '+', ast, factor);
    }
  }
  if (ast === null) ast = AstNum(0);
  return Symbolic(ast);
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
  if (!giac.isReady()) throw new RPLError('CAS not ready');
  const raw = giac.caseval(cmd);
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
      const reduced = algebraEvalAst(v.expr, () => null, _angleAwareFnEval, null);
      if (reduced && reduced.kind === 'num' && Number.isFinite(reduced.value)) {
        return Real(reduced.value);
      }
    }
  }
  return v;
});
