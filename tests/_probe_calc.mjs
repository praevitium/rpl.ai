import { Stack } from '../www/src/rpl/stack.js';
import { lookup } from '../www/src/rpl/ops.js';
import { Vector, RList, Complex, Real, Integer, Matrix, Str } from '../www/src/rpl/types.js';

function tryop(op, val, label){
  const s = new Stack();
  if (val) s.push(val);
  try { lookup(op).fn(s); console.log(op, label, '=> NO THROW, top=', JSON.stringify(s.peek?.()??s.pop?.())); }
  catch(e){ console.log(op, label, '=> throw:', e.message); }
}
const V = Vector([Real(1),Real(2)]);
const L = RList([Integer(1n)]);
const C = Complex(Real(1),Real(2));
const M = Matrix([[Real(1),Real(2)],[Real(3),Real(4)]]);
for (const op of ['INTVX','DERVX','DERIVX','∫']){
  tryop(op, V, 'Vector');
  tryop(op, L, 'List');
  tryop(op, C, 'Complex');
  tryop(op, M, 'Matrix');
  tryop(op, null, 'empty');
}
