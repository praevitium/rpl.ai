import { lookup } from '../www/src/rpl/ops.js';
import { Stack } from '../www/src/rpl/stack.js';
import { Integer } from '../www/src/rpl/types.js';
function run(op, x, n){ const s=new Stack(); s.push(x); s.push(n); lookup(op).fn(s); return s.pop(); }
for (const op of ['TRNC','TRUNC','RND']) {
  for (const [x,n] of [[123n,-1n],[1250n,-2n],[7n,-1n]]) {
    let r; try { r = run(op, Integer(x), Integer(n)); } catch(e){ r = 'ERR '+e.message; }
    console.log(`${op}(Integer(${x}), ${n}) ->`, r && r.type ? `${r.type}(${r.value})` : r);
  }
}
