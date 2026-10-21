import { Real, RList, isReal, isInteger } from '../types.js';
import { register, lookup } from './registry.js';
import { RPLError } from '../stack.js';
import { inScratchState } from '../state.js';
import { parseTyped } from '../parser.js';
import { storeVar } from './internal.js';
import { constantValue } from './unit-ops.js';
import { mesSetup } from './root.js';
import { librarySet } from '../eqlib.js';

const parseEq = (src) => parseTyped(`'${src}'`)[0];

// SOLVEQN's work: EQ, the set's constants stored as plain SI numbers and marked known, and Mpar titled after the set.
export function solveSet(subject, title) {
  const set = librarySet(subject, title);
  if (!set) throw new RPLError('SOLVEQN: Bad argument value');
  const eqs = set.eqs.map(parseEq);
  for (const id of set.known) storeVar(id, Real(Number(constantValue(id).value)));
  storeVar('EQ', eqs.length === 1 ? eqs[0] : RList(eqs));
  mesSetup(eqs, set.title, set.known);
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
