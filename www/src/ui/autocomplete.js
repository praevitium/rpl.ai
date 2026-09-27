import { allOps } from '../rpl/ops.js';
import { varOrder, varRecall } from '../rpl/state.js';
import { shortDescription } from './command-reference.js';
import { fuzzyScore, matchPositions, highlightSegments } from './op-search.js';
import { escapeHtml, typeName } from './display.js';

const MAX_ROWS = 6;
const WORD_BREAK = /[\s{}[\]()"'`«»,+\-*/^=<>|]/;
const CLOSES_A_WORD = /^[\s)\]}»`']/;

export function wordBeforeCursor(text, cursor) {
  const before = String(text ?? '').slice(0, cursor);
  if ((before.match(/"/g) ?? []).length % 2 === 1) return null;
  let from = before.length;
  while (from > 0 && !WORD_BREAK.test(before[from - 1])) from--;
  const word = before.slice(from);
  return word ? { word, from } : null;
}

function completionScore(word, name) {
  const w = word.toUpperCase();
  const n = name.toUpperCase();
  if (n === w) return 2000;
  if (n.startsWith(w)) return 1500 - n.length;
  return Math.max(0, fuzzyScore(word, name));
}

export function completions(word, { names = [], variables = [] } = {}) {
  if (!word) return [];
  const seen = new Set();
  return [
    ...variables.map((name) => ({ name, kind: 'variable' })),
    ...names.filter((n) => !n.includes('->')).map((name) => ({ name, kind: 'command' })),
  ]
    .map((row) => ({ ...row, score: completionScore(word, row.name) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || a.name.length - b.name.length)
    .filter((row) => !seen.has(row.name.toUpperCase()) && seen.add(row.name.toUpperCase()))
    .slice(0, MAX_ROWS);
}

export function isInsideAlgebraic(text, offset) {
  return (String(text ?? '').slice(0, offset).match(/[`']/g) ?? []).length % 2 === 1;
}

export class Autocomplete {
  constructor({ host, cmdline, app }) {
    this.app = app;
    this.el = document.createElement('div');
    this.el.className = 'ac';
    this.el.hidden = true;
    this.el.setAttribute('role', 'listbox');
    this.el.setAttribute('aria-label', 'Completions');
    host.appendChild(this.el);
    this.rows = [];
    this.index = 0;
    this.word = null;
    this._dismissedWord = null;
    this.el.addEventListener('mousedown', (e) => e.preventDefault());
    this.el.addEventListener('click', (e) => {
      const row = e.target.closest('.ac-row');
      if (row) this.accept(Number(row.dataset.i));
    });
    cmdline.addEventListener('keydown', (e) => this._onKey(e), true);
    cmdline.addEventListener('focusout', () => this.close());
  }

  isOpen() { return !this.el.hidden; }

  update() {
    const { entry } = this.app;
    const text = entry.buffer;
    const at = this.app.inputMode === 'rpl' && entry.hasFocus() && !this.app.errorBanner && !text.trimStart().startsWith('?')
      ? wordBeforeCursor(text, entry.cursor) : null;
    if (!at) this._dismissedWord = null;
    const after = text.slice(entry.cursor);
    if (!at || at.word.length < 2 || /^[0-9.#_]/.test(at.word) || (after && !CLOSES_A_WORD.test(after)) || at.word === this._dismissedWord) {
      this.close();
      return;
    }
    const rows = completions(at.word, { names: allOps(), variables: varOrder() });
    if (!rows.length || (rows.length === 1 && rows[0].name === at.word)) { this.close(); return; }
    if (this.word?.word !== at.word) this.index = 0;
    this.word = at;
    this.rows = rows;
    this._render();
  }

  _render() {
    const { word } = this.word;
    const rowsHtml = this.rows.map((row, i) => {
      const segments = highlightSegments(row.name, matchPositions(word, row.name));
      const label = segments.length
        ? segments.map((s) => (s.match ? `<mark>${escapeHtml(s.text)}</mark>` : escapeHtml(s.text))).join('')
        : escapeHtml(row.name);
      const info = row.kind === 'command' ? this.app.commandInfo(row.name) : null;
      const detail = row.kind === 'variable'
        ? `Variable · ${typeName(varRecall(row.name))}`
        : info ? shortDescription(info.entry, 90) : '';
      return `<div class="ac-row${i === this.index ? ' on' : ''}" role="option" aria-selected="${i === this.index}" data-i="${i}"><b>${label}</b><span>${escapeHtml(detail)}</span><em>${escapeHtml(info?.signature ?? '')}</em></div>`;
    }).join('');
    this.el.innerHTML = `${rowsHtml}<div class="ac-foot"><span>Tab completes · ↑↓ choose · → reference</span><span>Esc closes</span></div>`;
    this.el.hidden = false;
  }

  close() {
    if (this.el.hidden) return;
    this.el.hidden = true;
    this.rows = [];
    this.index = 0;
  }

  accept(i = this.index) {
    const row = this.rows[i];
    if (!row || !this.word) return;
    const { entry } = this.app;
    const { from } = this.word;
    const to = entry.cursor;
    const text = entry.buffer;
    const spaced = row.kind === 'command' && !isInsideAlgebraic(text, from) && !/^\s/.test(text.slice(to));
    const insert = spaced ? `${row.name} ` : row.name;
    entry._dispatch({ changes: { from, to, insert }, selection: { anchor: from + insert.length } });
    this._dismissedWord = row.name;
    this.close();
    entry._emit();
  }

  _onKey(e) {
    if (!this.isOpen()) return;
    const { entry } = this.app;
    const consume = () => { e.preventDefault(); e.stopPropagation(); };
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      consume();
      this.index = (this.index + (e.key === 'ArrowDown' ? 1 : this.rows.length - 1)) % this.rows.length;
      this._render();
    } else if (e.key === 'Tab' && !e.shiftKey) {
      consume();
      this.accept();
    } else if (e.key === 'ArrowRight' && entry.cursor === entry.buffer.length && this.rows[this.index]?.kind === 'command') {
      consume();
      this.app.drawers.showReference(this.rows[this.index].name);
    } else if (e.key === 'Escape') {
      consume();
      this._dismissedWord = this.word?.word ?? null;
      this.close();
    }
  }
}
