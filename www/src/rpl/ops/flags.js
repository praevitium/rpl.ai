import { isInteger, isReal, RList, Integer, isList } from '../types.js';
import { RPLError } from '../stack.js';
import { state as _calcState, setUserFlag, clearUserFlag, testUserFlag, clearAllUserFlags } from '../state.js';
import { register } from './registry.js';
import { FALSE, TRUE } from './internal.js';



// User flags are 1..128, system flags -128..-1.
function _flagNumber(v) {
  let n;
  if (isInteger(v))      n = Number(v.value);
  else if (isReal(v))    n = v.value.toNumber();
  else                   throw new RPLError('Bad argument type');
  if (!Number.isInteger(n) || n === 0 || n < -128 || n > 128) {
    throw new RPLError('Bad argument value');
  }
  return n;
}


function _popFlagNumber(s) {
  const [v] = s.popN(1);
  return _flagNumber(v);
}


// FS?C / FC?C report the flag's state before clearing it.
function _testAndClear(s) {
  const n = _popFlagNumber(s);
  const was = testUserFlag(n);
  if (was) clearUserFlag(n);
  return was;
}


register('SF', (s) => {
  const n = _popFlagNumber(s);
  setUserFlag(n);
}, { category: 'Flags', categoryOrder: 0, label: "SF" });


register('CF', (s) => {
  const n = _popFlagNumber(s);
  clearUserFlag(n);
}, { category: 'Flags', categoryOrder: 1, label: "CF" });


register('FS?', (s) => {
  const n = _popFlagNumber(s);
  s.push(testUserFlag(n) ? TRUE : FALSE);
}, { category: 'Flags', categoryOrder: 2, label: "FS?" });


register('FC?', (s) => {
  const n = _popFlagNumber(s);
  s.push(testUserFlag(n) ? FALSE : TRUE);
}, { category: 'Flags', categoryOrder: 3, label: "FC?" });


register('FS?C', (s) => {
  s.push(_testAndClear(s) ? TRUE : FALSE);
}, { category: 'Flags', categoryOrder: 4, label: "FS?C" });


register('FC?C', (s) => {
  s.push(_testAndClear(s) ? FALSE : TRUE);
}, { category: 'Flags', categoryOrder: 5, label: "FC?C" });


// HP50 RCLF returns binary-integer bitmaps; here it is the ascending list of set
// flag numbers, which STOF takes back.
register('RCLF', (s) => {
  const flags = [..._calcState.userFlags].sort((a, b) => a - b);
  s.push(RList(flags.map(n => Integer(BigInt(n)))));
}, { category: 'Flags', categoryOrder: 6, label: "RCLF" });


register('STOF', (s) => {
  const [l] = s.popN(1);
  if (!isList(l)) throw new RPLError('Bad argument type');
  const nums = l.items.map(_flagNumber);
  clearAllUserFlags();
  for (const n of nums) setUserFlag(n);
}, { category: 'Flags', categoryOrder: 7, label: "STOF" });
