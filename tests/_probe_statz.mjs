import { Stack } from '../www/src/rpl/stack.js';
import { lookup } from '../www/src/rpl/ops.js';
import { Integer, Real } from '../www/src/rpl/types.js';

function run(op, vals) {
  const s = new Stack();
  for (const v of vals) s.push(v);
  lookup(op).fn(s);
  return s.peek();
}
// UTPF with Integer F vs Real F
console.log('UTPF(2,4,Int3)', run('UTPF',[Integer(2n),Integer(4n),Integer(3n)]).value.toNumber());
console.log('UTPF(2,4,Real3)', run('UTPF',[Integer(2n),Integer(4n),Real(3)]).value.toNumber());
console.log('UTPF(5,10,Int0)', run('UTPF',[Integer(5n),Integer(10n),Integer(0n)]).value.toNumber());
// UTPT with Integer t vs Real t
console.log('UTPT(1,Int1)', run('UTPT',[Integer(1n),Integer(1n)]).value.toNumber());
console.log('UTPT(1,Real1)', run('UTPT',[Integer(1n),Real(1)]).value.toNumber());
console.log('UTPT(1,Int-1)', run('UTPT',[Integer(1n),Integer(-1n)]).value.toNumber());
console.log('UTPT(5,Int0)', run('UTPT',[Integer(5n),Integer(0n)]).value.toNumber());
