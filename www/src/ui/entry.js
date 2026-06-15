/* =================================================================
   Command-line / entry buffer.

   Manages the string the user is typing on the LCD's bottom line and
   the state machine that decides when ENTER is implied.

   Pressing a digit, decimal point, sign, EEX, space, etc. mutates
   the buffer.  Pressing ENTER commits.  Pressing an operator key
   while the buffer is non-empty commits first, then runs the op.
   ================================================================= */

import { parseEntry } from '../rpl/parser.js';
import { lookup } from '../rpl/ops.js';
import { RPLError } from '../rpl/stack.js';
import { errorBeep } from './beep.js';
import { Name } from '../rpl/types.js';
import {
  saveVarStateForUndo, undoVarState, redoVarState,
  hasVarRedo, clearVarUndo,
} from '../rpl/state.js';
import {
  EditorState, EditorView, keymap, drawSelection,
  history, historyKeymap, defaultKeymap,
} from '../../vendor/codemirror/codemirror.bundle.js';

// Maximum length of the command-line history ring buffer.
// 20 is the HP50 default for CMD — a balance between "enough to scroll
// back through typical use" and "doesn't saturate the LCD menu pager"
// (20 entries = 4 soft-menu pages at 6 slots per page, with the tail
// padded).  Parameterised here so tests can reset it if needed.
const HISTORY_MAX = 20;


export class Entry {
  static HISTORY_MAX = HISTORY_MAX;

  constructor(stack, options = {}) {
    this.stack = stack;
    // CodeMirror EditorState is the source of truth for text + cursor.
    // The `buffer` and `cursor` getters below read from it; the setters
    // and the `_dispatch` helper write via transactions.  When `attach()`
    // is called (browser path), an EditorView is layered on top and
    // user-driven edits (typing into the DOM, mouse selection, paste)
    // flow through the same transaction pipeline.  In the headless
    // Node-test path, no view is created and _state stands alone.
    this._state = EditorState.create({ doc: '' });
    this._view = null;
    this.error = '';                       // last error message (for LCD)
    this._listeners = new Set();
    this._historyListeners = new Set();
    this.onError = options.onError || ((msg) => { this.error = msg; this._emit(); });
    this._history = [];
  }

  /** Apply a transaction spec to the internal state.  When an EditorView
   *  is attached, routes through view.dispatch so the DOM stays in sync;
   *  otherwise mutates _state directly.  Never emits — callers decide
   *  when subscribers should be notified, so a single method can batch
   *  multiple edits before one _emit. */
  _dispatch(spec) {
    if (this._view) {
      this._view.dispatch(spec);
      // view.dispatch updates view.state synchronously via our intercept;
      // this line is a belt-and-suspenders sync for callers that read
      // right after dispatching.
      this._state = this._view.state;
    } else {
      this._state = this._state.update(spec).state;
    }
  }

  get buffer() { return this._state.doc.toString(); }
  set buffer(s) {
    const next = String(s ?? '');
    const docLen = this._state.doc.length;
    const cur = this.cursor;
    // Preserve caller's cursor if it falls inside the new string,
    // else clamp to end.  Callers that care about cursor position
    // set it explicitly after.
    const newCursor = Math.min(cur, next.length);
    this._dispatch({
      changes: { from: 0, to: docLen, insert: next },
      selection: { anchor: newCursor },
    });
  }

  get cursor() { return this._state.selection.main.head; }
  set cursor(n) {
    const len = this._state.doc.length;
    const clamped = Math.max(0, Math.min(Number(n) || 0, len));
    this._dispatch({ selection: { anchor: clamped } });
  }

  /** Browser-only.  Mount a CodeMirror EditorView into `parent` and make
   *  it the live editing surface for this entry.  Intercepts Enter /
   *  Shift-Enter / Escape / empty-buffer arrow keys via the app-supplied
   *  callbacks; everything else (typing, mouse selection, shift+arrow
   *  selection, clipboard, ctrl/cmd-A, within-buffer undo) goes through
   *  CM's default keymap.
   *
   *  Call once during init.  Calling twice is a no-op. */
  attach(parent, { onCommit, onCancel, onArrowUpEmpty, onArrowDownEmpty,
                   onArrowLeftEmpty, onArrowRightEmpty } = {}) {
    if (this._view) return;
    const isEmpty = () => this._view.state.doc.length === 0;
    const delegateIfEmpty = (cb) => () => {
      if (!isEmpty() || !cb) return false;
      cb(); return true;
    };
    const appKeys = keymap.of([
      { key: 'Enter',       run: () => { onCommit?.(); return true; } },
      { key: 'Shift-Enter', run: (view) => {
          const head = view.state.selection.main.head;
          view.dispatch({ changes: { from: head, insert: '\n' },
                          selection: { anchor: head + 1 } });
          return true;
      } },
      { key: 'Tab',         run: (view) => {
          const head = view.state.selection.main.head;
          view.dispatch({ changes: { from: head, insert: '  ' },
                          selection: { anchor: head + 2 } });
          return true;
      } },
      { key: 'Escape',      run: (view) => {
          // Escape on an empty buffer drops focus instead of doing the
          // (no-op) cancel — matches the "ESC once to stop editing" idiom
          // from VS Code and friends.
          if (view.state.doc.length === 0) {
            view.contentDOM.blur();
            return true;
          }
          onCancel?.();
          return true;
      } },
      { key: 'ArrowUp',     run: delegateIfEmpty(onArrowUpEmpty) },
      { key: 'ArrowDown',   run: delegateIfEmpty(onArrowDownEmpty) },
      { key: 'ArrowLeft',   run: delegateIfEmpty(onArrowLeftEmpty) },
      { key: 'ArrowRight',  run: delegateIfEmpty(onArrowRightEmpty) },
    ]);
    this._view = new EditorView({
      state: EditorState.create({
        doc: this.buffer,
        selection: { anchor: this.cursor },
        extensions: [
          history(),
          drawSelection(),
          appKeys,                                        // higher priority
          keymap.of([...historyKeymap, ...defaultKeymap]),// CM defaults
          // Deliberately NO lineWrapping: long content scrolls
          // horizontally; newlines appear only when the user presses
          // Shift-Enter.
          //
          // Keep the caret visible after ANY doc/selection change —
          // paste, drag-drop, virtual-keypad type() calls, etc.  CM's
          // built-in keymap already scrolls when the user types or
          // moves the cursor with arrow keys, but events like paste
          // mutate the doc without a cursor-move transaction of their
          // own, leaving the caret off-screen.  A transaction extender
          // attaches a scrollIntoView effect to every edit so the
          // viewport tracks the caret unconditionally.
          EditorState.transactionExtender.of((tr) => {
            if (!tr.docChanged && !tr.selection) return null;
            const head = tr.state.selection.main.head;
            return { effects: EditorView.scrollIntoView(head) };
          }),
        ],
      }),
      parent,
      dispatch: (tr) => {
        this._view.update([tr]);
        this._state = this._view.state;
        if (tr.docChanged || tr.selection) this._emit();
      },
    });
    this._state = this._view.state;
  }

  focus() { this._view?.focus(); }

  blur() { this._view?.contentDOM?.blur?.(); }

  hasFocus() { return !!this._view?.hasFocus; }

  subscribe(fn) { this._listeners.add(fn); return () => this._listeners.delete(fn); }
  /** Subscribe to history-ring changes only.  Fires after a new entry is
   *  successfully recorded — i.e. after ENTER / execOp commit, not on
   *  every keystroke.  Returns an unsubscribe function. */
  subscribeHistory(fn) { this._historyListeners.add(fn); return () => this._historyListeners.delete(fn); }
  _emit() { for (const fn of this._listeners) fn(this); }
  _emitHistory() { for (const fn of this._historyListeners) fn(this); }

  /** Append raw text at the cursor.  Pulls keyboard focus into the
   *  editor so physical typing flows straight in after a virtual-key or
   *  soft-menu insertion — without this, the user would type, lose
   *  visible focus, click a keypad button that inserts a digit, and
   *  then have to click back into the editor before they could keep
   *  typing on the physical keyboard. */
  type(text) {
    this.error = '';
    this.buffer = this.buffer.slice(0, this.cursor) + text + this.buffer.slice(this.cursor);
    this.cursor += text.length;
    this._emit();
    this.focus();
  }

  /** True when the buffer has an unclosed backtick-quote — i.e. the cursor
   *  is inside an algebraic expression.  Used to route operator keys
   *  (+, -, *, /, ^) through type() instead of execOp() so the user
   *  can actually spell out ``X^2 + 2*X + 1`` on the keypad.
   *
   *  Counts backticks literally; there's no escape syntax (parseEntry
   *  uses balanced backticks).  Odd count → we're inside a quote;
   *  even → we're outside.
   */
  isAlgebraic() {
    let count = 0;
    for (const ch of this.buffer) if (ch === '`') count++;
    return (count % 2) === 1;
  }

  /** True when the user has started composing a command line — either
   *  anything is already in the buffer, or a backtick is open.  The key
   *  dispatchers below use this to decide whether a command key types
   *  its name (editing → build text) or runs the op (stack-direct).
   *
   *  Rationale: pressing the backtick key is the canonical "start edit
   *  mode" gesture (this app's remap of the HP50 tick key) — it opens an
   *  algebraic expression that accepts operator keys as text.  This
   *  build extends the same rule to any content in the buffer so `3 5 +`
   *  (typed) builds a program
   *  fragment, and so key presses during editing never silently
   *  commit-and-execute a half-finished line. */
  isEditing() {
    return this.buffer.length > 0;
  }

  /** Operator-key dispatcher: while the user is editing a command
   *  line, type the character; otherwise execute the op.  Used by
   *  +, −, ×, ÷, yˣ and shifted operators (x², 1/x, ≠, …) so the
   *  same physical key works on the RPL stack AND inside a buffer
   *  the user is composing. */
  typeOrExec(char, opName) {
    if (this.isEditing()) this.type(char);
    else this.execOp(opName ?? char);
  }

  /** True when the buffer has non-whitespace content immediately
   *  before the cursor.  Used by the command-key dispatchers so
   *  pressing SIN/STO/etc. mid-buffer can self-insert a leading
   *  separator — otherwise `3 4+SIN` would be the literal result of
   *  typing `3 4+[SIN]` and the name would glom onto the operator. */
  _needsLeadingSpace() {
    return this.cursor > 0 && !/\s/.test(this.buffer[this.cursor - 1]);
  }

  /** Function-key dispatcher (SIN, COS, LN, SQRT, …).  Three cases:
   *    - Inside an unclosed backtick (algebraic entry): type `FN(` so the
   *      expression reads like textbook math.
   *    - Editing but outside a backtick (bare RPN): type `FN ` — a
   *      whitespace-separated token that parses to a Name reference
   *      and composes cleanly with the rest of the buffer.  If the
   *      char before the cursor isn't whitespace, prefix a space too
   *      so the name stays tokenised from whatever came before.
   *    - Empty buffer: run the op on the stack. */
  typeOrExecFn(fnName) {
    if (this.isAlgebraic()) this.type(fnName + '(');
    else if (this.isEditing()) {
      this.type((this._needsLeadingSpace() ? ' ' : '') + fnName + ' ');
    }
    else this.execOp(fnName);
  }

  /** Command-key dispatcher (STO, RCL, UNDO, EVAL, …): while editing,
   *  type the op name followed by a space so the next token sits on
   *  its own; otherwise run the op.  This is the bare-name counterpart
   *  to typeOrExecFn — commands that don't take arguments via `(...)`
   *  and so belong as whitespace-separated tokens in the buffer.  A
   *  leading space is added when the char before the cursor isn't
   *  already whitespace, for the same tokenisation reason. */
  typeOrExecName(opName) {
    if (this.isEditing()) {
      this.type((this._needsLeadingSpace() ? ' ' : '') + opName + ' ');
    }
    else this.execOp(opName);
  }

  /** Insert `text` at the cursor and position the cursor `backUp`
   *  characters from the end of the inserted text.  Example:
   *    typeWithCursor('()', 1)   inserts `()` and leaves the cursor
   *    between the two parens, matching HP50 behavior for the `( )`
   *    combo key.  `backUp = 0` is equivalent to `type(text)`. */
  typeWithCursor(text, backUp = 0) {
    this.type(text);
    if (backUp > 0) {
      this.cursor = Math.max(0, this.cursor - backUp);
      this._emit();
    }
  }

  /** Snapshot stack AND variable/directory state together so HIST
   *  SHIFT-R UNDO reverts the whole keypress — not just the stack.
   *  The var-state half ensures `'X' 5 STO [UNDO]` actually removes
   *  X from the current directory. */
  _snapForUndo() {
    this.stack.saveForUndo();
    saveVarStateForUndo();
  }

  /** Composite UNDO: pop BOTH the stack and the var-state history in
   *  lockstep.  The HIST SHIFT-R key calls this directly (bypassing
   *  execOp so the snapshot taken at the top of execOp doesn't
   *  overwrite what we're about to restore).  Throws
   *  'No undo available' when no snapshot exists; the keyboard
   *  handler turns that into a flashed status-line error.
   *
   *  Multi-level: repeated calls walk back through history one
   *  step at a time (not swap — see Stack.undo). */
  performUndo() {
    if (!this.stack.hasUndo()) throw new RPLError('No undo available');
    // Var-state first so the stack-undo event arrives AFTER the
    // var-state change — listeners that redraw both will see a
    // consistent pair.  Either half throwing keeps the rest untouched.
    undoVarState();
    this.stack.undo();
  }

  /** Composite REDO: re-apply the most recently undone step.
   *  Companion to multi-level performUndo.  Throws
   *  'No redo available' when there's nothing to redo. */
  performRedo() {
    if (!this.stack.hasRedo()) throw new RPLError('No redo available');
    if (hasVarRedo()) redoVarState();
    this.stack.redo();
  }

  /** Record a committed entry in the command-line history ring buffer.
   *  Consecutive identical entries are collapsed to one — otherwise
   *  spamming ENTER would saturate the buffer with duplicates.  Only
   *  `enter()` / `execOp()` call this on a successful commit path so
   *  failed parses don't pollute the history. */
  _recordHistory(text) {
    const s = String(text ?? '').trim();
    if (s.length === 0) return;
    // Dedup most-recent entry.
    if (this._history.length > 0 && this._history[this._history.length - 1] === s) return;
    this._history.push(s);
    if (this._history.length > Entry.HISTORY_MAX) {
      this._history.splice(0, this._history.length - Entry.HISTORY_MAX);
    }
    this._emitHistory();
  }

  /** Public snapshot of the command history, newest entry LAST.  The
   *  CMD soft-menu reverses this into newest-first on display.  Returned
   *  as a fresh array so callers can't mutate the internal buffer. */
  getHistory() {
    return this._history.slice();
  }

  /** Remove a single history entry by its exact text.  Removes only the
   *  first match — duplicates are already collapsed at record time, so
   *  there should be at most one anyway.  Returns true if anything was
   *  removed; false when the text wasn't found.  Used by the side-panel
   *  History tab's per-row × button. */
  removeHistory(text) {
    const idx = this._history.indexOf(String(text ?? ''));
    if (idx < 0) return false;
    this._history.splice(idx, 1);
    return true;
  }

  /** Drop every entry from the command-line history ring buffer.
   *  Companion to removeHistory for the "clear all" affordance the
   *  side-panel exposes when there's at least one entry. */
  clearHistory() {
    this._history.length = 0;
  }

  /** Clear the command line and fill it with `text`, positioning the
   *  cursor at the end.  Used by the CMD soft-menu's slot onPress to
   *  recall a historical entry — matches HP50 CMD behavior where a
   *  recall replaces the current command line rather than inserting. */
  recall(text) {
    this.buffer = String(text ?? '');
    this.cursor = this.buffer.length;
    this.error = '';
    this._emit();
    this.focus();
  }

  cursorLeft() {
    if (this.cursor > 0) { this.cursor--; this._emit(); }
  }

  cursorRight() {
    if (this.cursor < this.buffer.length) { this.cursor++; this._emit(); }
  }

  cursorHome() {
    if (this.cursor !== 0) { this.cursor = 0; this._emit(); }
  }

  cursorEnd() {
    if (this.cursor !== this.buffer.length) {
      this.cursor = this.buffer.length;
      this._emit();
    }
  }

  /** Move the cursor to the same column on the previous line of a
   *  multi-line buffer.  On a single-line buffer (or the first line),
   *  no-op.  We don't clamp to cursorHome on the first line because
   *  that would conflict with the user's expectation that ▲ / ArrowUp
   *  never scrolls the stack while the editor is active. */
  cursorUp() {
    const before = this.buffer.slice(0, this.cursor);
    const nl = before.lastIndexOf('\n');
    if (nl === -1) return;                             // already on line 0
    const curCol = this.cursor - nl - 1;
    const prevStart = before.slice(0, nl).lastIndexOf('\n') + 1; // 0 if not found
    const prevLen = nl - prevStart;
    const newCol = Math.min(curCol, prevLen);
    this.cursor = prevStart + newCol;
    this._emit();
  }

  /** Move the cursor to the same column on the next line of a multi-
   *  line buffer.  On the final line (or a single-line buffer), no-op
   *  for the same reason cursorUp is a no-op on line 0. */
  cursorDown() {
    const nl = this.buffer.indexOf('\n', this.cursor);
    if (nl === -1) return;                             // already on last line
    const lineStart = this.buffer.lastIndexOf('\n', this.cursor - 1) + 1;
    const curCol = this.cursor - lineStart;
    const nextStart = nl + 1;
    const nextNl = this.buffer.indexOf('\n', nextStart);
    const nextLen = (nextNl === -1 ? this.buffer.length : nextNl) - nextStart;
    const newCol = Math.min(curCol, nextLen);
    this.cursor = nextStart + newCol;
    this._emit();
  }

  /** Backspace.  If buffer is empty, DROP from stack instead. */
  backspace() {
    this.error = '';
    if (this.buffer.length === 0) {
      // Snapshot BEFORE the DROP so HIST SHIFT-R UNDO can restore it.
      this._snapForUndo();
      try { this.stack.drop(); } catch (e) { this.flashError(e); }
      return;
    }
    if (this.cursor > 0) {
      this.buffer = this.buffer.slice(0, this.cursor - 1) + this.buffer.slice(this.cursor);
      this.cursor--;
      this._emit();
    }
  }

  /** Clear the command line entirely (CANCEL / ON). */
  cancel() {
    this.buffer = '';
    this.cursor = 0;
    this.error = '';
    this._emit();
  }

  /** Toggle sign of the current number being typed, or NEG the stack top.
   *
   *  HP50 behavior — if the current number has an exponent marker (E),
   *  +/- flips the EXPONENT's sign, not the mantissa.  Only a number
   *  without an E gets its mantissa sign flipped. */
  toggleSign() {
    this.error = '';
    if (this.buffer.length === 0) {
      this.execOp('NEG');
      return;
    }
    const t = this.buffer;

    // Find the start of the current number token (walking back from cursor).
    let i = this.cursor - 1;
    while (i >= 0 && /[0-9.eE+\-]/.test(t[i]) && !(i < this.cursor - 1 && (t[i] === '+' || t[i] === '-') && /[0-9.]/.test(t[i + 1]) === false)) i--;
    const startTok = i + 1;

    // Scan forward from startTok to locate an E (end of mantissa, start
    // of exponent).  Stops at the first non-token char so we stay inside
    // the current number.  A leading +/- at startTok is the mantissa
    // sign; an interior +/- only counts as part of the token when it's
    // immediately after an E (e.g. inside `1E-7`).
    let eIdx = -1;
    for (let k = startTok; k < t.length; k++) {
      const c = t[k];
      if (c === 'e' || c === 'E') { eIdx = k; break; }
      if (/[0-9.]/.test(c)) continue;
      if (c === '+' || c === '-') {
        if (k === startTok) continue;
        if (/[eE]/.test(t[k - 1])) continue;
      }
      break;
    }

    if (eIdx !== -1) {
      // Current number has an E — flip the exponent's sign.
      const afterE = eIdx + 1;
      const ch = t[afterE];
      if (ch === '-') {
        this.buffer = t.slice(0, afterE) + t.slice(afterE + 1);
        if (this.cursor > afterE) this.cursor -= 1;
      } else if (ch === '+') {
        this.buffer = t.slice(0, afterE) + '-' + t.slice(afterE + 1);
        // length unchanged — cursor unchanged
      } else {
        // Insert '-' right after the E.  ch may be a digit, undefined
        // (cursor parked immediately after EEX, nothing typed yet), or
        // any other non-exponent char (whitespace/operator) — treat all
        // three the same: just splice in the minus.
        this.buffer = t.slice(0, afterE) + '-' + t.slice(afterE);
        if (this.cursor >= afterE) this.cursor += 1;
      }
      this._emit();
      return;
    }

    // No exponent: flip the mantissa's leading sign.
    if (t[startTok] === '-') {
      this.buffer = t.slice(0, startTok) + t.slice(startTok + 1);
      this.cursor -= 1;
    } else if (t[startTok] === '+') {
      this.buffer = t.slice(0, startTok) + '-' + t.slice(startTok + 1);
    } else {
      this.buffer = t.slice(0, startTok) + '-' + t.slice(startTok);
      this.cursor += 1;
    }
    this._emit();
  }

  /** Insert scientific "E" marker. */
  eex() {
    if (this.buffer.length === 0) { this.type('1E'); return; }
    // If already has an E in the current token, do nothing; else append E.
    const tail = this.buffer.slice(0, this.cursor);
    const lastTok = tail.match(/[0-9.+\-eE]+$/)?.[0] ?? '';
    if (/[eE]/.test(lastTok)) return;
    this.type('E');
  }

  /** Run `body` with a stack snapshot.  If it throws, restore the
   *  snapshot so a failed op (e.g. SIN on a string → "Bad argument
   *  type") leaves the stack unchanged — HP50 behavior where a type
   *  error does NOT consume its arguments.  Also clears the undo
   *  slot on failure since the rolled-back state equals the slot.
   *
   *  Public: callers outside Entry (side-panel, soft-menu handlers in
   *  app.js) that invoke ops directly need the same rollback
   *  guarantee, otherwise a type error from e.g. the Commands panel
   *  eats the args the op had popped before throwing. */
  safeRun(body, context = '') {
    const rollback = this.stack.save();
    try { body(); }
    catch (e) {
      this.stack.restore(rollback);
      this.stack.clearUndo();
      // Also nuke the var-state UNDO slot.  Since `body()` may have
      // succeeded a variable STO/PURGE before the throw (and we
      // intentionally DON'T roll var state back — RPL side effects on
      // variables are persistent), keeping the var-undo slot would let
      // a subsequent UNDO revert to a state where the stack matches
      // the current live one but vars don't.  Clearing both keeps the
      // two halves in lock-step.
      clearVarUndo();
      // Optional prefix — typically the command name the caller ran.
      // Matches the tagging done inside enter() / execOp() via
      // `_runOpTagged`, but for callers that don't go through those
      // paths (side-panel, soft-menu handlers that lookup+invoke ops
      // directly) and so can't rely on inner-loop tagging.
      if (context) {
        const msg = (e && typeof e === 'object' && e.message != null) ? e.message : String(e);
        e = new RPLError(`${context}: ${msg}`);
      }
      this.flashError(e);
    }
  }

  /** Look up `opName`, run it, and re-throw any error with the command
   *  name prefixed — so "Bad argument type" becomes "SIN: Bad argument
   *  type" by the time it reaches flashError / the LCD.  The pre-existing
   *  stack-rollback in safeRun still kicks in; we only tag the message. */
  _runOpTagged(opName) {
    const op = lookup(opName);
    if (!op) throw new RPLError(`Undefined: ${opName}`);
    try {
      this.stack.runOp(() => op.fn(this.stack, this));
    } catch (e) {
      const msg = (e && typeof e === 'object' && e.message != null) ? e.message : String(e);
      throw new RPLError(`${opName}: ${msg}`);
    }
  }

  /** Commit current buffer to the stack (ENTER). */
  enter() {
    this.error = '';
    const raw = this.buffer.trim();
    // An entry consisting entirely of UNDO / REDO / LASTSTACK tokens
    // (any case, any count) routes straight to performUndo /
    // performRedo for each token, matching the UNDO keypad key when
    // not editing.  The normal path's pre-snap would otherwise capture
    // the current stack the very instant we're about to step back —
    // making the first typed UNDO a no-op, so `undo` would visibly do
    // nothing and `undo undo` would only undo once — and the
    // registered `s.undo()` op skips the var-state half, so redo would
    // also go out of sync.
    const tokens = raw.length > 0 ? raw.split(/\s+/) : [];
    const isUndoTok = (t) => {
      const u = t.toUpperCase();
      return u === 'UNDO' || u === 'LASTSTACK' || u === 'REDO';
    };
    if (tokens.length > 0 && tokens.every(isUndoTok)) {
      try {
        for (const t of tokens) {
          if (t.toUpperCase() === 'REDO') this.performRedo();
          else this.performUndo();
        }
      } catch (e) { this.flashError(e); return; }
      this._recordHistory(raw);
      this.buffer = '';
      this.cursor = 0;
      this._emit();
      return;
    }
    // Snapshot BEFORE any stack mutation so HIST SHIFT-R UNDO can
    // restore the pre-ENTER stack AND variable/directory state —
    // covers "oops, I pushed the wrong thing", "oops, I ran the
    // wrong op via a bare-name invocation", AND "oops, I just did
    // STO/PURGE/CRDIR via the entry line".
    this._snapForUndo();
    if (raw.length === 0) {
      // ENTER on empty line = DUP
      this.safeRun(() => this.stack.dup());
      return;
    }
    this.safeRun(() => {
      const values = parseEntry(raw);
      // If a *bare* (unquoted) identifier resolves to an op, run it rather
      // than pushing.  Quoted identifiers (`'+'`) are literal references
      // and always push — this is what makes `'+' 'X' STO` work.
      // Wrap each op invocation in `stack.runOp` so LAST/LASTARG
      // sees the most recently executed user-facing command's
      // argument list.
      for (const v of values) {
        if (v?.type === 'name' && !v.quoted) {
          if (lookup(v.id)) { this._runOpTagged(v.id); continue; }
        }
        this.stack.push(v);
      }
      this._recordHistory(raw);
      this.buffer = '';
      this.cursor = 0;
      this._emit();
    });
  }

  /** Commit then run an op.  Called by operator keys. */
  execOp(name) {
    this.error = '';
    // Snapshot BEFORE any stack mutation (buffer commit OR op run)
    // so HIST SHIFT-R UNDO can revert the whole keypress — stack AND
    // variable/directory state.  One snapshot per keypress — if the
    // commit pushes N values then the op runs, both are inside the
    // same undo unit.
    this._snapForUndo();
    this.safeRun(() => {
      // commit current entry first (if any)
      if (this.buffer.trim().length > 0) {
        const raw = this.buffer.trim();
        const values = parseEntry(raw);
        for (const v of values) {
          if (v?.type === 'name' && !v.quoted) {
            if (lookup(v.id)) { this._runOpTagged(v.id); continue; }
          }
          this.stack.push(v);
        }
        this._recordHistory(raw);
        this.buffer = '';
        this.cursor = 0;
      }
      this._runOpTagged(name);
    });
    this._emit();
  }

  flashError(e) {
    // Accept real Error instances AND plain { message } objects so call
    // sites can use either ergonomically.  Prior behavior ran objects
    // through String(e), producing "[object Object]" on the LCD whenever
    // a UI handler used the lighter-weight `{message: '...'}` form
    // (e.g. pressSoftKey on an empty menu).
    this.error = (e && typeof e === 'object' && e.message != null)
      ? String(e.message)
      : String(e);
    // Errors take priority over any pending notice.
    this.notice = '';
    clearTimeout(this._noticeTimer);
    this._emit();
    errorBeep();
    // optionally auto-clear after a bit
    clearTimeout(this._errTimer);
    this._errTimer = setTimeout(() => { this.error = ''; this._emit(); }, 2500);
  }

  /** Show a transient informational message on the command line (green,
   *  no beep).  Used for success feedback like "Saved hp50-20260427.json".
   *  Clears automatically after 2 seconds, or sooner if an error fires. */
  flashNotice(msg) {
    this.notice = String(msg);
    this._emit();
    clearTimeout(this._noticeTimer);
    this._noticeTimer = setTimeout(() => { this.notice = ''; this._emit(); }, 2000);
  }
}
