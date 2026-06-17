import { Stack } from '../www/src/rpl/stack.js';
import { lookup } from '../www/src/rpl/ops.js';
import { Vector, Matrix, Integer, Real } from '../www/src/rpl/types.js';
function show(v){ if(!v) return String(v); if(v.type==='matrix') return 'M'+JSON.stringify(v.rows.map(r=>r.map(e=>e.value?.toString()))); return v.type+' '+(v.value?.toString?.()??''); }
function tryit(label, build){ try{const s=new Stack();build(s);lookup('XROOT').fn(s);console.log(label,'=>',show(s.peek()));}catch(e){console.log(label,'THROW:',e.message);} }
tryit('XROOT M[[1,2],[3,4]] x=1 (1/x=1 whole)', s=>{s.push(Matrix([[Integer(1n),Integer(2n)],[Integer(3n),Integer(4n)]]));s.push(Integer(1n));});
tryit('XROOT M[[2,0],[0,2]] x=1', s=>{s.push(Matrix([[Real(2),Real(0)],[Real(0),Real(2)]]));s.push(Integer(1n));});
// non-square matrix
tryit('XROOT M[[1,2,3]] x=1', s=>{s.push(Matrix([[Real(1),Real(2),Real(3)]]));s.push(Integer(1n));});
