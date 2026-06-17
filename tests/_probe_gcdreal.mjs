import { Stack } from '../www/src/rpl/stack.js';
import { Real, Integer } from '../www/src/rpl/types.js';
import { lookup } from '../www/src/rpl/ops.js';
function fmt(v){ if(typeof v==='string') return v; return v.type+'('+(v.value!==undefined?v.value.toString():'')+')'; }
function run(op, a, b){ const s=new Stack(); s.push(a); s.push(b);
  try { lookup(op).fn(s); return s.peek(); } catch(e){ return 'THROW:'+e.message; } }
console.log('GCD R(12) R(18) =', fmt(run('GCD', Real(12), Real(18))));
console.log('GCD R(12) I(18) =', fmt(run('GCD', Real(12), Integer(18n))));
console.log('GCD I(12) R(18) =', fmt(run('GCD', Integer(12n), Real(18))));
console.log('LCM R(4) R(6)  =', fmt(run('LCM', Real(4), Real(6))));
console.log('LCM R(4) I(6)  =', fmt(run('LCM', Real(4), Integer(6n))));
console.log('GCD R(0) R(7)  =', fmt(run('GCD', Real(0), Real(7))));
console.log('GCD R(1.5) I(3)=', fmt(run('GCD', Real(1.5), Integer(3n))));
console.log('LCM R(4.2) I(6)=', fmt(run('LCM', Real(4.2), Integer(6n))));
