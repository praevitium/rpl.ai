import { allOps, lookup, opCategories } from '../rpl/ops.js';
import {
  state as calcState, subscribe as subscribeState,
  varPurge, goInto, currentPath, makeSubdir,
  getDirectoryByPath, moveCurrentEntry, reorderCurrentEntry, renameCurrentEntry,
} from '../rpl/state.js';
import { TYPES, isStorableHpName } from '../rpl/types.js';
import { unitInfo } from '../rpl/units.js';
import { format, withFractionMark } from '../rpl/formatter.js';
import {
  exportHpTextFile,
  listBackups, archiveBackup, restoreBackup, deleteBackup, putBackBackup, exportBackup, subscribeBackups,
} from '../rpl/persist.js';
import { referenceSection, pushHistory, isSyntaxWord, typeSyntaxWord } from './command-help.js';
import { loadCommandReference, findReferenceEntry, shortDescription, appNote, searchCommands, spelledName } from './command-reference.js';
import { matchPositions, highlightSegments } from './op-search.js';
import { GraphView } from './graph-view.js';
import { icon } from './icons.js';
import { escapeHtml, typeName, markScrollEdges, LONG_PRESS_MS } from './display.js';
import { MENU_FAMILIES, UNIT_GROUPS } from './menus.js';
import { shortcutText } from './actions.js';
import { wordBeforeCursor, hpArrows } from './autocomplete.js';

const UNIT_SYMBOLS = Object.freeze([...new Set(UNIT_GROUPS.flatMap((g) => g.units))].filter(unitInfo));

const _opCategories = opCategories();
export const CATEGORIES = {
  ..._opCategories,
  Units: [...(_opCategories.Units || []), ...UNIT_SYMBOLS],
};

// A tile names its character; what follows a dash or sits in closing parentheses stays in its title.
const charCaption = (title = '') => title.split(' — ')[0].replace(/ \(.*\)$/, '');

export const CHAR_GROUPS = {
  'Constants': [
    ['π', 'π', 'pi — folds to 3.14159… under APPROX / →NUM'],
    ['e', 'e', 'Euler — folds to 2.71828… under APPROX / →NUM'],
    ['i', 'i', 'imaginary unit — folds to (0, 1) under APPROX / →NUM'],
    ['∞', '∞', 'infinity'],
    ['MAXR', 'MAXR', 'maximum real (9.99999999999e499)'],
    ['MINR', 'MINR', 'minimum real (1e-499)'],
    ['c', 'c', 'speed of light in vacuum'],
    ['h', 'h', 'Planck constant'],
    ['ħ', 'ħ', 'reduced Planck constant (hbar)'],
    ['G', 'G', 'gravitational constant'],
    ['g', 'g', 'standard gravity (9.80665 m/s²)'],
    ['NA', 'NA', 'Avogadro constant'],
    ['k', 'k', 'Boltzmann constant'],
    ['R', 'R', 'universal gas constant'],
    ['Vm', 'Vm', 'molar volume (ideal gas, 0°C 1atm)'],
    ['σ', 'σ', 'Stefan-Boltzmann constant'],
    ['ε0', 'ε0', 'vacuum permittivity'],
    ['μ0', 'μ0', 'vacuum permeability'],
    ['q', 'q', 'elementary charge'],
    ['me', 'me', 'electron rest mass'],
    ['mp', 'mp', 'proton rest mass'],
    ['mn', 'mn', 'neutron rest mass'],
    ['F', 'F', 'Faraday constant'],
    ['α', 'α', 'fine-structure constant'],
    ['a0', 'a0', 'Bohr radius'],
    ['μB', 'μB', 'Bohr magneton'],
    ['μN', 'μN', 'nuclear magneton'],
    ['Rinf', 'Rinf', 'Rydberg constant'],
    ['λc', 'λc', 'Compton wavelength'],
    ['γe', 'γe', 'electron gyromagnetic ratio'],
    ['Z0', 'Z0', 'impedance of free space'],
    ['atm', 'atm', 'standard atmosphere (101325 Pa)'],
    ['T0', 'T0', 'standard temperature (273.15 K)'],
  ],
  'Greek (lowercase)': [
    ['α', 'α', 'alpha'], ['β', 'β', 'beta'], ['γ', 'γ', 'gamma'],
    ['δ', 'δ', 'delta'], ['ε', 'ε', 'epsilon'], ['ζ', 'ζ', 'zeta'],
    ['η', 'η', 'eta'], ['θ', 'θ', 'theta'], ['ι', 'ι', 'iota'],
    ['κ', 'κ', 'kappa'], ['λ', 'λ', 'lambda'], ['μ', 'μ', 'mu'],
    ['ν', 'ν', 'nu'], ['ξ', 'ξ', 'xi'], ['ο', 'ο', 'omicron'],
    ['π', 'π', 'pi'], ['ρ', 'ρ', 'rho'], ['σ', 'σ', 'sigma'],
    ['τ', 'τ', 'tau'], ['υ', 'υ', 'upsilon'], ['φ', 'φ', 'phi'],
    ['χ', 'χ', 'chi'], ['ψ', 'ψ', 'psi'], ['ω', 'ω', 'omega'],
  ],
  'Greek (uppercase)': [
    ['Α', 'Α', 'Alpha'], ['Β', 'Β', 'Beta'], ['Γ', 'Γ', 'Gamma'],
    ['Δ', 'Δ', 'Delta'], ['Ε', 'Ε', 'Epsilon'], ['Ζ', 'Ζ', 'Zeta'],
    ['Η', 'Η', 'Eta'], ['Θ', 'Θ', 'Theta'], ['Ι', 'Ι', 'Iota'],
    ['Κ', 'Κ', 'Kappa'], ['Λ', 'Λ', 'Lambda'], ['Μ', 'Μ', 'Mu'],
    ['Ν', 'Ν', 'Nu'], ['Ξ', 'Ξ', 'Xi'], ['Ο', 'Ο', 'Omicron'],
    ['Π', 'Π', 'Pi'], ['Ρ', 'Ρ', 'Rho'], ['Σ', 'Σ', 'Sigma'],
    ['Τ', 'Τ', 'Tau'], ['Υ', 'Υ', 'Upsilon'], ['Φ', 'Φ', 'Phi'],
    ['Χ', 'Χ', 'Chi'], ['Ψ', 'Ψ', 'Psi'], ['Ω', 'Ω', 'Omega'],
  ],
  'Math / comparison': [
    ['∞', '∞', 'infinity'], ['π', 'π', 'pi constant'],
    ['√', '√', 'sqrt'], ['∂', '∂', 'partial derivative'],
    ['∫', '∫', 'integral'], ['∑', '∑', 'sum'], ['∏', '∏', 'product'],
    ['Δ', 'Δ', 'delta / change'],
    ['≠', '≠', 'not equal'], ['≤', '≤', 'less/equal'],
    ['≥', '≥', 'greater/equal'], ['≈', '≈', 'approx equal'],
    ['±', '±', 'plus-minus'], ['·', '·', 'dot'], ['×', '×', 'times'],
    ['÷', '÷', 'divide'], ['°', '°', 'degree'],
    ['∠', '∠', 'angle — polar / cylindrical separator (R∠θ)'],
  ],
  'Arrows / program': [
    ['→', '→', 'store / local-var arrow'],
    ['←', '←', 'left arrow'], ['↑', '↑', 'up arrow'],
    ['↓', '↓', 'down arrow'], ['↵', '\n', 'newline'],
    ['«', '« ', 'program open'], ['»', ' »', 'program close'],
    ['«»', '«  »', 'program brackets (cursor inside)'],
    ['[ ]', '[ ]', 'list / vector brackets'],
    ['{ }', '{ }', 'list braces'],
    ['::', '::', 'path delimiter'],
    ['_', '_', 'underscore / unit'],
  ],
};

// ASCII arrow aliases (->NUM) are left out: each has a Unicode form in its own category.
export function uncategorizedOps(registered, seen, filter = '') {
  return [...registered]
    .filter(n => !seen.has(n))
    .filter(n => !n.includes('->'))
    .filter(n => !filter || n.toLowerCase().includes(filter))
    .sort();
}

export function dropZoneForFraction(frac, isDir) {
  if (isDir) {
    if (frac < 0.25) return 'before';
    if (frac > 0.75) return 'after';
    return 'into';
  }
  return frac < 0.5 ? 'before' : 'after';
}

export function familyCommands(family) {
  if (family.category === 'Other') {
    const seen = new Set(Object.values(_opCategories).flat().map((n) => n.toUpperCase()));
    return uncategorizedOps(new Set(allOps()), seen);
  }
  return _opCategories[family.category] ?? [];
}

export const UPLOAD_ACCEPT = '.json,.rpl,.txt,.csv,.tsv,.xlsx,application/json,text/plain,text/csv,text/tab-separated-values,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

// A stack diagram's objn-1 stays whole; a narrow drawer broke it after the hyphen.
function keepHyphenatedWords(table) {
  const walker = document.createTreeWalker(table, NodeFilter.SHOW_TEXT);
  const nodes = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) if (/\S-\S/.test(node.textContent)) nodes.push(node);
  for (const node of nodes) {
    node.replaceWith(...node.textContent.split(/(\S+-\S+)/).filter(Boolean).map((part) => {
      if (!/\S-\S/.test(part)) return part;
      const word = document.createElement('span');
      word.className = 'nb';
      word.textContent = part;
      return word;
    }));
  }
}

// A manual table wider than the drawer scrolls on its own, fading at the edge it continues past.
function scrollWideTables(doc) {
  for (const table of doc.querySelectorAll('table')) {
    keepHyphenatedWords(table);
    const wrap = document.createElement('div');
    wrap.className = 'ref-table';
    table.before(wrap);
    wrap.append(table);
    markScrollEdges(wrap);
    wrap.addEventListener('scroll', () => markScrollEdges(wrap), { passive: true });
  }
}

export function pickFiles(accept, onFiles, multiple = true) {
  const picker = document.createElement('input');
  picker.type = 'file';
  picker.accept = accept;
  picker.multiple = multiple;
  picker.addEventListener('change', () => { if (picker.files?.length) onFiles([...picker.files]); });
  picker.click();
}

export function pickFile(accept, onFile) {
  pickFiles(accept, (files) => onFile(files[0]), false);
}

// The manual's column headings (Level 1/Argument 1) are skipped, and a lone arrow takes its result line.
export function signatureOf(entry) {
  const lines = String(entry?.io ?? '').split('\n').filter((l) => !/^Level\s*\S*\/(Argument|Item)/.test(l));
  const first = (lines[0] === '→' ? lines.slice(0, 2).join(' ') : lines[0] ?? '').replace(/`/g, "'").trim();
  if (/^none\.?$/i.test(first)) return '';
  if (first.length <= 42) return first;
  const cut = first.slice(0, 41);
  const at = cut.lastIndexOf(' ');
  return `${(at > 20 ? cut.slice(0, at) : cut).replace(/[\s.…[{(“«]+$/, '')} …`;
}

const DRAWERS = Object.freeze([
  { id: 'assistant', icon: 'spark', label: 'Assistant' },
  { id: 'catalog', icon: 'book', label: 'Catalog' },
  { id: 'vars', icon: 'folder', label: 'Variables' },
  { id: 'history', icon: 'clock', label: 'History' },
  { id: 'plot', icon: 'plot', label: 'Plot' },
  { id: 'chars', icon: 'omega', label: 'Characters', short: 'Chars' },
]);

const DRAWER_MIN_WIDTH = 280;

const menuItem = (act, ico, label, hint = '') => `<button type="button" class="opt" data-act="${act}"><span class="ck">${icon(ico, 'sm')}</span><b>${escapeHtml(label)}</b><em>${escapeHtml(hint)}</em></button>`;
const DRAWER_MAX_WIDTH = 720;
const TAB_FADE = 36;

export class Drawers {
  constructor({ rail, el, scrim, app }) {
    this.rail = rail;
    this.el = el;
    this.scrim = scrim;
    this.app = app;
    this.current = null;
    this.cat = { q: '', family: null, ref: null, history: [], idx: -1, focusAction: false };
    this.charsQuery = '';
    this.varsQuery = '';
    this.historyQuery = '';
    this.reference = null;
    this._graph = null;
    this._chat = null;
    this._dragName = null;
    this._renderRail();
    this.rail.addEventListener('click', (e) => {
      const b = e.target.closest('[data-drawer]');
      if (b) this.toggle(b.dataset.drawer);
    });
    this.scrim.addEventListener('click', () => this.close());
    this.el.addEventListener('click', (e) => this._onClick(e));
    new ResizeObserver(() => this._markTabEdges()).observe(this.el);
    this.el.addEventListener('input', (e) => this._onInput(e));
    this.el.addEventListener('submit', (e) => this._onSubmit(e));
    this.el.addEventListener('keydown', (e) => this._onKeyDown(e));
    this._bindSheetDrag();
    this._bindRunPreviews();
    this._bindVarsDrag();
    subscribeState(() => {
      if (this.current === 'vars') this._renderVarsList();
    });
    subscribeBackups(() => { if (this.current === 'vars') this._renderBackups(); });
    app.entry.subscribeHistory(() => { if (this.current === 'history') this._renderHistoryList(); });
  }

  get prefs() { return this.app.prefs; }

  _bindRunPreviews() {
    const runButton = (e) => e.target.closest?.('[data-dw="cmd-run"], [data-dw="ref-run"]');
    this.el.addEventListener('pointerover', (e) => {
      const run = runButton(e);
      if (run && e.pointerType === 'mouse') this.app.previewCommand(run.dataset.cmd);
    });
    this.el.addEventListener('pointerout', (e) => {
      const run = runButton(e);
      if (run && !run.contains(e.relatedTarget)) this.app.clearPreview();
    });
    this.el.addEventListener('focusin', (e) => {
      const run = runButton(e);
      if (run?.matches(':focus-visible')) this.app.previewCommand(run.dataset.cmd);
    });
    this.el.addEventListener('focusout', (e) => { if (runButton(e)) this.app.clearPreview(); });
  }

  isOpen() { return this.current !== null; }

  hidesInput() {
    const input = this.isOpen() && document.getElementById('input')?.getBoundingClientRect();
    if (!input) return false;
    const d = this.el.getBoundingClientRect();
    const x = input.left + input.width / 2, y = input.top + input.height / 2;
    return x >= d.left && x <= d.right && y >= d.top && y <= d.bottom;
  }

  // A step that lands in an input the drawer hides closes the drawer, as the HP's CHARS (ECHO1) and CAT (OK) return to the stack.
  _reveal() {
    if (!this.hidesInput()) return false;
    this.close();
    return true;
  }

  open(id) {
    if (!DRAWERS.some((d) => d.id === id)) return;
    this.current = id;
    this.app.setPrefs({ drawer: id, lastDrawer: id });
    for (const key of ['view', 'tutor', 'drawer']) this.app.toasts?.dismiss(key);
    this.render();
    this._focusDefault();
  }

  close() {
    if (!this.current) return;
    const leaving = this.current;
    this.current = null;
    this.app.setPrefs({ drawer: null });
    this.render();
    if (leaving === 'plot') this.app.setPlotFocus(false);
  }

  toggle(id = null) {
    const target = id ?? (this.current ? null : this.prefs.lastDrawer ?? 'catalog');
    if (!target || this.current === target) { this.close(); return; }
    this.open(target);
  }

  get graph() {
    if (!this._graph) this._graph = new GraphView({ app: this.app });
    return this._graph;
  }

  openGraph(kind, stack, data = null) {
    this.open('plot');
    this.graph.applyPlotOp(kind, stack, data);
  }

  closeGraph() {
    if (this.current === 'plot') this.close();
  }

  insertText(text) {
    const { app } = this;
    if (app.inputMode === 'equation') app.equationEditor.typeText(text);
    else if (app.inputMode === 'matrix') app.matrixEditor.insertSymbol(text);
    else app.entry.type(text);
  }

  showReference(name) {
    this.cat.ref = name;
    const { history, idx } = pushHistory(this.cat.history, this.cat.idx, name);
    this.cat.history = history;
    this.cat.idx = idx;
    if (this.current !== 'catalog') this.open('catalog');
    else this._renderBody();
  }

  // As the HP's CASCMD and HELP lists do, a family's list opens afresh, not on whatever page the Catalog last showed.
  showFamily(id, from = null) {
    Object.assign(this.cat, { q: '', ref: null, family: id });
    if (this.current !== 'catalog') this.open('catalog');
    else this._renderBody();
    this._body().scrollTop = 0;
    // The descriptions arriving with the reference move the rows, so the list scrolls once they are in.
    if (from) this._ensureReference().then(() => this._scrollFamilyTo(id, from));
  }

  // CONSTANTS opens on the constants, the drawer's first group, whatever filter it was left with.
  showConstants() {
    this.charsQuery = '';
    if (this.current !== 'chars') this.open('chars');
    else this._renderBody();
    this._body().scrollTop = 0;
  }

  _scrollFamilyTo(id, from) {
    if (this.current !== 'catalog' || this.cat.family !== id || this.cat.ref || this.cat.q) return;
    const key = from.trim().toUpperCase();
    const rows = [...this._body().querySelectorAll('.cmd-row')];
    const row = rows.find((r) => r.dataset.cmd.toUpperCase() === key) ?? rows.find((r) => r.dataset.cmd.toUpperCase().startsWith(key));
    const crumb = this._body().querySelector('.cat-crumb')?.offsetHeight ?? 0;
    if (row) this._body().scrollTop += row.getBoundingClientRect().top - this._body().getBoundingClientRect().top - crumb;
  }

  _renderRail() {
    this.rail.innerHTML = DRAWERS.map((d) => `<button type="button" data-drawer="${d.id}" aria-pressed="${this.current === d.id}" title="${escapeHtml(d.label)}">${icon(d.icon)}<span>${escapeHtml(d.short ?? d.label)}</span>${d.id === 'assistant' ? '<i class="dot off" aria-hidden="true"></i>' : ''}</button>`).join('');
  }

  setAssistantConnected(on) {
    this.rail.querySelector('[data-drawer="assistant"] .dot')?.classList.toggle('off', !on);
  }

  render() {
    const id = this.current;
    this.rail.querySelectorAll('[data-drawer]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.drawer === id)));
    this.el.classList.toggle('open', !!id);
    this.el.classList.toggle('wide', !!id && this.prefs.drawerWide);
    this.scrim.classList.toggle('on', !!id);
    if (Number.isFinite(this.prefs.drawerWidth) && !this.prefs.drawerWide) this.el.style.setProperty('--drawer-w', `${this.prefs.drawerWidth}px`);
    else this.el.style.removeProperty('--drawer-w');
    if (!id) { this.el.innerHTML = ''; return; }
    const meta = DRAWERS.find((d) => d.id === id);
    const tabs = `<div class="dw-tabs" role="tablist">${DRAWERS.map((d) => `<button type="button" data-dw="tab" data-drawer-tab="${d.id}" aria-pressed="${d.id === id}">${icon(d.icon, 'sm')}${escapeHtml(d.short ?? d.label)}</button>`).join('')}</div>`;
    const extra = this._headActions(id);
    const wideBtn = id === 'assistant' || id === 'plot' ? '' : `<button type="button" class="icon-btn sm" data-dw="wide" title="${this.prefs.drawerWide ? 'Narrower' : 'Wider'}" aria-label="${this.prefs.drawerWide ? 'Narrower' : 'Wider'}">${icon(this.prefs.drawerWide ? 'collapse' : 'expand', 'sm')}</button>`;
    const dockBtn = `<button type="button" class="icon-btn sm" data-dw="dock" title="Dock the panels on the other side" aria-label="Dock the panels on the other side">${icon('dock', 'sm')}</button>`;
    this.el.innerHTML = `<div class="drawer-grip" aria-hidden="true"></div><div class="dw-top">${tabs}<div class="dw-head"><div class="dw-title">${icon(meta.icon)}<span>${escapeHtml(meta.label)}</span><small class="dw-sub"></small></div>${extra}${wideBtn}${dockBtn}<button type="button" class="icon-btn sm" data-dw="close" title="Close${shortcutText('drawer.toggle') ? ` (${shortcutText('drawer.toggle')})` : ''}" aria-label="Close">${icon('x', 'sm')}</button></div></div><div class="dw-body"></div>`;
    this._bindGrip(this.el.querySelector('.drawer-grip'));
    this._renderHeadSub();
    this._renderBody();
    this._revealTab();
    this.el.querySelector('.dw-tabs').addEventListener('scroll', () => this._markTabEdges(), { passive: true });
    this._markTabEdges();
  }

  _markTabEdges() {
    const strip = this.el.querySelector('.dw-tabs');
    if (strip) markScrollEdges(strip);
  }

  // The tab row starts at its left edge on every render, so on a phone the open drawer's tab sat past the right edge,
  // or under the edge fade (calc.css's 36 px) that says more tabs lie past it.
  _revealTab() {
    const strip = this.el.querySelector('.dw-tabs');
    const tab = strip?.querySelector('[aria-pressed="true"]');
    if (!tab) return;
    const s = strip.getBoundingClientRect(), t = tab.getBoundingClientRect();
    const past = (t.left < s.left + TAB_FADE && strip.scrollLeft > 0) || (t.right > s.right - TAB_FADE && strip.scrollLeft + strip.clientWidth < strip.scrollWidth);
    if (past) strip.scrollLeft += t.left + t.width / 2 - (s.left + s.width / 2);
  }

  _headActions(id) {
    if (id === 'plot') {
      const focused = this.app.plotFocus;
      return `<button type="button" class="icon-btn sm" data-dw="plot-focus" title="${focused ? 'Back to the drawer' : 'Expand to fill the window'}" aria-label="${focused ? 'Back to the drawer' : 'Expand'}">${icon(focused ? 'collapse' : 'expand', 'sm')}</button><button type="button" class="icon-btn sm" data-dw="plot-full" title="Full screen" aria-label="Full screen">${icon('full', 'sm')}</button>`;
    }
    if (id === 'assistant') {
      const mode = this.prefs.assistantMode;
      return `<div class="as-mode" role="radiogroup" aria-label="Assistant mode"><button type="button" data-dw="as-mode" data-mode="ask" role="radio" aria-checked="${mode === 'ask'}" title="Questions about RPL, maths and physics">Ask</button><button type="button" data-dw="as-mode" data-mode="tutor" role="radio" aria-checked="${mode === 'tutor'}" title="Walk me through a problem step by step">${icon('cap', 'sm')}Tutor</button></div>`;
    }
    if (id === 'history') {
      return `<button type="button" class="icon-btn sm" data-dw="hist-sort" title="${this.prefs.historySort === 'newest' ? 'Newest first' : 'Oldest first'}: click to flip" aria-label="Sort">${icon(this.prefs.historySort === 'newest' ? 'down' : 'up', 'sm')}</button><button type="button" class="icon-btn sm" data-dw="hist-clear" title="Clear the history" aria-label="Clear the history">${icon('trash', 'sm')}</button>`;
    }
    return '';
  }

  _renderHeadSub() {
    const sub = this.el.querySelector('.dw-sub');
    if (!sub) return;
    sub.textContent = this.current === 'catalog' ? `${allOps().filter((n) => !n.includes('->')).length} commands` : '';
  }

  _body() { return this.el.querySelector('.dw-body'); }

  _renderBody() {
    const body = this._body();
    if (!body) return;
    const id = this.current;
    if (id === 'assistant') return this._renderAssistant(body);
    if (id === 'plot') return this._renderPlot(body);
    if (id === 'catalog') return this._renderCatalog(body);
    if (id === 'vars') return this._renderVars(body);
    if (id === 'history') return this._renderHistory(body);
    if (id === 'chars') return this._renderChars(body);
  }

  _focusDefault() {
    if (typeof window === 'undefined' || window.innerWidth < 520) return;
    requestAnimationFrame(() => {
      const target = this.el.querySelector('[data-q]') ?? this.el.querySelector('.cb-input');
      target?.focus({ preventScroll: true });
    });
  }

  _renderAssistant(body) {
    if (!this._chat) {
      if (!this.app.chatBot) { body.innerHTML = '<div class="empty-note">Starting the assistant…</div>'; return; }
      this._chat = document.createElement('div');
      this._chat.className = 'cb-panel-wrap fill';
      this.app.chatBot.mount(this._chat);
    }
    body.innerHTML = '';
    body.appendChild(this._chat);
  }

  _renderPlot(body) {
    body.innerHTML = '';
    body.appendChild(this.graph.el);
    this.graph.el.classList.add('fill');
    this.graph.resize();
  }

  async _ensureReference() {
    if (this.reference) return this.reference;
    try { this.reference = await loadCommandReference(); }
    catch { this.reference = new Map(); }
    if (this.current === 'catalog') this._renderCatalogList();
    return this.reference;
  }

  _renderCatalog(body) {
    if (this.cat.ref) { this._renderReference(body); return; }
    body.innerHTML = `<div class="dw-tools"><label class="field">${icon('search', 'sm')}<input type="search" data-q="cat" placeholder="Search commands and what they do" aria-label="Search commands" value="${escapeHtml(this.cat.q)}" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"></label></div><div class="dw-list"></div>`;
    this._renderCatalogList();
    this._ensureReference();
  }

  _renderCatalogList() {
    const list = this._body()?.querySelector('.dw-list');
    if (!list) return;
    const q = this.cat.q.trim();
    if (q) {
      const rows = searchCommands(q, { names: allOps(), entries: this.reference, categories: CATEGORIES, limit: 40 });
      list.innerHTML = rows.length
        ? `<div class="sec-h">${rows.length} match${rows.length === 1 ? '' : 'es'}</div>${rows.map((r) => this._cmdRow(r.name, q)).join('')}`
        : `<div class="empty-note">Nothing matches “${escapeHtml(q)}”. Try a word from what the command does, like “derivative” or “swap”.</div>`;
      return;
    }
    if (!this.cat.family) {
      list.innerHTML = `<div class="sec-h">Families</div><div class="cat-cats">${MENU_FAMILIES.map((f) => `<button type="button" data-dw="cat-family" data-family="${f.id}"><b>${escapeHtml(f.title)}</b><span>${familyCommands(f).length} commands</span></button>`).join('')}</div>`;
      return;
    }
    const family = MENU_FAMILIES.find((f) => f.id === this.cat.family);
    const names = familyCommands(family);
    const units = family.id === 'UNITS'
      ? UNIT_GROUPS.map((g) => `<div class="sec-h">Insert a unit: ${escapeHtml(g.title)}</div><div class="unit-grid">${g.units.map((u) => `<button type="button" data-dw="unit" data-unit="${escapeHtml(u)}" title="Attach _${escapeHtml(u)} to the number you are typing, or to level 1">${escapeHtml(u)}</button>`).join('')}</div>`).join('')
      : '';
    list.innerHTML = `<div class="cat-crumb"><button type="button" class="mini" data-dw="cat-back" title="All families" aria-label="All families">${icon('chl', 'sm')}</button><b>${escapeHtml(family.title)}</b><span class="badge">${names.length}</span></div>${names.map((n) => this._cmdRow(n)).join('')}${units}`;
  }

  _cmdRow(name, query = '') {
    const entry = this.reference ? findReferenceEntry(this.reference, name) : null;
    const runnable = !!lookup(name);
    const available = runnable || isSyntaxWord(name);
    const shown = spelledName(entry, name);
    const label = query ? highlightSegments(shown, matchPositions(query, shown)).map((s) => (s.match ? `<mark>${escapeHtml(s.text)}</mark>` : escapeHtml(s.text))).join('') || escapeHtml(shown) : escapeHtml(shown);
    const sig = entry ? signatureOf(entry) : '';
    const desc = entry ? shortDescription(entry, 120) : (available ? '' : 'Not available in rpl.ai');
    return `<div class="cmd-row${available ? '' : ' stub'}" data-dw="cmd" data-cmd="${escapeHtml(name)}" role="button" tabindex="0" title="Open the reference for ${escapeHtml(shown)}"><div class="nm"><span>${label}</span>${sig ? `<span class="sig">${escapeHtml(sig)}</span>` : ''}</div>${desc ? `<div class="ds">${escapeHtml(desc)}</div>` : ''}<div class="acts">${runnable ? `<button type="button" class="mini" data-dw="cmd-run" data-cmd="${escapeHtml(name)}" title="Run ${escapeHtml(name)}" aria-label="Run ${escapeHtml(name)}">${icon('play', 'sm')}</button>` : ''}</div></div>`;
  }

  // A word half typed at the cursor, as when a finger held on a completion opened this page, gives way to the whole name.
  _insertReferenced() {
    const word = isSyntaxWord(this.cat.ref) ? findReferenceEntry(this.reference, this.cat.ref)?.name ?? this.cat.ref : this.cat.ref;
    const { entry } = this.app;
    const at = wordBeforeCursor(entry.buffer, entry.cursor);
    if (at && word.toUpperCase().startsWith(hpArrows(at.word).toUpperCase())) {
      entry._dispatch({ changes: { from: at.from, to: entry.cursor, insert: '' }, selection: { anchor: at.from } });
    }
    typeSyntaxWord(entry, word);
  }

  async _renderReference(body) {
    const name = this.cat.ref;
    const entry = (await this._ensureReference()) && findReferenceEntry(this.reference, name);
    if (this.cat.ref !== name || this.current !== 'catalog') return;
    const runnable = !!lookup(name);
    const sig = entry ? signatureOf(entry) : '';
    const note = appNote(entry);
    body.innerHTML = `<div class="ref">
      <div class="ref-top"><button type="button" class="mini" data-dw="ref-back" title="Back" aria-label="Back">${icon('chl', 'sm')}</button><h4>${escapeHtml(entry?.name ?? name)}</h4>${entry?.type ? `<span class="badge">${escapeHtml(entry.type)}</span>` : ''}</div>
      ${entry ? `<div class="sum">${escapeHtml(shortDescription(entry, 400))}</div>` : ''}
      ${note ? `<div class="sum ref-app">${escapeHtml(note)}</div>` : ''}
      ${sig ? `<div><div class="lbl">Stack</div><pre class="ref-sig">${escapeHtml(entry.io.replace(/`/g, "'"))}</pre></div>` : ''}
      <div class="acts">${runnable ? `<button type="button" class="btn pri" data-dw="ref-run" data-cmd="${escapeHtml(name)}">${icon('play', 'sm')}Run ${escapeHtml(name)}</button>` : ''}${runnable || isSyntaxWord(name) ? `<button type="button" class="btn${runnable ? '' : ' pri'}" data-dw="ref-insert">Insert in the command line</button>` : `<span class="badge">Not available in rpl.ai</span>`}<button type="button" class="btn ghost" data-dw="ref-ask">${icon('spark', 'sm')}Ask about it</button></div>
      <div class="ref-doc"></div>
    </div>`;
    // Enter in the search box opened this page and took the box away, so the keyboard carries on from its first action.
    if (this.cat.focusAction) { this.cat.focusAction = false; body.querySelector('.acts .btn')?.focus(); }
    const doc = body.querySelector('.ref-doc');
    try {
      const frag = await referenceSection(name);
      if (this.cat.ref !== name) return;
      if (frag) { doc.appendChild(frag); scrollWideTables(doc); }
      else doc.innerHTML = `<p class="ref-empty">The HP 50g manual has no page for ${escapeHtml(name)}.</p>`;
    } catch (e) {
      doc.innerHTML = `<p class="ref-empty">Couldn't load the reference: ${escapeHtml(e.message)}</p>`;
    }
  }

  _renderVars(body) {
    body.innerHTML = `<div class="path-bar" data-path-bar></div><div class="dw-tools"><label class="field">${icon('search', 'sm')}<input type="search" data-q="vars" placeholder="Filter variables" aria-label="Filter variables" value="${escapeHtml(this.varsQuery)}" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"></label><button type="button" class="icon-btn sm" data-dw="vars-more" title="New folder, upload, export and back up" aria-label="New folder, upload, export and back up" aria-haspopup="menu">${icon('more', 'sm')}</button></div><div class="dw-list vr-list"></div><details class="vr-backups"><summary class="sec-h"><span>Backups<span class="badge" data-backup-count></span></span>${icon('chd', 'sm')}</summary><form class="backup-new" data-form="archive"><input type="text" name="name" placeholder="Backup name" aria-label="Backup name" spellcheck="false" autocomplete="off" autocapitalize="off" autocorrect="off" enterkeyhint="done"><span class="backup-to"><select name="port" aria-label="Port" title="Port 0 lives in this browser; ports 1–3 are separate slots">${[0, 1, 2, 3].map((p) => `<option value="${p}">:${p}:</option>`).join('')}</select><button type="submit" class="btn" title="Save the stack and HOME tree (same as :n:name ARCHIVE)">Archive</button></span></form><div class="dw-backups"></div></details>`;
    this._renderVarsList();
  }

  _renderVarsList() {
    const body = this._body();
    const bar = body?.querySelector('[data-path-bar]');
    const list = body?.querySelector('.vr-list');
    if (!bar || !list) return;
    const path = currentPath();
    bar.hidden = path.length < 2;
    bar.innerHTML = path.map((seg, i) => `${i ? '<span class="sep" aria-hidden="true">›</span>' : ''}<button type="button" data-dw="path" data-index="${i}" aria-current="${i === path.length - 1}" title="${i === path.length - 1 ? `You are in ${escapeHtml(seg)}` : `Go to ${escapeHtml(seg)}; drop a variable here to move it`}">${escapeHtml(seg)}</button>`).join('');
    const q = this.varsQuery.trim().toLowerCase();
    const entries = [...calcState.current.entries.entries()].filter(([name]) => !q || name.toLowerCase().includes(q));
    if (!entries.length) {
      list.innerHTML = `<div class="empty-note">${q ? 'No variable matches.' : 'This directory is empty. Store a value with <span class="kc">STO</span> (for example <code>42 `X` STO</code>), or upload a file.'}</div>`;
    } else {
      list.innerHTML = entries.map(([name, value]) => this._varRow(name, value)).join('');
    }
    this._renderBackups();
  }

  _varRow(name, value) {
    const isDir = value.type === TYPES.DIRECTORY;
    const n = escapeHtml(name);
    const preview = isDir ? `${value.entries.size} item${value.entries.size === 1 ? '' : 's'}` : withFractionMark(format(value));
    return `<div class="vr${isDir ? ' dir' : ''}" draggable="true" data-drag-name="${n}" data-dw="var" data-name="${n}" role="button" tabindex="0" title="${isDir ? `Open ${n}` : `${n}: ${value.type === TYPES.PROGRAM ? 'run it' : 'put it on the stack'} · Shift+Enter stores level 1 into it · Alt+Enter recalls without running`}">
      <span class="grip" aria-hidden="true">${icon('grip', 'sm')}</span>
      <div class="main"><div class="nm">${isDir ? icon('folder', 'sm') : ''}<span class="nm-text">${n}</span><span class="badge">${escapeHtml(isDir ? 'Folder' : typeName(value))}</span></div><div class="pv">${escapeHtml(preview.length > 120 ? `${preview.slice(0, 119)}…` : preview)}</div></div>
      <div class="acts"><button type="button" class="mini" data-dw="var-menu" data-name="${n}" title="${isDir ? 'Open' : 'Edit'}, rename, download or delete ${n}" aria-label="More for ${n}" aria-haspopup="menu">${icon('more', 'sm')}</button></div>
    </div>`;
  }

  _renderBackups() {
    const wrap = this._body()?.querySelector('.dw-backups');
    const count = this._body()?.querySelector('[data-backup-count]');
    if (!wrap) return;
    let backups = [];
    let unavailable = '';
    try { backups = listBackups(); } catch (e) { unavailable = e.message; }
    if (count) count.textContent = backups.length ? String(backups.length) : '';
    wrap.innerHTML = unavailable || !backups.length
      ? `<div class="empty-note">${escapeHtml(unavailable || 'No backups yet. Name one above, or run :0:name ARCHIVE.')}</div>`
      : backups.map(({ port, name, savedAt, depth }) => {
        const key = escapeHtml(`${port}:${name}`);
        return `<div class="vr" data-dw="backup-restore" data-key="${key}" role="button" tabindex="0" title="Restore :${key} (replaces the stack and HOME tree; undoable)"><span class="grip" aria-hidden="true">${icon('clock', 'sm')}</span><div class="main"><div class="nm"><span class="nm-text">:${key}</span></div><div class="pv">${depth} level${depth === 1 ? '' : 's'} · <span class="when">${escapeHtml(new Date(savedAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }))}</span></div></div><div class="acts"><button type="button" class="mini" data-dw="backup-save" data-key="${key}" title="Save :${key} as a file (Restore from file reads it back)" aria-label="Save backup :${key} as a file">${icon('down', 'sm')}</button><button type="button" class="mini danger" data-dw="backup-delete" data-key="${key}" title="Delete :${key}" aria-label="Delete backup :${key}">${icon('trash', 'sm')}</button></div></div>`;
      }).join('');
  }

  _renderHistory(body) {
    body.innerHTML = `<div class="dw-tools"><label class="field">${icon('search', 'sm')}<input type="search" data-q="history" placeholder="Filter history" aria-label="Filter history" value="${escapeHtml(this.historyQuery)}" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"></label></div><div class="dw-list"></div>`;
    this._renderHistoryList();
  }

  _renderHistoryList() {
    const list = this._body()?.querySelector('.dw-list');
    if (!list) return;
    const { entry } = this.app;
    const q = this.historyQuery.trim().toLowerCase();
    const hist = entry.getHistory();
    const ordered = this.prefs.historySort === 'newest' ? hist.slice().reverse() : hist.slice();
    const rows = ordered.filter((s) => !q || s.toLowerCase().includes(q));
    const errors = entry.getErrorLog().slice().reverse().filter((e) => !q || `${e.message} ${e.input}`.toLowerCase().includes(q));
    const errHtml = errors.length
      ? `<div class="sec-h">Errors<button type="button" data-dw="errors-clear">Clear</button></div>${errors.map((e) => `<div class="hr err"${e.input ? ` data-dw="hist-recall" data-text="${escapeHtml(e.input)}" role="button" tabindex="0" title="Put it back in the command line"` : ''}><div class="in-t">${escapeHtml(e.input || e.message)}</div><div class="out">${e.input ? `${escapeHtml(e.message)} · ` : ''}${escapeHtml(new Date(e.at).toLocaleTimeString())}</div><div class="acts">${e.input ? `<button type="button" class="mini" data-dw="hist-recall" data-text="${escapeHtml(e.input)}" title="Recall" aria-label="Recall">${icon('undo', 'sm')}</button>` : ''}<button type="button" class="mini" data-dw="err-explain" data-text="${escapeHtml(`${e.input ? `${e.input}: ` : ''}${e.message}`)}" title="Ask the assistant what went wrong" aria-label="Explain">${icon('spark', 'sm')}</button></div></div>`).join('')}`
      : '';
    const histHtml = rows.length
      ? `<div class="sec-h">Entries</div>${rows.map((t) => `<div class="hr" data-dw="hist-recall" data-text="${escapeHtml(t)}" role="button" tabindex="0" title="Put it back in the command line"><div class="in-t">${escapeHtml(t)}</div><div class="acts"><button type="button" class="mini" data-dw="hist-run" data-text="${escapeHtml(t)}" title="Run it again" aria-label="Run again">${icon('play', 'sm')}</button><button type="button" class="mini danger" data-dw="hist-delete" data-text="${escapeHtml(t)}" title="Delete" aria-label="Delete">${icon('x', 'sm')}</button></div></div>`).join('')}`
      : `<div class="empty-note">${hist.length ? 'No entry matches.' : 'Everything you enter shows up here, ready to recall or run again.'}</div>`;
    list.innerHTML = errHtml + histHtml;
  }

  _renderChars(body) {
    body.innerHTML = `<div class="dw-tools"><label class="field">${icon('search', 'sm')}<input type="search" data-q="chars" placeholder="Filter characters and constants" aria-label="Filter characters" value="${escapeHtml(this.charsQuery)}" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"></label></div><div class="dw-list"></div>`;
    this._renderCharsList();
  }

  _renderCharsList() {
    const list = this._body()?.querySelector('.dw-list');
    if (!list) return;
    const q = this.charsQuery.trim().toLowerCase();
    const html = Object.entries(CHAR_GROUPS).map(([group, items]) => {
      const matches = items.filter(([label, , title]) => !q || `${label} ${title ?? ''}`.toLowerCase().includes(q));
      if (!matches.length) return '';
      return `<div class="sec-h">${escapeHtml(group)}</div><div class="cgrid">${matches.map(([label, text, title]) => `<button type="button" data-dw="char" data-text="${escapeHtml(text)}" title="${escapeHtml(title ?? label)}"><b>${escapeHtml(label)}</b><span>${escapeHtml(charCaption(title))}</span></button>`).join('')}</div>`;
    }).join('');
    list.innerHTML = html || '<div class="empty-note">No character matches.</div>';
  }

  _onInput(e) {
    const q = e.target.closest?.('[data-q]');
    if (!q) return;
    const value = q.value;
    if (q.dataset.q === 'cat') { this.cat.q = value; this._renderCatalogList(); }
    else if (q.dataset.q === 'vars') { this.varsQuery = value; this._renderVarsList(); }
    else if (q.dataset.q === 'history') { this.historyQuery = value; this._renderHistoryList(); }
    else if (q.dataset.q === 'chars') { this.charsQuery = value; this._renderCharsList(); }
  }

  _onKeyDown(e) {
    const q = e.target.closest?.('[data-q]');
    if (q && e.key === 'Escape') {
      if (q.value) { q.value = ''; q.dispatchEvent(new Event('input', { bubbles: true })); e.stopPropagation(); e.preventDefault(); }
      return;
    }
    if (q && e.key === 'Enter' && q.dataset.q === 'cat') {
      const first = this._body()?.querySelector('.cmd-row');
      if (first) { e.preventDefault(); this.cat.focusAction = true; this.showReference(first.dataset.cmd); }
      return;
    }
    // As the HP's ← and → shifted VAR keys store and recall, and Shift+F1 and Alt+F1 do on the soft keys.
    if (e.key === 'Enter' && (e.shiftKey || e.altKey) && e.target.matches?.('.vr[data-dw="var"]:not(.dir)')) {
      e.preventDefault();
      this.app.pressVariable(e.target.dataset.name, e.shiftKey ? 'L' : 'R');
      return;
    }
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('[role="button"][data-dw]')) {
      e.preventDefault();
      e.target.click();
    }
  }

  _onSubmit(e) {
    const form = e.target.closest('[data-form="archive"]');
    if (!form) return;
    e.preventDefault();
    const name = form.elements.name.value.trim();
    const port = form.elements.port.value;
    if (!this._archive(port, name)) return;
    // The phone keyboard's Done goes with the name, so the new backup's row shows where the keyboard was.
    form.elements.name.value = '';
    form.elements.name.blur();
  }

  _archive(port, name) {
    const { app } = this;
    if (!isStorableHpName(name)) { app.notifyError(`Backups need a variable-style name; “${name}” isn't one.`); return false; }
    try {
      const exists = listBackups().some((b) => b.port === port && b.name === name);
      archiveBackup(port, name, app.stack);
      app.toast(`${exists ? 'Replaced' : 'Archived'} :${port}:${name}`);
      return true;
    } catch (e) {
      app.notifyError(`Archive failed: ${e.message}`);
      return false;
    } finally {
      this._renderBackups();
    }
  }

  _onClick(e) {
    const t = e.target.closest('[data-dw]');
    const link = e.target.closest('.cmd-help-link');
    if (link && this.el.contains(link)) { e.preventDefault(); this.showReference(link.dataset.cmd); return; }
    if (!t || !this.el.contains(t)) return;
    const { app } = this;
    const { entry } = app;
    const act = t.dataset.dw;
    const name = t.dataset.name;
    switch (act) {
      case 'close': this.close(); return;
      case 'tab': this.open(t.dataset.drawerTab); return;
      case 'wide': app.setPrefs({ drawerWide: !this.prefs.drawerWide }); this.render(); return;
      case 'dock': app.runAction('panels.side'); return;
      case 'plot-focus': app.setPlotFocus(!app.plotFocus); return;
      case 'as-mode': app.setAssistantMode(t.dataset.mode); return;
      case 'plot-full': this.graph.fullscreen(); return;
      case 'hist-sort': app.setPrefs({ historySort: this.prefs.historySort === 'newest' ? 'oldest' : 'newest' }); this.render(); return;
      case 'hist-clear': entry.clearHistory(); this._renderHistoryList(); app.toast('Cleared the history'); return;
      case 'cat-family': this.cat.family = t.dataset.family; this._renderCatalogList(); this._body().scrollTop = 0; return;
      case 'cat-back': this.cat.family = null; this._renderCatalogList(); return;
      case 'cmd': this.showReference(t.dataset.cmd); return;
      case 'cmd-run': e.stopPropagation(); app.runCommandFromUI(t.dataset.cmd); this._reveal(); return;
      case 'unit': this._insertWithMore(`_${t.dataset.unit}`, () => app.insertUnit(t.dataset.unit), `[data-dw="unit"][data-unit="${CSS.escape(t.dataset.unit)}"]`); return;
      case 'ref-back':
        if (this.cat.idx > 0) { this.cat.idx -= 1; this.cat.ref = this.cat.history[this.cat.idx]; }
        else { this.cat.ref = null; this.cat.history = []; this.cat.idx = -1; }
        this._renderBody();
        return;
      case 'ref-run': app.runCommandFromUI(this.cat.ref); this._reveal(); return;
      case 'ref-insert': this._insertReferenced(); this._reveal(); return;
      case 'ref-ask': app.askAssistant(`Explain the ${this.cat.ref} command: what it takes from the stack, what it returns, and a short example I can try.`); return;
      case 'char': this._insertWithMore(t.dataset.text, () => this.insertText(t.dataset.text), `[data-dw="char"][data-text="${CSS.escape(t.dataset.text)}"]`); return;
      case 'hist-recall': app.recallLine(t.dataset.text, 'the line from History'); this._reveal(); return;
      case 'hist-run': e.stopPropagation(); app.recallLine(t.dataset.text, 'the line from History'); app.commitEntry(); this._reveal(); return;
      case 'hist-delete': e.stopPropagation(); entry.removeHistory(t.dataset.text); this._renderHistoryList(); return;
      case 'errors-clear': entry.clearErrorLog(); this._renderHistoryList(); return;
      case 'err-explain': e.stopPropagation(); app.askAssistant(`I got this error on the calculator: ${t.dataset.text}. What went wrong and how do I fix it?`); return;
      case 'path': app.navigateToPathSegment(Number(t.dataset.index)); return;
      case 'var': this._activateVar(name); return;
      case 'var-menu': e.stopPropagation(); this._varMenu(t, name); return;
      case 'vars-more': this._varsMenu(t); return;
      case 'backup-restore': this._restoreBackup(t.dataset.key); return;
      case 'backup-save': e.stopPropagation(); this._saveBackup(t.dataset.key); return;
      case 'backup-delete': e.stopPropagation(); this._deleteBackup(t.dataset.key); return;
    }
  }

  // A variable's actions wait in one menu, so its row shows just the name and value; a tap on the row still recalls or runs it.
  _varMenu(anchor, name) {
    const isDir = calcState.current.entries.get(name)?.type === TYPES.DIRECTORY;
    const html = `<h6>${escapeHtml(name)}</h6>${isDir ? menuItem('open', 'chr', 'Open') : menuItem('edit', 'edit', 'Edit')}${menuItem('rename', 'rename', 'Rename')}${menuItem('download', 'down', 'Download as…')}<hr>${menuItem('delete', 'trash', 'Delete')}`;
    this._openMenu(anchor, html, name, (act) => {
      if (act === 'open') this._activateVar(name);
      else if (act === 'edit') { this.app.editVariable(name); this._reveal(); }
      else if (act === 'rename') this._beginRename(anchor.closest('.vr'), name);
      else if (act === 'download') this.app.downloadMenu(anchor, name, calcState.current.entries.get(name));
      else if (act === 'delete') this._deleteVar(name);
    });
  }

  _varsMenu(anchor) {
    const html = `${menuItem('newdir', 'folder', 'New folder')}${menuItem('upload', 'up', 'Upload files…', '.csv .tsv .xlsx .rpl .json')}${menuItem('export-rpl', 'down', 'Export this folder', '.rpl')}<hr>${menuItem('export', 'down', 'Back up everything', '.json')}${menuItem('import', 'up', 'Restore from a backup file…')}`;
    this._openMenu(anchor, html, 'Variables', (act) => {
      if (act === 'newdir') this._newFolder(anchor);
      else if (act === 'upload') this._upload();
      else if (act === 'export-rpl') this._exportRpl();
      else if (act === 'export') this.app.exportSnapshot();
      else if (act === 'import') this._import();
    });
  }

  _openMenu(anchor, html, label, run) {
    this.app.popover.open(anchor, html, { label, onClick: (b) => { this.app.popover.close({ restoreFocus: false }); run(b.dataset.act); } });
  }

  _activateVar(name) {
    const { app } = this;
    const value = calcState.current.entries.get(name);
    if (value === undefined) return;
    if (value.type === TYPES.DIRECTORY) {
      if (app.entry.buffer.trim()) app.commitEntry();
      goInto(name);
      return;
    }
    if (app.entry.isAlgebraic()) app.entry.type(name);
    else app.pressVariable(name);
    this._reveal();
  }

  // Like the HP's ECHO, More brings the drawer back where the pick was made, for the next one.
  _insertWithMore(label, insert, selector) {
    const drawer = this.current;
    const typed = insert();
    if (!this._reveal()) return;
    this.app.toast(`Added ${typed || label}`, { action: 'More', key: 'drawer', onAction: () => {
      this.open(drawer);
      this.el.querySelector(selector)?.scrollIntoView({ block: 'center' });
    } });
  }

  _deleteVar(name) {
    const { app } = this;
    const v = calcState.current.entries.get(name);
    if (v === undefined) return;
    app.entry._snapForUndo();
    try {
      varPurge(name);
      app.undoToast(`Deleted ${name}`);
    } catch (e) {
      app.entry._dropNoOpUndoStep();
      app.notifyError(v.type === TYPES.DIRECTORY
        ? `${name} isn't empty. Open it and delete what's inside first (HP PURGE works the same way).`
        : `Couldn't delete ${name}: ${e.message}`);
    }
  }

  _newFolder(anchor) {
    const { app } = this;
    const html = `<form data-newdir><h6>New folder</h6><div style="padding:4px 6px 6px"><input type="text" name="name" placeholder="Name, like PROJECTS" aria-label="Folder name" spellcheck="false" autocomplete="off" autocapitalize="off" autocorrect="off" enterkeyhint="done" class="pop-name"></div><div class="note">Same as <code>\`NAME\` CRDIR</code>.</div><div style="display:flex;justify-content:flex-end;gap:6px;padding:6px"><button type="submit" class="btn pri">Create</button></div></form>`;
    const pop = app.popover.open(anchor, html, { label: 'New folder' });
    const form = pop.querySelector('form');
    requestAnimationFrame(() => form.elements.name.focus());
    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const dir = form.elements.name.value.trim();
      if (!isStorableHpName(dir)) { app.notifyError(`“${dir}” isn't a valid name. Use letters and digits, starting with a letter.`); return; }
      app.entry._snapForUndo();
      try { makeSubdir(dir); app.popover.close(); app.undoToast(`Created ${dir}`); }
      catch (err) { app.entry._dropNoOpUndoStep(); app.notifyError(err.message); }
    });
  }

  _upload() {
    pickFiles(UPLOAD_ACCEPT, (files) => this.app.storeFiles(files, null, 'Added'));
  }

  _exportRpl() {
    const dir = calcState.current;
    try { this.app.toast(`Saved ${exportHpTextFile(dir.name, dir)}`); }
    catch (e) { this.app.notifyError(`Export failed: ${e.message}`); }
  }

  _import() {
    pickFile('application/json,.json', async (file) => { if (await this.app.importSnapshotFromFile(file)) this._reveal(); });
  }

  _restoreBackup(key) {
    const { app } = this;
    const sep = key.indexOf(':');
    const port = key.slice(0, sep);
    const name = key.slice(sep + 1);
    app.entry._snapForUndo();
    try {
      restoreBackup(port, name, app.stack);
      app.undoToast(`Restored :${key}`);
      this._reveal();
    } catch (e) {
      app.entry._dropNoOpUndoStep();
      app.notifyError(`Restore failed: ${e.message}`);
    }
  }

  _saveBackup(key) {
    const sep = key.indexOf(':');
    try { this.app.toast(`Saved ${exportBackup(key.slice(0, sep), key.slice(sep + 1))}`); }
    catch (e) { this.app.notifyError(`Save failed: ${e.message}`); }
  }

  _deleteBackup(key) {
    const sep = key.indexOf(':');
    const port = key.slice(0, sep);
    const name = key.slice(sep + 1);
    try {
      const backup = deleteBackup(port, name);
      this.app.toast(`Deleted backup :${key}`, { key: 'backup-delete', action: 'Undo', onAction: () => putBackBackup(port, name, backup) });
    } catch (e) {
      this.app.notifyError(`Delete failed: ${e.message}`);
    }
    this._renderBackups();
  }

  _beginRename(row, oldName) {
    const nameEl = row?.querySelector('.nm-text');
    if (!nameEl || row.classList.contains('editing')) return;
    row.classList.add('editing');
    row.draggable = false;
    const input = document.createElement('input');
    input.type = 'text';
    input.value = oldName;
    input.spellcheck = false;
    input.autocomplete = 'off';
    input.autocapitalize = 'off';
    input.setAttribute('autocorrect', 'off');
    input.enterKeyHint = 'done';
    input.setAttribute('aria-label', `New name for ${oldName}`);
    nameEl.replaceWith(input);
    input.focus();
    input.select();
    let done = false;
    const finish = (commit) => {
      if (done) return;
      done = true;
      const next = input.value.trim();
      if (commit && next && next !== oldName) {
        if (!isStorableHpName(next)) { this.app.notifyError(`“${next}” isn't a valid name.`); this._renderVarsList(); return; }
        this.app.entry._snapForUndo();
        try { renameCurrentEntry(oldName, next); return; }
        catch (e) { this.app.entry._dropNoOpUndoStep(); this.app.notifyError(`Rename failed: ${e.message}`); }
      }
      this._renderVarsList();
    };
    input.addEventListener('click', (ev) => ev.stopPropagation());
    input.addEventListener('keydown', (ev) => {
      ev.stopPropagation();
      if (ev.key === 'Enter') { ev.preventDefault(); finish(true); }
      else if (ev.key === 'Escape') { ev.preventDefault(); finish(false); }
    });
    input.addEventListener('blur', () => finish(true));
  }

  _bindVarsDrag() {
    const el = this.el;
    const clearMarks = () => el.querySelectorAll('.drop-before, .drop-after, .drop-into, .drop-end').forEach((n) => n.classList.remove('drop-before', 'drop-after', 'drop-into', 'drop-end'));
    const clear = () => { clearMarks(); el.querySelectorAll('.dragging').forEach((n) => n.classList.remove('dragging')); };
    const mark = (target) => { clearMarks(); target?.el.classList.add(`drop-${target.zone}`); };
    const targetAt = (node, y) => {
      const crumb = node?.closest?.('.path-bar button[data-index]');
      if (crumb && crumb.getAttribute('aria-current') !== 'true') return { kind: 'crumb', index: Number(crumb.dataset.index), el: crumb, zone: 'into' };
      const row = node?.closest?.('.vr[data-drag-name]');
      if (row) {
        const name = row.dataset.dragName;
        if (name === this._dragName) return null;
        const rect = row.getBoundingClientRect();
        const zone = dropZoneForFraction(rect.height ? (y - rect.top) / rect.height : 0.5, row.classList.contains('dir'));
        return { kind: zone === 'into' ? 'into' : 'reorder', name, zone, el: row };
      }
      const list = node?.closest?.('.vr-list');
      return list ? { kind: 'end', el: list, zone: 'end' } : null;
    };
    el.addEventListener('dragstart', (ev) => {
      const row = ev.target.closest?.('.vr[data-drag-name]');
      if (!row) return;
      if (this._dragName) { ev.preventDefault(); return; }
      this._dragName = row.dataset.dragName;
      row.classList.add('dragging');
      try { ev.dataTransfer.setData('text/plain', this._dragName); ev.dataTransfer.effectAllowed = 'move'; }
      catch { /* setData can throw outside a trusted drag */ }
    });
    el.addEventListener('dragend', () => { this._dragName = null; clear(); });
    el.addEventListener('dragover', (ev) => {
      if (!this._dragName) return;
      const target = targetAt(ev.target, ev.clientY);
      mark(target);
      if (target) ev.preventDefault();
    });
    el.addEventListener('drop', (ev) => {
      if (!this._dragName) return;
      ev.preventDefault();
      const target = targetAt(ev.target, ev.clientY);
      const name = this._dragName;
      this._dragName = null;
      clear();
      if (target) this._performDrop(name, target);
    });
    this._bindVarsTouchDrag(targetAt, mark, clear);
  }

  // A finger drags a variable by its grip at once, or by the rest of the row after a hold, since a plain swipe scrolls the list.
  _bindVarsTouchDrag(targetAt, mark, clear) {
    const el = this.el;
    let touch = null;
    const end = () => { clearTimeout(touch?.timer); cancelAnimationFrame(touch?.raf); touch = null; };
    const begin = () => {
      touch.active = true;
      this._dragName = touch.name;
      touch.row.classList.add('dragging');
    };
    const aim = () => {
      touch.target = targetAt(document.elementFromPoint(touch.x, touch.y), touch.y);
      mark(touch.target);
    };
    // A finger held near the drawer's top or bottom edge scrolls the list, so a folder or crumb out of view can be reached.
    const scroll = () => {
      touch.raf = 0;
      const box = touch.scroller.getBoundingClientRect();
      const step = touch.y < box.top + 40 ? -8 : touch.y > box.bottom - 40 ? 8 : 0;
      const before = touch.scroller.scrollTop;
      touch.scroller.scrollTop += step;
      if (touch.scroller.scrollTop === before) return;
      aim();
      touch.raf = requestAnimationFrame(scroll);
    };
    el.addEventListener('touchstart', (ev) => {
      end();
      const row = ev.touches.length === 1 && !ev.target.closest('.acts') && ev.target.closest('.vr[data-drag-name]:not(.editing)');
      if (!row) return;
      const { clientX: x, clientY: y } = ev.touches[0];
      touch = { row, name: row.dataset.dragName, scroller: row.closest('.dw-body') ?? row.parentElement, x0: x, y0: y, x, y, active: false, target: null, raf: 0 };
      if (ev.target.closest('.grip')) begin();
      else touch.timer = setTimeout(() => { this.app.buzzHold(); begin(); }, LONG_PRESS_MS);
    }, { passive: true });
    el.addEventListener('touchmove', (ev) => {
      if (!touch) return;
      const { clientX: x, clientY: y } = ev.touches[0];
      if (!touch.active) {
        if (Math.hypot(x - touch.x0, y - touch.y0) > 10) end();
        return;
      }
      ev.preventDefault();
      Object.assign(touch, { x, y });
      aim();
      if (!touch.raf) scroll();
    }, { passive: false });
    el.addEventListener('touchend', (ev) => {
      if (!touch?.active) { end(); return; }
      ev.preventDefault();
      const { name, target } = touch;
      end();
      this._dragName = null;
      clear();
      if (target) this._performDrop(name, target);
    });
    el.addEventListener('touchcancel', () => {
      if (touch?.active) { this._dragName = null; clear(); }
      end();
    });
    el.addEventListener('contextmenu', (ev) => { if (touch) ev.preventDefault(); });
  }

  _performDrop(name, target) {
    const { app } = this;
    app.entry._snapForUndo();
    try {
      if (target.kind === 'crumb') {
        const dir = getDirectoryByPath(currentPath().slice(0, target.index + 1));
        if (!dir) throw new Error('that folder no longer exists');
        moveCurrentEntry(name, dir);
      } else if (target.kind === 'into') {
        moveCurrentEntry(name, calcState.current.entries.get(target.name));
      } else if (target.kind === 'reorder') {
        let before = target.name;
        if (target.zone === 'after') {
          const keys = [...calcState.current.entries.keys()];
          before = keys[keys.indexOf(target.name) + 1] ?? null;
        }
        reorderCurrentEntry(name, before);
      } else {
        reorderCurrentEntry(name, null);
      }
    } catch (e) {
      app.entry._dropNoOpUndoStep();
      app.notifyError(`Move failed: ${e.message}`);
    }
  }

  // On a phone the drawer is a bottom sheet: dragging its top row down closes it, as sheets do.
  _bindSheetDrag() {
    let drag = null;
    let dragged = false;
    this.el.addEventListener('pointerdown', (ev) => {
      dragged = false;
      const axis = ev.pointerType === 'touch' && ev.isPrimary ? this._dragAxis(ev.target) : null;
      drag = axis ? { axis, id: ev.pointerId, x: ev.clientX, y: ev.clientY, d: 0, active: false } : null;
    });
    this.el.addEventListener('pointermove', (ev) => {
      if (drag?.id !== ev.pointerId) return;
      const [along, across] = drag.axis === 'y'
        ? [ev.clientY - drag.y, ev.clientX - drag.x]
        : [ev.clientX - drag.x, ev.clientY - drag.y];
      if (!drag.active) {
        if (Math.abs(across) > 10) { drag = null; return; }
        if (along < 10) return;
        drag.active = true;
        this.el.setPointerCapture?.(ev.pointerId);
        this.el.style.transition = 'none';
      }
      drag.d = Math.max(0, along);
      this.el.style.transform = `translate${drag.axis.toUpperCase()}(${drag.d}px)`;
    });
    const end = (ev) => {
      if (drag?.id !== ev.pointerId) return;
      const { axis, active, d } = drag;
      drag = null;
      if (!active) return;
      dragged = true;
      const from = this.el.style.transform;
      this.el.style.transition = '';
      this.el.style.transform = '';
      const size = axis === 'y' ? this.el.offsetHeight : this.el.offsetWidth;
      if (ev.type === 'pointerup' && d > Math.min(120, size / 4)) this.close();
      else this.el.animate?.([{ transform: from }, { transform: 'none' }], { duration: 180, easing: 'ease-out' });
    };
    this.el.addEventListener('pointerup', end);
    this.el.addEventListener('pointercancel', end);
    this.el.addEventListener('click', (ev) => {
      if (!dragged) return;
      dragged = false;
      ev.preventDefault();
      ev.stopPropagation();
    }, true);
  }

  // A bottom sheet drags down by its top row. Minimal view's side panel drags right by its title and buttons only, since its tabs scroll sideways.
  _dragAxis(target) {
    if (this.el.offsetTop > 0) return target.closest('.dw-top') ? 'y' : null;
    const sidePanel = document.documentElement.dataset.view === 'minimal' && this.el.offsetLeft > 0;
    return sidePanel && target.closest('.dw-head') ? 'x' : null;
  }

  _bindGrip(grip) {
    if (!grip) return;
    grip.addEventListener('pointerdown', (ev) => {
      if (ev.button !== 0) return;
      ev.preventDefault();
      const startX = ev.clientX;
      const startW = this.el.getBoundingClientRect().width;
      const growsLeft = document.documentElement.dataset.view === 'minimal' || this.prefs.panelsSide === 'right';
      grip.classList.add('dragging');
      grip.setPointerCapture?.(ev.pointerId);
      const move = (e) => {
        const w = Math.max(DRAWER_MIN_WIDTH, Math.min(DRAWER_MAX_WIDTH, startW + (e.clientX - startX) * (growsLeft ? -1 : 1)));
        this.el.style.setProperty('--drawer-w', `${w}px`);
      };
      const up = () => {
        grip.classList.remove('dragging');
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        this.app.setPrefs({ drawerWidth: Math.round(this.el.getBoundingClientRect().width), drawerWide: false });
        this._graph?.resize();
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    });
    grip.addEventListener('dblclick', () => {
      this.el.style.removeProperty('--drawer-w');
      this.app.setPrefs({ drawerWidth: null });
    });
  }
}
