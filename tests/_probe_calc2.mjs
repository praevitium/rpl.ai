import { Stack } from '../www/src/rpl/stack.js';
import { lookup } from '../www/src/rpl/ops.js';
import { Vector, RList, Complex, Real, Integer, Matrix, Name, Str } from '../www/src/rpl/types.js';
function tryop(op, vals, label){
  const s = new Stack();
  for (const v of vals) s.push(v);
  try { lookup(op).fn(s); console.log(op, label, '=> NO THROW'); }
  catch(e){ console.log(op, label, '=> throw:', e.message); }
}
const V = Vector([Real(1),Real(2)]);
// expr=Vector, var=Name('X') -> bad expr type
tryop('∫', [V, Name('X')], 'Vector-expr,Name-var');
tryop('∫', [RList([Integer(1n)]), Name('X')], 'List-expr,Name-var');
tryop('∫', [Complex(Real(1),Real(2)), Name('X')], 'Complex-expr,Name-var');
tryop('∫', [Matrix([[Real(1)]]), Name('X')], 'Matrix-expr,Name-var');
// bad var type
tryop('∫', [Real(2), V], 'Real-expr,Vector-var');
