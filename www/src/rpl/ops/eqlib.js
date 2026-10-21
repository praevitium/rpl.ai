import { Real, RList, isReal, isInteger } from '../types.js';
import { register, lookup } from './registry.js';
import { RPLError } from '../stack.js';
import { inScratchState } from '../state.js';
import { parseTyped } from '../parser.js';
import { freeVars } from '../algebra.js';
import { storeVar } from './internal.js';
import { constantValue } from './unit-ops.js';
import { mesSetup } from './root.js';
import { librarySet } from '../eqlib.js';

// The constants a set may use; they come in as plain SI values, since the solver works in numbers.
const CONSTANTS = ['g', 'G', 'c', 'ε0', 'μ0', 'σ', 'R', 'NA', 'c3'];
const parseEq = (src) => parseTyped(`'${src}'`)[0];

// SOLVEQN's work: EQ, the set's constants stored and marked known, and Mpar titled after the set.
export function solveSet(subject, title) {
  const set = librarySet(subject, title);
  if (!set) throw new RPLError('SOLVEQN: Bad argument value');
  if (!set.eqs.length) throw new RPLError(`SOLVEQN: ${set.title} is not in the library yet`);
  const eqs = set.eqs.map(parseEq);
  const names = new Set(eqs.flatMap((eq) => [...freeVars(eq.expr)]));
  const known = CONSTANTS.filter((id) => names.has(id));
  for (const id of known) storeVar(id, Real(Number(constantValue(id).value)));
  storeVar('EQ', eqs.length === 1 ? eqs[0] : RList(eqs));
  mesSetup(eqs, set.title, known);
  return set;
}

register('SOLVEQN', (s) => {
  const [n, m, pict] = s.popN(3);
  const num = (v) => (isReal(v) || isInteger(v) ? Number(v.value) : NaN);
  if (![n, m, pict].every((v) => Number.isFinite(num(v)))) throw new RPLError('SOLVEQN: Bad argument type');
  solveSet(num(n), num(m));
  lookup('MSOLVR').fn(s);
}, { category: 'CAS / symbolic', categoryOrder: 10.77, label: 'SOLVEQN' });

let _libraryHook = null;

export function setLibraryHook(fn) {
  _libraryHook = typeof fn === 'function' ? fn : null;
}

register('EQNLIB', () => {
  if (!inScratchState()) _libraryHook?.();
}, { category: 'CAS / symbolic', categoryOrder: 10.78, label: 'EQNLIB' });
