/* Equation writer — algebraic entry with a textbook preview.

   The HP50 EQW is a structured 2-D editor; this adaptation keeps the
   algebraic line as the source of truth (so it round-trips through
   parseAlgebra) and renders a live pretty-print via pretty.js, plus
   palette buttons that wrap the current selection in fraction / power /
   radical / function templates. */

import { parseAlgebra, formatAlgebra } from '../rpl/algebra.js';
import { astToSvg } from '../rpl/pretty.js';
import { Symbolic, isSymbolic, isNumber, isName } from '../rpl/types.js';
import { format } from '../rpl/formatter.js';

export const EQ_FNS = Object.freeze([
  'SIN', 'COS', 'TAN', 'LN', 'EXP', 'SQRT', 'ABS', 'ATAN',
]);

export function wrapSelection(src, start, end, kind, extra) {
  const s = String(src ?? '');
  const a = Math.max(0, Math.min(start, s.length));
  const b = Math.max(a, Math.min(end, s.length));
  const left = s.slice(0, a);
  const sel = s.slice(a, b);
  const right = s.slice(b);

  if (kind === 'frac') {
    const num = sel;
    const text = `${left}(${num})/()${right}`;
    const cursor = num
      ? left.length + num.length + 4
      : left.length + 1;
    return { text, cursor };
  }
  if (kind === 'pow') {
    const text = `${left}(${sel})^()${right}`;
    const cursor = sel
      ? left.length + sel.length + 4
      : left.length + 1;
    return { text, cursor };
  }
  if (kind === 'sqrt') {
    const text = `${left}SQRT(${sel})${right}`;
    const cursor = sel
      ? left.length + 5 + sel.length + 1
      : left.length + 5;
    return { text, cursor };
  }
  if (kind === 'parens') {
    const text = `${left}(${sel})${right}`;
    const cursor = sel
      ? left.length + sel.length + 2
      : left.length + 1;
    return { text, cursor };
  }
  if (kind === 'fn') {
    const name = String(extra || 'SIN').toUpperCase();
    const text = `${left}${name}(${sel})${right}`;
    const cursor = sel
      ? left.length + name.length + sel.length + 2
      : left.length + name.length + 1;
    return { text, cursor };
  }
  return { text: s, cursor: b };
}

export function insertAt(src, start, end, insert) {
  const s = String(src ?? '');
  const a = Math.max(0, Math.min(start, s.length));
  const b = Math.max(a, Math.min(end, s.length));
  const text = s.slice(0, a) + insert + s.slice(b);
  return { text, cursor: a + String(insert).length };
}

export function previewEquation(src, opts = {}) {
  const t = String(src ?? '').trim();
  if (!t) return { ok: true, ast: null, svg: null, error: null };
  try {
    const ast = parseAlgebra(t);
    const drawn = astToSvg(ast, {
      size: opts.size ?? 28,
      padding: opts.padding ?? 10,
    });
    return { ok: true, ast, svg: drawn.svg, width: drawn.width, height: drawn.height, error: null };
  } catch (e) {
    return { ok: false, ast: null, svg: null, error: e.message || String(e) };
  }
}

export function equationToSymbolic(src) {
  const t = String(src ?? '').trim();
  if (!t) throw new Error('Empty expression');
  return Symbolic(parseAlgebra(t));
}

export function valueToEquationDraft(v) {
  if (v == null) return '';
  if (isSymbolic(v)) return formatAlgebra(v.expr);
  if (isName(v)) return v.id;
  if (isNumber(v)) {
    const s = format(v);
    return s.replace(/^`|`$/g, '');
  }
  return format(v).replace(/^`|`$/g, '');
}

export class EquationEditor {
  constructor({ app } = {}) {
    this.app = app;
    this.el = document.createElement('div');
    this.el.className = 'eq-editor';
    this.el.innerHTML = `
      <div class="ed-toolbar">
        <button type="button" data-eq="load" title="Load stack level 1">Load</button>
        <button type="button" data-eq="push" title="Push onto the stack">Push</button>
        <button type="button" data-eq="clear" title="Clear">Clear</button>
      </div>
      <div class="eq-preview" aria-label="Equation preview"></div>
      <label class="eq-field">
        <span class="eq-field-label">Algebraic</span>
        <input type="text" class="eq-input" spellcheck="false"
               placeholder="SIN(X)^2 + COS(X)^2" aria-label="Algebraic expression" />
      </label>
      <div class="eq-status" role="status"></div>
      <div class="eq-palette" role="toolbar" aria-label="Templates">
        <button type="button" data-wrap="frac" title="Fraction">a⁄b</button>
        <button type="button" data-wrap="pow" title="Power">aᵇ</button>
        <button type="button" data-wrap="sqrt" title="Square root">√</button>
        <button type="button" data-wrap="parens" title="Parentheses">( )</button>
        <button type="button" data-insert="π" title="Pi">π</button>
        <button type="button" data-insert="e" title="e">e</button>
        <button type="button" data-insert="INFINITY" title="Infinity">∞</button>
        <button type="button" data-insert="θ" title="Theta">θ</button>
        ${EQ_FNS.map(n =>
          `<button type="button" data-wrap="fn" data-fn="${n}" title="${n}">${n}</button>`
        ).join('')}
      </div>
    `;
    this._input = this.el.querySelector('.eq-input');
    this._preview = this.el.querySelector('.eq-preview');
    this._status = this.el.querySelector('.eq-status');
    this._bind();
    this._refresh();
  }

  _bind() {
    this._input.addEventListener('input', () => this._refresh());
    this._input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' && !ev.shiftKey) {
        ev.preventDefault();
        this.push();
      }
      ev.stopPropagation();
    });
    this.el.addEventListener('click', (ev) => {
      const btn = ev.target.closest?.('button');
      if (!btn || !this.el.contains(btn)) return;
      if (btn.dataset.eq === 'load') this.loadFromStack();
      else if (btn.dataset.eq === 'push') this.push();
      else if (btn.dataset.eq === 'clear') this.clear();
      else if (btn.dataset.wrap) {
        this.applyWrap(btn.dataset.wrap, btn.dataset.fn);
      } else if (btn.dataset.insert) {
        this.applyInsert(btn.dataset.insert);
      }
    });
  }

  applyWrap(kind, extra) {
    const el = this._input;
    const { text, cursor } = wrapSelection(el.value, el.selectionStart, el.selectionEnd, kind, extra);
    el.value = text;
    el.focus();
    el.setSelectionRange(cursor, cursor);
    this._refresh();
  }

  applyInsert(text) {
    const el = this._input;
    const next = insertAt(el.value, el.selectionStart, el.selectionEnd, text);
    el.value = next.text;
    el.focus();
    el.setSelectionRange(next.cursor, next.cursor);
    this._refresh();
  }

  _refresh() {
    const prev = previewEquation(this._input.value);
    if (prev.ok && prev.svg) {
      this._preview.innerHTML = prev.svg;
      this._preview.classList.remove('empty', 'error');
      this._status.textContent = '';
      this._status.classList.remove('error');
    } else if (prev.ok) {
      this._preview.innerHTML = '<span class="eq-placeholder">Type an expression — fractions, powers and roots render here.</span>';
      this._preview.classList.add('empty');
      this._preview.classList.remove('error');
      this._status.textContent = '';
      this._status.classList.remove('error');
    } else {
      this._preview.classList.add('error');
      this._status.textContent = prev.error;
      this._status.classList.add('error');
    }
  }

  clear() {
    this._input.value = '';
    this._refresh();
    this._input.focus();
  }

  loadFromStack() {
    const stack = this.app?.stack;
    if (!stack || stack.depth < 1) {
      this.app?.entry?.flashError?.({ message: 'Equation: empty stack' });
      return;
    }
    this._input.value = valueToEquationDraft(stack.peek());
    this._refresh();
    this._input.focus();
  }

  push() {
    try {
      const v = equationToSymbolic(this._input.value);
      const entry = this.app?.entry;
      if (entry?.buffer?.trim?.().length > 0) entry.enter();
      this.app.stack.push(v);
      this._status.textContent = 'Pushed';
      this._status.classList.remove('error');
    } catch (e) {
      this._status.textContent = e.message;
      this._status.classList.add('error');
      this.app?.entry?.flashError?.({ message: `Equation: ${e.message}` });
    }
  }
}
