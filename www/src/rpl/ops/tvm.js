import { RPLError } from '../stack.js';
import { Real, isReal, isInteger, isName } from '../types.js';
import { setUserFlag, clearUserFlag, testUserFlag } from '../state.js';
import { register } from './registry.js';
import { recallVar, storeVar } from './internal.js';
import { findRoot } from './root.js';

const SOLVABLE = ['N', 'I%YR', 'PV', 'PMT', 'FV'];
const BEGIN_FLAG = -14;

function tvmValue(id) {
  const v = recallVar(id);
  if (v === undefined && id === 'PYR') return 12;
  if (v === undefined) throw new RPLError(`TVMROOT: Undefined Name ${id}`);
  if (!(isReal(v) || isInteger(v))) throw new RPLError(`TVMROOT: Bad argument type in ${id}`);
  return Number(v.value);
}

// What the cash flows come to at the start: zero when the TVM variables agree. Money received is positive and money
// paid out negative; payments fall at each period's end, or its start with flag -14 set (TVMBEG).
function balance(t, begin) {
  const i = t['I%YR'] / 100 / t.PYR;
  if (i === 0) return t.PV + t.PMT * t.N + t.FV;
  const grow = Math.log1p(i);
  return t.PV + t.PMT * (1 + i * begin) * -Math.expm1(-t.N * grow) / i + t.FV * Math.exp(-t.N * grow);
}

function periods(t, begin) {
  const i = t['I%YR'] / 100 / t.PYR;
  if (i === 0) return -(t.PV + t.FV) / t.PMT;
  const a = t.PMT * (1 + i * begin) / i;
  return -Math.log((t.PV + a) / (a - t.FV)) / Math.log1p(i);
}

function solve(t, id, begin) {
  if (id === 'N') return periods(t, begin);
  const at = (x) => balance({ ...t, [id]: x }, begin);
  if (id !== 'I%YR') { const a = at(0); return -a / (at(1) - a); }
  let rate;
  try { rate = findRoot(at, [t['I%YR'] || 10]); } catch { rate = NaN; }
  const scale = Math.abs(t.PV) + Math.abs(t.PMT * t.N) + Math.abs(t.FV);
  return Math.abs(at(rate)) <= 1e-9 * scale ? rate : NaN;
}

// The HP's time value of money: the variable named on level 1 is solved from the others and stored back.
register('TVMROOT', (s) => {
  const name = s.peek();
  if (!isName(name)) throw new RPLError('TVMROOT: Bad argument type');
  if (!SOLVABLE.includes(name.id)) throw new RPLError('TVMROOT: Bad argument value');
  const t = Object.fromEntries([...SOLVABLE, 'PYR'].map((id) => [id, id === name.id ? 0 : tvmValue(id)]));
  const x = solve(t, name.id, testUserFlag(BEGIN_FLAG) ? 1 : 0);
  if (!Number.isFinite(x)) throw new RPLError('TVMROOT: No solution');
  s.pop();
  storeVar(name.id, Real(x));
  s.push(Real(x));
}, { category: 'Finance', categoryOrder: 0, label: 'TVMROOT' });

register('TVMBEG', () => setUserFlag(BEGIN_FLAG), { category: 'Finance', categoryOrder: 1, label: 'TVMBEG' });
register('TVMEND', () => clearUserFlag(BEGIN_FLAG), { category: 'Finance', categoryOrder: 2, label: 'TVMEND' });
