/* The RPL stack.  Level 1 is the "top" (bottom of the LCD); internally
   stored as a JS array where index length-1 == level 1. */

/* Push-time coercion hook.
   APPROX mode (flag -105 SET) collapses Integer/Rational/purely-numeric
   Symbolic values to Real on the way onto the stack — "fractions and
   integers are converted to decimal upon entry, in expressions too."
   The hook is installed by ops.js at module load (ops.js owns the type
   predicates and the algebra eval engine the coercion needs).  Until
   installed, `push` is the identity — keeps the parser and standalone
   stack tests mode-agnostic, matches prior behavior.

   pushMany and the internal `_items.push` paths (save/restore, stack
   ops like DUP/ROT/OVER) deliberately BYPASS the coercion: those move
   values already on the stack; they don't introduce fresh ones.  If a
   value landed as Integer while EXACT was active and the user later
   flips to APPROX, a DUP should duplicate the Integer as-is. */
let _pushCoerce = (v) => v;
export function setPushCoerce(fn) {
  _pushCoerce = (typeof fn === 'function') ? fn : ((v) => v);
}

export class Stack {
  constructor() {
    this._items = [];              // _items[len-1] is level 1
    this._listeners = new Set();
  }

  subscribe(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }
  _emit() {
    for (const fn of this._listeners) {
      try { fn(this); } catch (e) { console.error('stack listener', e); }
    }
  }

  get depth() { return this._items.length; }

  /** Level N (1-indexed).  Returns undefined if beyond depth. */
  peek(level = 1) {
    if (level < 1) throw new RangeError('level must be >= 1');
    return this._items[this._items.length - level];
  }

  /** Array snapshot ordered level-1-first.  Handy for rendering. */
  snapshot() {
    return [...this._items].reverse();
  }

  push(value) {
    this._items.push(_pushCoerce(value));
    this._emit();
  }

  pushMany(values) {
    for (const v of values) this._items.push(v);
    this._emit();
  }

  pop() {
    if (this._items.length === 0) throw new RPLError('Too few arguments');
    const v = this._items.pop();
    this._emit();
    return v;
  }

  /** Pop N values.  Returns them in stack-natural order: result[0] is
   *  what was at level N, result[N-1] is what was at level 1. */
  popN(n) {
    if (this._items.length < n) throw new RPLError('Too few arguments');
    const out = this._items.splice(this._items.length - n, n);
    this._emit();
    return out;
  }

  clear() {
    this._items.length = 0;
    this._emit();
  }

  dup()  { if (!this.depth) throw new RPLError('Too few arguments');
           this._items.push(this._items[this._items.length - 1]); this._emit(); }

  drop() { this.pop(); }

  swap() {
    const n = this._items.length;
    if (n < 2) throw new RPLError('Too few arguments');
    [this._items[n - 1], this._items[n - 2]] = [this._items[n - 2], this._items[n - 1]];
    this._emit();
  }

  /** ROT: level 3 becomes level 1 ( a b c -> b c a ) */
  rot() {
    const n = this._items.length;
    if (n < 3) throw new RPLError('Too few arguments');
    const a = this._items.splice(n - 3, 1)[0];
    this._items.push(a);
    this._emit();
  }

  /** OVER: duplicate level 2 onto level 1 ( a b -> a b a ) */
  over() {
    const n = this._items.length;
    if (n < 2) throw new RPLError('Too few arguments');
    this._items.push(this._items[n - 2]);
    this._emit();
  }

  /** PICK: take a copy of level N ( ... n -> ... a ) where N consumed from lvl1. */
  pick(level) {
    if (level < 1) throw new RPLError('Bad argument value');
    const n = this._items.length;
    if (n < level) throw new RPLError('Too few arguments');
    this._items.push(this._items[n - level]);
    this._emit();
  }

  /** DUP2: duplicate levels 1 and 2 ( a b -> a b a b ) */
  dup2() {
    const n = this._items.length;
    if (n < 2) throw new RPLError('Too few arguments');
    this._items.push(this._items[n - 2], this._items[n - 1]);
    this._emit();
  }

  /** DROP2: drop levels 1 and 2 */
  drop2() {
    if (this._items.length < 2) throw new RPLError('Too few arguments');
    this._items.length -= 2;
    this._emit();
  }

  /** DROPN: drop N items (N is NOT on the stack — caller passes it). */
  dropN(n) {
    if (this._items.length < n) throw new RPLError('Too few arguments');
    this._items.length -= n;
    this._emit();
  }

  /* --------------- checkpoint / rollback ---------------
     Used by EVAL (and future LASTSTACK) to snapshot the full item
     array and atomically restore it if a program errors mid-execution.
     Returns an opaque token (currently a copy of the items array) that
     can be passed back to restore().  Does NOT emit; restore() does. */
  save() {
    return this._items.slice();
  }

  restore(snap) {
    if (!Array.isArray(snap)) throw new TypeError('restore needs a saved array');
    this._items.length = 0;
    for (const v of snap) this._items.push(v);
    this._emit();
  }

  /* --------------- multi-level UNDO -----
     Full history stack with a companion redo stack.

     Invariants:
       `_undoStack` — older snapshots older-first, newest last.
                      Each call to saveForUndo() pushes the CURRENT
                      `_items` onto this stack and clears _redoStack.
       `_redoStack` — populated by undo(); each undo() pops from
                      _undoStack, pushes the pre-undo state onto
                      _redoStack, and restores the popped snapshot.
                      redo() is the inverse.  Any new saveForUndo
                      invalidates _redoStack (standard "new action
                      kills redo history" semantics).

     Bound: UNDO_MAX caps the history to prevent unbounded growth
     during long use.  100 gives plenty of runway for "oops"
     recovery without ever holding the whole history in memory.

     Deviation from real HP50: HP50 LASTSTACK is single-slot / swap.
     GOALS.md explicitly allows deviations where HP50 limitations
     don't need to carry over — multi-level undo is one of those.
     LASTSTACK stays registered as an alias for single-step UNDO so
     user programs that expect LASTSTACK still work; their behavior
     is indistinguishable until you press UNDO more than once.

     Snapshots store item REFERENCES, not deep clones — RPL values
     are immutable-by-convention so sharing is safe.
     ----------------------------------------------------------- */
  saveForUndo() {
    if (!Array.isArray(this._undoStack)) { this._undoStack = []; this._redoStack = []; }
    this._undoStack.push(this._items.slice());
    if (this._undoStack.length > Stack.UNDO_MAX) {
      // Drop oldest; cheap enough at this size.
      this._undoStack.splice(0, this._undoStack.length - Stack.UNDO_MAX);
    }
    this._redoStack = [];
  }

  hasUndo() {
    return Array.isArray(this._undoStack) && this._undoStack.length > 0;
  }

  hasRedo() {
    return Array.isArray(this._redoStack) && this._redoStack.length > 0;
  }

  undo() {
    if (!this.hasUndo()) throw new RPLError('No undo available');
    const prior = this._undoStack.pop();
    this._redoStack.push(this._items.slice());
    this._items.length = 0;
    for (const v of prior) this._items.push(v);
    this._emit();
  }

  redo() {
    if (!this.hasRedo()) throw new RPLError('No redo available');
    const future = this._redoStack.pop();
    this._undoStack.push(this._items.slice());
    this._items.length = 0;
    for (const v of future) this._items.push(v);
    this._emit();
  }

  /** Drop all pending undo/redo history.  Used by LASTSTACK-reset
   *  tests and by `resetHome` to prevent an undo from crossing a
   *  HOME reset. */
  clearUndo() {
    this._undoStack = [];
    this._redoStack = [];
  }

  /* --------------- LAST / LASTARG ---------------
     HP50 LASTARG pushes back the arguments consumed by the most
     recent user-facing command.  `runOp(fn)` wraps a single op
     invocation: snapshot items before `fn()` runs, let it execute,
     then compute the popped prefix as the suffix of `prior` that no
     longer matches the bottom of the current items array.

     Implementation choice — LCP-diff, not per-op declaration:
       prior=[a,b,c], current=[a,b',z] → longest common prefix k=1;
       lastArgs = prior.slice(1) = [b, c]  (b was replaced, c was popped).

     This gets `3 4 +` right (lastArgs = [3, 4]) and handles arbitrary
     N-ary ops without needing each op to declare its arity.  Ops that
     GROW the stack without consuming (DUP, OVER, DEPTH, HOME, PATH,
     VARS, TRUE/FALSE literals) compute empty lastArgs — an acceptable
     simplification, since the HP50 itself doesn't define a meaningful
     LASTARG output for those either.

     Internal program-evaluation paths (EVAL, MAP, DOLIST, DOSUBS,
     STREAM, SEQ, IFT, runControl, etc.) call `op.fn` directly WITHOUT
     runOp, so LASTARG reflects the outer user-facing command rather
     than the inner tokens.  That matches HP50 semantics — `« 3 4 + »
     EVAL LASTARG` puts the program back on the stack (EVAL's one arg),
     not `3 4` (the `+`'s args).

     Callers: src/ui/entry.js wraps its three `op.fn(...)` sites;
     tests invoking ops directly via `lookup(X).fn(s)` can wrap the
     op in `s.runOp(() => …)` when LASTARG tracking is under test.
     ----------------------------------------------------------- */
  runOp(fn) {
    const prior = this._items.slice();
    fn();
    const cur = this._items;
    let k = 0;
    const lim = Math.min(prior.length, cur.length);
    while (k < lim && prior[k] === cur[k]) k++;
    const consumed = prior.slice(k);
    // Only overwrite the LASTARG slot when the op actually consumed
    // (or replaced) something — ops that grow the stack without
    // touching any prior items (DUP, OVER, DEPTH, HOME, PATH, VARS,
    // and crucially LASTARG itself) would otherwise clobber the
    // record they just re-surfaced, making a second LASTARG in a row
    // throw "No last arguments".  Preserving the prior snapshot on
    // pure growth matches the HP50 "LASTARG is idempotent" behaviour.
    if (consumed.length > 0) this._lastArgs = consumed;
  }

  hasLastArgs() {
    return Array.isArray(this._lastArgs) && this._lastArgs.length > 0;
  }

  /** Shallow copy — callers can mutate the returned array without
   *  corrupting the stored snapshot. */
  getLastArgs() {
    return Array.isArray(this._lastArgs) ? this._lastArgs.slice() : [];
  }

  /** Drop the recorded last-args snapshot.  Called by resetHome and
   *  anywhere else that wants to guarantee no stale LASTARG data
   *  bleeds across a hard-reset boundary. */
  clearLastArgs() { this._lastArgs = null; }
}

/** Cap on undo history depth.  100 keeps "oops" recovery generous
 *  without ever holding the whole history in memory. */
Stack.UNDO_MAX = 100;

/* Custom error type so the display/controller can show a friendly
   HP50-style status-line error without catching generic Error. */
export class RPLError extends Error {
  constructor(msg) { super(msg); this.name = 'RPLError'; }
}

/* RPLAbort — signal thrown by the ABORT op.  Intentionally *not* a
 * subclass of RPLError, so the IFERR trap will never catch it.  The
 * top-level entry-point loop catches it and displays "Abort" on the
 * status line. */
export class RPLAbort extends Error {
  constructor(msg = 'Abort') { super(msg); this.name = 'RPLAbort'; }
}

/* RPLHalt — signal thrown by the HALT op to suspend the currently-
 * running program.  Like RPLAbort it does NOT subclass RPLError so
 * IFERR cannot trap it.  The top-level EVAL wrapper treats it as a
 * clean program suspension (no flashError, stack preserved at the
 * point of the halt).  `state.halted` is populated before the throw
 * so `CONT` can resume where HALT left off.  HALT fires only at the
 * top level of a Program body (no structured control flow, no
 * compiled-local frame active). */
export class RPLHalt extends Error {
  constructor(msg = 'Halt') { super(msg); this.name = 'RPLHalt'; }
}
