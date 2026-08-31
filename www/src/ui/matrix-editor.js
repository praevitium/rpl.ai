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

export function valueToGrid(v) {
  if (isMatrix(v)) {
    return v.rows.map(row => row.map(cell => cellToDraft(cell)));
  }
  if (isVector(v)) {
    return [v.items.map(cell => cellToDraft(cell))];
  }
  if (isList(v) && v.items.every(isNumber)) {
    return [v.items.map(cell => cellToDraft(cell))];
  }
  if (isNumber(v)) return [[cellToDraft(v)]];
  return null;
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
    this.el = document.createElement('div');
    this.el.className = 'mx-editor';
    this.el.innerHTML = `
      <div class="ed-toolbar">
        <label class="mx-dim">Rows <input type="number" class="mx-rows" min="1" max="${MATRIX_MAX}" value="${MATRIX_DEFAULT}" /></label>
        <label class="mx-dim">Cols <input type="number" class="mx-cols" min="1" max="${MATRIX_MAX}" value="${MATRIX_DEFAULT}" /></label>
        <button type="button" data-mx="id" title="Identity">I</button>
        <button type="button" data-mx="zero" title="Fill with zeros">0</button>
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
    } else if (ev.key === 'ArrowUp' && ev.altKey) {
      ev.preventDefault(); nr = Math.max(0, r - 1);
    } else if (ev.key === 'ArrowDown' && ev.altKey) {
      ev.preventDefault(); nr = Math.min(rows - 1, r + 1);
    } else if (ev.key === 'ArrowLeft' && ev.altKey) {
      ev.preventDefault(); nc = Math.max(0, c - 1);
    } else if (ev.key === 'ArrowRight' && ev.altKey) {
      ev.preventDefault(); nc = Math.min(cols - 1, c + 1);
    } else {
      return;
    }
    const next = this._table.querySelector(`input.mx-cell[data-r="${nr}"][data-c="${nc}"]`);
    if (next) { next.focus(); next.select(); }
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
      this.app?.entry?.flashError?.({ message: 'Matrix: that stack level is not a matrix, vector, or number' });
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
