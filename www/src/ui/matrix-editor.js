import { escapeHtml } from './display.js';
import { writerKeys } from './input-area.js';
import { parseEntry } from '../rpl/parser.js';
import { format } from '../rpl/formatter.js';
import { Var, parseAlgebra } from '../rpl/algebra.js';
import { sheetNumber, htmlTableToText } from '../rpl/sheet.js';
import {
  Matrix, Vector, Real, Complex, Symbolic,
  isMatrix, isVector, isList, isNumber, isSymbolic, isName, isValidHpIdentifier,
} from '../rpl/types.js';

export const MATRIX_MAX = 50;
const MATRIX_DEFAULT = 3;
const HISTORY_MAX = 100;

function makeGrid(rows, cols, cell) {
  return Array.from({ length: clampDim(rows) }, (_, i) => Array.from({ length: clampDim(cols) }, (_, j) => cell(i, j)));
}

export function emptyGrid(rows, cols) {
  return makeGrid(rows, cols, () => '');
}

export function identityGrid(rows, cols = rows) {
  return makeGrid(rows, cols, (i, j) => (i === j ? '1' : '0'));
}

export function zerosGrid(rows, cols) {
  return makeGrid(rows, cols, () => '0');
}

export function clampDim(n) {
  const v = Math.floor(Number(n));
  if (!Number.isFinite(v) || v < 1) return 1;
  return Math.min(MATRIX_MAX, v);
}

export function resizeGrid(grid, rows, cols) {
  const r = clampDim(rows);
  const c = clampDim(cols);
  const next = emptyGrid(r, c);
  for (let i = 0; i < Math.min(r, grid.length); i++) {
    for (let j = 0; j < Math.min(c, (grid[i] || []).length); j++) {
      next[i][j] = grid[i][j];
    }
  }
  return next;
}

function clampIndex(n, lo, hi) {
  const v = Math.floor(Number(n));
  if (!Number.isFinite(v)) return lo;
  return Math.max(lo, Math.min(hi, v));
}

export function insertRow(grid, at) {
  if (grid.length >= MATRIX_MAX) return grid;
  const cols = grid[0]?.length || 1;
  const i = clampIndex(at, 0, grid.length);
  const next = grid.map(r => r.slice());
  next.splice(i, 0, Array.from({ length: cols }, () => ''));
  return next;
}

export function deleteRow(grid, at) {
  if (grid.length <= 1) return grid;
  const i = clampIndex(at, 0, grid.length - 1);
  const next = grid.map(r => r.slice());
  next.splice(i, 1);
  return next;
}

export function insertCol(grid, at) {
  const cols = grid[0]?.length || 1;
  if (cols >= MATRIX_MAX) return grid;
  const i = clampIndex(at, 0, cols);
  return grid.map(row => {
    const r = row.slice();
    r.splice(i, 0, '');
    return r;
  });
}

export function transposeGrid(grid) {
  const rows = grid.length;
  const cols = grid[0]?.length || 0;
  if (!rows || !cols) return grid.map(row => row.slice());
  return Array.from({ length: cols }, (_, c) =>
    Array.from({ length: rows }, (_, r) => grid[r][c] ?? ''));
}

// What the writer pushes: trailing rows and columns with nothing typed in them are left off.
export function trimGrid(grid) {
  const filled = (cell) => String(cell ?? '').trim() !== '';
  let rows = grid.length;
  while (rows > 1 && !grid[rows - 1].some(filled)) rows--;
  let cols = grid[0]?.length || 1;
  while (cols > 1 && !grid.slice(0, rows).some((row) => filled(row[cols - 1]))) cols--;
  return grid.slice(0, rows).map((row) => row.slice(0, cols));
}

// EEX types E after a number, 1E where no number is, and nothing when the number has its exponent already.
export function eexText(before) {
  if (/(?:\d+\.?\d*|\.\d+)[eE][+-]?\d*$/.test(before)) return '';
  return /[\d.]$/.test(before) ? 'E' : '1E';
}

function isVectorShape(grid) {
  const rows = grid.length;
  const cols = grid[0]?.length || 0;
  return rows === 1 || cols === 1;
}

export function deleteCol(grid, at) {
  const cols = grid[0]?.length || 1;
  if (cols <= 1) return grid;
  const i = clampIndex(at, 0, cols - 1);
  return grid.map(row => {
    const r = row.slice();
    r.splice(i, 1);
    return r;
  });
}

const SCALAR = /^(?:(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d*)?(?:_.+)?|\p{L}[\p{L}\p{N}]*|∞)$/u;
const TRAILING = /^(.*?)([+-]?)((?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d*)?|\p{L}[\p{L}\p{N}]*|∞)?$/u;

function wrapsWhole(text) {
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '(') depth++;
    else if (text[i] === ')' && --depth === 0) return i === text.length - 1;
  }
  return false;
}

// While typing, +/- changes the sign of the operand being typed, or of its
// exponent after EEX, as on the HP 50g; otherwise it negates the whole cell.
export function toggleCellSign(text, { typing = false } = {}) {
  if (!typing) return negateCell(text);
  const [, head, sign, operand = ''] = text.match(TRAILING);
  if (/^[\d.].*[eE]/.test(operand)) return head + sign + operand.replace(/([eE])(-?)\+?/, (_, e, minus) => (minus ? e : `${e}-`));
  const afterTerm = /[\p{L}\p{N}.)∞]$/u.test(head);
  if (sign === '-') return head + (afterTerm ? '+' : '') + operand;
  if (sign === '+' || operand || !afterTerm) return `${head}-${operand}`;
  return negateCell(text);
}

function negateCell(text) {
  const t = text.trim().replace(/^[`'](.*)[`']$/, '$1').replace(/^\+/, '');
  const complex = t.match(/^\(([^,()]+),([^,()]+)\)$/);
  if (complex) {
    const im = complex[2].trim();
    return `(${negateCell(complex[1])},${im.startsWith('∠') ? im : negateCell(im)})`;
  }
  if (!t || t === '-') return t ? '' : '-';
  if (t.startsWith('-') && SCALAR.test(t.slice(1))) return t.slice(1);
  if (SCALAR.test(t)) return `-${t}`;
  return t.startsWith('-(') && wrapsWhole(t.slice(1)) ? `\`${t.slice(2, -1)}\`` : `\`-(${t})\``;
}

// Where a caret in `before` lands in `after`, following the characters they share.
export function mapCaret(before, after, caret) {
  const lcs = Array.from({ length: before.length + 1 }, () => new Uint16Array(after.length + 1));
  for (let i = before.length - 1; i >= 0; i--) {
    for (let j = after.length - 1; j >= 0; j--) {
      lcs[i][j] = before[i] === after[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  let i = 0;
  let j = 0;
  let mapped = 0;
  while (i < caret && j < after.length) {
    if (before[i] === after[j]) {
      i++;
      j++;
      mapped = j;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) i++;
    else j++;
  }
  return mapped;
}

function sameGrid(a, b) {
  return a.length === b.length && a.every((row, r) => row.length === b[r].length && row.every((cell, c) => (cell ?? '') === (b[r][c] ?? '')));
}

// 1+2i, -3i or 2.5-i as a spreadsheet or textbook writes a complex number.
function complexCell(text) {
  const m = /^([-+]?(?:\d+\.?\d*|\.\d+)(?:E[-+]?\d+)?)?([-+](?:\d+\.?\d*|\.\d+)?(?:E[-+]?\d+)?)?[ij]$/i.exec(text.replace(/\s+/g, ''));
  if (!m || (!m[1] && !m[2])) return null;
  const unit = (sign) => Number(`${sign}1`);
  if (!m[2]) return Complex(0, /^[-+]?$/.test(m[1]) ? unit(m[1]) : Number(m[1]));
  return Complex(Number(m[1] ?? 0), /^[-+]$/.test(m[2]) ? unit(m[2]) : Number(m[2]));
}

export function parseMatrixCell(text) {
  const t = String(text ?? '').trim();
  if (t === '') return Real(0);
  let values;
  try { values = parseEntry(t); } catch { values = []; }
  const v = values.length === 1 ? values[0] : null;
  if (v && (isNumber(v) || isSymbolic(v))) return v;
  if (v && isName(v) && (v.id === '∞' || isValidHpIdentifier(v.id))) return Symbolic(Var(v.id));
  // 2,500, 10% and $1,234.50 as a spreadsheet writes them, and 1+2i.
  const sheet = sheetNumber(t);
  if (sheet) return parseEntry(sheet)[0];
  const z = complexCell(t);
  if (z) return z;
  try { return Symbolic(parseAlgebra(t)); }
  catch (e) {
    throw new Error(values.length > 1 ? `expected one value, got ${values.length}` : e.message || `expected a number, got ${v?.type}`);
  }
}

export function gridToMatrix(grid) {
  if (!grid.length || !grid[0].length) {
    throw new Error('empty matrix');
  }
  const rows = grid.map((row, i) => row.map((cell, j) => {
    try { return parseMatrixCell(cell); }
    catch {
      throw Object.assign(new Error(`Row ${i + 1}, column ${j + 1} isn't a number or an expression: ${String(cell).trim()}`), { cell: [i, j] });
    }
  }));
  return Matrix(rows);
}

export function gridToValue(grid, { asVector = false } = {}) {
  const m = gridToMatrix(grid);
  if (asVector && m.rows.length === 1) return Vector(m.rows[0]);
  if (asVector && m.rows[0].length === 1) return Vector(m.rows.map(row => row[0]));
  return m;
}

function isCellValue(v) {
  return isNumber(v) || isSymbolic(v);
}

function isRowLike(v) {
  return (isList(v) || isVector(v)) && v.items.every(isCellValue);
}

export function valueToGrid(v) {
  if (isMatrix(v)) {
    return v.rows.map(row => row.map(cell => cellToDraft(cell)));
  }
  if (isVector(v)) {
    return [v.items.map(cell => cellToDraft(cell))];
  }
  if (isList(v)) {
    if (v.items.length && v.items.every(isRowLike)) {
      const rows = v.items.map(row => row.items.map(cell => cellToDraft(cell)));
      const cols = Math.max(1, ...rows.map(r => r.length));
      return rows.map(r => r.length === cols ? r : padRow(r, cols));
    }
    if (v.items.every(isCellValue)) {
      return [v.items.map(cell => cellToDraft(cell))];
    }
  }
  if (isNumber(v)) return [[cellToDraft(v)]];
  return null;
}

function padRow(row, cols) {
  const out = row.slice();
  while (out.length < cols) out.push('');
  return out;
}

function pastedCells(text) {
  const raw = String(text ?? '').replace(/\r\n|\r/g, '\n');
  if (!/[\t\n]/.test(raw)) return null;
  const lines = raw.split('\n');
  if (lines.length && lines[lines.length - 1] === '') lines.pop();
  return lines.map(line => line.split('\t'));
}

// Cells that fall outside the 50 × 50 limit are left out.
export function pasteIntoGrid(grid, startR, startC, text) {
  const parsed = pastedCells(text);
  if (!parsed?.length) return grid;
  const r0 = Math.max(0, startR | 0);
  const c0 = Math.max(0, startC | 0);
  const needC = parsed.reduce((w, row) => Math.max(w, c0 + row.length), grid[0]?.length || 1);
  const next = resizeGrid(grid, Math.max(grid.length, r0 + parsed.length), needC);
  for (let i = 0; i < parsed.length && r0 + i < next.length; i++) {
    for (let j = 0; j < parsed[i].length && c0 + j < next[0].length; j++) {
      next[r0 + i][c0 + j] = sheetNumber(parsed[i][j]) ?? parsed[i][j];
    }
  }
  return next;
}

function cellToDraft(v) {
  if (v == null) return '';
  return format(v);
}

const SYMBOLS = Object.freeze([
  Object.freeze({ text: 'π', title: 'Pi' }),
  Object.freeze({ text: 'i', title: 'Imaginary unit' }),
  Object.freeze({ text: '∞', title: 'Infinity' }),
]);

const FACE_TEXT = Object.freeze({ '−': '-', '×': '*', '÷': '/', 'yˣ': '^', SPC: ' ', ',': ',', '∠': '∠' });
const FACE_MOVES = Object.freeze({ '▲': [-1, 0], '▼': [1, 0], '◀': [0, -1], '▶': [0, 1] });
const FACE_STEPS = Object.freeze({ TAB: 'next', '⇧TAB': 'prev', '⇧ENTER': 'down' });
const TAP_KEYS = Object.freeze([
  { face: '⇧TAB', icon: 'chl', title: 'Previous cell (⇧Tab)' },
  { face: 'TAB', icon: 'chr', title: 'Next cell (Tab)' },
  { face: '⇧ENTER', icon: 'down', title: 'Next row (⇧Enter)' },
]);

export class MatrixEditor {
  constructor({ app } = {}) {
    this.app = app;
    this.grid = emptyGrid(MATRIX_DEFAULT, MATRIX_DEFAULT);
    this.asVector = false;
    this._focusR = 0;
    this._focusC = 0;
    this._runC = 0;
    this._tabbing = false;
    this._past = [];
    this._future = [];
    this._mergeCell = null;
    this._typedCell = null;
    this.el = document.createElement('div');
    this.el.className = 'mx';
    this.el.innerHTML = '<div class="mx-grid-wrap"><div class="mx-grid" role="grid" aria-label="Matrix cells"></div></div><div class="mx-foot" role="status"></div>';
    this._gridEl = this.el.querySelector('.mx-grid');
    this._shape = this.el.querySelector('.mx-foot');
    this.el.append(writerKeys(TAP_KEYS, (face) => this.pressFace(face)));
    this._gridEl.addEventListener('keydown', (e) => this._onKey(e));
    this._gridEl.addEventListener('paste', (e) => this._onPaste(e));
    this._gridEl.addEventListener('focusin', (e) => {
      const cell = e.target.closest?.('input.mx-cell');
      if (!cell) return;
      this._focusR = Number(cell.dataset.r);
      this._focusC = Number(cell.dataset.c);
      if (!this._tabbing) this._runC = this._focusC;
      this._mergeCell = null;
      this._typedCell = null;
    });
    this._gridEl.addEventListener('input', (e) => {
      const cell = e.target.closest?.('input.mx-cell');
      if (!cell || !this.grid[cell.dataset.r]) return;
      const key = `${cell.dataset.r},${cell.dataset.c}`;
      this._remember(key);
      this._typedCell = key;
      this.grid[cell.dataset.r][cell.dataset.c] = cell.value;
      this._noteShape();
    });
    this._renderGrid();
  }

  load(value) {
    const grid = valueToGrid(value);
    if (!grid) return false;
    this._forget();
    this._show(value, grid);
    return true;
  }

  _show(value, grid) {
    this.asVector = isVector(value) || (isList(value) && value.items.every(isNumber));
    this.grid = grid;
    this._focusR = 0;
    this._focusC = 0;
    this._renderGrid();
  }

  value() {
    return gridToValue(trimGrid(this.grid), { asVector: this.asVector });
  }

  clear() {
    this.grid = emptyGrid(MATRIX_DEFAULT, MATRIX_DEFAULT);
    this.asVector = false;
    this._focusR = 0;
    this._focusC = 0;
    this._runC = 0;
    this._forget();
    this._renderGrid();
  }

  canUndo() { return this._past.length > 0; }

  canRedo() { return this._future.length > 0; }

  undo() { this._travel(this._past, this._future); }

  redo() { this._travel(this._future, this._past); }

  _travel(from, to) {
    if (!from.length) return;
    to.push(this.snapshot());
    this.restore(from.pop());
    this._focusCell(this._focusR, this._focusC, { select: true });
    this._mergeCell = null;
    this._typedCell = null;
    this.app.dismissError?.();
    this.app.menubar?.render();
    this._historyChanged();
  }

  // Typing in one cell is one undo step; every other change is a step of its own.
  _remember(cell = null) {
    this.app.dismissError?.();
    if (cell && cell === this._mergeCell) return;
    this._past.push(this.snapshot());
    if (this._past.length > HISTORY_MAX) this._past.shift();
    this._future = [];
    this._mergeCell = cell;
    this._historyChanged();
  }

  _forget() {
    this._past = [];
    this._future = [];
    this._mergeCell = null;
    this._typedCell = null;
    this._historyChanged();
  }

  _historyChanged() { this.app.appbar?.updateHistory(); }

  isEmpty() { return this.grid.every((row) => row.every((cell) => !String(cell ?? '').trim())); }

  snapshot() { return { grid: this.grid.map((row) => row.slice()), asVector: this.asVector, focus: [this._focusR, this._focusC] }; }

  restore(saved) {
    this.grid = saved.grid.map((row) => row.slice());
    this.asVector = saved.asVector;
    if (saved.focus) [this._focusR, this._focusC] = saved.focus;
    this._renderGrid();
  }

  // Focusing during the tap that opened the writer is what raises a phone's keyboard.
  focus() {
    this._focusCell(this._focusR, this._focusC, { select: true });
    requestAnimationFrame(() => {
      if (!this.el.contains(document.activeElement)) this._focusCell(this._focusR, this._focusC, { select: true });
    });
  }

  commit() {
    if (this.isEmpty()) { this.app.notifyError('Type some numbers first.'); return; }
    let value;
    try { value = this.value(); }
    catch (e) {
      if (e.cell) this._focusCell(...e.cell, { select: true });
      this._noteShape(e.message);
      this.app.notifyError(e.message);
      return;
    }
    this.app.writerCommit(value);
    this.clear();
  }

  menu() {
    const run = (fn) => () => { fn(); this.app.menubar.render(); };
    return [
      { label: '+ROW', title: 'Insert a row at the focused cell', onPress: run(() => this.insertRowAtFocus()) },
      { label: '−ROW', title: 'Delete the focused row', onPress: run(() => this.deleteRowAtFocus()) },
      { label: '+COL', title: 'Insert a column at the focused cell', onPress: run(() => this.insertColAtFocus()) },
      { label: '−COL', title: 'Delete the focused column', onPress: run(() => this.deleteColAtFocus()) },
      { label: 'TRN', title: 'Transpose', onPress: run(() => this.transpose()) },
      { label: 'DONE', title: 'Push it to the stack (Enter)', onPress: () => this.app.commitEntry() },
      { label: 'IDN', title: 'Fill with the identity', onPress: run(() => this.fill(identityGrid)) },
      { label: 'ZERO', title: 'Fill with zeros', onPress: run(() => this.fill(zerosGrid)) },
      { label: 'VECT', title: 'Push a single row or column as a vector', toggle: true, on: () => this.asVector, onPress: run(() => this.toggleVector()) },
      { label: 'FROM1', title: 'Copy level 1 into the grid; Enter then pushes a new one', onPress: run(() => this.loadFromStack()) },
      { label: 'CLEAR', title: 'Empty every cell', onPress: run(() => { this.fill(emptyGrid); this._focusCell(0, 0); }) },
      ...SYMBOLS.map((s) => ({ label: s.text, title: `${s.title} in the focused cell`, onPress: () => this.insertSymbol(s.text) })),
    ];
  }

  loadFromStack() {
    const { stack } = this.app;
    if (!stack.depth) { this.app.notifyError('The stack is empty.'); return; }
    const value = stack.peek(1);
    const grid = valueToGrid(value);
    if (!grid) { this.app.notifyError("Level 1 isn't a matrix, vector, list or number."); return; }
    this._remember();
    this._show(value, grid);
  }

  pressFace(face) {
    const move = FACE_MOVES[face];
    if (/^F[1-6]$/.test(face)) this.app.pressSoftKey(Number(face[1]) - 1);
    else if (face === 'PREV') this.app.prevMenuPage();
    else if (face === 'NEXT') this.app.nextMenuPage();
    else if (face === 'CAT') this.app.drawers.toggle('catalog');
    else if (face === 'EQW') this.app.runAction('writer.equation');
    else if (face === 'ENTER') this.app.commitEntry();
    else if (face === 'UNDO') this.app.runAction('edit.undo');
    else if (face === 'REDO') this.app.runAction('edit.redo');
    else if (move) this._focusCell(this._focusR + move[0], this._focusC + move[1], { select: true });
    else if (FACE_STEPS[face]) this._moveBy(FACE_STEPS[face], this._focusR, this._focusC);
    else if (face === '⌫') this._editCell('', { back: true });
    else if (face === 'DEL') this._editCell('', { forward: true });
    else if (face === 'CLEAR') { this.fill(emptyGrid); this._focusCell(0, 0); }
    else if (face === '( )') this._editCell('()', { caretBack: 1 });
    else if (face === 'EEX') this._editCell(eexText(this._textBeforeCaret()));
    else if (face === '+/-') this._toggleSign();
    else if (FACE_TEXT[face] || /^[0-9a-z.+π∞]$/.test(face)) this._editCell(FACE_TEXT[face] ?? face);
    else this.app.notifyError(`${face} isn't available in the matrix writer.`);
  }

  insertSymbol(text) { this._editCell(text); }

  _caret() {
    const [r, c] = this._activeCell();
    const input = this._cell(r, c);
    const current = this.grid[r][c] ?? '';
    const focused = document.activeElement === input;
    const start = focused ? input.selectionStart ?? current.length : current.length;
    const end = focused ? input.selectionEnd ?? start : start;
    return { r, c, current, start, end };
  }

  _textBeforeCaret() {
    const { current, start } = this._caret();
    return current.slice(0, start);
  }

  _editCell(text, { back = false, forward = false, caretBack = 0 } = {}) {
    let { r, c, current, start, end } = this._caret();
    if (back && start === end) start = Math.max(0, start - 1);
    if (forward && start === end) end = Math.min(current.length, end + 1);
    const caret = start + text.length - caretBack;
    this._writeCell(r, c, current.slice(0, start) + text + current.slice(end), [caret, caret]);
  }

  _toggleSign() {
    const [r, c] = this._activeCell();
    const input = this._cell(r, c);
    const old = this.grid[r][c] ?? '';
    const focused = document.activeElement === input;
    const start = focused ? input.selectionStart ?? old.length : old.length;
    const end = focused ? input.selectionEnd ?? start : start;
    const typing = this._typedCell === `${r},${c}` && start === end && end === old.length;
    const text = toggleCellSign(old, { typing });
    const whole = start === 0 && end === old.length && start !== end;
    const caret = end === old.length ? text.length : mapCaret(old, text, end);
    this._writeCell(r, c, text, whole ? [0, text.length] : [caret, caret], { typing: false });
  }

  _activeCell() {
    return [Math.min(this._focusR, this.grid.length - 1), Math.min(this._focusC, (this.grid[0]?.length || 1) - 1)];
  }

  _writeCell(r, c, text, [start, end], { typing = true } = {}) {
    const input = this._cell(r, c);
    input?.focus();
    const key = `${r},${c}`;
    if (text !== (this.grid[r][c] ?? '')) {
      this._remember(typing ? key : null);
      this.grid[r][c] = text;
    }
    if (typing) this._typedCell = key;
    if (input) {
      input.value = text;
      input.setSelectionRange(start, end);
    }
    this._noteShape();
  }

  transpose() {
    const grid = transposeGrid(this.grid);
    if (sameGrid(grid, this.grid)) return;
    this._remember();
    this.grid = grid;
    [this._focusR, this._focusC] = [this._focusC, this._focusR];
    this._reshaped();
  }

  insertRowAtFocus() { this._reshape(insertRow(this.grid, this._focusR)); }

  deleteRowAtFocus() { this._reshape(deleteRow(this.grid, this._focusR)); }

  insertColAtFocus() { this._reshape(insertCol(this.grid, this._focusC)); }

  deleteColAtFocus() { this._reshape(deleteCol(this.grid, this._focusC)); }

  _reshape(grid) {
    if (grid === this.grid) return;
    this._remember();
    this.grid = grid;
    this._reshaped();
  }

  fill(makeGrid) {
    const grid = makeGrid(this.grid.length, this.grid[0]?.length || 1);
    if (sameGrid(grid, this.grid)) return;
    this._remember();
    this.grid = grid;
    this._reshaped();
  }

  toggleVector() {
    if (!this.asVector && !isVectorShape(trimGrid(this.grid))) {
      this.app.notifyError('Only a single row or column can be pushed as a vector.');
      return;
    }
    this._remember();
    this.asVector = !this.asVector;
    this._noteShape();
  }

  _reshaped() {
    this._renderGrid();
    this._focusCell(this._focusR, this._focusC);
  }

  _cell(r, c) { return this._gridEl.querySelector(`input.mx-cell[data-r="${r}"][data-c="${c}"]`); }

  _onKey(e) {
    const cell = e.target.closest?.('input.mx-cell');
    if (!cell) return;
    const r = Number(cell.dataset.r);
    const c = Number(cell.dataset.c);
    const rows = this.grid.length;
    const cols = this.grid[0].length;
    const atStart = cell.selectionStart === 0 && cell.selectionEnd === 0;
    const atEnd = cell.selectionStart === cell.value.length && cell.selectionEnd === cell.value.length;
    let next = null;
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.stopPropagation(); this.app.commitEntry(); return; }
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      e.stopPropagation();
      this._moveBy(e.key === 'Enter' ? 'down' : e.shiftKey ? 'prev' : 'next', r, c);
      return;
    }
    if (e.key === 'ArrowUp') next = [Math.max(0, r - 1), c];
    else if (e.key === 'ArrowDown') next = [Math.min(rows - 1, r + 1), c];
    else if (e.key === 'ArrowLeft' && atStart) next = c > 0 ? [r, c - 1] : r > 0 ? [r - 1, cols - 1] : null;
    else if (e.key === 'ArrowRight' && atEnd) next = c < cols - 1 ? [r, c + 1] : r < rows - 1 ? [r + 1, 0] : null;
    if (!next) return;
    e.preventDefault();
    e.stopPropagation();
    this._focusCell(next[0], next[1], { select: true });
  }

  // Tab and ⇧Tab keep the column a run of typing started in, so ⇧Enter goes back to it on the next row, as in a spreadsheet.
  _moveBy(kind, r, c) {
    const next = this._step(kind, r, c);
    this._tabbing = kind !== 'down';
    this._focusCell(next[0], next[1], { select: true });
    this._tabbing = false;
  }

  _step(kind, r, c) {
    const rows = this.grid.length;
    const cols = this.grid[0].length;
    if (kind === 'prev') return c > 0 ? [r, c - 1] : [(r - 1 + rows) % rows, cols - 1];
    const last = kind === 'down' ? r === rows - 1 : r === rows - 1 && c === cols - 1;
    const column = kind === 'down' ? Math.min(this._runC, cols - 1) : 0;
    if (last) {
      if (rows >= MATRIX_MAX) return [0, column];
      this._remember();
      this.grid = resizeGrid(this.grid, rows + 1, cols);
      this._renderGrid();
      return [rows, column];
    }
    if (kind === 'down') return [r + 1, column];
    return c < cols - 1 ? [r, c + 1] : [r + 1, 0];
  }

  _onPaste(e) {
    const cell = e.target.closest?.('input.mx-cell');
    const text = htmlTableToText(e.clipboardData?.getData('text/html') ?? '') ?? e.clipboardData?.getData('text/plain') ?? '';
    if (!cell || !/[\t\n\r]/.test(text)) return;
    e.preventDefault();
    const r = Number(cell.dataset.r);
    const c = Number(cell.dataset.c);
    const grid = pasteIntoGrid(this.grid, r, c, text);
    if (!sameGrid(grid, this.grid)) {
      this._remember();
      this.grid = grid;
      this._renderGrid();
    }
    const cells = pastedCells(text);
    const width = cells.reduce((w, row) => Math.max(w, row.length), 0);
    if (r + cells.length > MATRIX_MAX || c + width > MATRIX_MAX) {
      this._noteShape(`The writer holds ${MATRIX_MAX} × ${MATRIX_MAX} at most, so the rest of the range was left out.`);
    }
    this._focusCell(r, c);
  }

  _focusCell(r, c, { select = false } = {}) {
    this._focusR = Math.max(0, Math.min(this.grid.length - 1, r));
    this._focusC = Math.max(0, Math.min((this.grid[0]?.length || 1) - 1, c));
    const cell = this._cell(this._focusR, this._focusC);
    if (!cell) return;
    cell.focus();
    if (select) cell.select();
  }

  _noteShape(error = '') {
    const shape = this.isEmpty() ? this.grid : trimGrid(this.grid);
    const rows = shape.length;
    const cols = shape[0]?.length || 1;
    const kind = this.asVector && isVectorShape(shape) ? `vector of ${Math.max(rows, cols)}` : `${rows} × ${cols} matrix`;
    this._shape.textContent = error || `${kind} · Tab on the last cell adds a row · paste a spreadsheet range`;
    this._shape.classList.toggle('error', !!error);
  }

  _renderGrid() {
    if (!isVectorShape(trimGrid(this.grid))) this.asVector = false;
    const cols = this.grid[0]?.length || 1;
    this._gridEl.style.gridTemplateColumns = `repeat(${cols}, auto)`;
    this._gridEl.innerHTML = this.grid.map((row, r) => row.map((cell, c) => (
      `<input class="mx-cell" data-r="${r}" data-c="${c}" value="${escapeHtml(cell ?? '')}" spellcheck="false" autocomplete="off" autocapitalize="off" autocorrect="off" enterkeyhint="done" aria-label="Row ${r + 1}, column ${c + 1}">`
    )).join('')).join('');
    this._noteShape();
  }
}
