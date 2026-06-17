import { Stack } from '../www/src/rpl/stack.js';
import { lookup } from '../www/src/rpl/ops.js';
import { Integer, Real, Vector, RList, Complex, Str } from '../www/src/rpl/types.js';
import { setCasModulo } from '../www/src/rpl/state.js';

setCasModulo(7n);
const bad = (v) => v;
function tryOp(op, pushes) {
  const s = new Stack();
  for (const v of pushes) s.push(v);
  try { lookup(op).fn(s); return 'NO THROW -> ' + JSON.stringify(s.toArray ? s.toArray() : '?'); }
  catch (e) { return 'THROW: ' + e.message; }
}
for (const op of ['EXPANDMOD','FACTORMOD']) {
  console.log(op, 'Vector', tryOp(op, [Vector([Real(1),Real(2)])]));
  console.log(op, 'List', tryOp(op, [RList([Integer(1n)])]));
  console.log(op, 'Complex', tryOp(op, [Complex(1,2)]));
  console.log(op, 'String', tryOp(op, [Str('x')]));
}
for (const op of ['GCDMOD','DIVMOD','DIV2MOD']) {
  console.log(op, 'Vec/Int', tryOp(op, [Vector([Real(1),Real(2)]), Integer(3n)]));
  console.log(op, 'Int/Complex', tryOp(op, [Integer(3n), Complex(1,2)]));
  console.log(op, 'List/Int', tryOp(op, [RList([Integer(1n)]), Integer(3n)]));
  console.log(op, 'Str/Int', tryOp(op, [Str('x'), Integer(3n)]));
}
