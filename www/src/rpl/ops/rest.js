import { isInteger, isReal, Integer, Symbolic, Matrix } from '../types.js';
import { RPLError } from '../stack.js';
import { REAL_MAX_EXP_MIN, REAL_MAX_EXP_MAX, setRealMaxExp, getRealMaxExp, getCasVx } from '../state.js';
import { giac } from '../cas/giac-engine.mjs';
import { giacToAst, splitGiacList } from '../cas/giac-convert.mjs';
import { register, lookup } from './registry.js';
import { _astToRplValue, _cToPOp, _cToROp, _colCompose, _colDecompose, _fromArrayOp, _fromListOp, _fromStrOp, _fromVecOp, _matrixToGiacStr, _pToCOp, _popSquareMatrix, _rToCOp, _rowCompose, _rowDecompose, _toArrayOp, _toListOp, _toStrOp, _toV2Op, _toV3Op } from './internal.js';


// ASCII spellings of arrow commands run the canonical op.
const alias = (name) => (s) => lookup(name).fn(s);

register('R->D', alias('R→D'));

register('D->R', alias('D→R'));

register('->NUM', alias('→NUM'));

register('B->R', alias('B→R'));

register('R->B', alias('R→B'));

register('->UNIT', alias('→UNIT'));


// HP50's ∫ takes four arguments; here the glyph is INTEG's two-argument form.
register('∫', alias('INTEG'));

register('∂', alias('DERIV'));

register('DERIVX', alias('DERVX'));

register('->LIST', _toListOp);

register('LIST->', _fromListOp);

register('OBJ->', alias('OBJ→'));

register('->PRG', alias('→PRG'));

register('->ARRY', _toArrayOp);

register('ARRY->', _fromArrayOp);

register('->STR', _toStrOp);

register('STR->', _fromStrOp);

register('->V2', _toV2Op);

register('->V3', _toV3Op);

register('V->', _fromVecOp);

register('R->C', _rToCOp);

register('C->R', _cToROp);


// STMXE / RCMXE set and recall the Real exponent limit behind MAXR, MINR and
// overflow (not an HP50 command).
register('STMXE', (s) => {
  const v = s.pop();
  let n;
  if (isInteger(v))      n = Number(v.value);
  else if (isReal(v))    n = v.value.toNumber();
  else throw new RPLError('Bad argument type');
  if (!Number.isInteger(n) || n < REAL_MAX_EXP_MIN || n > REAL_MAX_EXP_MAX) {
    throw new RPLError('Bad argument value');
  }
  setRealMaxExp(n);
});


register('RCMXE', (s) => {
  s.push(Integer(BigInt(getRealMaxExp())));
});

register('->HMS', alias('→HMS'));

register('HMS->', alias('HMS→'));

register('->Q', alias('→Q'));

register('Q->', alias('Q→'));

register('D->HMS', alias('D→HMS'));

register('HMS->D', alias('HMS→D'));

register('ROW->', _rowCompose);

register('->ROW', _rowDecompose);

register('COL->', _colCompose);

register('->COL', _colDecompose);

register('->Qπ', alias('→Qπ'));

register('->TAG', alias('→TAG'));

register('C->P', _cToPOp);

register('P->C', _pToCOp);


// Minimal polynomial of a square matrix, in the CAS variable.
register('PMINI', (s) => {
  const { matrix } = _popSquareMatrix(s);
  if (!giac.isReady()) throw new RPLError('CAS not ready');
  const vx = getCasVx();
  const matStr = _matrixToGiacStr(matrix);
  s.push(Symbolic(giacToAst(giac.caseval(`pmin(${matStr},${vx})`))));
}, { category: 'Vectors / matrices', categoryOrder: 55, label: "PMINI" });


// Giac's SCHUR(A) returns [P, B] with B = inv(P)·A·P and P orthogonal, which is
// HP50's Q (level 2) and T (level 1).
register('SCHUR', (s) => {
  const { matrix } = _popSquareMatrix(s);
  if (!giac.isReady()) throw new RPLError('CAS not ready');
  const matStr = _matrixToGiacStr(matrix);
  const pair = splitGiacList(giac.caseval(`SCHUR(${matStr})`));
  if (pair === null || pair.length !== 2) throw new RPLError('Bad argument value');
  const toMatrix = (mStr) => {
    const rows = splitGiacList(mStr);
    if (rows === null) throw new RPLError('Bad argument value');
    return Matrix(rows.map((rowStr) => {
      const cols = splitGiacList(rowStr);
      if (cols === null) throw new RPLError('Bad argument value');
      return cols.map((c) => _astToRplValue(giacToAst(c)));
    }));
  };
  s.push(toMatrix(pair[0]));
  s.push(toMatrix(pair[1]));
}, { category: 'Vectors / matrices', categoryOrder: 56, label: "SCHUR" });
