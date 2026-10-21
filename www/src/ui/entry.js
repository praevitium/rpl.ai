import { parseTyped, endsInQuote } from '../rpl/parser.js';
import { hpTextToSource } from '../rpl/hp-text.js';
import { latexToSource } from '../rpl/latex.js';
import { spreadsheetToSource, htmlTableToSource } from '../rpl/sheet.js';
import { lookup, isProgramLine, runProgramLine, keepsFailureStack } from '../rpl/ops.js';
import { RPLAbort, RPLError, withTimeLimit, RUN_TIME_LIMIT_MS } from '../rpl/stack.js';
import { errorBeep } from './beep.js';
import {
  saveVarStateForUndo, undoVarState, redoVarState,
  hasVarRedo, varStateMatchesUndoTop, dropVarUndoTop, touchLcd,
} from '../rpl/state.js';
import {
  EditorState, EditorView, Transaction, keymap, drawSelection,
  history, defaultKeymap, undo as cmUndo, redo as cmRedo,
} from '../../vendor/codemirror/codemirror.bundle.js';

const UNDO_WORD = /^(UNDO|LASTSTACK|REDO)$/i;
const onTouch = () => globalThis.matchMedia?.('(pointer: coarse)').matches === true;

const pastedSource = (text) => latexToSource(text) ?? spreadsheetToSource(text) ?? hpTextToSource(text);

// As on the HP, a line that doesn't parse keeps the cursor at the word that broke it: ^10 in 2^10, #ff for its #ffd.
export function errorSpot(line, message) {
  const word = String(message).match(/near (\S+)$|^Unexpected '(.+)'$|: (\S+)$/)?.slice(1).find(Boolean);
  for (const w of word ? [word, word.slice(0, -1)] : []) {
    const at = w ? line.indexOf(w) : -1;
    if (at >= 0) return at;
  }
  return -1;
}

// The line with brackets, strings, quotes and comments blanked, leaving the words that run on their own.
function topLevelText(line) {
  let depth = 0, until = null, out = '';
  for (let i = 0; i < line.length; i++) {
    const c = line[i], pair = (c === '<' || c === '>') && line[i + 1] === c;
    const top = !until && depth === 0;
    if (until) { if (c === until || (until === '\n' && c === '\r')) until = null; }
    else if (c === '"' || c === "'" || c === '`') until = c;
    else if (c === '@' && !/\S/.test(line[i - 1] ?? ' ')) until = '\n';
    else if ('«{[('.includes(c) || (pair && c === '<')) depth++;
    else if ('»}])'.includes(c) || (pair && c === '>')) depth = Math.max(0, depth - 1);
    const keep = top && !until && depth === 0;
    out += keep ? c : ' ';
    if (pair && !keep) { out += ' '; i++; }
  }
  return out;
}

// Where the line's nth top-level word naming id starts, so Fix the line lands on the command that failed.
export function commandSpot(line, id, nth = 0) {
  for (const word of topLevelText(line).matchAll(/[^\s,]+/g)) {
    let value;
    try { [value] = parseTyped(word[0]); } catch { continue; }
    if (value?.type === 'name' && !value.quoted && value.id === id && nth-- === 0) return word.index;
  }
  return -1;
}

function failedSpot(line, values, failed) {
  const name = values[failed];
  if (name?.type !== 'name' || name.quoted) return -1;
  const before = values.slice(0, failed).filter((v) => v?.type === 'name' && !v.quoted && v.id === name.id).length;
  return commandSpot(line, name.id, before);
}

function errorText(e) {
  return e && typeof e === 'object' && e.message != null ? String(e.message) : String(e);
}

function scanOpen(text) {
  const open = [];
  let quote = null, string = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (string) { if (c === '"') string = false; continue; }
    if (quote) { if (c === quote) quote = null; continue; }
    if (c === '"') string = true;
    else if (c === "'" || c === '`') quote = c;
    else if ('«{[('.includes(c)) open.push(c);
    else if ('»}])'.includes(c)) open.pop();
    // A phone keyboard's << and >> are the HP's « and », as the parser reads them.
    else if ((c === '<' || c === '>') && text[i + 1] === c) {
      if (c === '<') open.push('«'); else open.pop();
      i++;
    }
  }
  const last = text.match(/\S*$/)[0];
  const literal = string || quote !== null || last.includes('_') || /^[-+]?(\d+\.?\d*|\.\d+)[eE]$/.test(last);
  return { innermost: open.at(-1), literal };
}

// True while the command line is still inside an object: a quote, string, program, list, vector or
// complex number, a unit after _, or an exponent waiting for its sign. The HP's keys type there.
export function inOpenObject(text) {
  const { innermost, literal } = scanOpen(text);
  return literal || innermost !== undefined;
}

// The HP's program-entry mode: in a program or a list an operator key types its command, not a character.
export function inProgramEntry(text) {
  const { innermost, literal } = scanOpen(text);
  return !literal && (innermost === '«' || innermost === '{');
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
    this.errorLine = '';
    this.errorSpot = -1;
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
                   onArrowLeftEmpty, onArrowRightEmpty, onBackspaceEmpty, onDeleteEmpty, onHomeEmpty, onEndEmpty, onType, onShiftEnter } = {}) {
    if (this._view) return;
    const isEmpty = () => this._view.state.doc.length === 0;
    const delegateIfEmpty = (cb) => () => {
      if (!isEmpty() || !cb) return false;
      return cb() !== false;
    };
    const appKeys = keymap.of([
      { key: 'Enter',       run: () => { onCommit?.(); return true; } },
      { key: 'Shift-Enter', run: (view) => {
          if (onShiftEnter?.()) return true;
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
      { key: 'Home',        run: delegateIfEmpty(onHomeEmpty) },
      { key: 'End',         run: delegateIfEmpty(onEndEmpty) },
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
          // A program waiting at 0 WAIT takes a typed character as its key.
          EditorView.inputHandler.of((_view, _from, _to, text) => onType?.(text) === true),
          // A phone's Enter key runs the line here, so it says go rather than new line; a screen reader names the line.
          EditorView.contentAttributes.of({ enterkeyhint: 'go', 'aria-label': 'Command line' }),
          // A phone shows a few words of a line, so a long one wraps rather than scrolling out of sight.
          ...(onTouch() ? [EditorView.lineWrapping] : []),
          EditorView.clipboardInputFilter.of(pastedSource),
          EditorView.domEventHandlers({
            paste: (event) => {
              const source = htmlTableToSource(event.clipboardData?.getData('text/html') ?? '');
              if (source === null) return false;
              event.preventDefault();
              this.type(source);
              return true;
            },
          }),
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

  // A phone offers the line no keyboard while the calc keypad types.
  setPhoneKeyboard(mode) {
    const dom = this._view?.contentDOM;
    if (!dom) return;
    if (mode) dom.setAttribute('inputmode', mode);
    else dom.removeAttribute('inputmode');
  }

  undoText() { if (this._view) cmUndo(this._view); }
  redoText() { if (this._view) cmRedo(this._view); }

  posAtCoords(x, y) { return this._view?.posAtCoords({ x, y }) ?? null; }

  hasFocus() { return !!this._view?.hasFocus; }

  subscribe(fn) { this._listeners.add(fn); return () => this._listeners.delete(fn); }
  subscribeHistory(fn) { this._historyListeners.add(fn); return () => this._historyListeners.delete(fn); }
  _emit() { for (const fn of this._listeners) fn(this); }
  _emitHistory() { for (const fn of this._historyListeners) fn(this); }

  paste(text) {
    this.type(pastedSource(text));
  }

  // Typing over a selection replaces it, as in any text field.
  type(text) {
    this.error = '';
    const { from, to } = this._state.selection.main;
    this.buffer = this.buffer.slice(0, from) + text + this.buffer.slice(to);
    this.cursor = from + text.length;
    this._emit();
    this.focus();
  }

  // A program, list or vector typed after a word starts a word of its own, as in the HP's program-entry mode.
  typeObject(text, backUp) {
    const before = this.buffer.slice(0, this.cursor);
    const glued = /[^\s«{[(]$/.test(before) && !scanOpen(before).literal;
    this.typeWithCursor(`${glued ? ' ' : ''}${text}`, backUp);
  }

  // A token lands with a space on each side it needs, so a line recalled or a level echoed into the middle of a
  // line never fuses with the word under the cursor.
  typeToken(text) {
    this.type(`${this._needsLeadingSpace() ? ' ' : ''}${text}${this._needsTrailingSpace(text) ? ' ' : ''}`);
  }

  isAlgebraic() {
    return endsInQuote(this.buffer);
  }

  isEditing() {
    return this.buffer.length > 0;
  }

  _needsLeadingSpace() {
    const { from } = this._state.selection.main;
    return from > 0 && !/\s/.test(this.buffer[from - 1]);
  }

  _needsTrailingSpace(text) {
    const { to } = this._state.selection.main;
    return to < this.buffer.length && !/\s/.test(this.buffer[to]) && !/\s$/.test(text);
  }

  typeOrExecFn(fnName) {
    if (this.isAlgebraic()) this.type(fnName + '(');
    else this.typeOrExecName(fnName);
  }

  typeOrExecName(opName) {
    if (this.isEditing()) this.typeToken(`${opName} `);
    else this.execOp(opName);
  }

  // The keypad and the phone's key strip work like the HP's keys: they enter the line and run,
  // unless an object is still open.
  pressOperator(char, opName) {
    if (inProgramEntry(this.buffer.slice(0, this.cursor))) this.typeToken(`${char} `);
    else if (this._typingAtCursor()) this.type(char);
    else this.execOp(opName);
  }

  // In a program → starts a local-variable structure, so it stands apart like the HP's;
  // elsewhere it begins a name such as →NUM.
  pressArrow() {
    if (inProgramEntry(this.buffer.slice(0, this.cursor))) this.typeToken('→ ');
    else this.type('→');
  }

  // As on the HP, a variable's key types its name inside an open object, and in a program ⇦ and ⇨
  // type a STO or RCL of it. Returns false when the key should run instead.
  typeVariable(name, layer = null) {
    const before = this.buffer.slice(0, this.cursor);
    if (inProgramEntry(before)) this.typeToken(layer === 'L' ? `\`${name}\` STO ` : layer === 'R' ? `\`${name}\` RCL ` : `${name} `);
    else if (inOpenObject(before)) this.type(name);
    else return false;
    return true;
  }

  pressCommand(opName) {
    if (this._typingAtCursor()) this.typeToken(`${opName} `);
    else this.execOp(opName);
  }

  pressFunction(fnName) {
    if (this.isAlgebraic()) this.type(fnName + '(');
    else this.pressCommand(fnName);
  }

  _typingAtCursor() {
    return inOpenObject(this.buffer.slice(0, this.cursor));
  }

  // A BRCH key types a program structure's words between spaces, with the cursor after the first.
  // Structures run only inside a program, so a bare line gets one opened first.
  typeStructure(words) {
    if (!inOpenObject(this.buffer.slice(0, this.cursor))) this.typeObject('«  »', 2);
    const text = `${words.join('  ')} `;
    this.typeToken(text);
    this.cursor -= text.length - words[0].length - 1;
    this._emit();
  }

  typeWithCursor(text, backUp = 0) {
    this.type(text);
    if (backUp > 0) {
      this.cursor = Math.max(0, this.cursor - backUp);
      this._emit();
    }
  }

  // Every action that changes the stack or the variables starts here, and the error before it no longer applies:
  // the HP's message goes at the next key.
  _snapForUndo() {
    this.stack.saveForUndo();
    saveVarStateForUndo();
    if (this.error) { this.error = ''; this._emit(); }
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
    pushCapped(this._errorLog, { message, input: this.buffer.trim() || this.errorLine, at: Date.now() }, Entry.ERROR_LOG_MAX);
    this._emitHistory();
  }

  clearHistory() {
    this._history.length = 0;
  }

  recall(text, at = -1) {
    this.resetBuffer(text);
    if (at >= 0) this.cursor = at;
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
    if (this.buffer.length === 0) return;
    const { from, to } = this._state.selection.main;
    if (to > from) {
      this.buffer = this.buffer.slice(0, from) + this.buffer.slice(to);
      this.cursor = from;
      this._emit();
    } else if (this.cursor > 0) {
      const at = this.cursor;
      this._dispatch({ changes: { from: at - 1, to: at }, selection: { anchor: at - 1 } });
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
        const at = this.cursor;
        this.buffer = t.slice(0, afterE) + t.slice(afterE + 1);
        if (at > afterE) this.cursor = at - 1;
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
      const at = this.cursor;
      this.buffer = t.slice(0, startTok) + t.slice(startTok + 1);
      this.cursor = at - 1;
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

  // A failed command leaves its arguments on the stack, as on the HP 50g.  With
  // keepPartial (the command line) what ran before it stays, as on the HP;
  // otherwise the whole action is undone.  ABORT keeps the stack as the program
  // left it.  A failure keeps typed ({ line, spot }), the line a key was pressed on,
  // for Fix the line.  True when the body ran to completion.
  safeRun(body, context = '', { keepPartial = false, typed = null } = {}) {
    const rollback = this.stack.save();
    try {
      withTimeLimit(RUN_TIME_LIMIT_MS, body);
      return true;
    } catch (e) {
      if (e instanceof RPLAbort) {
        this.flashNotice('Program aborted');
        return false;
      }
      if (!this.failure && e.depth != null) this.failure = { op: null, levels: [], depth: e.depth, missing: e.missing };
      if (!keepPartial) this.stack.restore(rollback);
      this._dropNoOpUndoStep();
      const error = context ? new RPLError(`${context}: ${errorText(e)}`) : e;
      if (typed && error instanceof Error && error.line == null) Object.assign(error, typed);
      this.flashError(error);
      return false;
    }
  }

  _dropNoOpUndoStep() {
    if (this.stack.undoTopMatchesCurrent() && varStateMatchesUndoTop()) {
      this.stack.dropUndoTop();
      dropVarUndoTop();
    }
  }

  // A command typed sin or ->q is named SIN or →Q, as the HP spells it.
  _runOpTagged(opName, tag) {
    const op = lookup(opName);
    if (!op) throw new RPLError(`Undefined: ${opName}`);
    tag ??= op.name;
    const before = this.stack.save();
    const seen = this.stack.snapshot().slice(0, 3);
    try {
      this.stack.runOp(() => op.fn(this.stack, this));
    } catch (e) {
      if (e instanceof RPLAbort) throw e;
      if (!keepsFailureStack(e)) this.stack.restore(before);
      this.failure = { op: tag, levels: seen, depth: e.depth ?? before.length, missing: e.missing };
      const text = errorText(e);
      throw new RPLError(text.startsWith(`${tag}: `) ? text : `${tag}: ${text}`);
    }
  }

  enter() {
    this.error = '';
    this.failure = null;
    touchLcd();
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
      this.safeRun(() => this.stack.dup(), 'DUP');
      return;
    }
    this.safeRun(() => {
      this._commitEntry(raw);
      this._emit();
    }, '', { keepPartial: true });
  }

  // A syntax error keeps the line for editing.  Once the line runs it is used up,
  // as on the HP, even when it fails or aborts; a failure keeps it on the error
  // (e.line) for Fix the line.
  _commitEntry(raw) {
    let values;
    try {
      values = parseTyped(raw);
    } catch (e) {
      const at = errorSpot(this.buffer, errorText(e));
      if (at >= 0) this.cursor = at;
      throw e;
    }
    let failed = -1;
    try {
      if (isProgramLine(values)) this.stack.runOp(() => runProgramLine(this.stack, values));
      else this.stack.holdEmit(() => {
        for (const v of values) {
          failed++;
          if (v?.type === 'name' && !v.quoted && lookup(v.id)) this._runOpTagged(v.id);
          else if (v?.type === 'name' && !v.quoted) { this.stack.push(v); this._runOpTagged('EVAL', v.id); }
          else this.stack.push(v);
        }
      });
    } catch (e) {
      if (e instanceof Error && !(e instanceof RPLAbort)) { e.line = raw; e.spot = failedSpot(raw, values, failed); }
      throw e;
    } finally {
      this._clearCommittedBuffer(raw);
    }
  }

  _clearCommittedBuffer(raw) {
    this._recordHistory(raw);
    this.resetBuffer('');
  }

  // Several names run as one step, with one Undo.
  execOp(...names) {
    this.error = '';
    this.failure = null;
    touchLcd();
    this._snapForUndo();
    this.safeRun(() => {
      const raw = this.buffer.trim();
      if (raw) this._commitEntry(raw);
      let at = raw.length;
      try {
        for (const name of names) { at += 1; this._runOpTagged(name); at += name.length; }
      } catch (e) {
        // A key pressed on a typed line fails as the line and the command typed together would, so Fix the line brings back both.
        if (raw && e instanceof Error && !(e instanceof RPLAbort)) { e.line = `${raw} ${names.join(' ')}`; e.spot = at; }
        throw e;
      }
    }, '', { keepPartial: true });
    this._emit();
  }

  flashError(e) {
    this.error = errorText(e);
    this.errorLine = e?.line ?? '';
    this.errorSpot = e?.spot ?? -1;
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
