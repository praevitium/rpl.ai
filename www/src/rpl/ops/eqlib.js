import { Real, RList, isReal, isInteger } from '../types.js';
import { register, lookup } from './registry.js';
import { RPLError } from '../stack.js';
import { inScratchState } from '../state.js';
import { parseTyped } from '../parser.js';
import { storeVar } from './internal.js';
import { constantValue } from './unit-ops.js';
import { mesSetup, mesItems } from './root.js';
import { librarySet } from '../eqlib.js';

const parseEq = (src) => parseTyped(`'${src}'`)[0];

// A set parsed, its constants as the plain SI numbers the solver works in.
function parsedSet(subject, title) {
  const set = librarySet(subject, title);
  if (!set) throw new RPLError('SOLVEQN: Bad argument value');
  const known = Object.fromEntries(set.known.map((id) => [id, Real(Number(constantValue(id).value))]));
  return { ...set, eqs: set.eqs.map(parseEq), known };
}

// The set's variables in the solver's key order, with the values of the constants among them.
export function setVariables(subject, title) {
  const set = parsedSet(subject, title);
  return { names: mesItems(set.eqs), known: set.known };
}

// One equation of a set, parsed, for the sheet's tap to put it on the stack as the HP's →STK key does.
export function libraryEquation(subject, title, index) {
  return parsedSet(subject, title).eqs[index];
}

// SOLVEQN's work: EQ, the set's constants stored and marked known, and Mpar titled after the set.
export function solveSet(subject, title) {
  const set = parsedSet(subject, title);
  for (const [id, v] of Object.entries(set.known)) storeVar(id, v);
  storeVar('EQ', set.eqs.length === 1 ? set.eqs[0] : RList(set.eqs));
  mesSetup(set.eqs, set.title, Object.keys(set.known));
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
