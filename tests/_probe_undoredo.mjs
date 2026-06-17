import { Stack } from '../www/src/rpl/stack.js';
import { lookup } from '../www/src/rpl/ops.js';
import { Integer } from '../www/src/rpl/types.js';

function tryOp(name, s) {
  try { lookup(name).fn(s); return 'ok'; } catch (e) { return e.message; }
}

let s = new Stack();
s.push(Integer(1n)); s.push(Integer(2n));
s.saveForUndo();
s.push(Integer(3n));
console.log('UNDO op:', tryOp('UNDO', s), 'depth', s.depth, 'peek', s.peek(1).value, s.peek(2).value);
console.log('REDO op:', tryOp('REDO', s), 'depth', s.depth, 'peek1', s.peek(1).value);

s = new Stack();
s.push(Integer(5n));
console.log('UNDO empty:', tryOp('UNDO', s));
console.log('REDO empty:', tryOp('REDO', s));

// new save invalidates redo
s = new Stack();
s.push(Integer(1n)); s.saveForUndo(); s.push(Integer(2n));
lookup('UNDO').fn(s);            // back to (1), redo has (1 2)
s.saveForUndo(); s.push(Integer(9n)); // new action kills redo
console.log('REDO after new save:', tryOp('REDO', s));
