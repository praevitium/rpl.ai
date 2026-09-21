import { Integer, isInteger, toRealOrThrow, isTagged, Str } from '../types.js';
import { RPLError } from '../stack.js';
import { register } from './registry.js';



/* ------------------------------------------------------------------
   Stack ops
   ------------------------------------------------------------------ */
register('DUP',   (s) => s.dup(), { category: 'Stack', categoryOrder: 0, label: "DUP" });

register('DROP',  (s) => s.drop(), { category: 'Stack', categoryOrder: 5, label: "DROP" });

register('SWAP',  (s) => s.swap(), { category: 'Stack', categoryOrder: 8, label: "SWAP" });

register('OVER',  (s) => s.over(), { category: 'Stack', categoryOrder: 9, label: "OVER" });

register('ROT',   (s) => s.rot(), { category: 'Stack', categoryOrder: 11, label: "ROT" });

register('DUP2',  (s) => s.dup2(), { category: 'Stack', categoryOrder: 1, label: "DUP2" });

register('DROP2', (s) => s.drop2(), { category: 'Stack', categoryOrder: 6, label: "DROP2" });

register('CLEAR', (s) => s.clear(), { category: 'Stack', categoryOrder: 19, label: "CLEAR" });

register('DEPTH', (s) => s.push(Integer(s.depth)), { category: 'Stack', categoryOrder: 18, label: "DEPTH" });


/* ------------------- multi-level UNDO / REDO -----------------------
   Multi-level UNDO/REDO backed by a history stack and a companion
   redo stack.

   Commands:
     `UNDO` / `LASTSTACK` — pop the most recent snapshot and restore.
     `REDO`               — re-apply the most recently undone step.

   `LASTSTACK` is kept as an alias so HP50 user programs that use the
   canonical name still work; its behavior is indistinguishable from
   single-level LASTSTACK until you press UNDO more than once.

   Note: `saveForUndo()` fires BEFORE the op runs inside `execOp`,
   which would make the named invocation a no-op (the snap pushes the
   current stack onto history right before s.undo() pops it back) and
   would skip the var-state half of the undo.  The HIST SHIFT-R keypad
   binding bypasses execOp and calls `e.performUndo()` directly, and
   `Entry.enter()` short-circuits a bare-name UNDO/REDO/LASTSTACK to
   the same path — so typed and pressed UNDO behave identically.  The
   registered ops below still exist so user programs can call them.
   -------------------------------------------------------------------- */
register('UNDO',      (s) => s.undo(), { category: 'Stack', categoryOrder: 20, label: "UNDO" });

register('LASTSTACK', (s) => s.undo(), { category: 'Stack', categoryOrder: 22, label: "LASTSTACK" });

register('REDO',      (s) => s.redo(), { category: 'Stack', categoryOrder: 21, label: "REDO" });


register('PICK', (s) => {
  const n = s.pop();
  const k = Number(isInteger(n) ? n.value : toRealOrThrow(n));
  if (!Number.isInteger(k) || k < 1) throw new RPLError('Bad argument value');
  s.pick(k);
}, { category: 'Stack', categoryOrder: 13, label: "PICK" });


register('DROPN', (s) => {
  const n = s.pop();
  const k = Number(isInteger(n) ? n.value : toRealOrThrow(n));
  if (!Number.isInteger(k) || k < 0) throw new RPLError('Bad argument value');
  s.dropN(k);
}, { category: 'Stack', categoryOrder: 7, label: "DROPN" });


/* =================================================================
   More stack ops (DUPN/NIP/PICK3/ROLL/ROLLD/UNPICK/DUPDUP/NDUPN)
   Complex decomposition (C→R / R→C)
   Real decomposition  (XPON / MANT)
   Numerically-stable log/exp (LNP1 / EXPM)
   Rounding (RND / TRNC)
   Percent family (%, %T, %CH)

   Advanced Guide refs: §3 (stack), §6 (complex), §3.1 (XPON/MANT/
   RND/TRNC/%), §3.1/13.6 (LNP1/EXPM).
   ================================================================= */

// Helpers: pull an Integer count from a stack value.  Rejects non-real,
// non-integer-valued Real, and negative values via out-of-range errors
// that match existing ops in this file (PICK / DROPN).
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


/* --------------- additional stack manipulation ---------------
   DUPN  ( x1 … xn n → x1 … xn x1 … xn )
     Pops the top (must be a non-negative integer), then duplicates
     the top `n` items.  `0 DUPN` is a no-op.
   DUPDUP ( a → a a a )
     Equivalent to DUP DUP.
   NIP   ( a b → b )
     Drops level 2.
   PICK3 ( — → … )
     Shortcut for `3 PICK` (no stack argument).
   ROLL  ( xn … x1 n → xn-1 … x1 xn )
     Pops n, takes level-(n+1), moves it to level 1.  `0 ROLL` is a
     no-op; `1 ROLL` is a no-op (level 1 moves to level 1).
   ROLLD ( xn … x1 n → x1 xn … x2 )  (HP50 docs: "Roll Down")
     Pops n, takes level 1, inserts at level (n+1).  Inverse of ROLL.
   UNPICK ( x_n … x_1 v n → x_n … v … x_1 )
     Pops n (level 1) then v (level 2), writes v back at level n.
     Inverse of PICK.
   NDUPN  ( x n → x x … x n )   (HP49 synonym of DUPN-with-count-on-top)
     Duplicates x  n times and pushes n back.  `x 0 NDUPN` leaves
     `0` on the stack.  Per HP50 AUR p. 2-11 the `n` return is needed
     by variadic programs that dispatched on count.
   ---------------------------------------------------------- */
register('DUPN', (s) => {
  const n = _toNonNegIntCount(s.pop());
  if (s.depth < n) throw new RPLError('Too few arguments');
  if (n === 0) return;
  // Copy the top-N references; stack values are immutable so sharing is safe.
  const copies = [];
  for (let i = n; i >= 1; i--) copies.push(s.peek(i));
  for (const v of copies) s.push(v);
}, { category: 'Stack', categoryOrder: 2, label: "DUPN" });


register('DUPDUP', (s) => {
  const v = s.peek(1);
  if (v === undefined) throw new RPLError('Too few arguments');
  s.push(v);
  s.push(v);
}, { category: 'Stack', categoryOrder: 3, label: "DUPDUP" });


register('NIP', (s) => {
  if (s.depth < 2) throw new RPLError('Too few arguments');
  const top = s.pop();
  s.pop();       // drop former level 2
  s.push(top);
}, { category: 'Stack', categoryOrder: 12, label: "NIP" });


register('PICK3', (s) => {
  s.pick(3);
}, { category: 'Stack', categoryOrder: 14, label: "PICK3" });


register('ROLL', (s) => {
  const n = _toNonNegIntCount(s.pop());
  if (n <= 1) return;                 // 0 and 1 ROLL are no-ops
  if (s.depth < n) throw new RPLError('Too few arguments');
  // Take the level-n item out and push it on top.
  const arr = s._items;               // intentional use of internal for splice
  const idx = arr.length - n;
  const [x] = arr.splice(idx, 1);
  arr.push(x);
  s._emit();
}, { category: 'Stack', categoryOrder: 16, label: "ROLL" });


register('ROLLD', (s) => {
  const n = _toNonNegIntCount(s.pop());
  if (n <= 1) return;                 // 0 and 1 ROLLD are no-ops
  if (s.depth < n) throw new RPLError('Too few arguments');
  // Take level 1 and splice it into the level-n slot.
  const arr = s._items;
  const top = arr.pop();
  arr.splice(arr.length - (n - 1), 0, top);
  s._emit();
}, { category: 'Stack', categoryOrder: 17, label: "ROLLD" });


register('UNPICK', (s) => {
  const n = _toPosIntIndex(s.pop());
  if (s.depth < n) throw new RPLError('Too few arguments');
  if (s.depth < 1) throw new RPLError('Too few arguments');
  const v = s.pop();
  // Write v at level n (1-indexed from top of remaining stack).
  const arr = s._items;
  if (arr.length < n) throw new RPLError('Too few arguments');
  arr[arr.length - n] = v;
  s._emit();
}, { category: 'Stack', categoryOrder: 15, label: "UNPICK" });


register('NDUPN', (s) => {
  const nv = s.pop();
  const n = _toNonNegIntCount(nv);
  if (s.depth < 1) throw new RPLError('Too few arguments');
  const x = s.pop();
  for (let i = 0; i < n; i++) s.push(x);
  s.push(Integer(BigInt(n)));
}, { category: 'Stack', categoryOrder: 4, label: "NDUPN" });



/* =================================================================
   LAST / LASTARG, SNEG / SINV / SCONJ, PGDIR.

   NSUB / ENDSUB live next to DOSUBS (see the list-combinators block
   above) because they share the thread-local `_DOSUBS_STACK` context
   frame with DOSUBS.  The engine-plumbing for LAST / LASTARG —
   Stack.runOp / Stack._lastArgs — lives in `src/rpl/stack.js`; callers
   in `src/ui/entry.js` wrap each user-facing op invocation in runOp
   so LASTARG reflects the most-recent user command.

   Advanced Guide refs:
     §2.2   LASTARG, LAST CMD, LAST STACK (our LAST/LASTARG share
            the LASTARG definition)
     §3     SNEG, SINV, SCONJ — stored-variable in-place mutations
     §7     PGDIR — purge a subdirectory, including non-empty ones
     §15.8  NSUB, ENDSUB — see DOSUBS block above
   ================================================================= */

/* --------------- LAST / LASTARG ---------------
   HP50 AUR §2.2.  Both names resolve to the same op — LAST is the
   HP49g+ short form, LASTARG is spelled out in programs.  Push each
   recorded argument back onto the stack in original level order.
   Throws 'No last arguments' when no op with consumed args has run
   (or after a LASTARG/LAST call itself, which is 0-arg).
   ----------------------------------------------------------------- */
function _pushLastArgs(s) {
  if (!s.hasLastArgs()) throw new RPLError('No last arguments');
  const args = s.getLastArgs();
  for (const v of args) s.push(v);
}

register('LAST',    _pushLastArgs, { category: 'Stack', categoryOrder: 23, label: "LAST" });

register('LASTARG', _pushLastArgs, { category: 'Stack', categoryOrder: 24, label: "LASTARG" });


register('UNDER', (s) => {
  const [v] = s.popN(1);
  if (!isTagged(v)) throw new RPLError('Bad argument type');
  s.push(v.value);
  s.push(Str(v.tag));
}, { category: 'Stack', categoryOrder: 10, label: "UNDER" });
