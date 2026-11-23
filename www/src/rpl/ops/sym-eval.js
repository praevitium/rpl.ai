// The symbolic evaluator, split out of internal.js a piece at a time. Here: the rewrites EVAL makes of an expression's
// tree that need no stack, such as LN of a negative number in complex mode and the check for a 1/0 left in a result.
import { RPLError } from '../stack.js';
import { getComplexMode } from '../state.js';
import { Var as AstVar, Num as AstNum, Bin as AstBin, Fn as AstFn, Neg as AstNeg, exactRational } from '../algebra.js';
import { _divisionByZero } from './numeric.js';

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
