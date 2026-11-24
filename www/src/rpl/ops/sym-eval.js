// The symbolic evaluator, split out of internal.js a piece at a time. Here: turning values into expression trees and
// back, and the rewrites EVAL makes of a tree that need no evaluator state, such as LN of a negative number in complex
// mode, a closed expression holding i, ∞ or ? and the check for a 1/0 left in a result.
import { isSymbolic, isName, isInteger, isReal, isRational, isUnit, isNumber, Name, Integer, Real, Rational, Unit, Symbolic, Complex } from '../types.js';
import { RPLError, Stack } from '../stack.js';
import { getComplexMode } from '../state.js';
import {
  Var as AstVar, Num as AstNum, Bin as AstBin, Fn as AstFn, Neg as AstNeg, UnitNode as AstUnit, exactRational, isRealNum,
  isArrayLiteral, freeVars as algebraFreeVars, hasUnits,
} from '../algebra.js';
import { parseEntry as _parseEntryForObjTo } from '../parser.js';
import { buildGiacCmd, giacToAst } from '../cas/giac-convert.mjs';
import { giac, casRun } from '../cas/giac-engine.mjs';
import { lookup } from './registry.js';
import { _divisionByZero } from './numeric.js';

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


export function _numToRpl(n, sign = 1) {
  if (n.digits) return Integer(BigInt(sign) * BigInt(n.digits));
  return isRealNum(n) ? Real(sign * n.value) : Integer(BigInt(sign * n.value));
}

export function _astToRplValue(ast) {
  if (!ast) return Name('', { quoted: true });
  if (ast.kind === 'num') return _numToRpl(ast);
  if (ast.kind === 'unit') return Unit(ast.value, ast.uexpr);
  if (ast.kind === 'var') return isArrayLiteral(ast.name) ? _parseEntryForObjTo(ast.name)[0] : Name(ast.name, { quoted: true });
  // Giac returns negative literals as Neg(Num); land them as plain numbers.
  if (ast.kind === 'neg' && ast.arg && ast.arg.kind === 'num') return _numToRpl(ast.arg, -1);
  const fraction = exactRational(ast);
  if (fraction && fraction[1] !== 1n) return Rational(fraction[0], fraction[1]);
  return Symbolic(ast);
}


// The algebra evaluator holds real numbers only, so →NUM and APPROX work an expression that holds i out with the commands
// themselves: '3+4*i' gives (3,4), as '3+4*π' gives a real, and so does a closed expression it left because its value is not
// real, 'SQRT(-4)' or 'LN(-1)'. Anything else left in it keeps the whole expression symbolic.
const _IMAGINARY_OPS = new Set(['+', '-', '*', '/', '^']);
const _IMAGINARY_FUNCTIONS = new Set(['ABS', 'ARG', 'RE', 'IM', 'CONJ', 'SQRT', 'SQ', 'INV', 'EXP', 'LN', 'LOG', 'ALOG', 'SIN', 'COS', 'TAN', 'ASIN', 'ACOS', 'ATAN', 'SINH', 'COSH', 'TANH', 'ASINH', 'ACOSH', 'ATANH']);

export function _foldImaginary(ast) {
  const names = algebraFreeVars(ast);
  const plain = ast.kind === 'num' || (ast.kind === 'neg' && ast.arg.kind === 'num');
  if (!names.has('i') && (names.size > 0 || plain)) return null;
  const walk = (node) => {
    if (node.kind === 'num') return _numToRpl(node);
    if (node.kind === 'var' && node.name === 'i') return Complex(0, 1);
    const call = node.kind === 'neg' ? ['NEG', [node.arg]]
      : node.kind === 'bin' && _IMAGINARY_OPS.has(node.op) ? [node.op, [node.l, node.r]]
        : node.kind === 'fn' && _IMAGINARY_FUNCTIONS.has(node.name.toUpperCase()) ? [node.name.toUpperCase(), node.args] : null;
    if (!call) throw new RPLError('Bad argument type');
    const s = new Stack();
    call[1].forEach((arg) => s.push(walk(arg)));
    lookup(call[0]).fn(s);
    return s.pop();
  };
  try {
    const value = walk(ast);
    return isNumber(value) ? value : null;
  } catch (e) {
    if (e instanceof RPLError) return null;
    throw e;
  }
}


// EVAL hands an expression still holding ∞ or ? to the CAS, which knows the AUR's ATAN(-∞) is -π/2 and 1/∞ is 0;
// an undefined answer, such as ∞-∞ or anything worked out from ?, is ?.
export function _casSpecialValues(ast) {
  const bare = ast.kind === 'neg' ? ast.arg : ast;
  const names = algebraFreeVars(ast);
  if (bare.kind === 'var' || (!names.has('∞') && !names.has('?')) || hasUnits(ast) || !giac.isReady()) return ast;
  let raw;
  try {
    raw = casRun(buildGiacCmd(ast, (e) => e));
  } catch (e) {
    if (e instanceof RPLError) return ast;
    throw e;
  }
  if (raw.trim() === 'undef') return AstVar('?');
  return /\bundef\b/.test(raw) ? ast : giacToAst(raw);
}

const _I_PI = AstBin('*', AstVar('i'), AstVar('π'));

// In exact mode with complex results on, LN of the negative exact number
// -n/d is LN(n/d) plus i*π, so LN(-1) is 'i*π' as on the HP.
export function _exactLnNegative(n, d) {
  if (n === d) return _I_PI;
  const size = d === 1n ? AstNum(n) : AstBin('/', AstNum(n), AstNum(d));
  return AstBin('+', AstFn('LN', [size]), _I_PI);
}

export function _complexLnRewrite(ast) {
  if (!getComplexMode() || !ast || typeof ast !== 'object') return ast;
  if (ast.kind === 'neg') {
    const arg = _complexLnRewrite(ast.arg);
    return arg === ast.arg ? ast : AstNeg(arg);
  }
  if (ast.kind === 'bin') {
    const l = _complexLnRewrite(ast.l), r = _complexLnRewrite(ast.r);
    return l === ast.l && r === ast.r ? ast : AstBin(ast.op, l, r);
  }
  if (ast.kind !== 'fn') return ast;
  const args = ast.args.map(_complexLnRewrite);
  const exact = ast.name === 'LN' && args.length === 1 ? exactRational(args[0]) : null;
  if (exact && exact[0] < 0n) return _exactLnNegative(-exact[0], exact[1]);
  return args.every((a, i) => a === ast.args[i]) ? ast : AstFn(ast.name, args);
}

export const _isLeaf = (a) => a.kind === 'num' || a.kind === 'unit';

// A division by zero left in the result raises the HP's error, not a 1/0 to keep.
export function _checkInfinite(ast) {
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
