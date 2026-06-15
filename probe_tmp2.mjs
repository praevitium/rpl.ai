import { Stack } from './www/src/rpl/stack.js';
import { lookup } from './www/src/rpl/ops.js';
import { Str, Real } from './www/src/rpl/types.js';
function tryOp(name, args){
  const op = lookup(name);
  if(!op){return `${name}: NOT REGISTERED`;}
  const s = new Stack();
  for(const a of args) s.push(a);
  try { op.fn(s); return `${name}: NO THROW -> ${s.peek()&&s.peek().type}`; }
  catch(e){ return `${name}: THROW: ${e.message}`; }
}
// TRUNC: value, ndigits — test String value with valid Real ndigits, and both
console.log(tryOp('TRUNC',[Str('x'), Real(2)]));   // String value
console.log(tryOp('TRUNC',[Real(3.14159), Str('y')])); // String ndigits
// PSI arity check: 1 arg
console.log(tryOp('PSI',[Real(2)]));  // 1 real
console.log(tryOp('PSI',[Real(2), Real(1)])); // 2 real
console.log(tryOp('PSI',[Str('x'), Real(1)])); // string + real
