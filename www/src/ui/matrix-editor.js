/* Matrix writer — spreadsheet grid that round-trips RPL Matrix values. */

import { parseEntry } from '../rpl/parser.js';
import { format } from '../rpl/formatter.js';
import {
  Matrix, Vector, Real,
  isMatrix, isVector, isList, isNumber, isSymbolic,
} from '../rpl/types.js';

export const MATRIX_MAX = 50;
export const MATRIX_DEFAULT = 3;

export function emptyGrid(rows, cols) {
  const r = clampDim(rows);
  const c = clampDim(cols);
  return Array.from({ length: r }, () => Array.from({ length: c }, () => ''));
}

export function identityGrid(n) {
  const d = clampDim(n);
  return Array.from({ length: d }, (_, i) =>
    Array.from({ length: d }, (_, j) => (i === j ? '1' : '0')));
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

/** Insert a blank row at `at` (0 = before first; length = after last). */
export function insertRow(grid, at) {
  if (grid.length >= MATRIX_MAX) return grid;
  const cols = grid[0]?.length || 1;
  const i = clampIndex(at, 0, grid.length);
  const next = grid.map(r => r.slice());
  next.splice(i, 0, Array.from({ length: cols }, () => ''));
  return next;
}

/** Remove the row at `at`.  Refuses to drop the last remaining row. */
export function deleteRow(grid, at) {
  if (grid.length <= 1) return grid;
  const i = clampIndex(at, 0, grid.length - 1);
  const next = grid.map(r => r.slice());
  next.splice(i, 1);
  return next;
}

/** Insert a blank column at `at`. */
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

/** Remove the column at `at`.  Refuses to drop the last remaining column. */
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
  throw new Error(`expected a number, got ${v?.type}`);
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

/** Push-side of the writer: a 1-row grid loaded from a Vector (or a
 *  numeric List) round-trips as a Vector; anything else is a Matrix.
 *  Growing past one row drops the vector flag so a 2×n edit can't
 *  silently collapse. */
export function gridToValue(grid, { asVector = false } = {}) {
  const m = gridToMatrix(grid);
  if (asVector && m.rows.length === 1) return Vector(m.rows[0]);
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

/** Overlay TSV / newline-separated text onto `grid` at (startR, startC),
 *  growing the grid if the paste rectangle does not fit.  A lone cell
 *  (no tab or newline) is returned unchanged so the caller can let the
 *  native input paste happen. */
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

export class MatrixEditor {
  constructor({ app } = {}) {
    this.app = app;
    this.grid = emptyGrid(MATRIX_DEFAULT, MATRIX_DEFAULT);
    this._asVector = false;
    this._focusR = 0;
    this._focusC = 0;
    this.el = document.createElement('div');
    this.el.className = 'mx-editor';
    this.el.innerHTML = `
      <div class="ed-toolbar">
        <label class="mx-dim">Rows <input type="number" class="mx-rows" min="1" max="${MATRIX_MAX}" value="${MATRIX_DEFAULT}" /></label>
        <label class="mx-dim">Cols <input type="number" class="mx-cols" min="1" max="${MATRIX_MAX}" value="${MATRIX_DEFAULT}" /></label>
        <button type="button" data-mx="id" title="Identity">I</button>
        <button type="button" data-mx="zero" title="Fill with zeros">0</button>
        <button type="button" data-mx="insRow" title="Insert row at the focused cell">+row</button>
        <button type="button" data-mx="delRow" title="Delete focused row">-row</button>
        <button type="button" data-mx="insCol" title="Insert column at the focused cell">+col</button>
        <button type="button" data-mx="delCol" title="Delete focused column">-col</button>
        <button type="button" data-mx="load" title="Copy stack level 1 into the grid">From stack</button>
        <button type="button" data-mx="push" title="Push this matrix onto the stack">To stack</button>
        <button type="button" data-mx="clear" title="Clear cells">Clear</button>
      </div>
      <div class="mx-scroll">
        <table class="mx-table"></table>
      </div>
      <div class="mx-status" role="status"></div>
    `;
    this._table = this.el.querySelector('.mx-table');
    this._status = this.el.querySelector('.mx-status');
    this._rowsIn = this.el.querySelector('.mx-rows');
    this._colsIn = this.el.querySelector('.mx-cols');
    this._bind();
    this._renderGrid();
  }

  _bind() {
    this.el.addEventListener('click', (ev) => {
      const btn = ev.target.closest?.('button[data-mx]');
      if (!btn) return;
      const act = btn.dataset.mx;
      if (act === 'id') this.fillIdentity();
      else if (act === 'zero') this.fillZeros();
      else if (act === 'insRow') this.insertRowAtFocus();
      else if (act === 'delRow') this.deleteRowAtFocus();
      else if (act === 'insCol') this.insertColAtFocus();
      else if (act === 'delCol') this.deleteColAtFocus();
      else if (act === 'load') this.loadFromStack();
      else if (act === 'push') this.push();
      else if (act === 'clear') this.clear();
    });
    const onDim = () => {
      this.grid = resizeGrid(this.grid, this._rowsIn.value, this._colsIn.value);
      if (this.grid.length !== 1) this._asVector = false;
      this._renderGrid();
    };
    this._rowsIn.addEventListener('change', onDim);
    this._colsIn.addEventListener('change', onDim);
    this._table.addEventListener('keydown', (ev) => this._onKey(ev));
    this._table.addEventListener('focusin', (ev) => {
      const cell = ev.target.closest?.('input.mx-cell');
      if (!cell) return;
      this._focusR = Number(cell.dataset.r);
      this._focusC = Number(cell.dataset.c);
    });
    this._table.addEventListener('paste', (ev) => this._onPaste(ev));
    this._table.addEventListener('input', (ev) => {
      const cell = ev.target.closest?.('input.mx-cell');
      if (!cell) return;
      const r = Number(cell.dataset.r);
      const c = Number(cell.dataset.c);
      if (!this.grid[r]) return;
      this.grid[r][c] = cell.value;
      this._status.textContent = '';
      this._status.classList.remove('error');
    });
  }

  _onKey(ev) {
    const cell = ev.target.closest?.('input.mx-cell');
    if (!cell) return;
    ev.stopPropagation();
    const r = Number(cell.dataset.r);
    const c = Number(cell.dataset.c);
    const rows = this.grid.length;
    const cols = this.grid[0].length;
    let nr = r, nc = c;
    if (ev.key === 'Enter') {
      ev.preventDefault();
      nr = (r + 1) % rows;
    } else if (ev.key === 'Tab') {
      ev.preventDefault();
      if (ev.shiftKey) {
        nc = c - 1;
        if (nc < 0) { nc = cols - 1; nr = (r - 1 + rows) % rows; }
      } else {
        nc = c + 1;
        if (nc >= cols) { nc = 0; nr = (r + 1) % rows; }
      }
    } else if (ev.key === 'ArrowUp') {
      ev.preventDefault(); nr = Math.max(0, r - 1);
    } else if (ev.key === 'ArrowDown') {
      ev.preventDefault(); nr = Math.min(rows - 1, r + 1);
    } else if (ev.key === 'ArrowLeft'
               && cell.selectionStart === 0 && cell.selectionEnd === 0) {
      ev.preventDefault();
      nc = c - 1;
      if (nc < 0) { nc = cols - 1; nr = Math.max(0, r - 1); }
    } else if (ev.key === 'ArrowRight'
               && cell.selectionStart === cell.value.length
               && cell.selectionEnd === cell.value.length) {
      ev.preventDefault();
      nc = c + 1;
      if (nc >= cols) { nc = 0; nr = Math.min(rows - 1, r + 1); }
    } else {
      return;
    }
    this._focusCell(nr, nc, { select: true });
  }

  _onPaste(ev) {
    const cell = ev.target.closest?.('input.mx-cell');
    if (!cell) return;
    const text = ev.clipboardData?.getData('text/plain') ?? '';
    if (!/[\t\n\r]/.test(text)) return;
    ev.preventDefault();
    const r = Number(cell.dataset.r);
    const c = Number(cell.dataset.c);
    this.grid = pasteIntoGrid(this.grid, r, c, text);
    if (this.grid.length !== 1) this._asVector = false;
    this._renderGrid();
    this._focusCell(r, c);
    this._status.textContent = '';
    this._status.classList.remove('error');
  }

  _focusCell(r, c, { select = false } = {}) {
    const rows = this.grid.length;
    const cols = this.grid[0]?.length || 1;
    const nr = Math.max(0, Math.min(rows - 1, r));
    const nc = Math.max(0, Math.min(cols - 1, c));
    this._focusR = nr;
    this._focusC = nc;
    const next = this._table.querySelector(`input.mx-cell[data-r="${nr}"][data-c="${nc}"]`);
    if (!next) return;
    next.focus();
    if (select) next.select();
  }

  insertRowAtFocus() {
    const at = this._focusR;
    this.grid = insertRow(this.grid, at);
    this._asVector = false;
    this._renderGrid();
    this._focusCell(at, this._focusC);
  }

  deleteRowAtFocus() {
    const at = this._focusR;
    this.grid = deleteRow(this.grid, at);
    this._renderGrid();
    this._focusCell(at, this._focusC);
  }

  insertColAtFocus() {
    const at = this._focusC;
    this.grid = insertCol(this.grid, at);
    this._renderGrid();
    this._focusCell(this._focusR, at);
  }

  deleteColAtFocus() {
    const at = this._focusC;
    this.grid = deleteCol(this.grid, at);
    this._renderGrid();
    this._focusCell(this._focusR, at);
  }

  _syncDimInputs() {
    this._rowsIn.value = String(this.grid.length);
    this._colsIn.value = String(this.grid[0]?.length || 1);
  }

  _renderGrid() {
    const rows = this.grid.length;
    const cols = this.grid[0]?.length || 1;
    const thead = ['<tr><th></th>'];
    for (let c = 0; c < cols; c++) thead.push(`<th>${c + 1}</th>`);
    thead.push('</tr>');
    const body = [];
    for (let r = 0; r < rows; r++) {
      const cells = [`<th>${r + 1}</th>`];
      for (let c = 0; c < cols; c++) {
        const val = this.grid[r][c] ?? '';
        cells.push(
          `<td><input class="mx-cell" data-r="${r}" data-c="${c}" ` +
          `value="${escapeAttr(val)}" spellcheck="false" /></td>`
        );
      }
      body.push(`<tr>${cells.join('')}</tr>`);
    }
    this._table.innerHTML = `<thead>${thead.join('')}</thead><tbody>${body.join('')}</tbody>`;
    this._syncDimInputs();
  }

  fillIdentity() {
    const n = Math.max(this.grid.length, this.grid[0]?.length || 1);
    this.grid = identityGrid(n);
    this._asVector = false;
    this._renderGrid();
  }

  fillZeros() {
    this.grid = zerosGrid(this.grid.length, this.grid[0]?.length || 1);
    if (this.grid.length !== 1) this._asVector = false;
    this._renderGrid();
  }

  clear() {
    this.grid = emptyGrid(this.grid.length, this.grid[0]?.length || 1);
    this._renderGrid();
    this._status.textContent = '';
    this._status.classList.remove('error');
  }

  loadFromStack(level = 1) {
    const stack = this.app?.stack;
    if (!stack || stack.depth < 1) {
      this.app?.entry?.flashError?.({ message: 'Matrix: empty stack' });
      return true;
    }
    if (level < 1 || level > stack.depth) return true;
    const top = stack.peek(level);
    const grid = valueToGrid(top);
    if (!grid) {
      this.app?.entry?.flashError?.({ message: 'Matrix: that stack level is not a matrix, vector, list, or number' });
      return true;
    }
    this._asVector = isVector(top) || (isList(top) && top.items.every(isNumber));
    this.grid = grid;
    this._renderGrid();
    this._status.textContent = `Copied L${level} (${grid.length} × ${grid[0].length})`;
    this._status.classList.remove('error');
    return true;
  }

  push() {
    try {
      const v = gridToValue(this.grid, { asVector: this._asVector });
      const entry = this.app?.entry;
      if (entry?.buffer?.trim?.().length > 0) entry.enter();
      this.app.stack.push(v);
      this._status.textContent = isVector(v)
        ? `Pushed vector ${v.items.length}`
        : `Pushed ${v.rows.length} × ${v.rows[0].length}`;
      this._status.classList.remove('error');
    } catch (e) {
      this._status.textContent = e.message;
      this._status.classList.add('error');
      this.app?.entry?.flashError?.({ message: `Matrix: ${e.message}` });
    }
  }
}

function escapeAttr(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
