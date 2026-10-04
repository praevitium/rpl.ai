import { isReal, Real, isInteger, isComplex, Symbolic, isVector, Vector, isMatrix, Matrix, isRational, isUnit, Complex, Integer } from '../types.js';
import { fromRadians, setCoordMode, toggleComplexMode, getComplexMode } from '../state.js';
import { Fn as AstFn } from '../algebra.js';
import { RPLError } from '../stack.js';
import { register } from './registry.js';
import { _cToPOp, _cToROp, _isSymOperand, _pToCOp, _rToCOp, _toAst, _withListUnary, _withTaggedUnary } from './internal.js';



function _elementwise(scalarFn) {
  return _withTaggedUnary(_withListUnary((s) => {
    const v = s.pop();
    if (isVector(v))      s.push(Vector(v.items.map(scalarFn)));
    else if (isMatrix(v)) s.push(Matrix(v.rows.map(r => r.map(scalarFn))));
    else                  s.push(scalarFn(v));
  }));
}

function _argScalar(v) {
  if (isReal(v))    return Real(fromRadians(v.value.isNegative() ? Math.PI : 0));
  if (isInteger(v)) return Real(fromRadians(v.value < 0n ? Math.PI : 0));
  if (isComplex(v)) return Real(fromRadians(Math.atan2(v.im, v.re)));
  if (_isSymOperand(v)) return Symbolic(AstFn('ARG', [_toAst(v)]));
  throw new RPLError('Bad argument type');
}

register('ARG', _elementwise(_argScalar), { category: 'Complex / coordinates', categoryOrder: 3, label: "ARG" });


function _conjScalar(v) {
  if (isReal(v) || isInteger(v) || isRational(v)) return v;
  if (isComplex(v)) return Complex(v.re, -v.im);
  if (_isSymOperand(v)) return Symbolic(AstFn('CONJ', [_toAst(v)]));
  throw new RPLError('Bad argument type');
}

function _reScalar(v) {
  if (isReal(v) || isInteger(v) || isRational(v)) return v;
  if (isComplex(v)) return Real(v.re);
  if (isUnit(v)) return Real(v.value);
  if (_isSymOperand(v)) return Symbolic(AstFn('RE', [_toAst(v)]));
  throw new RPLError('Bad argument type');
}

function _imScalar(v) {
  if (isReal(v))    return Real(0);
  if (isInteger(v) || isRational(v)) return Integer(0n);
  if (isComplex(v)) return Real(v.im);
  if (_isSymOperand(v)) return Symbolic(AstFn('IM', [_toAst(v)]));
  throw new RPLError('Bad argument type');
}

register('CONJ', _elementwise(_conjScalar), { category: 'Complex / coordinates', categoryOrder: 2, label: "CONJ" });

register('RE', _elementwise(_reScalar), { category: 'Complex / coordinates', categoryOrder: 0, label: "RE" });

register('IM', _elementwise(_imScalar), { category: 'Complex / coordinates', categoryOrder: 1, label: "IM" });


register('RECT',   () => { setCoordMode('RECT'); }, { category: 'Complex / coordinates', categoryOrder: 8, label: "RECT" });

register('CYLIN',  () => { setCoordMode('CYLIN'); }, { category: 'Complex / coordinates', categoryOrder: 9, label: "CYLIN" });

register('SPHERE', () => { setCoordMode('SPHERE'); }, { category: 'Complex / coordinates', categoryOrder: 10, label: "SPHERE" });

register('R→C',  _rToCOp, { category: 'Complex / coordinates', categoryOrder: 4, label: "R→C" });

register('C→R',  _cToROp, { category: 'Complex / coordinates', categoryOrder: 5, label: "C→R" });


register('CMPLX', () => {
  toggleComplexMode();
}, { category: 'Complex / coordinates', categoryOrder: 11, label: "CMPLX" });


register('CMPLX?', (s) => {
  s.push(Real(getComplexMode() ? 1 : 0));
}, { category: 'Complex / coordinates', categoryOrder: 12, label: "CMPLX?" });

register('C→P',  _cToPOp, { category: 'Complex / coordinates', categoryOrder: 6, label: "C→P" });

register('P→C',  _pToCOp, { category: 'Complex / coordinates', categoryOrder: 7, label: "P→C" });
