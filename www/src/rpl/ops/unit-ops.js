import { isUnit, Real, Unit } from '../types.js';
import { RPLError } from '../stack.js';
import { toBaseUexpr, sameDims, convertValue, divideUexpr, multiplyUexpr } from '../units.js';
import { register } from './registry.js';
import { _inUnit, _makeUnit, _numVal, _scalarBinary, _withListBinary, _withListUnary, _withTaggedBinary, _withTaggedUnary } from './internal.js';



register('UVAL', _withTaggedUnary(_withListUnary((s) => {
  const [u] = s.popN(1);
  if (!isUnit(u)) throw new RPLError('Bad argument type');
  s.push(Real(u.value));
})), { category: 'Units', categoryOrder: 0, label: "UVAL" });


register('UBASE', _withTaggedUnary(_withListUnary((s) => {
  const [u] = s.popN(1);
  if (!isUnit(u)) throw new RPLError('Bad argument type');
  const { uexpr } = toBaseUexpr(u.uexpr);
  s.push(_makeUnit(convertValue(u.value, u.uexpr, uexpr), uexpr));
})), { category: 'Units', categoryOrder: 1, label: "UBASE" });


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


// 1_W 1_N UFACT is 1_N*m/s: the units of level 2 as the unit of level 1 times what is left.
register('UFACT', (s) => {
  const [u, factor] = s.popN(2);
  if (!isUnit(u) || !isUnit(factor)) throw new RPLError('Bad argument type');
  const uexpr = multiplyUexpr(factor.uexpr, divideUexpr(toBaseUexpr(u.uexpr).uexpr, toBaseUexpr(factor.uexpr).uexpr));
  s.push(Unit(_inUnit(u, uexpr), uexpr));
}, { category: 'Units', categoryOrder: 4, label: "UFACT" });


// A change of temperature, not a temperature: the second reading is converted to the
// first one's scale, and an increment is converted as a difference.
function _temperatureStep(sign) {
  return _withTaggedBinary(_withListBinary((s) => {
    const [x, y] = s.popN(2);
    if (isUnit(x) && isUnit(y)) {
      if (!sameDims(x.uexpr, y.uexpr)) throw new RPLError('Inconsistent units');
      const other = sign < 0 ? _inUnit(y, x.uexpr) : _inUnit(y, x.uexpr, { difference: true });
      s.push(_makeUnit(x.value + sign * other, x.uexpr));
      return;
    }
    if (isUnit(x) || isUnit(y)) throw new RPLError('Bad argument type');
    s.push(_scalarBinary(sign < 0 ? '-' : '+', x, y));
  }));
}

register('TDELTA', _temperatureStep(-1), { category: 'Units', categoryOrder: 5, label: "TDELTA" });

register('TINC', _temperatureStep(1), { category: 'Units', categoryOrder: 6, label: "TINC" });
