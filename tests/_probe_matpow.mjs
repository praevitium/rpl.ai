import { runOp } from './helpers.mjs';
import { Matrix, Vector, Integer } from '../www/src/rpl/types.js';
function M(){ return Matrix([[Integer(1n),Integer(2n)],[Integer(3n),Integer(4n)]]); }
function show(v){ return JSON.stringify(v, (k,val)=> typeof val==='bigint'? val.toString()+'n': val); }
for (const [lbl, base, exp] of [
  ['M^2', M(), Integer(2n)],
  ['M^0', M(), Integer(0n)],
  ['M^1', M(), Integer(1n)],
  ['M^3', M(), Integer(3n)],
  ['V^2', Vector([Integer(2n),Integer(3n)]), Integer(2n)],
  ['M(2x3)^2', Matrix([[Integer(1n),Integer(2n),Integer(3n)],[Integer(4n),Integer(5n),Integer(6n)]]), Integer(2n)],
]) {
  try { console.log(lbl, '=', show(runOp('^', base, exp))); }
  catch(e){ console.log(lbl, 'ERR', e.message); }
}
