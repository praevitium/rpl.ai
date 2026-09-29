import { parseEntry } from '../rpl/parser.js';
import { hpTextToSource } from '../rpl/hp-text.js';
import { lookup } from '../rpl/ops.js';
import { RPLAbort, RPLError, withTimeLimit, RUN_TIME_LIMIT_MS } from '../rpl/stack.js';
import { errorBeep } from './beep.js';
import {
  saveVarStateForUndo, undoVarState, redoVarState,
  hasVarRedo, varStateMatchesUndoTop, dropVarUndoTop,
} from '../rpl/state.js';
import {
  EditorState, EditorView, Transaction, keymap, drawSelection,
  history, defaultKeymap, undo as cmUndo, redo as cmRedo,
} from '../../vendor/codemirror/codemirror.bundle.js';

const UNDO_WORD = /^(UNDO|LASTSTACK|REDO)$/i;

function errorText(e) {
  return e && typeof e === 'object' && e.message != null ? String(e.message) : String(e);
}

function pushCapped(list, item, max) {
  list.push(item);
  if (list.length > max) list.splice(0, list.length - max);
}

export class Entry {
  static HISTORY_MAX = 20;
  static ERROR_LOG_MAX = 10;

  constructor(stack) {
    this.stack = stack;
    this._state = EditorState.create({ doc: '' });
    this._view = null;
    this.error = '';
    this._listeners = new Set();
    this._historyListeners = new Set();
    this._history = [];
    this._errorLog = [];
  }

  _dispatch(spec) {
    if (this._view) {
      this._view.dispatch(spec);
      this._state = this._view.state;
    } else {
      this._state = this._state.update(spec).state;
    }
  }

  get buffer() { return this._state.doc.toString(); }
  set buffer(s) {
    const next = String(s ?? '');
    this._dispatch({
      changes: { from: 0, to: this._state.doc.length, insert: next },
      selection: { anchor: Math.min(this.cursor, next.length) },
    });
  }

  // Kept out of the text-undo history, so a committed, cancelled or
  // recalled line never comes back on ⌘Z.
  resetBuffer(text) {
    const next = String(text ?? '');
    this._dispatch({
      changes: { from: 0, to: this._state.doc.length, insert: next },
      selection: { anchor: next.length },
      annotations: Transaction.addToHistory.of(false),
    });
  }

  get cursor() { return this._state.selection.main.head; }
  set cursor(n) {
    const len = this._state.doc.length;
    const clamped = Math.max(0, Math.min(Number(n) || 0, len));
    this._dispatch({ selection: { anchor: clamped } });
  }

  attach(parent, { onCommit, onCancel, onArrowUpEmpty, onArrowDownEmpty,
                   onArrowLeftEmpty, onArrowRightEmpty, onBackspaceEmpty, onDeleteEmpty } = {}) {
    if (this._view) return;
    const isEmpty = () => this._view.state.doc.length === 0;
    const delegateIfEmpty = (cb) => () => {
      if (!isEmpty() || !cb) return false;
      return cb() !== false;
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
      { key: 'Escape',      run: () => { onCancel?.(); return true; } },
      { key: 'ArrowUp',     run: delegateIfEmpty(onArrowUpEmpty) },
      { key: 'ArrowDown',   run: delegateIfEmpty(onArrowDownEmpty) },
      { key: 'ArrowLeft',   run: delegateIfEmpty(onArrowLeftEmpty) },
      { key: 'ArrowRight',  run: delegateIfEmpty(onArrowRightEmpty) },
      { key: 'Backspace',   run: delegateIfEmpty(onBackspaceEmpty) },
      { key: 'Delete',      run: delegateIfEmpty(onDeleteEmpty) },
    ]);
    this._view = new EditorView({
      state: EditorState.create({
        doc: this.buffer,
        selection: { anchor: this.cursor },
        extensions: [
          history(),
          drawSelection(),
          appKeys,
          keymap.of(defaultKeymap),
          EditorView.clipboardInputFilter.of(hpTextToSource),
          // Paste and programmatic edits don't scroll to the caret the way
          // CM's own keys do, so every edit scrolls it into view.
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

  undoText() { if (this._view) cmUndo(this._view); }
  redoText() { if (this._view) cmRedo(this._view); }

  posAtCoords(x, y) { return this._view?.posAtCoords({ x, y }) ?? null; }

  hasFocus() { return !!this._view?.hasFocus; }

  subscribe(fn) { this._listeners.add(fn); return () => this._listeners.delete(fn); }
  subscribeHistory(fn) { this._historyListeners.add(fn); return () => this._historyListeners.delete(fn); }
  _emit() { for (const fn of this._listeners) fn(this); }
  _emitHistory() { for (const fn of this._historyListeners) fn(this); }

  paste(text) {
    this.type(hpTextToSource(text));
  }

  type(text) {
    this.error = '';
    this.buffer = this.buffer.slice(0, this.cursor) + text + this.buffer.slice(this.cursor);
    this.cursor += text.length;
    this._emit();
    this.focus();
  }

  typeToken(text) {
    this.type(`${this._needsLeadingSpace() ? ' ' : ''}${text}`);
  }

  isAlgebraic() {
    let count = 0;
    for (const ch of this.buffer) if (ch === '`') count++;
    return (count % 2) === 1;
  }

  isEditing() {
    return this.buffer.length > 0;
  }

  typeOrExec(char, opName) {
    if (this.isEditing()) this.type(char);
    else this.execOp(opName ?? char);
  }

  _needsLeadingSpace() {
    return this.cursor > 0 && !/\s/.test(this.buffer[this.cursor - 1]);
  }

  typeOrExecFn(fnName) {
    if (this.isAlgebraic()) this.type(fnName + '(');
    else this.typeOrExecName(fnName);
  }

  typeOrExecName(opName) {
    if (this.isEditing()) this.typeToken(`${opName} `);
    else this.execOp(opName);
  }

  typeWithCursor(text, backUp = 0) {
    this.type(text);
    if (backUp > 0) {
      this.cursor = Math.max(0, this.cursor - backUp);
      this._emit();
    }
  }

  _snapForUndo() {
    this.stack.saveForUndo();
    saveVarStateForUndo();
  }

  performUndo() {
    if (!this.stack.hasUndo()) throw new RPLError('No undo available');
    // Variables first, so stack listeners redraw against the restored variables.
    undoVarState();
    this.stack.undo();
  }

  performRedo() {
    if (!this.stack.hasRedo()) throw new RPLError('No redo available');
    if (hasVarRedo()) redoVarState();
    this.stack.redo();
  }

  _recordHistory(text) {
    const s = String(text ?? '').trim();
    if (!s || this._history.at(-1) === s) return;
    pushCapped(this._history, s, Entry.HISTORY_MAX);
    this._emitHistory();
  }

  getHistory() {
    return this._history.slice();
  }

  removeHistory(text) {
    const idx = this._history.indexOf(String(text ?? ''));
    if (idx < 0) return false;
    this._history.splice(idx, 1);
    return true;
  }

  getErrorLog() {
    return this._errorLog.map(e => ({ ...e }));
  }

  clearErrorLog() {
    this._errorLog.length = 0;
    this._emitHistory();
  }

  _recordError(message) {
    pushCapped(this._errorLog, { message, input: this.buffer.trim(), at: Date.now() }, Entry.ERROR_LOG_MAX);
    this._emitHistory();
  }

  clearHistory() {
    this._history.length = 0;
  }

  recall(text) {
    this.resetBuffer(text);
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

  cursorUp() {
    const before = this.buffer.slice(0, this.cursor);
    const nl = before.lastIndexOf('\n');
    if (nl === -1) return;
    const curCol = this.cursor - nl - 1;
    const prevStart = before.slice(0, nl).lastIndexOf('\n') + 1;
    const prevLen = nl - prevStart;
    const newCol = Math.min(curCol, prevLen);
    this.cursor = prevStart + newCol;
    this._emit();
  }

  cursorDown() {
    const nl = this.buffer.indexOf('\n', this.cursor);
    if (nl === -1) return;
    const lineStart = this.buffer.lastIndexOf('\n', this.cursor - 1) + 1;
    const curCol = this.cursor - lineStart;
    const nextStart = nl + 1;
    const nextNl = this.buffer.indexOf('\n', nextStart);
    const nextLen = (nextNl === -1 ? this.buffer.length : nextNl) - nextStart;
    const newCol = Math.min(curCol, nextLen);
    this.cursor = nextStart + newCol;
    this._emit();
  }

  backspace() {
    this.error = '';
    if (this.buffer.length === 0) {
      this._snapForUndo();
      try { this.stack.drop(); } catch (e) { this._dropNoOpUndoStep(); this.flashError(e); }
      return;
    }
    if (this.cursor > 0) {
      this.buffer = this.buffer.slice(0, this.cursor - 1) + this.buffer.slice(this.cursor);
      this.cursor--;
      this._emit();
    }
  }

  cancel() {
    this.resetBuffer('');
    this.error = '';
    this._emit();
  }

  // As on the HP 50g, +/- on a number with an exponent flips the exponent's sign.
  toggleSign() {
    this.error = '';
    if (this.buffer.length === 0) {
      this.execOp('NEG');
      return;
    }
    const t = this.buffer;

    let i = this.cursor - 1;
    while (i >= 0 && /[0-9.eE+\-]/.test(t[i]) && !(i < this.cursor - 1 && (t[i] === '+' || t[i] === '-') && /[0-9.]/.test(t[i + 1]) === false)) i--;
    const startTok = i + 1;

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
      const afterE = eIdx + 1;
      const ch = t[afterE];
      if (ch === '-') {
        this.buffer = t.slice(0, afterE) + t.slice(afterE + 1);
        if (this.cursor > afterE) this.cursor -= 1;
      } else if (ch === '+') {
        this.buffer = t.slice(0, afterE) + '-' + t.slice(afterE + 1);
      } else {
        this.buffer = t.slice(0, afterE) + '-' + t.slice(afterE);
        if (this.cursor >= afterE) this.cursor += 1;
      }
      this._emit();
      return;
    }

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

  eex() {
    if (this.buffer.length === 0) { this.type('1E'); return; }
    const tail = this.buffer.slice(0, this.cursor);
    const lastTok = tail.match(/[0-9.+\-eE]+$/)?.[0] ?? '';
    if (/[eE]/.test(lastTok)) return;
    this.type('E');
  }

  // A failed command leaves its arguments on the stack, as on the HP 50g.
  // ABORT is the exception: the stack stays as the program left it.
  // True when the body ran to completion.
  safeRun(body, context = '') {
    const rollback = this.stack.save();
    try {
      withTimeLimit(RUN_TIME_LIMIT_MS, body);
      return true;
    } catch (e) {
      if (e instanceof RPLAbort) {
        this.flashNotice('Program aborted');
        return false;
      }
      this.stack.restore(rollback);
      this._dropNoOpUndoStep();
      this.flashError(context ? new RPLError(`${context}: ${errorText(e)}`) : e);
      return false;
    }
  }

  _dropNoOpUndoStep() {
    if (this.stack.undoTopMatchesCurrent() && varStateMatchesUndoTop()) {
      this.stack.dropUndoTop();
      dropVarUndoTop();
    }
  }

  _runOpTagged(opName, tag = opName) {
    const op = lookup(opName);
    if (!op) throw new RPLError(`Undefined: ${opName}`);
    const seen = this.stack.snapshot().slice(0, 3);
    try {
      this.stack.runOp(() => op.fn(this.stack, this));
    } catch (e) {
      if (e instanceof RPLAbort) throw e;
      this.failure = { op: tag, levels: seen };
      throw new RPLError(`${tag}: ${errorText(e)}`);
    }
  }

  enter() {
    this.error = '';
    this.failure = null;
    const raw = this.buffer.trim();
    const words = raw ? raw.split(/\s+/) : [];
    // A line of only UNDO/REDO words walks the undo history directly: the
    // snapshot below would otherwise make the first UNDO a no-op.
    if (words.length && words.every((w) => UNDO_WORD.test(w))) {
      try {
        for (const w of words) {
          if (w.toUpperCase() === 'REDO') this.performRedo();
          else this.performUndo();
        }
      } catch (e) { this.flashError(e); return; }
      this._clearCommittedBuffer(raw);
      this._emit();
      return;
    }
    this._snapForUndo();
    if (!raw) {
      this.safeRun(() => this.stack.dup());
      return;
    }
    this.safeRun(() => {
      this._commitEntry(raw);
      this._emit();
    });
  }

  // An ABORT still commits the entry: it lands in history and the buffer clears.
  _commitEntry(raw) {
    try {
      for (const v of parseEntry(raw)) {
        if (v?.type === 'name' && !v.quoted && lookup(v.id)) this._runOpTagged(v.id);
        else if (v?.type === 'name' && !v.quoted) { this.stack.push(v); this._runOpTagged('EVAL', v.id); }
        else this.stack.push(v);
      }
    } catch (e) {
      if (e instanceof RPLAbort) this._clearCommittedBuffer(raw);
      throw e;
    }
    this._clearCommittedBuffer(raw);
  }

  _clearCommittedBuffer(raw) {
    this._recordHistory(raw);
    this.resetBuffer('');
  }

  execOp(name) {
    this.error = '';
    this.failure = null;
    this._snapForUndo();
    this.safeRun(() => {
      if (this.buffer.trim().length > 0) this._commitEntry(this.buffer.trim());
      this._runOpTagged(name);
    });
    this._emit();
  }

  flashError(e) {
    this.error = errorText(e);
    this._recordError(this.error);
    this.notice = '';
    clearTimeout(this._noticeTimer);
    this._emit();
    errorBeep();
  }

  flashNotice(msg) {
    this.notice = String(msg);
    this._emit();
    clearTimeout(this._noticeTimer);
    this._noticeTimer = setTimeout(() => { this.notice = ''; this._emit(); }, 2000);
  }
}
