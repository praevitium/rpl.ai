import { icon } from './icons.js';
import { escapeHtml } from './display.js';
import { shortcutText } from './actions.js';

const WRITERS = Object.freeze([
  { id: 'rpl', icon: 'chr', label: 'RPL', action: null },
  { id: 'equation', icon: 'fx', label: 'Equation', action: 'writer.equation' },
  { id: 'matrix', icon: 'matrix', label: 'Matrix', action: 'writer.matrix' },
]);

const HINTS = Object.freeze({
  rpl: ['Enter runs', '⇧Enter new line', 'start with ? to ask the assistant'],
  equation: ['/ fraction · ^ power · ( group', 'Tab next box', '⇧← ⇧→ select', 'Enter pushes', 'Esc cancels'],
  matrix: ['Tab next cell', '⇧Enter next row', 'Enter pushes', 'Esc cancels'],
});

export class InputArea {
  constructor({ top, body, hint, cmdline, app }) {
    this.top = top;
    this.body = body;
    this.hint = hint;
    this.cmdline = cmdline;
    this.app = app;
    this.mode = 'rpl';
    this._writerEl = null;
    this.go = document.createElement('button');
    this.go.type = 'button';
    this.go.className = 'cmdline-go';
    this.go.title = 'Enter';
    this.go.setAttribute('aria-label', 'Enter');
    this.go.innerHTML = icon('enter', 'sm');
    this.badge = document.createElement('span');
    this.badge.className = 'cmdline-badge';
    this.badge.textContent = 'ASK ✦';
    this.badge.title = 'Enter sends this to the assistant';
    this.badge.hidden = true;
    top.addEventListener('click', (e) => {
      const b = e.target.closest('[data-in]');
      if (!b) return;
      if (b.dataset.in === 'ask') app.runAction('assistant.ask');
      else app.setInputMode(b.dataset.in);
    });
    this.go.addEventListener('mousedown', (e) => e.preventDefault());
    this.go.addEventListener('click', () => app.commitEntry());
    cmdline.addEventListener('mousedown', (e) => {
      if (e.target === cmdline) { e.preventDefault(); app.entry.focus(); }
    });
  }

  attachEditorChrome() {
    this.cmdline.appendChild(this.badge);
    this.cmdline.appendChild(this.go);
  }

  render() {
    const { app } = this;
    const editing = app.pendingEdit;
    const tabs = WRITERS.map((w) => {
      const key = w.action ? shortcutText(w.action) : '';
      return `<button type="button" data-in="${w.id}" aria-pressed="${this.mode === w.id}" title="${escapeHtml(w.label)}${key ? ` (${escapeHtml(key)})` : ''}">${icon(w.icon, 'sm')}${escapeHtml(w.label)}</button>`;
    }).join('');
    const status = editing
      ? `<b>${escapeHtml(editing.label)}</b> · Enter ${editing.kind === 'var' ? 'stores it' : 'replaces it'} · Esc cancels`
      : '';
    const ask = shortcutText('assistant.ask');
    this.top.innerHTML = `<div class="in-tabs" role="group" aria-label="Writer">${tabs}</div><div class="in-status">${status}</div><button type="button" class="in-ask" data-in="ask" title="Ask the assistant${ask ? ` (${escapeHtml(ask)})` : ''}">${icon('spark', 'sm')}Ask</button>`;
    this.hint.innerHTML = HINTS[this.mode].map((h) => `<span>${escapeHtml(h)}</span>`).join('');
    this.cmdline.classList.toggle('editing', !!editing && this.mode === 'rpl');
    this._writerEl?.classList.toggle('editing', !!editing);
    this.badge.hidden = !app.entry.buffer.trimStart().startsWith('?');
  }

  show(mode, writerEl = null) {
    this.mode = mode;
    if (this._writerEl && this._writerEl !== writerEl) this._writerEl.remove();
    this._writerEl = writerEl;
    this.cmdline.hidden = mode !== 'rpl';
    if (writerEl && writerEl.parentNode !== this.body) this.body.appendChild(writerEl);
    this.render();
  }
}
