import { setApproxMode, getApproxMode, getLastError, clearLastError, ERROR_NUMBERS } from '../state.js';
import { RPLAbort, RPLError } from '../stack.js';
import { Str, BinaryInteger, isInteger, isBinaryInteger, isReal, Program, isString, Integer, Real, Tagged, isVector, isMatrix, Vector, Matrix } from '../types.js';
import { register } from './registry.js';
import { _driveGen, _evalValueGen, _hasSymEntry, _toCountN, _withVMUnary, keepsFailureStack, runIft, runIfte, runSuspendable } from './internal.js';



function evalEntry(s, x) {
  const depth = s.depth;
  runSuspendable(_evalValueGen(s, x, 0, false));
  if (s.depth !== depth + 1) throw new RPLError('Bad argument value');
  return s.pop();
}

// An array with symbolic entries evaluates entry by entry, so [[ X 1 ]] with 3 in X gives [[ 3 1 ]].
function evalArray(s, v) {
  if (isVector(v)) return Vector(v.items.map((x) => evalEntry(s, x)));
  return Matrix(v.rows.map((row) => row.map((x) => evalEntry(s, x))));
}

const isSymbolicArray = (v) => (isVector(v) && _hasSymEntry(v.items)) || (isMatrix(v) && _hasSymEntry(v.rows.flat()));

// The snapshot is taken after the pop, so a failing program is consumed.  A failing
// command or ABORT inside it leaves the stack where the program got to.
function evalOp(s) {
  const v = s.pop();
  const snap = s.save();
  try {
    if (isSymbolicArray(v)) s.push(evalArray(s, v));
    else runSuspendable(_evalValueGen(s, v, 0, false));
  } catch (e) {
    if (!keepsFailureStack(e)) s.restore(snap);
    throw e;
  }
}

register('EVAL', evalOp, { category: 'Evaluation / program', categoryOrder: 0, label: "EVAL" });

// The time comes tagged s, in seconds, as the HP 50g shows it.
register('TEVAL', (s) => {
  const start = performance.now();
  evalOp(s);
  s.push(Tagged('s', Real(((performance.now() - start) / 1000).toFixed(4))));
}, { category: 'Evaluation / program', categoryOrder: 0.5, label: "TEVAL" });


register('APPROX', () => { setApproxMode(true); }, { category: 'Evaluation / program', categoryOrder: 4, label: "APPROX" });

register('EXACT',  () => { setApproxMode(false); }, { category: 'Evaluation / program', categoryOrder: 5, label: "EXACT" });


// An array's entries each become numbers, as on the HP: [ 1/2 `π` ] →NUM gives [ .5 3.14159265359 ].
register('→NUM', _withVMUnary((s) => {
  const prev = getApproxMode();
  setApproxMode(true);
  try {
    evalOp(s);
  } finally {
    setApproxMode(prev);
  }
}), { category: 'Evaluation / program', categoryOrder: 1, label: "→NUM" });


// IFT / IFTE reached by name rather than inside a program body.  The snapshot
// also covers a rejected HALT, which closes the generator without running its catch.
function driveRestoring(s, gen, caller) {
  const snap = s.save();
  try {
    _driveGen(gen, caller);
  } catch (e) {
    if (!keepsFailureStack(e)) s.restore(snap);
    throw e;
  }
}

register('IFT', (s) => driveRestoring(s, runIft(s, 0), 'IFT action'), { category: 'Evaluation / program', categoryOrder: 6, label: "IFT" });

register('IFTE', (s) => driveRestoring(s, runIfte(s, 0), 'IFTE action'), { category: 'Evaluation / program', categoryOrder: 7, label: "IFTE" });


register('ERRM', (s) => {
  const le = getLastError();
  s.push(Str(le ? le.message : ''));
}, { category: 'Evaluation / program', categoryOrder: 8, label: "ERRM" });


register('ERRN', (s) => {
  const le = getLastError();
  s.push(BinaryInteger(le ? le.number : 0, 'h'));
}, { category: 'Evaluation / program', categoryOrder: 9, label: "ERRN" });


register('ERR0', () => {
  clearLastError();
}, { category: 'Evaluation / program', categoryOrder: 10, label: "ERR0" });


register('→PRG', (s) => {
  const n = _toCountN(s.pop());
  if (n === 0) { s.push(Program([])); return; }
  const items = s.popN(n);
  s.push(Program(items));
}, { category: 'Evaluation / program', categoryOrder: 3, label: "→PRG" });


register('NUM', (s) => {
  const v = s.pop();
  if (!isString(v)) throw new RPLError('Bad argument type');
  if (v.value.length === 0) throw new RPLError('Bad argument value');
  const code = v.value.codePointAt(0);
  s.push(Integer(BigInt(code)));
}, { category: 'Lists / strings', categoryOrder: 14, label: "NUM" });


const ERROR_MESSAGES = Object.fromEntries(Object.entries(ERROR_NUMBERS).map(([message, n]) => [n, message]));
const STRING_ERROR = 0x70000;

const numberedError = (message, errorNumber) => Object.assign(new RPLError(message), { errorNumber });

register('DOERR', (s) => {
  const [v] = s.popN(1);
  if (isString(v)) {
    throw v.value === '' ? new RPLError('Interrupted') : numberedError(v.value, STRING_ERROR);
  }
  if (isInteger(v) || isReal(v) || isBinaryInteger(v)) {
    const code = isReal(v) ? v.value.toNumber() : Number(v.value);
    if (code === 0) return;
    throw numberedError(ERROR_MESSAGES[code] || `Error #${code.toString(16).toUpperCase()}h`, code);
  }
  throw new RPLError('Bad argument type');
}, { category: 'Evaluation / program', categoryOrder: 11, label: "DOERR" });
