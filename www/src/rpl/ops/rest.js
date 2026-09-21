import { isBinaryInteger, Real, isInteger, isReal, BinaryInteger, Integer, Symbolic, Matrix } from '../types.js';
import { RPLError } from '../stack.js';
import { getBinaryBase, REAL_MAX_EXP_MIN, REAL_MAX_EXP_MAX, setRealMaxExp, getRealMaxExp, getCasVx } from '../state.js';
import { giac } from '../cas/giac-engine.mjs';
import { giacToAst, splitGiacList } from '../cas/giac-convert.mjs';
import { register, lookup, OPS } from './registry.js';
import { _astToRplValue, _cToPOp, _cToROp, _colCompose, _colDecompose, _fromArrayOp, _fromListOp, _fromStrOp, _fromVecOp, _hmsToHours, _hmsUnary, _hoursToHms, _mask, _matrixToGiacStr, _pToCOp, _popSquareMatrix, _rToCOp, _rowCompose, _rowDecompose, _toArrayOp, _toListOp, _toStrOp, _toV2Op, _toV3Op, unaryReal } from './internal.js';


// ASCII-friendly aliases matching what a user can type from a keyboard.
register('R->D', unaryReal(r => r * 180 / Math.PI));

register('D->R', unaryReal(d => d * Math.PI / 180));

// Ascii alias — so users on keyboards without `→` can type `->NUM` or
// `NUM` and still reach the op via the entry line.  Mirrors the style
// used for `→LIST`, `→STR` elsewhere in the registry.
register('->NUM', (s, entry) => { OPS.get('→NUM').fn(s, entry); });

register('B->R', (s) => {          // ASCII alias
  const v = s.pop();
  if (!isBinaryInteger(v)) throw new RPLError('Bad argument type');
  s.push(Real(Number(v.value & _mask())));
});

register('R->B', (s) => {          // ASCII alias
  const v = s.pop();
  let n;
  if (isInteger(v))       n = v.value;
  else if (isReal(v))     n = BigInt(v.value.trunc().toFixed(0));
  else throw new RPLError('Bad argument type');
  const m = _mask();
  const payload = n & m;
  const base = getBinaryBase() || 'h';
  s.push(BinaryInteger(payload, base));
});

register('->UNIT', (s) => OPS.get('→UNIT').fn(s));


/* The HP50 token `∫` decompiles to the integration function.  The AUR
   shows it as a 4-arg form (lower upper integrand var → ∫); this app
   only ships the 2-arg INTEG semantics so we register the glyph as an
   alias for INTEG.  Programs that produce `∫` from the keyboard or via
   `→PRG` therefore still execute. */
register('∫', (s) => { OPS.get('INTEG').fn(s); });

register('DERIVX', (s) => { OPS.get('DERVX').fn(s); });

register('->LIST', _toListOp);

register('LIST->', _fromListOp);

register('OBJ->', (s) => OPS.get('OBJ→').fn(s));

register('->PRG', (s) => OPS.get('→PRG').fn(s));

register('->ARRY', _toArrayOp);

register('ARRY->', _fromArrayOp);

register('->STR', _toStrOp);

register('STR->', _fromStrOp);

register('->V2', _toV2Op);

register('->V3', _toV3Op);

register('V->', _fromVecOp);

register('R->C', _rToCOp);

register('C->R', _cToROp);


/* --------------- STMXE / RCMXE — configure max Real exponent --------
   rpl5050 extension (no HP50 equivalent).  `STMXE` pops an Integer or
   Real from level 1, validates it, and sets `realMaxExp` — the exponent
   magnitude that defines both MAXR/MINR and the Decimal overflow limit.
   `RCMXE` pushes the current setting as an Integer.

   Legal range: REAL_MAX_EXP_MIN (10) .. REAL_MAX_EXP_MAX (9e15).
   ---------------------------------------------------------------- */
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

register('->HMS', _hmsUnary('->HMS', (h) => _hoursToHms(h)));

register('HMS->', _hmsUnary('HMS->', (h) => _hmsToHours(h)));

register('->Q', (s) => { lookup('→Q').fn(s); });

register('Q->', (s) => { lookup('Q→').fn(s); });

register('D->HMS', _hmsUnary('D->HMS', (h) => _hoursToHms(h)));

register('HMS->D', _hmsUnary('HMS->D', (h) => _hmsToHours(h)));

register('ROW->', _rowDecompose);

register('->ROW', _rowCompose);

register('COL->', _colDecompose);

register('->COL', _colCompose);

register('->Qπ', (s) => { lookup('→Qπ').fn(s); });

register('->TAG', (s) => { lookup('→TAG').fn(s); });

register('C->P', _cToPOp);

register('P->C', _pToCOp);


/* `PMINI` — minimal polynomial of a square matrix (HP50 AUR §3-172).
   Sibling of PCAR: same `_popSquareMatrix` validator and
   `_matrixToGiacStr` serialization, routed through Giac `pmin(M,vx)`
   instead of `charpoly`.  Returns a Symbolic in the CAS variable; it is
   also JORDAN's level-4 output.  No-fallback: `!giac.isReady()` ⇒
   `CAS not ready`. */
register('PMINI', (s) => {
  const { matrix } = _popSquareMatrix(s);
  if (!giac.isReady()) throw new RPLError('CAS not ready');
  const vx = getCasVx();
  const matStr = _matrixToGiacStr(matrix);
  s.push(Symbolic(giacToAst(giac.caseval(`pmin(${matStr},${vx})`))));
});


/* ------------------------------------------------------------------
   SCHUR   (HP50 AUR §3-218)
   Schur decomposition of a square matrix.

     Input :  level 1 = [[ M ]]   (n × n)
     Output:  level 2 = [[ Q ]]   (orthogonal / unitary)
              level 1 = [[ T ]]   (upper quasi-triangular)
   such that  M = Q · T · TRN(Q).

   Giac exposes `SCHUR(A) = hessenberg(A,-1)`, returning the pair
   `[P, B]` with `B = inv(P)·A·P`.  P is orthogonal, so `inv(P) =
   TRN(P)` and the identity matches HP50's Q / T exactly (P↔Q, B↔T).
   Both matrices flow through the same `_matrixToGiacStr` /
   `_astToRplValue` pipeline as EGV; a non-pair / non-matrix shape from
   Giac surfaces `Bad argument value`.  No-fallback: `!giac.isReady()`
   ⇒ `CAS not ready`.
   ------------------------------------------------------------------ */
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
});
