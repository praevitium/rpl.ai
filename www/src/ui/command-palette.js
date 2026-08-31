/* Command palette overlay.  `/` (empty command line) or Ctrl/Cmd-K
   opens it; typing filters allOps() via searchOps; Enter runs the
   highlighted op through Entry.execOp. */

import {
  searchOps, moveSelection, matchPositions, highlightSegments,
} from './op-search.js';
import { escapeHtml } from './display.js';

const RESULT_CAP = 40;

export function paletteRowHtml(name, query) {
  const segs = highlightSegments(name, matchPositions(query, name));
  if (!segs.length) return escapeHtml(String(name ?? ''));
  return segs.map((s) => s.match
    ? `<mark>${escapeHtml(s.text)}</mark>`
    : escapeHtml(s.text)).join('');
}

export class CommandPalette {
  constructor({ host, getNames, onInvoke } = {}) {
    this.getNames = getNames || (() => []);
    this.onInvoke = onInvoke || (() => {});
    this._index = 0;
    this._results = [];
    this._query = '';
    this.el = document.createElement('div');
    this.el.className = 'cmd-palette hidden';
    this.el.setAttribute('aria-hidden', 'true');
    this.el.innerHTML = `
      <div class="cmd-palette-card" role="dialog" aria-modal="true" aria-label="Command palette">
        <input type="search" class="cmd-palette-input" placeholder="Search commands…"
               autocomplete="off" spellcheck="false" aria-label="Filter commands" />
        <ul class="cmd-palette-list" role="listbox"></ul>
        <div class="cmd-palette-hint">Enter run · Esc close · ↑↓ select</div>
      </div>
    `;
    if (host) host.appendChild(this.el);
    this._input = this.el.querySelector('.cmd-palette-input');
    this._list = this.el.querySelector('.cmd-palette-list');
    this._bind();
  }

  isOpen() {
    return !this.el.classList.contains('hidden');
  }

  open(seed = '') {
    this.el.classList.remove('hidden');
    this.el.setAttribute('aria-hidden', 'false');
    this._query = String(seed ?? '');
    this._input.value = this._query;
    this._index = 0;
    this._refresh();
    this._input.focus();
  }

  close() {
    if (!this.isOpen()) return;
    this.el.classList.add('hidden');
    this.el.setAttribute('aria-hidden', 'true');
  }

  _bind() {
    this.el.addEventListener('mousedown', (ev) => {
      if (ev.target === this.el) this.close();
    });
    this._input.addEventListener('input', () => {
      this._query = this._input.value;
      this._index = 0;
      this._refresh();
    });
    this._input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') {
        ev.preventDefault();
        this.close();
        return;
      }
      if (ev.key === 'ArrowDown') {
        ev.preventDefault();
        this._index = moveSelection(this._index, 1, this._results.length);
        this._renderList();
        return;
      }
      if (ev.key === 'ArrowUp') {
        ev.preventDefault();
        this._index = moveSelection(this._index, -1, this._results.length);
        this._renderList();
        return;
      }
      if (ev.key === 'Enter') {
        ev.preventDefault();
        this._invoke(this._index);
      }
    });
    this._list.addEventListener('click', (ev) => {
      const li = ev.target.closest?.('li[data-i]');
      if (!li) return;
      this._invoke(Number(li.dataset.i));
    });
  }

  _refresh() {
    const names = this.getNames();
    this._results = searchOps(this._query, names).slice(0, RESULT_CAP);
    if (this._results.length === 0) this._index = -1;
    else if (this._index < 0 || this._index >= this._results.length) this._index = 0;
    this._renderList();
  }

  _renderList() {
    if (!this._results.length) {
      this._list.innerHTML = '<li class="empty">No matching commands</li>';
      return;
    }
    this._list.innerHTML = this._results.map((name, i) =>
      `<li role="option" data-i="${i}" class="${i === this._index ? 'selected' : ''}">` +
      paletteRowHtml(name, this._query) + '</li>'
    ).join('');
    this._list.querySelector('.selected')?.scrollIntoView({ block: 'nearest' });
  }

  _invoke(i) {
    const name = this._results[i];
    if (!name) return;
    this.close();
    this.onInvoke(name);
  }
}
