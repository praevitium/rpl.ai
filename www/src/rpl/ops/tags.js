import { Real, isString, isName, isTagged, Tagged, isSymbolic, isNumber, isUnit } from '../types.js';
import { RPLError } from '../stack.js';
import { register } from './registry.js';
import { _hp50TypeCode, _astToRplValue, recallVar } from './internal.js';



// KIND shares TYPE's codes until the type table needs finer distinctions.
function _typeCodeOp(s) {
  const [v] = s.popN(1);
  s.push(Real(_hp50TypeCode(v)));
}

register('TYPE', _typeCodeOp, { category: 'Types & tags', categoryOrder: 0, label: "TYPE" });


function _asTagString(v) {
  if (isString(v)) return v.value;
  if (isName(v))   return v.id;
  throw new RPLError('Bad argument type');
}


// A tagged value gets its tag replaced rather than a second tag.
register('→TAG', (s) => {
  const [val, tagV] = s.popN(2);
  const tag = _asTagString(tagV);
  s.push(Tagged(tag, isTagged(val) ? val.value : val));
}, { category: 'Types & tags', categoryOrder: 3, label: "→TAG" });


register('DTAG', (s) => {
  const [v] = s.popN(1);
  s.push(isTagged(v) ? v.value : v);
}, { category: 'Types & tags', categoryOrder: 4, label: "DTAG" });


register('VTYPE', (s) => {
  const [nameV] = s.popN(1);
  if (!isName(nameV)) throw new RPLError('Bad argument type');
  const stored = recallVar(nameV.id);
  s.push(Real(stored === undefined ? -1 : _hp50TypeCode(stored)));
}, { category: 'Types & tags', categoryOrder: 2, label: "VTYPE" });


register('KIND', _typeCodeOp, { category: 'Types & tags', categoryOrder: 1, label: "KIND" });


register('EQ→', (s) => {
  const [v] = s.popN(1);
  if (isSymbolic(v) && v.expr.kind === 'bin' && v.expr.op === '=') {
    s.push(_astToRplValue(v.expr.l));
    s.push(_astToRplValue(v.expr.r));
    return;
  }
  if (!isSymbolic(v) && !isName(v) && !isNumber(v) && !isUnit(v)) throw new RPLError('Bad argument type');
  s.push(v);
  s.push(Real(0));
}, { category: 'Types & tags', categoryOrder: 5, label: "EQ→" });
