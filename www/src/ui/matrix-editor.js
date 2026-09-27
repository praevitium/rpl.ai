import { escapeHtml } from './display.js';
import { parseEntry } from '../rpl/parser.js';
import { format } from '../rpl/formatter.js';
import { Var, parseAlgebra } from '../rpl/algebra.js';
import {
  Matrix, Vector, Real, Symbolic,
  isMatrix, isVector, isList, isNumber, isSymbolic, isName, isValidHpIdentifier,
} from '../rpl/types.js';

export const MATRIX_MAX = 50;
export const MATRIX_DEFAULT = 3;

export function emptyGrid(rows, cols) {
  const r = clampDim(rows);
  const c = clampDim(cols);
  return Array.from({ length: r }, () => Array.from({ length: c }, () => ''));
}

export function identityGrid(rows, cols = rows) {
  const r = clampDim(rows);
  const c = clampDim(cols);
  return Array.from({ length: r }, (_, i) =>
    Array.from({ length: c }, (_, j) => (i === j ? '1' : '0')));
}

export function zerosGrid(rows, cols) {
  const r = clampDim(rows);
  const c = clampDim(cols);
  return Array.from({ length: r }, () => Array.from({ length: c }, () => '0'));
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

export function isVectorShape(grid) {
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

export function parseMatrixCell(text) {
  const t = String(text ?? '').trim();
  if (t === '') return Real(0);
  const values = parseEntry(t);
  if (values.length !== 1) {
    throw new Error(`expected one value, got ${values.length}`);
  }
  const v = values[0];
  if (isNumber(v) || isSymbolic(v)) return v;
  if (isName(v) && (v.id === '∞' || isValidHpIdentifier(v.id))) return Symbolic(Var(v.id));
  try { return Symbolic(parseAlgebra(t)); }
  catch (e) { throw new Error(e.message || `expected a number, got ${v?.type}`); }
}

export function gridToMatrix(grid) {
  if (!grid.length || !grid[0].length) {
    throw new Error('empty matrix');
  }
  const rows = grid.map((row, i) => row.map((cell, j) => {
    try { return parseMatrixCell(cell); }
    catch (e) {
      throw new Error(`r${i + 1}c${j + 1}: ${e.message}`);
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

export function pasteIntoGrid(grid, startR, startC, text) {
  const raw = String(text ?? '').replace(/\r\n|\r/g, '\n');
  if (!/[\t\n]/.test(raw)) return grid;
  const lines = raw.split('\n');
  if (lines.length && lines[lines.length - 1] === '') lines.pop();
  const parsed = lines.map(line => line.split('\t'));
  if (!parsed.length) return grid;
  const r0 = Math.max(0, startR | 0);
  const c0 = Math.max(0, startC | 0);
  const needR = r0 + parsed.length;
  const needC = Math.max(grid[0]?.length || 1, ...parsed.map(row => c0 + row.length));
  const next = resizeGrid(grid, Math.max(grid.length, needR), needC);
  for (let i = 0; i < parsed.length; i++) {
    for (let j = 0; j < parsed[i].length; j++) {
      next[r0 + i][c0 + j] = parsed[i][j];
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

export class MatrixEditor {
  constructor({ app } = {}) {
    this.app = app;
    this.grid = emptyGrid(MATRIX_DEFAULT, MATRIX_DEFAULT);
    this.asVector = false;
    this._focusR = 0;
    this._focusC = 0;
    this.el = document.createElement('div');
    this.el.className = 'mx';
    this.el.innerHTML = '<div class="mx-grid-wrap"><div class="mx-grid" role="grid" aria-label="Matrix cells"></div></div><div class="mx-foot mx-shape" role="status"></div>';
    this._gridEl = this.el.querySelector('.mx-grid');
    this._shape = this.el.querySelector('.mx-shape');
    this._gridEl.addEventListener('keydown', (e) => this._onKey(e));
    this._gridEl.addEventListener('paste', (e) => this._onPaste(e));
    this._gridEl.addEventListener('focusin', (e) => {
      const cell = e.target.closest?.('input.mx-cell');
      if (!cell) return;
      this._focusR = Number(cell.dataset.r);
      this._focusC = Number(cell.dataset.c);
    });
    this._gridEl.addEventListener('input', (e) => {
      const cell = e.target.closest?.('input.mx-cell');
      if (!cell || !this.grid[cell.dataset.r]) return;
      this.grid[cell.dataset.r][cell.dataset.c] = cell.value;
      this._noteShape();
    });
    this._renderGrid();
  }

  load(value) {
    const grid = valueToGrid(value);
    if (!grid) return false;
    this.asVector = isVector(value) || (isList(value) && value.items.every(isNumber) && !value.items.some(isList));
    this.grid = grid;
    this._focusR = 0;
    this._focusC = 0;
    this._renderGrid();
    return true;
  }

  value() {
    let rows = this.grid.length;
    while (rows > 1 && this.grid[rows - 1].every((cell) => !String(cell ?? '').trim())) rows--;
    return gridToValue(this.grid.slice(0, rows), { asVector: this.asVector });
  }

  clear() {
    this.grid = emptyGrid(this.grid.length, this.grid[0]?.length || 1);
    this._focusR = 0;
    this._focusC = 0;
    this._renderGrid();
  }

  isEmpty() { return this.grid.every((row) => row.every((cell) => !String(cell ?? '').trim())); }

  snapshot() { return { grid: this.grid.map((row) => row.slice()), asVector: this.asVector }; }

  restore(saved) {
    this.grid = saved.grid.map((row) => row.slice());
    this.asVector = saved.asVector;
    this._renderGrid();
  }

  focus() { requestAnimationFrame(() => this._focusCell(this._focusR, this._focusC, { select: true })); }

  commit() {
    if (this.isEmpty()) { this.app.notifyError('Type some numbers first.'); return; }
    let value;
    try { value = this.value(); }
    catch (e) {
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
      { label: 'CLEAR', title: 'Empty every cell', onPress: run(() => this.clear()) },
      ...SYMBOLS.map((s) => ({ label: s.text, title: `${s.title} in the focused cell`, onPress: () => this.insertSymbol(s.text) })),
    ];
  }

  loadFromStack() {
    const { stack } = this.app;
    if (!stack.depth) { this.app.notifyError('The stack is empty.'); return; }
    if (!this.load(stack.peek(1))) this.app.notifyError("Level 1 isn't a matrix, vector, list or number.");
  }

  insertSymbol(text) {
    const r = Math.min(this._focusR, this.grid.length - 1);
    const c = Math.min(this._focusC, (this.grid[0]?.length || 1) - 1);
    const input = this._cell(r, c);
    const current = this.grid[r][c] ?? '';
    const start = document.activeElement === input ? input.selectionStart ?? current.length : current.length;
    const end = document.activeElement === input ? input.selectionEnd ?? start : start;
    this.grid[r][c] = current.slice(0, start) + text + current.slice(end);
    if (input) {
      input.value = this.grid[r][c];
      input.focus();
      input.setSelectionRange(start + text.length, start + text.length);
    }
  }

  transpose() {
    this.grid = transposeGrid(this.grid);
    [this._focusR, this._focusC] = [this._focusC, this._focusR];
    this._reshaped();
  }

  insertRowAtFocus() { this.grid = insertRow(this.grid, this._focusR); this._reshaped(); }

  deleteRowAtFocus() { this.grid = deleteRow(this.grid, this._focusR); this._reshaped(); }

  insertColAtFocus() { this.grid = insertCol(this.grid, this._focusC); this._reshaped(); }

  deleteColAtFocus() { this.grid = deleteCol(this.grid, this._focusC); this._reshaped(); }

  fill(makeGrid) {
    this.grid = makeGrid(this.grid.length, this.grid[0]?.length || 1);
    this._reshaped();
  }

  toggleVector() {
    this.asVector = !this.asVector && isVectorShape(this.grid);
    if (!this.asVector && !isVectorShape(this.grid)) this.app.notifyError('Only a single row or column can be pushed as a vector.');
    this._noteShape();
  }

  _reshaped() {
    if (!isVectorShape(this.grid)) this.asVector = false;
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
    if (e.key === 'Enter') next = [(r + 1) % rows, c];
    else if (e.key === 'Tab' && !e.shiftKey && r === rows - 1 && c === cols - 1) {
      this.grid = resizeGrid(this.grid, rows + 1, cols);
      this.asVector = false;
      this._renderGrid();
      next = [rows, 0];
    } else if (e.key === 'Tab') next = e.shiftKey ? (c > 0 ? [r, c - 1] : [(r - 1 + rows) % rows, cols - 1]) : (c < cols - 1 ? [r, c + 1] : [r + 1, 0]);
    else if (e.key === 'ArrowUp') next = [Math.max(0, r - 1), c];
    else if (e.key === 'ArrowDown') next = [Math.min(rows - 1, r + 1), c];
    else if (e.key === 'ArrowLeft' && atStart) next = c > 0 ? [r, c - 1] : [Math.max(0, r - 1), cols - 1];
    else if (e.key === 'ArrowRight' && atEnd) next = c < cols - 1 ? [r, c + 1] : [Math.min(rows - 1, r + 1), 0];
    if (!next) return;
    e.preventDefault();
    e.stopPropagation();
    this._focusCell(next[0], next[1], { select: true });
  }

  _onPaste(e) {
    const cell = e.target.closest?.('input.mx-cell');
    const text = e.clipboardData?.getData('text/plain') ?? '';
    if (!cell || !/[\t\n\r]/.test(text)) return;
    e.preventDefault();
    const r = Number(cell.dataset.r);
    const c = Number(cell.dataset.c);
    this.grid = pasteIntoGrid(this.grid, r, c, text);
    if (this.grid.length !== 1) this.asVector = false;
    this._renderGrid();
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
    const rows = this.grid.length;
    const cols = this.grid[0]?.length || 1;
    const kind = this.asVector && isVectorShape(this.grid) ? `vector of ${Math.max(rows, cols)}` : `${rows} × ${cols} matrix`;
    this._shape.textContent = error || `${kind} · Tab on the last cell adds a row · paste a spreadsheet range`;
    this._shape.classList.toggle('error', !!error);
  }

  _renderGrid() {
    const cols = this.grid[0]?.length || 1;
    this._gridEl.style.gridTemplateColumns = `repeat(${cols}, auto)`;
    this._gridEl.innerHTML = this.grid.map((row, r) => row.map((cell, c) => (
      `<input class="mx-cell" data-r="${r}" data-c="${c}" value="${escapeHtml(cell ?? '')}" spellcheck="false" autocomplete="off" aria-label="Row ${r + 1}, column ${c + 1}">`
    )).join('')).join('');
    this._noteShape();
  }
}
