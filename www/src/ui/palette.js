import { allOps, lookup } from '../rpl/ops.js';
import { state as calcState } from '../rpl/state.js';
import { TYPES } from '../rpl/types.js';
import { searchCommands, findReferenceEntry, shortDescription, loadCommandReference } from './command-reference.js';
import { fuzzyScore, matchPositions, highlightSegments, moveSelection } from './op-search.js';
import { ACTIONS, shortcutText } from './actions.js';
import { MODES } from './modes.js';
import { MENU_FAMILIES, OWN_MENUS } from './menus.js';
import { CATEGORIES, CHAR_GROUPS, signatureOf } from './drawer.js';
import { icon } from './icons.js';
import { escapeHtml, typeName } from './display.js';

const PALETTE_ACTIONS = Object.freeze([
  'settings.open', 'shortcuts.open', 'view.minimal', 'keypad.toggle', 'drawer.toggle',
  'writer.equation', 'writer.matrix', 'assistant.ask', 'edit.undo', 'edit.redo', 'edit.paste',
]);

const RESULT_CAP = 8;

export function highlightMatches(text, query) {
  const segs = highlightSegments(text, matchPositions(query, text));
  return segs.length ? segs.map((s) => (s.match ? `<mark>${escapeHtml(s.text)}</mark>` : escapeHtml(s.text))).join('') : escapeHtml(text);
}

function textScore(query, text) {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  if (!q) return 0;
  if (t === q) return 1000;
  if (t.startsWith(q)) return 800 - t.length;
  const i = t.indexOf(q);
  if (i >= 0) return 600 - i;
  const f = fuzzyScore(query, text);
  return f > 0 ? f : -1;
}

export class Palette {
  constructor({ host, app }) {
    this.host = host;
    this.app = app;
    this.el = null;
    this.rows = [];
    this.index = 0;
    this.reference = null;
  }

  isOpen() { return !!this.el; }

  open(seed = '') {
    if (this.el) { this._input.select(); return; }
    this._restoreFocus = document.activeElement;
    this.el = document.createElement('div');
    this.el.className = 'pal-wrap';
    this.el.innerHTML = `<div class="pal" role="dialog" aria-modal="true" aria-label="Search"><div class="pal-in">${icon('search')}<input type="text" placeholder="Search commands, settings, variables, constants…" aria-label="Search" autocomplete="off" spellcheck="false"><span class="kbd">Esc</span></div><div class="pal-list" role="listbox"></div><div class="pal-foot"><span>↑↓ choose</span><span>↵ run</span><span>→ reference</span><span>Esc close</span></div></div>`;
    this.host.appendChild(this.el);
    this._input = this.el.querySelector('input');
    this._list = this.el.querySelector('.pal-list');
    this._input.value = seed;
    this._input.addEventListener('input', () => { this.index = 0; this._refresh(); });
    this._input.addEventListener('keydown', (e) => this._onKey(e));
    this.el.addEventListener('mousedown', (e) => { if (e.target === this.el) { e.preventDefault(); this.close(); } });
    this._list.addEventListener('click', (e) => {
      const row = e.target.closest('.pal-row');
      if (!row) return;
      const ref = e.target.closest('[data-ref]');
      this._run(Number(row.dataset.i), !!ref);
    });
    this._list.addEventListener('mousemove', (e) => {
      const row = e.target.closest('.pal-row');
      if (row && Number(row.dataset.i) !== this.index) { this.index = Number(row.dataset.i); this._paintSelection(); }
    });
    this._input.focus();
    this._refresh();
    if (!this.reference) {
      loadCommandReference().then((m) => { this.reference = m; if (this.el) this._refresh(); }).catch(() => {});
    }
  }

  close() {
    if (!this.el) return;
    this.el.remove();
    this.el = null;
    const back = this._restoreFocus;
    this._restoreFocus = null;
    if (back?.focus && document.contains(back)) back.focus({ preventScroll: true });
  }

  _onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.close(); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      this.index = moveSelection(this.index, e.key === 'ArrowDown' ? 1 : -1, this.rows.length);
      this._paintSelection();
      return;
    }
    if (e.key === 'Enter') { e.preventDefault(); this._run(this.index, false); return; }
    if (e.key === 'ArrowRight' && this._input.selectionStart === this._input.value.length && this.rows[this.index]?.reference) {
      e.preventDefault();
      this._run(this.index, true);
    }
    e.stopPropagation();
  }

  _items(query) {
    const q = query.trim();
    const groups = [];
    const commands = q
      ? searchCommands(q, { names: allOps(), entries: this.reference, categories: CATEGORIES, limit: RESULT_CAP })
      : ['SOLVE', 'FACTOR', 'DERIV', 'INTEG', 'CONVERT', 'ROLL', 'PICK', 'STO'].map((name) => ({ name }));
    groups.push(['Commands', commands.map(({ name }) => {
      const entry = this.reference ? findReferenceEntry(this.reference, name) : null;
      const sig = entry ? signatureOf(entry) : '';
      return {
        kind: 'command', title: name, mono: true, icon: 'chr', reference: true,
        detail: [sig, entry ? shortDescription(entry, 90) : ''].filter(Boolean).join(' · '),
        run: () => this.app.runCommandFromUI(name),
        open: () => this.app.drawers.showReference(name),
        available: !!lookup(name),
      };
    })]);
    const scored = (items) => items
      .map((it) => ({ ...it, score: q ? Math.max(textScore(q, it.title), it.keywords ? textScore(q, it.keywords) - 100 : -1) : 0 }))
      .filter((it) => !q || it.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, RESULT_CAP);
    const actions = PALETTE_ACTIONS.map((id) => ({
      kind: 'action', title: ACTIONS[id].label, icon: 'sliders', shortcut: shortcutText(id),
      keywords: id.replace(/[.]/g, ' '), run: () => this.app.runAction(id),
    }));
    const themeRows = [['auto', 'Theme: match the system'], ['graphite', 'Theme: Graphite (dark)'], ['paper', 'Theme: Paper (light)'], ['classic', 'Theme: Classic LCD']]
      .map(([value, title]) => ({ kind: 'action', title, icon: 'sliders', keywords: 'appearance color dark light lcd', run: () => this.app.setTheme(value) }));
    const modeRows = MODES.flatMap((m) => m.options.map((o) => ({
      kind: 'mode', title: `${m.title}: ${o.label}`, icon: 'check', detail: o.detail,
      keywords: `${o.value} mode`, current: m.current() === o.value, run: () => m.set(o.value),
    })));
    groups.push(['Settings and modes', scored([...actions, ...themeRows, ...modeRows])]);
    const menus = [...OWN_MENUS, ...MENU_FAMILIES].map((m) => ({
      kind: 'menu', title: `${m.short} menu`, detail: m.title, icon: 'menu', keywords: m.title,
      run: () => this.app.showMenu(m.id),
    }));
    groups.push(['Menus', scored(menus)]);
    const vars = [...calcState.current.entries.entries()].map(([name, value]) => ({
      kind: 'variable', title: name, mono: true, icon: value.type === TYPES.DIRECTORY ? 'folder' : 'folder',
      detail: value.type === TYPES.DIRECTORY ? 'Folder' : typeName(value),
      run: () => this.app.pressVariable(name),
    }));
    groups.push(['Variables', scored(vars)]);
    const constants = (CHAR_GROUPS.Constants ?? []).map(([label, text, title]) => ({
      kind: 'constant', title: `${label}`, mono: true, detail: title, icon: 'omega', keywords: title,
      run: () => this.app.entry.type(text),
    }));
    if (q) groups.push(['Constants', scored(constants)]);
    return groups.filter(([, items]) => items.length);
  }

  _refresh() {
    const q = this._input.value;
    const groups = this._items(q);
    this.rows = [];
    let html = '';
    for (const [title, items] of groups) {
      html += `<div class="pal-g">${escapeHtml(title)}</div>`;
      for (const it of items) {
        const i = this.rows.length;
        this.rows.push(it);
        const right = [
          it.current ? `<span class="badge">current</span>` : '',
          it.shortcut ? `<span class="kbd">${escapeHtml(it.shortcut)}</span>` : '',
          it.reference ? `<button type="button" class="mini" data-ref title="Open the reference (→)" aria-label="Reference">${icon('book', 'sm')}</button>` : '',
        ].join('');
        html += `<div class="pal-row" role="option" data-i="${i}"><span class="ic">${icon(it.icon ?? 'chr', 'sm')}</span><span class="t${it.mono ? ' mono' : ''}">${highlightMatches(it.title, q.trim())}</span>${it.detail ? `<span class="d">${escapeHtml(it.detail)}</span>` : ''}<span class="r">${right}</span></div>`;
      }
    }
    this._list.innerHTML = html || `<div class="pal-empty">Nothing matches. Try a command name, a word like “derivative”, or a setting like “degrees”.</div>`;
    this.index = Math.min(this.index, Math.max(0, this.rows.length - 1));
    this._paintSelection();
  }

  _paintSelection() {
    this._list.querySelectorAll('.pal-row').forEach((row) => {
      const on = Number(row.dataset.i) === this.index;
      row.classList.toggle('on', on);
      row.setAttribute('aria-selected', String(on));
      if (on) row.scrollIntoView({ block: 'nearest' });
    });
  }

  _run(i, openReference) {
    const row = this.rows[i];
    if (!row) return;
    this.close();
    if (openReference && row.open) row.open();
    else row.run();
  }
}
