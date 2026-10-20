import { RPLError } from '../stack.js';
import { Real, isReal, isInteger, isName } from '../types.js';
import { setUserFlag, clearUserFlag, testUserFlag } from '../state.js';
import { register } from './registry.js';
import { recallVar, storeVar } from './internal.js';
import { findRoot } from './root.js';

const SOLVABLE = ['N', 'I%YR', 'PV', 'PMT', 'FV'];
const BEGIN_FLAG = -14;

function tvmValue(id, cmd) {
  const v = recallVar(id);
  if (v === undefined && id === 'PYR') return 12;
  if (v === undefined) throw new RPLError(`${cmd}: Undefined Name ${id}`);
  if (!(isReal(v) || isInteger(v))) throw new RPLError(`${cmd}: Bad argument type in ${id}`);
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
  s.need(1);
  const name = s.peek();
  if (!isName(name)) throw new RPLError('TVMROOT: Bad argument type');
  if (!SOLVABLE.includes(name.id)) throw new RPLError('TVMROOT: Bad argument value');
  const t = Object.fromEntries([...SOLVABLE, 'PYR'].map((id) => [id, id === name.id ? 0 : tvmValue(id, 'TVMROOT')]));
  const x = solve(t, name.id, testUserFlag(BEGIN_FLAG) ? 1 : 0);
  if (!Number.isFinite(x)) throw new RPLError('TVMROOT: No solution');
  s.pop();
  storeVar(name.id, Real(x));
  s.push(Real(x));
}, { category: 'Finance', categoryOrder: 0, label: 'TVMROOT' });

// The first n payments split into what went to principal and what to interest, with the balance left, signed as
// PV is; I%YR, PV, PMT and PYR come from their variables.
register('AMORT', (s) => {
  s.need(1);
  const count = s.peek();
  if (!(isReal(count) || isInteger(count))) throw new RPLError('AMORT: Bad argument type');
  const n = Number(count.value);
  if (n < 0) throw new RPLError('AMORT: Bad argument value');
  const t = Object.fromEntries(['I%YR', 'PV', 'PMT', 'PYR'].map((id) => [id, tvmValue(id, 'AMORT')]));
  const i = t['I%YR'] / 100 / t.PYR;
  const grown = i === 0 ? 1 : Math.exp(n * Math.log1p(i));
  const paid = i === 0 ? t.PMT * n : t.PMT * (1 + i * (testUserFlag(BEGIN_FLAG) ? 1 : 0)) * Math.expm1(n * Math.log1p(i)) / i;
  const left = t.PV * grown + paid;
  const principal = i === 0 ? paid : left - t.PV;
  s.pop();
  s.push(Real(principal));
  s.push(Real(t.PMT * n - principal));
  s.push(Real(left));
}, { category: 'Finance', categoryOrder: 3, label: 'AMORT' });

register('TVMBEG', () => setUserFlag(BEGIN_FLAG), { category: 'Finance', categoryOrder: 1, label: 'TVMBEG' });
register('TVMEND', () => clearUserFlag(BEGIN_FLAG), { category: 'Finance', categoryOrder: 2, label: 'TVMEND' });
