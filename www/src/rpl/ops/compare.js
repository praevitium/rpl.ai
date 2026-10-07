import { isNumber, promoteNumericPair, isBinaryInteger, isName, isString, isList, isVector, isMatrix, isSymbolic, isTagged, isUnit, isProgram, isDirectory, Symbolic, Integer, BinaryInteger } from '../types.js';
import { getWordsizeMask } from '../state.js';
import { RPLError } from '../stack.js';
import { Bin as AstBin, Fn as AstFn, astEqual } from '../algebra.js';
import { uexprEqual, sameDims } from '../units.js';
import { register } from './registry.js';
import { FALSE, TRUE, _inUnit, _isSymOperand, _toAst, isTruthy } from './internal.js';



// 3 and 3/1 are one exact number, but 2 and 2. differ: exact, approximate and complex numbers are three kinds.
const NUMBER_KIND = Object.freeze({ integer: 'exact', rational: 'exact', real: 'real', complex: 'complex' });

// Structural equality for ==, ≠ and SAME.  A BinaryInteger's base is
// display-only, so only its value within the wordsize counts.  SAME also asks
// for the same kind of number: 2 and 2. are equal but not the same.
function eqValues(a, b, strict = false) {
  if (isNumber(a) && isNumber(b)) {
    if (strict && NUMBER_KIND[a.type] !== NUMBER_KIND[b.type]) return false;
    const p = promoteNumericPair(a, b);
    if (p.kind === 'complex')  return p.a.re === p.b.re && p.a.im === p.b.im;
    if (p.kind === 'integer')  return p.a === p.b;
    if (p.kind === 'rational') return p.a.n === p.b.n && p.a.d === p.b.d;
    return p.a.eq(p.b);
  }
  if (isBinaryInteger(a) && isBinaryInteger(b)) {
    const m = getWordsizeMask();
    return (a.value & m) === (b.value & m);
  }
  if (isName(a) && isName(b)) return a.id === b.id;
  if (isString(a) && isString(b)) return a.value === b.value;
  if (isList(a)   && isList(b))   return _eqArr(a.items, b.items, strict);
  if (isVector(a) && isVector(b)) return _eqArr(a.items, b.items, strict);
  if (isMatrix(a) && isMatrix(b)) {
    if (a.rows.length !== b.rows.length) return false;
    for (let i = 0; i < a.rows.length; i++) {
      if (!_eqArr(a.rows[i], b.rows[i], strict)) return false;
    }
    return true;
  }
  if (isSymbolic(a) && isSymbolic(b)) return astEqual(a.expr, b.expr);
  if (isTagged(a)   && isTagged(b)) {
    return a.tag === b.tag && eqValues(a.value, b.value, strict);
  }
  // == converts, so 1_m == 100_cm; SAME wants the same unit expression.
  if (isUnit(a) && isUnit(b)) {
    if (uexprEqual(a.uexpr, b.uexpr)) return a.value === b.value;
    return !strict && sameDims(a.uexpr, b.uexpr) && _inUnit(a, b.uexpr) === b.value;
  }
  if (isProgram(a) && isProgram(b)) return _eqArr(a.tokens, b.tokens, strict);
  // Directories are containers, not values: each is equal only to itself.
  if (isDirectory(a) && isDirectory(b)) return a === b;
  return false;
}


function _eqArr(a, b, strict) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (!eqValues(a[i], b[i], strict)) return false;
  }
  return true;
}


function _pushSymComparison(s, a, b, op) {
  const l = _toAst(a);
  const r = _toAst(b);
  if (!l || !r) throw new RPLError('Bad argument type');
  s.push(Symbolic(AstBin(op, l, r)));
}


// With a Name or Symbolic operand, a comparison builds an expression such
// as 'X<Y' instead of returning a truth value.
function _trySymCompare(s, a, b, op) {
  if (!_isSymOperand(a) && !_isSymOperand(b)) return false;
  _pushSymComparison(s, a, b, op);
  return true;
}


// = always builds an equation, even from two numbers: 2 3 = gives '2=3'.
register('=', (s) => {
  const [a, b] = s.popN(2);
  _pushSymComparison(s, a, b, '=');
}, { category: 'Comparisons / logic', categoryOrder: 1, label: "=" });


// ==, ≠ and <> compare a BinaryInteger with another number by its masked
// value; SAME does not widen it.
function _binIntCrossNormalize(a, b) {
  const m = getWordsizeMask();
  if (isBinaryInteger(a) && !isBinaryInteger(b) && isNumber(b)) {
    return [Integer(a.value & m), b];
  }
  if (isBinaryInteger(b) && !isBinaryInteger(a) && isNumber(a)) {
    return [a, Integer(b.value & m)];
  }
  return [a, b];
}


// Unlike ≠, == returns a truth value even for symbolic operands.
register('==', (s) => {
  const [a0, b0] = s.popN(2);
  const [a, b] = _binIntCrossNormalize(a0, b0);
  s.push(eqValues(a, b) ? TRUE : FALSE);
}, { category: 'Comparisons / logic', categoryOrder: 0, label: "==" });

register('SAME', (s) => {
  const [a, b] = s.popN(2);
  s.push(eqValues(a, b, true) ? TRUE : FALSE);
}, { category: 'Comparisons / logic', categoryOrder: 2, label: "SAME" });


function _notEqual(s) {
  const [a0, b0] = s.popN(2);
  if (_trySymCompare(s, a0, b0, '≠')) return;
  const [a, b] = _binIntCrossNormalize(a0, b0);
  s.push(eqValues(a, b) ? FALSE : TRUE);
}

register('≠', _notEqual, { category: 'Comparisons / logic', categoryOrder: 3, label: "≠" });

register('<>', _notEqual, { category: 'Comparisons / logic', categoryOrder: 4, label: "<>" });


function comparePair(s, cmp, op) {
  let [a, b] = s.popN(2);                 // a = level 2, b = level 1
  const m = getWordsizeMask();
  if (isBinaryInteger(a)) a = Integer(a.value & m);
  if (isBinaryInteger(b)) b = Integer(b.value & m);
  if (_trySymCompare(s, a, b, op)) return;
  if (isString(a) && isString(b)) {
    s.push(cmp(a.value, b.value) ? TRUE : FALSE);
    return;
  }
  if (isUnit(a) && isUnit(b)) {
    if (!sameDims(a.uexpr, b.uexpr)) throw new RPLError('Inconsistent units');
    s.push(cmp(_inUnit(a, b.uexpr), b.value) ? TRUE : FALSE);
    return;
  }
  if (!isNumber(a) || !isNumber(b)) throw new RPLError('Bad argument type');
  const p = promoteNumericPair(a, b);
  let av, bv;
  if (p.kind === 'complex') {
    if (p.a.im !== 0 || p.b.im !== 0) throw new RPLError('Bad argument type');
    av = p.a.re; bv = p.b.re;
  } else if (p.kind === 'integer') {
    av = p.a; bv = p.b;
  } else if (p.kind === 'rational') {
    // Denominators are positive, so cross-multiplying keeps the order.
    av = p.a.n * p.b.d; bv = p.b.n * p.a.d;
  } else {
    // Decimals compare exactly, even beyond the range of a double.
    av = p.a.cmp(p.b); bv = 0;
  }
  s.push(cmp(av, bv) ? TRUE : FALSE);
}


register('<',  (s) => comparePair(s, (a, b) => a <  b, '<'), { category: 'Comparisons / logic', categoryOrder: 5, label: "<" });

register('>',  (s) => comparePair(s, (a, b) => a >  b, '>'), { category: 'Comparisons / logic', categoryOrder: 6, label: ">" });

register('≤',  (s) => comparePair(s, (a, b) => a <= b, '≤'), { category: 'Comparisons / logic', categoryOrder: 7, label: "≤" });

register('<=', (s) => comparePair(s, (a, b) => a <= b, '≤'), { category: 'Comparisons / logic', categoryOrder: 8, label: "<=" });

register('≥',  (s) => comparePair(s, (a, b) => a >= b, '≥'), { category: 'Comparisons / logic', categoryOrder: 9, label: "≥" });

register('>=', (s) => comparePair(s, (a, b) => a >= b, '≥'), { category: 'Comparisons / logic', categoryOrder: 10, label: ">=" });


// Bitwise on two BinaryIntegers (the HP50 overloads these names), symbolic
// with an algebraic or a name (X>1 AND X<2), boolean otherwise.
function binaryLogic(name, bitwise) {
  return (s) => {
    const [a, b] = s.popN(2);
    if (isBinaryInteger(a) && isBinaryInteger(b)) {
      const m = getWordsizeMask();
      s.push(BinaryInteger(bitwise(a.value & m, b.value & m), a.base));
      return;
    }
    if (isBinaryInteger(a) || isBinaryInteger(b)) {
      throw new RPLError('Bad argument type');
    }
    if (_isSymOperand(a) || _isSymOperand(b)) {
      const l = _toAst(a);
      const r = _toAst(b);
      if (!l || !r) throw new RPLError('Bad argument type');
      s.push(Symbolic(AstFn(name, [l, r])));
      return;
    }
    s.push(bitwise(Number(isTruthy(a)), Number(isTruthy(b))) ? TRUE : FALSE);
  };
}

register('AND', binaryLogic('AND', (x, y) => x & y), { category: 'Comparisons / logic', categoryOrder: 11, label: "AND" });

register('OR',  binaryLogic('OR', (x, y) => x | y), { category: 'Comparisons / logic', categoryOrder: 12, label: "OR" });

register('XOR', binaryLogic('XOR', (x, y) => x ^ y), { category: 'Comparisons / logic', categoryOrder: 13, label: "XOR" });


register('NOT', (s) => {
  const v = s.pop();
  if (isBinaryInteger(v)) {
    const m = getWordsizeMask();
    s.push(BinaryInteger((v.value & m) ^ m, v.base));
    return;
  }
  if (_isSymOperand(v)) { s.push(Symbolic(AstFn('NOT', [_toAst(v)]))); return; }
  s.push(isTruthy(v) ? FALSE : TRUE);
}, { category: 'Comparisons / logic', categoryOrder: 14, label: "NOT" });


register('TRUE',  (s) => { s.push(TRUE); }, { category: 'Comparisons / logic', categoryOrder: 15, label: "TRUE" });

register('FALSE', (s) => { s.push(FALSE); }, { category: 'Comparisons / logic', categoryOrder: 16, label: "FALSE" });
