import { Stack } from './www/src/rpl/stack.js';
import { lookup } from './www/src/rpl/ops.js';
import { Str } from './www/src/rpl/types.js';
const unary = ['ERF','ERFC','GAMMA','LNGAMMA','HEAVISIDE','DIRAC','XPON','MANT','ZETA','LAMBERT','PSI','TRUNC'];
const two = ['UTPC','UTPT','BETA'];
const three = ['UTPF'];
function tryOp(name, n){
  const op = lookup(name);
  if(!op){return `${name}: NOT REGISTERED`;}
  const s = new Stack();
  for(let i=0;i<n;i++) s.push(Str('x'));
  try { op.fn(s); return `${name}(${n} str): NO THROW -> top type=${s.peek()&&s.peek().type}`; }
  catch(e){ return `${name}(${n} str): THROW: ${e.message}`; }
}
for(const nm of unary) console.log(tryOp(nm,1));
console.log('---two---');
for(const nm of two) console.log(tryOp(nm,2));
console.log('---three---');
for(const nm of three) console.log(tryOp(nm,3));
