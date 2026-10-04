import { setApproxMode, getApproxMode, getLastError, clearLastError } from '../state.js';
import { RPLAbort, RPLError } from '../stack.js';
import { Str, BinaryInteger, isInteger, isBinaryInteger, isReal, Program, isString, Integer } from '../types.js';
import { register } from './registry.js';
import { _driveGen, _evalValueGen, _toCountN, keepsTrapStack, runIft, runIfte, runSuspendable } from './internal.js';



// The snapshot is taken after the pop, so a failing program is consumed while its
// partial pushes are undone.  ABORT keeps the stack as it was at the abort.
function evalOp(s) {
  const v = s.pop();
  const snap = s.save();
  try {
    runSuspendable(_evalValueGen(s, v, 0, false));
  } catch (e) {
    if (!keepsTrapStack(e)) s.restore(snap);
    throw e;
  }
}

register('EVAL', evalOp, { category: 'Evaluation / program', categoryOrder: 0, label: "EVAL" });


register('APPROX', () => { setApproxMode(true); }, { category: 'Evaluation / program', categoryOrder: 4, label: "APPROX" });

register('EXACT',  () => { setApproxMode(false); }, { category: 'Evaluation / program', categoryOrder: 5, label: "EXACT" });


register('→NUM', (s) => {
  const prev = getApproxMode();
  setApproxMode(true);
  try {
    evalOp(s);
  } finally {
    setApproxMode(prev);
  }
}, { category: 'Evaluation / program', categoryOrder: 1, label: "→NUM" });


// IFT / IFTE reached by name rather than inside a program body.  The snapshot
// also covers a rejected HALT, which closes the generator without running its catch.
function driveRestoring(s, gen, caller) {
  const snap = s.save();
  try {
    _driveGen(gen, caller);
  } catch (e) {
    if (!keepsTrapStack(e)) s.restore(snap);
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


// The inverse of setLastError's message → number table in state.js.
const ERROR_MESSAGES = {
  0x201: 'Too few arguments',
  0x202: 'Bad argument type',
  0x203: 'Bad argument value',
  0x204: 'Undefined name',
  0x303: 'Division by zero',
  0x305: 'Infinite result',
  0x501: 'Name conflict',
  0x502: 'Directory not allowed',
  0x503: 'Directory not empty',
};

register('DOERR', (s) => {
  const [v] = s.popN(1);
  if (isString(v)) {
    throw new RPLError(v.value === '' ? 'Interrupted' : v.value);
  }
  if (isInteger(v) || isReal(v) || isBinaryInteger(v)) {
    const code = isReal(v) ? v.value.toNumber() : Number(v.value);
    if (code === 0) return;
    throw new RPLError(ERROR_MESSAGES[code] || `Error: #${code.toString(16).toUpperCase()}h`);
  }
  throw new RPLError('Bad argument type');
}, { category: 'Evaluation / program', categoryOrder: 11, label: "DOERR" });
