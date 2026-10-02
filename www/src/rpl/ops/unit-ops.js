import { isUnit, Real, Unit } from '../types.js';
import { RPLError } from '../stack.js';
import { toBaseUexpr, sameDims, convertValue } from '../units.js';
import { register } from './registry.js';
import { _inUnit, _makeUnit, _numVal } from './internal.js';



register('UVAL', (s) => {
  const [u] = s.popN(1);
  if (!isUnit(u)) throw new RPLError('Bad argument type');
  s.push(Real(u.value));
}, { category: 'Units', categoryOrder: 0, label: "UVAL" });


register('UBASE', (s) => {
  const [u] = s.popN(1);
  if (!isUnit(u)) throw new RPLError('Bad argument type');
  const { uexpr } = toBaseUexpr(u.uexpr);
  s.push(_makeUnit(convertValue(u.value, u.uexpr, uexpr), uexpr));
}, { category: 'Units', categoryOrder: 1, label: "UBASE" });


register('→UNIT', (s) => {
  const [x, u] = s.popN(2);
  if (!isUnit(u)) throw new RPLError('Bad argument type');
  s.push(Unit(_numVal(x), u.uexpr));
}, { category: 'Units', categoryOrder: 2, label: "→UNIT" });


// Only the second unit's expression matters, not its value.
register('CONVERT', (s) => {
  const [u1, u2] = s.popN(2);
  if (!isUnit(u1) || !isUnit(u2)) throw new RPLError('Bad argument type');
  if (!sameDims(u1.uexpr, u2.uexpr)) throw new RPLError('Inconsistent units');
  s.push(Unit(_inUnit(u1, u2.uexpr), u2.uexpr));
}, { category: 'Units', categoryOrder: 3, label: "CONVERT" });
