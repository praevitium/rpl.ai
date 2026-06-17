import { Stack } from '../www/src/rpl/stack.js';
import { lookup } from '../www/src/rpl/ops.js';
import { Integer, Real, isInteger, isReal } from '../www/src/rpl/types.js';

function run(a, b, op) {
  const s = new Stack();
  s.pushMany([a, b]);
  lookup(op).fn(s);
  const r = s.peek();
  return `${r.type}:${isReal(r)?r.value.toString():(isInteger(r)?r.value.toString():'?')}`;
}
// MOD mixed
console.log('Int7 Real3 MOD =', run(Integer(7), Real(3), 'MOD'));
console.log('Real7 Int3 MOD =', run(Real(7), Integer(3), 'MOD'));
console.log('Int-7 Real3 MOD =', run(Integer(-7), Real(3), 'MOD'));
console.log('Real-7 Int3 MOD =', run(Real(-7), Integer(3), 'MOD'));
// MIN/MAX mixed right-operand Integer
console.log('Real9.5 Int5 MIN =', run(Real(9.5), Integer(5), 'MIN'));
console.log('Real9.5 Int5 MAX =', run(Real(9.5), Integer(5), 'MAX'));
console.log('Int5 Real9.5 MIN =', run(Integer(5), Real(9.5), 'MIN'));
