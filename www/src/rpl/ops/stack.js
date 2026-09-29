import { Integer, isInteger, toRealOrThrow, isTagged, Str } from '../types.js';
import { RPLError } from '../stack.js';
import { register } from './registry.js';



// Values these ops copy or move are already on the stack, so they go back
// through pushMany, which skips the APPROX coercion that push applies.

function _toNonNegIntCount(v) {
  const n = Number(isInteger(v) ? v.value : toRealOrThrow(v));
  if (!Number.isInteger(n) || n < 0) throw new RPLError('Bad argument value');
  return n;
}

function _toPosIntIndex(v) {
  const n = Number(isInteger(v) ? v.value : toRealOrThrow(v));
  if (!Number.isInteger(n) || n < 1) throw new RPLError('Bad argument value');
  return n;
}

register('DUP',   (s) => s.dup(), { category: 'Stack', categoryOrder: 0, label: "DUP" });

register('DROP',  (s) => s.drop(), { category: 'Stack', categoryOrder: 5, label: "DROP" });

register('SWAP',  (s) => s.swap(), { category: 'Stack', categoryOrder: 8, label: "SWAP" });

register('OVER',  (s) => s.over(), { category: 'Stack', categoryOrder: 9, label: "OVER" });

register('ROT',   (s) => s.rot(), { category: 'Stack', categoryOrder: 11, label: "ROT" });

register('DUP2',  (s) => s.dup2(), { category: 'Stack', categoryOrder: 1, label: "DUP2" });

register('DROP2', (s) => s.drop2(), { category: 'Stack', categoryOrder: 6, label: "DROP2" });

register('CLEAR', (s) => s.clear(), { category: 'Stack', categoryOrder: 19, label: "CLEAR" });

register('DEPTH', (s) => s.push(Integer(s.depth)), { category: 'Stack', categoryOrder: 18, label: "DEPTH" });


// Typed or pressed, UNDO / REDO / LASTSTACK run Entry.performUndo / performRedo,
// which restore the variables too.  These registrations serve programs and
// only restore the stack.
register('UNDO',      (s) => s.undo(), { category: 'Stack', categoryOrder: 20, label: "UNDO" });

register('LASTSTACK', (s) => s.undo(), { category: 'Stack', categoryOrder: 22, label: "LASTSTACK" });

register('REDO',      (s) => s.redo(), { category: 'Stack', categoryOrder: 21, label: "REDO" });


register('PICK', (s) => {
  s.pick(_toPosIntIndex(s.pop()));
}, { category: 'Stack', categoryOrder: 13, label: "PICK" });


register('DROPN', (s) => {
  s.dropN(_toNonNegIntCount(s.pop()));
}, { category: 'Stack', categoryOrder: 7, label: "DROPN" });


register('DUPN', (s) => {
  const n = _toNonNegIntCount(s.pop());
  if (s.depth < n) throw new RPLError('Too few arguments');
  if (n === 0) return;
  const copies = [];
  for (let i = n; i >= 1; i--) copies.push(s.peek(i));
  s.pushMany(copies);
}, { category: 'Stack', categoryOrder: 2, label: "DUPN" });


register('DUPDUP', (s) => {
  const v = s.peek(1);
  if (v === undefined) throw new RPLError('Too few arguments');
  s.pushMany([v, v]);
}, { category: 'Stack', categoryOrder: 3, label: "DUPDUP" });


register('NIP', (s) => {
  const [, top] = s.popN(2);
  s.pushMany([top]);
}, { category: 'Stack', categoryOrder: 12, label: "NIP" });


register('PICK3', (s) => {
  s.pick(3);
}, { category: 'Stack', categoryOrder: 14, label: "PICK3" });


register('ROLL', (s) => {
  const n = _toNonNegIntCount(s.pop());
  if (n <= 1) return;
  if (s.depth < n) throw new RPLError('Too few arguments');
  const arr = s._items;
  const [x] = arr.splice(arr.length - n, 1);
  arr.push(x);
  s._emit();
}, { category: 'Stack', categoryOrder: 16, label: "ROLL" });


register('ROLLD', (s) => {
  const n = _toNonNegIntCount(s.pop());
  if (n <= 1) return;
  if (s.depth < n) throw new RPLError('Too few arguments');
  const arr = s._items;
  const top = arr.pop();
  arr.splice(arr.length - (n - 1), 0, top);
  s._emit();
}, { category: 'Stack', categoryOrder: 17, label: "ROLLD" });


// ( … v n → … ): v replaces level n of what remains.
register('UNPICK', (s) => {
  const n = _toPosIntIndex(s.pop());
  if (s.depth <= n) throw new RPLError('Too few arguments');
  const v = s.pop();
  s._items[s._items.length - n] = v;
  s._emit();
}, { category: 'Stack', categoryOrder: 15, label: "UNPICK" });


// ( x n → x … x n ): n copies of x, then n itself.
register('NDUPN', (s) => {
  const n = _toNonNegIntCount(s.pop());
  if (s.depth < 1) throw new RPLError('Too few arguments');
  const x = s.pop();
  s.pushMany(new Array(n).fill(x));
  s.push(Integer(BigInt(n)));
}, { category: 'Stack', categoryOrder: 4, label: "NDUPN" });


function _pushLastArgs(s) {
  if (!s.hasLastArgs()) throw new RPLError('No last arguments');
  s.pushMany(s.getLastArgs());
}

register('LAST',    _pushLastArgs, { category: 'Stack', categoryOrder: 23, label: "LAST" });

register('LASTARG', _pushLastArgs, { category: 'Stack', categoryOrder: 24, label: "LASTARG" });


register('UNDER', (s) => {
  const [v] = s.popN(1);
  if (!isTagged(v)) throw new RPLError('Bad argument type');
  s.push(v.value);
  s.push(Str(v.tag));
}, { category: 'Stack', categoryOrder: 10, label: "UNDER" });
