// APPROX mode coerces values as they enter the stack; ops/internal.js installs
// the hook.  pushMany and the shuffling methods bypass it: they move values
// already on the stack, so a DUP keeps an Integer that predates APPROX.
let _pushCoerce = (v) => v;
export function setPushCoerce(fn) {
  _pushCoerce = (typeof fn === 'function') ? fn : ((v) => v);
}

// state.js installs this.  Importing state.js here would make types.js and
// stack.js load in a cycle that fails for whichever module is loaded first.
let _batchState = (fn) => fn();
export function setStateBatcher(fn) {
  _batchState = (typeof fn === 'function') ? fn : ((f) => f());
}

// Flag -55 set turns the saving of last arguments off; state.js supplies the test.
let _savesLastArgs = () => true;
export function setLastArgsGate(fn) {
  _savesLastArgs = (typeof fn === 'function') ? fn : () => true;
}

export class Stack {
  constructor() {
    this._items = [];              // _items[len-1] is level 1
    this._listeners = new Set();
    this._undoStack = [];
    this._redoStack = [];
    this._lastArgs = null;
    this._argsAs = null;
    this._argsTick = 0;
    this._touched = Infinity;
    this._holdEmit = 0;
    this._emitPending = false;
  }

  subscribe(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }
  _emit() {
    if (this._holdEmit > 0) {
      this._emitPending = true;
      return;
    }
    this._flushEmit();
  }
  _flushEmit() {
    for (const fn of this._listeners) {
      try { fn(this); } catch (e) { console.error('stack listener', e); }
    }
  }

  get depth() { return this._items.length; }

  peek(level = 1) {
    if (level < 1) throw new RangeError('level must be >= 1');
    this._touch(this._items.length - level);
    return this._items[this._items.length - level];
  }

  // The lowest index a running command read or took, for its last arguments.
  _touch(index) {
    if (index < this._touched) this._touched = Math.max(0, index);
  }

  // Level 1 first.
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
    if (this._items.length === 0) throw tooFew(1);
    this._touch(this._items.length - 1);
    const v = this._items.pop();
    this._emit();
    return v;
  }

  // Returns [level n, ..., level 1].
  popN(n) {
    if (this._items.length < n) throw tooFew(n - this._items.length);
    this._touch(this._items.length - n);
    const out = this._items.splice(this._items.length - n, n);
    this._emit();
    return out;
  }

  // Throws Too few arguments, with how many values are missing, unless the stack holds n.
  need(n) {
    if (this._items.length < n) throw tooFew(n - this._items.length);
  }

  clear() {
    this._items.length = 0;
    this._emit();
  }

  dup()  { this.need(1);
           this._touch(this._items.length - 1);
           this._items.push(this._items[this._items.length - 1]); this._emit(); }

  drop() { this.pop(); }

  swap() {
    this.need(2);
    const n = this._items.length;
    [this._items[n - 1], this._items[n - 2]] = [this._items[n - 2], this._items[n - 1]];
    this._emit();
  }

  rot() {
    this.need(3);
    const n = this._items.length;
    const a = this._items.splice(n - 3, 1)[0];
    this._items.push(a);
    this._emit();
  }

  unrot() {
    this.need(3);
    const n = this._items.length;
    this._items.splice(n - 3, 0, this._items.pop());
    this._emit();
  }

  over() {
    this.need(2);
    const n = this._items.length;
    this._touch(n - 2);
    this._items.push(this._items[n - 2]);
    this._emit();
  }

  pick(level) {
    if (level < 1) throw new RPLError('Bad argument value');
    this.need(level);
    const n = this._items.length;
    this._touch(n - level);
    this._items.push(this._items[n - level]);
    this._emit();
  }

  dup2() {
    this.need(2);
    const n = this._items.length;
    this._touch(n - 2);
    this._items.push(this._items[n - 2], this._items[n - 1]);
    this._emit();
  }

  drop2() {
    this.need(2);
    this._items.length -= 2;
    this._emit();
  }

  dropN(n) {
    this.need(n);
    this._items.length -= n;
    this._emit();
  }

  save() {
    return this._items.slice();
  }

  restore(snap) {
    if (!Array.isArray(snap)) throw new TypeError('restore needs a saved array');
    this._items.length = 0;
    for (const v of snap) this._items.push(v);
    this._emit();
  }

  // Multi-level undo is a deliberate step beyond the HP50's single-slot
  // LASTSTACK.  Snapshots share item references; RPL values are immutable.
  saveForUndo() {
    this._undoStack.push(this._items.slice());
    if (this._undoStack.length > Stack.UNDO_MAX) {
      this._undoStack.splice(0, this._undoStack.length - Stack.UNDO_MAX);
    }
    this._redoStack = [];
  }

  hasUndo() {
    return this._undoStack.length > 0;
  }

  hasRedo() {
    return this._redoStack.length > 0;
  }

  // Redo puts the undone step itself back, so undoMark() survives an undo and redo.
  undo() {
    if (!this.hasUndo()) throw new RPLError('No undo available');
    const step = this._undoStack.pop();
    this._redoStack.push({ items: this._items.slice(), step });
    this.restore(step);
  }

  redo() {
    if (!this.hasRedo()) throw new RPLError('No redo available');
    const { items, step } = this._redoStack.pop();
    const unchanged = step.length === this._items.length && step.every((v, i) => v === this._items[i]);
    this._undoStack.push(unchanged ? step : this._items.slice());
    this.restore(items);
  }

  // Identifies the latest undo step; it changes when a step is added or undone.
  undoMark() {
    return this._undoStack[this._undoStack.length - 1] ?? null;
  }

  undoTopMatchesCurrent() {
    const top = this._undoStack[this._undoStack.length - 1];
    return !!top && top.length === this._items.length && top.every((v, i) => v === this._items[i]);
  }

  dropUndoTop() {
    this._undoStack.pop();
  }

  // The steps UNDO takes back, oldest first, and LASTARG's record, which persist.js keeps through a reload.
  undoSteps() {
    return this._undoStack;
  }

  restoreUndo(steps, lastArgs) {
    this._undoStack = steps;
    this._redoStack = [];
    this._lastArgs = lastArgs;
  }

  // LASTARG gets what the op read, took or replaced: the stack from the lowest
  // level it touched, or where the before and after stacks first differ,
  // whichever is deeper, so no op declares its arity.  Ops that leave the stack
  // below their results alone (LASTARG itself, DEPTH) keep the previous
  // record, and an op that ran a program (EVAL, a program line) keeps the
  // record of the last command inside it, as on the HP.
  runOp(fn) {
    const args = this.beginArgs();
    let ok = false;
    try {
      this.holdEmit(() => _batchState(fn));
      ok = true;
    } finally {
      this.endArgs(args, ok);
    }
  }

  // Listeners hear once, after fn, however many times fn changes the stack: a
  // line of a hundred numbers draws the stack once, not a hundred times.
  holdEmit(fn) {
    this._holdEmit++;
    try {
      return fn();
    } finally {
      this._holdEmit--;
      if (this._holdEmit === 0 && this._emitPending) {
        this._emitPending = false;
        this._flushEmit();
      }
    }
  }

  beginArgs() {
    const args = { prior: this._items.slice(), tick: this._argsTick, outer: this._touched, argsAs: this._argsAs };
    this._touched = Infinity;
    this._argsAs = null;
    return args;
  }

  // What LASTARG brings back after the running command succeeds, when that
  // isn't what it took: Σ+ given m reals saves them as one vector, as the AUR says.
  saveArgsAs(values) {
    this._argsAs = values;
  }

  // A failed op saves what it took, as the HP saves arguments before it runs a
  // command, so LASTARG brings back what 3 0 / took. The outer op sees what this
  // one touched either way.
  endArgs(args, succeeded) {
    const touched = this._touched;
    const argsAs = this._argsAs;
    this._touched = Math.min(args.outer, touched);
    this._argsAs = args.argsAs;
    if (this._argsTick !== args.tick || !_savesLastArgs()) return;
    if (succeeded && argsAs) {
      this._lastArgs = argsAs.slice();
      this._argsTick++;
      return;
    }
    const { prior } = args;
    const cur = this._items;
    let k = 0;
    const lim = succeeded ? Math.min(prior.length, cur.length) : 0;
    while (k < lim && prior[k] === cur[k]) k++;
    k = Math.min(succeeded ? k : Infinity, touched);
    if (k >= prior.length) return;
    this._lastArgs = prior.slice(k);
    this._argsTick++;
  }

  hasLastArgs() {
    return this._lastArgs !== null;
  }

  getLastArgs() {
    return this._lastArgs ? this._lastArgs.slice() : [];
  }
}

Stack.UNDO_MAX = 100;

export class RPLError extends Error {
  constructor(msg) { super(msg); this.name = 'RPLError'; }
}

// Says how many more values the command wanted, so its banner can count them where the manual gives no count.
function tooFew(missing) {
  const e = new RPLError('Too few arguments');
  e.missing = missing;
  return e;
}

// Thrown by ABORT.  Not an RPLError, so IFERR cannot trap it.
export class RPLAbort extends Error {
  constructor(msg = 'Abort') { super(msg); this.name = 'RPLAbort'; }
}

/* The page cannot take input while a command runs, so there is no ON key
   to press; long loops call checkTimeLimit() instead.  RPLInterrupt is not
   an RPLError, so IFERR cannot trap it and keep a runaway loop alive. */
export class RPLInterrupt extends Error {
  constructor(msg = 'Interrupted') { super(msg); this.name = 'RPLInterrupt'; }
}

export const RUN_TIME_LIMIT_MS = 10000;

let _deadline = Infinity;
let _ticks = 0;

export function withTimeLimit(ms, fn) {
  const outer = _deadline;
  _deadline = Math.min(outer, Date.now() + ms);
  try { return fn(); } finally { _deadline = outer; }
}

export function checkTimeLimit() {
  if (_deadline !== Infinity && (++_ticks & 255) === 0 && Date.now() > _deadline) throw new RPLInterrupt();
}
