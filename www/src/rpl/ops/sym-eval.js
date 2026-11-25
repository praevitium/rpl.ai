// The symbolic evaluator, split out of internal.js a piece at a time. Here: turning values into expression trees and
// back, and the rewrites EVAL makes of a tree that need no evaluator state, such as LN of a negative number in complex
// mode, a closed expression holding i, ∞ or ? and the check for a 1/0 left in a result.
import { isSymbolic, isName, isInteger, RList, isReal, isRational, isUnit, isNumber, Name, Integer, Real, Rational, Unit, Symbolic, Complex } from '../types.js';
import Decimal from '../../../vendor/decimal.js/decimal.mjs';
import { RPLError, Stack } from '../stack.js';
import { getComplexMode, getRealMaxExp } from '../state.js';
import {
  Var as AstVar, Num as AstNum, Bin as AstBin, Fn as AstFn, Neg as AstNeg, UnitNode as AstUnit, exactRational, isRealNum,
  isArrayLiteral, freeVars as algebraFreeVars, hasUnits, isKnownFunction,
} from '../algebra.js';
import { parseEntry as _parseEntryForObjTo } from '../parser.js';
import { buildGiacCmd, giacToAst } from '../cas/giac-convert.mjs';
import { giac, casRun } from '../cas/giac-engine.mjs';
import { lookup } from './registry.js';
import { _divisionByZero, _infiniteResult } from './numeric.js';

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

export function _substitute(ast, bindings) {
  switch (ast.kind) {
    case 'var': return bindings.get(ast.name) ?? ast;
    case 'neg': return AstNeg(_substitute(ast.arg, bindings));
    case 'bin': return AstBin(ast.op, _substitute(ast.l, bindings), _substitute(ast.r, bindings));
    case 'fn': return AstFn(ast.name, ast.args.map((a) => _substitute(a, bindings)));
    default: return ast;
  }
}

// EVAL hands a derivative or integral it still holds to the CAS, as the HP does; one the CAS cannot work out stays as it is.
const CAS_CALCULUS = { DERIV: { arity: 2, op: 'DERIV' }, INTEG: { arity: 2, op: 'INTEG' } };

export function _casCalculus(ast) {
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

// With flag -22 set, a result that is itself x/0 or 0^-n is ±MAXR, as on the stack. Deeper in an expression, such as
// SIN(1/0), it stays an error rather than a wrong value.
export function _infiniteTop(ast) {
  const negated = ast.kind === 'neg';
  const { op, l, r } = negated ? ast.arg : ast;
  const num = (a) => a?.kind === 'num';
  if (op === '/' && num(l) && l.value !== 0 && num(r) && r.value === 0) return _infiniteResult(negated !== l.value < 0);
  if (op === '^' && num(l) && l.value === 0 && ((num(r) && r.value < 0) || (r?.kind === 'neg' && num(r.arg)))) return _infiniteResult(negated);
  return null;
}

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
export function _foldUnits(ast, evalNode) {
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

// EVAL leaves IFTE, INTEG, DERIV and Σ for their own rules rather than running them as commands on their arguments.
export const _LAZY_FUNCTIONS = new Set(['IFTE', 'INTEG', 'DERIV', 'Σ', 'SUM']);

// A command called with parentheses in a formula, 'FACTOR(X^2+5*X+6)', runs on its arguments when the formula is evaluated, as
// the HP's algebraic parser has it; a command that leaves several results gives them as a list, as the AUR's examples show.
// The commands that only turn their arguments into a result are callable; stack, memory and display commands are not. A call the
// command cannot work out, 'COMB(N,2)' with N unknown, leaves the formula as it was; with only values for arguments, as in
// '[1,2]*[3,4,5]', the command's own error stands. Any function given a matrix, vector or list to work on, 'ABS([3,4])', is a call
// too, since the algebra evaluator cannot take that.
export const _isArrayLiteral = (node) => node.kind === 'var' && isArrayLiteral(node.name);
const _isCommandCall = (node) => {
  const command = node.kind === 'fn' && !_LAZY_FUNCTIONS.has(node.name.toUpperCase()) && lookup(node.name);
  return !!command && (command.callable || node.args.some(_isArrayLiteral));
};

function _holdsCommandCall(node) {
  if (node.kind === 'fn') return _isCommandCall(node) || node.args.some(_holdsCommandCall);
  if (node.kind === 'bin') return _holdsCommandCall(node.l) || _holdsCommandCall(node.r);
  return node.kind === 'neg' ? _holdsCommandCall(node.arg) : _isArrayLiteral(node);
}

export function _evalCommandCalls(ast) {
  if (!_holdsCommandCall(ast)) return null;
  const run = (name, args) => {
    if (!lookup(name) || args.includes(undefined)) return undefined;
    const s = new Stack();
    args.forEach((arg) => s.push(arg));
    try {
      lookup(name).fn(s);
    } catch (e) {
      // With every argument a value, the command's own error is the answer, as in RPN: [1,2]*[3,4,5] says Invalid dimension.
      if (e instanceof RPLError && !args.some((arg) => isName(arg) || isSymbolic(arg))) e.concrete = true;
      throw e;
    }
    return s.depth === 1 ? s.pop() : RList(s.snapshot().reverse());
  };
  const walk = (node) => {
    if (!_holdsCommandCall(node) || node.kind === 'var') return _astToRplValue(node);
    if (node.kind === 'neg') return run('NEG', [walk(node.arg)]);
    if (node.kind === 'bin') return run(node.op, [walk(node.l), walk(node.r)]);
    return run(node.name, node.args.map(walk));
  };
  try {
    return walk(ast) ?? null;
  } catch (e) {
    if (e instanceof RPLError && !e.concrete) return null;
    throw e;
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

export function _symConstantRpl(name) {
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
export function _symConstantValue(name) {
  const v = _symConstantRpl(name);
  if (v && v.type === 'real' && v.value.isFinite()) return AstNum(v.value.toSignificantDigits(12).toNumber(), true);
  return undefined;
}
