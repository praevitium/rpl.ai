import { isReal, Real, isInteger, isComplex, Symbolic, isVector, Vector, isMatrix, Matrix, isRational, Complex, Integer } from '../types.js';
import { fromRadians, setCoordMode, toggleComplexMode, getComplexMode } from '../state.js';
import { Fn as AstFn } from '../algebra.js';
import { RPLError } from '../stack.js';
import { register } from './registry.js';
import { _cToPOp, _cToROp, _isSymOperand, _pToCOp, _rToCOp, _toAst, _withListUnary, _withTaggedUnary } from './internal.js';



/* ------------------- complex-number ops ---------------
   ARG    argument θ of a complex number, in the active angle mode.
          On real inputs:  ≥0 → 0,  <0 → π (180° / 200 grad).
   CONJ   complex conjugate a+bi → a−bi; identity on Real/Integer.
   RE     real part: Real(a) from a+bi, identity on Real/Integer.
   IM     imaginary part:  b from a+bi,  0 from Real/Integer.

   Backs the CMPLX soft-menu (SHIFT-R + 1 → ABS / ARG / CONJ / RE /
   IM / i) and the shifted ÷ key (ARG).
   -------------------------------------------------------------------- */
/* ARG covers scalars (R/Z/C) plus Vector / Matrix element-wise,
   Symbolic lift, and Tagged transparency.  Result on a Real/Integer
   is angle-mode-sensitive (negative → π, non-negative → 0) —
   element-wise just broadcasts that. */
function _argScalar(v) {
  if (isReal(v))    return Real(fromRadians(v.value.isNegative() ? Math.PI : 0));
  if (isInteger(v)) return Real(fromRadians(v.value < 0n ? Math.PI : 0));
  if (isComplex(v)) return Real(fromRadians(Math.atan2(v.im, v.re)));
  if (_isSymOperand(v)) return Symbolic(AstFn('ARG', [_toAst(v)]));
  throw new RPLError('Bad argument type');
}

register('ARG', _withTaggedUnary(_withListUnary((s) => {
  const v = s.pop();
  if (isVector(v))      s.push(Vector(v.items.map(_argScalar)));
  else if (isMatrix(v)) s.push(Matrix(v.rows.map(r => r.map(_argScalar))));
  else                  s.push(_argScalar(v));
})), { category: 'Complex / coordinates', categoryOrder: 3, label: "ARG" });


/* CONJ / RE / IM extend to element-wise on Vector & Matrix.  Today
   every entry is Real/Integer/Symbolic so CONJ is identity, RE is
   identity, and IM is a zero-valued array — but the element-wise
   dispatch is in place for when Complex entries can appear in arrays. */
function _conjScalar(v) {
  if (isReal(v) || isInteger(v) || isRational(v)) return v;
  if (isComplex(v)) return Complex(v.re, -v.im);
  if (_isSymOperand(v)) return Symbolic(AstFn('CONJ', [_toAst(v)]));
  throw new RPLError('Bad argument type');
}

function _reScalar(v) {
  if (isReal(v) || isInteger(v) || isRational(v)) return v;
  if (isComplex(v)) return Real(v.re);
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

/* CONJ / RE / IM have Tagged transparency.  Each uses the standard
   unary-Tagged shape: unwrap tag, apply, re-tag with the same label.
   Vector and Matrix inputs are element-wise and retag as
   Tagged(label, Vector/Matrix) — matches HP50 where the tag survives
   structural operations that return the same shape. */
register('CONJ', _withTaggedUnary(_withListUnary((s) => {
  const v = s.pop();
  if (isVector(v))      s.push(Vector(v.items.map(_conjScalar)));
  else if (isMatrix(v)) s.push(Matrix(v.rows.map(r => r.map(_conjScalar))));
  else s.push(_conjScalar(v));
})), { category: 'Complex / coordinates', categoryOrder: 2, label: "CONJ" });

register('RE', _withTaggedUnary(_withListUnary((s) => {
  const v = s.pop();
  if (isVector(v))      s.push(Vector(v.items.map(_reScalar)));
  else if (isMatrix(v)) s.push(Matrix(v.rows.map(r => r.map(_reScalar))));
  else s.push(_reScalar(v));
})), { category: 'Complex / coordinates', categoryOrder: 0, label: "RE" });

register('IM', _withTaggedUnary(_withListUnary((s) => {
  const v = s.pop();
  if (isVector(v))      s.push(Vector(v.items.map(_imScalar)));
  else if (isMatrix(v)) s.push(Matrix(v.rows.map(r => r.map(_imScalar))));
  else s.push(_imScalar(v));
})), { category: 'Complex / coordinates', categoryOrder: 1, label: "IM" });


/* ------------------------------------------------------------------
   RECT / CYLIN / SPHERE — coordinate-display mode.

   HP50 flags -15 / -16 control rendering of Complex and Vector values:
     -15 CLR -16 CLR → Rectangular    `(1, 1)`      — "XYZ"
     -15 SET -16 CLR → Cylindrical    `(SQRT(2), ∠π/4)` — "R∠Z"
     -15 CLR -16 SET → Spherical      — for 3-vectors, "R∠∠"
   This build keeps them as three named modes rather than shipping
   the flag interface; the formatter reads state.coordMode.  No
   arithmetic behavior changes — only display.  The ops stay 0-arg
   so they can be dropped into any program or the side-panel
   Commands tab.
   ------------------------------------------------------------------ */
register('RECT',   () => { setCoordMode('RECT'); }, { category: 'Complex / coordinates', categoryOrder: 8, label: "RECT" });

register('CYLIN',  () => { setCoordMode('CYLIN'); }, { category: 'Complex / coordinates', categoryOrder: 9, label: "CYLIN" });

register('SPHERE', () => { setCoordMode('SPHERE'); }, { category: 'Complex / coordinates', categoryOrder: 10, label: "SPHERE" });

register('R→C',  _rToCOp, { category: 'Complex / coordinates', categoryOrder: 4, label: "R→C" });

register('C→R',  _cToROp, { category: 'Complex / coordinates', categoryOrder: 5, label: "C→R" });


/* --------------- CMPLX / CMPLX? — complex-mode toggle ----------------
   HP50 system flag -103 (`_Complex_` when SET, `_Real_` when CLEAR).

     CMPLX   ( →   )   Toggle the CMPLX flag.  No stack side effects;
                       fires a state-change event so any future MODES
                       annunciator redraws.
     CMPLX?  ( → b )   Push TRUE (1.) if CMPLX is currently ON, FALSE
                       (0.) otherwise.

   When CMPLX is ON, real-domain-violating ops (LN/LOG on negative
   Real, ACOS/ASIN on |x|>1) return the principal-branch Complex
   result instead of throwing.  Fresh calculators boot with CMPLX
   CLEAR — matches a factory-reset HP50.
   ----------------------------------------------------------------- */

register('CMPLX', (s) => {
  toggleComplexMode();
}, { category: 'Complex / coordinates', categoryOrder: 11, label: "CMPLX" });


register('CMPLX?', (s) => {
  s.push(Real(getComplexMode() ? 1 : 0));
}, { category: 'Complex / coordinates', categoryOrder: 12, label: "CMPLX?" });

register('C→P',  _cToPOp, { category: 'Complex / coordinates', categoryOrder: 6, label: "C→P" });

register('P→C',  _pToCOp, { category: 'Complex / coordinates', categoryOrder: 7, label: "P→C" });
