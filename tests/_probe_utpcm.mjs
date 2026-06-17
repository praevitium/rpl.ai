import { Stack } from '../www/src/rpl/stack.js';
import { lookup } from '../www/src/rpl/ops.js';
import { Real, Integer, RList, Vector, Matrix } from '../www/src/rpl/types.js';

function probe(op, slots) {
  const s = new Stack();
  for (const v of slots) s.push(v);
  try { lookup(op).fn(s); return 'OK -> ' + JSON.stringify(s.pop()); }
  catch (e) { return 'THROW: ' + e.message; }
}
const M = Matrix([[Real(1), Real(2)]]);
const V = Vector([Real(1)]);
console.log('UTPC Z, M(x)   :', probe('UTPC', [Integer(2n), M]));
console.log('UTPC M(nu), Z  :', probe('UTPC', [M, Integer(2n)]));
console.log('UTPC V(nu), Z  :', probe('UTPC', [V, Integer(2n)]));
console.log('UTPT Z, M(x)   :', probe('UTPT', [Integer(3n), M]));
console.log('UTPT M(nu), Z  :', probe('UTPT', [M, Integer(0n)]));
console.log('UTPT V(nu), Z  :', probe('UTPT', [V, Integer(0n)]));
